/*
 * Scadenze (fase 5, accordo in docs/gestionale/fase5.md §6): verifiche degli
 * impianti (DPR 462), documenti che scadono, visite dei contratti, polizze,
 * disdette. Una tabella sola, che il calendario della fase 2 mostra senza
 * copiarla. Quando una scadenza chiede lavoro (azione "ticket") diventa un
 * ticket programmato, una volta sola, anticipo_giorni prima della data.
 *
 * Le periodicita' proposte (§6.3) sono proposte, non legge scritta da Wisper:
 * le conferma il perito (e vanno confermate con Manuel).
 */
'use strict';

const { Rifiuto, senzaPermesso, testo, numero, adesso, oggi, dataIso, dataDaIso, dataOraIso, piuGiorni } = require('../utili');
const C = require('../conti');

const TIPI = ['verifica_terra', 'verifica_scariche', 'verifica_protezioni', 'manutenzione', 'documento', 'polizza', 'contratto', 'altro'];
const NOMI_TIPI = {
  verifica_terra: 'Verifica impianto di terra', verifica_scariche: 'Verifica protezione dalle scariche', verifica_protezioni: 'Verifica protezioni SPG e SPI',
  manutenzione: 'Manutenzione', documento: 'Documento', polizza: 'Polizza', contratto: 'Contratto', altro: 'Altro',
};
/** Gli ambienti a maggior rischio: le verifiche DPR 462 ogni 2 anni invece di 5. */
const AMBIENTI_RISCHIO = ['cantiere', 'medico', 'incendio', 'esplosione'];
const TITOLI_PROPOSTI = {
  verifica_terra: 'Verifica impianto di terra (DPR 462)',
  verifica_scariche: 'Verifica protezione dalle scariche (DPR 462)',
  verifica_protezioni: 'Verifica protezioni SPG e SPI',
};
const vuoto = v => v === undefined || v === null || v === '';
const si = v => v === true || v === 1 || v === '1' || v === 'true';
const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');
const dataBreve = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '');
const giorniTra = (da, a) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(da + 'T12:00:00')) / 86400000);
/** Le scadenze dei contratti (visite e disdette) sono del modulo ticket; le altre dei documenti. */
const delContratto = s => s.tipo === 'manutenzione' || s.tipo === 'contratto' || !!s.contratto_id;

module.exports = {
  // ------------------------------------------------------------------ chi vede, chi scrive

  vedeScadenza(s) {
    const modulo = delContratto(s) ? 'ticket' : 'documenti';
    if (this.livello(modulo) < 1) return false;
    if (s.documento_id) {
      const d = this.db.riga('SELECT * FROM documenti WHERE id = ?', s.documento_id);
      if (d && !this.vedeLivello(d.vede)) return false;
    }
    return true;
  },

  puoScrivereScadenza(s) {
    return this.livello(delContratto(s) ? 'ticket' : 'documenti') >= 2 && this.vedeScadenza(s);
  },

  rigaScadenza(id) {
    const s = this.db.riga('SELECT * FROM scadenze WHERE id = ?', Number(id) || 0);
    if (!s || !this.vedeScadenza(s)) throw new Rifiuto('Scadenza ' + testo(id) + ' non trovata');
    return s;
  },

  /** Lo stato visto (§6.1): Scaduta, Scade fra N giorni (oggi, domani), Prossima, Fatta, Annullata. */
  statoScadenza(s) {
    if (s.stato === 'fatta') return { statoVisto: 'Fatta', statoDettaglio: 'il ' + dataBreve(dataIso(s.fatta_il)), giorni: null };
    if (s.stato === 'annullata') return { statoVisto: 'Annullata', statoDettaglio: s.motivo || '', giorni: null };
    const g = giorniTra(oggi(), s.data);
    if (g < 0) return { statoVisto: 'Scaduta', statoDettaglio: 'da ' + (-g === 1 ? '1 giorno' : -g + ' giorni'), giorni: -g };
    if (g <= s.preavviso_giorni) {
      return { statoVisto: g === 0 ? 'Scade oggi' : g === 1 ? 'Scade domani' : 'Scade fra ' + g + ' giorni', statoDettaglio: '', giorni: g };
    }
    return { statoVisto: 'Prossima', statoDettaglio: dataIt(s.data), giorni: g };
  },

  /** In che gruppo sta una scadenza aperta: scadute, entro (nel preavviso), piuAvanti. */
  gruppoScadenza(s) {
    const g = giorniTra(oggi(), s.data);
    return g < 0 ? 'scadute' : g <= s.preavviso_giorni ? 'entro' : 'piuAvanti';
  },

  aiutiScadenze() {
    const a = { clienti: {}, sedi: {}, documenti: {}, ticket: {}, contratti: {}, utenti: {} };
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { a.clienti[s.id] = s.nome; });
    this.db.righe('SELECT id, nome FROM sedi').forEach(s => { a.sedi[s.id] = s.nome; });
    this.db.righe('SELECT id, titolo FROM documenti').forEach(d => { a.documenti[d.id] = d.titolo; });
    this.db.righe('SELECT id, numero FROM ticket').forEach(t => { a.ticket[t.id] = t.numero; });
    this.db.righe('SELECT id, numero FROM contratti').forEach(c => { a.contratti[c.id] = c.numero; });
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { a.utenti[u.id] = u.nome; });
    return a;
  },

  scadenzaDaRiga(s, a) {
    a = a || this.aiutiScadenze();
    const v = this.statoScadenza(s);
    return {
      id: s.id, titolo: s.titolo, tipo: s.tipo, tipoNome: NOMI_TIPI[s.tipo] || s.tipo,
      idCliente: s.cliente_id, cliente: s.cliente_id ? a.clienti[s.cliente_id] || '' : '',
      idSede: s.sede_id === null ? null : s.sede_id, impianto: s.sede_id ? a.sedi[s.sede_id] || '' : '',
      idContratto: s.contratto_id === null ? null : s.contratto_id, contratto: s.contratto_id ? a.contratti[s.contratto_id] || '' : '',
      data: s.data, preavvisoGiorni: s.preavviso_giorni, ogniMesi: s.ogni_mesi === null ? null : s.ogni_mesi, dallaFatta: s.dalla_fatta === 1,
      azione: s.azione, anticipoGiorni: s.anticipo_giorni === null ? null : s.anticipo_giorni,
      stato: s.stato, statoVisto: v.statoVisto, statoDettaglio: v.statoDettaglio, giorni: v.giorni,
      fattaIl: dataIso(s.fatta_il) || '', motivo: s.motivo,
      idDocumento: s.documento_id === null ? null : s.documento_id, documento: s.documento_id ? a.documenti[s.documento_id] || '' : '',
      idDocumentoFatto: s.documento_fatto_id === null ? null : s.documento_fatto_id,
      idTicket: s.ticket_id === null ? null : s.ticket_id, ticket: s.ticket_id ? a.ticket[s.ticket_id] || '' : '',
      idProssima: s.prossima_id === null ? null : s.prossima_id,
      assegnataA: s.assegnata_a === null ? null : s.assegnata_a, assegnata: s.assegnata_a ? a.utenti[s.assegnata_a] || '' : '',
      note: s.note, puoScrivere: this.puoScrivereScadenza(s) && s.stato === 'aperta',
      creato: dataOraIso(s.creato), modificato: dataOraIso(s.modificato),
    };
  },

  /**
   * scadenze {da?, a?, stato?, tipo?, idCliente?, idSede?, idContratto?, idDocumento?}.
   * Senza date e con le aperte: divise in scadute, entro (nel preavviso), piuAvanti.
   * Con da/a (il calendario) o con un altro stato: l'elenco "scadenze".
   */
  leggiScadenze(d) {
    d = d || {};
    const stato = testo(d.stato) || 'aperte';
    if (['aperte', 'fatte', 'annullate', 'tutte'].indexOf(stato) < 0) throw new Rifiuto('Stato: aperte, fatte, annullate o tutte');
    const cond = [];
    const par = [];
    if (stato !== 'tutte') { cond.push('stato = ?'); par.push({ aperte: 'aperta', fatte: 'fatta', annullate: 'annullata' }[stato]); }
    const da = testo(d.da) ? dataDaIso(d.da) : '';
    const a = testo(d.a) ? dataDaIso(d.a) : '';
    if (da) { cond.push('data >= ?'); par.push(da); }
    if (a) { cond.push('data <= ?'); par.push(a); }
    if (testo(d.tipo)) { cond.push('tipo = ?'); par.push(testo(d.tipo)); }
    if (testo(d.idCliente)) { cond.push('cliente_id = ?'); par.push(testo(d.idCliente)); }
    if (testo(d.idSede)) { cond.push('sede_id = ?'); par.push(Number(d.idSede)); }
    if (testo(d.idContratto)) { cond.push('contratto_id = ?'); par.push(Number(d.idContratto)); }
    if (testo(d.idDocumento)) { cond.push('documento_id = ?'); par.push(Number(d.idDocumento)); }
    const righe = this.db.righe('SELECT * FROM scadenze' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') + ' ORDER BY data, id', ...par)
      .filter(s => this.vedeScadenza(s));
    const aiuti = this.aiutiScadenze();
    const lista = righe.map(s => this.scadenzaDaRiga(s, aiuti));
    if (!da && !a && stato === 'aperte') {
      const g = { scadute: [], entro: [], piuAvanti: [] };
      righe.forEach((s, i) => g[this.gruppoScadenza(s)].push(lista[i]));
      return { ok: true, oggi: oggi(), scadute: g.scadute, entro: g.entro, piuAvanti: g.piuAvanti,
        conteggi: { scadute: g.scadute.length, entro: g.entro.length, piuAvanti: g.piuAvanti.length } };
    }
    return { ok: true, oggi: oggi(), da, a, scadenze: lista };
  },

  // ------------------------------------------------------------------ le proposte (§6.3)

  /**
   * Le proposte di una scadenza di quel tipo per quell'impianto: ogni quanti
   * mesi, da quando si conta, il preavviso, l'azione. Da confermare con Manuel.
   */
  propostaScadenza(tipo, sede, contratto) {
    const imp = this.leggiImpostazioni();
    if (tipo === 'verifica_terra' || tipo === 'verifica_scariche') {
      const rischio = sede && AMBIENTI_RISCHIO.indexOf(sede.ambiente) >= 0;
      return { ogniMesi: rischio ? 24 : 60, dallaFatta: true, preavvisoGiorni: 90, azione: 'promemoria', titolo: TITOLI_PROPOSTI[tipo] };
    }
    if (tipo === 'verifica_protezioni') return { ogniMesi: 60, dallaFatta: true, preavvisoGiorni: 90, azione: 'promemoria', titolo: TITOLI_PROPOSTI[tipo] };
    if (tipo === 'manutenzione') {
      let ogni = null;
      if (contratto && sede) {
        const ci = this.db.riga('SELECT ogni_mesi FROM contratto_impianti WHERE contratto_id = ? AND sede_id = ?', contratto.id, sede.id);
        if (ci) ogni = ci.ogni_mesi;
      }
      return { ogniMesi: ogni, dallaFatta: false, preavvisoGiorni: Math.round(numero(imp.ANTICIPO_TICKET_GIORNI)) || 30, azione: 'ticket',
        anticipoGiorni: Math.round(numero(imp.ANTICIPO_TICKET_GIORNI)) || 30, titolo: sede ? 'Manutenzione ' + (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(sede.nome) ? sede.nome.charAt(0).toLowerCase() + sede.nome.slice(1) : sede.nome) : 'Manutenzione' };
    }
    if (tipo === 'contratto') return { ogniMesi: null, dallaFatta: false, preavvisoGiorni: 30, azione: 'promemoria', titolo: contratto ? 'Disdetta del contratto ' + contratto.numero : '' };
    return { ogniMesi: null, dallaFatta: false, preavvisoGiorni: Math.round(numero(imp.PREAVVISO_GIORNI)) || 60, azione: 'promemoria', titolo: '' };
  },

  // ------------------------------------------------------------------ scrittura

  /**
   * salvaScadenza {scadenza: {id?, titolo, tipo, idCliente?, idSede?, idDocumento?, idContratto?, data, preavvisoGiorni?,
   * ogniMesi?, dallaFatta?, azione?, anticipoGiorni?, assegnataA?, note?}}. Senza ogniMesi e con l'impianto, le proposte di §6.3.
   */
  salvaScadenza(d) {
    const x = (d && d.scadenza) || d || {};
    const prima = testo(x.id) ? this.rigaScadenza(x.id) : null;
    if (prima && prima.stato !== 'aperta') throw new Rifiuto('La scadenza è già ' + (prima.stato === 'fatta' ? 'fatta' : 'tolta') + ': non si cambia');
    const p = prima || {};
    const tipo = x.tipo !== undefined ? testo(x.tipo) || 'altro' : prima ? prima.tipo : 'altro';
    if (TIPI.indexOf(tipo) < 0) throw new Rifiuto('Tipo: ' + TIPI.slice(0, -1).join(', ') + ' o altro');
    // Cliente, impianto, documento, contratto.
    const idSede = x.idSede !== undefined ? (vuoto(x.idSede) ? null : Number(x.idSede)) : prima ? prima.sede_id : null;
    const sede = idSede !== null ? this.db.riga('SELECT * FROM sedi WHERE id = ?', idSede) : null;
    if (idSede !== null && !sede) throw new Rifiuto('Impianto ' + idSede + ' non trovato');
    const idContratto = x.idContratto !== undefined ? (vuoto(x.idContratto) ? null : Number(x.idContratto)) : prima ? prima.contratto_id : null;
    const contratto = idContratto !== null ? this.db.riga('SELECT * FROM contratti WHERE id = ?', idContratto) : null;
    if (idContratto !== null && !contratto) throw new Rifiuto('Contratto ' + idContratto + ' non trovato');
    const idDocumento = x.idDocumento !== undefined ? (vuoto(x.idDocumento) ? null : Number(x.idDocumento)) : prima ? prima.documento_id : null;
    if (idDocumento !== null) this.rigaDocumento(idDocumento);
    let idCliente = x.idCliente !== undefined ? testo(x.idCliente) : prima ? prima.cliente_id : '';
    if (!idCliente && sede) idCliente = sede.soggetto_id;
    if (!idCliente && contratto) idCliente = contratto.cliente_id;
    if (idCliente && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', idCliente)) throw new Rifiuto('Cliente ' + idCliente + ' non trovato');
    if (sede && idCliente && sede.soggetto_id !== idCliente) {
      const nome = (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', idCliente) || {}).nome || idCliente;
      throw new Rifiuto('Impianto ' + sede.id + ' non trovato tra quelli di ' + nome);
    }
    // Il permesso: le visite e le disdette dei contratti col modulo ticket, le altre coi documenti.
    const modulo = delContratto({ tipo, contratto_id: idContratto }) ? 'ticket' : 'documenti';
    if (this.livello(modulo) < 2) throw senzaPermesso(modulo === 'ticket' ? 'scrivere le scadenze dei contratti' : 'scrivere le scadenze');
    const proposta = this.propostaScadenza(tipo, sede, contratto);
    const titolo = x.titolo !== undefined ? testo(x.titolo) || proposta.titolo : prima ? prima.titolo : proposta.titolo;
    if (!titolo) throw new Rifiuto('Titolo: scrivi cosa scade');
    if (vuoto(x.data) && !prima) throw new Rifiuto('Data: scrivi quando scade');
    const data = !vuoto(x.data) ? dataDaIso(x.data) : prima.data;
    let ogni;
    if (x.ogniMesi !== undefined) ogni = vuoto(x.ogniMesi) || Number(x.ogniMesi) === 0 ? null : Math.round(numero(x.ogniMesi));
    else ogni = prima ? prima.ogni_mesi : proposta.ogniMesi;
    if (ogni !== null && !(ogni >= 1 && ogni <= 120)) throw new Rifiuto('Ogni: da 1 a 120 mesi');
    const preavviso = x.preavvisoGiorni !== undefined && !vuoto(x.preavvisoGiorni) ? Math.round(numero(x.preavvisoGiorni)) : prima ? prima.preavviso_giorni : proposta.preavvisoGiorni;
    if (!(preavviso >= 0 && preavviso <= 365)) throw new Rifiuto('Preavviso: da 0 a 365 giorni');
    const azione = x.azione !== undefined ? testo(x.azione) || 'promemoria' : prima ? prima.azione : proposta.azione;
    if (['promemoria', 'ticket'].indexOf(azione) < 0) throw new Rifiuto('Azione: promemoria o ticket');
    let anticipo = x.anticipoGiorni !== undefined && !vuoto(x.anticipoGiorni) ? Math.round(numero(x.anticipoGiorni)) : prima ? prima.anticipo_giorni : (proposta.anticipoGiorni || null);
    if (azione === 'ticket' && (anticipo === null || anticipo === undefined)) anticipo = Math.round(numero(this.leggiImpostazioni().ANTICIPO_TICKET_GIORNI)) || 30;
    if (azione === 'ticket' && !idCliente) throw new Rifiuto('Cliente: una scadenza che fa nascere un ticket vuole il cliente');
    const assegnataA = x.assegnataA !== undefined ? (vuoto(x.assegnataA) ? null : Number(x.assegnataA)) : prima ? prima.assegnata_a : null;
    if (assegnataA !== null && !this.db.riga('SELECT id FROM utenti WHERE id = ?', assegnataA)) throw new Rifiuto('Persona ' + assegnataA + ' non trovata');
    const v = {
      titolo, tipo, cliente_id: idCliente || '', sede_id: idSede, documento_id: idDocumento, contratto_id: idContratto, data,
      preavviso_giorni: preavviso, ogni_mesi: ogni,
      dalla_fatta: x.dallaFatta !== undefined ? (si(x.dallaFatta) ? 1 : 0) : prima ? prima.dalla_fatta : (proposta.dallaFatta ? 1 : 0),
      azione, anticipo_giorni: azione === 'ticket' ? anticipo : null, assegnata_a: assegnataA,
      note: x.note !== undefined ? testo(x.note) : p.note || '',
    };
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('scadenze', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('scadenze', Object.assign(v, { stato: 'aperta', creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora }));
    }
    this.generaTicketDaScadenze();
    return { ok: true, scadenza: this.scadenzaDaRiga(this.db.riga('SELECT * FROM scadenze WHERE id = ?', id)) };
  },

  /**
   * Una scadenza ripetuta: la prossima uguale, con la data = (dalla fatta ?
   * il giorno in cui si e' fatta : la data prevista) + ogni mesi. Le visite di
   * un contratto oltre la sua fine non nascono (tranne il rinnovo tacito).
   */
  prossimaScadenza(s, base, idDocumento) {
    if (!s.ogni_mesi) return null;
    const data = C.piuMesi(base, s.ogni_mesi);
    if (s.contratto_id && !this.contrattoCopre(s.contratto_id, data)) return null;
    const ora = adesso();
    const id = this.inserisci('scadenze', {
      titolo: s.titolo, tipo: s.tipo, cliente_id: s.cliente_id, sede_id: s.sede_id, documento_id: idDocumento || s.documento_id, contratto_id: s.contratto_id,
      data, preavviso_giorni: s.preavviso_giorni, ogni_mesi: s.ogni_mesi, dalla_fatta: s.dalla_fatta, azione: s.azione, anticipo_giorni: s.anticipo_giorni,
      assegnata_a: s.assegnata_a, stato: 'aperta', note: s.note, creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
    }, 'id', 'scadenza fatta: nasce la prossima del ' + dataIt(data));
    this.aggiorna('scadenze', s.id, { prossima_id: id });
    // Chi la citava (l'impianto del contratto, il documento) ora cita la prossima.
    this.db.righe('SELECT contratto_id, sede_id FROM contratto_impianti WHERE scadenza_id = ?', s.id)
      .forEach(ci => this.db.esegui('UPDATE contratto_impianti SET scadenza_id = ? WHERE contratto_id = ? AND sede_id = ?', id, ci.contratto_id, ci.sede_id));
    this.db.righe('SELECT id FROM documenti WHERE scadenza_id = ?', s.id).forEach(doc => this.aggiorna('documenti', doc.id, { scadenza_id: id }));
    return id;
  },

  /** faiScadenza {id, data?, idDocumento?}: fatta (e nasce la prossima). Ripetuta uguale: ok senza rifare niente. */
  faiScadenza(d) {
    const s = this.rigaScadenza(d.id);
    if (!this.puoScrivereScadenza(s)) throw senzaPermesso(delContratto(s) ? 'scrivere le scadenze dei contratti' : 'scrivere le scadenze');
    if (s.stato === 'fatta') return this.rispostaScadenzaFatta(s.id);
    if (s.stato === 'annullata') throw new Rifiuto('La scadenza è stata tolta: non si segna fatta');
    const data = !vuoto(d.data) ? dataDaIso(d.data) : oggi();
    const idDocumento = !vuoto(d.idDocumento) ? Number(d.idDocumento) : null;
    if (idDocumento !== null) this.rigaDocumento(idDocumento);
    this.segnaScadenzaFatta(s, data, idDocumento);
    this.generaTicketDaScadenze();
    return this.rispostaScadenzaFatta(s.id);
  },

  /** Fatta (anche da un ticket chiuso o risolto): fatta_il, il documento che la chiude, la prossima. */
  segnaScadenzaFatta(s, data, idDocumento) {
    if (s.stato !== 'aperta') return null;
    this.aggiorna('scadenze', s.id, { stato: 'fatta', fatta_il: data, documento_fatto_id: idDocumento, modificato: adesso() });
    return this.prossimaScadenza(s, s.dalla_fatta ? data : s.data, idDocumento);
  },

  rispostaScadenzaFatta(id) {
    const s = this.db.riga('SELECT * FROM scadenze WHERE id = ?', id);
    const p = s.prossima_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', s.prossima_id) : null;
    const a = this.aiutiScadenze();
    return { ok: true, scadenza: this.scadenzaDaRiga(s, a), prossima: p ? this.scadenzaDaRiga(p, a) : null };
  },

  /**
   * togliScadenza {id, motivo, ancheProssime?}: annullata. Una ripetuta continua
   * (nasce la prossima) a meno di "anche le prossime", che toglie la ripetizione.
   */
  togliScadenza(d) {
    const s = this.rigaScadenza(d.id);
    if (!this.puoScrivereScadenza(s)) throw senzaPermesso(delContratto(s) ? 'scrivere le scadenze dei contratti' : 'scrivere le scadenze');
    if (s.stato === 'annullata') return this.rispostaScadenzaFatta(s.id);
    if (s.stato === 'fatta') throw new Rifiuto('La scadenza è già fatta: non si toglie');
    const motivo = testo(d.motivo);
    if (!motivo) throw new Rifiuto('Scrivi il motivo');
    const anche = si(d.ancheProssime);
    this.aggiorna('scadenze', s.id, Object.assign({ stato: 'annullata', motivo, modificato: adesso() }, anche ? { ogni_mesi: null } : {}));
    if (!anche && s.ogni_mesi) this.prossimaScadenza(s, s.data, null);
    return this.rispostaScadenzaFatta(s.id);
  },

  // ------------------------------------------------------------------ i ticket che nascono dalle scadenze (§6.2)

  /**
   * Ogni notte, all'avvio e dopo ogni salvataggio: per ogni scadenza aperta con
   * azione "ticket", senza ticket, con data - anticipo <= oggi, nasce un ticket
   * programmato. Una volta sola (ticket_id). Torna quanti ne sono nati.
   */
  generaTicketDaScadenze() {
    const t = oggi();
    let nati = 0;
    for (const s of this.db.righe("SELECT * FROM scadenze WHERE stato = 'aperta' AND azione = 'ticket' AND ticket_id IS NULL AND cliente_id <> '' ORDER BY data, id")) {
      if (piuGiorni(s.data, -(s.anticipo_giorni || 0)) > t) continue;
      if (s.contratto_id && !this.contrattoCopre(s.contratto_id, s.data)) continue;
      this.ticketDaScadenza(s);
      nati++;
    }
    return nati;
  },

  /** Il contratto e' attivo (o disdetto ma non finito) per quel giorno, o si rinnova da solo. */
  contrattoCopre(idContratto, data) {
    const c = this.db.riga('SELECT * FROM contratti WHERE id = ?', idContratto);
    if (!c || c.stato === 'bozza' || c.stato === 'chiuso') return false;
    if (data < c.dal) return false;
    if (data <= c.al) return true;
    return c.stato === 'attivo' && c.rinnovo === 'tacito';
  },
};

Object.defineProperties(module.exports, {
  TIPI_SCADENZA: { value: TIPI },
  NOMI_TIPI_SCADENZA: { value: NOMI_TIPI },
  AMBIENTI_RISCHIO: { value: AMBIENTI_RISCHIO },
  delContratto: { value: delContratto },
});
