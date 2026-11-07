/*
 * Importare ed esportare (fase 8, fase8.md §7).
 *
 * Esporta tutto (solo il titolare): un file ZIP con un CSV per elenco, negli stessi formati delle esportazioni che ci
 * sono (ogni CSV e' quello di "esporta" con i filtri larghi: tutti i periodi, anche gli archiviati), piu' leggimi.txt.
 * Si prepara in sottofondo; quando e' pronto arriva la notifica esportazione_pronta; si scarica da GET
 * /esportazione/<id> col Bearer (solo chi l'ha chiesta) e resta in /data/esportazioni/ per ESPORTAZIONI_GIORNI giorni.
 * Lo ZIP e' scritto senza dipendenze (src/zip.js) e Windows lo apre col doppio clic.
 *
 * Importa clienti e fornitori (clienti 2): un CSV (";" o ",", UTF-8 o Windows-1252) o un XLSX, al massimo 5.000 righe
 * e 5 MB. Il server propone l'abbinamento delle colonne dai nomi delle intestazioni; poi il controllo (niente e' ancora
 * scritto): Nuovi, Gia' in Wisper (stessa partita IVA o stesso nome: si completano SOLO i campi vuoti), Da sistemare
 * (con le frasi di salvaSoggetto). La lettura vive in memoria 30 minuti. Si torna indietro con Archivia quelli
 * importati (quelli nati da quel file senza commesse, rapportini, preventivi o fatture).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Rifiuto, senzaPermesso, testo, adesso, adessoMs, oggi, dataOraIso, istante, numero, normalizza } = require('../utili');
const { scriviZip } = require('../zip');
const { testoDaByte } = require('../lettura');

const MASSIMO_BYTE = 5 * 1024 * 1024;
const MASSIMO_RIGHE = 5000;
const MINUTI_LETTURA = 30;
const MOTIVO_PROVA = Symbol('solo una prova');

/** Gli elenchi di Esporta tutto: [file, cosa di esporta, filtri larghi]. */
const ELENCHI = [
  ['rapportini', 'rapportini', { tutti: true }],
  ['clienti', 'clienti', { archiviati: true }],
  ['fornitori', 'fornitori', { archiviati: true }],
  ['referenti', 'referenti', {}],
  ['sedi', 'sedi', {}],
  ['commesse', 'commesse', {}],
  ['progetti', 'progetti', {}],
  ['prestazioni', 'prestazioni', {}],
  ['preventivi', 'preventivi', {}],
  ['attivita', 'attivita', { da: '2000-01-01', a: '2999-12-31', stato: 'tutte' }],
  ['ore', 'ore', { da: '2000-01-01', a: '2999-12-31', stato: 'tutte' }],
  ['spese', 'spese', { da: '2000-01-01', a: '2999-12-31' }],
  ['trasferte', 'trasferte', { da: '2000-01-01', a: '2999-12-31' }],
  ['rimborsi', 'rimborsi', {}],
  ['fatture', 'fatture', {}],
  ['ricevute', 'ricevute', {}],
  ['movimenti', 'movimenti', {}],
  ['impegni', 'impegni', {}],
  ['documenti', 'documenti', {}],
  ['scadenze', 'scadenze', {}],
  ['ticket', 'ticket', {}],
  ['contratti', 'contratti', {}],
  ['persone', 'persone', { stato: 'tutte' }],
  ['assenze', 'assenze', { da: '2000-01-01', a: '2999-12-31', stato: 'tutte' }],
  ['mezzi', 'mezzi', {}],
  ['attrezzature', 'attrezzature', {}],
  ['collaboratori', 'collaboratori', { stato: 'tutti' }],
  ['incarichi', 'incarichi', { stato: 'tutti' }],
  ['comunicazioni', 'comunicazioni', {}],
  ['registro', 'registro', {}],
];

/** I campi dell'anagrafica che si importano, e i nomi delle intestazioni che li fanno riconoscere (senza maiuscole, spazi e punti). */
const CAMPI = [
  ['nome', 'Ragione sociale', ['ragionesociale', 'denominazione', 'nome', 'ragsoc', 'ragsociale', 'cliente', 'fornitore', 'azienda', 'nominativo']],
  ['partitaIva', 'Partita IVA', ['partitaiva', 'piva', 'pi', 'partitaivacee', 'vat', 'vatnumber']],
  ['codiceFiscale', 'Codice fiscale', ['codicefiscale', 'cf', 'codfiscale', 'codfisc']],
  ['codiceSdi', 'Codice destinatario', ['codicedestinatario', 'sdi', 'codicesdi', 'coddestinatario', 'codiceunivoco']],
  ['pec', 'PEC', ['pec', 'emailpec', 'indirizzopec']],
  ['email', 'Email', ['email', 'mail', 'posta', 'indirizzoemail']],
  ['telefono', 'Telefono', ['telefono', 'tel', 'cellulare', 'cell', 'telefono1']],
  ['indirizzo', 'Indirizzo', ['indirizzo', 'via', 'sede', 'indirizzosede']],
  ['cap', 'CAP', ['cap', 'codicepostale']],
  ['citta', 'Città', ['citta', 'comune', 'localita', 'city']],
  ['provincia', 'Provincia', ['provincia', 'prov', 'pr']],
  ['nazione', 'Nazione', ['nazione', 'paese', 'stato', 'country']],
  ['note', 'Note', ['note', 'annotazioni']],
  ['tipo', 'Cliente o fornitore', ['tipo', 'categoria', 'tipologia', 'clientefornitore']],
];
const CAMPO = Object.fromEntries(CAMPI.map(c => [c[0], c]));

/** "Città", "P. IVA", "Partita I.V.A." -> "citta", "piva", "partitaiva". */
const chiaveIntestazione = s => normalizza(String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''));

/** Un CSV in righe di celle: separatore ";" o "," (quello piu' frequente nella prima riga fuori dalle virgolette). */
function leggiCsv(testoCsv) {
  const t = testoCsv.replace(/^﻿/, '');
  const prima = t.split(/\r?\n/)[0] || '';
  let pv = 0;
  let v = 0;
  let dentro = false;
  for (const c of prima) {
    if (c === '"') dentro = !dentro;
    else if (!dentro && c === ';') pv++;
    else if (!dentro && c === ',') v++;
  }
  const sep = pv >= v ? ';' : ',';
  const righe = [];
  let riga = [];
  let cella = '';
  let virgolette = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (virgolette) {
      if (c === '"') {
        if (t[i + 1] === '"') { cella += '"'; i++; } else virgolette = false;
      } else cella += c;
    } else if (c === '"') virgolette = true;
    else if (c === sep) { riga.push(cella); cella = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      riga.push(cella);
      righe.push(riga);
      riga = [];
      cella = '';
    } else cella += c;
  }
  if (cella !== '' || riga.length) { riga.push(cella); righe.push(riga); }
  return { separatore: sep, righe: righe.filter(r => r.some(x => String(x).trim() !== '')) };
}

const cellaTesto = v => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
};

module.exports = {
  // ------------------------------------------------------------------ Esporta tutto (§7.1)

  /** esportaTutto {} (titolare): l'esportazione nasce "in_corso" e si prepara in sottofondo. */
  esportaTutto() {
    if (!this.eTitolare()) throw senzaPermesso('esportare tutti i dati (lo fa solo il titolare)');
    const c = this.chi();
    if (this.db.riga("SELECT id FROM esportazioni WHERE stato = 'in_corso' AND utente_id IS ?", c.utente ? c.utente.id : null)) throw new Rifiuto('Un\'esportazione è già in preparazione: arriva una notifica quando è pronta');
    const id = this.inserisci('esportazioni', { utente_id: c.utente ? c.utente.id : null, tipo: 'tutto', stato: 'in_corso', creato: adesso() }, 'id', 'esportazione di tutti i dati');
    const chi = Object.assign({}, c);
    this.esportazioniInCorso = this.esportazioniInCorso || new Map();
    const lavoro = new Promise(r => setImmediate(r)).then(() => this.preparaEsportazione(id, chi)).catch(err => {
      console.error('[esportazione] ' + (err && err.stack ? err.stack : err));
      try { this.db.esegui("UPDATE esportazioni SET stato = 'errore', errore = ? WHERE id = ?", String(err && err.message ? err.message : err).slice(0, 300), id); } catch (e) { /* chiuso */ }
    }).finally(() => this.esportazioniInCorso.delete(id));
    this.esportazioniInCorso.set(id, lavoro);
    return { ok: true, esportazione: { id, stato: 'in_corso' } };
  },

  /** Aspetta che le esportazioni in preparazione siano finite (le prove, la prova di carico). */
  async attendiEsportazioni() {
    while (this.esportazioniInCorso && this.esportazioniInCorso.size) await Promise.all(Array.from(this.esportazioniInCorso.values()));
  },

  /** Prepara lo ZIP come la persona che l'ha chiesto (i suoi permessi: niente soldi o riservati che non vede). */
  async preparaEsportazione(id, chi) {
    const voci = [];
    const righe = {};
    const quando = adesso();
    for (const [nome, cosa, filtri] of ELENCHI) {
      if (this.chiuso) return;
      await new Promise(r => setImmediate(r));
      if (this.chiuso) return;
      const r = await this.come(chi, () => this.esportaPerTuttoPianoPiano(cosa, filtri));
      if (!r) continue;
      voci.push({ nome: nome + '.csv', dati: Buffer.from(r.base64, 'base64') });
      righe[nome] = r.righe;
    }
    const leggimi = this.leggimiEsportazione(quando, righe);
    voci.unshift({ nome: 'leggimi.txt', dati: Buffer.from(leggimi.replace(/\n/g, '\r\n'), 'utf8') });
    const zip = scriviZip(voci, new Date(adessoMs()));
    const cartella = path.join(this.dati, 'esportazioni');
    fs.mkdirSync(cartella, { recursive: true });
    const nomeFile = 'wisper-tutto-' + oggi() + '-' + id + '.zip';
    fs.writeFileSync(path.join(cartella, nomeFile), zip);
    const giorni = numero(this.leggiImpostazioni().ESPORTAZIONI_GIORNI) || 7;
    const scade = istante(new Date(adessoMs() + giorni * 86400000));
    if (this.chiuso) return;
    this.come(chi, () => this.db.transazione(() => {
      this.db.esegui("UPDATE esportazioni SET stato = 'pronta', percorso = ?, byte = ?, righe = ?, scade = ? WHERE id = ?", nomeFile, zip.length, JSON.stringify(righe), scade, id);
      const totale = Object.values(righe).reduce((t, n) => t + n, 0);
      this.annota('esportazioni', id, null, { file: voci.length - 1, righe: totale }, 'esportazione di tutti i dati');
      if (chi.utente) this.come(require('../wisper').SISTEMA, () => this.notifica([chi.utente.id], 'esportazione_pronta', 'Il file con tutti i dati è pronto', nomeFile, { pagina: 'amministrazione', filtro: { sezione: 'importa' } }));
    }));
  },

  /**
   * Come esportaPerTutto, ma gli elenchi lunghi (i ticket, il registro) un po' alla volta, con una pausa fra un pezzo e
   * l'altro: con dieci anni di dati il server intanto risponde agli altri (prova di carico, §11.5).
   */
  async esportaPerTuttoPianoPiano(cosa, filtri) {
    const pausa = () => new Promise(r => setImmediate(r));
    if (cosa === 'registro') return this.esportaRegistroIntero(pausa);
    if (cosa === 'ticket') {
      if (this.livello('ticket') < 1 || this.eEsterno()) return null;
      const lista = this.leggiTicket(Object.assign({ segmento: 'tutti' }, filtri)).ticket;
      const righe = [];
      for (let i = 0; i < lista.length; i += 50) {
        if (i) { await pausa(); if (this.chiuso) return null; }
        this.conLettureRicordate(() => {
          for (const x of lista.slice(i, i + 50)) righe.push(this.ticketCompleto(this.db.riga('SELECT * FROM ticket WHERE id = ?', x.id)));
        });
      }
      return this.esportaConRighe('ticket', righe, filtri);
    }
    return this.esportaPerTutto(cosa, filtri);
  },

  /**
   * fn (sincrona) con una memoria per le mappe dei nomi e i saldi (ricordata): la scheda di ogni ticket, attivita' o
   * documento rifaceva le stesse mappe (numeri dei ticket, commesse, clienti) per ogni riga. Ogni scrittura svuota la
   * memoria; fn deve essere sincrona (nessun'altra richiesta passa in mezzo).
   */
  conLettureRicordate(fn) {
    // Gia' dentro (una scheda chiamata da una Dashboard o da un'esportazione): la stessa memoria.
    if (this.memoLetture) return fn();
    const db = this.db;
    const base = Object.getPrototypeOf(db);
    const valori = new Map();
    // Ogni scrittura (una richiesta che non e' una lettura) svuota la memoria: dopo si rilegge.
    db.prepara = q => {
      if (!/^\s*(SELECT|WITH)/i.test(q)) valori.clear();
      return base.prepara.call(db, q);
    };
    this.memoLetture = valori;
    try {
      return fn();
    } finally {
      this.memoLetture = null;
      delete db.prepara;
    }
  },

  /**
   * Le mappe dei nomi (id -> nome di persone, clienti, commesse, ticket...) che le schede rifanno per ogni riga: dentro
   * conLettureRicordate si fanno una volta sola (e si rifanno dopo una scrittura); fuori, ogni volta come prima. Chi le
   * usa le legge e basta.
   */
  ricordata(chiave, fn) {
    const m = this.memoLetture;
    if (!m) return fn();
    if (!m.has(chiave)) m.set(chiave, fn());
    return m.get(chiave);
  },

  /** Un CSV di Esporta tutto: quello di esporta coi filtri larghi (con quelli stretti se un filtro non vale), o null se non lo vede. */
  esportaPerTutto(cosa, filtri) {
    if (cosa === 'registro') return this.esportaRegistroIntero();
    if (cosa === 'referenti' || cosa === 'sedi' || cosa === 'prestazioni' || cosa === 'comunicazioni') {
      try { return this.esporta(Object.assign({ cosa }, filtri)); } catch (err) { return null; }
    }
    try {
      return this.esporta(Object.assign({ cosa }, filtri));
    } catch (err) {
      if (err && err.extra && err.extra.permesso === false) return null;
      try { return this.esporta({ cosa }); } catch (e) { return null; }
    }
  },

  /**
   * Il registro intero in un CSV solo (le pagine da 100 di esporta sarebbero migliaia con dieci anni di dati). pausa: una
   * funzione che aspetta (Esporta tutto in sottofondo), fra una pagina da 20.000 righe e l'altra; senza, tutto di fila.
   */
  esportaRegistroIntero(pausa) {
    // 06/11/2026: anche le righe dei salvataggi automatici ancora in attesa (wisper.js, scriviInAttesa).
    this.db.transazione(() => this.scriviInAttesa({ tutte: true }));
    if (pausa) return this.esportaRegistroAPagine(pausa);
    const { togliCosti } = require('../permessi');
    const { cella } = require('./esporta');
    const costi = this.vedeCosti();
    const dataOra = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] : ''; };
    const testa = ['Quando', 'Chi', 'Dispositivo', 'Azione', 'Tabella', 'Riga', 'Prima', 'Dopo', 'Nota'];
    const pezzi = ['﻿' + testa.map(cella).join(';')];
    let n = 0;
    const json = v => { if (!v) return ''; try { const o = JSON.parse(v); return JSON.stringify(costi ? o : togliCosti(o)); } catch (e) { return v; } };
    for (const r of this.db.prepara('SELECT * FROM registro ORDER BY id DESC').iterate()) {
      pezzi.push([dataOra(dataOraIso(r.quando)), r.utente, r.disp, r.azione, r.tabella, r.id_riga, json(r.prima), json(r.dopo), r.nota].map(cella).join(';'));
      n++;
    }
    return { righe: n, base64: Buffer.from(pezzi.join('\r\n') + '\r\n', 'utf8').toString('base64') };
  },

  async esportaRegistroAPagine(pausa) {
    const { togliCosti } = require('../permessi');
    const { cella } = require('./esporta');
    const costi = this.vedeCosti();
    const dataOra = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] : ''; };
    const json = v => { if (!v) return ''; try { const o = JSON.parse(v); return JSON.stringify(costi ? o : togliCosti(o)); } catch (e) { return v; } };
    const pezzi = ['\uFEFF' + ['Quando', 'Chi', 'Dispositivo', 'Azione', 'Tabella', 'Riga', 'Prima', 'Dopo', 'Nota'].map(cella).join(';')];
    let n = 0;
    let finoA = Number.MAX_SAFE_INTEGER;
    for (;;) {
      const righe = this.db.righe('SELECT * FROM registro WHERE id < ? ORDER BY id DESC LIMIT 20000', finoA);
      if (!righe.length) break;
      for (const r of righe) pezzi.push([dataOra(dataOraIso(r.quando)), r.utente, r.disp, r.azione, r.tabella, r.id_riga, json(r.prima), json(r.dopo), r.nota].map(cella).join(';'));
      n += righe.length;
      finoA = righe[righe.length - 1].id;
      await pausa();
      if (this.chiuso) return null;
    }
    return { righe: n, base64: Buffer.from(pezzi.join('\r\n') + '\r\n', 'utf8').toString('base64') };
  },

  leggimiEsportazione(quando, righe) {
    const descr = {
      rapportini: 'i rapportini, tutti gli anni', clienti: 'i clienti (anche gli archiviati)', fornitori: 'i fornitori (anche gli archiviati)', referenti: 'i referenti di clienti e fornitori',
      sedi: 'sedi e impianti', commesse: 'le commesse (anche archiviate e modelli)', progetti: 'i progetti delle commesse', prestazioni: 'le prestazioni delle commesse', preventivi: 'i preventivi',
      attivita: 'attività, appuntamenti, sopralluoghi e interventi', ore: 'le ore registrate', spese: 'le spese', trasferte: 'le trasferte', rimborsi: 'i rimborsi da fare',
      fatture: 'le fatture', ricevute: 'le fatture ricevute', movimenti: 'incassi e pagamenti', impegni: 'tributi e scadenze di pagamento', documenti: 'l\'elenco dei documenti',
      scadenze: 'le scadenze', ticket: 'i ticket', contratti: 'i contratti di assistenza', persone: 'le persone', assenze: 'ferie, permessi e assenze', mezzi: 'i mezzi',
      attrezzature: 'le attrezzature', collaboratori: 'i collaboratori esterni', incarichi: 'gli incarichi', comunicazioni: 'lo storico delle comunicazioni', registro: 'il registro delle modifiche',
    };
    const s = dataOraIso(quando);
    return ['Wisper · tutti i dati', '', 'Preparato il ' + s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) + ' alle ' + s.slice(11, 16) + ' dal server ' + this.versione + '.',
      'Ogni file .csv si apre con Excel (punto e virgola, virgola nei decimali, date come 21/10/2026).', '',
      'Cosa c\'è in ogni file:']
      .concat(Object.keys(righe).map(k => '  ' + k + '.csv: ' + (descr[k] || k) + ' (' + righe[k] + ' righe)'))
      .concat(['', 'I file (foto, firme, documenti) non ci sono: stanno nella copia del NAS e in quella fuori casa.',
        'Ci sono solo le colonne che chi ha chiesto il file può vedere.', '']).join('\n');
  },

  /** esportazioni {} (titolare): le proprie. */
  esportazioni() {
    if (!this.eTitolare()) throw senzaPermesso('esportare tutti i dati (lo fa solo il titolare)');
    const c = this.chi();
    this.pulisciEsportazioni();
    return {
      ok: true,
      esportazioni: this.db.righe('SELECT * FROM esportazioni WHERE utente_id IS ? ORDER BY id DESC LIMIT 20', c.utente ? c.utente.id : null).map(e => ({
        id: e.id, stato: e.stato, byte: e.byte, righe: e.righe ? JSON.parse(e.righe) : null, creato: dataOraIso(e.creato), scade: dataOraIso(e.scade), scaricata: dataOraIso(e.scaricata_il), errore: e.errore,
      })),
    };
  },

  /** Le esportazioni scadute: il file si toglie, la riga resta (senza percorso). */
  pulisciEsportazioni() {
    for (const e of this.db.righe("SELECT * FROM esportazioni WHERE stato = 'pronta' AND scade <> '' AND scade < ?", adesso())) {
      try { if (e.percorso) fs.rmSync(path.join(this.dati, 'esportazioni', path.basename(e.percorso)), { force: true }); } catch (err) { /* niente */ }
      this.db.esegui("UPDATE esportazioni SET stato = 'errore', percorso = '', errore = 'scaduta: il file è stato tolto' WHERE id = ?", e.id);
    }
  },

  /** GET /esportazione/<id> col Bearer: solo chi l'ha chiesta e solo il titolare. Torna {percorso, nome} o null. */
  fileEsportazione(id, utente) {
    this.pulisciEsportazioni();
    const e = this.db.riga("SELECT * FROM esportazioni WHERE id = ? AND stato = 'pronta'", Number(id) || 0);
    if (!e || !utente || e.utente_id !== utente.id || utente.ruolo !== 'titolare') return null;
    const p = path.join(this.dati, 'esportazioni', path.basename(e.percorso));
    if (!fs.existsSync(p)) return null;
    this.db.esegui('UPDATE esportazioni SET scaricata_il = ? WHERE id = ?', adesso(), e.id);
    return { percorso: p, nome: path.basename(e.percorso).replace(/-\d+\.zip$/, '.zip') };
  },

  // ------------------------------------------------------------------ gli elenchi nuovi di Esporta tutto

  /** referenti, sedi, prestazioni, comunicazioni: CSV come gli altri (le colonne in esporta.js, COLONNE_FASE8). */
  righeDaEsportareFase8(cosa) {
    if (cosa === 'referenti') {
      const nomi = {};
      this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { nomi[s.id] = s.nome; });
      return this.db.righe('SELECT * FROM referenti ORDER BY soggetto_id, id').map(r => Object.assign({ azienda: nomi[r.soggetto_id] || '' }, r));
    }
    if (cosa === 'sedi') {
      const nomi = {};
      this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { nomi[s.id] = s.nome; });
      return this.db.righe('SELECT * FROM sedi ORDER BY soggetto_id, id').map(r => Object.assign({ azienda: nomi[r.soggetto_id] || '' }, r));
    }
    if (cosa === 'prestazioni') return this.db.righe('SELECT * FROM prestazioni ORDER BY commessa_id, ordine, id');
    if (cosa === 'comunicazioni') return this.db.righe('SELECT * FROM comunicazioni ORDER BY quando, id');
    return [];
  },

  // ------------------------------------------------------------------ Importa clienti e fornitori (§7.2)

  /** leggiImport {nome, base64} (clienti 2): le colonne proposte e quante righe. */
  leggiImport(d) {
    const nome = testo(d.nome).slice(0, 200) || 'file';
    let b;
    try { b = Buffer.from(String(d.base64 || ''), 'base64'); } catch (e) { b = Buffer.alloc(0); }
    if (!b.length) throw new Rifiuto('Il file è vuoto');
    if (b.length > MASSIMO_BYTE) throw new Rifiuto('Il file è più grande di 5 MB: dividilo in due');
    let celle;
    if (b[0] === 0x50 && b[1] === 0x4B) {
      let schede;
      try { schede = require('../../strumenti/xlsx').leggiXlsx(b); } catch (err) { throw new Rifiuto('Il file Excel non si legge: salvalo di nuovo come .xlsx'); }
      const prima = schede.find(s => s.righe && s.righe.some(r => r.some(x => cellaTesto(x)))) || { righe: [] };
      celle = prima.righe.map(r => r.map(cellaTesto)).filter(r => r.some(x => x !== ''));
    } else {
      if (b.subarray(0, 4).toString('latin1') === '%PDF' || b[0] === 0xD0) throw new Rifiuto('Si importano solo file CSV o Excel (.xlsx)');
      celle = leggiCsv(testoDaByte(b)).righe.map(r => r.map(x => String(x).trim()));
    }
    if (celle.length < 2) throw new Rifiuto('Nel file non ci sono righe da importare (serve la riga delle intestazioni e almeno una riga)');
    if (celle.length - 1 > MASSIMO_RIGHE) throw new Rifiuto('Il file ha più di 5.000 righe: dividilo');
    const intestazioni = celle[0].map(x => String(x || '').trim());
    const righe = celle.slice(1);
    const usati = new Set();
    const colonne = intestazioni.map((h, i) => {
      const k = chiaveIntestazione(h);
      let campo = '';
      for (const [c, , nomi] of CAMPI) if (!usati.has(c) && nomi.indexOf(k) >= 0) { campo = c; break; }
      if (campo) usati.add(campo);
      const esempi = righe.map(r => r[i] || '').filter(Boolean).slice(0, 2);
      return { intestazione: h || 'Colonna ' + (i + 1), campo, esempi };
    });
    this.lettureImport = this.lettureImport || new Map();
    this.pulisciLettureImport();
    const idLettura = crypto.randomBytes(12).toString('base64url');
    const c = this.chi();
    this.lettureImport.set(idLettura, { quando: adessoMs(), nome, intestazioni, righe, utente: c.utente ? c.utente.id : null });
    return { ok: true, idLettura, nome, colonne, righe: righe.length, campi: CAMPI.map(([chiave, nome]) => ({ chiave, nome })) };
  },

  pulisciLettureImport() {
    if (!this.lettureImport) return;
    for (const [k, v] of this.lettureImport) if (adessoMs() - v.quando > MINUTI_LETTURA * 60000) this.lettureImport.delete(k);
  },

  letturaImport(idLettura) {
    this.pulisciLettureImport();
    const l = this.lettureImport && this.lettureImport.get(testo(idLettura));
    const c = this.chi();
    if (!l || (l.utente !== null && (!c.utente || l.utente !== c.utente.id))) throw new Rifiuto('La lettura del file è scaduta (dura 30 minuti): sceglilo di nuovo');
    return l;
  },

  /**
   * Il controllo di un'importazione, senza scrivere niente: per ogni riga Nuovo, Gia' in Wisper (coi campi vuoti che
   * si completerebbero) o Da sistemare (la frase di salvaSoggetto, provata in un punto di salvataggio annullato).
   */
  classificaImport(d) {
    const l = this.letturaImport(d.idLettura);
    const scelte = (Array.isArray(d.colonne) ? d.colonne : []).map(x => (x && typeof x === 'object' ? testo(x.campo) : testo(x)));
    if (scelte.length !== l.intestazioni.length) throw new Rifiuto('Le colonne: una scelta per ogni colonna del file');
    for (const s of scelte) if (s && !CAMPO[s]) throw new Rifiuto('Campo sconosciuto: ' + s);
    const doppie = scelte.filter(Boolean).filter((s, i, a) => a.indexOf(s) !== i);
    if (doppie.length) throw new Rifiuto(CAMPO[doppie[0]][1] + ': è scelto per due colonne');
    if (scelte.indexOf('nome') < 0) throw new Rifiuto('Ragione sociale: scegli la colonna col nome');
    const tipo = testo(d.tipo);
    if (['clienti', 'fornitori', 'colonna'].indexOf(tipo) < 0) throw new Rifiuto('Sono clienti, fornitori o lo dice una colonna?');
    if (tipo === 'colonna' && scelte.indexOf('tipo') < 0) throw new Rifiuto('Cliente o fornitore: scegli la colonna che lo dice');
    const visti = new Map();
    const out = { nuovi: [], gia: [], daSistemare: [] };
    l.righe.forEach((r, i) => {
      const riga = i + 2;
      const s = {};
      scelte.forEach((campo, j) => { if (campo && campo !== 'tipo' && testo(r[j])) s[campo] = testo(r[j]); });
      let cliente = tipo !== 'fornitori';
      let fornitore = tipo === 'fornitori';
      if (tipo === 'colonna') {
        const v = normalizza(r[scelte.indexOf('tipo')] || '');
        cliente = /client|entramb|tutti/.test(v);
        fornitore = /fornit|entramb|tutti/.test(v);
        if (!cliente && !fornitore) { out.daSistemare.push({ riga, errore: 'Riga ' + riga + ' · Cliente o fornitore: scrivi cliente, fornitore o entrambi' }); return; }
      }
      if (!s.nome) { out.daSistemare.push({ riga, errore: 'Riga ' + riga + ' · Nome: manca la ragione sociale' }); return; }
      const chiave = s.partitaIva ? 'p:' + s.partitaIva.replace(/\D/g, '') : 'n:' + normalizza(s.nome);
      if (visti.has(chiave)) { out.daSistemare.push({ riga, errore: 'Riga ' + riga + ' · è un doppione della riga ' + visti.get(chiave) }); return; }
      visti.set(chiave, riga);
      // Gia' in Wisper: stessa partita IVA o stesso nome (trovaDoppione di salvaSoggetto).
      const doppione = this.trovaDoppione(s.nome, s.partitaIva ? s.partitaIva.replace(/[\s.]/g, '').replace(/^IT/i, '') : '');
      if (doppione) {
        const ora = this.soggetto(doppione.id);
        const campi = {};
        for (const k of Object.keys(s)) if (k !== 'nome' && !testo(ora[k]) && testo(s[k])) campi[k] = s[k];
        if (cliente && !ora.cliente) campi.cliente = true;
        if (fornitore && !ora.fornitore) campi.fornitore = true;
        // I campi da completare devono essere giusti anche loro: si prova a scriverli e si torna indietro.
        const errore = Object.keys(campi).length ? this.provaSoggetto(Object.assign({ id: doppione.id }, campi)) : '';
        if (errore) out.daSistemare.push({ riga, errore: 'Riga ' + riga + ' · ' + errore });
        else out.gia.push({ riga, id: doppione.id, nome: ora.nome, campi });
        return;
      }
      const errore = this.provaSoggetto(Object.assign({ cliente, fornitore }, s));
      if (errore) out.daSistemare.push({ riga, errore: 'Riga ' + riga + ' · ' + errore });
      else out.nuovi.push({ riga, s: Object.assign({ cliente, fornitore }, s) });
    });
    return { l, out };
  },

  /** Prova salvaSoggetto in un punto di salvataggio che si annulla sempre: torna la frase d'errore o ''. */
  provaSoggetto(s) {
    try {
      this.db.transazione(() => { this.salvaSoggetto(s); throw MOTIVO_PROVA; });
    } catch (err) {
      if (err === MOTIVO_PROVA) return '';
      if (err instanceof Rifiuto) return err.message;
      throw err;
    }
    return '';
  },

  /** controllaImport {idLettura, colonne, tipo} (clienti 2): i tre gruppi e le prime 20 righe. */
  controllaImport(d) {
    const { out } = this.classificaImport(d);
    const anteprima = []
      .concat(out.nuovi.map(x => ({ riga: x.riga, gruppo: 'nuovo', nome: x.s.nome, partitaIva: x.s.partitaIva || '', citta: x.s.citta || '' })))
      .concat(out.gia.map(x => ({ riga: x.riga, gruppo: 'gia', nome: x.nome, id: x.id, completa: Object.keys(x.campi).filter(k => k !== 'cliente' && k !== 'fornitore').map(k => CAMPO[k][1]) })))
      .concat(out.daSistemare.map(x => ({ riga: x.riga, gruppo: 'sistemare', errore: x.errore })))
      .sort((a, b) => a.riga - b.riga).slice(0, 20);
    return { ok: true, nuovi: out.nuovi.length, completati: out.gia.filter(x => Object.keys(x.campi).length).length, gia: out.gia.length, daSistemare: out.daSistemare, anteprima };
  },

  /** importaSoggetti {idLettura, colonne, tipo} (clienti 2): scrive i nuovi, completa i campi vuoti dei gia' presenti. */
  importaSoggetti(d) {
    const { l, out } = this.classificaImport(d);
    const nota = 'importato da ' + l.nome;
    const ids = [];
    for (const x of out.nuovi) {
      const s = this.salvaSoggetto(x.s);
      if (s.giaEsisteva) continue;
      ids.push(s.id);
      this.annota('soggetti', s.id, null, null, nota);
    }
    let completati = 0;
    for (const x of out.gia) {
      if (!Object.keys(x.campi).length) continue;
      this.salvaSoggetto(Object.assign({ id: x.id }, x.campi));
      this.annota('soggetti', x.id, null, { campi: Object.keys(x.campi) }, nota);
      completati++;
    }
    const c = this.chi();
    const id = this.inserisci('importazioni', {
      utente_id: c.utente ? c.utente.id : null, tipo: 'soggetti', nome_file: l.nome, righe: l.righe.length, nuovi: ids.length, completati, saltati: out.daSistemare.length,
      errori: JSON.stringify(out.daSistemare.slice(0, 200)), ids: JSON.stringify(ids), quando: adesso(),
    }, 'id', nota);
    if (c.utente) this.come(require('../wisper').SISTEMA, () => this.notifica([c.utente.id], 'importazione_finita', 'Importati ' + ids.length + ', completati ' + completati + ', saltati ' + out.daSistemare.length, l.nome,
      { pagina: 'amministrazione', filtro: { sezione: 'importa' } }));
    this.lettureImport.delete(testo(d.idLettura));
    return { ok: true, importazione: { id, nuovi: ids.length, completati, saltati: out.daSistemare.length } };
  },

  /** archiviaImportati {idImportazione} (clienti 2): quelli nati da quel file senza commesse, rapportini, preventivi o fatture. */
  archiviaImportati(d) {
    const imp = this.db.riga('SELECT * FROM importazioni WHERE id = ?', Number(d.idImportazione) || 0);
    if (!imp) throw new Rifiuto('Importazione ' + testo(d.idImportazione) + ' non trovata');
    let archiviati = 0;
    let restano = 0;
    for (const id of JSON.parse(imp.ids || '[]')) {
      const s = this.db.riga('SELECT * FROM soggetti WHERE id = ?', id);
      if (!s) continue;
      const usato = this.db.riga('SELECT 1 FROM commesse WHERE cliente_id = ? LIMIT 1', id) || this.db.riga('SELECT 1 FROM rapportini WHERE id_cliente = ? LIMIT 1', id) ||
        this.db.riga('SELECT 1 FROM preventivi WHERE cliente_id = ? LIMIT 1', id) || this.db.riga('SELECT 1 FROM fatture WHERE cliente_id = ? LIMIT 1', id) ||
        this.db.riga('SELECT 1 FROM fatture_ricevute WHERE fornitore_id = ? LIMIT 1', id);
      if (usato) { restano++; continue; }
      if (!s.archiviato) this.archiviaSoggetto(id, true);
      archiviati++;
    }
    this.aggiorna('importazioni', imp.id, { archiviati_il: adesso() }, 'id', 'archiviati gli importati da ' + imp.nome_file);
    return { ok: true, archiviati, restano };
  },

  /** importazioni {} (clienti 1): l'elenco coi numeri. */
  importazioni() {
    const nomi = {};
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { nomi[u.id] = u.nome; });
    return {
      ok: true,
      importazioni: this.db.righe('SELECT * FROM importazioni ORDER BY id DESC LIMIT 50').map(i => ({
        id: i.id, nomeFile: i.nome_file, righe: i.righe, nuovi: i.nuovi, completati: i.completati, saltati: i.saltati, errori: i.errori ? JSON.parse(i.errori) : [],
        quando: dataOraIso(i.quando), utente: i.utente_id ? nomi[i.utente_id] || '' : '', archiviati: dataOraIso(i.archiviati_il),
      })),
    };
  },
};

Object.defineProperties(module.exports, {
  ELENCHI_ESPORTA_TUTTO: { value: ELENCHI },
  CAMPI_IMPORTA: { value: CAMPI },
  leggiCsv: { value: leggiCsv },
});
