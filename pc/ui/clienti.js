/*
 * Wisper Ufficio: Clienti e fornitori (guida della fase 1, §4).
 *
 * Un'anagrafica sola per clienti e fornitori (uno può essere tutti e due).
 * L'elenco coi segmenti Clienti | Fornitori e la ricerca; la scheda con i dati
 * fiscali in alto, poi referenti, sedi e impianti, commesse; il modulo a gruppi
 * con Controlla per la partita IVA; archiviare invece di cancellare.
 */
(function (radice) {
  'use strict';

  radice.WisperClienti = function (W) {
    const { S, C, R, B, Rete } = W;
    const { h, aggiungi, svuota, icona, tondo, iniziali, pillola, avviso, lavora, finestra, conferma, apriMenu, campo, conSuffisso, segmenti, cerca, riga, quadrato } = B;
    const puo = W.puo;
    const soldi = W.soldi;

    const tariffaDi = c => c.tariffaFissa !== null && c.tariffaFissa !== undefined && c.tariffaFissa !== ''
      ? C.numero(c.tariffaFissa) + ' €/h fissa'
      : 'libera' + (c.ultimaTariffa ? ' · ultima ' + C.numero(c.ultimaTariffa) + ' €/h' : '');
    const aperteDi = c => S.ana.commesse.filter(m => m.idCliente === c.id && m.stato === 'APERTA' && !m.archiviata && !m.modello).length;

    // ===================================================================== elenco

    function vista(pagina) {
      const f = S.filtriSoggetti;
      const n = R.contaSoggetti(S.ana.soggetti);
      const fornitori = f.tipo === 'fornitori';
      const nuovo = puo('clienti', 2) ? (fornitori ? 'Nuovo fornitore' : 'Nuovo cliente') : '';
      const area = h('div', { class: 'sezione' });
      aggiungi(pagina, [
        h('div', { class: 'testata' }, h('h1', { class: 'spazio' }, 'Clienti e fornitori'),
          nuovo ? h('button', { type: 'button', class: 'btn giallo', onclick: () => modulo(null, { cliente: !fornitori, fornitore: fornitori }) }, icona('piu', 18, 2.6), nuovo) : null),
        h('div', { class: 'filtri' },
          segmenti([['clienti', 'Clienti · ' + n.clienti], ['fornitori', 'Fornitori · ' + n.fornitori]], f.tipo, x => { f.tipo = x; f.archiviati = false; W.disegnaPagina(); }),
          cerca(f.testo, 'Nome, città, partita IVA, email', x => { f.testo = x; tabella(area); }),
          f.archiviati ? h('span', { class: 'filtro-attivo' }, 'Archiviati',
            h('button', { type: 'button', 'aria-label': 'Torna agli attivi', onclick: () => { f.archiviati = false; W.disegnaPagina(); } }, icona('chiudi', 14, 2.6))) : null),
        area]);
      tabella(area);
    }

    function tabella(area) {
      svuota(area);
      const f = S.filtriSoggetti;
      const fornitori = f.tipo === 'fornitori';
      const lista = R.filtraSoggetti(S.ana.soggetti, f);
      const n = R.contaSoggetti(S.ana.soggetti);
      const archiviati = fornitori ? n.archiviatiFornitori : n.archiviatiClienti;
      const colonne = '52px minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 1.4fr) 110px';
      if (!lista.length) {
        aggiungi(area, [h('p', { class: 'vuoto' }, f.testo ? 'Nessuno con questa ricerca.' : f.archiviati ? 'Nessuno archiviato.' : fornitori ? 'Ancora nessun fornitore.' : 'Ancora nessun cliente.')]);
      } else {
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } },
          h('span'), h('span', null, 'Nome'), h('span', null, 'Città'), h('span', null, 'Partita IVA'), h('span', null, fornitori ? 'Email' : 'Tariffa'), h('span', { class: 'n' }, 'Commesse')));
        lista.forEach(c => {
          const aperte = aperteDi(c);
          aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: colonne }, role: 'button', tabindex: '0',
            onclick: () => W.vai('#clienti/' + encodeURIComponent(c.id)), onkeydown: e => { if (e.key === 'Enter') W.vai('#clienti/' + encodeURIComponent(c.id)); } },
          iniziali(c.nome, true),
          h('span', { class: 'doppia' }, h('span', null, c.nome, c.collaboratore && puo('collaboratori') ? [' ', pillCollaboratore(c)] : null), c.alias && c.alias.length ? h('span', null, c.alias.join(', ')) : null),
          h('span', { class: 'taglia t2' }, c.citta || '—'),
          h('span', { class: 'taglia t2 num' }, c.partitaIva || '—'),
          h('span', { class: 'taglia t2' }, fornitori ? (c.email || '—') : (soldi() ? tariffaDi(c) : '—')),
          h('span', { class: 'n' }, aperte ? String(aperte) : '—'))]);
        });
        aggiungi(area, [tab]);
      }
      if (!f.archiviati && archiviati) {
        aggiungi(area, [h('div', null, h('button', { type: 'button', class: 'btn collegamento', onclick: () => { f.archiviati = true; W.disegnaPagina(); } }, 'Mostra gli archiviati (' + archiviati + ')'))]);
      }
    }

    /** Fase 6 (§12.8): la pillola Collaboratore sul fornitore che ha la scheda del collaboratore esterno: la apre. */
    function pillCollaboratore(c) {
      return h('button', { type: 'button', class: 'pill p-blu pill-fattura', title: 'Apri la scheda del collaboratore', onclick: e => { e.stopPropagation(); W.vai('#collaboratori/c/' + encodeURIComponent(c.id)); } }, 'Collaboratore');
    }

    // ===================================================================== scheda

    function scheda(pagina, id) {
      const c = W.cliente(id);
      if (!c) { aggiungi(pagina, [h('p', { class: 'vuoto' }, 'Non trovo ' + id + '.')]); return; }
      const referenti = S.ana.referenti.filter(r => r.idSoggetto === c.id).sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
      const sedi = S.ana.sedi.filter(s => s.idSoggetto === c.id && !s.archiviata);
      const commesse = S.ana.commesse.filter(m => m.idCliente === c.id && !m.modello);
      // Fase 5 (§12.5): Documenti · N e Ticket · N (i numeri arrivano dal server mentre la scheda è aperta).
      S.conteFase5 = S.conteFase5 || {};
      const conta = S.conteFase5[c.id] || {};
      const tabs = [['dati', 'Dati'], ['referenti', 'Referenti · ' + referenti.length], ['sedi', 'Sedi e impianti · ' + sedi.length]]
        .concat(c.cliente ? [['commesse', 'Commesse · ' + commesse.filter(m => !m.archiviata).length]] : [])
        .concat(c.cliente && puo('documenti') && W.Archivio ? [['documenti', 'Documenti' + (typeof conta.documenti === 'number' ? ' · ' + conta.documenti : ''), { 'data-conta': 'documenti' }]] : [])
        .concat(c.cliente && puo('ticket') && W.Ticket ? [['ticket', 'Ticket' + (typeof conta.ticket === 'number' ? ' · ' + conta.ticket : ''), { 'data-conta': 'ticket' }]] : []);
      if (c.cliente && W.Archivio && puo('documenti') && conta.documenti === undefined) W.Archivio.quantiDocumenti(c.id).then(n => { if (typeof n !== 'number') return; (S.conteFase5[c.id] = S.conteFase5[c.id] || {}).documenti = n; const b = document.querySelector('[data-conta="documenti"]'); if (b) b.textContent = 'Documenti · ' + n; });
      if (c.cliente && W.Ticket && puo('ticket') && conta.ticket === undefined) W.Ticket.quantiTicket(c.id).then(n => { if (typeof n !== 'number') return; (S.conteFase5[c.id] = S.conteFase5[c.id] || {}).ticket = n; const b = document.querySelector('[data-conta="ticket"]'); if (b) b.textContent = 'Ticket · ' + n; });
      const scelta = S.schedaSoggetto[c.id] && tabs.some(t => t[0] === S.schedaSoggetto[c.id]) ? S.schedaSoggetto[c.id] : 'dati';
      const scrive = puo('clienti', 2);
      const area = h('div', { class: 'sezione stretta-820' });

      const altro = scrive ? h('button', { type: 'button', class: 'tondo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 20)) : null;
      if (altro) {
        altro.addEventListener('click', () => apriMenu(altro, [
          c.archiviato ? { testo: 'Ripristina', fn: () => archivia(c, false) } : { testo: 'Archivia', fn: () => archivia(c, true), pericolo: true },
        ]));
      }
      const contatti = [
        c.telefono ? h('a', { class: 'btn', href: 'tel:' + String(c.telefono).replace(/[^\d+]/g, '') }, icona('telefono', 18, 2.2), 'Chiama') : null,
        c.email ? h('a', { class: 'btn', href: 'mailto:' + c.email }, icona('email', 18, 2.2), 'Email') : null,
      ];
      aggiungi(pagina, [
        h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna a clienti e fornitori', () => W.vai('#clienti')), h('span', { class: 'dove' }, 'Clienti e fornitori')),
        h('div', { class: 'testata' },
          h('div', { class: 'testa-soggetto' }, iniziali(c.nome, false, 'grande'),
            h('div', { class: 'titoli' }, h('h1', { class: 'titolo-scheda' }, c.nome),
              h('div', { class: 'pillole-testa' },
                c.cliente ? pillola('Cliente', 'verde') : null, c.fornitore ? pillola('Fornitore', 'blu') : null,
                c.collaboratore && puo('collaboratori') ? pillCollaboratore(c) : null,
                c.archiviato ? pillola('Archiviato', 'grigio') : null,
                h('span', { class: 'sotto-titolo' }, [c.id, c.citta].filter(Boolean).join(' · '))))),
          h('div', { class: 'azioni-testa' }, contatti, altro,
            scrive ? h('button', { type: 'button', class: 'btn giallo', onclick: () => modulo(c) }, 'Modifica') : null)),
        segmenti(tabs, scelta, x => { S.schedaSoggetto[c.id] = x; W.disegnaPagina(); }),
        area]);

      if (scelta === 'referenti') schedaReferenti(area, c, referenti, scrive);
      else if (scelta === 'sedi') schedaSedi(area, c, sedi, scrive);
      else if (scelta === 'commesse') schedaCommesse(area, c, commesse);
      else if (scelta === 'documenti' && W.Archivio) W.Archivio.schedaDocumenti(area, { idCliente: c.id });
      else if (scelta === 'ticket' && W.Ticket) W.Ticket.schedaTicketCliente(area, c.id);
      else schedaDati(area, c);
    }

    function schedaDati(area, c) {
      const mancaSdi = c.cliente && soldi() && !c.codiceSdi && !c.pec && !c.archiviato;
      if (mancaSdi) aggiungi(area, [h('div', { class: 'riquadro-giallo' }, 'Mancano codice SDI e PEC: serviranno per le fatture.')]);
      const coppie = [
        ['Partita IVA', c.partitaIva], ['Codice fiscale', c.codiceFiscale], ['Codice SDI', c.codiceSdi], ['PEC', c.pec],
        ['Email', c.email], ['Telefono', c.telefono], ['Indirizzo', R.indirizzoCompleto(c)], ['Altri nomi', (c.alias || []).join(', ')],
      ];
      if (c.cliente && soldi()) {
        coppie.push(['Tariffa', tariffaDi(c)]);
        coppie.push(['Viaggio', c.pagaViaggio === true ? 'pagato' : 'non pagato']);
        coppie.push(['Km', c.kmRimborsati === false ? 'non rimborsati' : 'rimborsati']);
        if (c.costoFisso !== null && c.costoFisso !== undefined && c.costoFisso !== '') coppie.push(['Costo orario fisso', C.numero(c.costoFisso) + ' €/h']);
        if (puo('fatturazione')) {
          const auto = c.sostitutoImposta === null || c.sostitutoImposta === undefined;
          coppie.push(['Sostituto d\'imposta', auto ? (c.partitaIva ? 'sì (automatico: ha la partita IVA)' : 'no (automatico: è un privato)') : c.sostitutoImposta ? 'sì' : 'no']);
          const giorni = c.pagamentoGiorni === null || c.pagamentoGiorni === undefined ? (S.ana.impostazioni.GIORNI_PAGAMENTO || 30) : c.pagamentoGiorni;
          const fine = c.pagamentoFineMese === null || c.pagamentoFineMese === undefined ? !!S.ana.impostazioni.PAGAMENTO_FINE_MESE : c.pagamentoFineMese;
          coppie.push(['Pagamento', giorni + ' giorni' + (fine ? ', fine mese' : '')]);
        }
      }
      aggiungi(area, [h('div', { class: 'scheda' }, h('div', { class: 'coppie' },
        coppie.map(x => h('div', { class: 'coppia' }, h('span', { class: 'k' }, x[0]), h('span', { class: 'v' }, x[1] || '—'))))),
      c.note ? h('div', { class: 'scheda' }, h('div', { class: 'etichetta' }, 'Note'), h('div', { class: 'lavoro', style: { marginTop: '8px' } }, c.note)) : null]);
      if (c.cliente && (puo('rapportini') || puo('fatturazione'))) {
        const suoi = W.attivi().filter(r => r.idCliente === c.id);
        const ultimo = C.ordina(suoi, 'data', -1)[0];
        aggiungi(area, [h('div', { class: 'scheda righe' }, riga({
          sinistra: quadrato('rapportini'), titolo: 'Rapportini',
          sotto: suoi.length ? W.nRapportini(suoi.length) + (ultimo ? ' · l\'ultimo il ' + C.data(ultimo.data) : '') : 'Nessun rapportino',
          onclick: () => W.vaiARapportini({ mese: '', cliente: c.id }),
        }))]);
      }
      // Fase 7 (§12.6): il portale del cliente e le sue ultime comunicazioni.
      if (c.cliente && W.Portale) W.Portale.schedaCliente(area, c);
      if (c.cliente && W.Comunicazioni) W.Comunicazioni.schedaCliente(area, c.id);
    }

    function schedaReferenti(area, c, referenti, scrive) {
      // Fase 7 (§12.6): WhatsApp (il Messaggio col modello libero), Email, Chiama; le pillole Accesso al portale, Ha detto sì a WhatsApp, Paga le fatture.
      const scriveMsg = puo('comunicazioni', 2) && W.Comunicazioni;
      const ferma = fn => e => { e.stopPropagation(); fn(); };
      aggiungi(area, [h('div', { class: 'scheda righe' }, referenti.length ? referenti.map(r => riga({
        sinistra: iniziali(r.nome, true),
        titolo: r.nome, sotto: [r.ruolo, r.telefono].filter(Boolean).join(' · ') || r.email || '',
        destra: h('span', { class: 'azioni-referente' },
          h('span', { class: 'pillole-testa' },
            r.portale && puo('portale') ? h('span', { class: 'pill p-' + (radice.WisperRegoleComunicazioni.coloreReferente(r.statoPortale || 'Attivo')) }, r.statoPortale && r.statoPortale !== 'Attivo' ? 'Accesso al portale · ' + r.statoPortale.toLowerCase() : 'Accesso al portale') : null,
            r.whatsappOk ? h('span', { class: 'pill p-verde' }, 'Ha detto sì a WhatsApp') : null,
            r.pagamenti ? h('span', { class: 'pill p-grigio' }, 'Paga le fatture') : null),
          scriveMsg && (r.whatsapp || r.telefono) ? h('button', { type: 'button', class: 'tondo', 'aria-label': 'WhatsApp a ' + r.nome, title: 'WhatsApp a ' + r.nome, onclick: ferma(() => W.Comunicazioni.scrivi({ modello: 'libero', canale: 'whatsapp', idReferente: r.id, idCliente: c.id })) }, icona('whatsapp', 18, 2.2)) : null,
          r.email ? (scriveMsg ? h('button', { type: 'button', class: 'tondo', 'aria-label': 'Email a ' + r.nome, title: 'Email a ' + r.nome, onclick: ferma(() => W.Comunicazioni.scrivi({ modello: 'libero', canale: 'email', idReferente: r.id, idCliente: c.id })) }, icona('email', 18, 2.2))
            : h('a', { class: 'tondo', href: 'mailto:' + r.email, 'aria-label': 'Email a ' + r.nome, title: 'Email a ' + r.nome, onclick: e => e.stopPropagation() }, icona('email', 18, 2.2))) : null,
          r.telefono ? h('a', { class: 'tondo', href: 'tel:' + String(r.telefono).replace(/[^\d+]/g, ''), 'aria-label': 'Chiama ' + r.nome, title: 'Chiama ' + r.nome, onclick: e => e.stopPropagation() }, icona('telefono', 18, 2.2)) : null),
        onclick: scrive ? () => moduloReferente(c, r) : null, freccia: false,
      })) : h('p', { class: 'vuoto sinistra' }, 'Nessun referente. Aggiungi chi chiami di solito.'))]);
      if (scrive) aggiungi(area, [h('div', null, h('button', { type: 'button', class: 'btn grande', onclick: () => moduloReferente(c, null) }, icona('piu', 18, 2.6), 'Aggiungi un referente'))]);
    }

    function schedaSedi(area, c, sedi, scrive) {
      // Fase 5: la riga dell'impianto dice la categoria e apre lo storico (ticket, rapportini, documenti, verifiche).
      const storico = puo('ticket');
      aggiungi(area, [h('div', { class: 'scheda righe' }, sedi.length ? sedi.map(s => riga({
        sinistra: quadrato(s.tipo === 'impianto' ? 'fulmine' : 'luogo', s.tipo === 'impianto' ? 'ico-blu' : null), titolo: s.nome,
        sotto: [s.categoriaNome, R.indirizzoCompleto(s)].filter(Boolean).join(' · '),
        destra: h('span', { class: 'pillole-testa' }, s.tipo === 'impianto' ? pillola('Impianto', 'blu') : pillola('Sede', 'grigio'),
          storico && scrive ? h('button', { type: 'button', class: 'btn collegamento piccolo', onclick: e => { e.stopPropagation(); moduloSede(c, s); } }, 'Cambia') : null),
        onclick: storico ? () => W.vai('#ticket/impianto/' + s.id) : scrive ? () => moduloSede(c, s) : null, freccia: storico,
      })) : h('p', { class: 'vuoto sinistra' }, 'Nessuna sede o impianto.'))]);
      if (scrive) aggiungi(area, [h('div', null, h('button', { type: 'button', class: 'btn grande', onclick: () => moduloSede(c, null) }, icona('piu', 18, 2.6), 'Aggiungi una sede o un impianto'))]);
    }

    function schedaCommesse(area, c, commesse) {
      const vive = commesse.filter(m => !m.archiviata).sort((a, b) => (String(a.id) < String(b.id) ? 1 : -1));
      aggiungi(area, [h('div', { class: 'scheda righe' }, vive.length ? vive.map(m => {
        const sede = S.ana.sedi.find(s => String(s.id) === String(m.sedeId));
        return riga({
          sinistra: h('span', { class: 'codice' }, m.id), titolo: m.descrizione, sotto: [sede ? sede.nome : m.indirizzo, ({ APERTA: 'aperta', SOSPESA: 'sospesa', CHIUSA: 'chiusa' })[m.stato]].filter(Boolean).join(' · '),
          onclick: () => W.vai('#commesse/' + encodeURIComponent(m.id)),
        });
      }) : h('p', { class: 'vuoto sinistra' }, 'Nessuna commessa.'))]);
      if (puo('commesse', 2) && !c.archiviato) {
        aggiungi(area, [h('div', null, h('button', { type: 'button', class: 'btn grande', onclick: () => {
          S.filtriCommesse = W.filtriCommesse({ cliente: c.id });
          W.vai('#commesse');
        } }, 'Tutte le sue commesse'))]);
      }
    }

    // ===================================================================== archiviare

    async function archivia(c, si) {
      if (si) {
        const ok = await conferma('Archiviare ' + c.nome + '?',
          'Non comparirà più negli elenchi e nei rapportini nuovi. Commesse e rapportini restano. Si ripristina dagli archiviati.', 'Archivia');
        if (!ok) return;
      }
      const ris = await lavora(si ? 'Archivio' : 'Ripristino', () => Rete.post(si ? '/server/archiviaSoggetto' : '/server/ripristinaSoggetto', { id: c.id }));
      if (!ris) return;
      await W.ricaricaAnagrafiche().catch(() => { c.archiviato = si; });
      avviso(si ? c.nome + ' archiviato' : c.nome + ' ripristinato', false, null, si ? { testo: 'Annulla', fn: () => archivia(W.cliente(c.id) || c, false) } : null);
      W.ridisegna();
    }

    // ===================================================================== modulo

    /**
     * Nuovo e modifica, a gruppi: chi è, dati fiscali, contatti, tariffa (solo
     * clienti, solo con i soldi), note. Errori sotto il campo; un doppione si dice
     * prima di salvare, con Apri al posto di Salva.
     */
    function modulo(esistente, predefiniti) {
      const c = Object.assign({ alias: [], cliente: true, fornitore: false }, predefiniti || {}, esistente || {});
      const scelte = {
        cliente: !!c.cliente, fornitore: !!c.fornitore,
        // Di solito il viaggio non si paga e i km sì: è così finché non si sceglie altro.
        pagaViaggio: c.pagaViaggio === true ? 'SI' : 'NO', kmRimborsati: c.kmRimborsati === false ? 'NO' : 'SI',
        // Fase 4 (§15.2): sostituto d'imposta automatico (sì con la partita IVA) o scritto a mano; fine mese come le impostazioni o scritto.
        sostituto: c.sostitutoImposta === true ? 'si' : c.sostitutoImposta === false ? 'no' : 'auto',
        fineMese: c.pagamentoFineMese === true ? 'si' : c.pagamentoFineMese === false ? 'no' : 'auto',
      };
      const testo = (k, attr) => h('input', Object.assign({ type: 'text', value: c[k] === null || c[k] === undefined ? '' : String(c[k]) }, attr || {}));
      const numero = k => h('input', { type: 'text', inputmode: 'decimal', value: c[k] !== null && c[k] !== undefined && c[k] !== '' ? R.numeroCampo(c[k]) : '' });
      const v = {
        nome: testo('nome'), alias: h('input', { type: 'text', value: (c.alias || []).join(', ') }),
        partitaIva: testo('partitaIva', { inputmode: 'numeric', spellcheck: 'false' }), codiceFiscale: testo('codiceFiscale', { spellcheck: 'false' }),
        codiceSdi: testo('codiceSdi', { spellcheck: 'false' }), pec: testo('pec', { type: 'email', spellcheck: 'false' }),
        email: testo('email', { type: 'email', spellcheck: 'false' }), telefono: testo('telefono', { type: 'tel' }),
        indirizzo: testo('indirizzo'), cap: testo('cap', { inputmode: 'numeric' }), citta: testo('citta'), provincia: testo('provincia', { maxlength: '2' }),
        tariffaFissa: numero('tariffaFissa'), ultimaTariffa: numero('ultimaTariffa'), costoFisso: numero('costoFisso'),
        pagamentoGiorni: h('input', { type: 'text', inputmode: 'numeric', value: c.pagamentoGiorni === null || c.pagamentoGiorni === undefined ? '' : String(c.pagamentoGiorni),
          placeholder: String((S.ana.impostazioni && S.ana.impostazioni.GIORNI_PAGAMENTO) || 30) }),
        note: h('textarea', { rows: 3 }),
      };
      v.note.value = c.note || '';
      let errori = {};
      let proposta = null;
      const corpo = h('div', { class: 'modulo-soggetto' });
      const leggi = () => ({
        nome: v.nome.value.trim(), alias: v.alias.value.split(',').map(s => s.trim()).filter(Boolean),
        cliente: scelte.cliente, fornitore: scelte.fornitore,
        partitaIva: v.partitaIva.value.replace(/\s+/g, '').toUpperCase(), codiceFiscale: v.codiceFiscale.value.replace(/\s+/g, '').toUpperCase(),
        codiceSdi: v.codiceSdi.value.trim().toUpperCase(), pec: v.pec.value.trim(), email: v.email.value.trim(), telefono: v.telefono.value.trim(),
        indirizzo: v.indirizzo.value.trim(), cap: v.cap.value.trim(), citta: v.citta.value.trim(), provincia: v.provincia.value.trim().toUpperCase(),
        note: v.note.value.trim(),
      });
      const spunta = (chiave, etichetta) => h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: scelte[chiave], onchange: e => { scelte[chiave] = e.target.checked; delete errori.tipo; disegna(); } }), etichetta);
      const siNo = chiave => segmenti([['SI', 'Sì'], ['NO', 'No']], scelte[chiave], x => { scelte[chiave] = x; disegna(); }, 'piccoli');

      const controlla = h('button', { type: 'button', class: 'btn', onclick: async () => {
        const iva = v.partitaIva.value.replace(/\s+/g, '');
        const sbagliata = R.errorePartitaIva(iva);
        if (!iva || sbagliata) { errori.partitaIva = iva ? sbagliata : 'Scrivi la partita IVA'; disegna(); v.partitaIva.focus(); return; }
        const ris = await lavora('Controllo la partita IVA', () => Rete.post('/server/controllaPartitaIva', { partitaIva: iva }));
        if (!ris) return;
        if (ris.valida === false) { errori.partitaIva = 'Questa partita IVA non risulta attiva'; proposta = null; disegna(); return; }
        delete errori.partitaIva;
        proposta = ris.nome || ris.indirizzo ? ris : null;
        if (!proposta) avviso('La partita IVA è valida');
        disegna();
      } }, 'Controlla');

      const disegna = () => {
        const tipoCliente = scelte.cliente;
        aggiungi(svuota(corpo), [
          h('div', { class: 'gruppo-campi' }, h('h3', null, 'Chi è'),
            campo('Nome o ragione sociale', v.nome, errori.nome),
            h('div', { class: 'campo' + (errori.tipo ? ' sbagliato' : '') }, h('div', { class: 'spunte' }, spunta('cliente', 'È un cliente'), spunta('fornitore', 'È un fornitore')),
              errori.tipo ? h('div', { class: 'errore' }, errori.tipo) : null),
            campo('Altri nomi, separati da virgola', v.alias)),
          h('div', { class: 'gruppo-campi' }, h('h3', null, 'Dati fiscali'),
            h('div', { class: 'campo' + (errori.partitaIva ? ' sbagliato' : '') }, h('label', null, 'Partita IVA'),
              h('div', { class: 'campo-con-pulsante' }, v.partitaIva, controlla),
              errori.partitaIva ? h('div', { class: 'errore' }, errori.partitaIva) : null),
            proposta ? h('div', { class: 'proposta' },
              h('div', { class: 'testi' }, h('b', null, proposta.nome || ''), h('span', null, R.indirizzoCompleto(proposta))),
              h('button', { type: 'button', class: 'btn', onclick: () => {
                if (proposta.nome) v.nome.value = proposta.nome;
                ['indirizzo', 'cap', 'citta', 'provincia'].forEach(k => { if (proposta[k]) v[k].value = proposta[k]; });
                proposta = null;
                avviso('Nome e indirizzo presi dalla partita IVA');
                disegna();
              } }, 'Usa questi dati')) : null,
            h('div', { class: 'riga-campi' }, campo('Codice fiscale', v.codiceFiscale, errori.codiceFiscale), campo('Codice SDI', v.codiceSdi, errori.codiceSdi)),
            campo('PEC', v.pec, errori.pec)),
          h('div', { class: 'gruppo-campi' }, h('h3', null, 'Contatti'),
            h('div', { class: 'riga-campi' }, campo('Email', v.email, errori.email), campo('Telefono', v.telefono)),
            campo('Indirizzo', v.indirizzo),
            h('div', { class: 'riga-campi tre' }, campo('CAP', v.cap, errori.cap), campo('Città', v.citta), campo('Provincia', v.provincia, errori.provincia))),
          tipoCliente && soldi() ? h('div', { class: 'gruppo-campi' }, h('h3', null, 'Tariffa'),
            h('div', { class: 'riga-campi' }, campo('Tariffa fissa (€/h, vuota = libera)', conSuffisso(v.tariffaFissa, '€/h')), campo('Ultima tariffa libera', conSuffisso(v.ultimaTariffa, '€/h'))),
            h('div', { class: 'riga-campi' }, campo('Costo orario fisso', conSuffisso(v.costoFisso, '€/h')), h('span')),
            h('div', { class: 'riga-campi' }, campo('Viaggio pagato', siNo('pagaViaggio')), campo('Km rimborsati', siNo('kmRimborsati')))) : null,
          tipoCliente && soldi() && W.puo('fatturazione') ? h('div', { class: 'gruppo-campi' }, h('h3', null, 'Fatture'),
            campo('Sostituto d\'imposta',segmenti([['auto', 'Automatico'], ['si', 'Sì'], ['no', 'No']], scelte.sostituto, x => { scelte.sostituto = x; disegna(); }, 'piccoli')),
            h('div', { class: 'riga-campi' }, campo('Pagamento a', conSuffisso(v.pagamentoGiorni, 'giorni')),
              campo('Fine mese', segmenti([['auto', 'Come le impostazioni'], ['si', 'Sì'], ['no', 'No']], scelte.fineMese, x => { scelte.fineMese = x; disegna(); }, 'piccoli')))) : null,
          h('div', { class: 'gruppo-campi' }, h('h3', null, 'Note'), campo(null, v.note)),
          errori.doppione ? h('div', { class: 'doppione', role: 'alert' }, h('span', null, 'C\'è già ', h('b', null, errori.doppione.nome)),
            h('button', { type: 'button', class: 'btn', onclick: () => { chiudi(); W.vai('#clienti/' + encodeURIComponent(errori.doppione.id)); } }, 'Apri')) : null]);
        disegnaPiede();
      };

      // Cambiando nome, altri nomi o partita IVA il doppione non vale più: torna il pulsante per salvare.
      [v.nome, v.alias, v.partitaIva].forEach(el => el.addEventListener('input', () => {
        if (!errori.doppione) return;
        delete errori.doppione;
        const box = corpo.querySelector('.doppione');
        if (box) box.remove();
        disegnaPiede();
      }));
      const piede = h('div', { class: 'piede-f' });
      const disegnaPiede = () => aggiungi(svuota(piede), [h('span', { class: 'spazio' }),
        h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        // Con un doppione il giallo è Apri (nel riquadro): Salva non c'è.
        errori.doppione ? null : h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, esistente ? 'Salva' : 'Crea')]);

      let chiudi;
      const salva = async () => {
        const campi = leggi();
        errori = R.validaSoggetto(campi);
        const doppione = R.trovaDoppione(S.ana.soggetti, campi, esistente ? c.id : null);
        if (doppione) errori.doppione = doppione;
        if (Object.keys(errori).length) {
          disegna();
          const primo = corpo.querySelector('.campo.sbagliato input');
          if (primo) primo.focus();
          return;
        }
        if (campi.cliente && soldi()) {
          Object.assign(campi, {
            tariffaFissa: R.leggiCampo(v.tariffaFissa.value), ultimaTariffa: R.leggiCampo(v.ultimaTariffa.value), costoFisso: R.leggiCampo(v.costoFisso.value),
            pagaViaggio: scelte.pagaViaggio === 'SI', kmRimborsati: scelte.kmRimborsati === 'SI',
          });
          if (W.puo('fatturazione')) {
            Object.assign(campi, {
              sostitutoImposta: scelte.sostituto === 'auto' ? null : scelte.sostituto === 'si',
              pagamentoGiorni: v.pagamentoGiorni.value.trim() === '' ? null : Number(v.pagamentoGiorni.value.trim()),
              pagamentoFineMese: scelte.fineMese === 'auto' ? null : scelte.fineMese === 'si',
            });
          }
        }
        if (esistente) campi.id = c.id;
        const ris = await lavora(esistente ? 'Salvo' : 'Creo', () => Rete.post('/server/salvaSoggetto', { soggetto: campi }));
        if (!ris) return;
        const s = ris.soggetto || {};
        if (!esistente && (ris.giaEsisteva || s.giaEsisteva)) {
          errori = { doppione: { id: s.id, nome: s.nome } };
          disegna();
          return;
        }
        await W.ricaricaAnagrafiche().catch(() => null);
        chiudi();
        avviso(esistente ? 'Salvato ' + campi.nome : 'Creato ' + campi.nome);
        if (esistente) W.ridisegna(); else W.vai('#clienti/' + encodeURIComponent(s.id));
      };
      disegna();
      chiudi = finestra({
        contenuto: [h('div', { class: 'testa-f' }, h('h2', null, esistente ? c.nome : (c.fornitore && !c.cliente ? 'Nuovo fornitore' : 'Nuovo cliente')), tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')),
          h('div', { class: 'corpo-f' }, corpo), piede],
        titolo: esistente ? c.nome : 'Nuovo cliente', larghezza: 'media',
      });
    }

    // ===================================================================== referenti e sedi

    function moduloReferente(c, r) {
      const x = r || {};
      const v = {
        nome: h('input', { type: 'text', value: x.nome || '' }), ruolo: h('input', { type: 'text', value: x.ruolo || '' }),
        telefono: h('input', { type: 'tel', value: x.telefono || '' }), email: h('input', { type: 'email', value: x.email || '' }),
        note: h('textarea', { rows: 2 }),
      };
      v.note.value = x.note || '';
      // Fase 7 (§12.6): Paga le fatture, Numero WhatsApp (se diverso), Ha detto sì a WhatsApp / Non vuole più WhatsApp.
      v.whatsapp = h('input', { type: 'tel', value: x.whatsapp || '' });
      const f7 = { pagamenti: !!x.pagamenti, whatsappOk: !!x.whatsappOk };
      const puoWa = radice.WisperRegoleComunicazioni.Permessi.segnaWhatsapp(W.perm());
      let errori = {};
      const zona = h('div', { class: 'fila' });
      const segnaWa = async ok => {
        if (!r) { f7.whatsappOk = ok; disegna(); return; }
        const ris = await lavora(ok ? 'Segno il sì' : 'Tolgo il sì', () => Rete.post('/server/segnaWhatsapp', { idReferente: r.id, ok }));
        if (!ris) return;
        f7.whatsappOk = ok;
        r.whatsappOk = ok;
        avviso(ok ? 'Segnato: ha detto sì a WhatsApp' : 'Segnato: non vuole più WhatsApp');
        W.ricaricaAnagrafiche().catch(() => null);
        disegna();
      };
      const disegna = () => aggiungi(svuota(zona), [campo('Nome', v.nome, errori.nome),
        h('div', { class: 'riga-campi' }, campo('Ruolo', v.ruolo), campo('Telefono', v.telefono)),
        campo('Email', v.email, errori.email),
        h('div', { class: 'riga-campi' }, campo('Numero WhatsApp', v.whatsapp, errori.whatsapp),
          h('div', { class: 'campo' }, h('label', null, 'Paga le fatture'), segmenti([['si', 'Sì'], ['no', 'No']], f7.pagamenti ? 'si' : 'no', k => { f7.pagamenti = k === 'si'; disegna(); }, 'piccoli'))),
        h('div', { class: 'campo' }, h('label', null, 'WhatsApp'), h('div', { class: 'pillole-testa' },
          f7.whatsappOk ? h('span', { class: 'pill p-verde' }, 'Ha detto sì a WhatsApp') : h('span', { class: 'pill p-grigio' }, 'WhatsApp non chiesto'),
          puoWa ? (f7.whatsappOk ? h('button', { type: 'button', class: 'btn collegamento', onclick: () => segnaWa(false) }, 'Non vuole più WhatsApp')
            : h('button', { type: 'button', class: 'btn collegamento', onclick: () => segnaWa(true) }, 'Ha detto sì a WhatsApp')) : null)),
        campo('Note', v.note)]);
      disegna();
      let chiudi;
      const salva = async () => {
        errori = {};
        if (!v.nome.value.trim()) errori.nome = 'Scrivi il nome';
        const e = R.erroreEmail(v.email.value);
        if (e) errori.email = e;
        if (v.whatsapp.value.trim() && !radice.WisperRegoleComunicazioni.numeroWhatsapp(v.whatsapp.value).valido) errori.whatsapp = 'Non sembra un numero di telefono';
        if (Object.keys(errori).length) { disegna(); return; }
        const campi = { idSoggetto: c.id, nome: v.nome.value.trim(), ruolo: v.ruolo.value.trim(), telefono: v.telefono.value.trim(), email: v.email.value.trim(), note: v.note.value.trim(),
          pagamenti: f7.pagamenti, whatsapp: v.whatsapp.value.trim() };
        // Il sì a WhatsApp di un referente nuovo va col salvataggio; per uno che c'è già lo segna segnaWhatsapp (resta nel registro).
        if (!r) campi.whatsappOk = f7.whatsappOk;
        if (r) campi.id = r.id;
        const ris = await lavora('Salvo il referente', () => Rete.post('/server/salvaReferente', { referente: campi }));
        if (!ris) return;
        await W.ricaricaAnagrafiche().catch(() => null);
        chiudi();
        // Fase 7 (§10.4): l'email cambiata di chi ha l'accesso al portale chiude le sue sessioni, e il server lo dice.
        avviso(ris.avviso || (r ? 'Referente salvato' : 'Referente aggiunto'));
        W.ridisegna();
      };
      chiudi = finestra({
        titolo: r ? r.nome : 'Nuovo referente', corpo: zona,
        pulsanti: [r ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: async () => {
          const ok = await conferma('Togliere ' + r.nome + '?', 'Non comparirà più fra i referenti di ' + c.nome + '.', 'Togli', true);
          if (!ok) return;
          const ris = await lavora('Tolgo il referente', () => Rete.post('/server/togliReferente', { id: r.id }));
          if (!ris) return;
          await W.ricaricaAnagrafiche().catch(() => null);
          chiudi();
          avviso('Referente tolto');
          W.ridisegna();
        } }, 'Togli') : null, 'spazio',
        h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')].filter(Boolean),
      });
    }

    function moduloSede(c, s, dopo) {
      const x = s || { tipo: 'sede' };
      let tipo = x.tipo === 'impianto' ? 'impianto' : 'sede';
      const v = {
        nome: h('input', { type: 'text', value: x.nome || '' }), indirizzo: h('input', { type: 'text', value: x.indirizzo || '' }),
        cap: h('input', { type: 'text', inputmode: 'numeric', value: x.cap || '' }), citta: h('input', { type: 'text', value: x.citta || '' }),
        provincia: h('input', { type: 'text', maxlength: '2', value: x.provincia || '' }), note: h('textarea', { rows: 2 }),
        // fase 5: i dati dell'impianto (architettura §16.2), tutti facoltativi
        matricola: h('input', { type: 'text', value: x.matricola || '' }), potenza: h('input', { type: 'text', value: x.potenza || '', placeholder: '630 kVA' }),
        tensione: h('input', { type: 'text', value: x.tensione || '', placeholder: '15 kV / 400 V' }), messaInServizio: h('input', { type: 'date', value: x.messaInServizio || '' }),
        datiTecnici: h('textarea', { rows: 2 }),
      };
      v.note.value = x.note || '';
      v.datiTecnici.value = x.datiTecnici || '';
      const imp = { categoria: x.categoria || '', ambiente: x.ambiente || '', referenteId: x.referenteId || '', sedePadreId: x.sedePadreId || '' };
      const T5 = window.WisperRegoleTicket;
      let errori = {};
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [
        campo('Tipo', segmenti([['sede', 'Sede'], ['impianto', 'Impianto']], tipo, t => { tipo = t; disegna(); }, 'piccoli')),
        campo('Nome', v.nome, errori.nome), campo('Indirizzo', v.indirizzo),
        h('div', { class: 'riga-campi tre' }, campo('CAP', v.cap, errori.cap), campo('Città', v.citta), campo('Provincia', v.provincia, errori.provincia)),
        tipo === 'impianto' && T5 ? h('div', { class: 'fila' },
          h('div', { class: 'riga-campi' },
            campo('Categoria', B.selezione([['', 'Da scegliere']].concat(T5.CATEGORIE_IMPIANTO), imp.categoria, y => { imp.categoria = y; })),
            campo('Ambiente', B.selezione([['', 'Da scegliere']].concat(T5.AMBIENTI), imp.ambiente, y => { imp.ambiente = y; }))),
          h('div', { class: 'riga-campi tre' }, campo('Potenza', v.potenza), campo('Tensione', v.tensione), campo('Matricola', v.matricola)),
          h('div', { class: 'riga-campi' }, campo('Messa in servizio', v.messaInServizio),
            campo('Referente sul posto', B.selezione([['', 'Nessuno']].concat(S.ana.referenti.filter(r => r.idSoggetto === c.id).map(r => [r.id, r.nome])), imp.referenteId, y => { imp.referenteId = y; }))),
          S.ana.sedi.some(z => z.idSoggetto === c.id && z.tipo !== 'impianto' && (!s || z.id !== s.id))
            ? campo('Sta nella sede', B.selezione([['', 'Nessuna in particolare']].concat(S.ana.sedi.filter(z => z.idSoggetto === c.id && z.tipo !== 'impianto' && (!s || z.id !== s.id)).map(z => [z.id, z.nome])), imp.sedePadreId, y => { imp.sedePadreId = y; })) : null,
          campo('Dati tecnici', v.datiTecnici)) : null,
        campo('Note', v.note)]);
      disegna();
      let chiudi;
      const salva = async () => {
        errori = {};
        if (!v.nome.value.trim()) errori.nome = tipo === 'impianto' ? 'Scrivi come si chiama l\'impianto' : 'Scrivi come si chiama la sede';
        const ec = R.erroreCap(v.cap.value);
        if (ec) errori.cap = ec;
        const ep = R.erroreProvincia(v.provincia.value);
        if (ep) errori.provincia = ep;
        if (Object.keys(errori).length) { disegna(); return; }
        const campi = { idSoggetto: c.id, tipo, nome: v.nome.value.trim(), indirizzo: v.indirizzo.value.trim(), cap: v.cap.value.trim(), citta: v.citta.value.trim(), provincia: v.provincia.value.trim().toUpperCase(), note: v.note.value.trim() };
        if (tipo === 'impianto' && T5) Object.assign(campi, { categoria: imp.categoria, ambiente: imp.ambiente, referenteId: imp.referenteId ? Number(imp.referenteId) || imp.referenteId : null,
          sedePadreId: imp.sedePadreId ? Number(imp.sedePadreId) || imp.sedePadreId : null, matricola: v.matricola.value.trim(), potenza: v.potenza.value.trim(), tensione: v.tensione.value.trim(),
          messaInServizio: v.messaInServizio.value || '', datiTecnici: v.datiTecnici.value.trim() });
        if (s) campi.id = s.id;
        const ris = await lavora('Salvo', () => Rete.post('/server/salvaSede', { sede: campi }));
        if (!ris) return;
        await W.ricaricaAnagrafiche().catch(() => null);
        chiudi();
        avviso(s ? 'Salvato' : (tipo === 'impianto' ? 'Impianto aggiunto' : 'Sede aggiunta'));
        if (dopo) dopo(); else W.ridisegna();
      };
      chiudi = finestra({
        titolo: s ? s.nome : 'Nuova sede o impianto', corpo: zona,
        pulsanti: [s ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: async () => {
          const ok = await conferma('Archiviare ' + s.nome + '?', 'Non si proporrà più nelle commesse nuove. Quelle che la usano la tengono.', 'Archivia');
          if (!ok) return;
          const ris = await lavora('Archivio', () => Rete.post('/server/archiviaSede', { id: s.id, archiviata: true }));
          if (!ris) return;
          await W.ricaricaAnagrafiche().catch(() => null);
          chiudi();
          avviso(s.nome + ' archiviata');
          W.ridisegna();
        } }, 'Archivia') : null, 'spazio',
        h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')].filter(Boolean),
      });
    }

    return { vista, scheda, modulo, moduloSede };
  };
})(window);
