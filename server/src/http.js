/*
 * Il server HTTP (node:http), che parla come lo script del foglio:
 *   GET  /exec?azione=...&...   letture
 *   POST /exec                  {"azione": "...", ...} (text/plain o application/json: si legge il corpo grezzo)
 *   GET  /file/<id>             il file in binario, col suo Content-Type
 *   GET  /salute                {"ok":true,"versione":"x.y.z","database":"ok"}, senza accesso (il controllo del NAS)
 *   POST /ponte                 le versioni vecchie, inoltrate dallo script (X-Wisper-Segreto)
 *   POST /carica?nome=&mime=&idFile=&per=documento|ticket   un file in byte (fase 5), col Bearer come /exec
 *   GET  /calendario/<chiave>.ics  il calendario in altre app (fase 8, §5.5): senza Bearer, la chiave e' il permesso
 *   GET  /esportazione/<id>    il file di Esporta tutto (fase 8, §7.1), col Bearer, solo chi l'ha chiesto
 * Le stesse strade arrivano anche dalla porta Google (porta.js): il server sul
 * NAS va a prendere le richieste dallo script del foglio e le passa qui con
 * richiestaInterna(), senza nessuna porta aperta (docs/gestionale/porta-google.md).
 * Tutto il resto risponde sempre HTTP 200 con ok true/false; solo /file, /salute
 * e /ponte usano i codici HTTP.
 *
 * Su una seconda porta (--porta-condivisione, fase 5) un altro server risponde
 * SOLO a GET /condiviso/<token>: i link per i clienti, finche' non sono
 * collegati (CONDIVISIONE_INDIRIZZO vuoto) nessun link vale.
 *
 * La porta dell'ingresso da internet (--porta-ingresso, sul NAS 8402, README
 * "Internet entrance") e' lo stesso server con due differenze: l'indirizzo di
 * chi chiama si legge da X-Forwarded-For (lo scrive il contenitore
 * wisper-ingresso, l'unico che raggiunge quella porta), e passano solo
 * /exec (GET e POST), /carica (POST), /file/<id> (GET), /salute (GET, senza
 * versione) e /ponte (POST) solo con WISPER_PONTE_DA_FUORI=si: tutto il resto
 * 404, anche se l'ingresso lo lasciasse passare.
 */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const { Readable, Writable } = require('node:stream');
const { esegui, AZIONI } = require('./richieste');
const { conRicordo } = require('./ricordo');
const { testo, idCasuale, adesso, Rifiuto, senzaPermesso, messaggio } = require('./utili');
const { riconosciTipo, tipoDaSalvare } = require('./documenti');
const { conProvenienza, provenienzaDi, provenienza } = require('./provenienza');

/** Una foto o un PDF in base64 arrivano a qualche MB; un documento grande a qualche decina. */
const MASSIMO_CORPO = 60 * 1024 * 1024;

function rispondiJson(res, stato, o) {
  const corpo = JSON.stringify(o);
  res.writeHead(stato, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(corpo), 'Cache-Control': 'no-store' });
  res.end(corpo);
}

function leggiCorpo(req) {
  return new Promise((risolvi, rifiuta) => {
    const pezzi = [];
    let n = 0;
    let troppo = false;
    req.on('data', p => {
      n += p.length;
      if (n > MASSIMO_CORPO) troppo = true;
      else pezzi.push(p);
    });
    req.on('end', () => risolvi(troppo ? null : Buffer.concat(pezzi).toString('utf8')));
    req.on('error', rifiuta);
  });
}

function tokenDa(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : '';
}

/** Due segreti uguali, senza che il tempo di risposta dica quante lettere sono giuste. */
function stessoSegreto(a, b) {
  if (!a || !b) return false;
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

/**
 * @param w        il server (wisper.js)
 * @param opzioni  {segretoPonte}: SEGRETO_SERVER, lo stesso delle proprieta' dello script;
 *                 {ingresso: {ponte}}: la porta dell'ingresso da internet (creaServerIngresso)
 */
function creaServer(w, opzioni) {
  opzioni = opzioni || {};
  const server = http.createServer((req, res) => {
    // Da dove arriva: lo leggono il registro degli accessi e i tentativi di accesso (provenienza.js).
    conProvenienza(provenienzaDi(req, !!opzioni.ingresso), () => gestisci(w, req, res, opzioni)).catch(err => {
      // Chi mandava ha chiuso a meta' (o l'ingresso ha fermato un corpo troppo grande): non c'e' piu' nessuno a cui rispondere.
      if (err && (err.code === 'ECONNRESET' || err.message === 'aborted')) {
        console.log('[http] richiesta interrotta da chi la mandava: ' + req.method + ' ' + String(req.url || '').split('?')[0]);
        return res.destroy();
      }
      console.error('[http] ' + (err && err.stack ? err.stack : err));
      if (!res.headersSent) rispondiJson(res, 500, { ok: false, errore: 'Errore del server: riprova' });
      else res.destroy();
    });
  });
  // Un documento grande da un telefono in cantiere puo' metterci qualche minuto ad arrivare.
  server.requestTimeout = 10 * 60 * 1000;
  return server;
}

/**
 * Il server della porta dell'ingresso da internet. Va ascoltato solo dove lo
 * raggiunge il contenitore d'ingresso (docker-compose: expose, mai ports).
 * @param opzioni  {segretoPonte, ponteDaFuori}: ponteDaFuori = WISPER_PONTE_DA_FUORI=si (le settimane del cambio)
 */
function creaServerIngresso(w, opzioni) {
  opzioni = opzioni || {};
  return creaServer(w, { segretoPonte: opzioni.segretoPonte, ingresso: { ponte: !!opzioni.ponteDaFuori } });
}

/** Le strade che da internet passano: metodo e percorso esatti (il percorso senza le barre in fondo). */
function stradaDaFuori(metodo, percorso, ingresso) {
  if (percorso === '/exec') return metodo === 'GET' || metodo === 'POST';
  if (percorso === '/carica') return metodo === 'POST';
  if (percorso === '/salute') return metodo === 'GET';
  if (/^\/file\/[A-Za-z0-9_-]{1,64}$/.test(percorso)) return metodo === 'GET';
  if (percorso === '/ponte') return metodo === 'POST' && !!(ingresso && ingresso.ponte);
  return false;
}

async function gestisci(w, req, res, opzioni) {
  const url = new URL(req.url, 'http://localhost');
  const percorso = url.pathname.replace(/\/+$/, '') || '/';

  // Fase 8 (§0.2): il server interno non deve essere su internet. Una richiesta sull'ingresso interno (8402: con la porta
  // Google il contenitore wisper-ingresso resta spento) o una sulla 8400 con le intestazioni di chi passa da internet e'
  // l'Errore di "internetinterno" (registro, voce urgente). Le richieste della porta Google (provenienza "google") no.
  if (opzioni.ingresso) w.segnalaInternetInterno('8402');
  else if (provenienza().ip !== 'google' && (req.headers['tailscale-funnel-request'] || req.headers['x-forwarded-for'])) w.segnalaInternetInterno('8400');

  // Da internet: solo le strade di telefono e computer, prima di leggere qualunque cosa. 404 uguale per tutto il resto.
  if (opzioni.ingresso && !stradaDaFuori(req.method, percorso, opzioni.ingresso)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end('Non trovato');
  }

  if (percorso === '/salute') {
    // Da internet senza la versione e senza il messaggio d'errore del database.
    const fuori = !!opzioni.ingresso;
    try {
      w.db.riga('SELECT 1 AS uno');
      if (fuori) return rispondiJson(res, 200, { ok: true, database: 'ok' });
      // Da casa anche il collegamento a Google e, se l'app la chiede, la firma che dice "sono proprio il server di Wisper".
      const o = { ok: true, versione: w.versione, database: 'ok', google: w.porta ? w.porta.stato() : { stato: 'non collegato', ultimoContatto: '' } };
      const firma = firmaDiCasa(w, url.searchParams.get('prova'), url.searchParams.get('chi'));
      if (firma) o.firma = firma;
      return rispondiJson(res, 200, o);
    } catch (err) {
      return rispondiJson(res, 503, fuori ? { ok: false, database: 'errore' } : { ok: false, versione: w.versione, database: 'errore: ' + err.message });
    }
  }

  if (percorso.startsWith('/file/')) return mandaFile(w, req, res, decodeURIComponent(percorso.slice(6)));

  // Fase 8: il calendario in altre app (in casa) e il file di Esporta tutto.
  if (percorso.startsWith('/calendario/')) return mandaCalendario(w, req, res, percorso);
  if (percorso.startsWith('/esportazione/')) return mandaEsportazione(w, req, res, percorso.slice('/esportazione/'.length));

  if (percorso === '/carica') return carica(w, req, res, url);

  if (percorso === '/ponte') {
    if (req.method !== 'POST') return rispondiJson(res, 405, { ok: false, errore: 'Il ponte vuole una POST' });
    if (!opzioni.segretoPonte) return rispondiJson(res, 403, { ok: false, errore: 'Ponte spento: manca SEGRETO_SERVER nel .env del server' });
    if (!stessoSegreto(req.headers['x-wisper-segreto'], opzioni.segretoPonte)) {
      await leggiCorpo(req);
      w.registraAccesso({ azione: 'ponte' }, 'segreto sbagliato', null);
      return rispondiJson(res, 403, { ok: false, errore: 'Segreto sbagliato' });
    }
    const d = analizza(await leggiCorpo(req));
    if (!d) return rispondiJson(res, 200, { ok: false, errore: 'Richiesta non valida' });
    // Lo script toglie gia' il codice e dice se la richiesta era una GET (metodo): qui non servono.
    delete d.codice;
    delete d.metodo;
    return rispondiJson(res, 200, await esegui(w, d, { ponte: true }));
  }

  if (percorso === '/exec' || percorso === '/') {
    let d;
    if (req.method === 'GET') {
      d = Object.fromEntries(url.searchParams);
    } else if (req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (corpo === null) return rispondiJson(res, 200, { ok: false, errore: 'Richiesta troppo grande (al massimo 60 MB): manda il file più piccolo' });
      d = analizza(corpo);
      if (!d) {
        w.registraAccesso({}, 'richiesta non valida', null);
        return rispondiJson(res, 200, { ok: false, errore: 'Richiesta non valida' });
      }
    } else {
      return rispondiJson(res, 405, { ok: false, errore: 'Solo GET e POST' });
    }
    // Il codice di prima non serve piu' e non deve finire da nessuna parte.
    delete d.codice;
    // idRichiesta: una scrittura ripetuta con lo stesso id (risposta persa per strada) non si rifa' (ricordo.js).
    const idRichiesta = req.method === 'POST' ? testo(d.idRichiesta) : '';
    delete d.idRichiesta;
    const token = tokenDa(req);
    const azione = testo(d.azione) || 'anagrafiche';
    const voce = Object.prototype.hasOwnProperty.call(AZIONI, azione) ? AZIONI[azione] : null;
    // Fase 8 (§0.3): schema e Host, per l'indirizzo del calendario "in casa" (dalla porta Google non valgono).
    const richiesta = { host: testo(req.headers.host), schema: testo(req.headers['x-forwarded-proto']) === 'https' ? 'https' : 'http', daGoogle: provenienza().ip === 'google' };
    return rispondiJson(res, 200, await conRicordo(w, idRichiesta, token, azione, voce, () => esegui(w, d, { token, get: req.method === 'GET', richiesta })));
  }

  return rispondiJson(res, 404, { ok: false, errore: 'Indirizzo sconosciuto: ' + percorso });
}

/**
 * La firma di casa (porta-google.md §8): l'app, prima di mandare il suo token in
 * chiaro sulla rete di casa, chiede /salute?prova=<testo a caso>&chi=<i primi 16
 * caratteri dello SHA-256 del suo token>. Solo il server vero conosce lo SHA-256
 * intero del token (lo tiene nella tabella sessioni) e puo' rispondere
 * firma = HMAC-SHA256(chiave: lo SHA-256 del token in esadecimale, messaggio: prova).
 * Un altro apparecchio che avesse lo stesso indirizzo su un'altra rete non sa farla.
 */
function firmaDiCasa(w, prova, chi) {
  prova = testo(prova);
  chi = testo(chi).toLowerCase();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(prova) || !/^[0-9a-f]{16}$/.test(chi)) return '';
  const s = w.db.riga(
    'SELECT s.token_hash FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE substr(s.token_hash, 1, 16) = ? AND s.revocata IS NULL AND u.attivo = 1 LIMIT 1', chi);
  return s ? crypto.createHmac('sha256', s.token_hash).update(prova).digest('hex') : '';
}

/**
 * Una richiesta fatta da dentro il server, senza rete: la porta Google (porta.js)
 * passa cosi' le richieste delle app allo stesso gestore di /exec, /carica,
 * /file/<id> e /ponte, con gli stessi permessi e lo stesso registro.
 * @param r  {metodo, percorso, query?: {..}, intestazioni?: {..}, corpo?: Buffer|string}
 * @param provenienza  {ip, daFuori}: per la porta Google {ip: 'google', daFuori: true}
 * @returns {stato, intestazioni, corpo: Buffer}
 */
async function richiestaInterna(w, opzioni, r, provenienza) {
  const corpo = r.corpo === undefined || r.corpo === null ? Buffer.alloc(0) : Buffer.isBuffer(r.corpo) ? r.corpo : Buffer.from(String(r.corpo), 'utf8');
  const req = Readable.from(corpo.length ? [corpo] : [], { objectMode: false });
  const query = r.query && Object.keys(r.query).length ? '?' + new URLSearchParams(r.query).toString() : '';
  req.method = r.metodo;
  req.url = r.percorso + query;
  req.headers = { 'content-length': String(corpo.length) };
  for (const k of Object.keys(r.intestazioni || {})) req.headers[k.toLowerCase()] = String(r.intestazioni[k]);
  req.socket = { remoteAddress: '' };
  const pezzi = [];
  let stato = 200;
  let intestazioni = {};
  const res = new Writable({
    write(pezzo, codifica, fatto) { pezzi.push(Buffer.isBuffer(pezzo) ? pezzo : Buffer.from(pezzo, codifica)); fatto(); },
  });
  res.headersSent = false;
  res.writeHead = (s, h) => { stato = s; intestazioni = h || {}; res.headersSent = true; return res; };
  const finita = new Promise(fatto => { res.on('finish', fatto); res.on('close', fatto); });
  await conProvenienza(provenienza || { ip: '', daFuori: false }, () => gestisci(w, req, res, opzioni || {}));
  await finita;
  return { stato, intestazioni, corpo: Buffer.concat(pezzi) };
}

function analizza(corpo) {
  if (corpo === null) return null;
  try {
    const d = JSON.parse(corpo || '{}');
    return d && typeof d === 'object' && !Array.isArray(d) ? d : null;
  } catch (e) {
    return null;
  }
}

/** /file/<id>: qui i codici HTTP servono (le immagini si caricano da sole, senza leggere il JSON). */
async function mandaFile(w, req, res, id) {
  const s = w.utenteDaToken(tokenDa(req));
  const perRegistro = { azione: 'file', disp: req.headers['x-wisper-disp'], dispNome: req.headers['x-wisper-disp-nome'], app: req.headers['x-wisper-app'] };
  if (!s) {
    w.registraAccesso(perRegistro, 'accesso negato', null);
    return rispondiJson(res, 401, { ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false });
  }
  perRegistro.disp = perRegistro.disp || s.disp;
  perRegistro.dispNome = perRegistro.dispNome || s.dispNome;
  perRegistro.app = perRegistro.app || s.app;
  const f = /^[A-Za-z0-9_-]+$/.test(id) ? w.db.riga('SELECT * FROM file WHERE id = ?', id) : null;
  if (!f || f.cestinato) return rispondiJson(res, 404, { ok: false, errore: 'File non trovato' });
  const permessi = w.permessiDi(s.utente.ruolo);
  const puo = w.come({ utente: s.utente, permessi, sessione: s.sessione, azione: 'file' }, () => w.puoLeggereFile(f));
  if (!puo) {
    w.registraAccesso(perRegistro, 'permesso negato', s.utente);
    return rispondiJson(res, 403, { ok: false, errore: 'Non hai il permesso per vedere questo file', permesso: false });
  }
  const percorso = f.percorso ? w.percorsoFile(f.percorso) : '';
  if (!percorso || !fs.existsSync(percorso)) {
    return rispondiJson(res, 404, { ok: false, errore: 'Il file non è ancora stato copiato da Drive' });
  }
  w.registraAccesso(perRegistro, 'ok', s.utente);
  // Fase 6: chi scarica un documento riservato di un'altra persona lascia una riga in accessi_riservati.
  try { w.come({ utente: s.utente, permessi, sessione: s.sessione, azione: 'file', disp: perRegistro.disp, dispNome: perRegistro.dispNome }, () => w.notaScaricoRiservato(f)); } catch (e) { /* non ferma il file */ }
  const st = fs.statSync(percorso);
  // Fase 5: una revisione superata si scarica col nome che lo dice ("... (rev. 1, superata).pdf").
  const nome = w.nomeDaScaricare(f);
  res.writeHead(200, {
    'Content-Type': f.mime || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    // Fase 7 (§3.11): un file arrivato dal portale si scarica sempre (le immagini si mostrano come immagini).
    'Content-Disposition': (f.tipo === 'portale' && ['image/png', 'image/jpeg'].indexOf(f.mime) < 0 ? 'attachment' : 'inline') + '; filename*=UTF-8\'\'' + encodeURIComponent(nome),
  });
  fs.createReadStream(percorso).pipe(res);
}

// ------------------------------------------------------------------ /calendario/<chiave>.ics e /esportazione/<id> (fase 8)

/**
 * GET /calendario/<chiave>.ics (§5.5): 200 text/calendar con ETag e Last-Modified, 304 se non e' cambiato niente, 404
 * uguale per chiave sconosciuta, tolta o di un utente disattivato, 429 oltre 60 letture all'ora. Nel registro degli
 * accessi l'azione "calendario" con l'esito, mai la chiave.
 */
function mandaCalendario(w, req, res, percorso) {
  const m = percorso.match(/^\/calendario\/([A-Za-z0-9_-]{20,100})\.ics$/);
  const intestazioni = { 'Cache-Control': 'private, max-age=0', 'X-Content-Type-Options': 'nosniff' };
  const perRegistro = { azione: 'calendario', app: 'calendario', dispNome: testo(req.headers['user-agent']).slice(0, 60) };
  if (req.method !== 'GET' || !m) {
    w.registraAccesso(perRegistro, 'non trovato', null);
    res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, intestazioni));
    return res.end('Non trovato');
  }
  let r;
  try {
    r = w.leggiFeedCalendario(m[1], { agente: req.headers['user-agent'], seNonCambiato: req.headers['if-none-match'] });
  } catch (err) {
    console.error('[calendario] ' + (err && err.stack ? err.stack : err));
    r = { stato: 500 };
  }
  w.registraAccesso(perRegistro, r.stato === 200 || r.stato === 304 ? 'ok' : r.stato === 429 ? 'troppe letture' : r.stato === 404 ? 'non trovato' : 'errore', r.utente || null);
  if (r.stato === 304) {
    res.writeHead(304, Object.assign({ ETag: r.etag }, intestazioni));
    return res.end();
  }
  if (r.stato !== 200) {
    res.writeHead(r.stato, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, intestazioni));
    return res.end(r.stato === 429 ? 'Troppe letture: riprova fra un\'ora' : r.stato === 404 ? 'Non trovato' : 'Errore del server');
  }
  const corpo = Buffer.from(r.ics, 'utf8');
  res.writeHead(200, Object.assign({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Length': corpo.length, ETag: r.etag, 'Last-Modified': r.ultimaModifica }, intestazioni));
  return res.end(corpo);
}

/** GET /esportazione/<id> col Bearer: lo ZIP di Esporta tutto, solo per chi l'ha chiesto. */
function mandaEsportazione(w, req, res, id) {
  const s = w.utenteDaToken(tokenDa(req));
  const perRegistro = { azione: 'esportazione', disp: req.headers['x-wisper-disp'], dispNome: req.headers['x-wisper-disp-nome'], app: req.headers['x-wisper-app'] };
  if (!s) {
    w.registraAccesso(perRegistro, 'accesso negato', null);
    return rispondiJson(res, 401, { ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false });
  }
  const f = req.method === 'GET' && /^\d{1,10}$/.test(id) ? w.fileEsportazione(id, s.utente) : null;
  if (!f) {
    w.registraAccesso(perRegistro, 'non trovato', s.utente);
    return rispondiJson(res, 404, { ok: false, errore: 'Il file non c\'è più: preparane uno nuovo' });
  }
  w.registraAccesso(perRegistro, 'ok', s.utente);
  res.writeHead(200, {
    'Content-Type': 'application/zip', 'Content-Length': fs.statSync(f.percorso).size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(f.nome),
  });
  fs.createReadStream(f.percorso).pipe(res);
  return undefined;
}

// ------------------------------------------------------------------ /carica (fase 5, fase5.md §5.4)

/** Legge e butta via il resto di una richiesta (per rispondere senza far cadere chi sta ancora mandando). */
function scarta(req) {
  return new Promise(r => {
    if (req.complete || req.readableEnded) return r();
    req.on('end', r);
    req.on('error', r);
    req.on('close', r);
    req.resume();
  });
}

/**
 * POST /carica?nome=<nome>&mime=<mime>&idFile=<idFile>&per=<documento|ticket>
 * col Bearer e il file nel corpo. Si scrive su disco mentre arriva
 * (<dati>/file/<id>.scrivendo, poi si rinomina), contando i byte e facendo lo
 * SHA-256; oltre FILE_MAX_MB ci si ferma e non resta niente. Il tipo si
 * controlla sui primi byte. Il file nasce "caricato": lo legano
 * salvaDocumento, caricaVersione o caricaFile {tipo: "ticket", idFileCaricato}.
 * Risposte come /exec: HTTP 200 con ok true/false.
 */
async function carica(w, req, res, url) {
  const q = Object.fromEntries(url.searchParams);
  const perRegistro = { azione: 'carica', disp: req.headers['x-wisper-disp'], dispNome: req.headers['x-wisper-disp-nome'], app: req.headers['x-wisper-app'] };
  if (req.method !== 'POST') {
    await scarta(req);
    return rispondiJson(res, 405, { ok: false, errore: 'Il caricamento vuole una POST' });
  }
  const massimo = w.fileMaxByte();
  const dichiarati = Number(req.headers['content-length'] || 0);
  /**
   * Una risposta d'errore. Il resto della richiesta si legge e si butta (come
   * /exec con un corpo troppo grande): chi sta ancora mandando riceve la
   * risposta invece di una connessione caduta, e la sua coda sa che non serve riprovare.
   */
  const rifiuta = async (o, esito, utente) => {
    w.registraAccesso(perRegistro, esito || 'errore', utente || null);
    await scarta(req);
    rispondiJson(res, 200, o);
  };
  const s = w.utenteDaToken(tokenDa(req));
  if (!s) return rifiuta({ ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false }, 'accesso negato');
  perRegistro.disp = perRegistro.disp || s.disp;
  perRegistro.dispNome = perRegistro.dispNome || s.dispNome;
  perRegistro.app = perRegistro.app || s.app;
  const permessi = w.permessiDi(s.utente.ruolo);
  const chi = { utente: s.utente, permessi, sessione: s.sessione, azione: 'carica', disp: testo(perRegistro.disp), dispNome: testo(perRegistro.dispNome), app: testo(perRegistro.app) };
  const per = testo(q.per) || 'documento';
  // Fase 6: per=persona (documenti personali e riservati), mezzo, attrezzatura (certificati di taratura), collaboratore.
  const MODULI_PER = { ticket: 'ticket', documento: 'documenti', persona: 'persone', mezzo: 'mezzi', attrezzatura: 'mezzi', collaboratore: 'collaboratori' };
  const COSA_PER = { ticket: 'caricare le foto dei ticket', documento: 'caricare documenti', persona: 'caricare i documenti delle persone', mezzo: 'caricare i documenti dei mezzi',
    attrezzatura: 'caricare i certificati degli strumenti', collaboratore: 'caricare i documenti dei collaboratori' };
  const modulo = MODULI_PER[per] || '';
  if (!modulo) return rifiuta({ ok: false, errore: 'Per: documento, ticket, persona, mezzo, attrezzatura o collaboratore' }, 'errore', s.utente);
  // L'esterno carica solo i suoi documenti (per=collaboratore, anche con collaboratori 1) e le foto dei suoi ticket.
  const esterno = s.utente.ruolo === 'esterno';
  const puo = esterno ? (per === 'collaboratore' || (per === 'ticket' && (permessi.ticket || 0) >= 2)) : (permessi[modulo] || 0) >= 2;
  if (!puo) {
    return rifiuta({ ok: false, errore: 'Non hai il permesso per ' + COSA_PER[per] + ': chiedi al titolare', permesso: false }, 'permesso negato', s.utente);
  }
  // La coda del telefono che ripete: lo stesso idFile restituisce lo stesso file, senza riscriverlo.
  const gia = w.come(chi, () => w.fileCaricatoGia(q.idFile, s.utente.id));
  if (gia) {
    await scarta(req);
    w.registraAccesso(perRegistro, 'ok', s.utente);
    return rispondiJson(res, 200, w.come(chi, () => w.rispostaCarica(gia)));
  }
  try {
    w.come(chi, () => w.controllaSpazio('documento'));
  } catch (err) {
    return rifiuta(Object.assign({ ok: false, errore: err.message }, err.extra || {}), 'errore', s.utente);
  }
  const frase = () => 'Il file è più grande di ' + Math.round(massimo / 1048576) + ' MB: non si carica';
  if (dichiarati > massimo) return rifiuta({ ok: false, errore: frase() }, 'errore', s.utente);

  const id = idCasuale();
  const finale = w.percorsoFile(id);
  const temporaneo = finale + '.scrivendo';
  const hash = crypto.createHash('sha256');
  const scrittura = fs.createWriteStream(temporaneo);
  let byte = 0;
  let primi = Buffer.alloc(0);
  let fermo = '';
  let errore = null;
  scrittura.on('error', e => { errore = e; });
  await new Promise(fine => {
    req.on('data', pezzo => {
      if (fermo) return;
      byte += pezzo.length;
      if (byte > massimo) { fermo = frase(); return; }
      if (primi.length < 512) {
        primi = Buffer.concat([primi, pezzo.subarray(0, 512 - primi.length)]);
        if (primi.length >= 16 && riconosciTipo(primi).vietato) {
          try { tipoDaSalvare(q.mime, primi); } catch (e) { fermo = e.message; return; }
        }
      }
      hash.update(pezzo);
      if (!scrittura.write(pezzo)) {
        req.pause();
        scrittura.once('drain', () => req.resume());
      }
    });
    req.on('end', fine);
    req.on('error', e => { errore = errore || e; fine(); });
    req.on('aborted', () => { errore = errore || new Error('caricamento interrotto'); fine(); });
  });
  await new Promise(r => scrittura.end(r));
  const togli = () => { try { fs.rmSync(temporaneo, { force: true }); } catch (e) { /* niente */ } };
  if (fermo || errore || !byte) {
    togli();
    w.registraAccesso(perRegistro, 'errore', s.utente);
    if (res.writableEnded || req.destroyed && errore) return undefined;
    return rispondiJson(res, 200, { ok: false, errore: fermo || (!byte && !errore ? 'File vuoto' : 'Il file non è arrivato tutto: riprova') });
  }
  let mime;
  try {
    mime = tipoDaSalvare(q.mime, primi);
  } catch (err) {
    togli();
    w.registraAccesso(perRegistro, 'errore', s.utente);
    return rispondiJson(res, 200, { ok: false, errore: err.message });
  }
  try {
    fs.renameSync(temporaneo, finale);
    const risposta = await w.come(chi, async () => w.db.transazione(() => {
      const riga = {
        id, nome: testo(q.nome).slice(0, 200) || id, mime, byte, sha256: hash.digest('hex'), percorso: id, tipo: 'caricato',
        id_client: testo(q.idFile) || null, caricato_da: s.utente.id, creato: adesso(),
      };
      // Fase 6: il nome di un documento personale non va nel registro (dice gia' molto: "cedolino settembre").
      if (per === 'persona') w.inserisciFileRiservato(riga, 'caricato con /carica (documento di una persona)');
      else w.inserisci('file', riga, 'id', 'caricato con /carica');
      return w.rispostaCarica(w.db.riga('SELECT * FROM file WHERE id = ?', id));
    }));
    w.registraAccesso(perRegistro, 'ok', s.utente);
    return rispondiJson(res, 200, risposta);
  } catch (err) {
    try { fs.rmSync(finale, { force: true }); } catch (e) { /* niente */ }
    togli();
    console.error('[carica] ' + (err && err.stack ? err.stack : err));
    w.registraAccesso(perRegistro, 'errore', s.utente);
    return rispondiJson(res, 200, { ok: false, errore: err instanceof Rifiuto ? err.message : 'Errore del server: ' + messaggio(err) });
  }
}

// ------------------------------------------------------------------ /condiviso/<token> (la seconda porta, fase 5 §5.8)

const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));

function paginaCondivisa(stato, titolo, corpo) {
  return '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + esc(titolo) + '</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:32px 16px;background:#f6f6f4;color:#1b1b1f}' +
    'main{max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 8px}' +
    'p{color:#55555c}a.scarica{display:inline-block;margin-top:16px;background:#ffc53d;color:#1b1b1f;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:12px}</style>' +
    '</head><body><main>' + corpo + '</main></body></html>';
}

/** Il server della seconda porta: solo /condiviso/<token> (pagina) e /condiviso/<token>/scarica (il file). */
function creaServerCondivisione(w) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const m = url.pathname.match(/^\/condiviso\/([A-Za-z0-9_-]+)(\/scarica)?\/?$/);
    const nonVale = () => {
      const html = paginaCondivisa(404, 'Questo link non vale più', '<h1>Questo link non vale più</h1><p>È scaduto o è stato revocato. Chiedi allo studio di mandarti il documento di nuovo.</p>');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(html);
    };
    if (req.method !== 'GET' || !m) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Non trovato');
    }
    let a;
    try {
      a = w.aperturaCondivisa(m[1], !m[2]);
    } catch (e) {
      a = null;
    }
    if (!a) return nonVale();
    if (!m[2]) {
      const html = paginaCondivisa(200, a.documento.titolo, '<p>' + esc(a.studio) + '</p><h1>' + esc(a.documento.titolo) + '</h1><p>' + esc(a.versione.nome_file) +
        ' · rev. ' + a.versione.numero + '</p><a class="scarica" href="/condiviso/' + esc(m[1]) + '/scarica">Scarica</a>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      return res.end(html);
    }
    const percorso = w.percorsoFile(a.file.percorso);
    if (!fs.existsSync(percorso)) return nonVale();
    res.writeHead(200, {
      'Content-Type': a.versione.mime || 'application/octet-stream', 'Content-Length': fs.statSync(percorso).size, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(a.versione.nome_file || 'documento'),
    });
    fs.createReadStream(percorso).pipe(res);
    return undefined;
  });
}

module.exports = { creaServer, creaServerIngresso, creaServerCondivisione, stessoSegreto, stradaDaFuori, richiestaInterna, firmaDiCasa };
