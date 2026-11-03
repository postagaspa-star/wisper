/*
 * Wisper Ufficio: Banche e scadenze (docs/gestionale/fase4.md §10 e §13.5, prototipo
 * docs/prototipo/Gestionale-fase4.html vista Computer; risposte in architettura.md §15.13-15.15).
 *
 * Segmenti Scadenziario · Movimenti · Tributi e F24 · Conti · Situazione. Solo scadenziario
 * (decisione 6 di Andrea): incassi e pagamenti si segnano a mano, anche in parte, e
 * Previsto, Registrato e Verificato in banca si vedono sempre diversi, con la parola.
 * Collegamento alla banca e import dell'estratto conto: "Non collegato", nessun pulsante.
 * Il saldo previsto è prudente (lo calcola il server): le uscite scadute contano oggi,
 * gli incassi scaduti no, e lo dice la pagina; i giorni sotto soglia sono rossi con la parola.
 */
(function (radice) {
  'use strict';

  radice.WisperBanche = function (W) {
    const { S, C, B, Rete } = W;
    const RF = radice.WisperRegoleFatture;
    const { h, aggiungi, svuota, icona, tondo, pillola, avviso, lavora, finestra, conferma, apriMenu, campo, selezione, segmenti, cerca, riga, quadrato, segnaposto } = B;
    const puo = W.puo;
    const scrive = () => puo('banche', 2) && W.soldi();
    const oggi = () => C.oggiIso();
    const euro = n => C.euro(n);
    const segnato = (verso, n) => (verso === 'entrata' ? '+ ' : '− ') + C.euro(Math.abs(C.num(n)));
    const giornoBreve = iso => (iso ? W.dataBreve(iso) : '');
    const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
    const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const giornoLungo = iso => { const d = new Date(iso + 'T12:00:00'); return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()]; };
    const piuGiorni = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

    const M = {
      periodo: 60, idConto: '', scad: null, sit: null, conti: null, mov: null, filtroMov: { pill: 'tutti', testo: '', idConto: '' }, sceltiMov: new Set(),
      impegni: null, giorno: '', proposte: false, apriImpegno: null, apriConto: null,
    };

    function daRileggere() { M.scad = null; M.sit = null; M.conti = null; M.mov = null; M.impegni = null; }

    function conDati(contenitore, prepara, disegna) {
      const zona = h('div', { class: 'sezione' }, segnaposto(4, 64));
      aggiungi(contenitore, [zona]);
      prepara().then(() => { zona.remove(); disegna(); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => { daRileggere(); W.disegnaPagina(); } }, 'Riprova'))]);
      });
    }

    async function leggiConti(forza) {
      if (M.conti && !forza) return M.conti;
      M.conti = await Rete.get('/server/conti');
      return M.conti;
    }
    const contiAttivi = () => ((M.conti && M.conti.conti) || []).filter(c => c.attivo !== false);
    const predefinito = () => contiAttivi().find(c => c.predefinito) || contiAttivi()[0] || null;
    const nomeConto = c => c ? c.nome + (c.ultimeCifre ? ' …' + c.ultimeCifre : '') : '';

    const nonCollegato = () => h('span', { class: 'pill non-collegato' }, icona('scollegato', 14, 2.2), 'Non collegato');
    const pillStato = parola => pillola(parola, RF.coloreStato(parola));

    function testataBanche(titolo, destra) {
      return h('div', { class: 'testata alta' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Banche e scadenze'), h('h1', null, titolo)),
        destra ? h('div', { class: 'azioni-testa' }, destra) : null);
    }

    function segmentiBanche(seg) {
      return segmenti([['scadenziario', 'Scadenziario'], ['movimenti', 'Movimenti'], ['tributi', 'Tributi e F24'], ['conti', 'Conti'], ['situazione', 'Situazione']], seg,
        x => W.vai(x === 'scadenziario' ? '#banche' : '#banche/' + x), 'segmenti-fatt');
    }

    function vista(pagina, a1, filtro) {
      const f = filtro || {};
      if (f.giorno) {
        M.giorno = f.giorno;
        // Il giorno della Dashboard deve stare nel periodo che si vede.
        const fra = Math.round((new Date(f.giorno + 'T12:00:00') - new Date(oggi() + 'T12:00:00')) / 86400000);
        if (fra > M.periodo) { M.periodo = fra > 60 ? 90 : 60; M.scad = null; }
      }
      if (f.proposte) M.proposte = true;
      if (f.id && a1 === 'tributi') M.apriImpegno = f.id;
      if (f.id && a1 === 'conti') M.apriConto = f.id;
      if (a1 === 'movimenti') paginaMovimenti(pagina);
      else if (a1 === 'tributi') paginaTributi(pagina);
      else if (a1 === 'conti') paginaConti(pagina);
      else if (a1 === 'situazione') paginaSituazione(pagina);
      else paginaScadenziario(pagina);
    }

    // ===================================================================== SCADENZIARIO

    function paginaScadenziario(pagina) {
      const destra = [
        segmenti([[30, '30 giorni'], [60, '60 giorni'], [90, '90 giorni']], M.periodo, x => { M.periodo = Number(x); M.scad = null; W.disegnaPagina(); }),
        scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloMovimento(null, { dopo: aggiorna }) }, icona('piu', 18, 2.6), 'Registra un movimento') : null,
      ];
      aggiungi(pagina, [testataBanche('Scadenziario', destra), segmentiBanche('scadenziario')]);
      conDati(pagina, async () => {
        await leggiConti();
        const q = '?da=' + oggi() + '&a=' + piuGiorni(oggi(), M.periodo) + (M.idConto ? '&idConto=' + M.idConto : '');
        const [s, sit] = await Promise.all([Rete.get('/server/scadenziario' + q), Rete.get('/server/situazione' + (M.idConto ? '?idConto=' + M.idConto : ''))]);
        M.scad = s;
        M.sit = sit;
      }, () => corpoScadenziario(pagina));
    }

    function aggiorna() { daRileggere(); W.caricaDashboard(); W.disegnaPagina(); }

    function corpoScadenziario(pagina) {
      const s = M.scad;
      const sit = M.sit || {};
      const conti = contiAttivi();
      const sotto30 = C.num(sit.previsto && sit.previsto['30']) < C.num(s.soglia);
      if (conti.length > 1) {
        aggiungi(pagina, [h('div', { class: 'filtri' }, selezione([['', 'Tutti i conti']].concat(conti.map(c => [c.id, nomeConto(c)])), M.idConto, x => { M.idConto = x; daRileggere(); W.disegnaPagina(); }, { 'aria-label': 'Conto' }))]);
      }
      aggiungi(pagina, [h('div', { class: 'quattro-riquadri' },
        W.riquadro(conti.length > 1 && !M.idConto ? 'Nei conti oggi' : 'Nel conto oggi', euro(s.saldoOggi), 'registrato'),
        W.riquadro('Da incassare', euro(sit.daIncassare), C.num(sit.scadutoDaIncassare) ? 'di cui scaduti ' + euro(sit.scadutoDaIncassare) : 'fatture emesse'),
        W.riquadro('Da pagare in 30 giorni', euro(sit.daPagare30), C.num(sit.scadutoDaPagare) ? 'di cui scaduti ' + euro(sit.scadutoDaPagare) : 'fatture ricevute e tributi'),
        W.riquadro('Previsto fra 30 giorni', euro(sit.previsto && sit.previsto['30']), sotto30 ? 'sotto la soglia di ' + euro(s.soglia) : 'saldo prudente', null, sotto30))]);
      aggiungi(pagina, [h('p', { class: 'nota-saldo' }, 'Parte dal saldo di oggi' + (conti.length === 1 ? ' del ' + conti[0].nome : '') + ', ' + euro(s.saldoOggi) +
        (C.num(s.saldoPartenza) !== C.num(s.saldoOggi) ? ', meno le uscite scadute: ' + euro(s.saldoPartenza) : '') + '. ' + (s.nota || 'Gli incassi scaduti non entrano nel saldo previsto') + '.')]);

      const colonne = '84px minmax(0, 1fr) 130px 130px 170px 130px';
      const tab = h('div', { class: 'tab tab-scadenziario' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } },
        h('span', null, 'Giorno'), h('span', null, 'Cosa'), h('span', { class: 'n' }, 'Entrata'), h('span', { class: 'n' }, 'Uscita'), h('span', { class: 'n' }, 'Saldo previsto'), h('span', null, 'Stato')));
      const rigaScad = (r, giorno, rossa) => {
        const parola = r.importoDaScrivere ? 'Da scrivere' : RF.parolaScadenziario(r.stato);
        return h('div', { class: 'r cliccabile riga-scad' + (rossa ? ' sotto-soglia' : ''), style: { gridTemplateColumns: colonne }, role: 'button', tabindex: '0',
          onclick: () => apriRiga(r), onkeydown: e => { if (e.key === 'Enter') apriRiga(r); } },
        h('span', { class: giorno ? 'rosso-testo forte' : '' }, giorno ? giornoBreve(r.data) : ''),
        h('span', { class: 'doppia' }, h('span', null, r.titolo), h('span', null, r.dettaglio || '')),
        h('span', { class: 'n entrata' }, r.verso === 'entrata' ? (r.importoDaScrivere ? 'da scrivere' : segnato('entrata', r.importo)) : ''),
        h('span', { class: 'n' }, r.verso === 'uscita' ? (r.importoDaScrivere ? 'da scrivere' : segnato('uscita', r.importo)) : ''),
        h('span'),
        h('span', null, pillola(parola, r.stato === 'proposto' ? 'giallo' : RF.coloreStato(parola === 'Previsto' ? '' : parola))));
      };
      if ((s.scaduti || []).length) {
        aggiungi(tab, [h('div', { class: 'r intesta-scaduti', style: { gridTemplateColumns: '1fr' } }, h('span', null, 'Scaduti · gli incassi non entrano nel saldo'))]);
        s.scaduti.forEach(r => aggiungi(tab, [rigaScad(r, true, false)]));
      }
      (s.giorni || []).forEach(g => {
        const intesta = h('div', { class: 'r intesta-giorno' + (g.sottoSoglia ? ' sotto-soglia' : '') + (M.giorno === g.data ? ' evidenziato' : ''), style: { gridTemplateColumns: 'minmax(0, 1fr) auto' }, 'data-giorno': g.data },
          h('span', { class: 'forte' }, g.titolo || giornoLungo(g.data)),
          h('span', { class: 'saldo-giorno' }, g.sottoSoglia ? pillola('Sotto soglia', 'rosso') : null, 'saldo previsto ' + euro(g.saldo)));
        aggiungi(tab, [intesta]);
        (g.righe || []).forEach(r => aggiungi(tab, [rigaScad(r, false, g.sottoSoglia)]));
      });
      if (!(s.scaduti || []).length && !(s.giorni || []).length) aggiungi(tab, [h('p', { class: 'vuoto' }, 'Niente in scadenza nei prossimi ' + M.periodo + ' giorni.')]);
      aggiungi(pagina, [tab]);
      if (s.senzaData && s.senzaData.voci) {
        aggiungi(pagina, [h('div', { class: 'tenue' }, 'Senza data: ' + euro(s.senzaData.entrate) + ' di scadenze dei contratti (' + (s.senzaData.voci === 1 ? '1 voce' : s.senzaData.voci + ' voci') + '), non contano nel saldo.')]);
      }
      if (M.giorno) {
        const el = pagina.querySelector('[data-giorno="' + M.giorno + '"]');
        const scorre = document.querySelector('#principale');
        if (el && scorre) setTimeout(() => { scorre.scrollTop += el.getBoundingClientRect().top - scorre.clientHeight / 2; }, 60);
        M.giorno = '';
      }
    }

    /** Tocco su una riga dello scadenziario: la finestra Segna incassato / Segna pagato. */
    async function apriRiga(r) {
      if (r.tipo === 'scadenza') {
        const ok = await conferma('Dal contratto', r.titolo + ': si incassa dopo averla fatturata. La trovi in Da fatturare.', 'Vai a Da fatturare');
        if (ok) W.vai('#fatturazione');
        return;
      }
      if (!scrive()) { avviso('Puoi solo guardare: per segnare incassi e pagamenti chiedi a ' + W.titolare()); return; }
      if (r.tipo === 'fattura') {
        const f = await lavora('Apro la fattura', () => Rete.get('/server/fattura?id=' + r.id));
        if (f && f.fattura) segnaIncasso(f.fattura, aggiorna);
      } else if (r.tipo === 'ricevuta') {
        const x = await lavora('Apro la ricevuta', () => Rete.get('/server/ricevuta?id=' + r.id));
        if (x && x.ricevuta) segnaPagamento({ ricevuta: x.ricevuta }, aggiorna);
      } else if (r.tipo === 'impegno') {
        const x = await lavora('Apro', () => Rete.get('/server/impegni?stato=tutti&da=' + piuGiorni(r.data, -1) + '&a=' + piuGiorni(r.data, 1)));
        const imp = x && (x.impegni || []).find(i => String(i.id) === String(r.id));
        if (imp) moduloImpegno(imp, aggiorna);
      }
    }

    // ===================================================================== SEGNA INCASSO / PAGAMENTO

    /**
     * Segna un incasso (fase4.md §13.2): importo già scritto col residuo, Tutto · In parte,
     * data (oggi), conto, "L'ho visto sull'estratto conto"; giallo Segna l'incasso. Dopo:
     * avviso con Annulla (il movimento si annulla, la fattura torna com'era).
     */
    async function segnaIncasso(f, dopo) {
      await leggiConti().catch(() => null);
      const residuo = C.num(f.residuo);
      apriFinestraSoldi({
        titolo: 'Segna un incasso', sotto: (f.numero || f.riferimento) + ' · ' + f.cliente + ' · restano ' + euro(residuo), residuo, verso: 'entrata', testoGiallo: 'Segna l\'incasso',
        invia: c => Rete.post('/server/segnaIncasso', Object.assign({ idFattura: f.id }, c)),
        fatto: ris => { const st = ris.fattura ? ris.fattura.statoVisto : ''; return 'Incasso segnato' + (st ? ': ' + st.toLowerCase() : ''); },
        dopo,
      });
    }

    /** Segna pagato: una fattura ricevuta o un impegno (tributo, F24, rata). */
    async function segnaPagamento(cosa, dopo) {
      await leggiConti().catch(() => null);
      const x = cosa.ricevuta || cosa.impegno;
      const residuo = C.num(x.daPagare);
      const nome = cosa.ricevuta ? x.fornitore + ' · fattura ' + x.numero : x.descrizione;
      apriFinestraSoldi({
        titolo: 'Segna pagato', sotto: nome + (residuo ? ' · da pagare ' + euro(residuo) : ''), residuo, verso: 'uscita', testoGiallo: 'Segna il pagamento',
        importoLibero: !residuo,
        invia: c => Rete.post('/server/segnaPagamento', Object.assign(cosa.ricevuta ? { idRicevuta: x.id } : { idImpegno: x.id }, c)),
        fatto: () => 'Pagamento segnato',
        dopo,
      });
    }

    function apriFinestraSoldi(o) {
      let parte = false;
      const importo = h('input', { type: 'text', inputmode: 'decimal', class: 'importo-grande', value: o.residuo ? C.numero(o.residuo) : '', readonly: !o.importoLibero, 'aria-label': 'Importo' });
      const data = h('input', { type: 'date', value: oggi(), max: oggi() });
      const conti = contiAttivi();
      const p = predefinito();
      let idConto = p ? p.id : '';
      const verificato = h('input', { type: 'checkbox' });
      const zonaImporto = h('div');
      const disegnaImporto = errore => aggiungi(svuota(zonaImporto), [campo('Importo', B.conSuffisso(importo, '€'), errore)]);
      let chiudi;
      const zona = h('div', { class: 'fila' },
        h('p', { class: 'sotto-titolo', style: { margin: 0 } }, o.sotto),
        o.residuo ? segmenti([['tutto', 'Tutto'], ['parte', 'In parte']], 'tutto', x => {
          parte = x === 'parte';
          importo.readOnly = !parte;
          if (!parte) importo.value = C.numero(o.residuo); else { importo.value = ''; importo.focus(); }
          zona.querySelectorAll('.segmenti button').forEach(b => { const si = (b.textContent === 'In parte') === parte; b.classList.toggle('scelto', si); b.setAttribute('aria-pressed', si ? 'true' : 'false'); });
        }) : null,
        zonaImporto,
        h('div', { class: 'riga-campi' }, campo('Data', data),
          conti.length ? campo('Conto', selezione(conti.map(c => [c.id, nomeConto(c)]), idConto, x => { idConto = Number(x); })) : h('div', { class: 'campo' }, h('label', null, 'Conto'), h('b', null, 'Prima scrivi il conto in Conti'))),
        h('label', { class: 'spunta-campo riquadrata' }, verificato, 'L\'ho visto sull\'estratto conto'));
      disegnaImporto();
      const vai = async () => {
        const v = RF.leggiImporto(importo.value);
        if (v === null || v <= 0) { disegnaImporto('Importo: scrivi quanto'); importo.focus(); return; }
        if (o.residuo && v > o.residuo + 0.004) { disegnaImporto('Al massimo ' + euro(o.residuo)); importo.focus(); return; }
        const corpo = { importo: v, data: data.value || oggi(), verificato: verificato.checked };
        if (idConto) corpo.idConto = idConto;
        const ris = await lavora('Segno', () => o.invia(corpo));
        if (!ris) return;
        chiudi();
        const mov = ris.movimento;
        avviso(o.fatto(ris), false, null, mov ? { testo: 'Annulla', fn: async () => {
          const r = await lavora('Annullo', () => Rete.post('/server/annullaMovimento', { id: mov.id, motivo: 'segnato per sbaglio, annullato subito' }));
          if (r) { avviso('Annullato: è tornato com\'era'); daRileggere(); if (o.dopo) o.dopo(); }
        } } : null);
        daRileggere();
        W.caricaDashboard();
        if (o.dopo) o.dopo(ris);
      };
      chiudi = finestra({ titolo: o.titolo, corpo: [zona], fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, o.testoGiallo)] });
    }

    // ===================================================================== MOVIMENTI

    function paginaMovimenti(pagina) {
      aggiungi(pagina, [testataBanche('Movimenti', [h('button', { type: 'button', class: 'btn', onclick: () => W.esporta('movimenti', filtriMov()) }, icona('scarica', 18, 2.4), 'Esporta'),
        scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloMovimento(null, { dopo: aggiorna }) }, icona('piu', 18, 2.6), 'Nuovo movimento') : null]), segmentiBanche('movimenti')]);
      const area = h('div', { class: 'sezione' });
      const f = M.filtroMov;
      let timer = null;
      aggiungi(pagina, [h('div', { class: 'filtri' },
        cerca(f.testo, 'Descrizione, chi, importo', v => { f.testo = v; clearTimeout(timer); timer = setTimeout(() => { M.mov = null; leggiEDisegna(); }, 300); }),
        h('div', { class: 'pillole' }, [['tutti', 'Tutti'], ['incassi', 'Incassi'], ['pagamenti', 'Pagamenti'], ['verificare', 'Da verificare']].map(p =>
          h('button', { type: 'button', class: 'pillola' + (f.pill === p[0] ? ' scelta' : ''), 'aria-pressed': f.pill === p[0] ? 'true' : 'false', onclick: () => { f.pill = p[0]; M.mov = null; M.sceltiMov.clear(); W.disegnaPagina(); } }, p[1])))),
      area]);
      const leggiEDisegna = () => {
        svuota(area);
        conDati(area, async () => { await leggiConti(); M.mov = await Rete.get('/server/movimenti?' + new URLSearchParams(filtriMov()).toString()); }, () => elencoMovimenti(area));
      };
      leggiEDisegna();
    }

    function filtriMov() {
      const f = M.filtroMov;
      const q = {};
      if (f.pill === 'incassi') q.verso = 'entrata';
      if (f.pill === 'pagamenti') q.verso = 'uscita';
      if (f.pill === 'verificare') q.verificato = 0;
      if (f.testo) q.testo = f.testo;
      if (f.idConto) q.idConto = f.idConto;
      return q;
    }

    function elencoMovimenti(area) {
      const lista = (M.mov && M.mov.movimenti) || [];
      const colonne = (scrive() ? '28px ' : '') + '68px minmax(0, 1.6fr) minmax(0, 1fr) 130px 170px';
      if (lista.length) {
        const tab = h('div', { class: 'tab' + (M.sceltiMov.size ? ' con-scelti' : '') }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } },
          scrive() ? h('span') : null, h('span', null, 'Data'), h('span', null, 'Descrizione'), h('span', null, 'Chi'), h('span', { class: 'n' }, 'Importo'), h('span', null, 'Stato')));
        lista.forEach(m => {
          const casella = scrive() ? h('input', { type: 'checkbox', class: 'casella', checked: M.sceltiMov.has(m.id), 'aria-label': 'Scegli il movimento',
            onclick: e => { e.stopPropagation(); if (e.target.checked) M.sceltiMov.add(m.id); else M.sceltiMov.delete(m.id); svuota(area); elencoMovimenti(area); } }) : null;
          aggiungi(tab, [h('div', { class: 'r cliccabile' + (m.annullato ? ' annullato' : ''), style: { gridTemplateColumns: colonne }, role: 'button', tabindex: '0',
            onclick: () => moduloMovimento(m, { dopo: aggiorna }), onkeydown: e => { if (e.key === 'Enter') moduloMovimento(m, { dopo: aggiorna }); } },
          scrive() ? h('span', null, casella) : null,
          h('span', null, giornoBreve(m.data)),
          h('span', { class: 'doppia' }, h('span', null, m.descrizione || (m.verso === 'entrata' ? 'Entrata' : 'Uscita')),
            h('span', null, [(m.abbinamenti || []).map(a => (a.tipo === 'fattura' ? 'fattura ' : a.tipo === 'ricevuta' ? 'ricevuta ' : '') + (a.etichetta || a.id) + ' · ' + euro(a.importo)).join(', '), contiAttivi().length > 1 ? m.conto : ''].filter(Boolean).join(' · '))),
          h('span', { class: 'taglia t2' }, m.soggetto || '—'),
          h('span', { class: 'n forte ' + (m.verso === 'entrata' ? 'entrata' : '') }, segnato(m.verso, m.importo)),
          h('span', null, m.annullato ? pillola('Annullato', 'grigio') : pillStato(m.verificato ? 'Verificato in banca' : 'Registrato')))]);
        });
        aggiungi(area, [tab, h('div', { class: 'totali-fondo' }, h('span', null, 'Entrate ' + euro(M.mov.entrate)), h('span', null, 'Uscite ' + euro(M.mov.uscite)),
          M.mov.daVerificare ? h('b', null, M.mov.daVerificare + ' da verificare') : null)]);
      } else {
        aggiungi(area, [h('p', { class: 'vuoto' }, 'Nessun movimento con questi filtri.')]);
      }
      aggiungi(area, [h('div', { class: 'scheda riga-non-collegata' }, quadrato('importa'), h('span', { class: 'corpo' }, h('b', null, 'Importa estratto conto'), h('span', { class: 'tenue' }, 'CSV o OFX della banca')), nonCollegato())]);
      if (M.sceltiMov.size && scrive()) {
        const ids = Array.from(M.sceltiMov);
        aggiungi(area, [h('div', { class: 'barra-scelti' }, h('b', null, ids.length === 1 ? '1 scelto' : ids.length + ' scelti'),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => verifica(ids, true) }, 'Segna verificati'),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => verifica(ids, false) }, 'Togli la verifica'),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => { M.sceltiMov.clear(); svuota(area); elencoMovimenti(area); } }, 'Deseleziona'))]);
      }
    }

    async function verifica(ids, si) {
      const ris = await lavora('Aggiorno', () => Rete.post('/server/verificaMovimenti', { ids, verificato: si }));
      if (!ris) return;
      M.sceltiMov.clear();
      const n = ris.fatte;
      avviso(si ? (n === 1 ? '1 movimento verificato in banca' : n + ' movimenti verificati in banca') : (n === 1 ? '1 movimento di nuovo solo registrato' : n + ' movimenti di nuovo solo registrati'));
      aggiorna();
    }

    /**
     * Nuovo movimento (e correggi): entrata o uscita, importo, data, conto, descrizione, chi,
     * categoria, "Abbina a…" con le fatture o le ricevute aperte di quel soggetto (e gli
     * impegni aperti) e quanto ne paga, "L'ho visto sull'estratto conto".
     */
    async function moduloMovimento(m0, opzioni) {
      const o = opzioni || {};
      await leggiConti().catch(() => null);
      const nuovo = !m0;
      const sola = !scrive() || (m0 && m0.annullato);
      const m = m0 ? JSON.parse(JSON.stringify(m0)) : { verso: 'entrata', importo: '', data: oggi(), idConto: (predefinito() || {}).id || '', descrizione: '', idSoggetto: '', categoria: 'incasso', verificato: false, abbinamenti: [] };
      const abb = new Map((m.abbinamenti || []).map(a => [a.tipo + ':' + a.id, Object.assign({}, a)]));
      const importo = h('input', { type: 'text', inputmode: 'decimal', class: 'importo-grande', value: m.importo !== '' ? C.numero(m.importo) : '', disabled: sola, 'aria-label': 'Importo' });
      const data = h('input', { type: 'date', value: m.data, disabled: sola });
      const descrizione = h('input', { type: 'text', value: m.descrizione || '', disabled: sola });
      const verificato = h('input', { type: 'checkbox', checked: !!m.verificato, disabled: sola });
      const zona = h('div', { class: 'fila' });
      const zonaAbb = h('div', { class: 'fila' });
      let aperti = [];
      let chiudi;
      const CATEGORIE = [['incasso', 'Incasso'], ['pagamento', 'Pagamento'], ['tributo', 'Tributo'], ['stipendio', 'Stipendio'], ['giroconto', 'Giroconto'], ['altro', 'Altro']];
      const soggetti = S.ana.soggetti.filter(s => !s.archiviato).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

      async function leggiAperti() {
        aperti = [];
        if (!m.idSoggetto && m.verso === 'entrata') { disegnaAbb(); return; }
        try {
          if (m.verso === 'entrata') {
            const r = await Rete.get('/server/fatture?idCliente=' + encodeURIComponent(m.idSoggetto));
            aperti = (r.fatture || []).filter(f => f.tipo === 'fattura' && (f.stato === 'emessa' || f.stato === 'pronta') && C.num(f.residuo) > 0.004)
              .map(f => ({ tipo: 'fattura', id: f.id, etichetta: f.numero || f.riferimento, sotto: f.cliente + ' · restano ' + euro(f.residuo), residuo: C.num(f.residuo) }));
          } else {
            const lavori = [Rete.get('/server/impegni?stato=aperti').catch(() => ({ impegni: [] }))];
            if (m.idSoggetto) lavori.push(Rete.get('/server/ricevute?stato=da_pagare&idFornitore=' + encodeURIComponent(m.idSoggetto)).catch(() => ({ ricevute: [] })));
            const [imp, ric] = await Promise.all(lavori);
            aperti = ((ric && ric.ricevute) || []).map(x => ({ tipo: 'ricevuta', id: x.id, etichetta: 'Fattura ' + x.numero, sotto: x.fornitore + ' · da pagare ' + euro(x.daPagare), residuo: C.num(x.daPagare) }))
              .concat(((imp && imp.impegni) || []).filter(i => i.verso !== 'entrata').slice(0, 12).map(i => ({ tipo: 'impegno', id: i.id, etichetta: i.descrizione, sotto: 'scade il ' + C.data(i.scadenza) + (i.importoDaScrivere ? ' · importo da scrivere' : ' · ' + euro(i.daPagare)), residuo: C.num(i.daPagare) })));
          }
        } catch (e) { aperti = []; }
        // Quelli già abbinati restano in vista anche se ora sono pagati.
        abb.forEach((a, k) => { if (!aperti.some(x => x.tipo + ':' + x.id === k)) aperti.unshift({ tipo: a.tipo, id: a.id, etichetta: a.etichetta || String(a.id), sotto: 'già abbinato', residuo: C.num(a.importo) }); });
        disegnaAbb();
      }

      function disegnaAbb() {
        svuota(zonaAbb);
        if (!aperti.length) {
          aggiungi(zonaAbb, [h('span', { class: 'etichetta' }, 'Abbina a…'), h('span', { class: 'tenue' }, m.verso === 'entrata' ? (m.idSoggetto ? 'Nessuna fattura da incassare di questo cliente.' : 'Scegli chi ha pagato per vedere le sue fatture.') : 'Niente da pagare da abbinare.')]);
          return;
        }
        const colonne = '28px minmax(0, 1fr) 140px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } }, h('span'), h('span', null, 'Abbina a…'), h('span', { class: 'n' }, 'Quanto')));
        aperti.forEach(x => {
          const k = x.tipo + ':' + x.id;
          const si = abb.has(k);
          const quanto = h('input', { type: 'text', inputmode: 'decimal', class: 'num-riga', value: si ? C.numero(abb.get(k).importo) : '', disabled: sola || !si, 'aria-label': 'Quanto paga di ' + x.etichetta,
            onchange: e => { const v = RF.leggiImporto(e.target.value); if (v !== null) abb.get(k).importo = v; } });
          aggiungi(tab, [h('div', { class: 'r', style: { gridTemplateColumns: colonne } },
            h('input', { type: 'checkbox', class: 'casella-df', checked: si, disabled: sola, 'aria-label': 'Abbina a ' + x.etichetta, onclick: e => {
              if (e.target.checked) {
                const resto = Math.max(0, (RF.leggiImporto(importo.value) || 0) - Array.from(abb.values()).reduce((a, y) => a + C.num(y.importo), 0));
                abb.set(k, { tipo: x.tipo, id: x.id, etichetta: x.etichetta, importo: Math.round(Math.min(x.residuo || resto, resto || x.residuo) * 100) / 100 });
              } else abb.delete(k);
              disegnaAbb();
            } }),
            h('span', { class: 'doppia' }, h('span', null, x.etichetta), h('span', null, x.sotto)), quanto)]);
        });
        aggiungi(zonaAbb, [tab]);
      }

      function disegna() {
        svuota(zona);
        aggiungi(zona, [
          m0 && m0.annullato ? h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Movimento annullato' + (m0.motivo ? ': ' + m0.motivo : ''))) : null,
          segmenti([['entrata', 'Entrata'], ['uscita', 'Uscita']], m.verso, x => { if (sola) return; m.verso = x; m.categoria = x === 'entrata' ? 'incasso' : 'pagamento'; abb.clear(); disegna(); leggiAperti(); }),
          h('div', { class: 'riga-campi' }, campo('Importo', B.conSuffisso(importo, '€')), campo('Data', data)),
          h('div', { class: 'riga-campi' },
            campo('Conto', selezione(contiAttivi().map(c => [c.id, nomeConto(c)]), m.idConto, x => { m.idConto = Number(x); }, { disabled: sola })),
            campo(m.verso === 'entrata' ? 'Chi ha pagato' : 'A chi', selezione([['', 'Nessuno']].concat(soggetti.map(s => [s.id, s.nome])), m.idSoggetto || '', x => { m.idSoggetto = x; abb.clear(); leggiAperti(); }, { disabled: sola }))),
          campo('Descrizione', descrizione),
          h('div', { class: 'campo' }, h('label', null, 'Categoria'), h('div', { class: 'pillole' }, CATEGORIE.map(c => h('button', { type: 'button', class: 'pillola' + (m.categoria === c[0] ? ' scelta' : ''), disabled: sola,
            'aria-pressed': m.categoria === c[0] ? 'true' : 'false', onclick: () => { m.categoria = c[0]; disegna(); } }, c[1])))),
          zonaAbb,
          h('label', { class: 'spunta-campo riquadrata' }, verificato, 'L\'ho visto sull\'estratto conto')]);
      }
      disegna();
      leggiAperti();

      const salva = async () => {
        const v = RF.leggiImporto(importo.value);
        if (v === null || v <= 0) { avviso('Importo: scrivi quanto', true); importo.focus(); return; }
        const corpo = { movimento: { idConto: m.idConto, data: data.value, verso: m.verso, importo: v, descrizione: descrizione.value.trim(), idSoggetto: m.idSoggetto || '', categoria: m.categoria,
          verificato: verificato.checked, abbinamenti: Array.from(abb.values()).filter(a => C.num(a.importo) > 0).map(a => ({ tipo: a.tipo, id: a.id, importo: a.importo })) } };
        if (m0) corpo.movimento.id = m0.id;
        const ris = await lavora('Salvo il movimento', () => Rete.post('/server/salvaMovimento', corpo));
        if (!ris) return;
        chiudi();
        avviso(nuovo ? 'Movimento registrato' : 'Movimento salvato');
        if (o.dopo) o.dopo(ris);
      };
      const annulla = () => {
        const motivo = h('input', { type: 'text' });
        let chiudi2;
        chiudi2 = finestra({ titolo: 'Annullare il movimento?', corpo: [h('p', { style: { margin: 0, fontSize: '16px' } }, 'Non si cancella: resta nell\'elenco come annullato. Le fatture e le ricevute che pagava tornano da incassare o da pagare.'), campo('Perché', motivo)],
          pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi2() }, 'Lascia'), h('button', { type: 'button', class: 'btn grande pericolo', onclick: async () => {
            const r = await lavora('Annullo', () => Rete.post('/server/annullaMovimento', { id: m0.id, motivo: motivo.value.trim() }));
            if (!r) return;
            chiudi2(); chiudi(); avviso('Movimento annullato'); if (o.dopo) o.dopo(r);
          } }, 'Annulla il movimento')] });
      };
      const altro = m0 && !sola ? h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18)) : null;
      if (altro) altro.addEventListener('click', () => apriMenu(altro, [{ testo: 'Annulla il movimento', pericolo: true, fn: annulla }]));
      chiudi = finestra({ titolo: nuovo ? 'Nuovo movimento' : 'Movimento del ' + C.data(m.data), testaExtra: altro, corpo: [zona], larghezza: 'media', fuoco: nuovo,
        pulsanti: sola ? ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')]
          : ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, nuovo ? 'Registra' : 'Salva')] });
    }

    // ===================================================================== TRIBUTI E F24

    function paginaTributi(pagina) {
      aggiungi(pagina, [testataBanche('Tributi, F24 e rate', scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloImpegno(null, aggiorna) }, icona('piu', 18, 2.6), 'Nuovo tributo') : null),
        segmentiBanche('tributi')]);
      conDati(pagina, async () => { await leggiConti().catch(() => null); M.impegni = await Rete.get('/server/impegni?stato=tutti&da=' + piuGiorni(oggi(), -60)); }, () => {
        const tutti = (M.impegni && M.impegni.impegni) || [];
        const aperti = tutti.filter(i => i.stato === 'aperto' || i.stato === 'in_parte').sort((a, b) => a.scadenza.localeCompare(b.scadenza));
        const pagati = tutti.filter(i => i.stato === 'pagato').sort((a, b) => b.scadenza.localeCompare(a.scadenza)).slice(0, 8);
        const proposte = aperti.filter(i => i.proposta);
        if (proposte.length) {
          aggiungi(pagina, [h('div', { class: 'filtri' }, h('div', { class: 'pillole' }, [['tutti', 'Tutti'], ['proposte', 'Proposte di Wisper · ' + proposte.length]].map(p =>
            h('button', { type: 'button', class: 'pillola' + ((M.proposte ? 'proposte' : 'tutti') === p[0] ? ' scelta' : ''), onclick: () => { M.proposte = p[0] === 'proposte'; W.disegnaPagina(); } }, p[1]))))]);
        }
        const lista = (M.proposte ? proposte : aperti).concat(M.proposte ? [] : pagati);
        const colonne = '70px minmax(0, 1.8fr) 80px 120px 110px 220px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } },
          h('span', null, 'Scadenza'), h('span', null, 'Descrizione'), h('span', null, 'Codice'), h('span', { class: 'n' }, 'Importo'), h('span', null, 'Ripete'), h('span', null, 'Stato')));
        lista.forEach(i => {
          const pagato = i.stato === 'pagato';
          const parola = i.proposta ? 'Proposta' : i.statoVisto;
          aggiungi(tab, [h('div', { class: 'r cliccabile' + (pagato ? ' spento' : ''), style: { gridTemplateColumns: colonne }, role: 'button', tabindex: '0',
            onclick: () => moduloImpegno(i, aggiorna), onkeydown: e => { if (e.key === 'Enter') moduloImpegno(i, aggiorna); } },
          h('span', { class: i.scaduto ? 'rosso-testo forte' : '' }, giornoBreve(i.scadenza)),
          h('span', { class: 'doppia' }, h('span', null, i.descrizione), h('span', null, [i.soggetto, i.conto && contiAttivi().length > 1 ? i.conto : '', i.note].filter(Boolean).join(' · '))),
          h('span', { class: 't2' }, i.codice || '—'),
          h('span', { class: 'n forte' }, i.importoDaScrivere ? h('span', { class: 'tenue' }, 'da scrivere') : euro(i.importo)),
          h('span', { class: 't2' }, i.ripete || '—'),
          h('span', { class: 'stato-impegno' }, pillola(parola, i.proposta ? 'giallo' : RF.coloreStato(parola)),
            i.proposta && scrive() ? h('button', { type: 'button', class: 'btn piccolo', onclick: e => { e.stopPropagation(); confermaProposta(i); } }, 'Conferma') : null))]);
        });
        if (!lista.length) aggiungi(tab, [h('p', { class: 'vuoto' }, 'Nessun tributo o rata da pagare.')]);
        aggiungi(pagina, [tab]);
        if (M.apriImpegno) { const x = tutti.find(i => String(i.id) === String(M.apriImpegno)); M.apriImpegno = null; if (x) moduloImpegno(x, aggiorna); }
      });
    }

    async function confermaProposta(i) {
      const ris = await lavora('Confermo', () => Rete.post('/server/confermaImpegno', { id: i.id }));
      if (!ris) return;
      avviso('Proposta confermata: ' + i.descrizione);
      aggiorna();
    }

    /**
     * Un tributo, un F24 o una rata (fase4.md §10.5): tipo, descrizione, codice, scadenza,
     * importo (anche "da scrivere"), conto, ripeti (mai, ogni mese, ogni 3 mesi, ogni anno),
     * note. Su una ricorrente si chiede "solo questa · da questa in poi · tutte".
     */
    function moduloImpegno(x0, dopo) {
      const nuovo = !x0;
      const sola = !scrive() || (x0 && (x0.annullato || x0.stato === 'pagato'));
      const x = x0 ? JSON.parse(JSON.stringify(x0)) : { tipo: 'f24', descrizione: '', codice: '', scadenza: oggi(), importo: null, idConto: null, note: '', ricorrenza: null };
      const RIPETI = [['mai', 'Mai', null], ['mese', 'Ogni mese', { regola: 'mesi', ogni: 1 }], ['tremesi', 'Ogni 3 mesi', { regola: 'mesi', ogni: 3 }], ['anno', 'Ogni anno', { regola: 'anni', ogni: 1 }]];
      const ripetiDi = r => !r ? 'mai' : r.regola === 'anni' ? 'anno' : Number(r.ogni) === 3 ? 'tremesi' : 'mese';
      let ripeti = ripetiDi(x.ricorrenza);
      const v = {
        descrizione: h('input', { type: 'text', value: x.descrizione || '', disabled: sola }),
        codice: h('input', { type: 'text', value: x.codice || '', disabled: sola, placeholder: '1040, 6033…' }),
        scadenza: h('input', { type: 'date', value: x.scadenza || oggi(), disabled: sola }),
        importo: h('input', { type: 'text', inputmode: 'decimal', value: x.importo === null || x.importo === undefined ? '' : C.numero(x.importo), placeholder: 'da scrivere', disabled: sola }),
        fine: h('input', { type: 'date', value: (x.ricorrenza && x.ricorrenza.fine) || '', disabled: sola }),
        note: h('textarea', { rows: 2, disabled: sola }),
      };
      v.note.value = x.note || '';
      const zona = h('div', { class: 'fila' });
      let chiudi;
      const disegna = () => {
        svuota(zona);
        aggiungi(zona, [
          x.proposta ? h('div', { class: 'banda giallina' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Proposta di Wisper: controlla l\'importo, poi confermala. Cambiarla la conferma.')) : null,
          h('div', { class: 'campo' }, h('label', null, 'Che cos\'è'), segmenti([['f24', 'F24'], ['tributo', 'Tributo'], ['rata', 'Rata'], ['altro', 'Altro']], x.tipo, t => { if (sola) return; x.tipo = t; disegna(); })),
          campo('Descrizione', v.descrizione),
          h('div', { class: 'riga-campi' }, campo('Codice', v.codice), campo('Scadenza', v.scadenza), campo('Importo', B.conSuffisso(v.importo, '€'))),
          contiAttivi().length > 1 ? campo('Conto', selezione([['', 'Il conto predefinito']].concat(contiAttivi().map(c => [c.id, nomeConto(c)])), x.idConto || '', t => { x.idConto = t ? Number(t) : null; }, { disabled: sola })) : null,
          h('div', { class: 'campo' }, h('label', null, 'Ripeti'), segmenti(RIPETI.map(r => [r[0], r[1]]), ripeti, t => { if (sola) return; ripeti = t; disegna(); })),
          ripeti !== 'mai' ? campo('Ripeti fino al', v.fine) : null,
          campo('Note', v.note),
          x0 && (x0.pagamenti || []).length ? h('div', { class: 'tenue' }, 'Pagato ' + euro(x0.pagato) + (C.num(x0.daPagare) ? ', restano ' + euro(x0.daPagare) : '')) : null]);
      };
      disegna();
      const corpoImpegno = () => {
        const imp = v.importo.value.trim() ? RF.leggiImporto(v.importo.value) : null;
        const r = RIPETI.find(y => y[0] === ripeti)[2];
        const o = { tipo: x.tipo, descrizione: v.descrizione.value.trim(), codice: v.codice.value.trim(), scadenza: v.scadenza.value, importo: imp, idConto: x.idConto || null, note: v.note.value,
          ricorrenza: r ? Object.assign({}, r, v.fine.value ? { fine: v.fine.value } : {}) : null };
        if (x0) o.id = x0.id;
        return o;
      };
      const salva = async () => {
        const impegno = corpoImpegno();
        let perRicorrenza;
        if (x0 && x0.idRicorrenza) {
          perRicorrenza = await sceltaRicorrenza('Cambiare solo questa scadenza?');
          if (!perRicorrenza) return;
        }
        const ris = await lavora('Salvo', () => Rete.post('/server/salvaImpegno', perRicorrenza ? { impegno, perRicorrenza } : { impegno }));
        if (!ris) return;
        chiudi();
        avviso(nuovo ? (ris.occorrenze ? 'Fatto: ' + ris.occorrenze + ' scadenze nei prossimi 12 mesi' : 'Tributo aggiunto') : 'Salvato');
        if (dopo) dopo(ris);
      };
      const togli = async () => {
        let perRicorrenza;
        if (x0.idRicorrenza) { perRicorrenza = await sceltaRicorrenza('Togliere solo questa scadenza?'); if (!perRicorrenza) return; }
        else if (!(await conferma('Togliere?', x0.descrizione + ': non si cancella, resta segnato come tolto.', 'Togli', true))) return;
        const ris = await lavora('Tolgo', () => Rete.post('/server/togliImpegno', Object.assign({ id: x0.id, motivo: 'tolto a mano' }, perRicorrenza ? { perRicorrenza } : {})));
        if (!ris) return;
        chiudi();
        avviso(ris.tolti > 1 ? ris.tolti + ' scadenze tolte' : 'Tolto');
        if (dopo) dopo(ris);
      };
      const pagabile = x0 && !sola && scrive() && !x0.annullato && x0.stato !== 'pagato';
      const altro = x0 && !sola ? h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18)) : null;
      if (altro) altro.addEventListener('click', () => apriMenu(altro, [x0.proposta ? { testo: 'Conferma la proposta', fn: () => { chiudi(); confermaProposta(x0); } } : null, { testo: 'Togli', pericolo: true, fn: togli }]));
      chiudi = finestra({ titolo: nuovo ? 'Nuovo tributo' : x.descrizione, testaExtra: altro, corpo: [zona],
        pulsanti: sola ? ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] : ['spazio',
          h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn grande' + (pagabile ? '' : ' giallo'), onclick: salva }, 'Salva'),
          pagabile ? h('button', { type: 'button', class: 'btn grande giallo', onclick: () => { chiudi(); segnaPagamento({ impegno: x0 }, dopo); } }, 'Segna pagato') : null] });
    }

    function sceltaRicorrenza(titolo) {
      return new Promise(ok => {
        let chiudi;
        let detto = false;
        const di = v => { if (!detto) { detto = true; ok(v); } chiudi(); };
        chiudi = finestra({ titolo, corpo: h('p', { style: { margin: 0, fontSize: '16px' } }, 'È una scadenza che si ripete.'), fuoco: false, allaChiusura: () => { if (!detto) { detto = true; ok(null); } },
          pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => di('tutte') }, 'Tutte'), h('button', { type: 'button', class: 'btn grande', onclick: () => di('future') }, 'Da questa in poi'),
            h('button', { type: 'button', class: 'btn giallo grande', onclick: () => di('questa') }, 'Solo questa')] });
      });
    }

    // ===================================================================== CONTI

    function paginaConti(pagina) {
      aggiungi(pagina, [testataBanche('Conti', [scrive() ? h('button', { type: 'button', class: 'btn', onclick: () => moduloConto(null) }, icona('piu', 18, 2.6), 'Nuovo conto') : null,
        scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: () => aggiornaSaldo(null) }, 'Aggiorna il saldo') : null]), segmentiBanche('conti')]);
      conDati(pagina, () => leggiConti(true), () => {
        const conti = (M.conti && M.conti.conti) || [];
        const zona = h('div', { class: 'sezione stretta-820' });
        if (!conti.length) aggiungi(zona, [h('div', { class: 'calmo' }, icona('banca', 20, 2.2), 'Nessun conto: scrivi quello dello studio per avere saldo e scadenziario.')]);
        conti.forEach(c => {
          const soglia = c.soglia === null || c.soglia === undefined ? C.num(S.ana.impostazioni.SOGLIA_CASSA || 3000) : C.num(c.soglia);
          aggiungi(zona, [h('button', { type: 'button', class: 'scheda scheda-conto' + (c.attivo === false ? ' spento' : ''), onclick: () => moduloConto(c) },
            h('div', { class: 'testa-conto' }, quadrato('banca', 'ico-blu'), h('span', { class: 'corpo' }, h('b', null, nomeConto(c)),
              h('span', { class: 'tenue' }, [c.banca, c.predefinito ? 'predefinito' : '', 'soglia ' + euro(soglia), c.attivo === false ? 'chiuso' : ''].filter(Boolean).join(' · ')))),
            h('div', { class: 'saldo-conto' }, euro(c.saldo)),
            h('div', { class: 'tenue' }, (c.saldoAl ? 'dall\'ultimo saldo scritto il ' + giornoBreve(c.saldoAl) + ' (' + euro(c.saldoScritto) + ')' : 'nessun saldo scritto: contano tutti i movimenti') +
              ' · ' + (c.movimentiDopo === 1 ? '1 movimento dopo' : (c.movimentiDopo || 0) + ' movimenti dopo') + ((c.verificatiDopo || 0) ? ', ' + c.verificatiDopo + ' verificati in banca' : '')))]);
        });
        aggiungi(zona, [h('div', { class: 'scheda riga-non-collegata' }, quadrato('scollegato'), h('span', { class: 'corpo' }, h('b', null, 'Collegamento alla banca'), h('span', { class: 'tenue' }, 'I movimenti si scrivono a mano')), nonCollegato())]);
        aggiungi(pagina, [zona]);
        if (M.apriConto) { const x = conti.find(c => String(c.id) === String(M.apriConto)); M.apriConto = null; if (x) aggiornaSaldo(x); }
      });
    }

    /** Nuovo conto o correggi: nome, banca, IBAN intero (solo chi scrive lo vede), predefinito, soglia, note. */
    function moduloConto(c0) {
      const sola = !scrive();
      const c = c0 ? Object.assign({}, c0) : { nome: '', banca: '', iban: '', predefinito: !contiAttivi().length, soglia: null, attivo: true, note: '' };
      const v = {
        nome: h('input', { type: 'text', value: c.nome || '', disabled: sola }),
        banca: h('input', { type: 'text', value: c.banca || '', disabled: sola }),
        iban: h('input', { type: 'text', value: c.iban ? RF.ibanAGruppi(c.iban) : '', disabled: sola, autocomplete: 'off', spellcheck: 'false', placeholder: c0 && !c.iban && c.ultimeCifre ? '…' + c.ultimeCifre : '' }),
        soglia: h('input', { type: 'text', inputmode: 'decimal', value: c.soglia === null || c.soglia === undefined ? '' : C.numero(c.soglia), placeholder: C.numero(S.ana.impostazioni.SOGLIA_CASSA || 3000) + ' (di tutti i conti)', disabled: sola }),
        predefinito: h('input', { type: 'checkbox', checked: !!c.predefinito, disabled: sola }),
        attivo: h('input', { type: 'checkbox', checked: c.attivo !== false, disabled: sola }),
        note: h('textarea', { rows: 2, disabled: sola }),
      };
      v.note.value = c.note || '';
      const zonaIban = h('div', null, campo('IBAN', v.iban));
      let chiudi;
      const salva = async () => {
        const iban = v.iban.value.replace(/\s+/g, '').toUpperCase();
        if (iban && !RF.ibanValido(iban)) { aggiungi(svuota(zonaIban), [campo('IBAN', v.iban, 'IBAN: non sembra giusto')]); v.iban.focus(); return; }
        const conto = { nome: v.nome.value.trim(), banca: v.banca.value.trim(), predefinito: v.predefinito.checked, attivo: v.attivo.checked, note: v.note.value,
          soglia: v.soglia.value.trim() ? RF.leggiImporto(v.soglia.value) : null };
        if (iban || (c0 && c0.iban !== undefined)) conto.iban = iban;
        if (c0) conto.id = c0.id;
        const ris = await lavora('Salvo il conto', () => Rete.post('/server/salvaConto', { conto }));
        if (!ris) return;
        chiudi();
        avviso(c0 ? 'Conto salvato' : 'Conto aggiunto');
        aggiorna();
      };
      chiudi = finestra({ titolo: c0 ? nomeConto(c0) : 'Nuovo conto', corpo: [h('div', { class: 'fila' }, h('div', { class: 'riga-campi' }, campo('Nome', v.nome), campo('Banca', v.banca)), zonaIban,
        campo('Soglia del saldo', B.conSuffisso(v.soglia, '€')), h('label', { class: 'spunta-campo' }, v.predefinito, 'Conto predefinito (per le fatture e i pagamenti)'),
        c0 ? h('label', { class: 'spunta-campo' }, v.attivo, 'Conto in uso') : null, campo('Note', v.note))],
      pulsanti: sola ? ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')]
        : ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')] });
    }

    /** Aggiorna il saldo: il saldo letto in banca in quel giorno (il punto da cui si contano i movimenti). */
    function aggiornaSaldo(c0) {
      const conti = contiAttivi();
      if (!conti.length) { avviso('Scrivi prima il conto dello studio', true); moduloConto(null); return; }
      let idConto = (c0 || predefinito() || conti[0]).id;
      const saldo = h('input', { type: 'text', inputmode: 'decimal', class: 'importo-grande', 'aria-label': 'Saldo letto in banca' });
      const data = h('input', { type: 'date', value: oggi(), max: oggi() });
      const zonaSaldo = h('div', null, campo('Saldo letto in banca', B.conSuffisso(saldo, '€')));
      let chiudi;
      const vai = async () => {
        const v = RF.leggiImporto(saldo.value);
        if (v === null) { aggiungi(svuota(zonaSaldo), [campo('Saldo letto in banca', B.conSuffisso(saldo, '€'), 'Saldo: scrivi il saldo letto in banca')]); saldo.focus(); return; }
        const ris = await lavora('Aggiorno il saldo', () => Rete.post('/server/aggiornaSaldo', { idConto, data: data.value || oggi(), saldo: v }));
        if (!ris) return;
        chiudi();
        avviso('Saldo aggiornato: ' + euro(ris.conto ? ris.conto.saldo : v));
        aggiorna();
      };
      chiudi = finestra({ titolo: 'Aggiorna il saldo', corpo: [h('div', { class: 'fila' },
        conti.length > 1 ? campo('Conto', selezione(conti.map(c => [c.id, nomeConto(c)]), idConto, x => { idConto = Number(x); })) : h('p', { class: 'sotto-titolo', style: { margin: 0 } }, nomeConto(conti[0])),
        zonaSaldo, campo('Del giorno', data))],
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Aggiorna il saldo')] });
    }

    // ===================================================================== SITUAZIONE

    function paginaSituazione(pagina) {
      aggiungi(pagina, [testataBanche('Situazione finanziaria', null), segmentiBanche('situazione')]);
      conDati(pagina, async () => { M.sit = await Rete.get('/server/situazione'); }, () => {
        const s = M.sit;
        const sotto30 = C.num(s.previsto && s.previsto['30']) < C.num(s.soglia);
        aggiungi(pagina, [h('div', { class: 'quattro-riquadri' },
          W.riquadro((s.saldi || []).length > 1 ? 'Nei conti oggi' : 'Nel conto oggi', euro(s.saldoOggi), (s.saldi || []).length > 1 ? s.saldi.map(x => x.nome + ' ' + euro(x.saldo)).join(' · ') : 'registrato'),
          W.riquadro('Da incassare', euro(s.daIncassare), C.num(s.scadutoDaIncassare) ? 'di cui scaduti ' + euro(s.scadutoDaIncassare) : 'nessuno scaduto'),
          W.riquadro('Da pagare in 30 giorni', euro(s.daPagare30), C.num(s.scadutoDaPagare) ? 'di cui scaduti ' + euro(s.scadutoDaPagare) : 'fatture ricevute e tributi'),
          W.riquadro('Previsto fra 30 giorni', euro(s.previsto && s.previsto['30']), 'fra 60: ' + euro(s.previsto && s.previsto['60']) + ' · fra 90: ' + euro(s.previsto && s.previsto['90']), null, sotto30))]);
        if (s.primoSottoSoglia) {
          aggiungi(pagina, [h('button', { type: 'button', class: 'banda banda-cliccabile', onclick: () => { M.giorno = s.primoSottoSoglia; M.periodo = 90; M.scad = null; W.vai('#banche'); } }, icona('avviso', 20),
            h('span', { class: 'spazio' }, 'Primo giorno sotto soglia: ' + giornoLungo(s.primoSottoSoglia)), h('span', { class: 'forte' }, 'Scadenziario'))]);
        }
        const settimane = s.settimane || [];
        const scala = RF.scalaBarre(settimane.map(x => C.num(x.saldo)), s.soglia);
        const ALTO = 170;
        const sopraZero = v => Math.round(scala.altezza(v) * ALTO);
        const zero = sopraZero(0);
        const linea = sopraZero(s.soglia);
        const grafico = h('div', { class: 'scheda grafico-settimane' },
          h('div', { class: 'testa-grafico' }, h('span', { class: 'etichetta' }, 'Saldo previsto a fine settimana, prossime 13 settimane'),
            h('div', { class: 'legenda' }, h('span', null, h('i', { class: 'col-sopra' }), 'Sopra la soglia'), h('span', null, h('i', { class: 'col-sotto' }), 'Sotto soglia'), h('span', null, h('i', { class: 'col-soglia' }), 'Soglia ' + euro(s.soglia)))),
          h('div', { class: 'area-barre', style: { height: (ALTO + 40) + 'px' } },
            h('div', { class: 'linea-soglia', style: { bottom: (linea + 22) + 'px' } }),
            settimane.map(w => {
              const v = C.num(w.saldo);
              const alto = Math.max(4, Math.abs(sopraZero(v) - zero));
              return h('div', { class: 'colonna-sett', title: 'Settimana dal ' + giornoBreve(w.da) + ' al ' + giornoBreve(w.a) + ': entrate ' + euro(w.entrate) + ', uscite ' + euro(w.uscite) + ', saldo ' + euro(v) },
                h('span', { class: 'cifra' + (w.sottoSoglia ? ' rosso-testo' : '') }, Math.round(v).toLocaleString('it-IT') + ' €'),
                h('i', { class: w.sottoSoglia ? 'sotto' : 'sopra', style: { height: alto + 'px', marginBottom: (v < 0 ? zero - alto : zero) + 'px' } }),
                h('span', { class: 'data-sett' }, giornoBreve(w.da)));
            })));
        aggiungi(pagina, [grafico, h('div', { class: 'due-colonne' },
          W.riquadro('Fatturato nel ' + oggi().slice(0, 4), euro(s.fatturatoAnno), 'compenso delle fatture emesse, meno le note'),
          W.riquadro('Incassato nel ' + oggi().slice(0, 4), euro(s.incassatoAnno), 'movimenti abbinati alle fatture'))]);
        if (s.collegamento === 'non_collegato') aggiungi(pagina, [h('div', { class: 'scheda riga-non-collegata stretta-820' }, quadrato('scollegato'), h('span', { class: 'corpo' }, h('b', null, 'Collegamento alla banca'), h('span', { class: 'tenue' }, 'I saldi vengono dai movimenti scritti a mano')), nonCollegato())]);
      });
    }

    return { vista, M, daRileggere, segnaIncasso, segnaPagamento };
  };
})(window);
