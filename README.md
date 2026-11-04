# Wisper

Work reports for a technician who works alone: filled in on the phone at
the client's, managed on the computer at the office. Since version 1.0.0
(3 November 2026) Wisper is the studio's whole management system and the data
lives on a small server at home; up to 0.4.0 it was kept in a Google Sheet.

It is built for one person, my father, a self-employed surveyor who does monthly
reports for a few clients. Everything in it comes from a recorded conversation
between us (14/10/2026) and from a demo of [Pleya](https://pleya.it), a management
suite my father liked, of which two parts were taken and cut down to one person:
projects (here *commesse*, the word my father uses) and the team's reports.

Every version, with its date, the reason behind it and screenshots, is in the
diary: [DIARIO.md](DIARIO.md) (in Italian).

## Becoming the studio's management system

My father wrote the specification of a complete management system for the studio
(`docs/specifiche-stgm.md`, in Italian: 18 modules, from clients and jobs to quotes,
invoices, people and a client portal). Wisper is growing into it phase by phase, on the
`gestionale` branch, without losing anything it does today. The plan and the decisions
are in `docs/gestionale/`; every phase has its entry in the diary. All nine phases were
released together as version 1.0.0 on 3 November 2026, the evening the studio's data moved
from the sheet to the server.

Version 1.1.0 (same night, after my father's first evening with it) added what he asked for
(`docs/gestionale/progetti.md`): the data started again from zero (`server/strumenti/svuota.js`
keeps accounts, paired devices and settings, after a full copy of the data folder); every module
can be switched off, none is compulsory (switching off Clients also switches off what needs it,
like Jobs and Projects); and a new level under each job, **projects** (*progetti*): client → jobs
→ projects → reports. A project has a code, an optional "made out to" name (for the clients he
works for under another company's name) and a description. Codes are typed by hand the first
times; after two or three Wisper finds the pattern by itself (fixed parts, the job's code, the
year, one counter) and proposes the next one (`server/src/codici-progetto.js`, the same cases
ported to the phone so it proposes the same code offline).

Version 1.1.1 of the office program (4 November) keeps the side menu where it was when you click an item
(scroll position and keyboard focus are kept across redraws). It also drops the grey scrollbar: the menu edge fades
where more items are hidden (`pc/prove/prova-menu-laterale.js`).

Phase 1 (October 2026) replaces the Google Sheet with a small server on
the home NAS (`server/`: Node.js 24 with its built-in SQLite, no npm dependencies, in
Docker). It speaks the same protocol as the sheet script, so the phone and the office
program changed little, but now everyone signs in with their own name and password, and
the server decides what each role may see: a collaborator never receives rates, totals or
margins. Both apps got a side menu, a Dashboard as the home page ("what needs doing now"),
clients and suppliers with contacts and sites, jobs split into professional services with
their value and progress, and an administration area with users, roles, numbering, an
activity log and backups. The sheet stays: after the switch it receives a nightly copy of
the data, and its script keeps forwarding old app versions to the server and sending email
from the studio's Gmail (`apps-script/Ponte.gs`).

Phase 2 adds quotes, tasks and the calendar. A quote is built from sections and items
taken from the studio's price list; the client can tick optional items and pick one of
several alternatives, and the server alone does the maths (fee, the engineers' pension
contribution, VAT), checked against shared cases that the phone and the office program
must match to the cent. The quote also lists what Italian law requires a professional's
quote to state and flags what is missing before it is sent. Once sent, prices are frozen
(a change means a new revision). An accepted quote becomes a job in one step, with its
services, values and payment schedule. Tasks can be personal, for the team or
unassigned, with checklists, attachments, reminders and safe recurrence; the calendar
has day, week and month views, and the office program adds a weekly plan per person.

Phase 3 adds hours, a timer, expenses and trips. The work report keeps its three steps;
hours without a report have their own short form, and a one-tap timer lives on the server,
so it survives closing the app. Collaborators' hours, reports, expenses and trips go to
whoever approves them, with oddities flagged (13 hours in a day, an expense over 200 euro,
no receipt) and a mandatory reason when something is rejected. An expense starts from the
photo of the receipt and says plainly who it is for: the client, the studio, or the person.
Trips compute the mileage refund from the vehicle and the year's ACI table. Offline, hours
and expenses wait in the same on-disk queue as reports, and the server ignores a repeated
send. The migration turned the expenses already written in reports into expense rows
without touching the reports: a test reads a database from before with the phase 2 code
and checks every report field, the CSV export and the Dashboard money to the cent.

Phase 4 adds invoicing, banks and due dates. Wisper prepares the invoice (fee, the
engineers' pension contribution inside the VAT base, VAT, withholding tax only for clients
who must apply it, re-charged expenses outside VAT, the 2 euro stamp) and the program my
father already uses issues it: Wisper hands over a field-by-field summary and an XML to
complete, numbered BOZZA and named so nobody sends it; it never invents an invoice number,
and sending to the tax exchange is marked "not connected". The issued XML (plain, signed
.p7m or zipped) comes back into Wisper and is matched to its draft only after an explicit
confirmation. A unique index in the database guarantees that a report, an instalment or an
expense can never be invoiced twice. Until the accountant confirms the tax rules, every
invoicing page says so. Banking is a hand-kept schedule: expected, recorded and verified
amounts stay separate, and the projected balance turns red on the days it drops below a
threshold.

Phase 5 adds documents, tickets and maintenance. A document is either a file on the NAS or
a link to where it already lives (OneDrive, SharePoint, Google Drive, a studio folder):
nothing is copied. Documents have revisions, approvals, categories and due dates (for
example the periodic earthing checks). A ticket is a service request on a client's
installation; it reuses what exists instead of duplicating it: the visit is a calendar
task, hours and expenses are the phase 3 ones, and it is closed with the usual signed work
report, offline too. Closing it means choosing how it is invoiced, and it enters the
invoicing list under the same unique index, so neither the ticket nor its reports can be
invoiced twice. Maintenance contracts carry their fee and generate the scheduled visits.

Phase 6 adds people, vehicles and equipment, and external collaborators: leave requests
(offline too), the hourly cost with its history, measuring instruments whose calibration
is always visible in the work report, and assignments to outside firms with their invoices
counted in the job's cost.

Phase 7 adds messages and a client portal. Wisper prepares WhatsApp messages from templates
(appointment reminders, reports to sign, payment reminders) and opens the chat with the text
ready; a person always presses send, and Wisper asks afterwards whether it went. Phone
numbers written in any form become the right WhatsApp number with the same rules on server,
phone and PC. The portal lets a client's contact sign in with an email code and see only what
the studio published for their company: accept a quote choosing the optional items, sign a
work report with a finger, download invoices and documents, open and follow service requests.
It costs nothing to run: the page is a static file on Netlify, the data goes through a
separate Google Apps Script (so the main sheet's script address never appears in a page
clients see), and the NAS fetches the requests itself, so nothing is opened on the home
router. Behind Google the client's IP address doesn't arrive, so neither the access log nor
the signature evidence records it; there are no cookies either.

Phase 8 closes the plan with integrations, settings and the final checks before the switch.
An Integrations page lists every connection (Google gateway, portal, VAT number check, app
updates, calendar feed, backups) with its state, last check, what leaves the NAS and its cost
(all 0 €); a broken one shows in red with "Try now". The calendar can be added to Google or
Outlook through a private address that phones read at home; reading it from outside goes
through the portal script and is off by default. Search now looks inside files (PDF, Word,
Excel, DXF). Clients and suppliers can be imported from a CSV or Excel file, everything can be
exported as one ZIP (only at home), each person picks their dashboard tiles, and modules can
be switched off. Backups can be encrypted, are checked automatically every 30 days (integrity,
row counts, file hashes, the off-site copy's fingerprint) and a manual restore test is logged
every 90 days. A checklist of 77 rows tracks the tests before the switch evening. Ten years of
realistic fake data stay within the agreed times on the NAS (dashboard about 0.4 s, export of
everything about 10 s).

The office computer can sign in with the phone, the way WhatsApp links devices: the sign-in page
shows a QR code, the phone (Menu › Connect a computer) scans it, asks for confirmation with the
computer's name, and the computer is in. The code holds only a random id and the computer's
public key; the server hands the access key and the Google address to the computer encrypted for
that key (ECDH P-256, HKDF, AES-GCM), and only on the office network. The QR encoder is written
by hand and checked with ZXing (`docs/gestionale/collega-qr.md`).

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
- **The office on the phone too** (0.4.0, `docs/telefono-ufficio.md`): a bottom
  bar *Oggi · Rapportini · Ufficio*. *Ufficio* opens on the month end like the
  computer (ready to invoice per client, **Prepara riepilogo** with the real PDF
  as preview, send by email or share, **Segna fatturati** with Annulla), then
  jobs (budget, margin, the five tabs, Drive documents), clients and every
  setting. *Rapportini* has search, months, filters and multi-select; an opened
  report has one yellow button per state and the computer's ⋯ menu. The PDFs are
  made on the phone from the same templates as the computer (`pc/ui/documenti.js`
  copied into the app at build time), printed by a hidden WebView. State changes
  queue offline like reports; emails, clients, jobs and settings need signal, and
  an email is never retried by itself.

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

**Permissions.** The script needs to know the sheet owner's email (connect-computer
email, access-log notices, "send it to me"). `Session.getEffectiveUser()` needs the
`https://www.googleapis.com/auth/userinfo.email` scope; a project whose
`appsscript.json` lists `oauthScopes` by hand without it fails with "Le autorizzazioni
specificate non sono sufficienti". The script then asks Drive who owns the sheet.
A hand-written `oauthScopes` list is best removed altogether: on the real sheet it also lacked
`script.send_mail`, and every email failed. Without the list Google derives the scopes from the code; after
changing `appsscript.json`, run `autorizza()` (tick "Select all") and deploy a new version.
Run `autorizza()` from the editor after pasting a new version: Google asks for any
missing permission, and the execution log says whether the owner's email can be read
and how many emails are left for the day. It changes nothing in the sheet.

## Updates

Both apps update themselves, and since 1.1.0 (3 November 2026) **the NAS tells
them when**: they no longer check on their own every hour. The server reads
`aggiornamento.json` from the latest GitHub release every 10 minutes
(`server/src/versioni.js`), verifies its signature with the same public key the
apps carry, and announces the versions in two silent ways: every `/exec` answer
carries a small `versioni` field (also through the Google door and in error
answers), and while an app is open at home it keeps a long request open on
`/campanello`, which the server answers the moment the list changes. An app
that sees it is behind downloads the new version from GitHub exactly as before.
The list (`aggiornamento.json` in the latest GitHub release) gives the
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
`-Pubblica` to create the GitHub release. Within ten minutes the NAS notices and
tells both apps.

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
