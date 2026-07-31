@echo off
chcp 65001 >nul
title SIRIAI 폴더 재구성 - 2단계 (Routine, DECK)
echo.
echo  ================================================
echo   SIRIAI 폴더 재구성 - 2단계
echo   (Routine, DECK 를 새 위치로 이동)
echo  ================================================
echo.
echo   * 이 창을 제외한 Claude Code 창을 전부 닫았는지 확인하세요.
echo.
pause
powershell -ExecutionPolicy Bypass -File "%~dp0_RESTRUCTURE.ps1"
echo.
pause
