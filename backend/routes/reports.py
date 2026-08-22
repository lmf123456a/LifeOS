"""周/月总结 + 今日概览。"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter

from .. import database
from ..services import ai, feynman

router = APIRouter(prefix="/api", tags=["reports"])

WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]


def _stats(range_days: int) -> dict:
    today = date.today()
    start = today - timedelta(days=range_days - 1)
    start_s = start.isoformat()

    # 任务
    tasks = database.query(
        "SELECT status, due_date FROM tasks WHERE due_date BETWEEN ? AND ?",
        (start_s, today.isoformat()),
    )
    task_total = len(tasks)
    task_done = sum(1 for t in tasks if t["status"] == "done")
    daily = {}
    for t in tasks:
        d = t["due_date"] or ""
        if d:
            daily.setdefault(d, {"total": 0, "done": 0})
            daily[d]["total"] += 1
            if t["status"] == "done":
                daily[d]["done"] += 1

    # 习惯
    habits = database.query("SELECT * FROM habits WHERE archived = 0")
    habit_stats = []
    for h in habits:
        logs = database.query(
            """SELECT log_date FROM habit_logs WHERE habit_id = ? AND log_date BETWEEN ? AND ?""",
            (h["id"], start_s, today.isoformat()),
        )
        habit_stats.append(
            {
                "id": h["id"],
                "name": h["name"],
                "icon": h["icon"],
                "color": h["color"],
                "days_active": len(logs),
            }
        )
    habit_days = sum(x["days_active"] for x in habit_stats)
    habit_max = len(habits) * range_days
    habit_rate = round(habit_days / habit_max * 100, 1) if habit_max else 0

    # 笔记
    notes_created = database.query_one(
        "SELECT COUNT(*) AS n FROM notes WHERE date(created_at) BETWEEN ? AND ?",
        (start_s, today.isoformat()),
    )["n"]

    # 复盘
    cards_reviewed = database.query_one(
        """SELECT COUNT(*) AS n FROM explanations
           WHERE date(created_at) BETWEEN ? AND ?""",
        (start_s, today.isoformat()),
    )["n"]
    new_cards = database.query_one(
        "SELECT COUNT(*) AS n FROM cards WHERE date(created_at) BETWEEN ? AND ?",
        (start_s, today.isoformat()),
    )["n"]
    mastered = database.query_one(
        "SELECT COUNT(*) AS n FROM cards WHERE status='mastered'"
    )["n"]

    return {
        "range_days": range_days,
        "start": start_s,
        "end": today.isoformat(),
        "task_total": task_total,
        "task_done": task_done,
        "task_rate": round(task_done / task_total * 100, 1) if task_total else 0,
        "daily_tasks": daily,
        "habit_stats": habit_stats,
        "habit_days": habit_days,
        "habit_rate": habit_rate,
        "notes_created": notes_created,
        "cards_reviewed": cards_reviewed,
        "new_cards": new_cards,
        "mastered": mastered,
    }


@router.get("/reports")
def get_report(range: str = "week"):
    if range == "month":
        return _stats(30)
    return _stats(7)


@router.post("/reports/summary")
def ai_summary(body: dict):
    """用 AI 生成周/月复盘总结。"""
    range_name = "本周" if body.get("range", "week") == "week" else "本月"
    stats = _stats(30 if body.get("range", "week") == "month" else 7)
    lines = [
        f"任务完成率：{stats['task_done']}/{stats['task_total']}（{stats['task_rate']}%）",
        f"习惯打卡：共 {stats['habit_days']} 次（完成率 {stats['habit_rate']}%）",
        f"新建笔记：{stats['notes_created']} 篇",
        f"复盘讲解：{stats['cards_reviewed']} 次，新建卡片 {stats['new_cards']} 张，累计掌握 {stats['mastered']} 张",
    ]
    for h in stats["habit_stats"]:
        lines.append(f"习惯「{h['name']}」打卡 {h['days_active']}/{stats['range_days']} 天")
    profile = database.get_setting("profile", "")
    text = ai.chat(
        [{"role": "user", "content": feynman.build_report_prompt(range_name, "\n".join(lines), profile)}],
        temperature=0.7,
        max_tokens=800,
    )
    return {"summary": text, "stats": stats}


@router.get("/reports/trends")
def trends():
    """近 8 周趋势：任务完成率 / 复盘活跃度 / 各习惯完成率。"""
    today = date.today()
    weeks: list[dict] = []
    for w in range(7, -1, -1):
        end = today - timedelta(days=w * 7)
        start = end - timedelta(days=6)
        s, e = start.isoformat(), end.isoformat()
        tasks = database.query(
            "SELECT status FROM tasks WHERE due_date BETWEEN ? AND ?", (s, e)
        )
        total = len(tasks)
        done = sum(1 for t in tasks if t["status"] == "done")
        reviews = database.query_one(
            "SELECT COUNT(*) AS n FROM explanations WHERE date(created_at) BETWEEN ? AND ?",
            (s, e),
        )["n"]
        new_cards = database.query_one(
            "SELECT COUNT(*) AS n FROM cards WHERE date(created_at) BETWEEN ? AND ?",
            (s, e),
        )["n"]
        weeks.append(
            {
                "label": f"{start.month}/{start.day}",
                "task_rate": round(done / total * 100, 1) if total else 0,
                "task_done": done,
                "task_total": total,
                "reviews": reviews,
                "new_cards": new_cards,
            }
        )

    habit_trends: list[dict] = []
    for h in database.query("SELECT * FROM habits WHERE archived = 0 ORDER BY id"):
        weekly: list[float] = []
        for w in range(7, -1, -1):
            end = today - timedelta(days=w * 7)
            start = end - timedelta(days=6)
            n = database.query_one(
                "SELECT COUNT(*) AS n FROM habit_logs WHERE habit_id = ? AND log_date BETWEEN ? AND ?",
                (h["id"], start.isoformat(), end.isoformat()),
            )["n"]
            weekly.append(round(n / 7 * 100, 1))
        habit_trends.append(
            {
                "id": h["id"],
                "name": h["name"],
                "icon": h["icon"],
                "color": h["color"],
                "weekly": weekly,
            }
        )
    return {"weeks": weeks, "habits": habit_trends, "labels": [w["label"] for w in weeks]}


@router.get("/dashboard")
def dashboard():
    today = date.today()
    d = today.isoformat()

    tasks = database.query(
        "SELECT * FROM tasks WHERE due_date = ? ORDER BY priority ASC, due_time IS NULL, due_time ASC, id DESC",
        (d,),
    )
    habits = database.query("SELECT * FROM habits WHERE archived = 0 ORDER BY id ASC")
    logged = {
        r["habit_id"]
        for r in database.query("SELECT habit_id FROM habit_logs WHERE log_date = ?", (d,))
    }
    due_cards = database.query_one(
        """SELECT COUNT(*) AS n FROM cards
           WHERE status IN ('pending','needs_work','reviewing') AND due_date <= ?""",
        (d,),
    )["n"]
    recent_notes = database.query(
        "SELECT id, title, category FROM notes ORDER BY updated_at DESC LIMIT 3"
    )
    plans_month = database.query(
        """SELECT id, title, progress FROM plans
           WHERE type='month' AND period=? AND status='active'
           ORDER BY progress DESC, id DESC LIMIT 4""",
        (d[:7],),
    )
    focus_seconds = database.query_one(
        "SELECT COALESCE(SUM(elapsed_seconds), 0) AS s FROM timers WHERE date(started_at) = ?",
        (d,),
    )["s"]

    return {
        "today": d,
        "weekday": WEEKDAYS[today.weekday()],
        "tasks": [dict(t) for t in tasks],
        "habits": [
            {
                "id": h["id"],
                "name": h["name"],
                "icon": h["icon"],
                "color": h["color"],
                "done_today": h["id"] in logged,
            }
            for h in habits
        ],
        "due_cards": due_cards,
        "recent_notes": recent_notes,
        "plans_month": plans_month,
        "focus_seconds": focus_seconds,
    }
