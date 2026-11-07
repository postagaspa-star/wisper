/*
 * Wisper Ufficio: Portale clienti, la parte dello studio (fase 7, docs/gestionale/fase7.md §0.5, §3.5-3.11, §8, §10.1, §12.3-12.4).
 *
 * Da guardare · Clienti · Pubblicati · Accessi, con in cima a tutto la riga dello stato del portale. I clienti non sono
 * utenti di Wisper: entrano i loro referenti, a cui lo studio dà l'accesso, e vedono solo quello che è pubblicato.
 * I file che arrivano dal portale si trattano come sconosciuti: si scaricano (mai aperti dentro Wisper come pagine),
 * e un file che non è un'immagine chiede conferma prima di aprirsi. Niente indirizzi IP (Google non li passa, §0.4).
 *
 * Qui ci sono anche i pezzi che le altre pagine usano: Pubblica nel portale, Togli dal portale, la pillola Nel portale.
 */
(function (radice) {
  'use strict';

  radice.WisperPortale = function (W) {
    const { S, C, R, B, Rete, Api } = W;
    const K = radice.WisperRegoleComunicazioni;
    const { h, aggiungi, svuota, icona, tondo, iniziali, avviso, lavora, finestra, conferma, apriMenu, campo, segmenti, cerca, riga, quadrato, segnaposto } = B;
    const P = () => W.perm();
    const vede = () => K.Permessi.vedePortale(P());
    const scrive = () => K.Permessi.scrivePortale(P());
    const interfaccia = () => (S.io && S.io.interfaccia) || {};
    const pill = (testo, colore) => h('span', { class: 'pill p-' + (colore || 'grigio') }, testo);
    const quando = iso => K.quando(iso, new Date());
    const qs = o => Object.keys(o).filter(k => o[k] !== '' && o[k] !== null && o[k] !== undefined)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k] === true ? '1' : o[k])).join('&');
    const nomeCliente = id => (W.cliente(id) || { nome: id || '' }).nome;

    const M = { portale: null, clienti: null, cliente: {}, pubblicati: null, filtroPub: 'tutti', nonVisti: false, accessi: null, filtroAcc: 'tutti', idClienteAcc: '', caricamenti: null, file: null, aperti: {} };
    function daRileggere() { M.portale = null; M.clienti = null; M.cliente = {}; M.pubblicati = null; M.accessi = null; M.caricamenti = null; }

    function conDati(contenitore, prepara, disegna) {
      const zona = h('div', { class: 'sezione' }, segnaposto(3, 70));
      aggiungi(contenitore, [zona]);
      prepara().then(() => { zona.remove(); disegna(); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.disegnaPagina() }, 'Riprova'))]);
      });
    }

    async function leggiPortale() { M.portale = await Rete.get('/server/portale'); }

    // ===================================================================== la pagina

    function vista(pagina, a1, a2, filtro) {
      const f = filtro || {};
      if (f.idCliente !== undefined && (a1 === 'accessi')) { M.idClienteAcc = f.idCliente || ''; M.accessi = null; }
      if (a1 === 'cliente' && a2) return paginaCliente(pagina, a2);
      const seg = ['clienti', 'pubblicati', 'accessi'].indexOf(a1) >= 0 ? a1 : 'daguardare';
      const giallo = seg === 'clienti' && scrive() ? h('button', { type: 'button', class: 'btn giallo', 'data-giallo-pagina': '1', onclick: () => apriAUnCliente() }, icona('piu', 18, 2.6), 'Apri il portale a un cliente') : null;
      const zonaStato = h('div');
      aggiungi(pagina, [h('div', { class: 'testata alta' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Portale clienti'), h('h1', null, 'Portale clienti')), giallo),
        zonaStato,
        segmenti([['daguardare', 'Da guardare'], ['clienti', 'Clienti'], ['pubblicati', 'Pubblicati'], ['accessi', 'Accessi']], seg, x => W.vai(x === 'daguardare' ? '#portale' : '#portale/' + x))]);
      // La riga dello stato sta in cima a tutti i segmenti (§12.3): si legge una volta.
      const statoPronto = M.portale ? Promise.resolve() : leggiPortale();
      statoPronto.then(() => aggiungi(svuota(zonaStato), [rigaStato(M.portale.stato)])).catch(() => null);
      if (seg === 'clienti') paginaClienti(pagina);
      else if (seg === 'pubblicati') paginaPubblicati(pagina);
      else if (seg === 'accessi') paginaAccessi(pagina);
      else paginaDaGuardare(pagina, a1 === 'file' ? a2 : null, statoPronto);
    }

    /** "Portale Collegato · studiogm-portale.netlify.app"; Non collegato con dove si fa; Spento (§0.5, §12.3). */
    function rigaStato(stato) {
      const s = K.statoPortale(stato);
      const amm = K.Permessi.impostazioniPortale(P());
      return h('div', { class: 'stato-portale' }, icona('globo', 18, 2.2), h('b', null, 'Portale'), pill(s.parola, s.colore),
        s.nonCollegato && W.puo('amministrazione') ? h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.vai('#amministrazione/portale') }, s.dopo)
          : h('span', { class: 'secondario' }, s.dopo),
        s.spento && amm ? h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.vai('#amministrazione/portale') }, 'Riaccendi') : null);
    }

    function gialloPagina(spento) {
      document.querySelectorAll('[data-giallo-pagina]').forEach(b => b.classList.toggle('giallo', !spento));
    }

    // ===================================================================== Da guardare

    function paginaDaGuardare(pagina, apriFile, statoPronto) {
      conDati(pagina, () => statoPronto, () => {
        const lista = (M.portale && M.portale.daGuardare) || [];
        if (!lista.length) aggiungi(pagina, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente da guardare')]);
        else aggiungi(pagina, [h('div', { class: 'proposte stretta-900' }, lista.map(cartaDaGuardare))]);
        if (apriFile) apriCaricamento(apriFile);
        else if (M.file) disegnaFile();
      });
    }

    function cartaDaGuardare(x) {
      const s = K.schedaDaGuardare(x);
      const sel = M.file && x.collegamento && x.collegamento.pagina === 'caricamento' && String(x.collegamento.id) === String(M.file.id);
      return h('div', { class: 'carta-msg' + (s.urgente ? ' urgente' : '') + (sel ? ' scelta' : ''), 'data-dg': x.id },
        h('button', { type: 'button', class: 'testa-proposta', onclick: () => apriDaGuardare(x) }, quadrato(s.icona, s.colore),
          h('span', { class: 'corpo' }, h('span', { class: 'etichetta' }, s.nome), h('span', { class: 't1' }, s.titolo), h('span', { class: 't2' }, x.dettaglio || '')),
          h('span', { class: 'freccia' }, icona('freccia', 18, 2.2))),
        h('span', { class: 'piede-proposta' }, s.urgente ? pill('Urgente', 'rosso') : h('span', { class: 'secondario piccolo-14' }, quando(x.quando)),
          scrive() ? h('button', { type: 'button', class: 'btn collegamento', onclick: () => segnaVisto(x) }, 'Visto') : null));
    }

    async function segnaVisto(x) {
      const r = await lavora('Un momento', () => Rete.post('/server/segnaVistoPortale', { id: x.id }));
      if (!r) return;
      M.portale = null;
      W.caricaDashboard();
      W.disegnaPagina();
    }

    /** La cosa scelta a destra: il file col suo foglio come pannello, il ticket come pannello, il resto la sua pagina. */
    function apriDaGuardare(x) {
      const c = x.collegamento || {};
      if (c.pagina === 'caricamento') { apriCaricamento(c.id); return; }
      if (c.pagina === 'ticket' && W.Ticket && W.puo('ticket')) { chiudiFile(true); W.Ticket.apriPannello(c.id); return; }
      W.vaiA(c);
    }

    // ===================================================================== il file dal cliente (§3.11, §12.3)

    async function leggiCaricamenti() { M.caricamenti = (await Rete.get('/server/caricamentiPortale')).caricamenti || []; }

    async function apriCaricamento(id) {
      if (!M.caricamenti || !M.caricamenti.some(x => String(x.id) === String(id))) { const ok = await lavora('Apro il file', leggiCaricamenti); if (ok === undefined && !M.caricamenti) return; }
      const x = (M.caricamenti || []).find(y => String(y.id) === String(id));
      if (!x) { avviso('Il file non c\'è più', true); return; }
      if (W.Ticket) W.Ticket.chiudiPannello(true);
      M.file = Object.assign({}, x);
      disegnaFile();
    }

    function chiudiFile(subito) {
      const p = document.querySelector('.pannello-file');
      M.file = null;
      gialloPagina(false);
      document.querySelectorAll('.carta-msg.scelta').forEach(x => x.classList.remove('scelta'));
      if (!p) return;
      if (subito) { p.remove(); return; }
      p.classList.add('via');
      setTimeout(() => p.remove(), 200);
    }

    const idFileDi = x => x.idFile || (x.file && x.file.id) || '';
    const idClienteDi = x => x.idCliente || ((S.ana.clienti.find(c => c.nome === x.cliente) || {}).id) || '';

    /** Scarica (mai aperto dentro Wisper): un'immagine si guarda; il resto chiede conferma la prima volta (§3.11). */
    async function scaricaFile(x) {
      const id = idFileDi(x);
      if (!id) return;
      if (!K.fileImmagine(x.nome) && !M.aperti[id]) {
        if (!(await conferma('Aprire il file?', K.domandaFile(x.cliente), 'Apri'))) return;
        M.aperti[id] = true;
      }
      if (S.esempio) { avviso('Nei dati di esempio i file non si aprono'); return; }
      await lavora('Scarico il file', () => Api.post('/locale/apri-documento', { id, nome: x.nome }));
    }

    function disegnaFile() {
      const x = M.file;
      const vecchio = document.querySelector('.pannello-file');
      if (!x) { if (vecchio) vecchio.remove(); return; }
      document.querySelectorAll('[data-dg]').forEach(el => el.classList.remove('scelta'));
      const idCli = idClienteDi(x);
      const decide = x.stato === 'da_guardare' && K.Permessi.accettaFile(P());
      const id = idFileDi(x);
      const st = { da_guardare: ['Da guardare', 'giallo'], accettato: ['Accettato', 'verde'], rifiutato: ['Rifiutato', 'rosso'] }[x.stato] || [x.stato, 'grigio'];
      x.scelte = x.scelte || { idCategoria: null, idCommessa: '', idSede: null, titolo: x.titolo || String(x.nome || '').replace(/\.[^.]+$/, '') };
      const titolo = h('input', { type: 'text', value: x.scelte.titolo });
      titolo.addEventListener('input', () => { x.scelte.titolo = titolo.value; });
      const zonaScelte = h('div', { class: 'fila' });
      const disegnaScelte = () => {
        const cat = (M.categorie || []);
        const commesse = S.ana.commesse.filter(m => m.idCliente === idCli && !m.archiviata && !m.modello && m.stato !== 'CHIUSA');
        const sedi = S.ana.sedi.filter(s => s.idSoggetto === idCli && !s.archiviata);
        const pillole = (lista, chiave, nome, valore) => h('div', { class: 'pillole' }, lista.map(o => h('button', { type: 'button', class: 'pillola' + (String(x.scelte[chiave]) === String(valore(o)) ? ' scelta' : ''),
          onclick: () => { x.scelte[chiave] = String(x.scelte[chiave]) === String(valore(o)) ? (chiave === 'idCommessa' ? '' : null) : valore(o); disegnaScelte(); } }, nome(o))));
        aggiungi(svuota(zonaScelte), [campo('Titolo', titolo),
          h('div', { class: 'campo' }, h('label', null, 'Categoria'), cat.length ? pillole(cat, 'idCategoria', c => c.nome, c => c.id) : h('span', { class: 'secondario' }, 'Nessuna categoria dei documenti')),
          commesse.length ? h('div', { class: 'campo' }, h('label', null, 'Commessa'), pillole(commesse, 'idCommessa', m => m.id + ' · ' + m.descrizione, m => m.id)) : null,
          sedi.length ? h('div', { class: 'campo' }, h('label', null, 'Impianto'), pillole(sedi, 'idSede', s => s.nome, s => s.id)) : null]);
      };
      if (decide) {
        if (!M.categorie) Rete.get('/server/categorieDocumenti').then(r => { M.categorie = (r.categorie || []).filter(c => !c.archiviata && c.vede !== 'riservati'); disegnaScelte(); }).catch(() => { M.categorie = []; disegnaScelte(); });
        disegnaScelte();
      }
      const corpo = h('div', { class: 'corpo' },
        h('div', { class: 'alto' }, h('span', { class: 'etichetta-pannello' }, 'File dal cliente'), h('span', { class: 'spazio' }), tondo('chiudi', 'Chiudi', () => chiudiFile(), 'piccolo')),
        h('div', { class: 'pillole-testa' }, pill(st[0], st[1]), x.ticket ? pill('Richiesta ' + (x.ticket.numero || x.ticket.etichetta || x.ticket), 'blu') : null),
        h('h2', { class: 'titolo-pannello' }, x.nome),
        h('span', { class: 'sotto-titolo' }, [x.referente, x.cliente, quando(x.creato), K.grandezza(x.byte)].filter(Boolean).join(' · ')),
        x.titolo || x.nota ? h('div', { class: 'scheda testo-cliente' }, x.titolo ? h('b', null, x.titolo) : null, x.nota ? h('div', null, x.nota) : null) : null,
        x.stato === 'rifiutato' && x.motivo ? h('div', { class: 'banda calma' }, h('span', { class: 'spazio' }, 'Rifiutato: ' + x.motivo)) : null,
        id && K.fileImmagine(x.nome) ? h('img', { class: 'anteprima-file', src: '/file/' + id, alt: x.nome }) : null,
        h('div', { class: 'pillole-testa' }, id ? h('button', { type: 'button', class: 'btn', onclick: () => scaricaFile(x) }, icona('scarica', 18, 2.2), 'Scarica') : [h('button', { type: 'button', class: 'btn', disabled: true }, 'Scarica'), pill('Non collegato')]),
        decide ? zonaScelte : null);
      const piede = [];
      if (decide) {
        piede.push(h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: () => rifiutaFile(x) }, 'Rifiuta'));
        if (x.ticket) piede.push(h('button', { type: 'button', class: 'btn grande', onclick: () => accettaFile(x, true) }, 'Solo nel ticket'));
        piede.push(h('button', { type: 'button', class: 'btn grande giallo', onclick: () => accettaFile(x, false) }, 'Accetta e archivia'));
      }
      const p = h('aside', { class: 'pannello pannello-file', 'aria-label': 'Il file ' + x.nome }, corpo, piede.length ? h('div', { class: 'piede' }, piede) : null);
      gialloPagina(true);
      if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi(B.$('#sovrapposti'), [p]);
    }

    async function accettaFile(x, soloTicket) {
      const s = x.scelte || {};
      if (!soloTicket && !s.idCategoria) { avviso('Scegli la categoria', true); return; }
      const corpo = soloTicket ? { id: x.id, soloTicket: true } : { id: x.id, titolo: (s.titolo || '').trim() || undefined, idCategoria: s.idCategoria, idCommessa: s.idCommessa || undefined, idSede: s.idSede || undefined,
        idTicket: x.ticket && x.ticket.id ? x.ticket.id : undefined };
      const r = await lavora('Archivio il file', () => Rete.post('/server/accettaCaricamento', corpo));
      if (!r) return;
      avviso(soloTicket ? 'Resta fra le foto del ticket' : 'Archiviato fra i documenti', false, null, r.documento && r.documento.id && W.puo('documenti') ? { testo: 'Apri', fn: () => W.vai('#documenti/doc/' + r.documento.id) } : null);
      dopoFile();
    }

    function rifiutaFile(x) {
      const motivo = h('input', { type: 'text' });
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, x.nome + ' · ' + (x.cliente || '')), campo('Motivo', motivo, errore)]);
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'Rifiutare il file?', corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Lascia stare'),
          h('button', { type: 'button', class: 'btn grande pericolo', onclick: async () => {
            if (!motivo.value.trim()) { errore = 'Scrivi il motivo: lo vede il cliente'; disegna(); motivo.focus(); return; }
            const r = await lavora('Un momento', () => Rete.post('/server/rifiutaCaricamento', { id: x.id, motivo: motivo.value.trim() }));
            if (!r) return;
            chiudi();
            avviso('File rifiutato: il cliente vede il motivo');
            dopoFile();
          } }, 'Rifiuta')] });
    }

    function dopoFile() {
      chiudiFile(true);
      M.portale = null; M.caricamenti = null; M.cliente = {}; M.clienti = null;
      W.caricaDashboard();
      W.disegnaPagina();
    }

    // ===================================================================== Clienti (§12.4)

    /** I clienti col portale (o con qualcuno che ha l'accesso), coi numeri di ognuno da portaleCliente. */
    async function leggiClienti() {
      const conPortale = S.ana.clienti.filter(c => !c.archiviato && (c.portale || S.ana.referenti.some(r => r.idSoggetto === c.id && (r.portale || r.statoPortale === 'Tolto'))));
      const risposte = await Promise.all(conPortale.slice(0, 40).map(c => leggiCliente(c.id).then(() => M.cliente[c.id]).catch(() => null)));
      M.clienti = risposte.filter(Boolean);
    }
    async function leggiCliente(id) { M.cliente[id] = await Rete.get('/server/portaleCliente?idCliente=' + encodeURIComponent(id)); }

    function paginaClienti(pagina) {
      conDati(pagina, () => (M.clienti ? Promise.resolve() : leggiClienti()), () => {
        if (!M.clienti.length) { aggiungi(pagina, [h('div', { class: 'calmo' }, icona('globo', 20, 2.2), 'Nessun cliente ha ancora il portale')]); return; }
        const col = 'minmax(0, 1.6fr) 110px 110px minmax(0, 1fr) 110px 110px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Cliente'), h('span', null, 'Stato'), h('span', { class: 'n' }, 'Referenti'),
          h('span', null, 'Ultimo accesso'), h('span', { class: 'n' }, 'Pubblicati'), h('span', { class: 'n' }, 'Non visti')));
        M.clienti.forEach(r => {
          const refs = (r.referenti || []).filter(x => x.portale);
          const ultimo = refs.map(x => x.ultimoAccesso).filter(Boolean).sort().pop();
          const pub = r.pubblicati || [];
          aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', onclick: () => W.vai('#portale/cliente/' + encodeURIComponent(r.cliente.id)) },
            h('span', { class: 'nome-cella' }, iniziali(r.cliente.nome, true), h('b', { class: 'taglia' }, r.cliente.nome)),
            h('span', null, r.cliente.portale ? pill('Acceso', 'verde') : pill('Spento')),
            h('span', { class: 'n' }, String(refs.length)),
            h('span', { class: 't2' }, ultimo ? quando(ultimo) : '—'),
            h('span', { class: 'n' }, String(pub.length)),
            h('span', { class: 'n' }, String(pub.filter(p => !p.vistoIl).length)))]);
        });
        aggiungi(pagina, [tab]);
      });
    }

    function apriAUnCliente() {
      const clienti = S.ana.clienti.filter(c => !c.archiviato && !c.portale).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
      let scelto = '';
      let chiudi;
      chiudi = finestra({ titolo: 'Apri il portale a un cliente', corpo: campo('Cliente', B.selezione([['', 'Scegli il cliente']].concat(clienti.map(c => [c.id, c.nome])), '', v => { scelto = v; })), fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: () => { if (!scelto) { avviso('Scegli il cliente', true); return; } chiudi(); invita(scelto); } }, 'Avanti')] });
    }

    // ===================================================================== il cliente nel portale (§12.3-12.4)

    function paginaCliente(pagina, id) {
      const idc = decodeURIComponent(id);
      conDati(pagina, () => (M.cliente[idc] ? Promise.resolve() : leggiCliente(idc)), () => {
        const r = M.cliente[idc];
        const c = r.cliente || { id: idc, nome: nomeCliente(idc) };
        const sediCli = S.ana.sedi.filter(s => s.idSoggetto === idc);
        const altro = h('button', { type: 'button', class: 'tondo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 20));
        altro.addEventListener('click', () => apriMenu(altro, [
          { testo: 'Vedi come lo vede il cliente', fn: () => anteprima(r) },
          scrive() && c.portale ? { testo: 'Spegni il portale per questo cliente', fn: () => accendi(c, false), pericolo: true } : null,
          W.puo('comunicazioni') ? { testo: 'Comunicazioni del cliente', fn: () => W.vaiA({ pagina: 'comunicazioni', filtro: { segmento: 'storico', idCliente: idc } }) } : null,
        ]));
        const giallo = scrive() && c.portale ? h('button', { type: 'button', class: 'btn giallo', 'data-giallo-pagina': '1', onclick: () => invita(idc) }, 'Invita un referente') : null;
        const zonaStato = h('div');
        if (M.portale) aggiungi(zonaStato, [rigaStato(M.portale.stato)]); else leggiPortale().then(() => aggiungi(zonaStato, [rigaStato(M.portale.stato)])).catch(() => null);
        const chiEntra = (r.referenti || []).filter(x => x.portale || x.statoVisto === 'Tolto');
        const pubblicati = r.pubblicati || [];
        const regole = Object.assign({ preventivi: true, contratti: true, rapportiniFirmati: true, rapportiniDaFirmare: false, fatture: false, richieste: 'portale' }, c.regole || {});
        const regola = (nome, k) => interruttore(nome, '', !!regole[k], v => salvaCliente(idc, { regole: Object.assign({}, regole, { [k]: v }) }), !scrive());
        aggiungi(pagina, [
          h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna ai clienti del portale', () => W.vai('#portale/clienti')), h('span', { class: 'dove' }, 'Portale clienti › Clienti')),
          h('div', { class: 'testata' }, h('div', { class: 'testa-soggetto' }, iniziali(c.nome, false, 'grande'), h('div', { class: 'titoli' }, h('h1', { class: 'titolo-scheda' }, c.nome),
            h('div', { class: 'pillole-testa' }, c.portale ? pill('Acceso', 'verde') : pill('Spento'), h('span', { class: 'sotto-titolo' }, chiEntra.filter(x => x.portale).length + ' con l\'accesso')))),
            h('div', { class: 'azioni-testa' }, altro, giallo)),
          zonaStato,
          h('div', { class: 'due-colonne' },
            h('div', { class: 'sezione' },
              h('div', { class: 'scheda righe' }, interruttore('Portale acceso', c.portale ? 'I referenti qui sotto possono entrare' : 'Nessuno di ' + c.nome + ' può entrare', !!c.portale, v => accendi(c, v), !scrive())),
              h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, 'Chi entra'), chiEntra.length ? h('div', { class: 'scheda righe' }, chiEntra.map(x => riga({
                sinistra: iniziali(x.nome, true), titolo: x.nome + (x.ruolo ? ' · ' + x.ruolo : ''), sotto: [x.email, K.testoPermessi(x, sediCli)].filter(Boolean).join(' · '),
                destra: h('span', { class: 'pillole-destra' }, pill(x.statoVisto, K.coloreReferente(x.statoVisto)), x.ultimoAccesso ? h('span', { class: 'secondario piccolo-14' }, 'ultimo accesso ' + quando(x.ultimoAccesso)) : null),
                onclick: x.portale ? () => accessoReferente(idc, x) : null, freccia: !!x.portale,
              }))) : h('p', { class: 'vuoto sinistra' }, 'Nessuno entra ancora.')),
              h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, 'Cosa si pubblica da solo'), h('div', { class: 'scheda righe' },
                regola('Preventivi quando partono', 'preventivi'), regola('Contratti quando si attivano', 'contratti'),
                // 06/11/2026: i rapportini non si firmano più; la regola di sempre ("firmati") vale per i rapportini mandati.
                regola('Rapportini inviati', 'rapportiniFirmati'), regola('Fatture emesse', 'fatture'),
                h('div', { class: 'riga riga-int' }, h('span', { class: 'corpo' }, h('span', { class: 't1' }, 'Richieste')),
                  segmenti([['portale', 'Solo dal portale'], ['tutte', 'Tutte']], regole.richieste, v => { if (scrive() && v !== regole.richieste) salvaCliente(idc, { regole: Object.assign({}, regole, { richieste: v }) }); }, 'piccoli')),
                interruttore('Importi nei rapportini', '', !!c.importi, v => salvaCliente(idc, { importi: v }), !scrive())),
                scrive() ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => pubblicaPrima(idc) }, 'Pubblica anche quelli di prima')) : null)),
            h('div', { class: 'sezione' },
              h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, 'Pubblicati · ' + pubblicati.length), pubblicati.length ? h('div', { class: 'scheda righe' }, pubblicati.map(p => rigaPubblicato(p, false))) : h('p', { class: 'vuoto sinistra' }, 'Niente pubblicato.')),
              h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, 'Arrivati dal cliente'), (r.caricamenti || []).length ? h('div', { class: 'scheda righe' }, r.caricamenti.map(x => riga({
                sinistra: quadrato('importa'), titolo: x.nome, sotto: [x.referente, quando(x.creato), K.grandezza(x.byte)].filter(Boolean).join(' · '),
                destra: x.stato === 'da_guardare' ? pill('Da guardare', 'giallo') : x.stato === 'accettato' ? pill('Accettato', 'verde') : pill('Rifiutato', 'rosso'),
                // Il file si rilegge da caricamentiPortale, che ha anche il file da scaricare, la nota e il cliente.
                onclick: () => { M.caricamenti = null; apriCaricamento(x.id); },
              }))) : h('p', { class: 'vuoto sinistra' }, 'Nessun file.')),
              h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, 'Accessi recenti'), (r.accessi || []).length ? h('div', { class: 'scheda righe' }, r.accessi.slice(0, 5).map(rigaAccesso)) : h('p', { class: 'vuoto sinistra' }, 'Nessun accesso.'),
                (r.accessi || []).length ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => W.vaiA({ pagina: 'portale', filtro: { segmento: 'accessi', idCliente: idc } }) }, 'Tutti')) : null)))]);
        if (M.file) disegnaFile();
      });
    }

    /** L'interruttore (§12.3): una riga col nome e il pulsante acceso o spento. */
    function interruttore(nome, sotto, acceso, cambia, spento) {
      const b = h('button', { type: 'button', class: 'interruttore' + (acceso ? ' acceso' : ''), role: 'switch', 'aria-checked': acceso ? 'true' : 'false', 'aria-label': nome, disabled: !!spento,
        onclick: () => { if (!spento) cambia(!acceso); } }, h('i'));
      return h('div', { class: 'riga riga-int' }, h('span', { class: 'corpo' }, h('span', { class: 't1' }, nome), sotto ? h('span', { class: 't2' }, sotto) : null), b);
    }

    async function salvaCliente(idc, cambi) {
      const r = await lavora('Salvo', () => Rete.post('/server/salvaPortaleCliente', Object.assign({ idCliente: idc }, cambi)));
      if (!r) return;
      // Risponde come portaleCliente (§10.1): si tiene quella; se no si rilegge.
      M.cliente[idc] = r.cliente ? r : null;
      M.clienti = null;
      avviso('Salvato');
      W.disegnaPagina();
    }

    async function accendi(c, si) {
      if (!si && !(await conferma('Spegnere il portale di ' + c.nome + '?', 'Chi di ' + c.nome + ' è dentro esce subito. Quello che è pubblicato resta: riaccendendolo si ritrova tutto.', 'Spegni', true))) return;
      const r = await lavora(si ? 'Accendo il portale' : 'Spengo il portale', () => Rete.post('/server/salvaPortaleCliente', { idCliente: c.id, portale: !!si }));
      if (!r) return;
      M.cliente[c.id] = r.cliente ? r : null;
      M.clienti = null;
      await W.ricaricaAnagrafiche().catch(() => null);
      avviso(si ? 'Portale acceso per ' + c.nome : 'Portale spento per ' + c.nome);
      W.disegnaPagina();
    }

    async function anteprima(r) {
      const refs = (r.referenti || []).filter(x => x.portale);
      if (!refs.length) { avviso('Nessun referente ha l\'accesso: invitane uno prima', true); return; }
      const fai = async x => {
        const ris = await lavora('Preparo l\'anteprima', () => Rete.post('/server/anteprimaPortale', { idReferente: x.id }));
        if (!ris || !ris.link) return;
        await lavora('Apro il browser', () => Api.post('/locale/apri-collegamento', { url: ris.link }));
      };
      if (refs.length === 1) { fai(refs[0]); return; }
      let chiudi;
      chiudi = finestra({ titolo: 'Vedi come lo vede il cliente', corpo: h('div', { class: 'scheda righe' }, refs.map(x => riga({ sinistra: iniziali(x.nome, true), titolo: x.nome, sotto: x.email, onclick: () => { chiudi(); fai(x); } }))), fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla')] });
    }

    /** "Accesso di Sig. Ferretti" (§12.3): i cinque tipi, le sedi, gli avvisi, Rimanda l'invito, Togli l'accesso, Salva. */
    function accessoReferente(idc, x) {
      const sediCli = S.ana.sedi.filter(s => s.idSoggetto === idc && !s.archiviata);
      const st = { permessi: Object.assign(K.permessiBase(false), x.permessi || {}), sedi: Array.isArray(x.sedi) ? x.sedi.slice() : null, avvisi: x.avvisiEmail !== false };
      const sola = !scrive();
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'secondario' }, [x.email, x.ultimoAccesso ? 'ultimo accesso ' + quando(x.ultimoAccesso) : 'non è ancora entrato'].filter(Boolean).join(' · ')),
        sceltePermessi(st, sola, disegna), sceltaSedi(st, sediCli, sola, disegna),
        h('div', { class: 'campo' }, h('label', null, 'Avvisi per email'), segmenti([['si', 'Sì'], ['no', 'No']], st.avvisi ? 'si' : 'no', v => { if (!sola) { st.avvisi = v === 'si'; disegna(); } }, 'piccoli'))]);
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'Accesso di ' + x.nome, corpo: zona, larghezza: 'media', fuoco: false,
        pulsanti: sola ? ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] : [
          h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: async () => {
            if (!(await conferma('Togliere l\'accesso a ' + x.nome + '?', 'Esce subito dal portale e i suoi link non valgono più. Resta fra i referenti di ' + nomeCliente(idc) + '.', 'Togli l\'accesso', true))) return;
            const r = await lavora('Tolgo l\'accesso', () => Rete.post('/server/togliAccessoReferente', { idReferente: x.id }));
            if (r) { chiudi(); M.cliente[idc] = null; M.clienti = null; W.ricaricaAnagrafiche().catch(() => null); avviso('Accesso tolto'); W.disegnaPagina(); }
          } }, 'Togli l\'accesso'), 'spazio',
          h('button', { type: 'button', class: 'btn grande', onclick: async () => {
            const r = await lavora('Rimando l\'invito', () => Rete.post('/server/invitaReferente', { idReferente: x.id, permessi: st.permessi, sedi: st.sedi }));
            if (r) avviso(r.email === 'domani' ? 'Le email del portale sono ferme: l\'invito parte domani' : 'Invito rimandato a ' + x.email);
          } }, 'Rimanda l\'invito'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
            const r = await lavora('Salvo l\'accesso', () => Rete.post('/server/salvaAccessoReferente', { idReferente: x.id, permessi: st.permessi, sedi: st.sedi, avvisiEmail: st.avvisi }));
            if (r) { chiudi(); M.cliente[idc] = null; avviso('Accesso salvato: vale subito'); W.disegnaPagina(); }
          } }, 'Salva')] });
    }

    /** I cinque tipi coi segmenti No · Vede · Accetta/Firma/Manda file/Apre (fatture solo No · Vede). */
    function sceltePermessi(st, sola, ridisegna) {
      return h('div', { class: 'campo' }, h('label', null, 'Cosa può fare'), h('div', { class: 'scheda righe permessi-portale' }, K.TIPI_PERMESSI.map(([k, nome, due]) => h('div', { class: 'riga riga-int' },
        h('span', { class: 'corpo' }, h('span', { class: 't1' }, nome)),
        segmenti([[0, 'No'], [1, 'Vede']].concat(due ? [[2, due]] : []), Number(st.permessi[k]) || 0, v => { if (!sola) { st.permessi[k] = Number(v); ridisegna(); } }, 'piccoli')))));
    }
    function sceltaSedi(st, sediCli, sola, ridisegna) {
      if (!sediCli.length) return null;
      return h('div', { class: 'campo' }, h('label', null, 'Sedi'),
        segmenti([['tutte', 'Tutte'], ['solo', 'Solo queste']], st.sedi ? 'solo' : 'tutte', v => { if (!sola) { st.sedi = v === 'solo' ? (st.sedi || []) : null; ridisegna(); } }, 'piccoli'),
        st.sedi ? h('div', { class: 'pillole' }, sediCli.map(s => h('button', { type: 'button', class: 'pillola' + (st.sedi.indexOf(s.id) >= 0 ? ' scelta' : ''), disabled: sola,
          onclick: () => { const i = st.sedi.indexOf(s.id); if (i >= 0) st.sedi.splice(i, 1); else st.sedi.push(s.id); ridisegna(); } }, s.nome))) : null);
    }

    /** "Invita un referente" (§12.3): chi, cosa può fare, sedi, a quale email parte; non collegato al posto del giallo. */
    async function invita(idc) {
      if (!M.cliente[idc]) { const ok = await lavora('Leggo il cliente', () => leggiCliente(idc)); if (ok === undefined && !M.cliente[idc]) return; }
      const r = M.cliente[idc] || {};
      const c = W.cliente(idc) || { id: idc, nome: nomeCliente(idc) };
      // Non collegato = manca l'indirizzo del portale (§3.2, §10): invitare non si può. "Non si raggiunge" invece lascia invitare.
      if (!M.portale && vede()) { try { await leggiPortale(); } catch (e) { /* lo dirà il server */ } }
      const nonCollegato = M.portale && M.portale.stato ? M.portale.stato.collegato === 'non_collegato' : !S.ana.impostazioni.PORTALE_INDIRIZZO;
      const candidati = (r.referenti || S.ana.referenti.filter(x => x.idSoggetto === idc)).filter(x => x.email && !x.portale);
      const privato = !candidati.length && !(r.referenti || []).length && c.email;
      const sediCli = S.ana.sedi.filter(s => s.idSoggetto === idc && !s.archiviata);
      const st = { scelto: candidati.length === 1 ? candidati[0].id : privato ? 'cliente' : null, permessi: K.permessiBase(!!privato || !c.partitaIva), sedi: null };
      const zona = h('div', { class: 'fila' });
      const email = () => st.scelto === 'cliente' ? c.email : ((candidati.find(x => String(x.id) === String(st.scelto)) || {}).email || '');
      const disegna = () => aggiungi(svuota(zona), [
        h('div', { class: 'campo' }, h('label', null, 'Chi'), h('div', { class: 'pillole' },
          candidati.map(x => h('button', { type: 'button', class: 'pillola' + (String(st.scelto) === String(x.id) ? ' scelta' : ''), onclick: () => { st.scelto = x.id; disegna(); } }, x.nome + (x.ruolo ? ' · ' + x.ruolo : ''))),
          privato ? h('button', { type: 'button', class: 'pillola' + (st.scelto === 'cliente' ? ' scelta' : ''), onclick: () => { st.scelto = 'cliente'; disegna(); } }, c.nome + ' · Cliente privato') : null,
          W.puo('clienti', 2) && W.Clienti ? h('button', { type: 'button', class: 'pillola tratteggiata', onclick: () => { chiudi(); W.vai('#clienti/' + encodeURIComponent(idc)); S.schedaSoggetto[idc] = 'referenti'; } }, '+ Nuovo referente') : null),
          !candidati.length && !privato ? h('span', { class: 'secondario' }, 'Nessun referente con l\'email: aggiungilo in Clienti') : null),
        sceltePermessi(st, false, disegna), sceltaSedi(st, sediCli, false, disegna),
        nonCollegato ? h('div', { class: 'banda calma' }, pill('Non collegato'), h('span', { class: 'spazio' }, 'Prima scegli come portare il portale su internet (Amministrazione)'))
          : email() ? h('div', { class: 'secondario' }, 'L\'email d\'invito parte a ' + email()) : null]);
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'Invita un referente', corpo: zona, larghezza: 'media', fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          nonCollegato ? null : h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
            if (!st.scelto) { avviso('Scegli chi invitare', true); return; }
            const corpo = Object.assign(st.scelto === 'cliente' ? { idCliente: idc } : { idReferente: st.scelto }, { permessi: st.permessi, sedi: st.sedi, manda: true });
            const ris = await lavora('Mando l\'invito', () => Rete.post('/server/invitaReferente', corpo));
            if (!ris) return;
            chiudi();
            M.cliente[idc] = null; M.clienti = null;
            await W.ricaricaAnagrafiche().catch(() => null);
            avviso(ris.email === 'domani' ? 'Le email del portale sono ferme fino a domani: l\'invito parte alle 8:00' : 'Invito mandato a ' + (email() || (ris.referente && ris.referente.email) || ''));
            if (W.percorso().indexOf('portale/cliente/') === 0) W.disegnaPagina(); else W.vai('#portale/cliente/' + encodeURIComponent(idc));
          } }, 'Manda l\'invito')].filter(Boolean) });
    }

    /** Pubblica anche quelli di prima (§8.1): le cose degli ultimi 12 mesi di un tipo, da scegliere. */
    function pubblicaPrima(idc) {
      let tipo = 'preventivo';
      let proposte = null;
      const scelte = new Set();
      const zona = h('div', { class: 'fila' });
      const leggi = async () => {
        proposte = null; scelte.clear(); disegna();
        const r = await lavora('Cerco', () => Rete.post('/server/pubblicaPrima', { idCliente: idc, tipo }));
        proposte = r ? r.proposte || [] : [];
        disegna();
      };
      const disegna = () => aggiungi(svuota(zona), [segmenti([['preventivo', 'Preventivi'], ['contratto', 'Contratti'], ['rapportino', 'Rapportini'], ['fattura', 'Fatture']], tipo, v => { tipo = v; leggi(); }, 'piccoli'),
        proposte === null ? segnaposto(2, 48) : proposte.length ? h('div', { class: 'scheda righe' }, proposte.map(p => {
          const k = String(p.id);
          const casella = h('input', { type: 'checkbox', checked: scelte.has(k), onchange: e => { if (e.target.checked) scelte.add(k); else scelte.delete(k); } });
          return h('label', { class: 'riga' }, casella, h('span', { class: 'corpo' }, h('span', { class: 't1' }, p.titolo || p.etichetta || (K.NOMI_PUBBLICAZIONE[tipo] + ' ' + p.id)), p.data ? h('span', { class: 't2' }, C.data(p.data)) : null));
        })) : h('p', { class: 'vuoto sinistra' }, 'Niente degli ultimi 12 mesi da pubblicare.')]);
      leggi();
      let chiudi;
      chiudi = finestra({ titolo: 'Pubblica anche quelli di prima', corpo: zona, larghezza: 'media', fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
            if (!scelte.size) { avviso('Scegli cosa pubblicare', true); return; }
            let fatte = 0;
            for (const id of scelte) { const r = await lavora('Pubblico', () => Rete.post('/server/pubblica', { tipo, id, prima: true, conferma: true })); if (r) fatte++; }
            chiudi();
            M.cliente[idc] = null; M.clienti = null;
            avviso(fatte === 1 ? 'Pubblicato' : 'Pubblicati: ' + fatte);
            W.disegnaPagina();
          } }, 'Pubblica')] });
    }

    // ===================================================================== Pubblicati e Accessi (§12.3-12.4)

    function rigaPubblicato(p, conCliente) {
      const altro = scrive() ? h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni', onclick: e => { e.stopPropagation(); apriMenu(e.currentTarget, [{ testo: 'Togli dal portale', fn: () => togli(p.id, () => { M.cliente = {}; M.pubblicati = null; M.clienti = null; W.disegnaPagina(); }) }]); } }, icona('altro', 18)) : null;
      const apri = destinazione(p);
      return h('div', { class: 'riga' + (apri ? ' cliccabile-riga' : ''), role: apri ? 'button' : null, tabindex: apri ? '0' : null, onclick: apri ? () => W.vaiA(apri) : null },
        quadrato(K.ICONE_PUBBLICAZIONE[p.tipo] || 'file'),
        h('span', { class: 'corpo' }, h('span', { class: 't1' }, p.titolo), h('span', { class: 't2' }, [conCliente ? p.cliente : '', (p.origine === 'regola' ? 'pubblicato da solo' : 'pubblicato a mano') + ' il ' + C.data(String(p.pubblicataIl || '').slice(0, 10))].filter(Boolean).join(' · ')),
          h('span', { class: 'pillole-testa sotto-riga' }, p.vistoIl ? pill(K.vistoTesto(p.vistoIl) + (p.vistoDa ? ' · ' + p.vistoDa : ''), 'verde') : pill('Non ancora visto', 'giallo'), p.daFirmare && p.tipo !== 'rapportino' ? pill('Da firmare nel portale', 'giallo') : null)),
        altro);
    }

    /** Dove porta una pubblicazione: la cosa vera (serve il suo id interno, "rif", o un collegamento del server). */
    function destinazione(p) {
      if (p.collegamento) return p.collegamento;
      if (p.rif === undefined || p.rif === null || p.rif === '') return null;
      return { pagina: { preventivo: 'preventivo', contratto: 'contratto', rapportino: 'rapportino', fattura: 'fattura', documento: 'documento', ticket: 'ticket' }[p.tipo], id: p.rif };
    }

    async function leggiPubblicati() {
      M.pubblicati = (await Rete.get('/server/pubblicati?' + qs({ tipo: M.filtroPub === 'tutti' ? '' : M.filtroPub, visto: M.nonVisti ? 'false' : '' }))).pubblicati || [];
    }

    function paginaPubblicati(pagina) {
      const zona = h('div', { class: 'sezione' });
      aggiungi(pagina, [h('div', { class: 'filtri' }, h('div', { class: 'pillole' },
        K.FILTRI_PUBBLICATI.map(([k, nome]) => h('button', { type: 'button', class: 'pillola' + (M.filtroPub === k ? ' scelta' : ''), onclick: () => { M.filtroPub = k; M.pubblicati = null; W.disegnaPagina(); } }, nome)),
        h('button', { type: 'button', class: 'pillola' + (M.nonVisti ? ' scelta' : ''), onclick: () => { M.nonVisti = !M.nonVisti; M.pubblicati = null; W.disegnaPagina(); } }, 'Non ancora visti'))), zona]);
      conDati(zona, () => (M.pubblicati ? Promise.resolve() : leggiPubblicati()), () => {
        if (!M.pubblicati.length) { aggiungi(zona, [h('div', { class: 'calmo' }, 'Niente pubblicato')]); return; }
        const col = 'minmax(0, 1.6fr) minmax(0, 1fr) 130px 120px minmax(0, 1fr) 52px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Cosa'), h('span', null, 'Cliente'), h('span', null, 'Pubblicato il'), h('span', null, 'Come'), h('span', null, 'Visto'), h('span')));
        M.pubblicati.forEach(p => {
          const apri = destinazione(p);
          aggiungi(tab, [h('div', { class: 'r' + (apri ? ' cliccabile' : ''), style: { gridTemplateColumns: col }, role: apri ? 'button' : null, tabindex: apri ? '0' : null, onclick: apri ? () => W.vaiA(apri) : null },
            h('span', { class: 'nome-cella' }, quadrato(K.ICONE_PUBBLICAZIONE[p.tipo] || 'file'), h('b', { class: 'taglia' }, p.titolo)),
            h('span', { class: 'taglia' }, p.cliente || ''),
            h('span', { class: 't2' }, C.data(String(p.pubblicataIl || '').slice(0, 10))),
            h('span', { class: 't2' }, p.origine === 'regola' ? 'da solo' : 'a mano'),
            h('span', { class: 'pillole-testa' }, p.vistoIl ? pill(K.vistoTesto(p.vistoIl), 'verde') : pill('Non ancora visto', 'giallo'), p.daFirmare && p.tipo !== 'rapportino' ? pill('Da firmare nel portale', 'giallo') : null),
            scrive() ? h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Togli dal portale', title: 'Togli dal portale', onclick: e => { e.stopPropagation(); togli(p.id, () => { M.pubblicati = null; W.disegnaPagina(); }); } }, icona('chiudi', 16)) : h('span'))]);
        });
        aggiungi(zona, [tab]);
      });
    }

    function rigaAccesso(a) {
      return riga({ sinistra: quadrato(a.esito === 'no' ? 'allarme' : /^Entrat/.test(a.frase || '') ? 'entrata' : 'occhio', a.esito === 'no' ? 'ico-rosso' : 'ico-grigio'),
        titolo: a.frase, sotto: [a.referente, quando(a.quando), a.dispositivo].filter(Boolean).join(' · ') });
    }

    // Il server filtra le pillole col parametro "gruppo" (entrati | azioni | errori); qui si rifiltra uguale, per sicurezza.
    async function leggiAccessi() { M.accessi = (await Rete.get('/server/accessiPortale?' + qs({ idCliente: M.idClienteAcc, gruppo: M.filtroAcc === 'tutti' ? '' : M.filtroAcc }))).accessi || []; }

    function paginaAccessi(pagina) {
      const zona = h('div', { class: 'sezione' });
      aggiungi(pagina, [h('div', { class: 'filtri' }, h('div', { class: 'pillole' }, K.FILTRI_ACCESSI.map(([k, nome]) => h('button', { type: 'button', class: 'pillola' + (M.filtroAcc === k ? ' scelta' : ''), onclick: () => { M.filtroAcc = k; M.accessi = null; W.disegnaPagina(); } }, nome))),
        M.idClienteAcc ? h('span', { class: 'filtro-attivo' }, nomeCliente(M.idClienteAcc), h('button', { type: 'button', 'aria-label': 'Togli il filtro', title: 'Togli il filtro', onclick: () => { M.idClienteAcc = ''; M.accessi = null; W.disegnaPagina(); } }, icona('chiudi', 16, 2.4))) : null), zona]);
      conDati(zona, () => (M.accessi ? Promise.resolve() : leggiAccessi()), () => {
        const lista = K.filtraAccessi(M.accessi, M.filtroAcc);
        if (!lista.length) { aggiungi(zona, [h('div', { class: 'calmo' }, 'Nessun accesso')]); return; }
        // Niente indirizzi IP: Google non li passa allo script del portale (§0.4).
        const col = '140px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.6fr) 150px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Quando'), h('span', null, 'Chi'), h('span', null, 'Cliente'), h('span', null, 'Cosa'), h('span', null, 'Dispositivo')));
        lista.forEach(a => aggiungi(tab, [h('div', { class: 'r' + (a.esito === 'no' ? ' riga-errore' : ''), style: { gridTemplateColumns: col } },
          h('span', { class: 't2' }, quando(a.quando)), h('span', { class: 'forte taglia' }, a.referente || ''), h('span', { class: 'taglia' }, a.cliente || ''),
          h('span', { class: 'taglia' }, a.esito === 'no' ? pill(a.frase, 'rosso') : a.frase), h('span', { class: 't2 taglia' }, a.dispositivo || ''))]));
        aggiungi(zona, [tab]);
      });
    }

    // ===================================================================== per le altre pagine

    /** La pillola "Nel portale · visto il …" (o "Da firmare nel portale"), da { pubblicato, vistoIl, vistoDa, daFirmare } (§8.2). */
    function pillola(portale) {
      const p = portale || {};
      if (!p.pubblicato) return null;
      if (p.daFirmare) return pill('Da firmare nel portale', 'giallo');
      return p.vistoIl ? pill('Nel portale · ' + K.vistoTesto(p.vistoIl).replace(/^Visto/, 'visto') + (p.vistoDa ? ' da ' + p.vistoDa : ''), 'verde') : pill('Nel portale · non ancora visto', 'giallo');
    }

    const puoPubblicare = tipo => K.Permessi.pubblica(P(), K.MODULO_DI[tipo] || tipo);

    /**
     * Pubblica nel portale (§8.2): "Lo vedrà Rossi Impianti Srl: Sig. Ferretti, Anna Rossi"; per un rapportino in bozza
     * "Da firmare nel portale" già scelto; per una fattura "Allega la copia PDF"; Pubblica (giallo).
     */
    async function pubblica(tipo, id, o) {
      const x = o || {};
      // Senza l'indirizzo del portale il server risponde nonCollegato con la sua frase (§10): qui non si decide prima.
      const idc = x.idCliente;
      let vedranno = null;
      if (idc) {
        try { await leggiCliente(idc); } catch (e) { /* lo dice il server */ }
        const r = M.cliente[idc];
        if (r && r.cliente && !r.cliente.portale) { avviso(r.cliente.nome + ' non ha il portale acceso', true); return null; }
        const chiave = { preventivo: 'preventivi', contratto: 'preventivi', rapportino: 'rapportini', fattura: 'fatture', documento: 'documenti', ticket: 'richieste' }[tipo];
        if (r) vedranno = (r.referenti || []).filter(y => y.portale && Number((y.permessi || {})[chiave]) > 0).map(y => y.nome);
      }
      const st = { daFirmare: !!x.daFirmare, allegato: null };
      const zona = h('div', { class: 'fila' });
      const nomeC = x.nomeCliente || nomeCliente(idc);
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, x.titolo || ''),
        vedranno && vedranno.length ? h('p', { class: 'testo-forte' }, 'Lo vedrà ' + nomeC + ': ' + vedranno.join(', '))
          : vedranno ? h('div', { class: 'banda calma' }, h('span', { class: 'spazio' }, 'Nessun referente di ' + nomeC + ' può vedere ' + (K.NOMI_PUBBLICAZIONE[tipo] || 'questa cosa').toLowerCase())) : null,
        x.bozza ? h('div', { class: 'campo' }, h('label', null, 'Come'), segmenti([['si', 'Da firmare nel portale'], ['no', 'Solo da guardare']], st.daFirmare ? 'si' : 'no', v => { st.daFirmare = v === 'si'; disegna(); }, 'piccoli')) : null,
        tipo === 'fattura' ? h('div', { class: 'campo' }, h('label', null, 'Copia di cortesia'), h('div', { class: 'pillole-testa' },
          h('button', { type: 'button', class: 'btn', onclick: async () => {
            const f = await Rete.post('/locale/scegli-file', { filtro: 'pdf' }).catch(() => null);
            if (!f || !f.ok) return;
            if (!/\.pdf$/i.test(f.nome || '')) { avviso('La copia di cortesia è un PDF', true); return; }
            st.allegato = { nome: f.nome, mime: 'application/pdf', base64: f.base64 }; disegna();
          } }, st.allegato ? 'Cambia la copia PDF' : 'Allega la copia PDF'), st.allegato ? h('span', { class: 'secondario' }, st.allegato.nome) : null)) : null]);
      disegna();
      return new Promise(risolvi => {
        let chiudi;
        let fatto = null;
        const manda = async conferma2 => {
          const corpo = { tipo, id, daFirmare: x.bozza ? st.daFirmare : undefined, allegato: st.allegato || undefined, conferma: conferma2 || undefined };
          let r;
          try { r = await lavora('Pubblico nel portale', () => Rete.post('/server/pubblica', corpo).catch(e => { if (e && e.dati && e.dati.serveConferma) return { serveConferma: e.dati.frase || e.message }; throw e; })); } catch (e) { r = null; }
          if (r && r.serveConferma) {
            if (await conferma('Pubblicare lo stesso?', r.serveConferma, 'Pubblica lo stesso')) return manda(true);
            return;
          }
          if (!r) return;
          fatto = r;
          chiudi();
          M.cliente = {}; M.pubblicati = null; M.clienti = null;
          avviso('Pubblicato nel portale' + (r.vedranno && r.vedranno.length ? ': lo vedrà ' + r.vedranno.join(', ') : ''));
        };
        chiudi = finestra({ titolo: 'Pubblica nel portale', corpo: zona, fuoco: false, allaChiusura: () => risolvi(fatto),
          pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
            h('button', { type: 'button', class: 'btn giallo grande', onclick: () => manda(false) }, 'Pubblica')] });
      });
    }

    /**
     * L'id della pubblicazione di una cosa (togliDalPortale vuole quello). Le pagine delle cose lo danno in
     * portale.pubblicazione (§10.4); se manca (risposta vecchia) si cerca fra i pubblicati del cliente, per rif.
     */
    async function trovaIdPubblicazione(chi) {
      if (chi && typeof chi !== 'object') return chi;
      const x = chi || {};
      if (x.id) return x.id;
      try {
        const r = await Rete.get('/server/pubblicati?' + qs({ idCliente: x.idCliente || '', tipo: x.tipo || '' }));
        const p = (r.pubblicati || []).find(y => y.tipo === x.tipo && String(y.rif) === String(x.rif) && !y.toltaIl);
        return p ? p.id : null;
      } catch (e) { return null; }
    }

    /** Togli dal portale (§8.2): subito, senza conferma, con Annulla nell'avviso. */
    async function togli(chi, dopo) {
      const idPubblicazione = await trovaIdPubblicazione(chi);
      if (!idPubblicazione) { avviso('Non trovo la pubblicazione: rileggi la pagina', true); return; }
      const r = await lavora('Tolgo dal portale', () => Rete.post('/server/togliDalPortale', { id: idPubblicazione }));
      if (!r) return;
      M.cliente = {}; M.pubblicati = null; M.clienti = null;
      if (dopo) dopo();
      avviso('Tolto dal portale', false, null, { testo: 'Annulla', fn: async () => { const x = await lavora('Rimetto nel portale', () => Rete.post('/server/togliDalPortale', { id: idPubblicazione, annulla: true })); if (x && dopo) dopo(); } });
    }

    /** La scheda Portale nella scheda del cliente (§12.6): stato, quanti hanno l'accesso, l'ultimo accesso, Apri. */
    function schedaCliente(area, c) {
      if (!vede()) return;
      const refs = S.ana.referenti.filter(r => r.idSoggetto === c.id && r.portale);
      aggiungi(area, [h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, 'Portale'), h('div', { class: 'scheda righe' }, riga({
        sinistra: quadrato('globo', c.portale ? 'ico-verde' : 'ico-grigio'), titolo: c.portale ? 'Acceso' : 'Spento',
        sotto: refs.length ? (refs.length === 1 ? '1 referente con l\'accesso' : refs.length + ' referenti con l\'accesso') : 'Nessun referente con l\'accesso',
        destra: h('span', { class: 'btn collegamento' }, 'Apri'), onclick: () => W.vai('#portale/cliente/' + encodeURIComponent(c.id)),
      })))]);
    }

    function chiudiPannello(subito) { chiudiFile(subito); }

    return { vista, M, daRileggere, pillola, pubblica, togli, puoPubblicare, schedaCliente, chiudiPannello, apriCaricamento, interruttore, rigaStato };
  };
})(window);
