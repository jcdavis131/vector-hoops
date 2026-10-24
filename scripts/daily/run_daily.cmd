@echo off
rem Daily box pipeline (feeds plan P4): thin wrapper for Task Scheduler. See run_daily.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_daily.ps1" %*
exit /b %ERRORLEVEL%
