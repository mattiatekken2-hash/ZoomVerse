Add-Type -AssemblyName System.Drawing

$assetsDir = (Resolve-Path (Join-Path $PSScriptRoot "..\artifacts\zoom-master\public\assets")).Path
$path = Join-Path $assetsDir "zoom-cube-icon.png"
$srcPath = Join-Path $assetsDir "zoom-cube-icon-source.png"

if (-not (Test-Path $srcPath)) {
  Copy-Item -Force $path $srcPath
}

$loaded = [System.Drawing.Bitmap]::FromFile($srcPath)
$w = [int]$loaded.Width
$h = [int]$loaded.Height
$bmp = $loaded.Clone(
  (New-Object System.Drawing.Rectangle 0, 0, $w, $h),
  [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$loaded.Dispose()

function Test-BgColor([System.Drawing.Color]$c) {
  return ($c.R -lt 55 -and $c.G -lt 55 -and $c.B -lt 55)
}

$visited = New-Object "bool[,]" $w, $h
$queue = New-Object System.Collections.Queue
$changed = 0
$bottom = $h - 1
$right = $w - 1

for ($x = 0; $x -lt $w; $x++) {
  foreach ($y in @(0, $bottom)) {
    if (-not $visited[$x, $y] -and (Test-BgColor ($bmp.GetPixel($x, $y)))) {
      $visited[$x, $y] = $true
      [void]$queue.Enqueue(@($x, $y))
    }
  }
}
for ($y = 0; $y -lt $h; $y++) {
  foreach ($x in @(0, $right)) {
    if (-not $visited[$x, $y] -and (Test-BgColor ($bmp.GetPixel($x, $y)))) {
      $visited[$x, $y] = $true
      [void]$queue.Enqueue(@($x, $y))
    }
  }
}

while ($queue.Count -gt 0) {
  $cur = $queue.Dequeue()
  $x = [int]$cur[0]
  $y = [int]$cur[1]
  $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $changed++

  foreach ($d in @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1))) {
    $nx = $x + [int]$d[0]
    $ny = $y + [int]$d[1]
    if ($nx -ge 0 -and $ny -ge 0 -and $nx -lt $w -and $ny -lt $h -and -not $visited[$nx, $ny]) {
      if (Test-BgColor ($bmp.GetPixel($nx, $ny))) {
        $visited[$nx, $ny] = $true
        [void]$queue.Enqueue(@($nx, $ny))
      }
    }
  }
}

$minX = $w
$minY = $h
$maxX = 0
$maxY = 0
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    if ($bmp.GetPixel($x, $y).A -gt 8) {
      if ($x -lt $minX) { $minX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}

$pad = 8
$minX = [Math]::Max(0, $minX - $pad)
$minY = [Math]::Max(0, $minY - $pad)
$maxX = [Math]::Min($w - 1, $maxX + $pad)
$maxY = [Math]::Min($h - 1, $maxY + $pad)
$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1

$cropped = $bmp.Clone(
  (New-Object System.Drawing.Rectangle $minX, $minY, $cropW, $cropH),
  [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$bmp.Dispose()

$side = [Math]::Max($cropW, $cropH)
$square = New-Object System.Drawing.Bitmap($side, $side)
$gfx = [System.Drawing.Graphics]::FromImage($square)
$gfx.Clear([System.Drawing.Color]::Transparent)
$dx = [int](($side - $cropW) / 2)
$dy = [int](($side - $cropH) / 2)
$gfx.DrawImage($cropped, $dx, $dy)
$gfx.Dispose()
$cropped.Dispose()

$outPath = Join-Path $assetsDir "zoom-cube-icon.png"
$square.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$square.Dispose()
Write-Output "Changed $changed bg pixels; saved square ${side}x${side}"
