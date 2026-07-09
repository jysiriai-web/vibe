@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ===== Installing Playwright (video scraper) =====
echo This downloads a Chrome engine (~130MB). Takes a few minutes.
echo Keep this window OPEN until it says DONE.
echo.
call npm install playwright
echo.
echo --- installing chromium browser ---
call npx playwright install chromium
echo.
echo ================================
echo   DONE. You can close this window.
echo ================================
pause >nul
