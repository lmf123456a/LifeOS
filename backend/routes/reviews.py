"""费曼复盘：卡片 CRUD + AI 生成讲解任务 + AI 点评。"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException

from .. import database
from ..services import ai, feynman, srs

router = APIRouter(prefix="/api/cards", tags=["cards"])

STATUSES = ("pending", "needs_work", "reviewing", "mastered")


@router.get("")
def list_cards(status: str = "", due: int = 0, q: str = ""):
    sql = "SELECT * FROM cards WHERE 1=1"
    params: list = []
    if status:
        sql += " AND status = ?"
        params.append(status)
    if due:
        sql += " AND status IN ('pending','needs_work','reviewing') AND due_date <= ?"
        params.append(date.today().isoformat())
    if q:
        sql += " AND title LIKE ?"
        params.append(f"%{q}%")
    sql += " ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'needs_work' THEN 1 WHEN 'reviewing' THEN 2 ELSE 3 END, due_date ASC, id DESC"
    return database.query(sql, tuple(params))


@router.get("/due")
def due_cards():
    return database.query(
        """SELECT * FROM cards
           WHERE status IN ('pending','needs_work','reviewing') AND due_date <= ?
           ORDER BY due_date ASC, id DESC""",
        (date.today().isoformat(),),
    )


@router.get("/{cid}")
def get_card(cid: int):
    card = database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))
    if not card:
        raise HTTPException(404, "复盘卡片不存在")
    card["explanations"] = database.query(
        "SELECT * FROM explanations WHERE card_id = ? ORDER BY id DESC", (cid,)
    )
    return card


@router.post("")
def create_card(body: dict):
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "复盘标题不能为空")
    cid = database.execute(
        """INSERT INTO cards (title, source_content, note_id)
           VALUES (?, ?, ?)""",
        (title, body.get("source_content", ""), body.get("note_id") or None),
    )
    return database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))


@router.post("/{cid}/generate")
def generate_task(cid: int):
    """AI 根据学习内容生成费曼讲解任务。"""
    card = database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))
    if not card:
        raise HTTPException(404, "复盘卡片不存在")
    content = card["source_content"] or card["title"]
    profile = database.get_setting("profile", "")
    text = ai.chat(
        [{"role": "user", "content": feynman.build_generate_prompt(content, profile)}],
        temperature=0.6,
        max_tokens=1500,
    )
    parsed = feynman.parse_generate(text)
    database.execute(
        """UPDATE cards SET key_points=?, explain_prompt=?, pitfalls=?,
           status='pending' WHERE id=?""",
        (parsed["key_points"], parsed["explain_prompt"], parsed["pitfalls"], cid),
    )
    return database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))


@router.post("/{cid}/explain")
def submit_explanation(cid: int, body: dict):
    """提交讲解：先保存讲解内容（不丢），再调 AI 点评，按结果更新卡片。"""
    card = database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))
    if not card:
        raise HTTPException(404, "复盘卡片不存在")
    explanation = (body.get("content") or "").strip()
    if not explanation:
        raise HTTPException(400, "请先写下你的讲解")

    # 1) 讲解先落库（即使 AI 失败也不丢用户的辛苦输入）
    database.execute(
        "INSERT INTO explanations (card_id, content) VALUES (?, ?)", (cid, explanation)
    )

    # 2) 调 AI 点评
    topic = card["explain_prompt"] or card["title"]
    profile = database.get_setting("profile", "")
    try:
        text = ai.chat(
            [{"role": "user", "content": feynman.build_evaluate_prompt(topic, explanation, profile)}],
            temperature=0.4,
            max_tokens=1500,
        )
        parsed = feynman.parse_evaluate(text)
    except (ai.AIError, Exception) as e:
        raise HTTPException(502, f"AI 点评失败，你的讲解已保存，可稍后重试：{e}") from e

    verdict = parsed["verdict"]
    total = parsed["scores"].get("总分", 0) or 0

    # 3) 回填点评结果
    database.execute(
        """UPDATE explanations SET ai_feedback=?, score=?, verdict=?
           WHERE id=(SELECT MAX(id) FROM explanations WHERE card_id=?)""",
        (text, total, verdict, cid),
    )

    # 4) 按 SRS 排程更新卡片（只有 pass 才推进复习计数）
    plan = srs.apply_review(card, verdict, total)
    database.execute(
        """UPDATE cards SET status=?, interval_days=?, due_date=?,
           review_count=?, best_score=?, last_reviewed_at=datetime('now','localtime')
           WHERE id=?""",
        (plan["status"], plan["interval_days"], plan["due_date"],
         plan["review_count"], plan["best_score"], cid),
    )

    card = database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))
    card["explanations"] = database.query(
        "SELECT * FROM explanations WHERE card_id = ? ORDER BY id DESC", (cid,)
    )
    return {"card": card, "evaluation": parsed}


@router.put("/{cid}")
def update_card(cid: int, body: dict):
    card = database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))
    if not card:
        raise HTTPException(404, "复盘卡片不存在")
    database.execute(
        "UPDATE cards SET title=?, source_content=?, note_id=? WHERE id=?",
        (
            body.get("title", card["title"]),
            body.get("source_content", card["source_content"]),
            body.get("note_id", card["note_id"]),
            cid,
        ),
    )
    return database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))


@router.post("/{cid}/master")
def mark_mastered(cid: int):
    card = database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))
    if not card:
        raise HTTPException(404, "复盘卡片不存在")
    database.execute("UPDATE cards SET status='mastered' WHERE id=?", (cid,))
    return database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))


@router.post("/{cid}/reactivate")
def reactivate(cid: int):
    """已掌握/过期卡片重新进入复习队列。"""
    card = database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))
    if not card:
        raise HTTPException(404, "复盘卡片不存在")
    database.execute(
        "UPDATE cards SET status='reviewing', due_date=? WHERE id=?",
        (date.today().isoformat(), cid),
    )
    return database.query_one("SELECT * FROM cards WHERE id = ?", (cid,))


@router.delete("/{cid}")
def delete_card(cid: int):
    database.execute("DELETE FROM cards WHERE id = ?", (cid,))
    return {"ok": True}
