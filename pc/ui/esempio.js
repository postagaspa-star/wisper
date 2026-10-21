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
    const tutti = ['dashboard', 'clienti', 'commesse', 'rapportini', 'fatturazione', 'documenti', 'amministrazione', 'costi', 'riservati'];
    tutti.forEach(m => { p[m] = 0; });
    if (ruolo === 'titolare') tutti.forEach(m => { p[m] = 2; });
    if (ruolo === 'amministrazione') Object.assign(p, { dashboard: 2, clienti: 2, commesse: 2, rapportini: 2, fatturazione: 2, documenti: 2, amministrazione: 1, costi: 2 });
    if (ruolo === 'collaboratore') Object.assign(p, { dashboard: 1, clienti: 1, commesse: 1, rapportini: 2, documenti: 1 });
    if (ruolo === 'lettura') Object.assign(p, { dashboard: 1, clienti: 1, commesse: 1, rapportini: 1, fatturazione: 1, documenti: 1, costi: 1 });
    return p;
  }

  // I campi dei soldi: senza il permesso "costi" il server li toglie (architettura §3).
  const CAMPI_COSTI = new Set(['tariffa', 'tariffaFissa', 'costoFisso', 'ultimaTariffa', 'maggExtra', 'euroKm', 'compensoOre',
    'rimborsoKm', 'totale', 'costoOrario', 'prezzoOrario', 'budgetEuro', 'importoContratto', 'valore', 'soldi', 'quanto',
    'EURO_KM', 'COSTO_ORARIO']);
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

    numerazioni[1].ultimo = rapportini.filter(x => x.data.slice(0, 4) === String(anno)).length;

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

    // Chi entra: l'utente vero della visita, oppure uno degli utenti di prova.
    const scelto = { manuel: 1, laura: 2, marco: 3, lettura: 4 }[o.chi || 'manuel'] || 1;
    const io = o.utente ? Object.assign({}, o.utente) : copia(utenti.find(u => u.id === scelto));
    if (!o.utente && io.ruolo === 'lettura') io.attivo = true;
    const permessiIo = o.permessi ? Object.assign({}, o.permessi) : permessiDi(io.ruolo);
    return { oggi, ana, rapportini, registro, copie, cestino, sessioni, permessi, io, permessiIo, contatori: { s: 10, r: 10, p: 20, f: 10, u: 4, reg: nr, sess: 10 } };
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
    const conta = R.contaCommesse(commesse, oggi);
    return { ok: true, per: mio ? 'collaboratore' : 'titolare', oggi, urgenti, settimana, pianificare,
      numeri: { commesse: { aperte: conta.aperte, sospese: conta.sospese, chiuse: conta.chiuse, inRitardo: conta.inRitardo }, giorniSenzaRapportino: senzaRapportino } };
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
    return R.puo(dati.permessiIo, 'costi') ? risposta : togliCosti(risposta);
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
          interfaccia: { ticketAttivo: false, tecnico: dati.io.ruolo === 'collaboratore' ? dati.io.nome : a.impostazioni.TECNICO, soloSuoi: dati.io.ruolo === 'collaboratore', versioneServer: 'esempio' } };
      case 'anagrafiche':
        return anagrafiche(dati, b.archiviati === '1' || b.archiviati === true || b.archiviati === 'true');
      case 'rapportini':
        return { ok: true, rapportini: dati.rapportini.filter(r => r.stato !== 'ANNULLATO' && (!mio || r.idUtente === dati.io.id)) };
      case 'dashboard':
        return dashboard(dati);
      case 'documenti':
        return { ok: true, cartella: '', documenti: [] };
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
      case 'caricaFile':
        return { ok: true, file: { id: 'esempio' + Date.now(), url: '' } };
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
        return { ok: true };
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
    } else if (b.cosa === 'registro') {
      intest = ['Quando', 'Chi', 'Azione', 'Su cosa', 'Prima', 'Dopo'];
      righe = dati.registro.map(v => [v.quando.replace('T', ' ').slice(0, 16), v.utente.nome, v.azione, v.nome, JSON.stringify(v.prima || ''), JSON.stringify(v.dopo || '')]);
    } else {
      intest = ['Codice', 'Nome', 'Cliente', 'Fornitore', 'Partita IVA', 'Codice fiscale', 'Codice SDI', 'PEC', 'Email', 'Telefono', 'Indirizzo', 'CAP', 'Città', 'Provincia'];
      righe = a.soggetti.map(s => [s.id, s.nome, s.cliente ? 'sì' : 'no', s.fornitore ? 'sì' : 'no', s.partitaIva, s.codiceFiscale, s.codiceSdi, s.pec, s.email, s.telefono, s.indirizzo, s.cap, s.citta, s.provincia]);
    }
    return { ok: true, nome: R.nomeEsportazione(b.cosa, dati.oggi), csv: R.csv(intest, righe) };
  }

  const Esempio = { crea, gestisci, dashboard, permessiDi, togliCosti };
  if (typeof module !== 'undefined' && module.exports) module.exports = Esempio;
  else radice.WisperEsempio = Esempio;
})(typeof window !== 'undefined' ? window : globalThis);
