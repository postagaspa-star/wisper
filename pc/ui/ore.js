/*
 * Wisper Ufficio: Rapportini (docs/gestionale/fase3.md §5, risposte in architettura.md §14).
 *
 * 07/11/2026 (Manuel: "le Ore vanno tolte, non servono, metti solamente i Rapportini"): niente più segmento Ore
 * (timesheet, Registra ore, timer, statistiche delle ore). Restano due segmenti, il secondo solo per chi approva:
 *  - Rapportini: l'elenco (app.js, vistaRapportini), con la pillola Da approvare / Respinto;
 *  - Da approvare: rapportini, spese e trasferte dei collaboratori, gruppi per persona, una casella per riga, le
 *    anomalie in giallo scuro, Approva (N) e Respingi col motivo, poi l'avviso con Annulla. Le voci "ore" che un
 *    server di prima manda ancora non si mostrano (RO.approvareSenzaOre).
 * I collegamenti vecchi (#rapportini/ore, #rapportini/statistiche, filtro segmento "ore") aprono i Rapportini.
 * Tutto quello che si vede viene dal server; ogni cambio va al server subito.
 */
(function (radice) {
  'use strict';

  radice.WisperOre = function (W) {
    const { S, C, Rete } = W;
    const RO = radice.WisperRegoleOreSpese;
    const { h, aggiungi, svuota, icona, avviso, lavora, finestra, campo, segmenti, segnaposto } = W.B;
    const interfaccia = () => (S.io && S.io.interfaccia) || {};
    const puoApprovare = () => interfaccia().puoApprovare === true;

    const M = { segmento: 'rapportini', approvare: null, scelte: new Set(), areaApprovare: null };

    const nomeDi = id => (S.ana.utenti.find(u => String(u.id) === String(id)) || { nome: '' }).nome;

    // ===================================================================== dati

    async function leggiApprovare() {
      if (M.approvare) return;
      M.approvare = RO.approvareSenzaOre(await Rete.get('/server/daApprovare'));
      // Si parte con tutte scelte: si tolgono le eccezioni (fase3.md §2.6).
      M.scelte = new Set(tutteLeVoci().map(RO.chiaveVoce));
    }

    function daRileggere() { M.approvare = null; }

    function conDati(pagina, prepara, disegna) {
      const zona = h('div', { class: 'sezione' }, segnaposto(4, 64));
      aggiungi(pagina, [zona]);
      prepara().then(() => { zona.remove(); disegna(); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.disegnaPagina() }, 'Riprova'))]);
      });
    }

    // ===================================================================== la pagina

    // I segmenti hanno anche il loro indirizzo: #rapportini/elenco, #rapportini/approvare. Quelli delle ore di prima
    // (#rapportini/ore, #rapportini/statistiche) portano ai Rapportini.
    const DA_INDIRIZZO = { elenco: 'rapportini', approvare: 'daApprovare', ore: 'rapportini', statistiche: 'rapportini' };
    const INDIRIZZO = { rapportini: 'elenco', daApprovare: 'approvare' };

    function vista(pagina, a1, filtro) {
      if (DA_INDIRIZZO[a1]) M.segmento = DA_INDIRIZZO[a1];
      if (filtro && filtro.segmento) M.segmento = filtro.segmento === 'daApprovare' ? 'daApprovare' : 'rapportini';
      if (M.segmento !== 'daApprovare' || !puoApprovare()) M.segmento = 'rapportini';
      if (M.segmento === 'rapportini') { W.vistaRapportini(pagina, { segmenti: segmentiRapportini() }); return; }
      aggiungi(pagina, [h('div', { class: 'testata alta' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Rapportini'), h('h1', null, 'Da approvare'))),
        h('div', null, segmentiRapportini())]);
      conDati(pagina, leggiApprovare, () => approvare(pagina));
    }

    /** Rapportini · Da approvare: solo per chi approva (per gli altri c'è un segmento solo, e allora niente segmenti). */
    function segmentiRapportini() {
      if (!puoApprovare()) return null;
      const n = M.approvare ? M.approvare.quante : ((S.dash && S.dash.numeri && S.dash.numeri.approvare && S.dash.numeri.approvare.voci) || 0);
      return segmenti([['rapportini', 'Rapportini'], ['daApprovare', 'Da approvare' + (n ? ' · ' + n : '')]], M.segmento, x => {
        M.segmento = x;
        W.vai('#rapportini/' + INDIRIZZO[x]);
      });
    }

    // ===================================================================== da approvare

    const tutteLeVoci = () => ((M.approvare && M.approvare.persone) || []).reduce((a, p) => a.concat(p.voci || []), []);
    const selezionate = () => tutteLeVoci().filter(v => M.scelte.has(RO.chiaveVoce(v)));

    function approvare(pagina) {
      M.areaApprovare = h('div', { class: 'sezione stretta-900' });
      aggiungi(pagina, [M.areaApprovare]);
      disegnaApprovare();
    }

    function disegnaApprovare() {
      const area = M.areaApprovare;
      if (!area) return;
      svuota(area);
      const d = M.approvare || { quante: 0, persone: [] };
      const tutte = tutteLeVoci();
      if (!tutte.length) { aggiungi(area, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente da approvare')]); return; }
      const n = selezionate().length;
      const tutteScelte = n === tutte.length;
      aggiungi(area, [h('div', { class: 'testa-approvare' },
        h('span', { class: 'etichetta' }, (d.quante === 1 ? '1 voce' : d.quante + ' voci') + (d.conAnomalie ? ' · ' + d.conAnomalie + ' con un\'anomalia' : '')),
        h('span', { class: 'spazio' }),
        h('button', { type: 'button', class: 'btn collegamento', onclick: () => { M.scelte = tutteScelte ? new Set() : new Set(tutte.map(RO.chiaveVoce)); disegnaApprovare(); } }, tutteScelte ? 'Togli la selezione' : 'Seleziona tutto'))]);
      d.persone.forEach(p => aggiungi(area, [h('div', { class: 'sezione-dash' },
        h('span', { class: 'etichetta' }, p.nome + ' · ' + p.quante),
        h('div', { class: 'scheda righe' }, (p.voci || []).map(rigaVoce)))]));
      aggiungi(area, [h('div', { class: 'azioni-approva' },
        h('button', { type: 'button', class: 'btn grande', disabled: !n, onclick: respingi }, 'Respingi'),
        h('button', { type: 'button', class: 'btn grande giallo', disabled: !n, 'data-visita': 'approva', onclick: () => decidi('approva') }, 'Approva (' + n + ')'))]);
    }

    function rigaVoce(v) {
      const k = RO.chiaveVoce(v);
      const scelta = M.scelte.has(k);
      const anomalie = v.anomalie || [];
      return h('button', { type: 'button', class: 'riga voce-app', role: 'checkbox', 'aria-checked': scelta ? 'true' : 'false',
        onclick: () => { if (scelta) M.scelte.delete(k); else M.scelte.add(k); disegnaApprovare(); } },
      h('span', { class: 'casella-app' + (scelta ? ' scelta' : ''), 'aria-hidden': 'true' }, scelta ? icona('spunta', 15, 3) : null),
      h('span', { class: 'corpo' }, h('span', { class: 't1' }, v.cosa + (v.dettaglio ? ' · ' + v.dettaglio : '')),
        anomalie.length ? h('span', { class: 't2 anomalia' }, icona('allarme', 14, 2.4), anomalie.map(a => a.testo).join(' · '))
          : v.km ? h('span', { class: 't2' }, C.numero(v.km) + ' km') : null),
      h('span', { class: 'quanto' }, RO.quantoVoce(v)));
    }

    /** Approva o respingi le voci scelte, poi l'avviso con Annulla (annullaApprovazione). */
    async function decidi(decisione, motivo) {
      const voci = selezionate().map(v => ({ tipo: v.tipo, id: v.id }));
      if (!voci.length) { avviso(decisione === 'approva' ? 'Scegli cosa approvare' : 'Scegli cosa respingere', true); return false; }
      const ris = await lavora(decisione === 'approva' ? 'Approvo' : 'Respingo', () => Rete.post('/server/' + decisione, decisione === 'approva' ? { voci } : { voci, motivo }));
      if (!ris) return false;
      dopoDecisione();
      avviso(RO.fraseDecisione(typeof ris.fatte === 'number' ? ris.fatte : voci.length, decisione), false, null, { testo: 'Annulla', fn: async () => {
        const r = await lavora('Rimetto da approvare', () => Rete.post('/server/annullaApprovazione', { voci }));
        if (r) { dopoDecisione(); avviso(RO.fraseDecisione(typeof r.fatte === 'number' ? r.fatte : voci.length, 'annulla')); }
      } });
      if (decisione === 'approva') W.Visita.azione('approva');
      return true;
    }

    function dopoDecisione() {
      M.approvare = null;
      W.rileggiRapportini();
      W.caricaDashboard();
      W.disegnaPagina();
    }

    /** Respingi: il motivo è obbligatorio e arriva a chi ha scritto. */
    function respingi() {
      const sel = selezionate();
      if (!sel.length) return;
      const motivo = h('textarea', { rows: 3 });
      const nomi = Array.from(new Set(sel.map(v => nomeDi(v.idUtente).split(' ')[0]).filter(Boolean)));
      const a = nomi.length > 1 ? nomi.slice(0, -1).join(', ') + ' e ' + nomi[nomi.length - 1] : (nomi[0] || 'chi le ha scritte');
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, 'Il motivo arriva a ' + a + ': può correggere e rimandare.'), campo('Motivo', motivo, errore)]);
      disegna();
      motivo.addEventListener('input', () => { if (errore) { errore = ''; disegna(); motivo.focus(); } });
      let chiudi;
      const conferma = async () => {
        if (!motivo.value.trim()) { errore = 'Scrivi il motivo: arriva a chi l\'ha scritta'; disegna(); motivo.focus(); return; }
        const ok = await decidi('respingi', motivo.value.trim());
        if (ok) chiudi();
      };
      chiudi = finestra({ titolo: sel.length === 1 ? 'Perché la respingi?' : 'Perché le respingi?', corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: conferma }, 'Respingi (' + sel.length + ')')] });
    }

    return { vista, M, daRileggere };
  };
})(window);
