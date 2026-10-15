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
 */

var NOME_RAPPORTINI = 'Rapportini';
var NOME_CLIENTI = 'Clienti';
var NOME_COMMESSE = 'Commesse';
var NOME_GRUPPI = 'Gruppi';
var NOME_IMPOSTAZIONI = 'Impostazioni';

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
  ['FIRMA_TECNICO', '', 'La firma del compilatore: si mette da sola su ogni rapportino. La carica il programma.']
];

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
  try {
    var p = (e && e.parameter) || {};
    controllaCodice(p.codice);
    switch (p.azione) {
      case 'rapportini':
        return json({ ok: true, rapportini: leggiRapportini(p.da, p.a, p.tutti === '1') });
      case 'file':
        return json({ ok: true, file: leggiFile(p.id) });
      case 'documenti':
        return json(documentiCommessa(p.idCommessa));
      default:
        return json(rispostaAnagrafiche());
    }
  } catch (err) {
    return json({ ok: false, errore: messaggio(err) });
  }
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    controllaCodice(d.codice);
    if (d.azione === 'anagrafiche') return json(rispostaAnagrafiche());
    if (d.azione === 'rapportini') {
      return json({ ok: true, rapportini: leggiRapportini(d.da, d.a, d.tutti === true) });
    }
    if (d.azione === 'file') return json({ ok: true, file: leggiFile(d.id) });
    if (d.azione === 'documenti') return json(documentiCommessa(d.idCommessa));

    // Tutto il resto scrive: uno alla volta. Telefono e computer possono
    // salvare nello stesso istante, e due righe col numero RAP/2026/0007
    // sarebbero un guaio da sistemare a mano.
    var lucchetto = LockService.getScriptLock();
    lucchetto.waitLock(30000);
    try {
      return json(scrivi(d));
    } finally {
      lucchetto.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, errore: messaggio(err) });
  }
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
      o[k] = dati[i][c];
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
    return k && Object.prototype.hasOwnProperty.call(valori, k) ? valori[k] : '';
  }));
  return f.getLastRow();
}

/** Riscrive solo le colonne indicate di una riga, in una scrittura sola. */
function aggiornaRiga(nome, riga, valori) {
  var f = foglio(nome);
  var intestazioni = intestazioniDi(nome);
  var chiavi = chiaviColonne(nome, intestazioni);
  var range = f.getRange(riga, 1, 1, intestazioni.length);
  var attuale = range.getValues()[0];
  chiavi.forEach(function (k, c) {
    if (k && Object.prototype.hasOwnProperty.call(valori, k)) attuale[c] = valori[k];
  });
  range.setValues([attuale]);
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
      telefono: testo(r.telefono),
      indirizzo: testo(r.indirizzo),
      partitaIva: testo(r.partitaIva),
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
    if (k) o[k] = r[1];
  });
  return o;
}

function salvaImpostazioni(valori) {
  var f = foglio(NOME_IMPOSTAZIONI);
  if (!f) throw new Error('Scheda Impostazioni non trovata: lancia preparaFoglio()');
  var righe = f.getLastRow() > 1 ? f.getRange(2, 1, f.getLastRow() - 1, 1).getValues() : [];
  Object.keys(valori).forEach(function (k) {
    var i = righe.map(function (r) { return String(r[0]).trim(); }).indexOf(k);
    if (i >= 0) f.getRange(i + 2, 2).setValue(valori[k]);
    else {
      f.appendRow([k, valori[k], '']);
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
      stato: 'FIRMATO',
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
  return cambiaStato(d.ids, 'INVIATO');
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
