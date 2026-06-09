@echo off
chcp 65001 >nul
title SIRIAI 사업소개 V3 - 로컬 서버
cd /d "%~dp0"
echo.
echo  ============================================
echo   SIRIAI 사업소개 V3
echo   잠시 후 브라우저가 자동으로 열립니다.
echo   끄려면 이 창에서 Ctrl+C 또는 창을 닫으세요.
echo  ============================================
echo.
if not exist node_modules (
  echo  [최초 1회] 의존성 설치 중... 잠시만요.
  call npm install
)
call npm run dev -- --open
pause
