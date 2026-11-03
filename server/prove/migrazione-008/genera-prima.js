/*
 * Scrive i dati "di prima" della migrazione 008 col server 0.10.0 (la fase 7):
 *  - fase7.sql: il database dei dati di esempio della fase 7 (senza registro, accessi, sessioni e richieste fatte);
 *  - file.json: i byte dei file (piccoli: firme, scontrini, PDF finti);
 *  - prima.json: quello che il server 0.10.0 rispondeva su quel database, campo per campo: i rapportini, ogni preventivo,
 *    ogni ticket, ogni fattura col suo pacchetto per il programma (prospetto e XML), ogni documento, le attivita', le
 *    anagrafiche, le comunicazioni, la Dashboard del titolare (numeri e voci).
 * L'orologio e' fermo alle 10:00 del 22/10/2026 (anche in migrazione-008.test.js).
 * migrazione-008.test.js apre fase7.sql col server di adesso (che fa la 008) e controlla che tutto sia identico.
 * Non si cambiano a mano.
 *
 * Si rifa' solo col codice del server 0.10.0 (commit della fase 7, 6d80667), per esempio:
 *   git archive 6d80667 server | tar -x -C <cartella>
 *   node server/prove/migrazione-008/genera-prima.js <cartella>/server
 * (git archive legge soltanto: non cambia rami ne' indice.) Solo dati inventati.
 */
'use strict';

process.env.TZ = 'Europe/Rome';

// L'orologio fermo (prima di caricare il server).
const ORA = Date.parse('2026-10-22T10:00:00+02:00');
const DataVera = Date;
class DataFerma extends DataVera {
  constructor(...a) { if (a.length) super(...a); else super(ORA); }
  static now() { return ORA; }
}
global.Date = DataFerma;

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const vecchio = process.argv[2];
if (!vecchio || !fs.existsSync(path.join(vecchio, 'src', 'wisper.js'))) {
  console.error('Si usa: node genera-prima.js <cartella del server 0.10.0>');
  process.exit(2);
}
const versione = JSON.parse(fs.readFileSync(path.join(vecchio, 'package.json'), 'utf8')).version;
if (versione !== '0.10.0') {
  console.error('Serve il server 0.10.0 (questo e\' ' + versione + ')');
  process.exit(2);
}
const { Wisper } = require(path.resolve(vecchio, 'src', 'wisper'));
const { semina } = require(path.resolve(vecchio, 'src', 'prova'));
const { Postino } = require(path.resolve(vecchio, 'src', 'postino'));

(async () => {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-prima-008-'));
  const w = new Wisper({ dati: cartella, postino: new Postino({ cartella: path.join(cartella, 'posta') }) });
  if (w.db.versione() !== 7) throw new Error('il server 0.10.0 doveva lasciare il database alla versione 7');
  semina(w);
  const titolare = w.titolare();
  const come = fn => w.come({ utente: titolare, permessi: w.permessiDi('titolare'), app: 'prova', dispNome: 'genera-prima' }, fn);

  // ---------------------------------------------------------------- prima.json: cosa rispondeva il server 0.10.0
  const prima = come(() => {
    const d = w.dashboard({});
    return {
      rapportini: w.leggiRapportini('', '', true).sort((a, b) => (a.id < b.id ? -1 : 1)),
      preventivi: w.db.righe('SELECT id FROM preventivi ORDER BY id').map(p => w.preventivoCompleto(p.id)),
      ticket: w.db.righe('SELECT id FROM ticket ORDER BY id').map(t => w.ticketCompleto(w.rigaTicket(t.id))),
      fatture: w.db.righe('SELECT id FROM fatture ORDER BY id').map(f => w.fatturaCompleta(w.rigaFattura(f.id))),
      pacchetti: w.db.righe("SELECT id FROM fatture WHERE tipo = 'fattura' ORDER BY id").map(f => { try { return { id: f.id, pacchetto: w.pacchetto({ id: f.id }) }; } catch (e) { return { id: f.id, errore: e.message }; } }),
      documenti: w.db.righe('SELECT id FROM documenti ORDER BY id').map(x => w.documentoCompleto(w.rigaDocumento(x.id))),
      attivita: w.leggiAttivita({}),
      anagrafiche: w.rispostaAnagrafiche({}),
      comunicazioni: w.leggiComunicazioni({}),
      dashboard: { numeri: d.numeri, urgenti: d.urgenti, settimana: d.settimana, pianificare: d.pianificare },
      documentiPersona: w.db.righe("SELECT DISTINCT v.file_id FROM documento_versioni v JOIN documenti x ON x.id = v.documento_id WHERE x.persona_id IS NOT NULL OR x.vede = 'riservati'").map(r => r.file_id),
    };
  });
  prima.nota = 'Fatto da genera-prima.js col server 0.10.0 sui dati di esempio della fase 7, con l\'orologio fermo al ' + new DataVera(ORA).toISOString() + '. Non si cambia a mano.';
  prima.versione = versione;
  prima.ora = ORA;

  // ---------------------------------------------------------------- fase7.sql e file.json
  const SALTATE = ['registro', 'accessi', 'sessioni', 'tentativi_accesso', 'richieste_fatte', 'sqlite_sequence', 'portale_accessi'];
  const valore = v => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'NULL')
    : typeof v === 'bigint' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
  const righe = ['-- Il database dei dati di esempio della fase 7 (server 0.10.0, schema 7), scritto da genera-prima.js. Non si cambia a mano.'];
  const tabelle = w.db.righe("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(t => t.name).filter(t => SALTATE.indexOf(t) < 0);
  for (const t of tabelle) {
    const colonne = w.db.righe('PRAGMA table_info(' + t + ')').map(c => c.name);
    righe.push('DELETE FROM ' + t + ';');
    for (const r of w.db.righe('SELECT * FROM ' + t + ' ORDER BY rowid')) {
      righe.push('INSERT INTO ' + t + ' (' + colonne.join(', ') + ') VALUES (' + colonne.map(c => valore(r[c])).join(', ') + ');');
    }
  }
  righe.push('DELETE FROM sqlite_sequence;');
  for (const s of w.db.righe('SELECT name, seq FROM sqlite_sequence ORDER BY name')) righe.push('INSERT INTO sqlite_sequence (name, seq) VALUES (' + valore(s.name) + ', ' + s.seq + ');');
  fs.writeFileSync(path.join(__dirname, 'fase7.sql'), righe.join('\n') + '\n');
  const file = {};
  for (const f of w.db.righe('SELECT id, percorso FROM file WHERE percorso IS NOT NULL ORDER BY id')) {
    const p = path.join(cartella, 'file', f.percorso);
    if (fs.existsSync(p)) file[f.id] = fs.readFileSync(p).toString('base64');
  }
  fs.writeFileSync(path.join(__dirname, 'file.json'), JSON.stringify(file, null, 1) + '\n');
  fs.writeFileSync(path.join(__dirname, 'prima.json'), JSON.stringify(prima, null, 1) + '\n');
  w.chiudi();
  console.log('fase7.sql: ' + tabelle.length + ' tabelle; file.json: ' + Object.keys(file).length + ' file; prima.json: ' + prima.rapportini.length + ' rapportini, ' +
    prima.preventivi.length + ' preventivi, ' + prima.ticket.length + ' ticket, ' + prima.fatture.length + ' fatture, ' + prima.documenti.length + ' documenti, voci della Dashboard ' +
    (prima.dashboard.urgenti.length + prima.dashboard.settimana.length + prima.dashboard.pianificare.length));
})().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
