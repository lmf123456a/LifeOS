"""长期计划：月任务 / 年任务。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import database

router = APIRouter(prefix="/api/plans", tags=["plans"])

TYPES = ("month", "year")
STATUSES = ("active", "done", "cancelled")


@router.get("")
def list_plans(type: str = "", period: str = "", status: str = ""):
    sql = "SELECT * FROM plans WHERE 1=1"
    params: list = []
    if type:
        sql += " AND type = ?"
        params.append(type)
    if period:
        sql += " AND period = ?"
        params.append(period)
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, id DESC"
    return database.query(sql, tuple(params))


@router.get("/{pid}")
def get_plan(pid: int):
    plan = database.query_one("SELECT * FROM plans WHERE id = ?", (pid,))
    if not plan:
        raise HTTPException(404, "计划不存在")
    return plan


@router.post("")
def create_plan(body: dict):
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "计划标题不能为空")
    ptype = body.get("type", "month")
    if ptype not in TYPES:
        raise HTTPException(400, "计划类型必须是 month 或 year")
    period = (body.get("period") or "").strip()
    if not period:
        raise HTTPException(400, "请选择计划周期")
    pid = database.execute(
        """INSERT INTO plans (type, period, title, notes, status, progress)
           VALUES (?, ?, ?, ?, 'active', 0)""",
        (ptype, period, title, body.get("notes", "")),
    )
    return database.query_one("SELECT * FROM plans WHERE id = ?", (pid,))


@router.put("/{pid}")
def update_plan(pid: int, body: dict):
    plan = database.query_one("SELECT * FROM plans WHERE id = ?", (pid,))
    if not plan:
        raise HTTPException(404, "计划不存在")
    database.execute(
        "UPDATE plans SET title=?, notes=?, type=?, period=? WHERE id=?",
        (
            body.get("title", plan["title"]),
            body.get("notes", plan["notes"]),
            body.get("type", plan["type"]),
            body.get("period", plan["period"]),
            pid,
        ),
    )
    return database.query_one("SELECT * FROM plans WHERE id = ?", (pid,))


@router.patch("/{pid}/progress")
def set_progress(pid: int, body: dict):
    plan = database.query_one("SELECT * FROM plans WHERE id = ?", (pid,))
    if not plan:
        raise HTTPException(404, "计划不存在")
    try:
        p = int(body.get("progress", 0))
    except (TypeError, ValueError):
        raise HTTPException(400, "进度必须是数字")
    p = max(0, min(100, p))
    database.execute("UPDATE plans SET progress=? WHERE id=?", (p, pid))
    return database.query_one("SELECT * FROM plans WHERE id = ?", (pid,))


@router.patch("/{pid}/status")
def set_status(pid: int, body: dict):
    plan = database.query_one("SELECT * FROM plans WHERE id = ?", (pid,))
    if not plan:
        raise HTTPException(404, "计划不存在")
    status = body.get("status")
    if status not in STATUSES:
        raise HTTPException(400, "无效状态")
    completed_at = "datetime('now','localtime')" if status == "done" else "NULL"
    database.execute(
        f"UPDATE plans SET status=?, completed_at={completed_at} WHERE id=?",
        (status, pid),
    )
    return database.query_one("SELECT * FROM plans WHERE id = ?", (pid,))


@router.delete("/{pid}")
def delete_plan(pid: int):
    database.execute("DELETE FROM plans WHERE id = ?", (pid,))
    return {"ok": True}
