/*
 * Le piccole regole che servono dappertutto: testi, numeri, date, si/no.
 * Sono le stesse funzioni di apps-script/Code.gs (testo, numero, siNoONull...),
 * copiate una per una: il server deve leggere i dati come li leggeva lo script.
 */
'use strict';

// Lo studio e' in Italia, e le date di Code.gs sono tutte "Europe/Rome": un
// rapportino del 31 dicembre alle 23:30 resta nell'anno vecchio anche se il NAS
// avesse l'orologio in UTC. Va prima di qualunque new Date().
process.env.TZ = 'Europe/Rome';

const crypto = require('node:crypto');

/** Un errore che il server dice a chi chiama: la frase va mostrata cosi' com'e'. */
class Rifiuto extends Error {
  constructor(messaggio, extra) {
    super(messaggio);
    this.extra = extra || {};
  }
}

/** Manca un permesso: la risposta porta anche "permesso": false. */
function senzaPermesso(cosa) {
  return new Rifiuto('Non hai il permesso per ' + cosa + ': chiedi al titolare', { permesso: false });
}

function testo(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function numero(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function numeroONull(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return numero(v);
}

/** 'SI' -> true, 'NO' -> false, vuoto -> null (= decide il gruppo). Anche 1/0 del database. */
function siNoONull(v) {
  if (v === 1) return true;
  if (v === 0) return false;
  const s = testo(v).toUpperCase();
  if (s === 'SI' || s === 'SÌ' || s === 'TRUE' || s === 'X') return true;
  if (s === 'NO' || s === 'FALSE') return false;
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

/** Per il database: true/false/null -> 1/0/null. */
function unoZero(v) {
  const s = siNoONull(v);
  return s === null ? null : (s ? 1 : 0);
}

/** "ID_Cliente", "ID CLIENTE", "id cliente" -> "idcliente" */
function normalizza(s) {
  return String(s === null || s === undefined ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function centesimi(n) {
  return Math.round(n * 100) / 100;
}

const due = n => String(n).padStart(2, '0');

function eData(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

/** Una data (Date, "15/10/2026", "2026-10-15" o un istante ISO) -> "2026-10-15", ora italiana. */
function dataIso(v) {
  if (eData(v)) return v.getFullYear() + '-' + due(v.getMonth() + 1) + '-' + due(v.getDate());
  const s = testo(v);
  const it = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (it) return it[3] + '-' + due(it[2]) + '-' + due(it[1]);
  // Un istante con il fuso ("2026-10-15T23:30:00+02:00"): la data e' quella italiana.
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s);
    if (eData(d)) return dataIso(d);
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : '';
}

/** "2026-10-15" (o "15/10/2026") controllata; se non e' una data, l'errore di Code.gs. */
function dataDaIso(s) {
  const iso = dataIso(s);
  if (!iso) throw new Rifiuto('Data non valida: ' + s);
  return iso;
}

/** Un istante come si salva nel database: ISO col fuso, "2026-10-21T21:30:00+02:00". */
function istante(d) {
  d = d === undefined ? ora() : d;
  if (!eData(d)) d = new Date(d);
  if (!eData(d)) return null;
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()) + 'T' +
    due(d.getHours()) + ':' + due(d.getMinutes()) + ':' + due(d.getSeconds()) +
    (off >= 0 ? '+' : '-') + due(Math.floor(a / 60)) + ':' + due(a % 60);
}

/*
 * L'orologio di prova: con WISPER_OGGI_PROVA=AAAA-MM-GG il server crede che oggi sia quel giorno. Le ore
 * restano quelle vere: l'orologio e' spostato di giorni interi una volta sola, all'accensione, e poi va
 * avanti da solo (un'ora dopo e' un'ora dopo anche li').
 * Lo accendono SOLO avvia() con --prova (database in memoria coi dati di esempio, che riparte da capo a
 * ogni avvio) e prove/aiuto.js. Il server vero (avvio.js senza --prova) non chiama mai
 * accendiOrologioDiProva(): la variabile, anche se finisse nel .env del NAS, non conta niente
 * (prove/orologio.test.js lo controlla).
 */
let spostamentoMs = 0;
let giornoDiProva = '';

/** Accende l'orologio di prova su "AAAA-MM-GG" (vuoto: niente). Una data sbagliata ferma tutto, invece di provare sul giorno vero. */
function accendiOrologioDiProva(valore) {
  const s = testo(valore);
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const g = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
  if (!m || !eData(g) || dataIso(g) !== s) throw new Error('WISPER_OGGI_PROVA non e\' una data AAAA-MM-GG: "' + s + '"');
  const vero = new Date();
  const finto = new Date(g.getFullYear(), g.getMonth(), g.getDate(), vero.getHours(), vero.getMinutes(), vero.getSeconds(), vero.getMilliseconds());
  spostamentoMs = finto.getTime() - vero.getTime();
  giornoDiProva = s;
  return s;
}

/** Torna all'orologio vero (per le prove che fermano Date da sole, come migrazione-006.test.js). */
function spegniOrologioDiProva() {
  spostamentoMs = 0;
  giornoDiProva = '';
}

/** Il giorno dell'orologio di prova acceso ("" = l'orologio e' quello vero). */
function orologioDiProva() {
  return giornoDiProva;
}

/** Adesso, come Date: quello vero, o quello dell'orologio di prova. Al posto di new Date() senza argomenti. */
function ora() {
  return new Date(Date.now() + spostamentoMs);
}

/** Adesso in millisecondi: al posto di Date.now() quando si confronta con le date salvate. */
function adessoMs() {
  return Date.now() + spostamentoMs;
}

function adesso() {
  return istante(ora());
}

/**
 * Un istante come lo mandava lo script: "2026-10-21T21:30:00", ora italiana,
 * senza fuso (telefono e computer lo leggono cosi'). Un testo che non e' un
 * istante resta com'e', come dataOraIso() di Code.gs.
 */
function dataOraIso(v) {
  if (v === null || v === undefined || v === '') return '';
  if (eData(v)) return locale(v);
  const s = testo(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s);
    if (eData(d)) return locale(d);
  }
  return s;
}

function locale(d) {
  return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()) + 'T' +
    due(d.getHours()) + ':' + due(d.getMinutes()) + ':' + due(d.getSeconds());
}

/** Oggi, "2026-10-21", ora italiana. */
function oggi() {
  return dataIso(ora());
}

/** "2026-10-21" piu' n giorni. */
function piuGiorni(iso, n) {
  const [a, m, g] = iso.split('-').map(Number);
  return dataIso(new Date(a, m - 1, g + n, 12));
}

/**
 * Una partita IVA arrivata come numero ha perso gli zeri davanti: una partita
 * IVA italiana ha sempre 11 cifre, quindi si rimettono senza indovinare.
 */
function partitaIvaDalFoglio(v) {
  if (typeof v === 'number' && isFinite(v)) {
    const s = String(Math.round(v));
    return s.length < 11 ? ('00000000000' + s).slice(-11) : s;
  }
  return testo(senzaApostrofo(v));
}

/** Un telefono diventato numero: il fisso riprende lo 0, il +39 torna, il cellulare resta. */
function telefonoDalFoglio(v) {
  if (typeof v === 'number' && isFinite(v)) {
    const s = String(Math.round(v));
    if (/^39\d{9,}$/.test(s)) return '+' + s;
    return s.charAt(0) === '3' ? s : '0' + s;
  }
  return testo(senzaApostrofo(v));
}

function senzaApostrofo(v) {
  return typeof v === 'string' && v.charAt(0) === '\'' ? v.slice(1) : v;
}

/** Un identificativo casuale: 28 caratteri [A-Za-z0-9_-], come vuole l'accordo per i file nuovi. */
function idCasuale() {
  return crypto.randomBytes(21).toString('base64url');
}

function sha256(dati) {
  return crypto.createHash('sha256').update(dati).digest('hex');
}

function messaggio(err) {
  return err && err.message ? err.message : String(err);
}

module.exports = {
  Rifiuto, senzaPermesso, testo, numero, numeroONull, siNoONull, unoZero, normalizza, centesimi,
  eData, dataIso, dataDaIso, istante, adesso, dataOraIso, oggi, piuGiorni, partitaIvaDalFoglio,
  accendiOrologioDiProva, spegniOrologioDiProva, orologioDiProva, ora, adessoMs,
  telefonoDalFoglio, senzaApostrofo, idCasuale, sha256, messaggio, due,
};
