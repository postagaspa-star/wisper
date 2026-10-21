// "node --test server/prove/" con una cartella: Node 24 la apre come un modulo e
// legge questo file. Qui si fanno girare tutte le prove *.test.js della
// cartella, ognuna nel suo processo (come "node --test server/prove/*.test.js"),
// e se una sola non passa non passa neanche questa.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const file = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(__dirname, f));

test('tutte le prove del server (' + file.length + ' file)', () => {
  const env = Object.assign({}, process.env);
  // Senza questa, il figlio crederebbe di essere a sua volta un pezzo del test runner.
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...file], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write((r.stdout || '').split('\n').filter(l => !/^\s*(\[script\]|\[posta\]|Seminati )/.test(l)).join('\n'));
  if (r.stderr) process.stderr.write(r.stderr);
  assert.equal(r.status, 0, 'qualche prova non passa: guarda sopra');
});
