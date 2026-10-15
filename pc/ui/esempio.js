/*
 * Wisper Ufficio: i dati di esempio della visita guidata (docs/aspetto.md §9).
 *
 * Durante la visita l'interfaccia è la stessa, ma le chiamate al foglio le
 * risponde questo file, in memoria: niente letture, niente scritture, niente
 * email. Alla fine si torna ai dati veri.
 */
(function (radice) {
  'use strict';

  const C = radice.WisperConti;

  function giornoDelMese(oggi, indietro) {
    // Sempre dentro il mese di oggi: la visita mostra "Fine mese" del mese in corso.
    const d = new Date(oggi + 'T12:00:00');
    const g = Math.max(1, d.getDate() - indietro);
    return oggi.slice(0, 8) + String(g).padStart(2, '0');
  }

  function crea() {
    const oggi = C.oggiIso();
    const impostazioni = {
      RAGIONE_SOCIALE: 'Studio Tecnico GM', TECNICO: 'Manuel Gasparotto', INDIRIZZO: 'Via Roma 1, Marostica (VI)',
      PARTITA_IVA: '01234567890', EMAIL: 'studio@esempio.it', TELEFONO: '', PEC: '',
      EURO_KM: 0.76, AUTO: 'Volvo XC40', COSTO_ORARIO: 18, PREFISSO_COMMESSA: 'P', TICKET_ATTIVO: 'NO',
    };
    const gruppi = [
      { nome: 'Elettrodinamica', tariffaFissa: 30, pagaViaggio: false, kmRimborsati: true, maggExtra: 0, email: 'rapportini@elettrodinamica.example', note: '' },
      { nome: 'Privato', tariffaFissa: null, pagaViaggio: false, kmRimborsati: true, maggExtra: 0, email: '', note: '' },
    ];
    const clienti = [
      { id: 'C001', nome: 'Batokyo', alias: [], gruppo: 'Elettrodinamica', email: '', telefono: '', indirizzo: '', partitaIva: '', ultimaTariffa: null, pagaViaggio: null, kmRimborsati: null, note: '' },
      { id: 'C002', nome: 'Rossi Impianti Srl', alias: ['Rossi'], gruppo: 'Privato', email: 'ufficio@rossi.example', telefono: '', indirizzo: 'Via Verdi 4, Bassano', partitaIva: '', ultimaTariffa: 42, pagaViaggio: null, kmRimborsati: null, note: '' },
      { id: 'C003', nome: 'Bianchi Automazioni', alias: [], gruppo: 'Privato', email: '', telefono: '', indirizzo: '', partitaIva: '', ultimaTariffa: 38, pagaViaggio: null, kmRimborsati: null, note: '' },
    ];
    const commesse = [
      { id: 'P2601', idCliente: 'C001', descrizione: 'Nuovo magazzino automatico', stato: 'APERTA', indirizzo: 'Zona industriale, Thiene', budgetOre: 30, budgetEuro: 1200, inizio: oggi.slice(0, 8) + '01', finePrevista: '', cartella: '', note: '' },
      { id: 'P2602', idCliente: 'C002', descrizione: 'Quadro elettrico capannone', stato: 'APERTA', indirizzo: '', budgetOre: null, budgetEuro: null, inizio: '', finePrevista: '', cartella: '', note: '' },
      { id: 'P2603', idCliente: 'C003', descrizione: 'Revisione linea di confezionamento', stato: 'APERTA', indirizzo: '', budgetOre: 40, budgetEuro: null, inizio: '', finePrevista: '', cartella: '', note: '' },
    ];
    const ana = { clienti, commesse, gruppi, impostazioni };

    let n = 0;
    const r = (indietro, idCliente, idCommessa, descrizione, oreLavoro, oreViaggio, km, spese, stato, extra) => {
      n += 1;
      const c = clienti.find(x => x.id === idCliente);
      const m = commesse.find(x => x.id === idCommessa);
      const regole = C.regoleDi(c, gruppi, impostazioni);
      const base = Object.assign({
        id: 'RAP/' + oggi.slice(0, 4) + '/' + String(n).padStart(4, '0'), idLocale: 'esempio-' + n,
        data: giornoDelMese(oggi, indietro), tecnico: impostazioni.TECNICO, idCliente, cliente: c.nome,
        gruppo: c.gruppo, idCommessa, commessa: m ? m.descrizione : '', ticket: '', luogo: '', descrizione,
        oreLavoro, oreExtra: 0, oreViaggio, km, spese, noteSpese: spese ? 'Pranzo' : '', foto: [],
        tariffa: regole.tariffaFissa !== null ? regole.tariffaFissa : c.ultimaTariffa,
        pagaViaggio: regole.pagaViaggio, kmRimborsati: regole.kmRimborsati, euroKm: regole.euroKm,
        maggExtra: regole.maggExtra, costoOrario: impostazioni.COSTO_ORARIO, noteInterne: '', firma: null,
        firmatario: '', firmatoIl: '', stato, inviatoIl: '', fatturatoIl: '', creato: '', modificato: '',
      }, extra || {});
      return Object.assign(base, C.calcola(base, regole));
    };
    const rapportini = [
      r(13, 'C001', 'P2601', 'Cablaggio del quadro di linea 1.', 8, 1, 96, 14.5, 'INVIATO', { inviatoIl: oggi + 'T09:00:00' }),
      r(9, 'C001', 'P2601', 'Collaudo sensori e messa in servizio del nastro.', 7.5, 1.5, 96, 0, 'INVIATO', { inviatoIl: oggi + 'T09:00:00' }),
      r(6, 'C003', 'P2603', 'Verifica dei finecorsa e prova a vuoto.', 6, 1, 64, 0, 'FATTURATO', { fatturatoIl: oggi + 'T09:00:00' }),
      r(5, 'C002', 'P2602', 'Sostituzione interruttore generale.', 3.5, 0.5, 22, 0, 'BOZZA'),
      r(1, 'C001', 'P2601', 'Taratura inverter del nastro 2 e prova a vuoto con il capo reparto.', 6.5, 1, 96, 12.5, 'FIRMATO',
        { firmatario: 'Mario Bianchi', firmatoIl: oggi + 'T17:02:00' }),
      r(0, 'C002', 'P2602', 'Verifica impianto di terra.', 2.5, 1, 30, 0, 'BOZZA'),
    ];
    return { ana, rapportini };
  }

  /**
   * Risponde a una chiamata /foglio/* come farebbe lo script, sui dati della
   * visita. Quello che non serve alla visita risponde "fatto" senza cambiare niente.
   */
  function gestisci(dati, metodo, percorso, corpo) {
    const azione = percorso.replace(/^\/foglio\//, '').split('?')[0];
    const adesso = new Date().toISOString().slice(0, 19);
    if (metodo === 'GET') {
      if (azione === 'anagrafiche') return Object.assign({ ok: true }, dati.ana);
      if (azione === 'rapportini') return { ok: true, rapportini: dati.rapportini };
      if (azione === 'documenti') return { ok: true, cartella: '', documenti: [] };
      return { ok: true };
    }
    const segna = (ids, stato) => dati.rapportini.filter(r => ids.indexOf(r.id) >= 0 || ids.indexOf(r.idLocale) >= 0).map(r => {
      r.stato = stato;
      if (stato === 'INVIATO') r.inviatoIl = adesso;
      if (stato === 'FATTURATO') r.fatturatoIl = adesso;
      if (stato === 'BOZZA') { r.firma = null; r.firmatario = ''; r.firmatoIl = ''; }
      return r;
    });
    if (azione === 'stato') return { ok: true, rapportini: segna(corpo.ids || [], corpo.stato) };
    if (azione === 'inviaEmail') {
      if (corpo.aMe) return { ok: true, rapportini: [] };
      const ids = (corpo.ids || []).filter(id => { const x = dati.rapportini.find(r => r.id === id); return x && x.stato !== 'FATTURATO'; });
      return { ok: true, rapportini: segna(ids, 'INVIATO') };
    }
    if (azione === 'salvaRapportino') {
      const nuovo = Object.assign({}, corpo.rapportino);
      const i = dati.rapportini.findIndex(r => r.idLocale === nuovo.idLocale);
      const c = dati.ana.clienti.find(x => x.id === nuovo.idCliente) || { gruppo: nuovo.gruppo || 'Privato' };
      Object.assign(nuovo, C.calcola(nuovo, C.regoleDi(c, dati.ana.gruppi, dati.ana.impostazioni)));
      if (i >= 0) { Object.assign(dati.rapportini[i], nuovo); return { ok: true, rapportino: dati.rapportini[i] }; }
      nuovo.id = 'RAP/' + nuovo.data.slice(0, 4) + '/' + String(dati.rapportini.length + 1).padStart(4, '0');
      nuovo.stato = 'BOZZA'; nuovo.foto = []; nuovo.firma = null;
      dati.rapportini.unshift(nuovo);
      return { ok: true, rapportino: nuovo };
    }
    return { ok: true };
  }

  radice.WisperEsempio = { crea, gestisci };
})(window);
