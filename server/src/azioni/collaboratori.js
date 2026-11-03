/*
 * Collaboratori esterni (fase 6, accordo in docs/gestionale/fase6.md §3.10, §3.11, §8; risposte in architettura.md §17).
 *
 * Un collaboratore esterno e' un FORNITORE della fase 1 (soggetti, F...) con in piu' la sua scheda: niente seconda
 * anagrafica. Il suo costo vero e' la sua fattura (le fatture ricevute della fase 4, collegate all'incarico): le sue ore
 * hanno costo orario 0, il compenso pattuito serve al margine atteso. Mai due volte lo stesso costo.
 *
 * L'accesso a Wisper e' facoltativo, col ruolo "esterno" (utenti.soggetto_id): vede solo le commesse dei suoi incarichi,
 * i suoi rapportini, i suoi documenti e i suoi compensi (soldi suoi), mai i clienti, i conti e le persone dello studio.
 */
'use strict';

const { Rifiuto, senzaPermesso, testo, numero, numeroONull, centesimi, adesso, oggi, dataIso, dataDaIso, dataOraIso } = require('../utili');
const C = require('../conti');
const { soldiPropri } = require('../permessi');

const TIPI = ['impresa', 'professionista', 'occasionale'];
const NOMI_TIPO = { impresa: 'Impresa', professionista: 'Professionista', occasionale: 'Occasionale' };
const NOMI_STATO = { bozza: 'Bozza', affidato: 'Affidato', concluso: 'Concluso', annullato: 'Annullato' };
const NOMI_VALUTAZIONE = { bene: 'Bene', problemi: 'Con qualche problema', male: 'Male' };
/** I documenti che contano per l'idoneita': il tipo della scadenza del documento -> il nome. */
const NOMI_DOCUMENTO = { durc: 'DURC', visura: 'Visura', idoneita: 'Autocertificazione di idoneità', polizza: 'Polizza', albo: 'Iscrizione all\'albo' };
const TIPI_DOCUMENTO = ['durc', 'visura', 'idoneita', 'polizza', 'albo'];
const SOLDI_INCARICO = ['compenso', 'tariffa', 'tetto', 'conti', 'pattuito', 'maturato', 'fatturato', 'costo', 'daFatturare', 'daPagare', 'speseDaRiconoscere'];

const si = v => v === true || v === 1 || v === '1' || v === 'true';
const vuoto = v => v === undefined || v === null || v === '';
const dataBreve = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '');
const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');
const giorniTra = (da, a) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(da + 'T12:00:00')) / 86400000);

module.exports = {
  // ------------------------------------------------------------------ l'esterno: chi e', cosa vede

  /** Il fornitore (F...) di cui fa parte l'esterno che lavora, o null. */
  mioSoggetto() {
    const c = this.chi();
    if (!c.utente || c.utente.ruolo !== 'esterno') return null;
    const u = this.db.riga('SELECT soggetto_id FROM utenti WHERE id = ?', c.utente.id);
    return u && u.soggetto_id ? u.soggetto_id : null;
  },

  /** Le commesse dei suoi incarichi affidati o conclusi: le sole che un esterno vede. */
  commesseEsterno() {
    const s = this.mioSoggetto();
    if (!s) return new Set();
    return new Set(this.db.righe("SELECT DISTINCT commessa_id FROM incarichi WHERE soggetto_id = ? AND stato IN ('affidato', 'concluso')", s).map(r => String(r.commessa_id).toUpperCase()));
  },

  /** L'incarico affidato all'esterno su una commessa (o un errore): ore e rapportini si legano da soli. */
  incaricoDellEsterno(idCommessa) {
    const s = this.mioSoggetto();
    const id = testo(idCommessa);
    if (!id) throw new Rifiuto('Commessa: scegli la commessa del tuo incarico');
    const i = s ? this.db.riga("SELECT * FROM incarichi WHERE soggetto_id = ? AND commessa_id = ? COLLATE NOCASE AND stato = 'affidato' ORDER BY affidato_il DESC, id DESC LIMIT 1", s, id) : null;
    if (!i) throw new Rifiuto('Non hai un incarico su ' + id.toUpperCase() + ': chiedi allo studio');
    return i;
  },

  /** Un esterno vede questa commessa? (le altre "non le trova"). */
  controllaCommessaEsterno(idCommessa) {
    if (!this.eEsterno()) return;
    if (!this.commesseEsterno().has(String(idCommessa || '').toUpperCase())) throw new Rifiuto('Commessa ' + testo(idCommessa) + ' non trovata');
  },

  // ------------------------------------------------------------------ la scheda del collaboratore

  rigaCollaboratore(idSoggetto) {
    const id = testo(idSoggetto).toUpperCase();
    const c = this.db.riga('SELECT * FROM collaboratori WHERE soggetto_id = ?', id);
    if (!c) throw new Rifiuto('Collaboratore ' + id + ' non trovato');
    // L'esterno vede solo la sua scheda: gli altri "non ci sono".
    if (this.eEsterno() && this.mioSoggetto() !== c.soggetto_id) throw new Rifiuto('Collaboratore ' + id + ' non trovato');
    return c;
  },

  /** I documenti di un collaboratore (categoria Documenti dei collaboratori, col suo F...), con la loro scadenza. */
  documentiCollaboratore(idSoggetto) {
    const cat = this.categoriaDiSistema('Documenti dei collaboratori');
    if (!cat) return [];
    const righe = this.db.righe('SELECT * FROM documenti WHERE cliente_id = ? AND categoria_id = ? AND archiviato IS NULL ORDER BY data_documento DESC, id DESC', idSoggetto, cat.id);
    const out = [];
    for (const d of righe) {
      const s = d.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', d.scadenza_id) : null;
      const st = s ? this.statoScadenza(s) : null;
      out.push({
        id: d.id, titolo: d.titolo, tipoScadenza: s ? s.tipo : '', tipoNome: s && NOMI_DOCUMENTO[s.tipo] ? NOMI_DOCUMENTO[s.tipo] : 'Altro', data: d.data_documento,
        scade: s ? s.data : '', statoScadenza: s ? s.stato : '', statoVisto: s ? (s.stato === 'fatta' ? 'Sostituito' : st.statoVisto) : 'Non scade',
        idScadenza: s ? s.id : null, url: d.versione_valida_id ? '/file/' + (this.db.riga('SELECT file_id FROM documento_versioni WHERE id = ?', d.versione_valida_id) || {}).file_id : '',
      });
    }
    return out;
  },

  /**
   * L'idoneita' di un collaboratore (§3.10, §8.1), sempre con la parola: In regola, Manca qualcosa ("Manca il DURC"),
   * Documenti scaduti ("DURC scaduto il 12/10"). Quali documenti servono: COLLAB_DOCUMENTI per tipo. Un documento conta
   * se e' nella categoria Documenti dei collaboratori col tipo di scadenza giusto e non e' scaduto.
   */
  idoneitaDi(soggettoId, tipo) {
    const imp = this.leggiImpostazioni();
    let regole = imp.COLLAB_DOCUMENTI;
    if (typeof regole === 'string') { try { regole = JSON.parse(regole); } catch (e) { regole = {}; } }
    const servono = Array.isArray((regole || {})[tipo]) ? regole[tipo] : [];
    const docs = this.documentiCollaboratore(soggettoId);
    const t = oggi();
    const mancano = [];
    const scaduti = [];
    let prossima = null;
    for (const k of servono) {
      const suoi = docs.filter(d => d.tipoScadenza === k && d.statoScadenza !== 'annullata');
      const valido = suoi.find(d => d.statoScadenza === 'aperta' && d.scade >= t);
      if (valido) {
        const g = giorniTra(t, valido.scade);
        if (!prossima || valido.scade < prossima.data) prossima = { tipo: k, nome: NOMI_DOCUMENTO[k] || k, data: valido.scade, giorni: g };
        continue;
      }
      const scaduto = suoi.find(d => d.statoScadenza === 'aperta' && d.scade < t);
      if (scaduto) scaduti.push({ tipo: k, nome: NOMI_DOCUMENTO[k] || k, data: scaduto.scade });
      else mancano.push({ tipo: k, nome: NOMI_DOCUMENTO[k] || k });
    }
    let stato = 'in_regola';
    let parola = 'In regola';
    let frase = '';
    if (scaduti.length) {
      stato = 'scaduti';
      parola = 'Documenti scaduti';
      frase = scaduti.map(s => s.nome + ' scaduto il ' + dataBreve(s.data)).join(', ');
    } else if (mancano.length) {
      stato = 'manca';
      parola = 'Manca qualcosa';
      frase = 'Manca ' + mancano.map(m => (m.tipo === 'durc' ? 'il ' : m.tipo === 'idoneita' || m.tipo === 'visura' || m.tipo === 'polizza' ? 'la ' : 'l\'') + m.nome).join(', ');
    }
    return { stato, parola, frase, mancano, scaduti, prossima, servono };
  },

  /** I soldi di un incarico (conti.js contiIncarico): ore approvate, spese da riconoscere, ricevute collegate. */
  contiDellIncarico(i) {
    const ore = this.db.riga("SELECT SUM(ore) n FROM ore WHERE incarico_id = ? AND stato = 'approvata' AND tolta IS NULL", i.id).n || 0;
    const rap = this.db.riga("SELECT SUM(COALESCE(ore_lavoro, 0) + COALESCE(ore_extra, 0) + COALESCE(ore_viaggio, 0)) n FROM rapportini WHERE incarico_id = ? AND UPPER(stato) <> 'ANNULLATO' AND stato_approvazione IN ('approvato', '')", i.id).n || 0;
    const spese = this.db.riga("SELECT SUM(importo) n FROM spese WHERE incarico_id = ? AND pagata_da_me = 1 AND stato = 'approvata' AND tolta IS NULL", i.id).n || 0;
    const righe = this.db.righe("SELECT * FROM fatture_ricevute WHERE incarico_id = ? AND stato = 'attiva'", i.id);
    const a = righe.length ? this.aiutiRicevute(righe) : null;
    const ricevute = righe.map(r => ({ imponibile: r.imponibile, contributo: r.contributo, bollo: r.bollo, tipo: r.tipo_documento, daPagare: this.statoRicevuta(r, a).daPagare }));
    const k = C.contiIncarico({
      modo: i.modo, compenso: i.compenso, tariffa: i.tariffa, orePreviste: i.ore_previste, tetto: i.tetto, avanzamento: i.avanzamento,
      oreApprovate: Math.round((numero(ore) + numero(rap)) * 100) / 100, speseComprese: i.spese_comprese === 1, speseDaRiconoscere: centesimi(spese), ricevute,
    });
    k.oreApprovate = Math.round((numero(ore) + numero(rap)) * 100) / 100;
    k.speseDaRiconoscere = centesimi(spese);
    return k;
  },

  /** I soldi di un incarico si vedono con "costi"; all'esterno quelli dei suoi incarichi (soldi suoi). */
  soldiIncaricoVisibili(i) {
    if (this.vedeCosti()) return true;
    return this.eEsterno() && i.soggetto_id === this.mioSoggetto();
  },

  /** La riga dell'incarico (l'elenco). */
  incaricoInElenco(i, aiuti) {
    const a = aiuti || this.aiutiIncarichi();
    const m = a.commesse[String(i.commessa_id).toUpperCase()] || null;
    const o = {
      id: i.id, numero: i.numero, idSoggetto: i.soggetto_id, collaboratore: a.soggetti[i.soggetto_id] || '', idCommessa: m ? m.id : i.commessa_id,
      commessa: m ? m.descrizione : '', idCliente: m ? m.cliente_id : '', cliente: m && m.cliente_id ? a.soggetti[m.cliente_id] || '' : '',
      idPrestazione: i.prestazione_id, titolo: i.titolo, modo: i.modo, modoVisto: i.modo === 'ore' ? 'A ore' : 'A corpo', stato: i.stato, statoVisto: NOMI_STATO[i.stato],
      avanzamento: i.avanzamento, dal: i.dal, al: i.al, orePreviste: i.ore_previste, speseComprese: i.spese_comprese === 1,
      valutazione: i.valutazione, valutazioneVista: NOMI_VALUTAZIONE[i.valutazione] || '', daValutare: i.stato === 'concluso' && !i.valutazione,
      referenteId: i.referente_id, referente: i.referente_id ? a.persone[i.referente_id] || '' : '',
    };
    // Le valutazioni sono il giudizio dello studio: l'esterno non le vede (fase6.md §8.4: la sua scheda, i suoi incarichi e
    // i suoi compensi; il resto e' dello studio).
    if (this.eEsterno()) ['valutazione', 'valutazioneVista', 'daValutare'].forEach(k => { delete o[k]; });
    if (this.soldiIncaricoVisibili(i)) {
      o.compenso = i.compenso;
      o.tariffa = i.tariffa;
      o.tetto = i.tetto;
      o.conti = soldiPropri(this.contiDellIncarico(i), SOLDI_INCARICO);
      soldiPropri(o, SOLDI_INCARICO);
    }
    return o;
  },

  aiutiIncarichi() {
    const a = { soggetti: {}, commesse: {}, persone: {} };
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { a.soggetti[s.id] = s.nome; });
    this.db.righe('SELECT id, descrizione, cliente_id FROM commesse').forEach(m => { a.commesse[String(m.id).toUpperCase()] = m; });
    this.db.righe('SELECT id, nome FROM persone').forEach(p => { a.persone[p.id] = p.nome; });
    return a;
  },

  /** I numeri degli incarichi di un collaboratore e i suoi compensi (§8.1): dell'anno, piu' quelli di prima ancora da chiudere. */
  riassuntoIncarichi(idSoggetto) {
    const righe = this.db.righe("SELECT * FROM incarichi WHERE soggetto_id = ? AND stato <> 'annullato'", idSoggetto);
    const anno = oggi().slice(0, 4);
    const compensi = { pattuito: 0, maturato: 0, fatturato: 0, daFatturare: 0, daPagare: 0 };
    for (const i of righe) {
      const k = this.contiDellIncarico(i);
      const dellAnno = (i.affidato_il || i.creato || '').slice(0, 4) === anno;
      if (!dellAnno && !(k.daFatturare > 0) && !(k.daPagare > 0)) continue;
      for (const c of Object.keys(compensi)) compensi[c] = centesimi(compensi[c] + numero(k[c]));
    }
    const val = { bene: 0, problemi: 0, male: 0 };
    righe.forEach(i => { if (val[i.valutazione] !== undefined) val[i.valutazione]++; });
    return {
      incarichi: { inCorso: righe.filter(i => i.stato === 'affidato').length, bozze: righe.filter(i => i.stato === 'bozza').length,
        conclusi: righe.filter(i => i.stato === 'concluso').length, daValutare: righe.filter(i => i.stato === 'concluso' && !i.valutazione).length },
      compensi, valutazioni: val,
    };
  },

  collaboratoreInElenco(c) {
    const s = this.soggetto(c.soggetto_id) || {};
    const r = this.riassuntoIncarichi(c.soggetto_id);
    const idon = this.idoneitaDi(c.soggetto_id, c.tipo);
    const o = {
      idSoggetto: c.soggetto_id, nome: s.nome || '', tipo: c.tipo, tipoNome: NOMI_TIPO[c.tipo], mestiere: c.mestiere, attivo: c.attivo === 1,
      idoneita: { stato: idon.stato, parola: idon.parola, frase: idon.frase }, incarichiInCorso: r.incarichi.inCorso, valutazioni: r.valutazioni,
    };
    if (this.eEsterno()) delete o.valutazioni;
    if (this.vedeCosti() || (this.eEsterno() && this.mioSoggetto() === c.soggetto_id)) o.daFatturare = r.compensi.daFatturare;
    return o;
  },

  /** collaboratori {testo?, stato?: attivi|tutti, tipo?, idoneita?} (collaboratori 1; l'esterno solo il suo). */
  leggiCollaboratori(d) {
    d = d || {};
    let righe = this.db.righe('SELECT * FROM collaboratori ORDER BY soggetto_id');
    if (this.eEsterno()) righe = righe.filter(c => c.soggetto_id === this.mioSoggetto());
    if ((testo(d.stato) || 'attivi') === 'attivi') righe = righe.filter(c => c.attivo === 1);
    if (testo(d.tipo)) righe = righe.filter(c => c.tipo === testo(d.tipo));
    let lista = righe.map(c => this.collaboratoreInElenco(c));
    if (testo(d.idoneita)) lista = lista.filter(c => c.idoneita.stato === testo(d.idoneita));
    const cerca = testo(d.testo).toLowerCase();
    if (cerca) lista = lista.filter(c => [c.nome, c.mestiere, c.idSoggetto].some(x => String(x || '').toLowerCase().indexOf(cerca) >= 0));
    lista.sort((a, b) => (a.nome < b.nome ? -1 : 1));
    return { ok: true, collaboratori: lista };
  },

  /** collaboratore {id} (collaboratori 1; l'esterno solo il suo): la scheda (§8.1). */
  collaboratoreCompleto(c) {
    const s = this.soggetto(c.soggetto_id) || {};
    const r = this.riassuntoIncarichi(c.soggetto_id);
    const idon = this.idoneitaDi(c.soggetto_id, c.tipo);
    const suo = this.eEsterno() && this.mioSoggetto() === c.soggetto_id;
    const o = {
      idSoggetto: c.soggetto_id, nome: s.nome || '', tipo: c.tipo, tipoNome: NOMI_TIPO[c.tipo], mestiere: c.mestiere, abilitazioni: c.abilitazioni,
      referenteId: c.referente_id, referente: c.referente_id ? this.nomePersona(c.referente_id) : '', attivo: c.attivo === 1, note: c.note,
      partitaIva: s.partitaIva || '', codiceFiscale: s.codiceFiscale || '', telefono: s.telefono || '', email: s.email || '', pec: s.pec || '',
      indirizzo: s.indirizzo || '', cap: s.cap || '', citta: s.citta || '', provincia: s.provincia || '',
      idoneita: { stato: idon.stato, parola: idon.parola, frase: idon.frase, mancano: idon.mancano.map(m => m.nome), scaduti: idon.scaduti, prossima: idon.prossima, servono: idon.servono },
      documenti: this.documentiCollaboratore(c.soggetto_id),
      incarichi: r.incarichi, valutazioni: r.valutazioni,
      elencoIncarichi: this.db.righe('SELECT * FROM incarichi WHERE soggetto_id = ? ORDER BY (stato = \'annullato\'), creato DESC, id DESC', c.soggetto_id).map(i => this.incaricoInElenco(i)),
      accessi: suo ? [] : this.db.righe("SELECT * FROM utenti WHERE ruolo = 'esterno' AND soggetto_id = ? ORDER BY nome", c.soggetto_id).map(u => ({
        idUtente: u.id, nome: u.nome, email: u.email, ultimoAccesso: dataOraIso(u.ultimo_accesso), attivo: u.attivo === 1,
      })),
      programmaDurc: 'non collegato', comunicazioneIspettorato: c.tipo === 'occasionale' ? 'non collegato' : '',
      puoScrivere: this.livello('collaboratori') >= 2, puoAffidare: this.livello('collaboratori') >= 2 && this.vedeCosti(),
      puoCaricareDocumenti: this.livello('collaboratori') >= 2 || suo,
    };
    if (this.vedeCosti() || suo) {
      o.tariffa = c.tariffa;
      o.compensi = soldiPropri(r.compensi, ['pattuito', 'maturato', 'fatturato', 'daFatturare', 'daPagare']);
      soldiPropri(o, ['tariffa', 'compensi']);
    }
    // L'esterno vede la sua scheda, i documenti, gli incarichi e i compensi: non le note e le valutazioni dello studio.
    if (suo) {
      delete o.note;
      delete o.valutazioni;
      if (o.incarichi) delete o.incarichi.daValutare;
    }
    return o;
  },

  /**
   * salvaCollaboratore {collaboratore: {idSoggetto?, soggetto?: {...salvaSoggetto}, tipo, mestiere?, abilitazioni?,
   * tariffa?, referenteId?, attivo?, note?}} (collaboratori 2; la tariffa con costi 2). Senza idSoggetto crea il
   * fornitore (un doppione per nome o partita IVA torna quello che c'e', e diventa anche fornitore).
   */
  salvaCollaboratore(d) {
    const x = (d && d.collaboratore) || d || {};
    let idSoggetto = testo(x.idSoggetto).toUpperCase();
    let giaEsisteva = false;
    let prima = idSoggetto ? this.db.riga('SELECT * FROM collaboratori WHERE soggetto_id = ?', idSoggetto) : null;
    if (!idSoggetto) {
      const dati = Object.assign({}, x.soggetto || {}, { fornitore: true });
      if (dati.cliente === undefined) dati.cliente = false;
      const s = this.salvaSoggetto(dati);
      idSoggetto = s.id;
      giaEsisteva = !!s.giaEsisteva;
      if (giaEsisteva && !s.fornitore) this.aggiorna('soggetti', idSoggetto, { fornitore: 1, modificato: adesso() }, 'id', 'diventa fornitore: collaboratore esterno');
      prima = this.db.riga('SELECT * FROM collaboratori WHERE soggetto_id = ?', idSoggetto);
      if (prima) throw new Rifiuto(idSoggetto + ' è già un collaboratore');
    } else {
      const s = this.db.riga('SELECT * FROM soggetti WHERE id = ?', idSoggetto);
      if (!s) throw new Rifiuto('Fornitore ' + idSoggetto + ' non trovato');
      if (!s.fornitore) this.aggiorna('soggetti', idSoggetto, { fornitore: 1, modificato: adesso() }, 'id', 'diventa fornitore: collaboratore esterno');
      if (x.soggetto && typeof x.soggetto === 'object') this.salvaSoggetto(Object.assign({}, x.soggetto, { id: idSoggetto }));
    }
    const tipo = x.tipo !== undefined ? testo(x.tipo) : prima ? prima.tipo : '';
    if (TIPI.indexOf(tipo) < 0) throw new Rifiuto('Tipo: impresa, professionista o occasionale');
    if (x.tariffa !== undefined && !(prima && numeroONull(x.tariffa) === prima.tariffa) && this.livello('costi') < 2) throw senzaPermesso('scrivere la tariffa (serve il permesso dei soldi)');
    const tariffa = x.tariffa !== undefined ? numeroONull(x.tariffa) : prima ? prima.tariffa : null;
    if (tariffa !== null && tariffa < 0) throw new Rifiuto('Tariffa: non può essere negativa');
    const referente = x.referenteId !== undefined ? (vuoto(x.referenteId) ? null : Number(x.referenteId)) : prima ? prima.referente_id : null;
    if (referente !== null && !this.db.riga('SELECT id FROM persone WHERE id = ?', referente)) throw new Rifiuto('Persona ' + referente + ' non trovata');
    const v = {
      tipo, mestiere: x.mestiere !== undefined ? testo(x.mestiere) : prima ? prima.mestiere : '',
      abilitazioni: x.abilitazioni !== undefined ? testo(x.abilitazioni) : prima ? prima.abilitazioni : '',
      tariffa: tariffa === null ? null : centesimi(tariffa), referente_id: referente,
      attivo: x.attivo !== undefined ? (si(x.attivo) ? 1 : 0) : prima ? prima.attivo : 1, note: x.note !== undefined ? testo(x.note) : prima ? prima.note : '',
    };
    const ora = adesso();
    if (prima) this.aggiorna('collaboratori', idSoggetto, Object.assign(v, { modificato: ora }), 'soggetto_id');
    else this.inserisci('collaboratori', Object.assign({ soggetto_id: idSoggetto }, v, { creato: ora, modificato: ora }), 'soggetto_id', 'collaboratore esterno');
    return { ok: true, collaboratore: this.collaboratoreCompleto(this.rigaCollaboratore(idSoggetto)), giaEsisteva };
  },

  /** invitaEsterno {idSoggetto, nome, email} (amministrazione 2): un utente "esterno" del collaboratore, con la password iniziale. */
  async invitaEsterno(d) {
    const c = this.db.riga('SELECT * FROM collaboratori WHERE soggetto_id = ?', testo(d.idSoggetto).toUpperCase());
    if (!c) throw new Rifiuto('Collaboratore ' + testo(d.idSoggetto) + ' non trovato');
    return this.salvaUtente({ nome: d.nome, email: d.email, ruolo: 'esterno', idSoggetto: c.soggetto_id });
  },

  // ------------------------------------------------------------------ incarichi

  prossimoNumeroIncarico(anno) {
    return this.prossimoNumero('incarico', this.db.righe('SELECT numero FROM incarichi').map(r => r.numero), anno);
  },

  rigaIncarico(id) {
    const i = this.db.riga('SELECT * FROM incarichi WHERE id = ? OR numero = ?', Number(id) || 0, testo(id));
    if (!i) throw new Rifiuto('Incarico ' + testo(id) + ' non trovato');
    if (this.eEsterno() && (i.soggetto_id !== this.mioSoggetto() || ['affidato', 'concluso'].indexOf(i.stato) < 0)) throw new Rifiuto('Incarico ' + testo(id) + ' non trovato');
    return i;
  },

  /** incarichi {stato?: aperti|conclusi|tutti, idSoggetto?, idCommessa?, daValutare?} (collaboratori 1; l'esterno i suoi). */
  leggiIncarichi(d) {
    d = d || {};
    const cond = [];
    const par = [];
    const stato = testo(d.stato) || 'aperti';
    if (['aperti', 'conclusi', 'bozze', 'tutti'].indexOf(stato) < 0) throw new Rifiuto('Stato: aperti, bozze, conclusi o tutti');
    if (stato === 'aperti') cond.push("stato IN ('bozza', 'affidato')");
    else if (stato === 'conclusi') cond.push("stato = 'concluso'");
    else if (stato === 'bozze') cond.push("stato = 'bozza'");
    if (this.eEsterno()) { cond.push("soggetto_id = ? AND stato IN ('affidato', 'concluso')"); par.push(this.mioSoggetto() || '-'); }
    if (testo(d.idSoggetto)) { cond.push('soggetto_id = ?'); par.push(testo(d.idSoggetto).toUpperCase()); }
    if (testo(d.idCommessa)) { cond.push('commessa_id = ? COLLATE NOCASE'); par.push(testo(d.idCommessa)); }
    if (si(d.daValutare)) cond.push("stato = 'concluso' AND valutazione = ''");
    const righe = this.db.righe('SELECT * FROM incarichi' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') + ' ORDER BY creato DESC, id DESC', ...par);
    const a = this.aiutiIncarichi();
    return { ok: true, incarichi: righe.map(i => this.incaricoInElenco(i, a)) };
  },

  /** incarico {id} (collaboratori 1): la pagina (§10.4). */
  incaricoCompleto(i) {
    const o = this.incaricoInElenco(i);
    const c = this.db.riga('SELECT * FROM collaboratori WHERE soggetto_id = ?', i.soggetto_id);
    const idon = c ? this.idoneitaDi(i.soggetto_id, c.tipo) : null;
    const aOre = this.aiutiOre([]);
    const ore = this.db.righe('SELECT * FROM ore WHERE incarico_id = ? AND tolta IS NULL ORDER BY data, id', i.id);
    const aiutiR = this.aiutiRapportini();
    const rapportini = this.db.righe("SELECT * FROM rapportini WHERE incarico_id = ? AND UPPER(stato) <> 'ANNULLATO' ORDER BY data", i.id).map(r => this.rapportinoDaRiga(r, aiutiR));
    const spese = this.db.righe('SELECT * FROM spese WHERE incarico_id = ? AND tolta IS NULL ORDER BY data, id', i.id);
    const ricevute = this.soldiIncaricoVisibili(i) ? this.db.righe('SELECT * FROM fatture_ricevute WHERE incarico_id = ? ORDER BY data, id', i.id) : [];
    const aRic = ricevute.length ? this.aiutiRicevute(ricevute) : null;
    Object.assign(o, {
      descrizione: i.descrizione, affidatoIl: dataOraIso(i.affidato_il), conclusoIl: dataOraIso(i.concluso_il), annullatoIl: dataOraIso(i.annullato_il), motivo: i.motivo,
      valutazioneNota: this.eEsterno() ? undefined : i.valutazione_nota, valutataIl: this.eEsterno() ? undefined : dataOraIso(i.valutata_il), idDocumento: i.documento_id,
      tipoCollaboratore: c ? c.tipo : '', occasionale: !!c && c.tipo === 'occasionale',
      comunicazioneIspettorato: c && c.tipo === 'occasionale' ? 'non collegato' : '',
      idoneita: idon ? { stato: idon.stato, parola: idon.parola, frase: idon.frase } : null,
      ore: ore.map(r => this.oreDaRiga(r, aOre)), rapportini, spese: spese.map(s => this.spesaDaRiga(s)),
      ricevute: ricevute.map(r => {
        const x = this.ricevutaCompleta(r, aRic);
        return soldiPropri({ id: x.id, numero: x.numero, data: x.data, imponibile: x.imponibile, totale: x.totale, statoPagamento: x.statoVisto, daPagare: x.daPagare },
          ['imponibile', 'totale', 'daPagare']);
      }),
      documenti: this.documentiLegati('incarico_id', i.id),
      cronologia: this.db.righe("SELECT * FROM registro WHERE tabella = 'incarichi' AND id_riga = ? ORDER BY id", String(i.id))
        .map(r => ({ quando: dataOraIso(r.quando), chi: r.utente, testo: r.nota || (r.prima ? 'Cambiato' : 'Creato') })),
      collaboratoreHaAccesso: !!this.db.riga("SELECT id FROM utenti WHERE ruolo = 'esterno' AND soggetto_id = ? AND attivo = 1", i.soggetto_id),
      puoScrivere: this.livello('collaboratori') >= 2 && !this.eEsterno(),
    });
    return o;
  },

  /**
   * salvaIncarico {incarico: {id?, idSoggetto, idCommessa, idPrestazione?, titolo, descrizione?, modo, compenso?, tariffa?,
   * orePreviste?, tetto?, speseComprese?, dal?, al?, referenteId?, idDocumento?}} (collaboratori 2; i soldi con costi 2).
   * In bozza si cambia tutto; affidato: titolo, descrizione, date, referente, documento, ore previste (i soldi solo con
   * costi 2, con la nota nel registro).
   */
  salvaIncarico(d) {
    const x = (d && d.incarico) || d || {};
    const prima = testo(x.id) ? this.rigaIncarico(x.id) : null;
    if (prima && ['concluso', 'annullato'].indexOf(prima.stato) >= 0) throw new Rifiuto('L\'incarico è ' + NOMI_STATO[prima.stato].toLowerCase() + ': non si cambia');
    const affidato = prima && prima.stato === 'affidato';
    const idSoggetto = x.idSoggetto !== undefined ? testo(x.idSoggetto).toUpperCase() : prima ? prima.soggetto_id : '';
    const coll = idSoggetto ? this.db.riga('SELECT * FROM collaboratori WHERE soggetto_id = ?', idSoggetto) : null;
    if (!coll) throw new Rifiuto('Collaboratore ' + (idSoggetto || '') + ' non trovato');
    if (affidato && idSoggetto !== prima.soggetto_id) throw new Rifiuto('L\'incarico affidato non cambia collaboratore');
    const idCommessa = x.idCommessa !== undefined ? testo(x.idCommessa) : prima ? prima.commessa_id : '';
    if (!idCommessa) throw new Rifiuto('Commessa: scegli la commessa');
    const m = this.db.riga('SELECT id FROM commesse WHERE id = ? COLLATE NOCASE', idCommessa);
    if (!m) throw new Rifiuto('Commessa ' + idCommessa + ' non trovata');
    if (affidato && m.id.toUpperCase() !== String(prima.commessa_id).toUpperCase()) throw new Rifiuto('L\'incarico affidato non cambia commessa');
    const titolo = x.titolo !== undefined ? testo(x.titolo) : prima ? prima.titolo : '';
    if (!titolo) throw new Rifiuto('Titolo: scrivi cosa deve fare');
    const modo = x.modo !== undefined ? testo(x.modo) || 'corpo' : prima ? prima.modo : 'corpo';
    if (['corpo', 'ore'].indexOf(modo) < 0) throw new Rifiuto('Come si paga: corpo o ore');
    if (affidato && modo !== prima.modo) throw new Rifiuto('L\'incarico affidato non cambia come si paga');
    const soldi = {};
    const mandati = ['compenso', 'tariffa', 'tetto'].filter(k => x[k] !== undefined);
    for (const k of mandati) soldi[k] = numeroONull(x[k]);
    const cambiaSoldi = mandati.some(k => !prima || (prima[k] === null ? soldi[k] !== null : soldi[k] === null || centesimi(soldi[k]) !== centesimi(prima[k])));
    if (cambiaSoldi && this.livello('costi') < 2) throw senzaPermesso('scrivere i soldi degli incarichi');
    const compenso = soldi.compenso !== undefined ? soldi.compenso : prima ? prima.compenso : null;
    let tariffa = soldi.tariffa !== undefined ? soldi.tariffa : prima ? prima.tariffa : null;
    if (modo === 'ore' && tariffa === null && !prima) tariffa = coll.tariffa;
    const tetto = soldi.tetto !== undefined ? soldi.tetto : prima ? prima.tetto : null;
    if (modo === 'corpo' && !(numero(compenso) > 0)) throw new Rifiuto('Compenso: scrivi quanto');
    if (modo === 'ore' && !(numero(tariffa) > 0)) throw new Rifiuto('Tariffa: scrivi quanto all\'ora');
    const orePreviste = x.orePreviste !== undefined ? numeroONull(x.orePreviste) : prima ? prima.ore_previste : null;
    const referente = x.referenteId !== undefined ? (vuoto(x.referenteId) ? null : Number(x.referenteId)) : prima ? prima.referente_id : (coll.referente_id || this.miaPersonaId());
    if (referente !== null && !this.db.riga('SELECT id FROM persone WHERE id = ?', referente)) throw new Rifiuto('Persona ' + referente + ' non trovata');
    const idPrestazione = x.idPrestazione !== undefined ? (vuoto(x.idPrestazione) ? null : Number(x.idPrestazione)) : prima ? prima.prestazione_id : null;
    if (idPrestazione !== null && !this.db.riga('SELECT id FROM prestazioni WHERE id = ? AND commessa_id = ? COLLATE NOCASE', idPrestazione, m.id)) throw new Rifiuto('Prestazione ' + idPrestazione + ' non trovata in ' + m.id);
    const v = {
      soggetto_id: idSoggetto, commessa_id: m.id, prestazione_id: idPrestazione, titolo, descrizione: x.descrizione !== undefined ? testo(x.descrizione) : prima ? prima.descrizione : '',
      modo, compenso: modo === 'corpo' ? centesimi(numero(compenso)) : null, tariffa: modo === 'ore' ? centesimi(numero(tariffa)) : null,
      ore_previste: orePreviste, tetto: modo === 'ore' && tetto !== null && numero(tetto) > 0 ? centesimi(tetto) : null,
      spese_comprese: x.speseComprese !== undefined ? (si(x.speseComprese) ? 1 : 0) : prima ? prima.spese_comprese : 1,
      dal: x.dal !== undefined ? (testo(x.dal) ? dataDaIso(x.dal) : '') : prima ? prima.dal : '', al: x.al !== undefined ? (testo(x.al) ? dataDaIso(x.al) : '') : prima ? prima.al : '',
      referente_id: referente, documento_id: x.idDocumento !== undefined ? (vuoto(x.idDocumento) ? null : Number(x.idDocumento)) : prima ? prima.documento_id : null,
    };
    if (v.dal && v.al && v.al < v.dal) throw new Rifiuto('Al: non può venire prima di Dal');
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('incarichi', id, Object.assign(v, { modificato: ora }), 'id', affidato && cambiaSoldi ? 'soldi cambiati dopo l\'affidamento' : '');
    } else {
      const anno = Number(oggi().slice(0, 4));
      const n = this.prossimoNumeroIncarico(anno);
      id = this.inserisci('incarichi', Object.assign(v, { numero: n.codice, stato: 'bozza', avanzamento: 0, creato_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora }),
        'id', 'incarico in bozza');
      this.segnaNumero('incarico', n.numero);
    }
    return { ok: true, incarico: this.incaricoCompleto(this.db.riga('SELECT * FROM incarichi WHERE id = ?', id)) };
  },

  /** affidaIncarico {id, conferma?} (collaboratori 2 e costi 1): con l'idoneita' non in regola chiede conferma (blocco morbido). */
  affidaIncarico(d) {
    if (!this.vedeCosti()) throw senzaPermesso('affidare gli incarichi (serve il permesso dei soldi)');
    const i = this.rigaIncarico(d.id);
    if (i.stato === 'affidato') return { ok: true, incarico: this.incaricoCompleto(i) };
    if (i.stato !== 'bozza') throw new Rifiuto('Si affida solo un incarico in bozza');
    const c = this.db.riga('SELECT * FROM collaboratori WHERE soggetto_id = ?', i.soggetto_id);
    const idon = this.idoneitaDi(i.soggetto_id, c ? c.tipo : '');
    if (idon.stato !== 'in_regola' && !si(d.conferma)) {
      return { ok: false, serveConferma: true, errore: idon.frase + ': lo affido lo stesso?', idoneita: { stato: idon.stato, parola: idon.parola, frase: idon.frase } };
    }
    this.aggiorna('incarichi', i.id, { stato: 'affidato', affidato_il: adesso(), modificato: adesso() }, 'id',
      idon.stato === 'in_regola' ? 'incarico affidato' : 'incarico affidato con l\'idoneità non in regola: ' + idon.frase);
    return { ok: true, incarico: this.incaricoCompleto(this.rigaIncarico(i.id)) };
  },

  /** aggiornaAvanzamento {id, avanzamento} (collaboratori 2): solo a corpo, da 0 a 100. */
  aggiornaAvanzamento(d) {
    const i = this.rigaIncarico(d.id);
    if (i.stato !== 'affidato') throw new Rifiuto('L\'avanzamento si aggiorna su un incarico affidato');
    if (i.modo !== 'corpo') throw new Rifiuto('L\'avanzamento è degli incarichi a corpo: a ore contano le ore');
    const n = Math.round(numero(d.avanzamento));
    if (vuoto(d.avanzamento) || !(n >= 0 && n <= 100)) throw new Rifiuto('Avanzamento: da 0 a 100');
    this.aggiorna('incarichi', i.id, { avanzamento: n, modificato: adesso() }, 'id', 'avanzamento ' + n + '%');
    return { ok: true, incarico: this.incaricoCompleto(this.rigaIncarico(i.id)) };
  },

  /** concludiIncarico {id} (collaboratori 2): a corpo l'avanzamento va a 100. */
  concludiIncarico(d) {
    const i = this.rigaIncarico(d.id);
    if (i.stato === 'concluso') return { ok: true, incarico: this.incaricoCompleto(i) };
    if (i.stato !== 'affidato') throw new Rifiuto('Si conclude un incarico affidato');
    this.aggiorna('incarichi', i.id, Object.assign({ stato: 'concluso', concluso_il: adesso(), modificato: adesso() }, i.modo === 'corpo' ? { avanzamento: 100 } : {}), 'id', 'incarico concluso');
    return { ok: true, incarico: this.incaricoCompleto(this.rigaIncarico(i.id)) };
  },

  /** riapriIncarico {id, motivo} (collaboratori 2): un concluso torna affidato. */
  riapriIncarico(d) {
    const i = this.rigaIncarico(d.id);
    if (i.stato !== 'concluso') throw new Rifiuto('Si riapre un incarico concluso');
    const motivo = testo(d.motivo);
    if (!motivo) throw new Rifiuto('Scrivi il motivo');
    this.aggiorna('incarichi', i.id, { stato: 'affidato', concluso_il: '', motivo, modificato: adesso() }, 'id', 'riaperto: ' + motivo);
    return { ok: true, incarico: this.incaricoCompleto(this.rigaIncarico(i.id)) };
  },

  /** annullaIncarico {id, motivo} (collaboratori 2): non con fatture ricevute collegate. */
  annullaIncarico(d) {
    const i = this.rigaIncarico(d.id);
    if (i.stato === 'annullato') return { ok: true, incarico: this.incaricoCompleto(i) };
    if (['bozza', 'affidato'].indexOf(i.stato) < 0) throw new Rifiuto('Un incarico concluso non si annulla: riaprilo prima');
    const motivo = testo(d.motivo);
    if (!motivo) throw new Rifiuto('Scrivi il motivo');
    const r = this.db.riga("SELECT numero FROM fatture_ricevute WHERE incarico_id = ? AND stato = 'attiva' LIMIT 1", i.id);
    if (r) throw new Rifiuto('L\'incarico ha la fattura ' + r.numero + ': scollegala prima');
    this.aggiorna('incarichi', i.id, { stato: 'annullato', annullato_il: adesso(), motivo, modificato: adesso() }, 'id', 'annullato: ' + motivo);
    return { ok: true, incarico: this.incaricoCompleto(this.db.riga('SELECT * FROM incarichi WHERE id = ?', i.id)) };
  },

  /** valutaIncarico {id, valutazione: bene|problemi|male, nota?} (collaboratori 2): si cambia finche' si vuole. */
  valutaIncarico(d) {
    const i = this.rigaIncarico(d.id);
    if (i.stato !== 'concluso') throw new Rifiuto('Si valuta un incarico concluso');
    const v = testo(d.valutazione);
    if (!NOMI_VALUTAZIONE[v]) throw new Rifiuto('Valutazione: bene, problemi o male');
    this.aggiorna('incarichi', i.id, { valutazione: v, valutazione_nota: testo(d.nota), valutata_da: this.chi().utente ? this.chi().utente.id : null, valutata_il: adesso(), modificato: adesso() },
      'id', 'valutato: ' + NOMI_VALUTAZIONE[v].toLowerCase());
    return { ok: true, incarico: this.incaricoCompleto(this.rigaIncarico(i.id)) };
  },

  /** compensi {idSoggetto?, anno?} (collaboratori 1 e costi 1; l'esterno i suoi): per collaboratore i cinque numeri. */
  compensi(d) {
    d = d || {};
    if (!this.vedeCosti() && !this.eEsterno()) throw senzaPermesso('vedere i compensi (serve il permesso dei soldi)');
    const anno = testo(d.anno) || oggi().slice(0, 4);
    const cond = ["stato <> 'annullato'"];
    const par = [];
    if (this.eEsterno()) { cond.push("soggetto_id = ? AND stato IN ('affidato', 'concluso')"); par.push(this.mioSoggetto() || '-'); }
    if (testo(d.idSoggetto)) { cond.push('soggetto_id = ?'); par.push(testo(d.idSoggetto).toUpperCase()); }
    const per = {};
    const nomi = {};
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { nomi[s.id] = s.nome; });
    for (const i of this.db.righe('SELECT * FROM incarichi WHERE ' + cond.join(' AND '), ...par)) {
      const k = this.contiDellIncarico(i);
      const dellAnno = (i.affidato_il || i.creato || '').slice(0, 4) === anno;
      const aperto = anno === oggi().slice(0, 4) && (k.daFatturare > 0 || k.daPagare > 0);
      if (!dellAnno && !aperto) continue;
      const r = per[i.soggetto_id] || (per[i.soggetto_id] = { idSoggetto: i.soggetto_id, nome: nomi[i.soggetto_id] || '', pattuito: 0, maturato: 0, fatturato: 0, daFatturare: 0, daPagare: 0, incarichi: 0 });
      for (const c of ['pattuito', 'maturato', 'fatturato', 'daFatturare', 'daPagare']) r[c] = centesimi(r[c] + numero(k[c]));
      r.incarichi++;
    }
    const campi = ['pattuito', 'maturato', 'fatturato', 'daFatturare', 'daPagare'];
    const righe = Object.values(per).sort((a, b) => b.maturato - a.maturato || (a.nome < b.nome ? -1 : 1)).map(r => soldiPropri(r, campi));
    const totale = { pattuito: 0, maturato: 0, fatturato: 0, daFatturare: 0, daPagare: 0, incarichi: 0 };
    for (const r of righe) { for (const c of campi) totale[c] = centesimi(totale[c] + r[c]); totale.incarichi += r.incarichi; }
    return soldiPropri({ ok: true, anno: Number(anno), righe, totale: soldiPropri(totale, campi) }, ['totale']);
  },

  // ------------------------------------------------------------------ il costo della commessa (§8.6) e le fatture ricevute (§8.5)

  /**
   * Le parti nuove del costo della commessa: collaboratori (il costo, cioe' le fatture ricevute degli incarichi non
   * annullati), collaboratoriPrevisto (per gli stessi il piu' grande fra pattuito e fatturato), altreRicevute
   * (imponibile + cassa + bollo delle ricevute con la commessa, senza incarico e senza spesa: quelle sono gia' contate).
   */
  costoCollaboratoriCommessa(idCommessa) {
    let collaboratori = 0;
    let previsto = 0;
    for (const i of this.db.righe("SELECT * FROM incarichi WHERE commessa_id = ? COLLATE NOCASE AND stato <> 'annullato'", idCommessa)) {
      const k = this.contiDellIncarico(i);
      collaboratori += k.costo;
      previsto += Math.max(k.pattuito, k.fatturato);
    }
    let altre = 0;
    for (const r of this.db.righe("SELECT * FROM fatture_ricevute WHERE commessa_id = ? COLLATE NOCASE AND stato = 'attiva' AND incarico_id IS NULL AND spesa_id IS NULL", idCommessa)) {
      altre += (r.tipo_documento === 'TD04' ? -1 : 1) * (numero(r.imponibile) + numero(r.contributo) + numero(r.bollo));
    }
    return { collaboratori: centesimi(collaboratori), collaboratoriPrevisto: centesimi(previsto), altreRicevute: centesimi(altre) };
  },

  /** La proposta dell'incarico per una fattura ricevuta di un fornitore (§8.5): gli incarichi affidati o conclusi con da fatturare. */
  propostaIncarico(idFornitore) {
    if (!idFornitore) return [];
    return this.db.righe("SELECT * FROM incarichi WHERE soggetto_id = ? AND stato IN ('affidato', 'concluso') ORDER BY affidato_il, id", idFornitore)
      .map(i => ({ i, k: this.contiDellIncarico(i) })).filter(x => x.k.daFatturare > 0)
      .map(x => ({ idIncarico: x.i.id, numero: x.i.numero, idCommessa: x.i.commessa_id, titolo: x.i.titolo, daFatturare: x.k.daFatturare,
        frase: 'È dell\'incarico ' + x.i.numero + '? Restano da fatturare ' + C.euroIt(x.k.daFatturare) }));
  },

  /** Un incarico per una fattura ricevuta: deve essere dello stesso fornitore. Torna l'incarico (la ricevuta prende la sua commessa). */
  incaricoPerRicevuta(idIncarico, idFornitore) {
    const i = this.db.riga('SELECT * FROM incarichi WHERE id = ? OR numero = ?', Number(idIncarico) || 0, testo(idIncarico));
    if (!i) throw new Rifiuto('Incarico ' + testo(idIncarico) + ' non trovato');
    if (idFornitore && i.soggetto_id !== idFornitore) throw new Rifiuto('L\'incarico ' + i.numero + ' è di un altro collaboratore');
    if (i.stato === 'annullato') throw new Rifiuto('L\'incarico ' + i.numero + ' è annullato');
    return i;
  },

  /** I documenti dell'esterno in scadenza (per la sua Dashboard): il DURC che scade fra 7 giorni. */
  documentiInScadenzaDi(idSoggetto) {
    const out = [];
    for (const d of this.documentiCollaboratore(idSoggetto)) {
      if (d.statoScadenza !== 'aperta' || !d.scade) continue;
      const s = this.db.riga('SELECT * FROM scadenze WHERE id = ?', d.idScadenza);
      const g = giorniTra(oggi(), d.scade);
      if (g > (s ? s.preavviso_giorni : 30)) continue;
      out.push(Object.assign({}, d, { giorni: g }));
    }
    return out;
  },

  /** Il titolo proposto della scadenza di un documento di un collaboratore e quando scade (§4.5). */
  propostaScadenzaCollaboratore(tipo, data, idSoggetto) {
    const imp = this.leggiImpostazioni();
    const nome = (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', idSoggetto) || {}).nome || idSoggetto;
    const base = testo(data) || oggi();
    const titoli = { durc: 'DURC di ', visura: 'Visura camerale di ', idoneita: 'Autocertificazione di idoneità di ', polizza: 'Polizza di ', albo: 'Iscrizione all\'albo di ' };
    let scade;
    if (tipo === 'durc') scade = C.giorniDopo(base, Math.round(numero(imp.DURC_GIORNI)) || 120);
    else if (tipo === 'visura') scade = C.piuMesi(base, Math.round(numero(imp.VISURA_MESI)) || 6);
    else scade = C.piuMesi(base, 12);
    return { titolo: (titoli[tipo] || '') + nome, data: scade, preavvisoGiorni: tipo === 'durc' || tipo === 'visura' ? 15 : 30 };
  },
};

Object.defineProperties(module.exports, {
  NOMI_TIPO_COLLABORATORE: { value: NOMI_TIPO },
  NOMI_STATO_INCARICO: { value: NOMI_STATO },
  NOMI_VALUTAZIONE: { value: NOMI_VALUTAZIONE },
  NOMI_DOCUMENTO_COLLABORATORE: { value: NOMI_DOCUMENTO },
  TIPI_DOCUMENTO_COLLABORATORE: { value: TIPI_DOCUMENTO },
});
