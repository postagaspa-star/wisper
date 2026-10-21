/*
 * Creare un utente dal NAS, prima che ci sia qualcuno che lo possa fare da
 * Amministrazione (accordo §3). La password si chiede da tastiera e non si
 * scrive da nessuna parte: nel database va solo lo scrypt.
 *
 *   node server/strumenti/utente.js --titolare "Nome Cognome" email [--dati <cartella>]
 *   node server/strumenti/utente.js --ruolo amministrazione "Nome Cognome" email [--dati <cartella>]
 *   node server/strumenti/utente.js --password email [--dati <cartella>]      (password nuova a chi c'e' gia')
 *
 * Nel contenitore: docker compose exec wisper node strumenti/utente.js --titolare "..." ...
 * (la cartella dei dati e' /data, quella di base).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { RUOLI } = require('../src/permessi');
const { adesso } = require('../src/utili');

/** La password da tastiera, senza mostrarla (o una riga da stdin, quando non c'e' un terminale: le prove). */
function chiedi(domanda, nascosta, righe) {
  if (righe) {
    process.stdout.write(domanda + '\n');
    return Promise.resolve(righe.shift() || '');
  }
  return new Promise(risolvi => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
    if (nascosta && process.stdin.isTTY) rl._writeToOutput = s => { if (s.indexOf(domanda) >= 0) rl.output.write(domanda); };
    rl.question(domanda, r => { rl.close(); if (nascosta && process.stdin.isTTY) process.stdout.write('\n'); risolvi(r); });
  });
}

/** Le righe di stdin quando arriva da una pipe (echo ... | node utente.js): una per domanda. */
function righeDaPipe() {
  if (process.stdin.isTTY) return null;
  try {
    return fs.readFileSync(0, 'utf8').split(/\r?\n/);
  } catch (e) {
    return null;
  }
}

async function principale(argv) {
  let ruolo = null;
  let cambia = false;
  let dati = process.env.WISPER_DATI || '/data';
  const resto = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--titolare') ruolo = 'titolare';
    else if (argv[i] === '--ruolo') ruolo = argv[++i];
    else if (argv[i] === '--password') cambia = true;
    else if (argv[i] === '--dati') dati = argv[++i];
    else resto.push(argv[i]);
  }
  const uso = 'Si usa: node server/strumenti/utente.js --titolare "Nome Cognome" email [--dati <cartella>]\n' +
    '   oppure: --ruolo <' + RUOLI.join('|') + '> "Nome Cognome" email, oppure: --password email';
  if (!cambia && (!ruolo || resto.length !== 2)) throw new Error(uso);
  if (cambia && resto.length !== 1) throw new Error(uso);
  if (ruolo && RUOLI.indexOf(ruolo) < 0) throw new Error('Ruolo sconosciuto: ' + ruolo + ' (' + RUOLI.join(', ') + ')');

  const { Wisper, SISTEMA } = require('../src/wisper');
  const { hashPassword, controllaPasswordNuova } = require('../src/azioni/accesso');
  const w = new Wisper({ dati: path.resolve(dati) });
  try {
    const email = (cambia ? resto[0] : resto[1]).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('Email non valida: ' + email);
    const esistente = w.db.riga('SELECT * FROM utenti WHERE email = ?', email);
    if (cambia && !esistente) throw new Error('Non c\'è nessun utente con l\'email ' + email);
    if (!cambia && esistente) throw new Error('C\'è già un utente con l\'email ' + email + ': per cambiargli la password usa --password ' + email);

    const righe = righeDaPipe();
    const p1 = await chiedi('Password (almeno 8 caratteri): ', true, righe);
    controllaPasswordNuova(p1);
    const p2 = await chiedi('Scrivila di nuovo: ', true, righe);
    if (p1 !== p2) throw new Error('Le due password non sono uguali: riprova');
    const hash = await hashPassword(p1);
    w.come(Object.assign({}, SISTEMA, { app: 'utente.js', dispNome: 'NAS' }), () => w.db.transazione(() => {
      if (cambia) {
        w.aggiorna('utenti', esistente.id, { password_hash: hash });
        w.db.esegui('UPDATE sessioni SET revocata = ? WHERE utente_id = ? AND revocata IS NULL', adesso(), esistente.id);
      } else {
        w.inserisci('utenti', { nome: resto[0].trim(), email, ruolo, password_hash: hash, attivo: 1, creato: adesso() });
      }
    }));
    console.log(cambia ? 'Password cambiata per ' + email + ': i suoi dispositivi dovranno entrare di nuovo.'
      : 'Creato ' + resto[0].trim() + ' (' + ruolo + ', ' + email + '). Può entrare da telefono e computer.');
  } finally {
    w.chiudi();
  }
}

if (require.main === module) {
  principale(process.argv.slice(2)).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { principale };
