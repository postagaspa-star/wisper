/*
 * Wisper: un esempio per ogni modello di documento (docs/gestionale/modelli.md, 17/11/2026).
 *
 * La pagina Modelli (pc/ui/modelli.js sul computer, ui/ModelliDocumenti.kt sul telefono) mostra ogni modello con un esempio.
 * L'esempio non è un'immagine tenuta da parte: è il documento fatto in quel momento dal modello vero (documenti.js) con
 * i dati qui sotto, così non resta mai indietro rispetto al documento che esce davvero. I dati sono inventati e sempre
 * gli stessi (clienti, numeri, prezzi, IBAN: niente di vero); in cima c'è lo studio di chi guarda (logo, nome,
 * indirizzo dalle impostazioni), oppure uno studio di esempio se le impostazioni non ci sono.
 *
 * Il telefono copia questo file negli asset con documenti.js (app/build.gradle.kts, copiaModelliPdf).
 */
(function (radice, fabbrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./documenti.js'));
  else radice.WisperModelliEsempi = fabbrica(radice.WisperDocumenti);
}(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  /** Lo studio di esempio, per chi non ha le impostazioni (la visita guidata, le prove). */
  const STUDIO = {
    RAGIONE_SOCIALE: 'Studio Tecnico Esempio', TECNICO: 'Mario Bianchi', STUDIO_QUALIFICA: 'Perito industriale',
    INDIRIZZO: 'Via Roma 1, 36063 Marostica (VI)', PARTITA_IVA: '01234567890', CODICE_FISCALE: '01234567890',
    EMAIL: 'studio@esempio.it', PEC: 'studio@pec.esempio.it', TELEFONO: '0424 000 000',
    POLIZZA_COMPAGNIA: 'Assicurazioni Esempio', POLIZZA_NUMERO: '000123', POLIZZA_MASSIMALE: 1000000,
    TITOLI: 'Perito industriale iscritto al Collegio di Vicenza al n. 0000',
  };

  const CLIENTE = {
    id: 'E001', nome: 'Rossi Impianti Srl', indirizzo: 'Via dell\'Industria 12', cap: '36061', citta: 'Bassano del Grappa', provincia: 'VI',
    partitaIva: '01234567897', codiceFiscale: '01234567897', email: 'amministrazione@rossi-impianti.esempio.it', pec: 'rossi-impianti@pec.esempio.it',
  };

  const TARIFFA = 45;
  const EURO_KM = 0.5;

  /** Un lavoro di esempio coi suoi conti (ore × 45 €, km × 0,50 €, le spese): i numeri tornano sempre. */
  function lavoro(x) {
    const ore = (x.oreLavoro || 0) + (x.oreExtra || 0) + (x.oreViaggio || 0);
    const compenso = ore * TARIFFA;
    const rimborso = (x.km || 0) * EURO_KM;
    return Object.assign({
      stato: 'BOZZA', idCliente: CLIENTE.id, cliente: CLIENTE.nome, oreLavoro: 0, oreExtra: 0, oreViaggio: 0, km: 0, spese: 0, noteSpese: '',
      tariffa: TARIFFA, euroKm: EURO_KM, pagaViaggio: true, kmRimborsati: true, oreTotali: ore, compensoOre: compenso, rimborsoKm: rimborso,
      importoIndennita: 0, totale: compenso + rimborso + (x.spese || 0),
    }, x);
  }

  const QG1 = { progetto: 'RI-001', progettoDescrizione: 'Quadro generale QG1', progettoIntestatoA: 'Officine Brenta Spa' };
  const LINEA = { progetto: 'RI-002', progettoDescrizione: 'Linea di confezionamento 2', progettoIntestatoA: 'Officine Brenta Spa' };
  const CABINA = { progetto: 'RI-004', progettoDescrizione: 'Cabina di trasformazione', progettoIntestatoA: 'Rossi Impianti Srl' };

  /** Il rapportino di un giorno su una commessa sola (RAP-01). */
  const GIORNO_UNA_COMMESSA = {
    id: 'RAP/2026/0031', data: '2026-11-05',
    lavori: [
      lavoro(Object.assign({ id: 'RAP/2026/0031', idGiornata: 'RAP/2026/0031', posizione: 1, data: '2026-11-05', idCommessa: '26ST014',
        descrizione: 'Cablaggio del quadro e prova dei circuiti ausiliari', oreLavoro: 4, oreViaggio: 0.5, km: 38 }, QG1)),
      lavoro(Object.assign({ id: 'RAP/2026/0031-2', idGiornata: 'RAP/2026/0031', posizione: 2, data: '2026-11-05', idCommessa: '26ST014',
        descrizione: 'Modifica dello schema e aggiornamento del programma del PLC', oreLavoro: 2.5 }, LINEA)),
      lavoro(Object.assign({ id: 'RAP/2026/0031-3', idGiornata: 'RAP/2026/0031', posizione: 3, data: '2026-11-05', idCommessa: '26ST014',
        descrizione: 'Verifica dei finecorsa e collaudo con il cliente', oreLavoro: 1.5, spese: 12.5, noteSpese: 'Materiale di consumo' }, QG1)),
    ],
  };

  /** Il rapportino di un giorno su due commesse (RAP-02). */
  const GIORNO_PIU_COMMESSE = {
    id: 'RAP/2026/0032', data: '2026-11-06',
    lavori: [
      lavoro(Object.assign({ id: 'RAP/2026/0032', idGiornata: 'RAP/2026/0032', posizione: 1, data: '2026-11-06', idCommessa: '26ST014',
        descrizione: 'Messa in servizio del quadro e prove a vuoto', oreLavoro: 3, km: 38 }, QG1)),
      lavoro(Object.assign({ id: 'RAP/2026/0032-2', idGiornata: 'RAP/2026/0032', posizione: 2, data: '2026-11-06', idCommessa: '26ST009',
        descrizione: 'Rilievo dell\'impianto di terra e misure di continuità', oreLavoro: 2, oreExtra: 0.5, luogo: 'Stabilimento di Bassano' }, CABINA)),
    ],
  };

  /** I rapportini di un mese per lo stesso cliente (RAP-03): cinque lavori in quattro rapportini. */
  const MESE = [
    lavoro(Object.assign({ id: 'RAP/2026/0024', idGiornata: 'RAP/2026/0024', numero: 'RAP/2026/0024', posizione: 1, data: '2026-10-02', idCommessa: '26ST014',
      descrizione: 'Sopralluogo e rilievo del quadro esistente', oreLavoro: 3, oreViaggio: 0.5, km: 38 }, QG1)),
    lavoro(Object.assign({ id: 'RAP/2026/0026', idGiornata: 'RAP/2026/0026', numero: 'RAP/2026/0026', posizione: 1, data: '2026-10-09', idCommessa: '26ST014',
      descrizione: 'Schema unifilare e distinta dei materiali', oreLavoro: 5 }, QG1)),
    lavoro(Object.assign({ id: 'RAP/2026/0026-2', idGiornata: 'RAP/2026/0026', numero: 'RAP/2026/0026', posizione: 2, data: '2026-10-09', idCommessa: '26ST014',
      descrizione: 'Analisi del ciclo della linea con il responsabile di produzione', oreLavoro: 2, km: 38 }, LINEA)),
    lavoro(Object.assign({ id: 'RAP/2026/0028', idGiornata: 'RAP/2026/0028', numero: 'RAP/2026/0028', posizione: 1, data: '2026-10-16', idCommessa: '26ST009',
      descrizione: 'Verifica della cabina e prova delle protezioni', oreLavoro: 4, oreExtra: 1, km: 42, spese: 18, noteSpese: 'Parcheggio' }, CABINA)),
    lavoro(Object.assign({ id: 'RAP/2026/0029', idGiornata: 'RAP/2026/0029', numero: 'RAP/2026/0029', posizione: 1, data: '2026-10-23', idCommessa: '26ST014',
      descrizione: 'Programma del PLC: sequenze di avvio e allarmi', oreLavoro: 6 }, LINEA)),
  ];

  /** Il rapportino di un lavoro solo, a scheda (RAP-04). */
  const SCHEDA = lavoro(Object.assign({ id: 'RAP/2026/0030', data: '2026-10-30', stato: 'INVIATO', idCommessa: '26ST009', luogo: 'Stabilimento di Bassano',
    descrizione: 'Verifica periodica dell\'impianto di terra: misure, esame a vista e prova dei differenziali.', oreLavoro: 3, oreViaggio: 1, km: 40 }, CABINA));

  const PREVENTIVO = {
    id: 18, numero: 'PR/2026/018', revisione: 0, data: '2026-11-03', scadenza: '2026-12-03', stato: 'INVIATO', idCliente: CLIENTE.id,
    oggetto: 'Adeguamento del quadro generale QG1 e nuova linea di confezionamento',
    introduzione: 'In seguito al sopralluogo del 2 ottobre, ecco la nostra offerta per la progettazione e la direzione dei lavori.',
    complessita: 'media', eppiPercentuale: 5, ivaPercentuale: 22,
    sezioni: [
      { id: 1, ordine: 1, titolo: 'Progettazione', voci: [
        { id: 1, ordine: 1, codice: 'PRG', descrizione: 'Progetto esecutivo del quadro generale QG1', modo: 'corpo', quantita: 1, prezzo: 1200 },
        { id: 2, ordine: 2, codice: 'SCH', descrizione: 'Schemi elettrici e distinta dei materiali', modo: 'ore', quantita: 16, unita: 'Ore', prezzo: 45 },
      ] },
      { id: 2, ordine: 2, titolo: 'Direzione lavori e collaudo', voci: [
        { id: 3, ordine: 1, codice: 'DL', descrizione: 'Direzione dei lavori in cantiere', modo: 'ore', quantita: 12, unita: 'Ore', prezzo: 45 },
        { id: 4, ordine: 2, codice: 'COL', descrizione: 'Collaudo e dichiarazione di conformità', modo: 'corpo', quantita: 1, prezzo: 450 },
        { id: 5, ordine: 3, codice: 'COR', descrizione: 'Corso agli operatori della linea', modo: 'corpo', quantita: 1, prezzo: 300, facoltativa: true },
      ] },
    ],
    scadenzePagamento: [
      { descrizione: 'Acconto', quando: 'firma', tipo: 'percentuale', valore: 30 },
      { descrizione: 'Saldo', quando: 'fine', tipo: 'percentuale', valore: 70 },
    ],
    oneriPrevisti: 'Nessun onere oltre a quelli indicati.',
    condizioni: 'Pagamento con bonifico a 30 giorni dalla data della fattura. I materiali e l\'installazione non sono compresi.',
  };

  const INCARICO = Object.assign({}, PREVENTIVO, { stato: 'ACCETTATO', accettatoIl: '2026-11-10', accettatoDa: 'Luca Rossi', accettazioneModo: 'email' });

  /** La fattura di esempio nel modello del server (lo stesso di prospetto, parcella pro-forma e parcella): numeri già fatti. */
  function fattura(imp) {
    const s = D.studioDaImpostazioni(imp);
    return {
      riferimento: 'W-21', tipoDocumento: 'TD06', dataProposta: '2026-11-03', regoleConfermate: true,
      prestatore: { denominazione: s.denominazione, qualifica: s.qualifica, partitaIva: s.partitaIva, codiceFiscale: s.codiceFiscale, email: s.email, pec: s.pec,
        telefono: s.telefono, sito: s.sito, sede: { indirizzo: s.indirizzo, cap: s.cap, comune: s.comune, provincia: s.provincia, nazione: 'IT' } },
      committente: { denominazione: CLIENTE.nome, partitaIva: CLIENTE.partitaIva, codiceFiscale: CLIENTE.codiceFiscale, codiceDestinatario: 'ABC1234', pec: CLIENTE.pec,
        sede: { indirizzo: CLIENTE.indirizzo, cap: CLIENTE.cap, comune: CLIENTE.citta, provincia: CLIENTE.provincia, nazione: 'IT' } },
      commesse: ['26ST014'],
      causale: ['Prestazioni di ottobre 2026, progetti RI-001 e RI-002'],
      note: 'Prestazioni di ottobre 2026, progetti RI-001 e RI-002',
      righe: [
        { numero: 1, codice: 'PRG-EL', descrizione: 'Progettazione elettrica | ottobre', quantita: 12, unitaMisura: 'Ore', prezzoUnitario: 45, sconto: 0, aliquotaIva: 22, prezzoTotale: 540, ritenuta: true },
        { numero: 2, codice: 'SOP', descrizione: 'Sopralluogo e rilievi | ottobre', quantita: 2, unitaMisura: 'Nr', prezzoUnitario: 90, sconto: 0, aliquotaIva: 22, prezzoTotale: 180, ritenuta: true },
        { numero: 3, codice: 'KM', descrizione: 'Rimborso chilometrico | ottobre', quantita: 120, unitaMisura: 'Km', prezzoUnitario: 0.5, sconto: 0, aliquotaIva: 22, prezzoTotale: 60, ritenuta: true },
      ],
      cassa: { tipo: 'TC17', aliquota: 5, imponibile: 780, importo: 39, aliquotaIva: 22 },
      riepilogo: [{ aliquotaIva: 22, imponibile: 819, imposta: 180.18 }],
      totaleDocumento: 999.18,
      ritenuta: { tipo: 'RT01', aliquota: 20, causale: 'A', importo: 156 },
      nettoAPagare: 843.18,
      pagamento: { dettagli: [{ modalita: 'MP05', scadenza: '2026-11-30', importo: 843.18, iban: 'IT60X0542811101000000123456', bic: 'ESEMITM1XXX', istituto: 'Banca di Esempio', beneficiario: s.denominazione }] },
    };
  }

  const LETTERA = {
    titolo: 'Verifica periodica dell\'impianto di terra', impianto: 'Stabilimento di Bassano',
    testo: 'Gentile cliente,\n\nla verifica periodica dell\'impianto di terra dello stabilimento di Bassano scade il 15/12/2026.\n\n' +
      'Vi proponiamo di farla nella settimana dal 30 novembre al 4 dicembre: servono circa quattro ore, senza fermare la produzione.\n\n' +
      'Restiamo a disposizione per concordare il giorno.\n\nCordiali saluti',
  };

  const LETTERA_INCARICO = {
    modello: 'LET-02', titolo: 'Lettera d\'incarico', cliente: { nome: 'Ing. Paola Verdi', righe: ['Via Garibaldi 8, 36100 Vicenza (VI)', 'P.IVA 09876543210'] },
    testo: 'Gentile Ing. Verdi,\n\ncon la presente Le affidiamo l\'incarico IN/2026/007: calcolo delle correnti di cortocircuito e ' +
      'coordinamento delle protezioni del quadro generale QG1, per la commessa 26ST014.\n\n' +
      'Compenso a corpo: 600,00 €, oltre a contributo previdenziale e IVA. Consegna entro il 20/11/2026.\n\n' +
      'La preghiamo di restituirci questa lettera firmata per accettazione.\n\nCordiali saluti',
  };

  const CONTRATTO = {
    numero: 'CA/2026/004', dal: '2026-01-01', al: '2026-12-31', cliente: CLIENTE.nome, titolo: 'Assistenza agli impianti elettrici dello stabilimento',
    rinnovo: 'tacito', disdettaGiorni: 60, copre: 'visite_guasti', materialiInclusi: false, canone: 1800, fatturazioneCanone: 'semestrale', tariffaExtra: 45,
    impianti: [
      { nome: 'Quadro generale QG1', ogniMesi: 6, primaVisita: '2026-03-10' },
      { nome: 'Cabina di trasformazione', ogniMesi: 12, primaVisita: '2026-06-15' },
    ],
    tempi: { urgente: { presa: 2, intervento: 8 }, alta: { presa: 4, intervento: 24 }, normale: { presa: 8, intervento: 48 }, bassa: { presa: 24, intervento: 120 } },
    condizioni: 'Le visite si concordano con almeno una settimana di anticipo. Gli interventi fuori contratto si pagano alla tariffa indicata. ' +
      'I materiali sostituiti si fatturano a parte.',
  };

  /** Le impostazioni per l'esempio: quelle dello studio di chi guarda, o lo studio di esempio. */
  function studioDi(imp) {
    return imp && String(imp.RAGIONE_SOCIALE || '').trim() ? imp : STUDIO;
  }

  /** Le anagrafiche che servono ai modelli: lo studio, il cliente di esempio, le sue commesse. */
  function anagrafiche(imp) {
    return { impostazioni: imp, clienti: [CLIENTE], soggetti: [CLIENTE], progetti: [], sedi: [], referenti: [],
      commesse: [{ id: '26ST014', descrizione: 'Quadro generale e linea 2' }, { id: '26ST009', descrizione: 'Cabina di trasformazione', indirizzo: 'Stabilimento di Bassano' }] };
  }

  const copia = x => JSON.parse(JSON.stringify(x));

  const FATTI = {
    'RAP-01': imp => D.rapportino(Object.assign({ tecnico: imp.TECNICO || '' }, copia(GIORNO_UNA_COMMESSA)), anagrafiche(imp), { conImporti: true }),
    'RAP-02': imp => D.rapportino(Object.assign({ tecnico: imp.TECNICO || '' }, copia(GIORNO_PIU_COMMESSE)), anagrafiche(imp), { conImporti: true }),
    'RAP-03': imp => D.riepilogo(copia(MESE), anagrafiche(imp), { nome: CLIENTE.nome, righe: [CLIENTE.indirizzo + ', ' + CLIENTE.cap + ' ' + CLIENTE.citta + ' (' + CLIENTE.provincia + ')', 'P.IVA ' + CLIENTE.partitaIva], mostraCliente: false },
      'Ottobre 2026', { conImporti: true }),
    'RAP-04': imp => D.rapportino(Object.assign({ tecnico: imp.TECNICO || '' }, copia(SCHEDA)), anagrafiche(imp), { conImporti: true }),
    'PRE-01': imp => D.preventivo(copia(PREVENTIVO), anagrafiche(imp), {}),
    'PRE-02': imp => D.incarico(copia(INCARICO), anagrafiche(imp), {}),
    'FAT-01': imp => D.avvisoParcella(fattura(imp), { impostazioni: imp, logo: D.logoDi(imp), conNome: D.nomeAccantoAlLogo(imp) }),
    'FAT-02': imp => D.parcella(Object.assign(fattura(imp), { numero: '24', data: '2026-11-10' }), { impostazioni: imp, logo: D.logoDi(imp), conNome: D.nomeAccantoAlLogo(imp) }),
    'FAT-03': imp => D.prospettoFattura(fattura(imp), { oggi: '2026-11-03', logo: D.logoDi(imp), conNome: D.nomeAccantoAlLogo(imp) }),
    'LET-01': imp => D.lettera(Object.assign({ cliente: { nome: CLIENTE.nome, righe: [CLIENTE.indirizzo + ', ' + CLIENTE.cap + ' ' + CLIENTE.citta + ' (' + CLIENTE.provincia + ')', 'P.IVA ' + CLIENTE.partitaIva] } }, LETTERA), imp),
    'LET-02': imp => D.lettera(copia(LETTERA_INCARICO), imp),
    'ASS-01': imp => D.contrattoAssistenza(copia(CONTRATTO), imp),
  };

  /**
   * L'esempio del modello con quel codice: la pagina HTML fatta dal modello vero coi dati di esempio ('' se il codice non
   * c'è). imp: le impostazioni dello studio di chi guarda (facoltative).
   */
  function esempio(codice, imp) {
    const fai = FATTI[String(codice || '')];
    return fai ? fai(studioDi(imp)) : '';
  }

  /** Il nome del file dell'esempio: "Esempio RAP-01 Rapportino giornaliero, una commessa". */
  function nomeEsempio(codice) {
    const m = D.trovaModello(codice);
    return m ? 'Esempio ' + m.codice + ' ' + m.nome : 'Esempio';
  }

  return { esempio, nomeEsempio, codici: () => Object.keys(FATTI), STUDIO };
}));
