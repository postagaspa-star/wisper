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

// Pulizia del disco. Ogni prova crea cartelle in %TEMP% (database, posta finta) e prima restavano tutte: il
// 06/11/2026 erano 12.194 cartelle wisper-* per 29 GB, con il disco C al 99%. Ora le cartelle fatte da cartellaNuova
// le toglie il processo stesso quando finisce. WISPER_TIENI_CARTELLE=1 le tiene (per capire una prova che fallisce).
const tieniCartelle = !!process.env.WISPER_TIENI_CARTELLE;
const cartelleDaTogliere = [];
process.on('exit', () => {
  for (const c of cartelleDaTogliere.splice(0)) {
    try { fs.rmSync(c, { recursive: true, force: true }); } catch (e) { /* ancora aperta: resta */ }
  }
});

function cartellaNuova(nome) {
  const c = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-' + (nome || 'prove') + '-'));
  if (!tieniCartelle) cartelleDaTogliere.push(c);
  return c;
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

/**
 * Le colonne nuove della 011 (06/11/2026, il rapportino con piu' lavori) dopo la 012 (07/11/2026): le righe di prima dello
 * stesso giorno e della stessa persona sono i lavori di un rapportino solo, col numero della prima scritta, in fila
 * nell'ordine in cui sono state scritte; una riga senza data resta da sola. Un valore funzione si calcola dalla riga e
 * da tutte le righe di prima della tabella (valoreAtteso).
 */
function giornataAttesa(r, righe) {
  const chiave = x => [x.data, x.utente_id === null || x.utente_id === undefined ? '' : x.utente_id, String(x.tecnico || '').trim().toLowerCase()].join('|');
  if (!r.data || !righe) return { id: r.id, posizione: 1 };
  const stesso = righe.filter(x => x.data && chiave(x) === chiave(r))
    .sort((a, b) => String(a.creato || '').localeCompare(String(b.creato || '')) || String(a.id).localeCompare(String(b.id)));
  return { id: stesso[0].id, posizione: stesso.findIndex(x => x.id === r.id) + 1 };
}
const COLONNE_011 = {
  rapportini: { id_giornata: (r, righe) => giornataAttesa(r, righe).id, posizione: (r, righe) => giornataAttesa(r, righe).posizione },
};

/** Il valore di base atteso di una colonna nuova in quella riga (un numero, un testo, o una funzione della riga e delle righe di prima). */
function valoreAtteso(v, riga, righe) {
  return typeof v === 'function' ? v(riga, righe) : v;
}

/** Le colonne nuove dalla 007 in poi, insieme: le prove delle migrazioni di prima (003-007) le tolgono prima di confrontare. */
const COLONNE_DOPO_007 = {};
for (const gruppo of [COLONNE_007, COLONNE_008, COLONNE_009, COLONNE_011]) {
  for (const [t, c] of Object.entries(gruppo)) COLONNE_DOPO_007[t] = Object.assign({}, COLONNE_DOPO_007[t] || {}, c);
}

/**
 * 06/11/2026 (il rapportino con piu' lavori, senza firma, rapportino-lavori.md): i numeri della Dashboard di prima coi soli
 * cambi voluti. Le bozze non sono piu' "da far firmare" (daFirmare 0): sono Da inviare insieme ai firmati (daMandare, e
 * daInviare), e si fatturano (rapportini.daFatturare; nei soldi Da fatturare, dei mesi scorsi e i clienti); Wisper non propone
 * piu' il messaggio "rapportino da firmare" (comunicazioni.proposti: meno quelli che la regola di prima, §9.5 della fase 7,
 * avrebbe proposto: bozze di piu' di 7 giorni con un cliente che ha un recapito, non gia' usate). Le differenze si
 * contano sulle righe del database (e sulle voci pronte di sorgentiDaFatturare per gli euro), non col codice della Dashboard.
 * Va chiamata come il titolare (vede tutto), con l'orologio della prova.
 */
function numeriDashboardDopoLavori(numeri, w) {
  const mese = require('../src/utili').oggi().slice(0, 7);
  const out = JSON.parse(JSON.stringify(numeri));
  const bozze = w.db.righe("SELECT * FROM rapportini WHERE UPPER(stato) <> 'ANNULLATO' AND UPPER(stato) IN ('', 'BOZZA')");
  const trattenuti = new Set(w.db.righe("SELECT id FROM ticket WHERE stato IN ('aperto', 'in_carico', 'in_attesa', 'risolto') OR (stato = 'chiuso' AND fatturazione IN ('contratto', 'no'))").map(x => x.id));
  if (out.rapportini) {
    const daInviare = out.rapportini.daMandare + bozze.filter(r => r.stato_approvazione !== 'da_approvare' && r.stato_approvazione !== 'respinto').length;
    out.rapportini.daFirmare = 0;
    out.rapportini.daMandare = daInviare;
    out.rapportini.daInviare = daInviare;
    out.rapportini.daFatturare += bozze.filter(r => !(r.ticket_id && trattenuti.has(r.ticket_id))).length;
  }
  if (out.comunicazioni && typeof out.comunicazioni.proposti === 'number') {
    const u = require('../src/utili');
    const settimanaFa = u.piuGiorni(u.oggi(), -7);
    const usate = new Set(w.db.righe("SELECT DISTINCT proposta FROM comunicazioni WHERE proposta <> ''").map(r => r.proposta));
    const conRecapito = id => w.db.righe('SELECT * FROM referenti WHERE soggetto_id = ?', id).some(x => (x.telefono || '') + (x.whatsapp || '') + (x.email || '') !== '');
    const diPrima = bozze.filter(r => r.data < settimanaFa && r.id_cliente && !usate.has('rapportino:' + r.id) && conRecapito(r.id_cliente));
    out.comunicazioni.proposti -= diPrima.length;
  }
  if (out.soldi && 'fattureInBozza' in out.soldi) {
    const voci = w.sorgentiDaFatturare({}).filter(v => v.pronta);
    const inBozza = new Set(bozze.map(r => r.id));
    const nuove = voci.filter(v => v.tipo === 'rapportino' && inBozza.has(v.id));
    const euro = l => l.reduce((s, v) => s + v.importo, 0);
    const cent = n => Math.round(n * 100) / 100;
    out.soldi.daFatturare = cent(out.soldi.daFatturare + euro(nuove));
    out.soldi.daFatturareMesiPrima = cent(out.soldi.daFatturareMesiPrima + euro(nuove.filter(v => v.data && v.data.slice(0, 7) < mese)));
    out.soldi.clientiDaFatturare = new Set(voci.map(v => v.idCliente)).size;
    if (out.soldi.clientiDaFatturare < numeri.soldi.clientiDaFatturare) throw new Error('meno clienti da fatturare di prima');
  }
  return out;
}

/**
 * 07/11/2026 (Manuel: "le Ore vanno tolte, non servono, metti solamente i Rapportini"): i numeri della Dashboard di prima
 * coi soli cambi voluti delle Ore. Le righe della tabella ore non sono piu' fra le cose da approvare (approvare.voci: meno
 * quelle da approvare) e non contano piu' nelle ore del giorno (approvare.conAnomalie: meno le righe di ore che con la
 * regola di prima avevano un'anomalia, "troppe ore" o "in un giorno di assenza", e meno i rapportini che avevano "troppe
 * ore" solo per le ore registrate dello stesso giorno e ora non hanno anomalie). Le righe si contano sul database con la
 * regola di prima (ORE_GIORNALIERE + 4, ore da approvare o approvate + rapportini non annullati), non col codice nuovo.
 * Va chiamata come il titolare (vede tutto), con l'orologio della prova.
 */
function numeriDashboardSenzaOre(numeri, w) {
  const { numero, dataIso } = require('../src/utili');
  const out = JSON.parse(JSON.stringify(numeri));
  if (!out.approvare) return out;
  const soglia = (numero(w.leggiImpostazioni().ORE_GIORNALIERE) || 8) + 4;
  const k = (u, g) => u + '|' + g;
  const registrate = {};
  const deiRapportini = {};
  for (const o of w.db.righe("SELECT utente_id, data, ore FROM ore WHERE tolta IS NULL AND stato IN ('da_approvare', 'approvata')")) {
    registrate[k(o.utente_id, o.data)] = (registrate[k(o.utente_id, o.data)] || 0) + numero(o.ore);
  }
  for (const r of w.db.righe("SELECT utente_id, data, ore_lavoro, ore_extra, ore_viaggio, ore_totali FROM rapportini WHERE UPPER(stato) <> 'ANNULLATO'")) {
    const x = k(r.utente_id, dataIso(r.data));
    deiRapportini[x] = (deiRapportini[x] || 0) + (numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio));
  }
  const troppePrima = (u, g) => Math.round(((registrate[k(u, g)] || 0) + (deiRapportini[k(u, g)] || 0)) * 100) / 100 > soglia;
  const persona = {};
  w.db.righe('SELECT id, utente_id FROM persone WHERE utente_id IS NOT NULL').forEach(p => { persona[p.utente_id] = p.id; });
  const ore = w.db.righe("SELECT utente_id, data FROM ore WHERE stato = 'da_approvare' AND tolta IS NULL");
  const conAnomaliaPrima = o => troppePrima(o.utente_id, o.data) || !!(persona[o.utente_id] && w.giornoNonLavorato(persona[o.utente_id], o.data));
  const rapportiniSenzaPiu = [].concat(...w.daApprovare().persone.map(p => p.voci))
    .filter(v => v.tipo === 'rapportino' && !v.anomalie.length && troppePrima(v.idUtente, v.data));
  out.approvare.voci -= ore.length;
  out.approvare.conAnomalie -= ore.filter(conAnomaliaPrima).length + rapportiniSenzaPiu.length;
  return out;
}

module.exports = {
  numeriDashboardDopoLavori, numeriDashboardSenzaOre,
  serverDiProva, postinoFinto, viesFinto, cartellaNuova, ascolta, chiudi, SEGRETO, PNG, giornoDeiPrototipi, GIORNO_DEI_PROTOTIPI, COLONNE_007,
  COLONNE_008, COLONNE_009, COLONNE_011, COLONNE_DOPO_007, valoreAtteso,
};
