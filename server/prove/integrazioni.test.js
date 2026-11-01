// Fase 8 (fase8.md §4, §16): il modulo Integrazioni. Ogni controllo vero con un servizio finto che risponde, che non
// risponde, che risponde male; due errori di fila -> Errore, uno solo no; Prova adesso una volta al minuto; nessun
// segreto nelle risposte (le chiavi confrontate con un elenco chiuso); il server interno su internet -> Errore, registro,
// voce urgente. Niente internet: postino, VIES e GitHub finti.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { serverDiProva, postinoFinto, viesFinto, ascolta, chiudi, SEGRETO, giornoDeiPrototipi } = require('./aiuto');
const E = require('../src/integrazioni/elenco');
const { CAMPI_RIGA_INTEGRAZIONE } = require('../src/azioni/integrazioni');

giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

/** Un GitHub finto: l'elenco firmato delle versioni (risponde, risponde male, non risponde). */
async function githubFinto() {
  const stato = { modo: 'bene' };
  const server = http.createServer((req, res) => {
    if (stato.modo === 'male') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('non e\' json'); }
    if (stato.modo === 'errore') { res.writeHead(503); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ manifesto: JSON.stringify({ android: { codice: 20, nome: '0.11.0' }, computer: { versione: '0.11.0' } }), firma: 'finta' }));
  });
  const url = await ascolta(server);
  return Object.assign(stato, { url: url + '/aggiornamento.json', ferma: () => chiudi(server) });
}

let postino;
let vies;
let github;
let s;
let manuel;
test.before(async () => {
  postino = await postinoFinto();
  vies = await viesFinto();
  github = await githubFinto();
  process.env.WISPER_VIES_URL = vies.url;
  process.env.WISPER_AGGIORNAMENTI_URL = github.url;
  s = await serverDiProva({ env: { WISPER_POSTINO_URL: postino.url, WISPER_POSTINO_SEGRETO: SEGRETO } });
  manuel = await s.come('manuel@esempio.it');
});
test.after(async () => {
  await s.ferma();
  await postino.ferma();
  await vies.ferma();
  await github.ferma();
  delete process.env.WISPER_VIES_URL;
  delete process.env.WISPER_AGGIORNAMENTI_URL;
});

/** Un controllo come se fosse passato il minuto di Prova adesso (le prove non aspettano). */
async function controlla(chiave) {
  return s.wisper.controllaIntegrazione(chiave);
}

test('l\'elenco unico: 26 collegamenti, numerati, coi gruppi della §0.2; i Non collegati col motivo, quelli di Andrea con "Dipende da una scelta"', async () => {
  assert.equal(E.ELENCO.length, 26);
  assert.deepEqual(E.ELENCO.map(v => v.numero), Array.from({ length: 26 }, (x, i) => i + 1));
  const gruppo = g => E.ELENCO.filter(v => v.gruppo === g).map(v => v.numero);
  assert.deepEqual(gruppo('collegati'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 14]);
  assert.deepEqual(gruppo('scelta'), [10, 12, 13, 16, 23, 24]);
  assert.deepEqual(gruppo('noncollegati'), [11, 15, 17, 18, 19, 20, 21, 22, 25, 26]);
  // Dopo la scelta Google del 31/10 niente tailnet, Funnel o porte 8401/8443 nelle frasi (§0).
  assert.doesNotMatch(JSON.stringify(E.ELENCO), /tailnet|Tailscale|Funnel|8401|8443/i);
  const r = ok(await manuel('integrazioni'));
  assert.equal(r.integrazioni.length, 26);
  for (const v of r.integrazioni.filter(x => x.gruppo === 'noncollegati')) {
    assert.equal(v.stato, 'non_collegato');
    assert.ok(v.perche && v.servirebbe, v.chiave + ': il motivo e cosa servirebbe');
    assert.equal(v.provaAdesso, false, 'nessun pulsante che finga di collegare');
  }
  for (const v of r.integrazioni.filter(x => x.gruppo === 'scelta')) assert.deepEqual([v.stato, v.dipende], ['dipende', 'Dipende da una scelta: è nelle domande della fase 8']);
  assert.ok(!r.integrazioni.some(v => v.chiave === 'internetinterno'), 'il controllo del server interno sta in Sicurezza');
  // Un collegamento nuovo parte Da configurare (§4.4): Collegato solo dopo il primo controllo riuscito.
  assert.equal(r.integrazioni.find(v => v.chiave === 'postino').stato, 'da_configurare');
});

test('postino: risponde -> Collegato; risponde male una volta -> resta Collegato con "l\'ultimo controllo non e\' riuscito"; due di fila -> Errore e la notifica', async () => {
  let st = await controlla('postino');
  assert.equal(st.stato, 'collegato');
  assert.match(st.esito, /^Risponde · Google lascia mandare ancora 100 email oggi$/);
  postino.rompi = true;
  st = await controlla('postino');
  assert.deepEqual([st.stato, st.ultimoNonRiuscito], ['collegato', true]);
  assert.match(st.esito, /Drive pieno/);
  st = await controlla('postino');
  assert.equal(st.stato, 'errore');
  postino.rompi = false;
  const n = s.wisper.db.riga("SELECT * FROM notifiche WHERE tipo = 'integrazione_errore' AND titolo = 'Errore: Postino'");
  assert.ok(n, 'la notifica a chi riceve gli avvisi del server');
  // La fascia in cima e la voce di sistema.
  const r = ok(await manuel('integrazioni'));
  assert.match(r.fascia, /^Il postino non risponde da .*: le email e la copia di stanotte aspettano$/);
  assert.equal(r.segmento, 'dasistemare');
  st = await controlla('postino');
  assert.deepEqual([st.stato, st.ultimoNonRiuscito], ['collegato', false]);
  // La storia dei controlli: gli ultimi 20, i piu' recenti prima.
  const una = ok(await manuel('integrazione', { chiave: 'postino' })).integrazione;
  assert.deepEqual(una.controlli.slice(0, 4).map(c => c.esito), ['ok', 'errore', 'errore', 'ok']);
  assert.ok(una.controlli.every(c => c.quando && typeof c.millisecondi === 'number'));
});

test('postino che non risponde (indirizzo chiuso) e postino mancante: Errore dopo due, Da configurare senza indirizzo', async () => {
  const vero = s.wisper.postino;
  const { Postino } = require('../src/postino');
  s.wisper.postino = new Postino({ url: 'http://127.0.0.1:9/exec', segreto: 'x' });
  await controlla('postino');
  const st = await controlla('postino');
  assert.equal(st.stato, 'errore');
  assert.match(st.esito, /Il postino non risponde/);
  s.wisper.postino = new Postino({});
  const st2 = await controlla('postino');
  assert.deepEqual([st2.stato, st2.esito], ['da_configurare', 'Mancano WISPER_POSTINO_URL o il segreto nel .env del NAS']);
  s.wisper.postino = vero;
  await controlla('postino');
});

test('VIES: valida -> Collegato; non risponde -> Errore al secondo; la partita IVA dello studio vuota -> Da configurare', async () => {
  ok(await manuel('salvaImpostazioni', { valori: { PARTITA_IVA: '01234567897' } }));
  let st = await controlla('vies');
  assert.deepEqual([st.stato, st.esito], ['collegato', 'Risponde · la partita IVA dello studio risulta valida']);
  ok(await manuel('salvaImpostazioni', { valori: { PARTITA_IVA: '00000000000' } }));
  st = await controlla('vies');
  assert.deepEqual([st.stato, st.ultimoNonRiuscito], ['collegato', true]);
  st = await controlla('vies');
  assert.equal(st.stato, 'errore');
  assert.match(st.esito, /non risponde/);
  ok(await manuel('salvaImpostazioni', { valori: { PARTITA_IVA: '' } }));
  st = await controlla('vies');
  assert.equal(st.stato, 'da_configurare');
  assert.match(st.esito, /^Manca la partita IVA dello studio/);
  ok(await manuel('salvaImpostazioni', { valori: { PARTITA_IVA: '00000000000' } }));
  // La voce della Dashboard per un collegamento in Errore che non ferma il lavoro: Questa settimana.
  await controlla('vies');
  await controlla('vies');
  const d = ok(await manuel('dashboard', { tutto: true }));
  const v = d.settimana.find(x => x.tipo === 'integrazione' && x.titolo === 'Errore: Verifica della partita IVA');
  assert.ok(v);
  assert.deepEqual(v.collegamento, { pagina: 'integrazione', id: 'vies' });
  assert.ok(d.numerini.integrazioni >= 1, 'il numerino del menu Integrazioni');
});

test('aggiornamenti: legge l\'elenco delle versioni di GitHub (finto); risponde male -> fallito; le versioni vecchie dei dispositivi', async () => {
  let st = await controlla('aggiornamenti');
  assert.deepEqual([st.stato, st.esito], ['collegato', 'Ultima versione: telefono 0.11.0, computer 0.11.0']);
  github.modo = 'male';
  st = await controlla('aggiornamenti');
  assert.equal(st.ultimoNonRiuscito, true);
  github.modo = 'errore';
  st = await controlla('aggiornamenti');
  assert.equal(st.stato, 'errore');
  assert.match(st.esito, /GitHub ha risposto 503/);
  github.modo = 'bene';
  await controlla('aggiornamenti');
  // Un telefono con la 0.9.0: in Stato del sistema e nella Dashboard (Da pianificare).
  const t = await s.accedi('marco@esempio.it');
  s.wisper.db.esegui("UPDATE sessioni SET app = 'telefono 0.9.0', disp_nome = 'Telefono' WHERE token_hash = ?", require('../src/utili').sha256(t));
  const st2 = ok(await manuel('statoSistema'));
  assert.deepEqual(st2.versioni.ultime, { telefono: '0.11.0', computer: '0.11.0' });
  assert.ok(st2.versioni.dispositivi.some(x => x.app === 'telefono 0.9.0' && x.indietro));
  const d = ok(await manuel('dashboard', { tutto: true }));
  const v = d.pianificare.find(x => x.tipo === 'versione');
  assert.match(v.titolo, /^1 dispositivo ha una versione vecchia di Wisper$/);
  assert.match(v.dettaglio, /^Telefono di Marco: 0\.9\.0 · ultima 0\.11\.0$/);
});

test('porta Google: guarda, non chiede (Collegato col giro degli ultimi 10 minuti, Errore con due giri falliti, Da configurare senza indirizzo o spenta)', async () => {
  const vera = s.wisper.porta;
  s.wisper.porta = { configurata: () => true, spenta: false, erroriDiFila: 0, ultimoContatto: Date.now() };
  // L'ultimo accesso da fuori casa: una richiesta arrivata dalla porta (provenienza "google").
  s.wisper.db.esegui("INSERT INTO accessi (quando, esito, azione, utente_id, disp, disp_nome, app, ip, da_fuori) VALUES (?, 'ok', 'io', 1, 'x', 'Telefono di Manuel', 'telefono 0.11.0', 'google', 1)",
    require('../src/utili').adesso());
  let st = await controlla('porta');
  assert.equal(st.stato, 'collegato');
  assert.match(st.esito, /^Ultimo accesso da fuori casa: oggi alle \d{1,2}:\d{2}, Telefono di Manuel di Manuel Gasparotto$/);
  s.wisper.porta.erroriDiFila = 2;
  st = await controlla('porta');
  assert.equal(st.stato, 'errore');
  s.wisper.porta = { configurata: () => true, spenta: true };
  st = await controlla('porta');
  assert.deepEqual([st.stato, st.esito], ['da_configurare', 'Spenta nel .env del NAS (WISPER_PORTA_GOOGLE=no)']);
  s.wisper.porta = { configurata: () => false };
  st = await controlla('porta');
  assert.deepEqual([st.stato, st.esito], ['da_configurare', 'Mancano WISPER_POSTINO_URL o SEGRETO_SERVER nel .env del NAS']);
  s.wisper.porta = vera;
  // Link e ponte seguono portale e porta, senza controlli loro.
  const r = ok(await manuel('integrazioni'));
  assert.deepEqual(['link', 'ponte'].map(k => r.integrazioni.find(v => v.chiave === k).stato), ['da_configurare', 'da_configurare']);
  assert.equal(r.integrazioni.find(v => v.chiave === 'ponte').provaAdesso, false);
});

test('portale: Da configurare finche\' mancano WISPER_PORTALE_URL e SEGRETO_PORTALE; poi lo stato del controllo del portale', async () => {
  let st = await controlla('portale');
  assert.deepEqual([st.stato, st.esito], ['da_configurare', 'Mancano WISPER_PORTALE_URL e SEGRETO_PORTALE nel .env del NAS']);
  const vera = s.wisper.portaPortale;
  s.wisper.portaPortale = { configurata: () => true, ultimoContatto: Date.now() };
  st = await controlla('portale');
  assert.deepEqual([st.stato, st.esito], ['da_configurare', 'Manca l\'indirizzo della pagina del portale (PORTALE_INDIRIZZO)']);
  s.wisper.portaPortale = vera;
});

test('calendario, file del calendario, ricerca: controlli locali coi loro stati', async () => {
  const f = await controlla('calendariofile');
  assert.deepEqual([f.stato, f.esito], ['collegato', 'Il file si fa sul NAS: niente esce']);
  const c = await controlla('calendario');
  assert.equal(c.stato, 'collegato');
  assert.match(c.esito, /^Ultima lettura: .* · ICSx5 · 1 indirizzo$/, 'l\'indirizzo dei dati di esempio, letto da ICSx5');
  const r = await controlla('ricerca');
  assert.equal(r.stato, 'collegato');
  assert.match(r.esito, /file letti · .* da leggere$/);
  // Senza FTS5 (solo per le prove): Errore subito, con la frase dell'accordo.
  s.wisper.senzaFts5 = true;
  const r2 = await controlla('ricerca');
  assert.deepEqual([r2.stato, r2.esito], ['errore', 'Il database del NAS non sa cercare dentro i file: la ricerca resta sui titoli']);
  s.wisper.senzaFts5 = false;
  await controlla('ricerca');
  await controlla('ricerca');
});

test('Prova adesso: una volta al minuto per collegamento; un Non collegato non si prova; nel registro', async () => {
  const r = ok(await manuel('provaIntegrazione', { chiave: 'calendariofile' }));
  assert.equal(r.integrazione.stato, 'collegato');
  const di = await manuel('provaIntegrazione', { chiave: 'calendariofile' });
  assert.deepEqual([di.ok, di.errore], [false, 'Hai appena provato: riprova fra un minuto']);
  const no = await manuel('provaIntegrazione', { chiave: 'sdi' });
  assert.deepEqual([no.ok, no.errore], [false, 'Non è collegato: non c\'è niente da provare']);
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE tabella = 'integrazioni' AND id_riga = 'calendariofile' AND nota = 'collegamento provato a mano'"));
});

test('nessun segreto nelle risposte: le chiavi delle righe da un elenco chiuso, niente indirizzo dello script ne\' segreto da nessuna parte', async () => {
  const r = ok(await manuel('integrazioni'));
  const testoTutto = JSON.stringify(r);
  for (const v of r.integrazioni) for (const k of Object.keys(v)) assert.ok(CAMPI_RIGA_INTEGRAZIONE.includes(k), 'campo non previsto: ' + k);
  for (const chiave of ['postino', 'calendario', 'ricerca', 'portale', 'internetinterno']) {
    const u = ok(await manuel('integrazione', { chiave })).integrazione;
    for (const k of Object.keys(u)) assert.ok(CAMPI_RIGA_INTEGRAZIONE.concat(['controlli', 'impostazioni']).includes(k), chiave + ': campo non previsto ' + k);
  }
  assert.ok(testoTutto.indexOf(postino.url) < 0, 'l\'indirizzo dello script');
  assert.ok(testoTutto.indexOf(SEGRETO) < 0, 'il segreto');
  // L'account si scrive a parole: mai indirizzi o chiavi.
  const no = await manuel('salvaIntegrazione', { chiave: 'postino', account: 'https://script.google.com/macros/s/ABC/exec' });
  assert.equal(no.ok, false);
  const si = ok(await manuel('salvaIntegrazione', { chiave: 'postino', account: 'il Gmail del foglio di Wisper' }));
  assert.equal(si.integrazione.account, 'il Gmail del foglio di Wisper');
});

test('impostazioni dei collegamenti: limiti; CALENDARIO_PUBBLICO solo col portale Collegato e con amministrazione 2', async () => {
  const no = await manuel('salvaIntegrazione', { chiave: 'ricerca', impostazioni: { RICERCA_FILE_MAX_MB: 500 } });
  assert.deepEqual([no.ok, no.errore], [false, 'File più grandi non si leggono: da 1 a 100 MB']);
  const si = ok(await manuel('salvaIntegrazione', { chiave: 'ricerca', impostazioni: { RICERCA_FILE_MAX_MB: 30 } }));
  assert.equal(si.integrazione.impostazioni.find(x => x.chiave === 'RICERCA_FILE_MAX_MB').valore, 30);
  const pub = await manuel('salvaIntegrazione', { chiave: 'calendario', impostazioni: { CALENDARIO_PUBBLICO: true } });
  assert.deepEqual([pub.ok, pub.errore], [false, 'Il calendario fuori casa passa dallo script del portale: prima il portale deve essere Collegato']);
  const altra = await manuel('salvaIntegrazione', { chiave: 'calendario', impostazioni: { RICERCA_FILE: false } });
  assert.match(altra.errore, /^Impostazione non di questo collegamento/);
  // Laura (amministrazione 1) cambia l'account ma non CALENDARIO_PUBBLICO.
  const laura = await s.come('laura@esempio.it');
  const l = await laura('salvaIntegrazione', { chiave: 'calendario', impostazioni: { CALENDARIO_PUBBLICO: false } });
  assert.deepEqual([l.ok, l.permesso], [false, false]);
  ok(await manuel('salvaIntegrazione', { chiave: 'ricerca', impostazioni: { RICERCA_FILE_MAX_MB: 20 } }));
});

test('permessi: il collaboratore non vede Integrazioni; la Lettura vede ma non prova e non salva', async () => {
  const marco = await s.come('marco@esempio.it');
  assert.equal((await marco('integrazioni')).permesso, false);
  const lettura = await s.come('lettura@esempio.it');
  const r = ok(await lettura('integrazioni'));
  assert.ok(r.integrazioni.every(v => v.provaAdesso === false));
  assert.equal((await lettura('provaIntegrazione', { chiave: 'postino' })).permesso, false);
  assert.equal((await lettura('salvaIntegrazione', { chiave: 'postino', account: 'x' })).permesso, false);
});

test('il server interno su internet: una richiesta sulla 8400 con Tailscale-Funnel-Request (o X-Forwarded-For) -> Errore, registro, voce urgente; poi l\'ingresso 8402', async () => {
  let st = await controlla('internetinterno');
  assert.deepEqual([st.stato, st.esito], ['collegato', 'Nessuna richiesta da internet sulla porta interna']);
  const r = await fetch(s.url + '/salute', { headers: { 'Tailscale-Funnel-Request': '?1' } });
  assert.equal(r.status, 200);
  st = s.wisper.statoIntegrazione('internetinterno');
  assert.equal(st.stato, 'errore', 'subito, senza aspettare il secondo controllo');
  assert.match(st.esito, /^Una richiesta è arrivata da internet sull'ingresso del NAS il \d{2}\/\d{2} alle \d{1,2}:\d{2}: con la porta Google l'ingresso va spento$/);
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE tabella = 'integrazioni' AND id_riga = 'internetinterno' AND nota = 'richiesta da internet sulla porta interna'"));
  const d = ok(await manuel('dashboard'));
  assert.equal(d.urgenti[0].tipo, 'sistema', 'le voci di sistema sempre per prime');
  assert.equal(d.urgenti[0].titolo, 'Il server interno si raggiunge da internet');
  assert.deepEqual(d.urgenti[0].collegamento, { pagina: 'amministrazione', filtro: { sezione: 'sicurezza' } });
  const sic = ok(await manuel('sicurezza'));
  assert.equal(sic.internetInterno.ok, false);
  assert.equal(sic.tuttoAPosto, false);
  // Il collaboratore e la Lettura non vedono le voci di sistema.
  const marco = await s.come('marco@esempio.it');
  assert.ok(!ok(await marco('dashboard', { tutto: true })).urgenti.some(v => v.tipo === 'sistema'));
  // Sull'ingresso interno (8402) basta una richiesta qualunque.
  const s2 = await serverDiProva({ ingresso: true });
  try {
    await fetch(s2.urlIngresso + '/salute');
    assert.equal(s2.wisper.statoIntegrazione('internetinterno').stato, 'errore');
  } finally {
    await s2.ferma();
  }
});
