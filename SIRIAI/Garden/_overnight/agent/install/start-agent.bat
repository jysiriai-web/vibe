@echo off
REM 수동/디버그용 — 콘솔을 띄워 로그를 눈으로 본다(자동시작 경로 아님).
REM 자동시작은 install-task.ps1 로 등록하세요.
cd /d "%~dp0.."
echo 스캔 에이전트를 콘솔 모드로 시작합니다. (종료: Ctrl+C)
node worker.js
pause
