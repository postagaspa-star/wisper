'use strict';
// La casa del design Fai: scheda gialla, azioni, Da sistemare, In agenda, voci del menu (docs/gestionale/fai.md).
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../ui/regole-casa.js');
const R = require('../ui/regole.js');
const casi = require('./casi-casa.json');

for (const k of casi.schedaImportante) {
  test('scheda gialla: ' + k.nome, () => {
    const s = C.schedaImportante(k.voce);
    assert.equal(s.titolo, k.atteso.titolo);
    assert.equal(s.dettaglio, k.atteso.dettaglio);
    assert.equal(s.pillola, k.atteso.pillola);
    assert.equal(s.importo, k.atteso.importo);
    assert.equal(s.nota, k.atteso.nota);
    assert.equal(!!s.idFattura, k.atteso.promemoria);
  });
}

test('le azioni: sei, nell\'ordine del prototipo, e spariscono senza permesso', () => {
  assert.deepEqual(C.AZIONI.map(a => a.testo), ['Scrivi un rapportino', 'Aggiungi una spesa', 'Nuova commessa', 'Nuovo cliente', 'Prepara un preventivo', 'Invia un rapportino']);
  assert.deepEqual(C.AZIONI.map(a => a.tasto), ['R', 'S', 'N', 'C', 'P', 'I']);
  assert.deepEqual(C.azioniDi(m => m === 'rapportini').map(a => a.chiave), ['rapportino', 'invia']);
  assert.deepEqual(C.azioniDi(() => false), []);
});

test('Da sistemare: la prima va sulla scheda gialla, poi urgenti, settimana, da pianificare, col tetto', () => {
  const v = n => ({ titolo: n });
  const d = { urgenti: [v('a'), v('b')], settimana: [v('c')], pianificare: [v('d'), v('e')], quante: { urgenti: 2, settimana: 1, pianificare: 9 } };
  const s = C.daSistemare(d, 3);
  assert.equal(s.prima.titolo, 'a');
  assert.deepEqual(s.righe.map(x => x.titolo), ['b', 'c', 'd']);
  assert.equal(s.altre, 8, 'le altre le conta il server (quante)');
  assert.deepEqual(C.daSistemare({ urgenti: [], settimana: [v('x')], pianificare: [] }, 3).prima, v('x'), 'senza urgenti, la prima della settimana');
  assert.equal(C.daSistemare({}, 3).prima, null);
});

test('In agenda: Oggi e Domani sempre, poi i prossimi, in ordine', () => {
  const a = { oggi: [], settimana: [{ id: 3, titolo: 'Sopralluogo', giorno: '2026-11-12', inizio: '2026-11-12 09:00:00', luogo: 'Thiene' }] };
  const r = C.agenda(a, '2026-11-09', 4);
  assert.deepEqual(r.map(x => x.etichetta), ['Oggi', 'Domani', 'Giovedì 12']);
  assert.equal(r[0].vuota, true);
  assert.equal(r[0].ora, '9', 'il numero del giorno, nelle righe vuote');
  assert.equal(r[2].ora, '9:00');
  assert.equal(r[2].sotto, 'Thiene');
  const piene = C.agenda({ oggi: [{ id: 1, titolo: 'A', giorno: '2026-11-09', inizio: '2026-11-09 14:30:00' }, { id: 2, titolo: 'B', giorno: '2026-11-09', tuttoIlGiorno: true }], settimana: [] }, '2026-11-09', 2);
  assert.deepEqual(piene.map(x => x.titolo), ['A', 'B'], 'il tetto');
  assert.equal(piene[0].oggi, true);
  assert.equal(piene[1].ora, '', 'tutto il giorno: niente ora');
});

test('il menu: ogni voce di regole.js ha il nome corto, il colore e l\'icona', () => {
  for (const v of R.VOCI_MENU) {
    const f = C.VOCI_FAI[v.modulo];
    assert.ok(f && f.breve && f.f && f.t && f.d, 'manca ' + v.modulo);
  }
  assert.equal(C.VOCI_FAI.dashboard.breve, 'Casa');
  assert.equal(C.VOCI_FAI.amministrazione.breve, 'Impostazioni');
  assert.equal(C.VOCI_FAI.amministrazione.staccata, true);
});
