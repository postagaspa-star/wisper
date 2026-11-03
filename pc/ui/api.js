/*
 * Wisper Ufficio: le sole chiamate che l'interfaccia fa, come in Pactum.
 *
 * La pagina è servita da https://wisper.locale/ e chiama SOLO /locale/* (il
 * computer: accesso, PDF, file) e /server/* (il server di Wisper, a cui il
 * programma aggiunge la chiave d'accesso). L'interfaccia non conosce la chiave
 * e non parla mai col server da sola.
 */
(function (radice) {
  'use strict';

  const ATTESA_MS = 150000; // un PDF con tante foto, o il server appena acceso, può essere lento

  async function chiama(metodo, percorso, corpo) {
    if (!/^\/(locale|server)\//.test(percorso)) throw new Error('Chiamata fuori dall\'accordo: ' + percorso);
    const controllo = new AbortController();
    const timer = setTimeout(() => controllo.abort(), ATTESA_MS);
    try {
      const opzioni = { method: metodo, cache: 'no-store', headers: { Accept: 'application/json' }, signal: controllo.signal };
      if (corpo !== undefined) {
        opzioni.headers['Content-Type'] = 'application/json';
        opzioni.body = JSON.stringify(corpo);
      }
      let r;
      try {
        r = await fetch(percorso, opzioni);
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        const err = new Error('Il programma non risponde');
        err.rete = true;
        throw err;
      }
      let dati = null;
      try { dati = await r.json(); } catch (e) { dati = null; }
      if (!dati || dati.ok === false) {
        const err = new Error((dati && dati.errore) || ('Errore ' + r.status));
        err.rete = !!(dati && dati.rete) || r.status === 502;
        // accesso:false = la chiave non vale più (scaduta o revocata): si torna all'accesso.
        if (dati && dati.accesso === false) err.accesso = false;
        // permesso:false = il ruolo non lo permette.
        if (dati && dati.permesso === false) err.permesso = false;
        // La risposta intera: serveConferma, mancano, sovrapposte (fase 2) servono a chi ha chiamato.
        if (dati) err.dati = dati;
        throw err;
      }
      return dati;
    } catch (e) {
      if (e.name === 'AbortError') {
        const err = new Error('Il server non ha risposto in tempo');
        err.rete = true;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fase 5: un file trascinato sulla pagina (o un PDF appena fatto) va al programma così com'è, in byte:
   * POST /locale/carica-corpo?nome=&mime=&per=&idFile=. Il programma lo gira al server (/carica) con la chiave.
   */
  async function postFile(percorso, file) {
    if (!/^\/locale\/carica-corpo\?/.test(percorso)) throw new Error('Chiamata fuori dall\'accordo: ' + percorso);
    let r;
    try {
      r = await fetch(percorso, { method: 'POST', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': 'application/octet-stream' }, body: file });
    } catch (e) {
      const err = new Error('Il programma non risponde');
      err.rete = true;
      throw err;
    }
    let dati = null;
    try { dati = await r.json(); } catch (e) { dati = null; }
    if (!dati || dati.ok === false) {
      const err = new Error((dati && dati.errore) || ('Errore ' + r.status));
      if (dati && dati.accesso === false) err.accesso = false;
      if (dati && dati.permesso === false) err.permesso = false;
      if (dati) err.dati = dati;
      err.rete = !!(dati && dati.rete);
      throw err;
    }
    return dati;
  }

  radice.WisperApi = {
    get: percorso => chiama('GET', percorso),
    post: (percorso, corpo) => chiama('POST', percorso, corpo || {}),
    postFile,
  };
})(window);
