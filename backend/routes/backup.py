"""数据备份：全量导出 / 导入还原 / 笔记 Markdown 导出。"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException

from .. import database
from ..database import DATA_DIR

router = APIRouter(prefix="/api/backup", tags=["backup"])

TABLES = (
    "tasks", "plans", "courses", "habits", "habit_logs",
    "notes", "cards", "explanations", "reflections", "settings",
)

SECRET_KEYS = ("deepseek_api_key",)


def _mask_secrets(row: dict) -> dict:
    """导出时对敏感设置脱敏，防止备份文件泄露 API Key。"""
    out = dict(row)
    for k in SECRET_KEYS:
        v = out.get("value", "")
        if k in (out.get("key"),) and v:
            out["value"] = f"sk-****{v[-4:]}"
    return out


def _full_dump() -> dict:
    data: dict = {
        "app": "LifeOS",
        "version": 3,
        "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    for t in TABLES:
        order = "key" if t == "settings" else "id"
        rows = database.query(f"SELECT * FROM {t} ORDER BY {order}")
        if t == "settings":
            rows = [_mask_secrets(r) for r in rows]
        data[t] = rows
    return data


@router.get("/export")
def export_all():
    data = _full_dump()
    backups = DATA_DIR / "backups"
    backups.mkdir(parents=True, exist_ok=True)
    fname = f"lifeos-backup-{datetime.now():%Y%m%d-%H%M%S}.json"
    (backups / fname).write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"data": data, "backup_file": f"backups/{fname}"}


@router.post("/import")
def import_all(body: dict):
    # 兼容两种格式：{"data": {...}} 或直接 {...}
    data = body.get("data") if isinstance(body.get("data"), dict) else body
    if not isinstance(data, dict) or data.get("app") != "LifeOS":
        raise HTTPException(400, "不是有效的 LifeOS 备份文件（缺少 app 标识）")
    if data.get("version", 1) > 3:
        raise HTTPException(400, "备份文件版本过新，请先升级 LifeOS")

    # 前置校验：结构不合法直接拒绝，不破坏现有数据
    for t in TABLES:
        rows = data.get(t, [])
        if not isinstance(rows, list):
            raise HTTPException(400, f"备份中表 {t} 的数据格式不正确")
        for r in rows:
            if not isinstance(r, dict):
                raise HTTPException(400, f"备份中表 {t} 存在非法行")

    counts: dict[str, int] = {}
    with database.transaction() as conn:
        # 先按依赖倒序清空，再按依赖正序插入（保留原 id，外键一致）
        for t in reversed(TABLES):
            conn.execute(f"DELETE FROM {t}")
        for t in TABLES:
            rows = data.get(t, [])
            if not rows:
                counts[t] = 0
                continue
            cols = [r["name"] for r in database.query(f"PRAGMA table_info({t})")]
            cols = [c for c in cols if c in rows[0]]
            placeholders = ", ".join("?" * len(cols))
            conn.executemany(
                f"INSERT INTO {t} ({', '.join(cols)}) VALUES ({placeholders})",
                [[r.get(c) for c in cols] for r in rows],
            )
            counts[t] = len(rows)
    return {"ok": True, "counts": counts}


@router.get("/notes/markdown")
def export_notes_md():
    notes = database.query("SELECT * FROM notes ORDER BY id")
    out_dir = DATA_DIR / "exports" / f"notes-{datetime.now():%Y%m%d-%H%M%S}"
    out_dir.mkdir(parents=True, exist_ok=True)
    safe = lambda s: re.sub(r'[\\/:*?"<>|]', "_", s or "").strip()[:80] or "未命名"
    for n in notes:
        text = (
            f"# {n['title']}\n\n"
            f"> 分类：{n['category']} | 标签：{n['tags']} | 创建：{n['created_at']}\n\n"
            f"{n['content']}\n"
        )
        (out_dir / f"{n['id']:04d}-{safe(n['title'])}.md").write_text(
            text, encoding="utf-8"
        )
    rel = str(out_dir.relative_to(DATA_DIR))
    return {"ok": True, "count": len(notes), "dir": rel}
