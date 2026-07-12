$ErrorActionPreference = "Stop"

$sourcePath = Join-Path $PSScriptRoot "NativeDropProbe.cs"
$outputDirectory = Join-Path $PSScriptRoot "bin"
$outputPath = Join-Path $outputDirectory "NativeDropProbe.exe"
$compilerCandidates = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$compilerPath = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $compilerPath) {
  throw "Compilador C# do Windows nao encontrado."
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
& $compilerPath /nologo /target:winexe /optimize+ /out:$outputPath /reference:System.Windows.Forms.dll /reference:System.Drawing.dll $sourcePath

if ($LASTEXITCODE -ne 0) {
  throw "Falha ao compilar o receptor nativo de drop."
}

Write-Output $outputPath
