// Fatture, banche e scadenze di Wisper Ufficio (fase 4), provate con Node:
// i conti della fattura condivisi col server (server/prove/casi-fattura.json, al
// centesimo), le parole e i colori fissi degli stati, l'IBAN coperto e il suo controllo,
// le voci di Da fatturare come le mostra il computer, il prospetto del PDF uguale a
// quello del server, i dati di esempio della visita.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../ui/conti.js');
global.WisperConti = C;
const RF = require('../ui/regole-fatture.js');
global.WisperRegoleFatture = RF;
const D = require('../ui/documenti.js');

// ------------------------------------------------------------------ i conti del server (§6, §15.18)

const FILE_CASI = path.join(__dirname, '..', '..', 'server', 'prove', 'casi-fattura.json');
const casi = JSON.parse(fs.readFileSync(FILE_CASI, 'utf8'));

test('i casi del server ci sono: almeno i 16 del contratto', () => {
  assert.ok(casi.casi.length >= 16, 'casi: ' + casi.casi.length);
});

for (const c of casi.casi) {
  test('conti della fattura · caso del server · ' + c.nome, () => {
    const k = RF.contiFattura(Object.assign({}, casi.base, c.fattura));
    const visti = {};
    Object.keys(c.atteso).forEach(campo => { visti[campo] = k[campo]; });
    assert.deepEqual(visti, c.atteso);
  });
}

test('conti: la riga del bollo si salta, la quantità mancante vale 1, il prezzo mancante 0', () => {
  const base = Object.assign({}, casi.base, { ritenuta: true });
  const k = RF.contiFattura(Object.assign({}, base, { righe: [{ tipo: 'compenso', prezzo: 100 }, { tipo: 'compenso', quantita: 3 }, { tipo: 'bollo', importo: 2 }] }));
  assert.deepEqual(k.righe, [100, 0]);
  assert.equal(k.totale, 128.1);
});

test('anteprima di una bozza: i parametri congelati vengono dalla fattura, il bollo dalle impostazioni', () => {
  const f = { regime: 'ordinario', ivaPercentuale: 22, eppiPercentuale: 5, ritenutaPercentuale: 20, ritenuta: true, bolloRivalsa: true, conti: { bollo: 0 },
    righe: [{ tipo: 'compenso', quantita: 1, prezzo: 1520 }, { tipo: 'anticipazione', quantita: 1, prezzo: 120 }, { tipo: 'bollo', quantita: 1, prezzo: 2 }] };
  const p = RF.parametriDi(f, { BOLLO_SOGLIA: 77.47, BOLLO_IMPORTO: 2 });
  assert.equal(p.righe.length, 2, 'la riga del bollo non entra');
  const k = RF.contiFattura(p);
  // Il caso 2 del contratto (40% a fine progetto con una spesa anticipata e il bollo).
  assert.equal(k.totale, 2069.12);
  assert.equal(k.netto, 1765.12);
});

// ------------------------------------------------------------------ le righe dei conti, con le parole di §13

test('righe dei conti: parole fisse, Da confermare su contributo, ritenuta e bollo finché non sono confermate', () => {
  const f = { tipo: 'fattura', regime: 'ordinario', ivaPercentuale: 22, eppiPercentuale: 5, ritenutaPercentuale: 20 };
  const k = RF.contiFattura(Object.assign({}, casi.base, casi.casi[1].fattura));
  const righe = RF.righeConti(k, f, { confermate: false });
  assert.deepEqual(righe.map(r => r.etichetta), ['Compenso', 'Contributo integrativo EPPI 5%', 'IVA 22%', 'Spese anticipate (senza IVA)', 'Marca da bollo',
    'Totale della fattura', 'Ritenuta 20% (la trattiene il cliente)', 'Netto da incassare']);
  assert.deepEqual(righe.filter(r => r.daConfermare).map(r => r.chiave), ['contributo', 'bollo', 'ritenuta']);
  assert.equal(righe.find(r => r.chiave === 'ritenuta').valore, -304);
  assert.ok(!RF.righeConti(k, f, { confermate: true }).some(r => r.daConfermare), 'confermate: niente pillole');
});

test('righe dei conti: un privato senza ritenuta, una nota di credito', () => {
  const k = RF.contiFattura(Object.assign({}, casi.base, casi.casi[3].fattura));
  const privato = RF.righeConti(k, { tipo: 'fattura', eppiPercentuale: 5, ivaPercentuale: 22 }, { privato: true });
  assert.equal(privato.find(r => r.chiave === 'ritenuta').etichetta, 'Ritenuta: no, è un privato');
  const nota = RF.righeConti(k, { tipo: 'nota', eppiPercentuale: 5, ivaPercentuale: 22 }, {});
  assert.ok(nota.some(r => r.etichetta === 'Totale della nota') && nota.some(r => r.etichetta === 'Netto stornato'));
});

// ------------------------------------------------------------------ stati, colori, IBAN

test('colori degli stati: sempre con la parola, quelli di §13', () => {
  const casiColore = { Bozza: 'grigio', Scartata: 'grigio', Annullata: 'grigio', Pronta: 'blu', 'Pronta · già pagata': 'blu', Emessa: 'blu', Pagata: 'verde',
    'Pagata in parte': 'ambra', Scaduta: 'rosso', 'Nota di credito': 'grigio', 'Da pagare': 'blu', Proposta: 'giallo', 'Sotto soglia': 'rosso',
    'Verificato in banca': 'verde', Registrato: 'blu', Pagato: 'verde', 'Pagato in parte': 'ambra', Scaduto: 'rosso' };
  Object.keys(casiColore).forEach(p => assert.equal(RF.coloreStato(p), casiColore[p], p));
  assert.equal(RF.parolaScadenziario('da_emettere'), 'Da emettere');
  assert.equal(RF.parolaScadenziario('proposto'), 'Proposta');
  assert.equal(RF.parolaScadenzaPagamento({ stato: 'fatturata', fattura: '45/2026' }), 'Fatturata 45/2026');
  assert.equal(RF.parolaScadenzaPagamento({ stato: 'in_bozza', fattura: 'W-15' }), 'In bozza W-15');
  assert.equal(RF.parolaScadenzaPagamento({ stato: 'prevista' }), 'Prevista');
});

test('certezza dell\'abbinamento: Sicura, Probabile, Diversa, Senza bozza; solo le sicure sono già scelte', () => {
  const doc = certezza => ({ tipo: 'emessa', proposta: { azione: certezza === 'nessuna' ? 'senzaBozza' : 'abbina', certezza } });
  assert.deepEqual(['certa', 'probabile', 'diversa', 'nessuna'].map(c => RF.pillolaCertezza(doc(c)).testo), ['Sicura', 'Probabile', 'Diversa', 'Senza bozza']);
  assert.deepEqual(['certa', 'probabile', 'diversa', 'nessuna'].map(c => RF.sceltaIniziale(doc(c))), ['abbina', '', '', '']);
  assert.equal(RF.sceltaIniziale({ tipo: 'emessa', proposta: { azione: 'gia' } }), 'salta');
  assert.equal(RF.sceltaIniziale({ tipo: 'ricevuta', proposta: { azione: 'nuova' } }), 'nuova');
  assert.equal(RF.sceltaIniziale({ tipo: 'esito', proposta: { azione: 'abbina', idFattura: 13 } }), 'abbina');
  assert.equal(RF.sceltaIniziale({ tipo: 'esito', proposta: { azione: 'salta' } }), 'salta');
});

test('IBAN: coperto con le ultime cifre, a gruppi, controllo modulo 97', () => {
  assert.equal(RF.ibanCoperto('IT60X0542811101000000123456'), '…3456');
  assert.equal(RF.ibanCoperto('IT…3456'), '…3456');
  assert.equal(RF.ibanAGruppi('IT60X0542811101000000123456'), 'IT60 X054 2811 1010 0000 0123 456');
  assert.ok(RF.ibanValido('IT60X0542811101000000123456'));
  assert.ok(RF.ibanValido('it60 x054 2811 1010 0000 0123 456'));
  assert.ok(!RF.ibanValido('IT61X0542811101000000123456'));
  assert.ok(!RF.ibanValido('IT60X05428111010000001234'));
});

test('importi scritti come li scrivono le persone', () => {
  assert.equal(RF.leggiImporto('500'), 500);
  assert.equal(RF.leggiImporto('1.232,34'), 1232.34);
  assert.equal(RF.leggiImporto('472,90 €'), 472.9);
  assert.equal(RF.leggiImporto(''), null);
  assert.equal(RF.leggiImporto('tanto'), null);
  // Quantità e prezzi unitari non si arrotondano (0,7612 €/km resta così).
  assert.equal(RF.leggiNumero('0,7612'), 0.7612);
  assert.equal(RF.leggiNumero('1.393,92'), 1393.92);
  assert.equal(RF.leggiNumero('7,5'), 7.5);
  assert.equal(RF.leggiNumero('x'), null);
});

// ------------------------------------------------------------------ Da fatturare come la mostra il computer

const GRUPPO = {
  idCliente: 'C001', cliente: 'Elettrodinamica', voci: [
    { tipo: 'spesa', id: 11, idCommessa: '26ST001', data: '2026-10-19', titolo: 'Parcheggio', importo: 4.5, anticipazione: false, pronta: true },
    { tipo: 'rapportino', id: 'RAP/2026/0007', data: '2026-09-03', titolo: 'Rilievo', importo: 219.52, spese: [14], pronta: true },
    { tipo: 'spesa', id: 14, idRapportino: 'RAP/2026/0007', data: '2026-09-03', titolo: 'Pedaggio', importo: 8.4, pronta: true },
    { tipo: 'rapportino', id: 'RAP/2026/0008', data: '2026-09-08', titolo: 'Cablaggio', importo: 249.52, spese: [], pronta: true },
    { tipo: 'rapportino', id: 'RAP/2026/0002', data: '2026-10-02', titolo: 'Cablaggio', importo: 342.96, spese: [1], pronta: true },
    { tipo: 'spesa', id: 1, idRapportino: 'RAP/2026/0002', data: '2026-10-02', titolo: 'Pranzo', importo: 14.5, pronta: true },
    { tipo: 'ore', id: 1, idCommessa: '26ST001', data: '2026-10-21', titolo: 'Progetto esecutivo', importo: 180, pronta: true },
  ],
};

test('Da fatturare: i rapportini di un mese sono una voce, con dentro le loro spese', () => {
  const righe = RF.righeVista(GRUPPO);
  assert.deepEqual(righe.map(r => r.titolo), ['Parcheggio', 'Settembre 2026 · 2 rapportini', 'Ottobre 2026 · 1 rapportino', 'Progetto esecutivo']);
  const settembre = righe[1];
  assert.equal(settembre.importo, 477.44, '219,52 + 8,40 + 249,52');
  assert.deepEqual(settembre.voci, [{ tipo: 'rapportino', id: 'RAP/2026/0007' }, { tipo: 'rapportino', id: 'RAP/2026/0008' }]);
  assert.equal(settembre.rapportini[0].spese[0].id, 14);
});

test('Da fatturare: la somma delle scelte conta le spese che vanno col rapportino', () => {
  const righe = RF.righeVista(GRUPPO);
  const s = RF.sommaScelte(righe, new Set(['rapportino:RAP/2026/0007', 'ore:1']));
  assert.deepEqual(s, { n: 2, totale: 407.92 });
});

// ------------------------------------------------------------------ il prospetto del PDF: uguale a quello del server

test('prospetto del PDF: sezioni e campi uguali a quelli del server, per una fattura e per una nota', () => {
  const prospettoServer = require('../../server/src/passaggio/prospetto.js');
  const modello = {
    riferimento: 'W-15', tipoDocumento: 'TD01', divisa: 'EUR', dataProposta: '2026-10-22', data: '', numero: '',
    prestatore: { denominazione: 'Studio Tecnico GM', partitaIva: '00000000000', codiceFiscale: '00000000000', regimeFiscale: 'RF01', sede: {} },
    committente: { denominazione: 'Rossi Impianti Srl', nome: '', cognome: '', partitaIva: '04455667784', codiceFiscale: '',
      sede: { indirizzo: 'Via Nuova 3', cap: '36061', comune: 'Bassano del Grappa', provincia: 'VI', nazione: 'IT' }, codiceDestinatario: '0000000', pec: 'rossiimpianti@pec.esempio.it' },
    righe: [
      { numero: 1, descrizione: '40% a fine progetto', quantita: 1, unitaMisura: '', prezzoUnitario: 1520, prezzoTotale: 1520, aliquotaIva: 22, natura: '', ritenuta: true },
      { numero: 2, descrizione: 'Spesa anticipata', quantita: 1, unitaMisura: '', prezzoUnitario: 120, prezzoTotale: 120, aliquotaIva: 0, natura: 'N1', ritenuta: false },
      { numero: 3, descrizione: 'Imposta di bollo', quantita: 1, unitaMisura: '', prezzoUnitario: 2, prezzoTotale: 2, aliquotaIva: 0, natura: 'N1', ritenuta: false },
    ],
    cassa: { tipo: 'TC17', aliquota: 5, imponibile: 1520, importo: 76, aliquotaIva: 22, natura: '', ritenuta: false },
    ritenuta: { tipo: 'RT01', aliquota: 20, importo: 304, causale: 'A' },
    bollo: { virtuale: true, importo: 2 },
    riepilogo: [{ aliquotaIva: 22, natura: '', imponibile: 1596, imposta: 351.12, esigibilita: 'I', riferimentoNormativo: '' },
      { aliquotaIva: 0, natura: 'N1', imponibile: 122, imposta: 0, esigibilita: '', riferimentoNormativo: 'Escluse ex art. 15 DPR 633/72' }],
    totaleDocumento: 2069.12, nettoAPagare: 1765.12,
    pagamento: { condizioni: 'TP02', dettagli: [{ modalita: 'MP05', scadenza: '2026-11-21', importo: 1765.12, iban: 'IT60X0542811101000000123456', istituto: 'Banca di esempio' }] },
    causale: ['40% a fine progetto, commessa 26ST003. Rif. Wisper W-15'], fattureCollegate: [], regoleConfermate: false,
  };
  const s = prospettoServer.crea(modello);
  assert.deepEqual(D.sezioniProspetto(modello), s.sezioni);
  const nota = Object.assign({}, modello, { tipoDocumento: 'TD04', fattureCollegate: [{ idDocumento: '52/2026', data: '2026-10-23' }], ritenuta: null, bollo: null, regoleConfermate: true });
  assert.deepEqual(D.sezioniProspetto(nota), prospettoServer.crea(nota).sezioni);
  const html = D.prospettoFattura(modello, { confermateIl: '' });
  assert.ok(html.indexOf('non è una fattura') > 0, 'l\'intestazione dice che non è una fattura');
  assert.ok(html.indexOf('NON ancora confermate') > 0, 'il piede dice che le regole non sono confermate');
  assert.ok(html.indexOf('W-15') > 0);
  const confermato = D.prospettoFattura(Object.assign({}, modello, { regoleConfermate: true }), { confermateIl: '2026-11-05' });
  assert.ok(confermato.indexOf('confermate dal commercialista il 05/11/2026') > 0);
  const avviso = D.avvisoParcella(modello);
  assert.ok(avviso.indexOf('Parcella pro-forma') > 0 && avviso.indexOf('Documento senza valore fiscale') > 0);
  assert.ok(avviso.indexOf('<script') < 0 && html.indexOf('<script') < 0);
});

test('prospetto del PDF: un testo con < e > resta testo', () => {
  const html = D.prospettoFattura({ riferimento: 'W-1', tipoDocumento: 'TD01', dataProposta: '2026-10-22', committente: { denominazione: '<b>Rossi</b>', sede: {} }, righe: [], causale: [], pagamento: { dettagli: [] } });
  assert.ok(html.indexOf('<b>Rossi</b>') < 0 && html.indexOf('&lt;b&gt;Rossi') > 0);
});
