/**
 * WISPER - il foglio dei rapportini e il suo script.
 *
 * Fa da ponte per due programmi: l'app sul telefono, dove si compilano i
 * rapportini, e Wisper Ufficio sul computer, dove si gestiscono commesse,
 * clienti, PDF e invii. Il foglio e' l'unico posto dove i dati stanno davvero:
 * tutti e due leggono e scrivono qui, e i conti li fa SOLO questo script, cosi'
 * telefono e computer non possono mai dare due totali diversi.
 *
 * Va in Estensioni -> Apps Script del foglio, dentro Code.gs. Essendo legato al
 * foglio non serve nessun ID.
 *
 * LA PRIMA VOLTA: dall'editor lancia preparaFoglio(). Crea le schede e le
 * colonne che mancano, senza toccare quelle che ci sono, e scrive nel registro
 * il CODICE da mettere nell'app e nel programma del computer. Senza codice lo
 * script non risponde a nessuno: dentro ci sono fatturato e scontrini.
 *
 * DOPO OGNI MODIFICA: Distribuisci -> Gestisci distribuzioni -> matita ->
 * Versione: Nuova versione. Senza, l'indirizzo serve ancora il codice vecchio.
 *
 * Le intestazioni si riconoscono a prescindere da maiuscole, spazi e trattini
 * bassi: "ORE_LAVORO", "Ore lavoro" e "ore lavoro" sono la stessa colonna.
 *
 * OGNI RICHIESTA LASCIA UNA RIGA nella scheda Accessi (quando, quale
 * dispositivo, per fare cosa, com'e' andata), e la scheda Dispositivi elenca
 * chi si e' collegato. Un dispositivo nuovo, o troppi codici sbagliati, e
 * arriva un'email: vedi "Il registro degli accessi" piu' sotto.
 */

var NOME_RAPPORTINI = 'Rapportini';
var NOME_CLIENTI = 'Clienti';
var NOME_COMMESSE = 'Commesse';
var NOME_GRUPPI = 'Gruppi';
var NOME_IMPOSTAZIONI = 'Impostazioni';
var NOME_ACCESSI = 'Accessi';
var NOME_DISPOSITIVI = 'Dispositivi';

var FUSO = 'Europe/Rome';

/**
 * Le colonne di ogni scheda: [chiave nel codice, intestazione, altri nomi].
 *
 * Gli altri nomi servono ai fogli nati prima: la colonna "ORE" del primo Wisper
 * e' la stessa cosa di "ORE_LAVORO", e si continua a usarla invece di crearne
 * una seconda accanto.
 */
var SCHEMA = {
  Rapportini: [
    ['id', 'ID'],
    ['idLocale', 'ID_LOCALE'],
    ['data', 'DATA'],
    ['tecnico', 'TECNICO'],
    ['idCliente', 'ID_CLIENTE'],
    ['cliente', 'CLIENTE'],
    ['gruppo', 'GRUPPO'],
    ['idCommessa', 'ID_COMMESSA'],
    ['commessa', 'COMMESSA'],
    ['ticket', 'TICKET'],
    ['luogo', 'LUOGO'],
    ['descrizione', 'DESCRIZIONE'],
    ['oreLavoro', 'ORE_LAVORO', 'ORE'],
    ['oreExtra', 'ORE_EXTRA'],
    ['oreViaggio', 'ORE_VIAGGIO'],
    ['oreTotali', 'ORE_TOTALI'],
    ['km', 'KM'],
    ['spese', 'SPESE'],
    ['noteSpese', 'NOTE_SPESE'],
    ['foto', 'FOTO_SPESE'],
    ['tariffa', 'TARIFFA'],
    ['pagaViaggio', 'PAGA_VIAGGIO'],
    ['kmRimborsati', 'KM_RIMBORSATI'],
    ['euroKm', 'EURO_KM'],
    ['maggExtra', 'MAGG_EXTRA'],
    ['compensoOre', 'COMPENSO_ORE'],
    ['rimborsoKm', 'RIMBORSO_KM'],
    ['totale', 'TOTALE'],
    ['costoOrario', 'COSTO_ORARIO'],
    ['noteInterne', 'NOTE_INTERNE'],
    ['firma', 'FIRMA'],
    ['firmatario', 'FIRMATARIO'],
    ['firmatoIl', 'FIRMATO_IL'],
    ['stato', 'STATO'],
    ['inviatoIl', 'INVIATO_IL'],
    ['fatturatoIl', 'FATTURATO_IL'],
    ['creato', 'CREATO', 'TIMESTAMP'],
    ['modificato', 'MODIFICATO']
  ],
  Clienti: [
    ['id', 'ID_CLIENTE', 'IDCliente', 'ID', 'Codice', 'Codice_Cliente'],
    ['nome', 'RAGIONE_SOCIALE', 'Cliente', 'Nome', 'Denominazione'],
    ['alias', 'ALIAS', 'Alias_Cliente', 'Soprannomi'],
    ['gruppo', 'GRUPPO'],
    ['email', 'EMAIL'],
    ['telefono', 'TELEFONO'],
    ['indirizzo', 'INDIRIZZO'],
    ['partitaIva', 'PARTITA_IVA', 'PIVA'],
    ['ultimaTariffa', 'ULTIMA_TARIFFA'],
    ['pagaViaggio', 'PAGA_VIAGGIO'],
    ['kmRimborsati', 'KM_RIMBORSATI'],
    ['note', 'NOTE']
  ],
  Commesse: [
    ['id', 'ID_COMMESSA', 'IDCommessa', 'Codice', 'Codice_Commessa'],
    ['idCliente', 'ID_CLIENTE', 'IDCliente'],
    ['descrizione', 'DESCRIZIONE', 'Desc', 'Lavoro'],
    ['stato', 'STATO', 'Stato_Commessa'],
    ['indirizzo', 'INDIRIZZO', 'Via', 'Luogo', 'Cantiere'],
    ['budgetOre', 'BUDGET_ORE'],
    ['budgetEuro', 'BUDGET_EURO'],
    ['inizio', 'INIZIO'],
    ['finePrevista', 'FINE_PREVISTA'],
    ['cartella', 'CARTELLA'],
    ['note', 'NOTE']
  ],
  Gruppi: [
    ['nome', 'GRUPPO'],
    ['tariffaFissa', 'TARIFFA_FISSA'],
    ['pagaViaggio', 'PAGA_VIAGGIO'],
    ['kmRimborsati', 'KM_RIMBORSATI'],
    ['maggExtra', 'MAGG_EXTRA'],
    ['email', 'EMAIL'],
    ['note', 'NOTE']
  ]
};

/**
 * Le impostazioni, una per riga: chiave, valore, a cosa serve.
 * Stanno in una scheda e non nel codice perche' le cambia chi usa il programma,
 * non chi lo scrive: il costo ACI cambia ogni anno.
 */
var IMPOSTAZIONI_INIZIALI = [
  ['EURO_KM', 0.76, 'Rimborso chilometrico. Da controllare ogni gennaio sulla tabella ACI dell\'auto qui sotto.'],
  ['AUTO', 'Volvo XC40', 'L\'auto su cui si calcola il rimborso ACI.'],
  ['COSTO_ORARIO', '', 'Quanto costa a te un\'ora di lavoro. Serve solo a calcolare il margine delle commesse.'],
  ['PREFISSO_COMMESSA', 'P', 'Le commesse nuove si numerano P2601, P2602... (prefisso + anno + numero).'],
  ['TICKET_ATTIVO', 'NO', 'SI per mostrare il campo ticket nel rapportino.'],
  ['TECNICO', 'Manuel Gasparotto', 'Il nome che compare come compilatore.'],
  ['RAGIONE_SOCIALE', 'Studio Tecnico GM', 'Intestazione dei PDF.'],
  ['INDIRIZZO', '', 'Intestazione dei PDF.'],
  ['PARTITA_IVA', '', 'Intestazione dei PDF.'],
  ['EMAIL', '', 'Intestazione dei PDF.'],
  ['TELEFONO', '', 'Intestazione dei PDF.'],
  ['PEC', '', 'Intestazione dei PDF.'],
  ['FIRMA_TECNICO', '', 'La firma del compilatore: si mette da sola su ogni rapportino. La carica il programma.'],
  ['EMAIL_AVVISI', '', 'Chi riceve gli avvisi di sicurezza (dispositivo nuovo, codici sbagliati) oltre al proprietario del foglio. Piu\' indirizzi separati da virgola.']
];

/**
 * Le colonne che sono sempre testo, anche quando dentro ci sono solo cifre. Una
 * partita IVA "01234567890" scritta cosi' com'e', Fogli la trasforma nel numero
 * 1234567890, e lo zero davanti sparisce. Stessa cosa per un fisso "0445...".
 */
var SEMPRE_TESTO = ['partitaIva', 'telefono', 'PARTITA_IVA', 'TELEFONO'];

/**
 * I gruppi di partenza. Elettrodinamica paga 30 euro l'ora fissi, i km ma non
 * il tempo di viaggio. Per i privati la tariffa la scrive il tecnico nel
 * rapportino, e lo script se la ricorda cliente per cliente.
 */
var GRUPPI_INIZIALI = [
  ['Elettrodinamica', 30, 'NO', 'SI', 0, 'Tariffa fissa. Il tempo di viaggio non si paga, i km si.'],
  ['Privato', '', 'NO', 'SI', 0, 'Tariffa libera: si propone l\'ultima usata per quel cliente.']
];

/** Gli stati di un rapportino, in ordine di vita. */
var STATI = ['BOZZA', 'FIRMATO', 'INVIATO', 'FATTURATO', 'ANNULLATO'];

/** Da firmato in poi il contenuto non si tocca: si riporta in bozza, e la firma cade. */
var STATI_BLOCCATI = ['FIRMATO', 'INVIATO', 'FATTURATO'];

// ---------------------------------------------------------------------------
// Ingresso
// ---------------------------------------------------------------------------

function doGet(e) {
  var p = (e && e.parameter) || {};
  return rispondi(p, function () {
    switch (p.azione) {
      case 'rapportini':
        return { ok: true, rapportini: leggiRapportini(p.da, p.a, p.tutti === '1') };
      case 'file':
        return { ok: true, file: leggiFile(p.id) };
      case 'documenti':
        return documentiCommessa(p.idCommessa);
      default:
        return rispostaAnagrafiche();
    }
  });
}

function doPost(e) {
  var d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    registraAccesso({}, 'richiesta non valida');
    return json({ ok: false, errore: 'Richiesta non valida' });
  }
  return rispondi(d, function () {
    if (d.azione === 'anagrafiche') return rispostaAnagrafiche();
    if (d.azione === 'rapportini') return { ok: true, rapportini: leggiRapportini(d.da, d.a, d.tutti === true) };
    if (d.azione === 'file') return { ok: true, file: leggiFile(d.id) };
    if (d.azione === 'documenti') return documentiCommessa(d.idCommessa);

    // Tutto il resto scrive: uno alla volta. Telefono e computer possono
    // salvare nello stesso istante, e due righe col numero RAP/2026/0007
    // sarebbero un guaio da sistemare a mano.
    var lucchetto = LockService.getScriptLock();
    lucchetto.waitLock(30000);
    try {
      return scrivi(d);
    } finally {
      lucchetto.releaseLock();
    }
  });
}

/**
 * Controlla il codice, fa il lavoro e lascia la riga nel registro degli
 * accessi. Sempre: anche quando il codice e' sbagliato, anzi soprattutto allora.
 */
function rispondi(d, lavoro) {
  try {
    controllaCodice(d.codice);
  } catch (err) {
    registraAccesso(d, messaggio(err) === 'Codice sbagliato' ? 'codice sbagliato' : 'rifiutato');
    return json({ ok: false, errore: messaggio(err) });
  }
  var risposta;
  try {
    riparaUnaVolta();
    risposta = lavoro();
  } catch (err) {
    risposta = { ok: false, errore: messaggio(err) };
  }
  registraAccesso(d, risposta && risposta.ok === false ? 'errore' : 'ok');
  return json(risposta);
}

function scrivi(d) {
  switch (d.azione) {
    case 'salvaRapportino':
      return { ok: true, rapportino: salvaRapportino(d.rapportino || {}) };
    case 'caricaFile':
      return { ok: true, file: caricaFile(d) };
    case 'togliFile':
      return { ok: true, rapportino: togliFile(d.id, d.fileId) };
    case 'stato':
      return { ok: true, rapportini: cambiaStato(d.ids || [d.id], d.stato) };
    case 'creaCliente':
      return { ok: true, cliente: creaCliente(d) };
    case 'aggiornaCliente':
      return { ok: true, cliente: aggiornaCliente(d.id, d.campi || {}) };
    case 'creaCommessa':
      return { ok: true, commessa: creaCommessa(d) };
    case 'aggiornaCommessa':
      return { ok: true, commessa: aggiornaCommessa(d.id, d.campi || {}) };
    case 'statoCommessa':
      // Il nome che usava il primo Wisper: resta valido.
      return { ok: true, commessa: aggiornaCommessa(d.idCommessa, { stato: d.stato }) };
    case 'salvaGruppo':
      return { ok: true, gruppo: salvaGruppo(d.gruppo || {}) };
    case 'salvaImpostazioni':
      return { ok: true, impostazioni: salvaImpostazioni(d.valori || {}) };
    case 'inviaEmail':
      return { ok: true, rapportini: inviaEmail(d) };
    default:
      throw new Error('Azione sconosciuta: ' + d.azione);
  }
}

function controllaCodice(codice) {
  var giusto = PropertiesService.getScriptProperties().getProperty('CODICE');
  if (!giusto) throw new Error('Foglio non preparato: lancia preparaFoglio() dall\'editor dello script');
  if (String(codice || '') !== giusto) throw new Error('Codice sbagliato');
}

function rispostaAnagrafiche() {
  return {
    ok: true,
    clienti: leggiClienti(),
    commesse: leggiCommesse(),
    gruppi: leggiGruppi(),
    impostazioni: leggiImpostazioni()
  };
}

// ---------------------------------------------------------------------------
// Preparazione del foglio (si lancia a mano dall'editor)
// ---------------------------------------------------------------------------

/**
 * Crea quello che manca e non tocca niente di quello che c'e'. Si puo'
 * lanciare quante volte si vuole: la seconda volta non fa nulla.
 */
function preparaFoglio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (nome) {
    var f = ss.getSheetByName(nome) || ss.insertSheet(nome);
    var intestazioni = f.getLastColumn() > 0
      ? f.getRange(1, 1, 1, f.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); })
      : [];
    var presenti = intestazioni.map(normalizza);
    var aggiunte = [];
    SCHEMA[nome].forEach(function (col) {
      var nomi = col.slice(1).map(normalizza);
      var trovata = nomi.some(function (n) { return presenti.indexOf(n) >= 0; });
      if (!trovata) aggiunte.push(col[1]);
    });
    if (aggiunte.length) {
      f.getRange(1, intestazioni.length + 1, 1, aggiunte.length).setValues([aggiunte]).setFontWeight('bold');
      Logger.log(nome + ': aggiunte le colonne ' + aggiunte.join(', '));
    }
    if (f.getFrozenRows() === 0) f.setFrozenRows(1);
  });

  var gruppi = ss.getSheetByName(NOME_GRUPPI);
  if (gruppi.getLastRow() < 2) {
    GRUPPI_INIZIALI.forEach(function (g) {
      scriviRiga(NOME_GRUPPI, {
        nome: g[0], tariffaFissa: g[1], pagaViaggio: g[2], kmRimborsati: g[3], maggExtra: g[4], note: g[5]
      });
    });
    Logger.log('Gruppi: creati Elettrodinamica e Privato');
  }

  var imp = ss.getSheetByName(NOME_IMPOSTAZIONI) || ss.insertSheet(NOME_IMPOSTAZIONI);
  if (imp.getLastRow() === 0) {
    imp.getRange(1, 1, 1, 3).setValues([['CHIAVE', 'VALORE', 'A COSA SERVE']]).setFontWeight('bold');
    imp.setFrozenRows(1);
  }
  var chiavi = imp.getLastRow() > 1
    ? imp.getRange(2, 1, imp.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); })
    : [];
  IMPOSTAZIONI_INIZIALI.forEach(function (riga) {
    if (chiavi.indexOf(riga[0]) < 0) imp.appendRow(riga);
  });

  schedaAccessi();
  schedaDispositivi();
  riparaTesti();

  var prop = PropertiesService.getScriptProperties();
  if (!prop.getProperty('CODICE')) {
    prop.setProperty('CODICE', Utilities.getUuid().replace(/-/g, ''));
  }
  Logger.log('CODICE da mettere nell\'app e nel programma del computer: ' + prop.getProperty('CODICE'));
}

/** Se il codice e' finito in mani sbagliate: ne fa uno nuovo, e il vecchio smette di valere. */
function cambiaCodice() {
  PropertiesService.getScriptProperties().setProperty('CODICE', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('Nuovo CODICE: ' + PropertiesService.getScriptProperties().getProperty('CODICE'));
}

// ---------------------------------------------------------------------------
// Righe e colonne
// ---------------------------------------------------------------------------

function foglio(nome) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
}

/** "ID_Cliente", "ID CLIENTE", "id cliente" -> "idcliente" */
function normalizza(s) {
  return String(s === null || s === undefined ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Per ogni colonna del foglio, la chiave dello schema a cui corrisponde (o null
 * se e' una colonna che lo schema non conosce: quelle si lasciano stare).
 */
function chiaviColonne(nome, intestazioni) {
  var schema = SCHEMA[nome] || [];
  var usate = {};
  return intestazioni.map(function (h) {
    var n = normalizza(h);
    for (var i = 0; i < schema.length; i++) {
      var col = schema[i];
      // Una chiave sola per colonna: se il foglio ha sia "ORE" che "ORE_LAVORO"
      // vince la prima, e l'altra resta com'e'.
      if (usate[col[0]]) continue;
      if (col.slice(1).map(normalizza).indexOf(n) >= 0) {
        usate[col[0]] = true;
        return col[0];
      }
    }
    return null;
  });
}

function intestazioniDi(nome) {
  var f = foglio(nome);
  if (!f || f.getLastColumn() === 0) return [];
  return f.getRange(1, 1, 1, f.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
}

/** Tutte le righe come oggetti {chiave: valore}, con _riga = numero di riga nel foglio. */
function leggi(nome) {
  var f = foglio(nome);
  if (!f) return [];
  var dati = f.getDataRange().getValues();
  if (dati.length < 2) return [];
  var chiavi = chiaviColonne(nome, dati[0]);
  var righe = [];
  for (var i = 1; i < dati.length; i++) {
    var o = { _riga: i + 1 };
    var vuota = true;
    chiavi.forEach(function (k, c) {
      if (!k) return;
      o[k] = senzaApostrofo(dati[i][c]);
      if (dati[i][c] !== '' && dati[i][c] !== null) vuota = false;
    });
    if (!vuota) righe.push(o);
  }
  return righe;
}

/** Aggiunge una riga mettendo ogni valore sotto la colonna giusta. */
function scriviRiga(nome, valori) {
  var f = foglio(nome);
  if (!f) throw new Error('Scheda "' + nome + '" non trovata: lancia preparaFoglio()');
  var chiavi = chiaviColonne(nome, intestazioniDi(nome));
  if (chiavi.length === 0) throw new Error('La scheda ' + nome + ' non ha intestazioni');
  f.appendRow(chiavi.map(function (k) {
    return k && Object.prototype.hasOwnProperty.call(valori, k) ? perLaCella(k, valori[k]) : '';
  }));
  return f.getLastRow();
}

/**
 * Riscrive solo le colonne indicate di una riga, in una scrittura sola.
 * La riga si riscrive intera, quindi anche le celle che non cambiano passano da
 * perLaCella: una partita IVA gia' giusta non deve perdere lo zero perche' si e'
 * corretta l'email.
 */
function aggiornaRiga(nome, riga, valori) {
  var f = foglio(nome);
  var intestazioni = intestazioniDi(nome);
  var chiavi = chiaviColonne(nome, intestazioni);
  var range = f.getRange(riga, 1, 1, intestazioni.length);
  var attuale = range.getValues()[0];
  chiavi.forEach(function (k, c) {
    if (k && Object.prototype.hasOwnProperty.call(valori, k)) attuale[c] = valori[k];
  });
  range.setValues([attuale.map(function (v, c) { return perLaCella(chiavi[c], v); })]);
}

/**
 * Il valore come va scritto nella cella. Fogli legge quello che riceve come se
 * l'avesse digitato una persona: "0445123456" diventa il numero 445123456,
 * "=..." diventa una formula. L'apostrofo davanti dice a Fogli "questo e'
 * testo": nella cella non si vede, e rileggendo non c'e' (senzaApostrofo).
 */
function perLaCella(chiave, v) {
  if (typeof v !== 'string' || v === '' || v.charAt(0) === '\'') return v;
  if (SEMPRE_TESTO.indexOf(chiave) >= 0) return '\'' + v;
  // Una formula, o un segno davanti che Fogli proverebbe a calcolare.
  if (/^[=+\-@]/.test(v)) return '\'' + v;
  // Solo cifre con uno zero davanti: un codice, non un numero.
  if (/^0[\d\s]*$/.test(v)) return '\'' + v;
  return v;
}

/** Se Fogli restituisse anche l'apostrofo che dice "testo", qui si toglie. */
function senzaApostrofo(v) {
  return typeof v === 'string' && v.charAt(0) === '\'' ? v.slice(1) : v;
}

/**
 * Una partita IVA dal foglio. Quelle scritte prima della 0.3.3 possono essere
 * diventate numeri, e un numero non ha zeri davanti. Una partita IVA italiana ha
 * sempre 11 cifre, quindi gli zeri mancanti si rimettono senza indovinare.
 */
function partitaIvaDalFoglio(v) {
  if (typeof v === 'number' && isFinite(v)) {
    var s = String(Math.round(v));
    return s.length < 11 ? ('00000000000' + s).slice(-11) : s;
  }
  return testo(senzaApostrofo(v));
}

/**
 * Un telefono dal foglio. Se e' diventato un numero ha perso lo zero dei fissi
 * (in Italia cominciano tutti con 0) o il + del prefisso 39. I cellulari
 * cominciano con 3 e restano come sono.
 */
function telefonoDalFoglio(v) {
  if (typeof v === 'number' && isFinite(v)) {
    var s = String(Math.round(v));
    if (/^39\d{9,}$/.test(s)) return '+' + s;
    return s.charAt(0) === '3' ? s : '0' + s;
  }
  return testo(senzaApostrofo(v));
}

/**
 * Rimette a posto, nel foglio, le partite IVA e i telefoni diventati numeri.
 * Si puo' lanciare quante volte si vuole: quelli gia' giusti sono testo e non
 * li tocca.
 */
function riparaTesti() {
  var riparati = 0;
  leggi(NOME_CLIENTI).forEach(function (r) {
    var valori = {};
    if (typeof r.partitaIva === 'number') valori.partitaIva = partitaIvaDalFoglio(r.partitaIva);
    if (typeof r.telefono === 'number') valori.telefono = telefonoDalFoglio(r.telefono);
    if (Object.keys(valori).length) {
      aggiornaRiga(NOME_CLIENTI, r._riga, valori);
      riparati++;
    }
  });
  var imp = foglio(NOME_IMPOSTAZIONI);
  if (imp && imp.getLastRow() > 1) {
    imp.getRange(2, 1, imp.getLastRow() - 1, 2).getValues().forEach(function (r, i) {
      var k = String(r[0]).trim();
      if (typeof r[1] !== 'number' || SEMPRE_TESTO.indexOf(k) < 0) return;
      var giusto = k === 'PARTITA_IVA' ? partitaIvaDalFoglio(r[1]) : telefonoDalFoglio(r[1]);
      imp.getRange(i + 2, 2).setValue(perLaCella(k, giusto));
      riparati++;
    });
  }
  if (riparati) Logger.log('Partite IVA e telefoni rimessi come testo: ' + riparati + ' righe');
  return riparati;
}

/** La riparazione la prima volta che arriva una richiesta col codice giusto, poi mai piu'. */
function riparaUnaVolta() {
  try {
    var prop = PropertiesService.getScriptProperties();
    if (prop.getProperty('TESTI_RIPARATI')) return;
    var lucchetto = LockService.getScriptLock();
    if (!lucchetto.tryLock(10000)) return;
    try {
      if (prop.getProperty('TESTI_RIPARATI')) return;
      riparaTesti();
      prop.setProperty('TESTI_RIPARATI', String(new Date().getTime()));
    } finally {
      lucchetto.releaseLock();
    }
  } catch (err) {
    // Se non riesce ci riprova la prossima volta: intanto le letture rimettono gli zeri da sole.
  }
}

// ---------------------------------------------------------------------------
// Anagrafiche
// ---------------------------------------------------------------------------

function leggiClienti() {
  return leggi(NOME_CLIENTI).map(function (r) {
    return {
      id: testo(r.id),
      nome: testo(r.nome),
      alias: testo(r.alias).split(',').map(function (s) { return s.trim(); }).filter(String),
      gruppo: testo(r.gruppo),
      email: testo(r.email),
      telefono: telefonoDalFoglio(r.telefono),
      indirizzo: testo(r.indirizzo),
      partitaIva: partitaIvaDalFoglio(r.partitaIva),
      ultimaTariffa: numeroONull(r.ultimaTariffa),
      pagaViaggio: siNoONull(r.pagaViaggio),
      kmRimborsati: siNoONull(r.kmRimborsati),
      note: testo(r.note)
    };
  }).filter(function (c) { return c.nome !== ''; });
}

function leggiCommesse() {
  return leggi(NOME_COMMESSE).map(function (r) {
    return {
      id: testo(r.id),
      idCliente: testo(r.idCliente),
      descrizione: testo(r.descrizione),
      stato: testo(r.stato).toUpperCase() || 'APERTA',
      indirizzo: testo(r.indirizzo),
      budgetOre: numeroONull(r.budgetOre),
      budgetEuro: numeroONull(r.budgetEuro),
      inizio: dataIso(r.inizio),
      finePrevista: dataIso(r.finePrevista),
      cartella: testo(r.cartella),
      note: testo(r.note)
    };
  }).filter(function (m) { return m.id !== ''; });
}

function leggiGruppi() {
  return leggi(NOME_GRUPPI).map(function (r) {
    return {
      nome: testo(r.nome),
      tariffaFissa: numeroONull(r.tariffaFissa),
      pagaViaggio: siNoONull(r.pagaViaggio) === true,
      kmRimborsati: siNoONull(r.kmRimborsati) !== false,
      maggExtra: numero(r.maggExtra),
      // A chi va il riepilogo del mese quando si fattura al gruppo e non al cliente.
      email: testo(r.email),
      note: testo(r.note)
    };
  }).filter(function (g) { return g.nome !== ''; });
}

/** Le impostazioni come oggetto: { EURO_KM: 0.76, AUTO: 'Volvo XC40', ... } */
function leggiImpostazioni() {
  var f = foglio(NOME_IMPOSTAZIONI);
  var o = {};
  IMPOSTAZIONI_INIZIALI.forEach(function (r) { o[r[0]] = r[1]; });
  if (!f || f.getLastRow() < 2) return o;
  f.getRange(2, 1, f.getLastRow() - 1, 2).getValues().forEach(function (r) {
    var k = String(r[0]).trim();
    if (!k) return;
    if (k === 'PARTITA_IVA') o[k] = partitaIvaDalFoglio(r[1]);
    else if (k === 'TELEFONO') o[k] = telefonoDalFoglio(r[1]);
    else o[k] = senzaApostrofo(r[1]);
  });
  return o;
}

function salvaImpostazioni(valori) {
  var f = foglio(NOME_IMPOSTAZIONI);
  if (!f) throw new Error('Scheda Impostazioni non trovata: lancia preparaFoglio()');
  var righe = f.getLastRow() > 1 ? f.getRange(2, 1, f.getLastRow() - 1, 1).getValues() : [];
  Object.keys(valori).forEach(function (k) {
    var i = righe.map(function (r) { return String(r[0]).trim(); }).indexOf(k);
    if (i >= 0) f.getRange(i + 2, 2).setValue(perLaCella(k, valori[k]));
    else {
      f.appendRow([k, perLaCella(k, valori[k]), '']);
      righe.push([k]);
    }
  });
  return leggiImpostazioni();
}

function salvaGruppo(g) {
  var nome = testo(g.nome);
  if (!nome) throw new Error('Serve il nome del gruppo');
  var valori = {
    nome: nome,
    tariffaFissa: g.tariffaFissa === null || g.tariffaFissa === '' || g.tariffaFissa === undefined ? '' : numero(g.tariffaFissa),
    pagaViaggio: g.pagaViaggio ? 'SI' : 'NO',
    kmRimborsati: g.kmRimborsati === false ? 'NO' : 'SI',
    maggExtra: numero(g.maggExtra)
  };
  if (g.note !== undefined) valori.note = g.note;
  if (g.email !== undefined) valori.email = testo(g.email);
  var esistente = leggi(NOME_GRUPPI).filter(function (r) { return normalizza(r.nome) === normalizza(nome); })[0];
  if (esistente) aggiornaRiga(NOME_GRUPPI, esistente._riga, valori);
  else scriviRiga(NOME_GRUPPI, valori);
  return leggiGruppi().filter(function (x) { return normalizza(x.nome) === normalizza(nome); })[0];
}

/**
 * Prossimo codice libero di una serie tipo C001.
 * Si guarda il numero piu' alto gia' presente e si aggiunge uno: cosi' i buchi
 * lasciati da righe cancellate non vengono riusati, e un codice non finisce
 * mai su due anagrafiche diverse.
 */
function prossimoCodice(codici, lettera) {
  var max = 0;
  codici.forEach(function (c) {
    var m = String(c).trim().toUpperCase().match(new RegExp('^' + lettera + '(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  var n = max + 1;
  return lettera + (n < 1000 ? ('00' + n).slice(-3) : String(n));
}

/**
 * Prossimo codice commessa: prefisso + anno a due cifre + numero, P2601.
 * Il numero riparte ogni anno. Le commesse coi codici vecchi (M001) restano
 * come sono e non contano.
 */
function prossimoCodiceCommessa(codici, prefisso, anno) {
  var p = String(prefisso || 'P').toUpperCase();
  var aa = ('0' + (anno % 100)).slice(-2);
  var max = 0;
  codici.forEach(function (c) {
    var m = String(c).trim().toUpperCase().match(new RegExp('^' + p + aa + '(\\d{2,})$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  var n = max + 1;
  return p + aa + (n < 100 ? ('0' + n).slice(-2) : String(n));
}

function creaCliente(d) {
  var pulito = testo(d.nome);
  if (!pulito) throw new Error('Serve il nome del cliente');

  // Se esiste gia' (anche solo come alias) si restituisce quello: e'
  // facilissimo ricreare due volte lo stesso cliente con una lettera di
  // differenza, e il foglio si riempirebbe di doppioni.
  var esistente = trovaCliente(leggiClienti(), '', pulito);
  if (esistente) return Object.assign({ giaEsisteva: true }, esistente);

  var id = prossimoCodice(leggiClienti().map(function (c) { return c.id; }), 'C');
  scriviRiga(NOME_CLIENTI, {
    id: id,
    nome: pulito,
    gruppo: testo(d.gruppo) || 'Privato',
    email: testo(d.email),
    telefono: testo(d.telefono),
    indirizzo: testo(d.indirizzo),
    partitaIva: testo(d.partitaIva),
    note: testo(d.note)
  });
  return Object.assign({ giaEsisteva: false }, trovaCliente(leggiClienti(), id, ''));
}

function aggiornaCliente(id, campi) {
  var riga = leggi(NOME_CLIENTI).filter(function (r) { return testo(r.id) === testo(id); })[0];
  if (!riga) throw new Error('Cliente ' + id + ' non trovato');
  var valori = {};
  ['nome', 'gruppo', 'email', 'telefono', 'indirizzo', 'partitaIva', 'note', 'alias'].forEach(function (k) {
    if (campi[k] !== undefined) valori[k] = Array.isArray(campi[k]) ? campi[k].join(', ') : campi[k];
  });
  ['pagaViaggio', 'kmRimborsati'].forEach(function (k) {
    if (campi[k] !== undefined) valori[k] = campi[k] === null ? '' : (campi[k] ? 'SI' : 'NO');
  });
  if (campi.ultimaTariffa !== undefined) valori.ultimaTariffa = campi.ultimaTariffa === null ? '' : numero(campi.ultimaTariffa);
  aggiornaRiga(NOME_CLIENTI, riga._riga, valori);
  return trovaCliente(leggiClienti(), id, '');
}

function creaCommessa(d) {
  var desc = testo(d.descrizione);
  if (!desc) throw new Error('Serve la descrizione della commessa');
  if (!d.idCliente) throw new Error('Serve il cliente della commessa');

  var commesse = leggiCommesse();
  var esistente = commesse.filter(function (m) {
    return m.idCliente === d.idCliente && normalizza(m.descrizione) === normalizza(desc);
  })[0];
  if (esistente) return Object.assign({ giaEsisteva: true }, esistente);

  var imp = leggiImpostazioni();
  var id = testo(d.id) || prossimoCodiceCommessa(
    commesse.map(function (m) { return m.id; }), imp.PREFISSO_COMMESSA, new Date().getFullYear());
  if (commesse.some(function (m) { return m.id.toUpperCase() === id.toUpperCase(); })) {
    throw new Error('Il codice ' + id + ' e\' gia\' di un\'altra commessa');
  }
  scriviRiga(NOME_COMMESSE, {
    id: id,
    idCliente: d.idCliente,
    descrizione: desc,
    stato: 'APERTA',
    indirizzo: testo(d.indirizzo),
    budgetOre: d.budgetOre === undefined || d.budgetOre === null || d.budgetOre === '' ? '' : numero(d.budgetOre),
    budgetEuro: d.budgetEuro === undefined || d.budgetEuro === null || d.budgetEuro === '' ? '' : numero(d.budgetEuro),
    inizio: d.inizio ? dataDaIso(d.inizio) : new Date(),
    finePrevista: d.finePrevista ? dataDaIso(d.finePrevista) : '',
    note: testo(d.note)
  });
  return Object.assign({ giaEsisteva: false }, leggiCommesse().filter(function (m) { return m.id === id; })[0]);
}

/**
 * Cambia i campi di una commessa, stato compreso: APERTA, SOSPESA o CHIUSA.
 * Una commessa chiusa non si propone piu' nei rapportini nuovi, ma resta: i
 * suoi rapportini, ore e costi si vedono sempre, e si puo' riaprire.
 */
function aggiornaCommessa(id, campi) {
  var codice = testo(id).toUpperCase();
  if (!codice) throw new Error('Serve il codice della commessa');
  var riga = leggi(NOME_COMMESSE).filter(function (r) { return testo(r.id).toUpperCase() === codice; })[0];
  if (!riga) throw new Error('Commessa ' + codice + ' non trovata');
  var valori = {};
  if (campi.stato !== undefined) {
    var nuovo = testo(campi.stato).toUpperCase();
    if (['APERTA', 'SOSPESA', 'CHIUSA'].indexOf(nuovo) < 0) throw new Error('Stato non valido: ' + nuovo);
    valori.stato = nuovo;
  }
  ['descrizione', 'indirizzo', 'note', 'idCliente'].forEach(function (k) {
    if (campi[k] !== undefined) valori[k] = campi[k];
  });
  ['budgetOre', 'budgetEuro'].forEach(function (k) {
    if (campi[k] !== undefined) valori[k] = campi[k] === null || campi[k] === '' ? '' : numero(campi[k]);
  });
  ['inizio', 'finePrevista'].forEach(function (k) {
    if (campi[k] !== undefined) valori[k] = campi[k] ? dataDaIso(campi[k]) : '';
  });
  var precedente = testo(riga.stato).toUpperCase();
  aggiornaRiga(NOME_COMMESSE, riga._riga, valori);
  var dopo = leggiCommesse().filter(function (m) { return m.id.toUpperCase() === codice; })[0];
  return Object.assign({ precedente: precedente, cambiato: precedente !== dopo.stato }, dopo);
}

/** Per codice se c'e', altrimenti per nome o alias. */
function trovaCliente(clienti, id, nome) {
  if (id) {
    var perId = clienti.filter(function (c) { return c.id === id; })[0];
    if (perId) return perId;
  }
  if (!nome) return null;
  var n = normalizza(nome);
  return clienti.filter(function (c) {
    return [c.nome].concat(c.alias).some(function (x) { return normalizza(x) === n; });
  })[0] || null;
}

// ---------------------------------------------------------------------------
// I conti
// ---------------------------------------------------------------------------

/**
 * Le regole economiche di un cliente: dal suo gruppo, con le eccezioni scritte
 * sulla scheda del cliente.
 *
 * tariffaFissa null vuol dire tariffa libera: la scrive il tecnico nel
 * rapportino. Un cliente senza gruppo, o con un gruppo che non c'e', e' libero.
 */
function regoleDi(cliente, gruppi, impostazioni) {
  var nomeGruppo = cliente && cliente.gruppo ? cliente.gruppo : '';
  var g = gruppi.filter(function (x) { return normalizza(x.nome) === normalizza(nomeGruppo); })[0];
  var pagaViaggio = g ? g.pagaViaggio : false;
  var kmRimborsati = g ? g.kmRimborsati : true;
  if (cliente && cliente.pagaViaggio !== null && cliente.pagaViaggio !== undefined) pagaViaggio = cliente.pagaViaggio;
  if (cliente && cliente.kmRimborsati !== null && cliente.kmRimborsati !== undefined) kmRimborsati = cliente.kmRimborsati;
  return {
    gruppo: g ? g.nome : nomeGruppo,
    tariffaFissa: g && g.tariffaFissa !== null ? g.tariffaFissa : null,
    pagaViaggio: pagaViaggio,
    kmRimborsati: kmRimborsati,
    maggExtra: g ? g.maggExtra : 0,
    euroKm: numero(impostazioni.EURO_KM),
    costoOrario: numeroONull(impostazioni.COSTO_ORARIO)
  };
}

/**
 * Il conto di un rapportino. La stessa formula vive anche nell'app (Calcolo.kt)
 * per l'anteprima mentre si compila: se cambi qui, cambia anche li', e i test
 * di tutti e due usano gli stessi casi.
 *
 *  - le ore di lavoro si pagano alla tariffa;
 *  - le ore extra alla tariffa piu' la maggiorazione del gruppo;
 *  - le ore di viaggio solo se il gruppo (o il cliente) le paga;
 *  - i km alla tariffa ACI, se il cliente li rimborsa;
 *  - le spese si sommano cosi' come sono.
 *
 * Ogni pezzo si arrotonda al centesimo PRIMA di sommare: il totale e' sempre
 * la somma esatta dei pezzi che si vedono sul PDF.
 */
function calcola(r, regole) {
  var lavoro = numero(r.oreLavoro);
  var extra = numero(r.oreExtra);
  var viaggio = numero(r.oreViaggio);
  var tariffa = regole.tariffaFissa !== null && regole.tariffaFissa !== undefined
    ? regole.tariffaFissa : numero(r.tariffa);
  var compenso = centesimi(
    (lavoro + (regole.pagaViaggio ? viaggio : 0)) * tariffa +
    extra * tariffa * (1 + numero(regole.maggExtra) / 100)
  );
  var rimborso = regole.kmRimborsati ? centesimi(numero(r.km) * numero(regole.euroKm)) : 0;
  var spese = centesimi(numero(r.spese));
  return {
    oreTotali: Math.round((lavoro + extra + viaggio) * 100) / 100,
    tariffa: tariffa,
    compensoOre: compenso,
    rimborsoKm: rimborso,
    totale: centesimi(compenso + rimborso + spese)
  };
}

function centesimi(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Rapportini
// ---------------------------------------------------------------------------

/**
 * Il prossimo numero dell'anno: RAP/2026/0001, RAP/2026/0002...
 * L'anno e' quello della data del rapportino, non di quando arriva: un
 * rapportino del 31 dicembre spedito il 2 gennaio resta nell'anno vecchio.
 */
function prossimoNumeroRapportino(ids, anno) {
  var max = 0;
  ids.forEach(function (id) {
    var m = String(id || '').match(/^RAP\/(\d{4})\/(\d+)$/);
    if (m && Number(m[1]) === anno) max = Math.max(max, parseInt(m[2], 10));
  });
  return 'RAP/' + anno + '/' + ('000' + (max + 1)).slice(-4);
}

/**
 * Crea o aggiorna un rapportino.
 *
 * Il telefono manda sempre lo stesso idLocale per lo stesso rapportino: alla
 * prima volta si crea la riga, dalla seconda la si aggiorna. Cosi' un invio
 * ripetuto perche' la risposta si era persa per strada non scrive una seconda
 * riga, e riaprire un rapportino per correggerlo e' la stessa operazione.
 *
 * Se il cliente o la commessa non esistono ancora (creati sul telefono senza
 * campo) si creano qui, prima della riga.
 */
function salvaRapportino(r) {
  if (!r.idLocale && !r.id) throw new Error('Manca l\'identificativo del rapportino');
  var righe = leggi(NOME_RAPPORTINI);
  var esistente = trovaRiga(righe, r.id, r.idLocale);

  if (esistente && STATI_BLOCCATI.indexOf(testo(esistente.stato).toUpperCase()) >= 0) {
    throw new Error('Il rapportino ' + esistente.id + ' e\' gia\' firmato: riportalo in bozza per modificarlo');
  }

  var clienti = leggiClienti();
  var cliente = trovaCliente(clienti, testo(r.idCliente), testo(r.cliente));
  if (!cliente && !testo(r.cliente)) throw new Error('Manca il cliente');

  // Prima i controlli, poi le creazioni: un rapportino rifiutato non deve
  // lasciare nel foglio un cliente o una commessa nati per lui.
  var impostazioni = leggiImpostazioni();
  var regole = regoleDi(cliente || { gruppo: testo(r.gruppo) || 'Privato' }, leggiGruppi(), impostazioni);
  if (regole.tariffaFissa === null && !(numero(r.tariffa) > 0)) {
    throw new Error('Manca la tariffa oraria per ' + (cliente ? cliente.nome : testo(r.cliente)));
  }

  if (!cliente) cliente = creaCliente({ nome: r.cliente, gruppo: r.gruppo });

  var commessa = null;
  if (testo(r.idCommessa)) {
    commessa = leggiCommesse().filter(function (m) { return m.id.toUpperCase() === testo(r.idCommessa).toUpperCase(); })[0] || null;
  }
  if (!commessa && testo(r.commessa)) {
    commessa = creaCommessa({ idCliente: cliente.id, descrizione: r.commessa });
  }

  // Le tariffe di un rapportino gia' scritto non cambiano se cambiano le
  // impostazioni: aggiornare l'ACI a gennaio non deve riscrivere luglio.
  // Si ricalcola con le regole di oggi solo se e' cambiato il cliente.
  if (esistente && testo(esistente.idCliente) === cliente.id && testo(esistente.euroKm) !== '') {
    regole.euroKm = numero(esistente.euroKm);
    regole.maggExtra = numero(esistente.maggExtra);
    regole.pagaViaggio = siNoONull(esistente.pagaViaggio) === true;
    regole.kmRimborsati = siNoONull(esistente.kmRimborsati) !== false;
    regole.costoOrario = numeroONull(esistente.costoOrario);
    if (regole.tariffaFissa !== null) regole.tariffaFissa = numero(esistente.tariffa);
  }

  var conto = calcola(r, regole);

  var data = r.data ? dataDaIso(r.data) : new Date();
  var adesso = new Date();
  var valori = {
    idLocale: testo(r.idLocale) || (esistente ? testo(esistente.idLocale) : ''),
    data: data,
    tecnico: testo(r.tecnico) || testo(impostazioni.TECNICO),
    idCliente: cliente.id,
    cliente: cliente.nome,
    gruppo: regole.gruppo,
    idCommessa: commessa ? commessa.id : '',
    commessa: commessa ? commessa.descrizione : '',
    ticket: testo(r.ticket),
    luogo: testo(r.luogo),
    descrizione: testo(r.descrizione),
    oreLavoro: numero(r.oreLavoro),
    oreExtra: numero(r.oreExtra),
    oreViaggio: numero(r.oreViaggio),
    oreTotali: conto.oreTotali,
    km: numero(r.km),
    spese: numero(r.spese),
    noteSpese: testo(r.noteSpese),
    tariffa: conto.tariffa,
    pagaViaggio: regole.pagaViaggio ? 'SI' : 'NO',
    kmRimborsati: regole.kmRimborsati ? 'SI' : 'NO',
    euroKm: regole.euroKm,
    maggExtra: regole.maggExtra,
    compensoOre: conto.compensoOre,
    rimborsoKm: conto.rimborsoKm,
    totale: conto.totale,
    costoOrario: regole.costoOrario === null ? '' : regole.costoOrario,
    noteInterne: testo(r.noteInterne),
    modificato: adesso
  };

  var riga;
  if (esistente) {
    riga = esistente._riga;
    aggiornaRiga(NOME_RAPPORTINI, riga, valori);
  } else {
    valori.id = prossimoNumeroRapportino(righe.map(function (x) { return x.id; }), data.getFullYear());
    valori.stato = 'BOZZA';
    valori.creato = adesso;
    riga = scriviRiga(NOME_RAPPORTINI, valori);
  }

  // La tariffa libera si ricorda: al prossimo rapportino per questo cliente
  // il telefono la propone gia' scritta.
  if (regole.tariffaFissa === null && conto.tariffa > 0 && cliente.ultimaTariffa !== conto.tariffa) {
    aggiornaCliente(cliente.id, { ultimaTariffa: conto.tariffa });
  }

  return rapportinoDaRiga(leggi(NOME_RAPPORTINI).filter(function (x) { return x._riga === riga; })[0]);
}

function trovaRiga(righe, id, idLocale) {
  if (idLocale) {
    var perLocale = righe.filter(function (x) { return testo(x.idLocale) === testo(idLocale); })[0];
    if (perLocale) return perLocale;
  }
  if (id) return righe.filter(function (x) { return testo(x.id) === testo(id); })[0] || null;
  return null;
}

/**
 * I rapportini fra due date (aaaa-mm-gg, comprese), i piu' recenti prima.
 * Gli annullati non si mandano, a meno di chiederli.
 */
function leggiRapportini(da, a, ancheAnnullati) {
  return leggi(NOME_RAPPORTINI)
    .map(rapportinoDaRiga)
    .filter(function (r) {
      if (!ancheAnnullati && r.stato === 'ANNULLATO') return false;
      if (da && r.data && r.data < da) return false;
      if (a && r.data && r.data > a) return false;
      return true;
    })
    .sort(function (x, y) {
      return x.data < y.data ? 1 : x.data > y.data ? -1 : (x.creato < y.creato ? 1 : -1);
    });
}

function rapportinoDaRiga(r) {
  return {
    id: testo(r.id),
    idLocale: testo(r.idLocale),
    data: dataIso(r.data),
    tecnico: testo(r.tecnico),
    idCliente: testo(r.idCliente),
    cliente: testo(r.cliente),
    gruppo: testo(r.gruppo),
    idCommessa: testo(r.idCommessa),
    commessa: testo(r.commessa),
    ticket: testo(r.ticket),
    luogo: testo(r.luogo),
    descrizione: testo(r.descrizione),
    oreLavoro: numero(r.oreLavoro),
    oreExtra: numero(r.oreExtra),
    oreViaggio: numero(r.oreViaggio),
    oreTotali: numero(r.oreTotali) || numero(r.oreLavoro) + numero(r.oreExtra) + numero(r.oreViaggio),
    km: numero(r.km),
    spese: numero(r.spese),
    noteSpese: testo(r.noteSpese),
    foto: fileDaCella(r.foto),
    tariffa: numero(r.tariffa),
    pagaViaggio: siNoONull(r.pagaViaggio) === true,
    kmRimborsati: siNoONull(r.kmRimborsati) !== false,
    euroKm: numero(r.euroKm),
    maggExtra: numero(r.maggExtra),
    compensoOre: numero(r.compensoOre),
    rimborsoKm: numero(r.rimborsoKm),
    totale: numero(r.totale),
    costoOrario: numeroONull(r.costoOrario),
    noteInterne: testo(r.noteInterne),
    firma: fileDaCella(r.firma)[0] || null,
    firmatario: testo(r.firmatario),
    firmatoIl: dataOraIso(r.firmatoIl),
    stato: testo(r.stato).toUpperCase() || 'BOZZA',
    inviatoIl: dataOraIso(r.inviatoIl),
    fatturatoIl: dataOraIso(r.fatturatoIl),
    creato: dataOraIso(r.creato),
    modificato: dataOraIso(r.modificato)
  };
}

/**
 * Cambia lo stato di uno o piu' rapportini (il riepilogo di luglio si segna
 * fatturato tutto insieme).
 *
 * Tornare in BOZZA toglie la firma: il cliente ha firmato quello che c'era, e
 * se il rapportino cambia quella firma non vale piu'.
 */
function cambiaStato(ids, stato) {
  var nuovo = testo(stato).toUpperCase();
  if (STATI.indexOf(nuovo) < 0) throw new Error('Stato non valido: ' + nuovo);
  if (nuovo === 'FIRMATO') throw new Error('Per firmare serve la firma: caricala dal rapportino');
  var righe = leggi(NOME_RAPPORTINI);
  var adesso = new Date();
  return ids.map(function (id) {
    var riga = trovaRiga(righe, id, id);
    if (!riga) throw new Error('Rapportino ' + id + ' non trovato');
    var valori = { stato: nuovo, modificato: adesso };
    if (nuovo === 'BOZZA') {
      valori.firma = '';
      valori.firmatario = '';
      valori.firmatoIl = '';
      valori.inviatoIl = '';
      valori.fatturatoIl = '';
    }
    if (nuovo === 'INVIATO') {
      valori.inviatoIl = adesso;
      valori.fatturatoIl = '';
    }
    if (nuovo === 'FATTURATO') valori.fatturatoIl = adesso;
    aggiornaRiga(NOME_RAPPORTINI, riga._riga, valori);
    return rapportinoDaRiga(leggi(NOME_RAPPORTINI).filter(function (x) { return x._riga === riga._riga; })[0]);
  });
}

// ---------------------------------------------------------------------------
// File: foto delle spese, firme, documenti delle commesse
// ---------------------------------------------------------------------------

/**
 * La cartella "Wisper" nel Drive di chi possiede il foglio, con dentro
 * Spese/2026-10, Firme e Commesse. Si crea la prima volta e poi si ritrova
 * dall'id salvato, cosi' rinominarla o spostarla non rompe niente.
 */
function cartellaRadice() {
  var prop = PropertiesService.getScriptProperties();
  var id = prop.getProperty('CARTELLA_DRIVE');
  if (id) {
    try {
      var c = DriveApp.getFolderById(id);
      if (!c.isTrashed()) return c;
    } catch (e) {
      // cancellata o non piu' accessibile: se ne crea una nuova
    }
  }
  var nuova = DriveApp.createFolder('Wisper');
  prop.setProperty('CARTELLA_DRIVE', nuova.getId());
  return nuova;
}

function sottocartella(madre, nome) {
  var it = madre.getFoldersByName(nome);
  return it.hasNext() ? it.next() : madre.createFolder(nome);
}

function urlFile(id) {
  return 'https://drive.google.com/file/d/' + id + '/view';
}

function idDaUrl(url) {
  var m = String(url).match(/\/d\/([A-Za-z0-9_-]{10,})/) || String(url).match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : '';
}

/** Una cella con un link per riga -> [{id, url}] */
function fileDaCella(v) {
  return testo(v).split(/\s*\n\s*/).filter(String).map(function (url) {
    return { id: idDaUrl(url), url: url };
  }).filter(function (f) { return f.id; });
}

/**
 * Carica una foto o una firma e la lega al suo posto.
 *
 * d.tipo:
 *  - 'spesa'        foto di uno scontrino, aggiunta al rapportino (anche dopo la firma:
 *                   e' un allegato, non cambia il lavoro firmato)
 *  - 'firma'        firma del cliente, o la foto del foglio firmato a mano: il
 *                   rapportino diventa FIRMATO
 *  - 'firmaTecnico' la firma del compilatore, una volta per tutte
 *  - 'documento'    un documento della commessa d.idCommessa
 *
 * d.idFile nasce sul telefono ed e' lo stesso a ogni tentativo: se il file
 * c'e' gia' non se ne crea un secondo.
 */
function caricaFile(d) {
  if (!d.base64) throw new Error('File vuoto');
  var tipo = d.tipo;
  var mime = d.mime || 'image/jpeg';
  var estensione = mime === 'image/png' ? '.png' : mime === 'application/pdf' ? '.pdf' : '.jpg';
  var radice = cartellaRadice();

  if (tipo === 'firmaTecnico') {
    var fileT = sottocartella(radice, 'Firme').createFile(
      Utilities.newBlob(Utilities.base64Decode(d.base64), mime, 'firma-tecnico' + estensione));
    salvaImpostazioni({ FIRMA_TECNICO: urlFile(fileT.getId()) });
    return { id: fileT.getId(), url: urlFile(fileT.getId()) };
  }

  if (tipo === 'documento') {
    var commessa = leggi(NOME_COMMESSE).filter(function (r) { return testo(r.id) === testo(d.idCommessa); })[0];
    if (!commessa) throw new Error('Commessa ' + d.idCommessa + ' non trovata');
    var cartella = cartellaCommessa(commessa);
    var fileD = cartella.createFile(Utilities.newBlob(Utilities.base64Decode(d.base64), mime, testo(d.nome) || 'documento'));
    return { id: fileD.getId(), url: urlFile(fileD.getId()), nome: fileD.getName() };
  }

  var righe = leggi(NOME_RAPPORTINI);
  var riga = trovaRiga(righe, d.id, d.idLocale);
  if (!riga) throw new Error('Rapportino non trovato: va salvato prima della foto');
  var sigla = testo(riga.id).replace(/\//g, '-');
  var unico = testo(d.idFile) || Utilities.getUuid().slice(0, 8);

  if (tipo === 'spesa') {
    var dataRap = eData(riga.data) ? riga.data : new Date();
    var mese = Utilities.formatDate(dataRap, FUSO, 'yyyy-MM');
    var cartellaS = sottocartella(sottocartella(radice, 'Spese'), mese);
    var nome = sigla + ' spesa ' + unico + estensione;
    var gia = cartellaS.getFilesByName(nome);
    var file = gia.hasNext() ? gia.next() : cartellaS.createFile(
      Utilities.newBlob(Utilities.base64Decode(d.base64), mime, nome));
    var url = urlFile(file.getId());
    var presenti = fileDaCella(riga.foto);
    if (!presenti.some(function (f) { return f.id === file.getId(); })) {
      aggiornaRiga(NOME_RAPPORTINI, riga._riga, {
        foto: presenti.map(function (f) { return f.url; }).concat([url]).join('\n'),
        modificato: new Date()
      });
    }
    return { id: file.getId(), url: url };
  }

  if (tipo === 'firma') {
    var stato = testo(riga.stato).toUpperCase();
    if (stato === 'FIRMATO' || stato === 'INVIATO' || stato === 'FATTURATO') {
      var gia2 = fileDaCella(riga.firma)[0];
      if (gia2) return gia2;   // una ripetizione dello stesso invio
    }
    var nomeF = sigla + ' firma ' + unico + estensione;
    var cartellaF = sottocartella(radice, 'Firme');
    var esiste = cartellaF.getFilesByName(nomeF);
    var fileF = esiste.hasNext() ? esiste.next() : cartellaF.createFile(
      Utilities.newBlob(Utilities.base64Decode(d.base64), mime, nomeF));
    aggiornaRiga(NOME_RAPPORTINI, riga._riga, {
      firma: urlFile(fileF.getId()),
      firmatario: testo(d.firmatario),
      firmatoIl: d.firmatoIl ? new Date(d.firmatoIl) : new Date(),
      // Una firma arrivata dopo l'invio (il foglio firmato a mano, scansionato
      // dopo) si aggiunge, ma non riporta indietro un rapportino gia' inviato
      // o fatturato.
      stato: stato === 'INVIATO' || stato === 'FATTURATO' ? stato : 'FIRMATO',
      modificato: new Date()
    });
    return { id: fileF.getId(), url: urlFile(fileF.getId()) };
  }

  throw new Error('Tipo di file sconosciuto: ' + tipo);
}

function cartellaCommessa(riga) {
  var url = testo(riga.cartella);
  if (url) {
    var m = url.match(/folders\/([A-Za-z0-9_-]{10,})/);
    if (m) {
      try { return DriveApp.getFolderById(m[1]); } catch (e) { /* si ricrea */ }
    }
  }
  var c = sottocartella(sottocartella(cartellaRadice(), 'Commesse'), testo(riga.id) + ' ' + testo(riga.descrizione));
  aggiornaRiga(NOME_COMMESSE, riga._riga, { cartella: c.getUrl() });
  return c;
}

/**
 * I documenti della cartella di una commessa, piu' recenti prima. La cartella si
 * crea la prima volta che la si guarda: cosi' ogni commessa ne ha una pronta.
 */
function documentiCommessa(idCommessa) {
  var riga = leggi(NOME_COMMESSE).filter(function (r) { return testo(r.id) === testo(idCommessa); })[0];
  if (!riga) throw new Error('Commessa ' + idCommessa + ' non trovata');
  var cartella = cartellaCommessa(riga);
  var file = [];
  var it = cartella.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    file.push({
      id: f.getId(),
      nome: f.getName(),
      url: f.getUrl(),
      mime: f.getMimeType(),
      data: Utilities.formatDate(f.getLastUpdated(), FUSO, "yyyy-MM-dd'T'HH:mm:ss")
    });
  }
  file.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  return { ok: true, cartella: cartella.getUrl(), documenti: file };
}

/** Toglie una foto dal rapportino. Il file va nel cestino di Drive, da cui si recupera. */
function togliFile(id, fileId) {
  var riga = trovaRiga(leggi(NOME_RAPPORTINI), id, id);
  if (!riga) throw new Error('Rapportino ' + id + ' non trovato');
  var rimaste = fileDaCella(riga.foto).filter(function (f) { return f.id !== fileId; });
  aggiornaRiga(NOME_RAPPORTINI, riga._riga, {
    foto: rimaste.map(function (f) { return f.url; }).join('\n'),
    modificato: new Date()
  });
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* gia' via */ }
  return rapportinoDaRiga(leggi(NOME_RAPPORTINI).filter(function (x) { return x._riga === riga._riga; })[0]);
}

/**
 * Il contenuto di un file, per metterlo nel PDF. Solo file dentro la cartella
 * Wisper: chi ha il codice non deve poter leggere tutto il Drive.
 */
function leggiFile(id) {
  if (!id) throw new Error('Manca il file');
  var file = DriveApp.getFileById(id);
  if (!dentroWisper(file)) throw new Error('File fuori dalla cartella Wisper');
  var blob = file.getBlob();
  return {
    id: id,
    nome: file.getName(),
    mime: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function dentroWisper(file) {
  var radice = cartellaRadice().getId();
  var daGuardare = [];
  var p = file.getParents();
  while (p.hasNext()) daGuardare.push(p.next());
  for (var livello = 0; livello < 5 && daGuardare.length; livello++) {
    var prossimi = [];
    for (var i = 0; i < daGuardare.length; i++) {
      if (daGuardare[i].getId() === radice) return true;
      var su = daGuardare[i].getParents();
      while (su.hasNext()) prossimi.push(su.next());
    }
    daGuardare = prossimi;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Manda la mail coi PDF allegati, dall'account di chi possiede il foglio, e
 * segna i rapportini come INVIATO. Con aMe la manda solo a se stessi, come
 * anteprima, e non cambia niente.
 */
function inviaEmail(d) {
  var aMe = d.aMe === true;
  var destinatario = aMe ? Session.getEffectiveUser().getEmail() : testo(d.a);
  if (!destinatario) throw new Error('Manca l\'indirizzo del cliente');
  var imp = leggiImpostazioni();
  var allegati = (d.allegati || []).map(function (a) {
    return Utilities.newBlob(Utilities.base64Decode(a.base64), a.mime || 'application/pdf', a.nome || 'rapportino.pdf');
  });
  var opzioni = { attachments: allegati, name: testo(imp.RAGIONE_SOCIALE) || 'Wisper' };
  if (!aMe && testo(d.cc)) opzioni.cc = testo(d.cc);
  if (testo(imp.EMAIL)) opzioni.replyTo = testo(imp.EMAIL);
  MailApp.sendEmail(destinatario, testo(d.oggetto) || 'Rapportino', testo(d.messaggio) || ' ', opzioni);
  if (aMe || !d.ids || !d.ids.length) return [];
  // Un riepilogo puo' contenere rapportini gia' fatturati: mandarlo non li
  // riporta indietro a "inviato".
  var righe = leggi(NOME_RAPPORTINI);
  var daSegnare = d.ids.filter(function (id) {
    var r = trovaRiga(righe, id, id);
    return r && testo(r.stato).toUpperCase() !== 'FATTURATO';
  });
  return daSegnare.length ? cambiaStato(daSegnare, 'INVIATO') : [];
}

// ---------------------------------------------------------------------------
// Il registro degli accessi
// ---------------------------------------------------------------------------

/*
 * Ogni richiesta lascia una riga nella scheda Accessi: quando, com'e' andata,
 * per fare cosa, da quale dispositivo. Telefono e computer si presentano con un
 * identificativo nato su di loro al primo avvio (mai uguale su due dispositivi)
 * e un nome che si legge ("motorola edge 60 pro", "UFFICIO-PC (manuel)"). La
 * scheda Dispositivi li elenca, con il primo e l'ultimo accesso: la colonna NOTE
 * e' vostra, per scriverci di chi e' ognuno.
 *
 * L'indirizzo IP non c'e': Google non lo passa allo script, a nessuno script.
 * Il dispositivo dice di piu': l'IP di un telefono cambia da una cella
 * all'altra, e tanti telefoni ne condividono uno.
 *
 * Gli avvisi arrivano per email al proprietario del foglio (e a EMAIL_AVVISI):
 *  - un dispositivo mai visto entra col codice giusto;
 *  - una richiesta col codice giusto arriva senza dire chi e' (una versione
 *    vecchia dell'app, o qualcuno che usa il codice a mano): al massimo uno al giorno;
 *  - 5 o piu' codici sbagliati di fila: al massimo uno ogni 6 ore.
 * Nelle righe non finisce mai il codice, giusto o sbagliato che sia.
 */

var INTESTAZIONI_ACCESSI = ['QUANDO', 'ESITO', 'AZIONE', 'DISPOSITIVO', 'APP', 'ID_DISPOSITIVO'];
var INTESTAZIONI_DISPOSITIVI = ['ID_DISPOSITIVO', 'NOME', 'APP', 'PRIMO_ACCESSO', 'ULTIMO_ACCESSO', 'NOTE'];

/** Oltre tante righe le piu' vecchie si tolgono (una volta al giorno): circa un anno d'uso. */
var MASSIMO_ACCESSI = 60000;
var ACCESSI_DOPO_LA_PULIZIA = 50000;

/** Dopo tanti codici sbagliati in un'ora non si scrivono piu' righe, si contano e basta. */
var MASSIMO_SBAGLIATI_SCRITTI = 50;
var SOGLIA_AVVISO_SBAGLIATI = 5;

function schedaAccessi() {
  return schedaFissa(NOME_ACCESSI, INTESTAZIONI_ACCESSI);
}

function schedaDispositivi() {
  return schedaFissa(NOME_DISPOSITIVI, INTESTAZIONI_DISPOSITIVI);
}

/** La scheda, creata con le sue intestazioni se non c'e' ancora. */
function schedaFissa(nome, intestazioni) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var f = ss.getSheetByName(nome);
  if (f) return f;
  f = ss.insertSheet(nome);
  f.getRange(1, 1, 1, intestazioni.length).setValues([intestazioni]).setFontWeight('bold');
  f.setFrozenRows(1);
  return f;
}

/**
 * La riga nel registro. Non deve mai fermare una risposta: se qualcosa va
 * storto qui, la richiesta va avanti lo stesso.
 *
 * @param d     la richiesta: disp, dispNome, app, azione (il codice non si legge)
 * @param esito 'ok', 'errore' (codice giusto, lavoro rifiutato), 'codice sbagliato',
 *              'rifiutato', 'richiesta non valida'
 */
function registraAccesso(d, esito) {
  try {
    d = d || {};
    var adesso = new Date();
    var id = testo(d.disp).slice(0, 64);
    var nome = testo(d.dispNome).slice(0, 80);
    var app = testo(d.app).slice(0, 40);
    var azione = testo(d.azione).slice(0, 40) || 'anagrafiche';
    var entrato = esito === 'ok' || esito === 'errore';
    var cache = CacheService.getScriptCache();

    if (!entrato) {
      var sbagliati = Number(cache.get('sbagliati') || 0) + 1;
      cache.put('sbagliati', String(sbagliati), 3600);
      if (esito === 'codice sbagliato' && sbagliati >= SOGLIA_AVVISO_SBAGLIATI) {
        avvisaUnaVolta('sbagliati', 6 * 3600, 'Wisper: tanti codici sbagliati',
          'Nell\'ultima ora sono arrivate ' + sbagliati + ' richieste al foglio di Wisper con un codice sbagliato.\n\n' +
          'Una o due sono un errore di battitura. Tante di fila sono qualcuno che prova a indovinare il codice: ' +
          'piu\' e\' lungo, piu\' e\' al sicuro.\n\n' +
          'Ultima richiesta: ' + quando(adesso) + ', dispositivo "' + (nome || 'senza nome') + '".\n' +
          'I dettagli sono nella scheda Accessi del foglio.\n\n(Questo avviso arriva al massimo una volta ogni 6 ore.)');
      }
      if (sbagliati > MASSIMO_SBAGLIATI_SCRITTI) return;
    }

    var f = schedaAccessi();
    f.appendRow([adesso, esito, azione, nome || 'senza nome', app, id].map(function (v, i) {
      return i === 0 ? v : perLaCella(null, v);
    }));
    puliziaAccessi(f);
    if (entrato) dispositivoVisto(id, nome, app, azione, adesso, cache);
  } catch (err) {
    // Il registro non deve fermare la risposta.
  }
}

/**
 * Aggiorna la scheda Dispositivi. Il primo accesso di un dispositivo mai visto
 * manda l'avviso. Per non rileggere la scheda a ogni richiesta, un dispositivo
 * gia' visto si riguarda al massimo ogni 10 minuti.
 */
function dispositivoVisto(id, nome, app, azione, adesso, cache) {
  if (!id) {
    if (dispositiviGiaAggiornati(cache)) {
      avvisaUnaVolta('senzaNome', 24 * 3600, 'Wisper: un accesso senza nome',
        'Una richiesta col codice giusto e\' arrivata al foglio di Wisper senza dire da quale dispositivo.\n\n' +
        'Quando: ' + quando(adesso) + '\nAzione: ' + azione + '\n\n' +
        'Succede con una versione vecchia di Wisper che non si e\' ancora aggiornata: controlla che su tutti i ' +
        'telefoni e sul computer ci sia la 0.3.3 o una successiva. Se ce l\'hanno gia\' tutti, qualcuno sta usando ' +
        'il codice a mano: cambialo (Apps Script, Impostazioni progetto, Proprieta\' dello script, CODICE) e ' +
        'rimettilo su telefoni e computer.\n\n(Questo avviso arriva al massimo una volta al giorno.)');
    }
    return;
  }
  if (cache.get('visto:' + id)) return;
  var f = schedaDispositivi();
  var trovato = rigaDispositivo(f, id);
  var nuovo = false;
  if (trovato < 0) {
    var lucchetto = LockService.getScriptLock();
    if (!lucchetto.tryLock(5000)) return;
    try {
      // Due richieste dello stesso dispositivo nuovo nello stesso istante: una sola riga, un solo avviso.
      trovato = rigaDispositivo(f, id);
      if (trovato < 0) {
        f.appendRow([perLaCella(null, id), perLaCella(null, nome), perLaCella(null, app), adesso, adesso, '']);
        nuovo = true;
      }
    } finally {
      lucchetto.releaseLock();
    }
  }
  if (nuovo) {
    avvisa('Wisper: un dispositivo nuovo',
      'Un dispositivo nuovo e\' entrato nel foglio di Wisper col codice giusto.\n\n' +
      'Nome: ' + (nome || '(nessuno)') + '\nApp: ' + (app || '(non detta)') + '\nQuando: ' + quando(adesso) + '\n\n' +
      'Se e\' uno dei vostri (un telefono nuovo, Wisper reinstallato, il computer dell\'ufficio) va tutto bene: ' +
      'nella scheda Dispositivi, colonna NOTE, potete scrivere di chi e\'.\n' +
      'Se non lo riconoscete, qualcuno ha il codice: cambialo (Apps Script, Impostazioni progetto, Proprieta\' ' +
      'dello script, CODICE) e rimettilo su telefoni e computer. Cosa ha letto o scritto e\' nella scheda Accessi.');
  } else if (trovato >= 0) {
    f.getRange(trovato, 2, 1, 2).setValues([[perLaCella(null, nome), perLaCella(null, app)]]);
    f.getRange(trovato, 5).setValue(adesso);
  }
  cache.put('visto:' + id, '1', 600);
}

/** Il numero di riga del dispositivo nella scheda Dispositivi, o -1. */
function rigaDispositivo(f, id) {
  if (f.getLastRow() < 2) return -1;
  var ids = f.getRange(2, 1, f.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (testo(senzaApostrofo(ids[i][0])) === id) return i + 2;
  }
  return -1;
}

/**
 * Vero quando le app che si presentano ci sono da almeno due giorni: da li' in
 * poi, una richiesta senza nome non e' piu' un telefono rimasto indietro di
 * qualche ora.
 */
function dispositiviGiaAggiornati(cache) {
  var giaDetto = cache.get('aggiornati');
  if (giaDetto) return giaDetto === 'si';
  var f = foglio(NOME_DISPOSITIVI);
  var si = false;
  if (f && f.getLastRow() > 1) {
    var due = new Date().getTime() - 2 * 24 * 3600 * 1000;
    si = f.getRange(2, 4, f.getLastRow() - 1, 1).getValues().some(function (r) {
      return eData(r[0]) && r[0].getTime() < due;
    });
  }
  cache.put('aggiornati', si ? 'si' : 'no', 3600);
  return si;
}

/** Una volta al giorno, se le righe sono troppe, via le piu' vecchie. */
function puliziaAccessi(f) {
  var prop = PropertiesService.getScriptProperties();
  var ultima = Number(prop.getProperty('ACCESSI_PULITI') || 0);
  if (new Date().getTime() - ultima < 24 * 3600 * 1000) return;
  prop.setProperty('ACCESSI_PULITI', String(new Date().getTime()));
  var righe = f.getLastRow() - 1;
  if (righe > MASSIMO_ACCESSI) f.deleteRows(2, righe - ACCESSI_DOPO_LA_PULIZIA);
}

/** L'avviso, ma non piu' di uno ogni tot secondi per lo stesso motivo. */
function avvisaUnaVolta(motivo, secondi, oggetto, corpo) {
  var prop = PropertiesService.getScriptProperties();
  var ultimo = Number(prop.getProperty('AVVISO_' + motivo) || 0);
  if (new Date().getTime() - ultimo < secondi * 1000) return;
  prop.setProperty('AVVISO_' + motivo, String(new Date().getTime()));
  avvisa(oggetto, corpo);
}

/** L'email al proprietario del foglio, e a chi c'e' in EMAIL_AVVISI. */
function avvisa(oggetto, corpo) {
  var a = [Session.getEffectiveUser().getEmail()];
  testo(leggiImpostazioni().EMAIL_AVVISI).split(',').forEach(function (x) {
    x = x.trim();
    if (x && a.indexOf(x) < 0) a.push(x);
  });
  MailApp.sendEmail(a.filter(String).join(','), oggetto, corpo, { name: 'Wisper' });
}

function quando(d) {
  return Utilities.formatDate(d, FUSO, 'dd/MM/yyyy HH:mm');
}

// ---------------------------------------------------------------------------
// Utilita'
// ---------------------------------------------------------------------------

function testo(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function numero(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function numeroONull(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return numero(v);
}

/** 'SI' -> true, 'NO' -> false, vuoto -> null (= decide il gruppo). */
function siNoONull(v) {
  var s = testo(v).toUpperCase();
  if (s === 'SI' || s === 'SÌ' || s === 'TRUE' || s === 'X') return true;
  if (s === 'NO' || s === 'FALSE') return false;
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

/**
 * Vero per una data. Non con instanceof: una data che arriva da un altro
 * contesto (le prove con Node, per esempio) non e' "instanceof" il Date di qui.
 */
function eData(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

/** Una data del foglio (Date, "15/10/2026" o "2026-10-15") -> "2026-10-15". */
function dataIso(v) {
  if (eData(v)) return Utilities.formatDate(v, FUSO, 'yyyy-MM-dd');
  var s = testo(v);
  var it = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (it) return it[3] + '-' + ('0' + it[2]).slice(-2) + '-' + ('0' + it[1]).slice(-2);
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : '';
}

function dataOraIso(v) {
  if (eData(v)) return Utilities.formatDate(v, FUSO, "yyyy-MM-dd'T'HH:mm:ss");
  return testo(v);
}

/** "2026-10-15" -> la data a mezzanotte, ora italiana. */
function dataDaIso(s) {
  var iso = dataIso(s);
  if (!iso) throw new Error('Data non valida: ' + s);
  return Utilities.parseDate(iso, FUSO, 'yyyy-MM-dd');
}

function messaggio(err) {
  return err && err.message ? err.message : String(err);
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

// Da lanciare a mano dall'editor. Non scrive niente: mostra solo cosa vede.
function provaTutto() {
  Logger.log('Schede: ' + SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (s) { return s.getName(); }).join(', '));
  Logger.log('Clienti: ' + leggiClienti().length + ' | Commesse: ' + leggiCommesse().length +
    ' | Gruppi: ' + leggiGruppi().map(function (g) { return g.nome; }).join(', '));
  Logger.log('Impostazioni: ' + JSON.stringify(leggiImpostazioni()));
  Logger.log('Rapportini: ' + leggiRapportini().length);
}
