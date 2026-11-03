/*
 * Da dove arriva una richiesta: l'indirizzo di chi chiama e se e' passata
 * dall'ingresso da internet (il contenitore wisper-ingresso, README "Internet
 * entrance").
 *
 *  - Porta di casa (8400): l'indirizzo e' quello della connessione. Le
 *    intestazioni X-Forwarded-For e simili NON si leggono mai: chiunque in casa
 *    (o chi arrivasse da fuori sulla 8400) potrebbe scriverci quello che vuole.
 *  - Porta dell'ingresso (--porta-ingresso, sul NAS 8402): la raggiunge solo il
 *    contenitore d'ingresso, dentro la rete Docker del progetto (expose, mai
 *    ports). Li' l'indirizzo vero e' l'ultimo di X-Forwarded-For, che l'ingresso
 *    riscrive sempre con l'indirizzo di chi gli ha aperto la connessione.
 *
 *  - Porta Google (porta.js): le richieste che il server va a prendere dallo
 *    script del foglio. Apps Script non dice l'indirizzo di chi chiama: la
 *    provenienza e' {ip: "google", daFuori: true} (accedi la conta a parte).
 *
 * La provenienza viaggia con AsyncLocalStorage (come chi() in wisper.js, ma
 * separata: w.come() non la cancella). La leggono il registro degli accessi e
 * accedi (i tentativi sbagliati); mai dal corpo della richiesta.
 */
'use strict';

const net = require('node:net');
const { AsyncLocalStorage } = require('node:async_hooks');

const archivio = new AsyncLocalStorage();
const NESSUNA = Object.freeze({ ip: '', daFuori: false });

/** Fa fn() con questa provenienza (http.js, una volta per richiesta). */
function conProvenienza(p, fn) {
  return archivio.run(Object.freeze({ ip: p.ip || '', daFuori: !!p.daFuori }), fn);
}

/** La provenienza della richiesta in corso; fuori da una richiesta (strumenti, notte, prove dirette): vuota. */
function provenienza() {
  return archivio.getStore() || NESSUNA;
}

/** Un indirizzo IP pulito ("::ffff:1.2.3.4" -> "1.2.3.4"), o '' se non lo e'. */
function indirizzo(s) {
  let ip = String(s === undefined || s === null ? '' : s).trim();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  const m = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (m) ip = m[1];
  return net.isIP(ip) ? ip.toLowerCase() : '';
}

/**
 * Un indirizzo di internet: non di casa, non della rete Docker, non di
 * Tailscale (100.64.0.0/10), non locale. Solo questi contano per i limiti per
 * indirizzo: se l'ingresso passasse l'indirizzo della rete Docker (vedi
 * README), un limite per indirizzo fermerebbe tutti insieme.
 */
function pubblico(ip) {
  ip = indirizzo(ip);
  if (!ip) return false;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (ip === '::' || ip === '::1') return false;
  const primo = parseInt(ip.split(':')[0] || '0', 16);
  if ((primo & 0xfe00) === 0xfc00) return false;   // fc00::/7, locali
  if ((primo & 0xffc0) === 0xfe80) return false;   // fe80::/10, del collegamento
  if ((primo & 0xff00) === 0xff00) return false;   // ff00::/8, multicast
  return true;
}

/** Ogni avviso una volta sola per avvio (un ingresso configurato male lo ripeterebbe a ogni richiesta). */
const avvisati = new Set();
function avvisaUnaVolta(tipo, frase) {
  if (avvisati.has(tipo)) return;
  avvisati.add(tipo);
  console.log('ATTENZIONE: ' + frase);
}

/**
 * La provenienza di una richiesta HTTP.
 * @param daIngresso  vero se la richiesta e' arrivata sulla porta dell'ingresso
 */
function provenienzaDi(req, daIngresso) {
  const connessione = indirizzo(req.socket && req.socket.remoteAddress);
  if (!daIngresso) return { ip: connessione, daFuori: false };
  // L'ultimo indirizzo e' quello scritto dall'ingresso (gli altri, se ci fossero, li ha scritti chi chiama).
  const voci = String(req.headers['x-forwarded-for'] || '').split(',');
  const ip = indirizzo(voci[voci.length - 1]);
  if (!ip) {
    avvisaUnaVolta('senza', 'una richiesta sulla porta dell\'ingresso senza X-Forwarded-For valido (da ' + connessione + '): l\'ingresso e\' configurato male?');
  } else if (!pubblico(ip)) {
    avvisaUnaVolta('privato', 'l\'ingresso passa l\'indirizzo ' + ip + ', non uno di internet: i limiti per indirizzo non valgono (README, "Internet entrance")');
  }
  return { ip, daFuori: true };
}

module.exports = { conProvenienza, provenienza, provenienzaDi, indirizzo, pubblico };
