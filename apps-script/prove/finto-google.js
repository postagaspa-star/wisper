// Un finto Google per provare Wisper senza toccare il foglio vero.
//
// Esegue apps-script/Code.gs COSI' COM'E', con al posto di Fogli, Drive e Gmail
// delle imitazioni in memoria, e lo serve in HTTP come farebbe l'app web
// pubblicata. Telefono (emulatore: http://10.0.2.2:8765/exec) e Wisper Ufficio
// (http://localhost:8765/exec) ci parlano come al foglio vero.
//
//   node apps-script/prove/finto-google.js [porta]
//
// Codice: "prova". Le email non partono: finiscono in apps-script/prove/posta-finta/.
// Si parte con qualche cliente, commessa e rapportino di esempio.
//
// Fase 7 (docs/gestionale/fase7.md §0.1): con WISPER_PROGETTO=portale fa lo SCRIPT DEL PORTALE, il progetto a parte:
//   WISPER_PROGETTO=portale node apps-script/prove/finto-google.js 8766
// carica solo Porta.gs e PortaleClienti.gs (niente foglio, niente dati di esempio, niente CODICE), risponde con
// Access-Control-Allow-Origin: * come Google dopo il rimbalzo su script.googleusercontent.com, e il segreto del NAS
// (la proprieta' SEGRETO_SERVER dello script) e' WISPER_SEGRETO_PORTALE, di base "prova-portale".
// Fase 8 (docs/gestionale/fase8.md §0.3): in modalita' portale anche le GET con ?calendario=<chiave> (il calendario
// "anche fuori casa"): la risposta e' text/calendar se e' un calendario, text/plain se no (come MimeType.ICAL e TEXT).
'use strict';

process.env.TZ = 'Europe/Rome';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const PORTA = Number(process.argv[2] || 8765);
const PORTALE = process.env.WISPER_PROGETTO === 'portale';
const CARTELLA_POSTA = process.env.WISPER_POSTA_FINTA || path.join(__dirname, 'posta-finta');

// ------------------------------------------------------------------ Fogli

class Intervallo {
  constructor(foglio, riga, colonna, righe, colonne) {
    Object.assign(this, { foglio, riga, colonna, righe, colonne });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.righe; r++) {
      const riga = [];
      for (let c = 0; c < this.colonne; c++) {
        const v = (this.foglio.celle[this.riga - 1 + r] || [])[this.colonna - 1 + c];
        riga.push(v === undefined ? '' : v);
      }
      out.push(riga);
    }
    return out;
  }
  setValues(valori) {
    valori.forEach((riga, r) => riga.forEach((v, c) => this.foglio.scrivi(this.riga + r, this.colonna + c, v)));
    return this;
  }
  setValue(v) { this.foglio.scrivi(this.riga, this.colonna, v); return this; }
  clearContent() {
    for (let r = 0; r < this.righe; r++) for (let c = 0; c < this.colonne; c++) this.foglio.scrivi(this.riga + r, this.colonna + c, '');
    return this;
  }
  setFontWeight() { return this; }
}

class Foglio {
  constructor(nome) { this.nome = nome; this.celle = []; this.bloccate = 0; }
  getName() { return this.nome; }
  scrivi(riga, colonna, v) {
    while (this.celle.length < riga) this.celle.push([]);
    const r = this.celle[riga - 1];
    while (r.length < colonna) r.push('');
    r[colonna - 1] = comeFogli(v);
  }
  deleteRows(da, quante) { this.celle.splice(da - 1, quante); }
  getLastRow() {
    for (let i = this.celle.length - 1; i >= 0; i--) if (this.celle[i].some(v => v !== '' && v !== undefined)) return i + 1;
    return 0;
  }
  getLastColumn() { return this.celle.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(riga, colonna, righe, colonne) { return new Intervallo(this, riga, colonna, righe || 1, colonne || 1); }
  getDataRange() { return new Intervallo(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(valori) { const r = this.getLastRow() + 1; valori.forEach((v, c) => this.scrivi(r, c + 1, v)); }
  getFrozenRows() { return this.bloccate; }
  setFrozenRows(n) { this.bloccate = n; }
}

/**
 * Come Fogli legge quello che riceve: come se l'avesse digitato una persona.
 * Le date restano date; "'0123" e' testo (l'apostrofo non resta); "=..." e' una
 * formula (qui: un errore); "0445123456" e "+393331234567" diventano numeri, e
 * lo zero o il + davanti si perdono. E' proprio quello che succedeva alle partite IVA.
 */
function comeFogli(v) {
  if (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]') return new Date(v.getTime());
  if (typeof v !== 'string') return v;
  if (v.charAt(0) === '\'') return v.slice(1);
  if (v.charAt(0) === '=') return '#ERROR!';
  if (/^[+-]?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return v;
}

const fogli = new Map();
const Cartella = {
  getId: () => 'foglio-finto',
  getName: () => 'Wisper',
  getSheetByName: n => fogli.get(n) || null,
  insertSheet: n => { const f = new Foglio(n); fogli.set(n, f); return f; },
  getSheets: () => Array.from(fogli.values()),
};

// ------------------------------------------------------------------ Drive

let contatore = 0;
const nuovoId = () => 'finto' + (++contatore).toString().padStart(6, '0') + crypto.randomBytes(4).toString('hex');
const elementi = new Map();

class FileFinto {
  constructor(blob, madre) {
    this.id = nuovoId(); this.blob = blob; this.madre = madre; this.cestino = false; this.data = new Date();
    elementi.set(this.id, this);
  }
  getId() { return this.id; }
  getName() { return this.blob.nome; }
  getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; }
  getBlob() { return this.blob; }
  getMimeType() { return this.blob.mime; }
  getLastUpdated() { return this.data; }
  getDateCreated() { return this.data; }
  getSize() { return this.blob.bytes.length; }
  isTrashed() { return this.cestino; }
  setTrashed(v) { this.cestino = v; return this; }
  getParents() { return iteratore(this.madre ? [this.madre] : []); }
}

class CartellaFinta {
  constructor(nome, madre) { this.id = nuovoId(); this.nome = nome; this.madre = madre; this.figli = []; elementi.set(this.id, this); }
  getId() { return this.id; }
  getName() { return this.nome; }
  getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }
  isTrashed() { return false; }
  getParents() { return iteratore(this.madre ? [this.madre] : []); }
  getFoldersByName(n) { return iteratore(this.figli.filter(x => x instanceof CartellaFinta && x.nome === n)); }
  getFilesByName(n) { return iteratore(this.figli.filter(x => x instanceof FileFinto && x.getName() === n && !x.cestino)); }
  getFiles() { return iteratore(this.figli.filter(x => x instanceof FileFinto)); }
  createFolder(n) { const c = new CartellaFinta(n, this); this.figli.push(c); return c; }
  createFile(blob, contenuto, mime) {
    // Come DriveApp: createFile(blob) oppure createFile(nome, testo, tipo).
    if (typeof blob === 'string') blob = Utilities.newBlob(contenuto || '', mime || 'text/plain', blob);
    const f = new FileFinto(blob, this); this.figli.push(f); return f;
  }
}

/**
 * Il servizio avanzato "Drive API" (nell'editor: Servizi > Drive API). Di base
 * spento, come in un progetto appena creato: le prove lo accendono con
 * modulo.driveAvanzato(true). Files.remove cancella per sempre, senza cestino.
 */
const DriveAvanzato = {
  Files: {
    remove: id => {
      const e = elementi.get(id);
      if (!(e instanceof FileFinto)) throw new Error('File not found: ' + id);
      elementi.delete(id);
      if (e.madre) e.madre.figli = e.madre.figli.filter(x => x !== e);
    },
  },
};

function iteratore(lista) {
  let i = 0;
  return { hasNext: () => i < lista.length, next: () => lista[i++] };
}

const radiceDrive = new CartellaFinta('Il mio Drive', null);
const DriveApp = {
  createFolder: n => radiceDrive.createFolder(n),
  getFolderById: id => { const e = elementi.get(id); if (!(e instanceof CartellaFinta)) throw new Error('cartella inesistente'); return e; },
  getFileById: id => {
    // Il foglio stesso, visto da Drive: serve solo a sapere di chi e'.
    if (id === 'foglio-finto') return { getOwner: () => ({ getEmail: () => 'proprietario@example.com' }) };
    const e = elementi.get(id); if (!(e instanceof FileFinto)) throw new Error('file inesistente'); return e;
  },
};

// ------------------------------------------------------------------ il resto di Google

const proprieta = PORTALE ? new Map([['SEGRETO_SERVER', process.env.WISPER_SEGRETO_PORTALE || 'prova-portale']]) : new Map([['CODICE', 'prova']]);
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (proprieta.has(k) ? proprieta.get(k) : null),
    setProperty: (k, v) => { proprieta.set(k, String(v)); },
    getProperties: () => Object.fromEntries(proprieta),
    deleteProperty: k => { proprieta.delete(k); },
  }),
};

// Nel filo principale (le prove che chiamano lo script direttamente) il lucchetto non aspetta mai.
// Le esecuzioni HTTP (finto-esecuzione.js) usano quello vero qui sotto, uno per tutto lo script.
const LockService = { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {}, hasLock: () => true }) };
const lucchetto = { chi: null, scade: 0 };

/**
 * La cache dello script, con i limiti della documentazione di Google: chiave fino
 * a 250 caratteri, valore fino a 100 KB, scadenza da 1 secondo a 6 ore (di base
 * 10 minuti), al massimo 1.000 voci (oltre, restano le 900 piu' lontane dalla scadenza).
 */
const memoria = new Map();
const LIMITI_CACHE = { chiave: 250, valore: 100 * 1024, scadenza: 21600, voci: 1000, dopo: 900 };
function cacheViva(k) {
  const e = memoria.get(k);
  if (!e) return null;
  if (e.scade <= Date.now()) { memoria.delete(k); return null; }
  return e.v;
}
function cacheMetti(k, v, secondi) {
  k = String(k);
  v = String(v);
  if (k.length > LIMITI_CACHE.chiave) throw new Error('Argument too large: key');
  if (Buffer.byteLength(v, 'utf8') > LIMITI_CACHE.valore) throw new Error('Argument too large: value');
  const s = secondi === undefined ? 600 : Number(secondi);
  if (!(s >= 1 && s <= LIMITI_CACHE.scadenza)) throw new Error('Invalid argument: expirationInSeconds');
  memoria.set(k, { v, scade: Date.now() + s * 1000 });
}
function cacheTroppe() {
  if (memoria.size <= LIMITI_CACHE.voci) return;
  const ordine = Array.from(memoria.entries()).sort((a, b) => b[1].scade - a[1].scade);
  ordine.slice(LIMITI_CACHE.dopo).forEach(([k]) => memoria.delete(k));
}
const CacheService = {
  getScriptCache: () => ({
    get: k => cacheViva(String(k)),
    getAll: chiavi => {
      const o = {};
      (chiavi || []).forEach(k => { const v = cacheViva(String(k)); if (v !== null) o[k] = v; });
      return o;
    },
    put: (k, v, secondi) => { cacheMetti(k, v, secondi); cacheTroppe(); },
    putAll: (valori, secondi) => { Object.keys(valori || {}).forEach(k => cacheMetti(k, valori[k], secondi)); cacheTroppe(); },
    remove: k => { memoria.delete(String(k)); },
    removeAll: chiavi => { (chiavi || []).forEach(k => memoria.delete(String(k))); },
  }),
};

const due = n => String(n).padStart(2, '0');
const Utilities = {
  formatDate(d, fuso, formato) {
    const sost = {
      yyyy: d.getFullYear(), MM: due(d.getMonth() + 1), dd: due(d.getDate()),
      HH: due(d.getHours()), mm: due(d.getMinutes()), ss: due(d.getSeconds()),
    };
    return formato.split(/('[^']*')/).map(pezzo => pezzo.startsWith("'") ? pezzo.slice(1, -1)
      : pezzo.replace(/yyyy|MM|dd|HH|mm|ss/g, k => sost[k])).join('');
  },
  parseDate(s, fuso, formato) {
    if (formato !== 'yyyy-MM-dd') throw new Error('formato non imitato: ' + formato);
    const [a, m, g] = s.split('-').map(Number);
    return new Date(a, m - 1, g);
  },
  getUuid: () => crypto.randomUUID(),
  base64Decode: s => Array.from(Buffer.from(s, 'base64')),
  base64Encode: b => Buffer.from(b).toString('base64'),
  // Come Google: l'impronta torna in byte con segno (da -128 a 127).
  DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256' },
  computeDigest: (alg, bytes) => Array.from(crypto.createHash(alg).update(Buffer.from(bytes.map(b => b & 0xff))).digest()).map(b => b > 127 ? b - 256 : b),
  newBlob: (bytes, mime, nome) => ({
    nome, mime, bytes: Buffer.from(bytes),
    getBytes() { return Array.from(this.bytes); },
    getDataAsString() { return this.bytes.toString('utf8'); },
    getContentType() { return this.mime; },
    getName() { return this.nome; },
  }),
  // Ferma l'esecuzione (qui il filo principale: solo per attese brevi nelle prove dirette).
  sleep: ms => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, Number(ms) || 0)); },
};

/**
 * Maps (12/11/2026, postinoDistanza): la strada finta, sempre la stessa per lo stesso indirizzo (come il postino finto del
 * server). Un indirizzo con "introvabile" non si trova (NOT_FOUND). modulo.mappe conta le domande.
 */
const Maps = {
  DirectionFinder: { Mode: { DRIVING: 'driving', WALKING: 'walking' } },
  newDirectionFinder() {
    const o = {};
    const f = {
      setLanguage(x) { o.lingua = x; return f; }, setRegion(x) { o.regione = x; return f; }, setOrigin(x) { o.da = x; return f; },
      setDestination(x) { o.a = x; return f; }, setMode(x) { o.modo = x; return f; },
      getDirections() {
        modulo.mappe.push(Object.assign({}, o));
        const s = String(o.a || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (s.indexOf('introvabile') >= 0) return { status: 'NOT_FOUND', routes: [] };
        const n = parseInt(crypto.createHash('sha256').update(s).digest('hex').slice(0, 8), 16);
        return { status: 'OK', routes: [{ legs: [{ distance: { value: 4000 + (n % 561) * 100, text: '' }, end_address: String(o.a).trim() + ', Italia' }] }] };
      },
    };
    return f;
  },
};

const MailApp = {
  sendEmail(a, oggetto, corpo, opzioni) {
    fs.mkdirSync(CARTELLA_POSTA, { recursive: true });
    const quando = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(CARTELLA_POSTA, quando);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'email.txt'),
      'A: ' + a + '\nCC: ' + (opzioni.cc || '') + '\nDa: ' + (opzioni.name || '') + '\nRispondi a: ' + (opzioni.replyTo || '') +
      '\nOggetto: ' + oggetto + '\n\n' + corpo + '\n');
    (opzioni.attachments || []).forEach(b => fs.writeFileSync(path.join(dir, b.nome), b.bytes));
    console.log('[posta] a ' + a + ': ' + oggetto + ' (' + (opzioni.attachments || []).length + ' allegati) -> ' + dir);
  },
  getRemainingDailyQuota: () => 100,
};

/**
 * UrlFetchApp e' sincrono, Node no: la chiamata vera la fa un secondo processo
 * Node, aspettato fino alla fine. Basta per il ponte verso il server di prova.
 * Le prove possono sostituirla con modulo.urlFetch = (url, opzioni) => ({ codice, testo }).
 */
const { execFileSync } = require('node:child_process');
function urlFetchVero(url, opzioni) {
  const script = 'let d="";process.stdin.on("data",x=>d+=x).on("end",async()=>{const o=JSON.parse(d);' +
    'try{const r=await fetch(o.url,{method:o.metodo,headers:o.intestazioni,body:o.corpo});' +
    'process.stdout.write(JSON.stringify({codice:r.status,testo:await r.text()}))}' +
    'catch(e){process.stdout.write(JSON.stringify({errore:e.message}))}})';
  const intestazioni = Object.assign({}, opzioni.headers || {});
  if (opzioni.contentType) intestazioni['Content-Type'] = opzioni.contentType;
  const fuori = JSON.parse(execFileSync(process.execPath, ['-e', script], {
    input: JSON.stringify({ url, metodo: (opzioni.method || 'get').toUpperCase(), intestazioni, corpo: opzioni.payload }),
    timeout: 30000,
  }).toString());
  if (fuori.errore) throw new Error('Indirizzo non raggiungibile: ' + url);
  return fuori;
}
const modulo = { urlFetch: urlFetchVero, chiamate: [], mappe: [] };
const UrlFetchApp = {
  fetch(url, opzioni) {
    modulo.chiamate.push({ url, opzioni: opzioni || {} });
    const r = modulo.urlFetch(url, opzioni || {});
    return { getResponseCode: () => r.codice, getContentText: () => r.testo };
  },
};

// Gli attivatori: si ricordano e basta.
const attivatori = [];
const ScriptApp = {
  getProjectTriggers: () => attivatori.slice(),
  deleteTrigger: t => { attivatori.splice(attivatori.indexOf(t), 1); },
  newTrigger: funzione => {
    const t = { funzione, getHandlerFunction: () => funzione };
    const catena = { timeBased: () => catena, everyDays: () => catena, atHour: o => { t.ora = o; return catena; }, create: () => { attivatori.push(t); return t; } };
    return catena;
  },
};

const contesto = {
  SpreadsheetApp: { getActiveSpreadsheet: () => Cartella },
  DriveApp, PropertiesService, LockService, CacheService, Utilities, MailApp, UrlFetchApp, ScriptApp, Maps,
  Session: { getEffectiveUser: () => ({ getEmail: () => 'proprietario@example.com' }) },
  ContentService: {
    MimeType: { JSON: 'application/json', TEXT: 'text/plain', ICAL: 'text/calendar' },
    createTextOutput: testo => ({ testo, mime: '', setMimeType(m) { this.mime = m; return this; } }),
  },
  Logger: { log: (...x) => console.log('[script]', ...x) },
  console,
};
vm.createContext(contesto);
// I file del progetto Apps Script, nell'ordine dell'editor. WISPER_SCRIPT: un altro Code.gs (per esempio
// quello di prima, per vedere che le prove lo bocciano). Ponte.gs: il ponte verso il server e il postino;
// Porta.gs: la porta Google (le app nuove e il server sul NAS che viene a prendere il lavoro).
const FILE_SCRIPT = PORTALE ? ['Porta.gs', 'PortaleClienti.gs'].map(f => path.join(__dirname, '..', f))
  : [process.env.WISPER_SCRIPT || path.join(__dirname, '..', 'Code.gs')]
    .concat(['Ponte.gs', 'Porta.gs'].map(f => path.join(__dirname, '..', f)).filter(f => fs.existsSync(f)));
FILE_SCRIPT.forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), contesto, { filename: path.basename(f) }));

/** Accende o spegne il servizio avanzato Drive API (vedi DriveAvanzato). */
function driveAvanzato(acceso) {
  if (acceso) contesto.Drive = DriveAvanzato;
  else delete contesto.Drive;
}

// ------------------------------------------------------------------ dati di esempio

function semina() {
  contesto.preparaFoglio();
  const scrivi = (azione, dati) => {
    const r = JSON.parse(contesto.doPost({ postData: { contents: JSON.stringify(Object.assign({ codice: 'prova', azione }, dati)) } }).testo);
    if (!r.ok) throw new Error(azione + ': ' + r.errore);
    return r;
  };
  scrivi('salvaImpostazioni', { valori: { INDIRIZZO: 'Via dell\'Esempio 1, 36016 Thiene (VI)', PARTITA_IVA: '00000000000', EMAIL: 'studio@example.com', COSTO_ORARIO: 15 } });
  // Elettrodinamica la crea preparaFoglio(), a tariffa fissa: qui le si da' l'email dei riepiloghi.
  const elettro = scrivi('anagrafiche', {}).clienti.find(c => c.nome === 'Elettrodinamica');
  scrivi('aggiornaCliente', { id: elettro.id, campi: { email: 'rapportini@elettrodinamica.example', costoFisso: 22 } });
  const rossi = scrivi('creaCliente', { nome: 'Rossi Impianti Srl', email: 'rossi@example.com' }).cliente;
  const p1 = scrivi('creaCommessa', { idCliente: elettro.id, descrizione: 'Nuovo magazzino automatico Batokyo', indirizzo: 'Zona industriale, Schio', budgetOre: 40, budgetEuro: 1200, inizio: '2026-09-01', finePrevista: '2026-12-20' }).commessa;
  const p2 = scrivi('creaCommessa', { idCliente: rossi.id, descrizione: 'Quadro elettrico capannone', budgetEuro: 2500, prezzoOrario: 42, costoOrario: 25, euroKm: 0.9 }).commessa;
  const rap = (dati) => scrivi('salvaRapportino', { rapportino: Object.assign({ idLocale: 'seme-' + (++contatore), tecnico: 'Manuel Gasparotto' }, dati) }).rapportino;
  rap({ data: '2026-09-15', idCliente: elettro.id, idCommessa: p1.id, descrizione: 'Sopralluogo e rilievo quadri esistenti', oreLavoro: 6, oreViaggio: 1.5, km: 96 });
  rap({ data: '2026-10-02', idCliente: elettro.id, idCommessa: p1.id, descrizione: 'Cablaggio quadro di linea 1', oreLavoro: 8, oreExtra: 1, km: 96, spese: 14.5, noteSpese: 'Pranzo' });
  rap({ data: '2026-10-08', idCliente: elettro.id, idCommessa: p1.id, descrizione: 'Collaudo sensori e messa in servizio nastro', oreLavoro: 7.5, oreViaggio: 1.5, km: 96 });
  rap({ data: '2026-10-10', idCliente: rossi.id, idCommessa: p2.id, descrizione: 'Sostituzione interruttore generale', oreLavoro: 3.5, km: 22, tariffa: 42 });
  scrivi('stato', { ids: ['RAP/2026/0001'], stato: 'FATTURATO' });
  scrivi('stato', { ids: ['RAP/2026/0002'], stato: 'INVIATO' });
  console.log('Seminati 2 clienti, 2 commesse, 4 rapportini.');
}

if (!PORTALE) semina();

// ------------------------------------------------------------------ le esecuzioni in parallelo

/**
 * Su Google ogni richiesta all'app web e' un'esecuzione a se', e ne girano fino
 * a 30 insieme per utente: la porta Google ci conta (un'esecuzione aspetta la
 * risposta mentre un'altra, quella del server sul NAS, viene a prendere il
 * lavoro). Qui ogni richiesta HTTP gira in un filo suo (finto-esecuzione.js),
 * che usa fogli, Drive, proprieta' e cache di questo filo con chiamate che
 * aspettano la risposta. Questo filo non deve mai fermarsi ad aspettare un'esecuzione.
 */
const { Worker, MessageChannel } = require('node:worker_threads');
const ESECUZIONI_MASSIME = 30;
const esecuzioni = new Set();
let numeroEsecuzione = 0;

function eData(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

/** I nomi dei metodi di un oggetto (anche quelli della sua classe), per la controfigura. */
function metodiDi(o) {
  const nomi = new Set();
  for (let p = o; p && p !== Object.prototype && p !== Function.prototype; p = Object.getPrototypeOf(p)) {
    for (const k of Object.getOwnPropertyNames(p)) {
      if (k === 'constructor') continue;
      try { if (typeof o[k] === 'function') nomi.add(k); } catch (e) { /* un getter che si arrabbia */ }
    }
  }
  return Array.from(nomi);
}

/** Le maniglie di un'esecuzione: ogni oggetto con dei metodi resta qui, all'esecuzione va un numero. */
function nuoveManiglie() {
  const oggetti = [];
  const numeri = new Map();
  function verso(v) {
    if (v === null || (typeof v !== 'object' && typeof v !== 'function')) return v;
    if (eData(v)) return new Date(v.getTime());
    if (Buffer.isBuffer(v) || ArrayBuffer.isView(v)) return v;
    if (Array.isArray(v)) return v.map(verso);
    const proto = Object.getPrototypeOf(v);
    const semplice = typeof v === 'object' && (proto === Object.prototype || proto === null) && Object.keys(v).every(k => typeof v[k] !== 'function');
    if (semplice) {
      const o = {};
      for (const k of Object.keys(v)) o[k] = verso(v[k]);
      return o;
    }
    if (!numeri.has(v)) { numeri.set(v, oggetti.length); oggetti.push(v); }
    return { __maniglia: numeri.get(v), metodi: metodiDi(v) };
  }
  function da(v) {
    if (v === null || typeof v !== 'object') return v;
    if (v.__maniglia !== undefined) return oggetti[v.__maniglia];
    if (eData(v) || ArrayBuffer.isView(v)) return v;
    if (Array.isArray(v)) return v.map(da);
    const o = {};
    for (const k of Object.keys(v)) o[k] = da(v[k]);
    return o;
  }
  return { verso, da, oggetti };
}

/**
 * Esegue doGet o doPost in un filo nuovo. Torna {testo} o {errore} (lo script si
 * e' fermato), come Google: un errore diventa una pagina HTML.
 */
function eseguiInParallelo(tipo, evento) {
  if (esecuzioni.size >= ESECUZIONI_MASSIME) {
    return Promise.resolve({ troppe: true, errore: 'Service invoked too many times in a short time: ' + ESECUZIONI_MASSIME + ' simultaneous executions' });
  }
  const id = ++numeroEsecuzione;
  const m = nuoveManiglie();
  const radici = {};
  for (const nome of ['SpreadsheetApp', 'DriveApp', 'PropertiesService', 'CacheService', 'Utilities', 'MailApp', 'UrlFetchApp', 'ScriptApp', 'Session']) {
    radici[nome] = m.verso(contesto[nome]);
  }
  if (contesto.Drive) radici.Drive = m.verso(contesto.Drive);
  const { port1, port2 } = new MessageChannel();
  const segnale = new SharedArrayBuffer(4);
  const vista = new Int32Array(segnale);
  const esecuzione = { id };
  return new Promise(risolvi => {
    let finito = false;
    const fine = r => {
      if (finito) return;
      finito = true;
      esecuzioni.delete(esecuzione);
      if (lucchetto.chi === id) lucchetto.chi = null;
      port1.close();
      esecuzione.lavoratore.terminate().catch(() => null);
      risolvi(r);
    };
    esecuzione.fine = fine;
    const rispondi = r => {
      port1.postMessage(r);
      Atomics.store(vista, 0, 1);
      Atomics.notify(vista, 0);
    };
    port1.on('message', msg => {
      if (msg.tipo === 'fine') return fine(msg.errore !== undefined ? { errore: msg.errore } : { testo: msg.testo });
      try {
        if (msg.tipo === 'lucchetto') {
          if (msg.cosa === 'prendi') {
            const libero = lucchetto.chi === null || lucchetto.chi === id || Date.now() > lucchetto.scade;
            if (libero) { lucchetto.chi = id; lucchetto.scade = Date.now() + 6 * 60 * 1000; }
            return rispondi({ valore: libero });
          }
          if (lucchetto.chi === id) lucchetto.chi = null;
          return rispondi({ valore: true });
        }
        const o = m.oggetti[msg.maniglia];
        if (msg.tipo === 'leggi') return rispondi({ valore: m.verso(o[msg.proprieta]) });
        if (msg.tipo === 'scrivi') { o[msg.proprieta] = m.da(msg.valore); return rispondi({ valore: true }); }
        const f = o[msg.metodo];
        if (typeof f !== 'function') throw new Error(msg.metodo + ' non e\' una funzione');
        return rispondi({ valore: m.verso(f.apply(o, m.da(msg.argomenti))) });
      } catch (e) {
        return rispondi({ errore: e && e.message ? e.message : String(e) });
      }
    });
    esecuzione.lavoratore = new Worker(path.join(__dirname, 'finto-esecuzione.js'), {
      workerData: { porta: port2, segnale, radici, file: FILE_SCRIPT, tipo, evento, ritardo: Number(process.env.WISPER_FINTO_RITARDO_MS || 0) },
      transferList: [port2],
    });
    esecuzioni.add(esecuzione);
    esecuzione.lavoratore.on('error', e => fine({ errore: e && e.message ? e.message : String(e) }));
    esecuzione.lavoratore.on('exit', () => setTimeout(() => fine({ errore: 'esecuzione finita senza risposta' }), 50));
  });
}

/**
 * Il finto Google in HTTP, come l'app web pubblicata: GET e POST su /exec (e su
 * qualunque altro percorso), ogni richiesta in un'esecuzione sua. Torna il server
 * (in ascolto: aspettare 'listening'; opzioni.host: di base tutte le interfacce, come prima).
 */
function ascoltaHttp(porta, opzioni) {
  opzioni = opzioni || {};
  const parla = opzioni.parla !== undefined ? opzioni.parla : require.main === module;
  const server = http.createServer((richiesta, risposta) => {
    const url = new URL(richiesta.url, 'http://localhost');
    // Solo qui, per guardare le schede durante le prove: GET /scheda/Accessi
    if (url.pathname.startsWith('/scheda/')) {
      const f = fogli.get(decodeURIComponent(url.pathname.slice('/scheda/'.length)));
      risposta.writeHead(f ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
      risposta.end(JSON.stringify(f ? f.celle : null));
      return;
    }
    const pezzi = [];
    richiesta.on('data', p => pezzi.push(p));
    richiesta.on('end', () => {
      const corpo = Buffer.concat(pezzi).toString('utf8');
      const evento = richiesta.method === 'GET'
        ? { parameter: Object.fromEntries(url.searchParams) }
        : { postData: { contents: corpo, length: Buffer.byteLength(corpo), type: richiesta.headers['content-type'] || '', name: 'postData' } };
      eseguiInParallelo(richiesta.method === 'GET' ? 'doGet' : 'doPost', evento).then(out => {
        let testo = out.testo;
        // Come Google: uno script che si ferma con un errore risponde con una pagina HTML,
        // che le app trattano come rete (riprovano). Il ponte conta su questo.
        if (out.errore !== undefined) testo = '<!DOCTYPE html><html><body>Errore dello script: ' + out.errore + '</body></html>';
        if (parla) {
          const azione = url.searchParams.get('azione') || (() => {
            try { const d = JSON.parse(corpo); return d.azione || (d.porta ? 'porta ' + (d.strada || 'exec') : ''); } catch (e) { return ''; }
          })();
          console.log(richiesta.method, azione || '(anagrafiche)', testo.length + ' byte');
        }
        if (risposta.destroyed) return;
        const intestazioni = { 'Content-Type': out.errore !== undefined ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8' };
        // Lo script del portale, GET (fase 8): il calendario come text/calendar, la riga di testo come text/plain.
        if (PORTALE && richiesta.method === 'GET' && out.errore === undefined) {
          intestazioni['Content-Type'] = /^BEGIN:VCALENDAR/.test(testo || '') ? 'text/calendar; charset=utf-8' : 'text/plain; charset=utf-8';
        }
        // Lo script del portale: Google risponde dal rimbalzo con Access-Control-Allow-Origin: * (la pagina sta su Netlify).
        if (PORTALE) intestazioni['Access-Control-Allow-Origin'] = '*';
        risposta.writeHead(out.troppe ? 429 : 200, intestazioni);
        risposta.end(testo);
      });
    });
  });
  server.listen(porta, opzioni.host);
  return server;
}

/** Chiude il finto Google in HTTP e ferma le esecuzioni ancora in corso. */
function chiudiHttp(server) {
  return new Promise(r => {
    Array.from(esecuzioni).forEach(e => e.fine({ errore: 'finto Google chiuso' }));
    server.close(() => r());
    if (server.closeAllConnections) server.closeAllConnections();
  });
}

// Le prove (registro.test.js) lo usano senza server: lo script, le schede, la posta.
module.exports = {
  contesto, fogli, proprieta, memoria, CARTELLA_POSTA, modulo, attivatori, elementi,
  driveAvanzato, ascoltaHttp, chiudiHttp, esecuzioni,
};
if (require.main !== module) return;

// ------------------------------------------------------------------ il server

ascoltaHttp(PORTA).on('listening', () => console.log(PORTALE
  ? 'Finto Google, script del portale, su http://localhost:' + PORTA + '/exec (segreto del NAS: ' + proprieta.get('SEGRETO_SERVER') + ')'
  : 'Finto Google su http://localhost:' + PORTA + '/exec (codice: prova)'));

