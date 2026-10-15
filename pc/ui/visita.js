/*
 * Wisper Ufficio: la visita guidata (docs/aspetto.md §9).
 *
 * Si impara sulle pagine vere, coi dati di esempio, facendo le cose: un velo
 * scuro con un buco attorno all'elemento, un fumetto con UNA frase, e nei passi
 * "da fare" si va avanti solo facendo il clic vero. Niente istruzioni scritte
 * fisse nelle pagine: quello che c'è da sapere lo dice la visita, una volta.
 *
 * Gli elementi da illuminare hanno l'attributo data-visita="nome". Le pagine
 * chiamano Visita.azione("nome") quando l'azione è fatta davvero.
 */
(function (radice) {
  'use strict';

  const PASSI = [
    { bersaglio: 'da-fatturare', titolo: 'Da fatturare', frase: 'Qui vedi subito quanto c\'è da fatturare questo mese.' },
    { bersaglio: 'prepara-riepilogo', titolo: 'Il riepilogo', frase: 'Una scheda per chi paga, coi suoi rapportini. Fai clic su Prepara riepilogo.', fai: true },
    { bersaglio: 'invia-email', titolo: 'Invia', frase: 'Il PDF parte per email con un clic. È un esempio: non parte niente.', fai: true },
    { bersaglio: 'segna-fatturati', titolo: 'Dopo la fattura', frase: 'Quando hai fatto la fattura, segnali qui.', fai: true },
    { bersaglio: 'nav-rapportini', titolo: 'I rapportini', frase: 'Tutti i rapportini, divisi per chi paga. Fai clic su Rapportini.', fai: true },
    { bersaglio: 'segmento-firmare', titolo: 'Da firmare', frase: 'Restano solo quelli che il cliente non ha ancora firmato.', fai: true },
    { bersaglio: 'riga-rapportino', titolo: 'Un rapportino', frase: 'Fai clic su una riga per aprirla.', fai: true },
    { bersaglio: 'azione-gialla', titolo: 'La cosa da fare', frase: 'Il pulsante giallo è sempre la cosa da fare adesso.' },
    { bersaglio: null, titolo: 'Ecco fatto', frase: 'Adesso Wisper Ufficio lavora con i tuoi rapportini veri.' },
  ];

  const MARGINE = 8;
  let attiva = false;
  let indice = 0;
  let radiceEl = null;
  let el = {};
  let giro = 0;
  let quando = { inizio: () => {}, fine: () => {} };

  const ultimo = () => indice === PASSI.length - 1;

  function crea(tag, classe, testo) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo !== undefined) e.textContent = testo;
    return e;
  }

  function costruisci() {
    radiceEl = crea('div', 'visita');
    radiceEl.setAttribute('role', 'dialog');
    radiceEl.setAttribute('aria-label', 'Visita guidata');
    el.buco = crea('div', 'buco senza');
    el.blocchi = [0, 1, 2, 3].map(() => {
      const b = crea('div', 'blocco');
      b.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); scatto(); });
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
      return b;
    });
    el.mano = crea('div', 'mano');
    el.fumetto = crea('div', 'fumetto');
    el.salta = crea('button', 'salta', 'Salta la visita');
    el.salta.type = 'button';
    el.salta.addEventListener('click', () => fine());
    radiceEl.append(el.buco, ...el.blocchi, el.mano, el.fumetto, el.salta);
    document.body.append(radiceEl);
  }

  function scatto() {
    el.fumetto.classList.remove('scatto');
    void el.fumetto.offsetWidth;
    el.fumetto.classList.add('scatto');
  }

  function bottone(testo, classe, fn) {
    const b = crea('button', 'btn ' + classe, testo);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  function disegnaFumetto() {
    const p = PASSI[indice];
    const f = el.fumetto;
    while (f.firstChild) f.removeChild(f.firstChild);
    if (!ultimo()) {
      const su = crea('div', 'su');
      su.append(crea('span', 'esempio', 'Esempio'), crea('span', 'piccolo', (indice + 1) + ' di ' + (PASSI.length - 1)));
      f.append(su);
    }
    f.append(crea('h3', null, p.titolo), crea('p', null, p.frase));
    const giu = crea('div', 'giu');
    const prima = PASSI[indice - 1];
    if (prima && !prima.fai && !ultimo()) giu.append(bottone('Indietro', 'testo', () => { indice--; aggiorna(); }));
    giu.append(crea('span', 'spazio'));
    if (!p.fai) giu.append(bottone(ultimo() ? 'Inizia' : 'Avanti', 'giallo', () => avanti()));
    // Nei passi da fare senza Indietro non c'è nessun pulsante: niente riga vuota.
    if (giu.querySelector('button')) f.append(giu);
    el.salta.classList.toggle('nascosto', ultimo());
  }

  function bersaglioDi(p) {
    if (!p.bersaglio) return null;
    const tutti = Array.from(document.querySelectorAll('[data-visita="' + p.bersaglio + '"]'));
    const visibile = tutti.find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return visibile || null;
  }

  /** Ogni fotogramma: il buco segue l'elemento (la pagina si ridisegna, scorre, si allarga). */
  function segui() {
    if (!attiva) return;
    const p = PASSI[indice];
    const t = bersaglioDi(p);
    const W = window.innerWidth;
    const H = window.innerHeight;
    let r = null;
    if (t) {
      const b = t.getBoundingClientRect();
      r = { top: b.top - MARGINE, left: b.left - MARGINE, width: b.width + 2 * MARGINE, height: b.height + 2 * MARGINE };
    }
    const chiave = r ? [r.top, r.left, r.width, r.height].map(Math.round).join(',') : 'niente';
    if (chiave !== el.buco.dataset.dove) {
      el.buco.dataset.dove = chiave;
      if (r) {
        el.buco.classList.remove('senza');
        Object.assign(el.buco.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' });
      } else {
        el.buco.classList.add('senza');
        Object.assign(el.buco.style, { top: H / 2 + 'px', left: W / 2 + 'px' });
      }
      // Fuori dal buco i clic si fermano; dentro arrivano all'elemento vero, ma solo nei passi da fare.
      const pieno = !r || !p.fai;
      const zone = pieno ? [[0, 0, W, H], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] : [
        [0, 0, W, Math.max(0, r.top)],
        [0, r.top + r.height, W, Math.max(0, H - r.top - r.height)],
        [0, r.top, Math.max(0, r.left), r.height],
        [r.left + r.width, r.top, Math.max(0, W - r.left - r.width), r.height],
      ];
      el.blocchi.forEach((b, i) => Object.assign(b.style, { left: zone[i][0] + 'px', top: zone[i][1] + 'px', width: zone[i][2] + 'px', height: zone[i][3] + 'px' }));
      el.mano.classList.toggle('nascosto', !(r && p.fai));
      if (r && p.fai) {
        // Nell'angolo in basso a destra, per non coprire la scritta.
        Object.assign(el.mano.style, { left: (r.left + r.width - 28) + 'px', top: (r.top + r.height - 28) + 'px' });
      }
      posizionaFumetto(r);
    }
    giro = requestAnimationFrame(segui);
  }

  function posizionaFumetto(r) {
    const f = el.fumetto;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const fw = f.offsetWidth || 360;
    const fh = f.offsetHeight || 170;
    let top;
    let left;
    if (!r) { top = (H - fh) / 2; left = (W - fw) / 2; }
    else if (r.top + r.height + fh + 24 < H) { top = r.top + r.height + 14; left = r.left; }
    else if (r.top - fh - 14 > 12) { top = r.top - fh - 14; left = r.left; }
    else if (r.left + r.width + fw + 24 < W) { top = Math.max(12, r.top); left = r.left + r.width + 14; }
    else { top = Math.max(12, r.top); left = r.left - fw - 14; }
    left = Math.min(Math.max(16, left), W - fw - 16);
    top = Math.min(Math.max(12, top), H - fh - 12);
    f.style.left = left + 'px';
    f.style.top = top + 'px';
  }

  function aggiorna() {
    disegnaFumetto();
    el.buco.dataset.dove = '';
  }

  function avanti() {
    if (ultimo()) { fine(); return; }
    indice++;
    aggiorna();
  }

  /** Le pagine la chiamano quando si fa un'azione: se è quella che il passo chiede, si va avanti. */
  function azione(nome) {
    if (attiva && PASSI[indice].fai && PASSI[indice].bersaglio === nome) avanti();
  }

  // Durante la visita Esc non chiude le finestre: la si lascia solo con "Salta".
  function fermaEsc(e) { if (attiva && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); } }

  function inizia(callback) {
    if (attiva) return;
    quando = Object.assign({ inizio: () => {}, fine: () => {} }, callback || {});
    attiva = true;
    indice = 0;
    quando.inizio();
    costruisci();
    aggiorna();
    document.addEventListener('keydown', fermaEsc, true);
    giro = requestAnimationFrame(segui);
  }

  function fine() {
    if (!attiva) return;
    attiva = false;
    cancelAnimationFrame(giro);
    document.removeEventListener('keydown', fermaEsc, true);
    if (radiceEl) radiceEl.remove();
    radiceEl = null;
    el = {};
    quando.fine();
  }

  radice.WisperVisita = {
    inizia, azione, salta: fine,
    get attiva() { return attiva; },
  };
})(window);
