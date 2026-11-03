// I progetti (03/11/2026, chiesti da Manuel): cliente -> commessa -> progetto -> rapportino. Il codice a mano le prime
// volte, poi proposto (casi-codici-progetto.json, gli stessi del telefono); unico fra i progetti dello stesso cliente; il
// rapportino sotto il progetto (scelto o nato sul telefono, anche due volte con lo stesso idLocale); i permessi.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const { proponiCodice } = require('../src/codici-progetto');
const CASI = require('./casi-codici-progetto.json');

giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

let s;
let manuel;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
});
test.after(() => s.ferma());

test('casi-codici-progetto.json: la regola dei codici, uguale a quella del telefono', () => {
  assert.ok(CASI.casi.length >= 20);
  for (const c of CASI.casi) assert.deepEqual(proponiCodice(c.progetti, c.dove), c.atteso, c.nome);
});

test('il codice: a mano le prime volte, poi proposto; unico per cliente; lo stesso idLocale non fa doppioni', async () => {
  const senza = await manuel('creaProgetto', { idCommessa: '26ST001', descrizione: 'Quadro QE1 Rossi' });
  assert.equal(senza.errore, 'Scrivi il codice del progetto: dopo i primi due Wisper lo propone da solo');
  assert.deepEqual(ok(await manuel('codiceProgetto', { idCommessa: '26ST001' })), { ok: true, codice: '', da: '' });
  const p1 = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'ED-001', intestatoA: 'Rossi Srl', descrizione: 'Quadro QE1' })).progetto;
  assert.deepEqual([p1.codice, p1.intestatoA, p1.descrizione, p1.stato, p1.idCommessa, p1.codiceAutomatico], ['ED-001', 'Rossi Srl', 'Quadro QE1', 'APERTO', '26ST001', false]);
  assert.ok(p1.idCliente, 'il cliente e\' quello della commessa');
  ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'ED-002', descrizione: 'Cabina MT' }));
  assert.deepEqual(ok(await manuel('codiceProgetto', { idCommessa: '26ST001' })), { ok: true, codice: 'ED-003', da: 'commessa' });
  // Per una commessa che nasce col rapportino: dal cliente; con un cliente nuovo, dalla forma di tutti i codici.
  assert.deepEqual(ok(await manuel('codiceProgetto', { idCliente: p1.idCliente })), { ok: true, codice: 'ED-003', da: 'cliente' });
  assert.deepEqual(ok(await manuel('codiceProgetto', { idCommessa: '26ST777' })), { ok: true, codice: 'ED-003', da: 'tutti' });
  const p3 = ok(await manuel('creaProgetto', { idCommessa: '26ST001', descrizione: 'Illuminazione', idLocale: 'tel-p3' })).progetto;
  assert.deepEqual([p3.codice, p3.codiceAutomatico, p3.intestatoA], ['ED-003', true, '']);
  const ancora = ok(await manuel('creaProgetto', { idCommessa: '26ST001', descrizione: 'Illuminazione', idLocale: 'tel-p3' })).progetto;
  assert.deepEqual([ancora.id, ancora.giaEsisteva], [p3.id, true]);
  // Scritto a mano e gia' preso: si rifiuta. Proposto da un telefono senza rete e preso nel frattempo: il successivo.
  assert.equal((await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'ed-002', descrizione: 'X' })).errore, 'Il codice ed-002 è già di un altro progetto di questo cliente');
  const p4 = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'ED-003', codiceProposto: true, descrizione: 'Rifasamento' })).progetto;
  assert.equal(p4.codice, 'ED-004');
  // Un altro cliente puo' avere lo stesso codice.
  ok(await manuel('creaProgetto', { idCommessa: '26ST002', codiceProgetto: 'ED-001', descrizione: 'Altro cliente' }));
  assert.equal((await manuel('creaProgetto', { idCommessa: '26ST999', codiceProgetto: 'Z', descrizione: 'Z' })).errore, 'Commessa 26ST999 non trovata');
  assert.equal((await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'Z-1' })).errore, 'Scrivi la descrizione del progetto');
});

test('il rapportino sotto il progetto: scelto (la commessa viene dal progetto), di un\'altra commessa no, nato sul telefono una volta sola', async () => {
  const progetti = ok(await manuel('progetti', { idCommessa: '26ST001' })).progetti;
  const p1 = progetti.find(p => p.codice === 'ED-001');
  const base = { data: '2026-10-21', cliente: 'Elettrodinamica', descrizione: 'Cablaggio quadro', oreLavoro: 4 };
  const r = ok(await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'tel-r1', idProgetto: p1.id }, base) })).rapportino;
  assert.deepEqual([r.idCommessa, r.idProgetto, r.progetto, r.progettoDescrizione, r.progettoIntestatoA], ['26ST001', p1.id, 'ED-001', 'Quadro QE1', 'Rossi Srl']);
  // Il progetto di un'altra commessa no.
  const altro = ok(await manuel('progetti', { idCommessa: '26ST002' })).progetti[0];
  const no = await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'tel-r2', idCommessa: '26ST001', idProgetto: altro.id }, base) });
  assert.equal(no.errore, 'Il progetto ED-001 è della commessa 26ST002, non della 26ST001');
  assert.equal((await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'tel-r2', idProgetto: 99999 }, base) })).errore, 'Progetto non trovato: scegline un altro');
  // Nato sul telefono senza rete: codice proposto dal telefono; lo stesso rapportino rimandato non fa un secondo progetto.
  const nuovo = { idLocale: 'tel-p9', codice: 'ED-005', codiceProposto: true, intestatoA: 'Bianchi Spa', descrizione: 'Linea 2' };
  const r3 = ok(await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'tel-r3', idCommessa: '26ST001', progettoNuovo: nuovo }, base) })).rapportino;
  assert.deepEqual([r3.progetto, r3.progettoIntestatoA], ['ED-005', 'Bianchi Spa']);
  const r3bis = ok(await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'tel-r3', idCommessa: '26ST001', progettoNuovo: nuovo }, base) })).rapportino;
  assert.equal(r3bis.idProgetto, r3.idProgetto);
  assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM progetti WHERE id_locale = 'tel-p9'").n, 1);
  // Un progetto nuovo vuole la commessa.
  const senzaCommessa = await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'tel-r4', progettoNuovo: { idLocale: 'tel-p10', descrizione: 'X' } }, base) });
  assert.equal(senzaCommessa.errore, 'Per un progetto nuovo scegli prima la commessa');
  // Elenco, scheda, filtro dei rapportini, anagrafiche.
  const scheda = ok(await manuel('progetto', { id: p1.id }));
  assert.deepEqual([scheda.progetto.rapportini, scheda.progetto.ore, scheda.rapportini.map(x => x.idLocale)], [1, 4, ['tel-r1']]);
  assert.deepEqual(ok(await manuel('rapportini', { idProgetto: p1.id, tutti: true })).rapportini.map(x => x.idLocale), ['tel-r1']);
  const ana = ok(await manuel('anagrafiche'));
  assert.ok(ana.progetti.some(p => p.codice === 'ED-005' && p.idCommessa === '26ST001'));
  assert.deepEqual(ok(await manuel('progetti', { cerca: 'bianchi' })).progetti.map(p => p.codice), ['ED-005']);
});

test('cambiare e togliere: il codice segue nei rapportini; commessa ferma con dei rapportini; si toglie solo vuoto', async () => {
  const p1 = ok(await manuel('progetti', { idCommessa: '26ST001' })).progetti.find(p => p.codice === 'ED-001');
  const cambiato = ok(await manuel('aggiornaProgetto', { id: p1.id, campi: { codice: 'ED-001A', stato: 'chiuso', intestatoA: '' } })).progetto;
  assert.deepEqual([cambiato.codice, cambiato.stato, cambiato.intestatoA], ['ED-001A', 'CHIUSO', '']);
  assert.equal(s.wisper.db.riga("SELECT progetto FROM rapportini WHERE id_locale = 'tel-r1'").progetto, 'ED-001A');
  assert.equal((await manuel('aggiornaProgetto', { id: p1.id, campi: { idCommessa: '26ST002' } })).errore, 'Il progetto ha già dei rapportini: la commessa non si cambia');
  assert.equal((await manuel('togliProgetto', { id: p1.id })).errore, 'Il progetto ha dei rapportini: non si toglie, si chiude');
  assert.equal((await manuel('aggiornaProgetto', { id: p1.id, campi: { codice: 'ED-002' } })).errore, 'Il codice ED-002 è già di un altro progetto di questo cliente');
  const vuoto = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'TOGLI-1', descrizione: 'Per sbaglio' })).progetto;
  ok(await manuel('aggiornaProgetto', { id: vuoto.id, campi: { idCommessa: '26ST002' } }));
  ok(await manuel('togliProgetto', { id: vuoto.id }));
  assert.ok(!s.wisper.db.riga('SELECT id FROM progetti WHERE id = ?', vuoto.id));
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE tabella = 'progetti' AND nota = 'progetto tolto'"));
});

test('i permessi: lettura e collaboratore vedono, non creano; il ruolo ha i progetti come le commesse', async () => {
  const lettura = await s.come('lettura@esempio.it');
  assert.ok(ok(await lettura('progetti', {})).progetti.length > 0);
  assert.equal((await lettura('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'L-1', descrizione: 'X' })).permesso, false);
  const marco = await s.come('marco@esempio.it');
  ok(await marco('progetti', {}));
  assert.equal((await marco('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'M-1', descrizione: 'X' })).permesso, false);
  const nuovoDalTelefono = await marco('salvaRapportino', { rapportino: { idLocale: 'marco-r1', data: '2026-10-21', cliente: 'Elettrodinamica', idCommessa: '26ST001', descrizione: 'X', oreLavoro: 1, progettoNuovo: { idLocale: 'marco-p1', descrizione: 'Nuovo' } } });
  assert.equal(nuovoDalTelefono.permesso, false);
  const livelli = {};
  for (const r of s.wisper.db.righe("SELECT ruolo, modulo, livello FROM permessi WHERE modulo IN ('commesse', 'progetti')")) livelli[r.ruolo + '.' + r.modulo] = r.livello;
  for (const ruolo of ['amministrazione', 'collaboratore', 'lettura', 'esterno']) assert.equal(livelli[ruolo + '.progetti'], livelli[ruolo + '.commesse'], ruolo);
});
