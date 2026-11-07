// Fase 3: ore senza rapportino, timer, approvazioni, statistiche, costo della commessa.
// I conti condivisi (casi-ore-spese.json), le regole di salvataggio, chi vede e chi scrive, il timer che sopravvive
// al riavvio, l'approvazione con motivo obbligatorio e Annulla, il rapportino da approvare che non si manda.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva, cartellaNuova } = require('./aiuto');
const C = require('../src/conti');
const { CAMPI_COSTI } = require('../src/permessi');
const { Wisper } = require('../src/wisper');
const { oggi, piuGiorni, istante, dataOraIso, adessoMs } = require('../src/utili');

const CASI = require('./casi-ore-spese.json');

// Le date delle prove sono quelle del giorno in cui sono state scritte (22/10/2026), spostate di quanti giorni oggi e' dopo:
// restano nei giorni che vengono, lontane dalle righe dei dati di esempio (gli ultimi giorni feriali), qualunque giorno sia
// oggi (anche con l'orologio di prova, WISPER_OGGI_PROVA). Il 22/10/2026 sono proprio quelle scritte.
const SPOSTA = Math.round((Date.parse(oggi() + 'T12:00:00') - Date.parse('2026-10-22T12:00:00')) / 86400000);
const giorno = iso => piuGiorni(iso, SPOSTA);
const ggmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const MANUEL = 1;
const MARCO = 3;

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
const soldiIn = x => Array.from(chiavi(x)).filter(k => CAMPI_COSTI.has(k));
const tutteLeVoci = da => [].concat(...da.persone.map(p => p.voci));

// ------------------------------------------------------------------ i conti condivisi

test('ore da inizio, fine e pausa: tutti i casi di casi-ore-spese.json (anche a cavallo della mezzanotte)', () => {
  assert.ok(CASI.ore.length >= 12);
  for (const c of CASI.ore) {
    if (c.errore) {
      assert.throws(() => C.oreDaOrari(c.inizio, c.fine, c.pausaMinuti), e => e.message === c.errore, c.nome);
    } else {
      assert.deepEqual(C.oreDaOrari(c.inizio, c.fine, c.pausaMinuti), c.atteso, c.nome);
    }
  }
});

// ------------------------------------------------------------------ registrare le ore

test('salvaOre: da inizio/fine/pausa o a mano; il titolare e\' gia\' approvato, il collaboratore va in approvazione', async () => {
  const n = await manuel('salvaOre', { riga: { data: giorno('2026-11-02'), idCommessa: '26ST002', inizio: '22:00', fine: '06:00', pausaMinuti: 30, descrizione: 'Prova notturna' } });
  assert.equal(n.ok, true, n.errore);
  const r = n.riga;
  assert.deepEqual([r.ore, r.giornoDopo, r.data, r.inizio, r.fine, r.pausaMinuti], [7.5, true, giorno('2026-11-02'), '22:00', '06:00', 30]);
  assert.deepEqual([r.stato, r.idUtente, r.utente, r.fatturabile, r.tipo, r.dalTimer], ['approvata', MANUEL, 'Manuel Gasparotto', true, 'ordinaria', false]);
  assert.deepEqual([r.idCommessa, r.commessa, r.idCliente, r.cliente], ['26ST002', 'Quadro elettrico capannone', 'C002', 'Rossi Impianti Srl']);
  assert.deepEqual([r.costoOrario, r.costo], [25, 187.5], 'il costo orario della commessa, congelato');
  assert.equal(r.puoScrivere, true);
  const m = await marco('salvaOre', { riga: { data: giorno('2026-11-02'), idCommessa: '26ST001', ore: 2.5, descrizione: 'Disegni' } });
  assert.equal(m.ok, true, m.errore);
  assert.deepEqual([m.riga.stato, m.riga.ore, m.riga.inizio, m.riga.fine], ['da_approvare', 2.5, '', '']);
  assert.equal('costoOrario' in m.riga, false, 'senza costi niente costo orario');
  assert.equal('costo' in m.riga, false);
  // Studio (senza commessa): di base non fatturabile, costo orario delle impostazioni.
  const studio = (await manuel('salvaOre', { riga: { data: giorno('2026-11-02'), ore: 1 } })).riga;
  assert.deepEqual([studio.idCommessa, studio.fatturabile, studio.costoOrario], ['', false, 15]);
  // Errori.
  assert.equal((await manuel('salvaOre', { riga: { data: giorno('2026-11-02'), ore: 0 } })).errore, 'Ore: scrivi quante ore hai lavorato');
  assert.equal((await manuel('salvaOre', { riga: { data: giorno('2026-11-02'), inizio: '08:00' } })).errore, 'Scrivi l\'inizio e la fine, oppure solo le ore');
  assert.equal((await manuel('salvaOre', { riga: { data: giorno('2026-11-02'), ore: 25 } })).errore, 'Ore: da 0 a 24');
  assert.equal((await manuel('salvaOre', { riga: { ore: 1, idCommessa: '26ST999' } })).errore, 'Commessa 26ST999 non trovata');
  assert.equal((await manuel('salvaOre', { riga: { ore: 1, tipo: 'notturna' } })).errore, 'Tipo: ordinaria o straordinaria');
  assert.equal((await manuel('salvaOre', { riga: { inizio: '08:00', fine: '08:00' } })).errore, 'Fine: deve essere diversa dall\'inizio');
  // Una bozza puo' avere zero ore (il timer appena fermato).
  const bozza = await manuel('salvaOre', { riga: { data: giorno('2026-11-03'), ore: 0, bozza: true } });
  assert.equal(bozza.riga.stato, 'bozza');
});

test('il costo orario resta quello del giorno in cui la riga nasce; si rifa\' solo se cambia la commessa', async () => {
  const r = (await manuel('salvaOre', { riga: { data: giorno('2026-11-04'), idCommessa: '26ST002', ore: 2 } })).riga;
  assert.equal(r.costoOrario, 25);
  await manuel('aggiornaCommessa', { id: '26ST002', campi: { costoOrario: 40 } });
  const stessa = (await manuel('salvaOre', { riga: { id: r.id, ore: 3, descrizione: 'cambiata' } })).riga;
  assert.deepEqual([stessa.costoOrario, stessa.costo], [25, 75], 'cambiare la commessa dopo non riscrive le ore gia\' scritte');
  const altra = (await manuel('salvaOre', { riga: { id: r.id, idCommessa: '26ST001' } })).riga;
  assert.equal(altra.costoOrario, 22, 'commessa cambiata: il costo fisso di Elettrodinamica');
  await manuel('aggiornaCommessa', { id: '26ST002', campi: { costoOrario: 25 } });
});

test('ore: il collaboratore vede e scrive solo le sue; si tolgono e si rimettono', async () => {
  const sue = await marco('ore', { da: '2026-01-01', a: piuGiorni(oggi(), 400), utente: MANUEL });
  assert.ok(sue.ore.length >= 5);
  assert.ok(sue.ore.every(o => o.idUtente === MARCO), 'anche chiedendo quelle di Manuel');
  assert.deepEqual(soldiIn(sue), []);
  const diManuel = (await manuel('ore', { da: giorno('2026-11-02'), a: giorno('2026-11-02'), utente: MANUEL })).ore[0];
  assert.equal((await marco('salvaOre', { riga: { id: diManuel.id, ore: 1 } })).errore, 'Ore ' + diManuel.id + ' non trovate');
  assert.equal((await marco('togliOre', { id: diManuel.id })).errore, 'Ore ' + diManuel.id + ' non trovate');
  assert.equal((await marco('salvaOre', { riga: { idUtente: MANUEL, ore: 1 } })).permesso, false);
  // Laura (amministrazione) scrive anche per gli altri; lettura no.
  const perMarco = await laura('salvaOre', { riga: { idUtente: MARCO, data: giorno('2026-11-05'), ore: 1, idCommessa: '26ST001' } });
  assert.equal(perMarco.riga.idUtente, MARCO);
  assert.equal(perMarco.riga.stato, 'da_approvare', 'sono ore di un collaboratore');
  assert.equal((await lettura('salvaOre', { riga: { ore: 1 } })).permesso, false);
  assert.equal((await lettura('ore', {})).ok, true);
  // Togliere e Annulla.
  const tolta = await marco('togliOre', { id: perMarco.riga.id });
  assert.ok(tolta.riga.tolta);
  assert.equal((await marco('ore', { da: giorno('2026-11-05'), a: giorno('2026-11-05') })).ore.length, 0);
  const rimessa = await marco('togliOre', { id: perMarco.riga.id, annulla: true });
  assert.equal(rimessa.riga.tolta, '');
  // La settimana: i giorni uno per uno, con le ore dei rapportini.
  const settimana = await manuel('ore', {});
  assert.equal(settimana.giorni.length, 7);
  assert.equal(settimana.oreGiornaliere, 8);
  assert.ok(settimana.giorni.every(g => typeof g.ore === 'number' && typeof g.oreRapportini === 'number'));
});

test('ore approvate: il collaboratore non le cambia piu\', chi approva si\'', async () => {
  const r = (await marco('salvaOre', { riga: { data: giorno('2026-11-06'), ore: 4, idCommessa: '26ST001' } })).riga;
  await manuel('approva', { voci: [{ tipo: 'ore', id: r.id }] });
  const no = await marco('salvaOre', { riga: { id: r.id, ore: 5 } });
  assert.equal(no.errore, 'Sono già approvate: per cambiarle chiedi a chi approva');
  assert.equal((await marco('togliOre', { id: r.id })).errore, 'Sono già approvate: per toglierle chiedi a chi approva');
  const lista = (await marco('ore', { da: giorno('2026-11-06'), a: giorno('2026-11-06') })).ore[0];
  assert.deepEqual([lista.puoScrivere, lista.bloccata], [false, 'Sono già approvate: per cambiarle chiedi a chi approva']);
  const si = await manuel('salvaOre', { riga: { id: r.id, ore: 5 } });
  assert.deepEqual([si.riga.ore, si.riga.stato], [5, 'approvata'], 'chi approva corregge e lo stato resta');
});

// ------------------------------------------------------------------ il timer

test('il timer: uno per persona, si vede in cima, fermarlo crea la bozza da correggere', async () => {
  const t = await marco('timer');
  assert.equal(t.ok, true);
  assert.equal(t.timer.idCommessa, '26ST001', 'quello acceso dei dati di esempio');
  assert.ok(t.timer.secondi >= 89 * 60, 'acceso da un\'ora e mezza');
  assert.match(t.adesso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  const due = await marco('avviaTimer', { idCommessa: '26ST002' });
  assert.equal(due.ok, false);
  assert.match(due.errore, /^Il timer è già acceso dalle \d{2}:\d{2} \(26ST001\): fermalo prima di avviarne un altro$/);
  assert.equal(due.timer.idCommessa, '26ST001');
  // Ognuno il suo.
  assert.equal((await laura('timer')).timer, null);
  assert.equal((await laura('avviaTimer', { idCommessa: '26ST002', descrizione: 'Pratica' })).timer.idCommessa, '26ST002');
  assert.equal((await laura('fermaTimer')).ok, true);
  assert.equal((await lettura('avviaTimer', {})).permesso, false);
  // Fermarlo: la riga in bozza, dal giorno e dall'ora in cui e' partito.
  const partito = t.timer.partitoIl;
  const f = await marco('fermaTimer');
  assert.equal(f.ok, true, f.errore);
  assert.equal(f.timer, null);
  const r = f.riga;
  assert.deepEqual([r.stato, r.dalTimer, r.idCommessa, r.descrizione, r.inizio, r.data], ['bozza', true, '26ST001', 'Cablaggio quadro di linea 3', partito.slice(11, 16), partito.slice(0, 10)]);
  assert.ok(r.ore >= 1.48 && r.ore <= 1.55, 'circa un\'ora e mezza: ' + r.ore);
  assert.equal(r.ore, C.oreDaOrari(r.inizio, r.fine, 0).ore, 'le ore seguono la regola di inizio e fine');
  assert.equal((await marco('timer')).timer, null);
  assert.equal((await marco('fermaTimer')).errore, 'Il timer non è acceso');
  // La bozza si corregge e si manda.
  const mandata = await marco('salvaOre', { riga: { id: r.id, pausaMinuti: 0, descrizione: 'Cablaggio quadro di linea 3, prima parte' } });
  assert.equal(mandata.riga.stato, 'da_approvare');
  const reg = await manuel('registro', { tabella: 'timer' });
  assert.ok(reg.righe.some(x => x.nota.startsWith('fermato: ore ' + r.id)), 'nel registro');
});

test('il timer sopravvive al riavvio del server; acceso da piu\' di un giorno non indovina le ore', () => {
  const dati = cartellaNuova('timer');
  let w = new Wisper({ dati });
  w.db.esegui("INSERT INTO utenti (id, nome, email, ruolo, password_hash, attivo, creato) VALUES (7, 'Mario Bianchi', 'mario@esempio.it', 'collaboratore', '', 1, '2026-10-01T08:00:00+02:00')");
  const chi = { utente: { id: 7, nome: 'Mario Bianchi', ruolo: 'collaboratore' }, permessi: w.permessiDi('collaboratore') };
  w.come(chi, () => w.db.transazione(() => w.avviaTimer({ descrizione: 'Ufficio' })));
  w.chiudi();
  w = new Wisper({ dati });
  const dopo = w.come(chi, () => w.statoTimer());
  assert.equal(dopo.timer.descrizione, 'Ufficio', 'dopo il riavvio il timer e\' ancora li\'');
  // Due ore fa: la bozza ha due ore.
  w.db.esegui('UPDATE timer SET partito_il = ? WHERE utente_id = 7', istante(new Date(adessoMs() - 2 * 3600000)));
  const due = w.come(chi, () => w.db.transazione(() => w.fermaTimer()));
  assert.ok(due.riga.ore >= 1.98 && due.riga.ore <= 2.02, String(due.riga.ore));
  assert.equal(due.riga.stato, 'bozza');
  // Dimenticato acceso tre giorni: solo l'inizio, zero ore e un avviso.
  w.come(chi, () => w.db.transazione(() => w.avviaTimer({})));
  const fa = new Date(adessoMs() - 3 * 86400000);
  w.db.esegui('UPDATE timer SET partito_il = ? WHERE utente_id = 7', istante(fa));
  const lungo = w.come(chi, () => w.db.transazione(() => w.fermaTimer()));
  assert.deepEqual([lungo.riga.ore, lungo.riga.fine, lungo.riga.data, lungo.riga.inizio], [0, '', dataOraIso(istante(fa)).slice(0, 10), dataOraIso(istante(fa)).slice(11, 16)]);
  assert.equal(lungo.avviso, 'Il timer era acceso da più di un giorno: scrivi tu le ore giuste');
  w.chiudi();
});

// ------------------------------------------------------------------ approvazioni

test('da approvare: per persona, con le anomalie (troppe ore, senza scontrino, sopra 200 euro, km diversi); le ore registrate no (07/11/2026)', async () => {
  // 07/11/2026 (Manuel: "le Ore vanno tolte, non servono, metti solamente i Rapportini"): le righe della tabella ore non
  // sono piu' fra le cose da approvare e non contano nelle ore del giorno. "Troppe ore" viene solo dai rapportini: Marco
  // scrive un rapportino da 13 ore e, lo stesso giorno, 3 ore registrate (che non si vedono e non si sommano).
  const g = giorno('2026-11-12');
  const lungo = (await marco('salvaRapportino', { rapportino: { idLocale: 'marco-troppe-1', data: g, idCliente: 'C002', idCommessa: '26ST002', oreLavoro: 9, oreExtra: 4 } })).rapportino;
  assert.equal(lungo.statoApprovazione, 'da_approvare');
  const registrate = (await marco('salvaOre', { riga: { data: g, idCommessa: '26ST002', ore: 3, descrizione: 'Ore del vecchio modo' } })).riga;
  assert.equal(registrate.stato, 'da_approvare', 'nel database restano da approvare');
  try {
    const d = await manuel('daApprovare');
    assert.equal(d.ok, true, d.errore);
    const marcoP = d.persone.find(p => p.idUtente === MARCO);
    assert.ok(marcoP && marcoP.quante >= 6);
    const voci = tutteLeVoci(d);
    const anomalie = new Set([].concat(...voci.map(v => v.anomalie.map(a => a.tipo))));
    for (const a of ['troppeOre', 'senzaFoto', 'sopra200', 'kmDiversi']) assert.ok(anomalie.has(a), a);
    const tredici = voci.filter(v => v.anomalie.some(a => a.testo === '13 ore in un giorno'));
    assert.deepEqual(tredici.map(v => [v.tipo, v.id]), [['rapportino', lungo.id]], 'il rapportino di quel giorno, senza le 3 ore registrate');
    assert.ok(voci.some(v => v.tipo === 'rapportino' && v.id === 'RAP/2026/0006'));
    assert.ok(voci.some(v => v.tipo === 'trasferta' && v.anomalie.some(a => /^Km diversi dal solito: 180 invece di circa 96$/.test(a.testo))));
    // Fase 6: anche le richieste di ferie e permessi (tipo "assenza"). Le ore registrate (dati di esempio e queste) no.
    assert.ok(voci.every(v => ['rapportino', 'spesa', 'trasferta', 'assenza'].includes(v.tipo) && typeof v.dettaglio === 'string' && typeof v.quanto === 'number'));
    assert.ok(s.wisper.db.riga("SELECT COUNT(*) n FROM ore WHERE stato = 'da_approvare' AND tolta IS NULL").n >= 4, 'le righe restano nel database');
    assert.equal(d.conAnomalie, voci.filter(v => v.anomalie.length).length);
    // Chi non approva.
    assert.equal((await marco('daApprovare')).permesso, false);
    assert.equal((await lettura('daApprovare')).permesso, false);
    assert.equal((await laura('daApprovare')).ok, true, 'amministrazione approva');
    // approva/respingi {tipo: 'ore'} restano per le app vecchie, coi loro permessi.
    assert.equal((await marco('approva', { voci: [{ tipo: 'ore', id: registrate.id }] })).permesso, false);
    assert.equal((await marco('respingi', { voci: [{ tipo: 'ore', id: registrate.id }], motivo: 'x' })).permesso, false);
  } finally {
    // Le prove dopo (approvazioni, statistiche) non devono vedere queste due righe.
    s.wisper.db.esegui("UPDATE rapportini SET stato = 'ANNULLATO' WHERE id = ?", lungo.id);
    s.wisper.db.esegui('UPDATE ore SET tolta = ? WHERE id = ?', istante(new Date()), registrate.id);
  }
});

test('respingi vuole il motivo, che arriva a chi ha scritto (registro e Dashboard); Annulla rimette da approvare', async () => {
  const d = await manuel('daApprovare');
  const pranzo = tutteLeVoci(d).find(v => v.tipo === 'spesa' && v.anomalie.some(a => a.tipo === 'senzaFoto'));
  const senza = await manuel('respingi', { voci: [{ tipo: 'spesa', id: pranzo.id }], motivo: '  ' });
  assert.equal(senza.errore, 'Scrivi il motivo: arriva a chi l\'ha scritta');
  const no = await manuel('respingi', { voci: [{ tipo: 'spesa', id: pranzo.id }], motivo: 'Manca lo scontrino: fotografalo e rimandala' });
  assert.deepEqual(no, { ok: true, fatte: 1, voci: [{ tipo: 'spesa', id: pranzo.id, stato: 'respinta' }] });
  const vista = (await marco('spese', { da: '2026-01-01', a: piuGiorni(oggi(), 400) })).spese.find(x => x.id === pranzo.id);
  assert.deepEqual([vista.stato, vista.motivoRifiuto, vista.approvataDaNome], ['respinta', 'Manca lo scontrino: fotografalo e rimandala', 'Manuel Gasparotto']);
  const dash = await marco('dashboard', { tutto: true });
  const voce = dash.urgenti.find(v => v.tipo === 'respinta' && /^Spesa del .* respinta$/.test(v.titolo));
  assert.ok(voce, 'nella Dashboard di Marco');
  assert.equal(voce.dettaglio, 'Motivo: Manca lo scontrino: fotografalo e rimandala · Manuel Gasparotto');
  assert.deepEqual(voce.collegamento, { pagina: 'spese', filtro: { segmento: 'spese', id: pranzo.id } });
  const reg = await manuel('registro', { tabella: 'spese', idRiga: String(pranzo.id) });
  assert.equal(reg.righe[0].azione, 'respingi');
  assert.deepEqual(reg.righe[0].dopo.motivo, 'Manca lo scontrino: fotografalo e rimandala');
  // Annulla (l'avviso dopo la scelta).
  const annulla = await manuel('annullaApprovazione', { voci: [{ tipo: 'spesa', id: pranzo.id }] });
  assert.deepEqual(annulla.voci, [{ tipo: 'spesa', id: pranzo.id, stato: 'da_approvare' }]);
  // Marco la corregge e la rimanda: torna da approvare (gia' lo era), il motivo se ne va.
  await manuel('respingi', { voci: [{ tipo: 'spesa', id: pranzo.id }], motivo: 'Di nuovo' });
  const rimandata = await marco('salvaSpesa', { spesa: { id: pranzo.id, descrizione: 'Pranzo in cantiere' } });
  assert.deepEqual([rimandata.spesa.stato, rimandata.spesa.motivoRifiuto], ['da_approvare', '']);
});

test('approva: tutto in una volta, ripetuto non fa danni; una bozza no; le spese di un rapportino col rapportino', async () => {
  const d = await manuel('daApprovare');
  const voci = tutteLeVoci(d).map(v => ({ tipo: v.tipo, id: v.id }));
  const si = await manuel('approva', { voci });
  assert.equal(si.ok, true, si.errore);
  assert.equal(si.fatte, voci.length);
  assert.ok(si.voci.every(v => v.stato === 'approvata' || v.stato === 'approvato'));
  assert.equal((await manuel('daApprovare')).quante, 0);
  const ancora = await manuel('approva', { voci });
  assert.equal(ancora.fatte, 0, 'la coda del telefono che ripete');
  const bozza = (await marco('salvaOre', { riga: { data: giorno('2026-11-07'), ore: 1, bozza: true } })).riga;
  assert.equal((await manuel('approva', { voci: [{ tipo: 'ore', id: bozza.id }] })).errore, 'Le ore del ' + ggmm(giorno('2026-11-07')) + ' sono ancora in bozza: chi le ha scritte deve prima mandarle');
  const rap = s.wisper.db.riga("SELECT id FROM spese WHERE rapportino_id IS NOT NULL LIMIT 1");
  assert.match((await manuel('approva', { voci: [{ tipo: 'spesa', id: rap.id }] })).errore, /si approva insieme al rapportino$/);
  assert.equal((await manuel('approva', { voci: [] })).errore, 'Scegli cosa approvare');
  assert.equal((await manuel('approva', { voci: [{ tipo: 'fattura', id: 1 }] })).errore, 'Tipo: ore, rapportino, spesa, trasferta o assenza');
});

test('un rapportino da approvare non si manda e non si fattura; approvato si\'; respinto mostra il motivo', async () => {
  const r = (await marco('salvaRapportino', { rapportino: { idLocale: 'marco-f3-1', data: giorno('2026-11-09'), idCliente: 'C002', idCommessa: '26ST002', oreLavoro: 3, km: 22, spese: 6.5 } })).rapportino;
  assert.equal(r.statoApprovazione, 'da_approvare');
  assert.deepEqual(r.righeSpese.map(x => [x.importo, x.stato, x.destinazione]), [[6.5, 'da_approvare', 'cliente']], 'le sue spese lo seguono');
  const manda = await manuel('stato', { ids: [r.id], stato: 'INVIATO' });
  assert.equal(manda.errore, 'Il rapportino ' + r.id + ' aspetta l\'approvazione: si manda al cliente e si fattura solo dopo');
  assert.equal((await manuel('stato', { ids: [r.id], stato: 'FATTURATO' })).ok, false);
  const email = await manuel('inviaEmail', { a: 'rossi@example.com', oggetto: 'Rapportino', ids: [r.id], allegati: [] });
  assert.equal(email.errore, manda.errore, 'l\'email non parte');
  assert.equal((await manuel('inviaEmail', { aMe: true, ids: [r.id], allegati: [] })).ok, true, 'a me si\': e\' un\'anteprima');
  // Respinto: il motivo nella pillola.
  await manuel('respingi', { voci: [{ tipo: 'rapportino', id: r.id }], motivo: 'Le ore di viaggio mancano' });
  const respinto = (await marco('rapportini', { tutti: true })).rapportini.find(x => x.id === r.id);
  assert.deepEqual([respinto.statoApprovazione, respinto.motivoRifiuto, respinto.approvatoDa], ['respinto', 'Le ore di viaggio mancano', MANUEL]);
  assert.equal(respinto.righeSpese[0].stato, 'respinta');
  assert.match((await manuel('stato', { ids: [r.id], stato: 'INVIATO' })).errore, /è stato respinto \(Le ore di viaggio mancano\): correggilo e rimandalo in approvazione$/);
  // Marco lo corregge: torna da approvare.
  const corretto = (await marco('salvaRapportino', { rapportino: { idLocale: 'marco-f3-1', data: giorno('2026-11-09'), idCliente: 'C002', idCommessa: '26ST002', oreLavoro: 3, oreViaggio: 0.5, km: 22, spese: 6.5 } })).rapportino;
  assert.deepEqual([corretto.statoApprovazione, corretto.motivoRifiuto], ['da_approvare', '']);
  await manuel('approva', { voci: [{ tipo: 'rapportino', id: r.id }] });
  const approvato = (await manuel('rapportini', { tutti: true })).rapportini.find(x => x.id === r.id);
  assert.deepEqual([approvato.statoApprovazione, approvato.approvatoDa, approvato.righeSpese[0].stato], ['approvato', MANUEL, 'approvata']);
  // Una ripetizione uguale dalla coda non lo rimanda in approvazione; un cambio vero si'.
  const uguale = (await marco('salvaRapportino', { rapportino: { idLocale: 'marco-f3-1', data: giorno('2026-11-09'), idCliente: 'C002', idCommessa: '26ST002', oreLavoro: 3, oreViaggio: 0.5, km: 22, spese: 6.5 } })).rapportino;
  assert.equal(uguale.statoApprovazione, 'approvato');
  assert.equal((await manuel('stato', { ids: [r.id], stato: 'INVIATO' })).ok, true);
  // Quelli del titolare non cambiano: niente approvazione.
  const suo = (await manuel('salvaRapportino', { rapportino: { idLocale: 'manuel-f3-1', data: giorno('2026-11-09'), idCliente: 'C002', tariffa: 42, oreLavoro: 1 } })).rapportino;
  assert.equal(suo.statoApprovazione, '');
});

test('APPROVAZIONE: "nessuno" non chiede niente, "tutti" anche al titolare', async () => {
  await manuel('salvaImpostazioni', { valori: { APPROVAZIONE: 'nessuno' } });
  try {
    assert.equal((await marco('salvaOre', { riga: { data: giorno('2026-11-10'), ore: 1 } })).riga.stato, 'approvata');
    assert.equal((await marco('salvaRapportino', { rapportino: { idLocale: 'marco-f3-nessuno', data: giorno('2026-11-10'), idCliente: 'C002', idCommessa: '26ST002', oreLavoro: 1 } })).rapportino.statoApprovazione, '');
    await manuel('salvaImpostazioni', { valori: { APPROVAZIONE: 'tutti' } });
    assert.equal((await manuel('salvaOre', { riga: { data: giorno('2026-11-10'), ore: 1 } })).riga.stato, 'da_approvare');
    assert.equal((await manuel('io')).interfaccia.approvazione, 'tutti');
  } finally {
    await manuel('salvaImpostazioni', { valori: { APPROVAZIONE: 'collaboratori' } });
  }
  assert.equal((await manuel('io')).interfaccia.puoApprovare, true);
  assert.equal((await marco('io')).interfaccia.puoApprovare, false);
});

// ------------------------------------------------------------------ statistiche e costo della commessa

test('statistiche delle ore per persona e per commessa: ore, fatturabili, percentuale, costo (solo con costi)', async () => {
  const p = { da: giorno('2027-01-11'), a: giorno('2027-01-17') };
  await manuel('salvaOre', { riga: { data: giorno('2027-01-11'), idCommessa: '26ST002', ore: 4 } });
  await manuel('salvaOre', { riga: { data: giorno('2027-01-12'), ore: 2 } });
  await marco('salvaOre', { riga: { data: giorno('2027-01-12'), idCommessa: '26ST001', ore: 3 } });
  await marco('salvaOre', { riga: { data: giorno('2027-01-13'), ore: 9, bozza: true } });
  await manuel('salvaRapportino', { rapportino: { idLocale: 'stat-1', data: giorno('2027-01-13'), idCliente: 'C002', idCommessa: '26ST002', tariffa: 42, oreLavoro: 2, oreViaggio: 1 } });
  const per = await manuel('statisticheOre', Object.assign({ per: 'persona' }, p));
  assert.equal(per.ok, true, per.errore);
  const riga = id => per.righe.find(x => x.chiave === id);
  assert.deepEqual(['ore', 'fatturabili', 'percentuale', 'oreRapportini', 'oreRegistrate', 'costo', 'costoNoto'].map(k => riga(MANUEL)[k]), [9, 6, 67, 3, 6, 180, true],
    '4 h a 25 + 2 h a 15 + 2 h di rapportino a 25 (il viaggio e\' nel costo orario)');
  // Fase 6: Marco ha il costo orario della persona (28,50 dal 1 gennaio), che vale prima del costo fisso del cliente (22).
  assert.deepEqual(['ore', 'fatturabili', 'percentuale', 'costo'].map(k => riga(MARCO)[k]), [3, 3, 100, 85.5], 'la bozza non conta; 3 h a 28,50');
  assert.deepEqual([per.totale.ore, per.totale.fatturabili, per.totale.percentuale, per.totale.costo], [12, 9, 75, 265.5]);
  const com = await manuel('statisticheOre', Object.assign({ per: 'commessa' }, p));
  const c = id => com.righe.find(x => x.chiave === id);
  assert.deepEqual([c('26ST002').ore, c('26ST002').fatturabili, c('26ST002').costo, c('26ST002').cliente], [7, 6, 150, 'Rossi Impianti Srl']);
  assert.deepEqual([c('').nome, c('').ore, c('').percentuale, c('').costo], ['Attività dello studio', 2, 0, 30]);
  const suo = await marco('statisticheOre', Object.assign({ per: 'persona' }, p));
  assert.deepEqual(suo.righe.map(x => x.chiave), [MARCO], 'il collaboratore solo le sue');
  assert.deepEqual(soldiIn(suo), []);
  assert.equal((await manuel('statisticheOre', { per: 'mese' })).errore, 'Per: persona o commessa');
});

test('costo della commessa: la parte dei rapportini e\' quella della fase 1; poi ore, spese allo studio e al cliente, trasferte', async () => {
  const m = (await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Costo di prova', costoOrario: 30, euroKm: 1, prezzoOrario: 50 })).commessa;
  await manuel('salvaRapportino', { rapportino: { idLocale: 'costo-1', data: '2027-02-01', idCliente: 'C002', idCommessa: m.id, oreLavoro: 4, km: 10, spese: 5, tariffa: 50 } });
  const prima = (await manuel('costoCommessa', { idCommessa: m.id })).costoCommessa;
  assert.deepEqual([prima.lavoro, prima.auto, prima.speseRapportini, prima.soloRapportini, prima.totale], [120, 10, 5, 135, 135]);
  // Lo stesso numero del cruscotto della fase 1 (pc/ui/conti.js), se c'e'.
  const pc = path.join(__dirname, '..', '..', 'pc', 'ui', 'conti.js');
  if (fs.existsSync(pc)) {
    const P = require(pc);
    const a = await manuel('anagrafiche');
    const rap = (await manuel('rapportini', { tutti: true })).rapportini;
    const k = P.cruscotto(a.commesse.find(x => x.id === m.id), rap, a.impostazioni, oggi(), a.clienti.find(x => x.id === 'C002'));
    assert.equal(k.costo.totale, prima.soloRapportini, 'come il cruscotto della fase 1');
  }
  await manuel('salvaOre', { riga: { data: '2027-02-02', idCommessa: m.id, ore: 2 } });
  await manuel('salvaSpesa', { spesa: { data: '2027-02-02', idCommessa: m.id, importo: 12, destinazione: 'studio' } });
  await manuel('salvaSpesa', { spesa: { data: '2027-02-02', idCommessa: m.id, importo: 7 } });
  await manuel('salvaSpesa', { spesa: { data: '2027-02-02', idCommessa: m.id, importo: 5, destinazione: 'personale' } });
  await manuel('salvaTrasferta', { trasferta: { dal: '2027-02-02', destinazione: 'Cantiere', idCommessa: m.id, km: 20, andataRitorno: true } });
  const dopo = (await manuel('costoCommessa', { idCommessa: m.id })).costoCommessa;
  assert.deepEqual([dopo.oreRegistrate, dopo.costoOreRegistrate, dopo.speseFuoriRapportini, dopo.trasferte, dopo.kmTrasferte], [2, 60, 19, 30.4, 40]);
  assert.deepEqual([dopo.soloRapportini, dopo.totale], [135, 244.4], '135 + 60 + 12 + 7 + 30,40 (la spesa "Mia" no)');
  // La spesa del rapportino spostata allo studio: esce dal suo conto ed entra nelle altre; il costo non cambia.
  const riga = s.wisper.db.riga('SELECT id FROM spese WHERE rapportino_id = (SELECT id FROM rapportini WHERE id_locale = ?)', 'costo-1');
  await manuel('salvaSpesa', { spesa: { id: riga.id, destinazione: 'studio' } });
  const spostata = (await manuel('costoCommessa', { idCommessa: m.id })).costoCommessa;
  assert.deepEqual([spostata.speseRapportini, spostata.speseFuoriRapportini, spostata.totale], [0, 24, 244.4]);
  // Senza costi: solo il codice.
  assert.deepEqual(await marco('costoCommessa', { idCommessa: '26ST001' }), { ok: true, idCommessa: '26ST001' });
  assert.equal((await marco('costoCommessa', { idCommessa: m.id })).permesso, false, 'una commessa non sua');
});

test('esporta ore: le colonne, il costo solo con costi; il collaboratore solo le sue', async () => {
  const r = await manuel('esporta', { cosa: 'ore', da: giorno('2026-11-01'), a: giorno('2026-11-30') });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.nome, 'wisper-ore-' + giorno('2026-11-01') + '-' + giorno('2026-11-30') + '.csv');
  const csv = Buffer.from(r.base64, 'base64').toString('utf8');
  const righe = csv.slice(1).trim().split('\r\n');
  assert.deepEqual(righe[0].split(';').slice(0, 6), ['Data', 'Persona', 'Inizio', 'Fine', 'Pausa (minuti)', 'Ore']);
  assert.ok(righe[0].includes('Costo orario'));
  assert.ok(csv.includes(giorno('2026-11-02').split('-').reverse().join('/') + ';Manuel Gasparotto;22:00;06:00;30;7,5;26ST002'));
  const suo = Buffer.from((await marco('esporta', { cosa: 'ore', da: giorno('2026-11-01'), a: giorno('2026-11-30') })).base64, 'base64').toString('utf8');
  assert.ok(suo.slice(1).trim().split('\r\n').slice(1).every(r => r.split(';')[1] === 'Marco Rossato'), 'solo le sue righe');
  assert.equal(suo.split('\r\n')[0].includes('Costo'), false, suo);
});

test('le azioni nuove che scrivono vogliono una POST; quelle che leggono vanno anche in GET', async () => {
  for (const azione of ['salvaOre', 'togliOre', 'avviaTimer', 'fermaTimer', 'approva', 'respingi', 'annullaApprovazione', 'salvaSpesa', 'togliSpesa',
    'togliFotoSpesa', 'salvaTrasferta', 'togliTrasferta', 'segnaRimborsato', 'salvaVeicolo']) {
    assert.deepEqual(await manuel.leggi({ azione }), { ok: false, errore: 'Questa azione vuole una POST' }, azione);
  }
  for (const azione of ['ore', 'timer', 'daApprovare', 'statisticheOre', 'spese', 'trasferte', 'rimborsi', 'veicoli', 'riepilogoSpese']) {
    assert.equal((await manuel.leggi({ azione })).ok, true, azione);
  }
});

test('rapportini: il filtro statoApprovazione (da_approvare, approvato, respinto, nessuno)', async () => {
  const da = await manuel('rapportini', { tutti: true, statoApprovazione: 'da_approvare' });
  assert.ok(da.rapportini.every(r => r.statoApprovazione === 'da_approvare'));
  const nessuno = await manuel('rapportini', { tutti: true, statoApprovazione: 'nessuno' });
  assert.ok(nessuno.rapportini.length >= 4 && nessuno.rapportini.every(r => r.statoApprovazione === ''));
});
