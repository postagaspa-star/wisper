<#
.SINOSSI
    Prepara (e, con -Pubblica, pubblica) una versione nuova di Wisper per gli
    aggiornamenti automatici di telefono e computer.

    1. APK firmato con la chiave di wisper-keys (gradlew assembleRelease).
    2. WisperUfficio.exe in un file solo (pc\prove\crea-pacchetto.ps1).
    3. aggiornamento.json: versioni, indirizzi, impronte SHA-256, firmato con
       wisper-keys\aggiornamenti-privata.pem (strumenti\firma-aggiornamento.js).
    4. Con -Pubblica: una release "vX.Y.Z" su GitHub con i tre file. Da lì,
       entro un'ora, telefono e computer la trovano e si aggiornano da soli.

    Prima di lanciarlo: alzare versionCode/versionName in app\build.gradle.kts e
    Version in pc\WisperUfficio\WisperUfficio.csproj. Una versione già pubblicata
    non si ripubblica: si fa la successiva.

.ESEMPIO
    powershell -ExecutionPolicy Bypass -File strumenti\rilascio.ps1
    powershell -ExecutionPolicy Bypass -File strumenti\rilascio.ps1 -Pubblica
#>
[CmdletBinding()]
param(
    [switch]$Pubblica,
    [string]$Repo = 'postagaspa-star/wisper'
)
$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent $PSScriptRoot

# --- le versioni, da dove le decide il progetto
$gradle = Get-Content (Join-Path $radice 'app\build.gradle.kts') -Raw
$codice = [regex]::Match($gradle, 'versionCode = .*\?: (\d+)').Groups[1].Value
$nome = [regex]::Match($gradle, 'versionName = .*\?: "([0-9.]+)"').Groups[1].Value
$csproj = Get-Content (Join-Path $radice 'pc\WisperUfficio\WisperUfficio.csproj') -Raw
$versionePc = [regex]::Match($csproj, '<Version>([0-9.]+)</Version>').Groups[1].Value
if (-not $codice -or -not $nome -or -not $versionePc) { throw "Non trovo le versioni in build.gradle.kts o nel .csproj." }
# La release prende il numero piu' alto dei due: si puo' pubblicare un computer nuovo
# lasciando il telefono com'e' (stesso codice: i telefoni non scaricano niente).
$versioneRilascio = @([version]$nome, [version]$versionePc) | Sort-Object -Descending | Select-Object -First 1
$tag = "v$($versioneRilascio.ToString(3))"
Write-Host "Telefono $nome (codice $codice), computer $versionePc, release $tag" -ForegroundColor Cyan

# --- il codice da cui si costruisce: per pubblicare dev'essere tutto salvato e gia' su GitHub,
#     così l'etichetta della versione indica proprio il commit da cui escono APK ed exe.
Push-Location $radice
try {
    $commit = (git rev-parse HEAD).Trim()
    $sporco = git status --porcelain
    if ($Pubblica) {
        if ($sporco) { throw "Ci sono modifiche non salvate in un commit: prima il commit, poi il rilascio." }
        git fetch -q origin
        if (-not (git branch -r --contains $commit)) { throw "Il commit $($commit.Substring(0, 7)) non e' su GitHub: prima il push del ramo, poi il rilascio." }
    } elseif ($sporco) {
        Write-Warning "Ci sono modifiche non salvate in un commit: per una prova va bene, per pubblicare no."
    }
} finally { Pop-Location }

$cartella = Join-Path $radice "dist\rilascio\$tag"
Remove-Item -Recurse -Force $cartella -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $cartella | Out-Null

# --- 1. l'APK firmato
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
Push-Location $radice
try {
    & .\gradlew.bat --no-daemon -q :app:assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "assembleRelease fallito" }
} finally { Pop-Location }
$apk = Join-Path $radice 'app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apk)) { throw "Manca app-release.apk: la chiave di firma in wisper-keys c'e'? (senza, esce app-release-unsigned.apk)" }
Copy-Item $apk (Join-Path $cartella 'wisper.apk')

# --- 2. l'exe
& powershell -ExecutionPolicy Bypass -File (Join-Path $radice 'pc\prove\crea-pacchetto.ps1') -Uscita $cartella
if ($LASTEXITCODE -ne 0) { throw "crea-pacchetto fallito" }

# --- l'indirizzo del foglio non deve uscire di casa: le release di GitHub sono pubbliche.
#     Nell'APK si cerca dentro il codice compilato (classes*.dex); l'exe lo dice da solo.
$chiavi = 'C:\Users\andre\wisper-keys\wisper.properties'
$riga = if (Test-Path $chiavi) { Get-Content $chiavi | Where-Object { $_ -match '^sheetUrl=' } | Select-Object -First 1 }
$idScript = if ($riga) { [regex]::Match($riga, '/macros/s/([^/]+)/').Groups[1].Value } else { '' }
if ($idScript) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $cartella 'wisper.apk'))
    try {
        foreach ($voce in $zip.Entries | Where-Object { $_.Name -like 'classes*.dex' }) {
            $flusso = $voce.Open(); $mem = New-Object System.IO.MemoryStream
            try { $flusso.CopyTo($mem) } finally { $flusso.Dispose() }
            $testo = [System.Text.Encoding]::GetEncoding(28591).GetString($mem.ToArray())
            if ($testo.Contains($idScript)) { throw "L'APK contiene l'indirizzo del foglio ($($voce.Name)): non si pubblica. Era stato costruito con -PconIndirizzo?" }
        }
    } finally { $zip.Dispose() }
}
$prova = Start-Process -FilePath (Join-Path $cartella 'WisperUfficio.exe') -ArgumentList '--indirizzo-incluso' -Wait -PassThru
if ($prova.ExitCode -ne 0) { throw "WisperUfficio.exe contiene l'indirizzo del foglio (uscita $($prova.ExitCode)): non si pubblica." }
Write-Host "Controllato: nell'APK e nell'exe l'indirizzo del foglio non c'e'." -ForegroundColor Green

# --- 3. l'elenco firmato
$base = "https://github.com/$Repo/releases/download/$tag"
& node (Join-Path $radice 'strumenti\firma-aggiornamento.js') --cartella $cartella --indirizzo $base `
    --apk wisper.apk --codice $codice --nome $nome --exe WisperUfficio.exe --versione-pc $versionePc
if ($LASTEXITCODE -ne 0) { throw "firma dell'elenco fallita" }

Write-Host ""
Write-Host "Pronto in $cartella" -ForegroundColor Green
Get-ChildItem $cartella | ForEach-Object { Write-Host ("  {0,-24} {1,8:N1} MB" -f $_.Name, ($_.Length / 1MB)) }

# --- 4. la pubblicazione, solo se chiesta
if (-not $Pubblica) {
    Write-Host ""
    Write-Host "Non pubblicato. Per pubblicare: strumenti\rilascio.ps1 -Pubblica" -ForegroundColor Yellow
    return
}
$note = "Wisper $($versioneRilascio.ToString(3)): telefono $nome, computer $versionePc. Si aggiornano da soli entro un'ora.`n`n" +
        "Prima installazione: sul telefono wisper.apk, sul computer WisperUfficio.exe (basta aprirlo)."
& gh release create $tag (Join-Path $cartella 'wisper.apk') (Join-Path $cartella 'WisperUfficio.exe') (Join-Path $cartella 'aggiornamento.json') `
    --repo $Repo --target $commit --title "Wisper $($versioneRilascio.ToString(3))" --notes $note
if ($LASTEXITCODE -ne 0) { throw "gh release create fallito" }
Write-Host "Pubblicata: https://github.com/$Repo/releases/tag/$tag" -ForegroundColor Green
