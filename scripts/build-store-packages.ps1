#requires -Version 5.1

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'dist'))
$manifestPath = Join-Path $repoRoot 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$manifest.version

if ($version -notmatch '^\d+(\.\d+){1,3}$') {
    throw "manifest.json 中的版本号无效：$version"
}

$runtimeFiles = @(
    'manifest.json',
    'page-bridge.js',
    'ranking.js',
    'factor-recognizer.js',
    'content.js',
    'LICENSE',
    'icons/icon-16.png',
    'icons/icon-32.png',
    'icons/icon-48.png',
    'icons/icon-128.png'
)

New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
$stageRoot = [System.IO.Path]::GetFullPath((Join-Path $distRoot "store-stage-v$version"))
if (-not $stageRoot.StartsWith($distRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝清理 dist 目录之外的路径：$stageRoot"
}
if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stageRoot | Out-Null

foreach ($relativePath in $runtimeFiles) {
    $sourcePath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "缺少发布文件：$relativePath"
    }
    $destinationPath = Join-Path $stageRoot $relativePath
    $destinationDirectory = Split-Path -Parent $destinationPath
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
}

$chromeZip = Join-Path $distRoot "umamusume-seed-optimizer-chrome-v$version.zip"
$edgeZip = Join-Path $distRoot "umamusume-seed-optimizer-edge-v$version.zip"
foreach ($zipPath in @($chromeZip, $edgeZip)) {
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
}

Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $chromeZip -CompressionLevel Optimal
Copy-Item -LiteralPath $chromeZip -Destination $edgeZip

Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($zipPath in @($chromeZip, $edgeZip)) {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
        if ($entries -notcontains 'manifest.json') {
            throw "压缩包根目录缺少 manifest.json：$zipPath"
        }
        $unexpected = @($entries | Where-Object { $_ -and ($_ -notin $runtimeFiles) -and ($_ -notmatch '/$') })
        if ($unexpected.Count -gt 0) {
            throw "压缩包包含未授权文件：$($unexpected -join ', ')"
        }
        $sensitive = @($entries | Where-Object { $_ -match '(?i)(test|reverse-notes|\.git|dist|cookie|session|credential|secret|\.env)' })
        if ($sensitive.Count -gt 0) {
            throw "压缩包疑似包含测试或敏感文件：$($sensitive -join ', ')"
        }
    }
    finally {
        $archive.Dispose()
    }
}

Remove-Item -LiteralPath $stageRoot -Recurse -Force

Get-Item -LiteralPath $chromeZip, $edgeZip | Select-Object Name, Length, FullName
