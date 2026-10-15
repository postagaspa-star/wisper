<#
.SINOSSI
    Costruisce il pacchetto di Wisper Ufficio: pc/dist/wisper-ufficio.zip.

    Come Pactum: dotnet publish self-contained per win-x64 A CARTELLA (niente
    eseguibile che si scompatta da solo, che un antivirus scambia per sospetto).
    Nello zip c'e' una cartella WisperUfficio\ con WisperUfficio.exe, le dll del
    runtime .NET e la cartella ui. Si scompatta dove si vuole e si avvia da li'.

    Usa lo SDK .NET 8 in %LOCALAPPDATA%\Microsoft\dotnet-sdk-8 (o quello nel PATH).

.ESEMPIO
    powershell -ExecutionPolicy Bypass -File pc\prove\crea-pacchetto.ps1
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'

$radicePc = Split-Path -Parent $PSScriptRoot
$progetto = Join-Path $radicePc 'WisperUfficio\WisperUfficio.csproj'
$dist = Join-Path $radicePc 'dist'
$staging = Join-Path $dist 'WisperUfficio'
$zip = Join-Path $dist 'wisper-ufficio.zip'

$dotnet = Join-Path $env:LOCALAPPDATA 'Microsoft\dotnet-sdk-8\dotnet.exe'
if (-not (Test-Path $dotnet)) {
    $c = Get-Command dotnet -ErrorAction SilentlyContinue
    if (-not $c) { throw "Non trovo dotnet. Scompatta lo SDK .NET 8 in $env:LOCALAPPDATA\Microsoft\dotnet-sdk-8." }
    $dotnet = $c.Source
}

Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $dist | Out-Null
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'

Write-Host "Pubblicazione (self-contained, a cartella)..." -ForegroundColor Cyan
& $dotnet publish $progetto -c Release -r win-x64 "-p:PubblicazioneWisper=true" -o $staging
if ($LASTEXITCODE -ne 0) { throw "publish fallito (codice $LASTEXITCODE)" }

if (-not (Test-Path (Join-Path $staging 'WisperUfficio.exe'))) { throw "WisperUfficio.exe non prodotto." }
if (-not (Test-Path (Join-Path $staging 'ui\index.html'))) { throw "La cartella ui non e' finita accanto all'exe." }
if (-not (Test-Path (Join-Path $staging 'coreclr.dll'))) { throw "Manca coreclr.dll: il pacchetto non e' self-contained." }

Remove-Item $zip -ErrorAction SilentlyContinue
Compress-Archive -Path $staging -DestinationPath $zip -CompressionLevel Optimal
$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Fatto: $zip ($mb MB)" -ForegroundColor Green
