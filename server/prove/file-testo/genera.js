/*
 * Scrive i file finti per le prove della ricerca dentro i file (fase8.md §16): un PDF come lo fa Word (font WinAnsi,
 * TJ con le spaziature), uno come lo fa LibreOffice (font Identity-H con la tabella ToUnicode e le stringhe
 * esadecimali), una scansione (solo un'immagine), un DOCX, un XLSX, un DXF e un DOC vecchio (solo l'intestazione OLE).
 * Testi inventati; i file stanno accanto a questo e non si cambiano a mano: si rifanno con
 *   node server/prove/file-testo/genera.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { scriviZip } = require('../../src/zip');

const QUI = __dirname;

/** Un PDF con gli oggetti dati (stringhe; i flussi come {diz, dati}), con xref e trailer veri. */
function pdf(oggetti) {
  const pezzi = [Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const posizioni = [];
  let pos = pezzi[0].length;
  oggetti.forEach((o, i) => {
    posizioni.push(pos);
    let b;
    if (typeof o === 'string') b = Buffer.from((i + 1) + ' 0 obj\n' + o + '\nendobj\n', 'latin1');
    else {
      const dati = o.comprimi === false ? o.dati : zlib.deflateSync(o.dati);
      b = Buffer.concat([Buffer.from((i + 1) + ' 0 obj\n<< ' + o.diz + (o.comprimi === false ? '' : ' /Filter /FlateDecode') + ' /Length ' + dati.length + ' >>\nstream\n', 'latin1'),
        dati, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    }
    pezzi.push(b);
    pos += b.length;
  });
  const xref = 'xref\n0 ' + (oggetti.length + 1) + '\n0000000000 65535 f \n' + posizioni.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + (oggetti.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + pos + '\n%%EOF\n';
  pezzi.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(pezzi);
}

/** Una stringa PDF fra parentesi (WinAnsi), con le barre dove servono. */
const lett = s => '(' + Buffer.from(s, 'latin1').toString('latin1').replace(/([\\()])/g, '\\$1') + ')';

// ---------------------------------------------------------------- 1. il PDF "di Word"
function pdfWord() {
  const righe = [
    'Verbale di verifica periodica',
    'Impianto: Magazzino automatico, zona industriale di Schio',
    'La verifica dell\'impianto di terra è stata eseguita il 12/03/2026 con',
    'il metodo voltamperometrico: la resistenza misurata è 4,2 ohm, perché',
    'il dispersore è stato ampliato nel 2025. Nessuna non conformità rilevata;',
    'prossima verifica entro due anni secondo il DPR 462/01.',
  ];
  // Come Word: ogni riga con TJ e qualche spaziatura fra le lettere, un Td per andare a capo.
  let c = 'BT\n/F1 11 Tf\n72 760 Td\n';
  righe.forEach((r, i) => {
    const meta = Math.floor(r.length / 2);
    c += '[' + lett(r.slice(0, meta)) + '-12' + lett(r.slice(meta)) + ']TJ\n';
    if (i < righe.length - 1) c += '0 -16 Td\n';
  });
  c += 'ET\n';
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /TrueType /BaseFont /Calibri /Encoding /WinAnsiEncoding >>',
    { diz: '', dati: Buffer.from(c, 'latin1') },
  ]);
}

// ---------------------------------------------------------------- 2. il PDF "di LibreOffice" (Identity-H + ToUnicode)
function pdfLibreOffice() {
  const testo = 'Relazione tecnica del quadro generale QG2. Il quadro è alimentato dalla cabina MT; le protezioni sono state coordinate ' +
    'con la selettività verso valle. Più avanti la tabella delle sezioni dei cavi e la caduta di tensione calcolata, perché il carico cresce.';
  // Ogni carattere diverso prende un codice di due byte (come fa LibreOffice coi glifi): la tabella ToUnicode li riporta.
  const codici = new Map();
  for (const ch of testo) if (!codici.has(ch)) codici.set(ch, codici.size + 3);
  const hex = n => n.toString(16).toUpperCase().padStart(4, '0');
  const pezzi = testo.match(/.{1,60}(\s|$)/g);
  let c = 'BT\n/F1 10 Tf\n56 780 Td\n';
  pezzi.forEach((p, i) => {
    c += '<' + Array.from(p).map(ch => hex(codici.get(ch))).join('') + '>Tj\n';
    if (i < pezzi.length - 1) c += '0 -14 Td\n';
  });
  c += 'ET\n';
  // Le lettere consecutive in un bfrange (come i glifi di seguito), le altre in bfchar.
  const voci = Array.from(codici.entries()).map(([ch, n]) => ({ n, u: ch.charCodeAt(0) }));
  const meta = Math.floor(voci.length / 2);
  const chars = voci.slice(0, meta).map(v => '<' + hex(v.n) + '> <' + hex(v.u) + '>').join('\n');
  const range = voci.slice(meta).map(v => '<' + hex(v.n) + '> <' + hex(v.n) + '> <' + hex(v.u) + '>').join('\n');
  const cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapName /Adobe-Identity-UCS def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
    meta + ' beginbfchar\n' + chars + '\nendbfchar\n' + (voci.length - meta) + ' beginbfrange\n' + range + '\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+LiberationSans /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 5 0 R >>',
    { diz: '', dati: Buffer.from(cmap, 'latin1') },
    { diz: '', dati: Buffer.from(c, 'latin1') },
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+LiberationSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>',
  ]);
}

// ---------------------------------------------------------------- 3. una scansione: solo un'immagine
function pdfScansione() {
  const pixel = Buffer.alloc(16 * 16, 0x80);
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
    { diz: '/Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceGray /BitsPerComponent 8', dati: pixel },
    { diz: '', dati: Buffer.from('q 595 0 0 842 0 0 cm /Im1 Do Q\n', 'latin1') },
  ]);
}

// ---------------------------------------------------------------- 4. un DOCX
function docx() {
  const p = t => '<w:p><w:r><w:t xml:space="preserve">' + t.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</w:t></w:r></w:p>';
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    p('Capitolato speciale d\'appalto') + '<w:p><w:r><w:t>Impianto di illuminazione </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>di emergenza</w:t></w:r><w:r><w:t> del capannone.</w:t></w:r></w:p>' +
    p('Gli apparecchi autonomi devono garantire un\'ora di autonomia; la verifica funzionale è semestrale.') + '</w:body></w:document>';
  const testa = '<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + p('Studio Tecnico di esempio · Commessa 26ST002') + '</w:hdr>';
  return scriviZip([
    { nome: '[Content_Types].xml', dati: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { nome: 'word/document.xml', dati: doc },
    { nome: 'word/header1.xml', dati: testa },
    { nome: 'docProps/app.xml', dati: '<?xml version="1.0" encoding="UTF-8"?><Properties><Pages>2</Pages></Properties>' },
  ]);
}

// ---------------------------------------------------------------- 5. un XLSX
function xlsx() {
  return scriviZip([
    { nome: '[Content_Types].xml', dati: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>' },
    { nome: 'xl/workbook.xml', dati: '<?xml version="1.0" encoding="UTF-8"?><workbook><sheets><sheet name="Computo metrico" sheetId="1"/><sheet name="Cavi &amp; sezioni" sheetId="2"/></sheets></workbook>' },
    { nome: 'xl/sharedStrings.xml', dati: '<?xml version="1.0" encoding="UTF-8"?><sst count="3"><si><t>Interruttore magnetotermico 4x63A</t></si><si><r><t>Cavo </t></r><r><t>FG16OR16 5G10</t></r></si><si><t>Quadro di distribuzione</t></si></sst>' },
    { nome: 'xl/worksheets/sheet1.xml', dati: '<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Sezionatore sottocarico</t></is></c></row></sheetData></worksheet>' },
  ]);
}

// ---------------------------------------------------------------- 6. un DXF (testi TEXT e MTEXT)
function dxf() {
  const r = [];
  const coppia = (c, v) => r.push(String(c).padStart(3, ' '), v);
  coppia(0, 'SECTION'); coppia(2, 'ENTITIES');
  coppia(0, 'TEXT'); coppia(8, 'TESTI'); coppia(10, '0.0'); coppia(20, '0.0'); coppia(40, '2.5'); coppia(1, 'QUADRO GENERALE QG1');
  coppia(0, 'MTEXT'); coppia(8, 'NOTE'); coppia(10, '0.0'); coppia(20, '10.0'); coppia(40, '2.5');
  coppia(3, '{\\fArial|b0|i0|c0|p34;Linea di alimentazione dal trasformatore\\P}');
  coppia(1, 'Collegamento all\'impianto di terra con conduttore giallo-verde %%c 16');
  coppia(0, 'ENDSEC'); coppia(0, 'EOF');
  return Buffer.from(r.join('\r\n') + '\r\n', 'latin1');
}

// ---------------------------------------------------------------- 7. un DOC vecchio (Word 97-2003): solo l'intestazione OLE
function docVecchio() {
  const b = Buffer.alloc(1024, 0);
  Buffer.from('D0CF11E0A1B11AE1', 'hex').copy(b, 0);
  Buffer.from('Testo di un documento di Word vecchio: impianto di terra', 'utf16le').copy(b, 512);
  return b;
}

const FILE = {
  'verbale-word.pdf': pdfWord(),
  'relazione-libreoffice.pdf': pdfLibreOffice(),
  'scansione.pdf': pdfScansione(),
  'capitolato.docx': docx(),
  'computo.xlsx': xlsx(),
  'schema.dxf': dxf(),
  'vecchio.doc': docVecchio(),
};

if (require.main === module) {
  for (const [nome, b] of Object.entries(FILE)) fs.writeFileSync(path.join(QUI, nome), b);
  console.log('Scritti ' + Object.keys(FILE).length + ' file in ' + QUI);
}

module.exports = { FILE };
