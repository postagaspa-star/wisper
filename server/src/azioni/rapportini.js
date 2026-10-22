/*
 * I rapportini: salvaRapportino, la lettura, gli stati. Le regole sono quelle
 * di Code.gs, riga per riga (idLocale che non crea doppioni, stati bloccati,
 * prima i controlli e poi le creazioni, tariffe congelate nella riga, tariffa
 * libera ricordata, prezzo della commessa dal primo rapportino, numero
 * RAP/aaaa/nnnn per anno della data).
 *
 * In piu' della fase 1: ogni rapportino sa chi l'ha scritto (utente_id), un
 * collaboratore vede e scrive solo i suoi, e un annullato si ripristina com'era.
 *
 * Fase 3: le spese del passo 3 sono righe di spese legate al rapportino (la
 * colonna "spese" resta il totale di quelle al cliente: sincronizzaSpeseRapportino
 * in spese.js), e un rapportino di chi deve farlo approvare non si manda al
 * cliente e non si fattura finche' non e' approvato.
 */
'use strict';

const {
  Rifiuto, senzaPermesso, testo, numero, numeroONull, siNoONull, normalizza, adesso, dataIso, dataDaIso,
  dataOraIso, oggi,
} = require('../utili');
const { ELETTRODINAMICA, STATI, STATI_BLOCCATI, regoleDi, calcola, tariffaProposta } = require('../conti');
const { diverso } = require('./ore');

const urlFile = id => '/file/' + id;

module.exports = {
  /** Il prossimo numero dell'anno della data (non di quando arriva): RAP/2026/0001, RAP/2026/0002... */
  prossimoNumeroRapportino(anno) {
    const codici = this.db.righe('SELECT id FROM rapportini').map(r => r.id);
    return this.prossimoNumero('rapportino', codici, anno);
  },

  /** Per idLocale se c'e', altrimenti per numero: come trovaRiga() di Code.gs. */
  trovaRiga(id, idLocale) {
    if (testo(idLocale)) {
      const perLocale = this.db.riga('SELECT * FROM rapportini WHERE id_locale = ?', testo(idLocale));
      if (perLocale) return perLocale;
    }
    if (testo(id)) return this.db.riga('SELECT * FROM rapportini WHERE id = ?', testo(id));
    return null;
  },

  /** Un collaboratore tocca solo i suoi. */
  controllaSuo(riga, cosa) {
    if (!this.soloSuoi()) return;
    const c = this.chi();
    if (riga.utente_id !== c.utente.id) throw senzaPermesso(cosa || 'toccare i rapportini degli altri');
  },

  /**
   * Crea o aggiorna un rapportino.
   *
   * Il telefono manda sempre lo stesso idLocale per lo stesso rapportino: alla
   * prima volta si crea la riga, dalla seconda la si aggiorna. Cosi' un invio
   * ripetuto perche' la risposta si era persa per strada non scrive una seconda
   * riga, e riaprire un rapportino per correggerlo e' la stessa operazione.
   *
   * Se il cliente o la commessa non esistono ancora (creati sul telefono senza
   * campo) si creano qui, prima della riga.
   */
  salvaRapportino(r) {
    if (!r.idLocale && !r.id) throw new Rifiuto('Manca l\'identificativo del rapportino');
    const esistente = this.trovaRiga(r.id, r.idLocale);
    if (esistente) this.controllaSuo(esistente, 'modificare i rapportini degli altri');
    // Fase 4: un rapportino in una bozza o in una fattura non si tocca (prima la frase che dice dove sta).
    if (esistente) this.controllaSorgenteLibera('rapportino', esistente.id);

    if (esistente && STATI_BLOCCATI.indexOf(testo(esistente.stato).toUpperCase()) >= 0) {
      throw new Rifiuto('Il rapportino ' + esistente.id + ' e\' gia\' firmato: riportalo in bozza per modificarlo');
    }

    const clienti = this.leggiClienti({ archiviati: true });
    let cliente = this.trovaCliente(clienti, testo(r.idCliente), testo(r.cliente));
    if (!cliente && !testo(r.cliente)) throw new Rifiuto('Manca il cliente');
    // Un cliente nuovo "del gruppo Elettrodinamica" (un telefono rimasto alla 0.3.3)
    // e' Elettrodinamica: si fattura a lei.
    if (!cliente && normalizza(r.gruppo) === normalizza(ELETTRODINAMICA.nome)) {
      cliente = this.trovaCliente(clienti, '', ELETTRODINAMICA.nome);
    }

    // Prima i controlli, poi le creazioni: un rapportino rifiutato non deve
    // lasciare un cliente o una commessa nati per lui. (In piu', tutto sta in
    // una transazione: se qualcosa va storto dopo, non resta niente a meta'.)
    const impostazioni = this.leggiImpostazioni();
    const commesse = this.leggiCommesse({ archiviati: true, modelli: true });
    const codiceScelto = testo(r.idCommessa).toUpperCase();
    let commessa = !codiceScelto ? null : commesse.filter(m =>
      // Anche col codice di prima dei 26ST: un rapportino rimasto in coda su un telefono.
      m.id.toUpperCase() === codiceScelto || m.codicePrecedente.toUpperCase() === codiceScelto)[0] || null;
    this.serveCrearePerRapportino(cliente, commessa, r);

    let regole = regoleDi(cliente, this.leggiGruppi(), impostazioni, commessa);

    // Chi non vede i prezzi (un collaboratore) non decide la tariffa: resta
    // quella gia' scritta, o si prende quella che il computer proporrebbe.
    if (!this.vedeCosti() && regole.tariffaFissa === null) {
      const stessa = esistente && cliente && esistente.id_cliente === cliente.id &&
        testo(esistente.id_commessa).toUpperCase() === (commessa ? commessa.id.toUpperCase() : '');
      const t = stessa && numero(esistente.tariffa) > 0 ? numero(esistente.tariffa)
        : tariffaProposta(cliente, this.tariffeDelCliente(cliente), commessa);
      r = Object.assign({}, r, { tariffa: t });
      if (!(numero(t) > 0)) {
        throw new Rifiuto('Manca la tariffa oraria per ' + (cliente ? cliente.nome : testo(r.cliente)) +
          ': chiedi al titolare di scriverla nella commessa o nel cliente');
      }
    }
    if (regole.tariffaFissa === null && !(numero(r.tariffa) > 0)) {
      throw new Rifiuto('Manca la tariffa oraria per ' + (cliente ? cliente.nome : testo(r.cliente)));
    }
    const data = r.data ? dataDaIso(r.data) : oggi();

    // Fase 5: il ticket di cui e' il rapportino (idTicket o idLocaleTicket): stesso cliente, non chiuso, visibile.
    // Senza, resta quello che aveva (si toglie solo con legaRapportino).
    let ticketRiga = this.ticketPerRapportino(r, cliente ? cliente.id : '');
    if (!ticketRiga && esistente && esistente.ticket_id) {
      ticketRiga = this.db.riga('SELECT * FROM ticket WHERE id = ?', esistente.ticket_id);
      if (ticketRiga && cliente && ticketRiga.cliente_id !== cliente.id) this.controllaTicketPerRapportino(ticketRiga, cliente.id);
    }
    if (ticketRiga && esistente && esistente.ticket_id && esistente.ticket_id !== ticketRiga.id) {
      const vecchio = this.db.riga('SELECT numero FROM ticket WHERE id = ?', esistente.ticket_id);
      throw new Rifiuto('Il rapportino ' + esistente.id + ' è già del ticket ' + (vecchio ? vecchio.numero : esistente.ticket_id) + ': toglilo prima da lì');
    }
    if (ticketRiga && !cliente) {
      const nome = (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', ticketRiga.cliente_id) || {}).nome || ticketRiga.cliente_id;
      throw new Rifiuto('Il ticket è di ' + nome + ', il rapportino di ' + testo(r.cliente));
    }

    if (!cliente) cliente = this.creaCliente({ nome: r.cliente });

    // Una commessa nata sul telefono arriva con la descrizione e il codice che il
    // telefono le ha dato (codiceProposto): si usa quello, se e' ancora libero.
    if (!commessa && testo(r.commessa)) {
      commessa = this.creaCommessa({ idCliente: cliente.id, descrizione: r.commessa, id: testo(r.codiceProposto), idProposto: true });
      regole = regoleDi(cliente, this.leggiGruppi(), impostazioni, commessa);
    }

    // Le tariffe di un rapportino gia' scritto non cambiano se cambiano le
    // impostazioni: aggiornare l'ACI a gennaio non deve riscrivere luglio.
    // Si ricalcola con le regole di oggi solo se sono cambiati il cliente o la commessa.
    const stessaCommessa = testo(esistente && esistente.id_commessa).toUpperCase() === (commessa ? commessa.id.toUpperCase() : '');
    if (esistente && testo(esistente.id_cliente) === cliente.id && stessaCommessa && esistente.euro_km !== null) {
      regole.euroKm = numero(esistente.euro_km);
      regole.maggExtra = numero(esistente.magg_extra);
      regole.pagaViaggio = siNoONull(esistente.paga_viaggio) === true;
      regole.kmRimborsati = siNoONull(esistente.km_rimborsati) !== false;
      regole.costoOrario = numeroONull(esistente.costo_orario);
      if (regole.tariffaFissa !== null) regole.tariffaFissa = numero(esistente.tariffa);
    }

    const conto = calcola(r, regole);
    const ora = adesso();
    const c = this.chi();
    // Un collaboratore scrive solo per se': il suo nome, non quello dello studio.
    const tecnico = this.soloSuoi() ? c.utente.nome : (testo(r.tecnico) || testo(impostazioni.TECNICO));
    const valori = {
      id_locale: testo(r.idLocale) || (esistente ? esistente.id_locale : null) || null,
      data: data,
      tecnico: tecnico,
      id_cliente: cliente.id,
      cliente: cliente.nome,
      gruppo: regole.gruppo,
      id_commessa: commessa ? commessa.id : '',
      // Nella colonna COMMESSA il codice: e' quello che si cerca.
      commessa: commessa ? commessa.id : '',
      // Fase 5: col ticket e il campo vuoto, il server ci scrive il numero ("TK/2026/0014 · rif. 4471").
      ticket: testo(r.ticket) || (ticketRiga ? (esistente && testo(esistente.ticket) ? testo(esistente.ticket) : this.testoTicketRapportino(ticketRiga)) : ''),
      luogo: testo(r.luogo),
      descrizione: testo(r.descrizione),
      ore_lavoro: numero(r.oreLavoro),
      ore_extra: numero(r.oreExtra),
      ore_viaggio: numero(r.oreViaggio),
      ore_totali: conto.oreTotali,
      km: numero(r.km),
      spese: numero(r.spese),
      note_spese: testo(r.noteSpese),
      tariffa: conto.tariffa,
      paga_viaggio: regole.pagaViaggio ? 1 : 0,
      km_rimborsati: regole.kmRimborsati ? 1 : 0,
      euro_km: numero(regole.euroKm),
      magg_extra: numero(regole.maggExtra),
      compenso_ore: conto.compensoOre,
      rimborso_km: conto.rimborsoKm,
      totale: conto.totale,
      costo_orario: regole.costoOrario === null || regole.costoOrario === undefined ? null : numero(regole.costoOrario),
      note_interne: testo(r.noteInterne),
      ticket_id: ticketRiga ? ticketRiga.id : null,
      modificato: ora,
    };

    // Fase 3: chi deve far approvare le sue cose manda il rapportino in approvazione (a ogni cambio vero).
    const cambiato = !esistente || Object.keys(valori).some(k => k !== 'modificato' && diverso(esistente[k], valori[k]));
    const noteCambiate = !esistente || diverso(esistente.note_spese, valori.note_spese);
    let id;
    if (esistente) {
      id = esistente.id;
      this.aggiorna('rapportini', id, Object.assign(valori, this.approvazioneRapportinoDopo(esistente, esistente.utente_id, cambiato)));
    } else {
      const numeroNuovo = this.prossimoNumeroRapportino(Number(data.slice(0, 4)));
      id = numeroNuovo.codice;
      const autore = c.utente ? c.utente.id : null;
      this.inserisci('rapportini', Object.assign({ id, stato: 'BOZZA', creato: ora, utente_id: autore }, valori,
        this.serveApprovazione(autore) ? { stato_approvazione: 'da_approvare' } : {}));
      this.segnaNumero('rapportino', numeroNuovo.numero);
    }
    // Le spese del passo 3 diventano (o restano) righe di spese al cliente che sommano alla colonna.
    this.sincronizzaSpeseRapportino(id, { noteCambiate });
    // Fase 5: un rapportino nuovo (o appena legato) porta il ticket in carico e ne rifa' i tempi.
    if (ticketRiga) this.dopoRapportinoDelTicket(ticketRiga.id, this.db.riga('SELECT * FROM rapportini WHERE id = ?', id), !esistente || esistente.ticket_id !== ticketRiga.id);

    // La tariffa libera si ricorda: al prossimo rapportino per questo cliente
    // il telefono la propone gia' scritta.
    if (regole.tariffaFissa === null && conto.tariffa > 0 && cliente.ultimaTariffa !== conto.tariffa) {
      this.aggiornaCliente(cliente.id, { ultimaTariffa: conto.tariffa });
    }
    // Una commessa senza prezzo prende quello del suo primo rapportino, scritto dal
    // telefono o dal computer: dal secondo in poi si propone quello.
    if (regole.tariffaFissa === null && conto.tariffa > 0 && commessa && commessa.prezzoOrario === null) {
      this.aggiornaCommessa(commessa.id, { prezzoOrario: conto.tariffa });
    }

    return this.rapportinoPerId(id);
  },

  /**
   * L'approvazione dopo un cambio: se lo cambia chi l'ha scritto, e per lui
   * serve l'approvazione, torna da approvare (anche un respinto rimandato cosi'
   * com'e'). Se lo cambia chi approva, resta com'era.
   */
  approvazioneRapportinoDopo(r, autore, cambiato) {
    const io = this.chi().utente ? this.chi().utente.id : null;
    if (autore === null || autore === undefined || autore !== io || !this.serveApprovazione(autore)) return {};
    if (r.stato_approvazione === 'da_approvare' || (!cambiato && r.stato_approvazione !== 'respinto')) return {};
    return { stato_approvazione: 'da_approvare', approvato_da: null, approvato_il: '', motivo: '' };
  },

  /** Un rapportino che aspetta l'approvazione (o respinto) non si manda al cliente e non si fattura. */
  controllaApprovato(riga) {
    const s = riga.stato_approvazione || '';
    if (s === 'da_approvare') {
      throw new Rifiuto('Il rapportino ' + riga.id + ' aspetta l\'approvazione: si manda al cliente e si fattura solo dopo');
    }
    if (s === 'respinto') {
      throw new Rifiuto('Il rapportino ' + riga.id + ' è stato respinto' + (testo(riga.motivo) ? ' (' + testo(riga.motivo) + ')' : '') +
        ': correggilo e rimandalo in approvazione');
    }
  },

  /** Le tariffe gia' usate per un cliente (per proporle a chi non vede i prezzi). */
  tariffeDelCliente(cliente) {
    if (!cliente) return [];
    return this.db.righe('SELECT id_cliente, tariffa, data FROM rapportini WHERE id_cliente = ? AND tariffa > 0', cliente.id)
      .map(x => ({ idCliente: x.id_cliente, tariffa: x.tariffa, data: x.data || '' }));
  },

  rapportinoPerId(id) {
    const r = this.db.riga('SELECT * FROM rapportini WHERE id = ?', id);
    return r ? this.rapportinoDaRiga(r) : null;
  },

  /** Le foto di ogni rapportino (i file "spesa" non cestinati, in ordine di arrivo) e le descrizioni delle commesse. */
  aiutiRapportini(id) {
    const foto = {};
    const righe = id
      ? this.db.righe("SELECT id, rapportino_id FROM file WHERE tipo = 'spesa' AND cestinato IS NULL AND rapportino_id = ? ORDER BY creato, rowid", id)
      : this.db.righe("SELECT id, rapportino_id FROM file WHERE tipo = 'spesa' AND cestinato IS NULL AND rapportino_id IS NOT NULL ORDER BY creato, rowid");
    for (const f of righe) (foto[f.rapportino_id] = foto[f.rapportino_id] || []).push({ id: f.id, url: urlFile(f.id) });
    const descrizioni = {};
    for (const m of this.db.righe('SELECT id, descrizione FROM commesse')) descrizioni[m.id.toUpperCase()] = m.descrizione;
    // Fase 3: le righe di spese del rapportino (anche quelle spostate allo studio o "Mia").
    const spese = {};
    const righeSpese = id
      ? this.db.righe('SELECT * FROM spese WHERE rapportino_id = ? AND tolta IS NULL ORDER BY id', id)
      : this.db.righe('SELECT * FROM spese WHERE rapportino_id IS NOT NULL AND tolta IS NULL ORDER BY id');
    if (righeSpese.length) {
      const a = this.aiutiSpese(righeSpese);
      for (const s of righeSpese) (spese[s.rapportino_id] = spese[s.rapportino_id] || []).push(this.spesaDaRiga(s, a));
    }
    // Fase 4: la fattura in cui sta il rapportino ("In bozza W-15", "Fattura 45/2026"), solo per chi vede le fatture.
    let fatture = null;
    if (this.livello('fatturazione') > 0 && this.vedeCosti()) {
      fatture = {};
      const righeF = id
        ? this.db.righe("SELECT s.sorgente_id, f.id, f.stato, f.riferimento, f.numero, f.tipo FROM fattura_sorgenti s JOIN fatture f ON f.id = s.fattura_id WHERE s.attiva = 1 AND s.tipo = 'rapportino' AND s.sorgente_id = ?", id)
        : this.db.righe("SELECT s.sorgente_id, f.id, f.stato, f.riferimento, f.numero, f.tipo FROM fattura_sorgenti s JOIN fatture f ON f.id = s.fattura_id WHERE s.attiva = 1 AND s.tipo = 'rapportino'");
      for (const f of righeF) {
        fatture[f.sorgente_id] = { id: f.id, riferimento: f.riferimento, stato: f.stato, etichetta: f.stato === 'bozza' || f.stato === 'pronta' ? 'In bozza ' + f.riferimento : 'Fattura ' + (f.numero || f.riferimento) };
      }
    }
    // Fase 5: il ticket di ogni rapportino (numero, stato, come si fattura).
    const ticket = {};
    for (const t of this.db.righe('SELECT t.id, t.numero, t.stato, t.fatturazione, c.numero contratto FROM ticket t LEFT JOIN contratti c ON c.id = t.contratto_id')) ticket[t.id] = t;
    return { foto, descrizioni, spese, fatture, ticket };
  },

  /** La riga come la mandava rapportinoDaRiga() dello script, piu' chi l'ha scritto. */
  rapportinoDaRiga(r, aiuti) {
    aiuti = aiuti || this.aiutiRapportini(r.id);
    const descrizione = testo(r.id_commessa) ? aiuti.descrizioni[testo(r.id_commessa).toUpperCase()] || '' : '';
    const o = {
      id: testo(r.id),
      idLocale: testo(r.id_locale),
      data: dataIso(r.data),
      tecnico: testo(r.tecnico),
      idCliente: testo(r.id_cliente),
      cliente: testo(r.cliente),
      gruppo: testo(r.gruppo),
      idCommessa: testo(r.id_commessa),
      // Nella riga c'e' il codice; qui si manda la descrizione.
      commessa: descrizione || testo(r.commessa),
      ticket: testo(r.ticket),
      luogo: testo(r.luogo),
      descrizione: testo(r.descrizione),
      oreLavoro: numero(r.ore_lavoro),
      oreExtra: numero(r.ore_extra),
      oreViaggio: numero(r.ore_viaggio),
      oreTotali: numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio),
      km: numero(r.km),
      spese: numero(r.spese),
      noteSpese: testo(r.note_spese),
      foto: aiuti.foto[r.id] || [],
      tariffa: numero(r.tariffa),
      pagaViaggio: siNoONull(r.paga_viaggio) === true,
      kmRimborsati: siNoONull(r.km_rimborsati) !== false,
      euroKm: numero(r.euro_km),
      maggExtra: numero(r.magg_extra),
      compensoOre: numero(r.compenso_ore),
      rimborsoKm: numero(r.rimborso_km),
      totale: numero(r.totale),
      costoOrario: numeroONull(r.costo_orario),
      noteInterne: testo(r.note_interne),
      firma: testo(r.firma) ? { id: r.firma, url: urlFile(r.firma) } : null,
      firmatario: testo(r.firmatario),
      firmatoIl: dataOraIso(r.firmato_il),
      stato: testo(r.stato).toUpperCase() || 'BOZZA',
      inviatoIl: dataOraIso(r.inviato_il),
      fatturatoIl: dataOraIso(r.fatturato_il),
      creato: dataOraIso(r.creato),
      modificato: dataOraIso(r.modificato),
      // Fase 1
      idUtente: r.utente_id === null ? null : r.utente_id,
      statoPrima: testo(r.stato_prima),
      // Fase 3
      statoApprovazione: testo(r.stato_approvazione),
      approvatoDa: r.approvato_da === null || r.approvato_da === undefined ? null : r.approvato_da,
      approvatoIl: dataOraIso(r.approvato_il),
      motivoRifiuto: testo(r.motivo),
      righeSpese: (aiuti.spese || {})[r.id] || [],
    };
    // Fase 5: il ticket (idTicket interno, numeroTicket) e, chiuso nel contratto o senza fattura, perche' non si fattura.
    const tk = r.ticket_id !== null && r.ticket_id !== undefined ? ((aiuti.ticket || {})[r.ticket_id] || null) : null;
    o.idTicket = tk ? tk.id : null;
    o.numeroTicket = tk ? tk.numero : '';
    o.ticketAperto = !!tk && ['aperto', 'in_carico', 'in_attesa', 'risolto'].indexOf(tk.stato) >= 0;
    o.nonSiFattura = tk && tk.stato === 'chiuso' ? (tk.fatturazione === 'contratto' ? 'Nel contratto' + (tk.contratto ? ' ' + tk.contratto : '') : tk.fatturazione === 'no' ? 'Non si fattura' : '') : '';
    // Fase 4: {id, riferimento, stato, etichetta} o null; la chiave c'e' solo per chi vede le fatture.
    if (aiuti.fatture) o.fattura = aiuti.fatture[r.id] || null;
    return o;
  },

  /**
   * I rapportini fra due date (aaaa-mm-gg, comprese), i piu' recenti prima.
   * Gli annullati non si mandano, a meno di chiederli. Un collaboratore riceve
   * solo i suoi.
   */
  leggiRapportini(da, a, ancheAnnullati, filtro) {
    const f = filtro || {};
    const condizioni = [];
    const parametri = [];
    if (this.soloSuoi()) {
      condizioni.push('utente_id = ?');
      parametri.push(this.chi().utente.id);
    }
    if (!ancheAnnullati) condizioni.push("UPPER(stato) <> 'ANNULLATO'");
    // Come lo script: una riga senza data passa i filtri delle date.
    if (testo(da)) { condizioni.push("(data IS NULL OR data = '' OR data >= ?)"); parametri.push(testo(da)); }
    if (testo(a)) { condizioni.push("(data IS NULL OR data = '' OR data <= ?)"); parametri.push(testo(a)); }
    if (testo(f.idCliente)) { condizioni.push('id_cliente = ?'); parametri.push(testo(f.idCliente)); }
    if (testo(f.idCommessa)) { condizioni.push('id_commessa = ?'); parametri.push(testo(f.idCommessa)); }
    if (testo(f.idTicket)) { condizioni.push('ticket_id = ?'); parametri.push(this.idTicketDa(f.idTicket)); }
    if (testo(f.statoApprovazione)) { condizioni.push('stato_approvazione = ?'); parametri.push(testo(f.statoApprovazione) === 'nessuno' ? '' : testo(f.statoApprovazione)); }
    const sql = 'SELECT * FROM rapportini' + (condizioni.length ? ' WHERE ' + condizioni.join(' AND ') : '');
    const aiuti = this.aiutiRapportini();
    return this.db.righe(sql, ...parametri)
      .map(r => this.rapportinoDaRiga(r, aiuti))
      .sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : (x.creato < y.creato ? 1 : -1)));
  },

  /**
   * Cambia lo stato di uno o piu' rapportini (il riepilogo di luglio si segna
   * fatturato tutto insieme). Tornare in BOZZA toglie la firma: il cliente ha
   * firmato quello che c'era, e se il rapportino cambia quella firma non vale
   * piu'. Annullare ricorda lo stato di prima, per ripristinarlo.
   */
  cambiaStato(ids, stato) {
    const nuovo = testo(stato).toUpperCase();
    if (STATI.indexOf(nuovo) < 0) throw new Rifiuto('Stato non valido: ' + nuovo);
    if (nuovo === 'FIRMATO') throw new Rifiuto('Per firmare serve la firma: caricala dal rapportino');
    if (nuovo === 'FATTURATO' && this.livello('fatturazione') < 2) throw senzaPermesso('segnare i rapportini come fatturati');
    const ora = adesso();
    return (ids || []).map(id => {
      const riga = this.trovaRiga(id, id);
      if (!riga) throw new Rifiuto('Rapportino ' + id + ' non trovato');
      this.controllaSuo(riga, 'cambiare lo stato dei rapportini degli altri');
      if ((nuovo === 'INVIATO' || nuovo === 'FATTURATO') && testo(riga.stato).toUpperCase() !== nuovo) this.controllaApprovato(riga);
      // Fase 4: il rapportino in una bozza diventa fatturato da solo, quando torna l'XML; in una fattura non torna indietro.
      const inFattura = this.sorgenteAttiva('rapportino', riga.id);
      const nota = this.notaCambioStato(riga, nuovo, inFattura);
      const valori = { stato: nuovo, modificato: ora };
      if (nuovo === 'BOZZA') {
        valori.firma = '';
        valori.firmatario = '';
        valori.firmato_il = '';
        valori.inviato_il = '';
        valori.fatturato_il = '';
      }
      if (nuovo === 'INVIATO') {
        valori.inviato_il = ora;
        valori.fatturato_il = '';
      }
      if (nuovo === 'FATTURATO') valori.fatturato_il = ora;
      const attuale = testo(riga.stato).toUpperCase() || 'BOZZA';
      if (nuovo === 'ANNULLATO' && attuale !== 'ANNULLATO') valori.stato_prima = attuale;
      this.aggiorna('rapportini', riga.id, valori, 'id', nota);
      this.allineaSpeseRapportino(riga.id);
      if (riga.ticket_id && (nuovo === 'ANNULLATO' || attuale === 'ANNULLATO')) this.ricalcolaIntervento(riga.ticket_id);
      return this.rapportinoPerId(riga.id);
    });
  },

  /**
   * Fase 4 (§7.3): cosa si puo' fare allo stato di un rapportino che sta in una
   * fattura. In una bozza: niente (nemmeno FATTURATO a mano: lo diventa da solo
   * quando torna l'XML). In una fattura emessa: non torna indietro (serve una
   * nota di credito). Uno non legato a niente si segna fatturato a mano (quelli
   * fatturati fuori da Wisper), con la nota nel registro. Torna la nota o ''.
   */
  notaCambioStato(riga, nuovo, inFattura) {
    const attuale = testo(riga.stato).toUpperCase() || 'BOZZA';
    if (attuale === nuovo) return '';
    if (inFattura) {
      if (nuovo === 'FATTURATO' && ['bozza', 'pronta'].indexOf(inFattura.stato) >= 0) {
        throw new Rifiuto('Diventa fatturato da solo quando torna l\'XML della fattura ' + inFattura.riferimento);
      }
      this.controllaSorgenteLibera('rapportino', riga.id);
    }
    if (nuovo === 'FATTURATO') return 'segnato fatturato a mano, senza fattura in Wisper';
    if (attuale === 'FATTURATO') return 'non ancora fatturato: tolto il segno a mano';
    return '';
  },

  /** Un rapportino annullato torna com'era prima (stato, firma, date: l'annullamento non le aveva toccate). */
  ripristinaRapportino(id) {
    const riga = this.trovaRiga(id, id);
    if (!riga) throw new Rifiuto('Rapportino ' + id + ' non trovato');
    this.controllaSuo(riga, 'ripristinare i rapportini degli altri');
    if (testo(riga.stato).toUpperCase() !== 'ANNULLATO') throw new Rifiuto('Il rapportino ' + riga.id + ' non è annullato');
    const prima = testo(riga.stato_prima).toUpperCase();
    // Un rapportino che era firmato torna firmato solo se la firma c'e' ancora.
    const stato = STATI.indexOf(prima) >= 0 && prima !== 'ANNULLATO' && (prima !== 'FIRMATO' || testo(riga.firma)) ? prima : 'BOZZA';
    this.aggiorna('rapportini', riga.id, { stato, stato_prima: '', modificato: adesso() });
    this.allineaSpeseRapportino(riga.id);
    return this.rapportinoPerId(riga.id);
  },
};
