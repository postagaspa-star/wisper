/*
 * Le copie di sicurezza (accordo §7). Ogni notte all'ora fissata (02:30):
 *  1. sul NAS: VACUUM INTO /data/copie/wisper-aaaammgg.db, una copia coerente
 *     anche mentre qualcuno lavora. Si tengono 30 giorni, piu' la prima di ogni
 *     mese per 12 mesi;
 *  2. fuori casa: il database compresso e i file nuovi vanno al postino, che li
 *     salva su Drive in Wisper/Copie NAS/;
 *  3. il foglio: le schede Rapportini, Clienti, Commesse e Impostazioni
 *     riscritte come oggi, cosi' il foglio resta leggibile e aggiornato.
 * Se la copia fuori casa non riesce due notti di fila arriva un avviso.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { Rifiuto, testo, adesso, oggi, dataOraIso, istante, messaggio } = require('../utili');

const GIORNI_TENUTE = 30;
const MESI_TENUTE = 12;
const RE_COPIA = /^wisper-(\d{4})(\d{2})(\d{2})\.db$/;

const siNo = v => (v === 1 ? 'SI' : v === 0 ? 'NO' : '');
// 2026-10-21T21:30:00, senza fuso: il postino lo riconosce e nel foglio torna una data vera, in ora italiana.
const quandoFoglio = v => dataOraIso(v);
const vuotoSeNull = v => (v === null || v === undefined ? '' : v);

module.exports = {
  /**
   * La copia di adesso. "motivo": 'notturna' o 'a mano'. Torna la riga della
   * tabella copie con com'e' andata ognuna delle tre parti.
   */
  async copiaDiSicurezza(motivo) {
    if (this.copiaInCorso) throw new Rifiuto('Una copia è già in corso: aspetta un minuto e guarda l\'elenco');
    this.copiaInCorso = true;
    try {
      fs.mkdirSync(this.cartellaCopie, { recursive: true });
      const nome = 'wisper-' + oggi().replace(/-/g, '') + '.db';
      const file = path.join(this.cartellaCopie, nome);
      const esito = { locale: '', fuori: '', foglio: '', byte: null };
      try {
        this.db.copiaIn(file);
        esito.byte = fs.statSync(file).size;
        esito.locale = 'ok';
        this.pulisciCopie();
      } catch (err) {
        esito.locale = 'errore: ' + messaggio(err);
      }

      if (!this.postino || !this.postino.configurato()) {
        esito.fuori = 'postino non collegato';
        esito.foglio = 'postino non collegato';
      } else {
        if (esito.locale === 'ok') {
          try {
            const dati = zlib.gzipSync(fs.readFileSync(file));
            await this.postino.copia({ cartella: 'database', nome: nome + '.gz', mime: 'application/gzip', dati });
            const n = await this.copiaFileNuovi();
            esito.fuori = 'ok' + (n ? ' · ' + n + (n === 1 ? ' file' : ' file') : '');
          } catch (err) {
            esito.fuori = 'errore: ' + messaggio(err);
          }
        } else {
          esito.fuori = 'saltata: manca la copia sul NAS';
        }
        try {
          for (const s of this.schedePerIlFoglio()) await this.postino.foglio(s.scheda, s.intestazioni, s.righe);
          esito.foglio = 'ok';
        } catch (err) {
          // Prima del cambio lo script non riscrive le schede (sono ancora i dati veri):
          // non e' un guasto, e non deve sembrarlo nell'elenco delle copie.
          esito.foglio = /dopo il cambio/.test(messaggio(err)) ? 'non ancora: si riscrive dopo il cambio' : 'errore: ' + messaggio(err);
        }
      }

      const quando = adesso();
      const prima = this.db.riga('SELECT fuori FROM copie ORDER BY id DESC LIMIT 1');
      const id = this.inserisci('copie', { quando, file: nome, byte: esito.byte, locale: esito.locale, fuori: esito.fuori, foglio: esito.foglio, nota: motivo || '' });
      if (/^errore/.test(esito.fuori) && prima && /^errore/.test(prima.fuori)) await this.avvisaCopiaFallita(esito.fuori);
      return copiaDaRiga(this.db.riga('SELECT * FROM copie WHERE id = ?', id));
    } finally {
      this.copiaInCorso = false;
    }
  },

  /**
   * I file arrivati dopo l'ultima copia fuori casa riuscita (la prima volta:
   * quelli dell'ultimo giorno). Quelli copiati da Drive no: l'originale e' gia' li'.
   */
  async copiaFileNuovi() {
    const ultima = this.db.riga("SELECT quando FROM copie WHERE fuori LIKE 'ok%' ORDER BY id DESC LIMIT 1");
    const da = ultima ? ultima.quando : istante(new Date(Date.now() - 24 * 3600 * 1000));
    const nuovi = this.db.righe('SELECT * FROM file WHERE percorso IS NOT NULL AND drive_url IS NULL ORDER BY creato')
      .filter(f => Date.parse(f.creato) > Date.parse(da));
    for (const f of nuovi) {
      const p = this.percorsoFile(f.percorso);
      if (!fs.existsSync(p)) continue;
      const pulito = String(f.nome || '').replace(/[\\/:*?"<>|]/g, '-');
      await this.postino.copia({ cartella: 'file', nome: f.id + ' ' + pulito, mime: f.mime || 'application/octet-stream', dati: fs.readFileSync(p) });
    }
    return nuovi.length;
  },

  async avvisaCopiaFallita(errore) {
    try {
      await this.postino.email({
        alProprietario: true,
        nome: 'Wisper',
        oggetto: 'Wisper: la copia fuori casa non riesce',
        messaggio: 'Da due notti la copia del database di Wisper non arriva su Drive.\n\n' +
          'Ultimo errore: ' + errore + '\n\n' +
          'La copia sul NAS c\'è (cartella copie). Controlla che il server raggiunga lo script del foglio ' +
          '(WISPER_POSTINO_URL e WISPER_POSTINO_SEGRETO nel .env) e, da Amministrazione › Copie, fai "Fai una copia adesso".',
      });
    } catch (err) {
      // Se il postino non risponde nemmeno per l'avviso, resta l'esito nella tabella copie.
    }
  },

  /** 30 giorni di copie, piu' la prima di ogni mese per 12 mesi. Le altre si tolgono. */
  pulisciCopie() {
    if (!fs.existsSync(this.cartellaCopie)) return 0;
    const ora = new Date(oggi() + 'T12:00:00').getTime();
    const copie = fs.readdirSync(this.cartellaCopie).filter(f => RE_COPIA.test(f)).sort();
    const primaDelMese = {};
    for (const f of copie) {
      const m = f.match(RE_COPIA);
      const mese = m[1] + m[2];
      if (!primaDelMese[mese]) primaDelMese[mese] = f;
    }
    let tolte = 0;
    for (const f of copie) {
      const m = f.match(RE_COPIA);
      const giorni = (ora - new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T12:00:00').getTime()) / 86400000;
      const tieni = giorni <= GIORNI_TENUTE || (primaDelMese[m[1] + m[2]] === f && giorni <= MESI_TENUTE * 31);
      if (!tieni) {
        fs.rmSync(path.join(this.cartellaCopie, f));
        tolte++;
      }
    }
    return tolte;
  },

  /** Le schede del foglio come le scriveva Code.gs: stesse intestazioni (SCHEMA), stessi valori. */
  schedePerIlFoglio() {
    const foto = {};
    for (const f of this.db.righe("SELECT id, rapportino_id, drive_url FROM file WHERE tipo = 'spesa' AND cestinato IS NULL AND rapportino_id IS NOT NULL ORDER BY creato, rowid")) {
      (foto[f.rapportino_id] = foto[f.rapportino_id] || []).push(f.drive_url || '/file/' + f.id);
    }
    const urlFirma = id => {
      if (!testo(id)) return '';
      const f = this.db.riga('SELECT drive_url FROM file WHERE id = ?', id);
      return (f && f.drive_url) || '/file/' + id;
    };
    const rapportini = this.db.righe('SELECT * FROM rapportini ORDER BY data, creato, id').map(r => [
      r.id, vuotoSeNull(r.id_locale), vuotoSeNull(r.data), r.tecnico, r.id_cliente, r.cliente, r.gruppo, r.id_commessa, r.commessa,
      r.ticket, r.luogo, r.descrizione, vuotoSeNull(r.ore_lavoro), vuotoSeNull(r.ore_extra), vuotoSeNull(r.ore_viaggio),
      vuotoSeNull(r.ore_totali), vuotoSeNull(r.km), vuotoSeNull(r.spese), r.note_spese, (foto[r.id] || []).join('\n'),
      vuotoSeNull(r.tariffa), siNo(r.paga_viaggio), siNo(r.km_rimborsati), vuotoSeNull(r.euro_km), vuotoSeNull(r.magg_extra),
      vuotoSeNull(r.compenso_ore), vuotoSeNull(r.rimborso_km), vuotoSeNull(r.totale), vuotoSeNull(r.costo_orario), r.note_interne,
      urlFirma(r.firma), r.firmatario, quandoFoglio(r.firmato_il), r.stato, quandoFoglio(r.inviato_il), quandoFoglio(r.fatturato_il),
      quandoFoglio(r.creato), quandoFoglio(r.modificato),
    ]);
    const clienti = this.db.righe('SELECT * FROM soggetti WHERE cliente = 1 ORDER BY rowid').map(s => [
      s.id, s.nome, s.alias, s.gruppo, s.email, s.telefono, s.indirizzo, s.partita_iva, vuotoSeNull(s.tariffa_fissa),
      vuotoSeNull(s.costo_fisso), vuotoSeNull(s.ultima_tariffa), siNo(s.paga_viaggio), siNo(s.km_rimborsati), vuotoSeNull(s.magg_extra),
      s.accorpato_in, s.note,
    ]);
    const commesse = this.db.righe('SELECT * FROM commesse WHERE modello = 0 ORDER BY rowid').map(m => [
      m.id, m.cliente_id, m.descrizione, m.stato, m.indirizzo, vuotoSeNull(m.budget_ore), vuotoSeNull(m.budget_euro),
      vuotoSeNull(m.prezzo_orario), vuotoSeNull(m.costo_orario), vuotoSeNull(m.euro_km), m.inizio, m.fine_prevista, m.cartella,
      m.codice_precedente, m.note,
    ]);
    const imp = this.leggiImpostazioni();
    const descrizioni = {};
    this.db.righe('SELECT chiave, descrizione FROM impostazioni').forEach(r => { descrizioni[r.chiave] = r.descrizione; });
    const impostazioni = Object.keys(imp).map(k => [k, imp[k], descrizioni[k] || '']);
    return [
      { scheda: 'Rapportini', intestazioni: ['ID', 'ID_LOCALE', 'DATA', 'TECNICO', 'ID_CLIENTE', 'CLIENTE', 'GRUPPO', 'ID_COMMESSA', 'COMMESSA',
        'TICKET', 'LUOGO', 'DESCRIZIONE', 'ORE_LAVORO', 'ORE_EXTRA', 'ORE_VIAGGIO', 'ORE_TOTALI', 'KM', 'SPESE', 'NOTE_SPESE', 'FOTO_SPESE',
        'TARIFFA', 'PAGA_VIAGGIO', 'KM_RIMBORSATI', 'EURO_KM', 'MAGG_EXTRA', 'COMPENSO_ORE', 'RIMBORSO_KM', 'TOTALE', 'COSTO_ORARIO',
        'NOTE_INTERNE', 'FIRMA', 'FIRMATARIO', 'FIRMATO_IL', 'STATO', 'INVIATO_IL', 'FATTURATO_IL', 'CREATO', 'MODIFICATO'], righe: rapportini },
      { scheda: 'Clienti', intestazioni: ['ID_CLIENTE', 'RAGIONE_SOCIALE', 'ALIAS', 'GRUPPO', 'EMAIL', 'TELEFONO', 'INDIRIZZO', 'PARTITA_IVA',
        'TARIFFA_FISSA', 'COSTO_FISSO', 'ULTIMA_TARIFFA', 'PAGA_VIAGGIO', 'KM_RIMBORSATI', 'MAGG_EXTRA', 'ACCORPATO_IN', 'NOTE'], righe: clienti },
      { scheda: 'Commesse', intestazioni: ['ID_COMMESSA', 'ID_CLIENTE', 'DESCRIZIONE', 'STATO', 'INDIRIZZO', 'BUDGET_ORE', 'BUDGET_EURO',
        'PREZZO_ORARIO', 'COSTO_ORARIO', 'EURO_KM', 'INIZIO', 'FINE_PREVISTA', 'CARTELLA', 'CODICE_PRECEDENTE', 'NOTE'], righe: commesse },
      { scheda: 'Impostazioni', intestazioni: ['CHIAVE', 'VALORE', 'A COSA SERVE'], righe: impostazioni },
    ];
  },

  leggiCopie() {
    const file = fs.existsSync(this.cartellaCopie)
      ? fs.readdirSync(this.cartellaCopie).filter(f => RE_COPIA.test(f)).sort().reverse().map(f => {
        const st = fs.statSync(path.join(this.cartellaCopie, f));
        return { nome: f, byte: st.size, quando: dataOraIso(st.mtime) };
      })
      : [];
    return {
      ok: true,
      copie: this.db.righe('SELECT * FROM copie ORDER BY id DESC LIMIT 60').map(copiaDaRiga),
      file,
      oraCopia: this.oraCopia || '02:30',
      prossima: this.prossimaCopia ? dataOraIso(this.prossimaCopia) : '',
      postino: this.postino ? this.postino.descrizione() : 'non configurato',
    };
  },

  /**
   * La copia notturna, pianificata dentro il server: ogni minuto si guarda
   * l'ora, e se e' passata quella fissata e oggi la copia non c'e' ancora, si
   * fa. Se il server era spento alle 02:30, la copia si fa appena riparte.
   */
  pianifica(ora) {
    this.oraCopia = /^\d{2}:\d{2}$/.test(ora || '') ? ora : '02:30';
    const fatta = this.db.riga("SELECT MAX(substr(quando, 1, 10)) giorno FROM copie WHERE nota = 'notturna'");
    this.ultimaNotturna = fatta && fatta.giorno ? fatta.giorno : '';
    const controlla = () => {
      const adesso = new Date();
      const [h, m] = this.oraCopia.split(':').map(Number);
      const soglia = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate(), h, m);
      this.prossimaCopia = this.ultimaNotturna === oggi() || adesso < soglia
        ? (adesso < soglia ? soglia : new Date(soglia.getTime() + 86400000)) : adesso;
      if (adesso >= soglia && this.ultimaNotturna !== oggi() && !this.copiaInCorso) {
        this.ultimaNotturna = oggi();
        this.copiaDiSicurezza('notturna')
          .then(c => console.log('[copia] ' + c.quando + ' NAS ' + c.locale + ' · fuori ' + c.fuori + ' · foglio ' + c.foglio))
          .catch(err => console.error('[copia] non riuscita: ' + messaggio(err)));
      }
    };
    controlla();
    this.pianificazione = setInterval(controlla, 60000);
    this.pianificazione.unref();
  },
};

function copiaDaRiga(c) {
  return { id: c.id, quando: dataOraIso(c.quando), file: c.file, byte: c.byte, locale: c.locale, fuori: c.fuori, foglio: c.foglio, nota: c.nota };
}
