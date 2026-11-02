// Ore, spese e trasferte di Wisper Ufficio (fase 3), provate con Node:
// i conti condivisi col server (server/prove/casi-ore-spese.json: stessi numeri e
// stesse frasi), la regola per scrivere una cella del timesheet, gli stati, il
// costo della commessa con le ore registrate, i dati di esempio della visita.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../ui/conti.js');
global.WisperConti = C;
const R = require('../ui/regole.js');
global.WisperRegole = R;
global.WisperRegolePreventivi = require('../ui/regole-preventivi.js');
global.WisperRegoleAttivita = require('../ui/regole-attivita.js');
const RO = require('../ui/regole-ore-spese.js');
global.WisperRegoleOreSpese = RO;
const E = require('../ui/esempio.js');

// ------------------------------------------------------------------ i casi del server (§14.15)

const FILE_CASI = path.join(__dirname, '..', '..', 'server', 'prove', 'casi-ore-spese.json');
const casi = JSON.parse(fs.readFileSync(FILE_CASI, 'utf8'));

for (const c of casi.ore) {
  test('ore da inizio e fine · caso del server · ' + c.nome, () => {
    if (c.errore) {
      assert.throws(() => RO.oreDaOrari(c.inizio, c.fine, c.pausaMinuti), e => e.message === c.errore);
      assert.equal(RO.provaOreDaOrari(c.inizio, c.fine, c.pausaMinuti).errore, c.errore);
    } else {
      assert.deepEqual(RO.oreDaOrari(c.inizio, c.fine, c.pausaMinuti), c.atteso);
    }
  });
}

for (const c of casi.trasferte) {
  test('rimborso della trasferta · caso del server · ' + c.nome, () => {
    assert.deepEqual(RO.rimborsoTrasferta(c.trasferta), c.atteso);
  });
}

for (const c of casi.rimborsi) {
  test('rimborsi dovuti · caso del server · ' + c.nome, () => {
    const r = RO.rimborsiDovuti(c.spese, c.trasferte);
    assert.deepEqual(r.map(p => ({ idUtente: p.idUtente, totale: p.totale, inAttesa: p.inAttesa, spese: p.spese, trasferte: p.trasferte, km: p.km })), c.atteso);
  });
}

test('rimborsi: le voci dovute sono le spese approvate pagate da lei e le trasferte approvate', () => {
  const c = casi.rimborsi[0];
  const marco = RO.rimborsiDovuti(c.spese, c.trasferte).find(p => p.idUtente === 3);
  assert.deepEqual(marco.voci.map(v => v.tipo + v.id), ['spesa1', 'trasferta1']);
});

// ------------------------------------------------------------------ stati e pillole

test('stati: approvata senza pillola, respinta col motivo, sempre con la parola', () => {
  assert.equal(RO.pillolaStato({ stato: 'approvata' }), null);
  assert.deepEqual(RO.pillolaStato({ stato: 'da_approvare' }), { testo: 'Da approvare', colore: 'giallo' });
  assert.deepEqual(RO.pillolaStato({ stato: 'bozza' }), { testo: 'Bozza', colore: 'grigio' });
  assert.deepEqual(RO.pillolaStato({ stato: 'respinta', motivoRifiuto: 'Manca lo scontrino' }), { testo: 'Respinta: Manca lo scontrino', colore: 'rosso' });
});

test('rapportini: pillola "Da approvare" o "Respinto: motivo", e niente invio al cliente prima', () => {
  assert.equal(RO.pillolaApprovazione({ statoApprovazione: '' }), null);
  assert.equal(RO.pillolaApprovazione({ statoApprovazione: 'approvato' }), null);
  assert.deepEqual(RO.pillolaApprovazione({ statoApprovazione: 'da_approvare' }), { testo: 'Da approvare', colore: 'giallo' });
  assert.deepEqual(RO.pillolaApprovazione({ statoApprovazione: 'respinto', motivoRifiuto: 'Le ore di viaggio mancano' }), { testo: 'Respinto: Le ore di viaggio mancano', colore: 'rosso' });
  // Le frasi del server (architettura.md §14.7).
  assert.equal(RO.bloccoInvio({ id: 'RAP/2026/0012', statoApprovazione: 'da_approvare' }), 'Il rapportino RAP/2026/0012 aspetta l\'approvazione: si manda al cliente e si fattura solo dopo');
  assert.equal(RO.bloccoInvio({ id: 'RAP/2026/0012', statoApprovazione: 'respinto', motivoRifiuto: 'Le ore di viaggio mancano' }),
    'Il rapportino RAP/2026/0012 è stato respinto (Le ore di viaggio mancano): correggilo e rimandalo in approvazione');
  assert.equal(RO.bloccoInvio({ id: 'RAP/2026/0012', statoApprovazione: 'approvato' }), '');
  assert.equal(RO.bloccoInvio({ id: 'RAP/2026/0001', statoApprovazione: '' }), '');
});

test('a chi va: Al cliente blu, Allo studio grigia, Mia viola; di base al cliente se c\'è una commessa', () => {
  assert.deepEqual(RO.destinazione('cliente'), { valore: 'cliente', parola: 'Al cliente', colore: 'blu' });
  assert.deepEqual(RO.destinazione('studio'), { valore: 'studio', parola: 'Allo studio', colore: 'grigio' });
  assert.deepEqual(RO.destinazione('mia'), { valore: 'personale', parola: 'Mia', colore: 'viola' });
  assert.equal(RO.destinazioneDiBase({ idCommessa: '26ST001' }), 'cliente');
  assert.equal(RO.destinazioneDiBase({ idCliente: 'C002' }), 'cliente');
  assert.equal(RO.destinazioneDiBase({ idRapportino: 'RAP/2026/0002' }), 'cliente');
  assert.equal(RO.destinazioneDiBase({}), 'studio');
  assert.equal(RO.categoria('alloggio').nome, 'Alloggio');
  assert.equal(RO.categoria('boh').valore, 'altro');
  assert.equal(RO.CATEGORIE.length, 10);
});

// ------------------------------------------------------------------ timesheet

const riga = (id, data, ore, extra) => Object.assign({ id, idUtente: 1, data, ore, idCommessa: '26ST001', commessa: 'Nuovo magazzino', inizio: '', fine: '', stato: 'approvata', puoScrivere: true, bloccata: '', descrizione: '' }, extra || {});

test('timesheet: righe = commesse (Studio in fondo), colonne = giorni, celle sommate senza le respinte', () => {
  const sett = RO.settimanaDi('2026-10-22');
  assert.deepEqual(sett, ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  const ore = [
    riga(1, '2026-10-19', 3, { idCommessa: '26ST002', commessa: 'Quadro capannone' }),
    riga(2, '2026-10-20', 6),
    riga(3, '2026-10-20', 1.5),
    riga(4, '2026-10-21', 2, { idCommessa: '', commessa: '' }),
    riga(5, '2026-10-21', 4, { stato: 'respinta' }),
  ];
  const giorni = RO.giorniDaMostrare(sett, ore, []);
  assert.deepEqual(giorni, sett.slice(0, 5), 'sabato e domenica solo con ore');
  const t = RO.timesheet(ore, giorni, ['26st045'], k => ({ '26ST045': 'Linea 3' })[k] || '');
  assert.deepEqual(t.righe.map(r => r.chiave), ['26ST001', '26ST002', '26ST045', '']);
  assert.equal(t.righe[2].nome, 'Linea 3', 'una commessa aggiunta a mano, ancora senza ore');
  assert.equal(t.righe[3].nome, 'Attività dello studio');
  assert.equal(t.righe[0].celle['2026-10-20'].ore, 7.5);
  assert.equal(t.righe[0].celle['2026-10-21'].ore, 0, 'la respinta non conta');
  assert.equal(t.righe[0].celle['2026-10-21'].righe.length, 1, 'ma resta nella cella');
  assert.equal(t.righe[0].totale, 7.5);
  assert.deepEqual(t.perGiorno, { '2026-10-19': 3, '2026-10-20': 7.5, '2026-10-21': 2, '2026-10-22': 0, '2026-10-23': 0 });
  assert.equal(t.totale, 12.5);
  assert.deepEqual(RO.giorniDaMostrare(sett, [riga(9, '2026-10-24', 2)], []).slice(-1), ['2026-10-24']);
});

test('timesheet: la regola sicura per scrivere una cella', () => {
  const cella = righe => ({ data: '2026-10-20', ore: 0, righe });
  assert.deepEqual(RO.cellaScrivibile(cella([]), true), { scrivibile: true, riga: null, perche: '' });
  const sola = riga(2, '2026-10-20', 6, { descrizione: 'Schema unifilare' });
  assert.equal(RO.cellaScrivibile(cella([sola]), true).scrivibile, true, 'una riga a mano, anche con la descrizione: cambiano solo le ore');
  assert.equal(RO.cellaScrivibile(cella([sola, riga(3, '2026-10-20', 1)]), true).perche, 'piu');
  assert.equal(RO.cellaScrivibile(cella([riga(4, '2026-10-20', 8, { inizio: '08:00', fine: '17:00' })]), true).perche, 'orari');
  assert.equal(RO.cellaScrivibile(cella([riga(5, '2026-10-20', 0, { inizio: '08:10', fine: '' })]), true).perche, 'orari', 'la bozza del timer');
  assert.equal(RO.cellaScrivibile(cella([riga(6, '2026-10-20', 3, { puoScrivere: false, bloccata: 'Sono già approvate: per cambiarle chiedi a chi approva' })]), true).perche, 'bloccata');
  assert.equal(RO.cellaScrivibile(cella([]), false).perche, 'sola');

  assert.deepEqual(RO.azioneCella(cella([]), '1,5', true), { tipo: 'crea', ore: 1.5 });
  assert.deepEqual(RO.azioneCella(cella([]), '', true), { tipo: 'niente' });
  assert.deepEqual(RO.azioneCella(cella([sola]), '7', true), { tipo: 'cambia', id: 2, ore: 7, prima: 6 });
  assert.deepEqual(RO.azioneCella(cella([sola]), '6', true), { tipo: 'niente' });
  assert.deepEqual(RO.azioneCella(cella([sola]), '0', true), { tipo: 'togli', id: 2, prima: 6 });
  assert.deepEqual(RO.azioneCella(cella([riga(7, '2026-10-20', 2, { stato: 'respinta' })]), '2', true), { tipo: 'cambia', id: 7, ore: 2, prima: 2 }, 'la respinta si rimanda');
  assert.equal(RO.azioneCella(cella([sola, riga(3, '2026-10-20', 1)]), '9', true).tipo, 'apri');
  assert.deepEqual(RO.azioneCella(cella([]), 'otto', true), { tipo: 'errore', errore: 'Scrivi le ore con la virgola, per esempio 1,5' });
  assert.deepEqual(RO.azioneCella(cella([]), '25', true), { tipo: 'errore', errore: 'Ore: da 0 a 24' });
});

test('timesheet: le ore si scrivono con la virgola (anche col punto o con la h)', () => {
  assert.deepEqual(RO.leggiCella('1,5'), { ore: 1.5 });
  assert.deepEqual(RO.leggiCella('2.25'), { ore: 2.25 });
  assert.deepEqual(RO.leggiCella('8 h'), { ore: 8 });
  assert.deepEqual(RO.leggiCella(' '), { ore: 0 });
  assert.equal(RO.valoreCella(7.5), '7,5');
  assert.equal(RO.valoreCella(0), '');
  assert.equal(RO.titoloSettimana(RO.settimanaDi('2026-10-22')), 'Dal 19 al 25 ottobre');
  assert.equal(RO.titoloSettimana(RO.settimanaDi('2026-10-29')), 'Dal 26 ottobre al 1 novembre');
  assert.equal(RO.giornoBreve('2026-10-20'), 'Mar 20');
  assert.equal(RO.giornoLungo('2026-10-20'), 'martedì 20 ottobre');
});

test('timer: il tempo che scorre da quello del server', () => {
  assert.equal(RO.durata(5432), '01:30:32');
  assert.equal(RO.durata(0), '00:00:00');
  assert.equal(RO.secondiTimer({ secondi: 100 }, 1000000, 1065000), 165);
  assert.equal(RO.secondiTimer(null, 0, 0), 0);
});

test('approvazioni: il numero a destra e le frasi dopo', () => {
  assert.equal(RO.quantoVoce({ quanto: 4.5, unita: 'ore' }), '4,5 h');
  assert.equal(RO.quantoVoce({ quanto: 230, unita: 'euro' }), '230,00 €');
  assert.equal(RO.quantoVoce({ quanto: 1234.5, unita: 'euro' }), '1.234,50 €');
  assert.equal(RO.chiaveVoce({ tipo: 'rapportino', id: 'RAP/2026/0006' }), 'rapportino:RAP/2026/0006');
  assert.equal(RO.fraseDecisione(4, 'approva'), '4 approvate');
  assert.equal(RO.fraseDecisione(1, 'respingi'), '1 respinta, col motivo');
  assert.equal(RO.fraseDecisione(2, 'annulla'), '2 rimesse da approvare');
});

test('periodi: i mesi e i loro giorni', () => {
  assert.deepEqual(RO.periodoMese('2026-02'), { da: '2026-02-01', a: '2026-02-28' });
  assert.deepEqual(RO.periodoMese('2026-10'), { da: '2026-10-01', a: '2026-10-31' });
  assert.equal(RO.spostaMese('2026-12', 1), '2027-01');
  assert.equal(RO.spostaMese('2026-01', -1), '2025-12');
  assert.equal(RO.larghezza(5, 10), 50);
  assert.equal(RO.larghezza(5, 0), 0);
  assert.equal(RO.testoPercentuale(86), '86% fatturabili');
  assert.equal(RO.testoPercentuale(null), '');
});

// ------------------------------------------------------------------ costo della commessa (§14.11)

test('costo della commessa: senza ore registrate, spese e trasferte è quello della fase 1 al centesimo', () => {
  const commessa = { id: '26ST001', idCliente: 'C002', budgetOre: 40, prezzoOrario: 45, costoOrario: 20 };
  const rapportini = [
    { id: 'R1', idCommessa: '26ST001', stato: 'FIRMATO', oreLavoro: 6, oreExtra: 1, oreViaggio: 1, oreTotali: 8, km: 96, euroKm: 0.76, spese: 14.5, totale: 400, costoOrario: 20 },
    { id: 'R2', idCommessa: '26ST001', stato: 'BOZZA', oreLavoro: 4, oreExtra: 0, oreViaggio: 0, oreTotali: 4, km: 0, euroKm: 0.76, spese: 0, totale: 180, costoOrario: 20 },
  ];
  const k = C.cruscotto(commessa, rapportini, { EURO_KM: 0.76, COSTO_ORARIO: 18 }, '2026-10-22', { id: 'C002' });
  const lavoro = 11 * 20;
  const cc = { lavoro, lavoroNoto: true, auto: 72.96, speseRapportini: 14.5, oreRegistrate: 0, costoOreRegistrate: 0, speseFuoriRapportini: 0, trasferte: 0, kmTrasferte: 0, soloRapportini: 307.46, totale: 307.46 };
  const x = RO.costiConFase3(k, cc);
  assert.equal(x.costoSostenuto, k.costo.totale);
  assert.equal(x.costoAtteso, k.costoAtteso);
  assert.equal(x.margine, k.margine);
  assert.equal(x.margineDaBudget, k.margineDaBudget);
  assert.equal(x.conFase3, false);
});

test('costo della commessa: le ore registrate entrano nel lavoro, spese e trasferte nel costo atteso', () => {
  const k = { valoreAtteso: 3000, previsto: { costoPrevisto: 800 } };
  // L'esempio vero di architettura.md §14.11.
  const cc = { lavoro: 671, lavoroNoto: true, auto: 291.84, speseRapportini: 14.5, oreRegistrate: 26, costoOreRegistrate: 572, speseFuoriRapportini: 245.9, trasferte: 209.76, kmTrasferte: 276, soloRapportini: 977.34, totale: 2005 };
  const x = RO.costiConFase3(k, cc);
  assert.equal(x.costoSostenuto, 2005);
  assert.equal(x.lavoro, 1243);
  assert.equal(x.costoAtteso, 2005, 'il lavoro fatto (1.243 €) supera già quello previsto (800 €)');
  assert.equal(x.margine, 995);
  assert.equal(x.margineDaBudget, false);
  assert.equal(x.conFase3, true);
  // Con un budget più grande del lavoro fatto conta il previsto.
  const y = RO.costiConFase3({ valoreAtteso: 3000, previsto: { costoPrevisto: 1500 } }, cc);
  assert.equal(y.costoAtteso, 2262, '1.500 previsti + 291,84 auto + 14,50 + 245,90 spese + 209,76 trasferte');
  assert.equal(y.margine, 738);
  assert.equal(y.margineDaBudget, true);
  assert.equal(RO.costiConFase3(k, null), null, 'senza costi il server non manda costoCommessa');
});

// ------------------------------------------------------------------ i dati di esempio della visita (fase 3)

const esempio = chi => { const d = E.crea({ chi }); return (p, c) => E.gestisci(d, c ? 'POST' : 'GET', p, c); };

test('esempio: il collaboratore vede e scrive solo le sue ore, non approva, ma vede gli importi delle sue spese', () => {
  const g = esempio('marco');
  const ore = g('/server/ore');
  assert.ok(ore.ore.length && ore.ore.every(o => o.idUtente === 3));
  assert.ok(ore.ore.every(o => !('costo' in o) && !('costoOrario' in o)), 'niente costi delle ore');
  assert.equal(g('/server/daApprovare').permesso, false);
  const spese = g('/server/spese');
  assert.ok(spese.spese.every(s => s.idUtente === 3 && typeof s.importo === 'number'), 'i soldi della persona si vedono (§14.1)');
  const nuova = g('/server/salvaOre', { riga: { ore: 2, idCommessa: '', descrizione: 'Prova' } });
  assert.equal(nuova.riga.stato, 'da_approvare', 'quello che scrive il collaboratore va approvato');
  assert.equal(g('/server/salvaOre', { riga: { ore: 1, idUtente: 1 } }).permesso, false, 'non scrive per gli altri');
});

test('esempio: il titolare approva, Annulla rimette da approvare; respingere vuole il motivo', () => {
  const g = esempio('manuel');
  const d = g('/server/daApprovare');
  assert.ok(d.quante > 0 && d.conAnomalie > 0, 'ci sono cose da approvare, qualcuna con un\'anomalia');
  const v = d.persone[0].voci.find(x => x.tipo === 'ore');
  assert.equal(g('/server/approva', { voci: [{ tipo: v.tipo, id: v.id }] }).fatte, 1);
  // Tutto il periodo: senza date l'elenco è la settimana di oggi, e il lunedì le ore da approvare sono della settimana prima.
  const oreDi = () => g('/server/ore?utente=' + d.persone[0].idUtente + '&da=2000-01-01&a=2100-12-31').ore;
  assert.equal(oreDi().find(o => o.id === v.id).stato, 'approvata');
  g('/server/annullaApprovazione', { voci: [{ tipo: v.tipo, id: v.id }] });
  assert.equal(oreDi().find(o => o.id === v.id).stato, 'da_approvare');
  assert.equal(g('/server/respingi', { voci: [{ tipo: v.tipo, id: v.id }], motivo: ' ' }).errore, 'Scrivi il motivo: arriva a chi l\'ha scritta');
});

test('esempio: timer, trasferta col rimborso, rimborsi dovuti e segna rimborsato', () => {
  const g = esempio('manuel');
  assert.equal(g('/server/timer').timer, null);
  assert.ok(g('/server/avviaTimer', { idCommessa: '' }).timer);
  assert.equal(g('/server/avviaTimer', { idCommessa: '' }).ok, false, 'un timer solo per persona');
  const fermo = g('/server/fermaTimer', {});
  assert.equal(fermo.riga.stato, 'bozza');
  assert.ok(fermo.riga.dalTimer);
  const t = g('/server/salvaTrasferta', { trasferta: { destinazione: 'Thiene', km: 25, andataRitorno: true } }).trasferta;
  assert.deepEqual([t.kmTotali, t.rimborsoKm, t.stato], [50, 38, 'approvata']);
  const r = g('/server/rimborsi').persone.find(p => p.idUtente === 1);
  assert.ok(r.voci.some(v => v.tipo === 'trasferta' && v.id === t.id));
  g('/server/segnaRimborsato', { voci: r.voci.map(v => ({ tipo: v.tipo, id: v.id })) });
  assert.ok(!g('/server/rimborsi').persone.some(p => p.idUtente === 1 && p.totale > 0));
});
