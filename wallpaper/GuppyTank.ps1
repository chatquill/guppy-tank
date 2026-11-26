# Guppy Tank launcher.
#   GuppyTank.ps1 wallpaper   the tank as a live desktop background, behind the icons
#   GuppyTank.ps1 play        the tank in its own window, with menus and sound
#   GuppyTank.ps1 stop        close whichever of those is running
#   GuppyTank.ps1 helper      only start the small background helper that serves the game and keeps the shared save
#   GuppyTank.ps1 install-helper   start the helper whenever you sign in to Windows (needed for Wallpaper Engine to share the save)
#   GuppyTank.ps1 remove-helper    stop doing that, and stop the helper
# Every way of running the game shares one save, kept by the helper in %LOCALAPPDATA%\GuppyTank\save.json.
param([ValidateSet('wallpaper', 'play', 'stop', 'helper', 'install-helper', 'remove-helper')] [string]$Mode = 'wallpaper')

$ErrorActionPreference = 'Stop'
$Port = 47815
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Game = Join-Path (Split-Path -Parent $Here) 'dist\web'
$Data = Join-Path $env:LOCALAPPDATA 'GuppyTank'
$BrowserData = Join-Path $Data 'profile'
$FindWindowSeconds = 30
$StartupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'Guppy Tank helper.lnk'

Add-Type -Namespace GuppyTank -Name Native -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
[DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
[DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
[DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, System.Text.StringBuilder text, int max);
[DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
[DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
'@

function Get-TankProcesses([switch]$Helper) {
    # What this launcher started: the browser (recognised by its private profile folder), or the helper.
    $pattern = if ($Helper) { "*serve.ps1*-Port $Port*" } else { "*$BrowserData*" }
    Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like $pattern }
}

function Stop-Processes($Processes) {
    foreach ($process in $Processes) {
        try { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop } catch { }
    }
}

function Stop-Tank {
    Stop-Processes (Get-TankProcesses)
    # A helper that starts with Windows stays up: Wallpaper Engine may be using it.
    if (-not (Test-Path -LiteralPath $StartupLink)) { Stop-Processes (Get-TankProcesses -Helper) }
}

function Test-Server {
    try {
        Invoke-WebRequest -Uri "http://localhost:$Port/index.html" -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    }
    catch { return $false }
}

function Install-Helper {
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($StartupLink)
    $link.TargetPath = (Get-Command powershell.exe).Source
    $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" helper"
    $link.WindowStyle = 7
    $link.Description = 'Serves Guppy Tank to this computer and keeps its shared save'
    $link.Save()
    "The helper will start when you sign in: $StartupLink"
}

function Start-Server {
    if (-not (Test-Path (Join-Path $Game 'index.html'))) {
        throw "The game has not been exported yet: $Game\index.html is missing. Export the Web build from the editor to dist\web."
    }
    if (Test-Server) { return } # already running, for example started at sign-in
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$(Join-Path $Here 'serve.ps1')`"",
        '-Root', "`"$Game`"", '-Port', $Port)
    Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden | Out-Null
    foreach ($attempt in 1..40) {
        if (Test-Server) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "The game's file server did not start on port $Port."
}

function Find-Browser {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    )
    $found = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if (-not $found) { throw 'Neither Microsoft Edge nor Google Chrome was found.' }
    $found
}

function Start-Browser([string[]]$Extra, [string]$Query) {
    New-Item -ItemType Directory -Force -Path $BrowserData | Out-Null
    $arguments = @("--user-data-dir=`"$BrowserData`"", '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble') + $Extra +
        @("--app=http://localhost:$Port/index.html$Query")
    Start-Process -FilePath (Find-Browser) -ArgumentList $arguments | Out-Null
}

function Find-BrowserWindow {
    # The game's own top-level window: a visible browser window owned by one of our processes.
    $deadline = (Get-Date).AddSeconds($FindWindowSeconds)
    while ((Get-Date) -lt $deadline) {
        $ours = @(Get-TankProcesses | ForEach-Object { [uint32]$_.ProcessId })
        $window = [IntPtr]::Zero
        while ($true) {
            $window = [GuppyTank.Native]::FindWindowEx([IntPtr]::Zero, $window, 'Chrome_WidgetWin_1', [NullString]::Value)
            if ($window -eq [IntPtr]::Zero) { break }
            $owner = [uint32]0
            [GuppyTank.Native]::GetWindowThreadProcessId($window, [ref]$owner) | Out-Null
            if ($ours -contains $owner -and [GuppyTank.Native]::IsWindowVisible($window)) { return $window }
        }
        Start-Sleep -Milliseconds 300
    }
    throw 'The game window did not appear.'
}

function Find-DesktopLayer {
    # Ask the desktop to make the layer that sits between the wallpaper and the icons, then find it.
    $progman = [GuppyTank.Native]::FindWindow('Progman', [NullString]::Value)
    if ($progman -eq [IntPtr]::Zero) { throw 'Could not find the Windows desktop.' }
    $ignored = [IntPtr]::Zero
    [GuppyTank.Native]::SendMessageTimeout($progman, 0x052C, [IntPtr]0xD, [IntPtr]1, 0, 1000, [ref]$ignored) | Out-Null
    Start-Sleep -Milliseconds 300
    # Windows 11 24H2 and later keep that layer inside Progman.
    $inside = [GuppyTank.Native]::FindWindowEx($progman, [IntPtr]::Zero, 'WorkerW', [NullString]::Value)
    if ($inside -ne [IntPtr]::Zero) { return $inside }
    # Earlier versions: it is the WorkerW that follows the one holding the icons.
    $worker = [IntPtr]::Zero
    while ($true) {
        $worker = [GuppyTank.Native]::FindWindowEx([IntPtr]::Zero, $worker, 'WorkerW', [NullString]::Value)
        if ($worker -eq [IntPtr]::Zero) { break }
        if ([GuppyTank.Native]::FindWindowEx($worker, [IntPtr]::Zero, 'SHELLDLL_DefView', [NullString]::Value) -ne [IntPtr]::Zero) {
            $layer = [GuppyTank.Native]::FindWindowEx([IntPtr]::Zero, $worker, 'WorkerW', [NullString]::Value)
            if ($layer -ne [IntPtr]::Zero) { return $layer }
        }
    }
    throw 'Could not find the desktop wallpaper layer on this version of Windows.'
}

function Move-BehindIcons([IntPtr]$Window) {
    $layer = Find-DesktopLayer
    $GWL_STYLE = -16
    $WS_CHILD = 0x40000000
    $WS_VISIBLE = 0x10000000
    # A plain borderless child of the desktop layer, covering the main screen.
    [GuppyTank.Native]::SetWindowLongPtr($Window, $GWL_STYLE, [IntPtr]($WS_CHILD -bor $WS_VISIBLE)) | Out-Null
    [GuppyTank.Native]::SetParent($Window, $layer) | Out-Null
    $layerRect = New-Object GuppyTank.Native+RECT
    [GuppyTank.Native]::GetWindowRect($layer, [ref]$layerRect) | Out-Null
    $width = [GuppyTank.Native]::GetSystemMetrics(0)
    $height = [GuppyTank.Native]::GetSystemMetrics(1)
    # The layer spans every monitor; the main screen starts at (0,0) in screen coordinates.
    $SWP_FRAMECHANGED_SHOW = 0x0020 -bor 0x0040 -bor 0x0010
    [GuppyTank.Native]::SetWindowPos($Window, [IntPtr]::Zero, - $layerRect.Left, - $layerRect.Top, $width, $height, $SWP_FRAMECHANGED_SHOW) | Out-Null
}

[GuppyTank.Native]::SetProcessDPIAware() | Out-Null
switch ($Mode) {
    'helper' { Start-Server; return }
    'install-helper' { Install-Helper; Start-Server; return }
    'remove-helper' {
        if (Test-Path -LiteralPath $StartupLink) { Remove-Item -LiteralPath $StartupLink -Force -Confirm:$false }
        Stop-Processes (Get-TankProcesses -Helper)
        return
    }
}
Stop-Tank
if ($Mode -eq 'stop') { return }

Start-Server
if ($Mode -eq 'play') {
    Start-Browser @('--start-maximized') ''
    return
}
# As a wallpaper the window is never "in front", so the browser must not pause it for being covered.
Start-Browser @('--kiosk', '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--autoplay-policy=user-gesture-required') '?wallpaper'
Move-BehindIcons (Find-BrowserWindow)
