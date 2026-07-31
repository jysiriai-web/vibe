@echo off
chcp 65001 >nul
title SIRIAI Gardening Dashboard
cd /d "%~dp0"
echo Starting SIRIAI Gardening Dashboard...
echo A browser will open shortly.  Keep this window OPEN.
echo Close this window to stop the dashboard.
echo.
node src/server.js
echo.
echo Dashboard stopped. You can close this window.
pause >nul
