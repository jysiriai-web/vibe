@echo off
REM 3시간 자동 스캔용 — Windows 작업 스케줄러가 이 파일을 실행.
cd /d "%~dp0.."
node scripts\sync.js >> data\sync.log 2>&1
