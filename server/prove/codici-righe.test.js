/*
 * 13/11/2026 (1.4.3): il codice dei Servizi nelle righe della bozza e la ritenuta che non resta a zero.
 *
 * Andrea: "il codice si deve mettere automaticamente quando prepari la bozza per la fattura, e deve essere preso dai
 * Servizi"; "anche se c'è scritto sì alla ritenuta in basso, sopra nella ritenuta d'acconto viene segnato zero".
 * Servizi, clienti e importi sono d'esempio.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const S = require('../src/servizi');
const { oggi } = require('../src/utili');

giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400)); return r; };

// ------------------------------------------------------------------ la regola da sola

const SERVIZI = [
  { id: 1, codice: 'DIR1', nome: 'Direzione lavori a ore', unita: 'Ore', modo: 'ore', prezzo: 45, tag: '', attivo: 1, ordine: 0 },
  { id: 2, codice: 'CONS1', nome: 'Consulenza tecnica a ore', unita: 'Ore', modo: 'ore', prezzo: 45, tag: '', attivo: 1, ordine: 1 },
  { id: 3, codice: 'CONS2', nome: 'Consulenza in cantiere', unita: 'h', modo: 'ore', prezzo: 60, tag: '', attivo: 1, ordine: 5 },
  { id: 4, codice: 'KMA', nome: 'Rimborso chilometrico | Auto di esempio', unita: 'Km', modo: 'quantita', prezzo: 0.76, tag: '', attivo: 1, ordine: 2 },
  { id: 5, codice: 'ENTE01', nome: 'Rimborso spese chilometrico', unita: 'Km', modo: 'quantita', prezzo: 0.76, tag: '', attivo: 1, ordine: 3 },
  { id: 6, codice: 'SOP', nome: 'Sopralluogo', unita: 'A corpo', modo: 'corpo', prezzo: 350, tag: '', attivo: 1, ordine: 4 },
  { id: 7, codice: '', nome: 'Ore senza codice', unita: 'Ore', modo: 'ore', prezzo: 30, tag: '', attivo: 1, ordine: 6 },
  { id: 8, codice: 'VECCHIO', nome: 'Consulenza di una volta', unita: 'Ore', modo: 'ore', prezzo: 30, tag: '', attivo: 0, ordine: 7 },
  { id: 9, codice: 'TAR9', nome: 'Assistenza a ore', unita: 'Ore', modo: 'ore', prezzo: 52, tag: 'Officine Esempio', attivo: 1, ordine: 9 },
];
const CLIENTI = ['Rossi Impianti Srl', 'Ente di Prova', 'Officine Esempio Spa'];
const scegli = x => {
  const s = S.scegliServizio(Object.assign({ servizi: SERVIZI, altriClienti: CLIENTI.filter(n => n !== x.cliente) }, x));
  return s ? s.codice : null;
};

test('il servizio delle ore: prezzo uguale e nome adatto, senza codice o archiviato non conta', () => {
  // Stesso prezzo per due servizi: vince il nome ("Consulenza"), non l'ordine del listino.
  assert.equal(scegli({ genere: 'ore', prezzo: 45, cliente: 'Rossi Impianti Srl' }), 'CONS1');
  // Il prezzo uguale conta più del nome a pari nome: 60 €/h è CONS2.
  assert.equal(scegli({ genere: 'ore', prezzo: 60, cliente: 'Rossi Impianti Srl' }), 'CONS2');
  // Nessun prezzo uguale: il primo col nome adatto nell'ordine del listino. Mai quello senza codice né l'archiviato.
  assert.equal(scegli({ genere: 'ore', prezzo: 30, cliente: 'Rossi Impianti Srl' }), 'CONS1');
  // "h" è Ore; A corpo non è né ore né km.
  assert.equal(S.genereDiUnita('h', ''), 'ore');
  assert.equal(S.genereDiUnita('A corpo', 'corpo'), '');
  assert.equal(S.genereDiUnita('', 'ore'), 'ore');
  assert.equal(scegli({ genere: '', prezzo: 45, cliente: 'Rossi Impianti Srl' }), null);
  assert.equal(S.scegliServizio({ servizi: SERVIZI.filter(s => s.codice === 'SOP'), genere: 'ore', prezzo: 45, cliente: 'Rossi Impianti Srl' }), null);
});

test('il servizio di un cliente: il codice che comincia col suo nome è suo, e non va agli altri', () => {
  // I km dell'ente hanno il loro codice (ENTE01): per l'ente quello, per gli altri mai.
  assert.equal(scegli({ genere: 'km', prezzo: 0.76, cliente: 'Ente di Prova' }), 'ENTE01');
  assert.equal(scegli({ genere: 'km', prezzo: 0.76, cliente: 'Rossi Impianti Srl' }), 'KMA');
  // Anche con un prezzo diverso: quello del cliente vince sul prezzo uguale.
  assert.equal(scegli({ genere: 'km', prezzo: 0.5, cliente: 'Ente di Prova' }), 'ENTE01');
  // Un tag col nome del cliente lo fa suo.
  assert.equal(scegli({ genere: 'ore', prezzo: 45, cliente: 'Officine Esempio Spa' }), 'TAR9');
  // Se resta solo il servizio di un altro, meglio quello che niente.
  assert.equal(S.scegliServizio({ servizi: SERVIZI.filter(s => s.codice === 'ENTE01'), genere: 'km', prezzo: 0.76, cliente: 'Rossi Impianti Srl', altriClienti: CLIENTI }).codice, 'ENTE01');
});

test('il codice usato l\'ultima volta si ricorda: prima quello del cliente, a parità quello degli altri', () => {
  assert.equal(scegli({ genere: 'ore', prezzo: 45, cliente: 'Rossi Impianti Srl', storicoCliente: ['KMA', 'DIR1', 'CONS1'] }), 'DIR1');
  assert.equal(scegli({ genere: 'km', prezzo: 0.76, cliente: 'Rossi Impianti Srl', storicoCliente: ['DIR1'] }), 'KMA');
  // Un codice che non c'è più nel listino non si ripropone.
  assert.equal(scegli({ genere: 'ore', prezzo: 45, cliente: 'Rossi Impianti Srl', storicoCliente: ['VECCHIO', 'SPARITO'] }), 'CONS1');
  // A parità di punti (nessun prezzo uguale, tutti e due "Consulenza"): quello usato per gli altri clienti.
  assert.equal(scegli({ genere: 'ore', prezzo: 99, cliente: 'Rossi Impianti Srl' }), 'CONS1');
  assert.equal(scegli({ genere: 'ore', prezzo: 99, cliente: 'Rossi Impianti Srl', storicoTutti: ['CONS2'] }), 'CONS2');
});

// ------------------------------------------------------------------ dentro il server

let s;
let w;
let manuel;
test.before(async () => {
  s = await serverDiProva();
  w = s.wisper;
  manuel = await s.come('manuel@esempio.it');
  // Due servizi dei km: quello di tutti e quello di Batokyo (il codice comincia col suo nome).
  ok(await manuel('salvaVoceListino', { voce: { nome: 'Rimborso chilometrico | Auto di esempio', codice: 'KMA', prezzo: 0.76, aliquotaIva: 22, unita: 'Km', tipo: 'servizio' } }));
  ok(await manuel('salvaVoceListino', { voce: { nome: 'Rimborso spese chilometrico', codice: 'BATOKYO01', prezzo: 0.76, aliquotaIva: 22, unita: 'Km', tipo: 'servizio' } }));
});
test.after(() => s.ferma());

let k = 0;
const lavoro = (idCliente, l) => {
  const n = ++k;
  return { idLocale: 'cr-' + n, data: oggi(), tecnico: 'Manuel Gasparotto',
    lavori: [Object.assign({ idLocale: 'cr-' + n + '-1', idCliente, descrizione: 'Verifica del quadro', oreLavoro: 2, tariffa: 40, km: 10 }, l || {})] };
};
const salvaLavoro = async (idCliente, l) => ok(await manuel('salvaRapportino', { rapportino: lavoro(idCliente, l) })).rapportino.lavori[0].id;
const prepara = async (idCliente, raggruppa, ids) => ok(await manuel('preparaFattura', { idCliente, raggruppa, voci: ids.map(id => ({ tipo: 'rapportino', id })) })).fattura;
const normali = f => f.righe.filter(r => r.tipo !== 'bollo');

test('per mese: la riga delle ore e quella dei km nascono col codice, il nome e l\'unità del loro servizio', async () => {
  const a = await salvaLavoro('C002');
  const b = await salvaLavoro('C002', { oreLavoro: 3 });
  const f = await prepara('C002', 'mese', [a, b]);
  const [ore, km] = normali(f);
  assert.equal(ore.codice, 'CON');
  // 14/11/2026: il nome del servizio e il mese, come nel modello ("Consulenza tecnica | luglio"); niente dei rapportini.
  assert.match(ore.descrizione, /^Ore di consulenza \| [a-z]+$/);
  assert.deepEqual([ore.quantita, ore.unita, ore.prezzo, ore.importo], [5, 'Ore', 40, 200]);
  assert.equal(km.codice, 'KMA');
  assert.match(km.descrizione, /^Rimborso chilometrico \| Auto di esempio \| /);
  assert.deepEqual([km.quantita, km.unita, km.prezzo, km.importo], [20, 'Km', 0.76, 15.2]);
  // Il conto non cambia: 200 di ore + 15,20 di km.
  assert.equal(f.conti.compenso, 215.2);

  // Il codice corretto a mano si ricorda: la prossima bozza per lo stesso cliente nasce con quello.
  ok(await manuel('salvaFattura', { fattura: { id: f.id, righe: normali(f).map(r => (r.id === ore.id ? { id: r.id, codice: 'DL' } : { id: r.id })) } }));
  const c = await salvaLavoro('C002');
  const f2 = await prepara('C002', 'mese', [c]);
  assert.equal(normali(f2)[0].codice, 'DL');
  assert.match(normali(f2)[0].descrizione, /^Direzione lavori \| /);
  assert.equal(normali(f2)[1].codice, 'KMA');
});

test('i km di un cliente col suo servizio; "una riga per rapportino" delle app di prima non c\'è più: le stesse righe', async () => {
  const a = await salvaLavoro('C004');
  const mese = await prepara('C004', 'mese', [a]);
  assert.deepEqual(normali(mese).map(r => r.codice), ['CON', 'BATOKYO01']);
  // Le app di prima della 1.4.4 mandano ancora raggruppa: 'rapportino'. Il server non lo legge: un servizio per riga.
  const b = await salvaLavoro('C003', { descrizione: 'Collaudo del quadro QG2' });
  const c = await salvaLavoro('C003', { oreLavoro: 1.5 });
  const una = await prepara('C003', 'rapportino', [b, c]);
  assert.deepEqual(normali(una).map(r => [r.codice, r.quantita, r.unita, r.prezzo, r.importo]), [['CON', 3.5, 'Ore', 40, 140], ['KMA', 20, 'Km', 0.76, 15.2]]);
  // Andrea, 14/11/2026: "per caso vedi qualche riferimento ai Rapportini? No." Né il numero, né il giorno, né il lavoro.
  for (const r of normali(una)) assert.doesNotMatch(r.descrizione, /rapportin|RAP\/|Collaudo|\d{2}\/\d{2}\/\d{4}/i, r.descrizione);
  assert.match(una.causale, /^Prestazioni di [a-z]+ \d{4}$/);
  assert.equal(ok(await manuel('daFatturare', {})).raggruppa.C003 || 'mese', 'mese');
});

test('il prezzo è quello del listino: se il cliente paga meno, lo sconto che porta alla sua tariffa (40 col 25% = 30)', async () => {
  // Un cliente nuovo (nessuna fattura prima) e un servizio suo (il codice comincia col suo nome) a 40 €/h; lui paga 30.
  const nuovo = ok(await manuel('salvaSoggetto', { soggetto: { nome: 'Officine Esempio Spa', cap: '36016', citta: 'Thiene', provincia: 'VI' } })).soggetto;
  assert.equal(nuovo.nome, 'Officine Esempio Spa');
  const cliente = nuovo.id;
  ok(await manuel('salvaVoceListino', { voce: { nome: 'Consulenza tecnica a ore', codice: 'OFFICINE01', prezzo: 40, aliquotaIva: 22, unita: 'Ore', tipo: 'servizio' } }));
  const a = await salvaLavoro(cliente, { tariffa: 30, oreLavoro: 6.5, km: 0 });
  const b = await salvaLavoro(cliente, { tariffa: 30, oreLavoro: 8, km: 0 });
  const f = await prepara(cliente, 'mese', [a, b]);
  const [ore] = normali(f);
  assert.deepEqual([ore.codice, ore.quantita, ore.unita, ore.prezzo, ore.sconto, ore.importo], ['OFFICINE01', 14.5, 'Ore', 40, 25, 435]);
  assert.match(ore.descrizione, /^Consulenza tecnica a ore \| [a-z]+$/);
  // L'importo è la somma dei rapportini e non cambia: 14,5 ore a 30.
  assert.equal(f.conti.compenso, 435);
  // Uno sconto che non è tondo non si scrive: con 33,33 di tariffa su 40 di listino verrebbe "16,68%". Resta la tariffa.
  const c = await salvaLavoro(cliente, { tariffa: 33.33, oreLavoro: 3, km: 0 });
  const [strana] = normali(await prepara(cliente, 'mese', [c]));
  assert.deepEqual([strana.codice, strana.quantita, strana.prezzo, strana.sconto, strana.importo], ['OFFICINE01', 3, 33.33, 0, 99.99]);
});

test('un servizio dei km che si conta a numero ("Nr", come nel listino venuto da Flextaxa) è dei km lo stesso', async () => {
  assert.equal(S.genereDiUnita('Nr', 'quantita', 'Rimborso kilometrico | Auto di esempio'), 'km');
  assert.equal(S.genereDiUnita('Nr', 'quantita', 'Indennità di trasferta'), '');
  assert.equal(S.genereDiUnita('A corpo', 'corpo', 'Rimborso chilometrico forfettario'), '');
  const servizi = [{ id: 1, codice: 'KMN', nome: 'Rimborso kilometrico | Auto di esempio', unita: 'Nr', modo: 'quantita', prezzo: 0.76, attivo: 1, ordine: 0 }];
  assert.equal(S.scegliServizio({ servizi, genere: 'km', prezzo: 0.76, cliente: 'Rossi Impianti Srl', altriClienti: [] }).codice, 'KMN');
  assert.equal(S.scegliServizio({ servizi, genere: 'ore', prezzo: 40, cliente: 'Rossi Impianti Srl', altriClienti: [] }), null);
});

test('le bozze fatte col modo di prima si rifanno da sole all\'avvio: un servizio per riga, stessi importi, una volta sola', async () => {
  const a = await salvaLavoro('C003', { descrizione: 'Verifica del quadro' });
  const b = await salvaLavoro('C003', { oreLavoro: 3 });
  const f = await prepara('C003', 'mese', [a, b]);
  const totale = f.conti.totale;
  // Com'era una bozza "una riga per rapportino": un gruppo per rapportino, una riga sola con tutto dentro.
  const vecchia = id => {
    const righe = w.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND tipo <> 'bollo' ORDER BY ordine, id", id);
    const sorgenti = w.db.righe('SELECT * FROM fattura_sorgenti WHERE fattura_id = ? AND attiva = 1 ORDER BY id', id);
    assert.equal(righe.length, sorgenti.length, 'una riga per sorgente, per la prova');
    sorgenti.forEach((s, i) => {
      w.db.esegui("UPDATE fattura_righe SET gruppo = ?, descrizione = ?, quantita = 1, unita = '', prezzo = ?, importo = ?, importo_sorgenti = ?, sconto = 0 WHERE id = ?",
        'rapportino:' + s.sorgente_id, 'Ore di consulenza | Rapportino ' + s.sorgente_id + ' del 22/10/2026: Verifica del quadro (2 ore, 10 km)', s.importo, s.importo, s.importo, righe[i].id);
      w.db.esegui('UPDATE fattura_sorgenti SET gruppo = ? WHERE id = ?', 'rapportino:' + s.sorgente_id, s.id);
    });
    w.db.esegui("UPDATE fatture SET causale = 'Prestazioni professionali' WHERE id = ?", id);
  };
  vecchia(f.id);
  const prima = normali(ok(await manuel('fattura', { id: f.id })).fattura);
  assert.match(prima[0].descrizione, /Rapportino RAP\//);
  assert.equal(w.sistemaBozze().rifatte, 1);
  const dopo = ok(await manuel('fattura', { id: f.id })).fattura;
  assert.deepEqual(normali(dopo).map(r => [r.codice, r.quantita, r.unita, r.prezzo, r.importo]), [['CON', 5, 'Ore', 40, 200], ['KMA', 20, 'Km', 0.76, 15.2]]);
  for (const r of normali(dopo)) assert.doesNotMatch(r.descrizione, /rapportin|RAP\//i, r.descrizione);
  assert.equal(dopo.conti.totale, totale);
  // Le stesse cose restano riservate a questa bozza, e non tornano da fatturare.
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM fattura_sorgenti WHERE fattura_id = ? AND attiva = 1', f.id).n, 2);
  // La seconda volta non trova niente; e una bozza nuova, anche se qualcuno riscrive la riga a mano, non si tocca.
  assert.equal(w.sistemaBozze().rifatte, 0);
  ok(await manuel('salvaFattura', { fattura: { id: f.id, righe: normali(dopo).map((r, i) => (i === 0 ? { id: r.id, descrizione: 'Consulenza sul quadro (3 rapportini di ottobre)' } : { id: r.id })) } }));
  assert.equal(w.sistemaBozze().rifatte, 0);
  assert.equal(normali(ok(await manuel('fattura', { id: f.id })).fattura)[0].descrizione, 'Consulenza sul quadro (3 rapportini di ottobre)');

  // Una bozza di prima a cui qualcuno ha cambiato un importo a mano resta com'è.
  const c = await salvaLavoro('C003');
  const d = await salvaLavoro('C003');
  const g = await prepara('C003', 'mese', [c, d]);
  vecchia(g.id);
  w.db.esegui("UPDATE fattura_righe SET prezzo = 50, importo = 50 WHERE id = (SELECT MIN(id) FROM fattura_righe WHERE fattura_id = ? AND tipo <> 'bollo')", g.id);
  assert.equal(w.sistemaBozze().rifatte, 0);
  assert.match(normali(ok(await manuel('fattura', { id: g.id })).fattura)[0].descrizione, /Rapportino RAP\//);
});

test('le bozze già fatte: all\'avvio le righe senza codice lo prendono, il testo non si tocca', async () => {
  const a = await salvaLavoro('C003');
  const f = await prepara('C003', 'mese', [a]);
  const prima = normali(f).map(r => r.descrizione);
  w.db.esegui("UPDATE fattura_righe SET codice = '' WHERE fattura_id = ?", f.id);
  const fatto = w.sistemaBozze();
  assert.ok(fatto.codici >= 2, JSON.stringify(fatto));
  const dopo = normali(ok(await manuel('fattura', { id: f.id })).fattura);
  assert.deepEqual(dopo.map(r => r.codice), ['CON', 'KMA']);
  assert.deepEqual(dopo.map(r => r.descrizione), prima);
  // La seconda volta non trova niente.
  assert.deepEqual(w.sistemaBozze(), { ritenute: 0, codici: 0, rifatte: 0 });
  // Una volta sola per riga: se poi qualcuno toglie il codice apposta, al prossimo avvio non torna.
  w.db.esegui("UPDATE fattura_righe SET codice = '' WHERE fattura_id = ? AND unita = 'Ore'", f.id);
  assert.deepEqual(w.sistemaBozze(), { ritenute: 0, codici: 0, rifatte: 0 });
  assert.deepEqual(normali(ok(await manuel('fattura', { id: f.id })).fattura).map(r => r.codice), ['', 'KMA']);
});

test('la ritenuta: col "sì" non resta a zero, nemmeno con l\'impostazione vuota e nelle bozze già fatte', async () => {
  // Rossi Impianti ha la partita IVA: è sostituto d'imposta, la bozza nasce con la ritenuta.
  const a = await salvaLavoro('C002', { km: 0, oreLavoro: 5, tariffa: 60 });
  const f = await prepara('C002', 'mese', [a]);
  assert.deepEqual([f.ritenuta, f.ritenutaPercentuale, f.conti.compenso, f.conti.ritenuta], [true, 20, 300, 60]);
  // Una bozza nata con la percentuale a zero (l'impostazione era vuota): "sì" in basso, zero nei conti.
  w.db.esegui('UPDATE fatture SET ritenuta_percentuale = 0, ritenuta = 0, netto = totale WHERE id = ?', f.id);
  const rotta = ok(await manuel('fattura', { id: f.id })).fattura;
  assert.deepEqual([rotta.ritenuta, rotta.conti.ritenuta], [true, 0]);
  assert.equal(w.sistemaBozze().ritenute, 1);
  const sana = ok(await manuel('fattura', { id: f.id })).fattura;
  assert.deepEqual([sana.ritenuta, sana.ritenutaPercentuale, sana.conti.ritenuta, sana.conti.netto], [true, 20, 60, Math.round((sana.conti.totale - 60) * 100) / 100]);
  // Anche senza riavvio: basta salvare la bozza.
  w.db.esegui('UPDATE fatture SET ritenuta_percentuale = 0, ritenuta = 0, netto = totale WHERE id = ?', f.id);
  const salvata = ok(await manuel('salvaFattura', { fattura: { id: f.id, causale: 'Prestazioni di esempio' } })).fattura;
  assert.equal(salvata.conti.ritenuta, 60);
  // L'impostazione vuota (le app mostrano 20 lo stesso): una bozza nuova ha il 20%, non zero.
  w.db.esegui("UPDATE impostazioni SET valore = '\"\"' WHERE chiave = 'RITENUTA'");
  const b = await salvaLavoro('C002', { km: 0, oreLavoro: 1, tariffa: 100 });
  const nuova = await prepara('C002', 'mese', [b]);
  assert.deepEqual([nuova.ritenutaPercentuale, nuova.conti.ritenuta], [20, 20]);
  // Una percentuale scritta resta quella.
  ok(await manuel('salvaImpostazioni', { valori: { RITENUTA: 23 } }));
  const c = await salvaLavoro('C002', { km: 0, oreLavoro: 1, tariffa: 100 });
  assert.deepEqual([(await prepara('C002', 'mese', [c])).ritenutaPercentuale], [23]);
});
