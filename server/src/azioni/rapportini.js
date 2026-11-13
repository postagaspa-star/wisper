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
 *
 * 06/11/2026 (docs/gestionale/rapportino-lavori.md): il rapportino e' la giornata (tabella giornate: numero, data,
 * tecnico) con piu' LAVORI; ogni lavoro e' una riga di rapportini, quella che fino alla 1.1 era il rapportino intero.
 * salvaRapportino ha la forma nuova {idLocale, id?, data, tecnico?, lavori: [...]} (salvaGiornata) e quella di prima
 * (un lavoro solo, dalle app 1.1 e dalle loro code). Niente firma: Da inviare = BOZZA (e il FIRMATO di prima).
 */
'use strict';

const {
  Rifiuto, senzaPermesso, testo, numero, numeroONull, siNoONull, normalizza, adesso, dataIso, dataDaIso,
  dataOraIso, oggi, centesimi,
} = require('../utili');
const { ELETTRODINAMICA, STATI, STATI_BLOCCATI, regoleDi, calcola, tariffaProposta } = require('../conti');
const Servizi = require('../servizi');
const { diverso } = require('./ore');

const urlFile = id => '/file/' + id;

/** Nella forma nuova un lavoro Inviato o Fatturato non si cambia (il FIRMATO di prima e' Da inviare: si cambia). */
// 13/11/2026 (Andrea: "anche dopo averlo inviato devi poterlo modificare liberamente, e nel caso tu lo faccia poi il sistema
// te lo deve segnare come da Inviare"): un lavoro Inviato non e' piu' fermo. Fermo resta solo quello fatturato o in una fattura.
const STATI_FERMI = ['FATTURATO'];
const statoDi = r => testo(r.stato).toUpperCase() || 'BOZZA';
/** Il numero del lavoro nel suo rapportino: RAP/2026/0153 -> 1 (il lavoro col numero del rapportino), RAP/2026/0153-2 -> 2. */
function numeroNelRapportino(idLavoro, idGiornata) {
  if (idLavoro === idGiornata) return 1;
  const m = String(idLavoro).slice(String(idGiornata).length).match(/^-(\d+)$/);
  return String(idLavoro).indexOf(idGiornata) === 0 && m ? Number(m[1]) : 0;
}

module.exports = {
  /** Il prossimo numero dell'anno della data (non di quando arriva): RAP/2026/0001, RAP/2026/0002... */
  prossimoNumeroRapportino(anno) {
    // 06/11/2026: contano i rapportini (giornate) e gli id delle righe di prima: un numero dato non torna mai.
    const codici = this.db.righe('SELECT id FROM giornate').map(r => r.id).concat(this.db.righe('SELECT id FROM rapportini').map(r => r.id));
    return this.prossimoNumero('rapportino', codici, anno);
  },

  /**
   * Le righe senza rapportino (scritte direttamente nel database: l'importazione del foglio, le prove) diventano un
   * rapportino con un solo lavoro, col loro numero, come nella migrazione 011. Torna quanti rapportini sono nati.
   */
  giornateMancanti() {
    const n = Number(this.db.esegui(
      'INSERT OR IGNORE INTO giornate (id, id_locale, data, tecnico, utente_id, creato, modificato) ' +
      'SELECT r.id, CASE WHEN r.id_locale IS NOT NULL AND NOT EXISTS (SELECT 1 FROM giornate g WHERE g.id_locale = r.id_locale) THEN r.id_locale ELSE NULL END, ' +
      "COALESCE(r.data, ''), COALESCE(r.tecnico, ''), r.utente_id, COALESCE(r.creato, ''), COALESCE(r.modificato, '') FROM rapportini r WHERE r.id_giornata IS NULL").changes) || 0;
    this.db.esegui('UPDATE rapportini SET id_giornata = id, posizione = 1 WHERE id_giornata IS NULL');
    return n;
  },

  /** Il rapportino (giornata) per idLocale se c'e', altrimenti per numero. */
  trovaGiornata(id, idLocale) {
    if (testo(idLocale)) {
      const g = this.db.riga('SELECT * FROM giornate WHERE id_locale = ?', testo(idLocale));
      if (g) return g;
    }
    if (!testo(id)) return null;
    if (this.db.riga('SELECT id FROM rapportini WHERE id = ? AND id_giornata IS NULL', testo(id))) this.giornateMancanti();
    return this.db.riga('SELECT * FROM giornate WHERE id = ?', testo(id)) || null;
  },

  /** I lavori di un rapportino in ordine (anche gli annullati). */
  lavoriDellaGiornata(idGiornata) {
    return this.db.righe('SELECT * FROM rapportini WHERE id_giornata = ? ORDER BY posizione, id', idGiornata);
  },

  /** Il rapportino come lo manda salvaRapportino (forma nuova): {id, idLocale, data, tecnico, lavori, totale}. */
  giornataPerId(idGiornata) {
    const g = this.db.riga('SELECT * FROM giornate WHERE id = ?', idGiornata);
    if (!g) return null;
    const lavori = this.lavoriDellaGiornata(g.id).filter(r => statoDi(r) !== 'ANNULLATO').map(r => this.rapportinoDaRiga(r));
    return {
      id: g.id, idLocale: testo(g.id_locale), data: dataIso(g.data), tecnico: testo(g.tecnico), lavori,
      totale: centesimi(lavori.reduce((s, l) => s + numero(l.totale), 0)),
    };
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
    r = r || {};
    // 06/11/2026: la forma nuova, il rapportino coi suoi lavori.
    if (Array.isArray(r.lavori)) return this.salvaGiornata(r);
    if (!r.idLocale && !r.id) throw new Rifiuto('Manca l\'identificativo del rapportino');
    const esistente = this.trovaRiga(r.id, r.idLocale);
    if (esistente && !esistente.id_giornata) this.giornateMancanti();
    return this.rapportinoPerId(this.salvaLavoro(r, { esistente: esistente ? this.db.riga('SELECT * FROM rapportini WHERE id = ?', esistente.id) : null }));
  },

  /**
   * salvaRapportino, forma nuova (06/11/2026): {idLocale, id?, data, tecnico?, lavori: [{idLocale, id?, ...i campi di un
   * rapportino della 1.1}]} -> {id, idLocale, data, tecnico, lavori, totale}. Lo stesso idLocale (del rapportino e dei
   * lavori) non fa doppioni. Un lavoro che c'era e non e' piu' nell'elenco si toglie (annullato, come Elimina), solo se e'
   * fuori dalle fatture. Un lavoro Fatturato, o in una fattura, non si cambia: rimandato uguale va bene. Un lavoro Inviato
   * si cambia (13/11/2026): se cambia davvero (o cambia la data del rapportino) torna Da inviare, perche' il cliente ha
   * ricevuto quello di prima; rimandato uguale resta Inviato. Ogni lavoro tiene le regole di oggi.
   */
  salvaGiornata(g) {
    if (!testo(g.idLocale) && !testo(g.id)) throw new Rifiuto('Manca l\'identificativo del rapportino');
    const lavori = g.lavori.filter(l => l && typeof l === 'object');
    if (!lavori.length) throw new Rifiuto('Aggiungi almeno un lavoro');
    const c = this.chi();
    const impostazioni = this.leggiImpostazioni();
    // I lavori che ci sono gia' (per idLocale, poi per numero).
    const trovati = lavori.map((l, i) => {
      if (!testo(l.idLocale) && !testo(l.id)) throw this.rifiutoLavoro(new Rifiuto('Manca l\'identificativo del lavoro'), i, lavori.length);
      const riga = this.trovaRiga(l.id, l.idLocale);
      if (riga && !riga.id_giornata) this.giornateMancanti();
      if (!riga && !testo(l.idLocale)) throw this.rifiutoLavoro(new Rifiuto('Lavoro ' + testo(l.id) + ' non trovato'), i, lavori.length);
      return riga ? this.db.riga('SELECT * FROM rapportini WHERE id = ?', riga.id) : null;
    });
    trovati.forEach((r, i) => {
      if (r && trovati.findIndex(x => x && x.id === r.id) !== i) throw this.rifiutoLavoro(new Rifiuto('Il lavoro ' + r.id + ' c\'è due volte'), i, lavori.length);
    });
    let giornata = this.trovaGiornata(g.id, g.idLocale);
    // Il rapportino non si trova ma i suoi lavori si': e' il loro (un telefono che l'ha riscritto con un idLocale nuovo).
    if (!giornata) {
      const dei = Array.from(new Set(trovati.filter(Boolean).map(r => r.id_giornata)));
      if (dei.length === 1) giornata = this.db.riga('SELECT * FROM giornate WHERE id = ?', dei[0]) || null;
    }
    if (giornata && this.soloSuoi() && giornata.utente_id !== c.utente.id) throw senzaPermesso('modificare i rapportini degli altri');
    trovati.forEach((r, i) => {
      if (r && (!giornata || r.id_giornata !== giornata.id)) {
        throw this.rifiutoLavoro(new Rifiuto('Il lavoro ' + r.id + ' è del rapportino ' + r.id_giornata), i, lavori.length);
      }
    });
    const data = testo(g.data) ? dataDaIso(g.data) : (giornata && giornata.data) || oggi();
    // La data del rapportino cambia in questa richiesta? (Un Inviato uguale la segue e torna Da inviare solo allora: un
    // lavoro inviato rimasto con la sua data di prima non si tocca per sbaglio salvando altro.)
    const dataCambiata = !!giornata && dataIso(giornata.data) !== data;
    const tecnico = this.soloSuoi() ? c.utente.nome : (testo(g.tecnico) || (giornata ? testo(giornata.tecnico) : '') || testo(impostazioni.TECNICO));
    // Quelli tolti dall'elenco: si tolgono solo Da inviare e fuori dalle fatture (prima di scrivere qualunque cosa).
    const tenuti = new Set(trovati.filter(Boolean).map(r => r.id));
    const daTogliere = giornata ? this.lavoriDellaGiornata(giornata.id).filter(r => !tenuti.has(r.id) && statoDi(r) !== 'ANNULLATO') : [];
    for (const r of daTogliere) {
      this.controllaSuo(r, 'togliere i lavori degli altri');
      this.controllaLavoroDaTogliere(r);
    }
    const ora = adesso();
    if (!giornata) {
      const numeroNuovo = this.prossimoNumeroRapportino(Number(data.slice(0, 4)));
      const idLocale = testo(g.idLocale) && !this.db.riga('SELECT id FROM giornate WHERE id_locale = ?', testo(g.idLocale)) ? testo(g.idLocale) : null;
      this.inserisci('giornate', { id: numeroNuovo.codice, id_locale: idLocale, data, tecnico, utente_id: c.utente ? c.utente.id : null, creato: ora, modificato: ora });
      this.segnaNumero('rapportino', numeroNuovo.numero);
      giornata = this.db.riga('SELECT * FROM giornate WHERE id = ?', numeroNuovo.codice);
    }
    const idG = giornata.id;
    // Il numero dei lavori nuovi: dopo il piu' alto mai dato in questo rapportino (anche a un lavoro tolto).
    let prossimo = this.lavoriDellaGiornata(idG).reduce((m, r) => Math.max(m, numeroNelRapportino(r.id, idG)), 0) + 1;
    lavori.forEach((l, i) => {
      const riga = trovati[i];
      const posizione = i + 1;
      try {
        if (riga) {
          const st = statoDi(riga);
          // Tolto (da qui o dall'ufficio con Elimina): resta tolto.
          if (st === 'ANNULLATO') return;
          const fermo = STATI_FERMI.indexOf(st) >= 0 || !!this.sorgenteAttiva('rapportino', riga.id);
          const uguale = this.lavoroUguale(riga, l);
          if (uguale && (fermo || (st === 'INVIATO' && !dataCambiata) || (dataIso(riga.data) === data && testo(riga.tecnico) === tecnico))) {
            if (riga.posizione !== posizione) this.db.esegui('UPDATE rapportini SET posizione = ? WHERE id = ?', posizione, riga.id);
            return;
          }
          if (STATI_FERMI.indexOf(st) >= 0) throw new Rifiuto('Il lavoro ' + riga.id + ' è già ' + (st === 'FATTURATO' ? 'fatturato' : 'inviato') + ': non si cambia');
          if (fermo) this.controllaSorgenteLibera('rapportino', riga.id);
        } else {
          while (this.db.riga('SELECT id FROM rapportini WHERE id = ?', idG + '-' + prossimo)) prossimo++;
        }
        const id = riga ? riga.id : idG + '-' + (prossimo++);
        this.salvaLavoro(Object.assign({}, l, { data, tecnico }), { esistente: riga, id, idGiornata: idG, posizione, formaNuova: true });
      } catch (err) {
        throw this.rifiutoLavoro(err, i, lavori.length);
      }
    });
    if (daTogliere.length) this.cambiaStato(daTogliere.map(r => r.id), 'ANNULLATO');
    this.aggiorna('giornate', idG, { data, tecnico, modificato: ora });
    return this.giornataPerId(idG);
  },

  /** "Lavoro 2: ..." (con piu' lavori) e il posto del lavoro nella risposta (lavoro: 2), per aprirlo. */
  rifiutoLavoro(err, i, quanti) {
    if (!(err instanceof Rifiuto) || err.extra.lavoro) return err;
    const r = new Rifiuto(quanti > 1 ? 'Lavoro ' + (i + 1) + ': ' + err.message : err.message, Object.assign({}, err.extra, { lavoro: i + 1 }));
    if (err.esito) r.esito = err.esito;
    return r;
  },

  /** Un lavoro si toglie se e' fuori dalle fatture (dal 13/11/2026 anche Inviato: resta nell'archivio come annullato). */
  controllaLavoroDaTogliere(r) {
    const st = statoDi(r);
    const nome = testo(r.cliente) || testo(r.id_cliente) || 'senza cliente';
    if (st === 'FATTURATO' || this.sorgenteAttiva('rapportino', r.id)) throw new Rifiuto('Il lavoro per ' + nome + ' è in una fattura: non si toglie', { idLavoro: r.id });
  },

  /**
   * Il lavoro mandato e' uguale a quello scritto? Gli stessi campi che salvaLavoro scriverebbe (un campo che manca vale
   * vuoto, come oggi): cliente, commessa, progetto, ore, km, spese, descrizione, luogo, note, ticket, tariffa (solo per
   * chi vede i prezzi e per i clienti senza tariffa fissa). Gli strumenti di un lavoro fermo non si guardano.
   */
  lavoroUguale(riga, l) {
    const n = (a, b) => numero(a) === numero(b);
    if (testo(l.idCliente)) {
      if (testo(l.idCliente) !== testo(riga.id_cliente)) return false;
    } else if (normalizza(l.cliente) !== normalizza(riga.cliente)) return false;
    const progetto = l.progettoNuovo && typeof l.progettoNuovo === 'object'
      ? (testo(l.progettoNuovo.idLocale) ? (this.db.riga('SELECT id FROM progetti WHERE id_locale = ?', testo(l.progettoNuovo.idLocale)) || {}).id : undefined)
      : (l.idProgetto === null || l.idProgetto === undefined || testo(l.idProgetto) === '' ? null : Number(l.idProgetto));
    if ((progetto === undefined ? -1 : progetto) !== (riga.id_progetto === null || riga.id_progetto === undefined ? null : riga.id_progetto)) return false;
    if (testo(l.idCommessa)) {
      if (this.codiceCommessaVero(l.idCommessa).toUpperCase() !== testo(riga.id_commessa).toUpperCase()) return false;
    } else if (testo(l.commessa) || (progetto === null && testo(riga.id_commessa))) return false;
    for (const [k, col] of [['descrizione', 'descrizione'], ['luogo', 'luogo'], ['noteSpese', 'note_spese'], ['noteInterne', 'note_interne']]) {
      if (testo(l[k]) !== testo(riga[col])) return false;
    }
    for (const [k, col] of [['oreLavoro', 'ore_lavoro'], ['oreExtra', 'ore_extra'], ['oreViaggio', 'ore_viaggio'], ['km', 'km'], ['spese', 'spese']]) {
      if (!n(l[k], riga[col])) return false;
    }
    if (testo(l.ticket) && testo(l.ticket) !== testo(riga.ticket)) return false;
    if (l.idTicket !== undefined && l.idTicket !== null && testo(l.idTicket) !== '' && this.idTicketDa(l.idTicket) !== riga.ticket_id) return false;
    if (this.vedeCosti() && numero(l.tariffa) > 0 && !n(l.tariffa, riga.tariffa)) {
      const s = this.db.riga('SELECT tariffa_fissa FROM soggetti WHERE id = ?', riga.id_cliente);
      if (!s || s.tariffa_fissa === null || s.tariffa_fissa === undefined || s.tariffa_fissa === '') return false;
    }
    // 1.4.0: le indennita' (servizi.md §2), se il lavoro le porta: le stesse, campo per campo, dopo la pulizia.
    if (Array.isArray(l.indennita)) {
      const vecchie = Servizi.indennitaDi(riga);
      let nuove;
      try {
        nuove = Servizi.pulisciIndennita(l.indennita, vecchie, id => this.db.riga('SELECT * FROM listino WHERE id = ?', id), this.vedeCosti());
      } catch (e) {
        return false;
      }
      if (JSON.stringify(nuove) !== JSON.stringify(vecchie)) return false;
    }
    if (Array.isArray(l.strumenti) && STATI_FERMI.indexOf(statoDi(riga)) < 0 && !this.sorgenteAttiva('rapportino', riga.id)) {
      const voluti = new Set(l.strumenti.map(s => Number(s && typeof s === 'object' ? s.idAttrezzatura : s)).filter(Boolean));
      const usati = new Set(this.db.righe('SELECT attrezzatura_id a FROM strumenti_usati WHERE rapportino_id = ?', riga.id).map(x => x.a));
      if (voluti.size !== usati.size || Array.from(voluti).some(x => !usati.has(x))) return false;
    }
    return true;
  },

  /**
   * Un lavoro (fino alla 1.1: il rapportino intero), con le regole di sempre. o.esistente: la riga che c'e' gia' (o
   * null). Forma di prima (o.formaNuova assente): come la 1.1, e il rapportino del lavoro nasce o ne segue la data.
   * Forma nuova: id, idGiornata e posizione li da' salvaGiornata; un FIRMATO di prima che cambia torna Da inviare senza
   * la firma. Torna l'id del lavoro.
   */
  salvaLavoro(r, o) {
    o = o || {};
    const esistente = o.esistente || null;
    if (esistente) this.controllaSuo(esistente, 'modificare i rapportini degli altri');
    // Fase 4: un rapportino in una bozza o in una fattura non si tocca (prima la frase che dice dove sta).
    if (esistente) this.controllaSorgenteLibera('rapportino', esistente.id);

    if (esistente && !o.formaNuova && STATI_BLOCCATI.indexOf(testo(esistente.stato).toUpperCase()) >= 0) {
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
    // Anche col codice di prima (quello dei 26ST, o uno cambiato con cambiaCodiceCommessa): un rapportino rimasto in coda
    // su un telefono. Il codice di adesso vale prima di quello di prima; di due commesse col codice di prima, la piu' recente.
    let commessa = !codiceScelto ? null : commesse.filter(m => m.id.toUpperCase() === codiceScelto)[0] ||
      commesse.filter(m => m.codicePrecedente.toUpperCase() === codiceScelto).pop() || null;
    // 03/11/2026: il progetto (cliente -> commessa -> progetto -> rapportino). Scelto: la commessa e' la sua (se il
    // rapportino non la dice, la si prende dal progetto); nuovo (nato sul telefono): si crea dopo la commessa.
    const sceltaProgetto = this.progettoPerRapportino(r, commessa);
    if (sceltaProgetto.riga && !commessa) {
      if (testo(r.commessa)) throw new Rifiuto('Il progetto ' + sceltaProgetto.riga.codice + ' è della commessa ' + sceltaProgetto.riga.commessa_id);
      commessa = commesse.filter(m => m.id.toUpperCase() === testo(sceltaProgetto.riga.commessa_id).toUpperCase())[0] || null;
    }
    if (sceltaProgetto.riga && commessa && commessa.idCliente && (!cliente || cliente.id !== commessa.idCliente)) {
      throw new Rifiuto('Il progetto ' + sceltaProgetto.riga.codice + ' è di un altro cliente');
    }
    if (sceltaProgetto.nuovo && !commessa && !testo(r.commessa)) throw new Rifiuto('Per un progetto nuovo scegli prima la commessa');
    this.serveCrearePerRapportino(cliente, commessa, r);
    // Fase 6: il rapportino di un esterno e' sulla commessa di un suo incarico affidato (si lega da solo).
    let incarico = null;
    if (this.eEsterno()) {
      incarico = this.incaricoDellEsterno(commessa ? commessa.id : codiceScelto || testo(r.commessa));
      if (cliente && commessa && commessa.idCliente && cliente.id !== commessa.idCliente) throw new Rifiuto('Commessa ' + commessa.id + ' non trovata');
    } else if (esistente && esistente.incarico_id) {
      incarico = this.db.riga('SELECT * FROM incarichi WHERE id = ?', esistente.incarico_id);
    }

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
    const progetto = sceltaProgetto.riga || (sceltaProgetto.nuovo ? this.creaProgettoPerRapportino(sceltaProgetto.nuovo, commessa) : null);

    // Le tariffe di un rapportino gia' scritto non cambiano se cambiano le
    // impostazioni: aggiornare l'ACI a gennaio non deve riscrivere luglio.
    // Si ricalcola con le regole di oggi solo se sono cambiati il cliente o la commessa.
    const stessaCommessa = testo(esistente && esistente.id_commessa).toUpperCase() === (commessa ? commessa.id.toUpperCase() : '');
    const congelato = !!(esistente && testo(esistente.id_cliente) === cliente.id && stessaCommessa && esistente.euro_km !== null);
    // Fase 6: il costo orario di un rapportino che nasce (o cambia commessa) viene dalla persona che l'ha scritto, alla
    // data del lavoro; senza un costo della persona resta la regola di prima (cliente, commessa, COSTO_ORARIO); un
    // esterno 0. Quelli gia' scritti tengono il loro (sotto).
    if (!congelato) {
      const autore = esistente ? esistente.utente_id : (this.chi().utente ? this.chi().utente.id : null);
      regole.costoOrario = this.costoOrarioLavoro({ idUtente: autore, data, commessa, cliente });
    }
    if (congelato) {
      regole.euroKm = numero(esistente.euro_km);
      regole.maggExtra = numero(esistente.magg_extra);
      regole.pagaViaggio = siNoONull(esistente.paga_viaggio) === true;
      regole.kmRimborsati = siNoONull(esistente.km_rimborsati) !== false;
      regole.costoOrario = numeroONull(esistente.costo_orario);
      if (regole.tariffaFissa !== null) regole.tariffaFissa = numero(esistente.tariffa);
    }

    // 1.4.0 (servizi.md §2): le indennita' del lavoro. Senza il campo (app vecchie) restano quelle che aveva.
    const indennita = Servizi.pulisciIndennita(r.indennita, esistente ? Servizi.indennitaDi(esistente) : [],
      id => this.db.riga('SELECT * FROM listino WHERE id = ?', id), this.vedeCosti());
    const conto = calcola(Object.assign({}, r, { indennita }), regole);
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
      id_progetto: progetto ? progetto.id : null,
      progetto: progetto ? testo(progetto.codice) : '',
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
      indennita: Servizi.indennitaPerDb(indennita),
      importo_indennita: conto.importoIndennita,
      totale: conto.totale,
      costo_orario: regole.costoOrario === null || regole.costoOrario === undefined ? null : numero(regole.costoOrario),
      note_interne: testo(r.noteInterne),
      ticket_id: ticketRiga ? ticketRiga.id : null,
      // Fase 6: l'incarico del collaboratore esterno.
      incarico_id: incarico ? incarico.id : (esistente ? esistente.incarico_id : null),
      modificato: ora,
    };

    // Fase 3: chi deve far approvare le sue cose manda il rapportino in approvazione (a ogni cambio vero).
    const cambiato = !esistente || Object.keys(valori).some(k => k !== 'modificato' && diverso(esistente[k], valori[k]));
    const noteCambiate = !esistente || diverso(esistente.note_spese, valori.note_spese);
    let id;
    if (esistente) {
      id = esistente.id;
      // 06/11/2026: nella forma nuova un FIRMATO di prima che cambia torna Da inviare, e la firma (di quello di prima) cade.
      const firmatoCambiato = !!o.formaNuova && cambiato && statoDi(esistente) === 'FIRMATO';
      if (firmatoCambiato) Object.assign(valori, { stato: 'BOZZA', firma: '', firmatario: '', firmato_il: '' });
      // 13/11/2026: un Inviato che cambia torna Da inviare (il cliente ha ricevuto quello di prima: va mandato di nuovo).
      const inviatoCambiato = !!o.formaNuova && cambiato && statoDi(esistente) === 'INVIATO';
      if (inviatoCambiato) Object.assign(valori, { stato: 'BOZZA', inviato_il: '' });
      this.aggiorna('rapportini', id, Object.assign(valori, this.approvazioneRapportinoDopo(esistente, esistente.utente_id, cambiato)),
        'id', firmatoCambiato ? 'cambiato: di nuovo da inviare, senza la firma di prima' : inviatoCambiato ? 'cambiato dopo l\'invio: torna da inviare' : undefined);
      if (firmatoCambiato) {
        this.chiudiPubblicazioni('rapportino', id, 'annullato');
        this.db.esegui("UPDATE rapportini SET firma_modo = '', firma_prova = NULL, firma_referente_id = NULL WHERE id = ?", id);
      }
      // Come "Riporta da inviare": esce dal portale (si ripubblica mandandolo di nuovo).
      if (inviatoCambiato) this.chiudiPubblicazioni('rapportino', id, 'annullato');
      if (o.formaNuova && (esistente.posizione !== o.posizione || esistente.id_giornata !== o.idGiornata)) {
        this.db.esegui('UPDATE rapportini SET posizione = ?, id_giornata = ? WHERE id = ?', o.posizione, o.idGiornata, id);
      }
      if (!o.formaNuova) this.seguiGiornata(this.db.riga('SELECT * FROM rapportini WHERE id = ?', id), ora);
    } else {
      const autore = c.utente ? c.utente.id : null;
      let numeroNuovo = null;
      if (o.formaNuova) {
        id = o.id;
      } else {
        numeroNuovo = this.prossimoNumeroRapportino(Number(data.slice(0, 4)));
        id = numeroNuovo.codice;
      }
      this.inserisci('rapportini', Object.assign({ id, stato: 'BOZZA', creato: ora, utente_id: autore }, valori,
        { id_giornata: o.formaNuova ? o.idGiornata : id, posizione: o.formaNuova ? o.posizione : 1 },
        this.serveApprovazione(autore) ? { stato_approvazione: 'da_approvare' } : {}));
      if (numeroNuovo) {
        this.segnaNumero('rapportino', numeroNuovo.numero);
        // La forma di prima: il rapportino nasce col lavoro, con lo stesso numero.
        const idLocaleG = valori.id_locale && !this.db.riga('SELECT id FROM giornate WHERE id_locale = ?', valori.id_locale) ? valori.id_locale : null;
        this.inserisci('giornate', { id, id_locale: idLocaleG, data, tecnico, utente_id: autore, creato: ora, modificato: ora });
      }
    }
    // Le spese del passo 3 diventano (o restano) righe di spese al cliente che sommano alla colonna.
    this.sincronizzaSpeseRapportino(id, { noteCambiate });
    // Fase 6: gli strumenti usati (l'elenco intero; le versioni vecchie e il ponte non li mandano: niente cambia).
    if (Array.isArray(r.strumenti)) this.scriviStrumentiRapportino(this.db.riga('SELECT * FROM rapportini WHERE id = ?', id), r.strumenti);
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

    return id;
  },

  /**
   * La forma di prima cambia un lavoro alla volta: il rapportino con quel lavoro solo ne segue data e tecnico; con
   * altri lavori cambia solo l'ora della modifica.
   */
  seguiGiornata(lavoro, ora) {
    if (!lavoro || !lavoro.id_giornata) return;
    const g = this.db.riga('SELECT * FROM giornate WHERE id = ?', lavoro.id_giornata);
    if (!g) return;
    const altri = this.db.riga("SELECT COUNT(*) n FROM rapportini WHERE id_giornata = ? AND id <> ? AND UPPER(stato) <> 'ANNULLATO'", lavoro.id_giornata, lavoro.id).n;
    this.aggiorna('giornate', g.id, altri ? { modificato: ora } : { data: dataIso(lavoro.data) || g.data, tecnico: testo(lavoro.tecnico), modificato: ora });
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
    // 03/11/2026: codice, descrizione e intestatario dei progetti.
    const progetti = {};
    for (const p of this.db.righe('SELECT id, codice, descrizione, intestato_a FROM progetti')) progetti[p.id] = p;
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
    // Fase 6: gli strumenti usati (stato della taratura di quel giorno).
    const strumenti = this.strumentiDeiRapportini(id ? [id] : this.db.righe('SELECT DISTINCT rapportino_id r FROM strumenti_usati WHERE rapportino_id IS NOT NULL').map(x => x.r));
    return { foto, descrizioni, spese, fatture, ticket, strumenti, progetti };
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
      // 03/11/2026: il progetto (id, codice, descrizione, a chi e' intestato).
      idProgetto: r.id_progetto === null || r.id_progetto === undefined ? null : r.id_progetto,
      progetto: testo(r.progetto),
      progettoDescrizione: r.id_progetto && (aiuti.progetti || {})[r.id_progetto] ? testo(aiuti.progetti[r.id_progetto].descrizione) : '',
      progettoIntestatoA: r.id_progetto && (aiuti.progetti || {})[r.id_progetto] ? testo(aiuti.progetti[r.id_progetto].intestato_a) : '',
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
      // 1.4.0: le indennita' (servizi.md §2) e la loro somma, gia' dentro il totale.
      indennita: Servizi.indennitaDi(r).map(Servizi.indennitaInRisposta),
      importoIndennita: numero(r.importo_indennita),
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
    // Fase 6: gli strumenti usati e l'incarico del collaboratore esterno.
    o.strumenti = (aiuti.strumenti || {})[r.id] || [];
    const daGuardare = o.strumenti.length ? this.strumentiDaGuardare(o.strumenti) : [];
    if (daGuardare.length) o.strumentiDaGuardare = daGuardare;
    o.idIncarico = r.incarico_id === null || r.incarico_id === undefined ? null : r.incarico_id;
    // Fase 7 (§10.4): firmato nel portale? da chi; e se e' nel portale (da firmare, visto).
    o.firmaModo = r.firma_modo || '';
    o.firmaReferente = '';
    if (r.firma_referente_id) o.firmaReferente = (this.db.riga('SELECT nome FROM referenti WHERE id = ?', r.firma_referente_id) || {}).nome || '';
    const pp = this.portaleDi('rapportino', r.id);
    o.portale = { pubblicato: pp.pubblicato, daFirmare: pp.daFirmare, vistoIl: pp.vistoIl, pubblicazione: pp.pubblicazione };
    // 06/11/2026: il rapportino (giornata) di cui e' un lavoro, il posto nel rapportino, il numero che si vede.
    o.idGiornata = testo(r.id_giornata) || testo(r.id);
    o.posizione = Number(r.posizione) || 1;
    o.numero = o.idGiornata;
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
    if (testo(f.idProgetto)) { condizioni.push('id_progetto = ?'); parametri.push(Number(f.idProgetto)); }
    if (testo(f.idTicket)) { condizioni.push('ticket_id = ?'); parametri.push(this.idTicketDa(f.idTicket)); }
    if (testo(f.statoApprovazione)) { condizioni.push('stato_approvazione = ?'); parametri.push(testo(f.statoApprovazione) === 'nessuno' ? '' : testo(f.statoApprovazione)); }
    const sql = 'SELECT * FROM rapportini' + (condizioni.length ? ' WHERE ' + condizioni.join(' AND ') : '');
    const aiuti = this.aiutiRapportini();
    // 06/11/2026: i lavori di un rapportino stanno insieme, in ordine: prima per la data e la nascita del rapportino
    // (per i rapportini di un lavoro solo sono quelle del lavoro: l'ordine di prima), poi per posizione.
    const giornate = new Map(this.db.righe('SELECT id, data, creato FROM giornate').map(g => [g.id, g]));
    const chiave = x => {
      const g = giornate.get(x.idGiornata);
      return { data: g ? dataIso(g.data) : x.data, creato: g ? dataOraIso(g.creato) : x.creato };
    };
    return this.db.righe(sql, ...parametri)
      .map(r => this.rapportinoDaRiga(r, aiuti))
      .map(x => ({ x, k: chiave(x) }))
      .sort((a, b) => (a.k.data < b.k.data ? 1 : a.k.data > b.k.data ? -1
        : a.x.idGiornata !== b.x.idGiornata ? (a.k.creato < b.k.creato ? 1 : a.k.creato > b.k.creato ? -1 : (a.x.idGiornata < b.x.idGiornata ? 1 : -1))
          : a.x.posizione - b.x.posizione || (a.x.id < b.x.id ? -1 : 1)))
      .map(e => e.x);
  },

  /**
   * Cambia lo stato di uno o piu' rapportini (il riepilogo di luglio si segna
   * fatturato tutto insieme). Tornare in BOZZA toglie la firma: il cliente ha
   * firmato quello che c'era, e se il rapportino cambia quella firma non vale
   * piu'. Annullare ricorda lo stato di prima, per ripristinarlo.
   */
  cambiaStato(ids, stato, idGiornata) {
    const nuovo = testo(stato).toUpperCase();
    if (STATI.indexOf(nuovo) < 0) throw new Rifiuto('Stato non valido: ' + nuovo);
    if (nuovo === 'FIRMATO') throw new Rifiuto('Per firmare serve la firma: caricala dal rapportino');
    if (nuovo === 'FATTURATO' && this.livello('fatturazione') < 2) throw senzaPermesso('segnare i rapportini come fatturati');
    const ora = adesso();
    // 06/11/2026: un rapportino intero (idGiornata, o un numero che e' di un rapportino e non di un lavoro) vale per i suoi
    // lavori non annullati. Togliere (ANNULLATO) un rapportino: solo se tutti i suoi lavori sono Da inviare e fuori dalle
    // fatture. Un numero che e' anche di un lavoro (i rapportini di prima) e' il lavoro, come oggi.
    const lista = [];
    const giornate = testo(idGiornata) ? [testo(idGiornata)] : [];
    for (const id of ids || []) {
      if (testo(id) && !this.trovaRiga(id, id) && this.trovaGiornata(id, id)) giornate.push(this.trovaGiornata(id, id).id);
      else lista.push(id);
    }
    for (const idG of giornate) {
      const g = this.trovaGiornata(idG, idG);
      if (!g) throw new Rifiuto('Rapportino ' + idG + ' non trovato');
      const suoi = this.lavoriDellaGiornata(g.id).filter(r => statoDi(r) !== 'ANNULLATO');
      for (const r of suoi) {
        this.controllaSuo(r, 'cambiare lo stato dei rapportini degli altri');
        if (nuovo === 'ANNULLATO') this.controllaLavoroDaTogliere(r);
      }
      for (const r of suoi) if (lista.indexOf(r.id) < 0) lista.push(r.id);
    }
    return lista.map(id => {
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
      // Fase 7 (§8.1): annullato, o riportato in bozza da firmato, esce dal portale (si ripubblica a mano se serve).
      if (nuovo === 'ANNULLATO' || (nuovo === 'BOZZA' && attuale !== 'BOZZA')) this.chiudiPubblicazioni('rapportino', riga.id, 'annullato');
      if (nuovo === 'BOZZA' && attuale !== 'BOZZA') this.db.esegui("UPDATE rapportini SET firma_modo = '', firma_prova = NULL, firma_referente_id = NULL WHERE id = ?", riga.id);
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
    // 06/11/2026: un rapportino intero tolto con Elimina torna con i lavori tolti in quella volta (stessa ora).
    if (!riga && this.trovaGiornata(id, id)) {
      const g = this.trovaGiornata(id, id);
      const tolti = this.lavoriDellaGiornata(g.id).filter(r => statoDi(r) === 'ANNULLATO');
      if (!tolti.length) throw new Rifiuto('Il rapportino ' + g.id + ' non è annullato');
      const ultima = tolti.map(r => testo(r.modificato)).sort().pop();
      for (const r of tolti.filter(x => testo(x.modificato) === ultima)) this.ripristinaRapportino(r.id);
      return this.giornataPerId(g.id);
    }
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
