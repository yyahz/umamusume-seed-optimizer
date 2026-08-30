#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$SdkRoot = $env:ANDROID_SDK_ROOT
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
$appRoot = Join-Path $projectRoot 'app'
$buildRoot = [System.IO.Path]::GetFullPath((Join-Path $appRoot 'build\manual-debug'))
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $appRoot 'build\outputs\apk\debug'))
$localRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.local'))

if ([string]::IsNullOrWhiteSpace($SdkRoot)) {
    throw '请通过 -SdkRoot 或 ANDROID_SDK_ROOT 指定 Android SDK。'
}
$SdkRoot = [System.IO.Path]::GetFullPath($SdkRoot)

$buildTools = Join-Path $SdkRoot 'build-tools\35.0.0'
$androidJar = Join-Path $SdkRoot 'platforms\android-35\android.jar'
$aapt2 = Join-Path $buildTools 'aapt2.exe'
$d8 = Join-Path $buildTools 'd8.bat'
$zipalign = Join-Path $buildTools 'zipalign.exe'
$apksigner = Join-Path $buildTools 'apksigner.bat'
foreach ($required in @($androidJar, $aapt2, $d8, $zipalign, $apksigner)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "缺少 Android 构建组件：$required"
    }
}

$expectedBuildParent = [System.IO.Path]::GetFullPath((Join-Path $appRoot 'build'))
if (-not $buildRoot.StartsWith($expectedBuildParent + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝清理 app/build 之外的路径：$buildRoot"
}
if (Test-Path -LiteralPath $buildRoot) {
    Remove-Item -LiteralPath $buildRoot -Recurse -Force
}

$compiledRoot = Join-Path $buildRoot 'compiled'
$generatedRoot = Join-Path $buildRoot 'generated'
$classesRoot = Join-Path $buildRoot 'classes'
$dexRoot = Join-Path $buildRoot 'dex'
$assetsRoot = Join-Path $buildRoot 'assets'
foreach ($directory in @($compiledRoot, $generatedRoot, $classesRoot, $dexRoot, $assetsRoot, $outputRoot, $localRoot)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$extensionFiles = @(
    'page-bridge.js',
    'ranking.js',
    'gold-skill-map.js',
    'traditional-name-map.js',
    'factor-recognizer.js',
    'request-guard.js',
    'content.js',
    'icons/icon-128.png'
)
foreach ($relativePath in $extensionFiles) {
    $source = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "缺少扩展源码：$relativePath"
    }
    $destination = Join-Path $assetsRoot ([System.IO.Path]::GetFileName($relativePath))
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination
}
$mobileUiSource = Join-Path $appRoot 'src\main\assets\mobile-ui.js'
if (-not (Test-Path -LiteralPath $mobileUiSource -PathType Leaf)) {
    throw '缺少 Android 移动端界面脚本：mobile-ui.js'
}
Copy-Item -LiteralPath $mobileUiSource -Destination (Join-Path $assetsRoot 'mobile-ui.js')

$compiledZip = Join-Path $compiledRoot 'resources.zip'
& $aapt2 compile --dir (Join-Path $appRoot 'src\main\res') -o $compiledZip
if ($LASTEXITCODE -ne 0) { throw 'Android 资源编译失败。' }

$unsignedApk = Join-Path $buildRoot 'app-unsigned.apk'
& $aapt2 link `
    -o $unsignedApk `
    -I $androidJar `
    --manifest (Join-Path $appRoot 'src\main\AndroidManifest.xml') `
    --java $generatedRoot `
    --min-sdk-version 24 `
    --target-sdk-version 35 `
    --version-code 6 `
    --version-name '0.1.5' `
    -A (Join-Path $buildRoot 'assets') `
    $compiledZip
if ($LASTEXITCODE -ne 0) { throw 'APK 资源链接失败。' }

$javaSources = @(
    (Join-Path $appRoot 'src\main\java\io\github\yyahz\umaseedsearcher\MainActivity.java'),
    (Join-Path $generatedRoot 'io\github\yyahz\umaseedsearcher\R.java')
)
& javac --release 17 -encoding UTF-8 -classpath $androidJar -d $classesRoot @javaSources
if ($LASTEXITCODE -ne 0) { throw 'Java 源码编译失败。' }

$classesJar = Join-Path $buildRoot 'classes.jar'
Push-Location $classesRoot
try {
    & jar --create --file $classesJar .
    if ($LASTEXITCODE -ne 0) { throw 'classes.jar 生成失败。' }
}
finally {
    Pop-Location
}

& $d8 --min-api 24 --output $dexRoot $classesJar
if ($LASTEXITCODE -ne 0) { throw 'DEX 编译失败。' }

& jar --update --file $unsignedApk -C $dexRoot 'classes.dex'
if ($LASTEXITCODE -ne 0) { throw 'classes.dex 写入 APK 失败。' }

$alignedApk = Join-Path $buildRoot 'app-aligned.apk'
& $zipalign -f -p 4 $unsignedApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw 'APK 对齐失败。' }

$debugKeystore = Join-Path $localRoot 'debug.keystore'
if (-not (Test-Path -LiteralPath $debugKeystore -PathType Leaf)) {
    & keytool -genkeypair -noprompt `
        -keystore $debugKeystore `
        -storepass android `
        -alias androiddebugkey `
        -keypass android `
        -dname 'CN=Android Debug,O=Android,C=US' `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000
    if ($LASTEXITCODE -ne 0) { throw '调试签名生成失败。' }
}

$finalApk = Join-Path $outputRoot 'uma-seed-searcher-android-v0.1.5-debug.apk'
& $apksigner sign `
    --ks $debugKeystore `
    --ks-pass 'pass:android' `
    --key-pass 'pass:android' `
    --out $finalApk `
    $alignedApk
if ($LASTEXITCODE -ne 0) { throw 'APK 签名失败。' }

& $apksigner verify --verbose --print-certs $finalApk
if ($LASTEXITCODE -ne 0) { throw 'APK 签名验证失败。' }

$hash = (Get-FileHash -LiteralPath $finalApk -Algorithm SHA256).Hash.ToLowerInvariant()
Get-Item -LiteralPath $finalApk | Select-Object Name, Length, FullName, @{Name='SHA256';Expression={$hash}}
