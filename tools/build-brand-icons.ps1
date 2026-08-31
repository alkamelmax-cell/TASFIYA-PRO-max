param(
    [Parameter(Mandatory = $true)]
    [string]$TransparentLogoPath,
    [Parameter(Mandatory = $true)]
    [string]$AppIconSourcePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$webAssets = Join-Path $projectRoot 'src\web-dashboard\assets'
$desktopAssets = Join-Path $projectRoot 'assets'
$clientAssets = Join-Path $projectRoot 'src\client-sender\assets'

foreach ($path in @($TransparentLogoPath, $AppIconSourcePath)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Brand source was not found: $path"
    }
}

function New-RoundedPath([int]$Size, [int]$Radius) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
    $path.AddArc($Size - $diameter, 0, $diameter, $diameter, 270, 90)
    $path.AddArc($Size - $diameter, $Size - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc(0, $Size - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function Save-RoundedAppIcon([System.Drawing.Image]$Source, [int]$Size, [string]$Destination) {
    $canvas = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $path = $null
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        # Apple/Galaxy-style rounded-square geometry. The source is drawn in full;
        # no artwork is cropped, recoloured, or otherwise changed.
        $path = New-RoundedPath $Size ([int][Math]::Round($Size * 0.225))
        $graphics.SetClip($path)
        $graphics.DrawImage($Source, [System.Drawing.Rectangle]::new(0, 0, $Size, $Size))
        $graphics.ResetClip()
        $canvas.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        if ($path) { $path.Dispose() }
        $graphics.Dispose()
        $canvas.Dispose()
    }
}

Copy-Item -LiteralPath $TransparentLogoPath -Destination (Join-Path $webAssets 'logo-tasfia-pro.png') -Force
Copy-Item -LiteralPath $TransparentLogoPath -Destination (Join-Path $webAssets 'logo-tasfia-pro-source.png') -Force
Copy-Item -LiteralPath $TransparentLogoPath -Destination (Join-Path $desktopAssets 'logo-tasfia-pro.png') -Force

$appIconSource = [System.Drawing.Image]::FromFile($AppIconSourcePath)
try {
    $targets = @(
        @{ Path = (Join-Path $webAssets 'icon-512.png'); Size = 512 },
        @{ Path = (Join-Path $webAssets 'icon-192.png'); Size = 192 },
        @{ Path = (Join-Path $webAssets 'icon-512-maskable.png'); Size = 512 },
        @{ Path = (Join-Path $webAssets 'icon-192-maskable.png'); Size = 192 },
        @{ Path = (Join-Path $webAssets 'apple-touch-icon.png'); Size = 180 },
        @{ Path = (Join-Path $webAssets 'favicon.png'); Size = 64 },
        @{ Path = (Join-Path $desktopAssets 'icon.png'); Size = 512 },
        @{ Path = (Join-Path $desktopAssets 'client-sender-icon.png'); Size = 512 },
        @{ Path = (Join-Path $clientAssets 'logo-client-sender.png'); Size = 512 },
        @{ Path = (Join-Path $clientAssets 'favicon-client-sender.png'); Size = 64 }
    )

    foreach ($target in $targets) {
        Save-RoundedAppIcon $appIconSource $target.Size $target.Path
    }
} finally {
    $appIconSource.Dispose()
}

Write-Host 'Brand assets generated from the supplied files without altering the logo artwork.' -ForegroundColor Green
