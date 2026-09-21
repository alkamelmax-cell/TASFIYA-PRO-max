[CmdletBinding()]
param(
    [string]$TargetPath = 'C:\TasfiyaProServer',
    [string]$ConfigPath = 'C:\ProgramData\TasfiyaPro\web-server.json',
    [switch]$CheckOnly
)

# Overlay only the web module. Preserve the active server's database adapter,
# migrations, startup, sync code, node_modules and original connection settings.
$ErrorActionPreference = 'Stop'
$expectedRelease = 'server-release-2026-09-21.reports.1'
$taskName = 'TasfiyaPro-WebFeatures'
$sourceRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$targetRoot = (Resolve-Path -LiteralPath $TargetPath).Path.TrimEnd('\')
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Open PowerShell as Administrator, then run this script again.'
}
if ($targetRoot -eq [IO.Path]::GetPathRoot($targetRoot).TrimEnd('\') -or $targetRoot -eq $sourceRoot) {
    throw 'TargetPath must be the separate, existing local web server folder.'
}
foreach ($relative in @('src\start-web.js', 'src\postgres-database.js', 'src\local-server.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $targetRoot $relative) -PathType Leaf)) {
        throw "Not an existing Tasfiya web server: missing $relative"
    }
}
$cfg = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$databaseUri = [Uri]$cfg.databaseUrl
if ($databaseUri.Scheme -notin @('postgres', 'postgresql') -or $databaseUri.Host -notin @('127.0.0.1', '::1', '[::1]')) {
    throw 'Existing configuration does not use local PostgreSQL. No changes made.'
}
$node = [string]$cfg.nodePath
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Configured Node executable was not found.' }
$npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
if (-not (Test-Path -LiteralPath $npm)) { throw 'npm.cmd was not found beside Node.' }
$git = (Get-Command git.exe -ErrorAction Stop).Source
$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$releaseRoot = Join-Path $targetRoot ".web-feature-releases\$stamp"
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
$archive = Join-Path $releaseRoot 'source.zip'
$webFiles = @(
    'src/local-server.js', 'src/reconciliation-pdf-service.js',
    'src/operational-reports-pdf-service.js', 'src/professional-pdf-renderer.js',
    'src/report-pdf-templates.js', 'src/sync-runtime-identity.js',
    'src/security/auth-service.js', 'src/security/web-session-store.js',
    'src/web-dashboard', 'scripts/check-web-features.cjs',
    'scripts/run-web-features.ps1', 'scripts/web-features-runtime'
)
& $git -C $sourceRoot archive --format=zip "--output=$archive" HEAD -- @webFiles
if ($LASTEXITCODE -ne 0) { throw 'Could not stage the committed web release. Live files are unchanged.' }
Expand-Archive -LiteralPath $archive -DestinationPath $releaseRoot
Copy-Item -LiteralPath (Join-Path $releaseRoot 'scripts\web-features-runtime\package.json') -Destination $releaseRoot
Copy-Item -LiteralPath (Join-Path $releaseRoot 'scripts\web-features-runtime\package-lock.json') -Destination $releaseRoot
if (-not (Select-String -LiteralPath (Join-Path $releaseRoot 'src\local-server.js') -SimpleMatch $expectedRelease -Quiet)) {
    throw 'Staged release marker does not match this installer. Fetch the current server-release first.'
}
Write-Host 'Preparing isolated report dependencies. The current server stays running...' -ForegroundColor Cyan
& $npm ci --prefix $releaseRoot --omit=dev --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Report dependency install failed. Live files are unchanged.' }

Write-Host 'Checking local PostgreSQL and four real PDF reports using a read-only session...' -ForegroundColor Cyan
& $node (Join-Path $releaseRoot 'scripts\check-web-features.cjs') $targetRoot $releaseRoot $ConfigPath
if ($LASTEXITCODE -ne 0) { throw "Preflight failed. Current server and tasks were NOT changed. Staged files: $releaseRoot" }
if ($CheckOnly) {
    Write-Host 'CHECK PASSED. No running task, application file or connection setting was changed.' -ForegroundColor Green
    exit 0
}

function Contains-LiteralPath([string]$Text, [string]$Value) {
    return $Text.IndexOf($Value, [StringComparison]::OrdinalIgnoreCase) -ge 0
}
function Has-PathArgument([string]$Text, [string]$Value) {
    return $Text -match ('(?i)(?:^|[\s"''])' + [regex]::Escape($Value) + '(?=$|[\s"''])')
}
function Is-OwnedCommand([string]$Text) {
    if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
    foreach ($root in @($targetRoot, $sourceRoot)) {
        foreach ($file in @('src\start-web.js', 'start-server.cmd', 'start-server-hidden.vbs')) {
            if (Has-PathArgument $Text (Join-Path $root $file)) { return $true }
        }
    }
    # Legacy task names differ, but the shared config and exact runner identify them.
    if ($Text -match 'run-local-web-server\.ps1' -and (Has-PathArgument $Text $ConfigPath)) { return $true }
    if ($Text -match 'run-web-features\.ps1' -and (Contains-LiteralPath $Text (Join-Path $targetRoot '.web-feature-releases\'))) { return $true }
    return $false
}
function Owned-Processes {
    return @(Get-CimInstance Win32_Process | Where-Object {
        $_.ProcessId -ne $PID -and $_.Name -in @('node.exe', 'powershell.exe', 'pwsh.exe', 'cmd.exe', 'wscript.exe') -and
        (Is-OwnedCommand ([string]$_.CommandLine))
    })
}
function Stop-OwnedProcesses {
    # Stop supervising shells before children; never kill an arbitrary port owner.
    $owned = @(Owned-Processes | Sort-Object @{ Expression = { if ($_.Name -eq 'node.exe') { 1 } else { 0 } } })
    foreach ($process in $owned) {
        $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ProcessId)" -ErrorAction SilentlyContinue
        if ($current -and $current.CreationDate -eq $process.CreationDate -and (Is-OwnedCommand ([string]$current.CommandLine))) {
            Stop-Process -Id $current.ProcessId -Force -ErrorAction Stop
        }
    }
}

$taskRecords = @()
foreach ($task in @(Get-ScheduledTask)) {
    $ownedTask = @($task.Actions | Where-Object { Is-OwnedCommand ([string]$_.Execute + ' ' + [string]$_.Arguments) }).Count -gt 0
    if ($task.TaskName -eq $taskName -and -not $ownedTask) { throw 'The new task name is already used by an unrelated task.' }
    if ($ownedTask) {
        $taskRecords += [pscustomobject]@{
            Name = $task.TaskName; Path = $task.TaskPath; Enabled = [bool]$task.Settings.Enabled
            WasRunning = ($task.State -eq 'Running')
            Xml = (Export-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath)
        }
    }
}
if ($taskRecords.Count -eq 0) { throw 'No matching Tasfiya startup task found. Stopped before changing the running server.' }
$ownedIds = @(Owned-Processes | ForEach-Object { [int]$_.ProcessId })
foreach ($listener in @(Get-NetTCPConnection -State Listen -LocalPort 4000 -ErrorAction SilentlyContinue)) {
    if ([int]$listener.OwningProcess -notin $ownedIds) {
        throw "Port 4000 belongs to an unrecognized process ($($listener.OwningProcess)). It will not be stopped."
    }
}

# Private rollback directory is secured BEFORE writing settings or task XML.
$privateRoot = Join-Path $env:ProgramData "TasfiyaPro\WebFeatures\$stamp"
New-Item -ItemType Directory -Path $privateRoot -Force | Out-Null
& icacls.exe $privateRoot '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not secure the rollback/config directory.' }
$modulePath = Join-Path $targetRoot 'src\local-server.js'
$backupModule = Join-Path $privateRoot 'local-server.previous.js'
Copy-Item -LiteralPath $modulePath -Destination $backupModule
$taskRecords | ConvertTo-Json -Depth 8 | Out-File -LiteralPath (Join-Path $privateRoot 'previous-tasks.json') -Encoding utf8
$newConfigPath = Join-Path $privateRoot 'runtime.json'
$cfg.appPath = $targetRoot
$cfg.port = 4000
$cfg.logPath = Join-Path $privateRoot 'server.log'
[IO.File]::WriteAllText($newConfigPath, ($cfg | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
$dbAdapter = Join-Path $targetRoot 'src\postgres-database.js'
$dbHash = (Get-FileHash -LiteralPath $dbAdapter).Hash
$startupHash = (Get-FileHash -LiteralPath (Join-Path $targetRoot 'src\start-web.js')).Hash
$switched = $false
$createdTask = $false
$changedTaskState = $false

try {
    Write-Host "Preflight passed. Switching web features in $targetRoot; rollback saved at $privateRoot" -ForegroundColor Cyan
    $changedTaskState = $true
    foreach ($task in $taskRecords) {
        Disable-ScheduledTask -TaskName $task.Name -TaskPath $task.Path | Out-Null
        Stop-ScheduledTask -TaskName $task.Name -TaskPath $task.Path
    }
    Stop-OwnedProcesses
    Start-Sleep -Seconds 2
    if (@(Get-NetTCPConnection -State Listen -LocalPort 4000 -ErrorAction SilentlyContinue).Count) {
        throw 'Port 4000 is still in use. Switching was cancelled.'
    }
    # One small module redirect; all other original application files are preserved.
    $redirect = "module.exports = require('../.web-feature-releases/$stamp/src/local-server.js');`r`n"
    $temporaryModule = Join-Path $targetRoot "src\local-server.$stamp.new"
    [IO.File]::WriteAllText($temporaryModule, $redirect, [Text.UTF8Encoding]::new($false))
    # File.Replace requires a valid backup path on Windows PowerShell; passing
    # $null selects an invalid overload and fails after preflight. Keep the
    # rollback copy and provide a second valid replacement backup path.
    $replaceBackup = Join-Path $privateRoot 'local-server.replace-backup.js'
    [IO.File]::Replace($temporaryModule, $modulePath, $replaceBackup, $true)
    $switched = $true
    $runner = Join-Path $releaseRoot 'scripts\run-web-features.ps1'
    $action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -ConfigPath `"$newConfigPath`"" -WorkingDirectory $targetRoot
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    $servicePrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $settings -Principal $servicePrincipal -Force | Out-Null
    $createdTask = $true
    Start-ScheduledTask -TaskName $taskName
    $ready = $false
    $deadline = (Get-Date).AddSeconds(120)
    do {
        try {
            $version = Invoke-RestMethod 'http://127.0.0.1:4000/api/server-version' -TimeoutSec 4
            $ready = $version.release -eq $expectedRelease -and $version.customer_ledger_pdf_delivery -and $version.reconciliation_pdf_delivery
        } catch { $ready = $false }
        if (-not $ready) { Write-Host 'Waiting for the verified web release on port 4000...'; Start-Sleep -Seconds 3 }
    } while (-not $ready -and (Get-Date) -lt $deadline)
    if (-not $ready) { throw "New release did not become ready. See $($cfg.logPath)" }
    if ((Get-FileHash -LiteralPath $dbAdapter).Hash -ne $dbHash -or (Get-FileHash -LiteralPath (Join-Path $targetRoot 'src\start-web.js')).Hash -ne $startupHash) {
        throw 'Original database/startup file changed unexpectedly.'
    }
    Write-Host "SUCCESS: $expectedRelease is serving port 4000." -ForegroundColor Green
    Write-Host 'Four PDF preflight checks passed. Original database adapter, startup and shared connection config were preserved.' -ForegroundColor Green
    Write-Host "Rollback files and startup log: $privateRoot"
    Write-Host 'Tailscale was not changed; its existing 127.0.0.1:4000 target now serves this release.'
} catch {
    $failure = $_.Exception.Message
    Write-Warning "Switch failed: $failure"
    try {
        if ($createdTask) {
            Disable-ScheduledTask -TaskName $taskName | Out-Null
            Stop-ScheduledTask -TaskName $taskName
            Stop-OwnedProcesses
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        }
        if ($switched) { Copy-Item -LiteralPath $backupModule -Destination $modulePath -Force }
        if ($changedTaskState) {
            foreach ($task in $taskRecords) {
                if ($task.Name -eq $taskName) {
                    Register-ScheduledTask -TaskName $task.Name -TaskPath $task.Path -Xml $task.Xml -Force | Out-Null
                }
                if ($task.Enabled) { Enable-ScheduledTask -TaskName $task.Name -TaskPath $task.Path | Out-Null }
                if ($task.WasRunning) { Start-ScheduledTask -TaskName $task.Name -TaskPath $task.Path }
            }
        }
        Write-Warning "Previous web module/task settings restored. Startup recovery must be checked in Windows. Backup: $privateRoot"
    } catch { Write-Warning "Automatic rollback needs attention: $($_.Exception.Message). Backup: $privateRoot" }
    throw $failure
}
