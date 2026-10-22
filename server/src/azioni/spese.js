/*
 * Spese, trasferte, rimborsi e veicoli (fase 3, accordo in
 * docs/gestionale/fase3.md, risposte in architettura.md §14).
 *
 * Una spesa per scontrino, con la foto; "a chi va": al cliente (va nel suo
 * conto), allo studio, "Mia" (personale). Le spese che si scrivono nel passo 3
 * del rapportino sono righe di spese legate a lui (dal_rapportino): la colonna
 * rapportini.spese resta il totale delle sue spese al cliente, cosi' conti e
 * PDF non cambiano. Una spesa del rapportino spostata allo studio o "Mia" esce
 * dal suo conto. Le spese di un rapportino seguono la sua approvazione e, da
 * firmato in poi, non cambiano importo ne' destinazione (si cambiano solo
 * categoria, descrizione e chi l'ha pagata).
 *
 * Soldi della persona: l'importo delle sue spese, il rimborso delle sue
 * trasferte e l'euro al km del veicolo si vedono anche senza "costi"
 * (soldiPropri in permessi.js). Un collaboratore vede e scrive solo le sue.
 */
'use strict';

const {
  Rifiuto, senzaPermesso, testo, numero, numeroONull, centesimi, adesso, oggi, dataIso, dataDaIso, dataOraIso,
} = require('../utili');
const { STATI_BLOCCATI, rimborsoTrasferta, rimborsiDovuti, contaNeiConti } = require('../conti');
const { soldiPropri } = require('../permessi');
const { periodoDa, diverso } = require('./ore');

const CATEGORIE = ['carburante', 'pedaggio', 'parcheggio', 'vitto', 'alloggio', 'treno', 'aereo', 'taxi', 'materiale', 'altro'];
const DESTINAZIONI = ['cliente', 'studio', 'personale'];
const STATI = ['bozza', 'da_approvare', 'approvata', 'respinta'];
/** Le parole di una spesa di un rapportino gia' firmato che si possono ancora cambiare. */
const CAMPI_SEMPRE = ['categoria', 'descrizione', 'pagataDaMe'];
/** Lo stato delle spese di un rapportino, dal suo stato di approvazione. */
const STATO_DAL_RAPPORTINO = { '': 'approvata', da_approvare: 'da_approvare', approvato: 'approvata', respinto: 'respinta' };
/** Il sito dell'ACI, dove stanno le tabelle dei costi chilometrici (le app lo aprono da Amministrazione › Veicoli). L'indirizzo preciso della pagina cambia: si da' quello del sito. */
const PAGINA_ACI = 'https://www.aci.it/';

const si = v => v === true || v === 1 || v === '1' || v === 'true';
const dataBreve = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
const urlFile = id => '/file/' + id;
const giorniTra = (dal, al) => (dal && al && al >= dal ? Math.round((Date.parse(al + 'T12:00:00') - Date.parse(dal + 'T12:00:00')) / 86400000) + 1 : 1);

module.exports = {
  // ------------------------------------------------------------------ chi vede, cosa e' bloccato

  rigaSpesa(id) {
    const r = this.db.riga('SELECT * FROM spese WHERE id = ?', Number(id) || 0);
    if (!r || !this.vedeDi(r.utente_id)) throw new Rifiuto('Spesa ' + testo(id) + ' non trovata');
    return r;
  },

  rigaTrasferta(id) {
    const r = this.db.riga('SELECT * FROM trasferte WHERE id = ?', Number(id) || 0);
    if (!r || !this.vedeDi(r.utente_id)) throw new Rifiuto('Trasferta ' + testo(id) + ' non trovata');
    return r;
  },

  /** Il rapportino, se e' firmato, inviato o fatturato (il suo contenuto non si tocca), altrimenti null. */
  rapportinoFermo(idRapportino) {
    if (!idRapportino) return null;
    const r = this.db.riga('SELECT id, stato FROM rapportini WHERE id = ?', idRapportino);
    return r && STATI_BLOCCATI.indexOf(testo(r.stato).toUpperCase()) >= 0 ? r : null;
  },

  /**
   * Perche' una spesa non si cambia: {bloccata: frase o '', soloCampi: null o
   * i campi che si possono ancora cambiare}.
   */
  speseBloccate(r) {
    if (r.tolta) return { bloccata: 'La spesa è stata tolta', soloCampi: null };
    if (r.rimborsata_il) return { bloccata: 'Rimborsata il ' + dataBreve(dataIso(r.rimborsata_il)) + ': non si cambia', soloCampi: null };
    // Fase 4: in una bozza o in una fattura si cambiano solo categoria, descrizione e chi l'ha pagata (non i numeri della fattura).
    const frase = this.fraseSorgenteFerma('spesa', r.id);
    if (frase) return { bloccata: frase, soloCampi: CAMPI_SEMPRE };
    const fermo = this.rapportinoFermo(r.rapportino_id);
    if (fermo) {
      return {
        bloccata: 'È nel rapportino ' + fermo.id + ', già firmato: si cambiano solo categoria, descrizione e chi l\'ha pagata',
        soloCampi: CAMPI_SEMPRE,
      };
    }
    if (r.fatturata_il) return { bloccata: 'Fatturata il ' + dataBreve(dataIso(r.fatturata_il)) + ': non si cambia', soloCampi: null };
    if (r.stato === 'approvata' && this.soloSuoi() && !r.rapportino_id) {
      return { bloccata: 'È già approvata: per cambiarla chiedi a chi approva', soloCampi: null };
    }
    return { bloccata: '', soloCampi: null };
  },

  trasfertaBloccata(r) {
    if (r.tolta) return 'La trasferta è stata tolta';
    if (r.rimborsata_il) return 'Rimborsata il ' + dataBreve(dataIso(r.rimborsata_il)) + ': non si cambia';
    if (r.stato === 'approvata' && this.soloSuoi()) return 'È già approvata: per cambiarla chiedi a chi approva';
    return '';
  },

  // ------------------------------------------------------------------ spese: lettura

  /** Nomi, foto e stato dei rapportini per un elenco di spese. */
  aiutiSpese(righe) {
    const a = this.nomiFase3();
    a.foto = {};
    const ids = righe.map(r => Number(r.id));
    if (ids.length) {
      for (const f of this.db.righe("SELECT id, spesa_id FROM file WHERE tipo = 'spesa' AND cestinato IS NULL AND spesa_id IN (" + ids.join(',') + ') ORDER BY creato, rowid')) {
        (a.foto[f.spesa_id] = a.foto[f.spesa_id] || []).push({ id: f.id, url: urlFile(f.id) });
      }
    }
    return a;
  },

  spesaDaRiga(r, a) {
    a = a || this.aiutiSpese([r]);
    const m = r.commessa_id ? a.commesse[String(r.commessa_id).toUpperCase()] : null;
    const b = this.speseBloccate(r);
    const o = {
      id: r.id, idUtente: r.utente_id === null ? null : r.utente_id, utente: r.utente_id ? a.utenti[r.utente_id] || '' : '',
      data: r.data, importo: numero(r.importo), categoria: r.categoria, descrizione: r.descrizione,
      idCommessa: m ? m.id : r.commessa_id, commessa: m ? m.descrizione : '', idCliente: r.cliente_id,
      cliente: r.cliente_id ? a.clienti[r.cliente_id] || '' : '',
      idRapportino: r.rapportino_id || '', idTrasferta: r.trasferta_id === null ? null : r.trasferta_id,
      destinazione: r.destinazione, anticipazione: r.anticipazione === 1, pagataDaMe: r.pagata_da_me === 1,
      stato: r.stato, approvataDa: r.approvata_da === null ? null : r.approvata_da,
      approvataDaNome: r.approvata_da ? a.utenti[r.approvata_da] || '' : '', approvataIl: dataOraIso(r.approvata_il),
      motivoRifiuto: r.motivo, rimborsataIl: dataOraIso(r.rimborsata_il), fatturataIl: dataOraIso(r.fatturata_il),
      dalRapportino: r.dal_rapportino === 1, foto: a.foto[r.id] || [], tolta: dataOraIso(r.tolta),
      puoScrivere: this.livello('spese') >= 2 && this.vedeDi(r.utente_id) && (!b.bloccata || !!b.soloCampi),
      bloccata: b.bloccata, soloCampi: b.soloCampi,
      creato: dataOraIso(r.creato), modificato: dataOraIso(r.modificato),
    };
    return soldiPropri(o, ['importo']);
  },

  spesaPerId(id) {
    const r = this.db.riga('SELECT * FROM spese WHERE id = ?', id);
    return r ? this.spesaDaRiga(r) : null;
  },

  /** Le condizioni comuni a spese e trasferte: chi (un collaboratore solo le sue), commessa, stato. */
  condizioniComuni(d, cond, par, colonnaData) {
    const utente = this.filtroUtente(d);
    if (utente !== null) { cond.push('x.utente_id = ?'); par.push(utente); }
    const commessa = testo(d.commessa !== undefined ? d.commessa : d.idCommessa);
    if (commessa) {
      if (commessa === 'studio') cond.push("x.commessa_id = ''");
      else { cond.push('x.commessa_id = ? COLLATE NOCASE'); par.push(commessa); }
    }
    const stato = testo(d.stato);
    if (stato && stato !== 'tutte') {
      if (STATI.indexOf(stato) < 0) throw new Rifiuto('Stato: bozza, da_approvare, approvata, respinta o tutte');
      cond.push('x.stato = ?');
      par.push(stato);
    }
    if (colonnaData) {
      const { da, a } = periodoDa(d, 'mese');
      if (da) { cond.push('x.' + colonnaData + ' >= ?'); par.push(da); }
      if (a) { cond.push('x.' + colonnaData + ' <= ?'); par.push(a); }
      return { da, a };
    }
    return {};
  },

  /**
   * Le righe delle spese che contano (non tolte, non di un rapportino
   * annullato), con i filtri di "spese".
   */
  righeSpese(d, periodo) {
    d = d || {};
    const cond = ['x.tolta IS NULL'];
    const par = [];
    const p = this.condizioniComuni(d, cond, par, periodo === false ? null : 'data');
    const idRap = testo(d.idRapportino);
    if (idRap) { cond.push('x.rapportino_id = ?'); par.push(idRap); }
    // Le spese di un rapportino annullato non contano (tornano col ripristino).
    else cond.push("(x.rapportino_id IS NULL OR NOT EXISTS (SELECT 1 FROM rapportini r WHERE r.id = x.rapportino_id AND UPPER(r.stato) = 'ANNULLATO'))");
    if (testo(d.idTrasferta)) { cond.push('x.trasferta_id = ?'); par.push(Number(d.idTrasferta)); }
    const dest = testo(d.destinazione);
    if (dest) {
      if (DESTINAZIONI.indexOf(dest) < 0) throw new Rifiuto('A chi va: cliente, studio o personale');
      cond.push('x.destinazione = ?');
      par.push(dest);
    }
    if (testo(d.categoria)) { cond.push('x.categoria = ?'); par.push(testo(d.categoria)); }
    const righe = this.db.righe('SELECT x.* FROM spese x WHERE ' + cond.join(' AND ') + ' ORDER BY x.data DESC, x.id DESC', ...par);
    return { righe, da: p.da || '', a: p.a || '' };
  },

  /**
   * spese {da, a, utente, commessa, stato, destinazione, categoria,
   * idRapportino, idTrasferta}: di base il mese di oggi. totali: al cliente,
   * allo studio, "Mia", e quanto c'e' da restituire di queste (pagate da chi le
   * ha scritte, non "Mia", non ancora rimborsate, mandate o approvate). Le
   * respinte non contano nei totali.
   */
  leggiSpese(d) {
    const { righe, da, a } = this.righeSpese(d);
    const aiuti = this.aiutiSpese(righe);
    const spese = righe.map(r => this.spesaDaRiga(r, aiuti));
    const contano = spese.filter(s => s.stato !== 'respinta');
    const somma = l => centesimi(l.reduce((t, s) => t + s.importo, 0));
    const totali = {
      quante: spese.length,
      cliente: somma(contano.filter(s => s.destinazione === 'cliente')),
      studio: somma(contano.filter(s => s.destinazione === 'studio')),
      personale: somma(contano.filter(s => s.destinazione === 'personale')),
      daRimborsare: somma(contano.filter(s => s.pagataDaMe && s.destinazione !== 'personale' && !s.rimborsataIl && s.stato !== 'bozza')),
      senzaFoto: contano.filter(s => !s.foto.length).length,
    };
    return { ok: true, da, a, spese, totali };
  },

  // ------------------------------------------------------------------ spese: scrittura

  /**
   * salvaSpesa {spesa: {id?, idUtente?, data, importo, categoria, descrizione,
   * idCommessa?, idCliente?, idRapportino?, idTrasferta?, destinazione?,
   * anticipazione?, pagataDaMe?, bozza?}}. A chi va, di base: al cliente se c'e'
   * una commessa (o un cliente o un rapportino), allo studio se no.
   */
  salvaSpesa(x) {
    x = x || {};
    const c = this.chi();
    const io = c.utente ? c.utente.id : null;
    const prima = testo(x.id) ? this.rigaSpesa(x.id) : null;
    // La stessa spesa mandata due volte dalla coda del telefono: c'e' gia', niente doppione.
    const giaArrivata = !prima && testo(x.idLocale) ? this.db.riga('SELECT id, utente_id FROM spese WHERE id_locale = ?', testo(x.idLocale)) : null;
    if (giaArrivata) {
      if (this.soloSuoi() && giaArrivata.utente_id !== io) throw senzaPermesso('vedere le spese degli altri');
      return this.spesaPerId(giaArrivata.id);
    }
    let blocco = { bloccata: '', soloCampi: null };
    if (prima) {
      if (prima.tolta) throw new Rifiuto('La spesa è stata tolta: rimettila prima di cambiarla');
      blocco = this.speseBloccate(prima);
      if (blocco.bloccata && !blocco.soloCampi) throw new Rifiuto(blocco.bloccata);
    }
    let utente = prima ? prima.utente_id : io;
    if (x.idUtente !== undefined && testo(x.idUtente) !== '' && Number(x.idUtente) !== utente) {
      if (this.soloSuoi()) throw senzaPermesso('scrivere le spese degli altri');
      if (prima) throw new Rifiuto('La spesa non cambia persona: toglila e scrivila per l\'altra persona');
      utente = Number(x.idUtente);
      if (!this.db.riga('SELECT id FROM utenti WHERE id = ?', utente)) throw new Rifiuto('Persona ' + utente + ' non trovata');
    }

    // Il rapportino e la trasferta a cui appartiene (decidono persona, commessa e cliente).
    const idRap = x.idRapportino !== undefined ? testo(x.idRapportino) : prima ? testo(prima.rapportino_id) : '';
    let rap = null;
    if (idRap) {
      rap = this.trovaRiga(idRap, idRap);
      if (!rap) throw new Rifiuto('Rapportino ' + idRap + ' non trovato');
      this.controllaSuo(rap, 'aggiungere spese ai rapportini degli altri');
      if (rap.utente_id !== null) utente = rap.utente_id;
    }
    const idTr = x.idTrasferta !== undefined ? (testo(x.idTrasferta) ? Number(x.idTrasferta) : null) : prima ? prima.trasferta_id : null;
    let tr = null;
    if (idTr !== null) {
      tr = this.rigaTrasferta(idTr);
      if (tr.tolta) throw new Rifiuto('La trasferta ' + idTr + ' è stata tolta');
      if (!rap && tr.utente_id !== null) utente = tr.utente_id;
    }
    if (utente === null && !rap) throw new Rifiuto('Di chi è questa spesa? Manca la persona');

    let idCommessa;
    if (rap) idCommessa = testo(rap.id_commessa);
    else if (x.idCommessa !== undefined) idCommessa = testo(x.idCommessa);
    else if (prima) idCommessa = prima.commessa_id;
    else idCommessa = tr ? tr.commessa_id : '';
    const commessa = rap ? (idCommessa ? this.commessa(idCommessa) : null) : this.commessaPerCodice(idCommessa);
    let idCliente;
    if (rap) idCliente = testo(rap.id_cliente);
    else if (commessa) idCliente = commessa.idCliente;
    else if (x.idCliente !== undefined) idCliente = testo(x.idCliente);
    else if (prima) idCliente = prima.cliente_id;
    else idCliente = tr ? tr.cliente_id : '';
    if (idCliente && !rap && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', idCliente)) throw new Rifiuto('Cliente ' + idCliente + ' non trovato');

    let destinazione = x.destinazione !== undefined ? testo(x.destinazione).toLowerCase() : prima ? prima.destinazione : (rap || commessa || idCliente ? 'cliente' : 'studio');
    if (destinazione === 'mia') destinazione = 'personale';
    if (DESTINAZIONI.indexOf(destinazione) < 0) throw new Rifiuto('A chi va: cliente, studio o personale');
    if (destinazione === 'cliente' && !idCliente) throw new Rifiuto('Al cliente: scegli la commessa o il cliente');
    const anticipazione = destinazione === 'cliente' && (x.anticipazione !== undefined ? si(x.anticipazione) : prima ? prima.anticipazione === 1 : false);
    const pagataDaMe = x.pagataDaMe !== undefined ? si(x.pagataDaMe) : prima ? prima.pagata_da_me === 1 : false;
    const categoria = x.categoria !== undefined ? testo(x.categoria).toLowerCase() || 'altro' : prima ? prima.categoria : 'altro';
    if (CATEGORIE.indexOf(categoria) < 0) throw new Rifiuto('Categoria: ' + CATEGORIE.slice(0, -1).join(', ') + ' o altro');
    const data = x.data !== undefined && testo(x.data) ? dataDaIso(x.data) : prima ? prima.data : (rap ? dataIso(rap.data) || oggi() : oggi());
    const bozza = si(x.bozza) && !rap;
    let importo;
    if (x.importo !== undefined) {
      const n = numeroONull(x.importo);
      importo = n === null ? null : centesimi(n);
    } else importo = prima ? numero(prima.importo) : null;
    if (importo === null || !(importo > 0 || (bozza && importo === 0))) throw new Rifiuto('Importo: scrivi quanto hai speso');
    const descrizione = x.descrizione !== undefined ? testo(x.descrizione) : prima ? prima.descrizione : '';

    const v = {
      utente_id: utente, data, importo, categoria, descrizione, commessa_id: commessa ? commessa.id : idCommessa, cliente_id: idCliente,
      rapportino_id: rap ? rap.id : null, trasferta_id: tr ? tr.id : null, destinazione, anticipazione: anticipazione ? 1 : 0,
      pagata_da_me: pagataDaMe ? 1 : 0,
    };
    if (prima && blocco.soloCampi) {
      // Rapportino gia' firmato: importo, destinazione, rapportino e il resto non si toccano.
      const permessi = { categoria: 1, descrizione: 1, pagata_da_me: 1 };
      const cambia = Object.keys(v).filter(k => !permessi[k] && diverso(prima[k], v[k]));
      if (cambia.length) throw new Rifiuto(blocco.bloccata);
    }
    const nuovoFermo = rap && (!prima || prima.rapportino_id !== rap.id) ? this.rapportinoFermo(rap.id) : null;
    if (nuovoFermo) throw new Rifiuto('Il rapportino ' + rap.id + ' è già firmato: per aggiungere spese riportalo in bozza');
    const cambiato = !prima || Object.keys(v).some(k => diverso(prima[k], v[k]));
    if (rap) {
      // Le spese di un rapportino seguono la sua approvazione.
      Object.assign(v, this.statoSpesaDelRapportino(rap));
    } else {
      Object.assign(v, this.statoDopoSalvataggio(prima, utente, bozza, cambiato, 'motivo'));
    }
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('spese', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('spese', Object.assign(v, { dal_rapportino: 0, id_locale: testo(x.idLocale) || null, creato: ora, modificato: ora }));
    }
    this.dopoCambioSpesa(prima, id);
    return this.spesaPerId(id);
  },

  /** Lo stato (e chi ha deciso) di una spesa di questo rapportino. */
  statoSpesaDelRapportino(rap) {
    const s = rap.stato_approvazione || '';
    return {
      stato: STATO_DAL_RAPPORTINO[s] || 'approvata',
      approvata_da: s === 'approvato' || s === 'respinto' ? rap.approvato_da : null,
      approvata_il: s === 'approvato' || s === 'respinto' ? rap.approvato_il : '',
      motivo: s === 'respinto' ? rap.motivo : '',
    };
  },

  /** Dopo una spesa nuova, cambiata, tolta o rimessa: i conti dei rapportini toccati e le foto al posto giusto. */
  dopoCambioSpesa(prima, id) {
    const dopo = this.db.riga('SELECT * FROM spese WHERE id = ?', id);
    const toccati = new Set([prima && prima.rapportino_id, dopo && dopo.rapportino_id].filter(Boolean));
    this.allineaFotoSpesa(dopo);
    for (const r of toccati) this.ricalcolaSpeseRapportino(r);
  },

  /**
   * Le foto di una spesa stanno anche nel rapportino (e nel suo PDF) solo se
   * la spesa e' sua e va al cliente: spostata allo studio o "Mia", escono.
   */
  allineaFotoSpesa(s) {
    if (!s) return;
    const voluto = s.rapportino_id && s.destinazione === 'cliente' ? s.rapportino_id : null;
    for (const f of this.db.righe("SELECT id, rapportino_id FROM file WHERE tipo = 'spesa' AND spesa_id = ?", s.id)) {
      if ((f.rapportino_id || null) !== voluto) this.aggiorna('file', f.id, { rapportino_id: voluto });
    }
  },

  /** togliSpesa {id, annulla?}: la spesa esce dagli elenchi e dai conti (anche da quello del rapportino); annulla la rimette. */
  togliSpesa(d) {
    const r = this.rigaSpesa(d.id);
    const annulla = si(d.annulla);
    if (annulla && !r.tolta) return this.spesaPerId(r.id);
    if (!annulla && r.tolta) return this.spesaPerId(r.id);
    // Fase 4: una spesa in una bozza o in una fattura non si toglie (la frase dice dove sta).
    const ferma = this.fraseSorgenteFerma('spesa', r.id);
    if (ferma) throw new Rifiuto(ferma);
    const b = this.speseBloccate(Object.assign({}, r, { tolta: null }));
    if (b.bloccata) throw new Rifiuto(b.soloCampi ? 'Il rapportino ' + r.rapportino_id + ' è già firmato: per togliere la spesa riportalo in bozza' : b.bloccata);
    this.aggiorna('spese', r.id, { tolta: annulla ? null : adesso(), modificato: adesso() });
    this.dopoCambioSpesa(r, r.id);
    return this.spesaPerId(r.id);
  },

  /** togliFotoSpesa {id}: la foto (id del file) va nel cestino, da cui si recupera. */
  togliFotoSpesa(d) {
    const f = this.db.riga("SELECT * FROM file WHERE id = ? AND tipo = 'spesa' AND spesa_id IS NOT NULL", testo(d.id));
    if (!f) throw new Rifiuto('Foto ' + testo(d.id) + ' non trovata');
    const s = this.rigaSpesa(f.spesa_id);
    if (!f.cestinato) {
      this.aggiorna('file', f.id, { cestinato: adesso() });
      this.aggiorna('spese', s.id, { modificato: adesso() });
    }
    return this.spesaPerId(s.id);
  },

  /** caricaFile {tipo: "spesa", idSpesa, base64, mime, nome?, idFile}: la foto dello scontrino. */
  caricaFotoSpesa(d, dati, mime, estensione) {
    const s = this.rigaSpesa(d.idSpesa);
    if (s.tolta) throw new Rifiuto('La spesa è stata tolta: rimettila prima di aggiungere la foto');
    const idClient = testo(d.idFile);
    const gia = idClient
      ? this.db.riga("SELECT * FROM file WHERE tipo = 'spesa' AND spesa_id = ? AND id_client = ? AND cestinato IS NULL", s.id, idClient) : null;
    if (gia) return { id: gia.id, url: urlFile(gia.id), nome: gia.nome };
    const f = this.salvaFile({
      dati, nome: testo(d.nome) || ('spesa ' + s.id + ' ' + (idClient || Date.now()) + estensione), mime, tipo: 'spesa',
      rapportinoId: s.rapportino_id && s.destinazione === 'cliente' ? s.rapportino_id : null, idClient, spesaId: s.id,
    });
    this.aggiorna('spese', s.id, { modificato: adesso() });
    if (s.rapportino_id) this.aggiorna('rapportini', s.rapportino_id, { modificato: adesso() });
    return { id: f.id, url: urlFile(f.id), nome: f.nome };
  },

  // ------------------------------------------------------------------ le spese del rapportino

  /**
   * Dopo salvaRapportino (anche dalle versioni vecchie, attraverso il ponte):
   * la colonna "spese" e' quella che l'app ha mandato, e le righe al cliente
   * del rapportino devono sommare a lei. Se non tornano si cambia la riga del
   * passo 3 (dal_rapportino): nasce se non c'e', si toglie se va a zero. Se le
   * spese del rapportino sono divise in piu' righe e il nuovo totale e' piu'
   * piccolo delle altre, non si indovina: errore (e il rapportino non si salva).
   */
  sincronizzaSpeseRapportino(idRapportino, opzioni) {
    const o = opzioni || {};
    const r = this.db.riga('SELECT * FROM rapportini WHERE id = ?', idRapportino);
    if (!r) return;
    const voluto = centesimi(numero(r.spese));
    const righe = this.db.righe('SELECT * FROM spese WHERE rapportino_id = ? AND tolta IS NULL ORDER BY id', r.id);
    const somma = centesimi(righe.filter(s => s.destinazione === 'cliente').reduce((t, s) => t + numero(s.importo), 0));
    const ora = adesso();
    if (voluto !== somma) {
      const delta = centesimi(voluto - somma);
      const passo3 = righe.filter(s => s.dal_rapportino === 1 && s.destinazione === 'cliente')[0];
      const divise = 'Le spese di ' + r.id + ' sono divise in più righe: cambiale da Spese e trasferte';
      if (passo3) {
        const nuovo = centesimi(numero(passo3.importo) + delta);
        if (nuovo < 0) throw new Rifiuto(divise);
        this.aggiorna('spese', passo3.id, nuovo === 0 ? { tolta: ora, modificato: ora } : { importo: nuovo, modificato: ora });
      } else if (delta > 0) {
        // Una riga del passo 3 tolta prima (spese portate a zero) torna, con le sue foto.
        const tolta = this.db.riga("SELECT * FROM spese WHERE rapportino_id = ? AND dal_rapportino = 1 AND destinazione = 'cliente' AND tolta IS NOT NULL ORDER BY id DESC LIMIT 1", r.id);
        if (tolta) this.aggiorna('spese', tolta.id, { tolta: null, importo: delta, modificato: ora });
        else {
          this.inserisci('spese', Object.assign({
            utente_id: r.utente_id, data: dataIso(r.data) || oggi(), importo: delta, categoria: 'altro',
            descrizione: testo(r.note_spese) || 'Spese del rapportino', commessa_id: testo(r.id_commessa), cliente_id: testo(r.id_cliente),
            rapportino_id: r.id, destinazione: 'cliente', anticipazione: 0, pagata_da_me: 0, dal_rapportino: 1, creato: ora, modificato: ora,
          }, this.statoSpesaDelRapportino(r)));
        }
      } else throw new Rifiuto(divise);
    }
    this.allineaSpeseRapportino(r.id, o);
  },

  /**
   * Le spese di un rapportino lo seguono: commessa, cliente, persona, stato di
   * approvazione, fatturate (quelle al cliente) se lui e' fatturato; la riga del
   * passo 3 anche data e descrizione (le note spese, se sono cambiate). Le foto
   * del rapportino senza spesa vanno alla riga del passo 3.
   */
  allineaSpeseRapportino(idRapportino, opzioni) {
    const o = opzioni || {};
    const r = this.db.riga('SELECT * FROM rapportini WHERE id = ?', idRapportino);
    if (!r) return;
    const fatturato = testo(r.stato).toUpperCase() === 'FATTURATO' ? testo(r.fatturato_il) : '';
    const stato = this.statoSpesaDelRapportino(r);
    // Fase 4: una spesa che sta in una fattura sua (riservata o fatturata) tiene la sua data di fatturazione.
    const conFattura = new Set(this.db.righe("SELECT sorgente_id FROM fattura_sorgenti WHERE tipo = 'spesa' AND attiva = 1").map(x => Number(x.sorgente_id)));
    const ora = adesso();
    let passo3 = null;
    for (const s of this.db.righe('SELECT * FROM spese WHERE rapportino_id = ? ORDER BY id', r.id)) {
      const v = Object.assign({ commessa_id: testo(r.id_commessa), cliente_id: testo(r.id_cliente) }, stato);
      if (r.utente_id !== null) v.utente_id = r.utente_id;
      v.fatturata_il = conFattura.has(s.id) ? s.fatturata_il : s.destinazione === 'cliente' ? fatturato : '';
      if (s.dal_rapportino === 1) {
        if (dataIso(r.data)) v.data = dataIso(r.data);
        if (o.noteCambiate) v.descrizione = testo(r.note_spese) || 'Spese del rapportino';
        if (!s.tolta && s.destinazione === 'cliente') passo3 = s;
      }
      if (Object.keys(v).some(k => diverso(s[k], v[k]))) this.aggiorna('spese', s.id, Object.assign(v, { modificato: ora }));
    }
    if (passo3) {
      for (const f of this.db.righe("SELECT id FROM file WHERE rapportino_id = ? AND tipo = 'spesa' AND spesa_id IS NULL", r.id)) {
        this.aggiorna('file', f.id, { spesa_id: passo3.id });
      }
    }
  },

  /**
   * Dopo che una spesa del rapportino e' cambiata (salvaSpesa, togliSpesa):
   * la colonna "spese" torna il totale delle sue righe al cliente e il totale
   * si rifa' coi pezzi congelati (compenso + rimborso km + spese, come
   * calcola()). Se il conto non cambia, il rapportino non si tocca. Se lo
   * cambia chi l'ha scritto e per lui serve l'approvazione, torna da approvare.
   */
  ricalcolaSpeseRapportino(idRapportino) {
    const r = this.db.riga('SELECT * FROM rapportini WHERE id = ?', idRapportino);
    if (!r) return;
    const somma = centesimi(this.db.righe("SELECT importo FROM spese WHERE rapportino_id = ? AND tolta IS NULL AND destinazione = 'cliente'", r.id)
      .reduce((t, s) => t + numero(s.importo), 0));
    if (centesimi(numero(r.spese)) === somma) return;
    const v = { spese: somma, totale: centesimi(numero(r.compenso_ore) + numero(r.rimborso_km) + somma), modificato: adesso() };
    Object.assign(v, this.approvazioneRapportinoDopo(r, r.utente_id, true));
    this.aggiorna('rapportini', r.id, v);
    this.allineaSpeseRapportino(r.id);
  },

  // ------------------------------------------------------------------ trasferte

  trasfertaDaRiga(r, a) {
    a = a || this.aiutiTrasferte([r]);
    const m = r.commessa_id ? a.commesse[String(r.commessa_id).toUpperCase()] : null;
    const conto = rimborsoTrasferta({ km: r.km, andataRitorno: r.andata_ritorno === 1, euroKm: r.euro_km, indennita: r.indennita });
    const bloccata = this.trasfertaBloccata(r);
    const spese = (a.spese[r.id] || []);
    const o = {
      id: r.id, idUtente: r.utente_id === null ? null : r.utente_id, utente: r.utente_id ? a.utenti[r.utente_id] || '' : '',
      dal: r.dal, al: r.al, giorni: giorniTra(r.dal, r.al), destinazione: r.destinazione, motivo: r.motivo,
      idCommessa: m ? m.id : r.commessa_id, commessa: m ? m.descrizione : '', idCliente: r.cliente_id,
      cliente: r.cliente_id ? a.clienti[r.cliente_id] || '' : '',
      km: numero(r.km), andataRitorno: r.andata_ritorno === 1, kmTotali: conto.kmTotali,
      idVeicolo: r.veicolo_id === null ? null : r.veicolo_id, veicolo: r.veicolo, euroKm: numeroONull(r.euro_km),
      rimborsoKm: conto.rimborsoKm, indennita: conto.indennita, totale: conto.totale,
      stato: r.stato, approvataDa: r.approvata_da === null ? null : r.approvata_da,
      approvataDaNome: r.approvata_da ? a.utenti[r.approvata_da] || '' : '', approvataIl: dataOraIso(r.approvata_il),
      motivoRifiuto: r.motivo_rifiuto, rimborsataIl: dataOraIso(r.rimborsata_il),
      spese, speseTotale: centesimi(spese.filter(s => s.stato !== 'respinta').reduce((t, s) => t + s.importo, 0)),
      tolta: dataOraIso(r.tolta),
      puoScrivere: this.livello('spese') >= 2 && this.vedeDi(r.utente_id) && !bloccata, bloccata,
      creato: dataOraIso(r.creato), modificato: dataOraIso(r.modificato),
    };
    return soldiPropri(o, ['euroKm', 'rimborsoKm', 'totale']);
  },

  /** Nomi e spese (non tolte) delle trasferte. */
  aiutiTrasferte(righe) {
    const a = this.nomiFase3();
    a.spese = {};
    const ids = righe.map(r => Number(r.id));
    if (ids.length) {
      const sp = this.db.righe('SELECT * FROM spese WHERE tolta IS NULL AND trasferta_id IN (' + ids.join(',') + ') ORDER BY data, id');
      const as = this.aiutiSpese(sp);
      for (const s of sp) (a.spese[s.trasferta_id] = a.spese[s.trasferta_id] || []).push(this.spesaDaRiga(s, as));
    }
    return a;
  },

  trasfertaPerId(id) {
    const r = this.db.riga('SELECT * FROM trasferte WHERE id = ?', id);
    return r ? this.trasfertaDaRiga(r) : null;
  },

  /** Le righe delle trasferte (non tolte) con i filtri; il periodo e' quello del giorno di partenza. */
  righeTrasferte(d, periodo) {
    d = d || {};
    const cond = ['x.tolta IS NULL'];
    const par = [];
    const p = this.condizioniComuni(d, cond, par, periodo === false ? null : 'dal');
    const righe = this.db.righe('SELECT x.* FROM trasferte x WHERE ' + cond.join(' AND ') + ' ORDER BY x.dal DESC, x.id DESC', ...par);
    return { righe, da: p.da || '', a: p.a || '' };
  },

  /** trasferte {da, a, utente, commessa, stato}: di base il mese di oggi. */
  leggiTrasferte(d) {
    const { righe, da, a } = this.righeTrasferte(d);
    const aiuti = this.aiutiTrasferte(righe);
    const trasferte = righe.map(r => this.trasfertaDaRiga(r, aiuti));
    const contano = trasferte.filter(t => t.stato !== 'respinta');
    const somma = (l, k) => centesimi(l.reduce((t, x) => t + x[k], 0));
    const totali = soldiPropri({
      quante: trasferte.length, km: Math.round(contano.reduce((t, x) => t + x.kmTotali, 0) * 100) / 100,
      rimborsoKm: somma(contano, 'rimborsoKm'), indennita: somma(contano, 'indennita'), totale: somma(contano, 'totale'),
      daRimborsare: somma(contano.filter(t => !t.rimborsataIl && t.stato !== 'bozza'), 'totale'),
    }, ['rimborsoKm', 'totale']);
    return { ok: true, da, a, trasferte, totali };
  },

  /**
   * salvaTrasferta {trasferta: {id?, idUtente?, dal, al?, destinazione, motivo?,
   * idCommessa?, idCliente?, km, andataRitorno?, idVeicolo?, indennita?,
   * bozza?}}. L'euro al km del veicolo si congela alla nascita (e quando si
   * cambia veicolo); l'indennita', se non c'e', e' INDENNITA_TRASFERTA per ogni
   * giorno.
   */
  salvaTrasferta(x) {
    x = x || {};
    const c = this.chi();
    const io = c.utente ? c.utente.id : null;
    const prima = testo(x.id) ? this.rigaTrasferta(x.id) : null;
    if (prima) {
      if (prima.tolta) throw new Rifiuto('La trasferta è stata tolta: rimettila prima di cambiarla');
      const b = this.trasfertaBloccata(prima);
      if (b) throw new Rifiuto(b);
    }
    let utente = prima ? prima.utente_id : io;
    if (x.idUtente !== undefined && testo(x.idUtente) !== '' && Number(x.idUtente) !== utente) {
      if (this.soloSuoi()) throw senzaPermesso('scrivere le trasferte degli altri');
      if (prima) throw new Rifiuto('La trasferta non cambia persona: toglila e scrivila per l\'altra persona');
      utente = Number(x.idUtente);
      if (!this.db.riga('SELECT id FROM utenti WHERE id = ?', utente)) throw new Rifiuto('Persona ' + utente + ' non trovata');
    }
    if (utente === null) throw new Rifiuto('Di chi è questa trasferta? Manca la persona');
    const dal = x.dal !== undefined && testo(x.dal) ? dataDaIso(x.dal) : prima ? prima.dal : oggi();
    const al = x.al !== undefined && testo(x.al) ? dataDaIso(x.al) : prima && prima.al >= dal ? prima.al : dal;
    if (al < dal) throw new Rifiuto('Al: non può venire prima della partenza');
    const destinazione = x.destinazione !== undefined ? testo(x.destinazione) : prima ? prima.destinazione : '';
    if (!destinazione) throw new Rifiuto('Destinazione: scrivi dove sei andato');
    const motivo = x.motivo !== undefined ? testo(x.motivo) : prima ? prima.motivo : '';
    const commessa = this.commessaPerCodice(x.idCommessa !== undefined ? x.idCommessa : prima ? prima.commessa_id : '');
    let idCliente = commessa ? commessa.idCliente : x.idCliente !== undefined ? testo(x.idCliente) : prima ? prima.cliente_id : '';
    if (idCliente && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', idCliente)) throw new Rifiuto('Cliente ' + idCliente + ' non trovato');
    const km = x.km !== undefined ? numero(x.km) : prima ? numero(prima.km) : 0;
    if (km < 0) throw new Rifiuto('Km: non possono essere negativi');
    const andataRitorno = x.andataRitorno !== undefined ? si(x.andataRitorno) : prima ? prima.andata_ritorno === 1 : false;
    // Il veicolo: quello scelto, o il primo attivo. Il suo euro al km si congela.
    let idVeicolo = x.idVeicolo !== undefined ? (testo(x.idVeicolo) ? Number(x.idVeicolo) : null) : prima ? prima.veicolo_id : undefined;
    if (idVeicolo === undefined) {
      const primo = this.db.riga('SELECT id FROM veicoli WHERE attivo = 1 ORDER BY id LIMIT 1');
      idVeicolo = primo ? primo.id : null;
    }
    let veicolo = null;
    if (idVeicolo !== null) {
      veicolo = this.db.riga('SELECT * FROM veicoli WHERE id = ?', idVeicolo);
      if (!veicolo) throw new Rifiuto('Veicolo ' + idVeicolo + ' non trovato');
    }
    if (km > 0 && !veicolo) throw new Rifiuto('Veicolo: scegli con quale veicolo, per il rimborso al km');
    const stessoVeicolo = prima && prima.veicolo_id === (veicolo ? veicolo.id : null);
    const euroKm = stessoVeicolo ? prima.euro_km : veicolo ? veicolo.euro_km : null;
    const nomeVeicolo = stessoVeicolo ? prima.veicolo : veicolo ? veicolo.nome : '';
    let indennita;
    if (x.indennita !== undefined && x.indennita !== null && testo(x.indennita) !== '') indennita = centesimi(numero(x.indennita));
    else if (prima && x.indennita === undefined) indennita = numero(prima.indennita);
    else {
      const perGiorno = numeroONull(this.leggiImpostazioni().INDENNITA_TRASFERTA);
      indennita = perGiorno ? centesimi(perGiorno * giorniTra(dal, al)) : 0;
    }
    if (indennita < 0) throw new Rifiuto('Indennità: non può essere negativa');
    const bozza = si(x.bozza);
    const v = {
      utente_id: utente, dal, al, destinazione, motivo, commessa_id: commessa ? commessa.id : '', cliente_id: idCliente, km,
      andata_ritorno: andataRitorno ? 1 : 0, veicolo_id: veicolo ? veicolo.id : null, veicolo: nomeVeicolo, euro_km: euroKm, indennita,
    };
    const cambiato = !prima || Object.keys(v).some(k => diverso(prima[k], v[k]));
    Object.assign(v, this.statoDopoSalvataggio(prima, utente, bozza, cambiato, 'motivo_rifiuto'));
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('trasferte', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('trasferte', Object.assign(v, { creato: ora, modificato: ora }));
    }
    return this.trasfertaPerId(id);
  },

  /** togliTrasferta {id, annulla?}. Con spese ancora sue non si toglie: prima si tolgono o si spostano quelle. */
  togliTrasferta(d) {
    const r = this.rigaTrasferta(d.id);
    const annulla = si(d.annulla);
    if (annulla === !r.tolta) return this.trasfertaPerId(r.id);
    const b = this.trasfertaBloccata(Object.assign({}, r, { tolta: null }));
    if (b) throw new Rifiuto(b);
    if (!annulla) {
      const n = this.db.riga('SELECT COUNT(*) n FROM spese WHERE trasferta_id = ? AND tolta IS NULL', r.id).n;
      if (n) throw new Rifiuto('La trasferta ha ' + (n === 1 ? '1 spesa' : n + ' spese') + ': prima toglile o spostale');
    }
    this.aggiorna('trasferte', r.id, { tolta: annulla ? null : adesso(), modificato: adesso() });
    return this.trasfertaPerId(r.id);
  },

  // ------------------------------------------------------------------ rimborsi

  /**
   * rimborsi {utente?}: cosa va restituito a chi (rimborsiDovuti in conti.js):
   * per ogni persona il totale, le voci, e quanto e' ancora da approvare. Un
   * collaboratore vede solo i suoi.
   */
  rimborsi(d) {
    d = d || {};
    const filtro = { utente: this.filtroUtente(d) === null ? undefined : this.filtroUtente(d) };
    const sp = this.righeSpese(Object.assign({}, filtro), false).righe.filter(s => s.pagata_da_me === 1);
    const tr = this.righeTrasferte(Object.assign({}, filtro), false).righe;
    const as = this.aiutiSpese(sp);
    const at = this.aiutiTrasferte(tr);
    const nomi = this.nomiFase3();
    const per = rimborsiDovuti(sp.map(s => this.spesaDaRiga(s, as)), tr.map(t => this.trasfertaDaRiga(t, at)));
    const persone = per.map(p => soldiPropri({
      idUtente: p.idUtente, nome: nomi.utenti[p.idUtente] || '', totale: p.totale, inAttesa: p.inAttesa,
      spese: p.spese, trasferte: p.trasferte, km: p.km,
      voci: p.voci.map(v => soldiPropri(v.tipo === 'spesa'
        ? { tipo: 'spesa', id: v.id, data: v.data, descrizione: v.descrizione || v.categoria, categoria: v.categoria, idCommessa: v.idCommessa, importo: v.importo, km: null }
        : { tipo: 'trasferta', id: v.id, data: v.dal, descrizione: v.destinazione, categoria: '', idCommessa: v.idCommessa, importo: v.totale, km: v.kmTotali },
      ['importo'])),
    }, ['totale'])).sort((x, y) => (x.nome < y.nome ? -1 : 1));
    const c = this.chi();
    return soldiPropri({
      ok: true, persone, totale: centesimi(persone.reduce((t, p) => t + p.totale, 0)),
      puoSegnare: this.puoSegnareRimborsi() && this.livello('spese') >= 2 && !!(c.utente || c.sistema),
    }, ['totale']);
  },

  puoSegnareRimborsi() {
    const c = this.chi();
    return !!c.sistema || (!!c.utente && (c.utente.ruolo === 'titolare' || c.utente.ruolo === 'amministrazione'));
  },

  /**
   * segnaRimborsato {voci: [{tipo: "spesa"|"trasferta", id}] | idUtente, annulla?}:
   * solo titolare e amministrazione. Con idUtente: tutto quello che e' dovuto a
   * quella persona. annulla: toglie il "rimborsato" (per l'Annulla dell'avviso).
   */
  segnaRimborsato(d) {
    if (!this.puoSegnareRimborsi()) throw senzaPermesso('segnare i rimborsi');
    const annulla = si(d.annulla);
    let voci = Array.isArray(d.voci) ? d.voci : [];
    if (!voci.length && testo(d.idUtente) && !annulla) {
      const p = this.rimborsi({ utente: Number(d.idUtente) }).persone[0];
      voci = p ? p.voci.map(v => ({ tipo: v.tipo, id: v.id })) : [];
      if (!voci.length) throw new Rifiuto('Non c\'è niente da rimborsare a questa persona');
    }
    if (!voci.length) throw new Rifiuto('Scegli cosa segnare come rimborsato');
    const ora = adesso();
    let fatte = 0;
    let totale = 0;
    for (const x of voci) {
      const tipo = testo(x && x.tipo);
      if (tipo !== 'spesa' && tipo !== 'trasferta') throw new Rifiuto('Tipo: spesa o trasferta');
      const tabella = tipo === 'spesa' ? 'spese' : 'trasferte';
      const r = this.db.riga('SELECT * FROM ' + tabella + ' WHERE id = ?', Number(x.id) || 0);
      if (!r || r.tolta) throw new Rifiuto((tipo === 'spesa' ? 'Spesa ' : 'Trasferta ') + testo(x.id) + ' non trovata');
      const importo = tipo === 'spesa' ? numero(r.importo)
        : rimborsoTrasferta({ km: r.km, andataRitorno: r.andata_ritorno === 1, euroKm: r.euro_km, indennita: r.indennita }).totale;
      if (annulla) {
        if (!r.rimborsata_il) continue;
        this.aggiorna(tabella, r.id, { rimborsata_il: '', modificato: ora });
      } else {
        if (r.rimborsata_il) continue;
        const nome = (tipo === 'spesa' ? 'La spesa ' : 'La trasferta ') + r.id;
        if (tipo === 'spesa' && !r.pagata_da_me) throw new Rifiuto(nome + ' non l\'ha pagata chi l\'ha scritta: non c\'è niente da rimborsare');
        if (tipo === 'spesa' && r.destinazione === 'personale') throw new Rifiuto(nome + ' è "Mia": non si rimborsa');
        if (r.stato !== 'approvata') throw new Rifiuto(nome + ' non è ancora approvata');
        this.aggiorna(tabella, r.id, { rimborsata_il: ora, modificato: ora });
      }
      fatte++;
      totale = centesimi(totale + importo);
    }
    return soldiPropri({ ok: true, fatte, totale }, ['totale']);
  },

  // ------------------------------------------------------------------ veicoli

  veicoloDaRiga(r, trasferte) {
    return soldiPropri({
      id: r.id, nome: r.nome, alimentazione: r.alimentazione, euroKm: numeroONull(r.euro_km), annoAci: r.anno_aci === null ? null : r.anno_aci,
      attivo: r.attivo === 1, trasferte: trasferte || 0, creato: dataOraIso(r.creato), modificato: dataOraIso(r.modificato),
    }, ['euroKm']);
  },

  /** veicoli {tutti?}: gli attivi (tutti = anche quelli non piu' in uso), con l'anno ACI e la pagina delle tabelle. */
  leggiVeicoli(d) {
    d = d || {};
    const n = {};
    this.db.righe('SELECT veicolo_id, COUNT(*) n FROM trasferte WHERE tolta IS NULL GROUP BY veicolo_id').forEach(r => { n[r.veicolo_id] = r.n; });
    const veicoli = this.db.righe('SELECT * FROM veicoli' + (si(d.tutti) ? '' : ' WHERE attivo = 1') + ' ORDER BY id').map(r => this.veicoloDaRiga(r, n[r.id]));
    return { ok: true, veicoli, aciAnno: Number(this.leggiImpostazioni().ACI_ANNO) || null, paginaAci: PAGINA_ACI };
  },

  /**
   * salvaVeicolo {veicolo: {id?, nome, alimentazione?, euroKm, annoAci?, attivo?}}
   * (amministrazione 2). Cambiare l'euro al km non riscrive le trasferte gia'
   * scritte. Un anno ACI piu' nuovo di ACI_ANNO lo aggiorna.
   */
  salvaVeicolo(x) {
    x = x || {};
    const prima = testo(x.id) ? this.db.riga('SELECT * FROM veicoli WHERE id = ?', Number(x.id) || 0) : null;
    if (testo(x.id) && !prima) throw new Rifiuto('Veicolo ' + testo(x.id) + ' non trovato');
    const nome = x.nome !== undefined ? testo(x.nome) : prima ? prima.nome : '';
    if (!nome) throw new Rifiuto('Nome: scrivi il nome del veicolo');
    const euroKm = x.euroKm !== undefined ? numeroONull(x.euroKm) : prima ? prima.euro_km : null;
    if (euroKm !== null && euroKm < 0) throw new Rifiuto('Euro al km: non può essere negativo');
    const imp = this.leggiImpostazioni();
    const anno = x.annoAci !== undefined ? numeroONull(x.annoAci) : prima ? prima.anno_aci : (Number(imp.ACI_ANNO) || Number(oggi().slice(0, 4)));
    if (anno !== null && !(anno >= 2000 && anno <= 2100 && Math.round(anno) === anno)) throw new Rifiuto('Anno ACI: scrivi l\'anno delle tabelle, per esempio 2026');
    const v = {
      nome, alimentazione: x.alimentazione !== undefined ? testo(x.alimentazione) : prima ? prima.alimentazione : '',
      euro_km: euroKm === null ? null : Math.round(euroKm * 10000) / 10000, anno_aci: anno,
      attivo: x.attivo !== undefined ? (si(x.attivo) ? 1 : 0) : prima ? prima.attivo : 1,
    };
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('veicoli', id, Object.assign(v, { modificato: ora }));
    } else id = this.inserisci('veicoli', Object.assign(v, { creato: ora, modificato: ora }));
    if (anno !== null && anno > (Number(imp.ACI_ANNO) || 0)) this.salvaImpostazioni({ ACI_ANNO: anno });
    const n = this.db.riga('SELECT COUNT(*) n FROM trasferte WHERE veicolo_id = ? AND tolta IS NULL', id).n;
    return this.veicoloDaRiga(this.db.riga('SELECT * FROM veicoli WHERE id = ?', id), n);
  },

  /** All'avvio: se non c'e' nessun veicolo, il primo e' l'auto delle impostazioni (AUTO, EURO_KM, ACI_ANNO). */
  preparaVeicoli() {
    if (this.db.riga('SELECT COUNT(*) n FROM veicoli').n) return;
    const imp = this.leggiImpostazioni();
    const ora = adesso();
    this.inserisci('veicoli', {
      nome: testo(imp.AUTO) || 'Auto dello studio', alimentazione: '', euro_km: numeroONull(imp.EURO_KM),
      anno_aci: Number(imp.ACI_ANNO) || Number(oggi().slice(0, 4)), attivo: 1, creato: ora, modificato: ora,
    });
  },

  /** Dopo l'importazione dal foglio: il primo veicolo prende AUTO ed EURO_KM del foglio (se non ha ancora trasferte). */
  allineaPrimoVeicolo() {
    const veicoli = this.db.righe('SELECT * FROM veicoli ORDER BY id');
    if (veicoli.length !== 1 || this.db.riga('SELECT COUNT(*) n FROM trasferte').n) return;
    const imp = this.leggiImpostazioni();
    this.aggiorna('veicoli', veicoli[0].id, { nome: testo(imp.AUTO) || veicoli[0].nome, euro_km: numeroONull(imp.EURO_KM), modificato: adesso() });
  },

  // ------------------------------------------------------------------ riepiloghi

  /**
   * riepilogoSpese {da, a, per: persona|commessa|categoria}: per gruppo quante
   * spese, quanto al cliente, allo studio, "Mia", anticipazioni, da rimborsare
   * e ancora da approvare; per persona e commessa anche le trasferte (km,
   * rimborso km, indennita'). totale = cliente + studio + trasferte (le "Mia"
   * sono della persona, non dello studio). Contano le mandate e le approvate.
   */
  riepilogoSpese(d) {
    d = d || {};
    const per = testo(d.per) || 'persona';
    if (['persona', 'commessa', 'categoria'].indexOf(per) < 0) throw new Rifiuto('Per: persona, commessa o categoria');
    const filtro = Object.assign({}, d);
    delete filtro.stato;
    const sp = this.righeSpese(filtro);
    const tr = per === 'categoria' ? { righe: [] } : this.righeTrasferte(filtro);
    const nomi = this.nomiFase3();
    const gruppi = {};
    const gruppo = (k, nome, extra) => gruppi[k] || (gruppi[k] = soldiPropri(Object.assign({
      chiave: k, nome, quante: 0, cliente: 0, studio: 0, personale: 0, anticipazioni: 0, daRimborsare: 0, inAttesa: 0,
      trasferte: 0, km: 0, rimborsoKm: 0, indennita: 0, totale: 0,
    }, extra || {}), ['rimborsoKm', 'totale', 'anticipazioni']));
    const chiDi = (idUtente) => gruppo(idUtente === null ? 'nessuno' : idUtente, idUtente ? nomi.utenti[idUtente] || '' : 'Senza persona');
    const diCommessa = id => {
      const m = id ? nomi.commesse[String(id).toUpperCase()] : null;
      // Il nome del cliente sta in nomeCliente: "cliente" e' la somma delle spese al cliente.
      return m ? gruppo(m.id, m.descrizione, { idCliente: m.idCliente, nomeCliente: nomi.clienti[m.idCliente] || '' })
        : gruppo('', 'Senza commessa', { idCliente: '', nomeCliente: '' });
    };
    for (const s of sp.righe) {
      if (!contaNeiConti(s)) continue;
      const g = per === 'persona' ? chiDi(s.utente_id) : per === 'commessa' ? diCommessa(s.commessa_id) : gruppo(s.categoria, s.categoria.charAt(0).toUpperCase() + s.categoria.slice(1));
      const e = numero(s.importo);
      g.quante++;
      g[s.destinazione] = centesimi(g[s.destinazione] + e);
      if (s.anticipazione) g.anticipazioni = centesimi(g.anticipazioni + e);
      if (s.pagata_da_me && s.destinazione !== 'personale' && !s.rimborsata_il) g.daRimborsare = centesimi(g.daRimborsare + e);
      if (s.stato === 'da_approvare') g.inAttesa = centesimi(g.inAttesa + e);
    }
    for (const t of tr.righe) {
      if (!contaNeiConti(t)) continue;
      const g = per === 'persona' ? chiDi(t.utente_id) : diCommessa(t.commessa_id);
      const conto = rimborsoTrasferta({ km: t.km, andataRitorno: t.andata_ritorno === 1, euroKm: t.euro_km, indennita: t.indennita });
      g.trasferte++;
      g.km = Math.round((g.km + conto.kmTotali) * 100) / 100;
      g.rimborsoKm = centesimi(g.rimborsoKm + conto.rimborsoKm);
      g.indennita = centesimi(g.indennita + conto.indennita);
      if (!t.rimborsata_il) g.daRimborsare = centesimi(g.daRimborsare + conto.totale);
      if (t.stato === 'da_approvare') g.inAttesa = centesimi(g.inAttesa + conto.totale);
    }
    const righe = Object.values(gruppi);
    righe.forEach(g => { g.totale = centesimi(g.cliente + g.studio + g.rimborsoKm + g.indennita); });
    righe.sort((x, y) => y.totale - x.totale || (String(x.nome) < String(y.nome) ? -1 : 1));
    const somma = k => (k === 'km' ? Math.round(righe.reduce((t, g) => t + g[k], 0) * 100) / 100 : centesimi(righe.reduce((t, g) => t + g[k], 0)));
    const totale = soldiPropri({
      quante: righe.reduce((t, g) => t + g.quante, 0), cliente: somma('cliente'), studio: somma('studio'), personale: somma('personale'),
      anticipazioni: somma('anticipazioni'), daRimborsare: somma('daRimborsare'), inAttesa: somma('inAttesa'),
      trasferte: righe.reduce((t, g) => t + g.trasferte, 0), km: somma('km'), rimborsoKm: somma('rimborsoKm'), indennita: somma('indennita'),
      totale: somma('totale'),
    }, ['rimborsoKm', 'totale', 'anticipazioni']);
    return { ok: true, da: sp.da, a: sp.a, per, righe, totale };
  },
};

Object.defineProperties(module.exports, {
  CATEGORIE: { value: CATEGORIE },
  DESTINAZIONI: { value: DESTINAZIONI },
  PAGINA_ACI: { value: PAGINA_ACI },
});
