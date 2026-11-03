/*
 * La copia fuori casa cifrata (fase 8, fase8.md §9.8). Oggi la copia del database su Drive si apre con qualunque SQLite;
 * con COPIA_CIFRATA accesa la copia fuori casa (database e file) parte cifrata con AES-256-GCM (node:crypto).
 *
 * Il file cifrato:
 *   "WISPERC1" (8 byte) · versione (1 byte, 1) · nonce (12 byte) · dati cifrati · tag (16 byte)
 * L'accordo scriveva "un'intestazione di 16 byte (WISPERC1, versione, nonce)": con il nonce di 12 byte (quello che GCM
 * vuole) l'intestazione e' di 21; si e' tenuto il nonce giusto (§18 dell'accordo).
 *
 * La chiave: 32 caratteri presi a caso fra 31 lettere e cifre senza 0/O/1/I/L, mostrati UNA volta in 8 gruppi di 4
 * ("K7QM-...") da scrivere su carta in due posti. Sono circa 158 bit: piu' che abbastanza. I 32 byte di AES-256 nascono
 * da li' con SHA-256, cosi' la chiave scritta a mano basta da sola a riaprire la copia (anche con il NAS perso).
 * Sta solo in /data/copia-chiave (permessi 600): mai nel database, nel foglio, nel registro, nelle copie.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAGIA = Buffer.from('WISPERC1', 'ascii');
const VERSIONE = 1;
const NONCE = 12;
const TAG = 16;
const INTESTAZIONE = MAGIA.length + 1 + NONCE;
const LEGGIBILI = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const NOME_FILE_CHIAVE = 'copia-chiave';

/** Una chiave nuova da scrivere su carta: 8 gruppi di 4, "K7QM-...". */
function nuovaChiave() {
  let s = '';
  while (s.length < 32) {
    const b = crypto.randomBytes(1)[0];
    if (b < 248) s += LEGGIBILI[b % LEGGIBILI.length];   // 248 = 8 x 31: nessuna lettera piu' probabile delle altre
  }
  return s.match(/.{4}/g).join('-');
}

/** La chiave come la scrive una persona (minuscole, spazi, trattini o no) -> le 32 lettere e cifre, o '' se non lo e'. */
function pulisciChiave(k) {
  const s = String(k === undefined || k === null ? '' : k).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 32) return '';
  for (const c of s) if (LEGGIBILI.indexOf(c) < 0) return '';
  return s;
}

/** I 32 byte di AES-256 dalla chiave scritta. */
function chiaveAes(k) {
  const pulita = pulisciChiave(k);
  if (!pulita) throw new Error('La chiave non apre questa copia: controlla di averla scritta giusta');
  return crypto.createHash('sha256').update('wisper-copia-1:' + pulita).digest();
}

function eCifrato(buf) {
  return Buffer.isBuffer(buf) && buf.length >= INTESTAZIONE + TAG && buf.subarray(0, MAGIA.length).equals(MAGIA);
}

function cifra(dati, chiave) {
  const nonce = crypto.randomBytes(NONCE);
  const c = crypto.createCipheriv('aes-256-gcm', chiaveAes(chiave), nonce);
  const corpo = Buffer.concat([c.update(dati), c.final()]);
  return Buffer.concat([MAGIA, Buffer.from([VERSIONE]), nonce, corpo, c.getAuthTag()]);
}

/** I byte in chiaro; con la chiave sbagliata (o il file toccato) l'errore della frase dell'accordo, e niente altro. */
function decifra(buf, chiave) {
  if (!eCifrato(buf)) throw new Error('Non è una copia cifrata di Wisper (manca WISPERC1 in testa)');
  if (buf[MAGIA.length] !== VERSIONE) throw new Error('Copia cifrata con una versione che questo Wisper non conosce (' + buf[MAGIA.length] + ')');
  const nonce = buf.subarray(MAGIA.length + 1, INTESTAZIONE);
  const tag = buf.subarray(buf.length - TAG);
  const corpo = buf.subarray(INTESTAZIONE, buf.length - TAG);
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', chiaveAes(chiave), nonce);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(corpo), d.final()]);
  } catch (err) {
    throw new Error('La chiave non apre questa copia: controlla di averla scritta giusta');
  }
}

// ------------------------------------------------------------------ la chiave sul NAS

function fileChiave(dati) {
  return path.join(dati, NOME_FILE_CHIAVE);
}

function leggiChiave(dati) {
  try {
    return pulisciChiave(fs.readFileSync(fileChiave(dati), 'utf8'));
  } catch (e) {
    return '';
  }
}

/** Scrive la chiave in /data/copia-chiave coi permessi 600 (su Windows i permessi non valgono: la cartella e' di chi la usa). */
function scriviChiave(dati, chiave) {
  const f = fileChiave(dati);
  fs.writeFileSync(f, pulisciChiave(chiave).match(/.{4}/g).join('-') + '\n', { mode: 0o600 });
  try { fs.chmodSync(f, 0o600); } catch (e) { /* Windows */ }
  return f;
}

module.exports = { nuovaChiave, pulisciChiave, chiaveAes, cifra, decifra, eCifrato, leggiChiave, scriviChiave, fileChiave, MAGIA, INTESTAZIONE, NOME_FILE_CHIAVE };
