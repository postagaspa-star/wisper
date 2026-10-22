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
- **Phase 5: documents, tickets and service contracts** (`docs/gestionale/fase5.md`, responses in `architettura.md`
  §16, migration `005-documenti-ticket`, server 0.8.0). *Documents*: an archive with categories, per client, job, plant
  and ticket; each document is either a file uploaded to the NAS (with revisions: the old one stays readable as
  "superseded", a new one waits for approval without replacing the valid one; approve, reject with a reason, undo) or a
  **link** to a file or folder already on OneDrive, SharePoint, Google Drive, a website or a `\\server\...` path, recognised
  from the address and never copied (`tipoCollegamento` in `src/documenti.js`, cases in `prove/casi-collegamenti.json`);
  who can see what (`tutti`, `costi`, `riservati`: hidden documents are not listed and `/file/<id>` answers 403); search
  in titles, notes, references, client, job, plant and ticket (accents and case ignored, all words; not inside files);
  document deadlines; templates (Wisper's PDFs stay laid out in `pc/ui/documenti.js`, their texts and the letters are
  editable, placeholders checked); "send by email" and a copy of every PDF Wisper sends (`COPIA_INVIATI`). Browsing
  OneDrive/Drive and the expiring client link are **not connected** (the link is built and tested, served only by a
  second port, `--porta-condivisione`, and only once `CONDIVISIONE_INDIRIZZO` is set). Files arrive as raw bytes with
  **`POST /carica`** (up to `FILE_MAX_MB`, 50 MB, written to disk while they arrive and removed if too big, SHA-256
  duplicate check, file type checked on the first bytes: no programs, scripts or web pages); base64 uploads keep working
  for old apps. Disk space: below `SPAZIO_MINIMO_MB` no new documents, but report photos and signatures still pass down
  to 200 MB free; the dashboard warns below `SPAZIO_AVVISO_MB`; the owner can empty the bin of files older than 90 days.
  The off-site copy now sends one file at a time for at most 20 minutes a night; files over `COPIA_FUORI_MAX_MB` stay on
  the NAS only and the dashboard says so. *Tickets*: service requests tied to client and plant, priority from two
  questions (`prioritaDa` in `src/conti.js`, cases in `prove/casi-ticket.json`), response times from `TICKET_TEMPI` or
  the contract, owner, states (open, taken, waiting, solved, closed, cancelled) with taking/intervention/solution/closing
  times measured; **a ticket reuses what exists**: the visit is a calendar activity of type `intervento` (phase 2,
  overlaps included), hours and expenses are phase 3 rows with `ticket_id`, the closing report is the usual report (the
  server writes the ticket number in its Ticket field only when empty), photos are ticket files; opened offline with
  `idLocale` like hours and expenses. **Closing chooses how it is invoiced** (owner and office only): one row for the
  intervention (a new `ticket` source of "to invoice" under the same unique index, carrying its reports, expenses and
  hours in one group), with the other reports, inside the contract, or not invoiced with a reason; while a ticket is
  open its reports do not appear in "to invoice". *Service contracts* with their own fixed-price job (the fee becomes
  the job's payment milestones, which phase 4 already invoices), periodic visits that create scheduled tickets 30 days
  ahead (checked at start-up and every night, never twice), tacit renewal at night, cancellation, renewal with a new fee
  applied to new instalments only, and whether the contract pays for itself. Plant history, ticket statistics, dashboard
  items, permissions, audit log and CSV exports for all of it. Every report, PDF and total from before is identical after
  the migration (proved against the 0.7.0 server in `prove/migrazione-005.test.js`).

No npm dependencies: only Node 24 built-in modules.

## Run it

```sh
node server/src/avvio.js --dati ./dati [--porta 8400] [--porta-condivisione 8401]   # real data folder
node server/src/avvio.js --dati ./dati-prova --prova                                 # sample data, in memory
```

`--porta-condivisione` starts the second listener that answers only `GET /condiviso/<token>` (the client links of
phase 5); without it, or while `CONDIVISIONE_INDIRIZZO` is empty, no link opens anywhere. `WISPER_SPAZIO_FINTO_MB`
fakes the free disk space (tests only).

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
recurring rent and utilities and a forecast that falls below 3,000 euro, and for phase 5 the prototype's plants 4-9
(Cabina MT Acme, Batokyo's warehouse and earthing system, Mario Bianchi's 6 kW PV), the service contracts CA/2026/001,
CA/2026/002 (tacit renewal, cancellation due by 1 November) and CA/2025/004 with their jobs, tickets TK/2026/0009-0016
(0014 urgent and opened this morning, 0013 with today's 14:30 visit, 0012 solved with Mario Bianchi's signed report and
ready to close, 0011 waiting, 0010 and 0009 closed, 0015 and 0016 created by the contract visits), documents with
revisions (rev. 3 of the MV single-line diagram waiting for approval), links (OneDrive, Google Drive, a website, a
studio path), three to classify, the DPR 462 deadlines of Batokyo and an overdue protection check. E-mails and backups go to `<data>/posta-finta/`. Phone emulator:
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
recurring obligations and proposals, every role on every new action, and migration 004 on a phase 3 database; for
phase 5 the link and priority cases, `/carica` with 49 MB (passes) and 51 MB (refused half-way, also without
Content-Length, nothing left on disk), repeated `idFile`, SHA-256 duplicates and fake types, revisions with approval,
rejection and undo, hidden `costi` documents (403 on `/file`), search, the expiring link on the second port (revoked and
expired: 404), a fake almost-full disk, the one-file-at-a-time off-site copy (too big, failing, retried), every ticket
state change and refusal, the calendar overlap, the report with the ticket (also offline), invoicing a ticket once only
(index, issue, credit note, "with the other reports", "in the contract", "not invoiced"), the fifth grouping "E" of
`casi-fattura.json`, contracts (activation, instalments in "to invoice", the visit ticket created once, tacit renewal,
cancellation, renewal, closing), deadlines (done with the next one, 31 January + 1 month = 28 February, DPR 462 from the
plant's environment), every role on every new action, the dashboard, and migration 005 on the real phase 4 sample
database written by the 0.7.0 server (`prove/migrazione-005/genera-prima.js`). Nothing in the tests touches Google or
the internet.
