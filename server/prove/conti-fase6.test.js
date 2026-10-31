// Fase 6: i conti condivisi su persone, mezzi, strumenti e incarichi (casi-persone.json, casi-mezzi.json,
// casi-incarichi.json) e il costo orario di una riga che nasce (casi-ore-spese.json, "costoOrario"). Telefono e
// computer rifanno gli stessi casi: qui il server, che fa fede.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/conti');
const PERSONE = require('./casi-persone.json');
const MEZZI = require('./casi-mezzi.json');
const INCARICHI = require('./casi-incarichi.json');
const ORE_SPESE = require('./casi-ore-spese.json');

test('casi-persone.json: festivi (Pasquetta calcolata, 4 ottobre dal 2026, il patrono)', () => {
  for (const c of PERSONE.festivi) assert.deepEqual(C.festivi(c.anno, c.patrono), c.atteso, c.nome);
});

test('casi-persone.json: giorni lavorativi (anche a cavallo dell\'anno e coi giorni del part time)', () => {
  for (const c of PERSONE.giorniLavorativi) {
    assert.equal(C.giorniLavorativi(c.dal, c.al, c.giorni, C.festiviTra(c.dal, c.al, c.patrono)), c.atteso, c.nome);
  }
  assert.ok(PERSONE.giorniLavorativi.length >= 4);
});

test('casi-persone.json: giorni e ore di un\'assenza; giorno per giorno la somma e\' il totale', () => {
  for (const c of PERSONE.oreAssenza) {
    const fest = C.festiviTra(c.assenza.dal, c.assenza.al || c.assenza.dal, '');
    assert.deepEqual(C.oreAssenza(c.assenza, c.persona, fest), c.atteso, c.nome);
    const giorni = C.oreAssenzaPerGiorno(c.assenza, c.persona, fest);
    assert.equal(Math.round(giorni.reduce((t, g) => t + g.ore, 0) * 100) / 100, c.atteso.ore, c.nome + ' (giorno per giorno)');
  }
  // Le sanitarie: i giorni di calendario servono al consulente, le ore sono quelle lavorative.
  assert.deepEqual(C.SANITARIE, ['malattia', 'infortunio', 'congedo', 'legge104']);
});

test('casi-persone.json: il saldo di ferie e permessi dal cedolino', () => {
  for (const c of PERSONE.saldoAssenze) {
    const r = C.saldoAssenze({ annue: c.annue, saldi: c.saldi, assenze: c.assenze, oggi: c.oggi, entrata: c.entrata, uscita: c.uscita });
    if (!c.atteso.tenuto) assert.deepEqual(r, { tenuto: false }, c.nome);
    else assert.deepEqual(r, c.atteso, c.nome);
  }
});

test('casi-persone.json: il costo orario proposto dal costo dell\'anno', () => {
  for (const c of PERSONE.costoOrarioDaAnno) assert.equal(C.costoOrarioDaAnno(c.costoAnno, c.oreAnno), c.atteso, c.costoAnno + ' / ' + c.oreAnno);
});

test('casi-ore-spese.json "costoOrario": la persona alla data del lavoro, poi la regola di oggi; l\'esterno 0', () => {
  assert.ok(ORE_SPESE.costoOrario.length >= 8);
  for (const c of ORE_SPESE.costoOrario) {
    assert.equal(C.costoOrarioDelLavoro({ esterno: c.esterno, costiPersona: c.costiPersona, data: c.data, cliente: c.cliente, commessa: c.commessa, impostazioni: c.impostazioni }), c.atteso, c.nome);
  }
  // Il budget e il costo previsto della commessa non cambiano: costoOrarioDi resta cliente -> commessa -> impostazioni.
  assert.equal(C.costoOrarioDi({ costoFisso: 18 }, { costoOrario: 25 }, { COSTO_ORARIO: 22 }), 18);
  assert.equal(C.costoOrarioDi({}, {}, { COSTO_ORARIO: 22 }), 22);
});

test('casi-mezzi.json: la revisione proposta, i km al tagliando, lo stato della taratura con la parola', () => {
  for (const c of MEZZI.scadenzaRevisione) assert.equal(C.scadenzaRevisione(c.immatricolazione, c.ultimaRevisione), c.atteso, c.nome);
  for (const c of MEZZI.kmAlTagliando) assert.equal(C.kmAlTagliando(c), c.atteso, c.nome);
  for (const c of MEZZI.statoTaratura) assert.deepEqual(C.statoTaratura(c.x, c.oggi, c.preavviso), c.atteso, c.nome);
});

test('casi-incarichi.json: pattuito, maturato, fatturato, costo, da fatturare, da pagare', () => {
  for (const c of INCARICHI.incarichi) {
    const r = C.contiIncarico(c);
    for (const k of Object.keys(c.atteso)) assert.equal(r[k], c.atteso[k], c.nome + ' · ' + k);
    assert.deepEqual(Object.keys(r).sort(), ['costo', 'daFatturare', 'daPagare', 'fatturato', 'maturato', 'pattuito']);
  }
});
