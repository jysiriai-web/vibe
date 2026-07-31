@echo off
REM SIRIAI coldmail tool launcher - runs run.py via the SHARED venv (Routine/.venv)
chcp 65001 >nul
set PYTHONUTF8=1
"%~dp0..\.venv\Scripts\python.exe" "%~dp0run.py" %*
