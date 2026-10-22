// Fase 5: la copia fuori casa un file alla volta (fase5.md §5.9). Un file oltre COPIA_FUORI_MAX_MB resta solo sul
// NAS (fuori_no = 'troppo grande', non si riprova, la Dashboard lo dice), un file che non riesce non ferma gli altri e
// si riprova la notte dopo, quelli arrivati prendono fuori_il e non si rimandano; l'esito "ok · 2 file · 1 restano
// per domani"; i collegamenti non si copiano (non sono file); i caricati non legati nemmeno.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cartellaNuova } = require('./aiuto');
const { Wisper, SISTEMA } = require('../src/wisper');

/** Un postino finto in memoria: rompe i file il cui nome contiene una parola. */
function postino() {
  const p = { copiati: [], rompi: '', richieste: 0 };
  Object.assign(p, {
    configurato: () => true,
    descrizione: () => 'finto (in memoria)',
    async copia({ cartella, nome }) {
      p.richieste++;
      if (p.rompi && nome.includes(p.rompi)) throw new Error('Drive non risponde (finto)');
      p.copiati.push(cartella + '/' + nome);
      return { ok: true };
    },
    async foglio() { return { ok: true }; },
    async email() { return { ok: true }; },
  });
  return p;
}

test('copia fuori casa: uno alla volta, il troppo grande resta sul NAS, quello che non riesce si riprova la notte dopo', async () => {
  const dati = cartellaNuova('fuori');
  const p = postino();
  const w = new Wisper({ dati, memoria: true, postino: p });
  try {
    const file = nome => w.come(SISTEMA, () => w.db.transazione(() => w.salvaFile({ dati: Buffer.from('contenuto di ' + nome), nome, mime: 'application/pdf', tipo: 'documento' })));
    const a = file('Primo.pdf');
    const b = file('Rotto.pdf');
    const c = file('Grande.pdf');
    const d = file('Secondo.pdf');
    // Il grande: si finge che pesi 30 MB (oltre i 25 di COPIA_FUORI_MAX_MB).
    w.db.esegui('UPDATE file SET byte = ? WHERE id = ?', 30 * 1024 * 1024, c.id);
    // Un caricato mai legato non va fuori casa.
    w.come(SISTEMA, () => w.db.transazione(() => w.salvaFile({ dati: Buffer.from('caricato'), nome: 'Caricato.pdf', mime: 'application/pdf', tipo: 'caricato' })));
    p.rompi = 'Rotto';
    const n1 = await w.copiaFileNuovi();
    assert.deepEqual([n1.copiati, n1.falliti, n1.troppoGrandi, n1.restano], [2, 1, 1, 1]);
    assert.match(n1.ultimoErrore, /Drive non risponde/);
    const riga = id => Object.assign({}, w.db.riga('SELECT fuori_il, fuori_no FROM file WHERE id = ?', id));
    assert.ok(riga(a.id).fuori_il && riga(d.id).fuori_il);
    assert.deepEqual(riga(b.id), { fuori_il: '', fuori_no: '' }, 'si riprova');
    assert.deepEqual(riga(c.id), { fuori_il: '', fuori_no: 'troppo grande' });
    assert.ok(w.db.riga("SELECT * FROM registro WHERE tabella = 'file' AND id_riga = ? AND nota LIKE 'troppo grande%'", c.id), 'nel registro');
    // La notte dopo: il rotto passa, il grande non si riprova, i copiati non si rimandano.
    p.rompi = '';
    const prima = p.richieste;
    const n2 = await w.copiaFileNuovi();
    assert.deepEqual([n2.copiati, n2.falliti, n2.troppoGrandi, n2.restano], [1, 0, 0, 0]);
    assert.equal(p.richieste - prima, 1, 'una richiesta sola: il file che mancava');
    // L'esito nella copia di sicurezza.
    file('Terzo.pdf');
    const e = file('Rotto anche questo.pdf');
    p.rompi = 'Rotto anche';
    const copia = await w.copiaDiSicurezza('a mano');
    assert.equal(copia.locale, 'ok');
    assert.equal(copia.fuori, 'ok · 1 file · 1 restano per domani');
    assert.ok(w.fileDaCopiareFuori().some(f => f.id === e.id));
    // Lo spazio sul NAS lo dice: il grande e' solo sul NAS.
    const sp = w.come(SISTEMA, () => w.leggiSpazio());
    assert.deepEqual(sp.fuori.troppoGrandi.map(f => f.nome), ['Grande.pdf']);
    assert.equal(sp.fuori.daCopiare, 1);
    // Il tempo massimo: con 0 minuti si ferma subito.
    p.rompi = '';
    const fermo = await w.copiaFileNuovi({ minuti: -1 });
    assert.deepEqual([fermo.copiati, fermo.restano], [0, 1]);
  } finally {
    w.chiudi();
  }
});

test('copia fuori casa: un file che non c\'e\' sul disco prende fuori_no e non blocca gli altri', async () => {
  const dati = cartellaNuova('fuori-manca');
  const p = postino();
  const w = new Wisper({ dati, memoria: true, postino: p });
  try {
    const f = w.come(SISTEMA, () => w.db.transazione(() => w.salvaFile({ dati: Buffer.from('x'), nome: 'Sparito.pdf', mime: 'application/pdf', tipo: 'documento' })));
    fs.rmSync(path.join(dati, 'file', f.id));
    const g = w.come(SISTEMA, () => w.db.transazione(() => w.salvaFile({ dati: Buffer.from('y'), nome: 'Presente.pdf', mime: 'application/pdf', tipo: 'documento' })));
    const n = await w.copiaFileNuovi();
    assert.deepEqual([n.copiati, n.restano], [1, 0]);
    assert.equal(w.db.riga('SELECT fuori_no FROM file WHERE id = ?', f.id).fuori_no, 'manca sul disco');
    assert.ok(w.db.riga('SELECT fuori_il FROM file WHERE id = ?', g.id).fuori_il);
  } finally {
    w.chiudi();
  }
});
