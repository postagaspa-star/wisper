/*
 * Wisper Ufficio: i mattoni dell'interfaccia, usati da tutte le pagine.
 *
 * Elementi (h), icone a tratto, finestre, conferme, menu ⋯, avvisi in basso,
 * campi, segmenti, ricerca, cerchi con le iniziali. Stavano in app.js; ora che
 * le pagine sono divise per modulo (clienti.js, commesse.js, amministrazione.js)
 * stanno qui, una volta sola.
 */
(function (radice) {
  'use strict';

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

  /** Icone a tratto (docs/aspetto.md §1): quelle di sempre più quelle del prototipo della fase 1. */
  const ICONE = {
    indietro: '<path d="M15 6l-6 6 6 6"/>',
    avanti: '<path d="M9 6l6 6-6 6"/>',
    giu: '<path d="M6 9l6 6 6-6"/>',
    chiudi: '<path d="M6 6l12 12M18 6L6 18"/>',
    spunta: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cerca: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    piu: '<path d="M12 5v14M5 12h14"/>',
    meno: '<path d="M5 12h14"/>',
    altro: '<circle cx="5.5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
    avviso: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    aggiorna: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    freccia: '<path d="M9 18l6-6-6-6"/>',
    dashboard: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
    clienti: '<path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.6a3 3 0 0 1 0 5.8"/>',
    commesse: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
    rapportini: '<path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>',
    fatturazione: '<path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21zM10 8h4M10 12h4"/>',
    amministrazione: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    allarme: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    calendario: '<path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8 3v4M16 3v4"/>',
    lista: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    firma: '<path d="M3 17c3-2 5-8 7-8s-1 8 2 8 3-4 5-4 2 3 4 3"/>',
    telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    email: '<path d="M4 6h16v12H4zM4 7l8 6 8-6"/>',
    luogo: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>',
    scudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    scarica: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    esci: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
    occhio: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>',
    lato: '<path d="M4 5h16v14H4zM9 5v14"/>',
    numero: '<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/>',
    cestino: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    studio: '<path d="M4 20V8l8-4 8 4v12M9 20v-6h6v6M4 20h16"/>',
    trascina: '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
    chiave: '<path d="M15 9a4 4 0 1 1-3.2 6.4L5 22H2v-3l6.6-6.8A4 4 0 0 1 15 9zM16 8h.01"/>',
    app: '<path d="M5 4h14v16H5zM9 18h6"/>',
    // fase 2: preventivi, attività e calendario (dal prototipo Gestionale-fase2.html)
    preventivo: '<path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5"/>',
    ripeti: '<path d="M17 2l3 3-3 3M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 0 1-4 4H4"/>',
    campana: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
    orologio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    graffetta: '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4L15 7.1"/>',
    persone: '<path d="M4 6h16M4 12h16M4 18h16M9 3v18"/>',
    libro: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"/>',
    contratto: '<path d="M7 3h10v18H7zM10 8h4M10 12h4M10 16h2"/>',
  };

  function icona(nome, dim, spessore) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', dim || 18);
    s.setAttribute('height', dim || 18);
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
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

  /** Le iniziali di un nome: due lettere, senza Srl e simili. */
  function lettere(nome) {
    const parole = String(nome || '?').replace(/\b(srl|spa|snc|sas|srls)\b/gi, '').trim().split(/\s+/).filter(Boolean);
    return (parole.length > 1 ? parole[0][0] + parole[1][0] : (parole[0] || '?').slice(0, 2)).toUpperCase();
  }

  /** Il cerchio con le iniziali: colore scelto dal nome, sempre lo stesso. */
  function iniziali(nome, piccole, classe) {
    let somma = 0;
    for (const ch of String(nome || '')) somma = (somma * 31 + ch.charCodeAt(0)) % 997;
    return h('span', { class: 'iniziali tinta-' + (somma % 6) + (piccole ? ' piccole' : '') + (classe ? ' ' + classe : ''), 'aria-hidden': 'true' }, lettere(nome));
  }

  function stato(st, grande) {
    const nomi = { BOZZA: 'Da firmare', FIRMATO: 'Firmato', INVIATO: 'Inviato', FATTURATO: 'Fatturato', APERTA: 'Aperta', SOSPESA: 'Sospesa', CHIUSA: 'Chiusa' };
    return h('span', { class: 'stato ' + st + (grande ? ' grande' : '') }, nomi[st] || st);
  }

  /** Una pillola: grigio, verde, blu, giallo, rosso. */
  function pillola(testo, colore) {
    return h('span', { class: 'pill p-' + (colore || 'grigio') }, testo);
  }

  // ======================================================================= avvisi e attese

  /**
   * L'avviso in basso, scuro, 3,5 secondi. Con un'azione ({ testo: 'Annulla', fn })
   * resta un po' di più e ha il suo pulsante. Gli errori restano finché non si chiudono.
   */
  function avviso(testo, errore, durata, azione) {
    const chiudi = () => a.remove();
    const a = h('div', { class: 'avviso' + (errore ? ' errore' : ''), role: errore ? 'alert' : 'status' },
      errore ? icona('avviso', 18) : null, h('span', null, testo),
      azione ? h('button', { type: 'button', class: 'azione', onclick: () => { chiudi(); azione.fn(); } }, azione.testo) : null,
      errore ? h('button', { type: 'button', 'aria-label': 'Chiudi', onclick: chiudi }, icona('chiudi', 16)) : null);
    aggiungi($('#avvisi'), [a]);
    if (!errore) setTimeout(chiudi, durata || (azione ? 6000 : 3500));
  }

  let inAttesa = 0;
  /** Esegue un'operazione col server mostrando "un momento" e gli errori a parole. */
  async function lavora(testo, fn) {
    inAttesa++;
    let etichetta = $('.attesa');
    if (!etichetta) { etichetta = h('div', { class: 'attesa' }, h('i'), h('span')); aggiungi(document.body, [etichetta]); }
    etichetta.lastChild.textContent = testo + '…';
    try {
      return await fn();
    } catch (e) {
      // Accesso scaduto: ci pensa l'app (torna alla pagina di accesso), niente avviso rosso.
      if (e && e.accesso === false) return undefined;
      avviso(e.message || String(e), true);
      return undefined;
    } finally {
      inAttesa--;
      if (inAttesa === 0 && etichetta) etichetta.remove();
    }
  }

  // ======================================================================= finestre e menu

  function finestra(opzioni) {
    const o = opzioni || {};
    const velo = h('div', { class: 'velo' });
    const chiudi = () => { velo.remove(); if (o.allaChiusura) o.allaChiusura(); };
    const f = h('div', { class: 'finestra' + (o.larghezza ? ' ' + o.larghezza : ''), role: 'dialog', 'aria-label': o.titolo || '' });
    if (o.contenuto) {
      aggiungi(f, o.contenuto);
    } else {
      aggiungi(f, [h('div', { class: 'testa-f' }, h('h2', null, o.titolo), o.testaExtra || null, tondo('chiudi', 'Chiudi', chiudi, 'piccolo')),
        h('div', { class: 'corpo-f' }, o.corpo)]);
      if (o.pulsanti && o.pulsanti.length) aggiungi(f, [h('div', { class: 'piede-f' }, o.pulsanti.map(p => p === 'spazio' ? h('span', { class: 'spazio' }) : p))]);
    }
    aggiungi(velo, [f]);
    // Esc chiude dalla stessa strada (app.js): così anche "allaChiusura" parte.
    velo.chiudi = chiudi;
    velo.addEventListener('mousedown', e => { if (e.target === velo && !(radice.WisperVisita && radice.WisperVisita.attiva)) chiudi(); });
    aggiungi($('#sovrapposti'), [velo]);
    const primo = f.querySelector('input:not([type=checkbox]):not([disabled]), textarea');
    if (primo && o.fuoco !== false) setTimeout(() => primo.focus(), 40);
    return chiudi;
  }

  function conferma(titolo, testo, siTesto, pericolo) {
    return new Promise(risolvi => {
      let chiudi;
      // La risposta vale una volta sola: chiudere la finestra (Esc, ×, clic fuori) vuol dire no,
      // ma dopo un sì la chiusura non deve trasformarlo in un no.
      let detto = false;
      const rispondi = v => { if (!detto) { detto = true; risolvi(v); } };
      const no = h('button', { type: 'button', class: 'btn testo grande', onclick: () => { rispondi(false); chiudi(); } }, 'Annulla');
      const si = h('button', { type: 'button', class: 'btn grande ' + (pericolo ? 'pericolo' : 'giallo'), onclick: () => { rispondi(true); chiudi(); } }, siTesto || 'Conferma');
      chiudi = finestra({ titolo, corpo: h('p', { style: { margin: 0, fontSize: '16px' } }, testo), pulsanti: ['spazio', no, si], fuoco: false, allaChiusura: () => rispondi(false) });
    });
  }

  let menuAperto = null;
  /** Chiude il menu ⋯ se è aperto: true se c'era. */
  function chiudiMenu() { if (menuAperto) { menuAperto.remove(); menuAperto = null; return true; } return false; }

  /** Il menu ⋯: voci { testo, fn, pericolo, scelta } o '-' per una riga. */
  function apriMenu(ancora, voci) {
    chiudiMenu();
    const m = h('div', { class: 'menu', role: 'menu' }, voci.filter(Boolean).map(v => v === '-' ? h('hr') :
      h('button', { type: 'button', role: 'menuitem', class: (v.pericolo ? 'pericolo' : '') + (v.scelta ? ' scelta' : ''), onclick: () => { chiudiMenu(); v.fn(); } },
        v.scelta ? icona('spunta', 16, 2.8) : null, v.testo)));
    aggiungi(document.body, [m]);
    const r = ancora.getBoundingClientRect();
    const alto = m.offsetHeight;
    const sotto = r.bottom + 6 + alto < window.innerHeight;
    m.style.top = (sotto ? r.bottom + 6 : Math.max(8, r.top - alto - 6)) + 'px';
    m.style.left = Math.max(12, Math.min(r.left, window.innerWidth - m.offsetWidth - 12)) + 'px';
    if (r.right - m.offsetWidth > 12 && r.left + m.offsetWidth > window.innerWidth - 12) m.style.left = (r.right - m.offsetWidth) + 'px';
    menuAperto = m;
    const primo = m.querySelector('button');
    if (primo) primo.focus();
  }
  document.addEventListener('mousedown', e => { if (menuAperto && !menuAperto.contains(e.target)) chiudiMenu(); });

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

  /** Una riga cliccabile di un elenco in una scheda (Dashboard, Amministrazione, referenti...). */
  function riga(opzioni) {
    const o = opzioni || {};
    const tag = o.onclick ? 'button' : 'div';
    return h(tag, Object.assign({ type: o.onclick ? 'button' : null, class: 'riga' + (o.classe ? ' ' + o.classe : ''), onclick: o.onclick || null }, o.attr || {}),
      o.sinistra || null,
      h('span', { class: 'corpo' }, h('span', { class: 't1' }, o.titolo), o.sotto ? h('span', { class: 't2' }, o.sotto) : null),
      o.destra || null,
      o.onclick && o.freccia !== false ? h('span', { class: 'freccia' }, icona('freccia', 18, 2.2)) : null);
  }

  /** L'icona in un quadrato a raggio 12 (righe della Dashboard e dell'Amministrazione). */
  function quadrato(nomeIcona, classe) {
    return h('span', { class: 'ico-riga ' + (classe || 'ico-grigio') }, icona(nomeIcona, 20, 2.2));
  }

  /** Segnaposto che pulsano piano, mentre si carica. */
  function segnaposto(righe, alto) {
    return h('div', { class: 'segnaposti', 'aria-hidden': 'true' },
      Array.from({ length: righe || 3 }, () => h('div', { class: 'segnaposto', style: { height: (alto || 64) + 'px' } })));
  }

  /** Copia negli appunti (la password iniziale). */
  async function copiaTesto(testo) {
    try {
      await navigator.clipboard.writeText(testo);
      return true;
    } catch (e) {
      const t = h('textarea', { style: { position: 'fixed', opacity: '0' } });
      t.value = testo;
      document.body.append(t);
      t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (x) { ok = false; }
      t.remove();
      return ok;
    }
  }

  radice.WisperBase = {
    $, h, aggiungi, svuota, ICONE, icona, tondo, lettere, iniziali, stato, pillola, avviso, lavora,
    finestra, conferma, apriMenu, chiudiMenu, campo, conSuffisso, selezione, segmenti, cerca, riga, quadrato, segnaposto, copiaTesto,
  };
})(window);
