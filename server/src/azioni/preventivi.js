/*
 * Preventivi e listino (fase 2, accordo in docs/gestionale/fase2.md, risposte
 * in architettura.md §13).
 *
 * Le regole che non si scavalcano:
 *  - i conti li fa solo il server (contiPreventivo in conti.js), con EPPI e IVA
 *    congelati nel preventivo il giorno in cui nasce, come le tariffe dei
 *    rapportini;
 *  - dopo la bozza i prezzi non cambiano: si fa una revisione (stesso numero,
 *    rev. 1, 2...) e la vecchia diventa SOSTITUITO, consultabile;
 *  - "scaduto" non si salva: e' un INVIATO con la scadenza passata;
 *  - un accettato diventa commessa una volta sola.
 * Niente si cancella: si tolgono solo sezioni, voci e scadenze di una bozza, e
 * il registro tiene com'erano.
 */
'use strict';

const {
  Rifiuto, senzaPermesso, testo, numero, numeroONull, normalizza, centesimi, adesso, oggi, piuGiorni, dataDaIso,
  dataOraIso,
} = require('../utili');
const { contiPreventivo, gruppoAlternativa } = require('../conti');
const { formatta } = require('../formati');

const MODI = ['corpo', 'ore', 'quantita'];
const MODI_ACCETTAZIONE = ['firma', 'email', 'documento', 'voce'];
const QUANDO = { firma: 'alla firma', avanzamento: 'a stato di avanzamento', fine: 'a fine lavori', data: 'alla data' };
const COMPLESSITA = ['', 'bassa', 'media', 'alta'];

/** Le parole brevi di "manca", per la frase prima dell'invio. */
const BREVE = {
  cliente: 'il cliente', oggetto: 'l\'oggetto', voci: 'le voci', prezzi: 'i prezzi', complessita: 'il grado di complessità',
  oneri: 'gli oneri ipotizzabili', polizza: 'la polizza', titoli: 'i titoli',
};

const urlFile = id => '/file/' + id;
const vuoto = v => v === undefined || v === null || v === '';
const numeroOVuoto = v => (vuoto(v) ? null : numero(v));
const si = v => v === true || v === 1 || v === '1' || v === 'true';
const dataItaliana = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
const maiuscola = s => s.charAt(0).toUpperCase() + s.slice(1);

/** "PR/2026/012", "PR/2026/012 rev. 1", o "Modello". */
function etichetta(r) {
  if (!r.numero) return 'Modello';
  return r.numero + (r.revisione ? ' rev. ' + r.revisione : '');
}

function giorniTra(da, a) {
  return Math.round((Date.parse(a + 'T12:00:00') - Date.parse(da + 'T12:00:00')) / 86400000);
}

function statoVisto(r) {
  return r.stato === 'INVIATO' && r.scadenza && r.scadenza < oggi() ? 'SCADUTO' : r.stato;
}

function voceListinoDaRiga(r) {
  return {
    id: r.id, codice: r.codice, nome: r.nome, descrizione: r.descrizione, modo: r.modo, unita: r.unita,
    prezzo: numeroONull(r.prezzo), attivo: r.attivo === 1, ordine: r.ordine,
  };
}

function voceDaRiga(v) {
  return {
    id: v.id, idSezione: v.sezione_id, idListino: v.listino_id === null ? null : v.listino_id, descrizione: v.descrizione,
    modo: v.modo, quantita: v.quantita, unita: v.unita, prezzo: numeroONull(v.prezzo),
    scontoPercentuale: numero(v.sconto_percentuale), facoltativa: v.facoltativa === 1, alternativa: v.alternativa,
    scelta: v.scelta === 1, ordine: v.ordine,
  };
}

function scadenzaDaRiga(s) {
  return {
    id: s.id, descrizione: s.descrizione, tipo: s.tipo, valore: numeroONull(s.valore), quando: s.quando, data: s.data,
    importo: numeroONull(s.importo), stato: s.stato, ordine: s.ordine, idCommessa: s.commessa_id || '',
  };
}

/** Le chiavi dei conti che vanno nella risposta (gli elenchi per voce stanno gia' nelle voci). */
const CHIAVI_CONTI = ['sommaVoci', 'scontoDaPercentuale', 'scontoEuro', 'imponibile', 'eppiPercentuale', 'contributo',
  'baseIva', 'ivaPercentuale', 'iva', 'totale', 'oreVoci', 'senzaPrezzo', 'restoScadenze'];

function estensioneDi(mime) {
  return mime === 'image/png' ? '.png' : mime === 'application/pdf' ? '.pdf' : '.jpg';
}

module.exports = {
  // ------------------------------------------------------------------ listino

  leggiListino(tutte) {
    return this.db.righe('SELECT * FROM listino ' + (tutte ? '' : 'WHERE attivo = 1 ') + 'ORDER BY ordine, id').map(voceListinoDaRiga);
  },

  /** Una prestazione del listino: nome, modo, unita' e (solo chi vede i costi) il prezzo. */
  salvaVoceListino(x) {
    x = x || {};
    const prima = x.id ? this.db.riga('SELECT * FROM listino WHERE id = ?', Number(x.id)) : null;
    if (x.id && !prima) throw new Rifiuto('Voce del listino ' + x.id + ' non trovata');
    const v = {};
    ['codice', 'nome', 'descrizione', 'unita'].forEach(k => { if (x[k] !== undefined) v[k] = testo(x[k]); });
    if (x.modo !== undefined) {
      v.modo = testo(x.modo).toLowerCase() || 'corpo';
      if (MODI.indexOf(v.modo) < 0) throw new Rifiuto('Modo: corpo, ore o quantita');
    }
    if (x.prezzo !== undefined && this.vedeCosti()) {
      v.prezzo = numeroOVuoto(x.prezzo);
      if (v.prezzo !== null && v.prezzo < 0) throw new Rifiuto('Prezzo: non può essere negativo');
    }
    if (x.ordine !== undefined) v.ordine = Math.round(numero(x.ordine));
    if (x.attivo !== undefined) v.attivo = si(x.attivo) ? 1 : 0;
    const modo = v.modo || (prima ? prima.modo : 'corpo');
    if (modo === 'ore' && !(v.unita !== undefined ? v.unita : prima ? prima.unita : '')) v.unita = 'ore';
    if (prima) {
      if (v.nome !== undefined && !v.nome) throw new Rifiuto('Nome: scrivi il nome della prestazione');
      this.aggiorna('listino', prima.id, v);
      return voceListinoDaRiga(this.db.riga('SELECT * FROM listino WHERE id = ?', prima.id));
    }
    if (!v.nome) throw new Rifiuto('Nome: scrivi il nome della prestazione');
    if (v.ordine === undefined) v.ordine = (this.db.riga('SELECT MAX(ordine) m FROM listino').m || 0) + 1;
    const id = this.inserisci('listino', Object.assign({ modo: 'corpo', attivo: 1 }, v));
    return voceListinoDaRiga(this.db.riga('SELECT * FROM listino WHERE id = ?', id));
  },

  archiviaVoceListino(id, archiviata) {
    const r = this.db.riga('SELECT * FROM listino WHERE id = ?', Number(id));
    if (!r) throw new Rifiuto('Voce del listino ' + id + ' non trovata');
    this.aggiorna('listino', r.id, { attivo: archiviata === false || archiviata === 'false' ? 1 : 0 });
    return voceListinoDaRiga(this.db.riga('SELECT * FROM listino WHERE id = ?', r.id));
  },

  // ------------------------------------------------------------------ lettura

  prossimoNumeroPreventivo(anno) {
    const codici = this.db.righe("SELECT DISTINCT numero FROM preventivi WHERE numero <> ''").map(r => r.numero);
    return this.prossimoNumero('preventivo', codici, anno);
  },

  /** Per id interno, o per numero ("PR/2026/012": l'ultima revisione). */
  rigaPreventivo(id) {
    const s = testo(id);
    if (!s) throw new Rifiuto('Manca il preventivo');
    const r = /^\d+$/.test(s)
      ? this.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(s))
      : this.db.riga('SELECT * FROM preventivi WHERE numero = ? ORDER BY revisione DESC LIMIT 1', s);
    if (!r) throw new Rifiuto('Preventivo ' + s + ' non trovato');
    return r;
  },

  /** Sezioni, voci e scadenze di uno o piu' preventivi, gia' divise per preventivo. */
  contenutiDi(ids) {
    const per = {};
    const dove = ids ? ' WHERE preventivo_id IN (' + ids.map(Number).join(',') + ')' : '';
    if (ids && !ids.length) return per;
    const prendi = id => (per[id] = per[id] || { sezioni: [], scadenze: [] });
    const sezioni = {};
    for (const s of this.db.righe('SELECT * FROM preventivo_sezioni' + dove + ' ORDER BY ordine, id')) {
      const x = { id: s.id, titolo: s.titolo, ordine: s.ordine, voci: [] };
      sezioni[s.id] = x;
      prendi(s.preventivo_id).sezioni.push(x);
    }
    for (const v of this.db.righe('SELECT * FROM preventivo_voci' + dove + ' ORDER BY ordine, id')) {
      if (sezioni[v.sezione_id]) sezioni[v.sezione_id].voci.push(voceDaRiga(v));
    }
    for (const s of this.db.righe('SELECT * FROM scadenze_pagamento' + (dove || ' WHERE preventivo_id IS NOT NULL') + ' ORDER BY ordine, id')) {
      prendi(s.preventivo_id).scadenze.push(scadenzaDaRiga(s));
    }
    return per;
  },

  /**
   * Il contenuto di un preventivo coi suoi conti: ogni voce col suo importo e
   * se conta, ogni sezione col subtotale, ogni scadenza col suo importo.
   */
  contenutoPreventivo(r, gia) {
    const c = gia || this.contenutiDi([r.id])[r.id] || { sezioni: [], scadenze: [] };
    const conti = contiPreventivo({
      scontoPercentuale: r.sconto_percentuale, scontoEuro: r.sconto_euro, eppiPercentuale: r.eppi_percentuale,
      ivaPercentuale: r.iva_percentuale, sezioni: c.sezioni, scadenzePagamento: c.scadenze,
    });
    let i = 0;
    const sezioni = c.sezioni.map((s, k) => Object.assign({}, s, {
      subtotale: conti.sezioni[k],
      voci: s.voci.map(v => Object.assign({}, v, conti.voci[i++])),
    }));
    const scadenze = c.scadenze.map((s, k) => Object.assign({}, s, { importo: conti.scadenze[k] }));
    return { sezioni, scadenze, conti };
  },

  nomiClienti() {
    const n = {};
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { n[s.id] = s.nome; });
    return n;
  },

  riassuntoPreventivo(r, conti, nomi) {
    const visto = statoVisto(r);
    return {
      id: r.id, numero: r.numero, revisione: r.revisione, etichetta: etichetta(r), idCliente: r.cliente_id,
      cliente: (nomi || this.nomiClienti())[r.cliente_id] || '', oggetto: r.oggetto, data: r.data, scadenza: r.scadenza,
      stato: r.stato, statoVisto: visto, scaduto: visto === 'SCADUTO',
      giorniAllaScadenza: r.scadenza ? giorniTra(oggi(), r.scadenza) : null,
      inviatoIl: dataOraIso(r.inviato_il), accettatoIl: dataOraIso(r.accettato_il), idCommessa: r.commessa_id,
      modello: r.modello === 1, senzaPrezzo: conti.senzaPrezzo, imponibile: conti.imponibile, totale: conti.totale,
      modificato: dataOraIso(r.modificato),
    };
  },

  /**
   * Cio' che la legge chiede nel preventivo e manca (DL 1/2012 art. 9, L.
   * 124/2017 c. 150-152): complessita', voci con il compenso, oneri
   * ipotizzabili, polizza, titoli. Le frasi sono pronte da mostrare.
   */
  mancanoPreventivo(r, contenuto) {
    const imp = this.leggiImpostazioni();
    const m = [];
    const voci = [].concat(...contenuto.sezioni.map(s => s.voci));
    if (!r.modello && !r.cliente_id) m.push({ campo: 'cliente', testo: 'Il cliente a cui va il preventivo' });
    if (!testo(r.oggetto)) m.push({ campo: 'oggetto', testo: 'L\'oggetto: di cosa si tratta' });
    if (!voci.length) m.push({ campo: 'voci', testo: 'Le voci: almeno una prestazione col suo compenso' });
    else if (contenuto.conti.senzaPrezzo) {
      const n = contenuto.conti.senzaPrezzo;
      m.push({ campo: 'prezzi', testo: (n === 1 ? '1 voce è' : n + ' voci sono') + ' senza prezzo: la legge vuole il compenso di ogni prestazione' });
    }
    if (!r.complessita) m.push({ campo: 'complessita', testo: 'Il grado di complessità dell\'incarico: bassa, media o alta' });
    if (!testo(r.oneri_previsti)) m.push({ campo: 'oneri', testo: 'Gli oneri ipotizzabili, dall\'incarico alla fine dei lavori' });
    if (!testo(imp.POLIZZA_COMPAGNIA) || !testo(imp.POLIZZA_NUMERO)) {
      m.push({ campo: 'polizza', testo: 'Gli estremi della polizza professionale: scrivili in Amministrazione › Dati dello studio' });
    }
    if (!testo(imp.TITOLI)) m.push({ campo: 'titoli', testo: 'Titoli e specializzazioni: scrivili in Amministrazione › Dati dello studio' });
    return m;
  },

  /** Tutto il preventivo, come lo vuole la sua pagina. */
  preventivoCompleto(r) {
    if (typeof r !== 'object') r = this.rigaPreventivo(r);
    const nomi = this.nomiClienti();
    const contenuto = this.contenutoPreventivo(r);
    const conti = {};
    CHIAVI_CONTI.forEach(k => { conti[k] = contenuto.conti[k]; });
    const fratelli = r.numero
      ? this.db.righe('SELECT * FROM preventivi WHERE numero = ? ORDER BY revisione', r.numero) : [r];
    const contenuti = this.contenutiDi(fratelli.map(x => x.id));
    const revisioni = fratelli.map(x => ({
      id: x.id, revisione: x.revisione, etichetta: etichetta(x), stato: x.stato, data: x.data,
      totale: (x.id === r.id ? contenuto : this.contenutoPreventivo(x, contenuti[x.id])).conti.totale,
    }));
    return Object.assign(this.riassuntoPreventivo(r, contenuto.conti, nomi), {
      idSede: r.sede_id === null ? null : r.sede_id,
      idReferente: r.referente_id === null ? null : r.referente_id,
      introduzione: r.introduzione, complessita: r.complessita, complessitaNota: r.complessita_nota,
      oneriPrevisti: r.oneri_previsti, condizioni: r.condizioni,
      scontoPercentuale: numero(r.sconto_percentuale), scontoEuro: numero(r.sconto_euro),
      eppiPercentuale: numero(r.eppi_percentuale), ivaPercentuale: numero(r.iva_percentuale),
      accettatoDa: r.accettato_da, accettazioneModo: r.accettazione_modo,
      firma: r.firma_file_id ? { id: r.firma_file_id, url: urlFile(r.firma_file_id) } : null,
      rifiutatoIl: dataOraIso(r.rifiutato_il), motivoRifiuto: r.motivo_rifiuto, noteInterne: r.note_interne,
      idUtente: r.utente_id === null ? null : r.utente_id, creato: dataOraIso(r.creato),
      modificabile: r.modello === 1 || r.stato === 'BOZZA',
      sezioni: contenuto.sezioni,
      scadenzePagamento: contenuto.scadenze,
      conti,
      revisioni,
      mancano: this.mancanoPreventivo(r, contenuto),
    });
  },

  /** I preventivi coi loro conti, filtrati come chiede l'elenco (righe del database + conti). */
  elencoPreventivi(d) {
    d = d || {};
    const stato = testo(d.stato).toUpperCase();
    const cliente = testo(d.cliente || d.idCliente);
    const anno = testo(d.anno);
    const cerca = normalizza(d.testo);
    const nomi = this.nomiClienti();
    const righe = this.db.righe('SELECT * FROM preventivi ORDER BY data DESC, numero DESC, revisione DESC, id DESC').filter(r => {
      if (stato === 'MODELLO') return r.modello === 1;
      if (r.modello === 1 && (!si(d.modelli) || (stato && stato !== 'TUTTI'))) return false;
      if (r.stato === 'SOSTITUITO' && stato !== 'SOSTITUITO' && !si(d.sostituiti)) return false;
      if (stato && stato !== 'TUTTI' && statoVisto(r) !== stato) return false;
      if (cliente && r.cliente_id !== cliente) return false;
      if (anno && r.data.slice(0, 4) !== anno) return false;
      if (cerca && [r.numero, r.oggetto, nomi[r.cliente_id] || ''].every(t => normalizza(t).indexOf(cerca) < 0)) return false;
      return true;
    });
    const contenuti = this.contenutiDi(righe.map(r => r.id));
    return righe.map(r => ({ riga: r, conti: this.contenutoPreventivo(r, contenuti[r.id]).conti, cliente: nomi[r.cliente_id] || '' }));
  },

  leggiPreventivi(d) {
    const nomi = this.nomiClienti();
    return this.elencoPreventivi(d).map(x => this.riassuntoPreventivo(x.riga, x.conti, nomi));
  },

  // ------------------------------------------------------------------ scrittura

  /** Una bozza (o un modello) si cambia; negli altri stati si fa una revisione. */
  controllaModificabile(r) {
    if (r.modello === 1 || r.stato === 'BOZZA') return;
    const n = 'Il preventivo ' + etichetta(r);
    if (r.stato === 'INVIATO') throw new Rifiuto(n + ' è già stato inviato: per cambiarlo fai una nuova revisione');
    if (r.stato === 'ACCETTATO') throw new Rifiuto(n + ' è già accettato: non si cambia più');
    if (r.stato === 'RIFIUTATO') throw new Rifiuto(n + ' è stato rifiutato: per riproporlo usa Riapri');
    throw new Rifiuto(n + ' è stato sostituito da una revisione più nuova');
  },

  /**
   * Crea o cambia un preventivo: testata, sezioni con le voci e scadenze di
   * pagamento in una volta. Sezioni e scadenze, se ci sono, sono l'elenco
   * intero. opzioni.numero (solo dentro il server: i dati di esempio) sceglie
   * il numero.
   */
  salvaPreventivo(x, opzioni) {
    x = x || {};
    opzioni = opzioni || {};
    const costi = this.vedeCosti();
    const imp = this.leggiImpostazioni();
    const prima = testo(x.id) ? this.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(x.id)) : null;
    if (testo(x.id) && !prima) throw new Rifiuto('Preventivo ' + x.id + ' non trovato');
    if (prima) this.controllaModificabile(prima);
    const modello = prima ? prima.modello === 1 : si(x.modello);

    const v = {};
    const testi = { oggetto: 'oggetto', introduzione: 'introduzione', condizioni: 'condizioni', noteInterne: 'note_interne',
      complessitaNota: 'complessita_nota', oneriPrevisti: 'oneri_previsti' };
    for (const k of Object.keys(testi)) if (x[k] !== undefined) v[testi[k]] = testo(x[k]);
    if (x.idCliente !== undefined) v.cliente_id = testo(x.idCliente);
    if (x.complessita !== undefined) {
      v.complessita = testo(x.complessita).toLowerCase();
      if (COMPLESSITA.indexOf(v.complessita) < 0) throw new Rifiuto('Complessità: bassa, media o alta');
    }
    if (x.idSede !== undefined) v.sede_id = vuoto(x.idSede) ? null : Number(x.idSede);
    if (x.idReferente !== undefined) v.referente_id = vuoto(x.idReferente) ? null : Number(x.idReferente);
    if (x.data !== undefined) v.data = x.data ? dataDaIso(x.data) : '';
    if (x.scadenza !== undefined) v.scadenza = x.scadenza ? dataDaIso(x.scadenza) : '';
    if (costi && x.scontoPercentuale !== undefined) {
      v.sconto_percentuale = numero(x.scontoPercentuale);
      if (v.sconto_percentuale < 0 || v.sconto_percentuale > 100) throw new Rifiuto('Sconto: da 0 a 100');
    }
    if (costi && x.scontoEuro !== undefined) {
      v.sconto_euro = numero(x.scontoEuro);
      if (v.sconto_euro < 0) throw new Rifiuto('Sconto: non può essere negativo');
    }

    // I controlli, sui valori come saranno dopo il salvataggio.
    const dopo = k => (v[k] !== undefined ? v[k] : prima ? prima[k] : null);
    const cliente = dopo('cliente_id') || '';
    if (!modello && !cliente) throw new Rifiuto('Cliente: scegli il cliente');
    if (cliente && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', cliente)) throw new Rifiuto('Cliente ' + cliente + ' non trovato');
    if (!testo(dopo('oggetto'))) throw new Rifiuto('Oggetto: scrivi di cosa si tratta');
    const sede = dopo('sede_id');
    if (sede !== null && sede !== undefined) {
      const s = this.db.riga('SELECT soggetto_id FROM sedi WHERE id = ?', sede);
      if (!s) throw new Rifiuto('Sede ' + sede + ' non trovata');
      if (cliente && s.soggetto_id !== cliente) throw new Rifiuto('La sede ' + sede + ' non è di questo cliente');
    }
    const referente = dopo('referente_id');
    if (referente !== null && referente !== undefined && !this.db.riga('SELECT id FROM referenti WHERE id = ?', referente)) {
      throw new Rifiuto('Referente ' + referente + ' non trovato');
    }

    let id;
    const ora = adesso();
    if (!prima) {
      const data = v.data || oggi();
      const validita = Math.round(numero(imp.PREVENTIVO_VALIDITA_GIORNI)) || 30;
      const scadenza = v.scadenza !== undefined ? v.scadenza : (modello ? '' : piuGiorni(data, validita));
      if (scadenza && scadenza < data) throw new Rifiuto('Scadenza: deve venire dopo la data del preventivo');
      let numeroNuovo = null;
      if (!modello) {
        const anno = Number(data.slice(0, 4));
        numeroNuovo = opzioni.numero
          ? { numero: opzioni.numero, codice: formatta(this.numerazione('preventivo').formato, anno, opzioni.numero) }
          : this.prossimoNumeroPreventivo(anno);
        if (this.db.riga('SELECT id FROM preventivi WHERE numero = ?', numeroNuovo.codice)) {
          throw new Rifiuto('Il numero ' + numeroNuovo.codice + ' è già di un altro preventivo');
        }
      }
      const c = this.chi();
      id = this.inserisci('preventivi', Object.assign({
        numero: numeroNuovo ? numeroNuovo.codice : '', revisione: 0, cliente_id: '', oggetto: '',
        condizioni: testo(imp.PREVENTIVO_CONDIZIONI), stato: 'BOZZA', sconto_percentuale: 0, sconto_euro: 0,
        eppi_percentuale: numero(imp.EPPI_INTEGRATIVO), iva_percentuale: numero(imp.IVA), modello: modello ? 1 : 0,
        utente_id: c.utente ? c.utente.id : null, creato: ora, modificato: ora,
      }, v, { data, scadenza }));
      if (numeroNuovo) this.segnaNumero('preventivo', numeroNuovo.numero);
    } else {
      const data = dopo('data');
      const scadenza = dopo('scadenza');
      if (scadenza && data && scadenza < data) throw new Rifiuto('Scadenza: deve venire dopo la data del preventivo');
      v.modificato = ora;
      this.aggiorna('preventivi', prima.id, v);
      id = prima.id;
    }
    if (x.sezioni !== undefined) this.scriviSezioni(id, Array.isArray(x.sezioni) ? x.sezioni : []);
    if (x.scadenzePagamento !== undefined) this.scriviScadenze(id, Array.isArray(x.scadenzePagamento) ? x.scadenzePagamento : []);
    this.normalizzaAlternative(id);
    const conti = this.contenutoPreventivo(this.db.riga('SELECT * FROM preventivi WHERE id = ?', id)).conti;
    if (conti.imponibile < 0) throw new Rifiuto('Sconto: è più grande del totale delle voci');
    this.ricalcolaScadenze(id);
    return this.preventivoCompleto(id);
  },

  /** Le sezioni con le loro voci: l'elenco intero, nell'ordine in cui arriva. */
  scriviSezioni(id, sezioni) {
    const costi = this.vedeCosti();
    const vecchieSezioni = this.db.righe('SELECT * FROM preventivo_sezioni WHERE preventivo_id = ?', id);
    const vecchieVoci = new Map(this.db.righe('SELECT * FROM preventivo_voci WHERE preventivo_id = ?', id).map(v => [v.id, v]));
    const tenuteSezioni = new Set();
    const tenuteVoci = new Set();
    sezioni.forEach((s, i) => {
      s = s || {};
      const titolo = testo(s.titolo);
      const vecchia = s.id ? vecchieSezioni.find(x => x.id === Number(s.id)) : null;
      let idSezione;
      if (vecchia) {
        idSezione = vecchia.id;
        this.aggiorna('preventivo_sezioni', idSezione, { titolo: s.titolo === undefined ? vecchia.titolo : titolo, ordine: i + 1 });
      } else {
        idSezione = this.inserisci('preventivo_sezioni', { preventivo_id: id, titolo, ordine: i + 1 });
      }
      tenuteSezioni.add(idSezione);
      (Array.isArray(s.voci) ? s.voci : []).forEach((x, j) => {
        const voceVecchia = x && x.id ? vecchieVoci.get(Number(x.id)) || null : null;
        const v = Object.assign(this.valoriVoce(x || {}, voceVecchia, costi), { sezione_id: idSezione, ordine: j + 1 });
        if (voceVecchia) {
          this.aggiorna('preventivo_voci', voceVecchia.id, v);
          tenuteVoci.add(voceVecchia.id);
        } else {
          tenuteVoci.add(this.inserisci('preventivo_voci', Object.assign({ preventivo_id: id }, v)));
        }
      });
    });
    for (const v of vecchieVoci.values()) {
      if (tenuteVoci.has(v.id)) continue;
      this.db.esegui('DELETE FROM preventivo_voci WHERE id = ?', v.id);
      this.annota('preventivo_voci', v.id, Object.assign({}, v), null, 'tolta');
    }
    for (const s of vecchieSezioni) {
      if (tenuteSezioni.has(s.id)) continue;
      this.db.esegui('DELETE FROM preventivo_voci WHERE sezione_id = ?', s.id);
      this.db.esegui('DELETE FROM preventivo_sezioni WHERE id = ?', s.id);
      this.annota('preventivo_sezioni', s.id, Object.assign({}, s), null, 'tolta');
    }
  },

  /**
   * Una voce pulita e controllata. Dal listino prende nome, modo, unita' e
   * prezzo se non sono scritti; prezzi e sconti solo da chi vede i costi (chi
   * non li vede lascia quelli che c'erano).
   */
  valoriVoce(x, vecchia, costi) {
    const prima = (k, base) => (vecchia ? vecchia[k] : base);
    const idListino = x.idListino !== undefined ? (vuoto(x.idListino) ? null : Number(x.idListino)) : prima('listino_id', null);
    const listino = idListino ? this.db.riga('SELECT * FROM listino WHERE id = ?', idListino) : null;
    if (idListino && !listino) throw new Rifiuto('Voce del listino ' + idListino + ' non trovata');
    let descrizione = x.descrizione !== undefined ? testo(x.descrizione) : prima('descrizione', '');
    if (!descrizione && listino) descrizione = listino.nome;
    if (!descrizione) throw new Rifiuto('Voce: scrivi la descrizione');
    const modo = x.modo !== undefined ? testo(x.modo).toLowerCase() : prima('modo', listino ? listino.modo : 'corpo');
    if (MODI.indexOf(modo) < 0) throw new Rifiuto('Modo: corpo, ore o quantita');
    const quantita = x.quantita !== undefined ? numero(x.quantita) : prima('quantita', 1);
    if (quantita < 0) throw new Rifiuto('Quantità: non può essere negativa');
    let unita = x.unita !== undefined ? testo(x.unita) : prima('unita', listino ? listino.unita : '');
    if (modo === 'ore' && !unita) unita = 'ore';
    let prezzo;
    if (costi && x.prezzo !== undefined) {
      prezzo = numeroOVuoto(x.prezzo);
      if (prezzo !== null && prezzo < 0) throw new Rifiuto('Prezzo: non può essere negativo');
    } else {
      prezzo = vecchia ? vecchia.prezzo : listino ? listino.prezzo : null;
    }
    let sconto = vecchia ? vecchia.sconto_percentuale : 0;
    if (costi && x.scontoPercentuale !== undefined) {
      sconto = numero(x.scontoPercentuale);
      if (sconto < 0 || sconto > 100) throw new Rifiuto('Sconto: da 0 a 100');
    }
    return {
      listino_id: idListino, descrizione, modo, quantita, unita, prezzo, sconto_percentuale: sconto,
      facoltativa: x.facoltativa !== undefined ? (si(x.facoltativa) ? 1 : 0) : prima('facoltativa', 0),
      alternativa: x.alternativa !== undefined ? testo(x.alternativa) : prima('alternativa', ''),
      scelta: x.scelta !== undefined ? (si(x.scelta) ? 1 : 0) : prima('scelta', 0),
    };
  },

  /** Di ogni gruppo di alternative una sola scelta: la prima scelta, o la prima del gruppo. */
  normalizzaAlternative(id) {
    const voci = this.db.righe('SELECT v.* FROM preventivo_voci v JOIN preventivo_sezioni s ON s.id = v.sezione_id ' +
      "WHERE v.preventivo_id = ? AND v.alternativa <> '' ORDER BY s.ordine, s.id, v.ordine, v.id", id);
    const gruppi = {};
    voci.forEach(v => { (gruppi[gruppoAlternativa(v)] = gruppi[gruppoAlternativa(v)] || []).push(v); });
    for (const lista of Object.values(gruppi)) {
      const scelta = lista.find(v => v.scelta === 1) || lista[0];
      for (const v of lista) {
        const giusta = v.id === scelta.id ? 1 : 0;
        if (v.scelta !== giusta) this.aggiorna('preventivo_voci', v.id, { scelta: giusta });
      }
    }
  },

  /** Acconti e saldo: l'elenco intero. Senza descrizione se ne fa una ("30% alla firma"). */
  scriviScadenze(id, lista) {
    const costi = this.vedeCosti();
    const vecchie = new Map(this.db.righe('SELECT * FROM scadenze_pagamento WHERE preventivo_id = ?', id).map(s => [s.id, s]));
    const tenute = new Set();
    lista.forEach((x, i) => {
      x = x || {};
      const vecchia = x.id ? vecchie.get(Number(x.id)) || null : null;
      const tipo = x.tipo !== undefined ? testo(x.tipo).toLowerCase() : vecchia ? vecchia.tipo : 'percentuale';
      if (['percentuale', 'importo'].indexOf(tipo) < 0) throw new Rifiuto('Pagamento: percentuale o importo');
      const quando = x.quando !== undefined ? testo(x.quando).toLowerCase() : vecchia ? vecchia.quando : 'firma';
      if (!QUANDO[quando]) throw new Rifiuto('Pagamento: alla firma, a stato di avanzamento, a fine lavori o a una data');
      const data = x.data !== undefined ? (x.data ? dataDaIso(x.data) : '') : vecchia ? vecchia.data : '';
      if (quando === 'data' && !data) throw new Rifiuto('Pagamento: scrivi la data');
      let valore = vecchia ? vecchia.valore : null;
      if (costi && x.valore !== undefined) valore = numeroOVuoto(x.valore);
      if (valore !== null && valore < 0) throw new Rifiuto('Pagamento: il valore non può essere negativo');
      if (tipo === 'percentuale' && valore > 100) throw new Rifiuto('Pagamento: la percentuale va da 0 a 100');
      let descrizione = x.descrizione !== undefined ? testo(x.descrizione) : vecchia ? vecchia.descrizione : '';
      if (!descrizione) {
        const q = quando === 'data' ? 'il ' + dataItaliana(data) : QUANDO[quando];
        descrizione = tipo === 'percentuale' && valore !== null ? String(valore).replace('.', ',') + '% ' + q : maiuscola(q);
      }
      const v = { descrizione, tipo, valore, quando, data, ordine: i + 1 };
      if (vecchia && (tipo !== vecchia.tipo || numero(valore) !== numero(vecchia.valore))) this.controllaSorgenteLibera('scadenza', vecchia.id);
      if (vecchia) {
        this.aggiorna('scadenze_pagamento', vecchia.id, v);
        tenute.add(vecchia.id);
      } else {
        tenute.add(this.inserisci('scadenze_pagamento', Object.assign({ preventivo_id: id, stato: 'prevista' }, v)));
      }
    });
    for (const s of vecchie.values()) {
      if (tenute.has(s.id)) continue;
      this.controllaSorgenteLibera('scadenza', s.id);
      this.db.esegui('DELETE FROM scadenze_pagamento WHERE id = ?', s.id);
      this.annota('scadenze_pagamento', s.id, Object.assign({}, s), null, 'tolta');
    }
  },

  /** L'importo di ogni scadenza, rifatto dai conti (serve alla commessa e alle fatture). */
  ricalcolaScadenze(id) {
    const r = this.db.riga('SELECT * FROM preventivi WHERE id = ?', id);
    for (const s of this.contenutoPreventivo(r).scadenze) {
      const riga = this.db.riga('SELECT importo FROM scadenze_pagamento WHERE id = ?', s.id);
      if (riga.importo !== s.importo) {
        this.controllaSorgenteLibera('scadenza', s.id);
        this.aggiorna('scadenze_pagamento', s.id, { importo: s.importo });
      }
    }
  },

  /** Sezioni, voci e scadenze di un preventivo copiate in un altro. */
  copiaContenuto(da, a) {
    for (const s of this.db.righe('SELECT * FROM preventivo_sezioni WHERE preventivo_id = ? ORDER BY ordine, id', da)) {
      const nuova = this.inserisci('preventivo_sezioni', { preventivo_id: a, titolo: s.titolo, ordine: s.ordine });
      for (const v of this.db.righe('SELECT * FROM preventivo_voci WHERE sezione_id = ? ORDER BY ordine, id', s.id)) {
        this.inserisci('preventivo_voci', {
          preventivo_id: a, sezione_id: nuova, listino_id: v.listino_id, descrizione: v.descrizione, modo: v.modo,
          quantita: v.quantita, unita: v.unita, prezzo: v.prezzo, sconto_percentuale: v.sconto_percentuale,
          facoltativa: v.facoltativa, alternativa: v.alternativa, scelta: v.scelta, ordine: v.ordine,
        });
      }
    }
    for (const s of this.db.righe('SELECT * FROM scadenze_pagamento WHERE preventivo_id = ? ORDER BY ordine, id', da)) {
      this.inserisci('scadenze_pagamento', {
        preventivo_id: a, descrizione: s.descrizione, tipo: s.tipo, valore: s.valore, quando: s.quando, data: s.data,
        stato: 'prevista', ordine: s.ordine,
      });
    }
  },

  /** I campi della testata che passano a una copia (duplicato o revisione). */
  testataDaCopiare(r) {
    return {
      cliente_id: r.cliente_id, sede_id: r.sede_id, referente_id: r.referente_id, oggetto: r.oggetto,
      introduzione: r.introduzione, complessita: r.complessita, complessita_nota: r.complessita_nota,
      oneri_previsti: r.oneri_previsti, condizioni: r.condizioni, sconto_percentuale: r.sconto_percentuale,
      sconto_euro: r.sconto_euro, note_interne: r.note_interne,
    };
  },

  /**
   * Un preventivo nuovo come un altro: numero nuovo, data di oggi, EPPI e IVA
   * di adesso. Da un modello nasce il preventivo vero ("Da un modello").
   */
  duplicaPreventivo(d) {
    const fonte = this.rigaPreventivo(d.id);
    const comeModello = si(d.comeModello);
    const imp = this.leggiImpostazioni();
    const idCliente = testo(d.idCliente) || fonte.cliente_id;
    if (!comeModello && !idCliente) throw new Rifiuto('Cliente: scegli il cliente del preventivo nuovo');
    if (idCliente && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', idCliente)) throw new Rifiuto('Cliente ' + idCliente + ' non trovato');
    const data = oggi();
    const numeroNuovo = comeModello ? null : this.prossimoNumeroPreventivo(Number(data.slice(0, 4)));
    const ora = adesso();
    const c = this.chi();
    const stessoCliente = idCliente === fonte.cliente_id;
    const id = this.inserisci('preventivi', Object.assign(this.testataDaCopiare(fonte), {
      numero: numeroNuovo ? numeroNuovo.codice : '', revisione: 0, cliente_id: idCliente,
      sede_id: stessoCliente ? fonte.sede_id : null, referente_id: stessoCliente ? fonte.referente_id : null,
      data, scadenza: comeModello ? '' : piuGiorni(data, Math.round(numero(imp.PREVENTIVO_VALIDITA_GIORNI)) || 30),
      stato: 'BOZZA', eppi_percentuale: numero(imp.EPPI_INTEGRATIVO), iva_percentuale: numero(imp.IVA),
      modello: comeModello ? 1 : 0, utente_id: c.utente ? c.utente.id : null, creato: ora, modificato: ora,
    }));
    if (numeroNuovo) this.segnaNumero('preventivo', numeroNuovo.numero);
    this.copiaContenuto(fonte.id, id);
    this.ricalcolaScadenze(id);
    return this.preventivoCompleto(id);
  },

  /**
   * La revisione nuova di un preventivo inviato o rifiutato: stesso numero,
   * revisione + 1, stessi contenuti e stessi EPPI e IVA; la vecchia diventa
   * SOSTITUITO e resta da consultare.
   */
  nuovaRevisione(id) {
    const r = this.rigaPreventivo(id);
    if (r.modello === 1) throw new Rifiuto('È un modello: non ha revisioni');
    if (r.stato === 'BOZZA') throw new Rifiuto('È ancora in bozza: cambiala direttamente');
    if (r.stato === 'ACCETTATO') throw new Rifiuto('È già accettato: non si fanno revisioni');
    if (r.stato === 'SOSTITUITO') throw new Rifiuto('Il preventivo ' + etichetta(r) + ' è stato sostituito da una revisione più nuova');
    const imp = this.leggiImpostazioni();
    const revisione = this.db.riga('SELECT MAX(revisione) m FROM preventivi WHERE numero = ?', r.numero).m + 1;
    const data = oggi();
    const ora = adesso();
    const c = this.chi();
    const nuovo = this.inserisci('preventivi', Object.assign(this.testataDaCopiare(r), {
      numero: r.numero, revisione, data,
      scadenza: piuGiorni(data, Math.round(numero(imp.PREVENTIVO_VALIDITA_GIORNI)) || 30), stato: 'BOZZA',
      eppi_percentuale: r.eppi_percentuale, iva_percentuale: r.iva_percentuale, modello: 0,
      utente_id: c.utente ? c.utente.id : null, creato: ora, modificato: ora,
    }));
    this.copiaContenuto(r.id, nuovo);
    this.aggiorna('preventivi', r.id, { stato: 'SOSTITUITO', modificato: ora });
    this.ricalcolaScadenze(nuovo);
    return this.preventivoCompleto(nuovo);
  },

  /**
   * Si puo' inviare? Da BOZZA (o di nuovo da INVIATO). Se manca qualcosa che la
   * legge chiede, si dice prima: con "conferma" si invia lo stesso.
   */
  controllaInviabile(r, conferma) {
    if (r.modello === 1) throw new Rifiuto('È un modello: prima fai un preventivo da questo modello');
    if (r.stato === 'INVIATO') return;
    if (r.stato !== 'BOZZA') this.controllaModificabile(r);
    if (r.scadenza && r.scadenza < oggi()) throw new Rifiuto('La scadenza è già passata: cambiala prima di inviarlo');
    if (conferma) return;
    const mancano = this.mancanoPreventivo(r, this.contenutoPreventivo(r));
    if (mancano.length) {
      throw new Rifiuto('Prima di inviarlo manca: ' + mancano.map(m => BREVE[m.campo] || m.campo).join(', '),
        { mancano, serveConferma: true });
    }
  },

  segnaInviato(d) {
    const r = this.rigaPreventivo(d.id);
    this.controllaInviabile(r, si(d.conferma));
    if (r.stato === 'BOZZA') {
      const ora = adesso();
      this.aggiorna('preventivi', r.id, { stato: 'INVIATO', inviato_il: ora, modificato: ora });
    }
    return this.preventivoCompleto(r.id);
  },

  /**
   * Manda il preventivo col PDF (lo fa l'app, arriva in "allegati") e lo segna
   * INVIATO. Con aMe va solo a chi scrive, come anteprima, e non cambia niente.
   */
  async inviaPreventivo(d) {
    const r = this.rigaPreventivo(d.id);
    const aMe = d.aMe === true;
    if (!aMe) this.controllaInviabile(r, si(d.conferma));
    const destinatario = aMe ? this.emailMia() : testo(d.a);
    if (!destinatario) throw new Rifiuto('Manca l\'indirizzo del cliente');
    if (!this.postino || !this.postino.configurato()) {
      throw new Rifiuto('Le email non sono collegate: manca il postino (WISPER_POSTINO_URL nel .env del server)');
    }
    const imp = this.leggiImpostazioni();
    const posta = {
      a: destinatario,
      nome: testo(imp.RAGIONE_SOCIALE) || 'Wisper',
      oggetto: testo(d.oggetto) || 'Preventivo ' + etichetta(r) + (r.oggetto ? ' - ' + r.oggetto : ''),
      messaggio: testo(d.messaggio) || ' ',
      allegati: (d.allegati || []).map(a => ({ nome: a.nome || 'preventivo.pdf', mime: a.mime || 'application/pdf', base64: a.base64 })),
    };
    if (!aMe && testo(d.cc)) posta.cc = testo(d.cc);
    if (testo(imp.EMAIL)) posta.rispondiA = testo(imp.EMAIL);
    try {
      await this.postino.email(posta);
    } catch (err) {
      throw new Rifiuto('L\'email non è partita: ' + err.message, err.rete ? { rete: true } : {});
    }
    if (aMe) return { ok: true, preventivo: this.preventivoCompleto(r.id) };
    return this.db.transazione(() => {
      // Fase 5: la copia del PDF mandato (COPIA_INVIATI), nella categoria Mandati ai clienti.
      this.copiaInviati({ allegati: posta.allegati, a: destinatario, idCliente: r.cliente_id, idCommessa: r.commessa_id });
      const adessoR = this.db.riga('SELECT * FROM preventivi WHERE id = ?', r.id);
      if (adessoR.stato === 'BOZZA') {
        const ora = adesso();
        this.aggiorna('preventivi', r.id, { stato: 'INVIATO', inviato_il: ora, modificato: ora });
      }
      return { ok: true, preventivo: this.preventivoCompleto(r.id) };
    });
  },

  /**
   * Il cliente ha accettato: come (firma, email, documento, voce), chi, e cosa
   * ha scelto tra facoltative e alternative. La firma (o il documento firmato)
   * diventa un file di tipo "preventivo". Ripetuta uguale non rifa' niente.
   */
  accettaPreventivo(d) {
    const r = this.rigaPreventivo(d.id);
    const modo = testo(d.modo).toLowerCase();
    const nome = testo(d.nome);
    const n = 'Il preventivo ' + etichetta(r);
    if (r.stato === 'ACCETTATO') {
      if (r.accettato_da === nome && r.accettazione_modo === modo) return this.preventivoCompleto(r.id);
      throw new Rifiuto(n + ' è già accettato');
    }
    if (r.modello === 1) throw new Rifiuto('È un modello: prima fai un preventivo da questo modello');
    if (r.stato === 'BOZZA') throw new Rifiuto(n + ' non è ancora stato inviato');
    if (r.stato !== 'INVIATO') this.controllaModificabile(r);
    if (MODI_ACCETTAZIONE.indexOf(modo) < 0) throw new Rifiuto('Come ha accettato? firma, email, documento o voce');
    if (!nome) throw new Rifiuto('Nome: scrivi chi ha accettato');
    const firma = d.firma && d.firma.base64 ? d.firma : null;
    if (modo === 'firma' && !firma) throw new Rifiuto('Per la firma serve il tratto del cliente');

    // Le scelte del cliente: solo voci facoltative o alternative di questo preventivo.
    const voci = this.db.righe('SELECT v.* FROM preventivo_voci v JOIN preventivo_sezioni s ON s.id = v.sezione_id ' +
      'WHERE v.preventivo_id = ? ORDER BY s.ordine, s.id, v.ordine, v.id', r.id);
    const scelte = d.scelte && typeof d.scelte === 'object' ? d.scelte : {};
    const nuove = new Map(voci.map(v => [v.id, v.scelta]));
    for (const k of Object.keys(scelte)) {
      const v = voci.find(x => x.id === Number(k));
      if (!v) throw new Rifiuto('La voce ' + k + ' non è di questo preventivo');
      if (!v.facoltativa && !v.alternativa) continue;
      nuove.set(v.id, si(scelte[k]) ? 1 : 0);
    }
    const gruppi = {};
    for (const v of voci) {
      if (!v.alternativa || !nuove.get(v.id)) continue;
      const g = gruppoAlternativa(v);
      if (gruppi[g]) throw new Rifiuto('Di «' + v.alternativa + '» se ne sceglie una sola');
      gruppi[g] = true;
    }
    for (const v of voci) if (v.scelta !== nuove.get(v.id)) this.aggiorna('preventivo_voci', v.id, { scelta: nuove.get(v.id) });

    let idFirma = '';
    if (firma) {
      const dati = Buffer.from(String(firma.base64), 'base64');
      if (!dati.length) throw new Rifiuto('File vuoto');
      const mime = firma.mime || 'image/png';
      const gia = testo(firma.idFile)
        ? this.db.riga("SELECT * FROM file WHERE tipo = 'preventivo' AND preventivo_id = ? AND id_client = ? AND cestinato IS NULL", r.id, testo(firma.idFile))
        : null;
      const f = gia || this.salvaFile({
        dati, mime, tipo: 'preventivo', preventivoId: r.id, idClient: testo(firma.idFile),
        nome: etichetta(r).replace(/\//g, '-') + (modo === 'firma' ? ' firma' : ' accettazione') + estensioneDi(mime),
      });
      idFirma = f.id;
    }
    const ora = adesso();
    this.aggiorna('preventivi', r.id, {
      stato: 'ACCETTATO', accettato_il: ora, accettato_da: nome, accettazione_modo: modo, firma_file_id: idFirma, modificato: ora,
    });
    this.ricalcolaScadenze(r.id);
    return this.preventivoCompleto(r.id);
  },

  rifiutaPreventivo(d) {
    const r = this.rigaPreventivo(d.id);
    if (r.stato === 'RIFIUTATO') return this.preventivoCompleto(r.id);
    if (r.modello === 1) throw new Rifiuto('È un modello: non si rifiuta');
    if (r.stato === 'BOZZA') throw new Rifiuto('Il preventivo ' + etichetta(r) + ' non è ancora stato inviato');
    if (r.stato !== 'INVIATO') this.controllaModificabile(r);
    const ora = adesso();
    this.aggiorna('preventivi', r.id, { stato: 'RIFIUTATO', rifiutato_il: ora, motivo_rifiuto: testo(d.motivo), modificato: ora });
    return this.preventivoCompleto(r.id);
  },

  /** Un rifiutato si ripropone: diventa una revisione nuova in BOZZA. */
  riapriPreventivo(d) {
    const r = this.rigaPreventivo(d.id);
    if (r.stato !== 'RIFIUTATO') throw new Rifiuto('Si riapre solo un preventivo rifiutato');
    return this.nuovaRevisione(r.id);
  },

  /**
   * L'accettato diventa la commessa, una volta sola, senza riscrivere niente:
   * cliente, sede, oggetto, importo del contratto (l'imponibile), prestazioni
   * (le voci che contano, con gli sconti sul totale divisi in proporzione),
   * ore e prezzo orario dalle voci a ore, scadenze di pagamento.
   */
  creaCommessaDaPreventivo(d) {
    if (this.livello('preventivi') < 1) throw senzaPermesso('vedere i preventivi');
    const r = this.rigaPreventivo(d.id);
    if (r.commessa_id) throw new Rifiuto('Il preventivo ' + etichetta(r) + ' è già diventato la commessa ' + r.commessa_id);
    if (r.stato !== 'ACCETTATO') throw new Rifiuto('Il preventivo ' + etichetta(r) + ' non è accettato');
    const contenuto = this.contenutoPreventivo(r);
    const conti = contenuto.conti;
    const contate = [];
    contenuto.sezioni.forEach(s => s.voci.forEach(v => { if (v.conta) contate.push({ voce: v, sezione: s.titolo }); }));
    const prezziOrari = new Set(contate.filter(x => x.voce.modo === 'ore' && numero(x.voce.prezzo) > 0)
      .map(x => centesimi(numero(x.voce.prezzo) * (1 - numero(x.voce.scontoPercentuale) / 100))));
    const sede = r.sede_id ? this.db.riga('SELECT * FROM sedi WHERE id = ?', r.sede_id) : null;
    const codice = this.prossimoCodiceCommessa().codice;
    const ora = adesso();
    const c = this.chi();
    this.inserisci('commesse', {
      id: codice, cliente_id: r.cliente_id, descrizione: r.oggetto, stato: 'APERTA',
      indirizzo: sede ? [sede.indirizzo, sede.citta].filter(Boolean).join(', ') : '',
      budget_ore: conti.oreVoci > 0 ? conti.oreVoci : null,
      prezzo_orario: prezziOrari.size === 1 ? Array.from(prezziOrari)[0] : null,
      inizio: oggi(), fine_prevista: '', note: 'Dal preventivo ' + etichetta(r), sede_id: r.sede_id,
      responsabile_id: c.utente ? c.utente.id : null, importo_contratto: conti.imponibile, creato: ora, modificato: ora,
      modo_fatturazione: 'corpo',
    });
    this.segnaNumero('commessa', this.numeroDi('commessa', codice) || 0);
    // Gli sconti sul totale si dividono tra le prestazioni in proporzione: la somma resta l'importo del contratto.
    const somma = conti.sommaVoci;
    let resto = conti.imponibile;
    contate.forEach((x, i) => {
      let valore = x.voce.importo;
      if (somma > 0 && conti.imponibile !== somma) {
        valore = i === contate.length - 1 ? centesimi(resto) : centesimi(x.voce.importo * conti.imponibile / somma);
      }
      resto = centesimi(resto - valore);
      this.inserisci('prestazioni', {
        commessa_id: codice, nome: x.voce.descrizione, descrizione: x.sezione, valore, avanzamento: 0, stato: 'da_fare', ordine: i + 1,
      });
    });
    for (const s of contenuto.scadenze) this.aggiorna('scadenze_pagamento', s.id, { commessa_id: codice });
    this.aggiorna('preventivi', r.id, { commessa_id: codice, modificato: ora });
    return {
      ok: true,
      commessa: this.commessa(codice),
      prestazioni: this.leggiPrestazioni(codice),
      preventivo: this.preventivoCompleto(r.id),
    };
  },
};

Object.defineProperties(module.exports, {
  etichettaPreventivo: { value: etichetta },
  statoVistoPreventivo: { value: statoVisto },
});
