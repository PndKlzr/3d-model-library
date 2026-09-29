param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$resolvedRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$launcherPath = Join-Path $resolvedRoot "start-3d-model-library.cmd"

if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  throw "Development launcher not found: $launcherPath"
}

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "3D Model Library (Development).lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.WorkingDirectory = $resolvedRoot
$shortcut.Description = "Open 3D Model Library from the local source checkout"
$shortcut.Save()

Write-Output "Shortcut created: $shortcutPath"
