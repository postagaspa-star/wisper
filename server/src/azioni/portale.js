/*
 * Fase 7: il portale clienti dal lato dello studio (fase7.md §3, §8, §10.1, §11.1) e le regole che il router del
 * portale (src/portale/) chiama per nome: pubblicazioni, link e codici, sessioni chiuse, email del portale con la quota
 * del postino, Da guardare, notifiche, la Dashboard della fase 7.
 *
 * Il portale passa da Google (§0): niente porta 8401, niente cookie, niente indirizzi IP. "Collegato" vuol dire
 * PORTALE_INDIRIZZO scritto e il giro del portale (porta.js con soloPortale) che parla con lo script (§0.5).
 * Le azioni che scrivono rispondono nonCollegato finche' manca l'indirizzo e spento con PORTALE_ATTIVO falso, tranne
 * salvaPortaleCliente (si puo' preparare tutto prima di accendere).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Rifiuto, senzaPermesso, testo, numero, adesso, adessoMs, oggi, piuGiorni, dataIso, dataOraIso, istante, idCasuale, sha256 } = require('../utili');
const C = require('../conti');
const K = require('../comunicazioni');

const vuoto = v => v === undefined || v === null || v === '';
const si = v => v === true || v === 1 || v === '1' || v === 'true';
const TIPI = ['preventivo', 'contratto', 'rapportino', 'fattura', 'documento', 'ticket'];
/** Il permesso dello studio per ogni tipo pubblicato (§10.1: contratti col modulo ticket, fatture con fatturazione). */
const MODULO_DI = { preventivo: 'preventivi', contratto: 'ticket', rapportino: 'rapportini', fattura: 'fatturazione', documento: 'documenti', ticket: 'ticket' };
/** Il permesso del referente per ogni tipo (i contratti seguono i preventivi). */
const PERMESSO_DI = { preventivo: 'preventivi', contratto: 'preventivi', rapportino: 'rapportini', fattura: 'fatture', documento: 'documenti', ticket: 'richieste' };
const PERMESSI_BASE = { preventivi: 2, rapportini: 2, fatture: 0, documenti: 2, richieste: 2 };
const REGOLE_BASE = { preventivi: true, contratti: true, rapportiniFirmati: true, rapportiniDaFirmare: false, fatture: false, richieste: 'portale' };
const NOMI_TIPI = { preventivo: 'Preventivo', contratto: 'Contratto', rapportino: 'Rapportino', fattura: 'Fattura', documento: 'Documento', ticket: 'Richiesta' };
const FRASI_ACCESSO = {
  link_chiesto: 'Ha chiesto un link', entrato: 'Entrato', codice_sbagliato: 'Codice sbagliato', link_scaduto: 'Link scaduto', bloccato: 'Bloccato dai limiti',
  visto: 'Ha visto', scaricato: 'Ha scaricato', accettato: 'Ha accettato', rifiutato: 'Non ha accettato', domanda: 'Ha fatto una domanda', firmato: 'Ha firmato',
  segnalato: 'Ha segnalato un problema', caricato: 'Ha mandato un file', richiesta: 'Ha aperto una richiesta', messaggio: 'Ha scritto un messaggio',
  uscito: 'Uscito', scaduta: 'Sessione scaduta', negato: 'Accesso negato', azienda: 'Ha cambiato azienda',
};
const MB = 1048576;

const dataBreve = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
const oraDi = ist => { const s = dataOraIso(ist); return s ? s.slice(11, 16) : ''; };
const mbIt = n => C.numeroIt(Math.round(numero(n) / MB * 10) / 10, 0, 1) + ' MB';

function jsonO(s, base) {
  if (vuoto(s)) return base;
  try { const v = JSON.parse(s); return v === null || v === undefined ? base : v; } catch (e) { return base; }
}

module.exports = {
  // ------------------------------------------------------------------ impostazioni e stato

  impPortale() {
    const imp = this.leggiImpostazioni();
    const n = (k, base) => { const v = Math.round(numero(imp[k])); return v > 0 ? v : base; };
    let tipi = Array.isArray(imp.PORTALE_TIPI_FILE) ? imp.PORTALE_TIPI_FILE.map(t => testo(t).toLowerCase()) : jsonO(imp.PORTALE_TIPI_FILE, null);
    const ammessi = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'dwg', 'dxf', 'docx', 'xlsx'];
    // Si puo' solo togliere: un tipo fuori dall'elenco non vale mai.
    tipi = (Array.isArray(tipi) ? tipi : ammessi).filter(t => ammessi.indexOf(t) >= 0);
    return {
      imp,
      attivo: imp.PORTALE_ATTIVO === true || imp.PORTALE_ATTIVO === 'true',
      indirizzo: testo(imp.PORTALE_INDIRIZZO).replace(/\/+$/, ''),
      linkMinuti: n('PORTALE_LINK_MINUTI', 10), linkAvvisoOre: n('PORTALE_LINK_AVVISO_ORE', 72), codiceTentativi: n('PORTALE_CODICE_TENTATIVI', 5),
      sessioneMinuti: n('PORTALE_SESSIONE_MINUTI', 30), sessioneOre: n('PORTALE_SESSIONE_ORE', 8), fileMaxMb: n('PORTALE_FILE_MAX_MB', 20),
      fileGiorno: n('PORTALE_FILE_GIORNO', 20), tipiFile: tipi, richiesteGiorno: n('PORTALE_RICHIESTE_GIORNO', 10),
      emailRiserva: n('PORTALE_EMAIL_RISERVA', 20), emailMax: n('PORTALE_EMAIL_MAX_GIORNO', 40), avvisiMinuti: n('PORTALE_AVVISI_MINUTI', 10),
      accessiMesi: n('PORTALE_ACCESSI_MESI', 12), inattiviMesi: n('PORTALE_INATTIVI_MESI', 12),
      informativa: testo(imp.PORTALE_INFORMATIVA), informativaData: testo(imp.PORTALE_INFORMATIVA_DATA),
      studio: {
        nome: testo(imp.RAGIONE_SOCIALE) || 'Studio Tecnico GM', telefono: testo(imp.TELEFONO), email: testo(imp.EMAIL),
        indirizzo: testo(imp.INDIRIZZO), partitaIva: testo(imp.PARTITA_IVA),
      },
    };
  },

  /**
   * Il segreto del portale (§5.1): 32 byte casuali in <dati>/portale-segreto (permessi 600), mai nel database, nel
   * foglio o nel registro. Firma le chiavi dei file e fa l'HMAC dei codici. Se si perde se ne fa uno nuovo.
   */
  portaleSegreto() {
    if (this._segretoPortale) return this._segretoPortale;
    const f = path.join(this.dati, 'portale-segreto');
    let s = null;
    try {
      const t = fs.readFileSync(f);
      if (t.length >= 32) s = t;
    } catch (e) { /* non c'e': si crea */ }
    if (!s) {
      s = crypto.randomBytes(32);
      fs.writeFileSync(f, s, { mode: 0o600 });
      try { fs.chmodSync(f, 0o600); } catch (e) { /* Windows */ }
    }
    this._segretoPortale = s;
    return s;
  },

  /** Lo stato del portale per lo studio (§0.5): {attivo, indirizzo, collegato, controllatoIl, script, emailRimaste}. */
  statoPortaleStudio() {
    const p = this.impPortale();
    const g = this.portaPortale;
    let script = 'non collegato';
    if (g && g.configurata && g.configurata()) {
      script = g.ultimoContatto && Date.now() - g.ultimoContatto < 120000 ? 'attivo' : 'non risponde';
    } else if (this.prova && this.portaleLocale) script = 'attivo';
    const c = this.controlloPortale || {};
    let collegato = 'non_collegato';
    if (p.indirizzo) collegato = script === 'attivo' && (c.falliti || 0) < 2 ? 'si' : 'no';
    return {
      attivo: p.attivo, indirizzo: p.indirizzo, collegato, controllatoIl: c.quando ? dataOraIso(c.quando) : '', script,
      emailRimaste: this.quotaPostino && this.quotaPostino.giorno === oggi() ? this.quotaPostino.rimaste : null,
    };
  },

  /** Le azioni che scrivono: nonCollegato senza indirizzo, spento con PORTALE_ATTIVO falso (§10). */
  controllaPortaleScrive() {
    const p = this.impPortale();
    if (!p.indirizzo) throw new Rifiuto('Il portale non è collegato: manca l\'indirizzo', { nonCollegato: true });
    if (!p.attivo) throw new Rifiuto('Il portale è spento', { spento: true });
    return p;
  },

  // ------------------------------------------------------------------ referenti

  regolePortale(s) {
    const r = jsonO(s && s.portale_regole, null);
    return Object.assign({}, REGOLE_BASE, r && typeof r === 'object' ? r : {});
  },

  /** I permessi del referente nel portale (di base tutto a 2 tranne le fatture; un privato vede le fatture). */
  permessiReferente(r) {
    const p = jsonO(r && r.portale_permessi, null);
    const o = Object.assign({}, PERMESSI_BASE, p && typeof p === 'object' ? p : {});
    for (const k of Object.keys(PERMESSI_BASE)) o[k] = Math.max(0, Math.min(k === 'fatture' ? 1 : 2, Math.round(numero(o[k]))));
    for (const k of Object.keys(o)) if (!(k in PERMESSI_BASE)) delete o[k];
    return o;
  },

  /** Le sedi del referente: null = tutte, o la lista degli id. */
  sediReferente(r) {
    const s = jsonO(r && r.portale_sedi, null);
    return Array.isArray(s) ? s.map(Number).filter(n => n > 0) : null;
  },

  statoReferente(r) {
    if (r.portale === 1) return r.portale_dal ? 'Attivo' : 'Invitato';
    return r.portale_tolto_il ? 'Tolto' : 'Senza accesso';
  },

  /** Il referente come lo leggono le anagrafiche e le comunicazioni (con statoPortale solo a chi vede il portale). */
  referentePubblico(r) {
    const o = {
      id: r.id, idSoggetto: r.soggetto_id, nome: r.nome, ruolo: r.ruolo, email: r.email, telefono: r.telefono, note: r.note, ordine: r.ordine,
      portale: r.portale === 1, pagamenti: r.pagamenti === 1, whatsapp: r.whatsapp || '', whatsappOk: r.whatsapp_ok === 1,
    };
    if (this.livello('portale') >= 1) o.statoPortale = this.statoReferente(r);
    return o;
  },

  /** Il referente nella pagina "Cliente nel portale" (§10.1). */
  referentePortale(r) {
    return {
      id: r.id, nome: r.nome, ruolo: r.ruolo, email: r.email, telefono: r.telefono, portale: r.portale === 1, statoVisto: this.statoReferente(r),
      permessi: this.permessiReferente(r), sedi: this.sediReferente(r), avvisiEmail: r.avvisi_email === 1, ultimoAccesso: dataOraIso(r.ultimo_accesso),
      invitatoIl: dataOraIso(r.portale_invitato_il), pagamenti: r.pagamenti === 1, whatsappOk: r.whatsapp_ok === 1,
    };
  },

  rigaReferente(id) {
    const r = this.db.riga('SELECT * FROM referenti WHERE id = ?', Number(id) || 0);
    if (!r) throw new Rifiuto('Referente ' + testo(id) + ' non trovato');
    return r;
  },

  rigaCliente(id) {
    const s = this.db.riga('SELECT * FROM soggetti WHERE id = ?', testo(id));
    if (!s) throw new Rifiuto('Cliente ' + testo(id) + ' non trovato');
    return s;
  },

  // ------------------------------------------------------------------ sessioni e link

  /** Chiude le sessioni aperte che rispondono alla condizione (motivo di §5.4). */
  chiudiSessioniPortale(dove, par, motivo) {
    const r = this.db.esegui('UPDATE portale_sessioni SET chiusa_il = ?, motivo_chiusura = ? WHERE chiusa_il IS NULL AND (' + dove + ')', adesso(), motivo, ...par);
    return Number(r.changes) || 0;
  },

  annullaLinkPortale(dove, par) {
    this.db.esegui('UPDATE portale_link SET annullato_il = ? WHERE usato_il IS NULL AND annullato_il IS NULL AND (' + dove + ')', adesso(), ...par);
  },

  /**
   * Un link nuovo (§3.4): token di 32 byte (nel database lo SHA-256), con il codice di 6 cifre se e' un link d'accesso
   * (HMAC col segreto del portale) legato alla pre-sessione (SHA-256 di "pre"). Torna {id, token, codice?}.
   */
  creaLinkPortale(idReferente, tipo, o) {
    o = o || {};
    const token = crypto.randomBytes(32).toString('base64url');
    const ora = adessoMs();
    const v = {
      referente_id: idReferente, tipo, token_hash: sha256(token), destinazione: testo(o.destinazione).slice(0, 120), creato: istante(new Date(ora)),
      scade: istante(new Date(ora + (o.minuti || 10) * 60000)), tentativi: 0, ip: '', anteprima_utente_id: o.anteprimaUtente || null,
    };
    let codice;
    if (tipo === 'accesso') {
      codice = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      v.codice_hash = this.hmacCodice(idReferente, codice);
      v.pre_hash = o.pre ? sha256(String(o.pre)) : null;
    }
    const id = Number(this.db.esegui('INSERT INTO portale_link (' + Object.keys(v).join(', ') + ') VALUES (' + Object.keys(v).map(k => '@' + k).join(', ') + ')', v).lastInsertRowid);
    return { id, token, codice };
  },

  hmacCodice(idReferente, codice) {
    return crypto.createHmac('sha256', this.portaleSegreto()).update('codice:' + idReferente + ':' + codice).digest('hex');
  },

  /** Il link per il cliente: {PORTALE_INDIRIZZO}/#/entra/<token> (§0.4). */
  indirizzoLink(token) {
    return this.impPortale().indirizzo + '/#/entra/' + token;
  },

  /** Una riga del registro degli accessi del portale (mai token, codici, email di chi non ha l'accesso). */
  accessoPortale(v) {
    const r = Object.assign({ quando: adesso(), referente_id: null, soggetto_id: '', sessione_id: null, azione: 'visto', oggetto: '', esito: 'ok', ip: '', agente: '' }, v);
    r.oggetto = testo(r.oggetto).slice(0, 160);
    r.agente = testo(r.agente).slice(0, 40);
    this.db.esegui('INSERT INTO portale_accessi (quando, referente_id, soggetto_id, sessione_id, azione, oggetto, esito, ip, agente) VALUES (?,?,?,?,?,?,?,?,?)',
      r.quando, r.referente_id, r.soggetto_id || '', r.sessione_id, r.azione, r.oggetto, r.esito, '', r.agente);
  },

  // ------------------------------------------------------------------ le cose pubblicate

  /**
   * Cosa e' una cosa da pubblicare: {soggettoId, sedeId, mostrabile, bozza, titolo, etichetta, versioneId, fileId, errore}.
   * mostrabile = e' in uno stato che il cliente puo' vedere (§8.1); errore = la frase se non si puo' pubblicare.
   */
  infoOggetto(tipo, rif, daFirmare) {
    const no = (errore, extra) => Object.assign({ soggettoId: '', sedeId: null, mostrabile: false, errore }, extra || {});
    if (tipo === 'preventivo') {
      const r = this.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(rif) || 0);
      if (!r || r.modello === 1) return no('Preventivo ' + rif + ' non trovato');
      const et = r.numero + (r.revisione ? ' rev. ' + r.revisione : '');
      const base = { soggettoId: r.cliente_id, sedeId: r.sede_id, titolo: 'Preventivo ' + et, etichetta: et, modificato: r.modificato };
      if (r.stato === 'BOZZA') return Object.assign(base, { mostrabile: false, bozza: true, errore: 'Il preventivo ' + et + ' è in bozza: si pubblica quando lo mandi' });
      if (r.stato === 'SOSTITUITO') return Object.assign(base, { mostrabile: false, errore: 'Il preventivo ' + et + ' è sostituito da una revisione nuova' });
      return Object.assign(base, { mostrabile: ['INVIATO', 'ACCETTATO', 'RIFIUTATO'].indexOf(r.stato) >= 0 });
    }
    if (tipo === 'contratto') {
      const r = this.db.riga('SELECT * FROM contratti WHERE id = ?', Number(rif) || 0);
      if (!r) return no('Contratto ' + rif + ' non trovato');
      const base = { soggettoId: r.cliente_id, sedeId: null, titolo: 'Contratto ' + r.numero, etichetta: r.numero };
      if (r.stato === 'bozza') return Object.assign(base, { mostrabile: false, bozza: true, errore: 'Il contratto ' + r.numero + ' è in bozza: si pubblica quando lo attivi' });
      return Object.assign(base, { mostrabile: true, fileId: r.documento_id ? this.fileValidoDocumento(r.documento_id) : null });
    }
    if (tipo === 'rapportino') {
      const r = this.db.riga('SELECT * FROM rapportini WHERE id = ?', testo(rif));
      if (!r) return no('Rapportino ' + rif + ' non trovato');
      const st = testo(r.stato).toUpperCase() || 'BOZZA';
      let sede = null;
      if (r.ticket_id) sede = (this.db.riga('SELECT sede_id FROM ticket WHERE id = ?', r.ticket_id) || {}).sede_id || null;
      if (!sede && r.id_commessa) sede = (this.db.riga('SELECT sede_id FROM commesse WHERE id = ?', r.id_commessa) || {}).sede_id || null;
      const base = { soggettoId: r.id_cliente, sedeId: sede, titolo: 'Rapportino del ' + K.dataIt(dataIso(r.data)), etichetta: r.id, modificato: r.modificato };
      if (st === 'ANNULLATO') return Object.assign(base, { mostrabile: false, errore: 'Il rapportino ' + r.id + ' è annullato' });
      if (st === 'BOZZA') return Object.assign(base, { mostrabile: !!daFirmare, bozza: !daFirmare, errore: daFirmare ? '' : 'Il rapportino ' + r.id + ' è da firmare: pubblicalo con «Da firmare nel portale»' });
      return Object.assign(base, { mostrabile: true });
    }
    if (tipo === 'fattura') {
      const r = this.db.riga('SELECT * FROM fatture WHERE id = ?', Number(rif) || 0);
      if (!r) return no('Fattura ' + rif + ' non trovata');
      const n = r.numero || r.riferimento;
      const base = { soggettoId: r.cliente_id, sedeId: null, titolo: (r.tipo === 'nota' ? 'Nota di credito ' : 'Fattura ') + n, etichetta: n };
      if (['emessa', 'annullata'].indexOf(r.stato) < 0) return Object.assign(base, { mostrabile: false, bozza: true, errore: 'La fattura ' + n + ' non è ancora emessa: si pubblica quando torna l\'XML' });
      return Object.assign(base, { mostrabile: true, fileId: r.copia_file_id || null });
    }
    if (tipo === 'documento') {
      const d = this.db.riga('SELECT * FROM documenti WHERE id = ?', Number(rif) || 0);
      if (!d) return no('Documento ' + rif + ' non trovato');
      const base = { soggettoId: d.cliente_id || '', sedeId: d.sede_id, titolo: d.titolo, etichetta: d.titolo, versioneId: d.versione_valida_id };
      if (d.origine === 'collegamento') return Object.assign(base, { mostrabile: false, errore: 'Un collegamento a OneDrive non va nel portale: carica il file o condividilo da OneDrive' });
      if (d.vede === 'riservati' || d.persona_id || d.veicolo_id || d.attrezzatura_id || d.incarico_id) return Object.assign(base, { mostrabile: false, errore: 'Il documento è riservato: non va nel portale' });
      if (d.archiviato) return Object.assign(base, { mostrabile: false, errore: 'Il documento è archiviato' });
      if (!d.versione_valida_id) return Object.assign(base, { mostrabile: false, bozza: true, errore: 'Il documento non ha ancora una revisione approvata' });
      // Il cliente del documento: il suo, o quello della commessa, dell'impianto, del ticket (tutti devono tornare).
      const clienti = new Set([d.cliente_id || '']);
      if (d.commessa_id) clienti.add((this.db.riga('SELECT cliente_id FROM commesse WHERE id = ?', d.commessa_id) || {}).cliente_id || '');
      if (d.sede_id) clienti.add((this.db.riga('SELECT soggetto_id FROM sedi WHERE id = ?', d.sede_id) || {}).soggetto_id || '');
      if (d.ticket_id) clienti.add((this.db.riga('SELECT cliente_id FROM ticket WHERE id = ?', d.ticket_id) || {}).cliente_id || '');
      clienti.delete('');
      return Object.assign(base, { mostrabile: true, clienti: Array.from(clienti), fileId: this.fileValidoDocumento(d.id) });
    }
    if (tipo === 'ticket') {
      const t = this.db.riga('SELECT * FROM ticket WHERE id = ?', Number(rif) || 0);
      if (!t) return no('Ticket ' + rif + ' non trovato');
      return { soggettoId: t.cliente_id, sedeId: t.sede_id, mostrabile: t.portale_visibile === 1 || t.origine === 'portale', titolo: 'Richiesta ' + t.numero, etichetta: t.numero,
        errore: t.portale_visibile === 1 || t.origine === 'portale' ? '' : 'La richiesta non è nel portale: mostrala prima' };
    }
    return no('Tipo: preventivo, contratto, rapportino, fattura, documento o ticket');
  },

  fileValidoDocumento(idDocumento) {
    const d = this.db.riga('SELECT versione_valida_id FROM documenti WHERE id = ?', idDocumento);
    const v = d && d.versione_valida_id ? this.db.riga('SELECT file_id FROM documento_versioni WHERE id = ?', d.versione_valida_id) : null;
    return v ? v.file_id : null;
  },

  /** "il preventivo PR/2026/012 rev. 1" (lungo, minuscolo) o "Preventivo PR/2026/012 rev. 1". */
  descrizionePubblicazione(p, minuscolo) {
    const i = this.infoOggetto(p.tipo, p.rif, true);
    const t = i.titolo || NOMI_TIPI[p.tipo] + ' ' + p.rif;
    if (!minuscolo) return t;
    return p.tipo === 'documento' ? 'il documento ' + t : p.tipo === 'fattura' ? 'la ' + t.charAt(0).toLowerCase() + t.slice(1)
      : p.tipo === 'ticket' ? 'la ' + t.charAt(0).toLowerCase() + t.slice(1) : 'il ' + t.charAt(0).toLowerCase() + t.slice(1);
  },

  /**
   * Una pubblicazione (§5.4): una riga aperta per cliente, tipo e cosa. Se c'e' gia' torna quella (una ripetizione
   * della coda non fa doppioni). Il server ricontrolla sempre che la cosa sia di quel cliente.
   */
  pubblicaInterna(o) {
    const info = this.infoOggetto(o.tipo, o.rif, o.daFirmare);
    if (info.errore && !info.mostrabile) throw new Rifiuto(info.errore);
    const soggetto = testo(o.soggetto || info.soggettoId);
    if (!soggetto) throw new Rifiuto('A quale cliente? Scegli il cliente');
    const nomeS = (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', soggetto) || {}).nome || soggetto;
    if (o.tipo === 'documento') {
      if (info.clienti.length && info.clienti.some(c => c !== soggetto)) {
        const altro = info.clienti.find(c => c !== soggetto);
        throw new Rifiuto('Il documento è di ' + ((this.db.riga('SELECT nome FROM soggetti WHERE id = ?', altro) || {}).nome || altro) + ', non di ' + nomeS);
      }
    } else if (info.soggettoId !== soggetto) {
      throw new Rifiuto(info.titolo + ' è di ' + ((this.db.riga('SELECT nome FROM soggetti WHERE id = ?', info.soggettoId) || {}).nome || info.soggettoId) + ', non di ' + nomeS);
    }
    const gia = this.db.riga('SELECT * FROM portale_pubblicazioni WHERE soggetto_id = ? AND tipo = ? AND rif = ? AND tolta_il IS NULL', soggetto, o.tipo, String(o.rif));
    if (gia) {
      if (o.tipo === 'rapportino' && !!o.daFirmare !== (gia.da_firmare === 1)) this.aggiorna('portale_pubblicazioni', gia.id, { da_firmare: o.daFirmare ? 1 : 0 });
      return this.db.riga('SELECT * FROM portale_pubblicazioni WHERE id = ?', gia.id);
    }
    const c = this.chi();
    const ora = adesso();
    const senzaAvviso = o.senzaAvviso || (o.tipo === 'rapportino' && !o.daFirmare) || (o.tipo === 'ticket');
    const id = this.inserisci('portale_pubblicazioni', {
      soggetto_id: soggetto, tipo: o.tipo, rif: String(o.rif), versione_id: info.versioneId || null, sede_id: info.sedeId || null,
      da_firmare: o.daFirmare ? 1 : 0, file_id: o.fileId || info.fileId || null, origine: o.origine === 'regola' ? 'regola' : 'mano',
      pubblicata_da: o.origine === 'regola' ? null : (c.utente ? c.utente.id : null), pubblicata_il: ora, avviso_da: senzaAvviso ? null : ora,
      senza_avviso: senzaAvviso ? 1 : 0,
    }, 'id', 'pubblicato nel portale');
    return this.db.riga('SELECT * FROM portale_pubblicazioni WHERE id = ?', id);
  },

  /**
   * La regola del cliente (§8.1): pubblica da sola nella stessa transazione del cambio, solo se il cliente ha il portale
   * acceso e la regola e' accesa. Non ferma mai l'azione dello studio (un errore qui finisce nel log).
   */
  pubblicaConRegola(tipo, rif, extra) {
    try {
      const info = this.infoOggetto(tipo, rif, extra && extra.daFirmare);
      if (!info.soggettoId) return null;
      const s = this.db.riga('SELECT * FROM soggetti WHERE id = ?', info.soggettoId);
      if (!s || s.portale !== 1) return null;
      const r = this.regolePortale(s);
      const accesa = tipo === 'preventivo' ? r.preventivi : tipo === 'contratto' ? r.contratti : tipo === 'fattura' ? r.fatture
        : tipo === 'rapportino' ? (extra && extra.daFirmare ? r.rapportiniDaFirmare : r.rapportiniFirmati)
          : tipo === 'ticket' ? (extra && extra.dalPortale) || r.richieste === 'tutte' : false;
      if (!accesa || !info.mostrabile) return null;
      return this.pubblicaInterna(Object.assign({ tipo, rif, soggetto: s.id, origine: 'regola' }, extra || {}));
    } catch (err) {
      console.error('[portale] regola ' + tipo + ' ' + rif + ': ' + (err && err.message ? err.message : err));
      return null;
    }
  },

  /** Chiude le pubblicazioni aperte di una cosa (sostituito, annullato, mano, portale spento). */
  chiudiPubblicazioni(tipo, rif, motivo) {
    const c = this.chi();
    for (const p of this.db.righe('SELECT * FROM portale_pubblicazioni WHERE tipo = ? AND rif = ? AND tolta_il IS NULL', tipo, String(rif))) {
      this.aggiorna('portale_pubblicazioni', p.id, { tolta_il: adesso(), tolta_da: c.utente ? c.utente.id : null, motivo_tolta: motivo }, 'id', 'tolto dal portale: ' + motivo);
    }
  },

  /** Una cosa pubblicata, come la vedono le pagine dello studio. */
  pubblicazioneStudio(p, aiuti) {
    const a = aiuti || {};
    const vistoDa = p.visto_da ? ((a.referenti && a.referenti[p.visto_da]) || (this.db.riga('SELECT nome FROM referenti WHERE id = ?', p.visto_da) || {}).nome || '') : '';
    return {
      id: p.id, tipo: p.tipo, rif: p.rif, titolo: this.descrizionePubblicazione(p), pubblicataIl: dataOraIso(p.pubblicata_il), origine: p.origine,
      vistoIl: dataOraIso(p.visto_il), vistoDa, daFirmare: p.da_firmare === 1, idCliente: p.soggetto_id,
      cliente: (a.clienti && a.clienti[p.soggetto_id]) || (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', p.soggetto_id) || {}).nome || '',
      toltaIl: dataOraIso(p.tolta_il), motivoTolta: p.motivo_tolta,
    };
  },

  /** {pubblicato, vistoIl, vistoDa, daFirmare} per la pagina della cosa nello studio (preventivo, rapportino, documento, fattura). */
  portaleDi(tipo, rif) {
    const p = this.db.riga('SELECT * FROM portale_pubblicazioni WHERE tipo = ? AND rif = ? AND tolta_il IS NULL ORDER BY id DESC LIMIT 1', tipo, String(rif));
    if (!p) return { pubblicato: false, vistoIl: '', vistoDa: '', daFirmare: false, pubblicazione: null };
    const ref = p.visto_da ? this.db.riga('SELECT nome FROM referenti WHERE id = ?', p.visto_da) : null;
    return { pubblicato: true, vistoIl: dataOraIso(p.visto_il), vistoDa: ref ? ref.nome : '', daFirmare: p.da_firmare === 1, pubblicazione: p.id };
  },

  /** I referenti che vedranno questa pubblicazione (permesso >= 1 del suo tipo e sede tra le sue). */
  referentiCheVedono(soggettoId, tipo, sedeId) {
    return this.db.righe('SELECT * FROM referenti WHERE soggetto_id = ? AND portale = 1 ORDER BY ordine, id', soggettoId).filter(r => {
      if ((this.permessiReferente(r)[PERMESSO_DI[tipo]] || 0) < 1) return false;
      const sedi = this.sediReferente(r);
      return !sedi || !sedeId || sedi.indexOf(Number(sedeId)) >= 0;
    });
  },

  // ------------------------------------------------------------------ Da guardare e notifiche

  daGuardare(tipo, rif, soggettoId, referenteId, titolo, dettaglio) {
    return this.inserisci('portale_da_guardare', {
      tipo, rif: String(rif), soggetto_id: soggettoId || '', referente_id: referenteId || null, titolo: testo(titolo).slice(0, 200), dettaglio: testo(dettaglio).slice(0, 300), creato: adesso(),
    });
  },

  /** Le righe aperte di Da guardare di quel tipo e cosa si chiudono (la cosa e' fatta: §10.1). */
  chiudiDaGuardare(tipi, rif) {
    const c = this.chi();
    const lista = Array.isArray(tipi) ? tipi : [tipi];
    for (const r of this.db.righe('SELECT id FROM portale_da_guardare WHERE visto_il IS NULL AND rif = ? AND tipo IN (' + lista.map(() => '?').join(',') + ')', String(rif), ...lista)) {
      this.aggiorna('portale_da_guardare', r.id, { visto_il: adesso(), visto_da: c.utente ? c.utente.id : null });
    }
  },

  // ------------------------------------------------------------------ le email del portale e la quota del postino

  /** Il postino risponde "rimaste": il server tiene l'ultimo valore e il giorno (§3.12). */
  segnaQuotaPostino(r) {
    if (r && r.rimaste !== undefined && r.rimaste !== null && !isNaN(Number(r.rimaste))) this.quotaPostino = { giorno: oggi(), rimaste: Number(r.rimaste) };
  },

  /** Quante email ha mandato oggi il portale. */
  emailPortaleOggi() {
    return this.db.riga("SELECT COUNT(*) n FROM portale_tentativi WHERE chiave = 'email_portale' AND substr(quando, 1, 10) = ?", oggi()).n;
  },

  /**
   * Si puo' mandare un'email del portale di questa importanza (1 accessi, 2 conferme, 3 avvisi, 4 inviti)? Le 1 e 2
   * partono se rimaste > 10, le 3 e 4 se rimaste > PORTALE_EMAIL_RISERVA; mai oltre PORTALE_EMAIL_MAX_GIORNO al giorno.
   */
  emailPortalePuo(importanza) {
    const p = this.impPortale();
    if (this.emailPortaleOggi() >= p.emailMax) return false;
    const q = this.quotaPostino && this.quotaPostino.giorno === oggi() ? this.quotaPostino.rimaste : null;
    if (q === null) return true;
    return importanza <= 2 ? q > 10 : q > p.emailRiserva;
  },

  /** Manda un'email del portale (testi di §9.6): mittente lo studio, rispondiA l'email dello studio. Torna true/false. */
  async mandaEmailPortale(a, oggetto, testoEmail, importanza) {
    if (!this.postino || !this.postino.configurato()) throw new Rifiuto('Le email non sono collegate: manca il postino (WISPER_POSTINO_URL nel .env del server)');
    if (!this.emailPortalePuo(importanza)) return false;
    const p = this.impPortale();
    const posta = { a, nome: p.studio.nome, oggetto, messaggio: testoEmail };
    if (p.studio.email) posta.rispondiA = p.studio.email;
    const r = await this.postino.email(posta);
    this.segnaQuotaPostino(r);
    this.db.esegui("INSERT INTO portale_tentativi (chiave, quando, tipo) VALUES ('email_portale', ?, ?)", adesso(), 'email');
    return true;
  },

  // ------------------------------------------------------------------ azioni di §10.1

  /** portale {}: lo stato, i conteggi, le righe aperte di Da guardare. */
  portaleStato() {
    const stato = this.statoPortaleStudio();
    const t = oggi();
    const daGuardare = this.db.righe('SELECT * FROM portale_da_guardare WHERE visto_il IS NULL ORDER BY creato DESC, id DESC');
    return {
      ok: true, stato,
      conteggi: {
        daGuardare: daGuardare.length,
        clienti: this.db.riga('SELECT COUNT(*) n FROM soggetti WHERE portale = 1').n,
        referenti: this.db.riga('SELECT COUNT(*) n FROM referenti WHERE portale = 1').n,
        pubblicati: this.db.riga('SELECT COUNT(*) n FROM portale_pubblicazioni WHERE tolta_il IS NULL').n,
        accessiOggi: this.db.riga("SELECT COUNT(*) n FROM portale_accessi WHERE azione = 'entrato' AND substr(quando, 1, 10) = ?", t).n,
      },
      daGuardare: daGuardare.map(r => this.rigaDaGuardare(r)),
    };
  },

  rigaDaGuardare(r) {
    let collegamento = null;
    if (r.tipo === 'richiesta' || r.tipo === 'messaggio') collegamento = { pagina: 'ticket', id: Number(r.rif) };
    else if (r.tipo === 'accettato' || r.tipo === 'rifiutato' || r.tipo === 'domanda') collegamento = { pagina: 'preventivo', id: Number(r.rif) };
    else if (r.tipo === 'firmato' || r.tipo === 'segnalato') collegamento = { pagina: 'rapportino', id: r.rif };
    else if (r.tipo === 'caricamento') collegamento = { pagina: 'caricamento', id: Number(r.rif) };
    return { id: r.id, tipo: r.tipo, titolo: r.titolo, dettaglio: r.dettaglio, quando: dataOraIso(r.creato), collegamento };
  },

  segnaVistoPortale(d) {
    const r = this.db.riga('SELECT * FROM portale_da_guardare WHERE id = ?', Number(d.id) || 0);
    if (!r) throw new Rifiuto('Riga ' + testo(d.id) + ' non trovata');
    if (!r.visto_il) this.aggiorna('portale_da_guardare', r.id, { visto_il: adesso(), visto_da: this.mioId() });
    return { ok: true };
  },

  portaleCliente(d) {
    const s = this.rigaCliente(d.idCliente);
    const referenti = this.db.righe('SELECT * FROM referenti WHERE soggetto_id = ? ORDER BY ordine, id', s.id);
    const pubblicati = this.db.righe('SELECT * FROM portale_pubblicazioni WHERE soggetto_id = ? AND tolta_il IS NULL ORDER BY pubblicata_il DESC, id DESC', s.id);
    const caricamenti = this.db.righe("SELECT * FROM portale_caricamenti WHERE soggetto_id = ? AND stato <> 'caricato' ORDER BY creato DESC, id DESC LIMIT 50", s.id);
    const accessi = this.db.righe('SELECT * FROM portale_accessi WHERE soggetto_id = ? ORDER BY quando DESC, id DESC LIMIT 20', s.id);
    const nomi = {};
    referenti.forEach(r => { nomi[r.id] = r.nome; });
    return {
      ok: true,
      cliente: { id: s.id, nome: s.nome, portale: s.portale === 1, importi: s.portale_importi === 1, regole: this.regolePortale(s) },
      referenti: referenti.map(r => this.referentePortale(r)),
      pubblicati: pubblicati.map(p => {
        const x = this.pubblicazioneStudio(p, { referenti: nomi, clienti: { [s.id]: s.nome } });
        return { id: x.id, tipo: x.tipo, titolo: x.titolo, pubblicataIl: x.pubblicataIl, origine: x.origine, vistoIl: x.vistoIl, vistoDa: x.vistoDa, daFirmare: x.daFirmare };
      }),
      // Le stesse righe di caricamentiPortale (con file, nota, idCliente...).
      caricamenti: caricamenti.map(c => this.caricamentoStudio(c)),
      accessi: accessi.map(a => this.rigaAccessoStudio(a, nomi)),
    };
  },

  rigaAccessoStudio(a, nomi) {
    const ref = a.referente_id ? (nomi && nomi[a.referente_id]) || (this.db.riga('SELECT nome FROM referenti WHERE id = ?', a.referente_id) || {}).nome || '' : '';
    return { quando: dataOraIso(a.quando), referente: ref, frase: FRASI_ACCESSO[a.azione] + (a.oggetto && ['visto', 'scaricato', 'accettato', 'rifiutato', 'firmato', 'domanda', 'segnalato', 'caricato', 'richiesta', 'messaggio'].indexOf(a.azione) >= 0 ? ' ' + a.oggetto : ''),
      dispositivo: a.agente, ip: a.ip };
  },

  salvaPortaleCliente(d) {
    const s = this.rigaCliente(d.idCliente);
    const v = {};
    if (d.portale !== undefined) v.portale = si(d.portale) ? 1 : 0;
    if (d.importi !== undefined) v.portale_importi = si(d.importi) ? 1 : 0;
    if (d.regole !== undefined) {
      const r = Object.assign({}, this.regolePortale(s));
      const x = d.regole && typeof d.regole === 'object' ? d.regole : {};
      for (const k of ['preventivi', 'contratti', 'rapportiniFirmati', 'rapportiniDaFirmare', 'fatture']) if (x[k] !== undefined) r[k] = si(x[k]);
      if (x.richieste !== undefined) {
        if (['portale', 'tutte'].indexOf(testo(x.richieste)) < 0) throw new Rifiuto('Richieste: solo dal portale o tutte');
        r.richieste = testo(x.richieste);
      }
      v.portale_regole = JSON.stringify(r);
    }
    const nota = v.portale === 1 && s.portale !== 1 ? 'portale acceso per il cliente' : v.portale === 0 && s.portale === 1 ? 'portale spento per il cliente' : '';
    if (Object.keys(v).length) this.aggiorna('soggetti', s.id, Object.assign(v, { modificato: adesso() }), 'id', nota);
    // Spegnere il portale di un cliente chiude le sessioni e annulla i link; le pubblicazioni restano.
    if (v.portale === 0 && s.portale === 1) {
      this.chiudiSessioniPortale('soggetto_id = ?', [s.id], 'spento');
      this.annullaLinkPortale('referente_id IN (SELECT id FROM referenti WHERE soggetto_id = ?)', [s.id]);
    }
    return this.portaleCliente({ idCliente: s.id });
  },

  /** I permessi mandati (0-2, fatture 0-1) sopra quelli di base. */
  permessiDa(x, base) {
    const o = Object.assign({}, base);
    if (x && typeof x === 'object') {
      for (const k of Object.keys(PERMESSI_BASE)) {
        if (x[k] === undefined) continue;
        const n = Math.round(numero(x[k]));
        if (!(n >= 0 && n <= (k === 'fatture' ? 1 : 2))) throw new Rifiuto(k === 'fatture' ? 'Fatture: 0 (niente) o 1 (vede)' : 'Permessi: 0, 1 o 2');
        o[k] = n;
      }
    }
    return o;
  },

  /** Le sedi mandate: null (tutte) o solo sedi e impianti di quel cliente. */
  sediDa(x, s) {
    if (x === undefined) return undefined;
    if (x === null || x === '' || (Array.isArray(x) && !x.length)) return null;
    if (!Array.isArray(x)) throw new Rifiuto('Sedi: tutte o un elenco di sedi');
    return x.map(id => {
      const sede = this.db.riga('SELECT id, soggetto_id FROM sedi WHERE id = ?', Number(id) || 0);
      if (!sede || sede.soggetto_id !== s.id) throw new Rifiuto('La sede ' + id + ' non è di ' + s.nome);
      return sede.id;
    });
  },

  /**
   * invitaReferente {idReferente? | idCliente?, permessi?, sedi?, manda?}: accende l'accesso (e il portale del cliente)
   * e manda l'invito per email con un link di 72 ore. Con idCliente senza idReferente (privato) crea il referente.
   */
  async invitaReferente(d) {
    const p = this.controllaPortaleScrive();
    const pronto = this.db.transazione(() => {
      let r;
      let s;
      if (!vuoto(d.idReferente)) {
        r = this.rigaReferente(d.idReferente);
        s = this.rigaCliente(r.soggetto_id);
      } else {
        s = this.rigaCliente(d.idCliente);
        r = this.db.riga('SELECT * FROM referenti WHERE soggetto_id = ? AND lower(email) = lower(?) AND email <> \'\'', s.id, testo(s.email));
        if (!r) {
          if (!testo(s.email)) throw new Rifiuto('Il referente non ha l\'email: scrivila prima');
          const id = this.inserisci('referenti', { soggetto_id: s.id, nome: s.nome, ruolo: 'Cliente privato', email: testo(s.email), telefono: testo(s.telefono),
            ordine: (this.db.riga('SELECT MAX(ordine) m FROM referenti WHERE soggetto_id = ?', s.id).m || 0) + 1 });
          r = this.rigaReferente(id);
        }
      }
      const email = testo(r.email);
      if (!email) throw new Rifiuto('Il referente non ha l\'email: scrivila prima');
      if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Rifiuto('Email: manca la @ o c\'è uno spazio');
      const doppio = this.db.riga('SELECT id FROM referenti WHERE soggetto_id = ? AND portale = 1 AND lower(email) = lower(?) AND id <> ?', s.id, email, r.id);
      if (doppio) throw new Rifiuto('Questa email è già di un altro referente di ' + s.nome);
      const privato = !testo(s.partita_iva) || r.ruolo === 'Cliente privato';
      const base = r.portale_permessi ? this.permessiReferente(r) : Object.assign({}, PERMESSI_BASE, privato ? { fatture: 1 } : {});
      const permessi = this.permessiDa(d.permessi, base);
      const sedi = this.sediDa(d.sedi, s);
      const v = { portale: 1, portale_permessi: JSON.stringify(permessi), portale_invitato_il: adesso(), portale_tolto_il: '' };
      if (sedi !== undefined) v.portale_sedi = sedi === null ? null : JSON.stringify(sedi);
      this.aggiorna('referenti', r.id, v, 'id', 'invito al portale per ' + email);
      if (s.portale !== 1) this.aggiorna('soggetti', s.id, { portale: 1, modificato: adesso() }, 'id', 'portale acceso per il cliente');
      // Rifarlo rimanda l'invito: il link di prima si annulla.
      this.annullaLinkPortale("referente_id = ? AND tipo = 'invito'", [r.id]);
      const manda = d.manda === undefined || si(d.manda);
      const link = manda ? this.creaLinkPortale(r.id, 'invito', { minuti: p.linkAvvisoOre * 60 }) : null;
      return { r: this.rigaReferente(r.id), s, link, email };
    });
    let esito = 'non mandata';
    if (pronto.link) {
      const testoEmail = 'Buongiorno ' + pronto.r.nome + ',\n' + p.studio.nome + ' le ha aperto il portale dove trovare preventivi, rapportini e documenti di ' + pronto.s.nome +
        ', e mandare richieste d\'intervento.\nPer entrare apra questo link (vale ' + p.linkAvvisoOre + ' ore e si usa una volta): ' + this.indirizzoLink(pronto.link.token) +
        '\nLe volte successive basta la sua email: le arriva un link nuovo.\n' + p.studio.nome + ' · ' + p.studio.telefono;
      const oggetto = p.studio.nome + ': il portale per i suoi documenti';
      let partita = false;
      try {
        partita = await this.mandaEmailPortale(pronto.email, oggetto, testoEmail, 4);
      } catch (err) {
        throw new Rifiuto('L\'invito non è partito: ' + err.message, err.rete ? { rete: true } : {});
      }
      esito = partita ? 'mandata' : 'domani';
      this.storicoEmail({ tipo: 'invito_portale', cliente_id: pronto.s.id, referente_id: pronto.r.id, a: pronto.email, oggetto, testo: '(invito con il link personale)', stato: partita ? 'mandato' : 'preparato' });
    }
    return { ok: true, referente: this.referentePortale(this.rigaReferente(pronto.r.id)), email: esito };
  },

  salvaAccessoReferente(d) {
    const r = this.rigaReferente(d.idReferente);
    const s = this.rigaCliente(r.soggetto_id);
    const v = {};
    if (d.permessi !== undefined) v.portale_permessi = JSON.stringify(this.permessiDa(d.permessi, this.permessiReferente(r)));
    const sedi = this.sediDa(d.sedi, s);
    if (sedi !== undefined) v.portale_sedi = sedi === null ? null : JSON.stringify(sedi);
    if (d.avvisiEmail !== undefined) v.avvisi_email = si(d.avvisiEmail) ? 1 : 0;
    if (Object.keys(v).length) this.aggiorna('referenti', r.id, v, 'id', 'accesso al portale cambiato');
    return { ok: true, referente: this.referentePortale(this.rigaReferente(r.id)) };
  },

  togliAccessoReferente(d) {
    const r = this.rigaReferente(d.idReferente);
    this.togliAccessoInterno(r, 'tolto');
    return { ok: true };
  },

  togliAccessoInterno(r, motivo) {
    if (r.portale === 1) this.aggiorna('referenti', r.id, { portale: 0, portale_tolto_il: adesso() }, 'id', 'accesso al portale tolto');
    this.chiudiSessioniPortale('referente_id = ?', [r.id], motivo || 'tolto');
    this.annullaLinkPortale('referente_id = ?', [r.id]);
  },

  /** pubblica {tipo, id, daFirmare?, allegato?, conferma?, idCliente?, senzaAvviso?} */
  pubblicaAzione(d) {
    this.controllaPortaleScrive();
    const tipo = testo(d.tipo);
    if (TIPI.indexOf(tipo) < 0) throw new Rifiuto('Tipo: preventivo, contratto, rapportino, fattura, documento o ticket');
    if (this.livello(MODULO_DI[tipo]) < 1 || (tipo === 'fattura' && !this.vedeCosti())) throw senzaPermesso('pubblicare questa cosa');
    const rif = tipo === 'ticket' ? String(this.rigaTicket(d.id).id) : testo(d.id);
    const info = this.infoOggetto(tipo, rif, si(d.daFirmare));
    const soggetto = testo(d.idCliente) || info.soggettoId;
    if (!soggetto) throw new Rifiuto('A quale cliente? Scegli il cliente');
    const s = this.rigaCliente(soggetto);
    if (s.portale !== 1) throw new Rifiuto(s.nome + ' non ha il portale acceso');
    const gia = this.db.riga('SELECT * FROM portale_pubblicazioni WHERE soggetto_id = ? AND tipo = ? AND rif = ? AND tolta_il IS NULL', s.id, tipo, rif);
    if (gia && !(tipo === 'rapportino' && (gia.da_firmare === 1) !== si(d.daFirmare))) {
      if (d.idRichiesta || d.ripetuta) return { ok: true, pubblicazione: this.pubblicazioneStudio(gia), vedranno: this.referentiCheVedono(s.id, tipo, gia.sede_id).map(r => r.nome) };
      throw new Rifiuto('È già nel portale');
    }
    if (info.errore && !info.mostrabile) throw new Rifiuto(info.errore);
    const vedranno = this.referentiCheVedono(s.id, tipo, info.sedeId);
    if (!vedranno.length && !si(d.conferma)) {
      const parola = { preventivo: 'i preventivi', contratto: 'i contratti', rapportino: 'i rapportini', fattura: 'le fatture', documento: 'i documenti', ticket: 'le richieste' }[tipo];
      return { ok: false, serveConferma: true, frase: 'Nessun referente di ' + s.nome + ' può vedere ' + parola, errore: 'Nessun referente di ' + s.nome + ' può vedere ' + parola };
    }
    let fileId = null;
    if (d.allegato) {
      if (tipo !== 'fattura') throw new Rifiuto('L\'allegato si mette solo alle fatture (la copia di cortesia)');
      fileId = this.salvaCopiaFattura(Number(rif), d.allegato);
    }
    if (tipo === 'ticket' && info.mostrabile === false) {
      this.aggiorna('ticket', Number(rif), { portale_visibile: 1, modificato: adesso() }, 'id', 'mostrato nel portale');
    }
    // prima: true = "Pubblica anche quelli di prima" (§8.1, §8.3): senza avviso per email.
    const p = this.pubblicaInterna({ tipo, rif, soggetto: s.id, daFirmare: si(d.daFirmare), origine: 'mano', fileId, senzaAvviso: si(d.prima) || si(d.senzaAvviso) });
    return { ok: true, pubblicazione: this.pubblicazioneStudio(p), vedranno: vedranno.map(r => r.nome) };
  },

  togliDalPortale(d) {
    const p = this.db.riga('SELECT * FROM portale_pubblicazioni WHERE id = ?', Number(d.id) || 0);
    if (!p) throw new Rifiuto('Pubblicazione ' + testo(d.id) + ' non trovata');
    if (this.livello(MODULO_DI[p.tipo]) < 1) throw senzaPermesso('togliere questa cosa dal portale');
    if (si(d.annulla)) {
      // L'avviso con Annulla: la riapre, se nel frattempo non ne e' nata un'altra.
      if (p.tolta_il && !this.db.riga('SELECT id FROM portale_pubblicazioni WHERE soggetto_id = ? AND tipo = ? AND rif = ? AND tolta_il IS NULL', p.soggetto_id, p.tipo, p.rif)) {
        this.aggiorna('portale_pubblicazioni', p.id, { tolta_il: null, tolta_da: null, motivo_tolta: '' }, 'id', 'di nuovo nel portale');
      }
      return { ok: true };
    }
    if (!p.tolta_il) this.aggiorna('portale_pubblicazioni', p.id, { tolta_il: adesso(), tolta_da: this.mioId(), motivo_tolta: 'mano' }, 'id', 'tolto dal portale: mano');
    return { ok: true };
  },

  /** pubblicaPrima {idCliente, tipo}: le cose degli ultimi 12 mesi da scegliere (poi pubblica senza avviso). */
  pubblicaPrima(d) {
    const s = this.rigaCliente(d.idCliente);
    const tipo = testo(d.tipo);
    if (TIPI.indexOf(tipo) < 0) throw new Rifiuto('Tipo: preventivo, contratto, rapportino, fattura, documento o ticket');
    const da = C.piuMesi(oggi(), -12);
    let righe = [];
    if (tipo === 'preventivo') righe = this.db.righe("SELECT id FROM preventivi WHERE cliente_id = ? AND stato IN ('INVIATO', 'ACCETTATO', 'RIFIUTATO') AND data >= ? AND modello = 0 ORDER BY data DESC", s.id, da).map(r => String(r.id));
    if (tipo === 'contratto') righe = this.db.righe("SELECT id FROM contratti WHERE cliente_id = ? AND stato <> 'bozza' ORDER BY dal DESC", s.id).map(r => String(r.id));
    if (tipo === 'rapportino') righe = this.db.righe("SELECT id FROM rapportini WHERE id_cliente = ? AND UPPER(stato) IN ('FIRMATO', 'INVIATO', 'FATTURATO') AND data >= ? ORDER BY data DESC", s.id, da).map(r => r.id);
    if (tipo === 'fattura') righe = this.db.righe("SELECT id FROM fatture WHERE cliente_id = ? AND stato IN ('emessa', 'annullata') AND data >= ? ORDER BY data DESC", s.id, da).map(r => String(r.id));
    if (tipo === 'documento') righe = this.db.righe('SELECT id FROM documenti WHERE cliente_id = ? AND archiviato IS NULL ORDER BY data_documento DESC', s.id).map(r => String(r.id));
    if (tipo === 'ticket') righe = this.db.righe('SELECT id FROM ticket WHERE cliente_id = ? AND aperto_il >= ? ORDER BY aperto_il DESC', s.id, da).map(r => String(r.id));
    const aperte = new Set(this.db.righe('SELECT rif FROM portale_pubblicazioni WHERE soggetto_id = ? AND tipo = ? AND tolta_il IS NULL', s.id, tipo).map(r => r.rif));
    const proposte = righe.filter(rif => !aperte.has(rif)).map(rif => {
      const i = this.infoOggetto(tipo, rif, false);
      return i.mostrabile || tipo === 'ticket' ? { tipo, id: tipo === 'rapportino' ? rif : Number(rif), titolo: i.titolo } : null;
    }).filter(Boolean);
    return { ok: true, proposte };
  },

  leggiPubblicati(d) {
    d = d || {};
    const cond = ['tolta_il IS NULL'];
    const par = [];
    if (testo(d.idCliente)) { cond.push('soggetto_id = ?'); par.push(testo(d.idCliente)); }
    if (testo(d.tipo)) { cond.push('tipo = ?'); par.push(testo(d.tipo)); }
    if (d.visto === false || d.visto === 'false' || d.visto === 'no') cond.push('visto_il IS NULL');
    else if (si(d.visto)) cond.push('visto_il IS NOT NULL');
    const righe = this.db.righe('SELECT * FROM portale_pubblicazioni WHERE ' + cond.join(' AND ') + ' ORDER BY pubblicata_il DESC, id DESC', ...par)
      .filter(p => p.tipo !== 'fattura' || this.vedeCosti());
    const pagina = Math.max(1, Math.round(numero(d.pagina)) || 1);
    const clienti = {};
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { clienti[s.id] = s.nome; });
    return { ok: true, pagina, pagine: Math.max(1, Math.ceil(righe.length / 100)), pubblicati: righe.slice((pagina - 1) * 100, pagina * 100).map(p => this.pubblicazioneStudio(p, { clienti })) };
  },

  caricamentiPortale(d) {
    d = d || {};
    const cond = ["stato <> 'caricato'"];
    const par = [];
    if (testo(d.stato)) { cond.push('stato = ?'); par.push(testo(d.stato)); }
    if (testo(d.idCliente)) { cond.push('soggetto_id = ?'); par.push(testo(d.idCliente)); }
    return {
      ok: true,
      caricamenti: this.db.righe('SELECT * FROM portale_caricamenti WHERE ' + cond.join(' AND ') + ' ORDER BY creato DESC, id DESC LIMIT 200', ...par).map(c => this.caricamentoStudio(c)),
    };
  },

  caricamentoStudio(c) {
    const ref = this.db.riga('SELECT nome FROM referenti WHERE id = ?', c.referente_id);
    const t = c.ticket_id ? this.db.riga('SELECT id, numero FROM ticket WHERE id = ?', c.ticket_id) : null;
    return {
      id: c.id, titolo: c.titolo, nome: c.nome_originale, byte: c.byte, referente: ref ? ref.nome : '', creato: dataOraIso(c.creato), stato: c.stato,
      idCliente: c.soggetto_id, cliente: (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', c.soggetto_id) || {}).nome || '',
      ticket: t ? { id: t.id, numero: t.numero } : null, nota: c.nota, per: c.per, idSede: c.sede_id, motivo: c.motivo,
      file: { id: c.file_id, url: '/file/' + c.file_id }, idDocumento: c.documento_id,
    };
  },

  rigaCaricamento(id) {
    const c = this.db.riga('SELECT * FROM portale_caricamenti WHERE id = ?', Number(id) || 0);
    if (!c || c.stato === 'caricato') throw new Rifiuto('File ' + testo(id) + ' non trovato');
    return c;
  },

  /** accettaCaricamento {id, titolo?, idCategoria, idCommessa?, idSede?, idTicket?} o {id, soloTicket: true}. */
  accettaCaricamento(d) {
    const c = this.rigaCaricamento(d.id);
    if (c.stato === 'accettato') return { ok: true, documento: c.documento_id ? this.documentoCompleto(this.rigaDocumento(c.documento_id)) : null };
    if (c.stato === 'rifiutato') throw new Rifiuto('Il file è già stato rifiutato');
    const ora = adesso();
    if (si(d.soloTicket)) {
      if (!c.ticket_id) throw new Rifiuto('Il file non è di una richiesta');
      this.aggiorna('portale_caricamenti', c.id, { stato: 'accettato', deciso_da: this.mioId(), deciso_il: ora }, 'id', 'file dal portale accettato');
      this.chiudiDaGuardare('caricamento', c.id);
      return { ok: true, documento: null };
    }
    const cat = this.db.riga('SELECT * FROM documento_categorie WHERE id = ?', Number(d.idCategoria) || 0);
    if (!cat) throw new Rifiuto('Categoria: scegli dove archiviarlo');
    if (cat.vede === 'riservati') throw new Rifiuto('Un file dal portale non va in una categoria riservata');
    const legami = this.legamiDocumento({ idCliente: c.soggetto_id, idCommessa: testo(d.idCommessa) || '', idSede: vuoto(d.idSede) ? (c.sede_id || '') : Number(d.idSede),
      idTicket: vuoto(d.idTicket) ? (c.ticket_id || '') : d.idTicket }, null);
    if (legami.cliente_id && legami.cliente_id !== c.soggetto_id) throw new Rifiuto('Il file è di un altro cliente');
    const f = this.db.riga('SELECT * FROM file WHERE id = ?', c.file_id);
    if (!f || f.cestinato) throw new Rifiuto('Il file non c\'è più');
    const idDoc = this.inserisci('documenti', Object.assign({
      titolo: testo(d.titolo) || c.titolo || c.nome_originale, categoria_id: cat.id, descrizione: c.nota || '', origine: 'file', vede: cat.vede,
      data_documento: oggi(), creato_da: this.mioId(), creato: ora, modificato: ora, caricamento_id: c.id,
    }, legami), 'id', 'file dal portale accettato');
    this.aggiungiVersione(idDoc, f, 'dal portale (' + c.nome_originale + ')', this.statoRevisioneNuova(cat), 'file dal portale accettato');
    this.aggiorna('portale_caricamenti', c.id, { stato: 'accettato', deciso_da: this.mioId(), deciso_il: ora, documento_id: idDoc }, 'id', 'file dal portale accettato');
    this.chiudiDaGuardare('caricamento', c.id);
    return { ok: true, documento: this.documentoCompleto(this.rigaDocumento(idDoc)) };
  },

  rifiutaCaricamento(d) {
    const c = this.rigaCaricamento(d.id);
    const motivo = testo(d.motivo).slice(0, 300);
    if (!motivo) throw new Rifiuto('Scrivi il motivo: lo vede il cliente');
    if (c.stato === 'rifiutato') return { ok: true };
    if (c.stato === 'accettato') throw new Rifiuto('Il file è già stato accettato');
    this.aggiorna('portale_caricamenti', c.id, { stato: 'rifiutato', deciso_da: this.mioId(), deciso_il: adesso(), motivo }, 'id', 'file dal portale rifiutato: ' + motivo);
    this.chiudiDaGuardare('caricamento', c.id);
    return { ok: true };
  },

  accessiPortale(d) {
    d = d || {};
    const cond = [];
    const par = [];
    if (testo(d.idCliente)) { cond.push('soggetto_id = ?'); par.push(testo(d.idCliente)); }
    if (testo(d.idReferente)) { cond.push('referente_id = ?'); par.push(Number(d.idReferente)); }
    const gruppi = { entrati: ['entrato', 'uscito', 'azienda'], azioni: ['visto', 'scaricato', 'accettato', 'rifiutato', 'domanda', 'firmato', 'segnalato', 'caricato', 'richiesta', 'messaggio'],
      errori: ['codice_sbagliato', 'link_scaduto', 'bloccato', 'negato', 'scaduta'] };
    // Il filtro (pillole Tutti · Entrati · Azioni · Errori) si chiama "gruppo": "azione" e' gia' il nome dell'azione di /exec.
    // Si accetta anche "azione" se e' un gruppo o un'azione del registro del portale.
    const filtro = testo(d.gruppo) || (gruppi[testo(d.azione)] || FRASI_ACCESSO[testo(d.azione)] ? testo(d.azione) : '');
    if (filtro && filtro !== 'tutti') {
      const l = gruppi[filtro] || [filtro];
      cond.push('azione IN (' + l.map(() => '?').join(',') + ')');
      par.push(...l);
    }
    if (testo(d.da)) { cond.push('substr(quando, 1, 10) >= ?'); par.push(dataIso(d.da)); }
    if (testo(d.a)) { cond.push('substr(quando, 1, 10) <= ?'); par.push(dataIso(d.a)); }
    const righe = this.db.righe('SELECT * FROM portale_accessi' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') + ' ORDER BY quando DESC, id DESC', ...par);
    const pagina = Math.max(1, Math.round(numero(d.pagina)) || 1);
    const clienti = {};
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { clienti[s.id] = s.nome; });
    return {
      ok: true, pagina, pagine: Math.max(1, Math.ceil(righe.length / 100)),
      accessi: righe.slice((pagina - 1) * 100, pagina * 100).map(a => {
        const x = this.rigaAccessoStudio(a);
        return { quando: x.quando, cliente: clienti[a.soggetto_id] || '', referente: x.referente, frase: FRASI_ACCESSO[a.azione], oggetto: a.oggetto, esito: a.esito, ip: a.ip, dispositivo: a.agente };
      }),
    };
  },

  /** anteprimaPortale {idReferente}: un link di 5 minuti che apre una sessione di sola lettura di 30 minuti come quel referente. */
  anteprimaPortale(d) {
    const p = this.impPortale();
    if (!p.indirizzo) throw new Rifiuto('Il portale non è collegato: manca l\'indirizzo', { nonCollegato: true });
    const r = this.rigaReferente(d.idReferente);
    if (r.portale !== 1) throw new Rifiuto(r.nome + ' non ha l\'accesso al portale');
    const l = this.creaLinkPortale(r.id, 'anteprima', { minuti: 5, anteprimaUtente: this.mioId() });
    this.annota('portale_link', l.id, null, null, 'anteprima del portale come ' + r.nome);
    return { ok: true, link: this.indirizzoLink(l.token) };
  },

  /**
   * rispondiNelPortale {idTicket, testo, allegati?, idLocale?}: la risposta pubblica nella richiesta (firmata "Studio
   * Tecnico GM"). Lo stesso idLocale (la coda del telefono che rimanda dopo una caduta di rete) non la scrive due volte.
   */
  rispondiNelPortale(d) {
    const t = this.rigaTicket(d.idTicket);
    if (!this.vedeTicket(t) || !this.suoTicket(t)) throw senzaPermesso('rispondere su questo ticket');
    const idLocale = testo(d.idLocale);
    const gia = idLocale ? this.db.riga('SELECT * FROM comunicazioni WHERE id_locale = ?', idLocale) : null;
    if (gia) return { ok: true, messaggio: this.messaggioStudio(gia) };
    if (!(t.portale_visibile === 1 || t.origine === 'portale')) throw new Rifiuto('La richiesta non è nel portale: mostrala prima');
    const corpo = String(d.testo || '').trim();
    if (!corpo) throw new Rifiuto('Testo: scrivi la risposta');
    if (corpo.length > 2000) throw new Rifiuto('La risposta è più lunga di 2.000 caratteri: accorciala');
    const allegati = [];
    for (const a of Array.isArray(d.allegati) ? d.allegati.slice(0, 10) : []) {
      const dati = Buffer.from(String(a.base64 || ''), 'base64');
      const ctrl = this.controllaFilePortale(testo(a.nome), dati, { maxMb: this.impPortale().fileMaxMb });
      if (!ctrl.ok) throw new Rifiuto(ctrl.errore);
      const f = this.salvaFile({ dati, nome: ctrl.nome, mime: ctrl.mime, tipo: 'ticket' });
      this.db.esegui('UPDATE file SET ticket_id = ? WHERE id = ?', t.id, f.id);
      allegati.push({ nome: ctrl.nome, byte: dati.length, id: f.id });
    }
    const id = this.scriviComunicazione({ canale: 'portale', direzione: 'uscita', tipo: 'messaggio', stato: 'mandato', pubblica: 1, cliente_id: t.cliente_id,
      ticket_id: t.id, commessa_id: t.commessa_id || '', testo: corpo, allegati: JSON.stringify(allegati), id_locale: idLocale || null });
    this.annota('comunicazioni', id, null, null, 'risposta nel portale');
    this.chiudiDaGuardare('messaggio', t.id);
    // L'avviso per email ai referenti che vedono la richiesta (raggruppato come gli altri).
    this.novitaRichiesta(t.id, 'risposta');
    return { ok: true, messaggio: this.messaggioStudio(this.db.riga('SELECT * FROM comunicazioni WHERE id = ?', id)) };
  },

  /** Un messaggio della conversazione pubblica, come lo legge lo studio (con chi dello studio). */
  messaggioStudio(c) {
    let file = [];
    try { file = JSON.parse(c.allegati || '[]'); } catch (e) { file = []; }
    const ref = c.referente_id ? this.db.riga('SELECT nome FROM referenti WHERE id = ?', c.referente_id) : null;
    return {
      id: c.id, quando: dataOraIso(c.quando), direzione: c.direzione, da: c.direzione === 'uscita' ? 'Studio Tecnico GM' : (ref ? ref.nome : ''),
      chi: c.utente_id ? (this.db.riga('SELECT nome FROM utenti WHERE id = ?', c.utente_id) || {}).nome || '' : (ref ? ref.nome : ''), testo: c.testo,
      file: file.map(f => ({ nome: f.nome, byte: f.byte, url: f.id ? '/file/' + f.id : '' })), letto: c.direzione === 'uscita' || !!c.letto_il,
    };
  },

  /** Una novita' della richiesta da dire per email (intervento fissato, risolta, risposta): l'avviso raggruppato. */
  novitaRichiesta(idTicket, cosa) {
    const p = this.db.riga("SELECT * FROM portale_pubblicazioni WHERE tipo = 'ticket' AND rif = ? AND tolta_il IS NULL", String(idTicket));
    if (p) this.db.esegui('UPDATE portale_pubblicazioni SET avviso_da = ?, avviso_cosa = ?, avvisato_il = NULL WHERE id = ?', adesso(), cosa, p.id);
  },

  mostraNelPortale(d) {
    const t = this.rigaTicket(d.idTicket);
    if (!this.vedeTicket(t) || !this.suoTicket(t)) throw senzaPermesso('cambiare questo ticket');
    const visibile = si(d.visibile);
    if (visibile) {
      const s = this.rigaCliente(t.cliente_id);
      if (s.portale !== 1) throw new Rifiuto(s.nome + ' non ha il portale acceso');
      if (t.portale_visibile !== 1) this.aggiorna('ticket', t.id, { portale_visibile: 1, modificato: adesso() }, 'id', 'mostrato nel portale');
      this.pubblicaInterna({ tipo: 'ticket', rif: t.id, soggetto: t.cliente_id, origine: 'mano' });
    } else {
      if (t.portale_visibile === 1) this.aggiorna('ticket', t.id, { portale_visibile: 0, modificato: adesso() }, 'id', 'tolto dal portale');
      if (t.origine !== 'portale') this.chiudiPubblicazioni('ticket', t.id, 'mano');
    }
    return { ok: true, ticket: this.ticketCompleto(this.db.riga('SELECT * FROM ticket WHERE id = ?', t.id)) };
  },

  /**
   * Il controllo del portale (§0.5): il giro (ultimo contatto entro 2 minuti) e una GET di PORTALE_INDIRIZZO che
   * risponde 200 con dentro <meta name="wisper-portale" content="1">. In prova la GET si fa solo verso un indirizzo di
   * questo computer (le prove non vanno su internet). Due controlli falliti di fila: Dashboard ed email (una al giorno).
   */
  async controllaPortale() {
    const p = this.impPortale();
    const inizio = Date.now();
    let pagina = false;
    if (p.indirizzo) {
      const locale = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(p.indirizzo);
      if (!this.prova || locale || this.fetchPortale) {
        try {
          const f = this.fetchPortale || ((...a) => fetch(...a));
          const r = await f(p.indirizzo + '/', { signal: AbortSignal.timeout(15000), redirect: 'follow' });
          const t = await r.text();
          pagina = r.status === 200 && /<meta\s+name=["']wisper-portale["']\s+content=["']1["']/i.test(t);
        } catch (e) {
          pagina = false;
        }
      } else pagina = true;
    }
    const st = this.statoPortaleStudio();
    const ok = !!p.indirizzo && pagina && st.script === 'attivo';
    const c = this.controlloPortale || { falliti: 0 };
    const prima = c.falliti || 0;
    this.controlloPortale = { quando: adesso(), falliti: ok ? 0 : prima + 1, dal: ok ? '' : (c.dal || adesso()), pagina, script: st.script };
    if (!ok && this.controlloPortale.falliti >= 2 && p.indirizzo) await this.avvisaPortaleIrraggiungibile();
    return { ok: true, collegato: !p.indirizzo ? 'non_collegato' : ok ? 'si' : 'no', ms: Date.now() - inizio };
  },

  /** Il portale non si raggiunge da fuori: notifica a titolare e amministrazione ed email a EMAIL_AVVISI, una al giorno. */
  async avvisaPortaleIrraggiungibile() {
    const t = oggi();
    if (this.avvisoPortaleGiorno === t) return;
    this.avvisoPortaleGiorno = t;
    const dalle = oraDi(this.controlloPortale.dal) || '';
    this.db.transazione(() => this.come(require('../wisper').SISTEMA, () => this.notifica(this.utentiDeiRuoli(['titolare', 'amministrazione']), 'portale_irraggiungibile',
      'Il portale non si raggiunge da fuori', dalle ? 'dalle ' + dalle : '', { pagina: 'amministrazione', filtro: { sezione: 'portale' } })));
    try {
      if (this.postino && this.postino.configurato()) {
        await this.postino.email({ alProprietario: true, a: '', nome: this.impPortale().studio.nome, oggetto: 'Wisper: il portale non si raggiunge da fuori',
          messaggio: 'Il portale clienti non si raggiunge da fuori' + (dalle ? ' dalle ' + dalle : '') + '.\nControlla il NAS, lo script del portale e la pagina su Netlify (Amministrazione › Impostazioni › Portale clienti).' });
      }
    } catch (e) { /* l'avviso non ferma niente */ }
  },

  /** spegniPortale {conferma?}: solo titolare e amministrazione. Tutte le sessioni chiuse, tutti i link annullati. */
  spegniPortale(d) {
    const c = this.chi();
    if (c.utente && ['titolare', 'amministrazione'].indexOf(c.utente.ruolo) < 0) throw senzaPermesso('spegnere il portale');
    if (!si(d.conferma)) {
      return { ok: false, serveConferma: true, frase: 'Il portale si spegne per tutti i clienti: chi è dentro esce subito. Si riaccende da qui.',
        errore: 'Il portale si spegne per tutti i clienti: chi è dentro esce subito. Si riaccende da qui.' };
    }
    this.salvaImpostazioni({ PORTALE_ATTIVO: false });
    this.chiudiSessioniPortale('1 = 1', [], 'spento');
    this.annullaLinkPortale('1 = 1', []);
    this.annota('impostazioni', 'PORTALE_ATTIVO', null, null, 'portale spento da ' + (c.utente ? c.utente.nome : 'sistema'));
    return { ok: true };
  },

  /** La copia di cortesia di una fattura (PDF, fino a 10 MB, controllata come i file del portale). Torna l'id del file. */
  salvaCopiaFattura(idFattura, a) {
    const f = this.rigaFattura(idFattura);
    if (['emessa', 'annullata'].indexOf(f.stato) < 0) throw new Rifiuto('La copia di cortesia si allega a una fattura emessa');
    const dati = Buffer.from(String((a && a.base64) || ''), 'base64');
    const nome = testo(a && a.nome) || 'Fattura ' + (f.numero || f.riferimento) + '.pdf';
    const ctrl = this.controllaFilePortale(nome, dati, { maxMb: 10, soloPdf: true });
    if (!ctrl.ok) throw new Rifiuto(ctrl.errore);
    const file = this.salvaFile({ dati, nome: ctrl.nome, mime: 'application/pdf', tipo: 'fattura', fatturaId: f.id });
    this.aggiorna('fatture', f.id, { copia_file_id: file.id, modificato: adesso() }, 'id', 'copia di cortesia allegata');
    this.db.esegui("UPDATE portale_pubblicazioni SET file_id = ? WHERE tipo = 'fattura' AND rif = ? AND tolta_il IS NULL", file.id, String(f.id));
    return file.id;
  },

  /** allegaCopiaFattura {id, nome, mime, base64} (fatturazione 2). */
  allegaCopiaFattura(d) {
    this.salvaCopiaFattura(Number(d.id) || 0, d);
    return { ok: true, fattura: this.fatturaCompleta(this.rigaFattura(Number(d.id))) };
  },

  /**
   * Il controllo dei file del portale sui byte (§6.7, uguale per gli allegati di Rispondi nel portale e per la copia di
   * cortesia): l'estensione (l'ultima del nome), i primi byte, gli archivi di Office letti solo nell'indice.
   * Torna {ok, nome, estensione, mime} o {ok: false, errore}.
   */
  controllaFilePortale(nome, dati, o) {
    return require('../portale/file').controllaFile(nome, dati, Object.assign({ tipi: this.impPortale().tipiFile }, o || {}));
  },

  // ------------------------------------------------------------------ la Dashboard della fase 7 (§11.1)

  dashboardFase7({ mie, costi, io, adesso: t, voce, urgenti, settimana, pianificare }) {
    const r = {};
    const vedePortale = this.livello('portale') >= 1 && !mie;
    if (this.livello('comunicazioni') >= 1) {
      let dm = null;
      try { dm = this.daMandare(); } catch (e) { dm = null; }
      if (dm) {
        r.comunicazioni = { daMandareOggi: dm.oggi.length, preparati: dm.preparati.length, proposti: dm.proposti.length };
        if (dm.oggi.length) {
          const nomi = dm.oggi.map(p => (p.tipo === 'promemoria_appuntamento' ? 'promemoria a ' : 'messaggio a ') + p.a.nome);
          voce(settimana, { tipo: 'messaggio', gravita: 'attenzione', titolo: dm.oggi.length === 1 ? '1 messaggio da mandare oggi' : dm.oggi.length + ' messaggi da mandare oggi',
            dettaglio: (nomi.join(', ').charAt(0).toUpperCase() + nomi.join(', ').slice(1)), quanto: dm.oggi.length, unita: 'messaggi',
            collegamento: { pagina: 'comunicazioni', filtro: { segmento: 'damandare' } } });
        }
        if (!mie && costi && this.vedePagamenti()) {
          for (const p of dm.proposti.filter(x => /^fattura:/.test(x.proposta)).slice(0, 3)) {
            const f = this.db.riga('SELECT * FROM fatture WHERE id = ?', Number(p.proposta.split(':')[1]));
            // Fase 8 (§8.1): la stessa fattura della voce "scaduta" della fase 4: una cosa, una voce (oggetto).
            voce(pianificare, { tipo: 'pagamento', gravita: 'info', titolo: (p.proposta.slice(-1) === '2' ? 'Secondo promemoria' : 'Promemoria') + ' di pagamento da preparare: fattura ' + (f.numero || f.riferimento),
              dettaglio: p.a.cliente + ' · ' + p.dettaglio.replace(/^Fattura [^·]+· /, ''), quanto: p.importoResiduo, unita: 'euro', collegamento: { pagina: 'comunicazioni', filtro: { segmento: 'damandare' } },
              oggetto: 'fattura:' + f.id });
          }
        }
      }
    }
    // Il collaboratore: i messaggi dei clienti sui suoi ticket, i suoi rapportini firmati nel portale.
    const aperte = this.db.righe('SELECT * FROM portale_da_guardare WHERE visto_il IS NULL ORDER BY creato DESC, id DESC');
    const ticketVisti = id => { const tk = this.db.riga('SELECT * FROM ticket WHERE id = ?', Number(id)); return tk && this.vedeTicket(tk) && (!mie || tk.responsabile_id === io); };
    if (mie) {
      for (const x of aperte.filter(a => a.tipo === 'messaggio' && ticketVisti(a.rif)).slice(0, 3)) {
        voce(settimana, { tipo: 'portale', gravita: 'attenzione', titolo: x.titolo, dettaglio: x.dettaglio, collegamento: { pagina: 'ticket', id: Number(x.rif) } });
      }
      return r;
    }
    if (!vedePortale) return r;
    const stato = this.statoPortaleStudio();
    const settimanaFa = istante(new Date(adessoMs() - 7 * 86400000));
    const n = tipo => aperte.filter(a => a.tipo === tipo).length;
    r.portale = {
      daGuardare: aperte.length, richiesteNuove: n('richiesta'), accettati: n('accettato'), firmati: n('firmato'), caricamenti: n('caricamento'),
      messaggi: n('messaggio'), clienti: this.db.riga('SELECT COUNT(*) n FROM soggetti WHERE portale = 1').n,
      referenti: this.db.riga('SELECT COUNT(*) n FROM referenti WHERE portale = 1').n, collegato: stato.collegato,
    };
    // ---- urgenti: richieste urgenti dal portale non prese; il portale che non si raggiunge
    for (const x of aperte.filter(a => a.tipo === 'richiesta')) {
      const tk = this.db.riga('SELECT * FROM ticket WHERE id = ?', Number(x.rif));
      if (!tk) continue;
      const urgente = tk.priorita === 'urgente' && tk.responsabile_id === null;
      if (urgente) voce(urgenti, { tipo: 'portale', gravita: 'urgente', titolo: 'Richiesta urgente dal portale: ' + tk.numero, dettaglio: x.dettaglio, collegamento: { pagina: 'ticket', id: tk.id } });
      else voce(settimana, { tipo: 'portale', gravita: 'attenzione', titolo: 'Richiesta dal portale: ' + tk.numero, dettaglio: x.dettaglio, collegamento: { pagina: 'ticket', id: tk.id } });
    }
    const ruolo = this.chi().utente ? this.chi().utente.ruolo : 'titolare';
    if (stato.collegato === 'no' && this.controlloPortale && this.controlloPortale.falliti >= 2 && ['titolare', 'amministrazione'].indexOf(ruolo) >= 0) {
      voce(urgenti, { tipo: 'portale', gravita: 'urgente', titolo: 'Il portale non si raggiunge da fuori dalle ' + oraDi(this.controlloPortale.dal), dettaglio: '',
        collegamento: { pagina: 'amministrazione', filtro: { sezione: 'portale' } } });
    }
    // ---- questa settimana: accettati senza commessa, firmati negli ultimi 7 giorni, messaggi, domande e segnalazioni, email ferme
    for (const x of aperte.filter(a => a.tipo === 'accettato')) {
      const p = this.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(x.rif));
      if (!p || p.commessa_id) continue;
      const v = { tipo: 'portale', gravita: 'attenzione', titolo: (p.numero + (p.revisione ? ' rev. ' + p.revisione : '')) + ' accettato nel portale', dettaglio: p.accettato_da + ' · manca la commessa',
        collegamento: { pagina: 'preventivo', id: p.id } };
      if (costi) Object.assign(v, { quanto: this.contenutoPreventivo(p).conti.totale, unita: 'euro' });
      voce(settimana, v);
    }
    for (const rp of this.db.righe("SELECT * FROM rapportini WHERE firma_modo = 'portale' AND firmato_il >= ? ORDER BY firmato_il DESC LIMIT 5", settimanaFa)) {
      voce(settimana, { tipo: 'portale', gravita: 'info', titolo: rp.id + ' firmato nel portale', dettaglio: rp.firmatario + ' · ' + dataBreve(dataIso(rp.firmato_il)), collegamento: { pagina: 'rapportino', id: rp.id } });
    }
    for (const x of aperte.filter(a => a.tipo === 'messaggio').slice(0, 3)) {
      voce(settimana, { tipo: 'portale', gravita: 'attenzione', titolo: x.titolo, dettaglio: x.dettaglio, collegamento: { pagina: 'ticket', id: Number(x.rif) } });
    }
    for (const x of aperte.filter(a => a.tipo === 'domanda' || a.tipo === 'segnalato').slice(0, 3)) {
      voce(settimana, { tipo: 'portale', gravita: 'attenzione', titolo: x.titolo, dettaglio: x.dettaglio,
        collegamento: x.tipo === 'domanda' ? { pagina: 'preventivo', id: Number(x.rif) } : { pagina: 'rapportino', id: x.rif } });
    }
    const q = this.quotaPostino && this.quotaPostino.giorno === t ? this.quotaPostino.rimaste : null;
    if (q !== null && q <= this.impPortale().emailRiserva) {
      voce(settimana, { tipo: 'portale', gravita: 'attenzione', titolo: 'Le email del portale sono ferme fino a domani', dettaglio: 'Google ne lascia mandare ancora ' + q + ' oggi',
        collegamento: { pagina: 'portale', filtro: { segmento: 'daguardare' } } });
    }
    // ---- da pianificare: file dei clienti, preventivi pubblicati e non visti, referenti che non entrano, bozze da far firmare
    const file = aperte.filter(a => a.tipo === 'caricamento');
    if (file.length) {
      voce(pianificare, { tipo: 'portale', gravita: 'info', titolo: file.length === 1 ? '1 file dai clienti da guardare' : file.length + ' file dai clienti da guardare',
        dettaglio: file.slice(0, 3).map(x => x.titolo + ' · ' + ((this.db.riga('SELECT nome FROM soggetti WHERE id = ?', x.soggetto_id) || {}).nome || '')).join(', '),
        quanto: file.length, unita: 'file', collegamento: { pagina: 'portale', filtro: { segmento: 'daguardare' } } });
    }
    for (const p of this.db.righe("SELECT * FROM portale_pubblicazioni WHERE tipo = 'preventivo' AND tolta_il IS NULL AND visto_il IS NULL AND pubblicata_il < ? ORDER BY pubblicata_il LIMIT 3", settimanaFa)) {
      const pr = this.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(p.rif));
      if (!pr || pr.stato !== 'INVIATO') continue;
      voce(pianificare, { tipo: 'portale', gravita: 'info', titolo: pr.numero + (pr.revisione ? ' rev. ' + pr.revisione : '') + ' non è ancora stato visto nel portale',
        dettaglio: ((this.db.riga('SELECT nome FROM soggetti WHERE id = ?', p.soggetto_id) || {}).nome || '') + ' · pubblicato il ' + dataBreve(dataIso(p.pubblicata_il)), collegamento: { pagina: 'preventivo', id: pr.id } });
    }
    if (this.livello('amministrazione') >= 1 || ruolo === 'amministrazione') {
      const limite = istante(new Date(C.piuMesi(t, -this.impPortale().inattiviMesi) + 'T00:00:00'));
      for (const rf of this.db.righe("SELECT * FROM referenti WHERE portale = 1 AND portale_dal <> '' AND (ultimo_accesso = '' OR ultimo_accesso < ?) LIMIT 3", limite)) {
        voce(pianificare, { tipo: 'portale', gravita: 'info', titolo: rf.nome + ' non entra nel portale da ' + this.impPortale().inattiviMesi + ' mesi: togli l\'accesso?', dettaglio: '',
          collegamento: { pagina: 'portaleCliente', id: rf.soggetto_id } });
      }
    }
    const pubblicateDaFirmare = new Set(this.db.righe("SELECT rif FROM portale_pubblicazioni WHERE tipo = 'rapportino' AND da_firmare = 1 AND tolta_il IS NULL").map(x => x.rif));
    for (const rp of this.db.righe("SELECT r.* FROM rapportini r JOIN soggetti s ON s.id = r.id_cliente WHERE s.portale = 1 AND UPPER(r.stato) = 'BOZZA' AND r.data < ? ORDER BY r.data LIMIT 5", piuGiorni(t, -7))) {
      if (pubblicateDaFirmare.has(rp.id)) continue;
      voce(pianificare, { tipo: 'portale', gravita: 'info', titolo: rp.id + ' da far firmare: fallo firmare nel portale', dettaglio: rp.cliente + ' · ' + K.dataIt(dataIso(rp.data)), collegamento: { pagina: 'rapportino', id: rp.id } });
    }
    return r;
  },

  // ------------------------------------------------------------------ il giro del portale (ogni minuto: avvisi, pulizie, controllo di ogni ora)

  /**
   * Ogni minuto (avvio.js): gli avvisi raggruppati per email, le pulizie (tentativi oltre 24 ore, caricamenti non legati
   * dopo 2 ore nel cestino, file rifiutati dopo 30 giorni tolti dal disco, sessioni e link dopo 30 giorni, registro degli
   * accessi oltre PORTALE_ACCESSI_MESI, notifiche oltre 90 giorni), la notifica "da mandare oggi" alle 8:00 e, ogni ora,
   * il controllo del portale. Non lancia mai: un errore finisce nel log.
   */
  async giroPortale() {
    const ora = adessoMs();
    try {
      this.db.transazione(() => this.come(require('../wisper').SISTEMA, () => this.puliziaPortale()));
      // Fase 8 (§11.3, T10): le pulizie di conservazione sono girate.
      if (this.lavoro) this.lavoro('Pulizie', 'ok', 'notifiche, accessi e portale');
    } catch (err) {
      console.error('[portale] pulizia: ' + (err && err.message ? err.message : err));
      if (this.lavoro) this.lavoro('Pulizie', 'errore', err && err.message ? err.message : String(err));
    }
    try {
      await this.avvisiPortale();
    } catch (err) { console.error('[portale] avvisi: ' + (err && err.message ? err.message : err)); }
    try {
      this.db.transazione(() => this.come(require('../wisper').SISTEMA, () => this.notificaDaMandare()));
    } catch (err) { console.error('[portale] da mandare: ' + (err && err.message ? err.message : err)); }
    if (!this.ultimoControlloPortale || ora - this.ultimoControlloPortale >= 3600000) {
      this.ultimoControlloPortale = ora;
      if (this.impPortale().indirizzo && (this.portaPortale && this.portaPortale.configurata && this.portaPortale.configurata())) {
        try { await this.controllaPortale(); } catch (err) { console.error('[portale] controllo: ' + (err && err.message ? err.message : err)); }
      }
    }
  },

  puliziaPortale() {
    const ora = adessoMs();
    const ieri = istante(new Date(ora - 86400000));
    this.db.esegui('DELETE FROM portale_tentativi WHERE quando < ?', ieri);
    // Un caricamento non legato a un documento, una richiesta o un messaggio entro 2 ore va nel cestino.
    for (const c of this.db.righe("SELECT * FROM portale_caricamenti WHERE stato = 'caricato' AND creato < ?", istante(new Date(ora - 2 * 3600000)))) {
      this.db.esegui('UPDATE file SET cestinato = ? WHERE id = ? AND cestinato IS NULL', adesso(), c.file_id);
      this.db.esegui('DELETE FROM portale_caricamenti WHERE id = ?', c.id);
    }
    // I file rifiutati si tolgono dal disco dopo 30 giorni (la riga resta).
    for (const c of this.db.righe("SELECT c.*, f.percorso FROM portale_caricamenti c JOIN file f ON f.id = c.file_id WHERE c.stato = 'rifiutato' AND c.deciso_il < ? AND f.svuotato IS NULL",
      istante(new Date(ora - 30 * 86400000)))) {
      try { if (c.percorso) fs.rmSync(this.percorsoFile(c.percorso), { force: true }); } catch (e) { /* al prossimo giro */ }
      this.db.esegui('UPDATE file SET svuotato = ?, cestinato = COALESCE(cestinato, ?) WHERE id = ?', adesso(), adesso(), c.file_id);
    }
    const mese = istante(new Date(ora - 30 * 86400000));
    this.db.esegui('DELETE FROM portale_sessioni WHERE chiusa_il IS NOT NULL AND chiusa_il < ?', mese);
    this.db.esegui('DELETE FROM portale_link WHERE scade < ?', mese);
    // Il registro degli accessi: le righe oltre PORTALE_ACCESSI_MESI (l'unica eccezione del trigger).
    const fino = istante(new Date(C.piuMesi(oggi(), -this.impPortale().accessiMesi) + 'T00:00:00'));
    if (this.db.riga('SELECT id FROM portale_accessi WHERE quando < ? LIMIT 1', fino)) {
      this.db.esegui('INSERT INTO portale_pulizia (fino) VALUES (?)', fino);
      this.db.esegui('DELETE FROM portale_accessi WHERE quando < ?', fino);
      this.db.esegui('DELETE FROM portale_pulizia');
    }
    this.puliziaNotifiche();
  },

  /**
   * Gli avvisi raggruppati (§3.12, §8.3): dopo PORTALE_AVVISI_MINUTI dalla novita', un'email per referente con tutte le
   * novita' che puo' vedere, al massimo 3 al giorno; solo a chi ha gli avvisi accesi; con la quota sotto la riserva
   * aspettano le 8:00 del giorno dopo. Il link dell'email vale 72 ore. Mai importi, contenuti o descrizioni.
   */
  async avvisiPortale() {
    const p = this.impPortale();
    if (!p.attivo || !p.indirizzo || !this.postino || !this.postino.configurato()) return 0;
    const limite = istante(new Date(adessoMs() - p.avvisiMinuti * 60000));
    const t = oggi();
    let mandate = 0;
    const referenti = this.db.righe("SELECT r.* FROM referenti r JOIN soggetti s ON s.id = r.soggetto_id WHERE r.portale = 1 AND r.avvisi_email = 1 AND s.portale = 1 AND r.email <> ''");
    for (const r of referenti) {
      if (new Date(adessoMs()).getHours() < 8 && this.giornoQuotaFinita && this.giornoQuotaFinita < t) continue;
      const ultimo = this.db.riga("SELECT MAX(quando) q FROM comunicazioni WHERE tipo = 'avviso_portale' AND referente_id = ? AND stato = 'mandato'", r.id).q || '';
      const oggiGia = this.db.riga("SELECT COUNT(*) n FROM comunicazioni WHERE tipo = 'avviso_portale' AND referente_id = ? AND stato = 'mandato' AND substr(quando, 1, 10) = ?", r.id, t).n;
      if (oggiGia >= 3) continue;
      // Le pubblicazioni nuove (senza_avviso = 0) e i cambi delle richieste (avviso_cosa: intervento fissato, risolta, risposta).
      const novita = this.db.righe("SELECT * FROM portale_pubblicazioni WHERE soggetto_id = ? AND tolta_il IS NULL AND (senza_avviso = 0 OR avviso_cosa <> '') AND avviso_da IS NOT NULL AND avviso_da <= ? AND avviso_da > ? ORDER BY avviso_da",
        r.soggetto_id, limite, ultimo).filter(x => this.puoVedereReferente(r, x));
      if (!novita.length) continue;
      if (!this.emailPortalePuo(3)) { this.giornoQuotaFinita = t; break; }
      const s = this.db.riga('SELECT * FROM soggetti WHERE id = ?', r.soggetto_id);
      const righe = novita.map(x => '- ' + this.rigaAvviso(x));
      const link = this.db.transazione(() => this.creaLinkPortale(r.id, 'avviso', { minuti: p.linkAvvisoOre * 60, destinazione: novita.length === 1 ? this.destinazioneDi(novita[0]) : '' }));
      const oggetto = p.studio.nome + ': novità nel portale';
      const testoEmail = 'Buongiorno ' + r.nome + ',\nnel portale di ' + p.studio.nome + ' ci sono novità per ' + s.nome + ':\n' + righe.join('\n') +
        '\nEntri da qui (il link vale ' + p.linkAvvisoOre + ' ore e si usa una volta): ' + this.indirizzoLink(link.token) +
        '\nPer non ricevere più questi avvisi: nel portale, Il mio accesso.\n' + p.studio.nome + ' · ' + p.studio.telefono;
      let partita = false;
      try { partita = await this.mandaEmailPortale(r.email, oggetto, testoEmail, 3); } catch (e) { partita = false; }
      if (!partita) break;
      this.db.transazione(() => {
        this.come(require('../wisper').SISTEMA, () => this.scriviComunicazione({ canale: 'email', tipo: 'avviso_portale', cliente_id: r.soggetto_id, referente_id: r.id, a: r.email, oggetto,
          testo: righe.join('\n'), stato: 'mandato', utente_id: null }));
        for (const x of novita) this.db.esegui('UPDATE portale_pubblicazioni SET avvisato_il = ? WHERE id = ?', adesso(), x.id);
      });
      mandate++;
    }
    return mandate;
  },

  /** La riga dell'avviso per email (§9.6), senza importi ne' contenuti. */
  rigaAvviso(x) {
    const i = this.infoOggetto(x.tipo, x.rif, true);
    if (x.tipo === 'preventivo') return 'Preventivo ' + i.etichetta + ' da guardare';
    if (x.tipo === 'rapportino') return i.titolo + (x.da_firmare ? ' da firmare' : '');
    if (x.tipo === 'documento') return 'Documento: ' + i.titolo;
    if (x.tipo === 'fattura') return i.titolo;
    if (x.tipo === 'contratto') return 'Contratto ' + i.etichetta;
    if (x.tipo === 'ticket') {
      return 'Richiesta ' + i.etichetta + (x.avviso_cosa === 'intervento fissato' ? ': intervento fissato' : x.avviso_cosa === 'risolta' ? ': risolta' : x.avviso_cosa === 'risposta' ? ': c\'è una risposta dello studio' : '');
    }
    return i.titolo;
  },

  /** La destinazione di una pubblicazione per il link: "preventivi/12", "rapportini/15", "richieste/21"... */
  destinazioneDi(x) {
    const pag = { preventivo: 'preventivi', contratto: 'preventivi', rapportino: 'rapportini', fattura: 'fatture', documento: 'documenti', ticket: 'richieste' }[x.tipo];
    return x.tipo === 'documento' || x.tipo === 'contratto' ? pag : pag + '/' + x.id;
  },

  /** Il referente puo' vedere questa pubblicazione? (permesso del tipo e sede: la parte di vedibile() che non dipende dall'oggetto). */
  puoVedereReferente(r, p) {
    if ((this.permessiReferente(r)[PERMESSO_DI[p.tipo]] || 0) < 1) return false;
    const sedi = this.sediReferente(r);
    return !sedi || !p.sede_id || sedi.indexOf(Number(p.sede_id)) >= 0;
  },
};

Object.defineProperties(module.exports, {
  PERMESSI_BASE_PORTALE: { value: PERMESSI_BASE },
  REGOLE_BASE_PORTALE: { value: REGOLE_BASE },
  PERMESSO_DI_PORTALE: { value: PERMESSO_DI },
  FRASI_ACCESSO_PORTALE: { value: FRASI_ACCESSO },
  mbIt: { value: mbIt },
});
