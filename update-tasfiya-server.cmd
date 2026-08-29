@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-update.ps1"
set "UPDATE_RESULT=%ERRORLEVEL%"
if not "%UPDATE_RESULT%"=="0" (
    echo.
    echo Server update failed. Review the messages above.
) else (
    echo.
    echo Server update completed successfully.
)
pause
exit /b %UPDATE_RESULT%
