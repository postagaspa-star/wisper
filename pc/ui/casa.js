/*
 * Wisper Ufficio: la casa del design Fai (docs/gestionale/fai.md §5, prototipo docs/prototipo/Fai-pc.dc.html).
 * La scheda gialla con la cosa più importante, "Cosa vuoi fare?" con le azioni e i loro tasti, Da sistemare e In agenda.
 * Le voci sono quelle della Dashboard del server: qui si decide solo come si mostrano (regole-casa.js).
 */
(function (radice) {
  'use strict';

  radice.WisperCasa = function (W) {
    const { S, B, C, R } = W;
    const RC = radice.WisperRegoleCasa;
    const RL = radice.WisperRegoleLavori;
    const { h, aggiungi, icona } = B;

    /** Le forme delle sei azioni, come nel prototipo: ognuna diversa, col suo disegno dentro. */
    const TRATTO_SCURO = 'fill="none" stroke="#1A1A1A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
    const TRATTO_NERO = 'fill="none" stroke="#0A0A0A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
    const TRATTO_BIANCO = 'fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
    const FORME = {
      rapportino: `<g fill="#FFC53D"><circle cx="22" cy="22" r="16"/><circle cx="37.5" cy="22" r="6.2"/><circle cx="32.96" cy="32.96" r="6.2"/><circle cx="22" cy="37.5" r="6.2"/><circle cx="11.04" cy="32.96" r="6.2"/><circle cx="6.5" cy="22" r="6.2"/><circle cx="11.04" cy="11.04" r="6.2"/><circle cx="22" cy="6.5" r="6.2"/><circle cx="32.96" cy="11.04" r="6.2"/></g><g transform="translate(10 10)" ${TRATTO_SCURO}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></g>`,
      spesa: `<circle cx="22" cy="22" r="22" fill="#FF6B57"/><g transform="translate(10 10)" ${TRATTO_SCURO}><path d="M16 7.6A5.4 5.4 0 1 0 16 16.4"/><path d="M6 10.6h7M6 13.4h6"/></g>`,
      commessa: `<rect width="44" height="44" rx="14" fill="#3D5AFE"/><g transform="translate(10 10)" ${TRATTO_BIANCO}><path d="M4 8h16v11H4z"/><path d="M9 8V5h6v3"/><path d="M4 13h16"/></g>`,
      cliente: `<g fill="#12B76A"><circle cx="22" cy="22" r="12"/><circle cx="22" cy="11.5" r="11.3"/><circle cx="32.5" cy="22" r="11.3"/><circle cx="22" cy="32.5" r="11.3"/><circle cx="11.5" cy="22" r="11.3"/></g><g transform="translate(10 10)" ${TRATTO_NERO}><circle cx="10" cy="8" r="4"/><path d="M3 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/><path d="M19 8v6M16 11h6"/></g>`,
      preventivo: `<rect x="7" y="7" width="30" height="30" rx="9" fill="#7A5AF8" transform="rotate(45 22 22)"/><g transform="translate(10 10)" ${TRATTO_BIANCO}><path d="M8 5h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M9.5 10h5M9.5 13.5h5M9.5 17h3"/></g>`,
      invia: `<rect x="0" y="7" width="44" height="30" rx="15" fill="#06AED4"/><g transform="translate(10 10)" ${TRATTO_NERO}><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></g>`,
    };

    function forma(chiave) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('width', 52);
      s.setAttribute('height', 52);
      s.setAttribute('viewBox', '0 0 44 44');
      s.setAttribute('aria-hidden', 'true');
      s.style.flex = '0 0 auto';
      s.innerHTML = FORME[chiave];
      return s;
    }

    /** Le fatture a cui, in questa apertura, si è già mandato il promemoria: la scheda gialla passa alla cosa dopo. */
    const mandati = new Set();
    let ultimoMandato = null;

    const puoScrivere = modulo => W.puo(modulo, 2) && W.funzioneAccesa(modulo);

    const quantiDaInviare = () => RL.raggruppa(W.attivi().filter(RL.daInviare)).length;

    function fai(chiave) {
      if (chiave === 'rapportino') W.moduloRapportino(null);
      else if (chiave === 'spesa') W.Spese.moduloSpesa(null);
      else if (chiave === 'commessa') W.Commesse.modulo(null);
      else if (chiave === 'cliente') W.Clienti.modulo(null);
      else if (chiave === 'preventivo') W.vai('#preventivi/nuovo');
      else if (chiave === 'invia') W.vaiARapportini({ mese: '', quali: 'inviare' });
    }

    const senzaMandati = lista => (lista || []).filter(v => !(v.collegamento && v.collegamento.pagina === 'fattura' && mandati.has(String(v.collegamento.id))));

    function datiCasa() {
      return Object.assign({}, S.dash, { urgenti: senzaMandati(S.dash.urgenti), settimana: senzaMandati(S.dash.settimana), pianificare: senzaMandati(S.dash.pianificare) });
    }

    // ===================================================================== la scheda gialla

    const testoFumetto = 'M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5z';

    function iconaLibera(d, dim) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('width', dim);
      s.setAttribute('height', dim);
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '2.2');
      s.setAttribute('stroke-linecap', 'round');
      s.setAttribute('stroke-linejoin', 'round');
      s.setAttribute('aria-hidden', 'true');
      s.innerHTML = '<path d="' + d + '"/>';
      return s;
    }

    function schedaGialla(prima) {
      const s = RC.schedaImportante(prima);
      const conPromemoria = !!s.idFattura && W.puo('comunicazioni', 2) && W.funzioneAccesa('comunicazioni') && W.puo('fatturazione', 2) && W.soldi();
      const sotto = [
        s.pillola ? h('span', { class: 'pillola-rossa' }, s.pillola) : null,
        s.importo !== null && W.soldi() ? h('span', { class: 'soldi-imp' }, C.euro(s.importo)) : null,
        s.nota ? h('span', { class: 'nota-imp' }, s.nota) : null,
        s.dettaglio ? h('span', { class: 'nota-imp' }, s.dettaglio) : null,
      ].filter(Boolean);
      const azione = conPromemoria
        ? () => W.Comunicazioni.promemoriaFattura(s.idFattura, s.cliente, () => {
          mandati.add(String(s.idFattura));
          ultimoMandato = { cliente: s.cliente, nota: s.nota };
          W.ridisegna();
        })
        : () => W.Dash8.apriVoce(prima);
      return h('section', { class: 'piu-urgente importante casa-entra', style: { animationDelay: '.09s' }, 'aria-label': 'La cosa più importante', 'data-visita': 'dashboard' },
        h('div', { class: 'testi-imp' },
          h('div', { class: 'occhiello' }, 'LA COSA PIÙ IMPORTANTE'),
          h('h2', null, s.titolo),
          sotto.length ? h('div', { class: 'sotto-imp' }, sotto) : null),
        h('button', { type: 'button', class: 'fai-imp molla', onclick: azione },
          conPromemoria ? iconaLibera(testoFumetto, 22) : null,
          conPromemoria ? 'Manda un promemoria' : (prima.azione || R.testoAzione(prima.collegamento))));
    }

    function fatto() {
      if (!ultimoMandato) return null;
      const m = ultimoMandato;
      ultimoMandato = null;
      return h('div', { class: 'fatto-casa casa-entra', role: 'status' }, h('span', { class: 'ok' }, icona('spunta', 20, 2.6)),
        h('b', null, 'Promemoria pronto per ' + (m.cliente || 'il cliente')), m.nota ? h('span', { class: 'sotto' }, m.nota) : null);
    }

    // ===================================================================== le azioni

    function tessere() {
      const azioni = RC.azioniDi(puoScrivere);
      if (!azioni.length) return null;
      const nInviare = quantiDaInviare();
      return h('section', { 'aria-label': 'Cosa vuoi fare', class: 'sezione', style: { gap: '14px' } },
        h('h2', { class: 'casa-entra', style: { animationDelay: '.14s' } }, 'Cosa vuoi fare?'),
        h('div', { class: 'tessere', 'data-visita': 'cosa-vuoi-fare' }, azioni.map((a, i) =>
          h('button', { type: 'button', class: 'tessera molla casa-entra t-' + a.tinta, style: { animationDelay: (0.19 + i * 0.05) + 's' }, 'aria-keyshortcuts': a.tasto, 'data-azione': a.chiave, onclick: () => fai(a.chiave) },
            forma(a.chiave),
            h('span', { class: 'testo-t' }, a.testo),
            a.chiave === 'invia' && nInviare ? h('span', { class: 'quanti' }, nInviare) : null,
            h('span', { class: 'cap', 'aria-hidden': 'true' }, a.tasto)))));
    }

    // ===================================================================== Da sistemare e In agenda

    const freccia = () => h('span', { class: 'freccia-r' }, iconaLibera('M9 6l6 6-6 6', 20));

    function rigaVoce(v) {
      return h('button', { type: 'button', class: 'casa-riga molla', onclick: () => W.Dash8.apriVoce(v) },
        h('span', { class: 'tin tin-' + RC.tintaVoce(v) }, icona(W.iconaVoce(v), 22, 2.2)),
        h('span', { class: 'corpo-r' }, h('span', { class: 't1' }, v.titolo), v.dettaglio ? h('span', { class: 't2' }, v.dettaglio) : null),
        freccia());
    }

    function colonnaDaSistemare(d) {
      if (!d.righe.length && !d.prima) {
        return h('section', { class: 'colonna-casa', 'aria-label': 'Da sistemare' },
          h('div', { class: 'testa-colonna' }, h('h2', null, 'Da sistemare'),
            h('button', { type: 'button', class: 'vedi molla', onclick: () => W.Dash8.apriTutto('urgenti') }, 'Vedi tutto')),
          h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente da sistemare oggi'));
      }
      return h('section', { class: 'colonna-casa', 'aria-label': 'Da sistemare' },
        h('div', { class: 'testa-colonna' }, h('h2', null, 'Da sistemare'),
          h('button', { type: 'button', class: 'vedi molla', onclick: () => W.Dash8.apriTutto('urgenti') }, 'Vedi tutto')),
        d.righe.length ? d.righe.map(rigaVoce) : h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Nient\'altro da sistemare'));
    }

    function colonnaAgenda() {
      if (!S.dash.agenda || !W.puo('attivita') || !W.funzioneAccesa('attivita')) return null;
      const righe = RC.agenda(S.dash.agenda, C.oggiIso(), 4);
      return h('section', { class: 'colonna-casa', 'aria-label': 'In agenda' },
        h('div', { class: 'testa-colonna' }, h('h2', null, 'In agenda')),
        righe.map(x => x.vuota
          ? h('div', { class: 'casa-riga vuota' }, h('span', { class: 'quando-r niente' }, h('span', { class: 'g' }, x.etichetta), h('span', { class: 'o' }, x.ora)), h('span', { class: 'niente-casa' }, 'Niente in agenda'))
          : h('button', { type: 'button', class: 'casa-riga molla', onclick: () => W.vaiA({ pagina: 'attivita', id: x.id }) },
            h('span', { class: 'quando-r' + (x.oggi ? ' oggi' : '') }, h('span', { class: 'g' }, x.etichetta), x.ora ? h('span', { class: 'o' }, x.ora) : null),
            h('span', { class: 'corpo-r' }, h('span', { class: 't1' }, x.titolo), x.sotto ? h('span', { class: 't2' }, x.sotto) : null),
            freccia())));
    }

    // ===================================================================== la pagina

    function vista(pagina) {
      const u = (S.io && S.io.utente) || {};
      const nome = String(u.nome || '').split(' ')[0];
      const est = W.eEsterno() && S.io.interfaccia && S.io.interfaccia.esterno;
      const dati = datiCasa();
      const d = RC.daSistemare(dati, 4);
      const casa = h('div', { class: 'casa' });
      aggiungi(casa, [h('div', { class: 'casa-entra', style: { animationDelay: '.04s' } },
        h('div', { class: 'da' }, R.dataTitolo(new Date())), h('h1', null, nome ? 'Ciao ' + nome : 'Ciao'),
        est ? h('div', { class: 'pillole-testa', style: { marginTop: '8px' } }, h('span', { class: 'pill p-blu' }, 'Esterno · ' + est.nome)) : null)]);
      aggiungi(casa, [fatto()]);
      if (d.prima) aggiungi(casa, [schedaGialla(d.prima)]);
      aggiungi(casa, [tessere()]);
      if (W.eEsterno() && (S.dash.incarichi || []).length) aggiungi(casa, [W.incarichiEsterno()]);
      aggiungi(casa, [h('div', { class: 'due-casa casa-entra', style: { animationDelay: '.49s' } }, colonnaDaSistemare(d), colonnaAgenda())]);
      aggiungi(pagina, [casa]);
    }

    /** I tasti delle tessere: solo in casa, con niente aperto e fuori dai campi. */
    document.addEventListener('keydown', e => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      if (R.moduloDi(W.percorso()) !== 'dashboard' || W.percorso().indexOf('/') >= 0) return;
      if (document.querySelector('.velo, .menu, .visita') || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
      const a = RC.azioniDi(puoScrivere).find(x => x.tasto === e.key.toUpperCase());
      if (a && document.querySelector('.casa')) { e.preventDefault(); fai(a.chiave); }
    });

    return { vista };
  };
})(window);
