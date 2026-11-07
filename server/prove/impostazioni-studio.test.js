// Due impostazioni dello studio (06/11/2026): STUDIO_SDI (il codice SDI, vuoto o 7 lettere e cifre, in maiuscolo) e
// PDF_NOME (il nome accanto al logo nei PDF, di base si'). E il salvataggio automatico delle app, una impostazione alla
// volta anche ogni secondo: i salvataggi di fila della stessa persona fanno una riga sola nel registro. L'albo una chiave
// alla volta e le notifiche una parte alla volta (le parti che non ci sono restano).
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

const salva = valori => manuel('salvaImpostazioni', { valori });
const imp = async () => ok(await manuel('anagrafiche')).impostazioni;
/** Le righe del registro di quella chiave, lette dalla tabella (senza aprire il registro, che scrive quelle in attesa). */
const righeDi = chiave => w.db.righe("SELECT * FROM registro WHERE tabella = 'impostazioni' AND id_riga = ? ORDER BY id", chiave);
const inAttesa = () => w.db.righe('SELECT * FROM registro_in_attesa ORDER BY chiave');
const valore = j => JSON.parse(JSON.parse(j).valore);

test('i valori di base: STUDIO_SDI vuoto, PDF_NOME acceso (anche in io), con la loro descrizione', async () => {
  const i = await imp();
  assert.equal(i.STUDIO_SDI, '');
  assert.equal(i.PDF_NOME, true);
  assert.equal(ok(await manuel('io')).interfaccia.pdfNome, true);
  const d = Object.fromEntries(w.db.righe("SELECT chiave, descrizione FROM impostazioni WHERE chiave IN ('STUDIO_SDI', 'PDF_NOME')").map(r => [r.chiave, r.descrizione]));
  assert.deepEqual(d, { STUDIO_SDI: 'Codice SDI dello studio, per ricevere le fatture', PDF_NOME: 'Nome dello studio accanto al logo nei PDF' });
});

test('STUDIO_SDI: 7 lettere e cifre, in maiuscolo e senza spazi, sempre testo; vuoto si\'; il resto no', async () => {
  ok(await salva({ STUDIO_SDI: 'm5uxcr1' }));
  assert.equal((await imp()).STUDIO_SDI, 'M5UXCR1');
  ok(await salva({ STUDIO_SDI: ' abc 1234 ' }));
  assert.equal((await imp()).STUDIO_SDI, 'ABC1234');
  ok(await salva({ STUDIO_SDI: '0000000' }));
  assert.strictEqual((await imp()).STUDIO_SDI, '0000000', 'le cifre restano testo (lo zero davanti non si perde)');
  ok(await salva({ STUDIO_SDI: 1234567 }));
  assert.strictEqual((await imp()).STUDIO_SDI, '1234567', 'anche mandato come numero');
  ok(await salva({ STUDIO_SDI: '0000000' }));
  for (const no of ['ABC123', 'ABC12345', 'ABC-123', 'àbc1234', 123456]) {
    const r = await salva({ STUDIO_SDI: no });
    assert.equal(r.ok, false, String(no));
    assert.equal(r.errore, 'Il codice SDI ha 7 caratteri, lettere e numeri');
  }
  assert.strictEqual((await imp()).STUDIO_SDI, '0000000', 'un rifiuto non cambia niente');
  ok(await salva({ STUDIO_SDI: '' }));
  assert.equal((await imp()).STUDIO_SDI, '');
});

test('PDF_NOME: si\' o no come PDF_LOGO; spento si vede in io', async () => {
  for (const [dato, atteso] of [[false, false], ['true', true], [0, false], ['1', true], ['false', false], [1, true], ['0', false], [true, true]]) {
    ok(await salva({ PDF_NOME: dato }));
    assert.equal((await imp()).PDF_NOME, atteso, JSON.stringify(dato));
    assert.equal(ok(await manuel('io')).interfaccia.pdfNome, atteso, JSON.stringify(dato));
  }
  const r = await salva({ PDF_NOME: 'boh' });
  assert.equal(r.errore, 'Nome dello studio accanto al logo nei PDF: sì o no');
});

test('il salvataggio automatico: tre salvataggi di fila fanno una riga (il primo prima, l\'ultimo dopo); chi apre il registro la vede', async () => {
  await manuel('registro', {});
  const partenza = (await imp()).STUDIO_SITO;
  const righePrima = righeDi('STUDIO_SITO').length;
  for (const v of ['w', 'www.st', 'www.studio-di-esempio.it']) ok(await salva({ STUDIO_SITO: v }));
  assert.equal((await imp()).STUDIO_SITO, 'www.studio-di-esempio.it', 'il valore e\' salvato subito');
  assert.equal(righeDi('STUDIO_SITO').length, righePrima, 'la riga aspetta');
  assert.deepEqual(inAttesa().map(r => [r.id_riga, r.volte]), [['STUDIO_SITO', 3]]);
  const reg = ok(await manuel('registro', { tabella: 'impostazioni', idRiga: 'STUDIO_SITO' }));
  assert.deepEqual(inAttesa(), []);
  const r = reg.righe[0];
  assert.deepEqual([r.utente, r.azione, r.nota], ['Manuel Gasparotto', 'salvaImpostazioni', 'salvata 3 volte di fila']);
  assert.deepEqual([JSON.parse(r.prima.valore), JSON.parse(r.dopo.valore)], [partenza, 'www.studio-di-esempio.it']);
  assert.equal(righeDi('STUDIO_SITO').length, righePrima + 1);
  // Un salvataggio solo: la sua riga, senza nota.
  ok(await salva({ STUDIO_SITO: 'www.esempio.it' }));
  assert.equal(ok(await manuel('registro', { tabella: 'impostazioni', idRiga: 'STUDIO_SITO' })).righe[0].nota, '');
});

test('la serie finisce: un\'altra impostazione della stessa persona, 2 minuti fermi, lo spegnimento; tornata a com\'era non lascia righe', async () => {
  await manuel('registro', {});
  const n = righeDi('STUDIO_SITO').length;
  // Un'altra impostazione: la serie di prima va nel registro.
  ok(await salva({ STUDIO_SITO: 'a' }));
  ok(await salva({ STUDIO_SITO: 'ab' }));
  ok(await salva({ PDF_PIEDE: 'Riga in fondo' }));
  assert.equal(righeDi('STUDIO_SITO').length, n + 1);
  assert.deepEqual(righeDi('STUDIO_SITO').map(r => valore(r.dopo)).pop(), 'ab');
  assert.deepEqual(inAttesa().map(r => r.id_riga), ['PDF_PIEDE']);
  // Due minuti fermi: la prossima riga di chiunque la scrive, con l'ora dell'ultimo salvataggio.
  const quando = inAttesa()[0].quando;
  w.db.esegui('UPDATE registro_in_attesa SET ultimo_ms = ultimo_ms - 121000');
  ok(await manuel('aggiornaCommessa', { id: '26ST002', campi: { note: 'Per la prova del registro' } }));
  assert.deepEqual(inAttesa(), []);
  const piede = righeDi('PDF_PIEDE').pop();
  assert.deepEqual([valore(piede.dopo), piede.quando], ['Riga in fondo', quando]);
  const ultime = w.db.righe('SELECT tabella FROM registro ORDER BY id DESC LIMIT 2').map(r => r.tabella);
  assert.deepEqual(ultime, ['commesse', 'impostazioni'], 'in ordine di tempo');
  // Tornata al valore di partenza: niente riga.
  const m = righeDi('PDF_PIEDE').length;
  ok(await salva({ PDF_PIEDE: 'Riga in fondo, bis' }));
  ok(await salva({ PDF_PIEDE: 'Riga in fondo' }));
  await manuel('registro', {});
  assert.equal(righeDi('PDF_PIEDE').length, m);
  // Lo spegnimento (e la riaccensione) scrivono quelle in attesa: qui la stessa funzione, come chiudi().
  ok(await salva({ PDF_PIEDE: 'Ultima' }));
  w.db.transazione(() => w.scriviInAttesa({ tutte: true }));
  assert.equal(valore(righeDi('PDF_PIEDE').pop().dopo), 'Ultima');
});

test('persone e dispositivi diversi: serie diverse; il ponte e il sistema scrivono subito', async () => {
  await manuel('registro', {});
  const manuelVero = w.db.riga("SELECT id, nome FROM utenti WHERE email = 'manuel@esempio.it'");
  const n = righeDi('STUDIO_SITO').length;
  ok(await salva({ STUDIO_SITO: 'dal computer' }));
  w.come({ utente: manuelVero, dispNome: 'telefono di Manuel', azione: 'salvaImpostazioni' }, () => w.salvaImpostazioni({ STUDIO_SITO: 'dal telefono' }));
  assert.equal(inAttesa().length, 2);
  w.come({ utente: manuelVero, dispNome: 'telefono di Manuel', ponte: true, azione: 'salvaImpostazioni' }, () => w.salvaImpostazioni({ PDF_PIEDE: 'Dal ponte' }));
  assert.equal(valore(righeDi('PDF_PIEDE').pop().dopo), 'Dal ponte', 'il ponte: subito');
  w.salvaImpostazioni({ PDF_PIEDE: 'Dal sistema' });
  assert.equal(righeDi('PDF_PIEDE').pop().utente, 'sistema');
  await manuel('registro', {});
  const due = righeDi('STUDIO_SITO').slice(n);
  assert.deepEqual(due.map(r => [r.disp, valore(r.dopo)]).sort(), [['prove automatiche', 'dal computer'], ['telefono di Manuel', 'dal telefono']]);
});

test('le regole fiscali: una riga a ogni cambio, e cambiarne una toglie ancora la conferma del commercialista', async () => {
  ok(await manuel('confermaRegoleFiscali', { data: '2026-11-05', commercialista: 'Studio di esempio' }));
  const n = righeDi('BOLLO_SOGLIA').length;
  ok(await salva({ BOLLO_SOGLIA: 77.48 }));
  assert.equal((await imp()).REGOLE_FISCALI_CONFERMATE, null);
  ok(await salva({ BOLLO_SOGLIA: 77.47 }));
  assert.equal(righeDi('BOLLO_SOGLIA').length, n + 2, 'subito, senza raggruppare');
  assert.deepEqual(inAttesa(), []);
  assert.equal(righeDi('REGOLE_FISCALI_CONFERMATE').pop().nota, 'regole cambiate: la conferma del commercialista non vale più');
});

test('Esporta tutto porta anche le righe in attesa', async () => {
  ok(await salva({ STUDIO_SITO: 'prima di esportare' }));
  assert.equal(inAttesa().length, 1);
  const csv = w.come({ utente: w.db.riga("SELECT id, nome FROM utenti WHERE email = 'manuel@esempio.it'"), sistema: false }, () => w.esportaRegistroIntero());
  assert.deepEqual(inAttesa(), []);
  assert.ok(Buffer.from(csv.base64, 'base64').toString('utf8').includes('prima di esportare'));
});

// 06/11/2026: le app salvano da sole un campo per volta anche nei dati dello studio (l'albo) e nelle notifiche.
test('l\'albo una chiave alla volta: le altre restano, il numero e la data restano testo', async () => {
  ok(await salva({ ALBO: 'Periti industriali' }));
  ok(await salva({ ALBO_PROVINCIA: 'VI' }));
  ok(await salva({ ALBO_NUMERO: '0012' }));
  ok(await salva({ ALBO_DATA: '2010-05-12' }));
  let i = await imp();
  assert.deepEqual([i.ALBO, i.ALBO_PROVINCIA, i.ALBO_NUMERO, i.ALBO_DATA], ['Periti industriali', 'VI', '0012', '2010-05-12']);
  ok(await salva({ ALBO_NUMERO: '' }));
  i = await imp();
  assert.deepEqual([i.ALBO, i.ALBO_PROVINCIA, i.ALBO_NUMERO, i.ALBO_DATA], ['Periti industriali', 'VI', '', '2010-05-12']);
  ok(await salva({ ALBO_NUMERO: '0012' }));
});

test('le notifiche una parte alla volta: le parti che non ci sono (assenti, null o vuote) restano com\'erano', async () => {
  const prefs = async () => { const p = ok(await manuel('notifichePreferenze')); return [p.telefono, p.silenzioSera, p.tipi.assegnato, p.tipi.da_mandare]; };
  ok(await manuel('salvaNotifichePreferenze', { telefono: true, silenzioSera: true, tipi: { assegnato: true, da_mandare: true } }));
  assert.deepEqual(await prefs(), [true, true, true, true]);
  // Solo il telefono (dal telefono: le altre parti null).
  ok(await manuel('salvaNotifichePreferenze', { telefono: false, silenzioSera: null, tipi: null }));
  assert.deepEqual(await prefs(), [false, true, true, true]);
  // Solo il silenzio.
  ok(await manuel('salvaNotifichePreferenze', { silenzioSera: false }));
  assert.deepEqual(await prefs(), [false, false, true, true]);
  // Solo un tipo: gli altri tipi e le altre parti restano.
  ok(await manuel('salvaNotifichePreferenze', { telefono: null, tipi: { assegnato: false } }));
  assert.deepEqual(await prefs(), [false, false, false, true]);
  ok(await manuel('salvaNotifichePreferenze', { tipi: { da_mandare: false, assegnato: null } }));
  assert.deepEqual(await prefs(), [false, false, false, false]);
  // Niente da salvare: niente cambia.
  ok(await manuel('salvaNotifichePreferenze', { telefono: '', silenzioSera: null, tipi: {} }));
  assert.deepEqual(await prefs(), [false, false, false, false]);
  ok(await manuel('salvaNotifichePreferenze', { telefono: true, silenzioSera: true, tipi: { assegnato: true, da_mandare: true } }));
  assert.deepEqual(await prefs(), [true, true, true, true]);
});
