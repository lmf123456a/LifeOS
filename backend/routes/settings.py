"""设置：DeepSeek 配置 + 个人档案。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import database
from ..services import ai

router = APIRouter(prefix="/api/settings", tags=["settings"])

KEYS = ("deepseek_api_key", "deepseek_base_url", "deepseek_model", "profile", "notify_enabled")


@router.get("")
def get_settings():
    s = {row["key"]: row["value"] for row in database.query("SELECT key, value FROM settings")}
    return {
        "deepseek_api_key": s.get("deepseek_api_key", ""),
        "deepseek_base_url": s.get("deepseek_base_url", ai.DEFAULT_BASE_URL),
        "deepseek_model": s.get("deepseek_model", ai.DEFAULT_MODEL),
        "profile": s.get("profile", ""),
        "notify_enabled": s.get("notify_enabled", "1"),
        "configured": ai.is_configured(),
    }


@router.put("")
def save_settings(body: dict):
    for key in KEYS:
        if key in body:
            database.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, str(body[key])),
            )
    return get_settings()


@router.post("/test")
def test_ai():
    if not ai.is_configured():
        raise HTTPException(400, "请先填写 DeepSeek API Key")
    try:
        reply = ai.test_connection()
        return {"ok": True, "message": f"连接成功，模型回复：{reply}"}
    except ai.AIError as e:
        raise HTTPException(400, str(e)) from e
