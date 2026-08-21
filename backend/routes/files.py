"""文件上传：笔记图片（保存到 data/images，静态服务）。"""
from __future__ import annotations

import datetime
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..database import DATA_DIR

router = APIRouter(prefix="/api/files", tags=["files"])

IMAGES_DIR = DATA_DIR / "images"
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
MAX_SIZE = 10 * 1024 * 1024  # 10MB


def _looks_like_image(ext: str, data: bytes) -> bool:
    """按魔数校验文件内容，防止任意文件改名图片后缀后被读取/复制。"""
    head = data[:16]
    checks = {
        ".png": head.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": head.startswith(b"\xff\xd8\xff"),
        ".jpeg": head.startswith(b"\xff\xd8\xff"),
        ".gif": head.startswith((b"GIF87a", b"GIF89a")),
        ".webp": head[0:4] == b"RIFF" and head[8:12] == b"WEBP",
        ".bmp": head.startswith(b"BM"),
    }
    return bool(checks.get(ext, False))


def _save_image(content: bytes, ext: str) -> dict:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{datetime.date.today():%Y%m%d}-{uuid.uuid4().hex[:10]}{ext}"
    (IMAGES_DIR / name).write_bytes(content)
    return {"url": f"/images/{name}", "name": name, "size": len(content)}


@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支持的图片格式（{ext or '无扩展名'}），支持：png/jpg/jpeg/gif/webp/bmp")
    content = await file.read()
    if not content:
        raise HTTPException(400, "图片内容为空")
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "图片超过 10MB 限制")
    if not _looks_like_image(ext, content):
        raise HTTPException(400, "文件内容不是有效的图片")
    return _save_image(content, ext)


@router.post("/image-by-path")
def upload_image_by_path(body: dict):
    """按本地文件路径导入图片：粘贴/输入的是 Windows 路径时用这个。

    仅允许图片扩展名 + 大小预检 + 魔数校验，避免误读任意文件。
    """
    raw = (body.get("path") or "").strip()
    if not raw:
        raise HTTPException(400, "图片路径不能为空")
    # 兼容 file:///C:/... 形式
    if raw.lower().startswith("file:///"):
        raw = raw[8:].replace("/", "\\")
    src = Path(raw)
    ext = src.suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支持的图片格式（{ext or '无扩展名'}），支持：png/jpg/jpeg/gif/webp/bmp")
    if not src.is_file():
        raise HTTPException(400, f"文件不存在：{raw}")
    if src.stat().st_size > MAX_SIZE:
        raise HTTPException(400, "图片超过 10MB 限制")
    content = src.read_bytes()
    if not content:
        raise HTTPException(400, "图片内容为空")
    if not _looks_like_image(ext, content):
        raise HTTPException(400, "文件内容不是有效的图片")
    return _save_image(content, ext)
