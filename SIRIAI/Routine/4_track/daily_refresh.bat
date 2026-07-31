@echo off
rem Daily 10:00 refresh - called by scheduled task SIRIAI_daily_refresh
rem ASCII only + CRLF + no BOM. cmd.exe cannot parse a BOM (0729 failure).
cd /d "%~dp0.."
if not exist "4_track\logs" mkdir "4_track\logs"
echo [%date% %time%] start>>"4_track\logs\daily_refresh.log"
".venv\Scripts\python.exe" "4_track\daily_refresh.py" >>"4_track\logs\daily_refresh.log" 2>&1
echo [%date% %time%] exit=%ERRORLEVEL%>>"4_track\logs\daily_refresh.log"
