// Fase 3: spese, trasferte, rimborsi, veicoli, riepiloghi e le voci nuove della Dashboard.
// I conti condivisi (casi-ore-spese.json), "a chi va", le foto, i soldi della persona che si vedono anche senza
// costi, il rimborso km congelato, i rimborsi dovuti e "segna rimborsato", chi vede e chi scrive.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, PNG } = require('./aiuto');
const C = require('../src/conti');
const { CAMPI_COSTI } = require('../src/permessi');
const { oggi, istante } = require('../src/utili');

const CASI = require('./casi-ore-spese.json');
const MANUEL = 1;
const LAURA = 2;
const MARCO = 3;
const TUTTO = { da: '2026-01-01', a: '2027-12-31' };
const base64 = PNG.toString('base64');

let s;
let manuel;
let laura;
let marco;
let lettura;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
  laura = await s.come('laura@esempio.it');
  marco = await s.come('marco@esempio.it');
  lettura = await s.come('lettura@esempio.it');
});
test.after(() => s.ferma());

function chiavi(x, out) {
  out = out || new Set();
  if (Array.isArray(x)) x.forEach(v => chiavi(v, out));
  else if (x && typeof x === 'object') for (const k of Object.keys(x)) { out.add(k); chiavi(x[k], out); }
  return out;
}
const soldiIn = x => Array.from(chiavi(x)).filter(k => CAMPI_COSTI.has(k)).sort();

// ------------------------------------------------------------------ i conti condivisi

test('rimborso km della trasferta e rimborsi dovuti: tutti i casi di casi-ore-spese.json', () => {
  for (const c of CASI.trasferte) assert.deepEqual(C.rimborsoTrasferta(c.trasferta), c.atteso, c.nome);
  for (const c of CASI.rimborsi) {
    const fatto = C.rimborsiDovuti(c.spese, c.trasferte).map(p => ({ idUtente: p.idUtente, totale: p.totale, inAttesa: p.inAttesa, spese: p.spese, trasferte: p.trasferte, km: p.km }));
    assert.deepEqual(fatto, c.atteso, c.nome);
  }
});

// ------------------------------------------------------------------ spese

test('salvaSpesa: a chi va di base, anticipazione solo al cliente, categorie, importo, errori', async () => {
  const conCommessa = (await manuel('salvaSpesa', { spesa: { data: '2026-11-02', importo: 10.004, idCommessa: '26ST001', categoria: 'pedaggio' } })).spesa;
  assert.deepEqual([conCommessa.destinazione, conCommessa.idCliente, conCommessa.cliente, conCommessa.importo, conCommessa.stato],
    ['cliente', 'C001', 'Elettrodinamica', 10, 'approvata'], 'con la commessa va al cliente; importo al centesimo; il titolare non fa approvare');
  const senza = (await manuel('salvaSpesa', { spesa: { data: '2026-11-02', importo: 5, anticipazione: true } })).spesa;
  assert.deepEqual([senza.destinazione, senza.anticipazione, senza.categoria, senza.pagataDaMe], ['studio', false, 'altro', false]);
  const anticipata = (await manuel('salvaSpesa', { spesa: { data: '2026-11-02', importo: 16, idCliente: 'C002', anticipazione: true } })).spesa;
  assert.deepEqual([anticipata.destinazione, anticipata.anticipazione], ['cliente', true]);
  const mia = (await manuel('salvaSpesa', { spesa: { data: '2026-11-02', importo: 3, destinazione: 'mia' } })).spesa;
  assert.equal(mia.destinazione, 'personale');
  assert.equal((await manuel('salvaSpesa', { spesa: { importo: 5, destinazione: 'cliente' } })).errore, 'Al cliente: scegli la commessa o il cliente');
  assert.equal((await manuel('salvaSpesa', { spesa: { importo: 0 } })).errore, 'Importo: scrivi quanto hai speso');
  assert.equal((await manuel('salvaSpesa', { spesa: {} })).errore, 'Importo: scrivi quanto hai speso');
  assert.equal((await manuel('salvaSpesa', { spesa: { importo: 5, categoria: 'regali' } })).errore,
    'Categoria: carburante, pedaggio, parcheggio, vitto, alloggio, treno, aereo, taxi, materiale o altro');
  assert.equal((await manuel('salvaSpesa', { spesa: { importo: 5, destinazione: 'a qualcuno' } })).errore, 'A chi va: cliente, studio o personale');
  assert.equal((await manuel('salvaSpesa', { spesa: { importo: 5, idCommessa: '26ST999' } })).errore, 'Commessa 26ST999 non trovata');
  assert.equal((await manuel('salvaSpesa', { spesa: { importo: 0, bozza: true } })).spesa.stato, 'bozza', 'una bozza puo\' restare a zero');
  // Cambiare solo alcuni campi: gli altri restano.
  const cambiata = (await manuel('salvaSpesa', { spesa: { id: conCommessa.id, descrizione: 'Pedaggio A4' } })).spesa;
  assert.deepEqual([cambiata.importo, cambiata.categoria, cambiata.descrizione, cambiata.idCommessa], [10, 'pedaggio', 'Pedaggio A4', '26ST001']);
});

test('la foto dello scontrino: si carica, si vede (chi vede la spesa), si toglie nel cestino', async () => {
  const sp = (await marco('salvaSpesa', { spesa: { data: '2026-11-03', importo: 7.2, categoria: 'parcheggio', idCommessa: '26ST001', pagataDaMe: true } })).spesa;
  const f = await marco('caricaFile', { tipo: 'spesa', idSpesa: sp.id, base64, mime: 'image/png', idFile: 'scontrino-prova' });
  assert.equal(f.ok, true, f.errore);
  const ripetuta = await marco('caricaFile', { tipo: 'spesa', idSpesa: sp.id, base64, mime: 'image/png', idFile: 'scontrino-prova' });
  assert.equal(ripetuta.file.id, f.file.id, 'lo stesso idFile non crea doppioni');
  const vista = (await marco('spese', TUTTO)).spese.find(x => x.id === sp.id);
  assert.deepEqual(vista.foto, [{ id: f.file.id, url: '/file/' + f.file.id }]);
  assert.equal((await marco.file(f.file.id)).status, 200);
  assert.equal((await manuel.file(f.file.id)).status, 200);
  const altra = (await manuel('salvaSpesa', { spesa: { importo: 2 } })).spesa;
  const suaFoto = await manuel('caricaFile', { tipo: 'spesa', idSpesa: altra.id, base64, mime: 'image/png', idFile: 'di-manuel' });
  assert.equal((await marco.file(suaFoto.file.id)).status, 403, 'lo scontrino di un altro no');
  assert.equal((await marco('caricaFile', { tipo: 'spesa', idSpesa: altra.id, base64 })).errore, 'Spesa ' + altra.id + ' non trovata');
  assert.equal((await lettura('caricaFile', { tipo: 'spesa', idSpesa: sp.id, base64 })).permesso, false);
  const tolta = await marco('togliFotoSpesa', { id: f.file.id });
  assert.deepEqual(tolta.spesa.foto, []);
  assert.ok((await manuel('cestino')).file.some(x => x.id === f.file.id && x.idSpesa === sp.id));
});

test('collaboratore: vede e scrive solo le sue spese e trasferte, e vede i suoi soldi anche senza "costi"', async () => {
  const sue = await marco('spese', TUTTO);
  assert.ok(sue.spese.length >= 4);
  assert.ok(sue.spese.every(x => x.idUtente === MARCO));
  assert.ok(sue.spese.every(x => typeof x.importo === 'number'), 'l\'importo di quello che ha speso lui si vede');
  assert.deepEqual(soldiIn(sue), ['importo'], 'e nient\'altro di soldi');
  const tr = await marco('trasferte', TUTTO);
  assert.ok(tr.trasferte.length >= 1 && tr.trasferte.every(t => t.idUtente === MARCO));
  assert.deepEqual(['euroKm', 'rimborsoKm', 'totale'].map(k => typeof tr.trasferte[0][k]), ['number', 'number', 'number'], 'il suo rimborso si vede');
  const r = await marco('rimborsi', {});
  assert.deepEqual(r.persone.map(p => p.idUtente), [MARCO]);
  assert.equal(typeof r.persone[0].totale, 'number');
  assert.equal(r.puoSegnare, false);
  const v = await marco('veicoli', {});
  assert.equal(v.veicoli[0].euroKm, 0.76, 'l\'euro al km del veicolo (tabella ACI) si vede: decide il suo rimborso');
  // Le cose degli altri: non si vedono e non si toccano.
  const diManuel = (await manuel('spese', TUTTO)).spese.find(x => x.idUtente === MANUEL);
  assert.equal((await marco('salvaSpesa', { spesa: { id: diManuel.id, importo: 1 } })).errore, 'Spesa ' + diManuel.id + ' non trovata');
  assert.equal((await marco('togliSpesa', { id: diManuel.id })).errore, 'Spesa ' + diManuel.id + ' non trovata');
  assert.equal((await marco('salvaSpesa', { spesa: { idUtente: MANUEL, importo: 1 } })).permesso, false);
  assert.equal((await marco('salvaTrasferta', { trasferta: { idUtente: MANUEL, destinazione: 'X' } })).permesso, false);
  assert.equal((await marco('segnaRimborsato', { idUtente: MARCO })).permesso, false);
  assert.equal((await marco('salvaVeicolo', { veicolo: { nome: 'X', euroKm: 1 } })).permesso, false);
  assert.ok((await marco('riepilogoSpese', Object.assign({ per: 'persona' }, TUTTO))).righe.every(g => g.chiave === MARCO));
  // Una sua spesa approvata non la cambia piu'.
  const approvata = sue.spese.find(x => x.stato === 'approvata' && !x.idRapportino);
  assert.equal((await marco('salvaSpesa', { spesa: { id: approvata.id, importo: 99 } })).errore, 'È già approvata: per cambiarla chiedi a chi approva');
  // Lettura vede tutto e non scrive.
  assert.ok((await lettura('spese', TUTTO)).spese.some(x => x.idUtente === MANUEL));
  for (const [azione, dati] of [['salvaSpesa', { spesa: { importo: 1 } }], ['salvaTrasferta', { trasferta: { destinazione: 'X' } }],
    ['togliSpesa', { id: 1 }], ['togliTrasferta', { id: 1 }], ['segnaRimborsato', { idUtente: 1 }], ['salvaVeicolo', { veicolo: { nome: 'X' } }]]) {
    assert.equal((await lettura(azione, dati)).permesso, false, azione);
  }
});

test('elenco delle spese: il mese di base, i tre riquadri, i filtri', async () => {
  const mese = await manuel('spese', {});
  assert.equal(mese.da, oggi().slice(0, 7) + '-01');
  assert.ok(mese.spese.length >= 8, 'quelle dei dati di esempio');
  const t = mese.totali;
  assert.equal(t.cliente, Math.round(mese.spese.filter(x => x.destinazione === 'cliente' && x.stato !== 'respinta').reduce((a, x) => a + x.importo, 0) * 100) / 100);
  assert.ok(t.studio > 0 && t.personale > 0 && t.daRimborsare > 0);
  assert.ok(mese.spese.some(x => x.anticipazione), 'un\'anticipazione');
  assert.ok(mese.spese.some(x => x.foto.length) && mese.spese.some(x => !x.foto.length), 'con e senza foto');
  for (const d of ['cliente', 'studio', 'personale']) {
    const f = await manuel('spese', { destinazione: d });
    assert.ok(f.spese.length && f.spese.every(x => x.destinazione === d), d);
  }
  assert.ok((await manuel('spese', { utente: LAURA })).spese.every(x => x.idUtente === LAURA));
  assert.ok((await manuel('spese', { commessa: 'studio' })).spese.every(x => x.idCommessa === ''));
  assert.ok((await manuel('spese', { stato: 'da_approvare' })).spese.every(x => x.stato === 'da_approvare'));
  assert.equal((await manuel('spese', { stato: 'boh' })).errore, 'Stato: bozza, da_approvare, approvata, respinta o tutte');
});

// ------------------------------------------------------------------ trasferte e veicoli

test('trasferta: rimborso km dal veicolo, congelato quando cambia l\'euro al km; andata e ritorno; indennita\' di base', async () => {
  const t = (await manuel('salvaTrasferta', { trasferta: { dal: '2026-11-04', destinazione: 'Thiene, Rossi Impianti', idCommessa: '26ST002', km: 60, andataRitorno: true } })).trasferta;
  assert.deepEqual([t.idVeicolo, t.veicolo, t.euroKm, t.kmTotali, t.rimborsoKm, t.indennita, t.totale, t.al, t.giorni, t.stato],
    [1, 'Volvo XC40', 0.76, 120, 91.2, 0, 91.2, '2026-11-04', 1, 'approvata']);
  const v = await manuel('salvaVeicolo', { veicolo: { id: 1, euroKm: 0.8 } });
  assert.equal(v.veicolo.euroKm, 0.8);
  const ancora = (await manuel('trasferte', { da: '2026-11-04', a: '2026-11-04' })).trasferte.find(x => x.id === t.id);
  assert.deepEqual([ancora.euroKm, ancora.rimborsoKm], [0.76, 91.2], 'la trasferta gia\' scritta tiene il suo euro al km');
  const cambiata = (await manuel('salvaTrasferta', { trasferta: { id: t.id, km: 50 } })).trasferta;
  assert.deepEqual([cambiata.euroKm, cambiata.rimborsoKm], [0.76, 76], 'anche cambiandola, se il veicolo e\' lo stesso');
  const nuova = (await manuel('salvaTrasferta', { trasferta: { dal: '2026-11-05', destinazione: 'Schio', km: 60, andataRitorno: true } })).trasferta;
  assert.deepEqual([nuova.euroKm, nuova.rimborsoKm], [0.8, 96], 'una nuova prende quello di adesso');
  const furgone = (await manuel('salvaVeicolo', { veicolo: { nome: 'Furgone di prova', alimentazione: 'gasolio', euroKm: 0.5432 } })).veicolo;
  const altroVeicolo = (await manuel('salvaTrasferta', { trasferta: { id: t.id, idVeicolo: furgone.id } })).trasferta;
  assert.deepEqual([altroVeicolo.veicolo, altroVeicolo.euroKm, altroVeicolo.rimborsoKm], ['Furgone di prova', 0.5432, 54.32], 'cambiato il veicolo: il suo');
  await manuel('salvaVeicolo', { veicolo: { id: 1, euroKm: 0.76 } });
  // L'indennita' di base: INDENNITA_TRASFERTA per ogni giorno.
  await manuel('salvaImpostazioni', { valori: { INDENNITA_TRASFERTA: 46.48 } });
  const due = (await manuel('salvaTrasferta', { trasferta: { dal: '2026-11-09', al: '2026-11-10', destinazione: 'Milano, fiera', km: 0 } })).trasferta;
  assert.deepEqual([due.giorni, due.indennita, due.totale], [2, 92.96, 92.96]);
  await manuel('salvaImpostazioni', { valori: { INDENNITA_TRASFERTA: '' } });
  // Errori.
  assert.equal((await manuel('salvaTrasferta', { trasferta: { km: 10 } })).errore, 'Destinazione: scrivi dove sei andato');
  assert.equal((await manuel('salvaTrasferta', { trasferta: { destinazione: 'X', dal: '2026-11-10', al: '2026-11-09' } })).errore, 'Al: non può venire prima della partenza');
  assert.equal((await manuel('salvaTrasferta', { trasferta: { destinazione: 'X', km: -3 } })).errore, 'Km: non possono essere negativi');
  assert.equal((await manuel('salvaTrasferta', { trasferta: { destinazione: 'X', km: 3, idVeicolo: 99 } })).errore, 'Veicolo 99 non trovato');
  assert.equal((await manuel('salvaVeicolo', { veicolo: { nome: '' } })).errore, 'Nome: scrivi il nome del veicolo');
  assert.equal((await manuel('salvaVeicolo', { veicolo: { nome: 'X', euroKm: -1 } })).errore, 'Euro al km: non può essere negativo');
  assert.equal((await manuel('salvaVeicolo', { veicolo: { nome: 'X', annoAci: 26 } })).errore, 'Anno ACI: scrivi l\'anno delle tabelle, per esempio 2026');
  // Una trasferta con le sue spese: non si toglie finche' ha spese.
  const sp = (await manuel('salvaSpesa', { spesa: { idTrasferta: due.id, importo: 18, categoria: 'treno' } })).spesa;
  assert.equal(sp.idTrasferta, due.id);
  assert.deepEqual((await manuel('trasferte', { da: '2026-11-09', a: '2026-11-09' })).trasferte[0].spese.map(x => x.id), [sp.id]);
  assert.equal((await manuel('togliTrasferta', { id: due.id })).errore, 'La trasferta ha 1 spesa: prima toglile o spostale');
  await manuel('togliSpesa', { id: sp.id });
  assert.ok((await manuel('togliTrasferta', { id: due.id })).trasferta.tolta);
  assert.equal((await manuel('togliTrasferta', { id: due.id, annulla: true })).trasferta.tolta, '');
  const veicoli = await manuel('veicoli', { tutti: true });
  assert.deepEqual([veicoli.aciAnno, veicoli.paginaAci], [2026, 'https://www.aci.it/']);
  assert.ok(veicoli.veicoli.find(x => x.id === 1).trasferte >= 3);
});

// ------------------------------------------------------------------ rimborsi

test('rimborsi dovuti e "segna rimborsato" (titolare e amministrazione), con Annulla; una rimborsata non cambia', async () => {
  const r = await manuel('rimborsi', {});
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.puoSegnare, true);
  const di = id => r.persone.find(p => p.idUtente === id);
  assert.ok(di(MANUEL).totale > 0 && di(LAURA).totale === 9.8, 'Laura: il treno si\', il pranzo "Mia" no');
  assert.ok(di(MANUEL).voci.some(v => v.tipo === 'trasferta'), 'la trasferta di Manuel');
  assert.equal(r.totale, Math.round(r.persone.reduce((a, p) => a + p.totale, 0) * 100) / 100);
  const marcoPrima = di(MARCO);
  assert.ok(marcoPrima.inAttesa > 0, 'le cose di Marco ancora da approvare');
  // Segna rimborsato tutto quello di Laura (lo fa Laura, amministrazione).
  const fatto = await laura('segnaRimborsato', { idUtente: LAURA });
  assert.deepEqual([fatto.ok, fatto.fatte, fatto.totale], [true, 1, 9.8]);
  assert.equal((await manuel('rimborsi', {})).persone.some(p => p.idUtente === LAURA), false);
  const treno = (await manuel('spese', Object.assign({ utente: LAURA }, TUTTO))).spese.find(x => x.categoria === 'treno');
  assert.ok(treno.rimborsataIl);
  assert.deepEqual([treno.puoScrivere, treno.bloccata.endsWith(': non si cambia')], [false, true]);
  assert.match((await manuel('salvaSpesa', { spesa: { id: treno.id, importo: 1 } })).errore, /^Rimborsata il \d{2}\/\d{2}\/\d{4}: non si cambia$/);
  assert.match((await manuel('togliSpesa', { id: treno.id })).errore, /^Rimborsata il/);
  // Annulla.
  const annulla = await laura('segnaRimborsato', { voci: [{ tipo: 'spesa', id: treno.id }], annulla: true });
  assert.equal(annulla.fatte, 1);
  assert.equal((await manuel('rimborsi', {})).persone.find(p => p.idUtente === LAURA).totale, 9.8);
  // Non si rimborsa quello che non e' dovuto.
  const nonPagata = (await manuel('spese', TUTTO)).spese.find(x => !x.pagataDaMe && x.stato === 'approvata');
  assert.match((await manuel('segnaRimborsato', { voci: [{ tipo: 'spesa', id: nonPagata.id }] })).errore, /non l'ha pagata chi l'ha scritta/);
  const mia = (await manuel('spese', Object.assign({ destinazione: 'personale', utente: LAURA }, TUTTO))).spese[0];
  assert.match((await manuel('segnaRimborsato', { voci: [{ tipo: 'spesa', id: mia.id }] })).errore, /è "Mia": non si rimborsa$/);
  const inAttesa = (await manuel('spese', Object.assign({ stato: 'da_approvare', utente: MARCO }, TUTTO))).spese.find(x => x.pagataDaMe);
  assert.match((await manuel('segnaRimborsato', { voci: [{ tipo: 'spesa', id: inAttesa.id }] })).errore, /non è ancora approvata$/);
  assert.equal((await manuel('segnaRimborsato', { idUtente: LETTURA_ID() })).errore, 'Non c\'è niente da rimborsare a questa persona');
});
const LETTURA_ID = () => 4;

test('riepilogo spese per persona, per commessa e per categoria (trasferte comprese)', async () => {
  const p = await manuel('riepilogoSpese', { per: 'persona' });
  assert.equal(p.ok, true, p.errore);
  const m = p.righe.find(g => g.chiave === MANUEL);
  assert.ok(m.quante >= 5 && m.cliente > 0 && m.studio > 0 && m.trasferte >= 1 && m.rimborsoKm > 0);
  assert.equal(m.totale, Math.round((m.cliente + m.studio + m.rimborsoKm + m.indennita) * 100) / 100, 'totale = cliente + studio + trasferte (le "Mia" no)');
  assert.ok(m.anticipazioni >= 52);
  const com = await manuel('riepilogoSpese', { per: 'commessa' });
  assert.ok(com.righe.some(g => g.chiave === '26ST001' && g.km > 0));
  assert.ok(com.righe.some(g => g.chiave === '' && g.nome === 'Senza commessa'));
  // Il nome del cliente non copre la somma al cliente (difetto trovato dal telefono il 22/10/2026).
  const c1 = com.righe.find(g => g.chiave === '26ST001');
  assert.equal(typeof c1.cliente, 'number');
  assert.equal(typeof c1.totale, 'number');
  assert.ok(c1.nomeCliente.length > 0);
  assert.equal(com.totale.cliente, p.totale.cliente, 'per commessa lo stesso totale al cliente');
  assert.equal(com.totale.totale, p.totale.totale, 'per commessa lo stesso totale');
  const cat = await manuel('riepilogoSpese', { per: 'categoria' });
  assert.ok(cat.righe.some(g => g.chiave === 'pedaggio') && cat.righe.every(g => g.trasferte === 0));
  assert.equal(cat.totale.cliente, p.totale.cliente, 'lo stesso totale da ogni lato');
  assert.equal((await manuel('riepilogoSpese', { per: 'mese' })).errore, 'Per: persona, commessa o categoria');
});

// ------------------------------------------------------------------ la Dashboard

test('dashboard: cose da approvare, respinte per chi ha scritto, rimborsi; il collaboratore senza soldi', async () => {
  const d = await manuel('dashboard');
  const appr = d.urgenti.find(v => v.tipo === 'approvare');
  assert.ok(appr, 'cose da approvare');
  assert.match(appr.titolo, /^\d+ cose da approvare di Marco Collaboratore$/);
  assert.match(appr.dettaglio, /con un'anomalia$/);
  assert.deepEqual([appr.gravita, appr.unita, appr.collegamento], ['attenzione', 'voci', { pagina: 'rapportini', filtro: { segmento: 'daApprovare' } }]);
  assert.equal(d.numeri.approvare.voci, appr.quanto);
  const rimb = d.settimana.find(v => v.tipo === 'rimborsi');
  assert.deepEqual([rimb.gravita, rimb.unita, rimb.collegamento], ['soldi', 'euro', { pagina: 'spese', filtro: { segmento: 'rimborsi' } }]);
  assert.equal(rimb.quanto, d.numeri.rimborsi.daFare);
  assert.equal(typeof d.numeri.ore.settimana, 'number');
  const m = await marco('dashboard');
  const resp = m.urgenti.find(v => v.tipo === 'respinta');
  assert.ok(resp, 'le ore respinte dei dati di esempio');
  assert.match(resp.titolo, /^Ore del \d{2}\/\d{2} respinte$/);
  assert.equal(resp.dettaglio, 'Motivo: Il riordino del magazzino non si segna: è dentro le ore di studio · Manuel Gasparotto');
  assert.equal(m.urgenti.some(v => v.tipo === 'approvare'), false, 'il collaboratore non approva');
  assert.equal('rimborsi' in m.numeri, false);
  assert.equal('approvare' in m.numeri, false);
  assert.equal(JSON.stringify(m).includes('€'), false);
  assert.deepEqual(soldiIn(m), []);
  // Lettura con costi a zero: niente soldi nemmeno qui.
  await manuel('salvaPermessi', { permessi: { lettura: { costi: 0 } } });
  try {
    assert.deepEqual(soldiIn(await lettura('dashboard')), []);
    assert.equal((await lettura('dashboard')).settimana.some(v => v.tipo === 'rimborsi'), false);
  } finally {
    await manuel('salvaPermessi', { permessi: { lettura: { costi: 1 } } });
  }
});

test('dashboard: il timer acceso da piu\' di 10 ore (per chi l\'ha acceso e per chi approva); a gennaio le tabelle ACI', async () => {
  s.wisper.db.esegui('UPDATE timer SET partito_il = ? WHERE utente_id = ?', istante(new Date(Date.now() - 11 * 3600000 - 60000)), MARCO);
  const m = await marco('dashboard');
  const suo = m.urgenti.find(v => v.tipo === 'timer');
  assert.ok(suo, 'il suo timer');
  assert.equal(suo.titolo, 'Il timer è acceso da 11 ore');
  assert.match(suo.dettaglio, /^26ST001 · dalle \d{1,2}:\d{2}( del \d{2}\/\d{2})? · fermalo e correggi le ore$/);
  assert.equal((await manuel('dashboard')).urgenti.find(v => v.tipo === 'timer').titolo, 'Il timer di Marco Collaboratore è acceso da 11 ore');
  assert.equal((await laura('dashboard')).urgenti.some(v => v.tipo === 'timer'), true, 'amministrazione approva: lo vede');
  // L'anno nuovo: le tabelle ACI dei veicoli sono vecchie.
  const anno = Number(oggi().slice(0, 4));
  await manuel('salvaImpostazioni', { valori: { ACI_ANNO: anno - 1 } });
  s.wisper.db.esegui('UPDATE veicoli SET anno_aci = ?', anno - 1);
  const d = await manuel('dashboard');
  const aci = d.settimana.find(v => v.tipo === 'veicoli');
  assert.ok(aci);
  assert.equal(aci.titolo, 'Aggiorna il rimborso km con le tabelle ACI ' + anno);
  assert.deepEqual(aci.collegamento, { pagina: 'amministrazione', filtro: { sezione: 'veicoli' } });
  assert.equal((await laura('dashboard')).settimana.some(v => v.tipo === 'veicoli'), false, 'lo chiede a chi cambia i veicoli');
  for (const v of (await manuel('veicoli', { tutti: true })).veicoli) await manuel('salvaVeicolo', { veicolo: { id: v.id, annoAci: anno } });
  assert.equal((await manuel('io')).ok, true);
  assert.equal(Number((await manuel('anagrafiche')).impostazioni.ACI_ANNO), anno, 'ACI_ANNO segue il veicolo');
  assert.equal((await manuel('dashboard')).settimana.some(v => v.tipo === 'veicoli'), false);
});

// ------------------------------------------------------------------ esportazione e registro

test('esporta spese, trasferte e rimborsi; nel registro prima e dopo', async () => {
  const sp = Buffer.from((await manuel('esporta', { cosa: 'spese' })).base64, 'base64').toString('utf8');
  const testa = sp.slice(1).split('\r\n')[0].split(';');
  assert.deepEqual(testa.slice(0, 6), ['Data', 'Persona', 'Categoria', 'Descrizione', 'Importo', 'A chi va']);
  assert.ok(sp.includes('Diritti di segreteria del Comune;52;Al cliente;Sì;Sì'));
  const suo = Buffer.from((await marco('esporta', { cosa: 'spese' })).base64, 'base64').toString('utf8');
  assert.ok(suo.includes('Importo'), 'i suoi importi li esporta');
  assert.equal(suo.includes('Gasolio'), false, 'quelle degli altri no');
  const tr = Buffer.from((await manuel('esporta', { cosa: 'trasferte' })).base64, 'base64').toString('utf8');
  assert.ok(tr.includes('Schio, cantiere Batokyo;Riunione di cantiere;26ST001'));
  assert.ok(tr.slice(1).split('\r\n')[0].includes('Rimborso km'));
  const rb = await manuel('esporta', { cosa: 'rimborsi' });
  assert.equal(rb.ok, true, rb.errore);
  assert.ok(Buffer.from(rb.base64, 'base64').toString('utf8').startsWith('﻿Persona;Tipo;Data;Descrizione;Codice commessa;Km;Importo'));
  assert.equal((await lettura('esporta', { cosa: 'spese' })).ok, true);
  const reg = await manuel('registro', { tabella: 'trasferte' });
  assert.ok(reg.righe.some(x => x.prima === null && x.dopo.destinazione === 'Schio, cantiere Batokyo'), 'una riga nuova');
  assert.ok(reg.righe.some(x => x.prima && 'euro_km' in x.prima || (x.dopo && 'km' in x.dopo && x.prima)), 'un cambio con prima e dopo');
});

test('la stessa spesa e le stesse ore mandate due volte dalla coda del telefono non fanno doppioni', async () => {
  const spesa = { data: '2026-10-20', importo: 7.5, categoria: 'parcheggio', descrizione: 'Parcheggio stazione', idLocale: 'tel-prova-spesa-1' };
  const a = await marco('salvaSpesa', { spesa });
  assert.equal(a.ok, true, a.errore);
  const b = await marco('salvaSpesa', { spesa });
  assert.equal(b.ok, true, b.errore);
  assert.equal(b.spesa.id, a.spesa.id, 'la seconda volta restituisce la stessa spesa');
  const elenco = await marco('spese', { da: '2026-10-01', a: '2026-10-31' });
  assert.equal(elenco.spese.filter(s => s.descrizione === 'Parcheggio stazione').length, 1);

  const riga = { data: '2026-10-20', ore: 2, descrizione: 'Ore dalla coda', idLocale: 'tel-prova-ore-1' };
  const o1 = await marco('salvaOre', { riga });
  assert.equal(o1.ok, true, o1.errore);
  const o2 = await marco('salvaOre', { riga });
  assert.equal(o2.ok, true, o2.errore);
  assert.equal(o2.riga.id, o1.riga.id);
  const ore = await marco('ore', { da: '2026-10-20', a: '2026-10-20' });
  assert.equal(ore.ore.filter(r => r.descrizione === 'Ore dalla coda').length, 1);
});
