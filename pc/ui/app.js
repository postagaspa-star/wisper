/*
 * Wisper Ufficio: l'interfaccia (docs/aspetto.md §8).
 *
 * Cinque sezioni: Fine mese (la casa: cosa c'è da fatturare e a chi), Rapportini,
 * Commesse, Clienti, Impostazioni. Da Pleya si sono presi i Progetti (qui
 * Commesse, come le chiama chi lo usa) e i Rapportini del team, adattati a una
 * persona sola; il resto viene da quello che è stato chiesto: gruppi e tariffe,
 * rimborso ACI, rapportini divisi per chi paga coi totali, riepilogo in PDF.
 *
 * Tutto quello che si vede viene dal foglio, e ogni modifica va al foglio subito:
 * i conti li fa lo script, qui si mostrano. Durante la visita guidata le stesse
 * pagine girano sui dati di esempio (esempio.js), senza toccare il foglio.
 */
(function () {
  'use strict';

  const C = window.WisperConti;
  const D = window.WisperDocumenti;
  const Api = window.WisperApi;
  const Visita = window.WisperVisita;
  const Esempio = window.WisperEsempio;

  // ======================================================================= stato

  const meseDiOggi = () => C.oggiIso().slice(0, 7);

  const S = {
    configurato: false,
    caricato: false,
    erroreLettura: '',
    ana: { clienti: [], commesse: [], gruppi: [], impostazioni: {} },
    rapportini: [],
    ultimaLettura: null,
    mese: meseDiOggi(),
    filtri: { testo: '', mese: meseDiOggi(), quali: 'tutti', chi: '', cliente: '', commessa: '' },
    scelti: new Set(),
    aperto: null,
    filtriCommesse: { testo: '', stato: 'APERTA', cliente: '' },
    filtriClienti: { testo: '', gruppo: '' },
    schedaCommessa: 'panoramica',
    esempio: null,
    veri: null,
  };

  const $ = sel => document.querySelector(sel);

  /** Crea un elemento: h('div', { class: 'x', onclick: f }, figli...) */
  function h(tag, attr) {
    const el = document.createElement(tag);
    if (attr) {
      Object.keys(attr).forEach(k => {
        const v = attr[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'style') Object.assign(el.style, v);
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (let i = 2; i < arguments.length; i++) aggiungi(el, arguments[i]);
    return el;
  }

  function aggiungi(el, f) {
    if (f === null || f === undefined || f === false) return;
    if (Array.isArray(f)) { f.forEach(x => aggiungi(el, x)); return; }
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }

  function svuota(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  // ======================================================================= icone

  const ICONE = {
    indietro: '<path d="M15 6l-6 6 6 6"/>',
    avanti: '<path d="M9 6l6 6-6 6"/>',
    chiudi: '<path d="M6 6l12 12M18 6L6 18"/>',
    spunta: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cerca: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    piu: '<path d="M12 5v14M5 12h14"/>',
    meno: '<path d="M5 12h14"/>',
    altro: '<circle cx="5.5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
    avviso: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    aggiorna: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  };

  function icona(nome, dim, spessore) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', dim || 18);
    s.setAttribute('height', dim || 18);
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke-width', spessore || 2.4);
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONE[nome] || '';
    return s;
  }

  function tondo(nomeIcona, etichetta, onclick, classe) {
    return h('button', { type: 'button', class: 'tondo' + (classe ? ' ' + classe : ''), 'aria-label': etichetta, title: etichetta, onclick }, icona(nomeIcona, 18, 2.6));
  }

  /** Il cerchio con le iniziali: colore scelto dal nome, sempre lo stesso. */
  function iniziali(nome, piccole) {
    const parole = String(nome || '?').replace(/\b(srl|spa|snc|sas)\b/gi, '').trim().split(/\s+/).filter(Boolean);
    const testo = (parole.length > 1 ? parole[0][0] + parole[1][0] : (parole[0] || '?').slice(0, 2)).toUpperCase();
    let somma = 0;
    for (const ch of String(nome || '')) somma = (somma * 31 + ch.charCodeAt(0)) % 997;
    return h('span', { class: 'iniziali tinta-' + (somma % 6) + (piccole ? ' piccole' : ''), 'aria-hidden': 'true' }, testo);
  }

  function stato(st, grande) {
    const nomi = { BOZZA: 'Da firmare', FIRMATO: 'Firmato', INVIATO: 'Inviato', FATTURATO: 'Fatturato', APERTA: 'Aperta', SOSPESA: 'Sospesa', CHIUSA: 'Chiusa' };
    return h('span', { class: 'stato ' + st + (grande ? ' grande' : '') }, nomi[st] || st);
  }

  // ======================================================================= avvisi e attese

  function avviso(testo, errore, durata) {
    const chiudi = () => a.remove();
    const a = h('div', { class: 'avviso' + (errore ? ' errore' : ''), role: errore ? 'alert' : 'status' },
      errore ? icona('avviso', 18) : null, h('span', null, testo),
      errore ? h('button', { type: 'button', 'aria-label': 'Chiudi', onclick: chiudi }, icona('chiudi', 16)) : null);
    aggiungi($('#avvisi'), [a]);
    // Gli errori restano finché non si chiudono: dicono cosa fare.
    if (!errore) setTimeout(chiudi, durata || 3500);
  }

  let inAttesa = 0;
  /** Esegue un'operazione col foglio mostrando "un momento" e gli errori a parole. */
  async function lavora(testo, fn) {
    inAttesa++;
    let etichetta = $('.attesa');
    if (!etichetta) { etichetta = h('div', { class: 'attesa' }, h('i'), h('span')); aggiungi(document.body, [etichetta]); }
    etichetta.lastChild.textContent = testo + '…';
    try {
      return await fn();
    } catch (e) {
      avviso(e.message || String(e), true);
      return undefined;
    } finally {
      inAttesa--;
      if (inAttesa === 0 && etichetta) etichetta.remove();
    }
  }

  // ======================================================================= rete

  /** Le chiamate: al foglio vero, oppure ai dati di esempio durante la visita. */
  const copia = o => JSON.parse(JSON.stringify(o));
  const Rete = {
    get(percorso) {
      if (S.esempio && percorso.indexOf('/foglio/') === 0) return Promise.resolve(copia(Esempio.gestisci(S.esempio, 'GET', percorso)));
      return Api.get(percorso);
    },
    post(percorso, corpo) {
      if (S.esempio) {
        if (percorso.indexOf('/foglio/') === 0) return Promise.resolve(copia(Esempio.gestisci(S.esempio, 'POST', percorso, corpo || {})));
        if (percorso === '/locale/pdf') return Promise.resolve({ ok: true, percorso: '', nome: 'esempio.pdf', base64: '' });
        if (percorso === '/locale/scegli-file') return Promise.resolve({ ok: false });
      }
      return Api.post(percorso, corpo);
    },
  };

  // ======================================================================= finestre e menu

  function finestra(opzioni) {
    const o = opzioni || {};
    const velo = h('div', { class: 'velo' });
    const chiudi = () => { velo.remove(); if (o.allaChiusura) o.allaChiusura(); };
    const f = h('div', { class: 'finestra' + (o.larghezza ? ' ' + o.larghezza : ''), role: 'dialog', 'aria-label': o.titolo || '' });
    if (o.contenuto) {
      aggiungi(f, o.contenuto);
    } else {
      aggiungi(f, [h('div', { class: 'testa-f' }, h('h2', null, o.titolo), tondo('chiudi', 'Chiudi', chiudi, 'piccolo')),
        h('div', { class: 'corpo-f' }, o.corpo)]);
      if (o.pulsanti && o.pulsanti.length) aggiungi(f, [h('div', { class: 'piede-f' }, o.pulsanti.map(p => p === 'spazio' ? h('span', { class: 'spazio' }) : p))]);
    }
    aggiungi(velo, [f]);
    velo.addEventListener('mousedown', e => { if (e.target === velo && !Visita.attiva) chiudi(); });
    aggiungi($('#sovrapposti'), [velo]);
    const primo = f.querySelector('input:not([type=checkbox]):not([disabled]), textarea');
    if (primo && o.fuoco !== false) setTimeout(() => primo.focus(), 40);
    return chiudi;
  }

  function conferma(titolo, testo, siTesto, pericolo) {
    return new Promise(risolvi => {
      let chiudi;
      const no = h('button', { type: 'button', class: 'btn testo grande', onclick: () => { chiudi(); risolvi(false); } }, 'Annulla');
      const si = h('button', { type: 'button', class: 'btn grande ' + (pericolo ? 'pericolo' : 'giallo'), onclick: () => { chiudi(); risolvi(true); } }, siTesto || 'Conferma');
      chiudi = finestra({ titolo, corpo: h('p', { style: { margin: 0, fontSize: '16px' } }, testo), pulsanti: ['spazio', no, si], fuoco: false });
    });
  }

  let menuAperto = null;
  function chiudiMenu() { if (menuAperto) { menuAperto.remove(); menuAperto = null; } }

  /** Il menu ⋯: voci { testo, fn, pericolo } o '-' per una riga. */
  function apriMenu(ancora, voci) {
    chiudiMenu();
    const m = h('div', { class: 'menu', role: 'menu' }, voci.filter(Boolean).map(v => v === '-' ? h('hr') :
      h('button', { type: 'button', role: 'menuitem', class: v.pericolo ? 'pericolo' : '', onclick: () => { chiudiMenu(); v.fn(); } }, v.testo)));
    aggiungi(document.body, [m]);
    const r = ancora.getBoundingClientRect();
    const alto = m.offsetHeight;
    const sotto = r.bottom + 6 + alto < window.innerHeight;
    m.style.top = (sotto ? r.bottom + 6 : r.top - alto - 6) + 'px';
    m.style.left = Math.max(12, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 12)) + 'px';
    menuAperto = m;
    const primo = m.querySelector('button');
    if (primo) primo.focus();
  }
  document.addEventListener('mousedown', e => { if (menuAperto && !menuAperto.contains(e.target)) chiudiMenu(); });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (menuAperto) { chiudiMenu(); return; }
    const veli = document.querySelectorAll('.velo');
    if (veli.length) veli[veli.length - 1].remove();
    else if (S.aperto) chiudiPannello();
  });

  // ======================================================================= campi

  function campo(etichetta, controllo, errore) {
    return h('div', { class: 'campo' + (errore ? ' sbagliato' : '') },
      etichetta ? h('label', null, etichetta) : null, controllo,
      errore ? h('div', { class: 'errore' }, errore) : null);
  }

  function conSuffisso(input, suffisso) {
    return h('div', { class: 'con-suffisso' }, input, h('span', null, suffisso));
  }

  function selezione(opzioni, valore, onchange, attr) {
    return h('select', Object.assign({ class: 'scelta', onchange: e => onchange && onchange(e.target.value) }, attr || {}),
      opzioni.map(o => h('option', { value: o[0], selected: String(o[0]) === String(valore) }, o[1])));
  }

  /** I segmenti: [[valore, etichetta, attributi?]], uno scelto. */
  function segmenti(voci, scelto, onscelta, classe) {
    const s = h('div', { class: 'segmenti' + (classe ? ' ' + classe : ''), role: 'group' });
    voci.forEach(v => aggiungi(s, [h('button', Object.assign({
      type: 'button', class: String(v[0]) === String(scelto) ? 'scelto' : '', 'aria-pressed': String(v[0]) === String(scelto) ? 'true' : 'false',
      onclick: () => onscelta(v[0]),
    }, v[2] || {}), v[1])]));
    return s;
  }

  function cerca(valore, segnaposto, oninput) {
    const input = h('input', { type: 'search', 'aria-label': 'Cerca', placeholder: segnaposto, value: valore, oninput: e => oninput(e.target.value) });
    return h('label', { class: 'cerca' }, icona('cerca', 18), input);
  }

  // ======================================================================= dati

  function normalizzaAna(ana) {
    return { clienti: ana.clienti || [], commesse: ana.commesse || [], gruppi: ana.gruppi || [], impostazioni: ana.impostazioni || {} };
  }

  async function carica(silenzioso) {
    if (S.esempio) return;
    const st = await Api.get('/locale/stato').catch(() => ({ configurato: false }));
    S.configurato = !!st.configurato;
    S.cartellaPdf = st.cartellaPdf;
    S.versione = st.versione;
    S.aggiornamento = st.aggiornamento || null;
    mostraAggiornamento();
    // La prima apertura dopo che si è installato da solo: dove ritrovarlo.
    if (st.appenaInstallato && !S.dettoInstallato) {
      S.dettoInstallato = true;
      avviso('Wisper Ufficio è installato: lo trovi in Start e sul Desktop. Il file scaricato si può cancellare.', false, 10000);
    }
    if (!S.configurato) {
      S.caricato = false;
      if (location.hash !== '#impostazioni') location.hash = '#impostazioni';
      aggiornaStatoFoglio();
      mostra();
      return;
    }
    S.erroreLettura = '';
    const fatto = await lavora(silenzioso ? 'Rileggo il foglio' : 'Leggo il foglio', async () => {
      try {
        const [ana, rap] = await Promise.all([Api.get('/foglio/anagrafiche'), Api.get('/foglio/rapportini')]);
        S.ana = normalizzaAna(ana);
        S.rapportini = rap.rapportini || [];
        S.caricato = true;
        S.ultimaLettura = new Date();
        return true;
      } catch (e) {
        S.erroreLettura = e.message || String(e);
        throw e;
      }
    });
    aggiornaStatoFoglio();
    if (silenzioso) ridisegna(); else mostra();
    if (fatto && !S.esempio && !visitaVista()) setTimeout(iniziaVisita, 400);
  }

  async function ricaricaAnagrafiche() {
    S.ana = normalizzaAna(await Rete.get('/foglio/anagrafiche'));
  }

  /** Mette (o rimette) nell'elenco i rapportini che il foglio ha appena restituito. */
  function accogli(lista) {
    (lista || []).forEach(r => {
      if (!r) return;
      const i = S.rapportini.findIndex(x => (r.idLocale && x.idLocale === r.idLocale) || (r.id && x.id === r.id));
      if (r.stato === 'ANNULLATO') { if (i >= 0) S.rapportini.splice(i, 1); return; }
      if (i >= 0) S.rapportini[i] = r; else S.rapportini.unshift(r);
    });
  }

  const cliente = id => S.ana.clienti.find(c => c.id === id);
  const commessa = id => S.ana.commesse.find(m => m.id === id);
  const gruppo = nome => S.ana.gruppi.find(g => C.normalizza(g.nome) === C.normalizza(nome));
  const trova = chiave => S.rapportini.find(x => x.id === chiave || x.idLocale === chiave);
  const attivi = () => S.rapportini.filter(r => r.stato !== 'ANNULLATO');
  const somma = lista => C.totali(lista).totale;
  const nRapportini = n => n === 1 ? '1 rapportino' : n + ' rapportini';
  const meseMinuscolo = m => C.nomeMese(m).split(' ')[0].toLowerCase();
  const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const giornoSett = iso => GIORNI[new Date(iso + 'T12:00:00').getDay()];
  const dataBreve = iso => C.data(iso).slice(0, 5);
  const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GIORNI_LUNGHI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const dataLunga = iso => { const d = new Date(iso + 'T12:00:00'); return GIORNI_LUNGHI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI_LUNGHI[d.getMonth()]; };

  /**
   * Chi paga un rapportino, cioè a chi si fattura. I clienti di un gruppo a
   * tariffa fissa come Elettrodinamica si fatturano al gruppo; gli altri a sé
   * stessi. È lo stesso raggruppamento del telefono.
   */
  function chiPaga(r) {
    const g = gruppo(r.gruppo);
    if (g && g.tariffaFissa !== null && g.tariffaFissa !== undefined) {
      return { chiave: 'g:' + C.normalizza(g.nome), nome: g.nome, email: g.email || '', righe: [g.email], perGruppo: true };
    }
    const c = cliente(r.idCliente) || { nome: r.cliente };
    return {
      chiave: 'c:' + (r.idCliente || C.normalizza(r.cliente)), nome: c.nome, email: c.email || '',
      righe: [c.indirizzo, c.partitaIva ? 'P.IVA ' + c.partitaIva : '', c.email], perGruppo: false,
    };
  }

  function perChiPaga(lista) {
    const gruppi = new Map();
    lista.forEach(r => {
      const chi = chiPaga(r);
      if (!gruppi.has(chi.chiave)) gruppi.set(chi.chiave, Object.assign(chi, { lista: [] }));
      gruppi.get(chi.chiave).lista.push(r);
    });
    return Array.from(gruppi.values()).sort((a, b) => somma(b.lista) - somma(a.lista));
  }

  function intestatarioRiepilogo(lista) {
    const gruppi = perChiPaga(lista);
    if (gruppi.length === 1) return { nome: gruppi[0].nome, righe: gruppi[0].righe, email: gruppi[0].email, mostraCliente: gruppi[0].perGruppo };
    return { nome: 'Vari clienti', righe: [], email: '', mostraCliente: true };
  }

  function periodoDi(lista) {
    const mesi = Array.from(new Set(lista.map(r => String(r.data).slice(0, 7)))).sort();
    if (!mesi.length) return '';
    if (mesi.length === 1) return C.nomeMese(mesi[0]);
    return C.nomeMese(mesi[0]) + ' – ' + C.nomeMese(mesi[mesi.length - 1]);
  }

  // ======================================================================= navigazione

  function sezione() {
    const h0 = (location.hash || '#finemese').slice(1);
    return h0 || 'finemese';
  }

  window.addEventListener('hashchange', () => {
    mostra();
    if (sezione() === 'rapportini') Visita.azione('nav-rapportini');
  });

  /** Cambio di pagina: si chiude il pannello e si ridisegna da capo. */
  function mostra() {
    chiudiPannello(true);
    disegnaPagina(true);
    $('#principale').scrollTop = 0;
  }

  /** Dopo un'azione: la stessa pagina coi dati nuovi, il pannello resta aperto. */
  function ridisegna() {
    const scorri = $('#principale').scrollTop;
    disegnaPagina();
    $('#principale').scrollTop = scorri;
    if (S.aperto) disegnaPannello();
  }

  function disegnaPagina(entra) {
    const [nome, arg] = sezione().split('/');
    document.querySelectorAll('.lato a').forEach(a => a.classList.toggle('attivo', a.dataset.sezione === nome));
    chiudiMenu();
    const main = svuota($('#principale'));
    const pagina = h('div', { class: 'pagina' + (entra ? ' entra' : '') });
    aggiungi(main, [pagina]);
    if (!S.configurato && nome !== 'impostazioni') {
      aggiungi(pagina, [h('p', { class: 'vuoto' }, 'Prima collega il foglio da Impostazioni.')]);
      return;
    }
    if (S.configurato && !S.caricato && nome !== 'impostazioni') {
      aggiungi(pagina, [h('div', { class: 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Il foglio non risponde' + (S.erroreLettura ? ': ' + S.erroreLettura : '') + '.'),
        h('button', { type: 'button', class: 'btn piccolo', onclick: () => carica() }, 'Riprova'))]);
      return;
    }
    if (nome === 'commesse' && arg) vistaCommessa(pagina, decodeURIComponent(arg));
    else if (nome === 'commesse') vistaCommesse(pagina);
    else if (nome === 'clienti') vistaClienti(pagina);
    else if (nome === 'impostazioni') vistaImpostazioni(pagina);
    else if (nome === 'rapportini') vistaRapportini(pagina);
    else vistaFineMese(pagina);
  }

  function aggiornaStatoFoglio() {
    const b = svuota($('#stato-foglio'));
    b.classList.remove('male');
    if (S.esempio) { aggiungi(b, [h('span', null, 'Dati di esempio')]); return; }
    if (!S.configurato) { aggiungi(b, [h('span', null, 'Foglio non collegato')]); return; }
    if (S.erroreLettura || !S.caricato) {
      b.classList.add('male');
      aggiungi(b, [icona('avviso', 16), h('span', null, 'Foglio non raggiunto'), h('span', { class: 'riprova' }, 'Riprova')]);
      return;
    }
    const ora = S.ultimaLettura ? S.ultimaLettura.toTimeString().slice(0, 5) : '';
    const spunta = icona('spunta', 16, 2.8);
    spunta.style.stroke = 'var(--firmato)';
    aggiungi(b, [spunta, h('span', null, 'Foglio letto alle ' + ora)]);
  }
  $('#stato-foglio').addEventListener('click', () => { if (!S.esempio) carica(true); });

  // ======================================================================= aggiornamenti

  /**
   * Il programma controlla da solo ogni ora se c'è una versione nuova, la scarica
   * e la mette al suo posto. Qui si mostra soltanto: un riquadro tranquillo nella
   * barra laterale, "Riavvia" per aprirla subito, altrimenti parte alla prossima apertura.
   */
  function mostraAggiornamento() {
    const a = S.aggiornamento;
    const zona = svuota($('#aggiornamento'));
    const pronto = a && a.stato === 'pronto';
    zona.classList.toggle('nascosto', !pronto);
    if (!pronto) return;
    aggiungi(zona, [h('b', null, 'Versione ' + a.nuova + ' pronta'), h('span', null, 'Parte alla prossima apertura, o subito:'),
      h('button', { type: 'button', class: 'btn giallo', onclick: riavvia }, 'Riavvia Wisper Ufficio')]);
  }

  async function riavvia() {
    await lavora('Riapro Wisper Ufficio', () => Api.post('/locale/riavvia'));
  }

  async function cercaAggiornamenti() {
    const ris = await lavora('Cerco aggiornamenti', () => Api.post('/locale/aggiorna'));
    if (!ris) return;
    S.aggiornamento = ris.aggiornamento || S.aggiornamento;
    mostraAggiornamento();
    if (S.aggiornamento) avviso(S.aggiornamento.stato === 'errore' ? S.aggiornamento.messaggio : (S.aggiornamento.messaggio || 'Hai l’ultima versione'), S.aggiornamento.stato === 'errore');
    if (sezione() === 'impostazioni') ridisegna();
  }

  // Il programma lo dice da solo quando la versione nuova è pronta.
  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', e => {
      const m = e.data || {};
      if (m.tipo !== 'aggiornamento') return;
      S.aggiornamento = Object.assign({}, S.aggiornamento || {}, { stato: 'pronto', nuova: m.versione });
      mostraAggiornamento();
      avviso('È pronta la versione ' + m.versione + ' di Wisper Ufficio');
    });
  }

  // ======================================================================= FINE MESE

  function vistaFineMese(pagina) {
    const mese = S.mese;
    const delMese = attivi().filter(r => String(r.data).slice(0, 7) === mese);
    const t = C.totali(delMese);
    const daFatturare = delMese.filter(r => r.stato === 'FIRMATO' || r.stato === 'INVIATO');
    const bozze = delMese.filter(r => r.stato === 'BOZZA');
    const fatturati = delMese.filter(r => r.stato === 'FATTURATO');
    const spostaMese = d => {
      const [a, m] = mese.split('-').map(Number);
      const x = new Date(a, m - 1 + d, 1);
      S.mese = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0');
      disegnaPagina();
    };

    aggiungi(pagina, [h('div', { class: 'testata' },
      h('div', { class: 'titoli' }, h('h1', null, C.nomeMese(mese)),
        h('span', { class: 'sotto-titolo' }, nRapportini(t.n) + ' · ' + C.numero(t.ore) + ' ore · ' + C.numero(t.km) + ' km')),
      tondo('indietro', 'Mese prima', () => spostaMese(-1)),
      tondo('avanti', 'Mese dopo', () => spostaMese(1)),
      h('button', { type: 'button', class: 'btn', onclick: () => moduloRapportino(null) }, 'Nuovo rapportino'))]);

    const clientiDi = lista => Array.from(new Set(lista.map(r => r.cliente))).join(', ');
    aggiungi(pagina, [h('div', { class: 'tre-colonne' },
      riquadro('Da fatturare', C.euro(somma(daFatturare)), daFatturare.length ? nRapportini(daFatturare.length) + (daFatturare.length === 1 ? ' firmato o inviato' : ' firmati o inviati') : 'niente in attesa', { 'data-visita': 'da-fatturare' }),
      riquadro('Da far firmare', C.euro(somma(bozze)), bozze.length ? nRapportini(bozze.length) + ' di ' + clientiDi(bozze) : 'nessuno'),
      riquadro('Fatturato', C.euro(somma(fatturati)), mese === meseDiOggi() ? 'questo mese' : 'a ' + meseMinuscolo(mese)))]);

    // Da fatturare: una scheda per chi paga.
    const sez = h('div', { class: 'sezione' }, h('h2', null, 'Da fatturare'));
    const gruppi = perChiPaga(daFatturare);
    if (!gruppi.length) {
      const spunta = icona('spunta', 20, 2.8);
      aggiungi(sez, [h('div', { class: 'calmo' }, spunta, 'Niente da fatturare a ' + meseMinuscolo(mese))]);
    }
    gruppi.forEach((g, i) => aggiungi(sez, [schedaChiPaga(g, i === 0)]));
    const prima = attivi().filter(r => (r.stato === 'FIRMATO' || r.stato === 'INVIATO') && String(r.data).slice(0, 7) < mese);
    if (prima.length) {
      const ultimoMese = prima.map(r => String(r.data).slice(0, 7)).sort().reverse()[0];
      aggiungi(sez, [h('div', { class: 'secondario' }, 'Restano da fatturare anche ' + nRapportini(prima.length) + ' dei mesi prima. ',
        h('button', { type: 'button', class: 'btn collegamento', onclick: () => { S.mese = ultimoMese; disegnaPagina(); } }, 'Vai a ' + meseMinuscolo(ultimoMese)))]);
    }
    aggiungi(pagina, [sez]);

    // Da far firmare e commesse da guardare.
    const firmare = h('div', { class: 'sezione' }, h('h2', null, 'Da far firmare'));
    if (bozze.length) {
      aggiungi(firmare, [h('div', { class: 'scheda stretta righe' }, C.ordina(bozze, 'data', -1).slice(0, 6).map(r =>
        h('div', { class: 'riga-el', role: 'button', tabindex: '0', onclick: () => apriPannello(r.id || r.idLocale), onkeydown: e => { if (e.key === 'Enter') apriPannello(r.id || r.idLocale); } },
          h('span', { class: 'giorno' }, h('b', null, String(Number(String(r.data).slice(8, 10)))), h('span', null, giornoSett(r.data))),
          h('span', { class: 'testi' }, h('span', { class: 'titolo' }, r.cliente), h('span', { class: 'sotto' }, [r.descrizione || r.commessa, C.ore(r.oreTotali)].filter(Boolean).join(' · '))),
          h('span', { class: 'valore' }, C.euro(r.totale)))))]);
      if (bozze.length > 6) aggiungi(firmare, [h('button', { type: 'button', class: 'btn collegamento', onclick: () => vaiARapportini({ mese, quali: 'firmare' }) }, 'Vedi tutti i ' + bozze.length)]);
    } else {
      aggiungi(firmare, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Tutti firmati')]);
    }

    const guardare = h('div', { class: 'sezione' }, h('h2', null, 'Commesse da guardare'));
    const daGuardare = S.ana.commesse.filter(m => m.stato === 'APERTA').map(m => ({ m, k: C.cruscotto(m, S.rapportini, S.ana.impostazioni) }))
      .filter(x => x.k.livelloOre === 'attenzione' || x.k.livelloOre === 'sforato' || (x.k.giorniMancanti !== null && x.k.giorniMancanti < 0));
    if (daGuardare.length) {
      aggiungi(guardare, [h('div', { class: 'scheda stretta' }, daGuardare.map(({ m, k }) => {
        const scaduta = k.giorniMancanti !== null && k.giorniMancanti < 0;
        const etichetta = k.livelloOre === 'sforato' ? ['Oltre il budget', 'pericolo'] : k.livelloOre === 'attenzione' ? ['Vicina al budget', 'avviso'] : ['Scaduta', 'pericolo'];
        return h('div', { class: 'guarda', role: 'button', tabindex: '0', onclick: () => { location.hash = '#commesse/' + encodeURIComponent(m.id); } },
          h('div', { class: 'alto' }, h('span', { class: 'codice' }, m.id), h('b', null, m.descrizione), h('span', { class: 'stato ' + etichetta[1] }, etichetta[0])),
          k.budgetOre ? h('div', { class: 'barra' }, h('i', { class: k.livelloOre, style: { width: Math.min(100, Math.round(k.percOre * 100)) + '%' } })) : null,
          h('div', { class: 'basso' },
            h('span', null, k.budgetOre ? C.numero(k.ore) + ' di ' + C.numero(k.budgetOre) + ' ore' : (scaduta ? 'Fine prevista il ' + C.data(m.finePrevista) : C.numero(k.ore) + ' ore')),
            k.costo.lavoroNoto ? h('span', null, 'Margine ' + C.euro(k.margine) + (k.percMargine !== null ? ' · ' + Math.round(k.percMargine * 100) + '%' : '')) : null));
      }))]);
    } else {
      aggiungi(guardare, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Nessuna commessa vicina al budget')]);
    }
    aggiungi(pagina, [h('div', { class: 'due-colonne' }, firmare, guardare)]);
  }

  function riquadro(che, quanto, nota, attr, negativo) {
    return h('div', Object.assign({ class: 'riquadro' + (negativo ? ' negativo' : '') }, attr || {}),
      h('span', { class: 'che' }, che), h('span', { class: 'quanto' }, quanto), nota ? h('span', { class: 'nota' }, nota) : null);
  }

  function schedaChiPaga(g, prima) {
    const t = C.totali(g.lista);
    const clienti = Array.from(new Set(g.lista.map(r => r.cliente)));
    const tuttiInviati = g.lista.every(r => r.stato === 'INVIATO');
    const quando = g.lista.map(r => r.inviatoIl).filter(Boolean).sort().reverse()[0];
    const azioni = h('div', { class: 'azioni' },
      h('button', { type: 'button', class: 'btn grande', onclick: () => vaiARapportini({ mese: S.mese, quali: 'fatturare', chi: g.chiave }) }, 'Vedi rapportini'),
      tuttiInviati
        ? h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': prima ? 'segna-fatturati' : null, onclick: async () => {
          const fatto = await cambiaStato(g.lista, 'FATTURATO');
          if (fatto) Visita.azione('segna-fatturati');
        } }, 'Segna fatturati')
        : h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': prima ? 'prepara-riepilogo' : null, onclick: () => {
          preparaInvio(g.lista);
          Visita.azione('prepara-riepilogo');
        } }, 'Prepara riepilogo'));
    let esito = null;
    if (tuttiInviati) {
      const spunta = icona('spunta', 16, 2.8);
      esito = h('span', { class: 'esito' }, spunta, 'Riepilogo inviato' + (g.email ? ' a ' + g.email : '') + (quando ? ' il ' + dataBreve(quando) : ''));
    }
    return h('div', { class: 'chi-paga' },
      iniziali(g.nome),
      h('div', { class: 'chi' }, h('b', null, g.nome),
        h('span', { class: 'secondario' }, nRapportini(t.n) + (g.perGruppo ? ' di ' + clienti.join(', ') : '') + ' · ' + C.ore(t.ore) + ' · ' + C.numero(t.km) + ' km'),
        esito),
      h('span', { class: 'quanto' }, C.euro(t.totale)),
      azioni);
  }

  function vaiARapportini(filtri) {
    S.filtri = Object.assign({ testo: '', mese: meseDiOggi(), quali: 'tutti', chi: '', cliente: '', commessa: '' }, filtri);
    S.scelti.clear();
    if (location.hash === '#rapportini') mostra(); else location.hash = '#rapportini';
  }

  // ======================================================================= RAPPORTINI

  function vistaRapportini(pagina) {
    const f = S.filtri;
    const mesi = Array.from(new Set(attivi().map(r => String(r.data).slice(0, 7)).concat([meseDiOggi()])))
      .filter(Boolean).sort().reverse();
    const area = h('div', { class: 'sezione' });

    const chip = (testo, togli) => h('span', { class: 'filtro-attivo' }, testo,
      h('button', { type: 'button', 'aria-label': 'Togli il filtro ' + testo, onclick: togli }, icona('chiudi', 14, 2.6)));
    const attiviFiltri = [];
    if (f.chi) {
      const g = perChiPaga(attivi()).find(x => x.chiave === f.chi);
      attiviFiltri.push(chip(g ? g.nome : 'Chi paga', () => { f.chi = ''; disegnaPagina(); }));
    }
    if (f.cliente) attiviFiltri.push(chip((cliente(f.cliente) || { nome: f.cliente }).nome, () => { f.cliente = ''; disegnaPagina(); }));
    if (f.commessa) attiviFiltri.push(chip(f.commessa, () => { f.commessa = ''; disegnaPagina(); }));

    aggiungi(pagina, [
      h('div', { class: 'testata' }, h('h1', { class: 'spazio' }, 'Rapportini'),
        h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloRapportino(null) }, 'Nuovo rapportino')),
      h('div', { class: 'filtri' },
        cerca(f.testo, 'Cliente, commessa, lavoro, numero', v => { f.testo = v; S.scelti.clear(); elencoRapportini(area); }),
        selezione([['', 'Tutti i mesi']].concat(mesi.map(m => [m, C.nomeMese(m)])), f.mese, v => { f.mese = v; S.scelti.clear(); elencoRapportini(area); }),
        segmenti([['tutti', 'Tutti'], ['fatturare', 'Da fatturare'], ['firmare', 'Da firmare', { 'data-visita': 'segmento-firmare' }]], f.quali, v => {
          f.quali = v;
          S.scelti.clear();
          disegnaPagina();
          if (v === 'firmare') Visita.azione('segmento-firmare');
        }),
        attiviFiltri),
      area]);
    elencoRapportini(area);
  }

  function filtrati() {
    const f = S.filtri;
    const stato0 = f.quali === 'fatturare' ? 'dafatturare' : f.quali === 'firmare' ? 'BOZZA' : '';
    let lista = C.filtra(S.rapportini, { testo: f.testo, mese: f.mese, cliente: f.cliente, commessa: f.commessa, stato: stato0 });
    if (f.chi) lista = lista.filter(r => chiPaga(r).chiave === f.chi);
    return C.ordina(lista, 'data', -1);
  }

  function elencoRapportini(area) {
    svuota(area);
    const lista = filtrati();
    if (!lista.length) {
      aggiungi(area, [h('p', { class: 'vuoto' }, S.rapportini.length ? 'Nessun rapportino con questi filtri.' : 'Ancora nessun rapportino.')]);
      return;
    }
    let primaRiga = true;
    perChiPaga(lista).sort((a, b) => a.nome.localeCompare(b.nome, 'it')).forEach(g => {
      const t = C.totali(g.lista);
      const daFatturare = g.lista.filter(r => r.stato === 'FIRMATO' || r.stato === 'INVIATO');
      const intesta = h('div', { class: 'intesta' }, h('b', null, g.nome),
        h('span', { class: 'riassunto' }, nRapportini(t.n) + ' · ' + C.ore(t.ore) + ' · ' + C.numero(t.km) + ' km'),
        h('span', { class: 'totale' }, C.euro(t.totale)),
        daFatturare.length ? h('button', { type: 'button', class: 'btn piccolo', onclick: () => preparaInvio(daFatturare) }, 'Prepara riepilogo') : null);
      const tab = h('div', { class: 'tab' + (S.scelti.size ? ' con-scelti' : '') },
        h('div', { class: 'r testa colonne-rap' }, h('span'), h('span', null, 'Data · N°'), h('span', null, 'Commessa'),
          h('span', null, 'Lavoro svolto'), h('span', { class: 'n' }, 'Ore'), h('span', { class: 'n' }, 'Km'), h('span', { class: 'n' }, 'Spese'),
          h('span', { class: 'n' }, 'Totale'), h('span', null, 'Stato')));
      g.lista.forEach(r => {
        const chiave = r.id || r.idLocale;
        const casella = h('input', { type: 'checkbox', class: 'casella', 'aria-label': 'Scegli ' + (r.id || 'il rapportino'), checked: S.scelti.has(chiave),
          onclick: e => { e.stopPropagation(); if (e.target.checked) S.scelti.add(chiave); else S.scelti.delete(chiave); elencoRapportini(area); } });
        const sotto = g.perGruppo ? [r.cliente, r.idCommessa].filter(Boolean).join(' · ') : r.idCommessa;
        aggiungi(tab, [h('div', {
          class: 'r colonne-rap cliccabile' + (S.aperto === chiave ? ' scelta' : ''), role: 'button', tabindex: '0', 'data-chiave': chiave,
          'data-visita': primaRiga ? 'riga-rapportino' : null,
          onclick: () => { apriPannello(chiave); Visita.azione('riga-rapportino'); },
          onkeydown: e => { if (e.key === 'Enter') apriPannello(chiave); },
        },
        h('span', null, casella),
        // La data e sotto il numero: una colonna in meno, più spazio a commessa e lavoro.
        h('span', { class: 'doppia' }, h('span', { class: 'forte' }, dataBreve(r.data)), h('span', { class: 'num' }, r.id || 'in arrivo')),
        h('span', { class: 'doppia' }, h('span', null, r.commessa || 'Senza commessa'), sotto ? h('span', null, sotto) : null),
        h('span', { class: 'taglia t2', title: r.descrizione }, r.descrizione),
        h('span', { class: 'n' }, C.numero(r.oreTotali)),
        h('span', { class: 'n' }, C.numero(r.km)),
        h('span', { class: 'n t2' }, C.num(r.spese) ? C.euro(r.spese) : ''),
        h('span', { class: 'n forte' }, C.euro(r.totale)),
        h('span', null, stato(r.stato)))]);
        primaRiga = false;
      });
      aggiungi(area, [h('div', { class: 'gruppo-tab' }, intesta, tab)]);
    });
    const t = C.totali(lista);
    aggiungi(area, [h('div', { class: 'totali-fondo' }, h('span', null, C.ore(t.ore)), h('span', null, C.numero(t.km) + ' km'), h('b', null, 'Totale ' + C.euro(t.totale)))]);

    if (S.scelti.size) {
      const sel = lista.filter(r => S.scelti.has(r.id || r.idLocale));
      aggiungi(area, [h('div', { class: 'barra-scelti' },
        h('b', null, (sel.length === 1 ? '1 scelto' : sel.length + ' scelti') + ' · ' + C.euro(somma(sel))),
        h('button', { type: 'button', class: 'btn piccolo', onclick: () => preparaInvio(sel) }, 'Riepilogo'),
        // I fatturati restano fatturati: "inviato" viene prima.
        h('button', { type: 'button', class: 'btn piccolo', onclick: () => cambiaStato(sel.filter(r => r.stato !== 'FATTURATO'), 'INVIATO') }, 'Segna inviati'),
        h('button', { type: 'button', class: 'btn piccolo', onclick: () => cambiaStato(sel, 'FATTURATO') }, 'Segna fatturati'),
        h('button', { type: 'button', class: 'btn piccolo', onclick: () => { S.scelti.clear(); elencoRapportini(area); } }, 'Deseleziona'))]);
    }
  }

  // ----------------------------------------------------------------------- pannello

  function apriPannello(chiave) {
    S.aperto = chiave;
    disegnaPannello();
    document.querySelectorAll('.tab .r[data-chiave]').forEach(x => x.classList.toggle('scelta', x.dataset.chiave === chiave));
  }

  function chiudiPannello(subito) {
    const p = $('.pannello');
    S.aperto = null;
    document.querySelectorAll('.tab .r.scelta').forEach(x => x.classList.remove('scelta'));
    if (!p) return;
    if (subito) { p.remove(); return; }
    p.classList.add('via');
    setTimeout(() => p.remove(), 200);
  }

  function passi(st) {
    const tutti = ['BOZZA', 'FIRMATO', 'INVIATO', 'FATTURATO'];
    const nomi = ['Da firmare', 'Firmato', 'Inviato', 'Fatturato'];
    const i = Math.max(0, tutti.indexOf(st));
    return h('div', { class: 'passi', 'aria-label': 'A che punto è' },
      nomi.map((n, k) => h('span', { class: (k <= i ? 'fatto' : '') + (k === i ? ' ora' : '') }, h('i'), h('em', null, n))));
  }

  function rigaConto(sinistra, destra) {
    return h('div', { class: 'rc' }, h('span', null, sinistra), h('span', null, destra));
  }

  function righeDelConto(r, regole) {
    const pagaViaggio = regole ? regole.pagaViaggio : r.pagaViaggio;
    const kmRimborsati = regole ? regole.kmRimborsati : r.kmRimborsati;
    const euroKm = regole ? regole.euroKm : r.euroKm;
    const orePagate = C.num(r.oreLavoro) + (pagaViaggio ? C.num(r.oreViaggio) : 0);
    let ore = C.ore(orePagate) + ' × ' + C.numero(r.tariffa) + ' €';
    if (C.num(r.oreExtra) > 0) ore = C.ore(orePagate) + ' + ' + C.ore(r.oreExtra) + ' extra × ' + C.numero(r.tariffa) + ' €';
    if (!pagaViaggio && C.num(r.oreViaggio) > 0) ore += ' (viaggio non pagato)';
    return [
      rigaConto(ore, C.euro(r.compensoOre)),
      rigaConto(kmRimborsati ? C.numero(r.km) + ' km × ' + C.numero(euroKm) + ' €' : 'Km non rimborsati', C.euro(r.rimborsoKm)),
      C.num(r.spese) > 0 ? rigaConto('Spese' + (r.noteSpese ? ' · ' + r.noteSpese : ''), C.euro(r.spese)) : null,
    ];
  }

  function disegnaPannello() {
    const r = trova(S.aperto);
    const vecchio = $('.pannello');
    if (!r) { if (vecchio) vecchio.remove(); S.aperto = null; return; }
    const bloccato = ['FIRMATO', 'INVIATO', 'FATTURATO'].indexOf(r.stato) >= 0;
    const commessaLunga = r.idCommessa ? r.idCommessa + ' ' + (r.commessa || '') : (r.commessa || 'Senza commessa');

    const corpo = h('div', { class: 'corpo' },
      h('div', { class: 'alto' }, h('span', { class: 'numero' }, r.id || 'Rapportino'), stato(r.stato, true), tondo('chiudi', 'Chiudi', () => chiudiPannello(), 'piccolo')),
      passi(r.stato),
      h('div', null, h('div', { style: { fontSize: '18px', fontWeight: '800' } }, r.cliente),
        h('div', { class: 't2', style: { fontSize: '15px', color: 'var(--testo2)' } }, commessaLunga + ' · ' + dataLunga(r.data))),
      h('div', { class: 'lavoro' }, r.descrizione || '—'),
      h('div', { class: 'tre-dati' },
        h('span', null, h('em', null, 'Ore'), h('b', null, C.ore(r.oreTotali))),
        h('span', null, h('em', null, 'Km'), h('b', null, C.numero(r.km) + ' km')),
        h('span', null, h('em', null, 'Spese'), h('b', null, C.num(r.spese) ? C.euro(r.spese) : '—'))),
      h('div', { class: 'conto' }, righeDelConto(r),
        h('div', { class: 'tot' }, h('span', null, 'Totale'), h('span', null, C.euro(r.totale)))),
      r.firma ? h('div', { class: 'firma-box' }, h('img', { src: '/file/' + r.firma.id, alt: 'Firma del cliente' }),
        h('div', null, h('b', null, r.firmatario || 'Firmato'), h('span', { class: 'tenue' }, r.firmatoIl ? 'firmato il ' + C.dataOra(r.firmatoIl).replace(' ', ' alle ') : 'firmato'))) : null,
      (r.foto || []).length ? h('div', null, h('div', { class: 'etichetta', style: { marginBottom: '8px' } }, 'Scontrini'),
        h('div', { class: 'miniature' }, r.foto.map(f => h('a', { href: f.url, target: '_blank', title: 'Apri lo scontrino' }, h('img', { src: '/file/' + f.id, alt: 'Scontrino' }))))) : null,
      r.luogo ? h('div', null, h('div', { class: 'etichetta' }, 'Luogo'), h('div', null, r.luogo)) : null,
      r.noteInterne ? h('div', null, h('div', { class: 'etichetta' }, 'Nota per te'), h('div', { class: 't2' }, r.noteInterne)) : null);

    const pdf = giallo => h('button', { type: 'button', class: 'btn grande' + (giallo ? ' giallo' : ''), 'data-visita': giallo ? 'azione-gialla' : null, onclick: () => pdfRapportino(r, { apri: true }) }, 'PDF');
    const voci = [
      bloccato ? null : (r.stato !== 'BOZZA' ? { testo: 'Modifica', fn: () => moduloRapportino(r) } : null),
      r.stato === 'BOZZA' || r.stato === 'INVIATO' ? { testo: r.stato === 'INVIATO' ? 'Invia di nuovo al cliente' : 'Invia al cliente', fn: () => preparaInvio([r], true) } : null,
      r.stato === 'BOZZA' ? { testo: 'Carica il foglio firmato', fn: () => caricaFirmato(r) } : null,
      { testo: 'Aggiungi uno scontrino', fn: () => aggiungiFoto(r) },
      r.stato === 'BOZZA' || r.stato === 'FIRMATO' ? { testo: 'Segna inviato senza email', fn: () => cambiaStato([r], 'INVIATO') } : null,
      r.stato === 'BOZZA' || r.stato === 'FIRMATO' ? { testo: 'Segna fatturato', fn: () => cambiaStato([r], 'FATTURATO') } : null,
      r.stato === 'FATTURATO' ? { testo: 'Non ancora fatturato', fn: () => cambiaStato([r], 'INVIATO') } : null,
      bloccato ? { testo: 'Riporta in bozza', fn: () => riportaInBozza(r) } : null,
      r.stato === 'BOZZA' ? '-' : null,
      r.stato === 'BOZZA' ? { testo: 'Elimina', fn: () => annulla(r), pericolo: true } : null,
    ];
    const altro = h('button', { type: 'button', class: 'btn grande', 'aria-label': 'Altre azioni', title: 'Altre azioni', style: { width: '52px', padding: '0' } }, icona('altro', 20));
    altro.addEventListener('click', () => apriMenu(altro, voci));
    // UN pulsante giallo: la cosa da fare adesso.
    const principale = {
      BOZZA: h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': 'azione-gialla', onclick: () => moduloRapportino(r) }, 'Modifica'),
      FIRMATO: h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': 'azione-gialla', onclick: () => preparaInvio([r], true) }, 'Invia al cliente'),
      INVIATO: h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': 'azione-gialla', onclick: () => cambiaStato([r], 'FATTURATO') }, 'Segna fatturato'),
    }[r.stato];
    const piede = h('div', { class: 'piede' }, principale ? [pdf(false), altro, principale] : [altro, pdf(true)]);

    const p = h('aside', { class: 'pannello', 'aria-label': 'Il rapportino ' + (r.id || '') }, corpo, piede);
    if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi($('#sovrapposti'), [p]);
  }

  async function cambiaStato(lista, st) {
    if (!lista.length) { avviso('Niente da cambiare', true); return false; }
    const ids = lista.map(r => r.id || r.idLocale);
    const fatto = await lavora('Aggiorno', async () => {
      const ris = await Rete.post('/foglio/stato', { ids, stato: st });
      accogli(ris.rapportini);
      return true;
    });
    if (fatto) {
      const nomi = { BOZZA: 'in bozza', INVIATO: 'inviato', FATTURATO: 'fatturato', ANNULLATO: 'eliminato' };
      const parola = nomi[st] || st.toLowerCase();
      avviso(ids.length === 1 ? (st === 'ANNULLATO' ? 'Rapportino eliminato' : 'Segnato ' + parola) : ids.length + ' rapportini segnati ' + parola.replace(/o$/, 'i'));
      S.scelti.clear();
      if (st === 'ANNULLATO') chiudiPannello();
      ridisegna();
    }
    return !!fatto;
  }

  async function riportaInBozza(r) {
    const ok = await conferma('Riportare in bozza?',
      r.firma ? 'La firma del cliente viene tolta: ha firmato il rapportino com\'era. Dopo la correzione va rifirmato.' : 'Il rapportino torna modificabile.',
      'Riporta in bozza');
    if (ok) cambiaStato([r], 'BOZZA');
  }

  async function annulla(r) {
    const ok = await conferma('Eliminare il rapportino?', 'Sul foglio resta, segnato come annullato: si recupera da lì.', 'Elimina', true);
    if (ok) cambiaStato([r], 'ANNULLATO');
  }

  async function aggiungiFoto(r) {
    const scelto = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
    if (!scelto || !scelto.ok) return;
    const fatto = await lavora('Carico lo scontrino', async () => {
      const ris = await Rete.post('/foglio/caricaFile', {
        tipo: 'spesa', id: r.id, idLocale: r.idLocale, idFile: 'pc' + Date.now().toString(36), mime: scelto.mime, base64: scelto.base64,
      });
      r.foto = (r.foto || []).concat([ris.file]);
      return true;
    });
    if (fatto) { avviso('Scontrino aggiunto'); ridisegna(); }
  }

  /** La scansione di un rapportino firmato a mano: vale come firma. */
  function caricaFirmato(r) {
    const nome = h('input', { type: 'text' });
    let chiudi;
    const vai = async () => {
      if (!nome.value.trim()) { nome.focus(); avviso('Scrivi il nome di chi ha firmato', true); return; }
      const scelto = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
      if (!scelto || !scelto.ok) return;
      const fatto = await lavora('Carico la firma', async () => {
        await Rete.post('/foglio/caricaFile', {
          tipo: 'firma', id: r.id, idLocale: r.idLocale, idFile: 'pc' + Date.now().toString(36),
          mime: scelto.mime, base64: scelto.base64, firmatario: nome.value.trim(),
        });
        const ris = await Rete.get('/foglio/rapportini?da=' + r.data + '&a=' + r.data);
        accogli(ris.rapportini);
        return true;
      });
      if (fatto) { chiudi(); avviso('Firma caricata: il rapportino è firmato'); ridisegna(); }
    };
    chiudi = finestra({
      titolo: 'Carica il foglio firmato',
      corpo: [h('p', { style: { margin: 0, fontSize: '16px' } }, 'La foto o la scansione del rapportino firmato a mano.'), campo('Nome di chi ha firmato', nome)],
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Scegli il file')],
    });
  }

  // ----------------------------------------------------------------------- PDF e invio

  function nomeFile(prefisso, testo) {
    return (prefisso + ' ' + testo).replace(/[\\/:*?"<>|]+/g, '-').trim();
  }

  async function pdfRapportino(r, opzioni) {
    const o = opzioni || {};
    if (S.esempio) { avviso('Nella visita il PDF non si crea'); return null; }
    const html = D.rapportino(r, S.ana, { conImporti: !!o.conImporti, conFoto: !!o.conFoto });
    const ris = await lavora('Preparo il PDF', () => Rete.post('/locale/pdf', {
      html, nome: nomeFile(r.id || 'Rapportino', r.cliente + ' ' + C.data(r.data).replace(/\//g, '-')), apri: !!o.apri, base64: !!o.base64,
    }));
    if (ris && o.apri) avviso('PDF salvato in ' + ris.percorso);
    return ris;
  }

  /**
   * Prepara riepilogo (e Invia al cliente per un rapportino solo): a sinistra la
   * pagina com'è, a destra a chi va e cosa contiene, poi Invia per email, Solo il
   * PDF o "Segna come inviato senza email" per quando il PDF lo si consegna in
   * altro modo. Gli importi ci sono nel riepilogo (serve per la fattura), non nel
   * rapportino singolo (al cliente di solito serve il lavoro, non il conto).
   */
  function preparaInvio(lista0, singolo) {
    const lista = C.ordina(lista0, 'data', 1);
    if (!lista.length) { avviso('Non c\'è niente da mettere nel riepilogo', true); return; }
    const r0 = singolo ? lista[0] : null;
    // Il rapportino singolo va al cliente (o, senza la sua email, a chi paga); il riepilogo a chi paga.
    const intest = r0
      ? { nome: r0.cliente, email: (cliente(r0.idCliente) || {}).email || chiPaga(r0).email, righe: [], mostraCliente: false }
      : intestatarioRiepilogo(lista);
    const periodo = periodoDi(lista);
    const imp = S.ana.impostazioni;
    const t = C.totali(lista);
    let chiudi;

    const conImporti = h('input', { type: 'checkbox', checked: !singolo });
    const conFoto = h('input', { type: 'checkbox' });
    const a = h('input', { type: 'email', value: intest.email || '', placeholder: 'email di ' + intest.nome });
    const cc = h('input', { type: 'text' });
    const oggetto = h('input', { type: 'text', value: r0 ? 'Rapportino ' + r0.id + ' del ' + C.data(r0.data) : 'Rapportini ' + periodo + (intest.nome !== 'Vari clienti' ? ' · ' + intest.nome : '') });
    const messaggio = h('textarea', { rows: 5 });
    messaggio.value = (r0
      ? 'Buongiorno,\nin allegato il rapportino del ' + C.data(r0.data) + '.'
      : 'Buongiorno,\nin allegato il riepilogo dei rapportini di ' + periodo.toLowerCase() + '.') +
      '\n\nCordiali saluti\n' + (imp.TECNICO || imp.RAGIONE_SOCIALE || '');
    const campoA = h('div', null, campo('A', a));
    const messaggioZona = h('div', { class: 'fila nascosto', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      campo('Oggetto', oggetto), campo('Copia anche a', cc), campo('Messaggio', messaggio));
    const cambiaMessaggio = h('button', { type: 'button', class: 'btn collegamento', style: { alignSelf: 'flex-start' }, onclick: () => { messaggioZona.classList.remove('nascosto'); cambiaMessaggio.remove(); oggetto.focus(); } }, 'Cambia il messaggio');

    // L'anteprima della pagina: com'è fatta, coi numeri veri.
    const foglioA4 = h('div', { class: 'foglio-a4', 'aria-hidden': 'true' });
    const disegnaAnteprima = () => {
      aggiungi(svuota(foglioA4), [
        h('div', { class: 'testa-a4' }, h('span', null, imp.RAGIONE_SOCIALE || 'Lo studio'), h('span', null, r0 ? r0.id : periodo)),
        h('div', { class: 'linea-a4' }),
        h('div', { class: 'parti-a4' }, h('span', null, imp.RAGIONE_SOCIALE || ''), h('span', null, intest.nome)),
        lista.slice(0, 10).map(r => h('div', { class: 'riga-a4' }, h('span', null, dataBreve(r.data) + '  ' + (r0 ? r.descrizione : (r.commessa || r.descrizione))),
          h('span', null, conImporti.checked ? C.euro(r.totale) : C.ore(r.oreTotali)))),
        lista.length > 10 ? h('div', { class: 'riga-a4' }, h('span', null, '… e altri ' + (lista.length - 10))) : null,
        conImporti.checked ? h('div', { class: 'tot-a4' }, C.euro(t.totale)) : h('div', { class: 'tot-a4' }, C.ore(t.ore))]);
    };
    conImporti.addEventListener('change', disegnaAnteprima);
    disegnaAnteprima();

    const creaPdf = async base64 => {
      const html = r0
        ? D.rapportino(r0, S.ana, { conImporti: conImporti.checked, conFoto: conFoto.checked })
        : D.riepilogo(lista, S.ana, intest, periodo, { conImporti: conImporti.checked, conFoto: conFoto.checked });
      const nome = r0 ? nomeFile(r0.id, r0.cliente) : nomeFile('Riepilogo', intest.nome + ' ' + periodo);
      return Rete.post('/locale/pdf', { html, nome, apri: !base64, base64: !!base64 });
    };

    async function manda(aMe) {
      if (!aMe && !a.value.trim()) {
        aggiungi(svuota(campoA), [campo('A', a, 'Manca l\'indirizzo: scrivilo qui (lo puoi salvare in Clienti)')]);
        a.focus();
        return;
      }
      const fatto = await lavora(aMe ? 'Mando la copia' : 'Mando l\'email', async () => {
        const pdf = await creaPdf(true);
        const ris = await Rete.post('/foglio/inviaEmail', {
          a: a.value.trim(), cc: cc.value.trim(), oggetto: oggetto.value, messaggio: messaggio.value,
          allegati: pdf && pdf.base64 ? [{ nome: pdf.nome, base64: pdf.base64, mime: 'application/pdf' }] : [],
          ids: lista.map(r => r.id), aMe: !!aMe,
        });
        accogli(ris.rapportini);
        return true;
      });
      if (!fatto) return;
      if (aMe) { avviso('Copia mandata alla tua casella'); return; }
      chiudi();
      avviso((r0 ? 'Rapportino' : 'Riepilogo') + ' inviato a ' + a.value.trim() + (S.esempio ? ' (esempio: non è partito niente)' : ''));
      ridisegna();
      Visita.azione('invia-email');
    }

    const altro = h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18));
    altro.addEventListener('click', () => apriMenu(altro, [{ testo: 'Mandane una copia a me', fn: () => manda(true) }]));
    const daSegnare = lista.filter(r => r.stato !== 'FATTURATO');

    const contenuto = h('div', { class: 'riepilogo-f' },
      h('div', { class: 'anteprima' }, foglioA4),
      h('div', { class: 'scelte' },
        h('div', { class: 'titolo-r' },
          h('div', null, h('span', { class: 'secondario' }, r0 ? 'Rapportino ' + r0.id : 'Riepilogo di ' + periodo.toLowerCase()),
            h('b', null, intest.nome + ' · ' + C.euro(t.totale))),
          altro, tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')),
        campoA,
        h('label', { class: 'spunta-campo' }, conImporti, 'Con gli importi'),
        h('label', { class: 'spunta-campo' }, conFoto, 'Con le foto degli scontrini'),
        cambiaMessaggio, messaggioZona,
        h('div', { class: 'bottoni' },
          h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn grande', onclick: async () => {
            if (S.esempio) { avviso('Nella visita il PDF non si crea'); return; }
            const ok = await lavora('Preparo il PDF', () => creaPdf(false));
            if (ok) { chiudi(); avviso('PDF salvato in ' + ok.percorso); }
          } }, 'Solo il PDF'),
          h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': 'invia-email', onclick: () => manda(false) }, 'Invia per email')),
        daSegnare.length ? h('button', { type: 'button', class: 'btn collegamento', style: { alignSelf: 'center' }, onclick: async () => {
          chiudi();
          await cambiaStato(daSegnare, 'INVIATO');
        } }, 'Segna come inviato senza email') : null));
    chiudi = finestra({ contenuto, larghezza: 'media', titolo: r0 ? 'Invia il rapportino' : 'Prepara il riepilogo', fuoco: false });
  }

  // ----------------------------------------------------------------------- modulo

  /** Le ultime coppie cliente-commessa usate: le schede da toccare per prime. */
  function recenti(quante) {
    const visti = new Set();
    const out = [];
    C.ordina(attivi(), 'data', -1).forEach(r => {
      const k = (r.idCliente || r.cliente) + '|' + (r.idCommessa || r.commessa);
      if (visti.has(k) || out.length >= quante || !r.cliente) return;
      visti.add(k);
      out.push(r);
    });
    return out;
  }

  function ultimiKm(idCommessa, idCliente, escludi) {
    const lista = C.ordina(attivi().filter(r => r.idLocale !== escludi && C.num(r.km) > 0), 'data', -1);
    const x = (idCommessa && lista.find(r => r.idCommessa === idCommessa)) || (idCliente && lista.find(r => r.idCliente === idCliente));
    return x ? C.num(x.km) : null;
  }

  /**
   * Il rapportino da compilare o correggere dal computer: la stessa sequenza
   * del telefono in una finestra larga. A sinistra per chi, ore e strada; a
   * destra il lavoro, le spese e il conto che si aggiorna mentre si scrive.
   */
  function moduloRapportino(esistente, predefiniti) {
    const p = predefiniti || {};
    const r = esistente ? Object.assign({}, esistente) : {
      idLocale: 'U-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      data: C.oggiIso(), tecnico: S.ana.impostazioni.TECNICO || '', idCliente: p.idCliente || '', cliente: '',
      idCommessa: p.idCommessa || '', commessa: '', oreLavoro: 0, oreExtra: 0, oreViaggio: 0, km: '', spese: '',
      tariffa: null, descrizione: '', luogo: '', ticket: '', noteSpese: '', noteInterne: '',
    };
    if (r.idCliente && !r.cliente) r.cliente = (cliente(r.idCliente) || {}).nome || '';
    if (r.idCommessa && !r.commessa) r.commessa = (commessa(r.idCommessa) || {}).descrizione || '';

    const m = {
      idCliente: r.idCliente, cliente: r.cliente, gruppoNuovo: '', idCommessa: r.idCommessa, commessa: r.commessa,
      sceltaFatta: !!r.cliente, commessaFatta: !!esistente || !!r.idCommessa,
      oreLavoro: C.num(r.oreLavoro), oreExtra: C.num(r.oreExtra), oreViaggio: C.num(r.oreViaggio),
      extraAperto: C.num(r.oreExtra) > 0, tariffaToccata: !!esistente, nuovoCliente: false,
    };
    let errori = {};

    const v = {
      data: h('input', { type: 'date', value: r.data }),
      ricerca: h('input', { type: 'search', placeholder: 'Scrivi il nome', 'aria-label': 'Cerca il cliente' }),
      nuovaCommessa: h('input', { type: 'text', placeholder: 'Come la chiami tu' }),
      km: h('input', { type: 'text', inputmode: 'decimal', value: r.km !== '' && r.km !== null && r.km !== undefined && (esistente || C.num(r.km)) ? C.numero(r.km) : '' }),
      tariffa: h('input', { type: 'text', inputmode: 'decimal', value: r.tariffa ? C.numero(r.tariffa) : '' }),
      descrizione: h('textarea', { rows: 5 }),
      spese: h('input', { type: 'text', inputmode: 'decimal', value: C.num(r.spese) ? C.numero(r.spese) : '' }),
      noteSpese: h('input', { type: 'text', value: r.noteSpese || '' }),
      luogo: h('input', { type: 'text', value: r.luogo || '' }),
      ticket: h('input', { type: 'text', value: r.ticket || '' }),
      noteInterne: h('textarea', { rows: 2 }),
    };
    v.descrizione.value = r.descrizione || '';
    v.noteInterne.value = r.noteInterne || '';

    const clienteScelto = () => (m.idCliente && cliente(m.idCliente)) || null;
    const regoleAttuali = () => C.regoleDi(clienteScelto() || { gruppo: m.gruppoNuovo || 'Privato' }, S.ana.gruppi, S.ana.impostazioni);

    const zonaPerChi = h('div', { class: 'fila', style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
    const zonaOre = h('div');
    const zonaKm = h('div', { class: 'fila', style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
    const zonaTariffa = h('div');
    const zonaConto = h('div', { class: 'conto-vivo' });
    const zonaAltro = h('div', { class: 'fila', style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    const campoDescrizione = h('div');
    let luogoAperto = !!r.luogo;
    let notaAperta = !!r.noteInterne;

    function scegliCliente(c, nuovo, gruppoNuovo) {
      m.idCliente = c ? c.id : '';
      m.cliente = c ? c.nome : nuovo;
      m.gruppoNuovo = c ? '' : gruppoNuovo;
      m.sceltaFatta = true;
      m.commessaFatta = false;
      m.idCommessa = '';
      m.commessa = '';
      delete errori.cliente;
      if (!m.tariffaToccata) {
        const proposta = C.tariffaProposta(c, S.rapportini);
        v.tariffa.value = proposta ? C.numero(proposta) : '';
      }
      disegnaPerChi();
      disegnaKm();
      disegnaTariffa();
      aggiornaConto();
    }

    function disegnaPerChi() {
      svuota(zonaPerChi);
      if (!m.sceltaFatta) {
        const rec = recenti(4);
        if (rec.length) {
          aggiungi(zonaPerChi, [h('div', { class: 'griglia-scelte' }, rec.map(x => h('button', {
            type: 'button', class: 'scelta-card', onclick: () => {
              const c = cliente(x.idCliente);
              scegliCliente(c, x.cliente, x.gruppo);
              m.idCommessa = x.idCommessa; m.commessa = x.commessa; m.commessaFatta = true;
              disegnaPerChi(); disegnaKm(); aggiornaConto();
            },
          }, iniziali(x.cliente, true), h('span', { class: 'testi' }, h('b', null, x.cliente), h('span', null, x.commessa || 'Senza commessa')))))]);
        }
        aggiungi(zonaPerChi, [h('label', { class: 'cerca' }, icona('cerca', 18), v.ricerca)]);
        const testo = v.ricerca.value.trim();
        if (testo) {
          const trovati = S.ana.clienti.filter(c => C.normalizza([c.nome].concat(c.alias || []).join(' ')).indexOf(C.normalizza(testo)) >= 0)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'it')).slice(0, 6);
          trovati.forEach(c => aggiungi(zonaPerChi, [h('button', { type: 'button', class: 'scelta-card', onclick: () => scegliCliente(c) },
            iniziali(c.nome, true), h('span', { class: 'testi' }, h('b', null, c.nome), h('span', null, c.gruppo)))]));
          if (!trovati.some(c => C.normalizza(c.nome) === C.normalizza(testo))) {
            if (!m.nuovoCliente) {
              aggiungi(zonaPerChi, [h('button', { type: 'button', class: 'pillola tratteggiata', style: { alignSelf: 'flex-start' }, onclick: () => { m.nuovoCliente = true; disegnaPerChi(); } }, '+ Cliente nuovo «' + testo + '»')]);
            } else {
              aggiungi(zonaPerChi, [h('div', { class: 'secondario' }, '«' + testo + '» è nuovo. Di che gruppo è?'),
                segmenti((S.ana.gruppi.length ? S.ana.gruppi : [{ nome: 'Privato' }]).map(g => [g.nome, g.nome]), '', g => scegliCliente(null, testo, g))]);
            }
          }
        }
        if (errori.cliente) aggiungi(zonaPerChi, [h('div', { class: 'campo' }, h('div', { class: 'errore' }, errori.cliente))]);
        return;
      }
      aggiungi(zonaPerChi, [h('div', { class: 'scelta-card scelta' }, iniziali(m.cliente, true),
        h('span', { class: 'testi' }, h('b', null, m.cliente), h('span', null, m.idCliente ? regoleAttuali().gruppo : 'Cliente nuovo · ' + m.gruppoNuovo)),
        h('button', { type: 'button', class: 'btn collegamento', onclick: () => { m.sceltaFatta = false; m.nuovoCliente = false; disegnaPerChi(); } }, 'Cambia'))]);
      const aperte = m.idCliente ? S.ana.commesse.filter(x => x.idCliente === m.idCliente && (x.stato === 'APERTA' || x.id === m.idCommessa)) : [];
      const pill = (testo, scelta, fn) => h('button', { type: 'button', class: 'pillola' + (scelta ? ' scelta' : ''), onclick: fn }, testo);
      aggiungi(zonaPerChi, [h('div', { class: 'etichetta' }, 'Commessa'),
        h('div', { class: 'pillole' },
          aperte.map(x => pill(x.id + ' · ' + x.descrizione, m.idCommessa === x.id, () => { m.idCommessa = x.id; m.commessa = x.descrizione; m.commessaFatta = true; disegnaPerChi(); disegnaKm(); })),
          m.commessa && !m.idCommessa ? pill(m.commessa + ' (nuova)', true, () => {}) : null,
          pill('Senza commessa', m.commessaFatta && !m.commessa, () => { m.idCommessa = ''; m.commessa = ''; m.commessaFatta = true; disegnaPerChi(); })),
        h('div', { style: { display: 'flex', gap: '8px' } }, h('div', { style: { flex: '1' } }, campo(null, v.nuovaCommessa)),
          h('button', { type: 'button', class: 'btn', onclick: () => {
            const n = v.nuovaCommessa.value.trim();
            if (!n) { v.nuovaCommessa.focus(); return; }
            m.idCommessa = ''; m.commessa = n; m.commessaFatta = true; v.nuovaCommessa.value = ''; disegnaPerChi();
          } }, 'Commessa nuova'))]);
    }

    function stepper(nome, chiave, sotto) {
      const valore = h('span', { class: 'valore' }, C.ore(m[chiave]));
      const cambia = d => { m[chiave] = Math.max(0, Math.round((m[chiave] + d) * 2) / 2); delete errori.oreLavoro; disegnaOre(); aggiornaConto(); };
      return h('div', { class: 'riga-stepper' },
        h('span', { class: 'nome' }, h('b', null, nome), sotto ? h('span', { class: 'piccolo' }, sotto) : null),
        h('span', { class: 'stepper' }, tondo('meno', 'Meno ' + nome.toLowerCase(), () => cambia(-0.5)), valore, tondo('piu', 'Più ' + nome.toLowerCase(), () => cambia(0.5))));
    }

    function disegnaOre() {
      const regole = regoleAttuali();
      aggiungi(svuota(zonaOre), [
        stepper('Lavoro', 'oreLavoro'),
        h('div', { class: 'pillole', style: { padding: '0 0 12px' } }, [4, 6, 8].map(n => h('button', {
          type: 'button', class: 'pillola' + (m.oreLavoro === n ? ' scelta' : ''), onclick: () => { m.oreLavoro = n; delete errori.oreLavoro; disegnaOre(); aggiornaConto(); },
        }, C.ore(n)))),
        stepper('Viaggio', 'oreViaggio', regole.pagaViaggio ? 'pagato' : 'non pagato'),
        m.extraAperto ? stepper('Extra', 'oreExtra', regole.maggExtra ? '+' + C.numero(regole.maggExtra) + '%' : null)
          : h('div', { style: { paddingTop: '10px' } }, h('button', { type: 'button', class: 'pillola tratteggiata', onclick: () => { m.extraAperto = true; disegnaOre(); } }, '+ Ore extra')),
        errori.oreLavoro ? h('div', { class: 'campo' }, h('div', { class: 'errore' }, errori.oreLavoro)) : null]);
    }

    function disegnaKm() {
      const ultimi = ultimiKm(m.idCommessa, m.idCliente, r.idLocale);
      aggiungi(svuota(zonaKm), [
        campo('Chilometri', conSuffisso(v.km, 'km'), errori.km),
        h('div', { class: 'pillole' },
          ultimi !== null ? h('button', { type: 'button', class: 'pillola', onclick: () => impostaKm(ultimi) }, 'Ultima volta · ' + C.numero(ultimi) + ' km') : null,
          h('button', { type: 'button', class: 'pillola', onclick: () => impostaKm(0) }, 'Senza auto'))]);
    }
    function impostaKm(n) { v.km.value = C.numero(n); if (errori.km) { delete errori.km; disegnaKm(); } aggiornaConto(); }

    function disegnaTariffa() {
      const regole = regoleAttuali();
      svuota(zonaTariffa);
      if (regole.tariffaFissa !== null) {
        aggiungi(zonaTariffa, [h('div', { class: 'riga-stepper' }, h('span', { class: 'nome' }, h('b', null, 'Tariffa fissa ' + regole.gruppo)),
          h('span', { style: { fontSize: '18px', fontWeight: '800' } }, C.numero(regole.tariffaFissa) + ' €/h'))]);
        return;
      }
      const c = clienteScelto();
      const proposta = C.tariffaProposta(c, S.rapportini);
      const nota = proposta && C.num(v.tariffa.value) === proposta ? 'l\'ultima usata per ' + (c ? c.nome : 'questo cliente')
        : proposta ? 'l\'ultima volta era ' + C.numero(proposta) + ' €/h' : 'prima volta per questo cliente';
      aggiungi(zonaTariffa, [h('div', { class: 'riga-stepper' }, h('span', { class: 'nome' }, h('b', null, 'Tariffa oraria'), h('span', { class: 'piccolo' }, nota)),
        h('div', { style: { width: '150px' } }, campo(null, conSuffisso(v.tariffa, '€/h'), errori.tariffa)))]);
    }

    function disegnaAltro() {
      const ticket = S.ana.impostazioni.TICKET_ATTIVO === 'SI' || r.ticket;
      aggiungi(svuota(zonaAltro), [
        h('div', { class: 'riga-campi' }, campo('Spese', conSuffisso(v.spese, '€'), errori.spese), campo('Di cosa', v.noteSpese)),
        (!luogoAperto || !notaAperta) ? h('div', { class: 'pillole' },
          !luogoAperto ? h('button', { type: 'button', class: 'pillola', onclick: () => { luogoAperto = true; disegnaAltro(); v.luogo.focus(); } }, '+ Luogo') : null,
          !notaAperta ? h('button', { type: 'button', class: 'pillola', onclick: () => { notaAperta = true; disegnaAltro(); v.noteInterne.focus(); } }, '+ Una nota per te') : null) : null,
        luogoAperto ? campo('Luogo', v.luogo) : null,
        ticket ? campo('Ticket', v.ticket) : null,
        notaAperta ? campo('Nota per te, non va al cliente', v.noteInterne) : null]);
    }

    function leggiModulo() {
      return {
        idLocale: r.idLocale,
        id: r.id || '',
        data: v.data.value,
        tecnico: r.tecnico || S.ana.impostazioni.TECNICO || '',
        idCliente: m.idCliente,
        cliente: m.cliente,
        gruppo: m.idCliente ? '' : m.gruppoNuovo,
        idCommessa: m.idCommessa,
        commessa: m.commessa,
        ticket: v.ticket.value.trim(),
        luogo: v.luogo.value.trim(),
        descrizione: v.descrizione.value.trim(),
        oreLavoro: m.oreLavoro,
        oreExtra: m.oreExtra,
        oreViaggio: m.oreViaggio,
        km: C.num(v.km.value),
        spese: C.num(v.spese.value),
        noteSpese: v.noteSpese.value.trim(),
        tariffa: C.numONull(v.tariffa.value),
        noteInterne: v.noteInterne.value.trim(),
      };
    }

    function aggiornaConto() {
      const dati = leggiModulo();
      const regole = regoleAttuali();
      const conto = C.calcola(dati, regole);
      const x = Object.assign({}, dati, conto);
      aggiungi(svuota(zonaConto), [h('div', { class: 'conto' }, righeDelConto(x, regole),
        h('div', { class: 'tot' }, h('span', null, 'Totale'), h('span', null, C.euro(conto.totale))))]);
    }

    function disegnaDescrizione() {
      aggiungi(svuota(campoDescrizione), [campo('Cosa hai fatto', v.descrizione, errori.descrizione)]);
    }

    function valida(dati) {
      const e = {};
      if (!dati.cliente) e.cliente = 'Scegli il cliente';
      if (!dati.descrizione) e.descrizione = 'Scrivi che lavoro hai fatto';
      if (!dati.data) e.data = 'Manca la data';
      ['km', 'spese', 'tariffa'].forEach(k => {
        const t = v[k].value.trim();
        if (t && C.numONull(t) === null) e[k] = 'Non è un numero';
      });
      if (dati.oreLavoro + dati.oreExtra + dati.oreViaggio <= 0) e.oreLavoro = 'Mancano le ore';
      if (regoleAttuali().tariffaFissa === null && !(dati.tariffa > 0) && !e.tariffa) e.tariffa = 'Scrivi la tariffa';
      return e;
    }

    v.ricerca.addEventListener('input', () => { m.nuovoCliente = false; const pos = v.ricerca.selectionStart; disegnaPerChi(); v.ricerca.focus(); try { v.ricerca.setSelectionRange(pos, pos); } catch (e) { /* tipo search */ } });
    v.tariffa.addEventListener('input', () => { m.tariffaToccata = true; delete errori.tariffa; aggiornaConto(); });
    v.tariffa.addEventListener('change', disegnaTariffa);
    ['km', 'spese'].forEach(k => v[k].addEventListener('input', aggiornaConto));
    v.descrizione.addEventListener('input', () => { if (errori.descrizione) { delete errori.descrizione; disegnaDescrizione(); v.descrizione.focus(); } });

    async function salva() {
      const dati = leggiModulo();
      errori = valida(dati);
      if (Object.keys(errori).length) {
        disegnaPerChi(); disegnaOre(); disegnaKm(); disegnaTariffa(); disegnaAltro(); disegnaDescrizione();
        avviso('Mancano dei dati: sono segnati in rosso', true);
        return;
      }
      const nuovaAnagrafica = !dati.idCliente || (dati.commessa && !dati.idCommessa);
      const ris = await lavora('Salvo il rapportino', () => Rete.post('/foglio/salvaRapportino', { rapportino: dati }));
      if (!ris) return;
      accogli([ris.rapportino]);
      if (nuovaAnagrafica) await ricaricaAnagrafiche().catch(() => null);
      chiudi();
      avviso('Salvato: ' + ris.rapportino.id + ' · ' + C.euro(ris.rapportino.totale));
      S.aperto = ris.rapportino.id || ris.rapportino.idLocale;
      ridisegna();
    }

    disegnaPerChi(); disegnaOre(); disegnaKm(); disegnaTariffa(); disegnaAltro(); disegnaDescrizione(); aggiornaConto();
    const corpo = h('div', { class: 'modulo' },
      h('div', { class: 'col' }, campo('Data', v.data), h('h3', null, 'Per chi'), zonaPerChi, h('h3', null, 'Ore e strada'),
        zonaOre, zonaKm, zonaTariffa),
      h('div', { class: 'col' }, h('h3', null, 'Il lavoro'), campoDescrizione, zonaAltro, h('h3', null, 'Il conto'), zonaConto));
    const chiudi = finestra({
      titolo: esistente ? 'Modifica ' + (r.id || 'il rapportino') : 'Nuovo rapportino', larghezza: 'larga', corpo, fuoco: false,
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', style: { minWidth: '180px' }, onclick: salva }, 'Salva')],
    });
    if (!m.sceltaFatta) setTimeout(() => v.ricerca.focus(), 40);
  }

  // ======================================================================= COMMESSE

  function vistaCommesse(pagina) {
    const f = S.filtriCommesse;
    const area = h('div', { class: 'sezione' });
    const conta = st => S.ana.commesse.filter(m => !st || m.stato === st).length;
    aggiungi(pagina, [
      h('div', { class: 'testata' }, h('h1', { class: 'spazio' }, 'Commesse'),
        h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloCommessa(null) }, 'Nuova commessa')),
      h('div', { class: 'filtri' },
        cerca(f.testo, 'Codice, commessa, cliente', x => { f.testo = x; tabellaCommesse(area); }),
        segmenti([['APERTA', h('span', null, 'Aperte', h('span', { class: 'conta' }, conta('APERTA')))],
          ['SOSPESA', h('span', null, 'Sospese', h('span', { class: 'conta' }, conta('SOSPESA')))],
          ['CHIUSA', h('span', null, 'Chiuse', h('span', { class: 'conta' }, conta('CHIUSA')))],
          ['', h('span', null, 'Tutte', h('span', { class: 'conta' }, conta('')))]], f.stato, x => { f.stato = x; disegnaPagina(); }),
        f.cliente ? h('span', { class: 'filtro-attivo' }, (cliente(f.cliente) || { nome: f.cliente }).nome,
          h('button', { type: 'button', 'aria-label': 'Togli il filtro', onclick: () => { f.cliente = ''; disegnaPagina(); } }, icona('chiudi', 14, 2.6))) : null),
      area]);
    tabellaCommesse(area);
  }

  function tabellaCommesse(area) {
    svuota(area);
    const f = S.filtriCommesse;
    const testo = C.normalizza(f.testo);
    const tutte = S.ana.commesse.filter(m => {
      if (f.cliente && m.idCliente !== f.cliente) return false;
      if (testo) {
        const c = cliente(m.idCliente);
        if (C.normalizza([m.id, m.descrizione, c ? c.nome : '', m.indirizzo].join(' ')).indexOf(testo) < 0) return false;
      }
      return true;
    });
    const mostrate = tutte.filter(m => !f.stato || m.stato === f.stato).sort((a, b) => (a.id < b.id ? 1 : -1));
    // Come in Pleya, ma detto: quante ce ne sono che il filtro nasconde.
    const nascoste = tutte.length - mostrate.length;
    if (!mostrate.length) {
      aggiungi(area, [h('p', { class: 'vuoto' }, 'Nessuna commessa.')]);
    } else {
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa colonne-com' }, h('span', null, 'Codice'), h('span', null, 'Commessa'), h('span', null, 'Stato'),
        h('span', null, 'Ore'), h('span', { class: 'n' }, 'Costo'), h('span', { class: 'n' }, 'Valore atteso'), h('span', { class: 'n' }, 'Margine')));
      mostrate.forEach(m => {
        const c = cliente(m.idCliente);
        const k = C.cruscotto(m, S.rapportini, S.ana.impostazioni);
        aggiungi(tab, [h('div', { class: 'r colonne-com cliccabile', role: 'button', tabindex: '0', onclick: () => { location.hash = '#commesse/' + encodeURIComponent(m.id); } },
          h('span', null, h('span', { class: 'codice' }, m.id)),
          h('span', { class: 'doppia' }, h('span', null, m.descrizione, k.livelloOre === 'sforato' ? h('span', { class: 'pallino', title: 'Oltre le ore a budget' }) : null), h('span', null, c ? c.nome : m.idCliente)),
          h('span', null, stato(m.stato)),
          h('span', { class: 'doppia' }, h('span', { class: 'num' }, C.numero(k.ore) + (k.budgetOre ? ' di ' + C.numero(k.budgetOre) : '') + ' h'),
            k.budgetOre ? h('span', null, h('span', { class: 'barra sottile', style: { marginTop: '6px' } }, h('i', { class: k.livelloOre, style: { width: Math.min(100, Math.round(k.percOre * 100)) + '%' } }))) : null),
          h('span', { class: 'n' }, k.costo.lavoroNoto ? C.euro(k.costo.totale) : '—'),
          h('span', { class: 'n' }, C.euro(k.valoreAtteso)),
          h('span', { class: 'n forte' }, k.costo.lavoroNoto ? C.euro(k.margine) : '—'))]);
      });
      aggiungi(area, [tab]);
    }
    if (nascoste) {
      aggiungi(area, [h('div', { class: 'secondario' }, (nascoste === 1 ? 'Una commessa è nascosta dal filtro. ' : nascoste + ' commesse sono nascoste dal filtro. '),
        h('button', { type: 'button', class: 'btn collegamento', onclick: () => { f.stato = ''; disegnaPagina(); } }, 'Mostrale'))]);
    }
  }

  function vistaCommessa(pagina, id) {
    const m = commessa(id);
    if (!m) { aggiungi(pagina, [h('p', { class: 'vuoto' }, 'Commessa ' + id + ' non trovata.')]); return; }
    const c = cliente(m.idCliente);
    const k = C.cruscotto(m, S.rapportini, S.ana.impostazioni);
    const area = h('div', { class: 'sezione' });

    const azioni = [];
    if (m.stato === 'APERTA') {
      azioni.push(h('button', { type: 'button', class: 'btn', onclick: () => statoCommessa(m, 'SOSPESA') }, 'Sospendi'));
      azioni.push(h('button', { type: 'button', class: 'btn', onclick: () => statoCommessa(m, 'CHIUSA') }, 'Chiudi'));
    } else {
      azioni.push(h('button', { type: 'button', class: 'btn', onclick: () => statoCommessa(m, 'APERTA') }, 'Riapri'));
    }
    azioni.push(h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloCommessa(m) }, 'Modifica'));

    aggiungi(pagina, [
      h('div', { class: 'testata' }, tondo('indietro', 'Torna alle commesse', () => { location.hash = '#commesse'; }),
        h('div', { class: 'titoli' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } }, h('span', { class: 'codice' }, m.id), h('h1', null, m.descrizione), stato(m.stato, true)),
          h('span', { class: 'sotto-titolo' }, [c ? c.nome : m.idCliente, m.indirizzo,
            m.inizio ? 'dal ' + C.data(m.inizio) + (m.finePrevista ? ' al ' + C.data(m.finePrevista) : '') : ''].filter(Boolean).join(' · '))),
        azioni),
      segmenti([['panoramica', 'Panoramica'], ['rapportini', 'Rapportini · ' + k.totali.n], ['costi', 'Costi'], ['dafatturare', 'Da fatturare'], ['documenti', 'Documenti']],
        S.schedaCommessa, x => { S.schedaCommessa = x; disegnaPagina(); }),
      area]);

    if (S.schedaCommessa === 'rapportini') {
      aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }),
        h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloRapportino(null, { idCliente: m.idCliente, idCommessa: m.id }) }, 'Nuovo rapportino'))]);
      aggiungi(area, [tabellaSemplice(C.ordina(k.rapportini, 'data', -1))]);
    } else if (S.schedaCommessa === 'costi') {
      costiCommessa(area, m, k);
    } else if (S.schedaCommessa === 'dafatturare') {
      const da = k.rapportini.filter(r => r.stato === 'FIRMATO' || r.stato === 'INVIATO');
      const inBozza = k.rapportini.filter(r => r.stato === 'BOZZA');
      aggiungi(area, [h('div', { class: 'tre-colonne' },
        riquadro('Pronto da fatturare', C.euro(k.prontoDaFatturare), da.length ? nRapportini(da.length) + ' firmati o inviati' : 'niente'),
        riquadro('Da far firmare', C.euro(k.inBozza), inBozza.length ? nRapportini(inBozza.length) : 'nessuno'),
        riquadro('Già fatturato', C.euro(k.fatturato), null))]);
      if (da.length) {
        aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }),
          h('button', { type: 'button', class: 'btn', onclick: () => cambiaStato(da, 'FATTURATO') }, 'Segna fatturati'),
          h('button', { type: 'button', class: 'btn giallo', onclick: () => preparaInvio(da) }, 'Prepara riepilogo'))]);
        aggiungi(area, [tabellaSemplice(C.ordina(da, 'data', 1))]);
      } else {
        aggiungi(area, [h('p', { class: 'vuoto' }, 'Niente da fatturare.')]);
      }
    } else if (S.schedaCommessa === 'documenti') {
      documentiCommessa(area, m);
    } else {
      panoramicaCommessa(area, m, k);
    }
  }

  /** I rapportini di una commessa: la stessa tabella, senza gruppi. */
  function tabellaSemplice(lista) {
    if (!lista.length) return h('p', { class: 'vuoto' }, 'Ancora nessun rapportino.');
    const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa colonne-rap-semplici' }, h('span', null, 'Data · N°'), h('span', null, 'Cliente'),
      h('span', null, 'Lavoro svolto'), h('span', { class: 'n' }, 'Ore'), h('span', { class: 'n' }, 'Km'), h('span', { class: 'n' }, 'Spese'), h('span', { class: 'n' }, 'Totale'), h('span', null, 'Stato')));
    lista.forEach(r => {
      const chiave = r.id || r.idLocale;
      aggiungi(tab, [h('div', { class: 'r colonne-rap-semplici cliccabile' + (S.aperto === chiave ? ' scelta' : ''), role: 'button', tabindex: '0', 'data-chiave': chiave, onclick: () => apriPannello(chiave) },
        h('span', { class: 'doppia' }, h('span', { class: 'forte' }, dataBreve(r.data)), h('span', { class: 'num' }, r.id)),
        h('span', { class: 'doppia' }, h('span', null, r.cliente), h('span', null, r.idCommessa)),
        h('span', { class: 'taglia t2', title: r.descrizione }, r.descrizione),
        h('span', { class: 'n' }, C.numero(r.oreTotali)), h('span', { class: 'n' }, C.numero(r.km)),
        h('span', { class: 'n t2' }, C.num(r.spese) ? C.euro(r.spese) : ''), h('span', { class: 'n forte' }, C.euro(r.totale)), h('span', null, stato(r.stato)))]);
    });
    const t = C.totali(lista);
    aggiungi(tab, [h('div', { class: 'r piede colonne-rap-semplici' }, h('span', { style: { gridColumn: 'span 3' } }, 'Totale · ' + nRapportini(t.n)),
      h('span', { class: 'n' }, C.numero(t.ore)), h('span', { class: 'n' }, C.numero(t.km)), h('span', { class: 'n' }, C.euro(t.spese)), h('span', { class: 'n' }, C.euro(t.totale)), h('span'))]);
    return tab;
  }

  function panoramicaCommessa(area, m, k) {
    const perc = x => x === null ? '' : Math.round(x * 100) + '%';
    aggiungi(area, [h('div', { class: 'tre-colonne' },
      riquadro('Valore atteso', C.euro(k.valoreAtteso), m.budgetEuro && m.budgetEuro >= k.valoreMaturato ? 'il budget della commessa' : 'quello che i rapportini hanno maturato'),
      riquadro('Costo sostenuto', k.costo.lavoroNoto ? C.euro(k.costo.totale) : '—',
        k.costo.lavoroNoto ? (k.valoreAtteso > 0 ? perc(k.costo.totale / k.valoreAtteso) + ' del valore atteso' : '') : 'manca il tuo costo orario in Impostazioni'),
      riquadro('Margine atteso', k.costo.lavoroNoto ? C.euro(k.margine) : '—',
        k.costo.lavoroNoto && k.percMargine !== null ? perc(k.percMargine) + (k.margine < 0 ? ': costa più di quanto vale' : '') : '', null, k.costo.lavoroNoto && k.margine < 0))]);

    const tot = k.fatturato + k.prontoDaFatturare + k.inBozza;
    const pezzo = (x, classe) => tot > 0 && x > 0 ? h('i', { class: classe, style: { width: (x / tot * 100) + '%' } }) : null;
    aggiungi(area, [h('div', { class: 'scheda' },
      h('h2', null, 'Fatturazione'),
      h('div', { class: 'barra' }, pezzo(k.fatturato, 'fatturato'), pezzo(k.prontoDaFatturare, 'pronto'), pezzo(k.inBozza, 'bozza')),
      h('div', { class: 'legenda' },
        h('span', null, h('i', { style: { background: 'var(--testo)' } }), 'Fatturato ' + C.euro(k.fatturato)),
        h('span', null, h('i', { style: { background: 'var(--firmato)' } }), 'Pronto da fatturare ' + C.euro(k.prontoDaFatturare)),
        h('span', null, h('i', { style: { background: 'var(--bordo-campo)' } }), 'Da far firmare ' + C.euro(k.inBozza))))]);

    const ore = h('div', { class: 'scheda' }, h('h2', null, 'Ore'));
    const corpoOre = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' } });
    if (k.budgetOre) {
      aggiungi(corpoOre, [h('div', { style: { display: 'flex', justifyContent: 'space-between', fontWeight: '700' } },
        h('span', null, C.numero(k.ore) + ' ore di ' + C.numero(k.budgetOre) + ' a budget'),
        h('span', { class: k.livelloOre === 'sforato' ? 'stato pericolo' : k.livelloOre === 'attenzione' ? 'stato avviso' : 'tenue' },
          k.livelloOre === 'sforato' ? 'Oltre il budget' : k.livelloOre === 'attenzione' ? 'Vicina al budget' : perc(k.percOre))),
      h('div', { class: 'barra' }, h('i', { class: k.livelloOre, style: { width: Math.min(100, Math.round(k.percOre * 100)) + '%' } }))]);
    } else {
      aggiungi(corpoOre, [h('div', { style: { fontWeight: '700' } }, C.numero(k.ore) + ' ore')]);
    }
    if (k.percTempo !== null) {
      aggiungi(corpoOre, [h('div', { class: 'secondario' }, 'Tempo ' + perc(k.percTempo) + (k.giorniMancanti >= 0 ? ' · mancano ' + k.giorniMancanti + ' giorni' : ' · scaduta da ' + (-k.giorniMancanti) + ' giorni')),
        h('div', { class: 'barra sottile' }, h('i', { class: 'bozza', style: { width: Math.round(k.percTempo * 100) + '%' } }))]);
    }
    const massimo = Math.max(1, ...k.settimane.map(s => s.ore));
    aggiungi(corpoOre, [h('div', { class: 'etichetta', style: { marginTop: '8px' } }, 'Settimana per settimana'),
      h('div', { class: 'settimane' }, k.settimane.map(s => h('div', { class: 'settimana', title: 'Settimana del ' + C.data(s.inizio) + ': ' + C.numero(s.ore) + ' ore' },
        h('span', null, s.ore ? C.numero(s.ore) : ''),
        h('div', { class: 'colonna' + (s.ore ? ' piena' : ''), style: { height: Math.round(s.ore / massimo * 80) + 'px' } }),
        h('span', null, dataBreve(s.inizio)))))]);
    aggiungi(ore, [corpoOre]);
    aggiungi(area, [ore]);
    if (m.note) aggiungi(area, [h('div', { class: 'scheda' }, h('h2', null, 'Note'), h('div', { class: 'lavoro' }, m.note))]);
  }

  function costiCommessa(area, m, k) {
    const imp = S.ana.impostazioni;
    const conSpese = k.rapportini.filter(r => C.num(r.spese) > 0 || (r.foto || []).length);
    aggiungi(area, [h('div', { class: 'scheda' },
      h('h2', null, 'Il costo · ' + (k.costo.lavoroNoto ? C.euro(k.costo.totale) : 'incompleto')),
      h('div', { class: 'conto', style: { borderTop: 'none' } },
        rigaConto('Il tuo lavoro · ' + C.numero(k.ore) + ' ore × ' + (imp.COSTO_ORARIO ? C.euro(imp.COSTO_ORARIO) : 'costo orario da mettere in Impostazioni'), k.costo.lavoroNoto ? C.euro(k.costo.lavoro) : '—'),
        rigaConto('Auto · ' + C.numero(k.totali.km) + ' km al costo ACI', C.euro(k.costo.auto)),
        rigaConto('Spese · ' + nRapportini(conSpese.length), C.euro(k.costo.spese))))]);
    if (conSpese.length) {
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: '70px 130px minmax(0,1fr) 240px 110px' } },
        h('span', null, 'Data'), h('span', null, 'N°'), h('span', null, 'Di cosa'), h('span', null, 'Scontrini'), h('span', { class: 'n' }, 'Importo')));
      conSpese.forEach(r => aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: '70px 130px minmax(0,1fr) 240px 110px', minHeight: '72px' }, onclick: () => apriPannello(r.id) },
        h('span', { class: 'forte' }, dataBreve(r.data)), h('span', { class: 't2' }, r.id), h('span', { class: 'taglia' }, r.noteSpese || '—'),
        h('span', { class: 'miniature' }, (r.foto || []).slice(0, 3).map(f => h('a', { href: f.url, target: '_blank', style: { width: '52px', height: '52px' }, onclick: e => e.stopPropagation() }, h('img', { src: '/file/' + f.id, alt: '' })))),
        h('span', { class: 'n forte' }, C.euro(r.spese)))]));
      aggiungi(area, [tab]);
    }
  }

  async function documentiCommessa(area, m) {
    const lista = h('div', null, h('p', { class: 'vuoto' }, 'Leggo la cartella…'));
    let cartella = m.cartella;
    const leggiCartella = async () => {
      const ris = await Rete.get('/foglio/documenti?idCommessa=' + encodeURIComponent(m.id)).catch(e => { avviso(e.message, true); return null; });
      svuota(lista);
      if (!ris) return;
      cartella = ris.cartella;
      if (!ris.documenti.length) { aggiungi(lista, [h('p', { class: 'vuoto' }, 'Nessun documento.')]); return; }
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: 'minmax(0,1fr) 200px' } }, h('span', null, 'Documento'), h('span', null, 'Ultima modifica')));
      ris.documenti.forEach(d => aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: 'minmax(0,1fr) 200px' }, onclick: () => window.open(d.url, '_blank') },
        h('span', { class: 'forte taglia' }, d.nome), h('span', { class: 't2' }, C.dataOra(d.data)))]));
      aggiungi(lista, [tab]);
    };
    aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }),
      h('button', { type: 'button', class: 'btn', onclick: () => { if (cartella) window.open(cartella, '_blank'); } }, 'Apri la cartella su Drive'),
      h('button', { type: 'button', class: 'btn giallo', onclick: async () => {
        const scelto = await Rete.post('/locale/scegli-file', { filtro: 'tutti' }).catch(() => null);
        if (!scelto || !scelto.ok) return;
        const fatto = await lavora('Carico ' + scelto.nome, () => Rete.post('/foglio/caricaFile', {
          tipo: 'documento', idCommessa: m.id, nome: scelto.nome, mime: scelto.mime, base64: scelto.base64,
        }));
        if (fatto) { avviso('Caricato ' + scelto.nome); leggiCartella(); }
      } }, 'Carica un documento')),
    lista]);
    leggiCartella();
  }

  async function statoCommessa(m, st) {
    const frasi = {
      SOSPESA: ['Sospendere la commessa?', 'Non si propone più nei rapportini nuovi finché non la riapri.'],
      CHIUSA: ['Chiudere la commessa?', 'Il lavoro è finito: non si propone più nei rapportini nuovi. Ore, costi e rapportini restano, e si può riaprire.'],
      APERTA: ['Riaprire la commessa?', 'Torna fra quelle proposte nei rapportini.'],
    };
    const ok = await conferma(frasi[st][0], frasi[st][1], st === 'APERTA' ? 'Riapri' : st === 'CHIUSA' ? 'Chiudi' : 'Sospendi');
    if (!ok) return;
    const ris = await lavora('Aggiorno la commessa', () => Rete.post('/foglio/aggiornaCommessa', { id: m.id, campi: { stato: st } }));
    if (ris) { Object.assign(m, ris.commessa); avviso('Commessa ' + ris.commessa.stato.toLowerCase()); ridisegna(); }
  }

  function moduloCommessa(esistente) {
    const m = esistente || {};
    const anno = new Date().getFullYear();
    const prossimo = C.prossimoCodiceCommessa(S.ana.commesse.map(x => x.id), S.ana.impostazioni.PREFISSO_COMMESSA, anno);
    const clientiOrdinati = S.ana.clienti.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    const v = {
      cliente: h('select', null, [h('option', { value: '' }, 'Scegli il cliente')].concat(clientiOrdinati.map(c => h('option', { value: c.id, selected: c.id === (m.idCliente || S.filtriCommesse.cliente) }, c.nome)))),
      descrizione: h('input', { type: 'text', value: m.descrizione || '' }),
      codice: h('input', { type: 'text', value: esistente ? m.id : prossimo, disabled: !!esistente }),
      indirizzo: h('input', { type: 'text', value: m.indirizzo || '' }),
      inizio: h('input', { type: 'date', value: m.inizio || (esistente ? '' : C.oggiIso()) }),
      fine: h('input', { type: 'date', value: m.finePrevista || '' }),
      budgetOre: h('input', { type: 'text', inputmode: 'decimal', value: m.budgetOre ? C.numero(m.budgetOre) : '' }),
      budgetEuro: h('input', { type: 'text', inputmode: 'decimal', value: m.budgetEuro ? C.numero(m.budgetEuro) : '' }),
      note: h('textarea', { rows: 3 }),
    };
    v.note.value = m.note || '';
    let chiudi;
    const salva = async () => {
      if (!v.cliente.value) { v.cliente.focus(); avviso('Scegli il cliente', true); return; }
      if (!v.descrizione.value.trim()) { v.descrizione.focus(); avviso('Scrivi come si chiama la commessa', true); return; }
      const campi = {
        idCliente: v.cliente.value, descrizione: v.descrizione.value.trim(), indirizzo: v.indirizzo.value.trim(),
        inizio: v.inizio.value, finePrevista: v.fine.value,
        budgetOre: C.numONull(v.budgetOre.value), budgetEuro: C.numONull(v.budgetEuro.value), note: v.note.value.trim(),
      };
      const codice = v.codice.value.trim() === prossimo ? '' : v.codice.value.trim();
      const ris = await lavora('Salvo la commessa', () => esistente
        ? Rete.post('/foglio/aggiornaCommessa', { id: m.id, campi })
        : Rete.post('/foglio/creaCommessa', Object.assign({ id: codice }, campi)));
      if (!ris) return;
      await ricaricaAnagrafiche().catch(() => null);
      chiudi();
      if (!esistente && ris.commessa.giaEsisteva) avviso('C\'era già: ' + ris.commessa.id, true);
      else avviso((esistente ? 'Salvata ' : 'Creata ') + ris.commessa.id);
      location.hash = '#commesse/' + encodeURIComponent(ris.commessa.id);
      mostra();
    };
    chiudi = finestra({
      titolo: esistente ? 'Modifica ' + m.id : 'Nuova commessa',
      corpo: [
        h('div', { class: 'riga-campi' }, campo('Cliente', v.cliente), campo('Codice', v.codice)),
        campo('Come si chiama', v.descrizione),
        campo('Indirizzo del cantiere', v.indirizzo),
        h('div', { class: 'riga-campi' }, campo('Inizio', v.inizio), campo('Fine prevista', v.fine)),
        h('div', { class: 'riga-campi' }, campo('Budget in ore', v.budgetOre), campo('Budget in euro', v.budgetEuro)),
        campo('Note', v.note)],
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')],
    });
  }

  // ======================================================================= CLIENTI

  function vistaClienti(pagina) {
    const f = S.filtriClienti;
    const area = h('div', { class: 'sezione' });
    const disegna = () => {
      svuota(area);
      const testo = C.normalizza(f.testo);
      const lista = S.ana.clienti.filter(c => (!f.gruppo || C.normalizza(c.gruppo) === C.normalizza(f.gruppo)) &&
        (!testo || C.normalizza([c.id, c.nome, (c.alias || []).join(' '), c.email, c.partitaIva].join(' ')).indexOf(testo) >= 0))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
      if (!lista.length) { aggiungi(area, [h('p', { class: 'vuoto' }, 'Nessun cliente.')]); return; }
      const mese = meseDiOggi();
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa colonne-cli' }, h('span'), h('span', null, 'Cliente'), h('span', null, 'Gruppo'), h('span', null, 'Tariffa'),
        h('span', null, 'Email'), h('span', { class: 'n' }, 'Commesse'), h('span', { class: 'n' }, meseMinuscolo(mese))));
      lista.forEach(c => {
        const g = gruppo(c.gruppo);
        const tariffa = g && g.tariffaFissa !== null && g.tariffaFissa !== undefined ? C.numero(g.tariffaFissa) + ' €/h fissa'
          : c.ultimaTariffa ? C.numero(c.ultimaTariffa) + ' €/h l\'ultima' : '—';
        const aperte = S.ana.commesse.filter(m => m.idCliente === c.id && m.stato === 'APERTA').length;
        const delMese = C.totali(attivi().filter(r => r.idCliente === c.id && String(r.data).slice(0, 7) === mese));
        aggiungi(tab, [h('div', { class: 'r colonne-cli cliccabile', role: 'button', tabindex: '0', onclick: () => moduloCliente(c) },
          iniziali(c.nome, true),
          h('span', { class: 'doppia' }, h('span', null, c.nome), (c.alias || []).length ? h('span', null, c.alias.join(', ')) : null),
          h('span', { class: 't2' }, c.gruppo || '—'),
          h('span', { class: 't2' }, tariffa),
          h('span', { class: 'taglia t2' }, c.email || '—'),
          h('span', { class: 'n' }, String(aperte)),
          h('span', { class: 'n' }, delMese.n ? C.ore(delMese.ore) + ' · ' + C.euro(delMese.totale) : ''))]);
      });
      aggiungi(area, [tab]);
    };
    aggiungi(pagina, [
      h('div', { class: 'testata' }, h('h1', { class: 'spazio' }, 'Clienti'),
        h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloCliente(null) }, 'Nuovo cliente')),
      h('div', { class: 'filtri' },
        cerca(f.testo, 'Nome, email, partita IVA', x => { f.testo = x; disegna(); }),
        segmenti([['', 'Tutti']].concat(S.ana.gruppi.map(g => [g.nome, g.nome])), f.gruppo, x => { f.gruppo = x; disegnaPagina(); })),
      area]);
    disegna();
  }

  function moduloCliente(esistente) {
    const c = esistente || { alias: [] };
    const triplo = x => x === true ? 'SI' : x === false ? 'NO' : '';
    const daTriplo = s => s === 'SI' ? true : s === 'NO' ? false : null;
    const scelte = { gruppo: c.gruppo || (S.ana.gruppi.find(g => C.normalizza(g.nome) === 'privato') || S.ana.gruppi[0] || { nome: 'Privato' }).nome,
      pagaViaggio: triplo(c.pagaViaggio), kmRimborsati: triplo(c.kmRimborsati) };
    const v = {
      nome: h('input', { type: 'text', value: c.nome || '' }),
      email: h('input', { type: 'email', value: c.email || '' }),
      telefono: h('input', { type: 'text', value: c.telefono || '' }),
      indirizzo: h('input', { type: 'text', value: c.indirizzo || '' }),
      partitaIva: h('input', { type: 'text', value: c.partitaIva || '' }),
      alias: h('input', { type: 'text', value: (c.alias || []).join(', ') }),
      ultimaTariffa: h('input', { type: 'text', inputmode: 'decimal', value: c.ultimaTariffa ? C.numero(c.ultimaTariffa) : '' }),
      note: h('textarea', { rows: 2 }),
    };
    v.note.value = c.note || '';
    const scegli = (chiave, voci) => {
      const zona = h('div');
      const disegna = () => aggiungi(svuota(zona), [segmenti(voci, scelte[chiave], x => { scelte[chiave] = x; disegna(); }, 'piccoli')]);
      disegna();
      return zona;
    };
    let chiudi;
    const salva = async () => {
      if (!v.nome.value.trim()) { v.nome.focus(); avviso('Scrivi il nome del cliente', true); return; }
      const campi = {
        nome: v.nome.value.trim(), gruppo: scelte.gruppo, email: v.email.value.trim(), telefono: v.telefono.value.trim(),
        indirizzo: v.indirizzo.value.trim(), partitaIva: v.partitaIva.value.trim(),
        alias: v.alias.value.split(',').map(s => s.trim()).filter(Boolean),
        pagaViaggio: daTriplo(scelte.pagaViaggio), kmRimborsati: daTriplo(scelte.kmRimborsati),
        ultimaTariffa: C.numONull(v.ultimaTariffa.value), note: v.note.value.trim(),
      };
      const ris = await lavora('Salvo il cliente', async () => {
        if (esistente) return Rete.post('/foglio/aggiornaCliente', { id: c.id, campi });
        const nuovo = await Rete.post('/foglio/creaCliente', campi);
        if (nuovo.cliente.giaEsisteva) return nuovo;
        // creaCliente scrive nome e gruppo; il resto (eccezioni, tariffa) con un aggiornamento.
        return Rete.post('/foglio/aggiornaCliente', { id: nuovo.cliente.id, campi });
      });
      if (!ris) return;
      await ricaricaAnagrafiche().catch(() => null);
      chiudi();
      avviso(ris.cliente && ris.cliente.giaEsisteva ? 'C\'era già: ' + ris.cliente.nome : 'Salvato ' + v.nome.value.trim());
      ridisegna();
    };
    const triplice = [['', 'Come il gruppo'], ['SI', 'Sì'], ['NO', 'No']];
    chiudi = finestra({
      titolo: esistente ? c.nome : 'Nuovo cliente',
      corpo: [
        campo('Ragione sociale', v.nome),
        campo('Gruppo', scegli('gruppo', S.ana.gruppi.map(g => [g.nome, g.nome]))),
        h('div', { class: 'riga-campi' }, campo('Email', v.email), campo('Telefono', v.telefono)),
        h('div', { class: 'riga-campi' }, campo('Indirizzo', v.indirizzo), campo('Partita IVA', v.partitaIva)),
        campo('Altri nomi, separati da virgola', v.alias),
        h('div', { class: 'riga-campi' }, campo('Viaggio pagato', scegli('pagaViaggio', triplice)), campo('Km rimborsati', scegli('kmRimborsati', triplice))),
        h('div', { class: 'riga-campi' }, campo('Ultima tariffa (€/h)', v.ultimaTariffa), h('span')),
        campo('Note', v.note)],
      pulsanti: [
        esistente ? h('button', { type: 'button', class: 'btn', onclick: () => { chiudi(); vaiARapportini({ mese: '', cliente: c.id }); } }, 'Vedi i rapportini') : null,
        esistente ? h('button', { type: 'button', class: 'btn', onclick: () => { chiudi(); S.filtriCommesse = { testo: '', stato: '', cliente: c.id }; location.hash = '#commesse'; } }, 'Le commesse') : null,
        'spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')].filter(Boolean),
    });
  }

  // ======================================================================= IMPOSTAZIONI

  function vistaImpostazioni(pagina) {
    const imp = S.ana.impostazioni;
    aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Impostazioni'))]);

    // --- collegamento
    const url = h('input', { type: 'text', placeholder: 'https://script.google.com/macros/s/…/exec' });
    const codice = h('input', { type: 'password', placeholder: S.configurato ? 'Lascia vuoto per non cambiarlo' : '' });
    Api.get('/locale/stato').then(s => { url.value = s.url || ''; }).catch(() => null);
    aggiungi(pagina, [h('div', { class: 'scheda' }, h('h2', null, S.configurato ? 'Il foglio' : 'Collega Wisper Ufficio al foglio'),
      h('div', { class: 'fila' },
        S.configurato ? h('div', { class: 'secondario' }, S.caricato ? 'Collegato · letto alle ' + (S.ultimaLettura ? S.ultimaLettura.toTimeString().slice(0, 5) : '') : 'Il foglio non risponde') : null,
        campo('Indirizzo', url),
        campo('Codice (resta cifrato su questo computer)', codice),
        h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
          // Giallo solo quando collegarsi è la cosa da fare: nelle altre schede "Salva" resta normale.
          h('button', { type: 'button', class: S.configurato ? 'btn' : 'btn giallo', onclick: async () => {
            const ok = await lavora('Provo il collegamento', () => Api.post('/locale/configura', { url: url.value.trim(), codice: codice.value.trim() }));
            if (ok) { codice.value = ''; await carica(); if (S.caricato) avviso('Collegato'); }
          } }, S.configurato ? 'Salva e prova' : 'Collega'),
          S.cartellaPdf ? h('button', { type: 'button', class: 'btn', onclick: () => Api.post('/locale/cartella-pdf').catch(() => null) }, 'Apri la cartella dei PDF') : null)))]);

    if (S.caricato) {
      // --- dati dello studio
      const campiImp = {};
      const inputImp = (chiave, etichetta) => {
        const valore = imp[chiave] === undefined || imp[chiave] === null ? '' : imp[chiave];
        // I numeri alla italiana: 0,76 e non 0.76.
        campiImp[chiave] = h('input', { type: 'text', value: typeof valore === 'number' ? C.numero(valore) : String(valore) });
        return campo(etichetta, campiImp[chiave]);
      };
      const salvaImp = (chiavi, conferma) => async () => {
        const valori = {};
        chiavi.forEach(k => {
          let x = campiImp[k].type === 'checkbox' ? (campiImp[k].checked ? 'SI' : 'NO') : campiImp[k].value.trim();
          if (['EURO_KM', 'COSTO_ORARIO'].indexOf(k) >= 0 && x !== '') x = C.num(x);
          valori[k] = x;
        });
        const ris = await lavora('Salvo', () => Rete.post('/foglio/salvaImpostazioni', { valori }));
        if (ris) { S.ana.impostazioni = ris.impostazioni; avviso(conferma || 'Salvato'); }
      };

      aggiungi(pagina, [h('div', { class: 'scheda' }, h('h2', null, 'Lo studio'),
        h('div', { class: 'fila' },
          h('div', { class: 'riga-campi' }, inputImp('RAGIONE_SOCIALE', 'Ragione sociale'), inputImp('TECNICO', 'Chi compila')),
          h('div', { class: 'riga-campi' }, inputImp('INDIRIZZO', 'Indirizzo'), inputImp('PARTITA_IVA', 'Partita IVA')),
          h('div', { class: 'riga-campi' }, inputImp('EMAIL', 'Email per le risposte'), inputImp('TELEFONO', 'Telefono'), inputImp('PEC', 'PEC')),
          h('div', null, h('button', { type: 'button', class: 'btn', onclick: salvaImp(['RAGIONE_SOCIALE', 'TECNICO', 'INDIRIZZO', 'PARTITA_IVA', 'EMAIL', 'TELEFONO', 'PEC']) }, 'Salva'))))]);

      // --- firma del tecnico
      const idFirma = D.idDaUrl(imp.FIRMA_TECNICO);
      aggiungi(pagina, [h('div', { class: 'scheda' }, h('h2', null, 'La tua firma'),
        h('div', { class: 'fila' },
          idFirma ? h('img', { class: 'firma-tecnico', src: '/file/' + idFirma, alt: 'La tua firma' }) : h('div', { class: 'secondario' }, 'Non ancora caricata: sui rapportini resta lo spazio vuoto.'),
          h('div', null, h('button', { type: 'button', class: 'btn', onclick: async () => {
            const scelto = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
            if (!scelto || !scelto.ok) return;
            const ris = await lavora('Carico la firma', () => Rete.post('/foglio/caricaFile', { tipo: 'firmaTecnico', mime: scelto.mime, base64: scelto.base64 }));
            if (ris) { await ricaricaAnagrafiche(); avviso('Firma caricata'); ridisegna(); }
          } }, idFirma ? 'Cambia la firma' : 'Carica la firma'))))]);

      // --- tariffe
      aggiungi(pagina, [tariffeGruppi()]);

      // --- rimborsi, costi, numerazione
      campiImp.TICKET_ATTIVO = h('input', { type: 'checkbox', checked: imp.TICKET_ATTIVO === 'SI' });
      aggiungi(pagina, [h('div', { class: 'scheda' }, h('h2', null, 'Rimborso km e costi'),
        h('div', { class: 'fila' },
          h('div', { class: 'riga-campi' },
            inputImp('EURO_KM', 'Rimborso km (€/km, tabella ACI)'),
            inputImp('AUTO', 'Auto'),
            inputImp('COSTO_ORARIO', 'Quanto ti costa un\'ora (€/h)'),
            inputImp('PREFISSO_COMMESSA', 'Lettera delle commesse')),
          h('label', { class: 'spunta-campo' }, campiImp.TICKET_ATTIVO, 'Campo ticket nei rapportini'),
          h('div', null, h('button', { type: 'button', class: 'btn', onclick: salvaImp(['EURO_KM', 'AUTO', 'COSTO_ORARIO', 'PREFISSO_COMMESSA', 'TICKET_ATTIVO'],
            'Salvato. Vale per i rapportini nuovi: quelli già scritti tengono il rimborso con cui sono nati') }, 'Salva'))))]);
    }

    // --- l'app
    let tema = 'auto';
    try { tema = localStorage.getItem('wisper-tema') || 'auto'; } catch (e) { /* senza memoria */ }
    const zonaTema = h('div');
    const disegnaTema = () => aggiungi(svuota(zonaTema), [segmenti([['auto', 'Automatico'], ['chiaro', 'Chiaro'], ['scuro', 'Scuro']], tema, x => {
      tema = x;
      try { localStorage.setItem('wisper-tema', x); } catch (e) { /* resta per questa volta */ }
      document.documentElement.setAttribute('data-tema', x);
      disegnaTema();
    })]);
    disegnaTema();
    aggiungi(pagina, [h('div', { class: 'scheda' }, h('h2', null, 'L\'app'),
      h('div', null,
        h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Tema')), zonaTema),
        S.caricato ? h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Come funziona Wisper Ufficio'), h('span', null, 'La visita guidata, coi dati di esempio')),
          h('button', { type: 'button', class: 'btn', onclick: () => iniziaVisita() }, 'Rifai la visita')) : null,
        h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Licenze'), h('span', null, 'Carattere Figtree, SIL OFL 1.1')),
          h('button', { type: 'button', class: 'btn', onclick: mostraLicenza }, 'Leggi')),
        S.versione ? h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Versione ' + S.versione),
          h('span', null, statoAggiornamenti())),
          S.aggiornamento && S.aggiornamento.stato === 'pronto'
            ? h('button', { type: 'button', class: 'btn giallo', onclick: riavvia }, 'Riavvia')
            : S.aggiornamento && S.aggiornamento.attivi ? h('button', { type: 'button', class: 'btn', onclick: cercaAggiornamenti }, 'Cerca aggiornamenti') : null) : null))]);
  }

  function statoAggiornamenti() {
    const a = S.aggiornamento;
    if (!a || !a.attivi) return 'Wisper Ufficio';
    if (a.stato === 'pronto') return 'La ' + a.nuova + ' è pronta: parte alla prossima apertura';
    if (a.stato === 'errore') return a.messaggio;
    return 'Si aggiorna da solo' + (a.controllato ? ' · controllato alle ' + a.controllato : '');
  }

  async function mostraLicenza() {
    let testo = 'Figtree, SIL Open Font License 1.1.';
    try { testo = await (await fetch('font/figtree-OFL.txt', { cache: 'no-store' })).text(); } catch (e) { /* resta la riga corta */ }
    let chiudi;
    chiudi = finestra({ titolo: 'Licenze', corpo: h('pre', { class: 'licenza' }, testo), fuoco: false,
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn giallo grande', onclick: () => chiudi() }, 'Chiudi')] });
  }

  /** I gruppi e le loro regole: Elettrodinamica a 30 €/h fissi, i privati a tariffa libera. */
  function tariffeGruppi() {
    const tab = h('div', { class: 'tab tab-gruppi' }, h('div', { class: 'r testa colonne-gru' }, h('span', null, 'Gruppo'), h('span', null, 'Tariffa fissa'),
      h('span', null, 'Viaggio'), h('span', null, 'Km'), h('span', null, 'Extra %'), h('span', null, 'Email del riepilogo'), h('span')));
    const riga = g => {
      const v = {
        nome: h('input', { type: 'text', value: g.nome || '', disabled: !!g.nome, 'aria-label': 'Nome del gruppo' }),
        tariffa: h('input', { type: 'text', inputmode: 'decimal', value: g.tariffaFissa !== null && g.tariffaFissa !== undefined ? C.numero(g.tariffaFissa) : '', placeholder: 'libera', 'aria-label': 'Tariffa fissa' }),
        viaggio: h('input', { type: 'checkbox', checked: !!g.pagaViaggio, 'aria-label': 'Viaggio pagato' }),
        km: h('input', { type: 'checkbox', checked: g.kmRimborsati !== false, 'aria-label': 'Km rimborsati' }),
        magg: h('input', { type: 'text', inputmode: 'decimal', value: g.maggExtra ? C.numero(g.maggExtra) : '', placeholder: '0', 'aria-label': 'Maggiorazione ore extra' }),
        email: h('input', { type: 'email', value: g.email || '', 'aria-label': 'Email del riepilogo' }),
      };
      const salva = h('button', { type: 'button', class: 'btn piccolo', onclick: async () => {
        if (!v.nome.value.trim()) { v.nome.focus(); return; }
        const ris = await lavora('Salvo il gruppo', () => Rete.post('/foglio/salvaGruppo', { gruppo: {
          nome: v.nome.value.trim(), tariffaFissa: C.numONull(v.tariffa.value), pagaViaggio: v.viaggio.checked,
          kmRimborsati: v.km.checked, maggExtra: C.num(v.magg.value), email: v.email.value.trim(),
        } }));
        if (ris) { await ricaricaAnagrafiche(); avviso('Salvato ' + ris.gruppo.nome); ridisegna(); }
      } }, 'Salva');
      return h('div', { class: 'r colonne-gru' }, v.nome, v.tariffa, h('span', null, v.viaggio), h('span', null, v.km), v.magg, v.email, salva);
    };
    S.ana.gruppi.forEach(g => aggiungi(tab, [riga(g)]));
    const aggiungiGruppo = h('button', { type: 'button', class: 'btn collegamento', onclick: () => { aggiungi(tab, [riga({})]); aggiungiGruppo.remove(); } }, '+ Aggiungi un gruppo');
    return h('div', { class: 'scheda' }, h('h2', null, 'Gruppi e tariffe'),
      h('div', { class: 'fila' }, tab, h('div', null, aggiungiGruppo)));
  }

  // ======================================================================= visita guidata

  function visitaVista() {
    try { return localStorage.getItem('wisper-visita') === '1'; } catch (e) { return true; }
  }

  function iniziaVisita() {
    if (Visita.attiva || !S.caricato) return;
    Visita.inizia({
      inizio: () => {
        S.veri = { ana: S.ana, rapportini: S.rapportini, mese: S.mese, filtri: S.filtri };
        S.esempio = Esempio.crea();
        S.ana = S.esempio.ana;
        S.rapportini = S.esempio.rapportini;
        S.mese = meseDiOggi();
        S.filtri = { testo: '', mese: meseDiOggi(), quali: 'tutti', chi: '', cliente: '', commessa: '' };
        document.querySelectorAll('.velo').forEach(x => x.remove());
        aggiornaStatoFoglio();
        if (location.hash !== '#finemese') location.hash = '#finemese'; else mostra();
      },
      fine: () => {
        try { localStorage.setItem('wisper-visita', '1'); } catch (e) { /* la ripropone la prossima volta */ }
        document.querySelectorAll('.velo').forEach(x => x.remove());
        chiudiMenu();
        S.esempio = null;
        if (S.veri) { S.ana = S.veri.ana; S.rapportini = S.veri.rapportini; S.mese = S.veri.mese; S.filtri = S.veri.filtri; S.veri = null; }
        aggiornaStatoFoglio();
        if (location.hash !== '#finemese') location.hash = '#finemese'; else mostra();
        carica(true);
      },
    });
  }

  // ======================================================================= avvio

  carica();
})();
