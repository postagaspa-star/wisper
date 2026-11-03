// Fase 8 (fase8.md §11.3 righe T01 e T02, §14.1): i permessi.
//  - T01: ogni azione del server dichiara chi la puo' usare (modulo e livello, un controllo, i moduli che vede,
//    pubblica o libera col perche'): la prova legge l'elenco dal codice e fallisce se una non lo dice.
//  - T02: per ognuno dei cinque ruoli e per ogni azione che il ruolo non puo' usare, "permesso: false" prima che il
//    server tocchi qualcosa (il registro non cambia); senza "costi" nessun campo dei soldi a nessuna profondita' nelle
//    risposte della fase 8; le regole "solo il titolare" anche per chi ha Amministrazione: Modifica.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const { AZIONI, AZIONI_ESTERNO } = require('../src/richieste');
const { CAMPI_COSTI } = require('../src/permessi');

giornoDeiPrototipi();

const RUOLI = ['titolare', 'amministrazione', 'collaboratore', 'lettura', 'esterno'];
const EMAIL = { titolare: 'manuel@esempio.it', amministrazione: 'laura@esempio.it', collaboratore: 'marco@esempio.it', lettura: 'lettura@esempio.it', esterno: 'luca@esempio.it' };
const NUOVE = ['integrazioni', 'integrazione', 'provaIntegrazione', 'salvaIntegrazione', 'esportaCalendario', 'feedCalendario', 'nuovoFeed', 'revocaFeed', 'letturaFile',
  'rileggiFile', 'esportaTutto', 'esportazioni', 'leggiImport', 'controllaImport', 'importaSoggetti', 'archiviaImportati', 'importazioni', 'salvaRiquadri', 'nascondiVoce',
  'mostraNascoste', 'impostazioniGenerali', 'funzioni', 'salvaFunzioni', 'notifichePreferenze', 'salvaNotifichePreferenze', 'provaAvvisi', 'sicurezza', 'scollegaTutti',
  'accendiCifratura', 'spegniCifratura', 'provaCopia', 'segnaRipristino', 'statoSistema', 'controlliFinali', 'segnaControllo', 'segnaCambio'];

let s;
const chi = {};
test.before(async () => {
  s = await serverDiProva();
  for (const r of RUOLI) chi[r] = await s.come(EMAIL[r]);
});
test.after(() => s.ferma());

test('T01: ogni azione dice chi la puo\' usare (modulo e livello, controllo, vede, pubblica o libera col perche\')', () => {
  const senza = [];
  for (const [nome, v] of Object.entries(AZIONI)) {
    assert.equal(typeof v.fn, 'function', nome + ' senza fn');
    const dichiarata = (typeof v.modulo === 'string' && v.modulo && [1, 2].includes(v.livello)) || typeof v.controllo === 'function'
      || (Array.isArray(v.vede) && v.vede.length > 0) || v.pubblica === true || (typeof v.libera === 'string' && v.libera.length > 5);
    if (!dichiarata) senza.push(nome);
  }
  assert.deepEqual(senza, [], 'azioni senza permessi dichiarati: ' + senza.join(', '));
  for (const n of NUOVE) assert.ok(AZIONI[n], 'manca l\'azione ' + n);
  assert.ok(Object.keys(AZIONI).length > 300);
});

/** Il ruolo non puo' usare l'azione? Come esegui (richieste.js), dalle dichiarazioni e dalla tabella dei permessi. */
function vietata(ruolo, nome) {
  const v = AZIONI[nome];
  if (v.pubblica || v.libera) return false;
  if (ruolo === 'esterno' && !AZIONI_ESTERNO.has(nome)) return true;
  const p = s.wisper.permessiDi(ruolo);
  const serve = v.modulo ? [v.modulo, v.livello] : v.controllo ? v.controllo({}, { ruolo }) : null;
  if (serve && (p[serve[0]] || 0) < serve[1]) return true;
  if (v.vede && !v.vede.some(m => (p[m] || 0) >= 1)) return true;
  if (v.costi && !p.costi) return true;
  return false;
}

test('T02: per ogni ruolo e ogni azione che non puo\' usare, "permesso: false" prima di tutto; il registro non cambia', async () => {
  const prima = s.wisper.db.riga('SELECT COUNT(*) n, MAX(id) m FROM registro');
  let provate = 0;
  const sbagliate = [];
  for (const ruolo of RUOLI) {
    for (const nome of Object.keys(AZIONI)) {
      if (!vietata(ruolo, nome)) continue;
      const r = await chi[ruolo](nome, {});
      provate++;
      if (!(r.ok === false && r.permesso === false)) sbagliate.push(ruolo + ' ' + nome + ': ' + JSON.stringify(r).slice(0, 120));
    }
  }
  assert.deepEqual(sbagliate, []);
  assert.ok(provate > 500, 'provate ' + provate);
  const dopo = s.wisper.db.riga('SELECT COUNT(*) n, MAX(id) m FROM registro');
  assert.deepEqual([dopo.n, dopo.m], [prima.n, prima.m], 'nessuna riga nuova nel registro');
  // Le regole della tabella (§14.1) per le azioni nuove.
  const atteso = {
    collaboratore: { integrazioni: false, esportaCalendario: true, nuovoFeed: true, letturaFile: true, sicurezza: false, impostazioniGenerali: false, salvaRiquadri: true, notifichePreferenze: true, leggiImport: false },
    esterno: { integrazioni: false, esportaCalendario: true, feedCalendario: true, nuovoFeed: true, nascondiVoce: true, notifichePreferenze: true, letturaFile: false, controlliFinali: false },
    lettura: { integrazioni: true, provaIntegrazione: false, sicurezza: false, segnaControllo: false, esportazioni: false, leggiImport: false, letturaFile: true },
    amministrazione: { integrazioni: true, salvaIntegrazione: true, impostazioniGenerali: true, controlliFinali: true, provaCopia: false, leggiImport: true },
  };
  for (const [ruolo, azioni] of Object.entries(atteso)) {
    for (const [nome, puo] of Object.entries(azioni)) assert.equal(!vietata(ruolo, nome), puo, ruolo + ' ' + nome);
  }
  // Integrazioni 2 basta per le impostazioni di un collegamento; quelle che toccano internet vogliono anche amministrazione 2.
  const internet = await chi.amministrazione('salvaIntegrazione', { chiave: 'calendario', impostazioni: { CALENDARIO_PUBBLICO: true } });
  assert.deepEqual([internet.ok, internet.permesso, internet.errore], [false, false, 'Le impostazioni che toccano internet le cambia chi ha Amministrazione: Modifica']);
});

test('T02: "solo il titolare" anche per chi ha Amministrazione: Modifica (il ruolo di Andrea)', async () => {
  const r = await chi.titolare('salvaPermessi', { permessi: { amministrazione: { amministrazione: 2 } } });
  assert.equal(r.ok, true, JSON.stringify(r));
  try {
    const laura = chi.amministrazione;
    for (const [nome, d] of [['salvaFunzioni', { modulo: 'mezzi', accesa: false }], ['scollegaTutti', { password: 'prova' }], ['accendiCifratura', {}],
      ['spegniCifratura', { conferma: true }], ['segnaCambio', { stato: 'prova' }], ['esportaTutto', {}]]) {
      const x = await laura(nome, d);
      assert.deepEqual([x.ok, x.permesso], [false, false], nome + ': ' + JSON.stringify(x));
    }
    assert.equal((await laura('esportazioni', {})).permesso, false, 'anche l\'elenco delle esportazioni');
    // Quello che amministrazione 2 puo' fare.
    assert.equal((await laura('statoSistema', {})).ok, true);
    assert.equal((await laura('segnaControllo', { chiave: 'T03', stato: 'fatto' })).ok, true);
    assert.deepEqual(s.wisper.moduliSpenti(), []);
    assert.equal(s.wisper.leggiImpostazioni().COPIA_CIFRATA, false);
  } finally {
    await chi.titolare('salvaPermessi', { permessi: { amministrazione: { amministrazione: 1 } } });
  }
});

/** Le chiavi dei soldi trovate in una risposta, a qualunque profondita' (con il percorso). */
function soldiDentro(x, dove, out) {
  out = out || [];
  if (Array.isArray(x)) x.forEach((y, i) => soldiDentro(y, dove + '[' + i + ']', out));
  else if (x && typeof x === 'object') {
    for (const k of Object.keys(x)) {
      if (CAMPI_COSTI.has(k)) out.push(dove + '.' + k);
      soldiDentro(x[k], dove + '.' + k, out);
    }
  }
  return out;
}

test('T02: senza "costi" (collaboratore, esterno) nessun campo dei soldi a nessuna profondita\' nelle letture della fase 8 e nella Dashboard', async () => {
  for (const ruolo of ['collaboratore', 'esterno']) {
    assert.equal(s.wisper.permessiDi(ruolo).costi, 0, ruolo + ' senza costi');
    const letture = NUOVE.filter(n => !AZIONI[n].scrive && !AZIONI[n].soloPost && !vietata(ruolo, n));
    assert.ok(letture.length >= 3, ruolo + ': ' + letture.join(', '));
    for (const nome of letture.concat(['dashboard', 'io'])) {
      const r = await chi[ruolo](nome, nome === 'dashboard' ? { tutto: true } : {});
      assert.deepEqual(soldiDentro(r, nome), [], ruolo + ' ' + nome);
    }
    const doc = await chi[ruolo]('documenti', { testo: 'verifica', dentro: true });
    assert.deepEqual(soldiDentro(doc, 'documenti'), [], ruolo + ' documenti dentro');
  }
  // Il titolare invece li vede (la prova cerca davvero).
  assert.ok(soldiDentro(await chi.titolare('dashboard', { tutto: true }), 'dashboard').length > 0);
});
