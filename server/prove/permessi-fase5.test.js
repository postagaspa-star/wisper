// Fase 5: chi puo' cosa (fase5.md §11.2) e la Dashboard (§11.1). Ogni ruolo su ogni azione nuova: "si'" vuol dire
// che il server non risponde permesso:false (puo' sempre dire di no per altri motivi: qui le richieste dei si' hanno
// apposta un id che non c'e', cosi' non cambiano niente); "no" vuol dire permesso:false. Poi le voci nuove della
// Dashboard per titolare, collaboratore e lettura, e io.interfaccia.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
// I ticket, i contratti e le scadenze della Dashboard della fase 5 hanno date fisse (la storia del prototipo): queste
// prove le guardano dal giorno del prototipo, giovedi' 22/10/2026, qualunque giorno sia (anche con
// WISPER_OGGI_PROVA). Le altre prove girano sul giorno vero.
giornoDeiPrototipi();

let s;
const chi = {};
test.before(async () => {
  s = await serverDiProva();
  chi.titolare = await s.come('manuel@esempio.it');
  chi.amministrazione = await s.come('laura@esempio.it');
  chi.collaboratore = await s.come('marco@esempio.it');
  chi.lettura = await s.come('lettura@esempio.it');
});
test.after(() => s.ferma());

const RUOLI = ['titolare', 'amministrazione', 'collaboratore', 'lettura'];
const S = 'si';
const N = 'no';

/** [azione, dati, titolare, amministrazione, collaboratore, lettura] */
const MATRICE = [
  // documenti: leggere
  ['documenti', { archivio: true }, S, S, S, S],
  ['documento', { id: 999 }, S, S, S, S],
  ['categorieDocumenti', {}, S, S, S, S],
  ['modelli', {}, S, S, S, S],
  ['componiModello', { chiave: 'LETTERA_LIBERA' }, S, S, S, S],
  ['spazio', {}, S, S, N, N],
  // documenti: scrivere
  ['salvaDocumento', { documento: {} }, S, S, N, N],
  ['caricaVersione', { id: 999 }, S, S, N, N],
  ['approvaVersione', { id: 99999 }, S, S, N, N],
  ['togliVersione', { id: 99999 }, S, S, N, N],
  ['archiviaDocumento', { id: 999 }, S, S, N, N],
  ['inviaDocumento', { id: 999 }, S, S, N, N],
  ['condividiDocumento', { id: 999 }, S, S, N, N],
  ['revocaCondivisione', { id: 999 }, S, S, N, N],
  ['salvaCategoria', { categoria: {} }, S, N, N, N],
  ['salvaTestoModello', { chiave: 'NIENTE' }, S, N, N, N],
  ['svuotaCestino', {}, S, N, N, N],
  // scadenze
  ['scadenze', {}, S, S, S, S],
  ['salvaScadenza', { scadenza: { tipo: 'altro' } }, S, S, N, N],
  ['salvaScadenza', { scadenza: { tipo: 'manutenzione', idContratto: 2 } }, S, S, S, N],
  ['faiScadenza', { id: 99999 }, S, S, S, S],
  ['togliScadenza', { id: 99999 }, S, S, S, S],
  // ticket
  ['tickets', {}, S, S, S, S],
  ['ticket', { id: 999 }, S, S, S, S],
  ['salvaTicket', { ticket: {} }, S, S, S, N],
  ['prendiTicket', { id: 999 }, S, S, S, N],
  ['assegnaTicket', { id: 999 }, S, S, S, N],
  ['sospendiTicket', { id: 999 }, S, S, S, N],
  ['riprendiTicket', { id: 999 }, S, S, S, N],
  ['risolviTicket', { id: 999 }, S, S, S, N],
  ['altroIntervento', { id: 999 }, S, S, S, N],
  ['riapriTicket', { id: 999 }, S, S, S, N],
  ['annullaTicket', { id: 999 }, S, S, S, N],
  ['pianificaTicket', { id: 999 }, S, S, S, N],
  ['chiudiTicket', { id: 999, fatturazione: 'no' }, S, S, N, N],
  ['legaRapportino', { idRapportino: 'RAP/0000/0000' }, S, S, S, N],
  ['togliFotoTicket', { id: 'niente' }, S, S, S, N],
  ['storicoImpianto', { idSede: 999 }, S, S, S, S],
  ['statisticheTicket', {}, S, S, S, S],
  // contratti
  ['contratti', {}, S, S, S, S],
  ['contratto', { id: 999 }, S, S, S, S],
  ['salvaContratto', { contratto: {} }, S, S, N, N],
  ['attivaContratto', { id: 999 }, S, S, N, N],
  ['rinnovaContratto', { id: 999 }, S, S, N, N],
  ['disdiciContratto', { id: 999 }, S, S, N, N],
  ['chiudiContratto', { id: 999 }, S, S, N, N],
  // esportazioni
  ['esporta', { cosa: 'documenti' }, S, S, S, S],
  ['esporta', { cosa: 'scadenze' }, S, S, S, S],
  ['esporta', { cosa: 'ticket' }, S, S, S, S],
  ['esporta', { cosa: 'contratti' }, S, S, S, S],
];

for (const [azione, dati, ...attesi] of MATRICE) {
  test('permessi: ' + azione + ' ' + JSON.stringify(dati), async () => {
    for (let i = 0; i < RUOLI.length; i++) {
      const r = await chi[RUOLI[i]](azione, dati);
      if (attesi[i] === S) assert.notEqual(r.permesso, false, RUOLI[i] + ': ' + r.errore);
      else assert.equal(r.permesso, false, RUOLI[i] + ' non deve: ' + JSON.stringify(r));
    }
  });
}

test('permessi: approvare i documenti solo titolare e amministrazione (lo decide il server, non il modulo)', async () => {
  const doc = (await chi.titolare('documenti', { archivio: true, stato: 'da_approvare' })).documenti[0];
  const v = (await chi.titolare('documento', { id: doc.id })).documento.versioni.find(x => x.statoVisto === 'Da approvare');
  for (const r of ['collaboratore', 'lettura']) {
    const x = await chi[r]('approvaVersione', { id: v.id });
    assert.deepEqual([x.ok, x.permesso, x.errore], [false, false, 'Non hai il permesso per approvare i documenti: chiedi al titolare'], r);
  }
});

test('permessi: le GET non scrivono; /carica e /file come le altre (nelle prove dei documenti)', async () => {
  for (const azione of ['salvaTicket', 'chiudiTicket', 'salvaDocumento', 'salvaContratto', 'faiScadenza', 'svuotaCestino', 'inviaDocumento']) {
    assert.equal((await chi.titolare.leggi({ azione })).errore, 'Questa azione vuole una POST', azione);
  }
});

// ------------------------------------------------------------------ Dashboard

test('Dashboard del titolare: le voci nuove con le frasi dell\'accordo e i numeri', async () => {
  const d = await chi.titolare('dashboard', { tutto: true });
  const tutte = [].concat(d.urgenti, d.settimana, d.pianificare);
  const tk14 = d.urgenti.find(v => v.tipo === 'ticket' && v.titolo === 'TK/2026/0014 urgente: Scatta il generale MT');
  assert.ok(tk14);
  assert.match(tk14.dettaglio, /^Rossi Impianti Srl · Cabina MT Acme · aperto alle \d{1,2}:\d{2} · nessuno l'ha preso$/);
  assert.deepEqual(tk14.collegamento, { pagina: 'ticket', id: 14 });
  const spg = d.urgenti.find(v => v.tipo === 'scadenza');
  assert.match(spg.titolo, /^Verifica protezioni SPG e SPI scaduta da \d+ giorni$/);
  assert.deepEqual([spg.dettaglio, spg.collegamento.pagina], ['Rossi Impianti Srl · Cabina MT Acme', 'scadenza']);
  // TK/2026/0013 ha l'intervento oggi alle 14:30 e il tempo d'intervento scade nel pomeriggio: dopo quell'ora è
  // "in ritardo" tra le urgenti e l'intervento di oggi non si ripete (un ticket, una voce sola).
  const tk13InRitardo = d.urgenti.some(v => v.collegamento && v.collegamento.pagina === 'ticket' && v.collegamento.id === 13);
  const intervento = d.settimana.find(v => v.tipo === 'intervento');
  if (tk13InRitardo) assert.equal(intervento, undefined, 'il ticket in ritardo non si ripete come intervento di oggi');
  else {
    assert.deepEqual([intervento.titolo, intervento.dettaglio, intervento.collegamento], ['Intervento di oggi alle 14:30: TK/2026/0013 Navetta 2 si ferma in errore',
      'Marco Rossato · Batokyo Srl · Schio', { pagina: 'ticket', id: 13 }]);
  }
  assert.ok(d.settimana.some(v => v.titolo === 'TK/2026/0012 risolto: da chiudere' && v.dettaglio === 'Mario Bianchi · rapportino firmato il 21/10'));
  assert.ok(d.settimana.some(v => v.tipo === 'documento' && v.titolo === '1 documento da approvare' && v.dettaglio === 'Schema unifilare cabina MT rev. 3 · Marco Rossato'));
  const c = d.settimana.find(v => v.tipo === 'contratto');
  assert.deepEqual([c.titolo, c.dettaglio], ['CA/2026/002: la disdetta va mandata entro domenica 1 novembre', 'Rossi Impianti Srl · si rinnova da solo il 01/01/2027']);
  assert.ok(d.pianificare.some(v => v.titolo === 'Manutenzione cabina MT Acme del 20/11 da pianificare' && v.dettaglio === 'TK/2026/0015 · Rossi Impianti Srl'));
  assert.ok(d.pianificare.some(v => v.titolo === '3 documenti da classificare'));
  assert.ok(d.pianificare.some(v => v.titolo === 'Verifica impianto di terra (DPR 462): 12/01/2027'));
  assert.equal(tutte.some(v => v.tipo === 'sopralluogo' && /TK\/2026/.test(v.titolo)), false);
  assert.equal(tutte.filter(v => /Navetta 2/.test(v.titolo)).length, 1, 'l\'intervento una volta sola (non anche tra gli appuntamenti)');
  assert.deepEqual(Object.keys(d.numeri.ticket).sort(), ['aperti', 'inRitardo', 'interventiOggi', 'nonAssegnati', 'programmatiDaPianificare', 'risoltiDaChiudere', 'urgenti']);
  assert.deepEqual([d.numeri.ticket.urgenti >= 1, d.numeri.ticket.interventiOggi, d.numeri.ticket.risoltiDaChiudere], [true, 1, 1]);
  assert.deepEqual(Object.keys(d.numeri.documenti).sort(), ['daApprovare', 'daClassificare', 'inScadenza', 'scaduti']);
  assert.deepEqual(Object.keys(d.numeri.contratti).sort(), ['attivi', 'inScadenza']);
  assert.deepEqual(Object.keys(d.numeri.scadenze).sort(), ['entro', 'scadute', 'vicine']);
  assert.equal(typeof d.numeri.spazio.liberoMb, 'number');
  // I collegamenti delle voci nuove sono pagine dell'accordo.
  // Fase 6: le scadenze di persone, mezzi, strumenti e collaboratori portano alla loro scheda (fase6.md §11.1).
  const pagine = ['ticket', 'tickets', 'contratto', 'contratti', 'documenti', 'documento', 'scadenza', 'impianto', 'amministrazione',
    'persona', 'mezzo', 'attrezzatura', 'collaboratore'];
  for (const v of tutte.filter(x => ['ticket', 'intervento', 'scadenza', 'documento', 'contratto', 'spazio', 'copia'].includes(x.tipo))) assert.ok(pagine.includes(v.collegamento.pagina), JSON.stringify(v));
});

test('Dashboard del collaboratore e di lettura: i suoi ticket e quelli da prendere, i suoi interventi; niente contratti, niente spazio', async () => {
  const m = await chi.collaboratore('dashboard', { tutto: true });
  assert.ok(m.urgenti.some(v => v.titolo === 'TK/2026/0014 urgente: Scatta il generale MT'), 'urgente da prendere');
  // Il suo intervento di oggi: tra le urgenti se è già in ritardo, altrimenti in settimana (mai in tutte e due).
  const suo13 = v => v.collegamento && v.collegamento.pagina === 'ticket' && v.collegamento.id === 13;
  assert.equal(m.urgenti.filter(suo13).length + m.settimana.filter(suo13).length, 1);
  const tutte = [].concat(m.urgenti, m.settimana, m.pianificare);
  assert.equal(tutte.some(v => ['contratto', 'spazio', 'copia', 'scadenza'].includes(v.tipo)), false);
  assert.equal(tutte.some(v => /risolto: da chiudere/.test(v.titolo)), false, 'non chiude');
  for (const k of ['contratti', 'spazio', 'soldi']) assert.equal(k in m.numeri, false, k);
  assert.ok(m.numeri.ticket);
  const l = await chi.lettura('dashboard', { tutto: true });
  assert.equal('spazio' in l.numeri, false);
  assert.ok(l.numeri.contratti, 'lettura vede i contratti (costi 1)');
});

test('io.interfaccia: approvare, chiudere, i link per i clienti, la grandezza massima; la versione del server', async () => {
  const io = (await chi.titolare('io')).interfaccia;
  assert.deepEqual([io.puoApprovareDocumenti, io.puoChiudereTicket, io.condivisioneCollegata, io.fileMaxMb, io.versioneServer], [true, true, false, 50, require('../package.json').version]);
  const m = (await chi.collaboratore('io')).interfaccia;
  assert.deepEqual([m.puoApprovareDocumenti, m.puoChiudereTicket], [false, false]);
  const l = (await chi.amministrazione('io')).interfaccia;
  assert.deepEqual([l.puoApprovareDocumenti, l.puoChiudereTicket], [true, true]);
  assert.deepEqual([(await chi.lettura('io')).interfaccia.puoChiudereTicket], [false]);
  const n = (await chi.titolare('anagrafiche')).numerazioni;
  assert.ok(n.some(x => x.tipo === 'ticket' && x.formato === 'TK/{AAAA}/{NNNN}' && /^TK\/\d{4}\/\d{4}$/.test(x.prossimo)));
  assert.ok(n.some(x => x.tipo === 'contratto' && x.formato === 'CA/{AAAA}/{NNN}'));
  const sede = (await chi.titolare('anagrafiche')).sedi.find(x => x.id === 4);
  assert.deepEqual([sede.categoria, sede.categoriaNome, sede.potenza, sede.ambiente, sede.messaInServizio], ['cabina_mt', 'Cabina MT', '630 kVA', 'ordinario', '2014-05-20']);
  assert.equal((await chi.titolare('salvaSede', { sede: { id: 4, categoria: 'boh' } })).errore.slice(0, 11), 'Categoria: ');
});
