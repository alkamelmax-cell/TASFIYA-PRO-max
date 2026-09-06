@echo off
setlocal EnableExtensions
chcp 65001 >nul
title تحديث خادم تصفية برو

cd /d "%~dp0"

echo ==========================================
echo       تحديث خادم تصفية برو
echo ==========================================
echo.
echo سيتم حفظ سجل التحديث داخل مجلد:
echo %~dp0_update-logs
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-update.ps1"
set "UPDATE_RESULT=%ERRORLEVEL%"

echo.
if not "%UPDATE_RESULT%"=="0" (
    echo فشل تحديث الخادم. راجع الرسائل الظاهرة وملف السجل داخل _update-logs.
) else (
    echo تم تحديث الخادم بنجاح.
)
echo.
echo اضغط أي مفتاح لإغلاق النافذة...
pause >nul
exit /b %UPDATE_RESULT%
