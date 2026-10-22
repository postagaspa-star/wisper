/*
 * Le piccole regole dei documenti della fase 5 (fase5.md §5), senza database:
 *  - tipoCollegamento(url): che cosa e' un indirizzo incollato (OneDrive,
 *    SharePoint, Google Drive, un percorso del computer dello studio, un sito)
 *    e se sembra una cartella. Le app la rifanno per la pillola mentre si
 *    incolla; i casi sono in server/prove/casi-collegamenti.json;
 *  - pulisciRicerca(testo): la ricerca senza badare a maiuscole, accenti e
 *    spazi doppi;
 *  - i segnaposti dei modelli ({cliente}, {impianto}...);
 *  - riconosciTipo(byte): il tipo di un file dai suoi primi byte, perche' un
 *    file che dice di essere un PDF lo sia davvero (e un programma o una
 *    pagina web non arrivino mai sul NAS travestiti da documento).
 */
'use strict';

const { Rifiuto, testo } = require('./utili');

const ERRORE_COLLEGAMENTO = 'Collegamento: incolla un indirizzo che comincia con https:// o un percorso come \\\\server\\cartella';

const PILLOLE = { onedrive: 'OneDrive', sharepoint: 'SharePoint', gdrive: 'Google Drive', percorso: 'Cartella del computer', web: 'Sito' };

/**
 * Il tipo di un collegamento (fase5.md §5.1). Torna {url, tipo, cartella,
 * pillola}; un indirizzo che non va bene e' un Rifiuto con la frase da
 * mostrare. Gli spazi in fondo si tolgono; l'indirizzo si salva com'e'.
 */
function tipoCollegamento(valore) {
  const url = String(valore === null || valore === undefined ? '' : valore).trim();
  if (!url || /[\r\n\t]/.test(url)) throw new Rifiuto(ERRORE_COLLEGAMENTO);
  // Percorsi del computer dello studio: \\server\cartella, X:\cartella, file:///...
  if (/^\\\\[^\\/\s][^\\/]*\\/.test(url) || /^[A-Za-z]:\\/.test(url) || /^file:\/\/\//i.test(url)) {
    const pulito = url.replace(/^file:\/\/\//i, '');
    const ultimo = pulito.split(/[\\/]/).pop();
    const cartella = /[\\/]$/.test(pulito) || !/\.[A-Za-z0-9]{1,6}$/.test(ultimo);
    return { url, tipo: 'percorso', cartella, pillola: PILLOLE.percorso };
  }
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    throw new Rifiuto(ERRORE_COLLEGAMENTO);
  }
  if (u.protocol !== 'https:' || !u.hostname || /\s/.test(url)) throw new Rifiuto(ERRORE_COLLEGAMENTO);
  const host = u.hostname.toLowerCase();
  const resto = u.pathname + u.search;
  if (/-my\.sharepoint\.com$/.test(host) || host === '1drv.ms' || host === 'onedrive.live.com' || /\.onedrive\.live\.com$/.test(host)) {
    return { url, tipo: 'onedrive', cartella: /\/:f:\//.test(resto) || /\/f\//.test(resto), pillola: PILLOLE.onedrive };
  }
  if (/\.sharepoint\.com$/.test(host)) {
    return { url, tipo: 'sharepoint', cartella: /\/:f:\//.test(resto) || /Forms\/AllItems/i.test(resto), pillola: PILLOLE.sharepoint };
  }
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    return { url, tipo: 'gdrive', cartella: /\/drive\/(u\/\d+\/)?folders\//.test(u.pathname), pillola: PILLOLE.gdrive };
  }
  return { url, tipo: 'web', cartella: false, pillola: PILLOLE.web };
}

/** "Verifica  dell'Impianto è" -> "verifica dell'impianto e": la ricerca non bada a maiuscole, accenti e spazi doppi. */
function pulisciRicerca(s) {
  return testo(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * I segnaposti dei testi dei modelli (fase5.md §5.7), piu' quelli che servono
 * ai testi delle email che le app scrivevano gia' (rapportino, data, periodo,
 * preventivo, oggetto, documento).
 */
const SEGNAPOSTI = ['cliente', 'indirizzo_cliente', 'referente', 'impianto', 'indirizzo_impianto', 'commessa', 'ticket', 'contratto',
  'canone', 'dal', 'al', 'scadenza', 'ultima_verifica', 'oggi', 'studio', 'tecnico',
  'rapportino', 'data', 'periodo', 'preventivo', 'oggetto', 'documento'];

/** I segnaposti scritti in un testo, nell'ordine in cui compaiono. */
function segnapostiIn(t) {
  return (String(t || '').match(/\{[^{}]*\}/g) || []).map(x => x.slice(1, -1));
}

/** Un testo con un segnaposto sconosciuto non si salva: la frase dice quale e quali si possono usare. */
function controllaSegnaposti(t) {
  for (const s of segnapostiIn(t)) {
    if (SEGNAPOSTI.indexOf(s) < 0) {
      throw new Rifiuto('Segnaposto sconosciuto: {' + s + '}. Si possono usare ' + SEGNAPOSTI.slice(0, 16).map(x => '{' + x + '}').join(', ') + ' (e nelle email ' +
        SEGNAPOSTI.slice(16).map(x => '{' + x + '}').join(', ') + ')');
    }
  }
}

/**
 * Riempie i segnaposti: torna {testo, mancano}. Quelli senza valore restano
 * scritti (l'app li mostra da completare) e sono in "mancano".
 */
function riempi(t, valori) {
  const mancano = [];
  const out = String(t || '').replace(/\{([a-z_]+)\}/g, (tutto, k) => {
    const v = valori[k];
    if (v === undefined || v === null || v === '') {
      if (mancano.indexOf(tutto) < 0) mancano.push(tutto);
      return tutto;
    }
    return String(v);
  });
  return { testo: out, mancano };
}

/**
 * Il tipo di un file dai suoi primi byte. Torna {mime, vietato}: mime e' il
 * tipo riconosciuto (o '' se non si sa), vietato la frase se e' un file che
 * non deve arrivare sul NAS (programmi, pagine web, script).
 */
function riconosciTipo(b) {
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(b || []);
  const ini = (s, da) => buf.length >= (da || 0) + s.length && buf.slice(da || 0, (da || 0) + s.length).equals(Buffer.from(s, 'binary'));
  if (ini('%PDF')) return { mime: 'application/pdf' };
  if (ini('\x89PNG\r\n\x1a\n')) return { mime: 'image/png' };
  if (ini('\xff\xd8\xff')) return { mime: 'image/jpeg' };
  if (ini('GIF87a') || ini('GIF89a')) return { mime: 'image/gif' };
  if (ini('RIFF') && ini('WEBP', 8)) return { mime: 'image/webp' };
  if (ini('ftypheic', 4) || ini('ftypheix', 4) || ini('ftypmif1', 4) || ini('ftyphevc', 4)) return { mime: 'image/heic' };
  if (ini('ftyp', 4)) return { mime: 'video/mp4' };
  if (ini('II*\x00') || ini('MM\x00*')) return { mime: 'image/tiff' };
  if (ini('PK\x03\x04') || ini('PK\x05\x06')) return { mime: 'application/zip' };
  if (ini('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1')) return { mime: 'application/x-ole-storage' };
  if (ini('Rar!')) return { mime: 'application/vnd.rar' };
  if (ini('7z\xbc\xaf\x27\x1c')) return { mime: 'application/x-7z-compressed' };
  if (ini('AC10')) return { mime: 'image/vnd.dwg' };
  if (ini('MZ')) return { mime: '', vietato: 'È un programma per Windows: i programmi non si caricano' };
  if (ini('\x7fELF') || ini('\xca\xfe\xba\xbe') || ini('\xcf\xfa\xed\xfe') || ini('\xce\xfa\xed\xfe')) return { mime: '', vietato: 'È un programma: i programmi non si caricano' };
  if (ini('#!')) return { mime: '', vietato: 'È uno script: gli script non si caricano' };
  const inizio = buf.slice(0, 512).toString('latin1').replace(/^\ufeff|^\xef\xbb\xbf/, '').trimStart().toLowerCase();
  if (/^<!doctype html|^<html|^<script|^<svg|^<\?xml[^>]*>\s*<svg/.test(inizio)) {
    return { mime: '', vietato: 'È una pagina web: per una pagina web si incolla il collegamento' };
  }
  if (/^<\?xml/.test(inizio)) return { mime: 'application/xml' };
  // Testo semplice (txt, csv, dxf): niente byte zero all'inizio.
  if (buf.length && buf.slice(0, 512).indexOf(0) < 0) return { mime: 'text/plain' };
  return { mime: '' };
}

/** Le famiglie che si confrontano col tipo dichiarato: un "PDF" deve essere un PDF, un'immagine un'immagine. */
function famiglia(mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (/^image\/(png|jpe?g|gif|webp|heic|heif|tiff)$/.test(m)) return 'immagine';
  return '';
}

/**
 * Il tipo da salvare per un file: controlla che i primi byte dicano la stessa
 * cosa del tipo dichiarato (per PDF e immagini) e non tiene mai un tipo che
 * il browser eseguirebbe (pagine web, script). Torna il mime da salvare o un
 * Rifiuto con la frase.
 */
function tipoDaSalvare(dichiarato, primiByte) {
  const r = riconosciTipo(primiByte);
  if (r.vietato) throw new Rifiuto('Questo file non si carica: ' + r.vietato.charAt(0).toLowerCase() + r.vietato.slice(1));
  let d = String(dichiarato || '').toLowerCase().split(';')[0].trim();
  const fd = famiglia(d);
  const fr = famiglia(r.mime);
  if (fd && fd !== fr) {
    throw new Rifiuto(fd === 'pdf' ? 'Il file dice di essere un PDF ma dentro non lo è: controlla di aver scelto il file giusto'
      : 'Il file dice di essere una foto ma dentro non lo è: controlla di aver scelto il file giusto');
  }
  if (/html|javascript|ecmascript|svg|xhtml/.test(d)) d = 'application/octet-stream';
  if (!d) d = r.mime && r.mime !== 'text/plain' ? r.mime : r.mime === 'text/plain' ? 'text/plain' : 'application/octet-stream';
  if (fr && (!fd || r.mime !== d) && r.mime) d = r.mime;
  return d;
}

/** La grandezza in MB con una cifra decimale all'italiana ("1,6 GB" o "48,2 MB"). */
function grandezza(mb) {
  const n = Number(mb) || 0;
  if (n >= 1024) return (Math.round(n / 102.4) / 10).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' GB';
  return (Math.round(n * 10) / 10).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';
}

module.exports = {
  tipoCollegamento, PILLOLE, ERRORE_COLLEGAMENTO, pulisciRicerca, SEGNAPOSTI, segnapostiIn, controllaSegnaposti, riempi,
  riconosciTipo, tipoDaSalvare, famiglia, grandezza,
};
