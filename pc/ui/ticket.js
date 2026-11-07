/*
 * Wisper Ufficio: Ticket e assistenza (fase 5, docs/gestionale/fase5.md §7-§9, §12.2; risposte architettura.md §16.11-16.17).
 *
 * Aperti · Programmati · Chiusi · Contratti · Statistiche. Un tocco su un ticket apre il pannello a destra
 * (440) con lo stesso contenuto e lo stesso giallo della pagina del telefono: il giallo lo decide il server
 * (prendi, pianifica, rapportino, risolvi, chiudi, riprendi). Un ticket non è un posto nuovo dove riscrivere
 * le cose: l'intervento è un'attività del calendario, le ore sono ore, le spese sono spese, il rapportino è
 * il rapportino di sempre (già con cliente, commessa e luogo). Alla chiusura il titolare o l'amministrazione
 * sceglie come si fattura; "una riga per l'intervento" va in Da fatturare come una voce sola.
 *
 * Qui ci sono anche i contratti di assistenza, le statistiche e lo storico dell'impianto (#ticket/impianto/<id>).
 */
(function (radice) {
  'use strict';

  radice.WisperTicket = function (W) {
    const { S, C, R, B, Rete } = W;
    const T = radice.WisperRegoleTicket;
    const RA = radice.WisperRegoleAttivita;
    const { h, aggiungi, svuota, icona, tondo, iniziali, avviso, lavora, finestra, conferma, apriMenu, campo, selezione, segmenti, cerca, riga, quadrato, segnaposto } = B;
    const puo = W.puo;
    const soldi = W.soldi;
    const scrive = () => puo('ticket', 2);
    const interfaccia = () => (S.io && S.io.interfaccia) || {};
    const io = () => (S.io && S.io.utente && S.io.utente.id) || null;
    const collaboratore = () => !!(S.io && S.io.utente && S.io.utente.ruolo === 'collaboratore');
    const lettura = () => !!(S.io && S.io.utente && S.io.utente.ruolo === 'lettura');
    const scriveContratti = () => scrive() && puo('costi', 2);
    const persone = () => S.ana.utenti.filter(u => u.attivo !== false && u.ruolo !== 'lettura');
    const nomeUtente = id => (S.ana.utenti.find(u => String(u.id) === String(id)) || { nome: '' }).nome;

    const M = {
      aperti: null, chiave: '', pill: 'tutti', testo: '', programmati: null, visite: null, chiusi: null, mese: C.oggiIso().slice(0, 7),
      contratti: null, stat: null, statMesi: null, statPer: 'tipo', statPeriodo: '12',
      aperto: null, tk: null, contrattoAperto: null, contratto: null, miei: null,
    };
    function daRileggere() { M.aperti = null; M.programmati = null; M.chiusi = null; M.contratti = null; M.stat = null; M.statMesi = null; M.visite = null; }

    const qs = o => Object.keys(o).filter(k => o[k] !== '' && o[k] !== null && o[k] !== undefined && o[k] !== false)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k] === true ? '1' : o[k])).join('&');
    const pill = (testo, colore) => h('span', { class: 'pill p-' + (colore || 'grigio') }, testo);
    const pillPriorita = t => pill(t.prioritaNome || T.nomeDi(T.PRIORITA, t.priorita), T.colorePriorita(t.priorita));
    const pillStato = t => pill(t.statoVisto || T.STATI_TICKET[t.stato], T.coloreStatoTicket(t.stato));
    const tempiStudio = () => {
      const x = S.ana.impostazioni.TICKET_TEMPI;
      if (x && typeof x === 'object') return x;
      try { return JSON.parse(x); } catch (e) { return T.TEMPI_STUDIO; }
    };
    const adesso = () => new Date();
    const apertoBreve = iso => {
      const d = T.istante(iso);
      if (!d) return '';
      const g = T.giornoA(d);
      const ora = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
      return g === 'oggi' || g === 'ieri' ? g + ' ' + ora : C.data(String(iso).slice(0, 10)).slice(0, 5) + ' ' + ora;
    };

    function conDati(contenitore, prepara, disegna) {
      const zona = h('div', { class: 'sezione' }, segnaposto(4, 58));
      aggiungi(contenitore, [zona]);
      prepara().then(() => { zona.remove(); disegna(); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.disegnaPagina() }, 'Riprova'))]);
      });
    }

    // ===================================================================== la pagina

    function vista(pagina, a1, a2, filtro) {
      const f = filtro || {};
      if (f.priorita === 'urgente') M.pill = 'urgenti';
      else if (f.nonAssegnati) M.pill = 'prendere';
      else if (f.mie) M.pill = 'miei';
      else if (f.segmento) M.pill = 'tutti';
      if (a1 === 'impianto') return paginaImpianto(pagina, a2);
      if (a1 === 'programmati') return paginaProgrammati(pagina);
      if (a1 === 'chiusi') return paginaChiusi(pagina);
      if (a1 === 'contratti' || a1 === 'contratto') return paginaContratti(pagina, a1 === 'contratto' ? a2 : null);
      if (a1 === 'statistiche') return paginaStatistiche(pagina);
      return paginaAperti(pagina, a1 === 'tk' ? a2 : null);
    }

    function testata(titolo, giallo) {
      return h('div', { class: 'testata alta' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Ticket e assistenza'), h('h1', null, titolo)), giallo || null);
    }

    function segmentiTk(seg) {
      return segmenti([['aperti', 'Aperti'], ['programmati', 'Programmati'], ['chiusi', 'Chiusi'], ['contratti', 'Contratti'], ['statistiche', 'Statistiche']], seg,
        x => W.vai(x === 'aperti' ? '#ticket' : '#ticket/' + x));
    }

    const gialloNuovo = () => scrive() ? h('button', { type: 'button', class: 'btn giallo', 'data-giallo-pagina': '1', onclick: () => nuovoTicket() }, icona('piu', 18, 2.6), 'Nuovo ticket') : null;

    // ===================================================================== aperti

    async function leggiAperti() {
      const chiave = qs({ segmento: 'aperti', testo: M.testo.trim() });
      const r = await Rete.get('/server/tickets?' + chiave);
      M.aperti = r;
      M.chiave = chiave;
      if (r.conteggi && r.conteggi.miei !== undefined) M.miei = r.conteggi.miei;
    }

    function paginaAperti(pagina, apriId) {
      aggiungi(pagina, [testata('Ticket aperti', gialloNuovo()), segmentiTk('aperti')]);
      conDati(pagina, () => (M.aperti && M.chiave === qs({ segmento: 'aperti', testo: M.testo.trim() }) ? Promise.resolve() : leggiAperti()), () => {
        const n = M.aperti.conteggi || {};
        const box = (quanti, che, pillDi, rosso) => h('button', { type: 'button', class: 'num-box' + (rosso && quanti > 0 ? ' rosso' : '') + (M.pill === pillDi ? ' acceso' : ''),
          onclick: () => { M.pill = M.pill === pillDi ? 'tutti' : pillDi; W.disegnaPagina(); } }, h('b', null, String(quanti || 0)), h('span', null, che));
        const area = h('div', { class: 'sezione' });
        let attesa = null;
        aggiungi(pagina, [
          h('div', { class: 'quattro-num' }, box(n.aperti, 'aperti', 'tutti'), box(n.urgenti, 'urgenti', 'urgenti', true), box(n.nonAssegnati, 'da prendere', 'prendere'),
            collaboratore() ? box(n.miei, 'in carico a te', 'miei') : box(n.risoltiDaChiudere, 'risolti da chiudere', 'risolti')),
          h('div', { class: 'filtri' },
            cerca(M.testo, 'Cerca un ticket, un cliente, un impianto', v => { M.testo = v; clearTimeout(attesa); attesa = setTimeout(async () => { try { await leggiAperti(); tabellaAperti(area); } catch (e) { avviso(e.message, true); } }, 300); }),
            h('div', { class: 'pillole' }, [['tutti', 'Tutti'], ['urgenti', 'Urgenti'], ['miei', 'Miei'], ['prendere', 'Da prendere']].map(([k, nome]) =>
              h('button', { type: 'button', class: 'pillola' + (M.pill === k ? ' scelta' : ''), 'aria-pressed': M.pill === k ? 'true' : 'false', onclick: () => { M.pill = k; W.disegnaPagina(); } }, nome)))),
          area]);
        tabellaAperti(area);
        if (apriId && !document.querySelector('.pannello-ticket')) apriPannello(apriId);
        else if (M.aperto && !document.querySelector('.pannello-ticket')) apriPannello(M.aperto);
        else if (M.aperto) gialloPagina(true);
      });
    }

    function colonneAperti() { return '96px 118px minmax(0, 2fr) 128px minmax(0, 1fr) minmax(0, 1.2fr) 92px'; }

    function intervento(t) {
      if (t.stato === 'risolto') return 'Risolto';
      if (t.stato === 'in_attesa') return t.statoDettaglio || 'In attesa';
      if (t.prossimoIntervento) return T.maiuscola(T.quando(t.prossimoIntervento.inizio, adesso()));
      return T.maiuscola(T.entro(t.entroIntervento, adesso()));
    }

    function tabellaAperti(area) {
      svuota(area);
      let lista = T.filtraTicket((M.aperti && M.aperti.ticket) || [], M.pill === 'risolti' ? 'tutti' : M.pill, io());
      if (M.pill === 'risolti') lista = lista.filter(t => t.stato === 'risolto');
      if (!lista.length) { aggiungi(area, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), M.testo ? 'Nessun ticket con queste parole' : M.pill === 'tutti' ? 'Nessun ticket aperto' : 'Nessun ticket qui')]); return; }
      const col = colonneAperti();
      const tab = h('div', { class: 'tab tab-ticket' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } },
        h('span', null, 'Priorità'), h('span', null, 'Numero'), h('span', null, 'Cosa'), h('span', null, 'Stato'), h('span', null, 'Chi'), h('span', null, 'Intervento'), h('span', null, 'Aperto')));
      lista.forEach((t, i) => aggiungi(tab, [h('div', {
        class: 'r cliccabile' + (String(M.aperto) === String(t.id) ? ' scelta' : ''), style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-id': t.id,
        'data-visita': i === 0 ? 'riga-ticket' : null,
        onclick: () => apriPannello(t.id), onkeydown: e => { if (e.key === 'Enter') apriPannello(t.id); },
      },
      h('span', null, pillPriorita(t)),
      h('span', { class: 'forte num-tk' }, t.numero),
      h('span', { class: 'doppia' }, h('span', { title: t.titolo }, t.titolo), h('span', null, [t.cliente, t.impianto].filter(Boolean).join(' · '))),
      h('span', { class: 'stato-doppio' }, pillStato(t), t.inRitardo ? h('span', { class: 'pill piccola p-rosso', title: t.ritardo }, 'In ritardo') : null),
      h('span', { class: 'forte taglia' }, t.responsabile || 'Nessuno'),
      h('span', { class: 't2' + (t.inRitardo ? ' rosso-testo' : '') }, intervento(t)),
      h('span', { class: 't2' }, apertoBreve(t.apertoIl)))]));
      aggiungi(area, [tab]);
    }

    // ===================================================================== il pannello del ticket

    function gialloPagina(spento) {
      document.querySelectorAll('[data-giallo-pagina]').forEach(b => b.classList.toggle('giallo', !spento));
    }

    async function apriPannello(id) {
      M.aperto = id;
      document.querySelectorAll('.tab .r[data-id]').forEach(x => x.classList.toggle('scelta', String(x.dataset.id) === String(id)));
      const r = await lavora('Apro il ticket', () => Rete.get('/server/ticket?id=' + encodeURIComponent(id)));
      if (!r || !r.ticket) { M.aperto = null; return; }
      if (String(M.aperto) !== String(id)) return;
      M.tk = r.ticket;
      disegnaPannello();
    }

    function chiudiPannello(subito) {
      const p = document.querySelector('.pannello-ticket');
      M.aperto = null;
      M.tk = null;
      gialloPagina(false);
      document.querySelectorAll('.tab .r.scelta').forEach(x => x.classList.remove('scelta'));
      if (!p) return;
      if (subito) { p.remove(); return; }
      p.classList.add('via');
      setTimeout(() => p.remove(), 200);
    }

    /** Dopo un'azione: il ticket nel pannello e l'elenco (si rilegge), la Dashboard. */
    async function aggiorna(ticket, messaggio, annulla) {
      if (ticket) M.tk = Object.assign({}, M.tk || {}, ticket);
      daRileggere();
      W.caricaDashboard();
      if (messaggio) avviso(messaggio, false, null, annulla || null);
      const id = M.tk && M.tk.id;
      // Il ticket intero (interventi, rapportini, cronologia) si rilegge: le azioni rispondono col ticket ma conviene il dettaglio.
      if (id) { try { const r = await Rete.get('/server/ticket?id=' + id); if (r && r.ticket) M.tk = r.ticket; } catch (e) { /* resta quello di prima */ } }
      const tieni = M.aperto;
      W.ridisegna();
      if (tieni && M.tk) { M.aperto = tieni; disegnaPannello(); }
    }

    function passiTk(stato) {
      const i = T.passoTicket(stato);
      const nomi = ['Aperto', 'In carico', 'Risolto', 'Chiuso'];
      return h('div', { class: 'passi', 'aria-label': 'A che punto è' }, nomi.map((n, k) => h('span', { class: (k <= i ? 'fatto' : '') + (k === i ? ' ora' : '') }, h('i'), h('em', null, n))));
    }

    function disegnaPannello() {
      const t = M.tk;
      const vecchio = document.querySelector('.pannello-ticket');
      if (!t) { if (vecchio) vecchio.remove(); return; }
      const vivo = ['aperto', 'in_carico', 'in_attesa', 'risolto'].indexOf(t.stato) >= 0;
      const puoQui = scrive() && t.puoScrivere !== false && vivo;
      const ad = adesso();

      // i tempi: rossi con "In ritardo"
      const tempi = [];
      if (t.stato === 'aperto' && t.entroPresa) tempi.push('Da prendere ' + T.entro(t.entroPresa, ad).replace(/^entro /, 'entro ') + (t.inRitardo && /prendere/i.test(t.ritardo) ? ': in ritardo' : ''));
      if (vivo && t.stato !== 'risolto') {
        if (t.prossimoIntervento) tempi.push('Intervento ' + T.quando(t.prossimoIntervento.inizio, ad) + ' · ' + (t.prossimoIntervento.assegnata || ''));
        else if (t.entroIntervento) tempi.push('Intervento ' + T.entro(t.entroIntervento, ad) + (t.inRitardo && /Intervento/.test(t.ritardo) ? ': in ritardo' : ''));
      }
      if (t.stato === 'in_attesa' && t.motivo) tempi.push('In attesa: ' + t.motivo);
      if (t.stato === 'risolto') tempi.push('Risolto ' + T.quando(t.risoltoIl, ad) + (t.esito ? ': ' + t.esito : ''));
      if (t.stato === 'chiuso') tempi.push('Chiuso ' + T.quando(t.chiusoIl, ad) + ' · ' + (t.statoDettaglio || t.fatturazioneNome || ''));
      if (t.stato === 'annullato') tempi.push('Annullato' + (t.motivo ? ': ' + t.motivo : ''));

      const ref = t.referente;
      const cliRiga = riga({ sinistra: iniziali(t.cliente, true), titolo: t.cliente,
        sotto: [t.richiedente || (ref ? ref.nome : ''), ref && ref.telefono && (t.richiedente || '').indexOf(ref.telefono) < 0 ? ref.telefono : '', t.rifCliente ? 'rif. ' + t.rifCliente : ''].filter(Boolean).join(' · ') || 'Cliente',
        onclick: () => { chiudiPannello(true); W.vai('#clienti/' + encodeURIComponent(t.idCliente)); } });
      const sede = t.idSede ? S.ana.sedi.find(s => String(s.id) === String(t.idSede)) : null;
      const impRiga = t.idSede ? riga({ sinistra: quadrato('fulmine', 'ico-blu'), titolo: t.impianto, sotto: [sede && sede.categoriaNome, t.indirizzoImpianto].filter(Boolean).join(' · '),
        onclick: () => { chiudiPannello(true); W.vai('#ticket/impianto/' + t.idSede); } }) : null;
      const contrRiga = t.idContratto ? riga({ sinistra: quadrato('contratto'), titolo: 'Nel contratto ' + t.contratto,
        sotto: T.maiuscola(String((t.proposta && t.proposta.perche) || 'Contratto di assistenza').replace(/^Nel contratto [^:]+:\s*/, '')),
        onclick: () => { chiudiPannello(true); W.vai('#ticket/contratto/' + t.idContratto); } }) : null;
      const comRiga = t.idCommessa ? riga({ sinistra: h('span', { class: 'codice' }, t.idCommessa), titolo: t.commessa || t.idCommessa, sotto: 'Commessa',
        onclick: () => { chiudiPannello(true); W.vai('#commesse/' + encodeURIComponent(t.idCommessa)); } }) : null;

      const sezione = (titolo, ...cose) => h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, titolo), ...cose);
      const interventi = (t.interventi || []).length || puoQui ? sezione('Interventi',
        (t.interventi || []).length ? h('div', { class: 'scheda righe' }, t.interventi.map(a => riga({
          sinistra: quadrato('calendario', a.stato === 'fatta' ? 'ico-verde' : 'ico-blu'), titolo: T.maiuscola(T.quando(a.inizio, ad)),
          sotto: [a.assegnata, a.luogo].filter(Boolean).join(' · '), destra: a.stato === 'fatta' ? pill('Fatto', 'verde') : null,
          onclick: () => W.Attivita && W.Attivita.modulo(RA.normalizzaAttivita(a)),
        }))) : null,
        puoQui && puo('attivita', 2) ? h('button', { type: 'button', class: 'pillola tratteggiata', onclick: () => pianifica(t) }, (t.interventi || []).length ? '+ Un altro intervento' : '+ Pianifica l\'intervento') : null) : null;
      const rapportini = sezione('Rapportini',
        (t.rapportini || []).length ? h('div', { class: 'scheda righe' }, t.rapportini.map(r => riga({
          sinistra: quadrato('firma', r.stato === 'BOZZA' ? 'ico-giallo' : 'ico-verde'), titolo: r.id + ' · ' + C.data(r.data).slice(0, 5),
          sotto: [r.tecnico, C.ore(r.ore), r.km ? C.numero(r.km) + ' km' : '', r.firmatario ? 'firmato da ' + r.firmatario : ''].filter(Boolean).join(' · '),
          destra: B.stato(r.stato), onclick: r.apribile ? () => { chiudiPannello(true); W.vaiA({ pagina: 'rapportino', id: r.id }); } : null, freccia: !!r.apribile,
        }))) : h('p', { class: 'vuoto sinistra piccolo' }, 'Ancora nessun rapportino.'),
        t.daFirmare ? h('div', { class: 'banda giallina' }, icona('firma', 20, 2.2), h('span', { class: 'spazio' }, t.daFirmare)) : null);
      // Fase 6 (§17.13): gli strumenti dei suoi rapportini, con lo stato di quel giorno; la pillola rossa se uno era scaduto.
      const P6 = window.WisperRegolePersone;
      const strumenti = (t.strumenti || []).length ? sezione('Strumenti usati', h('div', { class: 'scheda righe' }, t.strumenti.map(x => {
        const st = P6.statoAllora(x);
        return riga({ sinistra: quadrato(x.verifica ? 'scudo' : 'misura', x.statoAllora === 'scaduta' || x.statoAllora === 'non_conforme' ? 'ico-rosso' : 'ico-grigio'), titolo: (x.codice ? x.codice + ' · ' : '') + x.nome,
          sotto: [x.idRapportino, x.data ? C.data(x.data).slice(0, 5) : '', x.matricola ? 'matr. ' + x.matricola : ''].filter(Boolean).join(' · '), destra: st.parola ? pill(st.parola, st.colore) : null });
      })), t.tarataScaduta ? h('div', { class: 'banda' }, icona('avviso', 18), h('span', { class: 'spazio' }, 'Taratura scaduta: in uno dei suoi interventi è stato usato uno strumento con la taratura scaduta')) : null) : null;
      const s = t.somma || {};
      // 07/11/2026: niente più Ore; quelle già scritte sul ticket si vedono, non si aprono.
      const righeOS = (t.ore || []).map(o => riga({ sinistra: quadrato('orologio'), titolo: C.ore(o.ore) + (o.descrizione ? ' · ' + o.descrizione : ''), sotto: [C.data(o.data).slice(0, 5), o.utente].filter(Boolean).join(' · '), freccia: false }))
        .concat((t.spese || []).map(x => riga({ sinistra: quadrato(x.categoria === 'materiale' ? 'materiale' : 'scontrino'), titolo: (x.descrizione || x.categoria) + ' · ' + C.euro(x.importo),
          sotto: [C.data(x.data).slice(0, 5), x.utente, x.destinazione === 'cliente' ? 'al cliente' : x.destinazione === 'personale' ? 'mia' : 'dello studio', x.idRapportino ? 'nel ' + x.idRapportino : ''].filter(Boolean).join(' · '),
          onclick: W.Spese ? () => W.Spese.moduloSpesa(x, { dopo: () => aggiorna() }) : null })));
      const oreSpese = sezione('Ore, materiali e spese',
        righeOS.length ? h('div', { class: 'scheda righe' }, righeOS) : null,
        h('div', { class: 'somma-tk' }, h('span', null, T.sommaTesto(s) || 'Niente ancora'),
          soldi() && s.costo !== undefined ? h('span', { class: 'secondario' }, 'costo ' + C.euro(s.costo) + (s.importo ? ' · in fattura ' + C.euro(s.importo) : '')) : null),
        puoQui ? h('div', { class: 'pillole' },
          puo('spese', 2) && W.Spese ? h('button', { type: 'button', class: 'pillola tratteggiata', onclick: () => W.Spese.moduloSpesa(null, { categoria: 'materiale', idCommessa: t.idCommessa || '', idCliente: t.idCliente, destinazione: 'cliente', idTicket: t.id, dopo: () => aggiorna() }) }, '+ Materiale o spesa') : null) : null);
      const foto = sezione('Foto', h('div', { class: 'miniature foto-tk' },
        (t.foto || []).map(f => {
          const b = h('button', { type: 'button', class: 'foto-btn', title: f.nome, onclick: () => menuFoto(b, t, f) }, h('img', { src: f.url, alt: f.nome || 'Foto' }), f.idDocumento ? h('span', { class: 'segno-archivio', title: 'È anche nell\'archivio' }, icona('file', 12, 2.6)) : null,
            // Fase 7 (§3.11): le foto mandate dal cliente col portale.
            f.dalCliente || f.portale || f.tipo === 'portale' ? h('span', { class: 'pill p-grigio piccola segno-cliente' }, 'Dal cliente') : null);
          return b;
        }),
        puoQui ? h('button', { type: 'button', class: 'foto-aggiungi', onclick: () => aggiungiFoto(t) }, icona('foto', 22, 2.2), h('span', null, 'Aggiungi')) : null));
      const documenti = (t.documenti || []).length ? sezione('Documenti', h('div', { class: 'scheda righe' }, t.documenti.map(d => riga({
        sinistra: W.Archivio ? W.Archivio.iconaDoc(d) : quadrato('file'), titolo: d.titolo, sotto: d.categoria, onclick: () => { chiudiPannello(true); W.vai('#documenti/doc/' + d.id); } })))) : null;
      const storico = (t.storico || []).length ? sezione('Storico dell\'impianto', h('div', { class: 'scheda righe' }, t.storico.slice(0, 3).map(v => rigaStorico(v)),
        t.idSede ? riga({ titolo: 'Vedi tutto lo storico', onclick: () => { chiudiPannello(true); W.vai('#ticket/impianto/' + t.idSede); } }) : null)) : null;
      const cronologia = (t.cronologia || []).length ? sezione('Cronologia', h('div', { class: 'cronologia' }, t.cronologia.slice().reverse().map(x =>
        h('div', { class: 'voce-cron' }, h('span', { class: 'quando' }, T.dataIt(x.quando).slice(0, 5) + ' ' + String(x.quando).slice(11, 16)), h('span', null, x.testo))))) : null;

      const corpo = h('div', { class: 'corpo' },
        h('div', { class: 'alto' }, h('span', { class: 'etichetta-pannello' }, 'Ticket'), h('span', { class: 'spazio' }), menuTicket(t), tondo('chiudi', 'Chiudi', () => chiudiPannello(), 'piccolo')),
        h('div', { class: 'pillole-testa' }, pillPriorita(t), pillStato(t), t.inRitardo ? pill('In ritardo', 'rosso') : null,
          // Fase 7 (§12.6): da dove arriva, Dal portale.
          t.origine === 'portale' ? pill('Dal portale', 'grigio') : null,
          t.fattura ? pill(t.fattura.etichetta, t.fattura.stato === 'emessa' ? 'blu' : 'grigio') : null, t.fatturatoIl && !t.fattura ? pill('Fatturato', 'verde') : null),
        h('h2', { class: 'titolo-pannello' }, t.titolo),
        h('span', { class: 'sotto-titolo' }, [t.numero, 'aperto ' + T.quando(t.apertoIl, ad), (t.origineNome || '').toLowerCase(), (t.tipoNome || '').toLowerCase(), t.previstoIl ? 'previsto il ' + C.data(t.previstoIl) : ''].filter(Boolean).join(' · ')),
        t.stato === 'annullato' ? null : passiTk(t.stato),
        tempi.length ? h('div', { class: 'banda-tempi' + (t.inRitardo ? ' rossa' : '') }, tempi.map(x => h('div', null, T.maiuscola(x)))) : null,
        h('div', { class: 'scheda righe' }, cliRiga, impRiga, contrRiga, comRiga),
        t.descrizione ? sezione('Cosa dice il cliente', h('div', { class: 'scheda testo-cliente' }, t.descrizione)) : null,
        messaggiCliente(t, sezione),
        interventi, rapportini, strumenti, oreSpese, foto, documenti, storico, cronologia);

      const piede = piedeTicket(t);
      const p = h('aside', { class: 'pannello pannello-ticket', 'aria-label': 'Il ticket ' + t.numero }, corpo, piede.length ? h('div', { class: 'piede' }, piede) : null);
      gialloPagina(true);
      if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi(B.$('#sovrapposti'), [p]);
    }

    /**
     * Fase 7 (§3.10, §12.6): i Messaggi col cliente (la conversazione pubblica del portale, divisa dalla cronologia interna),
     * Rispondi nel portale (bordo) e l'interruttore Mostra nel portale. Col ticket 2, anche senza il permesso del portale.
     */
    function messaggiCliente(t, sezione) {
      const K = radice.WisperRegoleComunicazioni;
      const pub = t.portale || null;
      const msg = t.messaggi || [];
      if (!pub && !msg.length && t.origine !== 'portale') return null;
      const puoRisp = K && K.Permessi.rispondeNelPortale(W.perm()) && t.puoScrivere !== false && !lettura();
      const visibile = !!(pub && pub.visibile) || t.origine === 'portale';
      const bolla = m => {
        const nomeStudio = (S.io && S.io.ragioneSociale) || S.ana.impostazioni.RAGIONE_SOCIALE || 'Studio Tecnico GM';
        // Lo studio firma col suo nome (§3.10) e ha chi l'ha scritto (§10.4); i clienti col nome del referente.
        const studio = m.direzione ? m.direzione === 'uscita' : (!!m.chi || m.da === nomeStudio);
        return h('div', { class: 'bolla ' + (studio ? 'studio' : 'cliente') }, h('span', { class: 'chi-bolla' }, (studio ? (m.chi || m.da || 'Studio Tecnico GM') : (m.da || 'Cliente')) + ' · ' + K.quando(m.quando, new Date())),
          h('span', { class: 'testo-bolla' }, m.testo || ''),
          (m.file || []).length ? h('span', { class: 'pillole-testa' }, m.file.map(f => h('span', { class: 'pill p-grigio' }, f.nome))) : null);
      };
      const interr = puoRisp && t.origine !== 'portale' && W.Portale ? W.Portale.interruttore('Mostra nel portale', visibile ? 'Il cliente vede la richiesta e i messaggi' : 'Il cliente non la vede', visibile, async v => {
        const r = await lavora('Un momento', () => Rete.post('/server/mostraNelPortale', { idTicket: t.id, visibile: v }));
        if (r) aggiorna(r.ticket, v ? 'Il cliente la vede nel portale' : 'Tolta dal portale');
      }) : null;
      return sezione('Messaggi col cliente', msg.length ? h('div', { class: 'scheda conversazione' }, msg.map(bolla)) : h('p', { class: 'vuoto sinistra piccolo' }, 'Nessun messaggio nel portale.'),
        h('div', { class: 'pillole-testa' }, puoRisp ? h('button', { type: 'button', class: 'btn', onclick: () => rispondiNelPortale(t) }, icona('invia', 18, 2.2), 'Rispondi nel portale') : null,
          pub && pub.messaggiNuovi ? h('span', { class: 'pill p-giallo' }, pub.messaggiNuovi === 1 ? '1 messaggio nuovo' : pub.messaggiNuovi + ' messaggi nuovi') : null),
        interr ? h('div', { class: 'scheda righe' }, interr) : null);
    }

    function rispondiNelPortale(t) {
      const testo = h('textarea', { rows: 5 });
      const allegati = [];
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, t.numero + ' · ' + t.titolo), campo('Risposta', testo, errore),
        h('div', { class: 'pillole-testa' }, allegati.map((a, i) => h('span', { class: 'pill p-grigio' }, a.nome, h('button', { type: 'button', class: 'pill-x', 'aria-label': 'Togli ' + a.nome, onclick: () => { allegati.splice(i, 1); disegna(); } }, icona('chiudi', 12, 2.6)))),
          h('button', { type: 'button', class: 'btn collegamento', onclick: async () => {
            const f = await Rete.post('/locale/scegli-file', {}).catch(() => null);
            if (!f || !f.ok) return;
            allegati.push({ nome: f.nome, mime: f.mime, base64: f.base64 }); disegna();
          } }, icona('graffetta', 16, 2.2), ' Allega'))]);
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'Rispondi nel portale', corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
            if (!testo.value.trim()) { errore = 'Scrivi la risposta'; disegna(); testo.focus(); return; }
            const r = await lavora('Mando la risposta', () => Rete.post('/server/rispondiNelPortale', { idTicket: t.id, testo: testo.value.trim(), allegati }));
            if (!r) return;
            chiudi();
            aggiorna(null, 'Risposta nel portale: al cliente arriva un avviso per email');
          } }, 'Manda')] });
    }

    function rigaStorico(v) {
      return riga({ sinistra: quadrato(T.iconaVoce(v.tipo), v.tipo === 'ticket' && /Urgente/.test(v.dettaglio || '') ? 'ico-rosso' : null), titolo: v.titolo, sotto: [C.data(v.data), v.dettaglio].filter(Boolean).join(' · '),
        onclick: () => apriVoceStorico(v) });
    }

    function apriVoceStorico(v) {
      if ((v.tipo === 'ticket' || v.tipo === 'foto') && v.idTicket) { chiudiPannello(true); W.vai('#ticket/tk/' + v.idTicket); }
      else if (v.tipo === 'rapportino' && v.id && v.apribile !== false) { chiudiPannello(true); W.vaiA({ pagina: 'rapportino', id: v.id }); }
      else if (v.tipo === 'documento' && v.id) { chiudiPannello(true); W.vai('#documenti/doc/' + v.id); }
      else if (v.tipo === 'scadenza' && v.id && W.Archivio) W.Archivio.apriScadenza(v.id);
      else if (v.tipo === 'contratto' && v.id) { chiudiPannello(true); W.vai('#ticket/contratto/' + v.id); }
    }

    /** Il piede del pannello: UN giallo, quello che dice il server. Il collaboratore su un risolto: "Lo chiude l'ufficio". */
    function piedeTicket(t) {
      const fai = {
        prendi: () => azione(t, 'prendiTicket', {}, 'Preso: ora è tuo'),
        pianifica: () => pianifica(t),
        rapportino: () => scriviRapportino(t),
        risolvi: () => risolvi(t),
        chiudi: () => chiudiTicket(t),
        riprendi: () => azione(t, 'riprendiTicket', {}, 'Ripreso'),
      };
      const g = lettura() ? '' : t.giallo;
      const pulsanti = [];
      // Accanto al giallo, la seconda cosa più probabile (col bordo).
      if (g === 'risolvi' && t.puoScrivere && puo('rapportini', 2)) pulsanti.push(h('button', { type: 'button', class: 'btn grande', onclick: () => scriviRapportino(t) }, 'Altro rapportino'));
      if (g === 'rapportino' && t.puoScrivere) pulsanti.push(h('button', { type: 'button', class: 'btn grande', onclick: () => risolvi(t) }, 'Segna risolto'));
      if (g && fai[g]) pulsanti.push(h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': 'giallo-ticket', onclick: fai[g] }, T.testoGiallo(g)));
      if (!g && t.stato === 'risolto' && !t.puoChiudere && !lettura()) pulsanti.push(h('div', { class: 'calmo piccolo-calmo' }, icona('lucchetto', 18, 2.2), 'Lo chiude l\'ufficio'));
      return pulsanti;
    }

    function menuTicket(t) {
      const vivo = ['aperto', 'in_carico', 'in_attesa', 'risolto'].indexOf(t.stato) >= 0;
      const puoQui = scrive() && t.puoScrivere !== false;
      const voci = [
        puoQui && vivo ? { testo: 'Cambia', fn: () => nuovoTicket({ esistente: t }) } : null,
        puoQui && vivo && t.stato !== 'risolto' ? { testo: 'Assegna', fn: () => assegna(t) } : null,
        puoQui && (t.stato === 'aperto' || t.stato === 'in_carico') ? { testo: 'In attesa', fn: () => conMotivo(t, 'Mettere in attesa?', 'sospendiTicket', 'Metti in attesa', 'In attesa') } : null,
        puoQui && t.stato === 'in_attesa' ? { testo: 'Riprendi', fn: () => azione(t, 'riprendiTicket', {}, 'Ripreso') } : null,
        puoQui && vivo && t.stato !== 'risolto' && puo('attivita', 2) ? { testo: 'Pianifica un intervento', fn: () => pianifica(t) } : null,
        puoQui && vivo && puo('rapportini', 2) ? { testo: 'Scrivi il rapportino', fn: () => scriviRapportino(t) } : null,
        puoQui && vivo && puo('rapportini', 2) ? { testo: 'Lega un rapportino', fn: () => legaRapportino(t) } : null,
        puoQui && vivo && t.stato !== 'risolto' ? { testo: 'Segna risolto', fn: () => risolvi(t) } : null,
        t.puoChiudere && (t.stato === 'aperto' || t.stato === 'in_carico') ? { testo: 'Chiudi subito (assistenza al telefono)', fn: () => chiudiTicket(t) } : null,
        (t.stato === 'risolto' && puoQui) || (t.stato === 'chiuso' && t.puoChiudere && !t.riservata && !t.fatturatoIl) ? { testo: 'Riapri', fn: () => conMotivo(t, 'Riaprire il ticket?', 'riapriTicket', 'Riapri', 'Riaperto') } : null,
        '-',
        { testo: 'Esporta per Excel', fn: () => W.esporta('ticket', { idCliente: t.idCliente }) },
        puoQui && (t.stato === 'aperto' || t.stato === 'in_carico' || t.stato === 'in_attesa') ? { testo: 'Annulla il ticket', fn: () => conMotivo(t, 'Annullare il ticket?', 'annullaTicket', 'Annulla il ticket', 'Ticket annullato', true), pericolo: true } : null,
      ].filter(Boolean);
      while (voci.length && voci[0] === '-') voci.shift();
      while (voci.length && voci[voci.length - 1] === '-') voci.pop();
      if (!voci.length) return null;
      const b = h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18));
      b.addEventListener('click', () => apriMenu(b, voci));
      return b;
    }

    async function azione(t, nome, extra, messaggio) {
      const r = await lavora('Un momento', () => Rete.post('/server/' + nome, Object.assign({ id: t.id }, extra || {})));
      if (r) await aggiorna(r.ticket, messaggio);
      return r;
    }

    function conMotivo(t, titolo, nome, siTesto, messaggio, pericolo) {
      const motivo = h('input', { type: 'text' });
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, t.numero + ' · ' + t.titolo), campo('Motivo', motivo, errore)]);
      disegna();
      let chiudi;
      const vai = async () => {
        if (!motivo.value.trim()) { errore = 'Scrivi il motivo'; disegna(); motivo.focus(); return; }
        const r = await lavora('Un momento', () => Rete.post('/server/' + nome, { id: t.id, motivo: motivo.value.trim() }));
        if (!r) return;
        chiudi();
        aggiorna(r.ticket, messaggio);
      };
      chiudi = finestra({ titolo, corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Lascia stare'),
          h('button', { type: 'button', class: 'btn grande ' + (pericolo ? 'pericolo' : 'giallo'), onclick: vai }, siTesto)] });
    }

    function assegna(t) {
      const chi = collaboratore() ? persone().filter(u => String(u.id) === String(io())) : persone();
      let scelto = t.responsabileId || null;
      const zona = h('div', { class: 'pillole' });
      const disegna = () => aggiungi(svuota(zona), [h('button', { type: 'button', class: 'pillola' + (!scelto ? ' scelta' : ''), onclick: () => { scelto = null; disegna(); } }, 'Nessuno per ora')]
        .concat(chi.map(u => h('button', { type: 'button', class: 'pillola' + (String(scelto) === String(u.id) ? ' scelta' : ''), onclick: () => { scelto = u.id; disegna(); } }, String(u.id) === String(io()) ? 'Io' : u.nome))));
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'Chi lo segue', corpo: [h('p', { class: 'testo-forte' }, t.numero + ' · ' + t.titolo), zona], fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => { chiudi(); await azione(t, 'assegnaTicket', { responsabileId: scelto }, scelto ? 'Assegnato a ' + (String(scelto) === String(io()) ? 'te' : nomeUtente(scelto)) : 'Nessuno lo segue più'); } }, 'Fatto')] });
    }

    async function risolvi(t) {
      const r = await lavora('Segno risolto', () => Rete.post('/server/risolviTicket', { id: t.id }));
      if (r) aggiorna(r.ticket, 'Risolto' + (r.ticket && r.ticket.puoChiudere ? ': ora si chiude scegliendo come si fattura' : ''));
    }

    function scriviRapportino(t) {
      W.moduloRapportino(null, { idCliente: t.idCliente, idCommessa: t.idCommessa || '', idTicket: t.id, numeroTicket: t.numero, luogo: t.indirizzoImpianto || '' });
    }

    function menuFoto(ancora, t, f) {
      const voci = [
        { testo: 'Apri', fn: () => W.Archivio && W.Archivio.apriFile(f.url, f.nome) },
        !f.idDocumento && puo('documenti', 2) ? { testo: 'Metti nell\'archivio', fn: () => mettiNellArchivio(t, f) } : null,
        f.idDocumento ? { testo: 'Apri nell\'archivio', fn: () => { chiudiPannello(true); W.vai('#documenti/doc/' + f.idDocumento); } } : null,
        scrive() && t.puoScrivere !== false ? { testo: 'Togli la foto', fn: async () => {
          const r = await lavora('Tolgo la foto', () => Rete.post('/server/togliFotoTicket', { id: f.id }));
          if (r) aggiorna(r.ticket, 'Foto tolta', { testo: 'Annulla', fn: async () => { const x = await lavora('Rimetto la foto', () => Rete.post('/server/togliFotoTicket', { id: f.id, annulla: true })); if (x) aggiorna(x.ticket); } });
        }, pericolo: true } : null,
      ].filter(Boolean);
      apriMenu(ancora, voci);
    }

    async function mettiNellArchivio(t, f) {
      const cat = await Rete.get('/server/categorieDocumenti').then(r => (r.categorie || []).find(c => c.nome === 'Foto')).catch(() => null);
      const r = await lavora('Metto nell\'archivio', () => Rete.post('/server/salvaDocumento', { documento: {
        titolo: (f.nome || 'Foto').replace(/\.[A-Za-z0-9]{1,5}$/, '') + ' · ' + t.numero, idCategoria: cat ? cat.id : null, origine: 'file', idFile: f.id, idTicket: t.id, idSede: t.idSede || null, idCliente: t.idCliente } }));
      if (r) aggiorna(null, 'Nell\'archivio, nella categoria Foto');
    }

    async function aggiungiFoto(t) {
      if (!W.Archivio) return;
      const f = await W.Archivio.scegliFile('immagini');
      if (!f) return;
      const r = await lavora('Carico la foto', async () => {
        const c = await W.Archivio.carica(f, 'ticket', 'pc' + Date.now().toString(36));
        return Rete.post('/server/caricaFile', { tipo: 'ticket', idTicket: t.id, idFileCaricato: c.file.id });
      });
      if (r) aggiorna(null, 'Foto aggiunta');
    }

    /** Lega un rapportino scritto dalla strada solita (dello stesso cliente, senza ticket). */
    function legaRapportino(t) {
      const lista = W.attivi().filter(r => r.idCliente === t.idCliente && !r.idTicket && r.stato !== 'FATTURATO').sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 12);
      let chiudi;
      chiudi = finestra({ titolo: 'Lega un rapportino', fuoco: false,
        corpo: lista.length ? h('div', { class: 'scheda righe' }, lista.map(r => riga({ sinistra: quadrato('firma'), titolo: (r.id || 'In arrivo') + ' · ' + C.data(r.data),
          sotto: [r.descrizione, C.ore(r.oreTotali)].filter(Boolean).join(' · '), destra: B.stato(r.stato),
          onclick: async () => {
            chiudi();
            const x = await lavora('Lego il rapportino', () => Rete.post('/server/legaRapportino', { idRapportino: r.id, idTicket: t.id }));
            if (x) { W.accogli([x.rapportino]); aggiorna(null, r.id + ' legato al ticket'); }
          } }))) : h('p', { class: 'vuoto sinistra' }, 'Nessun rapportino di ' + t.cliente + ' senza ticket.'),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] });
    }

    // ===================================================================== nuovo ticket (e cambia)

    /** I clienti da toccare per primi: quelli dei ticket e dei rapportini più recenti. */
    function clientiRecenti() {
      const visti = [];
      ((M.aperti && M.aperti.ticket) || []).map(t => t.idCliente).concat(C.ordina(W.attivi(), 'data', -1).map(r => r.idCliente)).forEach(id => {
        if (id && visti.indexOf(id) < 0 && W.cliente(id) && !W.cliente(id).archiviato) visti.push(id);
      });
      return visti.slice(0, 4).map(W.cliente);
    }

    /**
     * Nuovo ticket (finestra a due colonne): a sinistra per chi, impianto, cosa succede, cosa dice; a destra da
     * dove, che cos'è, le due domande con la priorità, chi lo segue, il contratto. opzioni: { esistente, idCliente, idSede }.
     */
    function nuovoTicket(opzioni) {
      const o = opzioni || {};
      const t0 = o.esistente || null;
      const x = {
        idCliente: t0 ? t0.idCliente : (o.idCliente || ''), idSede: t0 ? (t0.idSede || '') : (o.idSede || ''),
        idContratto: t0 ? (t0.idContratto || null) : null, contrattoScelto: !!t0, contratti: null,
        origine: t0 ? t0.origine : 'telefono', tipo: t0 ? t0.tipo : 'guasto', impatto: t0 ? (t0.impatto || '') : '', urgenza: t0 ? (t0.urgenza || '') : '',
        priorita: t0 && t0.prioritaAMano ? t0.priorita : '', cambiaPrio: false,
        responsabileId: t0 ? t0.responsabileId : null, rifAperto: !!(t0 && t0.rifCliente), cercaCliente: false, idReferente: t0 ? t0.idReferente : null,
        idLocale: 'pc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      };
      const v = {
        titolo: h('input', { type: 'text', value: t0 ? t0.titolo : '' }),
        descrizione: h('textarea', { rows: 4 }),
        richiedente: h('input', { type: 'text', value: t0 ? t0.richiedente || '' : '' }),
        rif: h('input', { type: 'text', value: t0 ? t0.rifCliente || '' : '' }),
      };
      v.descrizione.value = t0 ? t0.descrizione || '' : '';
      let errori = {};
      const sinistra = h('div', { class: 'colonna-f' });
      const destra = h('div', { class: 'colonna-f' });
      const istanteApertura = t0 ? t0.apertoIl : T.isoDi(new Date());

      const pills = (voci, scelta, fn, grandi) => h('div', { class: 'pillole' + (grandi ? ' grandi' : '') }, voci.map(([k, nome]) =>
        h('button', { type: 'button', class: 'pillola' + (scelta === k ? ' scelta' : ''), 'aria-pressed': scelta === k ? 'true' : 'false', onclick: () => fn(k) }, nome)));

      async function leggiContratti() {
        if (!x.idCliente) { x.contratti = []; return; }
        try { const r = await Rete.get('/server/contratti?' + qs({ idCliente: x.idCliente })); x.contratti = r.contratti || []; } catch (e) { x.contratti = []; }
      }
      /** Il contratto che copre l'impianto oggi (attivo, o disdetto non ancora finito): si propone da solo. */
      function proponiContratto() {
        if (x.contrattoScelto) return;
        const oggi = C.oggiIso();
        const c = (x.contratti || []).find(k => (k.stato === 'attivo' || k.stato === 'disdetto') && (!k.al || k.al >= oggi) && (k.dal || '') <= oggi && (k.impianti || []).some(i => String(i.idSede) === String(x.idSede)));
        x.idContratto = c ? c.id : null;
      }
      const contratto = () => (x.contratti || []).find(k => String(k.id) === String(x.idContratto)) || null;

      function disegnaSinistra() {
        svuota(sinistra);
        const cli = x.idCliente ? W.cliente(x.idCliente) : null;
        if (!cli || x.cercaCliente) {
          const rec = clientiRecenti();
          const input = h('input', { type: 'search', placeholder: 'Scrivi il nome', 'aria-label': 'Cerca il cliente' });
          const trovati = h('div', { class: 'fila' });
          const disegnaTrovati = () => {
            const tx = C.normalizza(input.value);
            const lista = tx ? W.clientiAttivi().filter(c => C.normalizza([c.nome].concat(c.alias || []).join(' ')).indexOf(tx) >= 0).slice(0, 6) : rec;
            aggiungi(svuota(trovati), lista.map(c => h('button', { type: 'button', class: 'scelta-card', onclick: () => scegliCliente(c) }, iniziali(c.nome, true), h('span', { class: 'testi' }, h('b', null, c.nome), h('span', null, c.citta || '')))));
          };
          input.addEventListener('input', disegnaTrovati);
          disegnaTrovati();
          aggiungi(sinistra, [h('div', { class: 'campo' + (errori.cliente ? ' sbagliato' : '') }, h('label', null, 'Per chi'), h('label', { class: 'cerca' }, icona('cerca', 18), input), trovati,
            errori.cliente ? h('div', { class: 'errore' }, errori.cliente) : null)]);
          setTimeout(() => input.focus(), 40);
        } else {
          aggiungi(sinistra, [h('div', { class: 'campo' }, h('label', null, 'Per chi'), h('div', { class: 'scelta-card scelta' }, iniziali(cli.nome, true), h('span', { class: 'testi' }, h('b', null, cli.nome), h('span', null, cli.citta || '')),
            t0 && (t0.rapportini || []).length ? null : h('button', { type: 'button', class: 'btn collegamento', onclick: () => { x.cercaCliente = true; disegnaSinistra(); } }, 'Cambia')))]);
          const sedi = S.ana.sedi.filter(s => s.idSoggetto === cli.id && !s.archiviata).sort((a, b) => (a.tipo === 'impianto' ? 0 : 1) - (b.tipo === 'impianto' ? 0 : 1));
          aggiungi(sinistra, [h('div', { class: 'campo' }, h('label', null, 'Quale impianto'),
            h('div', { class: 'pillole' }, sedi.map(s => h('button', { type: 'button', class: 'pillola' + (String(x.idSede) === String(s.id) ? ' scelta' : ''), onclick: () => { x.idSede = s.id; proponiContratto(); disegnaSinistra(); disegnaDestra(); } }, s.nome)),
              h('button', { type: 'button', class: 'pillola' + (!x.idSede ? ' scelta' : ''), onclick: () => { x.idSede = ''; proponiContratto(); disegnaSinistra(); disegnaDestra(); } }, 'Nessuno in particolare')))]);
          const c = contratto();
          if (x.contratti === null) aggiungi(sinistra, [segnaposto(1, 44)]);
          else if (c || (x.contratti || []).length) {
            aggiungi(sinistra, [h('div', { class: 'riga-contratto' }, h('span', { class: 'spazio' }, c ? 'Nel contratto ' + c.numero + ' · ' + (c.copre === 'visite_guasti' ? 'copre visite e guasti' : 'copre solo le visite') : 'Senza contratto'),
              h('button', { type: 'button', class: 'btn collegamento', onclick: () => sceltaContratto() }, 'Cambia'))]);
          }
          const referenti = S.ana.referenti.filter(r => r.idSoggetto === cli.id);
          aggiungi(sinistra, [
            campo('Cosa succede', v.titolo, errori.titolo),
            campo('Cosa dice il cliente', v.descrizione),
            h('div', { class: 'campo' }, h('label', null, 'Chi ha chiamato'),
              referenti.length ? h('div', { class: 'pillole' }, referenti.slice(0, 5).map(r => h('button', { type: 'button', class: 'pillola' + (String(x.idReferente) === String(r.id) ? ' scelta' : ''),
                onclick: () => { x.idReferente = String(x.idReferente) === String(r.id) ? null : r.id; if (x.idReferente) v.richiedente.value = [r.nome, r.telefono].filter(Boolean).join(' · '); disegnaSinistra(); } }, r.nome))) : null,
              v.richiedente),
            x.rifAperto ? campo('Riferimento del cliente', v.rif) : h('div', null, h('button', { type: 'button', class: 'pillola tratteggiata', onclick: () => { x.rifAperto = true; disegnaSinistra(); v.rif.focus(); } }, '+ Riferimento del cliente'))]);
        }
      }

      async function scegliCliente(c) {
        x.idCliente = c.id; x.cercaCliente = false; x.idSede = ''; x.idContratto = null; x.contrattoScelto = false; x.contratti = null; x.idReferente = null;
        delete errori.cliente;
        const impianti = S.ana.sedi.filter(s => s.idSoggetto === c.id && !s.archiviata && s.tipo === 'impianto');
        if (impianti.length === 1) x.idSede = impianti[0].id;
        disegnaSinistra(); disegnaDestra();
        await leggiContratti();
        proponiContratto();
        disegnaSinistra(); disegnaDestra();
      }

      function sceltaContratto() {
        let chiudi;
        chiudi = finestra({ titolo: 'Il contratto', fuoco: false, corpo: h('div', { class: 'scheda righe' },
          riga({ sinistra: quadrato('chiudi'), titolo: 'Senza contratto', onclick: () => { x.idContratto = null; x.contrattoScelto = true; chiudi(); disegnaSinistra(); disegnaDestra(); } }),
          (x.contratti || []).filter(k => k.stato !== 'bozza' && k.stato !== 'chiuso').map(k => riga({ sinistra: h('span', { class: 'codice' }, k.numero), titolo: k.titolo, sotto: k.statoVisto + ' · ' + (k.copre === 'visite_guasti' ? 'visite e guasti' : 'solo visite'),
            onclick: () => { x.idContratto = k.id; x.contrattoScelto = true; chiudi(); disegnaSinistra(); disegnaDestra(); } }))),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla')] });
      }

      function disegnaDestra() {
        svuota(destra);
        const p = T.conPriorita({ impatto: x.impatto, urgenza: x.urgenza, priorita: x.priorita });
        const c = contratto();
        const tempi = T.tempiTicket({ apertoIl: istanteApertura, priorita: p.priorita, tempi: tempiStudio(), contratto: c ? c.tempi : null });
        const chi = collaboratore() ? [[String(io()), 'Io'], ['', 'Nessuno per ora']]
          : [[String(io()), 'Io']].concat(persone().filter(u => String(u.id) !== String(io())).map(u => [String(u.id), u.nome])).concat([['', 'Nessuno per ora']]);
        aggiungi(destra, [
          h('div', { class: 'campo' }, h('label', null, 'Da dove arriva'), pills(T.ORIGINI.concat(x.origine === 'scadenza' ? [['scadenza', 'Da una scadenza']] : []), x.origine, k => { x.origine = k; disegnaDestra(); })),
          h('div', { class: 'campo' }, h('label', null, 'Che cos\'è'), pills(T.TIPI_TICKET.concat(x.tipo === 'programmato' ? [['programmato', 'Programmato']] : []), x.tipo, k => { x.tipo = k; disegnaDestra(); })),
          h('div', { class: 'campo' }, h('label', null, 'L\'impianto è fermo?'), pills(T.IMPATTI, x.impatto, k => { x.impatto = x.impatto === k ? '' : k; disegnaDestra(); }, true)),
          h('div', { class: 'campo' }, h('label', null, 'Per quando?'), pills(T.URGENZE, x.urgenza, k => { x.urgenza = x.urgenza === k ? '' : k; disegnaDestra(); }, true)),
          h('div', { class: 'riga-priorita' }, h('b', null, 'Priorità'), pill(T.nomeDi(T.PRIORITA, p.priorita), T.colorePriorita(p.priorita)), p.prioritaAMano ? h('span', { class: 'piccolo' }, 'scelta a mano') : null,
            h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn collegamento', onclick: () => { x.cambiaPrio = !x.cambiaPrio; disegnaDestra(); } }, 'Cambia')),
          x.cambiaPrio ? h('div', { class: 'pillole' }, T.PRIORITA.map(([k, nome]) => h('button', { type: 'button', class: 'pillola' + (p.priorita === k && p.prioritaAMano ? ' scelta' : ''), onclick: () => { x.priorita = k; x.cambiaPrio = false; disegnaDestra(); } }, nome)),
            h('button', { type: 'button', class: 'pillola' + (!x.priorita ? ' scelta' : ''), onclick: () => { x.priorita = ''; x.cambiaPrio = false; disegnaDestra(); } }, 'Come dicono le risposte')) : null,
          tempi.entroIntervento ? h('div', { class: 'scheda riga-tempi-nuovo' }, 'Intervento ' + T.entro(tempi.entroIntervento, adesso())) : null,
          t0 ? null : h('div', { class: 'campo' }, h('label', null, 'Chi lo segue'), pills(chi, x.responsabileId ? String(x.responsabileId) : '', k => { x.responsabileId = k ? Number(k) || k : null; disegnaDestra(); }))]);
      }

      let chiudi;
      const salva = async () => {
        errori = {};
        if (!x.idCliente) errori.cliente = 'Cliente: scegli il cliente';
        if (!v.titolo.value.trim()) errori.titolo = 'Titolo: scrivi in poche parole cosa succede';
        if (Object.keys(errori).length) { disegnaSinistra(); return; }
        const tk = {
          idCliente: x.idCliente, idSede: x.idSede || null, idContratto: x.idContratto || null, titolo: v.titolo.value.trim(), descrizione: v.descrizione.value.trim(),
          tipo: x.tipo, origine: x.origine, richiedente: v.richiedente.value.trim(), idReferente: x.idReferente || null, rifCliente: v.rif.value.trim(),
          impatto: x.impatto, urgenza: x.urgenza, priorita: x.priorita,
        };
        const c = contratto();
        if (c && c.idCommessa && !t0) tk.idCommessa = c.idCommessa;
        if (t0) tk.id = t0.id;
        else { tk.idLocale = x.idLocale; if (x.responsabileId) tk.responsabileId = x.responsabileId; }
        const r = await lavora(t0 ? 'Salvo il ticket' : 'Apro il ticket', () => Rete.post('/server/salvaTicket', { ticket: tk }));
        if (!r || !r.ticket) return;
        chiudi();
        daRileggere();
        W.caricaDashboard();
        avviso(t0 ? 'Salvato' : 'Ticket ' + r.ticket.numero + ' aperto');
        if (W.percorso().indexOf('ticket') === 0 && !W.percorso().startsWith('ticket/impianto')) {
          M.aperto = r.ticket.id;
          if (W.percorso() === 'ticket' || W.percorso().startsWith('ticket/tk')) { W.ridisegna(); apriPannello(r.ticket.id); } else W.vai('#ticket/tk/' + r.ticket.id);
        } else W.vai('#ticket/tk/' + r.ticket.id);
      };

      disegnaSinistra(); disegnaDestra();
      if (x.idCliente) leggiContratti().then(() => { proponiContratto(); disegnaSinistra(); disegnaDestra(); });
      chiudi = finestra({ titolo: t0 ? 'Cambia ' + t0.numero : 'Nuovo ticket', larghezza: 'larga', fuoco: false, corpo: h('div', { class: 'due-colonne-f' }, sinistra, destra),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, t0 ? 'Salva' : 'Apri il ticket')] });
    }

    // ===================================================================== pianificare l'intervento

    /**
     * Pianifica l'intervento: a sinistra il giorno scelto con le attività di tutti a colonne per persona (8-18),
     * a destra giorno, ora, durata, chi va, luogo. Le sovrapposizioni le dice il server (fase 2): Mettilo lo stesso.
     */
    function pianifica(t) {
      const oggi = C.oggiIso();
      const chi = collaboratore() ? persone().filter(u => String(u.id) === String(io())) : persone();
      const prossimaMezzora = () => { const d = new Date(); const m = d.getHours() * 60 + d.getMinutes(); return Math.min(17.5, Math.max(8, Math.ceil((m + 30) / 30) / 2)); };
      const x = { giorno: oggi, ora: prossimaMezzora(), durata: 1, chi: t.responsabileId || io(), attivita: null, lette: '' };
      if (x.ora >= 17.5) { x.giorno = RA.piuGiorni(oggi, 1); x.ora = 9; }
      const luogo = h('input', { type: 'text', value: t.indirizzoImpianto || '' });
      const altroGiorno = h('input', { type: 'date', value: '' });
      const sinistra = h('div', { class: 'colonna-f agenda-giorno' });
      const destra = h('div', { class: 'colonna-f' });
      const oraTesto = o => Math.floor(o) + ':' + (o % 1 ? '30' : '00');
      const iso = (g, o) => g + 'T' + String(Math.floor(o)).padStart(2, '0') + ':' + (o % 1 ? '30' : '00') + ':00';

      async function leggiGiorno() {
        if (x.lette === x.giorno) return;
        x.attivita = null;
        disegnaSinistra();
        try { const r = await Rete.get('/server/attivita?' + qs({ da: x.giorno, a: x.giorno })); x.attivita = (r.attivita || []).map(RA.normalizzaAttivita).filter(a => a.stato !== 'annullata'); } catch (e) { x.attivita = []; }
        x.lette = x.giorno;
        disegnaSinistra(); disegnaDestra();
      }

      const sovrapposte = () => (x.attivita || []).filter(a => String(a.assegnataA) === String(x.chi) && a.inizio && !a.tuttoIlGiorno && a.inizio < iso(x.giorno, x.ora + x.durata) && (a.fine || a.inizio) > iso(x.giorno, x.ora));

      function disegnaSinistra() {
        svuota(sinistra);
        if (x.attivita === null) { aggiungi(sinistra, [segnaposto(4, 40)]); return; }
        const ore = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
        const colonne = chi.length ? chi : persone();
        const griglia = h('div', { class: 'agenda-pf', style: { gridTemplateColumns: '54px repeat(' + colonne.length + ', minmax(0, 1fr))' } },
          h('span'), colonne.map(u => h('span', { class: 'chi-pf' }, u.nome)),
          ore.map(o => [h('span', { class: 'ora-pf' }, o + ':00')].concat(colonne.map(u => {
            const cella = h('span', { class: 'cella-pf' });
            (x.attivita || []).filter(a => String(a.assegnataA) === String(u.id) && a.inizio && Number(String(a.inizio).slice(11, 13)) === o).forEach(a => aggiungi(cella, [h('span', { class: 'blocco-pf' + (a.tipo === 'intervento' ? ' intervento' : '') }, RA.ora(a.inizio) + ' ' + a.titolo)]));
            if (String(u.id) === String(x.chi) && o >= Math.floor(x.ora) && o < x.ora + x.durata) aggiungi(cella, [h('span', { class: 'blocco-pf nuovo' }, t.numero)]);
            return cella;
          }))));
        aggiungi(sinistra, [h('span', { class: 'etichetta' }, T.maiuscola(T.giornoA(T.istante(x.giorno)))), griglia]);
      }

      function disegnaDestra() {
        svuota(destra);
        const giorni = [0, 1, 2, 3, 4, 5].map(n => RA.piuGiorni(oggi, n));
        const sopra = sovrapposte();
        aggiungi(destra, [
          h('div', { class: 'campo' }, h('label', null, 'Che giorno'), h('div', { class: 'giorni-pf' }, giorni.map((g, i) => {
            const d = T.istante(g);
            return h('button', { type: 'button', class: 'giorno-pf' + (x.giorno === g ? ' scelto' : ''), 'aria-pressed': x.giorno === g ? 'true' : 'false', onclick: () => { x.giorno = g; leggiGiorno(); disegnaDestra(); } },
              h('span', null, i === 0 ? 'oggi' : i === 1 ? 'domani' : RA.GIORNI_BREVI[d.getDay()].toLowerCase()), h('b', null, String(d.getDate())));
          })), h('div', { class: 'riga-campi' }, campo('Altro giorno', altroGiorno))),
          h('div', { class: 'campo' }, h('label', null, 'A che ora'), h('span', { class: 'stepper grande-pf' },
            tondo('meno', 'Mezz\'ora prima', () => { x.ora = Math.max(6, x.ora - 0.5); disegnaSinistra(); disegnaDestra(); }), h('span', { class: 'valore' }, oraTesto(x.ora)),
            tondo('piu', 'Mezz\'ora dopo', () => { x.ora = Math.min(20, x.ora + 0.5); disegnaSinistra(); disegnaDestra(); }))),
          h('div', { class: 'campo' }, h('label', null, 'Quanto dura'), h('div', { class: 'pillole' }, [[1, '1 h'], [2, '2 h'], [4, 'Mezza giornata']].map(([d, nome]) =>
            h('button', { type: 'button', class: 'pillola' + (x.durata === d ? ' scelta' : ''), onclick: () => { x.durata = d; disegnaSinistra(); disegnaDestra(); } }, nome)))),
          h('div', { class: 'campo' }, h('label', null, 'Chi va'), h('div', { class: 'pillole' }, chi.map(u => h('button', { type: 'button', class: 'pillola' + (String(x.chi) === String(u.id) ? ' scelta' : ''),
            onclick: () => { x.chi = u.id; disegnaSinistra(); disegnaDestra(); } }, u.nome)))),
          campo('Luogo', luogo),
          sopra.length ? h('div', { class: 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Si sovrappone a: ' + sopra.map(a => a.titolo + ' (' + RA.ora(a.inizio) + (a.fine ? '-' + RA.ora(a.fine) : '') + ')').join(', '))) : null]);
        const g = document.querySelector('.finestra .btn.giallo.metti-pf');
        if (g) g.textContent = sopra.length ? 'Mettilo lo stesso' : 'Metti in calendario';
      }
      altroGiorno.addEventListener('change', () => { if (altroGiorno.value) { x.giorno = altroGiorno.value; leggiGiorno(); disegnaDestra(); } });

      let chiudi;
      const metti = async () => {
        const corpo = { id: t.id, inizio: iso(x.giorno, x.ora), fine: iso(x.giorno, x.ora + x.durata), assegnataA: x.chi, luogo: luogo.value.trim() };
        if (sovrapposte().length) corpo.conferma = true;
        const r = await W.scriviConConferma('Metto in calendario', '/server/pianificaTicket', corpo, d => conferma('Si sovrappone a un altro appuntamento', (d.errore || 'Si sovrappone') + '. Metterlo lo stesso?', 'Mettilo lo stesso'));
        if (!r) return;
        chiudi();
        if (W.Attivita) W.Attivita.daRileggere();
        // Fase 7 (§3.14): l'avviso "Intervento fissato per giovedì 23" con Avvisa il cliente (modello Intervento fissato); non parte niente da solo.
        const d7 = new Date(String(corpo.inizio).slice(0, 10) + 'T12:00:00');
        const giorno7 = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][d7.getDay()] + ' ' + d7.getDate();
        if (W.Comunicazioni && puo('comunicazioni', 2) && t.idCliente) aggiorna(r.ticket, 'Intervento fissato per ' + giorno7, { testo: 'Avvisa il cliente', fn: () => W.Comunicazioni.scrivi({ modello: 'intervento_fissato', canale: 'whatsapp', idCliente: t.idCliente, idReferente: (t.referente && t.referente.id) || null, idTicket: t.id, idAttivita: r.attivita && r.attivita.id ? r.attivita.id : undefined }) });
        else aggiorna(r.ticket, 'Intervento in calendario: ' + T.quando(corpo.inizio, adesso()));
      };
      disegnaDestra();
      leggiGiorno();
      chiudi = finestra({ titolo: 'Pianifica l\'intervento', larghezza: 'larga', fuoco: false,
        corpo: [h('p', { class: 'sotto-titolo' }, t.numero + ' · ' + t.titolo), h('div', { class: 'due-colonne-f pf' }, sinistra, destra)],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande metti-pf', onclick: metti }, 'Metti in calendario')] });
    }

    // ===================================================================== il lavoro è finito?

    /**
     * Dopo il rapportino di un ticket non ancora risolto (fase5.md §3.3): Sì, è risolto (giallo) o
     * Serve un altro intervento. Il lavoro salvato è da inviare: lo si dice.
     */
    async function lavoroFinito(rapportino) {
      if (!rapportino || !rapportino.idTicket || !scrive()) return;
      const r = await Rete.get('/server/ticket?id=' + rapportino.idTicket).catch(() => null);
      const t = r && r.ticket;
      if (!t || ['aperto', 'in_carico', 'in_attesa'].indexOf(t.stato) < 0 || t.puoScrivere === false) return;
      let chiudi;
      // 06/11/2026: niente firma; il lavoro salvato è da inviare al cliente.
      chiudi = finestra({ titolo: 'Il lavoro è finito?', fuoco: false,
        corpo: [h('p', { class: 'testo-forte' }, (rapportino.idGiornata || rapportino.id || 'Il rapportino') + ' salvato: è da inviare al cliente'),
          h('p', { class: 'secondario' }, t.numero + ' · ' + t.titolo)],
        pulsanti: [h('button', { type: 'button', class: 'btn grande', onclick: async () => {
          chiudi();
          const x = await lavora('Un momento', () => Rete.post('/server/altroIntervento', { id: t.id }));
          if (x) { daRileggere(); W.caricaDashboard(); avviso('Il ticket resta in carico: serve un altro intervento'); if (M.aperto) aggiorna(x.ticket); }
        } }, 'Serve un altro intervento'), 'spazio',
        h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
          chiudi();
          const x = await lavora('Segno risolto', () => Rete.post('/server/risolviTicket', { id: t.id }));
          if (x) { daRileggere(); W.caricaDashboard(); avviso(t.numero + ' risolto'); if (M.aperto) aggiorna(x.ticket); }
        } }, 'Sì, è risolto')] });
    }

    // ===================================================================== chiudere

    /** La riga di fattura che nascerà (righeTicket): rapportini dall'elenco, spese al cliente, ore fatturabili. */
    function rigaPrevista(t, prezzoCorpo) {
      const cli = W.cliente(t.idCliente) || {};
      const rapportini = (t.rapportini || []).map(r => W.attivi().find(x => x.id === r.id)).filter(Boolean);
      if (rapportini.length !== (t.rapportini || []).length) return null;
      const spese = (t.spese || []).filter(s => s.destinazione === 'cliente' && s.stato !== 'respinta' && !s.tolta).map(s => ({ id: s.id, idRapportino: s.idRapportino, data: s.data, descrizione: s.descrizione, importo: s.importo, anticipazione: !!s.anticipazione }));
      const fatturabili = (t.ore || []).filter(o => o.fatturabile && o.stato !== 'respinta');
      const regole = C.regoleDi(cli, S.ana.gruppi, S.ana.impostazioni, W.commessa(t.idCommessa));
      const conPrezzo = prezzo => T.righeTicket({ ticket: { numero: t.numero, titolo: t.titolo, impianto: t.impianto, risolto: String(t.risoltoIl || C.oggiIso()).slice(0, 10), idCommessa: t.idCommessa, prezzoCorpo },
        cliente: { pagaViaggio: regole.pagaViaggio }, rapportini, spese, ore: fatturabili.map(o => ({ id: o.id, ore: o.ore, prezzo })) })[0];
      let g = conPrezzo(null);
      // Il prezzo delle ore registrate (tariffa fuori contratto o prezzo della commessa) lo sa il server: si ricava
      // da quello che resta della sua somma, e la riga si mostra solo se torna al centesimo.
      const oreTot = fatturabili.reduce((a, o) => a + C.num(o.ore), 0);
      const importo = t.somma && t.somma.importo;
      if (!prezzoCorpo && oreTot > 0 && typeof importo === 'number' && importo > g.righe[0].importo) g = conPrezzo(Math.round((importo - g.righe[0].importo) / oreTot * 100) / 100);
      return g;
    }

    function chiudiTicket(t) {
      const prop = (t.proposta && t.proposta.fatturazione) || 'ticket';
      const x = { modo: prop, corpo: false };
      const prezzo = h('input', { type: 'text', inputmode: 'decimal', class: 'importo-grande', placeholder: '0,00' });
      const motivo = h('input', { type: 'text' });
      let errori = {};
      const sinistra = h('div', { class: 'colonna-f' });
      const destra = h('div', { class: 'colonna-f' });
      const s = t.somma || {};
      const disegna = () => {
        svuota(sinistra);
        aggiungi(sinistra, [h('p', { class: 'sotto-titolo' }, t.numero + ' · ' + t.cliente), h('b', null, 'Come si fattura?'),
          T.FATTURAZIONI.map(([k, nome, sotto]) => {
            const spento = k === 'contratto' && !t.idContratto;
            const testoSotto = k === 'contratto' && t.idContratto ? 'Lo copre il canone di ' + t.contratto : k === 'contratto' ? 'Il ticket non è legato a un contratto' : sotto;
            return h('button', { type: 'button', class: 'scelta-ruolo scelta-fatt' + (x.modo === k ? ' scelto' : ''), disabled: spento, 'aria-pressed': x.modo === k ? 'true' : 'false',
              onclick: () => { x.modo = k; errori = {}; disegna(); } },
            h('span', { class: 'pallino-scelta' }), h('span', { class: 'testi' }, h('b', null, nome), h('span', null, testoSotto),
              k === prop && t.proposta ? h('span', { class: 'proposta-fatt' }, 'Proposta: ' + t.proposta.perche) : null));
          }),
          x.modo === 'no' ? campo('Perché non si fattura', motivo, errori.motivo) : null,
          t.daFirmare ? h('div', { class: 'banda giallina' }, icona('firma', 20, 2.2), h('span', { class: 'spazio' }, t.daFirmare + ': va in fattura dopo')) : null]);
        svuota(destra);
        if (x.modo === 'ticket') {
          const corpoN = x.corpo ? C.numONull(prezzo.value) : null;
          const g = rigaPrevista(t, corpoN);
          const importo = x.corpo ? (corpoN || 0) : (g && g.righe[0].importo !== undefined && Math.abs(g.righe[0].importo - (s.importo || 0)) < 0.005 ? g.righe[0].importo : (s.importo || 0));
          const riga0 = g && (x.corpo || Math.abs(g.righe[0].importo - (s.importo || 0)) < 0.005) ? g.righe[0].descrizione
            : 'Intervento ' + t.numero + ' del ' + C.data(String(t.risoltoIl || C.oggiIso()).slice(0, 10)) + ': ' + t.titolo + (t.impianto ? ' - ' + t.impianto : '');
          const anticipate = (t.spese || []).filter(z => z.destinazione === 'cliente' && z.anticipazione && z.stato !== 'respinta');
          aggiungi(destra, [h('div', { class: 'scheda in-fattura' },
            h('span', { class: 'etichetta' }, 'Cosa entra nella riga'),
            h('div', { class: 'secondario' }, T.sommaTesto(s) || 'Niente ancora'),
            (t.rapportini || []).length ? h('div', { class: 'piccolo' }, (t.rapportini.length === 1 ? '1 rapportino: ' : t.rapportini.length + ' rapportini: ') + t.rapportini.map(r => r.id).join(', ')) : null,
            anticipate.length ? h('div', { class: 'piccolo' }, 'A parte, senza IVA: ' + anticipate.map(z => (z.descrizione || 'spesa') + ' ' + C.euro(z.importo)).join(', ')) : null,
            h('div', { class: 'tot-fatt' }, h('b', null, 'In fattura'), h('span', { class: 'quanto-grande' }, C.euro(importo))),
            h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: x.corpo, onchange: e => { x.corpo = e.target.checked; disegna(); if (x.corpo) prezzo.focus(); } }), 'A corpo, con un prezzo'),
            x.corpo ? campo('Prezzo a corpo', B.conSuffisso(prezzo, '€'), errori.prezzo) : null,
            h('div', { class: 'riga-fattura' }, h('span', { class: 'etichetta' }, 'La riga che nascerà'), h('div', null, riga0)))]);
        } else if (x.modo === 'separati') {
          aggiungi(destra, [h('div', { class: 'scheda in-fattura' }, h('span', { class: 'etichetta' }, 'Cosa succede'),
            h('div', null, 'Rapportini e spese del ticket vanno in Da fatturare come sempre, con le regole del cliente.'), h('div', { class: 'secondario' }, T.sommaTesto(s)))]);
        } else if (x.modo === 'contratto') {
          aggiungi(destra, [h('div', { class: 'scheda in-fattura' }, h('span', { class: 'etichetta' }, 'Cosa succede'),
            h('div', null, 'Niente da fatturare: è coperto dal canone del contratto ' + t.contratto + '.'),
            h('div', { class: 'secondario' }, 'Le spese al cliente si fatturano a parte se il contratto non comprende i materiali.'))]);
        } else {
          aggiungi(destra, [h('div', { class: 'scheda in-fattura' }, h('span', { class: 'etichetta' }, 'Cosa succede'), h('div', null, 'Niente del ticket va in Da fatturare.'))]);
        }
      };
      prezzo.addEventListener('input', () => { clearTimeout(prezzo.t); prezzo.t = setTimeout(() => { const pos = prezzo.selectionStart; disegna(); prezzo.focus(); try { prezzo.setSelectionRange(pos, pos); } catch (e) { /* niente */ } }, 400); });
      disegna();
      let chiudi;
      const vai = async () => {
        errori = {};
        const corpo = { id: t.id, fatturazione: x.modo };
        if (x.modo === 'ticket' && x.corpo) {
          const n = C.numONull(prezzo.value);
          if (!(n > 0)) errori.prezzo = 'Prezzo a corpo: scrivi quanto';
          else corpo.prezzoCorpo = n;
        }
        if (x.modo === 'no') { if (!motivo.value.trim()) errori.motivo = 'Scrivi perché non si fattura'; else corpo.motivo = motivo.value.trim(); }
        if (Object.keys(errori).length) { disegna(); return; }
        const r = await W.scriviConConferma('Chiudo il ticket', '/server/chiudiTicket', corpo, d => conferma('Chiudo lo stesso?', d.errore, 'Chiudi lo stesso'));
        if (!r) return;
        chiudi();
        const df = r.daFatturare;
        const messaggio = df ? (df.pronta ? 'Chiuso: va in Da fatturare (' + C.euro(df.importo) + ')' : 'Chiuso: va in Da fatturare quando ' + (df.perche || 'è pronto')) : 'Chiuso: ' + (r.ticket.statoDettaglio || 'fatto');
        aggiorna(r.ticket, messaggio, { testo: 'Annulla', fn: async () => {
          const y = await lavora('Riapro', () => Rete.post('/server/riapriTicket', { id: t.id, motivo: 'Chiuso per sbaglio' }));
          if (y) aggiorna(y.ticket, 'Riaperto');
        } });
      };
      chiudi = finestra({ titolo: 'Chiudi il ticket', larghezza: 'media', fuoco: false, corpo: h('div', { class: 'due-colonne-f chiudi-tk' }, sinistra, destra),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Chiudi il ticket')] });
    }

    // ===================================================================== programmati

    function paginaProgrammati(pagina) {
      aggiungi(pagina, [testata('Interventi programmati', gialloNuovo()), segmentiTk('programmati')]);
      conDati(pagina, async () => {
        if (!M.programmati) M.programmati = await Rete.get('/server/tickets?segmento=programmati');
        if (!M.visite) { try { const s = await Rete.get('/server/scadenze?tipo=manutenzione'); M.visite = [].concat(s.scadute || [], s.entro || [], s.piuAvanti || []).filter(x => x.azione === 'ticket' && !x.idTicket); } catch (e) { M.visite = []; } }
      }, () => {
        const lista = M.programmati.ticket || [];
        const daPianificare = lista.filter(t => !t.prossimoIntervento);
        const inCalendario = lista.filter(t => t.prossimoIntervento);
        const col = '74px minmax(0, 2fr) minmax(0, 1.6fr) 130px 150px';
        const tab = (righe, conVisite) => {
          const x = h('div', { class: 'tab tab-ticket' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } },
            h('span', null, 'Previsto'), h('span', null, 'Titolo'), h('span', null, 'Cliente e impianto'), h('span', null, 'Contratto'), h('span', null, 'Stato')));
          righe.forEach(t => {
            const gg = T.giornoGrande(conVisite ? t.data : (t.previstoIl || String(t.entroIntervento).slice(0, 10)));
            aggiungi(x, [h('div', { class: 'r' + (conVisite ? '' : ' cliccabile'), style: { gridTemplateColumns: col }, role: conVisite ? null : 'button', tabindex: conVisite ? null : '0', 'data-id': conVisite ? null : t.id,
              onclick: conVisite ? (W.Archivio ? () => W.Archivio.apriScadenza(t.id, t) : null) : () => apriPannello(t.id) },
            h('span', { class: 'giorno-scad gs-grigio' }, h('b', null, gg.g), h('span', null, gg.m)),
            h('span', { class: 'doppia' }, h('span', null, t.titolo), h('span', null, conVisite ? 'il ticket nasce il ' + C.data(RA.piuGiorni(t.data, -(t.anticipoGiorni || 30))) : t.numero)),
            h('span', { class: 't2 taglia' }, [t.cliente, t.impianto].filter(Boolean).join(' · ')),
            h('span', { class: 't2' }, t.contratto || '—'),
            h('span', null, conVisite ? pill('Prossima', 'grigio') : t.prossimoIntervento ? pill(T.maiuscola(T.quando(t.prossimoIntervento.inizio, adesso())), 'blu') : pill('Da pianificare', 'giallo')))]);
          });
          return x;
        };
        aggiungi(pagina, [h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Da pianificare · ' + daPianificare.length), daPianificare.length ? tab(daPianificare) : h('div', { class: 'scheda vuoto sinistra' }, 'Niente qui.')),
          h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'In calendario · ' + inCalendario.length), inCalendario.length ? tab(inCalendario) : h('div', { class: 'scheda vuoto sinistra' }, 'Niente qui.')),
          (M.visite || []).length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Prossime visite dei contratti · ' + M.visite.length), tab(M.visite, true)) : null,
          h('p', { class: 'secondario' }, 'Le prossime visite nascono ' + (S.ana.impostazioni.ANTICIPO_TICKET_GIORNI || 30) + ' giorni prima.')]);
      });
    }

    // ===================================================================== chiusi

    function paginaChiusi(pagina) {
      const [a, m] = M.mese.split('-').map(Number);
      const da = M.mese + '-01';
      const fine = new Date(a, m, 0).getDate();
      const al = M.mese + '-' + String(fine).padStart(2, '0');
      const sposta = d => { const x = new Date(a, m - 1 + d, 15); M.mese = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); M.chiusi = null; W.disegnaPagina(); };
      aggiungi(pagina, [testata('Ticket chiusi', gialloNuovo()), segmentiTk('chiusi'),
        h('div', { class: 'testa-calendario' }, tondo('indietro', 'Mese prima', () => sposta(-1)), h('h2', { class: 'titolo-calendario' }, T.maiuscola(C.nomeMese(M.mese))), tondo('avanti', 'Mese dopo', () => sposta(1)),
          h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.esporta('ticket', { segmento: 'chiusi', da, a: al }) }, 'Esporta per Excel'))]);
      conDati(pagina, async () => { if (!M.chiusi || M.chiusi.chiave !== M.mese) { M.chiusi = await Rete.get('/server/tickets?' + qs({ segmento: 'chiusi', da, a: al })); M.chiusi.chiave = M.mese; } }, () => {
        const lista = M.chiusi.ticket || [];
        if (!lista.length) { aggiungi(pagina, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Nessun ticket chiuso in questo mese')]); return; }
        const col = '92px 118px minmax(0, 2fr) 150px 150px 120px';
        const tab = h('div', { class: 'tab tab-ticket' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } },
          h('span', null, 'Chiuso il'), h('span', null, 'Numero'), h('span', null, 'Cosa'), h('span', null, 'Come si fattura'), h('span', null, 'Fattura'), h('span', null, 'Tempo di chiusura')));
        lista.forEach(t => {
          const giorni = t.chiusoIl ? Math.max(0, Math.round((T.istante(t.chiusoIl) - T.istante(t.apertoIl)) / 86400000)) : null;
          aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-id': t.id, onclick: () => apriPannello(t.id) },
            h('span', { class: 't2' }, C.data(String(t.chiusoIl || '').slice(0, 10)).slice(0, 5) || '—'),
            h('span', { class: 'forte num-tk' }, t.numero),
            h('span', { class: 'doppia' }, h('span', null, t.titolo), h('span', null, [t.cliente, t.impianto].filter(Boolean).join(' · '))),
            h('span', null, t.stato === 'annullato' ? pill('Annullato', 'grigio') : pill(t.fatturazioneNome || T.FATTURAZIONE_BREVE[t.fatturazione] || '—', 'grigio')),
            h('span', { class: 't2' }, t.fattura ? t.fattura.etichetta : '—'),
            h('span', { class: 't2' }, giorni === null ? '—' : giorni === 0 ? 'in giornata' : giorni === 1 ? '1 giorno' : giorni + ' giorni'))]);
        });
        aggiungi(pagina, [tab]);
      });
    }

    // ===================================================================== contratti

    function paginaContratti(pagina, apriId) {
      const giallo = scriveContratti() ? h('button', { type: 'button', class: 'btn giallo', 'data-giallo-pagina': '1', onclick: () => moduloContratto(null) }, icona('piu', 18, 2.6), 'Nuovo contratto') : null;
      aggiungi(pagina, [testata('Contratti di assistenza', giallo), segmentiTk('contratti')]);
      conDati(pagina, async () => { if (!M.contratti) M.contratti = await Rete.get('/server/contratti'); }, () => {
        const lista = M.contratti.contratti || [];
        if (!lista.length) { aggiungi(pagina, [h('div', { class: 'calmo' }, icona('contratto', 20, 2.2), 'Nessun contratto di assistenza')]); }
        else {
          const col = '112px minmax(0, 2fr) 150px 96px 108px ' + (soldi() ? '96px ' : '') + '56px 96px';
          const tab = h('div', { class: 'tab tab-contratti' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } },
            h('span', null, 'Numero'), h('span', null, 'Titolo e cliente'), h('span', null, 'Periodo'), h('span', null, 'Rinnovo'), h('span', null, 'Stato'),
            soldi() ? h('span', { class: 'n' }, 'Canone') : null, h('span', { class: 'n' }, 'Ticket'), h('span', null, 'Prossima visita')));
          lista.forEach(k => {
            const prossima = (k.impianti || []).map(i => i.prossimaVisita).filter(Boolean).sort()[0];
            aggiungi(tab, [h('div', { class: 'r cliccabile' + (String(M.contrattoAperto) === String(k.id) ? ' scelta' : ''), style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-id': k.id,
              onclick: () => apriContratto(k.id), onkeydown: e => { if (e.key === 'Enter') apriContratto(k.id); } },
            h('span', null, h('span', { class: 'codice' }, k.numero)),
            h('span', { class: 'doppia' }, h('span', null, k.titolo), h('span', null, k.cliente)),
            h('span', { class: 't2 piccolo-14' }, C.data(k.dal).slice(0, 6) + String(k.dal).slice(2, 4) + ' – ' + C.data(k.al).slice(0, 6) + String(k.al).slice(2, 4)),
            h('span', { class: 't2' }, k.rinnovo === 'tacito' ? 'tacito' : 'no'),
            h('span', null, pill(k.statoVisto, T.coloreContratto(k.statoVisto))),
            soldi() ? h('span', { class: 'n forte' }, k.canone !== undefined ? C.euro(k.canone) : '—') : null,
            h('span', { class: 'n t2' }, String((k.ticket && k.ticket.anno) || 0)),
            h('span', { class: 't2' }, prossima ? C.data(prossima) : '—'))]);
          });
          aggiungi(pagina, [tab]);
        }
        if (apriId && !document.querySelector('.pannello-contratto')) apriContratto(apriId);
        else if (M.contrattoAperto && !document.querySelector('.pannello-contratto')) apriContratto(M.contrattoAperto);
        else if (M.contrattoAperto) gialloPagina(true);
      });
    }

    async function apriContratto(id) {
      M.contrattoAperto = id;
      document.querySelectorAll('.tab-contratti .r[data-id]').forEach(x => x.classList.toggle('scelta', String(x.dataset.id) === String(id)));
      const r = await lavora('Apro il contratto', () => Rete.get('/server/contratto?id=' + encodeURIComponent(id)));
      if (!r || !r.contratto) { M.contrattoAperto = null; return; }
      M.contratto = r.contratto;
      disegnaContratto();
    }

    function chiudiContrattoPannello(subito) {
      const p = document.querySelector('.pannello-contratto');
      M.contrattoAperto = null;
      M.contratto = null;
      gialloPagina(false);
      document.querySelectorAll('.tab .r.scelta').forEach(x => x.classList.remove('scelta'));
      if (!p) return;
      if (subito) { p.remove(); return; }
      p.classList.add('via');
      setTimeout(() => p.remove(), 200);
    }

    const TEMPI_NOMI = { urgente: 'Urgente', alta: 'Alta', normale: 'Normale', bassa: 'Bassa' };
    const testoTempi = tempi => {
      if (!tempi) return 'Quelli dello studio';
      return Object.keys(tempi).map(k => TEMPI_NOMI[k] + ': ' + [tempi[k].presa !== undefined ? 'presa entro ' + T.numeroIt(tempi[k].presa) + (Number(tempi[k].presa) === 1 ? ' ora' : ' ore') : '',
        tempi[k].intervento !== undefined ? 'intervento entro ' + T.numeroIt(tempi[k].intervento) + (Number(tempi[k].intervento) === 1 ? ' ora' : ' ore') : ''].filter(Boolean).join(', ')).join('; ');
    };

    function disegnaContratto() {
      const k = M.contratto;
      const vecchio = document.querySelector('.pannello-contratto');
      if (!k) { if (vecchio) vecchio.remove(); return; }
      const scriveQui = scriveContratti() && k.puoScrivere !== false;
      const coppia = (a, b) => b ? h('div', { class: 'coppia' }, h('span', { class: 'k' }, a), h('span', { class: 'v' }, b)) : null;
      const corpo = h('div', { class: 'corpo' },
        h('div', { class: 'alto' }, h('span', { class: 'etichetta-pannello' }, 'Contratto'), h('span', { class: 'spazio' }), menuContratto(k, scriveQui), tondo('chiudi', 'Chiudi', () => chiudiContrattoPannello(), 'piccolo')),
        h('div', { class: 'pillole-testa' }, h('span', { class: 'codice' }, k.numero), pill(k.statoVisto, T.coloreContratto(k.statoVisto))),
        h('h2', { class: 'titolo-pannello' }, k.titolo),
        h('span', { class: 'sotto-titolo' }, k.cliente + ' · dal ' + C.data(k.dal) + ' al ' + C.data(k.al)),
        k.statoDettaglio && (k.statoVisto === 'In scadenza' || k.statoVisto === 'Scaduto' || k.statoVisto === 'Disdetto') ? h('div', { class: k.statoVisto === 'Scaduto' ? 'banda' : 'banda giallina' }, icona('avviso', 20),
          h('span', { class: 'spazio' }, k.rinnovo === 'tacito' && k.statoVisto === 'In scadenza' ? 'Si rinnova da solo il ' + C.data(RA.piuGiorni(k.al, 1)) + ': la ' + k.statoDettaglio.replace(/^disdetta/, 'disdetta va mandata') : T.maiuscola(k.statoDettaglio))) : null,
        h('div', { class: 'scheda coppie' },
          coppia('Rinnovo', k.rinnovo === 'tacito' ? 'Si rinnova da solo, disdetta ' + (k.disdettaGiorni || 0) + ' giorni prima' : 'Senza rinnovo'),
          coppia('Copre', (k.copre === 'visite_guasti' ? 'Visite e guasti' : 'Solo le visite') + (k.materialiInclusi ? ', materiale compreso' : ', materiale a parte')),
          soldi() && k.canone !== undefined ? coppia('Canone', C.euro(k.canone) + ' all\'anno, ' + T.nomeDi(T.RATE, k.fatturazioneCanone).toLowerCase()) : null,
          soldi() && k.tariffaExtra !== undefined && k.tariffaExtra !== null ? coppia('Lavoro fuori contratto', C.euro(k.tariffaExtra) + ' all\'ora') : null,
          coppia('Tempi promessi', testoTempi(k.tempi)),
          k.idCommessa ? h('button', { type: 'button', class: 'coppia link', onclick: () => { chiudiContrattoPannello(true); W.vai('#commesse/' + encodeURIComponent(k.idCommessa)); } }, h('span', { class: 'k' }, 'Commessa'), h('span', { class: 'v' }, k.idCommessa)) : null,
          k.note ? coppia('Note', k.note) : null),
        h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Impianti e visite'), (k.impianti || []).length ? h('div', { class: 'scheda righe' }, k.impianti.map(i => riga({
          sinistra: quadrato('fulmine', 'ico-blu'), titolo: i.nome, sotto: (i.ogniMesi ? 'una visita ' + T.ogni(i.ogniMesi) : 'nessuna visita programmata') + (i.prossimaVisita ? ' · la prossima ' + T.giornoA(T.istante(i.prossimaVisita)) + (T.giornoA(T.istante(i.prossimaVisita)).indexOf(' ') < 0 ? '' : '') : ''),
          onclick: () => { chiudiContrattoPannello(true); W.vai('#ticket/impianto/' + i.idSede); } }))) : h('p', { class: 'vuoto sinistra piccolo' }, 'Nessun impianto.')),
        soldi() && (k.rate || []).length ? h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Rate del canone'), h('div', { class: 'scheda righe' }, k.rate.map(x => riga({
          sinistra: quadrato('fatturazione'), titolo: x.descrizione, sotto: C.data(x.data) + (x.importo !== undefined ? ' · ' + C.euro(x.importo) : ''), destra: pill(x.statoVisto, T.coloreRata(x.stato)) })))) : null,
        h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Ticket'), h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('chiaveInglese'),
          titolo: T.quanti((k.ticket && k.ticket.aperti) || 0, 'aperto', 'aperti') + ' · ' + T.quanti((k.ticket && k.ticket.anno) || 0, 'nell\'anno', 'nell\'anno'),
          onclick: () => { chiudiContrattoPannello(true); M.pill = 'tutti'; M.testo = k.numero; M.aperti = null; W.vai('#ticket'); } }))),
        k.documento ? h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Contratto firmato'), h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('file'), titolo: k.documento.titolo,
          onclick: () => { chiudiContrattoPannello(true); W.vai('#documenti/doc/' + k.documento.id); } }))) : null,
        soldi() && k.rende ? h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Se rende'), h('div', { class: 'scheda coppie' },
          coppia('Canone', C.euro(k.rende.canone)), coppia('Costo dei ticket', C.euro(k.rende.costo)), coppia('Fatturato fuori contratto', C.euro(k.rende.fatturatoExtra)),
          h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Margine'), h('span', { class: 'v' + (k.rende.margine < 0 ? ' rosso-testo' : '') }, C.euro(k.rende.margine))))) : null);
      let giallo = null;
      if (scriveQui && k.stato === 'bozza') giallo = h('button', { type: 'button', class: 'btn grande giallo', onclick: () => attiva(k) }, 'Attiva il contratto');
      else if (scriveQui && k.statoVisto === 'In scadenza' && k.rinnovo === 'no') giallo = h('button', { type: 'button', class: 'btn grande giallo', onclick: () => rinnova(k) }, 'Rinnova');
      const p = h('aside', { class: 'pannello pannello-contratto', 'aria-label': 'Il contratto ' + k.numero }, corpo, giallo ? h('div', { class: 'piede' }, giallo) : null);
      gialloPagina(true);
      if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi(B.$('#sovrapposti'), [p]);
    }

    function menuContratto(k, scriveQui) {
      const voci = [
        scriveQui && k.stato !== 'chiuso' ? { testo: 'Cambia', fn: () => moduloContratto(k) } : null,
        scriveQui && k.stato === 'attivo' ? { testo: 'Rinnova', fn: () => rinnova(k) } : null,
        scriveQui && k.stato === 'attivo' ? { testo: 'Disdici', fn: () => disdici(k) } : null,
        scriveQui && (k.stato === 'attivo' || k.stato === 'disdetto') ? { testo: 'Chiudi adesso', fn: () => chiudiContratto(k), pericolo: true } : null,
        { testo: 'Contratto in PDF', fn: () => pdfContratto(k) },
      ].filter(Boolean);
      const b = h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18));
      b.addEventListener('click', () => apriMenu(b, voci));
      return b;
    }

    async function aggiornaContratto(c, messaggio) {
      if (c) M.contratto = c;
      M.contratti = null;
      W.caricaDashboard();
      W.ricaricaAnagrafiche().catch(() => null);
      if (messaggio) avviso(messaggio);
      const tieni = M.contrattoAperto;
      W.ridisegna();
      if (tieni) apriContratto(tieni);
    }

    async function attiva(k) {
      const r = await lavora('Attivo il contratto', () => Rete.post('/server/attivaContratto', { id: k.id }));
      if (r) aggiornaContratto(r.contratto, 'Contratto attivo: nascono la commessa, le rate e le visite');
    }

    function rinnova(k) {
      const al = h('input', { type: 'date', value: '' });
      const canone = h('input', { type: 'text', inputmode: 'decimal', value: k.canone !== undefined ? R.numeroCampo(k.canone) : '' });
      let chiudi;
      const vai = async () => {
        const corpo = { id: k.id };
        if (al.value) corpo.al = al.value;
        const c = C.numONull(canone.value);
        if (c !== null && c !== k.canone) corpo.canone = c;
        const r = await lavora('Rinnovo', () => Rete.post('/server/rinnovaContratto', corpo));
        if (!r) return;
        chiudi();
        aggiornaContratto(r.contratto, 'Rinnovato fino al ' + C.data(r.contratto.al));
      };
      chiudi = finestra({ titolo: 'Rinnova ' + k.numero, corpo: [h('p', { class: 'secondario' }, 'Il periodo nuovo parte il ' + C.data(RA.piuGiorni(k.al, 1)) + '. Il canone nuovo vale solo per le rate nuove.'),
        h('div', { class: 'riga-campi' }, campo('Fino al (vuoto: un anno)', al), soldi() ? campo('Canone all\'anno', B.conSuffisso(canone, '€')) : null)],
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Rinnova')] });
    }

    function disdici(k) {
      const motivo = h('input', { type: 'text' });
      const data = h('input', { type: 'date', value: C.oggiIso() });
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'secondario' }, 'Il contratto finisce il ' + C.data(k.al) + ' e non si rinnova.'), h('div', { class: 'riga-campi' }, campo('Disdetto il', data), campo('Motivo', motivo, errore))]);
      disegna();
      let chiudi;
      const vai = async () => {
        if (!motivo.value.trim()) { errore = 'Scrivi il motivo'; disegna(); return; }
        const r = await lavora('Disdico', () => Rete.post('/server/disdiciContratto', { id: k.id, data: data.value, motivo: motivo.value.trim() }));
        if (!r) return;
        chiudi();
        aggiornaContratto(r.contratto, 'Disdetto: finisce il ' + C.data(r.contratto.al));
      };
      chiudi = finestra({ titolo: 'Disdici ' + k.numero, corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn grande pericolo', onclick: vai }, 'Disdici')] });
    }

    async function chiudiContratto(k) {
      const r = await W.scriviConConferma('Chiudo il contratto', '/server/chiudiContratto', { id: k.id }, d => conferma('Chiudere il contratto adesso?', d.errore, 'Chiudi il contratto', true));
      if (r) aggiornaContratto(r.contratto, 'Contratto chiuso');
    }

    async function pdfContratto(k) {
      if (S.esempio) { avviso('Nella visita il PDF non si crea'); return; }
      const testo = await Rete.post('/server/componiModello', { chiave: 'CONTRATTO_CONDIZIONI', idContratto: k.id }).catch(() => null);
      const html = W.D.contrattoAssistenza(Object.assign({}, k, { condizioni: testo ? testo.testo : '' }), S.ana.impostazioni);
      const r = await lavora('Preparo il PDF', () => Rete.post('/locale/pdf', { html, nome: W.nomeFile('Contratto ' + k.numero, k.cliente), apri: true }));
      if (r) avviso('PDF salvato in ' + r.percorso);
    }

    /** Nuovo contratto (finestra larga, i campi del telefono in due colonne): si salva in bozza. */
    function moduloContratto(k0) {
      const k = k0 || {};
      const oggi = C.oggiIso();
      const piu12 = d => { const [a, m, g] = d.split('-').map(Number); const x = new Date(a + 1, m - 1, g); x.setDate(x.getDate() - 1); return R.isoGiorno(x); };
      const x = {
        idCliente: k.idCliente || '', rinnovo: k.rinnovo || 'tacito', fatturazione: k.fatturazioneCanone || 'annuale', copre: k.copre || 'visite', materiali: !!k.materialiInclusi,
        impianti: (k.impianti || []).map(i => ({ idSede: i.idSede, ogniMesi: i.ogniMesi || '', primaVisita: i.primaVisita || '' })),
        presa: k.tempi && k.tempi.urgente && k.tempi.urgente.presa !== undefined ? k.tempi.urgente.presa : (tempiStudio().urgente || {}).presa || 1,
        intervento: k.tempi && k.tempi.urgente && k.tempi.urgente.intervento !== undefined ? k.tempi.urgente.intervento : (tempiStudio().urgente || {}).intervento || 4,
        tempiToccati: !!(k.tempi && k.tempi.urgente),
      };
      const bozza = !k0 || k.stato === 'bozza';
      const v = {
        titolo: h('input', { type: 'text', value: k.titolo || '' }),
        dal: h('input', { type: 'date', value: k.dal || oggi, disabled: !bozza }),
        al: h('input', { type: 'date', value: k.al || piu12(k.dal || oggi), disabled: !bozza }),
        disdetta: h('input', { type: 'text', inputmode: 'numeric', value: String(k.disdettaGiorni !== undefined ? k.disdettaGiorni : 60) }),
        canone: h('input', { type: 'text', inputmode: 'decimal', value: k.canone !== undefined && k.canone !== null ? R.numeroCampo(k.canone) : '', disabled: !bozza }),
        tariffa: h('input', { type: 'text', inputmode: 'decimal', value: k.tariffaExtra !== undefined && k.tariffaExtra !== null ? R.numeroCampo(k.tariffaExtra) : '' }),
        note: h('textarea', { rows: 2 }),
      };
      v.note.value = k.note || '';
      v.dal.addEventListener('change', () => { if (v.dal.value) v.al.value = piu12(v.dal.value); });
      let errori = {};
      const sinistra = h('div', { class: 'colonna-f' });
      const destra = h('div', { class: 'colonna-f' });
      const pills = (voci, scelta, fn) => h('div', { class: 'pillole' }, voci.map(([kk, nome]) => h('button', { type: 'button', class: 'pillola' + (scelta === kk ? ' scelta' : ''), onclick: () => fn(kk) }, nome)));
      const stepperOre = (nome, chiave) => h('div', { class: 'riga-stepper' }, h('span', { class: 'nome' }, h('b', null, nome)),
        h('span', { class: 'stepper' }, tondo('meno', 'Meno', () => { x[chiave] = Math.max(0.5, x[chiave] - (x[chiave] > 2 ? 1 : 0.5)); x.tempiToccati = true; disegna(); }),
          h('span', { class: 'valore' }, T.numeroIt(x[chiave]) + ' h'), tondo('piu', 'Più', () => { x[chiave] = x[chiave] + (x[chiave] >= 2 ? 1 : 0.5); x.tempiToccati = true; disegna(); })));
      const disegna = () => {
        svuota(sinistra); svuota(destra);
        const cli = x.idCliente ? W.cliente(x.idCliente) : null;
        const impianti = S.ana.sedi.filter(s => s.idSoggetto === x.idCliente && !s.archiviata);
        aggiungi(sinistra, [
          h('div', { class: 'campo' + (errori.cliente ? ' sbagliato' : '') }, h('label', null, 'Cliente'), cli
            ? h('div', { class: 'scelta-card scelta' }, iniziali(cli.nome, true), h('span', { class: 'testi' }, h('b', null, cli.nome), h('span', null, cli.citta || '')),
              bozza ? h('button', { type: 'button', class: 'btn collegamento', onclick: () => { x.idCliente = ''; x.impianti = []; disegna(); } }, 'Cambia') : null)
            : sceltaClienteSemplice(c => { x.idCliente = c.id; x.impianti = []; delete errori.cliente; disegna(); }),
          errori.cliente ? h('div', { class: 'errore' }, errori.cliente) : null),
          campo('Titolo', v.titolo, errori.titolo),
          x.idCliente ? h('div', { class: 'campo' }, h('label', null, 'Impianti coperti'), impianti.length ? h('div', { class: 'fila' }, impianti.map(s => {
            const i = x.impianti.find(y => String(y.idSede) === String(s.id));
            return h('div', { class: 'impianto-contratto' + (i ? ' scelto' : '') },
              h('button', { type: 'button', class: 'pillola' + (i ? ' scelta' : ''), onclick: () => { if (i) x.impianti = x.impianti.filter(y => y !== i); else x.impianti.push({ idSede: s.id, ogniMesi: 6, primaVisita: '' }); disegna(); } }, s.nome),
              i ? selezione([['', 'Nessuna visita'], ['3', 'ogni 3 mesi'], ['6', 'ogni 6 mesi'], ['12', 'ogni anno']], String(i.ogniMesi || ''), y => { i.ogniMesi = y ? Number(y) : ''; }) : null,
              i ? h('input', { type: 'date', class: 'campo-solo', value: i.primaVisita || '', 'aria-label': 'Prima visita', title: 'Prima visita', onchange: e => { i.primaVisita = e.target.value; } }) : null);
          })) : h('p', { class: 'piccolo' }, 'Il cliente non ha impianti: si aggiungono nella sua scheda.')) : null,
          h('div', { class: 'riga-campi' }, campo('Dal', v.dal, errori.dal), campo('Al', v.al, errori.al)),
          h('div', { class: 'campo' }, h('label', null, 'Rinnovo'), pills([['tacito', 'Tacito'], ['no', 'No']], x.rinnovo, y => { x.rinnovo = y; disegna(); })),
          x.rinnovo === 'tacito' ? campo('Preavviso di disdetta', B.conSuffisso(v.disdetta, 'giorni')) : null]);
        aggiungi(destra, [
          h('div', { class: 'riga-campi' }, campo('Canone all\'anno', B.conSuffisso(v.canone, '€'), errori.canone), campo('Tariffa fuori contratto', B.conSuffisso(v.tariffa, '€/h'))),
          h('div', { class: 'campo' }, h('label', null, 'Rate del canone'), pills(T.RATE, x.fatturazione, y => { if (bozza) { x.fatturazione = y; disegna(); } })),
          h('div', { class: 'campo' }, h('label', null, 'Copre'), pills([['visite', 'Solo visite'], ['visite_guasti', 'Visite e guasti']], x.copre, y => { x.copre = y; disegna(); })),
          h('div', { class: 'campo' }, h('label', null, 'Materiali compresi'), pills([['no', 'No'], ['si', 'Sì']], x.materiali ? 'si' : 'no', y => { x.materiali = y === 'si'; disegna(); })),
          h('div', { class: 'campo' }, h('label', null, 'Tempi promessi per gli urgenti'), stepperOre('Presa in carico entro', 'presa'), stepperOre('Intervento entro', 'intervento')),
          campo('Note', v.note)]);
      };
      disegna();
      let chiudi;
      const salva = async () => {
        errori = {};
        if (!x.idCliente) errori.cliente = 'Cliente: scegli il cliente';
        if (!v.titolo.value.trim()) errori.titolo = 'Titolo: scrivi di che contratto si tratta';
        if (!v.dal.value) errori.dal = 'Dal: scrivi da quando vale';
        if (v.al.value && v.dal.value && v.al.value <= v.dal.value) errori.al = 'Al: deve venire dopo Dal';
        const canone = C.numONull(v.canone.value);
        if (v.canone.value.trim() && (canone === null || canone < 0)) errori.canone = 'Canone: non può essere negativo';
        if (Object.keys(errori).length) { disegna(); return; }
        const c = { idCliente: x.idCliente, titolo: v.titolo.value.trim(), rinnovo: x.rinnovo, disdettaGiorni: Number(v.disdetta.value) || 0, copre: x.copre, materialiInclusi: x.materiali,
          tariffaExtra: C.numONull(v.tariffa.value), note: v.note.value.trim(),
          impianti: x.impianti.map(i => ({ idSede: i.idSede, ogniMesi: i.ogniMesi || null, primaVisita: i.primaVisita || null })) };
        if (bozza) Object.assign(c, { dal: v.dal.value, al: v.al.value, canone: canone || 0, fatturazioneCanone: x.fatturazione });
        if (x.tempiToccati) c.tempi = { urgente: { presa: x.presa, intervento: x.intervento } };
        if (k0) c.id = k0.id;
        const r = await lavora('Salvo il contratto', () => Rete.post('/server/salvaContratto', { contratto: c }));
        if (!r) return;
        chiudi();
        M.contratti = null;
        avviso(k0 ? 'Contratto salvato' : 'Bozza ' + r.contratto.numero + ' salvata: si attiva dal pannello');
        if (W.percorso().indexOf('ticket/contratt') === 0) { M.contrattoAperto = r.contratto.id; W.ridisegna(); apriContratto(r.contratto.id); } else W.vai('#ticket/contratto/' + r.contratto.id);
      };
      chiudi = finestra({ titolo: k0 ? 'Cambia ' + k0.numero : 'Nuovo contratto', larghezza: 'larga', fuoco: false, corpo: h('div', { class: 'due-colonne-f' }, sinistra, destra),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, k0 ? 'Salva' : 'Salva la bozza')] });
    }

    function sceltaClienteSemplice(fatto) {
      const input = h('input', { type: 'search', placeholder: 'Scrivi il nome', 'aria-label': 'Cerca il cliente' });
      const elenco = h('div', { class: 'fila' });
      const disegna = () => {
        const t = C.normalizza(input.value);
        aggiungi(svuota(elenco), W.clientiAttivi().filter(c => !t || C.normalizza(c.nome).indexOf(t) >= 0).sort((a, b) => a.nome.localeCompare(b.nome, 'it')).slice(0, 5)
          .map(c => h('button', { type: 'button', class: 'scelta-card', onclick: () => fatto(c) }, iniziali(c.nome, true), h('span', { class: 'testi' }, h('b', null, c.nome), h('span', null, c.citta || '')))));
      };
      input.addEventListener('input', disegna);
      disegna();
      return h('div', { class: 'fila' }, h('label', { class: 'cerca' }, icona('cerca', 18), input), elenco);
    }

    // ===================================================================== statistiche

    function periodoStat() {
      const oggi = C.oggiIso();
      const anno = Number(oggi.slice(0, 4));
      if (M.statPeriodo === 'anno') return { da: anno + '-01-01', a: anno + '-12-31' };
      if (M.statPeriodo === 'scorso') return { da: (anno - 1) + '-01-01', a: (anno - 1) + '-12-31' };
      return {};
    }

    function paginaStatistiche(pagina) {
      aggiungi(pagina, [testata('Statistiche'), segmentiTk('statistiche'),
        h('div', { class: 'filtri' }, segmenti([['12', 'Ultimi 12 mesi'], ['anno', 'Quest\'anno'], ['scorso', 'L\'anno scorso']], M.statPeriodo, y => { M.statPeriodo = y; M.stat = null; M.statMesi = null; W.disegnaPagina(); }),
          h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn', onclick: () => W.esporta('ticket', Object.assign({ segmento: 'tutti' }, periodoStat())) }, icona('scarica', 18, 2.2), 'Esporta'))]);
      conDati(pagina, async () => {
        const p = periodoStat();
        const [a, b] = await Promise.all([
          !M.stat || M.stat.per !== M.statPer ? Rete.get('/server/statisticheTicket?' + qs(Object.assign({ per: M.statPer }, p))) : Promise.resolve(M.stat),
          M.statMesi ? Promise.resolve(M.statMesi) : Rete.get('/server/statisticheTicket?' + qs(Object.assign({ per: 'mese' }, p))),
        ]);
        M.stat = a; M.statMesi = b;
      }, () => {
        const s = M.stat;
        const t = s.totale || {};
        const box = (quanto, che) => h('div', { class: 'num-box' }, h('b', null, quanto), h('span', null, che));
        const oreTesto = n => n === null || n === undefined ? '—' : T.numeroIt(n) + ' h';
        aggiungi(pagina, [h('div', { class: 'quattro-num' }, box(String(t.aperti || 0), 'aperti'), box(String(t.chiusi || 0), 'chiusi'),
          box(oreTesto(t.interventoMedioOre), 'intervento medio'), box(t.entroITempi === null || t.entroITempi === undefined ? '—' : t.entroITempi + '%', 'entro i tempi'))]);
        // Barre per mese: aperti e chiusi.
        const mesi = (M.statMesi && M.statMesi.righe) || [];
        const max = Math.max(1, ...mesi.map(r => Math.max(r.aperti || 0, r.chiusi || 0)));
        aggiungi(pagina, [h('div', { class: 'scheda grafico-mesi' }, h('div', { class: 'testa-grafico' }, h('span', { class: 'etichetta' }, 'Aperti e chiusi per mese'),
          h('span', { class: 'legenda' }, h('i', { class: 'col-fatturato' }), 'aperti ', h('i', { class: 'col-incassato' }), 'chiusi')),
          mesi.length ? h('div', { class: 'barre-mesi' }, mesi.map(r => h('div', { class: 'mese-barre', title: r.nome + ': ' + r.aperti + ' aperti, ' + r.chiusi + ' chiusi' },
            h('span', { class: 'coppia-barre' }, h('i', { class: 'col-fatturato', style: { height: Math.round((r.aperti || 0) / max * 150) + 'px' } }), h('i', { class: 'col-incassato', style: { height: Math.round((r.chiusi || 0) / max * 150) + 'px' } })),
            h('span', { class: 'nome-mese' }, String(r.nome || '').slice(0, 3))))) : h('p', { class: 'vuoto' }, 'Nessun ticket nel periodo.'))]);
        aggiungi(pagina, [segmenti([['tipo', 'Per tipo'], ['cliente', 'Per cliente'], ['impianto', 'Per impianto'], ['persona', 'Per persona']], M.statPer, y => { M.statPer = y; M.stat = null; W.disegnaPagina(); })]);
        const righe = s.righe || [];
        const conSoldi = soldi() && t.costo !== undefined;
        const col = 'minmax(0, 1.8fr) 52px 52px 56px 72px 78px 70px 64px 50px 50px' + (conSoldi ? ' 92px 92px' : '');
        const tab = h('div', { class: 'tab tab-stat' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } },
          h('span', null, { tipo: 'Tipo', cliente: 'Cliente', impianto: 'Impianto', persona: 'Persona' }[M.statPer]), h('span', { class: 'n' }, 'Aperti'), h('span', { class: 'n' }, 'Chiusi'), h('span', { class: 'n' }, 'In corso'),
          h('span', { class: 'n' }, 'Presa media'), h('span', { class: 'n' }, 'Intervento'), h('span', { class: 'n' }, 'Chiusura'), h('span', { class: 'n' }, 'Nei tempi'), h('span', { class: 'n' }, 'Ore'), h('span', { class: 'n' }, 'Km'),
          conSoldi ? h('span', { class: 'n' }, 'Costo') : null, conSoldi ? h('span', { class: 'n' }, 'Fatturato') : null));
        const maxN = Math.max(1, ...righe.map(r => r.aperti || 0));
        righe.forEach(r => aggiungi(tab, [h('div', { class: 'r', style: { gridTemplateColumns: col } },
          h('span', { class: 'doppia' }, h('span', null, r.nome || (M.statPer === 'persona' ? 'Nessuno' : 'Nessun impianto')), h('span', { class: 'barra sottile' }, h('i', { style: { width: Math.round((r.aperti || 0) / maxN * 100) + '%' } }))),
          h('span', { class: 'n forte' }, String(r.aperti || 0)), h('span', { class: 'n' }, String(r.chiusi || 0)), h('span', { class: 'n' }, String(r.inCorso || 0)),
          h('span', { class: 'n t2' }, oreTesto(r.presaMediaOre)), h('span', { class: 'n t2' }, oreTesto(r.interventoMedioOre)),
          h('span', { class: 'n t2' }, r.chiusuraMediaGiorni === null || r.chiusuraMediaGiorni === undefined ? '—' : T.numeroIt(r.chiusuraMediaGiorni) + ' gg'),
          h('span', { class: 'n t2' }, r.entroITempi === null || r.entroITempi === undefined ? '—' : r.entroITempi + '%'),
          h('span', { class: 'n t2' }, T.numeroIt(r.ore || 0)), h('span', { class: 'n t2' }, T.numeroIt(r.km || 0)),
          conSoldi ? h('span', { class: 'n' }, C.euro(r.costo || 0)) : null, conSoldi ? h('span', { class: 'n forte' }, C.euro(r.fatturato || 0)) : null)]));
        aggiungi(tab, [h('div', { class: 'r piede', style: { gridTemplateColumns: col } }, h('span', null, 'Totale'), h('span', { class: 'n' }, String(t.aperti || 0)), h('span', { class: 'n' }, String(t.chiusi || 0)),
          h('span', { class: 'n' }, String(t.inCorso || 0)), h('span', { class: 'n' }, oreTesto(t.presaMediaOre)), h('span', { class: 'n' }, oreTesto(t.interventoMedioOre)),
          h('span', { class: 'n' }, t.chiusuraMediaGiorni === null || t.chiusuraMediaGiorni === undefined ? '—' : T.numeroIt(t.chiusuraMediaGiorni) + ' gg'),
          h('span', { class: 'n' }, t.entroITempi === null || t.entroITempi === undefined ? '—' : t.entroITempi + '%'), h('span', { class: 'n' }, T.numeroIt(t.ore || 0)), h('span', { class: 'n' }, T.numeroIt(t.km || 0)),
          conSoldi ? h('span', { class: 'n' }, C.euro(t.costo || 0)) : null, conSoldi ? h('span', { class: 'n' }, C.euro(t.fatturato || 0)) : null)]);
        aggiungi(pagina, [righe.length ? tab : h('div', { class: 'calmo' }, icona('grafico', 20, 2.2), 'Nessun ticket nel periodo')]);
        if (collaboratore()) aggiungi(pagina, [h('p', { class: 'secondario' }, 'Qui ci sono i ticket di cui sei responsabile.')]);
      });
    }

    // ===================================================================== storico dell'impianto

    function paginaImpianto(pagina, idSede) {
      const giallo = scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: () => { const s = S.ana.sedi.find(x => String(x.id) === String(idSede)); nuovoTicket({ idCliente: s ? s.idSoggetto : '', idSede }); } },
        icona('piu', 18, 2.6), 'Nuovo ticket per questo impianto') : null;
      aggiungi(pagina, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Indietro', () => history.length > 1 ? history.back() : W.vai('#ticket')), h('span', { class: 'dove' }, 'Storico dell\'impianto'), h('span', { class: 'spazio' }), giallo)]);
      let pag = 1;
      let voci = [];
      conDati(pagina, async () => { const r = await Rete.get('/server/storicoImpianto?' + qs({ idSede, pagina: 1 })); M.storico = r; voci = r.voci || []; }, () => {
        const r = M.storico;
        const i = r.impianto || {};
        const sede = S.ana.sedi.find(x => String(x.id) === String(i.id));
        const coppia = (k, v) => h('div', { class: 'coppia' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v || '—'));
        aggiungi(pagina, [h('div', { class: 'testata in-alto' }, h('div', { class: 'titoli' },
          h('div', { class: 'pillole-testa' }, i.categoriaNome ? pill(i.categoriaNome, 'blu') : pill(i.tipo === 'impianto' ? 'Impianto' : 'Sede', 'grigio')),
          h('h1', { class: 'titolo-scheda' }, i.nome), h('span', { class: 'sotto-titolo' }, [i.cliente, i.indirizzo].filter(Boolean).join(' · '))))]);
        const sx = h('div', { class: 'sezione' },
          h('div', { class: 'scheda coppie' }, coppia('Potenza', i.potenza), coppia('Tensione', i.tensione), coppia('Messa in servizio', i.messaInServizio ? C.data(i.messaInServizio) : ''),
            coppia('Matricola', i.matricola), coppia('Ambiente', i.ambienteNome || T.nomeDi(T.AMBIENTI, i.ambiente)), coppia('Referente sul posto', i.referente), coppia('Note', i.datiTecnici),
            puo('clienti', 2) && sede && W.Clienti ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => W.Clienti.moduloSede(W.cliente(sede.idSoggetto), sede, async () => { M.storico = null; W.disegnaPagina(); }) }, 'Cambia')) : null),
          (r.aperti || []).length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Aperti · ' + r.aperti.length), h('div', { class: 'scheda righe' }, r.aperti.map(t => riga({
            sinistra: pill(T.nomeDi(T.PRIORITA, t.priorita), T.colorePriorita(t.priorita)), titolo: t.id + ' · ' + t.titolo, destra: pill(t.statoVisto, T.coloreStatoTicket(t.stato)),
            onclick: () => W.vai('#ticket/tk/' + t.idTicket) })))) : null,
          (r.scadenze || []).length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Scadenze'), h('div', { class: 'scheda righe' }, r.scadenze.map(x => riga({
            sinistra: quadrato('bandiera', T.coloreScadenza(x.statoVisto) === 'rosso' ? 'ico-rosso' : 'ico-giallo'), titolo: x.titolo, sotto: C.data(x.data),
            destra: pill(x.statoVisto === 'Scaduta' && x.giorni ? 'Scaduta da ' + x.giorni + ' giorni' : x.statoVisto, T.coloreScadenza(x.statoVisto)),
            onclick: W.Archivio ? () => W.Archivio.apriScadenza(x.id) : null })))) : null,
          (r.contratti || []).length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Contratto'), h('div', { class: 'scheda righe' }, r.contratti.map(c => riga({
            sinistra: h('span', { class: 'codice' }, c.numero), titolo: c.titolo, destra: pill(c.statoVisto, T.coloreContratto(c.statoVisto)), onclick: () => W.vai('#ticket/contratto/' + c.id) })))) : null);
        const dx = h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Storico'));
        const tempo = h('div', { class: 'scheda righe storico-tempo' });
        const disegnaTempo = () => {
          svuota(tempo);
          if (!voci.length) { aggiungi(tempo, [h('p', { class: 'vuoto sinistra' }, 'Ancora niente.')]); return; }
          T.perAnno(voci).forEach(g => aggiungi(tempo, [h('div', { class: 'anno-storico' }, g.anno)].concat(g.voci.map(rigaStorico))));
          if (pag < (r.pagine || 1)) aggiungi(tempo, [h('div', { class: 'riga' }, h('button', { type: 'button', class: 'btn', onclick: async () => {
            const x = await lavora('Leggo lo storico', () => Rete.get('/server/storicoImpianto?' + qs({ idSede, pagina: pag + 1 })));
            if (x) { pag += 1; voci = voci.concat(x.voci || []); disegnaTempo(); }
          } }, 'Altre voci'))]);
        };
        disegnaTempo();
        aggiungi(dx, [tempo]);
        aggiungi(pagina, [h('div', { class: 'griglia-impianto' }, sx, dx)]);
      });
    }

    /** Quanti ticket ha un cliente (per "Ticket · N" nella sua scheda) e l'elenco. */
    function schedaTicketCliente(area, idCliente) {
      const zona = h('div', { class: 'sezione' }, segnaposto(2, 58));
      aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }), scrive() ? h('button', { type: 'button', class: 'btn', onclick: () => nuovoTicket({ idCliente }) }, icona('piu', 18, 2.6), 'Nuovo ticket') : null), zona]);
      Rete.get('/server/tickets?' + qs({ segmento: 'tutti', idCliente })).then(r => {
        svuota(zona);
        const lista = r.ticket || [];
        if (!lista.length) { aggiungi(zona, [h('p', { class: 'vuoto sinistra' }, 'Nessun ticket.')]); return; }
        aggiungi(zona, [h('div', { class: 'scheda righe' }, lista.map(t => riga({
          sinistra: pillPriorita(t), titolo: t.numero + ' · ' + t.titolo, sotto: [t.impianto, apertoBreve(t.apertoIl), t.responsabile].filter(Boolean).join(' · '),
          destra: pillStato(t), onclick: () => W.vai('#ticket/tk/' + t.id) })))]);
      }).catch(e => { if (e.accesso !== false) aggiungi(svuota(zona), [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message))]); });
    }
    const conteTicket = {};
    function quantiTicket(idCliente) {
      if (conteTicket[idCliente]) return conteTicket[idCliente];
      conteTicket[idCliente] = Rete.get('/server/tickets?' + qs({ segmento: 'tutti', idCliente })).then(r => (r.ticket || []).length).catch(() => null);
      setTimeout(() => { delete conteTicket[idCliente]; }, 30000);
      return conteTicket[idCliente];
    }

    return { vista, M, daRileggere, apriPannello, chiudiPannello, chiudiContrattoPannello, nuovoTicket, lavoroFinito, schedaTicketCliente, quantiTicket, pianifica };
  };
})(window);
