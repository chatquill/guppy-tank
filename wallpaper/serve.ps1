# Serves the exported game to this computer only, so the browser can load it, and keeps the one save
# that every way of running the game shares (the Play window, the desktop wallpaper and Wallpaper Engine).
#   GET  /save               -> { rev, owner, stale, save }
#   POST /save?client=ID     the owner's latest save (plain text body); refused from anyone else while the owner is alive
#   POST /claim?client=ID    this window is now the one looking after the tanks
param(
    [Parameter(Mandatory)] [string]$Root,
    [Parameter(Mandatory)] [int]$Port,
    [string]$SaveFile = (Join-Path $env:LOCALAPPDATA 'GuppyTank\save.json')
)

$ErrorActionPreference = 'Stop'
$rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
$types = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'; '.wasm' = 'application/wasm'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
    '.wav' = 'audio/wav'; '.ogg' = 'audio/ogg'; '.mp3' = 'audio/mpeg'; '.css' = 'text/css; charset=utf-8'; '.ico' = 'image/x-icon'
}
$MaxSaveBytes = 4MB
$OwnerStaleSeconds = 20
# Only the game's own pages may read or write the save. The copy served here is recognised by its address. Wallpaper
# Engine's copy is opened from a file, and so is any page that hides where it came from: that one must also know the
# key in key.txt, which Build-WallpaperEngine.ps1 writes into the wallpaper.
$ownOrigin = "http://localhost:$Port"
$anonymousOrigins = @('null', 'file://')
$keyFile = Join-Path (Split-Path -Parent $SaveFile) 'key.txt'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SaveFile) | Out-Null
if (-not (Test-Path -LiteralPath $keyFile)) { [System.IO.File]::WriteAllText($keyFile, [guid]::NewGuid().ToString('N')) }
$key = [System.IO.File]::ReadAllText($keyFile).Trim()
$utf8 = [System.Text.UTF8Encoding]::new($false)

$state = @{ Save = $null; Rev = 0; Owner = ''; Seen = [datetime]::MinValue }
if (Test-Path -LiteralPath $SaveFile) {
    $state.Save = [System.IO.File]::ReadAllText($SaveFile, $utf8)
    $state.Rev = 1
}

function Send-Json($response, [int]$status, $value) {
    $bytes = $utf8.GetBytes(($value | ConvertTo-Json -Compress -Depth 3))
    $response.StatusCode = $status
    $response.ContentType = 'application/json; charset=utf-8'
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Get-Status {
    $stale = $state.Owner -eq '' -or ((Get-Date) - $state.Seen).TotalSeconds -gt $OwnerStaleSeconds
    @{ rev = $state.Rev; owner = $state.Owner; stale = $stale }
}

function Invoke-SaveRequest($request, $response) {
    $origin = $request.Headers['Origin']
    $known = -not $origin -or $origin -eq $ownOrigin -or
        (($anonymousOrigins -contains $origin) -and $key.Length -ge 16 -and [string]$request.QueryString['key'] -ceq $key)
    if (-not $known) {
        $response.StatusCode = 403
        return
    }
    if ($origin) { $response.Headers['Access-Control-Allow-Origin'] = $origin }
    $response.Headers['Cache-Control'] = 'no-store'
    $client = [string]$request.QueryString['client']
    $path = $request.Url.AbsolutePath
    if ($request.HttpMethod -eq 'GET' -and $path -eq '/save') {
        $reply = Get-Status
        $reply.save = $state.Save
        Send-Json $response 200 $reply
        return
    }
    if ($request.HttpMethod -ne 'POST' -or $client -notmatch '^[a-z0-9]{6,32}$') {
        $response.StatusCode = 400
        return
    }
    if ($path -eq '/claim') {
        $state.Owner = $client
        $state.Seen = Get-Date
        Send-Json $response 200 (Get-Status)
        return
    }
    # /save: only the owner writes, unless the owner has gone quiet.
    if ((Get-Status).stale) { $state.Owner = $client }
    if ($state.Owner -ne $client) {
        Send-Json $response 409 (Get-Status)
        return
    }
    if ($request.ContentLength64 -le 0 -or $request.ContentLength64 -gt $MaxSaveBytes) {
        $response.StatusCode = 413
        return
    }
    $reader = [System.IO.StreamReader]::new($request.InputStream, $utf8)
    try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
    # Keep only something that at least looks like a save: the game checks it properly when it loads.
    if ($text.Length -gt $MaxSaveBytes -or -not ($text.StartsWith('{') -and $text.Contains('"tanks"'))) {
        $response.StatusCode = 400
        return
    }
    $state.Save = $text
    $state.Rev += 1
    $state.Seen = Get-Date
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SaveFile) | Out-Null
    # Write beside the save and swap, so a crash mid-write cannot leave half a file.
    $temp = "$SaveFile.tmp"
    [System.IO.File]::WriteAllText($temp, $text, $utf8)
    Move-Item -LiteralPath $temp -Destination $SaveFile -Force
    Send-Json $response 200 (Get-Status)
}

function Send-File($request, $response) {
    $relative = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')
    if ($relative -eq '') { $relative = 'index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $rootPath $relative))
    # Never hand out anything from outside the game folder.
    if (-not $file.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        $response.StatusCode = 404
        return
    }
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $type = $types[[System.IO.Path]::GetExtension($file).ToLowerInvariant()]
    $response.ContentType = if ($type) { $type } else { 'application/octet-stream' }
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response
        try {
            $path = $context.Request.Url.AbsolutePath
            if ($path -eq '/save' -or $path -eq '/claim') { Invoke-SaveRequest $context.Request $response }
            elseif ($context.Request.HttpMethod -eq 'GET') { Send-File $context.Request $response }
            else { $response.StatusCode = 405 }
        }
        catch {
            # A browser that hangs up mid-file must not stop the server.
            try { $response.StatusCode = 500 } catch { }
        }
        finally {
            try { $response.Close() } catch { }
        }
    }
}
finally {
    $listener.Stop()
}
