/*
 * Clienti e fornitori (un'anagrafica sola, "soggetti"), referenti, sedi e
 * impianti, commesse e prestazioni. Le azioni di oggi (creaCliente,
 * aggiornaCliente, creaCommessa, aggiornaCommessa) fanno esattamente quello che
 * facevano in Code.gs; quelle nuove (salvaSoggetto...) aggiungono i campi della
 * fase 1.
 *
 * Niente si cancella: clienti, fornitori e commesse si archiviano e si
 * ripristinano. Si tolgono solo referenti e prestazioni, e il registro tiene
 * com'erano.
 */
'use strict';

const {
  Rifiuto, senzaPermesso, testo, numero, numeroONull, siNoONull, unoZero, normalizza, adesso, oggi,
  dataIso, dataDaIso, dataOraIso,
} = require('../utili');
const { ELETTRODINAMICA, prossimoCodice, partitaIvaItalianaValida } = require('../conti');

const vuoto = v => v === undefined || v === null || v === '';
const numeroOVuoto = v => (vuoto(v) ? null : numero(v));

/** La commessa che aveva questo codice prima (cambiaCodiceCommessa): la piu' recente, se fossero due. */
const DOVE_CODICE_PRECEDENTE = " FROM commesse WHERE codice_precedente = ? COLLATE NOCASE AND codice_precedente <> '' ORDER BY rowid DESC LIMIT 1";

/** Il codice di una commessa: lettere, numeri, - _ / e punto, al massimo 20 caratteri (cambiaCodiceCommessa). */
const CODICE_COMMESSA = /^[A-Za-z0-9._/-]{1,20}$/;

/**
 * Le colonne di testo che tengono il codice di una commessa senza chiamarsi commessa_id o id_commessa (quelle le trova
 * cambiaCodiceCommessa da sola, in ogni tabella): la copia del codice nel rapportino.
 */
const ALTRE_COLONNE_CODICE = [['rapportini', 'commessa']];

/** Come si chiamano le tabelle nella nota del registro del cambio di codice (le altre: il nome senza trattini bassi). */
const NOMI_COLLEGATI = {
  commessa_persone: 'persone', fattura_righe: 'righe delle fatture', fattura_sorgenti: 'voci delle fatture', fatture_ricevute: 'fatture ricevute',
  scadenze_pagamento: 'scadenze di pagamento', attivita: 'attività', ricorrenze: 'serie di attività', assegnazioni: 'mezzi e attrezzature',
};

/** Un codice dentro un testo, da solo (non dentro un altro codice come 26ST001-A o ED.26ST001): per le bozze delle fatture. */
function cambiaCodiceNelTesto(t, vecchio, nuovo) {
  const scappato = vecchio.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
  const re = new RegExp('(^|[^A-Za-z0-9_./-])' + scappato + '(?![A-Za-z0-9_/-]|\\.[A-Za-z0-9])', 'gi');
  return String(t === null || t === undefined ? '' : t).replace(re, (x, prima) => prima + nuovo);
}

/** Una partita IVA per confrontarla: senza spazi, punti e "IT" davanti. */
function chiavePartitaIva(v) {
  return testo(v).toUpperCase().replace(/[\s.\-]/g, '').replace(/^IT(?=\d{11}$)/, '');
}

/** Campi del soggetto: nome nel JSON -> colonna, e come si pulisce. */
const CAMPI_TESTO_SOGGETTO = {
  nome: 'nome', gruppo: 'gruppo', email: 'email', pec: 'pec', telefono: 'telefono', partitaIva: 'partita_iva',
  codiceFiscale: 'codice_fiscale', codiceSdi: 'codice_sdi', indirizzo: 'indirizzo', cap: 'cap', citta: 'citta',
  provincia: 'provincia', nazione: 'nazione', note: 'note',
};
const CAMPI_NUMERO_SOGGETTO = { tariffaFissa: 'tariffa_fissa', costoFisso: 'costo_fisso', ultimaTariffa: 'ultima_tariffa', maggExtra: 'magg_extra' };
const CAMPI_SINO_SOGGETTO = { pagaViaggio: 'paga_viaggio', kmRimborsati: 'km_rimborsati' };

function soggettoDaRiga(r) {
  return {
    id: r.id,
    nome: testo(r.nome),
    alias: testo(r.alias).split(',').map(s => s.trim()).filter(String),
    gruppo: testo(r.gruppo),
    email: testo(r.email),
    telefono: testo(r.telefono),
    indirizzo: testo(r.indirizzo),
    partitaIva: testo(r.partita_iva),
    tariffaFissa: numeroONull(r.tariffa_fissa),
    costoFisso: numeroONull(r.costo_fisso),
    ultimaTariffa: numeroONull(r.ultima_tariffa),
    pagaViaggio: siNoONull(r.paga_viaggio),
    kmRimborsati: siNoONull(r.km_rimborsati),
    maggExtra: numeroONull(r.magg_extra),
    note: testo(r.note),
    accorpatoIn: testo(r.accorpato_in),
    // Fase 1
    cliente: r.cliente === 1,
    fornitore: r.fornitore === 1,
    pec: testo(r.pec),
    codiceFiscale: testo(r.codice_fiscale),
    codiceSdi: testo(r.codice_sdi),
    cap: testo(r.cap),
    citta: testo(r.citta),
    provincia: testo(r.provincia),
    nazione: testo(r.nazione) || 'IT',
    archiviato: r.archiviato === 1,
    creato: dataOraIso(r.creato),
    modificato: dataOraIso(r.modificato),
    // Fase 4: null = automatico (sostituto d'imposta se ha la partita IVA; pagamento come nelle impostazioni).
    sostitutoImposta: r.sostituto_imposta === null || r.sostituto_imposta === undefined ? null : r.sostituto_imposta === 1,
    pagamentoGiorni: r.pagamento_giorni === null || r.pagamento_giorni === undefined ? null : r.pagamento_giorni,
    pagamentoFineMese: r.pagamento_fine_mese === null || r.pagamento_fine_mese === undefined ? null : r.pagamento_fine_mese === 1,
    // Fase 7: il portale acceso per questo cliente.
    portale: r.portale === 1,
  };
}

/**
 * Fase 4: i campi della fatturazione del cliente. sostitutoImposta: null o
 * "automatico" = automatico, si'/no scritto a mano (un condominio si', un
 * forfettario no); pagamentoGiorni da 0 a 365 o vuoto; pagamentoFineMese si'/no o vuoto.
 */
function campiFatturazioneSoggetto(x, v) {
  if (x.sostitutoImposta !== undefined) {
    const a = x.sostitutoImposta;
    v.sostituto_imposta = a === null || a === '' || String(a).toLowerCase() === 'automatico' ? null : unoZero(a);
  }
  if (x.pagamentoGiorni !== undefined) {
    if (vuoto(x.pagamentoGiorni)) v.pagamento_giorni = null;
    else {
      const g = Math.round(numero(x.pagamentoGiorni));
      if (!(g >= 0 && g <= 365)) throw new Rifiuto('Giorni di pagamento: da 0 a 365');
      v.pagamento_giorni = g;
    }
  }
  if (x.pagamentoFineMese !== undefined) v.pagamento_fine_mese = vuoto(x.pagamentoFineMese) ? null : unoZero(x.pagamentoFineMese);
}

const MODI_FATTURAZIONE = ['ore', 'corpo', 'misto'];

function commessaDaRiga(r, persone) {
  return {
    id: testo(r.id),
    idCliente: testo(r.cliente_id),
    descrizione: testo(r.descrizione),
    stato: testo(r.stato).toUpperCase() || 'APERTA',
    indirizzo: testo(r.indirizzo),
    budgetOre: numeroONull(r.budget_ore),
    budgetEuro: numeroONull(r.budget_euro),
    prezzoOrario: numeroONull(r.prezzo_orario),
    costoOrario: numeroONull(r.costo_orario),
    euroKm: numeroONull(r.euro_km),
    inizio: dataIso(r.inizio),
    finePrevista: dataIso(r.fine_prevista),
    cartella: testo(r.cartella),
    codicePrecedente: testo(r.codice_precedente),
    note: testo(r.note),
    // Fase 1
    sedeId: r.sede_id === null ? null : r.sede_id,
    responsabileId: r.responsabile_id === null ? null : r.responsabile_id,
    importoContratto: numeroONull(r.importo_contratto),
    persone: persone || [],
    archiviata: r.archiviata === 1,
    modello: r.modello === 1,
    creato: dataOraIso(r.creato),
    modificato: dataOraIso(r.modificato),
    // Fase 4: come si fattura (ore: rapportini e ore; corpo: le scadenze del contratto; misto: tutti e due).
    modoFatturazione: r.modo_fatturazione || 'ore',
    // Fase 5: la commessa di un contratto d'assistenza (pillola "Assistenza").
    idContratto: r.contratto_id === null || r.contratto_id === undefined ? null : r.contratto_id,
  };
}

function prestazioneDaRiga(r) {
  return {
    id: r.id, idCommessa: r.commessa_id, nome: r.nome, descrizione: r.descrizione,
    valore: numeroONull(r.valore), avanzamento: r.avanzamento, stato: r.stato, ordine: r.ordine,
  };
}

function referenteDaRiga(r) {
  return {
    id: r.id, idSoggetto: r.soggetto_id, nome: r.nome, ruolo: r.ruolo, email: r.email, telefono: r.telefono,
    note: r.note, ordine: r.ordine,
    // Fase 7 (§10.4): l'accesso al portale, chi paga le fatture, WhatsApp (statoPortale lo aggiunge leggiReferenti a chi vede il portale).
    portale: r.portale === 1, pagamenti: r.pagamenti === 1, whatsapp: r.whatsapp || '', whatsappOk: r.whatsapp_ok === 1,
  };
}

/** Fase 5: le categorie degli impianti e gli ambienti (l'ambiente propone la periodicita' delle verifiche DPR 462). */
const CATEGORIE_IMPIANTO = { cabina_mt: 'Cabina MT', quadro: 'Quadro', terra: 'Impianto di terra', scariche: 'Protezione dalle scariche',
  fotovoltaico: 'Fotovoltaico', automazione: 'Automazione', illuminazione: 'Illuminazione', altro: 'Altro' };
const AMBIENTI = ['ordinario', 'cantiere', 'medico', 'incendio', 'esplosione'];

function sedeDaRiga(r) {
  return {
    id: r.id, idSoggetto: r.soggetto_id, tipo: r.tipo, nome: r.nome, indirizzo: r.indirizzo, cap: r.cap,
    citta: r.citta, provincia: r.provincia, note: r.note, archiviata: r.archiviata === 1,
    // Fase 5: i dati dell'impianto (tutti facoltativi).
    categoria: r.categoria || '', categoriaNome: CATEGORIE_IMPIANTO[r.categoria] || '',
    sedePadreId: r.sede_padre_id === null || r.sede_padre_id === undefined ? null : r.sede_padre_id,
    matricola: r.matricola || '', potenza: r.potenza || '', tensione: r.tensione || '', messaInServizio: r.messa_in_servizio || '',
    ambiente: r.ambiente || '', referenteId: r.referente_id === null || r.referente_id === undefined ? null : r.referente_id,
    datiTecnici: r.dati_tecnici || '',
  };
}

/**
 * Le regole dei campi nuovi (salvaSoggetto): una partita IVA italiana ha 11
 * cifre e il suo codice di controllo, il codice fiscale 16 caratteri (o 11
 * cifre per le societa'), il codice SDI 7 lettere o cifre, il CAP italiano 5
 * cifre, l'email la sua @. Le azioni di prima (creaCliente) non controllano,
 * come oggi: un telefono vecchio non deve vedersi rifiutare un rapportino.
 */
function controllaCampiSoggetto(v) {
  const italiano = !v.nazione || v.nazione === 'IT';
  if (v.partita_iva && italiano) {
    const p = chiavePartitaIva(v.partita_iva);
    if (!/^\d{11}$/.test(p)) throw new Rifiuto('Partita IVA: deve avere 11 cifre');
    if (!partitaIvaItalianaValida(p)) throw new Rifiuto('Partita IVA: il numero non torna, controlla le cifre');
    v.partita_iva = p;
  }
  if (v.codice_fiscale) {
    const cf = v.codice_fiscale.toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z0-9]{16}$/.test(cf) && !/^\d{11}$/.test(cf)) {
      throw new Rifiuto('Codice fiscale: deve avere 16 caratteri (o 11 cifre per una società)');
    }
    v.codice_fiscale = cf;
  }
  if (v.codice_sdi) {
    const sdi = v.codice_sdi.toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z0-9]{7}$/.test(sdi)) throw new Rifiuto('Codice SDI: deve avere 7 lettere o cifre');
    v.codice_sdi = sdi;
  }
  if (v.cap && italiano && !/^\d{5}$/.test(v.cap)) throw new Rifiuto('CAP: deve avere 5 cifre');
  if (v.email && !/^[^@\s]+@[^@\s]+$/.test(v.email)) throw new Rifiuto('Email: manca la @ o c\'è uno spazio');
  if (v.pec && !/^[^@\s]+@[^@\s]+$/.test(v.pec)) throw new Rifiuto('PEC: manca la @ o c\'è uno spazio');
  if (v.provincia) v.provincia = v.provincia.toUpperCase();
  if (v.nazione) v.nazione = v.nazione.toUpperCase();
}

module.exports = {
  // ------------------------------------------------------------------ lettura

  /** Tutte le righe dei soggetti (anche accorpati e archiviati). */
  righeSoggetti() {
    return this.db.righe('SELECT * FROM soggetti ORDER BY rowid');
  },

  /**
   * I clienti come li dava leggiClienti() di Code.gs: senza nome o accorpati
   * non si propongono. Gli archiviati solo se chiesti.
   */
  leggiClienti(opzioni) {
    const o = opzioni || {};
    return this.righeSoggetti().filter(r => r.cliente === 1).map(soggettoDaRiga)
      .filter(c => c.nome !== '' && !c.accorpatoIn && (o.archiviati || !c.archiviato));
  },

  leggiFornitori(opzioni) {
    const o = opzioni || {};
    return this.righeSoggetti().filter(r => r.fornitore === 1).map(soggettoDaRiga)
      .filter(c => c.nome !== '' && !c.accorpatoIn && (o.archiviati || !c.archiviato));
  },

  /** Chi si cerca per i doppioni e per i rapportini: tutti, archiviati compresi, tranne gli accorpati. */
  soggettiAttivi() {
    return this.righeSoggetti().map(soggettoDaRiga).filter(c => c.nome !== '' && !c.accorpatoIn);
  },

  soggetto(id) {
    const r = this.db.riga('SELECT * FROM soggetti WHERE id = ?', testo(id));
    return r ? soggettoDaRiga(r) : null;
  },

  /** Per codice se c'e', altrimenti per nome o alias (maiuscole, spazi e trattini non contano). */
  trovaCliente(clienti, id, nome) {
    if (id) {
      const perId = clienti.filter(c => c.id === id)[0];
      if (perId) return perId;
    }
    if (!nome) return null;
    const n = normalizza(nome);
    return clienti.filter(c => [c.nome].concat(c.alias).some(x => normalizza(x) === n))[0] || null;
  },

  /** Un doppione: stesso nome o alias normalizzato, o stessa partita IVA (se scritta). */
  trovaDoppione(nome, partitaIva, tranneId) {
    const tutti = this.soggettiAttivi().filter(s => s.id !== tranneId);
    const perNome = nome ? this.trovaCliente(tutti, '', nome) : null;
    if (perNome) return perNome;
    const p = chiavePartitaIva(partitaIva);
    if (!p) return null;
    return tutti.filter(s => chiavePartitaIva(s.partitaIva) === p)[0] || null;
  },

  leggiGruppi() {
    return this.db.righe('SELECT * FROM gruppi ORDER BY rowid').map(r => ({
      nome: testo(r.nome),
      tariffaFissa: numeroONull(r.tariffa_fissa),
      pagaViaggio: siNoONull(r.paga_viaggio) === true,
      kmRimborsati: siNoONull(r.km_rimborsati) !== false,
      maggExtra: numero(r.magg_extra),
      email: testo(r.email),
      note: testo(r.note),
    })).filter(g => g.nome !== '');
  },

  personeDelleCommesse() {
    const p = {};
    for (const r of this.db.righe('SELECT commessa_id, utente_id FROM commessa_persone ORDER BY utente_id')) {
      const k = r.commessa_id.toUpperCase();
      (p[k] = p[k] || []).push(r.utente_id);
    }
    return p;
  },

  /** Le commesse; archiviate e modelli solo se chiesti (un modello non compare negli elenchi normali). */
  leggiCommesse(opzioni) {
    const o = opzioni || {};
    const persone = this.personeDelleCommesse();
    return this.db.righe('SELECT * FROM commesse ORDER BY rowid')
      .map(r => commessaDaRiga(r, persone[testo(r.id).toUpperCase()]))
      .filter(m => m.id !== '' && (o.archiviati || !m.archiviata) && (o.modelli || !m.modello));
  },

  /**
   * La commessa di un codice. 06/11/2026: anche col codice di prima (codice_precedente, dopo cambiaCodiceCommessa): una
   * coda di un telefono senza rete puo' mandarlo ancora. Il codice di adesso vale sempre prima di quello di prima.
   */
  commessa(id) {
    let r = this.db.riga('SELECT * FROM commesse WHERE id = ?', testo(id));
    if (!r && testo(id)) r = this.db.riga('SELECT *' + DOVE_CODICE_PRECEDENTE, testo(id));
    return r ? commessaDaRiga(r, this.personeDelleCommesse()[testo(r.id).toUpperCase()]) : null;
  },

  /** Il codice di adesso di una commessa dal codice che arriva (anche quello di prima); se non c'e', il codice com'e'. */
  codiceCommessaVero(codice) {
    const c = testo(codice);
    if (!c) return '';
    const r = this.db.riga('SELECT id FROM commesse WHERE id = ?', c) || this.db.riga('SELECT id' + DOVE_CODICE_PRECEDENTE, c);
    return r ? r.id : c;
  },

  leggiPrestazioni(idCommessa) {
    const righe = idCommessa
      ? this.db.righe('SELECT * FROM prestazioni WHERE commessa_id = ? ORDER BY ordine, id', idCommessa)
      : this.db.righe('SELECT * FROM prestazioni ORDER BY commessa_id, ordine, id');
    return righe.map(prestazioneDaRiga);
  },

  leggiReferenti() {
    const portale = this.livello('portale') >= 1;
    return this.db.righe('SELECT * FROM referenti ORDER BY soggetto_id, ordine, id').map(r => {
      const o = referenteDaRiga(r);
      if (portale) { o.statoPortale = this.statoReferente(r); o.ultimoAccesso = dataOraIso(r.ultimo_accesso); }
      return o;
    });
  },

  leggiSedi(opzioni) {
    const o = opzioni || {};
    return this.db.righe('SELECT * FROM sedi ORDER BY soggetto_id, id').map(sedeDaRiga)
      .filter(s => o.archiviati || !s.archiviata);
  },

  /**
   * Tutto quello che telefono e computer tengono in memoria. Le parti di oggi
   * (clienti, commesse, gruppi, impostazioni) sono uguali a quelle dello script;
   * le nuove si aggiungono, ognuna solo a chi puo' vedere il suo modulo.
   */
  rispostaAnagrafiche(d) {
    const archiviati = d.archiviati === true || d.archiviati === '1';
    const modelli = d.modelli === true || d.modelli === '1' || archiviati;
    const vedeClienti = this.livello('clienti') > 0;
    const vedeCommesse = this.livello('commesse') > 0;
    // Fase 6: l'esterno ha solo le commesse dei suoi incarichi, i loro clienti (il nome) e le loro sedi.
    if (this.eEsterno()) return this.anagraficheEsterno();
    const persone = {};
    this.db.righe('SELECT id, utente_id FROM persone WHERE utente_id IS NOT NULL').forEach(p => { persone[p.utente_id] = p.id; });
    const collaboratori = new Set(this.db.righe('SELECT soggetto_id FROM collaboratori').map(c => c.soggetto_id));
    const r = {
      ok: true,
      clienti: vedeClienti || this.livello('rapportini') > 0 ? this.leggiClienti({ archiviati }) : [],
      commesse: vedeCommesse || this.livello('rapportini') > 0 ? this.leggiCommesse({ archiviati, modelli }) : [],
      gruppi: this.leggiGruppi(),
      impostazioni: this.leggiImpostazioni(),
      fornitori: vedeClienti ? this.leggiFornitori({ archiviati }).map(f => Object.assign(f, { collaboratore: collaboratori.has(f.id) })) : [],
      referenti: vedeClienti ? this.leggiReferenti() : [],
      sedi: vedeClienti || vedeCommesse ? this.leggiSedi({ archiviati }) : [],
      prestazioni: vedeCommesse ? this.leggiPrestazioni() : [],
      // 03/11/2026: i progetti, per scegliere quello del rapportino anche senza rete (e proporre il codice di uno nuovo).
      progetti: this.livello('progetti') > 0 || this.livello('rapportini') > 0 ? this.leggiProgetti({}) : [],
      utenti: this.db.righe('SELECT id, nome, ruolo, attivo, soggetto_id FROM utenti ORDER BY nome')
        .map(u => Object.assign({ id: u.id, nome: u.nome, ruolo: u.ruolo, attivo: u.attivo === 1, idPersona: persone[u.id] || null },
          u.ruolo === 'esterno' ? { idSoggetto: u.soggetto_id } : {})),
      numerazioni: this.leggiNumerazioni(),
    };
    // Fase 6: i mezzi e i miei strumenti, per il telefono senza rete.
    if (this.livello('mezzi') >= 1) {
      r.mezzi = this.mezziPerAnagrafiche();
      r.mieiStrumenti = this.mieiStrumenti();
    }
    return r;
  },

  /**
   * Le anagrafiche di un esterno (fase6.md §8.4 e §10.5): solo le commesse dei suoi incarichi (senza soldi), i loro
   * clienti col solo nome, le loro sedi e impianti; niente fornitori, referenti, altri utenti, impostazioni dei soldi.
   */
  anagraficheEsterno() {
    const mie = this.commesseEsterno();
    const commesse = this.leggiCommesse({ archiviati: true }).filter(m => mie.has(m.id.toUpperCase()))
      // Niente budget (nemmeno le ore previste), note interne, cartella, contratto, persone dello studio (§8.4: codice, nome,
      // cliente, sede con l'indirizzo). Le chiavi restano, vuote, per le app che le leggono.
      .map(m => Object.assign({}, m, { persone: [], responsabileId: null, budgetOre: null, note: '', cartella: '', codicePrecedente: '', idContratto: null }));
    const idClienti = new Set(commesse.map(m => m.idCliente));
    const idSedi = new Set(commesse.map(m => m.sedeId).filter(x => x !== null && x !== undefined));
    const imp = this.leggiImpostazioni();
    const impostazioni = {};
    for (const k of ['RAGIONE_SOCIALE', 'INDIRIZZO', 'PARTITA_IVA', 'EMAIL', 'TELEFONO', 'PEC', 'TICKET_ATTIVO', 'APPROVAZIONE', 'ORE_GIORNALIERE']) impostazioni[k] = imp[k];
    const c = this.chi();
    return {
      ok: true,
      clienti: this.leggiClienti({ archiviati: true }).filter(s => idClienti.has(s.id)).map(s => ({ id: s.id, nome: s.nome, alias: [], gruppo: '', cliente: true, fornitore: false })),
      commesse,
      gruppi: [],
      impostazioni,
      fornitori: [],
      referenti: [],
      sedi: this.leggiSedi({ archiviati: true }).filter(s => idSedi.has(s.id) || (idClienti.has(s.idSoggetto) && s.tipo === 'impianto' && commesse.some(m => m.sedeId === s.id))),
      prestazioni: this.leggiPrestazioni().filter(p => mie.has(String(p.idCommessa).toUpperCase())),
      // 03/11/2026: i progetti delle commesse dei suoi incarichi (leggiProgetti filtra gia').
      progetti: this.leggiProgetti({}),
      utenti: c.utente ? [{ id: c.utente.id, nome: c.utente.nome, ruolo: 'esterno', attivo: true, idPersona: null }] : [],
      numerazioni: this.leggiNumerazioni().filter(n => n.tipo === 'rapportino'),
    };
  },

  // ------------------------------------------------------------------ clienti (azioni di oggi)

  creaCliente(d) {
    const pulito = testo(d.nome);
    if (!pulito) throw new Rifiuto('Serve il nome del cliente');

    // Se esiste gia' (anche solo come alias, o con la stessa partita IVA) si
    // restituisce quello: e' facilissimo ricreare due volte lo stesso cliente
    // con una lettera di differenza.
    const esistente = this.trovaDoppione(pulito, d.partitaIva);
    if (esistente) {
      // Era solo un fornitore: ora e' anche cliente.
      if (!esistente.cliente) this.aggiorna('soggetti', esistente.id, { cliente: 1, modificato: adesso() });
      return Object.assign({ giaEsisteva: true }, this.soggetto(esistente.id));
    }

    // Un telefono rimasto alla 0.3.3 chiede ancora "di che gruppo e'?": un cliente
    // finale "di Elettrodinamica" e' Elettrodinamica, perche' si fattura a lei.
    if (normalizza(d.gruppo) === normalizza(ELETTRODINAMICA.nome)) {
      const elettro = this.trovaCliente(this.leggiClienti({ archiviati: true }), '', ELETTRODINAMICA.nome);
      if (elettro) return Object.assign({ giaEsisteva: true }, elettro);
    }

    // Anche le righe dei clienti accorpati contano: un codice non si riusa mai.
    const id = prossimoCodice(this.righeSoggetti().map(c => c.id), 'C');
    const ora = adesso();
    this.inserisci('soggetti', {
      id, cliente: 1, fornitore: 0, nome: pulito,
      tariffa_fissa: vuoto(d.tariffaFissa) ? null : numero(d.tariffaFissa),
      email: testo(d.email), telefono: testo(d.telefono), indirizzo: testo(d.indirizzo),
      partita_iva: testo(d.partitaIva), note: testo(d.note), creato: ora, modificato: ora,
    });
    return Object.assign({ giaEsisteva: false }, this.soggetto(id));
  },

  aggiornaCliente(id, campi) {
    const riga = this.db.riga('SELECT * FROM soggetti WHERE id = ?', testo(id));
    if (!riga) throw new Rifiuto('Cliente ' + id + ' non trovato');
    const valori = {};
    for (const k of Object.keys(CAMPI_TESTO_SOGGETTO)) {
      if (campi[k] !== undefined) valori[CAMPI_TESTO_SOGGETTO[k]] = testo(campi[k]);
    }
    if (campi.alias !== undefined) {
      valori.alias = Array.isArray(campi.alias) ? campi.alias.join(', ') : testo(campi.alias);
    }
    for (const k of Object.keys(CAMPI_SINO_SOGGETTO)) {
      if (campi[k] !== undefined) valori[CAMPI_SINO_SOGGETTO[k]] = campi[k] === null ? null : (campi[k] ? 1 : 0);
    }
    for (const k of Object.keys(CAMPI_NUMERO_SOGGETTO)) {
      if (campi[k] !== undefined) valori[CAMPI_NUMERO_SOGGETTO[k]] = numeroOVuoto(campi[k]);
    }
    campiFatturazioneSoggetto(campi, valori);
    valori.modificato = adesso();
    this.aggiorna('soggetti', riga.id, valori);
    return this.soggetto(riga.id);
  },

  // ------------------------------------------------------------------ soggetti (fase 1)

  /**
   * Crea o aggiorna un cliente o un fornitore con tutti i campi. Un soggetto
   * nuovo con lo stesso nome, alias o partita IVA di uno che c'e' gia' non si
   * crea: si restituisce quello (giaEsisteva), e se arriva come fornitore e
   * prima era solo cliente diventa tutti e due.
   */
  salvaSoggetto(s) {
    s = s || {};
    const nuovo = !testo(s.id);
    const prima = nuovo ? null : this.db.riga('SELECT * FROM soggetti WHERE id = ?', testo(s.id));
    if (!nuovo && !prima) throw new Rifiuto('Soggetto ' + s.id + ' non trovato');

    const v = {};
    for (const k of Object.keys(CAMPI_TESTO_SOGGETTO)) {
      if (s[k] !== undefined) v[CAMPI_TESTO_SOGGETTO[k]] = testo(s[k]);
    }
    if (s.alias !== undefined) v.alias = Array.isArray(s.alias) ? s.alias.map(testo).filter(String).join(', ') : testo(s.alias);
    if (s.cliente !== undefined) v.cliente = s.cliente ? 1 : 0;
    if (s.fornitore !== undefined) v.fornitore = s.fornitore ? 1 : 0;
    // Tariffe e costi solo da chi li vede: un collaboratore non potrebbe nemmeno sapere cosa sta cambiando.
    if (this.vedeCosti()) {
      for (const k of Object.keys(CAMPI_NUMERO_SOGGETTO)) if (s[k] !== undefined) v[CAMPI_NUMERO_SOGGETTO[k]] = numeroOVuoto(s[k]);
    }
    for (const k of Object.keys(CAMPI_SINO_SOGGETTO)) if (s[k] !== undefined) v[CAMPI_SINO_SOGGETTO[k]] = unoZero(s[k]);
    campiFatturazioneSoggetto(s, v);
    if (v.nazione === '') v.nazione = 'IT';
    if (v.nazione === undefined) v.nazione = prima ? prima.nazione : 'IT';
    controllaCampiSoggetto(v);

    if (nuovo) {
      if (!v.nome) throw new Rifiuto('Nome: scrivi il nome o la ragione sociale');
      const cliente = v.cliente === undefined ? 1 : v.cliente;
      const fornitore = v.fornitore === undefined ? 0 : v.fornitore;
      if (!cliente && !fornitore) throw new Rifiuto('Scegli se è un cliente, un fornitore o tutti e due');
      const doppione = this.trovaDoppione(v.nome, v.partita_iva);
      if (doppione) {
        const flag = {};
        if (cliente && !doppione.cliente) flag.cliente = 1;
        if (fornitore && !doppione.fornitore) flag.fornitore = 1;
        if (Object.keys(flag).length) this.aggiorna('soggetti', doppione.id, Object.assign(flag, { modificato: adesso() }));
        return Object.assign({ giaEsisteva: true }, this.soggetto(doppione.id));
      }
      const id = prossimoCodice(this.righeSoggetti().map(c => c.id), cliente ? 'C' : 'F');
      const ora = adesso();
      this.inserisci('soggetti', Object.assign({}, v, { id, cliente, fornitore, creato: ora, modificato: ora }));
      return Object.assign({ giaEsisteva: false }, this.soggetto(id));
    }

    const cliente = v.cliente === undefined ? prima.cliente : v.cliente;
    const fornitore = v.fornitore === undefined ? prima.fornitore : v.fornitore;
    if (!cliente && !fornitore) throw new Rifiuto('Scegli se è un cliente, un fornitore o tutti e due');
    if (v.nome !== undefined && !v.nome) throw new Rifiuto('Nome: scrivi il nome o la ragione sociale');
    if (v.partita_iva) {
      const altro = this.soggettiAttivi().filter(x => x.id !== prima.id && chiavePartitaIva(x.partitaIva) === v.partita_iva)[0];
      if (altro) throw new Rifiuto('Partita IVA: è già di ' + altro.nome + ' (' + altro.id + ')');
    }
    v.modificato = adesso();
    this.aggiorna('soggetti', prima.id, v);
    return Object.assign({ giaEsisteva: false }, this.soggetto(prima.id));
  },

  archiviaSoggetto(id, archiviato) {
    const r = this.db.riga('SELECT id FROM soggetti WHERE id = ?', testo(id));
    if (!r) throw new Rifiuto('Soggetto ' + id + ' non trovato');
    this.aggiorna('soggetti', r.id, { archiviato: archiviato ? 1 : 0, modificato: adesso() });
    return this.soggetto(r.id);
  },

  salvaReferente(x) {
    x = x || {};
    const soggettoId = testo(x.idSoggetto || x.soggettoId);
    const v = {};
    ['nome', 'ruolo', 'email', 'telefono', 'note'].forEach(k => { if (x[k] !== undefined) v[k] = testo(x[k]); });
    if (x.ordine !== undefined) v.ordine = Math.round(numero(x.ordine));
    if (v.email && !/^[^@\s]+@[^@\s]+$/.test(v.email)) throw new Rifiuto('Email: manca la @ o c\'è uno spazio');
    // Fase 7 (§10.4): paga le fatture, il numero WhatsApp (se diverso dal telefono), il si' a WhatsApp.
    if (x.pagamenti !== undefined) v.pagamenti = siNoONull(x.pagamenti) ? 1 : 0;
    if (x.whatsapp !== undefined) v.whatsapp = testo(x.whatsapp);
    let whatsappOk;
    if (x.whatsappOk !== undefined) whatsappOk = siNoONull(x.whatsappOk) ? 1 : 0;
    if (x.id) {
      const prima = this.db.riga('SELECT * FROM referenti WHERE id = ?', Number(x.id));
      if (!prima) throw new Rifiuto('Referente ' + x.id + ' non trovato');
      if (v.nome !== undefined && !v.nome) throw new Rifiuto('Nome: scrivi il nome del referente');
      if (whatsappOk !== undefined && whatsappOk !== prima.whatsapp_ok) Object.assign(v, { whatsapp_ok: whatsappOk, whatsapp_ok_il: whatsappOk ? oggi() : '' });
      // L'email cambiata di uno col portale: si chiudono le sue sessioni e due referenti della stessa azienda non hanno la stessa email.
      const emailCambiata = v.email !== undefined && v.email.toLowerCase() !== testo(prima.email).toLowerCase();
      if (emailCambiata && prima.portale === 1) {
        if (!v.email) throw new Rifiuto('Il referente ha l\'accesso al portale: l\'email serve (o togli prima l\'accesso)');
        if (this.db.riga('SELECT id FROM referenti WHERE soggetto_id = ? AND portale = 1 AND lower(email) = lower(?) AND id <> ?', prima.soggetto_id, v.email, prima.id)) {
          throw new Rifiuto('Questa email è già di un altro referente di ' + ((this.db.riga('SELECT nome FROM soggetti WHERE id = ?', prima.soggetto_id) || {}).nome || prima.soggetto_id));
        }
      }
      this.aggiorna('referenti', prima.id, v, 'id', whatsappOk !== undefined && whatsappOk !== prima.whatsapp_ok ? (whatsappOk ? 'WhatsApp: ha detto di sì' : 'WhatsApp: non vuole più') : undefined);
      const o = referenteDaRiga(this.db.riga('SELECT * FROM referenti WHERE id = ?', prima.id));
      if (emailCambiata && prima.portale === 1) {
        this.chiudiSessioniPortale('referente_id = ?', [prima.id], 'email cambiata');
        this.annullaLinkPortale('referente_id = ?', [prima.id]);
        o.avviso = 'L\'email è cambiata: per entrare nel portale userà quella nuova';
      }
      return o;
    }
    if (whatsappOk !== undefined) Object.assign(v, { whatsapp_ok: whatsappOk, whatsapp_ok_il: whatsappOk ? oggi() : '' });
    if (!this.db.riga('SELECT id FROM soggetti WHERE id = ?', soggettoId)) throw new Rifiuto('Soggetto ' + soggettoId + ' non trovato');
    if (!v.nome) throw new Rifiuto('Nome: scrivi il nome del referente');
    if (v.ordine === undefined) {
      v.ordine = (this.db.riga('SELECT MAX(ordine) m FROM referenti WHERE soggetto_id = ?', soggettoId).m || 0) + 1;
    }
    const id = this.inserisci('referenti', Object.assign({ soggetto_id: soggettoId }, v));
    return referenteDaRiga(this.db.riga('SELECT * FROM referenti WHERE id = ?', id));
  },

  togliReferente(id) {
    const r = this.db.riga('SELECT * FROM referenti WHERE id = ?', Number(id));
    if (!r) throw new Rifiuto('Referente ' + id + ' non trovato');
    // Fase 7: uno con l'accesso al portale lo perde prima (sessioni chiuse, link annullati).
    if (r.portale === 1) this.togliAccessoInterno(r, 'tolto');
    this.db.esegui('DELETE FROM referenti WHERE id = ?', r.id);
    this.annota('referenti', r.id, Object.assign({}, r), null, 'tolto');
  },

  salvaSede(x) {
    x = x || {};
    const v = {};
    ['nome', 'indirizzo', 'cap', 'citta', 'provincia', 'note'].forEach(k => { if (x[k] !== undefined) v[k] = testo(x[k]); });
    if (x.tipo !== undefined) {
      v.tipo = testo(x.tipo).toLowerCase() || 'sede';
      if (['sede', 'impianto'].indexOf(v.tipo) < 0) throw new Rifiuto('Tipo: "sede" o "impianto"');
    }
    if (x.archiviata !== undefined) v.archiviata = x.archiviata ? 1 : 0;
    if (v.cap && !/^\d{5}$/.test(v.cap)) throw new Rifiuto('CAP: deve avere 5 cifre');
    if (v.provincia) v.provincia = v.provincia.toUpperCase();
    // Fase 5: i dati dell'impianto.
    ['matricola', 'potenza', 'tensione'].forEach(k => { if (x[k] !== undefined) v[k] = testo(x[k]); });
    if (x.datiTecnici !== undefined) v.dati_tecnici = testo(x.datiTecnici);
    if (x.categoria !== undefined) {
      v.categoria = testo(x.categoria);
      if (v.categoria && !CATEGORIE_IMPIANTO[v.categoria]) throw new Rifiuto('Categoria: ' + Object.keys(CATEGORIE_IMPIANTO).join(', '));
    }
    if (x.ambiente !== undefined) {
      v.ambiente = testo(x.ambiente);
      if (v.ambiente && AMBIENTI.indexOf(v.ambiente) < 0) throw new Rifiuto('Ambiente: ' + AMBIENTI.join(', '));
    }
    if (x.messaInServizio !== undefined) v.messa_in_servizio = testo(x.messaInServizio) ? dataDaIso(x.messaInServizio) : '';
    const soggettoDi = () => (x.id ? (this.db.riga('SELECT soggetto_id FROM sedi WHERE id = ?', Number(x.id)) || {}).soggetto_id : testo(x.idSoggetto || x.soggettoId));
    if (x.sedePadreId !== undefined) {
      v.sede_padre_id = vuoto(x.sedePadreId) ? null : Number(x.sedePadreId);
      if (v.sede_padre_id !== null) {
        const padre = this.db.riga('SELECT * FROM sedi WHERE id = ?', v.sede_padre_id);
        if (!padre || padre.soggetto_id !== soggettoDi() || (x.id && padre.id === Number(x.id))) throw new Rifiuto('Sede: scegli una sede dello stesso cliente');
      }
    }
    if (x.referenteId !== undefined) {
      v.referente_id = vuoto(x.referenteId) ? null : Number(x.referenteId);
      if (v.referente_id !== null) {
        const ref = this.db.riga('SELECT * FROM referenti WHERE id = ?', v.referente_id);
        if (!ref || ref.soggetto_id !== soggettoDi()) throw new Rifiuto('Referente: scegli un referente dello stesso cliente');
      }
    }
    if (x.id) {
      const prima = this.db.riga('SELECT * FROM sedi WHERE id = ?', Number(x.id));
      if (!prima) throw new Rifiuto('Sede ' + x.id + ' non trovata');
      if (v.nome !== undefined && !v.nome) throw new Rifiuto('Nome: scrivi il nome della sede o dell\'impianto');
      this.aggiorna('sedi', prima.id, v);
      return sedeDaRiga(this.db.riga('SELECT * FROM sedi WHERE id = ?', prima.id));
    }
    const soggettoId = testo(x.idSoggetto || x.soggettoId);
    if (!this.db.riga('SELECT id FROM soggetti WHERE id = ?', soggettoId)) throw new Rifiuto('Soggetto ' + soggettoId + ' non trovato');
    if (!v.nome) throw new Rifiuto('Nome: scrivi il nome della sede o dell\'impianto');
    const id = this.inserisci('sedi', Object.assign({ soggetto_id: soggettoId, tipo: 'sede' }, v));
    return sedeDaRiga(this.db.riga('SELECT * FROM sedi WHERE id = ?', id));
  },

  archiviaSede(id, archiviata) {
    return this.salvaSede({ id, archiviata: archiviata !== false });
  },

  // ------------------------------------------------------------------ commesse (azioni di oggi)

  /** Il codice di una commessa nuova: il numero dopo il piu' alto usato, anno di oggi. */
  prossimoCodiceCommessa(anno) {
    const codici = this.db.righe('SELECT id FROM commesse').map(r => r.id);
    return this.prossimoNumero('commessa', codici, anno || Number(oggi().slice(0, 4)));
  },

  creaCommessa(d) {
    const desc = testo(d.descrizione);
    if (!desc) throw new Rifiuto('Serve la descrizione della commessa');
    if (!d.idCliente) throw new Rifiuto('Serve il cliente della commessa');

    const commesse = this.leggiCommesse({ archiviati: true });
    const esistente = commesse.filter(m => m.idCliente === d.idCliente && normalizza(m.descrizione) === normalizza(desc))[0];
    if (esistente) return Object.assign({ giaEsisteva: true }, esistente);

    const codici = this.db.righe('SELECT id FROM commesse').map(r => r.id.toUpperCase());
    const prossimo = this.prossimoCodiceCommessa();
    let id = testo(d.id).toUpperCase() || prossimo.codice;
    if (codici.indexOf(id) >= 0) {
      // Il telefono propone il codice quando la commessa nasce, anche senza rete: se nel
      // frattempo il computer l'ha dato a un'altra, si prende il primo libero. Un codice
      // scritto a mano, invece, si rifiuta: chi l'ha scritto deve saperlo.
      if (d.idProposto !== true) throw new Rifiuto('Il codice ' + id + ' e\' gia\' di un\'altra commessa');
      id = prossimo.codice;
    }
    const ora = adesso();
    this.inserisci('commesse', Object.assign({
      id,
      cliente_id: testo(d.idCliente),
      descrizione: desc,
      stato: 'APERTA',
      indirizzo: testo(d.indirizzo),
      budget_ore: numeroOVuoto(d.budgetOre),
      budget_euro: numeroOVuoto(d.budgetEuro),
      euro_km: numeroOVuoto(d.euroKm),
      prezzo_orario: numeroOVuoto(d.prezzoOrario),
      costo_orario: numeroOVuoto(d.costoOrario),
      inizio: d.inizio ? dataDaIso(d.inizio) : oggi(),
      fine_prevista: d.finePrevista ? dataDaIso(d.finePrevista) : '',
      note: testo(d.note),
      creato: ora,
      modificato: ora,
    }, this.campiNuoviCommessa(d)));
    const n = this.numeroDi('commessa', id);
    if (n !== null) this.segnaNumero('commessa', n);
    if (Array.isArray(d.persone)) this.scriviPersone(id, d.persone);
    return Object.assign({ giaEsisteva: false }, this.commessa(id));
  },

  /** Sede, responsabile, importo del contratto: controllati prima di scriverli. */
  campiNuoviCommessa(d) {
    const v = {};
    if (d.sedeId !== undefined) {
      v.sede_id = vuoto(d.sedeId) ? null : Number(d.sedeId);
      if (v.sede_id !== null && !this.db.riga('SELECT id FROM sedi WHERE id = ?', v.sede_id)) throw new Rifiuto('Sede ' + d.sedeId + ' non trovata');
    }
    if (d.responsabileId !== undefined) {
      v.responsabile_id = vuoto(d.responsabileId) ? null : Number(d.responsabileId);
      if (v.responsabile_id !== null && !this.db.riga('SELECT id FROM utenti WHERE id = ?', v.responsabile_id)) {
        throw new Rifiuto('Responsabile ' + d.responsabileId + ' non trovato');
      }
    }
    if (d.importoContratto !== undefined && this.vedeCosti()) v.importo_contratto = numeroOVuoto(d.importoContratto);
    if (d.modoFatturazione !== undefined) {
      const m = testo(d.modoFatturazione).toLowerCase();
      if (MODI_FATTURAZIONE.indexOf(m) < 0) throw new Rifiuto('Come si fattura: ore, corpo o misto');
      v.modo_fatturazione = m;
    }
    return v;
  },

  /** I collaboratori della commessa: si riscrive l'elenco intero. */
  scriviPersone(idCommessa, persone) {
    const id = this.db.riga('SELECT id FROM commesse WHERE id = ?', idCommessa).id;
    const nuove = Array.from(new Set(persone.map(Number).filter(n => n > 0))).sort((a, b) => a - b);
    for (const u of nuove) {
      if (!this.db.riga('SELECT id FROM utenti WHERE id = ?', u)) throw new Rifiuto('Persona ' + u + ' non trovata');
    }
    const prima = this.db.righe('SELECT utente_id FROM commessa_persone WHERE commessa_id = ? ORDER BY utente_id', id).map(r => r.utente_id);
    if (JSON.stringify(prima) === JSON.stringify(nuove)) return;
    this.db.esegui('DELETE FROM commessa_persone WHERE commessa_id = ?', id);
    for (const u of nuove) this.db.esegui('INSERT INTO commessa_persone (commessa_id, utente_id) VALUES (?, ?)', id, u);
    this.annota('commessa_persone', id, { persone: prima }, { persone: nuove });
  },

  /**
   * Cambia i campi di una commessa, stato compreso: APERTA, SOSPESA o CHIUSA.
   * Una commessa chiusa non si propone piu' nei rapportini nuovi, ma resta.
   */
  aggiornaCommessa(id, campi) {
    const codice = testo(id).toUpperCase();
    if (!codice) throw new Rifiuto('Serve il codice della commessa');
    const riga = this.db.riga('SELECT * FROM commesse WHERE id = ?', codice);
    if (!riga) throw new Rifiuto('Commessa ' + codice + ' non trovata');
    const valori = {};
    if (campi.stato !== undefined) {
      const nuovo = testo(campi.stato).toUpperCase();
      if (['APERTA', 'SOSPESA', 'CHIUSA'].indexOf(nuovo) < 0) throw new Rifiuto('Stato non valido: ' + nuovo);
      valori.stato = nuovo;
    }
    if (campi.descrizione !== undefined) valori.descrizione = testo(campi.descrizione);
    if (campi.indirizzo !== undefined) valori.indirizzo = testo(campi.indirizzo);
    if (campi.note !== undefined) valori.note = testo(campi.note);
    if (campi.idCliente !== undefined) valori.cliente_id = testo(campi.idCliente);
    const numeri = { budgetOre: 'budget_ore', budgetEuro: 'budget_euro', euroKm: 'euro_km', prezzoOrario: 'prezzo_orario', costoOrario: 'costo_orario' };
    for (const k of Object.keys(numeri)) if (campi[k] !== undefined) valori[numeri[k]] = numeroOVuoto(campi[k]);
    if (campi.inizio !== undefined) valori.inizio = campi.inizio ? dataDaIso(campi.inizio) : '';
    if (campi.finePrevista !== undefined) valori.fine_prevista = campi.finePrevista ? dataDaIso(campi.finePrevista) : '';
    Object.assign(valori, this.campiNuoviCommessa(campi));
    const precedente = testo(riga.stato).toUpperCase();
    valori.modificato = adesso();
    this.aggiorna('commesse', riga.id, valori);
    if (Array.isArray(campi.persone)) this.scriviPersone(riga.id, campi.persone);
    const dopo = this.commessa(riga.id);
    return Object.assign({ precedente: precedente, cambiato: precedente !== dopo.stato }, dopo);
  },

  archiviaCommessa(id, archiviata) {
    const r = this.db.riga('SELECT id FROM commesse WHERE id = ?', testo(id));
    if (!r) throw new Rifiuto('Commessa ' + id + ' non trovata');
    this.aggiorna('commesse', r.id, { archiviata: archiviata ? 1 : 0, modificato: adesso() });
    return this.commessa(r.id);
  },

  /**
   * cambiaCodiceCommessa {id, nuovoCodice} (06/11/2026): il codice di una commessa dopo che e' nata. Il codice e' la
   * chiave della commessa e sta in tante tabelle: tutto in una transazione, e dopo ogni collegamento (rapportini, ore,
   * spese, progetti, fatture anche emesse, documenti...) porta al codice nuovo. Il codice nuovo si scrive com'e'
   * (anche solo le maiuscole cambiate: 26st001 -> 26ST001). Il vecchio va in codice_precedente, cosi' le code dei
   * telefoni che lo mandano ancora trovano la commessa (un secondo cambio lo sostituisce: il primo non vale piu').
   * Non si riscrive cio' che e' gia' uscito (XML, PDF, email, testi delle fatture emesse o passate al programma, il
   * registro); nelle bozze delle fatture il codice si cambia dove compare da solo. I codici dei progetti restano.
   */
  cambiaCodiceCommessa(d) {
    d = d || {};
    const id = testo(d.id);
    if (!id) throw new Rifiuto('Serve il codice della commessa');
    const riga = this.db.riga('SELECT rowid AS _riga, * FROM commesse WHERE id = ?', this.codiceCommessaVero(id));
    if (!riga) throw new Rifiuto('Commessa ' + id + ' non trovata');
    const nuovo = testo(d.nuovoCodice);
    if (!nuovo) throw new Rifiuto('Scrivi il nuovo codice');
    if (!CODICE_COMMESSA.test(nuovo)) throw new Rifiuto('Il codice può avere lettere, numeri, - _ / e punto, al massimo 20 caratteri');
    const vecchio = riga.id;
    const risposta = () => {
      const m = this.commessa(nuovo);
      return { ok: true, commessa: Object.assign({ precedente: m.stato, cambiato: false }, m), vecchio };
    };
    if (nuovo === vecchio) return risposta();
    if (this.db.riga('SELECT id FROM commesse WHERE id = ? AND rowid <> ?', nuovo, riga._riga)) {
      throw new Rifiuto('Il codice ' + nuovo + ' è già di un\'altra commessa');
    }
    // Solo le maiuscole: e' lo stesso codice (le commesse non guardano le maiuscole), il codice di prima resta quello che era.
    const stesso = nuovo.toUpperCase() === vecchio.toUpperCase();
    const precedente = stesso ? testo(riga.codice_precedente) : vecchio;
    return this.db.transazione(() => {
      // I collegamenti veri (commessa_persone, prestazioni, progetti) si controllano alla fine della transazione: prima
      // cambia la commessa, poi chi la guarda.
      this.db.db.exec('PRAGMA defer_foreign_keys = ON');
      const ora = adesso();
      this.db.esegui('UPDATE commesse SET id = ?, codice_precedente = ?, modificato = ? WHERE rowid = ?', nuovo, precedente, ora, riga._riga);
      const contati = {};
      const conta = (nome, n) => { if (n > 0) contati[nome] = (contati[nome] || 0) + n; };
      // Ogni colonna commessa_id / id_commessa di ogni tabella (anche quelle che verranno), e le copie del codice.
      const colonne = [];
      for (const t of this.db.righe("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
        if (t.name === 'commesse') continue;
        for (const c of this.db.righe('PRAGMA table_info("' + t.name + '")')) {
          if (c.name === 'commessa_id' || c.name === 'id_commessa') colonne.push([t.name, c.name]);
        }
      }
      const cambia = (t, c) => Number(this.db.esegui('UPDATE ' + t + ' SET ' + c + ' = ? WHERE ' + c + ' = ? COLLATE NOCASE', nuovo, vecchio).changes) || 0;
      for (const [t, c] of colonne) conta(t, cambia(t, c));
      for (const [t, c] of ALTRE_COLONNE_CODICE) cambia(t, c);
      // La cartella principale nata dalla cartella della commessa (migrazione 005): il titolo e' solo il codice.
      this.db.esegui('UPDATE documenti SET titolo = ? WHERE titolo = ? COLLATE NOCASE', 'Cartella della commessa ' + nuovo, 'Cartella della commessa ' + vecchio);
      // Le serie delle attivita': le occorrenze che verranno copiano la commessa dal modello.
      conta('ricorrenze', Number(this.db.esegui("UPDATE ricorrenze SET modello = json_set(modello, '$.commessa_id', ?) " +
        "WHERE json_valid(modello) AND UPPER(json_extract(modello, '$.commessa_id')) = UPPER(?)", nuovo, vecchio).changes) || 0);
      // I gruppi delle righe delle fatture ("ore:26ST001:2026-10:42"): legano righe e sorgenti, non escono dalla fattura.
      for (const t of ['fattura_righe', 'fattura_sorgenti']) {
        for (const pre of ['ore:', 'commessa:']) {
          const vecchioPre = pre + vecchio;
          this.db.esegui('UPDATE ' + t + ' SET gruppo = ? || substr(gruppo, ?) WHERE UPPER(substr(gruppo, 1, ?)) = UPPER(?) AND (length(gruppo) = ? OR substr(gruppo, ?, 1) = \':\')',
            pre + nuovo, vecchioPre.length + 1, vecchioPre.length, vecchioPre, vecchioPre.length, vecchioPre.length + 1);
        }
      }
      // Le bozze delle fatture (non ancora uscite): il codice nella causale e nelle righe, dove compare da solo.
      let bozze = 0;
      for (const f of this.db.righe("SELECT id, causale FROM fatture WHERE stato = 'bozza'")) {
        let cambiata = false;
        const causale = cambiaCodiceNelTesto(f.causale, vecchio, nuovo);
        if (causale !== (f.causale || '')) { this.db.esegui('UPDATE fatture SET causale = ? WHERE id = ?', causale, f.id); cambiata = true; }
        for (const r of this.db.righe("SELECT id, descrizione FROM fattura_righe WHERE fattura_id = ? AND origine = 'bozza'", f.id)) {
          const descrizione = cambiaCodiceNelTesto(r.descrizione, vecchio, nuovo);
          if (descrizione !== (r.descrizione || '')) { this.db.esegui('UPDATE fattura_righe SET descrizione = ? WHERE id = ?', descrizione, r.id); cambiata = true; }
        }
        if (cambiata) bozze++;
      }
      // Le voci "manca il budget" nascoste per 30 giorni nella Dashboard ("voce:commessa:pianificare:26ST001: manca ...").
      const voce = 'voce:commessa:pianificare:' + vecchio + ':';
      this.db.esegui("UPDATE OR REPLACE dashboard_nascoste SET oggetto = ? || substr(oggetto, ?) WHERE tipo = 'commessa' AND UPPER(substr(oggetto, 1, ?)) = UPPER(?)",
        'voce:commessa:pianificare:' + nuovo + ':', voce.length + 1, voce.length, voce);
      // Le notifiche che portano alla commessa (o a un elenco filtrato per commessa).
      this.db.esegui("UPDATE notifiche SET collegamento = json_set(collegamento, '$.id', ?) WHERE json_valid(collegamento) AND " +
        "json_extract(collegamento, '$.pagina') = 'commessa' AND UPPER(json_extract(collegamento, '$.id')) = UPPER(?)", nuovo, vecchio);
      this.db.esegui("UPDATE notifiche SET collegamento = json_set(collegamento, '$.filtro.idCommessa', ?) WHERE json_valid(collegamento) AND " +
        "UPPER(json_extract(collegamento, '$.filtro.idCommessa')) = UPPER(?)", nuovo, vecchio);
      // La numerazione: un codice dato non si propone piu' (ne' il vecchio ne' il nuovo, se hanno la forma dei codici).
      for (const c of [vecchio, nuovo]) {
        const n = this.numeroDi('commessa', c);
        if (n !== null) this.segnaNumero('commessa', n);
      }
      const seguono = Object.keys(contati).sort().map(t => (NOMI_COLLEGATI[t] || t.replace(/_/g, ' ')) + ' ' + contati[t])
        .concat(bozze ? ['testi delle bozze delle fatture ' + bozze] : []);
      this.annota('commesse', nuovo, { id: vecchio, codice_precedente: testo(riga.codice_precedente) }, { id: nuovo, codice_precedente: precedente },
        'codice cambiato da ' + vecchio + ' a ' + nuovo + (seguono.length ? '; seguono il codice nuovo: ' + seguono.join(', ') : ''));
      return risposta();
    });
  },

  /**
   * Una commessa nuova come un'altra: dati, prestazioni (avanzamento a zero) e
   * persone, col codice nuovo. "comeModello" ne fa un modello, che non compare
   * negli elenchi normali e da cui si partira' per le commesse simili.
   */
  duplicaCommessa(d) {
    const fonte = this.db.riga('SELECT * FROM commesse WHERE id = ?', testo(d.id));
    if (!fonte) throw new Rifiuto('Commessa ' + d.id + ' non trovata');
    const comeModello = d.comeModello === true;
    const id = this.prossimoCodiceCommessa().codice;
    const ora = adesso();
    // Da un modello la commessa nasce col nome del modello; da una commessa normale, "(copia)".
    const descrizione = comeModello || fonte.modello === 1 ? fonte.descrizione : fonte.descrizione + ' (copia)';
    this.inserisci('commesse', {
      id,
      cliente_id: testo(d.idCliente) || fonte.cliente_id,
      descrizione,
      stato: 'APERTA',
      indirizzo: fonte.indirizzo,
      budget_ore: fonte.budget_ore,
      budget_euro: fonte.budget_euro,
      prezzo_orario: fonte.prezzo_orario,
      costo_orario: fonte.costo_orario,
      euro_km: fonte.euro_km,
      inizio: oggi(),
      fine_prevista: '',
      note: fonte.note,
      sede_id: testo(d.idCliente) && testo(d.idCliente) !== fonte.cliente_id ? null : fonte.sede_id,
      responsabile_id: fonte.responsabile_id,
      importo_contratto: fonte.importo_contratto,
      modello: comeModello ? 1 : 0,
      creato: ora,
      modificato: ora,
    });
    this.segnaNumero('commessa', this.numeroDi('commessa', id) || 0);
    for (const p of this.db.righe('SELECT * FROM prestazioni WHERE commessa_id = ? ORDER BY ordine, id', fonte.id)) {
      this.inserisci('prestazioni', {
        commessa_id: id, nome: p.nome, descrizione: p.descrizione, valore: p.valore, avanzamento: 0,
        stato: 'da_fare', ordine: p.ordine,
      });
    }
    const persone = this.db.righe('SELECT utente_id FROM commessa_persone WHERE commessa_id = ?', fonte.id).map(r => r.utente_id);
    if (persone.length) this.scriviPersone(id, persone);
    return this.commessa(id);
  },

  // ------------------------------------------------------------------ prestazioni

  /**
   * Una fase della commessa (sopralluogo, progetto esecutivo, direzione
   * lavori) col suo valore e l'avanzamento. Lo stato segue l'avanzamento se non
   * lo si dice: 0 da fare, 1-99 in corso, 100 fatta.
   */
  salvaPrestazione(x) {
    x = x || {};
    const v = {};
    if (x.nome !== undefined) v.nome = testo(x.nome);
    if (x.descrizione !== undefined) v.descrizione = testo(x.descrizione);
    if (x.valore !== undefined && this.vedeCosti()) v.valore = numeroOVuoto(x.valore);
    if (x.avanzamento !== undefined) {
      const a = Math.round(numero(x.avanzamento));
      if (a < 0 || a > 100) throw new Rifiuto('Avanzamento: da 0 a 100');
      v.avanzamento = a;
    }
    if (x.stato !== undefined && x.stato !== null && x.stato !== '') {
      v.stato = testo(x.stato).toLowerCase();
      if (['da_fare', 'in_corso', 'fatta'].indexOf(v.stato) < 0) throw new Rifiuto('Stato non valido: ' + x.stato + ' (da_fare, in_corso, fatta)');
    } else if (v.avanzamento !== undefined) {
      v.stato = v.avanzamento === 0 ? 'da_fare' : v.avanzamento === 100 ? 'fatta' : 'in_corso';
    }
    if (v.stato === 'fatta' && v.avanzamento === undefined) v.avanzamento = 100;
    if (x.ordine !== undefined) v.ordine = Math.round(numero(x.ordine));
    if (x.id) {
      const prima = this.db.riga('SELECT * FROM prestazioni WHERE id = ?', Number(x.id));
      if (!prima) throw new Rifiuto('Prestazione ' + x.id + ' non trovata');
      if (v.nome !== undefined && !v.nome) throw new Rifiuto('Nome: scrivi il nome della prestazione');
      this.aggiorna('prestazioni', prima.id, v);
      return prestazioneDaRiga(this.db.riga('SELECT * FROM prestazioni WHERE id = ?', prima.id));
    }
    const commessa = this.db.riga('SELECT id FROM commesse WHERE id = ?', testo(x.idCommessa || x.commessaId));
    if (!commessa) throw new Rifiuto('Commessa ' + testo(x.idCommessa || x.commessaId) + ' non trovata');
    if (!v.nome) throw new Rifiuto('Nome: scrivi il nome della prestazione');
    if (v.ordine === undefined) v.ordine = (this.db.riga('SELECT MAX(ordine) m FROM prestazioni WHERE commessa_id = ?', commessa.id).m || 0) + 1;
    const id = this.inserisci('prestazioni', Object.assign({ commessa_id: commessa.id, avanzamento: 0, stato: 'da_fare' }, v));
    return prestazioneDaRiga(this.db.riga('SELECT * FROM prestazioni WHERE id = ?', id));
  },

  togliPrestazione(id) {
    const r = this.db.riga('SELECT * FROM prestazioni WHERE id = ?', Number(id));
    if (!r) throw new Rifiuto('Prestazione ' + id + ' non trovata');
    this.db.esegui('DELETE FROM prestazioni WHERE id = ?', r.id);
    this.annota('prestazioni', r.id, Object.assign({}, r), null, 'tolta');
  },

  /** Le prestazioni nell'ordine dato (l'elenco degli id, dal primo all'ultimo). */
  ordinaPrestazioni(idCommessa, ids) {
    const commessa = this.db.riga('SELECT id FROM commesse WHERE id = ?', testo(idCommessa));
    if (!commessa) throw new Rifiuto('Commessa ' + idCommessa + ' non trovata');
    const sue = this.db.righe('SELECT id FROM prestazioni WHERE commessa_id = ?', commessa.id).map(r => r.id);
    (ids || []).map(Number).forEach((id, i) => {
      if (sue.indexOf(id) < 0) throw new Rifiuto('La prestazione ' + id + ' non è di questa commessa');
      this.aggiorna('prestazioni', id, { ordine: i + 1 });
    });
    return this.leggiPrestazioni(commessa.id);
  },

  /**
   * Un rapportino che porta un cliente o una commessa nuovi li crea (come in
   * Code.gs), ma solo se chi scrive potrebbe crearli anche a mano.
   */
  serveCrearePerRapportino(cliente, commessa, r) {
    if (!cliente && this.livello('clienti') < 2) throw senzaPermesso('creare clienti: scegli un cliente dall\'elenco');
    if (!commessa && testo(r.commessa) && this.livello('commesse') < 2) throw senzaPermesso('creare commesse: scegli una commessa dall\'elenco');
  },
};

// Gli aiuti servono anche fuori (importazione): non enumerabili, cosi' non diventano metodi del server.
Object.defineProperties(module.exports, {
  chiavePartitaIva: { value: chiavePartitaIva },
  soggettoDaRiga: { value: soggettoDaRiga },
  commessaDaRiga: { value: commessaDaRiga },
  controllaCampiSoggetto: { value: controllaCampiSoggetto },
});
