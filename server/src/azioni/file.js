/*
 * Foto delle spese, firme, firma del tecnico, documenti delle commesse. I byte
 * stanno su disco in <dati>/file/<id>; il database sa chi sono (tabella file).
 * Gli id dei file copiati da Drive restano quelli di Drive, cosi' ogni
 * riferimento vecchio continua a valere; i file nuovi hanno un id casuale.
 *
 * Niente si cancella davvero: una foto tolta va nel cestino (cestinato) e si
 * ripristina da Amministrazione.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Rifiuto, senzaPermesso, testo, adesso, istante, idCasuale, sha256, dataOraIso } = require('../utili');
const { tipoDaSalvare } = require('../documenti');

const urlFile = id => '/file/' + id;

function estensioneDi(mime) {
  return mime === 'image/png' ? '.png' : mime === 'application/pdf' ? '.pdf' : '.jpg';
}

function fileDaRiga(f) {
  return {
    id: f.id, nome: f.nome, mime: f.mime, byte: f.byte, tipo: f.tipo, idRapportino: f.rapportino_id || '',
    idCommessa: f.commessa_id || '', url: urlFile(f.id), copiato: !!f.percorso, creato: dataOraIso(f.creato),
    cestinato: dataOraIso(f.cestinato),
    // Fase 2
    idAttivita: f.attivita_id === null || f.attivita_id === undefined ? null : f.attivita_id,
    idPreventivo: f.preventivo_id === null || f.preventivo_id === undefined ? null : f.preventivo_id,
    // Fase 3
    idSpesa: f.spesa_id === null || f.spesa_id === undefined ? null : f.spesa_id,
    // Fase 4
    idFattura: f.fattura_id === null || f.fattura_id === undefined ? null : f.fattura_id,
    idRicevuta: f.ricevuta_id === null || f.ricevuta_id === undefined ? null : f.ricevuta_id,
    // Fase 5
    idDocumento: f.documento_id === null || f.documento_id === undefined ? null : f.documento_id,
    idVersione: f.versione_id === null || f.versione_id === undefined ? null : f.versione_id,
    idTicket: f.ticket_id === null || f.ticket_id === undefined ? null : f.ticket_id,
    fuoriIl: dataOraIso(f.fuori_il), fuoriNo: f.fuori_no || '',
  };
}

/** Il lato piu' lungo di un PNG o di un JPG in pixel (null se non si capisce). */
function latoImmagine(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504E47) return Math.max(b.readUInt32BE(16), b.readUInt32BE(20));
  if (b.length > 4 && b[0] === 0xFF && b[1] === 0xD8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) return null;
      const m = b[i + 1];
      const lung = b.readUInt16BE(i + 2);
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return Math.max(b.readUInt16BE(i + 5), b.readUInt16BE(i + 7));
      i += 2 + lung;
    }
  }
  return null;
}

module.exports = {
  percorsoFile(id) {
    return path.join(this.cartellaFile, id);
  },

  /**
   * Scrive i byte su disco (prima in un file temporaneo, poi rinominato: un
   * file a meta' non c'e' mai) e la riga nella tabella. Il contenuto non va mai
   * nel registro: solo nome, tipo e grandezza.
   */
  salvaFile({ dati, nome, mime, tipo, rapportinoId, commessaId, idClient, attivitaId, preventivoId, spesaId, fatturaId, ricevutaId }) {
    const id = idCasuale();
    const finale = this.percorsoFile(id);
    const temporaneo = finale + '.scrivendo';
    fs.writeFileSync(temporaneo, dati);
    fs.renameSync(temporaneo, finale);
    this.inserisci('file', {
      id, nome: nome || id, mime: mime || 'application/octet-stream', byte: dati.length, sha256: sha256(dati),
      percorso: id, tipo, rapportino_id: rapportinoId || null, commessa_id: commessaId || null,
      id_client: idClient || null, creato: adesso(),
      attivita_id: attivitaId || null, preventivo_id: preventivoId || null, spesa_id: spesaId || null,
      fattura_id: fatturaId || null, ricevuta_id: ricevutaId || null,
    });
    return this.db.riga('SELECT * FROM file WHERE id = ?', id);
  },

  /** Il file gia' arrivato con lo stesso idFile (un invio ripetuto dal telefono). */
  fileGiaArrivato(tipo, idClient, rapportinoId, commessaId) {
    if (!testo(idClient)) return null;
    return this.db.riga(
      'SELECT * FROM file WHERE tipo = ? AND id_client = ? AND IFNULL(rapportino_id, \'\') = ? AND IFNULL(commessa_id, \'\') = ? AND cestinato IS NULL',
      tipo, testo(idClient), rapportinoId || '', commessaId || '');
  },

  /**
   * Carica una foto o una firma e la lega al suo posto.
   *  - 'spesa'        foto di uno scontrino, aggiunta al rapportino (anche dopo la
   *                   firma: e' un allegato, non cambia il lavoro firmato)
   *  - 'firma'        firma del cliente, o la foto del foglio firmato a mano: il
   *                   rapportino diventa FIRMATO
   *  - 'firmaTecnico' la firma del compilatore, una volta per tutte
   *  - 'documento'    un documento della commessa d.idCommessa
   *  - 'attivita'     un allegato dell'attivita' d.idAttivita (fase 2)
   *  - 'spesa' con d.idSpesa: lo scontrino di una spesa (fase 3); senza, come
   *                   oggi, la foto del rapportino, che va anche alla riga di
   *                   spese del suo passo 3
   * d.idFile nasce sul telefono ed e' lo stesso a ogni tentativo: se il file
   * c'e' gia' non se ne crea un secondo.
   */
  /** Il logo: PNG o JPG fino a 1 MB, almeno 300 px sul lato piu' lungo; quello di prima va nel cestino. */
  caricaLogo(d, dati, mime, estensione) {
    if (this.livello('amministrazione') < 2) throw senzaPermesso('cambiare il logo dello studio');
    if (['image/png', 'image/jpeg'].indexOf(mime) < 0 || dati.length > 1048576) throw new Rifiuto('Il logo deve essere un PNG o un JPG di al massimo 1 MB');
    const lato = latoImmagine(dati);
    if (lato !== null && lato < 300) throw new Rifiuto('Il logo è troppo piccolo: serve almeno 300 px di lato');
    const prima = testo(this.leggiImpostazioni().STUDIO_LOGO);
    const f = this.fileGiaArrivato('logo', d.idFile, '', '') || this.salvaFile({ dati, nome: 'logo' + estensione, mime, tipo: 'logo', idClient: testo(d.idFile) });
    if (prima && prima !== f.id) this.aggiorna('file', prima, { cestinato: adesso() }, 'id', 'logo cambiato');
    this.salvaImpostazioni({ STUDIO_LOGO: f.id });
    this.annota('impostazioni', 'STUDIO_LOGO', null, { file: f.id }, 'logo cambiato');
    return { id: f.id, url: urlFile(f.id) };
  },

  /** L'immagine di un servizio: JPG o PNG fino a 1 MB. Resta "libera" finche' un servizio non la usa. */
  caricaImmagineServizio(d, dati, mime, estensione) {
    if (d.per === 'indennita' ? this.livello('rapportini') < 2 : this.livello('preventivi') < 2) throw senzaPermesso(d.per === 'indennita' ? 'caricare le immagini delle indennità' : 'cambiare i servizi');
    if (['image/png', 'image/jpeg'].indexOf(mime) < 0 || dati.length > 1048576) throw new Rifiuto('L\'immagine deve essere un JPG o un PNG di al massimo 1 MB');
    const f = this.fileGiaArrivato('servizio', d.idFile, '', '') || this.salvaFile({ dati, nome: (testo(d.nome) || 'servizio').replace(/\.[a-z0-9]+$/i, '') + estensione, mime, tipo: 'servizio', idClient: testo(d.idFile) });
    return { id: f.id, url: urlFile(f.id), nome: f.nome };
  },

  caricaFile(d) {
    const tipo = d.tipo;
    // Fase 5: la foto di un ticket, anche gia' arrivata con /carica (idFileCaricato, senza base64).
    if (tipo === 'ticket' && !d.base64 && testo(d.idFileCaricato)) return this.caricaFotoTicket(d, null, '');
    if (!d.base64) throw new Rifiuto('File vuoto');
    const dati = Buffer.from(String(d.base64), 'base64');
    if (!dati.length) throw new Rifiuto('File vuoto');
    if (dati.length > this.fileMaxByte()) throw new Rifiuto('Il file è più grande di ' + Math.round(this.fileMaxByte() / 1048576) + ' MB: non si carica');
    // Fase 5: il tipo si controlla anche sui primi byte (un programma o una pagina web non arrivano sul NAS).
    const mime = tipoDaSalvare(d.mime || 'image/jpeg', dati.subarray(0, 512));
    const estensione = estensioneDi(mime);
    if (tipo === 'ticket') return this.caricaFotoTicket(d, dati, mime);
    // Fase 6: la foto del contachilometri e le foto di un guasto (anche dalla coda del telefono, con l'idLocale).
    if (tipo === 'km' || tipo === 'guasto') return this.caricaFotoMezzo(d, dati, mime, estensione);

    // Fase 8 (§9.3, §13.7): il logo dello studio (PNG o JPG fino a 1 MB, almeno 300 px di lato), in STUDIO_LOGO.
    if (tipo === 'logo') return this.caricaLogo(d, dati, mime, estensione);
    // 1.4.0 (servizi.md §1): l'immagine di un servizio, JPG (o PNG) fino a 1 MB come in Flextaxa; la lega salvaVoceListino.
    if (tipo === 'servizio') return this.caricaImmagineServizio(d, dati, mime, estensione);

    if (tipo === 'firmaTecnico') {
      const f = this.fileGiaArrivato('firmaTecnico', d.idFile, '', '') || (this.controllaSpazio('lavoro'), null) ||
        this.salvaFile({ dati, nome: 'firma-tecnico' + estensione, mime, tipo, idClient: testo(d.idFile) });
      this.salvaImpostazioni({ FIRMA_TECNICO: urlFile(f.id) });
      return { id: f.id, url: urlFile(f.id) };
    }

    if (tipo === 'documento') {
      const commessa = this.db.riga('SELECT id FROM commesse WHERE id = ?', this.codiceCommessaVero(d.idCommessa));
      if (!commessa) throw new Rifiuto('Commessa ' + d.idCommessa + ' non trovata');
      let f = this.fileGiaArrivato('documento', d.idFile, '', commessa.id);
      if (!f) {
        // Fase 5: sotto la soglia di spazio niente documenti nuovi; il documento entra nell'archivio (Da classificare).
        this.controllaSpazio('documento');
        f = this.salvaFile({ dati, nome: testo(d.nome) || 'documento', mime, tipo, commessaId: commessa.id, idClient: testo(d.idFile) });
        this.documentoDaFileVecchio(f, commessa.id);
      }
      return { id: f.id, url: urlFile(f.id), nome: f.nome };
    }

    if (tipo === 'attivita') {
      const a = this.db.riga('SELECT * FROM attivita WHERE id = ?', Number(d.idAttivita) || 0);
      if (!a) throw new Rifiuto('Attività ' + testo(d.idAttivita) + ' non trovata');
      this.controllaSua(a, 'caricare allegati sulle attività degli altri');
      const gia = testo(d.idFile)
        ? this.db.riga("SELECT * FROM file WHERE tipo = 'attivita' AND attivita_id = ? AND id_client = ? AND cestinato IS NULL", a.id, testo(d.idFile))
        : null;
      if (!gia) this.controllaSpazio('lavoro');
      const f = gia || this.salvaFile({ dati, nome: testo(d.nome) || 'allegato' + estensione, mime, tipo, attivitaId: a.id, idClient: testo(d.idFile) });
      if (!gia) this.aggiorna('attivita', a.id, { modificato: adesso() });
      return { id: f.id, url: urlFile(f.id), nome: f.nome };
    }

    if (tipo === 'spesa' && testo(d.idSpesa)) return this.caricaFotoSpesa(d, dati, mime, estensione);
    if ((tipo === 'spesa' || tipo === 'firma') && !this.fileGiaArrivato(tipo, d.idFile, (this.trovaRiga(d.id, d.idLocale) || {}).id || '', '')) this.controllaSpazio('lavoro');

    if (tipo !== 'spesa' && tipo !== 'firma') throw new Rifiuto('Tipo di file sconosciuto: ' + tipo);

    const riga = this.trovaRiga(d.id, d.idLocale);
    if (!riga) throw new Rifiuto('Rapportino non trovato: va salvato prima della foto');
    this.controllaSuo(riga, 'caricare file sui rapportini degli altri');
    const sigla = testo(riga.id).replace(/\//g, '-');
    const unico = testo(d.idFile) || idCasuale().slice(0, 8);

    if (tipo === 'spesa') {
      let f = this.fileGiaArrivato('spesa', d.idFile, riga.id, '');
      // Fase 4: in una bozza o in una fattura il rapportino non cambia, nemmeno le foto (una ripetizione della coda si', sopra).
      if (!f) this.controllaSorgenteLibera('rapportino', riga.id);
      if (!f) {
        // Fase 3: la foto va anche alla riga di spese del passo 3, se c'e'.
        const passo3 = this.db.riga("SELECT id FROM spese WHERE rapportino_id = ? AND dal_rapportino = 1 AND destinazione = 'cliente' AND tolta IS NULL ORDER BY id LIMIT 1", riga.id);
        f = this.salvaFile({ dati, nome: sigla + ' spesa ' + unico + estensione, mime, tipo, rapportinoId: riga.id, idClient: testo(d.idFile), spesaId: passo3 ? passo3.id : null });
        this.aggiorna('rapportini', riga.id, { modificato: adesso() });
      }
      return { id: f.id, url: urlFile(f.id) };
    }

    // tipo === 'firma'
    const stato = testo(riga.stato).toUpperCase();
    if ((stato === 'FIRMATO' || stato === 'INVIATO' || stato === 'FATTURATO') && testo(riga.firma)) {
      return { id: riga.firma, url: urlFile(riga.firma) };   // una ripetizione dello stesso invio
    }
    const f = this.fileGiaArrivato('firma', d.idFile, riga.id, '') ||
      this.salvaFile({ dati, nome: sigla + ' firma ' + unico + estensione, mime, tipo, rapportinoId: riga.id, idClient: testo(d.idFile) });
    const firmatoIl = d.firmatoIl ? istante(new Date(d.firmatoIl)) : null;
    this.aggiorna('rapportini', riga.id, {
      firma: f.id,
      firmatario: testo(d.firmatario),
      firmato_il: firmatoIl || adesso(),
      // Una firma arrivata dopo l'invio (il foglio firmato a mano, scansionato
      // dopo) si aggiunge, ma non riporta indietro un rapportino gia' inviato o fatturato.
      stato: stato === 'INVIATO' || stato === 'FATTURATO' ? stato : 'FIRMATO',
      modificato: adesso(),
    });
    // Fase 5: la firma va nella cronologia del ticket del rapportino.
    if (riga.ticket_id) this.eventoTicket(riga.ticket_id, 'Rapportino ' + riga.id + ' firmato' + (testo(d.firmatario) ? ' da ' + testo(d.firmatario) : ''));
    // Fase 7 (§8.1): diventa FIRMATO, la regola "rapportini firmati" del cliente col portale lo pubblica (senza avviso).
    if (stato === 'BOZZA') this.pubblicaConRegola('rapportino', riga.id, {});
    return { id: f.id, url: urlFile(f.id) };
  },

  /**
   * Fase 6: caricaFile {tipo: "km", idLettura | idLocaleLettura, ...} (la foto del contachilometri) e {tipo: "guasto",
   * idManutenzione | idLocaleManutenzione, ...} (le foto di un guasto, anche piu' di una). Chi ha mezzi 2, o chi ha
   * scritto la lettura o segnalato il guasto. Lo stesso idFile non crea doppioni.
   */
  caricaFotoMezzo(d, dati, mime, estensione) {
    const km = d.tipo === 'km';
    const riga = km
      ? (testo(d.idLettura) ? this.db.riga('SELECT * FROM mezzo_letture WHERE id = ?', Number(d.idLettura) || 0) : this.db.riga('SELECT * FROM mezzo_letture WHERE id_locale = ?', testo(d.idLocaleLettura)))
      : (testo(d.idManutenzione) ? this.db.riga('SELECT * FROM manutenzioni WHERE id = ?', Number(d.idManutenzione) || 0) : this.db.riga('SELECT * FROM manutenzioni WHERE id_locale = ?', testo(d.idLocaleManutenzione)));
    if (!riga) throw new Rifiuto(km ? 'Lettura dei km non trovata: va salvata prima della foto' : 'Guasto non trovato: va segnalato prima della foto');
    const io = this.chi().utente ? this.chi().utente.id : null;
    const suo = km ? riga.utente_id === io : riga.segnalata_da === io;
    if (this.livello('mezzi') < 2 && !suo) throw senzaPermesso('caricare le foto delle cose degli altri');
    const colonna = km ? 'lettura_id' : 'manutenzione_id';
    const gia = testo(d.idFile) ? this.db.riga('SELECT * FROM file WHERE tipo = ? AND ' + colonna + ' = ? AND id_client = ? AND cestinato IS NULL', d.tipo, riga.id, testo(d.idFile)) : null;
    if (gia) return { id: gia.id, url: urlFile(gia.id) };
    this.controllaSpazio('lavoro');
    const f = this.salvaFile({ dati, nome: (km ? 'km ' : 'guasto ') + riga.id + ' ' + (testo(d.idFile) || idCasuale().slice(0, 8)) + estensione, mime, tipo: d.tipo, idClient: testo(d.idFile) });
    this.aggiorna('file', f.id, { [colonna]: riga.id });
    if (km) this.aggiorna('mezzo_letture', riga.id, { foto_file_id: f.id });
    return { id: f.id, url: urlFile(f.id) };
  },

  /** Toglie una foto dal rapportino. Il file va nel cestino, da cui si recupera. */
  togliFile(id, fileId) {
    const riga = this.trovaRiga(id, id);
    if (!riga) throw new Rifiuto('Rapportino ' + id + ' non trovato');
    this.controllaSuo(riga, 'togliere file dai rapportini degli altri');
    const f = this.db.riga("SELECT * FROM file WHERE id = ? AND rapportino_id = ? AND tipo = 'spesa'", testo(fileId), riga.id);
    if (f && !f.cestinato) this.controllaSorgenteLibera('rapportino', riga.id);
    if (f && !f.cestinato) this.aggiorna('file', f.id, { cestinato: adesso() });
    this.aggiorna('rapportini', riga.id, { modificato: adesso() });
    return this.rapportinoPerId(riga.id);
  },

  /**
   * Chi puo' leggere un file: le foto e le firme di un rapportino chi vede quel
   * rapportino (un collaboratore solo i suoi); i documenti chi vede i
   * documenti; la firma del tecnico chi fa i PDF.
   */
  puoLeggereFile(f) {
    // Fase 5: un file arrivato con /carica e non ancora legato lo vede solo chi l'ha caricato.
    if (f.tipo === 'caricato') return !!this.chi().utente && f.caricato_da === this.chi().utente.id;
    // Fase 8: il logo dello studio lo vede chiunque sia entrato (menu, PDF, portale).
    if (f.tipo === 'logo') return !!this.chi().utente || this.chi().sistema;
    // 1.4.0: l'immagine di un servizio la vede chi e' entrato (come i servizi, che servono a tutti per le indennita').
    if (f.tipo === 'servizio') return !!this.chi().utente || this.chi().sistema;
    // Fase 6: le foto dei km e dei guasti chi vede i mezzi; la firma di una consegna chi vede i dati personali della persona.
    if (f.tipo === 'km' || f.tipo === 'guasto') return this.livello('mezzi') >= 1;
    if (f.tipo === 'firma_consegna') {
      if (f.consegna_id) {
        const c = this.db.riga('SELECT persona_id FROM dpi_consegne WHERE id = ?', f.consegna_id);
        return !!c && (this.vedePersonaliDi(c.persona_id) || this.livello('mezzi') >= 2);
      }
      return this.livello('mezzi') >= 1;
    }
    // La revisione di un documento: chi vede il documento (vede tutti / costi / riservati). Chi non lo vede: 403.
    if (f.documento_id !== null && f.documento_id !== undefined) {
      const doc = this.db.riga('SELECT * FROM documenti WHERE id = ?', f.documento_id);
      if (doc && this.vedeDocumento(doc)) return true;
      if (f.tipo === 'documento' || f.tipo === 'inviato') return false;
    }
    if (f.tipo === 'inviato') return false;
    // Fase 7: un file arrivato dal portale: chi vede il portale, o chi vede il ticket a cui e' legato.
    if (f.tipo === 'portale') {
      if (this.eEsterno()) return false;
      if (f.ticket_id) {
        const t = this.db.riga('SELECT * FROM ticket WHERE id = ?', f.ticket_id);
        if (t && this.vedeTicket(t)) return true;
      }
      return this.livello('portale') >= 1;
    }
    if (f.tipo === 'ticket') {
      const t = this.db.riga('SELECT * FROM ticket WHERE id = ?', f.ticket_id || 0);
      return !!t && this.vedeTicket(t);
    }
    // Fase 3: lo scontrino di una spesa lo vede chi vede la spesa (un collaboratore solo le sue), o il suo rapportino.
    if (f.tipo === 'spesa' && f.spesa_id !== null && f.spesa_id !== undefined && this.livello('spese') >= 1) {
      const s = this.db.riga('SELECT utente_id FROM spese WHERE id = ?', f.spesa_id);
      if (s && this.vedeDi(s.utente_id)) return true;
    }
    if (f.rapportino_id && (f.tipo === 'spesa' || f.tipo === 'firma')) {
      if (this.livello('rapportini') < 1) return false;
      if (this.soloSuoi()) {
        const r = this.db.riga('SELECT utente_id FROM rapportini WHERE id = ?', f.rapportino_id);
        return !!r && r.utente_id === this.chi().utente.id;
      }
      return true;
    }
    // Fase 6: l'esterno vede i documenti di prima solo delle sue commesse.
    if (f.tipo === 'documento') return this.livello('documenti') >= 1 && (!this.eEsterno() || this.commesseEsterno().has(String(f.commessa_id || '').toUpperCase()));
    if (f.tipo === 'attivita') {
      if (this.livello('attivita') < 1) return false;
      const a = this.db.riga('SELECT * FROM attivita WHERE id = ?', f.attivita_id || 0);
      return !!a && this.vedeAttivita(a);
    }
    if (f.tipo === 'preventivo') return this.livello('preventivi') >= 1;
    if (f.tipo === 'fattura' || f.tipo === 'ricevuta') return this.livello('fatturazione') >= 1 && this.vedeCosti();
    if (f.tipo === 'spesa' && f.spesa_id !== null && f.spesa_id !== undefined) return false;
    // Fase 6: un esterno non apre altro (la firma del tecnico dello studio, i file senza legame).
    if (this.eEsterno()) return false;
    return this.livello('rapportini') >= 1 || this.livello('documenti') >= 1;
  },

  /** Il contenuto di un file, per metterlo nel PDF (come l'azione "file" dello script). */
  leggiFile(id) {
    if (!testo(id)) throw new Rifiuto('Manca il file');
    const f = this.db.riga('SELECT * FROM file WHERE id = ?', testo(id));
    if (!f || f.cestinato) throw new Rifiuto('File ' + id + ' non trovato');
    if (!this.puoLeggereFile(f)) throw senzaPermesso('vedere questo file');
    // Fase 6: chi scarica un documento riservato di un'altra persona lascia traccia.
    this.notaScaricoRiservato(f);
    if (!f.percorso || !fs.existsSync(this.percorsoFile(f.percorso))) {
      throw new Rifiuto('Il file ' + id + ' non è ancora stato copiato da Drive: lancia server/strumenti/copia-drive.js');
    }
    return { id: f.id, nome: f.nome, mime: f.mime, base64: fs.readFileSync(this.percorsoFile(f.percorso)).toString('base64') };
  },

  /**
   * I documenti di una commessa, piu' recenti prima, come li dava lo script
   * (azione documenti con solo idCommessa, per le versioni vecchie). Dalla fase
   * 5 si leggono dall'archivio: i documenti "file" della commessa che chi
   * chiede vede, col file della loro revisione valida (stessi id dei file).
   */
  documentiCommessa(idCommessa) {
    const m = this.db.riga('SELECT id, cartella FROM commesse WHERE id = ?', testo(idCommessa));
    if (!m) throw new Rifiuto('Commessa ' + idCommessa + ' non trovata');
    const righe = this.db.righe("SELECT f.*, d.vede FROM documenti d JOIN documento_versioni v ON v.id = d.versione_valida_id JOIN file f ON f.id = v.file_id " +
      "WHERE d.origine = 'file' AND d.commessa_id = ? AND d.archiviato IS NULL AND f.cestinato IS NULL ORDER BY f.creato DESC, f.rowid DESC", m.id);
    const documenti = righe.filter(f => this.vedeLivello(f.vede))
      .map(f => ({ id: f.id, nome: f.nome, url: urlFile(f.id), mime: f.mime, data: dataOraIso(f.creato) }));
    return { ok: true, cartella: m.cartella, documenti };
  },

  /** Un documento caricato dalle versioni vecchie (caricaFile tipo documento): entra nell'archivio, Da classificare. */
  documentoDaFileVecchio(f, idCommessa) {
    const cat = this.categoriaDiSistema('Da classificare');
    const m = this.db.riga('SELECT id, cliente_id FROM commesse WHERE id = ?', idCommessa);
    const ora = adesso();
    const id = this.inserisci('documenti', {
      titolo: String(f.nome || f.id).replace(/\.[A-Za-z0-9]{1,5}$/, '') || f.id, categoria_id: cat.id, cliente_id: m ? m.cliente_id || '' : '',
      commessa_id: m ? m.id : '', origine: 'file', vede: 'tutti', data_documento: ora.slice(0, 10),
      creato_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
    });
    this.aggiungiVersione(id, f, '', 'approvata');
    return id;
  },

  cestino() {
    return this.db.righe('SELECT * FROM file WHERE cestinato IS NOT NULL AND svuotato IS NULL ORDER BY cestinato DESC').map(fileDaRiga);
  },

  ripristinaFile(id) {
    const f = this.db.riga('SELECT * FROM file WHERE id = ?', testo(id));
    if (!f) throw new Rifiuto('File ' + id + ' non trovato');
    if (!f.cestinato) throw new Rifiuto('Il file ' + id + ' non è nel cestino');
    if (f.svuotato) throw new Rifiuto('Il file ' + id + ' è stato tolto per sempre col cestino svuotato');
    this.aggiorna('file', f.id, { cestinato: null });
    return fileDaRiga(this.db.riga('SELECT * FROM file WHERE id = ?', f.id));
  },
};
