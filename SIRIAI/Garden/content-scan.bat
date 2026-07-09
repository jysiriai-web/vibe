@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts/scan-content.js
echo.
echo (Done - refresh the dashboard. You can close this window.)
pause >nul
