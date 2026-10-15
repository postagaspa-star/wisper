/*
 * Wisper Ufficio: le sole chiamate che l'interfaccia fa, come in Pactum.
 *
 * La pagina è servita da https://wisper.locale/ e chiama SOLO /locale/* (il
 * computer) e /foglio/* (lo script del foglio, a cui il programma aggiunge il
 * codice). L'interfaccia non conosce il codice e non parla mai con Google da sola.
 */
(function (radice) {
  'use strict';

  const ATTESA_MS = 150000; // lo script, da freddo e con file da scrivere, può essere lento

  async function chiama(metodo, percorso, corpo) {
    if (!/^\/(locale|foglio)\//.test(percorso)) throw new Error('Chiamata fuori dall\'accordo: ' + percorso);
    const controllo = new AbortController();
    const timer = setTimeout(() => controllo.abort(), ATTESA_MS);
    try {
      const opzioni = { method: metodo, cache: 'no-store', headers: { Accept: 'application/json' }, signal: controllo.signal };
      if (corpo !== undefined) {
        opzioni.headers['Content-Type'] = 'application/json';
        opzioni.body = JSON.stringify(corpo);
      }
      const r = await fetch(percorso, opzioni);
      let dati = null;
      try { dati = await r.json(); } catch (e) { dati = null; }
      if (!dati || dati.ok === false) {
        const err = new Error((dati && dati.errore) || ('Errore ' + r.status));
        err.rete = !!(dati && dati.rete) || r.status === 502;
        throw err;
      }
      return dati;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Il foglio non ha risposto in tempo');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  radice.WisperApi = {
    get: percorso => chiama('GET', percorso),
    post: (percorso, corpo) => chiama('POST', percorso, corpo || {}),
  };
})(window);
