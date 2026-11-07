// Fase 8 (fase8.md §8, §16): la Dashboard con tutte le fasi. Coi dati di prova di tutte le fasi, il titolare prima
// (le voci grezze) e dopo (il passaggio finale): nessun oggetto in due voci; i doppioni di §8.1; l'ordine di §8.3 (un tipo
// fuori elenco fa fallire la prova); tetti e quante; i gruppi da 3; la voce Da approvare; i riquadri per ruolo e Cambia i
// riquadri; le voci nascoste che tornano dopo 30 giorni (orologio spostato); la Lettura senza voci d'azione; i numerini.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const { accendiOrologioDiProva, oggi, piuGiorni, istante, adessoMs, numero } = require('../src/utili');
const D8 = require('../src/azioni/dashboard8');

const GIORNO = giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const SEZIONI = ['urgenti', 'settimana', 'pianificare'];
const voci = d => [].concat(d.urgenti, d.settimana, d.pianificare);

let s;
const chi = {};
test.before(async () => {
  s = await serverDiProva();
  for (const n of ['manuel', 'laura', 'marco', 'lettura', 'luca']) chi[n] = await s.come(n + '@esempio.it');
});
test.after(() => s.ferma());

test('una cosa, una voce: nessun oggetto in due voci, per ogni ruolo; ogni voce coi campi nuovi (oggetto, area, nascondibile, famiglia)', async () => {
  for (const n of ['manuel', 'laura', 'marco', 'lettura', 'luca']) {
    for (const tutto of [false, true]) {
      const d = ok(await chi[n]('dashboard', { tutto }));
      const v = voci(d);
      const oggetti = v.map(x => x.oggetto);
      assert.equal(new Set(oggetti).size, oggetti.length, n + (tutto ? ' (tutto)' : '') + ': un oggetto in due voci');
      for (const x of v) {
        assert.ok(x.oggetto && typeof x.oggetto === 'string', n + ': oggetto');
        assert.ok(['lavoro', 'soldi', 'persone', 'documenti', 'clienti', 'sistema'].includes(x.area), n + ': area ' + x.area + ' di ' + x.tipo);
        assert.equal(typeof x.nascondibile, 'boolean');
        assert.equal(typeof x.famiglia, 'string');
      }
    }
  }
});

test('l\'ordine fisso di §8.3: ogni tipo e\' nell\'elenco (un tipo fuori elenco fa fallire la prova); per gravita\', poi per tipo', async () => {
  const visti = new Set();
  for (const n of ['manuel', 'laura', 'marco', 'lettura', 'luca']) {
    const grezza = s.wisper.come({ utente: s.wisper.db.riga('SELECT id, nome, email, ruolo FROM utenti WHERE email = ?', n + '@esempio.it'), permessi: s.wisper.permessiDi((s.wisper.db.riga('SELECT ruolo FROM utenti WHERE email = ?', n + '@esempio.it')).ruolo) },
      () => s.wisper.dashboardGrezza({}));
    voci(grezza).forEach(v => visti.add(v.tipo));
    const d = ok(await chi[n]('dashboard', { tutto: true }));
    for (const sezione of SEZIONI) {
      const l = d[sezione];
      for (let i = 1; i < l.length; i++) {
        const a = l[i - 1];
        const b = l[i];
        const g = { urgente: 0, attenzione: 1, soldi: 2, info: 3 };
        assert.ok(g[a.gravita] < g[b.gravita] || (g[a.gravita] === g[b.gravita] && D8.RANGO_TIPI[a.tipo] <= D8.RANGO_TIPI[b.tipo]), n + ' ' + sezione + ': ' + a.tipo + ' prima di ' + b.tipo);
      }
    }
  }
  for (const t of visti) assert.ok(D8.RANGO_TIPI[t] !== undefined, 'il tipo "' + t + '" non e\' nell\'ordine di §8.3: mettilo al suo posto');
  assert.ok(visti.size >= 20, 'i dati di prova hanno voci di tutte le fasi');
});

test('tetti 7 · 7 · 5 con "quante" (Altre N); con tutto: true niente tetti; la piu\' urgente e\' la prima di Urgenti', async () => {
  const d = ok(await chi.manuel('dashboard'));
  assert.ok(d.urgenti.length <= 7 && d.settimana.length <= 7 && d.pianificare.length <= 5);
  for (const k of SEZIONI) assert.ok(d.quante[k] >= d[k].length, k);
  assert.ok(d.quante.urgenti > 7 || d.quante.pianificare > 5, 'coi dati di tutte le fasi qualche sezione e\' piena');
  assert.deepEqual(d.piuUrgente, d.urgenti[0]);
  const t = ok(await chi.manuel('dashboard', { tutto: true }));
  assert.ok(voci(t).length > voci(d).length);
  assert.equal(t.tutto, true);
});

test('i gruppi da 3 voci della stessa famiglia ("5 scadenze nei prossimi 30 giorni", coi primi tre nomi); le voci di sistema mai; con tutto niente gruppi', async () => {
  const d = ok(await chi.manuel('dashboard'));
  for (const k of SEZIONI) {
    const per = {};
    d[k].filter(v => v.famiglia && !/^gruppo:/.test(v.oggetto)).forEach(v => { per[v.famiglia] = (per[v.famiglia] || 0) + 1; });
    for (const [f, n] of Object.entries(per)) assert.ok(n < 3, k + ': ' + n + ' voci della famiglia ' + f + ' non raggruppate');
  }
  const gruppo = voci(d).find(v => /^gruppo:scadenze:/.test(v.oggetto));
  assert.ok(gruppo, 'un gruppo di scadenze');
  assert.match(gruppo.titolo, /^\d+ scadenze (nei prossimi 30 giorni|scadute|più avanti)$/);
  assert.match(gruppo.dettaglio, /(, .*){2}/);
  assert.deepEqual(gruppo.collegamento, { pagina: 'documenti', filtro: { segmento: 'scadenze' } });
  assert.ok(Array.isArray(gruppo.oggetti) && gruppo.oggetti.length >= 3);
  const t = ok(await chi.manuel('dashboard', { tutto: true }));
  assert.ok(!voci(t).some(v => /^gruppo:/.test(v.oggetto)));
});

test('Da approvare in una voce sola per chi approva, con le tre righe (rapportini e spese, ferie, documenti)', async () => {
  // La voce sola sta fra le Urgenti dopo quelle "urgente" (ordine fisso): con i dati di tutte le fasi oltre il tetto di 7,
  // quindi si guarda il passaggio che la fa, sulle voci grezze del titolare.
  const w = s.wisper;
  const grezza = w.come({ utente: w.titolare(), permessi: w.permessiDi('titolare') }, () => w.dashboardGrezza({}));
  const conSezione = [].concat(...SEZIONI.map(k => grezza[k].map(v => Object.assign({ sezione: k }, v))));
  const d = { urgenti: w.come({ utente: w.titolare(), permessi: w.permessiDi('titolare') }, () => w.unaVoceDaApprovare(conSezione)), settimana: [], pianificare: [] };
  const a = voci(d).filter(v => v.tipo === 'approvare');
  assert.equal(a.length, 1);
  assert.ok(ok(await chi.manuel('dashboard')).quante.urgenti > 7, 'la voce c\'e\', oltre il tetto');
  assert.match(a[0].titolo, /^\d+ cose da approvare$/);
  // 07/11/2026 (Ore tolte): prima "N ore e spese" e la riga "Ore e rapportini › Da approvare".
  assert.match(a[0].dettaglio, /^\d+ rapportini e spese di Marco Rossato, 1 ferie, 1 documento$/);
  assert.deepEqual(a[0].righe.map(r => r.nome), ['Rapportini › Da approvare', 'Persone › Ferie da approvare', 'Documenti › Da approvare']);
  assert.equal(a[0].quanto, a[0].righe.reduce((t, r) => t + r.numero, 0));
  assert.deepEqual(a[0].collegamento, { pagina: 'approvare' });
  assert.ok(!voci(d).some(v => v.tipo === 'assenza' && / da approvare/.test(v.titolo)), 'le ferie da approvare dentro la voce sola');
});

test('i doppioni di §8.1: il rapportino da far firmare e "fallo firmare nel portale" sono una voce (il gruppo porta i suoi oggetti)', async () => {
  const w = s.wisper;
  const titolare = { utente: w.titolare(), permessi: w.permessiDi('titolare') };
  const grezza = w.come(titolare, () => w.dashboardGrezza({}));
  const portale = voci(grezza).filter(v => v.tipo === 'portale' && /fallo firmare nel portale$/.test(v.titolo));
  const finale = ok(await chi.manuel('dashboard', { tutto: true }));
  for (const v of portale) {
    const oggetto = 'rapportino:' + v.collegamento.id;
    const resta = voci(finale).find(x => Array.isArray(x.oggetti) && x.oggetti.includes(oggetto));
    if (!resta) continue;
    assert.ok(!voci(finale).some(x => x.titolo === v.titolo), 'la voce del portale non si ripete');
    assert.match(resta.dettaglio, / · da firmare nel portale/);
  }
  // La fattura scaduta e il promemoria di pagamento della stessa fattura: una voce, "· promemoria pronto".
  const f = voci(finale).find(v => v.tipo === 'fattura' && /scaduta/.test(v.titolo));
  assert.match(f.dettaglio, / · promemoria pronto$/);
  assert.ok(!voci(finale).some(v => v.tipo === 'pagamento' && v.oggetto === f.oggetto));
});

test('i riquadri per ruolo (quattro), Cambia i riquadri tra quelli che la persona vede; un riquadro che perde il permesso torna quello di base', async () => {
  const chiavi = async n => ok(await chi[n]('dashboard')).riquadri.map(r => r.chiave);
  assert.deepEqual(await chiavi('manuel'), ['daFatturare', 'scaduto', 'ticketAperti', 'daApprovare']);
  assert.deepEqual(await chiavi('laura'), ['daFatturare', 'daIncassare', 'scaduto', 'scadenzeVicine']);
  assert.deepEqual(await chiavi('marco'), ['oreSettimana', 'attivitaOggi', 'mieiTicket', 'daMandareOggi']);
  assert.deepEqual(await chiavi('lettura'), ['commesseAperte', 'daFatturare', 'daIncassare', 'scaduto']);
  const d = ok(await chi.manuel('dashboard'));
  const scaduto = d.riquadri.find(r => r.chiave === 'scaduto');
  assert.deepEqual([scaduto.unita, scaduto.rosso], ['euro', scaduto.numero > 0]);
  assert.ok(d.riquadriPossibili.length >= 10);
  // Marco non sceglie i soldi.
  assert.equal((await chi.marco('salvaRiquadri', { riquadri: ['oreSettimana', 'attivitaOggi', 'mieiTicket', 'daFatturare'] })).errore, 'Questo riquadro non è per il tuo ruolo');
  assert.equal((await chi.marco('salvaRiquadri', { riquadri: ['oreSettimana'] })).errore, 'Scegli quattro riquadri');
  ok(await chi.laura('salvaRiquadri', { riquadri: ['ticketAperti', 'assentiOggi', 'daFatturare', 'oreSettimana'] }));
  assert.deepEqual(await chiavi('laura'), ['ticketAperti', 'assentiOggi', 'daFatturare', 'oreSettimana']);
  // Laura perde i ticket: il suo riquadro sparisce e torna uno di quelli del ruolo.
  ok(await chi.manuel('salvaPermessi', { permessi: { amministrazione: { ticket: 0 } } }));
  const dopo = await chiavi('laura');
  assert.ok(!dopo.includes('ticketAperti'));
  assert.equal(dopo.length, 4);
  ok(await chi.manuel('salvaPermessi', { permessi: { amministrazione: { ticket: 2 } } }));
});

test('Nascondi per 30 giorni: solo le voci "info" di Da pianificare, per la persona; tornano dopo 30 giorni (orologio spostato); Mostrale', async () => {
  const t = ok(await chi.laura('dashboard', { tutto: true }));
  const v = t.pianificare.find(x => x.nascondibile);
  assert.ok(v, 'una voce nascondibile');
  const urgente = t.urgenti[0];
  assert.equal((await chi.laura('nascondiVoce', { oggetto: urgente.oggetto })).errore, 'Questa voce non si può nascondere');
  const n = ok(await chi.laura('nascondiVoce', { oggetto: v.oggetto }));
  assert.equal(n.fino.slice(0, 10), piuGiorni(oggi(), 30));
  const dopo = ok(await chi.laura('dashboard', { tutto: true }));
  assert.ok(!dopo.pianificare.some(x => x.oggetto === v.oggetto));
  assert.equal(dopo.nascoste, 1);
  assert.ok(ok(await chi.manuel('dashboard', { tutto: true })).pianificare.some(x => x.oggetto === v.oggetto), 'vale solo per lei');
  assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM registro WHERE tabella = 'dashboard_nascoste'").n, 0, 'nel registro no');
  // 31 giorni dopo non e' piu' nascosta.
  accendiOrologioDiProva(piuGiorni(GIORNO, 31));
  try {
    assert.equal(ok(await chi.laura('dashboard', { tutto: true })).nascoste, 0);
  } finally {
    accendiOrologioDiProva(GIORNO);
  }
  ok(await chi.laura('mostraNascoste'));
  assert.ok(ok(await chi.laura('dashboard', { tutto: true })).pianificare.some(x => x.oggetto === v.oggetto));
});

test('la Lettura non ha le voci che chiedono di fare qualcosa: niente da approvare, sistema, respinte, timer, file dai clienti da guardare', async () => {
  const d = ok(await chi.lettura('dashboard', { tutto: true }));
  for (const v of voci(d)) {
    assert.ok(!['approvare', 'respinta', 'timer'].includes(v.tipo), v.titolo);
    assert.notEqual(v.area, 'sistema', v.titolo);
    assert.doesNotMatch(v.titolo, /da guardare/);
  }
  assert.ok(voci(d).some(v => v.area === 'soldi'), 'i soldi si', );
});

test('i numerini del menu: contano le cose che aspettano te; niente su Dashboard, Clienti, Commesse...; Integrazioni solo a titolare e amministrazione 2', async () => {
  const ammessi = ['fatturazione', 'rapportini', 'ticket', 'documenti', 'persone', 'mezzi', 'collaboratori', 'comunicazioni', 'portale', 'integrazioni'];
  const m = ok(await chi.manuel('dashboard')).numerini;
  for (const [k, n] of Object.entries(m)) {
    assert.ok(ammessi.includes(k), 'numerino non previsto: ' + k);
    assert.ok(Number.isInteger(n) && n > 0, k);
  }
  assert.ok(m.rapportini >= 1, 'le cose da approvare');
  const marco = ok(await chi.marco('dashboard')).numerini;
  assert.equal(marco.fatturazione, undefined);
  assert.equal(marco.integrazioni, undefined);
  // VIES in Errore (dati di esempio): il numerino di Integrazioni per il titolare.
  assert.equal(m.integrazioni, 1);
  assert.equal(ok(await chi.laura('dashboard')).numerini.integrazioni, undefined, 'amministrazione 1: no');
});

// 07/11/2026 (Manuel: "le Ore vanno tolte, non servono, metti solamente i Rapportini"): nelle app spariscono il segmento
// Ore, l'inserimento delle ore e il timer. Nel database e nelle azioni restano (app vecchie); nella Dashboard no.
test('Ore tolte: nessuna voce delle ore o del timer per nessun ruolo, nessun collegamento al segmento Ore; le Ore della settimana dai rapportini', async () => {
  const w = s.wisper;
  const idDi = email => w.db.riga('SELECT id FROM utenti WHERE email = ?', email).id;
  const MARCO = idDi('marco@esempio.it');
  // Le cose del vecchio modo, ancora nel database: il timer di Marco acceso da 11 ore, ore respinte e ore da approvare.
  w.db.esegui('UPDATE timer SET partito_il = ? WHERE utente_id = ?', istante(new Date(adessoMs() - 11 * 3600000 - 60000)), MARCO);
  assert.ok(w.db.riga('SELECT 1 x FROM timer WHERE utente_id = ?', MARCO), 'il timer di Marco e\' acceso');
  assert.ok(w.db.riga("SELECT 1 x FROM ore WHERE utente_id = ? AND stato = 'respinta' AND tolta IS NULL", MARCO), 'ore respinte di Marco');
  assert.ok(w.db.riga("SELECT 1 x FROM ore WHERE stato = 'da_approvare' AND tolta IS NULL"), 'ore da approvare');
  for (const n of ['manuel', 'laura', 'marco', 'lettura', 'luca']) {
    for (const tutto of [false, true]) {
      const d = ok(await chi[n]('dashboard', { tutto }));
      const dove = n + (tutto ? ' (tutto)' : '');
      for (const v of voci(d)) {
        assert.notEqual(v.tipo, 'timer', dove + ': ' + v.titolo);
        assert.doesNotMatch(v.titolo, /^Ore del .* respinte$|timer/i, dove);
        assert.doesNotMatch(v.dettaglio || '', /^Ore\b|\bore e spese\b/, dove + ': ' + v.titolo);
        for (const r of v.righe || []) assert.doesNotMatch(r.nome, /^Ore\b/, dove);
      }
      // Da nessuna parte (voci, righe, riquadri) un collegamento al segmento Ore.
      assert.doesNotMatch(JSON.stringify(d), /"segmento":"ore"/, dove + ': un collegamento al segmento Ore');
    }
  }
  // Da approvare: niente righe della tabella ore.
  const da = ok(await chi.manuel('daApprovare'));
  assert.ok(da.quante > 0);
  assert.ok(![].concat(...da.persone.map(p => p.voci)).some(v => v.tipo === 'ore'), 'nessuna riga delle ore da approvare');
  // Le Ore della settimana: le ore dei rapportini di questa settimana (prima le ore registrate), e portano ai Rapportini
  // senza segmento. Marco scrive un rapportino oggi (3 + 0,5 di viaggio).
  ok(await chi.marco('salvaRapportino', { rapportino: { idLocale: 'ore-tolte-1', data: oggi(), idCliente: 'C002', idCommessa: '26ST002', oreLavoro: 3, oreViaggio: 0.5 } }));
  const lunedi = piuGiorni(oggi(), -((new Date(oggi() + 'T12:00:00').getDay() + 6) % 7));
  const dai = (sql, ...p) => Math.round(w.db.righe(sql, ...p).reduce((t, r) => t + (numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio)), 0) * 100) / 100;
  const deiRapportini = id => dai("SELECT * FROM rapportini WHERE utente_id = ? AND UPPER(stato) <> 'ANNULLATO' AND data >= ? AND data <= ?", id, lunedi, oggi());
  const registrate = Math.round(w.db.righe('SELECT ore FROM ore WHERE utente_id = ? AND tolta IS NULL AND data >= ? AND data <= ?', MARCO, lunedi, oggi()).reduce((t, o) => t + numero(o.ore), 0) * 100) / 100;
  const marco = ok(await chi.marco('dashboard'));
  const sua = marco.riquadri.find(r => r.chiave === 'oreSettimana');
  assert.ok(sua, 'il riquadro di base del collaboratore');
  assert.deepEqual(sua.collegamento, { pagina: 'rapportini' });
  assert.ok(deiRapportini(MARCO) >= 3.5, 'c\'e\' almeno il rapportino di oggi');
  assert.equal(sua.numero, deiRapportini(MARCO));
  assert.equal(sua.numero, marco.numeri.rapportini.oreSettimana);
  assert.ok(registrate > 0 && registrate !== sua.numero, 'non le ore registrate (' + registrate + ')');
  // L'esterno: le ore dei suoi rapportini (prima il numero non c'era).
  const luca = ok(await chi.luca('dashboard'));
  const suaL = luca.riquadri.find(r => r.chiave === 'oreSettimana');
  assert.deepEqual([suaL.numero, suaL.collegamento], [deiRapportini(idDi('luca@esempio.it')), { pagina: 'rapportini' }]);
  // Chi lo sceglie fra i suoi riquadri (titolare): le ore dei rapportini di tutto lo studio.
  const tutti = dai("SELECT * FROM rapportini WHERE UPPER(stato) <> 'ANNULLATO' AND data >= ? AND data <= ?", lunedi, oggi());
  ok(await chi.manuel('salvaRiquadri', { riquadri: ['oreSettimana', 'daFatturare', 'scaduto', 'ticketAperti'] }));
  try {
    const t = ok(await chi.manuel('dashboard')).riquadri.find(r => r.chiave === 'oreSettimana');
    assert.deepEqual([t.numero, t.collegamento], [tutti, { pagina: 'rapportini' }]);
  } finally {
    w.db.esegui('UPDATE utenti SET riquadri = NULL WHERE email = ?', 'manuel@esempio.it');
  }
});
