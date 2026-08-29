[CmdletBinding()]
param(
    [string]$TaskName = 'Tasfiya Local Web Server'
)

$ErrorActionPreference = 'Stop'
$serverRoot = Split-Path -Parent $PSCommandPath
$savedDatabaseUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'User')

if ([string]::IsNullOrWhiteSpace($savedDatabaseUrl)) {
    throw 'DATABASE_URL is not saved for this Windows user. Configure the Neon connection before installing automatic updates.'
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
if ($task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 2
}

$launcher = Join-Path $serverRoot 'start-server.cmd'
& schtasks.exe /Change /TN $TaskName /TR $launcher
if ($LASTEXITCODE -ne 0) {
    throw 'Could not update the scheduled task launcher.'
}

$desktop = [Environment]::GetFolderPath('Desktop')
$buttonPath = Join-Path $desktop 'تحديث خادم تصفية برو.cmd'
"@echo off`r`ncall `"$serverRoot\update-tasfiya-server.cmd`"`r`n" |
    Set-Content -LiteralPath $buttonPath -Encoding ascii

Start-ScheduledTask -TaskName $TaskName
Write-Host "Setup complete. The update button was created on the desktop: $buttonPath" -ForegroundColor Green
