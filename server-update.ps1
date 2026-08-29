[CmdletBinding()]
param(
    [string]$TaskName = 'Tasfiya Local Web Server',
    [string]$Branch = 'server-release'
)

$ErrorActionPreference = 'Stop'
$serverRoot = Split-Path -Parent $PSCommandPath
$git = Get-Command git -ErrorAction Stop
$npm = Join-Path $env:ProgramFiles 'nodejs\npm.cmd'
$wasRunning = $false

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & $git.Source @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }
}

try {
    if (-not (Test-Path (Join-Path $serverRoot '.git'))) {
        throw 'This folder is not the managed server release. Run the one-time setup first.'
    }
    if (-not (Test-Path $npm)) {
        throw 'Node.js npm.cmd was not found.'
    }

    Set-Location $serverRoot
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $wasRunning = $task.State -eq 'Running'

    if ($wasRunning) {
        Write-Host 'Stopping the web server...' -ForegroundColor Yellow
        Stop-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 2
    }

    Invoke-Git diff --quiet
    $before = (& $git.Source rev-parse HEAD).Trim()
    Invoke-Git fetch --prune origin $Branch
    $target = (& $git.Source rev-parse "origin/$Branch").Trim()

    if ($before -eq $target) {
        Write-Host 'No new server update is available.' -ForegroundColor Cyan
    } else {
        $backupRoot = Join-Path $serverRoot '_update-backups'
        New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
        $backupName = "before-update-$((Get-Date).ToString('yyyyMMdd-HHmmss'))-$before.zip"
        $backupPath = Join-Path $backupRoot $backupName
        $backupItems = @('src', 'assets', 'package.json', 'package-lock.json', 'start-server.cmd', 'server-update.ps1', 'update-tasfiya-server.cmd') |
            ForEach-Object { Join-Path $serverRoot $_ } |
            Where-Object { Test-Path $_ }
        Compress-Archive -LiteralPath $backupItems -DestinationPath $backupPath -CompressionLevel Optimal

        $packageChanged = @(& $git.Source diff --name-only "$before..$target" -- package.json package-lock.json).Count -gt 0
        Write-Host 'Downloading the server update...' -ForegroundColor Yellow
        Invoke-Git merge --ff-only "origin/$Branch"

        if ($packageChanged) {
            Write-Host 'Updating required packages...' -ForegroundColor Yellow
            & $npm install
            if ($LASTEXITCODE -ne 0) {
                throw 'npm install failed; the update was not started.'
            }
        }

        Write-Host "Server updated. Backup saved to: $backupPath" -ForegroundColor Green
    }

    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 3
    Write-Host 'The web server was started successfully.' -ForegroundColor Green
} catch {
    Write-Host "Update failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($wasRunning) {
        try {
            Start-ScheduledTask -TaskName $TaskName
            Write-Host 'The previous server process was started again.' -ForegroundColor Yellow
        } catch {
            Write-Host "Could not restart the previous server: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    exit 1
}
