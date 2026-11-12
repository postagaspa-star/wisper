/*
 * Wisper Ufficio: le regole della casa e del menu del design Fai (docs/gestionale/fai.md §5-§6).
 * Niente disegno qui: cosa va sulla scheda gialla, quali azioni si vedono, quali righe in Da sistemare, cosa c'è In agenda,
 * le voci del menu. Casi condivisi col telefono: pc/prove/casi-casa.json (rapportino/Casa.kt).
 */
(function (radice, fabbrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.WisperRegoleCasa = fabbrica();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Le voci del menu: il nome corto, il colore (fondo, tratto) e l'icona del prototipo. I nomi lunghi restano nei Permessi. */
  const VOCI_FAI = {
    dashboard: { breve: 'Casa', f: '#16171B', t: '#FFC53D', d: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z' },
    clienti: { breve: 'Clienti', f: '#DDF5E8', t: '#067647', d: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a4 4 0 0 0-3-3.9M15.5 4.1a3 3 0 0 1 0 5.8' },
    commesse: { breve: 'Commesse', f: '#FFEBD1', t: '#B54708', d: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16' },
    progetti: { breve: 'Progetti', f: '#FFF0E6', t: '#C4320A', d: 'M4 4h16v16H4zM4 15h16M12 15v5' },
    preventivi: { breve: 'Preventivi', f: '#ECE7FF', t: '#5925DC', d: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4' },
    // 1.4.0: i Servizi, col cartellino del prezzo.
    servizi: { breve: 'Servizi', f: '#FFE4E8', t: '#C01048', d: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01' },
    attivita: { breve: 'Calendario', f: '#DCE8FF', t: '#1849A9', d: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
    rapportini: { breve: 'Rapportini', f: '#FFF0C2', t: '#7A5600', d: 'M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M9 14l2 2 4-4' },
    spese: { breve: 'Spese', f: '#FFE4DE', t: '#B93815', d: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3' },
    fatturazione: { breve: 'Fatture', f: '#D9F4FA', t: '#0E7090', d: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4' },
    banche: { breve: 'Banche', f: '#DDF3EF', t: '#107569', d: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18' },
    persone: { breve: 'Persone', f: '#FCE7F6', t: '#C11574', d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20a7 7 0 0 1 14 0' },
    documenti: { breve: 'Documenti', f: '#EAECF0', t: '#344054', d: 'M3 6h6l2 2h10v11H3z' },
    ticket: { breve: 'Ticket', f: '#E0E7FF', t: '#3538CD', d: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z' },
    mezzi: { breve: 'Mezzi', f: '#F4EBDD', t: '#8A5A12', d: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4' },
    comunicazioni: { breve: 'WhatsApp', f: '#DCF8E7', t: '#087443', d: 'M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5z' },
    portale: { breve: 'Portale clienti', f: '#E0F2FE', t: '#026AA2', d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18' },
    collaboratori: { breve: 'Collaboratori', f: '#EAF8D7', t: '#3B7C0F', d: 'M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M3 20a7 7 0 0 1 12-4.9M19 14v6M16 17h6' },
    integrazioni: { breve: 'Integrazioni', f: '#F2F4F7', t: '#475467', d: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4' },
    amministrazione: { breve: 'Impostazioni', f: '#F2F4F7', t: '#16171B', d: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4', staccata: true },
  };

  /** Le sei azioni, nell'ordine del prototipo: chiave, testo, modulo con cui si scrive, tasto del computer, colore. */
  const AZIONI = [
    { chiave: 'rapportino', testo: 'Scrivi un rapportino', modulo: 'rapportini', tasto: 'R', tinta: 'giallo' },
    { chiave: 'spesa', testo: 'Aggiungi una spesa', modulo: 'spese', tasto: 'S', tinta: 'corallo' },
    { chiave: 'commessa', testo: 'Nuova commessa', modulo: 'commesse', tasto: 'N', tinta: 'blu' },
    { chiave: 'cliente', testo: 'Nuovo cliente', modulo: 'clienti', tasto: 'C', tinta: 'verde' },
    { chiave: 'preventivo', testo: 'Prepara un preventivo', modulo: 'preventivi', tasto: 'P', tinta: 'viola' },
    { chiave: 'invia', testo: 'Invia un rapportino', modulo: 'rapportini', tasto: 'I', tinta: 'acqua' },
  ];

  /** Le azioni che chi è entrato può fare: permesso di scrittura e funzione accesa, altrimenti la tessera sparisce. */
  function azioniDi(puoScrivere) {
    return AZIONI.filter(a => puoScrivere(a.modulo));
  }

  /** La frase del server "Fattura 2026/41 scaduta da 12 giorni". */
  const FATTURA_SCADUTA = /^Fattura (.+) scaduta da (.+)$/;

  /**
   * Quello che va sulla scheda gialla: { titolo, dettaglio, pillola, importo, nota, idFattura }.
   * idFattura c'è solo per una fattura scaduta di un cliente solo: è quella a cui si manda il promemoria.
   */
  function schedaImportante(v) {
    const importo = (v.unita === 'euro' || !v.unita) && typeof v.quanto === 'number' ? v.quanto : null;
    const f = v.tipo === 'fattura' ? FATTURA_SCADUTA.exec(v.titolo || '') : null;
    if (f) {
      const cliente = String(v.dettaglio || '').split(' · ')[0].trim();
      return { titolo: cliente ? 'La fattura di ' + cliente + ' è scaduta' : 'La fattura ' + f[1] + ' è scaduta', dettaglio: '', pillola: 'Scaduta da ' + f[2], importo, nota: 'Fattura ' + f[1],
        idFattura: v.collegamento && v.collegamento.pagina === 'fattura' && v.collegamento.id ? v.collegamento.id : null, cliente };
    }
    return { titolo: v.titolo || '', dettaglio: v.dettaglio || '', pillola: '', importo, nota: '', idFattura: null, cliente: '' };
  }

  /** La prima cosa da fare e le righe di Da sistemare: { prima, righe, altre }. */
  function daSistemare(dash, quante) {
    const urgenti = (dash && dash.urgenti) || [];
    const settimana = (dash && dash.settimana) || [];
    const pianificare = (dash && dash.pianificare) || [];
    const tutte = urgenti.concat(settimana, pianificare);
    const totale = ((dash && dash.quante) || {});
    const conte = ['urgenti', 'settimana', 'pianificare'].reduce((s, k) => s + (Number(totale[k]) || 0), 0);
    const quanteVoci = Math.max(conte, tutte.length);
    const prima = tutte[0] || null;
    const righe = tutte.slice(1, 1 + quante);
    return { prima, righe, altre: Math.max(0, quanteVoci - (prima ? 1 : 0) - righe.length) };
  }

  /** Il colore della riga di Da sistemare, dal tipo della voce (prototipo: ambra, corallo, blu, viola, verde). */
  const TINTE = {
    budget: 'ambra', commessa: 'ambra', fine: 'ambra', prestazione: 'ambra', prestazioni: 'ambra',
    spese: 'corallo', rimborsi: 'corallo', approvare: 'corallo', respinta: 'corallo', veicoli: 'corallo',
    appuntamento: 'blu', sopralluogo: 'blu', attivita: 'blu', agenda: 'blu', intervento: 'blu', giorno: 'blu', giorni: 'blu', scadenza: 'blu',
    responsabile: 'viola', persona: 'viola', persone: 'viola', assenza: 'viola', qualifica: 'viola', visita: 'viola', collaboratore: 'viola', incarico: 'viola', preventivo: 'viola', preventivi: 'viola',
    fattura: 'verde', fatturare: 'verde', fatturazione: 'verde', soldi: 'verde', cassa: 'verde', impegno: 'verde', conto: 'verde', pagamento: 'verde', ricevuta: 'verde', rapportini: 'verde',
    ticket: 'acqua', messaggio: 'acqua', portale: 'acqua', documento: 'acqua', contratto: 'acqua',
  };
  const tintaVoce = v => TINTE[String(v.tipo || '').toLowerCase()] || 'ardesia';

  const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const piuGiorni = (iso, n) => {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  /** "14:30" o, senza ora, niente. */
  const oraDi = x => { const o = String(x.inizio || '').slice(11, 16); return !o || x.tuttoIlGiorno ? '' : Number(o.slice(0, 2)) + ':' + o.slice(3); };

  /**
   * Le righe di In agenda: Oggi e Domani ci sono sempre (anche vuote, "Niente in agenda"), poi i prossimi appuntamenti,
   * al massimo [quante]. Ogni riga: { etichetta, ora, titolo, sotto, id, oggi, vuota }.
   */
  function agenda(a, oggi, quante) {
    // Gli appuntamenti: un'attività senza orario non è "in agenda", sta in Da sistemare.
    const tutti = (((a && a.oggi) || []).concat((a && a.settimana) || [])).filter(x => x.tipo !== 'attivita' || x.inizio);
    const domani = piuGiorni(oggi, 1);
    const etichetta = g => {
      if (g === oggi) return 'Oggi';
      if (g === domani) return 'Domani';
      const d = new Date(g + 'T12:00:00Z');
      return GIORNI[d.getUTCDay()] + ' ' + d.getUTCDate();
    };
    const riga = x => ({ etichetta: etichetta(x.giorno), ora: oraDi(x), titolo: x.titolo || '', sotto: [x.luogo, x.idCommessa, x.assegnata].filter(Boolean).join(' · '), id: x.id, oggi: x.giorno === oggi, vuota: false, giorno: x.giorno });
    const vuota = g => ({ etichetta: etichetta(g), ora: new Date(g + 'T12:00:00Z').getUTCDate() + '', titolo: '', sotto: '', id: null, oggi: false, vuota: true, giorno: g });
    const righe = [];
    if (!tutti.some(x => x.giorno === oggi)) righe.push(vuota(oggi));
    if (!tutti.some(x => x.giorno === domani)) righe.push(vuota(domani));
    tutti.forEach(x => righe.push(riga(x)));
    righe.sort((x, y) => (x.giorno < y.giorno ? -1 : x.giorno > y.giorno ? 1 : 0));
    return righe.slice(0, quante);
  }

  return { VOCI_FAI, AZIONI, azioniDi, schedaImportante, daSistemare, tintaVoce, agenda };
}));
