"""FastAPI 应用装配：API 路由 + 前端静态文件 + 安全边界。

- OpenAPI 文档默认开启（/docs、/openapi.json），为未来移动端客户端对接提供契约。
- Host 校验：仅接受 127.0.0.1/localhost，防 DNS rebinding。
- 会话 Token：启动时生成并注入前端 URL，/api/* 请求需带 X-LifeOS-Token（防本机其他进程直连）。
"""
from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .database import DATA_DIR, init_db
from .routes import backup, courses, files, habits, notes, plans, reflections, reminders, reports, reviews, settings, tasks
from .services import ai

# 前端目录：打包成 exe 时从内置资源(_MEIPASS)读取，开发时在项目根
if getattr(sys, "frozen", False):
    _BASE = Path(getattr(sys, "_MEIPASS", str(Path(sys.executable).parent)))
else:
    _BASE = Path(__file__).resolve().parent.parent
FRONTEND_DIR = _BASE / "frontend"
IMAGES_DIR = DATA_DIR / "images"


def create_app(token: str = "") -> FastAPI:
    init_db()
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    app = FastAPI(title="LifeOS")

    # ---- 全局异常处理：常见错误转成友好 4xx ----
    @app.exception_handler(ai.AIError)
    async def ai_error_handler(request: Request, exc: ai.AIError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        return JSONResponse(status_code=400, content={"detail": f"参数错误：{exc}"})

    # ---- 安全边界 ----
    @app.middleware("http")
    async def security_middleware(request: Request, call_next):
        host = (request.headers.get("host") or "").lower()
        if not (host.startswith("127.0.0.1:") or host.startswith("localhost:")):
            return JSONResponse(status_code=403, content={"detail": "非法来源"})
        if request.url.path.startswith("/api/"):
            if token and request.headers.get("x-lifeos-token") != token:
                return JSONResponse(status_code=401, content={"detail": "未授权访问"})
        return await call_next(request)

    @app.get("/api/version")
    def version():
        """前端用它检测服务端是否过旧（API 号增加 = 后端有新增接口）。"""
        return {"version": "2.7", "api": 10}

    for router in (
        tasks.router,
        habits.router,
        notes.router,
        reviews.router,
        reports.router,
        settings.router,
        files.router,
        backup.router,
        reminders.router,
        plans.router,
        courses.router,
        reflections.router,
    ):
        app.include_router(router)
    app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    return app
