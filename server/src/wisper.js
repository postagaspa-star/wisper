/*
 * Il cuore del server: un oggetto solo con il database, la cartella dei dati
 * e tutte le azioni. Le azioni stanno in file separati (azioni/*.js) e qui si
 * mettono insieme: dentro ognuna "this" e' il server, come in Code.gs ogni
 * funzione vedeva il foglio.
 *
 * Chi sta facendo la richiesta (utente, dispositivo, azione) viaggia con
 * AsyncLocalStorage: il registro lo legge da li', senza passarlo a mano a ogni
 * funzione.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { Database } = require('./db');
const P = require('./permessi');
const { testo, adesso, partitaIvaDalFoglio, telefonoDalFoglio, senzaApostrofo, Rifiuto } = require('./utili');
const { schemaFormato, formatta, controllaFormato } = require('./formati');

const VERSIONE = require('../package.json').version;

const contesto = new AsyncLocalStorage();

/** Chi lavora quando non c'e' una richiesta: l'avvio, la copia notturna, gli strumenti. */
const SISTEMA = { utente: null, permessi: null, disp: '', dispNome: '', app: 'server', azione: '', ponte: false, sistema: true };

/**
 * Le impostazioni, una per riga: chiave, valore, a cosa serve. Le stesse di
 * IMPOSTAZIONI_INIZIALI in Code.gs.
 */
const IMPOSTAZIONI_INIZIALI = [
  ['EURO_KM', 0.76, 'Rimborso chilometrico, se la commessa non ne ha uno suo. Da controllare ogni gennaio sulla tabella ACI dell\'auto qui sotto.'],
  ['AUTO', 'Volvo XC40', 'L\'auto su cui si calcola il rimborso ACI.'],
  ['COSTO_ORARIO', '', 'Quanto costa a te un\'ora di lavoro. Serve solo a calcolare il margine delle commesse.'],
  ['TICKET_ATTIVO', 'NO', 'SI per mostrare il campo ticket nel rapportino.'],
  ['TECNICO', 'Manuel Gasparotto', 'Il nome che compare come compilatore.'],
  ['RAGIONE_SOCIALE', 'Studio Tecnico GM', 'Intestazione dei PDF.'],
  ['INDIRIZZO', '', 'Intestazione dei PDF.'],
  ['PARTITA_IVA', '', 'Intestazione dei PDF.'],
  ['EMAIL', '', 'Intestazione dei PDF.'],
  ['TELEFONO', '', 'Intestazione dei PDF.'],
  ['PEC', '', 'Intestazione dei PDF.'],
  ['FIRMA_TECNICO', '', 'La firma del compilatore: si mette da sola su ogni rapportino. La carica il programma.'],
  ['EMAIL_AVVISI', '', 'Chi riceve gli avvisi di sicurezza oltre al titolare. Piu\' indirizzi separati da virgola.'],
];

/** Le colonne che sono sempre testo, anche quando dentro ci sono solo cifre. */
const SEMPRE_TESTO = ['partitaIva', 'telefono', 'PARTITA_IVA', 'TELEFONO',
  // Fase 4: i dati dello studio per le fatture (un CAP o un numero d'albo restano testo).
  'CODICE_FISCALE', 'STUDIO_CAP', 'ALBO_NUMERO', 'ALBO_PROVINCIA', 'ALBO_DATA'];

const NUMERAZIONI_INIZIALI = [
  { tipo: 'commessa', formato: '{AA}ST{NNN}', annuale: 0 },
  { tipo: 'rapportino', formato: 'RAP/{AAAA}/{NNNN}', annuale: 1 },
  // Fase 2 (la mette anche la migrazione 002): riparte ogni anno, le revisioni tengono il numero.
  { tipo: 'preventivo', formato: 'PR/{AAAA}/{NNN}', annuale: 1 },
];

/**
 * Fase 4: le regole fiscali. Cambiarne una toglie la conferma del commercialista
 * (REGOLE_FISCALI_CONFERMATE torna null, con la nota nel registro).
 */
const REGOLE_FISCALI = ['REGIME_FISCALE', 'TIPO_DOCUMENTO', 'RITENUTA_TIPO', 'RITENUTA_CAUSALE', 'EPPI_TIPO_CASSA', 'BOLLO_SOGLIA',
  'BOLLO_IMPORTO', 'BOLLO_RIVALSA', 'GIORNI_PAGAMENTO', 'PAGAMENTO_FINE_MESE', 'MODALITA_PAGAMENTO', 'IVA', 'EPPI_INTEGRATIVO', 'RITENUTA'];

/** Mai nel registro: la password (anche se scrypt) e i token. */
const CAMPI_SEGRETI = ['password_hash', 'token_hash'];

/** Un campo che cambia a ogni salvataggio: nel registro sarebbe solo rumore. */
const CAMPI_RUMORE = ['modificato'];

class Wisper {
  /**
   * @param opzioni.dati    la cartella dei dati (/data sul NAS): wisper.db, file/, copie/
   * @param opzioni.memoria database in memoria (le prove, --prova)
   * @param opzioni.postino chi porta email e copie fuori casa (postino.js)
   */
  constructor(opzioni) {
    this.dati = opzioni.dati;
    this.versione = VERSIONE;
    this.postino = opzioni.postino || null;
    this.prova = !!opzioni.prova;
    this.cartellaFile = path.join(this.dati, 'file');
    this.cartellaCopie = path.join(this.dati, 'copie');
    fs.mkdirSync(this.cartellaFile, { recursive: true });
    this.percorsoDb = opzioni.memoria ? ':memory:' : path.join(this.dati, 'wisper.db');
    this.db = new Database(this.percorsoDb);
    this.db.migra(path.join(__dirname, 'migrazioni'));
    this.prepara();
  }

  /**
   * Quello che serve sempre e manca: i permessi iniziali dei ruoli, le
   * impostazioni con i loro valori di partenza, le numerazioni. Non tocca
   * niente di quello che c'e': si puo' fare a ogni avvio.
   */
  prepara() {
    this.db.transazione(() => {
      for (const ruolo of P.RUOLI) {
        const p = P.iniziali(ruolo);
        for (const m of P.TUTTE) {
          this.db.esegui('INSERT OR IGNORE INTO permessi (ruolo, modulo, livello) VALUES (?, ?, ?)', ruolo, m, p[m]);
        }
      }
      for (const [k, v, descr] of IMPOSTAZIONI_INIZIALI) {
        this.db.esegui('INSERT OR IGNORE INTO impostazioni (chiave, valore, descrizione) VALUES (?, ?, ?)', k, JSON.stringify(v), descr);
      }
      for (const n of NUMERAZIONI_INIZIALI) {
        this.db.esegui('INSERT OR IGNORE INTO numerazioni (tipo, formato, annuale) VALUES (?, ?, ?)', n.tipo, n.formato, n.annuale);
      }
      // Fase 3: il primo veicolo e' l'auto delle impostazioni (AUTO, EURO_KM), se non ce n'e' nessuno.
      this.preparaVeicoli();
    });
  }

  chiudi() {
    if (this.pianificazione) clearInterval(this.pianificazione);
    this.db.chiudi();
  }

  // ------------------------------------------------------------------ chi lavora

  chi() {
    return contesto.getStore() || SISTEMA;
  }

  /** Fa fn() "come" quella persona: il registro e i permessi leggono chi() da qui. */
  come(chi, fn) {
    return contesto.run(Object.assign({}, SISTEMA, { sistema: false }, chi), fn);
  }

  /** Il livello di un modulo per chi sta lavorando (il sistema puo' tutto). */
  livello(modulo) {
    const c = this.chi();
    if (c.sistema || !c.permessi) return 2;
    return c.permessi[modulo] || 0;
  }

  vedeCosti() {
    return this.livello('costi') > 0;
  }

  /** Un collaboratore vede e scrive solo i suoi rapportini (e, dalla fase 3, le sue ore, spese e trasferte). */
  soloSuoi() {
    const c = this.chi();
    return !!(c.utente && c.utente.ruolo === 'collaboratore');
  }

  /** I permessi di un ruolo. Il titolare ha sempre tutto, qualunque cosa ci sia scritto. */
  permessiDi(ruolo) {
    const p = {};
    P.TUTTE.forEach(m => { p[m] = 0; });
    if (ruolo === 'titolare') {
      P.TUTTE.forEach(m => { p[m] = 2; });
      return p;
    }
    for (const r of this.db.righe('SELECT modulo, livello FROM permessi WHERE ruolo = ?', ruolo)) {
      if (r.modulo in p) p[r.modulo] = r.livello;
    }
    return p;
  }

  /** Il primo titolare attivo: il ponte lavora a nome suo. */
  titolare() {
    return this.db.riga("SELECT id, nome, email, ruolo FROM utenti WHERE ruolo = 'titolare' AND attivo = 1 ORDER BY id LIMIT 1");
  }

  // ------------------------------------------------------------------ registro delle modifiche

  /**
   * Una riga nel registro: chi, quando, da dove, cosa e' cambiato. Mai password
   * o token: al loro posto "(cambiata)".
   */
  annota(tabella, idRiga, prima, dopo, nota) {
    const c = this.chi();
    const pulisci = o => {
      if (!o) return null;
      const x = Object.assign({}, o);
      for (const k of CAMPI_SEGRETI) if (k in x) x[k] = x[k] ? '(cambiata)' : '';
      return JSON.stringify(x);
    };
    const note = [nota, c.ponte ? 'dalla versione vecchia (ponte)' : ''].filter(Boolean).join('; ');
    this.db.esegui(
      'INSERT INTO registro (quando, utente_id, utente, disp, azione, tabella, id_riga, prima, dopo, nota) VALUES (?,?,?,?,?,?,?,?,?,?)',
      adesso(), c.utente ? c.utente.id : null, c.utente ? c.utente.nome : (c.sistema ? 'sistema' : ''),
      testo(c.dispNome || c.disp).slice(0, 80), testo(c.azione).slice(0, 40), tabella, String(idRiga === null || idRiga === undefined ? '' : idRiga),
      pulisci(prima), pulisci(dopo), note);
  }

  /** Una riga nuova, con la sua annotazione (dopo = i campi scritti, senza quelli vuoti). nota: per il registro. */
  inserisci(tabella, valori, chiave, nota) {
    chiave = chiave || 'id';
    const colonne = Object.keys(valori);
    const r = this.db.esegui(
      'INSERT INTO ' + tabella + ' (' + colonne.join(', ') + ') VALUES (' + colonne.map(c => '@' + c).join(', ') + ')',
      valori);
    const id = valori[chiave] !== undefined ? valori[chiave] : Number(r.lastInsertRowid);
    const dopo = {};
    for (const k of colonne) {
      const v = valori[k];
      if (v !== null && v !== undefined && v !== '' && CAMPI_RUMORE.indexOf(k) < 0) dopo[k] = v === true ? 1 : v === false ? 0 : v;
    }
    this.annota(tabella, id, null, dopo, nota);
    return id;
  }

  /**
   * Cambia i campi dati di una riga e annota solo quelli cambiati davvero.
   * Torna quanti campi sono cambiati (0: niente da scrivere). nota: per il registro
   * ("passata al programma", "dalla fattura 45/2026 (W-15)"...).
   */
  aggiorna(tabella, id, valori, chiave, nota) {
    chiave = chiave || 'id';
    const prima = this.db.riga('SELECT * FROM ' + tabella + ' WHERE ' + chiave + ' = ?', id);
    if (!prima) throw new Rifiuto('Riga ' + id + ' non trovata in ' + tabella);
    const cambiati = {};
    const vecchi = {};
    for (const k of Object.keys(valori)) {
      if (!(k in prima)) throw new Error('Colonna sconosciuta: ' + tabella + '.' + k);
      if (uguali(prima[k], valori[k])) continue;
      cambiati[k] = valori[k];
      vecchi[k] = prima[k];
    }
    const colonne = Object.keys(cambiati);
    if (!colonne.length) return 0;
    this.db.esegui(
      'UPDATE ' + tabella + ' SET ' + colonne.map(c => c + ' = @' + c).join(', ') + ' WHERE ' + chiave + ' = @__chiave',
      Object.assign({}, cambiati, { __chiave: prima[chiave] }));
    const veri = colonne.filter(c => CAMPI_RUMORE.indexOf(c) < 0);
    if (veri.length) {
      const p = {};
      const d = {};
      veri.forEach(c => { p[c] = vecchi[c]; d[c] = cambiati[c] === true ? 1 : cambiati[c] === false ? 0 : cambiati[c]; });
      this.annota(tabella, prima[chiave], p, d, nota);
    }
    return veri.length;
  }

  // ------------------------------------------------------------------ impostazioni

  /** Le impostazioni come oggetto: { EURO_KM: 0.76, AUTO: 'Volvo XC40', ... } */
  leggiImpostazioni() {
    const o = {};
    IMPOSTAZIONI_INIZIALI.forEach(r => { o[r[0]] = r[1]; });
    for (const r of this.db.righe('SELECT chiave, valore FROM impostazioni ORDER BY rowid')) {
      let v;
      try { v = JSON.parse(r.valore); } catch (e) { v = r.valore; }
      if (r.chiave === 'PARTITA_IVA') v = partitaIvaDalFoglio(v);
      else if (r.chiave === 'TELEFONO') v = telefonoDalFoglio(v);
      else v = senzaApostrofo(v);
      o[r.chiave] = v;
    }
    return o;
  }

  salvaImpostazioni(valori) {
    valori = valori || {};
    // Fase 4: la conferma del commercialista la segna solo il titolare (confermaRegoleFiscali), non questo salvataggio.
    if (Object.prototype.hasOwnProperty.call(valori, 'REGOLE_FISCALI_CONFERMATE') && !this.chi().sistema) {
      throw new Rifiuto('La conferma delle regole fiscali si segna con "Segna confermate": la segna solo il titolare');
    }
    const prima = this.leggiImpostazioni();
    for (const k of Object.keys(valori)) {
      const chiave = testo(k);
      if (!chiave) continue;
      const v = JSON.stringify(comeLaCella(chiave, valori[k]));
      if (this.db.riga('SELECT chiave FROM impostazioni WHERE chiave = ?', chiave)) {
        this.aggiorna('impostazioni', chiave, { valore: v }, 'chiave');
      } else {
        this.inserisci('impostazioni', { chiave, valore: v, descrizione: '' }, 'chiave');
      }
    }
    // Fase 4: cambiare una regola fiscale toglie la conferma del commercialista (fase4.md §3.4 e §4.1).
    const dopo = this.leggiImpostazioni();
    const cambiata = REGOLE_FISCALI.some(k => Object.prototype.hasOwnProperty.call(valori, k) && JSON.stringify(prima[k]) !== JSON.stringify(dopo[k]));
    if (cambiata && dopo.REGOLE_FISCALI_CONFERMATE) {
      this.aggiorna('impostazioni', 'REGOLE_FISCALI_CONFERMATE', { valore: 'null' }, 'chiave', 'regole cambiate: la conferma del commercialista non vale più');
      return this.leggiImpostazioni();
    }
    return dopo;
  }

  // ------------------------------------------------------------------ numerazioni

  numerazione(tipo) {
    const n = this.db.riga('SELECT * FROM numerazioni WHERE tipo = ?', tipo);
    if (!n) throw new Rifiuto('Numerazione sconosciuta: ' + tipo);
    return n;
  }

  /**
   * Il prossimo numero: sempre il piu' alto gia' usato + 1, come oggi (i buchi
   * non si riusano). Contano i codici scritti col formato di adesso e con
   * quelli di prima, cosi' cambiare formato non fa ripartire il contatore.
   * Per una numerazione annuale (RAP/2026/0001) contano solo quelli dell'anno.
   */
  prossimoNumero(tipo, codici, anno) {
    const n = this.numerazione(tipo);
    const formati = [n.formato].concat(JSON.parse(n.formati_precedenti || '[]'));
    const schemi = formati.map(schemaFormato);
    let max = n.annuale ? 0 : n.ultimo;
    for (const c of codici) {
      const s = String(c || '').trim();
      for (const sc of schemi) {
        const m = s.match(sc.re);
        if (!m) continue;
        if (n.annuale) {
          const a = sc.anno4 ? Number(m[sc.anno4]) : sc.anno2 ? Number(m[sc.anno2]) : null;
          if (a === null) continue;
          if (sc.anno4 ? a !== anno : a !== anno % 100) continue;
        }
        max = Math.max(max, parseInt(m[sc.numero], 10));
        break;
      }
    }
    return { numero: max + 1, codice: formatta(n.formato, anno, max + 1) };
  }

  /** Dopo aver dato un numero: "ultimo" ricorda il piu' alto, anche se i codici cambiassero formato. */
  segnaNumero(tipo, numero) {
    this.db.esegui('UPDATE numerazioni SET ultimo = MAX(ultimo, ?) WHERE tipo = ?', numero, tipo);
  }

  /** Il numero dentro un codice scritto col formato di adesso (o null). */
  numeroDi(tipo, codice) {
    const n = this.numerazione(tipo);
    for (const f of [n.formato].concat(JSON.parse(n.formati_precedenti || '[]'))) {
      const sc = schemaFormato(f);
      const m = String(codice || '').trim().match(sc.re);
      if (m) return parseInt(m[sc.numero], 10);
    }
    return null;
  }
}

/**
 * Due valori uguali per il database: null e undefined lo sono, vero/falso
 * valgono 1/0, e un numero scritto come testo vale il numero.
 */
function uguali(a, b) {
  const n = v => (v === undefined ? null : v === true ? 1 : v === false ? 0 : v);
  a = n(a);
  b = n(b);
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b) && String(a).trim() !== '' && String(b).trim() !== '';
  return String(a) === String(b);
}

/**
 * Il valore come lo teneva il foglio: Fogli leggeva quello che riceveva come
 * se l'avesse digitato una persona, e "15" diventava il numero 15. Le partite
 * IVA, i telefoni, i codici con lo zero davanti e le formule restavano testo.
 */
function comeLaCella(chiave, v) {
  if (typeof v !== 'string') return v === undefined ? '' : v;
  if (v === '' || SEMPRE_TESTO.indexOf(chiave) >= 0) return v;
  if (/^[=+\-@']/.test(v) || /^0[\d\s]*$/.test(v)) return v;
  if (/^\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return v;
}

module.exports = {
  Wisper, contesto, SISTEMA, IMPOSTAZIONI_INIZIALI, SEMPRE_TESTO, VERSIONE, uguali, comeLaCella, REGOLE_FISCALI,
  schemaFormato, formatta, controllaFormato,
};

// Le azioni, divise per argomento: ognuna aggiunge i suoi metodi al server.
for (const parte of ['anagrafiche', 'rapportini', 'file', 'accesso', 'amministrazione', 'dashboard', 'esporta', 'copie', 'email', 'vies',
  'preventivi', 'attivita', 'ore', 'spese', 'fatture', 'ritorno', 'banche']) {
  Object.assign(Wisper.prototype, require('./azioni/' + parte));
}
