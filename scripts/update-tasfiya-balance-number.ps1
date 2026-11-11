[CmdletBinding()]
param(
    [string]$RepositoryPath = ''
)

$ErrorActionPreference = 'Stop'
$expectedCommit = '382addc5c76f843ed438f92a32467ac020a67e96'
$expectedRelease = 'server-release-balance-number-2'

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Open PowerShell as Administrator, then run this script again.'
    }

    $git = Get-Command git.exe -ErrorAction Stop
    if (-not $RepositoryPath) {
        $desktop = [Environment]::GetFolderPath('Desktop')
        $repositoryCandidates = @()
        foreach ($button in @(Get-ChildItem -LiteralPath $desktop -Filter '*.cmd' -File -ErrorAction SilentlyContinue)) {
            $buttonText = Get-Content -LiteralPath $button.FullName -Raw
            $match = [regex]::Match($buttonText, '(?im)^\s*cd\s+/d\s+"([^"]+)"\s*$')
            if ($match.Success) {
                $candidate = $match.Groups[1].Value
                $candidateBranch = [string](& $git.Source -C $candidate branch --show-current 2>$null)
                $candidateBranch = $candidateBranch.Trim()
                if ($LASTEXITCODE -eq 0 -and $candidateBranch -eq 'server-release') {
                    $repositoryCandidates += $candidate
                }
            }
        }
        if ($repositoryCandidates.Count -ne 1) {
            throw 'Could not identify one server-release repository from the desktop command files. Pass -RepositoryPath with the server repository folder.'
        }
        $RepositoryPath = $repositoryCandidates[0]
    }

    $repo = (Resolve-Path -LiteralPath $RepositoryPath -ErrorAction Stop).Path
    $branch = (& $git.Source -C $repo branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'server-release') {
        throw 'The server repository is not on the server-release branch. No update was applied.'
    }
    $changes = @(& $git.Source -C $repo status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0 -or $changes.Count -gt 0) {
        throw 'The server repository has local tracked changes or could not be checked. No update was applied.'
    }

    Write-Host 'Fetching the web server update...' -ForegroundColor Cyan
    & $git.Source -C $repo fetch origin server-release
    if ($LASTEXITCODE -ne 0) { throw 'Could not fetch the web server update from GitHub.' }

    & $git.Source -C $repo cat-file -e "$expectedCommit^{commit}"
    if ($LASTEXITCODE -ne 0) { throw 'The requested update commit is not available in the repository.' }
    & $git.Source -C $repo merge --ff-only $expectedCommit
    if ($LASTEXITCODE -ne 0) { throw 'Could not safely update the server repository. The active server was not switched.' }

    $installer = Join-Path $repo 'scripts\update-active-web-features.ps1'
    if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
        throw 'The web feature installer was not found.'
    }
    Write-Host 'Preparing and checking the web release before switching...' -ForegroundColor Cyan
    & $installer

    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/api/server-version' -TimeoutSec 15
    if ($response.release -ne $expectedRelease -or $response.bank_balance_number -ne $true) {
        throw 'The bank balance number release could not be verified on local port 4000.'
    }
    Write-Host 'SUCCESS: The bank balance number display update is active and verified locally.' -ForegroundColor Green
    exit 0
} catch {
    Write-Error "Server update failed: $($_.Exception.Message)"
    exit 1
}


