@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts/test-videos.js @maru_changho @studio_maru @rico_920
echo.
echo (Copy the result above and paste it to Claude. You can close this window.)
pause >nul
