# Wisper server

The single home of Wisper's data and calculations, from phase 1 of the management system (October 2026). It replaces
the Google Sheet + Apps Script as the place where data lives: the Android app and Wisper Ufficio talk to it with a
personal email and password instead of the shared sheet code. It runs in Docker on the home NAS. At home the apps talk
to it directly; from outside they go through the **Google door** (from 31 October 2026): the sheet's Apps Script queues
their requests and the server fetches them by itself, so nothing is opened at home, with no domain and no cost (see
[Google door](#google-door)). The internet entrance (Caddy on the home's public IP, one forwarded port: see
[Internet entrance](#internet-entrance)) and the Tailscale container stay prepared but off.

The full technical agreement (protocol, roles, tables, actions, JSON shapes) is in
[`docs/gestionale/architettura.md`](../docs/gestionale/architettura.md); the postman/bridge protocol with the sheet's
script is in [`docs/gestionale/postino.md`](../docs/gestionale/postino.md); the Google door contract (what the apps send
to the script, the "retry" answers, the home rule) is in [`docs/gestionale/porta-google.md`](../docs/gestionale/porta-google.md).

## What it does

- **Same protocol as `apps-script/Code.gs`**: `GET /exec?azione=...` and `POST /exec {"azione": ...}`, always
  `{"ok": true, ...}` or `{"ok": false, "errore": "..."}`. Every existing action (`anagrafiche`, `rapportini`,
  `salvaRapportino`, `caricaFile`, `stato`, `inviaEmail`...) follows the same rules and returns the same fields as the
  script, so the apps only change address and credentials. The tests compare the server with the real script running
  in the fake Google, field by field.
- **Accounts and permissions**: scrypt passwords, SHA-256 tokens, lockout after 10 wrong attempts in 15 minutes, five
  roles (titolare, amministrazione, collaboratore, lettura and, from phase 6, esterno for external contractors) with
  per-module levels. Without the `costi` permission the server strips rates, totals and costs from every response;
  without `riservati` (phase 6) it strips the reserved personal data; a collaboratore only sees and writes his own
  reports.
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
- **Phase 6: people, vehicles and equipment, external contractors** (`docs/gestionale/fase6.md`, responses in
  `architettura.md` §17, migration `006-persone-mezzi-collaboratori`, server 0.9.0). *People*: every user has a person
  record (people without a Wisper login too), with **three levels of data** stripped by the server in one place like the
  costs (`togliPersonali` in `src/permessi.js`, the last step of every response): work data for anyone with `persone` 1,
  personal data (tax code, address, IBAN, emergency contact, contract, leave) for `persone` 2 and the person, reserved
  data (yearly cost, collective agreement and level, reserved notes and documents such as payslips, fitness judgements,
  the type of sick leave) for `riservati` (owner only by default) and the person, except his own cost. Anyone opening
  someone else's reserved data leaves a row in `accessi_riservati` (seen once a day, downloaded, changed, exported),
  which cannot be updated or deleted; the audit log writes `"(riservato)"` instead of personal values. No medical
  details are ever stored: only dates, the fitness judgement and the certificate number. The hourly cost of a person
  (`costoOrarioDelLavoro` in `src/conti.js`) is frozen in new hours and reports at the date of the work (external
  contractors 0); past rows never change. Training and qualifications with their deadlines, medical visits, PPE handed
  over with the recipient's signature, leave (holidays and permits requested and approved with the phase 3 scheme,
  sickness reported, born approved and shown as "Absent" to the others), the leave balance from the last payslip,
  office closures that create holidays for everyone, a monthly attendance summary derived from hours and reports (no
  clocking in, no location), leaving the studio (access off, future leave cancelled, tasks and tickets released) and the
  owner-only anonymisation that deletes the files from disk. *Vehicles and equipment*: studio vehicles (no mileage
  refund) or personal cars (as before), odometer readings with checks, service by km, MOT proposed from the registration
  date, faults with offline photos, maintenance whose cost is always the phase 3 expense or the phase 4 received invoice
  (never counted twice), one assignment in progress per item, "I'll take it" and returns from the offline queue, loans and
  calibrations: an expired calibration is usable only with a recorded confirmation (or blocked by `TARATURA_BLOCCO`),
  never with a non-conforming result, which also lists the interventions to check since the last good calibration; a
  repair voids the calibration. Instruments used go into the report without changing its three steps, with the state of
  that day frozen; the server never refuses a report because of an instrument. *External contractors*: phase 1 suppliers
  with a record (documents and deadlines, eligibility "In order / Missing / Expired"), assignments per job (fixed price or
  hourly with a cap) with agreed, accrued, invoiced and paid amounts from the phase 4 received invoices, the job cost
  including them, and the `esterno` role that only sees his own jobs, reports, documents and payments: every other
  action answers `permesso:false` before looking anything up. Payroll software, the online DURC service and the labour
  inspectorate notice for occasional workers are **not connected**. Every report, hour, trip and cost part from before is
  identical after the migration (proved against the 0.8.0 server, with a frozen clock, in
  `prove/migrazione-006.test.js`).

Since 0.12.0 (3 November 2026, schema 9, `docs/gestionale/progetti.md`): *projects* under each job (client → jobs →
projects → reports), with a code that is unique per client, an optional "made out to" name and a description. Codes are
typed by hand the first times; then `src/codici-progetto.js` finds the pattern of the last two or three (fixed parts, the
job's code inside the code, the year, one counter) and proposes the next; the shared cases in
`prove/casi-codici-progetto.json` are ported to the phone. A report can point to an existing project (the job comes from
it) or create one from the phone's offline queue (`progettoNuovo` with its own `idLocale`, never twice). Every module can
be switched off; `salvaFunzioni` also switches off what depends on it (jobs need clients, projects need jobs) and
switches on what it needs; the owner always reaches the switches, even with Administration off. The server watches the
signed version list on GitHub every 10 minutes (`src/versioni.js`) and announces it in every `/exec` answer and on the
long-polling `/campanello` (home only), so the apps no longer check on their own.

No npm dependencies: only Node 24 built-in modules.

## Run it

```sh
node server/src/avvio.js --dati ./dati [--porta 8400] [--porta-condivisione 8401] [--porta-ingresso 8402]   # real data folder
node server/src/avvio.js --dati ./dati-prova --prova                                                         # sample data, in memory
```

`--porta-condivisione` starts the second listener that answers only `GET /condiviso/<token>` (the client links of
phase 5); without it, or while `CONDIVISIONE_INDIRIZZO` is empty, no link opens anywhere. `WISPER_SPAZIO_FINTO_MB`
fakes the free disk space (tests only).

`--prova` starts with the same sample data as the fake Google (`apps-script/prove/finto-google.js`) plus suppliers,
contacts, sites, work phases and five test users, all with password `prova`: `manuel@esempio.it` (titolare),
`laura@esempio.it` (amministrazione, Laura Bianchi), `marco@esempio.it` (collaboratore, Marco Rossato, with two
reports of his own), `lettura@esempio.it` (read-only), `luca@esempio.it` (esterno, Luca Sartori of the example
contractor Impianti Veneti di Sartori Luca), and the quotes and tasks of the phase 2 prototype with dates counted from today (a
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
studio path), three to classify, the DPR 462 deadlines of Batokyo and an overdue protection check, and for phase 6 the
people (Laura on holiday today, Marco with an expired first-aid course, a medical visit in 13 days, a payslip, a holiday
request to approve; Elena Costa, an intern without login), the studio van "Fiat Doblò GA123BC" with an open fault, the
instruments "Misuratore di terra MT-500" and "Multimetro 87V" (expired calibration, used with confirmation), a meter at
the laboratory, a harness lent and overdue, and the contractor with an assignment on 26ST001 and its invoice. E-mails and backups go to `<data>/posta-finta/`. Phone emulator:
`http://10.0.2.2:8400`; computer: `http://localhost:8400`.

On the NAS (`/volume1/docker/Wisper-NAS`): copy `.env.esempio` to `.env` with the real values, then
`docker compose up -d --build`. The data folder `./dati` must be writable by uid 1000 (the image runs as `node`, not
root). Create the first owner with
`docker compose exec wisper node strumenti/utente.js --titolare "Name Surname" email` (asks for the password).

## Google door

The NAS cannot be reached from the internet and the router is not touched. Phones and Wisper Ufficio away from home send
their requests to the sheet's Apps Script web app (the same `/exec` address as the old Wisper); the script keeps them in
its cache and **the server on the NAS fetches them** (`src/porta.js`, script side `apps-script/Porta.gs`). It is always
the NAS that calls Google. Contract: [`docs/gestionale/porta-google.md`](../docs/gestionale/porta-google.md).

- **Long polling**: the server keeps one `portaPrendi` call open (the script holds it up to 45 s, checking the queue every
  0.3 s, and returns as soon as a request arrives); then it calls again. About 1,900 calls a day when idle, one open
  execution, and a request reaches the NAS within 0.3 s day and night. Answers travel with the next `portaPrendi`, or
  with `portaConsegna` as soon as they are ready if a call is already waiting. Every call carries `SEGRETO_SERVER` in the
  body (Apps Script cannot read headers) and `inCorso`, the requests the server holds, so a request taken by a call
  whose answer never arrived (or before a restart) is handed out again at once.
- **Same handler**: each request goes through the same code as `/exec`, `/carica`, `/file/<id>` and `/ponte`
  (`richiestaInterna` in `src/http.js`, an in-memory request/response): same permissions, same audit log, with
  provenance `{ip: "google", daFuori: true}`. Files travel as base64 (up to about 25 MB); `/file` errors come back as
  `stato` 401/403/404/413 in the JSON.
- **Nothing lost, nothing done twice**: answers that cannot be delivered stay on the NAS and are retried (9 minutes; the
  script forgets a request after 10); Google errors (network, error page, HTTP 429, quotas) are retried after 2, 4, 8...
  seconds up to one minute, forever; the same request handed out again while it is running is awaited, not redone; a
  write repeated with the same request id, with the same token, returns the stored answer for a day (`src/ricordo.js`,
  table `richieste_fatte`, created at start-up like `colonneIndirizzo`; only `ok: true` answers, never `accedi` or
  answers containing tokens or passwords). At home the apps send the same id as `idRichiesta` in `POST /exec`, so a
  write sent at home and retried through Google (or the other way round) happens once.
- **The apps' answers**: when the server is off (no call for 90 s) the script answers at once
  `{"ok":false,"rete":true,"porta":"spento"}` with the time of the last contact; after 25 s without an answer
  `"porta":"attesa"` (the request stays queued for 10 minutes); with 40 queued `"porta":"occupato"`. The apps treat all
  three as a network error.
- **Login attempts**: through Google the caller's address is unknown, so every request counts as the address `google`:
  10 wrong passwords per e-mail stop that e-mail through Google (not at home), 30 wrong passwords in 15 minutes on any
  e-mail stop new logins through Google for 15 minutes (existing tokens keep working, home always works).
- **Old app versions** (0.4.0, sheet code): with the script property `PONTE_PORTA=si` (the day of the switch) their
  requests enter the same queue as `ponte` jobs and the server runs them as the owner, as `/ponte` always did; if the
  server does not answer the script stops with an error page, which the old apps retry.
- **Home rule** (porta-google.md §8): the apps try `http://192.168.1.51:8400` first, checking
  `GET /salute?prova=<random>&chi=<first 16 hex of SHA-256(token)>`: only the real server can answer `firma` =
  HMAC-SHA256(key: SHA-256(token) in hex, message: prova), so a token is never sent in clear to another device that
  happens to have that address on another network. Otherwise Google.
- **Status**: `/salute` (home port only) and `copie` (Administration) return `google`: `{stato: attivo | in avvio | non
  risponde | fermo | spento | non collegato, frase: "Attivo, ultimo contatto alle 10:42", ultimoContatto, oggi:
  {chiamate, lavori, errori, attesaInCodaMs, lavoroMs}, inCorso, daConsegnare, ultimoErrore?}`.
- **Configuration**: it starts with the server when `WISPER_POSTINO_URL` and the secret (`WISPER_POSTINO_SEGRETO` or
  `SEGRETO_SERVER`) are set; `WISPER_PORTA_ATTESA` (seconds the script holds a call, default 45, max 55),
  `WISPER_PORTA_PAUSA` (seconds between empty calls, default 0; `ATTESA=0` + `PAUSA=3` turns it into short polling if
  Google ever objected to long calls), `WISPER_PORTA_GOOGLE=no` turns it off.
- **Google limits** (free account): no documented limit on web app executions, 30 simultaneous executions per user,
  6 minutes per execution, 50 MB per request; the queue lives in CacheService (100 KB per value, 6 hours at most, 1,000
  items), never in Script Properties (50,000 reads/writes a day). Texts up to 2 million characters go to the cache in
  90,000-character pieces; bigger ones go through a temporary Drive file in `Wisper/Porta (temporanei)`, removed as
  soon as delivered (permanently with the free Drive API advanced service enabled, otherwise to the Drive bin).
- **Measured locally** (fake Google + test server, `prove/porta.test.js`): median 0.3-0.5 s per request through the
  door (3 ms at home); with a simulated 0.7 s start-up per Google execution, 1.9 s. Expected on the real Google: 1.5-3 s.

## Internet entrance

The phones and Wisper Ufficio reach the server from anywhere at `https://<public IP>` (no port), with no domain and no
subscription: the router forwards **one** port, external TCP 443 to the NAS `192.168.1.51:8444`, where the
`wisper-ingresso` container (profile `fuori`, image `caddy:2.11.7-alpine`) listens on 443.

- **Certificate**: Let's Encrypt issues certificates for IP addresses only with the `shortlived` ACME profile (about 6
  days, 160 hours; generally available since 15 January 2026), validated with `http-01` or `tls-alpn-01`. Port 80 is not
  forwarded, so the Caddyfile disables `http-01` and Caddy answers `tls-alpn-01` on 443 (`issuer acme { profile
  shortlived; disable_http_challenge }`, Caddy 2.11 with acmez 3.1.7, which builds the IP challenge certificate
  correctly). Caddy renews by itself; certificate and anonymous ACME account (no e-mail) live in the `ingresso-dati`
  volume. `default_sni` is the public IP because clients calling an IP send no SNI. Keep Let's Encrypt's default chain
  (up to ISRG Root X1): `preferred_chains smallest` would end on Root YE, which phones do not trust yet.
- **The public IP is never in the repository** (public): it comes from `WISPER_IP_PUBBLICO` in the NAS `.env`; the
  container refuses to start without it.
- **Only the apps' routes pass** (`ingresso/regole.caddy`): `/exec` (GET, POST), `/carica` (POST), `/file/<id>` (GET),
  `/salute` (GET). Everything else, including `/`, `/ponte`, `/condiviso/...`, other methods, other `Host` names and
  the NAS pages, gets the same `404 Non trovato`. `/ponte` passes only with `WISPER_PONTE_DA_FUORI=si` (the weeks of the
  switch-over; off by default). Body limits: 60 MiB on `/carica` (above `FILE_MAX_MB`, so the server still answers "too
  big" itself), 45 MiB on `/exec` and `/ponte` (Wisper Ufficio sends up to 30 MB of XML, 40 in base64); a bigger body
  gets HTTP 200 `{"ok":false,"errore":"Richiesta troppo grande: ..."}` so phone queues do not retry forever. Timeouts:
  headers 10 s, body and response 10 minutes, idle 2 minutes; headers up to 32 KB; HTTP/1.1 and HTTP/2 only (no UDP).
  Response headers: HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`;
  no `Server`, `Via` or `X-Powered-By`. The access log (`docker compose logs wisper-ingresso`) has no headers (no
  tokens) and no query strings (no file names).
- **The real caller's address**: the server opens a third listener, `--porta-ingresso 8402` (`WISPER_PORTA_INGRESSO`),
  only in `expose` (never in `ports`), so only containers of the project network reach it. On that port, and only there,
  the address is the last entry of `X-Forwarded-For`, which Caddy always rewrites with the connection's address (with no
  `trusted_proxies` it discards what the caller sent; Caddy also drops `X-Real-IP`, `Forwarded`, `CF-Connecting-IP`,
  `True-Client-IP` and `Tailscale-*`). On 8400 the header is never read: the address is the connection's. The server
  repeats the route check on 8402 (`stradaDaFuori` in `src/http.js`) and answers `/salute` there without the version.
  The address goes into `accessi` (`ip`, `da_fuori`; `accessi` returns `ip` and `daFuori`) and `tentativi_accesso`
  (`ip`); the columns are added at start-up if missing (`colonneIndirizzo` in `src/wisper.js`, not a numbered
  migration: 007 is reserved for phase 7). From the internet, besides 10 wrong passwords per e-mail, **20 wrong passwords
  in 15 minutes from the same public address** (any e-mail) stop that address for 15 minutes, checked before scrypt. If
  the entrance ever passed a private address (for example the Docker gateway `172.x`), the per-address limit is skipped
  and the server prints a warning once: per-address limits would otherwise stop everyone together.
- **Try it locally** (no Docker needed): run the server with `--porta-ingresso 8402` (or `avvia({portaIngresso})` on
  127.0.0.1), then `WISPER_IP_PUBBLICO=127.0.0.1 WISPER_INGRESSO_DESTINO=127.0.0.1:8402 caddy run --config
  server/ingresso/Caddyfile.prova --adapter caddyfile`: same rules with `tls internal` on `https://127.0.0.1:8444`
  (`curl -k`; `skip_install_trust` keeps Caddy's root out of the system store).
- **On the NAS**: add `WISPER_IP_PUBBLICO` (and `WISPER_PONTE_DA_FUORI=no`) to `.env`, copy `ingresso/` next to
  `docker-compose.yml`, `docker compose up -d --build wisper` (for port 8402) and `docker compose up -d wisper-ingresso`,
  then forward external TCP 443 to `192.168.1.51:8444` on the router. `docker compose logs wisper-ingresso` shows
  `certificate obtained successfully` with `"issuer":"acme-v02.api.letsencrypt.org-directory"`. Turn it off with
  `docker compose stop wisper-ingresso` and by removing the forward.

## Tools

| Command | What |
|---|---|
| `node server/strumenti/utente.js --titolare "Name" email [--dati <dir>]` | creates a user (also `--ruolo <role>`, `--password email`), password typed, never stored in clear |
| `node server/strumenti/importa.js --foglio <copy.xlsx> [--file <dir>] --dati <dir>` | imports the sheet's Excel export (own xlsx reader), applies the pre-0.3.5 transformations, writes `controllo.html`; exits with an error and no database if any total doesn't match |
| `node server/strumenti/copia-drive.js --da <script url> --dati <dir>` | copies the Drive files cited by the sheet (photos, signatures, job documents) with the script's read-only `file` action |
| `node server/strumenti/ripristina.js <copy> [--dati <dir>]` | restores a backup (`.db` or `.db.gz`) with the server stopped, keeping the current database aside |
| `node server/strumenti/svuota.js --dati <dir> [--si]` | starts again from zero: empties every table of work (clients, jobs, projects, reports, invoices, files...) keeping accounts, paired devices, settings and numbering; without `--si` it only counts. Server stopped, after a copy of the data folder |
| `node server/strumenti/elenco-di-prova.js [--porta 8799]` | a fake version list signed with a test key (accepted only with `--prova` and `WISPER_VERSIONI_CHIAVE`), to try the update doorbell; `/cambia?codice=11&nome=1.1.1&pc=1.1.1` changes it |

## Tests

```sh
node --test server/prove/
```

The tests pass on any day: `WISPER_OGGI_PROVA=YYYY-MM-DD` moves the server's "today" (the time of day stays real), only with `--prova` and inside the tests, never on the real server (`prove/orologio.test.js` checks it); the files that check the fixed-date 2026 story of phases 4 and 5 or the whole owner's Dashboard pin the prototype day, 22/10/2026 (`giornoDeiPrototipi()` in `prove/aiuto.js`); `npm run prove-giorni` (or `node server/prove/giorni.js [YYYY-MM-DD ...]`) runs the whole suite on a Monday, a Thursday, a Saturday, a Sunday, All Saints', Christmas, New Year's Day, Easter Monday, the last day of a month and of the year, 29 February 2028 and the real day.

The Google door (`prove/porta.test.js`) runs the real script (`apps-script/Porta.gs`) in the fake Google, which now runs
every HTTP request in its own worker thread (`apps-script/prove/finto-esecuzione.js`) like Google's parallel
executions, with Google's cache limits: login and work through the door with the same permissions and the `google`
address in the log, a write repeated with the same id done once (also from home with `idRichiesta`), a 3 MB file up
and down through `/carica` and `/file` via Drive, the NAS off (`attesa` within the maximum time, then `spento` at once,
then the queued request done once when it comes back), eight requests at once, a wrong secret, an old version with
the code through the queue, `/salute` and `copie` status, the home signature, login limits through Google, and a
real-time measurement printed as `[misura]`.

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
database written by the 0.7.0 server (`prove/migrazione-005/genera-prima.js`); for phase 6 the shared cases
(`casi-persone.json`, `casi-mezzi.json`, `casi-incarichi.json`, the `costoOrario` cases in `casi-ore-spese.json`),
every role and the person herself field by field on people, leave, attendance, documents, `/file` and exports, the
reserved-access log written and undeletable, `"(riservato)"` in the audit log, the hourly cost for new rows only, leave
requests (approve, reject, undo, cancel before and during, shorten, nobody approves his own except the owner, anomalies,
sickness, overlaps, closures, days without a report, tasks for an absent person), leaving and anonymisation (files gone
from disk, reports intact), vehicles, calibrations, assignments, PPE, contractors (duplicate by VAT number, eligibility,
assignment with confirmation, received invoice from XML linked to its assignment, job cost), the `esterno` role on every
action, the dashboard, and migration 006 on the phase 5 sample database written by the 0.8.0 server
(`prove/migrazione-006/genera-prima.js`); for the internet entrance (`prove/ingresso.test.js`) the address of the
connection on 8400 even with a fake `X-Forwarded-For` or an `ip` in the body, the last `X-Forwarded-For` entry on the
entrance port, the routes that pass and the 404s, `/ponte` only with `WISPER_PONTE_DA_FUORI=si`, 20 wrong passwords from
one public address (and not from a private one, and not counted when faked on 8400), `/carica` and `/file` logged with
the real address, and the columns added to an older database. Nothing in the tests touches Google or the internet.
