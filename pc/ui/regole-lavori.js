/*
 * Wisper Ufficio: le regole del rapportino con più lavori, senza niente di grafico (docs/gestionale/rapportino-lavori.md,
 * 06/11/2026).
 *
 * Il server manda i LAVORI (una riga per lavoro, come i rapportini della 1.1) con idGiornata = il numero del rapportino
 * e posizione = il posto nel rapportino. Qui:
 * - raggruppa: i lavori di uno stesso rapportino insieme, i rapportini più recenti prima;
 * - gli stati del lavoro a parole: Da inviare (BOZZA e il FIRMATO di prima) → Inviato → Fatturato;
 * - riassuntoStati: "2 da inviare · 1 inviato";
 * - perDestinatario: un'email per destinatario, con solo i suoi lavori (nessun cliente vede i lavori di un altro);
 * - oggettoInvio: oggetto e frase dell'email (server/prove/casi-invio.json): i lavori di un rapportino solo hanno il
 *   formato del rapportino singolo ("Rapportino RAP/2026/0153 del 05/11/2026").
 *
 * Stanno qui da sole perché si provano con Node (prove/rapportino-lavori.test.js, casi in prove/casi-rapportino-lavori.json).
 */
(function (radice) {
  'use strict';

  const statoDi = l => String((l && l.stato) || 'BOZZA').toUpperCase();

  /** Lo stato come si vede: il FIRMATO di prima è Da inviare (BOZZA). */
  function statoVisto(st) {
    const s = String(st || 'BOZZA').toUpperCase();
    return s === 'FIRMATO' ? 'BOZZA' : s;
  }

  const PAROLE = { BOZZA: 'Da inviare', INVIATO: 'Inviato', FATTURATO: 'Fatturato', ANNULLATO: 'Tolto' };
  /** La parola dello stato di un lavoro: "Da inviare", "Inviato", "Fatturato". */
  const parolaStato = st => PAROLE[statoVisto(st)] || String(st || '');

  const daInviare = l => statoVisto(statoDi(l)) === 'BOZZA';
  /** Si fattura: Da inviare o Inviato (dal 06/11/2026 anche Da inviare: non c'è più la firma da aspettare). */
  const daFatturare = l => ['BOZZA', 'INVIATO'].indexOf(statoVisto(statoDi(l))) >= 0;
  /** Un lavoro che non si cambia più: inviato, fatturato o dentro una fattura (anche in bozza). */
  const fermo = l => ['INVIATO', 'FATTURATO'].indexOf(statoDi(l)) >= 0 || !!(l && l.fattura);

  /** Il rapportino di un lavoro: idGiornata (server 0.13), altrimenti il suo numero (un lavoro solo, come nella 1.1). */
  const giornataDi = l => String((l && (l.idGiornata || l.numero || l.id || l.idLocale)) || '');

  const normalizza = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  /** Lo stesso cliente: per codice, altrimenti per nome. */
  const chiaveCliente = l => (l && l.idCliente ? 'c:' + l.idCliente : 'n:' + normalizza(l && l.cliente));

  /**
   * I lavori raggruppati per rapportino: [{ id, data, tecnico, lavori }]. I lavori in ordine di posizione; i rapportini
   * dal più recente, e a parità di data nell'ordine in cui arrivano (il server li manda già in ordine). Gli annullati no.
   */
  function raggruppa(lavori) {
    const mappa = new Map();
    const ordine = [];
    (lavori || []).forEach(l => {
      if (!l || statoDi(l) === 'ANNULLATO') return;
      const k = giornataDi(l);
      if (!mappa.has(k)) { mappa.set(k, []); ordine.push(k); }
      mappa.get(k).push(l);
    });
    const gruppi = ordine.map((k, i) => {
      const ls = mappa.get(k).map((l, j) => ({ l, j }))
        .sort((a, b) => ((Number(a.l.posizione) || 1) - (Number(b.l.posizione) || 1)) || a.j - b.j).map(x => x.l);
      return { id: k, data: String(ls[0].data || '').slice(0, 10), tecnico: ls[0].tecnico || '', lavori: ls, i };
    });
    gruppi.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.i - b.i));
    return gruppi.map(g => ({ id: g.id, data: g.data, tecnico: g.tecnico, lavori: g.lavori }));
  }

  /** Quanti clienti diversi. */
  const contaClienti = lavori => new Set((lavori || []).map(chiaveCliente)).size;
  const nLavori = n => (n === 1 ? '1 lavoro' : n + ' lavori');
  const nClienti = n => (n === 1 ? '1 cliente' : n + ' clienti');
  /** "3 lavori · 2 clienti" ("1 lavoro" da solo, senza "1 cliente"). */
  function lavoriEClienti(lavori) {
    const n = (lavori || []).length;
    const c = contaClienti(lavori);
    return n === 1 ? nLavori(1) : nLavori(n) + ' · ' + nClienti(c);
  }

  /** "2 da inviare · 1 inviato · 1 fatturato" (solo le parti che ci sono). */
  function riassuntoStati(lavori) {
    const c = { BOZZA: 0, INVIATO: 0, FATTURATO: 0 };
    (lavori || []).forEach(l => { const s = statoVisto(statoDi(l)); if (c[s] !== undefined) c[s] += 1; });
    const parti = [];
    if (c.BOZZA) parti.push(c.BOZZA + ' da inviare');
    if (c.INVIATO) parti.push(c.INVIATO + (c.INVIATO === 1 ? ' inviato' : ' inviati'));
    if (c.FATTURATO) parti.push(c.FATTURATO + (c.FATTURATO === 1 ? ' fatturato' : ' fatturati'));
    return parti.join(' · ');
  }

  /**
   * Un'email per destinatario: [{ chiave, lavori }], nell'ordine in cui i destinatari compaiono. chiave(lavoro) dice a chi
   * va (chi paga: il cliente del lavoro, la regola di sempre); senza, il cliente del lavoro.
   */
  function perDestinatario(lavori, chiave) {
    const di = typeof chiave === 'function' ? chiave : chiaveCliente;
    const mappa = new Map();
    (lavori || []).forEach(l => {
      const k = di(l);
      if (!mappa.has(k)) mappa.set(k, { chiave: k, lavori: [] });
      mappa.get(k).lavori.push(l);
    });
    return Array.from(mappa.values());
  }

  /** I lavori sono tutti di un rapportino solo? Il suo numero, altrimenti ''. */
  function unRapportino(lavori) {
    const g = Array.from(new Set((lavori || []).map(giornataDi)));
    return g.length === 1 ? g[0] : '';
  }

  /**
   * Oggetto e frase dell'email per i lavori di un destinatario. periodoInvio = RegoleInvio.periodoInvio. Un rapportino
   * solo: "Rapportino <numero> del <data>"; più rapportini: giorno, settimana, mese o più mesi (casi-invio.json).
   */
  function oggettoInvio(lavori, periodoInvio) {
    const lista = lavori || [];
    const numero = unRapportino(lista);
    if (numero && lista.length) return periodoInvio([String(lista[0].data).slice(0, 10)], numero);
    return periodoInvio(lista.map(l => String(l.data).slice(0, 10)));
  }

  /**
   * La casella del rapportino nell'elenco: 'tutti' se tutti i suoi lavori sono scelti, 'alcuni', 'nessuno'.
   * scelti: un Set di chiavi; chiaveDi(lavoro) -> la chiave del lavoro.
   */
  function casellaRapportino(lavori, scelti, chiaveDi) {
    const n = (lavori || []).filter(l => scelti.has(chiaveDi(l))).length;
    return n === 0 ? 'nessuno' : n === lavori.length ? 'tutti' : 'alcuni';
  }

  const Regole = {
    statoVisto, parolaStato, daInviare, daFatturare, fermo, giornataDi, chiaveCliente, raggruppa, contaClienti, nLavori, nClienti,
    lavoriEClienti, riassuntoStati, perDestinatario, unRapportino, oggettoInvio, casellaRapportino,
  };
  radice.WisperRegoleLavori = Regole;
  if (typeof module !== 'undefined' && module.exports) module.exports = Regole;
})(typeof window !== 'undefined' ? window : globalThis);
