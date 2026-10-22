# Wisper server

The single home of Wisper's data and calculations, from phase 1 of the management system (October 2026). It replaces
the Google Sheet + Apps Script as the place where data lives: the Android app and Wisper Ufficio talk to it with a
personal email and password instead of the shared sheet code. It runs in Docker on the home NAS and is reached from
outside through a Tailscale container, with no open ports.

The full technical agreement (protocol, roles, tables, actions, JSON shapes) is in
[`docs/gestionale/architettura.md`](../docs/gestionale/architettura.md); the postman/bridge protocol with the sheet's
script is in [`docs/gestionale/postino.md`](../docs/gestionale/postino.md).

## What it does

- **Same protocol as `apps-script/Code.gs`**: `GET /exec?azione=...` and `POST /exec {"azione": ...}`, always
  `{"ok": true, ...}` or `{"ok": false, "errore": "..."}`. Every existing action (`anagrafiche`, `rapportini`,
  `salvaRapportino`, `caricaFile`, `stato`, `inviaEmail`...) follows the same rules and returns the same fields as the
  script, so the apps only change address and credentials. The tests compare the server with the real script running
  in the fake Google, field by field.
- **Accounts and permissions**: scrypt passwords, SHA-256 tokens, lockout after 10 wrong attempts in 15 minutes, four
  roles (titolare, amministrazione, collaboratore, lettura) with per-module levels. Without the `costi` permission the
  server strips rates, totals and costs from every response; a collaboratore only sees and writes his own reports.
- **Audit log** of every change (before/after, changed fields only, never passwords or file contents) and of every
  request.
- **SQLite** (`node:sqlite`, WAL) with numbered migrations and a copy before each one; files on disk under
  `<data>/file/`.
- **Nightly backups** at 02:30: `VACUUM INTO` on the NAS (30 days + one per month for a year), a gzipped copy and the
  new files sent to Google Drive through the sheet's script (the "postman"), and the sheet's tabs rewritten so the
  sheet stays readable. Restore with `strumenti/ripristina.js`.
- **Bridge** (`POST /ponte`, `X-Wisper-Segreto`): old app versions still calling the sheet are forwarded here by the
  script and run as the owner.
- CSV export for Excel, a dashboard ("what do I do now?"), VAT number check through the EU VIES service.
- **Phase 2: quotes, tasks and calendar** (`docs/gestionale/fase2.md`, responses in `architettura.md` §13): a price
  list, quotes `PR/yyyy/nnn` with sections, optional and alternative items, discounts, EPPI and VAT frozen at creation,
  the legal checklist (`mancano`), revisions (the old one becomes SOSTITUITO), sending with the PDF, acceptance with the
  client's choices and signature, and the accepted quote turned into a job once (work phases, contract amount, hours,
  hourly price, payment schedule). The quote maths live only here (`contiPreventivo` in `src/conti.js`), with the
  shared cases in `prove/casi-preventivo.json`. Tasks, appointments and site visits with checklists, attachments,
  overlap warnings for the same person, and recurring series (occurrences kept 90 days ahead and extended every night;
  edit "this / following / all", skip one).
- **Phase 3: hours, timer, approvals, expenses, trips, vehicles, reimbursements** (`docs/gestionale/fase3.md`,
  responses in `architettura.md` §14, migration `003-ore-spese`): hours without a report (start/end/break, also across
  midnight, or typed by hand, billable or not, overtime), one timer per person that survives a restart and becomes a
  draft row when stopped, approval of collaborators' hours, reports, expenses and trips (anomalies: too many hours in a
  day, no receipt, over 200 euro, unusual km; reject only with a reason, undo), a report waiting for approval cannot be
  sent or invoiced, statistics per person and per job, the full job cost; expenses with receipt photo and "who it goes
  to" (client, office, mine; client-addressed documents as pass-through costs), trips with km x the vehicle's ACI rate
  frozen at creation, reimbursements owed and "mark as reimbursed", summaries and CSV exports. The expenses already
  written in reports became expense rows linked to them, and every existing report gives the same numbers to the cent
  (proved against the 0.5.0 server in `prove/migrazione-spese.test.js`); old app versions keep working through the
  bridge. A person always sees the money they spent and are owed, even without the `costi` permission. Shared
  calculation cases for the apps: `prove/casi-ore-spese.json`.
- **Phase 4: invoicing, banks and due dates** (`docs/gestionale/fase4.md`, responses in `architettura.md` §15,
  migration `004-fatture-banche`). Wisper *prepares* invoices and Manuel's invoicing program *issues* them: a draft never
  gets an invented fiscal number. "To invoice" collects everything ready per client (payment milestones of fixed-price
  jobs, signed reports with their expenses, client expenses with pass-through costs kept apart, billable hours); a draft
  gets the rows and groups of the agreement and the invoice maths frozen at creation (`contiFattura` in
  `src/conti.js`: EPPI contribution, VAT, withholding only for withholding agents, pass-through costs, stamp duty above
  77.47 euro; shared cases in `prove/casi-fattura.json` for the apps). **Something is invoiced once only, and the
  database guarantees it**: every source enters an invoice through `fattura_sorgenti`, with a unique index on the active
  rows (tested by hand-written inserts, two simultaneous requests and two servers on the same file). Handing over to the
  program: a field-by-field sheet and a FatturaPA FPR12 1.2.3 XML "to complete" (number `BOZZA`, file name saying not to
  send it), from one invoice model, with more outputs to come when the program is known (`src/passaggio/`). The issued
  XML comes back (`.xml`, `.p7m` signed envelopes also in base64 or split, `.zip` with several files; hand-written
  reader in `src/fatturapa.js`: no DOCTYPE or entities, file count and size limits, no zip in zip, signatures not
  verified): it is matched to its draft (certain via "Rif. Wisper W-15", probable by total, different with the missing
  rows, none), the XML wins, only groups missing entirely go back to "to invoice", duplicates are refused, invoices made
  outside Wisper can be linked to the work they covered; on issue reports become FATTURATO, milestones and expenses and
  hours invoiced, all in the audit log, undone by credit notes (TD04) or an SDI rejection. Received invoices from
  suppliers (withholding included), payment milestones per job, the yearly summary, fiscal rules that must be confirmed
  by the accountant (shown on every invoice until then; changing a rule removes the confirmation). Banks: accounts (full
  IBAN only to who can write), balance from the last written statement plus movements, hand-written movements with
  search, part payments matched to invoices, received invoices and obligations (never above the residual), recurring
  taxes and F24 (12 months ahead; this/following/all), Wisper's own proposals (withholding F24 1040, quarterly e-invoice
  stamp duty), a cautious cash forecast (overdue payments count today, overdue receipts do not) with the days below the
  threshold, and the financial situation. Planned, recorded and verified at the bank are always kept apart; SDI, bank
  connection and statement import say "not connected".

No npm dependencies: only Node 24 built-in modules.

## Run it

```sh
node server/src/avvio.js --dati ./dati [--porta 8400]       # real data folder
node server/src/avvio.js --dati ./dati-prova --prova         # sample data, in memory
```

`--prova` starts with the same sample data as the fake Google (`apps-script/prove/finto-google.js`) plus suppliers,
contacts, sites, work phases and four test users, all with password `prova`: `manuel@esempio.it` (titolare),
`laura@esempio.it` (amministrazione), `marco@esempio.it` (collaboratore, with two reports of his own),
`lettura@esempio.it` (read-only), and the quotes and tasks of the phase 2 prototype with dates counted from today (a
sent quote expiring in 6 days, an expired one, a draft without price, an accepted one, overdue and recurring tasks, an
appointment and a site visit), and for phase 3 the recent hours of three people, Marco's running timer, things to approve
with anomalies, a rejected item, expenses with and without receipts for client, office and "mine", a pass-through cost,
trips and reimbursements to make, and for phase 4 the prototype's invoices (38/2026 paid, 39/2026 partly paid and overdue,
45/2026 delivered, draft W-15 and W-14 ready and already paid, all handed over and returned through the real XML import),
Elettrodinamica's September reports to invoice in one row per month, job 26ST003 from the accepted quote PR/2026/012
rev. 1 (3,800 euro, 30/40/30), the studio account with October's movements, received invoices (one with withholding),
recurring rent and utilities and a forecast that falls below 3,000 euro. E-mails and backups go to `<data>/posta-finta/`. Phone emulator:
`http://10.0.2.2:8400`; computer: `http://localhost:8400`.

On the NAS (`/volume1/docker/Wisper-NAS`): copy `.env.esempio` to `.env` with the real values, then
`docker compose up -d --build`. The data folder `./dati` must be writable by uid 1000 (the image runs as `node`, not
root). Create the first owner with
`docker compose exec wisper node strumenti/utente.js --titolare "Name Surname" email` (asks for the password).

## Tools

| Command | What |
|---|---|
| `node server/strumenti/utente.js --titolare "Name" email [--dati <dir>]` | creates a user (also `--ruolo <role>`, `--password email`), password typed, never stored in clear |
| `node server/strumenti/importa.js --foglio <copy.xlsx> [--file <dir>] --dati <dir>` | imports the sheet's Excel export (own xlsx reader), applies the pre-0.3.5 transformations, writes `controllo.html`; exits with an error and no database if any total doesn't match |
| `node server/strumenti/copia-drive.js --da <script url> --dati <dir>` | copies the Drive files cited by the sheet (photos, signatures, job documents) with the script's read-only `file` action |
| `node server/strumenti/ripristina.js <copy> [--dati <dir>]` | restores a backup (`.db` or `.db.gz`) with the server stopped, keeping the current database aside |

## Tests

```sh
node --test server/prove/
```

Calculation cases shared with the script and the apps (`apps-script/prove/casi-calcolo.json`), the data rules of the
script's tests, "must not see / must not write" for every role, audit log, numbering, archive and restore, import of
the fake Google's sheets (also a pre-0.3.5 sheet) with totals checked to the cent, `copia-drive` against the fake
Google, backups through a fake postman, restore, migrations, the bridge with right and wrong secret; for phase 2 the
quote cases, revisions and lock, acceptance with choices, the job created once, recurrences (this/following/all,
skip), overlaps and every role on the new actions; for phase 3 the hours and reimbursement cases, the timer across a
restart, approvals with reason and undo, the report that cannot be sent before approval, frozen rates, reimbursements,
statistics, the job cost (checked against the phase 1 dashboard in `pc/ui/conti.js`), and a 0.5.0 database migrated with
every report identical to the cent; for phase 4 the 30 invoice cases and the 4 report groupings, invoicing once only (also
two requests at once and two servers on one file), every state change and refusal, the locks on what is already in an
invoice, the handover sheet and XML read back equal to the model, the FatturaPA reader on the example files in
`prove/xml/` (invented data, rebuilt by `node server/prove/xml/genera.js`: UTF-8 and ISO-8859-1, prefixes, DER and
base64 p7m, zip, batch, credit note, delivery and rejection receipts, a received invoice with withholding) and the
malicious ones, matching certain/probable/different/none, credit notes, the SDI rejection, banks, the cash forecast,
recurring obligations and proposals, every role on every new action, and migration 004 on a phase 3 database. Nothing
in the tests touches Google or the internet.
