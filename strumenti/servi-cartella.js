// Serve una cartella del repository in HTTP, per guardare prototipi e pagine nel browser.
//   node strumenti/servi-cartella.js <cartella> [porta]
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const radice = path.resolve(process.argv[2] || '.');
const porta = Number(process.argv[3] || 8791);
const tipi = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.json': 'application/json' };

http.createServer((req, res) => {
  const percorso = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([\\/])+/, '');
  const file = path.join(radice, percorso || 'index.html');
  if (!file.startsWith(radice)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, dati) => {
    if (err) { res.writeHead(404); return res.end('Non trovato'); }
    res.writeHead(200, { 'Content-Type': tipi[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(dati);
  });
}).listen(porta, '127.0.0.1', () => console.log('http://localhost:' + porta + '/'));
