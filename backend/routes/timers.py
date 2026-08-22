"""项目计时：正计时 / 倒计时 / 番茄计时（会话记录 + 统计 + 悬浮窗状态）。"""
from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, HTTPException

from .. import database

router = APIRouter(prefix="/api/timers", tags=["timers"])

MODES = ("stopwatch", "countdown", "pomodoro")


@router.post("/start")
def start_timer(body: dict):
    if not isinstance(body, dict):
        raise HTTPException(400, "请求体必须是 JSON 对象")
    mode = body.get("mode", "stopwatch")
    if mode not in MODES:
        raise HTTPException(400, "模式必须是 stopwatch/countdown/pomodoro")
    try:
        duration = int(body.get("duration_seconds") or 0)
    except (TypeError, ValueError):
        duration = 0
    duration = max(0, min(duration, 24 * 3600))
    with database.transaction() as conn:
        # 兜底：先关闭之前异常遗留的未结束计时，避免污染统计
        conn.execute("UPDATE timers SET ended_at=datetime('now','localtime') WHERE ended_at IS NULL")
        cur = conn.execute(
            """INSERT INTO timers (mode, task_id, task_title, duration_seconds)
               VALUES (?, ?, ?, ?)""",
            (mode, body.get("task_id") or None, (body.get("task_title") or "").strip(), duration),
        )
        tid = cur.lastrowid
    return database.query_one("SELECT * FROM timers WHERE id = ?", (tid,))


@router.post("/{tid}/stop")
def stop_timer(tid: int, body: dict):
    if not isinstance(body, dict):
        raise HTTPException(400, "请求体必须是 JSON 对象")
    t = database.query_one("SELECT * FROM timers WHERE id = ?", (tid,))
    if not t:
        raise HTTPException(404, "计时记录不存在")
    try:
        elapsed = int(body.get("elapsed_seconds") or 0)
    except (TypeError, ValueError):
        elapsed = 0
    elapsed = max(0, min(elapsed, 24 * 3600))
    database.execute(
        """UPDATE timers SET elapsed_seconds=?, ended_at=datetime('now','localtime')
           WHERE id=?""",
        (elapsed, tid),
    )
    return database.query_one("SELECT * FROM timers WHERE id = ?", (tid,))


@router.delete("/{tid}")
def delete_timer(tid: int):
    database.execute("DELETE FROM timers WHERE id = ?", (tid,))
    return {"ok": True}


@router.get("/history")
def history(days: int = 30):
    return database.query(
        """SELECT * FROM timers WHERE date(started_at) >= date('now', ?)
           ORDER BY id DESC LIMIT 200""",
        (f"-{int(days)} days",),
    )


@router.get("/summary")
def summary():
    today = date.today().isoformat()
    rows = database.query("SELECT * FROM timers WHERE date(started_at) = ?", (today,))
    total = sum(r["elapsed_seconds"] for r in rows)
    return {"date": today, "sessions": len(rows), "focus_seconds": total}


@router.post("/state")
def set_timer_state(body: dict):
    """主窗口心跳：把当前计时状态同步给悬浮窗（存 settings）。"""
    if not isinstance(body, dict):
        raise HTTPException(400, "请求体必须是 JSON 对象")
    payload = {
        "active": body.get("active") is True,
        "mode": body.get("mode", ""),
        "phase": body.get("phase", ""),
        "task_title": body.get("task_title", ""),
        "elapsed_seconds": int(body.get("elapsed_seconds") or 0),
        "running": body.get("running") is True,
        "duration_seconds": int(body.get("duration_seconds") or 0),
        "rounds": int(body.get("rounds") or 0),
    }
    database.execute(
        "INSERT INTO settings (key, value) VALUES ('timer_state', ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (json.dumps(payload, ensure_ascii=False),),
    )
    return {"ok": True}


@router.get("/state")
def get_timer_state():
    raw = database.get_setting("timer_state", "")
    if not raw:
        return {"active": False}
    try:
        return json.loads(raw)
    except ValueError:
        return {"active": False}


@router.get("/float-data")
def float_data():
    """悬浮窗聚合数据：计时状态 + 今日计划（一次请求）。"""
    state = get_timer_state()
    today = date.today()
    d = today.isoformat()
    tasks = database.query(
        "SELECT id, title, status FROM tasks WHERE due_date=? ORDER BY priority ASC, id DESC",
        (d,),
    )
    courses = database.query(
        "SELECT name, start_time, end_time, week_start, week_end, week_type FROM courses WHERE weekday=? ORDER BY start_time",
        (today.isoweekday(),),
    )
    from ..services import semester

    wn = semester.week_number(today)
    courses = [c for c in courses if semester.in_week(c, wn)]
    items = []
    for t in tasks:
        if t["status"] == "cancelled":
            continue
        items.append({"type": "task", "title": t["title"], "done": t["status"] == "done", "meta": "任务"})
    for c in courses:
        items.append({"type": "course", "title": c["name"], "done": False, "meta": f"课程 · {c['start_time']}"})
    done = sum(1 for i in items if i["done"])
    return {
        "timer": state,
        "plan": {"items": items, "done": done, "total": len(items)},
    }
