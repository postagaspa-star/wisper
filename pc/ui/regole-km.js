/*
 * Wisper Ufficio: i km da proporre in un lavoro del rapportino (12/11/2026, Manuel: "suggeriti in automatico"; Andrea ha
 * scelto: dal luogo del lavoro, andata e ritorno; docs/gestionale/km.md). Niente disegno qui.
 *
 * Due fonti, in quest'ordine per ogni luogo:
 *  - "Ultima volta": i km dell'ultimo lavoro con i km per lo stesso posto (se Manuel li ha corretti, si riprendono i suoi);
 *  - "Dallo studio": kmStudio che il server mette su progetti, commesse e clienti (la strada in auto dallo studio, andata e
 *    ritorno, calcolata una volta dalla mappa di Google).
 * Il posto: col progetto scelto e' il progetto (il suo Dove; un progetto di Elettrodinamica e' quasi sempre altrove dalla
 * sede di Elettrodinamica: mai i km di un altro progetto della stessa commessa). Un progetto senza "Intestato a" e senza
 * Dove e' del cliente stesso: dopo il progetto valgono commessa e cliente. Senza progetto: la commessa, poi il cliente.
 * Un viaggio, una volta sola: se un lavoro PRIMA di questo nello stesso rapportino ha gia' i km (x.kmPrima), non si propone
 * niente da scrivere da solo (restano le pillole). Nei rapportini veri con piu' lavori i km non sono mai su tutti: in 9 giorni
 * su 12 su un lavoro solo, negli altri su due (viaggi diversi). "Prima" e non "un altro": scrivere i km nel lavoro 2 non
 * toglie quelli scritti da soli nel lavoro 1.
 * Casi condivisi col telefono: pc/prove/casi-km.json (rapportino/Km.kt).
 */
(function (radice, fabbrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.WisperRegoleKm = fabbrica();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const pieno = v => v !== undefined && v !== null && String(v).trim() !== '';
  const numero = v => (pieno(v) && isFinite(Number(v)) ? Number(v) : null);

  /** I km dell'ultimo lavoro (per data; a parità il primo dell'elenco) che passa il filtro, con km > 0; null se nessuno. */
  function ultimi(storico, passa) {
    let meglio = null;
    (storico || []).forEach(l => {
      const km = numero(l.km);
      if (km === null || km <= 0 || !passa(l)) return;
      if (!meglio || String(l.data || '') > String(meglio.data || '')) meglio = l;
    });
    return meglio ? numero(meglio.km) : null;
  }

  /**
   * Le proposte per un lavoro. x = { lavoro: { idCliente, idCommessa, idProgetto }, progetto: { intestatoA, dove, kmStudio }
   * | null, commessa: { kmStudio } | null, cliente: { kmStudio } | null, storico: [{ data, idCliente, idCommessa,
   * idProgetto, km }] (gli ALTRI lavori), kmPrima: true se un lavoro prima di questo nello stesso rapportino ha gia' i km }.
   * Torna { proposta: { km, da: 'ultima' | 'studio' } | null, ultima: km | null, studio: km | null }: la proposta e' la
   * prima che c'e' nell'ordine; ultima e studio sono le prime di ognuna (per le pillole "Ultima volta" e "Dallo studio").
   */
  function proposte(x) {
    const l = (x && x.lavoro) || {};
    const storico = (x && x.storico) || [];
    const candidati = [];
    const metti = (da, km) => { if (km !== null && km !== undefined && km > 0) candidati.push({ km, da }); };
    const conProgetto = pieno(l.idProgetto);
    if (conProgetto) {
      metti('ultima', ultimi(storico, s => String(s.idProgetto) === String(l.idProgetto)));
      const p = (x && x.progetto) || {};
      metti('studio', numero(p.kmStudio));
    }
    const delCliente = !conProgetto || !(x && x.progetto) || (!pieno(x.progetto.intestatoA) && !pieno(x.progetto.dove));
    if (delCliente) {
      if (pieno(l.idCommessa)) {
        // I lavori con un progetto erano nel posto del loro progetto: per la commessa e il cliente contano solo gli altri.
        metti('ultima', ultimi(storico, s => String(s.idCommessa) === String(l.idCommessa) && !pieno(s.idProgetto)));
        metti('studio', numero(((x && x.commessa) || {}).kmStudio));
      }
      if (pieno(l.idCliente)) {
        metti('ultima', ultimi(storico, s => String(s.idCliente) === String(l.idCliente) && !pieno(s.idProgetto)));
        metti('studio', numero(((x && x.cliente) || {}).kmStudio));
      }
    }
    const prima = da => { const c = candidati.find(k => k.da === da); return c ? c.km : null; };
    return { proposta: (x && x.kmPrima) ? null : candidati[0] || null, ultima: prima('ultima'), studio: prima('studio') };
  }

  return { proposte };
}));
