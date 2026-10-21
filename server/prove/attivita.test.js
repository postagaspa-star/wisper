// Fase 2: attivita' e calendario. Elenco e calendario, campi e controlli, sovrapposizioni,
// ricorrenze (90 giorni, allungamento notturno, questa / future / tutte, salto di una),
// fatta, checklist, allegati, permessi di ogni ruolo, registro, dashboard, esportazione.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, PNG } = require('./aiuto');
const { oggi, piuGiorni } = require('../src/utili');
const { giorniDellaSerie } = require('../src/azioni/attivita');

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

const T = oggi();
const g = n => piuGiorni(T, n);
const MANUEL = 1;
const LAURA = 2;
const MARCO = 3;
const salva = async (chi, attivita, extra) => {
  const r = await chi('salvaAttivita', Object.assign({ attivita }, extra || {}));
  assert.equal(r.ok, true, r.errore);
  return r;
};
/** Il primo lunedi' da oggi (oggi compreso). */
const lunedi = (() => { const d = ((new Date(T + 'T12:00:00').getDay() + 6) % 7) + 1; return g(d === 1 ? 0 : 8 - d); })();
const serie = async id => (await manuel('attivita', { stato: 'tutte', da: g(-400), a: g(400) })).attivita
  .filter(a => a.idRicorrenza === id).sort((x, y) => (x.occorrenza < y.occorrenza ? -1 : 1));

// ------------------------------------------------------------------ i giorni delle ricorrenze

test('ricorrenze: i giorni di ogni regola (giorni, settimane coi giorni scelti, mesi a fine mese, anni)', () => {
  assert.deepEqual(giorniDellaSerie({ regola: 'giorni', ogni: 2, inizio: '2026-10-30', fine: '' }, '2026-11-05'),
    ['2026-10-30', '2026-11-01', '2026-11-03', '2026-11-05']);
  // Ogni settimana il lunedi' e il mercoledi', a partire da un mercoledi'.
  assert.deepEqual(giorniDellaSerie({ regola: 'settimane', ogni: 1, giorni_settimana: '1,3', inizio: '2026-10-21', fine: '' }, '2026-11-02'),
    ['2026-10-21', '2026-10-26', '2026-10-28', '2026-11-02']);
  assert.deepEqual(giorniDellaSerie({ regola: 'settimane', ogni: 2, giorni_settimana: '', inizio: '2026-10-22', fine: '' }, '2026-11-30'),
    ['2026-10-22', '2026-11-05', '2026-11-19']);
  // Il 31 di ogni mese: dove il mese e' piu' corto, l'ultimo giorno.
  assert.deepEqual(giorniDellaSerie({ regola: 'mesi', ogni: 1, inizio: '2027-01-31', fine: '' }, '2027-05-01'),
    ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  assert.deepEqual(giorniDellaSerie({ regola: 'anni', ogni: 1, inizio: '2028-02-29', fine: '' }, '2030-12-31'),
    ['2028-02-29', '2029-02-28', '2030-02-28']);
  assert.deepEqual(giorniDellaSerie({ regola: 'giorni', ogni: 1, inizio: '2026-10-30', fine: '2026-11-01' }, '2026-12-31'),
    ['2026-10-30', '2026-10-31', '2026-11-01'], 'si ferma alla fine');
  assert.deepEqual(giorniDellaSerie({ regola: 'giorni', ogni: 1, inizio: '2026-10-30', fine: '2026-10-29' }, '2026-12-31'), [], 'finita');
});

// ------------------------------------------------------------------ elenco e calendario

test('elenco: scadute, oggi, prossimi giorni, senza data; il calendario con da/a', async () => {
  const r = await manuel('attivita');
  assert.equal(r.oggi, T);
  const gruppi = new Set(r.attivita.map(a => a.gruppo));
  for (const k of ['scadute', 'oggi', 'prossimi', 'senzaData']) assert.ok(gruppi.has(k), k);
  assert.ok(r.attivita.every(a => a.stato === 'da_fare' || a.stato === 'in_corso'), 'senza date: solo le aperte');
  const ordine = ['scadute', 'oggi', 'prossimi', 'senzaData'];
  const indici = r.attivita.map(a => ordine.indexOf(a.gruppo));
  assert.deepEqual(indici, indici.slice().sort((x, y) => x - y), 'in ordine di giorno, le senza data in fondo');
  const sop = r.attivita.find(a => a.tipo === 'sopralluogo');
  assert.equal(sop.inizio, T + 'T14:30:00');
  assert.equal(sop.fine, T + 'T16:00:00');
  assert.equal(sop.giorno, T);
  assert.equal(sop.assegnata, 'Marco Collaboratore');
  assert.equal(sop.commessa, 'Nuovo magazzino automatico Batokyo');
  assert.equal(sop.cliente, 'Elettrodinamica', 'il cliente dalla commessa');
  const schema = r.attivita.find(a => /schema unifilare/.test(a.titolo));
  assert.deepEqual(schema.checklist.map(c => c.fatta), [true, false, false]);
  // Il calendario: un periodo, comprese le fatte, senza le annullate e senza quelle senza data.
  const cal = await manuel('attivita', { da: g(-3), a: g(3) });
  assert.ok(cal.attivita.every(a => a.giorno >= g(-3) && a.giorno <= g(3)));
  assert.ok(cal.attivita.some(a => a.stato === 'fatta'), 'la fatta dei dati di esempio');
  assert.equal(cal.attivita.some(a => a.gruppo === 'senzaData'), false);
  // I filtri.
  assert.ok((await manuel('attivita', { mie: true })).attivita.every(a => a.assegnataA === MANUEL));
  assert.ok((await manuel('attivita', { nonAssegnate: true })).attivita.every(a => a.assegnataA === null));
  assert.ok((await manuel('attivita', { commessa: '26st002' })).attivita.every(a => a.idCommessa === '26ST002'));
  assert.ok((await manuel('attivita', { stato: 'fatta' })).attivita.every(a => a.gruppo === 'fatte'));
});

// ------------------------------------------------------------------ salvare

test('salvaAttivita: valori di base, campi controllati, cliente dalla commessa, un\'ora se manca la fine', async () => {
  const r = await salva(manuel, { titolo: 'Telefonare al Comune' });
  assert.deepEqual([r.attivita.tipo, r.attivita.priorita, r.attivita.stato, r.attivita.assegnataA, r.attivita.gruppo, r.attivita.creataDa],
    ['attivita', 'normale', 'da_fare', null, 'senzaData', MANUEL]);
  const app = await salva(manuel, { titolo: 'Incontro', tipo: 'appuntamento', idCommessa: '26ST002', inizio: g(20) + 'T15:00:00', assegnataA: LAURA });
  assert.equal(app.attivita.fine, g(20) + 'T16:00:00', 'senza fine dura un\'ora');
  assert.equal(app.attivita.idCliente, 'C002');
  const tutto = await salva(manuel, { titolo: 'Fiera', tipo: 'appuntamento', inizio: g(21), tuttoIlGiorno: true });
  assert.equal(tutto.attivita.inizio, g(21) + 'T00:00:00');
  assert.equal(tutto.attivita.giorno, g(21));
  // Cambiare solo un campo lascia gli altri.
  const c = await salva(manuel, { id: app.attivita.id, priorita: 'alta' });
  assert.equal(c.attivita.priorita, 'alta');
  assert.equal(c.attivita.titolo, 'Incontro');
  // La checklist e' l'elenco intero.
  const k = await salva(manuel, { id: r.attivita.id, checklist: [{ testo: 'Numero dell\'ufficio' }, { testo: 'Chiedere del permesso', fatta: true }] });
  assert.deepEqual(k.attivita.checklist.map(x => [x.testo, x.fatta]), [['Numero dell\'ufficio', false], ['Chiedere del permesso', true]]);
  const k2 = await salva(manuel, { id: r.attivita.id, checklist: [{ id: k.attivita.checklist[1].id, testo: 'Chiedere del permesso' }] });
  assert.deepEqual(k2.attivita.checklist.map(x => [x.testo, x.fatta]), [['Chiedere del permesso', true]]);
  const no = async (a, frase) => assert.equal((await manuel('salvaAttivita', { attivita: a })).errore, frase);
  await no({ titolo: '' }, 'Titolo: scrivi cosa c\'è da fare');
  await no({ titolo: 'X', tipo: 'riunione' }, 'Tipo: attivita, appuntamento o sopralluogo');
  await no({ titolo: 'X', priorita: 'massima' }, 'Priorità: alta, normale o bassa');
  await no({ titolo: 'X', tipo: 'sopralluogo' }, 'Inizio: scrivi quando comincia');
  await no({ titolo: 'X', inizio: g(5) + 'T10:00:00', fine: g(5) + 'T09:00:00' }, 'Fine: deve venire dopo l\'inizio');
  await no({ titolo: 'X', assegnataA: 99 }, 'Persona 99 non trovata');
  await no({ titolo: 'X', idCommessa: '26ST999' }, 'Commessa 26ST999 non trovata');
  await no({ titolo: 'X', ricorrenza: { regola: 'settimane' } }, 'Per ripetere un\'attività serve la data');
  await no({ titolo: 'X', scadenza: g(1), ricorrenza: { regola: 'ore' } }, 'Ripeti: giorni, settimane, mesi o anni');
});

test('sovrapposizioni: due impegni della stessa persona nella stessa ora chiedono conferma', async () => {
  const giorno = g(40);
  await salva(manuel, { titolo: 'Riunione A', tipo: 'appuntamento', assegnataA: MANUEL, inizio: giorno + 'T09:00:00', fine: giorno + 'T10:30:00' });
  const r = await manuel('salvaAttivita', { attivita: { titolo: 'Riunione B', tipo: 'appuntamento', assegnataA: MANUEL, inizio: giorno + 'T10:00:00', fine: giorno + 'T11:00:00' } });
  assert.equal(r.ok, false);
  assert.equal(r.serveConferma, true);
  assert.equal(r.errore, 'Si sovrappone a: Riunione A (9:00-10:30)');
  assert.deepEqual(r.sovrapposte.map(x => [x.titolo, x.inizio, x.fine, x.assegnata]), [['Riunione A', giorno + 'T09:00:00', giorno + 'T10:30:00', 'Manuel Gasparotto']]);
  assert.equal((await manuel('attivita', { da: giorno, a: giorno })).attivita.some(a => a.titolo === 'Riunione B'), false, 'non salvata');
  const conferma = await manuel('salvaAttivita', { attivita: { titolo: 'Riunione B', tipo: 'appuntamento', assegnataA: MANUEL, inizio: giorno + 'T10:00:00', fine: giorno + 'T11:00:00' }, conferma: true });
  assert.equal(conferma.ok, true, 'con conferma si salva lo stesso');
  // Un'altra persona, o subito dopo (10:30-11:00 tocca, non si sovrappone), o tutto il giorno: niente domanda.
  await salva(manuel, { titolo: 'Di Laura', tipo: 'appuntamento', assegnataA: LAURA, inizio: giorno + 'T09:00:00', fine: giorno + 'T10:00:00' });
  await salva(manuel, { titolo: 'Fiera', tipo: 'appuntamento', assegnataA: MANUEL, inizio: giorno, tuttoIlGiorno: true });
  const dopo = await manuel('salvaAttivita', { attivita: { titolo: 'Dopo', tipo: 'appuntamento', assegnataA: LAURA, inizio: giorno + 'T10:00:00', fine: giorno + 'T10:30:00' } });
  assert.equal(dopo.ok, true, dopo.errore);
  // Spostare quella che c'e' sopra un'altra chiede conferma anche lei; una fatta non conta.
  const sposta = await manuel('salvaAttivita', { attivita: { id: dopo.attivita.id, inizio: giorno + 'T09:30:00', fine: giorno + 'T10:15:00' } });
  assert.equal(sposta.serveConferma, true);
  const fatta = (await manuel('attivita', { da: giorno, a: giorno })).attivita.find(a => a.titolo === 'Di Laura');
  await manuel('faiAttivita', { id: fatta.id, fatta: true });
  assert.equal((await manuel('salvaAttivita', { attivita: { id: dopo.attivita.id, inizio: giorno + 'T09:30:00', fine: giorno + 'T09:45:00' } })).ok, true);
});

// ------------------------------------------------------------------ ricorrenze

test('ricorrenze: le occorrenze ci sono per 90 giorni; ogni notte si allungano; una saltata non torna', async () => {
  const r = await salva(manuel, { titolo: 'Controllo copie', assegnataA: MANUEL, scadenza: T, ricorrenza: { regola: 'giorni', ogni: 1 } });
  assert.equal(r.occorrenze, 91, 'da oggi a fra 90 giorni');
  assert.equal(r.attivita.ricorrenza.regola, 'giorni');
  assert.equal(r.attivita.occorrenza, T);
  const id = r.attivita.idRicorrenza;
  let lista = await serie(id);
  assert.equal(lista.length, 91);
  assert.equal(lista[90].scadenza, g(90));
  // Si salta il terzo giorno: resta annullato, gli altri ci sono.
  const t = await manuel('togliAttivita', { id: lista[2].id });
  assert.equal(t.tolte, 1);
  assert.equal(t.attivita.stato, 'annullata');
  // La notte: si toglie l'ultima (come se non fosse ancora nata) e l'allungamento la rifa; la saltata no.
  s.wisper.db.esegui('DELETE FROM attivita WHERE id = ?', lista[90].id);
  assert.equal(s.wisper.allungaRicorrenze(), 1);
  lista = await serie(id);
  assert.equal(lista.length, 91);
  assert.equal(lista[2].stato, 'annullata', 'la saltata resta saltata');
  assert.equal(s.wisper.allungaRicorrenze(), 0, 'niente da aggiungere');
});

test('ricorrenze: l\'allungamento gira nella stessa pianificazione delle copie (all\'avvio e ogni notte)', async () => {
  const r = await salva(manuel, { titolo: 'Annaffiare le piante', scadenza: T, ricorrenza: { regola: 'giorni', ogni: 7 } });
  const lista = await serie(r.attivita.idRicorrenza);
  s.wisper.db.esegui('DELETE FROM attivita WHERE id = ?', lista[lista.length - 1].id);
  // La copia di stanotte c'e' gia': la pianificazione deve solo allungare.
  s.wisper.db.esegui("INSERT INTO copie (quando, nota) VALUES (?, 'notturna')", require('../src/utili').adesso());
  s.wisper.pianifica('02:30');
  try {
    assert.equal((await serie(r.attivita.idRicorrenza)).length, lista.length);
    assert.equal(s.wisper.ultimoAllungamento, T);
  } finally {
    clearInterval(s.wisper.pianificazione);
    s.wisper.pianificazione = null;
  }
});

test('ricorrenze: "questa", "future", "tutte" e il salto di una; le fatte non si toccano', async () => {
  const r = await salva(manuel, { titolo: 'Riunione del lunedì', tipo: 'appuntamento', assegnataA: MANUEL, inizio: lunedi + 'T07:00:00', fine: lunedi + 'T07:30:00',
    checklist: [{ testo: 'Ordine del giorno' }], ricorrenza: { regola: 'settimane', ogni: 1, giorniSettimana: [1] } });
  const id = r.attivita.idRicorrenza;
  let lista = await serie(id);
  assert.ok(lista.length >= 12, 'ogni lunedi\' per 90 giorni');
  assert.ok(lista.every((a, i) => a.giorno === piuGiorni(lunedi, 7 * i) && a.inizio.endsWith('T07:00:00')));
  assert.ok(lista.every(a => a.checklist.length === 1), 'la checklist passa alle occorrenze');

  // "questa": solo la terza.
  await salva(manuel, { id: lista[2].id, titolo: 'Riunione con il commercialista' }, { perRicorrenza: 'questa' });
  lista = await serie(id);
  assert.deepEqual(lista.slice(0, 4).map(a => a.titolo), ['Riunione del lunedì', 'Riunione del lunedì', 'Riunione con il commercialista', 'Riunione del lunedì']);

  // Il salto della quarta, e la seconda fatta.
  await manuel('togliAttivita', { id: lista[3].id });
  await manuel('faiAttivita', { id: lista[1].id, fatta: true });

  // "tutte": la persona cambia sulle aperte (anche sulla terza), non sulla fatta ne' sulla saltata.
  await salva(manuel, { id: lista[0].id, priorita: 'alta' }, { perRicorrenza: 'tutte' });
  lista = await serie(id);
  assert.deepEqual(lista.slice(0, 6).map(a => a.priorita), ['alta', 'normale', 'alta', 'normale', 'alta', 'alta']);
  assert.equal(lista[2].titolo, 'Riunione con il commercialista', '"tutte" porta solo i campi cambiati');
  assert.equal(lista[3].stato, 'annullata');

  // "future" dalla sesta: l'ora cambia da li' in poi, e da li' nasce una serie nuova.
  // (Alle 8:00 no: c'e' gia' la Riunione di studio dei dati di esempio, e il server lo direbbe.)
  const sesta = lista[5];
  assert.equal((await manuel('salvaAttivita', { attivita: { id: sesta.id, inizio: sesta.giorno + 'T08:00:00', fine: sesta.giorno + 'T09:00:00' }, perRicorrenza: 'future' })).serveConferma, true);
  const f = await salva(manuel, { id: sesta.id, inizio: sesta.giorno + 'T10:00:00', fine: sesta.giorno + 'T11:00:00' }, { perRicorrenza: 'future' });
  const nuova = f.attivita.idRicorrenza;
  assert.notEqual(nuova, id);
  const vecchia = await serie(id);
  const dopo = await serie(nuova);
  assert.equal(vecchia.length, 5, 'la vecchia finisce il giorno prima');
  assert.ok(vecchia.every(a => a.inizio.endsWith('T07:00:00')));
  assert.equal(vecchia[0].ricorrenza.fine, piuGiorni(sesta.giorno, -1));
  assert.ok(dopo.length >= 6 && dopo.every(a => a.inizio.endsWith('T10:00:00') && a.fine.endsWith('T11:00:00')));
  assert.equal(dopo[0].id, sesta.id, 'la sesta e\' la prima della serie nuova');

  // "future" con la regola nuova (ogni due settimane) dall'ottava: le aperte da li' si rifanno.
  const ottava = dopo[2];
  const reg = await salva(manuel, { id: ottava.id, ricorrenza: { regola: 'settimane', ogni: 2, giorniSettimana: [1] } }, { perRicorrenza: 'future' });
  const due = await serie(reg.attivita.idRicorrenza);
  assert.ok(due.length >= 3);
  assert.ok(due.every((a, i) => a.giorno === piuGiorni(ottava.giorno, 14 * i)), 'ogni due settimane');
  assert.equal(due[0].id, ottava.id);
  assert.equal((await serie(nuova)).length, 2, 'la serie di prima tiene la sesta e la settima');

  // Togliere "future": la serie finisce, e la notte non la riallunga.
  const tf = await manuel('togliAttivita', { id: due[1].id, perRicorrenza: 'future' });
  assert.ok(tf.tolte >= 1);
  const finita = await serie(reg.attivita.idRicorrenza);
  assert.deepEqual(finita.map(a => a.stato).slice(0, 2), ['da_fare', 'annullata']);
  assert.ok(finita.slice(1).every(a => a.stato === 'annullata'));
  s.wisper.allungaRicorrenze();
  assert.equal((await serie(reg.attivita.idRicorrenza)).length, finita.length);

  // "Non si ripete piu'" su "tutte": resta solo questa, staccata dalla serie.
  const sola = await salva(manuel, { id: dopo[0].id, ricorrenza: null }, { perRicorrenza: 'tutte' });
  assert.equal(sola.attivita.ricorrenza, null);
  assert.equal(sola.attivita.idRicorrenza, null);
  assert.equal(sola.occorrenze, 0);
});

test('ricorrenze: cambiare il giorno con "tutte" rifa la serie da quel giorno; la checklist nuova vale per le prossime', async () => {
  const r = await salva(manuel, { titolo: 'Ordine al fornitore', assegnataA: LAURA, scadenza: g(1), ricorrenza: { regola: 'mesi', ogni: 1 } });
  const id = r.attivita.idRicorrenza;
  assert.equal(r.occorrenze, 3, 'un mese per tre mesi');
  const prima = await serie(id);
  const c = await salva(manuel, { id: prima[0].id, scadenza: g(2), checklist: [{ testo: 'Controllare il magazzino' }] }, { perRicorrenza: 'tutte' });
  const lista = await serie(id);
  assert.equal(lista[0].id, prima[0].id, 'questa resta, con il suo id');
  assert.equal(lista[0].giorno, g(2));
  assert.equal(c.attivita.ricorrenza.inizio, g(2));
  assert.equal(lista.length, 3);
  assert.ok(lista.slice(1).every(a => a.checklist.map(x => x.testo).join() === 'Controllare il magazzino'));
  assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM attivita WHERE id = ?', prima[1].id).n, 0, 'le vecchie aperte sono state rifatte');
  const reg = await manuel('registro', { tabella: 'attivita', idRiga: String(prima[1].id) });
  assert.equal(reg.righe[0].nota, 'tolta: la ricorrenza è cambiata');
});

// ------------------------------------------------------------------ fatta, checklist, allegati

test('fatta, di nuovo da fare, checklist, allegati (nel cestino quando si tolgono)', async () => {
  const a = (await salva(manuel, { titolo: 'Allegati', scadenza: g(4), checklist: [{ testo: 'Uno' }, { testo: 'Due' }] })).attivita;
  const f = await manuel('faiAttivita', { id: a.id, fatta: true });
  assert.equal(f.attivita.stato, 'fatta');
  assert.ok(f.attivita.fattaIl);
  assert.equal(f.attivita.gruppo, 'fatte');
  const df = await manuel('faiAttivita', { id: a.id, fatta: false });
  assert.equal(df.attivita.stato, 'da_fare');
  assert.equal(df.attivita.fattaIl, '');
  const sp = await manuel('spuntaChecklist', { id: a.checklist[1].id, fatta: true });
  assert.deepEqual(sp.attivita.checklist.map(c => c.fatta), [false, true]);
  const file = await manuel('caricaFile', { tipo: 'attivita', idAttivita: a.id, base64: PNG.toString('base64'), mime: 'image/png', nome: 'foto.png', idFile: 'all-1' });
  assert.equal(file.ok, true, file.errore);
  const ancora = await manuel('caricaFile', { tipo: 'attivita', idAttivita: a.id, base64: PNG.toString('base64'), mime: 'image/png', nome: 'foto.png', idFile: 'all-1' });
  assert.equal(ancora.file.id, file.file.id, 'lo stesso idFile non fa doppioni');
  const con = (await manuel('attivita', { da: g(4), a: g(4) })).attivita.find(x => x.id === a.id);
  assert.deepEqual(con.allegati.map(x => x.nome), ['foto.png']);
  assert.equal((await manuel.file(file.file.id)).status, 200);
  const tolto = await manuel('togliAllegato', { id: file.file.id });
  assert.deepEqual(tolto.attivita.allegati, []);
  assert.ok((await manuel('cestino')).file.some(x => x.id === file.file.id && x.idAttivita === a.id));
  const via = await manuel('togliAttivita', { id: a.id });
  assert.equal(via.attivita.stato, 'annullata');
  assert.equal((await manuel('attivita')).attivita.some(x => x.id === a.id), false, 'le annullate non stanno tra le aperte');
});

// ------------------------------------------------------------------ permessi

test('collaboratore: vede le sue, le non assegnate e quelle delle sue commesse; scrive solo le sue', async () => {
  const vede = (await marco('attivita', { stato: 'tutte' })).attivita;
  const tutte = (await manuel('attivita', { stato: 'tutte' })).attivita;
  const dovrebbe = tutte.filter(a => a.assegnataA === MARCO || a.assegnataA === null || a.creataDa === MARCO || a.idCommessa === '26ST001');
  assert.deepEqual(vede.map(a => a.id).sort((x, y) => x - y), dovrebbe.map(a => a.id).sort((x, y) => x - y));
  assert.equal(vede.some(a => a.titolo === 'Chiamare Rossi per il collaudo'), false, 'di Manuel su una commessa non sua');
  assert.ok(vede.some(a => a.titolo === 'Richiamare Elettrodinamica per i disegni del magazzino'), 'di Laura, ma sulla sua commessa');
  const suaVista = vede.find(a => a.titolo === 'Sopralluogo quadri del magazzino Batokyo');
  assert.equal(suaVista.puoScrivere, true);
  const altrui = vede.find(a => a.titolo === 'Mandare lo schema unifilare a Elettrodinamica');
  assert.equal(altrui.puoScrivere, false);
  const rossi = tutte.find(a => a.titolo === 'Chiamare Rossi per il collaudo');

  for (const [azione, dati] of [
    ['salvaAttivita', { attivita: { id: altrui.id, titolo: 'X' } }], ['faiAttivita', { id: altrui.id }], ['togliAttivita', { id: altrui.id }],
    ['spuntaChecklist', { id: altrui.checklist[1].id }], ['caricaFile', { tipo: 'attivita', idAttivita: altrui.id, base64: PNG.toString('base64') }],
    ['salvaAttivita', { attivita: { titolo: 'Per Manuel', assegnataA: MANUEL } }], ['faiAttivita', { id: rossi.id }],
    ['salvaAttivita', { attivita: { id: suaVista.id, assegnataA: LAURA } }],
  ]) {
    const r = await marco(azione, dati);
    assert.equal(r.permesso, false, azione + ': ' + JSON.stringify(r));
  }
  // Le sue si': fatta, e una nuova senza nessuno (creata da lui: la puo' cambiare).
  assert.equal((await marco('faiAttivita', { id: suaVista.id, fatta: true })).ok, true);
  await marco('faiAttivita', { id: suaVista.id, fatta: false });
  const libera = await salva(marco, { titolo: 'Libera di Marco' });
  assert.equal(libera.attivita.assegnataA, null);
  assert.equal((await salva(marco, { id: libera.attivita.id, titolo: 'Libera, cambiata' })).attivita.titolo, 'Libera, cambiata');
  // Gli allegati: quelli delle attivita' che vede si', gli altri no.
  const fRossi = await manuel('caricaFile', { tipo: 'attivita', idAttivita: rossi.id, base64: PNG.toString('base64'), mime: 'image/png', nome: 'r.png' });
  const fSuo = await manuel('caricaFile', { tipo: 'attivita', idAttivita: altrui.id, base64: PNG.toString('base64'), mime: 'image/png', nome: 's.png' });
  assert.equal((await marco.file(fRossi.file.id)).status, 403);
  assert.equal((await marco.file(fSuo.file.id)).status, 200);
  assert.equal((await marco('attivita', { mie: true })).attivita.every(a => a.assegnataA === MARCO), true);
});

test('lettura vede le attivita\' e non scrive; amministrazione scrive tutte', async () => {
  const l = await lettura('attivita');
  assert.ok(l.attivita.length > 0);
  assert.ok(l.attivita.every(a => a.puoScrivere === false));
  const una = l.attivita[0];
  const prima = s.wisper.db.riga('SELECT COUNT(*) n FROM registro').n;
  for (const [azione, dati] of [
    ['salvaAttivita', { attivita: { titolo: 'X' } }], ['faiAttivita', { id: una.id }], ['togliAttivita', { id: una.id }],
    ['spuntaChecklist', { id: 1 }], ['togliAllegato', { id: 'x' }], ['caricaFile', { tipo: 'attivita', idAttivita: una.id, base64: PNG.toString('base64') }],
  ]) {
    const r = await lettura(azione, dati);
    assert.equal(r.permesso, false, azione + ': ' + JSON.stringify(r));
  }
  assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM registro').n, prima);
  const rossi = (await laura('attivita')).attivita.find(a => a.titolo === 'Chiamare Rossi per il collaudo');
  assert.equal(rossi.puoScrivere, true);
  assert.equal((await laura('salvaAttivita', { attivita: { id: rossi.id, assegnataA: LAURA } })).ok, true);
  await manuel('salvaAttivita', { attivita: { id: rossi.id, assegnataA: MANUEL } });
});

// ------------------------------------------------------------------ registro, dashboard, esportazione

test('registro: chi ha creato, cambiato e fatto le attivita\'', async () => {
  const a = (await salva(manuel, { titolo: 'Da registrare', scadenza: g(9) })).attivita;
  await salva(manuel, { id: a.id, titolo: 'Registrata' });
  await manuel('faiAttivita', { id: a.id });
  const reg = await manuel('registro', { tabella: 'attivita', idRiga: String(a.id) });
  assert.equal(reg.righe.length, 3);
  assert.equal(reg.righe[2].prima, null);
  assert.deepEqual(reg.righe[1].prima, { titolo: 'Da registrare' });
  assert.equal(reg.righe[0].dopo.stato, 'fatta');
  assert.equal(reg.righe[0].azione, 'faiAttivita');
  assert.equal(reg.righe[0].utente, 'Manuel Gasparotto');
});

test('dashboard: attivita\' scadute, appuntamenti di oggi, agenda; il collaboratore solo le sue', async () => {
  const d = await manuel('dashboard');
  assert.ok(d.urgenti.some(v => v.tipo === 'attivita' && v.gravita === 'urgente'), 'le scadute');
  const sop = d.settimana.find(v => v.titolo === 'Sopralluogo quadri del magazzino Batokyo oggi alle 14:30');
  assert.ok(sop);
  assert.deepEqual(sop.collegamento, { pagina: 'calendario', filtro: { giorno: T } });
  assert.ok(d.numeri.attivita.scadute >= 2);
  assert.ok(d.numeri.attivita.appuntamentiOggi >= 1);
  assert.ok(d.agenda.oggi.some(a => a.tipo === 'sopralluogo' && a.inizio === T + 'T14:30:00'));
  assert.ok(d.agenda.settimana.every(a => a.giorno > T && a.giorno <= g(7)));
  assert.ok(d.pianificare.some(v => v.tipo === 'attivita' && /non assegnat/.test(v.titolo)));
  const m = await marco('dashboard');
  assert.ok(m.agenda.oggi.every(a => a.assegnataA === MARCO));
  assert.ok(m.agenda.settimana.every(a => a.assegnataA === MARCO));
  assert.equal(m.numeri.attivita.scadute, 0, 'quelle scadute sono di Manuel e Laura');
  assert.equal(JSON.stringify(m).includes('€'), false);
});

test('esporta attivita\': il collaboratore esporta quelle che vede', async () => {
  const r = await manuel('esporta', { cosa: 'attivita', stato: 'tutte' });
  assert.equal(r.ok, true, r.errore);
  const csv = Buffer.from(r.base64, 'base64').toString('utf8');
  const righe = csv.slice(1).trim().split('\r\n');
  assert.deepEqual(righe[0].split(';').slice(0, 4), ['Giorno', 'Titolo', 'Tipo', 'Stato']);
  assert.ok(csv.includes('Chiamare Rossi per il collaudo'));
  const suo = Buffer.from((await marco('esporta', { cosa: 'attivita', stato: 'tutte' })).base64, 'base64').toString('utf8');
  assert.equal(suo.includes('Chiamare Rossi per il collaudo'), false);
  assert.ok(suo.includes('Sopralluogo quadri del magazzino Batokyo'));
});
