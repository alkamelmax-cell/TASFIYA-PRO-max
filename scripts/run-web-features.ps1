param([Parameter(Mandatory = $true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$cfg = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$dbUri = [Uri]$cfg.databaseUrl
if ($dbUri.Scheme -notin @('postgres', 'postgresql') -or $dbUri.Host -notin @('127.0.0.1', '::1', '[::1]')) {
    throw 'Refusing a non-local database.'
}
$env:DATABASE_URL = $cfg.databaseUrl
$env:TASFIYA_REQUIRE_LOCAL_POSTGRES = '1'
$env:TASFIYA_STRICT_PORT = '1'
$env:PORT = [string]$cfg.port
Set-Location -LiteralPath $cfg.appPath
# One task owns one Node child. The scheduler restarts failed runs; no detached watchdog.
$ErrorActionPreference = 'Continue'
& $cfg.nodePath (Join-Path $cfg.appPath 'src\start-web.js') *>> $cfg.logPath
exit $LASTEXITCODE
