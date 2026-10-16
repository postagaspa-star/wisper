<#
.SINOSSI
    Costruisce Wisper Ufficio: UN file, pc/dist/WisperUfficio.exe.

    dotnet publish self-contained per win-x64 in un file solo: dentro ci sono il
    runtime .NET, l'interfaccia (pc/ui) e il caricatore di WebView2. Si scarica, si
    mette dove si vuole (Desktop, Documenti) e si apre con un doppio clic; poi si
    aggiorna da solo (Aggiornamenti.cs). Niente zip, niente cartelle da scompattare.

    Usa lo SDK .NET 8 in %LOCALAPPDATA%\Microsoft\dotnet-sdk-8 (o quello nel PATH).

.PARAMETER Versione
    Per le prove degli aggiornamenti: costruisce l'exe con un'altra versione
    (es. 0.3.1) senza toccare il progetto.

.PARAMETER Uscita
    Dove mettere l'exe (predefinito: pc\dist).

.ESEMPIO
    powershell -ExecutionPolicy Bypass -File pc\prove\crea-pacchetto.ps1
#>
[CmdletBinding()]
param(
    [string]$Versione = '',
    [string]$Uscita = ''
)
$ErrorActionPreference = 'Stop'

$radicePc = Split-Path -Parent $PSScriptRoot
$progetto = Join-Path $radicePc 'WisperUfficio\WisperUfficio.csproj'
$dist = if ($Uscita) { $Uscita } else { Join-Path $radicePc 'dist' }
$lavoro = Join-Path $env:TEMP ('wisper-pubblica-' + [guid]::NewGuid().ToString('N'))

$dotnet = Join-Path $env:LOCALAPPDATA 'Microsoft\dotnet-sdk-8\dotnet.exe'
if (-not (Test-Path $dotnet)) {
    $c = Get-Command dotnet -ErrorAction SilentlyContinue
    if (-not $c) { throw "Non trovo dotnet. Scompatta lo SDK .NET 8 in $env:LOCALAPPDATA\Microsoft\dotnet-sdk-8." }
    $dotnet = $c.Source
}

New-Item -ItemType Directory -Force $dist | Out-Null
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'

$extra = @()
if ($Versione) { $extra += "-p:Version=$Versione"; $extra += "-p:FileVersion=$Versione.0" }
# L'indirizzo del foglio, lo stesso dell'app (wisper-keys): il programma lo ha gia' scritto
# e alla prima apertura basta il codice.
$chiavi = 'C:\Users\andre\wisper-keys\wisper.properties'
if (Test-Path $chiavi) {
    $riga = Get-Content $chiavi | Where-Object { $_ -match '^sheetUrl=' } | Select-Object -First 1
    if ($riga) { $extra += "-p:IndirizzoFoglio=$(($riga -replace '^sheetUrl=', '').Trim())" }
}

Write-Host "Pubblicazione (un file solo)..." -ForegroundColor Cyan
& $dotnet publish $progetto -c Release -r win-x64 "-p:PubblicazioneWisper=true" @extra -o $lavoro
if ($LASTEXITCODE -ne 0) { throw "publish fallito (codice $LASTEXITCODE)" }

$exe = Join-Path $lavoro 'WisperUfficio.exe'
if (-not (Test-Path $exe)) { throw "WisperUfficio.exe non prodotto." }
# Nel file solo non deve restare niente accanto: niente ui\, niente dll.
$accanto = Get-ChildItem $lavoro -File | Where-Object { $_.Name -ne 'WisperUfficio.exe' }
if ($accanto) { throw "Accanto all'exe sono rimasti dei file: $($accanto.Name -join ', ')" }
if (Test-Path (Join-Path $lavoro 'ui')) { throw "La cartella ui e' finita accanto all'exe invece che dentro." }

$finale = Join-Path $dist 'WisperUfficio.exe'
Copy-Item $exe $finale -Force
Remove-Item -Recurse -Force $lavoro
# I pacchetti vecchi a cartella non servono piu'.
Remove-Item -Recurse -Force (Join-Path $dist 'WisperUfficio'), (Join-Path $dist 'wisper-ufficio.zip') -ErrorAction SilentlyContinue

$mb = [math]::Round((Get-Item $finale).Length / 1MB, 1)
$v = (Get-Item $finale).VersionInfo.FileVersion
Write-Host "Fatto: $finale ($mb MB, versione $v)" -ForegroundColor Green
