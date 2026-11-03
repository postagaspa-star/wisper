/*
 * Un database "di prima della fase 3" (versione 2: solo le migrazioni 001 e
 * 002), scritto riga per riga come lo lasciavano il server 0.5.0 e
 * l'importazione dal foglio, con i casi limite delle spese dei rapportini:
 * spese vuote (NULL e testo vuoto), zero, decimali (anche tre, da un foglio
 * vecchio), un numero scritto come testo con la virgola, un importo negativo,
 * rapportini in bozza, firmati, inviati, fatturati e annullati, con e senza
 * foto (anche nel cestino), con e senza persona (importati).
 *
 * Serve a due cose:
 *  - genera-prima.js lo apre col server 0.5.0 e scrive prima.json (i numeri
 *    di prima: rapportini, CSV, dashboard);
 *  - migrazione-spese.test.js lo apre col server di adesso (che fa la 003) e
 *    controlla che i numeri siano gli stessi, al centesimo.
 * Solo dati inventati.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIGRAZIONI = path.join(__dirname, '..', '..', 'src', 'migrazioni');
const T = '2026-09-30T18:00:00+02:00';

/** I rapportini: [id, data, stato, cliente, commessa, ore lavoro, extra, viaggio, km, spese, note spese, tariffa, euro km, compenso, rimborso, totale, utente, extra colonne] */
const RAPPORTINI = [
  ['RAP/2026/0001', '2026-09-02', 'FATTURATO', 'C001', '26ST001', 6, 0, 1.5, 96, 99.99, 'Pranzo e pedaggi', 30, 0.9, 180, 86.4, 366.39, 1, { fatturato_il: '2026-09-30T10:00:00+02:00', inviato_il: '2026-09-05T10:00:00+02:00', firma: 'F1', firmatario: 'Giulia Bianchi', firmato_il: '2026-09-02T17:00:00+02:00' }],
  ['RAP/2026/0002', '2026-09-03', 'FATTURATO', 'C002', '26ST002', 4, 0, 0, 22, 23.456, 'Materiale da un foglio vecchio', 42, 0.9, 168, 19.8, 211.26, null, { fatturato_il: '2026-09-30T10:00:00+02:00', firma: 'F2', firmatario: 'Paolo Rossi', firmato_il: '2026-09-03T17:00:00+02:00' }],
  ['RAP/2026/0003', '2026-09-10', 'INVIATO', 'C001', '26ST001', 8, 1, 1.5, 96, null, '', 30, 0.9, 285, 86.4, 371.4, 1, { inviato_il: '2026-09-12T10:00:00+02:00', firma: 'F3', firmatario: 'Giulia Bianchi', firmato_il: '2026-09-10T17:00:00+02:00' }],
  ['RAP/2026/0004', '2026-09-15', 'FIRMATO', 'C002', '26ST002', 3.5, 0, 0, 22, 0, '', 42, 0.9, 147, 19.8, 166.8, 1, { firma: 'F4', firmatario: 'Paolo Rossi', firmato_il: '2026-09-15T17:00:00+02:00' }],
  ['RAP/2026/0005', '2026-09-16', 'FIRMATO', 'C001', '26ST001', 7.5, 0, 1.5, 96, 14.5, 'Pranzo', 30, 0.9, 225, 86.4, 325.9, 2, { firma: 'F5', firmatario: 'Giulia Bianchi', firmato_il: '2026-09-16T17:00:00+02:00' }],
  ['RAP/2026/0006', '2026-09-22', 'ANNULLATO', 'C002', '26ST002', 2, 0, 0, 22, 7.3, 'Parcheggio', 42, 0.9, 84, 19.8, 111.1, 1, { stato_prima: 'FIRMATO', firma: 'F6', firmatario: 'Paolo Rossi', firmato_il: '2026-09-22T17:00:00+02:00' }],
  ['RAP/2026/0007', '2026-09-23', 'BOZZA', 'C002', '26ST002', 5, 0, 0.5, 22, '12,5', 'Scritto col computer vecchio', 42, 0.9, 210, 19.8, 242.3, null, {}],
  ['RAP/2026/0008', '2026-09-24', 'BOZZA', 'C002', '', 1, 0, 0, 0, '', '', 40, 0.9, 40, 0, 40, null, {}],
  ['RAP/2026/0009', '2026-09-25', 'BOZZA', 'C001', '26ST001', 4, 0, 1, 96, 0.1, 'Una caramella', 30, 0.9, 120, 86.4, 206.5, 1, {}],
  ['RAP/2026/0010', '2026-09-28', 'BOZZA', 'C002', '26ST002', 2, 0, 0, 22, -5, 'Reso di materiale', 42, 0.9, 84, 19.8, 98.8, 1, {}],
  ['RAP/2026/0011', '2026-09-29', 'INVIATO', 'C001', '26ST001', 8, 2, 1.5, 96, 61.2, 'Albergo e cena', 30, 0.9, 300, 86.4, 447.6, 2, { inviato_il: '2026-09-30T09:00:00+02:00', firma: 'F11', firmatario: 'Giulia Bianchi', firmato_il: '2026-09-29T17:00:00+02:00' }],
  ['', '', '', '', '', 0, 0, 0, 0, 0, '', 0, 0, 0, 0, 0, null, {}],
].filter(r => r[0]);

/** Le foto: [id, rapportino, cestinata?] */
const FOTO = [
  ['foto-0001-a', 'RAP/2026/0001', false], ['foto-0001-b', 'RAP/2026/0001', false],
  ['foto-0002-a', 'RAP/2026/0002', false],
  ['foto-0004-a', 'RAP/2026/0004', false],
  ['foto-0005-a', 'RAP/2026/0005', false],
  ['foto-0006-a', 'RAP/2026/0006', false],
  ['foto-0009-a', 'RAP/2026/0009', true], ['foto-0009-b', 'RAP/2026/0009', false],
];

/** Scrive in <cartella>/wisper.db il database alla versione 2, con i dati qui sopra. Torna il percorso. */
function creaDatabaseVersione2(cartella) {
  const { Database } = require('../../src/db');
  const solo2 = path.join(cartella, 'migrazioni-fino-alla-002');
  fs.mkdirSync(solo2, { recursive: true });
  for (const f of fs.readdirSync(MIGRAZIONI)) if (/^00[12]-.*\.sql$/.test(f)) fs.copyFileSync(path.join(MIGRAZIONI, f), path.join(solo2, f));
  const file = path.join(cartella, 'wisper.db');
  const db = new Database(file);
  db.migra(solo2);
  if (db.versione() !== 2) throw new Error('il database di prova doveva essere alla versione 2');
  db.transazione(() => {
    db.esegui("INSERT INTO utenti (id, nome, email, ruolo, password_hash, attivo, creato) VALUES (1, 'Manuel Gasparotto', 'manuel@esempio.it', 'titolare', '', 1, ?)", T);
    db.esegui("INSERT INTO utenti (id, nome, email, ruolo, password_hash, attivo, creato) VALUES (2, 'Marco Collaboratore', 'marco@esempio.it', 'collaboratore', '', 1, ?)", T);
    db.esegui("INSERT INTO impostazioni (chiave, valore, descrizione) VALUES ('EURO_KM', '0.9', ''), ('AUTO', '\"Auto di prova\"', ''), ('COSTO_ORARIO', '18', '')");
    db.esegui("INSERT INTO soggetti (id, nome, tariffa_fissa, paga_viaggio, km_rimborsati, magg_extra, creato, modificato) VALUES ('C001', 'Elettrodinamica', 30, 0, 1, 0, ?, ?)", T, T);
    db.esegui("INSERT INTO soggetti (id, nome, ultima_tariffa, creato, modificato) VALUES ('C002', 'Rossi Impianti Srl', 42, ?, ?)", T, T);
    db.esegui("INSERT INTO commesse (id, cliente_id, descrizione, stato, budget_ore, prezzo_orario, creato, modificato) VALUES ('26ST001', 'C001', 'Nuovo magazzino automatico Batokyo', 'APERTA', 40, NULL, ?, ?)", T, T);
    db.esegui("INSERT INTO commesse (id, cliente_id, descrizione, stato, prezzo_orario, costo_orario, euro_km, creato, modificato) VALUES ('26ST002', 'C002', 'Quadro elettrico capannone', 'APERTA', 42, 25, 0.9, ?, ?)", T, T);
    let n = 0;
    for (const x of RAPPORTINI) {
      const [id, data, stato, cliente, commessa, lavoro, extra, viaggio, km, spese, note, tariffa, euroKm, compenso, rimborso, totale, utente, altro] = x;
      const v = Object.assign({
        id, id_locale: 'locale-' + (++n), data, tecnico: utente === 2 ? 'Marco Collaboratore' : 'Manuel Gasparotto', id_cliente: cliente,
        cliente: cliente === 'C001' ? 'Elettrodinamica' : 'Rossi Impianti Srl', id_commessa: commessa, commessa, descrizione: 'Lavoro ' + id,
        ore_lavoro: lavoro, ore_extra: extra, ore_viaggio: viaggio, ore_totali: lavoro + extra + viaggio, km, spese, note_spese: note,
        tariffa, paga_viaggio: 0, km_rimborsati: 1, euro_km: euroKm, magg_extra: 0, compenso_ore: compenso, rimborso_km: rimborso, totale,
        costo_orario: cliente === 'C002' ? 25 : null, stato, creato: data + 'T18:00:00+02:00', modificato: data + 'T18:30:00+02:00', utente_id: utente,
      }, altro);
      const colonne = Object.keys(v);
      db.esegui('INSERT INTO rapportini (' + colonne.join(', ') + ') VALUES (' + colonne.map(c => '@' + c).join(', ') + ')', v);
      if (v.firma) {
        db.esegui("INSERT INTO file (id, nome, mime, tipo, rapportino_id, creato) VALUES (?, ?, 'image/png', 'firma', ?, ?)", v.firma, 'firma ' + id, id, T);
      }
    }
    let i = 0;
    for (const [id, rap, cestinata] of FOTO) {
      db.esegui("INSERT INTO file (id, nome, mime, tipo, rapportino_id, creato, cestinato) VALUES (?, ?, 'image/jpeg', 'spesa', ?, ?, ?)",
        id, rap + ' spesa ' + id, rap, '2026-09-30T18:00:0' + (i++) + '+02:00', cestinata ? T : null);
    }
  });
  db.chiudi();
  return file;
}

/** I conti di un server (vecchio o nuovo) su quel database: quello che deve restare identico. */
function numeri(w) {
  const titolare = { utente: { id: 1, nome: 'Manuel Gasparotto', email: 'manuel@esempio.it', ruolo: 'titolare' }, permessi: w.permessiDi('titolare') };
  return w.come(titolare, () => {
    const rapportini = JSON.parse(JSON.stringify(w.leggiRapportini('', '', true)));
    const csv = Buffer.from(w.esporta({ cosa: 'rapportini', tutti: true }).base64, 'base64').toString('utf8');
    const d = w.dashboard({});
    return {
      rapportini,
      csv,
      soldi: { daFatturare: d.numeri.soldi.daFatturare, inBozza: d.numeri.soldi.inBozza },
      contiRapportini: { daFirmare: d.numeri.rapportini.daFirmare, daMandare: d.numeri.rapportini.daMandare, daFatturare: d.numeri.rapportini.daFatturare },
    };
  });
}

module.exports = { creaDatabaseVersione2, numeri, RAPPORTINI, FOTO };
