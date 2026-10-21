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
appointment and a site visit). E-mails and backups go to `<data>/posta-finta/`. Phone emulator:
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
skip), overlaps and every role on the new actions. Nothing in the tests touches Google or the internet.
