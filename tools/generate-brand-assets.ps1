param(
    [string]$SourcePath = 'C:\Users\KC\Downloads\logoo (1).png'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$webAssets = Join-Path $projectRoot 'src\web-dashboard\assets'
$desktopAssets = Join-Path $projectRoot 'assets'
$senderAssets = Join-Path $projectRoot 'src\client-sender\assets'

if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Logo source not found: $SourcePath"
}

function New-Canvas([int]$Width, [int]$Height) {
    return [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Save-Png([System.Drawing.Image]$Image, [string]$Path) {
    $Image.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-TransparentCrop([System.Drawing.Bitmap]$Source, [System.Drawing.Rectangle]$Crop) {
    $result = New-Canvas $Crop.Width $Crop.Height
    for ($y = 0; $y -lt $Crop.Height; $y++) {
        for ($x = 0; $x -lt $Crop.Width; $x++) {
            $pixel = $Source.GetPixel($Crop.X + $x, $Crop.Y + $y)
            # The uploaded source is on a white canvas.  Remove only neutral near-white
            # pixels so the dark navy and turquoise artwork stays exactly intact.
            $isNearWhite = $pixel.R -ge 244 -and $pixel.G -ge 244 -and $pixel.B -ge 244 -and
                ([Math]::Abs($pixel.R - $pixel.G) -lt 8) -and ([Math]::Abs($pixel.G - $pixel.B) -lt 8)
            if ($isNearWhite) {
                $result.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
            } else {
                $result.SetPixel($x, $y, $pixel)
            }
        }
    }
    return $result
}

function New-ScaledImage([System.Drawing.Image]$Source, [int]$Size, [int]$Padding = 0) {
    $canvas = New-Canvas $Size $Size
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $available = $Size - (2 * $Padding)
        $ratio = [Math]::Min($available / $Source.Width, $available / $Source.Height)
        $width = [int][Math]::Round($Source.Width * $ratio)
        $height = [int][Math]::Round($Source.Height * $ratio)
        $x = [int][Math]::Round(($Size - $width) / 2)
        $y = [int][Math]::Round(($Size - $height) / 2)
        $graphics.DrawImage($Source, [System.Drawing.Rectangle]::new($x, $y, $width, $height))
    } finally {
        $graphics.Dispose()
    }
    return $canvas
}

function New-BrandIcon([System.Drawing.Image]$CheckMark, [int]$Size, [bool]$Maskable = $false) {
    $canvas = New-Canvas $Size $Size
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        # Regular web/desktop icons are transparent outside the round mark, so
        # they do not look like a dated dark square in browser UI.  Maskable
        # Android assets keep a solid safe background by design.
        $graphics.Clear([System.Drawing.Color]::Transparent)
        if ($Maskable) {
            $safeBackground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 9, 30, 55))
            $graphics.FillRectangle($safeBackground, 0, 0, $Size, $Size)
            $safeBackground.Dispose()
        }

        $inset = if ($Maskable) { [int]($Size * .10) } else { [int]($Size * .055) }
        $diameter = $Size - (2 * $inset)
        $outerBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
            [System.Drawing.Rectangle]::new($inset, $inset, $diameter, $diameter),
            [System.Drawing.Color]::FromArgb(255, 15, 57, 91),
            [System.Drawing.Color]::FromArgb(255, 10, 36, 66),
            45
        )
        $graphics.FillEllipse($outerBrush, $inset, $inset, $diameter, $diameter)
        $outerBrush.Dispose()

        $ringPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(150, 101, 212, 202), [Math]::Max(2, [int]($Size * .012)))
        $graphics.DrawEllipse($ringPen, $inset + [int]($Size * .04), $inset + [int]($Size * .04), $diameter - [int]($Size * .08), $diameter - [int]($Size * .08))
        $ringPen.Dispose()

        $markFactor = if ($Maskable) { .55 } else { .64 }
        $markSize = [int]($Size * $markFactor)
        $markX = [int](($Size - $markSize) / 2)
        $markY = [int](($Size - $markSize) / 2)
        $graphics.DrawImage($CheckMark, [System.Drawing.Rectangle]::new($markX, $markY, $markSize, $markSize))
    } finally {
        $graphics.Dispose()
    }
    return $canvas
}

$source = [System.Drawing.Bitmap]::FromFile($SourcePath)
$fullLogo = $null
$checkMark = $null
try {
    # Keep the complete Arabic/English logo without its large white page margins.
    $fullLogo = New-TransparentCrop $source ([System.Drawing.Rectangle]::new(105, 165, 1045, 885))
    # The check is the clearest recognizable part at notification/favicon sizes.
    $checkMark = New-TransparentCrop $source ([System.Drawing.Rectangle]::new(475, 205, 325, 245))

    Copy-Item -LiteralPath $SourcePath -Destination (Join-Path $webAssets 'logo-tasfia-pro-source.png') -Force
    Save-Png $fullLogo (Join-Path $webAssets 'logo-tasfia-pro.png')
    Save-Png $checkMark (Join-Path $webAssets 'logo-tasfia-pro-mark-source.png')

    $iconTargets = @(
        @{ Path = (Join-Path $webAssets 'icon-512.png'); Size = 512; Maskable = $false },
        @{ Path = (Join-Path $webAssets 'icon-192.png'); Size = 192; Maskable = $false },
        @{ Path = (Join-Path $webAssets 'icon-512-maskable.png'); Size = 512; Maskable = $true },
        @{ Path = (Join-Path $webAssets 'icon-192-maskable.png'); Size = 192; Maskable = $true },
        @{ Path = (Join-Path $webAssets 'apple-touch-icon.png'); Size = 180; Maskable = $false },
        @{ Path = (Join-Path $webAssets 'favicon.png'); Size = 64; Maskable = $false },
        @{ Path = (Join-Path $desktopAssets 'icon.png'); Size = 512; Maskable = $false },
        @{ Path = (Join-Path $desktopAssets 'client-sender-icon.png'); Size = 512; Maskable = $false },
        @{ Path = (Join-Path $senderAssets 'favicon-client-sender.png'); Size = 64; Maskable = $false }
    )

    foreach ($target in $iconTargets) {
        $icon = New-BrandIcon $checkMark $target.Size $target.Maskable
        try { Save-Png $icon $target.Path } finally { $icon.Dispose() }
    }

    # The client sender has a 38-48px logo slot; use the compact app mark
    # there, not the full bilingual wordmark which would become unreadable.
    $senderMark = New-BrandIcon $checkMark 512 $false
    try { Save-Png $senderMark (Join-Path $senderAssets 'logo-client-sender.png') } finally { $senderMark.Dispose() }
} finally {
    if ($fullLogo) { $fullLogo.Dispose() }
    if ($checkMark) { $checkMark.Dispose() }
    $source.Dispose()
}

Write-Host 'Brand assets generated successfully.' -ForegroundColor Green
