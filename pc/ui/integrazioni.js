/*
 * Wisper Ufficio: Integrazioni (fase 8, docs/gestionale/fase8.md §4, §15.2; §0 sopra a tutto) e Il calendario in
 * altre app (§5, §0.3).
 *
 * Integrazioni: una tabella per gruppo (Collegamento, Stato, Ultimo controllo, Cosa esce dal NAS, Costo) coi segmenti
 * Tutti · Collegati · Da sistemare · Non collegati, la fascia rossa se un collegamento è in Errore e la pagina di un
 * collegamento come pannello a destra (440). Lo stato viene SOLO dal server, nato da controlli veri: qui non si scrive
 * mai "Collegato" a mano, e nessun Non collegato ha un pulsante che finga di collegare.
 *
 * Il calendario in altre app: a sinistra il file da scaricare (finestra Salva di Windows), a destra gli indirizzi
 * d'abbonamento (uno per dispositivo, la chiave si vede una volta sola). "Anche fuori casa (passa da Google)" c'è solo
 * se il calendario fuori casa è acceso (CALENDARIO_PUBBLICO, spento di base).
 */
(function (radice) {
  'use strict';

  radice.WisperIntegrazioni = function (W) {
    const { S, C, B, Rete, Api } = W;
    const Q = radice.WisperRegoleFase8;
    const { h, aggiungi, svuota, icona, tondo, avviso, lavora, finestra, conferma, campo, segmenti, riga, quadrato, segnaposto, copiaTesto } = B;
    const pill = (testo, colore) => h('span', { class: 'pill p-' + (colore || 'grigio') }, colore === 'tratteggiata' ? icona('scollegato', 14, 2.2) : null, testo);
    const pillStato = i => { const s = Q.pillola(i); return pill(s.parola, s.colore); };
    const proviamo = () => W.puo('integrazioni', 2);
    // Le chiavi del server (server/src/integrazioni/elenco.js) e quelle dei dati di esempio.
    const ICONE = { postino: 'email', vies: 'cerca', copiafuori: 'nuvola', aggiornamenti: 'scarica', calendario: 'calendario', calendariofile: 'calendario', ricerca: 'cerca', porta: 'scudo',
      portale: 'globo', link: 'link', ponte: 'ripeti', internetinterno: 'scudo', calpub: 'calendario', calendariopubblico: 'calendario', onedrive: 'file', drive: 'file',
      programma: 'fatturazione', programmafatture: 'fatturazione', posta365: 'email', postams: 'email', workspace: 'email', sync: 'ripeti', duevie: 'ripeti', sdi: 'fatturazione',
      banca: 'banca', openbanking: 'banca', estratto: 'importa', estrattoconto: 'importa', whatsapp: 'whatsapp', whatsappapi: 'whatsapp', messaggi: 'fumetto', assistente: 'fumetto',
      firebase: 'campana', paghe: 'persona', durc: 'file' };
    const iconaDi = i => ICONE[i.chiave] || 'spina';
    const coloreIcona = i => { const s = Q.statoVisto(i); return s === 'errore' ? 'ico-rosso' : s === 'collegato' ? 'ico-verde' : 'ico-grigio'; };

    const M = { lista: null, numeri: null, seg: null, aperta: null, dettaglio: null, feed: null, cosa: 'mie', assenze: true, scadenze: false, anteprima: null };
    function daRileggere() { M.lista = null; M.dettaglio = null; M.feed = null; M.anteprima = null; }

    async function leggi() {
      const r = await Rete.get('/server/integrazioni');
      M.lista = r.integrazioni || [];
      M.numeri = r.numeri || null;
      // La fascia del postino fermo la scrive il server ("Il postino non risponde da 2 ore: ...", §4.3).
      M.fascia = typeof r.fascia === 'string' ? r.fascia : '';
    }

    /** Il numerino del menu (§8.6): i collegamenti in Errore, solo per il titolare e chi ha amministrazione 2. */
    function numerino() {
      const tit = S.io && S.io.utente && S.io.utente.ruolo === 'titolare';
      if (!tit && !W.puo('amministrazione', 2)) return 0;
      const n = S.dash && S.dash.numeri && S.dash.numeri.integrazioni;
      if (n && typeof n.errori === 'number') return n.errori;
      return M.lista ? Q.numeriIntegrazioni(M.lista).errori : 0;
    }

    // ===================================================================== la pagina

    function vista(pagina, chiave, filtro) {
      if (filtro && filtro.segmento) M.seg = filtro.segmento === 'daSistemare' ? 'sistemare' : filtro.segmento;
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Integrazioni'))]);
      const zona = h('div', { class: 'sezione' }, segnaposto(4, 64));
      aggiungi(pagina, [zona]);
      (M.lista ? Promise.resolve() : leggi()).then(() => {
        svuota(zona);
        disegna(zona);
        if (chiave) apri(chiave);
        else if (M.aperta) apri(M.aperta, true);
      }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => { M.lista = null; W.disegnaPagina(); } }, 'Riprova'))]);
      });
    }

    function disegna(zona) {
      const lista = M.lista || [];
      if (!M.seg) M.seg = Q.segmentoIniziale(lista);
      const n = Q.numeriIntegrazioni(lista);
      const f = M.fascia ? { chiave: 'postino', testo: M.fascia, provaAdesso: true } : Q.fascia(lista);
      if (f) {
        aggiungi(zona, [h('div', { class: 'banda fascia-integrazione' }, icona('avviso', 20), h('span', { class: 'spazio' }, Q.senzaSegreti(f.testo)),
          proviamo() && f.provaAdesso ? h('button', { type: 'button', class: 'btn piccolo', onclick: () => provaAdesso(f.chiave) }, 'Prova adesso') : null)]);
      }
      aggiungi(zona, [segmenti([['tutti', 'Tutti · ' + n.tutti], ['collegati', 'Collegati · ' + n.collegati], ['sistemare', 'Da sistemare · ' + n.sistemare], ['noncollegati', 'Non collegati · ' + n.noncollegati]],
        M.seg, x => { M.seg = x; W.ridisegna(); })]);
      // Le colonne dell'accordo (§15.2: Collegamento, Stato, Ultimo controllo, Cosa esce dal NAS, Costo); il testo va a
      // capo (due righe al massimo) invece dei puntini.
      const col = 'minmax(0, 1.7fr) 172px minmax(0, .9fr) minmax(0, 1.3fr) minmax(0, .6fr)';
      let vuoto = true;
      Q.GRUPPI.forEach(([g, nome]) => {
        const righe = lista.filter(i => (i.gruppo || 'noncollegati') === g && Q.nelSegmento(i, M.seg));
        if (!righe.length) return;
        vuoto = false;
        const tab = h('div', { class: 'tab tab-integrazioni' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } },
          h('span', null, 'Collegamento'), h('span', null, 'Stato'), h('span', null, 'Ultimo controllo'), h('span', null, 'Cosa esce dal NAS'), h('span', null, 'Costo')));
        righe.forEach(i => {
          const quando = Q.quandoControllato(i, new Date());
          const vecchio = Q.vecchio(i, new Date());
          aggiungi(tab, [h('div', { class: 'r cliccabile' + (M.aperta === i.chiave ? ' scelta' : ''), style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-chiave': i.chiave,
            onclick: () => apri(i.chiave), onkeydown: e => { if (e.key === 'Enter') apri(i.chiave); } },
          h('span', { class: 'nome-cella' }, h('span', { class: 'ico-riga piccola ' + coloreIcona(i) }, icona(iconaDi(i), 18, 2.2)),
            // §4.3: il nome e una riga su cosa fa (tutta intera passandoci sopra e nel pannello).
            h('span', { class: 'nome-e-cosa' }, h('span', { class: 'forte' }, i.nome), i.cosa ? h('span', { class: 'cosa', title: i.cosa }, i.cosa) : null)),
          h('span', null, pillStato(i)),
          h('span', { class: 'quando-cella' }, h('span', { class: 't2' }, quando ? quando.replace(/^controllato /, '') : '—'), vecchio ? h('span', { class: 'ambra-testo' }, vecchio) : Q.unoFallito(i) ? h('span', { class: 'ambra-testo' }, 'l\'ultimo controllo non è riuscito') : null),
          h('span', { class: 't2 taglia-due', title: i.esce || '' }, Q.senzaSegreti(i.esce || (Q.statoVisto(i) === 'non_collegato' ? '—' : ''))),
          h('span', { class: 't2 taglia-due', title: i.costo || '' }, i.costo || ''))]);
        });
        aggiungi(zona, [h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, nome + ' · ' + righe.length), tab)]);
      });
      if (vuoto) aggiungi(zona, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), M.seg === 'sistemare' ? 'Niente da sistemare' : 'Niente qui')]);
      // Importa ed esporta è un modulo delle specifiche 17 ma sta in Amministrazione (§7): una riga che porta lì.
      if (W.puo('amministrazione') || W.puo('clienti', 2)) {
        aggiungi(zona, [h('div', { class: 'scheda righe stretta-720' }, riga({ sinistra: quadrato('importa'), titolo: 'Importa ed esporta', sotto: 'File CSV ed Excel: in Amministrazione', onclick: () => W.vai('#amministrazione/importa') }))]);
      }
    }

    // ===================================================================== il pannello di un collegamento (§4.3)

    async function apri(chiave, gia) {
      M.aperta = chiave;
      document.querySelectorAll('.tab-integrazioni .r[data-chiave]').forEach(x => x.classList.toggle('scelta', x.dataset.chiave === chiave));
      if (!gia || !M.dettaglio || M.dettaglio.chiave !== chiave) {
        const base = (M.lista || []).find(i => i.chiave === chiave) || { chiave, nome: chiave };
        M.dettaglio = Object.assign({}, base, { caricando: true });
        disegnaPannello();
        try {
          const r = await Rete.get('/server/integrazione?chiave=' + encodeURIComponent(chiave));
          if (M.aperta !== chiave) return;
          // Il server risponde { integrazione: {...} }; i dati di esempio la riga da sola.
          M.dettaglio = Object.assign({}, base, r.integrazione || r);
          delete M.dettaglio.ok;
        } catch (e) {
          if (e && e.accesso === false) return;
          M.dettaglio = Object.assign({}, base, { erroreLettura: e.message || String(e) });
        }
      }
      disegnaPannello();
    }

    function chiudiPannello(subito) {
      const p = document.querySelector('.pannello-integrazione');
      M.aperta = null;
      M.dettaglio = null;
      document.querySelectorAll('.tab-integrazioni .r.scelta').forEach(x => x.classList.remove('scelta'));
      if (!p) return;
      if (subito) { p.remove(); return; }
      p.classList.add('via');
      setTimeout(() => p.remove(), 200);
    }

    function disegnaPannello() {
      const i = M.dettaglio;
      const vecchio = document.querySelector('.pannello-integrazione');
      if (!i) { if (vecchio) vecchio.remove(); return; }
      const stato = Q.statoVisto(i);
      const nc = stato === 'non_collegato' || stato === 'scelta';
      const quando = Q.quandoControllato(i, new Date());
      const coppie = lista => h('div', { class: 'coppie una' }, lista.filter(x => x[1]).map(x => h('div', { class: 'coppia' }, h('span', { class: 'k' }, x[0]), h('span', { class: 'v' }, x[2] || Q.senzaSegreti(x[1])))));
      const account = h('span', { class: 'con-azione' }, Q.senzaSegreti(i.account || 'nessun account'),
        proviamo() && !nc ? h('button', { type: 'button', class: 'btn collegamento', onclick: () => cambiaAccount(i) }, 'Cambia') : null);
      const testo = nc
        ? h('div', { class: 'scheda fila' }, h('h3', null, 'Perché non è collegato'), h('p', { class: 'testo-forte' }, i.perche || 'Non esiste un modo per collegarlo.'),
          coppie([['Cosa servirebbe', i.servirebbe], ['Costo se si volesse', i.costo], ['Cosa uscirebbe dal NAS', i.esce], ['Regole del servizio', i.regole]]),
          stato === 'scelta' ? h('span', { class: 'secondario' }, 'Dipende da una scelta: è nelle domande della fase 8') : null)
        : h('div', { class: 'scheda fila' }, h('h3', null, 'Cosa fa'), h('p', { class: 'testo-forte' }, i.cosa || ''),
          coppie([['Ultimo controllo', i.esito], ['Account', i.account || 'nessun account', account], ['Cosa esce dal NAS', i.esce], ['Costo', i.costo], ['Regole del servizio', i.regole]]));
      const controlli = (i.controlli || []).slice(0, 20);
      const ultimi = controlli.length ? h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Ultimi controlli'),
        h('div', { class: 'scheda righe' }, controlli.map(c => riga({ sinistra: quadrato(c.esito === 'ok' ? 'spunta' : 'allarme', c.esito === 'ok' ? 'ico-verde' : 'ico-rosso'),
          titolo: Q.quandoBreve(c.quando, new Date()).replace(/^./, x => x.toUpperCase()), sotto: [Q.senzaSegreti(c.testo || (c.esito === 'ok' ? 'Riuscito' : 'Non riuscito')), Q.tempo(c.millisecondi)].filter(Boolean).join(' · ') })))) : null;
      const corpo = h('div', { class: 'corpo' },
        h('div', { class: 'alto' }, h('span', { class: 'etichetta-pannello' }, 'Collegamento'), h('span', { class: 'spazio' }), tondo('chiudi', 'Chiudi', () => chiudiPannello(), 'piccolo')),
        h('h2', { class: 'titolo-pannello' }, h('span', { class: 'ico-riga ' + coloreIcona(i) }, icona(iconaDi(i), 20, 2.2)), i.nome),
        h('div', { class: 'pillole-testa' }, pillStato(i), quando ? h('span', { class: 'secondario' }, quando + (i.millisecondi !== undefined && i.millisecondi !== null && stato !== 'da_configurare' ? ' · in ' + Q.tempo(i.millisecondi) : '')) : null),
        Q.vecchio(i, new Date()) ? h('span', { class: 'ambra-testo' }, Q.vecchio(i, new Date())) : Q.unoFallito(i) ? h('span', { class: 'ambra-testo' }, 'l\'ultimo controllo non è riuscito') : null,
        i.caricando ? segnaposto(2, 60) : null,
        i.erroreLettura ? h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, i.erroreLettura)) : null,
        testo, impostazioni(i), ultimi);
      const prova = !nc && proviamo() && i.provaAdesso !== false
        ? h('button', { type: 'button', class: 'btn grande' + (Q.provaGialla(i) ? ' giallo' : ''), onclick: () => provaAdesso(i.chiave) }, 'Prova adesso') : null;
      const p = h('aside', { class: 'pannello pannello-integrazione', 'aria-label': 'Il collegamento ' + i.nome }, corpo, prova ? h('div', { class: 'piede' }, prova) : null);
      if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi(B.$('#sovrapposti'), [p]);
    }

    /**
     * Le impostazioni del collegamento (calendario, ricerca, portale), col loro Salva col bordo (§4.3, §6.3). Il server le
     * manda come voci ({chiave, etichetta, tipo, valore, min, max, unita}), i dati di esempio come {chiave: valore}.
     */
    const ETICHETTE_IMP = {
      CALENDARIO_GIORNI_PRIMA: ['Giorni passati nel calendario', 'giorni'], CALENDARIO_MESI_DOPO: ['Mesi futuri nel calendario', 'mesi'],
      CALENDARIO_PUBBLICO: ['Anche fuori casa (passa da Google)'], RICERCA_FILE: ['Cerca anche dentro i file'], RICERCA_FILE_MAX_MB: ['Grandezza massima di un file da leggere', 'MB'],
      PORTALE_ATTIVO: ['Portale acceso'], PORTALE_INDIRIZZO: ['Indirizzo del portale'],
    };
    function vociImpostazioni(v) {
      if (Array.isArray(v)) return v.map(x => Object.assign({}, x));
      if (!v || typeof v !== 'object') return [];
      return Object.keys(v).map(k => ({ chiave: k, etichetta: (ETICHETTE_IMP[k] || [k])[0], unita: (ETICHETTE_IMP[k] || [])[1] || '',
        tipo: typeof v[k] === 'boolean' ? 'si' : typeof v[k] === 'number' ? 'numero' : 'testo', valore: v[k] }));
    }

    /**
     * Le impostazioni del collegamento. Dal 06/11/2026 si salvano da sole: gli interruttori subito (il calendario fuori casa
     * col suo foglio di conferma), i numeri quando smetti di scrivere e uscendo dal campo; una chiave per volta.
     */
    function impostazioni(i) {
      const voci = vociImpostazioni(i.impostazioni);
      if (!voci.length) return null;
      const scrive = proviamo();
      const amm2 = W.puo('amministrazione', 2);
      const vero = x => x === true || x === 'true' || x === 1 || x === '1';
      const righe = [];
      const portale = (M.lista || []).find(x => x.chiave === 'portale');
      const manda = valori => Rete.post('/server/salvaIntegrazione', { chiave: i.chiave, impostazioni: valori }).then(r => {
        Object.assign(S.ana.impostazioni, valori);
        // L'elenco si rilegge alla prossima apertura (lo stato può cambiare col valore nuovo).
        M.lista = null;
        M.dettaglio = null;
        return r;
      });
      voci.forEach(x => {
        const etichetta = (ETICHETTE_IMP[x.chiave] || [x.etichetta || x.chiave])[0];
        // Quelle che toccano internet (il calendario fuori casa, il portale) le cambia solo chi ha amministrazione 2 (§13.1).
        const internet = x.chiave === 'CALENDARIO_PUBBLICO' || /^PORTALE_/.test(x.chiave);
        const spento = !scrive || (internet && !amm2) || (x.chiave === 'CALENDARIO_PUBBLICO' && !vero(x.valore) && portale && portale.stato !== 'collegato');
        if (x.tipo === 'si' || typeof x.valore === 'boolean') {
          let si = vero(x.valore);
          const b = h('button', { type: 'button', class: 'interruttore' + (si ? ' acceso' : ''), role: 'switch', 'aria-checked': si ? 'true' : 'false', 'aria-label': etichetta, disabled: !!spento  }, h('i'));
          const metti = v => { si = v; b.classList.toggle('acceso', v); b.setAttribute('aria-checked', v ? 'true' : 'false'); };
          b.addEventListener('click', async () => {
            if (spento) return;
            const nuovo = !si;
            if (x.chiave === 'CALENDARIO_PUBBLICO' && nuovo && !(await conferma('Accendere il calendario fuori casa?', 'Gli indirizzi segnati "Anche fuori casa" passeranno dallo script del portale: titoli, luoghi e clienti dai server di Google o Microsoft, di base senza dettagli.', 'Accendi'))) return;
            metti(nuovo);
            const ok = await B.salvaOra(b, () => manda({ [x.chiave]: nuovo }).then(r => { x.valore = nuovo; return r; }));
            if (!ok) metti(!nuovo);
          });
          righe.push(h('div', { class: 'riga riga-int', 'data-chiave': x.chiave }, h('span', { class: 'corpo' }, h('span', { class: 't1' }, etichetta)), b));
          return;
        }
        if (x.tipo === 'numero') {
          const input = h('input', { type: 'text', inputmode: 'numeric', value: Q.numeroCampo(x.valore), disabled: !!spento, 'aria-label': etichetta });
          if (!spento) B.salvaDaSolo(input, {
            leggi: t => { const e = B.numeroAMeta(t) ? etichetta + ': scrivi un numero' : Q.erroreVoce(Object.assign({ tipo: 'numero' }, x, { etichetta }), t); return e ? { errore: e } : { valore: Q.numeroScritto(t) }; },
            salva: n => manda({ [x.chiave]: n }).then(r => { x.valore = n; return r; }),
          });
          const unita = x.unita || (ETICHETTE_IMP[x.chiave] || [])[1] || '';
          const c = campo(etichetta, unita ? B.conSuffisso(input, unita) : input);
          c.setAttribute('data-chiave', x.chiave);
          righe.push(c);
          return;
        }
        // L'indirizzo del portale non si scrive da qui: sta in Amministrazione › Portale clienti (fase 7). Qui si legge e basta.
        righe.push(h('div', { class: 'coppia' }, h('span', { class: 'k' }, etichetta), h('span', { class: 'v' }, x.valore ? Q.senzaSegreti(x.valore) === String(x.valore) ? String(x.valore) : 'c’è' : 'manca')));
      });
      if (!righe.length) return null;
      return h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Impostazioni'),
        h('div', { class: 'scheda fila' }, righe,
          scrive && i.chiave === 'ricerca' && amm2 ? h('div', { class: 'pillole' }, h('button', { type: 'button', class: 'btn', onclick: rileggiTutto }, 'Rileggi tutto')) : null,
          i.chiave === 'portale' && W.puo('amministrazione') ? h('div', null, h('button', { type: 'button', class: 'btn collegamento', onclick: () => { chiudiPannello(true); W.vai('#amministrazione/portale'); } }, 'Apri le impostazioni del portale')) : null,
          (i.chiave === 'calendario' || i.chiave === 'calendariofile') && W.puo('attivita') ? h('div', null, h('button', { type: 'button', class: 'btn collegamento', onclick: () => { chiudiPannello(true); W.vai('#attivita/altreapp'); } }, 'Apri Il calendario in altre app')) : null));
    }

    async function rileggiTutto() {
      if (!(await conferma('Rileggere tutti i file?', 'Stanotte, dopo la copia, il server rilegge il testo di tutti i documenti. Di giorno non si ferma niente.', 'Rileggi tutto'))) return;
      const r = await lavora('Un momento', () => Rete.post('/server/rileggiFile', {}));
      if (r) avviso(Q.migliaia(r.daLeggere || 0) + ' file da rileggere stanotte');
    }

    function cambiaAccount(i) {
      // Si salva da solo (06/11/2026); chiudendo si rilegge il collegamento.
      const v = h('input', { type: 'text', value: i.account || '', autocomplete: 'off' });
      B.salvaDaSolo(v, { salva: x => Rete.post('/server/salvaIntegrazione', { chiave: i.chiave, account: x }) });
      let chiudi;
      chiudi = finestra({ titolo: 'Account', corpo: campo('Nome dell\'account', v),
        allaChiusura: async () => { await B.inCoda(() => null); M.lista = null; M.dettaglio = null; await leggi().catch(() => null); apri(i.chiave); },
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] });
    }

    async function provaAdesso(chiave) {
      const nome = ((M.lista || []).find(i => i.chiave === chiave) || {}).nome || 'il collegamento';
      const r = await lavora('Provo ' + nome, () => Rete.post('/server/provaIntegrazione', { chiave }));
      if (!r) return;
      const nuovo = r.integrazione || {};
      const s = Q.pillola(nuovo);
      avviso(nome + ': ' + s.parola + (nuovo.esito ? ' · ' + Q.senzaSegreti(nuovo.esito) : ''), Q.statoVisto(nuovo) === 'errore');
      M.lista = null;
      M.seg = M.seg || null;
      await leggi().catch(() => null);
      W.caricaDashboard();
      W.ridisegna();
      if (M.aperta === chiave || document.querySelector('.pannello-integrazione')) { M.dettaglio = null; apri(chiave); }
    }

    // ===================================================================== il calendario in altre app (§5, §0.3)

    async function leggiFeed() { M.feed = (await Rete.get('/server/feedCalendario')).feed || []; }

    function calendarioAltre(pagina) {
      const imp = S.ana.impostazioni || {};
      const studio = W.puo('attivita', 2) && !(S.io && S.io.utente && S.io.utente.ruolo === 'collaboratore') && !W.eEsterno();
      const lettura = S.io && S.io.utente && S.io.utente.ruolo === 'lettura';
      if (M.cosa === 'studio' && !studio) M.cosa = 'mie';
      aggiungi(pagina, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Indietro', () => W.vai('#attivita/calendario')), h('span', { class: 'dove' }, 'Attività e calendario')),
        h('div', { class: 'testata' }, h('h1', null, 'Il calendario in altre app'))]);
      const sinistra = h('div', { class: 'sezione' });
      const destra = h('div', { class: 'sezione' });
      aggiungi(pagina, [h('div', { class: 'due-colonne stretta-1100' }, sinistra, destra)]);

      // A sinistra: il file da scaricare (§5.4).
      const zonaCosa = h('div');
      const zonaCaselle = h('div', { class: 'fila' });
      const disegnaScelte = () => {
        aggiungi(svuota(zonaCosa), [segmenti([['mie', 'Le mie cose']].concat(studio ? [['studio', 'Tutto lo studio']] : []), M.cosa, x => { M.cosa = x; disegnaScelte(); })]);
        aggiungi(svuota(zonaCaselle), [casella('Ferie e assenze', M.assenze, v => { M.assenze = v; disegnaScelte(); }),
          W.puo('documenti') ? casella('Scadenze', M.scadenze, v => { M.scadenze = v; disegnaScelte(); }) : null]);
      };
      disegnaScelte();
      const periodo = 'Da ' + (Number(imp.CALENDARIO_GIORNI_PRIMA) === 30 || imp.CALENDARIO_GIORNI_PRIMA === undefined ? 'un mese fa' : (imp.CALENDARIO_GIORNI_PRIMA || 30) + ' giorni fa') + ' a ' +
        (Number(imp.CALENDARIO_MESI_DOPO) === 12 || imp.CALENDARIO_MESI_DOPO === undefined ? 'un anno da oggi' : (imp.CALENDARIO_MESI_DOPO || 12) + ' mesi da oggi');
      aggiungi(sinistra, [h('div', { class: 'scheda fila' }, h('h2', null, 'Scarica un file'),
        h('div', { class: 'campo' }, h('label', null, 'Cosa'), zonaCosa), zonaCaselle,
        h('span', { class: 'secondario' }, periodo),
        h('div', null, h('button', { type: 'button', class: 'btn' + (lettura ? '' : ' giallo'), onclick: scaricaIcs }, icona('scarica', 18, 2.2), 'Scarica il file')))]);
      const zonaAnteprima = h('div', { class: 'sezione' });
      aggiungi(sinistra, [zonaAnteprima]);
      anteprima(zonaAnteprima);

      // A destra: gli indirizzi (§5.5).
      const zonaFeed = h('div', { class: 'fila' }, segnaposto(2, 56));
      aggiungi(destra, [h('div', { class: 'scheda fila' }, h('h2', null, 'Sempre aggiornato'), zonaFeed,
        h('div', null, h('button', { type: 'button', class: 'btn', onclick: nuovoIndirizzo }, icona('piu', 18, 2.6), 'Nuovo indirizzo')))]);
      const pubblico = imp.CALENDARIO_PUBBLICO === true || imp.CALENDARIO_PUBBLICO === 'true';
      aggiungi(destra, [h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('globo'), titolo: 'Google Calendar e Outlook',
        sotto: pubblico ? 'Acceso: nel Nuovo indirizzo c\'è Anche fuori casa (passa da Google)' : 'Li leggono i server di Google e Microsoft',
        destra: pubblico ? null : pill('Dipende da una scelta', 'grigio'),
        onclick: pubblico ? null : () => avviso('Li leggono i server di Google e Microsoft: serve un indirizzo su internet. Si sceglie in Amministrazione.'), freccia: false }))]);
      (M.feed ? Promise.resolve() : leggiFeed()).then(() => disegnaFeed(zonaFeed)).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zonaFeed), [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message || String(e)))]);
      });
    }

    function casella(testo, acceso, cambia) {
      return h('button', { type: 'button', class: 'casella-riga', role: 'checkbox', 'aria-checked': acceso ? 'true' : 'false', onclick: () => cambia(!acceso) },
        h('span', { class: 'casella' + (acceso ? ' si' : '') }, acceso ? icona('spunta', 16, 3) : null), testo);
    }

    function disegnaFeed(zona) {
      const lista = (M.feed || []).filter(f => !f.revocatoIl);
      svuota(zona);
      if (!lista.length) { aggiungi(zona, [h('div', { class: 'secondario' }, 'Nessun indirizzo')]); return; }
      aggiungi(zona, [h('div', { class: 'scheda righe interna' }, lista.map(f => riga({ sinistra: quadrato('calendario'), titolo: f.nome,
        sotto: Q.cosaFeed(f.cosa) + ' · ' + Q.letturaFeed(f, new Date()),
        destra: h('span', { class: 'pillole-destra' }, pill(f.dettagli ? 'Con i dettagli' : 'Senza dettagli', 'grigio'), f.pubblico ? pill('Fuori casa', 'blu') : null),
        onclick: () => apriFeed(f) })))]);
    }

    async function anteprima(zona) {
      if (!W.puo('attivita') || !S.io || !S.io.utente) return;
      try {
        if (!M.anteprima) {
          const RA = radice.WisperRegoleAttivita;
          const oggi = C.oggiIso();
          const r = await Rete.get('/server/attivita?da=' + oggi + '&a=' + RA.piuGiorni(oggi, 14) + '&assegnata=' + encodeURIComponent(S.io.utente.id));
          M.anteprima = (r.attivita || []).map(RA.normalizzaAttivita).filter(a => a.stato !== 'annullata').slice(0, 5);
        }
      } catch (e) { return; }
      if (!M.anteprima.length) return;
      const RA = radice.WisperRegoleAttivita;
      aggiungi(zona, [h('span', { class: 'etichetta' }, 'Come lo vedi nel calendario'), h('div', { class: 'scheda righe' }, M.anteprima.map(a => riga({ sinistra: quadrato('calendario'),
        titolo: (RA.conOrario(a) && a.inizio ? '' : 'Da fare: ') + a.titolo,
        sotto: [RA.quandoBreve(RA.giornoDi(a)), RA.conOrario(a) && a.inizio && !a.tuttoIlGiorno ? RA.ora(a.inizio) + (a.fine ? '-' + RA.ora(a.fine) : '') : 'tutto il giorno', a.luogo].filter(Boolean).join(' · ') })))]);
    }

    async function scaricaIcs() {
      const r = await lavora('Preparo il file', () => Rete.post('/server/esportaCalendario', { cosa: M.cosa, assenze: !!M.assenze, scadenze: !!(M.scadenze && W.puo('documenti')) }));
      if (!r) return;
      if (S.esempio) { avviso('Nella visita non si salva niente'); return; }
      const fatto = await lavora('Salvo il file', () => Api.post('/locale/salva-file', { nome: r.nome || 'wisper-calendario.ics', base64: r.base64 || '' }));
      if (fatto && fatto.ok) avviso('Salvato in ' + fatto.percorso + (r.eventi !== undefined ? ' · ' + r.eventi + ' eventi' : ''));
    }

    function nuovoIndirizzo() {
      const imp = S.ana.impostazioni || {};
      const studio = W.puo('attivita', 2) && !(S.io && S.io.utente && S.io.utente.ruolo === 'collaboratore') && !W.eEsterno();
      const pubblicoAcceso = imp.CALENDARIO_PUBBLICO === true || imp.CALENDARIO_PUBBLICO === 'true';
      const nome = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Telefono di ' + String((S.io && S.io.utente && S.io.utente.nome) || '').split(' ')[0] });
      const s = { cosa: 'mie', assenze: true, scadenze: false, dettagli: true, pubblico: false, errore: '' };
      const zona = h('div', { class: 'fila' });
      const piede = h('div', { class: 'piede-f' });
      let chiudi;
      const interr = (nomeI, acceso, cambia, spento) => {
        const b = h('button', { type: 'button', class: 'interruttore' + (acceso ? ' acceso' : ''), role: 'switch', 'aria-checked': acceso ? 'true' : 'false', 'aria-label': nomeI, disabled: !!spento, onclick: () => cambia(!acceso) }, h('i'));
        return h('div', { class: 'riga riga-int' }, h('span', { class: 'corpo' }, h('span', { class: 't1' }, nomeI)), b);
      };
      const disegna = () => {
        aggiungi(svuota(zona), [campo('Nome', nome, s.errore),
          h('div', { class: 'campo' }, h('label', null, 'Cosa'), segmenti([['mie', 'Le mie cose']].concat(studio ? [['studio', 'Tutto lo studio']] : []), s.cosa, x => { s.cosa = x; disegna(); })),
          h('div', { class: 'scheda righe interna' },
            interr('Ferie e assenze', s.assenze, v => { s.assenze = v; disegna(); }),
            W.puo('documenti') ? interr('Scadenze', s.scadenze, v => { s.scadenze = v; disegna(); }) : null,
            interr('Con i dettagli', s.dettagli && !s.pubblico, v => { s.dettagli = v; disegna(); }, s.pubblico),
            pubblicoAcceso ? interr('Anche fuori casa (passa da Google)', s.pubblico, v => { s.pubblico = v; if (v) s.dettagli = false; disegna(); }) : null)]);
      };
      const crea = async () => {
        s.errore = Q.erroreNomeFeed(nome.value, M.feed);
        if (s.errore) { disegna(); nome.focus(); return; }
        const corpo = { nome: nome.value.trim(), cosa: { attivita: s.cosa, assenze: !!s.assenze, scadenze: !!(s.scadenze && W.puo('documenti')) }, dettagli: !!s.dettagli && !s.pubblico };
        if (s.pubblico) corpo.pubblico = true;
        const r = await lavora('Creo l\'indirizzo', () => Rete.post('/server/nuovoFeed', corpo));
        if (!r) return;
        M.feed = null;
        const indirizzo = String(r.indirizzo || '');
        // L'indirizzo si vede UNA volta, adesso (§5.5): poi resta solo nel calendario che lo usa.
        aggiungi(svuota(zona), [h('b', { class: 'testo-forte' }, (r.feed && r.feed.nome) || corpo.nome),
          h('div', { class: 'indirizzo-feed', title: indirizzo }, indirizzo),
          h('span', { class: 'secondario' }, (s.pubblico ? 'Passa dallo script del portale: lo leggono Google e Microsoft, senza dettagli. ' : 'Si aggiorna quando il telefono è in casa; fuori casa resta l\'ultima lettura. ') +
            'Non lo mostriamo più: se lo perdi, ne fai uno nuovo.')]);
        aggiungi(svuota(piede), [h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Fatto'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => { const ok = await copiaTesto(indirizzo); avviso(ok ? 'Indirizzo copiato' : 'Non sono riuscito a copiarlo: selezionalo e copialo a mano', !ok); } }, icona('copia', 18, 2.2), 'Copia l\'indirizzo')]);
      };
      disegna();
      aggiungi(piede, [h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: crea }, 'Crea l\'indirizzo')]);
      chiudi = finestra({ contenuto: [h('div', { class: 'testa-f' }, h('h2', null, 'Nuovo indirizzo'), tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')), h('div', { class: 'corpo-f' }, zona), piede],
        titolo: 'Nuovo indirizzo', allaChiusura: () => { if (location.hash === '#attivita/altreapp') W.disegnaPagina(); } });
    }

    function apriFeed(f) {
      let chiudi;
      const coppie = [['Cosa', Q.cosaFeed(f.cosa)], ['Ultima lettura', Q.letturaFeed(f, new Date())], ['Letture', String(f.letture || 0)], ['Dettagli', f.dettagli ? 'Con i dettagli' : 'Senza dettagli'],
        ['Fuori casa', f.pubblico ? 'Sì, passa da Google' : 'No'], ['Creato', f.creato ? Q.quandoBreve(f.creato, new Date()) : '']].filter(x => x[1]);
      chiudi = finestra({ titolo: f.nome, fuoco: false,
        corpo: h('div', { class: 'coppie una' }, coppie.map(x => h('div', { class: 'coppia' }, h('span', { class: 'k' }, x[0]), h('span', { class: 'v' }, x[1])))),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn grande bordo-rosso', onclick: async () => {
            const r = await lavora('Tolgo l\'indirizzo', () => Rete.post('/server/revocaFeed', { id: f.id }));
            if (!r) return;
            chiudi();
            M.feed = null;
            avviso('Indirizzo tolto: il calendario che lo usava non si aggiorna più');
            W.disegnaPagina();
          } }, 'Togli l\'indirizzo')] });
    }

    return { vista, chiudiPannello, daRileggere, numerino, calendarioAltre, M };
  };
})(window);
