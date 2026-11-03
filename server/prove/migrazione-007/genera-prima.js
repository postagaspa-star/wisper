/*
 * Scrive i dati "di prima" della migrazione 007 col server 0.9.0 (la fase 6):
 *  - fase6.sql: il database dei dati di esempio della fase 6 (senza registro, accessi, sessioni e richieste fatte), con
 *    in piu' tre email mandate da Wisper (un preventivo, un riepilogo di rapportini, un rapportino) che lasciano le loro
 *    copie "inviato" nella categoria Mandati ai clienti: la 007 ne fa le prime righe dello storico delle comunicazioni;
 *  - file.json: i byte dei file (piccoli: firme, scontrini, PDF finti);
 *  - prima.json: quello che il server 0.9.0 rispondeva su quel database, campo per campo: i rapportini, ogni preventivo,
 *    ogni ticket, ogni fattura, ogni documento, le attivita', le anagrafiche, i numeri della Dashboard del titolare.
 * L'orologio e' fermo alle 10:00 del 22/10/2026 (anche in migrazione-007.test.js), cosi' i conti che dipendono da oggi si
 * confrontano in qualunque giorno si facciano le prove.
 * migrazione-007.test.js apre fase6.sql col server di adesso (che fa la 007) e controlla che tutto sia identico.
 * Non si cambiano a mano.
 *
 * Si rifa' solo col codice del server 0.9.0 (commit della fase 6, 0eb2501), per esempio:
 *   git archive 0eb2501 server | tar -x -C <cartella>
 *   node server/prove/migrazione-007/genera-prima.js <cartella>/server
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
  console.error('Si usa: node genera-prima.js <cartella del server 0.9.0>');
  process.exit(2);
}
const versione = JSON.parse(fs.readFileSync(path.join(vecchio, 'package.json'), 'utf8')).version;
if (versione !== '0.9.0') {
  console.error('Serve il server 0.9.0 (questo e\' ' + versione + ')');
  process.exit(2);
}
const { Wisper } = require(path.resolve(vecchio, 'src', 'wisper'));
const { semina } = require(path.resolve(vecchio, 'src', 'prova'));
const { Postino } = require(path.resolve(vecchio, 'src', 'postino'));

/** Un PDF finto ma col suo inizio vero (%PDF-): passa il controllo dei primi byte. */
const pdf = nome => Buffer.from('%PDF-1.4\n% Documento di esempio: ' + nome + '\n%%EOF\n', 'utf8').toString('base64');

(async () => {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-prima-007-'));
  const w = new Wisper({ dati: cartella, postino: new Postino({ cartella: path.join(cartella, 'posta') }) });
  if (w.db.versione() !== 6) throw new Error('il server 0.9.0 doveva lasciare il database alla versione 6');
  semina(w);
  const titolare = w.titolare();
  const come = fn => w.come({ utente: titolare, permessi: w.permessiDi('titolare'), app: 'prova', dispNome: 'genera-prima' }, fn);

  // ---------------------------------------------------------------- tre email mandate da Wisper (le copie "inviato")
  await come(async () => {
    const p7 = w.leggiPreventivi({}).find(p => /\/007$/.test(p.numero));
    const r1 = await w.inviaPreventivo({ id: p7.id, a: 'rossi@example.com', oggetto: 'Preventivo PR/2026/007', messaggio: 'In allegato il preventivo.',
      allegati: [{ nome: 'PR-2026-007 Rossi Impianti Srl.pdf', mime: 'application/pdf', base64: pdf('PR/2026/007') }] });
    if (!r1.ok) throw new Error('inviaPreventivo: ' + r1.errore);
    const settembre = w.db.righe("SELECT id FROM rapportini WHERE id_locale LIKE 'seme-f4-elettro-%' ORDER BY id").map(r => r.id);
    await w.inviaEmail({ a: 'rapportini@elettrodinamica.example', ids: settembre, oggetto: 'Riepilogo di settembre 2026',
      allegati: [{ nome: 'Riepilogo settembre 2026 Elettrodinamica.pdf', mime: 'application/pdf', base64: pdf('Riepilogo settembre') }] });
    const collaudo = w.db.riga("SELECT id FROM rapportini WHERE id_locale = 'seme-f4-rossi-1'").id;
    await w.inviaEmail({ a: 'rossi@example.com', ids: [collaudo], oggetto: 'Rapportino del 21/10/2026',
      allegati: [{ nome: collaudo.replace(/\//g, '-') + ' Rossi Impianti Srl.pdf', mime: 'application/pdf', base64: pdf(collaudo) }] });
  });

  // ---------------------------------------------------------------- prima.json: cosa rispondeva il server 0.9.0
  const prima = come(() => ({
    rapportini: w.leggiRapportini('', '', true).sort((a, b) => (a.id < b.id ? -1 : 1)),
    preventivi: w.db.righe('SELECT id FROM preventivi ORDER BY id').map(p => w.preventivoCompleto(p.id)),
    ticket: w.db.righe('SELECT id FROM ticket ORDER BY id').map(t => w.ticketCompleto(w.rigaTicket(t.id))),
    fatture: w.db.righe('SELECT id FROM fatture ORDER BY id').map(f => w.fatturaCompleta(w.rigaFattura(f.id))),
    documenti: w.db.righe('SELECT id FROM documenti ORDER BY id').map(d => w.documentoCompleto(w.rigaDocumento(d.id))),
    attivita: w.leggiAttivita({}),
    anagrafiche: w.rispostaAnagrafiche({}),
    dashboard: w.dashboard({}).numeri,
    inviati: w.db.righe("SELECT d.id, d.cliente_id, d.commessa_id, d.ticket_id, v.nota FROM documenti d JOIN documento_versioni v ON v.documento_id = d.id WHERE d.origine = 'inviato' ORDER BY d.id")
      .map(r => Object.assign({}, r)),
  }));
  prima.nota = 'Fatto da genera-prima.js col server 0.9.0 sul database di fase6.sql, con l\'orologio fermo al ' + new DataVera(ORA).toISOString() + '. Non si cambia a mano.';
  prima.versione = versione;
  prima.ora = ORA;

  // ---------------------------------------------------------------- fase6.sql e file.json
  const SALTATE = ['registro', 'accessi', 'sessioni', 'tentativi_accesso', 'richieste_fatte', 'sqlite_sequence'];
  const valore = v => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'NULL')
    : typeof v === 'bigint' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
  const righe = ['-- Il database dei dati di esempio della fase 6 (server 0.9.0, schema 6), scritto da genera-prima.js. Non si cambia a mano.'];
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
  fs.writeFileSync(path.join(__dirname, 'fase6.sql'), righe.join('\n') + '\n');
  const file = {};
  for (const f of w.db.righe('SELECT id, percorso FROM file WHERE percorso IS NOT NULL ORDER BY id')) {
    const p = path.join(cartella, 'file', f.percorso);
    if (fs.existsSync(p)) file[f.id] = fs.readFileSync(p).toString('base64');
  }
  fs.writeFileSync(path.join(__dirname, 'file.json'), JSON.stringify(file, null, 1) + '\n');
  fs.writeFileSync(path.join(__dirname, 'prima.json'), JSON.stringify(prima, null, 1) + '\n');
  w.chiudi();
  console.log('fase6.sql: ' + tabelle.length + ' tabelle; file.json: ' + Object.keys(file).length + ' file; prima.json: ' + prima.rapportini.length + ' rapportini, ' +
    prima.preventivi.length + ' preventivi, ' + prima.ticket.length + ' ticket, ' + prima.fatture.length + ' fatture, ' + prima.documenti.length + ' documenti, ' +
    prima.inviati.length + ' copie inviate');
})().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
