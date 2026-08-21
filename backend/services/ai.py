"""DeepSeek API 客户端（OpenAI 兼容接口）。"""
from __future__ import annotations

import httpx

from .. import database

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"


class AIError(RuntimeError):
    """AI 调用失败。"""


def get_config() -> dict:
    s = {row["key"]: row["value"] for row in database.query("SELECT key, value FROM settings")}
    return {
        "api_key": s.get("deepseek_api_key", "").strip(),
        "base_url": s.get("deepseek_base_url", DEFAULT_BASE_URL).strip().rstrip("/"),
        "model": s.get("deepseek_model", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
    }


def is_configured() -> bool:
    return bool(get_config()["api_key"])


def chat(messages: list[dict], temperature: float = 0.6, max_tokens: int = 2048) -> str:
    """调用 DeepSeek 对话接口，返回回复文本。"""
    cfg = get_config()
    if not cfg["api_key"]:
        raise AIError("尚未配置 DeepSeek API Key，请先到「设置」页填写。")

    url = f"{cfg['base_url']}/chat/completions"
    payload = {
        "model": cfg["model"],
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {"Authorization": f"Bearer {cfg['api_key']}"}
    try:
        with httpx.Client(timeout=180) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        detail = ""
        try:
            detail = e.response.json().get("error", {}).get("message", "")
        except Exception:
            detail = e.response.text[:300]
        raise AIError(f"API 返回错误（{e.response.status_code}）：{detail}") from e
    except httpx.HTTPError as e:
        raise AIError(f"无法连接 API：{e}") from e

    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as e:
        raise AIError(f"API 返回格式异常：{data}") from e


def test_connection() -> str:
    """测试连接，返回模型自我介绍。"""
    text = chat(
        [{"role": "user", "content": "请只回复两个字：连接成功"}],
        temperature=0.2,
        max_tokens=16,
    )
    return text
