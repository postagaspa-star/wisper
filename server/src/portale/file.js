/*
 * I file del portale (fase7.md §3.11, §6.7, §7.8, §0.2):
 *  - controllaFile(nome, dati): il controllo dei file che arrivano dai clienti, sui byte decodificati dal base64:
 *    l'estensione (l'ultima del nome: ".pdf.exe" guarda "exe"), i primi byte, per DOCX e XLSX solo l'indice centrale
 *    dello ZIP (senza scompattare: niente macro, niente "bombe"). Nel NAS non c'e' un antivirus: i file del portale si
 *    trattano come sconosciuti;
 *  - chiave / leggiChiave: la chiave che scade di un file mostrato nel portale (10 minuti, solo con la stessa sessione),
 *    firmata col segreto del portale;
 *  - firmaVuota: la firma disegnata non deve essere un riquadro vuoto.
 * Nessun require di azioni/, richieste.js o permessi.js (prove/portale-confini.test.js).
 */
'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const TIPI = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', dwg: 'application/acad', dxf: 'image/vnd.dxf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const MB = 1048576;
const FRASE_TIPO = 'Questo tipo di file non si può caricare: PDF, foto, DWG, DXF, Word o Excel';
const FRASE_FALSO = 'Il file non è quello che dice il nome: non si carica';

/** Il nome del cliente pulito: niente percorsi ne' caratteri di controllo, al massimo 120 caratteri. Resta solo testo. */
function pulisciNome(nome) {
  let n = String(nome || '').split(/[\\/]/).pop();
  n = n.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  if (n.length > 120) {
    const m = n.match(/(\.[A-Za-z0-9]{1,5})$/);
    n = m ? n.slice(0, 120 - m[1].length) + m[1] : n.slice(0, 120);
  }
  return n;
}

const inizia = (b, s, da) => b.length >= (da || 0) + s.length && b.subarray(da || 0, (da || 0) + s.length).equals(Buffer.from(s, 'binary'));

/**
 * L'indice centrale di uno ZIP (DOCX, XLSX), senza scompattare: {voci: [nome], scompattati: byte} o null se non e' uno ZIP
 * leggibile. Oltre 2.000 voci, o grandezze ZIP64, si rifiuta (null con troppo: true).
 */
function indiceZip(b) {
  const minimo = Math.max(0, b.length - 65557);
  let fine = -1;
  for (let i = b.length - 22; i >= minimo; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { fine = i; break; }
  }
  if (fine < 0) return null;
  const quante = b.readUInt16LE(fine + 10);
  const grandezza = b.readUInt32LE(fine + 12);
  const inizio = b.readUInt32LE(fine + 16);
  if (quante === 0xffff || inizio === 0xffffffff || grandezza === 0xffffffff) return { troppo: true };
  if (quante > 2000) return { troppo: true };
  if (inizio + grandezza > b.length) return null;
  const voci = [];
  let scompattati = 0;
  let p = inizio;
  for (let i = 0; i < quante; i++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) return null;
    const dimensione = b.readUInt32LE(p + 24);
    if (dimensione === 0xffffffff) return { troppo: true };
    const lnome = b.readUInt16LE(p + 28);
    const lextra = b.readUInt16LE(p + 30);
    const lcommento = b.readUInt16LE(p + 32);
    voci.push(b.subarray(p + 46, p + 46 + lnome).toString('utf8'));
    scompattati += dimensione;
    p += 46 + lnome + lextra + lcommento;
  }
  return { voci, scompattati };
}

/**
 * Il controllo di §6.7. o: {tipi (PORTALE_TIPI_FILE), maxMb, soloPdf}. Torna {ok: true, nome, estensione, mime} o
 * {ok: false, errore}.
 */
function controllaFile(nome, dati, o) {
  o = o || {};
  const pulito = pulisciNome(nome);
  const m = pulito.match(/\.([A-Za-z0-9]{1,8})$/);
  const est = m ? m[1].toLowerCase() : '';
  const tipi = o.soloPdf ? ['pdf'] : (o.tipi || Object.keys(TIPI));
  if (!est || !TIPI[est] || tipi.indexOf(est) < 0) return { ok: false, errore: o.soloPdf ? 'La copia di cortesia dev\'essere un PDF' : FRASE_TIPO };
  const b = Buffer.isBuffer(dati) ? dati : Buffer.from(dati || []);
  if (!b.length) return { ok: false, errore: 'File vuoto' };
  const max = (o.maxMb || 20) * MB;
  if (b.length > max) return { ok: false, errore: 'Il file è più grande di ' + (o.maxMb || 20) + ' MB: non si carica' };
  let giusto = false;
  if (est === 'pdf') giusto = inizia(b, '%PDF-');
  else if (est === 'jpg' || est === 'jpeg') giusto = inizia(b, '\xff\xd8\xff');
  else if (est === 'png') giusto = inizia(b, '\x89PNG\r\n\x1a\n');
  else if (est === 'heic') giusto = inizia(b, 'ftyp', 4) && ['heic', 'heix', 'mif1', 'msf1'].some(x => inizia(b, x, 8));
  else if (est === 'dwg') giusto = inizia(b, 'AC10');
  else if (est === 'dxf') {
    const primi = b.subarray(0, 4096);
    giusto = primi.indexOf(0) < 0 && primi.toString('latin1').indexOf('SECTION') >= 0;
  } else if (est === 'docx' || est === 'xlsx') {
    if (!inizia(b, 'PK\x03\x04')) return { ok: false, errore: FRASE_FALSO };
    const ind = indiceZip(b);
    if (!ind || ind.troppo) return { ok: false, errore: FRASE_FALSO };
    if (ind.voci.some(v => /(^|\/)vbaProject\.bin$/i.test(v))) return { ok: false, errore: FRASE_TIPO };
    if (ind.scompattati > 200 * MB || ind.scompattati > 100 * b.length) return { ok: false, errore: FRASE_FALSO };
    const serve = est === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
    giusto = ind.voci.indexOf('[Content_Types].xml') >= 0 && ind.voci.indexOf(serve) >= 0;
  }
  if (!giusto) return { ok: false, errore: FRASE_FALSO };
  return { ok: true, nome: pulito, estensione: est, mime: TIPI[est] };
}

// ------------------------------------------------------------------ la chiave che scade (§7.8)

/** base64url(JSON {s, f, e, p}) + "." + base64url(HMAC-SHA256 col segreto del portale). p: la pubblicazione da cui si vede. */
function chiave(segreto, idSessione, idFile, idPubblicazione, secondi) {
  const corpo = Buffer.from(JSON.stringify({ s: idSessione, f: idFile, e: Math.floor(Date.now() / 1000) + (secondi || 600), p: idPubblicazione || 0 })).toString('base64url');
  const firma = crypto.createHmac('sha256', segreto).update(corpo).digest('base64url');
  return corpo + '.' + firma;
}

/** La chiave letta, se la firma e' giusta e non e' scaduta: {s, f, e, p} o null. */
function leggiChiave(segreto, k) {
  const m = String(k || '').match(/^([A-Za-z0-9_-]{8,400})\.([A-Za-z0-9_-]{43})$/);
  if (!m) return null;
  const attesa = crypto.createHmac('sha256', segreto).update(m[1]).digest();
  let data;
  try { data = Buffer.from(m[2], 'base64url'); } catch (e) { return null; }
  if (data.length !== attesa.length || !crypto.timingSafeEqual(data, attesa)) return null;
  let o;
  try { o = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!o || typeof o !== 'object' || !(Number(o.e) > Math.floor(Date.now() / 1000))) return null;
  return o;
}

// ------------------------------------------------------------------ la firma disegnata

/**
 * La firma: un PNG (data:image/png;base64,...) fino a 250 KB, non vuoto. "Non vuoto" si controlla sui pixel: si leggono
 * i blocchi IDAT (zlib di Node) e almeno un byte deve essere diverso dagli altri (un riquadro tutto bianco o tutto
 * trasparente e' uguale dappertutto). Torna {ok, dati} o {ok: false, errore}.
 */
function leggiFirma(testo) {
  const m = String(testo || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { ok: false, errore: 'Manca la firma' };
  const b = Buffer.from(m[1], 'base64');
  if (!inizia(b, '\x89PNG\r\n\x1a\n') || b.length < 60) return { ok: false, errore: 'Manca la firma' };
  if (b.length > 250 * 1024) return { ok: false, errore: 'La firma è troppo grande: cancellala e rifalla' };
  try {
    const pezzi = [];
    let p = 8;
    let larghezza = 0;
    let canali = 4;
    while (p + 8 <= b.length) {
      const l = b.readUInt32BE(p);
      const t = b.subarray(p + 4, p + 8).toString('latin1');
      if (t === 'IHDR') {
        larghezza = b.readUInt32BE(p + 8);
        const colore = b[p + 17];
        canali = colore === 6 ? 4 : colore === 2 ? 3 : colore === 4 ? 2 : 1;
      }
      if (t === 'IDAT') pezzi.push(b.subarray(p + 8, p + 8 + l));
      if (t === 'IEND') break;
      p += 12 + l;
    }
    const raw = zlib.inflateSync(Buffer.concat(pezzi));
    // I filtri del PNG tolti riga per riga (8 bit per canale, come le firme dei browser): poi i pixel veri.
    const bpp = canali;
    const lunga = larghezza * canali;
    const righe = Math.floor(raw.length / (lunga + 1));
    let prima = Buffer.alloc(lunga);
    let primo = null;
    for (let y = 0; y < righe; y++) {
      const f = raw[y * (lunga + 1)];
      const r = Buffer.from(raw.subarray(y * (lunga + 1) + 1, (y + 1) * (lunga + 1)));
      for (let x = 0; x < lunga; x++) {
        const a = x >= bpp ? r[x - bpp] : 0;
        const su = prima[x];
        const c = x >= bpp ? prima[x - bpp] : 0;
        let v = r[x];
        if (f === 1) v += a;
        else if (f === 2) v += su;
        else if (f === 3) v += Math.floor((a + su) / 2);
        else if (f === 4) {
          const pp = a + su - c;
          const pa = Math.abs(pp - a);
          const pb = Math.abs(pp - su);
          const pc = Math.abs(pp - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? su : c;
        }
        r[x] = v & 255;
        if (primo === null) primo = r[x];
        else if (r[x] !== primo) return { ok: true, dati: b };
      }
      prima = r;
    }
    return { ok: false, errore: 'Manca la firma' };
  } catch (e) {
    return { ok: false, errore: 'Manca la firma' };
  }
}

module.exports = { controllaFile, pulisciNome, indiceZip, chiave, leggiChiave, leggiFirma, TIPI, FRASE_TIPO, FRASE_FALSO };
