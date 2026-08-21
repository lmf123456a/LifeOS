@echo off
setlocal
cd /d "%~dp0"
title LifeOS - 浏览器模式
echo [LifeOS] 将以浏览器模式启动（不弹出桌面窗口）...
".venv\Scripts\python.exe" main.py --browser
if errorlevel 1 (
    echo.
    echo [错误] LifeOS 启动失败，详细错误已写入 data\lifeos.log
    pause
)