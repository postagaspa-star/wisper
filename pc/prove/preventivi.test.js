// I preventivi di Wisper Ufficio (fase 2), provati con Node:
// i conti (gli stessi del server, sui casi di server/prove/casi-preventivo.json),
// le regole delle pagine, i PDF del preventivo e dell'incarico, i dati di esempio.
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
const RP = require('../ui/regole-preventivi.js');
global.WisperRegolePreventivi = RP;
global.WisperRegoleAttivita = require('../ui/regole-attivita.js');
const D = require('../ui/documenti.js');
const E = require('../ui/esempio.js');

// ------------------------------------------------------------------ i conti (fase2.md §3)

const voce = (id, prezzo, extra) => Object.assign({ id, descrizione: 'Voce ' + id, modo: 'corpo', quantita: 1, prezzo, scontoPercentuale: 0, facoltativa: false, alternativa: '', scelta: false }, extra || {});

test('conti: la voce è quantità × prezzo × (1 − sconto), al centesimo', () => {
  assert.equal(C.importoVoce(voce(1, 45, { modo: 'ore', quantita: 16 })), 720);
  assert.equal(C.importoVoce(voce(1, 99.99, { quantita: 3, scontoPercentuale: 10 })), 269.97);
  assert.equal(C.importoVoce(voce(1, 10.005)), 10.01, 'arrotondato al centesimo');
  assert.equal(C.importoVoce(voce(1, null)), 0, 'senza prezzo vale zero');
  assert.equal(C.importoVoce({ prezzo: 100 }), 0, 'senza quantità vale zero, come nel server');
});

test('conti: contano le normali, le facoltative scelte, di ogni gruppo di alternative solo la scelta', () => {
  const p = { eppiPercentuale: 5, ivaPercentuale: 22, sezioni: [{ id: 1, voci: [
    voce(1, 350), voce(2, 1900), voce(3, 45, { modo: 'ore', quantita: 16 }),
    voce(4, 450, { facoltativa: true }),
    voce(5, 380, { alternativa: 'Collaudo', scelta: true }), voce(6, 620, { alternativa: 'collaudo ' }),
  ] }] };
  const k = C.contiPreventivo(p);
  assert.equal(k.sommaVoci, 3350);
  assert.equal(k.imponibile, 3350);
  assert.equal(k.contributo, 167.5, 'contributo integrativo EPPI 5%');
  assert.equal(k.baseIva, 3517.5, 'il contributo entra nella base IVA');
  assert.equal(k.iva, 773.85);
  assert.equal(k.totale, 4291.35);
  assert.deepEqual(k.sezioni, [3350]);
  assert.deepEqual(k.perSezione, { 1: 3350 });
  assert.equal(k.oreVoci, 16);
  assert.deepEqual(k.voci.map(v => v.conta), [true, true, true, false, true, false]);
  // Il cliente sceglie la facoltativa e l'altro collaudo.
  const scelte = C.applicaScelte(C.vociDelPreventivo(p), { 4: true, 6: true });
  assert.equal(scelte.find(v => v.id === 5).scelta, false, 'scegliere un\'alternativa toglie le altre del gruppo');
  const k2 = C.contiPreventivo(p, scelte);
  assert.equal(k2.sommaVoci, 3350 + 450 - 380 + 620);
  assert.equal(k2.totale, 5175.24);
});

test('conti: sconto in percentuale e in euro, ogni pezzo al centesimo prima di sommare', () => {
  const p = { scontoPercentuale: 10, scontoEuro: 50, eppiPercentuale: 5, ivaPercentuale: 22, voci: [voce(1, 333.33), voce(2, 166.67, { idSezione: 2 })] };
  const k = C.contiPreventivo(p);
  assert.equal(k.sommaVoci, 500);
  assert.equal(k.scontoDaPercentuale, 50);
  assert.equal(k.scontoEuro, 50);
  assert.equal(k.sconto, 100);
  assert.equal(k.imponibile, 400);
  assert.equal(k.contributo, 20);
  assert.equal(k.iva, 92.4);
  assert.equal(k.totale, 512.4);
  assert.deepEqual(k.perSezione, { '': 333.33, 2: 166.67 }, 'le voci in un elenco solo, coi subtotali per sezione');
});

test('conti: di un gruppo di alternative conta solo la PRIMA scelta; nessuna scelta, niente', () => {
  const due = [voce(1, 100, { alternativa: 'A', scelta: true }), voce(2, 200, { alternativa: 'a', scelta: true })];
  assert.deepEqual(C.vociCheContano(due), [true, false]);
  assert.equal(C.contiPreventivo({ voci: due }).sommaVoci, 100);
  const nessuna = [voce(1, 100, { alternativa: 'A' }), voce(2, 200, { alternativa: 'A' })];
  assert.equal(C.contiPreventivo({ voci: nessuna }).sommaVoci, 0);
  assert.equal(C.contaVoce(due[1], due), false, 'con l\'elenco si sa che non è la prima');
});

test('conti: le scadenze di pagamento in percentuale dell\'imponibile o a importo', () => {
  assert.equal(C.importoScadenza({ tipo: 'percentuale', valore: 30 }, 3350), 1005);
  assert.equal(C.importoScadenza({ tipo: 'importo', valore: 500 }, 3350), 500);
  assert.equal(C.importoScadenza({ tipo: 'percentuale', valore: 33.3 }, 1000.01), 333);
});

// Gli stessi casi del server: tre programmi, un conto solo. Il file lo scrive chi costruisce il server.
const FILE_CASI = path.join(__dirname, '..', '..', 'server', 'prove', 'casi-preventivo.json');
const casi = fs.existsSync(FILE_CASI) ? (j => (Array.isArray(j) ? j : j.casi || []))(JSON.parse(fs.readFileSync(FILE_CASI, 'utf8'))) : null;
if (!casi) {
  test('conti: i casi del server (server/prove/casi-preventivo.json)', { skip: 'il file non c\'è ancora: lo scrive il server' }, () => {});
} else {
  for (const caso of casi) {
    test('conti: caso del server · ' + (caso.nome || caso.descrizione || JSON.stringify(caso).slice(0, 40)), () => {
      // Lo stesso calcolo del server (§13.4): stessi nomi, stessi numeri al centesimo.
      const k = C.contiPreventivo(caso.preventivo);
      const atteso = caso.atteso || {};
      for (const chiave of Object.keys(atteso)) {
        if (chiave === 'voci') {
          atteso.voci.forEach((av, i) => {
            if (av.importo !== undefined) assert.equal(k.voci[i].importo, av.importo, 'importo della voce ' + (i + 1));
            if (av.conta !== undefined) assert.equal(k.voci[i].conta, av.conta, 'conta la voce ' + (i + 1));
          });
        } else if (chiave === 'scadenze') {
          assert.deepEqual(k.scadenze, atteso.scadenze, 'importi delle scadenze');
        } else {
          assert.ok(chiave in k, 'il conto non ha ' + chiave);
          assert.deepEqual(k[chiave], atteso[chiave], chiave);
        }
      }
    });
  }
}

// ------------------------------------------------------------------ regole delle pagine

const OGGI = '2026-10-22';
const titolare = E.permessiDi('titolare');
const lettura = E.permessiDi('lettura');

test('preventivi: lo scaduto è un inviato con la scadenza passata; il server può dirlo lui', () => {
  assert.equal(RP.statoVisto({ stato: 'INVIATO', scadenza: '2026-10-21' }, OGGI), 'SCADUTO');
  assert.equal(RP.statoVisto({ stato: 'INVIATO', scadenza: '2026-10-22' }, OGGI), 'INVIATO', 'il giorno della scadenza vale ancora');
  assert.equal(RP.statoVisto({ stato: 'BOZZA', scadenza: '2026-01-01' }, OGGI), 'BOZZA', 'una bozza non scade');
  assert.equal(RP.statoVisto({ stato: 'INVIATO', statoVisto: 'scaduto' }, OGGI), 'SCADUTO');
  assert.equal(RP.statoVisto({ stato: 'inviato', scaduto: true }, OGGI), 'SCADUTO');
  assert.equal(RP.scadenzaAParole({ stato: 'INVIATO', scadenza: '2026-10-28' }, OGGI), 'scade fra 6 giorni');
  assert.equal(RP.scadenzaAParole({ stato: 'INVIATO', scadenza: '2026-10-06' }, OGGI), 'scaduto il 06/10');
  assert.equal(RP.numeroConRevisione({ numero: 'PR/2026/012', revisione: 1 }), 'PR/2026/012 · rev. 1');
  assert.equal(RP.numeroConRevisione({ numero: 'PR/2026/013', revisione: 0 }), 'PR/2026/013');
});

test('preventivi: segmenti e ricerca; niente modelli né revisioni sostituite', () => {
  const lista = [
    { id: 1, numero: 'PR/2026/001', stato: 'BOZZA', oggetto: 'Quadro', idCliente: 'C1', data: '2026-10-01' },
    { id: 2, numero: 'PR/2026/002', stato: 'INVIATO', scadenza: '2026-11-01', oggetto: 'Cabina', idCliente: 'C2', data: '2026-10-02' },
    { id: 3, numero: 'PR/2026/003', stato: 'INVIATO', scadenza: '2026-10-01', oggetto: 'Terra', idCliente: 'C1', data: '2026-09-01' },
    { id: 4, numero: 'PR/2026/002', revisione: 0, stato: 'SOSTITUITO', oggetto: 'Cabina', idCliente: 'C2', data: '2026-09-20' },
    { id: 5, numero: '', stato: 'BOZZA', modello: true, oggetto: 'Modello' },
    { id: 6, numero: 'PR/2026/004', stato: 'ACCETTATO', oggetto: 'Fotovoltaico', idCliente: 'C3', data: '2026-10-03' },
  ];
  const nome = id => ({ C1: 'Rossi Impianti', C2: 'Elettrodinamica', C3: 'Bianchi' })[id];
  assert.deepEqual(RP.filtraPreventivi(lista, { segmento: 'tutti' }, nome, OGGI).map(p => p.id), [6, 2, 1, 3]);
  assert.deepEqual(RP.filtraPreventivi(lista, { segmento: 'scaduti' }, nome, OGGI).map(p => p.id), [3]);
  assert.deepEqual(RP.filtraPreventivi(lista, { segmento: 'inviati' }, nome, OGGI).map(p => p.id), [2]);
  assert.deepEqual(RP.filtraPreventivi(lista, { segmento: 'tutti', testo: 'rossi' }, nome, OGGI).map(p => p.id), [1, 3]);
  assert.deepEqual(RP.contaPreventivi(lista, OGGI), { bozze: 1, inviati: 1, accettati: 1, scaduti: 1, tutti: 4, modelli: 1 });
});

test('preventivi: UN pulsante giallo secondo lo stato, e solo per chi può', () => {
  assert.equal(RP.azioneGialla({ stato: 'BOZZA' }, titolare, OGGI).chiave, 'invia');
  assert.equal(RP.azioneGialla({ stato: 'INVIATO', scadenza: '2026-10-01' }, titolare, OGGI).chiave, 'accetta', 'anche uno scaduto si accetta');
  assert.equal(RP.azioneGialla({ stato: 'ACCETTATO' }, titolare, OGGI).testo, 'Crea la commessa');
  assert.equal(RP.azioneGialla({ stato: 'ACCETTATO', idCommessa: '26ST048' }, titolare, OGGI).testo, 'Apri la commessa 26ST048');
  assert.equal(RP.azioneGialla({ stato: 'RIFIUTATO' }, titolare, OGGI), null);
  assert.equal(RP.azioneGialla({ stato: 'BOZZA' }, lettura, OGGI), null, 'chi legge non ha pulsanti');
  assert.equal(RP.azioneGialla({ stato: 'ACCETTATO', idCommessa: '26ST048' }, lettura, OGGI).chiave, 'apriCommessa', 'aprire la commessa sì');
  assert.equal(RP.azioneGialla({ stato: 'ACCETTATO' }, Object.assign({}, titolare, { commesse: 1 }), OGGI), null, 'senza commesse in scrittura niente Crea la commessa');
});

test('preventivi: il menu ⋯ secondo lo stato', () => {
  const chiavi = (p, perm) => RP.vociMenu(p, perm || titolare, OGGI).map(v => v.chiave);
  assert.deepEqual(chiavi({ stato: 'BOZZA' }), ['modifica', 'duplica', 'modello', 'segnaInviato', 'pdf']);
  assert.deepEqual(chiavi({ stato: 'INVIATO' }), ['nuovaRevisione', 'duplica', 'modello', 'invia', 'rifiuta', 'pdf']);
  assert.deepEqual(chiavi({ stato: 'RIFIUTATO' }), ['duplica', 'modello', 'riapri', 'pdf']);
  assert.deepEqual(chiavi({ stato: 'ACCETTATO' }), ['duplica', 'modello', 'pdf', 'incarico']);
  assert.deepEqual(chiavi({ stato: 'ACCETTATO' }, lettura), ['pdf', 'incarico']);
  assert.equal(RP.passoAttuale({ stato: 'INVIATO', scadenza: '2026-01-01' }, OGGI), 1);
  assert.ok(RP.modificabile({ stato: 'BOZZA' }));
  assert.ok(!RP.modificabile({ stato: 'INVIATO' }), 'dopo l\'invio i prezzi non cambiano');
});

test('preventivi: cosa chiede la legge e cosa manca', () => {
  const imp = { POLIZZA_COMPAGNIA: 'Esempio', POLIZZA_NUMERO: '1', TITOLI: 'Perito industriale' };
  const p = { complessita: 'media', oneriPrevisti: 'Nessuno', voci: [voce(1, 100), voce(2, null)] };
  const l = RP.cosaChiedeLaLegge(p, imp);
  assert.deepEqual(l.filter(x => !x.ok).map(x => x.testo), ['1 voce senza prezzo']);
  assert.deepEqual(RP.mancano({ voci: [] }, {}), ['Grado di complessità', 'Voci con spese, oneri e contributi', 'Oneri ipotizzabili', 'Polizza professionale', 'Titoli e specializzazioni']);
  assert.deepEqual(RP.mancano({ mancano: ['la polizza', { testo: 'i titoli' }] }, imp), ['la polizza', 'i titoli'], 'se il server lo dice, vale il suo');
});

test('preventivi: voci dal listino, spostate fra sezioni, pronte per salvaPreventivo', () => {
  const l = { id: 4, nome: 'Direzione lavori', modo: 'ore', unita: 'h', prezzo: 45 };
  const v = RP.voceDaListino(l);
  assert.equal(v.idListino, 4);
  assert.equal(v.descrizione, 'Direzione lavori');
  assert.equal(v.prezzo, 45);
  assert.match(String(v.id), /^v-/, 'un id provvisorio');
  const sezioni = [{ id: 1, voci: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { id: 2, voci: [{ id: 'd' }] }];
  assert.deepEqual(RP.spostaVoce(sezioni, 1, 0, 1, 3)[0].voci.map(x => x.id), ['b', 'c', 'a'], 'in fondo alla stessa sezione');
  assert.deepEqual(RP.spostaVoce(sezioni, 1, 2, 1, 0)[0].voci.map(x => x.id), ['c', 'a', 'b'], 'in cima');
  const s2 = RP.spostaVoce(sezioni, 1, 1, 2, 0);
  assert.deepEqual([s2[0].voci.map(x => x.id), s2[1].voci.map(x => x.id)], [['a', 'c'], ['b', 'd']], 'in un\'altra sezione');
  assert.equal(sezioni[0].voci.length, 3, 'le sezioni di prima non si toccano');
  const pronto = RP.perSalvare({ id: null, idCliente: 'C2', idSede: 4, oggetto: 'Prova', sezioni: [{ id: 'n-1', titolo: 'A', voci: [v, Object.assign(voce(9, '12,5'), { id: 9 })] }],
    scadenzePagamento: [{ id: 's-1', descrizione: 'Acconto', tipo: 'percentuale', valore: 30, quando: 'firma' }] });
  assert.equal(pronto.id, undefined, 'un preventivo nuovo non ha id');
  assert.equal(pronto.idSede, 4, 'i nomi di §13.5: idSede, idReferente');
  assert.equal(pronto.sezioni[0].id, undefined, 'la sezione nuova non ha id');
  assert.equal(pronto.sezioni[0].voci[0].id, undefined);
  assert.equal(pronto.sezioni[0].voci[1].id, 9, 'quella che c\'era tiene il suo');
  assert.equal(pronto.sezioni[0].voci[1].prezzo, 12.5, 'i numeri scritti alla italiana');
  assert.deepEqual(pronto.sezioni[0].voci.map(x => x.ordine), [1, 2]);
  assert.equal(pronto.scadenzePagamento[0].id, undefined);
  assert.deepEqual(RP.validaPreventivo({ sezioni: [{ voci: [{ descrizione: '' }] }] }),
    { cliente: 'Scegli il cliente', oggetto: 'Scrivi l\'oggetto del preventivo', voci: 'C\'è una voce senza descrizione' });
  assert.equal(RP.controllaScadenze([{ valore: 30 }, { valore: 60 }]), 'Le quote fanno 90%: manca il 10%');
  assert.equal(RP.controllaScadenze([{ valore: 30 }, { valore: 70 }]), '');
});

test('preventivi: accettazione e commessa che nasce', () => {
  const voci = [voce(1, 350), voce(2, 45, { modo: 'ore', quantita: 16 }), voce(3, 450, { facoltativa: true }),
    voce(4, 380, { alternativa: 'collaudo' }), voce(5, 620, { alternativa: 'collaudo' })];
  assert.deepEqual(RP.daScegliere(voci).map(v => v.id), [3, 4, 5]);
  assert.deepEqual(RP.scelteIniziali(voci), { 3: false, 4: true, 5: false }, 'di un gruppo senza scelta si propone la prima');
  const p = { oggetto: 'Capannone', eppiPercentuale: 5, ivaPercentuale: 22, scadenzePagamento: [{}, {}] };
  const scelte = C.applicaScelte(voci, { 4: true });
  const a = RP.anteprimaCommessa(p, scelte);
  assert.deepEqual(a.prestazioni.map(x => [x.nome, x.valore]), [['Voce 1', 350], ['Voce 2', 720], ['Voce 4', 380]]);
  assert.equal(a.importoContratto, 1450, 'l\'importo del contratto è l\'imponibile');
  assert.equal(a.budgetOre, 16, 'le ore previste sono le voci a ore');
  assert.equal(a.prezzoOrario, 45, 'il prezzo orario se è uno solo');
  assert.equal(a.scadenze, 2);
});

test('preventivi: dalle risposte del server, sezioni con le voci dentro e chiavi alla JavaScript', () => {
  const p = RP.normalizzaPreventivo({ id: 3, stato: 'inviato', cliente_id: 'C1', sezioni: [{ id: 7, titolo: 'B', ordine: 2 }, { id: 6, titolo: 'A', ordine: 1 }],
    voci: [{ id: 1, sezione_id: 7, descrizione: 'x', ordine: 1, facoltativa: 1 }, { id: 2, idSezione: 6, descrizione: 'y', ordine: 1 }], scadenze: [{ id: 1 }] });
  assert.equal(p.stato, 'INVIATO');
  assert.equal(p.idCliente, 'C1');
  assert.deepEqual(p.sezioni.map(s => [s.titolo, s.voci.map(v => v.id)]), [['A', [2]], ['B', [1]]]);
  assert.equal(p.sezioni[1].voci[0].facoltativa, true);
  assert.equal(p.scadenzePagamento.length, 1);
});

// ------------------------------------------------------------------ PDF

test('PDF: il preventivo ha tutto quello che chiede la legge, senza giallo pieno', () => {
  const dati = E.crea({ oggi: OGGI });
  const ana = Object.assign({}, dati.ana, { clienti: dati.ana.soggetti });
  const p = dati.preventivi.find(x => x.id === 12);
  const html = D.preventivo(p, ana, {});
  for (const pezzo of ['Preventivo', 'PR/2026/012 rev. 1', 'Rossi Impianti Srl', 'Oggetto: Adeguamento impianto elettrico capannone', 'Grado di complessità: media',
    'Progettazione', 'Cantiere', 'Direzione lavori', '16,00', 'facoltativa', 'in alternativa', 'scelta', 'Imponibile', 'Totale rivalsa (5% EPPI)', 'Totale IVA (22%)',
    '4.291,35 €', 'Pagamento', 'Codice', 'Sconto', 'Valuta EUR (€)', 'Preventivo PR/2026/012 rev. 1 · Pagina', 'alla firma', '1.005,00 €', 'Oneri ipotizzabili', 'Condizioni', 'Validità', 'Assicurazioni Esempio Spa', 'n. 0012345', 'massimale 1.000.000 €',
    'Perito industriale', 'Per accettazione', 'Alla cortese attenzione di Andrea Rossi']) {
    assert.ok(html.includes(pezzo), 'manca: ' + pezzo);
  }
  assert.ok(!/#FFC53D/i.test(html.replace(/data:image\/svg\+xml[^"]+/g, '')), 'niente giallo pieno fuori dal simbolo');
  // Con le scelte del cliente il conto cambia.
  assert.ok(D.preventivo(p, ana, { scelte: { 4: true, 6: true } }).includes('5.175,24 €'));
  // Un nome che contiene HTML resta un nome.
  assert.ok(D.preventivo(Object.assign({}, p, { oggetto: '<b>x</b>' }), ana, {}).includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('PDF: l\'incarico dal preventivo accettato, con le sole prestazioni scelte', () => {
  const dati = E.crea({ oggi: OGGI });
  const ana = Object.assign({}, dati.ana, { clienti: dati.ana.soggetti });
  const p = dati.preventivi.find(x => x.id === 9);
  const html = D.incarico(p, ana, {});
  for (const pezzo of ['Incarico professionale', 'PR/2026/009', 'Il professionista', 'Il committente', 'Elettrodinamica', '1. Oggetto dell&#39;incarico', 'Prestazioni', 'Ore di consulenza',
    'Compenso', '1.140,09 €', 'Pagamenti', 'Polizza professionale e titoli', 'con il documento firmato', 'Giulia Dal Santo']) {
    assert.ok(html.includes(pezzo), 'manca: ' + pezzo);
  }
  // Il rapportino e il riepilogo di sempre non cambiano.
  const r = dati.rapportini[0];
  assert.ok(D.rapportino(r, ana, {}).includes('Rapportino di lavoro'));
  assert.ok(D.riepilogo([r], ana, { nome: 'X', righe: [] }, 'Ottobre 2026', { conImporti: true }).includes('Riepilogo rapportini'));
});

// ------------------------------------------------------------------ i dati di esempio (il server finto della visita)

test('esempio: salvare, mandare, accettare, creare la commessa una volta sola', () => {
  const d = E.crea({ oggi: OGGI });
  const g = (azione, corpo) => E.gestisci(d, corpo ? 'POST' : 'GET', '/server/' + azione, corpo);
  const n = g('salvaPreventivo', { preventivo: { idCliente: 'C003', oggetto: 'Prova', sezioni: [{ titolo: 'A', voci: [{ descrizione: 'x', modo: 'corpo', quantita: 1, prezzo: 100 }] }] } });
  assert.ok(n.ok);
  assert.equal(n.preventivo.numero, 'PR/2026/014', 'il numero continua nell\'anno');
  assert.equal(n.preventivo.stato, 'BOZZA');
  assert.equal(n.preventivo.conti.totale, 128.1);
  assert.equal(n.preventivo.eppiPercentuale, 5, 'EPPI e IVA congelati alla creazione');
  assert.equal(g('salvaPreventivo', { preventivo: { id: 12, oggetto: 'x' } }).ok, false, 'un inviato non si cambia');
  const rev = g('nuovaRevisione', { id: 12 });
  assert.equal(rev.preventivo.revisione, 2);
  assert.equal(rev.preventivo.numero, 'PR/2026/012');
  assert.equal(d.preventivi.find(x => x.id === 12).stato, 'SOSTITUITO', 'la precedente resta, sostituita');
  assert.ok(g('segnaInviato', { id: rev.preventivo.id }).ok);
  const acc = g('accettaPreventivo', { id: rev.preventivo.id, modo: 'voce', nome: 'Andrea Rossi', scelte: {} });
  assert.equal(acc.preventivo.stato, 'ACCETTATO');
  const cc = g('creaCommessaDaPreventivo', { id: rev.preventivo.id });
  assert.ok(cc.ok);
  assert.equal(cc.prestazioni.length, 4, 'le voci che contano diventano prestazioni');
  assert.equal(g('creaCommessaDaPreventivo', { id: rev.preventivo.id }).ok, false, 'una volta sola');
});

test('esempio: senza il permesso dei preventivi niente; senza i soldi niente prezzi', () => {
  const m = E.crea({ oggi: OGGI, chi: 'marco' });
  assert.equal(E.gestisci(m, 'GET', '/server/preventivi').permesso, false);
  const l = E.crea({ oggi: OGGI, chi: 'manuel', permessi: Object.assign(E.permessiDi('titolare'), { costi: 0 }) });
  const p = E.gestisci(l, 'GET', '/server/preventivo?id=12').preventivo;
  assert.equal(p.conti, undefined);
  assert.equal(p.sezioni[0].voci[0].prezzo, undefined);
  assert.equal(p.sezioni[0].voci[0].descrizione, 'Sopralluogo e rilievo');
});
