[CmdletBinding()]
param(
    [string]$TaskName = 'Tasfiya Local Web Server',
    [switch]$ConfigureScheduledTask
)

$ErrorActionPreference = 'Stop'
$serverRoot = Split-Path -Parent $PSCommandPath
$savedDatabaseUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'User')

if ([string]::IsNullOrWhiteSpace($savedDatabaseUrl)) {
    Write-Warning 'DATABASE_URL is not saved for this Windows user. The update button will still be created, but the server may need DATABASE_URL before it can start.'
}

$desktop = [Environment]::GetFolderPath('Desktop')
$buttonPath = Join-Path $desktop 'تحديث خادم تصفية برو.cmd'
$buttonContent = @"
@echo off
setlocal EnableExtensions
chcp 65001 >nul
title تحديث خادم تصفية برو
cd /d "$serverRoot"
call "$serverRoot\update-tasfiya-server.cmd"
set "UPDATE_RESULT=%ERRORLEVEL%"
echo.
echo انتهى زر التحديث برمز: %UPDATE_RESULT%
echo إذا ظهرت مشكلة، افتح مجلد _update-logs داخل:
echo $serverRoot
echo.
echo اضغط أي مفتاح لإغلاق النافذة...
pause >nul
exit /b %UPDATE_RESULT%
"@
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($buttonPath, $buttonContent, $utf8WithoutBom)

if ($ConfigureScheduledTask) {
    $launcher = Join-Path $serverRoot 'start-server-hidden.vbs'
    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        if ($task.State -eq 'Running') {
            Stop-ScheduledTask -TaskName $TaskName
            Start-Sleep -Seconds 2
        }

        $wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
        & schtasks.exe /Change /TN $TaskName /TR "`"$wscript`" `"$launcher`""
        if ($LASTEXITCODE -ne 0) {
            throw "schtasks exited with code $LASTEXITCODE"
        }

        Start-ScheduledTask -TaskName $TaskName
        Write-Host "Scheduled task updated and started: $TaskName" -ForegroundColor Green
    } catch {
        Write-Warning "The desktop update button was created, but the scheduled task was not changed: $($_.Exception.Message)"
        Write-Warning 'This is usually expected on Windows accounts without a password. Your existing server task can remain unchanged.'
    }
} else {
    Write-Host 'Skipped scheduled task changes to avoid Windows password prompts.' -ForegroundColor Yellow
    Write-Host 'Your existing server startup task was left unchanged.' -ForegroundColor Yellow
}

Write-Host "Setup complete. The update button was created on the desktop: $buttonPath" -ForegroundColor Green
