// Il servizio VIES della Commissione europea imitato in Node, per provare il collegamento "Verifica della partita IVA"
// della fase 8 (fase8.md §4.2, §16) senza andare su internet. Il server di prova lo usa con WISPER_VIES_URL.
//
//   node pc/prove/finto-vies.js [porta] [--rotto]
//   GET /rompi    da adesso risponde 503 (il servizio "non risponde")
//   GET /ripara   da adesso risponde che la partita IVA è valida
//   GET /stato    { rotto, richieste }
//
// Solo dati di esempio: il nome e l'indirizzo che restituisce sono finti.
'use strict';

const http = require('node:http');

const arg = process.argv.slice(2);
const PORTA = Number(arg.find(a => /^\d+$/.test(a)) || 8748);
let rotto = arg.includes('--rotto');
let richieste = 0;

http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://localhost');
  const json = (o, s) => { rs.writeHead(s || 200, { 'Content-Type': 'application/json; charset=utf-8' }); rs.end(JSON.stringify(o)); };
  if (u.pathname === '/rompi') { rotto = true; return json({ ok: true, rotto }); }
  if (u.pathname === '/ripara') { rotto = false; return json({ ok: true, rotto }); }
  if (u.pathname === '/stato') return json({ ok: true, rotto, richieste });
  const m = u.pathname.match(/^\/ms\/([A-Z]{2})\/vat\/([A-Z0-9]+)$/);
  if (!m) return json({ errore: 'non trovato' }, 404);
  richieste++;
  if (rotto) return json({ userError: 'MS_UNAVAILABLE' }, 503);
  return json({ isValid: true, userError: 'VALID', name: 'STUDIO TECNICO DI ESEMPIO', address: 'VIA DELL\'ESEMPIO 1 \n36016 THIENE VI' });
}).listen(PORTA, '127.0.0.1', () => console.log('Finto VIES su http://127.0.0.1:' + PORTA + (rotto ? ' (rotto)' : '')));
