// Le regole di Documenti e di Ticket e assistenza di Wisper Ufficio (fase 5), provate con Node coi casi
// condivisi col server e col telefono (architettura.md §16.21): ogni risultato va ritrovato uguale.
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
const T = require('../ui/regole-ticket.js');
const RF = require('../ui/regole-fatture.js');
const E = require('../ui/esempio.js');

const casi = nome => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'prove', nome), 'utf8'));
const TICKET = casi('casi-ticket.json');
const COLLEGAMENTI = casi('casi-collegamenti.json');
const FATTURA = casi('casi-fattura.json');

// ------------------------------------------------------------------ casi-ticket.json

test('casi-ticket.json: la priorità dalle due domande, le nove caselle e "senza risposte"', () => {
  assert.equal(TICKET.priorita.length, 10);
  TICKET.priorita.forEach(c => assert.equal(T.prioritaDa(c.impatto, c.urgenza), c.atteso, c.impatto + ' + ' + c.urgenza));
});

test('casi-ticket.json: "Cambia" scrive la priorità a mano e le risposte restano; vuota torna automatica', () => {
  const c = TICKET.cambia;
  assert.deepEqual(T.conPriorita({ impatto: c.impatto, urgenza: c.urgenza, priorita: c.priorita }), c.atteso);
  assert.deepEqual(T.conPriorita({ impatto: 'fermo', urgenza: 'subito', priorita: '' }), { priorita: 'urgente', prioritaAMano: false, impatto: 'fermo', urgenza: 'subito' });
  // La stessa della matrice non è "a mano".
  assert.equal(T.conPriorita({ impatto: 'fermo', urgenza: 'subito', priorita: 'urgente' }).prioritaAMano, false);
});

test('casi-ticket.json: i tempi in ore di calendario, dalla tabella dello studio e dal contratto (anche col cambio dell\'ora)', () => {
  assert.deepEqual(T.TEMPI_STUDIO, TICKET.tempi.studio);
  TICKET.tempi.casi.forEach(c => {
    const r = T.tempiTicket({ apertoIl: c.apertoIl, priorita: c.priorita, tempi: TICKET.tempi.studio, contratto: c.contratto || null });
    assert.deepEqual(r, c.atteso, c.apertoIl + ' ' + c.priorita);
  });
  // Un programmato: entro la fine del giorno previsto, senza presa.
  assert.deepEqual(T.tempiTicket({ tipo: 'programmato', previstoIl: '2026-10-28', apertoIl: '2026-09-28T02:00:00', priorita: 'normale' }),
    { entroPresa: '', entroIntervento: '2026-10-28T23:59:59' });
});

// ------------------------------------------------------------------ casi-collegamenti.json

test('casi-collegamenti.json: il tipo dall\'indirizzo, la cartella proposta, la pillola, gli spazi in fondo', () => {
  assert.equal(T.ERRORE_COLLEGAMENTO, COLLEGAMENTI.frase);
  assert.ok(COLLEGAMENTI.casi.length >= 18);
  COLLEGAMENTI.casi.forEach(c => {
    const r = T.tipoCollegamento(c.url);
    assert.deepEqual({ url: r.url, tipo: r.tipo, cartella: r.cartella, pillola: r.pillola }, { url: c.salvato || c.url, tipo: c.tipo, cartella: c.cartella, pillola: c.pillola }, c.nome);
  });
});

test('casi-collegamenti.json: i rifiutati hanno sempre la stessa frase', () => {
  assert.ok(COLLEGAMENTI.rifiutati.length >= 6);
  COLLEGAMENTI.rifiutati.forEach(c => assert.deepEqual(T.tipoCollegamento(c.url), { errore: COLLEGAMENTI.frase }, c.nome));
});

// ------------------------------------------------------------------ casi-fattura.json, raggruppamento E

test('casi-fattura.json E: la riga del ticket TK/2026/0012, il gruppo e le tre sorgenti', () => {
  const e = FATTURA.raggruppamenti.find(x => /^E\./.test(x.nome));
  assert.ok(e, 'manca il raggruppamento E');
  const [g] = T.righeTicket({ ticket: e.ticket, cliente: e.cliente, rapportini: e.rapportini, spese: e.spese, ore: e.ore || [] });
  assert.equal(g.gruppo, e.atteso.gruppo);
  assert.equal(g.sorgenti.length, e.atteso.sorgenti);
  assert.equal(g.righe.length, e.atteso.righe.length);
  e.atteso.righe.forEach((atteso, i) => Object.keys(atteso).forEach(k => assert.deepEqual(g.righe[i][k], atteso[k], k)));
});

test('righeTicket: a corpo, con la commessa, e le spese anticipate a parte', () => {
  const [g] = T.righeTicket({
    ticket: { numero: 'TK/2026/0020', titolo: 'Prova', impianto: '', risolto: '2026-10-22', idCommessa: '26ST005', prezzoCorpo: 150 },
    cliente: { pagaViaggio: true },
    rapportini: [{ id: 'RAP/2026/0020', oreLavoro: 1, oreViaggio: 1, compensoOre: 90, km: 10, rimborsoKm: 7.6 }],
    spese: [{ id: 2, data: '2026-10-22', descrizione: 'Pedaggio', importo: 4.2, anticipazione: true }],
    ore: [],
  });
  assert.equal(g.righe[0].descrizione, 'Intervento TK/2026/0020 del 22/10/2026: Prova (a corpo, commessa 26ST005)');
  assert.equal(g.righe[0].importo, 150);
  assert.equal(g.righe[1].tipo, 'anticipazione');
  assert.equal(g.righe[1].descrizione, 'Spesa anticipata per conto del cliente: Pedaggio del 22/10/2026');
  assert.deepEqual(g.sorgenti.map(s => s.importo), [150, 0, 4.2]);
});

// ------------------------------------------------------------------ parole, colori, tempi a parole

test('parole e colori fissi: stato, priorità, scadenze, documenti, contratti (sempre con la parola)', () => {
  assert.equal(T.coloreStatoTicket('aperto'), 'giallo');
  assert.equal(T.coloreStatoTicket('in_carico'), 'blu');
  assert.equal(T.coloreStatoTicket('in_attesa'), 'ambra');
  assert.equal(T.coloreStatoTicket('risolto'), 'verde');
  assert.equal(T.coloreStatoTicket('chiuso'), 'grigio');
  assert.equal(T.colorePriorita('urgente'), 'rosso');
  assert.equal(T.colorePriorita('alta'), 'ambra');
  assert.equal(T.coloreScadenza('Scaduta'), 'rosso');
  assert.equal(T.coloreScadenza('Scade fra 24 giorni'), 'ambra');
  assert.equal(T.coloreScadenza('Scade oggi'), 'ambra');
  assert.equal(T.coloreScadenza('Prossima'), 'grigio');
  assert.equal(T.coloreScadenza('Fatta'), 'verde');
  assert.equal(T.coloreDocumento('Valida'), 'verde');
  assert.equal(T.coloreDocumento('Da approvare'), 'giallo');
  assert.equal(T.coloreDocumento('Respinta'), 'rosso');
  assert.equal(T.coloreContratto('In scadenza'), 'ambra');
  assert.equal(T.coloreContratto('Scaduto'), 'rosso');
  assert.deepEqual(['prendi', 'pianifica', 'rapportino', 'risolvi', 'chiudi', 'riprendi', ''].map(T.testoGiallo),
    ['Prendo io', 'Pianifica l\'intervento', 'Scrivi il rapportino', 'Segna risolto', 'Chiudi il ticket', 'Riprendi', '']);
  assert.deepEqual(['aperto', 'in_carico', 'in_attesa', 'risolto', 'chiuso', 'annullato'].map(T.passoTicket), [0, 1, 1, 2, 3, -1]);
  assert.equal(T.testoApriCollegamento('gdrive'), 'Apri in Google Drive');
  assert.equal(T.rigaCollegamento('onedrive'), 'Le revisioni le tiene OneDrive.');
  // Niente punti esclamativi nelle parole fisse.
  const tutte = JSON.stringify([T.STATI_TICKET, T.PRIORITA, T.TIPI_TICKET, T.ORIGINI, T.IMPATTI, T.URGENZE, T.FATTURAZIONI, T.CATEGORIE_IMPIANTO, T.TIPI_SCADENZA]);
  assert.ok(!/!/.test(tutte));
});

test('i tempi a parole: oggi, domani, il giorno della settimana, la fine del giorno', () => {
  const adesso = new Date(2026, 9, 22, 10, 5);
  assert.equal(T.entro('2026-10-22T12:40:00', adesso), 'entro oggi alle 12:40');
  assert.equal(T.entro('2026-10-23T09:15:00', adesso), 'entro domani alle 9:15');
  assert.equal(T.entro('2026-10-25T11:00:00', adesso), 'entro domenica 25 alle 11:00');
  assert.equal(T.entro('2026-11-20T23:59:59', adesso), 'entro il 20/11');
  assert.equal(T.quando('2026-10-21T09:00:00', adesso), 'ieri alle 9:00');
  assert.equal(T.quando('2026-10-20T09:15:00', adesso), 'martedì 20 ottobre alle 9:15');
  assert.deepEqual(T.giornoGrande('2026-09-30'), { g: '30', m: 'set 26' });
  assert.equal(T.ogni(60), 'ogni 5 anni');
  assert.equal(T.ogni(6), 'ogni 6 mesi');
  assert.equal(T.ogni(12), 'ogni anno');
  assert.equal(T.ogni(null), 'una volta');
  assert.equal(T.sommaTesto({ ore: 2.5, km: 24, materiale: 18.5, spese: 0 }), '2,5 ore · 24 km · materiale 18,50 €');
  assert.equal(T.sommaTesto({ ore: 1, km: 0 }), '1 ora');
});

test('file: titolo proposto, grandezza, tipo e mime', () => {
  assert.equal(T.titoloProposto('Schema unifilare cabina rev3.pdf'), 'Schema unifilare cabina rev3');
  assert.equal(T.titoloProposto('https://esempio-my.sharepoint.com/:f:/g/personal/studio/Commesse/26ST041'), '26ST041');
  assert.equal(T.titoloProposto('\\\\SERVER\\Archivio\\Schemi\\'), 'Schemi');
  assert.equal(T.grandezza(1830211), '1,7 MB');
  assert.equal(T.grandezza(2048), '2 KB');
  assert.equal(T.tipoFile('application/pdf', 'x.pdf'), 'PDF');
  assert.equal(T.tipoFile('', 'x.docx'), 'Word');
  assert.equal(T.mimeDi('Foto.JPG'), 'image/jpeg');
  assert.equal(T.mimeDi('rilievo.dwg'), 'application/acad');
  assert.ok(T.accorcia('https://esempio-my.sharepoint.com/:f:/g/personal/studio/Commesse/26ST041/una/cartella/lunga', 40).indexOf('…') > 0);
});

test('filtri dei ticket aperti e storico per anno', () => {
  const lista = [{ id: 1, priorita: 'urgente', stato: 'aperto', responsabileId: null }, { id: 2, priorita: 'alta', stato: 'in_carico', responsabileId: 3, inRitardo: true },
    { id: 3, priorita: 'normale', stato: 'in_carico', responsabileId: 1 }];
  assert.deepEqual(T.filtraTicket(lista, 'urgenti', 1).map(t => t.id), [1, 2]);
  assert.deepEqual(T.filtraTicket(lista, 'miei', 1).map(t => t.id), [3]);
  assert.deepEqual(T.filtraTicket(lista, 'prendere', 1).map(t => t.id), [1]);
  assert.equal(T.filtraTicket(lista, 'tutti', 1).length, 3);
  assert.deepEqual(T.perAnno([{ data: '2026-10-22' }, { data: '2026-06-18' }, { data: '2025-12-18' }]).map(g => [g.anno, g.voci.length]), [['2026', 2], ['2025', 1]]);
});

// ------------------------------------------------------------------ menu e collegamenti della Dashboard

test('menu: Documenti e Ticket e assistenza dopo Banche e scadenze, solo col loro permesso', () => {
  // Fase 6: Persone fra Banche e Documenti, Mezzi e Collaboratori esterni dopo Ticket (l'ordine delle specifiche).
  // Fase 7: WhatsApp e comunicazioni e Portale clienti fra Mezzi e Collaboratori esterni.
  assert.deepEqual(R.vociMenu(E.permessiDi('titolare')).map(v => v.modulo).slice(-9), ['banche', 'persone', 'documenti', 'ticket', 'mezzi', 'comunicazioni', 'portale', 'collaboratori', 'amministrazione']);
  const nomi = R.vociMenu(E.permessiDi('titolare')).map(v => v.nome);
  assert.ok(nomi.indexOf('Documenti') === nomi.indexOf('Persone e risorse umane') + 1);
  assert.ok(nomi.indexOf('Ticket e assistenza') === nomi.indexOf('Documenti') + 1);
  // Il collaboratore li vede tutti e due (documenti 1, ticket 2); senza permesso niente.
  const coll = R.vociMenu(E.permessiDi('collaboratore')).map(v => v.modulo);
  assert.ok(coll.indexOf('documenti') >= 0 && coll.indexOf('ticket') >= 0);
  assert.deepEqual(R.vociMenu({ dashboard: 1, documenti: 0, ticket: 0 }).map(v => v.modulo), ['dashboard']);
  assert.equal(R.moduloDi('#ticket/tk/14'), 'ticket');
  assert.equal(R.moduloDi('#ticket/impianto/4'), 'ticket');
  assert.equal(R.moduloDi('#documenti/doc/1'), 'documenti');
});

test('Dashboard: dove portano le voci nuove (§16.18)', () => {
  assert.equal(R.destinazione({ pagina: 'ticket', id: 14 }).hash, '#ticket/tk/14');
  assert.deepEqual(R.destinazione({ pagina: 'tickets', filtro: { segmento: 'aperti', priorita: 'urgente' } }), { hash: '#ticket', filtro: { segmento: 'aperti', priorita: 'urgente' } });
  assert.equal(R.destinazione({ pagina: 'tickets', filtro: { segmento: 'programmati' } }).hash, '#ticket/programmati');
  assert.equal(R.destinazione({ pagina: 'contratto', id: 2 }).hash, '#ticket/contratto/2');
  assert.equal(R.destinazione({ pagina: 'documenti', filtro: { segmento: 'approvare' } }).hash, '#documenti/approvare');
  assert.deepEqual(R.destinazione({ pagina: 'documenti', filtro: { segmento: 'archivio', daClassificare: true } }), { hash: '#documenti', filtro: { segmento: 'archivio', daClassificare: true } });
  assert.equal(R.destinazione({ pagina: 'documento', id: 1 }).hash, '#documenti/doc/1');
  assert.equal(R.destinazione({ pagina: 'scadenza', id: 7 }).hash, '#documenti/scadenza/7');
  assert.equal(R.destinazione({ pagina: 'impianto', id: 4 }).hash, '#ticket/impianto/4');
  assert.equal(R.destinazione({ pagina: 'amministrazione', filtro: { sezione: 'spazio' } }).hash, '#amministrazione/spazio');
  // I contratti della fase 2 (incarichi dai preventivi) restano dove erano.
  assert.equal(R.destinazione({ pagina: 'contratti' }).hash, '#preventivi/contratti');
  assert.equal(R.testoAzione({ pagina: 'ticket', id: 14 }), 'Apri il ticket');
  assert.equal(R.testoAzione({ pagina: 'scadenza', id: 7 }), 'Apri la scadenza');
});

// ------------------------------------------------------------------ Da fatturare: la voce del ticket

test('Da fatturare: il ticket è una riga sola, con le sue spese anticipate attaccate', () => {
  const g = { idCliente: 'C003', voci: [
    { tipo: 'rapportino', id: 'RAP/2026/0009', data: '2026-10-02', importo: 100 },
    { tipo: 'ticket', id: 'TK/2026/0012', data: '2026-10-21', titolo: 'Inverter in errore di isolamento', importo: 126.74, pronta: true, gruppo: 'ticket:TK/2026/0012' },
    { tipo: 'spesa', id: 44, idTicket: 'TK/2026/0012', anticipazione: true, importo: 6.8, titolo: 'Pedaggio', gruppo: 'ticket:TK/2026/0012' },
  ] };
  const righe = RF.righeVista(g);
  assert.deepEqual(righe.map(r => r.tipo), ['mese', 'ticket']);
  const t = righe[1];
  assert.equal(t.chiave, 'ticket:TK/2026/0012');
  assert.equal(t.importo, 133.54);
  assert.deepEqual(t.voci, [{ tipo: 'ticket', id: 'TK/2026/0012' }, { tipo: 'spesa', id: 44 }]);
  assert.equal(t.spese.length, 1);
  assert.deepEqual(RF.sommaScelte(righe, new Set(['ticket:TK/2026/0012'])), { n: 1, totale: 133.54 });
});
