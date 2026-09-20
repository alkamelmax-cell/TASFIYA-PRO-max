param(
    [string]$AppPath = (Split-Path -Parent $PSScriptRoot),
    [string]$TaskName = 'Tasfiya Local Web Server',
    [int]$Port = 4000,
    [switch]$RunAsSystem
)

$ErrorActionPreference = 'Stop'

function Read-LocalDatabaseUrl {
    $user = Read-Host 'Local PostgreSQL user [tasfiya_app]'
    if ([string]::IsNullOrWhiteSpace($user)) { $user = 'tasfiya_app' }
    $database = Read-Host 'Local PostgreSQL database [tasfiya]'
    if ([string]::IsNullOrWhiteSpace($database)) { $database = 'tasfiya' }
    if ($user -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$' -or $database -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') {
        throw 'The local PostgreSQL user and database names contain unsupported characters.'
    }

    $secureValue = Read-Host 'Local PostgreSQL password (input hidden)' -AsSecureString
    $password = [System.Net.NetworkCredential]::new('', $secureValue).Password
    if ([string]::IsNullOrEmpty($password)) { throw 'A local PostgreSQL password is required.' }

    return "postgresql://$([Uri]::EscapeDataString($user)):$([Uri]::EscapeDataString($password))@127.0.0.1:5432/$([Uri]::EscapeDataString($database))?sslmode=disable"
}

if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535.' }

$resolvedAppPath = (Resolve-Path -LiteralPath $AppPath).Path
$entryPoint = Join-Path $resolvedAppPath 'src\start-web.js'
$runnerPath = Join-Path $resolvedAppPath 'scripts\run-local-web-server.ps1'
if (-not (Test-Path -LiteralPath $entryPoint -PathType Leaf) -or -not (Test-Path -LiteralPath $runnerPath -PathType Leaf)) {
    throw 'AppPath must be the current Tasfiya Pro server-release folder.'
}

$nodeCommand = Get-Command node.exe -ErrorAction Stop
$databaseUrl = Read-LocalDatabaseUrl
$configDirectory = Join-Path $env:ProgramData 'TasfiyaPro'
$configPath = Join-Path $configDirectory 'web-server.json'
$logPath = Join-Path $configDirectory 'web-server.log'
New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null

$config = [ordered]@{
    appPath = $resolvedAppPath
    databaseUrl = $databaseUrl
    port = $Port
    nodePath = $nodeCommand.Source
    logPath = $logPath
} | ConvertTo-Json
[System.IO.File]::WriteAllText($configPath, $config, [System.Text.UTF8Encoding]::new($false))

# The password is intentionally outside Git. SYSTEM runs the service, while
# local Administrators retain full control so a future server release can
# safely update the non-secret application path without taking ownership.
& icacls.exe $configPath '/inheritance:r' '/grant:r' 'SYSTEM:(R)' 'Administrators:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not secure the web server configuration file.' }

$actionArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`" -ConfigPath `"$configPath`""
$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArguments
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

if (-not $RunAsSystem) {
    throw 'Use -RunAsSystem for the local server. It avoids Windows password-policy failures.'
}

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $principal -Force | Out-Null

$databaseUrl = $null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Installed and started '$TaskName'. Local PostgreSQL configuration is stored outside the project at $configPath" -ForegroundColor Green
