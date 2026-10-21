// Le azioni nuove della fase 1: clienti e fornitori coi campi nuovi, il controllo della
// partita IVA (VIES finto), referenti, sedi e impianti, prestazioni, commesse duplicate e
// archiviate, numerazioni, il registro col prima/dopo, l'esportazione per Excel, la dashboard.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, viesFinto } = require('./aiuto');

let s;
let vies;
let manuel;
test.before(async () => {
  vies = await viesFinto();
  process.env.WISPER_VIES_URL = vies.url;
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
});
test.after(async () => { await s.ferma(); await vies.ferma(); });

// ------------------------------------------------------------------ soggetti

test('anagrafiche: le parti di oggi e quelle nuove', async () => {
  const a = await manuel('anagrafiche');
  for (const k of ['clienti', 'commesse', 'gruppi', 'impostazioni', 'fornitori', 'referenti', 'sedi', 'prestazioni', 'utenti', 'numerazioni']) assert.ok(k in a, k);
  assert.deepEqual(a.fornitori.map(f => f.id), ['F001', 'F002']);
  assert.equal(a.fornitori[0].fornitore, true);
  assert.equal(a.fornitori[0].cliente, false);
  assert.deepEqual(Object.keys(a.utenti[0]).sort(), ['attivo', 'id', 'nome', 'ruolo'], 'degli utenti solo nome e ruolo');
  assert.equal(a.numerazioni.find(n => n.tipo === 'commessa').prossimo, '26ST003');
  assert.equal(a.sedi.filter(x => x.tipo === 'impianto').length, 1);
  assert.equal(a.commesse.find(m => m.id === '26ST001').responsabileId, 1);
  assert.deepEqual(a.commesse.find(m => m.id === '26ST001').persone, [3]);
});

test('salvaSoggetto: i controlli dicono quale campo', async () => {
  const prova = async (campi, atteso) => {
    const r = await manuel('salvaSoggetto', { soggetto: Object.assign({ nome: 'Controlli Srl' }, campi) });
    assert.equal(r.ok, false, JSON.stringify(campi));
    assert.match(r.errore, atteso);
  };
  await prova({ partitaIva: '0123456789' }, /^Partita IVA: deve avere 11 cifre/);
  await prova({ partitaIva: '01234567890' }, /^Partita IVA: il numero non torna/);
  await prova({ codiceFiscale: 'ABC' }, /^Codice fiscale/);
  await prova({ codiceSdi: 'ABC12' }, /^Codice SDI/);
  await prova({ cap: '3601' }, /^CAP/);
  await prova({ email: 'senza.chiocciola' }, /^Email/);
  await prova({ nome: '' }, /^Nome/);
  await prova({ cliente: false, fornitore: false }, /cliente, un fornitore o tutti e due/);
  const estero = await manuel('salvaSoggetto', { soggetto: { nome: 'Fournisseur Sarl', nazione: 'fr', partitaIva: 'FR12345678901', cap: '75001', fornitore: true, cliente: false } });
  assert.equal(estero.ok, true, estero.errore);
  assert.equal(estero.soggetto.nazione, 'FR');
  assert.equal(estero.soggetto.id, 'F003', 'nato fornitore: codice F');
});

test('salvaSoggetto: un doppione per nome o partita IVA restituisce quello che c\'e\'', async () => {
  const r = await manuel('salvaSoggetto', { soggetto: { nome: 'Verdi Quadri Srl', partitaIva: 'IT 0123456789 7', codiceSdi: 'xyz1234', provincia: 'vi', cap: '36016', citta: 'Thiene' } });
  assert.equal(r.soggetto.giaEsisteva, true, 'stessa partita IVA di Materiale Elettrico');
  assert.equal(r.soggetto.id, 'F001');
  assert.equal(r.soggetto.cliente, true, 'era solo fornitore: ora anche cliente');
  const pulito = await manuel('salvaSoggetto', { soggetto: { nome: 'Verdi Quadri Srl', codiceSdi: 'xyz1234', provincia: 'vi', cap: '36016', citta: 'Thiene', pec: 'verdi@pec.example' } });
  assert.equal(pulito.soggetto.giaEsisteva, false);
  assert.equal(pulito.soggetto.codiceSdi, 'XYZ1234', 'maiuscolo');
  assert.equal(pulito.soggetto.provincia, 'VI');
  assert.match(pulito.soggetto.id, /^C\d{3}$/);
  const stessoNome = await manuel('salvaSoggetto', { soggetto: { nome: 'VERDI QUADRI S.R.L.' } });
  assert.equal(stessoNome.soggetto.giaEsisteva, true);
  // Una partita IVA gia' di un altro, in modifica: si rifiuta e si dice di chi e'.
  const cambia = await manuel('salvaSoggetto', { soggetto: { id: pulito.soggetto.id, partitaIva: '01234567897' } });
  assert.match(cambia.errore, /^Partita IVA: è già di Materiale Elettrico Esempio Srl \(F001\)/);
});

test('controllaPartitaIva: il codice di controllo prima, poi il servizio europeo', async () => {
  const chiamatePrima = vies.chiamate.length;
  const sbagliata = await manuel('controllaPartitaIva', { partitaIva: '01234567890' });
  assert.equal(sbagliata.ok, false);
  assert.match(sbagliata.errore, /non torna/);
  assert.equal(vies.chiamate.length, chiamatePrima, 'una partita IVA sbagliata non si manda in Europa');
  const giusta = await manuel('controllaPartitaIva', { partitaIva: '01234567897' });
  assert.deepEqual(giusta, { ok: true, valida: true, partitaIva: '01234567897', nazione: 'IT', nome: 'MATERIALE ELETTRICO ESEMPIO S.R.L.',
    indirizzo: 'VIA DEI FORNITORI 3', cap: '36016', citta: 'THIENE', provincia: 'VI' });
  const nonRegistrata = await manuel('controllaPartitaIva', { partitaIva: '12345678903' });
  assert.equal(nonRegistrata.ok, true);
  assert.equal(nonRegistrata.valida, false);
  assert.equal(nonRegistrata.nome, '');
  const giu = await manuel('controllaPartitaIva', { partitaIva: '00000000000' });
  assert.deepEqual(giu, { ok: false, errore: 'Il servizio europeo non risponde: riprova più tardi', rete: true });
  const marco = await s.come('marco@esempio.it');
  assert.equal((await marco('controllaPartitaIva', { partitaIva: '01234567897' })).ok, true, 'basta vedere i clienti');
});

test('referenti e sedi: si aggiungono, si cambiano, si tolgono o si archiviano', async () => {
  const r = await manuel('salvaReferente', { referente: { idSoggetto: 'C002', nome: 'Anna Rossi', ruolo: 'Ufficio acquisti', telefono: '0445000004' } });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.referente.telefono, '0445000004');
  assert.equal((await manuel('salvaReferente', { referente: { id: r.referente.id, ruolo: 'Amministrazione' } })).referente.ruolo, 'Amministrazione');
  assert.equal((await manuel('togliReferente', { id: r.referente.id })).ok, true);
  assert.equal((await manuel('anagrafiche')).referenti.some(x => x.id === r.referente.id), false);
  assert.equal((await manuel('salvaReferente', { referente: { idSoggetto: 'C999', nome: 'X' } })).errore, 'Soggetto C999 non trovato');
  const sede = await manuel('salvaSede', { sede: { idSoggetto: 'C002', tipo: 'impianto', nome: 'Cabina MT', cap: '36016' } });
  assert.equal(sede.sede.tipo, 'impianto');
  assert.equal((await manuel('salvaSede', { sede: { idSoggetto: 'C002', tipo: 'ufficio', nome: 'X' } })).errore, 'Tipo: "sede" o "impianto"');
  await manuel('archiviaSede', { id: sede.sede.id });
  assert.equal((await manuel('anagrafiche')).sedi.some(x => x.id === sede.sede.id), false);
  assert.equal((await manuel('anagrafiche', { archiviati: true })).sedi.some(x => x.id === sede.sede.id), true);
});

test('archiviare un cliente: sparisce dagli elenchi, resta per i rapportini, si ripristina', async () => {
  const c = (await manuel('creaCliente', { nome: 'Da Archiviare Snc' })).cliente;
  await manuel('archiviaSoggetto', { id: c.id });
  assert.equal((await manuel('anagrafiche')).clienti.some(x => x.id === c.id), false);
  assert.equal((await manuel('anagrafiche', { archiviati: true })).clienti.find(x => x.id === c.id).archiviato, true);
  assert.equal((await manuel('creaCliente', { nome: 'da archiviare snc' })).cliente.id, c.id, 'non si ricrea un doppione');
  await manuel('ripristinaSoggetto', { id: c.id });
  assert.equal((await manuel('anagrafiche')).clienti.some(x => x.id === c.id), true);
});

// ------------------------------------------------------------------ commesse e prestazioni

test('prestazioni: lo stato segue l\'avanzamento, l\'ordine si cambia', async () => {
  const p = await manuel('salvaPrestazione', { prestazione: { idCommessa: '26ST002', nome: 'Collaudo', valore: 400 } });
  assert.equal(p.prestazione.stato, 'da_fare');
  assert.equal(p.prestazione.ordine, 4);
  assert.equal((await manuel('salvaPrestazione', { prestazione: { id: p.prestazione.id, avanzamento: 40 } })).prestazione.stato, 'in_corso');
  assert.equal((await manuel('salvaPrestazione', { prestazione: { id: p.prestazione.id, avanzamento: 100 } })).prestazione.stato, 'fatta');
  assert.equal((await manuel('salvaPrestazione', { prestazione: { id: p.prestazione.id, avanzamento: 120 } })).errore, 'Avanzamento: da 0 a 100');
  const tutte = (await manuel('anagrafiche')).prestazioni.filter(x => x.idCommessa === '26ST002').map(x => x.id);
  const giro = tutte.slice().reverse();
  const r = await manuel('ordinaPrestazioni', { idCommessa: '26ST002', ids: giro });
  assert.deepEqual(r.prestazioni.map(x => x.id), giro);
  assert.match((await manuel('ordinaPrestazioni', { idCommessa: '26ST001', ids: giro })).errore, /non è di questa commessa/);
  assert.equal((await manuel('togliPrestazione', { id: p.prestazione.id })).ok, true);
});

test('duplicare una commessa: codice nuovo, prestazioni ad avanzamento zero, persone; come modello non si vede', async () => {
  const d = await manuel('duplicaCommessa', { id: '26ST001' });
  assert.equal(d.ok, true, d.errore);
  assert.match(d.commessa.id, /^26ST\d{3}$/);
  assert.notEqual(d.commessa.id, '26ST001');
  assert.equal(d.commessa.descrizione, 'Nuovo magazzino automatico Batokyo (copia)');
  assert.deepEqual(d.commessa.persone, [3]);
  const prest = (await manuel('anagrafiche')).prestazioni.filter(x => x.idCommessa === d.commessa.id);
  assert.deepEqual(prest.map(x => x.nome), ['Sopralluogo', 'Progetto esecutivo', 'Direzione lavori']);
  assert.ok(prest.every(x => x.avanzamento === 0 && x.stato === 'da_fare'));
  assert.equal(prest[1].valore, 600);
  const modello = await manuel('duplicaCommessa', { id: '26ST002', comeModello: true });
  assert.equal(modello.commessa.modello, true);
  assert.equal((await manuel('anagrafiche')).commesse.some(m => m.id === modello.commessa.id), false, 'un modello non sta negli elenchi');
  assert.equal((await manuel('anagrafiche', { modelli: true })).commesse.some(m => m.id === modello.commessa.id), true);
  const daModello = await manuel('duplicaCommessa', { id: modello.commessa.id, idCliente: 'C001' });
  assert.equal(daModello.commessa.descrizione, 'Quadro elettrico capannone');
  assert.equal(daModello.commessa.idCliente, 'C001');
  assert.equal(daModello.commessa.modello, false);
});

test('archiviare una commessa e i campi nuovi', async () => {
  const m = (await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Con i campi nuovi', sedeId: 3, responsabileId: 2, persone: [3, 2], importoContratto: 5000 })).commessa;
  assert.deepEqual([m.sedeId, m.responsabileId, m.importoContratto], [3, 2, 5000]);
  assert.deepEqual(m.persone, [2, 3]);
  assert.match((await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Responsabile che non c\'e\'', responsabileId: 99 })).errore, /Responsabile 99 non trovato/);
  await manuel('archiviaCommessa', { id: m.id });
  assert.equal((await manuel('anagrafiche')).commesse.some(x => x.id === m.id), false);
  await manuel('ripristinaCommessa', { id: m.id });
  const r = await manuel('aggiornaCommessa', { id: m.id, campi: { stato: 'sospesa' } });
  assert.equal(r.commessa.precedente, 'APERTA');
  assert.equal(r.commessa.cambiato, true);
  assert.equal(r.commessa.stato, 'SOSPESA');
  assert.equal((await manuel('statoCommessa', { idCommessa: m.id, stato: 'CHIUSA' })).commessa.stato, 'CHIUSA');
  assert.equal((await manuel('aggiornaCommessa', { id: m.id, campi: { stato: 'FINITA' } })).errore, 'Stato non valido: FINITA');
});

// ------------------------------------------------------------------ registro e numerazioni

test('il registro: chi, cosa, prima e dopo, solo i campi cambiati; non si cambia', async () => {
  await manuel('aggiornaCliente', { id: 'C002', campi: { email: 'nuova-rossi@example.com', telefono: '0445 999999' } });
  const r = await manuel('registro', { tabella: 'soggetti', idRiga: 'C002' });
  const ultima = r.righe[0];
  assert.equal(ultima.utente, 'Manuel Gasparotto');
  assert.equal(ultima.azione, 'aggiornaCliente');
  assert.equal(ultima.disp, 'prove automatiche');
  assert.deepEqual(ultima.prima, { email: 'rossi@example.com', telefono: '' });
  assert.deepEqual(ultima.dopo, { email: 'nuova-rossi@example.com', telefono: '0445 999999' });
  assert.ok(r.quante >= 2, 'c\'e\' anche la creazione');
  const creato = r.righe[r.righe.length - 1];
  assert.equal(creato.prima, null);
  assert.equal(creato.dopo.nome, 'Rossi Impianti Srl');
  assert.throws(() => s.wisper.db.esegui('UPDATE registro SET utente = ?', 'qualcun altro'), /Il registro non si modifica/);
  assert.throws(() => s.wisper.db.esegui('DELETE FROM registro'), /Il registro non si cancella/);
  const perPersona = await manuel('registro', { utente: 3 });
  assert.ok(perPersona.righe.length >= 2 && perPersona.righe.every(x => x.idUtente === 3), 'i rapportini di Marco');
  const oggi = new Date().toISOString().slice(0, 10);
  assert.ok((await manuel('registro', { da: oggi, a: oggi })).quante > 0);
});

test('numerazioni: si leggono, un formato nuovo vale per i numeri nuovi e il contatore continua', async () => {
  const prima = (await manuel('numerazioni')).numerazioni.find(n => n.tipo === 'commessa');
  const n = Number(prima.prossimo.slice(4));
  const r = await manuel('salvaNumerazione', { tipo: 'commessa', formato: 'ST{AA}-{NNNN}' });
  assert.equal(r.numerazione.prossimo, 'ST26-' + String(n).padStart(4, '0'));
  const m = await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Col formato nuovo' });
  assert.equal(m.commessa.id, 'ST26-' + String(n).padStart(4, '0'));
  assert.ok((await manuel('anagrafiche')).commesse.some(x => x.id === '26ST001'), 'quelle vecchie restano come sono');
  assert.match((await manuel('salvaNumerazione', { tipo: 'commessa', formato: 'ST{AA}' })).errore, /posto per il numero/);
  await manuel('salvaNumerazione', { tipo: 'commessa', formato: '{AA}ST{NNN}' });
  assert.equal((await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Di nuovo 26ST' })).commessa.id, '26ST' + String(n + 1).padStart(3, '0'));
});

// ------------------------------------------------------------------ esportazione

test('esporta: CSV per Excel con punto e virgola, BOM, virgola nei decimali', async () => {
  const r = await manuel('esporta', { cosa: 'rapportini', da: '2026-10-01', a: '2026-10-10' });
  assert.equal(r.nome, 'wisper-rapportini-2026-10-01-2026-10-10.csv');
  const csv = Buffer.from(r.base64, 'base64').toString('utf8');
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const righe = csv.slice(1).trim().split('\r\n');
  const testa = righe[0].split(';');
  assert.equal(testa[0], 'Numero');
  assert.ok(testa.includes('Totale'));
  const riga = righe.find(x => x.startsWith('RAP/2026/0002')).split(';');
  assert.equal(riga[testa.indexOf('Data')], '02/10/2026');
  assert.equal(riga[testa.indexOf('Totale')], '357,46');
  assert.equal(riga[testa.indexOf('Spese')], '14,5');
  const c = Buffer.from((await manuel('esporta', { cosa: 'clienti' })).base64, 'base64').toString('utf8');
  assert.ok(c.includes('Città'));
  assert.ok(c.includes('Elettrodinamica'));
  const f = Buffer.from((await manuel('esporta', { cosa: 'fornitori' })).base64, 'base64').toString('utf8');
  assert.ok(f.includes('Materiale Elettrico Esempio Srl'));
  const m = Buffer.from((await manuel('esporta', { cosa: 'commesse' })).base64, 'base64').toString('utf8');
  assert.ok(m.includes('26ST001;C001;Elettrodinamica;Nuovo magazzino automatico Batokyo'));
  const reg = await manuel('esporta', { cosa: 'registro' });
  assert.ok(reg.righe > 10);
  assert.equal((await manuel('esporta', { cosa: 'boh' })).errore, 'Cosa esportare? rapportini, clienti, fornitori, commesse o registro');
});

// ------------------------------------------------------------------ dashboard

test('dashboard: tre sezioni di voci con gravita e collegamento; per il titolare anche i soldi', async () => {
  const d = await manuel('dashboard');
  assert.equal(d.per, 'titolare');
  for (const k of ['urgenti', 'settimana', 'pianificare']) assert.ok(Array.isArray(d[k]), k);
  const voci = [].concat(d.urgenti, d.settimana, d.pianificare);
  assert.ok(voci.length > 0);
  const pagine = ['dashboard', 'clienti', 'cliente', 'commesse', 'commessa', 'rapportini', 'fatturazione', 'amministrazione'];
  for (const v of voci) {
    assert.ok(['urgente', 'attenzione', 'info', 'soldi'].includes(v.gravita), JSON.stringify(v));
    assert.ok(pagine.includes(v.collegamento.pagina), JSON.stringify(v));
    assert.equal(typeof v.titolo, 'string');
  }
  assert.ok(voci.some(v => v.gravita === 'soldi'), 'ci sono voci di soldi');
  assert.equal(typeof d.numeri.soldi.daFatturare, 'number');
  assert.deepEqual(Object.keys(d.numeri.commesse).sort(), ['aperte', 'chiuse', 'inRitardo', 'sospese']);
  const comeCollaboratore = await manuel('dashboard', { per: 'collaboratore' });
  assert.equal(comeCollaboratore.per, 'collaboratore');
  assert.equal('soldi' in comeCollaboratore.numeri, false);
  // Una commessa in ritardo va negli urgenti.
  const m = (await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'In ritardo', finePrevista: '2026-01-31', inizio: '2026-01-01' })).commessa;
  const dopo = await manuel('dashboard');
  const voce = dopo.urgenti.find(v => v.collegamento.id === m.id);
  assert.equal(voce.gravita, 'urgente');
  assert.match(voce.titolo, /in ritardo/);
  assert.ok(dopo.numeri.commesse.inRitardo >= 1);
});
