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

function Get-ListeningProcessIds {
    param([int[]]$Ports)

    $ids = New-Object System.Collections.Generic.HashSet[int]
    $lines = & netstat.exe -ano -p tcp 2>$null
    foreach ($line in $lines) {
        if ($line -notmatch '\bLISTENING\b') {
            continue
        }

        $parts = $line -split '\s+' | Where-Object { $_ }
        if ($parts.Count -lt 5) {
            continue
        }

        $localAddress = $parts[1]
        $pidText = $parts[-1]
        $portText = ($localAddress -replace '^\[?::\]?:(\d+)$', '$1') -replace '^.*:(\d+)$', '$1'
        $port = 0
        $processIdNumber = 0

        if ([int]::TryParse($portText, [ref]$port) -and [int]::TryParse($pidText, [ref]$processIdNumber)) {
            if ($Ports -contains $port -and $processIdNumber -gt 0) {
                [void]$ids.Add($processIdNumber)
            }
        }
    }

    return @($ids.GetEnumerator() | ForEach-Object { [int]$_ })
}

function Wait-ForPortsToClose {
    param(
        [int[]]$Ports,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $remaining = @(Get-ListeningProcessIds -Ports $Ports)
        if ($remaining.Count -eq 0) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    return $false
}

function Wait-ForWebServer {
    param(
        [int]$Port = 4000,
        [int]$TimeoutSeconds = 75
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $listeningPids = @(Get-ListeningProcessIds -Ports @($Port))
        if ($listeningPids.Count -gt 0) {
            return $listeningPids
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    return @()
}

function Stop-ManagedServerProcesses {
    param(
        [string]$TaskName,
        [string]$ServerRoot
    )

    $stoppedSomething = $false

    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        if ($task.State -eq 'Running') {
            Write-Host 'Stopping the scheduled web server task...' -ForegroundColor Yellow
            Stop-ScheduledTask -TaskName $TaskName
            Start-Sleep -Seconds 2
            $stoppedSomething = $true
        }
    } catch {
        Write-Host "Scheduled task was not running or could not be queried: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    $serverRootNormalized = [System.IO.Path]::GetFullPath($ServerRoot).TrimEnd('\')
    $managedProcesses = @()

    try {
        $managedProcesses += Get-CimInstance Win32_Process |
            Where-Object {
                $_.ProcessId -ne $PID -and
                $_.Name -in @('node.exe', 'cmd.exe', 'wscript.exe') -and
                (
                    ($_.CommandLine -and $_.CommandLine.IndexOf($serverRootNormalized, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) -or
                    ($_.CommandLine -and $_.CommandLine.IndexOf('src\start-web.js', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) -or
                    ($_.CommandLine -and $_.CommandLine.IndexOf('run start:web', [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
                )
            }
    } catch {
        Write-Host "Could not inspect managed Node processes: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    foreach ($portPid in (Get-ListeningProcessIds -Ports (4000..4010))) {
        try {
            $process = Get-Process -Id $portPid -ErrorAction Stop
            if ($process.ProcessName -eq 'node') {
                $managedProcesses += Get-CimInstance Win32_Process -Filter "ProcessId = $portPid" -ErrorAction SilentlyContinue
            }
        } catch {
            continue
        }
    }

    $uniqueProcesses = $managedProcesses |
        Where-Object { $_ -and $_.ProcessId -and $_.ProcessId -ne $PID } |
        Sort-Object ProcessId -Unique

    foreach ($process in $uniqueProcesses) {
        try {
            Write-Host "Stopping old server process PID $($process.ProcessId)..." -ForegroundColor Yellow
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            $stoppedSomething = $true
        } catch {
            Write-Host "Could not stop PID $($process.ProcessId): $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }

    if (-not (Wait-ForPortsToClose -Ports (4000..4010))) {
        Write-Host 'Warning: one or more previous web-server ports are still closing.' -ForegroundColor DarkYellow
    }

    return $stoppedSomething
}

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
    $wasRunning = Stop-ManagedServerProcesses -TaskName $TaskName -ServerRoot $serverRoot

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

    Write-Host 'Starting the updated web server and waiting for it to become ready...' -ForegroundColor Yellow
    Start-ScheduledTask -TaskName $TaskName

    # Database migrations can take noticeably longer than a few seconds on a
    # fresh server or a remote PostgreSQL connection.  Do not misreport a
    # completed update as failed merely because the app is still booting.
    $listeningPids = Wait-ForWebServer -Port 4000 -TimeoutSeconds 75
    if ($listeningPids.Count -eq 0) {
        throw 'The web server did not become ready on port 4000 within 75 seconds.'
    }

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
