/*
 * Il database: SQLite di Node 24 (node:sqlite), un file solo in /data/wisper.db.
 *
 * Perche' SQLite: un ufficio con tre persone e qualche migliaio di rapportini
 * all'anno sta comodo in un file, che si copia con un comando (VACUUM INTO) e
 * si rimette a posto copiandolo indietro. Niente server di database da tenere
 * acceso sul NAS, niente dipendenze da scaricare.
 *
 * Tutto e' sincrono: Node fa una cosa alla volta, quindi due salvataggi dello
 * stesso istante non possono mai prendere lo stesso numero RAP (lo script
 * usava il lucchetto per lo stesso motivo).
 */
'use strict';

// node:sqlite stampa ancora "ExperimentalWarning" a ogni avvio: nei registri del
// NAS sembrerebbe un guaio, e non lo e'. Si tace solo quell'avviso.
const avvisoOriginale = process.emitWarning;
process.emitWarning = function (avviso, ...resto) {
  const testo = avviso && avviso.message ? avviso.message : String(avviso);
  if (/SQLite is an experimental feature/.test(testo)) return;
  return avvisoOriginale.call(process, avviso, ...resto);
};

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { istante } = require('./utili');

/** I valori che SQLite non sa tenere: vero/falso diventano 1/0, undefined vuoto. */
function perSqlite(v) {
  if (v === undefined) return null;
  if (v === true) return 1;
  if (v === false) return 0;
  if (Object.prototype.toString.call(v) === '[object Date]') return istante(v);
  return v;
}

function parametri(p) {
  if (p.length === 1 && p[0] && typeof p[0] === 'object' && !Array.isArray(p[0]) && !Buffer.isBuffer(p[0])) {
    const o = {};
    for (const k of Object.keys(p[0])) o[k] = perSqlite(p[0][k]);
    return [o];
  }
  return p.map(perSqlite);
}

class Database {
  /** @param percorso il file, o ':memory:' per le prove */
  constructor(percorso) {
    this.percorso = percorso;
    this.inMemoria = percorso === ':memory:';
    this.db = new DatabaseSync(percorso);
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA busy_timeout = 5000');
    if (!this.inMemoria) {
      // WAL: chi legge non aspetta chi scrive, e un'interruzione di corrente non rovina il file.
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = NORMAL');
    }
    this.livello = 0;
    this.preparate = new Map();
  }

  prepara(sql) {
    let s = this.preparate.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.preparate.set(sql, s);
    }
    return s;
  }

  esegui(sql, ...p) {
    return this.prepara(sql).run(...parametri(p));
  }

  riga(sql, ...p) {
    return this.prepara(sql).get(...parametri(p)) || null;
  }

  righe(sql, ...p) {
    return this.prepara(sql).all(...parametri(p));
  }

  /**
   * Tutto o niente: se qualcosa va storto a meta' (un rapportino rifiutato dopo
   * aver creato il cliente) non resta niente a meta'. Dentro un'altra
   * transazione diventa un punto di salvataggio.
   */
  transazione(fn) {
    const nome = 'p' + this.livello;
    this.db.exec(this.livello === 0 ? 'BEGIN IMMEDIATE' : 'SAVEPOINT ' + nome);
    this.livello++;
    try {
      const r = fn();
      this.livello--;
      this.db.exec(this.livello === 0 ? 'COMMIT' : 'RELEASE ' + nome);
      return r;
    } catch (err) {
      this.livello--;
      if (this.livello === 0) this.db.exec('ROLLBACK');
      else this.db.exec('ROLLBACK TO ' + nome + '; RELEASE ' + nome);
      throw err;
    }
  }

  /** Una copia coerente del database in un file nuovo, anche mentre si lavora. */
  copiaIn(file) {
    if (fs.existsSync(file)) fs.rmSync(file);
    this.db.prepare('VACUUM INTO ?').run(file);
  }

  versione() {
    return this.riga('PRAGMA user_version').user_version;
  }

  /**
   * Le migrazioni numerate di server/src/migrazioni (001-base.sql, 002-...):
   * quelle non ancora fatte, in ordine, ognuna in una transazione. Prima di
   * ognuna, se il database ha gia' dei dati, una copia wisper.db.prima-<n>:
   * se una migrazione andasse storta, si torna indietro copiando quel file.
   */
  migra(cartella) {
    const file = fs.readdirSync(cartella).filter(f => /^\d{3}-.*\.sql$/.test(f)).sort();
    let fatte = 0;
    for (const f of file) {
      const n = parseInt(f.slice(0, 3), 10);
      if (n <= this.versione()) continue;
      if (!this.inMemoria && this.versione() > 0) this.copiaIn(this.percorso + '.prima-' + n);
      const sql = fs.readFileSync(path.join(cartella, f), 'utf8');
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(sql);
        this.db.exec('PRAGMA user_version = ' + n);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw new Error('Migrazione ' + f + ' non riuscita: ' + err.message);
      }
      fatte++;
    }
    this.preparate.clear();
    return fatte;
  }

  chiudi() {
    this.preparate.clear();
    this.db.close();
  }
}

module.exports = { Database, perSqlite };
