/*
 * Il file del calendario (fase 8, fase8.md §5.3): un ICS (RFC 5545) fatto solo dal server; le app lo salvano o lo
 * condividono e basta. Qui le regole del formato, senza dati: chi ci mette gli eventi e' azioni/calendario.js.
 *
 *  - righe con CRLF; oltre 75 byte si piegano (CRLF piu' uno spazio) senza spezzare un carattere UTF-8;
 *  - nei testi la barra rovescia, il punto e virgola e la virgola prendono una barra rovescia davanti, l'a capo
 *    diventa \n; UTF-8 senza BOM;
 *  - le ore col fuso Europe/Rome (VTIMEZONE scritto qui), i giorni interi con VALUE=DATE e la fine esclusa;
 *  - niente promemoria (VALARM): l'app di Wisper avvisa gia' delle sue attivita'.
 *
 * Un evento: {uid, inizio, fine, giorno, giornoFine, titolo, luogo, descrizione, categoria, annullato, modificato}
 *  - con l'ora: inizio/fine istanti (Date o ISO col fuso); senza fine, un'ora;
 *  - senza ora: giorno "aaaa-mm-gg" (e giornoFine compreso, di base lo stesso giorno).
 */
'use strict';

const due = n => String(n).padStart(2, '0');

const TESTA_FUSO = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Rome',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

/** Un testo come lo vuole un ICS: \ ; , con la barra davanti, gli a capo come \n. */
function testoIcs(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Piega una riga oltre 75 byte (CRLF + spazio), senza mai spezzare un carattere UTF-8. */
function piega(riga) {
  const b = Buffer.from(riga, 'utf8');
  if (b.length <= 75) return riga;
  const pezzi = [];
  let i = 0;
  let max = 75;
  while (i < b.length) {
    let fine = Math.min(b.length, i + max);
    // Non a meta' di un carattere: i byte di continuazione sono 10xxxxxx.
    while (fine < b.length && (b[fine] & 0xC0) === 0x80) fine--;
    pezzi.push(b.toString('utf8', i, fine));
    i = fine;
    max = 74;   // dopo lo spazio della piega
  }
  return pezzi.join('\r\n ');
}

/** Un istante in UTC: 20261022T080500Z. */
function utc(d) {
  d = d instanceof Date ? d : new Date(d);
  return d.getUTCFullYear() + due(d.getUTCMonth() + 1) + due(d.getUTCDate()) + 'T' + due(d.getUTCHours()) + due(d.getUTCMinutes()) + due(d.getUTCSeconds()) + 'Z';
}

/** Un istante come ora del muro italiana: 20261023T090000 (process.env.TZ = Europe/Rome). */
function locale(d) {
  d = d instanceof Date ? d : new Date(d);
  return d.getFullYear() + due(d.getMonth() + 1) + due(d.getDate()) + 'T' + due(d.getHours()) + due(d.getMinutes()) + due(d.getSeconds());
}

const giornoIcs = iso => String(iso).slice(0, 10).replace(/-/g, '');

function giornoDopo(iso) {
  const [a, m, g] = String(iso).slice(0, 10).split('-').map(Number);
  const d = new Date(a, m - 1, g + 1, 12);
  return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
}

/**
 * Il file intero. o: {nome, eventi, ora (Date: DTSTAMP)}. Torna il testo con CRLF.
 */
function creaIcs(o) {
  const righe = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Studio Tecnico GM//Wisper//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'NAME:' + testoIcs(o.nome), 'X-WR-CALNAME:' + testoIcs(o.nome), 'X-WR-TIMEZONE:Europe/Rome', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H']
    .concat(TESTA_FUSO);
  const stampa = utc(o.ora || new Date());
  for (const e of o.eventi || []) {
    righe.push('BEGIN:VEVENT', 'UID:' + e.uid, 'DTSTAMP:' + stampa);
    if (e.modificato) righe.push('LAST-MODIFIED:' + utc(e.modificato));
    if (e.inizio) {
      const inizio = e.inizio instanceof Date ? e.inizio : new Date(e.inizio);
      const fine = e.fine ? (e.fine instanceof Date ? e.fine : new Date(e.fine)) : new Date(inizio.getTime() + 3600000);
      righe.push('DTSTART;TZID=Europe/Rome:' + locale(inizio), 'DTEND;TZID=Europe/Rome:' + locale(fine.getTime() > inizio.getTime() ? fine : new Date(inizio.getTime() + 3600000)));
    } else {
      righe.push('DTSTART;VALUE=DATE:' + giornoIcs(e.giorno), 'DTEND;VALUE=DATE:' + giornoIcs(giornoDopo(e.giornoFine || e.giorno)));
    }
    righe.push('SUMMARY:' + testoIcs(e.titolo));
    if (e.luogo) righe.push('LOCATION:' + testoIcs(e.luogo));
    if (e.descrizione) righe.push('DESCRIPTION:' + testoIcs(e.descrizione));
    if (e.categoria) righe.push('CATEGORIES:' + testoIcs(e.categoria));
    righe.push('STATUS:' + (e.annullato ? 'CANCELLED' : 'CONFIRMED'), 'TRANSP:' + (e.inizio ? 'OPAQUE' : 'TRANSPARENT'), 'END:VEVENT');
  }
  righe.push('END:VCALENDAR');
  return righe.map(piega).join('\r\n') + '\r\n';
}

/**
 * Un lettore minimo, per le prove e per il controllo "calendariofile": torna l'elenco dei problemi (vuoto = va bene).
 * CRLF dappertutto, righe di al massimo 75 byte, niente caratteri spezzati, BEGIN/END in pari, UID e DTSTAMP in ogni
 * evento, i giorni interi con la fine dopo l'inizio.
 */
function controllaIcs(testo) {
  const problemi = [];
  if (testo.charCodeAt(0) === 0xFEFF) problemi.push('c\'è il BOM');
  if (!testo.endsWith('\r\n')) problemi.push('non finisce con CRLF');
  if (/[^\r]\n/.test(testo) || /\r(?!\n)/.test(testo)) problemi.push('a capo senza CRLF');
  const fisiche = testo.split('\r\n').slice(0, -1);
  fisiche.forEach((r, i) => {
    const b = Buffer.from(r, 'utf8');
    if (b.length > 75) problemi.push('riga ' + (i + 1) + ' più lunga di 75 byte');
    if (r.indexOf('\uFFFD') >= 0) problemi.push('riga ' + (i + 1) + ' con un carattere spezzato');
  });
  // Le righe logiche (spiegate).
  const logiche = [];
  for (const r of fisiche) {
    if (r.charAt(0) === ' ' && logiche.length) logiche[logiche.length - 1] += r.slice(1);
    else logiche.push(r);
  }
  if (logiche[0] !== 'BEGIN:VCALENDAR' || logiche[logiche.length - 1] !== 'END:VCALENDAR') problemi.push('manca BEGIN o END del calendario');
  let evento = null;
  for (const r of logiche) {
    if (r === 'BEGIN:VEVENT') { evento = {}; continue; }
    if (r === 'END:VEVENT') {
      if (!evento) { problemi.push('END:VEVENT senza BEGIN'); continue; }
      if (!evento.UID) problemi.push('un evento senza UID');
      if (!evento.DTSTAMP) problemi.push('un evento senza DTSTAMP');
      const a = evento.DTSTART || '';
      const b = evento.DTEND || '';
      if (/VALUE=DATE:/.test(a) && !(b.split(':')[1] > a.split(':')[1])) problemi.push('giorno intero senza la fine dopo: ' + evento.UID);
      evento = null;
      continue;
    }
    if (evento) {
      const k = r.split(/[;:]/)[0];
      evento[k] = r.slice(k.length);
    }
  }
  return problemi;
}

/** Le righe logiche e gli eventi di un ICS, per le prove: [{UID, DTSTART, ..., SUMMARY (spiegato)}]. */
function leggiIcs(testo) {
  const logiche = [];
  for (const r of testo.split('\r\n')) {
    if (r.charAt(0) === ' ' && logiche.length) logiche[logiche.length - 1] += r.slice(1);
    else if (r) logiche.push(r);
  }
  const eventi = [];
  let e = null;
  const spiega = s => s.replace(/\\n/g, '\n').replace(/\\([\\;,])/g, '$1');
  for (const r of logiche) {
    if (r === 'BEGIN:VEVENT') e = {};
    else if (r === 'END:VEVENT') { eventi.push(e); e = null; } else if (e) {
      const i = r.indexOf(':');
      const testa = r.slice(0, i);
      const k = testa.split(';')[0];
      e[k] = /^(SUMMARY|LOCATION|DESCRIPTION|CATEGORIES)$/.test(k) ? spiega(r.slice(i + 1)) : (testa.indexOf(';') >= 0 ? testa.slice(k.length + 1) + ':' : '') + r.slice(i + 1);
    }
  }
  return { righe: logiche, eventi };
}

module.exports = { creaIcs, controllaIcs, leggiIcs, testoIcs, piega, utc, locale, giornoDopo };
