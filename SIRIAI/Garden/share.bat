@echo off
cd /d "%~dp0"
echo ================================================
echo  Garden dashboard - TEAM SHARE (viewer mode)
echo ================================================
echo Starting dashboard server (view-only)...
set VIEWER=1
set NO_OPEN=1
start "garden-viewer-server" cmd /c "node src/server.js"
timeout /t 2 >nul
echo.
echo Opening public tunnel - share the https://...trycloudflare.com URL below with your team.
echo (Keep this window open while sharing. Close it to stop.)
echo.
cloudflared.exe tunnel --url http://localhost:3737 --no-autoupdate