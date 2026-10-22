/*
 * Wisper Ufficio: Ore e rapportini (docs/gestionale/fase3.md §5, prototipo
 * docs/prototipo/Gestionale-fase3.html, vista Computer; risposte in architettura.md §14).
 *
 * Tre segmenti in alto: Ore · Rapportini · Da approvare (l'ultimo solo per chi approva).
 *  - Ore: il timesheet della settimana di una persona (righe = commesse più Studio,
 *    colonne = giorni, celle da scrivere con la virgola, totali per riga e per giorno),
 *    il timer nella testata (Avvia con la commessa, il tempo che scorre, Ferma -> la
 *    bozza da correggere), il modulo Registra ore, le righe della settimana una per una;
 *  - Rapportini: l'elenco di sempre (app.js), con la pillola Da approvare / Respinto;
 *  - Da approvare: gruppi per persona, una casella per riga, le anomalie in giallo
 *    scuro, Approva (N) e Respingi col motivo, poi l'avviso con Annulla.
 * Statistiche (#rapportini/statistiche): ore per persona e per commessa, barre orizzontali.
 * Tutto quello che si vede viene dal server; ogni cambio va al server subito.
 */
(function (radice) {
  'use strict';

  radice.WisperOre = function (W) {
    const { S, C, B, Rete } = W;
    const RO = radice.WisperRegoleOreSpese;
    const { h, aggiungi, svuota, icona, tondo, pillola, avviso, lavora, finestra, campo, conSuffisso, selezione, segmenti, segnaposto, riga } = B;
    const puo = W.puo;
    const soldi = W.soldi;
    const scrive = () => puo('rapportini', 2);
    const oggi = () => C.oggiIso();
    const io = () => (S.io && S.io.utente && S.io.utente.id) || null;
    const interfaccia = () => (S.io && S.io.interfaccia) || {};
    /** Il collaboratore vede e scrive solo le sue ore (lo decide il server: qui si nasconde il resto). */
    const soloSuoi = () => !!interfaccia().soloSuoi || !!(S.io && S.io.utente && S.io.utente.ruolo === 'collaboratore');
    const puoApprovare = () => interfaccia().puoApprovare === true;

    // ore = la risposta di "ore" per la settimana e la persona di chiave; aggiunte = le
    // commesse messe a mano nel timesheet (per settimana e persona), ancora senza ore.
    const M = {
      segmento: 'ore', giorno: '', persona: null, ore: null, chiave: '', aggiunte: {}, evidenzia: '',
      timer: null, timerLetto: 0, approvare: null, scelte: new Set(), mese: '', stat: null, statChiave: '', attivita: null,
      area: null, zonaTimer: null, areaApprovare: null,
    };

    // Il tempo del timer scorre da solo, ovunque si veda (testata, Dashboard).
    const tempoTimer = () => RO.durata(RO.secondiTimer(M.timer, M.timerLetto));
    setInterval(() => {
      if (!M.timer) return;
      document.querySelectorAll('[data-timer-tempo]').forEach(el => { el.textContent = tempoTimer(); });
    }, 1000);

    const persone = () => S.ana.utenti.filter(u => u.attivo !== false && u.ruolo !== 'lettura');
    const nomeDi = id => (S.ana.utenti.find(u => String(u.id) === String(id)) || { nome: '' }).nome;
    /** La persona del timesheet: la propria; chi vede tutti ne sceglie un'altra (lettura parte dalla prima). */
    function personaVista() {
      if (soloSuoi()) return io();
      if (M.persona !== null && M.persona !== undefined) return M.persona;
      if (S.io && S.io.utente && S.io.utente.ruolo === 'lettura') { const p = persone()[0]; return p ? p.id : io(); }
      return io();
    }
    const settimana = () => RO.settimanaDi(M.giorno || oggi());
    const commesseAperte = () => S.ana.commesse.filter(m => m.stato === 'APERTA' && !m.archiviata && !m.modello);
    const nomeCommessa = id => (W.commessa(id) || {}).descrizione || '';

    /** Le commesse usate di recente (ore della settimana, poi rapportini): le prime da toccare. */
    function recentiCommesse(n) {
      const visti = [];
      const metti = id => {
        const k = RO.chiaveCommessa(id);
        const m = k && W.commessa(k);
        if (m && m.stato === 'APERTA' && !m.archiviata && !m.modello && visti.indexOf(k) < 0) visti.push(k);
      };
      ((M.ore && M.ore.ore) || []).slice().reverse().forEach(o => metti(o.idCommessa));
      C.ordina(W.attivi(), 'data', -1).forEach(r => metti(r.idCommessa));
      if (visti.length < n) commesseAperte().forEach(m => metti(m.id));
      return visti.slice(0, n);
    }

    // ===================================================================== dati

    async function leggiOre() {
      const g = settimana();
      const p = personaVista();
      const chiave = g[0] + '|' + p;
      if (M.ore && M.chiave === chiave) return;
      const r = await Rete.get('/server/ore?da=' + g[0] + '&a=' + g[6] + (p ? '&utente=' + encodeURIComponent(p) : ''));
      M.ore = r;
      M.chiave = chiave;
    }

    /** Il proprio timer (uno per persona, nel server): sopravvive alla chiusura del programma. */
    async function leggiTimer() {
      if (!puo('rapportini')) { M.timer = null; return; }
      try {
        const r = await Rete.get('/server/timer');
        M.timer = r.timer || null;
        M.timerLetto = Date.now();
      } catch (e) {
        if (e && e.accesso === false) throw e;
      }
    }

    async function leggiApprovare() {
      if (M.approvare) return;
      const r = await Rete.get('/server/daApprovare');
      M.approvare = r;
      // Si parte con tutte scelte: si tolgono le eccezioni (fase3.md §2.6).
      M.scelte = new Set(tutteLeVoci().map(RO.chiaveVoce));
    }

    function daRileggere() { M.ore = null; M.approvare = null; M.stat = null; }

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

    // I segmenti hanno anche il loro indirizzo: #rapportini/ore, #rapportini/elenco, #rapportini/approvare.
    const DA_INDIRIZZO = { ore: 'ore', elenco: 'rapportini', approvare: 'daApprovare' };
    const INDIRIZZO = { ore: 'ore', rapportini: 'elenco', daApprovare: 'approvare' };

    function vista(pagina, a1, filtro) {
      if (DA_INDIRIZZO[a1]) M.segmento = DA_INDIRIZZO[a1];
      if (filtro) {
        if (filtro.segmento) M.segmento = filtro.segmento;
        if (filtro.giorno) { M.giorno = filtro.giorno; M.evidenzia = filtro.giorno; }
      }
      if (a1 === 'statistiche') { conDati(pagina, leggiStatistiche, () => statistiche(pagina)); return; }
      if (M.segmento === 'daApprovare' && !puoApprovare()) M.segmento = 'ore';
      if (M.segmento === 'rapportini') { W.vistaRapportini(pagina, { segmenti: segmentiOre() }); return; }
      if (M.segmento === 'daApprovare') {
        aggiungi(pagina, [h('div', { class: 'testata alta' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Ore e rapportini'), h('h1', null, 'Da approvare'))),
          h('div', null, segmentiOre())]);
        conDati(pagina, leggiApprovare, () => approvare(pagina));
        return;
      }
      testataOre(pagina);
      conDati(pagina, () => Promise.all([leggiOre(), leggiTimer()]), () => { disegnaZonaTimer(); settimanaOre(pagina); });
    }

    function segmentiOre() {
      const n = M.approvare ? M.approvare.quante : ((S.dash && S.dash.numeri && S.dash.numeri.approvare && S.dash.numeri.approvare.voci) || 0);
      const voci = [['ore', 'Ore'], ['rapportini', 'Rapportini', { 'data-visita': 'segmento-rapportini' }]];
      if (puoApprovare()) voci.push(['daApprovare', 'Da approvare' + (n ? ' · ' + n : '')]);
      return segmenti(voci, M.segmento, x => {
        M.segmento = x;
        W.vai('#rapportini/' + INDIRIZZO[x]);
        if (x === 'rapportini') W.Visita.azione('segmento-rapportini');
      });
    }

    function testataOre(pagina) {
      M.zonaTimer = h('span', { class: 'zona-timer', 'data-visita': 'timer' });
      disegnaZonaTimer();
      aggiungi(pagina, [h('div', { class: 'testata alta' },
        h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Ore e rapportini'), h('h1', null, 'La settimana')),
        h('div', { class: 'azioni-testa' },
          h('button', { type: 'button', class: 'btn', onclick: () => W.vai('#rapportini/statistiche') }, 'Statistiche'),
          M.zonaTimer,
          scrive() ? h('button', { type: 'button', class: 'btn giallo', 'data-visita': 'registra-ore', onclick: () => moduloOre(null) }, icona('piu', 18, 2.6), 'Registra ore') : null)),
      h('div', null, segmentiOre())]);
    }

    /** Il timer nella testata: "Avvia il timer", oppure il tempo che scorre e Ferma. */
    function disegnaZonaTimer() {
      const z = M.zonaTimer;
      if (!z) return;
      svuota(z);
      if (!scrive()) return;
      if (M.timer) {
        aggiungi(z, [h('button', { type: 'button', class: 'btn timer-acceso', onclick: fermaTimer, 'aria-label': 'Ferma il timer' },
          icona('stop', 16, 2.6), h('span', null, (M.timer.idCommessa || 'Studio') + ' · '), h('span', { class: 'tempo', 'data-timer-tempo': '' }, tempoTimer()), h('span', null, ' · Ferma'))]);
      } else {
        aggiungi(z, [h('button', { type: 'button', class: 'btn', onclick: avviaTimer }, icona('play', 16, 2.4), 'Avvia il timer')]);
      }
    }

    // ===================================================================== la settimana

    function settimanaOre(pagina) {
      M.area = h('div', { class: 'sezione' });
      aggiungi(pagina, [M.area]);
      disegnaSettimana();
      // Arrivando dalla Dashboard su un giorno (ore respinte): si porta in vista.
      if (M.evidenzia) {
        const g = M.evidenzia;
        M.evidenzia = '';
        setTimeout(() => {
          const el = document.querySelector('[data-giorno-ore="' + g + '"]');
          if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('evidenziato'); }
        }, 80);
      }
    }

    function disegnaSettimana() {
      const area = M.area;
      if (!area || !area.isConnected) return;
      // Dopo il salvataggio di una cella il fuoco torna dove lo si era lasciato (Tab, clic).
      const attivo = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.cella : '';
      svuota(area);
      const sett = settimana();
      const ore = (M.ore && M.ore.ore) || [];
      const giorniServer = (M.ore && M.ore.giorni) || [];
      const giorni = RO.giorniDaMostrare(sett, ore, giorniServer);
      const persona = personaVista();
      const chiaveAgg = sett[0] + '|' + persona;
      const t = RO.timesheet(ore, giorni, M.aggiunte[chiaveAgg] || [], nomeCommessa);
      const questa = sett[0] === RO.settimanaDi(oggi())[0];
      const sposta = d => { M.giorno = RO.piuGiorni(sett[0], 7 * d); W.disegnaPagina(); };
      const totaleRap = Math.round(giorniServer.reduce((s, g) => s + C.num(g.oreRapportini), 0) * 100) / 100;

      aggiungi(area, [h('div', { class: 'testa-calendario' },
        tondo('indietro', 'Settimana prima', () => sposta(-1)),
        tondo('avanti', 'Settimana dopo', () => sposta(1)),
        h('h2', { class: 'titolo-calendario' }, RO.titoloSettimana(sett)),
        questa ? null : h('button', { type: 'button', class: 'btn piccolo', onclick: () => { M.giorno = ''; W.disegnaPagina(); } }, 'Questa settimana'),
        !soloSuoi() && persone().length > 1 ? selezione(persone().map(u => [u.id, String(u.id) === String(io()) ? 'Le mie ore' : u.nome]), persona, v => { M.persona = Number(v) || v; W.disegnaPagina(); }, { 'aria-label': 'Di chi' }) : null,
        h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.esporta('ore', { da: sett[0], a: sett[6], utente: persona || '' }) }, 'Esporta per Excel'))]);

      // ---- il timesheet
      const colonne = '112px minmax(0, 1fr) repeat(' + giorni.length + ', 78px) 84px';
      const tab = h('div', { class: 'tab timesheet', 'data-visita': 'timesheet' },
        h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } }, h('span', null, 'Commessa'), h('span'),
          giorni.map(g => h('span', { class: 'n' + (g === oggi() ? ' oggi' : '') }, RO.giornoBreve(g))), h('span', { class: 'n' }, 'Totale')));
      t.righe.forEach(r => aggiungi(tab, [h('div', { class: 'r', style: { gridTemplateColumns: colonne } },
        h('span', null, codiceCommessa(r.idCommessa)),
        h('span', { class: 'forte taglia', title: r.nome }, r.nome || (r.chiave ? r.chiave : 'Attività dello studio')),
        giorni.map(g => cellaTimesheet(r, g)),
        h('span', { class: 'n forte' }, r.totale ? C.ore(r.totale) : '—'))]));
      if (totaleRap > 0) {
        const perGiorno = {};
        giorniServer.forEach(g => { perGiorno[g.data] = C.num(g.oreRapportini); });
        aggiungi(tab, [h('div', { class: 'r tenue-riga', style: { gridTemplateColumns: colonne } }, h('span'), h('span', null, 'Ore dei rapportini'),
          giorni.map(g => h('span', { class: 'n' }, perGiorno[g] ? C.numero(perGiorno[g]) : '')), h('span', { class: 'n' }, C.ore(totaleRap)))]);
      }
      const rapDi = g => C.num((giorniServer.find(x => x.data === g) || {}).oreRapportini);
      aggiungi(tab, [h('div', { class: 'r piede', style: { gridTemplateColumns: colonne } }, h('span'), h('span', null, 'Totale del giorno'),
        giorni.map(g => { const x = Math.round((t.perGiorno[g] + rapDi(g)) * 100) / 100; return h('span', { class: 'n' }, x ? C.ore(x) : '—'); }),
        h('span', { class: 'n' }, C.ore(Math.round((t.totale + totaleRap) * 100) / 100)))]);
      aggiungi(area, [tab]);

      // ---- una commessa in più (le recenti, poi tutte le aperte)
      if (scrive()) {
        const presenti = new Set(t.righe.map(r => r.chiave));
        const recenti = recentiCommesse(6).filter(k => !presenti.has(k)).slice(0, 4);
        const altre = commesseAperte().filter(m => !presenti.has(RO.chiaveCommessa(m.id)));
        const aggiungiRiga = id => {
          if (!id) return;
          (M.aggiunte[chiaveAgg] || (M.aggiunte[chiaveAgg] = [])).push(id);
          disegnaSettimana();
          const primo = area.querySelector('[data-cella="' + RO.chiaveCommessa(id) + '|' + giorni[0] + '"]');
          if (primo) primo.focus();
        };
        if (recenti.length || altre.length) {
          aggiungi(area, [h('div', { class: 'aggiungi-riga' }, h('span', { class: 'etichetta' }, 'Un\'altra commessa'),
            recenti.map(k => h('button', { type: 'button', class: 'pillola', onclick: () => aggiungiRiga(k) }, '+ ' + k)),
            altre.length ? selezione([['', 'Scegli fra le aperte']].concat(altre.map(m => [m.id, m.id + ' · ' + m.descrizione])), '', aggiungiRiga, { 'aria-label': 'Aggiungi una commessa' }) : null)]);
        }
      }

      // ---- le righe della settimana, giorno per giorno (stati, orari, respinte col motivo)
      const visibili = ore.filter(o => !o.tolta);
      if (visibili.length) {
        const perGiorno = new Map();
        visibili.forEach(o => { if (!perGiorno.has(o.data)) perGiorno.set(o.data, []); perGiorno.get(o.data).push(o); });
        aggiungi(area, [h('h2', { class: 'titolo-sezione' }, 'Le righe della settimana'),
          Array.from(perGiorno.keys()).sort().map(g => {
            const lista = perGiorno.get(g);
            const tot = Math.round(lista.filter(o => o.stato !== 'respinta').reduce((s, o) => s + C.num(o.ore), 0) * 100) / 100;
            return h('div', { class: 'sezione-dash', 'data-giorno-ore': g },
              h('span', { class: 'etichetta' }, RO.giornoLungo(g) + ' · ' + C.ore(tot)),
              h('div', { class: 'scheda righe' }, lista.map(o => rigaOre(o, () => moduloOre(o)))));
          })]);
      } else if (!t.totale) {
        aggiungi(area, [h('p', { class: 'vuoto sinistra' }, soloSuoi() || String(persona) === String(io()) ? 'Nessuna ora registrata questa settimana.' : 'Nessuna ora registrata da ' + nomeDi(persona).split(' ')[0] + ' questa settimana.')]);
      }

      if (attivo) {
        const el = area.querySelector('[data-cella="' + attivo + '"]');
        if (el) { el.focus(); if (el.select) el.select(); }
      }
    }

    const codiceCommessa = id => h('span', { class: 'codice' + (id ? '' : ' studio') }, id || 'Studio');

    /** Una cella: un campo da scrivere se la regola lo permette (RO.cellaScrivibile), altrimenti apre il giorno. */
    function cellaTimesheet(r, g) {
      const c = r.celle[g];
      const s = RO.cellaScrivibile(c, scrive());
      const chiave = r.chiave + '|' + g;
      const etichetta = (r.chiave || 'Studio') + ', ' + RO.giornoLungo(g);
      if (s.scrivibile) {
        const respinta = s.riga && s.riga.stato === 'respinta';
        const prima = RO.valoreCella(respinta ? s.riga.ore : c.ore);
        const input = h('input', { type: 'text', inputmode: 'decimal', class: 'cella-ore' + (respinta ? ' respinta' : ''), value: prima, 'aria-label': 'Ore ' + etichetta,
          'data-cella': chiave, title: respinta ? 'Respinta: ' + (s.riga.motivoRifiuto || '') : null, autocomplete: 'off' });
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
          if (e.key === 'Escape') { input.value = prima; input.blur(); }
        });
        input.addEventListener('focus', () => input.select());
        input.addEventListener('change', () => scriviCella(r, g, input.value));
        return h('span', { class: 'n' }, input);
      }
      if (!c.righe.length) return h('span', { class: 'n' });
      const valore = c.ore ? C.numero(c.ore) : '0';
      return h('span', { class: 'n' }, h('button', { type: 'button', class: 'cella-ore apri', 'data-cella': chiave, 'aria-label': 'Ore ' + etichetta + ': ' + valore + ', apri il giorno',
        title: RO.motivoNonScrivibile(s.perche, c.righe.length) || null, onclick: () => finestraGiorno(r, g) }, valore));
    }

    /**
     * Scrivere una cella (la regola è in RO.azioneCella): nessuna riga -> ne nasce una
     * con le sole ore; una riga a mano -> cambiano solo le sue ore; zero -> la riga si
     * toglie (con Annulla); con inizio e fine, o con più righe, si apre il giorno.
     */
    async function scriviCella(r, g, valore) {
      const c = r.celle[g];
      const a = RO.azioneCella(c, valore, scrive());
      if (a.tipo === 'niente') return;
      if (a.tipo === 'apri') { finestraGiorno(r, g); return; }
      if (a.tipo === 'errore') { avviso(a.errore, true); disegnaSettimana(); return; }
      const persona = personaVista();
      const perAltri = !soloSuoi() && persona && String(persona) !== String(io()) ? { idUtente: persona } : {};
      let ris = null;
      let annulla = null;
      if (a.tipo === 'crea') {
        ris = await lavora('Salvo le ore', () => Rete.post('/server/salvaOre', { riga: Object.assign({ data: g, ore: a.ore, idCommessa: r.idCommessa }, perAltri) }));
        if (ris && ris.riga) annulla = () => Rete.post('/server/togliOre', { id: ris.riga.id });
      } else if (a.tipo === 'cambia') {
        ris = await lavora('Salvo le ore', () => Rete.post('/server/salvaOre', { riga: { id: a.id, ore: a.ore } }));
        if (ris) annulla = () => Rete.post('/server/salvaOre', { riga: { id: a.id, ore: a.prima } });
      } else if (a.tipo === 'togli') {
        ris = await lavora('Tolgo le ore', () => Rete.post('/server/togliOre', { id: a.id }));
        if (ris) annulla = () => Rete.post('/server/togliOre', { id: a.id, annulla: true });
      }
      M.ore = null;
      await rileggiSettimana();
      if (!ris) return;
      const st = ris.riga ? ris.riga.stato : '';
      avviso(a.tipo === 'togli' ? 'Ore tolte' : st === 'da_approvare' ? 'Ore salvate: vanno in approvazione' : 'Ore salvate', false, null, annulla ? { testo: 'Annulla', fn: async () => {
        const ok = await lavora('Rimetto com\'era', annulla);
        if (ok) { M.ore = null; await rileggiSettimana(); }
      } } : null);
      W.caricaDashboard();
    }

    async function rileggiSettimana() {
      try { await leggiOre(); } catch (e) { if (e && e.accesso === false) return; avviso(e.message || String(e), true); return; }
      disegnaSettimana();
    }

    /** Le righe di una cella che non si scrive (più righe, o con inizio e fine): una per una. */
    function finestraGiorno(r, g) {
      const righe = r.celle[g].righe;
      let chiudi;
      chiudi = finestra({
        titolo: (r.chiave || 'Studio') + ' · ' + RO.giornoLungo(g), fuoco: false,
        corpo: [h('div', { class: 'scheda righe' }, righe.map(o => rigaOre(o, () => { chiudi(); moduloOre(o); })))],
        pulsanti: [scrive() ? h('button', { type: 'button', class: 'btn grande', onclick: () => { chiudi(); moduloOre(null, { data: g, idCommessa: r.idCommessa }); } }, icona('piu', 18, 2.6), 'Aggiungi ore') : null,
          'spazio', h('button', { type: 'button', class: 'btn giallo grande', onclick: () => chiudi() }, 'Chiudi')].filter(Boolean),
      });
    }

    /** Una riga di ore: commessa, cosa, orari, fatturabile, stato (con la parola), le ore a destra. */
    function rigaOre(o, onclick) {
      const p = RO.pillolaStato(o);
      const orari = o.inizio ? o.inizio + (o.fine ? '–' + o.fine : '') + (C.num(o.pausaMinuti) ? ' · pausa ' + o.pausaMinuti + ' min' : '') + (o.giornoDopo ? ' · fino al giorno dopo' : '') : '';
      const sotto = [!soloSuoi() && o.utente && String(o.idUtente) !== String(personaVista()) ? o.utente : '', o.idCommessa ? (o.commessa || nomeCommessa(o.idCommessa)) : 'Attività dello studio',
        orari, o.prestazione || '', o.fatturabile ? '' : 'non fatturabile', o.tipo === 'straordinaria' ? 'straordinarie' : '', o.dalTimer ? 'dal timer' : ''].filter(Boolean).join(' · ');
      const respinta = o.stato === 'respinta';
      return riga({
        sinistra: codiceCommessa(o.idCommessa),
        titolo: o.descrizione || (o.idCommessa ? o.commessa || o.idCommessa : 'Attività dello studio'),
        // Il motivo del rifiuto per intero, sotto: nella pillola resta la parola.
        sotto: respinta && o.motivoRifiuto ? [sotto, h('span', { class: 'motivo-rifiuto' }, 'Motivo: ' + o.motivoRifiuto + (o.approvataDaNome ? ' · ' + o.approvataDaNome : ''))] : sotto,
        destra: h('span', { class: 'pillole-destra' }, h('span', { class: 'quanto' }, C.ore(o.ore)), p ? pillola(respinta ? 'Respinta' : p.testo, p.colore) : null),
        onclick, freccia: false,
      });
    }

    // ===================================================================== registra ore

    /** La commessa da scegliere: le recenti come pillole, lo Studio, e le altre aperte in un elenco. */
    function sceltaCommessa(idScelto, onscelta, sola) {
      const rec = recentiCommesse(5);
      if (idScelto && rec.indexOf(RO.chiaveCommessa(idScelto)) < 0) rec.unshift(RO.chiaveCommessa(idScelto));
      const altre = commesseAperte().filter(m => rec.indexOf(RO.chiaveCommessa(m.id)) < 0);
      const pill = (testo, scelta, fn, titolo) => h('button', { type: 'button', class: 'pillola' + (scelta ? ' scelta' : ''), 'aria-pressed': scelta ? 'true' : 'false', disabled: sola, title: titolo || null, onclick: fn }, testo);
      return h('div', { class: 'pillole' },
        rec.map(k => pill(k, RO.chiaveCommessa(idScelto) === k, () => onscelta(k), nomeCommessa(k))),
        pill('Studio', !idScelto, () => onscelta('')),
        altre.length && !sola ? selezione([['', 'Altra commessa']].concat(altre.map(m => [m.id, m.id + ' · ' + m.descrizione])), '', v => { if (v) onscelta(v); }, { 'aria-label': 'Altra commessa' }) : null);
    }

    /**
     * Registra ore (nuove o da correggere): per chi (chi vede tutti), il giorno, la
     * commessa, la durata a mezz'ore oppure inizio-fine-pausa (con le ore calcolate
     * subito, come il server), fatturabile, straordinarie, prestazione, attività,
     * cosa si è fatto. "Salva in bozza" la tiene per sé; Salva la manda.
     */
    function moduloOre(esistente, base) {
      const b = base || {};
      const o = esistente ? Object.assign({}, esistente) : {
        id: null, data: b.data || oggi(), idCommessa: b.idCommessa !== undefined ? b.idCommessa : (recentiCommesse(1)[0] || ''), ore: 1, inizio: '', fine: '',
        pausaMinuti: 0, fatturabile: null, tipo: 'ordinaria', descrizione: '', idPrestazione: null, idAttivita: null, idUtente: b.idUtente || personaVista(), stato: '',
      };
      const sola = esistente ? (!scrive() || esistente.puoScrivere === false || !!esistente.bloccata) : !scrive();
      const m = {
        idCommessa: o.idCommessa || '', modo: o.inizio ? 'orari' : 'ore', ore: C.num(o.ore),
        fatturabile: o.fatturabile === null || o.fatturabile === undefined ? !!o.idCommessa : !!o.fatturabile, fattToccato: !!esistente,
        straordinaria: o.tipo === 'straordinaria', idPrestazione: o.idPrestazione || null, idAttivita: o.idAttivita || null, idUtente: o.idUtente || io(),
      };
      const v = {
        data: h('input', { type: 'date', value: o.data || oggi(), disabled: sola }),
        inizio: h('input', { type: 'text', value: o.inizio || '', placeholder: '8:30', disabled: sola, autocomplete: 'off' }),
        fine: h('input', { type: 'text', value: o.fine || '', placeholder: '17:30', disabled: sola, autocomplete: 'off' }),
        pausa: h('input', { type: 'text', inputmode: 'numeric', value: C.num(o.pausaMinuti) ? String(o.pausaMinuti) : '', disabled: sola, autocomplete: 'off' }),
        descrizione: h('textarea', { rows: 3, disabled: sola }),
      };
      v.descrizione.value = o.descrizione || '';
      const zone = { chi: h('div'), commessa: h('div'), durata: h('div', { class: 'fila' }), fatt: h('div'), legami: h('div', { class: 'riga-campi' }) };
      let errori = {};
      const anteprima = h('div', { class: 'anteprima-ore', 'aria-live': 'polite' });

      const disegnaChi = () => {
        svuota(zone.chi);
        if (esistente || soloSuoi() || !scrive() || persone().length < 2) return;
        aggiungi(zone.chi, [campo('Di chi', selezione(persone().map(u => [u.id, u.nome]), m.idUtente, x => { m.idUtente = Number(x) || x; }))]);
      };
      const disegnaCommessa = () => aggiungi(svuota(zone.commessa), [h('div', { class: 'campo' }, h('label', null, 'Commessa'),
        sceltaCommessa(m.idCommessa, id => {
          m.idCommessa = id;
          if (!m.fattToccato) m.fatturabile = !!id;
          if (m.idPrestazione && !S.ana.prestazioni.some(p => String(p.id) === String(m.idPrestazione) && RO.chiaveCommessa(p.idCommessa) === RO.chiaveCommessa(id))) m.idPrestazione = null;
          m.idAttivita = null;
          disegnaCommessa(); disegnaFatt(); disegnaLegami();
        }, sola))]);
      const aggiornaAnteprima = () => {
        svuota(anteprima);
        anteprima.classList.remove('errore');
        if (m.modo !== 'orari' || (!v.inizio.value.trim() && !v.fine.value.trim())) return;
        const x = RO.provaOreDaOrari(v.inizio.value, v.fine.value, v.pausa.value.trim() === '' ? 0 : Number(v.pausa.value.trim()));
        if (x.errore) { anteprima.classList.add('errore'); aggiungi(anteprima, [x.errore]); return; }
        aggiungi(anteprima, [h('b', null, C.ore(x.ore)), x.giornoDopo ? ' · finisce il giorno dopo' : '']);
      };
      ['inizio', 'fine', 'pausa'].forEach(k => v[k].addEventListener('input', () => { if (errori.durata) { delete errori.durata; disegnaDurata(); v[k].focus(); } aggiornaAnteprima(); }));
      const disegnaDurata = () => {
        svuota(zone.durata);
        aggiungi(zone.durata, [segmenti([['ore', 'Ore'], ['orari', 'Inizio e fine']], m.modo, x => { if (sola) return; m.modo = x; delete errori.durata; disegnaDurata(); })]);
        if (m.modo === 'ore') {
          const cambia = d => { m.ore = Math.max(0, Math.min(24, Math.round((m.ore + d) * 2) / 2)); delete errori.durata; disegnaDurata(); };
          aggiungi(zone.durata, [h('div', { class: 'riga-stepper' }, h('span', { class: 'nome' }, h('b', null, 'Ore')),
            h('span', { class: 'stepper' }, sola ? null : tondo('meno', 'Mezz\'ora in meno', () => cambia(-0.5)), h('span', { class: 'valore' }, C.ore(m.ore)), sola ? null : tondo('piu', 'Mezz\'ora in più', () => cambia(0.5)))),
          sola ? null : h('div', { class: 'pillole' }, [1, 2, 4, 8].map(n => h('button', { type: 'button', class: 'pillola' + (m.ore === n ? ' scelta' : ''), onclick: () => { m.ore = n; delete errori.durata; disegnaDurata(); } }, C.ore(n))))]);
        } else {
          aggiungi(zone.durata, [h('div', { class: 'riga-campi' }, campo('Inizio', v.inizio), campo('Fine', v.fine), campo('Pausa', conSuffisso(v.pausa, 'min'))), anteprima]);
          aggiornaAnteprima();
        }
        if (errori.durata) aggiungi(zone.durata, [h('div', { class: 'campo' }, h('div', { class: 'errore' }, errori.durata))]);
      };
      const disegnaFatt = () => aggiungi(svuota(zone.fatt), [h('div', { class: 'riga-scelte' },
        segmenti([['si', 'Fatturabile'], ['no', 'Non fatturabile']], m.fatturabile ? 'si' : 'no', x => { if (sola) return; m.fatturabile = x === 'si'; m.fattToccato = true; disegnaFatt(); }),
        h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: m.straordinaria, disabled: sola, onchange: e => { m.straordinaria = e.target.checked; } }), 'Straordinarie'))]);
      const disegnaLegami = () => {
        svuota(zone.legami);
        const prest = S.ana.prestazioni.filter(p => m.idCommessa && RO.chiaveCommessa(p.idCommessa) === RO.chiaveCommessa(m.idCommessa));
        const att = (M.attivita || []).filter(a => m.idCommessa && RO.chiaveCommessa(a.idCommessa) === RO.chiaveCommessa(m.idCommessa) && (a.stato !== 'fatta' || String(a.id) === String(m.idAttivita)));
        if (prest.length) aggiungi(zone.legami, [campo('Prestazione', selezione([['', 'Nessuna']].concat(prest.map(p => [p.id, p.nome])), m.idPrestazione || '', x => { m.idPrestazione = x ? Number(x) || x : null; }, { disabled: sola }))]);
        if (att.length) aggiungi(zone.legami, [campo('Attività', selezione([['', 'Nessuna']].concat(att.map(a => [a.id, a.titolo])), m.idAttivita || '', x => { m.idAttivita = x ? Number(x) || x : null; }, { disabled: sola }))]);
      };
      disegnaChi(); disegnaCommessa(); disegnaDurata(); disegnaFatt(); disegnaLegami();
      // Le attività aperte servono per legarle alle ore: si leggono una volta.
      if (!M.attivita && puo('attivita')) {
        Rete.get('/server/attivita').then(r => { M.attivita = r.attivita || []; disegnaLegami(); }).catch(() => { M.attivita = []; });
      }

      const leggiModulo = bozza => {
        const x = { data: v.data.value, idCommessa: m.idCommessa, descrizione: v.descrizione.value.trim(), fatturabile: m.fatturabile,
          tipo: m.straordinaria ? 'straordinaria' : 'ordinaria', idPrestazione: m.idPrestazione || null, idAttivita: m.idAttivita || null };
        if (m.modo === 'orari') {
          x.inizio = v.inizio.value.trim();
          x.fine = v.fine.value.trim();
          x.pausaMinuti = v.pausa.value.trim() === '' ? 0 : Number(v.pausa.value.trim());
        } else {
          // Per passare alle ore scritte a mano si mandano inizio e fine vuoti (§14.4).
          Object.assign(x, { inizio: '', fine: '', pausaMinuti: 0, ore: m.ore });
        }
        if (esistente) x.id = esistente.id;
        else if (!soloSuoi() && m.idUtente && String(m.idUtente) !== String(io())) x.idUtente = m.idUtente;
        if (bozza) x.bozza = true;
        return x;
      };
      const valida = (x, bozza) => {
        const e = {};
        if (!x.data) e.durata = 'Manca il giorno';
        else if (m.modo === 'orari') {
          if (!Number.isFinite(x.pausaMinuti)) e.durata = 'Pausa: scrivi i minuti, da zero in su';
          else if (!bozza || x.inizio || x.fine) { const k = RO.provaOreDaOrari(x.inizio, x.fine, x.pausaMinuti); if (k.errore) e.durata = k.errore; }
        } else if (!bozza && !(x.ore > 0)) e.durata = 'Ore: scrivi quante ore hai lavorato';
        return e;
      };

      let chiudi;
      const salva = async bozza => {
        const x = leggiModulo(bozza);
        errori = valida(x, bozza);
        if (Object.keys(errori).length) { disegnaDurata(); return; }
        const ris = await lavora('Salvo le ore', () => Rete.post('/server/salvaOre', { riga: x }));
        if (!ris) return;
        chiudi();
        M.ore = null;
        M.approvare = null;
        const st = ris.riga ? ris.riga.stato : '';
        avviso(st === 'bozza' ? 'Ore salvate in bozza' : st === 'da_approvare' ? 'Ore salvate: vanno in approvazione' : 'Ore salvate', false, null,
          !esistente && ris.riga ? { testo: 'Annulla', fn: async () => { if (await lavora('Tolgo le ore', () => Rete.post('/server/togliOre', { id: ris.riga.id }))) { M.ore = null; W.ridisegna(); } } } : null);
        W.ridisegna();
        W.caricaDashboard();
        W.Visita.azione('salva-ore');
      };
      const togli = async () => {
        const ris = await lavora('Tolgo le ore', () => Rete.post('/server/togliOre', { id: esistente.id }));
        if (!ris) return;
        chiudi();
        M.ore = null;
        M.approvare = null;
        avviso('Ore tolte', false, null, { testo: 'Annulla', fn: async () => { if (await lavora('Rimetto le ore', () => Rete.post('/server/togliOre', { id: esistente.id, annulla: true }))) { M.ore = null; W.ridisegna(); } } });
        W.ridisegna();
        W.caricaDashboard();
      };

      const bande = [
        esistente && esistente.stato === 'respinta' ? h('div', { class: 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Respinta' + (esistente.approvataDaNome ? ' da ' + esistente.approvataDaNome : '') + ': ' + (esistente.motivoRifiuto || ''))) : null,
        esistente && esistente.bloccata ? h('div', { class: 'banda calma' }, icona('scudo', 20), h('span', { class: 'spazio' }, esistente.bloccata)) : null,
        b.avviso ? h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, b.avviso)) : null,
      ];
      const corpo = h('div', { class: 'modulo' },
        h('div', { class: 'col' }, bande, zone.chi, campo('Giorno', v.data), zone.commessa, h('h3', null, 'Quanto'), zone.durata),
        h('div', { class: 'col' }, campo('Cosa hai fatto', v.descrizione), zone.fatt, zone.legami));
      const titolo = esistente ? (sola ? 'Ore del ' + C.data(o.data) : b.dalTimer ? 'Le ore dal timer' : 'Correggi le ore') : 'Registra ore';
      chiudi = finestra({
        titolo, larghezza: 'larga', corpo, fuoco: false,
        pulsanti: [esistente && !sola ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: togli }, 'Togli') : null, 'spazio',
          h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, sola ? 'Chiudi' : 'Annulla'),
          !sola && (!esistente || esistente.stato === 'bozza') ? h('button', { type: 'button', class: 'btn grande', onclick: () => salva(true) }, 'Salva in bozza') : null,
          sola ? null : h('button', { type: 'button', class: 'btn giallo grande', style: { minWidth: '160px' }, 'data-visita': 'salva-ore', onclick: () => salva(false) }, 'Salva')].filter(Boolean),
      });
      if (!sola) setTimeout(() => v.descrizione.focus(), 40);
    }

    // ===================================================================== timer

    /** Avvia il timer: si sceglie la commessa (le recenti come pillole) e, se si vuole, cosa si fa. */
    function avviaTimer() {
      let id = recentiCommesse(1)[0] || '';
      const desc = h('input', { type: 'text', autocomplete: 'off' });
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('div', { class: 'campo' }, h('label', null, 'Commessa'), sceltaCommessa(id, x => { id = x; disegna(); })), campo('Cosa fai', desc)]);
      disegna();
      let chiudi;
      const avvia = async () => {
        const ris = await lavora('Avvio il timer', async () => {
          try {
            return await Rete.post('/server/avviaTimer', { idCommessa: id, descrizione: desc.value.trim() });
          } catch (e) {
            // Già acceso (da un altro dispositivo): si mostra quello, invece di riprovare.
            if (e && e.dati && e.dati.timer) { M.timer = e.dati.timer; M.timerLetto = Date.now(); chiudi(); W.ridisegna(); }
            throw e;
          }
        });
        if (!ris) return;
        M.timer = ris.timer || null;
        M.timerLetto = Date.now();
        chiudi();
        avviso('Timer acceso su ' + (id || 'Studio'));
        W.ridisegna();
        W.Visita.azione('avvia-timer');
      };
      chiudi = finestra({ titolo: 'Avvia il timer', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: avvia }, icona('play', 18, 2.4), 'Avvia')] });
    }

    /** Ferma: il server scrive la riga in bozza dal momento in cui era partito; si apre per correggerla. */
    async function fermaTimer() {
      const ris = await lavora('Fermo il timer', async () => {
        try {
          return await Rete.post('/server/fermaTimer', {});
        } catch (e) {
          // Già fermato da un altro dispositivo: la bozza c'è già, si rilegge.
          if (/non è acceso/.test(e.message || '')) return { nonAcceso: true };
          throw e;
        }
      });
      if (!ris) return;
      M.timer = null;
      M.ore = null;
      W.ridisegna();
      W.caricaDashboard();
      if (ris.nonAcceso) { avviso('Il timer era già fermo: la bozza è tra le ore'); return; }
      if (ris.riga) moduloOre(ris.riga, { avviso: ris.avviso || '', dalTimer: true });
      W.Visita.azione('ferma-timer');
    }

    /** Il timer acceso sulla Dashboard: si vede appena si apre il programma. */
    function schedaTimer() {
      const t = M.timer;
      if (!t || !scrive()) return null;
      return h('div', { class: 'scheda timer-scheda' },
        h('div', { class: 'testi' },
          h('span', { class: 'etichetta' }, 'Timer acceso · ' + (t.idCommessa || 'Studio')),
          h('span', { class: 'tempo-grande', 'data-timer-tempo': '' }, tempoTimer()),
          h('span', { class: 'sotto-titolo' }, [t.idCommessa ? t.commessa || nomeCommessa(t.idCommessa) : 'Attività dello studio', t.descrizione].filter(Boolean).join(' · '))),
        h('button', { type: 'button', class: 'btn grande', onclick: () => { M.segmento = 'ore'; W.vai('#rapportini'); } }, 'Le ore'),
        h('button', { type: 'button', class: 'btn grande', onclick: fermaTimer }, icona('stop', 18, 2.6), 'Ferma'));
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
      M.ore = null;
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

    // ===================================================================== statistiche

    const meseVisto = () => M.mese || oggi().slice(0, 7);

    async function leggiStatistiche() {
      const mese = meseVisto();
      if (M.stat && M.statChiave === mese) return;
      const p = RO.periodoMese(mese);
      const q = '/server/statisticheOre?da=' + p.da + '&a=' + p.a + '&per=';
      const [persona, commessa] = await Promise.all([Rete.get(q + 'persona'), Rete.get(q + 'commessa')]);
      M.stat = { persona, commessa };
      M.statChiave = mese;
    }

    function statistiche(pagina) {
      const mese = meseVisto();
      const p = RO.periodoMese(mese);
      const nome = RO.MESI[Number(mese.slice(5, 7)) - 1] + (mese.slice(0, 4) !== oggi().slice(0, 4) ? ' ' + mese.slice(0, 4) : '');
      const sposta = d => { M.mese = RO.spostaMese(mese, d); W.disegnaPagina(); };
      aggiungi(pagina, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna alle ore', () => W.vai('#rapportini')), h('span', { class: 'dove' }, 'Ore e rapportini')),
        h('div', { class: 'testata' }, h('h1', null, 'Statistiche di ' + nome), tondo('indietro', 'Mese prima', () => sposta(-1)), tondo('avanti', 'Mese dopo', () => sposta(1)),
          h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.esporta('ore', { da: p.da, a: p.a }) }, 'Esporta le ore del mese'))]);
      const per = M.stat.persona;
      const com = M.stat.commessa;
      const costo = x => soldi() && x.costo !== undefined && x.costo !== null ? C.euro(x.costo) + (x.costoNoto === false ? ' (incompleto)' : '') : '';
      const righeP = per.righe || [];
      const max = Math.max(1, ...righeP.map(r => C.num(r.ore)));
      const schedaPersone = h('div', { class: 'scheda stat-persone' }, h('span', { class: 'etichetta' }, 'Per persona'),
        righeP.length ? righeP.map(r => h('div', { class: 'barra-stat' },
          h('div', { class: 'alto' }, h('b', null, r.nome), h('span', null, [C.ore(r.ore), RO.testoPercentuale(r.percentuale), costo(r)].filter(Boolean).join(' · '))),
          h('div', { class: 'barra doppia', role: 'img', 'aria-label': C.ore(r.fatturabili) + ' fatturabili su ' + C.ore(r.ore) },
            h('i', { style: { width: RO.larghezza(r.fatturabili, max) + '%' } }), h('i', { class: 'resto', style: { width: RO.larghezza(C.num(r.ore) - C.num(r.fatturabili), max) + '%' } }))))
          : h('p', { class: 'vuoto sinistra' }, 'Nessuna ora a ' + RO.MESI[Number(mese.slice(5, 7)) - 1] + '.'),
        righeP.length ? h('div', { class: 'legenda' }, h('span', null, h('i', { style: { background: 'var(--testo)' } }), 'Fatturabili'), h('span', null, h('i', { style: { background: 'var(--bordo-campo)' } }), 'Non fatturabili')) : null,
        per.totale && C.num(per.totale.ore) ? h('div', { class: 'totale-stat' }, h('b', null, 'Totale ' + C.ore(per.totale.ore)), [RO.testoPercentuale(per.totale.percentuale), costo(per.totale)].filter(Boolean).join(' · ')) : null);

      const righeC = com.righe || [];
      const maxC = Math.max(1, ...righeC.map(r => C.num(r.ore)));
      const colonne = 'minmax(0, 1fr) 96px 52px' + (soldi() ? ' 104px' : '');
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } }, h('span', null, 'Commessa'), h('span', null, 'Ore'),
        h('span', { class: 'n' }, 'Fatt.'), soldi() ? h('span', { class: 'n' }, 'Costo') : null));
      righeC.forEach(r => aggiungi(tab, [h('div', { class: 'r' + (r.chiave ? ' cliccabile' : ''), style: { gridTemplateColumns: colonne }, onclick: r.chiave && W.commessa(r.chiave) ? () => W.vai('#commesse/' + encodeURIComponent(r.chiave)) : null },
        h('span', { class: 'doppia', title: r.nome || '' }, h('span', null, r.nome || (r.chiave ? r.chiave : 'Attività dello studio')), h('span', null, [r.chiave || 'Studio', r.cliente].filter(Boolean).join(' · '))),
        h('span', { class: 'ore-budget', title: C.num(r.oreRapportini) ? C.numero(r.oreRapportini) + ' ore dai rapportini, ' + C.numero(r.oreRegistrate) + ' registrate' : null }, h('span', { class: 'piccolo' }, C.ore(r.ore)),
          h('span', { class: 'barra sottile' }, h('i', { style: { width: RO.larghezza(r.ore, maxC) + '%' } }))),
        h('span', { class: 'n' }, r.percentuale === null || r.percentuale === undefined ? '—' : r.percentuale + '%'),
        soldi() ? h('span', { class: 'n forte' }, costo(r) || '—') : null)]));
      if (!righeC.length) aggiungi(tab, [h('div', { class: 'r' }, h('span', { class: 'tenue' }, 'Nessuna ora in questo mese.'))]);
      else if (com.totale) {
        aggiungi(tab, [h('div', { class: 'r piede', style: { gridTemplateColumns: colonne } }, h('span', null, 'Totale'), h('span', null, C.ore(com.totale.ore)),
          h('span', { class: 'n' }, com.totale.percentuale === null || com.totale.percentuale === undefined ? '—' : com.totale.percentuale + '%'), soldi() ? h('span', { class: 'n' }, costo(com.totale) || '—') : null)]);
      }
      aggiungi(pagina, [h('div', { class: 'griglia-stat' }, schedaPersone, h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Per commessa'), tab))]);
    }

    return { vista, M, leggiTimer, schedaTimer, moduloOre, daRileggere, fermaTimer };
  };
})(window);
