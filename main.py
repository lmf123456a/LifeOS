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

from backend.database import get_setting, init_db
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

        # 主窗口 js_api：供概览页按钮显示/隐藏悬浮窗（可懒创建，保证关了之后还能再开）
        class _FloatAPI:
            """悬浮窗 JS 可调用：隐藏窗口（保留实例，概览页可重新显示）。"""

            def __init__(self):
                self._win = None

            def bind(self, win):
                self._win = win

            def close_widget(self):
                if self._win is not None:
                    try:
                        self._win.hide()
                    except Exception:
                        pass

        class _MainAPI:
            def __init__(self, port: int, token: str):
                self._float_win = None
                self._visible = True
                self._port = port
                self._token = token

            def bind_float(self, win):
                self._float_win = win

            def float_visible(self):
                return self._visible and self._float_win is not None

            def _make_float(self):
                """创建右下角跑道型悬浮窗（420×76，置顶、无边框、玻璃透明）。"""
                try:
                    import ctypes

                    class RECT(ctypes.Structure):
                        _fields_ = [
                            ("left", ctypes.c_long), ("top", ctypes.c_long),
                            ("right", ctypes.c_long), ("bottom", ctypes.c_long),
                        ]

                    rect = RECT()
                    ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0)  # SPI_GETWORKAREA
                    wa_right, wa_bottom = rect.right, rect.bottom
                except Exception:
                    wa_right, wa_bottom = 1920, 1040
                fw, fh = 420, 76  # 跑道型胶囊
                float_url = f"http://127.0.0.1:{self._port}/float.html?token={self._token}"
                float_api = _FloatAPI()
                float_win = webview.create_window(
                    "LifeOS · 悬浮窗",
                    float_url,
                    width=fw,
                    height=fh,
                    x=wa_right - fw - 24,
                    y=wa_bottom - fh - 24,
                    frameless=True,
                    on_top=True,
                    easy_drag=True,
                    transparent=True,
                    js_api=float_api,
                )
                float_api.bind(float_win)
                self._float_win = float_win
                logging.info("悬浮窗已创建（右下角跑道型）")

            def toggle_float(self):
                if self._float_win is None:
                    try:
                        self._make_float()
                    except Exception as e:
                        logging.warning(f"创建悬浮窗失败: {e!r}")
                        return False
                self._visible = not self._visible
                try:
                    if self._visible:
                        self._float_win.show()
                    else:
                        self._float_win.hide()
                except Exception:
                    pass
                return self._visible

        main_api = _MainAPI(port, token)

        logging.info("创建桌面窗口 (pywebview)")
        print("[LifeOS] 正在打开桌面窗口...")
        webview.create_window(
            "LifeOS · 日常规划与知识复盘",
            url,
            width=1280,
            height=840,
            min_size=(1024, 700),
            js_api=main_api,
        )
        # 常驻悬浮窗：右下角、无边框、置顶、玻璃透明（跑道型胶囊，可 × 隐藏，概览页可开关）
        if get_setting("float_enabled", "1") != "0":
            try:
                main_api._make_float()
            except Exception as e:
                logging.warning(f"悬浮窗创建失败: {e!r}")
        else:
            logging.info("悬浮窗已按设置关闭")
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
