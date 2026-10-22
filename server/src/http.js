/*
 * Il server HTTP (node:http), che parla come lo script del foglio:
 *   GET  /exec?azione=...&...   letture
 *   POST /exec                  {"azione": "...", ...} (text/plain o application/json: si legge il corpo grezzo)
 *   GET  /file/<id>             il file in binario, col suo Content-Type
 *   GET  /salute                {"ok":true,"versione":"x.y.z","database":"ok"}, senza accesso (il controllo del NAS)
 *   POST /ponte                 le versioni vecchie, inoltrate dallo script (X-Wisper-Segreto)
 *   POST /carica?nome=&mime=&idFile=&per=documento|ticket   un file in byte (fase 5), col Bearer come /exec
 * Tutto il resto risponde sempre HTTP 200 con ok true/false; solo /file, /salute
 * e /ponte usano i codici HTTP.
 *
 * Su una seconda porta (--porta-condivisione, fase 5) un altro server risponde
 * SOLO a GET /condiviso/<token>: i link per i clienti, finche' non sono
 * collegati (CONDIVISIONE_INDIRIZZO vuoto) nessun link vale.
 */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const { esegui } = require('./richieste');
const { testo, idCasuale, adesso, Rifiuto, senzaPermesso, messaggio } = require('./utili');
const { riconosciTipo, tipoDaSalvare } = require('./documenti');

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
  // Fase 5: una revisione superata si scarica col nome che lo dice ("... (rev. 1, superata).pdf").
  const nome = w.nomeDaScaricare(f);
  res.writeHead(200, {
    'Content-Type': f.mime || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline; filename*=UTF-8\'\'' + encodeURIComponent(nome),
  });
  fs.createReadStream(percorso).pipe(res);
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
  const modulo = per === 'ticket' ? 'ticket' : per === 'documento' ? 'documenti' : '';
  if (!modulo) return rifiuta({ ok: false, errore: 'Per: documento o ticket' }, 'errore', s.utente);
  if ((permessi[modulo] || 0) < 2) {
    return rifiuta({ ok: false, errore: 'Non hai il permesso per ' + (per === 'ticket' ? 'caricare le foto dei ticket' : 'caricare documenti') + ': chiedi al titolare', permesso: false },
      'permesso negato', s.utente);
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
      w.inserisci('file', {
        id, nome: testo(q.nome).slice(0, 200) || id, mime, byte, sha256: hash.digest('hex'), percorso: id, tipo: 'caricato',
        id_client: testo(q.idFile) || null, caricato_da: s.utente.id, creato: adesso(),
      }, 'id', 'caricato con /carica');
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

module.exports = { creaServer, creaServerCondivisione, stessoSegreto };
