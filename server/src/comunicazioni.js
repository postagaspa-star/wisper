/*
 * Le regole delle comunicazioni (fase7.md §9), senza database: si possono rifare uguali in Kotlin e in
 * pc/ui/regole-comunicazioni.js coi casi condivisi di server/prove/casi-whatsapp.json.
 *
 *  - numeroWhatsapp(testo): il numero di telefono ridotto a cifre internazionali per wa.me (§9.3);
 *  - linkWhatsapp(numero, testo): il messaggio pronto https://wa.me/<numero>?text=<testo> (§9.4);
 *  - i segnaposti dei modelli per uso, il controllo al salvataggio, il riempimento con "mancano" e la riga di {portale}
 *    che sparisce quando il cliente non ha il portale (§9.2).
 */
'use strict';

const { Rifiuto, testo } = require('./utili');

/**
 * Il numero per WhatsApp (§9.3, con le precisazioni dell'01/11/2026 di casi-whatsapp.json):
 *  1. tieni solo cifre e un + iniziale; 2. + davanti: togli il +; 00 davanti: togli 00;
 *  3. solo senza + o 00 davanti: comincia con 3 e ha 9 o 10 cifre (cellulare italiano): 39 davanti;
 *  4. solo senza + o 00 davanti: comincia con 0 e ha da 6 a 11 cifre (fisso italiano): 39 davanti, fisso;
 *  5. comincia con 39 e ha 11 o 12 cifre: cosi' (fisso se dopo il 39 viene uno 0);
 *  6. altrimenti da 8 a 15 cifre: cosi' (estero col prefisso). Fuori da questi casi: non valido.
 * Torna {valido, numero, fisso, visto} (visto: "+39 333 000 1122", "+39 0445000100", "+41790001122").
 */
function numeroWhatsapp(t) {
  const pulito = testo(t).replace(/[^\d+]/g, '');
  let cifre = pulito.replace(/\+/g, '');
  let prefisso = false;
  if (pulito.charAt(0) === '+') prefisso = true;
  else if (cifre.slice(0, 2) === '00') { cifre = cifre.slice(2); prefisso = true; }
  let numero = '';
  let fisso = false;
  if (!cifre) return { valido: false };
  if (!prefisso && cifre.charAt(0) === '3' && (cifre.length === 9 || cifre.length === 10)) numero = '39' + cifre;
  else if (!prefisso && cifre.charAt(0) === '0' && cifre.length >= 6 && cifre.length <= 11) { numero = '39' + cifre; fisso = true; }
  else if (cifre.slice(0, 2) === '39' && (cifre.length === 11 || cifre.length === 12)) { numero = cifre; fisso = cifre.charAt(2) === '0'; }
  else if (cifre.length >= 8 && cifre.length <= 15) numero = cifre;
  else return { valido: false };
  return { valido: true, numero, fisso, visto: numeroVisto(numero) };
}

/** Come si mostra: Italia cellulare "+39 333 000 1122"; Italia fisso "+39 0445000100"; estero "+41790001122". */
function numeroVisto(numero) {
  const n = String(numero || '');
  if (n.slice(0, 2) === '39' && n.charAt(2) === '3') {
    const r = n.slice(2);
    return '+39 ' + r.slice(0, 3) + ' ' + r.slice(3, 6) + ' ' + r.slice(6);
  }
  if (n.slice(0, 2) === '39' && n.charAt(2) === '0') return '+39 ' + n.slice(2);
  return '+' + n;
}

/** Il messaggio pronto (§9.4): il testo codificato con encodeURIComponent (lettere accentate e a capo restano). */
function linkWhatsapp(numero, t) {
  return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(String(t || ''));
}

/** I segnaposti per uso (§9.2). "sempre" vale per tutti; appuntamento e intervento hanno gli stessi. */
const SEGNAPOSTI = {
  sempre: ['{nome}', '{cliente}', '{studio}', '{mittente}', '{telefono_studio}', '{oggi}', '{portale}'],
  appuntamento: ['{giorno}', '{ora}', '{cosa}', '{luogo}', '{impianto}', '{commessa}', '{ticket}'],
  intervento: ['{giorno}', '{ora}', '{cosa}', '{luogo}', '{impianto}', '{commessa}', '{ticket}'],
  preventivo: ['{preventivo}', '{oggetto}', '{scadenza}', '{totale}'],
  rapportino: ['{data}', '{lavoro}', '{rapportino}'],
  pagamento: ['{fattura}', '{data_fattura}', '{importo}', '{scadenza}'],
  portale: [],
  libero: [],
};
const USI = ['appuntamento', 'intervento', 'preventivo', 'rapportino', 'pagamento', 'portale', 'libero'];
const CANALI_MODELLO = ['whatsapp', 'email', 'tutti'];

/** I segnaposti che un modello di quell'uso puo' usare. */
function segnapostiDi(uso) {
  return SEGNAPOSTI.sempre.concat(SEGNAPOSTI[uso] || []);
}

/** Un segnaposto sconosciuto o di un altro uso si rifiuta al salvataggio, con quelli che si possono usare. */
function controllaSegnaposti(t, uso) {
  const ammessi = segnapostiDi(uso);
  const trovati = String(t || '').match(/\{[^{}\s]{1,40}\}/g) || [];
  for (const s of trovati) {
    if (ammessi.indexOf(s) < 0) throw new Rifiuto('Segnaposto sconosciuto: ' + s + '. Si possono usare ' + ammessi.join(', '));
  }
}

/**
 * Riempie un testo coi valori: i segnaposti senza valore restano scritti e tornano in "mancano" (le app li mostrano in
 * giallo scuro da completare). Una riga che contiene {portale} sparisce se il cliente non ha il portale acceso o il
 * portale non e' collegato (valori.portale vuoto): mai un link d'accesso nei messaggi, solo l'indirizzo.
 */
function riempi(t, valori) {
  let s = String(t || '');
  if (!testo(valori.portale)) {
    s = s.split('\n').filter(riga => riga.indexOf('{portale}') < 0).join('\n');
  }
  const mancano = [];
  const out = s.replace(/\{([a-z_]+)\}/g, (tutto, k) => {
    const v = valori[k];
    if (v === undefined || v === null || v === '') {
      if (mancano.indexOf(tutto) < 0) mancano.push(tutto);
      return tutto;
    }
    return String(v);
  });
  return { testo: out, mancano };
}

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** "2026-10-23" -> "giovedì 23 ottobre". */
function giornoLungo(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ''))) return '';
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
}

/** "2026-10-23T09:00:00" -> "9:00". */
function oraBreve(istante) {
  const m = String(istante || '').match(/T(\d{2}):(\d{2})/);
  return m ? Number(m[1]) + ':' + m[2] : '';
}

/** "2026-10-23" -> "23/10/2026". */
function dataIt(iso) {
  const s = String(iso || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
}

module.exports = {
  numeroWhatsapp, numeroVisto, linkWhatsapp, SEGNAPOSTI, USI, CANALI_MODELLO, segnapostiDi, controllaSegnaposti, riempi,
  giornoLungo, oraBreve, dataIt, GIORNI, MESI,
};
