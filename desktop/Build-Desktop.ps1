# Turns the exported Web build (dist\web) into a Windows program: dist\desktop\Guppy Tank-win32-x64\Guppy Tank.exe,
# and a zip of that folder to share. Needs Node.js. Run again after exporting the game again.
# With -Installer it also makes dist\installer\Guppy Tank Setup.exe, which installs the game for the current user
# (Start menu and desktop shortcuts, uninstall from Windows settings). No administrator rights are needed.
param([switch]$Installer)
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Project = Split-Path -Parent $Here
$Source = Join-Path $Project 'dist\web'
$Game = Join-Path $Here 'game'
$Out = Join-Path $Project 'dist\desktop'

if (-not (Test-Path (Join-Path $Source 'index.html'))) {
    throw "Export the Web build from the editor to dist\web first: $Source\index.html is missing."
}
if (Test-Path $Game) { Remove-Item -Recurse -Force $Game -Confirm:$false }
Copy-Item -Recurse $Source $Game

Push-Location $Here
try {
    if (-not ((Test-Path 'node_modules\electron') -and (Test-Path 'node_modules\electron-builder'))) { npm install --no-fund --no-audit; if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' } }
    npx electron-packager . 'Guppy Tank' --platform=win32 --arch=x64 --out $Out --overwrite --asar --prune=true `
        --ignore='^/Build-Desktop\.ps1$' --app-copyright 'Guppy Tank'
    if ($LASTEXITCODE -ne 0) { throw 'Packaging failed.' }
    if ($Installer) {
        npm run installer
        if ($LASTEXITCODE -ne 0) { throw 'Building the installer failed.' }
    }
} finally { Pop-Location }

$Folder = Join-Path $Out 'Guppy Tank-win32-x64'
$Zip = Join-Path $Out 'GuppyTank-Windows.zip'
if (Test-Path $Zip) { Remove-Item -Force $Zip -Confirm:$false }
Compress-Archive -Path $Folder -DestinationPath $Zip
"Program: $Folder\Guppy Tank.exe"
"To share: $Zip"
if ($Installer) { "Installer: $(Join-Path $Project 'dist\installer\Guppy Tank Setup.exe')" }
