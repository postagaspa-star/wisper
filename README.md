# Wisper

Work reports for a technician who works alone: filled in on the phone at
the client's, managed on the computer at the office, kept in a Google Sheet.

It is built for one person, my father, a self-employed surveyor who does monthly
reports for a few clients. Everything in it comes from a recorded conversation
between us (14/10/2026) and from a demo of [Pleya](https://pleya.it), a management
suite my father liked, of which two parts were taken and cut down to one person:
projects (here *commesse*, the word my father uses) and the team's reports.

Every version, with its date, the reason behind it and screenshots, is in the
diary: [DIARIO.md](DIARIO.md) (in Italian).

## What changed

The first Wisper, built for NGN Hacks 2026, was voice only: a wake word, a
conversation, a row in the sheet. When my father tried it, the answer was "lascia
stare la voce, facciamola a mano", leave the voice, let's do it by hand. So the
voice is gone, all of it: wake word, recogniser, Gemini, the listening service,
the location. What was worth keeping stayed: the on-disk queue that never loses
a report, and the sheet as the single place where data lives.

## Three pieces

**The phone** (`app/`, Kotlin, Compose). Opens on *Oggi*: is today's report
written, which days of the week are missing, what still needs a signature. A
report is three short steps (who, hours and road, the work) and a summary, with
the total counting up at the bottom while you fill it in. In Pleya you create a
report and then reopen it to add hours and photos; the first thing my father
said was "this is one step too many".

- The system remembers so you only confirm: the last clients and jobs as big
  cards, "Come ieri" to copy the last report, last time's kilometres, the last
  rate used for that client. Steppers in half hours, no drop-downs.
- Today is the default date. A client or job typed in that does not exist yet is
  created by the sheet, with its code.
- Hours: work, extra, travel. Kilometres. Expenses with photos of the receipts,
  taken there and then or added later by reopening the report.
- The client signs with a finger on the phone. No QR code: in Pleya the client
  frames a code with their own phone, and my father's verdict was "even more
  complicated". A signed report is locked until it is put back to draft, which
  removes the signature.
- Everything goes to a file first and WorkManager sends it when there is signal,
  even with the app closed. Without signal a calm grey pill says so: "1
  rapportino parte appena c'è rete". Red only if the sheet refuses something.

**Wisper Ufficio** (`pc/`, C# .NET 8, WebView2, built like Pactum). The main
program, because invoicing is done at a desk. One file, `WisperUfficio.exe`, with
the .NET runtime and the interface inside. The first time it is opened it installs
itself for the current user, no administrator: it copies itself to
`%LOCALAPPDATA%\Programs\WisperUfficio` (outside OneDrive, which locks files and
would break updates), adds *Wisper Ufficio* to Start and the Desktop and to
*Settings › Apps*, from where it can be removed.

- *Fine mese*, the home: what is ready to invoice, one card per client
  (Elettrodinamica is one client, whoever the work was for) with **Prepara riepilogo**: the PDF
  previewed on the left, sent by email on the right. Then **Segna fatturati**.
- *Rapportini*: grouped by who pays, with totals; search, month and *Tutti | Da
  fatturare | Da firmare*. A side panel shows one report and one yellow button,
  the thing to do now: Modifica, Invia al cliente or Segna fatturato.
- *Commesse*: open, suspended and closed, with the hidden ones counted instead of
  silently filtered. Hours against the budget (warning at 85%, over at 100%),
  expected value, cost, margin, what is ready to invoice, documents in Drive.
- *Clienti* and *Impostazioni*: groups and rates, ACI cost per km, your hourly
  cost, letterhead, your signature.
- Two PDFs printed by WebView2: the single report (laid out like Pleya's, no
  prices unless asked) and the month's summary with totals. Sent by email from
  the sheet owner's Gmail, or "segna come inviato senza email".

**The sheet** (`apps-script/Code.gs`). Sheets *Rapportini*, *Clienti*,
*Commesse*, *Impostazioni* (plus *Accessi* and *Dispositivi*), and a *Wisper* folder in Drive for receipts,
signatures and job documents. It is the only place where money is computed, so
phone and computer can never show two different totals. Nothing answers without
the code.

## Look

`docs/aspetto.md` is the design guide (research, principles, colours, type, every
screen of phone and computer), `docs/prototipo/` the clickable prototype it came
from. One family with the phone: warm light background, white cards with a
border, yellow only on the thing to do, Figtree (SIL OFL, bundled), light and
dark themes. No permanent help text: the first time, both apps open a guided
tour on the real screens with example data, and it can be replayed from the
settings.

## Money

- **Elettrodinamica** is a client with a fixed rate (`TARIFFA_FISSA` 30 €/h),
  travel time not paid, kilometres paid. Work done for Elettrodinamica at other
  companies is billed to Elettrodinamica: the end customer does not matter.
- **Free rates.** Every other client has none: the rate is typed in the report,
  and the sheet remembers it: next time the phone proposes it already written
  ("L'ultima usata per Rossi Impianti"). Any client can be given a fixed rate.
- **Job budget**, as the studio writes it: planned hours × hourly price = budget;
  hours × hourly cost = planned cost; the difference is the margin (30 − 22 = 8 €/h).
  Any two of hours, price and budget give the third. A job's price is proposed
  as the rate in its reports (still editable); a job without one takes the rate
  of its first report, from phone or computer. The hourly cost comes from the
  client's optional fixed cost (`COSTO_FISSO`, typed by hand for Elettrodinamica),
  then the job's, then the setting. Travel hours are not costed separately: the
  hourly cost already includes them. Elettrodinamica's jobs always use its fixed
  rate and cost.
- **Kilometres** at the ACI rate for the Volvo XC40 (0,76 €/km to start with; to
  be checked every January against the ACI table, it is a setting). A job can
  have its own €/km (`EURO_KM` on the job), which wins over the setting.
- **Job codes**: two-digit year, `ST` (Studio Tecnico GM) and a number that
  keeps counting across years: 26ST001, …, 26ST046, 27ST047. The code is shown as
  soon as a job is created, also on the phone offline (it proposes the next
  number; if the computer took it meanwhile, the sheet gives the next free one).
  The *COMMESSA* column of *Rapportini* holds the code, and summaries and PDFs
  show the code, not the description.
- **Up to 0.3.4** there were groups (*Elettrodinamica*, *Privato*) with end
  customers inside Elettrodinamica, and codes like P2601. The first request after
  pasting the 0.3.5 script fixes the sheet once (`aggiornaStruttura`): it creates
  the Elettrodinamica client, moves the end customers' reports and jobs to it
  (their rows stay, hidden, with `ACCORPATO_IN`, and their names become
  aliases), gives old jobs a 26ST code (the old one stays in
  `CODICE_PRECEDENTE`) and writes the code in the *COMMESSA* column.
- Rates are **frozen in the row**: changing the ACI cost in January does not
  rewrite July.
- Work hours at the rate, extra hours at the rate plus the group's surcharge,
  travel only if paid, km if refunded, expenses as they are. Each piece is
  rounded to the cent before adding up, so the total on the PDF is the exact sum
  of the lines above it. The same formula lives in the script, the app and the
  office program, and all three are tested on the same cases
  (`apps-script/prove/casi-calcolo.json`).

## Setting it up

1. **The sheet.** In the spreadsheet: Extensions → Apps Script, paste
   `apps-script/Code.gs`, run `preparaFoglio()` once. It adds the missing sheets
   and columns without touching existing ones, and writes the CODE in the log.
   Deploy → New deployment → Web app, execute as *me*, access *Anyone*. The sheet
   should belong to whoever sends the emails: they leave from its owner's Gmail.
2. **The phone.** The first screen asks for the sheet address and the code; both
   can be changed later from the settings, so a new code does not need a new app.
   The address lives in `C:\Users\andre\wisper-keys\wisper.properties`
   (`sheetUrl=https://script.google.com/macros/s/.../exec`), outside the repo, and
   goes into debug builds only. A release APK carries it only if asked for, to
   install by hand at home: `gradlew :app:assembleRelease -PconIndirizzo`. The
   phone saves it on first start, so later updates without it keep working.
3. **The computer.** `powershell -ExecutionPolicy Bypass -File pc\prove\crea-pacchetto.ps1`
   makes `pc/dist/WisperUfficio.exe`, a single file. Put it anywhere you can
   write (Desktop, Documents: it replaces itself when it updates), start it,
   paste address and code in *Impostazioni*. The code is stored encrypted with
   the Windows user's DPAPI. `-ConIndirizzo` puts the address inside, for a home
   copy only. `WisperUfficio.exe --stampa-prova file.html file.pdf` tells you
   whether PDFs print on that computer.

**Connecting the computer from the phone.** *Impostazioni › Collega il computer* on the
phone asks the script (`collegaComputer`) to email the sheet owner a small file,
`Collega Wisper Ufficio.wisper`, with the address and the code. Opening it on the office
computer (double click: the installer associates `.wisper` with the program, per user)
connects Wisper Ufficio and deletes the file; *Impostazioni › Usa il file dell'email* does
the same by hand. The email only ever goes to the owner. A program already open notices
the new connection on its next call to the sheet. The same email carries the link to the
latest `WisperUfficio.exe`, so a computer without Wisper Ufficio installs it first (it
installs itself when opened, and that also registers `.wisper`) and then opens the file.

**The address never goes into what is published.** GitHub releases are public
and anything inside an APK or an exe can be read. `strumenti\rilascio.ps1`
refuses to publish if it finds the address in the APK's code or if the exe says
it carries one (`WisperUfficio.exe --indirizzo-incluso` exits with 3).

**Access log.** Every request to the script leaves a row in the *Accessi* sheet:
when, outcome, action, device name, app version, device id. Phone and computer
create their id on first start and send it with every call; *Dispositivi* lists
them with first and last access, and a NOTE column for who owns each. Google
does not give the script the caller's IP address, so there is none. The owner of
the sheet (and anyone in the `EMAIL_AVVISI` setting) gets an email when an
unknown device gets in with the right code, when a request with the right code
does not say who it is (once a day, once the apps have been updated for two
days), and after 5 wrong codes in an hour (once every 6 hours). The code itself
is never written down. Wrong codes beyond 50 an hour are only counted, so
nobody can fill the sheet. Rows beyond 60,000 (about a year) are trimmed.

**Text stays text.** Sheets reads what it receives as if someone typed it:
`01234567890` becomes a number and loses its zero, `=...` becomes a formula. The
script writes VAT numbers and phones, values starting with `= + - @` and
digit-only codes starting with 0 with the apostrophe that marks text
(`perLaCella`). VAT numbers and phones that had already turned into numbers are
read back right and fixed in the sheet on the first request.

After every change to `Code.gs`: Deploy → Manage deployments → edit → New
version, or the address keeps serving the old code.

## Updates

Both apps update themselves. Once an hour (and at start) they fetch
`aggiornamento.json` from the latest GitHub release of this repository: the
versions, where to download them, their size and SHA-256, **signed** with an
ECDSA key whose private half lives only in `wisper-keys`
(`aggiornamenti-privata.pem`). The apps carry the public half and ignore any
list that does not verify, so a stolen GitHub account is not enough to push a
program onto my father's phone or computer.

- **Computer.** If there is a newer version it downloads the exe, checks the
  hash, renames the running exe to `.vecchio` (Windows allows it) and puts the
  new one in its place. The sidebar says "Versione X pronta" with *Riavvia*;
  otherwise it starts with the new version next time.
- **Phone.** It downloads the APK, checks the hash and installs it through
  Android's PackageInstaller, which also refuses anything not signed with the
  app's own key. It installs only when the app is closed or in the background
  and no report is half written. The very first update asks for two taps
  (allow installs from Wisper, then *Update*); from then on, on Android 12 and
  later, updates install with no question at all.

**Publishing a version.** Raise `versionCode`/`versionName` in
`app/build.gradle.kts` and `Version` in the `.csproj`, then
`powershell -ExecutionPolicy Bypass -File strumenti\rilascio.ps1` builds the signed APK, the exe and the signed list in `dist/rilascio/vX.Y.Z/`; add
`-Pubblica` to create the GitHub release. Within an hour both apps have it.

**Keys.** `wisper-keys\wisper-release.jks` signs the APK: if it is lost, the
next version cannot be installed over the old one (uninstall and reinstall,
data on the sheet is safe). Keep a copy of the whole `wisper-keys` folder
somewhere that is not this computer.

## Trying it without the real sheet

```
node apps-script/prove/finto-google.js
node pc/prove/finto-ponte.js
```

The first runs `Code.gs` unchanged over in-memory sheets, Drive and Gmail, on
port 8765 with code `prova`, seeded with a few clients, jobs and reports; emails
land in `apps-script/prove/posta-finta/`. The second imitates the office
program's bridge on port 8790, so the interface opens in any browser; PDFs are
printed by headless Edge into `pc/prove/stampe/`. A debug build of the app talks
to `http://10.0.2.2:8765/exec` from the emulator.

Tests: `node --test "apps-script/prove/*.test.js"`, `node --test "pc/prove/*.test.js"`,
`gradlew :app:testDebugUnitTest`.

Updates can be tried locally: build a higher version
(`crea-pacchetto.ps1 -Versione 0.3.1 -Uscita DIR`, or
`gradlew assembleDebug -PcodiceVersione=4 -PnomeVersione=0.4.0`), sign the list
with `node strumenti/firma-aggiornamento.js --cartella DIR --indirizzo http://...`,
serve the folder over HTTP and point the apps at it
(`WisperUfficio.exe --aggiornamenti http://localhost:PORT/aggiornamento.json`,
`gradlew assembleDebug -PaggiornamentiUrl=http://10.0.2.2:PORT/aggiornamento.json`).
Plain http is accepted only from the computer itself.

## Things worth knowing

**One user.** One sheet, its owner's. A second phone gets its own name in the
settings, nothing more.

**The code is a shared secret, not an account.** Anyone with the address and the
code can read and write. `cambiaCodice()` in the script makes a new one.

**Not done yet.** The monthly summary does not yet copy the layout of the Excel
sheet my father uses today. Ticket, calendar, credentials and the whole sales,
purchases and accounting side of Pleya are deliberately left out for now.

**How this was built.** The product calls are mine and my father's, the code is
Claude's. My job was deciding what it should do, what it should leave out, and
what it must never get wrong.
