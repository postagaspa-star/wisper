/*
 * Gli zip, senza librerie (fase 8, fase8.md §6.1 e §7.1): leggere quelli che arrivano (xlsx, docx, odt, gli zip delle
 * fatture della fase 4) e scriverne di nuovi (Esporta tutto, i file finti delle prove).
 *
 * Il lettore era in strumenti/xlsx.js (che ora lo prende da qui): si legge l'indice in fondo al file e si scompattano le
 * voci con node:zlib (inflateRaw). Niente zip64, niente cifratura: bastano per i file di Office, di LibreOffice, di
 * Google Fogli e delle fatture.
 *
 * Lo scrittore fa zip "normali" che Esplora file di Windows apre da solo: deflate, CRC di node:zlib, nomi in UTF-8 col
 * loro bit (0x0800), la data DOS di quando si scrive.
 */
'use strict';

const zlib = require('node:zlib');

function leggiZip(buf) {
  let fine = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fine = i; break; }
  }
  if (fine < 0) throw new Error('Non è un file .xlsx valido (manca l\'indice dello zip): scaricalo di nuovo da Fogli');
  const quante = buf.readUInt16LE(fine + 10);
  let p = buf.readUInt32LE(fine + 16);
  const voci = new Map();
  for (let k = 0; k < quante; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Indice dello zip rovinato');
    const bandiere = buf.readUInt16LE(p + 8);
    const metodo = buf.readUInt16LE(p + 10);
    const compressa = buf.readUInt32LE(p + 20);
    const dimensione = buf.readUInt32LE(p + 24);
    const lungNome = buf.readUInt16LE(p + 28);
    const lungExtra = buf.readUInt16LE(p + 30);
    const lungCommento = buf.readUInt16LE(p + 32);
    const locale = buf.readUInt32LE(p + 42);
    voci.set(buf.toString('utf8', p + 46, p + 46 + lungNome), {
      metodo, compressa, dimensione, locale,
      // Fase 4 (gli zip delle fatture): una voce cifrata non si legge; lo zip64 (file oltre 4 GB) nemmeno.
      cifrata: (bandiere & 1) === 1,
      zip64: compressa === 0xFFFFFFFF || dimensione === 0xFFFFFFFF || locale === 0xFFFFFFFF,
    });
    p += 46 + lungNome + lungExtra + lungCommento;
  }
  return {
    nomi: Array.from(voci.keys()),
    /** Come e' fatta una voce: {metodo, compressa, dimensione (scompattata, come la dichiara l'indice), cifrata, zip64}. */
    info(nome) {
      const v = voci.get(nome);
      return v ? { metodo: v.metodo, compressa: v.compressa, dimensione: v.dimensione, cifrata: v.cifrata, zip64: v.zip64 } : null;
    },
    /**
     * I byte di una voce. opzioni.massimo: oltre questi byte scompattati si
     * ferma con un errore (difesa dagli zip che dichiarano poco e scompattano
     * tantissimo), senza riempire la memoria.
     */
    leggi(nome, opzioni) {
      const v = voci.get(nome);
      if (!v) return null;
      const massimo = opzioni && opzioni.massimo;
      if (v.locale + 30 > buf.length || buf.readUInt32LE(v.locale) !== 0x04034b50) throw new Error('Voce dello zip rovinata: ' + nome);
      const inizio = v.locale + 30 + buf.readUInt16LE(v.locale + 26) + buf.readUInt16LE(v.locale + 28);
      const dati = buf.subarray(inizio, inizio + v.compressa);
      if (v.metodo === 0) {
        if (massimo && dati.length > massimo) throw new Error('Voce dello zip troppo grande: ' + nome);
        return Buffer.from(dati);
      }
      if (v.metodo === 8) {
        if (!massimo) return zlib.inflateRawSync(dati);
        try {
          return zlib.inflateRawSync(dati, { maxOutputLength: massimo });
        } catch (err) {
          if (err && (err.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength|too large/i.test(err.message))) throw new Error('Voce dello zip troppo grande: ' + nome);
          throw err;
        }
      }
      throw new Error('Compressione dello zip non supportata (' + v.metodo + ') in ' + nome);
    },
  };
}

/** Data e ora DOS (quelle che Esplora file mostra nello zip), dall'ora del muro italiana. */
function dataDos(d) {
  if (!d) return { ora: 0, data: ((2026 - 1980) << 9) | (1 << 5) | 1 };
  const anno = Math.max(1980, d.getFullYear());
  return {
    ora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    data: ((anno - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Uno zip con le voci date: [{nome, dati}] (deflate, con il CRC di node:zlib).
 * quando: la data da scrivere dentro (Date); senza, il 01/01/2026 come prima (le prove confrontano i byte).
 */
function scriviZip(voci, quando) {
  const locali = [];
  const centrali = [];
  let posizione = 0;
  const { ora, data } = dataDos(quando);
  for (const v of voci) {
    const nome = Buffer.from(v.nome, 'utf8');
    const dati = Buffer.isBuffer(v.dati) ? v.dati : Buffer.from(v.dati, 'utf8');
    const compressi = zlib.deflateRawSync(dati);
    const crc = zlib.crc32(dati);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6); l.writeUInt16LE(8, 8);
    l.writeUInt16LE(ora, 10); l.writeUInt16LE(data, 12); l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(compressi.length, 18); l.writeUInt32LE(dati.length, 22); l.writeUInt16LE(nome.length, 26); l.writeUInt16LE(0, 28);
    locali.push(l, nome, compressi);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(ora, 12); c.writeUInt16LE(data, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(compressi.length, 20);
    c.writeUInt32LE(dati.length, 24); c.writeUInt16LE(nome.length, 28); c.writeUInt32LE(posizione, 42);
    centrali.push(c, nome);
    posizione += 30 + nome.length + compressi.length;
  }
  const indice = Buffer.concat(centrali);
  const fine = Buffer.alloc(22);
  fine.writeUInt32LE(0x06054b50, 0); fine.writeUInt16LE(voci.length, 8); fine.writeUInt16LE(voci.length, 10);
  fine.writeUInt32LE(indice.length, 12); fine.writeUInt32LE(posizione, 16);
  return Buffer.concat(locali.concat([indice, fine]));
}

module.exports = { leggiZip, scriviZip };
