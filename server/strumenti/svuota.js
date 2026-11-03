/*
 * Ripartire da zero (03/11/2026, chiesto da Manuel: "eliminare tutti i dati, partire da zero"): via clienti, commesse,
 * progetti, rapportini, fatture, file e tutto il resto del lavoro. Restano gli account (e i telefoni e i computer gia'
 * collegati, che non devono rientrare), le impostazioni (dati dello studio, collegamenti a Google), le numerazioni (il
 * prossimo codice continua da quello piu' alto gia' dato: niente due commesse con lo stesso codice nei documenti di
 * prima) e la storia delle copie.
 *
 *   node server/strumenti/svuota.js --dati <cartella> --si
 *
 * Senza --si dice soltanto cosa toglierebbe. Va lanciato col server SPENTO e dopo una copia della cartella dei dati:
 * sul NAS lo fa lo script della pulizia (cartella fuori dal repository), che mette da parte i dati prima di partire.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('../src/db');

/** Le tabelle che restano: chi entra, come e' configurato Wisper, la storia delle copie. Tutto il resto si svuota. */
const RESTANO = new Set([
  'utenti', 'sessioni', 'permessi', 'tentativi_accesso', 'accessi', 'dispositivi',
  'impostazioni', 'numerazioni', 'integrazioni', 'integrazioni_controlli', 'calendario_feed',
  'modelli_messaggi', 'modelli_testi', 'documento_categorie', 'qualifica_tipi',
  'copie', 'copie_prove', 'controlli_finali', 'dashboard_nascoste', 'portale_pulizia',
]);

/** Le cartelle dei dati che si svuotano con le tabelle: i byte dei file e le esportazioni pronte. */
const CARTELLE = ['file', 'esportazioni'];

function tabelleDaSvuotare(db) {
  const tutte = db.righe("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name");
  // Le tabelle virtuali (la ricerca dentro i file) si svuotano da sole: le loro tabelle interne non si toccano.
  const virtuali = tutte.filter(t => /^CREATE VIRTUAL TABLE/i.test(t.sql || '')).map(t => t.name);
  return tutte.map(t => t.name).filter(n => n !== 'sqlite_sequence' && !RESTANO.has(n) &&
    !virtuali.some(v => n !== v && n.indexOf(v + '_') === 0));
}

function svuota(dati, opzioni) {
  const o = opzioni || {};
  const percorso = path.join(dati, 'wisper.db');
  if (!fs.existsSync(percorso)) throw new Error('Database non trovato: ' + percorso);
  const db = new Database(percorso);
  try {
    const tabelle = tabelleDaSvuotare(db);
    const conteggi = tabelle.map(t => ({ tabella: t, righe: db.riga('SELECT COUNT(*) n FROM "' + t + '"').n }))
      .filter(c => c.righe > 0);
    const file = CARTELLE.map(c => {
      const p = path.join(dati, c);
      return { cartella: c, voci: fs.existsSync(p) ? fs.readdirSync(p).length : 0 };
    });
    if (!o.si) return { fatto: false, conteggi, file };

    // I vincoli si spengono fuori dalla transazione (SQLite non li cambia dentro); alla fine il controllo li rifa' tutti.
    db.esegui('PRAGMA foreign_keys = OFF');
    db.transazione(() => {
      // Il registro e la cronologia dei ticket hanno un trigger che vieta di cancellarli (e altri trigger scrivono
      // altrove a ogni riga tolta): si tolgono per la pulizia e si rimettono identici subito dopo, nella stessa transazione.
      const segno = '?,'.repeat(tabelle.length).slice(0, -1);
      const trigger = db.righe("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN (" + segno + ')', ...tabelle);
      for (const g of trigger) db.esegui('DROP TRIGGER "' + g.name + '"');
      for (const t of tabelle) db.esegui('DELETE FROM "' + t + '"');
      for (const g of trigger) db.esegui(g.sql);
      if (db.riga("SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'")) {
        for (const t of tabelle) db.esegui('DELETE FROM sqlite_sequence WHERE name = ?', t);
      }
      // Un account di un collaboratore esterno puntava alla sua anagrafica, che non c'e' piu'.
      db.esegui('UPDATE utenti SET soggetto_id = NULL WHERE soggetto_id IS NOT NULL');
    });
    db.esegui('PRAGMA foreign_keys = ON');
    const rotti = db.righe('PRAGMA foreign_key_check');
    if (rotti.length) throw new Error('Dopo la pulizia restano riferimenti rotti: ' + JSON.stringify(rotti.slice(0, 5)));
    db.esegui('VACUUM');
    for (const c of CARTELLE) {
      const p = path.join(dati, c);
      if (!fs.existsSync(p)) continue;
      for (const voce of fs.readdirSync(p)) fs.rmSync(path.join(p, voce), { recursive: true, force: true });
    }
    const restano = {};
    for (const t of ['utenti', 'dispositivi', 'sessioni', 'impostazioni']) restano[t] = db.riga('SELECT COUNT(*) n FROM "' + t + '"').n;
    return { fatto: true, conteggi, file, restano };
  } finally {
    db.chiudi();
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let dati = process.env.WISPER_DATI || '/data';
  let si = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dati') dati = argv[++i];
    else if (argv[i] === '--si') si = true;
    else { console.error('Si usa: node server/strumenti/svuota.js --dati <cartella> [--si]'); process.exit(1); }
  }
  try {
    const r = svuota(dati, { si });
    const righe = r.conteggi.reduce((t, c) => t + c.righe, 0);
    console.log((r.fatto ? 'Tolte ' : 'Da togliere: ') + righe + ' righe in ' + r.conteggi.length + ' tabelle' +
      (r.conteggi.length ? ' (' + r.conteggi.map(c => c.tabella + ' ' + c.righe).join(', ') + ')' : ''));
    console.log((r.fatto ? 'Svuotate ' : 'Da svuotare: ') + r.file.map(f => f.cartella + '/ ' + f.voci + ' voci').join(', '));
    if (r.fatto) console.log('Restano: ' + Object.keys(r.restano).map(k => k + ' ' + r.restano[k]).join(', '));
    else console.log('Niente toccato: per farlo davvero aggiungi --si (col server spento e dopo una copia dei dati).');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { svuota, RESTANO };
