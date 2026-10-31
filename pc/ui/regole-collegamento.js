/*
 * Wisper Ufficio: come si dice, a parole, dove sta il server e da che strada si arriva
 * (docs/gestionale/porta-google.md §8). Niente di grafico: le prove sono in
 * pc/prove/porta-ufficio.test.js.
 *
 * Il programma dice alla pagina (/locale/stato) l'indirizzo del server di casa, se c'è
 * la porta Google (solo sì o no: l'indirizzo dello script la pagina non lo vede mai),
 * la strada di adesso e l'ultimo contatto riuscito.
 *   "Da fuori: Google · In casa: 192.168.1.51 · ultimo contatto alle 10:42 in ufficio"
 */
(function (radice) {
  'use strict';

  const due = n => String(n).padStart(2, '0');

  /** "http://192.168.1.51:8400" -> "192.168.1.51"; la porta si scrive solo se non è quella di sempre (8400). */
  function casaBreve(indirizzo) {
    return String(indirizzo || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').replace(/:8400$/, '');
  }

  /** "alle 10:42" oggi, "ieri alle 18:03", "il 29/10 alle 18:03". */
  function quando(iso, adesso) {
    const d = new Date(String(iso || ''));
    if (isNaN(d.getTime())) return '';
    const ora = 'alle ' + d.getHours() + ':' + due(d.getMinutes());
    const oggi = adesso ? new Date(adesso) : new Date();
    const giorno = x => x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate();
    if (giorno(d) === giorno(oggi)) return ora;
    const ieri = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - 1);
    if (giorno(d) === giorno(ieri)) return 'ieri ' + ora;
    return 'il ' + due(d.getDate()) + '/' + due(d.getMonth() + 1) + ' ' + ora;
  }

  /** "in ufficio" / "via Google": da dove è passato l'ultimo contatto. */
  function strada(s) {
    return s === 'casa' ? 'in ufficio' : s === 'google' ? 'via Google' : '';
  }

  /**
   * La frase del collegamento. st: {casa, google (sì/no), ultimoContatto, ultimaStrada}.
   * Con ultimo:false senza l'ultimo contatto (la pagina di accesso, prima di entrare).
   */
  function frase(st, opzioni) {
    st = st || {};
    const conUltimo = !opzioni || opzioni.ultimo !== false;
    const parti = ['Da fuori: ' + (st.google ? 'Google' : 'non collegato'), 'In casa: ' + (st.casa ? casaBreve(st.casa) : 'non collegato')];
    const q = conUltimo ? quando(st.ultimoContatto, opzioni && opzioni.adesso) : '';
    if (q) parti.push(['ultimo contatto', q, strada(st.ultimaStrada)].filter(Boolean).join(' '));
    return parti.join(' · ');
  }

  /**
   * Il messaggio della pagina di accesso quando non si entra. Gli errori di rete della porta
   * Google hanno già le parole giuste ("Il server dello studio non risponde dalle 10:42"):
   * si mostrano così come sono (porta-google.md §4).
   */
  function erroreAccesso(e) {
    if (!e) return 'Non sono riuscito a entrare.';
    if (e.rete) return e.dati && e.dati.porta && e.message ? e.message : 'Il server non risponde: controlla la rete e riprova.';
    return e.message || 'Non sono riuscito a entrare.';
  }

  const Regole = { casaBreve, quando, strada, frase, erroreAccesso };

  if (typeof module !== 'undefined' && module.exports) module.exports = Regole;
  else radice.WisperCollegamento = Regole;
})(typeof window !== 'undefined' ? window : globalThis);
