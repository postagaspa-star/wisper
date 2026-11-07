/*
 * Il passaggio dei dati dal foglio Google al server (accordo §8).
 *
 *   node server/strumenti/importa.js --foglio <copia.xlsx> [--file <cartella>] --dati <cartella>
 *
 * 1. legge l'esportazione del foglio (File > Scarica > Microsoft Excel) con le
 *    stesse regole di Code.gs, e se il foglio e' di prima della 0.3.5 fa le
 *    stesse trasformazioni di aggiornaStruttura();
 * 2. scrive il database nuovo (la cartella non deve averne gia' uno) in una
 *    transazione sola;
 * 3. scrive controllo.html: righe per scheda, ogni numero RAP, ore, km ed euro
 *    per mese e per cliente letti dal foglio e riletti dal database, ogni
 *    commessa e ogni file citato. Se una cifra non torna esce con errore e il
 *    database non resta.
 *
 * --file: la cartella dove copia-drive.js (o chi per lui) ha messo i file di
 * Drive, uno per id. Senza, i file restano "da copiare" e ci pensa copia-drive.js.
 *
 * Fase 8 (fase8.md §10.2): stampa i tempi di ogni passo (lettura, scrittura, controllo) e li scrive in fondo a
 * controllo.html (la tabella dei tempi della prova generale). E il confronto, che NON scrive niente nel database:
 *
 *   node server/strumenti/importa.js --confronta --foglio <copia.xlsx> --dati <cartella con il database>
 *
 * legge il foglio con le stesse regole e lo confronta col database (aperto in sola lettura): rapportini (numero, data,
 * totale, stato), clienti (nome, partita IVA) e commesse (cliente, descrizione, stato) che sono nel foglio e non nel
 * database, nel database e non nel foglio, o diversi. Scrive confronto.html accanto al foglio; esce con 0 se tutto
 * torna, 1 se no. Serve la sera del cambio (nessuno ha scritto nel foglio mentre si copiava) e prima di un ritorno
 * indietro (cosa c'e' nel server e non nel foglio).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Wisper } = require('../src/wisper');
const { SISTEMA } = require('../src/wisper');
const {
  testo, numero, numeroONull, unoZero, eData, istante, adesso, dataIso, partitaIvaDalFoglio, telefonoDalFoglio, sha256, centesimi,
} = require('../src/utili');
const { calcola, prossimoCodice } = require('../src/conti');
const { leggiXlsx } = require('./xlsx');
const F = require('./foglio');
const { speseDaiRapportini } = require('../src/migrazioni/003-ore-spese');

/** Un istante dal foglio: una Date diventa ISO col fuso; un testo resta com'era (come dataOraIso di Code.gs). */
function istanteDa(v) {
  if (eData(v)) return istante(v);
  return testo(v);
}

function tipoDaiByte(b) {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
  if (b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.length > 4 && b.toString('latin1', 0, 4) === '%PDF') return 'application/pdf';
  return 'application/octet-stream';
}

function scheda(schede, nome) {
  const s = schede.filter(x => String(x.nome).trim().toLowerCase() === nome.toLowerCase())[0];
  return s ? s.righe : null;
}

/** Le cifre di un elenco di rapportini, per mese e per cliente, in centesimi (cosi' il confronto e' esatto). */
function totali(rapportini) {
  const per = {};
  const somma = (chiave, r) => {
    const t = per[chiave] = per[chiave] || { n: 0, ore: 0, km: 0, euro: 0 };
    t.n++;
    t.ore += Math.round(r.oreTotali * 100);
    t.km += Math.round(r.km * 100);
    t.euro += Math.round(r.totale * 100);
  };
  for (const r of rapportini) {
    somma('mese ' + (r.data ? r.data.slice(0, 7) : '(senza data)'), r);
    somma('cliente ' + (r.idCliente || '?') + ' ' + r.cliente, r);
  }
  return per;
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * L'importazione vera: torna {ok, errori, avvisi, conteggi, controllo}. Se
 * ok e' falso il database non c'e' piu'.
 */
function importa(o) {
  const dati = path.resolve(o.dati);
  const percorsoDb = path.join(dati, 'wisper.db');
  if (fs.existsSync(percorsoDb)) {
    throw new Error('Nella cartella c\'è già un database (' + percorsoDb + '): l\'importazione scrive solo in una cartella nuova');
  }
  fs.mkdirSync(dati, { recursive: true });
  // Fase 8: i tempi di ogni passo, per la tabella della prova generale.
  const tempi = { inizio: Date.now() };
  const schede = leggiXlsx(fs.readFileSync(o.foglio));
  const errori = [];
  const avvisi = [];

  // ------------------------------------------------------------ 1. lettura, come Code.gs
  const celle = { Rapportini: scheda(schede, 'Rapportini'), Clienti: scheda(schede, 'Clienti'), Commesse: scheda(schede, 'Commesse') };
  for (const n of Object.keys(celle)) if (!celle[n]) throw new Error('Nel file manca la scheda ' + n + ': è l\'esportazione del foglio di Wisper?');
  const fogli = {
    Rapportini: F.righeDi('Rapportini', celle.Rapportini),
    Clienti: F.righeDi('Clienti', celle.Clienti),
    Commesse: F.righeDi('Commesse', celle.Commesse),
    Gruppi: F.righeDi('Gruppi', scheda(schede, 'Gruppi')),
    Accessi: F.righeDi('Accessi', scheda(schede, 'Accessi')),
    Dispositivi: F.righeDi('Dispositivi', scheda(schede, 'Dispositivi')),
  };
  const letti = { Rapportini: fogli.Rapportini.length, Clienti: fogli.Clienti.length, Commesse: fogli.Commesse.length, Gruppi: fogli.Gruppi.length };
  const imp = F.impostazioniDi(scheda(schede, 'Impostazioni'));

  // Il foglio di prima della 0.3.5 diventa come quello di oggi (su uno gia' a posto non cambia niente).
  const struttura = F.aggiornaStruttura(fogli, o.anno || new Date().getFullYear());
  if (struttura.accorpati || struttura.ricodificate || struttura.colonna) {
    avvisi.push('Foglio di prima della 0.3.5 sistemato come fa lo script: ' + struttura.accorpati + ' clienti accorpati in Elettrodinamica, ' +
      struttura.ricodificate + ' commesse col codice nuovo, ' + struttura.colonna + ' rapportini col codice nella colonna COMMESSA');
  }

  // ------------------------------------------------------------ 2. le righe per il database
  const ora = adesso();
  const soggetti = [];
  const giaId = new Set();
  for (const r of fogli.Clienti) {
    let id = testo(r.id);
    if (!id && !testo(r.nome)) continue;
    if (giaId.has(id)) { errori.push('Clienti: il codice ' + id + ' è su due righe (riga ' + r._riga + '): correggi il foglio'); continue; }
    if (!id) {
      id = prossimoCodice(fogli.Clienti.map(x => testo(x.id)).concat(soggetti.map(s => s.id)), 'C');
      avvisi.push('Clienti: "' + testo(r.nome) + '" (riga ' + r._riga + ') non aveva codice: ora è ' + id);
    }
    giaId.add(id);
    soggetti.push({
      id, cliente: 1, fornitore: 0, nome: testo(r.nome), alias: testo(r.alias).split(',').map(s => s.trim()).filter(String).join(', '),
      gruppo: testo(r.gruppo), email: testo(r.email), telefono: telefonoDalFoglio(r.telefono), partita_iva: partitaIvaDalFoglio(r.partitaIva),
      indirizzo: testo(r.indirizzo), tariffa_fissa: numeroONull(r.tariffaFissa), costo_fisso: numeroONull(r.costoFisso),
      ultima_tariffa: numeroONull(r.ultimaTariffa), paga_viaggio: unoZero(r.pagaViaggio), km_rimborsati: unoZero(r.kmRimborsati),
      magg_extra: numeroONull(r.maggExtra), accorpato_in: testo(r.accorpatoIn), note: testo(r.note), creato: ora, modificato: ora,
    });
  }

  const commesse = [];
  const giaCommesse = new Set();
  for (const r of fogli.Commesse) {
    const id = testo(r.id);
    if (!id) { avvisi.push('Commesse: la riga ' + r._riga + ' non ha codice e lo script non la mostrava: non si importa'); continue; }
    if (giaCommesse.has(id.toUpperCase())) { errori.push('Commesse: il codice ' + id + ' è su due righe (riga ' + r._riga + '): correggi il foglio'); continue; }
    giaCommesse.add(id.toUpperCase());
    commesse.push({
      id, cliente_id: testo(r.idCliente), descrizione: testo(r.descrizione), stato: testo(r.stato).toUpperCase() || 'APERTA',
      indirizzo: testo(r.indirizzo), budget_ore: numeroONull(r.budgetOre), budget_euro: numeroONull(r.budgetEuro),
      prezzo_orario: numeroONull(r.prezzoOrario), costo_orario: numeroONull(r.costoOrario), euro_km: numeroONull(r.euroKm),
      inizio: dataIso(r.inizio), fine_prevista: dataIso(r.finePrevista), cartella: testo(r.cartella),
      codice_precedente: testo(r.codicePrecedente), note: testo(r.note), creato: ora, modificato: ora,
    });
    // Wisper Ufficio fino alla 0.3.6 rileggeva "2.500" come 2,5: un budget salvato dal
    // computer poteva diventare mille volte piu' piccolo. Si riconosce perche' ore per
    // prezzo fa mille volte il budget scritto. Non si corregge da solo: lo decide chi legge.
    const c = commesse[commesse.length - 1];
    if (c.budget_ore && c.prezzo_orario && c.budget_euro && c.budget_euro < 1000) {
      const atteso = centesimi(c.budget_ore * c.prezzo_orario);
      if (atteso >= 1000 && Math.abs(c.budget_euro * 1000 - atteso) <= 10) {
        avvisi.push('Commesse: ' + id + ' ha un budget di ' + c.budget_euro + ' €, ma ' + c.budget_ore + ' ore per ' + c.prezzo_orario +
          ' €/h fanno ' + atteso + ' €: quasi certamente il difetto del computer 0.3.6. Controllalo e correggilo nella commessa.');
      }
    }
  }

  const rapportini = [];
  const file = [];
  const giaRap = new Set();
  const giaLocale = new Set();
  const giaFile = new Set();
  const nuovoFile = (f, dove) => {
    if (giaFile.has(f.id)) { avvisi.push('Il file ' + f.id + ' è citato due volte (' + dove + '): si tiene la prima'); return false; }
    giaFile.add(f.id);
    file.push(f);
    return true;
  };
  for (const r of fogli.Rapportini) {
    let id = testo(r.id);
    if (!id) { errori.push('Rapportini: la riga ' + r._riga + ' non ha il numero (ID): correggi il foglio'); continue; }
    if (giaRap.has(id)) { errori.push('Rapportini: il numero ' + id + ' è su due righe (riga ' + r._riga + '): correggi il foglio'); continue; }
    giaRap.add(id);
    let locale = testo(r.idLocale) || null;
    if (locale && giaLocale.has(locale)) {
      avvisi.push('Rapportini: ' + id + ' ha lo stesso ID_LOCALE di un altro: lo si toglie (un telefono non lo ritroverebbe comunque)');
      locale = null;
    }
    if (locale) giaLocale.add(locale);
    const firma = F.fileDaCella(r.firma)[0];
    rapportini.push({
      id, id_locale: locale, data: dataIso(r.data) || null, tecnico: testo(r.tecnico), id_cliente: testo(r.idCliente), cliente: testo(r.cliente),
      gruppo: testo(r.gruppo), id_commessa: testo(r.idCommessa), commessa: testo(r.commessa), ticket: testo(r.ticket), luogo: testo(r.luogo),
      descrizione: testo(r.descrizione), ore_lavoro: numero(r.oreLavoro), ore_extra: numero(r.oreExtra), ore_viaggio: numero(r.oreViaggio),
      ore_totali: numeroONull(r.oreTotali), km: numero(r.km), spese: numero(r.spese), note_spese: testo(r.noteSpese), tariffa: numero(r.tariffa),
      paga_viaggio: unoZero(r.pagaViaggio), km_rimborsati: unoZero(r.kmRimborsati), euro_km: numeroONull(r.euroKm), magg_extra: numeroONull(r.maggExtra),
      compenso_ore: numero(r.compensoOre), rimborso_km: numero(r.rimborsoKm), totale: numero(r.totale), costo_orario: numeroONull(r.costoOrario),
      note_interne: testo(r.noteInterne), firma: '', firmatario: testo(r.firmatario), firmato_il: istanteDa(r.firmatoIl),
      stato: testo(r.stato).toUpperCase() || 'BOZZA', inviato_il: istanteDa(r.inviatoIl), fatturato_il: istanteDa(r.fatturatoIl),
      creato: istanteDa(r.creato), modificato: istanteDa(r.modificato), utente_id: null, stato_prima: '',
    });
    const riga = rapportini[rapportini.length - 1];
    F.fileDaCella(r.foto).forEach(f => nuovoFile({ id: f.id, tipo: 'spesa', rapportino_id: id, drive_url: f.url }, id + ' foto'));
    if (firma) {
      nuovoFile({ id: firma.id, tipo: 'firma', rapportino_id: id, drive_url: firma.url }, id + ' firma');
      riga.firma = firma.id;
    }
  }

  const impostazioni = Object.assign({}, imp.valori);
  const firmaTecnico = F.idDaUrl(impostazioni.FIRMA_TECNICO || '');
  if (firmaTecnico) {
    nuovoFile({ id: firmaTecnico, tipo: 'firmaTecnico', drive_url: impostazioni.FIRMA_TECNICO }, 'FIRMA_TECNICO');
    impostazioni.FIRMA_TECNICO = '/file/' + firmaTecnico;
  }

  // I file gia' copiati (copia-drive.js senza database, o una cartella di Drive scaricata).
  const cartellaFile = o.file ? path.resolve(o.file) : '';
  const indice = {};
  const nomiSuDisco = {};
  if (cartellaFile && fs.existsSync(cartellaFile)) {
    const percorsoIndice = path.join(cartellaFile, 'indice-drive.json');
    if (fs.existsSync(percorsoIndice)) Object.assign(indice, JSON.parse(fs.readFileSync(percorsoIndice, 'utf8')).file || {});
    for (const nome of fs.readdirSync(cartellaFile)) {
      const id = nome.replace(/\.[A-Za-z0-9]{1,5}$/, '');
      if (/^[A-Za-z0-9_-]{10,}$/.test(id)) nomiSuDisco[id] = nome;
    }
    // I documenti delle commesse trovati da copia-drive.js prima dell'importazione.
    for (const id of Object.keys(indice)) {
      const x = indice[id];
      if (x.tipo === 'documento' && x.idCommessa && !giaFile.has(id)) {
        nuovoFile({ id, tipo: 'documento', commessa_id: x.idCommessa, drive_url: x.url || '', nome: x.nome, mime: x.mime, creato: x.data }, 'documenti di ' + x.idCommessa);
      }
    }
  }

  if (errori.length) return chiudiMale(null, dati, errori, avvisi, {}, o);
  tempi.lettura = Date.now() - tempi.inizio;
  o.tempi = tempi;

  // ------------------------------------------------------------ 3. il database, in una transazione sola
  const w = new Wisper({ dati });
  const conteggi = {};
  try {
    w.come(SISTEMA, () => w.db.transazione(() => {
      const scrivi = (tabella, righe) => {
        for (const v of righe) {
          const colonne = Object.keys(v);
          w.db.esegui('INSERT INTO ' + tabella + ' (' + colonne.join(', ') + ') VALUES (' + colonne.map(c => '@' + c).join(', ') + ')', v);
        }
        conteggi[tabella] = righe.length;
      };
      scrivi('gruppi', fogli.Gruppi.filter(g => testo(g.nome)).map(g => ({
        nome: testo(g.nome), tariffa_fissa: numeroONull(g.tariffaFissa), paga_viaggio: unoZero(g.pagaViaggio),
        km_rimborsati: unoZero(g.kmRimborsati), magg_extra: numeroONull(g.maggExtra), email: testo(g.email), note: testo(g.note),
      })));
      scrivi('soggetti', soggetti);
      scrivi('commesse', commesse);
      scrivi('rapportini', rapportini);
      // 06/11/2026: ogni riga del foglio e' un rapportino con un lavoro solo, col suo numero (come la migrazione 011).
      w.giornateMancanti();
      const righeFile = file.map((f, i) => {
        const suDisco = nomiSuDisco[f.id];
        const meta = indice[f.id] || {};
        const v = {
          id: f.id, nome: f.nome || meta.nome || '', mime: f.mime || meta.mime || '', byte: null, sha256: null, percorso: null,
          tipo: f.tipo, rapportino_id: f.rapportino_id || null, commessa_id: f.commessa_id || null, id_client: null,
          drive_url: f.drive_url || null, creato: f.creato && /^\d{4}-/.test(f.creato) ? istante(new Date(f.creato)) : istante(new Date(Date.now() + i)),
        };
        if (suDisco) {
          const b = fs.readFileSync(path.join(cartellaFile, suDisco));
          const destinazione = w.percorsoFile(f.id);
          if (path.resolve(path.join(cartellaFile, suDisco)) !== path.resolve(destinazione)) fs.writeFileSync(destinazione, b);
          Object.assign(v, { byte: b.length, sha256: sha256(b), percorso: f.id, mime: v.mime || tipoDaiByte(b) });
        }
        return v;
      });
      scrivi('file', righeFile);
      const descrizioni = {};
      w.db.righe('SELECT chiave, descrizione FROM impostazioni').forEach(x => { descrizioni[x.chiave] = x.descrizione; });
      Object.keys(imp.descrizioni).forEach(k => { if (imp.descrizioni[k]) descrizioni[k] = imp.descrizioni[k]; });
      w.db.esegui('DELETE FROM impostazioni');
      const iniziali = w.leggiImpostazioni();
      for (const k of Object.keys(Object.assign({}, iniziali, impostazioni))) {
        const v = k in impostazioni ? impostazioni[k] : iniziali[k];
        w.db.esegui('INSERT INTO impostazioni (chiave, valore, descrizione) VALUES (?, ?, ?)', k, JSON.stringify(eData(v) ? istante(v) : v), descrizioni[k] || '');
      }
      conteggi.impostazioni = Object.keys(impostazioni).length;
      scrivi('dispositivi', fogli.Dispositivi.filter(x => testo(x.id)).map(x => ({
        id: testo(x.id), nome: testo(x.nome), app: testo(x.app), primo: istanteDa(x.primo), ultimo: istanteDa(x.ultimo), note: testo(x.note),
      })).filter((x, i, tutti) => tutti.findIndex(y => y.id === x.id) === i));
      scrivi('accessi', fogli.Accessi.map(x => ({
        quando: istanteDa(x.quando) || ora, esito: testo(x.esito) || '?', azione: testo(x.azione), disp: testo(x.idDispositivo),
        disp_nome: testo(x.dispositivo), app: testo(x.app),
      })));
      // Il prossimo codice commessa continua dal piu' alto del foglio.
      const ultimo = commesse.reduce((m, c) => Math.max(m, w.numeroDi('commessa', c.id) || 0), 0);
      w.segnaNumero('commessa', ultimo);
      // Fase 3: le spese dei rapportini diventano righe di spese (come la migrazione 003), e il primo veicolo
      // prende l'auto e il rimborso km del foglio.
      conteggi.spese = speseDaiRapportini(w.db, 'importazione: le spese del rapportino diventano una riga di spese');
      w.allineaPrimoVeicolo();
      w.annota('importazione', path.basename(o.foglio), null, conteggi, 'dati importati dal foglio Google');
    }));
  } catch (err) {
    errori.push('Scrittura del database non riuscita: ' + err.message);
    return chiudiMale(w, dati, errori, avvisi, conteggi, o);
  }

  // ------------------------------------------------------------ 4. il controllo
  tempi.scrittura = Date.now() - tempi.inizio - tempi.lettura;
  const dalFoglio = fogli.Rapportini.filter(r => giaRap.has(testo(r.id))).map(r => ({
    id: testo(r.id), data: dataIso(r.data), idCliente: testo(r.idCliente), cliente: testo(r.cliente),
    oreTotali: numero(r.oreTotali) || numero(r.oreLavoro) + numero(r.oreExtra) + numero(r.oreViaggio), km: numero(r.km), totale: numero(r.totale),
  }));
  const dalDb = w.come(SISTEMA, () => w.leggiRapportini('', '', true));
  const controllo = {
    schede: [
      ['Rapportini', letti.Rapportini, w.db.riga('SELECT COUNT(*) n FROM rapportini').n],
      ['Clienti', soggetti.length, w.db.riga('SELECT COUNT(*) n FROM soggetti').n],
      ['Commesse', commesse.length, w.db.riga('SELECT COUNT(*) n FROM commesse').n],
      ['Gruppi', letti.Gruppi, w.db.riga('SELECT COUNT(*) n FROM gruppi').n],
      ['Impostazioni', Object.keys(impostazioni).length, Object.keys(impostazioni).filter(k => w.db.riga('SELECT 1 FROM impostazioni WHERE chiave = ?', k)).length],
    ],
    totali: [],
    rap: [],
    commesse: w.come(SISTEMA, () => w.leggiCommesse({ archiviati: true, modelli: true })),
    file: w.db.righe('SELECT * FROM file ORDER BY rowid'),
    ricalcoli: [],
  };
  if (letti.Clienti !== soggetti.length) {
    // Le righe in piu' sono Elettrodinamica creata dalla trasformazione, o righe senza nome ne' codice.
    avvisi.push('Clienti: ' + letti.Clienti + ' righe lette, ' + soggetti.length + ' anagrafiche scritte');
  }
  for (const [nome, foglio, db] of controllo.schede) {
    if (nome === 'Clienti' || nome === 'Gruppi') { if (foglio !== db) errori.push(nome + ': ' + foglio + ' righe da scrivere, ' + db + ' nel database'); continue; }
    if (nome === 'Commesse' && commesse.length !== db) errori.push('Commesse: ' + commesse.length + ' da scrivere, ' + db + ' nel database');
    if (nome === 'Rapportini' && foglio !== db) errori.push('Rapportini: ' + foglio + ' righe nel foglio, ' + db + ' nel database');
    if (nome === 'Impostazioni' && foglio !== db) errori.push('Impostazioni: ' + foglio + ' nel foglio, ' + db + ' nel database');
  }
  const idDb = new Set(dalDb.map(r => r.id));
  const idFoglio = new Set(dalFoglio.map(r => r.id));
  for (const r of dalFoglio) {
    const c = dalDb.filter(x => x.id === r.id)[0];
    controllo.rap.push([r.id, r.data, r.cliente, c ? 'sì' : 'NO']);
    if (!c) errori.push('Il rapportino ' + r.id + ' non è nel database');
  }
  for (const id of idDb) if (!idFoglio.has(id)) errori.push('Il rapportino ' + id + ' è nel database ma non nel foglio');
  const tf = totali(dalFoglio);
  const td = totali(dalDb);
  for (const k of Array.from(new Set(Object.keys(tf).concat(Object.keys(td)))).sort()) {
    const a = tf[k] || { n: 0, ore: 0, km: 0, euro: 0 };
    const b = td[k] || { n: 0, ore: 0, km: 0, euro: 0 };
    const giusto = a.n === b.n && a.ore === b.ore && a.km === b.km && a.euro === b.euro;
    controllo.totali.push({ chiave: k, foglio: a, db: b, giusto });
    if (!giusto) errori.push('Non torna ' + k + ': foglio ' + a.n + ' rapportini, ' + a.ore / 100 + ' h, ' + a.km / 100 + ' km, ' + a.euro / 100 +
      ' €; database ' + b.n + ', ' + b.ore / 100 + ' h, ' + b.km / 100 + ' km, ' + b.euro / 100 + ' €');
  }
  // I conti rifatti con le regole congelate nella riga: una differenza e' un avviso (una riga corretta a mano), non un errore.
  for (const r of dalDb) {
    if (r.euroKm === 0 && r.rimborsoKm > 0) continue;
    const c = calcola(r, { tariffaFissa: r.tariffa, pagaViaggio: r.pagaViaggio, kmRimborsati: r.kmRimborsati, maggExtra: r.maggExtra, euroKm: r.euroKm });
    if (Math.round(c.totale * 100) !== Math.round(r.totale * 100)) {
      controllo.ricalcoli.push([r.id, r.totale, c.totale]);
      avvisi.push(r.id + ': nel foglio il totale è ' + r.totale + ' €, rifatto con le sue regole viene ' + centesimi(c.totale) + ' € (riga corretta a mano?)');
    }
  }

  tempi.controllo = Date.now() - tempi.inizio - tempi.lettura - tempi.scrittura;
  const percorsoControllo = scriviControllo(dati, o, controllo, errori, avvisi, conteggi);
  if (errori.length) return chiudiMale(w, dati, errori, avvisi, conteggi, o, percorsoControllo);
  w.chiudi();
  return { ok: true, errori, avvisi, conteggi, controllo: percorsoControllo, dati, tempi: { lettura: tempi.lettura, scrittura: tempi.scrittura, controllo: tempi.controllo } };
}

/** Qualcosa non torna: il database se ne va (non deve restare a meta'), il rapporto resta. */
function chiudiMale(w, dati, errori, avvisi, conteggi, o, percorsoControllo) {
  if (w) w.chiudi();
  for (const f of ['wisper.db', 'wisper.db-wal', 'wisper.db-shm']) {
    const p = path.join(dati, f);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  const controllo = percorsoControllo || scriviControllo(dati, o, null, errori, avvisi, conteggi);
  return { ok: false, errori, avvisi, conteggi, controllo, dati };
}

function scriviControllo(dati, o, c, errori, avvisi, conteggi) {
  const tab = (testa, righe) => '<table><tr>' + testa.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' +
    righe.map(r => '<tr' + (r.male ? ' class="male"' : '') + '>' + (r.celle || r).map(x => '<td>' + esc(x) + '</td>').join('') + '</tr>').join('') + '</table>';
  let html = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Controllo dell\'importazione</title><style>' +
    'body{font:15px/1.45 system-ui,sans-serif;margin:24px;color:#1b1b1b}h1{font-size:26px}h2{font-size:19px;margin-top:28px}' +
    'table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#f2f2f2}' +
    '.male td{background:#fde2e2}.esito{padding:12px 16px;border-radius:10px;font-weight:700}.ok{background:#e3f5e1}.no{background:#fde2e2}' +
    '</style></head><body><h1>Controllo dell\'importazione</h1>' +
    '<p>Foglio: ' + esc(path.basename(o.foglio)) + ' · cartella dei dati: ' + esc(dati) + ' · ' + esc(new Date().toLocaleString('it-IT')) + '</p>' +
    '<p class="esito ' + (errori.length ? 'no">Non torna: il database non è stato tenuto. Correggi e riprova.' : 'ok">Tutto torna: il database è pronto.') + '</p>';
  if (errori.length) html += '<h2>Cosa non torna</h2><ul>' + errori.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>';
  if (avvisi.length) html += '<h2>Da sapere</h2><ul>' + avvisi.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>';
  if (c) {
    html += '<h2>Righe per scheda</h2>' + tab(['Scheda', 'Dal foglio', 'Nel database'], c.schede.map(r => ({ celle: r, male: r[1] !== r[2] && r[0] !== 'Clienti' })));
    html += '<h2>Ore, km ed euro per mese e per cliente</h2>' + tab(['', 'Rapportini (foglio / db)', 'Ore (foglio / db)', 'Km (foglio / db)', 'Euro (foglio / db)'],
      c.totali.map(t => ({ male: !t.giusto, celle: [t.chiave, t.foglio.n + ' / ' + t.db.n, t.foglio.ore / 100 + ' / ' + t.db.ore / 100,
        t.foglio.km / 100 + ' / ' + t.db.km / 100, (t.foglio.euro / 100).toFixed(2) + ' / ' + (t.db.euro / 100).toFixed(2)] })));
    html += '<h2>Commesse (' + c.commesse.length + ')</h2>' + tab(['Codice', 'Codice di prima', 'Cliente', 'Descrizione', 'Stato'],
      c.commesse.map(m => [m.id, m.codicePrecedente, m.idCliente, m.descrizione, m.stato]));
    html += '<h2>Numeri RAP (' + c.rap.length + ')</h2>' + tab(['Numero', 'Data', 'Cliente', 'Nel database'], c.rap.map(r => ({ celle: r, male: r[3] !== 'sì' })));
    html += '<h2>File citati (' + c.file.length + ')</h2>' + tab(['Id', 'Tipo', 'Di', 'Copiato'],
      c.file.map(f => ({ celle: [f.id, f.tipo, f.rapportino_id || f.commessa_id || '', f.percorso ? 'sì' : 'no, ci pensa copia-drive.js'] })));
    if (c.ricalcoli.length) html += '<h2>Totali diversi dal conto rifatto</h2>' + tab(['Numero', 'Nel foglio', 'Rifatto'], c.ricalcoli);
  }
  html += '<h2>Scritto nel database</h2><p>' + esc(JSON.stringify(conteggi)) + '</p>';
  // Fase 8 (§10.2): i tempi di ogni passo, per la tabella dei tempi della prova generale.
  if (o.tempi && o.tempi.lettura !== undefined) {
    const s = ms => (ms === undefined ? '' : (ms / 1000).toFixed(1).replace('.', ',') + ' s');
    html += '<h2>Tempi</h2>' + tab(['Passo', 'Tempo'], [['Lettura del foglio', s(o.tempi.lettura)], ['Scrittura del database', s(o.tempi.scrittura)], ['Controllo', s(o.tempi.controllo)]]);
  }
  html += '</body></html>\n';
  const p = path.join(dati, 'controllo.html');
  fs.writeFileSync(p, html);
  return p;
}

// ------------------------------------------------------------------ il confronto (fase 8, §10.2)

/**
 * Il foglio contro il database, senza scrivere niente nel database: torna {ok, differenze: [{scheda, chiave, cosa,
 * campo?, foglio?, database?}], conteggi, confronto (il percorso di confronto.html)}.
 */
function confronta(o) {
  const dati = path.resolve(o.dati);
  const percorsoDb = path.join(dati, 'wisper.db');
  if (!fs.existsSync(percorsoDb)) throw new Error('Nella cartella non c\'è il database da confrontare: ' + percorsoDb);
  const schede = leggiXlsx(fs.readFileSync(o.foglio));
  const celle = { Rapportini: scheda(schede, 'Rapportini'), Clienti: scheda(schede, 'Clienti'), Commesse: scheda(schede, 'Commesse') };
  for (const n of Object.keys(celle)) if (!celle[n]) throw new Error('Nel file manca la scheda ' + n + ': è l\'esportazione del foglio di Wisper?');
  const fogli = {
    Rapportini: F.righeDi('Rapportini', celle.Rapportini), Clienti: F.righeDi('Clienti', celle.Clienti), Commesse: F.righeDi('Commesse', celle.Commesse),
    Gruppi: F.righeDi('Gruppi', scheda(schede, 'Gruppi')), Accessi: [], Dispositivi: [],
  };
  F.aggiornaStruttura(fogli, o.anno || new Date().getFullYear());
  require('../src/db');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(percorsoDb, { readOnly: true });
  const differenze = [];
  const c = n => Math.round(numero(n) * 100);
  try {
    const confrontaScheda = (nome, dalFoglio, dalDb, campi) => {
      const f = new Map(dalFoglio.filter(x => x.chiave).map(x => [x.chiave, x]));
      const d = new Map(dalDb.map(x => [x.chiave, x]));
      for (const [k, x] of f) {
        const y = d.get(k);
        if (!y) { differenze.push({ scheda: nome, chiave: k, cosa: 'solo nel foglio' }); continue; }
        for (const campo of campi) if (String(x[campo]) !== String(y[campo])) differenze.push({ scheda: nome, chiave: k, cosa: 'diverso', campo, foglio: x[campo], database: y[campo] });
      }
      for (const k of d.keys()) if (!f.has(k)) differenze.push({ scheda: nome, chiave: k, cosa: 'solo nel database' });
    };
    confrontaScheda('Rapportini',
      fogli.Rapportini.map(r => ({ chiave: testo(r.id), data: dataIso(r.data), totale: c(r.totale), stato: testo(r.stato).toUpperCase() || 'BOZZA' })),
      db.prepare('SELECT id, data, totale, stato FROM rapportini').all().map(r => ({ chiave: r.id, data: r.data || '', totale: c(r.totale), stato: testo(r.stato).toUpperCase() || 'BOZZA' })),
      ['data', 'totale', 'stato']);
    confrontaScheda('Clienti',
      fogli.Clienti.map(r => ({ chiave: testo(r.id), nome: testo(r.nome), partitaIva: partitaIvaDalFoglio(r.partitaIva) })),
      db.prepare('SELECT id, nome, partita_iva FROM soggetti WHERE cliente = 1').all().map(s => ({ chiave: s.id, nome: testo(s.nome), partitaIva: partitaIvaDalFoglio(s.partita_iva) })),
      ['nome', 'partitaIva']);
    confrontaScheda('Commesse',
      fogli.Commesse.map(r => ({ chiave: testo(r.id).toUpperCase(), cliente: testo(r.idCliente), descrizione: testo(r.descrizione), stato: testo(r.stato).toUpperCase() || 'APERTA' })),
      db.prepare('SELECT id, cliente_id, descrizione, stato FROM commesse WHERE modello = 0').all().map(m => ({ chiave: String(m.id).toUpperCase(), cliente: testo(m.cliente_id), descrizione: testo(m.descrizione), stato: testo(m.stato).toUpperCase() || 'APERTA' })),
      ['cliente', 'descrizione', 'stato']);
  } finally {
    db.close();
  }
  const conteggi = { rapportini: fogli.Rapportini.length, clienti: fogli.Clienti.length, commesse: fogli.Commesse.length };
  const uscita = o.uscita ? path.resolve(o.uscita) : path.join(path.dirname(path.resolve(o.foglio)), 'confronto.html');
  let html = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Confronto foglio e database</title><style>' +
    'body{font:15px/1.45 system-ui,sans-serif;margin:24px;color:#1b1b1b}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#f2f2f2}' +
    '.esito{padding:12px 16px;border-radius:10px;font-weight:700}.ok{background:#e3f5e1}.no{background:#fde2e2}</style></head><body><h1>Confronto foglio e database</h1>' +
    '<p>Foglio: ' + esc(path.basename(o.foglio)) + ' · database: ' + esc(percorsoDb) + ' · ' + esc(new Date().toLocaleString('it-IT')) + '</p>' +
    '<p>Nel foglio: ' + conteggi.rapportini + ' rapportini, ' + conteggi.clienti + ' clienti, ' + conteggi.commesse + ' commesse.</p>' +
    '<p class="esito ' + (differenze.length ? 'no">Non torna: ' + differenze.length + (differenze.length === 1 ? ' differenza' : ' differenze') : 'ok">Tutto torna: zero differenze') + '</p>';
  if (differenze.length) {
    html += '<table><tr><th>Scheda</th><th>Riga</th><th>Cosa</th><th>Campo</th><th>Nel foglio</th><th>Nel database</th></tr>' +
      differenze.map(x => '<tr><td>' + [x.scheda, x.chiave, x.cosa, x.campo || '', x.foglio === undefined ? '' : x.foglio, x.database === undefined ? '' : x.database].map(esc).join('</td><td>') + '</td></tr>').join('') + '</table>';
  }
  fs.writeFileSync(uscita, html + '</body></html>\n');
  return { ok: !differenze.length, differenze, conteggi, confronto: uscita };
}

function argomenti(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--confronta') a.confronta = true;
    else if (argv[i] === '--uscita') a.uscita = argv[++i];
    else if (argv[i] === '--foglio') a.foglio = argv[++i];
    else if (argv[i] === '--file') a.file = argv[++i];
    else if (argv[i] === '--dati') a.dati = argv[++i];
    else throw new Error('Non conosco "' + argv[i] + '"');
  }
  if (!a.foglio || !a.dati) throw new Error('Si usa: node server/strumenti/importa.js --foglio <copia.xlsx> [--file <cartella>] --dati <cartella>');
  return a;
}

if (require.main === module) {
  try {
    const a = argomenti(process.argv.slice(2));
    if (a.confronta) {
      const c = confronta(a);
      c.differenze.slice(0, 50).forEach(x => console.log((x.cosa === 'diverso' ? 'DIVERSO ' : x.cosa.toUpperCase() + ' ') + x.scheda + ' ' + x.chiave +
        (x.campo ? ' · ' + x.campo + ': foglio ' + x.foglio + ', database ' + x.database : '')));
      console.log((c.ok ? 'Tutto torna: zero differenze' : 'Non torna: ' + c.differenze.length + ' differenze') + '. Il rapporto è in ' + c.confronto);
      process.exit(c.ok ? 0 : 1);
    }
    const r = importa(a);
    r.avvisi.forEach(x => console.log('Da sapere: ' + x));
    if (!r.ok) {
      r.errori.forEach(x => console.error('NON TORNA: ' + x));
      console.error('Importazione fermata: il database non è stato tenuto. Il rapporto è in ' + r.controllo);
      process.exit(1);
    }
    console.log('Importazione riuscita: ' + JSON.stringify(r.conteggi));
    console.log('Tempi: lettura ' + (r.tempi.lettura / 1000).toFixed(1) + ' s, scrittura ' + (r.tempi.scrittura / 1000).toFixed(1) + ' s, controllo ' + (r.tempi.controllo / 1000).toFixed(1) + ' s');
    console.log('Il rapporto del controllo è in ' + r.controllo + '. Poi: node server/strumenti/copia-drive.js per i file di Drive.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { importa, confronta };
