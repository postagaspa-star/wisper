/*
 * Cercare dentro i file (fase 8, fase8.md §6): niente esce dal NAS, serve solo quello che c'e' gia' nel Node del
 * server (SQLite con FTS5). La fase 5 cercava su titolo, descrizione, cliente, commessa, impianto e nome del file;
 * qui anche il testo dei file dei documenti (tutte le revisioni non tolte) e dei documenti nati dal portale.
 *
 *  - NON si leggono le foto dei rapportini e dei ticket, i documenti delle persone e quelli riservati (per sicurezza:
 *    un errore nei filtri non puo' mostrarne un pezzo), i collegamenti a OneDrive e Drive;
 *  - si legge subito dopo il caricamento, in un worker_threads (un file alla volta, 20 secondi al massimo), e di notte
 *    dopo la copia per al massimo 20 minuti quelli "da leggere" (dopo la migrazione lo sono tutti quelli di prima);
 *  - la ricerca: prima i permessi, poi l'estratto. FTS da' gli id dei file, da li' i documenti, si tengono solo quelli
 *    che la persona vede (vedeDocumento della fase 5) e solo per quelli si calcola l'estratto con snippet().
 *
 * Senza FTS5 (o con w.senzaFts5, solo per le prove) la ricerca resta sui titoli e Integrazioni lo dice (Errore).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { Rifiuto, testo, adesso, dataOraIso, numero } = require('../utili');

const SECONDI_A_FILE = 20;
const MINUTI_DI_NOTTE = 20;

const si = v => v === true || v === 1 || v === '1' || v === 'true';

/** Le parole della persona come termini FTS fra virgolette con l'asterisco: niente sintassi di FTS da chi scrive. */
function terminiFts(s) {
  const parole = String(s || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 12);
  return parole.length ? parole.map(p => '"' + p.replace(/"/g, '') + '"*').join(' ') : '';
}

/** Legge un file nel worker; dopo 20 secondi lo ferma ("non si legge"). */
function leggiNelWorker(percorso, nome, mime, secondi) {
  return new Promise(risolvi => {
    let finito = false;
    const fine = r => { if (!finito) { finito = true; clearTimeout(t); w.terminate().catch(() => null); risolvi(r); } };
    const w = new Worker(path.join(__dirname, '..', 'lettura.js'), { workerData: { lettura: true, percorso, nome, mime } });
    const t = setTimeout(() => fine({ stato: 'non_si_legge', testo: '', pagine: null, motivo: 'ci mette troppo a leggerlo (più di ' + secondi + ' secondi)' }), secondi * 1000);
    w.on('message', fine);
    w.on('error', err => fine({ stato: 'non_si_legge', testo: '', pagine: null, motivo: 'il file non si apre (' + (err && err.message ? err.message : err) + ')' }));
    w.on('exit', () => fine({ stato: 'non_si_legge', testo: '', pagine: null, motivo: 'la lettura si è fermata' }));
  });
}

module.exports = {
  /** FTS5 c'e' (la tabella file_testo l'ha creata la migrazione) e non e' spento per le prove. */
  fts5Attivo() {
    if (this.senzaFts5) return false;
    if (this.haFileTesto === undefined) this.haFileTesto = !!this.db.riga("SELECT name FROM sqlite_master WHERE name = 'file_testo'");
    return this.haFileTesto;
  },

  ricercaFileAccesa() {
    const v = this.leggiImpostazioni().RICERCA_FILE;
    return v === true || v === 'true';
  },

  /** "1.240 file letti · 37 senza testo · 2 da leggere" (Integrazioni › Cerca dentro i file). */
  fraseLetture() {
    const n = {};
    this.db.righe('SELECT stato, COUNT(*) n FROM file_lettura GROUP BY stato').forEach(r => { n[r.stato] = r.n; });
    const it = x => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const letti = (n.letto || 0) + (n.in_parte || 0);
    const pezzi = [it(letti) + ' file letti'];
    if (n.senza_testo) pezzi.push(it(n.senza_testo) + ' senza testo');
    if (n.non_si_legge) pezzi.push(it(n.non_si_legge) + ' non si leggono');
    if (n.troppo_grande) pezzi.push(it(n.troppo_grande) + ' troppo grandi');
    pezzi.push(it(n.da_leggere || 0) + ' da leggere');
    return pezzi.join(' · ');
  },

  // ------------------------------------------------------------------ chi si legge

  /** Un file si legge se e' di almeno una revisione non tolta di un documento non personale e non riservato. */
  fileDaLeggere(fileId) {
    const r = this.db.riga('SELECT COUNT(*) n FROM documento_versioni v JOIN documenti d ON d.id = v.documento_id JOIN file f ON f.id = v.file_id ' +
      "WHERE v.file_id = ? AND v.tolta IS NULL AND d.persona_id IS NULL AND d.vede <> 'riservati' AND f.svuotato IS NULL", fileId);
    return !!(r && r.n);
  },

  /** Dopo una revisione nuova (wisper.inserisci, documento_versioni): il file e' da leggere, e la lettura parte. */
  dopoNuovaVersione(fileId) {
    if (!fileId || !this.fileDaLeggere(fileId)) return;
    this.db.esegui("INSERT INTO file_lettura (file_id, stato) VALUES (?, 'da_leggere') ON CONFLICT(file_id) DO UPDATE SET stato = 'da_leggere', motivo = ''", fileId);
    this.programmaLettura(fileId);
  },

  /** Mette in coda un file (la lettura parte quando la transazione e' finita). */
  programmaLettura(fileId) {
    this.codaLettura = this.codaLettura || [];
    if (this.codaLettura.indexOf(fileId) < 0) this.codaLettura.push(fileId);
    if (!this.letturaInCorso) {
      this.letturaInCorso = new Promise(r => setImmediate(r)).then(() => this.svuotaCodaLettura()).finally(() => { this.letturaInCorso = null; });
    }
    return this.letturaInCorso;
  },

  /** Aspetta che la coda di lettura sia vuota (le prove). */
  async attendiLetture() {
    while (this.letturaInCorso) await this.letturaInCorso;
  },

  async svuotaCodaLettura(finoA) {
    while (this.codaLettura && this.codaLettura.length) {
      if (finoA && Date.now() > finoA) break;
      if (this.chiuso) break;
      const id = this.codaLettura.shift();
      try {
        await this.leggiUnFile(id);
      } catch (err) {
        console.error('[ricerca] ' + id + ': ' + (err && err.message ? err.message : err));
      }
    }
  },

  /** Legge un file e scrive il suo testo (o perche' non c'e'). */
  async leggiUnFile(id) {
    if (!this.fts5Attivo() || !this.ricercaFileAccesa()) return;
    const l = this.db.riga('SELECT * FROM file_lettura WHERE file_id = ?', id);
    if (!l || l.stato !== 'da_leggere') return;
    const f = this.db.riga('SELECT * FROM file WHERE id = ?', id);
    if (!f || f.svuotato || !this.fileDaLeggere(id)) {
      this.togliLettura(id);
      return;
    }
    const percorso = f.percorso ? this.percorsoFile(f.percorso) : '';
    let r;
    if (!percorso || !fs.existsSync(percorso)) r = { stato: 'da_leggere', testo: '', pagine: null, motivo: 'il file non è ancora sul NAS' };
    else {
      const massimo = (numero(this.leggiImpostazioni().RICERCA_FILE_MAX_MB) || 20) * 1048576;
      if (fs.statSync(percorso).size > massimo) r = { stato: 'troppo_grande', testo: '', pagine: null, motivo: 'più grande di ' + Math.round(massimo / 1048576) + ' MB' };
      else r = await leggiNelWorker(percorso, f.nome, f.mime, this.secondiLettura || SECONDI_A_FILE);
    }
    if (this.chiuso) return;
    this.db.transazione(() => {
      this.db.esegui('DELETE FROM file_testo WHERE file_id = ?', id);
      if (r.testo) this.db.esegui('INSERT INTO file_testo (testo, file_id) VALUES (?, ?)', r.testo, id);
      this.db.esegui('UPDATE file_lettura SET stato = ?, caratteri = ?, pagine = ?, letto_il = ?, motivo = ? WHERE file_id = ?',
        r.stato, r.testo ? r.testo.length : 0, r.pagine === undefined ? null : r.pagine, r.stato === 'da_leggere' ? '' : adesso(), testo(r.motivo).slice(0, 200), id);
    });
  },

  /** Un file tolto per sempre (cestino svuotato) o diventato riservato: esce da tutte e due le tabelle. */
  togliLettura(id) {
    if (this.fts5Attivo()) this.db.esegui('DELETE FROM file_testo WHERE file_id = ?', id);
    this.db.esegui('DELETE FROM file_lettura WHERE file_id = ?', id);
  },

  /** Di notte, dopo la copia: i file "da leggere", per al massimo 20 minuti; e via quelli tolti per sempre. */
  async letturaNotturna(minuti) {
    for (const r of this.db.righe('SELECT l.file_id FROM file_lettura l LEFT JOIN file f ON f.id = l.file_id WHERE f.id IS NULL OR f.svuotato IS NOT NULL')) this.togliLettura(r.file_id);
    if (!this.fts5Attivo() || !this.ricercaFileAccesa()) return 0;
    const ids = this.db.righe("SELECT file_id FROM file_lettura WHERE stato = 'da_leggere' ORDER BY rowid").map(r => r.file_id);
    this.codaLettura = (this.codaLettura || []).concat(ids.filter(x => (this.codaLettura || []).indexOf(x) < 0));
    const fino = Date.now() + (minuti === undefined ? MINUTI_DI_NOTTE : minuti) * 60000;
    await this.attendiLetture();
    await this.svuotaCodaLettura(fino);
    this.lavoro('Lettura dei file', 'ok', this.fraseLetture());
    return ids.length;
  },

  // ------------------------------------------------------------------ la ricerca (§6.2)

  /**
   * I documenti trovati dentro i file, fra quelli visibili (righe, gia' filtrate coi permessi) e non gia' trovati nel
   * titolo: [{riga, trovato: {revisione, superata, estratto}}] in ordine di bm25. L'estratto solo per quelli.
   */
  cercaDentro(testoCercato, visibili, giaTrovati) {
    if (!this.fts5Attivo() || !this.ricercaFileAccesa()) return [];
    const termini = terminiFts(testoCercato);
    if (!termini) return [];
    let colpiti;
    try {
      colpiti = this.db.righe('SELECT file_id, bm25(file_testo) AS punti FROM file_testo WHERE file_testo MATCH ? ORDER BY punti LIMIT 5000', termini);
    } catch (err) {
      return [];
    }
    if (!colpiti.length) return [];
    const punti = new Map(colpiti.map(c => [c.file_id, c.punti]));
    const perDoc = new Map();
    const docs = new Map(visibili.filter(x => !giaTrovati.has(x.id)).map(x => [x.id, x]));
    if (!docs.size) return [];
    const ids = Array.from(punti.keys());
    for (let i = 0; i < ids.length; i += 500) {
      const pezzo = ids.slice(i, i + 500);
      const versioni = this.db.righe('SELECT id, documento_id, numero, file_id FROM documento_versioni WHERE tolta IS NULL AND file_id IN (' + pezzo.map(() => '?').join(',') + ')', ...pezzo);
      for (const v of versioni) {
        const d = docs.get(v.documento_id);
        if (!d) continue;
        const l = perDoc.get(d.id) || [];
        l.push(Object.assign({ punti: punti.get(v.file_id) }, v));
        perDoc.set(d.id, l);
      }
    }
    const out = [];
    for (const [idDoc, versioni] of perDoc) {
      const d = docs.get(idDoc);
      const valida = versioni.find(v => v.id === d.versione_valida_id);
      const scelta = valida || versioni.sort((a, b) => b.numero - a.numero)[0];
      const numeroValida = d.versione_valida_id ? (this.db.riga('SELECT numero FROM documento_versioni WHERE id = ?', d.versione_valida_id) || {}).numero : null;
      out.push({ riga: d, punti: Math.min(...versioni.map(v => v.punti)), file: scelta.file_id, revisione: scelta.numero, superata: numeroValida !== null && numeroValida !== undefined && scelta.numero < numeroValida });
    }
    out.sort((a, b) => a.punti - b.punti || b.riga.id - a.riga.id);
    // L'estratto si calcola dopo, solo per quelli che si vedono e solo per la pagina che si manda (estrattiDentro).
    for (const x of out) x.trovato = { revisione: x.revisione, superata: x.superata, estratto: '', file: x.file };
    out.termini = termini;
    return out;
  },

  /** Gli estratti (snippet) dei file trovati dentro, per i documenti della pagina: una lettura sola. */
  estrattiDentro(termini, trovati) {
    const l = trovati.filter(t => t && t.file);
    if (!l.length) return;
    const per = new Map();
    const ids = Array.from(new Set(l.map(t => t.file)));
    for (const r of this.db.righe("SELECT file_id, snippet(file_testo, 0, '[', ']', '…', 14) AS e FROM file_testo WHERE file_testo MATCH ? AND file_id IN (" + ids.map(() => '?').join(',') + ')',
      termini, ...ids)) per.set(r.file_id, String(r.e).replace(/\s+/g, ' ').trim());
    for (const t of l) {
      t.estratto = per.get(t.file) || '';
      delete t.file;
    }
  },

  // ------------------------------------------------------------------ le azioni (§6.3)

  /** letturaFile {idFile} (documenti 1, se lo vede). */
  letturaFile(d) {
    const id = testo(d.idFile);
    const f = /^[A-Za-z0-9_-]+$/.test(id) ? this.db.riga('SELECT * FROM file WHERE id = ?', id) : null;
    if (!f || !this.puoLeggereFile(f)) throw new Rifiuto('File non trovato');
    const l = this.db.riga('SELECT * FROM file_lettura WHERE file_id = ?', id);
    if (!l) return { ok: true, stato: 'non_si_legge_qui', caratteri: 0, pagine: null, letto: '', motivo: 'Non si legge: è di una persona, riservato o non è un documento' };
    return { ok: true, stato: l.stato, caratteri: l.caratteri, pagine: l.pagine, letto: dataOraIso(l.letto_il), motivo: l.motivo };
  },

  /** rileggiFile {idFile?} (documenti 2; senza id tutti, con amministrazione 2). */
  rileggiFile(d) {
    const id = testo(d.idFile);
    if (id) {
      const f = /^[A-Za-z0-9_-]+$/.test(id) ? this.db.riga('SELECT * FROM file WHERE id = ?', id) : null;
      if (!f || !this.puoLeggereFile(f) || !this.fileDaLeggere(id)) throw new Rifiuto('File non trovato');
      this.db.esegui("INSERT INTO file_lettura (file_id, stato) VALUES (?, 'da_leggere') ON CONFLICT(file_id) DO UPDATE SET stato = 'da_leggere', motivo = ''", id);
      this.programmaLettura(id);
    } else {
      if (this.livello('amministrazione') < 2) throw new Rifiuto('Rileggere tutti i file lo fa chi ha Amministrazione: Modifica', { permesso: false });
      // Anche i documenti arrivati senza riga (prima della migrazione o da strade nuove).
      for (const r of this.db.righe('SELECT DISTINCT v.file_id FROM documento_versioni v JOIN documenti x ON x.id = v.documento_id JOIN file f ON f.id = v.file_id ' +
        "WHERE v.file_id IS NOT NULL AND v.tolta IS NULL AND x.persona_id IS NULL AND x.vede <> 'riservati' AND f.svuotato IS NULL")) {
        this.db.esegui("INSERT INTO file_lettura (file_id, stato) VALUES (?, 'da_leggere') ON CONFLICT(file_id) DO UPDATE SET stato = 'da_leggere', motivo = ''", r.file_id);
      }
      this.annota('file_lettura', '', null, null, 'rileggi tutti i file');
      setImmediate(() => this.letturaNotturna().catch(err => console.error('[ricerca] ' + (err && err.message ? err.message : err))));
    }
    return { ok: true, daLeggere: this.db.riga("SELECT COUNT(*) n FROM file_lettura WHERE stato = 'da_leggere'").n };
  },

  /** La riga calma della pagina del documento (§6.3), per documentoCompleto. */
  letturaDocumento(fileId) {
    if (!fileId) return null;
    const l = this.db.riga('SELECT * FROM file_lettura WHERE file_id = ?', fileId);
    if (!l) return null;
    return { stato: l.stato, caratteri: l.caratteri, pagine: l.pagine, letto: dataOraIso(l.letto_il) };
  },
};

Object.defineProperties(module.exports, {
  terminiFts: { value: terminiFts },
  siRicerca: { value: si },
});
