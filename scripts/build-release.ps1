#requires -Version 5.1

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'dist'))
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$manifest.version

if ($version -notmatch '^\d+(\.\d+){1,3}$') {
    throw "manifest.json 中的版本号无效：$version"
}

$releaseFiles = @(
    'manifest.json',
    '_locales/zh_CN/messages.json',
    'background.js',
    'page-bridge.js',
    'ranking.js',
    'gold-skill-map.js',
    'traditional-name-map.js',
    'factor-recognizer.js',
    'request-guard.js',
    'content.js',
    'README.md',
    'PRIVACY.md',
    'LICENSE',
    'icons/icon-16.png',
    'icons/icon-32.png',
    'icons/icon-48.png',
    'icons/icon-128.png'
)

New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
$stageRoot = [System.IO.Path]::GetFullPath((Join-Path $distRoot "release-stage-v$version"))
if (-not $stageRoot.StartsWith($distRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝清理 dist 目录之外的路径：$stageRoot"
}
if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stageRoot | Out-Null

foreach ($relativePath in $releaseFiles) {
    $sourcePath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "缺少发布文件：$relativePath"
    }
    $destinationPath = Join-Path $stageRoot $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
}

$zipPath = Join-Path $distRoot "umamusume-seed-optimizer-v$version.zip"
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    if ($entries -notcontains 'manifest.json') {
        throw '发布包根目录缺少 manifest.json'
    }
    $unexpected = @($entries | Where-Object { $_ -and ($_ -notin $releaseFiles) -and ($_ -notmatch '/$') })
    if ($unexpected.Count -gt 0) {
        throw "发布包包含未授权文件：$($unexpected -join ', ')"
    }
}
finally {
    $archive.Dispose()
}

Remove-Item -LiteralPath $stageRoot -Recurse -Force
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Get-Item -LiteralPath $zipPath | Select-Object Name, Length, FullName, @{Name='SHA256';Expression={$hash}}
