# Wisper

Work reports for a technician who works alone: filled in on the phone at
the client's, managed on the computer at the office, kept in a Google Sheet.

It is built for one person, my father, a self-employed surveyor who does monthly
reports for a few clients. Everything in it comes from a recorded conversation
between us (14/10/2026) and from a demo of [Pleya](https://pleya.it), a management
suite he liked, of which two parts were taken and cut down to one person:
projects (here *commesse*, the word he uses) and the team's reports.

## What changed

The first Wisper, built for NGN Hacks 2026, was voice only: a wake word, a
conversation, a row in the sheet. When my father tried it, the answer was "lascia
stare la voce, facciamola a mano", leave the voice, let's do it by hand. So the
voice is gone, all of it: wake word, recogniser, Gemini, the listening service,
the location. What was worth keeping stayed: the on-disk queue that never loses
a report, and the sheet as the single place where data lives.

## Three pieces

**The phone** (`app/`, Kotlin, Compose). Opens on the month's reports with their
totals. A report is one screen, from the date to the client's signature, with
Save always at the bottom. In Pleya you create a report and then reopen it to
add hours and photos; the first thing my father said was "this is one step too
many".

- Today is the default date. Choosing a job fills in the client; a client or job
  typed in that does not exist yet is created by the sheet, with its code.
- Hours: work, extra, travel. Kilometres. Expenses with photos of the receipts,
  taken there and then or added later by reopening the report.
- The client signs with a finger on the phone. No QR code: in Pleya the client
  frames a code with their own phone, and my father's verdict was "even more
  complicated". A signed report is locked until it is put back to draft, which
  removes the signature.
- Everything goes to a file first and WorkManager sends it when there is signal,
  even with the app closed. Without signal the list says so: "1 modifica è sul
  telefono e parte appena c'è rete".

**Wisper Ufficio** (`pc/`, C# .NET 8, WebView2, built like Pactum). The main
program, because invoicing is done at a desk.

- *Rapportini*: filters by client, group, month and state, totals at the bottom.
  "07" with no client gives every report of July with the total, which is what
  an invoice is made from. Each report shows its steps, Bozza → Firmato →
  Inviato → Fatturato, with one sentence saying what is missing.
- *Commesse*: open, suspended and closed, with the hidden ones counted instead of
  silently filtered. Hours against the budget (warning at 85%, over at 100%),
  expected value, cost, margin, what is ready to invoice, documents in Drive.
- *Clienti* and *Impostazioni*: groups and rates, ACI cost per km, your hourly
  cost, letterhead, your signature.
- Two PDFs printed by WebView2: the single report (laid out like Pleya's, no
  prices unless asked) and the month's summary with totals. Sent by email from
  the sheet owner's Gmail, or "segna come inviato senza email".

**The sheet** (`apps-script/Code.gs`). Sheets *Rapportini*, *Clienti*,
*Commesse*, *Gruppi*, *Impostazioni*, and a *Wisper* folder in Drive for receipts,
signatures and job documents. It is the only place where money is computed, so
phone and computer can never show two different totals. Nothing answers without
the code.

## Money

- **Groups.** Every client belongs to one. *Elettrodinamica*: 30 €/h fixed, travel
  time not paid, kilometres paid. *Privato*: no fixed rate.
- **Free rates.** For a client outside a fixed group the rate is typed in the
  report, and the sheet remembers it: next time the phone proposes it already
  written ("L'ultima usata per Rossi Impianti").
- **Kilometres** at the ACI rate for the Volvo XC40 (0,76 €/km to start with; to
  be checked every January against the ACI table, it is a setting).
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
2. **The phone.** In `C:\Users\andre\wisper-keys\wisper.properties`:
   ```
   sheetUrl=https://script.google.com/macros/s/.../exec
   sheetCodice=...
   ```
   Build the APK. Both can also be changed from the app's settings, so a new
   code does not need a new app.
3. **The computer.** `powershell -ExecutionPolicy Bypass -File pc\prove\crea-pacchetto.ps1`
   makes `pc/dist/wisper-ufficio.zip`. Unzip anywhere, start `WisperUfficio.exe`,
   paste address and code in *Impostazioni*. The code is stored encrypted with
   the Windows user's DPAPI. `WisperUfficio.exe --stampa-prova file.html file.pdf`
   tells you whether PDFs print on that computer.

After every change to `Code.gs`: Deploy → Manage deployments → edit → New
version, or the address keeps serving the old code.

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
