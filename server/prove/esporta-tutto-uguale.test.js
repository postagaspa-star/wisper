// Fase 8 (fase8.md §7.1, §11.5): Esporta tutto piu' veloce, con lo stesso contenuto.
// Le schede dei ticket (e delle attivita', dei documenti, delle ore e delle spese) dentro Esporta tutto rileggono le
// mappe dei nomi una volta sola (ricordata, dentro conLettureRicordate) invece che per ogni riga. Su un database piccolo
// di dati finti (un anno, dati-finti.js) ogni CSV dello ZIP deve essere uguale, byte per byte, all'esportazione singola,
// che passa ancora dal codice di prima (le mappe rifatte per ogni riga); e ogni scheda di ticket uguale con e senza memoria.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { serverDiProva, cartellaNuova } = require('./aiuto');
const { leggiZip } = require('../src/zip');
const { ELENCHI_ESPORTA_TUTTO } = require('../src/azioni/importa');

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300)); return r; };

let s;
let manuel;
test.before(async () => {
  const dati = cartellaNuova('carico-piccolo');
  const g = spawnSync(process.execPath, [path.join(__dirname, '..', 'strumenti', 'dati-finti.js'), '--anni', '1', '--persone', '3', '--dati', dati], { encoding: 'utf8' });
  assert.equal(g.status, 0, g.stderr);
  s = await serverDiProva({ dati, prova: false });
  manuel = await s.come('manuel@esempio.it', 'prova');
});
test.after(() => s && s.ferma());

test('Esporta tutto (con le mappe ricordate) uguale, CSV per CSV, alle esportazioni singole (il codice di prima) su un anno di dati finti', async () => {
  const e = ok(await manuel('esportaTutto'));
  await s.wisper.attendiEsportazioni();
  const x = ok(await manuel('esportazioni')).esportazioni.find(y => y.id === e.esportazione.id);
  assert.equal(x.stato, 'pronta', x.errore);
  const r = await fetch(s.url + '/esportazione/' + x.id, { headers: { Authorization: 'Bearer ' + manuel.token } });
  const z = leggiZip(Buffer.from(await r.arrayBuffer()));
  let confrontati = 0;
  for (const [nome, cosa, filtri] of ELENCHI_ESPORTA_TUTTO.filter(y => y[1] !== 'registro')) {
    const singola = await manuel('esporta', Object.assign({ cosa }, filtri));
    if (!singola.ok) continue;
    assert.ok(z.nomi.includes(nome + '.csv'), nome);
    assert.ok(Buffer.from(singola.base64, 'base64').equals(z.leggi(nome + '.csv')), nome + '.csv diverso dall\'esportazione singola');
    confrontati++;
  }
  assert.ok(confrontati >= 25, 'confrontati ' + confrontati);
  assert.ok(x.righe.ticket >= 200 && x.righe.attivita >= 1000 && x.righe.documenti >= 300, JSON.stringify(x.righe));
});

test('la scheda di ogni ticket, di ogni attivita\' e di ogni documento e\' uguale con e senza la memoria delle letture', () => {
  const w = s.wisper;
  const chi = { utente: w.titolare(), permessi: w.permessiDi('titolare'), app: 'prova' };
  const ticket = w.db.righe('SELECT * FROM ticket ORDER BY id');
  const senza = w.come(chi, () => ticket.map(t => w.ticketCompleto(t)));
  const con = w.come(chi, () => w.conLettureRicordate(() => ticket.map(t => w.ticketCompleto(t))));
  assert.equal(con.length, ticket.length);
  for (let i = 0; i < ticket.length; i++) assert.deepEqual(con[i], senza[i], 'ticket ' + ticket[i].id);
  const att = w.come(chi, () => w.leggiAttivita({ stato: 'tutte' }));
  assert.deepEqual(w.come(chi, () => w.conLettureRicordate(() => w.leggiAttivita({ stato: 'tutte' }))), att);
  const doc = w.come(chi, () => w.leggiDocumenti({ archivio: true, tutte: true }));
  assert.deepEqual(w.come(chi, () => w.conLettureRicordate(() => w.leggiDocumenti({ archivio: true, tutte: true }))), doc);
  // Una scrittura in mezzo svuota la memoria: il nome nuovo si vede subito.
  const nuovo = w.come(chi, () => w.conLettureRicordate(() => {
    const prima = w.nomiFase3().clienti[ticket[0].cliente_id];
    w.db.esegui('UPDATE soggetti SET nome = ? WHERE id = ?', 'Nome cambiato in mezzo', ticket[0].cliente_id);
    const dopo = w.nomiFase3().clienti[ticket[0].cliente_id];
    w.db.esegui('UPDATE soggetti SET nome = ? WHERE id = ?', prima, ticket[0].cliente_id);
    return dopo;
  }));
  assert.equal(nuovo, 'Nome cambiato in mezzo');
  assert.equal(w.memoLetture, null, 'fuori, niente memoria');
});
