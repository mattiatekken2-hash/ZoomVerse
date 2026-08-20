Add-Type -AssemblyName System.Drawing
$path = (Resolve-Path (Join-Path $PSScriptRoot "..\artifacts\zoom-master\public\assets\zoom-cube-icon.png")).Path
$bmp = New-Object System.Drawing.Bitmap($path)
$w = $bmp.Width
$h = $bmp.Height
$opaque = 0
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    if ($bmp.GetPixel($x, $y).A -gt 8) { $opaque++ }
  }
}
Write-Output "opaque pixels: $opaque / $($w*$h)"
$bmp.Dispose()
