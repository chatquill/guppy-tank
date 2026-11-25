# Turns the exported Web build (dist\web) into a Wallpaper Engine "web" wallpaper (dist\wallpaper-engine).
# Open the result in Wallpaper Engine with "Open Wallpaper > Open from File" and pick project.json,
# or pass -Open to have this script do it.
param([switch]$Open)

$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Source = Join-Path $Project 'dist\web'
$Target = Join-Path $Project 'dist\wallpaper-engine'
$GameScript = '<script type="module" src="./game.js"></script>'

if (-not (Test-Path (Join-Path $Source 'index.html'))) {
    throw "Export the Web build from the editor to dist\web first: $Source\index.html is missing."
}
if (Test-Path $Target) { Remove-Item -Recurse -Force $Target -Confirm:$false }
Copy-Item -Recurse $Source $Target

# The game reads this flag to keep its menus clear of the taskbar. It has to be a file: the page allows no inline scripts.
[System.IO.File]::WriteAllText((Join-Path $Target 'wallpaper-flag.js'), "globalThis.GUPPY_WALLPAPER_ENGINE = true;`n")
$page = Join-Path $Target 'index.html'
$html = [System.IO.File]::ReadAllText($page)
if (-not $html.Contains($GameScript)) { throw 'The exported page no longer loads game.js the way this script expects.' }
[System.IO.File]::WriteAllText($page, $html.Replace($GameScript, "<script src=`"./wallpaper-flag.js`"></script>`n    $GameScript"))

$manifest = [ordered]@{
    file = 'index.html'; title = 'Guppy Tank'; type = 'web'; tags = @('Relaxing')
    description = 'A realistic guppy aquarium. Click the water to feed; move the mouse to the bottom of the screen for the menus.'
    general = @{ properties = @{} }
}
[System.IO.File]::WriteAllText((Join-Path $Target 'project.json'), ($manifest | ConvertTo-Json -Depth 4))
"Wallpaper Engine wallpaper written to $Target"

if ($Open) {
    $engine = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Steam\steamapps\common\wallpaper_engine", "$env:ProgramFiles\Steam\steamapps\common\wallpaper_engine" `
        -Filter 'wallpaper64.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $engine) { throw 'Wallpaper Engine was not found in the usual Steam folder; open project.json from inside Wallpaper Engine instead.' }
    & $engine.FullName -control openWallpaper -file (Join-Path $Target 'project.json')
}
