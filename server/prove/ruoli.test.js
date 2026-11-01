// Accesso e permessi: per ogni ruolo "non deve vedere / non deve scrivere".
// Il server e' la garanzia: le app nascondono, ma qui si prova che il server dice di no.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, PNG } = require('./aiuto');
const { CAMPI_COSTI } = require('../src/permessi');

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

const base64 = PNG.toString('base64');
const SCADUTO = { ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false };

/** Le chiavi di un oggetto a qualunque profondita'. */
function chiavi(x, out) {
  out = out || new Set();
  if (Array.isArray(x)) x.forEach(v => chiavi(v, out));
  else if (x && typeof x === 'object') for (const k of Object.keys(x)) { out.add(k); chiavi(x[k], out); }
  return out;
}
const soldiIn = x => Array.from(chiavi(x)).filter(k => CAMPI_COSTI.has(k));

// ------------------------------------------------------------------ entrare

test('senza token, con un token sbagliato o dopo "esci": accesso scaduto', async () => {
  assert.deepEqual(await s.chiama(null, { azione: 'anagrafiche' }), SCADUTO);
  assert.deepEqual(await s.chiama('token-inventato', { azione: 'rapportini' }), SCADUTO);
  assert.deepEqual(await s.leggi(null, { azione: 'rapportini' }), SCADUTO);
  const t = await s.accedi('laura@esempio.it');
  assert.equal((await s.chiama(t, { azione: 'io' })).ok, true);
  assert.equal((await s.chiama(t, { azione: 'esci' })).ok, true);
  assert.deepEqual(await s.chiama(t, { azione: 'io' }), SCADUTO);
  const f = await fetch(s.url + '/file/qualcosa');
  assert.equal(f.status, 401);
});

test('password sbagliata o email sconosciuta: la stessa frase', async () => {
  const a = await s.chiama(null, { azione: 'accedi', email: 'manuel@esempio.it', password: 'sbagliata' });
  const b = await s.chiama(null, { azione: 'accedi', email: 'nessuno@esempio.it', password: 'sbagliata' });
  assert.deepEqual(a, { ok: false, errore: 'Email o password sbagliate' });
  assert.deepEqual(b, a);
  assert.equal((await s.chiama(null, { azione: 'accedi', email: '', password: '' })).errore, 'Scrivi email e password');
  const ok = await s.chiama(null, { azione: 'accedi', email: ' MANUEL@esempio.it ', password: 'prova' });
  assert.equal(ok.ok, true, 'maiuscole e spazi dell\'email non contano');
  assert.equal(ok.utente.ruolo, 'titolare');
  assert.equal(ok.permessi.amministrazione, 2);
  assert.equal(ok.token.length, 43, '32 byte in base64url');
});

test('10 tentativi sbagliati in 15 minuti: si aspetta, anche con la password giusta', async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await s.chiama(null, { azione: 'accedi', email: 'lettura@esempio.it', password: 'no' + i })).errore, 'Email o password sbagliate');
  }
  const r = await s.chiama(null, { azione: 'accedi', email: 'lettura@esempio.it', password: 'prova' });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'Troppi tentativi: riprova fra 15 minuti');
  assert.equal((await s.chiama(null, { azione: 'accedi', email: 'laura@esempio.it', password: 'prova' })).ok, true, 'le altre email no');
  const reg = await manuel('registro', { tabella: 'tentativi_accesso' });
  assert.match(reg.righe[0].nota, /fermato per 15 minuti/);
  assert.equal(/\bno\d\b/.test(JSON.stringify(reg)), false, 'le password provate non finiscono nel registro');
  const acc = await manuel('accessi', { esito: 'bloccato' });
  assert.ok(acc.righe.length >= 1);
  // Passati i 15 minuti si rientra (qui: i tentativi si fanno "vecchi").
  s.wisper.db.esegui("UPDATE tentativi_accesso SET quando = '2026-01-01T00:00:00+01:00' WHERE email = 'lettura@esempio.it'");
  assert.equal((await s.chiama(null, { azione: 'accedi', email: 'lettura@esempio.it', password: 'prova' })).ok, true);
});

test('una sessione senza uso da piu\' di 180 giorni scade', async () => {
  const t = await s.accedi('laura@esempio.it');
  s.wisper.db.esegui("UPDATE sessioni SET ultimo_uso = '2026-01-01T00:00:00+01:00' WHERE id = (SELECT MAX(id) FROM sessioni)");
  assert.deepEqual(await s.chiama(t, { azione: 'io' }), SCADUTO);
});

test('io: chi sono, i permessi, il titolare e la ragione sociale', async () => {
  const r = await marco('io');
  assert.equal(r.utente.nome, 'Marco Rossato');
  assert.equal(r.utente.ruolo, 'collaboratore');
  assert.equal(r.permessi.rapportini, 2);
  assert.equal(r.permessi.costi, 0);
  assert.equal(r.titolare, 'Manuel Gasparotto');
  assert.equal(r.ragioneSociale, 'Studio Tecnico GM');
  assert.equal(r.interfaccia.soloSuoi, true);
});

// ------------------------------------------------------------------ collaboratore

test('collaboratore: vede solo i suoi rapportini, e senza tariffe, totali e costi', async () => {
  const r = await marco('rapportini', { tutti: true });
  assert.deepEqual(r.rapportini.map(x => x.id).sort(), ['RAP/2026/0005', 'RAP/2026/0006']);
  assert.deepEqual(soldiIn(r), [], 'nessun campo dei soldi');
  assert.equal(r.rapportini[0].oreLavoro > 0, true, 'le ore si', );
  const a = await marco('anagrafiche');
  assert.deepEqual(soldiIn(a), []);
  assert.equal('EURO_KM' in a.impostazioni, false);
  assert.ok(a.clienti.length >= 2 && a.commesse.length >= 2, 'clienti e commesse li vede');
  const d = await marco('dashboard', { tutto: true });
  assert.deepEqual(soldiIn(d), []);
  assert.equal(d.per, 'collaboratore');
  assert.equal([].concat(d.urgenti, d.settimana, d.pianificare).some(v => v.gravita === 'soldi'), false);
  assert.equal(JSON.stringify(d).includes('€'), false);
});

test('collaboratore: non tocca i rapportini degli altri, in nessun modo', async () => {
  const altrui = 'RAP/2026/0003';
  const tentativi = [
    await marco('salvaRapportino', { rapportino: { id: altrui, idCliente: 'C001', oreLavoro: 1 } }),
    await marco('stato', { ids: [altrui], stato: 'BOZZA' }),
    await marco('caricaFile', { tipo: 'spesa', id: altrui, base64 }),
    await marco('caricaFile', { tipo: 'firma', id: altrui, base64 }),
    await marco('togliFile', { id: altrui, fileId: 'x' }),
    await marco('ripristinaRapportino', { id: altrui }),
    await marco('inviaEmail', { a: 'x@example.com', oggetto: 'x', ids: [altrui] }),
  ];
  for (const t of tentativi) {
    assert.equal(t.ok, false);
    assert.equal(t.permesso, false, t.errore);
  }
  // La firma di un rapportino altrui non si scarica.
  const f = (await manuel('caricaFile', { tipo: 'firma', id: altrui, idFile: 'firma-altrui', mime: 'image/png', base64, firmatario: 'X' })).file;
  assert.equal((await marco.file(f.id)).status, 403);
  assert.equal((await marco('file', { id: f.id })).permesso, false);
  assert.equal((await manuel.file(f.id)).status, 200);
});

test('collaboratore: scrive i suoi, col suo nome e la tariffa decisa dal server', async () => {
  const r = await marco('salvaRapportino', { rapportino: { idLocale: 'marco-nuovo', data: '2026-10-21', idCliente: 'C002', idCommessa: '26ST002', tecnico: 'Manuel Gasparotto', tariffa: 999, oreLavoro: 2 } });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.rapportino.tecnico, 'Marco Rossato');
  assert.equal(r.rapportino.idUtente, 3);
  assert.equal('tariffa' in r.rapportino, false);
  const visto = (await manuel('rapportini', { tutti: true })).rapportini.find(x => x.id === r.rapportino.id);
  assert.equal(visto.tariffa, 42, 'il prezzo della commessa, non quello che ha mandato');
  assert.equal(visto.totale, 84);
  // Un rapportino suo si firma e si manda. Dalla fase 3 (APPROVAZIONE = collaboratori) si manda dopo l'approvazione.
  await marco('caricaFile', { tipo: 'firma', idLocale: 'marco-nuovo', idFile: 'fm', mime: 'image/png', base64, firmatario: 'Paolo Rossi' });
  assert.match((await marco('stato', { ids: [r.rapportino.id], stato: 'INVIATO' })).errore, /aspetta l'approvazione/);
  assert.equal((await manuel('approva', { voci: [{ tipo: 'rapportino', id: r.rapportino.id }] })).ok, true);
  assert.equal((await marco('stato', { ids: [r.rapportino.id], stato: 'INVIATO' })).ok, true);
  const fatt = await marco('stato', { ids: [r.rapportino.id], stato: 'FATTURATO' });
  assert.equal(fatt.permesso, false, 'segnare fatturato e\' della fatturazione');
});

test('collaboratore: niente clienti o commesse nuovi, niente anagrafiche, niente amministrazione', async () => {
  const nuovo = await marco('salvaRapportino', { rapportino: { idLocale: 'marco-cliente', cliente: 'Cliente Inventato da Marco', oreLavoro: 1 } });
  assert.equal(nuovo.permesso, false);
  assert.equal((await manuel('anagrafiche')).clienti.some(c => c.nome === 'Cliente Inventato da Marco'), false);
  const azioni = [
    ['creaCliente', { nome: 'X' }], ['aggiornaCliente', { id: 'C001', campi: { email: 'x@x' } }], ['creaCommessa', { idCliente: 'C001', descrizione: 'X' }],
    ['aggiornaCommessa', { id: '26ST001', campi: { stato: 'CHIUSA' } }], ['salvaSoggetto', { soggetto: { nome: 'X' } }], ['salvaImpostazioni', { valori: { EURO_KM: 9 } }],
    ['utenti'], ['permessi'], ['registro'], ['accessi'], ['numerazioni'], ['copie'], ['cestino'], ['esporta', { cosa: 'registro' }],
    ['salvaPrestazione', { prestazione: { idCommessa: '26ST001', nome: 'X' } }], ['caricaFile', { tipo: 'documento', idCommessa: '26ST001', base64 }],
  ];
  for (const [azione, dati] of azioni) {
    const r = await marco(azione, dati);
    assert.equal(r.permesso, false, azione + ': ' + JSON.stringify(r));
  }
});

test('collaboratore: esporta solo i suoi rapportini, senza le colonne dei soldi', async () => {
  const r = await marco('esporta', { cosa: 'rapportini' });
  const csv = Buffer.from(r.base64, 'base64').toString('utf8');
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.equal(csv.includes('Totale'), false);
  assert.equal(csv.includes('Tariffa'), false);
  assert.equal(csv.includes('RAP/2026/0001'), false);
  assert.ok(csv.includes('RAP/2026/0005'));
});

// ------------------------------------------------------------------ lettura

test('lettura: vede tutto (soldi compresi) e non scrive niente', async () => {
  const r = await lettura('rapportini', { tutti: true });
  assert.ok(r.rapportini.length >= 6);
  assert.ok(r.rapportini.every(x => typeof x.totale === 'number'), 'il commercialista vede i totali');
  const prima = s.wisper.db.riga('SELECT COUNT(*) n FROM registro').n;
  const scritture = [
    ['salvaRapportino', { rapportino: { idLocale: 'lettura-1', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 } }],
    ['caricaFile', { tipo: 'spesa', id: 'RAP/2026/0001', base64 }], ['togliFile', { id: 'RAP/2026/0001', fileId: 'x' }],
    ['stato', { ids: ['RAP/2026/0003'], stato: 'ANNULLATO' }], ['creaCliente', { nome: 'X' }], ['aggiornaCliente', { id: 'C001', campi: {} }],
    ['creaCommessa', { idCliente: 'C001', descrizione: 'X' }], ['aggiornaCommessa', { id: '26ST001', campi: {} }], ['statoCommessa', { idCommessa: '26ST001', stato: 'CHIUSA' }],
    ['salvaImpostazioni', { valori: {} }], ['inviaEmail', { a: 'x@example.com' }], ['salvaUtente', { utente: { nome: 'X', email: 'x@x.it' } }],
    ['nuovaPassword', { idUtente: 3 }], ['revocaSessione', { id: 1 }], ['salvaPermessi', { permessi: {} }], ['salvaNumerazione', { tipo: 'commessa', formato: '{AA}X{NNN}' }],
    ['salvaSoggetto', { soggetto: { nome: 'X' } }], ['archiviaSoggetto', { id: 'C002' }], ['ripristinaSoggetto', { id: 'C002' }],
    ['salvaReferente', { referente: { idSoggetto: 'C001', nome: 'X' } }], ['togliReferente', { id: 1 }], ['salvaSede', { sede: { idSoggetto: 'C001', nome: 'X' } }],
    ['archiviaSede', { id: 1 }], ['salvaPrestazione', { prestazione: { idCommessa: '26ST001', nome: 'X' } }], ['togliPrestazione', { id: 1 }],
    ['ordinaPrestazioni', { idCommessa: '26ST001', ids: [] }], ['duplicaCommessa', { id: '26ST001' }], ['archiviaCommessa', { id: '26ST001' }],
    ['ripristinaCommessa', { id: '26ST001' }], ['ripristinaRapportino', { id: 'RAP/2026/0001' }], ['ripristinaFile', { id: 'x' }], ['copiaAdesso'],
    ['cestino'], ['registro'], ['utenti'],
  ];
  for (const [azione, dati] of scritture) {
    const x = await lettura(azione, dati);
    assert.equal(x.permesso, false, azione + ': ' + JSON.stringify(x));
  }
  assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM registro').n, prima, 'niente e\' cambiato');
});

// ------------------------------------------------------------------ amministrazione

test('amministrazione: lavora su clienti, commesse e rapportini, ma non cambia utenti, permessi e impostazioni', async () => {
  assert.equal((await laura('creaCliente', { nome: 'Cliente di Laura Srl' })).ok, true);
  assert.equal((await laura('aggiornaCommessa', { id: '26ST002', campi: { note: 'da Laura' } })).ok, true);
  assert.equal((await laura('utenti')).ok, true, 'li vede');
  assert.equal((await laura('permessi')).ok, true);
  assert.equal((await laura('registro')).ok, true);
  for (const [azione, dati] of [
    ['salvaPermessi', { permessi: { collaboratore: { costi: 1 } } }], ['salvaUtente', { utente: { nome: 'X', email: 'nuovo@esempio.it' } }],
    ['nuovaPassword', { idUtente: 3 }], ['salvaImpostazioni', { valori: { EURO_KM: 1 } }], ['salvaNumerazione', { tipo: 'commessa', formato: 'X{NNN}' }],
    ['copiaAdesso'], ['sessioni'], ['revocaSessione', { id: 1 }], ['caricaFile', { tipo: 'firmaTecnico', base64 }],
  ]) {
    const r = await laura(azione, dati);
    assert.equal(r.permesso, false, azione + ': ' + JSON.stringify(r));
  }
});

test('anche con amministrazione in scrittura: non si nomina un titolare e non si da\' piu\' di quello che si ha', async () => {
  assert.equal((await manuel('salvaPermessi', { permessi: { amministrazione: { amministrazione: 2 } } })).ok, true);
  const nominare = await laura('salvaUtente', { utente: { nome: 'Nuovo Capo', email: 'capo@esempio.it', ruolo: 'titolare' } });
  assert.equal(nominare.permesso, false);
  const darePiu = await laura('salvaPermessi', { permessi: { collaboratore: { riservati: 2 } } });
  assert.equal(darePiu.permesso, false);
  assert.match(darePiu.errore, /riservati/);
  const toccareTitolare = await laura('nuovaPassword', { idUtente: 1 });
  assert.equal(toccareTitolare.permesso, false);
  assert.equal((await laura('salvaPermessi', { permessi: { collaboratore: { mezzi: 2 } } })).ok, true, 'quello che ha, si');
  await manuel('salvaPermessi', { permessi: { amministrazione: { amministrazione: 1 }, collaboratore: { mezzi: 1 } } });
});

// ------------------------------------------------------------------ titolare e utenti

test('il titolare ha sempre tutto, e l\'ultimo titolare attivo non si toglie', async () => {
  assert.match((await manuel('salvaPermessi', { permessi: { titolare: { costi: 0 } } })).errore, /Il titolare ha sempre tutto/);
  assert.match((await manuel('salvaUtente', { utente: { id: 1, ruolo: 'amministrazione' } })).errore, /ultimo titolare/);
  assert.match((await manuel('salvaUtente', { utente: { id: 1, attivo: false } })).errore, /ultimo titolare/);
  const secondo = await manuel('salvaUtente', { utente: { nome: 'Secondo Titolare', email: 'secondo@esempio.it', ruolo: 'titolare' } });
  assert.equal(secondo.ok, true, secondo.errore);
  const giu = await manuel('salvaUtente', { utente: { id: secondo.utente.id, ruolo: 'lettura' } });
  assert.equal(giu.ok, true, 'con due titolari uno si puo\' cambiare');
  assert.match((await manuel('salvaUtente', { utente: { id: 1, ruolo: 'lettura' } })).errore, /ultimo titolare/);
});

test('utente nuovo: password iniziale una volta sola, mai nel registro; nuova password fa uscire i suoi dispositivi', async () => {
  const r = await manuel('salvaUtente', { utente: { nome: 'Giorgio Nuovo', email: 'giorgio@esempio.it' } });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.utente.ruolo, 'collaboratore', 'si parte dal ruolo piu\' basso che scrive');
  assert.match(r.passwordIniziale, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  const t = await s.accedi('giorgio@esempio.it', r.passwordIniziale);
  assert.ok(t);
  const elenco = await manuel('utenti');
  assert.equal(JSON.stringify(elenco).includes(r.passwordIniziale), false);
  const reg = await manuel('registro', { tabella: 'utenti', idRiga: String(r.utente.id) });
  assert.equal(JSON.stringify(reg).includes(r.passwordIniziale), false);
  assert.equal(JSON.stringify(reg).includes('scrypt'), false, 'neanche lo scrypt');
  const n = await manuel('nuovaPassword', { idUtente: r.utente.id });
  assert.notEqual(n.passwordIniziale, r.passwordIniziale);
  assert.deepEqual(await s.chiama(t, { azione: 'io' }), SCADUTO, 'il suo telefono esce');
  assert.equal((await s.chiama(null, { azione: 'accedi', email: 'giorgio@esempio.it', password: r.passwordIniziale })).ok, false);
  assert.ok(await s.accedi('giorgio@esempio.it', n.passwordIniziale));
  assert.equal((await manuel('salvaUtente', { utente: { nome: 'Doppio', email: 'GIORGIO@esempio.it' } })).errore, 'Email: c\'è già un utente con questa email');
  assert.match((await manuel('salvaUtente', { utente: { nome: 'X', email: 'senza-chiocciola' } })).errore, /Email/);
});

test('disattivato: i suoi dispositivi escono e non rientra', async () => {
  const r = await manuel('salvaUtente', { utente: { nome: 'Da Spegnere', email: 'spegnere@esempio.it', password: 'una-password-lunga' } });
  const t = await s.accedi('spegnere@esempio.it', 'una-password-lunga');
  await manuel('salvaUtente', { utente: { id: r.utente.id, attivo: false } });
  assert.deepEqual(await s.chiama(t, { azione: 'io' }), SCADUTO);
  assert.equal((await s.chiama(null, { azione: 'accedi', email: 'spegnere@esempio.it', password: 'una-password-lunga' })).errore,
    'Il tuo accesso è stato disattivato: chiedi al titolare');
});

test('dispositivi collegati: si vedono e si scollegano', async () => {
  const t = await s.accedi('marco@esempio.it');
  const elenco = await manuel('sessioni', { idUtente: 3 });
  const sua = elenco.sessioni.find(x => x.dispNome === 'prove automatiche');
  assert.ok(sua);
  assert.equal(JSON.stringify(elenco).includes(t), false, 'il token non si vede mai');
  const ultima = elenco.sessioni[0];
  assert.equal((await manuel('revocaSessione', { id: ultima.id })).ok, true);
  assert.deepEqual(await s.chiama(t, { azione: 'io' }), SCADUTO);
});

test('cambiare la propria password: serve quella vecchia, gli altri dispositivi escono', async () => {
  const altro = await s.accedi('laura@esempio.it');
  const io = await s.come('laura@esempio.it');
  assert.equal((await io('cambiaPassword', { vecchia: 'no', nuova: 'nuovissima-1' })).errore, 'La password attuale è sbagliata');
  assert.equal((await io('cambiaPassword', { vecchia: 'prova', nuova: 'corta' })).errore, 'La password deve avere almeno 8 caratteri');
  assert.equal((await io('cambiaPassword', { vecchia: 'prova', nuova: 'nuovissima-1' })).ok, true);
  assert.equal((await io('io')).ok, true, 'questo resta dentro');
  assert.deepEqual(await s.chiama(altro, { azione: 'io' }), SCADUTO);
  assert.equal((await io('cambiaPassword', { vecchia: 'nuovissima-1', nuova: 'prova-prova' })).ok, true);
});

test('un permesso cambiato vale subito, anche per chi e\' gia\' dentro', async () => {
  const marco2 = await s.come('marco@esempio.it');
  assert.equal('totale' in (await marco2('rapportini')).rapportini[0], false);
  await manuel('salvaPermessi', { permessi: { collaboratore: { costi: 1 } } });
  assert.equal(typeof (await marco2('rapportini')).rapportini[0].totale, 'number');
  await manuel('salvaPermessi', { permessi: { collaboratore: { costi: 0 } } });
  assert.equal('totale' in (await marco2('rapportini')).rapportini[0], false);
});
