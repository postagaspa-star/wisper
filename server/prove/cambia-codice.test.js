// Cambiare il codice di una commessa dopo che e' nata (06/11/2026, cambiaCodiceCommessa {id, nuovoCodice}): ogni
// collegamento (rapportini, progetti, ore, spese, fatture anche emesse, documenti...) segue il codice nuovo; il vecchio
// resta in codice_precedente e vale ancora per le code dei telefoni; i testi gia' usciti restano come sono; i rifiuti;
// solo le maiuscole; la numerazione; il registro; i permessi.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');

giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

let s;
let manuel;
let w;
test.before(async () => {
  s = await serverDiProva();
  w = s.wisper;
  manuel = await s.come('manuel@esempio.it');
});
test.after(() => s.ferma());

/** Quante righe di ogni tabella portano questo codice (le colonne commessa_id / id_commessa / rapportini.commessa). */
function collegamenti(codice) {
  const o = {};
  for (const t of w.db.righe("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'commesse'")) {
    for (const c of w.db.righe('PRAGMA table_info("' + t.name + '")')) {
      if (c.name !== 'commessa_id' && c.name !== 'id_commessa' && !(t.name === 'rapportini' && c.name === 'commessa')) continue;
      const n = w.db.riga('SELECT COUNT(*) n FROM "' + t.name + '" WHERE "' + c.name + '" = ? COLLATE NOCASE', codice).n;
      if (n) o[t.name + '.' + c.name] = n;
    }
  }
  return o;
}

const ultimaDelRegistro = () => w.db.riga("SELECT * FROM registro WHERE tabella = 'commesse' ORDER BY id DESC LIMIT 1");

test('il codice cambia e tutto lo segue: rapportini, progetti, ore, spese, documenti...; il progetto tiene il suo codice', async () => {
  // Un progetto sulla 26ST001 con un rapportino sotto.
  const p = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'ED-001', descrizione: 'Quadro QE1' })).progetto;
  ok(await manuel('salvaRapportino', { rapportino: { idLocale: 'cc-r1', idProgetto: p.id, data: '2026-10-21', cliente: 'Elettrodinamica', descrizione: 'Cablaggio', oreLavoro: 2 } }));
  const prima = collegamenti('26ST001');
  for (const k of ['rapportini.id_commessa', 'rapportini.commessa', 'progetti.commessa_id', 'ore.commessa_id', 'spese.commessa_id', 'documenti.commessa_id',
    'attivita.commessa_id', 'commessa_persone.commessa_id', 'prestazioni.commessa_id', 'timer.commessa_id', 'trasferte.commessa_id', 'incarichi.commessa_id']) {
    assert.ok(prima[k] > 0, 'nei dati di esempio c\'e\' ' + k);
  }
  const prossimoPrima = (await manuel('numerazioni')).numerazioni.find(n => n.tipo === 'commessa').prossimo;
  assert.equal(prossimoPrima, '26ST007');

  const r = ok(await manuel('cambiaCodiceCommessa', { id: '26ST001', nuovoCodice: '26ST050' }));
  assert.equal(r.vecchio, '26ST001');
  assert.deepEqual([r.commessa.id, r.commessa.codicePrecedente, r.commessa.idCliente], ['26ST050', '26ST001', 'C001']);
  assert.ok('precedente' in r.commessa && 'cambiato' in r.commessa, 'la stessa forma di aggiornaCommessa');
  assert.deepEqual(collegamenti('26ST001'), {});
  assert.deepEqual(collegamenti('26ST050'), prima);
  assert.deepEqual(w.db.righe('PRAGMA foreign_key_check'), []);
  // Il progetto: stesso codice, commessa nuova.
  const dopo = ok(await manuel('progetto', { id: p.id })).progetto;
  assert.deepEqual([dopo.codice, dopo.idCommessa], ['ED-001', '26ST050']);
  // Anche gli elenchi delle app la vedono col codice nuovo.
  const ana = ok(await manuel('anagrafiche'));
  assert.ok(ana.commesse.some(m => m.id === '26ST050' && m.codicePrecedente === '26ST001'));
  assert.ok(!ana.commesse.some(m => m.id === '26ST001'));
  assert.ok(ok(await manuel('rapportini', { tutti: true })).rapportini.filter(x => x.idCommessa === '26ST050').length === prima['rapportini.id_commessa']);
  // Il registro: una riga, chi e cosa, quanti collegamenti.
  const reg = ultimaDelRegistro();
  assert.deepEqual([reg.azione, reg.id_riga, JSON.parse(reg.prima), JSON.parse(reg.dopo)],
    ['cambiaCodiceCommessa', '26ST050', { id: '26ST001', codice_precedente: '' }, { id: '26ST050', codice_precedente: '26ST001' }]);
  assert.match(reg.nota, /^codice cambiato da 26ST001 a 26ST050; seguono il codice nuovo: .*rapportini 5/);
  assert.match(reg.nota, /progetti 1/);
  // La numerazione: il codice nuovo conta (26ST051), il vecchio non torna.
  assert.equal((await manuel('numerazioni')).numerazioni.find(n => n.tipo === 'commessa').prossimo, '26ST051');
  assert.equal(ok(await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Dopo il cambio' })).commessa.id, '26ST051');
});

test('il codice di prima vale ancora: rapportino, ore, spese, progetto, attivita\' e scheda dalla coda di un telefono', async () => {
  const base = { data: '2026-10-21', cliente: 'Elettrodinamica', descrizione: 'Dalla coda', oreLavoro: 1 };
  const rap = ok(await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'cc-coda-1', idCommessa: '26ST001' }, base) })).rapportino;
  assert.equal(rap.idCommessa, '26ST050');
  assert.equal(w.db.riga("SELECT commessa FROM rapportini WHERE id_locale = 'cc-coda-1'").commessa, '26ST050');
  // Anche scritto in minuscolo.
  assert.equal(ok(await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'cc-coda-2', idCommessa: '26st001' }, base) })).rapportino.idCommessa, '26ST050');
  assert.equal(ok(await manuel('salvaOre', { riga: { data: '2026-10-21', idCommessa: '26ST001', ore: 1.5, descrizione: 'Disegni' } })).riga.idCommessa, '26ST050');
  assert.equal(ok(await manuel('salvaSpesa', { spesa: { data: '2026-10-21', importo: 12, idCommessa: '26ST001', categoria: 'pedaggio' } })).spesa.idCommessa, '26ST050');
  assert.equal(ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'ED-009', descrizione: 'Dalla coda' })).progetto.idCommessa, '26ST050');
  assert.equal(ok(await manuel('salvaAttivita', { attivita: { titolo: 'Sopralluogo', inizio: '2026-10-23T09:00:00', idCommessa: '26ST001' } })).attivita.idCommessa, '26ST050');
  // Un progetto che ha gia' dei rapportini, rimandato col codice di prima: e' la stessa commessa, non un cambio.
  const p = ok(await manuel('progetti', { idCommessa: '26ST050' })).progetti.find(x => x.codice === 'ED-001');
  ok(await manuel('aggiornaProgetto', { id: p.id, campi: { idCommessa: '26ST001', descrizione: 'Quadro QE1 bis' } }));
  assert.equal((await manuel('aggiornaProgetto', { id: p.id, campi: { idCommessa: '26ST002' } })).errore, 'Il progetto ha già dei rapportini: la commessa non si cambia');
});

test('nelle fatture: le emesse seguono il codice ma il loro testo resta; nelle bozze il testo cambia dove c\'e\' il codice', async () => {
  const rigaDi = id => w.db.riga('SELECT commessa_id, causale, stato FROM fatture WHERE id = ?', id);
  assert.deepEqual([rigaDi(13).stato, rigaDi(13).causale], ['emessa', '30% alla firma, commessa 26ST003']);
  assert.deepEqual([rigaDi(15).stato, rigaDi(15).causale], ['bozza', '40% a fine progetto, commessa 26ST003']);
  const righeEmessa = w.db.righe('SELECT descrizione FROM fattura_righe WHERE fattura_id = 13 ORDER BY id').map(x => x.descrizione);
  assert.ok(righeEmessa.some(d => d.includes('26ST003')));
  const prima = collegamenti('26ST003');
  assert.ok(prima['fatture.commessa_id'] === 2 && prima['fattura_righe.commessa_id'] > 0 && prima['scadenze_pagamento.commessa_id'] > 0);

  const r = ok(await manuel('cambiaCodiceCommessa', { id: '26ST003', nuovoCodice: 'P-77/A.1' }));
  assert.deepEqual([r.commessa.id, r.vecchio], ['P-77/A.1', '26ST003']);
  assert.deepEqual(collegamenti('P-77/A.1'), prima);
  // Emessa: collegata alla commessa nuova, testi di prima (sono gia' usciti: XML, PDF, email).
  assert.deepEqual([rigaDi(13).commessa_id, rigaDi(13).causale], ['P-77/A.1', '30% alla firma, commessa 26ST003']);
  assert.deepEqual(w.db.righe('SELECT descrizione FROM fattura_righe WHERE fattura_id = 13 ORDER BY id').map(x => x.descrizione), righeEmessa);
  // Bozza: anche il testo.
  assert.deepEqual([rigaDi(15).commessa_id, rigaDi(15).causale], ['P-77/A.1', '40% a fine progetto, commessa P-77/A.1']);
  const righeBozza = w.db.righe("SELECT descrizione FROM fattura_righe WHERE fattura_id = 15 AND origine = 'bozza' ORDER BY id").map(x => x.descrizione);
  assert.ok(righeBozza.some(d => d.includes('(commessa P-77/A.1, contratto')), righeBozza.join(' | '));
  assert.ok(!righeBozza.some(d => d.includes('26ST003')));
  const f = ok(await manuel('fattura', { id: 15 })).fattura;
  assert.equal(f.idCommessa, 'P-77/A.1');
  assert.match(ultimaDelRegistro().nota, /testi delle bozze delle fatture 1$/);
  assert.deepEqual(w.db.righe('PRAGMA foreign_key_check'), []);
  // Un codice che non ha la forma dei codici non tocca la numerazione.
  assert.equal((await manuel('numerazioni')).numerazioni.find(n => n.tipo === 'commessa').prossimo, '26ST052');
});

test('i rifiuti: vuoto, gia\' preso (anche in minuscolo), caratteri o lunghezza; commessa che non c\'e\'; lo stesso codice non fa niente', async () => {
  const rifiuto = async (d, testo) => {
    const r = await manuel('cambiaCodiceCommessa', d);
    assert.equal(r.ok, false);
    assert.equal(r.errore, testo);
  };
  await rifiuto({ id: '26ST002', nuovoCodice: '' }, 'Scrivi il nuovo codice');
  await rifiuto({ id: '26ST002', nuovoCodice: '   ' }, 'Scrivi il nuovo codice');
  await rifiuto({ id: '26ST002' }, 'Scrivi il nuovo codice');
  await rifiuto({ id: '26ST002', nuovoCodice: '26ST004' }, 'Il codice 26ST004 è già di un\'altra commessa');
  await rifiuto({ id: '26ST002', nuovoCodice: '26st004' }, 'Il codice 26st004 è già di un\'altra commessa');
  const forma = 'Il codice può avere lettere, numeri, - _ / e punto, al massimo 20 caratteri';
  for (const c of ['26 ST 002', 'X'.repeat(21), 'però', '26ST#2', 'a,b']) await rifiuto({ id: '26ST002', nuovoCodice: c }, forma);
  await rifiuto({ nuovoCodice: '26ST090' }, 'Serve il codice della commessa');
  await rifiuto({ id: '99ZZ999', nuovoCodice: '26ST090' }, 'Commessa 99ZZ999 non trovata');
  // Al massimo 20 caratteri, con tutti quelli ammessi: si'.
  ok(await manuel('cambiaCodiceCommessa', { id: '26ST002', nuovoCodice: 'Ab-1_2/3.4567890123' + '4' }));
  ok(await manuel('cambiaCodiceCommessa', { id: 'Ab-1_2/3.45678901234', nuovoCodice: '26ST002' }));
  // Lo stesso codice: ok, niente registro, niente codice di prima.
  const righe = w.db.riga('SELECT COUNT(*) n FROM registro').n;
  const r = ok(await manuel('cambiaCodiceCommessa', { id: '26ST002', nuovoCodice: '26ST002' }));
  assert.deepEqual([r.commessa.id, r.vecchio], ['26ST002', '26ST002']);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM registro').n, righe);
  // Il rifiuto non lascia niente a meta'.
  assert.ok(w.db.riga("SELECT id FROM commesse WHERE id = '26ST002'"));
});

test('solo le maiuscole: il codice si scrive come lo si vuole, il codice di prima resta quello che era', async () => {
  const ticket = w.db.riga("SELECT COUNT(*) n FROM ticket WHERE commessa_id = '26ST004'").n;
  assert.ok(ticket > 0);
  ok(await manuel('cambiaCodiceCommessa', { id: '26ST004', nuovoCodice: '26st004' }));
  const riga = w.db.riga("SELECT id, codice_precedente FROM commesse WHERE id = '26ST004'");
  assert.deepEqual([riga.id, riga.codice_precedente], ['26st004', '']);
  // Anche nei collegamenti il codice e' scritto come quello nuovo (il confronto qui guarda le maiuscole).
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM ticket WHERE commessa_id = '26st004' COLLATE BINARY").n, ticket);
  assert.match(ultimaDelRegistro().nota, /^codice cambiato da 26ST004 a 26st004/);
  assert.equal(ok(await manuel('salvaOre', { riga: { data: '2026-10-21', idCommessa: '26ST004', ore: 1 } })).riga.idCommessa, '26st004');
  // E di nuovo maiuscolo; poi un cambio vero mette in codice_precedente il codice com'era scritto.
  ok(await manuel('cambiaCodiceCommessa', { id: '26st004', nuovoCodice: '26ST004' }));
  assert.equal(w.db.riga("SELECT id FROM commesse WHERE id = '26ST004'").id, '26ST004');
});

test('un secondo cambio: il codice di prima e\' l\'ultimo; quello di due cambi fa non vale piu\'; il codice di adesso vince sempre', async () => {
  // 26ST001 -> 26ST050 (prima prova) -> 26ST060.
  const r = ok(await manuel('cambiaCodiceCommessa', { id: '26ST050', nuovoCodice: '26ST060' }));
  assert.deepEqual([r.commessa.codicePrecedente, r.vecchio], ['26ST050', '26ST050']);
  assert.equal(ok(await manuel('salvaOre', { riga: { data: '2026-10-21', idCommessa: '26ST050', ore: 1 } })).riga.idCommessa, '26ST060');
  assert.equal((await manuel('salvaOre', { riga: { data: '2026-10-21', idCommessa: '26ST001', ore: 1 } })).errore, 'Commessa 26ST001 non trovata');
  // Si puo' anche partire dal codice di prima.
  assert.equal(ok(await manuel('cambiaCodiceCommessa', { id: '26ST050', nuovoCodice: '26ST061' })).commessa.id, '26ST061');
  // Un'altra commessa prende il codice 26ST060 lasciato libero: vale lei, non quella che l'aveva prima.
  ok(await manuel('cambiaCodiceCommessa', { id: '26ST005', nuovoCodice: '26ST060' }));
  ok(await manuel('cambiaCodiceCommessa', { id: '26ST061', nuovoCodice: '26ST062' }));
  assert.equal(ok(await manuel('salvaOre', { riga: { data: '2026-10-21', idCommessa: '26ST060', ore: 1 } })).riga.idCommessa, '26ST060');
  assert.equal(ok(await manuel('salvaOre', { riga: { data: '2026-10-21', idCommessa: '26ST061', ore: 1 } })).riga.idCommessa, '26ST062');
});

test('i permessi: commesse a livello 2 (titolare e amministrazione); collaboratore, lettura ed esterno no', async () => {
  const laura = await s.come('laura@esempio.it');
  assert.equal(ok(await laura('cambiaCodiceCommessa', { id: '26ST006', nuovoCodice: '26ST066' })).commessa.id, '26ST066');
  for (const email of ['marco@esempio.it', 'lettura@esempio.it', 'luca@esempio.it']) {
    const chi = await s.come(email);
    assert.equal((await chi('cambiaCodiceCommessa', { id: '26ST066', nuovoCodice: '26ST067' })).permesso, false, email);
  }
  assert.ok(w.db.riga("SELECT id FROM commesse WHERE id = '26ST066'"));
});
