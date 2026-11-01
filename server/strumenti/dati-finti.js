/*
 * Dieci anni di dati finti per la prova di carico (fase 8, fase8.md §11.5).
 *
 *   node server/strumenti/dati-finti.js --anni 10 --persone 5 --dati <cartella nuova> [--fine 2026-10-31]
 *
 * Solo dati inventati, con nomi di esempio e una data di partenza fissa (la fine di base e' il 31/10/2026): due giri
 * con gli stessi argomenti fanno lo stesso database. Circa 11.000 rapportini, 30.000 righe di ore, 8.000 spese, 1.500
 * commesse, 600 clienti e fornitori, 3.000 preventivi, 2.500 fatture e 2.000 ricevute, 20.000 attivita', 3.000 ticket,
 * 5.000 documenti (file PDF piccoli col testo vero, su disco), 500.000 righe di registro, 60.000 di accessi (per 10 anni;
 * con meno anni in proporzione).
 *
 * Si scrive direttamente nelle tabelle, in una transazione sola (con le azioni ci vorrebbero ore): serve a misurare le
 * letture, non le regole di scrittura (quelle le provano le prove del server). Il testo dei PDF va anche nella ricerca
 * dentro i file (file_testo, "letto"), cosi' la prova misura la ricerca e non la lettura. Gli utenti hanno la password
 * "prova": il titolare e' manuel@esempio.it.
 * Mai sul NAS coi dati veri: una cartella nuova, di prova.
 */
'use strict';

process.env.TZ = 'Europe/Rome';

const fs = require('node:fs');
const path = require('node:path');
const { Wisper, SISTEMA } = require('../src/wisper');
const { hashPasswordSync } = require('../src/azioni/accesso');
const { partitaIvaDiProva, pdfConTesto } = require('../src/prova');
const { sha256, istante } = require('../src/utili');

/** Numeri a caso, ma sempre gli stessi (mulberry32). */
function casuale(seme) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const due = n => String(n).padStart(2, '0');
const giorno = d => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());

const NOMI = ['Rossi', 'Bianchi', 'Verdi', 'Neri', 'Gallo', 'Costa', 'Fontana', 'Conte', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Colombo', 'Ferrari', 'Esposito'];
const ATTIVITA_CLIENTI = ['Impianti', 'Automazioni', 'Meccanica', 'Plastiche', 'Logistica', 'Tessile', 'Alimentari', 'Serramenti', 'Carpenteria', 'Elettronica'];
const LAVORI = ['Sopralluogo e rilievo quadri', 'Cablaggio quadro di linea', 'Collaudo e messa in servizio', 'Verifica impianto di terra', 'Progetto esecutivo',
  'Assistenza al montaggio', 'Sostituzione interruttore generale', 'Manutenzione cabina MT', 'Taratura protezioni', 'Aggiornamento schemi elettrici'];
const TESTI = ['La verifica dell\'impianto di terra e\' stata eseguita con il metodo voltamperometrico e la resistenza misurata e\' nei limiti.',
  'Il quadro generale e\' alimentato dalla cabina MT; le protezioni sono coordinate con la selettivita\' verso valle.',
  'Gli apparecchi di illuminazione di emergenza garantiscono un\'ora di autonomia; la verifica funzionale e\' semestrale.',
  'La linea di alimentazione del magazzino automatico e\' in cavo FG16OR16 con caduta di tensione inferiore al 4 per cento.',
  'Il dispersore e\' stato ampliato: nessuna non conformita\' rilevata, prossima verifica entro due anni secondo il DPR 462/01.'];

function argomenti(argv) {
  const a = { anni: 10, persone: 5, fine: '2026-10-31' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--anni') a.anni = Number(argv[++i]);
    else if (argv[i] === '--persone') a.persone = Number(argv[++i]);
    else if (argv[i] === '--dati') a.dati = argv[++i];
    else if (argv[i] === '--fine') a.fine = argv[++i];
    else throw new Error('Non conosco "' + argv[i] + '"');
  }
  if (!a.dati || !(a.anni > 0) || !(a.persone >= 1)) throw new Error('Si usa: node server/strumenti/dati-finti.js --anni 10 --persone 5 --dati <cartella nuova>');
  return a;
}

function datiFinti(o) {
  const dati = path.resolve(o.dati);
  if (fs.existsSync(path.join(dati, 'wisper.db'))) throw new Error('Nella cartella c\'è già un database: i dati finti vanno in una cartella nuova');
  fs.mkdirSync(dati, { recursive: true });
  const t0 = Date.now();
  const w = new Wisper({ dati });
  const db = w.db;
  const r = casuale(20261101);
  const tra = (a, b) => a + Math.floor(r() * (b - a + 1));
  const uno = l => l[Math.floor(r() * l.length)];
  const fine = new Date(o.fine + 'T12:00:00');
  const inizio = new Date(fine.getFullYear() - o.anni, fine.getMonth(), fine.getDate() + 1, 12);
  const giorni = Math.round((fine - inizio) / 86400000);
  const unGiorno = () => new Date(inizio.getTime() + tra(0, giorni) * 86400000);
  const q = n => Math.round(n * o.anni / 10);
  const conti = {};
  const ins = (tabella, righe) => {
    if (!righe.length) return;
    const colonne = Object.keys(righe[0]);
    const s = db.prepara('INSERT INTO ' + tabella + ' (' + colonne.join(', ') + ') VALUES (' + colonne.map(() => '?').join(', ') + ')');
    for (const x of righe) s.run(...colonne.map(c => (x[c] === undefined ? null : x[c])));
    conti[tabella] = (conti[tabella] || 0) + righe.length;
  };

  w.come(SISTEMA, () => db.transazione(() => {
    // ---- persone e utenti
    const hash = hashPasswordSync('prova');
    const ora = istante(inizio);
    const utenti = [];
    for (let i = 0; i < o.persone; i++) {
      const u = i === 0 ? { nome: 'Manuel Gasparotto', email: 'manuel@esempio.it', ruolo: 'titolare' }
        : { nome: 'Persona ' + NOMI[i % NOMI.length] + ' ' + i, email: 'persona' + i + '@esempio.it', ruolo: i === 1 ? 'amministrazione' : 'collaboratore' };
      const id = Number(db.esegui('INSERT INTO utenti (nome, email, ruolo, password_hash, attivo, creato) VALUES (?, ?, ?, ?, 1, ?)', u.nome, u.email, u.ruolo, hash, ora).lastInsertRowid);
      utenti.push(Object.assign({ id }, u));
      w.creaPersonaPerUtente(Object.assign({ id }, u));
    }
    // ---- clienti e fornitori (600)
    const clienti = [];
    const fornitori = [];
    const soggetti = [];
    const nC = q(500);
    const nF = q(100);
    for (let i = 1; i <= nC + nF; i++) {
      const cliente = i <= nC;
      const id = cliente ? 'C' + String(i).padStart(3, '0') : 'F' + String(i - nC).padStart(3, '0');
      const nome = (cliente ? NOMI[i % NOMI.length] + ' ' + ATTIVITA_CLIENTI[i % ATTIVITA_CLIENTI.length] : 'Fornitore di esempio ' + (i - nC)) + ' ' + i + ' Srl';
      soggetti.push({ id, cliente: cliente ? 1 : 0, fornitore: cliente ? 0 : 1, nome, partita_iva: partitaIvaDiProva(String(1000000000 + i * 7919).slice(0, 10)),
        email: id.toLowerCase() + '@esempio.it', telefono: '0445 ' + String(100000 + i), citta: 'Thiene', provincia: 'VI', ultima_tariffa: 40 + (i % 15), creato: ora, modificato: ora });
      (cliente ? clienti : fornitori).push({ id, nome });
    }
    ins('soggetti', soggetti);
    // ---- commesse (1.500, il numero non riparte a gennaio)
    const commesse = [];
    const nComm = q(1500);
    for (let n = 1; n <= nComm; n++) {
      const d = new Date(inizio.getTime() + Math.floor((n - 1) / nComm * giorni) * 86400000);
      const c = uno(clienti);
      const vecchia = d < new Date(fine.getTime() - 120 * 86400000);
      commesse.push({ id: String(d.getFullYear() % 100).padStart(2, '0') + 'ST' + String(n).padStart(3, '0'), cliente_id: c.id, descrizione: uno(LAVORI) + ' ' + c.nome,
        stato: vecchia ? 'CHIUSA' : 'APERTA', budget_ore: tra(10, 120), prezzo_orario: 40 + tra(0, 10), inizio: giorno(d), fine_prevista: giorno(new Date(d.getTime() + tra(30, 200) * 86400000)),
        responsabile_id: uno(utenti).id, creato: istante(d), modificato: istante(d) });
    }
    ins('commesse', commesse);
    db.esegui("UPDATE numerazioni SET ultimo = ? WHERE tipo = 'commessa'", nComm);
    // ---- rapportini (11.000): numero RAP/anno/NNNN che riparte ogni anno
    const perAnno = {};
    const rapp = [];
    const ids = [];
    for (let i = 0; i < q(11000); i++) {
      const d = unGiorno();
      const a = d.getFullYear();
      perAnno[a] = (perAnno[a] || 0) + 1;
      const m = uno(commesse);
      const u = uno(utenti);
      const ore = tra(2, 9);
      const km = tra(10, 150);
      const tariffa = 40 + (i % 10);
      const totale = Math.round((ore * tariffa + km * 0.76) * 100) / 100;
      const id = 'RAP/' + a + '/' + String(perAnno[a]).padStart(4, '0');
      ids.push(id);
      rapp.push({ id, id_locale: 'finto-' + i, data: giorno(d), tecnico: u.nome, utente_id: u.id, id_cliente: m.cliente_id, cliente: (clienti.find(c => c.id === m.cliente_id) || {}).nome || '',
        id_commessa: m.id, commessa: m.descrizione, descrizione: uno(LAVORI), ore_lavoro: ore, ore_extra: 0, ore_viaggio: 1, ore_totali: ore + 1, km, spese: 0, tariffa,
        compenso_ore: ore * tariffa, euro_km: 0.76, rimborso_km: Math.round(km * 0.76 * 100) / 100, totale, stato: d < new Date(fine.getTime() - 40 * 86400000) ? 'FATTURATO' : uno(['BOZZA', 'FIRMATO', 'INVIATO']),
        creato: istante(d), modificato: istante(d) });
    }
    ins('rapportini', rapp);
    // ---- ore (30.000), spese (8.000)
    const ore = [];
    for (let i = 0; i < q(30000); i++) {
      const d = unGiorno();
      const vecchia = d < new Date(fine.getTime() - 60 * 86400000);
      ore.push({ utente_id: uno(utenti).id, data: giorno(d), ore: tra(1, 8), commessa_id: uno(commesse).id, descrizione: uno(LAVORI), stato: 'approvata',
        fatturata_il: vecchia ? istante(new Date(d.getTime() + 30 * 86400000)) : '', creato: istante(d), modificato: istante(d) });
    }
    ins('ore', ore);
    const spese = [];
    for (let i = 0; i < q(8000); i++) {
      const d = unGiorno();
      const vecchia = d < new Date(fine.getTime() - 60 * 86400000);
      spese.push({ utente_id: uno(utenti).id, data: giorno(d), importo: tra(5, 120) + 0.5, categoria: uno(['carburante', 'pedaggio', 'parcheggio', 'vitto']), descrizione: 'Spesa di esempio',
        commessa_id: uno(commesse).id, stato: 'approvata', rimborsata_il: vecchia ? istante(d) : '', fatturata_il: vecchia ? istante(new Date(d.getTime() + 30 * 86400000)) : '',
        creato: istante(d), modificato: istante(d) });
    }
    ins('spese', spese);
    // ---- preventivi (3.000), fatture (2.500), ricevute (2.000)
    const prev = [];
    const prevAnno = {};
    for (let i = 0; i < q(3000); i++) {
      const d = unGiorno();
      const a = d.getFullYear();
      prevAnno[a] = (prevAnno[a] || 0) + 1;
      prev.push({ numero: 'PR/' + a + '/' + String(prevAnno[a]).padStart(3, '0'), revisione: 0, cliente_id: uno(clienti).id, oggetto: uno(LAVORI), data: giorno(d),
        scadenza: giorno(new Date(d.getTime() + 30 * 86400000)), stato: d < new Date(fine.getTime() - 60 * 86400000) ? uno(['ACCETTATO', 'RIFIUTATO']) : uno(['ACCETTATO', 'RIFIUTATO', 'INVIATO']),
        iva_percentuale: 22, eppi_percentuale: 5, creato: istante(d), modificato: istante(d) });
    }
    ins('preventivi', prev);
    const fatt = [];
    const fattAnno = {};
    for (let i = 0; i < q(2500); i++) {
      const d = unGiorno();
      const a = d.getFullYear();
      fattAnno[a] = (fattAnno[a] || 0) + 1;
      const compenso = tra(200, 5000);
      const contributo = Math.round(compenso * 5) / 100;
      const iva = Math.round((compenso + contributo) * 22) / 100;
      const totale = Math.round((compenso + contributo + iva) * 100) / 100;
      fatt.push({ tipo: 'fattura', cliente_id: uno(clienti).id, stato: 'emessa', data: giorno(d), numero: fattAnno[a] + '/' + a, numero_da: 'mano', iva_percentuale: 22, eppi_percentuale: 5,
        compenso, contributo, base_iva: compenso + contributo, iva, totale, netto: totale, creato: istante(d), modificato: istante(d) });
    }
    ins('fatture', fatt);
    // Le fatture di piu' di 90 giorni fa sono incassate (un movimento sul conto dello studio, abbinato).
    const conto = Number(db.esegui("INSERT INTO conti (nome, banca, iban, predefinito, attivo, creato, modificato) VALUES ('Conto studio', 'Banca di esempio', '', 1, 1, ?, ?)", ora, ora).lastInsertRowid);
    const sMov = db.prepara("INSERT INTO movimenti (conto_id, data, verso, importo, descrizione, soggetto_id, categoria, verificato, creato, modificato) VALUES (?, ?, 'entrata', ?, ?, ?, 'incasso', 1, ?, ?)");
    const sAbb = db.prepara('INSERT INTO movimento_abbinamenti (movimento_id, fattura_id, importo, creato) VALUES (?, ?, ?, ?)');
    let incassate = 0;
    for (const f of db.righe("SELECT id, data, netto, cliente_id, numero FROM fatture WHERE stato = 'emessa' ORDER BY id")) {
      const d = new Date(f.data + 'T12:00:00');
      if (d >= new Date(fine.getTime() - 90 * 86400000)) continue;
      const quando = giorno(new Date(d.getTime() + 30 * 86400000));
      const m = Number(sMov.run(conto, quando, f.netto, 'Incasso fattura ' + f.numero, f.cliente_id, istante(d), istante(d)).lastInsertRowid);
      sAbb.run(m, f.id, f.netto, istante(d));
      incassate++;
    }
    conti.incassi = incassate;
    const ric = [];
    for (let i = 0; i < q(2000); i++) {
      const d = unGiorno();
      const imponibile = tra(50, 3000);
      ric.push({ fornitore_id: uno(fornitori).id, numero: 'R' + i, data: giorno(d), descrizione: 'Materiale di esempio', categoria: 'materiale', imponibile,
        iva: Math.round(imponibile * 22) / 100, totale: Math.round(imponibile * 122) / 100, netto: Math.round(imponibile * 122) / 100, creato: istante(d), modificato: istante(d) });
    }
    ins('fatture_ricevute', ric);
    // Le ricevute di piu' di 60 giorni fa sono pagate (un'uscita dal conto dello studio, abbinata).
    const sUsc = db.prepara("INSERT INTO movimenti (conto_id, data, verso, importo, descrizione, soggetto_id, categoria, verificato, creato, modificato) VALUES (?, ?, 'uscita', ?, ?, ?, 'pagamento', 1, ?, ?)");
    const sAbbR = db.prepara('INSERT INTO movimento_abbinamenti (movimento_id, ricevuta_id, importo, creato) VALUES (?, ?, ?, ?)');
    let pagate = 0;
    for (const r of db.righe('SELECT id, data, netto, fornitore_id, numero FROM fatture_ricevute ORDER BY id')) {
      const d = new Date(r.data + 'T12:00:00');
      if (d >= new Date(fine.getTime() - 60 * 86400000)) continue;
      const m = Number(sUsc.run(conto, giorno(new Date(d.getTime() + 30 * 86400000)), r.netto, 'Pagamento fattura ' + r.numero, r.fornitore_id, istante(d), istante(d)).lastInsertRowid);
      sAbbR.run(m, r.id, r.netto, istante(d));
      pagate++;
    }
    conti.pagamenti = pagate;
    // ---- attivita' (20.000), ticket (3.000)
    const att = [];
    for (let i = 0; i < q(20000); i++) {
      const d = unGiorno();
      const passata = d < fine;
      att.push({ titolo: uno(LAVORI), tipo: uno(['attivita', 'attivita', 'appuntamento', 'sopralluogo']), commessa_id: uno(commesse).id, assegnata_a: uno(utenti).id,
        stato: passata ? 'fatta' : 'da_fare', scadenza: giorno(d), fatta_il: passata ? istante(d) : '', creato: istante(d), modificato: istante(d) });
    }
    ins('attivita', att);
    const tk = [];
    const tkAnno = {};
    for (let i = 0; i < q(3000); i++) {
      const d = unGiorno();
      const a = d.getFullYear();
      tkAnno[a] = (tkAnno[a] || 0) + 1;
      tk.push({ numero: 'TK/' + a + '/' + String(tkAnno[a]).padStart(4, '0'), cliente_id: uno(clienti).id, titolo: uno(LAVORI), aperto_il: istante(d),
        stato: d < new Date(fine.getTime() - 30 * 86400000) ? 'chiuso' : 'aperto', priorita: uno(['normale', 'normale', 'alta', 'bassa']) });
    }
    ins('ticket', tk);
    // ---- documenti (5.000) coi loro file su disco e il testo nella ricerca
    const cat = db.riga("SELECT id FROM documento_categorie WHERE nome = 'Da classificare'") || db.riga('SELECT id FROM documento_categorie ORDER BY id LIMIT 1');
    const haFts = !!db.riga("SELECT name FROM sqlite_master WHERE name = 'file_testo'");
    const sFile = db.prepara('INSERT INTO file (id, nome, mime, byte, sha256, percorso, tipo, creato, documento_id, versione_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const sDoc = db.prepara('INSERT INTO documenti (titolo, categoria_id, origine, cliente_id, commessa_id, vede, creato, modificato, creato_da) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const sVer = db.prepara('INSERT INTO documento_versioni (documento_id, numero, file_id, nome_file, mime, byte, stato, caricata_da, caricata_il) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?)');
    const sValida = db.prepara('UPDATE documenti SET versione_valida_id = ? WHERE id = ?');
    const sTesto = haFts ? db.prepara('INSERT INTO file_testo (testo, file_id) VALUES (?, ?)') : null;
    const sLett = db.prepara("INSERT INTO file_lettura (file_id, stato, caratteri, pagine, letto_il) VALUES (?, 'letto', ?, 1, ?)");
    fs.mkdirSync(path.join(dati, 'file'), { recursive: true });
    for (let i = 0; i < q(5000); i++) {
      const d = unGiorno();
      const m = uno(commesse);
      const righe = ['Documento di esempio ' + i + ' - ' + m.descrizione, uno(TESTI), uno(TESTI)];
      const b = pdfConTesto(righe);
      const idFile = 'finto' + String(i).padStart(6, '0') + 'aaaaaaaaaaaaaaaaa';
      fs.writeFileSync(path.join(dati, 'file', idFile), b);
      const idDoc = Number(sDoc.run(uno(LAVORI) + ' ' + i, cat.id, 'file', m.cliente_id, m.id, 'tutti', istante(d), istante(d), utenti[0].id).lastInsertRowid);
      sFile.run(idFile, 'documento-' + i + '.pdf', 'application/pdf', b.length, sha256(b), idFile, 'documento', istante(d), idDoc, null);
      const idVer = Number(sVer.run(idDoc, idFile, 'documento-' + i + '.pdf', 'application/pdf', b.length, 'approvata', utenti[0].id, istante(d)).lastInsertRowid);
      sValida.run(idVer, idDoc);
      const testo = righe.join('\n');
      if (sTesto) sTesto.run(testo, idFile);
      sLett.run(idFile, testo.length, istante(d));
    }
    conti.documenti = q(5000);
    // ---- registro (500.000) e accessi (60.000)
    const sReg = db.prepara('INSERT INTO registro (quando, utente_id, utente, disp, azione, tabella, id_riga, prima, dopo, nota) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (let i = 0; i < q(500000); i++) {
      const d = new Date(inizio.getTime() + Math.floor(i / q(500000) * giorni * 86400000));
      const u = utenti[i % utenti.length];
      sReg.run(istante(d), u.id, u.nome, 'prova', 'salvaRapportino', 'rapportini', uno(ids), null, '{"ore_lavoro":' + tra(1, 8) + '}', '');
    }
    conti.registro = q(500000);
    const sAcc = db.prepara('INSERT INTO accessi (quando, esito, azione, utente_id, disp, disp_nome, app) VALUES (?,?,?,?,?,?,?)');
    for (let i = 0; i < q(60000); i++) {
      const d = new Date(inizio.getTime() + Math.floor(i / q(60000) * giorni * 86400000));
      sAcc.run(istante(d), 'ok', uno(['rapportini', 'anagrafiche', 'dashboard', 'salvaRapportino']), uno(utenti).id, 'prova', 'Telefono di prova', 'telefono 0.11.0');
    }
    conti.accessi = q(60000);
  }));
  w.chiudi();
  return { dati, conti, secondi: Math.round((Date.now() - t0) / 100) / 10, mb: Math.round(fs.statSync(path.join(dati, 'wisper.db')).size / 1048576) };
}

if (require.main === module) {
  try {
    const r = datiFinti(argomenti(process.argv.slice(2)));
    console.log('Dati finti in ' + r.dati + ' (' + r.secondi + ' s, database ' + r.mb + ' MB):');
    console.log(Object.entries(r.conti).map(([k, v]) => '  ' + k + ': ' + v).join('\n'));
    console.log('Ora: node server/src/avvio.js --dati ' + r.dati + ' --porta 8499, poi node server/prove/carico.js --server http://localhost:8499');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { datiFinti };
