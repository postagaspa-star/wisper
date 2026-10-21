// Attività e calendario di Wisper Ufficio (fase 2), provati con Node:
// i gruppi di "cosa devo fare oggi", i segmenti, le ricorrenze, il calendario,
// le sovrapposizioni, la pianificazione e i promemoria. Più il server finto della visita.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.WisperConti = require('../ui/conti.js');
global.WisperRegole = require('../ui/regole.js');
global.WisperRegolePreventivi = require('../ui/regole-preventivi.js');
const RA = require('../ui/regole-attivita.js');
global.WisperRegoleAttivita = RA;
const E = require('../ui/esempio.js');

const OGGI = '2026-10-22'; // un giovedì
const att = (id, extra) => RA.normalizzaAttivita(Object.assign({ id, titolo: 'Attività ' + id, stato: 'da_fare' }, extra));

test('attività: il giorno è la scadenza, o l\'inizio per appuntamenti e sopralluoghi', () => {
  assert.equal(RA.giornoDi(att(1, { scadenza: '2026-10-23' })), '2026-10-23');
  assert.equal(RA.giornoDi(att(1, { tipo: 'appuntamento', inizio: '2026-10-24T08:30:00' })), '2026-10-24');
  assert.equal(RA.giornoDi(att(1, {})), '');
  assert.equal(RA.ora('2026-10-24T08:30:00'), '8:30');
  assert.equal(RA.oreDecimali('2026-10-24T14:45:00'), 14.75);
});

test('attività: Scadute, Oggi, Prossimi giorni, Senza data, nell\'ordine e senza i gruppi vuoti', () => {
  const lista = [
    att(1, { scadenza: '2026-10-25', titolo: 'B' }), att(2, { scadenza: '2026-10-20' }), att(3, {}),
    att(4, { tipo: 'appuntamento', inizio: '2026-10-22T14:30:00' }), att(5, { scadenza: OGGI, priorita: 'alta' }),
    att(6, { tipo: 'appuntamento', inizio: '2026-10-22T08:30:00' }), att(7, { scadenza: '2026-10-25', titolo: 'A' }),
  ];
  const g = RA.raggruppa(lista.concat([att(8, { scadenza: '2026-10-29' }), att(9, { scadenza: '2026-10-30' })]), OGGI);
  assert.deepEqual(g.map(x => [x.chiave, x.voci.map(a => a.id)]), [['scadute', [2]], ['oggi', [6, 4, 5]], ['prossimi', [7, 1, 8]], ['piuAvanti', [9]], ['senzaData', [3]]],
    '"Prossimi giorni" sono i 7 dopo oggi (fino al 29), oltre "Più avanti"');
  assert.deepEqual(g.map(x => x.nome), ['Scadute', 'Oggi', 'Prossimi giorni', 'Più avanti', 'Senza data']);
  assert.deepEqual(RA.raggruppa([att(1, {})], OGGI).map(x => x.nome), ['Senza data']);
  assert.equal(RA.gruppoDi(att(1, { scadenza: '2026-10-01', stato: 'fatta' }), OGGI), 'oggi', 'una fatta non è scaduta');
});

test('attività: di una ricorrenza si vede solo la prossima volta futura (come sul telefono)', () => {
  // La riunione di ogni lunedì: 13 lunedì nei prossimi 90 giorni, se ne vede uno.
  const lunedi = Array.from({ length: 13 }, (x, i) => att(10 + i, { tipo: 'appuntamento', inizio: RA.piuGiorni('2026-10-26', 7 * i) + 'T09:00:00', idRicorrenza: 9 }));
  const g = RA.raggruppa(lunedi.concat([att(4, { scadenza: '2026-10-24' })]), OGGI);
  assert.deepEqual(g.map(x => [x.chiave, x.voci.map(a => a.id)]), [['prossimi', [4, 10]]]);
  // Quella di oggi resta in Oggi e la prossima futura si vede lo stesso; anche una lontana va in Più avanti da sola.
  const conOggi = RA.raggruppa([att(1, { scadenza: OGGI, idRicorrenza: 5 }), att(2, { scadenza: '2026-10-29', idRicorrenza: 5 }), att(3, { scadenza: '2026-11-05', idRicorrenza: 5 }),
    att(6, { scadenza: '2027-01-01', idRicorrenza: 7 }), att(7, { scadenza: '2028-01-01', idRicorrenza: 7 })], OGGI);
  assert.deepEqual(conOggi.map(x => [x.chiave, x.voci.map(a => a.id)]), [['oggi', [1]], ['prossimi', [2]], ['piuAvanti', [6]]]);
  // Le scadute di una serie si vedono tutte.
  assert.deepEqual(RA.raggruppa([att(1, { scadenza: '2026-10-12', idRicorrenza: 5 }), att(2, { scadenza: '2026-10-19', idRicorrenza: 5 })], OGGI)[0].voci.map(a => a.id), [1, 2]);
});

test('attività: Mie, Squadra, Non assegnate; le annullate mai, le fatte solo di oggi', () => {
  const lista = [att(1, { assegnataA: 1 }), att(2, { assegnataA: 3 }), att(3, {}), att(4, { assegnataA: 1, stato: 'annullata' }),
    att(5, { assegnataA: 1, stato: 'fatta', fattaIl: OGGI + 'T10:00:00' }), att(6, { assegnataA: 1, stato: 'fatta', fattaIl: '2026-10-20T10:00:00' })];
  assert.deepEqual(RA.filtraAttivita(lista, 'mie', 1, OGGI).map(a => a.id), [1, 5]);
  assert.deepEqual(RA.filtraAttivita(lista, 'squadra', 1, OGGI).map(a => a.id), [1, 2, 3, 5]);
  assert.deepEqual(RA.filtraAttivita(lista, 'libere', 1, OGGI).map(a => a.id), [3]);
});

test('attività: la riga sotto il titolo, come nel prototipo', () => {
  assert.equal(RA.dettaglio(att(1, { idCommessa: '26ST045', scadenza: '2026-10-21' }), OGGI), '26ST045 · ieri');
  assert.equal(RA.dettaglio(att(1, { idCommessa: '26ST046', tipo: 'sopralluogo', inizio: OGGI + 'T14:30:00' }), OGGI), '26ST046 · 14:30');
  assert.equal(RA.dettaglio(att(1, { idCommessa: '26ST044', scadenza: OGGI }), OGGI), '26ST044', 'nel gruppo Oggi "oggi" non si ripete');
  assert.equal(RA.dettaglio(att(1, { scadenza: '2026-10-26' }), OGGI), 'Studio · lunedì 26');
  assert.equal(RA.dettaglio(att(1, { tipo: 'appuntamento', inizio: '2026-10-23T09:00:00' }), OGGI), 'Studio · domani 9:00');
  assert.equal(RA.quandoBreve('2026-11-15', OGGI), '15 novembre');
});

test('calendario: la settimana da lunedì, il numero della settimana, il mese a settimane intere', () => {
  assert.deepEqual(RA.settimanaDi(OGGI), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.deepEqual(RA.settimanaDi('2026-10-25'), RA.settimanaDi(OGGI), 'la domenica è nella stessa settimana');
  assert.equal(RA.numeroSettimana(OGGI), 43);
  assert.equal(RA.numeroSettimana('2026-01-01'), 1);
  const m = RA.grigliaMese('2026-10');
  assert.equal(m[0][0], '2026-09-28');
  assert.equal(m[m.length - 1][6], '2026-11-01');
  assert.equal(m.length, 5);
  assert.equal(RA.nomeMese('2026-10-05'), 'Ottobre 2026');
  assert.equal(RA.nomeGiorno('2026-10-22', true), 'Gio 22');
});

test('calendario: i blocchi del giorno, affiancati quando si sovrappongono', () => {
  const lista = [
    att(1, { tipo: 'appuntamento', inizio: OGGI + 'T08:30:00', fine: OGGI + 'T10:00:00' }),
    att(2, { tipo: 'appuntamento', inizio: OGGI + 'T09:00:00', fine: OGGI + 'T11:00:00' }),
    att(3, { tipo: 'appuntamento', inizio: OGGI + 'T14:00:00' }),
    att(4, { scadenza: OGGI }),
    att(5, { tipo: 'appuntamento', inizio: OGGI + 'T15:00:00', stato: 'annullata' }),
  ];
  const b = RA.blocchiDelGiorno(lista, OGGI);
  assert.deepEqual(b.conOra.map(x => [x.a.id, x.da, x.a2, x.colonna, x.colonne]), [[1, 8.5, 10, 0, 2], [2, 9, 11, 1, 2], [3, 14, 15, 0, 1]]);
  assert.deepEqual(b.tuttoIlGiorno.map(a => a.id), [4]);
});

test('calendario: un appuntamento sovrapposto a un altro della stessa persona', () => {
  const lista = [
    att(1, { tipo: 'appuntamento', assegnataA: 1, inizio: OGGI + 'T08:30:00', fine: OGGI + 'T10:00:00' }),
    att(2, { tipo: 'appuntamento', assegnataA: 3, inizio: OGGI + 'T09:00:00', fine: OGGI + 'T10:00:00' }),
    att(3, { tipo: 'appuntamento', assegnataA: 1, inizio: OGGI + 'T10:00:00', fine: OGGI + 'T11:00:00' }),
    att(4, { tipo: 'appuntamento', assegnataA: 1, inizio: OGGI + 'T09:30:00', fine: OGGI + 'T09:45:00', stato: 'fatta' }),
  ];
  const nuovo = { id: 9, tipo: 'appuntamento', assegnataA: 1, inizio: OGGI + 'T09:00:00', fine: OGGI + 'T10:30:00' };
  assert.deepEqual(RA.sovrapposti(nuovo, lista).map(a => a.id), [1, 3], 'stessa persona, non le fatte, non altre persone');
  assert.deepEqual(RA.sovrapposti(Object.assign({}, nuovo, { inizio: OGGI + 'T07:30:00', fine: '' }), lista).map(a => a.id), [], 'senza fine dura un\'ora: 7:30-8:30 tocca appena');
  assert.deepEqual(RA.sovrapposti(Object.assign({}, nuovo, { assegnataA: null }), lista), [], 'non assegnato: niente');
  assert.deepEqual(RA.sovrapposti(lista[0], lista).map(a => a.id), [], 'non con sé stesso, e 10:00 non tocca 8:30-10:00');
});

test('ricorrenze: a parole, le prossime date, dalla scelta del modulo (1 lunedì … 7 domenica)', () => {
  assert.equal(RA.ricorrenzaAParole({ regola: 'anni', ogni: 1 }), 'ogni anno');
  assert.equal(RA.ricorrenzaAParole({ regola: 'settimane', ogni: 1, giorniSettimana: [1] }), 'ogni settimana il lunedì');
  assert.equal(RA.ricorrenzaAParole({ regola: 'settimane', ogni: 2, giorniSettimana: [7, 3] }), 'ogni 2 settimane mercoledì, domenica');
  assert.equal(RA.ricorrenzaAParole({ regola: 'mesi', ogni: 3, fine: '2026-12-31' }), 'ogni 3 mesi fino al 31/12/2026');
  assert.equal(RA.ricorrenzaAParole(null), '');
  assert.deepEqual(RA.prossimeDate({ regola: 'giorni', ogni: 2 }, OGGI, 3), ['2026-10-22', '2026-10-24', '2026-10-26']);
  assert.deepEqual(RA.prossimeDate({ regola: 'mesi', ogni: 1 }, '2026-10-31', 2), ['2026-10-31', '2026-12-01']);
  assert.deepEqual(RA.prossimeDate({ regola: 'settimane', ogni: 1, giorniSettimana: [1, 4] }, OGGI, 4), ['2026-10-22', '2026-10-26', '2026-10-29', '2026-11-02']);
  assert.deepEqual(RA.prossimeDate({ regola: 'settimane', ogni: 1, giorniSettimana: '7' }, OGGI, 1), ['2026-10-25'], 'anche come testo, 7 = domenica');
  assert.deepEqual(RA.prossimeDate({ regola: 'giorni', ogni: 1, fine: '2026-10-23' }, OGGI, 5), ['2026-10-22', '2026-10-23']);
  assert.deepEqual(RA.ricorrenzaDa('settimane', OGGI), { regola: 'settimane', ogni: 1, giorniSettimana: [4], fine: '' });
  assert.equal(RA.ricorrenzaDa('', OGGI), null);
  assert.equal(RA.giornoIso('2026-10-25'), 7);
});

test('pianificazione: persone × giorni, a sinistra tutte le non assegnate (di una serie solo la prima)', () => {
  const giorni = RA.settimanaDi(OGGI).slice(0, 5);
  const lista = [att(1, { assegnataA: 1, scadenza: '2026-10-20' }), att(2, { assegnataA: 3, tipo: 'sopralluogo', inizio: '2026-10-22T14:30:00' }),
    att(3, {}), att(4, { scadenza: '2026-11-30' }), att(5, { scadenza: '2026-10-26', idRicorrenza: 2 }), att(6, { scadenza: '2026-11-02', idRicorrenza: 2 }),
    att(7, { assegnataA: 1, scadenza: '2026-10-21', stato: 'fatta' })];
  const p = RA.pianificazione(lista, giorni, [{ id: 1, nome: 'Manuel' }, { id: 3, nome: 'Marco' }]);
  assert.deepEqual(p.righe.map(r => r.giorni.map(g => g.map(a => a.id))), [[[], [1], [], [], []], [[], [], [], [2], []]]);
  assert.deepEqual(p.libere.map(a => a.id), [5, 4, 3]);
});

test('promemoria: quando suonano, solo le mie, una volta sola', () => {
  const lista = [
    att(1, { tipo: 'appuntamento', assegnataA: 1, inizio: OGGI + 'T08:30:00', promemoriaMinuti: 15 }),
    att(2, { assegnataA: 1, scadenza: OGGI, promemoriaMinuti: 0 }),
    att(3, { tipo: 'appuntamento', assegnataA: 3, inizio: OGGI + 'T08:30:00', promemoriaMinuti: 15 }),
    att(4, { assegnataA: 1, scadenza: OGGI, promemoriaMinuti: 60, stato: 'fatta' }),
    att(5, { assegnataA: 1, scadenza: '2026-10-23', promemoriaMinuti: 1440 }),
    att(6, { tipo: 'appuntamento', assegnataA: 1, inizio: OGGI + 'T18:00:00', promemoriaMinuti: null }),
  ];
  assert.equal(RA.momentoPromemoria(lista[0]).getHours(), 8);
  assert.equal(RA.momentoPromemoria(lista[0]).getMinutes(), 15);
  assert.equal(RA.momentoPromemoria(lista[1]).getHours(), 9, 'per la sola scadenza il riferimento sono le 9:00');
  const alle = ora => new Date(OGGI + 'T' + ora + ':00');
  assert.deepEqual(RA.promemoriaDaDare(lista, alle('08:00'), 1, {}).map(x => x.a.id), []);
  const dalle915 = RA.promemoriaDaDare(lista, alle('09:15'), 1, {});
  assert.deepEqual(dalle915.map(x => x.a.id), [1, 2, 5], 'quello di domani col giorno prima (alle 9 di oggi) suona già');
  const visti = {};
  dalle915.forEach(x => { visti[x.chiave] = 1; });
  assert.deepEqual(RA.promemoriaDaDare(lista, alle('09:20'), 1, visti), [], 'già visti: niente');
  assert.deepEqual(RA.promemoriaDaDare(lista, alle('09:15'), 1, {}, 30).map(x => x.a.id), [2, 5], 'quello delle 8:15 è fuori dalla mezzora');
  assert.deepEqual(RA.promemoriaDaDare(lista, alle('09:15'), 1, {}, 10).map(x => x.a.id), [], 'oltre la finestra non si ridice');
});

test('dalle risposte del server: chiavi alla JavaScript, checklist e allegati sempre elenchi', () => {
  const a = RA.normalizzaAttivita({ id: 1, titolo: 'x', assegnata_a: 3, tutto_il_giorno: 1, checklist: [{ id: 1, testo: 'a', fatta: 0 }], file: [{ id: 'f' }] });
  assert.equal(a.assegnataA, 3);
  assert.equal(a.tuttoIlGiorno, true);
  assert.equal(a.checklist[0].fatta, false);
  assert.equal(a.allegati.length, 1);
  assert.equal(a.tipo, 'attivita');
  assert.equal(a.priorita, 'normale');
  assert.equal(RA.normalizzaAttivita({ id: 2, assegnataA: '' }).assegnataA, null);
});

// ------------------------------------------------------------------ il server finto della visita (§13.6, §13.7)

test('esempio: senza date le aperte, con le date il periodo; il collaboratore vede le sue, le libere e quelle delle sue commesse', () => {
  const d = E.crea({ oggi: OGGI });
  const aperte = E.gestisci(d, 'GET', '/server/attivita').attivita;
  assert.ok(aperte.every(a => a.stato === 'da_fare' || a.stato === 'in_corso'));
  assert.ok(aperte.some(a => !a.giorno), 'anche quelle senza data');
  const periodo = E.gestisci(d, 'GET', '/server/attivita?da=2026-10-19&a=2026-10-25').attivita;
  assert.ok(periodo.some(a => a.stato === 'fatta'), 'nel periodo anche le fatte');
  assert.ok(periodo.every(a => a.giorno >= '2026-10-19' && a.giorno <= '2026-10-25'));
  const a4 = aperte.find(a => a.id === 4);
  assert.deepEqual(a4.ricorrenza.regola, 'anni');
  assert.equal(a4.assegnata, 'Manuel Gasparotto');
  const m = E.crea({ oggi: OGGI, chi: 'marco' });
  const sue = E.gestisci(m, 'GET', '/server/attivita').attivita;
  assert.ok(sue.every(a => a.assegnataA === null || a.assegnataA === 3 || ['26ST044', '26ST046'].includes(a.idCommessa)));
  assert.ok(!sue.some(a => a.titolo === 'Controllare la PEC dello studio'), 'non quelle di Laura');
  assert.equal(sue.find(a => a.id === 3).puoScrivere, false, 'quella di Manuel la vede ma non la cambia');
  assert.equal(E.gestisci(m, 'POST', '/server/salvaAttivita', { attivita: { id: 3, titolo: 'x' } }).permesso, false);
});

test('esempio: sovrapposizione = serveConferma; con conferma si salva', () => {
  const d = E.crea({ oggi: OGGI });
  const nuovo = { titolo: 'Telefonata', tipo: 'appuntamento', assegnataA: 1, inizio: OGGI + 'T09:00:00', fine: OGGI + 'T09:30:00' };
  const no = E.gestisci(d, 'POST', '/server/salvaAttivita', { attivita: nuovo });
  assert.equal(no.ok, false);
  assert.equal(no.serveConferma, true);
  assert.match(no.errore, /Si sovrappone a: Riunione cantiere Batokyo \(8:30-10:00\)/);
  assert.equal(no.sovrapposte[0].assegnata, 'Manuel Gasparotto');
  const si = E.gestisci(d, 'POST', '/server/salvaAttivita', { attivita: nuovo, conferma: true });
  assert.ok(si.ok);
});

test('esempio: una serie settimanale, poi "solo questa", "da questa in poi", e saltarne una', () => {
  const d = E.crea({ oggi: OGGI });
  const g = (azione, corpo) => E.gestisci(d, 'POST', '/server/' + azione, corpo);
  const s = g('salvaAttivita', { attivita: { titolo: 'Giro cantieri', scadenza: '2026-10-26', assegnataA: 1, ricorrenza: { regola: 'settimane', ogni: 1, giorniSettimana: [1] } } });
  assert.ok(s.ok);
  assert.ok(s.occorrenze >= 12, 'le occorrenze dei prossimi 90 giorni');
  const serie = d.attivita.filter(a => a.idRicorrenza === s.attivita.idRicorrenza).sort((a, b) => a.scadenza.localeCompare(b.scadenza));
  assert.ok(serie.every(a => new Date(a.scadenza + 'T12:00:00').getDay() === 1), 'tutte di lunedì');
  g('salvaAttivita', { attivita: { id: serie[1].id, titolo: 'Giro cantieri (solo questo)' }, perRicorrenza: 'questa' });
  assert.equal(serie[2].titolo, 'Giro cantieri');
  g('salvaAttivita', { attivita: { id: serie[3].id, titolo: 'Giro cantieri e magazzino' }, perRicorrenza: 'future' });
  assert.equal(serie[2].titolo, 'Giro cantieri', 'prima di quella non cambia');
  assert.equal(serie[5].titolo, 'Giro cantieri e magazzino', 'dopo sì');
  const salta = g('togliAttivita', { id: serie[4].id, perRicorrenza: 'questa' });
  assert.equal(salta.tolte, 1, 'saltarne una non rompe la serie');
  assert.equal(serie[6].stato, 'da_fare');
  assert.ok(g('faiAttivita', { id: serie[0].id, fatta: true }).attivita.fattaIl);
});
