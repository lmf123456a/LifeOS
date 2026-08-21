"""LifeOS 桌面应用入口：pywebview 窗口 + 本地 FastAPI 服务。

所有启动步骤都写入 data/lifeos.log，出问题先看这个日志。
"""
from __future__ import annotations

import argparse
import logging
import secrets
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

import uvicorn

from backend.database import init_db
from backend.server import create_app

# 日志目录：打包成 exe 后放 exe 旁边（和数据库一致），开发时在项目根
if getattr(sys, "frozen", False):
    _BASE_DIR = Path(sys.executable).resolve().parent
else:
    _BASE_DIR = Path(__file__).resolve().parent
LOG_FILE = _BASE_DIR / "data" / "lifeos.log"


def setup_logging() -> None:
    try:
        Path(LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
        logging.basicConfig(
            filename=str(LOG_FILE),
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(message)s",
            encoding="utf-8",
        )
    except Exception:
        logging.basicConfig(level=logging.WARNING)
    logging.info("=== LifeOS 启动 ===")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def run_server(port: int, token: str = "") -> None:
    try:
        config = uvicorn.Config(
            create_app(token=token),
            host="127.0.0.1",
            port=port,
            log_level="warning",
            log_config=None,  # 打包 exe 时 uvicorn 自带日志配置会报错，禁用（我们有自己的文件日志）
        )
        uvicorn.Server(config).run()
    except Exception as e:
        logging.error(f"本地服务异常退出: {e!r}")


def wait_for_server(url: str, timeout: float = 25.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=0.5)
            return True
        except Exception:
            time.sleep(0.1)
    return False


def keep_alive() -> None:
    print("[LifeOS] 正在运行中... 关闭本窗口即可退出")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description="LifeOS 日常规划与知识复盘")
    parser.add_argument(
        "--browser", action="store_true", help="在默认浏览器中打开（不用桌面窗口）"
    )
    args = parser.parse_args()

    setup_logging()
    logging.info(f"启动参数: browser={args.browser}")

    init_db()
    logging.info("数据库就绪: data/lifeos.db")

    port = find_free_port()
    token = secrets.token_urlsafe(32)
    url = f"http://127.0.0.1:{port}/?token={token}"
    logging.info(f"本地服务地址: http://127.0.0.1:{port}")

    threading.Thread(target=run_server, args=(port, token), daemon=True).start()

    if not wait_for_server(url):
        logging.error("本地服务启动超时")
        print("[LifeOS] 本地服务启动失败，请查看 data/lifeos.log")
        return 1
    logging.info("本地服务已就绪")
    print(f"[LifeOS] 本地服务已启动: {url}")

    if args.browser:
        logging.info("浏览器模式：调用系统浏览器打开")
        webbrowser.open(url)
        keep_alive()
        return 0

    try:
        import webview

        logging.info("创建桌面窗口 (pywebview)")
        print("[LifeOS] 正在打开桌面窗口...")
        webview.create_window(
            "LifeOS · 日常规划与知识复盘",
            url,
            width=1280,
            height=840,
            min_size=(1024, 700),
        )
        webview.start()
        logging.info("桌面窗口已关闭，正常退出")
        return 0
    except Exception as e:
        logging.warning(f"桌面窗口不可用，回退到浏览器: {e!r}")
        print(f"[LifeOS] 桌面窗口不可用（{e}），改用浏览器打开...")
        webbrowser.open(url)
        keep_alive()
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
