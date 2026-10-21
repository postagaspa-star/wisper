/*
 * Il server HTTP (node:http), che parla come lo script del foglio:
 *   GET  /exec?azione=...&...   letture
 *   POST /exec                  {"azione": "...", ...} (text/plain o application/json: si legge il corpo grezzo)
 *   GET  /file/<id>             il file in binario, col suo Content-Type
 *   GET  /salute                {"ok":true,"versione":"x.y.z","database":"ok"}, senza accesso (il controllo del NAS)
 *   POST /ponte                 le versioni vecchie, inoltrate dallo script (X-Wisper-Segreto)
 * Tutto il resto risponde sempre HTTP 200 con ok true/false; solo /file, /salute
 * e /ponte usano i codici HTTP.
 */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const { esegui } = require('./richieste');
const { testo } = require('./utili');

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
 * @param opzioni  {segretoPonte}: SEGRETO_SERVER, lo stesso delle proprieta' dello script
 */
function creaServer(w, opzioni) {
  opzioni = opzioni || {};
  const server = http.createServer((req, res) => {
    gestisci(w, req, res, opzioni).catch(err => {
      console.error('[http] ' + (err && err.stack ? err.stack : err));
      if (!res.headersSent) rispondiJson(res, 500, { ok: false, errore: 'Errore del server: riprova' });
      else res.destroy();
    });
  });
  // Un documento grande da un telefono in cantiere puo' metterci qualche minuto ad arrivare.
  server.requestTimeout = 10 * 60 * 1000;
  return server;
}

async function gestisci(w, req, res, opzioni) {
  const url = new URL(req.url, 'http://localhost');
  const percorso = url.pathname.replace(/\/+$/, '') || '/';

  if (percorso === '/salute') {
    try {
      w.db.riga('SELECT 1 AS uno');
      return rispondiJson(res, 200, { ok: true, versione: w.versione, database: 'ok' });
    } catch (err) {
      return rispondiJson(res, 503, { ok: false, versione: w.versione, database: 'errore: ' + err.message });
    }
  }

  if (percorso.startsWith('/file/')) return mandaFile(w, req, res, decodeURIComponent(percorso.slice(6)));

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
    return rispondiJson(res, 200, await esegui(w, d, { token: tokenDa(req), get: req.method === 'GET' }));
  }

  return rispondiJson(res, 404, { ok: false, errore: 'Indirizzo sconosciuto: ' + percorso });
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
  const st = fs.statSync(percorso);
  res.writeHead(200, {
    'Content-Type': f.mime || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'private, max-age=86400',
    'Content-Disposition': 'inline; filename*=UTF-8\'\'' + encodeURIComponent(testo(f.nome) || f.id),
  });
  fs.createReadStream(percorso).pipe(res);
}

module.exports = { creaServer, stessoSegreto };
