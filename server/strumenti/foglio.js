/*
 * Il foglio Google com'e' oggi, letto da un'esportazione .xlsx con le stesse
 * regole di apps-script/Code.gs: le colonne (SCHEMA, con gli altri nomi dei
 * fogli vecchi), le intestazioni riconosciute senza badare a maiuscole, spazi
 * e trattini, e per un foglio di prima della 0.3.5 le stesse trasformazioni di
 * aggiornaStruttura() (Elettrodinamica cliente a tariffa fissa, i clienti finali
 * accorpati in lei, i codici commessa 26ST, il codice nella colonna COMMESSA).
 *
 * Le funzioni sono quelle di Code.gs, riga per riga, ma lavorano su righe in
 * memoria invece che sulle celle del foglio.
 */
'use strict';

const { testo, numero, numeroONull, siNoONull, normalizza, eData, dataIso, senzaApostrofo, partitaIvaDalFoglio, telefonoDalFoglio } = require('../src/utili');
const { ELETTRODINAMICA, prossimoCodice, RE_CODICE_COMMESSA } = require('../src/conti');

/** Le colonne di ogni scheda: [chiave nel codice, intestazione, altri nomi]. Come SCHEMA in Code.gs. */
const SCHEMA = {
  Rapportini: [
    ['id', 'ID'], ['idLocale', 'ID_LOCALE'], ['data', 'DATA'], ['tecnico', 'TECNICO'], ['idCliente', 'ID_CLIENTE'],
    ['cliente', 'CLIENTE'], ['gruppo', 'GRUPPO'], ['idCommessa', 'ID_COMMESSA'], ['commessa', 'COMMESSA'], ['ticket', 'TICKET'],
    ['luogo', 'LUOGO'], ['descrizione', 'DESCRIZIONE'], ['oreLavoro', 'ORE_LAVORO', 'ORE'], ['oreExtra', 'ORE_EXTRA'],
    ['oreViaggio', 'ORE_VIAGGIO'], ['oreTotali', 'ORE_TOTALI'], ['km', 'KM'], ['spese', 'SPESE'], ['noteSpese', 'NOTE_SPESE'],
    ['foto', 'FOTO_SPESE'], ['tariffa', 'TARIFFA'], ['pagaViaggio', 'PAGA_VIAGGIO'], ['kmRimborsati', 'KM_RIMBORSATI'],
    ['euroKm', 'EURO_KM'], ['maggExtra', 'MAGG_EXTRA'], ['compensoOre', 'COMPENSO_ORE'], ['rimborsoKm', 'RIMBORSO_KM'],
    ['totale', 'TOTALE'], ['costoOrario', 'COSTO_ORARIO'], ['noteInterne', 'NOTE_INTERNE'], ['firma', 'FIRMA'],
    ['firmatario', 'FIRMATARIO'], ['firmatoIl', 'FIRMATO_IL'], ['stato', 'STATO'], ['inviatoIl', 'INVIATO_IL'],
    ['fatturatoIl', 'FATTURATO_IL'], ['creato', 'CREATO', 'TIMESTAMP'], ['modificato', 'MODIFICATO'],
  ],
  Clienti: [
    ['id', 'ID_CLIENTE', 'IDCliente', 'ID', 'Codice', 'Codice_Cliente'], ['nome', 'RAGIONE_SOCIALE', 'Cliente', 'Nome', 'Denominazione'],
    ['alias', 'ALIAS', 'Alias_Cliente', 'Soprannomi'], ['gruppo', 'GRUPPO'], ['email', 'EMAIL'], ['telefono', 'TELEFONO'],
    ['indirizzo', 'INDIRIZZO'], ['partitaIva', 'PARTITA_IVA', 'PIVA'], ['tariffaFissa', 'TARIFFA_FISSA'], ['costoFisso', 'COSTO_FISSO'],
    ['ultimaTariffa', 'ULTIMA_TARIFFA'], ['pagaViaggio', 'PAGA_VIAGGIO'], ['kmRimborsati', 'KM_RIMBORSATI'], ['maggExtra', 'MAGG_EXTRA'],
    ['accorpatoIn', 'ACCORPATO_IN'], ['note', 'NOTE'],
  ],
  Commesse: [
    ['id', 'ID_COMMESSA', 'IDCommessa', 'Codice', 'Codice_Commessa'], ['idCliente', 'ID_CLIENTE', 'IDCliente'],
    ['descrizione', 'DESCRIZIONE', 'Desc', 'Lavoro'], ['stato', 'STATO', 'Stato_Commessa'], ['indirizzo', 'INDIRIZZO', 'Via', 'Luogo', 'Cantiere'],
    ['budgetOre', 'BUDGET_ORE'], ['budgetEuro', 'BUDGET_EURO'], ['prezzoOrario', 'PREZZO_ORARIO'], ['costoOrario', 'COSTO_ORARIO'],
    ['euroKm', 'EURO_KM'], ['inizio', 'INIZIO'], ['finePrevista', 'FINE_PREVISTA'], ['cartella', 'CARTELLA'],
    ['codicePrecedente', 'CODICE_PRECEDENTE'], ['note', 'NOTE'],
  ],
  Gruppi: [
    ['nome', 'GRUPPO'], ['tariffaFissa', 'TARIFFA_FISSA'], ['pagaViaggio', 'PAGA_VIAGGIO'], ['kmRimborsati', 'KM_RIMBORSATI'],
    ['maggExtra', 'MAGG_EXTRA'], ['email', 'EMAIL'], ['note', 'NOTE'],
  ],
  Accessi: [['quando', 'QUANDO'], ['esito', 'ESITO'], ['azione', 'AZIONE'], ['dispositivo', 'DISPOSITIVO'], ['app', 'APP'], ['idDispositivo', 'ID_DISPOSITIVO']],
  Dispositivi: [['id', 'ID_DISPOSITIVO'], ['nome', 'NOME'], ['app', 'APP'], ['primo', 'PRIMO_ACCESSO'], ['ultimo', 'ULTIMO_ACCESSO'], ['note', 'NOTE']],
};

/** Per ogni colonna, la chiave dello schema (o null). Una chiave sola per colonna: vince la prima. */
function chiaviColonne(nome, intestazioni) {
  const schema = SCHEMA[nome] || [];
  const usate = {};
  return intestazioni.map(h => {
    const n = normalizza(h);
    for (const col of schema) {
      if (usate[col[0]]) continue;
      if (col.slice(1).map(normalizza).indexOf(n) >= 0) {
        usate[col[0]] = true;
        return col[0];
      }
    }
    return null;
  });
}

/** Le righe di una scheda come oggetti {chiave: valore}, saltando quelle vuote (come leggi() di Code.gs). */
function righeDi(nome, celle) {
  if (!celle || celle.length < 2) return [];
  const chiavi = chiaviColonne(nome, (celle[0] || []).map(h => String(h === undefined ? '' : h).trim()));
  const out = [];
  for (let i = 1; i < celle.length; i++) {
    const r = celle[i] || [];
    const o = { _riga: i + 1 };
    let vuota = true;
    chiavi.forEach((k, c) => {
      if (!k) return;
      const v = r[c] === undefined ? '' : r[c];
      o[k] = senzaApostrofo(v);
      if (v !== '' && v !== null) vuota = false;
    });
    if (!vuota) out.push(o);
  }
  return out;
}

/** La scheda Impostazioni: chiave e valore dalla seconda riga in giu', come leggiImpostazioni(). */
function impostazioniDi(celle) {
  const o = {};
  const descrizioni = {};
  (celle || []).slice(1).forEach(r => {
    const k = String((r || [])[0] === undefined ? '' : r[0]).trim();
    if (!k) return;
    const v = r[1] === undefined ? '' : r[1];
    if (k === 'PARTITA_IVA') o[k] = partitaIvaDalFoglio(v);
    else if (k === 'TELEFONO') o[k] = telefonoDalFoglio(v);
    else o[k] = senzaApostrofo(v);
    descrizioni[k] = testo(r[2]);
  });
  return { valori: o, descrizioni };
}

// ------------------------------------------------------------------ come leggiClienti/leggiCommesse/leggiGruppi

function clienteDa(r) {
  return {
    id: testo(r.id), nome: testo(r.nome), alias: testo(r.alias).split(',').map(s => s.trim()).filter(String),
    gruppo: testo(r.gruppo), email: testo(r.email), telefono: telefonoDalFoglio(r.telefono), indirizzo: testo(r.indirizzo),
    partitaIva: partitaIvaDalFoglio(r.partitaIva), tariffaFissa: numeroONull(r.tariffaFissa), costoFisso: numeroONull(r.costoFisso),
    ultimaTariffa: numeroONull(r.ultimaTariffa), pagaViaggio: siNoONull(r.pagaViaggio), kmRimborsati: siNoONull(r.kmRimborsati),
    maggExtra: numeroONull(r.maggExtra), note: testo(r.note), accorpatoIn: testo(r.accorpatoIn),
  };
}

function leggiClienti(fogli) {
  return fogli.Clienti.map(clienteDa).filter(c => c.nome !== '' && !c.accorpatoIn);
}

function leggiCommesse(fogli) {
  return fogli.Commesse.map(r => ({
    id: testo(r.id), idCliente: testo(r.idCliente), descrizione: testo(r.descrizione), stato: testo(r.stato).toUpperCase() || 'APERTA',
    codicePrecedente: testo(r.codicePrecedente),
  })).filter(m => m.id !== '');
}

function leggiGruppi(fogli) {
  return (fogli.Gruppi || []).map(r => ({
    nome: testo(r.nome), tariffaFissa: numeroONull(r.tariffaFissa), pagaViaggio: siNoONull(r.pagaViaggio) === true,
    kmRimborsati: siNoONull(r.kmRimborsati) !== false, maggExtra: numero(r.maggExtra), email: testo(r.email), note: testo(r.note),
  })).filter(g => g.nome !== '');
}

function trovaCliente(clienti, id, nome) {
  if (id) {
    const perId = clienti.filter(c => c.id === id)[0];
    if (perId) return perId;
  }
  if (!nome) return null;
  const n = normalizza(nome);
  return clienti.filter(c => [c.nome].concat(c.alias).some(x => normalizza(x) === n))[0] || null;
}

// ------------------------------------------------------------------ aggiornaStruttura(), in memoria

function maxNumeroCommessa(codici) {
  let max = 0;
  codici.forEach(c => {
    const m = String(c).trim().toUpperCase().match(RE_CODICE_COMMESSA);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

function codiceCommessa(anno, n) {
  return ('0' + (anno % 100)).slice(-2) + 'ST' + (n < 1000 ? ('00' + n).slice(-3) : String(n));
}

/** Il cliente Elettrodinamica: lo trova (o lo crea) e lo mette a tariffa fissa. */
function clienteElettrodinamica(fogli) {
  const chiave = normalizza(ELETTRODINAMICA.nome);
  const gruppo = leggiGruppi(fogli).filter(g => normalizza(g.nome) === chiave)[0];
  const valori = {
    tariffaFissa: gruppo && gruppo.tariffaFissa !== null ? gruppo.tariffaFissa : ELETTRODINAMICA.tariffaFissa,
    pagaViaggio: gruppo ? (gruppo.pagaViaggio ? 'SI' : 'NO') : ELETTRODINAMICA.pagaViaggio,
    kmRimborsati: gruppo ? (gruppo.kmRimborsati ? 'SI' : 'NO') : ELETTRODINAMICA.kmRimborsati,
    maggExtra: gruppo ? gruppo.maggExtra : ELETTRODINAMICA.maggExtra,
    gruppo: '',
  };
  const riga = fogli.Clienti.filter(r => {
    if (testo(r.accorpatoIn)) return false;
    return [r.nome].concat(testo(r.alias).split(',')).some(n => normalizza(n) === chiave);
  })[0];
  if (riga) {
    // Una tariffa fissa gia' scritta e' una scelta di chi usa il foglio: non si tocca.
    if (testo(riga.tariffaFissa) === '') {
      if (gruppo && gruppo.email && !testo(riga.email)) valori.email = gruppo.email;
      Object.assign(riga, valori);
    }
    return trovaCliente(leggiClienti(fogli), testo(riga.id), '');
  }
  const id = prossimoCodice(fogli.Clienti.map(r => testo(r.id)), 'C');
  fogli.Clienti.push(Object.assign({ id, nome: ELETTRODINAMICA.nome, email: gruppo ? gruppo.email : '', note: ELETTRODINAMICA.note }, valori));
  return trovaCliente(leggiClienti(fogli), id, '');
}

/** I clienti del gruppo Elettrodinamica confluiscono nel cliente Elettrodinamica. */
function accorpaInElettrodinamica(fogli, elettro) {
  const chiave = normalizza(ELETTRODINAMICA.nome);
  const vecchi = fogli.Clienti.filter(r => testo(r.id) !== elettro.id && !testo(r.accorpatoIn) && normalizza(r.gruppo) === chiave);
  if (!vecchi.length) return 0;
  const ids = vecchi.map(r => testo(r.id));
  const nomi = vecchi.map(r => normalizza(r.nome));
  const suoi = (idCliente, nome) => ids.indexOf(testo(idCliente)) >= 0 || (!testo(idCliente) && nomi.indexOf(normalizza(nome)) >= 0);
  fogli.Rapportini.forEach(r => {
    if (suoi(r.idCliente, r.cliente)) Object.assign(r, { idCliente: elettro.id, cliente: elettro.nome, gruppo: '' });
  });
  fogli.Commesse.forEach(m => {
    if (suoi(m.idCliente, '')) m.idCliente = elettro.id;
  });
  fogli.Clienti.forEach(c => {
    if (ids.indexOf(testo(c.id)) >= 0) { c.accorpatoIn = elettro.id; return; }
    if (testo(c.id) !== elettro.id) return;
    // I nomi dei clienti finali diventano soprannomi di Elettrodinamica.
    const alias = testo(c.alias).split(',').map(s => s.trim()).filter(String);
    vecchi.forEach(v => { if (alias.indexOf(testo(v.nome)) < 0) alias.push(testo(v.nome)); });
    c.alias = alias.join(', ');
  });
  return vecchi.length;
}

/** Le commesse coi codici di prima prendono il codice 26ST, nell'ordine del foglio; l'anno e' quello di inizio. */
function ricodificaCommesse(fogli, annoDiOggi) {
  let n = maxNumeroCommessa(fogli.Commesse.map(m => testo(m.id)));
  const nuovi = {};
  fogli.Commesse.forEach(m => {
    const vecchio = testo(m.id).toUpperCase();
    if (!vecchio || RE_CODICE_COMMESSA.test(vecchio)) return;
    n++;
    nuovi[vecchio] = codiceCommessa(eData(m.inizio) ? m.inizio.getFullYear() : annoDiOggi, n);
  });
  let fatte = 0;
  fogli.Commesse.forEach(m => {
    const nuovo = nuovi[testo(m.id).toUpperCase()];
    if (nuovo) { m.codicePrecedente = testo(m.id); m.id = nuovo; fatte++; }
  });
  const daVecchio = {};
  fogli.Commesse.forEach(m => { if (testo(m.codicePrecedente)) daVecchio[testo(m.codicePrecedente).toUpperCase()] = testo(m.id); });
  fogli.Rapportini.forEach(r => {
    const nuovo = daVecchio[testo(r.idCommessa).toUpperCase()];
    if (nuovo) r.idCommessa = nuovo;
  });
  return fatte;
}

/** Nella colonna COMMESSA dei rapportini il codice, al posto della descrizione. */
function codiceNellaColonnaCommessa(fogli) {
  const commesse = leggiCommesse(fogli);
  let fatte = 0;
  fogli.Rapportini.forEach(r => {
    const id = testo(r.idCommessa);
    if (id) {
      if (testo(r.commessa) !== id) { r.commessa = id; fatte++; }
      return;
    }
    const desc = normalizza(r.commessa);
    if (!desc) return;
    const m = commesse.filter(x => normalizza(x.descrizione) === desc && (!testo(r.idCliente) || x.idCliente === testo(r.idCliente)))[0];
    if (m) { r.idCommessa = m.id; r.commessa = m.id; fatte++; }
  });
  return fatte;
}

/**
 * Il foglio come lo vuole la 0.3.5. Su un foglio gia' a posto non cambia
 * niente (come in Code.gs, si puo' fare sempre).
 */
function aggiornaStruttura(fogli, annoDiOggi) {
  const elettro = clienteElettrodinamica(fogli);
  const accorpati = accorpaInElettrodinamica(fogli, elettro);
  const ricodificate = ricodificaCommesse(fogli, annoDiOggi || new Date().getFullYear());
  const colonna = codiceNellaColonnaCommessa(fogli);
  return { elettrodinamica: elettro ? elettro.id : '', accorpati, ricodificate, colonna };
}

// ------------------------------------------------------------------ file citati

function idDaUrl(url) {
  const m = String(url).match(/\/d\/([A-Za-z0-9_-]{10,})/) || String(url).match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : '';
}

/** Una cella con un link per riga -> [{id, url}] */
function fileDaCella(v) {
  return testo(v).split(/\s*\n\s*/).filter(String).map(url => ({ id: idDaUrl(url), url })).filter(f => f.id);
}

module.exports = {
  SCHEMA, chiaviColonne, righeDi, impostazioniDi, clienteDa, leggiClienti, leggiCommesse, leggiGruppi, trovaCliente,
  aggiornaStruttura, idDaUrl, fileDaCella, dataIso,
};
