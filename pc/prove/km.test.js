// I km da proporre in un lavoro (12/11/2026, docs/gestionale/km.md): i casi di casi-km.json, gli stessi del telefono
// (rapportino/Km.kt, KmTest).
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../ui/regole-km.js');

const CASI = JSON.parse(fs.readFileSync(path.join(__dirname, 'casi-km.json'), 'utf8')).casi;

test('casi-km.json: le proposte dei km, uguali a quelle del telefono', () => {
  assert.ok(CASI.length >= 10);
  for (const c of CASI) assert.deepEqual(K.proposte(c.x), c.atteso, c.nome);
});
