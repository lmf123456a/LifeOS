"""每日规划：任务 CRUD。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import database

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _row_to_dict(row: dict) -> dict:
    return row


@router.get("")
def list_tasks(date: str | None = None, status: str | None = None):
    sql = "SELECT * FROM tasks WHERE 1=1"
    params: list = []
    if date:
        sql += " AND due_date = ?"
        params.append(date)
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END, priority ASC, due_time IS NULL, due_time ASC, id DESC"
    rows = database.query(sql, tuple(params))
    return [dict(r) for r in rows]


@router.get("/{tid}")
def get_task(tid: int):
    task = database.query_one("SELECT * FROM tasks WHERE id = ?", (tid,))
    if not task:
        raise HTTPException(404, "任务不存在")
    return task


@router.post("")
def create_task(body: dict):
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "任务标题不能为空")
    tid = database.execute(
        """INSERT INTO tasks (title, notes, priority, status, due_date, due_time)
           VALUES (?, ?, ?, 'todo', ?, ?)""",
        (
            title,
            body.get("notes", ""),
            int(body.get("priority", 2)),
            body.get("due_date") or None,
            body.get("due_time") or None,
        ),
    )
    return database.query_one("SELECT * FROM tasks WHERE id = ?", (tid,))


@router.put("/{tid}")
def update_task(tid: int, body: dict):
    task = database.query_one("SELECT * FROM tasks WHERE id = ?", (tid,))
    if not task:
        raise HTTPException(404, "任务不存在")
    database.execute(
        """UPDATE tasks SET title=?, notes=?, priority=?, due_date=?, due_time=?
           WHERE id=?""",
        (
            body.get("title", task["title"]),
            body.get("notes", task["notes"]),
            int(body.get("priority", task["priority"])),
            body.get("due_date", task["due_date"]),
            body.get("due_time", task["due_time"]),
            tid,
        ),
    )
    return database.query_one("SELECT * FROM tasks WHERE id = ?", (tid,))


@router.patch("/{tid}/status")
def set_status(tid: int, body: dict):
    task = database.query_one("SELECT * FROM tasks WHERE id = ?", (tid,))
    if not task:
        raise HTTPException(404, "任务不存在")
    status = body.get("status")
    if status not in ("todo", "doing", "done", "cancelled"):
        raise HTTPException(400, "无效状态")
    completed_at = None
    if status == "done":
        completed_at = "datetime('now','localtime')"
    elif status != "done":
        completed_at = "NULL"
    database.execute(
        f"UPDATE tasks SET status=?, completed_at={completed_at} WHERE id=?",
        (status, tid),
    )
    return database.query_one("SELECT * FROM tasks WHERE id = ?", (tid,))


@router.delete("/{tid}")
def delete_task(tid: int):
    database.execute("DELETE FROM tasks WHERE id = ?", (tid,))
    return {"ok": True}
