# Builds diagnostics\firefox-home\firefox-home.apk without Gradle. Build only; never touches a frame.
# Needs JDK 17 and Android build-tools 34.0.0 + platform android-34 (as dashboard\kiosk\build.ps1).
#   powershell -ExecutionPolicy Bypass -File scripts\firefox-home\build.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$bt  = "$sdk\build-tools\34.0.0"
$jar = "$sdk\platforms\android-34\android.jar"
$out = "$PSScriptRoot\..\..\diagnostics\firefox-home"
$ks  = "$env:USERPROFILE\.android\debug.keystore"
if (-not (Test-Path $jar)) { throw "android.jar not found at $jar" }

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory "$out\classes" | Out-Null

function Run($exe, [string[]]$a) {
  & $exe @a
  if ($LASTEXITCODE -ne 0) { throw "$exe failed ($LASTEXITCODE)" }
}

Run "$bt\aapt2.exe" @('link', '-o', "$out\base.apk", '-I', $jar, '--manifest', 'AndroidManifest.xml',
  '--version-code', '2', '--version-name', '1.1')
$src = Get-ChildItem src -Recurse -Filter *.java | % FullName
Run 'javac' (@('-nowarn', '-source', '8', '-target', '8', '-classpath', $jar, '-d', "$out\classes") + $src)
$classes = Get-ChildItem "$out\classes" -Recurse -Filter *.class | % FullName
Run "$bt\d8.bat" (@('--min-api', '23', '--lib', $jar, '--output', $out) + $classes)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open((Resolve-Path "$out\base.apk"), 'Update')
[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Resolve-Path "$out\classes.dex"), 'classes.dex') | Out-Null
$zip.Dispose()

Run "$bt\zipalign.exe" @('-f', '4', "$out\base.apk", "$out\aligned.apk")
if (-not (Test-Path $ks)) {
  New-Item -ItemType Directory -Force (Split-Path $ks) | Out-Null
  Run 'keytool' @('-genkeypair', '-keystore', $ks, '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Android Debug,O=Android,C=US')
}
Run "$bt\apksigner.bat" @('sign', '--ks', $ks, '--ks-pass', 'pass:android', '--key-pass', 'pass:android',
  '--out', "$out\firefox-home.apk", "$out\aligned.apk")
(Get-FileHash -Algorithm SHA256 "$out\firefox-home.apk").Hash
