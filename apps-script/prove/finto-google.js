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
'use strict';

process.env.TZ = 'Europe/Rome';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const PORTA = Number(process.argv[2] || 8765);
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
  createFile(blob) { const f = new FileFinto(blob, this); this.figli.push(f); return f; }
}

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

const proprieta = new Map([['CODICE', 'prova']]);
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (proprieta.has(k) ? proprieta.get(k) : null),
    setProperty: (k, v) => { proprieta.set(k, String(v)); },
  }),
};

const LockService = { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) };

const memoria = new Map();
const CacheService = {
  getScriptCache: () => ({
    get: k => { const e = memoria.get(k); return e && e.scade > Date.now() ? e.v : null; },
    put: (k, v, secondi) => { memoria.set(k, { v: String(v), scade: Date.now() + (secondi || 600) * 1000 }); },
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
  newBlob: (bytes, mime, nome) => ({
    nome, mime, bytes: Buffer.from(bytes),
    getBytes() { return Array.from(this.bytes); },
    getContentType() { return this.mime; },
    getName() { return this.nome; },
  }),
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

const contesto = {
  SpreadsheetApp: { getActiveSpreadsheet: () => Cartella },
  DriveApp, PropertiesService, LockService, CacheService, Utilities, MailApp,
  Session: { getEffectiveUser: () => ({ getEmail: () => 'proprietario@example.com' }) },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: testo => ({ testo, setMimeType() { return this; } }),
  },
  Logger: { log: (...x) => console.log('[script]', ...x) },
  console,
};
vm.createContext(contesto);
// WISPER_SCRIPT: un altro Code.gs (per esempio quello di prima, per vedere che le prove lo bocciano).
vm.runInContext(fs.readFileSync(process.env.WISPER_SCRIPT || path.join(__dirname, '..', 'Code.gs'), 'utf8'), contesto, { filename: 'Code.gs' });

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

semina();

// Le prove (registro.test.js) lo usano senza server: lo script, le schede, la posta.
module.exports = { contesto, fogli, proprieta, memoria, CARTELLA_POSTA };
if (require.main !== module) return;

// ------------------------------------------------------------------ il server

http.createServer((richiesta, risposta) => {
  const url = new URL(richiesta.url, 'http://localhost');
  // Solo qui, per guardare le schede durante le prove: GET /scheda/Accessi
  if (url.pathname.startsWith('/scheda/')) {
    const f = fogli.get(decodeURIComponent(url.pathname.slice('/scheda/'.length)));
    risposta.writeHead(f ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    risposta.end(JSON.stringify(f ? f.celle : null));
    return;
  }
  let corpo = '';
  richiesta.on('data', p => { corpo += p; });
  richiesta.on('end', () => {
    let out;
    try {
      if (richiesta.method === 'GET') {
        out = contesto.doGet({ parameter: Object.fromEntries(url.searchParams) });
      } else {
        out = contesto.doPost({ postData: { contents: corpo } });
      }
    } catch (e) {
      out = { testo: JSON.stringify({ ok: false, errore: 'finto google: ' + e.message }) };
    }
    const azione = url.searchParams.get('azione') || (() => { try { return JSON.parse(corpo).azione; } catch (e) { return ''; } })();
    console.log(richiesta.method, azione || '(anagrafiche)', out.testo.length + ' byte');
    risposta.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    risposta.end(out.testo);
  });
}).listen(PORTA, () => console.log('Finto Google su http://localhost:' + PORTA + '/exec (codice: prova)'));
