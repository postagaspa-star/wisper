/*
 * Quello che serve a tutte le prove: un server di prova vero (HTTP su una
 * porta libera, database in memoria coi dati di esempio), un postino finto che
 * scrive su disco e un finto VIES. Niente internet, niente Google.
 */
'use strict';

process.env.TZ = 'Europe/Rome';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { avvia } = require('../src/avvio');
const { scriviSuDisco } = require('../src/postino');

// L'orologio di prova anche per le prove che non seminano (WISPER_OGGI_PROVA=AAAA-MM-GG; prove/giorni.js le fa
// girare su tanti giorni diversi). Senza la variabile resta il giorno vero.
const { accendiOrologioDiProva } = require('../src/utili');
accendiOrologioDiProva(process.env.WISPER_OGGI_PROVA);

/**
 * Il giorno dei prototipi delle fasi 4 e 5 (giovedi' 22/10/2026). Le fatture 38, 39 e 45/2026, i movimenti di ottobre, i
 * ticket chiusi, i contratti del 2026 e i loro XML hanno date fisse (sono storia: fiscale, dei ticket); le prove che
 * controllano quella storia (una fattura "Emessa" e non "Scaduta", il saldo previsto sotto i 3.000 euro il 30/11, la
 * disdetta entro il 1/11) fermano l'orologio di prova qui, qualunque giorno sia (anche con WISPER_OGGI_PROVA). Anche
 * quelle che leggono la Dashboard intera del titolare: dal 2027 la storia del 2026 invecchia e riempie le sezioni (20
 * voci al massimo) prima delle voci cercate. Va chiamata in cima al file, prima di oggi() e del server.
 */
const GIORNO_DEI_PROTOTIPI = '2026-10-22';
function giornoDeiPrototipi() {
  process.env.WISPER_OGGI_PROVA = GIORNO_DEI_PROTOTIPI;
  accendiOrologioDiProva(GIORNO_DEI_PROTOTIPI);
  return GIORNO_DEI_PROTOTIPI;
}

const SEGRETO = 'segreto-di-prova';

function cartellaNuova(nome) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-' + (nome || 'prove') + '-'));
}

function ascolta(server) {
  return new Promise(r => server.listen(0, '127.0.0.1', () => r('http://127.0.0.1:' + server.address().port)));
}

function chiudi(server) {
  return new Promise(r => {
    server.close(() => r());
    if (server.closeAllConnections) server.closeAllConnections();
  });
}

/**
 * Un server di prova. opzioni.prova (di base vero): coi dati di semina();
 * opzioni.env: le variabili del .env (di base SEGRETO_SERVER = SEGRETO);
 * opzioni.ingresso: apre anche la porta dell'ingresso da internet (urlIngresso);
 * opzioni.portaGoogle: accende il collegamento a Google (porta.js), se l'env lo configura.
 */
async function serverDiProva(opzioni) {
  opzioni = opzioni || {};
  const dati = opzioni.dati || cartellaNuova('server');
  const env = Object.assign({ SEGRETO_SERVER: SEGRETO }, opzioni.env || {});
  const { wisper, server, ingresso } = avvia({ dati, prova: opzioni.prova !== false, env, pianifica: false, portaIngresso: opzioni.ingresso ? 1 : 0, portaGoogle: opzioni.portaGoogle === true });
  // Le prove che fermano il filo per qualche secondo (semina() di un secondo server, scrypt) non devono trovare la
  // connessione tenuta aperta chiusa dal server proprio mentre fetch la riusa (ECONNRESET a caso, sotto carico): il
  // server delle prove la tiene aperta piu' a lungo dei 5 secondi di Node. ferma() chiude comunque tutto.
  server.keepAliveTimeout = 10 * 60 * 1000;
  if (ingresso) ingresso.keepAliveTimeout = 10 * 60 * 1000;
  const url = await ascolta(server);
  const urlIngresso = ingresso ? await ascolta(ingresso) : '';

  async function chiama(token, corpo) {
    const r = await fetch(url + '/exec', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'text/plain;charset=utf-8' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify(corpo),
    });
    return r.json();
  }
  async function leggi(token, parametri) {
    const q = new URLSearchParams(parametri).toString();
    const r = await fetch(url + '/exec?' + q, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    return r.json();
  }
  async function accedi(email, password) {
    const r = await chiama(null, { azione: 'accedi', email, password: password === undefined ? 'prova' : password, disp: 'prove-' + email, dispNome: 'prove automatiche', app: 'prove' });
    if (!r.ok) throw new Error('accedi ' + email + ': ' + r.errore);
    return r.token;
  }
  /** Una funzione che fa le richieste come quella persona: manuel('salvaRapportino', {...}). */
  async function come(email, password) {
    const token = await accedi(email, password);
    const f = (azione, dati) => chiama(token, Object.assign({ azione }, dati || {}));
    f.token = token;
    f.leggi = parametri => leggi(token, parametri);
    f.file = id => fetch(url + '/file/' + id, { headers: { Authorization: 'Bearer ' + token } });
    return f;
  }
  async function ponte(corpo, segreto) {
    const r = await fetch(url + '/ponte', {
      method: 'POST',
      headers: { 'X-Wisper-Segreto': segreto === undefined ? SEGRETO : segreto, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    return { stato: r.status, json: await r.json() };
  }
  return {
    url, urlIngresso, wisper, server, dati, chiama, leggi, accedi, come, ponte,
    ferma: async () => { await chiudi(server); if (ingresso) await chiudi(ingresso); wisper.chiudi(); },
  };
}

/**
 * Il postino finto in HTTP: risponde come lo script (docs/gestionale/postino.md)
 * e scrive su disco quello che il vero spedirebbe. rompi = true: risponde male.
 */
async function postinoFinto(segreto) {
  const cartella = cartellaNuova('postino');
  // rompi: tutto risponde male; rompiSolo: solo quell'azione (per vedere che l'avviso parte lo stesso).
  const stato = { rompi: false, rompiSolo: '', richieste: [] };
  const server = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', p => { corpo += p; });
    req.on('end', () => {
      let d = {};
      try { d = JSON.parse(corpo); } catch (e) { /* vuoto */ }
      stato.richieste.push({ azione: d.azione, scheda: d.scheda, cartella: d.cartella, nome: d.nome, alProprietario: d.alProprietario, oggetto: d.oggetto });
      let r;
      if (stato.rompi || (stato.rompiSolo && stato.rompiSolo === d.azione)) r = { ok: false, errore: 'Drive pieno (finto)' };
      else if (d.segreto !== (segreto || SEGRETO)) r = { ok: false, errore: 'Segreto sbagliato' };
      else r = scriviSuDisco(cartella, d);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
    });
  });
  const url = await ascolta(server);
  return Object.assign(stato, { url, cartella, ferma: () => chiudi(server) });
}

/**
 * Il servizio europeo VIES, finto: risponde come la sua API REST per i numeri
 * che conosce, dice "non valida" agli altri, e per 00000000000 non risponde.
 */
async function viesFinto() {
  const conosciute = {
    '01234567897': { name: 'MATERIALE ELETTRICO ESEMPIO S.R.L.', address: 'VIA DEI FORNITORI 3 \n36016 THIENE VI\n' },
    '09876543217': { name: 'NOLEGGI PIATTAFORME PROVA S.N.C.', address: 'VIA DELLE PROVE 5\n36015 SCHIO VI' },
  };
  const chiamate = [];
  const server = http.createServer((req, res) => {
    const m = req.url.match(/\/ms\/([A-Z]{2})\/vat\/([A-Z0-9]+)$/);
    chiamate.push(req.url);
    if (!m) { res.writeHead(404); return res.end('{}'); }
    if (m[2] === '00000000000') { res.writeHead(500); return res.end('{"errorWrappers":[{"error":"MS_UNAVAILABLE"}]}'); }
    const nota = conosciute[m[2]];
    const r = nota ? { isValid: true, userError: 'VALID', name: nota.name, address: nota.address, vatNumber: m[2] }
      : { isValid: false, userError: 'INVALID', name: '---', address: '---', vatNumber: m[2] };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r));
  });
  const url = await ascolta(server);
  return { url, chiamate, ferma: () => chiudi(server) };
}

/** Un PNG piccolissimo (1x1), per le foto e le firme di prova. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/**
 * Fase 7: le colonne che la migrazione 007 aggiunge a tabelle che c'erano gia', col loro valore di base (quello che vuol
 * dire "come prima": niente portale, avvisi per email accesi, notifiche sul telefono accese). Le prove delle migrazioni
 * di prima (003-006) le tolgono prima di confrontare le righe.
 */
const COLONNE_007 = {
  soggetti: { portale: 0, portale_regole: null, portale_importi: 0 },
  referenti: { portale: 0, portale_permessi: null, portale_sedi: null, portale_invitato_il: '', portale_dal: '', portale_tolto_il: '', ultimo_accesso: '',
    avvisi_email: 1, informativa_il: '', informativa_versione: '', pagamenti: 0, whatsapp: '', whatsapp_ok: 0, whatsapp_ok_il: '' },
  rapportini: { firma_modo: '', firma_prova: null, firma_referente_id: null },
  ticket: { portale_visibile: 0 },
  attivita: { avvisa_cliente: '', avvisa_referente_id: null },
  fatture: { solleciti_no: '', copia_file_id: null },
  documenti: { caricamento_id: null },
  utenti: { notifiche_telefono: 1 },
  preventivi: { accettazione_prova: null, accettato_referente_id: null },
  file: { caricamento_id: null },
};

/**
 * Fase 8: le colonne che la migrazione 008 aggiunge a tabelle che c'erano gia', col valore di base ("come prima": i
 * riquadri e le notifiche del ruolo, niente password iniziale da cambiare, copie senza conteggi, nessun accesso da fuori).
 */
const COLONNE_008 = {
  utenti: { riquadri: null, notifiche_tipi: null, notifiche_silenzio: 1, password_iniziale: 0, password_il: '' },
  copie: { conteggi: null, md5: null, cifrata: 0 },
  sessioni: { da_fuori: '' },
};

/** Le colonne nuove della 009 (i progetti, 03/11/2026), col loro valore di base. */
const COLONNE_009 = {
  rapportini: { id_progetto: null, progetto: '' },
};

/** Le colonne nuove dalla 007 in poi, insieme: le prove delle migrazioni di prima (003-007) le tolgono prima di confrontare. */
const COLONNE_DOPO_007 = {};
for (const gruppo of [COLONNE_007, COLONNE_008, COLONNE_009]) {
  for (const [t, c] of Object.entries(gruppo)) COLONNE_DOPO_007[t] = Object.assign({}, COLONNE_DOPO_007[t] || {}, c);
}

module.exports = {
  serverDiProva, postinoFinto, viesFinto, cartellaNuova, ascolta, chiudi, SEGRETO, PNG, giornoDeiPrototipi, GIORNO_DEI_PROTOTIPI, COLONNE_007,
  COLONNE_008, COLONNE_009, COLONNE_DOPO_007,
};
