param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    throw "Web server configuration was not found: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$requiredFields = @('appPath', 'databaseUrl', 'port', 'nodePath', 'logPath')
foreach ($field in $requiredFields) {
    if ([string]::IsNullOrWhiteSpace([string]$config.$field)) {
        throw "Web server configuration is missing '$field'."
    }
}

$databaseUri = [Uri]$config.databaseUrl
if ($databaseUri.Scheme -notin @('postgres', 'postgresql') -or $databaseUri.Host -notin @('127.0.0.1', '::1')) {
    throw 'The configured PostgreSQL database must use 127.0.0.1 or ::1.'
}

$serverEntryPoint = Join-Path $config.appPath 'src\start-web.js'
if (-not (Test-Path -LiteralPath $serverEntryPoint -PathType Leaf)) { throw "Web server entry point was not found: $serverEntryPoint" }
if (-not (Test-Path -LiteralPath $config.nodePath -PathType Leaf)) { throw "Node.js was not found: $($config.nodePath)" }

$logDirectory = Split-Path -Parent $config.logPath
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$env:DATABASE_URL = $config.databaseUrl
$env:TASFIYA_REQUIRE_LOCAL_POSTGRES = '1'
$env:PORT = [string]$config.port
Set-Location -LiteralPath $config.appPath

# Keep the service alive and keep ordinary Node stderr in the private log.
$ErrorActionPreference = 'Continue'
while ($true) {
    "[$(Get-Date -Format o)] Starting Tasfiya Pro web server on port $($config.port)." | Out-File -LiteralPath $config.logPath -Append -Encoding utf8
    & $config.nodePath '--trace-uncaught' '--trace-warnings' $serverEntryPoint *>> $config.logPath
    "[$(Get-Date -Format o)] Node exited with code $LASTEXITCODE. Restarting in 5 seconds." | Out-File -LiteralPath $config.logPath -Append -Encoding utf8
    Start-Sleep -Seconds 5
}
