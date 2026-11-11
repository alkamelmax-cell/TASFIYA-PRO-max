[CmdletBinding()]
param(
    [string]$RepositoryPath = ''
)

$ErrorActionPreference = 'Stop'
$expectedCommit = '625b8435e36fa411ef8abf944b78c67d206a7aad'
$expectedRelease = 'server-release-balance-number-2'

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'افتح PowerShell بصفة مسؤول ثم أعد تشغيل الملف.'
    }

    $git = Get-Command git.exe -ErrorAction Stop
    if (-not $RepositoryPath) {
        $desktop = [Environment]::GetFolderPath('Desktop')
        $buttonPath = Join-Path $desktop 'تحديث خادم تصفية برو.cmd'
        if (-not (Test-Path -LiteralPath $buttonPath -PathType Leaf)) {
            throw 'لم يتم العثور على زر تحديث الخادم على سطح المكتب. شغّل الملف مع المعامل -RepositoryPath وحدد مجلد نسخة الخادم.'
        }
        $button = Get-Content -LiteralPath $buttonPath -Raw
        $match = [regex]::Match($button, '(?im)^\s*cd\s+/d\s+"([^"]+)"\s*$')
        if (-not $match.Success) {
            throw 'تعذر تحديد مجلد الخادم من زر التحديث. شغّل الملف مع المعامل -RepositoryPath وحدد مجلد نسخة الخادم.'
        }
        $RepositoryPath = $match.Groups[1].Value
    }

    $repo = (Resolve-Path -LiteralPath $RepositoryPath -ErrorAction Stop).Path
    $branch = (& $git.Source -C $repo branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'server-release') {
        throw 'مجلد الخادم ليس على فرع server-release؛ لم يتم تطبيق التحديث.'
    }
    $changes = @(& $git.Source -C $repo status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0 -or $changes.Count -gt 0) {
        throw 'توجد تغييرات محلية في ملفات الخادم أو تعذر فحصها؛ لم يتم تطبيق التحديث.'
    }

    Write-Host 'جاري جلب تحديث الخادم...' -ForegroundColor Cyan
    & $git.Source -C $repo fetch origin server-release
    if ($LASTEXITCODE -ne 0) { throw 'تعذر جلب تحديث الخادم من GitHub.' }

    & $git.Source -C $repo cat-file -e "$expectedCommit^{commit}"
    if ($LASTEXITCODE -ne 0) { throw 'إصدار التحديث المطلوب غير موجود في المستودع.' }
    & $git.Source -C $repo merge --ff-only $expectedCommit
    if ($LASTEXITCODE -ne 0) { throw 'تعذر تحديث مجلد الخادم بأمان؛ بقي الخادم الحالي دون تبديل.' }

    $installer = Join-Path $repo 'scripts\update-active-web-features.ps1'
    if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
        throw 'لم يتم العثور على أداة تثبيت تحديث الويب.'
    }
    Write-Host 'جاري تجهيز إصدار الويب والتحقق منه قبل التبديل...' -ForegroundColor Cyan
    & $installer

    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/api/server-version' -TimeoutSec 15
    if ($response.release -ne $expectedRelease -or $response.bank_balance_number -ne $true) {
        throw 'لم يتم التحقق من إصدار رقم الموازنة على منفذ الخادم المحلي 4000.'
    }
    Write-Host 'SUCCESS: تم تشغيل تحديث رقم الموازنة والتحقق منه محليًا.' -ForegroundColor Green
    exit 0
} catch {
    Write-Error "فشل تحديث الخادم: $($_.Exception.Message)"
    exit 1
}


