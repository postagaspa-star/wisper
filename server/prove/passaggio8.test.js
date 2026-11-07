// Fase 8 (fase8.md §10.2, §10.7, §16): il passaggio dei dati e il ritorno B, solo col finto Google.
//  - importa.js --confronta: zero differenze dopo l'importazione; un rapportino aggiunto al foglio dopo = una differenza.
//  - Ritorno B: il server (dati di esempio delle fasi 1-8) col ponte acceso riscrive il foglio finto con "Fai una copia
//    adesso"; l'export del foglio confrontato col database dice zero differenze; tolto PONTE_PORTA, lo script del foglio
//    (Code.gs, quello che parla con la 0.4.0) ritrova rapportini, clienti e commesse del server.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { serverDiProva, cartellaNuova, SEGRETO, giornoDeiPrototipi } = require('./aiuto');
const { scriviXlsx } = require('../strumenti/xlsx');
const { importa, confronta } = require('../strumenti/importa');

process.env.WISPER_POSTA_FINTA = cartellaNuova('posta');
const finto = require('../../apps-script/prove/finto-google.js');
finto.proprieta.set('SEGRETO_SERVER', SEGRETO);

giornoDeiPrototipi();

const IMPORTA = path.join(__dirname, '..', 'strumenti', 'importa.js');
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

const scrivi = (azione, dati) => {
  const r = JSON.parse(finto.contesto.doPost({ postData: { contents: JSON.stringify(Object.assign({ codice: 'prova', azione }, dati)) } }).testo);
  if (!r.ok) throw new Error(azione + ': ' + r.errore);
  return r;
};
const delloScript = p => JSON.parse(finto.contesto.doGet({ parameter: Object.assign({ codice: 'prova' }, p) }).testo);

/** Le schede del finto Google in un .xlsx, come File > Scarica > Microsoft Excel. */
function esporta(cartella, nome) {
  const schede = Array.from(finto.fogli.values()).map(f => ({ nome: f.getName(), righe: f.celle }));
  const p = path.join(cartella, nome || 'foglio.xlsx');
  fs.writeFileSync(p, scriviXlsx(schede));
  return p;
}

test('importa.js --confronta: zero differenze dopo l\'importazione; un rapportino aggiunto al foglio dopo e\' una differenza', () => {
  const c = scrivi('creaCliente', { nome: 'Confronto Impianti Srl', partitaIva: '01234567897' }).cliente;
  scrivi('salvaRapportino', { rapportino: { idLocale: 'conf-1', data: '2026-10-20', idCliente: c.id, tariffa: 40, oreLavoro: 3, km: 12, descrizione: 'Prima del cambio' } });
  scrivi('salvaRapportino', { rapportino: { idLocale: 'conf-2', data: '2026-10-21', idCliente: 'C001', idCommessa: '26ST001', oreLavoro: 2, km: 0 } });
  const dati = cartellaNuova('confronto');
  const foglio = esporta(dati);
  const imp = importa({ foglio, dati });
  assert.equal(imp.ok, true, JSON.stringify(imp.errori));

  const r = confronta({ foglio, dati, anno: 2026 });
  assert.deepEqual([r.ok, r.differenze], [true, []]);
  assert.ok(r.conteggi.rapportini >= 2 && r.conteggi.clienti >= 1);
  assert.ok(fs.existsSync(r.confronto), 'confronto.html vicino al foglio');
  assert.match(fs.readFileSync(r.confronto, 'utf8'), /Zero differenze|nessuna differenza|Tutto uguale/i);

  // Un rapportino scritto sul foglio dopo l'esportazione: il confronto lo trova (solo nel foglio).
  const nuovo = scrivi('salvaRapportino', { rapportino: { idLocale: 'conf-3', data: '2026-10-22', idCliente: 'C001', oreLavoro: 1, km: 5 } }).rapportino;
  const dopo = esporta(dati, 'foglio-dopo.xlsx');
  const r2 = confronta({ foglio: dopo, dati, anno: 2026 });
  assert.equal(r2.ok, false);
  assert.equal(r2.differenze.length, 1, JSON.stringify(r2.differenze));
  assert.deepEqual([r2.differenze[0].scheda, r2.differenze[0].chiave, r2.differenze[0].cosa], ['Rapportini', nuovo.id, 'solo nel foglio']);

  // Dalla riga di comando: esce con 1 se qualcosa non torna, 0 se torna.
  const no = spawnSync(process.execPath, [IMPORTA, '--confronta', '--foglio', dopo, '--dati', dati], { encoding: 'utf8' });
  assert.equal(no.status, 1, no.stdout + no.stderr);
  assert.match(no.stdout + no.stderr, new RegExp(nuovo.id.replace(/\//g, '\\/')));
  const si = spawnSync(process.execPath, [IMPORTA, '--confronta', '--foglio', foglio, '--dati', dati, '--uscita', path.join(dati, 'altro.html')], { encoding: 'utf8' });
  assert.equal(si.status, 0, si.stdout + si.stderr);
  assert.ok(fs.existsSync(path.join(dati, 'altro.html')));
});

test('ritorno B: "Fai una copia adesso" riscrive il foglio finto, il confronto dice zero differenze, lo script senza ponte ritrova tutto', async () => {
  const google = finto.ascoltaHttp(0, { host: '127.0.0.1', parla: false });
  await new Promise(r => google.on('listening', r));
  const script = 'http://127.0.0.1:' + google.address().port + '/exec';
  const s = await serverDiProva({ env: { SEGRETO_SERVER: SEGRETO, WISPER_POSTINO_URL: script } });
  try {
    const manuel = await s.come('manuel@esempio.it');
    // Prima del cambio lo script non riscrive le schede (sono ancora i dati veri).
    const prima = ok(await manuel('copiaAdesso')).copia;
    assert.equal(prima.foglio, 'non ancora: si riscrive dopo il cambio');

    // Dopo il cambio (ponte acceso) il ritorno B, punto 1: la copia riscrive Rapportini, Clienti, Commesse, Impostazioni.
    finto.proprieta.set('PONTE_PORTA', 'si');
    const c = ok(await manuel('copiaAdesso')).copia;
    assert.equal(c.foglio, 'ok');

    // Punto 2: l'export del foglio contro il database del server, zero differenze.
    const cartella = cartellaNuova('ritorno-b');
    const foglio = esporta(cartella);
    const dati = path.join(cartella, 'dati');
    fs.mkdirSync(dati);
    s.wisper.db.copiaIn(path.join(dati, 'wisper.db'));
    const r = confronta({ foglio, dati, anno: 2026 });
    assert.deepEqual(r.differenze, []);
    assert.equal(r.ok, true);
    const db = s.wisper.db;
    assert.equal(r.conteggi.rapportini, db.riga('SELECT COUNT(*) n FROM rapportini').n);

    // Punto 3: si toglie PONTE_PORTA; lo script lavora di nuovo sul foglio, come per la 0.4.0 col codice.
    finto.proprieta.delete('PONTE_PORTA');
    const rap = delloScript({ azione: 'rapportini', tutti: '1' });
    assert.equal(rap.ok, true, rap.errore);
    const daDb = db.righe('SELECT id, totale FROM rapportini ORDER BY id');
    assert.deepEqual(rap.rapportini.map(x => x.id).sort(), daDb.map(x => x.id).sort(), 'gli stessi rapportini');
    const perId = new Map(rap.rapportini.map(x => [x.id, x]));
    for (const x of daDb) assert.equal(Math.round(Number(perId.get(x.id).totale) * 100), Math.round(Number(x.totale) * 100), x.id + ' al centesimo');
    const ana = delloScript({});
    assert.equal(ana.ok, true, ana.errore);
    assert.deepEqual(ana.clienti.map(x => x.id).sort(), db.righe('SELECT id FROM soggetti WHERE cliente = 1').map(x => x.id).sort(), 'gli stessi clienti');
    assert.deepEqual(ana.commesse.map(x => String(x.id).toUpperCase()).sort(), db.righe('SELECT id FROM commesse WHERE modello = 0').map(x => String(x.id).toUpperCase()).sort(), 'le stesse commesse');
    // E il telefono vecchio puo' scrivere un rapportino sul foglio (il server resta acceso e non lo vede: aspetta il cambio dopo).
    const nuovo = scrivi('salvaRapportino', { rapportino: { idLocale: 'ritorno-b-1', data: '2026-10-23', idCliente: ana.clienti[0].id, oreLavoro: 1, km: 0 } }).rapportino;
    assert.ok(nuovo.id);
    assert.equal(db.riga('SELECT id FROM rapportini WHERE id = ?', nuovo.id), null);
  } finally {
    finto.proprieta.delete('PONTE_PORTA');
    await s.ferma();
    await finto.chiudiHttp(google);
  }
});
