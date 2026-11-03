/*
 * Mezzi e attrezzature (fase 6, accordo in docs/gestionale/fase6.md §3.7-3.9, §7; risposte in architettura.md §17):
 * la scheda del mezzo (i veicoli della fase 3: dello studio o auto di una persona), km e tagliando, guasti e
 * manutenzioni, i costi del mezzo; il catalogo di attrezzature, strumenti di misura e DPI con le tarature;
 * assegnazioni e prestiti; gli strumenti usati negli interventi.
 *
 * Regole che non si scavalcano:
 *  - lo stato della taratura c'e' sempre con la parola; uno strumento NON CONFORME non si usa mai; uno SCADUTO si usa
 *    solo confermando (la conferma resta scritta), o non si sceglie se TARATURA_BLOCCO = "blocco";
 *  - il server non rifiuta mai un rapportino per uno strumento (la coda del telefono si fermerebbe): segna lo stato
 *    vero di quel giorno e la Dashboard lo dice;
 *  - il costo di un guasto o di una manutenzione e' la spesa o la fattura ricevuta collegata: mai un importo qui.
 */
'use strict';

const { Rifiuto, senzaPermesso, testo, numero, numeroONull, centesimi, adesso, oggi, dataIso, dataDaIso, dataOraIso, piuGiorni } = require('../utili');
const C = require('../conti');
const { soldiPropri } = require('../permessi');

const TIPI_MEZZO = ['auto', 'furgone', 'moto', 'altro'];
const CATEGORIE = ['strumento', 'attrezzo', 'informatica', 'dpi', 'altro'];
const NOMI_CATEGORIA = { strumento: 'Strumenti di misura', attrezzo: 'Attrezzi', informatica: 'Informatica', dpi: 'DPI', altro: 'Altro' };
const PROPRIETA_ATT = ['studio', 'noleggio', 'persona', 'cliente'];
const TIPI_MANUTENZIONE = ['guasto', 'manutenzione', 'tagliando', 'revisione', 'riparazione', 'gomme', 'altro'];
const TIPI_ASSEGNAZIONE = ['assegnato', 'prestito', 'laboratorio', 'riparazione'];
const ESITI = ['conforme', 'regolato', 'non_conforme'];
const SCADENZE_MEZZO = {
  assicurazione: { titolo: 'Assicurazione', ogni: 12, dallaFatta: 0, fineMese: 0 },
  bollo: { titolo: 'Bollo', ogni: 12, dallaFatta: 0, fineMese: 0 },
  revisione: { titolo: 'Revisione', ogni: 24, dallaFatta: 1, fineMese: 1 },
  tagliando: { titolo: 'Tagliando', ogni: null, dallaFatta: 1, fineMese: 0 },
};

const si = v => v === true || v === 1 || v === '1' || v === 'true';
const vuoto = v => v === undefined || v === null || v === '';
const dataBreve = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '');
const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');
const kmIt = n => String(Math.round(numero(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const giorniTra = (da, a) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(da + 'T12:00:00')) / 86400000);
const urlFile = id => '/file/' + id;

module.exports = {
  // ------------------------------------------------------------------ chi ha cosa

  titoloMezzo(v) {
    return (testo(v.nome) + ' ' + testo(v.targa)).trim();
  },

  /** L'assegnazione in corso di un mezzo o di un'attrezzatura (o null). */
  assegnazioneInCorso(campo, id) {
    return this.db.riga('SELECT * FROM assegnazioni WHERE ' + campo + ' = ? AND al IS NULL', id);
  },

  /** Il "chi" di un'assegnazione: persona, commessa o fornitore, col nome pronto. */
  chiDiAssegnazione(x) {
    if (!x) return null;
    let nome = '';
    if (x.persona_id) nome = this.nomePersona(x.persona_id);
    else if (x.soggetto_id) nome = (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', x.soggetto_id) || {}).nome || x.soggetto_id;
    else if (x.commessa_id) nome = 'commessa ' + x.commessa_id;
    return {
      idAssegnazione: x.id, tipo: x.tipo, idPersona: x.persona_id, idCommessa: x.commessa_id || '', idSoggetto: x.soggetto_id || '', nome,
      dal: dataIso(x.dal), rientro: x.rientro,
    };
  },

  /** Ce l'ho io: assegnato o in prestito alla mia persona (o l'auto e' mia). */
  eMio(campo, riga) {
    const mia = this.miaPersonaId();
    if (mia === null) return false;
    if (campo === 'veicolo_id' && riga.proprieta === 'persona' && riga.persona_id === mia) return true;
    const x = this.assegnazioneInCorso(campo, riga.id);
    return !!x && x.persona_id === mia && (x.tipo === 'assegnato' || x.tipo === 'prestito');
  },

  // ------------------------------------------------------------------ mezzi

  /** Le scadenze aperte di un mezzo (assicurazione, bollo, revisione, tagliando...). */
  scadenzeMezzo(idVeicolo) {
    return this.db.righe("SELECT * FROM scadenze WHERE veicolo_id = ? AND stato = 'aperta' ORDER BY data, id", idVeicolo);
  },

  /**
   * Lo stato di un mezzo (§7.1): Fermo (guasto con fermo, assicurazione o revisione scadute) > In officina >
   * In prestito / Assegnato > Disponibile. L'auto di una persona: "Auto di {nome}" (o Fermo).
   */
  statoMezzo(v) {
    if (v.dismesso_il) return { stato: 'dismesso', statoVisto: 'Dismesso', fermo: false, motivo: '', chi: null };
    const t = oggi();
    const guasto = this.db.riga("SELECT * FROM manutenzioni WHERE veicolo_id = ? AND stato <> 'chiusa' AND fermo = 1 ORDER BY data DESC LIMIT 1", v.id);
    const scadute = this.scadenzeMezzo(v.id).filter(s => (s.tipo === 'assicurazione' || s.tipo === 'revisione') && s.data < t);
    let motivo = '';
    if (guasto) motivo = guasto.titolo;
    else if (scadute.length) motivo = scadute.map(s => (s.tipo === 'assicurazione' ? 'assicurazione' : 'revisione') + ' scaduta').join(', ');
    const x = this.assegnazioneInCorso('veicolo_id', v.id);
    const chi = this.chiDiAssegnazione(x);
    if (motivo) return { stato: 'fermo', statoVisto: 'Fermo', fermo: true, motivo, chi, frase: 'Non si usa: ' + motivo };
    if (v.proprieta === 'persona') {
      const nome = v.persona_id ? this.nomePersona(v.persona_id) : '';
      return { stato: 'persona', statoVisto: nome ? 'Auto di ' + nome : 'Auto di una persona', fermo: false, motivo: '', chi: v.persona_id ? { idPersona: v.persona_id, nome, tipo: 'sua' } : null };
    }
    const officina = this.db.riga("SELECT * FROM manutenzioni WHERE veicolo_id = ? AND stato = 'in_officina' LIMIT 1", v.id);
    if (officina || (x && (x.tipo === 'riparazione' || x.tipo === 'laboratorio'))) return { stato: 'officina', statoVisto: 'In officina', fermo: false, motivo: '', chi };
    if (x && x.tipo === 'prestito') return { stato: 'prestito', statoVisto: 'In prestito a ' + chi.nome + (x.rientro ? ' fino al ' + dataBreve(x.rientro) : ''), fermo: false, motivo: '', chi };
    if (x) return { stato: 'assegnato', statoVisto: 'Assegnato a ' + chi.nome, fermo: false, motivo: '', chi };
    return { stato: 'disponibile', statoVisto: 'Disponibile', fermo: false, motivo: '', chi: null };
  },

  mezzoInElenco(v) {
    const st = this.statoMezzo(v);
    const prossima = this.scadenzeMezzo(v.id)[0] || null;
    const ps = prossima ? this.statoScadenza(prossima) : null;
    const o = {
      id: v.id, nome: v.nome, targa: v.targa, titolo: this.titoloMezzo(v), tipo: v.tipo, proprieta: v.proprieta,
      proprietaVista: v.proprieta === 'studio' ? 'Dello studio' : st.statoVisto.indexOf('Auto di') === 0 ? st.statoVisto : 'Auto di una persona',
      idPersona: v.persona_id, statoVisto: st.statoVisto, stato: st.stato, motivoFermo: st.motivo, chi: st.chi,
      km: v.km, kmIl: v.km_il, kmAlTagliando: C.kmAlTagliando({ tagliandoKm: v.tagliando_km, tagliandoUltimoKm: v.tagliando_ultimo_km, km: v.km }),
      prossimaScadenza: prossima ? { id: prossima.id, tipo: prossima.tipo, data: prossima.data, statoVisto: ps.statoVisto } : null,
      guastiAperti: this.db.riga("SELECT COUNT(*) n FROM manutenzioni WHERE veicolo_id = ? AND tipo = 'guasto' AND stato <> 'chiusa'", v.id).n,
      fermo: st.fermo, mio: this.eMio('veicolo_id', v), attivo: v.attivo === 1 && !v.dismesso_il,
      // Il rimborso al km dell'auto di una persona (tabella ACI): soldi della persona, come i veicoli della fase 3.
      euroKm: v.proprieta === 'persona' ? numeroONull(v.euro_km) : null,
    };
    return soldiPropri(o, ['euroKm']);
  },

  rigaMezzo(id) {
    const v = this.db.riga('SELECT * FROM veicoli WHERE id = ?', Number(id) || 0);
    if (!v) throw new Rifiuto('Mezzo ' + testo(id) + ' non trovato');
    return v;
  },

  /** mezzi {tutti?} (mezzi 1): gli attivi (tutti = anche i dismessi), prima quelli che ho io. */
  leggiMezzi(d) {
    d = d || {};
    const righe = this.db.righe('SELECT * FROM veicoli' + (si(d.tutti) ? '' : " WHERE dismesso_il = '' AND attivo = 1") + ' ORDER BY id');
    const mezzi = righe.map(v => this.mezzoInElenco(v)).sort((a, b) => (b.mio ? 1 : 0) - (a.mio ? 1 : 0) || a.id - b.id);
    return {
      ok: true, mezzi,
      conteggi: { mezzi: mezzi.length, fermi: mezzi.filter(m => m.fermo).length, guastiAperti: mezzi.reduce((t, m) => t + m.guastiAperti, 0),
        scadenzeVicine: mezzi.filter(m => m.prossimaScadenza && /^Scad/.test(m.prossimaScadenza.statoVisto)).length },
    };
  },

  manutenzioneDaRiga(m, foto) {
    const f = foto || this.db.righe("SELECT id FROM file WHERE manutenzione_id = ? AND tipo = 'guasto' AND cestinato IS NULL ORDER BY creato, rowid", m.id).map(x => ({ id: x.id, url: urlFile(x.id) }));
    const chi = m.segnalata_da ? this.nomeUtente(m.segnalata_da) : '';
    const strumento = !!m.attrezzatura_id;
    return {
      id: m.id, idLocale: m.id_locale || '', idVeicolo: m.veicolo_id, idAttrezzatura: m.attrezzatura_id, tipo: m.tipo, stato: m.stato,
      statoVisto: m.stato === 'chiusa' ? 'Risolto' : m.stato === 'in_officina' ? (strumento ? 'In riparazione' : 'In officina') : 'Segnalato',
      fermo: m.fermo === 1, data: m.data, km: m.km, titolo: m.titolo, descrizione: m.descrizione, idFornitore: m.fornitore_id,
      fornitore: m.fornitore_id ? (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', m.fornitore_id) || {}).nome || '' : '',
      idSpesa: m.spesa_id, idRicevuta: m.ricevuta_id, chiusaIl: m.chiusa_il, esito: m.esito, segnalataDa: m.segnalata_da, segnalataDaNome: chi,
      foto: f, creato: dataOraIso(m.creato),
    };
  },

  letturaDaRiga(l) {
    return {
      id: l.id, idLocale: l.id_locale || '', idVeicolo: l.veicolo_id, data: l.data, km: l.km, origine: l.origine, idUtente: l.utente_id,
      utente: l.utente_id ? this.nomeUtente(l.utente_id) : '', foto: l.foto_file_id ? { id: l.foto_file_id, url: urlFile(l.foto_file_id) } : null, nota: l.nota,
    };
  },

  assegnazioneDaRiga(x) {
    const chi = this.chiDiAssegnazione(x);
    const oggetto = x.veicolo_id ? this.db.riga('SELECT * FROM veicoli WHERE id = ?', x.veicolo_id) : this.db.riga('SELECT * FROM attrezzature WHERE id = ?', x.attrezzatura_id);
    const inRitardo = !x.al && !!x.rientro && x.rientro < oggi();
    return {
      id: x.id, idLocale: x.id_locale || '', idVeicolo: x.veicolo_id, idAttrezzatura: x.attrezzatura_id,
      oggetto: oggetto ? (x.veicolo_id ? this.titoloMezzo(oggetto) : oggetto.nome + ' ' + oggetto.codice) : '',
      tipo: x.tipo, tipoVisto: { assegnato: 'Assegnato', prestito: 'In prestito', laboratorio: 'In taratura', riparazione: 'In riparazione' }[x.tipo],
      idPersona: x.persona_id, idCommessa: x.commessa_id || '', idSoggetto: x.soggetto_id || '', chi: chi ? chi.nome : '',
      dal: dataIso(x.dal), rientro: x.rientro, al: x.al ? dataIso(x.al) : '', inCorso: !x.al, inRitardo,
      firmata: !!x.firma_file_id, firma: x.firma_file_id ? { id: x.firma_file_id, url: urlFile(x.firma_file_id) } : null, nota: x.nota,
      frase: x.al ? 'dal ' + dataIt(dataIso(x.dal)) + ' al ' + dataIt(dataIso(x.al)) + ' a ' + (chi ? chi.nome : '') : '',
    };
  },

  /** mezzo {id} (mezzi 1): la scheda (§10.3). */
  mezzoCompleto(v) {
    const o = this.mezzoInElenco(v);
    const a = this.aiutiScadenze();
    const anno = oggi().slice(0, 4);
    const tr = this.db.riga("SELECT COUNT(*) n, SUM(km * (CASE WHEN andata_ritorno = 1 THEN 2 ELSE 1 END)) km FROM trasferte WHERE veicolo_id = ? AND tolta IS NULL AND substr(dal, 1, 4) = ?", v.id, anno);
    const manut = this.db.righe("SELECT * FROM manutenzioni WHERE veicolo_id = ? ORDER BY (stato = 'chiusa'), data DESC, id DESC", v.id);
    const aperte = manut.filter(m => m.stato !== 'chiusa');
    const chiuse = manut.filter(m => m.stato === 'chiusa').slice(0, 10);
    const mio = o.mio;
    Object.assign(o, {
      immatricolazione: v.immatricolazione, alimentazione: v.alimentazione, annoAci: v.proprieta === 'persona' ? v.anno_aci : null,
      tagliandoKm: v.tagliando_km, tagliandoUltimoKm: v.tagliando_ultimo_km, tagliandoOgniMesi: v.tagliando_ogni_mesi, note: v.note,
      dismessoIl: v.dismesso_il, dismessoMotivo: v.dismesso_motivo,
      scadenze: this.db.righe('SELECT * FROM scadenze WHERE veicolo_id = ? AND stato = \'aperta\' ORDER BY data', v.id).map(s => this.scadenzaDaRiga(s, a)),
      letture: this.db.righe('SELECT * FROM mezzo_letture WHERE veicolo_id = ? ORDER BY data DESC, id DESC LIMIT 10', v.id).map(l => this.letturaDaRiga(l)),
      manutenzioni: aperte.concat(chiuse).map(m => this.manutenzioneDaRiga(m)),
      assegnazioni: this.db.righe('SELECT * FROM assegnazioni WHERE veicolo_id = ? ORDER BY dal DESC, id DESC', v.id).map(x => this.assegnazioneDaRiga(x)),
      documenti: this.documentiLegati('veicolo_id', v.id),
      trasferte: { quante: tr.n || 0, km: Math.round(numero(tr.km) * 100) / 100 },
      puoScrivere: this.livello('mezzi') >= 2, puoSegnareKm: this.livello('mezzi') >= 2 || mio,
      puoPrendere: this.livello('mezzi') >= 1 && v.proprieta === 'studio' && o.stato === 'disponibile' && this.miaPersonaId() !== null,
      mezzoDelloStudio: v.proprieta === 'studio',
    });
    if (this.vedeCosti()) o.costi = this.costiDelMezzo(v, Number(anno));
    return o;
  },

  /** I documenti dell'archivio legati a un mezzo o a un'attrezzatura, che chi chiede vede. */
  documentiLegati(campo, id) {
    const righe = this.db.righe('SELECT * FROM documenti WHERE ' + campo + ' = ? AND archiviato IS NULL ORDER BY modificato DESC, id DESC', id).filter(x => this.vedeDocumento(x));
    if (!righe.length) return [];
    const a = this.aiutiDocumenti(righe);
    return righe.map(x => this.documentoDaRiga(x, a));
  },

  /** Una scadenza di un mezzo (una aperta per tipo): la crea o la sposta. */
  scadenzaMezzo(v, tipo, data) {
    const p = SCADENZE_MEZZO[tipo];
    const aperta = this.db.riga("SELECT * FROM scadenze WHERE veicolo_id = ? AND tipo = ? AND stato = 'aperta' ORDER BY data LIMIT 1", v.id, tipo);
    const ora = adesso();
    const titolo = p.titolo + ' ' + this.titoloMezzo(v);
    if (!data) {
      if (aperta) this.aggiorna('scadenze', aperta.id, { stato: 'annullata', motivo: 'tolta dalla scheda del mezzo', modificato: ora });
      return null;
    }
    const ogni = tipo === 'tagliando' ? (v.tagliando_ogni_mesi || null) : p.ogni;
    if (aperta) {
      this.aggiorna('scadenze', aperta.id, { data, titolo, ogni_mesi: ogni, modificato: ora });
      return aperta.id;
    }
    return this.inserisci('scadenze', {
      titolo, tipo, veicolo_id: v.id, data, preavviso_giorni: 30, ogni_mesi: ogni, dalla_fatta: p.dallaFatta, fine_mese: p.fineMese,
      azione: 'promemoria', stato: 'aperta', creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
    });
  },

  /** I campi della fase 6 di un mezzo (salvaMezzo, e salvaVeicolo della fase 3 che accetta gli stessi). */
  campiMezzo(x, prima) {
    const p = prima || {};
    const v = {};
    if (x.targa !== undefined) {
      const t = testo(x.targa).toUpperCase().replace(/[\s-]/g, '');
      if (t && !/^[A-Z0-9]{2,10}$/.test(t)) throw new Rifiuto('Targa: lettere e cifre, senza spazi');
      v.targa = t;
    }
    if (x.tipo !== undefined) {
      v.tipo = testo(x.tipo) || 'auto';
      if (TIPI_MEZZO.indexOf(v.tipo) < 0) throw new Rifiuto('Tipo: auto, furgone, moto o altro');
    }
    if (x.proprieta !== undefined) {
      v.proprieta = testo(x.proprieta) || 'persona';
      if (['persona', 'studio'].indexOf(v.proprieta) < 0) throw new Rifiuto('Di chi è: persona o studio');
    }
    const proprieta = v.proprieta || p.proprieta || 'persona';
    if (x.idPersona !== undefined) {
      v.persona_id = vuoto(x.idPersona) ? null : Number(x.idPersona);
      if (v.persona_id !== null && !this.db.riga('SELECT id FROM persone WHERE id = ?', v.persona_id)) throw new Rifiuto('Persona ' + v.persona_id + ' non trovata');
    }
    if (proprieta === 'studio') v.persona_id = null;
    // Una persona nuova come proprieta' "persona", o un mezzo che lo diventa: di chi e'?
    if (proprieta === 'persona' && v.proprieta === 'persona' && p.proprieta !== 'persona' && (v.persona_id === undefined ? !p.persona_id : v.persona_id === null)) {
      throw new Rifiuto('Di chi è: scegli la persona');
    }
    if (x.immatricolazione !== undefined) v.immatricolazione = testo(x.immatricolazione) ? dataDaIso(x.immatricolazione) : '';
    for (const [k, col] of [['tagliandoKm', 'tagliando_km'], ['tagliandoUltimoKm', 'tagliando_ultimo_km'], ['tagliandoOgniMesi', 'tagliando_ogni_mesi']]) {
      if (x[k] === undefined) continue;
      v[col] = vuoto(x[k]) ? null : Math.round(numero(x[k]));
      if (v[col] !== null && v[col] < 0) throw new Rifiuto('Tagliando: i numeri non possono essere negativi');
    }
    if (v.tagliando_ogni_mesi !== undefined && v.tagliando_ogni_mesi !== null && !(v.tagliando_ogni_mesi >= 1 && v.tagliando_ogni_mesi <= 120)) throw new Rifiuto('Ogni: da 1 a 120 mesi');
    if (x.note !== undefined) v.note = testo(x.note);
    return v;
  },

  /** Le date delle scadenze mandate con il mezzo (e la revisione proposta da sola per un mezzo dello studio). */
  scadenzeDaMezzo(id, x) {
    const v = this.db.riga('SELECT * FROM veicoli WHERE id = ?', id);
    const s = x.scadenze && typeof x.scadenze === 'object' ? x.scadenze : {};
    for (const tipo of Object.keys(SCADENZE_MEZZO)) {
      if (s[tipo] === undefined) continue;
      this.scadenzaMezzo(v, tipo, testo(s[tipo]) ? dataDaIso(s[tipo]) : '');
    }
    // La revisione si propone da sola: fine mese dell'immatricolazione + 4 anni (solo per i mezzi dello studio).
    if (v.proprieta === 'studio' && v.immatricolazione && s.revisione === undefined &&
      !this.db.riga("SELECT id FROM scadenze WHERE veicolo_id = ? AND tipo = 'revisione'", v.id)) {
      this.scadenzaMezzo(v, 'revisione', C.scadenzaRevisione(v.immatricolazione, ''));
    }
    // Il titolo delle scadenze segue nome e targa.
    for (const sc of this.scadenzeMezzo(v.id)) {
      const t = (SCADENZE_MEZZO[sc.tipo] ? SCADENZE_MEZZO[sc.tipo].titolo + ' ' : '') + this.titoloMezzo(v);
      if (SCADENZE_MEZZO[sc.tipo] && sc.titolo !== t) this.aggiorna('scadenze', sc.id, { titolo: t });
    }
  },

  /**
   * salvaMezzo {mezzo: {id?, nome, targa?, tipo?, proprieta?, idPersona?, immatricolazione?, alimentazione?, euroKm?,
   * annoAci?, tagliandoKm?, tagliandoUltimoKm?, tagliandoOgniMesi?, note?, scadenze?: {assicurazione, bollo, revisione,
   * tagliando}}} (mezzi 2). Con "studio" l'euro al km si ignora (null): un mezzo dello studio non da' rimborso km.
   */
  salvaMezzo(d) {
    const x = (d && d.mezzo) || d || {};
    const prima = testo(x.id) ? this.rigaMezzo(x.id) : null;
    const nome = x.nome !== undefined ? testo(x.nome) : prima ? prima.nome : '';
    if (!nome) throw new Rifiuto('Nome: scrivi il nome del mezzo');
    const v = Object.assign({ nome }, this.campiMezzo(x, prima));
    const proprieta = v.proprieta || (prima ? prima.proprieta : 'persona');
    if (!prima && !x.proprieta) v.proprieta = 'persona';
    if (x.alimentazione !== undefined) v.alimentazione = testo(x.alimentazione);
    if (x.euroKm !== undefined || proprieta === 'studio') {
      const e = proprieta === 'studio' ? null : numeroONull(x.euroKm);
      if (e !== null && e < 0) throw new Rifiuto('Euro al km: non può essere negativo');
      v.euro_km = e === null ? null : Math.round(e * 10000) / 10000;
    }
    if (x.annoAci !== undefined) {
      const anno = numeroONull(x.annoAci);
      if (anno !== null && !(anno >= 2000 && anno <= 2100)) throw new Rifiuto('Anno ACI: scrivi l\'anno delle tabelle, per esempio 2026');
      v.anno_aci = anno;
    }
    if (!prima && !v.persona_id && v.proprieta === 'persona' && x.idPersona === undefined && x.proprieta === 'persona') throw new Rifiuto('Di chi è: scegli la persona');
    const ora = adesso();
    let id;
    if (prima) {
      if (prima.dismesso_il) throw new Rifiuto('Il mezzo è dismesso: non si cambia');
      id = prima.id;
      this.aggiorna('veicoli', id, Object.assign(v, { modificato: ora }));
    } else {
      const imp = this.leggiImpostazioni();
      id = this.inserisci('veicoli', Object.assign({ alimentazione: '', anno_aci: Number(imp.ACI_ANNO) || Number(oggi().slice(0, 4)), attivo: 1 }, v, { creato: ora, modificato: ora }));
    }
    this.scadenzeDaMezzo(id, x);
    return { ok: true, mezzo: this.mezzoCompleto(this.rigaMezzo(id)) };
  },

  /** dismettiMezzo {id, motivo} (mezzi 2): esce dagli elenchi (le trasferte restano). */
  dismettiMezzo(d) {
    const v = this.rigaMezzo(d.id);
    const motivo = testo(d.motivo);
    if (!motivo) throw new Rifiuto('Motivo: scrivi perché lo dismetti');
    if (v.dismesso_il) return { ok: true, mezzo: this.mezzoCompleto(v) };
    const ora = adesso();
    this.aggiorna('veicoli', v.id, { dismesso_il: oggi(), dismesso_motivo: motivo, attivo: 0, modificato: ora }, 'id', 'dismesso: ' + motivo);
    const x = this.assegnazioneInCorso('veicolo_id', v.id);
    if (x) this.aggiorna('assegnazioni', x.id, { al: ora }, 'id', 'restituito: mezzo dismesso');
    for (const s of this.scadenzeMezzo(v.id)) this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo: 'mezzo dismesso', modificato: ora });
    return { ok: true, mezzo: this.mezzoCompleto(this.rigaMezzo(v.id)) };
  },

  // ------------------------------------------------------------------ km e tagliando

  /** La lettura piu' recente aggiorna km e km_il del mezzo. */
  aggiornaKmMezzo(idVeicolo) {
    const l = this.db.riga('SELECT * FROM mezzo_letture WHERE veicolo_id = ? ORDER BY data DESC, km DESC, id DESC LIMIT 1', idVeicolo);
    const v = this.db.riga('SELECT km, km_il FROM veicoli WHERE id = ?', idVeicolo);
    if (l && (v.km !== l.km || v.km_il !== l.data)) this.aggiorna('veicoli', idVeicolo, { km: l.km, km_il: l.data });
  },

  /** Una lettura dei km con i controlli (§7.2): non meno dell'ultima di un giorno uguale o prima; salto grande con conferma. */
  scriviLettura({ v, km, data, origine, idLocale, nota, spesaId, manutenzioneId, conferma, idFile }) {
    const k = Math.round(numero(km));
    if (!(k >= 0) || vuoto(km)) throw new Rifiuto('Km: scrivi i km del contachilometri');
    const prima = this.db.riga('SELECT * FROM mezzo_letture WHERE veicolo_id = ? AND data <= ? ORDER BY data DESC, km DESC, id DESC LIMIT 1', v.id, data);
    if (prima && k < prima.km) throw new Rifiuto('Km: l\'ultima lettura era ' + kmIt(prima.km) + ' il ' + dataBreve(prima.data));
    if (prima && !conferma && k - prima.km > 5000 && giorniTra(prima.data, data) < 7) {
      const g = Math.max(giorniTra(prima.data, data), 1);
      throw new Rifiuto('Sono ' + kmIt(k - prima.km) + ' km in ' + (g === 1 ? '1 giorno' : g + ' giorni') + ': è giusto?', { serveConferma: true });
    }
    const c = this.chi();
    const id = this.inserisci('mezzo_letture', {
      id_locale: idLocale || null, veicolo_id: v.id, data, km: k, utente_id: c.utente ? c.utente.id : null, origine: origine || 'mano',
      nota: testo(nota), spesa_id: spesaId || null, manutenzione_id: manutenzioneId || null, creato: adesso(),
    }, 'id', 'km ' + kmIt(k));
    if (testo(idFile)) this.legaFotoKm(id, idFile);
    this.aggiornaKmMezzo(v.id);
    return id;
  },

  legaFotoKm(idLettura, idFile) {
    const f = this.db.riga("SELECT * FROM file WHERE id = ? AND cestinato IS NULL", testo(idFile));
    if (!f) return;
    if (f.tipo === 'caricato') this.aggiorna('file', f.id, { tipo: 'km', lettura_id: idLettura });
    if (f.tipo === 'km' || f.tipo === 'caricato') this.aggiorna('mezzo_letture', idLettura, { foto_file_id: f.id });
  },

  /**
   * segnaKm {idVeicolo, km, data?, idLocale?, idFile?, conferma?} (mezzi 1 se ce l'ho io, 2 sempre) -> {lettura, mezzo}.
   * Ripetuta con lo stesso idLocale: la stessa.
   */
  segnaKm(d) {
    if (testo(d.idLocale)) {
      const gia = this.db.riga('SELECT * FROM mezzo_letture WHERE id_locale = ?', testo(d.idLocale));
      if (gia) return { ok: true, lettura: this.letturaDaRiga(gia), mezzo: this.mezzoInElenco(this.rigaMezzo(gia.veicolo_id)), giaArrivata: true };
    }
    const v = this.rigaMezzo(d.idVeicolo);
    if (this.livello('mezzi') < 2 && !this.eMio('veicolo_id', v)) throw senzaPermesso('segnare i km dei mezzi che non hai');
    if (v.dismesso_il) throw new Rifiuto('Il mezzo è dismesso');
    const data = testo(d.data) ? dataDaIso(d.data) : oggi();
    if (data > oggi()) throw new Rifiuto('Data: non può essere nel futuro');
    const id = this.scriviLettura({ v, km: d.km, data, origine: 'mano', idLocale: testo(d.idLocale), nota: d.nota, conferma: si(d.conferma), idFile: d.idFile });
    return { ok: true, lettura: this.letturaDaRiga(this.db.riga('SELECT * FROM mezzo_letture WHERE id = ?', id)), mezzo: this.mezzoInElenco(this.rigaMezzo(v.id)) };
  },

  // ------------------------------------------------------------------ guasti e manutenzioni

  /** Il mezzo o l'attrezzatura di una manutenzione (uno solo). */
  oggettoManutenzione(x) {
    const hasV = !vuoto(x.idVeicolo);
    const hasA = !vuoto(x.idAttrezzatura);
    if (hasV === hasA) throw new Rifiuto('Scegli il mezzo o lo strumento');
    if (hasV) return { campo: 'veicolo_id', riga: this.rigaMezzo(x.idVeicolo) };
    return { campo: 'attrezzatura_id', riga: this.rigaAttrezzatura(x.idAttrezzatura) };
  },

  /**
   * segnalaGuasto {guasto: {idVeicolo | idAttrezzatura, titolo, descrizione?, fermo?, km?, idLocale?}} (mezzi 1 se ce
   * l'ho io, 2 sempre): nasce una manutenzione "guasto" aperta; con fermo il mezzo o lo strumento non si propone.
   */
  segnalaGuasto(d) {
    const x = (d && d.guasto) || d || {};
    if (testo(x.idLocale)) {
      const gia = this.db.riga('SELECT * FROM manutenzioni WHERE id_locale = ?', testo(x.idLocale));
      if (gia) return { ok: true, manutenzione: this.manutenzioneDaRiga(gia), giaArrivata: true };
    }
    const o = this.oggettoManutenzione(x);
    if (this.livello('mezzi') < 2 && !this.eMio(o.campo, o.riga)) throw senzaPermesso('segnalare guasti delle cose che non hai');
    const titolo = testo(x.titolo);
    if (!titolo) throw new Rifiuto('Scrivi in poche parole cosa succede');
    const ora = adesso();
    const km = vuoto(x.km) ? null : Math.round(numero(x.km));
    const id = this.inserisci('manutenzioni', {
      id_locale: testo(x.idLocale) || null, [o.campo]: o.riga.id, tipo: 'guasto', stato: 'aperta', fermo: si(x.fermo) ? 1 : 0, data: testo(x.data) ? dataDaIso(x.data) : oggi(),
      km, titolo, descrizione: testo(x.descrizione), segnalata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
    }, 'id', 'guasto segnalato');
    // I km scritti nel guasto sono una lettura del contachilometri (se non vanno indietro).
    if (o.campo === 'veicolo_id' && km !== null) {
      const ultima = this.db.riga('SELECT km FROM mezzo_letture WHERE veicolo_id = ? ORDER BY data DESC, km DESC LIMIT 1', o.riga.id);
      if (!ultima || km >= ultima.km) this.scriviLettura({ v: o.riga, km, data: oggi(), origine: 'manutenzione', manutenzioneId: id, conferma: true });
    }
    return { ok: true, manutenzione: this.manutenzioneDaRiga(this.db.riga('SELECT * FROM manutenzioni WHERE id = ?', id)) };
  },

  /**
   * salvaManutenzione {manutenzione: {id?, idVeicolo | idAttrezzatura, tipo, stato?, fermo?, data?, km?, titolo,
   * descrizione?, idFornitore?, idSpesa?, idRicevuta?, esito?}} (mezzi 2). Il costo e' la spesa o la fattura ricevuta.
   */
  salvaManutenzione(d) {
    const x = (d && d.manutenzione) || d || {};
    const prima = testo(x.id) ? this.db.riga('SELECT * FROM manutenzioni WHERE id = ?', Number(x.id) || 0) : null;
    if (testo(x.id) && !prima) throw new Rifiuto('Manutenzione ' + testo(x.id) + ' non trovata');
    const o = prima ? (prima.veicolo_id ? { campo: 'veicolo_id', riga: this.rigaMezzo(prima.veicolo_id) } : { campo: 'attrezzatura_id', riga: this.rigaAttrezzatura(prima.attrezzatura_id) })
      : this.oggettoManutenzione(x);
    const tipo = x.tipo !== undefined ? testo(x.tipo) || 'manutenzione' : prima ? prima.tipo : 'manutenzione';
    if (TIPI_MANUTENZIONE.indexOf(tipo) < 0) throw new Rifiuto('Tipo: guasto, manutenzione, tagliando, revisione, riparazione, gomme o altro');
    const stato = x.stato !== undefined ? testo(x.stato) || 'aperta' : prima ? prima.stato : 'aperta';
    if (['aperta', 'in_officina', 'chiusa'].indexOf(stato) < 0) throw new Rifiuto('Stato: aperta, in_officina o chiusa');
    const titolo = x.titolo !== undefined ? testo(x.titolo) : prima ? prima.titolo : '';
    if (!titolo) throw new Rifiuto('Titolo: scrivi cosa si fa');
    const v = {
      [o.campo]: o.riga.id, tipo, stato: stato === 'chiusa' && (!prima || prima.stato !== 'chiusa') ? (prima ? prima.stato : 'aperta') : stato,
      fermo: x.fermo !== undefined ? (si(x.fermo) ? 1 : 0) : prima ? prima.fermo : 0, data: x.data !== undefined && testo(x.data) ? dataDaIso(x.data) : prima ? prima.data : oggi(),
      km: x.km !== undefined ? (vuoto(x.km) ? null : Math.round(numero(x.km))) : prima ? prima.km : null, titolo,
      descrizione: x.descrizione !== undefined ? testo(x.descrizione) : prima ? prima.descrizione : '',
      fornitore_id: x.idFornitore !== undefined ? testo(x.idFornitore) : prima ? prima.fornitore_id : '',
      esito: x.esito !== undefined ? testo(x.esito) : prima ? prima.esito : '',
    };
    if (v.fornitore_id && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', v.fornitore_id)) throw new Rifiuto('Fornitore ' + v.fornitore_id + ' non trovato');
    Object.assign(v, this.costoManutenzione(x, prima));
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('manutenzioni', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('manutenzioni', Object.assign(v, { segnalata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora }));
    }
    if (stato === 'chiusa' && (!prima || prima.stato !== 'chiusa')) return this.chiudiManutenzione({ id, esito: v.esito, km: v.km, data: x.dataChiusura });
    return { ok: true, manutenzione: this.manutenzioneDaRiga(this.db.riga('SELECT * FROM manutenzioni WHERE id = ?', id)) };
  },

  /** idSpesa | idRicevuta di una manutenzione (uno solo dei due): il suo costo, mai scritto qui. */
  costoManutenzione(x, prima) {
    const v = {};
    if (x.idSpesa !== undefined) {
      v.spesa_id = vuoto(x.idSpesa) ? null : Number(x.idSpesa);
      if (v.spesa_id !== null && !this.db.riga('SELECT id FROM spese WHERE id = ?', v.spesa_id)) throw new Rifiuto('Spesa ' + v.spesa_id + ' non trovata');
    }
    if (x.idRicevuta !== undefined) {
      v.ricevuta_id = vuoto(x.idRicevuta) ? null : Number(x.idRicevuta);
      if (v.ricevuta_id !== null && !this.db.riga('SELECT id FROM fatture_ricevute WHERE id = ?', v.ricevuta_id)) throw new Rifiuto('Fattura ricevuta ' + v.ricevuta_id + ' non trovata');
    }
    const spesa = v.spesa_id !== undefined ? v.spesa_id : prima ? prima.spesa_id : null;
    const ricevuta = v.ricevuta_id !== undefined ? v.ricevuta_id : prima ? prima.ricevuta_id : null;
    if (spesa && ricevuta) throw new Rifiuto('Il costo è la spesa o la fattura ricevuta: scegline una');
    return v;
  },

  /**
   * chiudiManutenzione {id, esito?, km?, data?, idSpesa?, idRicevuta?} (mezzi 2; chi l'ha segnalato chiude il suo
   * guasto con mezzi 1). Coi km: una lettura; un tagliando aggiorna l'ultimo tagliando e segna fatta la sua scadenza;
   * una revisione segna fatta la sua; la riparazione di uno strumento con taratura lo porta a "Taratura non scritta".
   */
  chiudiManutenzione(d) {
    const m = this.db.riga('SELECT * FROM manutenzioni WHERE id = ?', Number(d.id) || 0);
    if (!m) throw new Rifiuto('Manutenzione ' + testo(d.id) + ' non trovata');
    const io = this.chi().utente ? this.chi().utente.id : null;
    const suo = m.tipo === 'guasto' && m.segnalata_da === io;
    if (this.livello('mezzi') < 2 && !suo) throw senzaPermesso('chiudere le manutenzioni');
    if (m.stato === 'chiusa') return { ok: true, manutenzione: this.manutenzioneDaRiga(m) };
    const ora = adesso();
    const data = testo(d.data) ? dataDaIso(d.data) : oggi();
    const km = vuoto(d.km) ? m.km : Math.round(numero(d.km));
    const v = Object.assign({ stato: 'chiusa', chiusa_il: data, esito: d.esito !== undefined ? testo(d.esito) : m.esito, km, modificato: ora }, this.costoManutenzione(d, m));
    this.aggiorna('manutenzioni', m.id, v, 'id', 'chiusa');
    if (m.veicolo_id) {
      const veic = this.rigaMezzo(m.veicolo_id);
      if (km !== null && km !== undefined) {
        const gia = this.db.riga('SELECT id FROM mezzo_letture WHERE manutenzione_id = ?', m.id);
        const ultima = this.db.riga('SELECT km FROM mezzo_letture WHERE veicolo_id = ? AND data <= ? ORDER BY data DESC, km DESC LIMIT 1', veic.id, data);
        if (!gia && (!ultima || km >= ultima.km)) this.scriviLettura({ v: veic, km, data, origine: 'manutenzione', manutenzioneId: m.id, conferma: true });
      }
      if (m.tipo === 'tagliando') {
        if (km !== null && km !== undefined) this.aggiorna('veicoli', veic.id, { tagliando_ultimo_km: km });
        this.faiScadenzaDi('veicolo_id', veic.id, 'tagliando', data);
      }
      if (m.tipo === 'revisione') this.faiScadenzaDi('veicolo_id', veic.id, 'revisione', data);
    } else if (m.attrezzatura_id && (m.tipo === 'riparazione' || m.tipo === 'guasto')) {
      const a = this.rigaAttrezzatura(m.attrezzatura_id);
      if (a.fuori_uso === 'guasto') this.aggiorna('attrezzature', a.id, { fuori_uso: '', fuori_uso_il: '', fuori_uso_motivo: '', modificato: ora });
      // In riparazione dal fornitore: rientra.
      const x = this.assegnazioneInCorso('attrezzatura_id', a.id);
      if (x && x.tipo === 'riparazione') this.aggiorna('assegnazioni', x.id, { al: ora }, 'id', 'rientrato dalla riparazione');
    }
    return { ok: true, manutenzione: this.manutenzioneDaRiga(this.db.riga('SELECT * FROM manutenzioni WHERE id = ?', m.id)) };
  },

  /** Segna fatta la scadenza aperta di quel tipo per il mezzo o lo strumento (con la prossima, se si ripete). */
  faiScadenzaDi(campo, id, tipo, data) {
    const s = this.db.riga('SELECT * FROM scadenze WHERE ' + campo + " = ? AND tipo = ? AND stato = 'aperta' ORDER BY data LIMIT 1", id, tipo);
    if (s) this.segnaScadenzaFatta(s, data, null);
  },

  /** manutenzioni {aperte?, idVeicolo?, idAttrezzatura?} (mezzi 1). */
  leggiManutenzioni(d) {
    d = d || {};
    const cond = [];
    const par = [];
    if (si(d.aperte)) cond.push("stato <> 'chiusa'");
    if (testo(d.idVeicolo)) { cond.push('veicolo_id = ?'); par.push(Number(d.idVeicolo)); }
    if (testo(d.idAttrezzatura)) { cond.push('attrezzatura_id = ?'); par.push(Number(d.idAttrezzatura)); }
    const righe = this.db.righe('SELECT * FROM manutenzioni' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') + " ORDER BY (stato = 'chiusa'), data DESC, id DESC LIMIT 500", ...par);
    return { ok: true, manutenzioni: righe.map(m => Object.assign(this.manutenzioneDaRiga(m), { oggetto: m.veicolo_id ? this.titoloMezzo(this.rigaMezzo(m.veicolo_id)) : (r => r.nome + ' ' + r.codice)(this.rigaAttrezzatura(m.attrezzatura_id)) })) };
  },

  // ------------------------------------------------------------------ costi del mezzo (§7.4)

  /**
   * I costi dell'anno di un mezzo: spese della fase 3 col mezzo (carburante, pedaggi e parcheggi, il resto in
   * "altro"), fatture ricevute col mezzo (manutenzioni se legate a una manutenzione, se no altro; imponibile + cassa +
   * bollo, senza IVA), spese legate alle manutenzioni, impegni pagati col mezzo (bollo, assicurazione, rate). Una spesa
   * legata a una fattura ricevuta si conta una volta (la spesa). euroKm = totale / km dell'anno (null sotto 1.000 km).
   */
  costiDelMezzo(v, anno) {
    const a = String(anno || oggi().slice(0, 4));
    const voci = { carburante: 0, pedaggi: 0, manutenzioni: 0, assicurazione: 0, bollo: 0, altro: 0 };
    const quante = { carburante: 0, pedaggi: 0, manutenzioni: 0, assicurazione: 0, bollo: 0, altro: 0 };
    const aggiungi = (k, euro) => { voci[k] = centesimi(voci[k] + numero(euro)); quante[k]++; };
    const contate = new Set();
    const speseManut = new Set(this.db.righe('SELECT spesa_id FROM manutenzioni WHERE veicolo_id = ? AND spesa_id IS NOT NULL', v.id).map(r => r.spesa_id));
    const conta = s => !s.tolta && (s.stato === 'approvata' || s.stato === 'da_approvare');
    for (const s of this.db.righe('SELECT * FROM spese WHERE (veicolo_id = ? OR id IN (SELECT spesa_id FROM manutenzioni WHERE veicolo_id = ? AND spesa_id IS NOT NULL)) AND substr(data, 1, 4) = ?', v.id, v.id, a)) {
      if (!conta(s) || contate.has(s.id)) continue;
      contate.add(s.id);
      aggiungi(speseManut.has(s.id) ? 'manutenzioni' : s.categoria === 'carburante' ? 'carburante' : (s.categoria === 'pedaggio' || s.categoria === 'parcheggio') ? 'pedaggi' : 'altro', s.importo);
    }
    const ricManut = new Set(this.db.righe('SELECT ricevuta_id FROM manutenzioni WHERE veicolo_id = ? AND ricevuta_id IS NOT NULL', v.id).map(r => r.ricevuta_id));
    for (const r of this.db.righe("SELECT * FROM fatture_ricevute WHERE (veicolo_id = ? OR id IN (SELECT ricevuta_id FROM manutenzioni WHERE veicolo_id = ? AND ricevuta_id IS NOT NULL)) AND stato = 'attiva' AND substr(data, 1, 4) = ?", v.id, v.id, a)) {
      if (r.spesa_id && contate.has(r.spesa_id)) continue;
      const segno = r.tipo_documento === 'TD04' ? -1 : 1;
      aggiungi(ricManut.has(r.id) ? 'manutenzioni' : 'altro', segno * (numero(r.imponibile) + numero(r.contributo) + numero(r.bollo)));
    }
    for (const i of this.db.righe('SELECT i.*, (SELECT SUM(a.importo) FROM movimento_abbinamenti a JOIN movimenti m ON m.id = a.movimento_id WHERE a.impegno_id = i.id AND m.annullato = 0 AND substr(m.data, 1, 4) = ?) pagato FROM impegni i WHERE i.veicolo_id = ? AND i.annullato = 0', a, v.id)) {
      if (!(numero(i.pagato) > 0)) continue;
      const d = testo(i.descrizione).toLowerCase();
      aggiungi(d.indexOf('bollo') >= 0 ? 'bollo' : d.indexOf('assicura') >= 0 ? 'assicurazione' : 'altro', i.pagato);
    }
    const primo = this.db.riga('SELECT km FROM mezzo_letture WHERE veicolo_id = ? AND data < ? ORDER BY data DESC, km DESC LIMIT 1', v.id, a + '-01-01')
      || this.db.riga('SELECT km FROM mezzo_letture WHERE veicolo_id = ? AND substr(data, 1, 4) = ? ORDER BY data, km LIMIT 1', v.id, a);
    const ultimo = this.db.riga('SELECT km FROM mezzo_letture WHERE veicolo_id = ? AND substr(data, 1, 4) = ? ORDER BY data DESC, km DESC LIMIT 1', v.id, a);
    const kmAnno = primo && ultimo ? Math.max(0, ultimo.km - primo.km) : 0;
    const NOMI = { carburante: 'Carburante', pedaggi: 'Pedaggi e parcheggi', manutenzioni: 'Manutenzioni', assicurazione: 'Assicurazione', bollo: 'Bollo', altro: 'Altro' };
    const elenco = Object.keys(voci).filter(k => quante[k]).map(k => ({ chiave: k, nome: NOMI[k], importo: voci[k], quante: quante[k] }));
    const totale = centesimi(elenco.reduce((t, x) => t + x.importo, 0));
    return { anno: Number(a), km: { primo: primo ? primo.km : null, ultimo: ultimo ? ultimo.km : null, anno: kmAnno }, voci: elenco, totale, euroKm: kmAnno >= 1000 ? centesimi(totale / kmAnno) : null };
  },

  /** costiMezzo {id, anno?} (mezzi 1 e costi 1). */
  costiMezzo(d) {
    if (!this.vedeCosti()) throw senzaPermesso('vedere i costi dei mezzi (serve il permesso dei soldi)');
    const v = this.rigaMezzo(d.id);
    return Object.assign({ ok: true, idVeicolo: v.id }, this.costiDelMezzo(v, testo(d.anno) || oggi().slice(0, 4)));
  },

  // ------------------------------------------------------------------ attrezzature e strumenti

  prossimoCodiceAttrezzatura() {
    return this.prossimoNumero('attrezzatura', this.db.righe('SELECT codice FROM attrezzature').map(r => r.codice), Number(oggi().slice(0, 4)));
  },

  rigaAttrezzatura(id) {
    const a = this.db.riga('SELECT * FROM attrezzature WHERE id = ?', Number(id) || 0);
    if (!a) throw new Rifiuto('Attrezzatura ' + testo(id) + ' non trovata');
    return a;
  },

  /** La taratura di uno strumento in un giorno (oggi di base): l'ultima <= quel giorno, non superata da una riparazione. */
  ultimaTaraturaAl(a, giorno) {
    const g = giorno || oggi();
    const t = this.db.riga('SELECT * FROM tarature WHERE attrezzatura_id = ? AND data <= ? ORDER BY data DESC, id DESC LIMIT 1', a.id, g);
    if (!t) return null;
    // Dopo una riparazione chiusa la taratura non vale piu' (ACCREDIA): "Taratura non scritta" finche' non se ne scrive una.
    // Lo stesso giorno della taratura conta l'ora: una riparazione chiusa dopo che la taratura e' stata scritta la annulla.
    const rip = this.db.riga("SELECT id FROM manutenzioni WHERE attrezzatura_id = ? AND tipo IN ('riparazione', 'guasto') AND stato = 'chiusa' AND chiusa_il <= ? AND (chiusa_il > ? OR (chiusa_il = ? AND modificato > ?))",
      a.id, g, t.data, t.data, t.creato || '');
    return rip ? null : t;
  },

  /** Lo stato della taratura di uno strumento in un giorno (statoTaratura di conti.js), o null senza controllo. */
  taraturaDi(a, giorno) {
    if (!a.controllo) return null;
    const g = giorno || oggi();
    const t = this.ultimaTaraturaAl(a, g);
    // Al laboratorio quel giorno: oggi solo se il prestito al laboratorio e' ancora aperto; un giorno passato se era
    // uscito entro quel giorno e non era ancora rientrato (il giorno del rientro conta gia' come rientrato).
    const lab = g === oggi()
      ? this.db.riga("SELECT * FROM assegnazioni WHERE attrezzatura_id = ? AND tipo = 'laboratorio' AND al IS NULL ORDER BY dal DESC LIMIT 1", a.id)
      : this.db.riga("SELECT * FROM assegnazioni WHERE attrezzatura_id = ? AND tipo = 'laboratorio' AND substr(dal, 1, 10) <= ? AND (al IS NULL OR substr(al, 1, 10) > ?) ORDER BY dal DESC LIMIT 1", a.id, g, g);
    const nonConforme = a.fuori_uso === 'non_conforme' && (!a.fuori_uso_il || a.fuori_uso_il <= g);
    const st = C.statoTaratura({ controllo: a.controllo, ultima: t ? { data: t.data, scade: t.scade, esito: t.esito } : null, fuoriUso: nonConforme ? 'non_conforme' : '', inLaboratorio: !!lab },
      g, numero(this.leggiImpostazioni().TARATURA_PREAVVISO_GIORNI) || 30);
    if (st && lab && lab.rientro) st.rientro = lab.rientro;
    return st;
  },

  /**
   * Lo stato visto di un'attrezzatura (§7.5), uno solo: Fuori uso (non conforme, guasto, perso) > In taratura / In
   * riparazione > Taratura scaduta > In prestito a ... > Assegnato a ... > Disponibile; Dismesso esce dagli elenchi.
   */
  statoAttrezzatura(a) {
    const x = this.assegnazioneInCorso('attrezzatura_id', a.id);
    const chi = this.chiDiAssegnazione(x);
    const t = this.taraturaDi(a);
    const T = a.controllo === 'verifica' ? 'Verifica' : 'Taratura';
    if (a.dismesso_il) return { stato: 'dismesso', statoVisto: 'Dismesso', chi: null, taratura: t };
    const guastoFermo = this.db.riga("SELECT titolo FROM manutenzioni WHERE attrezzatura_id = ? AND stato <> 'chiusa' AND fermo = 1 LIMIT 1", a.id);
    if (a.fuori_uso || guastoFermo || (t && t.stato === 'non_conforme')) {
      const motivo = a.fuori_uso === 'non_conforme' || (t && t.stato === 'non_conforme') ? 'Non conforme' : a.fuori_uso === 'perso' ? 'Perso' : 'Guasto' + (guastoFermo ? ': ' + guastoFermo.titolo : '');
      return { stato: 'fuori', statoVisto: 'Fuori uso', motivo, chi, taratura: t };
    }
    if (x && x.tipo === 'laboratorio') return { stato: 'laboratorio', statoVisto: a.controllo === 'verifica' ? 'In verifica' : 'In taratura', chi, rientro: x.rientro, taratura: t };
    if (x && x.tipo === 'riparazione') return { stato: 'riparazione', statoVisto: 'In riparazione', chi, rientro: x.rientro, taratura: t };
    if (t && t.stato === 'scaduta') return { stato: 'scaduta', statoVisto: T + ' scaduta', chi, taratura: t };
    if (x && x.tipo === 'prestito') return { stato: 'prestito', statoVisto: 'In prestito a ' + chi.nome, chi, rientro: x.rientro, taratura: t };
    if (x) return { stato: 'assegnato', statoVisto: 'Assegnato a ' + chi.nome, chi, taratura: t };
    return { stato: 'disponibile', statoVisto: 'Disponibile', chi: null, taratura: t };
  },

  attrezzaturaInElenco(a) {
    const st = this.statoAttrezzatura(a);
    return {
      id: a.id, codice: a.codice, nome: a.nome, categoria: a.categoria, categoriaNome: NOMI_CATEGORIA[a.categoria] || a.categoria, marca: a.marca,
      modello: a.modello, matricola: a.matricola, statoVisto: st.statoVisto, stato: st.stato, motivo: st.motivo || '', chi: st.chi, rientro: st.rientro || '',
      posizione: a.posizione, controllo: a.controllo,
      taratura: st.taratura ? { stato: st.taratura.stato, parola: st.taratura.parola, giorni: st.taratura.giorni, scade: st.taratura.scade } : null,
      mio: this.eMio('attrezzatura_id', a), dismesso: !!a.dismesso_il,
    };
  },

  /**
   * attrezzature {categoria?, stato?: disponibili|assegnate|fuori|dismesse|tutte, mie?, idPersona?, testo?,
   * taratura?: scadute|in_scadenza} (mezzi 1).
   */
  leggiAttrezzature(d) {
    d = d || {};
    const stato = testo(d.stato) || 'tutte';
    if (['disponibili', 'assegnate', 'fuori', 'dismesse', 'tutte'].indexOf(stato) < 0) throw new Rifiuto('Stato: disponibili, assegnate, fuori, dismesse o tutte');
    const cond = [];
    const par = [];
    if (testo(d.categoria)) {
      if (CATEGORIE.indexOf(testo(d.categoria)) < 0) throw new Rifiuto('Categoria: strumento, attrezzo, informatica, dpi o altro');
      cond.push('categoria = ?');
      par.push(testo(d.categoria));
    }
    cond.push(stato === 'dismesse' ? "dismesso_il <> ''" : "dismesso_il = ''");
    let righe = this.db.righe('SELECT * FROM attrezzature WHERE ' + cond.join(' AND ') + ' ORDER BY codice', ...par).map(a => this.attrezzaturaInElenco(a));
    if (stato === 'disponibili') righe = righe.filter(a => a.stato === 'disponibile');
    else if (stato === 'assegnate') righe = righe.filter(a => a.stato === 'assegnato' || a.stato === 'prestito');
    else if (stato === 'fuori') righe = righe.filter(a => ['fuori', 'laboratorio', 'riparazione'].indexOf(a.stato) >= 0);
    if (si(d.mie)) righe = righe.filter(a => a.mio);
    if (testo(d.idPersona)) righe = righe.filter(a => a.chi && a.chi.idPersona === Number(d.idPersona));
    if (testo(d.taratura)) {
      const q = testo(d.taratura);
      if (['scadute', 'in_scadenza'].indexOf(q) < 0) throw new Rifiuto('Taratura: scadute o in_scadenza');
      righe = righe.filter(a => a.taratura && a.taratura.stato === (q === 'scadute' ? 'scaduta' : 'in_scadenza'));
    }
    const cerca = testo(d.testo).toLowerCase();
    if (cerca) righe = righe.filter(a => [a.codice, a.nome, a.marca, a.modello, a.matricola].some(x => String(x || '').toLowerCase().indexOf(cerca) >= 0));
    return {
      ok: true, attrezzature: righe,
      conteggi: { strumenti: righe.filter(a => a.categoria === 'strumento').length, tarateScadute: righe.filter(a => a.taratura && a.taratura.stato === 'scaduta').length,
        inScadenza: righe.filter(a => a.taratura && a.taratura.stato === 'in_scadenza').length, alLaboratorio: righe.filter(a => a.stato === 'laboratorio').length },
      prossimoCodice: this.prossimoCodiceAttrezzatura().codice,
    };
  },

  taraturaDaRiga(t) {
    const lab = t.laboratorio_id ? (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', t.laboratorio_id) || {}).nome || '' : '';
    return {
      id: t.id, data: t.data, scade: t.scade, esito: t.esito, esitoVisto: { conforme: 'Conforme', regolato: 'Regolato', non_conforme: 'Non conforme' }[t.esito],
      idLaboratorio: t.laboratorio_id, laboratorio: lab, certificato: t.certificato, idDocumento: t.documento_id, idRicevuta: t.ricevuta_id, nota: t.nota,
      frase: 'Tarato il ' + dataIt(t.data) + (lab ? ' da ' + lab : '') + (t.certificato ? ' · certificato ' + t.certificato : '') + (t.scade ? ' · fino al ' + dataIt(t.scade) : ''),
    };
  },

  /** Un uso di uno strumento (rapportino o ticket), con cliente, impianto, chi e lo stato di quel giorno. */
  usoDaRiga(u) {
    const r = u.rapportino_id ? this.db.riga('SELECT id, cliente, data, tecnico, utente_id, ticket_id FROM rapportini WHERE id = ?', u.rapportino_id) : null;
    const tk = u.ticket_id || (r && r.ticket_id) ? this.db.riga('SELECT t.id, t.numero, t.sede_id, s.nome sede FROM ticket t LEFT JOIN sedi s ON s.id = t.sede_id WHERE t.id = ?', u.ticket_id || r.ticket_id) : null;
    return {
      data: u.data, idRapportino: u.rapportino_id || '', idTicket: tk ? tk.id : null, ticket: tk ? tk.numero : '', cliente: r ? r.cliente : '',
      impianto: tk && tk.sede ? tk.sede : '', chi: r ? r.tecnico : (u.utente_id ? this.nomeUtente(u.utente_id) : ''), statoAllora: u.stato_allora,
      scadeAllora: u.scade_allora, confermato: u.confermato === 1,
    };
  },

  /** Gli usi da controllare dopo una taratura non conforme: dall'ultima taratura buona (§3.8, ISO 9001 §7.1.5.2). */
  usiDaControllare(a) {
    const nc = this.db.riga("SELECT * FROM tarature WHERE attrezzatura_id = ? AND esito = 'non_conforme' ORDER BY data DESC, id DESC LIMIT 1", a.id);
    if (!nc || a.fuori_uso !== 'non_conforme') return { frase: '', usi: [] };
    const buona = this.db.riga("SELECT * FROM tarature WHERE attrezzatura_id = ? AND esito <> 'non_conforme' AND data < ? ORDER BY data DESC, id DESC LIMIT 1", a.id, nc.data);
    const da = buona ? buona.data : '';
    const usi = this.db.righe('SELECT * FROM strumenti_usati WHERE attrezzatura_id = ? AND data > ? ORDER BY data, id', a.id, da || '0000-00-00').map(u => this.usoDaRiga(u));
    const n = usi.length;
    const frase = n ? 'Usato in ' + (n === 1 ? '1 intervento' : n + ' interventi') + (da ? ' dal ' + dataIt(da) : '') + ': controlla se le misure valgono' : '';
    return { frase, usi, dal: da };
  },

  /** attrezzatura {id} (mezzi 1): la scheda dello strumento o dell'attrezzatura. */
  attrezzaturaCompleta(a) {
    const o = this.attrezzaturaInElenco(a);
    const controllo = this.usiDaControllare(a);
    const fornitore = a.fornitore_id ? (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', a.fornitore_id) || {}).nome || '' : '';
    const laboratorio = a.laboratorio_id ? (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', a.laboratorio_id) || {}).nome || '' : '';
    Object.assign(o, {
      proprieta: a.proprieta, acquistatoIl: a.acquistato_il, idFornitore: a.fornitore_id, fornitore, controlloOgniMesi: a.controllo_ogni_mesi,
      idLaboratorio: a.laboratorio_id, laboratorio, fuoriUso: a.fuori_uso, fuoriUsoIl: a.fuori_uso_il, fuoriUsoMotivo: a.fuori_uso_motivo,
      dismessoIl: a.dismesso_il, dismessoMotivo: a.dismesso_motivo, note: a.note,
      tarature: this.db.righe('SELECT * FROM tarature WHERE attrezzatura_id = ? ORDER BY data DESC, id DESC', a.id).map(t => this.taraturaDaRiga(t)),
      assegnazioni: this.db.righe('SELECT * FROM assegnazioni WHERE attrezzatura_id = ? ORDER BY dal DESC, id DESC', a.id).map(x => this.assegnazioneDaRiga(x)),
      manutenzioni: this.db.righe("SELECT * FROM manutenzioni WHERE attrezzatura_id = ? ORDER BY (stato = 'chiusa'), data DESC, id DESC LIMIT 20", a.id).map(m => this.manutenzioneDaRiga(m)),
      documenti: this.documentiLegati('attrezzatura_id', a.id),
      usi: this.db.righe('SELECT * FROM strumenti_usati WHERE attrezzatura_id = ? ORDER BY data DESC, id DESC LIMIT 10', a.id).map(u => this.usoDaRiga(u)),
      usiDaControllare: controllo.usi, fraseUsi: controllo.frase,
      puoScrivere: this.livello('mezzi') >= 2, puoPrendere: o.stato === 'disponibile' && this.miaPersonaId() !== null && this.livello('mezzi') >= 1,
    });
    if (this.vedeCosti()) {
      const spese = this.db.righe("SELECT importo FROM spese WHERE attrezzatura_id = ? AND tolta IS NULL AND stato IN ('approvata', 'da_approvare')", a.id).reduce((t, s) => t + numero(s.importo), 0);
      const ric = this.db.righe("SELECT imponibile, contributo, bollo, tipo_documento FROM fatture_ricevute WHERE (attrezzatura_id = ? OR id IN (SELECT ricevuta_id FROM tarature WHERE attrezzatura_id = ?)) AND stato = 'attiva'", a.id, a.id)
        .reduce((t, r) => t + (r.tipo_documento === 'TD04' ? -1 : 1) * (numero(r.imponibile) + numero(r.contributo) + numero(r.bollo)), 0);
      o.costi = { spese: centesimi(spese), fattureRicevute: centesimi(ric), totale: centesimi(spese + ric) };
    }
    return o;
  },

  /** La scadenza della taratura (o della verifica) aperta di uno strumento: la crea o la sposta alla data "scade". */
  scadenzaTaratura(a, scade) {
    const tipo = a.controllo === 'verifica' ? 'verifica_dpi' : 'taratura';
    const aperta = this.db.riga("SELECT * FROM scadenze WHERE attrezzatura_id = ? AND tipo IN ('taratura', 'verifica_dpi') AND stato = 'aperta' ORDER BY data LIMIT 1", a.id);
    const ora = adesso();
    const titolo = (tipo === 'taratura' ? 'Taratura ' : 'Verifica ') + a.nome;
    if (!scade) return aperta ? aperta.id : null;
    if (aperta) {
      this.aggiorna('scadenze', aperta.id, { data: scade, titolo, modificato: ora });
      return aperta.id;
    }
    return this.inserisci('scadenze', {
      titolo, tipo, attrezzatura_id: a.id, data: scade, preavviso_giorni: numero(this.leggiImpostazioni().TARATURA_PREAVVISO_GIORNI) || 30,
      ogni_mesi: null, dalla_fatta: 0, azione: 'promemoria', stato: 'aperta', creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
    });
  },

  /**
   * salvaAttrezzatura {attrezzatura: {id?, codice?, nome, categoria, marca?, modello?, matricola?, proprieta?,
   * acquistatoIl?, idFornitore?, posizione?, controllo?, controlloOgniMesi?, idLaboratorio?, note?, ultimaTaratura?:
   * {data, scade?, certificato?, idDocumento?}}} (mezzi 2).
   */
  salvaAttrezzatura(d) {
    const x = (d && d.attrezzatura) || d || {};
    const prima = testo(x.id) ? this.rigaAttrezzatura(x.id) : null;
    if (prima && prima.dismesso_il) throw new Rifiuto('È dismesso: non si cambia');
    const nome = x.nome !== undefined ? testo(x.nome) : prima ? prima.nome : '';
    if (!nome) throw new Rifiuto('Nome: scrivi cos\'è');
    const categoria = x.categoria !== undefined ? testo(x.categoria) || 'strumento' : prima ? prima.categoria : 'strumento';
    if (CATEGORIE.indexOf(categoria) < 0) throw new Rifiuto('Categoria: strumento, attrezzo, informatica, dpi o altro');
    let codice = x.codice !== undefined ? testo(x.codice).toUpperCase() : prima ? prima.codice : '';
    let numeroCodice = null;
    if (!codice) {
      const p = this.prossimoCodiceAttrezzatura();
      codice = p.codice;
      numeroCodice = p.numero;
    }
    const altro = this.db.riga('SELECT * FROM attrezzature WHERE codice = ? COLLATE NOCASE AND id <> ?', codice, prima ? prima.id : 0);
    if (altro) throw new Rifiuto('Codice: ' + altro.codice + ' c\'è già (' + altro.nome + ')');
    const proprieta = x.proprieta !== undefined ? testo(x.proprieta) || 'studio' : prima ? prima.proprieta : 'studio';
    if (PROPRIETA_ATT.indexOf(proprieta) < 0) throw new Rifiuto('Di chi è: studio, noleggio, persona o cliente');
    const controlloBase = categoria === 'strumento' ? 'taratura' : categoria === 'dpi' ? 'verifica' : '';
    const controllo = x.controllo !== undefined ? testo(x.controllo) : prima ? prima.controllo : controlloBase;
    if (['', 'taratura', 'verifica'].indexOf(controllo) < 0) throw new Rifiuto('Controllo periodico: taratura, verifica o niente');
    let ogni = x.controlloOgniMesi !== undefined ? (vuoto(x.controlloOgniMesi) ? null : Math.round(numero(x.controlloOgniMesi))) : prima ? prima.controllo_ogni_mesi : null;
    if (controllo && ogni === null && !prima) ogni = numero(this.leggiImpostazioni().TARATURA_OGNI_MESI) || 12;
    if (ogni !== null && !(ogni >= 1 && ogni <= 120)) throw new Rifiuto('Ogni: da 1 a 120 mesi');
    const v = {
      codice, nome, categoria, proprieta, controllo, controllo_ogni_mesi: controllo ? ogni : null,
      marca: x.marca !== undefined ? testo(x.marca) : prima ? prima.marca : '', modello: x.modello !== undefined ? testo(x.modello) : prima ? prima.modello : '',
      matricola: x.matricola !== undefined ? testo(x.matricola) : prima ? prima.matricola : '',
      acquistato_il: x.acquistatoIl !== undefined ? (testo(x.acquistatoIl) ? dataDaIso(x.acquistatoIl) : '') : prima ? prima.acquistato_il : '',
      fornitore_id: x.idFornitore !== undefined ? testo(x.idFornitore) : prima ? prima.fornitore_id : '',
      posizione: x.posizione !== undefined ? testo(x.posizione) : prima ? prima.posizione : '',
      laboratorio_id: x.idLaboratorio !== undefined ? testo(x.idLaboratorio) : prima ? prima.laboratorio_id : '',
      note: x.note !== undefined ? testo(x.note) : prima ? prima.note : '',
    };
    for (const k of ['fornitore_id', 'laboratorio_id']) if (v[k] && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', v[k])) throw new Rifiuto('Fornitore ' + v[k] + ' non trovato');
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('attrezzature', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('attrezzature', Object.assign(v, { creato: ora, modificato: ora }));
      const n = numeroCodice !== null ? numeroCodice : this.numeroDi('attrezzatura', codice);
      if (n !== null) this.segnaNumero('attrezzatura', n);
    }
    const a = this.rigaAttrezzatura(id);
    // L'ultima taratura gia' fatta (uno strumento che entra adesso nel catalogo).
    const u = x.ultimaTaratura;
    if (u && typeof u === 'object' && testo(u.data) && a.controllo) {
      const data = dataDaIso(u.data);
      const scade = testo(u.scade) ? dataDaIso(u.scade) : a.controllo_ogni_mesi ? C.piuMesi(data, a.controllo_ogni_mesi) : '';
      if (scade && scade <= data) throw new Rifiuto('Scade: deve venire dopo la data della taratura');
      this.inserisci('tarature', {
        attrezzatura_id: id, data, scade, esito: 'conforme', laboratorio_id: v.laboratorio_id, certificato: testo(u.certificato),
        documento_id: vuoto(u.idDocumento) ? null : Number(u.idDocumento), utente_id: this.chi().utente ? this.chi().utente.id : null, creato: ora,
      }, 'id', 'taratura conforme');
      // Il certificato scelto fra i documenti: diventa dello strumento, e la sua scadenza anche.
      if (!vuoto(u.idDocumento)) {
        const doc = this.rigaDocumento(u.idDocumento);
        this.aggiorna('documenti', doc.id, { attrezzatura_id: id });
        if (doc.scadenza_id) {
          const s = this.db.riga('SELECT * FROM scadenze WHERE id = ?', doc.scadenza_id);
          if (s && s.stato === 'aperta') this.aggiorna('scadenze', s.id, { attrezzatura_id: id, tipo: a.controllo === 'verifica' ? 'verifica_dpi' : 'taratura', titolo: (a.controllo === 'verifica' ? 'Verifica ' : 'Taratura ') + a.nome, data: scade || s.data });
        }
      }
      this.scadenzaTaratura(a, scade);
    }
    return { ok: true, attrezzatura: this.attrezzaturaCompleta(this.rigaAttrezzatura(id)) };
  },

  /** dismettiAttrezzatura {id, motivo} (mezzi 2). */
  dismettiAttrezzatura(d) {
    const a = this.rigaAttrezzatura(d.id);
    const motivo = testo(d.motivo);
    if (!motivo) throw new Rifiuto('Motivo: scrivi perché lo dismetti');
    if (a.dismesso_il) return { ok: true, attrezzatura: this.attrezzaturaCompleta(a) };
    const ora = adesso();
    this.aggiorna('attrezzature', a.id, { dismesso_il: oggi(), dismesso_motivo: motivo, modificato: ora }, 'id', 'dismesso: ' + motivo);
    const x = this.assegnazioneInCorso('attrezzatura_id', a.id);
    if (x) this.aggiorna('assegnazioni', x.id, { al: ora }, 'id', 'restituito: dismesso');
    for (const s of this.db.righe("SELECT * FROM scadenze WHERE attrezzatura_id = ? AND stato = 'aperta'", a.id)) this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo: 'dismesso', modificato: ora });
    return { ok: true, attrezzatura: this.attrezzaturaCompleta(this.rigaAttrezzatura(a.id)) };
  },

  /**
   * registraTaratura {taratura: {idAttrezzatura, data, esito, scade?, idLaboratorio?, certificato?, idFile?,
   * idRicevuta?, nota?}, tornaA?} (mezzi 2): la scadenza aperta si segna fatta col certificato e nasce la prossima con la
   * data "scade"; un prestito al laboratorio in corso si chiude (con tornaA lo strumento torna a chi l'aveva assegnato).
   * Non conforme: Fuori uso e gli usi da controllare dall'ultima taratura buona. Una conforme dopo lo rimette in uso.
   */
  registraTaratura(d) {
    const x = (d && d.taratura) || d || {};
    const a = this.rigaAttrezzatura(x.idAttrezzatura);
    if (a.dismesso_il) throw new Rifiuto('È dismesso');
    if (!a.controllo) throw new Rifiuto(a.nome + ' non ha un controllo periodico: scegli taratura o verifica nella scheda');
    const data = testo(x.data) ? dataDaIso(x.data) : oggi();
    const esito = testo(x.esito);
    if (ESITI.indexOf(esito) < 0) throw new Rifiuto('Esito: conforme, regolato o non conforme');
    let scade = testo(x.scade) ? dataDaIso(x.scade) : '';
    if (!scade && esito !== 'non_conforme' && a.controllo_ogni_mesi) scade = C.piuMesi(data, a.controllo_ogni_mesi);
    if (esito === 'non_conforme') scade = '';
    if (scade && scade <= data) throw new Rifiuto('Scade: deve venire dopo la data della taratura');
    const lab = testo(x.idLaboratorio) || a.laboratorio_id || '';
    if (lab && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', lab)) throw new Rifiuto('Laboratorio ' + lab + ' non trovato');
    let ricevuta = vuoto(x.idRicevuta) ? null : Number(x.idRicevuta);
    if (ricevuta !== null && !this.db.riga('SELECT id FROM fatture_ricevute WHERE id = ?', ricevuta)) throw new Rifiuto('Fattura ricevuta ' + ricevuta + ' non trovata');
    const ora = adesso();
    let documento = null;
    if (testo(x.idFile)) {
      documento = this.documentoDaCarica({ idFile: x.idFile, titolo: 'Certificato di taratura ' + a.nome + (testo(x.certificato) ? ' ' + testo(x.certificato) : ''),
        categoria: 'Certificati di taratura', attrezzaturaId: a.id, dataDocumento: data, riferimento: x.certificato });
    }
    this.inserisci('tarature', {
      attrezzatura_id: a.id, data, scade, esito, laboratorio_id: lab, certificato: testo(x.certificato), documento_id: documento, ricevuta_id: ricevuta,
      nota: testo(x.nota), utente_id: this.chi().utente ? this.chi().utente.id : null, creato: ora,
    }, 'id', 'taratura ' + { conforme: 'conforme', regolato: 'regolato', non_conforme: 'non conforme' }[esito]);
    if (esito === 'non_conforme') {
      this.aggiorna('attrezzature', a.id, { fuori_uso: 'non_conforme', fuori_uso_il: data, fuori_uso_motivo: testo(x.nota) || 'Taratura non conforme del ' + dataIt(data), modificato: ora }, 'id', 'fuori uso: non conforme');
    } else {
      if (a.fuori_uso === 'non_conforme') this.aggiorna('attrezzature', a.id, { fuori_uso: '', fuori_uso_il: '', fuori_uso_motivo: '', modificato: ora }, 'id', 'di nuovo in uso: taratura ' + esito);
      // La scadenza aperta si segna fatta (col certificato) e nasce la prossima alla data "scade".
      const aperta = this.db.riga("SELECT * FROM scadenze WHERE attrezzatura_id = ? AND tipo IN ('taratura', 'verifica_dpi') AND stato = 'aperta' ORDER BY data LIMIT 1", a.id);
      if (aperta) this.aggiorna('scadenze', aperta.id, { stato: 'fatta', fatta_il: data, documento_fatto_id: documento, modificato: ora });
      const nuova = scade ? this.scadenzaTaratura(this.rigaAttrezzatura(a.id), scade) : null;
      if (aperta && nuova) this.aggiorna('scadenze', aperta.id, { prossima_id: nuova });
      if (nuova && documento) this.aggiorna('documenti', documento, { scadenza_id: nuova });
    }
    // Rientrato dal laboratorio.
    const inLab = this.assegnazioneInCorso('attrezzatura_id', a.id);
    if (inLab && inLab.tipo === 'laboratorio') {
      this.aggiorna('assegnazioni', inLab.id, { al: ora }, 'id', 'rientrato dal laboratorio');
      if (si(d.tornaA) && esito !== 'non_conforme') {
        const prima = this.db.riga("SELECT * FROM assegnazioni WHERE attrezzatura_id = ? AND tipo = 'assegnato' AND persona_id IS NOT NULL AND id <> ? ORDER BY dal DESC LIMIT 1", a.id, inLab.id);
        if (prima) this.assegnaInterno({ attrezzatura: this.rigaAttrezzatura(a.id), tipo: 'assegnato', personaId: prima.persona_id, nota: 'torna dopo la taratura' });
      }
    }
    const dopo = this.rigaAttrezzatura(a.id);
    const controllo = this.usiDaControllare(dopo);
    return { ok: true, attrezzatura: this.attrezzaturaCompleta(dopo), usiDaControllare: controllo.usi, fraseUsi: controllo.frase };
  },

  /** usiStrumento {idAttrezzatura, da?, a?} (mezzi 1): gli interventi in cui e' stato usato. */
  usiStrumento(d) {
    const a = this.rigaAttrezzatura(d.idAttrezzatura);
    const da = testo(d.da) ? dataDaIso(d.da) : '';
    const fino = testo(d.a) ? dataDaIso(d.a) : '';
    const righe = this.db.righe('SELECT * FROM strumenti_usati WHERE attrezzatura_id = ?' + (da ? ' AND data >= ?' : '') + (fino ? ' AND data <= ?' : '') + ' ORDER BY data DESC, id DESC',
      ...[a.id].concat(da ? [da] : [], fino ? [fino] : []));
    return { ok: true, idAttrezzatura: a.id, usi: righe.map(u => this.usoDaRiga(u)) };
  },

  // ------------------------------------------------------------------ assegnazioni e prestiti (§7.7)

  /** Una cosa che non si da' a nessuno: fuori uso, ferma, al laboratorio, non conforme, dismessa. Torna la frase o ''. */
  motivoNonSiPrende(campo, riga) {
    if (campo === 'veicolo_id') {
      if (riga.dismesso_il) return 'Il mezzo è dismesso';
      const st = this.statoMezzo(riga);
      if (st.fermo) return 'È fermo: ' + st.motivo;
      const x = this.assegnazioneInCorso('veicolo_id', riga.id);
      if (x && (x.tipo === 'laboratorio' || x.tipo === 'riparazione')) return 'È in officina' + (x.rientro ? ' fino al ' + dataBreve(x.rientro) : '');
      return '';
    }
    if (riga.dismesso_il) return 'È dismesso';
    const st = this.statoAttrezzatura(riga);
    if (st.taratura && st.taratura.stato === 'non_conforme') return 'Non conforme: non si usa finché non è tarato di nuovo';
    if (st.stato === 'fuori') return 'È fuori uso: ' + st.motivo;
    if (st.stato === 'laboratorio') return 'È al laboratorio' + (st.rientro ? ' fino al ' + dataBreve(st.rientro) : '');
    if (st.stato === 'riparazione') return 'È in riparazione' + (st.rientro ? ' fino al ' + dataBreve(st.rientro) : '');
    return '';
  },

  /** Assegna davvero: chiude quella in corso (lo storico resta) e scrive la nuova. Senza controlli di permesso. */
  assegnaInterno({ attrezzatura, veicolo, tipo, personaId, commessaId, soggettoId, rientro, nota, idLocale, firma, daAssegnazione }) {
    const campo = veicolo ? 'veicolo_id' : 'attrezzatura_id';
    const riga = veicolo || attrezzatura;
    const ora = adesso();
    const inCorso = this.assegnazioneInCorso(campo, riga.id);
    if (inCorso) this.aggiorna('assegnazioni', inCorso.id, { al: ora }, 'id', 'chiusa: nuova assegnazione');
    const chi = personaId ? this.nomePersona(personaId) : soggettoId ? ((this.db.riga('SELECT nome FROM soggetti WHERE id = ?', soggettoId) || {}).nome || soggettoId) : 'commessa ' + commessaId;
    const id = this.inserisci('assegnazioni', {
      id_locale: idLocale || null, [campo]: riga.id, tipo, persona_id: personaId || null, commessa_id: commessaId || '', soggetto_id: soggettoId || '',
      dal: ora, rientro: rientro || '', nota: testo(nota), da_assegnazione_id: daAssegnazione || (inCorso && tipo === 'prestito' && inCorso.tipo === 'assegnato' ? inCorso.id : null),
      da_utente_id: this.chi().utente ? this.chi().utente.id : null, creato: ora,
    }, 'id', tipo === 'prestito' ? 'prestito a ' + chi + (rientro ? ' fino al ' + dataIt(rientro) : '') : tipo === 'assegnato' ? 'assegnato a ' + chi : (tipo === 'laboratorio' ? 'in taratura da ' : 'in riparazione da ') + chi);
    if (firma && firma.base64) {
      const f = this.salvaFirmaConsegna(firma, { assegnazione_id: id });
      this.aggiorna('assegnazioni', id, { firma_file_id: f, firmata_il: ora });
    }
    return id;
  },

  /**
   * assegna {idVeicolo | idAttrezzatura, tipo, idPersona? | idCommessa? | idSoggetto?, rientro?, nota?, idLocale?,
   * firma?: {base64, mime}} (mezzi 2; con 1 solo "Lo prendo io": un prestito a se' stessi di una cosa Disponibile).
   */
  assegna(d) {
    if (testo(d.idLocale)) {
      const gia = this.db.riga('SELECT * FROM assegnazioni WHERE id_locale = ?', testo(d.idLocale));
      if (gia) return this.rispostaOggetto(gia.veicolo_id ? 'veicolo_id' : 'attrezzatura_id', gia.veicolo_id || gia.attrezzatura_id, { giaArrivata: true });
    }
    const o = this.oggettoManutenzione(d);
    const tipo = testo(d.tipo) || 'prestito';
    if (TIPI_ASSEGNAZIONE.indexOf(tipo) < 0) throw new Rifiuto('Tipo: assegnato, prestito, laboratorio o riparazione');
    const mia = this.miaPersonaId();
    const scrive = this.livello('mezzi') >= 2;
    let personaId = vuoto(d.idPersona) ? null : Number(d.idPersona);
    const commessaId = testo(d.idCommessa);
    const soggettoId = testo(d.idSoggetto);
    if (!scrive) {
      // "Lo prendo io": solo un prestito a me di una cosa disponibile.
      if (tipo !== 'prestito' || (personaId !== null && personaId !== mia) || commessaId || soggettoId) throw senzaPermesso('assegnare mezzi e attrezzature agli altri');
      personaId = mia;
      if (personaId === null) throw new Rifiuto('Non hai una scheda nell\'organico: chiedi all\'ufficio');
    }
    if (o.campo === 'veicolo_id' && o.riga.proprieta === 'persona') throw new Rifiuto('È l\'auto di una persona: non si assegna');
    const no = this.motivoNonSiPrende(o.campo, o.riga);
    if (no && (tipo === 'assegnato' || tipo === 'prestito')) throw new Rifiuto(no);
    if (!scrive) {
      const x = this.assegnazioneInCorso(o.campo, o.riga.id);
      if (x) throw new Rifiuto('Non è disponibile: ' + (o.campo === 'veicolo_id' ? this.statoMezzo(o.riga).statoVisto : this.statoAttrezzatura(o.riga).statoVisto));
    }
    if ((tipo === 'laboratorio' || tipo === 'riparazione') && !soggettoId) throw new Rifiuto('Scegli il laboratorio o l\'officina');
    if (personaId === null && !commessaId && !soggettoId) throw new Rifiuto('Scegli a chi');
    if (personaId !== null) {
      const p = this.db.riga('SELECT * FROM persone WHERE id = ?', personaId);
      if (!p) throw new Rifiuto('Persona ' + personaId + ' non trovata');
      if (p.uscita_il && p.uscita_il < oggi()) throw new Rifiuto(p.nome + ' è uscito dallo studio');
    }
    if (commessaId && !this.db.riga('SELECT id FROM commesse WHERE id = ?', commessaId)) throw new Rifiuto('Commessa ' + commessaId + ' non trovata');
    if (soggettoId && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', soggettoId)) throw new Rifiuto('Fornitore ' + soggettoId + ' non trovato');
    let rientro = testo(d.rientro) ? dataDaIso(d.rientro) : '';
    if (tipo === 'prestito' && !rientro && !scrive) rientro = oggi();
    if (rientro && rientro < oggi()) throw new Rifiuto('Rientro: deve venire dopo oggi');
    this.assegnaInterno({
      [o.campo === 'veicolo_id' ? 'veicolo' : 'attrezzatura']: o.riga, tipo, personaId, commessaId, soggettoId, rientro, nota: d.nota, idLocale: testo(d.idLocale), firma: d.firma,
    });
    return this.rispostaOggetto(o.campo, o.riga.id, {});
  },

  rispostaOggetto(campo, id, extra) {
    const r = campo === 'veicolo_id' ? { ok: true, mezzo: this.mezzoCompleto(this.rigaMezzo(id)) } : { ok: true, attrezzatura: this.attrezzaturaCompleta(this.rigaAttrezzatura(id)) };
    return Object.assign(r, extra || {});
  },

  /**
   * restituisci {idAssegnazione | idVeicolo | idAttrezzatura, idLocale?} (mezzi 1 per le mie, 2 sempre): chiude il
   * prestito; se interrompeva un'assegnazione, la cosa torna a chi l'aveva ("Torna a Marco Rossato").
   */
  restituisci(d) {
    if (testo(d.idLocale)) {
      const gia = this.db.riga('SELECT * FROM assegnazioni WHERE id_locale_rientro = ?', testo(d.idLocale));
      if (gia) return this.rispostaOggetto(gia.veicolo_id ? 'veicolo_id' : 'attrezzatura_id', gia.veicolo_id || gia.attrezzatura_id, { giaArrivata: true });
    }
    let x;
    if (!vuoto(d.idAssegnazione)) {
      x = this.db.riga('SELECT * FROM assegnazioni WHERE id = ?', Number(d.idAssegnazione) || 0);
      if (!x) throw new Rifiuto('Assegnazione ' + testo(d.idAssegnazione) + ' non trovata');
    } else {
      const o = this.oggettoManutenzione(d);
      x = this.assegnazioneInCorso(o.campo, o.riga.id);
      if (!x) return this.rispostaOggetto(o.campo, o.riga.id, {});
    }
    const campo = x.veicolo_id ? 'veicolo_id' : 'attrezzatura_id';
    const idOggetto = x.veicolo_id || x.attrezzatura_id;
    if (this.livello('mezzi') < 2 && x.persona_id !== this.miaPersonaId()) throw senzaPermesso('restituire le cose degli altri');
    if (x.al) return this.rispostaOggetto(campo, idOggetto, {});
    this.aggiorna('assegnazioni', x.id, { al: adesso(), id_locale_rientro: testo(d.idLocale) || null }, 'id', 'restituito');
    if (x.da_assegnazione_id) {
      const prima = this.db.riga('SELECT * FROM assegnazioni WHERE id = ?', x.da_assegnazione_id);
      if (prima && prima.persona_id) {
        const riga = campo === 'veicolo_id' ? this.rigaMezzo(idOggetto) : this.rigaAttrezzatura(idOggetto);
        this.assegnaInterno({ [campo === 'veicolo_id' ? 'veicolo' : 'attrezzatura']: riga, tipo: 'assegnato', personaId: prima.persona_id, nota: 'torna dopo il prestito' });
      }
    }
    return this.rispostaOggetto(campo, idOggetto, {});
  },

  /** assegnazioni {inCorso?, inRitardo?, idPersona?, idCommessa?, idSoggetto?} (mezzi 1). */
  leggiAssegnazioni(d) {
    d = d || {};
    const cond = [];
    const par = [];
    if (si(d.inCorso) || si(d.inRitardo)) cond.push('al IS NULL');
    if (si(d.inRitardo)) { cond.push("rientro <> '' AND rientro < ?"); par.push(oggi()); }
    if (testo(d.idPersona)) { cond.push('persona_id = ?'); par.push(Number(d.idPersona)); }
    if (testo(d.idCommessa)) { cond.push('commessa_id = ? COLLATE NOCASE'); par.push(testo(d.idCommessa)); }
    if (testo(d.idSoggetto)) { cond.push('soggetto_id = ?'); par.push(testo(d.idSoggetto)); }
    const righe = this.db.righe('SELECT * FROM assegnazioni' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') + ' ORDER BY (al IS NOT NULL), dal DESC, id DESC LIMIT 500', ...par);
    return { ok: true, assegnazioni: righe.map(x => this.assegnazioneDaRiga(x)) };
  },

  // ------------------------------------------------------------------ strumenti usati nel rapportino (§3.9, §7.8)

  /** Lo stato da congelare in strumenti_usati: valida (anche in scadenza o senza controllo), scaduta, senza, non_conforme, laboratorio. */
  statoAllora(a, giorno) {
    const t = this.taraturaDi(a, giorno);
    if (!t) return { stato: 'valida', scade: '' };
    const stato = t.stato === 'in_scadenza' ? 'valida' : t.stato;
    return { stato, scade: t.scade || '' };
  },

  /**
   * Gli strumenti usati di un rapportino (l'elenco intero, come la checklist delle attivita'). Mai un rifiuto: uno
   * strumento che non c'e' si salta, uno non conforme, al laboratorio o scaduto non confermato si scrive col suo stato
   * vero (e il rapportino ha strumentiDaGuardare). Lo stato e la scadenza sono quelli del giorno del rapportino.
   */
  scriviStrumentiRapportino(rap, lista) {
    if (!Array.isArray(lista)) return;
    const giorno = dataIso(rap.data) || oggi();
    const ora = adesso();
    const io = this.chi().utente ? this.chi().utente.id : null;
    const voluti = new Map();
    for (const s of lista) {
      const id = Number(s && typeof s === 'object' ? s.idAttrezzatura : s);
      if (!id || voluti.has(id)) continue;
      const a = this.db.riga('SELECT * FROM attrezzature WHERE id = ?', id);
      if (!a) continue;
      voluti.set(id, { a, confermato: !!(s && typeof s === 'object' && si(s.confermato)) });
    }
    const vecchi = this.db.righe('SELECT * FROM strumenti_usati WHERE rapportino_id = ?', rap.id);
    for (const r of vecchi) {
      if (voluti.has(r.attrezzatura_id)) continue;
      this.db.esegui('DELETE FROM strumenti_usati WHERE id = ?', r.id);
      this.annota('strumenti_usati', r.id, Object.assign({}, r), null, 'tolto dal rapportino ' + rap.id);
    }
    for (const [id, w] of voluti) {
      const st = this.statoAllora(w.a, giorno);
      const confermato = st.stato === 'scaduta' && w.confermato ? 1 : 0;
      const vecchio = vecchi.find(r => r.attrezzatura_id === id);
      if (vecchio) {
        const v = { data: giorno, stato_allora: vecchio.data === giorno ? vecchio.stato_allora : st.stato, scade_allora: vecchio.data === giorno ? vecchio.scade_allora : st.scade,
          confermato: (vecchio.data === giorno ? vecchio.stato_allora : st.stato) === 'scaduta' && w.confermato ? 1 : 0, ticket_id: rap.ticket_id || null };
        this.aggiorna('strumenti_usati', vecchio.id, v, 'id', v.confermato && !vecchio.confermato ? 'usato con la taratura scaduta' : '');
        continue;
      }
      this.inserisci('strumenti_usati', {
        attrezzatura_id: id, rapportino_id: rap.id, ticket_id: rap.ticket_id || null, data: giorno, utente_id: rap.utente_id || io,
        scade_allora: st.scade, stato_allora: st.stato, confermato, creato: ora,
      }, 'id', confermato ? 'usato con la taratura scaduta' : '');
    }
  },

  /** Gli strumenti di uno o piu' rapportini come li vede chi chiede (lo stato di quel giorno, congelato). */
  strumentiDeiRapportini(ids) {
    const per = {};
    if (!ids || !ids.length) return per;
    const lista = ids.map(() => '?').join(',');
    for (const s of this.db.righe('SELECT u.*, a.codice, a.nome, a.matricola, a.controllo FROM strumenti_usati u JOIN attrezzature a ON a.id = u.attrezzatura_id WHERE u.rapportino_id IN (' + lista + ') ORDER BY u.id', ...ids)) {
      (per[s.rapportino_id] = per[s.rapportino_id] || []).push({
        idAttrezzatura: s.attrezzatura_id, codice: s.codice, nome: s.nome, matricola: s.matricola, scadeAllora: s.scade_allora, statoAllora: s.stato_allora,
        confermato: s.confermato === 1, verifica: s.controllo === 'verifica',
      });
    }
    return per;
  },

  /** Gli strumenti da guardare di un rapportino: non conformi, al laboratorio, scaduti senza conferma (o con il blocco). */
  strumentiDaGuardare(strumenti) {
    const blocco = testo(this.leggiImpostazioni().TARATURA_BLOCCO) === 'blocco';
    return (strumenti || []).filter(s => s.statoAllora === 'non_conforme' || s.statoAllora === 'laboratorio' || (s.statoAllora === 'scaduta' && (!s.confermato || blocco)));
  },

  /** I mezzi per le anagrafiche (il telefono senza rete): id, titolo, proprieta, stato, mio. */
  mezziPerAnagrafiche() {
    return this.db.righe("SELECT * FROM veicoli WHERE dismesso_il = '' AND attivo = 1 ORDER BY id").map(v => {
      const st = this.statoMezzo(v);
      return { id: v.id, titolo: this.titoloMezzo(v), proprieta: v.proprieta, stato: st.stato, statoVisto: st.statoVisto, fermo: st.fermo, mio: this.eMio('veicolo_id', v) };
    });
  },

  /** I miei strumenti e attrezzature con la data della taratura (il telefono ricalcola lo stato dalla data, anche senza rete). */
  mieiStrumenti() {
    const mia = this.miaPersonaId();
    if (mia === null) return [];
    return this.db.righe("SELECT a.* FROM attrezzature a JOIN assegnazioni x ON x.attrezzatura_id = a.id AND x.al IS NULL WHERE x.persona_id = ? AND x.tipo IN ('assegnato', 'prestito') AND a.dismesso_il = '' ORDER BY a.codice", mia)
      .map(a => {
        const t = this.ultimaTaraturaAl(a);
        const st = this.taraturaDi(a);
        return { id: a.id, codice: a.codice, nome: a.nome, categoria: a.categoria, matricola: a.matricola, controllo: a.controllo, fuoriUso: a.fuori_uso,
          ultimaTaratura: t ? { data: t.data, scade: t.scade, esito: t.esito } : null, taratura: st ? { stato: st.stato, parola: st.parola, scade: st.scade } : null };
      });
  },
};

Object.defineProperties(module.exports, {
  NOMI_CATEGORIA_ATTREZZATURA: { value: NOMI_CATEGORIA },
  SCADENZE_MEZZO: { value: SCADENZE_MEZZO },
  kmIt: { value: kmIt },
});
