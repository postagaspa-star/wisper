/*
 * Wisper Ufficio: le regole dei progetti, senza niente di grafico (docs/gestionale/progetti.md, 03/11/2026).
 *
 * Cliente -> commessa -> progetto -> rapportino. Qui: come si scrive un progetto a parole ("ED-003 · Quadro QE1"),
 * quali si vedono con i filtri dell'elenco, quali si propongono in un rapportino (gli aperti della sua commessa) e quale
 * si sceglie da solo (l'unico aperto), i nomi già usati in "Intestato a" per un cliente, cosa manca a un rapportino quando
 * la funzione Progetti è accesa. Il codice proposto lo dice il server (codiceProgetto): qui non si indovina niente.
 *
 * Stanno qui da sole perché si provano con Node (prove/progetti.test.js).
 */
(function (radice) {
  'use strict';

  const norm = s => String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const stessoId = (a, b) => a !== null && a !== undefined && a !== '' && String(a) === String(b);

  /** "ED-003 · Quadro QE1" (solo il codice se non c'è la descrizione). */
  function etichetta(p) {
    if (!p) return '';
    const codice = String(p.codice || '').trim();
    const descrizione = String(p.descrizione || '').trim();
    return codice && descrizione ? codice + ' · ' + descrizione : codice || descrizione;
  }

  /** Il progetto di un rapportino ('' se non ne ha). Il rapportino porta codice e descrizione; altrimenti dall'elenco. */
  function trovaDelRapportino(r, progetti) {
    if (!r || r.idProgetto === null || r.idProgetto === undefined || r.idProgetto === '') return null;
    return (progetti || []).find(p => stessoId(p.id, r.idProgetto)) || null;
  }

  /** "ED-003 · Quadro QE1" per un rapportino, o '' senza progetto. */
  function delRapportino(r, progetti) {
    if (!r) return '';
    const p = trovaDelRapportino(r, progetti);
    const codice = String(r.progetto || (p && p.codice) || '').trim();
    if (!codice && !p) return '';
    return etichetta({ codice, descrizione: r.progettoDescrizione || (p && p.descrizione) || '' });
  }

  /** A chi è intestato il progetto di un rapportino ('' se non c'è). */
  function intestatoDelRapportino(r, progetti) {
    if (!r) return '';
    const p = trovaDelRapportino(r, progetti);
    return String(r.progettoIntestatoA || (p && p.intestatoA) || '').trim();
  }

  /** I numeri dei segmenti: aperti, chiusi, tutti. */
  function conta(progetti) {
    const l = progetti || [];
    const chiusi = l.filter(p => String(p.stato).toUpperCase() === 'CHIUSO').length;
    return { aperti: l.length - chiusi, chiusi, tutti: l.length };
  }

  /** Il più recente prima (creato, poi id), come li manda il server. */
  function recentiPrima(a, b) {
    const x = String(a.creato || ''); const y = String(b.creato || '');
    if (x !== y) return x < y ? 1 : -1;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  }

  /**
   * L'elenco coi filtri: stato APERTO (di base) | CHIUSO | tutti; testo nel codice, in "Intestato a", nella descrizione,
   * nella commessa (codice e nome) e nel cliente. nomi(p) -> testo in più su cui cercare (commessa e cliente a parole).
   */
  function filtra(progetti, filtri, nomi) {
    const f = filtri || {};
    const stato = String(f.stato || 'APERTO').toUpperCase();
    const t = norm(f.testo);
    return (progetti || []).filter(p => {
      const st = String(p.stato || 'APERTO').toUpperCase();
      if (stato !== 'TUTTI' && st !== stato) return false;
      if (f.idCommessa && !stessoId(p.idCommessa, f.idCommessa)) return false;
      if (f.idCliente && !stessoId(p.idCliente, f.idCliente)) return false;
      if (!t) return true;
      const dove = [p.codice, p.intestatoA, p.descrizione, p.idCommessa, nomi ? nomi(p) : ''].map(norm).join(' ');
      return t.split(/\s+/).every(w => dove.indexOf(w) >= 0);
    }).sort(recentiPrima);
  }

  /** Le scelte del rapportino: i progetti aperti della commessa e, se c'è, quello già scelto (anche chiuso). */
  function perRapportino(progetti, idCommessa, idScelto) {
    if (!idCommessa) return [];
    return (progetti || []).filter(p => String(p.idCommessa).toUpperCase() === String(idCommessa).toUpperCase() &&
      (String(p.stato || 'APERTO').toUpperCase() === 'APERTO' || stessoId(p.id, idScelto)))
      .sort((a, b) => String(a.codice).localeCompare(String(b.codice), 'it', { numeric: true }));
  }

  /** L'unico progetto aperto della commessa, che il rapportino sceglie da solo (null se ce ne sono zero o più di uno). */
  function sceltoDaSolo(progetti, idCommessa) {
    const aperti = perRapportino(progetti, idCommessa, null);
    return aperti.length === 1 ? aperti[0] : null;
  }

  /** I nomi già scritti in "Intestato a" per i progetti di un cliente: i più recenti prima, senza doppi (maiuscole uguali). */
  function intestatiDelCliente(progetti, idCliente, quanti) {
    if (!idCliente) return [];
    const visti = new Set();
    const out = [];
    (progetti || []).filter(p => stessoId(p.idCliente, idCliente) && String(p.intestatoA || '').trim()).sort(recentiPrima).forEach(p => {
      const nome = String(p.intestatoA).trim();
      const k = norm(nome);
      if (visti.has(k)) return;
      visti.add(k);
      out.push(nome);
    });
    return out.slice(0, quanti || 5);
  }

  /**
   * Cosa manca a un rapportino per il progetto (accordo §4.6): con la funzione Progetti accesa non si salva senza
   * progetto, e quindi senza commessa. o: {accesi, idCommessa, commessaNuova, idProgetto, progettoNuovo, aperti, puoCreare,
   * titolare}. '' = va bene.
   */
  function mancaProgetto(o) {
    const x = o || {};
    if (!x.accesi) return '';
    if (x.idProgetto || (x.progettoNuovo && (String(x.progettoNuovo.descrizione || '').trim() || String(x.progettoNuovo.codice || '').trim()))) return '';
    if (!x.idCommessa && !x.commessaNuova) return 'Scegli la commessa e il progetto';
    if (!x.aperti && !x.puoCreare) return 'La commessa non ha progetti aperti: chiedi a ' + (x.titolare || 'al titolare') + ' di crearne uno';
    return 'Scegli il progetto';
  }

  /**
   * Il progetto (e quindi la commessa) è obbligatorio nel rapportino solo per Elettrodinamica (06/11/2026, scelta di Andrea:
   * "dal nome Elettrodinamica"): vero se il nome del cliente, in minuscolo, senza accenti e senza spazi, punti, trattini o
   * altri segni, contiene "elettrodinamica". Per gli altri clienti progetto e commessa sono facoltativi. Casi condivisi col
   * telefono in server/prove/casi-progetto-obbligatorio.json.
   */
  function progettoObbligatorio(nomeCliente) {
    const pulito = String(nomeCliente === null || nomeCliente === undefined ? '' : nomeCliente).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
    return pulito.indexOf('elettrodinamica') >= 0;
  }

  /** Una funzione è accesa? (funzioniSpente di io.interfaccia; senza elenco sono tutte accese). */
  function accesa(funzioniSpente, modulo) {
    return !(Array.isArray(funzioniSpente) && funzioniSpente.indexOf(modulo) >= 0);
  }

  /** "Aperto" / "Chiuso", con il colore della pillola. */
  function parolaStato(p) {
    return String((p && p.stato) || 'APERTO').toUpperCase() === 'CHIUSO' ? { testo: 'Chiuso', colore: 'grigio' } : { testo: 'Aperto', colore: 'verde' };
  }

  /**
   * 12/11/2026 (km.md): il Dove di un altro progetto con lo stesso "Intestato a" (lo stesso posto), il più recente che ce
   * l'ha; '' se nessuno. Come doveDiIntestato del server, che lo fa anche quando il progetto arriva senza Dove.
   */
  function doveDiIntestato(progetti, intestatoA, tranneId) {
    const k = norm(intestatoA).replace(/\s+/g, ' ');
    if (!k) return '';
    const p = (progetti || []).filter(x => String(x.id) !== String(tranneId) && norm(x.intestatoA).replace(/\s+/g, ' ') === k && String(x.dove || '').trim())
      .sort(recentiPrima)[0];
    return p ? String(p.dove).trim() : '';
  }

  const Regole = { etichetta, delRapportino, intestatoDelRapportino, conta, filtra, perRapportino, sceltoDaSolo, intestatiDelCliente, mancaProgetto, progettoObbligatorio, accesa, parolaStato, doveDiIntestato };

  if (typeof module !== 'undefined' && module.exports) module.exports = Regole;
  else radice.WisperRegoleProgetti = Regole;
})(typeof window !== 'undefined' ? window : globalThis);
