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
  };
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
  salvaFile({ dati, nome, mime, tipo, rapportinoId, commessaId, idClient, attivitaId, preventivoId }) {
    const id = idCasuale();
    const finale = this.percorsoFile(id);
    const temporaneo = finale + '.scrivendo';
    fs.writeFileSync(temporaneo, dati);
    fs.renameSync(temporaneo, finale);
    this.inserisci('file', {
      id, nome: nome || id, mime: mime || 'application/octet-stream', byte: dati.length, sha256: sha256(dati),
      percorso: id, tipo, rapportino_id: rapportinoId || null, commessa_id: commessaId || null,
      id_client: idClient || null, creato: adesso(),
      attivita_id: attivitaId || null, preventivo_id: preventivoId || null,
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
   * d.idFile nasce sul telefono ed e' lo stesso a ogni tentativo: se il file
   * c'e' gia' non se ne crea un secondo.
   */
  caricaFile(d) {
    if (!d.base64) throw new Rifiuto('File vuoto');
    const dati = Buffer.from(String(d.base64), 'base64');
    if (!dati.length) throw new Rifiuto('File vuoto');
    const tipo = d.tipo;
    const mime = d.mime || 'image/jpeg';
    const estensione = estensioneDi(mime);

    if (tipo === 'firmaTecnico') {
      const f = this.fileGiaArrivato('firmaTecnico', d.idFile, '', '') ||
        this.salvaFile({ dati, nome: 'firma-tecnico' + estensione, mime, tipo, idClient: testo(d.idFile) });
      this.salvaImpostazioni({ FIRMA_TECNICO: urlFile(f.id) });
      return { id: f.id, url: urlFile(f.id) };
    }

    if (tipo === 'documento') {
      const commessa = this.db.riga('SELECT id FROM commesse WHERE id = ?', testo(d.idCommessa));
      if (!commessa) throw new Rifiuto('Commessa ' + d.idCommessa + ' non trovata');
      const f = this.fileGiaArrivato('documento', d.idFile, '', commessa.id) ||
        this.salvaFile({ dati, nome: testo(d.nome) || 'documento', mime, tipo, commessaId: commessa.id, idClient: testo(d.idFile) });
      return { id: f.id, url: urlFile(f.id), nome: f.nome };
    }

    if (tipo === 'attivita') {
      const a = this.db.riga('SELECT * FROM attivita WHERE id = ?', Number(d.idAttivita) || 0);
      if (!a) throw new Rifiuto('Attività ' + testo(d.idAttivita) + ' non trovata');
      this.controllaSua(a, 'caricare allegati sulle attività degli altri');
      const gia = testo(d.idFile)
        ? this.db.riga("SELECT * FROM file WHERE tipo = 'attivita' AND attivita_id = ? AND id_client = ? AND cestinato IS NULL", a.id, testo(d.idFile))
        : null;
      const f = gia || this.salvaFile({ dati, nome: testo(d.nome) || 'allegato' + estensione, mime, tipo, attivitaId: a.id, idClient: testo(d.idFile) });
      if (!gia) this.aggiorna('attivita', a.id, { modificato: adesso() });
      return { id: f.id, url: urlFile(f.id), nome: f.nome };
    }

    if (tipo !== 'spesa' && tipo !== 'firma') throw new Rifiuto('Tipo di file sconosciuto: ' + tipo);

    const riga = this.trovaRiga(d.id, d.idLocale);
    if (!riga) throw new Rifiuto('Rapportino non trovato: va salvato prima della foto');
    this.controllaSuo(riga, 'caricare file sui rapportini degli altri');
    const sigla = testo(riga.id).replace(/\//g, '-');
    const unico = testo(d.idFile) || idCasuale().slice(0, 8);

    if (tipo === 'spesa') {
      let f = this.fileGiaArrivato('spesa', d.idFile, riga.id, '');
      if (!f) {
        f = this.salvaFile({ dati, nome: sigla + ' spesa ' + unico + estensione, mime, tipo, rapportinoId: riga.id, idClient: testo(d.idFile) });
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
    return { id: f.id, url: urlFile(f.id) };
  },

  /** Toglie una foto dal rapportino. Il file va nel cestino, da cui si recupera. */
  togliFile(id, fileId) {
    const riga = this.trovaRiga(id, id);
    if (!riga) throw new Rifiuto('Rapportino ' + id + ' non trovato');
    this.controllaSuo(riga, 'togliere file dai rapportini degli altri');
    const f = this.db.riga("SELECT * FROM file WHERE id = ? AND rapportino_id = ? AND tipo = 'spesa'", testo(fileId), riga.id);
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
    if (f.rapportino_id && (f.tipo === 'spesa' || f.tipo === 'firma')) {
      if (this.livello('rapportini') < 1) return false;
      if (this.soloSuoi()) {
        const r = this.db.riga('SELECT utente_id FROM rapportini WHERE id = ?', f.rapportino_id);
        return !!r && r.utente_id === this.chi().utente.id;
      }
      return true;
    }
    if (f.tipo === 'documento') return this.livello('documenti') >= 1;
    if (f.tipo === 'attivita') {
      if (this.livello('attivita') < 1) return false;
      const a = this.db.riga('SELECT * FROM attivita WHERE id = ?', f.attivita_id || 0);
      return !!a && this.vedeAttivita(a);
    }
    if (f.tipo === 'preventivo') return this.livello('preventivi') >= 1;
    return this.livello('rapportini') >= 1 || this.livello('documenti') >= 1;
  },

  /** Il contenuto di un file, per metterlo nel PDF (come l'azione "file" dello script). */
  leggiFile(id) {
    if (!testo(id)) throw new Rifiuto('Manca il file');
    const f = this.db.riga('SELECT * FROM file WHERE id = ?', testo(id));
    if (!f || f.cestinato) throw new Rifiuto('File ' + id + ' non trovato');
    if (!this.puoLeggereFile(f)) throw senzaPermesso('vedere questo file');
    if (!f.percorso || !fs.existsSync(this.percorsoFile(f.percorso))) {
      throw new Rifiuto('Il file ' + id + ' non è ancora stato copiato da Drive: lancia server/strumenti/copia-drive.js');
    }
    return { id: f.id, nome: f.nome, mime: f.mime, base64: fs.readFileSync(this.percorsoFile(f.percorso)).toString('base64') };
  },

  /** I documenti di una commessa, piu' recenti prima. */
  documentiCommessa(idCommessa) {
    const m = this.db.riga('SELECT id, cartella FROM commesse WHERE id = ?', testo(idCommessa));
    if (!m) throw new Rifiuto('Commessa ' + idCommessa + ' non trovata');
    const documenti = this.db.righe("SELECT * FROM file WHERE tipo = 'documento' AND commessa_id = ? AND cestinato IS NULL ORDER BY creato DESC, rowid DESC", m.id)
      .map(f => ({ id: f.id, nome: f.nome, url: urlFile(f.id), mime: f.mime, data: dataOraIso(f.creato) }));
    return { ok: true, cartella: m.cartella, documenti };
  },

  cestino() {
    return this.db.righe('SELECT * FROM file WHERE cestinato IS NOT NULL ORDER BY cestinato DESC').map(fileDaRiga);
  },

  ripristinaFile(id) {
    const f = this.db.riga('SELECT * FROM file WHERE id = ?', testo(id));
    if (!f) throw new Rifiuto('File ' + id + ' non trovato');
    if (!f.cestinato) throw new Rifiuto('Il file ' + id + ' non è nel cestino');
    this.aggiorna('file', f.id, { cestinato: null });
    return fileDaRiga(this.db.riga('SELECT * FROM file WHERE id = ?', f.id));
  },
};
