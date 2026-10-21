#!/usr/bin/env node
/*
 * Scrive aggiornamento.json, l'elenco delle versioni che telefono e computer
 * leggono ogni ora per aggiornarsi da soli.
 *
 *   { "manifesto": "<json come testo>", "firma": "<base64>" }
 *
 * Il manifesto dice, per ognuno dei due programmi, la versione, da dove
 * scaricarla, quanto è grande e la sua impronta SHA-256. La firma (ECDSA P-256,
 * SHA-256) è fatta con la chiave privata in wisper-keys: le app hanno dentro
 * solo la pubblica, e un elenco senza firma valida lo ignorano.
 *
 * Uso:
 *   node strumenti/firma-aggiornamento.js --cartella DIR --indirizzo URL_BASE
 *        [--apk wisper.apk --codice 3 --nome 0.3.0] [--exe WisperUfficio.exe --versione-pc 0.3.0]
 *        [--chiave C:/Users/andre/wisper-keys/aggiornamenti-privata.pem]
 *
 * I file vanno già messi nella cartella DIR con il loro nome: l'indirizzo di
 * ognuno è URL_BASE + "/" + nome.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function argomenti(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    o[argv[i].slice(2)] = argv[i + 1];
    i++;
  }
  return o;
}

function descrivi(cartella, nome, indirizzo) {
  const file = path.join(cartella, nome);
  const dati = fs.readFileSync(file);
  return {
    url: indirizzo.replace(/\/+$/, '') + '/' + encodeURIComponent(nome),
    sha256: crypto.createHash('sha256').update(dati).digest('hex'),
    dimensione: dati.length,
  };
}

function main() {
  const a = argomenti(process.argv);
  if (!a.cartella || !a.indirizzo) throw new Error('servono --cartella e --indirizzo');
  const chiave = a.chiave || 'C:/Users/andre/wisper-keys/aggiornamenti-privata.pem';
  const manifesto = { creato: new Date().toISOString() };
  if (a.apk) {
    if (!/^\d+$/.test(a.codice || '') || !a.nome) throw new Error('per l\'APK servono --codice (numero) e --nome');
    manifesto.android = Object.assign({ codice: Number(a.codice), nome: a.nome }, descrivi(a.cartella, a.apk, a.indirizzo));
  }
  if (a.exe) {
    if (!/^\d+\.\d+\.\d+$/.test(a['versione-pc'] || '')) throw new Error('per l\'exe serve --versione-pc come 0.3.0');
    manifesto.computer = Object.assign({ versione: a['versione-pc'] }, descrivi(a.cartella, a.exe, a.indirizzo));
  }
  if (!manifesto.android && !manifesto.computer) throw new Error('niente da pubblicare: --apk o --exe');

  const testo = JSON.stringify(manifesto);
  const firma = crypto.sign('sha256', Buffer.from(testo, 'utf8'), { key: fs.readFileSync(chiave), dsaEncoding: 'der' });
  // Prima di scrivere, si controlla con la pubblica che la firma torni.
  const pubblica = crypto.createPublicKey(fs.readFileSync(chiave));
  if (!crypto.verify('sha256', Buffer.from(testo, 'utf8'), { key: pubblica, dsaEncoding: 'der' }, firma)) throw new Error('la firma non torna');

  const uscita = path.join(a.cartella, 'aggiornamento.json');
  fs.writeFileSync(uscita, JSON.stringify({ manifesto: testo, firma: firma.toString('base64') }, null, 2) + '\n');
  console.log('scritto ' + uscita);
  if (manifesto.android) console.log('  telefono ' + manifesto.android.nome + ' (' + manifesto.android.codice + '), ' + manifesto.android.dimensione + ' byte');
  if (manifesto.computer) console.log('  computer ' + manifesto.computer.versione + ', ' + manifesto.computer.dimensione + ' byte');
}

try {
  main();
} catch (e) {
  console.error('errore: ' + e.message);
  process.exit(1);
}
