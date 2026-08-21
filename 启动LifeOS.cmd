@echo off
setlocal
cd /d "%~dp0"
title LifeOS - 日常规划与知识复盘

where python >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.10+ 并勾选 "Add to PATH"
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo [LifeOS] 首次运行：正在创建虚拟环境...
    python -m venv .venv
    if errorlevel 1 (
        echo [错误] 创建虚拟环境失败
        pause
        exit /b 1
    )
)

".venv\Scripts\python.exe" -c "import fastapi, uvicorn, httpx, webview, multipart, openpyxl, xlrd" >nul 2>nul
if errorlevel 1 (
    echo [LifeOS] 正在安装依赖（首次约 1~3 分钟，请耐心等待）...
    ".venv\Scripts\pip.exe" install -r requirements.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重新运行本脚本
        pause
        exit /b 1
    )
)

echo [LifeOS] 正在启动，请稍候...
".venv\Scripts\python.exe" main.py
if errorlevel 1 (
    echo.
    echo [错误] LifeOS 启动失败，详细错误已写入 data\lifeos.log
    pause
)