/*
 * Fase 7: WhatsApp e comunicazioni (fase7.md §3.13-3.16, §9, §10.2, §10.3).
 *
 *  - lo storico per cliente e per commessa (comunicazioni): email mandate da Wisper, WhatsApp preparati e segnati
 *    mandati, telefonate e note, messaggi del portale;
 *  - Da mandare: le proposte si CALCOLANO a ogni lettura (promemoria degli appuntamenti, rapportini da firmare,
 *    promemoria di pagamento) e non si salvano; usata o scartata, la comunicazione porta la chiave della proposta e la
 *    proposta non torna piu';
 *  - i modelli coi segnaposti, il messaggio pronto per wa.me (lo manda Manuel: niente invii automatici);
 *  - le notifiche interne (ognuno le sue).
 * Le regole senza database (numero per WhatsApp, segnaposti, link) stanno in src/comunicazioni.js.
 */
'use strict';

const { Rifiuto, senzaPermesso, testo, numero, centesimi, adesso, adessoMs, oggi, piuGiorni, dataIso, dataOraIso, istante } = require('../utili');
const C = require('../conti');
const K = require('../comunicazioni');

const vuoto = v => v === undefined || v === null || v === '';
const si = v => v === true || v === 1 || v === '1' || v === 'true';
const CANALI = ['email', 'whatsapp', 'portale', 'telefonata', 'nota'];
const STATI_VISTI = { preparato: 'Preparato', mandato: 'Mandato', non_mandato: 'Non mandato', errore: 'Errore', ricevuto: 'Ricevuto' };
const TIPI_NOMI = {
  rapportino: 'Rapportino', riepilogo: 'Riepilogo', preventivo: 'Preventivo', documento: 'Documento', avviso_parcella: 'Avviso di parcella',
  invito_portale: 'Invito al portale', avviso_portale: 'Avviso del portale', conferma_portale: 'Conferma dal portale', messaggio: 'Messaggio',
  domanda: 'Domanda', segnalazione: 'Segnalazione', libero: 'Messaggio libero',
};
const PER_PAGINA = 50;
const NOTIFICHE_PER_PAGINA = 30;

/** I giorni lavorativi dello studio: dal lunedi' al venerdi', senza le feste (col patrono delle impostazioni). */
function lavorativo(iso, patrono) {
  return C.giorniLavorativi(iso, iso, [1, 2, 3, 4, 5], C.festivi(Number(iso.slice(0, 4)), patrono || '')) === 1;
}
/** Il giorno lavorativo n giorni lavorativi prima di iso. */
function lavorativiPrima(iso, n, patrono) {
  let g = iso;
  let fatti = 0;
  for (let i = 0; i < 60 && fatti < n; i++) {
    g = piuGiorni(g, -1);
    if (lavorativo(g, patrono)) fatti++;
  }
  return g;
}
/** Il prossimo giorno lavorativo dopo iso. */
function lavorativoDopo(iso, patrono) {
  let g = piuGiorni(iso, 1);
  for (let i = 0; i < 20 && !lavorativo(g, patrono); i++) g = piuGiorni(g, 1);
  return g;
}

module.exports = {
  // ------------------------------------------------------------------ aiuti

  /** Scrive una riga dello storico (§9.1). Torna l'id. */
  scriviComunicazione(v) {
    const ora = adesso();
    const c = this.chi();
    const riga = Object.assign({
      quando: ora, canale: 'email', direzione: 'uscita', tipo: 'libero', modello: '', proposta: '', cliente_id: '', referente_id: null, commessa_id: '',
      ticket_id: null, preventivo_id: null, rapportino_id: '', fattura_id: null, attivita_id: null, documento_id: null, a: '', oggetto: '', testo: '',
      allegati: '[]', stato: 'mandato', mandato_il: '', errore: '', motivo: '', pubblica: 0, letto_il: '', utente_id: c.utente ? c.utente.id : null,
      id_locale: null, creato: ora, modificato: ora,
    }, v);
    if (Array.isArray(riga.allegati)) riga.allegati = JSON.stringify(riga.allegati.map(a => ({ nome: testo(a.nome), byte: Number(a.byte) || 0 })));
    if (riga.stato === 'mandato' && !riga.mandato_il) riga.mandato_il = riga.quando;
    if (riga.commessa_id && !riga.cliente_id) riga.cliente_id = (this.db.riga('SELECT cliente_id FROM commesse WHERE id = ?', riga.commessa_id) || {}).cliente_id || '';
    return this.inserisci('comunicazioni', riga);
  },

  /**
   * Lo storico delle email che Wisper manda (inviaEmail, inviaPreventivo, inviaAvviso, inviaDocumento): non ferma mai
   * l'email gia' partita (un errore qui si scrive nel log e basta).
   */
  storicoEmail(v) {
    try {
      return this.db.transazione(() => this.scriviComunicazione(Object.assign({ canale: 'email', direzione: 'uscita' }, v)));
    } catch (err) {
      console.error('[comunicazioni] ' + (err && err.stack ? err.stack : err));
      return null;
    }
  },

  impComunicazioni() {
    const imp = this.leggiImpostazioni();
    return {
      imp,
      testoMax: Number(imp.WHATSAPP_TESTO_MAX) || 1000,
      giorniPrima: Math.max(0, Math.round(numero(imp.PROMEMORIA_GIORNI_PRIMA))),
      solleciti: Math.max(1, Math.round(numero(imp.SOLLECITO_DOPO_GIORNI)) || 7),
      secondo: Math.max(1, Math.round(numero(imp.SOLLECITO_SECONDO_GIORNI)) || 30),
      patrono: testo(imp.FESTA_PATRONO),
    };
  },

  /** Chi vede i pagamenti (proposte, modelli "pagamento", nonSollecitare): fatturazione 2 e costi almeno 1. */
  vedePagamenti() {
    return this.livello('fatturazione') >= 2 && this.livello('costi') >= 1;
  },

  /** Il destinatario: {idReferente, nome, cliente, numero, numeroVisto, email, whatsappOk, fisso}. */
  destinatario(idReferente, idCliente) {
    let r = vuoto(idReferente) ? null : this.db.riga('SELECT * FROM referenti WHERE id = ?', Number(idReferente));
    if (!vuoto(idReferente) && !r) throw new Rifiuto('Referente ' + idReferente + ' non trovato');
    const sId = r ? r.soggetto_id : testo(idCliente);
    const s = sId ? this.db.riga('SELECT * FROM soggetti WHERE id = ?', sId) : null;
    if (!r && !s) throw new Rifiuto('A chi va il messaggio? Scegli il cliente o il referente');
    const tel = r ? (testo(r.whatsapp) || testo(r.telefono) || (s ? testo(s.telefono) : '')) : testo(s.telefono);
    const n = tel ? K.numeroWhatsapp(tel) : { valido: false };
    return {
      idReferente: r ? r.id : null, nome: r ? r.nome : s.nome, cliente: s ? s.nome : '', telefono: tel,
      numero: n.valido ? n.numero : '', numeroVisto: n.valido ? n.visto : '', email: r ? testo(r.email) || '' : testo(s.email),
      whatsappOk: !!(r && r.whatsapp_ok === 1), fisso: !!(n.valido && n.fisso), idCliente: s ? s.id : '',
    };
  },

  /** Il primo referente del cliente col si' a WhatsApp, se no con l'email, se no il primo. */
  referenteDiCliente(idCliente, preferito) {
    if (!idCliente) return null;
    const rs = this.db.righe('SELECT * FROM referenti WHERE soggetto_id = ? ORDER BY ordine, id', idCliente);
    if (preferito) {
      const p = rs.find(r => r.id === Number(preferito));
      if (p) return p;
    }
    return rs.find(r => r.whatsapp_ok === 1) || rs.find(r => testo(r.email)) || rs[0] || null;
  },

  /** L'indirizzo del portale per {portale}: solo se il cliente ha il portale acceso e il portale e' collegato e acceso. */
  portaleDelCliente(idCliente) {
    const imp = this.leggiImpostazioni();
    const indirizzo = testo(imp.PORTALE_INDIRIZZO).replace(/\/+$/, '');
    if (!indirizzo || !(imp.PORTALE_ATTIVO === true || imp.PORTALE_ATTIVO === 'true')) return '';
    const s = idCliente ? this.db.riga('SELECT portale FROM soggetti WHERE id = ?', idCliente) : null;
    return s && s.portale === 1 ? indirizzo : '';
  },

  /**
   * I valori dei segnaposti per un messaggio, e il riferimento: {valori, riferimento, idCliente, legami, ultimoMovimento?}.
   * d: {idReferente?, idCliente?, idAttivita?, idTicket?, idPreventivo?, idRapportino?, idFattura?, idCommessa?}
   */
  valoriMessaggio(d, dest) {
    const imp = this.leggiImpostazioni();
    const c = this.chi();
    const studio = testo(imp.RAGIONE_SOCIALE) || 'Studio Tecnico GM';
    const nomeChi = c.utente ? c.utente.nome : testo(imp.TECNICO);
    const v = {
      nome: dest ? dest.nome : '', cliente: dest ? dest.cliente : '', studio, mittente: [nomeChi, studio].filter(Boolean).join(' · '),
      telefono_studio: testo(imp.TELEFONO), oggi: K.dataIt(oggi()), portale: '',
    };
    const legami = { cliente_id: dest ? dest.idCliente : testo(d.idCliente), commessa_id: '', ticket_id: null, preventivo_id: null, rapportino_id: '',
      fattura_id: null, attivita_id: null };
    let riferimento = null;
    let ultimoMovimento;
    if (!vuoto(d.idAttivita)) {
      const a = this.db.riga('SELECT * FROM attivita WHERE id = ?', Number(d.idAttivita));
      if (!a) throw new Rifiuto('Attività ' + d.idAttivita + ' non trovata');
      this.valoriAttivitaMessaggio(a, v);
      legami.attivita_id = a.id;
      legami.cliente_id = legami.cliente_id || a.cliente_id;
      legami.commessa_id = a.commessa_id || '';
      if (a.ticket_id) legami.ticket_id = a.ticket_id;
      riferimento = { tipo: 'attivita', id: a.id, etichetta: a.titolo };
    }
    if (!vuoto(d.idTicket)) {
      const t = this.rigaTicket(d.idTicket);
      v.ticket = t.numero;
      legami.ticket_id = t.id;
      legami.cliente_id = legami.cliente_id || t.cliente_id;
      legami.commessa_id = legami.commessa_id || t.commessa_id || '';
      if (t.sede_id) {
        const s = this.db.riga('SELECT nome FROM sedi WHERE id = ?', t.sede_id);
        if (s) { v.impianto = s.nome; if (!v.luogo) v.luogo = s.nome; }
      }
      if (!v.giorno) {
        const prossima = this.db.riga("SELECT * FROM attivita WHERE ticket_id = ? AND stato NOT IN ('fatta', 'annullata') AND inizio <> '' ORDER BY inizio LIMIT 1", t.id);
        if (prossima) this.valoriAttivitaMessaggio(prossima, v);
      }
      if (!v.cosa) v.cosa = t.titolo;
      if (!riferimento) riferimento = { tipo: 'ticket', id: t.id, etichetta: t.numero };
    }
    if (!vuoto(d.idPreventivo)) {
      const p = this.rigaPreventivo(d.idPreventivo);
      const et = p.numero + (p.revisione ? ' rev. ' + p.revisione : '');
      Object.assign(v, { preventivo: et, oggetto: p.oggetto, scadenza: K.dataIt(p.scadenza) });
      if (this.vedeCosti()) v.totale = C.euroIt(this.contenutoPreventivo(p).conti.totale) + ' €';
      legami.preventivo_id = p.id;
      legami.cliente_id = legami.cliente_id || p.cliente_id;
      if (!riferimento) riferimento = { tipo: 'preventivo', id: p.id, etichetta: et };
    }
    if (!vuoto(d.idRapportino)) {
      const r = this.trovaRiga(d.idRapportino, d.idRapportino);
      if (!r) throw new Rifiuto('Rapportino ' + d.idRapportino + ' non trovato');
      Object.assign(v, { data: K.dataIt(dataIso(r.data)), lavoro: testo(r.descrizione).slice(0, 80), rapportino: r.id });
      legami.rapportino_id = r.id;
      legami.cliente_id = legami.cliente_id || r.id_cliente;
      legami.commessa_id = legami.commessa_id || r.id_commessa || '';
      if (!riferimento) riferimento = { tipo: 'rapportino', id: r.id, etichetta: r.id };
    }
    if (!vuoto(d.idFattura)) {
      if (!this.vedePagamenti()) throw senzaPermesso('preparare i promemoria di pagamento');
      const f = this.rigaFattura(d.idFattura);
      const p = this.pagamentoDi(f);
      Object.assign(v, { fattura: f.numero || f.riferimento, data_fattura: K.dataIt(f.data), importo: C.euroIt(p.residuo) + ' €', scadenza: K.dataIt(p.primaScoperta) });
      legami.fattura_id = f.id;
      legami.cliente_id = legami.cliente_id || f.cliente_id;
      if (!riferimento) riferimento = { tipo: 'fattura', id: f.id, etichetta: 'Fattura ' + (f.numero || f.riferimento) };
      const mov = this.db.riga('SELECT MAX(data) d FROM movimenti WHERE annullato = 0');
      ultimoMovimento = mov && mov.d ? mov.d : '';
    }
    if (!vuoto(d.idCommessa)) {
      const m = this.db.riga('SELECT id, cliente_id, descrizione FROM commesse WHERE id = ?', testo(d.idCommessa));
      if (!m) throw new Rifiuto('Commessa ' + d.idCommessa + ' non trovata');
      legami.commessa_id = m.id;
      legami.cliente_id = legami.cliente_id || m.cliente_id;
      if (!v.commessa) v.commessa = m.id;
      if (!riferimento) riferimento = { tipo: 'commessa', id: m.id, etichetta: m.id };
    }
    if (legami.commessa_id && !v.commessa) v.commessa = legami.commessa_id;
    v.portale = this.portaleDelCliente(legami.cliente_id);
    if (!v.cliente && legami.cliente_id) v.cliente = (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', legami.cliente_id) || {}).nome || '';
    if (!v.nome) v.nome = v.cliente;
    const o = { valori: v, riferimento, legami, idCliente: legami.cliente_id };
    if (ultimoMovimento !== undefined) o.ultimoMovimento = ultimoMovimento;
    return o;
  },

  valoriAttivitaMessaggio(a, v) {
    const giorno = a.inizio ? dataIso(a.inizio) : a.scadenza;
    if (giorno) v.giorno = K.giornoLungo(giorno);
    if (a.inizio) v.ora = K.oraBreve(dataOraIso(a.inizio));
    v.cosa = a.titolo;
    if (a.luogo) v.luogo = a.luogo;
    if (a.ticket_id && !v.luogo) {
      const t = this.db.riga('SELECT sede_id FROM ticket WHERE id = ?', a.ticket_id);
      const s = t && t.sede_id ? this.db.riga('SELECT nome FROM sedi WHERE id = ?', t.sede_id) : null;
      if (s) v.luogo = s.nome;
    }
    if (a.commessa_id) v.commessa = a.commessa_id;
  },

  modelloMessaggio(chiave) {
    const m = this.db.riga('SELECT * FROM modelli_messaggi WHERE chiave = ?', testo(chiave));
    if (!m) throw new Rifiuto('Modello sconosciuto: ' + testo(chiave));
    return m;
  },

  /** Il messaggio composto: {testo, oggetto, mancano, a, link?, riferimento, legami, ultimoMovimento?}. */
  componiMessaggio(d) {
    const m = this.modelloMessaggio(d.modello || 'libero');
    if (m.uso === 'pagamento' && !this.vedePagamenti()) throw senzaPermesso('preparare i promemoria di pagamento');
    const canale = testo(d.canale) || (m.canale === 'email' ? 'email' : 'whatsapp');
    if (['whatsapp', 'email'].indexOf(canale) < 0) throw new Rifiuto('Canale: WhatsApp o email');
    let idCliente = testo(d.idCliente);
    if (!idCliente && !vuoto(d.idAttivita)) idCliente = (this.db.riga('SELECT cliente_id FROM attivita WHERE id = ?', Number(d.idAttivita)) || {}).cliente_id || '';
    if (!idCliente && !vuoto(d.idTicket)) idCliente = this.rigaTicket(d.idTicket).cliente_id;
    if (!idCliente && !vuoto(d.idPreventivo)) idCliente = this.rigaPreventivo(d.idPreventivo).cliente_id;
    if (!idCliente && !vuoto(d.idRapportino)) idCliente = (this.trovaRiga(d.idRapportino, d.idRapportino) || {}).id_cliente || '';
    if (!idCliente && !vuoto(d.idFattura)) idCliente = this.rigaFattura(d.idFattura).cliente_id;
    let idReferente = d.idReferente;
    if (vuoto(idReferente) && idCliente) {
      const preferito = m.uso === 'pagamento' ? (this.db.riga('SELECT id FROM referenti WHERE soggetto_id = ? AND pagamenti = 1 ORDER BY ordine, id LIMIT 1', idCliente) || {}).id : null;
      const r = preferito ? { id: preferito } : this.referenteDiCliente(idCliente);
      idReferente = r ? r.id : null;
    }
    const dest = this.destinatario(idReferente, idCliente);
    const x = this.valoriMessaggio(Object.assign({}, d, { idCliente: dest.idCliente || idCliente }), dest);
    const corpo = K.riempi(m.testo, x.valori);
    const ogg = K.riempi(m.oggetto, x.valori);
    const mancano = corpo.mancano.concat(ogg.mancano.filter(s => corpo.mancano.indexOf(s) < 0));
    const o = { testo: corpo.testo, oggetto: canale === 'email' ? ogg.testo : '', a: dest, mancano, riferimento: x.riferimento, legami: x.legami, canale, modello: m.chiave };
    if (canale === 'whatsapp' && dest.numero) o.link = K.linkWhatsapp(dest.numero, corpo.testo);
    if (x.ultimoMovimento !== undefined) o.ultimoMovimento = x.ultimoMovimento;
    return o;
  },

  /** Il collaboratore: solo le cose sue (le sue attivita', i ticket che vede, i suoi rapportini), mai i pagamenti. */
  controllaMessaggioSuo(d) {
    if (!this.soloSuoi()) return;
    const io = this.mioId();
    if (!vuoto(d.idFattura)) throw senzaPermesso('preparare i promemoria di pagamento');
    if (!vuoto(d.idAttivita)) {
      const a = this.db.riga('SELECT * FROM attivita WHERE id = ?', Number(d.idAttivita));
      if (a && a.assegnata_a !== io && a.creata_da !== io) throw senzaPermesso('scrivere ai clienti delle attività degli altri');
    }
    if (!vuoto(d.idTicket) && !this.vedeTicket(this.rigaTicket(d.idTicket))) throw new Rifiuto('Ticket non trovato');
    if (!vuoto(d.idRapportino)) {
      const r = this.trovaRiga(d.idRapportino, d.idRapportino);
      if (r) this.controllaSuo(r, 'scrivere ai clienti dei rapportini degli altri');
    }
  },

  // ------------------------------------------------------------------ lo storico

  comunicazioneDaRiga(r, aiuti) {
    const a = aiuti || this.aiutiComunicazioni([r]);
    let rif = null;
    if (r.ticket_id) rif = { tipo: 'ticket', id: r.ticket_id, etichetta: a.ticket[r.ticket_id] || '' };
    else if (r.preventivo_id) rif = { tipo: 'preventivo', id: r.preventivo_id, etichetta: a.preventivi[r.preventivo_id] || '' };
    else if (r.rapportino_id) rif = { tipo: 'rapportino', id: r.rapportino_id, etichetta: r.rapportino_id };
    else if (r.fattura_id) rif = { tipo: 'fattura', id: r.fattura_id, etichetta: a.fatture[r.fattura_id] || '' };
    else if (r.attivita_id) rif = { tipo: 'attivita', id: r.attivita_id, etichetta: a.attivita[r.attivita_id] || '' };
    else if (r.documento_id) rif = { tipo: 'documento', id: r.documento_id, etichetta: a.documenti[r.documento_id] || '' };
    else if (r.commessa_id) rif = { tipo: 'commessa', id: r.commessa_id, etichetta: r.commessa_id };
    const modello = r.modello ? a.modelli[r.modello] : null;
    let allegati = [];
    try { allegati = JSON.parse(r.allegati || '[]'); } catch (e) { allegati = []; }
    const referente = r.referente_id ? a.referenti[r.referente_id] || '' : '';
    return {
      id: r.id, quando: dataOraIso(r.quando), canale: r.canale, direzione: r.direzione, tipo: r.tipo,
      tipoNome: (a.modelli[r.tipo] || modello || '') || TIPI_NOMI[r.tipo] || 'Messaggio',
      cliente: a.clienti[r.cliente_id] || '', idCliente: r.cliente_id || '', referente, idReferente: r.referente_id === null ? null : r.referente_id,
      idCommessa: r.commessa_id || '', a: r.a, oggetto: r.oggetto, testo: r.testo, allegati,
      stato: r.stato, statoVisto: STATI_VISTI[r.stato] || r.stato, mandatoIl: dataOraIso(r.mandato_il), errore: r.errore, motivo: r.motivo,
      modello: r.modello, proposta: r.proposta, pubblica: r.pubblica === 1, riferimento: rif,
      chi: r.utente_id ? a.utenti[r.utente_id] || '' : (r.direzione === 'entrata' && r.canale === 'portale' ? referente : ''),
    };
  },

  aiutiComunicazioni(righe) {
    const mappa = (sql, k, v) => {
      const o = {};
      this.db.righe(sql).forEach(x => { o[x[k]] = x[v]; });
      return o;
    };
    const ids = (k) => Array.from(new Set(righe.map(r => r[k]).filter(x => x !== null && x !== undefined && x !== ''))).map(Number).filter(n => !isNaN(n));
    const dentro = l => (l.length ? l.join(',') : '0');
    return {
      clienti: mappa('SELECT id, nome FROM soggetti', 'id', 'nome'),
      referenti: mappa('SELECT id, nome FROM referenti', 'id', 'nome'),
      utenti: mappa('SELECT id, nome FROM utenti', 'id', 'nome'),
      modelli: mappa('SELECT chiave, nome FROM modelli_messaggi', 'chiave', 'nome'),
      ticket: mappa('SELECT id, numero FROM ticket WHERE id IN (' + dentro(ids('ticket_id')) + ')', 'id', 'numero'),
      preventivi: (() => {
        const o = {};
        this.db.righe('SELECT id, numero, revisione FROM preventivi WHERE id IN (' + dentro(ids('preventivo_id')) + ')').forEach(p => { o[p.id] = p.numero + (p.revisione ? ' rev. ' + p.revisione : ''); });
        return o;
      })(),
      fatture: (() => {
        const o = {};
        this.db.righe('SELECT id, numero, riferimento FROM fatture WHERE id IN (' + dentro(ids('fattura_id')) + ')').forEach(f => { o[f.id] = 'Fattura ' + (f.numero || f.riferimento); });
        return o;
      })(),
      attivita: mappa('SELECT id, titolo FROM attivita WHERE id IN (' + dentro(ids('attivita_id')) + ')', 'id', 'titolo'),
      documenti: mappa('SELECT id, titolo FROM documenti WHERE id IN (' + dentro(ids('documento_id')) + ')', 'id', 'titolo'),
    };
  },

  /** Il collaboratore vede le sue: create da lui, o legate alle sue attivita', ai ticket e ai rapportini che vede; mai i pagamenti. */
  comunicazioneSua(r, vis) {
    if (!this.soloSuoi()) return true;
    if (r.fattura_id || ['promemoria_pagamento', 'secondo_promemoria_pagamento', 'avviso_parcella'].indexOf(r.tipo) >= 0) return false;
    const io = this.mioId();
    if (r.utente_id === io) return true;
    if (r.attivita_id && vis.attivita.has(r.attivita_id)) return true;
    if (r.rapportino_id && vis.rapportini.has(r.rapportino_id)) return true;
    if (r.ticket_id) {
      const t = this.db.riga('SELECT * FROM ticket WHERE id = ?', r.ticket_id);
      if (t && this.vedeTicket(t, vis.ticket)) return true;
    }
    return false;
  },

  visibilitaComunicazioni() {
    if (!this.soloSuoi()) return null;
    const io = this.mioId();
    return {
      attivita: new Set(this.db.righe('SELECT id FROM attivita WHERE assegnata_a = ? OR creata_da = ?', io, io).map(x => x.id)),
      rapportini: new Set(this.db.righe('SELECT id FROM rapportini WHERE utente_id = ?', io).map(x => x.id)),
      ticket: this.aiutiVisibilita(),
    };
  },

  /** comunicazioni {idCliente?, idCommessa?, idTicket?, idPreventivo?, idRapportino?, idFattura?, canale?, stato?, testo?, da?, a?, pagina?, conAccessi?} */
  leggiComunicazioni(d) {
    d = d || {};
    const cond = [];
    const par = [];
    if (testo(d.idCliente)) { cond.push('cliente_id = ?'); par.push(testo(d.idCliente)); }
    if (testo(d.idCommessa)) { cond.push('commessa_id = ? COLLATE NOCASE'); par.push(testo(d.idCommessa)); }
    if (testo(d.idTicket)) { cond.push('ticket_id = ?'); par.push(this.idTicketDa(d.idTicket)); }
    if (testo(d.idPreventivo)) { cond.push('preventivo_id = ?'); par.push(Number(d.idPreventivo)); }
    if (testo(d.idRapportino)) { cond.push('rapportino_id = ?'); par.push(testo(d.idRapportino)); }
    if (testo(d.idFattura)) { cond.push('fattura_id = ?'); par.push(Number(d.idFattura)); }
    if (testo(d.canale)) {
      const canali = testo(d.canale).split(',').map(s => s.trim()).filter(c => CANALI.indexOf(c) >= 0);
      if (canali.length) cond.push('canale IN (' + canali.map(c => "'" + c + "'").join(',') + ')');
    }
    if (testo(d.stato)) { cond.push('stato = ?'); par.push(testo(d.stato)); }
    if (testo(d.da)) { cond.push('substr(quando, 1, 10) >= ?'); par.push(dataIso(d.da)); }
    if (testo(d.a)) { cond.push('substr(quando, 1, 10) <= ?'); par.push(dataIso(d.a)); }
    if (testo(d.testo)) {
      cond.push('(testo LIKE ? OR oggetto LIKE ? OR a LIKE ?)');
      const t = '%' + testo(d.testo).replace(/[%_]/g, '') + '%';
      par.push(t, t, t);
    }
    let righe = this.db.righe('SELECT * FROM comunicazioni' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') + ' ORDER BY quando DESC, id DESC', ...par);
    const vis = this.visibilitaComunicazioni();
    if (vis) righe = righe.filter(r => this.comunicazioneSua(r, vis));
    if (!this.vedePagamenti()) righe = righe.filter(r => !r.fattura_id || this.livello('fatturazione') >= 1 && this.vedeCosti());
    const pagina = Math.max(1, Math.round(numero(d.pagina)) || 1);
    const quante = righe.length;
    const scelte = righe.slice((pagina - 1) * PER_PAGINA, pagina * PER_PAGINA);
    const aiuti = this.aiutiComunicazioni(scelte);
    const r = {
      ok: true, pagina, pagine: Math.max(1, Math.ceil(quante / PER_PAGINA)), quante,
      comunicazioni: scelte.map(x => this.comunicazioneDaRiga(x, aiuti)),
    };
    if (si(d.conAccessi) && testo(d.idCliente) && this.livello('portale') >= 1 && !this.soloSuoi()) r.accessi = this.righeCalmeAccessi(testo(d.idCliente));
    return r;
  },

  /** Le righe calme dello storico del cliente: "Sig. Ferretti ha visto il preventivo PR/2026/012 rev. 1". */
  righeCalmeAccessi(idCliente) {
    return this.db.righe('SELECT * FROM portale_pubblicazioni WHERE soggetto_id = ? AND visto_il IS NOT NULL ORDER BY visto_il DESC LIMIT 50', idCliente)
      .map(p => {
        const ref = p.visto_da ? this.db.riga('SELECT nome FROM referenti WHERE id = ?', p.visto_da) : null;
        return { quando: dataOraIso(p.visto_il), frase: (ref ? ref.nome : 'Il cliente') + ' ha visto ' + this.descrizionePubblicazione(p, true) };
      });
  },

  // ------------------------------------------------------------------ Da mandare

  daMandare() {
    const k = this.impComunicazioni();
    const t = oggi();
    const oraAdesso = new Date(adessoMs());
    const dalle8 = oraAdesso.getHours() >= 8;
    const usate = new Set(this.db.righe("SELECT DISTINCT proposta FROM comunicazioni WHERE proposta <> ''").map(r => r.proposta));
    const io = this.mioId();
    const soloSuoi = this.soloSuoi();
    const domaniL = lavorativoDopo(t, k.patrono);
    const out = { ok: true, oggi: [], domani: [], proposti: [], preparati: [] };

    // ---- i promemoria degli appuntamenti (§3.14)
    const attivita = this.db.righe("SELECT * FROM attivita WHERE avvisa_cliente <> '' AND stato NOT IN ('fatta', 'annullata') AND cliente_id <> '' " +
      "AND (inizio <> '' OR scadenza <> '') ORDER BY inizio, scadenza, id");
    for (const a of attivita) {
      if (soloSuoi && a.assegnata_a !== io) continue;
      const giorno = a.inizio ? dataIso(a.inizio) : a.scadenza;
      if (!giorno || giorno < t) continue;
      const chiave = 'attivita:' + a.id + ':' + giorno;
      if (usate.has(chiave)) continue;
      const quandoAvviso = lavorativiPrima(giorno, k.giorniPrima, k.patrono);
      const inizioMs = a.inizio ? Date.parse(a.inizio) : Date.parse(giorno + 'T23:59:00');
      if (inizioMs <= adessoMs()) continue;
      let gruppo = null;
      if (quandoAvviso < t || (quandoAvviso === t && dalle8)) gruppo = 'oggi';
      else if (quandoAvviso === domaniL || quandoAvviso === t) gruppo = 'domani';
      if (!gruppo) continue;
      let p;
      try {
        p = this.propostaDaMandare(chiave, 'promemoria_appuntamento', a.avvisa_cliente, { idAttivita: a.id, idCliente: a.cliente_id, idReferente: a.avvisa_referente_id });
      } catch (e) {
        continue;
      }
      if (!p) continue;
      const g = giorno === t ? 'Oggi' : giorno === piuGiorni(t, 1) ? 'Domani' : K.giornoLungo(giorno).replace(/^./, c => c.toUpperCase());
      p.dettaglio = [g + (a.inizio ? ' alle ' + K.oraBreve(dataOraIso(a.inizio)) : ''), a.titolo, p.luogo].filter(Boolean).join(' · ');
      delete p.luogo;
      out[gruppo].push(p);
    }

    // ---- i rapportini da firmare da piu' di 7 giorni (§9.5)
    const settimanaFa = piuGiorni(t, -7);
    const bozze = this.db.righe("SELECT * FROM rapportini WHERE UPPER(stato) = 'BOZZA' AND data < ? AND id_cliente <> '' ORDER BY data, id", settimanaFa);
    for (const r of bozze) {
      if (soloSuoi && r.utente_id !== io) continue;
      const chiave = 'rapportino:' + r.id;
      if (usate.has(chiave)) continue;
      const refs = this.db.righe('SELECT * FROM referenti WHERE soggetto_id = ? ORDER BY ordine, id', r.id_cliente)
        .filter(x => testo(x.telefono) || testo(x.whatsapp) || testo(x.email));
      if (!refs.length) continue;
      // Il referente della firma dell'ultimo rapportino firmato di quel cliente, se no il primo.
      const ultimo = this.db.riga("SELECT firmatario FROM rapportini WHERE id_cliente = ? AND firmatario <> '' ORDER BY firmato_il DESC, data DESC LIMIT 1", r.id_cliente);
      const ref = (ultimo && refs.find(x => x.nome === ultimo.firmatario)) || refs[0];
      const canale = ref.whatsapp_ok === 1 ? 'whatsapp' : (testo(ref.email) ? 'email' : 'whatsapp');
      let p;
      try { p = this.propostaDaMandare(chiave, 'rapportino_da_firmare', canale, { idRapportino: r.id, idReferente: ref.id }); } catch (e) { continue; }
      if (!p) continue;
      const giorni = Math.round((Date.parse(t + 'T12:00:00') - Date.parse(dataIso(r.data) + 'T12:00:00')) / 86400000);
      p.dettaglio = r.id + ' · ' + K.dataIt(dataIso(r.data)) + ' · da firmare da ' + giorni + ' giorni';
      delete p.luogo;
      out.proposti.push(p);
    }

    // ---- i promemoria di pagamento (§3.15): solo chi ha fatturazione 2 e costi
    if (this.vedePagamenti() && !soloSuoi) {
      for (const f of this.db.righe("SELECT * FROM fatture WHERE stato = 'emessa' AND tipo = 'fattura' AND solleciti_no = '' ORDER BY data, id")) {
        const pag = this.pagamentoDi(f);
        if (!(pag.residuo > 0) || !pag.primaScoperta) continue;
        const scadutaDa = Math.round((Date.parse(t + 'T12:00:00') - Date.parse(pag.primaScoperta + 'T12:00:00')) / 86400000);
        if (scadutaDa < k.solleciti) continue;
        const primo = this.db.riga("SELECT * FROM comunicazioni WHERE proposta = ? AND stato = 'mandato' ORDER BY mandato_il LIMIT 1", 'fattura:' + f.id + ':1');
        let n = 1;
        if (usate.has('fattura:' + f.id + ':1')) {
          if (!primo) continue;
          const da = Math.round((adessoMs() - Date.parse(primo.mandato_il)) / 86400000);
          if (da < k.secondo || usate.has('fattura:' + f.id + ':2')) continue;
          n = 2;
        }
        const chiave = 'fattura:' + f.id + ':' + n;
        const refPag = this.db.riga('SELECT * FROM referenti WHERE soggetto_id = ? AND pagamenti = 1 ORDER BY ordine, id LIMIT 1', f.cliente_id);
        const canale = refPag && refPag.whatsapp_ok === 1 ? 'whatsapp' : 'email';
        let p;
        try {
          p = this.propostaDaMandare(chiave, n === 1 ? 'promemoria_pagamento' : 'secondo_promemoria_pagamento', canale, { idFattura: f.id, idCliente: f.cliente_id, idReferente: refPag ? refPag.id : null });
        } catch (e) { continue; }
        if (!p) continue;
        // Senza un referente dei pagamenti: all'email del cliente (o alla PEC), mai ad altri referenti.
        if (!refPag) {
          const s = this.db.riga('SELECT * FROM soggetti WHERE id = ?', f.cliente_id);
          p.a = Object.assign({}, p.a, { idReferente: null, nome: s.nome, email: testo(s.email) || testo(s.pec), numero: '', numeroVisto: '', whatsappOk: false, fisso: false });
          p.canale = 'email';
        }
        p.importoResiduo = pag.residuo;
        p.dettaglio = 'Fattura ' + (f.numero || f.riferimento) + ' · scaduta da ' + scadutaDa + ' giorni';
        delete p.luogo;
        out.proposti.push(p);
      }
    }

    // ---- i WhatsApp preparati e non segnati mandati negli ultimi 7 giorni
    const daQuando = istante(new Date(adessoMs() - 7 * 86400000));
    let prep = this.db.righe("SELECT * FROM comunicazioni WHERE canale = 'whatsapp' AND stato = 'preparato' AND quando >= ? ORDER BY quando DESC", daQuando);
    const vis = this.visibilitaComunicazioni();
    if (vis) prep = prep.filter(r => this.comunicazioneSua(r, vis));
    const aiuti = this.aiutiComunicazioni(prep);
    out.preparati = prep.map(r => this.comunicazioneDaRiga(r, aiuti));
    return out;
  },

  /** Una proposta di Da mandare, gia' composta (null se non si puo': nessun numero ne' email). */
  propostaDaMandare(chiave, modello, canale, d) {
    const m = this.db.riga('SELECT * FROM modelli_messaggi WHERE chiave = ? AND attivo = 1', modello);
    if (!m) return null;
    let x = this.componiMessaggio(Object.assign({ modello, canale }, d));
    if (canale === 'whatsapp' && !x.a.numero && x.a.email) x = this.componiMessaggio(Object.assign({ modello, canale: 'email' }, d));
    if (canale === 'email' && !x.a.email && x.a.numero) x = this.componiMessaggio(Object.assign({ modello, canale: 'whatsapp' }, d));
    if (!x.a.numero && !x.a.email) return null;
    return {
      proposta: chiave, tipo: modello, titolo: m.nome, dettaglio: '', canale: x.canale,
      a: { idReferente: x.a.idReferente, nome: x.a.nome, cliente: x.a.cliente, numero: x.a.numero, numeroVisto: x.a.numeroVisto, email: x.a.email, whatsappOk: x.a.whatsappOk, fisso: x.a.fisso },
      riferimento: x.riferimento ? { tipo: x.riferimento.tipo, id: x.riferimento.id } : null, modello, testo: x.testo, oggetto: x.oggetto || K.riempi(m.oggetto, {}).testo,
      mancano: x.mancano, luogo: '',
    };
  },

  // ------------------------------------------------------------------ azioni di §10.2

  preparaMessaggio(d) {
    d = d || {};
    this.controllaMessaggioSuo(d);
    const x = this.componiMessaggio(d);
    if (x.canale === 'whatsapp') {
      if (!x.a.telefono) throw new Rifiuto(x.a.nome + ' non ha un numero di telefono');
      if (!x.a.numero) throw new Rifiuto('Il numero ' + x.a.telefono + ' non sembra un numero di telefono');
    }
    const o = {
      ok: true, testo: x.testo, oggetto: x.oggetto,
      a: { idReferente: x.a.idReferente, nome: x.a.nome, cliente: x.a.cliente, numero: x.a.numero, numeroVisto: x.a.numeroVisto, email: x.a.email, whatsappOk: x.a.whatsappOk, fisso: x.a.fisso },
      mancano: x.mancano,
    };
    if (x.link) o.link = x.link;
    if (x.ultimoMovimento !== undefined) o.ultimoMovimento = x.ultimoMovimento;
    return o;
  },

  salvaMessaggio(d) {
    const x = (d && d.messaggio) || {};
    const k = this.impComunicazioni();
    const idLocale = testo(x.idLocale);
    if (idLocale) {
      const gia = this.db.riga('SELECT * FROM comunicazioni WHERE id_locale = ?', idLocale);
      if (gia) return { ok: true, comunicazione: this.comunicazioneDaRiga(gia) };
    }
    const canale = testo(x.canale);
    if (['whatsapp', 'telefonata', 'nota'].indexOf(canale) < 0) throw new Rifiuto('Canale: whatsapp, telefonata o nota');
    const legamiIn = { idAttivita: x.idAttivita, idTicket: x.idTicket, idPreventivo: x.idPreventivo, idRapportino: x.idRapportino, idFattura: x.idFattura, idCommessa: x.idCommessa };
    this.controllaMessaggioSuo(legamiIn);
    const corpo = testo(x.testo);
    if (!corpo) throw new Rifiuto('Testo: scrivi il messaggio');
    let ref = vuoto(x.idReferente) ? null : this.db.riga('SELECT * FROM referenti WHERE id = ?', Number(x.idReferente));
    if (!vuoto(x.idReferente) && !ref) throw new Rifiuto('Referente ' + x.idReferente + ' non trovato');
    let idCliente = testo(x.idCliente) || (ref ? ref.soggetto_id : '');
    const proposta = testo(x.proposta);
    const modello = testo(x.modello);
    if (modello) this.modelloMessaggio(modello);
    // Una telefonata o una nota in entrata e' "ricevuto" (come i messaggi del cliente: §5.4), qualunque stato arrivi.
    const entrata = testo(x.direzione) === 'entrata' && canale !== 'whatsapp';
    const stato = entrata ? 'ricevuto' : testo(x.stato) || (canale === 'whatsapp' ? 'preparato' : 'mandato');
    if (['preparato', 'mandato', 'ricevuto'].indexOf(stato) < 0 || (stato === 'ricevuto' && !entrata)) throw new Rifiuto('Stato: preparato o mandato');
    const v = this.valoriMessaggio(Object.assign({ idCliente }, legamiIn), null);
    idCliente = idCliente || v.idCliente;
    if (canale === 'whatsapp') {
      if (corpo.length > k.testoMax) throw new Rifiuto('Il messaggio è più lungo di ' + C.numeroIt(k.testoMax, 0, 0) + ' caratteri: accorcialo');
      if (!ref) ref = this.referenteDiCliente(idCliente);
      if (!ref) throw new Rifiuto('Il cliente non ha un referente: aggiungilo prima di scrivergli su WhatsApp');
      if (ref.whatsapp_ok !== 1) {
        if (!si(x.segnaSi) && !si(d.segnaSi)) throw new Rifiuto(ref.nome + ' non ha detto di sì a WhatsApp', { serveConferma: true });
        this.segnaWhatsapp({ idReferente: ref.id, ok: true });
      }
    }
    const direzione = testo(x.direzione) === 'entrata' && canale !== 'whatsapp' ? 'entrata' : 'uscita';
    let a = testo(x.a);
    if (!a && ref && canale === 'whatsapp') {
      const n = K.numeroWhatsapp(testo(ref.whatsapp) || testo(ref.telefono));
      a = n.valido ? n.visto : '';
    }
    const quando = testo(x.quando) ? istante(new Date(x.quando)) : adesso();
    const id = this.scriviComunicazione(Object.assign({}, v.legami, {
      id_locale: idLocale || null, quando: quando || adesso(), canale, direzione, tipo: testo(x.tipo) || modello || 'libero', modello, proposta,
      cliente_id: idCliente, referente_id: ref ? ref.id : null, a, testo: corpo, oggetto: testo(x.oggetto),
      stato, mandato_il: stato === 'mandato' ? quando || adesso() : '',
    }));
    const nota = canale === 'whatsapp' ? (stato === 'mandato' ? 'messaggio WhatsApp preparato; segnato mandato' : 'messaggio WhatsApp preparato') : '';
    if (nota) this.annota('comunicazioni', id, null, null, nota);
    return { ok: true, comunicazione: this.comunicazioneDaRiga(this.db.riga('SELECT * FROM comunicazioni WHERE id = ?', id)) };
  },

  segnaMandato(d) {
    const r = this.db.riga('SELECT * FROM comunicazioni WHERE id = ?', Number(d.id) || 0);
    if (!r) throw new Rifiuto('Comunicazione ' + testo(d.id) + ' non trovata');
    const vis = this.visibilitaComunicazioni();
    if (vis && !this.comunicazioneSua(r, vis)) throw new Rifiuto('Comunicazione ' + testo(d.id) + ' non trovata');
    if (si(d.mandato) && r.stato === 'preparato') this.aggiorna('comunicazioni', r.id, { stato: 'mandato', mandato_il: adesso(), modificato: adesso() }, 'id', 'segnato mandato');
    return { ok: true, comunicazione: this.comunicazioneDaRiga(this.db.riga('SELECT * FROM comunicazioni WHERE id = ?', r.id)) };
  },

  /** mandaEmail: dal postino, con rispondiA l'email dello studio. Lo stesso idLocale non la rimanda. */
  async mandaEmail(d) {
    const x = (d && d.messaggio) || {};
    const idLocale = testo(x.idLocale);
    if (idLocale) {
      const gia = this.db.riga('SELECT * FROM comunicazioni WHERE id_locale = ?', idLocale);
      if (gia && gia.stato === 'mandato') return { ok: true, comunicazione: this.comunicazioneDaRiga(gia) };
    }
    const legamiIn = { idAttivita: x.idAttivita, idTicket: x.idTicket, idPreventivo: x.idPreventivo, idRapportino: x.idRapportino, idFattura: x.idFattura, idCommessa: x.idCommessa };
    this.controllaMessaggioSuo(legamiIn);
    const a = testo(x.a);
    if (!a) throw new Rifiuto('A chi va? Scrivi l\'email');
    if (!/^[^@\s]+@[^@\s]+$/.test(a)) throw new Rifiuto('Email: manca la @ o c\'è uno spazio');
    const oggetto = testo(x.oggetto);
    const corpo = testo(x.testo);
    if (!corpo) throw new Rifiuto('Testo: scrivi il messaggio');
    if (testo(x.modello)) {
      const m = this.modelloMessaggio(x.modello);
      if (m.uso === 'pagamento' && !this.vedePagamenti()) throw senzaPermesso('mandare i promemoria di pagamento');
    }
    if (!this.postino || !this.postino.configurato()) throw new Rifiuto('Le email non sono collegate: manca il postino (WISPER_POSTINO_URL nel .env del server)');
    const ref = vuoto(x.idReferente) ? null : this.db.riga('SELECT * FROM referenti WHERE id = ?', Number(x.idReferente));
    const v = this.valoriMessaggio(Object.assign({ idCliente: testo(x.idCliente) || (ref ? ref.soggetto_id : '') }, legamiIn), null);
    const imp = this.leggiImpostazioni();
    const posta = { a, nome: testo(imp.RAGIONE_SOCIALE) || 'Wisper', oggetto: oggetto || ' ', messaggio: corpo };
    if (testo(x.cc)) posta.cc = testo(x.cc);
    if (testo(imp.EMAIL)) posta.rispondiA = testo(imp.EMAIL);
    let errore = null;
    try {
      const r = await this.postino.email(posta);
      this.segnaQuotaPostino(r);
    } catch (err) {
      errore = err;
    }
    const riga = Object.assign({}, v.legami, {
      id_locale: idLocale && !this.db.riga('SELECT id FROM comunicazioni WHERE id_locale = ?', idLocale) ? idLocale : null,
      canale: 'email', direzione: 'uscita', tipo: testo(x.modello) || 'libero', modello: testo(x.modello), proposta: testo(x.proposta),
      cliente_id: testo(x.idCliente) || (ref ? ref.soggetto_id : '') || v.idCliente, referente_id: ref ? ref.id : null, a, oggetto, testo: corpo,
      stato: errore ? 'errore' : 'mandato', errore: errore ? errore.message : '',
    });
    const id = this.db.transazione(() => this.scriviComunicazione(riga));
    const com = this.comunicazioneDaRiga(this.db.riga('SELECT * FROM comunicazioni WHERE id = ?', id));
    if (errore) return Object.assign({ ok: false, errore: 'L\'email non è partita: ' + errore.message, comunicazione: com }, errore.rete ? { rete: true } : {});
    return { ok: true, comunicazione: com };
  },

  nonMandare(d) {
    const proposta = testo(d.proposta);
    if (!/^(attivita|rapportino|fattura):/.test(proposta)) throw new Rifiuto('Proposta sconosciuta: ' + proposta);
    if (/^fattura:/.test(proposta) && !this.vedePagamenti()) throw senzaPermesso('vedere i promemoria di pagamento');
    if (si(d.annulla)) {
      for (const r of this.db.righe("SELECT * FROM comunicazioni WHERE proposta = ? AND stato = 'non_mandato'", proposta)) {
        this.db.esegui('DELETE FROM comunicazioni WHERE id = ?', r.id);
        this.annota('comunicazioni', r.id, Object.assign({}, r), null, 'proposta di nuovo da mandare');
      }
      return { ok: true };
    }
    if (this.db.riga('SELECT id FROM comunicazioni WHERE proposta = ?', proposta)) return { ok: true };
    const [tipo, id] = proposta.split(':');
    const legami = tipo === 'attivita' ? { idAttivita: id } : tipo === 'rapportino' ? { idRapportino: id } : { idFattura: id };
    let v = { legami: {}, idCliente: '' };
    try { v = this.valoriMessaggio(legami, null); } catch (e) { /* la cosa non c'e' piu': si segna lo stesso */ }
    const motivo = testo(d.motivo).slice(0, 500);
    const idC = this.scriviComunicazione(Object.assign({}, v.legami, {
      canale: tipo === 'fattura' ? 'email' : 'whatsapp', tipo: tipo === 'attivita' ? 'promemoria_appuntamento' : tipo === 'rapportino' ? 'rapportino_da_firmare' : 'promemoria_pagamento',
      proposta, stato: 'non_mandato', motivo, cliente_id: v.idCliente || '',
    }));
    this.annota('comunicazioni', idC, null, null, 'non mandato: ' + (motivo || 'senza motivo'));
    return { ok: true };
  },

  segnaWhatsapp(d) {
    if (this.livello('clienti') < 2 && this.livello('comunicazioni') < 2) throw senzaPermesso('segnare il sì a WhatsApp');
    const r = this.db.riga('SELECT * FROM referenti WHERE id = ?', Number(d.idReferente) || 0);
    if (!r) throw new Rifiuto('Referente ' + testo(d.idReferente) + ' non trovato');
    const ok = si(d.ok);
    if ((r.whatsapp_ok === 1) !== ok) {
      this.aggiorna('referenti', r.id, { whatsapp_ok: ok ? 1 : 0, whatsapp_ok_il: ok ? oggi() : '' }, 'id', ok ? 'WhatsApp: ha detto di sì' : 'WhatsApp: non vuole più');
    }
    return { ok: true, referente: this.referentePubblico(this.db.riga('SELECT * FROM referenti WHERE id = ?', r.id)) };
  },

  leggiModelliMessaggi() {
    const modelli = this.db.righe('SELECT * FROM modelli_messaggi ORDER BY ordine, nome').filter(m => m.uso !== 'pagamento' || this.vedePagamenti())
      .map(m => ({ chiave: m.chiave, nome: m.nome, canale: m.canale, uso: m.uso, oggetto: m.oggetto, testo: m.testo, attivo: m.attivo === 1, sistema: m.sistema === 1, ordine: m.ordine }));
    const segnaposti = {};
    Object.keys(K.SEGNAPOSTI).forEach(k => { segnaposti[k] = K.SEGNAPOSTI[k].slice(); });
    return { ok: true, modelli, segnaposti };
  },

  salvaModelloMessaggio(d) {
    const x = (d && d.modello) || {};
    const k = this.impComunicazioni();
    const prima = testo(x.chiave) ? this.db.riga('SELECT * FROM modelli_messaggi WHERE chiave = ?', testo(x.chiave)) : null;
    if (testo(x.chiave) && !prima) throw new Rifiuto('Modello sconosciuto: ' + testo(x.chiave));
    if (prima && prima.sistema === 1 && this.livello('amministrazione') < 2) throw senzaPermesso('cambiare i modelli di sistema');
    const p = prima || {};
    const nome = x.nome !== undefined ? testo(x.nome) : p.nome;
    if (!nome) throw new Rifiuto('Nome: scrivi come si chiama');
    const canale = x.canale !== undefined ? testo(x.canale) : p.canale || 'tutti';
    if (K.CANALI_MODELLO.indexOf(canale) < 0) throw new Rifiuto('Canale: whatsapp, email o tutti');
    const uso = x.uso !== undefined ? testo(x.uso) : p.uso || 'libero';
    if (K.USI.indexOf(uso) < 0) throw new Rifiuto('Uso: appuntamento, intervento, preventivo, rapportino, pagamento, portale o libero');
    if (uso === 'pagamento' && !this.vedePagamenti()) throw senzaPermesso('scrivere i modelli dei promemoria di pagamento');
    const corpo = x.testo !== undefined ? String(x.testo || '').trim() : p.testo;
    if (!corpo) throw new Rifiuto('Testo: scrivi il messaggio');
    const oggetto = x.oggetto !== undefined ? testo(x.oggetto) : p.oggetto || '';
    K.controllaSegnaposti(corpo, uso);
    K.controllaSegnaposti(oggetto, uso);
    if (canale !== 'email' && corpo.length > k.testoMax) throw new Rifiuto('Il messaggio è più lungo di ' + C.numeroIt(k.testoMax, 0, 0) + ' caratteri: per WhatsApp accorcialo');
    const attivo = x.attivo !== undefined ? (si(x.attivo) ? 1 : 0) : prima ? p.attivo : 1;
    const c = this.chi();
    const v = { nome, canale, uso, oggetto, testo: corpo, attivo, modificato: adesso(), modificato_da: c.utente ? c.utente.id : null };
    let chiave;
    if (prima) {
      chiave = prima.chiave;
      this.aggiorna('modelli_messaggi', chiave, v, 'chiave');
    } else {
      const base = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'modello';
      chiave = base;
      for (let i = 2; this.db.riga('SELECT chiave FROM modelli_messaggi WHERE chiave = ?', chiave); i++) chiave = base + '_' + i;
      const ordine = (this.db.riga('SELECT MAX(ordine) m FROM modelli_messaggi').m || 0) + 1;
      this.inserisci('modelli_messaggi', Object.assign({ chiave, sistema: 0, ordine }, v), 'chiave');
    }
    const m = this.db.riga('SELECT * FROM modelli_messaggi WHERE chiave = ?', chiave);
    return { ok: true, modello: { chiave: m.chiave, nome: m.nome, canale: m.canale, uso: m.uso, oggetto: m.oggetto, testo: m.testo, attivo: m.attivo === 1, sistema: m.sistema === 1, ordine: m.ordine } };
  },

  togliModelloMessaggio(d) {
    const m = this.modelloMessaggio(d.chiave);
    if (m.sistema === 1) throw new Rifiuto('È un modello di sistema: non si toglie, si spegne');
    if (m.uso === 'pagamento' && !this.vedePagamenti()) throw senzaPermesso('togliere i modelli dei promemoria di pagamento');
    this.db.esegui('DELETE FROM modelli_messaggi WHERE chiave = ?', m.chiave);
    this.annota('modelli_messaggi', m.chiave, Object.assign({}, m), null, 'tolto');
    return { ok: true };
  },

  nonSollecitare(d) {
    if (!this.vedePagamenti()) throw senzaPermesso('cambiare i promemoria di pagamento');
    const f = this.rigaFattura(d.idFattura);
    const motivo = testo(d.motivo).slice(0, 300);
    this.aggiorna('fatture', f.id, { solleciti_no: motivo }, 'id', motivo ? 'niente promemoria di pagamento: ' + motivo : 'promemoria di pagamento di nuovo proposti');
    return { ok: true, fattura: this.fatturaCompleta(this.rigaFattura(f.id)) };
  },

  // ------------------------------------------------------------------ notifiche (§3.16, §9.7, §10.3)

  /**
   * Una notifica a ognuna di queste persone (id degli utenti), tranne a chi ha fatto la cosa. collegamento come la
   * Dashboard. Gli utenti disattivati non la ricevono.
   */
  notifica(utenti, tipo, titolo, dettaglio, collegamento) {
    const c = this.chi();
    const chiE = c.utente ? c.utente.id : null;
    const ora = adesso();
    const fatti = new Set();
    for (const u of utenti || []) {
      const id = Number(u);
      if (!id || id === chiE || fatti.has(id)) continue;
      if (!this.db.riga('SELECT id FROM utenti WHERE id = ? AND attivo = 1', id)) continue;
      fatti.add(id);
      this.db.esegui('INSERT INTO notifiche (utente_id, tipo, titolo, dettaglio, collegamento, creata) VALUES (?, ?, ?, ?, ?, ?)',
        id, tipo, testo(titolo).slice(0, 200), testo(dettaglio).slice(0, 300), collegamento ? JSON.stringify(collegamento) : null, ora);
    }
    return fatti.size;
  },

  /** Gli utenti attivi di questi ruoli. */
  utentiDeiRuoli(ruoli) {
    return this.db.righe('SELECT id FROM utenti WHERE attivo = 1 AND ruolo IN (' + ruoli.map(() => '?').join(',') + ')', ...ruoli).map(u => u.id);
  },

  /** Chi ha ticket 2 (titolare, amministrazione, collaboratori se il ruolo lo da'). */
  utentiConModulo(modulo, livello) {
    return this.db.righe('SELECT id, ruolo FROM utenti WHERE attivo = 1').filter(u => (this.permessiDi(u.ruolo)[modulo] || 0) >= livello && u.ruolo !== 'esterno').map(u => ({ id: u.id, ruolo: u.ruolo }));
  },

  leggiNotifiche(d) {
    d = d || {};
    const io = this.mioId();
    const tutte = this.db.righe('SELECT * FROM notifiche WHERE utente_id = ? ' + (si(d.soloNuove) ? 'AND letta_il IS NULL ' : '') + 'ORDER BY creata DESC, id DESC', io || 0);
    const pagina = Math.max(1, Math.round(numero(d.pagina)) || 1);
    const nuove = this.db.riga('SELECT COUNT(*) n FROM notifiche WHERE utente_id = ? AND letta_il IS NULL', io || 0).n;
    return {
      ok: true, nuove,
      notifiche: tutte.slice((pagina - 1) * NOTIFICHE_PER_PAGINA, pagina * NOTIFICHE_PER_PAGINA).map(n => {
        let col = null;
        try { col = n.collegamento ? JSON.parse(n.collegamento) : null; } catch (e) { col = null; }
        return { id: n.id, tipo: n.tipo, titolo: n.titolo, dettaglio: n.dettaglio, collegamento: col, creata: dataOraIso(n.creata), letta: !!n.letta_il, mostrata: !!n.telefono_il };
      }),
    };
  },

  segnaLette(d) {
    const io = this.mioId() || 0;
    if (si(d.tutte)) this.db.esegui('UPDATE notifiche SET letta_il = ? WHERE utente_id = ? AND letta_il IS NULL', adesso(), io);
    else for (const id of Array.isArray(d.ids) ? d.ids : []) this.db.esegui('UPDATE notifiche SET letta_il = ? WHERE id = ? AND utente_id = ? AND letta_il IS NULL', adesso(), Number(id) || 0, io);
    return { ok: true, nuove: this.db.riga('SELECT COUNT(*) n FROM notifiche WHERE utente_id = ? AND letta_il IS NULL', io).n };
  },

  segnaMostrate(d) {
    const io = this.mioId() || 0;
    for (const id of Array.isArray(d.ids) ? d.ids : []) this.db.esegui('UPDATE notifiche SET telefono_il = ? WHERE id = ? AND utente_id = ? AND telefono_il IS NULL', adesso(), Number(id) || 0, io);
    return { ok: true };
  },

  salvaPreferenzeNotifiche(d) {
    const c = this.chi();
    if (!c.utente) throw new Rifiuto('Le preferenze sono di una persona');
    this.aggiorna('utenti', c.utente.id, { notifiche_telefono: si(d.telefono) ? 1 : 0 });
    return { ok: true };
  },

  /** Le notifiche piu' vecchie di NOTIFICHE_CONSERVA_GIORNI (la pulizia della notte e del giro di ogni ora). */
  puliziaNotifiche() {
    const giorni = Math.max(1, Math.round(numero(this.leggiImpostazioni().NOTIFICHE_CONSERVA_GIORNI)) || 90);
    this.db.esegui('DELETE FROM notifiche WHERE creata < ?', istante(new Date(adessoMs() - giorni * 86400000)));
  },

  /** Alle 8:00, una volta al giorno: "2 messaggi da mandare oggi" a chi deve mandarli (le proposte sue). */
  notificaDaMandare() {
    const t = oggi();
    if (new Date(adessoMs()).getHours() < 8) return 0;
    let n = 0;
    for (const u of this.db.righe("SELECT * FROM utenti WHERE attivo = 1 AND ruolo IN ('titolare', 'amministrazione', 'collaboratore')")) {
      if (this.db.riga("SELECT id FROM notifiche WHERE utente_id = ? AND tipo = 'da_mandare' AND substr(creata, 1, 10) = ?", u.id, t)) continue;
      const p = this.come({ utente: { id: u.id, nome: u.nome, email: u.email, ruolo: u.ruolo }, permessi: this.permessiDi(u.ruolo) }, () => this.daMandare());
      if (!p.oggi.length) continue;
      const nomi = Array.from(new Set(p.oggi.map(x => x.a.nome))).slice(0, 4);
      this.db.esegui('INSERT INTO notifiche (utente_id, tipo, titolo, dettaglio, collegamento, creata) VALUES (?, ?, ?, ?, ?, ?)', u.id, 'da_mandare',
        p.oggi.length === 1 ? '1 messaggio da mandare oggi' : p.oggi.length + ' messaggi da mandare oggi', nomi.join(', '),
        JSON.stringify({ pagina: 'comunicazioni', filtro: { segmento: 'damandare' } }), adesso());
      n++;
    }
    return n;
  },
};

Object.defineProperties(module.exports, {
  lavorativiPrima: { value: lavorativiPrima },
  lavorativoDopo: { value: lavorativoDopo },
  STATI_VISTI_COMUNICAZIONI: { value: STATI_VISTI },
});
