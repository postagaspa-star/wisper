/*
 * Le fatture elettroniche (FatturaPA): leggerle e scriverle, senza librerie.
 * Accordo in docs/gestionale/fase4.md §8.3 (l'XML da completare) e §9.1 (il
 * ritorno dell'XML emesso); struttura e fonti in ricerca-fase4.md §2.
 *
 * Lettura (leggiFatturePA): i file che arrivano dal programma delle fatture o
 * dall'email: .xml in chiaro, .p7m (la busta firmata, anche scritta in
 * base64) e .zip con dentro piu' file. Ne escono i documenti capiti (fatture,
 * con gli importi gia' divisi come li conta Wisper, ed esiti dello SDI) e i
 * file scartati, ognuno col suo perche'. Non cambia niente e non esegue
 * niente: i file sono dati.
 *
 * Sicurezza, perche' i file vengono da fuori:
 *  - un XML con DOCTYPE o ENTITY si scarta (niente entita' esterne, niente
 *    "billion laughs"): una fattura vera non ne ha bisogno;
 *  - limiti su quanti file, quanto pesano e quanto pesano scompattati (uno zip
 *    che dichiara poco e scompatta tantissimo si ferma al limite);
 *  - niente zip dentro zip; profondita' e numero di elementi limitati;
 *  - la firma della busta NON si verifica: Wisper legge e basta (la
 *    conservazione a norma resta del programma o dell'Agenzia).
 *
 * Scrittura (scriviFatturaPA): dal modello della fattura (fase4.md §8.1) l'XML
 * FatturaPA FPR12, schema 1.2.3, con gli elementi nell'ordine dello schema e
 * solo i caratteri che lo schema accetta. Il numero di base e' "BOZZA": Wisper
 * non inventa mai un numero fiscale, lo da' il programma.
 */
'use strict';

const { Rifiuto } = require('./utili');
const { leggiZip } = require('./zip');

const MB = 1024 * 1024;

/** I limiti di una lettura (le prove li abbassano). */
const LIMITI = {
  file: 300, // file in tutto, contando quelli dentro gli zip
  byte: 30 * MB, // byte caricati in tutto (dopo il base64)
  xml: 10 * MB, // un solo XML scompattato
  scompattati: 100 * MB, // tutto quello che si scompatta dagli zip
  profondita: 64, // livelli di elementi annidati
  elementi: 200000, // elementi in un XML
};

const c2 = n => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ frasi per le persone

const FRASI = {
  estensione: 'Non è un file di fattura: servono .xml, .p7m o .zip',
  zipNelloZip: 'Uno zip dentro lo zip: aprilo e carica i file che ha dentro',
  zipRotto: 'Lo zip non si apre: scaricalo di nuovo dal programma',
  zipCifrato: 'Il file nello zip è protetto da una password: Wisper non lo apre',
  zip64: 'Lo zip è troppo grande per Wisper (formato zip64): caricalo diviso in più file',
  p7m: 'La busta firmata (.p7m) non si legge: scarica di nuovo il file dal programma',
  doctype: 'Il file ha parti che Wisper non legge per sicurezza (DOCTYPE): non è un XML di fattura normale',
  vuoto: 'Il file è vuoto',
  senzaBody: 'Il file non ha nessuna fattura dentro',
  metadati: 'Non serve: sono i dati dell\'invio, non la fattura',
  sdi: 'Non serve: è un messaggio dello SDI che non riguarda la consegna',
  nonFattura: 'Non è una fattura elettronica: Wisper legge solo fatture e messaggi dello SDI',
};

const troppoGrande = max => 'Il file è troppo grande: al massimo ' + Math.round(max / MB * 10) / 10 + ' MB per una fattura';

/** I messaggi dello SDI che non servono (si scartano con la loro frase). */
const ALTRI_MESSAGGI_SDI = ['NotificaEsito', 'NotificaEsitoCommittente', 'AttestazioneTrasmissioneFattura', 'NotificaDecorrenzaTermini',
  'ScartoEsitoCommittente', 'RicevutaImpossibilitaRecapito', 'FileMetadati'];

// ------------------------------------------------------------------ XML: la codifica

/**
 * I byte di un XML diventano testo: BOM (UTF-8, UTF-16), poi la codifica
 * scritta nel prologo (UTF-8, ISO-8859-1, windows-1252); se non si capisce,
 * UTF-8.
 */
function decodificaXml(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.toString('utf8', 3);
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return buf.toString('utf16le', 2);
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const scambiato = Buffer.from(buf.subarray(2));
    for (let i = 0; i + 1 < scambiato.length; i += 2) {
      const x = scambiato[i];
      scambiato[i] = scambiato[i + 1];
      scambiato[i + 1] = x;
    }
    return scambiato.toString('utf16le');
  }
  const testa = buf.toString('latin1', 0, Math.min(buf.length, 200));
  const m = testa.match(/^\s*<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i);
  const codifica = m ? m[1].trim().toLowerCase() : 'utf-8';
  if (['iso-8859-1', 'iso8859-1', 'latin1', 'latin-1', 'iso_8859-1', 'l1', 'iso-8859-15', 'iso8859-15'].indexOf(codifica) >= 0) {
    // ISO-8859-1 vero (un byte = un carattere); la -15 cambia solo qualche simbolo (€): va bene cosi'.
    return buf.toString('latin1');
  }
  if (codifica === 'windows-1252' || codifica === 'cp1252') return windows1252(buf);
  return buf.toString('utf8');
}

/**
 * windows-1252 e' ISO-8859-1 con 27 simboli in piu' tra 0x80 e 0x9F (l'euro e' 0x80). Scritto qui perche'
 * il TextDecoder di Node per questa codifica, in certe versioni, si comporta come ISO-8859-1.
 */
const CP1252 = { 0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030,
  0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013,
  0x97: 0x2014, 0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178 };
function windows1252(buf) {
  let s = '';
  for (let i = 0; i < buf.length; i += 8192) {
    const pezzo = buf.subarray(i, i + 8192);
    s += String.fromCodePoint(...Array.from(pezzo, b => CP1252[b] || b));
  }
  return s;
}

// ------------------------------------------------------------------ XML: il lettore

/** Un errore di lettura dell'XML (la frase va dopo "Il file non è un XML leggibile: "). */
class XmlRotto extends Error {}
/** Un XML con DOCTYPE o ENTITY: si scarta per sicurezza. */
class XmlVietato extends Error {}

const ENTITA = { lt: '<', gt: '>', amp: '&', quot: '"', apos: '\'' };

/** Le entita' del testo: solo le cinque dell'XML e quelle numeriche; un'altra e' un errore. */
function decodificaEntita(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&([^;&\s]{0,12});?/g, (m, nome) => {
    if (m.charAt(m.length - 1) !== ';') throw new XmlRotto('un & senza ;');
    if (ENTITA[nome]) return ENTITA[nome];
    let codice = null;
    if (/^#x[0-9a-fA-F]{1,6}$/.test(nome)) codice = parseInt(nome.slice(2), 16);
    else if (/^#\d{1,7}$/.test(nome)) codice = parseInt(nome.slice(1), 10);
    if (codice === null || codice > 0x10FFFF || (codice >= 0xD800 && codice <= 0xDFFF)) throw new XmlRotto('entità sconosciuta &' + nome + ';');
    return String.fromCodePoint(codice);
  });
}

/**
 * Legge un XML gia' decodificato in testo. Torna la radice:
 * {nome (locale, senza prefisso), qnome, attributi, figli: [...], testo}.
 * Niente DOCTYPE ne' ENTITY; profondita' e numero di elementi limitati.
 */
function leggiXml(s, limiti) {
  const L = Object.assign({}, LIMITI, limiti || {});
  if (/<!DOCTYPE|<!ENTITY/i.test(s)) throw new XmlVietato('DOCTYPE');
  const n = s.length;
  const cima = { figli: [], testo: '' };
  const pila = [cima];
  let radice = null;
  let elementi = 0;
  let i = 0;
  const aggiungiTesto = t => {
    if (!t) return;
    const corrente = pila[pila.length - 1];
    if (corrente === cima) {
      if (/\S/.test(t)) throw new XmlRotto('testo fuori dalla radice');
      return;
    }
    corrente.testo += t;
  };
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) {
      aggiungiTesto(decodificaEntita(s.slice(i)));
      break;
    }
    if (lt > i) aggiungiTesto(decodificaEntita(s.slice(i, lt)));
    if (s.startsWith('<!--', lt)) {
      const e = s.indexOf('-->', lt + 4);
      if (e < 0) throw new XmlRotto('un commento non chiuso');
      i = e + 3;
      continue;
    }
    if (s.startsWith('<![CDATA[', lt)) {
      const e = s.indexOf(']]>', lt + 9);
      if (e < 0) throw new XmlRotto('un CDATA non chiuso');
      if (pila.length === 1) throw new XmlRotto('CDATA fuori dalla radice');
      aggiungiTesto(s.slice(lt + 9, e));
      i = e + 3;
      continue;
    }
    if (s.startsWith('<?', lt)) {
      const e = s.indexOf('?>', lt + 2);
      if (e < 0) throw new XmlRotto('un\'istruzione <? non chiusa');
      i = e + 2;
      continue;
    }
    if (s.charAt(lt + 1) === '!') throw new XmlRotto('una dichiarazione <! non ammessa');
    // Fine del tag, saltando quello che sta tra virgolette.
    let j = lt + 1;
    let quote = '';
    for (; j < n; j++) {
      const ch = s.charAt(j);
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === '\'') quote = ch;
      else if (ch === '>') break;
      else if (ch === '<') throw new XmlRotto('un < dentro un tag');
    }
    if (j >= n) throw new XmlRotto('un tag non chiuso');
    const dentro = s.slice(lt + 1, j);
    i = j + 1;
    if (dentro.charAt(0) === '/') {
      const nome = dentro.slice(1).trim();
      const aperto = pila[pila.length - 1];
      if (aperto === cima || aperto.qnome !== nome) throw new XmlRotto('</' + nome + '> non corrisponde');
      pila.pop();
      continue;
    }
    const chiuso = dentro.charAt(dentro.length - 1) === '/';
    const corpo = chiuso ? dentro.slice(0, -1) : dentro;
    const mNome = corpo.match(/^([^\s/>]+)/);
    if (!mNome) throw new XmlRotto('un tag senza nome');
    const qnome = mNome[1];
    if (!/^[A-Za-z_][\w.\-]*(:[A-Za-z_][\w.\-]*)?$/.test(qnome)) throw new XmlRotto('nome non valido: ' + qnome.slice(0, 30));
    const attributi = {};
    const resto = corpo.slice(qnome.length);
    const re = /\s+([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
    let p = 0;
    while (p < resto.length) {
      if (/^\s*$/.test(resto.slice(p))) break;
      re.lastIndex = p;
      const m = re.exec(resto);
      if (!m) throw new XmlRotto('attributi rovinati in <' + qnome + '>');
      const nomeAttr = m[1].indexOf(':') >= 0 && m[1].slice(0, 6) !== 'xmlns:' ? m[1].split(':')[1] : m[1];
      attributi[nomeAttr] = decodificaEntita(m[2] !== undefined ? m[2] : m[3]);
      p = re.lastIndex;
    }
    if (++elementi > L.elementi) throw new XmlRotto('troppi elementi');
    const nodo = { nome: qnome.indexOf(':') >= 0 ? qnome.split(':')[1] : qnome, qnome, attributi, figli: [], testo: '' };
    const padre = pila[pila.length - 1];
    if (padre === cima) {
      if (radice) throw new XmlRotto('due radici');
      radice = nodo;
    } else padre.figli.push(nodo);
    if (!chiuso) {
      if (pila.length > L.profondita) throw new XmlRotto('troppi livelli');
      pila.push(nodo);
    }
  }
  if (pila.length > 1) throw new XmlRotto('<' + pila[pila.length - 1].qnome + '> non chiuso');
  if (!radice) throw new XmlRotto('nessun elemento');
  return radice;
}

/** Il primo figlio con quel nome locale, seguendo il percorso (o null). */
function primo(nodo, ...percorso) {
  let x = nodo;
  for (const nome of percorso) {
    if (!x) return null;
    x = x.figli.find(f => f.nome === nome) || null;
  }
  return x;
}

/** Tutti i figli con quel nome locale (l'ultimo pezzo del percorso). */
function tutti(nodo, ...percorso) {
  const padre = percorso.length > 1 ? primo(nodo, ...percorso.slice(0, -1)) : nodo;
  if (!padre) return [];
  const nome = percorso[percorso.length - 1];
  return padre.figli.filter(f => f.nome === nome);
}

/** Il testo (senza spazi ai lati) del nodo al percorso, o ''. */
function val(nodo, ...percorso) {
  const x = percorso.length ? primo(nodo, ...percorso) : nodo;
  return x ? x.testo.trim() : '';
}

/** Un numero FatturaPA ("1140.00") o null. */
function num(s) {
  const t = String(s === null || s === undefined ? '' : s).trim();
  if (!t) return null;
  const v = Number(t);
  return isFinite(v) ? v : null;
}

/** "2026-10-19" da una data o un istante; '' se non lo e'. */
function giorno(s) {
  const m = String(s || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

// ------------------------------------------------------------------ p7m: la busta firmata

class BustaRotta extends Error {}

/**
 * Un pezzo DER/BER (tag, lunghezza, contenuto) a partire da p. Lunghezze
 * definite e indefinite (finiscono con 00 00). Torna {tag, costruito,
 * inizio, fine (fine del contenuto), dopo, figli?} dove figli c'e' gia' per le
 * lunghezze indefinite (servono per trovarne la fine).
 */
function pezzo(buf, p, fineMassima, livello) {
  if (livello > 40) throw new BustaRotta('troppi livelli');
  if (p + 2 > fineMassima) throw new BustaRotta('finita prima del tempo');
  const tag = buf[p];
  let q = p + 1;
  if ((tag & 0x1F) === 0x1F) {
    // Tag lungo: i byte successivi finche' il primo bit e' 1.
    while (q < fineMassima && (buf[q] & 0x80)) q++;
    q++;
  }
  if (q >= fineMassima) throw new BustaRotta('finita prima del tempo');
  const costruito = (tag & 0x20) !== 0;
  const l = buf[q++];
  if (l === 0x80) {
    if (!costruito) throw new BustaRotta('lunghezza indefinita su un pezzo semplice');
    const figli = [];
    let r = q;
    for (;;) {
      if (r + 2 > fineMassima) throw new BustaRotta('manca la fine 00 00');
      if (buf[r] === 0 && buf[r + 1] === 0) break;
      const f = pezzo(buf, r, fineMassima, livello + 1);
      figli.push(f);
      r = f.dopo;
    }
    return { tag, costruito, inizio: q, fine: r, dopo: r + 2, figli };
  }
  let lunghezza = l;
  if (l > 0x80) {
    const quanti = l & 0x7F;
    if (quanti > 4) throw new BustaRotta('lunghezza impossibile');
    lunghezza = 0;
    for (let k = 0; k < quanti; k++) lunghezza = lunghezza * 256 + buf[q++];
  }
  const fine = q + lunghezza;
  if (fine > fineMassima) throw new BustaRotta('lunghezza oltre la fine del file');
  return { tag, costruito, inizio: q, fine, dopo: fine };
}

/** I pezzi dentro un pezzo costruito. */
function figliDi(buf, x, livello) {
  if (x.figli) return x.figli;
  const out = [];
  for (let r = x.inizio; r < x.fine;) {
    const f = pezzo(buf, r, x.fine, (livello || 0) + 1);
    out.push(f);
    r = f.dopo;
  }
  return out;
}

/** I byte di una OCTET STRING, anche costruita (pezzi concatenati, anche annidati). */
function ottetti(buf, x, livello) {
  if ((livello || 0) > 40) throw new BustaRotta('troppi livelli');
  if (x.tag === 0x04 || x.tag === 0x80) return buf.subarray(x.inizio, x.fine);
  if (x.tag === 0x24 || x.tag === 0xA0) return Buffer.concat(figliDi(buf, x, livello).map(f => ottetti(buf, f, (livello || 0) + 1)));
  throw new BustaRotta('il contenuto non è una OCTET STRING');
}

/** 1.2.840.113549.1.7.2 (signedData), scritto in DER. */
const OID_SIGNED_DATA = Buffer.from([0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x07, 0x02]);

/** Una busta CMS scritta in base64 (anche PEM con le righe -----BEGIN/END-----) -> byte; se non lo e', null. */
function daBase64(buf) {
  if (buf.length && buf[0] === 0x30) return null;
  const t = buf.toString('latin1').replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s+/g, '');
  if (t.length < 16 || !/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return null;
  const b = Buffer.from(t, 'base64');
  return b.length && b[0] === 0x30 ? b : null;
}

/** La busta e' una SignedData? (per le buste doppie: una firma dentro l'altra) */
function eBusta(buf) {
  try {
    if (!buf.length || buf[0] !== 0x30) return false;
    const radice = pezzo(buf, 0, buf.length, 0);
    const f = figliDi(buf, radice, 0);
    return f.length >= 2 && f[0].tag === 0x06 && buf.subarray(f[0].inizio, f[0].fine).equals(OID_SIGNED_DATA);
  } catch (e) {
    return false;
  }
}

/**
 * Il contenuto (l'XML) di una busta .p7m: ContentInfo -> [0] -> SignedData ->
 * encapContentInfo -> [0] -> OCTET STRING. La firma non si verifica. Una busta
 * dentro l'altra si apre fino a 3 volte.
 */
function estraiP7m(dati) {
  let buf = daBase64(dati) || dati;
  for (let giro = 0; giro < 3; giro++) {
    if (!buf.length || buf[0] !== 0x30) throw new BustaRotta('non comincia come una busta');
    const radice = pezzo(buf, 0, buf.length, 0);
    const parti = figliDi(buf, radice, 0);
    if (parti.length < 2 || parti[0].tag !== 0x06 || !buf.subarray(parti[0].inizio, parti[0].fine).equals(OID_SIGNED_DATA)) {
      throw new BustaRotta('non è una busta firmata (signedData)');
    }
    if (parti[1].tag !== 0xA0) throw new BustaRotta('manca il contenuto [0]');
    const signed = figliDi(buf, parti[1], 1)[0];
    if (!signed || signed.tag !== 0x30) throw new BustaRotta('manca la SignedData');
    const campi = figliDi(buf, signed, 2);
    // version, digestAlgorithms, encapContentInfo, ...
    const encap = campi.find((c, k) => k >= 1 && c.tag === 0x30);
    if (!encap) throw new BustaRotta('manca encapContentInfo');
    const e = figliDi(buf, encap, 3);
    if (!e.length || e[0].tag !== 0x06) throw new BustaRotta('encapContentInfo senza tipo');
    const contenuto = e.find(c => c.tag === 0xA0 || c.tag === 0x80);
    if (!contenuto) throw new BustaRotta('la busta non ha il contenuto dentro (firma staccata)');
    let xml;
    if (contenuto.tag === 0x80) xml = buf.subarray(contenuto.inizio, contenuto.fine);
    else {
      const dentro = figliDi(buf, contenuto, 4);
      if (!dentro.length) throw new BustaRotta('contenuto vuoto');
      xml = Buffer.concat(dentro.map(f => ottetti(buf, f, 5)));
    }
    if (eBusta(xml)) {
      buf = Buffer.from(xml);
      continue;
    }
    return Buffer.from(xml);
  }
  throw new BustaRotta('troppe buste una dentro l\'altra');
}

// ------------------------------------------------------------------ i documenti

function soggetto(nodo, sedeNodo) {
  const da = nodo ? primo(nodo, 'DatiAnagrafici') : null;
  const paese = val(da, 'IdFiscaleIVA', 'IdPaese').toUpperCase();
  let partitaIva = val(da, 'IdFiscaleIVA', 'IdCodice').toUpperCase().replace(/\s/g, '');
  if (/^IT\d{11}$/.test(partitaIva)) partitaIva = partitaIva.slice(2);
  const denominazione = val(da, 'Anagrafica', 'Denominazione');
  const nome = val(da, 'Anagrafica', 'Nome');
  const cognome = val(da, 'Anagrafica', 'Cognome');
  const sede = sedeNodo || (nodo ? primo(nodo, 'Sede') : null);
  return {
    paese,
    partitaIva,
    codiceFiscale: val(da, 'CodiceFiscale').toUpperCase().replace(/\s/g, ''),
    denominazione,
    nome,
    cognome,
    nomeVisto: denominazione || [nome, cognome].filter(Boolean).join(' '),
    regimeFiscale: val(da, 'RegimeFiscale'),
    sede: {
      indirizzo: val(sede, 'Indirizzo'),
      numeroCivico: val(sede, 'NumeroCivico'),
      cap: val(sede, 'CAP'),
      comune: val(sede, 'Comune'),
      provincia: val(sede, 'Provincia'),
      nazione: val(sede, 'Nazione'),
    },
    pec: '',
    email: val(nodo, 'Contatti', 'Email'),
  };
}

/**
 * Gli importi come li conta Wisper (fase4.md §9.1), ogni somma al centesimo:
 * compenso = righe senza natura (forfettario: anche le N2.2); la riga del bollo
 * riaddebitato (N1, "bollo" nella descrizione, importo uguale a ImportoBollo)
 * va in bolloAddebitato; anticipazioni = le altre N1; altre = le altre nature.
 */
function contiDelDocumento(d) {
  const forfettario = d.cedente.regimeFiscale === 'RF19';
  const importoBollo = d.bollo && d.bollo.importo ? d.bollo.importo : 0;
  let compenso = 0;
  let anticipazioni = 0;
  let altre = 0;
  let bolloAddebitato = 0;
  let bolloTrovato = false;
  for (const r of d.righe) {
    const pt = r.prezzoTotale || 0;
    const natura = r.natura.toUpperCase();
    const eBollo = !bolloTrovato && importoBollo > 0 && (natura === 'N1' || (forfettario && natura.slice(0, 4) === 'N2.2')) &&
      /bollo/i.test(r.descrizione) && c2(pt) === c2(importoBollo);
    if (eBollo) {
      bolloTrovato = true;
      bolloAddebitato = c2(bolloAddebitato + pt);
    } else if (!natura) compenso = c2(compenso + pt);
    else if (natura === 'N1') anticipazioni = c2(anticipazioni + pt);
    else if (forfettario && natura.slice(0, 4) === 'N2.2') compenso = c2(compenso + pt);
    else altre = c2(altre + pt);
  }
  let contributo = 0;
  for (const c of d.casse) contributo = c2(contributo + (c.importo || 0));
  let iva = 0;
  let baseIva = 0;
  let riepilogo = 0;
  for (const r of d.riepilogo) {
    iva = c2(iva + (r.imposta || 0));
    if ((r.aliquotaIva || 0) > 0) baseIva = c2(baseIva + (r.imponibile || 0));
    riepilogo = c2(riepilogo + (r.imponibile || 0) + (r.imposta || 0));
  }
  const totale = d.importoTotale !== null ? c2(d.importoTotale) : riepilogo;
  let ritenuta = 0;
  for (const r of d.ritenute) ritenuta = c2(ritenuta + (r.importo || 0));
  const importi = [];
  for (const p of d.pagamenti) for (const x of p.dettagli) if (x.importo !== null) importi.push(x.importo);
  const netto = importi.length ? c2(importi.reduce((a, b) => c2(a + b), 0)) : c2(totale - ritenuta);
  return { compenso, contributo, baseIva, iva, anticipazioni, altre, bollo: importoBollo, bolloAddebitato, totale, ritenuta, netto };
}

/** I riferimenti di Wisper ("W-15") scritti nella causale, nelle righe o negli altri dati gestionali. */
function riferimentiWisper(d) {
  const testi = d.causale.slice();
  for (const r of d.righe) {
    testi.push(r.descrizione);
    for (const a of r.altriDati) testi.push(a.testo);
  }
  const visti = [];
  for (const t of testi) {
    const re = /\bW-(\d+)\b/g;
    let m;
    while ((m = re.exec(String(t || '')))) {
      const rif = 'W-' + parseInt(m[1], 10);
      if (visti.indexOf(rif) < 0) visti.push(rif);
    }
  }
  return visti;
}

/** Una FatturaElettronicaBody, con l'intestazione del file, come documento di Wisper. */
function documentoFattura(radice, testata, body, chiave, nomeFile) {
  const dt = primo(testata, 'DatiTrasmissione');
  const dgd = primo(body, 'DatiGenerali', 'DatiGeneraliDocumento');
  const d = {
    chiave,
    nomeFile,
    genere: 'fattura',
    versione: radice.attributi.versione || '',
    trasmissione: {
      paese: val(dt, 'IdTrasmittente', 'IdPaese'),
      codice: val(dt, 'IdTrasmittente', 'IdCodice'),
      progressivo: val(dt, 'ProgressivoInvio'),
      codiceDestinatario: val(dt, 'CodiceDestinatario'),
      pecDestinatario: val(dt, 'PECDestinatario'),
    },
    cedente: soggetto(primo(testata, 'CedentePrestatore')),
    cessionario: soggetto(primo(testata, 'CessionarioCommittente')),
    tipoDocumento: val(dgd, 'TipoDocumento'),
    divisa: val(dgd, 'Divisa'),
    data: giorno(val(dgd, 'Data')),
    numero: val(dgd, 'Numero'),
    causale: tutti(dgd, 'Causale').map(c => c.testo.trim()).filter(Boolean),
    importoTotale: num(val(dgd, 'ImportoTotaleDocumento')),
    righe: tutti(body, 'DatiBeniServizi', 'DettaglioLinee').map(r => ({
      numero: num(val(r, 'NumeroLinea')),
      descrizione: val(r, 'Descrizione'),
      quantita: num(val(r, 'Quantita')),
      unitaMisura: val(r, 'UnitaMisura'),
      prezzoUnitario: num(val(r, 'PrezzoUnitario')),
      prezzoTotale: num(val(r, 'PrezzoTotale')),
      aliquotaIva: num(val(r, 'AliquotaIVA')),
      natura: val(r, 'Natura'),
      ritenuta: val(r, 'Ritenuta').toUpperCase() === 'SI',
      // 1.4.0 (servizi.md §3): il codice del servizio (il primo CodiceArticolo) e lo sconto in percento (SC; MG in negativo).
      codice: val(r, 'CodiceArticolo', 'CodiceValore'),
      sconto: tutti(r, 'ScontoMaggiorazione').reduce((t, s) => t + (val(s, 'Tipo').toUpperCase() === 'MG' ? -1 : 1) * (num(val(s, 'Percentuale')) || 0), 0),
      periodoDa: giorno(val(r, 'DataInizioPeriodo')),
      periodoA: giorno(val(r, 'DataFinePeriodo')),
      altriDati: tutti(r, 'AltriDatiGestionali').map(a => ({
        tipo: val(a, 'TipoDato'), testo: val(a, 'RiferimentoTesto'), numero: num(val(a, 'RiferimentoNumero')), data: giorno(val(a, 'RiferimentoData')),
      })),
    })),
    riepilogo: tutti(body, 'DatiBeniServizi', 'DatiRiepilogo').map(r => ({
      aliquotaIva: num(val(r, 'AliquotaIVA')),
      natura: val(r, 'Natura'),
      imponibile: num(val(r, 'ImponibileImporto')),
      imposta: num(val(r, 'Imposta')),
      esigibilita: val(r, 'EsigibilitaIVA'),
      riferimentoNormativo: val(r, 'RiferimentoNormativo'),
    })),
    ritenute: tutti(dgd, 'DatiRitenuta').map(r => ({
      tipo: val(r, 'TipoRitenuta'), importo: num(val(r, 'ImportoRitenuta')), aliquota: num(val(r, 'AliquotaRitenuta')), causale: val(r, 'CausalePagamento'),
    })),
    bollo: primo(dgd, 'DatiBollo')
      ? { virtuale: val(dgd, 'DatiBollo', 'BolloVirtuale').toUpperCase() === 'SI', importo: num(val(dgd, 'DatiBollo', 'ImportoBollo')) }
      : null,
    casse: tutti(dgd, 'DatiCassaPrevidenziale').map(c => ({
      tipo: val(c, 'TipoCassa'), aliquota: num(val(c, 'AlCassa')), importo: num(val(c, 'ImportoContributoCassa')),
      imponibile: num(val(c, 'ImponibileCassa')), aliquotaIva: num(val(c, 'AliquotaIVA')),
      ritenuta: val(c, 'Ritenuta').toUpperCase() === 'SI', natura: val(c, 'Natura'),
    })),
    pagamenti: tutti(body, 'DatiPagamento').map(p => ({
      condizioni: val(p, 'CondizioniPagamento'),
      dettagli: tutti(p, 'DettaglioPagamento').map(x => ({
        modalita: val(x, 'ModalitaPagamento'), scadenza: giorno(val(x, 'DataScadenzaPagamento')), importo: num(val(x, 'ImportoPagamento')),
        iban: val(x, 'IBAN').replace(/\s/g, '').toUpperCase(), istituto: val(x, 'IstitutoFinanziario'), beneficiario: val(x, 'Beneficiario'),
      })),
    })),
    fattureCollegate: tutti(body, 'DatiGenerali', 'DatiFattureCollegate').map(f => ({ idDocumento: val(f, 'IdDocumento'), data: giorno(val(f, 'Data')) })),
  };
  d.cessionario.pec = d.trasmissione.pecDestinatario;
  d.riferimentiWisper = riferimentiWisper(d);
  d.conti = contiDelDocumento(d);
  d.scadenze = [];
  for (const p of d.pagamenti) {
    for (const x of p.dettagli) if (x.scadenza) d.scadenze.push({ data: x.scadenza, importo: x.importo, modalita: x.modalita, iban: x.iban });
  }
  return d;
}

/** Un esito dello SDI (consegnata, non consegnata, scartata) come documento. */
function documentoEsito(radice, esito, chiave, nomeFile) {
  const ricezione = val(radice, 'DataOraRicezione');
  const consegna = val(radice, 'DataOraConsegna');
  return {
    chiave,
    nomeFile,
    genere: 'esito',
    esito,
    nomeFileFattura: val(radice, 'NomeFile'),
    identificativoSdi: val(radice, 'IdentificativoSdI'),
    data: giorno(esito === 'consegnata' && consegna ? consegna : ricezione || consegna),
    errori: tutti(radice, 'ListaErrori', 'Errore').map(e => ({ codice: val(e, 'Codice'), descrizione: val(e, 'Descrizione') })),
  };
}

// ------------------------------------------------------------------ la lettura dei file

const nomeBase = nome => String(nome || '').split(/[\\/]/).pop();
const estensione = nome => {
  const b = nomeBase(nome).toLowerCase();
  if (b.endsWith('.zip')) return 'zip';
  if (b.endsWith('.p7m')) return 'p7m';
  if (b.endsWith('.xml')) return 'xml';
  return '';
};
/** Sembra un XML in chiaro (anche col BOM)? Serve ai .p7m che non sono buste. */
const sembraXml = buf => {
  let k = 0;
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) k = 3;
  while (k < buf.length && (buf[k] === 0x20 || buf[k] === 0x0A || buf[k] === 0x0D || buf[k] === 0x09)) k++;
  return buf[k] === 0x3C;
};

/**
 * Legge i file caricati: [{nome, base64}] (o {nome, dati: Buffer}). Torna
 * {documenti, scartati}. Lancia un Rifiuto solo per i limiti di tutta la
 * lettura (troppi file, troppo grandi): il resto e' uno scartato col perche'.
 */
function leggiFatturePA(file, limiti) {
  const L = Object.assign({}, LIMITI, limiti || {});
  const lista = Array.isArray(file) ? file : [];
  const troppi = () => new Rifiuto('Troppi file: al massimo ' + L.file + ' per volta');
  const pesanti = () => new Rifiuto('File troppo grandi: al massimo ' + Math.round(L.byte / MB * 10) / 10 + ' MB per volta');
  if (lista.length > L.file) throw troppi();
  // Prima di decodificare: il base64 e' 4/3 dei byte, un file enorme si ferma qui.
  let stima = 0;
  for (const f of lista) stima += f && f.dati ? f.dati.length : Math.floor(String((f && f.base64) || '').length * 3 / 4);
  if (stima > L.byte + 3 * lista.length) throw pesanti();
  const caricati = lista.map(f => ({ nome: nomeBase(f && f.nome) || 'senza nome', dati: f && f.dati ? Buffer.from(f.dati) : Buffer.from(String((f && f.base64) || ''), 'base64') }));
  if (caricati.reduce((t, f) => t + f.dati.length, 0) > L.byte) throw pesanti();

  const documenti = [];
  const scartati = [];
  const stato = { contati: 0, scompattati: 0 };
  const scarta = (nomeFile, motivo) => scartati.push({ nomeFile, motivo });
  const conta = () => {
    if (++stato.contati > L.file) throw troppi();
  };

  /**
   * Un XML (gia' tolto dalla busta, se c'era): uno o piu' documenti, o uno
   * scartato. originale: i byte del file com'era (il .p7m o l'XML, anche dallo
   * zip), attaccati al documento come proprieta' non enumerabile "originale"
   * (il server li salva come file della fattura; nel JSON non finiscono).
   */
  function trattaXml(nomeFile, buf, chiave, originale) {
    const con = doc => Object.defineProperty(doc, 'originale', { value: originale || buf, enumerable: false });
    if (!buf.length) return scarta(nomeFile, FRASI.vuoto);
    if (buf.length > L.xml) return scarta(nomeFile, troppoGrande(L.xml));
    let radice;
    try {
      radice = leggiXml(decodificaXml(buf), L);
    } catch (err) {
      if (err instanceof XmlVietato) return scarta(nomeFile, FRASI.doctype);
      if (err instanceof XmlRotto) return scarta(nomeFile, 'Il file non è un XML leggibile: ' + err.message);
      throw err;
    }
    const r = radice.nome;
    if (r === 'FatturaElettronica') {
      const testata = primo(radice, 'FatturaElettronicaHeader');
      const bodies = tutti(radice, 'FatturaElettronicaBody');
      if (!testata || !bodies.length) return scarta(nomeFile, FRASI.senzaBody);
      bodies.forEach((b, k) => documenti.push(con(documentoFattura(radice, testata, b, chiave + '#' + (k + 1), nomeFile))));
      return undefined;
    }
    const esiti = { RicevutaConsegna: 'consegnata', NotificaMancataConsegna: 'non_consegnata', NotificaScarto: 'scartata' };
    if (esiti[r]) return documenti.push(con(documentoEsito(radice, esiti[r], chiave + '#1', nomeFile)));
    if (r === 'MetadatiInvioFile') return scarta(nomeFile, FRASI.metadati);
    if (ALTRI_MESSAGGI_SDI.indexOf(r) >= 0) return scarta(nomeFile, FRASI.sdi);
    return scarta(nomeFile, FRASI.nonFattura);
  }

  /** Un file (o una voce di uno zip): secondo l'estensione. */
  function trattaFile(nome, dati, chiave, dentroZip) {
    const tipo = estensione(nome);
    if (tipo === 'zip') {
      if (dentroZip) return scarta(nome, FRASI.zipNelloZip);
      return trattaZip(nome, dati, chiave);
    }
    if (tipo === 'p7m') {
      if (!dati.length) return scarta(nome, FRASI.vuoto);
      // Un ".p7m" che in realta' e' l'XML in chiaro: si legge lo stesso.
      if (sembraXml(dati) && !daBase64(dati)) return trattaXml(nome, dati, chiave, dati);
      let xml;
      try {
        xml = estraiP7m(dati);
      } catch (err) {
        if (err instanceof BustaRotta) return scarta(nome, FRASI.p7m);
        throw err;
      }
      return trattaXml(nome, xml, chiave, dati);
    }
    if (tipo === 'xml') return trattaXml(nome, dati, chiave, dati);
    return scarta(nome, FRASI.estensione);
  }

  function trattaZip(nome, dati, chiave) {
    let z;
    try {
      z = leggiZip(dati);
    } catch (err) {
      return scarta(nome, FRASI.zipRotto);
    }
    let k = 0;
    for (const voce of z.nomi) {
      const base = nomeBase(voce);
      // Cartelle e file nascosti del Mac: non sono file caricati, si saltano in silenzio.
      if (!base || voce.endsWith('/') || /(^|\/)__MACOSX\//.test(voce) || base.charAt(0) === '.') continue;
      conta();
      k++;
      const info = z.info(voce);
      if (info.cifrata) { scarta(base, FRASI.zipCifrato); continue; }
      if (info.zip64) { scarta(base, FRASI.zip64); continue; }
      const tipo = estensione(base);
      if (!tipo) { scarta(base, FRASI.estensione); continue; }
      if (tipo === 'zip') { scarta(base, FRASI.zipNelloZip); continue; }
      if (info.dimensione > L.xml) { scarta(base, troppoGrande(L.xml)); continue; }
      const resto = L.scompattati - stato.scompattati;
      const oltre = () => new Rifiuto('File troppo grandi: al massimo ' + Math.round(L.scompattati / MB * 10) / 10 + ' MB scompattati per volta');
      if (info.dimensione > resto) throw oltre();
      // Il limite vero e' il piu' piccolo tra quello di un XML e quello che resta di tutta la lettura.
      const massimo = Math.min(L.xml, resto);
      let contenuto;
      try {
        contenuto = z.leggi(voce, { massimo: massimo + 1 });
      } catch (err) {
        if (!/troppo grande/.test(err.message)) { scarta(base, FRASI.zipRotto); continue; }
        if (massimo < L.xml) throw oltre();
        scarta(base, troppoGrande(L.xml));
        continue;
      }
      if (contenuto.length > massimo) {
        if (massimo < L.xml) throw oltre();
        scarta(base, troppoGrande(L.xml));
        continue;
      }
      stato.scompattati += contenuto.length;
      trattaFile(base, contenuto, chiave + '.' + k, true);
    }
    return undefined;
  }

  caricati.forEach((f, i) => {
    if (estensione(f.nome) !== 'zip') conta();
    trattaFile(f.nome, f.dati, 'f' + (i + 1), false);
  });
  return { documenti, scartati };
}

// ------------------------------------------------------------------ la scrittura

/**
 * Un testo come lo vuole lo schema: solo Basic Latin e Latin-1. Il simbolo
 * dell'euro diventa EUR, apostrofi e virgolette "tipografici" quelli semplici,
 * i trattini lunghi un trattino; gli altri caratteri fuori si tolgono. Gli a capo
 * diventano spazi. Tagliato alla lunghezza massima.
 */
function testoLatino(s, massimo) {
  let t = String(s === null || s === undefined ? '' : s)
    .replace(/€/g, 'EUR')
    .replace(/[‘’‚‛′`]/g, '\'')
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  ]/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (massimo && t.length > massimo) t = t.slice(0, massimo).trim();
  return t;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Un importo con due decimali ("1140.00"). */
const importo = n => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

/** Quantita' e prezzo unitario: da 2 a 8 decimali ("38.00", "0.76", "0.7612"). */
function decimali(n) {
  let s = Number(n || 0).toFixed(8).replace(/0+$/, '');
  const punto = s.indexOf('.');
  if (punto < 0) s += '.00';
  else if (s.length - punto - 1 < 2) s += '0'.repeat(2 - (s.length - punto - 1));
  return s;
}

/** Un'aliquota ("22.00", "5.00"). */
const aliquota = n => Number(n || 0).toFixed(2);

/**
 * Un pezzo di XML: el('Nome', 'testo') o el('Nome', [figli]). Un testo vuoto,
 * null o undefined (e un elenco senza figli) non si scrive: cosi' i campi
 * facoltativi mancanti spariscono da soli.
 */
function el(nome, contenuto) {
  if (contenuto === null || contenuto === undefined || contenuto === false) return '';
  if (Array.isArray(contenuto)) {
    const dentro = contenuto.filter(Boolean);
    if (!dentro.length) return '';
    return '<' + nome + '>' + dentro.join('') + '</' + nome + '>';
  }
  const t = String(contenuto);
  if (t === '') return '';
  return '<' + nome + '>' + esc(t) + '</' + nome + '>';
}

/** Va a capo e rientra un XML scritto tutto su una riga (solo per chi lo apre a mano). */
function rientra(xml) {
  const pezzi = xml.split(/(?=<)/);
  let livello = 0;
  const out = [];
  for (let k = 0; k < pezzi.length; k++) {
    const p = pezzi[k];
    if (p.startsWith('</')) {
      livello--;
      // La chiusura subito dopo il testo dello stesso elemento resta sulla sua riga.
      if (out.length && !out[out.length - 1].trim().startsWith('</') && /^\s*<[^/][^>]*>[^<]+$/.test(out[out.length - 1])) {
        out[out.length - 1] += p;
        continue;
      }
      out.push('  '.repeat(Math.max(0, livello)) + p);
    } else {
      out.push('  '.repeat(livello) + p);
      if (!p.endsWith('/>') && !p.startsWith('<?')) livello++;
    }
  }
  return out.join('\n');
}

const sedeXml = s => el('Sede', [
  el('Indirizzo', testoLatino(s && s.indirizzo, 60)),
  el('NumeroCivico', testoLatino(s && s.numeroCivico, 8)),
  el('CAP', testoLatino(s && s.cap, 5)),
  el('Comune', testoLatino(s && s.comune, 60)),
  el('Provincia', testoLatino(s && s.provincia, 2).toUpperCase()),
  el('Nazione', testoLatino((s && s.nazione) || 'IT', 2).toUpperCase()),
]);

/** Una causale lunga si divide in piu' Causale da 200 caratteri (lo schema non ne vuole di piu' lunghe). */
function causali(lista) {
  const out = [];
  for (const c of lista || []) {
    let t = testoLatino(c);
    while (t.length > 200) {
      out.push(t.slice(0, 200));
      t = t.slice(200).trim();
    }
    if (t) out.push(t);
  }
  return out;
}

/**
 * L'XML FatturaPA (FPR12, schema 1.2.3) dal modello (fase4.md §8.1).
 * opzioni.numero: di base "BOZZA" (non e' un numero: lo deve cambiare il
 * programma); opzioni.progressivo: di base il riferimento senza trattino ("W15").
 */
function scriviFatturaPA(modello, opzioni) {
  const m = modello || {};
  const o = opzioni || {};
  const numero = testoLatino(o.numero || 'BOZZA', 20);
  const progressivo = testoLatino(o.progressivo || String(m.riferimento || '').replace(/[^A-Za-z0-9]/g, '') || '1', 10).replace(/[^A-Za-z0-9]/g, '') || '1';
  const p = m.prestatore || {};
  const c = m.committente || {};
  const albo = p.albo || {};
  const codiceDestinatario = testoLatino(c.codiceDestinatario || '0000000', 7).toUpperCase();
  const pivaStudio = testoLatino(p.partitaIva, 28).replace(/^IT/i, '');

  const trasmissione = el('DatiTrasmissione', [
    el('IdTrasmittente', [el('IdPaese', 'IT'), el('IdCodice', pivaStudio)]),
    el('ProgressivoInvio', progressivo),
    el('FormatoTrasmissione', 'FPR12'),
    el('CodiceDestinatario', codiceDestinatario),
    codiceDestinatario === '0000000' && c.pec ? el('PECDestinatario', testoLatino(c.pec, 256)) : '',
  ]);

  const cedente = el('CedentePrestatore', [
    el('DatiAnagrafici', [
      el('IdFiscaleIVA', [el('IdPaese', 'IT'), el('IdCodice', pivaStudio)]),
      el('CodiceFiscale', testoLatino(p.codiceFiscale, 16).toUpperCase()),
      el('Anagrafica', [el('Denominazione', testoLatino(p.denominazione, 80))]),
      el('AlboProfessionale', testoLatino(albo.nome, 60)),
      el('ProvinciaAlbo', testoLatino(albo.provincia, 2).toUpperCase()),
      el('NumeroIscrizioneAlbo', testoLatino(albo.numero, 60)),
      el('DataIscrizioneAlbo', giorno(albo.data)),
      el('RegimeFiscale', testoLatino(p.regimeFiscale || 'RF01', 4)),
    ]),
    sedeXml(p.sede),
    p.email ? el('Contatti', [el('Email', testoLatino(p.email, 256))]) : '',
  ]);

  const pivaCliente = testoLatino(c.partitaIva, 28).replace(/^IT(?=\d{11}$)/i, '');
  const nazioneCliente = testoLatino((c.sede && c.sede.nazione) || 'IT', 2).toUpperCase();
  const cessionario = el('CessionarioCommittente', [
    el('DatiAnagrafici', [
      pivaCliente ? el('IdFiscaleIVA', [el('IdPaese', nazioneCliente), el('IdCodice', pivaCliente)]) : '',
      el('CodiceFiscale', testoLatino(c.codiceFiscale, 16).toUpperCase()),
      el('Anagrafica', c.denominazione
        ? [el('Denominazione', testoLatino(c.denominazione, 80))]
        : [el('Nome', testoLatino(c.nome, 60)), el('Cognome', testoLatino(c.cognome, 60))]),
    ]),
    sedeXml(c.sede),
  ]);

  const rit = m.ritenuta;
  const cassa = m.cassa;
  const documento = el('DatiGeneraliDocumento', [
    el('TipoDocumento', testoLatino(m.tipoDocumento || 'TD01', 4)),
    el('Divisa', testoLatino(m.divisa || 'EUR', 3)),
    el('Data', giorno(m.data || m.dataProposta)),
    el('Numero', numero),
    rit && rit.importo ? el('DatiRitenuta', [
      el('TipoRitenuta', rit.tipo || 'RT01'),
      el('ImportoRitenuta', importo(rit.importo)),
      el('AliquotaRitenuta', aliquota(rit.aliquota)),
      el('CausalePagamento', rit.causale || 'A'),
    ]) : '',
    m.bollo && m.bollo.importo ? el('DatiBollo', [el('BolloVirtuale', 'SI'), el('ImportoBollo', importo(m.bollo.importo))]) : '',
    cassa ? el('DatiCassaPrevidenziale', [
      el('TipoCassa', cassa.tipo || 'TC17'),
      el('AlCassa', aliquota(cassa.aliquota)),
      el('ImportoContributoCassa', importo(cassa.importo)),
      el('ImponibileCassa', importo(cassa.imponibile)),
      el('AliquotaIVA', aliquota(cassa.aliquotaIva)),
      cassa.ritenuta ? el('Ritenuta', 'SI') : '',
      el('Natura', cassa.natura || ''),
    ]) : '',
    el('ImportoTotaleDocumento', importo(m.totaleDocumento)),
    ...causali(m.causale).map(t => el('Causale', t)),
  ]);
  const collegate = (m.fattureCollegate || []).filter(f => f && f.idDocumento).map(f => el('DatiFattureCollegate', [
    el('IdDocumento', testoLatino(f.idDocumento, 20)), el('Data', giorno(f.data)),
  ]));

  const righe = (m.righe || []).map((r, k) => el('DettaglioLinee', [
    el('NumeroLinea', String(r.numero || k + 1)),
    // 1.4.0: il codice del servizio, come lo scrive Flextaxa.
    r.codice ? el('CodiceArticolo', [el('CodiceTipo', 'INTERNO'), el('CodiceValore', testoLatino(r.codice, 35))]) : '',
    el('Descrizione', testoLatino(r.descrizione, 1000) || '-'),
    r.quantita !== null && r.quantita !== undefined && r.quantita !== '' ? el('Quantita', decimali(r.quantita)) : '',
    el('UnitaMisura', testoLatino(r.unitaMisura, 10)),
    el('DataInizioPeriodo', giorno(r.periodoDa)),
    el('DataFinePeriodo', giorno(r.periodoA)),
    el('PrezzoUnitario', decimali(r.prezzoUnitario)),
    Number(r.sconto) > 0 ? el('ScontoMaggiorazione', [el('Tipo', 'SC'), el('Percentuale', importo(r.sconto))]) : '',
    el('PrezzoTotale', importo(r.prezzoTotale)),
    el('AliquotaIVA', aliquota(r.aliquotaIva)),
    r.ritenuta ? el('Ritenuta', 'SI') : '',
    el('Natura', r.natura || ''),
    k === 0 && m.riferimento ? el('AltriDatiGestionali', [el('TipoDato', 'RIFWISPER'), el('RiferimentoTesto', testoLatino(m.riferimento, 60))]) : '',
  ]));
  const riepilogo = (m.riepilogo || []).map(r => el('DatiRiepilogo', [
    el('AliquotaIVA', aliquota(r.aliquotaIva)),
    el('Natura', r.natura || ''),
    el('ImponibileImporto', importo(r.imponibile)),
    el('Imposta', importo(r.imposta)),
    el('EsigibilitaIVA', r.esigibilita || ''),
    el('RiferimentoNormativo', testoLatino(r.riferimentoNormativo, 100)),
  ]));
  const pag = m.pagamento;
  const pagamento = pag && (pag.dettagli || []).length ? el('DatiPagamento', [
    el('CondizioniPagamento', pag.condizioni || 'TP02'),
    ...pag.dettagli.map(x => el('DettaglioPagamento', [
      el('ModalitaPagamento', x.modalita || 'MP05'),
      el('DataScadenzaPagamento', giorno(x.scadenza)),
      el('ImportoPagamento', importo(x.importo)),
      el('IstitutoFinanziario', testoLatino(x.istituto, 80)),
      el('IBAN', testoLatino(x.iban, 34).replace(/\s/g, '').toUpperCase()),
    ])),
  ]) : '';

  const corpo = el('FatturaElettronicaBody', [
    el('DatiGenerali', [documento, ...collegate]),
    el('DatiBeniServizi', [...righe, ...riepilogo]),
    pagamento,
  ]);
  const radice = '<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" ' +
    'xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    el('FatturaElettronicaHeader', [trasmissione, cedente, cessionario]) + corpo + '</p:FatturaElettronica>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + rientra(radice) + '\n';
}

module.exports = {
  LIMITI, leggiFatturePA, scriviFatturaPA, leggiXml, decodificaXml, estraiP7m, testoLatino,
  primo, tutti, val, XmlRotto, XmlVietato, BustaRotta,
};
