$ErrorActionPreference = 'Stop'
$targetRoot = 'C:\TasfiyaProServer'
$sourceRoot = 'D:\TasfiyaServer\tasfiya-managed-server-release'
$ConfigPath = 'C:\ProgramData\TasfiyaPro\web-server.json'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..\scripts\update-active-web-features.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
foreach ($name in @('Contains-LiteralPath', 'Has-PathArgument', 'Is-OwnedCommand')) {
    $functionAst = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name}, $true)
    Invoke-Expression $functionAst.Extent.Text
}
$cases = @(
    @('"C:\Program Files\nodejs\node.exe" C:\TasfiyaProServer\src\start-web.js', $true),
    @('node "C:\TasfiyaProServer\src\start-web.js"', $true),
    @('node C:\TasfiyaProServer2\src\start-web.js', $false),
    @('node C:\TasfiyaProServer\src\start-web.js.other', $false),
    @('node C:\OtherApp\server.js', $false),
    @('powershell -File D:\TasfiyaServer\tasfiya-managed-server-release\scripts\run-local-web-server.ps1 -ConfigPath "C:\ProgramData\TasfiyaPro\web-server.json"', $true),
    @('powershell -File C:\Other\run-local-web-server.ps1 -ConfigPath "C:\Other\config.json"', $false)
)
foreach ($case in $cases) { if ((Is-OwnedCommand $case[0]) -ne $case[1]) { throw "Wrong ownership match: $($case[0])" } }
Write-Output 'PASS process/task ownership boundaries (7 cases); no processes stopped'
