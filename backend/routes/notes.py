"""知识笔记库：笔记 CRUD + 搜索。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import database

router = APIRouter(prefix="/api/notes", tags=["notes"])

CATEGORIES = ("course", "book", "language", "life")


@router.get("")
def list_notes(q: str = "", category: str = "", limit: int = 200):
    sql = "SELECT id, title, category, tags, created_at, updated_at, substr(content, 1, 80) AS excerpt FROM notes WHERE 1=1"
    params: list = []
    if category:
        sql += " AND category = ?"
        params.append(category)
    if q:
        sql += " AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)"
        like = f"%{q}%"
        params += [like, like, like]
    sql += " ORDER BY updated_at DESC, id DESC LIMIT ?"
    params.append(int(limit))
    return database.query(sql, tuple(params))


@router.get("/{nid}")
def get_note(nid: int):
    note = database.query_one("SELECT * FROM notes WHERE id = ?", (nid,))
    if not note:
        raise HTTPException(404, "笔记不存在")
    return note


@router.post("")
def create_note(body: dict):
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "笔记标题不能为空")
    category = body.get("category", "course")
    if category not in CATEGORIES:
        category = "course"
    nid = database.execute(
        """INSERT INTO notes (title, content, category, tags)
           VALUES (?, ?, ?, ?)""",
        (title, body.get("content", ""), category, body.get("tags", "")),
    )
    return database.query_one("SELECT * FROM notes WHERE id = ?", (nid,))


@router.put("/{nid}")
def update_note(nid: int, body: dict):
    note = database.query_one("SELECT * FROM notes WHERE id = ?", (nid,))
    if not note:
        raise HTTPException(404, "笔记不存在")
    category = body.get("category", note["category"])
    if category not in CATEGORIES:
        category = "course"
    database.execute(
        """UPDATE notes SET title=?, content=?, category=?, tags=?,
           updated_at=datetime('now','localtime') WHERE id=?""",
        (
            body.get("title", note["title"]),
            body.get("content", note["content"]),
            category,
            body.get("tags", note["tags"]),
            nid,
        ),
    )
    return database.query_one("SELECT * FROM notes WHERE id = ?", (nid,))


@router.delete("/{nid}")
def delete_note(nid: int):
    database.execute("DELETE FROM notes WHERE id = ?", (nid,))
    return {"ok": True}
