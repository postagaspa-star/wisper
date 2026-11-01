/*
 * Wisper Ufficio: Preventivi e contratti (docs/gestionale/fase2.md §5, prototipo
 * docs/prototipo/Gestionale-fase2.html, vista Computer).
 *
 *  - l'elenco con Bozze, Inviati, Accettati, Scaduti, Tutti, la ricerca e la tabella;
 *  - l'editor a due colonne: a sinistra le sezioni richiudibili con le voci (dal
 *    listino o libere, trascinabili), a destra il conto che si aggiorna e cosa chiede
 *    la legge;
 *  - la pagina del preventivo: stato e passi, UN pulsante giallo secondo lo stato,
 *    il menu ⋯ (nuova revisione, duplica, modello, inviato senza email, rifiutato, PDF);
 *  - l'invio al cliente col PDF, "Come ha accettato?", "Crea la commessa";
 *  - il listino delle prestazioni e i contratti (incarichi).
 * I conti veri li fa il server; qui c'è l'anteprima (conti.js, contiPreventivo).
 */
(function (radice) {
  'use strict';

  radice.WisperPreventivi = function (W) {
    const { S, C, D, R, B, Rete } = W;
    const RP = radice.WisperRegolePreventivi;
    const { h, aggiungi, svuota, icona, tondo, iniziali, pillola, avviso, lavora, finestra, conferma, apriMenu, campo, conSuffisso, selezione, segmenti, cerca, riga, segnaposto } = B;
    const puo = W.puo;
    const soldi = W.soldi;
    const scrive = () => puo('preventivi', 2);

    // Quello che si legge solo qui. lista/listino null = da leggere.
    const M = { lista: null, listino: null, aperti: {}, filtri: { segmento: 'tutti', testo: '' }, bozza: null, chiave: '', chiusa: {}, archiviateListino: false };

    const nomeCliente = id => (W.cliente(id) || { nome: id || '—' }).nome;
    const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const dataParole = s => { if (!s) return ''; const d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return d.getDate() + ' ' + MESI[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
    const pillStato = p => { const st = RP.statoVisto(p); const x = RP.STATI[st] || RP.STATI.BOZZA; return pillola(x.parola, x.colore); };
    const pillNumero = p => h('span', { class: 'pill p-grigio num' }, RP.numeroConRevisione(p));

    /** Rilegge l'elenco e il listino (dopo ogni cambio: un altro computer può aver scritto). */
    async function leggiElenco() {
      const [l, li] = await Promise.all([Rete.get('/server/preventivi?modelli=1'), M.listino ? Promise.resolve(null) : Rete.get('/server/listino')]);
      M.lista = (l.preventivi || []).map(RP.normalizzaPreventivo);
      if (li) M.listino = li.listino || [];
    }
    async function leggiListino(archiviate) {
      const li = await Rete.get('/server/listino' + (archiviate ? '?tutte=1' : ''));
      M.listino = li.listino || [];
    }
    async function leggiPreventivo(id) {
      const r = await Rete.get('/server/preventivo?id=' + encodeURIComponent(id));
      M.aperti[id] = RP.normalizzaPreventivo(r.preventivo);
      return M.aperti[id];
    }

    /** Una pagina che legge prima di disegnare: segnaposto, poi la pagina, o l'errore con Riprova. */
    function conDati(pagina, leggi, disegna) {
      const zona = h('div', { class: 'sezione' }, segnaposto(4, 64));
      aggiungi(pagina, [zona]);
      leggi().then(() => { svuota(zona); zona.remove(); disegna(); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.disegnaPagina() }, 'Riprova'))]);
      });
    }

    /** "#preventivi", "#preventivi/listino", "#preventivi/12", "#preventivi/12/modifica", "#preventivi/nuovo". */
    function vista(pagina, a1, a2) {
      if (!a1) return conDati(pagina, leggiElenco, () => elenco(pagina));
      if (a1 === 'listino') return conDati(pagina, () => leggiListino(M.archiviateListino), () => listino(pagina));
      if (a1 === 'contratti') return conDati(pagina, leggiElenco, () => contratti(pagina));
      if (a1 === 'nuovo') {
        if (!scrive()) return W.senzaPermesso(pagina);
        return conDati(pagina, () => M.listino ? Promise.resolve() : leggiListino(false), () => editor(pagina, null));
      }
      if (a2 === 'modifica') {
        if (!scrive()) return W.senzaPermesso(pagina);
        return conDati(pagina, async () => { await leggiPreventivo(a1); if (!M.listino) await leggiListino(false); }, () => editor(pagina, M.aperti[a1]));
      }
      return conDati(pagina, () => leggiPreventivo(a1), () => paginaPreventivo(pagina, M.aperti[a1]));
    }

    // ===================================================================== elenco

    function elenco(pagina) {
      const f = M.filtri;
      const n = RP.contaPreventivi(M.lista);
      const modelli = M.lista.filter(p => p.modello);
      const area = h('div', { class: 'sezione' });
      const daModello = scrive() && modelli.length ? h('button', { type: 'button', class: 'btn' }, 'Da un modello') : null;
      if (daModello) daModello.addEventListener('click', () => apriMenu(daModello, modelli.map(m => ({ testo: m.oggetto, fn: () => nuovoDaModello(m) }))));
      aggiungi(pagina, [
        h('div', { class: 'testata alta' },
          h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Preventivi e contratti'), h('h1', null, 'Preventivi')),
          h('button', { type: 'button', class: 'btn', onclick: () => W.vai('#preventivi/listino') }, icona('libro', 18, 2.2), 'Listino'),
          h('button', { type: 'button', class: 'btn', onclick: () => W.vai('#preventivi/contratti') }, icona('contratto', 18, 2.2), 'Contratti'),
          daModello,
          scrive() ? h('button', { type: 'button', class: 'btn giallo', 'data-visita': 'nuovo-preventivo', onclick: () => W.vai('#preventivi/nuovo') }, icona('piu', 18, 2.6), 'Nuovo preventivo') : null),
        h('div', { class: 'filtri' },
          segmenti(RP.SEGMENTI.map(s => [s[0], s[1] + ' · ' + n[s[0]]]), f.segmento, x => { f.segmento = x; W.disegnaPagina(); }),
          cerca(f.testo, 'Numero, oggetto, cliente', x => { f.testo = x; tabella(area); }),
          // Fase 3: l'esportazione per Excel che il server sa fare dalla fase 2 (§13.9).
          h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.esporta('preventivi', {}) }, 'Esporta per Excel')),
        area]);
      tabella(area);
    }

    const COLONNE = () => '190px minmax(0, 2fr) minmax(0, 1.3fr) 156px ' + (soldi() ? '120px ' : '') + '108px';

    function tabella(area) {
      svuota(area);
      const lista = RP.filtraPreventivi(M.lista, M.filtri, nomeCliente);
      if (!lista.length) {
        aggiungi(area, [h('p', { class: 'vuoto' }, M.lista.some(p => !p.modello) ? 'Nessun preventivo con questi filtri.' : 'Ancora nessun preventivo.')]);
        return;
      }
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: COLONNE() } },
        h('span', null, 'Numero'), h('span', null, 'Oggetto'), h('span', null, 'Cliente'), h('span', null, 'Scadenza'),
        soldi() ? h('span', { class: 'n' }, 'Totale') : null, h('span', null, 'Stato')));
      lista.forEach((p, i) => {
        const apri = () => W.vai('#preventivi/' + encodeURIComponent(p.id));
        aggiungi(tab, [h('div', { class: 'r cliccabile alta', style: { gridTemplateColumns: COLONNE() }, role: 'button', tabindex: '0', 'data-visita': i === 0 ? 'riga-preventivo' : null,
          onclick: apri, onkeydown: e => { if (e.key === 'Enter') apri(); } },
        h('span', null, pillNumero(p)),
        h('span', { class: 'forte taglia' }, p.oggetto),
        h('span', { class: 'taglia t2' }, p.cliente || nomeCliente(p.idCliente)),
        h('span', { class: 'taglia t2' }, RP.scadenzaAParole(p) || (p.idCommessa ? 'commessa ' + p.idCommessa : '—')),
        soldi() ? h('span', { class: 'n forte' }, p.totale !== undefined ? C.euro(p.totale) : '') : null,
        h('span', null, pillStato(p)))]);
      });
      aggiungi(area, [tab]);
    }

    async function nuovoDaModello(m) {
      const ris = await lavora('Preparo il preventivo', () => Rete.post('/server/duplicaPreventivo', { id: m.id, comeModello: false }));
      if (!ris) return;
      M.lista = null;
      avviso('Preventivo ' + ris.preventivo.numero + ' preparato dal modello: scegli il cliente');
      W.vai('#preventivi/' + encodeURIComponent(ris.preventivo.id) + '/modifica');
    }

    // ===================================================================== pagina del preventivo

    function paginaPreventivo(pagina, p) {
      if (!p) { aggiungi(pagina, [h('p', { class: 'vuoto' }, 'Preventivo non trovato.')]); return; }
      const st = RP.statoVisto(p);
      const voci = C.vociDelPreventivo(p);
      const k = C.contiPreventivo(p, voci);
      const giallo = RP.azioneGialla(p, W.perm());
      const altro = h('button', { type: 'button', class: 'tondo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 20));
      altro.addEventListener('click', () => apriMenu(altro, RP.vociMenu(p, W.perm()).map(v => ({ testo: v.testo, pericolo: v.pericolo, fn: () => azione(v.chiave, p) })).concat(vociPortale(p))));
      const pulsanteGiallo = giallo ? h('button', { type: 'button', class: 'btn giallo', 'data-visita': 'azione-preventivo', onclick: () => azione(giallo.chiave, p) }, giallo.testo) : null;

      aggiungi(pagina, [
        h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna ai preventivi', () => W.vai('#preventivi')), h('span', { class: 'dove' }, 'Preventivi')),
        h('div', { class: 'testata in-alto' },
          h('div', { class: 'titoli' },
            h('div', { class: 'pillole-testa' }, pillNumero(p), pillStato(p), p.portale && W.Portale ? W.Portale.pillola(p.portale) : null, RP.scadenzaAParole(p) ? h('span', { class: 'sotto-titolo piccolo-14' }, RP.scadenzaAParole(p)) : null,
              p.modello ? pillola('Modello', 'grigio') : null),
            h('h1', { class: 'titolo-scheda' }, p.oggetto || 'Senza oggetto'),
            h('span', { class: 'sotto-titolo' }, [p.idCliente ? nomeCliente(p.idCliente) : 'Cliente da scegliere', p.data ? 'del ' + dataParole(p.data) : ''].filter(Boolean).join(' · ')),
            passiPreventivo(p)),
          altro,
          h('button', { type: 'button', class: 'btn', onclick: () => pdf(p, false) }, 'PDF'),
          pulsanteGiallo),
        h('div', { class: 'griglia-prev' },
          h('div', { class: 'colonna-prev' }, sezioniLettura(p, k)),
          h('div', { class: 'colonna-prev' },
            soldi() ? schedaConto(p, k) : null,
            schedaLegge(p),
            schedaPagamenti(p, k),
            schedaStoria(p, st)))]);
    }

    function passiPreventivo(p) {
      const at = RP.passoAttuale(p);
      const nomi = ['Bozza', 'Inviato', 'Accettato'];
      return h('div', { class: 'passi-prev', 'aria-label': 'A che punto è' }, nomi.map((nome, i) => [
        h('span', { class: 'passo' + (i < at ? ' fatto' : i === at ? ' ora' : '') },
          h('i', null, i < at ? icona('spunta', 13, 3) : String(i + 1)), nome),
        i < nomi.length - 1 ? h('span', { class: 'trattino' }) : null]));
    }

    /** Le sezioni da leggere: voce, quantità × prezzo, facoltativa o alternativa, importo; quelle che non contano più chiare. */
    function sezioniLettura(p, k) {
      const tutte = C.vociDelPreventivo(p);
      if (!p.sezioni.length || !tutte.length) return h('div', { class: 'calmo' }, 'Nessuna voce.');
      return p.sezioni.filter(s => (s.voci || []).length).map(s => h('div', { class: 'sezione-dash' },
        h('div', { class: 'testa-sez' }, h('span', { class: 'etichetta' }, s.titolo || 'Prestazioni'), soldi() ? h('span', { class: 'etichetta' }, C.euro(k.perSezione[String(s.id)] || 0)) : null),
        h('div', { class: 'scheda righe' }, s.voci.map(v => {
          const conta = v.conta !== undefined ? !!v.conta : C.contaVoce(v, tutte);
          const segno = C.gruppoAlternativa(v) ? pillola('Una di queste' + (v.scelta ? ': scelta' : ''), 'blu') : v.facoltativa ? pillola('Facoltativa' + (v.scelta ? ', scelta' : ''), 'giallo') : null;
          return h('div', { class: 'riga' + (conta ? '' : ' non-conta') },
            h('span', { class: 'corpo' }, h('span', { class: 't1' }, v.descrizione), h('span', { class: 't2' }, dettaglioVoce(v)), segno ? h('span', { class: 'segno-voce' }, segno) : null),
            soldi() ? h('span', { class: 'quanto' }, C.num(v.prezzo) > 0 ? C.euro(v.importo !== undefined ? v.importo : C.importoVoce(v)) : h('span', { class: 'da-scegliere' }, 'senza prezzo')) : null);
        }))));
    }

    function dettaglioVoce(v) {
      const q = C.num(v.quantita === undefined || v.quantita === null || v.quantita === '' ? 1 : v.quantita);
      const conPrezzo = soldi() && C.num(v.prezzo) > 0;
      let t = v.modo === 'ore' ? C.numero(q) + (q === 1 ? ' ora' : ' ore') : v.modo === 'quantita' ? C.numero(q) + ' ' + (v.unita || 'pz') : (q === 1 ? 'a corpo' : C.numero(q) + ' a corpo');
      if (conPrezzo && (v.modo !== 'corpo' || q !== 1)) t += ' × ' + C.euro(v.prezzo);
      if (C.num(v.scontoPercentuale) > 0) t += ' · sconto ' + C.numero(v.scontoPercentuale) + '%';
      return t;
    }

    function righeConto(p, k) {
      const r = [];
      if (k.sconto > 0) {
        r.push(['Totale delle voci', k.sommaVoci]);
        if (k.scontoDaPercentuale > 0) r.push(['Sconto ' + C.numero(p.scontoPercentuale) + '%', -k.scontoDaPercentuale]);
        if (k.scontoEuro > 0) r.push(['Sconto', -k.scontoEuro]);
      }
      r.push(['Imponibile', k.imponibile], ['Contributo integrativo EPPI ' + C.numero(p.eppiPercentuale) + '%', k.contributo], ['IVA ' + C.numero(p.ivaPercentuale) + '%', k.iva]);
      return r;
    }

    function schedaConto(p, k, vivo) {
      return h('div', { class: 'scheda conto-prev', 'data-visita': vivo ? null : 'conto-preventivo' },
        h('span', { class: 'etichetta' }, 'Il conto'),
        righeConto(p, k).map(x => h('div', { class: 'rc' }, h('span', null, x[0]), h('span', null, C.euro(x[1])))),
        h('div', { class: 'tot' }, h('b', null, 'Totale'), h('b', { class: 'numero-grande' }, C.euro(k.totale))));
    }

    function schedaLegge(p, voci) {
      const lista = RP.cosaChiedeLaLegge(p, S.ana.impostazioni, voci);
      const manca = lista.filter(x => !x.ok);
      return h('div', { class: 'scheda legge' },
        h('span', { class: 'etichetta' }, 'Cosa chiede la legge'),
        lista.map(x => h('div', { class: 'voce-legge' + (x.ok ? '' : ' manca') }, icona(x.ok ? 'spunta' : 'allarme', 18, 2.4), h('span', null, x.testo + (x.ok ? '' : ': manca')))),
        manca.some(x => x.dove === 'studio') && puo('amministrazione', 2) ? h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.vai('#amministrazione/studio') }, 'Scrivi polizza e titoli in Dati dello studio') : null);
    }

    function schedaPagamenti(p, k) {
      const lista = p.scadenzePagamento || [];
      if (!lista.length) return null;
      const quando = Object.fromEntries(RP.QUANDO);
      return h('div', { class: 'scheda pagamenti' }, h('span', { class: 'etichetta' }, 'Pagamenti'),
        lista.map(s => h('div', { class: 'rc' },
          h('span', null, rigaPagamento(s, quando)),
          soldi() ? h('span', null, C.euro(s.importo !== undefined && s.importo !== null ? s.importo : C.importoScadenza(s, k.imponibile))) : null)),
        RP.controllaScadenze(lista) ? h('div', { class: 'secondario errore' }, RP.controllaScadenze(lista)) : null);
    }

    /** "30% · Acconto · alla firma", senza ripetere quello che la descrizione dice già ("30% alla firma"). */
    function rigaPagamento(s, quando) {
      const desc = String(s.descrizione || '').trim();
      const d = desc.toLowerCase();
      const quota = s.tipo === 'importo' ? '' : C.numero(s.valore) + '%';
      const q = s.quando === 'data' && s.data ? 'il ' + C.data(s.data) : String(quando[s.quando] || '').toLowerCase();
      return [quota && d.indexOf(quota.toLowerCase()) < 0 ? quota : '', desc, q && d.indexOf(q) < 0 && d.indexOf(q.replace(/^(alla|al|a|ad) /, '')) < 0 ? q : '']
        .filter((x, i, a) => x && a.findIndex(y => String(y).toLowerCase() === String(x).toLowerCase()) === i).join(' · ');
    }

    /** Accettazione, rifiuto, commessa, revisioni e note interne: la storia del preventivo. */
    function schedaStoria(p, st) {
      const righe = [];
      const MODI = { firma: 'con la firma', email: 'per email', documento: 'col documento firmato', voce: 'a voce', portale: 'nel portale' };
      // Fase 7 (§3.8, §12.6): accettato nel portale con la firma, "Roberto Ferretti · 22/10/2026 10:07 · nel portale", e la prova.
      const acc = p.accettazione || null;
      if (st === 'ACCETTATO' && acc && acc.modo === 'portale') {
        righe.push(['Accettato', [acc.da || p.accettatoDa, acc.il ? C.dataOra(acc.il) : (p.accettatoIl ? C.data(p.accettatoIl) : ''), 'nel portale'].filter(Boolean).join(' · ')]);
        const idFirma = (acc.firma && acc.firma.id) || (p.firma && p.firma.id) || '';
        if (idFirma) righe.push(['Firma', h('img', { class: 'firma-accettazione', src: '/file/' + idFirma, alt: 'Firma di ' + (acc.da || '') })]);
        if (acc.prova && puo('preventivi', 2)) righe.push(['Prova', h('button', { type: 'button', class: 'btn collegamento', onclick: () => provaAccettazione(p, acc) }, 'Prova dell\'accettazione')]);
      }
      if (p.inviatoIl) righe.push(['Inviato', 'il ' + C.dataOra(p.inviatoIl)]);
      if (st === 'ACCETTATO' && !(acc && acc.modo === 'portale')) righe.push(['Accettato', [p.accettatoDa, p.accettatoIl ? 'il ' + C.data(p.accettatoIl) : '', MODI[p.accettazioneModo]].filter(Boolean).join(' · ')]);
      if (st === 'RIFIUTATO') righe.push(['Rifiutato', [p.rifiutatoIl ? 'il ' + C.data(p.rifiutatoIl) : '', p.motivoRifiuto].filter(Boolean).join(' · ')]);
      if (p.idCommessa) righe.push(['Commessa', h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.vai('#commesse/' + encodeURIComponent(p.idCommessa)) }, p.idCommessa)]);
      if (p.complessitaNota) righe.push(['Complessità', p.complessitaNota]);
      if (p.noteInterne) righe.push(['Note per te', p.noteInterne]);
      // Le altre revisioni dello stesso numero (il server mette anche questa).
      const revisioni = (p.revisioni || []).filter(x => String(x.id) !== String(p.id)).sort((a, b) => b.revisione - a.revisione);
      if (!righe.length && !revisioni.length) return null;
      return h('div', { class: 'scheda storia' },
        righe.map(r => h('div', { class: 'coppia' }, h('span', { class: 'k' }, r[0]), h('span', { class: 'v' }, r[1]))),
        revisioni.length ? h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Altre revisioni'),
          h('div', { class: 'pillole' }, revisioni.map(x => h('button', { type: 'button', class: 'pillola', onclick: () => W.vai('#preventivi/' + encodeURIComponent(x.id)) },
            'rev. ' + x.revisione + ' · ' + ((RP.STATI[String(x.stato).toUpperCase()] || {}).parola || x.stato))))) : null);
    }

    /** Fase 7 (§8.2): Pubblica nel portale / Togli dal portale nel menu ⋯ (portale 2 e preventivi 1; mai una bozza). */
    function vociPortale(p) {
      if (!W.Portale || !W.Portale.puoPubblicare('preventivo') || p.modello) return [];
      const st = RP.statoVisto(p);
      if (p.portale && p.portale.pubblicato) return ['-', { testo: 'Togli dal portale', fn: () => W.Portale.togli(p.portale.pubblicazione || { tipo: 'preventivo', rif: p.id, idCliente: p.idCliente }, () => ricarica(p)) }];
      if (['INVIATO', 'SCADUTO', 'ACCETTATO', 'RIFIUTATO'].indexOf(st) < 0) return [];
      return ['-', { testo: 'Pubblica nel portale', fn: async () => { const r = await W.Portale.pubblica('preventivo', p.id, { idCliente: p.idCliente, nomeCliente: nomeCliente(p.idCliente), titolo: 'Preventivo ' + RP.numeroConRevisione(p) }); if (r) ricarica(p); } }];
    }
    async function ricarica(p) {
      delete M.aperti[p.id];
      M.lista = null;
      W.disegnaPagina();
    }

    /** La prova dell'accettazione nel portale (§3.8): chi, quando, con che dispositivo, l'impronta del preventivo visto. Niente IP (§0.4). */
    function provaAccettazione(p, acc) {
      const x = acc.prova || {};
      const coppie = [['Chi', [acc.da, x.email || (acc.referente && acc.referente.email)].filter(Boolean).join(' · ')], ['Quando', acc.il ? C.dataOra(acc.il) : ''],
        ['Dispositivo', x.agente || x.browser || ''], ['Come', x.via === 'google' ? 'dal portale, passando da Google' : 'dal portale'],
        ['Impronta del preventivo visto', x.impronta || ''], ['Versione', x.versione || '']].filter(c => c[1]);
      let chiudi;
      chiudi = finestra({ titolo: 'Prova dell\'accettazione', fuoco: false,
        corpo: h('div', { class: 'coppie una' }, coppie.map(c => h('div', { class: 'coppia' }, h('span', { class: 'k' }, c[0]), h('span', { class: 'v' + (c[0].indexOf('Impronta') === 0 ? ' impronta' : '') }, c[1])))),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] });
    }

    // ----------------------------------------------------------------- le azioni

    function azione(chiave, p) {
      ({
        invia: () => invia(p),
        accetta: () => accetta(p),
        creaCommessa: () => creaCommessa(p),
        apriCommessa: () => { S.schedaCommessa[p.idCommessa] = 'prestazioni'; W.vai('#commesse/' + encodeURIComponent(p.idCommessa)); },
        modifica: () => W.vai('#preventivi/' + encodeURIComponent(p.id) + '/modifica'),
        nuovaRevisione: () => nuovaRevisione(p, 'nuovaRevisione'),
        riapri: () => nuovaRevisione(p, 'riapriPreventivo'),
        duplica: () => duplica(p, false),
        modello: () => duplica(p, true),
        segnaInviato: () => segnaInviato(p),
        rifiuta: () => rifiuta(p),
        pdf: () => pdf(p, false),
        incarico: () => pdf(p, true),
      }[chiave] || (() => null))();
    }

    /** Dopo un cambio: il preventivo come l'ha salvato il server, l'elenco da rileggere, la Dashboard. */
    function accogli(ris) {
      if (ris && ris.preventivo) M.aperti[ris.preventivo.id] = RP.normalizzaPreventivo(ris.preventivo);
      M.lista = null;
      W.caricaDashboard();
    }

    function nomePdf(p, incarico) {
      return W.nomeFile((incarico ? 'Incarico ' : 'Preventivo ') + RP.numeroConRevisione(p).replace(' · ', ' '), nomeCliente(p.idCliente));
    }

    async function pdf(p, incarico, base64) {
      if (S.esempio) { avviso('Nella visita il PDF non si crea'); return null; }
      const html = incarico ? D.incarico(p, S.ana, {}) : D.preventivo(p, S.ana, {});
      const ris = await lavora('Preparo il PDF', () => Rete.post('/locale/pdf', { html, nome: nomePdf(p, incarico), apri: !base64, base64: !!base64 }));
      if (ris && !base64) avviso('PDF salvato in ' + ris.percorso);
      return ris;
    }

    async function nuovaRevisione(p, cosa) {
      const ok = await conferma(cosa === 'riapriPreventivo' ? 'Riaprire il preventivo?' : 'Fare una nuova revisione?',
        'Si prepara la revisione ' + ((Number(p.revisione) || 0) + 1) + ' di ' + p.numero + ', da cambiare e mandare di nuovo. Quella di adesso resta consultabile, segnata come sostituita.',
        cosa === 'riapriPreventivo' ? 'Riapri' : 'Nuova revisione');
      if (!ok) return;
      const ris = await lavora('Preparo la revisione', () => Rete.post('/server/' + cosa, { id: p.id }));
      if (!ris) return;
      accogli(ris);
      avviso('Revisione ' + ris.preventivo.revisione + ' pronta: la precedente resta consultabile');
      W.vai('#preventivi/' + encodeURIComponent(ris.preventivo.id) + '/modifica');
    }

    async function duplica(p, comeModello) {
      const ris = await lavora(comeModello ? 'Creo il modello' : 'Duplico il preventivo', () => Rete.post('/server/duplicaPreventivo', { id: p.id, comeModello }));
      if (!ris) return;
      accogli(ris);
      if (comeModello) { avviso('Modello creato: lo trovi in Preventivi, «Da un modello»'); return; }
      avviso('Creato ' + ris.preventivo.numero + ', copia di ' + p.numero);
      W.vai('#preventivi/' + encodeURIComponent(ris.preventivo.id));
    }

    async function segnaInviato(p) {
      const ris = await W.scriviConConferma('Segno inviato', '/server/segnaInviato', { id: p.id }, d => domandaLegge(RP.mancanoInBreve({ mancano: d.mancano || [] })));
      if (!ris) return;
      accogli(ris);
      avviso('Segnato inviato');
      W.ridisegna();
    }

    function rifiuta(p) {
      const motivo = h('textarea', { rows: 3 });
      let chiudi;
      const vai = async () => {
        const ris = await lavora('Segno rifiutato', () => Rete.post('/server/rifiutaPreventivo', { id: p.id, motivo: motivo.value.trim() }));
        if (!ris) return;
        chiudi();
        accogli(ris);
        avviso('Preventivo segnato rifiutato', false, null, null);
        W.ridisegna();
      };
      chiudi = finestra({ titolo: 'Il cliente ha rifiutato ' + p.numero, corpo: [campo('Perché, se lo sai', motivo)],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Segna rifiutato')] });
    }

    // ----------------------------------------------------------------- invio al cliente

    /**
     * La finestra d'invio, la stessa del riepilogo dei rapportini: a sinistra la
     * pagina, a destra a chi va, il messaggio, Solo il PDF, Invia per email, e
     * "Segna come inviato senza email". Prima di inviare dice cosa chiede la legge e manca.
     */
    /** La domanda quando manca qualcosa che chiede la legge (DL 1/2012, L. 124/2017). */
    const domandaLegge = elenco => conferma('Manca qualcosa che chiede la legge', 'Nel preventivo manca: ' + elenco.join(', ') + '. Mandarlo lo stesso?', 'Mandalo lo stesso');

    async function invia(p) {
      const manca = RP.statoVisto(p) === 'BOZZA' ? RP.mancanoInBreve(p, S.ana.impostazioni) : [];
      // Già detto sì qui: il server non lo richiede.
      let confermato = false;
      if (manca.length) {
        if (!(await domandaLegge(manca))) return;
        confermato = true;
      }
      const c = W.cliente(p.idCliente) || {};
      const referente = S.ana.referenti.find(r => String(r.id) === String(p.idReferente));
      const imp = S.ana.impostazioni;
      const k = C.contiPreventivo(p, C.vociDelPreventivo(p));
      let chiudi;
      const a = h('input', { type: 'email', value: (referente && referente.email) || c.email || '', placeholder: 'email di ' + (c.nome || 'del cliente') });
      const cc = h('input', { type: 'text' });
      const oggetto = h('input', { type: 'text', value: 'Preventivo ' + RP.numeroConRevisione(p).replace(' · ', ' ') + ' · ' + (p.oggetto || '') });
      const messaggio = h('textarea', { rows: 6 });
      messaggio.value = 'Buongiorno,\nin allegato il preventivo per ' + String(p.oggetto || '').toLowerCase() + (p.scadenza ? ', valido fino al ' + C.data(p.scadenza) : '') + '.\n' +
        'Per accettarlo basta rispondere a questa email o rimandarlo firmato.\n\nCordiali saluti\n' + (imp.TECNICO || imp.RAGIONE_SOCIALE || '');
      const campoA = h('div', null, campo('A', a));
      const zonaMessaggio = h('div', { class: 'fila nascosto' }, campo('Oggetto', oggetto), campo('Copia anche a', cc), campo('Messaggio', messaggio));
      const cambia = h('button', { type: 'button', class: 'btn collegamento', style: { alignSelf: 'flex-start' }, onclick: () => { zonaMessaggio.classList.remove('nascosto'); cambia.remove(); oggetto.focus(); } }, 'Cambia il messaggio');
      const voci = C.vociDelPreventivo(p);
      const foglio = h('div', { class: 'foglio-a4', 'aria-hidden': 'true' },
        h('div', { class: 'testa-a4' }, h('span', null, imp.RAGIONE_SOCIALE || 'Lo studio'), h('span', null, RP.numeroConRevisione(p))),
        h('div', { class: 'linea-a4' }),
        h('div', { class: 'parti-a4' }, h('span', null, imp.RAGIONE_SOCIALE || ''), h('span', null, c.nome || '')),
        h('div', { class: 'riga-a4' }, h('span', null, 'Oggetto: ' + (p.oggetto || ''))),
        voci.slice(0, 9).map(v => h('div', { class: 'riga-a4' }, h('span', null, v.descrizione), h('span', null, C.contaVoce(v, voci) ? C.euro(C.importoVoce(v)) : '(' + C.euro(C.importoVoce(v)) + ')'))),
        voci.length > 9 ? h('div', { class: 'riga-a4' }, h('span', null, '… e altre ' + (voci.length - 9))) : null,
        h('div', { class: 'tot-a4' }, C.euro(k.totale)));

      const manda = async aMe => {
        if (!aMe && !a.value.trim()) { aggiungi(svuota(campoA), [campo('A', a, 'Manca l\'indirizzo: scrivilo qui (lo puoi salvare in Clienti)')]); a.focus(); return; }
        const ris = await lavora(aMe ? 'Mando la copia' : 'Mando l\'email', async () => {
          const f = S.esempio ? null : await Rete.post('/locale/pdf', { html: D.preventivo(p, S.ana, {}), nome: nomePdf(p, false), apri: false, base64: true });
          const corpo = { id: p.id, a: a.value.trim(), cc: cc.value.trim(), oggetto: oggetto.value, messaggio: messaggio.value, aMe: !!aMe,
            allegati: f && f.base64 ? [{ nome: f.nome, base64: f.base64, mime: 'application/pdf' }] : [] };
          if (confermato) corpo.conferma = true;
          try { return await Rete.post('/server/inviaPreventivo', corpo); } catch (e) {
            // Il server sa qualcosa che qui non si sapeva: si chiede e si rimanda.
            if (e && e.dati && e.dati.serveConferma && (await domandaLegge(RP.mancanoInBreve({ mancano: e.dati.mancano || [] })))) return Rete.post('/server/inviaPreventivo', Object.assign(corpo, { conferma: true }));
            if (e && e.dati && e.dati.serveConferma) return null;
            throw e;
          }
        });
        if (!ris) return;
        if (aMe) { avviso('Copia mandata alla tua casella'); return; }
        chiudi();
        accogli(ris);
        // Fase 7 (§12.6): "Preventivo mandato" con Manda anche un WhatsApp (il modello Preventivo mandato, al referente del preventivo).
        avviso('Preventivo mandato a ' + a.value.trim() + (S.esempio ? ' (esempio: non è partito niente)' : ''), false, 9000,
          puo('comunicazioni', 2) && W.Comunicazioni ? { testo: 'Manda anche un WhatsApp', fn: () => W.Comunicazioni.scrivi({ modello: 'preventivo_mandato', canale: 'whatsapp', idReferente: p.idReferente || null, idCliente: p.idCliente, idPreventivo: p.id }) } : null);
        W.ridisegna();
        W.Visita.azione('invia-preventivo');
      };
      const altro = h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18));
      altro.addEventListener('click', () => apriMenu(altro, [{ testo: 'Mandane una copia a me', fn: () => manda(true) }]));
      const contenuto = h('div', { class: 'riepilogo-f' },
        h('div', { class: 'anteprima' }, foglio),
        h('div', { class: 'scelte' },
          h('div', { class: 'titolo-r' }, h('div', null, h('span', { class: 'secondario' }, 'Preventivo ' + RP.numeroConRevisione(p)), h('b', null, (c.nome || '') + (soldi() ? ' · ' + C.euro(k.totale) : ''))),
            altro, tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')),
          campoA, cambia, zonaMessaggio,
          h('div', { class: 'bottoni' },
            h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
            h('button', { type: 'button', class: 'btn grande', onclick: async () => { const r = await pdf(p, false); if (r) chiudi(); } }, 'Solo il PDF'),
            h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': 'invia-preventivo', onclick: () => manda(false) }, 'Invia per email')),
          RP.statoVisto(p) === 'BOZZA' ? h('button', { type: 'button', class: 'btn collegamento', style: { alignSelf: 'center' }, onclick: async () => { chiudi(); await segnaInviato(p); } }, 'Segna come inviato senza email') : null));
      chiudi = finestra({ contenuto, larghezza: 'media', titolo: 'Invia il preventivo', fuoco: false });
    }

    // ----------------------------------------------------------------- accettazione

    /**
     * "Come ha accettato?": firma qui (col mouse), per email, documento firmato, a
     * voce; le facoltative e le alternative da spuntare col totale che si aggiorna;
     * il nome di chi accetta. Un solo pulsante giallo: Segna accettato.
     */
    function accetta(p) {
      const voci = C.vociDelPreventivo(p);
      const scegliere = RP.daScegliere(voci);
      const scelte = RP.scelteIniziali(voci);
      let modo = 'email';
      let documento = null;
      const nome = h('input', { type: 'text', value: (S.ana.referenti.find(r => String(r.id) === String(p.idReferente)) || {}).nome || '' });
      const zonaModi = h('div', { class: 'scelte-ruolo' });
      const zonaScelte = h('div', { class: 'scelte-ruolo' });
      const zonaTotale = h('div', { class: 'totale-accetta' });
      const zonaFirma = h('div');
      const firma = tavolettaFirma();
      let chiudi;

      const disegnaModi = () => aggiungi(svuota(zonaModi), RP.MODI_ACCETTAZIONE.map(m => h('button', { type: 'button', class: 'scelta-ruolo' + (modo === m[0] ? ' scelto' : ''), 'aria-pressed': modo === m[0] ? 'true' : 'false',
        onclick: () => { modo = m[0]; disegnaModi(); disegnaFirma(); } }, h('span', { class: 'pallino-scelta' }), h('span', { class: 'testi' }, h('b', null, m[1])))));
      const disegnaScelte = () => {
        aggiungi(svuota(zonaScelte), scegliere.map(v => {
          const alt = !!C.gruppoAlternativa(v);
          const si = !!scelte[String(v.id)];
          return h('button', { type: 'button', class: 'scelta-ruolo' + (si ? ' scelto' : ''), role: alt ? 'radio' : 'checkbox', 'aria-checked': si ? 'true' : 'false', onclick: () => {
            // Di un gruppo se ne sceglie una sola; un secondo clic la toglie (il cliente può non volerne nessuna).
            if (alt) { voci.filter(x => C.gruppoAlternativa(x) === C.gruppoAlternativa(v)).forEach(x => { scelte[String(x.id)] = x === v && !si; }); } else scelte[String(v.id)] = !si;
            disegnaScelte();
          } }, h('span', { class: 'pallino-scelta' + (alt ? '' : ' quadrato') }), h('span', { class: 'testi' }, h('b', null, v.descrizione),
            h('span', null, (alt ? 'Una di queste' : 'Facoltativa') + (soldi() ? ' · ' + C.euro(C.importoVoce(v)) : ''))));
        }));
        const k = C.contiPreventivo(p, C.applicaScelte(voci, scelte));
        aggiungi(svuota(zonaTotale), soldi() ? [h('b', null, 'Totale'), h('b', { class: 'numero-grande' }, C.euro(k.totale))] : []);
      };
      const disegnaFirma = () => {
        svuota(zonaFirma);
        if (modo === 'firma') aggiungi(zonaFirma, [h('div', { class: 'campo' }, h('label', null, 'Firma del cliente'), firma.el)]);
        if (modo === 'documento') {
          aggiungi(zonaFirma, [h('div', { class: 'riga-documento' }, h('span', { class: 'secondario' }, documento ? documento.nome : 'La scansione o la foto del preventivo firmato'),
            h('button', { type: 'button', class: 'btn', onclick: async () => {
              const f = await Rete.post('/locale/scegli-file', { filtro: 'tutti' }).catch(() => null);
              if (f && f.ok) { documento = f; disegnaFirma(); }
            } }, documento ? 'Cambia il file' : 'Scegli il file'))]);
        }
      };
      disegnaModi(); disegnaScelte(); disegnaFirma();

      const vai = async () => {
        if (!nome.value.trim()) { nome.focus(); avviso('Scrivi il nome di chi ha accettato', true); return; }
        if (modo === 'firma' && firma.vuota()) { avviso('Manca la firma: il cliente firma nel riquadro', true); return; }
        if (modo === 'documento' && !documento && !S.esempio) { avviso('Scegli il file del preventivo firmato', true); return; }
        const corpo = { id: p.id, modo, nome: nome.value.trim(), scelte };
        const idFile = 'pc' + Date.now().toString(36);
        if (modo === 'firma') corpo.firma = { mime: 'image/png', base64: firma.base64(), nome: 'firma ' + p.numero + '.png', idFile };
        if (modo === 'documento' && documento) corpo.firma = { mime: documento.mime, base64: documento.base64, nome: documento.nome, idFile };
        const ris = await lavora('Segno accettato', () => Rete.post('/server/accettaPreventivo', corpo));
        if (!ris) return;
        chiudi();
        accogli(ris);
        avviso(modo === 'firma' ? 'Firmato: preventivo accettato' : 'Preventivo segnato accettato');
        W.ridisegna();
        W.Visita.azione('segna-accettato');
      };
      chiudi = finestra({
        titolo: 'Come ha accettato?', larghezza: 'media',
        corpo: h('div', { class: 'accetta' },
          h('div', { class: 'col' }, zonaModi, campo('Nome di chi accetta', nome), zonaFirma),
          h('div', { class: 'col' }, scegliere.length ? [h('span', { class: 'etichetta' }, 'Cosa ha scelto'), zonaScelte] : null, zonaTotale)),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', 'data-visita': 'segna-accettato', onclick: vai }, 'Segna accettato')],
        fuoco: false,
      });
    }

    /** Il riquadro per firmare col mouse (o col dito su uno schermo che si tocca): nome + tratto, come il rapportino. */
    function tavolettaFirma() {
      const tela = h('canvas', { class: 'tavoletta', width: 640, height: 200, 'aria-label': 'Riquadro della firma' });
      const ctx = tela.getContext('2d');
      let tratti = 0;
      let giu = false;
      const punto = e => { const r = tela.getBoundingClientRect(); return [(e.clientX - r.left) * tela.width / r.width, (e.clientY - r.top) * tela.height / r.height]; };
      ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1B1B1F';
      tela.addEventListener('pointerdown', e => { giu = true; tela.setPointerCapture(e.pointerId); const [x, y] = punto(e); ctx.beginPath(); ctx.moveTo(x, y); tratti++; });
      tela.addEventListener('pointermove', e => { if (!giu) return; const [x, y] = punto(e); ctx.lineTo(x, y); ctx.stroke(); });
      tela.addEventListener('pointerup', () => { giu = false; });
      const cancella = h('button', { type: 'button', class: 'btn piccolo', onclick: () => { ctx.clearRect(0, 0, tela.width, tela.height); tratti = 0; } }, 'Cancella');
      const el = h('div', { class: 'firma-tavoletta' }, tela, h('div', { class: 'sotto-firma' }, h('span', { class: 'piccolo' }, 'Firmando accetta il preventivo e il totale'), cancella));
      return { el, vuota: () => tratti === 0, base64: () => tela.toDataURL('image/png').split(',')[1] };
    }

    // ----------------------------------------------------------------- crea la commessa

    async function creaCommessa(p) {
      const ant = RP.anteprimaCommessa(p, C.vociDelPreventivo(p));
      const codice = W.prossimoCodiceCommessa();
      let chiudi;
      const vai = async () => {
        const ris = await lavora('Creo la commessa', () => Rete.post('/server/creaCommessaDaPreventivo', { id: p.id }));
        if (!ris) return;
        chiudi();
        accogli(ris);
        await W.ricaricaAnagrafiche().catch(() => null);
        const id = ris.commessa && ris.commessa.id;
        avviso('Commessa ' + id + ' creata con ' + (ris.prestazioni ? ris.prestazioni.length : ant.prestazioni.length) + ' prestazioni');
        if (id) { S.schedaCommessa[id] = 'prestazioni'; W.vai('#commesse/' + encodeURIComponent(id)); }
        W.Visita.azione('crea-commessa');
      };
      chiudi = finestra({
        titolo: 'Crea la commessa',
        corpo: [
          h('div', { class: 'nasce' }, h('span', { class: 'codice grande' }, codice), h('div', null, h('b', null, ant.descrizione), h('div', { class: 'secondario' }, nomeCliente(p.idCliente)))),
          h('div', { class: 'scheda righe' }, ant.prestazioni.map(x => riga({ titolo: x.nome, destra: soldi() ? h('span', { class: 'quanto' }, C.euro(x.valore)) : null }))),
          h('div', { class: 'coppie' },
            soldi() ? h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Importo del contratto'), h('span', { class: 'v' }, C.euro(ant.importoContratto))) : null,
            h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Ore previste'), h('span', { class: 'v' }, ant.budgetOre ? C.ore(ant.budgetOre) : '—')),
            soldi() ? h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Prezzo orario'), h('span', { class: 'v' }, ant.prezzoOrario ? C.numero(ant.prezzoOrario) + ' €/h' : '—')) : null,
            h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Scadenze di pagamento'), h('span', { class: 'v' }, ant.scadenze ? String(ant.scadenze) : 'nessuna')))],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Crea la commessa')],
      });
    }

    // ===================================================================== editor

    /**
     * L'editor a due colonne. A sinistra: per chi, oggetto, complessità, le sezioni
     * (richiudibili, col subtotale) con le voci, poi condizioni e pagamenti. A destra
     * resta in vista il conto che si aggiorna e cosa chiede la legge, con Salva.
     */
    function editor(pagina, esistente) {
      const imp = S.ana.impostazioni;
      const chiave = esistente ? String(esistente.id) : 'nuovo';
      if (M.chiave !== chiave || !M.bozza) {
        M.chiave = chiave;
        M.bozza = esistente ? JSON.parse(JSON.stringify(esistente)) : {
          id: null, idCliente: '', idSede: null, idReferente: null, oggetto: '', introduzione: '', complessita: '', complessitaNota: '', oneriPrevisti: '',
          condizioni: imp.PREVENTIVO_CONDIZIONI || '', data: C.oggiIso(), scadenza: RP.piuGiorni(C.oggiIso(), Number(imp.PREVENTIVO_VALIDITA_GIORNI) || 30),
          scontoPercentuale: 0, scontoEuro: 0, noteInterne: '', eppiPercentuale: C.num(imp.EPPI_INTEGRATIVO), ivaPercentuale: C.num(imp.IVA),
          sezioni: [{ id: RP.idNuovo('n'), titolo: 'Prestazioni', voci: [] }], scadenzePagamento: [],
        };
        if (!M.bozza.sezioni.length) M.bozza.sezioni.push({ id: RP.idNuovo('n'), titolo: 'Prestazioni', voci: [] });
        M.errori = {};
      }
      const b = M.bozza;
      if (!RP.modificabile(b) && esistente) {
        aggiungi(pagina, [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Il preventivo ' + b.numero + ' è già stato inviato: per cambiarlo fai una nuova revisione.'),
          h('button', { type: 'button', class: 'btn', onclick: () => W.vai('#preventivi/' + encodeURIComponent(b.id)) }, 'Torna al preventivo'))]);
        return;
      }
      const zonaConto = h('div', { class: 'sezione' });
      const zonaSezioni = h('div', { class: 'sezione' });
      const ricalcola = () => {
        const voci = C.vociDelPreventivo(b);
        const k = C.contiPreventivo(b, voci);
        aggiungi(svuota(zonaConto), [soldi() ? schedaConto(b, k, true) : null, schedaLegge(b, voci)]);
        zonaSezioni.querySelectorAll('[data-sub]').forEach(el => { el.textContent = soldi() ? C.euro(k.perSezione[el.dataset.sub] || 0) : ''; });
        zonaSezioni.querySelectorAll('[data-importo]').forEach(el => {
          const v = voci.find(x => String(x.id) === el.dataset.importo);
          if (v) { el.textContent = C.euro(C.importoVoce(v)); el.classList.toggle('non-conta', !C.contaVoce(v, voci)); }
        });
      };
      const ridisegnaSezioni = () => { disegnaSezioni(zonaSezioni, b, ricalcola, ridisegnaSezioni); ricalcola(); };

      const esci = () => { M.bozza = null; M.chiave = ''; W.vai(esistente ? '#preventivi/' + encodeURIComponent(esistente.id) : '#preventivi'); };
      const salva = async () => {
        M.errori = RP.validaPreventivo(b);
        if (Object.keys(M.errori).length) { W.disegnaPagina(); avviso('Mancano dei dati: sono segnati in rosso', true); return; }
        const ris = await lavora('Salvo il preventivo', () => Rete.post('/server/salvaPreventivo', { preventivo: RP.perSalvare(b) }));
        if (!ris) return;
        accogli(ris);
        M.bozza = null; M.chiave = '';
        avviso((esistente ? 'Salvato ' : 'Creato ') + (ris.preventivo.numero || 'il modello'));
        W.vai('#preventivi/' + encodeURIComponent(ris.preventivo.id));
      };

      aggiungi(pagina, [
        h('div', { class: 'indietro-riga' }, tondo('indietro', 'Esci senza salvare', esci), h('span', { class: 'dove' }, 'Preventivi')),
        h('div', { class: 'testata' }, h('div', { class: 'titoli' },
          h('h1', null, esistente ? (b.modello ? 'Modello' : 'Modifica ' + RP.numeroConRevisione(b)) : 'Nuovo preventivo'))),
        h('div', { class: 'griglia-editor' },
          h('div', { class: 'colonna-prev' },
            testataEditor(b, ricalcola),
            zonaSezioni,
            scrive() ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => { b.sezioni.push({ id: RP.idNuovo('n'), titolo: '', voci: [] }); ridisegnaSezioni(); setTimeout(() => { const t = zonaSezioni.querySelectorAll('.titolo-sez'); if (t.length) t[t.length - 1].focus(); }, 30); } },
              icona('piu', 18, 2.6), 'Aggiungi una sezione')) : null,
            condizioniEditor(b, ricalcola)),
          h('div', { class: 'colonna-prev destra-ferma' }, zonaConto,
            h('div', { class: 'bottoni-editor' }, h('button', { type: 'button', class: 'btn testo grande', onclick: esci }, 'Annulla'),
              h('button', { type: 'button', class: 'btn giallo grande', 'data-visita': 'salva-preventivo', onclick: salva }, 'Salva'))))]);
      ridisegnaSezioni();
    }

    /** Per chi, oggetto, introduzione, complessità. */
    function testataEditor(b, ricalcola) {
      const e = M.errori || {};
      const clienti = W.clientiAttivi().slice().sort((x, y) => x.nome.localeCompare(y.nome, 'it'));
      const v = {
        cliente: h('select', null, [h('option', { value: '' }, 'Scegli il cliente')].concat(clienti.map(c => h('option', { value: c.id, selected: c.id === b.idCliente }, c.nome)))),
        sede: h('select'), referente: h('select'),
        oggetto: h('input', { type: 'text', value: b.oggetto || '' }),
        introduzione: h('textarea', { rows: 3 }),
        nota: h('input', { type: 'text', value: b.complessitaNota || '', placeholder: 'Perché' }),
      };
      v.introduzione.value = b.introduzione || '';
      const disegnaSedi = () => {
        const sedi = S.ana.sedi.filter(s => s.idSoggetto === b.idCliente && !s.archiviata);
        const senza = !b.idCliente;
        aggiungi(svuota(v.sede), [h('option', { value: '' }, senza ? '—' : sedi.length ? 'Nessuna' : 'Nessuna sede')].concat(sedi.map(s => h('option', { value: s.id, selected: String(s.id) === String(b.idSede) }, s.nome))));
        const refs = S.ana.referenti.filter(r => r.idSoggetto === b.idCliente);
        aggiungi(svuota(v.referente), [h('option', { value: '' }, senza ? '—' : refs.length ? 'Nessuno' : 'Nessun referente')].concat(refs.map(r => h('option', { value: r.id, selected: String(r.id) === String(b.idReferente) }, r.nome))));
        v.sede.disabled = senza || !sedi.length;
        v.referente.disabled = senza || !refs.length;
      };
      disegnaSedi();
      v.cliente.addEventListener('change', () => { b.idCliente = v.cliente.value; b.idSede = null; b.idReferente = null; disegnaSedi(); });
      v.sede.addEventListener('change', () => { b.idSede = v.sede.value ? Number(v.sede.value) || v.sede.value : null; });
      v.referente.addEventListener('change', () => { b.idReferente = v.referente.value ? Number(v.referente.value) || v.referente.value : null; });
      v.oggetto.addEventListener('input', () => { b.oggetto = v.oggetto.value; });
      v.introduzione.addEventListener('input', () => { b.introduzione = v.introduzione.value; });
      v.nota.addEventListener('input', () => { b.complessitaNota = v.nota.value; });
      const zonaComplessita = h('div');
      const disegnaComplessita = () => aggiungi(svuota(zonaComplessita), [h('div', { class: 'campo' }, h('label', null, 'Grado di complessità'),
        h('div', { class: 'riga-complessita' }, segmenti(RP.COMPLESSITA, b.complessita || '', x => { b.complessita = x; disegnaComplessita(); ricalcola(); }), v.nota))]);
      disegnaComplessita();
      return h('div', { class: 'scheda fila' },
        h('div', { class: 'riga-campi' }, campo('Cliente', v.cliente, e.cliente), campo('Sede o impianto', v.sede), campo('Alla cortese attenzione di', v.referente)),
        campo('Oggetto', v.oggetto, e.oggetto),
        campo('Introduzione', v.introduzione),
        zonaComplessita);
    }

    /** Le sezioni con le voci: richiudibili, col subtotale; le voci si trascinano anche da una sezione all'altra. */
    function disegnaSezioni(zona, b, ricalcola, ridisegna) {
      svuota(zona);
      if ((M.errori || {}).voci) aggiungi(zona, [h('div', { class: 'banda' }, icona('avviso', 20), M.errori.voci)]);
      b.sezioni.forEach((s, si) => {
        const chiusa = !!M.chiusa[s.id];
        const titolo = h('input', { type: 'text', class: 'titolo-sez', value: s.titolo || '', placeholder: 'Titolo della sezione', 'aria-label': 'Titolo della sezione' });
        titolo.addEventListener('input', () => { s.titolo = titolo.value; });
        const altro = h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni sulla sezione', title: 'Altre azioni' }, icona('altro', 18));
        altro.addEventListener('click', () => apriMenu(altro, [
          si > 0 ? { testo: 'Sposta su', fn: () => { b.sezioni.splice(si - 1, 0, b.sezioni.splice(si, 1)[0]); ridisegna(); } } : null,
          si < b.sezioni.length - 1 ? { testo: 'Sposta giù', fn: () => { b.sezioni.splice(si + 1, 0, b.sezioni.splice(si, 1)[0]); ridisegna(); } } : null,
          { testo: 'Togli la sezione', pericolo: true, fn: async () => {
            if (s.voci.length && !(await conferma('Togliere la sezione?', (s.titolo || 'La sezione') + ' e le sue ' + s.voci.length + ' voci spariscono dal preventivo.', 'Togli', true))) return;
            b.sezioni.splice(si, 1);
            if (!b.sezioni.length) b.sezioni.push({ id: RP.idNuovo('n'), titolo: 'Prestazioni', voci: [] });
            ridisegna();
          } },
        ]));
        const corpo = h('div', { class: 'voci-sez', 'data-sezione': s.id });
        s.voci.forEach((v, vi) => aggiungi(corpo, [rigaVoce(b, s, v, vi, ricalcola, ridisegna)]));
        if (!s.voci.length) aggiungi(corpo, [h('div', { class: 'vuoto-sez' }, 'Prendi una voce dal listino o scrivine una.')]);
        destinazioneVoci(corpo, b, s, ridisegna);
        const dalListino = h('button', { type: 'button', class: 'btn piccolo', 'data-visita': si === 0 ? 'dal-listino' : null }, icona('libro', 16, 2.2), 'Dal listino');
        dalListino.addEventListener('click', () => sceltaListino(dalListino, v => { s.voci.push(v); ridisegna(); W.Visita.azione('dal-listino'); }));
        aggiungi(zona, [h('div', { class: 'scheda sez-editor' + (chiusa ? ' chiusa' : '') },
          h('div', { class: 'testa-sez-editor' },
            h('button', { type: 'button', class: 'tondo piccolo apri-sez', 'aria-expanded': chiusa ? 'false' : 'true', 'aria-label': chiusa ? 'Apri la sezione' : 'Richiudi la sezione',
              onclick: () => { M.chiusa[s.id] = !chiusa; ridisegna(); } }, icona(chiusa ? 'avanti' : 'giu', 18, 2.6)),
            titolo,
            h('span', { class: 'conta-sez piccolo' }, s.voci.length === 1 ? '1 voce' : s.voci.length + ' voci'),
            h('b', { class: 'sub-sez', 'data-sub': String(s.id) }),
            altro),
          chiusa ? null : corpo,
          chiusa ? null : h('div', { class: 'piede-sez' }, dalListino,
            h('button', { type: 'button', class: 'btn piccolo', onclick: () => { s.voci.push(RP.voceLibera('')); ridisegna(); setTimeout(() => { const t = corpo.parentNode.querySelectorAll('.desc-voce'); if (t.length) t[t.length - 1].focus(); }, 30); } },
              icona('piu', 16, 2.6), 'Voce libera')))]);
      });
    }

    let trascinata = null;

    /** Una voce: maniglia, descrizione, modo, quantità, prezzo, sconto, importo; facoltativa e "una di queste con…". */
    function rigaVoce(b, s, v, vi, ricalcola, ridisegna) {
      const desc = h('input', { type: 'text', class: 'desc-voce', value: v.descrizione || '', placeholder: 'Descrizione', 'aria-label': 'Descrizione della voce' });
      desc.addEventListener('input', () => { v.descrizione = desc.value; });
      const numCampo = (k, etichetta, suffisso) => {
        const i = h('input', { type: 'text', inputmode: 'decimal', value: v[k] === null || v[k] === undefined || v[k] === '' ? '' : R.numeroCampo(v[k]), 'aria-label': etichetta });
        i.addEventListener('input', () => { v[k] = i.value.trim() === '' ? (k === 'prezzo' ? null : 0) : C.num(i.value); ricalcola(); });
        return campo(etichetta, suffisso ? conSuffisso(i, suffisso) : i);
      };
      const modo = selezione(RP.MODI, v.modo || 'corpo', x => { v.modo = x; if (x === 'ore' && !v.unita) v.unita = 'h'; ricalcola(); ridisegna(); }, { 'aria-label': 'Come si conta' });
      const unita = h('input', { type: 'text', value: v.unita || '', placeholder: 'pz', 'aria-label': 'Unità' });
      unita.addEventListener('input', () => { v.unita = unita.value; });
      const facoltativa = h('input', { type: 'checkbox', checked: !!v.facoltativa });
      facoltativa.addEventListener('change', () => { v.facoltativa = facoltativa.checked; if (facoltativa.checked) { v.alternativa = ''; } ricalcola(); ridisegna(); });
      const compresa = h('input', { type: 'checkbox', checked: !!v.scelta });
      compresa.addEventListener('change', () => { v.scelta = compresa.checked; ricalcola(); });
      // "Una di queste con…": le altre voci del preventivo. Lo stesso testo lega il gruppo.
      const altre = C.vociDelPreventivo(b).filter(x => x.id !== v.id);
      const gruppo = C.gruppoAlternativa(v);
      const conChi = gruppo ? (altre.find(x => C.gruppoAlternativa(x) === gruppo) || {}).id : '';
      const alternativa = selezione([['', 'Nessuna']].concat(altre.map(x => [x.id, x.descrizione || 'Voce senza nome'])), conChi || '', x => {
        const tutte = b.sezioni.reduce((a, z) => a.concat(z.voci), []);
        const vecchio = C.gruppoAlternativa(v);
        if (!x) {
          v.alternativa = '';
          const resto = tutte.filter(y => C.gruppoAlternativa(y) === vecchio);
          if (resto.length === 1) resto[0].alternativa = '';
        } else {
          const altra = tutte.find(y => String(y.id) === String(x));
          const nome = String((altra && altra.alternativa) || (altra && altra.descrizione) || v.descrizione || 'gruppo').trim();
          if (altra && !altra.alternativa) { altra.alternativa = nome; altra.facoltativa = false; }
          v.alternativa = nome;
          v.facoltativa = false;
          const membri = tutte.filter(y => C.gruppoAlternativa(y) === nome.toLowerCase());
          if (!membri.some(y => y.scelta)) membri[0].scelta = true;
        }
        ricalcola(); ridisegna();
      }, { 'aria-label': 'Una di queste con' });
      const nelTotale = h('input', { type: 'radio', name: 'alt-' + gruppo.replace(/\W+/g, '-'), checked: !!v.scelta });
      nelTotale.addEventListener('change', () => {
        b.sezioni.forEach(z => z.voci.forEach(y => { if (C.gruppoAlternativa(y) === gruppo) y.scelta = y === v; }));
        ricalcola();
      });
      const togli = tondo('chiudi', 'Togli la voce', () => { s.voci.splice(vi, 1); ridisegna(); }, 'piccolo');
      const maniglia = h('span', { class: 'maniglia', title: 'Trascina per spostare', 'aria-hidden': 'true' }, icona('trascina', 18));
      const el = h('div', { class: 'voce-editor', draggable: 'true', 'data-voce': v.id },
        maniglia,
        h('div', { class: 'corpo-voce' },
          h('div', { class: 'alto-voce' }, desc, soldi() ? h('b', { class: 'importo-voce', 'data-importo': String(v.id) }) : null, togli),
          h('div', { class: 'numeri-voce' }, campo('Modo', modo),
            v.modo === 'corpo' ? null : numCampo('quantita', 'Quantità', v.modo === 'ore' ? 'h' : null),
            v.modo === 'quantita' ? campo('Unità', unita) : null,
            soldi() ? numCampo('prezzo', v.modo === 'ore' ? 'Prezzo all\'ora' : 'Prezzo', '€') : null,
            soldi() ? numCampo('scontoPercentuale', 'Sconto', '%') : null),
          h('div', { class: 'opzioni-voce' },
            gruppo ? null : h('label', { class: 'spunta-campo piccola' }, facoltativa, 'Facoltativa'),
            v.facoltativa ? h('label', { class: 'spunta-campo piccola' }, compresa, 'Compresa nel totale') : null,
            v.facoltativa ? null : h('label', { class: 'campo-in-riga' }, h('span', null, 'Una di queste con'), alternativa),
            gruppo ? h('label', { class: 'spunta-campo piccola' }, nelTotale, 'Questa nel totale') : null)));
      el.addEventListener('dragstart', e => {
        if (!e.target.closest('.maniglia') && document.activeElement && document.activeElement.closest && document.activeElement.closest('.voce-editor') === el && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); return; }
        trascinata = { sezione: s.id, indice: vi };
        el.classList.add('trascinata');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(v.id)); } catch (x) { /* qualche motore non vuole */ }
      });
      el.addEventListener('dragend', () => { el.classList.remove('trascinata'); trascinata = null; document.querySelectorAll('.voce-editor.sopra, .voce-editor.sotto').forEach(x => x.classList.remove('sopra', 'sotto')); });
      el.addEventListener('dragover', e => {
        if (!trascinata) return;
        e.preventDefault();
        e.stopPropagation();
        const r = el.getBoundingClientRect();
        const sopra = e.clientY < r.top + r.height / 2;
        el.classList.toggle('sopra', sopra);
        el.classList.toggle('sotto', !sopra);
      });
      el.addEventListener('dragleave', () => el.classList.remove('sopra', 'sotto'));
      el.addEventListener('drop', e => {
        if (!trascinata) return;
        e.preventDefault();
        e.stopPropagation();
        const r = el.getBoundingClientRect();
        const a = e.clientY < r.top + r.height / 2 ? vi : vi + 1;
        b.sezioni = RP.spostaVoce(b.sezioni, trascinata.sezione, trascinata.indice, s.id, a);
        trascinata = null;
        ridisegna();
      });
      return el;
    }

    /** Il fondo di una sezione accoglie le voci trascinate (anche in una sezione vuota). */
    function destinazioneVoci(corpo, b, s, ridisegna) {
      corpo.addEventListener('dragover', e => { if (trascinata) { e.preventDefault(); corpo.classList.add('accoglie'); } });
      corpo.addEventListener('dragleave', e => { if (!corpo.contains(e.relatedTarget)) corpo.classList.remove('accoglie'); });
      corpo.addEventListener('drop', e => {
        corpo.classList.remove('accoglie');
        if (!trascinata) return;
        e.preventDefault();
        b.sezioni = RP.spostaVoce(b.sezioni, trascinata.sezione, trascinata.indice, s.id, s.voci.length);
        trascinata = null;
        ridisegna();
      });
    }

    /** Il listino con la ricerca, sotto il pulsante: un clic aggiunge la voce alla sezione. */
    function sceltaListino(ancora, aggiungiVoce) {
      B.chiudiMenu();
      const lista = h('div', { class: 'lista-listino' });
      const input = h('input', { type: 'search', placeholder: 'Cerca nel listino', 'aria-label': 'Cerca nel listino' });
      const m = h('div', { class: 'menu listino-menu', role: 'dialog', 'aria-label': 'Listino' }, h('label', { class: 'cerca piccola' }, icona('cerca', 16), input), lista);
      const chiudi = () => { m.remove(); document.removeEventListener('mousedown', fuori, true); document.removeEventListener('keydown', esc, true); };
      const fuori = e => { if (!m.contains(e.target) && e.target !== ancora) chiudi(); };
      const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); chiudi(); } };
      const disegna = () => {
        const t = R.norm(input.value);
        const voci = (M.listino || []).filter(l => l.attivo !== false && (!t || R.norm(l.nome + ' ' + (l.codice || '')).indexOf(t) >= 0));
        aggiungi(svuota(lista), voci.length ? voci.map(l => h('button', { type: 'button', role: 'menuitem', onclick: () => { chiudi(); aggiungiVoce(RP.voceDaListino(l)); } },
          h('span', { class: 'nome-listino' }, l.nome), h('span', { class: 'piccolo' }, (l.modo === 'ore' ? 'a ore' : l.modo === 'quantita' ? 'a quantità' : 'a corpo') +
            (soldi() ? ' · ' + (C.num(l.prezzo) > 0 ? C.euro(l.prezzo) + (l.modo === 'ore' ? '/h' : '') : 'senza prezzo') : '')))) : [h('div', { class: 'vuoto piccolo' }, 'Niente nel listino con questo nome')]);
      };
      input.addEventListener('input', disegna);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { const p = lista.querySelector('button'); if (p) p.click(); } });
      disegna();
      document.body.append(m);
      const r = ancora.getBoundingClientRect();
      m.style.left = Math.max(12, Math.min(r.left, window.innerWidth - m.offsetWidth - 12)) + 'px';
      m.style.top = (r.bottom + 6 + m.offsetHeight < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - m.offsetHeight - 6)) + 'px';
      setTimeout(() => { document.addEventListener('mousedown', fuori, true); document.addEventListener('keydown', esc, true); input.focus(); }, 0);
    }

    /** Date, sconti, pagamenti, oneri, condizioni, note per te. */
    function condizioniEditor(b, ricalcola) {
      const e = M.errori || {};
      const inp = (k, tipo) => { const i = h('input', { type: tipo || 'text', value: b[k] || '' }); i.addEventListener('input', () => { b[k] = i.value; ricalcola(); }); return i; };
      const area = k => { const t = h('textarea', { rows: 3 }); t.value = b[k] || ''; t.addEventListener('input', () => { b[k] = t.value; ricalcola(); }); return t; };
      const numero = (k, suffisso) => { const i = h('input', { type: 'text', inputmode: 'decimal', value: C.num(b[k]) ? R.numeroCampo(b[k]) : '' }); i.addEventListener('input', () => { b[k] = C.num(i.value); ricalcola(); }); return conSuffisso(i, suffisso); };
      const zonaScadenze = h('div', { class: 'fila' });
      const disegnaScadenze = () => {
        const k = C.contiPreventivo(b, C.vociDelPreventivo(b));
        aggiungi(svuota(zonaScadenze), [
          b.scadenzePagamento.map((s, i) => {
            const desc = h('input', { type: 'text', value: s.descrizione || '', placeholder: 'Acconto, saldo…', 'aria-label': 'Descrizione del pagamento' });
            desc.addEventListener('input', () => { s.descrizione = desc.value; });
            const val = h('input', { type: 'text', inputmode: 'decimal', value: s.valore ? R.numeroCampo(s.valore) : '', 'aria-label': 'Quota' });
            val.addEventListener('input', () => { s.valore = C.num(val.value); disegnaImporto(); avvisoQuote(); });
            const importo = h('span', { class: 'importo-scad' });
            const disegnaImporto = () => { importo.textContent = soldi() ? C.euro(C.importoScadenza(s, C.contiPreventivo(b, C.vociDelPreventivo(b)).imponibile)) : ''; };
            disegnaImporto();
            const data = h('input', { type: 'date', value: s.data || '', 'aria-label': 'Data del pagamento' });
            data.addEventListener('input', () => { s.data = data.value; });
            return h('div', { class: 'riga-scadenza' }, desc,
              selezione([['percentuale', '%'], ['importo', '€']], s.tipo || 'percentuale', x => { s.tipo = x; disegnaScadenze(); }, { 'aria-label': 'Percentuale o importo' }),
              val,
              selezione(RP.QUANDO, s.quando || 'firma', x => { s.quando = x; disegnaScadenze(); }, { 'aria-label': 'Quando' }),
              s.quando === 'data' ? data : h('span'),
              importo,
              tondo('chiudi', 'Togli il pagamento', () => { b.scadenzePagamento.splice(i, 1); disegnaScadenze(); }, 'piccolo'));
          }),
          h('div', { class: 'secondario errore avviso-quote' }),
          h('div', null, h('button', { type: 'button', class: 'btn piccolo', onclick: () => {
            const resto = Math.max(0, 100 - b.scadenzePagamento.filter(x => x.tipo !== 'importo').reduce((a, x) => a + C.num(x.valore), 0));
            b.scadenzePagamento.push({ id: RP.idNuovo('s'), descrizione: b.scadenzePagamento.length ? 'Saldo' : 'Acconto', tipo: 'percentuale', valore: b.scadenzePagamento.length ? resto : 30, quando: b.scadenzePagamento.length ? 'fine' : 'firma', data: '' });
            disegnaScadenze();
          } }, icona('piu', 16, 2.6), 'Aggiungi un pagamento'))]);
        avvisoQuote();
        return k;
      };
      const avvisoQuote = () => { const x = zonaScadenze.querySelector('.avviso-quote'); if (x) x.textContent = RP.controllaScadenze(b.scadenzePagamento); };
      disegnaScadenze();
      return h('div', { class: 'scheda fila' },
        h('h3', null, 'Condizioni'),
        h('div', { class: 'riga-campi' }, campo('Data', inp('data', 'date')), campo('Valido fino al', inp('scadenza', 'date')),
          soldi() ? campo('Sconto sul totale', numero('scontoPercentuale', '%'), e.scontoPercentuale) : null, soldi() ? campo('Sconto in euro', numero('scontoEuro', '€'), e.scontoEuro) : null),
        h('div', { class: 'campo' }, h('label', null, 'Pagamenti'), zonaScadenze),
        campo('Oneri ipotizzabili dal conferimento alla conclusione', area('oneriPrevisti')),
        campo('Condizioni', area('condizioni')),
        campo('Note per te, non vanno al cliente', area('noteInterne')));
    }

    // ===================================================================== listino

    function listino(pagina) {
      const lista = (M.listino || []).slice().sort((a, b) => (Number(a.ordine) || 0) - (Number(b.ordine) || 0));
      const attive = lista.filter(l => l.attivo !== false);
      const archiviate = lista.filter(l => l.attivo === false);
      const rigaListino = l => riga({
        titolo: l.nome + (l.codice ? '' : ''), sotto: [l.codice, l.modo === 'ore' ? 'a ore' : l.modo === 'quantita' ? 'a quantità' + (l.unita ? ' (' + l.unita + ')' : '') : 'a corpo', l.descrizione].filter(Boolean).join(' · '),
        destra: soldi() ? h('span', { class: 'quanto' }, C.num(l.prezzo) > 0 ? C.euro(l.prezzo) + (l.modo === 'ore' ? '/h' : '') : h('span', { class: 'da-scegliere' }, 'senza prezzo')) : null,
        onclick: scrive() ? () => moduloListino(l) : null, freccia: scrive(),
      });
      aggiungi(pagina, [
        h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna ai preventivi', () => W.vai('#preventivi')), h('span', { class: 'dove' }, 'Preventivi')),
        h('div', { class: 'testata' }, h('div', { class: 'titoli' }, h('h1', null, 'Listino delle prestazioni')),
          scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloListino(null) }, icona('piu', 18, 2.6), 'Nuova prestazione') : null),
        h('div', { class: 'stretta-820 sezione' },
          attive.length ? h('div', { class: 'scheda righe' }, attive.map(rigaListino)) : h('div', { class: 'calmo' }, 'Il listino è vuoto.'),
          M.archiviateListino && archiviate.length ? [h('span', { class: 'etichetta' }, 'Archiviate'), h('div', { class: 'scheda righe' }, archiviate.map(rigaListino))] : null,
          h('div', null, h('button', { type: 'button', class: 'btn collegamento', onclick: async () => { M.archiviateListino = !M.archiviateListino; await leggiListino(M.archiviateListino).catch(() => null); W.ridisegna(); } },
            M.archiviateListino ? 'Nascondi le archiviate' : 'Mostra le archiviate')))]);
    }

    function moduloListino(l) {
      const x = l ? Object.assign({}, l) : { nome: '', codice: '', descrizione: '', modo: 'corpo', unita: '', prezzo: null };
      const v = {
        nome: h('input', { type: 'text', value: x.nome || '' }),
        codice: h('input', { type: 'text', value: x.codice || '' }),
        descrizione: h('textarea', { rows: 2 }),
        unita: h('input', { type: 'text', value: x.unita || '' }),
        prezzo: h('input', { type: 'text', inputmode: 'decimal', value: x.prezzo === null || x.prezzo === undefined ? '' : R.numeroCampo(x.prezzo) }),
      };
      v.descrizione.value = x.descrizione || '';
      let modo = x.modo || 'corpo';
      let errori = {};
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [
        h('div', { class: 'riga-campi' }, campo('Nome', v.nome, errori.nome), campo('Codice', v.codice)),
        campo('Descrizione', v.descrizione),
        h('div', { class: 'campo' }, h('label', null, 'Come si conta'), segmenti(RP.MODI, modo, m => { modo = m; disegna(); })),
        h('div', { class: 'riga-campi' }, modo === 'quantita' ? campo('Unità', v.unita) : null,
          soldi() ? campo(modo === 'ore' ? 'Prezzo all\'ora' : 'Prezzo', conSuffisso(v.prezzo, '€'), errori.prezzo) : null)]);
      disegna();
      let chiudi;
      const salva = async () => {
        errori = {};
        if (!v.nome.value.trim()) errori.nome = 'Scrivi come si chiama la prestazione';
        if (v.prezzo.value.trim() && C.numONull(v.prezzo.value) === null) errori.prezzo = 'Non è un numero';
        if (Object.keys(errori).length) { disegna(); return; }
        const voce = { nome: v.nome.value.trim(), codice: v.codice.value.trim(), descrizione: v.descrizione.value.trim(), modo, unita: modo === 'ore' ? 'h' : v.unita.value.trim() };
        if (l) voce.id = l.id;
        if (soldi()) voce.prezzo = C.numONull(v.prezzo.value);
        const ris = await lavora('Salvo la prestazione', () => Rete.post('/server/salvaVoceListino', { voce }));
        if (!ris) return;
        chiudi();
        await leggiListino(M.archiviateListino).catch(() => null);
        avviso(l ? 'Prestazione salvata' : 'Prestazione aggiunta al listino');
        W.ridisegna();
      };
      const archivia = async si => {
        const ris = await lavora(si ? 'Archivio' : 'Ripristino', () => Rete.post('/server/archiviaVoceListino', { id: l.id, archiviata: si }));
        if (!ris) return;
        chiudi();
        await leggiListino(M.archiviateListino).catch(() => null);
        avviso(si ? 'Prestazione archiviata: non si propone più nei preventivi nuovi' : 'Prestazione ripristinata', false, null, si ? { testo: 'Annulla', fn: () => archivia(false) } : null);
        W.ridisegna();
      };
      chiudi = finestra({
        titolo: l ? l.nome : 'Nuova prestazione', corpo: zona,
        pulsanti: [l ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: () => archivia(l.attivo !== false) }, l.attivo !== false ? 'Archivia' : 'Ripristina') : null,
          'spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')].filter(Boolean),
      });
    }

    // ===================================================================== contratti

    /** I preventivi accettati col loro incarico professionale (PDF generato dal preventivo, con le condizioni e la firma). */
    function contratti(pagina) {
      const lista = M.lista.filter(p => !p.modello && RP.statoVisto(p) === 'ACCETTATO').sort((a, b) => String(b.accettatoIl || b.data).localeCompare(String(a.accettatoIl || a.data)));
      const col = '170px minmax(0, 2fr) minmax(0, 1.3fr) 120px 110px ' + (soldi() ? '120px ' : '') + '170px';
      aggiungi(pagina, [
        h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna ai preventivi', () => W.vai('#preventivi')), h('span', { class: 'dove' }, 'Preventivi')),
        h('div', { class: 'testata' }, h('div', { class: 'titoli' }, h('h1', null, 'Contratti'))),
        !lista.length ? h('div', { class: 'calmo' }, 'Ancora nessun preventivo accettato.') : h('div', { class: 'tab' },
          h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Numero'), h('span', null, 'Oggetto'), h('span', null, 'Cliente'), h('span', null, 'Accettato'),
            h('span', null, 'Commessa'), soldi() ? h('span', { class: 'n' }, 'Imponibile') : null, h('span')),
          lista.map(p => h('div', { class: 'r cliccabile alta', style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', onclick: e => { if (!e.target.closest('button')) W.vai('#preventivi/' + encodeURIComponent(p.id)); } },
            h('span', null, pillNumero(p)), h('span', { class: 'forte taglia' }, p.oggetto), h('span', { class: 'taglia t2' }, p.cliente || nomeCliente(p.idCliente)),
            h('span', { class: 't2' }, p.accettatoIl ? C.data(p.accettatoIl) : '—'),
            h('span', null, p.idCommessa ? h('span', { class: 'codice' }, p.idCommessa) : h('span', { class: 'da-scegliere' }, 'da creare')),
            soldi() ? h('span', { class: 'n forte' }, p.imponibile !== undefined ? C.euro(p.imponibile) : '') : null,
            h('span', { class: 'n' }, h('button', { type: 'button', class: 'btn piccolo', onclick: async () => { const x = await leggiPreventivo(p.id).catch(e => { avviso(e.message, true); return null; }); if (x) pdf(x, true); } }, 'PDF dell\'incarico')))))]);
    }

    return { vista, M };
  };
})(window);
