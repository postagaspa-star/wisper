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
const { adesso, adessoMs, oggi, piuGiorni, istante } = require('./utili');

const UTENTI_DI_PROVA = [
  { nome: 'Manuel Gasparotto', email: 'manuel@esempio.it', ruolo: 'titolare' },
  // Fase 6: le persone di prova hanno nome e cognome (di esempio), come nell'accordo della fase 6.
  { nome: 'Laura Bianchi', email: 'laura@esempio.it', ruolo: 'amministrazione' },
  { nome: 'Marco Rossato', email: 'marco@esempio.it', ruolo: 'collaboratore' },
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

/**
 * Le commesse dei dati di esempio sono lavori del 2026 (26ST001 ... 26ST006, come i rapportini e i contratti a date
 * fisse), anche quando i dati nascono in un altro anno: senza, il 1 gennaio 2027 la prima diventava 27ST001 e i dati di
 * esempio si fermavano a "Commessa 26ST002 non trovata". Le commesse nuove, dopo, prendono l'anno di oggi come sempre.
 */
const ANNO_DELLE_COMMESSE = 2026;

function semina(w) {
  const codice = w.prossimoCodiceCommessa;
  w.prossimoCodiceCommessa = function (anno) { return codice.call(this, anno || ANNO_DELLE_COMMESSE); };
  try {
    return seminaTutto(w);
  } finally {
    delete w.prossimoCodiceCommessa;
  }
}

function seminaTutto(w) {
  const ora = adesso();
  const utenti = {};
  w.db.transazione(() => {
    for (const u of UTENTI_DI_PROVA) {
      const id = w.inserisci('utenti', { nome: u.nome, email: u.email, ruolo: u.ruolo, password_hash: hashPasswordSync('prova'), attivo: 1, creato: ora });
      utenti[u.ruolo] = { id, nome: u.nome, email: u.email, ruolo: u.ruolo };
    }
    // Fase 6: ogni utente ha la sua persona (come fa la migrazione 006 coi database di prima).
    for (const u of Object.values(utenti)) w.creaPersonaPerUtente(u);
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
  seminaFase4(w, utenti, come);
  seminaFase5(w, utenti, come);
  seminaFase6(w, utenti, come);
  // Fase 7: portale clienti, WhatsApp e comunicazioni (dopo tutto il resto: id e conteggi di prima restano quelli).
  utenti.fase7 = seminaFase7(w, utenti, come);
  return utenti;
}

/**
 * Persone, mezzi e attrezzature, collaboratori esterni come nel prototipo della fase 6
 * (docs/prototipo/Gestionale-fase6.html). Solo nomi e numeri di esempio:
 *  - le schede di Manuel (titolare, senza costo: il suo e' una convenzione), Laura Bianchi (amministrazione, 30 ore,
 *    costo dal costo dell'anno, saldo dal cedolino, in ferie oggi e domani, una malattia col certificato), Marco Rossato
 *    (tecnico, costo 28,50 dal 1 gennaio, saldo dal cedolino, la richiesta di ferie della settimana dopo la prossima, PES,
 *    primo soccorso scaduto, la visita col giudizio e la prossima fra 13 giorni, i guanti isolanti firmati, il cedolino
 *    riservato) ed Elena Costa (tirocinante, senza accesso);
 *  - il Volvo XC40 diventa l'auto di Manuel; il Fiat Doblò GA123BC dello studio assegnato a Marco (km, tagliando,
 *    assicurazione fra 14 giorni, il guasto della spia delle gomme);
 *  - il Laboratorio Tarature Nord Srl; il Misuratore di terra MT-500 (taratura fra 24 giorni), l'Analizzatore di rete
 *    AR-6 al laboratorio, la pinza senza taratura, il Multimetro 87V scaduto (usato da Marco nel rapportino del 16/10
 *    confermando), i guanti isolanti e l'imbracatura (in prestito agli Impianti Veneti, doveva rientrare ieri);
 *  - Impianti Veneti di Sartori Luca: impresa, DURC che scade fra 7 giorni, visura, idoneita', polizza (in regola),
 *    l'incarico IN/{anno}/001 su 26ST001 a corpo (3.200,00, al 60%) con la fattura ricevuta da 1.200,00, e l'utente
 *    esterno Luca Sartori (luca@esempio.it, password "prova").
 * Le date sono contate da oggi, tranne la taratura scaduta del multimetro (12/10/2026, come i rapportini di ottobre).
 */
function seminaFase6(w, utenti, come) {
  const C = require('./conti');
  const T = oggi();
  const anno = T.slice(0, 4);
  const persona = u => w.personaDiUtente(u.id);
  const lavorativo = (g, passo) => {
    let x = g;
    for (let i = 0; i < 10 && C.giorniLavorativi(x, x, [1, 2, 3, 4, 5], C.festivi(Number(x.slice(0, 4)), '')) === 0; i++) x = piuGiorni(x, passo || 1);
    return x;
  };
  const pdf = nome => Buffer.from('%PDF-1.4\n% Documento di esempio: ' + nome + '\n%%EOF\n', 'utf8');
  const carica = (nome, dati, chi) => {
    const f = w.salvaFile({ dati, nome, mime: 'application/pdf', tipo: 'caricato' });
    w.db.esegui('UPDATE file SET caricato_da = ? WHERE id = ?', (chi || utenti.titolare).id, f.id);
    return f.id;
  };
  const ids = {};
  come('titolare', () => {
    // ------------------------------------------------ le persone
    const manuel = persona(utenti.titolare);
    const laura = persona(utenti.amministrazione);
    const marco = persona(utenti.collaboratore);
    w.salvaPersona({ persona: { id: manuel.id, rapporto: 'titolare', ruoloStudio: 'Titolare', mansione: 'Progettazione elettrica e direzione lavori',
      emailLavoro: 'manuel@esempio.it', telefonoLavoro: '0445 000300', entrataIl: '2008-01-01' } });
    w.salvaPersona({ persona: { id: laura.id, rapporto: 'dipendente', ruoloStudio: 'Amministrazione', mansione: 'Lavoro d\'ufficio', emailLavoro: 'laura@esempio.it',
      telefonoLavoro: '0445 000302', entrataIl: '2024-03-01', oreSettimana: 30, partTime: true, contrattoTipo: 'indeterminato', codiceFiscale: 'BNCLRA85M41L157Z',
      telefonoPersonale: '333 0000201', indirizzo: 'Via delle Prove 7', cap: '36016', citta: 'Thiene', provincia: 'VI', emergenzaNome: 'Paolo Bianchi',
      emergenzaTelefono: '333 0000202', ccnl: 'Studi professionali', livello: '4', ferieAnnueOre: 156, permessiAnnuiOre: 54 } });
    w.salvaPersona({ persona: { id: marco.id, rapporto: 'dipendente', ruoloStudio: 'Tecnico elettrico', mansione: 'Lavori elettrici fuori tensione e in prossimità; verifiche',
      emailLavoro: 'marco@esempio.it', telefonoLavoro: '0445 000301', entrataIl: '2023-05-02', oreSettimana: 40, contrattoTipo: 'indeterminato',
      codiceFiscale: 'RSSMRC90A01L157X', telefonoPersonale: '333 0000301', iban: 'IT60X0542811101000000123456', indirizzo: 'Via dell\'Esempio 22', cap: '36016',
      citta: 'Thiene', provincia: 'VI', emergenzaNome: 'Giulia Rossato', emergenzaTelefono: '333 0000302', ccnl: 'Studi professionali', livello: '3',
      ferieAnnueOre: 208, permessiAnnuiOre: 72 } });
    const elena = w.salvaPersona({ persona: { nome: 'Elena Costa', rapporto: 'tirocinante', ruoloStudio: 'Tirocinio tecnico', entrataIl: piuGiorni(T, -40),
      oreSettimana: 20, contrattoTipo: 'stage', contrattoScade: piuGiorni(T, 50) } }).persona;
    ids.persone = { manuel: manuel.id, laura: laura.id, marco: marco.id, elena: elena.id };
    // Il costo orario: Laura dal costo dell'anno (26.880 su 1.200 ore = 22,40), Marco 28,50 dal 1 gennaio (47.025 su 1.650 ore).
    // Dal 1 gennaio dell'anno di ieri: il 1 gennaio e' quello dell'anno prima, cosi' un costo nuovo "da oggi" non trova gia' quel giorno.
    const dalCosti = piuGiorni(T, -1).slice(0, 4) + '-01-01';
    w.salvaCostoPersona({ idPersona: laura.id, dal: dalCosti, costoAnno: 26880, oreAnno: 1200, nota: 'Dal prospetto del consulente di febbraio' });
    w.salvaCostoPersona({ idPersona: marco.id, dal: dalCosti, costoAnno: 47025, oreAnno: 1650, nota: 'Dal prospetto del consulente di febbraio' });
    // Il saldo dal cedolino della fine del mese scorso.
    const fineMesePrima = piuGiorni(T.slice(0, 7) + '-01', -1);
    w.salvaSaldo({ idPersona: laura.id, tipo: 'ferie', data: fineMesePrima, ore: 78, nota: 'Cedolino del mese scorso' });
    w.salvaSaldo({ idPersona: marco.id, tipo: 'ferie', data: fineMesePrima, ore: 104, nota: 'Cedolino del mese scorso' });
    w.salvaSaldo({ idPersona: marco.id, tipo: 'permessi', data: fineMesePrima, ore: 24, nota: 'Cedolino del mese scorso' });

    // ------------------------------------------------ competenze, visite, DPI, documenti
    w.salvaQualifica({ qualifica: { idPersona: marco.id, tipo: 'pes', titolo: 'Livelli 1A e 1B, 16 ore', data: '2024-02-12', ente: 'Ente di formazione di esempio' } });
    const scadutoIl = piuGiorni(T, -32);
    w.salvaQualifica({ qualifica: { idPersona: marco.id, tipo: 'primo_soccorso', titolo: 'Gruppo B, 12 ore', data: C.piuMesi(scadutoIl, -36), scade: scadutoIl } });
    w.salvaQualifica({ qualifica: { idPersona: laura.id, tipo: 'formazione_generale', titolo: '4 ore', data: '2024-03-04' } });
    w.salvaVisita({ visita: { idPersona: marco.id, data: C.piuMesi(piuGiorni(T, 13), -12), tipo: 'periodica', giudizio: 'idoneo_prescrizioni',
      prescrizioni: 'Niente sollevamento di carichi oltre 15 kg', prossima: piuGiorni(T, 13), medico: 'Medico competente di esempio' } });
    w.salvaVisita({ visita: { idPersona: laura.id, data: '2024-03-04', tipo: 'preventiva', giudizio: 'idoneo' } });
    ids.cedolino = w.documentoDaCarica({ idFile: carica('cedolino-esempio.pdf', pdf('cedolino')), titolo: 'Cedolino del mese scorso', categoria: 'Cedolini',
      personaId: marco.id, dataDocumento: fineMesePrima });

    // ------------------------------------------------ fornitori: il laboratorio e il collaboratore esterno
    const lab = w.salvaSoggetto({ nome: 'Laboratorio Tarature Nord Srl', cliente: false, fornitore: true, partitaIva: partitaIvaDiProva('0333444555'),
      email: 'tarature@laboratorio.example', telefono: '0445 000500', cap: '36100', citta: 'Vicenza', provincia: 'VI' });
    ids.laboratorio = lab.id;
    const iv = w.salvaCollaboratore({ collaboratore: { soggetto: { nome: 'Impianti Veneti di Sartori Luca', partitaIva: partitaIvaDiProva('0555666777'),
      telefono: '0445 000401', email: 'info@impiantiveneti.example', indirizzo: 'Via degli Impianti 4', cap: '36016', citta: 'Thiene', provincia: 'VI' },
    tipo: 'impresa', mestiere: 'Impianti elettrici civili e industriali', abilitazioni: 'DM 37/2008, lettere A e B', tariffa: 32, referenteId: manuel.id } }).collaboratore;
    ids.collaboratore = iv.idSoggetto;
    const catColl = w.categoriaDiSistema('Documenti dei collaboratori');
    const docColl = (titolo, tipo, data) => w.salvaDocumento({ documento: { titolo, idCategoria: catColl.id, idSoggetto: iv.idSoggetto, dataDocumento: data,
      idFile: carica(titolo + '.pdf', pdf(titolo)), scadenza: { tipo } } });
    docColl('DURC', 'durc', piuGiorni(T, -113));
    docColl('Visura camerale', 'visura', piuGiorni(T, -30));
    docColl('Autocertificazione di idoneità', 'idoneita', piuGiorni(T, -60));
    docColl('Polizza RC', 'polizza', piuGiorni(T, -100));

    // ------------------------------------------------ mezzi
    w.salvaMezzo({ mezzo: { id: 1, proprieta: 'persona', idPersona: manuel.id } });
    // Immatricolato 3 anni e 7 mesi fa (il 22/10/2026: marzo 2023): la prima revisione e' fra 4 o 5 mesi, mai scaduta (un mezzo
    // con la revisione scaduta e' fermo e non si assegna: con la data fissa i dati di esempio si fermavano da aprile 2027).
    const doblo = w.salvaMezzo({ mezzo: { nome: 'Fiat Doblò', targa: 'GA123BC', tipo: 'furgone', proprieta: 'studio', immatricolazione: C.piuMesi(T, -43), alimentazione: 'gasolio',
      tagliandoKm: 15000, tagliandoUltimoKm: 75000, tagliandoOgniMesi: 12, note: 'Le chiavi di scorta sono nell\'armadio dell\'ufficio',
      scadenze: { assicurazione: piuGiorni(T, 14), bollo: piuGiorni(T, 120) } } }).mezzo;
    ids.doblo = doblo.id;
    // I km a fine anno: l'anno prima di un mese fa (nei primi giorni di gennaio quello prima ancora, se no 18.400 km in pochi
    // giorni sono troppi e segnaKm chiede conferma).
    const fineAnno = (Number(piuGiorni(T, -30).slice(0, 4)) - 1) + '-12-31';
    w.db.esegui("INSERT INTO mezzo_letture (veicolo_id, data, km, utente_id, origine, creato) VALUES (?, ?, 65920, ?, 'mano', ?)", doblo.id, fineAnno, utenti.titolare.id, adesso());
    w.segnaKm({ idVeicolo: doblo.id, km: 84320, data: piuGiorni(T, -4) });
    w.assegna({ idVeicolo: doblo.id, tipo: 'assegnato', idPersona: marco.id });

    // ------------------------------------------------ attrezzature e strumenti
    const strumento = (x, taratura) => w.salvaAttrezzatura({ attrezzatura: Object.assign({ categoria: 'strumento', idLaboratorio: lab.id }, x, taratura ? { ultimaTaratura: taratura } : {}) }).attrezzatura;
    const scadeMt = piuGiorni(T, 24);
    // Il certificato della fase 5 ("Certificato di taratura del misuratore di terra") si sceglie come certificato dello
    // strumento: la sua scadenza diventa quella della taratura (una cosa, una voce: fase6.md §4.6).
    const certMt = w.db.riga("SELECT id FROM documenti WHERE titolo = 'Certificato di taratura del misuratore di terra'");
    const mt = strumento({ nome: 'Misuratore di terra MT-500', marca: 'Esempio Strumenti', modello: 'MT-500', matricola: '22-0451', posizione: 'Armadio dell\'ufficio' },
      Object.assign({ data: C.piuMesi(scadeMt, -12), scade: scadeMt, certificato: 'LAT 1234/25' }, certMt ? { idDocumento: certMt.id } : {}));
    const ar = strumento({ nome: 'Analizzatore di rete AR-6', marca: 'Esempio Strumenti', modello: 'AR-6', matricola: 'AR6-0099' },
      { data: C.piuMesi(piuGiorni(T, 3), -12), scade: piuGiorni(T, 3), certificato: 'LAT 0981/25' });
    const pinza = strumento({ nome: 'Pinza amperometrica', marca: 'Esempio Strumenti', modello: 'PA-10', matricola: 'PA-7781' });
    const multi = strumento({ nome: 'Multimetro 87V', marca: 'Esempio Strumenti', modello: '87V', matricola: '6011-2381' },
      { data: '2025-10-12', scade: '2026-10-12', certificato: 'LAT 0777/24' });
    const guanti = strumento({ nome: 'Guanti isolanti classe 0', categoria: 'dpi', marca: 'Esempio DPI', matricola: 'G0-112', controllo: 'verifica', controlloOgniMesi: 6 },
      { data: C.piuMesi(piuGiorni(T, 70), -6), scade: piuGiorni(T, 70) });
    const imbracatura = strumento({ nome: 'Imbracatura anticaduta', categoria: 'dpi', marca: 'Esempio DPI', matricola: 'IMB-44', controllo: 'verifica', controlloOgniMesi: 12 },
      { data: C.piuMesi(piuGiorni(T, 200), -12), scade: piuGiorni(T, 200) });
    ids.attrezzature = { mt: mt.id, ar: ar.id, pinza: pinza.id, multi: multi.id, guanti: guanti.id, imbracatura: imbracatura.id };
    w.assegna({ idAttrezzatura: mt.id, tipo: 'assegnato', idPersona: marco.id });
    w.assegna({ idAttrezzatura: multi.id, tipo: 'assegnato', idPersona: marco.id });
    w.assegna({ idAttrezzatura: ar.id, tipo: 'laboratorio', idSoggetto: lab.id, rientro: piuGiorni(T, 7) });
    w.salvaConsegnaDpi({ consegna: { idPersona: marco.id, cosa: 'Guanti isolanti classe 0', taglia: '9', data: piuGiorni(T, -60), idAttrezzatura: guanti.id },
      firma: { base64: PNG_FIRMA, mime: 'image/png' } });
    w.salvaConsegnaDpi({ consegna: { idPersona: marco.id, cosa: 'Elmetto con visiera', taglia: 'unica', data: piuGiorni(T, -2) } });
    // L'imbracatura in prestito agli Impianti Veneti: doveva rientrare ieri (il prestito si scrive com'era quel giorno).
    w.assegna({ idAttrezzatura: imbracatura.id, tipo: 'prestito', idSoggetto: iv.idSoggetto, rientro: T });
    w.db.esegui('UPDATE assegnazioni SET rientro = ?, dal = ? WHERE attrezzatura_id = ? AND al IS NULL', piuGiorni(T, -1), istante(new Date(piuGiorni(T, -8) + 'T09:00:00')), imbracatura.id);

    // ------------------------------------------------ l'incarico agli Impianti Veneti e la sua fattura
    const inc = w.salvaIncarico({ incarico: { idSoggetto: iv.idSoggetto, idCommessa: '26ST001', titolo: 'Cablaggio quadri di linea 4 e 5',
      descrizione: 'Posa e cablaggio dei quadri di linea 4 e 5 secondo gli schemi dello studio', modo: 'corpo', compenso: 3200, dal: piuGiorni(T, -20), al: piuGiorni(T, 30) } }).incarico;
    w.affidaIncarico({ id: inc.id });
    w.aggiornaAvanzamento({ id: inc.id, avanzamento: 60 });
    ids.incarico = inc.id;
    w.salvaRicevuta({ ricevuta: { idFornitore: iv.idSoggetto, numero: '18/' + anno, data: piuGiorni(T, -5), imponibile: 1200, iva: 264, totale: 1464, categoria: 'servizi',
      descrizione: 'Acconto cablaggio quadri di linea 4 e 5', idIncarico: inc.id, scadenze: [{ data: piuGiorni(T, 100), importo: 1464 }] } });
  });

  // L'esterno di prova: Luca Sartori degli Impianti Veneti (password "prova").
  w.db.transazione(() => {
    const id = w.inserisci('utenti', { nome: 'Luca Sartori', email: 'luca@esempio.it', ruolo: 'esterno', soggetto_id: ids.collaboratore,
      password_hash: hashPasswordSync('prova'), attivo: 1, creato: adesso() }, 'id', 'utente esterno di prova');
    utenti.esterno = { id, nome: 'Luca Sartori', email: 'luca@esempio.it', ruolo: 'esterno' };
  });

  // Marco: il guasto del Doblò, gli strumenti nel rapportino del 16/10 (il multimetro scaduto, confermando), la richiesta di ferie.
  come('collaboratore', () => {
    w.segnalaGuasto({ guasto: { idVeicolo: ids.doblo, titolo: 'Spia della pressione delle gomme accesa', descrizione: 'Si accende dopo qualche km, le gomme sembrano a posto', km: 84350 } });
    w.db.esegui("UPDATE manutenzioni SET data = ? WHERE veicolo_id = ? AND tipo = 'guasto'", piuGiorni(T, -2), ids.doblo);
    const rap = w.db.riga("SELECT * FROM rapportini WHERE id_locale = 'marco-2'");
    if (rap) w.scriviStrumentiRapportino(rap, [{ idAttrezzatura: ids.attrezzature.mt }, { idAttrezzatura: ids.attrezzature.multi, confermato: true }]);
    // La settimana dopo la prossima (il primo lunedi' da oggi + 8: mai fra i 7 giorni delle urgenti), cinque giorni
    // tutti da lavorare (una settimana con un festivo, come quella dell'8 dicembre, passa alla dopo): 40 ore sempre.
    const settimanaPiena = l => C.giorniLavorativi(l, piuGiorni(l, 4), [1, 2, 3, 4, 5], C.festiviTra(l, piuGiorni(l, 4), '')) === 5;
    let lunedi = piuGiorni(T, 8);
    while (new Date(lunedi + 'T12:00:00').getDay() !== 1 || !settimanaPiena(lunedi)) lunedi = piuGiorni(lunedi, 1);
    w.salvaAssenza({ assenza: { tipo: 'ferie', dal: lunedi, al: piuGiorni(lunedi, 4), nota: 'Matrimonio di mio fratello' } });
  });

  // Laura: in ferie oggi e domani (approvate da Manuel), una malattia di un giorno la settimana scorsa (col certificato).
  // Le ferie cominciano sempre oggi, anche di sabato o in un giorno di festa (la Dashboard e l'organico la danno assente
  // qualunque giorno), e durano due giorni da lavorare: oggi e domani, o i primi due dopo la festa.
  come('amministrazione', () => {
    const primo = lavorativo(T, 1);
    const secondo = lavorativo(piuGiorni(primo, 1), 1);
    w.salvaAssenza({ assenza: { tipo: 'ferie', dal: T, al: secondo } });
    const m1 = lavorativo(piuGiorni(T, -9), -1);
    w.salvaAssenza({ assenza: { tipo: 'malattia', dal: m1, al: m1, protocollo: '123456789' } });
  });
  come('titolare', () => {
    const voci = w.db.righe("SELECT id FROM assenze WHERE stato = 'da_approvare' AND persona_id = ?", w.personaDiUtente(utenti.amministrazione.id).id).map(a => ({ tipo: 'assenza', id: a.id }));
    if (voci.length) w.decidi({ voci }, 'approva');
  });
}

/**
 * Il portale clienti, WhatsApp e le comunicazioni come nel prototipo della fase 7 (docs/prototipo/Gestionale-fase7.html),
 * aggiunti dopo tutto il resto, senza toccare id, numeri e conteggi di prima:
 *  - il portale acceso; l'indirizzo della pagina vuoto (Non collegato) se WISPER_PORTALE_INDIRIZZO non lo scrive (solo in
 *    prova); il telefono dello studio resta quello delle impostazioni di prima (vuoto, come semina() dello script);
 *  - Rossi Impianti Srl (C002) col portale acceso: Sig. Ferretti (f.ferretti@rossi.example, WhatsApp 333 000 1122 col si',
 *    gia' entrato, fatture 1) e Anna Rossi (amministrazione@rossi.example, invitata, paga le fatture); Batokyo Srl (C004):
 *    Giulia Neri (giulia.neri@batokyo.example, referente nuovo) limitata al Magazzino automatico; Mario Bianchi (C003)
 *    privato, entrato;
 *  - il preventivo PR/aaaa/014 per Rossi (il PR/aaaa/012 rev. 1 e' gia' accettato dalla fase 4: questo e' quello da
 *    accettare, con la voce facoltativa e il gruppo di alternative come nel prototipo), mandato con la copia del PDF e
 *    pubblicato dalla regola; pubblicati a mano il 012 rev. 1 accettato, il 007 scaduto, il RAP/aaaa/0004 da firmare, il
 *    collaudo firmato, lo schema unifilare della cabina, le fatture 39 e 45, il contratto CA/2026/002, le richieste
 *    TK/2026/0014 (coi messaggi) e TK/2026/0010 (chiusa); per Batokyo il contratto, la TK/2026/0013 e il verbale della
 *    terra (fuori dalla sede di Giulia Neri: lei non lo vede); per Mario Bianchi il rapportino firmato e la TK/2026/0012;
 *  - lo storico (email del preventivo, un WhatsApp mandato e uno preparato, una telefonata), una domanda sul preventivo,
 *    un file "Schema quadro QG2.pdf" da guardare, le notifiche, il registro degli accessi;
 *  - il sopralluogo alla cabina il prossimo giorno lavorativo con "Avvisa il cliente: WhatsApp" a Sig. Ferretti (il
 *    promemoria e' in Da mandare › Oggi dalle 8:00).
 * Gli id nuovi (referente, pubblicazioni, attivita') stanno nel file "pronto" per gli altri costruttori.
 */
function seminaFase7(w, utenti, come) {
  const T = oggi();
  const quando = ms => istante(new Date(ms));
  const ora = adessoMs();
  const giorni = n => ora - n * 86400000;
  const pdf = nome => Buffer.from('%PDF-1.4\n% Documento di esempio: ' + nome + '\n%%EOF\n', 'utf8');
  const ids = {};
  // L'indirizzo della pagina del portale: vuoto come sul NAS appena acceso (Non collegato: le prove di telefono e computer
  // contano sui link della fase 5 "Non collegato"); WISPER_PORTALE_INDIRIZZO lo scrive, solo in prova, per provare la
  // pagina, gli inviti e le pubblicazioni (per esempio http://localhost:8790).
  const indirizzo = String(process.env.WISPER_PORTALE_INDIRIZZO || '').replace(/\/+$/, '');
  const ref = nome => w.db.riga('SELECT * FROM referenti WHERE nome = ? ORDER BY id LIMIT 1', nome);
  const pubblica = (tipo, rif, soggetto, x) => w.pubblicaInterna(Object.assign({ tipo, rif, soggetto, origine: 'mano' }, x || {})).id;
  const retro = (tabella, id, campi) => {
    const k = Object.keys(campi);
    w.db.esegui('UPDATE ' + tabella + ' SET ' + k.map(c => c + ' = ?').join(', ') + ' WHERE id = ?', ...k.map(c => campi[c]), id);
  };
  const permessi = o => JSON.stringify(Object.assign({ preventivi: 2, rapportini: 2, fatture: 0, documenti: 2, richieste: 2 }, o));

  come('titolare', () => {
    // ------------------------------------------------ il portale acceso, il telefono dello studio
    w.salvaImpostazioni({ PORTALE_ATTIVO: true, PORTALE_INDIRIZZO: indirizzo });

    // ------------------------------------------------ i clienti e i referenti col portale
    for (const id of ['C002', 'C003', 'C004']) w.aggiorna('soggetti', id, { portale: 1, modificato: adesso() }, 'id', 'portale acceso per il cliente');
    const ferretti = ref('Sig. Ferretti');
    w.aggiorna('referenti', ferretti.id, {
      email: 'f.ferretti@rossi.example', whatsapp: '333 000 1122', whatsapp_ok: 1, whatsapp_ok_il: piuGiorni(T, -8), portale: 1, portale_permessi: permessi({ fatture: 1 }),
      portale_invitato_il: quando(giorni(8)), portale_dal: quando(giorni(7)), ultimo_accesso: quando(ora - 25 * 60000), informativa_il: quando(giorni(7)),
      informativa_versione: '2026-10-22',
    }, 'id', 'invito al portale per f.ferretti@rossi.example');
    const anna = ref('Anna Rossi');
    w.aggiorna('referenti', anna.id, { email: 'amministrazione@rossi.example', pagamenti: 1, portale: 1, portale_invitato_il: quando(giorni(2)),
      portale_permessi: permessi({ preventivi: 1, rapportini: 1, fatture: 1, documenti: 1, richieste: 0 }) }, 'id', 'invito al portale per amministrazione@rossi.example');
    const magazzino = w.db.riga("SELECT id FROM sedi WHERE soggetto_id = 'C004' AND nome = 'Magazzino automatico'").id;
    const giulia = w.salvaReferente({ idSoggetto: 'C004', nome: 'Giulia Neri', ruolo: 'Responsabile manutenzione', telefono: '340 000 4455', email: 'giulia.neri@batokyo.example' });
    w.aggiorna('referenti', giulia.id, { portale: 1, portale_permessi: permessi({}), portale_sedi: JSON.stringify([magazzino]), portale_invitato_il: quando(giorni(5)),
      portale_dal: quando(giorni(4)), ultimo_accesso: quando(giorni(1)), informativa_il: quando(giorni(4)), informativa_versione: '2026-10-22' }, 'id', 'invito al portale per giulia.neri@batokyo.example');
    const mario = ref('Mario Bianchi');
    w.aggiorna('referenti', mario.id, { email: 'mario.bianchi@example.com', portale: 1, portale_permessi: permessi({ fatture: 1 }), portale_invitato_il: quando(giorni(6)),
      portale_dal: quando(giorni(6)), ultimo_accesso: quando(giorni(3)), informativa_il: quando(giorni(6)), informativa_versione: '2026-10-22' }, 'id', 'invito al portale per mario.bianchi@example.com');
    ids.referenti = { ferretti: ferretti.id, anna: anna.id, giulia: giulia.id, mario: mario.id };

    // ------------------------------------------------ PR/aaaa/014: da accettare, con la facoltativa e le alternative
    const L = codice => w.leggiListino(true).find(v => v.codice === codice).id;
    const cabina = w.db.riga("SELECT id FROM sedi WHERE soggetto_id = 'C002' AND nome = 'Cabina MT Acme'").id;
    const p14 = w.salvaPreventivo({ idCliente: 'C002', idSede: cabina, idReferente: ferretti.id, oggetto: 'Adeguamento delle protezioni della cabina MT',
      introduzione: 'Come concordato al sopralluogo, ecco la proposta per l\'adeguamento delle protezioni della cabina MT.', complessita: 'media',
      oneriPrevisti: 'Pratiche presso il distributore di energia, a carico del cliente', data: piuGiorni(T, -7), scadenza: piuGiorni(T, 6),
      condizioni: 'Il compenso è quello delle voci, a corpo o a ore come scritto. Le voci facoltative si pagano solo se scelte.',
      sezioni: [{ titolo: 'Cantiere', voci: [
        { idListino: L('DL'), descrizione: 'Direzione lavori', quantita: 16 },
        { idListino: L('DIRI'), descrizione: 'Dichiarazione di rispondenza', facoltativa: true, scelta: false },
        { idListino: L('COL'), descrizione: 'Collaudo con strumenti propri', alternativa: 'collaudo', scelta: true },
        { descrizione: 'Collaudo con laboratorio esterno', prezzo: 620, alternativa: 'collaudo', scelta: false }] }],
      scadenzePagamento: [{ tipo: 'percentuale', valore: 30, quando: 'firma' }, { tipo: 'percentuale', valore: 40, quando: 'avanzamento', descrizione: '40% a fine progetto' },
        { tipo: 'percentuale', valore: 30, quando: 'fine', descrizione: 'Saldo a fine lavori' }] }, { numero: 14 });
    w.segnaInviato({ id: p14.id });
    const inviatoIl = quando(giorni(7) + 3 * 3600000);
    retro('preventivi', p14.id, { inviato_il: inviatoIl, creato: quando(giorni(7)), modificato: inviatoIl });
    // La copia del PDF mandato (come inviaPreventivo): il cliente la scarica dal portale.
    const copie = w.copiaInviati({ allegati: [{ nome: 'PR-' + T.slice(0, 4) + '-014 Rossi Impianti Srl.pdf', mime: 'application/pdf', base64: pdf('PR/014').toString('base64') }],
      a: 'f.ferretti@rossi.example', idCliente: 'C002', idCommessa: '' });
    const fileP14 = w.fileValidoDocumento(copie[0]);
    w.db.esegui("UPDATE portale_pubblicazioni SET file_id = ?, pubblicata_il = ?, avviso_da = NULL, avvisato_il = ? WHERE tipo = 'preventivo' AND rif = ?", fileP14, inviatoIl, inviatoIl, String(p14.id));
    w.scriviComunicazione({ quando: inviatoIl, canale: 'email', tipo: 'preventivo', cliente_id: 'C002', referente_id: ferretti.id, preventivo_id: p14.id, a: 'f.ferretti@rossi.example',
      oggetto: 'Preventivo ' + p14.etichetta, testo: 'In allegato il preventivo.', allegati: [{ nome: 'PR-' + T.slice(0, 4) + '-014 Rossi Impianti Srl.pdf', byte: pdf('PR/014').length }],
      documento_id: copie[0], stato: 'mandato' });
    ids.preventivo = p14.id;

    // ------------------------------------------------ le altre cose di Rossi nel portale
    const prev = numero => w.db.riga('SELECT id FROM preventivi WHERE numero LIKE ? ORDER BY revisione DESC LIMIT 1', '%/' + numero).id;
    const rap = idLocale => w.db.riga('SELECT id FROM rapportini WHERE id_locale = ?', idLocale).id;
    const fattura = numero => w.db.riga('SELECT id FROM fatture WHERE numero = ?', numero).id;
    // Per titolo, non per numero: i ticket della fase 5 aperti "adesso" prendono il numero dell'anno di oggi (TK/2027/... a gennaio).
    const ticket = titolo => w.db.riga('SELECT id FROM ticket WHERE titolo = ? ORDER BY id LIMIT 1', titolo).id;
    const T14 = 'Scatta il generale MT';
    const T10 = 'Presa del quadro bruciata';
    const T13 = 'Navetta 2 si ferma in errore';
    const T12 = 'Inverter in errore di isolamento';
    const pub = {};
    pub.preventivo = w.db.riga("SELECT id FROM portale_pubblicazioni WHERE tipo = 'preventivo' AND rif = ?", String(p14.id)).id;
    pub.preventivoAccettato = pubblica('preventivo', prev('012'), 'C002');
    pub.preventivoScaduto = pubblica('preventivo', prev('007'), 'C002');
    pub.rapportinoDaFirmare = pubblica('rapportino', rap('seme-4'), 'C002', { daFirmare: true });
    pub.rapportinoFirmato = pubblica('rapportino', rap('seme-f4-rossi-1'), 'C002');
    pub.rapportinoTk10 = pubblica('rapportino', rap('seme-f5-tk10'), 'C002');
    pub.documento = pubblica('documento', w.db.riga("SELECT id FROM documenti WHERE titolo = 'Schema unifilare cabina MT'").id, 'C002');
    pub.fattura45 = pubblica('fattura', fattura('45/2026'), 'C002');
    pub.fattura39 = pubblica('fattura', fattura('39/2026'), 'C002');
    pub.contratto = pubblica('contratto', w.db.riga("SELECT id FROM contratti WHERE titolo = 'Manutenzione cabina MT Acme'").id, 'C002', { origine: 'regola' });
    for (const n of [T14, T10]) w.aggiorna('ticket', ticket(n), { portale_visibile: 1 }, 'id', 'mostrato nel portale');
    pub.richiesta = pubblica('ticket', ticket(T14), 'C002');
    pub.richiestaChiusa = pubblica('ticket', ticket(T10), 'C002');
    // Batokyo (Giulia Neri vede solo il Magazzino automatico: il verbale della terra no).
    w.aggiorna('ticket', ticket(T13), { portale_visibile: 1 }, 'id', 'mostrato nel portale');
    pub.batokyoRichiesta = pubblica('ticket', ticket(T13), 'C004');
    pub.batokyoContratto = pubblica('contratto', w.db.riga("SELECT id FROM contratti WHERE titolo = 'Assistenza magazzino automatico'").id, 'C004', { origine: 'regola' });
    pub.batokyoVerbale = pubblica('documento', w.db.riga("SELECT id FROM documenti WHERE titolo = 'Verbale verifica impianto di terra 2022'").id, 'C004');
    // Mario Bianchi.
    w.aggiorna('ticket', ticket(T12), { portale_visibile: 1 }, 'id', 'mostrato nel portale');
    pub.marioRapportino = pubblica('rapportino', rap('seme-f5-tk12'), 'C003');
    pub.marioRichiesta = pubblica('ticket', ticket(T12), 'C003');
    // Le date: pubblicate nei giorni scorsi (gli avvisi sono gia' partiti), il 012 rev. 1 visto da Ferretti ieri.
    let i = 0;
    for (const k of Object.keys(pub)) {
      if (k === 'preventivo') continue;
      w.db.esegui('UPDATE portale_pubblicazioni SET pubblicata_il = ?, avviso_da = NULL, avvisato_il = ? WHERE id = ?', quando(giorni(6) + (i++) * 600000), quando(giorni(6) + i * 600000), pub[k]);
    }
    w.db.esegui('UPDATE portale_pubblicazioni SET visto_il = ?, visto_da = ? WHERE id = ?', quando(giorni(1) - 6 * 60000), ferretti.id, pub.preventivoAccettato);
    w.db.esegui('UPDATE portale_pubblicazioni SET visto_il = ?, visto_da = ? WHERE id = ?', quando(giorni(5)), ferretti.id, pub.fattura45);
    ids.pubblicazioni = pub;

    // ------------------------------------------------ lo storico: un WhatsApp mandato, uno preparato, una telefonata
    const tk14 = ticket(T14);
    w.scriviComunicazione({ quando: quando(giorni(2) - 2 * 3600000), canale: 'whatsapp', tipo: 'promemoria_appuntamento', modello: 'promemoria_appuntamento', cliente_id: 'C002',
      referente_id: ferretti.id, commessa_id: '26ST002', a: '+39 333 000 1122', stato: 'mandato',
      testo: 'Buongiorno Sig. Ferretti, le ricordo l\'appuntamento di domani alle 9:00 presso Capannone: Collaudo quadro. Se non va più bene mi scriva pure. Manuel Gasparotto · Studio Tecnico GM' });
    w.scriviComunicazione({ quando: quando(giorni(1)), canale: 'whatsapp', tipo: 'libero', modello: 'libero', cliente_id: 'C002', referente_id: ferretti.id, ticket_id: tk14,
      a: '+39 333 000 1122', stato: 'preparato', testo: 'Buongiorno Sig. Ferretti, domani mattina passiamo a vedere il generale della cabina. Manuel Gasparotto · Studio Tecnico GM' });
    w.scriviComunicazione({ quando: quando(giorni(3)), canale: 'telefonata', direzione: 'entrata', tipo: 'libero', cliente_id: 'C002', referente_id: anna.id, stato: 'ricevuto',
      testo: 'Chiede quando arriva la fattura del 40% di 26ST003' });
    // La risposta dello studio nella richiesta TK/2026/0014 (pubblica, la vede il cliente).
    w.scriviComunicazione({ quando: quando(ora - 70 * 60000), canale: 'portale', tipo: 'messaggio', cliente_id: 'C002', ticket_id: tk14, pubblica: 1, stato: 'mandato',
      testo: 'Abbiamo ricevuto la richiesta: la chiamiamo entro mezz\'ora per organizzare l\'intervento.' });

    // ------------------------------------------------ l'attivita' del prossimo giorno lavorativo con l'avviso al cliente
    let domani = piuGiorni(T, 1);
    while ([0, 6].indexOf(new Date(domani + 'T12:00:00').getDay()) >= 0) domani = piuGiorni(domani, 1);
    const sopralluogo = w.salvaAttivita({ attivita: { titolo: 'Sopralluogo protezioni cabina MT Acme', tipo: 'sopralluogo', idCliente: 'C002', assegnataA: utenti.titolare.id,
      inizio: domani + 'T09:00:00', fine: domani + 'T10:30:00', luogo: 'Cabina MT Acme, Zanè', avvisaCliente: 'whatsapp', idReferenteAvviso: ferretti.id }, conferma: true }).attivita;
    ids.attivita = sopralluogo.id;
  });

  // ------------------------------------------------ quello che arriva dal portale: lo fa il referente (le notifiche vanno allo studio)
  const comeReferente = (r, fn) => w.come({ utente: null, permessi: null, app: 'portale', dispNome: 'Portale · Chrome · Android', azione: 'portale',
    portale: { nome: r.nome, referenteId: r.id, soggettoId: r.soggetto_id } }, () => w.db.transazione(fn));
  const ferretti = w.db.riga('SELECT * FROM referenti WHERE id = ?', ids.referenti.ferretti);
  comeReferente(ferretti, () => {
    const tk14 = w.db.riga("SELECT * FROM ticket WHERE titolo = 'Scatta il generale MT' ORDER BY id LIMIT 1");
    const testo = 'Va bene, vi aspetta il custode al cancello nord.';
    w.scriviComunicazione({ quando: quando(ora - 40 * 60000), canale: 'portale', direzione: 'entrata', tipo: 'messaggio', stato: 'ricevuto', pubblica: 1, cliente_id: 'C002',
      referente_id: ferretti.id, ticket_id: tk14.id, testo, utente_id: null });
    w.daGuardare('messaggio', tk14.id, 'C002', ferretti.id, 'Messaggio di Sig. Ferretti su ' + tk14.numero, testo);
    w.notifica(w.utentiDeiRuoli(['titolare', 'amministrazione']), 'messaggio_portale', 'Messaggio di Sig. Ferretti su ' + tk14.numero, testo, { pagina: 'ticket', id: tk14.id });
    // La domanda sul preventivo PR/aaaa/014.
    const p14 = w.db.riga('SELECT * FROM preventivi WHERE id = ?', ids.preventivo);
    const domanda = 'Il collaudo esterno comprende la relazione?';
    w.scriviComunicazione({ quando: quando(ora - 3 * 3600000), canale: 'portale', direzione: 'entrata', tipo: 'domanda', stato: 'ricevuto', cliente_id: 'C002', referente_id: ferretti.id,
      preventivo_id: p14.id, testo: domanda, utente_id: null });
    w.daGuardare('domanda', p14.id, 'C002', ferretti.id, 'Domanda sul preventivo ' + p14.numero, 'Sig. Ferretti · ' + domanda);
    w.notifica(w.utentiDeiRuoli(['titolare', 'amministrazione']), 'domanda', 'Domanda sul preventivo ' + p14.numero, 'Sig. Ferretti · ' + domanda, { pagina: 'preventivo', id: p14.id });
    // Il file mandato allo studio: Schema quadro QG2.pdf, da guardare.
    const dati = pdf('Schema quadro QG2');
    const f = w.salvaFile({ dati, nome: 'Schema quadro QG2.pdf', mime: 'application/pdf', tipo: 'portale' });
    const idC = w.inserisci('portale_caricamenti', { file_id: f.id, soggetto_id: 'C002', referente_id: ferretti.id, per: 'documento', titolo: 'Schema quadro QG2',
      nota: 'Versione aggiornata dal nostro ufficio', nome_originale: 'Schema quadro QG2.pdf', estensione: 'pdf', byte: dati.length, stato: 'da_guardare', creato: quando(ora - 2 * 3600000) });
    w.db.esegui('UPDATE file SET caricamento_id = ? WHERE id = ?', idC, f.id);
    w.daGuardare('caricamento', idC, 'C002', ferretti.id, 'Schema quadro QG2.pdf', 'Rossi Impianti Srl · Sig. Ferretti · 0,1 MB');
    w.notifica(w.utentiDeiRuoli(['titolare', 'amministrazione']), 'file_portale', 'File dal portale: Schema quadro QG2.pdf', 'Rossi Impianti Srl · 0,1 MB', { pagina: 'caricamento', id: idC });
    ids.caricamento = idC;
    // Il registro degli accessi: gli ingressi di Ferretti e quello che ha guardato.
    const a = (azione, ms, oggetto) => w.accessoPortale({ quando: quando(ms), referente_id: ferretti.id, soggetto_id: 'C002', azione, oggetto: oggetto || '', agente: 'Chrome · Android' });
    a('entrato', giorni(1) - 8 * 60000);
    a('visto', giorni(1) - 6 * 60000, 'preventivo:' + ids.pubblicazioni.preventivoAccettato);
    a('entrato', ora - 3 * 3600000 - 60000);
    a('domanda', ora - 3 * 3600000, 'preventivo:' + ids.pubblicazioni.preventivo);
    a('caricato', ora - 2 * 3600000, 'Schema quadro QG2.pdf');
    a('entrato', ora - 25 * 60000);
  });
  // Le date di Da guardare e delle notifiche: quando sono successe.
  w.db.esegui("UPDATE portale_da_guardare SET creato = ? WHERE tipo = 'messaggio'", quando(ora - 40 * 60000));
  w.db.esegui("UPDATE portale_da_guardare SET creato = ? WHERE tipo = 'domanda'", quando(ora - 3 * 3600000));
  w.db.esegui("UPDATE portale_da_guardare SET creato = ? WHERE tipo = 'caricamento'", quando(ora - 2 * 3600000));
  return ids;
}

/** Una firma di esempio (un PNG 1x1). */
const PNG_FIRMA = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';


/**
 * Documenti, ticket e assistenza come nel prototipo della fase 5
 * (docs/prototipo/Gestionale-fase5.html, oggi = 22/10/2026):
 *  - Batokyo Srl (C004) e gli impianti 4-9 del prototipo (Cabina MT Acme di
 *    Rossi Impianti, il magazzino e l'impianto di terra di Batokyo, il
 *    fotovoltaico di Mario Bianchi, il quadro di linea 3 di Elettrodinamica);
 *  - i contratti CA/2026/001 (Batokyo, solo visite), CA/2026/002 (cabina MT
 *    Acme, visite e guasti, tacito: la disdetta entro il 01/11/2026) e
 *    CA/2025/004 (fotovoltaico, in scadenza), attivi: le loro commesse
 *    "Assistenza ..." (26ST004-26ST006, a corpo) e le rate del canone segnate
 *    fatturate fuori da Wisper (come nel prototipo, gia' fatturate);
 *  - i ticket TK/2026/0009-0014 (0014 urgente aperto stamattina sulla cabina,
 *    0013 in carico a Marco con l'intervento di oggi alle 14:30, 0012 risolto
 *    col rapportino firmato da Mario Bianchi, da chiudere, 0011 in attesa,
 *    0010 chiuso e fatturato, 0009 chiuso "non si fattura") e i programmati
 *    nati dalle visite dei contratti (0015 la manutenzione della cabina del 20/11);
 *  - documenti con revisioni (lo schema unifilare della cabina: rev. 3 da
 *    approvare), una DiCo, un verbale DPR 462 con la sua scadenza, il
 *    contratto firmato (vede: costi), collegamenti OneDrive, Google Drive, un
 *    sito e un percorso dello studio, tre documenti da classificare, un
 *    certificato che scade fra poco, un modello dello studio;
 *  - le scadenze: protezioni SPG/SPI scadute, DPR 462 di Batokyo (12/01/2027),
 *    la disdetta del contratto, le visite.
 * I giorni dei ticket aperti sono contati da adesso (la Dashboard ha sempre
 * l'urgente di stamattina); quelli chiusi hanno le date del prototipo.
 */
function seminaFase5(w, utenti, come) {
  const quando = (giorno, ora) => istante(new Date(giorno + 'T' + ora));
  const T = oggi();
  const ieri = piuGiorni(T, -1);
  const pdf = nome => Buffer.from('%PDF-1.4\n% Documento di esempio: ' + nome + '\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n', 'utf8');
  /** Un file come se fosse arrivato con /carica, di quella persona. */
  const carica = (nome, mime, dati, chi) => {
    const f = w.salvaFile({ dati, nome, mime, tipo: 'caricato' });
    w.db.esegui('UPDATE file SET caricato_da = ? WHERE id = ?', (chi || utenti.titolare).id, f.id);
    return f.id;
  };
  // La cronologia dei ticket con le ore di quando sono successe le cose (solo qui, per i dati di esempio).
  let orologio = null;
  w.eventoTicket = function (idTicket, frase) {
    const c = this.chi();
    this.db.esegui('INSERT INTO ticket_eventi (ticket_id, quando, utente_id, testo) VALUES (?, ?, ?, ?)', idTicket, orologio || adesso(), c.utente ? c.utente.id : null, frase);
  };
  const retrodata = (tabella, id, campi) => {
    const k = Object.keys(campi);
    w.db.esegui('UPDATE ' + tabella + ' SET ' + k.map(c => c + ' = ?').join(', ') + ' WHERE id = ?', ...k.map(c => campi[c]), id);
  };
  const ids = {};

  come('titolare', () => {
    // ------------------------------------------------ Batokyo Srl, i referenti, gli impianti 4-9
    w.salvaSoggetto({ nome: 'Batokyo Srl', partitaIva: partitaIvaDiProva('0135792468'), email: 'tecnico@batokyo.example', indirizzo: 'Zona industriale 4',
      cap: '36015', citta: 'Schio', provincia: 'VI', codiceSdi: 'BTK0001' });
    w.salvaSoggetto({ id: 'C003', pagaViaggio: false });
    const ferretti = w.salvaReferente({ idSoggetto: 'C002', nome: 'Sig. Ferretti', ruolo: 'Manutenzione Acme', telefono: '0445 000201' }).id;
    const anna = w.salvaReferente({ idSoggetto: 'C002', nome: 'Anna Rossi', ruolo: 'Acquisti', telefono: '0445 000004' }).id;
    const ufficio = w.salvaReferente({ idSoggetto: 'C004', nome: 'Ufficio tecnico Batokyo', ruolo: 'Ufficio tecnico', email: 'tecnico@batokyo.example', telefono: '0445 000301' }).id;
    w.salvaReferente({ idSoggetto: 'C003', nome: 'Mario Bianchi', ruolo: 'Proprietario', telefono: '333 0000123' });
    const imp = x => w.salvaSede(Object.assign({ tipo: 'impianto', provincia: 'VI', ambiente: 'ordinario' }, x)).id;
    ids.cabina = imp({ idSoggetto: 'C002', nome: 'Cabina MT Acme', indirizzo: 'Via dell\'Artigianato 9', cap: '36010', citta: 'Zanè', categoria: 'cabina_mt',
      potenza: '630 kVA', tensione: '15 kV / 400 V', messaInServizio: '2014-05-20', referenteId: ferretti, matricola: 'TR-2014-0571',
      datiTecnici: 'Trasformatore in resina, due scomparti MT' });
    ids.quadroRossi = imp({ idSoggetto: 'C002', nome: 'Quadro generale capannone', indirizzo: 'Via Nuova 3', cap: '36061', citta: 'Bassano del Grappa', categoria: 'quadro',
      potenza: '250 A', tensione: '400 V', messaInServizio: '2019-03-11', referenteId: anna });
    ids.magazzino = imp({ idSoggetto: 'C004', nome: 'Magazzino automatico', indirizzo: 'Zona industriale', cap: '36015', citta: 'Schio', categoria: 'automazione',
      tensione: '400 V', messaInServizio: '2023-09-04', referenteId: ufficio, matricola: 'MAG-02', datiTecnici: 'Due navette, PLC di linea' });
    ids.terra = imp({ idSoggetto: 'C004', nome: 'Impianto di terra stabilimento', indirizzo: 'Zona industriale', cap: '36015', citta: 'Schio', categoria: 'terra',
      messaInServizio: '2012-01-12', referenteId: ufficio });
    ids.fotovoltaico = imp({ idSoggetto: 'C003', nome: 'Impianto fotovoltaico 6 kW', indirizzo: 'Via Montegrappa 8', cap: '36063', citta: 'Marostica', categoria: 'fotovoltaico',
      potenza: '6 kW', tensione: '230 V', messaInServizio: '2021-06-30', matricola: 'INV-6K-2231', datiTecnici: 'Inverter monofase' });
    ids.linea3 = imp({ idSoggetto: 'C001', nome: 'Quadro di linea 3', indirizzo: 'Via dell\'Industria 12', cap: '36016', citta: 'Thiene', categoria: 'quadro',
      tensione: '400 V', messaInServizio: '2024-02-15' });

    // ------------------------------------------------ i contratti: in bozza, poi attivi (le visite fanno nascere i programmati dopo i ticket)
    const c1 = w.salvaContratto({ contratto: { idCliente: 'C004', titolo: 'Assistenza magazzino automatico', dal: '2026-03-01', al: '2027-02-28', rinnovo: 'no',
      canone: 2400, fatturazioneCanone: 'annuale', copre: 'visite', tariffaExtra: 45, impianti: [{ idSede: ids.magazzino, ogniMesi: 3, primaVisita: '2026-12-01' }] } }).contratto;
    const c2 = w.salvaContratto({ contratto: { idCliente: 'C002', titolo: 'Manutenzione cabina MT Acme', dal: '2026-01-01', al: '2026-12-31', rinnovo: 'tacito',
      disdettaGiorni: 60, canone: 1200, fatturazioneCanone: 'semestrale', copre: 'visite_guasti', tariffaExtra: 45, tempi: { urgente: { presa: 1, intervento: 4 } },
      impianti: [{ idSede: ids.cabina, ogniMesi: 6, primaVisita: '2026-11-20' }] } }).contratto;
    const c3 = w.salvaContratto({ contratto: { idCliente: 'C003', titolo: 'Controllo annuale fotovoltaico', dal: '2025-11-01', al: '2026-10-31', rinnovo: 'no',
      canone: 120, fatturazioneCanone: 'annuale', copre: 'visite', impianti: [{ idSede: ids.fotovoltaico, ogniMesi: 12, primaVisita: '2026-10-28' }] } }, { numero: 4 }).contratto;

    w.generaTicketDaScadenze = () => 0;
    for (const c of [c1, c2, c3]) w.attivaContratto({ id: c.id });
    delete w.generaTicketDaScadenze;
    // Le rate del canone di questi periodi sono gia' fatturate (prima di Wisper).
    const rate = w.db.righe('SELECT id FROM scadenze_pagamento WHERE contratto_id IS NOT NULL');
    w.segnaFatturataFuori({ voci: rate.map(r => ({ tipo: 'scadenza', id: r.id })), nota: 'canoni fatturati prima di Wisper' });
    ids.c1 = c1.id;
    ids.c2 = c2.id;
    ids.c3 = c3.id;

    // ------------------------------------------------ i ticket TK/2026/0009 ... 0014 (gli id come nel prototipo)
    w.db.esegui("INSERT INTO sqlite_sequence (name, seq) SELECT 'ticket', 8 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'ticket')");
    const tk = (x, numero) => w.salvaTicket({ ticket: Object.assign({ numero }, x) }).ticket;
    orologio = quando('2026-10-09', '15:00:00');
    ids.tk9 = tk({ idCliente: 'C004', idSede: ids.magazzino, titolo: 'Domanda sulla selettività degli interruttori', tipo: 'assistenza', origine: 'telefono',
      impatto: 'nessuno', urgenza: 'quando_si_puo', responsabileId: utenti.collaboratore.id, apertoIl: '2026-10-09T15:00:00', richiedente: 'Ufficio tecnico Batokyo' }, 'TK/2026/0009').id;
    orologio = quando('2026-10-12', '08:05:00');
    ids.tk10 = tk({ idCliente: 'C002', idSede: ids.quadroRossi, titolo: 'Presa del quadro bruciata', tipo: 'guasto', origine: 'telefono', impatto: 'ridotto', urgenza: 'subito',
      responsabileId: utenti.titolare.id, apertoIl: '2026-10-12T08:05:00', idReferente: anna }, 'TK/2026/0010').id;
    orologio = quando('2026-10-15', '11:00:00');
    ids.tk11 = tk({ idCliente: 'C001', idSede: ids.linea3, titolo: 'Aggiungere un\'uscita al PLC', descrizione: 'Serve un\'uscita in più per la nuova sirena di linea.',
      tipo: 'piccolo', origine: 'sopralluogo', impatto: 'nessuno', urgenza: 'quando_si_puo', responsabileId: utenti.titolare.id, apertoIl: '2026-10-15T11:00:00',
      richiedente: 'Giulia Bianchi' }, 'TK/2026/0011').id;
    orologio = quando('2026-10-15', '11:30:00');
    w.sospendiTicket({ id: ids.tk11, motivo: 'Aspetta il modulo di uscite dal fornitore' });
    orologio = quando('2026-10-20', '09:15:00');
    ids.tk12 = tk({ idCliente: 'C003', idSede: ids.fotovoltaico, titolo: 'Inverter in errore di isolamento',
      descrizione: 'L\'inverter si spegne la mattina con l\'errore di isolamento e riparte a mezzogiorno.', tipo: 'guasto', origine: 'telefono',
      impatto: 'ridotto', urgenza: 'presto', apertoIl: '2026-10-20T09:15:00', richiedente: 'Mario Bianchi · 333 0000123' }, 'TK/2026/0012').id;
    orologio = quando('2026-10-20', '09:16:00');
    w.prendiTicket({ id: ids.tk12 });
    orologio = quando(ieri, '16:10:00');
    ids.tk13 = tk({ idCliente: 'C004', idSede: ids.magazzino, titolo: 'Navetta 2 si ferma in errore',
      descrizione: 'La navetta 2 va in errore di posizione due o tre volte al giorno. La linea va avanti con la navetta 1.', tipo: 'guasto', origine: 'email',
      impatto: 'ridotto', urgenza: 'subito', apertoIl: ieri + 'T16:10:00', richiedente: 'Ufficio tecnico Batokyo', idReferente: ufficio, rifCliente: 'Richiesta 4471' }, 'TK/2026/0013').id;
    const apertoTk14 = new Date(adessoMs() - 85 * 60000);
    orologio = istante(apertoTk14);
    ids.tk14 = tk({ idCliente: 'C002', idSede: ids.cabina, titolo: 'Scatta il generale MT',
      descrizione: 'Il generale della cabina scatta appena lo riarmano. Lo stabilimento è fermo.', tipo: 'guasto', origine: 'telefono', impatto: 'fermo', urgenza: 'subito',
      apertoIl: istante(apertoTk14), richiedente: 'Sig. Ferretti, manutenzione Acme', idReferente: ferretti }, 'TK/2026/0014').id;
    w.caricaFile({ tipo: 'ticket', idTicket: ids.tk14, base64: SCONTRINO, mime: 'image/png', nome: 'Quadro MT.png', idFile: 'foto-tk14-1' });
  });

  // TK/2026/0013: lo prende Marco e pianifica l'intervento di oggi alle 14:30 (accanto al sopralluogo della fase 2).
  come('collaboratore', () => {
    orologio = quando(ieri, '16:25:00');
    w.prendiTicket({ id: ids.tk13 });
    orologio = quando(ieri, '16:27:00');
    w.pianificaTicket({ id: ids.tk13, inizio: T + 'T14:30:00', fine: T + 'T16:00:00', conferma: true });
  });

  come('titolare', () => {
    // TK/2026/0012: l'intervento del 21/10, il rapportino firmato da Mario Bianchi coi fusibili, risolto (da chiudere).
    orologio = quando('2026-10-20', '09:20:00');
    const att = w.pianificaTicket({ id: ids.tk12, inizio: '2026-10-21T09:00:00', fine: '2026-10-21T11:30:00', conferma: true }).attivita;
    orologio = quando('2026-10-21', '11:30:00');
    const r12 = w.salvaRapportino({ idLocale: 'seme-f5-tk12', idTicket: ids.tk12, tecnico: 'Manuel Gasparotto', data: '2026-10-21', idCliente: 'C003',
      idCommessa: w.db.riga('SELECT commessa_id FROM ticket WHERE id = ?', ids.tk12).commessa_id, luogo: 'Via Montegrappa 8, Marostica',
      descrizione: 'Cambiati i fusibili della stringa 2, isolamento a posto', oreLavoro: 2, oreViaggio: 0.5, km: 24, tariffa: 45, spese: 18.5, noteSpese: 'Fusibili e portafusibili' });
    const spesa = w.db.riga('SELECT id FROM spese WHERE rapportino_id = ? AND dal_rapportino = 1', r12.id);
    w.salvaSpesa({ id: spesa.id, categoria: 'materiale' });
    w.faiAttivita({ id: att.id, fatta: true });
    orologio = quando('2026-10-21', '11:40:00');
    w.caricaFile({ tipo: 'firma', id: r12.id, base64: SCONTRINO, mime: 'image/png', idFile: 'firma-f5-tk12', firmatario: 'Mario Bianchi', firmatoIl: '2026-10-21T11:40:00' });
    w.caricaFile({ tipo: 'ticket', idTicket: ids.tk12, base64: SCONTRINO, mime: 'image/png', nome: 'Inverter.png', idFile: 'foto-tk12-1' });
    w.caricaFile({ tipo: 'ticket', idTicket: ids.tk12, base64: SCONTRINO, mime: 'image/png', nome: 'Fusibili.png', idFile: 'foto-tk12-2' });
    orologio = quando('2026-10-21', '11:41:00');
    w.risolviTicket({ id: ids.tk12, esito: 'cambiati i fusibili della stringa 2, isolamento a posto' });
    retrodata('rapportini', r12.id, { creato: quando('2026-10-21', '11:30:00') });
    retrodata('ticket', ids.tk12, { preso_il: quando('2026-10-20', '09:16:00'), risolto_il: quando('2026-10-21', '11:41:00') });
    w.ricalcolaIntervento(ids.tk12);

    // TK/2026/0010: il rapportino del 13/10 firmato da Anna Rossi, chiuso "una riga" il 14/10 e gia' fatturato (prima di Wisper).
    orologio = quando('2026-10-13', '17:00:00');
    const r10 = w.salvaRapportino({ idLocale: 'seme-f5-tk10', idTicket: ids.tk10, tecnico: 'Manuel Gasparotto', data: '2026-10-13', idCliente: 'C002',
      luogo: 'Via Nuova 3, Bassano del Grappa', descrizione: 'Sostituita la presa bruciata del quadro generale', oreLavoro: 1.5, oreViaggio: 0.5, km: 48, tariffa: 42 });
    w.caricaFile({ tipo: 'firma', id: r10.id, base64: SCONTRINO, mime: 'image/png', idFile: 'firma-f5-tk10', firmatario: 'Anna Rossi', firmatoIl: '2026-10-13T17:00:00' });
    w.caricaFile({ tipo: 'ticket', idTicket: ids.tk10, base64: SCONTRINO, mime: 'image/png', nome: 'Presa bruciata.png', idFile: 'foto-tk10-1' });
    orologio = quando('2026-10-13', '17:05:00');
    w.risolviTicket({ id: ids.tk10 });
    orologio = quando('2026-10-14', '09:00:00');
    w.chiudiTicket({ id: ids.tk10, fatturazione: 'ticket' });
    w.segnaFatturataFuori({ voci: [{ tipo: 'ticket', id: 'TK/2026/0010' }], nota: 'fattura 47/2026, fatta prima di Wisper' });
    retrodata('rapportini', r10.id, { creato: quando('2026-10-13', '16:30:00') });
    retrodata('ticket', ids.tk10, { preso_il: quando('2026-10-12', '08:05:00'), risolto_il: quando('2026-10-13', '17:05:00'), chiuso_il: quando('2026-10-14', '09:00:00') });
    w.ricalcolaIntervento(ids.tk10);

    // TK/2026/0009: una domanda al telefono, chiusa subito "non si fattura".
    orologio = quando('2026-10-09', '15:20:00');
    w.chiudiTicket({ id: ids.tk9, fatturazione: 'no', motivo: 'Risposto al telefono: nel contratto sono comprese le domande' });
    retrodata('ticket', ids.tk9, { preso_il: quando('2026-10-09', '15:00:00'), risolto_il: quando('2026-10-09', '15:20:00'), chiuso_il: quando('2026-10-09', '15:20:00') });
    w.ricalcolaIntervento(ids.tk9);
    retrodata('ticket', ids.tk13, { preso_il: quando(ieri, '16:25:00') });
    orologio = null;

    // ------------------------------------------------ le visite dei contratti: la manutenzione della cabina (TK/2026/0015) e le altre in anticipo
    const cabina = w.db.riga("SELECT * FROM scadenze WHERE contratto_id = ? AND tipo = 'manutenzione' AND stato = 'aperta'", ids.c2);
    if (cabina && !cabina.ticket_id && piuGiorni(cabina.data, -(cabina.anticipo_giorni || 30)) <= T) {
      orologio = quando(ieri, '02:30:00');
      const id15 = w.ticketDaScadenza(cabina);
      w.assegnaTicket({ id: id15, responsabileId: utenti.titolare.id });
      retrodata('ticket', id15, { aperto_il: quando(ieri, '02:30:00') });
      orologio = null;
    }
    w.generaTicketDaScadenze();

    // ------------------------------------------------ i documenti
    const cat = nome => w.db.riga('SELECT id FROM documento_categorie WHERE nome = ?', nome).id;
    const doc = (x, file) => w.salvaDocumento({ documento: Object.assign(file ? { origine: 'file', idFile: file } : {}, x) }).documento;
    const comm2 = w.db.riga('SELECT commessa_id FROM contratti WHERE id = ?', ids.c2).commessa_id;
    // Lo schema unifilare della cabina: rev. 0, 1, 2 approvate (la 2 e' la valida), la rev. 3 caricata da Marco da approvare.
    const schema = doc({ titolo: 'Schema unifilare cabina MT', idCategoria: cat('Progetti e schemi'), idSede: ids.cabina, idCommessa: comm2, dataDocumento: '2026-06-18',
      parole: 'unifilare MT cabina protezioni' }, carica('Schema unifilare cabina rev0.pdf', 'application/pdf', pdf('Schema unifilare rev. 0')));
    w.caricaVersione({ id: schema.id, idFile: carica('Schema unifilare cabina rev1.pdf', 'application/pdf', pdf('Schema unifilare rev. 1')), nota: 'Prima emissione dopo il rilievo' });
    w.caricaVersione({ id: schema.id, idFile: carica('Schema unifilare cabina rev2.pdf', 'application/pdf', pdf('Schema unifilare rev. 2')), nota: 'Nuove protezioni SPG' });
    w.come({ utente: utenti.collaboratore, permessi: Object.assign({}, w.permessiDi('collaboratore'), { documenti: 2 }), app: 'prova', dispNome: 'dati di esempio' }, () => w.db.transazione(() => {
      const f = w.salvaFile({ dati: pdf('Schema unifilare rev. 3'), nome: 'Schema unifilare cabina rev3.pdf', mime: 'application/pdf', tipo: 'caricato' });
      w.aggiungiVersione(schema.id, w.db.riga('SELECT * FROM file WHERE id = ?', f.id), 'Aggiunto il trasformatore di riserva', 'da_approvare');
    }));
    doc({ titolo: 'Dichiarazione di conformità quadro generale', idCategoria: cat('Dichiarazioni di conformità'), idSede: ids.quadroRossi, riferimento: 'DiCo 7/2019',
      dataDocumento: '2019-03-11' }, carica('DiCo 7-2019 quadro generale.pdf', 'application/pdf', pdf('DiCo 7/2019')));
    const verbale = doc({ titolo: 'Verbale verifica impianto di terra 2022', idCategoria: cat('Verbali di verifica'), idSede: ids.terra, dataDocumento: '2022-01-12',
      riferimento: 'Verbale ARPA 0112/2022' }, carica('Verbale verifica terra 2022.pdf', 'application/pdf', pdf('Verbale verifica terra 2022')));
    w.salvaScadenza({ scadenza: { tipo: 'verifica_terra', idSede: ids.terra, idDocumento: verbale.id, data: '2027-01-12', assegnataA: utenti.titolare.id } });
    doc({ titolo: 'Cartella della commessa 26ST003', idCategoria: cat('Progetti e schemi'), idCommessa: '26ST003', origine: 'collegamento', principale: true,
      url: 'https://esempio-my.sharepoint.com/:f:/g/personal/studio/Commesse/26ST003', dataDocumento: '2026-10-15' });
    doc({ titolo: 'Progetto impianto fotovoltaico Bianchi', idCategoria: cat('Progetti e schemi'), idSede: ids.fotovoltaico, origine: 'collegamento',
      url: 'https://drive.google.com/file/d/1AbCdEsempio/view', dataDocumento: '2021-05-02' });
    const firmato = doc({ titolo: 'Contratto CA/2026/002 firmato', idCategoria: cat('Contratti'), idSede: ids.cabina, idContratto: ids.c2, idCommessa: comm2,
      dataDocumento: '2025-12-18' }, carica('Contratto CA-2026-002 firmato.pdf', 'application/pdf', pdf('Contratto CA/2026/002')));
    w.salvaContratto({ contratto: { id: ids.c2, idDocumento: firmato.id } });
    // Scade fra 24 giorni (il 15/11 del prototipo, visto dal 22/10): la fase 6 lo sceglie come certificato del MT-500.
    const scadeCert = piuGiorni(T, 24);
    doc({ titolo: 'Certificato di taratura del misuratore di terra', idCategoria: cat('Certificati'), dataDocumento: require('./conti').piuMesi(scadeCert, -12), riferimento: 'LAT 0000/25',
      scadenza: { data: scadeCert, ogniMesi: 12, preavvisoGiorni: 60 } }, carica('Certificato taratura misuratore.pdf', 'application/pdf', pdf('Certificato di taratura')));
    doc({ titolo: 'Manuale dell\'inverter', idCategoria: cat('Manuali e schede tecniche'), idSede: ids.fotovoltaico, origine: 'collegamento',
      url: 'https://www.esempio-inverter.example/manuali/6k.pdf', dataDocumento: '2021-06-30' });
    doc({ titolo: 'Schemi elettrici archivio 2019', idCategoria: cat('Documenti dello studio'), origine: 'collegamento', url: '\\\\SERVER-STUDIO\\Archivio\\2019\\Schemi',
      dataDocumento: '2019-12-31' });
    doc({ titolo: 'Modulo della dichiarazione di conformità', idCategoria: cat('Modelli dello studio'), descrizione: 'Il modello della DiCo da compilare a mano' },
      carica('Modulo DiCo.pdf', 'application/pdf', pdf('Modulo DiCo')));
    doc({ titolo: 'Rilievo quadri linea 3', idCategoria: cat('Da classificare'), idCommessa: '26ST001', dataDocumento: '2026-09-02' },
      carica('Rilievo quadri linea 3.pdf', 'application/pdf', pdf('Rilievo quadri linea 3')));
    doc({ titolo: 'Offerta materiali quadro', idCategoria: cat('Da classificare'), idCommessa: '26ST002', dataDocumento: '2026-08-21' },
      carica('Offerta materiali quadro.pdf', 'application/pdf', pdf('Offerta materiali')));
    doc({ titolo: 'Foto quadro prima dei lavori', idCategoria: cat('Da classificare'), idCommessa: '26ST002', dataDocumento: '2026-08-20' },
      carica('Foto quadro prima dei lavori.png', 'image/png', Buffer.from(SCONTRINO, 'base64')));

    // ------------------------------------------------ le altre scadenze degli impianti
    w.salvaScadenza({ scadenza: { titolo: 'Verifica protezioni SPG e SPI', tipo: 'verifica_protezioni', idSede: ids.cabina, data: '2026-09-30' } });
    w.salvaScadenza({ scadenza: { tipo: 'verifica_terra', idSede: ids.quadroRossi, data: '2029-03-11' } });
  });
  delete w.eventoTicket;
  return ids;
}

/**
 * Fatture, banche e scadenze come nel prototipo della fase 4
 * (docs/prototipo/Gestionale-fase4.html, oggi = 22/10/2026). Le fatture hanno
 * date fisse (sono storia fiscale: 38/2026, 39/2026, 45/2026), come i
 * rapportini della fase 1; gli impegni che si ripetono vanno sempre avanti.
 *  - i dati dello studio e dei clienti per le fatture (partite IVA finte col
 *    controllo giusto), Mario Bianchi privato, due fornitori in piu';
 *  - il PR/2026/012 rev. 1 accettato con la DiRi: la commessa 26ST003 a corpo,
 *    3.800 euro di contratto, acconto 30/40/30 (1.140, 1.520, 1.140);
 *  - 26ST002 "misto" (il contratto PR/2026/010 e le ore in piu');
 *  - i sei rapportini di settembre di Elettrodinamica, firmati e mandati
 *    (riepilogo inviato il 30/09), da fatturare in una riga al mese;
 *  - il collaudo di Rossi (rapportino con pedaggio e una spesa anticipata);
 *  - 38/2026 (agosto, pagata), 39/2026 (30% di 26ST002, pagata in parte e
 *    scaduta), 45/2026 (30% di 26ST003, consegnata), W-14 di Mario Bianchi
 *    pronta e gia' pagata (da emettere entro 12 giorni), la bozza W-15 di Rossi
 *    (40% di 26ST003 con la pratica anticipata e il bollo): passate al
 *    programma e tornate con l'XML vero, dal ritorno di sempre (leggiXml e
 *    confermaXml);
 *  - il Conto studio (saldo scritto il 01/10), i movimenti di ottobre, quattro
 *    fatture ricevute (una con la ritenuta: la proposta F24 1040), affitto e
 *    luce ricorrenti, IVA e IRPEF di novembre: il saldo previsto va sotto i
 *    3.000 euro il 30/11.
 * Le regole fiscali NON sono confermate (come nel prototipo).
 */
function seminaFase4(w, utenti, come) {
  const { scriviFatturaPA } = require('./fatturapa');
  const fattura = id => w.db.riga('SELECT * FROM fatture WHERE id = ?', id);
  /** Passa la bozza al programma e la fa tornare con l'XML emesso (numero e data veri), dal ritorno di sempre. */
  const emetti = (id, numeroFiscale, data, nomeFile) => {
    const passata = w.passaAlProgramma({ id, conferma: true });
    if (!passata.ok) throw new Error('dati di esempio: ' + passata.errore);
    const m = Object.assign(w.modelloFattura(fattura(id), { ibanIntero: true }), { data });
    const xml = scriviFatturaPA(m, { numero: numeroFiscale, progressivo: nomeFile.replace(/^.*_|\..*$/g, '') });
    const l = w.leggiXml({ file: [{ nome: nomeFile, base64: Buffer.from(xml, 'utf8').toString('base64') }] });
    w.confermaXml({ idLettura: l.idLettura, scelte: [{ chiave: l.documenti[0].chiave, azione: 'abbina', idFattura: id }] });
  };
  const retrodata = (tabella, id, campi) => {
    const k = Object.keys(campi);
    w.db.esegui('UPDATE ' + tabella + ' SET ' + k.map(c => c + ' = ?').join(', ') + ' WHERE id = ?', ...k.map(c => campi[c]), id);
  };
  const quando = (giorno, ora) => istante(new Date(giorno + 'T' + ora));

  come('titolare', () => {
    // ------------------------------------------------ dati dello studio e dei clienti per le fatture
    w.salvaImpostazioni({ CODICE_FISCALE: '00000000000', STUDIO_CAP: '36016', STUDIO_COMUNE: 'Thiene', STUDIO_PROVINCIA: 'VI',
      ALBO: 'Periti industriali', ALBO_PROVINCIA: 'VI', ALBO_NUMERO: '000' });
    w.salvaSoggetto({ id: 'C001', partitaIva: '02468135799', codiceSdi: 'AB12CD3', indirizzo: 'Via dell\'Industria 12', cap: '36016', citta: 'Thiene', provincia: 'VI' });
    w.salvaSoggetto({ id: 'C002', partitaIva: '04455667784', pec: 'rossiimpianti@pec.esempio.it', indirizzo: 'Via Nuova 3', cap: '36061', citta: 'Bassano del Grappa', provincia: 'VI' });
    w.salvaSoggetto({ nome: 'Mario Bianchi', codiceFiscale: 'BNCMRA70C12L840K', email: 'mario.bianchi@example.com', indirizzo: 'Via Montegrappa 8', cap: '36063',
      citta: 'Marostica', provincia: 'VI' });
    w.salvaSoggetto({ nome: 'Ing. Paolo Verdi', cliente: false, fornitore: true, partitaIva: '01122334459', email: 'studio@verdi.example',
      indirizzo: 'Via dei Calcoli 4', cap: '36100', citta: 'Vicenza', provincia: 'VI' });
    w.salvaSoggetto({ nome: 'Luce e Gas Esempio Spa', cliente: false, fornitore: true, partitaIva: '07788990013', cap: '20100', citta: 'Milano', provincia: 'MI' });
    w.salvaConto({ conto: { nome: 'Conto studio', banca: 'Banca di esempio', iban: 'IT60X0542811101000000123456', predefinito: true } });
    w.aggiornaSaldo({ idConto: 1, data: '2026-10-01', saldo: 9850 });

    // ------------------------------------------------ il contratto PR/2026/012 rev. 1 diventa la commessa 26ST003 (a corpo)
    const rev1 = w.leggiPreventivi({}).find(p => /\/012$/.test(p.numero) && p.revisione === 1);
    const voci = w.preventivoCompleto(w.rigaPreventivo(rev1.id)).sezioni[1].voci;
    const voce = testo => voci.find(v => v.descrizione.indexOf(testo) === 0).id;
    w.accettaPreventivo({ id: rev1.id, modo: 'documento', nome: 'Paolo Rossi',
      scelte: { [voce('Dichiarazione')]: true, [voce('Collaudo con strumenti')]: true, [voce('Collaudo con laboratorio')]: false } });
    const c3 = w.creaCommessaDaPreventivo({ id: rev1.id }).commessa;
    w.aggiornaCommessa('26ST002', { modoFatturazione: 'misto' });
    const scadenze3 = w.db.righe('SELECT * FROM scadenze_pagamento WHERE commessa_id = ? ORDER BY ordine', c3.id);
    const scadenze2 = w.db.righe("SELECT * FROM scadenze_pagamento WHERE commessa_id = '26ST002' ORDER BY ordine");
    const pratica = w.salvaSpesa({ data: '2026-10-14', importo: 120, categoria: 'altro', descrizione: 'Pratica di connessione al distributore', idCommessa: c3.id,
      anticipazione: true, pagataDaMe: true });

    // ------------------------------------------------ i rapportini di settembre di Elettrodinamica (firmati, riepilogo inviato il 30/09)
    const settembre = [['2026-09-03', 6, 1, 8.4, 'Rilievo quadri del magazzino'], ['2026-09-08', 7, 1, 0, 'Cablaggio quadro di linea 1'],
      ['2026-09-11', 5, 1, 8.4, 'Cablaggio quadro di linea 2'], ['2026-09-16', 8, 0, 0, 'Messa in servizio nastri'],
      ['2026-09-21', 6, 0, 0, 'Prove dei sensori'], ['2026-09-24', 6, 0, 0, 'Collaudo con il cliente']];
    settembre.forEach(([data, ore, viaggio, spese, descrizione], i) => {
      const r = w.salvaRapportino({ idLocale: 'seme-f4-elettro-' + (i + 1), tecnico: 'Manuel Gasparotto', data, idCliente: 'C001', descrizione, oreLavoro: ore,
        oreViaggio: viaggio, km: 52, spese, noteSpese: spese ? 'Pedaggio' : '' });
      w.caricaFile({ tipo: 'firma', id: r.id, base64: SCONTRINO, mime: 'image/png', idFile: 'firma-f4-' + (i + 1), firmatario: 'Giulia Bianchi' });
      w.cambiaStato([r.id], 'INVIATO');
      w.db.esegui('UPDATE rapportini SET firmato_il = ?, inviato_il = ? WHERE id = ?', quando(data, '17:00:00'), quando('2026-09-30', '18:05:00'), r.id);
    });

    // ------------------------------------------------ il collaudo di Rossi: pedaggio e una spesa anticipata, firmato
    const collaudo = w.salvaRapportino({ idLocale: 'seme-f4-rossi-1', tecnico: 'Manuel Gasparotto', data: '2026-10-21', idCliente: 'C002', idCommessa: '26ST002',
      descrizione: 'Collaudo quadro', oreLavoro: 6.5, oreViaggio: 1, km: 48, tariffa: 42, spese: 8.4, noteSpese: 'Pedaggio' });
    w.salvaSpesa({ data: '2026-10-21', importo: 12, categoria: 'altro', descrizione: 'Corriere per i documenti', idRapportino: collaudo.id, anticipazione: true });
    w.caricaFile({ tipo: 'firma', id: collaudo.id, base64: SCONTRINO, mime: 'image/png', idFile: 'firma-f4-rossi', firmatario: 'Paolo Rossi' });

    // ------------------------------------------------ le fatture: W-11 ... W-15 come nel prototipo
    w.db.esegui("INSERT INTO sqlite_sequence (name, seq) SELECT 'fatture', 10 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'fatture')");
    // 38/2026: agosto di Elettrodinamica (4 rapportini fatturati prima di Wisper), pagata il 29/09.
    const f38 = w.nuovaFattura({ idCliente: 'C001' }).fattura.id;
    w.salvaFattura({ fattura: { id: f38, data: '2026-08-31', causale: 'Prestazioni di agosto 2026', righe: [
      { tipo: 'compenso', descrizione: 'Prestazioni professionali di agosto 2026 (4 rapportini)', quantita: 26, unita: 'ore', prezzo: 30 },
      { tipo: 'compenso', descrizione: 'Rimborso chilometrico di agosto 2026', quantita: 208, unita: 'km', prezzo: 0.76 },
      { tipo: 'compenso', descrizione: 'Spese di viaggio e materiale di agosto 2026', quantita: 1, prezzo: 21.92 }] } });
    emetti(f38, '38/2026', '2026-08-31', 'IT00000000000_00038.xml');
    // 39/2026: il 30% alla firma di 26ST002 (contratto PR/2026/010), scaduto il 10/10 e pagato in parte il 12/10.
    const f39 = w.preparaFattura({ idCliente: 'C002', voci: [{ tipo: 'scadenza', id: scadenze2[0].id }], data: '2026-09-10' }).fattura.id;
    emetti(f39, '39/2026', '2026-09-10', 'IT00000000000_00039.xml');
    // 45/2026: il 30% alla firma di 26ST003, consegnata il 19/10.
    const f45 = w.preparaFattura({ idCliente: 'C002', voci: [{ tipo: 'scadenza', id: scadenze3[0].id }], data: '2026-10-19' }).fattura.id;
    emetti(f45, '45/2026', '2026-10-19', 'IT00000000000_00045.xml');
    // W-14: Mario Bianchi, passata al programma il 15/10 e gia' pagata il 20/10 (avviso di parcella): va emessa entro il 1/11.
    const f14 = w.nuovaFattura({ idCliente: 'C003' }).fattura.id;
    w.salvaFattura({ fattura: { id: f14, data: '2026-10-15', causale: 'Sopralluogo e rilievo, impianto fotovoltaico', righe: [
      { tipo: 'compenso', descrizione: 'Sopralluogo e rilievo: Impianto fotovoltaico', quantita: 1, prezzo: 250 }] } });
    const p14 = w.passaAlProgramma({ id: f14, conferma: true });
    if (!p14.ok) throw new Error('dati di esempio: ' + p14.errore);
    // W-15: la bozza di Rossi, il 40% a fine progetto di 26ST003 con la pratica anticipata (e il bollo).
    w.preparaFattura({ idCliente: 'C002', voci: [{ tipo: 'scadenza', id: scadenze3[1].id }, { tipo: 'spesa', id: pratica.id }], data: '2026-10-22' });
    // Le date di quando sono successe le cose.
    retrodata('fatture', f38, { pronta_il: quando('2026-08-31', '09:00:00'), emessa_il: quando('2026-08-31', '11:00:00'), esito_sdi: 'consegnata', esito_il: '2026-08-31' });
    retrodata('fatture', f39, { pronta_il: quando('2026-09-10', '09:00:00'), emessa_il: quando('2026-09-10', '11:00:00'), esito_sdi: 'consegnata', esito_il: '2026-09-10' });
    retrodata('fatture', f45, { pronta_il: quando('2026-10-16', '15:00:00'), emessa_il: quando('2026-10-20', '09:30:00'), esito_sdi: 'consegnata', esito_il: '2026-10-19' });
    retrodata('fatture', f14, { pronta_il: quando('2026-10-15', '10:00:00') });

    // ------------------------------------------------ fatture ricevute
    const ricevuta = r => w.salvaRicevuta({ ricevuta: r }).ricevuta;
    ricevuta({ idFornitore: 'F001', numero: 'A/233', data: '2026-10-16', imponibile: 398.36, iva: 87.64, totale: 486, categoria: 'materiale', idCommessa: '26ST002',
      descrizione: 'Interruttori e morsettiere per il quadro', scadenze: [{ data: '2026-11-16', importo: 486 }] });
    ricevuta({ idFornitore: 'F002', numero: '77', data: '2026-09-28', imponibile: 600, iva: 132, totale: 732, categoria: 'servizi',
      descrizione: 'Noleggio piattaforma aerea', scadenze: [{ data: '2026-10-28', importo: 732 }] });
    const verdi = ricevuta({ idFornitore: 'F003', numero: '12', data: '2026-10-05', imponibile: 520, iva: 114.4, totale: 634.4, ritenuta: 100, categoria: 'consulenze',
      idCommessa: c3.id, descrizione: 'Verifica dei calcoli del quadro', scadenze: [{ data: '2026-10-12', importo: 534.4 }] });
    const luce = ricevuta({ idFornitore: 'F004', numero: '2026/88412', data: '2026-09-25', imponibile: 116.64, iva: 25.66, totale: 142.3, categoria: 'utenze',
      descrizione: 'Luce e gas dell\'ufficio, settembre', scadenze: [{ data: '2026-10-05', importo: 142.3 }] });

    // ------------------------------------------------ impegni: affitto e luce ogni mese, IVA e IRPEF di novembre, F24 di ottobre
    const affitto = w.salvaImpegno({ impegno: { tipo: 'rata', descrizione: 'Affitto ufficio', scadenza: '2026-09-26', importo: 850, ricorrenza: { regola: 'mesi', ogni: 1 } } }).impegno;
    w.salvaImpegno({ impegno: { tipo: 'altro', descrizione: 'Luce e gas dell\'ufficio', scadenza: '2026-11-05', importo: 142.3, idSoggetto: 'F004', ricorrenza: { regola: 'mesi', ogni: 1 } } });
    w.salvaImpegno({ impegno: { tipo: 'f24', descrizione: 'IVA del 3° trimestre', codice: '6033', scadenza: '2026-11-16', importo: 2380 } });
    w.salvaImpegno({ impegno: { tipo: 'f24', descrizione: 'Secondo acconto IRPEF', codice: '4034', scadenza: '2026-11-30', importo: 3400 } });
    w.salvaImpegno({ impegno: { tipo: 'f24', descrizione: 'Ritenute e contributi del mese', scadenza: '2026-12-16', ricorrenza: { regola: 'mesi', ogni: 1 } } });
    const f24 = w.salvaImpegno({ impegno: { tipo: 'f24', descrizione: 'F24 del 16 ottobre', scadenza: '2026-10-16', importo: 1250 } }).impegno;

    // ------------------------------------------------ i movimenti (registrati; quasi tutti visti sull'estratto conto)
    w.segnaPagamento({ idImpegno: affitto.id, data: '2026-09-26', verificato: true });
    w.segnaIncasso({ idFattura: f38, data: '2026-09-29', verificato: true });
    w.segnaPagamento({ idRicevuta: luce.id, data: '2026-10-05', verificato: true });
    w.segnaPagamento({ idRicevuta: verdi.id, data: '2026-10-12', verificato: true });
    w.segnaIncasso({ idFattura: f39, importo: 500, data: '2026-10-12' });
    w.segnaPagamento({ idImpegno: f24.id, data: '2026-10-16', verificato: true });
    w.segnaIncasso({ idFattura: f14, data: '2026-10-20', verificato: true });
  });
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
  w.db.esegui('UPDATE timer SET partito_il = ? WHERE utente_id = ?', istante(new Date(adessoMs() - 90 * 60000)), utenti.collaboratore.id);

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
