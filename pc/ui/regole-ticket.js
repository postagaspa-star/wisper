/*
 * Wisper Ufficio: le regole di Documenti e di Ticket e assistenza (fase 5), senza niente di grafico.
 *
 * Quello che il computer rifà da solo mentre si scrive (docs/gestionale/fase5.md, architettura.md
 * §16.21): la priorità dalle due domande, i tempi d'intervento, il tipo di un collegamento mentre
 * si incolla, la riga di fattura di un ticket chiuso "una riga per l'intervento". Sono gli stessi
 * conti del server (server/src/conti.js, server/src/documenti.js) e si provano con i suoi casi
 * (server/prove/casi-ticket.json, casi-collegamenti.json, casi-fattura.json: pc/prove/ticket.test.js).
 * Più le parole e i colori fissi delle pillole, uguali su telefono e computer (fase5.md §12).
 *
 * Il server decide sempre: qui si mostra prima, mentre la persona risponde.
 */
(function (radice) {
  'use strict';

  const due = n => String(n).padStart(2, '0');
  const testo = v => (v === null || v === undefined ? '' : String(v)).trim();
  const numero = v => { const n = Number(String(v === null || v === undefined ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const scritto = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) !== 0;
  const centesimi = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const due2 = n => Math.round(Number(n) * 100) / 100;
  const numeroIt = n => { const x = due2(n); return (Number.isInteger(x) ? String(x) : String(x).replace('.', ',')).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  const euroIt = n => centesimi(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dataIt = iso => { const s = testo(iso).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s; };

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

  // ------------------------------------------------------------------ parole fisse (fase5.md §12)

  const STATI_TICKET = { aperto: 'Aperto', in_carico: 'In carico', in_attesa: 'In attesa', risolto: 'Risolto', chiuso: 'Chiuso', annullato: 'Annullato' };
  const PRIORITA = [['urgente', 'Urgente'], ['alta', 'Alta'], ['normale', 'Normale'], ['bassa', 'Bassa']];
  const TIPI_TICKET = [['guasto', 'Guasto'], ['verifica', 'Verifica'], ['piccolo', 'Piccolo intervento'], ['assistenza', 'Assistenza']];
  const ORIGINI = [['telefono', 'Telefono'], ['email', 'Email'], ['sopralluogo', 'Sopralluogo'], ['ufficio', 'Ufficio']];
  const IMPATTI = [['fermo', 'Fermo'], ['ridotto', 'Va a metà'], ['nessuno', 'Funziona']];
  const URGENZE = [['subito', 'Subito'], ['presto', 'Entro domani'], ['quando_si_puo', 'Quando si può']];
  const FATTURAZIONI = [
    ['ticket', 'Una riga per l\'intervento', 'Una voce in Da fatturare con rapportini, ore e spese'],
    ['separati', 'Con gli altri rapportini', 'I rapportini e le ore vanno in Da fatturare come sempre'],
    ['contratto', 'Nel contratto', 'Lo copre il canone del contratto'],
    ['no', 'Non si fattura', 'Garanzia o cortesia, col motivo'],
  ];
  const FATTURAZIONE_BREVE = { ticket: 'Una riga', separati: 'Con i rapportini', contratto: 'Nel contratto', no: 'Non si fattura' };
  const CATEGORIE_IMPIANTO = [['cabina_mt', 'Cabina MT'], ['quadro', 'Quadro'], ['terra', 'Impianto di terra'], ['scariche', 'Protezione dalle scariche'],
    ['fotovoltaico', 'Fotovoltaico'], ['automazione', 'Automazione'], ['illuminazione', 'Illuminazione'], ['altro', 'Altro']];
  const AMBIENTI = [['ordinario', 'Ordinario'], ['cantiere', 'Cantiere'], ['medico', 'Locale medico'], ['incendio', 'Rischio d\'incendio'], ['esplosione', 'Rischio d\'esplosione']];
  const TIPI_SCADENZA = [['verifica_terra', 'Verifica impianto di terra'], ['verifica_scariche', 'Verifica protezione dalle scariche'], ['verifica_protezioni', 'Verifica protezioni SPG e SPI'],
    ['manutenzione', 'Manutenzione'], ['documento', 'Documento'], ['polizza', 'Polizza'], ['contratto', 'Contratto'], ['altro', 'Altro']];
  const COLLEGAMENTI = { onedrive: 'OneDrive', sharepoint: 'SharePoint', gdrive: 'Google Drive', percorso: 'Cartella del computer', web: 'Sito' };
  const RATE = [['annuale', 'Annuale'], ['semestrale', 'Semestrale'], ['trimestrale', 'Trimestrale'], ['mensile', 'Mensile'], ['nessuna', 'Nessuna']];
  const VEDE = { tutti: 'Tutti', costi: 'Chi vede i prezzi', riservati: 'Solo il titolare' };

  const nomeDi = (lista, k) => { const x = lista.find(v => v[0] === k); return x ? x[1] : ''; };

  /** I colori delle pillole, sempre con la parola: p-rosso, p-ambra, p-giallo, p-blu, p-verde, p-grigio (fase5.md §12). */
  function coloreStatoTicket(stato) {
    return { aperto: 'giallo', in_carico: 'blu', in_attesa: 'ambra', risolto: 'verde' }[stato] || 'grigio';
  }
  function colorePriorita(p) {
    return { urgente: 'rosso', alta: 'ambra', normale: 'grigio', bassa: 'chiaro' }[p] || 'grigio';
  }
  function coloreScadenza(statoVisto) {
    const s = testo(statoVisto);
    if (s === 'Scaduta') return 'rosso';
    if (/^Scade/.test(s)) return 'ambra';
    if (s === 'Fatta') return 'verde';
    return 'grigio';
  }
  function coloreDocumento(statoVisto) {
    return { Valida: 'verde', 'Da approvare': 'giallo', Respinta: 'rosso', Superata: 'grigio', Collegamento: 'blu', 'Da classificare': 'ambra', Archiviato: 'grigio' }[testo(statoVisto)] || 'grigio';
  }
  function coloreContratto(statoVisto) {
    return { Bozza: 'grigio', Attivo: 'verde', 'In scadenza': 'ambra', Scaduto: 'rosso' }[testo(statoVisto)] || 'grigio';
  }
  function coloreRata(stato) {
    return { prevista: 'grigio', in_bozza: 'giallo', fatturata: 'verde' }[stato] || 'grigio';
  }

  /** Il pulsante giallo del ticket (architettura §16.11 "giallo"): la cosa da fare adesso. */
  function testoGiallo(giallo) {
    return { prendi: 'Prendo io', pianifica: 'Pianifica l\'intervento', rapportino: 'Scrivi il rapportino', risolvi: 'Segna risolto', chiudi: 'Chiudi il ticket', riprendi: 'Riprendi' }[giallo] || '';
  }

  /** A che passo è: Aperto → In carico → Risolto → Chiuso (0..3); annullato -1. */
  function passoTicket(stato) {
    if (stato === 'annullato') return -1;
    return { aperto: 0, in_carico: 1, in_attesa: 1, risolto: 2, chiuso: 3 }[stato] || 0;
  }

  /** Il pulsante che apre un collegamento: "Apri in OneDrive", "Apri il sito"; un percorso si apre in Esplora file. */
  function testoApriCollegamento(tipo) {
    return { onedrive: 'Apri in OneDrive', sharepoint: 'Apri in SharePoint', gdrive: 'Apri in Google Drive', web: 'Apri il sito', percorso: 'Apri in Esplora file' }[tipo] || 'Apri';
  }

  /** La riga che spiega chi tiene le revisioni di un collegamento (architettura §16.4 "righe", per il computer). */
  function rigaCollegamento(tipo) {
    if (tipo === 'percorso') return 'Si apre in Esplora file, dal computer dello studio.';
    if (tipo === 'web') return 'Il file è su un sito: Wisper non ne tiene una copia.';
    return COLLEGAMENTI[tipo] ? 'Le revisioni le tiene ' + COLLEGAMENTI[tipo] + '.' : '';
  }

  // ------------------------------------------------------------------ priorità e tempi (casi-ticket.json)

  const MATRICE_PRIORITA = {
    fermo: { subito: 'urgente', presto: 'alta', quando_si_puo: 'normale' },
    ridotto: { subito: 'alta', presto: 'normale', quando_si_puo: 'bassa' },
    nessuno: { subito: 'normale', presto: 'bassa', quando_si_puo: 'bassa' },
  };

  /** La priorità dalle due domande: "L'impianto è fermo?" e "Per quando?". Senza risposte: normale. */
  function prioritaDa(impatto, urgenza) {
    const riga = MATRICE_PRIORITA[testo(impatto)];
    return (riga && riga[testo(urgenza)]) || 'normale';
  }

  /** "Cambia": la priorità scritta a mano vince (prioritaAMano), le risposte restano. Vuota = torna automatica. */
  function conPriorita(x) {
    const auto = prioritaDa(x.impatto, x.urgenza);
    const scelta = testo(x.priorita);
    return { priorita: scelta || auto, prioritaAMano: !!scelta && scelta !== auto, impatto: testo(x.impatto), urgenza: testo(x.urgenza) };
  }

  const TEMPI_STUDIO = { urgente: { presa: 1, intervento: 4 }, alta: { presa: 2, intervento: 24 }, normale: { presa: 8, intervento: 72 }, bassa: { presa: 24, intervento: 240 } };

  /** "2026-10-22T08:40:00" come istante del computer (ora italiana, senza fuso nel testo). */
  function istante(iso) {
    const m = testo(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
  }
  function isoDi(d) {
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()) + 'T' + due(d.getHours()) + ':' + due(d.getMinutes()) + ':' + due(d.getSeconds());
  }

  /**
   * Entro quando si prende e si interviene: ore di calendario (notti e domeniche contano) dall'apertura,
   * dalla tabella dello studio o dai tempi del contratto (solo le voci che cambiano). Un programmato: entro la
   * fine del giorno previsto, senza presa.
   */
  function tempiTicket(x) {
    if (x.tipo === 'programmato' && x.previstoIl) return { entroPresa: '', entroIntervento: testo(x.previstoIl).slice(0, 10) + 'T23:59:59' };
    const studio = x.tempi || TEMPI_STUDIO;
    const p = x.priorita || 'normale';
    const base = Object.assign({}, studio[p] || TEMPI_STUDIO[p]);
    const dalContratto = x.contratto && x.contratto[p];
    if (dalContratto) Object.keys(dalContratto).forEach(k => { base[k] = dalContratto[k]; });
    const da = istante(x.apertoIl);
    if (!da) return { entroPresa: '', entroIntervento: '' };
    const piu = ore => isoDi(new Date(da.getTime() + Math.round(numero(ore) * 3600000)));
    return { entroPresa: piu(base.presa), entroIntervento: piu(base.intervento) };
  }

  /** "oggi alle 12:40", "domani alle 9:00", "giovedì 23 alle 9:00", "ieri alle 9:00", "martedì 20 ottobre alle 9:15". */
  function quando(iso, adesso) {
    const d = istante(iso);
    if (!d) return '';
    const ora = d.getHours() + ':' + due(d.getMinutes());
    return giornoA(d, adesso) + ' alle ' + ora;
  }
  function giornoA(d, adesso) {
    const oggi = adesso ? new Date(adesso) : new Date();
    const g0 = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
    const g1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((g1 - g0) / 86400000);
    if (diff === 0) return 'oggi';
    if (diff === 1) return 'domani';
    if (diff === -1) return 'ieri';
    if (diff > 1 && diff < 7) return GIORNI[d.getDay()] + ' ' + d.getDate();
    return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + (d.getFullYear() !== oggi.getFullYear() ? ' ' + d.getFullYear() : '');
  }

  /** "entro oggi alle 12:40"; la fine di un giorno (23:59:59) è "entro il 20/11". */
  function entro(iso, adesso) {
    const s = testo(iso);
    if (!s) return '';
    if (/T23:59:59$/.test(s)) return 'entro il ' + dataIt(s).slice(0, 5);
    return 'entro ' + quando(s, adesso);
  }

  /** Con la prima lettera grande (righe, tabelle). */
  const maiuscola = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /** Il giorno grande a sinistra delle righe delle scadenze: { g: "30", m: "set 26" }. */
  function giornoGrande(iso) {
    const s = testo(iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { g: '', m: '' };
    return { g: String(Number(s.slice(8, 10))), m: MESI_BREVI[Number(s.slice(5, 7)) - 1] + ' ' + s.slice(2, 4) };
  }

  /** "ogni 5 anni", "ogni 6 mesi", "ogni anno", "una volta". */
  function ogni(mesi) {
    const m = numero(mesi);
    if (!m) return 'una volta';
    if (m === 12) return 'ogni anno';
    if (m % 12 === 0) return 'ogni ' + (m / 12) + ' anni';
    return m === 1 ? 'ogni mese' : 'ogni ' + m + ' mesi';
  }

  /** La somma del ticket in parole: "2,5 ore · 24 km · materiale 18,50 €" (le parti a zero non si dicono). */
  function sommaTesto(s) {
    const x = s || {};
    const parti = [];
    if (numero(x.ore) > 0) parti.push(numeroIt(x.ore) + (numero(x.ore) === 1 ? ' ora' : ' ore'));
    if (numero(x.km) > 0) parti.push(numeroIt(x.km) + ' km');
    if (numero(x.materiale) > 0) parti.push('materiale ' + euroIt(x.materiale) + ' €');
    if (numero(x.spese) > 0) parti.push('spese ' + euroIt(x.spese) + ' €');
    return parti.join(' · ');
  }

  // ------------------------------------------------------------------ collegamenti (casi-collegamenti.json)

  const ERRORE_COLLEGAMENTO = 'Collegamento: incolla un indirizzo che comincia con https:// o un percorso come \\\\server\\cartella';

  /**
   * Il tipo di un collegamento dall'indirizzo (fase5.md §5.1), come server/src/documenti.js:
   * { url, tipo, cartella, pillola } oppure { errore } per quelli che non vanno.
   */
  function tipoCollegamento(valore) {
    const url = String(valore === null || valore === undefined ? '' : valore).trim();
    if (!url || /[\r\n\t]/.test(url)) return { errore: ERRORE_COLLEGAMENTO };
    if (/^\\\\[^\\/\s][^\\/]*\\/.test(url) || /^[A-Za-z]:\\/.test(url) || /^file:\/\/\//i.test(url)) {
      const pulito = url.replace(/^file:\/\/\//i, '');
      const ultimo = pulito.split(/[\\/]/).pop();
      const cartella = /[\\/]$/.test(pulito) || !/\.[A-Za-z0-9]{1,6}$/.test(ultimo);
      return { url, tipo: 'percorso', cartella, pillola: COLLEGAMENTI.percorso };
    }
    let u;
    try { u = new URL(url); } catch (e) { return { errore: ERRORE_COLLEGAMENTO }; }
    if (u.protocol !== 'https:' || !u.hostname || /\s/.test(url)) return { errore: ERRORE_COLLEGAMENTO };
    const host = u.hostname.toLowerCase();
    const resto = u.pathname + u.search;
    if (/-my\.sharepoint\.com$/.test(host) || host === '1drv.ms' || host === 'onedrive.live.com' || /\.onedrive\.live\.com$/.test(host)) {
      return { url, tipo: 'onedrive', cartella: /\/:f:\//.test(resto) || /\/f\//.test(resto), pillola: COLLEGAMENTI.onedrive };
    }
    if (/\.sharepoint\.com$/.test(host)) return { url, tipo: 'sharepoint', cartella: /\/:f:\//.test(resto) || /Forms\/AllItems/i.test(resto), pillola: COLLEGAMENTI.sharepoint };
    if (host === 'drive.google.com' || host === 'docs.google.com') return { url, tipo: 'gdrive', cartella: /\/drive\/(u\/\d+\/)?folders\//.test(u.pathname), pillola: COLLEGAMENTI.gdrive };
    return { url, tipo: 'web', cartella: false, pillola: COLLEGAMENTI.web };
  }

  /** Il titolo proposto da un nome di file o da un indirizzo: "Schema unifilare rev3.pdf" -> "Schema unifilare rev3". */
  function titoloProposto(nome) {
    let s = testo(nome);
    if (!s) return '';
    try { s = decodeURIComponent(s); } catch (e) { /* resta com'è */ }
    s = s.replace(/[?#].*$/, '').replace(/[\\/]+$/, '');
    s = s.split(/[\\/]/).pop() || s;
    return s.replace(/\.[A-Za-z0-9]{1,6}$/, '').replace(/[_]+/g, ' ').trim();
  }

  /** Un indirizzo lungo accorciato per la pagina: l'inizio e la fine, il resto coi puntini. */
  function accorcia(url, quanto) {
    const s = testo(url);
    const n = quanto || 56;
    if (s.length <= n) return s;
    return s.slice(0, Math.ceil(n * 0.6)) + '…' + s.slice(-Math.floor(n * 0.35));
  }

  /** "1,2 MB", "830 KB": la grandezza di un file. */
  function grandezza(byte) {
    const b = numero(byte);
    if (!b) return '';
    if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
    return String(Math.round(b / 1048576 * 10) / 10).replace('.', ',') + ' MB';
  }

  /** Il tipo di un file a parole, dal mime o dal nome: "PDF", "Foto", "Word"... */
  function tipoFile(mime, nome) {
    const m = testo(mime).toLowerCase();
    const e = (testo(nome).match(/\.([A-Za-z0-9]{1,6})$/) || [])[1];
    const est = e ? e.toLowerCase() : '';
    if (m === 'application/pdf' || est === 'pdf') return 'PDF';
    if (/^image\//.test(m) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].indexOf(est) >= 0) return 'Foto';
    if (['doc', 'docx', 'odt', 'rtf'].indexOf(est) >= 0) return 'Word';
    if (['xls', 'xlsx', 'ods', 'csv'].indexOf(est) >= 0) return 'Excel';
    if (['dwg', 'dxf'].indexOf(est) >= 0) return 'Disegno';
    if (est === 'zip') return 'Archivio zip';
    return est ? est.toUpperCase() : 'File';
  }

  /** Il mime di un file dal nome, per /carica (il server lo ricontrolla sui primi byte). */
  function mimeDi(nome) {
    const est = ((testo(nome).match(/\.([A-Za-z0-9]{1,6})$/) || [])[1] || '').toLowerCase();
    return { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      txt: 'text/plain', csv: 'text/csv', zip: 'application/zip', dwg: 'application/acad', dxf: 'application/dxf', xml: 'application/xml' }[est] || 'application/octet-stream';
  }

  // ------------------------------------------------------------------ la riga di fattura (casi-fattura.json, raggruppamento E)

  function orePagate(r, pagaViaggioCliente) {
    const paga = r.pagaViaggio !== undefined && r.pagaViaggio !== null ? !!r.pagaViaggio : !!pagaViaggioCliente;
    return numero(r.oreLavoro) + numero(r.oreExtra) + (paga ? numero(r.oreViaggio) : 0);
  }
  const importoRapportino = r => centesimi(numero(r.compensoOre) + numero(r.rimborsoKm));

  /**
   * La riga di fattura di un ticket chiuso "una riga per l'intervento" (fase5.md §7.6), come righeTicket del
   * server: [{gruppo, righe, sorgenti}]. Il computer la mostra nella finestra Chiudi il ticket.
   */
  function righeTicket(x) {
    const t = x.ticket || {};
    const cliente = x.cliente || {};
    const rapportini = x.rapportini || [];
    const spese = (x.spese || []).slice().sort((a, b) => numero(a.id) - numero(b.id));
    const ore = x.ore || [];
    const corpo = scritto(t.prezzoCorpo);
    const commessa = testo(t.idCommessa);
    const nonAnticipate = spese.filter(s => !s.anticipazione);
    const gruppo = 'ticket:' + testo(t.numero);
    const sorgenti = [{ tipo: 'ticket', id: testo(t.numero), importo: corpo ? centesimi(numero(t.prezzoCorpo)) : 0 }];
    rapportini.forEach(r => sorgenti.push({ tipo: 'rapportino', id: r.id, importo: corpo ? 0 : importoRapportino(r) }));
    spese.forEach(s => sorgenti.push({ tipo: 'spesa', id: String(s.id), importo: corpo && !s.anticipazione ? 0 : centesimi(numero(s.importo)) }));
    ore.forEach(o => sorgenti.push({ tipo: 'ore', id: String(o.id), importo: corpo || !scritto(o.prezzo) ? 0 : centesimi(numero(o.ore) * numero(o.prezzo)) }));
    const testa = 'Intervento ' + testo(t.numero) + ' del ' + dataIt(t.risolto) + ': ' + testo(t.titolo) + (testo(t.impianto) ? ' - ' + testo(t.impianto) : '');
    let riga;
    if (corpo) {
      const prezzo = centesimi(numero(t.prezzoCorpo));
      riga = { tipo: 'compenso', descrizione: testa + ' (a corpo' + (commessa ? ', commessa ' + commessa : '') + ')', quantita: 1, unita: '', prezzo, importo: prezzo };
    } else {
      const oreRapportini = rapportini.reduce((tot, r) => tot + orePagate(r, cliente.pagaViaggio), 0);
      const oreRegistrate = ore.filter(o => scritto(o.prezzo)).reduce((tot, o) => tot + numero(o.ore), 0);
      const orePag = due2(oreRapportini + oreRegistrate);
      const km = due2(rapportini.filter(r => numero(r.rimborsoKm) > 0).reduce((tot, r) => tot + numero(r.km), 0));
      const spesePiu = centesimi(nonAnticipate.reduce((tot, s) => tot + numero(s.importo), 0) + rapportini.reduce((tot, r) => tot + numero(r.speseSenzaRighe), 0));
      const anticipate = new Set(spese.filter(z => z.anticipazione).map(z => String(z.id)));
      const importo = centesimi(sorgenti.filter(s => !(s.tipo === 'spesa' && anticipate.has(s.id))).reduce((tot, s) => tot + s.importo, 0));
      const parti = [];
      if (orePag > 0) parti.push(numeroIt(orePag) + (orePag === 1 ? ' ora' : ' ore'));
      if (km > 0) parti.push(numeroIt(km) + ' km');
      if (spesePiu > 0) parti.push('materiale e spese ' + euroIt(spesePiu) + ' €');
      if (commessa) parti.push('commessa ' + commessa);
      riga = { tipo: 'compenso', descrizione: testa + (parti.length ? ' (' + parti.join(', ') + ')' : ''), quantita: 1, unita: '', prezzo: importo, importo };
    }
    const righe = [Object.assign(riga, { idCommessa: commessa, periodoDa: testo(t.risolto), periodoA: testo(t.risolto) })];
    spese.filter(z => z.anticipazione).forEach(s => righe.push({
      tipo: 'anticipazione', descrizione: 'Spesa anticipata per conto del cliente: ' + (testo(s.descrizione) || 'spesa') + ' del ' + dataIt(s.data),
      quantita: 1, unita: '', prezzo: centesimi(numero(s.importo)), importo: centesimi(numero(s.importo)), tributoCliente: !!s.tributoCliente,
      idCommessa: commessa, periodoDa: '', periodoA: '',
    }));
    return [{ gruppo, righe, sorgenti }];
  }

  // ------------------------------------------------------------------ elenchi

  /** Le voci dello storico per anno, dalla più recente: [{ anno, voci }]. */
  function perAnno(voci) {
    const gruppi = [];
    (voci || []).forEach(v => {
      const anno = testo(v.data).slice(0, 4) || '—';
      let g = gruppi.find(x => x.anno === anno);
      if (!g) { g = { anno, voci: [] }; gruppi.push(g); }
      g.voci.push(v);
    });
    return gruppi;
  }

  /** Il filtro delle pillole sugli aperti, sul computer come sul telefono: Tutti · Urgenti · Miei · Da prendere. */
  function filtraTicket(lista, pill, idIo) {
    return (lista || []).filter(t => {
      if (pill === 'urgenti') return t.priorita === 'urgente' || t.inRitardo;
      if (pill === 'miei') return String(t.responsabileId) === String(idIo);
      if (pill === 'prendere') return !t.responsabileId && t.stato === 'aperto';
      return true;
    });
  }

  /** L'icona di una voce dello storico o di un documento, per tipo. */
  function iconaVoce(tipo) {
    return { ticket: 'chiaveInglese', rapportino: 'firma', documento: 'file', scadenza: 'bandiera', foto: 'foto', contratto: 'contratto', preventivo: 'preventivo', fattura: 'fatturazione' }[tipo] || 'file';
  }

  /** "1 ticket", "3 ticket", "1 documento"... */
  function quanti(n, uno, tanti) {
    return n === 1 ? '1 ' + uno : (n || 0) + ' ' + tanti;
  }

  const RegoleTicket = {
    STATI_TICKET, PRIORITA, TIPI_TICKET, ORIGINI, IMPATTI, URGENZE, FATTURAZIONI, FATTURAZIONE_BREVE, CATEGORIE_IMPIANTO, AMBIENTI, TIPI_SCADENZA,
    COLLEGAMENTI, RATE, VEDE, MESI, MESI_BREVI, GIORNI, TEMPI_STUDIO, MATRICE_PRIORITA, ERRORE_COLLEGAMENTO,
    nomeDi, coloreStatoTicket, colorePriorita, coloreScadenza, coloreDocumento, coloreContratto, coloreRata, testoGiallo, passoTicket,
    testoApriCollegamento, rigaCollegamento, prioritaDa, conPriorita, tempiTicket, istante, isoDi, quando, giornoA, entro, maiuscola, giornoGrande, ogni,
    sommaTesto, tipoCollegamento, titoloProposto, accorcia, grandezza, tipoFile, mimeDi, righeTicket, perAnno, filtraTicket, iconaVoce, quanti,
    numeroIt, euroIt, dataIt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RegoleTicket;
  else radice.WisperRegoleTicket = RegoleTicket;
})(typeof window !== 'undefined' ? window : globalThis);
