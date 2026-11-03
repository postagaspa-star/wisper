// Ripartire da zero (03/11/2026, strumenti/svuota.js): sui dati d'esempio scritti su disco, senza --si non tocca niente;
// con --si via tutto il lavoro (registro compreso, file su disco compresi), restano account, dispositivi, sessioni,
// impostazioni e numerazioni; i trigger che proteggono registro e cronologia dei ticket tornano al loro posto.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cartellaNuova, giornoDeiPrototipi } = require('./aiuto');
const { Wisper } = require('../src/wisper');
const { semina } = require('../src/prova');
const { svuota } = require('../strumenti/svuota');

giornoDeiPrototipi();

test('svuota: prima conta e basta; poi toglie il lavoro e lascia chi entra e come e\' configurato', () => {
  const dati = cartellaNuova('svuota');
  let w = new Wisper({ dati });
  semina(w);
  w.db.esegui("INSERT INTO dispositivi (id, nome, app, primo, ultimo) VALUES ('tel-1', 'Telefono di prova', 'android', '2026-11-03', '2026-11-03')");
  fs.writeFileSync(path.join(dati, 'file', 'prova.bin'), 'x');
  const prima = {};
  for (const t of ['utenti', 'dispositivi', 'sessioni', 'impostazioni', 'numerazioni', 'permessi', 'commesse', 'rapportini', 'soggetti', 'registro', 'ticket_eventi']) {
    prima[t] = w.db.riga('SELECT COUNT(*) n FROM ' + t).n;
  }
  const numerazioni = w.db.righe('SELECT * FROM numerazioni ORDER BY tipo');
  const impostazioni = w.db.righe('SELECT chiave, valore FROM impostazioni ORDER BY chiave');
  const trigger = w.db.righe("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
  w.chiudi();
  assert.ok(prima.commesse > 0 && prima.rapportini > 0 && prima.registro > 0 && prima.ticket_eventi > 0, 'i dati d\'esempio ci sono');

  const conta = svuota(dati);
  assert.equal(conta.fatto, false);
  assert.ok(conta.conteggi.some(c => c.tabella === 'rapportini' && c.righe === prima.rapportini));
  w = new Wisper({ dati });
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM rapportini').n, prima.rapportini, 'senza --si niente toccato');
  w.chiudi();

  const r = svuota(dati, { si: true });
  assert.equal(r.fatto, true);
  w = new Wisper({ dati });
  try {
    for (const t of ['commesse', 'rapportini', 'soggetti', 'ticket_eventi', 'progetti', 'fatture', 'preventivi', 'file', 'persone']) {
      assert.equal(w.db.riga('SELECT COUNT(*) n FROM ' + t).n, 0, t + ' vuota');
    }
    // All'avvio il server rimette solo l'auto delle impostazioni (AUTO, EURO_KM): e' una regola di sempre, non un dato vecchio.
    assert.deepEqual(w.db.righe('SELECT tabella FROM registro').map(x => x.tabella), ['veicoli']);
    assert.equal(w.db.riga('SELECT COUNT(*) n FROM veicoli').n, 1);
    for (const t of ['utenti', 'dispositivi', 'sessioni', 'permessi']) assert.equal(w.db.riga('SELECT COUNT(*) n FROM ' + t).n, prima[t], t + ' resta');
    assert.deepEqual(w.db.righe('SELECT * FROM numerazioni ORDER BY tipo'), numerazioni, 'le numerazioni restano: il prossimo codice continua');
    assert.deepEqual(w.db.righe('SELECT chiave, valore FROM impostazioni ORDER BY chiave'), impostazioni, 'le impostazioni restano');
    assert.deepEqual(w.db.righe("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name"), trigger, 'i trigger tornano uguali');
    assert.throws(() => w.db.esegui('DELETE FROM registro'), /non si cancella/);
    assert.deepEqual(fs.readdirSync(path.join(dati, 'file')), [], 'i file su disco tolti');
    assert.deepEqual(w.db.righe('PRAGMA foreign_key_check'), []);
    // Il server riparte e lavora: il titolare entra, la commessa nuova continua la numerazione.
    const titolare = w.titolare();
    assert.ok(titolare, 'il titolare c\'e\' ancora');
    const nuova = w.come({ utente: titolare, permessi: w.permessiDi('titolare') }, () => w.db.transazione(() => w.creaCliente({ nome: 'Cliente nuovo' })));
    assert.ok(nuova.id);
  } finally {
    w.chiudi();
  }
});
