#requires -Version 7.0
param([Parameter(Mandatory)][string]$Tag)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Tag -notmatch '^v\d+\.\d+\.\d+$') { throw 'Only stable vX.Y.Z tags are accepted.' }
$repo = 'yyahz/umamusume-seed-optimizer'
$releaseJson = gh api "repos/$repo/releases/tags/$Tag"
if ($LASTEXITCODE) { throw 'Cannot read Release metadata.' }
$release = $releaseJson | ConvertFrom-Json
if ($release.draft -or $release.prerelease -or $release.tag_name -ne $Tag) { throw 'Not a stable published Release.' }
$name = "umamusume-seed-optimizer-$Tag.zip"
$assets = @($release.assets | Where-Object name -eq $name)
if ($assets.Count -ne 1 -or $assets[0].digest -notmatch '^sha256:[a-fA-F0-9]{64}$') { throw 'Missing unique ZIP or SHA256 digest.' }
$taskRoot = Join-Path (Get-Location) '.tmp/store-release'
if (Test-Path -LiteralPath $taskRoot) { throw 'Temporary release directory already exists; use a fresh workspace.' }
New-Item -ItemType Directory -Path $taskRoot | Out-Null
gh release download $Tag --repo $repo --pattern $name --dir $taskRoot
if ($LASTEXITCODE) { throw 'ZIP download failed.' }
$zipPath = Join-Path $taskRoot $name
$actualHash = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if (('sha256:' + $actualHash) -ne $assets[0].digest) { throw 'ZIP SHA256 mismatch.' }
$sourceRoot = Join-Path $taskRoot 'source'
git worktree add --detach $sourceRoot "refs/tags/$Tag"
if ($LASTEXITCODE) { throw 'Release source checkout failed.' }
$allowed = @('manifest.json','_locales/zh_CN/messages.json','background.js','page-bridge.js','ranking.js','gold-skill-map.js','traditional-name-map.js','factor-recognizer.js','request-guard.js','content.js','README.md','PRIVACY.md','LICENSE','THIRD_PARTY_NOTICES.md','icons/icon-16.png','icons/icon-32.png','icons/icon-48.png','icons/icon-128.png')
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($entry in $archive.Entries) {
    $entryName = $entry.FullName.Replace('\','/')
    if ($entryName.EndsWith('/')) { continue }
    if ($entryName -cnotin $allowed -or !$seen.Add($entryName) -or $entry.Length -gt 10MB) { throw 'Unexpected ZIP entry.' }
    $stream = $entry.Open()
    $memory = [IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); $bytes = $memory.ToArray() } finally { $stream.Dispose(); $memory.Dispose() }
    $sourceBytes = [IO.File]::ReadAllBytes((Join-Path $sourceRoot $entryName))
    # Git checkout on Linux preserves repository bytes; compare text after normalizing Windows release line endings.
    if ($entryName.EndsWith('.png')) {
      if ([Convert]::ToBase64String($bytes) -cne [Convert]::ToBase64String($sourceBytes)) { throw "Source mismatch: $entryName" }
    } else {
      $text = [Text.Encoding]::UTF8.GetString($bytes).Replace("`r`n","`n")
      $sourceText = [Text.Encoding]::UTF8.GetString($sourceBytes).Replace("`r`n","`n")
      if ($text -cne $sourceText) { throw "Source mismatch: $entryName" }
      if ($text -match '(?i)([a-z]:[\\/]+Users[\\/]|bbid=|share_session_id=|ghp_[a-z0-9]{20}|github_pat_|-----BEGIN .*PRIVATE KEY)') { throw "Privacy check failed: $entryName" }
    }
  }
  if ($seen.Count -ne $allowed.Count) { throw 'Incomplete release ZIP.' }
} finally { $archive.Dispose() }
$manifest = Get-Content (Join-Path $sourceRoot 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne $Tag.Substring(1) -or $manifest.manifest_version -ne 3) { throw 'Manifest version mismatch.' }
$testFiles = @(Get-ChildItem (Join-Path $sourceRoot 'tests') -Filter '*.test.cjs' | ForEach-Object FullName)
if (!$testFiles.Count) { throw 'Missing release tests.' }
node --test @testFiles
if ($LASTEXITCODE) { throw 'Release tests failed.' }
if ($env:GITHUB_ENV) {
  "STORE_ZIP=$zipPath" | Out-File $env:GITHUB_ENV -Append -Encoding utf8
  "STORE_VERSION=$($manifest.version)" | Out-File $env:GITHUB_ENV -Append -Encoding utf8
  "STORE_SHA256=$actualHash" | Out-File $env:GITHUB_ENV -Append -Encoding utf8
}
if ($env:GITHUB_STEP_SUMMARY) { "Verified $Tag ZIP, SHA256, source contents and release tests. Validation alone does not contact either store." | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8 }
Write-Host "Release $Tag validation passed."
