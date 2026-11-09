/*
 * Wisper Ufficio: WhatsApp e comunicazioni (fase 7, docs/gestionale/fase7.md §3.13-3.16, §9, §10.2-10.3, §12.2).
 *
 * Da mandare · Storico · Modelli · Notifiche. Wisper prepara il testo dal modello e apre WhatsApp col messaggio già
 * scritto nel browser del sistema (mai dentro la finestra): lo manda Manuel. Quando la finestra torna in primo piano
 * chiede "L'hai mandato?", perché Wisper non può saperlo. Si scrive su WhatsApp solo a chi ha detto di sì.
 * Il Messaggio (A, canale, modello, testo) è lo stesso ovunque: nella colonna di destra di Da mandare e in una
 * finestra dalle altre pagine (referenti, preventivo, attività, fattura, ticket).
 * Qui ci sono anche la campanella e le notifiche, che sono di tutti (ognuno le sue).
 */
(function (radice) {
  'use strict';

  radice.WisperComunicazioni = function (W) {
    const { S, C, R, B, Rete, Api } = W;
    const K = radice.WisperRegoleComunicazioni;
    const { h, aggiungi, svuota, icona, tondo, iniziali, avviso, lavora, finestra, conferma, apriMenu, campo, segmenti, cerca, riga, quadrato, segnaposto, copiaTesto } = B;
    const P = () => W.perm();
    const vede = () => K.Permessi.vedeComunicazioni(P());
    const scrive = () => K.Permessi.scriveComunicazioni(P());
    const interfaccia = () => (S.io && S.io.interfaccia) || {};
    const testoMax = () => Number(interfaccia().whatsappTestoMax) || K.TESTO_MAX;
    const pill = (testo, colore, extra) => h('span', Object.assign({ class: 'pill p-' + (colore || 'grigio') }, extra || {}), testo);
    const pillStato = c => { const s = K.statoComunicazione(c); return pill(s.parola, s.colore); };
    const quando = iso => K.quando(iso, new Date());
    const qs = o => Object.keys(o).filter(k => o[k] !== '' && o[k] !== null && o[k] !== undefined && o[k] !== false)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k] === true ? '1' : o[k])).join('&');

    const M = {
      dm: null, scelto: null, msg: null, storico: null, chiaveStorico: '', filtro: 'tutti', testo: '', idCliente: '', idCommessa: '', aperta: null,
      modelli: null, segnaposti: null, notifiche: null, nuove: null, attesaWa: null, pagina: 1,
    };
    function daRileggere() { M.dm = null; M.storico = null; M.notifiche = null; }

    function conDati(contenitore, prepara, disegna) {
      const zona = h('div', { class: 'sezione' }, segnaposto(3, 70));
      aggiungi(contenitore, [zona]);
      prepara().then(() => { zona.remove(); disegna(); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.disegnaPagina() }, 'Riprova'))]);
      });
    }

    async function leggiModelli() {
      if (M.modelli) return;
      const r = await Rete.get('/server/modelliMessaggi');
      // I modelli dei pagamenti solo a chi vede i pagamenti (§11.2): il server li toglie già, qui per sicurezza.
      M.modelli = (r.modelli || []).filter(m => m.uso !== 'pagamento' || K.Permessi.pagamenti(P()));
      M.segnaposti = r.segnaposti || null;
    }

    // ===================================================================== la pagina

    function vista(pagina, a1, a2, filtro) {
      const f = filtro || {};
      if (f.idCliente !== undefined || f.idCommessa !== undefined) { M.idCliente = f.idCliente || ''; M.idCommessa = f.idCommessa || ''; M.storico = null; }
      const seg = !vede() ? 'notifiche' : a1 === 'storico' || a1 === 'modelli' || a1 === 'notifiche' ? a1 : 'damandare';
      const giallo = seg === 'notifiche' || !scrive() ? null
        : seg === 'modelli' ? h('button', { type: 'button', class: 'btn giallo', 'data-giallo-pagina': '1', onclick: () => finestraModello(null) }, icona('piu', 18, 2.6), 'Nuovo modello')
          : h('button', { type: 'button', class: 'btn giallo', 'data-giallo-pagina': '1', onclick: () => nuovoMessaggio() }, icona('piu', 18, 2.6), 'Nuovo messaggio');
      const altro = seg === 'storico' && scrive() ? h('button', { type: 'button', class: 'tondo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 20)) : null;
      if (altro) altro.addEventListener('click', () => apriMenu(altro, [{ testo: 'Annota una telefonata', fn: () => annotaTelefonata({ idCliente: M.idCliente }) }]));
      aggiungi(pagina, [h('div', { class: 'testata alta' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'WhatsApp e comunicazioni'), h('h1', null, seg === 'notifiche' && !vede() ? 'Notifiche' : 'Comunicazioni')), altro, giallo),
        vede() ? segmenti([['damandare', 'Da mandare'], ['storico', 'Storico'], ['modelli', 'Modelli'], ['notifiche', 'Notifiche']], seg, x => W.vai(x === 'damandare' ? '#comunicazioni' : '#comunicazioni/' + x)) : null]);
      if (seg === 'storico') paginaStorico(pagina);
      else if (seg === 'modelli') paginaModelli(pagina, a2 ? decodeURIComponent(a2) : '');
      else if (seg === 'notifiche') paginaNotifiche(pagina);
      else paginaDaMandare(pagina);
    }

    function gialloPagina(spento) {
      document.querySelectorAll('[data-giallo-pagina]').forEach(b => b.classList.toggle('giallo', !spento));
    }

    // ===================================================================== Da mandare

    async function leggiDaMandare() { M.dm = await Rete.get('/server/daMandare'); }

    const tutteLeProposte = () => (M.dm ? [].concat(M.dm.oggi || [], M.dm.domani || [], M.dm.proposti || []) : []);

    function paginaDaMandare(pagina) {
      conDati(pagina, () => Promise.all([M.dm ? null : leggiDaMandare(), leggiModelli().catch(() => null)]), () => {
        const sinistra = h('div', { class: 'colonna-msg' });
        const destra = h('div', { class: 'colonna-msg destra' });
        aggiungi(pagina, [h('div', { class: 'due-col-msg' }, sinistra, destra)]);
        // A destra il messaggio scelto è già aperto: di base la prima proposta (§12.2).
        if (!M.scelto || !trovaScelta(M.scelto)) { const p = tutteLeProposte()[0]; M.scelto = p ? 'p:' + p.proposta : null; M.msg = null; }
        disegnaElenco(sinistra);
        disegnaColonna(destra);
      });
    }

    function trovaScelta(k) {
      if (!k) return null;
      if (k.indexOf('p:') === 0) return tutteLeProposte().find(p => p.proposta === k.slice(2)) || null;
      if (k.indexOf('c:') === 0) return ((M.dm && M.dm.preparati) || []).find(c => String(c.id) === k.slice(2)) || null;
      if (k === 'nuovo') return M.msg;
      return null;
    }

    function disegnaElenco(zona) {
      svuota(zona);
      K.gruppiDaMandare(M.dm).forEach(g => {
        const voci = g.chiave === 'preparati'
          ? h('div', { class: 'scheda righe' }, g.voci.map(c => riga({ sinistra: quadrato('whatsapp', 'ico-verde'), titolo: K.nomeTipo(c) + ' · ' + (c.referente || c.cliente || ''), sotto: [c.cliente, quando(c.quando)].filter(Boolean).join(' · '),
            destra: pillStato(c), classe: M.scelto === 'c:' + c.id ? 'scelta-riga' : '', onclick: () => scegli('c:' + c.id) })))
          : g.voci.length ? h('div', { class: 'proposte' }, g.voci.map(cartaProposta)) : h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente da mandare oggi');
        aggiungi(zona, [h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, g.nome + (g.voci.length ? ' · ' + g.voci.length : '')), voci)]);
      });
      // In fondo le righe calme di quello che non è collegato (§3.17), col perché al tocco.
      const nc = (titolo, sotto, ico, perche) => riga({ sinistra: quadrato(ico), titolo, sotto, destra: pill('Non collegato'), onclick: () => avviso(perche, false, 7000), freccia: false });
      aggiungi(zona, [h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, 'Non collegati'), h('div', { class: 'scheda righe' },
        nc('WhatsApp Business', 'Messaggi mandati dal server', 'whatsapp', 'Costa a messaggio (circa 0,036 $ un promemoria) e vuole un indirizzo aperto su internet: per ora i messaggi li manda Manuel'),
        nc('Spese via messaggio', 'Lo fa già l\'app, anche senza rete', 'scontrino', 'Con WhatsApp servirebbe l\'API a pagamento; l\'app lo fa già in meno di un minuto, anche senza rete'),
        nc('Assistente operativo', 'Domande sul gestionale', 'fumetto', 'I dati dei clienti andrebbero a un fornitore fuori dall\'Europa; un modello sul NAS è troppo lento: da decidere nella fase 8')))]);
    }

    function cartaProposta(p) {
      const a = p.a || {};
      const ic = K.iconaCanale(p.canale);
      const scelta = M.scelto === 'p:' + p.proposta;
      return h('div', { class: 'carta-msg' + (scelta ? ' scelta' : ''), 'data-proposta': p.proposta },
        h('button', { type: 'button', class: 'testa-proposta', onclick: () => scegli('p:' + p.proposta) },
          quadrato(ic[0], ic[1]), h('span', { class: 'corpo' }, h('span', { class: 't1' }, p.titolo || K.nomeTipo(p)), h('span', { class: 't2' }, [a.nome, a.cliente].filter(Boolean).join(' · '))),
          h('span', { class: 'freccia' }, icona('freccia', 18, 2.2))),
        p.dettaglio ? h('span', { class: 'rif-proposta' }, p.dettaglio) : null,
        h('span', { class: 'testo-proposta' }, p.testo || ''),
        h('span', { class: 'piede-proposta' },
          p.canale === 'whatsapp' && !a.whatsappOk ? pill('WhatsApp non chiesto') : pill(K.nomeCanale(p.canale), p.canale === 'whatsapp' ? 'verde' : 'blu'),
          scrive() ? h('button', { type: 'button', class: 'btn collegamento', onclick: () => nonMandare(p) }, 'Non mandare') : null));
    }

    function scegli(k) {
      M.scelto = k;
      M.msg = null;
      const pag = document.querySelector('.due-col-msg');
      if (!pag) { W.disegnaPagina(); return; }
      disegnaElenco(pag.firstChild);
      disegnaColonna(pag.lastChild);
    }

    async function nonMandare(p) {
      const r = await lavora('Un momento', () => Rete.post('/server/nonMandare', { proposta: p.proposta }));
      if (!r) return;
      if (M.scelto === 'p:' + p.proposta) { M.scelto = null; M.msg = null; }
      await dopoUnInvio();
      avviso('Non mandato', false, null, { testo: 'Annulla', fn: async () => { const x = await lavora('Un momento', () => Rete.post('/server/nonMandare', { proposta: p.proposta, annulla: true })); if (x) dopoUnInvio(); } });
    }

    /** La colonna di destra: il messaggio scelto, già aperto, col giallo Apri WhatsApp (o Manda l'email). */
    function disegnaColonna(zona) {
      svuota(zona);
      const x = trovaScelta(M.scelto);
      if (!x) { gialloPagina(false); aggiungi(zona, [h('div', { class: 'calmo' }, icona('fumetto', 20, 2.2), 'Scegli un messaggio a sinistra')]); return; }
      gialloPagina(true);
      if (M.scelto.indexOf('c:') === 0) { aggiungi(zona, [schedaPreparato(x)]); return; }
      if (!M.msg) M.msg = daProposta(x);
      aggiungi(zona, [h('div', { class: 'scheda scheda-msg' }, h('span', { class: 'etichetta' }, nomeModello(M.msg.modello)), composer(M.msg, {
        pulsanti: () => [h('button', { type: 'button', class: 'btn', onclick: () => { M.scelto = null; M.msg = null; disegnaColonna(zona); disegnaElenco(zona.previousSibling); } }, 'Chiudi'),
          scrive() ? h('button', { type: 'button', class: 'btn giallo', 'data-giallo-msg': '1', onclick: () => manda(M.msg) }, M.msg.canale === 'email' ? 'Manda l\'email' : 'Apri WhatsApp') : null],
        ridisegna: () => disegnaColonna(zona),
      }))]);
    }

    function daProposta(p) {
      const r = p.riferimento || {};
      const rif = {};
      const nome = { attivita: 'idAttivita', ticket: 'idTicket', preventivo: 'idPreventivo', rapportino: 'idRapportino', fattura: 'idFattura', commessa: 'idCommessa' }[r.tipo];
      if (nome) rif[nome] = r.id;
      return { modello: p.modello || p.tipo, canale: p.canale, proposta: p.proposta, a: Object.assign({}, p.a || {}), idCliente: clienteDelReferente((p.a || {}).idReferente), rif,
        testo: p.testo || '', oggetto: p.oggetto || '', mancano: p.mancano || [], riferimento: p.dettaglio || '', ultimoMovimento: p.ultimoMovimento || '', idLocale: K.idLocale('msg') };
    }

    function schedaPreparato(c) {
      return h('div', { class: 'scheda scheda-msg' }, h('span', { class: 'etichetta' }, K.nomeTipo(c)),
        riga({ sinistra: iniziali(c.referente || c.cliente, true), titolo: c.referente || c.cliente, sotto: [c.cliente, c.a].filter(Boolean).join(' · ') }),
        h('div', { class: 'pillole-testa' }, pill('WhatsApp', 'verde'), pillStato(c), h('span', { class: 'sotto-titolo' }, 'preparato ' + quando(c.quando))),
        h('span', { class: 'etichetta' }, 'Testo preparato'), h('div', { class: 'anteprima-msg' }, c.testo || ''),
        scrive() ? h('div', { class: 'bottoni-msg' },
          h('button', { type: 'button', class: 'btn', onclick: () => riapriWhatsapp(c) }, icona('whatsapp', 18, 2.2), 'Apri WhatsApp di nuovo'),
          h('button', { type: 'button', class: 'btn giallo', onclick: () => segnaMandato(c.id, true) }, 'Segna mandato')) : null);
    }

    // ===================================================================== il Messaggio (§12.1-12.2)

    const nomeModello = k => { const m = (M.modelli || []).find(x => x.chiave === k); return (m && m.nome) || K.NOMI_MODELLI[k] || 'Messaggio'; };
    const usoDi = k => { const m = (M.modelli || []).find(x => x.chiave === k); return m ? m.uso : (k === 'libero' ? 'libero' : ''); };
    function clienteDelReferente(id) { const r = S.ana.referenti.find(x => String(x.id) === String(id)); return r ? r.idSoggetto : ''; }

    /** Il corpo del Messaggio: A, canale, modello, oggetto, testo coi segnaposti che mancano, riferimento, Copia il testo. */
    function composer(msg, o) {
      const a = msg.a || {};
      const idCli = msg.idCliente || clienteDelReferente(a.idReferente);
      const altri = S.ana.referenti.filter(r => r.idSoggetto === idCli && String(r.id) !== String(a.idReferente) && (r.telefono || r.email || r.whatsapp));
      const testo = h('textarea', { rows: 7, 'aria-label': 'Testo', disabled: !scrive() });
      testo.value = msg.testo || '';
      const oggetto = h('input', { type: 'text', value: msg.oggetto || '', disabled: !scrive() });
      const zonaMancano = h('div', { class: 'mancano' });
      const contaLettere = h('span', { class: 'secondario piccolo-14' });
      const aggiornaMancano = () => {
        const restano = (testo.value.match(/\{[a-z_]+\}/gi) || []).filter((x, i, l) => l.indexOf(x) === i);
        aggiungi(svuota(zonaMancano), restano.map(s => h('span', { class: 'manca-seg' }, K.fraseManca(s))));
        contaLettere.textContent = msg.canale === 'whatsapp' ? K.migliaia(testo.value.length) + ' di ' + K.migliaia(testoMax()) + ' caratteri' : '';
        contaLettere.classList.toggle('rosso-testo', msg.canale === 'whatsapp' && testo.value.length > testoMax());
      };
      testo.addEventListener('input', () => { msg.testo = testo.value; aggiornaMancano(); });
      oggetto.addEventListener('input', () => { msg.oggetto = oggetto.value; });
      aggiornaMancano();
      const nW = msg.canale === 'whatsapp';
      const modelli = K.modelliPer(M.modelli, msg.canale, usoDi(msg.modello) === 'libero' ? '' : usoDi(msg.modello))
        .filter(m => usoDi(msg.modello) !== 'libero' || m.uso === 'libero' || m.uso === 'portale');
      const ricomponi = async cambio => {
        const nuovo = Object.assign({}, msg, cambio);
        const ok = await componi(nuovo);
        if (ok) { Object.assign(msg, nuovo); o.ridisegna(); }
      };
      return h('div', { class: 'composer' },
        h('div', { class: 'riga-a' }, iniziali(a.nome || a.cliente, true), h('span', { class: 'corpo' }, h('span', { class: 't1' }, a.nome || 'Chi riceve'),
          h('span', { class: 't2' }, [a.cliente !== a.nome ? a.cliente : '', nW ? (a.numeroVisto || 'nessun numero') : (a.email || 'nessuna email')].filter(Boolean).join(' · '))),
        altri.length && scrive() ? h('button', { type: 'button', class: 'btn collegamento', onclick: e => apriMenu(e.currentTarget, altri.map(r => ({ testo: r.nome + (r.ruolo ? ' · ' + r.ruolo : ''), fn: () => ricomponi({ a: { idReferente: r.id, nome: r.nome } }) }))) }, 'Cambia') : null),
        h('div', { class: 'pillole-testa' },
          segmenti([['whatsapp', 'WhatsApp', a.numero ? {} : { disabled: true, title: 'Nessun numero' }], ['email', 'Email', a.email ? {} : { disabled: true, title: 'Nessuna email' }]], msg.canale, x => { if (x !== msg.canale) ricomponi({ canale: x }); }, 'piccoli'),
          nW && !a.numero ? pill('Nessun numero') : null,
          nW && a.numero && !a.whatsappOk ? pill('WhatsApp non chiesto') : null,
          nW && a.whatsappOk ? pill('Ha detto sì a WhatsApp', 'verde') : null),
        nW && a.fisso ? h('div', { class: 'secondario' }, 'Sembra un numero fisso: WhatsApp potrebbe non esserci') : null,
        modelli.length > 1 ? h('div', { class: 'pillole' }, modelli.map(m => h('button', { type: 'button', class: 'pillola' + (m.chiave === msg.modello ? ' scelta' : ''), disabled: !scrive(), onclick: () => { if (m.chiave !== msg.modello) ricomponi({ modello: m.chiave }); } }, m.nome))) : null,
        !nW ? campo('Oggetto', oggetto) : null,
        campo('Testo', testo),
        h('div', { class: 'sotto-testo' }, zonaMancano, contaLettere),
        msg.riferimento ? h('div', { class: 'secondario' }, msg.riferimento) : null,
        msg.ultimoMovimento ? h('div', { class: 'banda calma' }, icona('banca', 18, 2.2), h('span', { class: 'spazio' }, 'Ultimo movimento segnato in Banche e scadenze: ' + C.data(msg.ultimoMovimento))) : null,
        h('div', { class: 'bottoni-msg' },
          h('button', { type: 'button', class: 'btn collegamento', onclick: async () => { const ok = await copiaTesto(testo.value); avviso(ok ? 'Testo copiato' : 'Il testo non si è copiato', !ok); } }, icona('copia', 16, 2.2), ' Copia il testo'),
          h('span', { class: 'spazio' }), o.pulsanti ? o.pulsanti() : null));
    }

    /**
     * "Manda un promemoria" dalla casa (fai.md §5): la proposta di Da mandare per quella fattura, con le regole di sempre
     * (primo o secondo promemoria, chi riceve, il sì a WhatsApp). Senza proposta o senza numero si apre il Messaggio.
     */
    async function promemoriaFattura(idFattura, cliente, dopo) {
      if (!scrive()) { avviso('Non hai il permesso per mandare messaggi: chiedi a ' + W.titolare(), true); return; }
      const letto = await lavora('Preparo il promemoria', () => Promise.all([leggiDaMandare(), leggiModelli().catch(() => null)]));
      if (!letto) return;
      const p = tutteLeProposte().find(x => String(x.proposta || '').indexOf('fattura:' + idFattura + ':') === 0);
      const msg = p ? daProposta(p) : null;
      const nW = msg && msg.canale === 'whatsapp';
      if (!msg || (nW && !(msg.a || {}).numero) || !String(msg.testo || '').trim()) {
        scrivi({ modello: 'promemoria_pagamento', canale: 'whatsapp', idFattura, riferimento: cliente });
        return;
      }
      if (!msg.idCliente && msg.a) msg.idCliente = msg.a.idCliente || '';
      let modifica = false;
      const testo = h('textarea', { rows: 7, 'aria-label': 'Il messaggio' });
      testo.value = msg.testo;
      testo.addEventListener('input', () => { msg.testo = testo.value; });
      const zona = h('div', { class: 'fila' });
      const cambia = h('button', { type: 'button', class: 'btn grande', onclick: () => { modifica = !modifica; disegna(); } }, 'Cambia il testo');
      const disegna = () => {
        aggiungi(svuota(zona), [
          h('div', { class: 'sotto-titolo' }, (nW ? 'Su WhatsApp' : 'Per email') + ((msg.a || {}).nome ? (nW ? ', a ' : ' a ') + msg.a.nome : '')),
          modifica ? campo('Il messaggio', testo) : h('div', { class: 'bolla-wa' }, msg.testo)]);
        cambia.textContent = modifica ? 'Fatto' : 'Cambia il testo';
      };
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'Promemoria a ' + (cliente || (msg.a || {}).cliente || 'il cliente'), corpo: zona, fuoco: false,
        pulsanti: [h('button', { type: 'button', class: 'btn verde grande', style: { flex: '1 1 220px' }, onclick: async () => {
          if (await manda(msg, chiudi)) { chiudi(); if (dopo) dopo(); }
        } }, icona(nW ? 'whatsapp' : 'email', 20, 2.2), nW ? 'Manda su WhatsApp' : 'Manda per email'), cambia] });
    }

    /** Chiede al server il testo dal modello (preparaMessaggio): non salva niente. */
    async function componi(msg) {
      const corpo = Object.assign({ modello: msg.modello || 'libero', canale: msg.canale || 'whatsapp', idReferente: (msg.a && msg.a.idReferente) || undefined, idCliente: msg.idCliente || undefined, proposta: msg.proposta || undefined }, msg.rif || {});
      const r = await lavora('Preparo il messaggio', () => Rete.post('/server/preparaMessaggio', corpo));
      if (!r) return false;
      Object.assign(msg, { testo: r.testo || '', oggetto: r.oggetto || '', a: Object.assign({}, msg.a || {}, r.a || {}), mancano: r.mancano || [], ultimoMovimento: r.ultimoMovimento || '' });
      return true;
    }

    /**
     * Il Messaggio dalle altre pagine: { modello, canale, idReferente, idCliente, idAttivita, idTicket, idPreventivo, idRapportino,
     * idFattura, idCommessa, proposta, riferimento }. Si apre in una finestra; senza numero per WhatsApp passa all'email.
     */
    async function scrivi(o) {
      if (!scrive()) { avviso('Non hai il permesso per mandare messaggi: chiedi a ' + W.titolare(), true); return; }
      await leggiModelli().catch(() => null);
      const rif = {};
      ['idAttivita', 'idTicket', 'idPreventivo', 'idRapportino', 'idFattura', 'idCommessa'].forEach(k => { if (o[k]) rif[k] = o[k]; });
      const msg = { modello: o.modello || 'libero', canale: o.canale || 'whatsapp', proposta: o.proposta || '', a: { idReferente: o.idReferente || null }, idCliente: o.idCliente || clienteDelReferente(o.idReferente),
        rif, riferimento: o.riferimento || '', idLocale: K.idLocale('msg') };
      let ok = await componiZitto(msg);
      if (!ok && msg.canale === 'whatsapp') { msg.canale = 'email'; ok = await componi(msg); }
      if (!ok) return;
      let chiudi;
      const zona = h('div');
      const giallo = h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => { const fatto = await manda(msg, () => chiudi()); if (fatto) chiudi(); } });
      const aggiornaGiallo = () => { giallo.textContent = msg.canale === 'email' ? 'Manda l\'email' : 'Apri WhatsApp'; };
      const disegna = () => { aggiungi(svuota(zona), [composer(msg, { ridisegna: disegna })]); aggiornaGiallo(); };
      disegna();
      chiudi = finestra({ titolo: nomeModello(msg.modello), corpo: zona, larghezza: 'media', fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), giallo] });
    }

    /** Come componi, ma senza l'avviso rosso se per WhatsApp manca il numero (si passa all'email). */
    async function componiZitto(msg) {
      const corpo = Object.assign({ modello: msg.modello, canale: msg.canale, idReferente: (msg.a && msg.a.idReferente) || undefined, idCliente: msg.idCliente || undefined, proposta: msg.proposta || undefined }, msg.rif || {});
      try {
        const r = await Rete.post('/server/preparaMessaggio', corpo);
        Object.assign(msg, { testo: r.testo || '', oggetto: r.oggetto || '', a: Object.assign({}, msg.a || {}, r.a || {}), mancano: r.mancano || [], ultimoMovimento: r.ultimoMovimento || '' });
        return true;
      } catch (e) {
        if (e && e.accesso === false) return false;
        if (msg.canale === 'whatsapp') return false;
        avviso(e.message || String(e), true);
        return false;
      }
    }

    /** Nuovo messaggio (giallo di Da mandare e Storico): prima a chi (cliente e referente), poi il Messaggio col modello libero. */
    function nuovoMessaggio(idCliente) {
      const clienti = W.clientiAttivi().slice().sort((x, y) => x.nome.localeCompare(y.nome, 'it'));
      let cli = idCliente || M.idCliente || '';
      let ref = null;
      let chiudi;
      const zona = h('div', { class: 'fila' });
      const disegna = () => {
        const refs = S.ana.referenti.filter(r => r.idSoggetto === cli);
        aggiungi(svuota(zona), [campo('Cliente', B.selezione([['', 'Scegli il cliente']].concat(clienti.map(c => [c.id, c.nome])), cli, v => { cli = v; ref = null; disegna(); })),
          cli ? h('div', { class: 'campo' }, h('label', null, 'A chi'), h('div', { class: 'pillole' },
            refs.map(r => h('button', { type: 'button', class: 'pillola' + (ref === r.id ? ' scelta' : ''), onclick: () => { ref = r.id; disegna(); } }, r.nome + (r.ruolo ? ' · ' + r.ruolo : ''))),
            h('button', { type: 'button', class: 'pillola' + (ref === 'cliente' ? ' scelta' : ''), onclick: () => { ref = 'cliente'; disegna(); } }, refs.length ? 'Il cliente' : (W.cliente(cli) || {}).nome || 'Il cliente'))) : null]);
      };
      disegna();
      chiudi = finestra({ titolo: 'Nuovo messaggio', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: () => {
            if (!cli || !ref) { avviso(!cli ? 'Scegli il cliente' : 'Scegli a chi', true); return; }
            chiudi();
            scrivi({ modello: 'libero', canale: 'whatsapp', idCliente: cli, idReferente: ref === 'cliente' ? null : ref });
          } }, 'Avanti')] });
    }

    // ===================================================================== mandare

    /**
     * WhatsApp (§3.13): se non ha detto di sì lo si chiede; il messaggio si salva "preparato", si apre wa.me nel browser
     * del sistema, e al ritorno della finestra "L'hai mandato?". Email: parte dal postino (mandaEmail).
     */
    async function manda(msg, chiudiFinestra) {
      const a = msg.a || {};
      if (msg.canale === 'whatsapp') {
        if (!a.numero) { avviso((a.nome || 'Chi riceve') + ' non ha un numero di telefono', true); return false; }
        if (String(msg.testo || '').length > testoMax()) { avviso('Il messaggio è più lungo di ' + K.migliaia(testoMax()) + ' caratteri: accorcialo', true); return false; }
        if (!String(msg.testo || '').trim()) { avviso('Scrivi il messaggio', true); return false; }
        if (!a.whatsappOk && a.idReferente) {
          const scelta = await chiediSi(a.nome);
          if (!scelta) return false;
          if (scelta === 'email') {
            const nuovo = Object.assign({}, msg, { canale: 'email' });
            if (await componi(nuovo)) { Object.assign(msg, nuovo); W.ridisegna(); if (chiudiFinestra) { chiudiFinestra(); scrivi(Object.assign({ modello: msg.modello, canale: 'email', idReferente: a.idReferente, idCliente: msg.idCliente, proposta: msg.proposta, riferimento: msg.riferimento }, msg.rif)); } }
            return false;
          }
          const s = await lavora('Segno il sì', () => Rete.post('/server/segnaWhatsapp', { idReferente: a.idReferente, ok: true }));
          if (!s) return false;
          a.whatsappOk = true;
          W.ricaricaAnagrafiche().catch(() => null);
        }
        const corpo = { messaggio: Object.assign({ idLocale: msg.idLocale || K.idLocale('msg'), canale: 'whatsapp', direzione: 'uscita', tipo: msg.modello, modello: msg.modello, proposta: msg.proposta || undefined,
          idReferente: a.idReferente || undefined, idCliente: msg.idCliente || undefined, a: a.numero, testo: msg.testo, stato: 'preparato' }, msg.rif || {}) };
        msg.idLocale = corpo.messaggio.idLocale;
        const salvato = await lavora('Preparo il messaggio', () => Rete.post('/server/salvaMessaggio', corpo));
        if (!salvato || !salvato.comunicazione) return false;
        await apriWhatsapp(K.linkWhatsapp(a.numero, msg.testo), { id: salvato.comunicazione.id, nome: a.nome || a.cliente, testo: msg.testo });
        if (M.scelto && M.scelto.indexOf('p:') === 0) { M.scelto = null; M.msg = null; }
        dopoUnInvio();
        return true;
      }
      if (!a.email) { avviso('Manca l\'email di ' + (a.nome || 'chi riceve') + ': scrivila in Clienti', true); return false; }
      if (!String(msg.oggetto || '').trim()) { avviso('Scrivi l\'oggetto', true); return false; }
      const corpo = { messaggio: Object.assign({ idLocale: msg.idLocale || K.idLocale('email'), modello: msg.modello, proposta: msg.proposta || undefined, idReferente: a.idReferente || undefined,
        idCliente: msg.idCliente || undefined, a: a.email, oggetto: msg.oggetto, testo: msg.testo }, msg.rif || {}) };
      msg.idLocale = corpo.messaggio.idLocale;
      const r = await lavora('Mando l\'email', () => Rete.post('/server/mandaEmail', corpo));
      if (!r) return false;
      const c = r.comunicazione || {};
      if (c.stato === 'errore') avviso('L\'email non è partita: ' + (c.errore || 'riprova'), true);
      else avviso('Email mandata a ' + a.email + (S.esempio ? ' (esempio: non è partito niente)' : ''));
      if (M.scelto && M.scelto.indexOf('p:') === 0) { M.scelto = null; M.msg = null; }
      dopoUnInvio();
      return true;
    }

    /** "Giulia Neri ha detto che si può scriverle su WhatsApp?": 'si', 'email' o null. */
    function chiediSi(nome) {
      return new Promise(risolvi => {
        let detto = false;
        const r = v => { if (!detto) { detto = true; risolvi(v); } };
        let chiudi;
        chiudi = finestra({ titolo: 'Ha detto di sì?', corpo: h('p', { class: 'testo-forte' }, (nome || 'Il referente') + ' ha detto che si può scriverle su WhatsApp?'), fuoco: false, allaChiusura: () => r(null),
          pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => { r('email'); chiudi(); } }, 'Manda un\'email'),
            h('button', { type: 'button', class: 'btn giallo grande', onclick: () => { r('si'); chiudi(); } }, 'Sì, me l\'ha detto')] });
      });
    }

    /** Apre wa.me nel browser del sistema (mai nella finestra) e prepara "L'hai mandato?" per il ritorno. */
    async function apriWhatsapp(link, attesa) {
      if (!K.linkWhatsappValido(link)) { avviso('Il messaggio per WhatsApp non è andato bene: riprova', true); return; }
      M.attesaWa = Object.assign({ dal: Date.now() }, attesa);
      if (S.esempio) { avviso('Nei dati di esempio WhatsApp non si apre'); setTimeout(chiediMandato, 900); return; }
      const r = await lavora('Apro WhatsApp', () => Api.post('/locale/apri-whatsapp', { url: link }));
      if (!r) { M.attesaWa = null; return; }
    }

    function riapriWhatsapp(c) {
      const n = K.numeroWhatsapp(c.a || '');
      if (!n.valido) { avviso('Il numero ' + (c.a || '') + ' non sembra un numero di telefono', true); return; }
      apriWhatsapp(K.linkWhatsapp(n.numero, c.testo || ''), { id: c.id, nome: c.referente || c.cliente, testo: c.testo });
    }

    /** Al ritorno: "L'hai mandato?" con il testo in piccolo; Sì l'ho mandato (giallo) e Non ancora. */
    function chiediMandato() {
      const x = M.attesaWa;
      if (!x || Date.now() - x.dal < 800) return;
      M.attesaWa = null;
      let chiudi;
      chiudi = finestra({ titolo: 'L\'hai mandato?', fuoco: false,
        corpo: h('div', { class: 'fila' }, h('p', { class: 'testo-forte' }, 'Il messaggio a ' + (x.nome || 'chi lo riceve')), h('div', { class: 'anteprima-msg piccola' }, x.testo || '')),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => { chiudi(); avviso('Resta fra i preparati: lo ritrovi in Da mandare'); } }, 'Non ancora'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => { chiudi(); await segnaMandato(x.id, true); } }, 'Sì, l\'ho mandato')] });
    }

    async function segnaMandato(id, mandato) {
      const r = await lavora('Segno mandato', () => Rete.post('/server/segnaMandato', { id, mandato: !!mandato }));
      if (!r) return;
      if (M.scelto === 'c:' + id) { M.scelto = null; }
      if (M.aperta && String(M.aperta.id) === String(id)) M.aperta = r.comunicazione || Object.assign({}, M.aperta, { stato: 'mandato' });
      avviso('Segnato mandato');
      await dopoUnInvio();
    }

    // Il ritorno della finestra: il programma lo dice (Finestra.cs, "attiva"); nel browser delle prove basta il fuoco.
    if (radice.chrome && radice.chrome.webview) radice.chrome.webview.addEventListener('message', e => { if (e.data && e.data.tipo === 'attiva') setTimeout(chiediMandato, 250); });
    radice.addEventListener('focus', () => setTimeout(chiediMandato, 250));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(chiediMandato, 250); });

    async function dopoUnInvio() {
      daRileggere();
      W.caricaDashboard();
      const p = W.percorso();
      if (p.indexOf('comunicazioni') === 0) {
        if (p === 'comunicazioni' || p === 'comunicazioni/') { try { await leggiDaMandare(); } catch (e) { /* alla prossima */ } }
        W.ridisegna();
        if (M.aperta) disegnaPannello();
      } else if (p.indexOf('clienti/') === 0 || p.indexOf('commesse/') === 0) W.ridisegna();
    }

    // ===================================================================== Storico

    async function leggiStorico(altre) {
      const chiave = qs({ idCliente: M.idCliente, idCommessa: M.idCommessa, testo: M.testo.trim() });
      const pagina = altre ? (M.storico.pagina || 1) + 1 : 1;
      const r = await Rete.get('/server/comunicazioni?' + qs({ idCliente: M.idCliente, idCommessa: M.idCommessa, testo: M.testo.trim(), pagina, conAccessi: M.idCliente ? true : '' }));
      if (altre && M.storico) { r.comunicazioni = M.storico.comunicazioni.concat(r.comunicazioni || []); r.accessi = M.storico.accessi; }
      M.storico = r;
      M.chiaveStorico = chiave;
    }

    function paginaStorico(pagina) {
      const chiave = qs({ idCliente: M.idCliente, idCommessa: M.idCommessa, testo: M.testo.trim() });
      conDati(pagina, () => (M.storico && M.chiaveStorico === chiave ? Promise.resolve() : leggiStorico()), () => {
        const area = h('div', { class: 'sezione' });
        let attesa = null;
        const nomeCli = M.idCliente ? ((W.cliente(M.idCliente) || {}).nome || M.idCliente) : '';
        const togli = cosa => h('button', { type: 'button', 'aria-label': 'Togli il filtro', title: 'Togli il filtro', onclick: () => { M[cosa] = ''; M.storico = null; W.disegnaPagina(); } }, icona('chiudi', 16, 2.4));
        aggiungi(pagina, [h('div', { class: 'filtri' },
          cerca(M.testo, 'Cerca nei messaggi', v => { M.testo = v; clearTimeout(attesa); attesa = setTimeout(async () => { try { await leggiStorico(); tabellaStorico(area); } catch (e) { avviso(e.message, true); } }, 300); }),
          h('div', { class: 'pillole' }, K.FILTRI_STORICO.map(([k, nome]) => h('button', { type: 'button', class: 'pillola' + (M.filtro === k ? ' scelta' : ''), 'aria-pressed': M.filtro === k ? 'true' : 'false',
            onclick: () => { M.filtro = k; tabellaStorico(area); document.querySelectorAll('.filtri .pillola').forEach(b => b.classList.toggle('scelta', b.textContent === nome)); } }, nome))),
          M.idCliente ? h('span', { class: 'filtro-attivo' }, nomeCli, togli('idCliente')) : null,
          M.idCommessa ? h('span', { class: 'filtro-attivo' }, 'Commessa ' + M.idCommessa, togli('idCommessa')) : null), area]);
        tabellaStorico(area);
        if (M.aperta) disegnaPannello();
      });
    }

    // Le colonne stanno in stile.css (.tab-storico): nella tabella stretta (1024) cliente e riferimento vanno sotto
    // "a chi" e il tipo (07/11/2026, prima a 1024 le celle erano larghe 60 px).
    function tabellaStorico(area) {
      svuota(area);
      const lista = K.filtraStorico((M.storico && M.storico.comunicazioni) || [], M.filtro);
      if (!lista.length) { aggiungi(area, [h('div', { class: 'calmo' }, icona('fumetto', 20, 2.2), M.testo ? 'Nessun messaggio con queste parole' : 'Nessun messaggio')]); return; }
      const tab = h('div', { class: 'tab tab-storico' }, h('div', { class: 'r testa' },
        h('span', null, 'Quando'), h('span', null, 'Canale'), h('span', null, 'Tipo'), h('span', null, 'A chi'), h('span', { class: 'c-largo' }, 'Cliente'), h('span', { class: 'c-largo' }, 'Riferimento'), h('span', null, 'Stato')));
      lista.forEach(c => {
        const ic = K.iconaCanale(c.canale);
        const rif = c.riferimento ? c.riferimento.etichetta || '' : '';
        aggiungi(tab, [h('div', { class: 'r cliccabile' + (M.aperta && String(M.aperta.id) === String(c.id) ? ' scelta' : ''), role: 'button', tabindex: '0', 'data-id': c.id,
          onclick: () => apriPannello(c), onkeydown: e => { if (e.key === 'Enter') apriPannello(c); } },
        h('span', { class: 't2' }, quando(c.quando)),
        h('span', { class: 'canale-cella' }, h('span', { class: 'ico-mini ' + ic[1] }, icona(c.direzione === 'entrata' ? 'entrata' : ic[0], 15, 2.4)), K.nomeCanale(c.canale)),
        h('span', { class: 'cella-due' }, h('span', { class: 'forte taglia' }, K.nomeTipo(c)), rif ? h('span', { class: 'solo-stretto' }, rif) : null),
        h('span', { class: 'cella-due' }, h('span', { class: 'taglia' }, c.referente || c.a || ''), c.cliente ? h('span', { class: 'solo-stretto' }, c.cliente) : null),
        h('span', { class: 'taglia t2 c-largo' }, c.cliente || ''),
        h('span', { class: 'taglia c-largo' }, rif),
        h('span', null, pillStato(c)))]);
      });
      aggiungi(area, [tab]);
      // Le righe calme degli accessi al portale, nello storico di un cliente (§9.1).
      const acc = (M.storico && M.storico.accessi) || [];
      if (acc.length && M.idCliente) aggiungi(area, [h('div', { class: 'scheda righe' }, acc.slice(0, 10).map(x => riga({ sinistra: quadrato('occhio'), titolo: x.frase, sotto: quando(x.quando), classe: 'calma' })))]);
      if (M.storico && M.storico.pagine > (M.storico.pagina || 1)) aggiungi(area, [h('div', null, h('button', { type: 'button', class: 'btn', onclick: async () => { const ok = await lavora('Leggo', () => leggiStorico(true)); if (ok !== undefined) tabellaStorico(area); } }, 'Altri messaggi'))]);
    }

    // il pannello (440) della comunicazione
    function apriPannello(c) {
      M.aperta = c;
      document.querySelectorAll('.tab .r[data-id]').forEach(x => x.classList.toggle('scelta', String(x.dataset.id) === String(c.id)));
      disegnaPannello();
    }
    function chiudiPannello(subito) {
      const p = document.querySelector('.pannello-com');
      M.aperta = null;
      gialloPagina(false);
      document.querySelectorAll('.tab .r.scelta').forEach(x => x.classList.remove('scelta'));
      if (!p) return;
      if (subito) { p.remove(); return; }
      p.classList.add('via');
      setTimeout(() => p.remove(), 200);
    }
    function disegnaPannello() {
      const c = M.aperta;
      const vecchio = document.querySelector('.pannello-com');
      if (!c) { if (vecchio) vecchio.remove(); return; }
      const ic = K.iconaCanale(c.canale);
      const entrata = c.direzione === 'entrata';
      const r = c.riferimento;
      const coppie = [['A chi', entrata ? 'Lo studio' : [c.referente, c.cliente].filter(Boolean).join(' · ')], ['Quando', quando(c.quando)],
        ['Chi', entrata ? (c.referente || c.cliente || '') : (c.chi || 'Wisper')], ['Indirizzo', c.a || '—']];
      const corpo = h('div', { class: 'corpo' },
        h('div', { class: 'alto' }, h('span', { class: 'etichetta-pannello' }, 'Comunicazione'), h('span', { class: 'spazio' }), tondo('chiudi', 'Chiudi', () => chiudiPannello(), 'piccolo')),
        h('div', { class: 'pillole-testa' }, h('span', { class: 'pill ' + (c.canale === 'whatsapp' ? 'p-verde' : c.canale === 'email' ? 'p-blu' : c.canale === 'portale' ? 'p-viola' : 'p-grigio') }, K.nomeCanale(c.canale)), pillStato(c),
          entrata && c.canale === 'portale' ? pill('Dal portale') : null),
        h('h2', { class: 'titolo-pannello' }, quadrato(entrata ? 'entrata' : ic[0], ic[1]), K.nomeTipo(c)),
        h('div', { class: 'scheda' }, h('div', { class: 'coppie' }, coppie.map(x => h('div', { class: 'coppia' }, h('span', { class: 'k' }, x[0]), h('span', { class: 'v' }, x[1] || '—'))))),
        c.oggetto ? h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Oggetto'), h('div', null, c.oggetto)) : null,
        h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, c.canale === 'whatsapp' ? 'Testo preparato' : 'Testo'), h('div', { class: 'anteprima-msg' }, c.testo || '—')),
        c.stato === 'errore' && c.errore ? h('div', { class: 'banda' }, icona('avviso', 18), h('span', { class: 'spazio' }, c.errore)) : null,
        c.stato === 'non_mandato' && c.motivo ? h('div', { class: 'banda calma' }, h('span', { class: 'spazio' }, 'Non mandato: ' + c.motivo)) : null,
        r && r.tipo ? h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Riferimento'), h('div', { class: 'scheda righe' },
          riga({ sinistra: quadrato('link'), titolo: r.etichetta || r.tipo, onclick: () => { chiudiPannello(true); W.vaiA({ pagina: r.tipo, id: r.id }); } }))) : null);
      const piede = [];
      if (c.stato === 'preparato' && scrive()) {
        if (c.canale === 'whatsapp') piede.push(h('button', { type: 'button', class: 'btn grande', onclick: () => riapriWhatsapp(c) }, 'Apri WhatsApp'));
        piede.push(h('button', { type: 'button', class: 'btn grande giallo', onclick: () => segnaMandato(c.id, true) }, 'Segna mandato'));
      }
      const p = h('aside', { class: 'pannello pannello-com', 'aria-label': 'La comunicazione' }, corpo, piede.length ? h('div', { class: 'piede' }, piede) : null);
      gialloPagina(true);
      if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi(B.$('#sovrapposti'), [p]);
    }

    /** Annota una telefonata (o una nota): resta nello storico del cliente. */
    function annotaTelefonata(o) {
      const x = o || {};
      const clienti = W.clientiAttivi().slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
      let cli = x.idCliente || '';
      let ref = null;
      let canale = 'telefonata';
      let verso = 'entrata';
      const testo = h('textarea', { rows: 4 });
      let errore = '';
      let chiudi;
      const zona = h('div', { class: 'fila' });
      const disegna = () => {
        const refs = S.ana.referenti.filter(r => r.idSoggetto === cli);
        aggiungi(svuota(zona), [campo('Cliente', B.selezione([['', 'Scegli il cliente']].concat(clienti.map(c => [c.id, c.nome])), cli, v => { cli = v; ref = null; disegna(); })),
          refs.length ? h('div', { class: 'campo' }, h('label', null, 'Con chi'), h('div', { class: 'pillole' }, refs.map(r => h('button', { type: 'button', class: 'pillola' + (ref === r.id ? ' scelta' : ''), onclick: () => { ref = ref === r.id ? null : r.id; disegna(); } }, r.nome)))) : null,
          h('div', { class: 'riga-campi' }, h('div', { class: 'campo' }, h('label', null, 'Cosa'), segmenti([['telefonata', 'Telefonata'], ['nota', 'Nota']], canale, v => { canale = v; disegna(); }, 'piccoli')),
            canale === 'telefonata' ? h('div', { class: 'campo' }, h('label', null, 'Chi ha chiamato'), segmenti([['entrata', 'Ha chiamato lui'], ['uscita', 'Ho chiamato io']], verso, v => { verso = v; disegna(); }, 'piccoli')) : null),
          campo('Cosa vi siete detti', testo, errore)]);
      };
      disegna();
      chiudi = finestra({ titolo: 'Annota una telefonata', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
            if (!cli) { avviso('Scegli il cliente', true); return; }
            if (!testo.value.trim()) { errore = 'Scrivi cosa vi siete detti'; disegna(); return; }
            const r = await lavora('Salvo', () => Rete.post('/server/salvaMessaggio', { messaggio: { idLocale: K.idLocale('tel'), canale, direzione: canale === 'nota' ? 'uscita' : verso, tipo: 'libero',
              idCliente: cli, idReferente: ref || undefined, testo: testo.value.trim(), stato: 'mandato' } }));
            if (!r) return;
            chiudi();
            avviso(canale === 'nota' ? 'Nota salvata' : 'Telefonata annotata');
            dopoUnInvio();
          } }, 'Salva')] });
    }

    // ===================================================================== Modelli

    function paginaModelli(pagina, apri) {
      conDati(pagina, () => { M.modelli = null; return leggiModelli(); }, () => {
        const col = 'minmax(0, 1.1fr) 130px 130px minmax(0, 2fr) 100px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Nome'), h('span', null, 'Canale'), h('span', null, 'Uso'), h('span', null, 'Testo'), h('span', null, 'Stato')));
        (M.modelli || []).forEach(m => aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-chiave': m.chiave, onclick: () => finestraModello(m) },
          h('span', { class: 'forte taglia' }, m.nome), h('span', null, pill(K.nomeCanaleModello(m.canale))), h('span', { class: 't2' }, (K.USI.find(u => u[0] === m.uso) || [m.uso, m.uso])[1]),
          // Il testo del modello è un'anteprima di una riga (tutto passandoci sopra e nella finestra del modello).
          h('span', { class: 't2 una-riga', title: m.testo }, m.testo), h('span', null, m.attivo === false || m.attivo === 0 ? pill('Spento') : pill('Attivo', 'verde')))]));
        aggiungi(pagina, [(M.modelli || []).length ? tab : h('div', { class: 'calmo' }, 'Nessun modello')]);
        if (apri) { const m = (M.modelli || []).find(x => x.chiave === apri); if (m) setTimeout(() => finestraModello(m), 50); }
      });
    }

    /** La finestra del modello a due colonne: a sinistra i campi, a destra l'anteprima riempita per un cliente di esempio. */
    function finestraModello(m0) {
      const m = Object.assign({ chiave: '', nome: '', canale: 'tutti', uso: 'libero', oggetto: '', testo: 'Buongiorno {nome}, ', attivo: true, sistema: false }, m0 || {});
      const sola = !scrive() || (m.sistema && !W.puo('amministrazione', 2));
      const v = { nome: h('input', { type: 'text', value: m.nome, disabled: sola }), oggetto: h('input', { type: 'text', value: m.oggetto || '', disabled: sola }), testo: h('textarea', { rows: 9, disabled: sola }) };
      v.testo.value = m.testo || '';
      let errori = {};
      const anteprima = h('div', { class: 'anteprima-msg' });
      const conta = h('span', { class: 'secondario piccolo-14' });
      const aggiorna = () => {
        m.testo = v.testo.value;
        const r = K.riempi(m.testo, K.VALORI_ESEMPIO, { portale: true });
        anteprima.textContent = r.testo;
        conta.textContent = m.canale === 'email' ? '' : K.migliaia(m.testo.length) + ' di ' + K.migliaia(testoMax()) + ' caratteri';
        conta.classList.toggle('rosso-testo', m.canale !== 'email' && m.testo.length > testoMax());
      };
      v.testo.addEventListener('input', aggiorna);
      const metti = s => {
        if (sola) return;
        const i = v.testo.selectionStart || v.testo.value.length;
        v.testo.value = v.testo.value.slice(0, i) + s + v.testo.value.slice(v.testo.selectionEnd || i);
        v.testo.focus();
        v.testo.selectionStart = v.testo.selectionEnd = i + s.length;
        aggiorna();
      };
      const sinistra = h('div', { class: 'fila' });
      const disegna = () => {
        const usi = K.USI.filter(u => u[0] !== 'pagamento' || K.Permessi.pagamenti(P()));
        aggiungi(svuota(sinistra), [campo('Nome', v.nome, errori.nome),
          h('div', { class: 'campo' }, h('label', null, 'Canale'), segmenti(K.CANALI_MODELLO, m.canale, x => { if (!sola) { m.canale = x; disegna(); aggiorna(); } }, 'piccoli')),
          h('div', { class: 'campo' }, h('label', null, 'Uso'), h('div', { class: 'pillole' }, usi.map(u => h('button', { type: 'button', class: 'pillola' + (m.uso === u[0] ? ' scelta' : ''), disabled: sola || (m.sistema && m.uso !== u[0]), onclick: () => { if (!sola && !m.sistema) { m.uso = u[0]; disegna(); } } }, u[1])))),
          m.canale !== 'whatsapp' ? campo('Oggetto dell\'email', v.oggetto) : null,
          campo('Testo', v.testo, errori.testo),
          h('div', { class: 'testa-sez' }, h('span', { class: 'etichetta' }, 'Segnaposti'), conta),
          h('div', { class: 'pillole segnaposti-mod' }, K.segnapostiDi(m.uso, M.segnaposti).map(s => h('button', { type: 'button', class: 'pillola piccola', disabled: sola, onclick: () => metti(s) }, s))),
          h('div', { class: 'campo' }, h('label', null, 'Si usa'), segmenti([['si', 'Attivo'], ['no', 'Spento']], m.attivo === false || m.attivo === 0 ? 'no' : 'si', x => { if (!sola) { m.attivo = x === 'si'; disegna(); } }, 'piccoli'))]);
      };
      disegna();
      aggiorna();
      const corpo = h('div', { class: 'due-colonne-f' }, sinistra, h('div', { class: 'sezione-pannello anteprima-modello' }, h('span', { class: 'etichetta' }, 'Come arriva a ' + K.VALORI_ESEMPIO.nome), anteprima,
        m.sistema ? h('div', { class: 'pillole-testa' }, pill('Modello di Wisper'), h('span', { class: 'secondario piccolo-14' }, 'si cambia o si spegne, non si toglie')) : null));
      let chiudi;
      const salva = async () => {
        const dati = { chiave: m.chiave || undefined, nome: v.nome.value.trim(), canale: m.canale, uso: m.uso, oggetto: m.canale === 'whatsapp' ? '' : v.oggetto.value.trim(), testo: v.testo.value, attivo: m.attivo !== false && m.attivo !== 0 };
        const e = K.erroreModello(dati, M.segnaposti, testoMax());
        errori = e ? { [e.campo]: e.errore } : {};
        if (e) { disegna(); return; }
        const r = await lavora('Salvo il modello', () => Rete.post('/server/salvaModelloMessaggio', { modello: dati }));
        if (!r) return;
        chiudi();
        M.modelli = null;
        avviso('Modello salvato');
        W.disegnaPagina();
      };
      const togli = m.chiave && !m.sistema && !sola ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: async () => {
        if (!(await conferma('Togliere il modello?', 'Il modello ' + m.nome + ' non si potrà più usare. I messaggi già mandati restano nello storico.', 'Togli', true))) return;
        const r = await lavora('Tolgo il modello', () => Rete.post('/server/togliModelloMessaggio', { chiave: m.chiave }));
        if (r) { chiudi(); M.modelli = null; avviso('Modello tolto'); W.disegnaPagina(); }
      } }, 'Togli il modello') : null;
      chiudi = finestra({ titolo: m.chiave ? m.nome : 'Nuovo modello', corpo, larghezza: 'larga', fuoco: false,
        pulsanti: [togli, 'spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, sola ? 'Chiudi' : 'Annulla'),
          sola ? null : h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva il modello')].filter(Boolean) });
    }

    // ===================================================================== Notifiche e campanella

    async function leggiNotifiche() { M.notifiche = await Rete.get('/server/notifiche'); M.nuove = M.notifiche.nuove || 0; W.disegnaCampanella(); }

    function paginaNotifiche(pagina) {
      conDati(pagina, () => (M.notifiche ? Promise.resolve() : leggiNotifiche()), () => {
        const lista = (M.notifiche && M.notifiche.notifiche) || [];
        aggiungi(pagina, [h('div', { class: 'stretta-820 sezione' },
          lista.some(n => !n.letta) ? h('div', { class: 'riga-destra' }, h('button', { type: 'button', class: 'btn', onclick: async () => {
            const r = await lavora('Un momento', () => Rete.post('/server/segnaLette', { tutte: true }));
            if (r) { M.nuove = r.nuove || 0; M.notifiche = null; W.disegnaCampanella(); W.disegnaPagina(); }
          } }, 'Segna tutte lette')) : null,
          lista.length ? h('div', { class: 'scheda righe' }, lista.map(n => riga({
            sinistra: quadrato('campana', n.letta ? 'ico-grigio' : 'ico-giallo'),
            titolo: [n.letta ? null : h('i', { class: 'pallino-nuovo', 'aria-label': 'Nuova' }), n.titolo],
            sotto: [n.dettaglio, quando(n.creata)].filter(Boolean).join(' · '), classe: n.letta ? '' : 'nuova',
            onclick: async () => {
              if (!n.letta) { try { const r = await Rete.post('/server/segnaLette', { ids: [n.id] }); M.nuove = r.nuove || 0; n.letta = true; W.disegnaCampanella(); } catch (e) { /* resta nuova */ } }
              if (n.collegamento) W.vaiA(n.collegamento); else W.disegnaPagina();
            },
          }))) : h('div', { class: 'calmo' }, icona('campana', 20, 2.2), 'Nessuna notifica'))]);
      });
    }

    /** Le notifiche nuove per la campanella: si rileggono ogni due minuti (niente servizi esterni, §3.16). */
    function nuove() {
      if (M.nuove === null || M.nuove === undefined) return Number(interfaccia().notificheNuove) || 0;
      return M.nuove;
    }
    async function rileggiNuove() {
      if (!S.entrato || !S.caricato || S.esempio) return;
      try { const r = await Api.get('/server/notifiche?soloNuove=1'); M.nuove = r.nuove || 0; W.disegnaCampanella(); } catch (e) { /* alla prossima */ }
    }
    setInterval(rileggiNuove, 120000);

    // ===================================================================== schede nelle altre pagine

    /** Le ultime 5 comunicazioni di un cliente (con le righe calme degli accessi), "Tutte" e "Scrivi" (§12.6). */
    function schedaCliente(area, idCliente) {
      if (!vede()) return;
      const zona = h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, 'Comunicazioni'), segnaposto(2, 54));
      aggiungi(area, [zona]);
      Rete.get('/server/comunicazioni?' + qs({ idCliente, conAccessi: true })).then(r => {
        const righe = (r.comunicazioni || []).slice(0, 5).map(c => rigaCom(c)).concat((r.accessi || []).slice(0, 2).map(x => riga({ sinistra: quadrato('occhio'), titolo: x.frase, sotto: quando(x.quando), classe: 'calma' })));
        zona.lastChild.remove();
        aggiungi(zona, [righe.length ? h('div', { class: 'scheda righe' }, righe) : h('p', { class: 'vuoto sinistra' }, 'Nessuna comunicazione.'),
          h('div', { class: 'bottoni-msg' }, h('button', { type: 'button', class: 'btn', onclick: () => W.vaiA({ pagina: 'comunicazioni', filtro: { segmento: 'storico', idCliente } }) }, 'Tutte'),
            scrive() ? h('button', { type: 'button', class: 'btn', onclick: () => nuovoMessaggio(idCliente) }, 'Scrivi') : null)]);
      }).catch(e => { if (zona.lastChild) zona.lastChild.remove(); aggiungi(zona, [h('div', { class: 'banda calma' }, h('span', { class: 'spazio' }, e.message || String(e)))]); });
    }

    /** La scheda Comunicazioni della commessa (§12.6): lo storico della commessa e Scrivi. */
    function schedaCommessa(area, idCommessa, idCliente) {
      const zona = h('div', { class: 'sezione' }, segnaposto(3, 54));
      aggiungi(area, [zona]);
      Rete.get('/server/comunicazioni?' + qs({ idCommessa })).then(r => {
        svuota(zona);
        const righe = (r.comunicazioni || []).map(c => rigaCom(c));
        aggiungi(zona, [righe.length ? h('div', { class: 'scheda righe' }, righe) : h('p', { class: 'vuoto sinistra' }, 'Nessuna comunicazione per questa commessa.'),
          h('div', { class: 'bottoni-msg' }, h('button', { type: 'button', class: 'btn', onclick: () => W.vaiA({ pagina: 'comunicazioni', filtro: { segmento: 'storico', idCommessa } }) }, 'Apri nello storico'),
            scrive() && idCliente ? h('button', { type: 'button', class: 'btn', onclick: () => nuovoMessaggio(idCliente) }, 'Scrivi') : null)]);
      }).catch(e => aggiungi(svuota(zona), [h('div', { class: 'banda calma' }, h('span', { class: 'spazio' }, e.message || String(e)))]));
    }

    function rigaCom(c) {
      const ic = K.iconaCanale(c.canale);
      return riga({ sinistra: quadrato(c.direzione === 'entrata' ? 'entrata' : ic[0], ic[1]), titolo: K.nomeTipo(c) + (c.referente ? ' · ' + c.referente : ''), sotto: [K.nomeCanale(c.canale), quando(c.quando)].join(' · '),
        destra: pillStato(c), onclick: () => { M.storico = null; M.idCliente = ''; M.idCommessa = ''; W.vai('#comunicazioni/storico'); setTimeout(() => apriPannello(c), 400); } });
    }

    return { vista, M, daRileggere, scrivi, promemoriaFattura, nuovoMessaggio, annotaTelefonata, schedaCliente, schedaCommessa, nuove, rileggiNuove, leggiNotifiche, chiudiPannello, apriWhatsapp, chiediMandato };
  };
})(window);
