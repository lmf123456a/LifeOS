"""反思总结：日 / 月 / 年。"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException

from .. import database

router = APIRouter(prefix="/api/reflections", tags=["reflections"])

TYPES = ("day", "month", "year")


def _period_for(t: str) -> str:
    today = date.today()
    if t == "day":
        return today.isoformat()
    if t == "month":
        return today.isoformat()[:7]
    return today.isoformat()[:4]


@router.get("")
def get_reflection(type: str = "day", period: str = ""):
    if type not in TYPES:
        raise HTTPException(400, "类型必须是 day/month/year")
    period = period or _period_for(type)
    row = database.query_one(
        "SELECT * FROM reflections WHERE type=? AND period=?", (type, period)
    )
    if row:
        row["exists"] = True
        return row
    return {"type": type, "period": period, "title": "", "content": "", "rating": 0, "exists": False}


@router.put("")
def save_reflection(body: dict):
    type = body.get("type", "day")
    if type not in TYPES:
        raise HTTPException(400, "类型必须是 day/month/year")
    period = (body.get("period") or _period_for(type)).strip()
    try:
        rating = int(body.get("rating", 0) or 0)
    except (TypeError, ValueError):
        rating = 0
    rating = max(0, min(5, rating))
    database.execute(
        """INSERT INTO reflections (type, period, title, content, rating)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(type, period) DO UPDATE SET
             title=excluded.title, content=excluded.content, rating=excluded.rating,
             updated_at=datetime('now','localtime')""",
        (type, period, (body.get("title") or "").strip(), body.get("content", ""), rating),
    )
    row = database.query_one(
        "SELECT * FROM reflections WHERE type=? AND period=?", (type, period)
    )
    row["exists"] = True
    return row


@router.get("/history")
def history(type: str = "day", limit: int = 60):
    if type not in TYPES:
        raise HTTPException(400, "类型必须是 day/month/year")
    return database.query(
        """SELECT id, type, period, rating, substr(content, 1, 60) AS excerpt, updated_at
           FROM reflections WHERE type=? ORDER BY period DESC LIMIT ?""",
        (type, int(limit)),
    )


@router.delete("/{rid}")
def delete_reflection(rid: int):
    database.execute("DELETE FROM reflections WHERE id=?", (rid,))
    return {"ok": True}


@router.get("/day-data")
def day_data(date_str: str = ""):
    """某天的数据回顾条：任务/习惯/笔记完成情况。"""
    d = date_str or date.today().isoformat()
    tasks = database.query("SELECT status FROM tasks WHERE due_date=?", (d,))
    tasks_done = sum(1 for t in tasks if t["status"] == "done")
    habits = database.query("SELECT * FROM habits WHERE archived=0")
    habits_done = sum(
        1
        for h in habits
        if database.query_one(
            "SELECT 1 FROM habit_logs WHERE habit_id=? AND log_date=?", (h["id"], d)
        )
    )
    notes_created = database.query_one(
        "SELECT COUNT(*) AS n FROM notes WHERE date(created_at)=?", (d,)
    )["n"]
    return {
        "date": d,
        "tasks_total": len(tasks),
        "tasks_done": tasks_done,
        "habits_total": len(habits),
        "habits_done": habits_done,
        "notes_created": notes_created,
    }
