/*
 * Wisper Ufficio: i dati di esempio (docs/aspetto.md §9, guida della fase 1).
 *
 * Gli stessi del prototipo (docs/prototipo/Gestionale-fase1.html): lo studio,
 * Laura, Marco, Elettrodinamica, Rossi Impianti, le commesse con le prestazioni.
 * Servono a due cose:
 *  - la visita guidata: l'interfaccia è la stessa, ma le chiamate al server le
 *    risponde questo file, in memoria. Niente letture, niente scritture, niente email;
 *  - le prove nel browser (node pc/prove/finto-ponte.js --esempio): lo stesso
 *    "server finto", con i permessi di chi entra.
 * Le risposte hanno la forma di quelle del server (docs/gestionale/architettura.md §6 e §12).
 */
(function (radice) {
  'use strict';

  const C = radice.WisperConti || (typeof require === 'function' ? require('./conti.js') : null);
  const R = radice.WisperRegole || (typeof require === 'function' ? require('./regole.js') : null);
  const RP = radice.WisperRegolePreventivi || (typeof require === 'function' ? require('./regole-preventivi.js') : null);
  const RA = radice.WisperRegoleAttivita || (typeof require === 'function' ? require('./regole-attivita.js') : null);
  const RO = radice.WisperRegoleOreSpese || (typeof require === 'function' ? require('./regole-ore-spese.js') : null);

  const due = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  const copia = o => JSON.parse(JSON.stringify(o));

  /** Un giorno indietro (o avanti) da oggi. */
  function giorno(oggi, delta) {
    const d = new Date(oggi + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    return iso(d);
  }

  /** Sempre dentro il mese di oggi: Fatturazione apre il mese in corso. */
  function nelMese(oggi, indietro) {
    const d = new Date(oggi + 'T12:00:00');
    return oggi.slice(0, 8) + due(Math.max(1, d.getDate() - indietro));
  }

  /** Il giorno g del mese prima. */
  function mesePrima(oggi, g) {
    const d = new Date(oggi.slice(0, 8) + '01T12:00:00');
    d.setMonth(d.getMonth() - 1);
    return iso(d).slice(0, 8) + due(g);
  }

  function istante(oggi, delta, ora) {
    return giorno(oggi, delta) + 'T' + ora + ':00';
  }

  /** I permessi iniziali dei quattro ruoli (architettura §3), per i moduli che ci sono. */
  function permessiDi(ruolo) {
    const p = {};
    const tutti = ['dashboard', 'clienti', 'commesse', 'preventivi', 'attivita', 'rapportini', 'spese', 'fatturazione', 'banche', 'persone', 'documenti', 'ticket', 'mezzi', 'collaboratori', 'amministrazione', 'costi', 'riservati'];
    tutti.forEach(m => { p[m] = 0; });
    if (ruolo === 'titolare') tutti.forEach(m => { p[m] = 2; });
    // Fase 6 (architettura §17.18): persone, mezzi e collaboratori; i dati riservati solo al titolare.
    if (ruolo === 'amministrazione') Object.assign(p, { dashboard: 2, clienti: 2, commesse: 2, preventivi: 2, attivita: 2, rapportini: 2, spese: 2, fatturazione: 2, banche: 2, documenti: 2, ticket: 2, amministrazione: 1, costi: 2, persone: 2, mezzi: 2, collaboratori: 2 });
    // Fase 5: il collaboratore legge i documenti e lavora i ticket (architettura §16.1). Fase 6: l'organico e i mezzi in lettura.
    if (ruolo === 'collaboratore') Object.assign(p, { dashboard: 1, clienti: 1, commesse: 1, attivita: 2, rapportini: 2, spese: 2, documenti: 1, ticket: 2, persone: 1, mezzi: 1 });
    if (ruolo === 'lettura') Object.assign(p, { dashboard: 1, clienti: 1, commesse: 1, preventivi: 1, attivita: 1, rapportini: 1, spese: 1, fatturazione: 1, banche: 1, documenti: 1, ticket: 1, costi: 1, persone: 1, mezzi: 1, collaboratori: 1 });
    return p;
  }

  // I campi dei soldi: senza il permesso "costi" il server li toglie (architettura §3).
  const CAMPI_COSTI = new Set(['tariffa', 'tariffaFissa', 'costoFisso', 'ultimaTariffa', 'maggExtra', 'euroKm', 'compensoOre',
    'rimborsoKm', 'totale', 'costoOrario', 'prezzoOrario', 'budgetEuro', 'importoContratto', 'valore', 'soldi', 'quanto',
    'EURO_KM', 'COSTO_ORARIO',
    // fase 2: i soldi dei preventivi
    'prezzo', 'importo', 'imponibile', 'contributo', 'conti', 'scontoEuro', 'IVA', 'EPPI_INTEGRATIVO', 'RITENUTA',
    // fase 3: il costo delle ore e della commessa (i soldi della persona invece si vedono: §14.1)
    'costo', 'costoCommessa', 'costoOreRegistrate']);
  // Le risposte coi soldi della persona (importi delle spese, rimborsi km, veicoli): si vedono anche senza "costi".
  const SOLDI_DELLA_PERSONA = new Set(['spese', 'salvaSpesa', 'togliSpesa', 'togliFotoSpesa', 'trasferte', 'salvaTrasferta', 'togliTrasferta',
    'rimborsi', 'segnaRimborsato', 'riepilogoSpese', 'veicoli', 'salvaVeicolo']);
  function togliCosti(x) {
    if (Array.isArray(x)) return x.map(togliCosti);
    if (x && typeof x === 'object') {
      const o = {};
      Object.keys(x).forEach(k => { if (!CAMPI_COSTI.has(k)) o[k] = togliCosti(x[k]); });
      return o;
    }
    return x;
  }

  /**
   * I dati di esempio. Opzioni: chi ('manuel', 'laura', 'marco', 'lettura') sceglie
   * l'utente di prova; utente e permessi (quelli veri di chi fa la visita) vincono.
   */
  function crea(opzioni) {
    const o = opzioni || {};
    const oggi = o.oggi || C.oggiIso();
    const anno = Number(oggi.slice(0, 4));
    const impostazioni = {
      RAGIONE_SOCIALE: 'Studio Tecnico GM', TECNICO: 'Manuel Gasparotto', INDIRIZZO: 'Via Roma 1, 36063 Marostica (VI)',
      PARTITA_IVA: '03123456786', EMAIL: 'studio@esempio.it', TELEFONO: '0424 000 000', PEC: 'studio@pec.esempio.it',
      EURO_KM: 0.76, AUTO: 'Volvo XC40', COSTO_ORARIO: 18, TICKET_ATTIVO: 'NO', FIRMA_TECNICO: '',
      // fase 2: quello che il preventivo chiede per legge, e le regole fiscali
      POLIZZA_COMPAGNIA: 'Assicurazioni Esempio Spa', POLIZZA_NUMERO: '0012345', POLIZZA_MASSIMALE: '1.000.000 €',
      TITOLI: 'Perito industriale iscritto al Collegio dei Periti Industriali di Vicenza. Progettazione elettrotecnica e automazione.',
      IVA: 22, EPPI_INTEGRATIVO: 5, RITENUTA: 20, PREVENTIVO_VALIDITA_GIORNI: 30,
      PREVENTIVO_CONDIZIONI: 'Prezzi validi per le prestazioni descritte. Le varianti richieste durante i lavori si quotano a parte. Pagamenti a 30 giorni dalla fattura.',
      // fase 3: approvazioni, tabelle ACI, indennità di trasferta, ore di una giornata
      APPROVAZIONE: 'collaboratori', ACI_ANNO: anno, INDENNITA_TRASFERTA: '', ORE_GIORNALIERE: 8,
    };
    const utenti = [
      { id: 1, nome: 'Manuel Gasparotto', email: 'manuel@esempio.it', ruolo: 'titolare', attivo: true, ultimoAccesso: istante(oggi, 0, '08:12') },
      { id: 2, nome: 'Laura Bianchi', email: 'laura@esempio.it', ruolo: 'amministrazione', attivo: true, ultimoAccesso: istante(oggi, -1, '17:40') },
      { id: 3, nome: 'Marco Rossato', email: 'marco@esempio.it', ruolo: 'collaboratore', attivo: true, ultimoAccesso: istante(oggi, 0, '07:55') },
      { id: 4, nome: 'Studio Conti', email: 'commercialista@esempio.it', ruolo: 'lettura', attivo: false, ultimoAccesso: null },
    ];
    const sessioni = [
      { id: 1, idUtente: 1, dispNome: 'UFFICIO-PC (manuel)', app: 'ufficio 0.5.0', creata: istante(oggi, -20, '09:00'), ultimoUso: istante(oggi, 0, '08:12') },
      { id: 2, idUtente: 1, dispNome: 'Pixel di Manuel', app: 'telefono 0.5.0', creata: istante(oggi, -20, '09:05'), ultimoUso: istante(oggi, -1, '18:30') },
      { id: 3, idUtente: 2, dispNome: 'PORTATILE-LAURA (laura)', app: 'ufficio 0.5.0', creata: istante(oggi, -10, '10:00'), ultimoUso: istante(oggi, -1, '17:40') },
      { id: 4, idUtente: 3, dispNome: 'Galaxy di Marco', app: 'telefono 0.5.0', creata: istante(oggi, -15, '07:30'), ultimoUso: istante(oggi, 0, '07:55') },
    ];
    const permessi = {};
    R.ORDINE_RUOLI.forEach(r => { permessi[r] = permessiDi(r); });

    const soggetto = x => Object.assign({
      alias: [], gruppo: '', email: '', pec: '', telefono: '', partitaIva: '', codiceFiscale: '', codiceSdi: '', indirizzo: '', cap: '',
      citta: '', provincia: '', nazione: 'IT', tariffaFissa: null, costoFisso: null, ultimaTariffa: null, pagaViaggio: null,
      kmRimborsati: null, note: '', cliente: false, fornitore: false, archiviato: false,
    }, x);
    const soggetti = [
      soggetto({ id: 'C001', nome: 'Elettrodinamica', cliente: true, citta: 'Thiene', provincia: 'VI', cap: '36016', indirizzo: 'Via dell\'Industria 12',
        partitaIva: '01234567897', codiceFiscale: '01234567897', codiceSdi: 'M5UXCR1', pec: 'elettrodinamica@pec.esempio.it', email: 'rapportini@elettrodinamica.esempio',
        telefono: '0445 123456', tariffaFissa: 30, pagaViaggio: false, kmRimborsati: true }),
      soggetto({ id: 'C002', nome: 'Rossi Impianti Srl', alias: ['Rossi'], cliente: true, citta: 'Bassano del Grappa', provincia: 'VI', cap: '36061', indirizzo: 'Via Nuova 3',
        partitaIva: '04455667784', email: 'rossi@esempio.com', telefono: '0424 555 010', ultimaTariffa: 42 }),
      soggetto({ id: 'C003', nome: 'Mario Bianchi', cliente: true, citta: 'Marostica', provincia: 'VI', cap: '36063', indirizzo: 'Via Montegrappa 8',
        codiceFiscale: 'BNCMRA70A01F138X', email: 'mario.bianchi@esempio.it', telefono: '347 000 1122', ultimaTariffa: 38 }),
      soggetto({ id: 'C004', nome: 'Impianti Vecchi Snc', cliente: true, citta: 'Schio', provincia: 'VI', archiviato: true, ultimaTariffa: 35 }),
      soggetto({ id: 'F001', nome: 'Comel Forniture Elettriche', fornitore: true, citta: 'Vicenza', provincia: 'VI', cap: '36100', indirizzo: 'Viale del Lavoro 20',
        partitaIva: '09988776655', codiceSdi: 'KRRH6B9', pec: 'comel@pec.esempio.it', email: 'ordini@comel.esempio', telefono: '0444 900 100' }),
      soggetto({ id: 'F002', nome: 'Verifiche Nord Snc', fornitore: true, citta: 'Padova', provincia: 'PD', partitaIva: '05544332215', email: 'info@verifichenord.esempio', telefono: '049 700 200' }),
    ];
    const referenti = [
      { id: 1, idSoggetto: 'C001', nome: 'Giulia Dal Santo', ruolo: 'Ufficio tecnico', telefono: '0445 123456 int. 4', email: 'g.dalsanto@elettrodinamica.esempio', note: '', ordine: 1 },
      { id: 2, idSoggetto: 'C001', nome: 'Paolo Zordan', ruolo: 'Amministrazione', telefono: '0445 123456 int. 2', email: 'amministrazione@elettrodinamica.esempio', note: '', ordine: 2 },
      { id: 3, idSoggetto: 'C002', nome: 'Andrea Rossi', ruolo: 'Titolare', telefono: '333 123 4567', email: 'rossi@esempio.com', note: '', ordine: 1 },
      { id: 4, idSoggetto: 'F001', nome: 'Sara Comel', ruolo: 'Ordini', telefono: '0444 900 101', email: 'ordini@comel.esempio', note: '', ordine: 1 },
    ];
    const sede = x => Object.assign({ cap: '', provincia: 'VI', note: '', archiviata: false }, x);
    const sedi = [
      sede({ id: 1, idSoggetto: 'C001', tipo: 'sede', nome: 'Sede legale', indirizzo: 'Via dell\'Industria 12', cap: '36016', citta: 'Thiene' }),
      sede({ id: 2, idSoggetto: 'C001', tipo: 'impianto', nome: 'Magazzino automatico Batokyo', indirizzo: 'Zona industriale', citta: 'Schio' }),
      sede({ id: 3, idSoggetto: 'C001', tipo: 'impianto', nome: 'Cabina MT Acme', indirizzo: 'Via Roma 40', citta: 'Zanè' }),
      sede({ id: 4, idSoggetto: 'C002', tipo: 'sede', nome: 'Capannone', indirizzo: 'Via Nuova 3', cap: '36061', citta: 'Bassano del Grappa' }),
      sede({ id: 5, idSoggetto: 'C003', tipo: 'impianto', nome: 'Fotovoltaico casa', indirizzo: 'Via Montegrappa 8', cap: '36063', citta: 'Marostica' }),
    ];
    // Il venerdì di questa settimana: "finisce venerdì".
    const venerdi = (() => { const d = new Date(oggi + 'T12:00:00'); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return iso(d); })();
    const aa = String(anno % 100).padStart(2, '0');
    const commessa = x => Object.assign({
      stato: 'APERTA', indirizzo: '', budgetOre: null, budgetEuro: null, prezzoOrario: null, costoOrario: null, euroKm: null,
      inizio: '', finePrevista: '', cartella: '', codicePrecedente: '', note: '', sedeId: null, responsabileId: null, persone: [],
      importoContratto: null, archiviata: false, modello: false,
    }, x);
    const commesse = [
      commessa({ id: aa + 'ST044', idCliente: 'C001', descrizione: 'Nuovo magazzino automatico', sedeId: 2, responsabileId: 1, persone: [1, 3],
        importoContratto: 3700, budgetOre: 120, prezzoOrario: 30, budgetEuro: 3600, inizio: giorno(oggi, -45), finePrevista: venerdi }),
      commessa({ id: aa + 'ST045', idCliente: 'C002', descrizione: 'Quadro capannone', sedeId: 4, persone: [1],
        importoContratto: 1600, budgetOre: 40, prezzoOrario: 42, budgetEuro: 1680, inizio: giorno(oggi, -60), finePrevista: giorno(oggi, 38) }),
      commessa({ id: aa + 'ST046', idCliente: 'C001', descrizione: 'Linea 3', sedeId: 3, responsabileId: 3, persone: [3],
        budgetOre: 24, inizio: giorno(oggi, -30), finePrevista: giorno(oggi, -4) }),
      commessa({ id: aa + 'ST047', idCliente: 'C003', descrizione: 'Impianto fotovoltaico', sedeId: 5, persone: [1] }),
      commessa({ id: aa + 'ST041', idCliente: 'C002', descrizione: 'Verifica impianto di terra', stato: 'SOSPESA', sedeId: 4, responsabileId: 1, persone: [1] }),
      commessa({ id: aa + 'ST040', idCliente: 'C001', descrizione: 'Revisione cabina', stato: 'CHIUSA', sedeId: 3, responsabileId: 1, persone: [1, 3], budgetOre: 16 }),
      commessa({ id: aa + 'ST038', idCliente: 'C004', descrizione: 'Vecchio quadro officina', stato: 'CHIUSA', archiviata: true, responsabileId: 1 }),
      commessa({ id: aa + 'ST039', idCliente: 'C003', descrizione: 'Pratica fotovoltaico domestico', modello: true, budgetOre: 12, prezzoOrario: 38, importoContratto: 900 }),
    ];
    const prestazione = (id, idCommessa, nome, valore, av, ordine) => ({ id, idCommessa, nome, descrizione: '', valore, avanzamento: av, stato: R.statoPrestazione(av), ordine });
    const prestazioni = [
      prestazione(1, aa + 'ST044', 'Sopralluogo e rilievo', 300, 100, 1),
      prestazione(2, aa + 'ST044', 'Progetto esecutivo', 1800, 60, 2),
      prestazione(3, aa + 'ST044', 'Direzione lavori', 1200, 0, 3),
      prestazione(4, aa + 'ST044', 'Dichiarazione di rispondenza', 400, 0, 4),
      prestazione(5, aa + 'ST045', 'Progetto quadro', 900, 100, 1),
      prestazione(6, aa + 'ST045', 'Collaudo', 700, 30, 2),
      prestazione(7, aa + 'ST039', 'Sopralluogo', 150, 0, 1),
      prestazione(8, aa + 'ST039', 'Progetto e pratica GSE', 550, 0, 2),
      prestazione(9, aa + 'ST039', 'Dichiarazione di conformità', 200, 0, 3),
    ];
    const numerazioni = [
      { tipo: 'commessa', formato: '{AA}ST{NNN}', annuale: false, ultimo: 47 },
      { tipo: 'rapportino', formato: 'RAP/{AAAA}/{NNNN}', annuale: true, ultimo: 0 },
      { tipo: 'preventivo', formato: 'PR/{AAAA}/{NNN}', annuale: true, ultimo: 13 },
    ];
    const ana = { clienti: [], fornitori: [], soggetti, commesse, referenti, sedi, prestazioni, utenti, numerazioni, gruppi: [], impostazioni };

    // ------------------------------------------------------------- rapportini
    let n = 0;
    const rapportini = [];
    const r = (data, idCliente, idCommessa, descrizione, oreLavoro, oreViaggio, km, spese, stato, idUtente, extra) => {
      n += 1;
      const c = soggetti.find(x => x.id === idCliente);
      const m = commesse.find(x => x.id === idCommessa);
      const regole = C.regoleDi(c, [], impostazioni, m);
      const u = utenti.find(x => x.id === idUtente) || utenti[0];
      const base = Object.assign({
        id: 'RAP/' + data.slice(0, 4) + '/' + due(n).padStart(4, '0'), idLocale: 'esempio-' + n, idUtente: u.id,
        data, tecnico: u.nome, idCliente, cliente: c.nome, gruppo: '', idCommessa, commessa: m ? m.descrizione : '', ticket: '', luogo: '', descrizione,
        oreLavoro, oreExtra: 0, oreViaggio, km, spese, noteSpese: spese ? 'Pranzo' : '', foto: [],
        tariffa: regole.tariffaFissa !== null ? regole.tariffaFissa : (m && m.prezzoOrario) || c.ultimaTariffa,
        pagaViaggio: regole.pagaViaggio, kmRimborsati: regole.kmRimborsati, euroKm: regole.euroKm,
        maggExtra: regole.maggExtra, costoOrario: impostazioni.COSTO_ORARIO, noteInterne: '', firma: null,
        firmatario: '', firmatoIl: '', stato, inviatoIl: '', fatturatoIl: '', creato: data + 'T18:00:00', modificato: '',
      }, extra || {});
      rapportini.push(Object.assign(base, C.calcola(base, regole)));
    };
    const c44 = aa + 'ST044';
    const c45 = aa + 'ST045';
    const c46 = aa + 'ST046';
    const c47 = aa + 'ST047';
    // Il mese prima: il magazzino fatturato, tre rapportini di Rossi ancora da fatturare.
    [2, 3, 7, 8, 9, 14, 15].forEach(g => r(mesePrima(oggi, g), 'C001', c44, 'Cablaggio dei quadri di zona del magazzino.', 8, 1, 96, 0, 'FATTURATO', g % 2 ? 1 : 3, { fatturatoIl: mesePrima(oggi, 28) + 'T09:00:00' }));
    r(mesePrima(oggi, 10), 'C002', c45, 'Progetto del quadro generale.', 8, 0.5, 22, 0, 'FATTURATO', 1, { fatturatoIl: mesePrima(oggi, 28) + 'T09:00:00' });
    r(mesePrima(oggi, 16), 'C002', c45, 'Disegni del quadro e distinta materiali.', 8, 0.5, 22, 0, 'FATTURATO', 1, { fatturatoIl: mesePrima(oggi, 28) + 'T09:00:00' });
    r(mesePrima(oggi, 22), 'C002', c45, 'Montaggio del quadro in officina.', 8, 0.5, 22, 12.5, 'INVIATO', 1, { inviatoIl: mesePrima(oggi, 30) + 'T09:00:00' });
    r(mesePrima(oggi, 23), 'C002', c45, 'Cablaggio delle partenze.', 8, 0.5, 22, 0, 'INVIATO', 1, { inviatoIl: mesePrima(oggi, 30) + 'T09:00:00' });
    r(mesePrima(oggi, 24), 'C002', c45, 'Prove del quadro con il cliente.', 7.5, 0.5, 22, 0, 'FIRMATO', 1, { firmatario: 'Andrea Rossi', firmatoIl: mesePrima(oggi, 24) + 'T17:00:00' });
    // Questo mese.
    r(nelMese(oggi, 13), 'C001', c44, 'Cablaggio del quadro di linea 1.', 8, 1, 96, 14.5, 'INVIATO', 1, { inviatoIl: oggi + 'T09:00:00' });
    r(nelMese(oggi, 9), 'C001', c44, 'Collaudo sensori e messa in servizio del nastro.', 7.5, 1.5, 96, 0, 'INVIATO', 3, { inviatoIl: oggi + 'T09:00:00' });
    r(nelMese(oggi, 8), 'C003', c47, 'Sopralluogo sul tetto e misure per i pannelli.', 6, 0.5, 18, 0, 'BOZZA', 1);
    r(nelMese(oggi, 6), 'C001', c46, 'Verifica dei finecorsa e prova a vuoto.', 6, 1, 64, 0, 'FIRMATO', 3, { firmatario: 'Giulia Dal Santo', firmatoIl: nelMese(oggi, 6) + 'T17:10:00' });
    r(nelMese(oggi, 5), 'C002', c45, 'Sostituzione interruttore generale.', 3.5, 0.5, 22, 0, 'BOZZA', 1);
    r(nelMese(oggi, 3), 'C001', c46, 'Programmazione PLC della linea.', 8, 1, 64, 0, 'BOZZA', 3);
    r(nelMese(oggi, 2), 'C001', c46, 'Taratura dei sensori di linea.', 6, 1, 64, 0, 'FIRMATO', 3, { firmatario: 'Giulia Dal Santo', firmatoIl: nelMese(oggi, 2) + 'T16:40:00' });
    r(nelMese(oggi, 1), 'C001', c44, 'Taratura inverter del nastro 2 e prova a vuoto con il capo reparto.', 2.5, 1, 96, 12.5, 'FIRMATO', 1,
      { firmatario: 'Giulia Dal Santo', firmatoIl: nelMese(oggi, 1) + 'T17:02:00' });
    r(nelMese(oggi, 0), 'C002', c45, 'Verifica impianto di terra.', 3, 1, 30, 0, 'BOZZA', 1);
    // Fase 3: i rapportini di Marco vanno approvati; il più recente aspetta ancora.
    rapportini.forEach(x => Object.assign(x, { statoApprovazione: x.idUtente === 3 && x.data.slice(0, 7) === oggi.slice(0, 7) ? 'approvato' : '', approvatoDa: null, approvatoIl: '', motivoRifiuto: '', righeSpese: [] }));
    const ultimoDiMarco = rapportini.filter(x => x.idUtente === 3 && x.stato === 'BOZZA').sort((x, y) => (x.data < y.data ? 1 : -1))[0];
    if (ultimoDiMarco) ultimoDiMarco.statoApprovazione = 'da_approvare';

    numerazioni[1].ultimo = rapportini.filter(x => x.data.slice(0, 4) === String(anno)).length;
    const fase3 = creaFase3(oggi, anno, aa, impostazioni);

    // ------------------------------------------------------------- registro
    const registro = [];
    let nr = 0;
    const voce = (quando, idUtente, azione, tabella, idRiga, prima, dopo, nota) => {
      nr += 1;
      const u = utenti.find(x => x.id === idUtente);
      registro.push({ id: nr, quando, idUtente: u.id, utente: u.nome, disp: 'UFFICIO-PC (manuel)', azione, tabella, idRiga: String(idRiga), prima, dopo, nota: nota || '' });
    };
    voce(istante(oggi, -1, '11:10'), 2, 'archiviaSoggetto', 'soggetti', 'C004', { archiviato: 0 }, { archiviato: 1 });
    voce(istante(oggi, -1, '17:45'), 1, 'salvaUtente', 'utenti', 3, { ruolo: 'lettura' }, { ruolo: 'collaboratore' });
    voce(istante(oggi, -1, '18:02'), 1, 'salvaPrestazione', 'prestazioni', 4, null, { valore: 400 });
    voce(istante(oggi, 0, '09:31'), 1, 'stato', 'rapportini', rapportini[2].id, { stato: 'INVIATO' }, { stato: 'FATTURATO' });
    voce(istante(oggi, 0, '12:05'), 3, 'salvaRapportino', 'rapportini', rapportini[rapportini.length - 3].id, null, { ore_lavoro: 8, descrizione: 'Programmazione PLC della linea.' });
    voce(istante(oggi, 0, '16:20'), 2, 'salvaSoggetto', 'soggetti', 'C002', { ultima_tariffa: 40 }, { ultima_tariffa: 42 });
    registro.reverse();

    const copie = {
      copie: [0, -1, -2, -3].map((d, i) => ({ id: 4 - i, quando: istante(oggi, d, '02:30'), file: 'wisper-' + giorno(oggi, d).replace(/-/g, '') + '.db', byte: 4200000 + d * 15000,
        locale: 'ok', fuori: 'ok · ' + (3 - i) + ' file', foglio: 'ok', nota: 'notturna' })),
      file: [], oraCopia: '02:30', prossima: giorno(oggi, 1) + 'T02:30:00', postino: 'lo script del foglio',
    };
    const cestino = [
      { id: 'f-cest-1', nome: 'scontrino-pranzo.jpg', mime: 'image/jpeg', tipo: 'spesa', idRapportino: rapportini[rapportini.length - 2].id, idCommessa: '', cestinato: istante(oggi, -2, '10:15') },
      { id: 'f-cest-2', nome: 'Schema unifilare v1.pdf', mime: 'application/pdf', tipo: 'documento', idRapportino: '', idCommessa: c44, cestinato: istante(oggi, -6, '15:40') },
    ];

    // ------------------------------------------------------------- fase 2: listino, preventivi, attività
    const listino = [
      ['SR', 'Sopralluogo e rilievo', 'corpo', '', 350], ['PP', 'Progetto preliminare', 'corpo', '', 600], ['PE', 'Progetto esecutivo', 'corpo', '', 1900],
      ['DL', 'Direzione lavori', 'ore', 'h', 45], ['DIRI', 'Dichiarazione di rispondenza (DiRi)', 'corpo', '', 450], ['VP', 'Verifiche periodiche', 'corpo', '', null],
      ['CO', 'Collaudo', 'corpo', '', 380], ['OC', 'Ore di consulenza', 'ore', 'h', 45],
    ].map((x, i) => ({ id: i + 1, codice: x[0], nome: x[1], descrizione: '', modo: x[2], unita: x[3], prezzo: x[4], attivo: true, ordine: i + 1 }));
    const vp = (id, descrizione, modo, quantita, prezzo, extra) => Object.assign({ id, idListino: null, descrizione, modo, quantita, unita: modo === 'ore' ? 'h' : '', prezzo,
      scontoPercentuale: 0, facoltativa: false, alternativa: '', scelta: false }, extra || {});
    const pr = (n, extra) => Object.assign({
      numero: 'PR/' + anno + '/' + String(n).padStart(3, '0'), revisione: 0, idSede: null, idReferente: null, introduzione: '', complessita: 'media', complessitaNota: '',
      oneriPrevisti: '', condizioni: impostazioni.PREVENTIVO_CONDIZIONI, scontoPercentuale: 0, scontoEuro: 0, eppiPercentuale: 5, ivaPercentuale: 22,
      inviatoIl: '', accettatoIl: '', accettatoDa: '', accettazioneModo: '', firma: null, rifiutatoIl: '', motivoRifiuto: '', idCommessa: '', modello: false,
      noteInterne: '', idUtente: 1, scadenzePagamento: [], sezioni: [],
    }, extra);
    const sezioniPr12 = () => [
      { id: 1, titolo: 'Progettazione', ordine: 1, voci: [vp(1, 'Sopralluogo e rilievo', 'corpo', 1, 350, { idListino: 1 }), vp(2, 'Progetto esecutivo impianto elettrico', 'corpo', 1, 1900, { idListino: 3 })] },
      { id: 2, titolo: 'Cantiere', ordine: 2, voci: [vp(3, 'Direzione lavori', 'ore', 16, 45, { idListino: 4 }), vp(4, 'Dichiarazione di rispondenza (DiRi)', 'corpo', 1, 450, { facoltativa: true, idListino: 5 }),
        vp(5, 'Collaudo con strumenti propri', 'corpo', 1, 380, { alternativa: 'Collaudo', scelta: true, idListino: 7 }), vp(6, 'Collaudo con laboratorio esterno', 'corpo', 1, 620, { alternativa: 'Collaudo' })] },
    ];
    const scadenze12 = [
      { id: 1, descrizione: 'Acconto', tipo: 'percentuale', valore: 30, quando: 'firma', data: '', stato: 'prevista' },
      { id: 2, descrizione: 'A fine progetto', tipo: 'percentuale', valore: 40, quando: 'avanzamento', data: '', stato: 'prevista' },
      { id: 3, descrizione: 'Saldo', tipo: 'percentuale', valore: 30, quando: 'fine', data: '', stato: 'prevista' },
    ];
    const preventivi = [
      pr(12, { id: 11, revisione: 0, stato: 'SOSTITUITO', idCliente: 'C002', idSede: 4, idReferente: 3, oggetto: 'Adeguamento impianto elettrico capannone', data: giorno(oggi, -16), scadenza: giorno(oggi, 14),
        inviatoIl: istante(oggi, -16, '10:00'), sezioni: sezioniPr12().map(s => Object.assign(s, { id: s.id + 100, voci: s.voci.map(v => Object.assign(v, { id: v.id + 100, prezzo: v.id === 2 ? 2100 : v.prezzo })) })), scadenzePagamento: [] }),
      pr(12, { id: 12, revisione: 1, stato: 'INVIATO', idCliente: 'C002', idSede: 4, idReferente: 3, oggetto: 'Adeguamento impianto elettrico capannone', data: giorno(oggi, -9), scadenza: giorno(oggi, 6),
        introduzione: 'Come d\'accordo al telefono, la proposta per l\'adeguamento dell\'impianto elettrico del capannone di via Nuova.',
        complessitaNota: 'Impianto esistente senza documentazione: serve il rilievo completo prima del progetto.',
        oneriPrevisti: 'Eventuali diritti per la pratica in Comune, a carico del committente.', inviatoIl: istante(oggi, -9, '11:20'), sezioni: sezioniPr12(), scadenzePagamento: scadenze12.map(x => Object.assign({}, x)) }),
      pr(13, { id: 13, stato: 'BOZZA', idCliente: 'C001', idSede: 3, oggetto: 'Verifica periodica impianto di terra', data: giorno(oggi, -1), scadenza: giorno(oggi, 29), complessita: 'bassa',
        sezioni: [{ id: 3, titolo: 'Verifica', ordine: 1, voci: [vp(7, 'Verifiche periodiche', 'corpo', 1, null, { idListino: 6 })] }] }),
      pr(10, { id: 10, stato: 'ACCETTATO', idCliente: 'C003', idSede: 5, oggetto: 'Fotovoltaico 6 kW', data: giorno(oggi, -20), scadenza: giorno(oggi, 10), complessita: 'bassa',
        oneriPrevisti: 'Nessuno oltre a quelli indicati.', inviatoIl: istante(oggi, -20, '09:00'), accettatoIl: istante(oggi, -15, '18:00'), accettatoDa: 'Mario Bianchi', accettazioneModo: 'email', idCommessa: aa + 'ST047',
        sezioni: [{ id: 4, titolo: 'Progetto', ordine: 1, voci: [vp(8, 'Progetto preliminare', 'corpo', 1, 600, { idListino: 2 })] }] }),
      pr(9, { id: 9, stato: 'ACCETTATO', idCliente: 'C001', idSede: 2, oggetto: 'Revisione quadri del magazzino', data: giorno(oggi, -12), scadenza: giorno(oggi, 18),
        oneriPrevisti: 'Nessuno oltre a quelli indicati.', inviatoIl: istante(oggi, -12, '09:00'), accettatoIl: istante(oggi, -2, '17:30'), accettatoDa: 'Giulia Dal Santo', accettazioneModo: 'documento',
        sezioni: [{ id: 5, titolo: 'Prestazioni', ordine: 1, voci: [vp(9, 'Sopralluogo e rilievo', 'corpo', 1, 350, { idListino: 1 }), vp(10, 'Ore di consulenza', 'ore', 12, 45, { idListino: 8 })] }],
        scadenzePagamento: [{ id: 4, descrizione: 'Alla firma', tipo: 'percentuale', valore: 50, quando: 'firma', data: '', stato: 'prevista' }, { id: 5, descrizione: 'Saldo', tipo: 'percentuale', valore: 50, quando: 'fine', data: '', stato: 'prevista' }] }),
      pr(7, { id: 7, stato: 'INVIATO', idCliente: 'C002', oggetto: 'Quadro di cantiere', data: giorno(oggi, -46), scadenza: giorno(oggi, -16), oneriPrevisti: 'Nessuno.', inviatoIl: istante(oggi, -46, '09:00'),
        sezioni: [{ id: 6, titolo: 'Progetto', ordine: 1, voci: [vp(11, 'Progetto quadro', 'corpo', 1, 900)] }] }),
      pr(0, { id: 20, numero: '', modello: true, stato: 'BOZZA', idCliente: '', oggetto: 'Verifica periodica impianto di terra (modello)', data: giorno(oggi, -60), scadenza: '', complessita: 'bassa',
        sezioni: [{ id: 7, titolo: 'Verifica', ordine: 1, voci: [vp(12, 'Sopralluogo e rilievo', 'corpo', 1, 350, { idListino: 1 }), vp(13, 'Verifiche periodiche', 'corpo', 1, null, { idListino: 6 })] }] }),
    ];

    // Le attività: date vicine a oggi, così il calendario della settimana è sempre pieno.
    const lunediProssimo = (() => { const d = new Date(oggi + 'T12:00:00'); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return iso(d); })();
    const att = (id, titolo, extra) => Object.assign({ id, titolo, descrizione: '', tipo: 'attivita', idCliente: '', idCommessa: '', idPrestazione: null, assegnataA: null, creataDa: 1,
      priorita: 'normale', stato: 'da_fare', scadenza: '', inizio: '', fine: '', tuttoIlGiorno: false, luogo: '', promemoriaMinuti: null, idRicorrenza: null, occorrenza: '',
      fattaIl: '', checklist: [], allegati: [], creato: istante(oggi, -3, '09:00'), modificato: '' }, extra);
    const attivita = [
      att(1, 'Chiamare Rossi per il collaudo', { idCliente: 'C002', idCommessa: c45, assegnataA: 1, priorita: 'alta', scadenza: giorno(oggi, -1) }),
      att(2, 'Sopralluogo cabina MT Acme', { tipo: 'sopralluogo', idCliente: 'C001', idCommessa: c46, assegnataA: 3, inizio: istante(oggi, 0, '14:30'), fine: istante(oggi, 0, '16:00'), luogo: 'Via Roma 40, Zanè', promemoriaMinuti: 60 }),
      att(3, 'Mandare lo schema unifilare a Elettrodinamica', { idCliente: 'C001', idCommessa: c44, assegnataA: 1, scadenza: oggi, promemoriaMinuti: 0,
        checklist: [{ id: 1, testo: 'Aggiornare la revisione', fatta: true, ordine: 1 }, { id: 2, testo: 'Esportare in PDF', fatta: false, ordine: 2 }, { id: 3, testo: 'Mandare a Giulia', fatta: false, ordine: 3 }] }),
      att(4, 'Rinnovo polizza professionale', { assegnataA: 1, scadenza: lunediProssimo, idRicorrenza: 1, occorrenza: lunediProssimo, priorita: 'alta' }),
      att(5, 'Preparare il preventivo per Bianchi', { idCliente: 'C003', scadenza: giorno(oggi, 6) }),
      att(6, 'Riordinare i cataloghi in ufficio', { priorita: 'bassa' }),
      att(7, 'Riunione cantiere Batokyo', { tipo: 'appuntamento', idCliente: 'C001', idCommessa: c44, assegnataA: 1, inizio: istante(oggi, 0, '08:30'), fine: istante(oggi, 0, '10:00'), luogo: 'Magazzino automatico, Schio', promemoriaMinuti: 15 }),
      att(8, 'Collaudo quadro capannone', { tipo: 'appuntamento', idCliente: 'C002', idCommessa: c45, assegnataA: 1, inizio: istante(oggi, 1, '09:00'), fine: istante(oggi, 1, '12:00'), luogo: 'Via Nuova 3, Bassano del Grappa' }),
      att(9, 'Telefonata con Elettrodinamica', { tipo: 'appuntamento', idCliente: 'C001', assegnataA: 1, inizio: istante(oggi, -1, '10:00'), fine: istante(oggi, -1, '11:00'), stato: 'fatta', fattaIl: istante(oggi, -1, '11:00') }),
      att(10, 'Rilievo fotovoltaico Bianchi', { tipo: 'sopralluogo', idCliente: 'C003', idCommessa: c47, assegnataA: 1, inizio: istante(oggi, -2, '15:00'), fine: istante(oggi, -2, '17:00'), stato: 'fatta', fattaIl: istante(oggi, -2, '17:00') }),
      att(11, 'Verifica impianto di terra', { tipo: 'sopralluogo', idCliente: 'C002', idCommessa: aa + 'ST041', assegnataA: 3, inizio: istante(oggi, 3, '09:00'), fine: istante(oggi, 3, '11:30'), luogo: 'Capannone, Bassano del Grappa' }),
      att(12, 'Rilievo Batokyo', { tipo: 'sopralluogo', idCliente: 'C001', idCommessa: c44, assegnataA: 3, inizio: istante(oggi, 2, '08:00'), fine: istante(oggi, 2, '12:00') }),
    ];
    // Una ricorrenza settimanale: le occorrenze dei prossimi 90 giorni, come le crea il server.
    const ricorrenze = [{ id: 1, regola: 'anni', ogni: 1, giorniSettimana: [], fine: '' }, { id: 2, regola: 'settimane', ogni: 1, giorniSettimana: [1], fine: '' }];
    let nAtt = 100;
    for (let g = lunediProssimo; g <= giorno(oggi, 90); g = giorno(g, 7)) {
      attivita.push(att(++nAtt, 'Controllare la PEC dello studio', { assegnataA: 2, scadenza: g, idRicorrenza: 2, occorrenza: g, priorita: 'bassa' }));
    }

    // Chi entra: l'utente vero della visita, oppure uno degli utenti di prova.
    const scelto = { manuel: 1, laura: 2, marco: 3, lettura: 4 }[o.chi || 'manuel'] || 1;
    const io = o.utente ? Object.assign({}, o.utente) : copia(utenti.find(u => u.id === scelto));
    if (!o.utente && io.ruolo === 'lettura') io.attivo = true;
    const permessiIo = o.permessi ? Object.assign({}, o.permessi) : permessiDi(io.ruolo);
    return { oggi, ana, rapportini, registro, copie, cestino, sessioni, permessi, io, permessiIo, listino, preventivi, attivita, ricorrenze,
      ore: fase3.ore, spese: fase3.spese, trasferte: fase3.trasferte, veicoli: fase3.veicoli, timer: {},
      contatori: { s: 10, r: 10, p: 20, f: 10, u: 4, reg: nr, sess: 10, prev: 30, sez: 50, voce: 200, scad: 20, att: nAtt + 10, chk: 20, lis: 20, ric: 10, ore: 50, spesa: 50, tr: 20, ve: 5 } };
  }

  /**
   * I dati di esempio della fase 3: le ore della settimana di Manuel e di Marco (di
   * Marco qualcuna da approvare, una con 13 ore in un giorno, una respinta), le spese
   * (al cliente, allo studio, una senza scontrino), due trasferte, un veicolo.
   */
  function creaFase3(oggi, anno, aa, impostazioni) {
    const c44 = aa + 'ST044';
    const c45 = aa + 'ST045';
    const c46 = aa + 'ST046';
    const sett = RO.settimanaDi(oggi);
    // Un giorno di questa settimana, mai dopo oggi.
    const g = i => (sett[i] <= oggi ? sett[i] : oggi);
    const ieri = giorno(oggi, -1);
    const creato = oggi + 'T08:00:00';
    let n = 0;
    const ora = (idUtente, data, ore, idCommessa, descrizione, stato, extra) => Object.assign({
      id: ++n, idUtente, data, inizio: '', fine: '', pausaMinuti: 0, ore, giornoDopo: false, idCommessa, idPrestazione: null, idAttivita: null, descrizione,
      fatturabile: !!idCommessa, tipo: 'ordinaria', costoOrario: idCommessa ? impostazioni.COSTO_ORARIO : 15, stato, approvataDa: stato === 'respinta' ? 1 : null, approvataIl: '',
      motivoRifiuto: '', dalTimer: false, tolta: '', creato, modificato: creato,
    }, extra || {});
    const ore = [
      ora(1, g(0), 6, c44, 'Progetto esecutivo: schema unifilare', 'approvata'),
      ora(1, g(0), 1.5, '', 'Aggiornamento normativa CEI', 'approvata'),
      ora(1, g(1), 4, c45, 'Collaudo quadro: preparazione verbali', 'approvata', { inizio: '08:30', fine: '12:30' }),
      ora(1, oggi, 1.5, c44, 'Riunione di cantiere Batokyo', 'bozza'),
      ora(3, g(0), 7, c46, 'Calcolo cabina MT', 'da_approvare'),
      ora(3, ieri, 8, c46, 'Cablaggio quadro della cabina', 'da_approvare', { inizio: '08:00', fine: '17:00', pausaMinuti: 60 }),
      ora(3, ieri, 5, c46, 'Prova notturna della cabina', 'da_approvare', { tipo: 'straordinaria' }),
      ora(3, g(0), 2, '', 'Riordino del magazzino', 'respinta', { motivoRifiuto: 'Il riordino del magazzino non si segna: è dentro le ore di studio' }),
    ];
    let s = 0;
    const foto = () => [{ id: 'esempio-scontrino-' + (s + 1), url: '', nome: 'scontrino.jpg' }];
    const spesa = (idUtente, data, importo, categoria, descrizione, idCommessa, destinazione, pagataDaMe, stato, conFoto, extra) => Object.assign({
      id: ++s, idUtente, data, importo, categoria, descrizione, idCommessa, idCliente: '', idRapportino: '', idTrasferta: null, destinazione, anticipazione: false, pagataDaMe,
      stato, approvataDa: null, approvataIl: '', motivoRifiuto: '', rimborsataIl: '', fatturataIl: '', dalRapportino: false, foto: conFoto ? foto() : [], tolta: '', creato, modificato: creato,
    }, extra || {});
    const spese = [
      spesa(1, g(0), 8.4, 'pedaggio', 'Pedaggio A4 Vicenza Ovest', c44, 'cliente', true, 'approvata', true),
      spesa(1, g(1), 62, 'carburante', 'Gasolio', '', 'studio', false, 'approvata', true),
      spesa(3, g(1), 14.5, 'vitto', 'Pranzo in cantiere', c45, 'cliente', true, 'da_approvare', false),
      spesa(1, oggi, 3, 'parcheggio', 'Parcheggio Schio centro', c44, 'cliente', true, 'approvata', false),
      spesa(1, oggi, 21.9, 'materiale', 'Morsetti e fascette', '', 'studio', false, 'approvata', true),
      spesa(3, ieri, 8.4, 'pedaggio', 'Pedaggio A4', c46, 'cliente', true, 'da_approvare', true),
    ];
    const veicoli = [{ id: 1, nome: 'Volvo XC40', alimentazione: 'ibrida', euroKm: 0.76, annoAci: anno, attivo: true, creato, modificato: creato }];
    const trasferta = (id, idUtente, dal, destinazione, motivo, idCommessa, km, stato) => ({
      id, idUtente, dal, al: dal, destinazione, motivo, idCommessa, idCliente: '', km, andataRitorno: true, idVeicolo: 1, veicolo: 'Volvo XC40', euroKm: 0.76, indennita: 0,
      stato, approvataDa: null, approvataIl: '', motivoRifiuto: '', rimborsataIl: '', tolta: '', creato, modificato: creato,
    });
    const trasferte = [
      trasferta(1, 1, g(0), 'Schio, cantiere Batokyo', 'Riunione di cantiere', c44, 60, 'approvata'),
      trasferta(2, 3, ieri, 'Zanè, cabina MT Acme', 'Prova notturna della cabina', c46, 18, 'da_approvare'),
    ];
    return { ore, spese, trasferte, veicoli };
  }

  // ======================================================================= dashboard

  /**
   * La Dashboard calcolata sui dati di esempio, come la fa il server: urgenti,
   * questa settimana, da pianificare, ognuna con dove porta. Il collaboratore
   * vede solo le sue cose; senza "costi" niente soldi.
   */
  function dashboard(dati) {
    const oggi = dati.oggi;
    const soldi = R.puo(dati.permessiIo, 'costi');
    const mio = dati.io.ruolo === 'collaboratore';
    const ana = dati.ana;
    const nome = id => (ana.soggetti.find(s => s.id === id) || { nome: id }).nome;
    const vivi = dati.rapportini.filter(r => r.stato !== 'ANNULLATO' && (!mio || r.idUtente === dati.io.id));
    const commesse = ana.commesse.filter(m => !m.modello && !m.archiviata && (!mio || (m.persone || []).indexOf(dati.io.id) >= 0 || m.responsabileId === dati.io.id));
    const urgenti = [];
    const settimana = [];
    const pianificare = [];

    // Soldi fermi: rapportini firmati o inviati dei mesi prima, non ancora fatturati.
    if (soldi && !mio) {
      const mese = oggi.slice(0, 7);
      const vecchi = vivi.filter(r => (r.stato === 'FIRMATO' || r.stato === 'INVIATO') && r.data.slice(0, 7) < mese);
      const perCliente = new Map();
      vecchi.forEach(r => { if (!perCliente.has(r.idCliente)) perCliente.set(r.idCliente, []); perCliente.get(r.idCliente).push(r); });
      Array.from(perCliente.entries()).forEach(([id, lista]) => {
        const m = lista[0].data.slice(0, 7);
        urgenti.push({ tipo: 'fatturare', gravita: 'soldi', titolo: lista.length + (lista.length === 1 ? ' rapportino di ' : ' rapportini di ') + C.nomeMese(m).split(' ')[0].toLowerCase() + ' ancora da fatturare',
          dettaglio: nome(id) + ' · ' + C.euro(lista.reduce((s, r) => s + C.num(r.totale), 0)), quanto: C.centesimi(lista.reduce((s, r) => s + C.num(r.totale), 0)), unita: 'euro',
          collegamento: { pagina: 'fatturazione', filtro: { mese: m } } });
      });
    }
    commesse.forEach(m => {
      if (m.stato !== 'APERTA') return;
      const k = C.cruscotto(m, vivi, ana.impostazioni, oggi, ana.soggetti.find(s => s.id === m.idCliente));
      if (k.livelloOre === 'sforato') {
        urgenti.push({ tipo: 'budget', gravita: 'urgente', titolo: m.descrizione + ' è oltre il budget', dettaglio: C.numero(k.ore) + ' ore su ' + C.numero(k.budgetOre) + ' · ' + nome(m.idCliente),
          collegamento: { pagina: 'commessa', id: m.id } });
      }
      if (R.inRitardo(m, oggi)) {
        const giorni = Math.round((new Date(oggi + 'T12:00:00') - new Date(m.finePrevista + 'T12:00:00')) / 86400000);
        const sede = ana.sedi.find(s => String(s.id) === String(m.sedeId));
        urgenti.push({ tipo: 'scadenza', gravita: 'urgente', titolo: m.descrizione + ' è scaduta da ' + giorni + (giorni === 1 ? ' giorno' : ' giorni'),
          dettaglio: [nome(m.idCliente), sede ? sede.nome : ''].filter(Boolean).join(' · '), collegamento: { pagina: 'commessa', id: m.id } });
      } else if (m.finePrevista && m.finePrevista >= oggi && m.finePrevista <= giorno(oggi, 7)) {
        const quando = R.dataTitolo(m.finePrevista, oggi).split(' ')[0].toLowerCase();
        settimana.push({ tipo: 'scadenza', gravita: 'info', titolo: m.descrizione + ' finisce ' + quando,
          dettaglio: m.id + (k.budgetOre ? ' · ' + C.numero(k.ore) + ' ore su ' + C.numero(k.budgetOre) : ''), collegamento: { pagina: 'commessa', id: m.id } });
      }
      if (!k.budgetOre && !m.importoContratto) pianificare.push({ tipo: 'budget', gravita: 'info', titolo: m.descrizione + ' non ha un budget', dettaglio: m.id + ' · ' + nome(m.idCliente), collegamento: { pagina: 'commessa', id: m.id } });
    });
    // Da far firmare da più di una settimana.
    const ferme = vivi.filter(r => r.stato === 'BOZZA' && r.data <= giorno(oggi, -7));
    if (ferme.length) {
      urgenti.push({ tipo: 'firma', gravita: 'attenzione', titolo: ferme.length + (ferme.length === 1 ? ' rapportino da far firmare' : ' rapportini da far firmare') + ' da più di una settimana',
        dettaglio: Array.from(new Set(ferme.map(r => r.cliente))).join(', '), collegamento: { pagina: 'rapportini', filtro: { quali: 'firmare', mese: '' } } });
    }
    // I giorni di questa settimana senza rapportino (di chi è entrato).
    const senzaRapportino = [];
    if (R.puo(dati.permessiIo, 'rapportini', 2)) {
      const d = new Date(oggi + 'T12:00:00');
      const lunedi = new Date(d);
      lunedi.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      for (let i = 0; i < 5; i++) {
        const g = new Date(lunedi);
        g.setDate(lunedi.getDate() + i);
        const gi = iso(g);
        if (gi >= oggi) break;
        if (!dati.rapportini.some(r => r.data === gi && r.stato !== 'ANNULLATO' && r.idUtente === dati.io.id)) {
          senzaRapportino.push(gi);
          settimana.unshift({ tipo: 'giorno', gravita: 'attenzione', titolo: R.dataTitolo(gi, oggi).replace(/ \d+ \w+$/, ' ' + g.getDate()) + ' senza rapportino',
            dettaglio: 'Fai clic per scriverlo', collegamento: { pagina: 'nuovoRapportino', data: gi } });
        }
      }
    }
    if (soldi && !mio && R.puo(dati.permessiIo, 'fatturazione')) {
      const mese = oggi.slice(0, 7);
      const da = vivi.filter(r => (r.stato === 'FIRMATO' || r.stato === 'INVIATO') && r.data.slice(0, 7) === mese);
      if (da.length) {
        const clienti = new Set(da.map(r => r.idCliente)).size;
        settimana.push({ tipo: 'fatturare', gravita: 'soldi', titolo: 'Da fatturare a ' + C.nomeMese(mese).split(' ')[0].toLowerCase(),
          dettaglio: clienti + (clienti === 1 ? ' cliente · ' : ' clienti · ') + da.length + (da.length === 1 ? ' rapportino' : ' rapportini'),
          quanto: C.centesimi(da.reduce((s, r) => s + C.num(r.totale), 0)), unita: 'euro', collegamento: { pagina: 'fatturazione', filtro: { mese } } });
      }
    }
    if (!mio) {
      const senza = commesse.filter(m => m.stato === 'APERTA' && !m.responsabileId);
      if (senza.length) {
        pianificare.push({ tipo: 'responsabile', gravita: 'info', titolo: senza.length === 1 ? '1 commessa senza responsabile' : senza.length + ' commesse senza responsabile',
          dettaglio: senza.map(m => m.id).join(', '), collegamento: { pagina: 'commesse', filtro: { stato: 'APERTA', responsabile: 'nessuno' } } });
      }
    }
    if (soldi && !mio) {
      ana.soggetti.filter(s => s.cliente && !s.archiviato && !s.codiceSdi && !s.pec && s.partitaIva).forEach(s => {
        pianificare.push({ tipo: 'sdi', gravita: 'info', titolo: s.nome.replace(/ Srl$/, '') + ': mancano codice SDI e PEC', dettaglio: 'Serviranno per le fatture', collegamento: { pagina: 'cliente', id: s.id } });
      });
    }
    dashboardFase2(dati, { urgenti, settimana, pianificare, mio, soldi, nome });
    const conta = R.contaCommesse(commesse, oggi);
    const numeri = { commesse: { aperte: conta.aperte, sospese: conta.sospese, chiuse: conta.chiuse, inRitardo: conta.inRitardo }, giorniSenzaRapportino: senzaRapportino };
    dashboardFase3(dati, { urgenti, settimana, pianificare, mio, soldi }, numeri);
    if (!mio) dashboardFase4(dati, numeri);
    return { ok: true, per: mio ? 'collaboratore' : 'titolare', oggi, urgenti, settimana, pianificare, numeri };
  }

  // ======================================================================= risposte

  const NONPERMESSO = cosa => ({ ok: false, errore: 'Non hai il permesso per ' + cosa + ': chiedi al titolare', permesso: false });

  /** Il modulo e il livello che servono a ogni azione (come nel server). */
  const SERVE = {
    io: null, anagrafiche: null, rapportini: ['rapportini', 1], dashboard: ['dashboard', 1],
    salvaRapportino: ['rapportini', 2], stato: ['rapportini', 2], ripristinaRapportino: ['rapportini', 2], caricaFile: ['rapportini', 2], togliFile: ['rapportini', 2], inviaEmail: ['rapportini', 2], documenti: ['documenti', 1],
    salvaSoggetto: ['clienti', 2], archiviaSoggetto: ['clienti', 2], ripristinaSoggetto: ['clienti', 2], controllaPartitaIva: ['clienti', 1],
    salvaReferente: ['clienti', 2], togliReferente: ['clienti', 2], salvaSede: ['clienti', 2], archiviaSede: ['clienti', 2],
    creaCommessa: ['commesse', 2], aggiornaCommessa: ['commesse', 2], salvaPrestazione: ['commesse', 2], togliPrestazione: ['commesse', 2],
    ordinaPrestazioni: ['commesse', 2], duplicaCommessa: ['commesse', 2], archiviaCommessa: ['commesse', 2], ripristinaCommessa: ['commesse', 2],
    utenti: ['amministrazione', 1], salvaUtente: ['amministrazione', 2], nuovaPassword: ['amministrazione', 2], sessioni: ['amministrazione', 2], revocaSessione: ['amministrazione', 2],
    permessi: ['amministrazione', 1], salvaPermessi: ['amministrazione', 2], registro: ['amministrazione', 1],
    numerazioni: ['amministrazione', 1], salvaNumerazione: ['amministrazione', 2], cestino: ['amministrazione', 2], ripristinaFile: ['amministrazione', 2],
    copie: ['amministrazione', 1], copiaAdesso: ['amministrazione', 2], salvaImpostazioni: ['amministrazione', 2], esporta: null, cambiaPassword: null,
    // fase 2
    listino: ['preventivi', 1], salvaVoceListino: ['preventivi', 2], archiviaVoceListino: ['preventivi', 2],
    preventivi: ['preventivi', 1], preventivo: ['preventivi', 1], salvaPreventivo: ['preventivi', 2], duplicaPreventivo: ['preventivi', 2],
    nuovaRevisione: ['preventivi', 2], inviaPreventivo: ['preventivi', 2], segnaInviato: ['preventivi', 2], accettaPreventivo: ['preventivi', 2],
    rifiutaPreventivo: ['preventivi', 2], riapriPreventivo: ['preventivi', 2], creaCommessaDaPreventivo: ['commesse', 2],
    attivita: ['attivita', 1], salvaAttivita: ['attivita', 2], faiAttivita: ['attivita', 2], togliAttivita: ['attivita', 2], spuntaChecklist: ['attivita', 2],
    // fase 3 (§14.1): le ore sono di "rapportini", spese e trasferte di "spese"
    ore: ['rapportini', 1], salvaOre: ['rapportini', 2], togliOre: ['rapportini', 2], timer: ['rapportini', 1], avviaTimer: ['rapportini', 2], fermaTimer: ['rapportini', 2],
    statisticheOre: ['rapportini', 1], costoCommessa: ['commesse', 1],
    spese: ['spese', 1], salvaSpesa: ['spese', 2], togliSpesa: ['spese', 2], togliFotoSpesa: ['spese', 2], trasferte: ['spese', 1], salvaTrasferta: ['spese', 2],
    togliTrasferta: ['spese', 2], rimborsi: ['spese', 1], segnaRimborsato: ['spese', 2], riepilogoSpese: ['spese', 1], veicoli: ['spese', 1], salvaVeicolo: ['amministrazione', 2],
  };

  /** I nomi delle colonne del database ("ultimaTariffa" -> "ultima_tariffa"), come nel registro vero. */
  const colonna = k => ({ idCliente: 'cliente_id', sedeId: 'sede_id', responsabileId: 'responsabile_id', idSoggetto: 'soggetto_id', idCommessa: 'commessa_id' })[k] ||
    k.replace(/[A-Z]/g, x => '_' + x.toLowerCase());
  const colonne = o => {
    if (!o || typeof o !== 'object') return o;
    const x = {};
    Object.keys(o).forEach(k => { x[colonna(k)] = o[k] === true ? 1 : o[k] === false ? 0 : o[k]; });
    return x;
  };

  /** Una riga del registro, come la scrive il server (il nome della riga non c'è: lo trova l'interfaccia). */
  function scrivi(dati, azione, tabella, idRiga, nome, prima, dopo, nota) {
    dati.contatori.reg += 1;
    const ora = new Date();
    const quando = R.isoGiorno(ora) + 'T' + String(ora.getHours()).padStart(2, '0') + ':' + String(ora.getMinutes()).padStart(2, '0') + ':' + String(ora.getSeconds()).padStart(2, '0');
    dati.registro.unshift({ id: dati.contatori.reg, quando, idUtente: dati.io.id, utente: dati.io.nome, disp: 'questo computer', azione, tabella,
      idRiga: String(idRiga), prima: colonne(prima), dopo: colonne(dopo), nota: nota || '' });
  }

  /** Solo i campi cambiati, per il registro. */
  function differenze(prima, dopo) {
    const p = {};
    const d = {};
    Object.keys(dopo).forEach(k => {
      if (JSON.stringify(prima[k]) !== JSON.stringify(dopo[k])) { p[k] = prima[k] === undefined ? null : prima[k]; d[k] = dopo[k]; }
    });
    return [p, d];
  }

  function anagrafiche(dati, archiviati) {
    const a = dati.ana;
    const vivo = x => archiviati || !(x.archiviato || x.archiviata);
    const soggetti = a.soggetti.filter(vivo);
    return {
      ok: true,
      clienti: soggetti.filter(s => s.cliente),
      fornitori: soggetti.filter(s => s.fornitore && !s.cliente),
      commesse: a.commesse.filter(vivo),
      referenti: a.referenti,
      sedi: a.sedi.filter(s => archiviati || !s.archiviata),
      prestazioni: a.prestazioni,
      utenti: a.utenti.map(u => ({ id: u.id, nome: u.nome, ruolo: u.ruolo, attivo: u.attivo })),
      numerazioni: a.numerazioni.map(n => Object.assign({}, n, { prossimo: R.formattaNumero(n.formato, n.ultimo + 1, Number(dati.oggi.slice(0, 4))) })),
      impostazioni: a.impostazioni,
      gruppi: [],
    };
  }

  function prossimoCodice(dati) {
    const num = dati.ana.numerazioni.find(x => x.tipo === 'commessa');
    const max = dati.ana.commesse.reduce((m, c) => { const x = String(c.id).match(/(\d+)$/); return Math.max(m, x ? Number(x[1]) : 0); }, num.ultimo);
    num.ultimo = max + 1;
    return R.formattaNumero(num.formato, num.ultimo, Number(dati.oggi.slice(0, 4)));
  }

  /**
   * Risponde a una chiamata /server/<azione> come farebbe il server, sui dati di
   * esempio. Quello che non serve risponde "fatto" senza cambiare niente.
   */
  function gestisci(dati, metodo, percorso, corpo) {
    const [nomeAzione, query] = percorso.replace(/^\/(server|foglio)\//, '').split('?');
    const azione = nomeAzione.replace(/\/+$/, '');
    const q = {};
    String(query || '').split('&').filter(Boolean).forEach(x => { const [k, v] = x.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    const b = Object.assign({}, q, corpo || {});
    const serve = SERVE[azione];
    if (serve && !R.puo(dati.permessiIo, serve[0], serve[1])) return NONPERMESSO(serve[1] === 2 ? 'fare questa modifica' : 'vedere questa pagina');
    const risposta = esegui(dati, azione, b);
    return R.puo(dati.permessiIo, 'costi') || SOLDI_DELLA_PERSONA.has(azione) ? risposta : togliCosti(risposta);
  }

  function esegui(dati, azione, b) {
    const a = dati.ana;
    const adesso = new Date().toISOString().slice(0, 19);
    const mio = dati.io.ruolo === 'collaboratore';
    const trova = (lista, id) => lista.find(x => String(x.id) === String(id));
    switch (azione) {
      case 'io':
        return { ok: true, utente: { id: dati.io.id, nome: dati.io.nome, email: dati.io.email, ruolo: dati.io.ruolo }, permessi: copia(dati.permessiIo),
          titolare: 'Manuel Gasparotto', ragioneSociale: a.impostazioni.RAGIONE_SOCIALE,
          interfaccia: { ticketAttivo: false, tecnico: dati.io.ruolo === 'collaboratore' ? dati.io.nome : a.impostazioni.TECNICO, soloSuoi: dati.io.ruolo === 'collaboratore', versioneServer: 'esempio',
            // fase 3 (§14.1)
            puoApprovare: dati.io.ruolo !== 'collaboratore' && R.puo(dati.permessiIo, 'rapportini', 2),
            puoSegnareRimborsi: (dati.io.ruolo === 'titolare' || dati.io.ruolo === 'amministrazione') && R.puo(dati.permessiIo, 'spese', 2),
            approvazione: a.impostazioni.APPROVAZIONE || 'collaboratori', oreGiornaliere: a.impostazioni.ORE_GIORNALIERE || 8 } };
      case 'anagrafiche':
        return anagrafiche(dati, b.archiviati === '1' || b.archiviati === true || b.archiviati === 'true');
      case 'rapportini':
        return { ok: true, rapportini: dati.rapportini.filter(r => r.stato !== 'ANNULLATO' && (!mio || r.idUtente === dati.io.id)) };
      case 'dashboard':
        return dashboard(dati);
      case 'documenti':
        // Fase 5: l'archivio nuovo (archivio: true) e la risposta di prima (solo idCommessa).
        if (b.archivio) return { ok: true, pagina: 1, pagine: 1, quanti: 0, conteggi: { daApprovare: 0, inScadenza: 0, scaduti: 0, daClassificare: 0 }, documenti: [], daWisper: [] };
        return { ok: true, cartella: '', documenti: [] };
      // Fase 5: documenti, scadenze, ticket e contratti nella visita sono vuoti (la visita del computer non li mostra).
      case 'categorieDocumenti': return { ok: true, categorie: [] };
      case 'modelli': return { ok: true, wisper: [], studio: [], segnaposti: [], lettere: [] };
      case 'scadenze': return b.da ? { ok: true, oggi: dati.oggi, da: b.da, a: b.a, scadenze: [] } : { ok: true, oggi: dati.oggi, scadute: [], entro: [], piuAvanti: [], conteggi: { scadute: 0, entro: 0, piuAvanti: 0 } };
      case 'tickets': return { ok: true, adesso, segmento: b.segmento || 'aperti', conteggi: { aperti: 0, urgenti: 0, nonAssegnati: 0, inRitardo: 0, risoltiDaChiudere: 0, programmatiDaPianificare: 0 }, ticket: [] };
      case 'contratti': return { ok: true, oggi: dati.oggi, contratti: [] };
      case 'statisticheTicket': return { ok: true, per: b.per || 'tipo', totale: { aperti: 0, chiusi: 0, inCorso: 0, presaMediaOre: null, interventoMedioOre: null, chiusuraMediaGiorni: null, entroITempi: null, ore: 0, km: 0, nelContratto: 0 }, righe: [] };
      case 'cambiaPassword':
        return String(b.nuova || '').length >= 8 ? { ok: true } : { ok: false, errore: 'La password nuova deve avere almeno 8 caratteri' };

      // ------------------------------------------------- rapportini (come lo script)
      case 'stato':
      case 'inviaEmail': {
        if (azione === 'inviaEmail' && b.aMe) return { ok: true, rapportini: [] };
        const st = azione === 'stato' ? b.stato : 'INVIATO';
        const ids = b.ids || [];
        const cambiati = dati.rapportini.filter(r => (ids.indexOf(r.id) >= 0 || ids.indexOf(r.idLocale) >= 0) && !(azione === 'inviaEmail' && r.stato === 'FATTURATO')).map(r => {
          const prima = r.stato;
          if (st === 'ANNULLATO') r.statoPrima = r.stato;
          r.stato = st;
          if (st === 'INVIATO') r.inviatoIl = adesso;
          if (st === 'FATTURATO') r.fatturatoIl = adesso;
          if (st === 'BOZZA') { r.firma = null; r.firmatario = ''; r.firmatoIl = ''; }
          scrivi(dati, 'stato', 'rapportini', r.id, r.id, { stato: prima }, { stato: st });
          return r;
        });
        return { ok: true, rapportini: cambiati };
      }
      case 'salvaRapportino': {
        const nuovo = Object.assign({}, b.rapportino);
        const i = dati.rapportini.findIndex(r => r.idLocale === nuovo.idLocale);
        const c = a.soggetti.find(x => x.id === nuovo.idCliente) || null;
        const m = a.commesse.find(x => x.id === nuovo.idCommessa) || null;
        const regole = C.regoleDi(c, [], a.impostazioni, m);
        if (nuovo.tariffa === null || nuovo.tariffa === undefined) nuovo.tariffa = regole.tariffaFissa !== null ? regole.tariffaFissa : (c && c.ultimaTariffa) || 0;
        Object.assign(nuovo, regole.tariffaFissa !== null ? { tariffa: regole.tariffaFissa } : {}, C.calcola(nuovo, regole));
        if (i >= 0) { Object.assign(dati.rapportini[i], nuovo); scrivi(dati, 'salvaRapportino', 'rapportini', nuovo.id, nuovo.id, {}, { descrizione: nuovo.descrizione }); return { ok: true, rapportino: dati.rapportini[i] }; }
        dati.contatori.r += 1;
        nuovo.id = 'RAP/' + nuovo.data.slice(0, 4) + '/' + String(dati.rapportini.length + 1).padStart(4, '0');
        nuovo.stato = 'BOZZA'; nuovo.foto = []; nuovo.firma = null; nuovo.idUtente = dati.io.id;
        if (!nuovo.idCliente && nuovo.cliente) {
          const id = 'C' + String(a.soggetti.filter(s => /^C/.test(s.id)).length + 1).padStart(3, '0');
          a.soggetti.push({ id, nome: nuovo.cliente, cliente: true, fornitore: false, alias: [], archiviato: false, citta: '', ultimaTariffa: nuovo.tariffa });
          nuovo.idCliente = id;
        }
        if (!nuovo.idCommessa && nuovo.commessa) {
          const id = prossimoCodice(dati);
          a.commesse.push({ id, idCliente: nuovo.idCliente, descrizione: nuovo.commessa, stato: 'APERTA', persone: [dati.io.id], archiviata: false, modello: false });
          nuovo.idCommessa = id;
        }
        dati.rapportini.unshift(nuovo);
        scrivi(dati, 'salvaRapportino', 'rapportini', nuovo.id, nuovo.id, null, { oreLavoro: nuovo.oreLavoro });
        return { ok: true, rapportino: nuovo };
      }
      case 'caricaFile': {
        const file = { id: 'esempio' + Date.now(), nome: b.nome || 'file', mime: b.mime || '', url: '' };
        if (b.tipo === 'attivita') { const x = trova(dati.attivita, b.idAttivita); if (x) x.allegati.push(file); }
        if (b.tipo === 'spesa' && b.idSpesa) { const x = trova(dati.spese, b.idSpesa); if (x) x.foto.push(file); }
        return { ok: true, file };
      }
      case 'togliFile': {
        dati.attivita.forEach(x => { x.allegati = x.allegati.filter(f => f.id !== b.id); });
        return { ok: true };
      }
      case 'ripristinaRapportino': {
        const r = dati.rapportini.find(x => x.id === b.id || x.idLocale === b.id);
        if (!r) return { ok: false, errore: 'Rapportino non trovato' };
        r.stato = r.statoPrima || 'BOZZA';
        scrivi(dati, azione, 'rapportini', r.id, r.id, { stato: 'ANNULLATO' }, { stato: r.stato });
        return { ok: true, rapportino: r };
      }

      // ------------------------------------------------- clienti e fornitori
      case 'salvaSoggetto': {
        const campi = Object.assign({}, b.soggetto || b.campi || {});
        if (b.id && !campi.id) campi.id = b.id;
        const esistente = campi.id ? trova(a.soggetti, campi.id) : null;
        if (!esistente) {
          const doppione = R.trovaDoppione(a.soggetti, campi, null);
          if (doppione) return { ok: true, soggetto: Object.assign({ giaEsisteva: true }, doppione), giaEsisteva: true };
          const pref = campi.cliente ? 'C' : 'F';
          const id = pref + String(a.soggetti.filter(s => s.id[0] === pref).length + 1).padStart(3, '0');
          const nuovo = Object.assign({ alias: [], archiviato: false, nazione: 'IT' }, campi, { id });
          a.soggetti.push(nuovo);
          scrivi(dati, 'salvaSoggetto', 'soggetti', id, nuovo.nome, null, { nome: nuovo.nome });
          return { ok: true, soggetto: nuovo };
        }
        const [p, d] = differenze(esistente, campi);
        Object.assign(esistente, campi);
        if (Object.keys(d).length) scrivi(dati, 'salvaSoggetto', 'soggetti', esistente.id, esistente.nome, p, d);
        return { ok: true, soggetto: esistente };
      }
      case 'archiviaSoggetto':
      case 'ripristinaSoggetto': {
        const s = trova(a.soggetti, b.id);
        if (!s) return { ok: false, errore: 'Non lo trovo' };
        s.archiviato = azione === 'archiviaSoggetto';
        scrivi(dati, azione, 'soggetti', s.id, s.nome, { archiviato: !s.archiviato }, { archiviato: s.archiviato });
        return { ok: true, soggetto: s };
      }
      case 'controllaPartitaIva': {
        const iva = String(b.partitaIva || '').replace(/\s/g, '').replace(/^IT/i, '');
        if (R.errorePartitaIva(iva)) return { ok: true, valida: false };
        // Nella visita non si chiede niente a nessuno: una ditta di esempio.
        return { ok: true, valida: true, nome: 'Ditta di esempio Srl', indirizzo: 'Via delle Prove 1', cap: '36100', citta: 'Vicenza', provincia: 'VI' };
      }
      case 'salvaReferente':
      case 'salvaSede': {
        const lista = azione === 'salvaReferente' ? a.referenti : a.sedi;
        const tab = azione === 'salvaReferente' ? 'referenti' : 'sedi';
        const x = Object.assign({}, b.referente || b.sede || {});
        const chiave = azione === 'salvaReferente' ? 'referente' : 'sede';
        const es = x.id ? trova(lista, x.id) : null;
        if (es) { Object.assign(es, x); scrivi(dati, azione, tab, es.id, es.nome, {}, { nome: es.nome }); return { ok: true, [chiave]: es }; }
        dati.contatori.s += 1;
        x.id = dati.contatori.s;
        if (tab === 'sedi') x.archiviata = false;
        lista.push(x);
        scrivi(dati, azione, tab, x.id, x.nome, null, { nome: x.nome });
        return { ok: true, [chiave]: x };
      }
      case 'togliReferente': {
        const i = a.referenti.findIndex(x => String(x.id) === String(b.id));
        if (i < 0) return { ok: false, errore: 'Non lo trovo' };
        const [x] = a.referenti.splice(i, 1);
        scrivi(dati, azione, 'referenti', x.id, x.nome, { nome: x.nome }, null);
        return { ok: true };
      }
      case 'archiviaSede': {
        const x = trova(a.sedi, b.id);
        if (!x) return { ok: false, errore: 'Non la trovo' };
        x.archiviata = b.archiviata !== false;
        scrivi(dati, azione, 'sedi', x.id, x.nome, { archiviata: !x.archiviata }, { archiviata: x.archiviata });
        return { ok: true, sede: x };
      }

      // ------------------------------------------------- commesse
      case 'creaCommessa': {
        const campi = Object.assign({}, b.campi || b);
        delete campi.azione;
        const id = campi.id && !trova(a.commesse, campi.id) ? campi.id : prossimoCodice(dati);
        const m = Object.assign({ stato: 'APERTA', persone: [], archiviata: false, modello: false }, campi, { id });
        a.commesse.push(m);
        scrivi(dati, azione, 'commesse', id, m.descrizione, null, { descrizione: m.descrizione });
        return { ok: true, commessa: m };
      }
      case 'aggiornaCommessa': {
        const m = trova(a.commesse, b.id);
        if (!m) return { ok: false, errore: 'Commessa non trovata' };
        const [p, d] = differenze(m, b.campi || {});
        Object.assign(m, b.campi || {});
        if (Object.keys(d).length) scrivi(dati, azione, 'commesse', m.id, m.descrizione, p, d);
        return { ok: true, commessa: m };
      }
      case 'archiviaCommessa':
      case 'ripristinaCommessa': {
        const m = trova(a.commesse, b.id);
        if (!m) return { ok: false, errore: 'Commessa non trovata' };
        m.archiviata = azione === 'archiviaCommessa';
        scrivi(dati, azione, 'commesse', m.id, m.descrizione, { archiviata: !m.archiviata }, { archiviata: m.archiviata });
        return { ok: true, commessa: m };
      }
      case 'duplicaCommessa': {
        const m = trova(a.commesse, b.id);
        if (!m) return { ok: false, errore: 'Commessa non trovata' };
        const id = prossimoCodice(dati);
        const nuova = Object.assign(copia(m), { id, stato: 'APERTA', archiviata: false, modello: !!b.comeModello, inizio: dati.oggi, finePrevista: '',
          descrizione: b.comeModello || m.modello ? m.descrizione : m.descrizione + ' (copia)' });
        if (b.idCliente && b.idCliente !== m.idCliente) { nuova.idCliente = b.idCliente; nuova.sedeId = null; }
        a.commesse.push(nuova);
        a.prestazioni.filter(p => p.idCommessa === m.id).forEach(p => {
          dati.contatori.p += 1;
          a.prestazioni.push(Object.assign({}, p, { id: dati.contatori.p, idCommessa: id, avanzamento: 0, stato: 'da_fare' }));
        });
        scrivi(dati, azione, 'commesse', id, nuova.descrizione, null, { da: m.id });
        return { ok: true, commessa: nuova };
      }
      case 'salvaPrestazione': {
        const x = Object.assign({}, b.prestazione || {});
        if (x.avanzamento !== undefined) { x.avanzamento = R.avanzamento(x.avanzamento, 0); x.stato = R.statoPrestazione(x.avanzamento); }
        const es = x.id ? trova(a.prestazioni, x.id) : null;
        if (es) {
          const [p, d] = differenze(es, x);
          Object.assign(es, x);
          if (Object.keys(d).length) scrivi(dati, azione, 'prestazioni', es.id, es.nome, p, d);
          return { ok: true, prestazione: es };
        }
        dati.contatori.p += 1;
        const ordine = a.prestazioni.filter(p => p.idCommessa === x.idCommessa).reduce((mx, p) => Math.max(mx, p.ordine || 0), 0) + 1;
        const nuova = Object.assign({ descrizione: '', valore: 0, avanzamento: 0, stato: 'da_fare', ordine }, x, { id: dati.contatori.p });
        a.prestazioni.push(nuova);
        scrivi(dati, azione, 'prestazioni', nuova.id, nuova.nome, null, { nome: nuova.nome, valore: nuova.valore });
        return { ok: true, prestazione: nuova };
      }
      case 'togliPrestazione': {
        const i = a.prestazioni.findIndex(x => String(x.id) === String(b.id));
        if (i < 0) return { ok: false, errore: 'Non la trovo' };
        const [x] = a.prestazioni.splice(i, 1);
        scrivi(dati, azione, 'prestazioni', x.id, x.nome, { nome: x.nome }, null);
        return { ok: true };
      }
      case 'ordinaPrestazioni': {
        (b.ids || b.ordine || []).forEach((id, i) => { const p = trova(a.prestazioni, id); if (p) p.ordine = i + 1; });
        return { ok: true, prestazioni: a.prestazioni.filter(p => p.idCommessa === b.idCommessa) };
      }

      // ------------------------------------------------- amministrazione
      case 'utenti':
        return { ok: true, utenti: a.utenti };
      case 'salvaUtente': {
        const x = Object.assign({}, b.utente || {});
        if (x.id) {
          const u = trova(a.utenti, x.id);
          if (!u) return { ok: false, errore: 'Utente non trovato' };
          const resta = Object.assign({}, u, x);
          if (u.ruolo === 'titolare' && (resta.ruolo !== 'titolare' || resta.attivo === false) && R.quantiAttivi(a.utenti, 'titolare') <= 1) {
            return { ok: false, errore: 'Non si può togliere l\'ultimo titolare attivo: prima nominane un altro' };
          }
          const [p, d] = differenze(u, x);
          Object.assign(u, x);
          if (Object.keys(d).length) scrivi(dati, azione, 'utenti', u.id, u.nome, p, d);
          return { ok: true, utente: u };
        }
        if (a.utenti.some(u => String(u.email).toLowerCase() === String(x.email || '').toLowerCase())) return { ok: false, errore: 'C\'è già un utente con questa email' };
        dati.contatori.u += 1;
        const u = Object.assign({ attivo: true, ultimoAccesso: '', ruolo: 'collaboratore', dispositivi: 0 }, x, { id: dati.contatori.u });
        delete u.password;
        a.utenti.push(u);
        scrivi(dati, azione, 'utenti', u.id, u.nome, null, { nome: u.nome, email: u.email, ruolo: u.ruolo });
        return { ok: true, utente: u, passwordIniziale: R.passwordIniziale() };
      }
      case 'nuovaPassword': {
        const u = trova(a.utenti, b.idUtente);
        if (!u) return { ok: false, errore: 'Utente ' + b.idUtente + ' non trovato' };
        dati.sessioni = dati.sessioni.filter(x => String(x.idUtente) !== String(u.id));
        scrivi(dati, azione, 'utenti', u.id, u.nome, { passwordHash: '(cambiata)' }, { passwordHash: '(cambiata)' });
        return { ok: true, passwordIniziale: R.passwordIniziale() };
      }
      case 'sessioni':
        return { ok: true, sessioni: dati.sessioni.filter(s => !b.idUtente || String(s.idUtente) === String(b.idUtente)) };
      case 'revocaSessione': {
        const i = dati.sessioni.findIndex(s => String(s.id) === String(b.id));
        if (i >= 0) { const [s] = dati.sessioni.splice(i, 1); scrivi(dati, azione, 'sessioni', s.id, s.dispNome, {}, null); }
        return { ok: true };
      }
      case 'permessi':
        return { ok: true, ruoli: R.ORDINE_RUOLI, permessi: dati.permessi };
      case 'salvaPermessi': {
        const nuovi = b.permessi || {};
        if (nuovi.titolare) return { ok: false, errore: 'Il titolare ha sempre tutto: i suoi permessi non si cambiano' };
        for (const ruolo of Object.keys(nuovi)) {
          const p = dati.permessi[ruolo];
          if (!p) return { ok: false, errore: 'Ruolo sconosciuto: ' + ruolo };
          for (const modulo of Object.keys(nuovi[ruolo])) {
            const prima = p[modulo];
            p[modulo] = Number(nuovi[ruolo][modulo]);
            if (dati.io.ruolo === ruolo) dati.permessiIo[modulo] = p[modulo];
            if (prima !== p[modulo]) scrivi(dati, azione, 'permessi', ruolo + '.' + modulo, '', { livello: prima }, { livello: p[modulo] });
          }
        }
        return { ok: true, ruoli: R.ORDINE_RUOLI, permessi: dati.permessi };
      }
      case 'registro': {
        const lista = dati.registro.filter(v => (!b.utente || String(v.idUtente) === String(b.utente)) &&
          (!b.tabella || v.tabella === b.tabella) && (!b.da || v.quando.slice(0, 10) >= b.da) && (!b.a || v.quando.slice(0, 10) <= b.a));
        const pagina = Math.max(1, Number(b.pagina) || 1);
        return { ok: true, pagina, pagine: Math.max(1, Math.ceil(lista.length / 100)), quante: lista.length, righe: lista.slice((pagina - 1) * 100, pagina * 100) };
      }
      case 'numerazioni':
        return { ok: true, numerazioni: anagrafiche(dati, false).numerazioni };
      case 'salvaNumerazione': {
        const x = a.numerazioni.find(n => n.tipo === b.tipo);
        if (!x) return { ok: false, errore: 'Numerazione sconosciuta' };
        const errore = R.erroreFormato(b.formato, !!b.annuale);
        if (errore) return { ok: false, errore };
        scrivi(dati, azione, 'numerazioni', x.tipo, x.tipo === 'commessa' ? 'Commesse' : 'Rapportini', { formato: x.formato }, { formato: b.formato });
        x.formato = b.formato;
        x.annuale = !!b.annuale;
        return { ok: true, numerazione: anagrafiche(dati, false).numerazioni.find(n => n.tipo === b.tipo) };
      }
      case 'salvaImpostazioni': {
        const [p, d] = differenze(a.impostazioni, b.valori || {});
        Object.assign(a.impostazioni, b.valori || {});
        if (Object.keys(d).length) scrivi(dati, azione, 'impostazioni', 'studio', 'lo studio', p, d);
        return { ok: true, impostazioni: a.impostazioni };
      }
      case 'cestino':
        return { ok: true, file: dati.cestino };
      case 'ripristinaFile': {
        const i = dati.cestino.findIndex(f => f.id === b.id);
        if (i < 0) return { ok: false, errore: 'Non lo trovo' };
        const [f] = dati.cestino.splice(i, 1);
        scrivi(dati, azione, 'file', f.id, f.nome, { cestinato: true }, { cestinato: false });
        return { ok: true };
      }
      case 'copie':
        return Object.assign({ ok: true }, copia(dati.copie));
      case 'copiaAdesso': {
        const c = { id: dati.copie.copie.length + 1, quando: adesso, file: 'wisper-' + adesso.slice(0, 10).replace(/-/g, '') + '.db', byte: 4250000,
          locale: 'ok', fuori: 'ok · 1 file', foglio: 'ok', nota: 'a mano' };
        dati.copie.copie.unshift(c);
        return { ok: true, copia: c };
      }
      case 'esporta':
        return esporta(dati, b);
      default:
        return fase2(dati, azione, b);
    }
  }

  // ======================================================================= fase 2: preventivi e attività

  const vociDi = p => (p.sezioni || []).reduce((a, s) => a.concat(s.voci.map(v => Object.assign({ idSezione: s.id }, v))), []);

  const etichettaPrev = p => (p.modello ? 'Modello' : p.numero + (p.revisione > 0 ? ' rev. ' + p.revisione : ''));

  /** Cosa chiede la legge e manca (§13.4: campo e frase pronta). */
  function mancanoPrev(dati, p) {
    const imp = dati.ana.impostazioni;
    const voci = vociDi(p);
    const m = [];
    if (!p.idCliente && !p.modello) m.push({ campo: 'cliente', testo: 'Il cliente: sceglilo' });
    if (!String(p.oggetto || '').trim()) m.push({ campo: 'oggetto', testo: 'L\'oggetto: scrivi di cosa si tratta' });
    if (!voci.length) m.push({ campo: 'voci', testo: 'Le voci: aggiungi almeno una prestazione' });
    const senza = voci.filter(v => !(C.num(v.prezzo) > 0)).length;
    if (senza) m.push({ campo: 'prezzi', testo: senza === 1 ? '1 voce senza prezzo' : senza + ' voci senza prezzo' });
    if (!p.complessita) m.push({ campo: 'complessita', testo: 'Il grado di complessità dell\'incarico' });
    if (!String(p.oneriPrevisti || '').trim()) m.push({ campo: 'oneri', testo: 'Gli oneri ipotizzabili dal conferimento alla conclusione' });
    if (!imp.POLIZZA_COMPAGNIA || !imp.POLIZZA_NUMERO) m.push({ campo: 'polizza', testo: 'Gli estremi della polizza professionale: scrivili in Amministrazione › Dati dello studio' });
    if (!imp.TITOLI) m.push({ campo: 'titoli', testo: 'I titoli e le specializzazioni: scrivili in Amministrazione › Dati dello studio' });
    return m;
  }

  /** La riga dell'elenco (§13.3): senza sezioni e voci, col totale e lo stato da mostrare. */
  function prevRiassunto(dati, p) {
    const k = C.contiPreventivo(p, vociDi(p));
    const c = dati.ana.soggetti.find(s => s.id === p.idCliente);
    const scaduto = p.stato === 'INVIATO' && !!p.scadenza && p.scadenza < dati.oggi;
    return { id: p.id, numero: p.numero, revisione: p.revisione, etichetta: etichettaPrev(p), idCliente: p.idCliente, cliente: c ? c.nome : '', oggetto: p.oggetto,
      data: p.data, scadenza: p.scadenza, stato: p.stato, statoVisto: scaduto ? 'SCADUTO' : p.stato, scaduto, giorniAllaScadenza: p.scadenza ? RP.giorniFra(dati.oggi, p.scadenza) : null,
      inviatoIl: p.inviatoIl, accettatoIl: p.accettatoIl, idCommessa: p.idCommessa, modello: p.modello, senzaPrezzo: k.senzaPrezzo, imponibile: k.imponibile, totale: k.totale,
      modificato: p.modificato || p.creato || '' };
  }

  /** Un preventivo come lo manda il server con l'azione "preventivo" (§13.4). */
  function prevCompleto(dati, p) {
    const x = Object.assign(copia(p), prevRiassunto(dati, p));
    const k = C.contiPreventivo(x, vociDi(x));
    let i = 0;
    x.sezioni.forEach(s => {
      s.voci.forEach(v => { v.idSezione = s.id; v.importo = k.voci[i].importo; v.conta = k.voci[i].conta; i++; });
      s.subtotale = k.perSezione[String(s.id)] || 0;
    });
    x.scadenzePagamento.forEach((s, j) => { s.importo = k.scadenze[j]; s.idCommessa = s.idCommessa || ''; });
    x.conti = { sommaVoci: k.sommaVoci, scontoDaPercentuale: k.scontoDaPercentuale, scontoEuro: k.scontoEuro, imponibile: k.imponibile, eppiPercentuale: k.eppiPercentuale,
      contributo: k.contributo, baseIva: k.baseIva, ivaPercentuale: k.ivaPercentuale, iva: k.iva, totale: k.totale, oreVoci: k.oreVoci, senzaPrezzo: k.senzaPrezzo, restoScadenze: k.restoScadenze };
    x.modificabile = x.stato === 'BOZZA' || x.modello;
    x.revisioni = x.numero ? dati.preventivi.filter(q => q.numero === p.numero && !q.modello).sort((a, b) => a.revisione - b.revisione)
      .map(q => ({ id: q.id, revisione: q.revisione, etichetta: etichettaPrev(q), stato: q.stato, data: q.data, totale: C.contiPreventivo(q, vociDi(q)).totale })) : [];
    x.mancano = mancanoPrev(dati, x);
    return x;
  }

  function prossimoNumeroPrev(dati, data) {
    const n = dati.ana.numerazioni.find(x => x.tipo === 'preventivo');
    const anno = Number(String(data || dati.oggi).slice(0, 4));
    const usati = dati.preventivi.filter(p => String(p.numero).indexOf('/' + anno + '/') > 0).map(p => Number(String(p.numero).split('/').pop()) || 0);
    n.ultimo = Math.max(0, ...usati) + 1;
    return R.formattaNumero(n.formato, n.ultimo, anno);
  }

  /** Dà gli id veri a sezioni, voci e scadenze nuove (senza id o con quelli provvisori dell'interfaccia). */
  function conIdVeri(dati, p) {
    const nuovo = id => id === undefined || id === null || id === '' || /^[a-z]+-/.test(String(id));
    p.sezioni = (p.sezioni || []).map((s, i) => Object.assign({}, s, {
      id: nuovo(s.id) ? ++dati.contatori.sez : s.id, ordine: i + 1,
      voci: (s.voci || []).map((v, j) => Object.assign({ unita: '', scontoPercentuale: 0, facoltativa: false, alternativa: '', scelta: false, idListino: null }, v, { id: nuovo(v.id) ? ++dati.contatori.voce : v.id, ordine: j + 1 })),
    }));
    p.scadenzePagamento = (p.scadenzePagamento || []).map((s, i) => Object.assign({ stato: 'prevista' }, s, { id: nuovo(s.id) ? ++dati.contatori.scad : s.id, ordine: i + 1 }));
    return p;
  }

  /** Una copia per una revisione o un duplicato: id nuovi a tutto. */
  function copiaPrev(dati, p, extra) {
    const x = copia(p);
    x.sezioni.forEach(s => { s.id = null; s.voci.forEach(v => { v.id = null; }); });
    x.scadenzePagamento.forEach(s => { s.id = null; });
    Object.assign(x, { id: ++dati.contatori.prev, stato: 'BOZZA', inviatoIl: '', accettatoIl: '', accettatoDa: '', accettazioneModo: '', firma: null,
      rifiutatoIl: '', motivoRifiuto: '', idCommessa: '', creato: new Date().toISOString().slice(0, 19), modificato: '' }, extra || {});
    return conIdVeri(dati, x);
  }

  /** Le attività che il ruolo vede: il collaboratore le sue, quelle libere e quelle delle commesse dove è tra le persone. */
  function attivitaVisibili(dati) {
    if (dati.io.ruolo !== 'collaboratore') return dati.attivita;
    const sue = new Set(dati.ana.commesse.filter(m => (m.persone || []).indexOf(dati.io.id) >= 0 || m.responsabileId === dati.io.id).map(m => m.id));
    return dati.attivita.filter(a => a.assegnataA === null || a.assegnataA === dati.io.id || (a.idCommessa && sue.has(a.idCommessa)));
  }

  /** Un'attività come la manda il server (§13.6): con i nomi, il giorno, il gruppo, la serie e se si può cambiare. */
  function attivitaCompleta(dati, x) {
    const a = dati.ana;
    const u = a.utenti.find(y => y.id === x.assegnataA);
    const c = a.soggetti.find(y => y.id === x.idCliente);
    const m = a.commesse.find(y => y.id === x.idCommessa);
    const r = x.idRicorrenza ? dati.ricorrenze.find(y => y.id === x.idRicorrenza) : null;
    const g = RA.giornoDi(x);
    // Il server non ha "Più avanti" (§13.6): quelle oltre la settimana per lui sono "prossimi".
    const gruppo = x.stato === 'fatta' ? 'fatte' : x.stato === 'annullata' ? 'annullate' : RA.gruppoDi(x, dati.oggi).replace('piuAvanti', 'prossimi');
    const mio = dati.io.ruolo === 'collaboratore';
    return Object.assign(copia(x), { assegnata: u ? u.nome : '', cliente: c ? c.nome : '', commessa: m ? m.descrizione : '', giorno: g, gruppo,
      ricorrenza: r ? { regola: r.regola, ogni: r.ogni, giorniSettimana: Array.isArray(r.giorniSettimana) ? r.giorniSettimana : String(r.giorniSettimana || '').split(',').filter(Boolean).map(Number), inizio: r.inizio || '', fine: r.fine || '' } : null,
      puoScrivere: R.puo(dati.permessiIo, 'attivita', 2) && (!mio || x.assegnataA === null || x.assegnataA === dati.io.id || x.creataDa === dati.io.id) });
  }

  /** Le azioni nuove della fase 2 (fase2.md §4), sui dati di esempio. */
  function fase2(dati, azione, b) {
    const a = dati.ana;
    const adesso = new Date().toISOString().slice(0, 19);
    const trova = (lista, id) => lista.find(x => String(x.id) === String(id));
    // Come il server: l'id interno, oppure il numero ("PR/2026/012" = l'ultima revisione).
    const prev = id => trova(dati.preventivi, id) || dati.preventivi.filter(p => p.numero && p.numero === String(id)).sort((x, y) => y.revisione - x.revisione)[0];
    const mio = dati.io.ruolo === 'collaboratore';
    switch (azione) {
      // ------------------------------------------------- listino
      case 'listino':
        return { ok: true, listino: dati.listino.filter(l => l.attivo || b.tutte === true || b.tutte === '1' || b.tutte === 'true') };
      case 'salvaVoceListino': {
        const x = Object.assign({}, b.voce || {});
        if (!String(x.nome || '').trim()) return { ok: false, errore: 'Nome: scrivi il nome della prestazione' };
        const es = x.id ? trova(dati.listino, x.id) : null;
        if (es) { Object.assign(es, x); scrivi(dati, azione, 'listino', es.id, es.nome, {}, { nome: es.nome }); return { ok: true, voce: es }; }
        const nuova = Object.assign({ codice: '', descrizione: '', modo: 'corpo', unita: '', prezzo: null, attivo: true, ordine: dati.listino.length + 1 }, x, { id: ++dati.contatori.lis });
        dati.listino.push(nuova);
        scrivi(dati, azione, 'listino', nuova.id, nuova.nome, null, { nome: nuova.nome });
        return { ok: true, voce: nuova };
      }
      case 'archiviaVoceListino': {
        const x = trova(dati.listino, b.id);
        if (!x) return { ok: false, errore: 'Non la trovo' };
        x.attivo = b.archiviata === false || b.archiviata === 'false';
        return { ok: true, voce: x };
      }

      // ------------------------------------------------- preventivi
      case 'preventivi': {
        const si = x => x === true || x === '1' || x === 'true';
        const st = String(b.stato || '').toUpperCase();
        const lista = dati.preventivi.map(p => prevRiassunto(dati, p)).filter(p => {
          if (b.cliente && p.idCliente !== b.cliente) return false;
          if (b.anno && String(p.data).slice(0, 4) !== String(b.anno)) return false;
          if (st === 'MODELLO') return p.modello;
          if (st) return !p.modello && p.statoVisto === st;
          if (p.modello) return si(b.modelli);
          return p.stato !== 'SOSTITUITO' || si(b.sostituiti);
        }).sort((a, b2) => String(b2.data).localeCompare(String(a.data)));
        return { ok: true, oggi: dati.oggi, preventivi: lista };
      }
      case 'preventivo': {
        const p = prev(b.id);
        return p ? { ok: true, preventivo: prevCompleto(dati, p) } : { ok: false, errore: 'Preventivo non trovato' };
      }
      case 'salvaPreventivo': {
        const x = Object.assign({}, b.preventivo || {});
        const es = x.id ? prev(x.id) : null;
        if (es) {
          if (es.stato !== 'BOZZA') return { ok: false, errore: 'Il preventivo ' + es.numero + ' è già stato inviato: per cambiarlo fai una nuova revisione' };
          Object.assign(es, conIdVeri(dati, Object.assign({}, es, x, { stato: 'BOZZA', modificato: adesso })));
          scrivi(dati, azione, 'preventivi', es.id, es.numero, {}, { oggetto: es.oggetto });
          return { ok: true, preventivo: prevCompleto(dati, es) };
        }
        const data = x.data || dati.oggi;
        const nuovo = conIdVeri(dati, Object.assign({
          revisione: 0, stato: 'BOZZA', idSede: null, idReferente: null, introduzione: '', complessita: '', complessitaNota: '', oneriPrevisti: '',
          condizioni: a.impostazioni.PREVENTIVO_CONDIZIONI || '', scontoPercentuale: 0, scontoEuro: 0, inviatoIl: '', accettatoIl: '', accettatoDa: '', accettazioneModo: '',
          firma: null, rifiutatoIl: '', motivoRifiuto: '', idCommessa: '', modello: false, noteInterne: '', idUtente: dati.io.id, sezioni: [], scadenzePagamento: [],
        }, x, {
          id: ++dati.contatori.prev, data, scadenza: x.scadenza || RP.piuGiorni(data, Number(a.impostazioni.PREVENTIVO_VALIDITA_GIORNI) || 30),
          numero: x.modello ? '' : prossimoNumeroPrev(dati, data), eppiPercentuale: C.num(a.impostazioni.EPPI_INTEGRATIVO), ivaPercentuale: C.num(a.impostazioni.IVA),
          creato: adesso, modificato: '',
        }));
        dati.preventivi.push(nuovo);
        scrivi(dati, azione, 'preventivi', nuovo.id, nuovo.numero, null, { oggetto: nuovo.oggetto });
        return { ok: true, preventivo: prevCompleto(dati, nuovo) };
      }
      case 'duplicaPreventivo': {
        const p = prev(b.id);
        if (!p) return { ok: false, errore: 'Preventivo non trovato' };
        const data = dati.oggi;
        const comeModello = !!b.comeModello;
        const x = copiaPrev(dati, p, { revisione: 0, modello: comeModello, data, scadenza: comeModello ? '' : RP.piuGiorni(data, Number(a.impostazioni.PREVENTIVO_VALIDITA_GIORNI) || 30),
          numero: comeModello ? '' : prossimoNumeroPrev(dati, data), idCliente: comeModello ? '' : (b.idCliente || p.idCliente),
          oggetto: comeModello && !p.modello ? p.oggetto + ' (modello)' : p.oggetto,
          eppiPercentuale: C.num(a.impostazioni.EPPI_INTEGRATIVO), ivaPercentuale: C.num(a.impostazioni.IVA) });
        dati.preventivi.push(x);
        scrivi(dati, azione, 'preventivi', x.id, x.numero || 'modello', null, { da: p.numero });
        return { ok: true, preventivo: prevCompleto(dati, x) };
      }
      case 'nuovaRevisione':
      case 'riapriPreventivo': {
        const p = prev(b.id);
        if (!p) return { ok: false, errore: 'Preventivo non trovato' };
        if (azione === 'nuovaRevisione' && p.stato === 'BOZZA') return { ok: false, errore: 'È ancora in bozza: cambiala direttamente' };
        if (azione === 'nuovaRevisione' && p.stato === 'ACCETTATO') return { ok: false, errore: 'È già accettato: non si fanno revisioni' };
        if (azione === 'riapriPreventivo' && p.stato !== 'RIFIUTATO') return { ok: false, errore: 'Si riapre un preventivo rifiutato' };
        const ultima = Math.max(...dati.preventivi.filter(q => q.numero === p.numero).map(q => q.revisione));
        const x = copiaPrev(dati, p, { revisione: ultima + 1, data: dati.oggi, scadenza: RP.piuGiorni(dati.oggi, Number(a.impostazioni.PREVENTIVO_VALIDITA_GIORNI) || 30) });
        p.stato = 'SOSTITUITO';
        dati.preventivi.push(x);
        scrivi(dati, azione, 'preventivi', x.id, x.numero, { revisione: p.revisione }, { revisione: x.revisione });
        return { ok: true, preventivo: prevCompleto(dati, x), sostituito: prevRiassunto(dati, p) };
      }
      case 'inviaPreventivo':
      case 'segnaInviato': {
        const p = prev(b.id);
        if (!p) return { ok: false, errore: 'Preventivo non trovato' };
        if (p.stato !== 'BOZZA' && p.stato !== 'INVIATO') return { ok: false, errore: 'Questo preventivo non si invia più' };
        if (azione === 'inviaPreventivo' && b.aMe) return { ok: true, preventivo: prevCompleto(dati, p) };
        const manca = p.stato === 'BOZZA' ? mancanoPrev(dati, p) : [];
        if (manca.length && !(b.conferma === true || b.conferma === 'true')) {
          return { ok: false, errore: 'Prima di inviarlo manca: ' + manca.map(m => (RP.NOMI_MANCANO[m.campo] || m.campo).toLowerCase()).join(', '), mancano: manca, serveConferma: true };
        }
        p.stato = 'INVIATO';
        p.inviatoIl = adesso;
        scrivi(dati, azione, 'preventivi', p.id, p.numero, { stato: 'BOZZA' }, { stato: 'INVIATO' });
        return { ok: true, preventivo: prevCompleto(dati, p) };
      }
      case 'accettaPreventivo': {
        const p = prev(b.id);
        if (!p) return { ok: false, errore: 'Preventivo non trovato' };
        if (p.stato !== 'INVIATO') return { ok: false, errore: 'Il preventivo ' + p.numero + ' non è ancora stato inviato' };
        if (!String(b.nome || '').trim()) return { ok: false, errore: 'Nome: scrivi chi ha accettato' };
        if (['firma', 'email', 'documento', 'voce'].indexOf(b.modo) < 0) return { ok: false, errore: 'Come ha accettato? firma, email, documento o voce' };
        if (b.modo === 'firma' && !(b.firma && b.firma.base64)) return { ok: false, errore: 'Per la firma serve il tratto del cliente' };
        const scelte = C.applicaScelte(vociDi(p), b.scelte || {});
        const doppie = Object.entries(RP.gruppiAlternative(scelte)).find(([, l]) => l.filter(v => v.scelta).length > 1);
        if (doppie) return { ok: false, errore: 'Di «' + doppie[0] + '» se ne sceglie una sola' };
        p.sezioni.forEach(s => s.voci.forEach(v => { const n = scelte.find(x => String(x.id) === String(v.id)); if (n) v.scelta = n.scelta; }));
        Object.assign(p, { stato: 'ACCETTATO', accettatoIl: adesso, accettatoDa: String(b.nome).trim(), accettazioneModo: b.modo || 'voce',
          firma: b.firma && b.firma.base64 ? { id: 'esempio-firma-' + p.id, url: '' } : null });
        scrivi(dati, azione, 'preventivi', p.id, p.numero, { stato: 'INVIATO' }, { stato: 'ACCETTATO' });
        return { ok: true, preventivo: prevCompleto(dati, p) };
      }
      case 'rifiutaPreventivo': {
        const p = prev(b.id);
        if (!p) return { ok: false, errore: 'Preventivo non trovato' };
        Object.assign(p, { stato: 'RIFIUTATO', rifiutatoIl: adesso, motivoRifiuto: b.motivo || '' });
        scrivi(dati, azione, 'preventivi', p.id, p.numero, { stato: 'INVIATO' }, { stato: 'RIFIUTATO' });
        return { ok: true, preventivo: prevCompleto(dati, p) };
      }
      case 'creaCommessaDaPreventivo': {
        const p = prev(b.id);
        if (!p) return { ok: false, errore: 'Preventivo non trovato' };
        if (p.idCommessa) return { ok: false, errore: 'Il preventivo ' + p.numero + ' è già diventato la commessa ' + p.idCommessa };
        if (p.stato !== 'ACCETTATO') return { ok: false, errore: 'Il preventivo ' + p.numero + ' non è accettato' };
        const ant = RP.anteprimaCommessa(p, vociDi(p));
        const id = prossimoCodice(dati);
        const m = { id, idCliente: p.idCliente, descrizione: p.oggetto, stato: 'APERTA', indirizzo: '', budgetOre: ant.budgetOre, budgetEuro: null, prezzoOrario: ant.prezzoOrario,
          costoOrario: null, euroKm: null, inizio: dati.oggi, finePrevista: '', cartella: '', codicePrecedente: '', note: 'Dal preventivo ' + p.numero, sedeId: p.idSede,
          responsabileId: dati.io.id, persone: [dati.io.id], importoContratto: ant.importoContratto, archiviata: false, modello: false };
        a.commesse.push(m);
        const contano = C.vociCheContano(vociDi(p));
        const sezioneDi = vociDi(p).filter((v, i) => contano[i]).map(v => (p.sezioni.find(s => s.id === v.idSezione) || {}).titolo || '');
        ant.prestazioni.forEach((x, i) => { dati.contatori.p += 1; a.prestazioni.push({ id: dati.contatori.p, idCommessa: id, nome: x.nome, descrizione: sezioneDi[i], valore: x.valore, avanzamento: 0, stato: 'da_fare', ordine: i + 1 }); });
        p.scadenzePagamento.forEach(s => { s.idCommessa = id; });
        p.idCommessa = id;
        scrivi(dati, azione, 'commesse', id, m.descrizione, null, { da: p.numero });
        return { ok: true, commessa: m, prestazioni: a.prestazioni.filter(x => x.idCommessa === id), preventivo: prevCompleto(dati, p) };
      }

      // ------------------------------------------------- attività
      case 'attivita': {
        const si = x => x === true || x === '1' || x === 'true';
        let lista = attivitaVisibili(dati);
        if (b.da || b.a) lista = lista.filter(x => { const g = RA.giornoDi(x); return g && x.stato !== 'annullata' && (!b.da || g >= b.da) && (!b.a || g <= b.a); });
        else if (!b.stato || b.stato === 'aperte') lista = lista.filter(x => x.stato === 'da_fare' || x.stato === 'in_corso');
        if (b.stato && b.stato !== 'aperte' && b.stato !== 'tutte') lista = lista.filter(x => x.stato === b.stato);
        if (b.assegnata) lista = lista.filter(x => String(x.assegnataA) === String(b.assegnata));
        if (si(b.mie)) lista = lista.filter(x => String(x.assegnataA) === String(dati.io.id));
        if (si(b.nonAssegnate)) lista = lista.filter(x => x.assegnataA === null);
        if (b.commessa) lista = lista.filter(x => x.idCommessa === b.commessa);
        if (b.cliente) lista = lista.filter(x => x.idCliente === b.cliente);
        return { ok: true, oggi: dati.oggi, attivita: lista.map(x => attivitaCompleta(dati, x)) };
      }
      case 'salvaAttivita': {
        const x = Object.assign({}, b.attivita || {});
        if (!String(x.titolo || '').trim()) return { ok: false, errore: 'Titolo: scrivi cosa c\'è da fare' };
        const es = x.id ? trova(dati.attivita, x.id) : null;
        if (mio && es && es.assegnataA !== null && es.assegnataA !== dati.io.id) return { ok: false, errore: 'Non hai il permesso per cambiare le attività degli altri: chiedi al titolare', permesso: false };
        if (mio && x.assegnataA !== undefined && x.assegnataA !== null && x.assegnataA !== dati.io.id) return { ok: false, errore: 'Non hai il permesso per dare attività agli altri: chiedi al titolare', permesso: false };
        const ric = x.ricorrenza;
        delete x.ricorrenza;
        // Le sovrapposizioni (§13.7): la stessa persona, lo stesso tempo; si salva solo con conferma.
        const prova = Object.assign({}, es || {}, x);
        if (prova.inizio && !prova.tuttoIlGiorno && prova.tipo !== 'attivita' && !(b.conferma === true || b.conferma === 'true')) {
          const sopra = RA.sovrapposti(prova, dati.attivita);
          if (sopra.length) {
            return { ok: false, errore: 'Si sovrappone a: ' + sopra.map(y => y.titolo + ' (' + RA.ora(y.inizio) + '-' + RA.ora(y.fine) + ')').join(', '), serveConferma: true,
              sovrapposte: sopra.map(y => ({ id: y.id, titolo: y.titolo, inizio: y.inizio, fine: y.fine, assegnataA: y.assegnataA, assegnata: (a.utenti.find(u => u.id === y.assegnataA) || {}).nome || '' })) };
          }
        }
        if (es) {
          const prima = { titolo: es.titolo };
          Object.assign(es, x, { modificato: adesso });
          // Una ricorrenza: "da questa in poi" o "tutte" portano i cambi (non le date) anche alle altre volte.
          if (es.idRicorrenza && (b.perRicorrenza === 'future' || b.perRicorrenza === 'tutte')) {
            const senzaDate = Object.assign({}, x);
            ['id', 'scadenza', 'inizio', 'fine', 'occorrenza', 'stato', 'fattaIl', 'checklist', 'allegati'].forEach(k => delete senzaDate[k]);
            dati.attivita.filter(y => y !== es && String(y.idRicorrenza) === String(es.idRicorrenza) && (b.perRicorrenza === 'tutte' || RA.giornoDi(y) >= RA.giornoDi(es)))
              .forEach(y => Object.assign(y, senzaDate));
          } else if (es.idRicorrenza && b.perRicorrenza === 'questa') {
            es.idRicorrenza = es.idRicorrenza; // resta nella serie, cambiata da sola
          }
          scrivi(dati, azione, 'attivita', es.id, es.titolo, prima, { titolo: es.titolo });
          return { ok: true, attivita: attivitaCompleta(dati, es) };
        }
        const nuova = Object.assign({ descrizione: '', tipo: 'attivita', idCliente: '', idCommessa: '', idPrestazione: null, assegnataA: null, priorita: 'normale', stato: 'da_fare',
          scadenza: '', inizio: '', fine: '', tuttoIlGiorno: false, luogo: '', promemoriaMinuti: null, idRicorrenza: null, occorrenza: '', fattaIl: '', checklist: [], allegati: [] },
        x, { id: ++dati.contatori.att, creataDa: dati.io.id, creato: adesso, modificato: '' });
        nuova.checklist = (nuova.checklist || []).map((c, i) => Object.assign({}, c, { id: c.id && !/^[a-z]+-/.test(String(c.id)) ? c.id : ++dati.contatori.chk, ordine: i + 1 }));
        dati.attivita.push(nuova);
        if (ric && ric.regola) {
          const primo = RA.giornoDi(nuova) || dati.oggi;
          if (!RA.giornoDi(nuova)) return { ok: false, errore: 'Per ripetere un\'attività serve la data' };
          const r = Object.assign({ ogni: 1, giorniSettimana: [], fine: '' }, ric, { id: ++dati.contatori.ric, inizio: primo });
          dati.ricorrenze.push(r);
          nuova.idRicorrenza = r.id;
          nuova.occorrenza = primo;
          RA.prossimeDate(r, primo, 200).filter(g => g > primo && g <= RA.piuGiorni(dati.oggi, 90)).forEach(g => {
            const y = copia(nuova);
            y.id = ++dati.contatori.att;
            y.occorrenza = g;
            const sposta = s => s ? g + String(s).slice(10) : s;
            if (y.scadenza) y.scadenza = g;
            y.inizio = sposta(y.inizio);
            y.fine = sposta(y.fine);
            y.checklist.forEach(c => { c.id = ++dati.contatori.chk; c.fatta = false; });
            dati.attivita.push(y);
          });
        }
        scrivi(dati, azione, 'attivita', nuova.id, nuova.titolo, null, { titolo: nuova.titolo });
        const risposta = { ok: true, attivita: attivitaCompleta(dati, nuova) };
        if (nuova.idRicorrenza) risposta.occorrenze = dati.attivita.filter(y => y.idRicorrenza === nuova.idRicorrenza).length;
        return risposta;
      }
      case 'faiAttivita': {
        const x = trova(dati.attivita, b.id);
        if (!x) return { ok: false, errore: 'Attività non trovata' };
        x.stato = b.fatta === false ? 'da_fare' : 'fatta';
        x.fattaIl = x.stato === 'fatta' ? adesso : '';
        scrivi(dati, azione, 'attivita', x.id, x.titolo, { stato: b.fatta === false ? 'fatta' : 'da_fare' }, { stato: x.stato });
        return { ok: true, attivita: attivitaCompleta(dati, x) };
      }
      case 'togliAttivita': {
        const x = trova(dati.attivita, b.id);
        if (!x) return { ok: false, errore: 'Attività non trovata' };
        const quali = x.idRicorrenza && (b.perRicorrenza === 'future' || b.perRicorrenza === 'tutte')
          ? dati.attivita.filter(y => String(y.idRicorrenza) === String(x.idRicorrenza) && (b.perRicorrenza === 'tutte' || RA.giornoDi(y) >= RA.giornoDi(x))) : [x];
        quali.forEach(y => { y.stato = 'annullata'; });
        scrivi(dati, azione, 'attivita', x.id, x.titolo, { stato: 'da_fare' }, { stato: 'annullata' });
        return { ok: true, attivita: attivitaCompleta(dati, x), tolte: quali.length };
      }
      case 'spuntaChecklist': {
        const x = b.idAttivita ? trova(dati.attivita, b.idAttivita) : dati.attivita.find(y => y.checklist.some(c => String(c.id) === String(b.id)));
        const c = x && x.checklist.find(y => String(y.id) === String(b.id));
        if (!c) return { ok: false, errore: 'Voce non trovata' };
        c.fatta = !!b.fatta;
        return { ok: true, attivita: attivitaCompleta(dati, x) };
      }
      case 'togliAllegato': {
        const x = dati.attivita.find(y => (y.allegati || []).some(f => f.id === b.id));
        if (!x) return { ok: false, errore: 'Allegato non trovato' };
        x.allegati = x.allegati.filter(f => f.id !== b.id);
        return { ok: true, attivita: attivitaCompleta(dati, x) };
      }
      default:
        return fase3(dati, azione, b);
    }
  }

  // ======================================================================= fase 3: ore, timer, approvazioni, spese, trasferte

  const due3 = n => String(n).padStart(2, '0');
  const oraLocale = d => due3(d.getHours()) + ':' + due3(d.getMinutes());
  const istanteLocale = d => d.getFullYear() + '-' + due3(d.getMonth() + 1) + '-' + due3(d.getDate()) + 'T' + oraLocale(d) + ':' + due3(d.getSeconds());

  /** Le cose scritte da questa persona vanno approvate? (impostazione APPROVAZIONE, §14.1) */
  function serveApprovazione(dati, idUtente) {
    const regola = dati.ana.impostazioni.APPROVAZIONE || 'collaboratori';
    if (regola === 'nessuno') return false;
    if (regola === 'tutti') return true;
    const u = dati.ana.utenti.find(x => x.id === Number(idUtente));
    return !!u && u.ruolo === 'collaboratore';
  }

  /** Le azioni della fase 3 (fase3.md §4, architettura.md §14), sui dati di esempio. */
  function fase3(dati, azione, b) {
    const a = dati.ana;
    const adesso = istanteLocale(new Date());
    const io = dati.io.id;
    const mio = dati.io.ruolo === 'collaboratore';
    const puoApprovare = !mio && R.puo(dati.permessiIo, 'rapportini', 2);
    const nome = id => (a.utenti.find(u => u.id === Number(id)) || {}).nome || '';
    const com = id => a.commesse.find(m => m.id === String(id || '').toUpperCase());
    const cli = id => a.soggetti.find(s => s.id === id);
    const visibile = x => !mio || x.idUtente === io;
    const trova = (lista, id) => lista.find(x => String(x.id) === String(id));
    const nelPeriodo = (data, da, al) => (!da || data >= da) && (!al || data <= al);
    const meseDiOggi = RO.periodoMese(dati.oggi.slice(0, 7));
    const conta = x => !x.tolta && (x.stato === 'da_approvare' || x.stato === 'approvata');
    const costoOrario = idCommessa => { const m = com(idCommessa); return C.costoOrarioDi(m ? cli(m.idCliente) : null, m || null, a.impostazioni); };
    const stato = (idUtente, bozza) => (bozza ? 'bozza' : serveApprovazione(dati, idUtente) ? 'da_approvare' : 'approvata');

    const oreCompleta = o => {
      const m = com(o.idCommessa);
      const bloccata = mio && o.stato === 'approvata' ? 'Sono già approvate: per cambiarle chiedi a chi approva' : '';
      return Object.assign({}, o, { utente: nome(o.idUtente), commessa: m ? m.descrizione : '', idCliente: m ? m.idCliente : '', cliente: m && cli(m.idCliente) ? cli(m.idCliente).nome : '',
        prestazione: '', attivita: '', costo: o.costoOrario ? C.centesimi(o.ore * o.costoOrario) : null, approvataDaNome: o.approvataDa ? nome(o.approvataDa) : '',
        puoScrivere: R.puo(dati.permessiIo, 'rapportini', 2) && !bloccata, bloccata });
    };
    const spesaCompleta = s => {
      const m = com(s.idCommessa);
      const bloccata = s.rimborsataIl ? 'Rimborsata il ' + C.data(s.rimborsataIl) + ': non si cambia' : mio && s.stato === 'approvata' ? 'È già approvata: per cambiarla chiedi a chi approva' : '';
      return Object.assign({}, s, { utente: nome(s.idUtente), commessa: m ? m.descrizione : '', idCliente: m ? m.idCliente : s.idCliente, cliente: m && cli(m.idCliente) ? cli(m.idCliente).nome : (cli(s.idCliente) || {}).nome || '',
        approvataDaNome: s.approvataDa ? nome(s.approvataDa) : '', puoScrivere: R.puo(dati.permessiIo, 'spese', 2) && !bloccata, bloccata, soloCampi: null });
    };
    const trasfertaCompleta = t => {
      const m = com(t.idCommessa);
      const r = RO.rimborsoTrasferta(t);
      const bloccata = t.rimborsataIl ? 'Rimborsata il ' + C.data(t.rimborsataIl) + ': non si cambia' : mio && t.stato === 'approvata' ? 'È già approvata: per cambiarla chiedi a chi approva' : '';
      const sue = dati.spese.filter(s => String(s.idTrasferta) === String(t.id) && !s.tolta);
      const giorni = Math.round((new Date(t.al + 'T12:00:00') - new Date(t.dal + 'T12:00:00')) / 86400000) + 1;
      return Object.assign({}, t, { utente: nome(t.idUtente), giorni, commessa: m ? m.descrizione : '', idCliente: m ? m.idCliente : t.idCliente, cliente: m && cli(m.idCliente) ? cli(m.idCliente).nome : '',
        kmTotali: r.kmTotali, rimborsoKm: r.rimborsoKm, totale: r.totale, approvataDaNome: t.approvataDa ? nome(t.approvataDa) : '',
        spese: sue.map(spesaCompleta), speseTotale: C.centesimi(sue.filter(s => s.stato !== 'respinta').reduce((x, s) => x + s.importo, 0)), puoScrivere: R.puo(dati.permessiIo, 'spese', 2) && !bloccata, bloccata });
    };
    const timerRisposta = t => (t ? { partitoIl: t.partitoIl, idCommessa: t.idCommessa, commessa: (com(t.idCommessa) || {}).descrizione || '', idPrestazione: null, idAttivita: null,
      descrizione: t.descrizione, fatturabile: !!t.idCommessa, secondi: Math.floor((Date.now() - t.ms) / 1000) } : null);
    const rapDelGiorno = (idUtente, g) => dati.rapportini.filter(r => r.stato !== 'ANNULLATO' && r.data === g && (idUtente === null || r.idUtente === idUtente));

    switch (azione) {
      // ------------------------------------------------- ore
      case 'ore': {
        const sett = RO.settimanaDi(dati.oggi);
        const da = b.da || sett[0];
        const al = b.a || sett[6];
        const ut = mio ? io : (b.utente ? Number(b.utente) : null);
        const righe = dati.ore.filter(o => !o.tolta && nelPeriodo(o.data, da, al) && (ut === null || o.idUtente === ut) &&
          (!b.commessa || (b.commessa === 'studio' ? !o.idCommessa : o.idCommessa === b.commessa)) && (!b.stato || b.stato === 'tutte' || o.stato === b.stato))
          .sort((x, y) => (x.data + x.inizio + String(x.id).padStart(6, '0') < y.data + y.inizio + String(y.id).padStart(6, '0') ? -1 : 1)).map(oreCompleta);
        const giorni = [];
        for (let gi = da; gi <= al && giorni.length < 400; gi = giorno(gi, 1)) {
          giorni.push({ data: gi, ore: C.centesimi(righe.filter(o => o.data === gi && o.stato !== 'respinta').reduce((x, o) => x + o.ore, 0)),
            oreRapportini: C.centesimi(rapDelGiorno(ut, gi).reduce((x, r) => x + C.num(r.oreTotali), 0)) });
        }
        const valide = righe.filter(o => o.stato !== 'respinta');
        const somma = l => C.centesimi(l.reduce((x, o) => x + o.ore, 0));
        return { ok: true, da, a: al, oreGiornaliere: a.impostazioni.ORE_GIORNALIERE || 8, ore: righe, giorni,
          totali: { ore: somma(valide), fatturabili: somma(valide.filter(o => o.fatturabile)), straordinarie: somma(valide.filter(o => o.tipo === 'straordinaria')),
            oreRapportini: C.centesimi(giorni.reduce((x, gi) => x + gi.oreRapportini, 0)), daApprovare: righe.filter(o => o.stato === 'da_approvare').length } };
      }
      case 'salvaOre': {
        const x = b.riga || {};
        const o = x.id ? trova(dati.ore, x.id) : null;
        if (x.id && (!o || !visibile(o) || o.tolta)) return { ok: false, errore: 'Ore ' + x.id + ' non trovate' };
        if (o && mio && o.stato === 'approvata') return { ok: false, errore: 'Sono già approvate: per cambiarle chiedi a chi approva' };
        if (!o && x.idUtente && mio && Number(x.idUtente) !== io) return NONPERMESSO('registrare le ore');
        const nuovo = Object.assign({}, o || { id: ++dati.contatori.ore, idUtente: x.idUtente && !mio ? Number(x.idUtente) : io, data: dati.oggi, inizio: '', fine: '', pausaMinuti: 0, ore: 0, giornoDopo: false,
          idCommessa: '', idPrestazione: null, idAttivita: null, descrizione: '', fatturabile: null, tipo: 'ordinaria', dalTimer: false, tolta: '', creato: adesso, approvataDa: null, approvataIl: '', motivoRifiuto: '' });
        ['data', 'idCommessa', 'idPrestazione', 'idAttivita', 'descrizione', 'fatturabile', 'tipo', 'inizio', 'fine'].forEach(k => { if (x[k] !== undefined) nuovo[k] = x[k]; });
        if (x.pausaMinuti !== undefined) nuovo.pausaMinuti = Number(x.pausaMinuti) || 0;
        if (nuovo.idCommessa && !com(nuovo.idCommessa)) return { ok: false, errore: 'Commessa ' + nuovo.idCommessa + ' non trovata' };
        if (nuovo.inizio && nuovo.fine) {
          try { const k = RO.oreDaOrari(nuovo.inizio, nuovo.fine, nuovo.pausaMinuti); Object.assign(nuovo, { inizio: k.inizio, fine: k.fine, ore: k.ore, giornoDopo: k.giornoDopo }); } catch (e) { return { ok: false, errore: e.message }; }
        } else if (x.ore !== undefined) {
          const n = Math.round(Number(x.ore) * 100) / 100;
          if (!(n >= 0 && n <= 24)) return { ok: false, errore: 'Ore: da 0 a 24' };
          Object.assign(nuovo, { ore: n, giornoDopo: false });
        }
        if (!x.bozza && !(nuovo.ore > 0)) return { ok: false, errore: 'Ore: scrivi quante ore hai lavorato' };
        if (nuovo.fatturabile === null || nuovo.fatturabile === undefined) nuovo.fatturabile = !!nuovo.idCommessa;
        if (!o || (o && o.idCommessa !== nuovo.idCommessa)) nuovo.costoOrario = costoOrario(nuovo.idCommessa);
        // Chi approva può correggere le ore degli altri: lo stato resta (§14.1).
        if (x.bozza) nuovo.stato = 'bozza';
        else if (!(o && puoApprovare && o.idUtente !== io && o.stato !== 'bozza')) Object.assign(nuovo, { stato: stato(nuovo.idUtente, false), approvataDa: null, approvataIl: '', motivoRifiuto: '' });
        nuovo.modificato = adesso;
        if (o) Object.assign(o, nuovo); else dati.ore.push(nuovo);
        scrivi(dati, 'salvaOre', 'ore', nuovo.id, nuovo.descrizione || 'ore', o ? { ore: o.ore } : null, { ore: nuovo.ore });
        return { ok: true, riga: oreCompleta(o || nuovo) };
      }
      case 'togliOre': {
        const o = trova(dati.ore, b.id);
        if (!o || !visibile(o)) return { ok: false, errore: 'Ore ' + b.id + ' non trovate' };
        if (mio && o.stato === 'approvata') return { ok: false, errore: 'Sono già approvate: per toglierle chiedi a chi approva' };
        o.tolta = b.annulla ? '' : adesso;
        return { ok: true, riga: oreCompleta(o) };
      }
      case 'timer':
        return { ok: true, adesso, timer: timerRisposta(dati.timer[io]) };
      case 'avviaTimer': {
        const t = dati.timer[io];
        if (t) return { ok: false, errore: 'Il timer è già acceso dalle ' + t.partitoIl.slice(11, 16) + (t.idCommessa ? ' (' + t.idCommessa + ')' : '') + ': fermalo prima di avviarne un altro', timer: timerRisposta(t) };
        // Nei dati di esempio parte da 37 minuti fa: fermandolo si vede una bozza vera.
        const partito = new Date(Date.now() - 37 * 60000);
        dati.timer[io] = { ms: partito.getTime(), partitoIl: istanteLocale(partito), idCommessa: b.idCommessa || '', descrizione: b.descrizione || '' };
        return { ok: true, adesso, timer: timerRisposta(dati.timer[io]) };
      }
      case 'fermaTimer': {
        const t = dati.timer[io];
        if (!t) return { ok: false, errore: 'Il timer non è acceso' };
        delete dati.timer[io];
        const inizio = t.partitoIl.slice(11, 16);
        const fine = oraLocale(new Date());
        const k = inizio !== fine ? RO.oreDaOrari(inizio, fine, 0) : null;
        const riga = { id: ++dati.contatori.ore, idUtente: io, data: t.partitoIl.slice(0, 10), inizio, fine: k ? fine : '', pausaMinuti: 0, ore: k ? k.ore : 0, giornoDopo: k ? k.giornoDopo : false,
          idCommessa: t.idCommessa, idPrestazione: null, idAttivita: null, descrizione: t.descrizione, fatturabile: !!t.idCommessa, tipo: 'ordinaria', costoOrario: costoOrario(t.idCommessa),
          stato: 'bozza', approvataDa: null, approvataIl: '', motivoRifiuto: '', dalTimer: true, tolta: '', creato: adesso, modificato: adesso };
        dati.ore.push(riga);
        return { ok: true, timer: null, riga: oreCompleta(riga) };
      }

      // ------------------------------------------------- approvazioni
      case 'daApprovare': {
        if (!puoApprovare) return { ok: false, errore: 'Non hai il permesso per approvare ore, rapportini e spese: chiedi al titolare', permesso: false };
        const limite = (Number(a.impostazioni.ORE_GIORNALIERE) || 8) + 4;
        const oreDi = (idUtente, gi) => C.centesimi(dati.ore.filter(o => conta(o) && o.idUtente === idUtente && o.data === gi).reduce((x, o) => x + o.ore, 0) +
          rapDelGiorno(idUtente, gi).reduce((x, r) => x + C.num(r.oreTotali), 0));
        const troppe = (idUtente, gi) => { const t = oreDi(idUtente, gi); return t > limite ? [{ tipo: 'troppeOre', testo: C.numero(t) + ' ore in un giorno' }] : []; };
        const giornoTesto = gi => RO.giornoLungo(gi).split(' ').slice(0, 2).join(' ');
        const voci = [];
        dati.ore.filter(o => !o.tolta && o.stato === 'da_approvare').forEach(o => voci.push({ tipo: 'ore', id: o.id, idUtente: o.idUtente, data: o.data, cosa: 'Ore',
          dettaglio: [o.idCommessa || 'Studio', o.descrizione, giornoTesto(o.data)].filter(Boolean).join(' · '), quanto: o.ore, unita: 'ore', anomalie: troppe(o.idUtente, o.data) }));
        dati.rapportini.filter(r => r.stato !== 'ANNULLATO' && r.statoApprovazione === 'da_approvare').forEach(r => voci.push({ tipo: 'rapportino', id: r.id, idUtente: r.idUtente, data: r.data, cosa: 'Rapportino',
          dettaglio: [r.id, r.descrizione, giornoTesto(r.data)].join(' · '), quanto: C.num(r.oreTotali), unita: 'ore', km: C.num(r.km), anomalie: troppe(r.idUtente, r.data) }));
        dati.spese.filter(s => !s.tolta && s.stato === 'da_approvare' && !s.idRapportino).forEach(s => voci.push({ tipo: 'spesa', id: s.id, idUtente: s.idUtente, data: s.data, cosa: 'Spesa',
          dettaglio: [s.descrizione || RO.categoria(s.categoria).nome, s.idCommessa || 'senza commessa', giornoTesto(s.data)].join(' · '), quanto: s.importo, unita: 'euro',
          anomalie: [].concat(s.foto.length ? [] : [{ tipo: 'senzaFoto', testo: 'Senza scontrino' }], s.importo > 200 ? [{ tipo: 'sopra200', testo: 'Spesa sopra i 200 €' }] : []) }));
        dati.trasferte.filter(t => !t.tolta && t.stato === 'da_approvare').forEach(t => voci.push({ tipo: 'trasferta', id: t.id, idUtente: t.idUtente, data: t.dal, cosa: 'Trasferta',
          dettaglio: [t.destinazione, t.idCommessa || 'senza commessa', giornoTesto(t.dal)].join(' · '), quanto: RO.rimborsoTrasferta(t).totale, unita: 'euro', km: RO.rimborsoTrasferta(t).kmTotali, anomalie: [] }));
        const ordine = { ore: 0, rapportino: 1, spesa: 2, trasferta: 3 };
        const per = new Map();
        voci.sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : ordine[x.tipo] - ordine[y.tipo])).forEach(v => {
          if (!per.has(v.idUtente)) per.set(v.idUtente, { idUtente: v.idUtente, nome: nome(v.idUtente), quante: 0, conAnomalie: 0, voci: [] });
          const p = per.get(v.idUtente);
          p.voci.push(v);
          p.quante++;
          if (v.anomalie.length) p.conAnomalie++;
        });
        const persone = Array.from(per.values()).sort((x, y) => x.nome.localeCompare(y.nome, 'it'));
        return { ok: true, oggi: dati.oggi, quante: voci.length, conAnomalie: voci.filter(v => v.anomalie.length).length, persone };
      }
      case 'approva':
      case 'respingi':
      case 'annullaApprovazione': {
        if (!puoApprovare) return { ok: false, errore: 'Non hai il permesso per approvare ore e rapportini: chiedi al titolare', permesso: false };
        const voci = b.voci || [];
        if (!voci.length) return { ok: false, errore: 'Scegli cosa ' + (azione === 'approva' ? 'approvare' : azione === 'respingi' ? 'respingere' : 'rimettere da approvare') };
        if (azione === 'respingi' && !String(b.motivo || '').trim()) return { ok: false, errore: 'Scrivi il motivo: arriva a chi l\'ha scritta' };
        let fatte = 0;
        const out = voci.map(v => {
          const lista = { ore: dati.ore, spesa: dati.spese, trasferta: dati.trasferte }[v.tipo];
          const x = v.tipo === 'rapportino' ? dati.rapportini.find(r => r.id === v.id) : lista ? trova(lista, v.id) : null;
          if (!x) return { tipo: v.tipo, id: v.id, stato: '' };
          if (v.tipo === 'rapportino') {
            const nuovo = azione === 'approva' ? 'approvato' : azione === 'respingi' ? 'respinto' : 'da_approvare';
            if (x.statoApprovazione !== nuovo) { Object.assign(x, { statoApprovazione: nuovo, motivoRifiuto: azione === 'respingi' ? b.motivo : '', approvatoDa: azione === 'annullaApprovazione' ? null : io, approvatoIl: azione === 'annullaApprovazione' ? '' : adesso }); fatte++; }
            return { tipo: v.tipo, id: v.id, stato: nuovo };
          }
          const nuovo = azione === 'approva' ? 'approvata' : azione === 'respingi' ? 'respinta' : 'da_approvare';
          if (x.stato !== nuovo) { Object.assign(x, { stato: nuovo, motivoRifiuto: azione === 'respingi' ? b.motivo : '', approvataDa: azione === 'annullaApprovazione' ? null : io, approvataIl: azione === 'annullaApprovazione' ? '' : adesso }); fatte++; }
          return { tipo: v.tipo, id: v.id, stato: nuovo };
        });
        return { ok: true, fatte, voci: out };
      }

      // ------------------------------------------------- statistiche e costo della commessa
      case 'statisticheOre': {
        const da = b.da || meseDiOggi.da;
        const al = b.a || meseDiOggi.a;
        const perPersona = (b.per || 'persona') === 'persona';
        const righe = new Map();
        const di = (chiave, base) => righe.get(chiave) || righe.set(chiave, Object.assign({ chiave, ore: 0, fatturabili: 0, oreRapportini: 0, oreRegistrate: 0, costo: 0, costoNoto: true }, base)).get(chiave);
        const baseCommessa = id => { const m = com(id); return { nome: m ? m.descrizione : 'Attività dello studio', idCliente: m ? m.idCliente : '', cliente: m && cli(m.idCliente) ? cli(m.idCliente).nome : '' }; };
        dati.rapportini.filter(r => r.stato !== 'ANNULLATO' && r.statoApprovazione !== 'respinto' && nelPeriodo(r.data, da, al) && visibile(r)).forEach(r => {
          const x = perPersona ? di(r.idUtente, { nome: nome(r.idUtente) }) : di(r.idCommessa || '', baseCommessa(r.idCommessa));
          const lavoro = C.num(r.oreLavoro) + C.num(r.oreExtra);
          const tot = C.num(r.oreTotali) || lavoro + C.num(r.oreViaggio);
          x.ore += tot; x.oreRapportini += tot; x.fatturabili += lavoro + (r.pagaViaggio ? C.num(r.oreViaggio) : 0); x.costo += lavoro * C.num(r.costoOrario);
        });
        dati.ore.filter(o => conta(o) && nelPeriodo(o.data, da, al) && visibile(o)).forEach(o => {
          const x = perPersona ? di(o.idUtente, { nome: nome(o.idUtente) }) : di(o.idCommessa || '', baseCommessa(o.idCommessa));
          x.ore += o.ore; x.oreRegistrate += o.ore; if (o.fatturabile) x.fatturabili += o.ore; x.costo += o.ore * C.num(o.costoOrario);
        });
        const tondo = n => Math.round(n * 100) / 100;
        const lista = Array.from(righe.values()).map(x => Object.assign(x, { ore: tondo(x.ore), fatturabili: tondo(x.fatturabili), oreRapportini: tondo(x.oreRapportini), oreRegistrate: tondo(x.oreRegistrate),
          costo: C.centesimi(x.costo), percentuale: x.ore ? Math.round(x.fatturabili / x.ore * 100) : null })).sort((x, y) => y.ore - x.ore);
        const t = lista.reduce((s, x) => ({ ore: s.ore + x.ore, fatturabili: s.fatturabili + x.fatturabili, oreRapportini: s.oreRapportini + x.oreRapportini, oreRegistrate: s.oreRegistrate + x.oreRegistrate, costo: s.costo + x.costo }),
          { ore: 0, fatturabili: 0, oreRapportini: 0, oreRegistrate: 0, costo: 0 });
        return { ok: true, da, a: al, per: perPersona ? 'persona' : 'commessa', righe: lista,
          totale: { ore: tondo(t.ore), fatturabili: tondo(t.fatturabili), percentuale: t.ore ? Math.round(t.fatturabili / t.ore * 100) : null, oreRapportini: tondo(t.oreRapportini), oreRegistrate: tondo(t.oreRegistrate), costo: C.centesimi(t.costo), costoNoto: true } };
      }
      case 'costoCommessa': {
        const m = com(b.idCommessa);
        if (!m) return { ok: false, errore: 'Commessa ' + (b.idCommessa || '') + ' non trovata' };
        const k = C.cruscotto(m, dati.rapportini, a.impostazioni, dati.oggi, cli(m.idCliente));
        const oreSue = dati.ore.filter(o => conta(o) && o.idCommessa === m.id);
        const oreRegistrate = C.centesimi(oreSue.reduce((x, o) => x + o.ore, 0));
        const costoOreRegistrate = C.centesimi(oreSue.reduce((x, o) => x + o.ore * C.num(o.costoOrario), 0));
        const speseFuori = C.centesimi(dati.spese.filter(s => conta(s) && s.idCommessa === m.id && !s.idRapportino && s.destinazione !== 'personale').reduce((x, s) => x + s.importo, 0));
        const tr = dati.trasferte.filter(t => conta(t) && t.idCommessa === m.id).map(t => RO.rimborsoTrasferta(t));
        const trasferte = C.centesimi(tr.reduce((x, r) => x + r.totale, 0));
        const soloRapportini = C.centesimi(k.costo.lavoro + k.costo.auto + k.costo.spese);
        return { ok: true, idCommessa: m.id, costoCommessa: { lavoro: k.costo.lavoro, lavoroNoto: k.costo.lavoroNoto, auto: k.costo.auto, speseRapportini: k.costo.spese, oreRegistrate, costoOreRegistrate,
          speseFuoriRapportini: speseFuori, trasferte, kmTrasferte: Math.round(tr.reduce((x, r) => x + r.kmTotali, 0) * 100) / 100, soloRapportini,
          totale: C.centesimi(soloRapportini + costoOreRegistrate + speseFuori + trasferte) } };
      }

      // ------------------------------------------------- spese
      case 'spese': {
        const da = b.da || meseDiOggi.da;
        const al = b.a || meseDiOggi.a;
        const ut = mio ? io : (b.utente ? Number(b.utente) : null);
        const lista = dati.spese.filter(s => !s.tolta && nelPeriodo(s.data, da, al) && (ut === null || s.idUtente === ut) && (!b.commessa || s.idCommessa === b.commessa) &&
          (!b.stato || b.stato === 'tutte' || s.stato === b.stato) && (!b.destinazione || s.destinazione === b.destinazione) && (!b.idTrasferta || String(s.idTrasferta) === String(b.idTrasferta)))
          .sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : y.id - x.id)).map(spesaCompleta);
        const valide = lista.filter(s => s.stato !== 'respinta');
        const somma = l => C.centesimi(l.reduce((x, s) => x + s.importo, 0));
        return { ok: true, da, a: al, spese: lista, totali: { quante: lista.length, cliente: somma(valide.filter(s => s.destinazione === 'cliente')), studio: somma(valide.filter(s => s.destinazione === 'studio')),
          personale: somma(valide.filter(s => s.destinazione === 'personale')),
          daRimborsare: somma(valide.filter(s => s.pagataDaMe && s.destinazione !== 'personale' && !s.rimborsataIl && (s.stato === 'da_approvare' || s.stato === 'approvata'))),
          senzaFoto: valide.filter(s => !s.foto.length).length } };
      }
      case 'salvaSpesa': {
        const x = b.spesa || {};
        const s = x.id ? trova(dati.spese, x.id) : null;
        if (x.id && (!s || !visibile(s) || s.tolta)) return { ok: false, errore: 'Spesa ' + x.id + ' non trovata' };
        if (s && (s.rimborsataIl || (mio && s.stato === 'approvata'))) return { ok: false, errore: spesaCompleta(s).bloccata };
        const tr = x.idTrasferta ? trova(dati.trasferte, x.idTrasferta) : null;
        const nuovo = Object.assign({}, s || { id: ++dati.contatori.spesa, idUtente: tr ? tr.idUtente : x.idUtente && !mio ? Number(x.idUtente) : io, data: dati.oggi, importo: 0, categoria: 'altro', descrizione: '',
          idCommessa: tr ? tr.idCommessa : '', idCliente: '', idRapportino: '', idTrasferta: tr ? tr.id : null, destinazione: null, anticipazione: false, pagataDaMe: false,
          approvataDa: null, approvataIl: '', motivoRifiuto: '', rimborsataIl: '', fatturataIl: '', dalRapportino: false, foto: [], tolta: '', creato: adesso });
        ['data', 'categoria', 'descrizione', 'idCommessa', 'idCliente', 'destinazione', 'anticipazione', 'pagataDaMe'].forEach(k => { if (x[k] !== undefined) nuovo[k] = x[k]; });
        if (x.importo !== undefined) nuovo.importo = C.centesimi(C.num(x.importo));
        if (nuovo.destinazione === 'mia') nuovo.destinazione = 'personale';
        if (!nuovo.destinazione) nuovo.destinazione = RO.destinazioneDiBase(nuovo);
        if (nuovo.destinazione !== 'cliente') nuovo.anticipazione = false;
        if (!x.bozza && !(nuovo.importo > 0)) return { ok: false, errore: 'Importo: scrivi quanto hai speso' };
        if (nuovo.destinazione === 'cliente' && !nuovo.idCommessa && !nuovo.idCliente) return { ok: false, errore: 'Al cliente: scegli la commessa o il cliente' };
        if (x.bozza) nuovo.stato = 'bozza';
        else if (!(s && puoApprovare && s.idUtente !== io && s.stato !== 'bozza')) Object.assign(nuovo, { stato: stato(nuovo.idUtente, false), approvataDa: null, approvataIl: '', motivoRifiuto: '' });
        nuovo.modificato = adesso;
        if (s) Object.assign(s, nuovo); else dati.spese.push(nuovo);
        scrivi(dati, 'salvaSpesa', 'spese', nuovo.id, nuovo.descrizione || 'spesa', s ? { importo: s.importo } : null, { importo: nuovo.importo });
        return { ok: true, spesa: spesaCompleta(s || nuovo) };
      }
      case 'togliSpesa': {
        const s = trova(dati.spese, b.id);
        if (!s || !visibile(s)) return { ok: false, errore: 'Spesa ' + b.id + ' non trovata' };
        s.tolta = b.annulla ? '' : adesso;
        return { ok: true, spesa: spesaCompleta(s) };
      }
      case 'togliFotoSpesa': {
        const s = dati.spese.find(y => y.foto.some(f => f.id === b.id));
        if (!s) return { ok: false, errore: 'Foto non trovata' };
        s.foto = s.foto.filter(f => f.id !== b.id);
        return { ok: true, spesa: spesaCompleta(s) };
      }

      // ------------------------------------------------- trasferte e veicoli
      case 'trasferte': {
        const da = b.da || meseDiOggi.da;
        const al = b.a || meseDiOggi.a;
        const ut = mio ? io : (b.utente ? Number(b.utente) : null);
        const lista = dati.trasferte.filter(t => !t.tolta && nelPeriodo(t.dal, da, al) && (ut === null || t.idUtente === ut) && (!b.commessa || t.idCommessa === b.commessa) && (!b.stato || b.stato === 'tutte' || t.stato === b.stato))
          .sort((x, y) => (x.dal < y.dal ? 1 : -1)).map(trasfertaCompleta);
        const valide = lista.filter(t => t.stato !== 'respinta');
        const somma = (l, k) => C.centesimi(l.reduce((x, t) => x + C.num(t[k]), 0));
        return { ok: true, da, a: al, trasferte: lista, totali: { quante: lista.length, km: somma(valide, 'kmTotali'), rimborsoKm: somma(valide, 'rimborsoKm'), indennita: somma(valide, 'indennita'),
          totale: somma(valide, 'totale'), daRimborsare: somma(valide.filter(t => !t.rimborsataIl && (t.stato === 'da_approvare' || t.stato === 'approvata')), 'totale') } };
      }
      case 'salvaTrasferta': {
        const x = b.trasferta || {};
        const t = x.id ? trova(dati.trasferte, x.id) : null;
        if (x.id && (!t || !visibile(t) || t.tolta)) return { ok: false, errore: 'Trasferta ' + x.id + ' non trovata' };
        if (!String(x.destinazione !== undefined ? x.destinazione : (t || {}).destinazione || '').trim()) return { ok: false, errore: 'Destinazione: scrivi dove sei andato' };
        const nuovo = Object.assign({}, t || { id: ++dati.contatori.tr, idUtente: x.idUtente && !mio ? Number(x.idUtente) : io, dal: dati.oggi, al: '', destinazione: '', motivo: '', idCommessa: '', idCliente: '',
          km: 0, andataRitorno: false, idVeicolo: null, veicolo: '', euroKm: null, indennita: 0, approvataDa: null, approvataIl: '', motivoRifiuto: '', rimborsataIl: '', tolta: '', creato: adesso });
        ['dal', 'al', 'destinazione', 'motivo', 'idCommessa', 'andataRitorno', 'indennita'].forEach(k => { if (x[k] !== undefined) nuovo[k] = x[k]; });
        if (x.km !== undefined) nuovo.km = C.num(x.km);
        if (!nuovo.al) nuovo.al = nuovo.dal;
        if (nuovo.al < nuovo.dal) return { ok: false, errore: 'Al: non può venire prima della partenza' };
        const idV = x.idVeicolo !== undefined ? x.idVeicolo : (t ? t.idVeicolo : (dati.veicoli.find(v => v.attivo) || {}).id);
        if (!t || String(idV) !== String(t.idVeicolo)) {
          const v = idV ? trova(dati.veicoli, idV) : null;
          if (nuovo.km > 0 && !v) return { ok: false, errore: 'Veicolo: scegli con quale veicolo, per il rimborso al km' };
          Object.assign(nuovo, { idVeicolo: v ? v.id : null, veicolo: v ? v.nome : '', euroKm: v ? v.euroKm : null });
        }
        if (!x.bozza && !(t && puoApprovare && t.idUtente !== io && t.stato !== 'bozza')) Object.assign(nuovo, { stato: stato(nuovo.idUtente, false), approvataDa: null, approvataIl: '', motivoRifiuto: '' });
        if (x.bozza) nuovo.stato = 'bozza';
        nuovo.modificato = adesso;
        if (t) Object.assign(t, nuovo); else dati.trasferte.push(nuovo);
        scrivi(dati, 'salvaTrasferta', 'trasferte', nuovo.id, nuovo.destinazione, t ? { km: t.km } : null, { km: nuovo.km });
        return { ok: true, trasferta: trasfertaCompleta(t || nuovo) };
      }
      case 'togliTrasferta': {
        const t = trova(dati.trasferte, b.id);
        if (!t || !visibile(t)) return { ok: false, errore: 'Trasferta ' + b.id + ' non trovata' };
        const sue = dati.spese.filter(s => String(s.idTrasferta) === String(t.id) && !s.tolta).length;
        if (!b.annulla && sue) return { ok: false, errore: 'La trasferta ha ' + (sue === 1 ? '1 spesa' : sue + ' spese') + ': prima toglile o spostale' };
        t.tolta = b.annulla ? '' : adesso;
        return { ok: true, trasferta: trasfertaCompleta(t) };
      }
      case 'veicoli':
        return { ok: true, aciAnno: a.impostazioni.ACI_ANNO, paginaAci: 'https://www.aci.it/',
          veicoli: dati.veicoli.filter(v => v.attivo || b.tutti).map(v => Object.assign({}, v, { trasferte: dati.trasferte.filter(t => !t.tolta && t.idVeicolo === v.id).length })) };
      case 'salvaVeicolo': {
        const x = b.veicolo || {};
        if (!String(x.nome || '').trim()) return { ok: false, errore: 'Nome: scrivi il nome del veicolo' };
        if (!(C.num(x.euroKm) >= 0)) return { ok: false, errore: 'Euro al km: non può essere negativo' };
        const v = x.id ? trova(dati.veicoli, x.id) : null;
        const nuovo = Object.assign(v || { id: ++dati.contatori.ve, creato: adesso }, { nome: String(x.nome).trim(), alimentazione: x.alimentazione || '', euroKm: Math.round(C.num(x.euroKm) * 10000) / 10000,
          annoAci: x.annoAci || a.impostazioni.ACI_ANNO, attivo: x.attivo !== false, modificato: adesso });
        if (!v) dati.veicoli.push(nuovo);
        if (Number(nuovo.annoAci) > Number(a.impostazioni.ACI_ANNO)) a.impostazioni.ACI_ANNO = Number(nuovo.annoAci);
        return { ok: true, veicolo: Object.assign({}, nuovo, { trasferte: dati.trasferte.filter(t => !t.tolta && t.idVeicolo === nuovo.id).length }) };
      }

      // ------------------------------------------------- rimborsi e riepiloghi
      case 'rimborsi': {
        const ut = mio ? io : (b.utente ? Number(b.utente) : null);
        const persone = RO.rimborsiDovuti(dati.spese.filter(s => !s.idRapportino || true), dati.trasferte).filter(p => ut === null || p.idUtente === ut).map(p => Object.assign({}, p, {
          nome: nome(p.idUtente),
          voci: p.voci.map(v => v.tipo === 'spesa'
            ? { tipo: 'spesa', id: v.id, data: v.data, descrizione: v.descrizione, categoria: v.categoria, idCommessa: v.idCommessa, importo: v.importo, km: null }
            : { tipo: 'trasferta', id: v.id, data: v.dal, descrizione: v.destinazione, categoria: '', idCommessa: v.idCommessa, importo: RO.rimborsoTrasferta(v).totale, km: RO.rimborsoTrasferta(v).kmTotali }),
        }));
        return { ok: true, totale: C.centesimi(persone.reduce((x, p) => x + p.totale, 0)), puoSegnare: !mio && R.puo(dati.permessiIo, 'spese', 2) && dati.io.ruolo !== 'lettura', persone };
      }
      case 'segnaRimborsato': {
        if (mio || dati.io.ruolo === 'lettura') return { ok: false, errore: 'Non hai il permesso per segnare i rimborsi: chiedi al titolare', permesso: false };
        let voci = b.voci || [];
        if (!voci.length && b.idUtente) {
          const p = RO.rimborsiDovuti(dati.spese, dati.trasferte).find(x => x.idUtente === Number(b.idUtente));
          voci = p ? p.voci.map(v => ({ tipo: v.tipo, id: v.id })) : [];
          if (!voci.length) return { ok: false, errore: 'Non c\'è niente da rimborsare a questa persona' };
        }
        if (!voci.length) return { ok: false, errore: 'Scegli cosa segnare come rimborsato' };
        let fatte = 0;
        let totale = 0;
        voci.forEach(v => {
          const x = trova(v.tipo === 'trasferta' ? dati.trasferte : dati.spese, v.id);
          if (!x) return;
          x.rimborsataIl = b.annulla ? '' : adesso;
          fatte++;
          totale += v.tipo === 'trasferta' ? RO.rimborsoTrasferta(x).totale : x.importo;
        });
        return { ok: true, fatte, totale: C.centesimi(totale) };
      }
      case 'riepilogoSpese': {
        const da = b.da || meseDiOggi.da;
        const al = b.a || meseDiOggi.a;
        const per = b.per || 'persona';
        const righe = new Map();
        const vuota = (chiave, extra) => Object.assign({ chiave, nome: '', quante: 0, cliente: 0, studio: 0, personale: 0, anticipazioni: 0, daRimborsare: 0, inAttesa: 0, trasferte: 0, km: 0, rimborsoKm: 0, indennita: 0, totale: 0 }, extra);
        const chiaveDi = x => (per === 'persona' ? x.idUtente : per === 'commessa' ? x.idCommessa || '' : x.categoria);
        const extraDi = x => (per === 'persona' ? { nome: nome(x.idUtente) } : per === 'commessa' ? { nome: (com(x.idCommessa) || {}).descrizione || 'Senza commessa', idCliente: (com(x.idCommessa) || {}).idCliente || '',
          nomeCliente: com(x.idCommessa) && cli(com(x.idCommessa).idCliente) ? cli(com(x.idCommessa).idCliente).nome : '' } : { nome: RO.categoria(x.categoria).nome });
        const riga = x => { const k = chiaveDi(x); if (!righe.has(k)) righe.set(k, vuota(k, extraDi(x))); return righe.get(k); };
        dati.spese.filter(s => conta(s) && nelPeriodo(s.data, da, al) && visibile(s)).forEach(s => {
          const r = riga(s);
          r.quante++;
          r[s.destinazione] = C.centesimi(r[s.destinazione] + s.importo);
          if (s.anticipazione) r.anticipazioni = C.centesimi(r.anticipazioni + s.importo);
          if (s.pagataDaMe && s.destinazione !== 'personale' && !s.rimborsataIl) { r.daRimborsare = C.centesimi(r.daRimborsare + s.importo); if (s.stato === 'da_approvare') r.inAttesa = C.centesimi(r.inAttesa + s.importo); }
        });
        if (per !== 'categoria') {
          dati.trasferte.filter(t => conta(t) && nelPeriodo(t.dal, da, al) && visibile(t)).forEach(t => {
            const r = riga(t);
            const k = RO.rimborsoTrasferta(t);
            r.trasferte++; r.km += k.kmTotali; r.rimborsoKm = C.centesimi(r.rimborsoKm + k.rimborsoKm); r.indennita = C.centesimi(r.indennita + k.indennita);
            if (!t.rimborsataIl) { r.daRimborsare = C.centesimi(r.daRimborsare + k.totale); if (t.stato === 'da_approvare') r.inAttesa = C.centesimi(r.inAttesa + k.totale); }
          });
        }
        const lista = Array.from(righe.values()).map(r => Object.assign(r, { totale: C.centesimi(r.cliente + r.studio + r.rimborsoKm + r.indennita) })).sort((x, y) => y.totale - x.totale);
        const totale = vuota('', {});
        delete totale.chiave;
        delete totale.nome;
        lista.forEach(r => Object.keys(totale).forEach(k => { totale[k] = Math.round((totale[k] + C.num(r[k])) * 100) / 100; }));
        return { ok: true, da, a: al, per, righe: lista, totale };
      }
      default:
        return FASE4.has(azione) ? fase4Con(dati, azione, b) : { ok: true };
    }
  }

  /** Le voci della Dashboard della fase 3 (§14.13), come le calcola il server. */
  function dashboardFase3(dati, d, numeri) {
    const io = dati.io.id;
    const nome = id => (dati.ana.utenti.find(u => u.id === id) || {}).nome || '';
    const conta = x => !x.tolta && (x.stato === 'da_approvare' || x.stato === 'approvata');
    if (R.puo(dati.permessiIo, 'rapportini')) {
      const sett = RO.settimanaDi(dati.oggi);
      const mese = RO.periodoMese(dati.oggi.slice(0, 7));
      const sue = dati.ore.filter(o => conta(o) && (!d.mio || o.idUtente === io));
      const somma = l => Math.round(l.reduce((x, o) => x + o.ore, 0) * 100) / 100;
      numeri.ore = { settimana: somma(sue.filter(o => o.data >= sett[0] && o.data <= sett[6])), mese: somma(sue.filter(o => o.data >= mese.da && o.data <= mese.a)),
        fatturabiliMese: somma(sue.filter(o => o.fatturabile && o.data >= mese.da && o.data <= mese.a)), timerAcceso: !!dati.timer[io] };
    }
    if (!d.mio && R.puo(dati.permessiIo, 'rapportini', 2)) {
      const r = fase3(dati, 'daApprovare', {});
      if (r.ok && r.quante) {
        numeri.approvare = { voci: r.quante, conAnomalie: r.conAnomalie };
        const una = r.persone.length === 1 ? r.persone[0] : null;
        d.urgenti.push({ tipo: 'approvare', gravita: 'attenzione', titolo: r.quante + (r.quante === 1 ? ' cosa da approvare' : ' cose da approvare') + (una ? ' di ' + una.nome : ''),
          dettaglio: 'Ore, spese e rapportini' + (r.conAnomalie ? ' · ' + r.conAnomalie + (r.conAnomalie === 1 ? ' con un\'anomalia' : ' con un\'anomalia') : ''), quanto: r.quante, unita: 'voci',
          collegamento: { pagina: 'rapportini', filtro: { segmento: 'daApprovare' } } });
      }
    }
    // Le proprie cose respinte, col motivo.
    dati.ore.filter(o => !o.tolta && o.stato === 'respinta' && o.idUtente === io).slice(0, 3).forEach(o => d.urgenti.push({ tipo: 'respinta', gravita: 'attenzione', titolo: 'Ore del ' + C.data(o.data).slice(0, 5) + ' respinte',
      dettaglio: 'Motivo: ' + o.motivoRifiuto + (o.approvataDa ? ' · ' + nome(o.approvataDa) : ''), quanto: null, unita: null, collegamento: { pagina: 'rapportini', filtro: { segmento: 'ore', giorno: o.data } } }));
    dati.spese.filter(s => !s.tolta && s.stato === 'respinta' && s.idUtente === io).slice(0, 3).forEach(s => d.urgenti.push({ tipo: 'respinta', gravita: 'attenzione', titolo: 'Spesa del ' + C.data(s.data).slice(0, 5) + ' respinta',
      dettaglio: 'Motivo: ' + s.motivoRifiuto, quanto: null, unita: null, collegamento: { pagina: 'spese', filtro: { segmento: 'spese', id: s.id } } }));
    if (d.soldi && !d.mio && (dati.io.ruolo === 'titolare' || dati.io.ruolo === 'amministrazione')) {
      const dovuti = RO.rimborsiDovuti(dati.spese, dati.trasferte).filter(p => p.totale > 0);
      if (dovuti.length) {
        const tot = C.centesimi(dovuti.reduce((x, p) => x + p.totale, 0));
        numeri.rimborsi = { daFare: tot, persone: dovuti.length };
        d.settimana.push({ tipo: 'rimborsi', gravita: 'soldi', titolo: 'Rimborsi da fare', dettaglio: dovuti.slice(0, 3).map(p => nome(p.idUtente) + ' ' + C.euro(p.totale)).join(', '),
          quanto: tot, unita: 'euro', collegamento: { pagina: 'spese', filtro: { segmento: 'rimborsi' } } });
      }
    }
  }

  /** Le voci della Dashboard della fase 2 (fase2.md §4), come le calcola il server. */
  function dashboardFase2(dati, d) {
    const oggi = dati.oggi;
    const fra7 = giorno(oggi, 7);
    const io = dati.io.id;
    if (R.puo(dati.permessiIo, 'attivita')) {
      const mie = attivitaVisibili(dati).filter(a => a.stato !== 'fatta' && a.stato !== 'annullata' && (d.mio ? a.assegnataA === io : true));
      const scadute = mie.filter(a => RA.gruppoDi(a, oggi) === 'scadute');
      // Una per una fino a 3, poi una voce sola.
      (scadute.length > 3 ? [] : scadute).slice().reverse().forEach(a => {
        const chi = dati.ana.utenti.find(u => u.id === a.assegnataA);
        const giorni = RA.giorniFra(RA.giornoDi(a), oggi);
        d.urgenti.unshift({ tipo: 'attivita', gravita: 'urgente', titolo: a.titolo + ' è scaduta',
          dettaglio: [a.idCommessa, 'era per ' + RA.quandoBreve(RA.giornoDi(a), oggi), chi ? chi.nome : ''].filter(Boolean).join(' · '), quanto: giorni, unita: 'giorni', collegamento: { pagina: 'attivita', id: a.id } });
      });
      if (scadute.length > 3) d.urgenti.unshift({ tipo: 'attivita', gravita: 'urgente', titolo: scadute.length + ' attività scadute', dettaglio: scadute.slice(0, 3).map(a => a.titolo).join(', '),
        quanto: scadute.length, unita: 'attivita', collegamento: { pagina: 'attivita', filtro: { gruppo: 'scadute' } } });
      mie.filter(a => RA.giornoDi(a) === oggi && RA.conOrario(a) && a.inizio && !a.tuttoIlGiorno).reverse().forEach(a => {
        const chi = dati.ana.utenti.find(u => u.id === a.assegnataA);
        d.settimana.unshift({ tipo: a.tipo, gravita: 'attenzione', titolo: a.titolo + ' oggi alle ' + RA.ora(a.inizio), dettaglio: [chi ? chi.nome : 'Da assegnare', a.luogo].filter(Boolean).join(' · '),
          quanto: null, unita: null, collegamento: { pagina: 'calendario', filtro: { giorno: oggi } } });
      });
      const diOggi = mie.filter(a => RA.giornoDi(a) === oggi && !RA.conOrario(a));
      if (diOggi.length) d.settimana.push({ tipo: 'attivita', gravita: 'info', titolo: diOggi.length === 1 ? '1 attività da fare oggi' : diOggi.length + ' attività da fare oggi',
        dettaglio: diOggi.slice(0, 3).map(a => a.titolo).join(', '), quanto: diOggi.length, unita: 'attivita', collegamento: { pagina: 'attivita', filtro: { gruppo: 'oggi' } } });
      const prossimi = RA.raggruppa(mie.filter(a => RA.giornoDi(a) > oggi && RA.giornoDi(a) <= fra7), oggi).reduce((t, g) => t.concat(g.voci), []);
      if (prossimi.length) d.settimana.push({ tipo: 'attivita', gravita: 'info', titolo: prossimi.length === 1 ? '1 attività nei prossimi 7 giorni' : prossimi.length + ' attività nei prossimi 7 giorni',
        dettaglio: prossimi.slice(0, 3).map(a => a.titolo).join(', '), quanto: prossimi.length, unita: 'attivita', collegamento: { pagina: 'calendario', filtro: { giorno: giorno(oggi, 1) } } });
      const libere = attivitaVisibili(dati).filter(a => a.assegnataA === null && a.stato === 'da_fare');
      if (libere.length && !d.mio) d.pianificare.unshift({ tipo: 'attivita', gravita: 'info', titolo: libere.length === 1 ? '1 attività non assegnata' : libere.length + ' attività non assegnate',
        dettaglio: libere.slice(0, 2).map(a => a.titolo).join(', '), quanto: libere.length, unita: 'attivita', collegamento: { pagina: 'attivita', filtro: { nonAssegnate: true } } });
    }
    if (R.puo(dati.permessiIo, 'preventivi') && !d.mio) {
      const vivi = dati.preventivi.filter(p => !p.modello);
      vivi.filter(p => p.stato === 'INVIATO' && p.scadenza >= oggi && p.scadenza <= fra7).forEach(p => {
        const n = RP.giorniFra(oggi, p.scadenza);
        d.settimana.push({ tipo: 'preventivo', gravita: 'attenzione', titolo: etichettaPrev(p) + (n === 0 ? ' scade oggi' : ' scade fra ' + n + (n === 1 ? ' giorno' : ' giorni')),
          dettaglio: d.nome(p.idCliente) + ' · inviato il ' + C.data(p.inviatoIl).slice(0, 5), quanto: d.soldi ? C.contiPreventivo(p, vociDi(p)).totale : null, unita: d.soldi ? 'euro' : null,
          collegamento: { pagina: 'preventivo', id: p.id } });
      });
      vivi.filter(p => p.stato === 'INVIATO' && p.inviatoIl && String(p.inviatoIl).slice(0, 10) <= giorno(oggi, -15)).forEach(p => {
        const n = RP.giorniFra(String(p.inviatoIl).slice(0, 10), oggi);
        d.urgenti.push({ tipo: 'preventivo', gravita: 'attenzione', titolo: etichettaPrev(p) + ': nessuna risposta da ' + n + ' giorni',
          dettaglio: [p.oggetto, d.nome(p.idCliente), p.scadenza < oggi ? 'scaduto il ' + C.data(p.scadenza).slice(0, 5) : ''].filter(Boolean).join(' · '), quanto: n, unita: 'giorni', collegamento: { pagina: 'preventivo', id: p.id } });
      });
      vivi.filter(p => p.stato === 'ACCETTATO' && !p.idCommessa).forEach(p => {
        d.settimana.push({ tipo: 'preventivo', gravita: 'attenzione', titolo: etichettaPrev(p) + ': accettato, manca la commessa', dettaglio: d.nome(p.idCliente) + ' · ' + p.oggetto,
          quanto: d.soldi ? C.contiPreventivo(p, vociDi(p)).imponibile : null, unita: d.soldi ? 'euro' : null, collegamento: { pagina: 'preventivo', id: p.id } });
      });
      const bozze = vivi.filter(p => p.stato === 'BOZZA');
      if (bozze.length) d.pianificare.push({ tipo: 'preventivo', gravita: 'info', titolo: bozze.length === 1 ? '1 preventivo in bozza' : bozze.length + ' preventivi in bozza',
        dettaglio: bozze.map(p => p.numero + ' ' + p.oggetto).join(', '), quanto: bozze.length, unita: 'preventivi', collegamento: { pagina: 'preventivi', filtro: { stato: 'BOZZA' } } });
    }
  }

  /** Le esportazioni per Excel, come le fa il server: CSV con ";" e la virgola nei numeri. */
  function esporta(dati, b) {
    const a = dati.ana;
    const soldi = R.puo(dati.permessiIo, 'costi');
    let intest;
    let righe;
    if (b.cosa === 'rapportini') {
      intest = ['Numero', 'Data', 'Cliente', 'Commessa', 'Lavoro', 'Ore', 'Km', 'Spese'].concat(soldi ? ['Totale'] : []).concat(['Stato']);
      righe = dati.rapportini.filter(r => r.stato !== 'ANNULLATO').map(r => [r.id, C.data(r.data), r.cliente, r.idCommessa, r.descrizione, C.num(r.oreTotali), C.num(r.km), C.num(r.spese)]
        .concat(soldi ? [C.num(r.totale)] : []).concat([r.stato]));
    } else if (b.cosa === 'commesse') {
      intest = ['Codice', 'Commessa', 'Cliente', 'Stato', 'Ore previste'].concat(soldi ? ['Importo del contratto'] : []);
      righe = a.commesse.filter(m => !m.modello).map(m => [m.id, m.descrizione, (a.soggetti.find(s => s.id === m.idCliente) || {}).nome, m.stato, m.budgetOre || ''].concat(soldi ? [m.importoContratto || ''] : []));
    } else if (b.cosa === 'preventivi') {
      intest = ['Numero', 'Revisione', 'Data', 'Cliente', 'Oggetto', 'Stato', 'Scadenza'].concat(soldi ? ['Imponibile', 'Totale'] : []);
      righe = dati.preventivi.filter(p => !p.modello).map(p => { const r = prevRiassunto(dati, p); return [r.numero, r.revisione, C.data(r.data), r.cliente, r.oggetto, r.scaduto ? 'SCADUTO' : r.stato, C.data(r.scadenza)]
        .concat(soldi ? [r.imponibile, r.totale] : []); });
    } else if (b.cosa === 'attivita') {
      intest = ['Titolo', 'Tipo', 'Giorno', 'Inizio', 'Fine', 'Chi', 'Commessa', 'Priorità', 'Stato'];
      righe = attivitaVisibili(dati).map(x => [x.titolo, x.tipo, C.data(RA.giornoDi(x)), RA.ora(x.inizio), RA.ora(x.fine), (a.utenti.find(u => u.id === x.assegnataA) || {}).nome || '', x.idCommessa, x.priorita, x.stato]);
    } else if (b.cosa === 'ore') {
      const r = fase3(dati, 'ore', b);
      intest = ['Data', 'Persona', 'Inizio', 'Fine', 'Pausa (minuti)', 'Ore', 'Codice commessa', 'Commessa', 'Descrizione', 'Fatturabile', 'Tipo'].concat(soldi ? ['Costo orario', 'Costo'] : []).concat(['Stato']);
      righe = r.ore.map(o => [C.data(o.data), o.utente, o.inizio, o.fine, o.pausaMinuti, o.ore, o.idCommessa, o.commessa || 'Attività dello studio', o.descrizione, o.fatturabile ? 'Sì' : 'No',
        o.tipo === 'straordinaria' ? 'Straordinaria' : 'Ordinaria'].concat(soldi ? [o.costoOrario, o.costo] : []).concat([RO.STATI[o.stato].parola]));
    } else if (b.cosa === 'spese') {
      const r = fase3(dati, 'spese', b);
      intest = ['Data', 'Persona', 'Categoria', 'Descrizione', 'Importo', 'A chi va', 'Anticipazione', 'Pagata da chi l\'ha scritta', 'Codice commessa', 'Scontrino', 'Stato'];
      righe = r.spese.map(s => [C.data(s.data), s.utente, RO.categoria(s.categoria).nome, s.descrizione, s.importo, RO.destinazione(s.destinazione).parola, s.anticipazione ? 'Sì' : 'No', s.pagataDaMe ? 'Sì' : 'No',
        s.idCommessa, s.foto.length ? 'Sì' : 'No', RO.STATI[s.stato].parola]);
    } else if (b.cosa === 'trasferte') {
      const r = fase3(dati, 'trasferte', b);
      intest = ['Dal', 'Al', 'Persona', 'Destinazione', 'Motivo', 'Codice commessa', 'Veicolo', 'Km', 'Andata e ritorno', 'Km totali', 'Euro al km', 'Rimborso km', 'Indennità', 'Totale', 'Stato'];
      righe = r.trasferte.map(t => [C.data(t.dal), C.data(t.al), t.utente, t.destinazione, t.motivo, t.idCommessa, t.veicolo, t.km, t.andataRitorno ? 'Sì' : 'No', t.kmTotali, t.euroKm, t.rimborsoKm, t.indennita, t.totale, RO.STATI[t.stato].parola]);
    } else if (b.cosa === 'rimborsi') {
      const r = fase3(dati, 'rimborsi', b);
      intest = ['Persona', 'Tipo', 'Data', 'Descrizione', 'Codice commessa', 'Km', 'Importo'];
      righe = r.persone.reduce((l, p) => l.concat(p.voci.map(v => [p.nome, v.tipo === 'trasferta' ? 'Trasferta' : 'Spesa', C.data(v.data), v.descrizione, v.idCommessa, v.km || '', v.importo])), []);
    } else if (b.cosa === 'registro') {
      intest = ['Quando', 'Chi', 'Azione', 'Su cosa', 'Prima', 'Dopo'];
      righe = dati.registro.map(v => [v.quando.replace('T', ' ').slice(0, 16), v.utente.nome, v.azione, v.nome, JSON.stringify(v.prima || ''), JSON.stringify(v.dopo || '')]);
    } else {
      intest = ['Codice', 'Nome', 'Cliente', 'Fornitore', 'Partita IVA', 'Codice fiscale', 'Codice SDI', 'PEC', 'Email', 'Telefono', 'Indirizzo', 'CAP', 'Città', 'Provincia'];
      righe = a.soggetti.map(s => [s.id, s.nome, s.cliente ? 'sì' : 'no', s.fornitore ? 'sì' : 'no', s.partitaIva, s.codiceFiscale, s.codiceSdi, s.pec, s.email, s.telefono, s.indirizzo, s.cap, s.citta, s.provincia]);
    }
    return { ok: true, nome: R.nomeEsportazione(b.cosa, dati.oggi), csv: R.csv(intest, righe) };
  }


  // ======================================================================= fase 4: fatture, banche e scadenze

  /*
   * I dati di esempio della fase 4 per la visita guidata (e per finto-ponte --esempio): le
   * fatture dei dati di prova del server (W-11 ... W-15, con le date spostate a oggi), un conto,
   * due fatture ricevute, tre impegni. Da fatturare nasce dai rapportini firmati e inviati di
   * questi dati; i conti li fa contiFattura di regole-fatture.js (gli stessi casi del server).
   * Nella visita non si scrive niente di vero: quello che qui non serve risponde con una frase.
   */
  /** Le azioni della fase 4: vogliono il loro modulo e anche il permesso dei soldi (§15.1). */
  const AZIONI_FATTURE = ['daFatturare', 'fatture', 'fattura', 'preparaFattura', 'nuovaFattura', 'salvaFattura', 'pacchetto', 'passaAlProgramma', 'tornaInBozza', 'scartaFattura', 'segnaEmessa',
    'inviaAvviso', 'leggiXml', 'confermaXml', 'preparaNotaCredito', 'segnaFatturataFuori', 'ricevute', 'ricevuta', 'salvaRicevuta', 'annullaRicevuta', 'scadenzePagamento', 'fatturazioneCommessa', 'riepilogoFatturato'];
  const AZIONI_BANCHE = ['conti', 'salvaConto', 'aggiornaSaldo', 'movimenti', 'salvaMovimento', 'segnaIncasso', 'segnaPagamento', 'verificaMovimenti', 'annullaMovimento', 'scadenziario', 'situazione',
    'impegni', 'salvaImpegno', 'confermaImpegno', 'togliImpegno'];
  const FASE4 = new Set(AZIONI_FATTURE.concat(AZIONI_BANCHE, ['confermaRegoleFiscali']));
  const SCRIVONO4 = new Set(['preparaFattura', 'nuovaFattura', 'salvaFattura', 'passaAlProgramma', 'tornaInBozza', 'scartaFattura', 'segnaEmessa', 'inviaAvviso', 'leggiXml', 'confermaXml', 'preparaNotaCredito',
    'segnaFatturataFuori', 'salvaRicevuta', 'annullaRicevuta', 'salvaConto', 'aggiornaSaldo', 'salvaMovimento', 'segnaIncasso', 'segnaPagamento', 'verificaMovimenti', 'annullaMovimento', 'salvaImpegno', 'confermaImpegno', 'togliImpegno']);
  function fase4Con(dati, azione, b) {
    if (azione === 'confermaRegoleFiscali') return dati.io.ruolo === 'titolare' ? fase4(dati, azione, b) : NONPERMESSO('segnare le regole confermate');
    const modulo = AZIONI_BANCHE.indexOf(azione) >= 0 ? 'banche' : 'fatturazione';
    if (!R.puo(dati.permessiIo, modulo, SCRIVONO4.has(azione) ? 2 : 1)) return NONPERMESSO(SCRIVONO4.has(azione) ? 'fare questa modifica' : 'vedere questa pagina');
    if (!R.puo(dati.permessiIo, 'costi')) return { ok: false, errore: modulo === 'banche' ? 'Per vedere banche e scadenze serve anche il permesso dei soldi: chiedi al titolare' : 'Per vedere le fatture serve anche il permesso dei soldi: chiedi al titolare', permesso: false };
    return fase4(dati, azione, b);
  }
  const NON_NELLA_VISITA = { ok: false, errore: 'Nei dati di esempio questo non si fa: provalo coi dati veri' };
  const PARAMETRI_BASE = { regime: 'ordinario', ivaPercentuale: 22, eppiPercentuale: 5, ritenutaPercentuale: 20, bolloSoglia: 77.47, bolloImporto: 2, bolloRivalsa: true };

  function rf() { return radice.WisperRegoleFatture || (typeof require === 'function' ? require('./regole-fatture.js') : null); }
  function doc() { return radice.WisperDocumenti || (typeof require === 'function' ? require('./documenti.js') : null); }

  function creaFase4(dati) {
    const oggi = dati.oggi;
    const g = n => RA.piuGiorni(oggi, n);
    const F = { fatture: [], ricevute: [], impegni: [], movimenti: [], prossima: 16, prossimoMov: 10 };
    const riga = (id, gruppo, tipo, descrizione, importo, idCommessa) => ({ id, ordine: 0, origine: 'bozza', gruppo, tipo, descrizione, quantita: 1, unita: '', prezzo: importo, importo,
      aliquotaIva: tipo === 'compenso' ? 22 : 0, natura: tipo === 'compenso' ? '' : 'N1', ritenuta: false, tributoCliente: false, idCommessa: idCommessa || '', importoSorgenti: gruppo ? importo : null });
    const fattura = (x) => Object.assign({ tipo: 'fattura', tipoDocumento: 'TD01', idFatturaCollegata: null, numeroDa: '', noteInterne: '', regime: 'ordinario', ivaPercentuale: 22,
      eppiPercentuale: 5, ritenutaPercentuale: 20, ritenuta: true, bolloRivalsa: true, idConto: 1, conto: 'Conto studio …3456', esitoSdi: '', prontaIl: '', emessaIl: '', avvisoInviatoIl: '',
      incassi: [], sorgenti: [], file: null, idCommessa: '' }, x);
    F.fatture.push(fattura({ id: 11, idCliente: 'C001', stato: 'emessa', numero: '38/2026', numeroDa: 'xml', data: g(-52), causale: 'Prestazioni di agosto',
      righe: [riga(31, '', 'compenso', 'Prestazioni professionali di agosto', 810)], scadenzaGiorni: 30, incassi: [{ idMovimento: 1, data: g(-23), importo: 875.61, conto: 'Conto studio …3456', verificato: true }] }));
    F.fatture.push(fattura({ id: 12, idCliente: 'C002', stato: 'emessa', numero: '39/2026', numeroDa: 'xml', data: g(-42), causale: 'Progetto del quadro, commessa 26ST002',
      righe: [riga(32, '', 'compenso', 'Progetto del quadro elettrico', 750, '26ST002')], scadenzaGiorni: 30, incassi: [{ idMovimento: 2, data: g(-10), importo: 500, conto: 'Conto studio …3456', verificato: false }] }));
    F.fatture.push(fattura({ id: 13, idCliente: 'C002', stato: 'emessa', numero: '45/2026', numeroDa: 'xml', data: g(-3), causale: 'Acconto 30% alla firma',
      righe: [riga(33, '', 'compenso', '30% alla firma: Quadro elettrico capannone', 1140, '26ST002')], scadenzaGiorni: 30 }));
    F.fatture.push(fattura({ id: 14, idCliente: 'C003', stato: 'pronta', numero: '', data: g(-7), prontaIl: g(-7) + 'T10:00:00', causale: 'Sopralluogo e rilievo', ritenuta: false,
      righe: [riga(34, '', 'compenso', 'Sopralluogo e rilievo', 250)], scadenzaGiorni: 30, incassi: [{ idMovimento: 3, data: g(-2), importo: 320.25, conto: 'Conto studio …3456', verificato: true }] }));
    F.ricevute.push({ id: 1, idFornitore: 'F001', fornitore: 'Comel Forniture Elettriche', tipoDocumento: 'TD01', numero: '1287', data: g(-6), descrizione: 'Materiale elettrico', categoria: 'materiale',
      idCommessa: '', imponibile: 398.36, iva: 87.64, contributo: 0, bollo: 0, totale: 486, ritenuta: 0, netto: 486, pagato: 0, daPagare: 486, stato: 'attiva', statoVisto: 'Da pagare', scaduta: false,
      scadenze: [{ id: 1, data: g(25), importo: 486, coperta: 0 }], scadenzaStimata: false, pagamenti: [], origine: 'xml', file: null, note: '' });
    F.ricevute.push({ id: 2, idFornitore: 'F002', fornitore: 'Verifiche Nord Snc', tipoDocumento: 'TD01', numero: '77', data: g(-24), descrizione: 'Verifica impianto di terra', categoria: 'consulenze',
      idCommessa: '', imponibile: 600, iva: 132, contributo: 0, bollo: 0, totale: 732, ritenuta: 0, netto: 732, pagato: 0, daPagare: 732, stato: 'attiva', statoVisto: 'Da pagare', scaduta: false,
      scadenze: [{ id: 2, data: g(6), importo: 732, coperta: 0 }], scadenzaStimata: false, pagamenti: [], origine: 'mano', file: null, note: '' });
    F.impegni.push({ id: 1, tipo: 'rata', verso: 'uscita', descrizione: 'Affitto ufficio', codice: '', scadenza: g(4), importo: 850, importoDaScrivere: false, ripete: 'ogni mese', idRicorrenza: 1,
      ricorrenza: { regola: 'mesi', ogni: 1 }, confermato: true, proposta: false, pagato: 0, daPagare: 850, stato: 'aperto', statoVisto: 'Da pagare', scaduto: false, note: '' });
    F.impegni.push({ id: 2, tipo: 'f24', verso: 'uscita', descrizione: 'IVA del 3° trimestre', codice: '6033', scadenza: g(25), importo: 2380, importoDaScrivere: false, ripete: '', idRicorrenza: null,
      ricorrenza: null, confermato: true, proposta: false, pagato: 0, daPagare: 2380, stato: 'aperto', statoVisto: 'Da pagare', scaduto: false, note: '' });
    F.impegni.push({ id: 3, tipo: 'f24', verso: 'uscita', descrizione: 'Ritenute sui compensi pagati a ottobre', codice: '1040', scadenza: g(25), importo: 100, importoDaScrivere: false, ripete: '',
      idRicorrenza: null, ricorrenza: null, origine: 'ritenute', confermato: false, proposta: true, pagato: 0, daPagare: 100, stato: 'aperto', statoVisto: 'Proposta', scaduto: false, note: '' });
    F.movimenti.push({ id: 1, idConto: 1, conto: 'Conto studio …3456', data: g(-23), verso: 'entrata', importo: 875.61, descrizione: 'Incasso Elettrodinamica, fattura 38/2026', idSoggetto: 'C001',
      soggetto: 'Elettrodinamica', categoria: 'incasso', verificato: true, livello: 'verificato', abbinamenti: [{ tipo: 'fattura', id: 11, etichetta: '38/2026', importo: 875.61 }], annullato: false });
    F.movimenti.push({ id: 2, idConto: 1, conto: 'Conto studio …3456', data: g(-10), verso: 'entrata', importo: 500, descrizione: 'Incasso Rossi Impianti Srl, fattura 39/2026 (in parte)', idSoggetto: 'C002',
      soggetto: 'Rossi Impianti Srl', categoria: 'incasso', verificato: false, livello: 'registrato', abbinamenti: [{ tipo: 'fattura', id: 12, etichetta: '39/2026', importo: 500 }], annullato: false });
    F.movimenti.push({ id: 3, idConto: 1, conto: 'Conto studio …3456', data: g(-2), verso: 'entrata', importo: 320.25, descrizione: 'Incasso Mario Bianchi, W-14', idSoggetto: 'C003',
      soggetto: 'Mario Bianchi', categoria: 'incasso', verificato: true, livello: 'verificato', abbinamenti: [{ tipo: 'fattura', id: 14, etichetta: 'W-14', importo: 320.25 }], annullato: false });
    F.movimenti.push({ id: 4, idConto: 1, conto: 'Conto studio …3456', data: g(-6), verso: 'uscita', importo: 1250, descrizione: 'F24 del 16', idSoggetto: '', soggetto: '',
      categoria: 'tributo', verificato: true, livello: 'verificato', abbinamenti: [], annullato: false });
    F.fatture.forEach(f => ricalcolaFattura(dati, f));
    return F;
  }

  /** I conti, gli incassi e la parola dello stato di una fattura di esempio (come il server, §15.4). */
  function ricalcolaFattura(dati, f) {
    const R4 = rf();
    const c = dati.ana.soggetti.find(s => s.id === f.idCliente) || {};
    f.cliente = c.nome || f.idCliente;
    f.riferimento = 'W-' + f.id;
    f.righe = (f.righe || []).filter(r => r.tipo !== 'bollo');
    f.righe.forEach((r, i) => { r.ordine = i + 1; r.importo = R4.importoRiga(r.importoFisso !== undefined && r.importoFisso !== null ? { importo: r.importoFisso } : r); r.ritenuta = r.tipo === 'compenso' && f.ritenuta; });
    f.conti = R4.contiFattura(Object.assign({}, PARAMETRI_BASE, { ritenuta: f.ritenuta, righe: f.righe }));
    if (f.conti.bolloAddebitato > 0) f.righe.push({ id: 900 + f.id, ordine: f.righe.length + 1, origine: 'bozza', gruppo: '', tipo: 'bollo', descrizione: 'Imposta di bollo', quantita: 1, unita: '', prezzo: 2, importo: 2, aliquotaIva: 0, natura: 'N1', importoSorgenti: null });
    const scad = f.scadenzaAMano && f.scadenzaScritta ? f.scadenzaScritta : RA.piuGiorni(f.data, f.scadenzaGiorni || 30);
    f.incassato = Math.round((f.incassi || []).reduce((a, x) => a + x.importo, 0) * 100) / 100;
    f.residuo = Math.max(0, Math.round((f.conti.netto - f.incassato) * 100) / 100);
    // Come il server (correzioni del 22/10): quello incassato in più del netto, da restituire o compensare.
    f.daRestituire = Math.max(0, Math.round((f.incassato - f.conti.netto) * 100) / 100);
    f.scadenze = [{ id: f.id, data: scad, importo: f.conti.netto, modalita: 'MP05', coperta: Math.min(f.incassato, f.conti.netto) }];
    f.pagamento = f.residuo <= 0.004 ? 'pagata' : f.incassato > 0 ? 'in_parte' : 'da_incassare';
    f.scaduta = f.stato === 'emessa' && f.residuo > 0.004 && scad < dati.oggi;
    f.giorniScaduta = f.scaduta ? Math.round((new Date(dati.oggi + 'T12:00:00') - new Date(scad + 'T12:00:00')) / 86400000) : 0;
    f.etichetta = f.stato === 'bozza' ? 'Bozza W-' + f.id : f.stato === 'pronta' ? 'Pronta W-' + f.id : f.stato === 'scartata' ? 'Scartata W-' + f.id : f.numero;
    f.statoVisto = f.stato === 'bozza' ? 'Bozza' : f.stato === 'scartata' ? 'Scartata' : f.stato === 'annullata' ? 'Annullata'
      : f.stato === 'pronta' ? (f.pagamento === 'pagata' ? 'Pronta · già pagata' : 'Pronta') : f.scaduta ? 'Scaduta' : f.pagamento === 'pagata' ? 'Pagata' : f.pagamento === 'in_parte' ? 'Pagata in parte' : 'Emessa';
    f.avvisi = f.stato === 'pronta' && f.pagamento === 'pagata' ? [{ tipo: 'emetti', testo: 'Va emessa entro ' + RA.piuGiorni(f.incassi[0].data, 12).split('-').reverse().join('/') + ': ha già pagato il ' + C.data(f.incassi[0].data).slice(0, 5) }] : [];
    f.modificabile = f.stato === 'bozza';
    f.regoleConfermate = !!dati.ana.impostazioni.REGOLE_FISCALI_CONFERMATE;
    f.mancano = [];
    f.scadenzaAMano = !!f.scadenzaAMano;
    return f;
  }

  /** Le voci da fatturare dei dati di esempio: i rapportini firmati e inviati non ancora in una bozza (§15.3, in piccolo). */
  function daFatturareEsempio(dati, F) {
    const riservati = new Set();
    F.fatture.filter(f => f.stato !== 'scartata').forEach(f => (f.sorgenti || []).filter(s => s.attiva).forEach(s => riservati.add(s.id)));
    const gruppi = new Map();
    dati.rapportini.filter(r => (r.stato === 'FIRMATO' || r.stato === 'INVIATO') && !riservati.has(r.id) && (!r.statoApprovazione || r.statoApprovazione === 'approvato')).forEach(r => {
      const c = dati.ana.soggetti.find(s => s.id === r.idCliente) || { nome: r.cliente };
      if (!gruppi.has(r.idCliente)) gruppi.set(r.idCliente, { idCliente: r.idCliente, cliente: c.nome, sostituto: !!c.partitaIva, mancano: [], totale: 0, voci: [] });
      const g0 = gruppi.get(r.idCliente);
      g0.voci.push({ tipo: 'rapportino', id: r.id, idCommessa: r.idCommessa || '', data: r.data, titolo: r.descrizione || 'Rapportino', dettaglio: [r.idCommessa, C.numero(r.oreTotali) + ' ore', C.numero(r.km) + ' km'].filter(Boolean).join(' · '),
        pronta: true, importo: C.num(r.totale), spese: [], totaleConSpese: C.num(r.totale), anticipazione: false, gruppo: 'rapportini:' + r.idCliente + ':' + r.data.slice(0, 7) });
      g0.totale = Math.round((g0.totale + C.num(r.totale)) * 100) / 100;
    });
    const lista = Array.from(gruppi.values()).sort((a, b) => b.totale - a.totale);
    lista.forEach(x => x.voci.sort((a, b) => a.data.localeCompare(b.data)));
    const raggruppa = {};
    lista.forEach(x => { const c = dati.ana.soggetti.find(s => s.id === x.idCliente) || {}; raggruppa[x.idCliente] = c.tariffaFissa ? 'mese' : 'rapportino'; });
    return {
      ok: true, oggi: dati.oggi, totale: Math.round(lista.reduce((a, x) => a + x.totale, 0) * 100) / 100, clienti: lista.length, gruppi: lista, piuAvanti: [],
      inBozza: F.fatture.filter(f => f.stato === 'bozza' || f.stato === 'pronta').map(f => ({ idFattura: f.id, riferimento: f.riferimento, idCliente: f.idCliente, cliente: f.cliente, stato: f.stato, voci: (f.sorgenti || []).length, totale: f.conti.totale })),
      riepiloghi: [], raggruppa,
      daFirmare: dati.rapportini.filter(r => r.stato === 'BOZZA').map(r => ({ id: r.id, idCliente: r.idCliente, cliente: r.cliente, idCommessa: r.idCommessa, data: r.data, descrizione: r.descrizione, ore: r.oreTotali })),
    };
  }

  function senzaDettagli(f) {
    const x = copia(f);
    ['righe', 'sorgenti', 'incassi', 'note', 'file', 'avvisi'].forEach(k => delete x[k]);
    return x;
  }

  function modelloEsempio(dati, f) {
    const imp = dati.ana.impostazioni;
    const c = dati.ana.soggetti.find(s => s.id === f.idCliente) || {};
    const righe = f.righe.map((r, i) => ({ numero: i + 1, descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita || '', prezzoUnitario: r.prezzo, prezzoTotale: r.importo,
      aliquotaIva: r.aliquotaIva, natura: r.natura, ritenuta: r.tipo === 'compenso' && f.ritenuta }));
    return {
      riferimento: f.riferimento, tipoDocumento: f.tipoDocumento, divisa: 'EUR', dataProposta: f.data, data: f.stato === 'emessa' ? f.data : '', numero: f.stato === 'emessa' ? f.numero : '',
      prestatore: { denominazione: imp.RAGIONE_SOCIALE, partitaIva: imp.PARTITA_IVA, codiceFiscale: imp.PARTITA_IVA, regimeFiscale: 'RF01', sede: { indirizzo: 'Via Roma 1', cap: '36063', comune: 'Marostica', provincia: 'VI', nazione: 'IT' }, pec: imp.PEC, email: imp.EMAIL },
      committente: { denominazione: c.partitaIva ? c.nome : '', nome: c.partitaIva ? '' : String(c.nome || '').split(' ').slice(0, -1).join(' '), cognome: c.partitaIva ? '' : String(c.nome || '').split(' ').slice(-1)[0],
        partitaIva: c.partitaIva || '', codiceFiscale: c.codiceFiscale || '', sede: { indirizzo: c.indirizzo || '', cap: c.cap || '', comune: c.citta || '', provincia: c.provincia || '', nazione: 'IT' }, codiceDestinatario: c.codiceSdi || '0000000', pec: c.pec || '' },
      righe,
      cassa: f.conti.contributo ? { tipo: 'TC17', aliquota: 5, imponibile: f.conti.compenso, importo: f.conti.contributo, aliquotaIva: 22, natura: '', ritenuta: false } : null,
      ritenuta: f.conti.ritenuta ? { tipo: 'RT01', aliquota: 20, importo: f.conti.ritenuta, causale: 'A' } : null,
      bollo: f.conti.bollo ? { virtuale: true, importo: f.conti.bollo } : null,
      riepilogo: [{ aliquotaIva: 22, natura: '', imponibile: f.conti.baseIva, imposta: f.conti.iva, esigibilita: 'I', riferimentoNormativo: '' }]
        .concat(f.conti.anticipazioni || f.conti.bolloAddebitato ? [{ aliquotaIva: 0, natura: 'N1', imponibile: Math.round((f.conti.anticipazioni + f.conti.bolloAddebitato) * 100) / 100, imposta: 0, esigibilita: '', riferimentoNormativo: 'Escluse ex art. 15 DPR 633/72' }] : []),
      totaleDocumento: f.conti.totale, nettoAPagare: f.conti.netto,
      pagamento: { condizioni: 'TP02', dettagli: [{ modalita: 'MP05', scadenza: f.scadenze[0].data, importo: f.conti.netto, iban: 'IT60X0542811101000000123456', istituto: 'Banca di esempio' }] },
      causale: [f.causale + '. Rif. Wisper ' + f.riferimento], fattureCollegate: [], regoleConfermate: !!imp.REGOLE_FISCALI_CONFERMATE,
    };
  }

  function scadenziarioEsempio(dati, F, giorniAvanti) {
    const oggi = dati.oggi;
    const a = RA.piuGiorni(oggi, giorniAvanti || 90);
    const saldoOggi = 8743.55;
    const soglia = C.num(dati.ana.impostazioni.SOGLIA_CASSA || 3000);
    const righe = [];
    F.fatture.filter(f => f.tipo === 'fattura' && (f.stato === 'emessa' || f.stato === 'pronta') && f.residuo > 0.004).forEach(f => righe.push({ tipo: 'fattura', id: f.id, data: f.scadenze[0].data, verso: 'entrata',
      titolo: (f.numero || f.riferimento) + ' · ' + f.cliente, dettaglio: f.stato === 'pronta' ? 'da emettere: è nel programma' : f.pagamento === 'in_parte' ? 'pagata in parte' : 'fattura emessa', importo: f.residuo,
      stato: f.stato === 'pronta' ? 'da_emettere' : f.pagamento === 'in_parte' ? 'in_parte' : 'previsto', proposta: false }));
    F.ricevute.filter(x => x.stato === 'attiva' && x.daPagare > 0.004).forEach(x => righe.push({ tipo: 'ricevuta', id: x.id, data: x.scadenze[0].data, verso: 'uscita', titolo: x.fornitore + ' · fattura ' + x.numero,
      dettaglio: x.categoria, importo: x.daPagare, stato: 'previsto', proposta: false }));
    F.impegni.filter(i => i.stato === 'aperto').forEach(i => righe.push({ tipo: 'impegno', id: i.id, data: i.scadenza, verso: 'uscita', titolo: i.descrizione, dettaglio: i.codice ? 'codice ' + i.codice : i.ripete,
      importo: i.daPagare, stato: i.proposta ? 'proposto' : 'previsto', proposta: i.proposta }));
    const scaduti = righe.filter(r => r.data < oggi).map(r => Object.assign(r, { stato: 'scaduto', contaNelSaldo: r.verso === 'uscita', dettaglio: 'scaduto da ' + Math.round((new Date(oggi + 'T12:00:00') - new Date(r.data + 'T12:00:00')) / 86400000) + ' giorni · ' + r.dettaglio }));
    let saldo = Math.round((saldoOggi - scaduti.filter(r => r.verso === 'uscita').reduce((x, r) => x + r.importo, 0)) * 100) / 100;
    const saldoPartenza = saldo;
    const perGiorno = new Map();
    righe.filter(r => r.data >= oggi && r.data <= a).sort((x, y) => x.data.localeCompare(y.data)).forEach(r => { if (!perGiorno.has(r.data)) perGiorno.set(r.data, []); perGiorno.get(r.data).push(Object.assign(r, { contaNelSaldo: true })); });
    let primo = saldoPartenza < soglia ? oggi : '';
    const NOMI_G = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const MESI_L = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const giorni = Array.from(perGiorno.entries()).map(([data, rr]) => {
      rr.forEach(r => { saldo = Math.round((saldo + (r.verso === 'entrata' ? r.importo : -r.importo)) * 100) / 100; });
      const d = new Date(data + 'T12:00:00');
      if (saldo < soglia && !primo) primo = data;
      return { data, titolo: NOMI_G[d.getDay()] + ' ' + d.getDate() + ' ' + MESI_L[d.getMonth()], saldo, sottoSoglia: saldo < soglia, righe: rr };
    });
    return { ok: true, oggi, da: oggi, a, saldoOggi, soglia, saldoPartenza, scaduti, giorni, senzaData: { entrate: 0, voci: 0 }, primoSottoSoglia: primo, nota: 'Gli incassi scaduti non entrano nel saldo previsto' };
  }

  function fase4(dati, azione, b) {
    const F = dati.f4 || (dati.f4 = creaFase4(dati));
    const trovaF = id => F.fatture.find(f => String(f.id) === String(id) || f.riferimento === String(id) || f.numero === String(id));
    const rifai = () => F.fatture.forEach(f => ricalcolaFattura(dati, f));
    switch (azione) {
      case 'daFatturare': return daFatturareEsempio(dati, F);
      case 'fatture': {
        let l = F.fatture.slice();
        if (b.stato === 'scartata') l = l.filter(f => f.stato === 'scartata'); else l = l.filter(f => f.stato !== 'scartata');
        if (b.idCliente) l = l.filter(f => f.idCliente === b.idCliente);
        if (b.pagamento === 'aperta') l = l.filter(f => f.stato === 'emessa' && f.residuo > 0.004);
        l.sort((x, y) => (Number(y.stato === 'bozza' || y.stato === 'pronta') - Number(x.stato === 'bozza' || x.stato === 'pronta')) || y.data.localeCompare(x.data));
        return { ok: true, oggi: dati.oggi, fatture: l.map(senzaDettagli) };
      }
      case 'fattura': {
        const f = trovaF(b.id);
        return f ? { ok: true, fattura: copia(Object.assign({}, f, { puoScrivere: R.puo(dati.permessiIo, 'fatturazione', 2) })) } : { ok: false, errore: 'Fattura ' + b.id + ' non trovata' };
      }
      case 'preparaFattura': {
        const voci = b.voci || [];
        if (!voci.length) return { ok: false, errore: 'Scegli almeno una cosa da fatturare' };
        const raps = voci.map(v => dati.rapportini.find(r => r.id === v.id)).filter(Boolean);
        if (raps.some(r => r.idCliente !== b.idCliente)) return { ok: false, errore: 'Una fattura è per un cliente solo' };
        const id = F.prossima++;
        const c = dati.ana.soggetti.find(s => s.id === b.idCliente) || {};
        const righe = [];
        const sorgenti = [];
        let n = 0;
        if (b.raggruppa === 'mese') {
          const mesi = {};
          raps.forEach(r => { (mesi[r.data.slice(0, 7)] = mesi[r.data.slice(0, 7)] || []).push(r); });
          Object.keys(mesi).sort().forEach(m => {
            const gr = 'rapportini:' + b.idCliente + ':' + m;
            const somma = Math.round(mesi[m].reduce((x, r) => x + C.num(r.totale), 0) * 100) / 100;
            righe.push(Object.assign(rigaEsempio(id * 10 + (++n), gr, 'compenso', 'Prestazioni professionali di ' + C.nomeMese(m).toLowerCase() + ' (' + mesi[m].length + (mesi[m].length === 1 ? ' rapportino)' : ' rapportini)'), somma)));
            mesi[m].forEach(r => sorgenti.push({ tipo: 'rapportino', id: r.id, gruppo: gr, descrizione: r.id + ' · ' + C.data(r.data).slice(0, 5), importo: C.num(r.totale), attiva: true }));
          });
        } else {
          raps.forEach(r => {
            const gr = 'rapportino:' + r.id;
            righe.push(rigaEsempio(id * 10 + (++n), gr, 'compenso', 'Rapportino ' + r.id + ' del ' + C.data(r.data) + ': ' + (r.descrizione || ''), C.num(r.totale)));
            sorgenti.push({ tipo: 'rapportino', id: r.id, gruppo: gr, descrizione: r.id + ' · ' + C.data(r.data).slice(0, 5), importo: C.num(r.totale), attiva: true });
          });
        }
        const f = ricalcolaFattura(dati, { id, tipo: 'fattura', tipoDocumento: 'TD01', idCliente: b.idCliente, stato: 'bozza', numero: '', data: dati.oggi, causale: b.raggruppa === 'mese' ? 'Prestazioni professionali' : 'Rapportini',
          righe, sorgenti, incassi: [], ritenuta: !!c.partitaIva, regime: 'ordinario', ivaPercentuale: 22, eppiPercentuale: 5, ritenutaPercentuale: 20, bolloRivalsa: true, idConto: 1, conto: 'Conto studio …3456',
          scadenzaGiorni: 30, idCommessa: '', idFatturaCollegata: null, noteInterne: '', prontaIl: '' });
        F.fatture.unshift(f);
        return { ok: true, fattura: copia(f) };
      }
      case 'salvaFattura': {
        const x = b.fattura || {};
        const f = trovaF(x.id);
        if (!f) return { ok: false, errore: 'Fattura non trovata' };
        if (f.stato !== 'bozza') return { ok: false, errore: 'La fattura ' + f.riferimento + ' è già stata passata al programma: per cambiarla falla tornare in bozza' };
        ['data', 'causale', 'noteInterne', 'ritenuta', 'tipoDocumento'].forEach(k => { if (x[k] !== undefined) f[k] = x[k]; });
        const liberate = [];
        if (Array.isArray(x.righe)) {
          const restano = new Set(x.righe.filter(r => r.gruppo).map(r => r.gruppo));
          (f.sorgenti || []).forEach(s => { if (s.attiva && !restano.has(s.gruppo)) { s.attiva = false; liberate.push({ tipo: s.tipo, id: s.id, descrizione: s.descrizione }); } });
          f.righe = x.righe.map((r, i) => Object.assign(rigaEsempio(r.id || (f.id * 100 + i + 50), r.gruppo || '', r.tipo, r.descrizione, C.num(r.prezzo)), { quantita: r.quantita, unita: r.unita || '', prezzo: C.num(r.prezzo) }));
        }
        if (x.scadenza) { f.scadenzaAMano = true; f.scadenzaScritta = x.scadenza; } else if (x.scadenza === null) f.scadenzaAMano = false;
        ricalcolaFattura(dati, f);
        return { ok: true, fattura: copia(f), liberate };
      }
      case 'pacchetto':
      case 'passaAlProgramma': {
        const f = trovaF(b.id);
        if (!f) return { ok: false, errore: 'Fattura non trovata' };
        if (azione === 'passaAlProgramma') {
          if (f.stato === 'bozza' && !dati.ana.impostazioni.REGOLE_FISCALI_CONFERMATE && !b.conferma) return { ok: false, errore: 'Le regole delle fatture non sono ancora confermate dal commercialista: passala lo stesso?', serveConferma: true };
          if (f.stato === 'bozza') { f.stato = 'pronta'; f.prontaIl = new Date().toISOString().slice(0, 19); ricalcolaFattura(dati, f); }
        }
        const modello = modelloEsempio(dati, f);
        const D = doc();
        const sezioni = D.sezioniProspetto(modello);
        const avviso = modello.regoleConfermate ? '' : 'Conti da verificare: regole non confermate dal commercialista';
        const testo = [avviso, 'Rif. ' + f.riferimento].concat(...sezioni.map(s => ['', s.titolo.toUpperCase()].concat(s.campi.map(c => c.etichetta + ': ' + c.valore)))).filter((x, i) => i > 0 || x).join('\n');
        const pacchetto = { ok: true, uscite: ['prospetto', 'xml'], modello, mancano: [], prospetto: { titolo: 'Prospetto per il programma delle fatture', avviso, sezioni, testo },
          xml: f.stato === 'emessa' ? undefined : { nome: 'Bozza ' + f.riferimento + ' ' + f.cliente + ' - non inviare.xml', mime: 'application/xml', base64: '' } };
        return azione === 'pacchetto' ? pacchetto : { ok: true, fattura: copia(f), pacchetto };
      }
      case 'tornaInBozza': { const f = trovaF(b.id); if (f && f.stato === 'pronta') { f.stato = 'bozza'; ricalcolaFattura(dati, f); } return { ok: true, fattura: copia(f) }; }
      case 'scartaFattura': {
        const f = trovaF(b.id);
        if (f && f.stato === 'pronta' && !b.conferma) return { ok: false, errore: 'La ' + f.riferimento + ' è già nel programma: scartala solo se lì non l\'hai emessa', serveConferma: true };
        if (f) { f.stato = 'scartata'; (f.sorgenti || []).forEach(s => { s.attiva = false; }); ricalcolaFattura(dati, f); }
        return { ok: true, fattura: copia(f) };
      }
      case 'riepilogoFatturato': {
        const anno = String(b.anno || dati.oggi.slice(0, 4));
        const emesse = F.fatture.filter(f => (f.stato === 'emessa' || f.stato === 'annullata') && f.data.slice(0, 4) === anno);
        const per = b.per || 'mese';
        const chiaveDi = f => per === 'mese' ? f.data.slice(0, 7) : per === 'cliente' ? f.idCliente : (f.idCommessa || '');
        const nomeDi = (k, f) => per === 'mese' ? C.nomeMese(k).toLowerCase() : per === 'cliente' ? f.cliente : k;
        const mappa = new Map();
        if (per === 'mese') for (let m = 1; m <= Number(dati.oggi.slice(5, 7)); m++) { const k = anno + '-' + String(m).padStart(2, '0'); mappa.set(k, { chiave: k, nome: C.nomeMese(k).toLowerCase(), fatture: 0, compenso: 0, contributo: 0, iva: 0, anticipazioni: 0, totale: 0, ritenute: 0, incassato: 0 }); }
        emesse.forEach(f => {
          const k = chiaveDi(f);
          if (!mappa.has(k)) mappa.set(k, { chiave: k, nome: nomeDi(k, f), fatture: 0, compenso: 0, contributo: 0, iva: 0, anticipazioni: 0, totale: 0, ritenute: 0, incassato: 0 });
          const x = mappa.get(k);
          x.fatture++;
          ['compenso', 'contributo', 'iva', 'anticipazioni', 'totale'].forEach(c => { x[c] = Math.round((x[c] + f.conti[c]) * 100) / 100; });
          x.ritenute = Math.round((x.ritenute + f.conti.ritenuta) * 100) / 100;
        });
        F.movimenti.filter(m => !m.annullato && m.data.slice(0, 4) === anno).forEach(m => (m.abbinamenti || []).filter(a => a.tipo === 'fattura').forEach(a => {
          const f = trovaF(a.id);
          if (!f || f.stato !== 'emessa') return;
          const k = per === 'mese' ? m.data.slice(0, 7) : chiaveDi(f);
          if (mappa.has(k)) mappa.get(k).incassato = Math.round((mappa.get(k).incassato + a.importo) * 100) / 100;
        }));
        const righe = Array.from(mappa.values());
        if (per !== 'mese') righe.sort((x, y) => y.compenso - x.compenso);
        const totali = righe.reduce((t, r) => { Object.keys(t).forEach(k => { t[k] = Math.round((t[k] + r[k]) * 100) / 100; }); return t; }, { fatture: 0, compenso: 0, contributo: 0, iva: 0, anticipazioni: 0, totale: 0, ritenute: 0, incassato: 0 });
        return { ok: true, anno: Number(anno), per, righe, totali, fatturato: totali.compenso, incassato: totali.incassato };
      }
      case 'ricevute': return { ok: true, ricevute: copia(F.ricevute.filter(x => b.stato === 'da_pagare' ? x.daPagare > 0.004 : true).filter(x => !b.idFornitore || x.idFornitore === b.idFornitore)) };
      case 'ricevuta': { const x = F.ricevute.find(r => String(r.id) === String(b.id)); return x ? { ok: true, ricevuta: copia(x) } : { ok: false, errore: 'Ricevuta non trovata' }; }
      case 'scadenzePagamento': return { ok: true, scadenze: [], commesse: [] };
      case 'fatturazioneCommessa': {
        const righe = F.fatture.filter(f => f.stato === 'emessa').reduce((l, f) => l.concat(f.righe.filter(r => r.idCommessa === b.id && r.tipo === 'compenso')), []);
        const bozze = F.fatture.filter(f => f.stato === 'bozza' || f.stato === 'pronta').reduce((l, f) => l.concat(f.righe.filter(r => r.idCommessa === b.id && r.tipo === 'compenso')), []);
        const somma = l => Math.round(l.reduce((x, r) => x + r.importo, 0) * 100) / 100;
        const m = dati.ana.commesse.find(x => x.id === b.id) || {};
        return { ok: true, idCommessa: b.id, modoFatturazione: m.modoFatturazione || 'ore', contratto: C.num(m.importoContratto), fatturato: somma(righe), incassato: 0, daFatturare: 0, inBozza: somma(bozze), previsto: 0, scadenze: [], fatture: [] };
      }
      case 'conti': return { ok: true, conti: [{ id: 1, nome: 'Conto studio', banca: 'Banca di esempio', ultimeCifre: '3456', predefinito: true, soglia: null, attivo: true, note: '', saldo: 8743.55, saldoAl: RA.piuGiorni(dati.oggi, -21),
        saldoScritto: 9850, movimentiDopo: F.movimenti.length, verificatiDopo: F.movimenti.filter(m => m.verificato).length, collegamento: 'non_collegato', iban: R.puo(dati.permessiIo, 'banche', 2) ? 'IT60X0542811101000000123456' : undefined }], collegamento: 'non_collegato' };
      case 'movimenti': {
        const t = C.normalizza(b.testo || '');
        const l = F.movimenti.filter(m => (!b.verso || m.verso === b.verso) && (b.verificato === undefined || b.verificato === '' || String(m.verificato ? 1 : 0) === String(b.verificato))
          && (!t || C.normalizza(m.descrizione + ' ' + m.soggetto + ' ' + m.importo).indexOf(t) >= 0)).sort((x, y) => y.data.localeCompare(x.data));
        const somma = v => Math.round(l.filter(m => m.verso === v && !m.annullato).reduce((x, m) => x + m.importo, 0) * 100) / 100;
        return { ok: true, pagina: 1, pagine: 1, quante: l.length, entrate: somma('entrata'), uscite: somma('uscita'), daVerificare: l.filter(m => !m.verificato).length, importaEstrattoConto: 'non_collegato', movimenti: copia(l) };
      }
      case 'scadenziario': return scadenziarioEsempio(dati, F, b.a ? Math.round((new Date(b.a + 'T12:00:00') - new Date(dati.oggi + 'T12:00:00')) / 86400000) : 90);
      case 'situazione': {
        const s = scadenziarioEsempio(dati, F, 91);
        const saldoA = n => { let v = s.saldoPartenza; s.giorni.forEach(gg => { if (gg.data <= RA.piuGiorni(dati.oggi, n)) v = gg.saldo; }); return v; };
        const daInc = F.fatture.filter(f => f.stato === 'emessa').reduce((x, f) => x + f.residuo, 0);
        const settimane = [];
        const lun = RO.settimanaDi(dati.oggi)[0];
        for (let i = 0; i < 13; i++) {
          const da = RA.piuGiorni(lun, i * 7);
          const a = RA.piuGiorni(da, 6);
          const dentro = s.giorni.filter(gg => gg.data >= da && gg.data <= a).reduce((l, gg) => l.concat(gg.righe), []);
          const saldo = saldoA(Math.round((new Date(a + 'T12:00:00') - new Date(dati.oggi + 'T12:00:00')) / 86400000));
          settimane.push({ da, a, entrate: dentro.filter(r => r.verso === 'entrata').reduce((x, r) => x + r.importo, 0), uscite: dentro.filter(r => r.verso === 'uscita').reduce((x, r) => x + r.importo, 0), saldo, sottoSoglia: saldo < s.soglia });
        }
        const rie = fase4(dati, 'riepilogoFatturato', { anno: dati.oggi.slice(0, 4), per: 'mese' });
        return { ok: true, oggi: dati.oggi, saldi: [{ idConto: 1, nome: 'Conto studio …3456', saldo: s.saldoOggi }], saldoOggi: s.saldoOggi, soglia: s.soglia, daIncassare: Math.round(daInc * 100) / 100,
          scadutoDaIncassare: Math.round(F.fatture.filter(f => f.scaduta).reduce((x, f) => x + f.residuo, 0) * 100) / 100,
          daPagare30: Math.round(s.giorni.filter(gg => gg.data <= RA.piuGiorni(dati.oggi, 30)).reduce((l, gg) => l.concat(gg.righe), []).filter(r => r.verso === 'uscita').reduce((x, r) => x + r.importo, 0) * 100) / 100,
          scadutoDaPagare: 0, previsto: { 30: saldoA(30), 60: saldoA(60), 90: saldoA(90) }, primoSottoSoglia: s.primoSottoSoglia, settimane, fatturatoAnno: rie.fatturato, incassatoAnno: rie.incassato, collegamento: 'non_collegato' };
      }
      case 'impegni': return { ok: true, impegni: copia(F.impegni.filter(i => b.stato === 'tutti' || i.stato === 'aperto')) };
      case 'segnaIncasso': {
        const f = trovaF(b.idFattura);
        if (!f) return { ok: false, errore: 'Fattura non trovata' };
        const importo = b.importo || f.residuo;
        if (importo > f.residuo + 0.004) return { ok: false, errore: 'La fattura ' + (f.numero || f.riferimento) + ' ha ancora da incassare ' + C.euro(f.residuo).replace(' €', '') + ': non puoi abbinarne ' + C.euro(importo).replace(' €', '') };
        const m = { id: F.prossimoMov++, idConto: 1, conto: 'Conto studio …3456', data: b.data || dati.oggi, verso: 'entrata', importo, descrizione: 'Incasso ' + f.cliente + ', fattura ' + (f.numero || f.riferimento), idSoggetto: f.idCliente,
          soggetto: f.cliente, categoria: 'incasso', verificato: !!b.verificato, livello: b.verificato ? 'verificato' : 'registrato', abbinamenti: [{ tipo: 'fattura', id: f.id, etichetta: f.numero || f.riferimento, importo }], annullato: false };
        F.movimenti.unshift(m);
        f.incassi.push({ idMovimento: m.id, data: m.data, importo, conto: m.conto, verificato: m.verificato });
        ricalcolaFattura(dati, f);
        return { ok: true, movimento: copia(m), fattura: copia(f) };
      }
      case 'annullaMovimento': {
        const m = F.movimenti.find(x => String(x.id) === String(b.id));
        if (m) { m.annullato = true; F.fatture.forEach(f => { f.incassi = (f.incassi || []).filter(i => i.idMovimento !== m.id); }); rifai(); }
        return { ok: true, movimento: copia(m) };
      }
      case 'confermaRegoleFiscali': {
        dati.ana.impostazioni.REGOLE_FISCALI_CONFERMATE = b.data ? { data: b.data, commercialista: b.commercialista, da: dati.io.id } : null;
        rifai();
        return { ok: true, regoleConfermate: dati.ana.impostazioni.REGOLE_FISCALI_CONFERMATE, impostazioni: copia(dati.ana.impostazioni) };
      }
      default:
        return NON_NELLA_VISITA;
    }
  }

  function rigaEsempio(id, gruppo, tipo, descrizione, importo) {
    return { id, ordine: 0, origine: 'bozza', gruppo, tipo, descrizione, quantita: 1, unita: '', prezzo: importo, importo, aliquotaIva: tipo === 'compenso' ? 22 : 0,
      natura: tipo === 'compenso' ? '' : 'N1', ritenuta: false, tributoCliente: false, idCommessa: '', importoSorgenti: gruppo ? importo : null };
  }

  /** I numeri dei soldi della fase 4 sulla Dashboard di esempio (§15.16, in piccolo). */
  function dashboardFase4(dati, numeri) {
    if (!R.puo(dati.permessiIo, 'costi') || !(R.puo(dati.permessiIo, 'fatturazione') || R.puo(dati.permessiIo, 'banche'))) return;
    const F = dati.f4 || (dati.f4 = creaFase4(dati));
    const df = daFatturareEsempio(dati, F);
    const emesse = F.fatture.filter(f => f.tipo === 'fattura' && f.stato === 'emessa');
    numeri.soldi = Object.assign(numeri.soldi || {}, {
      daFatturare: df.totale, clientiDaFatturare: df.clienti, daIncassare: Math.round(emesse.reduce((x, f) => x + f.residuo, 0) * 100) / 100,
      scaduto: Math.round(emesse.filter(f => f.scaduta).reduce((x, f) => x + f.residuo, 0) * 100) / 100, saldoConti: 8743.55,
      fattureInBozza: Math.round(F.fatture.filter(f => f.stato === 'bozza' || f.stato === 'pronta').reduce((x, f) => x + f.conti.totale, 0) * 100) / 100,
    });
  }

  const Esempio = { crea, gestisci, dashboard, permessiDi, togliCosti };
  if (typeof module !== 'undefined' && module.exports) module.exports = Esempio;
  else radice.WisperEsempio = Esempio;
})(typeof window !== 'undefined' ? window : globalThis);
