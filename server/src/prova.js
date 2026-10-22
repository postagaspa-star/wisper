/*
 * I dati di esempio di --prova: gli STESSI di semina() del finto Google
 * (apps-script/prove/finto-google.js), scritti con le stesse azioni, cosi' i
 * conti li fa il server come li faceva lo script. In piu' quello che la fase 1
 * aggiunge: fornitori, referenti, sedi e impianti, prestazioni, un
 * responsabile e quattro utenti di prova, tutti con password "prova".
 *
 * Solo dati inventati: nessun nome, indirizzo o numero vero.
 */
'use strict';

const { hashPasswordSync } = require('./azioni/accesso');
const { ELETTRODINAMICA } = require('./conti');
const { adesso, oggi, piuGiorni, istante } = require('./utili');

const UTENTI_DI_PROVA = [
  { nome: 'Manuel Gasparotto', email: 'manuel@esempio.it', ruolo: 'titolare' },
  { nome: 'Laura Amministrazione', email: 'laura@esempio.it', ruolo: 'amministrazione' },
  { nome: 'Marco Collaboratore', email: 'marco@esempio.it', ruolo: 'collaboratore' },
  { nome: 'Lettura', email: 'lettura@esempio.it', ruolo: 'lettura' },
];

/** Una partita IVA finta ma col codice di controllo giusto: dieci cifre, piu' quella che fa tornare il conto. */
function partitaIvaDiProva(dieci) {
  for (let c = 0; c <= 9; c++) {
    const s = dieci + c;
    let somma = 0;
    for (let i = 0; i < 11; i++) {
      let x = s.charCodeAt(i) - 48;
      if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9; }
      somma += x;
    }
    if (somma % 10 === 0) return s;
  }
  return null;
}

function semina(w) {
  const ora = adesso();
  const utenti = {};
  w.db.transazione(() => {
    for (const u of UTENTI_DI_PROVA) {
      const id = w.inserisci('utenti', { nome: u.nome, email: u.email, ruolo: u.ruolo, password_hash: hashPasswordSync('prova'), attivo: 1, creato: ora });
      utenti[u.ruolo] = { id, nome: u.nome, email: u.email, ruolo: u.ruolo };
    }
  });
  const come = (ruolo, fn) => w.come({ utente: utenti[ruolo], permessi: w.permessiDi(ruolo), app: 'prova', dispNome: 'dati di esempio' },
    () => w.db.transazione(fn));

  come('titolare', () => {
    // ------------------------------------------------ come semina() del finto Google
    // Elettrodinamica la crea preparaFoglio() dello script, a tariffa fissa.
    w.inserisci('soggetti', {
      id: 'C001', cliente: 1, nome: ELETTRODINAMICA.nome, tariffa_fissa: ELETTRODINAMICA.tariffaFissa, paga_viaggio: 0,
      km_rimborsati: 1, magg_extra: ELETTRODINAMICA.maggExtra, gruppo: '', email: '', note: ELETTRODINAMICA.note, creato: ora, modificato: ora,
    });
    w.salvaImpostazioni({ INDIRIZZO: 'Via dell\'Esempio 1, 36016 Thiene (VI)', PARTITA_IVA: '00000000000', EMAIL: 'studio@example.com', COSTO_ORARIO: 15 });
    const elettro = w.trovaCliente(w.leggiClienti(), '', 'Elettrodinamica');
    w.aggiornaCliente(elettro.id, { email: 'rapportini@elettrodinamica.example', costoFisso: 22 });
    const rossi = w.creaCliente({ nome: 'Rossi Impianti Srl', email: 'rossi@example.com' });
    const p1 = w.creaCommessa({ idCliente: elettro.id, descrizione: 'Nuovo magazzino automatico Batokyo', indirizzo: 'Zona industriale, Schio', budgetOre: 40, budgetEuro: 1200, inizio: '2026-09-01', finePrevista: '2026-12-20' });
    const p2 = w.creaCommessa({ idCliente: rossi.id, descrizione: 'Quadro elettrico capannone', budgetEuro: 2500, prezzoOrario: 42, costoOrario: 25, euroKm: 0.9 });
    let n = 0;
    const rap = dati => w.salvaRapportino(Object.assign({ idLocale: 'seme-' + (++n), tecnico: 'Manuel Gasparotto' }, dati));
    rap({ data: '2026-09-15', idCliente: elettro.id, idCommessa: p1.id, descrizione: 'Sopralluogo e rilievo quadri esistenti', oreLavoro: 6, oreViaggio: 1.5, km: 96 });
    rap({ data: '2026-10-02', idCliente: elettro.id, idCommessa: p1.id, descrizione: 'Cablaggio quadro di linea 1', oreLavoro: 8, oreExtra: 1, km: 96, spese: 14.5, noteSpese: 'Pranzo' });
    rap({ data: '2026-10-08', idCliente: elettro.id, idCommessa: p1.id, descrizione: 'Collaudo sensori e messa in servizio nastro', oreLavoro: 7.5, oreViaggio: 1.5, km: 96 });
    rap({ data: '2026-10-10', idCliente: rossi.id, idCommessa: p2.id, descrizione: 'Sostituzione interruttore generale', oreLavoro: 3.5, km: 22, tariffa: 42 });
    w.cambiaStato(['RAP/2026/0001'], 'FATTURATO');
    w.cambiaStato(['RAP/2026/0002'], 'INVIATO');

    // ------------------------------------------------ in piu' per la fase 1
    w.salvaSoggetto({ nome: 'Materiale Elettrico Esempio Srl', cliente: false, fornitore: true, partitaIva: partitaIvaDiProva('0123456789'),
      email: 'ordini@materiale.example', telefono: '0445 000100', indirizzo: 'Via dei Fornitori 3', cap: '36016', citta: 'Thiene', provincia: 'VI', codiceSdi: 'ABC1234' });
    w.salvaSoggetto({ nome: 'Noleggi Piattaforme Prova Snc', cliente: false, fornitore: true, partitaIva: partitaIvaDiProva('0987654321'),
      email: 'noleggi@piattaforme.example', telefono: '0445 000200', cap: '36015', citta: 'Schio', provincia: 'VI' });
    w.salvaReferente({ idSoggetto: elettro.id, nome: 'Giulia Bianchi', ruolo: 'Ufficio tecnico', telefono: '0445 000001', email: 'giulia.bianchi@elettrodinamica.example' });
    w.salvaReferente({ idSoggetto: elettro.id, nome: 'Franco Verdi', ruolo: 'Amministrazione', telefono: '0445 000002', email: 'amministrazione@elettrodinamica.example' });
    w.salvaReferente({ idSoggetto: rossi.id, nome: 'Paolo Rossi', ruolo: 'Titolare', telefono: '333 0000003' });
    w.salvaSede({ idSoggetto: elettro.id, tipo: 'sede', nome: 'Sede di Schio', indirizzo: 'Via dell\'Esempio 10', cap: '36015', citta: 'Schio', provincia: 'VI' });
    const impianto = w.salvaSede({ idSoggetto: elettro.id, tipo: 'impianto', nome: 'Magazzino automatico Batokyo', indirizzo: 'Zona industriale', cap: '36015', citta: 'Schio', provincia: 'VI' });
    w.salvaSede({ idSoggetto: rossi.id, tipo: 'sede', nome: 'Capannone', indirizzo: 'Via delle Prove 5', cap: '36016', citta: 'Thiene', provincia: 'VI' });
    w.aggiornaCommessa(p1.id, { sedeId: impianto.id, responsabileId: utenti.titolare.id, persone: [utenti.collaboratore.id], importoContratto: 1200 });
    w.aggiornaCommessa(p2.id, { importoContratto: 2500 });
    const prestazioni = [
      [p1.id, 'Sopralluogo', 'Rilievo dei quadri esistenti', 300, 100],
      [p1.id, 'Progetto esecutivo', 'Schemi elettrici e lista materiali', 600, 50],
      [p1.id, 'Direzione lavori', 'Assistenza al montaggio e collaudo', 300, 0],
      [p2.id, 'Sopralluogo', '', 200, 100],
      [p2.id, 'Progetto esecutivo', 'Quadro generale e distribuzione', 1500, 30],
      [p2.id, 'Direzione lavori', '', 800, 0],
    ];
    for (const [idCommessa, nome, descrizione, valore, avanzamento] of prestazioni) {
      w.salvaPrestazione({ idCommessa, nome, descrizione, valore, avanzamento });
    }
  });

  // I due rapportini di Marco, scritti da lui: la tariffa la mette il server (non la vede).
  come('collaboratore', () => {
    w.salvaRapportino({ idLocale: 'marco-1', data: '2026-10-13', idCliente: 'C001', idCommessa: '26ST001', descrizione: 'Cablaggio quadro di linea 2', oreLavoro: 8, km: 96 });
    w.salvaRapportino({ idLocale: 'marco-2', data: '2026-10-16', idCliente: 'C002', idCommessa: '26ST002', descrizione: 'Verifica impianto di terra', oreLavoro: 4, oreViaggio: 0.5, km: 22 });
  });
  seminaFase2(w, utenti, come);
  seminaFase3(w, utenti, come);
  return utenti;
}

/** Una foto di scontrino finta (un PNG di 1x1). */
const SCONTRINO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Ore, timer, approvazioni, spese e trasferte come nel prototipo della fase 3
 * (docs/prototipo/Gestionale-fase3.html), con i giorni contati da oggi (gli
 * ultimi giorni feriali):
 *  - ore registrate di Manuel, Laura e Marco (una bozza di Manuel di oggi);
 *  - il timer di Marco acceso da un'ora e mezza;
 *  - da approvare (di Marco): ore con un giorno da 13 ore (anomalia), un
 *    rapportino (RAP/aaaa/0006; il 0005 e' approvato), un pranzo senza
 *    scontrino (anomalia), un pedaggio, una trasferta coi km diversi dal
 *    solito e un albergo sopra i 200 euro (anomalie);
 *  - ore di Marco respinte con il motivo;
 *  - spese con e senza foto al cliente, allo studio e "Mia", un'anticipazione
 *    (diritti di segreteria intestati al cliente), una trasferta di Manuel;
 *  - rimborsi da fare a Manuel, Laura e Marco.
 */
function seminaFase3(w, utenti, come) {
  const T = oggi();
  const feriali = [];
  for (let i = 0; feriali.length < 5; i++) {
    const g = piuGiorni(T, -i);
    const dow = new Date(g + 'T12:00:00').getDay();
    if (dow !== 0 && dow !== 6) feriali.push(g);
  }
  const [g0, g1, g2, g3] = feriali;
  let foto = 0;
  const scontrino = s => w.caricaFile({ tipo: 'spesa', idSpesa: s.id, base64: SCONTRINO, mime: 'image/png', idFile: 'scontrino-' + (++foto) });
  const ore = riga => w.salvaOre({ riga }).riga;
  const ids = {};

  come('titolare', () => {
    ore({ data: g1, idCommessa: '26ST001', inizio: '08:30', fine: '15:00', pausaMinuti: 30, descrizione: 'Progetto esecutivo: schema unifilare' });
    ore({ data: g1, ore: 1.5, fatturabile: false, descrizione: 'Aggiornamento normativa CEI' });
    ore({ data: g2, idCommessa: '26ST002', ore: 3, descrizione: 'Calcolo delle sezioni del quadro' });
    ore({ data: g0, idCommessa: '26ST002', ore: 4, descrizione: 'Collaudo quadro: preparazione verbali', bozza: true });
    const pedaggio = w.salvaSpesa({ data: g1, importo: 8.4, categoria: 'pedaggio', descrizione: 'Pedaggio A4 Vicenza Ovest', idCommessa: '26ST001', pagataDaMe: true });
    scontrino(pedaggio);
    scontrino(w.salvaSpesa({ data: g2, importo: 62, categoria: 'carburante', descrizione: 'Gasolio', destinazione: 'studio' }));
    w.salvaSpesa({ data: g0, importo: 3, categoria: 'parcheggio', descrizione: 'Parcheggio Schio centro', idCommessa: '26ST001', pagataDaMe: true });
    scontrino(w.salvaSpesa({ data: g0, importo: 21.9, categoria: 'materiale', descrizione: 'Morsetti e fascette', destinazione: 'studio' }));
    scontrino(w.salvaSpesa({ data: g2, importo: 52, categoria: 'altro', descrizione: 'Diritti di segreteria del Comune', idCommessa: '26ST002',
      anticipazione: true, pagataDaMe: true }));
    w.salvaTrasferta({ dal: g1, destinazione: 'Schio, cantiere Batokyo', motivo: 'Riunione di cantiere', idCommessa: '26ST001', km: 48, andataRitorno: true });
  });

  come('amministrazione', () => {
    ore({ data: g1, inizio: '08:30', fine: '17:00', pausaMinuti: 60, fatturabile: false, descrizione: 'Fatture e prima nota' });
    ore({ data: g2, idCommessa: '26ST002', ore: 2, descrizione: 'Pratica al distributore di energia' });
    w.salvaSpesa({ data: g1, importo: 12, categoria: 'vitto', descrizione: 'Pranzo', destinazione: 'personale', pagataDaMe: true });
    scontrino(w.salvaSpesa({ data: g2, importo: 9.8, categoria: 'treno', descrizione: 'Treno per la Camera di commercio', destinazione: 'studio', pagataDaMe: true }));
  });

  come('collaboratore', () => {
    ore({ data: g2, idCommessa: '26ST001', ore: 7, descrizione: 'Schema del quadro di linea 3' });
    ore({ data: g1, idCommessa: '26ST001', inizio: '08:00', fine: '17:00', pausaMinuti: 60, descrizione: 'Cablaggio quadro di linea 3' });
    ore({ data: g1, idCommessa: '26ST001', inizio: '17:30', fine: '22:30', descrizione: 'Collaudo notturno della linea 3', tipo: 'straordinaria' });
    ids.oreApprovate = ore({ data: g3, idCommessa: '26ST002', ore: 3, descrizione: 'Verifica impianto di terra' }).id;
    ids.oreRespinte = ore({ data: g3, ore: 2, fatturabile: false, descrizione: 'Riordino del magazzino' }).id;
    w.salvaSpesa({ data: g1, importo: 16.5, categoria: 'vitto', descrizione: 'Pranzo', destinazione: 'studio', pagataDaMe: true });
    scontrino(w.salvaSpesa({ data: g2, importo: 8.4, categoria: 'pedaggio', descrizione: 'Pedaggio A4', idCommessa: '26ST002', pagataDaMe: true }));
    const parcheggio = w.salvaSpesa({ data: g3, importo: 4.5, categoria: 'parcheggio', descrizione: 'Parcheggio Batokyo', idCommessa: '26ST001', pagataDaMe: true });
    scontrino(parcheggio);
    ids.parcheggio = parcheggio.id;
    const tr = w.salvaTrasferta({ dal: g2, al: g1, destinazione: 'Schio, passando dal fornitore a Padova', motivo: 'Collaudo notturno della linea 3',
      idCommessa: '26ST001', km: 90, andataRitorno: true });
    scontrino(w.salvaSpesa({ data: g2, importo: 230, categoria: 'alloggio', descrizione: 'Albergo per il collaudo notturno', idCommessa: '26ST001',
      idTrasferta: tr.id, pagataDaMe: true }));
    w.avviaTimer({ idCommessa: '26ST001', descrizione: 'Cablaggio quadro di linea 3' });
  });
  // Il timer di Marco e' partito un'ora e mezza fa.
  w.db.esegui('UPDATE timer SET partito_il = ? WHERE utente_id = ?', istante(new Date(Date.now() - 90 * 60000)), utenti.collaboratore.id);

  come('titolare', () => {
    w.decidi({ voci: [{ tipo: 'rapportino', id: 'RAP/2026/0005' }, { tipo: 'ore', id: ids.oreApprovate }, { tipo: 'spesa', id: ids.parcheggio }] }, 'approva');
    w.decidi({ voci: [{ tipo: 'ore', id: ids.oreRespinte }], motivo: 'Il riordino del magazzino non si segna: è dentro le ore di studio' }, 'respingi');
  });
}

/**
 * Preventivi e attivita' come nel prototipo della fase 2
 * (docs/prototipo/Gestionale-fase2.html), con le date contate da oggi: la
 * dashboard ha sempre qualcosa di scaduto, di oggi e dei prossimi giorni.
 *  - PR/aaaa/007 inviato e scaduto, senza risposta da piu' di 15 giorni;
 *  - PR/aaaa/010 accettato, gia' diventato la commessa 26ST002;
 *  - PR/aaaa/012 rev. 1 inviato (la rev. 0 e' sostituita), con una voce
 *    facoltativa e due alternative, scade fra 6 giorni;
 *  - PR/aaaa/013 in bozza, con una voce senza prezzo;
 *  - un modello;
 *  - attivita' scadute, di oggi, dei prossimi giorni, senza data, non
 *    assegnate, una fatta, due ricorrenti, appuntamenti e un sopralluogo.
 * I numeri dei preventivi sono quelli del prototipo (opzione interna "numero").
 */
function seminaFase2(w, utenti, come) {
  const T = oggi();
  const g = n => piuGiorni(T, n);
  const quando = (giorno, ora) => istante(new Date(giorno + 'T' + ora));
  // Le date nel passato si scrivono dopo, come se fossero successe allora.
  const retrodata = (id, campi) => {
    const k = Object.keys(campi);
    w.db.esegui('UPDATE preventivi SET ' + k.map(c => c + ' = ?').join(', ') + ' WHERE id = ?', ...k.map(c => campi[c]), id);
  };
  const manuel = utenti.titolare.id;
  const laura = utenti.amministrazione.id;
  const marco = utenti.collaboratore.id;

  come('titolare', () => {
    w.salvaImpostazioni({
      POLIZZA_COMPAGNIA: 'Assicurazioni Esempio Spa', POLIZZA_NUMERO: 'RC-0000-PROVA', POLIZZA_MASSIMALE: '1.000.000 euro',
      TITOLI: 'Perito industriale iscritto al Collegio dei periti industriali (dato di esempio)',
    });
    // I prezzi del listino (le Verifiche periodiche restano senza, come nel prototipo).
    const prezzi = { SOP: 350, PRE: 600, ESE: 1900, DL: 45, DIRI: 450, COL: 380, CON: 45 };
    for (const v of w.leggiListino(true)) {
      if (prezzi[v.codice] !== undefined) w.salvaVoceListino({ id: v.id, prezzo: prezzi[v.codice], modo: v.codice === 'DL' ? 'ore' : undefined });
    }
    const L = codice => w.leggiListino(true).find(v => v.codice === codice).id;
    const capannone = w.leggiSedi().find(s => s.idSoggetto === 'C002' && s.nome === 'Capannone').id;
    const paolo = w.leggiReferenti().find(r => r.idSoggetto === 'C002' && r.nome === 'Paolo Rossi').id;
    const tre = [{ tipo: 'percentuale', valore: 30, quando: 'firma' }, { tipo: 'percentuale', valore: 40, quando: 'avanzamento', descrizione: '40% a fine progetto' },
      { tipo: 'percentuale', valore: 30, quando: 'fine', descrizione: 'Saldo a fine lavori' }];
    const oneri = 'Pratiche presso il distributore di energia e il Comune, a carico del cliente';

    // PR/007: inviato e scaduto, nessuna risposta.
    const p7 = w.salvaPreventivo({ idCliente: 'C002', oggetto: 'Quadro di cantiere', complessita: 'bassa', oneriPrevisti: 'Nessuno oltre al compenso',
      data: g(-46), scadenza: g(30), sezioni: [{ titolo: 'Progetto', voci: [{ descrizione: 'Progetto quadro di cantiere', quantita: 1, prezzo: 900 }] }],
      scadenzePagamento: [{ tipo: 'percentuale', valore: 100, quando: 'fine', descrizione: 'Tutto a fine lavori' }] }, { numero: 7 });
    w.segnaInviato({ id: p7.id });
    retrodata(p7.id, { scadenza: g(-16), inviato_il: quando(g(-45), '10:00:00'), creato: quando(g(-46), '09:00:00'), modificato: quando(g(-45), '10:00:00') });

    // PR/010: accettato per email, gia' diventato la commessa 26ST002 (le sue prestazioni sono queste voci).
    const p10 = w.salvaPreventivo({ idCliente: 'C002', idSede: capannone, idReferente: paolo, oggetto: 'Quadro elettrico capannone', complessita: 'media',
      oneriPrevisti: oneri, data: g(-60), scadenza: g(30),
      sezioni: [{ titolo: 'Prestazioni', voci: [
        { idListino: L('SOP'), descrizione: 'Sopralluogo', prezzo: 200 },
        { idListino: L('ESE'), descrizione: 'Progetto esecutivo', prezzo: 1500 },
        { idListino: L('DL'), descrizione: 'Direzione lavori', modo: 'corpo', prezzo: 800 }] }],
      scadenzePagamento: [{ tipo: 'percentuale', valore: 30, quando: 'firma' }, { tipo: 'percentuale', valore: 70, quando: 'fine', descrizione: 'Saldo a fine lavori' }] }, { numero: 10 });
    w.segnaInviato({ id: p10.id });
    w.accettaPreventivo({ id: p10.id, modo: 'email', nome: 'Paolo Rossi' });
    w.aggiorna('preventivi', p10.id, { commessa_id: '26ST002' });
    for (const s of p10.scadenzePagamento) w.aggiorna('scadenze_pagamento', s.id, { commessa_id: '26ST002' });
    retrodata(p10.id, { scadenza: g(-30), inviato_il: quando(g(-59), '11:00:00'), accettato_il: quando(g(-52), '16:20:00'),
      creato: quando(g(-60), '09:30:00'), modificato: quando(g(-52), '16:20:00') });

    // PR/012: la rev. 0 inviata e sostituita, la rev. 1 come nel prototipo (una facoltativa, due alternative).
    const p12 = w.salvaPreventivo({ idCliente: 'C002', idSede: capannone, idReferente: paolo, oggetto: 'Adeguamento impianto elettrico capannone',
      introduzione: 'Come concordato al sopralluogo, ecco la proposta per l\'adeguamento dell\'impianto elettrico del capannone.',
      complessita: 'media', oneriPrevisti: oneri, data: g(-10),
      sezioni: [
        { titolo: 'Progettazione', voci: [{ idListino: L('SOP'), descrizione: 'Sopralluogo e rilievo' }, { idListino: L('ESE'), descrizione: 'Progetto esecutivo impianto elettrico' }] },
        { titolo: 'Cantiere', voci: [{ idListino: L('DL'), quantita: 14 }] }],
      scadenzePagamento: tre }, { numero: 12 });
    w.segnaInviato({ id: p12.id });
    retrodata(p12.id, { inviato_il: quando(g(-9), '18:00:00'), creato: quando(g(-10), '15:00:00') });
    const rev1 = w.nuovaRevisione(p12.id);
    w.salvaPreventivo({ id: rev1.id, data: g(-7), scadenza: g(6), sezioni: [
      { titolo: 'Progettazione', voci: [{ idListino: L('SOP'), descrizione: 'Sopralluogo e rilievo' }, { idListino: L('ESE'), descrizione: 'Progetto esecutivo impianto elettrico' }] },
      { titolo: 'Cantiere', voci: [
        { idListino: L('DL'), quantita: 16 },
        { idListino: L('DIRI'), descrizione: 'Dichiarazione di rispondenza', facoltativa: true, scelta: false },
        { idListino: L('COL'), descrizione: 'Collaudo con strumenti propri', alternativa: 'collaudo', scelta: true },
        { descrizione: 'Collaudo con laboratorio esterno', prezzo: 620, alternativa: 'collaudo', scelta: false }] }] });
    w.segnaInviato({ id: rev1.id });
    retrodata(rev1.id, { inviato_il: quando(g(-7), '10:00:00'), creato: quando(g(-7), '09:12:00'), modificato: quando(g(-7), '10:00:00') });

    // PR/013: bozza di ieri, con la voce del listino ancora senza prezzo.
    const p13 = w.salvaPreventivo({ idCliente: 'C001', oggetto: 'Verifica periodica impianto di terra', data: g(-1),
      sezioni: [{ titolo: 'Verifica', voci: [{ idListino: L('VER') }] }] }, { numero: 13 });

    // Un modello, per "Da un modello".
    w.salvaPreventivo({ modello: true, oggetto: 'Progetto impianto elettrico capannone', complessita: 'media', oneriPrevisti: oneri,
      sezioni: [
        { titolo: 'Progettazione', voci: [{ idListino: L('SOP') }, { idListino: L('ESE') }] },
        { titolo: 'Cantiere', voci: [{ idListino: L('DL'), quantita: 10 }, { idListino: L('COL') }] }],
      scadenzePagamento: tre });

    // ------------------------------------------------ attivita'
    const at = x => w.salvaAttivita({ attivita: x, conferma: true }).attivita;
    at({ titolo: 'Chiamare Rossi per il collaudo', idCommessa: '26ST002', assegnataA: manuel, priorita: 'alta', scadenza: g(-1) });
    at({ titolo: 'Richiamare Elettrodinamica per i disegni del magazzino', idCommessa: '26ST001', assegnataA: laura, scadenza: g(-3) });
    at({ titolo: 'Sopralluogo quadri del magazzino Batokyo', tipo: 'sopralluogo', idCommessa: '26ST001', assegnataA: marco,
      inizio: g(0) + 'T14:30:00', fine: g(0) + 'T16:00:00', luogo: 'Zona industriale, Schio', promemoriaMinuti: 60 });
    at({ titolo: 'Mandare lo schema unifilare a Elettrodinamica', idCommessa: '26ST001', assegnataA: manuel, scadenza: g(0),
      checklist: [{ testo: 'Controllare le sezioni dei cavi', fatta: true }, { testo: 'Esportare il PDF' }, { testo: 'Mandarlo a Giulia Bianchi' }] });
    at({ titolo: 'Rinnovo polizza professionale', assegnataA: manuel, scadenza: g(6), promemoriaMinuti: 1440, ricorrenza: { regola: 'anni', ogni: 1 } });
    at({ titolo: 'Completare il preventivo ' + p13.etichetta, idCliente: 'C001', scadenza: g(2) });
    at({ titolo: 'Riordinare i cataloghi in ufficio', priorita: 'bassa' });
    at({ titolo: 'Riunione di cantiere Batokyo', tipo: 'appuntamento', idCommessa: '26ST001', assegnataA: manuel,
      inizio: g(2) + 'T08:30:00', fine: g(2) + 'T10:00:00', luogo: 'Magazzino automatico Batokyo' });
    at({ titolo: 'Collaudo quadro capannone', tipo: 'appuntamento', idCommessa: '26ST002', assegnataA: manuel,
      inizio: g(3) + 'T09:00:00', fine: g(3) + 'T12:00:00', luogo: 'Via delle Prove 5, Thiene' });
    // Ogni lunedi', dal prossimo (o da oggi, se e' lunedi').
    const dow = ((new Date(T + 'T12:00:00').getDay() + 6) % 7) + 1;
    const lunedi = g(dow === 1 ? 0 : 8 - dow);
    at({ titolo: 'Riunione di studio', tipo: 'appuntamento', assegnataA: manuel, inizio: lunedi + 'T08:00:00', fine: lunedi + 'T08:30:00',
      luogo: 'Studio', ricorrenza: { regola: 'settimane', ogni: 1, giorniSettimana: [1] } });
    const fatta = at({ titolo: 'Ordinare il materiale per il quadro', idCommessa: '26ST002', assegnataA: marco, scadenza: g(-2) });
    w.faiAttivita({ id: fatta.id, fatta: true });
  });

  // Marco scrive una sua attivita' (il collaboratore assegna solo a se').
  come('collaboratore', () => {
    w.salvaAttivita({ attivita: { titolo: 'Aggiornare lo schema del quadro di linea 2', idCommessa: '26ST001', assegnataA: marco, scadenza: g(1) } });
  });
}

module.exports = { semina, UTENTI_DI_PROVA, partitaIvaDiProva };
