/*
 * Documenti (fase 5, accordo in docs/gestionale/fase5.md §5, risposte in
 * architettura.md §16): l'archivio con le categorie, i file caricati sul NAS
 * con le revisioni, i collegamenti (OneDrive, SharePoint, Google Drive, siti,
 * percorsi del computer dello studio: solo l'indirizzo, il file resta dov'e'),
 * le copie dei PDF mandati per email, chi vede cosa, la ricerca, i modelli e i
 * loro testi, lo spazio sul NAS.
 *
 * Le regole che non si discutono:
 *  - una revisione non si cambia mai: si aggiunge. La valida e' l'approvata
 *    col numero piu' alto; una da approvare non la sostituisce finche' non e'
 *    approvata; le approvate piu' vecchie sono "Superata" e si aprono ancora;
 *  - chi non vede un documento ("costi", "riservati") non lo trova da nessuna
 *    parte, nemmeno con /file/<id> (403), e il server non dice che c'e';
 *  - i collegamenti non si copiano e non si leggono: Wisper tiene l'indirizzo.
 */
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { Rifiuto, senzaPermesso, testo, numero, adesso, oggi, dataIso, dataDaIso, dataOraIso, idCasuale, piuGiorni, istante, adessoMs } = require('../utili');
const D = require('../documenti');
const C = require('../conti');
const { datiPersona } = require('../permessi');

const urlFile = id => '/file/' + id;
const si = v => v === true || v === 1 || v === '1' || v === 'true';
const vuoto = v => v === undefined || v === null || v === '';
const PER_PAGINA = 50;
const VEDE = ['tutti', 'costi', 'riservati'];
const LIVELLO_VEDE = { tutti: 0, costi: 1, riservati: 2 };
const MB = 1024 * 1024;
/** Foto e firme dei rapportini passano finche' restano almeno 200 MB (fase5.md §3.8). */
const MINIMO_LAVORO_MB = 200;
const CESTINO_GIORNI = 90;
const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');
const dataBreve = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '');
const giorniTra = (da, a) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(da + 'T12:00:00')) / 86400000);

/** I modelli di Wisper (impaginazione fissa nel codice, pc/ui/documenti.js) e i testi che si cambiano. */
const MODELLI = [
  { chiave: 'rapportino', nome: 'Rapportino', testi: ['EMAIL_RAPPORTINO_OGGETTO', 'EMAIL_RAPPORTINO_MESSAGGIO'] },
  { chiave: 'riepilogo', nome: 'Riepilogo del mese', testi: ['EMAIL_RIEPILOGO_OGGETTO', 'EMAIL_RIEPILOGO_MESSAGGIO'] },
  { chiave: 'preventivo', nome: 'Preventivo', testi: ['PREVENTIVO_INTRODUZIONE', 'PREVENTIVO_CONDIZIONI', 'EMAIL_PREVENTIVO_OGGETTO', 'EMAIL_PREVENTIVO_MESSAGGIO'] },
  { chiave: 'prospetto', nome: 'Prospetto per il programma delle fatture', testi: [] },
  { chiave: 'avviso', nome: 'Avviso di parcella', testi: [] },
  { chiave: 'lettera', nome: 'Lettera', testi: ['LETTERA_VERIFICA_TERRA', 'LETTERA_LIBERA', 'EMAIL_DOCUMENTO_OGGETTO', 'EMAIL_DOCUMENTO_MESSAGGIO'] },
  { chiave: 'contratto', nome: 'Contratto di assistenza', testi: ['CONTRATTO_CONDIZIONI'] },
  // Fase 6: la lettera d'incarico a un collaboratore esterno.
  { chiave: 'incarico', nome: 'Lettera d\'incarico', testi: ['LETTERA_INCARICO'] },
];
const NOMI_TESTI = {
  EMAIL_RAPPORTINO_OGGETTO: 'Oggetto dell\'email del rapportino', EMAIL_RAPPORTINO_MESSAGGIO: 'Messaggio dell\'email del rapportino',
  EMAIL_RIEPILOGO_OGGETTO: 'Oggetto dell\'email del riepilogo', EMAIL_RIEPILOGO_MESSAGGIO: 'Messaggio dell\'email del riepilogo',
  EMAIL_PREVENTIVO_OGGETTO: 'Oggetto dell\'email del preventivo', EMAIL_PREVENTIVO_MESSAGGIO: 'Messaggio dell\'email del preventivo',
  EMAIL_DOCUMENTO_OGGETTO: 'Oggetto dell\'email di un documento', EMAIL_DOCUMENTO_MESSAGGIO: 'Messaggio dell\'email di un documento',
  PREVENTIVO_INTRODUZIONE: 'Introduzione del preventivo', PREVENTIVO_CONDIZIONI: 'Condizioni del preventivo',
  LETTERA_VERIFICA_TERRA: 'Lettera "Verifica impianto di terra"', LETTERA_LIBERA: 'Lettera libera', CONTRATTO_CONDIZIONI: 'Condizioni del contratto di assistenza',
  LETTERA_INCARICO: 'Lettera d\'incarico',
};
const TITOLI_LETTERE = { LETTERA_VERIFICA_TERRA: 'Verifica periodica dell\'impianto di terra', LETTERA_LIBERA: 'Lettera', LETTERA_INCARICO: 'Lettera d\'incarico' };

module.exports = {
  // ------------------------------------------------------------------ chi vede, chi scrive, chi approva

  /** Approvano le revisioni: titolare e amministrazione col modulo documenti in scrittura (come le ore della fase 3). */
  puoApprovareDocumenti() {
    const c = this.chi();
    if (c.sistema) return true;
    if (!c.utente || this.soloSuoi()) return false;
    return this.livello('documenti') >= 2;
  },

  /** Il livello di "vede" che chi lavora puo' aprire: tutti, costi (permesso dei soldi), riservati. */
  vedeLivello(vede) {
    if (vede === 'riservati') return this.livello('riservati') >= 1;
    if (vede === 'costi') return this.vedeCosti();
    return true;
  },

  vedeDocumento(d) {
    if (!d) return false;
    if (this.chi().sistema) return true;
    // Fase 6: un documento di una persona lo vedono solo chi ha persone 2 e la persona stessa, qualunque sia "vede"; se
    // e' riservato, solo chi ha "riservati" e la persona stessa (fase6.md §4.5). Gli altri non sanno che c'e'.
    if (d.persona_id) {
      if (d.persona_id === this.miaPersonaId()) return true;
      if (this.livello('persone') < 2) return false;
      if (d.vede === 'riservati' && this.livello('riservati') < 1) return false;
      if (d.vede === 'costi' && !this.vedeCosti()) return false;
      return true;
    }
    // Fase 6: l'esterno vede i suoi documenti (DURC, polizza...), quelli dei suoi incarichi e quelli "tutti" delle sue commesse.
    if (this.eEsterno()) return this.esternoVedeDocumento(d);
    if (this.livello('documenti') < 1) return false;
    return this.vedeLivello(d.vede);
  },

  esternoVedeDocumento(d) {
    if (d.vede === 'riservati') return false;
    const mio = this.mioSoggetto();
    if (!mio) return false;
    if (d.cliente_id === mio && !d.commessa_id) return true;
    if (d.incarico_id) {
      const i = this.db.riga('SELECT soggetto_id, stato FROM incarichi WHERE id = ?', d.incarico_id);
      if (i && i.soggetto_id === mio && (i.stato === 'affidato' || i.stato === 'concluso')) return true;
    }
    if (d.vede !== 'tutti') return false;
    return !!d.commessa_id && this.commesseEsterno().has(String(d.commessa_id).toUpperCase());
  },

  /** Un collaboratore con documenti 2 cambia solo i documenti creati da lui. */
  puoScrivereDocumento(d) {
    if (this.eEsterno()) return !!d && d.cliente_id === this.mioSoggetto() && !d.commessa_id && d.creato_da === this.chi().utente.id;
    if (this.livello('documenti') < 2 || !this.vedeDocumento(d)) return false;
    // Fase 6: quelli di una persona li cambia chi ha persone 2.
    if (d.persona_id && this.livello('persone') < 2) return false;
    if (this.soloSuoi()) return d.creato_da === this.chi().utente.id;
    return true;
  },

  rigaDocumento(id) {
    const d = this.db.riga('SELECT * FROM documenti WHERE id = ?', Number(id) || 0);
    if (!d || !this.vedeDocumento(d)) throw new Rifiuto('Documento ' + testo(id) + ' non trovato');
    return d;
  },

  categoriaDocumento(id) {
    const c = this.db.riga('SELECT * FROM documento_categorie WHERE id = ?', Number(id) || 0);
    if (!c) throw new Rifiuto('Categoria: scegli la categoria');
    return c;
  },

  categoriaDiSistema(nome) {
    return this.db.riga('SELECT * FROM documento_categorie WHERE nome = ? ORDER BY sistema DESC, id LIMIT 1', nome);
  },

  // ------------------------------------------------------------------ spazio sul disco del NAS

  /** Lo spazio del disco dei dati, in MB: {totaleMb, liberoMb}. WISPER_SPAZIO_FINTO_MB (solo le prove) finge il libero. */
  spazioDisco() {
    let totaleMb = 0;
    let liberoMb = 0;
    try {
      const s = fs.statfsSync(this.dati);
      totaleMb = Math.round(s.blocks * s.bsize / MB);
      liberoMb = Math.round(s.bavail * s.bsize / MB);
    } catch (e) {
      totaleMb = 0;
      liberoMb = Number.MAX_SAFE_INTEGER;
    }
    const finto = this.spazioFintoMb !== undefined && this.spazioFintoMb !== null && this.spazioFintoMb !== '' ? this.spazioFintoMb : process.env.WISPER_SPAZIO_FINTO_MB;
    if (finto !== undefined && finto !== null && finto !== '') liberoMb = Number(finto);
    return { totaleMb, liberoMb };
  },

  /**
   * Prima di ogni file (fase5.md §5.9). cosa = 'documento' (documenti, /carica,
   * revisioni): sotto SPAZIO_MINIMO_MB no. cosa = 'lavoro' (foto e firme dei
   * rapportini, scontrini, foto dei ticket e allegati): fino a 200 MB liberi.
   */
  controllaSpazio(cosa) {
    const imp = this.leggiImpostazioni();
    const { liberoMb } = this.spazioDisco();
    const minimo = cosa === 'lavoro' ? MINIMO_LAVORO_MB : numero(imp.SPAZIO_MINIMO_MB) || 2048;
    if (liberoMb < minimo) {
      throw new Rifiuto('Il disco del NAS è quasi pieno (restano ' + D.grandezza(liberoMb) + '): il file non è stato caricato. Avvisa il titolare', { spazio: true });
    }
  },

  fileMaxByte() {
    return Math.round((numero(this.leggiImpostazioni().FILE_MAX_MB) || 50) * MB);
  },

  // ------------------------------------------------------------------ i file arrivati con /carica

  /** Il file gia' arrivato con questo idFile da questa persona (la coda del telefono che ripete). */
  fileCaricatoGia(idFile, idUtente) {
    if (!testo(idFile)) return null;
    return this.db.riga("SELECT * FROM file WHERE id_client = ? AND IFNULL(caricato_da, 0) = ? AND tipo IN ('caricato', 'documento', 'ticket') AND cestinato IS NULL ORDER BY creato DESC LIMIT 1",
      testo(idFile), idUtente || 0);
  },

  /** Lo stesso contenuto (SHA-256) gia' revisione di un documento non archiviato che chi chiede vede. */
  stessoFileGia(sha) {
    if (!sha) return null;
    for (const v of this.db.righe('SELECT v.*, d.titolo, d.vede, d.archiviato FROM documento_versioni v JOIN documenti d ON d.id = v.documento_id WHERE v.sha256 = ? AND v.tolta IS NULL ORDER BY v.id DESC', sha)) {
      if (v.archiviato || !this.vedeLivello(v.vede) || this.livello('documenti') < 1) continue;
      return { idDocumento: v.documento_id, titolo: v.titolo, revisione: v.numero };
    }
    return null;
  },

  /** La risposta di /carica per un file. */
  rispostaCarica(f) {
    const r = { ok: true, file: { id: f.id, nome: f.nome, mime: f.mime, byte: f.byte, sha256: f.sha256 } };
    const gia = this.stessoFileGia(f.sha256);
    if (gia) r.gia = gia;
    return r;
  },

  /** Il file di /carica da legare: tipo "caricato", non nel cestino, di chi lo lega. */
  fileDaLegare(idFile) {
    const f = this.db.riga('SELECT * FROM file WHERE id = ?', testo(idFile));
    const io = this.chi().utente ? this.chi().utente.id : null;
    if (!f || f.cestinato || f.tipo !== 'caricato' || (!this.chi().sistema && f.caricato_da !== io)) {
      throw new Rifiuto('File ' + testo(idFile) + ' non trovato: caricalo di nuovo');
    }
    return f;
  },

  /** I file di /carica mai legati vanno nel cestino dopo 24 ore (fase5.md §5.9). Torna quanti. */
  pulisciCaricati() {
    const limite = adessoMs() - 24 * 3600 * 1000;
    const vecchi = this.db.righe("SELECT id, creato FROM file WHERE tipo = 'caricato' AND cestinato IS NULL").filter(f => Date.parse(f.creato) < limite);
    if (!vecchi.length) return 0;
    this.db.transazione(() => {
      for (const f of vecchi) this.aggiorna('file', f.id, { cestinato: adesso() }, 'id', 'caricato e mai legato: nel cestino dopo 24 ore');
    });
    return vecchi.length;
  },

  // ------------------------------------------------------------------ lettura

  /** Nomi e revisioni che servono per mandare un elenco di documenti. */
  aiutiDocumenti(righe) {
    const a = { clienti: {}, commesse: {}, sedi: {}, ticket: {}, contratti: {}, categorie: {}, utenti: {}, versioni: {}, scadenze: {} };
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { a.clienti[s.id] = s.nome; });
    this.db.righe('SELECT id, descrizione FROM commesse').forEach(m => { a.commesse[String(m.id).toUpperCase()] = m; });
    this.db.righe('SELECT id, nome, tipo FROM sedi').forEach(s => { a.sedi[s.id] = s.nome; });
    this.db.righe('SELECT id, numero FROM ticket').forEach(t => { a.ticket[t.id] = t.numero; });
    this.db.righe('SELECT id, numero FROM contratti').forEach(t => { a.contratti[t.id] = t.numero; });
    this.db.righe('SELECT * FROM documento_categorie').forEach(c => { a.categorie[c.id] = c; });
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { a.utenti[u.id] = u.nome; });
    const ids = righe.map(d => Number(d.id));
    if (ids.length) {
      const lista = ids.join(',');
      for (const v of this.db.righe('SELECT * FROM documento_versioni WHERE documento_id IN (' + lista + ') ORDER BY numero, id')) {
        (a.versioni[v.documento_id] = a.versioni[v.documento_id] || []).push(v);
      }
      const scad = righe.map(d => d.scadenza_id).filter(x => x !== null && x !== undefined);
      if (scad.length) this.db.righe('SELECT * FROM scadenze WHERE id IN (' + scad.map(Number).join(',') + ')').forEach(s => { a.scadenze[s.id] = s; });
    }
    return a;
  },

  /** Lo stato visto di un documento e la sua revisione valida (o l'unica da approvare). */
  statoDocumento(d, versioni) {
    const vive = (versioni || []).filter(v => !v.tolta);
    const valida = vive.find(v => v.id === d.versione_valida_id) || null;
    const attesa = vive.filter(v => v.stato === 'da_approvare').sort((x, y) => y.numero - x.numero)[0] || null;
    let statoVisto;
    if (d.archiviato) statoVisto = 'Archiviato';
    else if (d.origine === 'collegamento') statoVisto = 'Collegamento';
    else if (valida) statoVisto = 'Valida';
    else if (attesa) statoVisto = 'Da approvare';
    else if (vive.some(v => v.stato === 'respinta')) statoVisto = 'Respinta';
    else statoVisto = 'Da approvare';
    // Si apre la valida; senza valida l'unica (o l'ultima) da approvare, se no l'ultima rimasta.
    const daAprire = valida || attesa || vive.slice().sort((x, y) => y.numero - x.numero)[0] || null;
    return { statoVisto, valida, attesa, daAprire };
  },

  documentoDaRiga(d, a) {
    a = a || this.aiutiDocumenti([d]);
    const cat = a.categorie[d.categoria_id] || {};
    const st = this.statoDocumento(d, a.versioni[d.id]);
    const v = st.daAprire;
    const m = d.commessa_id ? a.commesse[String(d.commessa_id).toUpperCase()] : null;
    const s = d.scadenza_id ? a.scadenze[d.scadenza_id] : null;
    const o = {
      id: d.id, idLocale: testo(d.id_locale), titolo: d.titolo, idCategoria: d.categoria_id, categoria: cat.nome || '',
      daClassificare: cat.nome === 'Da classificare' && cat.sistema === 1,
      origine: d.origine, collegamentoTipo: d.collegamento_tipo, collegamentoNome: d.collegamento_tipo ? D.PILLOLE[d.collegamento_tipo] : '',
      cartella: d.cartella === 1, principale: d.principale === 1,
      url: d.origine === 'collegamento' ? d.url : v ? urlFile(v.file_id) : '',
      idCliente: d.cliente_id, cliente: d.cliente_id ? a.clienti[d.cliente_id] || '' : '',
      idCommessa: m ? m.id : d.commessa_id, commessa: m ? m.descrizione : '',
      idSede: d.sede_id === null ? null : d.sede_id, impianto: d.sede_id ? a.sedi[d.sede_id] || '' : '',
      idTicket: d.ticket_id === null ? null : d.ticket_id, ticket: d.ticket_id ? a.ticket[d.ticket_id] || '' : '',
      idContratto: d.contratto_id === null ? null : d.contratto_id, contratto: d.contratto_id ? a.contratti[d.contratto_id] || '' : '',
      riferimento: d.riferimento, dataDocumento: d.data_documento,
      revisione: v ? v.numero : null, statoVisto: st.statoVisto, daApprovare: st.attesa ? st.attesa.numero : null,
      nomeFile: v ? v.nome_file : '', mime: v ? v.mime : '', byte: v ? v.byte : null,
      scadenza: s ? this.scadenzaBreve(s) : null,
      vede: d.vede, archiviato: !!d.archiviato,
      puoScrivere: this.puoScrivereDocumento(d) && !d.archiviato,
      creato: dataOraIso(d.creato), modificato: dataOraIso(d.modificato),
      // Fase 6: la persona, il mezzo, lo strumento, l'incarico; idSoggetto (= idCliente) per i documenti dei collaboratori.
      idPersona: d.persona_id === null || d.persona_id === undefined ? null : d.persona_id,
      idVeicolo: d.veicolo_id === null || d.veicolo_id === undefined ? null : d.veicolo_id,
      idAttrezzatura: d.attrezzatura_id === null || d.attrezzatura_id === undefined ? null : d.attrezzatura_id,
      idIncarico: d.incarico_id === null || d.incarico_id === undefined ? null : d.incarico_id,
      idSoggetto: d.cliente_id || '',
    };
    // Fase 6: chi vede un documento riservato di un'altra persona lascia traccia (togliPersonali lo segna nel registro).
    if (d.persona_id) {
      if (d.vede === 'riservati') o.documentoRiservato = true;
      datiPersona(o, d.persona_id, 'documento');
    }
    return o;
  },

  /**
   * L'azione "documenti" e' anche quella dello script (solo idCommessa: la
   * cartella e i file della commessa, per le versioni vecchie). E' l'elenco
   * dell'archivio con archivio: true, o con un qualunque filtro della fase 5.
   */
  elencoNuovo(d) {
    if (si(d.archivio)) return true;
    if (!testo(d.idCommessa)) return true;
    return ['testo', 'idCategoria', 'idCliente', 'idSede', 'idTicket', 'idContratto', 'origine', 'stato', 'scadenza', 'daClassificare', 'archiviati', 'pagina']
      .some(k => d[k] !== undefined && d[k] !== '');
  },

  /** documenti {testo?, idCategoria?, idCliente?, idCommessa?, idSede?, idTicket?, idContratto?, origine?, stato?, scadenza?, daClassificare?, archiviati?, pagina?} */
  leggiDocumenti(d) {
    d = d || {};
    const cond = [];
    const par = [];
    const archiviati = si(d.archiviati);
    cond.push(archiviati ? 'archiviato IS NOT NULL' : 'archiviato IS NULL');
    if (testo(d.idCategoria)) { cond.push('categoria_id = ?'); par.push(Number(d.idCategoria)); }
    if (testo(d.idCliente)) { cond.push('cliente_id = ?'); par.push(testo(d.idCliente)); }
    if (testo(d.idCommessa)) { cond.push('commessa_id = ? COLLATE NOCASE'); par.push(testo(d.idCommessa)); }
    if (testo(d.idSede)) { cond.push('sede_id = ?'); par.push(Number(d.idSede)); }
    if (testo(d.idTicket)) { cond.push('ticket_id = ?'); par.push(this.idTicketDa(d.idTicket)); }
    if (testo(d.idContratto)) { cond.push('contratto_id = ?'); par.push(Number(d.idContratto)); }
    // Fase 6: i documenti di una persona, di un mezzo, di uno strumento, di un incarico, di un collaboratore (§10.5).
    if (testo(d.idPersona)) { cond.push('persona_id = ?'); par.push(Number(d.idPersona)); }
    if (testo(d.idVeicolo)) { cond.push('veicolo_id = ?'); par.push(Number(d.idVeicolo)); }
    if (testo(d.idAttrezzatura)) { cond.push('attrezzatura_id = ?'); par.push(Number(d.idAttrezzatura)); }
    if (testo(d.idIncarico)) { cond.push('incarico_id = ?'); par.push(Number(d.idIncarico)); }
    if (testo(d.idSoggetto) && !testo(d.idCliente)) { cond.push('cliente_id = ?'); par.push(testo(d.idSoggetto).toUpperCase()); }
    if (testo(d.origine)) {
      if (['file', 'collegamento', 'inviato'].indexOf(testo(d.origine)) < 0) throw new Rifiuto('Origine: file, collegamento o inviato');
      cond.push('origine = ?');
      par.push(testo(d.origine));
    }
    if (si(d.daClassificare)) cond.push("categoria_id IN (SELECT id FROM documento_categorie WHERE nome = 'Da classificare' AND sistema = 1)");
    let righe = this.db.righe('SELECT * FROM documenti WHERE ' + cond.join(' AND ') + ' ORDER BY modificato DESC, id DESC', ...par)
      .filter(x => this.vedeDocumento(x));
    const a = this.aiutiDocumenti(righe);
    const io = this.chi().utente ? this.chi().utente.id : null;
    const approva = this.puoApprovareDocumenti();
    const attesaDi = x => (a.versioni[x.id] || []).filter(v => !v.tolta && v.stato === 'da_approvare');
    const respinteDi = x => (a.versioni[x.id] || []).filter(v => !v.tolta && v.stato === 'respinta' && v.caricata_da === io);
    // Le conte servono anche quando l'elenco e' filtrato per stato.
    const scadenzaDi = x => (x.scadenza_id ? a.scadenze[x.scadenza_id] : null);
    const conteggi = { daApprovare: 0, inScadenza: 0, scaduti: 0, daClassificare: 0 };
    for (const x of righe) {
      if (attesaDi(x).some(v => approva || v.caricata_da === io)) conteggi.daApprovare++;
      const s = scadenzaDi(x);
      if (s && s.stato === 'aperta') {
        const g = giorniTra(oggi(), s.data);
        if (g < 0) conteggi.scaduti++;
        else if (g <= s.preavviso_giorni) conteggi.inScadenza++;
      }
      const cat = a.categorie[x.categoria_id];
      if (cat && cat.nome === 'Da classificare' && cat.sistema === 1) conteggi.daClassificare++;
    }
    const stato = testo(d.stato) || 'tutti';
    if (['validi', 'da_approvare', 'respinti', 'tutti'].indexOf(stato) < 0) throw new Rifiuto('Stato: validi, da_approvare, respinti o tutti');
    if (stato === 'validi') righe = righe.filter(x => x.origine === 'collegamento' || !!(a.versioni[x.id] || []).find(v => v.id === x.versione_valida_id && !v.tolta));
    else if (stato === 'da_approvare') righe = righe.filter(x => attesaDi(x).some(v => approva || v.caricata_da === io));
    else if (stato === 'respinti') righe = righe.filter(x => respinteDi(x).length);
    if (testo(d.scadenza)) {
      const quale = testo(d.scadenza);
      if (['entro', 'scadute'].indexOf(quale) < 0) throw new Rifiuto('Scadenza: entro o scadute');
      righe = righe.filter(x => {
        const s = scadenzaDi(x);
        if (!s || s.stato !== 'aperta') return false;
        const g = giorniTra(oggi(), s.data);
        return quale === 'scadute' ? g < 0 : g >= 0 && g <= s.preavviso_giorni;
      });
    }
    // La ricerca (§5.5): tutte le parole, senza badare a maiuscole, accenti e spazi doppi; prima i titoli che cominciano con la parola.
    const cerca = D.pulisciRicerca(d.testo);
    if (cerca) {
      const parole = cerca.split(' ');
      righe = righe.filter(x => {
        const v = (a.versioni[x.id] || []).find(z => z.id === x.versione_valida_id);
        const m = x.commessa_id ? a.commesse[String(x.commessa_id).toUpperCase()] : null;
        const dove = D.pulisciRicerca([x.titolo, x.descrizione, x.parole, x.riferimento, v ? v.nome_file : '', a.clienti[x.cliente_id] || '',
          x.commessa_id, m ? m.descrizione : '', x.sede_id ? a.sedi[x.sede_id] : '', x.ticket_id ? a.ticket[x.ticket_id] : '',
          x.contratto_id ? a.contratti[x.contratto_id] : ''].join(' '));
        return parole.every(p => dove.indexOf(p) >= 0);
      });
      const primo = parole[0];
      righe.sort((x, y) => {
        const ax = D.pulisciRicerca(x.titolo).startsWith(primo) ? 0 : 1;
        const ay = D.pulisciRicerca(y.titolo).startsWith(primo) ? 0 : 1;
        if (ax !== ay) return ax - ay;
        return String(y.modificato || '') < String(x.modificato || '') ? -1 : String(y.modificato || '') > String(x.modificato || '') ? 1 : y.id - x.id;
      });
    }
    const quanti = righe.length;
    const pagine = Math.max(1, Math.ceil(quanti / PER_PAGINA));
    const pagina = Math.min(Math.max(1, Math.round(numero(d.pagina)) || 1), pagine);
    const documenti = righe.slice((pagina - 1) * PER_PAGINA, pagina * PER_PAGINA).map(x => this.documentoDaRiga(x, a));
    const out = { ok: true, pagina, pagine, quanti, conteggi, documenti };
    out.daWisper = testo(d.idCliente) || testo(d.idCommessa) || testo(d.idSede) ? this.daWisper(d) : [];
    return out;
  },

  /**
   * "Da Wisper" (§5.6): quello che Wisper fa gia' per quel cliente, commessa o
   * impianto (preventivi non sostituiti, rapportini firmati o oltre, fatture
   * emesse, contratti) come righe che aprono la loro pagina. Non sono copie.
   */
  daWisper(d) {
    const out = [];
    const idCliente = testo(d.idCliente);
    const idCommessa = testo(d.idCommessa);
    const idSede = testo(d.idSede) ? Number(d.idSede) : null;
    const commesseSede = idSede !== null ? new Set(this.db.righe('SELECT id FROM commesse WHERE sede_id = ?', idSede).map(m => String(m.id).toUpperCase())) : null;
    const tocca = (cliente, commessa, sede) => (!idCliente || cliente === idCliente) &&
      (!idCommessa || String(commessa || '').toUpperCase() === idCommessa.toUpperCase()) &&
      (idSede === null || sede === idSede || (commessa && commesseSede.has(String(commessa).toUpperCase())));
    if (this.livello('preventivi') >= 1) {
      for (const p of this.db.righe("SELECT * FROM preventivi WHERE modello = 0 AND stato <> 'SOSTITUITO' ORDER BY data DESC, id DESC")) {
        if (!tocca(p.cliente_id, p.commessa_id, p.sede_id)) continue;
        const etichetta = p.numero ? p.numero + (p.revisione ? ' rev. ' + p.revisione : '') : 'Bozza';
        out.push({ tipo: 'preventivo', id: p.id, titolo: 'Preventivo ' + etichetta, dettaglio: dataIt(p.data) + (p.oggetto ? ' · ' + p.oggetto : '') + ' · ' + String(p.stato).toLowerCase(),
          data: p.data || '', pagina: 'preventivo' });
      }
    }
    if (this.livello('rapportini') >= 1) {
      const io = this.chi().utente ? this.chi().utente.id : null;
      for (const r of this.db.righe("SELECT * FROM rapportini WHERE UPPER(stato) IN ('FIRMATO', 'INVIATO', 'FATTURATO') ORDER BY data DESC, id DESC")) {
        if (this.soloSuoi() && r.utente_id !== io) continue;
        if (!tocca(r.id_cliente, r.id_commessa, null)) continue;
        out.push({ tipo: 'rapportino', id: r.id, titolo: 'Rapportino ' + r.id, dettaglio: dataIt(dataIso(r.data)) + (r.descrizione ? ' · ' + r.descrizione : '') + ' · ' + String(r.stato).toLowerCase(),
          data: dataIso(r.data), pagina: 'rapportino' });
      }
    }
    if (this.livello('fatturazione') >= 1 && this.vedeCosti()) {
      for (const f of this.db.righe("SELECT * FROM fatture WHERE stato IN ('emessa', 'annullata') ORDER BY data DESC, id DESC")) {
        if (!tocca(f.cliente_id, f.commessa_id, null)) continue;
        out.push({ tipo: 'fattura', id: f.id, titolo: (f.tipo === 'nota' ? 'Nota di credito ' : 'Fattura ') + (f.numero || f.riferimento), dettaglio: dataIt(f.data) + (f.causale ? ' · ' + f.causale : ''),
          data: f.data || '', pagina: 'fattura' });
      }
    }
    if (this.livello('ticket') >= 1) {
      for (const c of this.db.righe('SELECT * FROM contratti ORDER BY dal DESC, id DESC')) {
        const impianti = this.db.righe('SELECT sede_id FROM contratto_impianti WHERE contratto_id = ?', c.id).map(x => x.sede_id);
        if (!tocca(c.cliente_id, c.commessa_id, idSede !== null && impianti.indexOf(idSede) >= 0 ? idSede : null)) continue;
        out.push({ tipo: 'contratto', id: c.id, titolo: 'Contratto ' + c.numero, dettaglio: c.titolo + ' · dal ' + dataIt(c.dal) + ' al ' + dataIt(c.al), data: c.dal, pagina: 'contratto' });
      }
    }
    return out.sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : 0));
  },

  /** La scadenza di un documento, breve. */
  scadenzaBreve(s) {
    const v = this.statoScadenza(s);
    return { id: s.id, data: s.data, statoVisto: v.statoVisto, giorni: v.giorni, ogniMesi: s.ogni_mesi === null ? null : s.ogni_mesi };
  },

  /** documento {id}: la voce dell'elenco piu' revisioni, condivisioni, scadenza, cronologia. */
  documentoCompleto(d) {
    const a = this.aiutiDocumenti([d]);
    const o = this.documentoDaRiga(d, a);
    const io = this.chi().utente ? this.chi().utente.id : null;
    const approva = this.puoApprovareDocumenti();
    const vive = (a.versioni[d.id] || []).filter(v => !v.tolta);
    const valida = vive.find(v => v.id === d.versione_valida_id);
    o.descrizione = d.descrizione;
    o.parole = d.parole;
    o.versioni = vive.slice().sort((x, y) => y.numero - x.numero || y.id - x.id).map(v => {
      let statoVisto = v.stato === 'da_approvare' ? 'Da approvare' : v.stato === 'respinta' ? 'Respinta' : valida && v.id === valida.id ? 'Valida' : 'Superata';
      if (v.stato === 'approvata' && !valida) statoVisto = 'Valida';
      return {
        id: v.id, numero: v.numero, statoVisto, nomeFile: v.nome_file, nomeDaScaricare: statoVisto === 'Superata' ? this.nomeSuperata(v.nome_file, v.numero) : v.nome_file,
        mime: v.mime, byte: v.byte, url: urlFile(v.file_id), nota: v.nota,
        caricataDa: v.caricata_da ? a.utenti[v.caricata_da] || '' : '', caricataIl: dataOraIso(v.caricata_il),
        decisaDa: v.decisa_da ? a.utenti[v.decisa_da] || '' : '', decisaIl: dataOraIso(v.decisa_il), motivoRifiuto: v.motivo_rifiuto,
        puoTogliere: v.stato !== 'approvata' && v.caricata_da === io && this.livello('documenti') >= 2,
      };
    });
    if (this.livello('documenti') >= 2) {
      o.condivisioni = this.db.righe('SELECT * FROM documento_condivisioni WHERE documento_id = ? ORDER BY id DESC', d.id).map(c => ({
        id: c.id, perChi: c.per_chi, scade: c.scade, revocata: !!c.revocata_il, scaduta: c.scade < oggi(), aperture: c.aperture,
        ultimaApertura: dataOraIso(c.ultima_apertura), creata: dataOraIso(c.creata),
      }));
    }
    o.cronologia = this.cronologiaDocumento(d, a);
    o.puoApprovare = approva && !!o.daApprovare && !d.archiviato;
    if (d.origine === 'collegamento') {
      o.righe = [];
      if (['onedrive', 'sharepoint', 'gdrive'].indexOf(d.collegamento_tipo) >= 0) o.righe.push('Le revisioni le tiene ' + D.PILLOLE[d.collegamento_tipo]);
      if (d.collegamento_tipo === 'percorso') o.righe.push('Si apre dal computer dello studio');
    }
    // Per chi ha caricato una revisione respinta: il motivo.
    o.mieRespinte = vive.filter(v => v.stato === 'respinta' && v.caricata_da === io).map(v => ({ numero: v.numero, motivo: v.motivo_rifiuto }));
    return o;
  },

  /** Il nome con cui /file/<id> manda un file: quello di una revisione superata lo dice in fondo. */
  nomeDaScaricare(f) {
    const nome = testo(f.nome) || f.id;
    if (f.versione_id === null || f.versione_id === undefined) return nome;
    const v = this.db.riga('SELECT * FROM documento_versioni WHERE id = ?', f.versione_id);
    const d = v ? this.db.riga('SELECT versione_valida_id FROM documenti WHERE id = ?', v.documento_id) : null;
    if (!v || !d || v.stato !== 'approvata' || v.tolta || d.versione_valida_id === v.id) return nome;
    const valida = d.versione_valida_id ? this.db.riga('SELECT numero FROM documento_versioni WHERE id = ?', d.versione_valida_id) : null;
    return valida && valida.numero > v.numero ? this.nomeSuperata(v.nome_file || nome, v.numero) : nome;
  },

  /** "Schema unifilare rev1.pdf" -> "Schema unifilare rev1 (rev. 1, superata).pdf". */
  nomeSuperata(nome, numero) {
    const m = String(nome || 'documento').match(/^(.*?)(\.[A-Za-z0-9]{1,6})?$/);
    return m[1] + ' (rev. ' + numero + ', superata)' + (m[2] || '');
  },

  /** La cronologia di un documento dal registro, con frasi pronte. */
  cronologiaDocumento(d, a) {
    const versioni = (a.versioni[d.id] || []).map(v => String(v.id));
    const numeri = {};
    (a.versioni[d.id] || []).forEach(v => { numeri[String(v.id)] = v.numero; });
    const condivisioni = this.db.righe('SELECT id FROM documento_condivisioni WHERE documento_id = ?', d.id).map(c => String(c.id));
    const righe = this.db.righe("SELECT * FROM registro WHERE (tabella = 'documenti' AND id_riga = ?)" +
      (versioni.length ? " OR (tabella = 'documento_versioni' AND id_riga IN (" + versioni.map(() => '?').join(',') + '))' : '') +
      (condivisioni.length ? " OR (tabella = 'documento_condivisioni' AND id_riga IN (" + condivisioni.map(() => '?').join(',') + '))' : '') +
      ' ORDER BY id', String(d.id), ...versioni, ...condivisioni);
    const out = [];
    for (const r of righe) {
      const chi = r.utente && r.utente !== 'sistema' ? r.utente : '';
      const dopo = r.dopo ? JSON.parse(r.dopo) : null;
      const prima = r.prima ? JSON.parse(r.prima) : null;
      let frase = '';
      if (r.tabella === 'documenti') {
        if (/^mandato per email a /.test(r.nota)) frase = r.nota.replace(/^mandato per email a /, 'Mandato a ') + (chi ? ' da ' + chi : '');
        else if (!prima) frase = /^migrazione/.test(r.nota) ? 'Entrato nell\'archivio dai documenti della commessa' : 'Aggiunto' + (chi ? ' da ' + chi : '');
        else if (r.nota === 'collegamento cambiato') frase = 'Collegamento cambiato' + (chi ? ' da ' + chi : '');
        else if (dopo && 'archiviato' in dopo) frase = (dopo.archiviato ? 'Archiviato' : 'Tolto dall\'archivio') + (chi ? ' da ' + chi : '');
        else if (dopo && Object.keys(dopo).some(k => ['versione_valida_id', 'scadenza_id'].indexOf(k) < 0)) frase = 'Cambiato' + (chi ? ' da ' + chi : '');
      } else if (r.tabella === 'documento_versioni') {
        const n = numeri[r.id_riga];
        if (!prima) frase = /^migrazione/.test(r.nota) ? '' : 'rev. ' + n + ' caricata' + (chi ? ' da ' + chi : '');
        else if (dopo && dopo.stato === 'approvata') frase = 'rev. ' + n + ' approvata' + (chi ? ' da ' + chi : '');
        else if (dopo && dopo.stato === 'respinta') frase = 'rev. ' + n + ' respinta' + (chi ? ' da ' + chi : '') + (dopo.motivo_rifiuto ? ': ' + dopo.motivo_rifiuto : '');
        else if (dopo && dopo.stato === 'da_approvare') frase = 'rev. ' + n + ' di nuovo da approvare' + (chi ? ' (' + chi + ')' : '');
        else if (dopo && 'tolta' in dopo) frase = 'rev. ' + n + (dopo.tolta ? ' tolta' : ' rimessa') + (chi ? ' da ' + chi : '');
      } else if (r.tabella === 'documento_condivisioni') {
        if (!prima && dopo) frase = 'Link per ' + (dopo.per_chi || 'il cliente') + ' fino al ' + dataIt(dopo.scade);
        else if (dopo && dopo.revocata_il) frase = 'Link revocato' + (chi ? ' da ' + chi : '');
      }
      if (frase) out.push({ quando: dataOraIso(r.quando), chi, testo: frase });
    }
    return out;
  },

  // ------------------------------------------------------------------ scrittura

  /** Il cliente, la commessa e l'impianto di un documento, controllati fra loro. */
  legamiDocumento(x, prima) {
    const p = prima || {};
    const v = {};
    // Fase 6: un documento di un collaboratore esterno usa cliente_id col suo F... (idSoggetto).
    if (x.idSoggetto !== undefined && x.idCliente === undefined) x = Object.assign({}, x, { idCliente: x.idSoggetto });
    let idCommessa = x.idCommessa !== undefined ? testo(x.idCommessa) : testo(p.commessa_id);
    let commessa = null;
    if (idCommessa) {
      commessa = this.db.riga('SELECT id, cliente_id FROM commesse WHERE id = ?', idCommessa);
      if (!commessa) throw new Rifiuto('Commessa ' + idCommessa + ' non trovata');
      idCommessa = commessa.id;
    }
    let idCliente = x.idCliente !== undefined ? testo(x.idCliente) : testo(p.cliente_id);
    const idSede = x.idSede !== undefined ? (vuoto(x.idSede) ? null : Number(x.idSede)) : (p.sede_id === undefined ? null : p.sede_id);
    let sede = null;
    if (idSede !== null) {
      sede = this.db.riga('SELECT * FROM sedi WHERE id = ?', idSede);
      if (!sede) throw new Rifiuto('Impianto ' + idSede + ' non trovato');
    }
    if (!idCliente && commessa) idCliente = commessa.cliente_id;
    if (!idCliente && sede) idCliente = sede.soggetto_id;
    if (idCliente && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', idCliente)) throw new Rifiuto('Cliente ' + idCliente + ' non trovato');
    const nome = id => (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', id) || {}).nome || id;
    if (sede && idCliente && sede.soggetto_id !== idCliente) throw new Rifiuto('L\'impianto ' + sede.id + ' è di ' + nome(sede.soggetto_id) + ', non di ' + nome(idCliente));
    if (commessa && idCliente && commessa.cliente_id && commessa.cliente_id !== idCliente) {
      throw new Rifiuto('La commessa ' + commessa.id + ' è di ' + nome(commessa.cliente_id) + ', non di ' + nome(idCliente));
    }
    const idTicket = x.idTicket !== undefined ? (vuoto(x.idTicket) ? null : this.idTicketDa(x.idTicket)) : (p.ticket_id === undefined ? null : p.ticket_id);
    if (idTicket !== null) {
      const t = this.rigaTicket(idTicket);
      if (idCliente && t.cliente_id !== idCliente) throw new Rifiuto('Il ticket ' + t.numero + ' è di ' + nome(t.cliente_id) + ', non di ' + nome(idCliente));
      if (!idCliente) idCliente = t.cliente_id;
    }
    const idContratto = x.idContratto !== undefined ? (vuoto(x.idContratto) ? null : Number(x.idContratto)) : (p.contratto_id === undefined ? null : p.contratto_id);
    if (idContratto !== null) {
      const c = this.db.riga('SELECT * FROM contratti WHERE id = ?', idContratto);
      if (!c) throw new Rifiuto('Contratto ' + idContratto + ' non trovato');
      if (idCliente && c.cliente_id !== idCliente) throw new Rifiuto('Il contratto ' + c.numero + ' è di ' + nome(c.cliente_id) + ', non di ' + nome(idCliente));
      if (!idCliente) idCliente = c.cliente_id;
    }
    Object.assign(v, { cliente_id: idCliente || '', commessa_id: idCommessa || '', sede_id: idSede, ticket_id: idTicket, contratto_id: idContratto });
    // Fase 6: la persona, il mezzo, lo strumento, l'incarico.
    const num = (k, col) => (x[k] !== undefined ? (vuoto(x[k]) ? null : Number(x[k])) : (p[col] === undefined ? null : p[col]));
    v.persona_id = num('idPersona', 'persona_id');
    if (v.persona_id !== null && !this.db.riga('SELECT id FROM persone WHERE id = ?', v.persona_id)) throw new Rifiuto('Persona ' + v.persona_id + ' non trovata');
    v.veicolo_id = num('idVeicolo', 'veicolo_id');
    if (v.veicolo_id !== null && !this.db.riga('SELECT id FROM veicoli WHERE id = ?', v.veicolo_id)) throw new Rifiuto('Mezzo ' + v.veicolo_id + ' non trovato');
    v.attrezzatura_id = num('idAttrezzatura', 'attrezzatura_id');
    if (v.attrezzatura_id !== null && !this.db.riga('SELECT id FROM attrezzature WHERE id = ?', v.attrezzatura_id)) throw new Rifiuto('Attrezzatura ' + v.attrezzatura_id + ' non trovata');
    v.incarico_id = num('idIncarico', 'incarico_id');
    if (v.incarico_id !== null && !this.db.riga('SELECT id FROM incarichi WHERE id = ?', v.incarico_id)) throw new Rifiuto('Incarico ' + v.incarico_id + ' non trovato');
    return v;
  },

  /** Chi vede il documento: di base la categoria; chi non e' titolare non scende sotto la categoria. */
  vedeDocumentoNuovo(x, categoria, prima) {
    const base = prima ? prima.vede : categoria.vede;
    let vede = x.vede !== undefined && testo(x.vede) ? testo(x.vede) : base;
    if (VEDE.indexOf(vede) < 0) throw new Rifiuto('Chi lo vede: tutti, costi o riservati');
    const titolare = this.chi().sistema || (this.chi().utente && this.chi().utente.ruolo === 'titolare');
    if (!titolare && LIVELLO_VEDE[vede] < LIVELLO_VEDE[categoria.vede]) vede = categoria.vede;
    if (!this.vedeLivello(vede)) throw senzaPermesso('mettere documenti che tu non vedresti');
    return vede;
  },

  /** La revisione nasce approvata se la categoria non chiede l'approvazione o se la carica chi approva. */
  statoRevisioneNuova(categoria) {
    if (!categoria.approvazione) return 'approvata';
    if (this.regolaApprovazione() === 'tutti') return 'da_approvare';
    return this.puoApprovareDocumenti() ? 'approvata' : 'da_approvare';
  },

  /** Una revisione nuova dal file f (gia' su disco). Torna l'id della revisione. */
  aggiungiVersione(idDoc, f, nota, stato, notaRegistro) {
    const max = this.db.riga('SELECT MAX(numero) n FROM documento_versioni WHERE documento_id = ? AND tolta IS NULL', idDoc);
    const n = max && max.n !== null ? max.n + 1 : 0;
    const io = this.chi().utente ? this.chi().utente.id : null;
    const ora = adesso();
    const v = {
      documento_id: idDoc, numero: n, file_id: f.id, nome_file: f.nome, mime: f.mime, byte: f.byte, sha256: f.sha256, nota: testo(nota),
      stato, caricata_da: io, caricata_il: ora,
    };
    if (stato === 'approvata') { v.decisa_da = io; v.decisa_il = ora; }
    const id = this.inserisci('documento_versioni', v, 'id', notaRegistro || (n ? 'caricata la rev. ' + n : ''));
    const dove = { documento_id: idDoc, versione_id: id };
    if (f.tipo === 'caricato') dove.tipo = 'documento';
    this.aggiorna('file', f.id, dove);
    this.ricalcolaValida(idDoc);
    return id;
  },

  /** La valida = l'approvata (non tolta) col numero piu' alto. */
  ricalcolaValida(idDoc) {
    const v = this.db.riga("SELECT id FROM documento_versioni WHERE documento_id = ? AND stato = 'approvata' AND tolta IS NULL ORDER BY numero DESC, id DESC LIMIT 1", idDoc);
    this.aggiorna('documenti', idDoc, { versione_valida_id: v ? v.id : null });
  },

  /**
   * salvaDocumento {documento: {...}} (fase5.md §10.1). Nuovo: origine "file"
   * vuole idFile (da /carica, o la foto di un ticket da mettere nell'archivio),
   * "collegamento" vuole url. Ripetuto con lo stesso idLocale: lo stesso.
   */
  salvaDocumento(d) {
    const x = (d && d.documento) || d || {};
    const ora = adesso();
    const io = this.chi().utente ? this.chi().utente.id : null;
    let prima = testo(x.id) ? this.rigaDocumento(x.id) : null;
    if (!prima && testo(x.idLocale)) {
      const gia = this.db.riga('SELECT * FROM documenti WHERE id_locale = ?', testo(x.idLocale));
      if (gia) {
        if (!this.vedeDocumento(gia)) throw new Rifiuto('Documento non trovato');
        return { ok: true, documento: this.documentoCompleto(gia), chiudeScadenza: null, giaArrivato: true };
      }
    }
    if (prima && !this.puoScrivereDocumento(prima)) throw senzaPermesso('cambiare i documenti degli altri');
    if (prima && prima.archiviato) throw new Rifiuto('Il documento è archiviato: ripristinalo prima di cambiarlo');
    const titolo = x.titolo !== undefined ? testo(x.titolo) : prima ? prima.titolo : '';
    if (!titolo) throw new Rifiuto('Titolo: scrivi di cosa si tratta');
    if (x.idCategoria === undefined && !prima) throw new Rifiuto('Categoria: scegli la categoria');
    const categoria = this.categoriaDocumento(x.idCategoria !== undefined ? x.idCategoria : prima.categoria_id);
    if (!categoria.attiva && (!prima || prima.categoria_id !== categoria.id)) throw new Rifiuto('Categoria: «' + categoria.nome + '» non si usa più');
    const legami = this.legamiDocumento(x, prima);
    // Fase 6: i documenti di una persona li carica chi ha persone 2 (quelli riservati con riservati 2); l'esterno solo i suoi.
    if (legami.persona_id && (!prima || prima.persona_id !== legami.persona_id)) {
      if (this.livello('persone') < 2) throw senzaPermesso('caricare i documenti delle persone');
      if (categoria.vede === 'riservati' && this.livello('riservati') < 2) throw senzaPermesso('caricare documenti riservati');
    }
    if (this.eEsterno()) {
      const mio = this.mioSoggetto();
      const catColl = this.categoriaDiSistema('Documenti dei collaboratori');
      const suo = legami.cliente_id === mio && !legami.commessa_id && !legami.persona_id && !legami.veicolo_id && !legami.attrezzatura_id && !legami.sede_id && !legami.ticket_id;
      if (!suo || !catColl || categoria.id !== catColl.id) throw senzaPermesso('caricare questo documento: carica i tuoi documenti dalla tua scheda');
    }
    const v = Object.assign({
      titolo, categoria_id: categoria.id,
      descrizione: x.descrizione !== undefined ? testo(x.descrizione) : prima ? prima.descrizione : '',
      parole: x.parole !== undefined ? testo(x.parole) : prima ? prima.parole : '',
      riferimento: x.riferimento !== undefined ? testo(x.riferimento) : prima ? prima.riferimento : '',
      data_documento: x.dataDocumento !== undefined ? (testo(x.dataDocumento) ? dataDaIso(x.dataDocumento) : '') : prima ? prima.data_documento : '',
      vede: this.vedeDocumentoNuovo(x, categoria, prima),
    }, legami);
    let notaRegistro = '';
    if (prima) {
      if (prima.origine === 'collegamento') {
        if (x.url !== undefined) {
          const t = D.tipoCollegamento(x.url);
          if (t.url !== prima.url) notaRegistro = 'collegamento cambiato';
          v.url = t.url;
          v.collegamento_tipo = t.tipo;
          if (x.cartella === undefined && t.url !== prima.url) v.cartella = t.cartella ? 1 : 0;
        }
        if (x.cartella !== undefined) v.cartella = si(x.cartella) ? 1 : 0;
        if (x.principale !== undefined) v.principale = si(x.principale) ? 1 : 0;
      }
      this.controllaCartellaPrincipale(Object.assign({}, prima, v), prima.id);
      this.aggiorna('documenti', prima.id, Object.assign(v, { modificato: ora }), 'id', notaRegistro);
    } else {
      const origine = testo(x.origine) || (testo(x.url) ? 'collegamento' : 'file');
      if (['file', 'collegamento'].indexOf(origine) < 0) throw new Rifiuto('Origine: file o collegamento');
      let file = null;
      if (origine === 'file') {
        if (!testo(x.idFile)) throw new Rifiuto('Carica il file o incolla il collegamento');
        file = this.fileDaArchiviare(x.idFile, legami.ticket_id);
        this.controllaSpazio('documento');
      } else {
        if (vuoto(x.url)) throw new Rifiuto('Carica il file o incolla il collegamento');
        const t = D.tipoCollegamento(x.url);
        v.url = t.url;
        v.collegamento_tipo = t.tipo;
        v.cartella = x.cartella !== undefined ? (si(x.cartella) ? 1 : 0) : (t.cartella ? 1 : 0);
        v.principale = si(x.principale) ? 1 : 0;
        this.controllaCartellaPrincipale(v, null);
      }
      const id = this.inserisci('documenti', Object.assign(v, {
        id_locale: testo(x.idLocale) || null, origine, creato_da: io, creato: ora, modificato: ora,
      }));
      if (file) this.aggiungiVersione(id, file, x.nota, this.statoRevisioneNuova(categoria), '');
      prima = null;
      x.id = id;
    }
    const idDoc = prima ? prima.id : Number(x.id);
    // Fase 6: un documento di un collaboratore col suo tipo (DURC, visura...) prende la scadenza proposta (§4.5).
    if (x.scadenza === undefined && testo(x.tipoScadenza)) x.scadenza = { tipo: testo(x.tipoScadenza) };
    if (x.scadenza !== undefined) this.scadenzaDelDocumento(idDoc, x.scadenza);
    const doc = this.db.riga('SELECT * FROM documenti WHERE id = ?', idDoc);
    return { ok: true, documento: this.documentoCompleto(doc), chiudeScadenza: prima ? null : this.scadenzaDaChiudere(doc) };
  },

  /** Il file da archiviare: quello di /carica, oppure la foto di un ticket (resta anche del ticket). */
  fileDaArchiviare(idFile, idTicket) {
    const f = this.db.riga('SELECT * FROM file WHERE id = ?', testo(idFile));
    if (f && f.tipo === 'ticket' && !f.cestinato) {
      const t = this.rigaTicket(f.ticket_id);
      if (idTicket !== null && idTicket !== undefined && idTicket !== t.id) throw new Rifiuto('La foto è del ticket ' + t.numero);
      if (f.documento_id) {
        const d = this.db.riga('SELECT titolo FROM documenti WHERE id = ?', f.documento_id);
        throw new Rifiuto('Questa foto è già nell\'archivio: «' + (d ? d.titolo : f.documento_id) + '»');
      }
      return f;
    }
    return this.fileDaLegare(idFile);
  },

  /** Una sola cartella principale per commessa e per cliente (anche l'indice del database lo garantisce). */
  controllaCartellaPrincipale(v, tranneId) {
    if (v.principale !== 1 || v.origine === 'file') return;
    if (v.principale === 1 && !v.cartella) throw new Rifiuto('Solo una cartella può essere la cartella principale');
    let altra = null;
    if (testo(v.commessa_id)) {
      altra = this.db.riga('SELECT * FROM documenti WHERE principale = 1 AND commessa_id = ? COLLATE NOCASE AND archiviato IS NULL AND id <> ?', v.commessa_id, tranneId || 0);
      if (altra) throw new Rifiuto('La commessa ' + v.commessa_id + ' ha già la sua cartella: «' + altra.titolo + '»');
    } else if (testo(v.cliente_id)) {
      altra = this.db.riga("SELECT * FROM documenti WHERE principale = 1 AND commessa_id = '' AND cliente_id = ? AND archiviato IS NULL AND id <> ?", v.cliente_id, tranneId || 0);
      const nome = (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', v.cliente_id) || {}).nome || v.cliente_id;
      if (altra) throw new Rifiuto(nome + ' ha già la sua cartella: «' + altra.titolo + '»');
    } else {
      throw new Rifiuto('La cartella principale è di una commessa o di un cliente: scegli a cosa è legata');
    }
  },

  /** La scadenza di un documento: {data, ogniMesi?, preavvisoGiorni?, tipo?} la crea o la cambia, null la toglie. */
  scadenzaDelDocumento(idDoc, s) {
    const doc = this.db.riga('SELECT * FROM documenti WHERE id = ?', idDoc);
    const attuale = doc.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', doc.scadenza_id) : null;
    if (s === null || s === false) {
      if (attuale && attuale.stato === 'aperta') this.aggiorna('scadenze', attuale.id, { stato: 'annullata', motivo: 'tolta dal documento', modificato: adesso() });
      this.aggiorna('documenti', idDoc, { scadenza_id: null });
      return;
    }
    if (!s || typeof s !== 'object') return;
    const cat = this.db.riga('SELECT nome FROM documento_categorie WHERE id = ?', doc.categoria_id) || {};
    const tipo = testo(s.tipo) || (cat.nome === 'Polizze e assicurazioni' ? 'polizza' : 'documento');
    const dati = {
      titolo: doc.titolo + ' scade', tipo, idCliente: doc.cliente_id, idSede: doc.sede_id, idDocumento: doc.id, data: s.data,
      ogniMesi: s.ogniMesi, preavvisoGiorni: s.preavvisoGiorni,
      // Fase 6: la scadenza di un documento di una persona, di un mezzo o di uno strumento e' loro.
      idPersona: doc.persona_id, idVeicolo: doc.veicolo_id, idAttrezzatura: doc.attrezzatura_id,
    };
    // Fase 6: i documenti dei collaboratori (DURC 120 giorni, visura 6 mesi, polizza, idoneita', albo 12 mesi).
    const coll = cat.nome === 'Documenti dei collaboratori' && ['durc', 'visura', 'idoneita', 'polizza', 'albo'].indexOf(tipo) >= 0;
    if (coll) {
      const p = this.propostaScadenzaCollaboratore(tipo, doc.data_documento, doc.cliente_id);
      dati.titolo = p.titolo;
      if (!testo(s.data)) dati.data = p.data;
      if (s.preavvisoGiorni === undefined) dati.preavvisoGiorni = p.preavvisoGiorni;
    }
    if (attuale && attuale.stato === 'aperta') dati.id = attuale.id;
    const r = this.chi().sistema || !this.eEsterno() ? this.salvaScadenza({ scadenza: dati }) : this.come(Object.assign({}, this.chi(), { sistema: true }), () => this.salvaScadenza({ scadenza: dati }));
    this.aggiorna('documenti', idDoc, { scadenza_id: r.scadenza.id });
    // Il documento nuovo dello stesso tipo sostituisce quello di prima: la sua scadenza e' fatta.
    if (coll && !attuale) {
      for (const vecchia of this.db.righe("SELECT * FROM scadenze WHERE cliente_id = ? AND tipo = ? AND stato = 'aperta' AND id <> ?", doc.cliente_id, tipo, r.scadenza.id)) {
        this.aggiorna('scadenze', vecchia.id, { stato: 'fatta', fatta_il: doc.data_documento || oggi(), documento_fatto_id: doc.id, modificato: adesso() });
      }
    }
  },

  /** "È la verifica che chiude la scadenza del 12/01/2027?" (§6.1): la scadenza aperta di una verifica dello stesso impianto. */
  scadenzaDaChiudere(doc) {
    if (!doc.sede_id || doc.origine !== 'file') return null;
    const cat = this.db.riga('SELECT nome FROM documento_categorie WHERE id = ?', doc.categoria_id) || {};
    const verbale = cat.nome === 'Verbali di verifica';
    const s = this.db.riga("SELECT * FROM scadenze WHERE stato = 'aperta' AND sede_id = ? AND tipo IN ('verifica_terra', 'verifica_scariche', 'verifica_protezioni') AND IFNULL(documento_id, 0) <> ? ORDER BY data LIMIT 1",
      doc.sede_id, doc.id);
    if (!s || (!verbale && !doc.riferimento)) return verbale && s ? { id: s.id, titolo: s.titolo, data: s.data } : null;
    return { id: s.id, titolo: s.titolo, data: s.data };
  },

  /** caricaVersione {id, idFile, nota} (§5.2). */
  caricaVersione(d) {
    const doc = this.rigaDocumento(d.id);
    if (!this.puoScrivereDocumento(doc)) throw senzaPermesso('caricare revisioni sui documenti degli altri');
    if (doc.origine !== 'file') throw new Rifiuto(doc.origine === 'collegamento' ? 'Un collegamento non ha revisioni: le tiene ' + (D.PILLOLE[doc.collegamento_tipo] || 'il posto dove sta il file') : 'Le copie mandate ai clienti non hanno revisioni');
    if (doc.archiviato) throw new Rifiuto('Il documento è archiviato: ripristinalo prima di cambiarlo');
    const f = this.db.riga('SELECT * FROM file WHERE id = ?', testo(d.idFile));
    // La coda del telefono che ripete: lo stesso file e' gia' una revisione di questo documento.
    if (f && f.versione_id && f.documento_id === doc.id) return { ok: true, documento: this.documentoCompleto(doc), giaArrivato: true };
    const n = this.db.riga('SELECT COUNT(*) n FROM documento_versioni WHERE documento_id = ? AND tolta IS NULL', doc.id).n;
    if (n > 0 && !testo(d.nota)) throw new Rifiuto('Scrivi cosa cambia in questa revisione');
    const file = this.fileDaLegare(d.idFile);
    this.controllaSpazio('documento');
    const categoria = this.categoriaDocumento(doc.categoria_id);
    this.aggiungiVersione(doc.id, file, d.nota, this.statoRevisioneNuova(categoria));
    this.aggiorna('documenti', doc.id, { modificato: adesso() });
    return { ok: true, documento: this.documentoCompleto(this.db.riga('SELECT * FROM documenti WHERE id = ?', doc.id)) };
  },

  rigaVersione(id) {
    const v = this.db.riga('SELECT * FROM documento_versioni WHERE id = ?', Number(id) || 0);
    if (!v) throw new Rifiuto('Revisione ' + testo(id) + ' non trovata');
    const doc = this.rigaDocumento(v.documento_id);
    return { v, doc };
  },

  /** approvaVersione {id}, respingiVersione {id, motivo}, annullaDecisione {id} (§5.2): chi approva. */
  decidiVersione(d, decisione) {
    if (!this.puoApprovareDocumenti()) throw senzaPermesso('approvare i documenti');
    const { v, doc } = this.rigaVersione(d.id);
    if (v.tolta) throw new Rifiuto('La rev. ' + v.numero + ' è stata tolta');
    if (doc.archiviato) throw new Rifiuto('Il documento è archiviato: ripristinalo prima di cambiarlo');
    const io = this.chi().utente ? this.chi().utente.id : null;
    const ora = adesso();
    if (decisione === 'approva') {
      if (v.stato === 'approvata') throw new Rifiuto('La rev. ' + v.numero + ' è già approvata');
      this.aggiorna('documento_versioni', v.id, { stato: 'approvata', decisa_da: io, decisa_il: ora, motivo_rifiuto: '' }, 'id', 'rev. ' + v.numero + ' approvata');
    } else if (decisione === 'respingi') {
      const motivo = testo(d.motivo);
      if (!motivo) throw new Rifiuto('Scrivi il motivo: arriva a chi l\'ha caricata');
      if (v.stato === 'respinta' && v.motivo_rifiuto === motivo) return { ok: true, documento: this.documentoCompleto(doc) };
      if (v.stato === 'approvata') throw new Rifiuto('La rev. ' + v.numero + ' è già approvata');
      this.aggiorna('documento_versioni', v.id, { stato: 'respinta', decisa_da: io, decisa_il: ora, motivo_rifiuto: motivo }, 'id', 'rev. ' + v.numero + ' respinta: ' + motivo);
    } else {
      if (v.stato === 'da_approvare') return { ok: true, documento: this.documentoCompleto(doc) };
      this.aggiorna('documento_versioni', v.id, { stato: 'da_approvare', decisa_da: null, decisa_il: '', motivo_rifiuto: '' }, 'id', 'rev. ' + v.numero + ' di nuovo da approvare');
    }
    this.ricalcolaValida(doc.id);
    this.aggiorna('documenti', doc.id, { modificato: ora });
    return { ok: true, documento: this.documentoCompleto(this.db.riga('SELECT * FROM documenti WHERE id = ?', doc.id)) };
  },

  /** togliVersione {id, annulla?}: solo chi l'ha caricata, solo da approvare o respinta (il file va nel cestino). */
  togliVersione(d) {
    const { v, doc } = this.rigaVersione(d.id);
    const io = this.chi().utente ? this.chi().utente.id : null;
    if (v.caricata_da !== io && !this.chi().sistema) throw senzaPermesso('togliere le revisioni caricate da altri');
    if (v.stato === 'approvata') throw new Rifiuto('Una revisione approvata non si toglie: carica una revisione nuova');
    const annulla = si(d.annulla);
    if (annulla ? !v.tolta : !!v.tolta) return { ok: true, documento: this.documentoCompleto(doc) };
    const ora = adesso();
    this.aggiorna('documento_versioni', v.id, { tolta: annulla ? null : ora });
    const f = this.db.riga('SELECT * FROM file WHERE id = ?', v.file_id);
    if (f && f.tipo === 'documento') this.aggiorna('file', f.id, { cestinato: annulla ? null : ora });
    this.ricalcolaValida(doc.id);
    this.aggiorna('documenti', doc.id, { modificato: ora });
    return { ok: true, documento: this.documentoCompleto(this.db.riga('SELECT * FROM documenti WHERE id = ?', doc.id)) };
  },

  /**
   * archiviaDocumento {id, archiviato?, togliScadenza?}: esce dagli elenchi (si
   * ritrova con archiviati: true). Con una scadenza aperta la prima risposta
   * chiede se toglierla (serveConferma); togliScadenza true la toglie, false la tiene.
   */
  archiviaDocumento(d) {
    const doc = this.db.riga('SELECT * FROM documenti WHERE id = ?', Number(d.id) || 0);
    if (!doc || !this.vedeDocumento(doc)) throw new Rifiuto('Documento ' + testo(d.id) + ' non trovato');
    if (!this.puoScrivereDocumento(doc)) throw senzaPermesso('archiviare i documenti degli altri');
    const archivia = d.archiviato === undefined ? true : si(d.archiviato);
    if (archivia === !!doc.archiviato) return { ok: true, documento: this.documentoCompleto(doc) };
    const ora = adesso();
    if (archivia && doc.scadenza_id) {
      const s = this.db.riga("SELECT * FROM scadenze WHERE id = ? AND stato = 'aperta'", doc.scadenza_id);
      if (s && d.togliScadenza === undefined) {
        return { ok: false, errore: 'Ha una scadenza aperta il ' + dataIt(s.data) + ': la tolgo?', serveConferma: true, scadenza: this.scadenzaBreve(s) };
      }
      if (s && si(d.togliScadenza)) this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo: 'documento archiviato', modificato: ora });
    }
    if (!archivia) this.controllaCartellaPrincipale(Object.assign({}, doc, { archiviato: null }), doc.id);
    this.aggiorna('documenti', doc.id, { archiviato: archivia ? ora : null, modificato: ora });
    return { ok: true, documento: this.documentoCompleto(this.db.riga('SELECT * FROM documenti WHERE id = ?', doc.id)) };
  },

  // ------------------------------------------------------------------ mandare e condividere (§5.8)

  /** inviaDocumento {id, idVersione?, a, cc?, oggetto?, messaggio?}: l'allegato (o il collegamento) dal postino. */
  async inviaDocumento(d) {
    const doc = this.rigaDocumento(d.id);
    const a = testo(d.a);
    if (!a) throw new Rifiuto('Manca l\'indirizzo del cliente');
    if (!this.postino || !this.postino.configurato()) throw new Rifiuto('Le email non sono collegate: manca il postino (WISPER_POSTINO_URL nel .env del server)');
    const imp = this.leggiImpostazioni();
    const testi = this.testiModelli();
    const valori = this.valoriSegnaposti({ idCliente: doc.cliente_id, idSede: doc.sede_id, idCommessa: doc.commessa_id, idTicket: doc.ticket_id });
    valori.documento = doc.titolo;
    const posta = { a, nome: testo(imp.RAGIONE_SOCIALE) || 'Wisper' };
    posta.oggetto = testo(d.oggetto) || D.riempi(testi.EMAIL_DOCUMENTO_OGGETTO, valori).testo || doc.titolo;
    let messaggio = testo(d.messaggio) || D.riempi(testi.EMAIL_DOCUMENTO_MESSAGGIO, valori).testo;
    if (doc.origine === 'collegamento') {
      if (doc.collegamento_tipo === 'percorso') throw new Rifiuto('Un percorso del computer non si può mandare');
      messaggio = (messaggio ? messaggio + '\n\n' : '') + doc.url;
    } else {
      const versioni = this.db.righe('SELECT * FROM documento_versioni WHERE documento_id = ? AND tolta IS NULL', doc.id);
      const st = this.statoDocumento(doc, versioni);
      const v = testo(d.idVersione) ? versioni.find(x => x.id === Number(d.idVersione)) : st.daAprire;
      if (!v) throw new Rifiuto('Revisione ' + testo(d.idVersione) + ' non trovata');
      const f = this.db.riga('SELECT * FROM file WHERE id = ?', v.file_id);
      if (!f || !f.percorso || f.svuotato || !fs.existsSync(this.percorsoFile(f.percorso))) throw new Rifiuto('Il file non è sul NAS: non si può mandare');
      const massimo = numero(imp.EMAIL_ALLEGATI_MAX_MB) || 15;
      if (f.byte > massimo * MB) throw new Rifiuto('Il file è di ' + Math.round(f.byte / MB) + ' MB: per email ne passano al massimo ' + massimo);
      posta.allegati = [{ nome: v.nome_file, mime: v.mime || 'application/octet-stream', base64: fs.readFileSync(this.percorsoFile(f.percorso)).toString('base64') }];
    }
    posta.messaggio = messaggio || ' ';
    if (testo(d.cc)) posta.cc = testo(d.cc);
    if (testo(imp.EMAIL)) posta.rispondiA = testo(imp.EMAIL);
    try {
      await this.postino.email(posta);
    } catch (err) {
      throw new Rifiuto('L\'email non è partita: ' + err.message, err.rete ? { rete: true } : {});
    }
    return this.db.transazione(() => {
      this.annota('documenti', doc.id, null, null, 'mandato per email a ' + a);
      return { ok: true };
    });
  },

  /**
   * La copia di quello che parte (COPIA_INVIATI, §5.8): gli allegati di
   * un'email mandata da Wisper diventano documenti "inviato" nella categoria
   * Mandati ai clienti. Non ferma mai l'email: se il disco e' pieno o il file e'
   * troppo grande, la copia non si tiene e il registro lo dice.
   */
  copiaInviati({ allegati, a, idCliente, idCommessa, idTicket }) {
    const imp = this.leggiImpostazioni();
    if (imp.COPIA_INVIATI === false || imp.COPIA_INVIATI === 'false' || imp.COPIA_INVIATI === 'NO') return [];
    const categoria = this.categoriaDiSistema('Mandati ai clienti');
    if (!categoria || !Array.isArray(allegati) || !allegati.length) return [];
    try {
      this.controllaSpazio('documento');
    } catch (e) {
      this.annota('documenti', '', null, null, 'copia del PDF mandato a ' + a + ' non tenuta: disco quasi pieno');
      return [];
    }
    const fatti = [];
    const ora = adesso();
    for (const x of allegati) {
      const dati = Buffer.from(String(x.base64 || ''), 'base64');
      if (!dati.length || dati.length > this.fileMaxByte()) continue;
      let mime;
      try {
        mime = D.tipoDaSalvare(x.mime || 'application/pdf', dati.subarray(0, 512));
      } catch (e) {
        continue;
      }
      const nome = testo(x.nome) || 'documento.pdf';
      const f = this.salvaFile({ dati, nome, mime, tipo: 'inviato' });
      const legami = { cliente_id: testo(idCliente), commessa_id: testo(idCommessa), ticket_id: idTicket || null };
      if (legami.commessa_id && !this.db.riga('SELECT id FROM commesse WHERE id = ?', legami.commessa_id)) legami.commessa_id = '';
      if (legami.cliente_id && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', legami.cliente_id)) legami.cliente_id = '';
      const idDoc = this.inserisci('documenti', Object.assign({
        titolo: nome.replace(/\.[A-Za-z0-9]{1,5}$/, ''), categoria_id: categoria.id, origine: 'inviato', vede: categoria.vede,
        data_documento: oggi(), creato_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
      }, legami), 'id', 'copia del PDF mandato a ' + a);
      this.aggiungiVersione(idDoc, f, 'mandato a ' + a + ' il ' + dataIt(oggi()), 'approvata', 'copia del PDF mandato a ' + a);
      fatti.push(idDoc);
    }
    return fatti;
  },

  /** condividiDocumento {id, perChi, giorni?}: il link che scade (Non collegato finche' CONDIVISIONE_INDIRIZZO e' vuoto). */
  condividiDocumento(d) {
    const doc = this.rigaDocumento(d.id);
    const imp = this.leggiImpostazioni();
    const indirizzo = testo(imp.CONDIVISIONE_INDIRIZZO).replace(/\/+$/, '');
    if (!indirizzo) return { ok: false, errore: 'I link per i clienti non sono collegati: manda il documento per email', nonCollegato: true };
    if (doc.origine === 'collegamento') throw new Rifiuto('Un collegamento si condivide da ' + (D.PILLOLE[doc.collegamento_tipo] || 'dove sta il file') + ': il link per i clienti è per i file sul NAS');
    if (!this.puoScrivereDocumento(doc)) throw senzaPermesso('condividere questo documento');
    const perChi = testo(d.perChi);
    if (!perChi) throw new Rifiuto('Per chi: scrivi a chi lo mandi');
    const giorni = vuoto(d.giorni) ? Math.round(numero(imp.CONDIVISIONE_GIORNI)) || 14 : Math.round(numero(d.giorni));
    if (!(giorni >= 1 && giorni <= 90)) throw new Rifiuto('Giorni: da 1 a 90');
    const st = this.statoDocumento(doc, this.db.righe('SELECT * FROM documento_versioni WHERE documento_id = ? AND tolta IS NULL', doc.id));
    if (!st.valida) throw new Rifiuto('Il documento non ha ancora una revisione valida');
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const scade = piuGiorni(oggi(), giorni);
    const id = this.inserisci('documento_condivisioni', {
      documento_id: doc.id, versione_id: st.valida.id, token_hash: hash, per_chi: perChi, scade, aperture: 0,
      creata_da: this.chi().utente ? this.chi().utente.id : null, creata: adesso(),
    }, 'id', 'link per ' + perChi + ' fino al ' + dataIt(scade));
    return { ok: true, link: indirizzo + '/condiviso/' + token, condivisione: { id, perChi, scade, aperture: 0 } };
  },

  revocaCondivisione(d) {
    const c = this.db.riga('SELECT * FROM documento_condivisioni WHERE id = ?', Number(d.id) || 0);
    if (!c) throw new Rifiuto('Link ' + testo(d.id) + ' non trovato');
    const doc = this.rigaDocumento(c.documento_id);
    if (!this.puoScrivereDocumento(doc)) throw senzaPermesso('revocare questo link');
    if (!c.revocata_il) this.aggiorna('documento_condivisioni', c.id, { revocata_il: adesso() }, 'id', 'link revocato');
    return { ok: true, documento: this.documentoCompleto(doc) };
  },

  /** /condiviso/<token> (la seconda porta): la condivisione valida, o null. Conta l'apertura. */
  aperturaCondivisa(token, conta) {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(String(token || ''))) return null;
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const c = this.db.riga('SELECT * FROM documento_condivisioni WHERE token_hash = ?', hash);
    if (!c || c.revocata_il || c.scade < oggi()) return null;
    if (!testo(this.leggiImpostazioni().CONDIVISIONE_INDIRIZZO)) return null;
    const doc = this.db.riga('SELECT * FROM documenti WHERE id = ?', c.documento_id);
    const v = this.db.riga('SELECT * FROM documento_versioni WHERE id = ?', c.versione_id);
    const f = v ? this.db.riga('SELECT * FROM file WHERE id = ?', v.file_id) : null;
    if (!doc || doc.archiviato || !v || !f || !f.percorso || f.svuotato) return null;
    if (conta) this.db.esegui('UPDATE documento_condivisioni SET aperture = aperture + 1, ultima_apertura = ? WHERE id = ?', adesso(), c.id);
    return { condivisione: c, documento: doc, versione: v, file: f, studio: testo(this.leggiImpostazioni().RAGIONE_SOCIALE) || 'Studio' };
  },

  // ------------------------------------------------------------------ categorie

  leggiCategorie() {
    const conte = {};
    this.db.righe('SELECT categoria_id, COUNT(*) n FROM documenti WHERE archiviato IS NULL GROUP BY categoria_id').forEach(r => { conte[r.categoria_id] = r.n; });
    return this.db.righe('SELECT * FROM documento_categorie ORDER BY ordine, id').filter(c => this.vedeLivello(c.vede) || this.chi().sistema).map(c => ({
      id: c.id, nome: c.nome, approvazione: c.approvazione === 1, vede: c.vede, scadenzaMesi: c.scadenza_mesi === null ? null : c.scadenza_mesi,
      ordine: c.ordine, attiva: c.attiva === 1, sistema: c.sistema === 1, documenti: conte[c.id] || 0,
    }));
  },

  /** salvaCategoria {categoria: {id?, nome, approvazione, vede, scadenzaMesi, attiva, ordine?}} (amministrazione 2). */
  salvaCategoria(d) {
    const x = (d && d.categoria) || d || {};
    const prima = testo(x.id) ? this.db.riga('SELECT * FROM documento_categorie WHERE id = ?', Number(x.id)) : null;
    if (testo(x.id) && !prima) throw new Rifiuto('Categoria ' + x.id + ' non trovata');
    const nome = x.nome !== undefined ? testo(x.nome) : prima ? prima.nome : '';
    if (!nome) throw new Rifiuto('Nome: scrivi il nome della categoria');
    const doppia = this.db.riga('SELECT id FROM documento_categorie WHERE LOWER(nome) = LOWER(?) AND id <> ?', nome, prima ? prima.id : 0);
    if (doppia) throw new Rifiuto('Nome: c\'è già una categoria «' + nome + '»');
    const vede = x.vede !== undefined ? testo(x.vede) : prima ? prima.vede : 'tutti';
    if (VEDE.indexOf(vede) < 0) throw new Rifiuto('Chi la vede: tutti, costi o riservati');
    let mesi = x.scadenzaMesi !== undefined ? (vuoto(x.scadenzaMesi) ? null : Math.round(numero(x.scadenzaMesi))) : prima ? prima.scadenza_mesi : null;
    if (mesi !== null && !(mesi >= 1 && mesi <= 120)) throw new Rifiuto('Scadenza proposta: da 1 a 120 mesi');
    const attiva = x.attiva !== undefined ? (si(x.attiva) ? 1 : 0) : prima ? prima.attiva : 1;
    if (prima && prima.sistema && !attiva) throw new Rifiuto('«' + prima.nome + '» serve a Wisper: si rinomina, non si toglie');
    const v = { nome, vede, scadenza_mesi: mesi, attiva, approvazione: x.approvazione !== undefined ? (si(x.approvazione) ? 1 : 0) : prima ? prima.approvazione : 0 };
    if (x.ordine !== undefined) v.ordine = Math.round(numero(x.ordine));
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('documento_categorie', id, v);
    } else {
      const max = this.db.riga('SELECT MAX(ordine) n FROM documento_categorie').n || 0;
      id = this.inserisci('documento_categorie', Object.assign({ ordine: max + 1, sistema: 0 }, v));
    }
    return { ok: true, categoria: this.leggiCategorie().find(c => c.id === id), categorie: this.leggiCategorie() };
  },

  // ------------------------------------------------------------------ modelli e testi (§5.7)

  /** I testi dei modelli: quelli di modelli_testi piu' PREVENTIVO_CONDIZIONI (resta un'impostazione). */
  testiModelli() {
    const o = {};
    this.db.righe('SELECT chiave, testo FROM modelli_testi').forEach(r => { o[r.chiave] = r.testo; });
    o.PREVENTIVO_CONDIZIONI = testo(this.leggiImpostazioni().PREVENTIVO_CONDIZIONI);
    return o;
  },

  leggiModelli() {
    const testi = this.testiModelli();
    const info = {};
    this.db.righe('SELECT * FROM modelli_testi').forEach(r => { info[r.chiave] = r; });
    const utenti = {};
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { utenti[u.id] = u.nome; });
    const wisper = MODELLI.map(m => ({
      chiave: m.chiave, nome: m.nome, impaginazione: 'fissa',
      testi: m.testi.map(k => ({
        chiave: k, nome: NOMI_TESTI[k] || k, testo: testi[k] || '', segnaposti: D.segnapostiIn(testi[k]).filter((x, i, l) => l.indexOf(x) === i),
        modificato: info[k] ? dataOraIso(info[k].modificato) : '', modificatoDa: info[k] && info[k].modificato_da ? utenti[info[k].modificato_da] || '' : '',
      })),
    }));
    const cat = this.categoriaDiSistema('Modelli dello studio');
    const studio = cat ? this.leggiDocumenti({ idCategoria: cat.id }).documenti : [];
    return { ok: true, wisper, studio, segnaposti: D.SEGNAPOSTI.slice(), lettere: Object.keys(TITOLI_LETTERE).map(k => ({ chiave: k, nome: NOMI_TESTI[k] })) };
  },

  /** salvaTestoModello {chiave, testo} (amministrazione 2): un segnaposto sconosciuto si rifiuta. */
  salvaTestoModello(d) {
    const chiave = testo(d.chiave);
    const t = d.testo === undefined || d.testo === null ? '' : String(d.testo);
    const tutte = [].concat(...MODELLI.map(m => m.testi));
    if (tutte.indexOf(chiave) < 0) throw new Rifiuto('Testo sconosciuto: ' + chiave);
    D.controllaSegnaposti(t);
    if (chiave === 'PREVENTIVO_CONDIZIONI') {
      this.salvaImpostazioni({ PREVENTIVO_CONDIZIONI: t });
    } else {
      const io = this.chi().utente ? this.chi().utente.id : null;
      if (this.db.riga('SELECT chiave FROM modelli_testi WHERE chiave = ?', chiave)) {
        this.aggiorna('modelli_testi', chiave, { testo: t, modificato: adesso(), modificato_da: io }, 'chiave');
      } else {
        this.inserisci('modelli_testi', { chiave, testo: t, modificato: adesso(), modificato_da: io }, 'chiave');
      }
    }
    return this.leggiModelli();
  },

  /** I valori dei segnaposti per un cliente, impianto, commessa, ticket, contratto, scadenza. */
  valoriSegnaposti(d) {
    const imp = this.leggiImpostazioni();
    const v = { oggi: dataIt(oggi()), studio: testo(imp.RAGIONE_SOCIALE), tecnico: this.soloSuoi() ? this.chi().utente.nome : testo(imp.TECNICO) };
    let idCliente = testo(d.idCliente);
    let idSede = vuoto(d.idSede) ? null : Number(d.idSede);
    let idCommessa = testo(d.idCommessa);
    // Fase 6: la lettera d'incarico (collaboratore, incarico, compenso solo con "costi", descrizione, dal, al, commessa).
    if (!vuoto(d.idIncarico)) {
      const i = this.rigaIncarico(d.idIncarico);
      v.collaboratore = (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', i.soggetto_id) || {}).nome || '';
      v.incarico = i.numero + ' · ' + i.titolo;
      v.descrizione = i.descrizione || i.titolo;
      if (i.dal) v.dal = dataIt(i.dal);
      if (i.al) v.al = dataIt(i.al);
      if (this.vedeCosti()) {
        v.compenso = i.modo === 'ore' ? C.euroIt(i.tariffa) + ' euro l\'ora' + (i.ore_previste ? ' per ' + String(i.ore_previste).replace('.', ',') + ' ore previste' : '') + (i.tetto ? ', al massimo ' + C.euroIt(i.tetto) + ' euro' : '')
          : C.euroIt(i.compenso) + ' euro a corpo';
      }
      if (!idCommessa) idCommessa = i.commessa_id;
    }
    let idContratto = vuoto(d.idContratto) ? null : Number(d.idContratto);
    let scad = null;
    if (!vuoto(d.idScadenza)) {
      scad = this.db.riga('SELECT * FROM scadenze WHERE id = ?', Number(d.idScadenza));
      if (!scad) throw new Rifiuto('Scadenza ' + testo(d.idScadenza) + ' non trovata');
      if (!idCliente) idCliente = scad.cliente_id;
      if (idSede === null) idSede = scad.sede_id;
      if (idContratto === null) idContratto = scad.contratto_id;
    }
    if (!vuoto(d.idTicket)) {
      const t = this.rigaTicket(d.idTicket);
      v.ticket = t.numero;
      if (!idCliente) idCliente = t.cliente_id;
      if (idSede === null) idSede = t.sede_id;
      if (!idCommessa) idCommessa = t.commessa_id;
      if (idContratto === null) idContratto = t.contratto_id;
    }
    if (idContratto !== null) {
      const c = this.db.riga('SELECT * FROM contratti WHERE id = ?', idContratto);
      if (!c) throw new Rifiuto('Contratto ' + idContratto + ' non trovato');
      v.contratto = c.numero;
      v.dal = dataIt(c.dal);
      v.al = dataIt(c.al);
      if (this.vedeCosti() && c.canone !== null) v.canone = C.euroIt(c.canone) + ' euro';
      if (!idCliente) idCliente = c.cliente_id;
      if (!idCommessa) idCommessa = c.commessa_id;
    }
    if (idCommessa) {
      const m = this.db.riga('SELECT * FROM commesse WHERE id = ?', idCommessa);
      if (m) {
        v.commessa = m.id + ' ' + m.descrizione;
        if (!idCliente) idCliente = m.cliente_id;
        if (idSede === null && m.sede_id) idSede = m.sede_id;
      }
    }
    if (idSede !== null) {
      const s = this.db.riga('SELECT * FROM sedi WHERE id = ?', idSede);
      if (s) {
        v.impianto = s.nome;
        v.indirizzo_impianto = indirizzoDi(s);
        if (!idCliente) idCliente = s.soggetto_id;
        if (s.referente_id) {
          const r = this.db.riga('SELECT nome FROM referenti WHERE id = ?', s.referente_id);
          if (r) v.referente = r.nome;
        }
      }
    }
    if (idCliente) {
      const s = this.db.riga('SELECT * FROM soggetti WHERE id = ?', idCliente);
      if (s) {
        v.cliente = s.nome;
        v.indirizzo_cliente = indirizzoDi(s);
        if (!v.referente) {
          const r = this.db.riga('SELECT nome FROM referenti WHERE soggetto_id = ? ORDER BY ordine, id LIMIT 1', s.id);
          if (r) v.referente = r.nome;
        }
      }
    }
    if (scad) {
      v.scadenza = dataIt(scad.data);
      // L'ultima verifica: il giorno del documento che la fa nascere (il verbale), o quella fatta prima.
      const docu = scad.documento_id ? this.db.riga('SELECT data_documento FROM documenti WHERE id = ?', scad.documento_id) : null;
      const precedente = this.db.riga("SELECT fatta_il FROM scadenze WHERE prossima_id = ? AND stato = 'fatta'", scad.id);
      const ultima = (docu && docu.data_documento) || (precedente && dataIso(precedente.fatta_il)) || '';
      if (ultima) v.ultima_verifica = dataIt(ultima);
    }
    return v;
  },

  /** componiModello {chiave, idCliente?, idSede?, idCommessa?, idTicket?, idContratto?, idScadenza?} -> {titolo, testo, mancano}. */
  componiModello(d) {
    const chiave = testo(d.chiave);
    const testi = this.testiModelli();
    if (!(chiave in testi)) throw new Rifiuto('Testo sconosciuto: ' + chiave);
    const valori = this.valoriSegnaposti(d);
    const r = D.riempi(testi[chiave], valori);
    let titolo = TITOLI_LETTERE[chiave] || NOMI_TESTI[chiave] || chiave;
    if (chiave === 'CONTRATTO_CONDIZIONI') titolo = 'Contratto di assistenza' + (valori.contratto ? ' ' + valori.contratto : '');
    return { ok: true, chiave, titolo, testo: r.testo, mancano: r.mancano, valori };
  },

  // ------------------------------------------------------------------ spazio sul NAS (§5.9)

  leggiSpazio() {
    const imp = this.leggiImpostazioni();
    const disco = this.spazioDisco();
    const mb = b => Math.round((Number(b) || 0) / MB * 10) / 10;
    const tutti = this.db.righe('SELECT * FROM file WHERE percorso IS NOT NULL AND svuotato IS NULL');
    const per = { documenti: { nome: 'Documenti', b: 0, n: 0 }, rapportini: { nome: 'Foto e firme dei rapportini', b: 0, n: 0 },
      ticket: { nome: 'Foto dei ticket', b: 0, n: 0 }, inviati: { nome: 'Mandati ai clienti', b: 0, n: 0 }, altri: { nome: 'Altri file', b: 0, n: 0 },
      cestino: { nome: 'Cestino', b: 0, n: 0 } };
    const perAnno = {};
    let totale = 0;
    for (const f of tutti) {
      const b = Number(f.byte) || 0;
      totale += b;
      const k = f.cestinato ? 'cestino' : f.tipo === 'documento' || f.tipo === 'caricato' ? 'documenti' : ['spesa', 'firma', 'firmaTecnico'].indexOf(f.tipo) >= 0 ? 'rapportini'
        : f.tipo === 'ticket' ? 'ticket' : f.tipo === 'inviato' ? 'inviati' : 'altri';
      per[k].b += b;
      per[k].n++;
      const anno = String(f.creato || '').slice(0, 4) || '?';
      perAnno[anno] = (perAnno[anno] || 0) + b;
    }
    const limiteFuori = (numero(imp.COPIA_FUORI_MAX_MB) || 25) * MB;
    const piuGrandi = tutti.filter(f => !f.cestinato).sort((x, y) => (y.byte || 0) - (x.byte || 0)).slice(0, 10).map(f => ({
      id: f.id, nome: f.nome, mb: mb(f.byte), documento: f.documento_id === null ? null : f.documento_id,
      fuori: f.fuori_il ? 'copiato' : f.fuori_no ? f.fuori_no : f.drive_url ? 'su Drive' : (f.byte || 0) > limiteFuori ? 'troppo grande' : 'da copiare',
    }));
    const daCopiare = this.fileDaCopiareFuori().length;
    const troppo = tutti.filter(f => f.fuori_no === 'troppo grande' || (!f.fuori_il && !f.drive_url && (f.byte || 0) > limiteFuori && f.tipo !== 'caricato'));
    const ultimaCopia = this.db.riga("SELECT quando FROM copie WHERE fuori LIKE 'ok%' ORDER BY id DESC LIMIT 1");
    const vecchio = this.cestinoVecchio();
    return {
      ok: true,
      disco: { totaleMb: disco.totaleMb, liberoMb: disco.liberoMb, avvisoMb: numero(imp.SPAZIO_AVVISO_MB) || 10240, minimoMb: numero(imp.SPAZIO_MINIMO_MB) || 2048 },
      file: { mb: mb(totale), quanti: tutti.length },
      perTipo: Object.keys(per).filter(k => k !== 'altri' || per[k].n).map(k => ({ tipo: k, nome: per[k].nome, mb: mb(per[k].b), quanti: per[k].n })),
      perAnno: Object.keys(perAnno).sort().reverse().map(a => ({ anno: Number(a) || a, mb: mb(perAnno[a]) })),
      piuGrandi,
      fuori: { ultima: ultimaCopia ? dataOraIso(ultimaCopia.quando) : '', daCopiare, troppoGrandi: troppo.map(f => ({ id: f.id, nome: f.nome, mb: mb(f.byte) })) },
      cestinoVecchio: { mb: mb(vecchio.reduce((t, f) => t + (Number(f.byte) || 0), 0)), quanti: vecchio.length, prima: piuGiorni(oggi(), -CESTINO_GIORNI) },
    };
  },

  /** I file nel cestino da piu' di 90 giorni (con ancora i byte sul disco). */
  cestinoVecchio() {
    const limite = Date.parse(piuGiorni(oggi(), -CESTINO_GIORNI) + 'T00:00:00');
    return this.db.righe('SELECT * FROM file WHERE cestinato IS NOT NULL AND svuotato IS NULL').filter(f => Date.parse(f.cestinato) < limite);
  },

  /** svuotaCestino {conferma}: solo il titolare, solo i file nel cestino da piu' di 90 giorni. */
  svuotaCestino(d) {
    const c = this.chi();
    if (!c.sistema && (!c.utente || c.utente.ruolo !== 'titolare')) throw senzaPermesso('svuotare il cestino (lo fa solo il titolare)');
    const vecchi = this.cestinoVecchio();
    const mbTot = Math.round(vecchi.reduce((t, f) => t + (Number(f.byte) || 0), 0) / MB * 10) / 10;
    const prima = dataBreve(piuGiorni(oggi(), -CESTINO_GIORNI));
    if (!vecchi.length) return { ok: true, tolti: 0, mb: 0 };
    if (!si(d && d.conferma)) {
      return { ok: false, serveConferma: true, quanti: vecchi.length, mb: mbTot,
        errore: 'Tolgo per sempre ' + vecchi.length + (vecchi.length === 1 ? ' file' : ' file') + ' (' + D.grandezza(mbTot) + ') messi nel cestino prima del ' + prima + ': non si potranno più recuperare' };
    }
    const ora = adesso();
    for (const f of vecchi) {
      try {
        const p = this.percorsoFile(f.percorso);
        if (fs.existsSync(p)) fs.rmSync(p);
      } catch (e) { /* resta sul disco: la riga dice comunque che e' stato tolto */ }
      this.aggiorna('file', f.id, { svuotato: ora });
    }
    this.annota('file', '', null, null, 'cestino svuotato: ' + vecchi.length + ' file');
    return { ok: true, tolti: vecchi.length, mb: mbTot };
  },
};

function indirizzoDi(s) {
  const citta = [testo(s.cap), testo(s.citta)].filter(Boolean).join(' ') + (testo(s.provincia) ? ' (' + testo(s.provincia) + ')' : '');
  return [testo(s.indirizzo), citta.trim()].filter(Boolean).join(', ');
}

Object.defineProperties(module.exports, {
  MODELLI: { value: MODELLI },
  indirizzoDi: { value: indirizzoDi },
  MINIMO_LAVORO_MB: { value: MINIMO_LAVORO_MB },
});
