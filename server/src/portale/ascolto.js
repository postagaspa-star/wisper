/*
 * L'ascolto locale del portale, SOLO in prova (avvio.js --prova --porta-portale <n>): parla il protocollo di §0.2 come
 * lo script del portale (Google), cosi' la pagina del portale si prova sul PC senza Google. Fuori da --prova il server
 * si rifiuta di partire con questa opzione: sul NAS il portale passa solo da Google (porta.js con soloPortale).
 *
 *   POST /         corpo JSON come testo {portale: 1, v, id, strada, metodo, sessione, pre, corpo, agente}
 *                  -> HTTP 200, JSON (la risposta del router con "stato"), Access-Control-Allow-Origin: *
 *   GET  /         una riga di testo (come doGet dello script)
 * Lo stesso controllo della forma dello script (portale 1, strada, corpo oggetto, al massimo 36 milioni di caratteri);
 * tutto il resto lo decide il router.
 */
'use strict';

const http = require('node:http');
const { lavoroDallaPagina } = require('./index');

const MASSIMO = 36000000;

function creaServerPortale(w) {
  const server = http.createServer((req, res) => {
    const manda = (testo, tipo) => {
      res.writeHead(200, { 'Content-Type': tipo || 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff' });
      res.end(testo);
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' });
      return res.end();
    }
    if (req.method !== 'POST') return manda('Portale clienti di Wisper (prova): le richieste vanno mandate con POST.', 'text/plain; charset=utf-8');
    const pezzi = [];
    let n = 0;
    let troppo = false;
    req.on('data', p => {
      n += p.length;
      if (n > MASSIMO) troppo = true;
      else pezzi.push(p);
    });
    req.on('end', async () => {
      if (troppo) return manda(JSON.stringify({ ok: false, errore: 'Richiesta non valida' }));
      let d = null;
      const testo = Buffer.concat(pezzi).toString('utf8');
      try { d = JSON.parse(testo); } catch (e) { d = null; }
      const lavoro = lavoroDallaPagina(d, testo.length);
      if (!lavoro) return manda(JSON.stringify({ ok: false, errore: 'Richiesta non valida' }));
      try {
        manda(JSON.stringify(await w.portale.richiesta(lavoro)));
      } catch (err) {
        console.error('[portale locale] ' + (err && err.stack ? err.stack : err));
        manda(JSON.stringify({ ok: false, stato: 503, errore: 'Il portale non risponde adesso. Riprova fra qualche minuto o chiama lo studio' }));
      }
    });
    req.on('error', () => res.destroy());
  });
  server.requestTimeout = 5 * 60 * 1000;
  return server;
}

module.exports = { creaServerPortale };
