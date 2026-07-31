@echo off
REM SIRIAI review server auto-start (absolute paths - works from anywhere).
REM Skips if port 8000 already listening, else starts in background.
REM Windows Startup folder calls this on logon so the server is always up.

set "RT=%~dp0.."

netstat -ano | findstr ":8000 " >nul 2>&1
if not errorlevel 1 exit /b 0

set "PYW=%RT%\.venv\Scripts\pythonw.exe"
if not exist "%PYW%" set "PYW=%RT%\.venv\Scripts\python.exe"

start "" "%PYW%" "%RT%\3_send\review_server.py"
exit /b 0
