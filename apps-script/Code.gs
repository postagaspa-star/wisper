/**
 * WISPER - ponte tra l'app Android e il foglio "Rapportini vocali".
 *
 * Va in Estensioni -> Apps Script del foglio, dentro Code.gs.
 * Essendo legato al foglio non serve nessun ID.
 *
 * Le intestazioni si riconoscono a prescindere da maiuscole, spazi e trattini
 * bassi: "CLIENTE", "Cliente" e "cliente" sono la stessa cosa.
 *
 * DOPO OGNI MODIFICA: Distribuisci -> Gestisci distribuzioni -> matita ->
 * Versione: Nuova versione. Senza, l'indirizzo serve ancora il codice vecchio.
 */

const NOME_RAPPORTINI = 'Rapportini';
const NOME_CLIENTI    = 'Clienti';
const NOME_COMMESSE   = 'Commesse';

function foglio(nome) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
}

/** "ID_Cliente", "ID CLIENTE", "id cliente" -> "idcliente" */
function normalizza(s) {
  return String(s === null || s === undefined ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Primo valore trovato fra piu' nomi possibili di colonna. */
function campo(riga, nomiPossibili) {
  for (var i = 0; i < nomiPossibili.length; i++) {
    var k = normalizza(nomiPossibili[i]);
    if (Object.prototype.hasOwnProperty.call(riga, k) &&
        riga[k] !== '' && riga[k] !== null && riga[k] !== undefined) {
      return riga[k];
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Ingresso unico. "azione" decide cosa fare; senza azione si salva un
// rapportino, cosi' le versioni vecchie dell'app continuano a funzionare.
// ---------------------------------------------------------------------------
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    switch (d.azione) {
      case 'creaCliente':
        return json({ ok: true, cliente: creaCliente(d.nome) });
      case 'creaCommessa':
        return json({ ok: true, commessa: creaCommessa(d.idCliente, d.descrizione) });
      case 'statoCommessa':
        return json({ ok: true, commessa: impostaStato(d.idCommessa, d.stato) });
      default:
        return json({ ok: true, id: salvaRapportino(d) });
    }
  } catch (err) {
    return json({ ok: false, errore: String(err) });
  }
}

function doGet(e) {
  try {
    return json({
      ok: true,
      clienti: leggiClienti(),
      commesse: leggiCommesse(),
      diagnostica: diagnostica()
    });
  } catch (err) {
    return json({ ok: false, errore: String(err) });
  }
}

function diagnostica() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    schede: ss.getSheets().map(function (s) { return s.getName(); }),
    intestazioni: {
      Rapportini: intestazioniDi(NOME_RAPPORTINI),
      Clienti: intestazioniDi(NOME_CLIENTI),
      Commesse: intestazioniDi(NOME_COMMESSE)
    }
  };
}

function intestazioniDi(nome) {
  var f = foglio(nome);
  if (!f || f.getLastColumn() === 0) return [];
  return f.getRange(1, 1, 1, f.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
}

/** Scrive una riga mettendo ogni valore sotto la colonna col nome giusto. */
function scriviRiga(nomeFoglio, valoriNormalizzati) {
  var f = foglio(nomeFoglio);
  if (!f) throw new Error('Scheda "' + nomeFoglio + '" non trovata');
  var intestazioni = intestazioniDi(nomeFoglio);
  if (intestazioni.length === 0) throw new Error('La scheda ' + nomeFoglio + ' non ha intestazioni');
  f.appendRow(intestazioni.map(function (nome) {
    var k = normalizza(nome);
    return Object.prototype.hasOwnProperty.call(valoriNormalizzati, k) ? valoriNormalizzati[k] : '';
  }));
}

// ---------------------------------------------------------------------------
// Rapportini
// ---------------------------------------------------------------------------
function salvaRapportino(dati) {
  var id = 'RAP-' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyyMMdd-HHmmss');
  scriviRiga(NOME_RAPPORTINI, {
    'id': id,
    'data': dati.data || Utilities.formatDate(new Date(), 'Europe/Rome', 'dd/MM/yyyy'),
    'cliente': dati.cliente || '',
    'commessa': dati.commessa || '',
    'descrizione': dati.descrizione || '',
    'ore': numero(dati.ore),
    'km': numero(dati.km),
    'spese': numero(dati.spese),
    'firma': dati.firma || '',
    // Colonna "STATO COMMESSA": come resta il lavoro dopo la giornata.
    // Ha preso il posto del vecchio "esito", che guardava indietro.
    'statocommessa': dati.statoCommessa || '',
    'timestamp': Utilities.formatDate(new Date(), 'Europe/Rome', 'dd/MM/yyyy HH:mm:ss')
  });
  return id;
}

// ---------------------------------------------------------------------------
// Anagrafiche nuove, create parlando
// ---------------------------------------------------------------------------

/**
 * Prossimo codice libero di una serie tipo C001 / M001.
 * Si guarda il numero piu' alto gia' presente e si aggiunge uno: cosi' i buchi
 * lasciati da righe cancellate non vengono riusati, e un codice non finisce
 * mai su due anagrafiche diverse.
 */
function prossimoCodice(nomeFoglio, colonne, lettera) {
  var max = 0;
  righeDi(nomeFoglio).forEach(function (r) {
    var v = String(campo(r, colonne)).trim().toUpperCase();
    var m = v.match(new RegExp('^' + lettera + '(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  var n = max + 1;
  return lettera + (n < 1000 ? ('00' + n).slice(-3) : String(n));
}

function creaCliente(nome) {
  var pulito = String(nome || '').trim();
  if (!pulito) throw new Error('Serve il nome del cliente');

  // Se esiste gia' (anche solo come alias) si restituisce quello: dettando a
  // voce e' facilissimo ricreare due volte lo stesso cliente con una sillaba
  // di differenza, e il foglio si riempirebbe di doppioni.
  var esistente = null;
  leggiClienti().forEach(function (c) {
    if (esistente) return;
    var nomi = [c.nome].concat(c.alias);
    for (var i = 0; i < nomi.length; i++) {
      if (normalizza(nomi[i]) === normalizza(pulito)) esistente = c;
    }
  });
  if (esistente) return { id: esistente.id, nome: esistente.nome, giaEsisteva: true };

  var id = prossimoCodice(NOME_CLIENTI, ['ID_Cliente', 'IDCliente', 'ID', 'Codice'], 'C');
  scriviRiga(NOME_CLIENTI, {
    'idcliente': id,
    'ragionesociale': pulito,
    'alias': '',
    'email': ''
  });
  return { id: id, nome: pulito, giaEsisteva: false };
}

function creaCommessa(idCliente, descrizione) {
  var desc = String(descrizione || '').trim();
  if (!desc) throw new Error('Serve la descrizione della commessa');
  if (!idCliente) throw new Error('Serve il cliente della commessa');

  var esistente = null;
  leggiCommesse().forEach(function (m) {
    if (!esistente && m.idCliente === idCliente && normalizza(m.descrizione) === normalizza(desc)) {
      esistente = m;
    }
  });
  if (esistente) {
    return { id: esistente.id, descrizione: esistente.descrizione, giaEsisteva: true };
  }

  var id = prossimoCodice(NOME_COMMESSE, ['ID_Commessa', 'IDCommessa', 'Codice'], 'M');
  scriviRiga(NOME_COMMESSE, {
    'idcliente': idCliente,
    'idcommessa': id,
    'descrizione': desc,
    'stato': 'APERTA'
  });
  return { id: id, descrizione: desc, giaEsisteva: false };
}

// ---------------------------------------------------------------------------
// Lettura
// ---------------------------------------------------------------------------
/**
 * Cambia lo STATO di una commessa nel foglio Commesse.
 *
 * Serve perche' quando il tecnico dice "il lavoro e' finito", scriverlo solo
 * nel rapportino non basta: la commessa resterebbe APERTA e Wisper
 * continuerebbe a proporgliela il giorno dopo. Il rapportino racconta la
 * giornata, questo cambia lo stato del mondo.
 */
function impostaStato(idCommessa, stato) {
  var codice = String(idCommessa || '').trim().toUpperCase();
  var nuovo = String(stato || '').trim().toUpperCase();
  if (!codice) throw new Error('Serve il codice della commessa');
  if (nuovo !== 'APERTA' && nuovo !== 'CHIUSA') throw new Error('Stato non valido: ' + nuovo);

  var f = foglio(NOME_COMMESSE);
  if (!f) throw new Error('Scheda "' + NOME_COMMESSE + '" non trovata');

  var intestazioni = intestazioniDi(NOME_COMMESSE).map(normalizza);
  var colCodice = intestazioni.indexOf('idcommessa');
  if (colCodice < 0) colCodice = intestazioni.indexOf('codicecommessa');
  var colStato = intestazioni.indexOf('stato');
  if (colStato < 0) colStato = intestazioni.indexOf('statocommessa');
  if (colCodice < 0 || colStato < 0) throw new Error('Colonne ID_COMMESSA o STATO non trovate');

  var dati = f.getDataRange().getValues();
  for (var i = 1; i < dati.length; i++) {
    if (String(dati[i][colCodice]).trim().toUpperCase() === codice) {
      var precedente = String(dati[i][colStato]).trim().toUpperCase();
      // +1 perche' le righe del foglio partono da 1 e la prima e' l'intestazione
      f.getRange(i + 1, colStato + 1).setValue(nuovo);
      return { id: codice, stato: nuovo, precedente: precedente, cambiato: precedente !== nuovo };
    }
  }
  throw new Error('Commessa ' + codice + ' non trovata');
}

function leggiClienti() {
  return righeDi(NOME_CLIENTI).map(function (r) {
    return {
      id: String(campo(r, ['ID_Cliente', 'IDCliente', 'ID', 'Codice', 'Codice_Cliente'])),
      nome: String(campo(r, ['Ragione_Sociale', 'RagioneSociale', 'Cliente', 'Nome', 'Denominazione'])),
      alias: String(campo(r, ['Alias', 'Alias_Cliente', 'Soprannomi']))
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; })
    };
  }).filter(function (c) { return c.nome !== ''; });
}

function leggiCommesse() {
  return righeDi(NOME_COMMESSE).map(function (r) {
    return {
      id: String(campo(r, ['ID_Commessa', 'IDCommessa', 'Commessa', 'Codice', 'Codice_Commessa', 'ID'])),
      idCliente: String(campo(r, ['ID_Cliente', 'IDCliente', 'Cliente'])),
      descrizione: String(campo(r, ['Descrizione', 'Desc', 'Lavoro'])),
      stato: String(campo(r, ['Stato', 'Stato_Commessa'])),
      // Lo mette l'ufficio: serve a distinguere due lavori dello stesso cliente.
      indirizzo: String(campo(r, ['Indirizzo', 'Via', 'Luogo', 'Cantiere']))
    };
  }).filter(function (m) { return m.id !== ''; });
}

function righeDi(nomeFoglio) {
  var f = foglio(nomeFoglio);
  if (!f) return [];
  var dati = f.getDataRange().getValues();
  if (dati.length < 2) return [];
  var intestazioni = dati[0].map(normalizza);
  return dati.slice(1).map(function (riga) {
    var o = {};
    intestazioni.forEach(function (k, i) { if (k) o[k] = riga[i]; });
    return o;
  });
}

// ---------------------------------------------------------------------------
// Utilita'
// ---------------------------------------------------------------------------
function numero(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

// Da lanciare a mano dall'editor. Non scrive niente: mostra solo cosa vede.
function provaTutto() {
  Logger.log(JSON.stringify(diagnostica(), null, 2));
  Logger.log('Clienti: ' + leggiClienti().length + ' | Commesse: ' + leggiCommesse().length);
  Logger.log('Prossimo cliente: ' + prossimoCodice(NOME_CLIENTI, ['ID_Cliente'], 'C'));
  Logger.log('Prossima commessa: ' + prossimoCodice(NOME_COMMESSE, ['ID_Commessa'], 'M'));
}
