/*
 * Leggere il testo dentro i file (fase 8, fase8.md §6.1), senza librerie: quello che serve sta gia' in Node
 * (node:zlib per i PDF e gli zip di Office, TextDecoder per Windows-1252).
 *
 *  - PDF con testo: i flussi FlateDecode, gli operatori di testo Tj, TJ, ' e " fra BT ed ET, le stringhe fra parentesi
 *    ed esadecimali, le tabelle ToUnicode semplici (bfchar, bfrange). Se il testo esce illeggibile (meno del 70% di
 *    lettere, cifre e spazi, o meno di 20 parole): "non si legge"; nessun testo: "senza testo" (una scansione);
 *  - DOCX e DOTX (word/document.xml, intestazioni e pie'), XLSX (sharedStrings, stringhe in linea, nomi dei fogli),
 *    PPTX (ppt/slides/slide*.xml), ODT, ODS, ODP (content.xml), col lettore zip di src/zip.js;
 *  - TXT, CSV, XML: UTF-8, se no Windows-1252;
 *  - DXF: i valori dei codici 1 e 3 (TEXT e MTEXT), tolti i comandi di formato come \P;
 *  - DOC e XLS vecchi, DWG, immagini, scansioni, ZIP: "senza testo" (servirebbe l'OCR: non previsto).
 * Si tengono al massimo 200.000 caratteri (oltre: "in parte").
 *
 * Gira in un worker_threads (azioni/ricerca.js): un file alla volta, 20 secondi al massimo, cosi' un PDF strano non
 * ferma il server. Come worker legge workerData {percorso, nome, mime} e manda {stato, testo, pagine, motivo}.
 */
'use strict';

const fs = require('node:fs');
const zlib = require('node:zlib');
const { leggiZip } = require('./zip');

const MASSIMO_CARATTERI = 200000;
const ZIP_MASSIMO = 64 * 1024 * 1024;

const win1252 = new TextDecoder('windows-1252');

/** Testo da byte: UTF-8 se lo e' davvero, altrimenti Windows-1252 (i file di Excel italiano). */
function testoDaByte(b) {
  let s = b;
  if (s.length >= 3 && s[0] === 0xEF && s[1] === 0xBB && s[2] === 0xBF) s = s.subarray(3);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(s);
  } catch (e) {
    return win1252.decode(s);
  }
}

function decodificaXml(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&');
}

/** Il testo dei tag scelti, con un a capo dove finisce un paragrafo. */
function testoXml(xml, tag, paragrafo) {
  const re = new RegExp('<(' + tag + ')(?:\\s[^>]*)?>([\\s\\S]*?)</\\1>|<\\/(' + paragrafo + ')>|<(?:w:tab|text:tab|w:br|text:line-break)\\b[^>]*\\/?>', 'g');
  let s = '';
  let m;
  while ((m = re.exec(xml))) {
    if (m[2] !== undefined) s += decodificaXml(m[2].replace(/<[^>]+>/g, ''));
    else if (m[3]) s += '\n';
    else s += ' ';
  }
  return s;
}

// ------------------------------------------------------------------ PDF

/** Le stringhe di un PDF: (letterale) con le sue barre, <esadecimale>. Torna i byte. */
function byteLetterale(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 0x5C) { out.push(c & 0xFF); continue; }
    const n = s.charAt(++i);
    if (n === 'n') out.push(10);
    else if (n === 'r') out.push(13);
    else if (n === 't') out.push(9);
    else if (n === 'b') out.push(8);
    else if (n === 'f') out.push(12);
    else if (/[0-7]/.test(n)) {
      let o = n;
      while (o.length < 3 && /[0-7]/.test(s.charAt(i + 1))) o += s.charAt(++i);
      out.push(parseInt(o, 8) & 0xFF);
    } else if (n === '\r') { if (s.charAt(i + 1) === '\n') i++; } else if (n === '\n') { /* a capo continuato */ } else out.push(n.charCodeAt(0) & 0xFF);
  }
  return Buffer.from(out);
}

function byteEsadecimale(s) {
  let h = s.replace(/[^0-9A-Fa-f]/g, '');
  if (h.length % 2) h += '0';
  return Buffer.from(h, 'hex');
}

/** Una tabella ToUnicode: {lunghezza (byte di un codice), mappa: Map(codice -> testo)}. */
function leggiCmap(testo) {
  const mappa = new Map();
  let lunghezza = 1;
  const unicode = h => {
    const b = byteEsadecimale(h);
    let s = '';
    for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b.readUInt16BE(i));
    return s;
  };
  const cs = testo.match(/begincodespacerange\s*<([0-9A-Fa-f]+)>/);
  if (cs) lunghezza = Math.max(1, Math.ceil(cs[1].length / 2));
  for (const blocco of testo.match(/beginbfchar([\s\S]*?)endbfchar/g) || []) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m;
    while ((m = re.exec(blocco))) {
      lunghezza = Math.max(lunghezza, Math.ceil(m[1].length / 2));
      mappa.set(parseInt(m[1], 16), unicode(m[2]));
    }
  }
  for (const blocco of testo.match(/beginbfrange([\s\S]*?)endbfrange/g) || []) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g;
    let m;
    while ((m = re.exec(blocco))) {
      lunghezza = Math.max(lunghezza, Math.ceil(m[1].length / 2));
      const da = parseInt(m[1], 16);
      const a = parseInt(m[2], 16);
      if (a - da > 65535) continue;
      if (m[4]) {
        const base = unicode(m[4]);
        const ultimo = base.charCodeAt(base.length - 1);
        for (let c = da; c <= a; c++) mappa.set(c, base.slice(0, -1) + String.fromCharCode(ultimo + c - da));
      } else {
        const lista = (m[5].match(/<([0-9A-Fa-f]+)>/g) || []).map(x => unicode(x.slice(1, -1)));
        for (let c = da; c <= a && c - da < lista.length; c++) mappa.set(c, lista[c - da]);
      }
    }
  }
  return { lunghezza, mappa };
}

function decodificaStringa(b, cmap) {
  if (!cmap) return win1252.decode(b);
  let s = '';
  for (let i = 0; i + cmap.lunghezza <= b.length; i += cmap.lunghezza) {
    const c = cmap.lunghezza === 2 ? b.readUInt16BE(i) : b[i];
    const t = cmap.mappa.get(c);
    s += t !== undefined ? t : (cmap.lunghezza === 1 ? win1252.decode(b.subarray(i, i + 1)) : '');
  }
  return s;
}

/** Il testo di un flusso di contenuto: gli operatori di testo, coi font e le loro tabelle. */
function testoDelContenuto(c, cmapDi) {
  let s = '';
  let font = null;
  const pila = [];
  const re = /\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()])*\))*\)|<[0-9A-Fa-f\s]*>|\[|\]|\/[^\s/<>[\]()]+|-?\d*\.?\d+|[A-Za-z'"*]+/g;
  let m;
  const mostra = b => { s += decodificaStringa(b, font ? cmapDi(font) : null); };
  while ((m = re.exec(c))) {
    const t = m[0];
    if (t === '[') { pila.push('['); continue; }
    if (t === ']') {
      const arr = [];
      while (pila.length && pila[pila.length - 1] !== '[') arr.unshift(pila.pop());
      pila.pop();
      pila.push({ arr });
      continue;
    }
    if (t[0] === '(') { pila.push({ b: byteLetterale(t.slice(1, -1)) }); continue; }
    if (t[0] === '<') { pila.push({ b: byteEsadecimale(t.slice(1, -1)) }); continue; }
    if (t[0] === '/' || /^-?\d*\.?\d+$/.test(t)) { pila.push(t); continue; }
    // Un operatore.
    if (t === 'Tf') font = String(pila[pila.length - 2] || '').replace(/^\//, '');
    else if (t === 'Tj') { const x = pila[pila.length - 1]; if (x && x.b) mostra(x.b); } else if (t === '\'' || t === '"') { s += '\n'; const x = pila[pila.length - 1]; if (x && x.b) mostra(x.b); } else if (t === 'TJ') {
      const x = pila[pila.length - 1];
      for (const p of (x && x.arr) || []) {
        if (p && p.b) mostra(p.b);
        else if (typeof p === 'string' && Number(p) < -200) s += ' ';
      }
    } else if (t === 'T*' || t === 'ET') s += '\n';
    else if (t === 'Td' || t === 'TD') { const y = Number(pila[pila.length - 1]); s += y ? '\n' : ' '; } else if (t === 'Tm') s += '\n';
    pila.length = 0;
  }
  return s;
}

function leggiPdf(buf) {
  const testo = buf.toString('latin1');
  // Gli oggetti: numero -> {dizionario, flusso (decompresso se si sa)}.
  const oggetti = new Map();
  const re = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g;
  let m;
  while ((m = re.exec(testo))) {
    const corpo = m[2];
    const i = corpo.search(/\bstream\r?\n/);
    const diz = i >= 0 ? corpo.slice(0, i) : corpo;
    let flusso = null;
    if (i >= 0) {
      const inizio = corpo.indexOf('\n', i) + 1;
      const fine = corpo.lastIndexOf('endstream');
      let grezzo = Buffer.from(corpo.slice(inizio, fine >= 0 ? fine : corpo.length), 'latin1');
      if (grezzo.length && grezzo[grezzo.length - 1] === 0x0A) grezzo = grezzo.subarray(0, grezzo.length - (grezzo[grezzo.length - 2] === 0x0D ? 2 : 1));
      if (/\/FlateDecode/.test(diz)) {
        try { flusso = zlib.inflateSync(grezzo); } catch (e) { try { flusso = zlib.inflateSync(grezzo, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch (e2) { flusso = null; } }
      } else if (!/\/Filter/.test(diz)) flusso = grezzo;
    }
    oggetti.set(Number(m[1]), { diz, flusso: flusso ? flusso.toString('latin1') : null, immagine: /\/Subtype\s*\/Image/.test(diz) });
  }
  // I font e le loro tabelle ToUnicode, e i nomi dei font nelle risorse delle pagine (/F1 5 0 R).
  const cmapDiOggetto = new Map();
  for (const [n, o] of oggetti) {
    const tu = o.diz.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (/\/Type\s*\/Font/.test(o.diz) && tu) {
      const c = oggetti.get(Number(tu[1]));
      if (c && c.flusso) cmapDiOggetto.set(n, leggiCmap(c.flusso));
    }
  }
  const nomi = new Map();
  for (const o of oggetti.values()) {
    const f = o.diz.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (!f) continue;
    const r = /\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g;
    let x;
    while ((x = r.exec(f[1]))) nomi.set(x[1], Number(x[2]));
  }
  const cmapDi = nome => (nomi.has(nome) ? cmapDiOggetto.get(nomi.get(nome)) || null : null);
  let s = '';
  for (const o of oggetti.values()) {
    if (!o.flusso || o.immagine || /begincmap/.test(o.flusso)) continue;
    if (!/\bBT\b/.test(o.flusso)) continue;
    s += testoDelContenuto(o.flusso, cmapDi) + '\n';
  }
  const pagine = (testo.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length || null;
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!s) return { stato: 'senza_testo', testo: '', pagine, motivo: 'è una scansione o un disegno' };
  const buoni = (s.match(/[\p{L}\p{N}\s]/gu) || []).length;
  const parole = (s.match(/[\p{L}\p{N}]{2,}/gu) || []).length;
  if (buoni / s.length < 0.7 || parole < 20) return { stato: 'non_si_legge', testo: '', pagine, motivo: 'il testo del PDF non si legge' };
  return { stato: 'letto', testo: s, pagine };
}

// ------------------------------------------------------------------ Office e LibreOffice

function leggiOffice(buf, estensione) {
  const zip = leggiZip(buf);
  const voce = n => { const b = zip.leggi(n, { massimo: ZIP_MASSIMO }); return b ? b.toString('utf8') : ''; };
  const nomi = zip.nomi;
  let s = '';
  let pagine = null;
  if (nomi.includes('word/document.xml')) {
    const parti = ['word/document.xml'].concat(nomi.filter(n => /^word\/(header|footer)\d*\.xml$/.test(n)).sort());
    for (const p of parti) s += testoXml(voce(p), 'w:t', 'w:p') + '\n';
    const app = voce('docProps/app.xml').match(/<Pages>(\d+)<\/Pages>/);
    if (app) pagine = Number(app[1]);
  } else if (nomi.includes('xl/workbook.xml')) {
    const fogli = (voce('xl/workbook.xml').match(/<sheet\b[^>]*\bname="([^"]*)"/g) || []).map(x => decodificaXml(x.match(/name="([^"]*)"/)[1]));
    s += fogli.join('\n') + '\n';
    if (nomi.includes('xl/sharedStrings.xml')) s += testoXml(voce('xl/sharedStrings.xml'), 't', 'si') + '\n';
    for (const n of nomi.filter(x => /^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort()) {
      const x = voce(n);
      const re = /<is>([\s\S]*?)<\/is>/g;
      let m;
      while ((m = re.exec(x))) s += testoXml(m[1], 't', 'is') + '\n';
    }
    pagine = fogli.length || null;
  } else if (nomi.some(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    const lucidi = nomi.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
    for (const n of lucidi) s += testoXml(voce(n), 'a:t', 'a:p') + '\n';
    pagine = lucidi.length;
  } else if (nomi.includes('content.xml') && /^(odt|ods|odp|ott)$/.test(estensione || '') || nomi.includes('content.xml') && nomi.includes('mimetype')) {
    s += testoXml(voce('content.xml').replace(/<text:tab\/>/g, ' '), 'text:span|text:p|text:h', 'text:p|text:h') + '\n';
  } else {
    return { stato: 'senza_testo', testo: '', pagine: null, motivo: 'un archivio zip' };
  }
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s ? { stato: 'letto', testo: s, pagine } : { stato: 'senza_testo', testo: '', pagine, motivo: 'il file è vuoto' };
}

// ------------------------------------------------------------------ DXF

/** I testi di un DXF: i valori dei codici 1 e 3, senza i comandi di formato di MTEXT (\P, \f...;, {}). */
function leggiDxf(buf) {
  const righe = testoDaByte(buf).split(/\r?\n/);
  const pezzi = [];
  for (let i = 0; i + 1 < righe.length; i += 2) {
    const codice = righe[i].trim();
    if (codice !== '1' && codice !== '3') continue;
    const v = righe[i + 1]
      .replace(/\\P/g, '\n').replace(/\\~/g, ' ')
      .replace(/\\[fFcCHhWwTtQqAap][^;\\]*;/g, '').replace(/\\[LlOoKk]/g, '').replace(/\\S([^;]*);/g, (m, x) => x.replace(/[#^/]/g, '/'))
      .replace(/\\U\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '')
      .replace(/[{}]/g, '').replace(/\\\\/g, '\\');
    if (v.trim()) pezzi.push(v.trim());
  }
  const s = pezzi.join('\n').trim();
  return s ? { stato: 'letto', testo: s, pagine: null } : { stato: 'senza_testo', testo: '', pagine: null, motivo: 'un disegno senza testi' };
}

// ------------------------------------------------------------------ chi e' il file

function estensioneDi(nome) {
  const m = String(nome || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return m ? m[1] : '';
}

/**
 * Il testo di un file: {stato, testo, pagine, motivo}. stato: letto | in_parte | senza_testo | non_si_legge.
 * Si guarda prima ai byte (un PDF comincia con %PDF, gli zip con PK, i vecchi Office con D0 CF 11 E0), poi al nome.
 */
function leggiTesto(buf, nome, mime) {
  const est = estensioneDi(nome);
  let r;
  try {
    const testa = buf.subarray(0, 8);
    if (testa.toString('latin1', 0, 5) === '%PDF-') r = leggiPdf(buf);
    else if (testa[0] === 0x50 && testa[1] === 0x4B && testa[2] === 0x03 && testa[3] === 0x04) r = leggiOffice(buf, est);
    else if (testa.readUInt32BE(0) === 0xD0CF11E0) r = { stato: 'senza_testo', testo: '', pagine: null, motivo: 'un file di Office vecchio (DOC, XLS)' };
    else if (testa.toString('latin1', 0, 4) === 'AC10') r = { stato: 'senza_testo', testo: '', pagine: null, motivo: 'un disegno DWG' };
    else if ((testa[0] === 0xFF && testa[1] === 0xD8) || testa.toString('latin1', 1, 4) === 'PNG' || testa.toString('latin1', 0, 4) === 'RIFF' || /^image\//.test(mime || '')) {
      r = { stato: 'senza_testo', testo: '', pagine: null, motivo: 'un\'immagine' };
    } else if (est === 'dxf') r = leggiDxf(buf);
    else if (['txt', 'csv', 'xml', 'md', 'log', 'tsv'].indexOf(est) >= 0 || /^text\//.test(mime || '') || /xml/.test(mime || '')) {
      const t = testoDaByte(buf).trim();
      r = t ? { stato: 'letto', testo: t, pagine: null } : { stato: 'senza_testo', testo: '', pagine: null, motivo: 'il file è vuoto' };
    } else r = { stato: 'senza_testo', testo: '', pagine: null, motivo: 'un tipo di file che non si legge' };
  } catch (err) {
    r = { stato: 'non_si_legge', testo: '', pagine: null, motivo: 'il file non si apre (' + (err && err.message ? err.message : err) + ')' };
  }
  if (r.testo && r.testo.length > MASSIMO_CARATTERI) r = Object.assign({}, r, { stato: 'in_parte', testo: r.testo.slice(0, MASSIMO_CARATTERI), motivo: 'è molto lungo' });
  return r;
}

module.exports = { leggiTesto, leggiPdf, leggiOffice, leggiDxf, testoDaByte, MASSIMO_CARATTERI };

// Come worker: legge il file e manda il risultato al filo principale.
const { isMainThread, parentPort, workerData } = require('node:worker_threads');
if (!isMainThread && workerData && workerData.lettura) {
  let r;
  try {
    r = leggiTesto(fs.readFileSync(workerData.percorso), workerData.nome, workerData.mime);
  } catch (err) {
    r = { stato: 'non_si_legge', testo: '', pagine: null, motivo: 'il file non si apre (' + (err && err.message ? err.message : err) + ')' };
  }
  parentPort.postMessage(r);
}
