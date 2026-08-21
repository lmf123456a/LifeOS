"""习惯追踪：习惯 CRUD + 每日打卡。"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException

from .. import database

router = APIRouter(prefix="/api/habits", tags=["habits"])


@router.get("")
def list_habits(include_archived: bool = False):
    sql = "SELECT * FROM habits"
    if not include_archived:
        sql += " WHERE archived = 0"
    sql += " ORDER BY id ASC"
    return database.query(sql)


@router.get("/{hid}")
def get_habit(hid: int):
    habit = database.query_one("SELECT * FROM habits WHERE id = ?", (hid,))
    if not habit:
        raise HTTPException(404, "习惯不存在")
    return habit


@router.post("")
def create_habit(body: dict):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "习惯名称不能为空")
    hid = database.execute(
        "INSERT INTO habits (name, icon, color) VALUES (?, ?, ?)",
        (name, body.get("icon", "⭐"), body.get("color", "#f59e0b")),
    )
    return database.query_one("SELECT * FROM habits WHERE id = ?", (hid,))


@router.put("/{hid}")
def update_habit(hid: int, body: dict):
    habit = database.query_one("SELECT * FROM habits WHERE id = ?", (hid,))
    if not habit:
        raise HTTPException(404, "习惯不存在")
    database.execute(
        "UPDATE habits SET name=?, icon=?, color=?, archived=? WHERE id=?",
        (
            body.get("name", habit["name"]),
            body.get("icon", habit["icon"]),
            body.get("color", habit["color"]),
            int(body.get("archived", habit["archived"])),
            hid,
        ),
    )
    return database.query_one("SELECT * FROM habits WHERE id = ?", (hid,))


@router.delete("/{hid}")
def delete_habit(hid: int):
    database.execute("DELETE FROM habits WHERE id = ?", (hid,))
    return {"ok": True}


@router.post("/{hid}/toggle")
def toggle_log(hid: int, body: dict):
    """切换某天打卡状态，返回最新状态。"""
    habit = database.query_one("SELECT * FROM habits WHERE id = ?", (hid,))
    if not habit:
        raise HTTPException(404, "习惯不存在")
    log_date = body.get("date") or date.today().isoformat()
    existing = database.query_one(
        "SELECT * FROM habit_logs WHERE habit_id = ? AND log_date = ?", (hid, log_date)
    )
    if existing:
        database.execute("DELETE FROM habit_logs WHERE id = ?", (existing["id"],))
        return {"date": log_date, "completed": False}
    database.execute(
        "INSERT INTO habit_logs (habit_id, log_date, completed) VALUES (?, ?, 1)",
        (hid, log_date),
    )
    return {"date": log_date, "completed": True}


@router.get("/{hid}/logs")
def habit_logs(hid: int, month: str | None = None):
    """某习惯的打卡日期列表，可用 month=YYYY-MM 过滤。"""
    if month:
        rows = database.query(
            "SELECT log_date FROM habit_logs WHERE habit_id = ? AND log_date LIKE ?",
            (hid, f"{month}%"),
        )
    else:
        rows = database.query(
            "SELECT log_date FROM habit_logs WHERE habit_id = ?", (hid,)
        )
    return {"dates": [r["log_date"] for r in rows]}


@router.get("/{hid}/streak")
def habit_streak(hid: int):
    """计算当前连续打卡天数（截至今天，允许今天未打卡）。"""
    rows = database.query(
        """SELECT log_date FROM habit_logs WHERE habit_id = ?
           ORDER BY log_date DESC""",
        (hid,),
    )
    from datetime import date, timedelta

    dates = {r["log_date"] for r in rows}
    streak = 0
    d = date.today()
    if d.isoformat() not in dates:
        d -= timedelta(days=1)  # 今天还没打卡，从昨天往前数
    while d.isoformat() in dates:
        streak += 1
        d -= timedelta(days=1)
    return {"streak": streak}
