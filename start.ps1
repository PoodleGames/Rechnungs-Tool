# start.ps1
$port   = 8000
$root   = $PSScriptRoot
$url    = "http://localhost:$port/"
$prefix = "http://localhost:$port/"

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
    ".txt"  = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "  FEHLER: Port $port ist bereits belegt." -ForegroundColor Red
    Write-Host "  Schliesse das laufende Rechnungstool-Fenster und versuche es erneut." -ForegroundColor Red
    Write-Host ""
    pause
    exit 1
}

Write-Host ""
Write-Host "  Rechnungstool laeuft auf: $url" -ForegroundColor Green
Write-Host "  Dieses Fenster offen lassen! Schliessen beendet das Tool." -ForegroundColor Yellow
Write-Host ""

# Browser öffnen — alle bekannten Pfade probieren, dann Fallback
Start-Sleep -Milliseconds 500

$browserGefunden = $false

$edgePfade = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
foreach ($pfad in $edgePfade) {
    if (Test-Path $pfad) {
        Start-Process $pfad $url
        $browserGefunden = $true
        break
    }
}

if (-not $browserGefunden) {
    $chromePfade = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($pfad in $chromePfade) {
        if (Test-Path $pfad) {
            Start-Process $pfad $url
            $browserGefunden = $true
            break
        }
    }
}

if (-not $browserGefunden) {
    # Letzter Fallback: Windows Standard-Browser über Shell
    Start-Process $url
}

# Anfragen verarbeiten
while ($listener.IsListening) {
    try {
        $ctx  = $listener.GetContext()
        $req  = $ctx.Request
        $resp = $ctx.Response

        $urlPath = $req.Url.LocalPath

        # ── API: Datei schreiben ──────────────────────────────────────
        if ($urlPath -eq "/api/schreibe" -and $req.HttpMethod -eq "POST") {
            try {
                $reader  = New-Object System.IO.StreamReader($req.InputStream)
                $body    = $reader.ReadToEnd()
                $payload = $body | ConvertFrom-Json

                $relPfad = $payload.datei -replace "/", "\"
                $ziel    = [System.IO.Path]::GetFullPath((Join-Path $root $relPfad))

                if (-not $ziel.StartsWith($root)) {
                    $resp.StatusCode = 403
                    $resp.Close()
                    continue
                }

                $dir = [System.IO.Path]::GetDirectoryName($ziel)
                if (-not (Test-Path $dir)) {
                    New-Item -ItemType Directory -Path $dir -Force | Out-Null
                }

                if ($payload.roh -eq $true) {
                    [System.IO.File]::WriteAllText($ziel, $payload.inhalt, [System.Text.Encoding]::UTF8)
                } else {
                    $json = $payload.inhalt | ConvertTo-Json -Depth 20
                    [System.IO.File]::WriteAllText($ziel, $json, [System.Text.Encoding]::UTF8)
                }

                $respBody = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                $resp.StatusCode      = 200
                $resp.ContentType     = "application/json"
                $resp.ContentLength64 = $respBody.Length
                $resp.OutputStream.Write($respBody, 0, $respBody.Length)
            } catch {
                $errBody = [System.Text.Encoding]::UTF8.GetBytes('{"error":"' + $_.Exception.Message + '"}')
                $resp.StatusCode      = 500
                $resp.ContentType     = "application/json"
                $resp.ContentLength64 = $errBody.Length
                $resp.OutputStream.Write($errBody, 0, $errBody.Length)
            }
            $resp.OutputStream.Close()
            continue
        }

        # ── Statische Dateien ausliefern ─────────────────────────────
        if ($urlPath -eq "/" -or $urlPath -eq "") {
            $urlPath = "/Rechnungstool.html"
        }

        $filePath = Join-Path $root ($urlPath.TrimStart("/").Replace("/", "\"))
        $filePath = [System.IO.Path]::GetFullPath($filePath)

        if (-not $filePath.StartsWith($root)) {
            $resp.StatusCode = 403
            $resp.Close()
            continue
        }

        if (Test-Path $filePath -PathType Leaf) {
            $ext         = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
            $bytes       = [System.IO.File]::ReadAllBytes($filePath)

            $resp.StatusCode        = 200
            $resp.ContentType       = $contentType
            $resp.ContentLength64   = $bytes.Length
            $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $resp.StatusCode = 404
        }

        $resp.OutputStream.Close()

    } catch {
        try { $resp.OutputStream.Close() } catch {}
    }
}