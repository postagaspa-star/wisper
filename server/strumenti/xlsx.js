/*
 * Leggere (e, per le prove, scrivere) un file .xlsx senza librerie.
 *
 * Un .xlsx e' uno zip di file XML: si legge l'indice dello zip in fondo al
 * file, si scompattano le voci con node:zlib (inflateRaw), e dagli XML si
 * prendono i nomi delle schede, i testi condivisi (sharedStrings), gli stili
 * (per sapere quali numeri sono date) e le celle.
 *
 * Le date in Excel sono numeri: i giorni dal 30/12/1899, con l'ora nella parte
 * decimale. Si leggono come "ora del muro" del foglio (Europe/Rome), cioe' come
 * le vedeva chi le ha scritte, e diventano Date come quelle che dava lo script.
 *
 * Basta per l'esportazione di Google Fogli (File > Scarica > Microsoft Excel):
 * niente zip64, niente cifratura.
 */
'use strict';

// ------------------------------------------------------------------ zip

// Lo zip (leggere e scrivere) sta in src/zip.js dalla fase 8: lo usano anche la ricerca dentro i file ed Esporta tutto.
const { leggiZip, scriviZip } = require('../src/zip');

// ------------------------------------------------------------------ XML

function decodifica(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&')
    // Excel scrive certi caratteri come _x000D_ (un a capo di Windows).
    .replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

function codifica(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // I caratteri di controllo non stanno in un XML: si scrivono come Excel, _x0001_.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, c => '_x' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + '_');
}

function attributi(testoTag) {
  const o = {};
  const re = /([\w:]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(testoTag))) o[m[1]] = decodifica(m[2]);
  return o;
}

/** Il testo dentro <t>...</t>, anche spezzato in pezzi con formati diversi (<r><t>), senza la pronuncia (<rPh>). */
function testoDi(xml) {
  const pulito = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let s = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = re.exec(pulito))) s += m[1] === undefined ? '' : decodifica(m[1]);
  return s;
}

// ------------------------------------------------------------------ date

const GIORNO = 86400000;
const ZERO_EXCEL = Date.UTC(1899, 11, 30);

/** Un numero di Excel (giorni dal 30/12/1899) -> Date con quell'ora sul muro, in ora italiana. */
function dataDaSeriale(n) {
  const secondi = Math.round(n * 86400);
  const u = new Date(ZERO_EXCEL + secondi * 1000);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
}

function serialeDaData(d) {
  const u = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return (u - ZERO_EXCEL) / GIORNO;
}

/** I formati numerici di Excel che sono date (quelli incorporati e quelli scritti con d, m, y, h, s). */
const FORMATI_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function formatoEData(id, codice) {
  if (FORMATI_DATA.has(id)) return true;
  if (!codice) return false;
  const s = codice.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(s) && !/^(General|@)$/i.test(s);
}

// ------------------------------------------------------------------ xlsx

function colonna(rif) {
  const lettere = String(rif).match(/^[A-Z]+/)[0];
  let n = 0;
  for (const c of lettere) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function lettereColonna(n) {
  let s = '';
  n++;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Le schede del file: [{nome, righe}], righe[i][j] = valore della cella (riga
 * i+1, colonna j+1): testo, numero, vero/falso, Date o '' se vuota.
 */
function leggiXlsx(buf) {
  const zip = leggiZip(buf);
  const testoVoce = nome => {
    const b = zip.leggi(nome);
    return b ? b.toString('utf8') : null;
  };
  const libro = testoVoce('xl/workbook.xml');
  if (!libro) throw new Error('Nel file manca xl/workbook.xml: non è un\'esportazione di Fogli in formato Excel');
  const legami = {};
  for (const m of (testoVoce('xl/_rels/workbook.xml.rels') || '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = attributi(m[1]);
    let t = a.Target || '';
    t = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    legami[a.Id] = t;
  }
  const condivisi = [];
  const ss = testoVoce('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) condivisi.push(m[1] === undefined ? '' : testoDi(m[1]));

  const formati = {};
  const date = [];
  const stili = testoVoce('xl/styles.xml') || '';
  for (const m of stili.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const a = attributi(m[1]);
    formati[Number(a.numFmtId)] = a.formatCode;
  }
  const xfs = (stili.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '';
  for (const m of xfs.matchAll(/<xf\b([^>]*?)(\/>|>)/g)) {
    const id = Number(attributi(m[1]).numFmtId || 0);
    date.push(formatoEData(id, formati[id]));
  }

  const schede = [];
  for (const m of libro.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = attributi(m[1]);
    const percorso = legami[a['r:id']] || legami[a.id];
    const xml = percorso ? testoVoce(percorso) : null;
    schede.push({ nome: a.name, righe: xml ? leggiScheda(xml, condivisi, date) : [] });
  }
  return schede;
}

function leggiScheda(xml, condivisi, date) {
  const righe = [];
  const dati = (xml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/) || [])[1] || '';
  let numeroRiga = 0;
  for (const r of dati.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const ar = attributi(r[1]);
    numeroRiga = ar.r ? Number(ar.r) : numeroRiga + 1;
    const riga = [];
    let col = -1;
    for (const c of (r[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attributi(c[1]);
      col = a.r ? colonna(a.r) : col + 1;
      const dentro = c[2] || '';
      const v = (dentro.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let valore = '';
      if (a.t === 's') valore = v === undefined ? '' : condivisi[Number(v)];
      else if (a.t === 'inlineStr') valore = testoDi((dentro.match(/<is>([\s\S]*?)<\/is>/) || [])[1] || '');
      else if (a.t === 'str' || a.t === 'e') valore = v === undefined ? '' : decodifica(v);
      else if (a.t === 'b') valore = v === '1';
      else if (a.t === 'd') valore = v === undefined ? '' : new Date(decodifica(v));
      else if (v !== undefined && v !== '') {
        const n = Number(v);
        valore = a.s !== undefined && date[Number(a.s)] ? dataDaSeriale(n) : n;
      }
      while (riga.length < col) riga.push('');
      riga[col] = valore === undefined ? '' : valore;
    }
    righe[numeroRiga - 1] = riga;
  }
  for (let i = 0; i < righe.length; i++) if (!righe[i]) righe[i] = [];
  return righe;
}

/**
 * Un .xlsx dalle schede date: [{nome, righe}]. Testi come testi condivisi,
 * numeri come numeri, vero/falso, e le Date come numeri con lo stile di data
 * (solo giorno se a mezzanotte, altrimenti giorno e ora): come Google Fogli.
 */
function scriviXlsx(schede) {
  const condivisi = [];
  const indici = new Map();
  const condiviso = s => {
    if (!indici.has(s)) { indici.set(s, condivisi.length); condivisi.push(s); }
    return indici.get(s);
  };
  const fogli = schede.map(sc => {
    const righe = (sc.righe || []).map((riga, i) => {
      const celle = (riga || []).map((v, j) => {
        const rif = lettereColonna(j) + (i + 1);
        if (v === null || v === undefined || v === '') return '';
        if (Object.prototype.toString.call(v) === '[object Date]') {
          const mezzanotte = v.getHours() === 0 && v.getMinutes() === 0 && v.getSeconds() === 0;
          return '<c r="' + rif + '" s="' + (mezzanotte ? 1 : 2) + '"><v>' + serialeDaData(v) + '</v></c>';
        }
        if (typeof v === 'number') return '<c r="' + rif + '"><v>' + v + '</v></c>';
        if (typeof v === 'boolean') return '<c r="' + rif + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>';
        return '<c r="' + rif + '" t="s"><v>' + condiviso(String(v)) + '</v></c>';
      }).join('');
      return '<row r="' + (i + 1) + '">' + celle + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + righe + '</sheetData></worksheet>';
  });
  const voci = [
    { nome: '[Content_Types].xml', dati: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      fogli.map((f, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '</Types>' },
    { nome: '_rels/.rels', dati: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nome: 'xl/workbook.xml', dati: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      schede.map((s, i) => '<sheet name="' + codifica(s.nome) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
    { nome: 'xl/_rels/workbook.xml.rels', dati: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      fogli.map((f, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (fogli.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId' + (fogli.length + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
      '</Relationships>' },
    { nome: 'xl/styles.xml', dati: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm:ss"/></numFmts>' +
      '<fonts count="1"><font><sz val="10"/><name val="Arial"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
      '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>' },
  ];
  voci.push({ nome: 'xl/sharedStrings.xml', dati: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' +
    condivisi.length + '" uniqueCount="' + condivisi.length + '">' + condivisi.map(s => '<si><t xml:space="preserve">' + codifica(s) + '</t></si>').join('') + '</sst>' });
  fogli.forEach((f, i) => voci.push({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', dati: f }));
  return scriviZip(voci);
}

module.exports = { leggiXlsx, scriviXlsx, leggiZip, scriviZip, dataDaSeriale, serialeDaData };
