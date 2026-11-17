/*
 * Wisper Ufficio: i Modelli dei documenti (docs/gestionale/modelli.md, 17/11/2026; prototipo docs/prototipo/Modelli.html).
 *
 * Andrea: "censisci i modelli che Wisper può creare [...] e ad ognuno dai un codice, che deve apparire nei posti opportuni di
 * Wisper, oltre ad avere anche una sua pagina dove poterli vedere tutti con relativi esempi, senza però poterne creare di
 * nuovi".
 *
 *  - la pagina (#modelli): i modelli divisi per famiglia, una scheda per modello con l'esempio in miniatura, il codice, il
 *    nome e quando esce. Si guarda e basta: niente "Nuovo", l'elenco è quello di documenti.js;
 *  - la finestra del modello (apri): l'esempio grande, quando esce, dove si crea, i testi che si cambiano e "Apri l'esempio
 *    in PDF" (il documento vero, col codice in fondo alla pagina);
 *  - la sigla (sigla): "Mod. RAP-01", il pulsantino che le altre pagine mettono dove un documento si prepara; apre la
 *    finestra del modello senza lasciare la pagina.
 *
 * L'esempio non è un'immagine: è il documento fatto adesso dal modello vero (modelli-esempi.js), mostrato in anteprima.html
 * (lì lo stile del documento è permesso; in questa pagina no).
 */
(function (radice) {
  'use strict';

  radice.WisperModelli = function (W) {
    const { S, B, D, R, Rete } = W;
    const E = radice.WisperModelliEsempi;
    const { h, aggiungi, svuota, avviso, lavora, finestra } = B;
    const FAI = (radice.WisperRegoleCasa && radice.WisperRegoleCasa.VOCI_FAI) || {};

    /** La voce del menu che dà il colore alla famiglia (fai.md §3: ogni voce ha il suo colore). */
    const VOCE_DI = { Rapportini: 'rapportini', Preventivi: 'preventivi', Fatture: 'fatturazione', 'Lettere e contratti': 'documenti' };
    /** Dove si crea ogni modello: la pagina a cui porta "Vai a …" e il nome sul pulsante. */
    const PAGINA_DI = {
      'RAP-01': ['#rapportini', 'Rapportini'], 'RAP-02': ['#rapportini', 'Rapportini'], 'RAP-03': ['#rapportini', 'Rapportini'], 'RAP-04': ['#portale', 'Portale clienti'],
      'PRE-01': ['#preventivi', 'Preventivi'], 'PRE-02': ['#preventivi', 'Preventivi'],
      'FAT-01': ['#fatturazione', 'Fatture'], 'FAT-02': ['#fatturazione', 'Fatture'], 'FAT-03': ['#fatturazione', 'Fatture'],
      'LET-01': ['#documenti/modelli', 'Documenti'], 'LET-02': ['#collaboratori', 'Collaboratori'], 'ASS-01': ['#ticket/contratti', 'Ticket'],
    };
    const LARGO_A4 = 794;   // 210 mm a 96 punti per pollice: la larghezza del documento nell'anteprima

    const impostazioni = () => (S.ana && S.ana.impostazioni) || null;
    const esc = D.esc;

    /**
     * Il documento com'è sul foglio: i margini della pagina e, in fondo, il piè che la stampa mette nei margini (lo studio a
     * sinistra, il codice del modello a destra). A schermo i margini della stampa non ci sono: si rifanno qui.
     */
    function perSchermo(html) {
      const sx = (/@bottom-left \{ content: "([^"]*)"/.exec(html) || [])[1] || '';
      const dx = ((/@bottom-right \{ content: (?:url\("[^"]*"\) )?"([^"]*)"/.exec(html) || [])[1] || '').replace(/( · )?Pagina $/, '').trim();
      const piede = '<div class="piede-schermo"><span>' + esc(sx.replace(/\\A /g, '\n')) + '</span><span>' + esc(dx) + '</span></div>';
      const stile = '<style>html { background: #fff; } body { box-sizing: border-box; width: 210mm; min-height: 297mm; padding: 14mm 14mm 18mm; position: relative; overflow-x: hidden; }' +
        '.piede-schermo { position: absolute; left: 14mm; right: 14mm; bottom: 7mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; ' +
        'font: 500 8.5px "Figtree", "Segoe UI", Arial, sans-serif; color: #8A8A92; white-space: pre-line; }</style>';
      return html.replace('</head>', stile + '</head>').replace('</body>', piede + '</body>');
    }

    // anteprima.html chiede qui il suo documento e dice quanto è alto.
    radice.WisperAnteprima = codice => {
      const html = E.esempio(codice, impostazioni());
      return html ? perSchermo(html) : '';
    };
    radice.WisperAnteprimaPronta = (cornice, alto) => {
      if (!cornice) return;
      cornice.dataset.alto = String(alto || 0);
      cornice.dispatchEvent(new CustomEvent('pronta'));
    };

    /** L'esempio in una cornice: anteprima.html#<codice>. */
    function cornice(m, attributi) {
      return h('iframe', Object.assign({ src: 'anteprima.html#' + encodeURIComponent(m.codice), title: 'Esempio di ' + m.nome, tabindex: '-1' }, attributi || {}));
    }

    /** Il codice col colore della famiglia: "RAP-01". */
    function codice(m) {
      const fai = FAI[VOCE_DI[m.famiglia]] || FAI.documenti || { f: '#EAECF0', t: '#344054' };
      const c = h('span', { class: 'cod-modello', 'data-codice': m.codice }, m.codice);
      c.style.setProperty('--v-f', fai.f);
      c.style.setProperty('--v-t', fai.t);
      return c;
    }

    // ===================================================================== la pagina

    function vista(pagina, daAprire) {
      const famiglie = [];
      D.MODELLI.forEach(m => { if (famiglie.indexOf(m.famiglia) < 0) famiglie.push(m.famiglia); });
      const griglie = [];
      aggiungi(pagina, [
        h('div', { class: 'testata alta' },
          h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'I documenti che Wisper crea'),
            h('h1', null, 'Modelli dei documenti', h('span', { class: 'conta-modelli' }, ' · ' + D.MODELLI.length)))),
        famiglie.map(f => {
          const griglia = h('div', { class: 'griglia-modelli' }, D.MODELLI.filter(m => m.famiglia === f).map(scheda));
          griglie.push(griglia);
          return h('section', { class: 'famiglia-modelli', 'data-famiglia': f }, h('span', { class: 'etichetta' }, f), griglia);
        })]);
      // Le miniature seguono la larghezza delle schede.
      const scala = () => pagina.querySelectorAll('.mod-mini').forEach(mini => {
        const l = mini.clientWidth;
        if (l) mini.firstChild.style.transform = 'scale(' + (l / LARGO_A4) + ')';
      });
      scala();
      if (typeof ResizeObserver === 'function') {
        const guarda = new ResizeObserver(() => { if (!pagina.isConnected) { guarda.disconnect(); return; } scala(); });
        griglie.forEach(g => guarda.observe(g));
      }
      if (daAprire && D.trovaModello(daAprire)) apri(daAprire);
    }

    /** La scheda di un modello: l'esempio in miniatura, il codice, il nome, quando esce. */
    function scheda(m) {
      return h('button', { type: 'button', class: 'mod-carta', 'data-modello': m.codice, 'aria-label': m.codice + ', ' + m.nome, onclick: () => apri(m.codice) },
        h('span', { class: 'mod-mini', 'aria-hidden': 'true' }, cornice(m, { loading: 'lazy' })),
        h('span', { class: 'mod-testi' }, codice(m), h('b', null, m.nome), h('span', { class: 'mod-quando' }, m.quando)));
    }

    // ===================================================================== la finestra del modello

    /** Apre il modello con quel codice sopra la pagina dove si è (anche dalle altre pagine, con la sigla). */
    function apri(cod) {
      const m = D.trovaModello(cod);
      if (!m) return;
      const foglio = h('div', { class: 'mod-foglio' });
      const f = cornice(m, { tabindex: '0' });
      aggiungi(foglio, [f]);
      const scala = () => {
        const l = foglio.clientWidth;
        const alto = Number(f.dataset.alto) || 1123;
        if (!l) return;
        const s = l / LARGO_A4;
        f.style.height = alto + 'px';
        f.style.transform = 'scale(' + s + ')';
        foglio.style.height = Math.round(alto * s) + 'px';
      };
      f.addEventListener('pronta', scala);
      let chiudi;
      // Aperto dalla sigla sopra un'altra finestra (l'invio, il passaggio al programma): si guarda e si torna lì, senza
      // i collegamenti che cambiano pagina (la finestra di sotto resterebbe aperta sulla pagina sbagliata).
      const sopra = !!document.querySelector('.velo');
      const dove = sopra ? null : PAGINA_DI[m.codice];
      const vaiDove = dove && R.paginaPermessa(W.perm(), dove[0]) && W.funzioneAccesa(R.moduloDi(dove[0]))
        ? h('button', { type: 'button', class: 'btn collegamento', 'data-azione': 'vai-dove', onclick: () => { chiudi(); W.vai(dove[0]); } }, 'Vai a ' + dove[1]) : null;
      const testi = !sopra && m.testi && R.paginaPermessa(W.perm(), '#documenti') && W.funzioneAccesa('documenti')
        ? h('div', { class: 'voce-m' }, h('span', { class: 'etichetta' }, 'Testi che si cambiano'),
          h('button', { type: 'button', class: 'btn collegamento', 'data-azione': 'testi-modello', onclick: () => { chiudi(); W.vai('#documenti/modelli/' + m.testi); } }, 'Apri i testi del modello')) : null;
      const pdf = h('button', { type: 'button', class: 'btn giallo grande', 'data-azione': 'esempio-pdf', onclick: () => esempioPdf(m) }, 'Apri l\'esempio in PDF');
      chiudi = finestra({
        titolo: m.nome, larghezza: 'larga modello', fuoco: false, testaExtra: codice(m),
        corpo: h('div', { class: 'corpo-modello' },
          h('div', { class: 'mod-grande' }, foglio),
          h('div', { class: 'scheda-modello' },
            h('div', { class: 'voce-m' }, h('span', { class: 'etichetta' }, 'Quando esce'), h('p', null, m.quando)),
            h('div', { class: 'voce-m' }, h('span', { class: 'etichetta' }, 'Dove si crea'), h('p', null, m.dove), vaiDove),
            testi)),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Chiudi'), pdf],
      });
      scala();
    }

    /** Il PDF dell'esempio: il documento vero, col codice in fondo a ogni pagina. */
    async function esempioPdf(m) {
      if (S.esempio) { avviso('Nella visita il PDF non si crea'); return; }
      const html = E.esempio(m.codice, impostazioni());
      const r = await lavora('Preparo il PDF', () => Rete.post('/locale/pdf', { html, nome: W.nomeFile(E.nomeEsempio(m.codice), ''), apri: true }));
      if (r) avviso('PDF salvato in ' + r.percorso);
    }

    // ===================================================================== la sigla nelle altre pagine

    /**
     * "Mod. RAP-01": il codice del modello dove il documento si prepara. Un pulsantino che apre il modello; null se il codice
     * non c'è (o se chi guarda non vede la pagina Modelli: allora resta una scritta).
     */
    function sigla(cod) {
      const m = D.trovaModello(cod);
      if (!m) return null;
      const testo = D.siglaModello(m.codice);
      if (!R.paginaPermessa(W.perm(), '#modelli')) return h('span', { class: 'sigla-modello ferma', 'data-modello': m.codice }, testo);
      return h('button', { type: 'button', class: 'sigla-modello', 'data-modello': m.codice, title: m.nome, 'aria-label': testo + ', ' + m.nome + ': vedi il modello',
        onclick: e => { e.stopPropagation(); e.preventDefault(); apri(m.codice); } }, testo);
    }

    /** "Mod. FAT-02" dentro un pulsante che crea il documento: una scritta, non si tocca (il pulsante fa il suo lavoro). */
    function nota(cod) {
      const m = D.trovaModello(cod);
      return m ? h('span', { class: 'mod-nota', 'data-modello': m.codice }, D.siglaModello(m.codice)) : null;
    }

    return { vista, apri, sigla, nota, codice, perSchermo };
  };
})(typeof window !== 'undefined' ? window : globalThis);
