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
const { adesso } = require('./utili');

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
  return utenti;
}

module.exports = { semina, UTENTI_DI_PROVA, partitaIvaDiProva };
