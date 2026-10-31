// Fase 4: banche e scadenze (fase4.md §10). Il saldo dal saldo scritto e dai movimenti dopo, gli abbinamenti che non
// superano il movimento ne' il residuo, annullare un movimento che riapre la fattura, previsto / registrato /
// verificato in banca, lo scadenziario col saldo prudente (entrate scadute fuori, uscite scadute dentro) e i giorni
// sotto soglia, gli impegni ricorrenti (12 mesi, questa / future / tutte), le proposte F24 1040 e del bollo che si
// aggiornano da sole finche' non si confermano, la situazione, i permessi, le esportazioni.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
// Il saldo del 01/10, i movimenti di ottobre, le fatture del 2026 e gli impegni di novembre hanno date fisse (la
// storia del prototipo): queste prove le guardano dal giorno del prototipo, giovedi' 22/10/2026, qualunque giorno sia
// (anche con WISPER_OGGI_PROVA). Le altre prove girano sul giorno vero.
giornoDeiPrototipi();
const { oggi, piuGiorni } = require('../src/utili');
const C = require('../src/conti');

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

const db = () => s.wisper.db;
const c2 = n => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ conti e saldo

test('conti: il saldo e\' l\'ultimo saldo scritto piu\' i movimenti dopo; l\'IBAN intero solo a chi scrive', async () => {
  const r = await manuel('conti');
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.collegamento, 'non_collegato');
  const c = r.conti[0];
  assert.deepEqual([c.nome, c.banca, c.ultimeCifre, c.predefinito, c.iban], ['Conto studio', 'Banca di esempio', '3456', true, 'IT60X0542811101000000123456']);
  // 9.850 il 01/10, poi: luce -142,30, Verdi -534,40, Rossi +500, F24 -1.250, Bianchi +320,25.
  assert.deepEqual([c.saldoScritto, c.saldoAl, c.saldo, c.movimentiDopo, c.verificatiDopo], [9850, '2026-10-01', 8743.55, 5, 4]);
  const suo = (await lettura('conti')).conti[0];
  assert.equal('iban' in suo, false, 'chi legge e basta non vede l\'IBAN intero');
  assert.equal(suo.ultimeCifre, '3456');
  // aggiornaSaldo: il punto di partenza nuovo.
  const a = await manuel('aggiornaSaldo', { idConto: c.id, data: '2026-10-13', saldo: 9000 });
  assert.deepEqual([a.conto.saldoScritto, a.conto.saldoAl, a.conto.saldo, a.conto.movimentiDopo], [9000, '2026-10-13', c2(9000 - 1250 + 320.25), 2]);
  assert.match((await manuel('aggiornaSaldo', { idConto: c.id, data: piuGiorni(oggi(), 3), saldo: 1 })).errore, /deve ancora venire/);
  assert.equal((await manuel('aggiornaSaldo', { idConto: c.id })).errore, 'Saldo: scrivi il saldo letto in banca');
  await manuel('aggiornaSaldo', { idConto: c.id, data: '2026-10-01', saldo: 9850 });
  db().esegui("DELETE FROM conto_saldi WHERE data = '2026-10-13'");
});

test('salvaConto: nome, IBAN col controllo, un predefinito solo', async () => {
  assert.equal((await manuel('salvaConto', { conto: { nome: '' } })).errore, 'Nome: scrivi il nome del conto');
  assert.equal((await manuel('salvaConto', { conto: { nome: 'Carta', iban: 'IT60X0542811101000000123457' } })).errore, 'IBAN: non sembra giusto');
  const n = await manuel('salvaConto', { conto: { nome: 'Conto risparmio', banca: 'Altra banca', iban: 'IT 42 L 12345 12345 123456789012', soglia: 500 } });
  assert.equal(n.ok, true, n.errore);
  assert.deepEqual([n.conto.predefinito, n.conto.iban, n.conto.soglia, n.conto.saldo], [false, 'IT42L1234512345123456789012', 500, 0]);
  const p = await manuel('salvaConto', { conto: { id: n.conto.id, predefinito: true } });
  assert.equal(p.conto.predefinito, true);
  assert.equal((await manuel('conti')).conti.filter(c => c.predefinito).length, 1);
  await manuel('salvaConto', { conto: { id: 1, predefinito: true } });
  await manuel('salvaConto', { conto: { id: n.conto.id, attivo: false } });
  assert.equal((await manuel('conti')).conti.length, 1, 'i conti chiusi solo con tutti');
  assert.equal((await manuel('conti', { tutti: true })).conti.length, 2);
});

// ------------------------------------------------------------------ movimenti e abbinamenti

test('movimenti: ricerca (anche "500,00"), filtri, previsto / registrato / verificato in banca', async () => {
  const r = await manuel('movimenti', { da: '2026-10-01' });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.importaEstrattoConto, 'non_collegato');
  assert.equal(r.quante, 5);
  const rossi = r.movimenti.find(m => m.importo === 500);
  assert.deepEqual([rossi.verso, rossi.categoria, rossi.idSoggetto, rossi.soggetto, rossi.verificato, rossi.livello], ['entrata', 'incasso', 'C002', 'Rossi Impianti Srl', false, 'registrato']);
  assert.deepEqual(rossi.abbinamenti, [{ tipo: 'fattura', id: 12, etichetta: '39/2026', importo: 500 }]);
  assert.equal(rossi.descrizione, 'Incasso Rossi Impianti Srl, fattura 39/2026 (in parte)');
  for (const t of ['500', '500,00', 'rossi']) assert.ok((await manuel('movimenti', { testo: t })).movimenti.some(m => m.id === rossi.id), t);
  assert.deepEqual((await manuel('movimenti', { verificato: false, da: '2026-10-01' })).movimenti.map(m => m.id), [rossi.id]);
  assert.ok((await manuel('movimenti', { verso: 'uscita' })).movimenti.every(m => m.verso === 'uscita'));
  const v = await manuel('verificaMovimenti', { ids: [rossi.id], verificato: true });
  assert.deepEqual([v.fatte, v.movimenti[0].livello, v.movimenti[0].verificato], [1, 'verificato', true]);
  await manuel('verificaMovimenti', { ids: [rossi.id], verificato: false });
});

test('salvaMovimento: gli abbinamenti non superano il movimento ne\' il residuo; il verso giusto', async () => {
  const base = { idConto: 1, data: oggi(), verso: 'entrata', descrizione: 'Bonifico' };
  const troppo = await manuel('salvaMovimento', { movimento: Object.assign({ importo: 1232.34, abbinamenti: [{ tipo: 'fattura', id: 13, importo: 1300 }] }, base) });
  assert.equal(troppo.errore, 'La fattura 45/2026 ha ancora da incassare 1.232,34: non puoi abbinarne 1.300,00');
  const somma = await manuel('salvaMovimento', { movimento: Object.assign({ importo: 1000, abbinamenti: [{ tipo: 'fattura', id: 13, importo: 800 }, { tipo: 'fattura', id: 12, importo: 300 }] }, base) });
  assert.equal(somma.errore, 'Hai abbinato 1.100,00 su un movimento di 1.000,00');
  assert.equal((await manuel('salvaMovimento', { movimento: Object.assign({}, base, { importo: 0 }) })).errore, 'Importo: scrivi quanto');
  assert.equal((await manuel('salvaMovimento', { movimento: { data: oggi(), verso: 'entrata', importo: 5 } })).errore, 'Conto: scegli il conto');
  assert.equal((await manuel('salvaMovimento', { movimento: Object.assign({}, base, { verso: 'uscita', importo: 5, abbinamenti: [{ tipo: 'fattura', id: 13, importo: 5 }] }) })).errore,
    'Una fattura si abbina a un\'entrata');
  // Un bonifico che paga due fatture.
  const due = await manuel('salvaMovimento', { movimento: Object.assign({ importo: 500, idSoggetto: 'C002', abbinamenti: [{ tipo: 'fattura', id: 13, importo: 300 }, { tipo: 'fattura', id: 12, importo: 200 }] }, base) });
  assert.equal(due.ok, true, due.errore);
  assert.deepEqual(due.movimento.abbinamenti.map(a => [a.etichetta, a.importo]), [['45/2026', 300], ['39/2026', 200]]);
  assert.deepEqual([(await manuel('fattura', { id: 13 })).fattura.residuo, (await manuel('fattura', { id: 12 })).fattura.residuo], [932.34, 110.75]);
  // Cambiare l'importo sotto gli abbinamenti non si puo'.
  assert.equal((await manuel('salvaMovimento', { movimento: { id: due.movimento.id, importo: 400 } })).errore, 'Hai abbinato 500,00 su un movimento di 400,00');
  // Annullare un movimento toglie i suoi abbinamenti: le fatture tornano da incassare.
  assert.equal((await manuel('annullaMovimento', { id: due.movimento.id })).errore, 'Motivo: scrivi perché lo annulli');
  const a = await manuel('annullaMovimento', { id: due.movimento.id, motivo: 'era doppio' });
  assert.deepEqual([a.movimento.annullato, a.movimento.abbinamenti], [true, []]);
  assert.deepEqual([(await manuel('fattura', { id: 13 })).fattura.residuo, (await manuel('fattura', { id: 12 })).fattura.residuo], [1232.34, 310.75]);
  assert.equal((await manuel('registro', { tabella: 'movimenti', idRiga: String(due.movimento.id) })).righe[0].nota, 'movimento annullato: era doppio');
  assert.equal((await manuel('movimenti', { testo: 'Bonifico' })).movimenti.length, 0, 'gli annullati solo se chiesti');
  assert.equal((await manuel('movimenti', { testo: 'Bonifico', annullati: true })).movimenti.length, 1);
  assert.equal((await manuel('salvaMovimento', { movimento: { id: due.movimento.id, importo: 5 } })).errore, 'Il movimento è annullato: non si cambia');
});

test('segnaIncasso e segnaPagamento: la strada corta (importo di base = residuo; meno = in parte)', async () => {
  const i = await manuel('segnaIncasso', { idFattura: 13, importo: 232.34, data: oggi() });
  assert.equal(i.ok, true, i.errore);
  assert.deepEqual([i.fattura.statoVisto, i.fattura.residuo, i.movimento.descrizione], ['Pagata in parte', 1000, 'Incasso Rossi Impianti Srl, fattura 45/2026 (in parte)']);
  assert.equal((await manuel('segnaIncasso', { idFattura: 13, importo: 2000 })).errore, 'La fattura 45/2026 ha ancora da incassare 1.000,00: non puoi abbinarne 2.000,00');
  assert.equal((await manuel('segnaIncasso', { idFattura: 11 })).errore, 'La fattura 38/2026 è già pagata');
  await manuel('annullaMovimento', { id: i.movimento.id, motivo: 'prova' });
  const ric = (await manuel('ricevute', { stato: 'da_pagare' })).ricevute.find(r => r.numero === 'A/233');
  const p = await manuel('segnaPagamento', { idRicevuta: ric.id, importo: 86, data: oggi() });
  assert.deepEqual([p.ricevuta.statoVisto, p.ricevuta.daPagare, p.movimento.verso, p.movimento.categoria], ['Pagata in parte', 400, 'uscita', 'pagamento']);
  await manuel('annullaMovimento', { id: p.movimento.id, motivo: 'prova' });
  assert.equal((await manuel('segnaPagamento', {})).errore, 'Scegli cosa hai pagato: una fattura ricevuta o un impegno');
  // Un impegno senza importo prende quello pagato.
  const sen = (await manuel('salvaImpegno', { impegno: { tipo: 'tributo', descrizione: 'Diritto camerale', scadenza: oggi() } })).impegno;
  assert.equal((await manuel('segnaPagamento', { idImpegno: sen.id })).errore, 'Importo: scrivi quanto');
  const pi = await manuel('segnaPagamento', { idImpegno: sen.id, importo: 53, data: oggi() });
  assert.deepEqual([pi.impegno.importo, pi.impegno.stato, pi.impegno.statoVisto, pi.movimento.categoria], [53, 'pagato', 'Pagato', 'tributo']);
  await manuel('annullaMovimento', { id: pi.movimento.id, motivo: 'prova' });
  await manuel('togliImpegno', { id: sen.id });
});

// ------------------------------------------------------------------ scadenziario

test('scadenziario: saldo prudente (uscite scadute dentro, entrate scadute fuori), saldo di fine giornata, sotto soglia', async () => {
  // Un'uscita scaduta ieri (conta oggi) e un'entrata scaduta (la 39/2026: non conta).
  const ieri = (await manuel('salvaImpegno', { impegno: { tipo: 'tributo', descrizione: 'Tassa scaduta ieri', scadenza: piuGiorni(oggi(), -1), importo: 400 } })).impegno;
  const r = await manuel('scadenziario', {});
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual([r.oggi, r.da, r.a, r.soglia, r.nota], [oggi(), oggi(), piuGiorni(oggi(), 90), 3000, 'Gli incassi scaduti non entrano nel saldo previsto']);
  const entrata = r.scaduti.find(x => x.tipo === 'fattura' && x.id === 12);
  assert.deepEqual([entrata.verso, entrata.importo, entrata.stato, entrata.contaNelSaldo], ['entrata', 310.75, 'scaduto', false]);
  assert.match(entrata.dettaglio, /^scaduto da \d+ giorni · pagata in parte$/);
  const uscita = r.scaduti.find(x => x.tipo === 'impegno' && x.id === ieri.id);
  assert.deepEqual([uscita.contaNelSaldo, uscita.dettaglio], [true, 'scaduto da 1 giorno']);
  const usciteScadute = r.scaduti.filter(x => x.contaNelSaldo).reduce((t, x) => t + x.importo, 0);
  assert.equal(r.saldoPartenza, c2(r.saldoOggi - usciteScadute));
  // Ogni giorno: il saldo di fine giornata e il rosso sotto soglia.
  let saldo = r.saldoPartenza;
  for (const g of r.giorni) {
    for (const x of g.righe) if (x.contaNelSaldo) saldo = c2(saldo + (x.verso === 'entrata' ? 1 : -1) * x.importo);
    assert.equal(g.saldo, saldo, g.data);
    assert.equal(g.sottoSoglia, g.saldo < r.soglia, g.data);
    assert.match(g.titolo, /^[A-Z][a-zì]+ \d{1,2} [a-z]+$/);
  }
  const primo = r.giorni.find(g => g.sottoSoglia);
  assert.equal(r.primoSottoSoglia, r.saldoPartenza < r.soglia ? oggi() : (primo ? primo.data : ''));
  // Le scadenze dei contratti senza data stanno a parte e non contano.
  assert.ok(r.senzaData.voci >= 2);
  // Un importo da scrivere non conta nel saldo.
  const sen = r.giorni.flatMap(g => g.righe).find(x => x.importoDaScrivere);
  if (sen) assert.equal(sen.contaNelSaldo, false);
  // La soglia alta: sotto soglia gia' oggi.
  await manuel('salvaImpostazioni', { valori: { SOGLIA_CASSA: 100000 } });
  assert.equal((await manuel('scadenziario', {})).primoSottoSoglia, oggi());
  await manuel('salvaImpostazioni', { valori: { SOGLIA_CASSA: 3000 } });
  await manuel('togliImpegno', { id: ieri.id });
});

test('scadenziario: il saldo previsto dei dati di esempio va sotto i 3.000 euro il 30/11 (IRPEF), se oggi e\' prima', async () => {
  const r = await manuel('scadenziario', { a: '2026-12-31' });
  assert.equal(r.saldoOggi, 8743.55);
  assert.equal(r.primoSottoSoglia, '2026-11-30');
  const g = r.giorni.find(x => x.data === '2026-11-30');
  assert.deepEqual([g.titolo, g.sottoSoglia, g.righe[0].titolo, g.righe[0].importo], ['Lunedì 30 novembre', true, 'Secondo acconto IRPEF', 3400]);
  const pronta = r.giorni.flatMap(x => x.righe).find(x => x.tipo === 'fattura' && x.id === 13);
  assert.deepEqual([pronta.verso, pronta.importo, pronta.stato], ['entrata', 1232.34, 'previsto']);
  const proposta = r.giorni.flatMap(x => x.righe).find(x => x.tipo === 'impegno' && x.proposta);
  assert.deepEqual([proposta.stato, proposta.titolo], ['proposto', 'Ritenute sui compensi pagati a ottobre']);
});

// ------------------------------------------------------------------ impegni

test('impegni ricorrenti: 12 mesi avanti; questa, future, tutte; cambiare il giorno rifa\' la serie; non si ripete piu\'', async () => {
  const inizio = piuGiorni(oggi(), 3);
  const r = await manuel('salvaImpegno', { impegno: { tipo: 'rata', descrizione: 'Canone del software', scadenza: inizio, importo: 40, ricorrenza: { regola: 'mesi', ogni: 1 } } });
  assert.equal(r.ok, true, r.errore);
  assert.ok(r.occorrenze >= 12 && r.occorrenze <= 13, String(r.occorrenze));
  assert.deepEqual([r.impegno.ripete, r.impegno.ricorrenza.regola, r.impegno.occorrenza], ['ogni mese', 'mesi', inizio]);
  const serie = async () => (await manuel('impegni', { stato: 'aperti' })).impegni.filter(i => i.idRicorrenza && i.descrizione.startsWith('Canone')).sort((a, b) => (a.scadenza < b.scadenza ? -1 : 1));
  let lista = await serie();
  assert.equal(lista.length, r.occorrenze);
  assert.ok(lista[lista.length - 1].scadenza <= piuGiorni(oggi(), 366));
  // Solo questa.
  await manuel('salvaImpegno', { impegno: { id: lista[1].id, importo: 45 }, perRicorrenza: 'questa' });
  lista = await serie();
  assert.deepEqual(lista.slice(0, 3).map(i => i.importo), [40, 45, 40]);
  // Da questa in poi.
  await manuel('salvaImpegno', { impegno: { id: lista[2].id, importo: 50 }, perRicorrenza: 'future' });
  lista = await serie();
  assert.deepEqual(lista.slice(0, 4).map(i => i.importo), [40, 45, 50, 50]);
  // Tutte (la descrizione).
  await manuel('salvaImpegno', { impegno: { id: lista[0].id, descrizione: 'Canone del programma' }, perRicorrenza: 'tutte' });
  lista = await serie();
  assert.ok(lista.every(i => i.descrizione === 'Canone del programma'));
  // Cambiare il giorno da qui in poi: una serie nuova, le vecchie aperte seguenti annullate.
  const vecchiaSerie = lista[3].idRicorrenza;
  const nuovoGiorno = piuGiorni(lista[3].scadenza, 2);
  const c = await manuel('salvaImpegno', { impegno: { id: lista[3].id, scadenza: nuovoGiorno }, perRicorrenza: 'future' });
  assert.equal(c.ok, true, c.errore);
  assert.notEqual(c.impegno.idRicorrenza, vecchiaSerie);
  lista = await serie();
  assert.equal(lista.filter(i => i.idRicorrenza === vecchiaSerie).length, 3, 'la serie di prima tiene le prime tre');
  assert.ok(lista.filter(i => i.idRicorrenza === c.impegno.idRicorrenza).every(i => i.scadenza.slice(8) === nuovoGiorno.slice(8) || i.scadenza.slice(8) < nuovoGiorno.slice(8)));
  // Non si ripete piu' (da questa).
  const stop = await manuel('salvaImpegno', { impegno: { id: c.impegno.id, ricorrenza: null }, perRicorrenza: 'future' });
  assert.equal(stop.ok, true, stop.errore);
  lista = await serie();
  assert.equal(lista.filter(i => i.idRicorrenza === c.impegno.idRicorrenza).length, 1);
  // togliImpegno con "future": la serie (di prima) finisce li'; quella nuova non si tocca.
  const t = await manuel('togliImpegno', { id: lista[1].id, perRicorrenza: 'future' });
  assert.equal(t.tolti, 2);
  assert.deepEqual((await serie()).map(i => i.id), [lista[0].id, c.impegno.id]);
  // Ogni anno.
  const anno = await manuel('salvaImpegno', { impegno: { tipo: 'f24', descrizione: 'Diritto annuale', codice: '3850', scadenza: piuGiorni(oggi(), 10), importo: 53, ricorrenza: { regola: 'anni', ogni: 1 } } });
  assert.deepEqual([anno.occorrenze, anno.impegno.ripete], [1, 'ogni anno']);
  assert.equal((await manuel('salvaImpegno', { impegno: { descrizione: 'x', scadenza: oggi(), ricorrenza: { regola: 'giorni' } } })).errore, 'Ripeti: ogni N mesi o anni');
  assert.equal((await manuel('salvaImpegno', { impegno: { descrizione: '', scadenza: oggi() } })).errore, 'Descrizione: scrivi cosa si paga');
  assert.equal((await manuel('salvaImpegno', { impegno: { descrizione: 'x' } })).errore, 'Scadenza: scrivi quando');
  // L'allungamento notturno non fa doppioni.
  assert.equal(s.wisper.allungaImpegni(), 0);
});

test('proposte di Wisper: ritenute 1040 e bollo del trimestre si aggiornano da sole; confermate restano; tolte non tornano', async () => {
  const proposta = async (origine, periodo) => (await manuel('impegni', { stato: 'tutti' })).impegni.find(i => i.origine === origine && i.periodo === periodo);
  const rit = await proposta('ritenute', '2026-10');
  assert.deepEqual([rit.importo, rit.codice, rit.tipo, rit.scadenza, rit.proposta, rit.statoVisto], [100, '1040', 'f24', '2026-11-16', true, 'Proposta']);
  // Annullare il pagamento della fattura di Verdi: la proposta non serve piu' (si toglie da sola), e torna col pagamento.
  const mov = (await manuel('movimenti', { testo: 'Verdi' })).movimenti[0];
  await manuel('annullaMovimento', { id: mov.id, motivo: 'prova' });
  assert.equal((await proposta('ritenute', '2026-10')).annullato, true);
  const verdi = (await manuel('ricevute', {})).ricevute.find(r => r.numero === '12');
  await manuel('segnaPagamento', { idRicevuta: verdi.id, importo: 267.2, data: '2026-10-12' });
  assert.deepEqual([(await proposta('ritenute', '2026-10')).importo, (await proposta('ritenute', '2026-10')).annullato], [50, false], 'pagata a meta\': meta\' ritenuta');
  await manuel('segnaPagamento', { idRicevuta: verdi.id, data: '2026-11-03' });
  assert.equal((await proposta('ritenute', '2026-11')).scadenza, '2026-12-16', 'il resto pagato a novembre: il 16 dicembre');
  // Confermata, non si aggiorna piu'.
  const conf = await manuel('confermaImpegno', { id: rit.id, importo: 50 });
  assert.deepEqual([conf.impegno.confermato, conf.impegno.statoVisto], [true, 'Da pagare']);
  // Il bollo: una fattura emessa con le spese anticipate oltre la soglia (la W-15) fa la proposta del suo trimestre.
  await manuel('passaAlProgramma', { id: 'W-15', conferma: true });
  await manuel('segnaEmessa', { id: 'W-15', numero: '70/2026', data: '2026-10-22', conferma: true });
  const bollo = await proposta('bollo', '2026-T4');
  assert.deepEqual([bollo.importo, bollo.codice, bollo.scadenza, bollo.descrizione], [2, '2524', '2027-03-01', 'Bollo delle fatture del 4° trimestre (stima: controlla nel portale)']);
  // Tolta da chi la guarda: non torna.
  await manuel('togliImpegno', { id: bollo.id, motivo: 'la conta il commercialista' });
  s.wisper.come({ utente: s.wisper.titolare(), permessi: s.wisper.permessiDi('titolare') }, () => s.wisper.db.transazione(() => s.wisper.aggiornaProposte()));
  assert.equal((await proposta('bollo', '2026-T4')).annullato, true);
});

test('situazione: saldi, da incassare e da pagare, previsto a 30/60/90 giorni, 13 settimane, fatturato e incassato dell\'anno', async () => {
  const r = await manuel('situazione', {});
  assert.equal(r.ok, true, r.errore);
  for (const k of ['saldi', 'saldoOggi', 'daIncassare', 'scadutoDaIncassare', 'daPagare30', 'scadutoDaPagare', 'previsto', 'primoSottoSoglia', 'settimane', 'fatturatoAnno', 'incassatoAnno']) assert.ok(k in r, k);
  assert.equal(r.collegamento, 'non_collegato');
  assert.equal(r.saldoOggi, r.saldi.reduce((t, x) => c2(t + x.saldo), 0));
  assert.ok(r.daIncassare >= r.scadutoDaIncassare && r.scadutoDaIncassare >= 310.75);
  assert.deepEqual(Object.keys(r.previsto), ['30', '60', '90']);
  assert.equal(r.settimane.length, 13);
  assert.ok(r.settimane.every(x => x.a === C.giorniDopo(x.da, 6) && typeof x.saldo === 'number'));
  assert.equal(new Date(r.settimane[0].da + 'T12:00:00').getDay(), 1, 'da lunedi\'');
  assert.ok(r.fatturatoAnno >= 960 + 750 + 1140);
});

// ------------------------------------------------------------------ permessi, Dashboard, esportazioni

test('permessi: il collaboratore niente banche; lettura legge ed esporta ma non scrive', async () => {
  const legge = [['conti', {}], ['movimenti', {}], ['scadenziario', {}], ['impegni', {}], ['situazione', {}]];
  const scrive = [['salvaConto', { conto: { nome: 'x' } }], ['aggiornaSaldo', { idConto: 1, saldo: 1 }], ['salvaMovimento', { movimento: {} }],
    ['segnaIncasso', { idFattura: 13 }], ['segnaPagamento', { idImpegno: 1 }], ['verificaMovimenti', { ids: [1] }], ['annullaMovimento', { id: 1, motivo: 'x' }],
    ['salvaImpegno', { impegno: {} }], ['confermaImpegno', { id: 1 }], ['togliImpegno', { id: 1 }]];
  for (const [a, d] of legge.concat(scrive)) assert.equal((await marco(a, d)).permesso, false, 'collaboratore: ' + a);
  for (const [a, d] of legge) assert.equal((await lettura(a, d)).ok, true, 'lettura: ' + a);
  for (const [a, d] of scrive) assert.equal((await lettura(a, d)).permesso, false, 'lettura non scrive: ' + a);
  for (const cosa of ['movimenti', 'scadenziario', 'impegni']) {
    assert.equal((await lettura('esporta', { cosa })).ok, true, 'esporta ' + cosa);
    assert.equal((await marco('esporta', { cosa })).permesso, false);
  }
  const csv = Buffer.from((await manuel('esporta', { cosa: 'movimenti' })).base64, 'base64').toString('utf8');
  assert.deepEqual(csv.slice(1).split('\r\n')[0].split(';'), ['Data', 'Conto', 'Entrata o uscita', 'Importo', 'Descrizione', 'Chi', 'Categoria', 'Verificato in banca', 'Abbinato a', 'Annullato', 'Motivo']);
});

test('Dashboard: il saldo che scende sotto soglia, il saldo da aggiornare dopo 30 giorni, i pagamenti della settimana', async () => {
  // Il saldo scritto piu' di 30 giorni fa: lo si chiede.
  db().esegui('UPDATE conto_saldi SET data = ? WHERE conto_id = 1', piuGiorni(oggi(), -40));
  const d = await manuel('dashboard');
  assert.ok(d.pianificare.some(v => v.tipo === 'conto' && v.titolo === 'Aggiorna il saldo di Conto studio …3456'));
  db().esegui("UPDATE conto_saldi SET data = '2026-10-01' WHERE conto_id = 1");
  // Sotto soglia entro 14 giorni: urgente.
  await manuel('salvaImpostazioni', { valori: { SOGLIA_CASSA: 100000 } });
  const u = await manuel('dashboard');
  const cassa = u.urgenti.find(v => v.tipo === 'cassa');
  assert.ok(cassa);
  assert.equal(cassa.titolo, 'Il saldo previsto scende sotto 100.000 € già oggi');
  assert.deepEqual(cassa.collegamento, { pagina: 'scadenziario', filtro: { giorno: oggi() } });
  await manuel('salvaImpostazioni', { valori: { SOGLIA_CASSA: 3000 } });
  assert.equal(typeof u.numeri.soldi.saldoConti, 'number');
  // Lettura vede i numeri (ha "costi"), il collaboratore no.
  assert.ok('saldoConti' in (await lettura('dashboard')).numeri.soldi);
  assert.equal('soldi' in (await marco('dashboard')).numeri, false);
  void laura;
});
