# Serves the exported game to this computer only, so the browser can load it.
param(
    [Parameter(Mandatory)] [string]$Root,
    [Parameter(Mandatory)] [int]$Port
)

$ErrorActionPreference = 'Stop'
$rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
$types = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'; '.wasm' = 'application/wasm'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
    '.wav' = 'audio/wav'; '.ogg' = 'audio/ogg'; '.mp3' = 'audio/mpeg'; '.css' = 'text/css; charset=utf-8'; '.ico' = 'image/x-icon'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response
        try {
            $relative = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
            if ($relative -eq '') { $relative = 'index.html' }
            $file = [System.IO.Path]::GetFullPath((Join-Path $rootPath $relative))
            # Never hand out anything from outside the game folder.
            if (-not $file.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
                $response.StatusCode = 404
            }
            else {
                $bytes = [System.IO.File]::ReadAllBytes($file)
                $type = $types[[System.IO.Path]::GetExtension($file).ToLowerInvariant()]
                $response.ContentType = if ($type) { $type } else { 'application/octet-stream' }
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
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
