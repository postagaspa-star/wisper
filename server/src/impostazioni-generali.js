/*
 * Le impostazioni generali in un posto solo (fase 8, fase8.md §9.4): undici schede raggruppate per lavoro, con
 * etichette, unita' e limiti scritti qui, cosi' telefono e computer dicono le stesse parole e il server controlla i
 * limiti quando si salva (salvaImpostazioni).
 *
 * Ogni voce: {chiave, etichetta, tipo, ...}
 *  - tipo "numero": min, max, unita, decimali (0 di base);
 *  - "scelta": scelte [[valore, parole]];
 *  - "si_no";  "testo": max (caratteri);  "testo_lungo";  "giorno_mese" ("MM-GG" o vuoto, la festa del patrono);
 *  - "elenco": scelte possibili, si possono solo togliere (i tipi di file del portale);
 *  - "tempi_ticket": la tabella Urgente · Alta · Normale · Bassa di "presa in carico entro" e "intervento entro", in ore;
 *  - "documenti_collaboratori": per ogni tipo di collaboratore i documenti che servono;
 *  - "sola_lettura": si mostra e basta (l'ora della copia viene dal .env);
 *  - "codice_sdi": vuoto o 7 lettere e cifre, salvato in maiuscolo (il codice SDI dello studio).
 * ALTROVE: le chiavi che hanno la loro pagina (Dati dello studio, Impostazioni fiscali, Notifiche, Sicurezza, Funzioni
 * accese, Integrazioni, Veicoli, Modelli). NASCOSTE: quelle che non si mostrano, col motivo (§9.4).
 */
'use strict';

const numero = (chiave, etichetta, min, max, unita, decimali) => ({ chiave, etichetta, tipo: 'numero', min, max, unita: unita || '', decimali: decimali || 0 });
const siNo = (chiave, etichetta) => ({ chiave, etichetta, tipo: 'si_no' });
const scelta = (chiave, etichetta, scelte) => ({ chiave, etichetta, tipo: 'scelta', scelte });

const GRUPPI = [
  { chiave: 'lavoro', nome: 'Lavoro e approvazioni', voci: [
    scelta('APPROVAZIONE', 'Cosa va approvato', [['collaboratori', 'Le cose dei collaboratori'], ['tutti', 'Tutto'], ['nessuno', 'Niente']]),
    numero('ORE_GIORNALIERE', 'Ore di lavoro al giorno', 1, 12, 'ore', 1),
    { chiave: 'FESTA_PATRONO', etichetta: 'Festa del patrono', tipo: 'giorno_mese' },
  ] },
  { chiave: 'rimborsi', nome: 'Rapportini e rimborsi', collegamenti: [{ nome: 'Veicoli e rimborso km', pagina: 'amministrazione', sezione: 'veicoli' }], voci: [
    numero('EURO_KM', 'Rimborso al km', 0, 5, '€/km', 4),
    { chiave: 'AUTO', etichetta: 'Auto del rimborso ACI', tipo: 'testo', max: 80 },
    numero('COSTO_ORARIO', 'Costo di un\'ora di lavoro', 0, 500, '€/h', 2),
    numero('INDENNITA_TRASFERTA', 'Indennità di trasferta al giorno', 0, 500, '€', 2),
  ] },
  { chiave: 'preventivi', nome: 'Preventivi', collegamenti: [{ nome: 'Condizioni e testi', pagina: 'documenti', sezione: 'modelli' }], voci: [
    numero('PREVENTIVO_VALIDITA_GIORNI', 'Validità di un preventivo', 1, 365, 'giorni'),
  ] },
  { chiave: 'fisco', nome: 'Fatture e banca', collegamenti: [
    { nome: 'Impostazioni fiscali', pagina: 'amministrazione', sezione: 'fiscale' }, { nome: 'Conti', pagina: 'conti', sezione: '' }], voci: [
    numero('SOGLIA_CASSA', 'Avvisa se il saldo previsto scende sotto', 0, 1000000, '€', 2),
  ] },
  { chiave: 'documenti', nome: 'Documenti e file', voci: [
    numero('FILE_MAX_MB', 'Grandezza massima di un file', 1, 200, 'MB'),
    numero('EMAIL_ALLEGATI_MAX_MB', 'Allegati di un\'email al massimo', 1, 25, 'MB'),
    siNo('COPIA_INVIATI', 'Tieni una copia dei PDF mandati'),
    numero('PREAVVISO_GIORNI', 'Preavviso delle scadenze', 1, 365, 'giorni'),
    numero('CONDIVISIONE_GIORNI', 'Un link per i clienti vale', 1, 90, 'giorni'),
  ] },
  { chiave: 'ticket', nome: 'Ticket e assistenza', voci: [
    { chiave: 'TICKET_TEMPI', etichetta: 'Tempi dei ticket', tipo: 'tempi_ticket', unita: 'ore', min: 1, max: 720,
      righe: [['urgente', 'Urgente'], ['alta', 'Alta'], ['normale', 'Normale'], ['bassa', 'Bassa']], colonne: [['presa', 'Presa in carico entro'], ['intervento', 'Intervento entro']] },
    numero('ANTICIPO_TICKET_GIORNI', 'Il ticket programmato nasce prima della visita di', 0, 120, 'giorni'),
  ] },
  { chiave: 'persone', nome: 'Persone, mezzi e collaboratori', voci: [
    numero('PERSONE_CONSERVA_ANNI', 'Le schede di chi è uscito si tengono', 1, 30, 'anni'),
    numero('SALDO_AVVISO_GIORNI', 'Avvisa se il saldo delle ferie non è aggiornato da', 1, 365, 'giorni'),
    numero('TARATURA_OGNI_MESI', 'Taratura degli strumenti ogni', 1, 60, 'mesi'),
    numero('TARATURA_PREAVVISO_GIORNI', 'Preavviso della taratura', 1, 120, 'giorni'),
    scelta('TARATURA_BLOCCO', 'Uno strumento scaduto nel rapportino', [['avviso', 'Avvisa e lascia scegliere'], ['blocco', 'Non si può usare']]),
    numero('DURC_GIORNI', 'Un DURC vale', 30, 365, 'giorni'),
    numero('VISURA_MESI', 'Una visura vale', 1, 24, 'mesi'),
    { chiave: 'COLLAB_DOCUMENTI', etichetta: 'Documenti che servono ai collaboratori', tipo: 'documenti_collaboratori',
      righe: [['impresa', 'Impresa'], ['professionista', 'Professionista'], ['occasionale', 'Occasionale']],
      scelte: [['durc', 'DURC'], ['visura', 'Visura'], ['idoneita', 'Idoneità tecnico-professionale'], ['polizza', 'Polizza'], ['albo', 'Iscrizione all\'albo']] },
    numero('ACCESSO_ESTERNI_GIORNI', 'L\'accesso di un esterno dura', 7, 365, 'giorni'),
    numero('KM_TAGLIANDO_AVVISO', 'Avvisa del tagliando prima di', 100, 10000, 'km'),
  ] },
  { chiave: 'portale', nome: 'Portale clienti', azioni: [{ nome: 'Spegni il portale adesso', azione: 'spegniPortale' }], voci: [
    siNo('PORTALE_ATTIVO', 'Portale acceso'),
    { chiave: 'PORTALE_INDIRIZZO', etichetta: 'Indirizzo della pagina del portale', tipo: 'testo', max: 200 },
    numero('PORTALE_LINK_MINUTI', 'Il link e il codice d\'accesso valgono', 5, 60, 'minuti'),
    numero('PORTALE_LINK_AVVISO_ORE', 'I link negli avvisi valgono', 1, 168, 'ore'),
    numero('PORTALE_CODICE_TENTATIVI', 'Errori ammessi sul codice', 3, 10, 'tentativi'),
    numero('PORTALE_SESSIONE_MINUTI', 'Si esce dopo, senza uso', 5, 240, 'minuti'),
    numero('PORTALE_SESSIONE_ORE', 'Si esce comunque dopo', 1, 24, 'ore'),
    numero('PORTALE_FILE_MAX_MB', 'Grandezza massima di un file del cliente', 1, 25, 'MB'),
    numero('PORTALE_FILE_GIORNO', 'File al giorno per referente', 1, 100, 'file'),
    { chiave: 'PORTALE_TIPI_FILE', etichetta: 'Tipi di file accettati', tipo: 'elenco',
      scelte: [['pdf', 'PDF'], ['jpg', 'JPG'], ['jpeg', 'JPEG'], ['png', 'PNG'], ['heic', 'HEIC'], ['dwg', 'DWG'], ['dxf', 'DXF'], ['docx', 'Word'], ['xlsx', 'Excel']] },
    numero('PORTALE_RICHIESTE_GIORNO', 'Richieste d\'intervento al giorno per referente', 1, 50, 'richieste'),
    numero('PORTALE_EMAIL_RISERVA', 'Email del giorno lasciate allo studio', 0, 90, 'email'),
    numero('PORTALE_EMAIL_MAX_GIORNO', 'Email al giorno dal portale', 0, 90, 'email'),
    numero('PORTALE_AVVISI_MINUTI', 'Gli avvisi si raggruppano per', 1, 60, 'minuti'),
    numero('PORTALE_ACCESSI_MESI', 'Il registro degli accessi si tiene', 1, 24, 'mesi'),
    numero('PORTALE_INATTIVI_MESI', 'Proponi di togliere l\'accesso dopo', 1, 36, 'mesi senza entrare'),
    { chiave: 'PORTALE_INFORMATIVA', etichetta: 'Informativa per chi usa il portale', tipo: 'testo_lungo', max: 4000 },
  ] },
  { chiave: 'comunicazioni', nome: 'Comunicazioni', voci: [
    numero('SOLLECITO_DOPO_GIORNI', 'Proponi il promemoria di pagamento dopo la scadenza di', 1, 120, 'giorni'),
    numero('SOLLECITO_SECONDO_GIORNI', 'Il secondo promemoria dopo', 1, 120, 'giorni'),
    numero('PROMEMORIA_GIORNI_PRIMA', 'Promemoria degli appuntamenti', 0, 10, 'giorni lavorativi prima'),
    scelta('WHATSAPP_APP', 'Quale WhatsApp apre il telefono', [['business', 'WhatsApp Business'], ['normale', 'WhatsApp'], ['chiedi', 'Chiedi ogni volta']]),
    numero('WHATSAPP_TESTO_MAX', 'Lunghezza massima di un messaggio', 100, 4000, 'caratteri'),
    numero('COMUNICAZIONI_CONSERVA_ANNI', 'Lo storico delle comunicazioni si tiene', 1, 30, 'anni'),
    numero('NOTIFICHE_CONSERVA_GIORNI', 'Le notifiche si tengono', 7, 365, 'giorni'),
  ] },
  { chiave: 'spazio', nome: 'Spazio e copie', voci: [
    numero('SPAZIO_AVVISO_MB', 'Avvisa quando lo spazio libero scende sotto', 100, 10000000, 'MB'),
    numero('SPAZIO_MINIMO_MB', 'Ferma i caricamenti sotto', 100, 10000000, 'MB'),
    numero('COPIA_FUORI_MAX_MB', 'File più grandi restano solo sul NAS', 1, 100, 'MB'),
    numero('PROVA_COPIA_GIORNI', 'Il server prova da solo l\'ultima copia ogni', 7, 90, 'giorni'),
    numero('PROVA_RIPRISTINO_GIORNI', 'Ricorda il ripristino a mano dopo', 30, 365, 'giorni'),
    numero('ESPORTAZIONI_GIORNI', 'Il file di Esporta tutto resta', 1, 30, 'giorni'),
    { chiave: 'WISPER_ORA_COPIA', etichetta: 'Ora della copia di ogni notte (dal .env del NAS)', tipo: 'sola_lettura' },
  ] },
  { chiave: 'calendario', nome: 'Calendario e ricerca', voci: [
    numero('CALENDARIO_GIORNI_PRIMA', 'Il calendario in altre app comincia da', 0, 365, 'giorni fa'),
    numero('CALENDARIO_MESI_DOPO', 'E arriva a', 1, 36, 'mesi da oggi'),
    siNo('RICERCA_FILE', 'Cerca anche dentro i file'),
    numero('RICERCA_FILE_MAX_MB', 'File più grandi non si leggono', 1, 100, 'MB'),
  ] },
];

/** Le chiavi che hanno una pagina loro, con la riga che porta li' (§9.4, "Altrove"). */
const ALTROVE = {
  studio: ['RAGIONE_SOCIALE', 'INDIRIZZO', 'PARTITA_IVA', 'EMAIL', 'TELEFONO', 'PEC', 'FIRMA_TECNICO', 'POLIZZA_COMPAGNIA', 'POLIZZA_NUMERO', 'POLIZZA_MASSIMALE',
    'TITOLI', 'CODICE_FISCALE', 'STUDIO_CAP', 'STUDIO_COMUNE', 'STUDIO_PROVINCIA', 'STUDIO_SDI', 'ALBO', 'ALBO_PROVINCIA', 'ALBO_NUMERO', 'ALBO_DATA',
    'STUDIO_LOGO', 'STUDIO_NOME_BREVE', 'STUDIO_SITO', 'PDF_LOGO', 'PDF_NOME', 'PDF_PIEDE'],
  fiscale: ['REGIME_FISCALE', 'TIPO_DOCUMENTO', 'RITENUTA_TIPO', 'RITENUTA_CAUSALE', 'EPPI_TIPO_CASSA', 'BOLLO_SOGLIA', 'BOLLO_IMPORTO', 'BOLLO_RIVALSA',
    'GIORNI_PAGAMENTO', 'PAGAMENTO_FINE_MESE', 'MODALITA_PAGAMENTO', 'IVA', 'EPPI_INTEGRATIVO', 'RITENUTA'],
  notifiche: ['EMAIL_AVVISI', 'NOTIFICHE_ORA'],
  sicurezza: ['SESSIONE_GIORNI', 'COPIA_CIFRATA'],
  funzioni: ['MODULI_SPENTI'],
  integrazioni: ['CALENDARIO_PUBBLICO'],
  veicoli: ['ACI_ANNO'],
  modelli: ['PREVENTIVO_CONDIZIONI'],
};

/** Le chiavi che non si mostrano, col motivo (§9.4). */
const NASCOSTE = {
  TICKET_ATTIVO: 'chiave del foglio di prima',
  TECNICO: 'ora è il nome di ogni utente',
  PASSAGGIO_USCITE: 'lo cambia chi costruisce (fase 4 §8.4)',
  REGOLE_FISCALI_CONFERMATE: 'si cambia con Segna confermate',
  PORTALE_INFORMATIVA_DATA: 'cambia da sola quando cambia l\'informativa',
  CAMBIO: 'si segna nella Lista di controllo',
  CONDIVISIONE_INDIRIZZO: 'dalla fase 7 i link per i clienti passano dal portale (PORTALE_INDIRIZZO)',
};

/** I limiti delle altre pagine (Sicurezza, Notifiche), controllati anche loro quando si salva. */
const ALTRE_VOCI = [
  numero('SESSIONE_GIORNI', 'Un dispositivo esce da solo dopo', 30, 365, 'giorni senza uso'),
  { chiave: 'NOTIFICHE_ORA', etichetta: 'Ora del riepilogo del mattino', tipo: 'ora' },
  { chiave: 'STUDIO_NOME_BREVE', etichetta: 'Nome breve', tipo: 'testo', max: 40 },
  { chiave: 'STUDIO_SITO', etichetta: 'Sito', tipo: 'testo', max: 120 },
  { chiave: 'PDF_PIEDE', etichetta: 'Riga in fondo ai PDF', tipo: 'testo', max: 160 },
  siNo('PDF_LOGO', 'Logo sui PDF'),
  // 06/11/2026: il nome dello studio accanto al logo nei PDF; il codice SDI dello studio (7 lettere o cifre, o vuoto).
  siNo('PDF_NOME', 'Nome dello studio accanto al logo nei PDF'),
  { chiave: 'STUDIO_SDI', etichetta: 'Codice SDI', tipo: 'codice_sdi' },
  siNo('CALENDARIO_PUBBLICO', 'Calendario anche fuori casa (passa da Google)'),
];

const PER_CHIAVE = new Map();
for (const g of GRUPPI) for (const v of g.voci) PER_CHIAVE.set(v.chiave, Object.assign({ gruppo: g.chiave }, v));
for (const v of ALTRE_VOCI) if (!PER_CHIAVE.has(v.chiave)) PER_CHIAVE.set(v.chiave, v);

function voceImpostazione(chiave) {
  return PER_CHIAVE.get(chiave) || null;
}

/**
 * Controlla un valore secondo la sua voce e lo torna pulito; un errore comincia col nome ("Ore al giorno: da 1 a 12").
 * Chiavi senza voce: tornano come sono (le controllano le pagine loro, come le regole fiscali della fase 4).
 */
function controllaValore(chiave, valore) {
  const v = voceImpostazione(chiave);
  if (!v) return valore;
  const nome = v.etichetta;
  const errore = frase => { const e = new Error(nome + ': ' + frase); e.rifiuto = true; return e; };
  if (v.tipo === 'numero') {
    if (valore === '' || valore === null || valore === undefined) {
      // Le chiavi che nascono vuote ("" = non c'e'): restano vuote.
      if (['COSTO_ORARIO', 'INDENNITA_TRASFERTA'].indexOf(chiave) >= 0) return '';
      throw errore('scrivi un numero');
    }
    const n = typeof valore === 'number' ? valore : Number(String(valore).replace(',', '.'));
    if (!isFinite(n)) throw errore('scrivi un numero');
    if (n < v.min || n > v.max) throw errore('da ' + numeroIt(v.min) + ' a ' + numeroIt(v.max) + (v.unita ? ' ' + v.unita : ''));
    const f = Math.pow(10, v.decimali || 0);
    return Math.round(n * f) / f;
  }
  if (v.tipo === 'si_no') {
    if (valore === true || valore === 'true' || valore === 1 || valore === '1') return true;
    if (valore === false || valore === 'false' || valore === 0 || valore === '0') return false;
    throw errore('sì o no');
  }
  if (v.tipo === 'scelta') {
    if (!v.scelte.some(s => s[0] === valore)) throw errore(v.scelte.map(s => s[1]).join(', ').toLowerCase());
    return valore;
  }
  if (v.tipo === 'testo' || v.tipo === 'testo_lungo') {
    const s = valore === null || valore === undefined ? '' : String(valore).trim();
    if (v.max && s.length > v.max) throw errore('al massimo ' + v.max + ' caratteri');
    return s;
  }
  if (v.tipo === 'giorno_mese') {
    const s = valore === null || valore === undefined ? '' : String(valore).trim();
    if (!s) return '';
    const m = s.match(/^(\d{2})-(\d{2})$/);
    const ok = m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= new Date(2024, Number(m[1]), 0).getDate();
    if (!ok) throw errore('mese e giorno, per esempio 07-25');
    return s;
  }
  if (v.tipo === 'ora') {
    const s = String(valore || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw errore('un\'ora, per esempio 08:00');
    return String(Number(m[1])).padStart(2, '0') + ':' + m[2];
  }
  if (v.tipo === 'elenco') {
    const lista = Array.isArray(valore) ? valore.map(x => String(x).toLowerCase()) : [];
    const ammessi = new Set(v.scelte.map(s => s[0]));
    for (const x of lista) if (!ammessi.has(x)) throw errore('tipo sconosciuto: ' + x);
    if (!lista.length) throw errore('lascia almeno un tipo');
    return Array.from(new Set(lista));
  }
  if (v.tipo === 'tempi_ticket') {
    const o = valore && typeof valore === 'object' ? valore : null;
    if (!o) throw errore('una riga per priorità');
    const out = {};
    for (const [p, parole] of v.righe) {
      const r = o[p] || {};
      const presa = Number(r.presa);
      const intervento = Number(r.intervento);
      for (const [n, col] of [[presa, 'presa in carico'], [intervento, 'intervento']]) {
        if (!isFinite(n) || n < v.min || n > v.max) throw errore(parole + ', ' + col + ': da ' + v.min + ' a ' + v.max + ' ore');
      }
      if (intervento < presa) throw errore(parole + ': l\'intervento non può venire prima della presa in carico');
      out[p] = { presa, intervento };
    }
    return out;
  }
  if (v.tipo === 'documenti_collaboratori') {
    const o = valore && typeof valore === 'object' ? valore : null;
    if (!o) throw errore('una riga per tipo di collaboratore');
    const ammessi = new Set(v.scelte.map(s => s[0]));
    const out = {};
    for (const [t] of v.righe) {
      const lista = Array.isArray(o[t]) ? o[t].map(String) : [];
      for (const x of lista) if (!ammessi.has(x)) throw errore('documento sconosciuto: ' + x);
      out[t] = Array.from(new Set(lista));
    }
    return out;
  }
  if (v.tipo === 'codice_sdi') {
    // Vuoto, o 7 lettere e cifre (in maiuscolo, senza spazi): la frase intera, senza il nome davanti.
    const s = valore === null || valore === undefined ? '' : String(valore).replace(/\s/g, '').toUpperCase();
    if (s && !/^[A-Z0-9]{7}$/.test(s)) { const e = new Error('Il codice SDI ha 7 caratteri, lettere e numeri'); e.rifiuto = true; throw e; }
    return s;
  }
  if (v.tipo === 'sola_lettura') throw errore('si cambia nel .env del NAS');
  return valore;
}

function numeroIt(n) {
  return String(n).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Tutte le chiavi che hanno una schermata (nelle schede o altrove) o sono nascoste. */
function chiaviConosciute() {
  const s = new Set();
  for (const g of GRUPPI) for (const v of g.voci) s.add(v.chiave);
  for (const l of Object.values(ALTROVE)) l.forEach(k => s.add(k));
  Object.keys(NASCOSTE).forEach(k => s.add(k));
  return s;
}

module.exports = { GRUPPI, ALTROVE, NASCOSTE, ALTRE_VOCI, voceImpostazione, controllaValore, chiaviConosciute };
