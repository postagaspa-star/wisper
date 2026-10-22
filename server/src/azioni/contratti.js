/*
 * Contratti di assistenza (fase 5, accordo in docs/gestionale/fase5.md §3.5 e
 * §8). Ogni contratto ha la sua commessa (nasce quando il contratto si attiva,
 * "Assistenza {titolo}", a corpo): il canone si fattura con le scadenze di
 * pagamento della commessa, che la fase 4 sa gia' portare in Da fatturare, e
 * ore, km e spese dei ticket del contratto finiscono nel costo della commessa
 * (si vede se il contratto rende). Le visite periodiche sono scadenze con
 * azione "ticket": 30 giorni prima nasce da solo il ticket programmato.
 */
'use strict';

const { Rifiuto, senzaPermesso, testo, numero, centesimi, adesso, oggi, dataIso, dataDaIso, dataOraIso, piuGiorni } = require('../utili');
const C = require('../conti');

const vuoto = v => v === undefined || v === null || v === '';
const si = v => v === true || v === 1 || v === '1' || v === 'true';
const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');
const giorniTra = (da, a) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(da + 'T12:00:00')) / 86400000);
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = C.MESI;
const giornoLungo = iso => (iso ? GIORNI[new Date(iso + 'T12:00:00').getDay()] + ' ' + Number(iso.slice(8, 10)) + ' ' + MESI[Number(iso.slice(5, 7)) - 1] : '');
const FATTURAZIONI = ['annuale', 'semestrale', 'trimestrale', 'mensile', 'nessuna'];
const PRIORITA = ['urgente', 'alta', 'normale', 'bassa'];
/** "Cabina MT Acme" -> "cabina MT Acme" dentro una frase (le sigle restano: "MT", "PLC"). */
const minuscola = s => (s && /^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s || '');

module.exports = {
  /** Scrivono i contratti: ticket 2 e il permesso dei soldi in scrittura (il canone e' un prezzo). */
  controllaScriveContratti() {
    if (this.chi().sistema) return;
    if (this.livello('ticket') < 2 || this.livello('costi') < 2) throw senzaPermesso('scrivere i contratti di assistenza');
  },

  rigaContratto(id) {
    const s = testo(id);
    const c = /^\d+$/.test(s) ? this.db.riga('SELECT * FROM contratti WHERE id = ?', Number(s)) : this.db.riga('SELECT * FROM contratti WHERE numero = ?', s);
    if (!c) throw new Rifiuto('Contratto ' + s + ' non trovato');
    return c;
  },

  prossimoNumeroContratto(anno) {
    return this.prossimoNumero('contratto', this.db.righe('SELECT numero FROM contratti').map(r => r.numero), anno || new Date().getFullYear());
  },

  /** L'ultimo giorno per mandare la disdetta: al - giorni di preavviso. */
  disdettaEntro(c) {
    return c.rinnovo === 'tacito' && c.al ? piuGiorni(c.al, -(c.disdetta_giorni || 0)) : '';
  },

  /**
   * Lo stato visto (§8.1): Bozza, Attivo, In scadenza (senza rinnovo a 60
   * giorni dalla fine, tacito a 30 giorni dall'ultimo giorno per la disdetta),
   * Scaduto (oltre la fine senza rinnovo), Disdetto ("finisce il 31/12"), Chiuso.
   */
  statoVistoContratto(c) {
    const t = oggi();
    if (c.stato === 'bozza') return { statoVisto: 'Bozza', statoDettaglio: '' };
    if (c.stato === 'chiuso') return { statoVisto: 'Chiuso', statoDettaglio: '' };
    if (c.stato === 'disdetto') return { statoVisto: 'Disdetto', statoDettaglio: (c.al >= t ? 'finisce il ' : 'finito il ') + dataIt(c.al) };
    if (c.rinnovo === 'no') {
      if (c.al < t) return { statoVisto: 'Scaduto', statoDettaglio: 'finito il ' + dataIt(c.al) };
      if (giorniTra(t, c.al) <= 60) return { statoVisto: 'In scadenza', statoDettaglio: 'scade il ' + dataIt(c.al) };
      return { statoVisto: 'Attivo', statoDettaglio: '' };
    }
    const entro = this.disdettaEntro(c);
    if (entro && entro >= t && giorniTra(t, entro) <= 30) return { statoVisto: 'In scadenza', statoDettaglio: 'disdetta entro ' + giornoLungo(entro) };
    return { statoVisto: 'Attivo', statoDettaglio: '' };
  },

  /** Le rate del canone (scadenze di pagamento della commessa) con lo stato: prevista, in bozza, fatturata. */
  rateContratto(c) {
    return this.db.righe('SELECT * FROM scadenze_pagamento WHERE contratto_id = ? ORDER BY data, id', c.id).map(s => {
      const a = this.sorgenteAttiva('scadenza', s.id);
      let stato = s.stato === 'fatturata' ? 'fatturata' : 'prevista';
      let statoVisto = stato === 'fatturata' ? 'Fatturata fuori da Wisper' : 'Prevista';
      if (a && ['bozza', 'pronta'].indexOf(a.stato) >= 0) { stato = 'in_bozza'; statoVisto = 'In bozza ' + a.riferimento; }
      else if (a) { stato = 'fatturata'; statoVisto = 'Fatturata ' + (a.numero || a.riferimento); }
      else if (s.stato === 'fatturata' && s.fattura_id) {
        const f = this.db.riga('SELECT numero, riferimento FROM fatture WHERE id = ?', s.fattura_id);
        statoVisto = 'Fatturata ' + (f ? f.numero || f.riferimento : '');
      }
      return { id: s.id, descrizione: s.descrizione, data: s.data, importo: numero(s.importo), stato, statoVisto };
    });
  },

  contrattoDaRiga(c, completo) {
    const cliente = this.db.riga('SELECT nome FROM soggetti WHERE id = ?', c.cliente_id) || {};
    const m = c.commessa_id ? this.db.riga('SELECT id, descrizione FROM commesse WHERE id = ?', c.commessa_id) : null;
    const v = this.statoVistoContratto(c);
    let tempi = null;
    try { tempi = c.tempi ? JSON.parse(c.tempi) : null; } catch (e) { tempi = null; }
    const impianti = this.db.righe('SELECT i.*, s.nome FROM contratto_impianti i LEFT JOIN sedi s ON s.id = i.sede_id WHERE i.contratto_id = ? ORDER BY i.sede_id', c.id).map(i => {
      const s = this.db.riga("SELECT * FROM scadenze WHERE contratto_id = ? AND sede_id = ? AND tipo = 'manutenzione' AND stato = 'aperta' ORDER BY data LIMIT 1", c.id, i.sede_id);
      return { idSede: i.sede_id, nome: i.nome || '', ogniMesi: i.ogni_mesi === null ? null : i.ogni_mesi, primaVisita: i.prima_visita, prossimaVisita: s ? s.data : '', idScadenza: s ? s.id : null };
    });
    const anno = oggi().slice(0, 4);
    const tk = this.db.righe("SELECT stato, aperto_il FROM ticket WHERE contratto_id = ? AND stato <> 'annullato'", c.id);
    const doc = c.documento_id ? this.db.riga('SELECT id, titolo, vede FROM documenti WHERE id = ?', c.documento_id) : null;
    const o = {
      id: c.id, numero: c.numero, titolo: c.titolo, idCliente: c.cliente_id, cliente: cliente.nome || '',
      idCommessa: m ? m.id : c.commessa_id, commessa: m ? m.descrizione : '', idPreventivo: c.preventivo_id === null ? null : c.preventivo_id,
      dal: c.dal, al: c.al, rinnovo: c.rinnovo, disdettaGiorni: c.disdetta_giorni, disdettaEntro: this.disdettaEntro(c),
      stato: c.stato, statoVisto: v.statoVisto, statoDettaglio: v.statoDettaglio,
      canone: c.canone === null ? null : c.canone, fatturazioneCanone: c.fatturazione_canone, copre: c.copre, materialiInclusi: c.materiali_inclusi === 1,
      tariffaExtra: c.tariffa_extra === null ? null : c.tariffa_extra, tempi,
      impianti, ticket: { aperti: tk.filter(t => ['aperto', 'in_carico', 'in_attesa', 'risolto'].indexOf(t.stato) >= 0).length, anno: tk.filter(t => String(t.aperto_il).slice(0, 4) === anno).length },
      documento: doc && this.vedeDocumento(doc) ? { id: doc.id, titolo: doc.titolo } : null,
      disdettoIl: c.disdetto_il, motivo: c.motivo, note: c.note,
      puoScrivere: this.livello('ticket') >= 2 && this.livello('costi') >= 2 && c.stato !== 'chiuso',
      creato: dataOraIso(c.creato), modificato: dataOraIso(c.modificato),
    };
    if (completo) {
      o.rate = this.rateContratto(c);
      // Se il contratto rende: il canone del periodo, il costo dei suoi ticket, il lavoro fuori contratto fatturato.
      const tickets = this.db.righe("SELECT * FROM ticket WHERE contratto_id = ? AND stato <> 'annullato'", c.id).filter(t => {
        const g = dataIso(t.aperto_il);
        return g >= c.dal && g <= c.al;
      });
      const costo = centesimi(tickets.reduce((tot, t) => tot + this.costoDelTicket(t).totale, 0));
      let extra = 0;
      for (const t of tickets) {
        const r = this.db.riga("SELECT SUM(r.importo) imp FROM fattura_righe r JOIN fatture f ON f.id = r.fattura_id WHERE f.stato = 'emessa' AND f.tipo = 'fattura' AND r.tipo = 'compenso' AND r.gruppo = ?", 'ticket:' + t.numero);
        extra += numero(r && r.imp);
      }
      o.costoTicket = costo;
      o.rende = { canone: numero(c.canone), costo, fatturatoExtra: centesimi(extra), margine: centesimi(numero(c.canone) + extra - costo), ticket: tickets.length };
    }
    return o;
  },

  /** contratti {stato?, idCliente?, testo?} (ticket 1). */
  leggiContratti(d) {
    d = d || {};
    let righe = this.db.righe('SELECT * FROM contratti ORDER BY dal DESC, id DESC');
    if (testo(d.idCliente)) righe = righe.filter(c => c.cliente_id === testo(d.idCliente));
    if (testo(d.stato)) righe = righe.filter(c => c.stato === testo(d.stato));
    const P = require('../documenti').pulisciRicerca;
    const cerca = P(d.testo);
    let lista = righe.map(c => this.contrattoDaRiga(c, false));
    if (cerca) lista = lista.filter(c => cerca.split(' ').every(p => P([c.numero, c.titolo, c.cliente, c.idCommessa].join(' ')).indexOf(p) >= 0));
    return { ok: true, oggi: oggi(), contratti: lista };
  },

  /** Valida e normalizza i tempi promessi (solo le voci che cambiano rispetto a TICKET_TEMPI). */
  tempiContratto(v) {
    if (vuoto(v)) return null;
    let o = v;
    if (typeof v === 'string') { try { o = JSON.parse(v); } catch (e) { throw new Rifiuto('Tempi: non si capiscono'); } }
    if (!o || typeof o !== 'object') throw new Rifiuto('Tempi: non si capiscono');
    const out = {};
    for (const p of Object.keys(o)) {
      if (PRIORITA.indexOf(p) < 0) throw new Rifiuto('Tempi: urgente, alta, normale o bassa');
      const x = {};
      for (const k of ['presa', 'intervento']) {
        if (vuoto(o[p] && o[p][k])) continue;
        const n = numero(o[p][k]);
        if (!(n > 0 && n <= 2000)) throw new Rifiuto('Tempi: le ore devono essere più di zero');
        x[k] = n;
      }
      if (Object.keys(x).length) out[p] = x;
    }
    return Object.keys(out).length ? JSON.stringify(out) : null;
  },

  /**
   * salvaContratto {contratto: {id?, idCliente, titolo, dal, al?, rinnovo?, disdettaGiorni?, canone?, fatturazioneCanone?,
   * copre?, materialiInclusi?, tariffaExtra?, tempi?, idCommessa?, idPreventivo?, idDocumento?, note?, impianti: [{idSede, ogniMesi?, primaVisita?}]}}.
   * In bozza si cambia tutto; attivo: titolo, note, tempi, impianti, documento (canone e periodo con rinnovaContratto).
   */
  salvaContratto(d, opzioni) {
    this.controllaScriveContratti();
    const x = (d && d.contratto) || d || {};
    const prima = testo(x.id) ? this.rigaContratto(x.id) : null;
    if (prima && prima.stato === 'chiuso') throw new Rifiuto('Il contratto ' + prima.numero + ' è chiuso');
    const bozza = !prima || prima.stato === 'bozza';
    const idCliente = x.idCliente !== undefined ? testo(x.idCliente) : prima ? prima.cliente_id : '';
    if (!idCliente) throw new Rifiuto('Cliente: scegli il cliente');
    const cliente = this.db.riga('SELECT * FROM soggetti WHERE id = ?', idCliente);
    if (!cliente) throw new Rifiuto('Cliente: scegli il cliente');
    const titolo = x.titolo !== undefined ? testo(x.titolo) : prima ? prima.titolo : '';
    if (!titolo) throw new Rifiuto('Titolo: scrivi di che contratto si tratta');
    const v = { titolo, note: x.note !== undefined ? testo(x.note) : prima ? prima.note : '' };
    if (x.tempi !== undefined) v.tempi = this.tempiContratto(x.tempi);
    if (x.idDocumento !== undefined) {
      v.documento_id = vuoto(x.idDocumento) ? null : Number(x.idDocumento);
      if (v.documento_id !== null) this.rigaDocumento(v.documento_id);
    }
    const economici = {};
    if (bozza) {
      if (vuoto(x.dal) && !prima) throw new Rifiuto('Dal: scrivi da quando vale');
      const dal = !vuoto(x.dal) ? dataDaIso(x.dal) : prima.dal;
      const al = !vuoto(x.al) ? dataDaIso(x.al) : prima && x.dal === undefined ? prima.al : piuGiorni(C.piuMesi(dal, 12), -1);
      if (al <= dal) throw new Rifiuto('Al: deve venire dopo Dal');
      const rinnovo = x.rinnovo !== undefined ? testo(x.rinnovo) || 'tacito' : prima ? prima.rinnovo : 'tacito';
      if (['tacito', 'no'].indexOf(rinnovo) < 0) throw new Rifiuto('Rinnovo: tacito o no');
      const disdetta = x.disdettaGiorni !== undefined && !vuoto(x.disdettaGiorni) ? Math.round(numero(x.disdettaGiorni)) : prima ? prima.disdetta_giorni : 60;
      if (!(disdetta >= 0 && disdetta <= 365)) throw new Rifiuto('Preavviso di disdetta: da 0 a 365 giorni');
      const canone = x.canone !== undefined ? (vuoto(x.canone) ? null : centesimi(numero(x.canone))) : prima ? prima.canone : null;
      if (canone !== null && canone < 0) throw new Rifiuto('Canone: non può essere negativo');
      const fatt = x.fatturazioneCanone !== undefined ? testo(x.fatturazioneCanone) || 'annuale' : prima ? prima.fatturazione_canone : 'annuale';
      if (FATTURAZIONI.indexOf(fatt) < 0) throw new Rifiuto('Come si fattura il canone: annuale, semestrale, trimestrale, mensile o nessuna');
      const copre = x.copre !== undefined ? testo(x.copre) || 'visite' : prima ? prima.copre : 'visite';
      if (['visite', 'visite_guasti'].indexOf(copre) < 0) throw new Rifiuto('Copre: visite o visite_guasti');
      const tariffa = x.tariffaExtra !== undefined ? (vuoto(x.tariffaExtra) ? null : centesimi(numero(x.tariffaExtra))) : prima ? prima.tariffa_extra : null;
      if (tariffa !== null && tariffa < 0) throw new Rifiuto('Tariffa fuori contratto: non può essere negativa');
      let idCommessa = x.idCommessa !== undefined ? testo(x.idCommessa) : prima ? prima.commessa_id : '';
      if (idCommessa) {
        const m = this.db.riga('SELECT id, cliente_id FROM commesse WHERE id = ?', idCommessa);
        if (!m) throw new Rifiuto('Commessa ' + idCommessa + ' non trovata');
        if (m.cliente_id !== idCliente) throw new Rifiuto('La commessa ' + m.id + ' è di un altro cliente');
        idCommessa = m.id;
      }
      const idPreventivo = x.idPreventivo !== undefined ? (vuoto(x.idPreventivo) ? null : Number(x.idPreventivo)) : prima ? prima.preventivo_id : null;
      if (idPreventivo !== null && !this.db.riga('SELECT id FROM preventivi WHERE id = ?', idPreventivo)) throw new Rifiuto('Preventivo ' + idPreventivo + ' non trovato');
      Object.assign(economici, {
        cliente_id: idCliente, dal, al, rinnovo, disdetta_giorni: disdetta, canone, fatturazione_canone: fatt, copre,
        materiali_inclusi: x.materialiInclusi !== undefined ? (si(x.materialiInclusi) ? 1 : 0) : prima ? prima.materiali_inclusi : 0,
        tariffa_extra: tariffa, commessa_id: idCommessa, preventivo_id: idPreventivo,
      });
    } else {
      // Attivo: canone e periodo non si cambiano qui (valgono per le rate gia' nate).
      const diversi = [];
      if (x.idCliente !== undefined && testo(x.idCliente) !== prima.cliente_id) diversi.push('cliente');
      if (x.dal !== undefined && dataDaIso(x.dal) !== prima.dal) diversi.push('dal');
      if (x.al !== undefined && !vuoto(x.al) && dataDaIso(x.al) !== prima.al) diversi.push('al');
      if (x.canone !== undefined && centesimi(numero(x.canone)) !== centesimi(numero(prima.canone))) diversi.push('canone');
      if (x.fatturazioneCanone !== undefined && testo(x.fatturazioneCanone) !== prima.fatturazione_canone) diversi.push('rate');
      if (diversi.length) throw new Rifiuto('Il contratto ' + prima.numero + ' è attivo: canone e periodo si cambiano con Rinnova');
      if (x.copre !== undefined) {
        if (['visite', 'visite_guasti'].indexOf(testo(x.copre)) < 0) throw new Rifiuto('Copre: visite o visite_guasti');
        v.copre = testo(x.copre);
      }
      if (x.materialiInclusi !== undefined) v.materiali_inclusi = si(x.materialiInclusi) ? 1 : 0;
      if (x.tariffaExtra !== undefined) v.tariffa_extra = vuoto(x.tariffaExtra) ? null : centesimi(numero(x.tariffaExtra));
      if (x.rinnovo !== undefined && ['tacito', 'no'].indexOf(testo(x.rinnovo)) >= 0) v.rinnovo = testo(x.rinnovo);
      if (x.disdettaGiorni !== undefined && !vuoto(x.disdettaGiorni)) v.disdetta_giorni = Math.round(numero(x.disdettaGiorni));
    }
    // Gli impianti coperti (l'elenco intero), ognuno del cliente, con le visite ogni N mesi.
    let impianti = null;
    if (Array.isArray(x.impianti)) {
      impianti = [];
      const visti = new Set();
      for (const i of x.impianti) {
        const idSede = Number(i && i.idSede);
        const s = this.db.riga('SELECT * FROM sedi WHERE id = ?', idSede);
        if (!s || s.soggetto_id !== idCliente) throw new Rifiuto('Impianto ' + testo(i && i.idSede) + ' non è di ' + cliente.nome);
        if (visti.has(idSede)) continue;
        visti.add(idSede);
        const ogni = vuoto(i.ogniMesi) ? null : Math.round(numero(i.ogniMesi));
        if (ogni !== null && !(ogni >= 1 && ogni <= 60)) throw new Rifiuto('Ogni: da 1 a 60 mesi');
        impianti.push({ sede_id: idSede, ogni_mesi: ogni, prima_visita: !vuoto(i.primaVisita) ? dataDaIso(i.primaVisita) : '' });
      }
    }
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('contratti', id, Object.assign(v, economici, { modificato: ora }));
    } else {
      const anno = Number(economici.dal.slice(0, 4));
      const n = opzioni && opzioni.numero ? { numero: opzioni.numero, codice: require('../formati').formatta(this.numerazione('contratto').formato, anno, opzioni.numero) } : this.prossimoNumeroContratto(anno);
      if (this.db.riga('SELECT id FROM contratti WHERE numero = ?', n.codice)) throw new Rifiuto('Il numero ' + n.codice + ' è già usato');
      id = this.inserisci('contratti', Object.assign({ numero: n.codice, stato: 'bozza', tempi: null, documento_id: null }, v, economici,
        { creato_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora }));
      this.segnaNumero('contratto', n.numero);
    }
    if (impianti) this.scriviImpianti(id, impianti);
    return { ok: true, contratto: this.contrattoDaRiga(this.db.riga('SELECT * FROM contratti WHERE id = ?', id), true) };
  },

  /** L'elenco degli impianti di un contratto; se e' attivo le visite si rifanno dalla prossima. */
  scriviImpianti(idContratto, impianti) {
    const c = this.db.riga('SELECT * FROM contratti WHERE id = ?', idContratto);
    const vecchi = new Map(this.db.righe('SELECT * FROM contratto_impianti WHERE contratto_id = ?', idContratto).map(i => [i.sede_id, i]));
    const nuovi = new Set(impianti.map(i => i.sede_id));
    for (const [sede, i] of vecchi) {
      if (nuovi.has(sede)) continue;
      this.db.esegui('DELETE FROM contratto_impianti WHERE contratto_id = ? AND sede_id = ?', idContratto, sede);
      this.annota('contratto_impianti', idContratto + '.' + sede, { ogni_mesi: i.ogni_mesi, prima_visita: i.prima_visita }, null, 'tolto dal contratto');
      if (c.stato !== 'bozza') this.annullaVisite(c, sede, 'impianto tolto dal contratto');
    }
    for (const i of impianti) {
      const v = vecchi.get(i.sede_id);
      if (!v) {
        this.db.esegui('INSERT INTO contratto_impianti (contratto_id, sede_id, ogni_mesi, prima_visita) VALUES (?, ?, ?, ?)', idContratto, i.sede_id, i.ogni_mesi, i.prima_visita);
        this.annota('contratto_impianti', idContratto + '.' + i.sede_id, null, { ogni_mesi: i.ogni_mesi, prima_visita: i.prima_visita });
        if (c.stato === 'attivo' || c.stato === 'disdetto') this.creaVisita(c, Object.assign({ contratto_id: idContratto }, i));
      } else if (v.ogni_mesi !== i.ogni_mesi || v.prima_visita !== i.prima_visita) {
        this.db.esegui('UPDATE contratto_impianti SET ogni_mesi = ?, prima_visita = ? WHERE contratto_id = ? AND sede_id = ?', i.ogni_mesi, i.prima_visita, idContratto, i.sede_id);
        this.annota('contratto_impianti', idContratto + '.' + i.sede_id, { ogni_mesi: v.ogni_mesi, prima_visita: v.prima_visita }, { ogni_mesi: i.ogni_mesi, prima_visita: i.prima_visita });
        if (c.stato === 'attivo' || c.stato === 'disdetto') {
          const aperta = this.db.riga("SELECT * FROM scadenze WHERE contratto_id = ? AND sede_id = ? AND tipo = 'manutenzione' AND stato = 'aperta' ORDER BY data LIMIT 1", idContratto, i.sede_id);
          if (aperta && !i.ogni_mesi) this.annullaVisite(c, i.sede_id, 'visite tolte dal contratto');
          else if (aperta) {
            const cambi = { ogni_mesi: i.ogni_mesi, modificato: adesso() };
            if (i.prima_visita && i.prima_visita !== v.prima_visita && !aperta.ticket_id) cambi.data = i.prima_visita;
            this.aggiorna('scadenze', aperta.id, cambi);
          } else this.creaVisita(c, Object.assign({ contratto_id: idContratto }, i));
        }
      }
    }
  },

  /** La scadenza delle visite di un impianto (tipo manutenzione, azione ticket, dalla data prevista). */
  creaVisita(c, i, da) {
    if (!i.ogni_mesi) return null;
    const sede = this.db.riga('SELECT * FROM sedi WHERE id = ?', i.sede_id);
    let data = da || i.prima_visita || C.piuMesi(c.dal, i.ogni_mesi);
    if (data < c.dal) data = c.dal;
    if (!this.contrattoCopre(c.id, data)) return null;
    const imp = this.leggiImpostazioni();
    const anticipo = Math.round(numero(imp.ANTICIPO_TICKET_GIORNI)) || 30;
    const ora = adesso();
    const id = this.inserisci('scadenze', {
      titolo: 'Manutenzione ' + (sede ? minuscola(sede.nome) : ''), tipo: 'manutenzione', cliente_id: c.cliente_id, sede_id: i.sede_id, contratto_id: c.id, data,
      preavviso_giorni: anticipo, ogni_mesi: i.ogni_mesi, dalla_fatta: 0, azione: 'ticket', anticipo_giorni: anticipo, stato: 'aperta',
      creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
    });
    this.db.esegui('UPDATE contratto_impianti SET scadenza_id = ? WHERE contratto_id = ? AND sede_id = ?', id, c.id, i.sede_id);
    return id;
  },

  annullaVisite(c, idSede, motivo) {
    for (const s of this.db.righe("SELECT id FROM scadenze WHERE contratto_id = ? AND stato = 'aperta' AND tipo = 'manutenzione'" + (idSede !== null && idSede !== undefined ? ' AND sede_id = ?' : ''),
      ...[c.id].concat(idSede !== null && idSede !== undefined ? [idSede] : []))) {
      this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo, modificato: adesso() });
    }
  },

  /** Le rate del canone di un periodo, come scadenze di pagamento "a data" della commessa del contratto. */
  creaRate(c, dal, al) {
    const rate = C.rateCanone(dal, al, c.canone, c.fatturazione_canone);
    const max = this.db.riga('SELECT MAX(ordine) n FROM scadenze_pagamento WHERE commessa_id = ?', c.commessa_id);
    let ordine = (max && max.n) || 0;
    for (const r of rate) {
      this.inserisci('scadenze_pagamento', {
        preventivo_id: null, commessa_id: c.commessa_id, descrizione: r.descrizione, tipo: 'importo', valore: r.importo, quando: 'data', data: r.data,
        importo: r.importo, stato: 'prevista', ordine: ++ordine, contratto_id: c.id,
      });
    }
    return rate.length;
  },

  /** La scadenza "Disdetta del contratto": la voce della Dashboard, a ogni periodo con rinnovo tacito. */
  creaScadenzaDisdetta(c) {
    if (c.rinnovo !== 'tacito') return null;
    const data = this.disdettaEntro(c);
    if (!data) return null;
    const gia = this.db.riga("SELECT id FROM scadenze WHERE contratto_id = ? AND tipo = 'contratto' AND data = ?", c.id, data);
    if (gia) return gia.id;
    const ora = adesso();
    return this.inserisci('scadenze', {
      titolo: 'Disdetta del contratto ' + c.numero, tipo: 'contratto', cliente_id: c.cliente_id, contratto_id: c.id, data, preavviso_giorni: 30,
      ogni_mesi: null, dalla_fatta: 0, azione: 'promemoria', stato: 'aperta', creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
    });
  },

  /**
   * attivaContratto {id}: da bozza ad attivo. Nasce la commessa (se non c'e'),
   * nascono le rate del canone del periodo e le scadenze delle visite.
   */
  attivaContratto(d) {
    this.controllaScriveContratti();
    const c = this.rigaContratto(d.id);
    if (c.stato === 'attivo') return { ok: true, contratto: this.contrattoDaRiga(c, true) };
    if (c.stato !== 'bozza') throw new Rifiuto('Il contratto ' + c.numero + ' non è in bozza');
    const impianti = this.db.righe('SELECT * FROM contratto_impianti WHERE contratto_id = ? ORDER BY sede_id', c.id);
    const ora = adesso();
    let idCommessa = c.commessa_id;
    if (!idCommessa) {
      const m = this.creaCommessa({ idCliente: c.cliente_id, descrizione: /^assistenza /i.test(c.titolo) ? c.titolo : 'Assistenza ' + c.titolo, inizio: c.dal, finePrevista: c.al });
      idCommessa = m.id;
      const io = this.chi().utente ? this.chi().utente.id : null;
      this.aggiorna('commesse', idCommessa, {
        sede_id: impianti.length ? impianti[0].sede_id : null, responsabile_id: io, modo_fatturazione: 'corpo',
        importo_contratto: c.canone, budget_euro: c.canone, note: 'Dal contratto ' + c.numero, contratto_id: c.id, modificato: ora,
      });
    } else {
      this.aggiorna('commesse', idCommessa, { contratto_id: c.id, modificato: ora });
    }
    this.aggiorna('contratti', c.id, { stato: 'attivo', commessa_id: idCommessa, modificato: ora }, 'id', 'contratto attivato');
    const attivo = this.db.riga('SELECT * FROM contratti WHERE id = ?', c.id);
    this.creaRate(attivo, attivo.dal, attivo.al);
    for (const i of impianti) this.creaVisita(attivo, i);
    this.creaScadenzaDisdetta(attivo);
    this.generaTicketDaScadenze();
    return { ok: true, contratto: this.contrattoDaRiga(this.db.riga('SELECT * FROM contratti WHERE id = ?', c.id), true) };
  },

  /** Un periodo nuovo: dal = vecchio al + 1 giorno, al (di base 12 mesi), le rate nuove col canone di adesso, le visite che continuano. */
  allungaContratto(c, al, nota) {
    const dal = piuGiorni(c.al, 1);
    const nuovoAl = al || piuGiorni(C.piuMesi(dal, 12), -1);
    if (nuovoAl <= dal) throw new Rifiuto('Al: deve venire dopo ' + dataIt(dal));
    this.aggiorna('contratti', c.id, { dal, al: nuovoAl, modificato: adesso() }, 'id', nota);
    // La commessa del contratto finisce con lui.
    if (c.commessa_id) this.aggiorna('commesse', c.commessa_id, { fine_prevista: nuovoAl, modificato: adesso() });
    const dopo = this.db.riga('SELECT * FROM contratti WHERE id = ?', c.id);
    this.creaRate(dopo, dal, nuovoAl);
    for (const i of this.db.righe('SELECT * FROM contratto_impianti WHERE contratto_id = ?', c.id)) {
      if (!i.ogni_mesi) continue;
      const aperta = this.db.riga("SELECT id FROM scadenze WHERE contratto_id = ? AND sede_id = ? AND tipo = 'manutenzione' AND stato = 'aperta'", c.id, i.sede_id);
      if (aperta) continue;
      // Le visite si erano fermate alla fine del periodo: ripartono dall'ultima prevista.
      const ultima = this.db.riga("SELECT data FROM scadenze WHERE contratto_id = ? AND sede_id = ? AND tipo = 'manutenzione' AND stato <> 'annullata' ORDER BY data DESC LIMIT 1", c.id, i.sede_id);
      let data = ultima ? C.piuMesi(ultima.data, i.ogni_mesi) : (i.prima_visita || C.piuMesi(dal, i.ogni_mesi));
      while (data < dal) data = C.piuMesi(data, i.ogni_mesi);
      this.creaVisita(dopo, i, data);
    }
    this.creaScadenzaDisdetta(dopo);
    return dopo;
  },

  /** rinnovaContratto {id, al?, canone?, fatturazioneCanone?}: il periodo nuovo (il canone nuovo vale per le rate nuove). */
  rinnovaContratto(d) {
    this.controllaScriveContratti();
    const c = this.rigaContratto(d.id);
    if (c.stato !== 'attivo') throw new Rifiuto(c.stato === 'bozza' ? 'Il contratto è in bozza: attivalo' : 'Il contratto ' + c.numero + ' è ' + (c.stato === 'disdetto' ? 'disdetto' : 'chiuso'));
    const cambi = {};
    if (!vuoto(d.canone)) {
      const canone = centesimi(numero(d.canone));
      if (canone < 0) throw new Rifiuto('Canone: non può essere negativo');
      cambi.canone = canone;
    }
    if (!vuoto(d.fatturazioneCanone)) {
      if (FATTURAZIONI.indexOf(testo(d.fatturazioneCanone)) < 0) throw new Rifiuto('Come si fattura il canone: annuale, semestrale, trimestrale, mensile o nessuna');
      cambi.fatturazione_canone = testo(d.fatturazioneCanone);
    }
    if (Object.keys(cambi).length) this.aggiorna('contratti', c.id, Object.assign(cambi, { modificato: adesso() }));
    if (cambi.canone !== undefined && c.commessa_id) this.aggiorna('commesse', c.commessa_id, { importo_contratto: cambi.canone });
    this.allungaContratto(this.db.riga('SELECT * FROM contratti WHERE id = ?', c.id), !vuoto(d.al) ? dataDaIso(d.al) : null, 'rinnovato');
    this.generaTicketDaScadenze();
    return { ok: true, contratto: this.contrattoDaRiga(this.db.riga('SELECT * FROM contratti WHERE id = ?', c.id), true) };
  },

  /** disdiciContratto {id, data, motivo}: disdetto, finisce ad "al", nessun rinnovo. */
  disdiciContratto(d) {
    this.controllaScriveContratti();
    const c = this.rigaContratto(d.id);
    if (c.stato === 'disdetto') return { ok: true, contratto: this.contrattoDaRiga(c, true) };
    if (c.stato !== 'attivo') throw new Rifiuto('Si disdice un contratto attivo');
    const motivo = testo(d.motivo);
    if (!motivo) throw new Rifiuto('Scrivi il motivo');
    const data = !vuoto(d.data) ? dataDaIso(d.data) : oggi();
    this.aggiorna('contratti', c.id, { stato: 'disdetto', disdetto_il: data, motivo, modificato: adesso() }, 'id', 'disdetto: ' + motivo);
    for (const s of this.db.righe("SELECT * FROM scadenze WHERE contratto_id = ? AND tipo = 'contratto' AND stato = 'aperta'", c.id)) {
      this.aggiorna('scadenze', s.id, { stato: 'fatta', fatta_il: data, modificato: adesso() }, 'id', 'disdetta mandata');
    }
    return { ok: true, contratto: this.contrattoDaRiga(this.db.riga('SELECT * FROM contratti WHERE id = ?', c.id), true) };
  },

  /** chiudiContratto {id, conferma?}: finito adesso; visite e rate future (non ancora in una fattura) si tolgono, con conferma. */
  chiudiContratto(d) {
    this.controllaScriveContratti();
    const c = this.rigaContratto(d.id);
    if (c.stato === 'chiuso') return { ok: true, contratto: this.contrattoDaRiga(c, true) };
    const t = oggi();
    const rate = this.db.righe("SELECT * FROM scadenze_pagamento WHERE contratto_id = ? AND stato = 'prevista' AND data > ?", c.id, t).filter(s => !this.sorgenteAttiva('scadenza', s.id));
    const visite = this.db.righe("SELECT * FROM scadenze WHERE contratto_id = ? AND stato = 'aperta'", c.id);
    if (!si(d.conferma) && (rate.length || visite.length)) {
      return { ok: false, serveConferma: true,
        errore: 'Chiudo il contratto ' + c.numero + ' adesso: tolgo ' + rate.length + (rate.length === 1 ? ' rata non ancora fatturata' : ' rate non ancora fatturate') +
          ' e ' + visite.length + (visite.length === 1 ? ' scadenza' : ' scadenze') + ' (visite e disdetta). Va bene?' };
    }
    for (const s of rate) {
      this.db.esegui('DELETE FROM scadenze_pagamento WHERE id = ?', s.id);
      this.annota('scadenze_pagamento', s.id, { descrizione: s.descrizione, data: s.data, importo: s.importo }, null, 'tolta: il contratto ' + c.numero + ' è chiuso');
    }
    for (const s of visite) this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo: 'contratto chiuso', modificato: adesso() });
    this.aggiorna('contratti', c.id, { stato: 'chiuso', modificato: adesso() }, 'id', 'contratto chiuso');
    return { ok: true, contratto: this.contrattoDaRiga(this.db.riga('SELECT * FROM contratti WHERE id = ?', c.id), true) };
  },

  /** Ogni notte: i contratti con rinnovo tacito finiti (e non disdetti) si allungano di 12 mesi. Torna quanti. */
  rinnoviContratti() {
    let n = 0;
    const t = oggi();
    for (const c of this.db.righe("SELECT * FROM contratti WHERE stato = 'attivo' AND rinnovo = 'tacito' AND al < ?", t)) {
      let x = c;
      for (let giri = 0; x.al < t && giri < 20; giri++) x = this.allungaContratto(x, null, 'rinnovato da solo');
      n++;
    }
    if (n) this.generaTicketDaScadenze();
    return n;
  },
};
