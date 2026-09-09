@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Scheduled Task may launch CMD in the interactive user session. Relaunch the
rem real worker through Windows Script Host so the server remains background-only.
if /I not "%~1"=="--worker" (
    "%SystemRoot%\System32\wscript.exe" "%~dp0start-server-hidden.vbs"
    exit /b 0
)

call "%ProgramFiles%\nodejs\npm.cmd" run start:web
