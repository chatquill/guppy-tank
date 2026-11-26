# Turns the exported Web build (dist\web) into a Wallpaper Engine "web" wallpaper (dist\wallpaper-engine).
# Open the result in Wallpaper Engine with "Open Wallpaper > Open from File" and pick project.json,
# or pass -Open to have this script do it.
param([switch]$Open)

$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Source = Join-Path $Project 'dist\web'
$Target = Join-Path $Project 'dist\wallpaper-engine'
$GameScript = '<script type="module" src="./game.js"></script>'
$Connect = "connect-src 'self'"
$Helper = 'http://localhost:47815'

if (-not (Test-Path (Join-Path $Source 'index.html'))) {
    throw "Export the Web build from the editor to dist\web first: $Source\index.html is missing."
}
if (Test-Path $Target) { Remove-Item -Recurse -Force $Target -Confirm:$false }
Copy-Item -Recurse $Source $Target

# The game reads this flag to keep its menus clear of the taskbar, and GUPPY_OPTIONS for the settings chosen in
# Wallpaper Engine. It has to be a file: the page allows no inline scripts.
# The helper only talks to a page opened from a file if the page knows this computer's key (see serve.ps1).
$keyFile = Join-Path $env:LOCALAPPDATA 'GuppyTank\key.txt'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keyFile) | Out-Null
if (-not (Test-Path -LiteralPath $keyFile)) { [System.IO.File]::WriteAllText($keyFile, [guid]::NewGuid().ToString('N')) }
$key = [System.IO.File]::ReadAllText($keyFile).Trim()
if ($key -notmatch '^[0-9a-f]{32}$') { throw "The helper key in $keyFile is not in the expected form; delete the file and run this again." }
$flag = "globalThis.GUPPY_HELPER_KEY = '$key';`n" + @'
globalThis.GUPPY_WALLPAPER_ENGINE = true;
globalThis.GUPPY_OPTIONS = {};
// Wallpaper Engine calls this with whichever settings changed (and with all of them when the wallpaper starts).
window.wallpaperPropertyListener = {
    applyUserProperties: function (properties) {
        for (var name in properties) globalThis.GUPPY_OPTIONS[name] = properties[name].value;
    },
};
'@
[System.IO.File]::WriteAllText((Join-Path $Target 'wallpaper-flag.js'), $flag + "`n")
$page = Join-Path $Target 'index.html'
$html = [System.IO.File]::ReadAllText($page)
if (-not $html.Contains($GameScript)) { throw 'The exported page no longer loads game.js the way this script expects.' }
if (-not $html.Contains($Connect)) { throw 'The exported page no longer limits connections the way this script expects.' }
# Opened from a file, the page must be allowed to reach the helper on this computer that keeps the shared save.
$html = $html.Replace($Connect, "$Connect $Helper")
[System.IO.File]::WriteAllText($page, $html.Replace($GameScript, "<script src=`"./wallpaper-flag.js`"></script>`n    $GameScript"))

$manifest = [ordered]@{
    file = 'index.html'; title = 'Guppy Tank'; type = 'web'; tags = @('Relaxing')
    description = 'A realistic guppy aquarium. Click the water to feed; move the mouse to the bottom of the screen for the menus.'
    general = @{
        properties = [ordered]@{
            tank = [ordered]@{
                order = 1; text = 'Tank to show'; type = 'combo'; value = 'last'
                options = @(
                    @{ label = 'The one last opened'; value = 'last' }, @{ label = 'Tank 1'; value = '1' }, @{ label = 'Tank 2'; value = '2' },
                    @{ label = 'Tank 3'; value = '3' }, @{ label = 'Tank 4'; value = '4' }
                )
            }
            menus = [ordered]@{ order = 2; text = 'Menus (move the mouse to the bottom edge)'; type = 'bool'; value = $true }
            sound = [ordered]@{ order = 3; text = 'Sound'; type = 'bool'; value = $true }
            realclock = [ordered]@{ order = 4; text = 'Day and night follow the real time'; type = 'bool'; value = $false }
        }
    }
}
[System.IO.File]::WriteAllText((Join-Path $Target 'project.json'), ($manifest | ConvertTo-Json -Depth 6))
"Wallpaper Engine wallpaper written to $Target"

if ($Open) {
    $engine = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Steam\steamapps\common\wallpaper_engine", "$env:ProgramFiles\Steam\steamapps\common\wallpaper_engine" `
        -Filter 'wallpaper64.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $engine) { throw 'Wallpaper Engine was not found in the usual Steam folder; open project.json from inside Wallpaper Engine instead.' }
    & $engine.FullName -control openWallpaper -file (Join-Path $Target 'project.json')
}
