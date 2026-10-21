// Il lettore (e lo scrittore) .xlsx senza librerie: zip, testi condivisi, numeri, date, vero/falso.
//   node --test server/prove/
'use strict';

process.env.TZ = 'Europe/Rome';

const test = require('node:test');
const assert = require('node:assert/strict');
const { leggiXlsx, scriviXlsx, leggiZip, scriviZip, dataDaSeriale, serialeDaData } = require('../strumenti/xlsx');

test('zip: si legge quello che si scrive', () => {
  const voci = [{ nome: 'a.txt', dati: 'ciao' }, { nome: 'cartella/b.xml', dati: Buffer.from('<x>àèì</x>') }];
  const z = leggiZip(scriviZip(voci));
  assert.deepEqual(z.nomi, ['a.txt', 'cartella/b.xml']);
  assert.equal(z.leggi('a.txt').toString(), 'ciao');
  assert.equal(z.leggi('cartella/b.xml').toString(), '<x>àèì</x>');
  assert.equal(z.leggi('manca'), null);
  assert.throws(() => leggiZip(Buffer.from('non sono uno zip')), /Non è un file .xlsx valido/);
});

test('date: i giorni di Excel come ora del muro italiana, anche col cambio dell\'ora', () => {
  assert.equal(serialeDaData(new Date(2026, 9, 15)), 46310);
  const d = dataDaSeriale(46310.5);
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 9, 15, 12]);
  const estate = new Date(2026, 6, 31, 23, 30, 15);
  assert.equal(dataDaSeriale(serialeDaData(estate)).getTime(), estate.getTime());
  const inverno = new Date(2026, 11, 31, 0, 0, 0);
  assert.equal(dataDaSeriale(serialeDaData(inverno)).getTime(), inverno.getTime());
});

test('xlsx: testi, numeri, vero/falso, date e celle vuote tornano come erano', () => {
  const righe = [
    ['ID', 'DATA', 'ORE', 'NOTE', 'FIRMATO_IL', 'OK'],
    ['RAP/2026/0001', new Date(2026, 9, 2), 8.5, 'Pranzo & caffè <ok> "sì"', new Date(2026, 9, 2, 17, 30, 5), true],
    ['RAP/2026/0002', new Date(2026, 9, 3), 0, '', '', false],
    ['', '', '', 'riga\ncon a capo', '', ''],
    ['01234567890', '', -3.25, '=FORMULA()', '', ''],
  ];
  const schede = leggiXlsx(scriviXlsx([{ nome: 'Rapportini', righe }, { nome: 'Città e altro', righe: [['CHIAVE', 'VALORE'], ['EURO_KM', 0.76]] }]));
  assert.deepEqual(schede.map(s => s.nome), ['Rapportini', 'Città e altro']);
  const r = schede[0].righe;
  assert.equal(r[1][0], 'RAP/2026/0001');
  assert.equal(r[1][1].getTime(), new Date(2026, 9, 2).getTime());
  assert.equal(r[1][2], 8.5);
  assert.equal(r[1][3], 'Pranzo & caffè <ok> "sì"');
  assert.equal(r[1][4].getTime(), new Date(2026, 9, 2, 17, 30, 5).getTime());
  assert.equal(r[1][5], true);
  assert.equal(r[2][5], false);
  assert.equal(r[2][3] || '', '');
  assert.equal(r[3][3], 'riga\ncon a capo');
  assert.equal(r[4][0], '01234567890', 'il testo con lo zero resta testo');
  assert.equal(r[4][2], -3.25);
  assert.equal(r[4][3], '=FORMULA()');
  assert.equal(schede[1].righe[1][1], 0.76);
});

test('xlsx: un file come lo scrive Google (testo in linea, formati di data propri, righe saltate)', () => {
  const foglio = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    '<row r="1"><c r="A1" t="inlineStr"><is><t>DATA</t></is></c><c r="C1" t="s"><v>0</v></c></row>' +
    '<row r="3"><c r="A3" s="1"><v>46310</v></c><c r="C3" t="str"><v>calcolato</v></c><c r="D3" t="e"><v>#N/A</v></c></row>' +
    '</sheetData></worksheet>';
  const buf = scriviZip([
    { nome: 'xl/workbook.xml', dati: '<workbook><sheets><sheet name="Foglio1" sheetId="1" r:id="rId9"/></sheets></workbook>' },
    { nome: 'xl/_rels/workbook.xml.rels', dati: '<Relationships><Relationship Id="rId9" Target="/xl/worksheets/s.xml" Type="x"/></Relationships>' },
    { nome: 'xl/sharedStrings.xml', dati: '<sst><si><r><t>NO</t></r><r><t xml:space="preserve">TE </t></r><rPh><t>x</t></rPh></si></sst>' },
    { nome: 'xl/styles.xml', dati: '<styleSheet><numFmts><numFmt numFmtId="170" formatCode="d&quot; del &quot;mmmm yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="170"/></cellXfs></styleSheet>' },
    { nome: 'xl/worksheets/s.xml', dati: foglio },
  ]);
  const [s] = leggiXlsx(buf);
  assert.equal(s.righe[0][0], 'DATA');
  assert.equal(s.righe[0][2], 'NOTE ', 'i pezzi di testo formattato si uniscono, la pronuncia no');
  assert.deepEqual(s.righe[1], [], 'la riga 2 manca: vuota');
  assert.equal(s.righe[2][0].getTime(), new Date(2026, 9, 15).getTime());
  assert.equal(s.righe[2][2], 'calcolato');
  assert.equal(s.righe[2][3], '#N/A');
});
