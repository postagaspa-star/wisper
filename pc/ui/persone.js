/*
 * Wisper Ufficio, fase 6: Persone e risorse umane (docs/gestionale/fase6.md §12.2, risposte in architettura.md §17.3-17.9).
 *
 * Segmenti Organico · Ferie e permessi · Presenze · Scadenze · Costi (Costi solo col permesso dei soldi, Scadenze
 * solo con persone 2); il collaboratore Io · Ferie e permessi · Organico. Un clic su una persona apre il pannello
 * (440) con la scheda; la propria scheda è la pagina "Io".
 *
 * I dati della persona hanno tre livelli (di lavoro, personali, riservati) e li decide il server: qui si mostra SOLO
 * quello che arriva. Una chiave che non c'è non diventa un'etichetta vuota, una sezione che non arriva non ha
 * nemmeno il titolo, il tipo di un'assenza che non si vede è "Assente". Niente si tiene in memoria fuori dalla
 * pagina aperta: cambiando voce del menu le schede lette si buttano.
 *
 * In fondo, gli aiuti comuni alle tre pagine della fase 6 (pannello, sezioni, firma): mezzi.js e collaboratori.js li
 * prendono da qui (W.F6).
 */
(function (radice) {
  'use strict';

  radice.WisperPersone = function (W) {
    const { S, C, R, B, Rete } = W;
    const P = radice.WisperRegolePersone;
    const T = radice.WisperRegoleTicket;
    const { h, aggiungi, svuota, icona, tondo, iniziali, pillola, avviso, lavora, finestra, conferma, apriMenu, campo, conSuffisso, selezione, segmenti, riga, quadrato, segnaposto } = B;
    const puo = W.puo;
    const soldi = W.soldi;
    const scrive = () => puo('persone', 2);
    const interfaccia = () => (S.io && S.io.interfaccia) || {};
    const idPersonaIo = () => interfaccia().idPersona || null;
    const ruoloIo = () => (S.io && S.io.utente && S.io.utente.ruolo) || '';
    const titolare = () => ruoloIo() === 'titolare';
    const puoApprovare = () => interfaccia().puoApprovareAssenze === true;
    const vedeRiservati = () => interfaccia().vedeRiservati === true;
    const oggi = () => C.oggiIso();
    const dataIt = iso => (iso ? C.data(iso) : '');
    const pill = (parola, colore) => pillola(parola, colore || P.colore(parola));

    // Quello che si legge solo qui, finché si resta in Persone (daRileggere lo butta cambiando voce).
    const M = { segmento: '', persone: null, uscite: null, apriUscite: false, aperta: null, scheda: null, mese: '', assenze: null, chiusure: null,
      presenze: null, scadenze: null, tipi: null, categorie: null, io: null, accessi: null };
    function daRileggere() { Object.assign(M, { persone: null, uscite: null, scheda: null, assenze: null, chiusure: null, presenze: null, scadenze: null, io: null, accessi: null, aperta: null }); }

    // ===================================================================== aiuti comuni della fase 6

    /** Una sezione con il titolo (e, a destra, un'azione piccola). */
    function sez(titolo, contenuto, destra) {
      return h('div', { class: 'sez-f6' }, h('div', { class: 'testa-sez' }, h('h3', null, titolo), destra || null), contenuto);
    }
    /** Coppie chiave-valore: solo quelle col valore (null = la chiave non c'è, la coppia non si disegna). */
    function coppie(lista) {
      const c = (lista || []).filter(x => x && x[1] !== null && x[1] !== undefined).map(([k, v]) => h('div', { class: 'coppia' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v === '' ? '—' : v)));
      return c.length ? h('div', { class: 'scheda coppie' }, c) : null;
    }
    /** Il valore di un campo solo se il server l'ha mandato: altrimenti null (la coppia non c'è). */
    const se = (o, k, fmt) => (o && Object.prototype.hasOwnProperty.call(o, k) ? (fmt ? fmt(o[k]) : (o[k] === null || o[k] === undefined ? '' : String(o[k]))) : null);
    const righe = (lista, vuoto) => (lista.filter(Boolean).length ? h('div', { class: 'scheda righe' }, lista) : (vuoto ? h('p', { class: 'vuoto sinistra' }, vuoto) : null));
    const piccolo = (testo, fn, ico) => h('button', { type: 'button', class: 'btn piccolo', onclick: fn }, ico ? icona(ico, 16, 2.4) : null, testo);
    const nonCollegato = () => h('span', { class: 'pill non-collegato' }, icona('scollegato', 14, 2.2), P.NON_COLLEGATO);

    let pannelloAperto = null;
    /**
     * Il pannello di destra (440): in alto dove si è, il menu ⋯ e la ×; sotto la scheda; in fondo, se c'è, UN pulsante
     * giallo. Con il pannello aperto il giallo della pagina diventa col bordo (fase6.md §12).
     */
    function pannello(o) {
      const vecchio = document.querySelector('.pannello-f6');
      const altro = o.menu && o.menu.length ? h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18)) : null;
      if (altro) altro.addEventListener('click', () => apriMenu(altro, o.menu));
      const p = h('aside', { class: 'pannello pannello-f6', 'aria-label': o.titolo || o.dove || '' },
        h('div', { class: 'corpo' }, h('div', { class: 'alto' }, h('span', { class: 'dove spazio' }, o.dove || ''), altro, tondo('chiudi', 'Chiudi', () => chiudiPannello(), 'piccolo')), o.corpo),
        o.giallo || (o.piede && o.piede.length) ? h('div', { class: 'piede' }, o.piede || null, o.giallo || null) : null);
      if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi(document.getElementById('sovrapposti'), [p]);
      pannelloAperto = o.chiave || true;
      spegniGialloPagina(true);
      return p;
    }
    function chiudiPannello(subito) {
      const p = document.querySelector('.pannello-f6');
      pannelloAperto = null;
      M.aperta = null;
      document.querySelectorAll('.tab .r.scelta').forEach(x => x.classList.remove('scelta'));
      spegniGialloPagina(false);
      if (!p) return;
      if (subito) { p.remove(); return; }
      p.classList.add('via');
      setTimeout(() => p.remove(), 200);
    }
    /** Il giallo della pagina: col pannello aperto diventa col bordo, chiuso torna giallo. */
    function spegniGialloPagina(spento) {
      document.querySelectorAll('[data-giallo-pagina]').forEach(b => b.classList.toggle('giallo', !spento));
    }
    function gialloPagina(testo, fn, ico) {
      return h('button', { type: 'button', class: 'btn' + (pannelloAperto ? '' : ' giallo'), 'data-giallo-pagina': '1', onclick: fn }, ico ? icona(ico, 18, 2.6) : null, testo);
    }
    const gialloPannello = (testo, fn) => h('button', { type: 'button', class: 'btn grande giallo', onclick: fn }, testo);

    /** Legge e poi disegna, coi segnaposto e la banda calma se il server non risponde. */
    function conDati(contenitore, prepara, disegna) {
      const zona = h('div', { class: 'sezione' }, segnaposto(4, 64));
      aggiungi(contenitore, [zona]);
      prepara().then(() => { zona.remove(); disegna(); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.disegnaPagina() }, 'Riprova'))]);
      });
    }

    /** I riquadri in cima alla pagina: [numero, parola, fn, rosso]. */
    function riquadri(lista) {
      return h('div', { class: 'quattro-num' }, lista.filter(Boolean).map(([n, che, fn, rosso]) => h('button', { type: 'button', class: 'num-box' + (rosso && n > 0 ? ' rosso' : ''), disabled: !fn, onclick: fn || null },
        h('b', null, String(n || 0)), h('span', null, che))));
    }

    /** La testata delle pagine della fase 6: dove, titolo, il giallo. */
    function testata(dove, titolo, giallo) {
      return h('div', { class: 'testata alta' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, dove), h('h1', null, titolo)), giallo || null);
    }

    /** Il riquadro per firmare col mouse, su fondo bianco anche col tema scuro (chi riceve firma come su un foglio). */
    function tavolettaFirma(frase) {
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
      const el = h('div', { class: 'firma-tavoletta foglio-bianco' }, h('div', { class: 'chi-firma' }, frase), tela, h('div', { class: 'sotto-firma' }, h('span'), cancella));
      return { el, vuota: () => tratti === 0, base64: () => tela.toDataURL('image/png').split(',')[1] };
    }

    /** Una scrittura che il server ferma per chiedere conferma: la domanda (con la sua frase) e, se sì, di nuovo con conferma. */
    function scriviConferma(testo, percorso, corpo, titolo, siTesto) {
      return W.scriviConConferma(testo, percorso, corpo, d => conferma(titolo || 'Confermi?', d.errore || d.frase || '', siTesto || 'Conferma'));
    }

    /** Una riga di scadenza della fase 5 (stesso giro: Segna fatta, Rimanda, Togli dalla finestra della scadenza). */
    function tabellaScadenze(gruppi, colonnaChi) {
      const col = '64px minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1fr) 170px';
      const out = [];
      [['scadute', 'Scadute'], ['entro', 'Nel preavviso'], ['piuAvanti', 'Più avanti']].forEach(([k, nome]) => {
        const lista = gruppi[k] || [];
        if (!lista.length) return;
        const tab = h('div', { class: 'tab tab-scadenze' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } },
          h('span', null, 'Data'), h('span', null, 'Cosa'), h('span', null, colonnaChi), h('span', null, 'Tipo'), h('span', null, 'Stato')));
        lista.forEach(x => {
          const gg = T.giornoGrande(x.data);
          const colore = T.coloreScadenza(x.statoVisto);
          aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', onclick: () => W.Archivio.apriScadenza(x.id, x) },
            h('span', { class: 'giorno-scad gs-' + colore }, h('b', null, gg.g), h('span', null, gg.m)),
            h('span', { class: 'doppia' }, h('span', null, x.titolo), h('span', null, x.ogniMesi ? T.ogni(x.ogniMesi) : 'una volta')),
            h('span', { class: 't2 taglia' }, x.persona || x.mezzo || x.attrezzatura || x.cliente || '—'),
            h('span', { class: 't2 taglia' }, x.tipoNome || ''),
            h('span', null, pillola(x.statoVisto === 'Scaduta' ? 'Scaduta ' + (x.statoDettaglio || '') : x.statoVisto, colore)))]);
        });
        out.push(h('div', { class: 'sezione' }, h('span', { class: 'etichetta' + (k === 'scadute' ? ' rossa' : '') }, nome + ' · ' + lista.length), tab));
      });
      return out.length ? out : [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Nessuna scadenza aperta')];
    }

    /** Le categorie dei documenti (per i documenti delle persone e dei collaboratori): si leggono una volta. */
    async function categorie() {
      if (!M.categorie) { const r = await Rete.get('/server/categorieDocumenti'); M.categorie = r.categorie || []; }
      return M.categorie;
    }
    const idCategoria = (lista, nome) => { const c = (lista || []).find(x => x.nome === nome); return c ? c.id : null; };

    /** La password iniziale (si vede una volta sola) da copiare e dire a voce. */
    function scatolaPassword(password) {
      return h('div', { class: 'scatola-password' }, h('div', { class: 'etichetta' }, 'Password iniziale'),
        h('div', { class: 'riga-password' }, h('code', null, password),
          h('button', { type: 'button', class: 'btn', onclick: async () => { const ok = await B.copiaTesto(password); avviso(ok ? 'Password copiata' : 'Non sono riuscito a copiarla: scrivila a mano', !ok); } }, 'Copia')),
        h('div', { class: 'secondario' }, 'Comunicala a voce: la cambierà lui.'));
    }

    const F6 = { sez, coppie, se, righe, piccolo, nonCollegato, pannello, chiudiPannello, gialloPagina, gialloPannello, conDati, riquadri, testata, tavolettaFirma,
      scriviConferma, tabellaScadenze, categorie, idCategoria, scatolaPassword, pill, aperto: () => pannelloAperto };
    W.F6 = F6;

    // ===================================================================== la pagina

    function segmentiPersone() {
      if (ruoloIo() === 'collaboratore' && !scrive()) return [['io', 'Io'], ['ferie', 'Ferie e permessi'], ['organico', 'Organico']];
      return [['organico', 'Organico'], ['ferie', 'Ferie e permessi'], ['presenze', 'Presenze']]
        .concat(scrive() ? [['scadenze', 'Scadenze']] : [])
        .concat(soldi() ? [['costi', 'Costi']] : []);
    }

    function vista(pagina, a1, a2, filtro) {
      const voci = segmentiPersone();
      let seg = a1 && a1 !== 'p' && a1 !== 'accessi' ? a1 : '';
      if (filtro && filtro.segmento) seg = filtro.segmento;
      if (a1 === 'p') seg = idPersonaIo() && String(a2) === String(idPersonaIo()) && voci.some(v => v[0] === 'io') ? 'io' : 'organico';
      if (!seg) seg = M.segmento && voci.some(v => v[0] === M.segmento) ? M.segmento : voci[0][0];
      if (!voci.some(v => v[0] === seg)) seg = voci[0][0];
      M.segmento = seg;
      if (a1 === 'accessi') { paginaAccessi(pagina, a2); return; }
      const fn = { organico, ferie, presenze, scadenze, costi, io }[seg];
      fn(pagina, voci, filtro);
      if (a1 === 'p' && seg === 'organico' && a2) apriPersona(a2);
    }

    function barraSegmenti(voci, seg) {
      return h('div', null, segmenti(voci, seg, x => { M.segmento = x; chiudiPannello(true); W.vai(x === 'organico' ? '#persone/organico' : '#persone/' + x); }));
    }

    // ----------------------------------------------------------------- organico

    async function leggiPersone() {
      if (!M.persone) M.persone = await Rete.get('/server/persone');
    }

    function organico(pagina, voci) {
      const rubrica = !scrive() && !puo('costi') && ruoloIo() === 'collaboratore';
      aggiungi(pagina, [testata('Persone e risorse umane', 'Organico', scrive() ? gialloPagina('Aggiungi una persona', () => moduloPersona(null), 'piu') : null), barraSegmenti(voci, 'organico')]);
      conDati(pagina, leggiPersone, () => {
        const lista = M.persone.persone || [];
        const n = M.persone.conteggi || {};
        if (!rubrica) {
          aggiungi(pagina, [riquadri([[n.attive !== undefined ? n.attive : lista.length, (n.attive === 1 ? 'persona' : 'persone')],
            [n.assentiOggi || 0, 'assenti oggi', () => W.vai('#persone/ferie')],
            n.senzaAccesso !== undefined ? [n.senzaAccesso, 'senza accesso'] : null,
            n.daCompletare !== undefined ? [n.daCompletare, 'da completare'] : null])]);
        }
        const conCosto = lista.some(p => Object.prototype.hasOwnProperty.call(p, 'costoOrario'));
        const col = rubrica ? 'minmax(0, 1.4fr) minmax(0, 1fr) 150px minmax(0, 1fr) 150px' : 'minmax(0, 1.5fr) minmax(0, 1fr) 150px 140px 190px' + (conCosto ? ' 110px' : '');
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } },
          rubrica ? [h('span', null, 'Nome'), h('span', null, 'Ruolo nello studio'), h('span', null, 'Telefono'), h('span', null, 'Email'), h('span', null, 'Oggi')]
            : [h('span', null, 'Nome'), h('span', null, 'Ruolo nello studio'), h('span', null, 'Rapporto'), h('span', null, 'Accesso'), h('span', null, 'Oggi'), conCosto ? h('span', { class: 'n' }, 'Costo orario') : null]));
        lista.forEach(p => {
          const a = p.assenteOggi;
          const oggiPill = a ? pill(P.tipoVisto(a) + ' fino a ' + P.giornoLungo(a.al).split(' ')[0], 'grigio')
            : p.scadute ? pill(p.scadute === 1 ? '1 scaduta' : p.scadute + ' scadute', 'rosso') : h('span', { class: 't2' }, '—');
          aggiungi(tab, [h('div', { class: 'r cliccabile' + (String(M.aperta) === String(p.id) ? ' scelta' : ''), style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-persona': p.id,
            onclick: () => apriPersona(p.id), onkeydown: e => { if (e.key === 'Enter') apriPersona(p.id); } },
          h('span', { class: 'con-cerchio' }, iniziali(p.nome, true), h('b', { class: 'taglia' }, p.nome)),
          h('span', { class: 't2 taglia' }, p.ruoloStudio || '—'),
          rubrica ? [h('span', { class: 't2' }, p.telefonoLavoro || '—'), h('span', { class: 't2 taglia' }, p.emailLavoro || '—'), h('span', null, a ? pill('Assente', 'grigio') : h('span', { class: 't2' }, '—'))]
            : [h('span', null, p.rapporto ? p.rapportoNome : pill('Da completare', 'giallo')),
              h('span', null, p.idUtente ? (R.RUOLI[p.ruoloWisper] || { nome: p.ruoloWisper }).nome + (p.accessoAttivo === false ? ' · spento' : '') : pill('Senza accesso', 'grigio')),
              h('span', null, oggiPill),
              conCosto ? h('span', { class: 'n' }, p.costoOrario !== null && p.costoOrario !== undefined ? C.euro(p.costoOrario) : h('span', { class: 't2' }, 'dello studio')) : null])]);
        });
        aggiungi(pagina, [lista.length ? tab : h('p', { class: 'vuoto' }, 'Nessuna persona.')]);
        if (!rubrica) aggiungi(pagina, [uscite()]);
      });
    }

    /** "Uscite" chiuso: si apre e si leggono le persone uscite. */
    function uscite() {
      const zona = h('div');
      const d = h('details', { class: 'chiuso-f6' }, h('summary', null, h('span', null, 'Uscite'), icona('giu', 18, 2.4)), zona);
      if (M.apriUscite) d.open = true;
      const disegna = () => {
        const l = (M.uscite && M.uscite.persone) || [];
        aggiungi(svuota(zona), [l.length ? h('div', { class: 'righe-f6' }, l.map(p => riga({ sinistra: iniziali(p.nome, true), titolo: p.nome,
          sotto: [p.ruoloStudio, p.uscitaIl ? 'uscita il ' + dataIt(p.uscitaIl) : '', p.anonimizzata ? 'resa anonima' : ''].filter(Boolean).join(' · '), onclick: () => apriPersona(p.id) }))) : h('p', { class: 'vuoto sinistra' }, 'Nessuna persona uscita.')]);
      };
      d.addEventListener('toggle', async () => {
        M.apriUscite = d.open;
        if (!d.open) return;
        if (!M.uscite) { aggiungi(svuota(zona), [segnaposto(1, 56)]); try { M.uscite = await Rete.get('/server/persone?stato=uscite'); } catch (e) { M.uscite = { persone: [] }; } }
        disegna();
      });
      if (d.open && M.uscite) disegna();
      return d;
    }

    // ----------------------------------------------------------------- la scheda

    async function apriPersona(id) {
      M.aperta = id;
      document.querySelectorAll('.tab .r[data-persona]').forEach(x => x.classList.toggle('scelta', String(x.dataset.persona) === String(id)));
      pannello({ dove: 'Persona', corpo: segnaposto(4, 64), chiave: 'persona-' + id });
      try {
        const r = await Rete.get('/server/persona?id=' + encodeURIComponent(id));
        if (String(M.aperta) !== String(id)) return;
        M.scheda = r.persona;
        disegnaPannelloPersona();
      } catch (e) {
        if (e && e.accesso === false) return;
        pannello({ dove: 'Persona', corpo: h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message || String(e))) });
      }
    }

    async function rileggiScheda() {
      const id = M.scheda && M.scheda.id;
      M.persone = null;
      M.assenze = null;
      if (!id) { W.disegnaPagina(); return; }
      if (M.segmento === 'io') { M.io = null; W.disegnaPagina(); return; }
      W.disegnaPagina();
      await apriPersona(id);
    }

    function disegnaPannelloPersona() {
      const p = M.scheda;
      if (!p) return;
      const c = corpoPersona(p, false);
      pannello({ dove: 'Persona', titolo: p.nome, menu: c.menu, corpo: c.corpo, giallo: c.giallo ? gialloPannello(c.giallo.testo, c.giallo.fn) : null, chiave: 'persona-' + p.id });
    }

    /**
     * Il contenuto della scheda (pannello o pagina Io). Ogni sezione c'è solo se il server ne ha mandato i dati
     * (P.sezioniPersona): un collega aperto da un collaboratore ha solo il lavoro.
     */
    function corpoPersona(p, pagina) {
      const s = P.sezioniPersona(p);
      const mia = idPersonaIo() && String(p.id) === String(idPersonaIo());
      const a = p.assenteOggi;
      const out = [];
      out.push(h('div', { class: 'testa-persona' }, iniziali(p.nome, false, 'grande'),
        h('div', { class: 'titoli' }, h('h2', { class: 'titolo-scheda' }, p.nome), h('span', { class: 'sotto-titolo' }, [p.ruoloStudio, p.rapporto ? p.rapportoNome : ''].filter(Boolean).join(' · ') || 'Da completare'))));
      const pills = [a ? pill(P.tipoVisto(a) + ' fino a ' + P.giornoLungo(a.al), 'grigio') : null,
        Object.prototype.hasOwnProperty.call(p, 'idUtente') && !p.idUtente ? pill('Senza accesso', 'grigio') : null,
        !p.rapporto ? pill('Da completare', 'giallo') : null,
        p.uscitaIl ? pill((p.uscitaIl <= oggi() ? 'Uscita il ' : 'Esce il ') + dataIt(p.uscitaIl), 'grigio') : null,
        p.anonimizzata ? pill('Resa anonima', 'grigio') : null].filter(Boolean);
      if (pills.length) out.push(h('div', { class: 'pillole-testa' }, pills));
      if ((p.daCompletare || []).length) out.push(h('div', { class: 'mancano-f6' }, icona('avviso', 16, 2.4), h('span', null, p.daCompletare.join(' · '))));

      // Lavoro (tutti quelli che vedono la scheda).
      out.push(sez('Lavoro', coppie([['Mansione', se(p, 'mansione')], ['Entrata', se(p, 'entrataIl', dataIt)],
        ['Orario', Object.prototype.hasOwnProperty.call(p, 'oreSettimana') ? P.numIt(p.oreSettimana || p.oreGiorno * 5) + ' ore su ' + (p.giorniSettimana || [1, 2, 3, 4, 5]).length + ' giorni' : null],
        ['Telefono di lavoro', se(p, 'telefonoLavoro')], ['Email di lavoro', se(p, 'emailLavoro')]])));

      // Ferie e permessi (dati personali: chi ha persone 2 e la persona).
      if (s.ferie) {
        const rs = P.righeSaldo(p.saldi);
        const prossime = (p.assenze || []).filter(x => x.stato !== 'annullata' && x.stato !== 'respinta' && (x.al || x.dal) >= oggi());
        out.push(sez('Ferie e permessi', [
          rs ? h('div', { class: 'scheda saldo-box' }, rs.ferie ? h('div', null, h('b', null, rs.ferie.grande), h('span', null, rs.ferie.sotto)) : null,
            rs.permessi ? h('div', null, h('b', null, rs.permessi.grande), h('span', null, rs.permessi.sotto)) : null,
            h('span', { class: 't-saldo' }, rs.riga),
            scrive() && !p.anonimizzata ? h('div', { class: 't-saldo' }, piccolo('Aggiorna dal cedolino', () => moduloSaldo(p))) : null)
            : h('div', { class: 'scheda calmo-f6' }, h('span', null, 'Saldo non tenuto'), scrive() && !p.anonimizzata ? piccolo('Aggiorna dal cedolino', () => moduloSaldo(p)) : null),
          prossime.length ? righe(prossime.map(x => rigaAssenza(x, false))) : null]));
      }

      // Competenze e formazione (lavoro, ma non quelle dei colleghi per il collaboratore: arrivano vuote).
      if (s.competenze) {
        out.push(sez('Competenze e formazione', righe((p.qualifiche || []).filter(q => !q.tolta).map(q => riga({
          sinistra: quadrato(q.gruppo === 'elettrico' ? 'fulmine' : q.gruppo === 'emergenza' ? 'scudo' : 'libro', q.statoVisto === 'Scaduta' ? 'ico-rosso' : /^Scade/.test(q.statoVisto) ? 'ico-giallo' : 'ico-grigio'),
          titolo: q.nome, sotto: [q.titolo, q.data ? 'del ' + dataIt(q.data) : '', q.ente].filter(Boolean).join(' · '),
          destra: h('span', { class: 'pillole-destra' }, pill(q.statoVisto + (q.statoDettaglio ? ' ' + q.statoDettaglio : ''), P.colore(q.statoVisto))),
          onclick: scrive() && !p.anonimizzata ? () => moduloQualifica(p, q) : null,
        })), 'Nessuna competenza scritta.'), scrive() && !p.anonimizzata ? piccolo('Aggiungi', () => moduloQualifica(p, null), 'piu') : null));
      }

      // Visite mediche: con il giudizio solo se il server lo manda (riservati o la persona stessa).
      if (s.visite) {
        const visite = p.visite || [];
        out.push(sez('Visite mediche', h('div', { class: 'scheda fila-f6' },
          visite.length ? visite.map(v => Object.prototype.hasOwnProperty.call(v, 'giudizio') ? h('div', { class: 'visita-f6' },
            h('div', { class: 'riga-visita' }, h('b', null, P.nomeDi(P.TIPI_VISITA, v.tipo) + ' del ' + dataIt(v.data)), v.giudizioVisto ? pill(v.giudizioVisto, P.coloreGiudizio(v.giudizio)) : null),
            v.prescrizioni ? h('div', { class: 'riquadro-grigio' }, h('span', { class: 'lucchetto-r' }, icona('lucchetto', 14, 2.4), 'Prescrizioni: ' + v.prescrizioni)) : null,
            h('span', { class: 'sotto-titolo' }, [v.validoFino ? 'fino al ' + dataIt(v.validoFino) : '', v.prossima ? 'Prossima visita il ' + dataIt(v.prossima) : ''].filter(Boolean).join(' · ')),
            scrive() && !p.anonimizzata ? h('div', null, h('button', { type: 'button', class: 'btn collegamento', onclick: () => moduloVisita(p, v) }, 'Cambia')) : null)
            : h('div', { class: 'riga-visita' }, h('b', null, v.riga || ('Visita del ' + dataIt(v.data) + (v.prossima ? ' · prossima il ' + dataIt(v.prossima) : ''))),
              scrive() && !p.anonimizzata ? h('button', { type: 'button', class: 'btn collegamento', onclick: () => moduloVisita(p, v) }, 'Cambia') : null))
            : h('span', { class: 'sotto-titolo' }, 'Nessuna visita scritta.'),
          s.giudizio || (scrive() && vedeRiservati()) ? h('span', { class: 'regola' }, 'Qui va solo il giudizio del medico, non la diagnosi') : null),
        scrive() && !p.anonimizzata ? piccolo('Nuova visita', () => moduloVisita(p, null), 'piu') : null));
      }

      // Ha in uso: mezzo e strumenti (lavoro), DPI (personali).
      if (s.inUso) {
        const r = [];
        (p.mezzi || []).forEach(m => r.push(riga({ sinistra: quadrato('furgone', 'ico-blu'), titolo: m.nome, sotto: (m.come === 'prestito' ? 'In prestito' : 'Assegnato') + (m.dal ? ' dal ' + dataIt(m.dal) : '') + (m.rientro ? ' · rientra il ' + dataIt(m.rientro) : ''),
          onclick: puo('mezzi') ? () => W.vai('#mezzi/mezzo/' + m.id) : null })));
        (p.attrezzature || []).forEach(x => r.push(riga({ sinistra: quadrato(x.categoria === 'dpi' ? 'scudo' : x.categoria === 'strumento' ? 'misura' : x.categoria === 'informatica' ? 'laptop' : 'attrezzo', /scadut|Non conforme/.test(x.taratura || '') ? 'ico-rosso' : 'ico-grigio'),
          titolo: x.nome, sotto: [x.codice, x.come === 'prestito' ? 'in prestito' : 'assegnato', x.dal ? 'dal ' + dataIt(x.dal) : ''].filter(Boolean).join(' · '),
          destra: x.taratura ? pill(x.taratura) : null, onclick: puo('mezzi') ? () => W.vai('#mezzi/at/' + x.id) : null })));
        (p.dpi || []).filter(d => !d.restituitoIl && !d.idAttrezzatura).forEach(d => r.push(riga({ sinistra: quadrato('scudo'), titolo: d.cosa + (d.taglia ? ' · taglia ' + d.taglia : ''),
          sotto: 'Consegnato il ' + dataIt(d.data) + (d.quantita > 1 ? ' · ' + d.quantita + ' pezzi' : ''), destra: d.firmata ? pill('Firmata', 'verde') : pill('Da firmare', 'giallo'),
          onclick: (scrive() || puo('mezzi', 2) || mia) && !d.firmata ? () => firmaDopo(p, d) : null })));
        out.push(sez('Ha in uso', righe(r, 'Niente in uso.'), (scrive() || puo('mezzi', 2)) && s.dpi && !p.anonimizzata && !p.uscitaIl ? piccolo('Consegna un DPI', () => consegnaDpi(p), 'piu') : null));
      }

      // Documenti personali e riservati (il lucchetto per i riservati).
      if (s.documenti) {
        out.push(sez('Documenti', righe((p.documenti || []).map(d => riga({
          sinistra: quadrato(d.documentoRiservato ? 'lucchetto' : 'file', d.documentoRiservato ? 'ico-viola' : 'ico-grigio'), titolo: d.titolo,
          sotto: [d.categoria, d.dataDocumento ? dataIt(d.dataDocumento) : '', d.documentoRiservato ? 'riservato' : ''].filter(Boolean).join(' · '),
          onclick: () => W.Archivio.apriFile(d.url, d.nomeFile || d.titolo),
        })), 'Nessun documento.'), scrive() && !p.anonimizzata ? piccolo('Carica', () => caricaDocumenti(p), 'carica') : null));
      }

      // Costo (costoOrario è dei soldi; costo dell'anno è riservato e la persona non lo vede).
      if (s.costo && !mia) {
        const costiP = p.costi || [];
        const att = costiP[0] || (p.costoOrario !== null && p.costoOrario !== undefined ? { costoOrario: p.costoOrario, dal: p.costoDal } : null);
        out.push(sez('Costo', h('div', { class: 'scheda fila-f6' },
          att ? [h('b', { class: 'grande-f6' }, C.euro(att.costoOrario) + ' l\'ora dal ' + dataIt(att.dal)),
            Object.prototype.hasOwnProperty.call(att, 'costoAnno') && att.costoAnno !== null && att.costoAnno !== undefined
              ? h('span', { class: 'sotto-titolo lucchetto-r' }, icona('lucchetto', 14, 2.4), 'Costo dell\'anno ' + C.euro(att.costoAnno) + (att.oreAnno ? ' · ' + P.numIt(att.oreAnno) + ' ore' : '') + (att.notaCosto ? ' · ' + att.notaCosto : '')) : null,
            costiP.length > 1 ? h('span', { class: 'sotto-titolo' }, 'Prima: ' + costiP.slice(1, 3).map(c => C.euro(c.costoOrario) + ' dal ' + dataIt(c.dal)).join(' · ')) : null]
            : [h('b', null, 'Usa il costo dello studio'), h('span', { class: 'sotto-titolo' }, p.rapporto === 'titolare' ? 'Valgono le regole di oggi: cliente, commessa, impostazioni' : 'Le sue ore usano il costo dello studio')]),
        scrive() && puo('costi', 2) && !p.anonimizzata ? piccolo('Nuovo costo', () => moduloCosto(p), 'piu') : null));
      }

      // Dati personali (e riservati): chiusi, aperti se è la propria.
      if (s.personali || s.riservati) {
        const det = h('details', { class: 'chiuso-f6' + (pagina ? '' : '') }, h('summary', null, h('span', null, 'Dati personali'), icona('giu', 18, 2.4)),
          h('div', { class: 'fila-f6 dentro' },
            coppie([['Codice fiscale', se(p, 'codiceFiscale')], ['Nato il', se(p, 'nascitaData', dataIt)], ['Nato a', se(p, 'nascitaLuogo')],
              ['Indirizzo', Object.prototype.hasOwnProperty.call(p, 'indirizzo') ? R.indirizzoCompleto(p) : null], ['Telefono personale', se(p, 'telefonoPersonale')], ['Email personale', se(p, 'emailPersonale')],
              ['IBAN per i rimborsi', se(p, 'iban')], ['Contatto di emergenza', Object.prototype.hasOwnProperty.call(p, 'emergenzaNome') ? [p.emergenzaNome, p.emergenzaTelefono].filter(Boolean).join(' · ') : null],
              ['Contratto', Object.prototype.hasOwnProperty.call(p, 'contrattoTipo') ? [P.nomeDi(P.CONTRATTI, p.contrattoTipo), p.contrattoScade ? 'fino al ' + dataIt(p.contrattoScade) : ''].filter(Boolean).join(' · ') : null],
              ['Ferie all\'anno', se(p, 'ferieAnnueOre', v => (v === null || v === undefined || v === '' ? '' : P.ore1(v)))], ['Permessi all\'anno', se(p, 'permessiAnnuiOre', v => (v === null || v === undefined || v === '' ? '' : P.ore1(v)))],
              ['Uscita', p.uscitaIl ? dataIt(p.uscitaIl) + (p.motivoUscita ? ' · ' + p.motivoUscita : '') : null]]),
            s.riservati ? h('div', { class: 'riservati-f6' }, h('span', { class: 'etichetta lucchetto-r' }, icona('lucchetto', 14, 2.4), 'Riservati'),
              coppie([['CCNL', se(p, 'ccnl')], ['Livello', se(p, 'livello')], ['Note riservate', se(p, 'noteRiservate')]])) : null,
            mia && p.puoCambiareContatti && !scrive() ? h('div', null, piccolo('Cambia i tuoi contatti', () => moduloContatti(p))) : null));
        if (mia) det.open = true;
        out.push(det);
      }

      // Scadenze della persona (fase 5): quelle aperte.
      if (s.scadenze) {
        out.push(sez('Scadenze', righe(p.scadenze.slice(0, 8).map(x => riga({ sinistra: quadrato('bandiera', x.statoVisto === 'Scaduta' ? 'ico-rosso' : /^Scade/.test(x.statoVisto) ? 'ico-giallo' : 'ico-grigio'),
          titolo: x.titolo, sotto: dataIt(x.data), destra: pillola(x.statoVisto === 'Scaduta' ? 'Scaduta ' + (x.statoDettaglio || '') : x.statoVisto, T.coloreScadenza(x.statoVisto)),
          onclick: () => W.Archivio.apriScadenza(x.id, x) })))));
      }

      // Accesso a Wisper (chi scrive le schede).
      if (s.accesso && !p.anonimizzata) {
        out.push(sez('Accesso a Wisper', h('div', { class: 'scheda fila-f6' }, p.idUtente
          ? coppie([['Ruolo', (R.RUOLI[p.ruoloWisper] || { nome: p.ruoloWisper || '' }).nome + (p.accessoAttivo === false ? ' · accesso spento' : '')], ['Ultimo accesso', p.ultimoAccesso ? R.quando(p.ultimoAccesso) : 'mai entrato']])
          : [h('span', { class: 'sotto-titolo' }, 'Non entra in Wisper.'), puo('amministrazione', 2) && !p.uscitaIl ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => daiAccesso(p) }, icona('esci', 18, 2.2), 'Dai l\'accesso a Wisper')) : null])));
      }
      if (p.programmaPaghe && scrive()) out.push(h('div', { class: 'scheda riga-non-collegata' }, h('span', { class: 'corpo' }, h('b', null, 'Programma paghe del consulente')), nonCollegato()));

      // Il menu ⋯ e il giallo.
      const menu = scrive() && !p.anonimizzata ? [
        { testo: 'Cambia', fn: () => moduloPersona(p) },
        titolare() ? { testo: 'Chi ha visto i dati riservati', fn: () => W.vai('#persone/accessi/' + p.id) } : null,
        puo('amministrazione', 2) && p.idUtente && p.accessoAttivo !== false && !mia ? { testo: 'Togli l\'accesso a Wisper', fn: () => togliAccesso(p) } : null,
        !mia && !p.uscitaIl ? { testo: 'Segna l\'uscita', fn: () => segnaUscita(p) } : null,
        p.uscitaIl ? { testo: 'Annulla l\'uscita', fn: () => annullaUscita(p) } : null,
        titolare() && p.uscitaIl && p.uscitaIl < oggi() && !mia ? { testo: 'Rendi anonima la scheda', fn: () => anonimizza(p), pericolo: true } : null,
        '-',
        { testo: 'Esporta l\'organico', fn: () => W.esporta('persone', {}) },
      ] : mia && titolare() === false && idPersonaIo() ? [{ testo: 'Chi ha visto i tuoi dati riservati', fn: () => W.vai('#persone/accessi/' + p.id) }] : null;
      const g = P.gialloPersona(p, pagina ? idPersonaIo() : null, puoApprovare());
      const giallo = g && g.azione === 'approva' ? { testo: g.testo, fn: () => apriApprova(g.assenza, p) } : g && g.azione === 'chiedi' ? { testo: g.testo, fn: () => chiediAssenza() } : null;
      return { corpo: out, menu, giallo };
    }

    // ----------------------------------------------------------------- Io (il collaboratore)

    async function leggiIo() { if (!M.io) M.io = (await Rete.get('/server/persona')).persona; }

    function io(pagina, voci) {
      const zonaGiallo = h('span');
      aggiungi(pagina, [h('div', { class: 'testata alta' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Persone e risorse umane'), h('h1', null, 'La tua scheda')), zonaGiallo), barraSegmenti(voci, 'io')]);
      conDati(pagina, leggiIo, () => {
        M.scheda = M.io;
        const c = corpoPersona(M.io, true);
        if (c.giallo) aggiungi(zonaGiallo, [h('button', { type: 'button', class: 'btn giallo', onclick: c.giallo.fn }, icona('valigia', 18, 2.4), c.giallo.testo)]);
        aggiungi(pagina, [h('div', { class: 'stretta-820 sezione scheda-io' }, c.corpo)]);
        if (c.menu) aggiungi(pagina, [h('div', { class: 'filtri' }, c.menu.filter(x => x && x !== '-').map(x => h('button', { type: 'button', class: 'btn collegamento', onclick: x.fn }, x.testo)))]);
      });
    }

    // ----------------------------------------------------------------- ferie e permessi

    const meseVisto = () => M.mese || oggi().slice(0, 7);
    function giorniDelMese(mese) {
      const out = [];
      const ultimo = P.fineMese(mese + '-01');
      for (let g = mese + '-01'; g <= ultimo; g = P.giorniDopo(g, 1)) out.push(g);
      return out;
    }

    async function leggiAssenze() {
      const mese = meseVisto();
      const da = mese + '-01';
      const a = P.fineMese(da);
      if (M.assenze && M.assenze.mese === mese) return;
      const [periodo, aperte] = await Promise.all([Rete.get('/server/assenze?da=' + da + '&a=' + a), Rete.get('/server/assenze'), leggiPersone()]);
      M.assenze = { mese, periodo, aperte };
    }

    function ferie(pagina, voci, filtro) {
      const giallo = gialloPagina(scrive() ? 'Nuova richiesta' : 'Chiedi ferie o permesso', () => chiediAssenza(), 'valigia');
      aggiungi(pagina, [testata('Persone e risorse umane', 'Ferie e permessi', giallo), barraSegmenti(voci, 'ferie')]);
      conDati(pagina, () => Promise.all([leggiAssenze(), idPersonaIo() && !scrive() ? leggiIo().catch(() => null) : null]), () => {
        const A = M.assenze;
        const coll = !scrive();
        // Il proprio saldo in cima (chi non scrive le schede: il collaboratore).
        if (coll && M.io && M.io.saldi) {
          const rs = P.righeSaldo(M.io.saldi);
          if (rs) aggiungi(pagina, [h('div', { class: 'scheda saldo-box stretta-820' }, rs.ferie ? h('div', null, h('b', null, rs.ferie.grande), h('span', null, rs.ferie.sotto)) : null,
            rs.permessi ? h('div', null, h('b', null, rs.permessi.grande), h('span', null, rs.permessi.sotto)) : null, h('span', { class: 't-saldo' }, rs.riga))]);
        }
        const mese = meseVisto();
        const sposta = d => { const x = new Date(mese + '-15T12:00:00'); x.setMonth(x.getMonth() + d); M.mese = R.isoGiorno(x).slice(0, 7); W.disegnaPagina(); };
        aggiungi(pagina, [h('div', { class: 'testa-calendario' }, tondo('indietro', 'Mese prima', () => sposta(-1)), tondo('avanti', 'Mese dopo', () => sposta(1)),
          h('h2', { class: 'titolo-calendario' }, C.nomeMese(mese)), h('span', { class: 'spazio' }),
          h('button', { type: 'button', class: 'btn', onclick: () => finestraChiusure() }, icona('calendario', 18, 2.2), 'Chiusure dello studio'))]);
        const daApprovare = (A.aperte.assenze || []).filter(x => x.stato === 'da_approvare' && x.daApprovare);
        const destra = h('div', { class: 'colonna-f6' });
        if (puoApprovare()) aggiungi(destra, [sez('Da approvare' + (daApprovare.length ? ' · ' + daApprovare.length : ''), righe(daApprovare.map(x => rigaAssenza(x, true)), 'Niente da approvare.'))]);
        const mie = coll ? (A.aperte.assenze || []).filter(x => String(x.idPersona) === String(idPersonaIo())) : [];
        if (coll) aggiungi(destra, [sez('Le tue richieste', righe(mie.map(x => rigaAssenza(x, false)), 'Nessuna richiesta aperta.'))]);
        const prossime = (A.aperte.assenze || []).filter(x => x.stato === 'approvata' && (!coll || String(x.idPersona) !== String(idPersonaIo())));
        aggiungi(destra, [sez('Prossime', righe(prossime.slice(0, 12).map(x => rigaAssenza(x, true)), 'Nessuna assenza in vista.'))]);
        aggiungi(pagina, [h('div', { class: 'griglia-ferie' }, h('div', null, grigliaMese(A.periodo, mese)), destra)]);
        if (filtro && filtro.daApprovare && daApprovare[0]) setTimeout(() => apriApprova(daApprovare[0]), 50);
      });
    }

    /** La griglia del mese: righe = persone, colonne = giorni; festivi e fine settimana grigi, chiusure a strisce, assenze come barre con la parola. */
    function grigliaMese(periodo, mese) {
      const giorni = giorniDelMese(mese);
      const persone = (M.persone && M.persone.persone) || [];
      const fest = (periodo && periodo.festivi) || P.festiviTra(giorni[0], giorni[giorni.length - 1], S.ana.impostazioni.FESTA_PATRONO || '');
      const g = P.grigliaAssenze(persone, (periodo && periodo.assenze) || [], giorni, fest, (periodo && periodo.chiusure) || []);
      const col = '150px repeat(' + giorni.length + ', minmax(0, 1fr))';
      const testa = h('div', { class: 'gr-riga gr-testa', style: { gridTemplateColumns: col } }, h('span'),
        giorni.map(d => { const dw = new Date(d + 'T12:00:00').getDay(); return h('span', { class: 'gr-g' + (dw === 0 || dw === 6 || fest.indexOf(d) >= 0 ? ' we' : '') + (d === oggi() ? ' oggi' : '') }, String(Number(d.slice(8)))); }));
      const corpo = g.map(r => {
        const celle = [];
        let i = 0;
        while (i < r.celle.length) {
          const c = r.celle[i];
          if (c.assenza) {
            let j = i;
            while (j + 1 < r.celle.length && r.celle[j + 1].assenza && r.celle[j + 1].assenza.id === c.assenza.id) j++;
            const parola = P.tipoVisto(c.assenza);
            celle.push(h('button', { type: 'button', class: 'gr-barra ' + P.classeAssenza(c.assenza), style: { gridColumn: (i + 2) + ' / ' + (j + 3) }, title: parola + ' · ' + P.quandoAssenza(c.assenza) + (c.assenza.stato === 'da_approvare' ? ' · da approvare' : ''),
              onclick: () => apriAssenza(c.assenza) }, j > i ? parola : ''));
            i = j + 1;
          } else {
            celle.push(h('span', { class: 'gr-c ' + (c.tipo === 'chiuso' ? 'chiuso' : c.tipo ? 'we' : ''), style: { gridColumn: (i + 2) + ' / ' + (i + 3) }, title: c.chiusura ? 'Studio chiuso: ' + c.chiusura.nome : c.tipo === 'festa' ? 'festa' : '' }));
            i++;
          }
        }
        return h('div', { class: 'gr-riga', style: { gridTemplateColumns: col } }, h('span', { class: 'gr-nome' }, iniziali(r.persona.nome, true), h('b', { class: 'taglia' }, r.persona.nome.split(' ')[0])), celle);
      });
      return h('div', { class: 'tab griglia-assenze', 'aria-label': 'Assenze di ' + C.nomeMese(mese) }, testa, corpo,
        h('div', { class: 'legenda-f6' }, h('span', null, h('i', { class: 'ferie' }), 'Ferie'), h('span', null, h('i', { class: 'perm' }), 'Permesso'), h('span', null, h('i', { class: 'altra' }), 'Assente'),
          h('span', null, h('i', { class: 'da-approvare' }), 'Da approvare'), h('span', null, h('i', { class: 'chiuso' }), 'Studio chiuso')));
    }

    /** Una riga di assenza: chi (o il tipo), quando, quanto, lo stato in pillola. */
    function rigaAssenza(a, conPersona) {
      const tv = P.tipoVisto(a);
      const quanto = Number(a.giorni) > 0 ? P.giorni1(a.giorni) : Number(a.ore) > 0 ? P.ore1(a.ore) : '';
      return riga({
        sinistra: conPersona ? iniziali(a.persona || '', true) : quadrato('valigia', tv === 'Ferie' ? 'ico-verde' : tv === 'Permesso' ? 'ico-blu' : 'ico-grigio'),
        titolo: (conPersona ? (a.persona || '') + ' · ' : '') + tv, sotto: [P.quandoAssenza(a), quanto, a.stato === 'respinta' && a.motivoRifiuto ? 'Motivo: ' + a.motivoRifiuto : ''].filter(Boolean).join(' · '),
        destra: h('span', { class: 'pillole-destra' }, pill(a.statoVisto || P.STATI_ASSENZA[a.stato] || '', P.coloreAssenza(a.stato))),
        onclick: () => (a.stato === 'da_approvare' && a.daApprovare && puoApprovare() ? apriApprova(a) : apriAssenza(a)),
      });
    }

    /** La finestra di un'assenza: i dati che si vedono e quello che si può fare (annullare la propria, accorciare). */
    function apriAssenza(a) {
      const mia = idPersonaIo() && String(a.idPersona) === String(idPersonaIo());
      const inCorso = a.dal < oggi() && (a.al || a.dal) >= oggi();
      let chiudi;
      const corpo = [h('div', { class: 'pillole-testa' }, pill(P.tipoVisto(a), P.tipoVisto(a) === 'Ferie' ? 'verde' : P.tipoVisto(a) === 'Permesso' ? 'blu' : 'grigio'), pill(a.statoVisto || P.STATI_ASSENZA[a.stato], P.coloreAssenza(a.stato))),
        coppie([['Chi', a.persona || ''], ['Quando', P.quandoAssenza(a)], ['Quanto', P.contoAssenza(a)], ['Nota', se(a, 'nota')], ['Numero del certificato', se(a, 'protocollo')],
          ['Approvata da', a.approvataDaNome ? a.approvataDaNome + (a.approvataIl ? ' · ' + C.data(a.approvataIl) : '') : null], ['Motivo del rifiuto', a.motivoRifiuto || null],
          ['Chiusura dello studio', a.chiusura || null], ['Motivo', a.motivoAnnullo || null]])];
      const pulsanti = ['spazio'];
      if (a.puoAnnullare && a.stato !== 'annullata' && !(inCorso && a.stato === 'approvata' && (a.tipo === 'ferie' || a.tipo === 'permesso' || a.tipo === 'altro'))) {
        pulsanti.unshift(h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: () => { chiudi(); annullaAssenza(a, mia); } }, mia ? 'Annulla la richiesta' : 'Annulla l\'assenza'));
      }
      if (scrive() && inCorso && a.stato === 'approvata') {
        pulsanti.splice(1, 0, h('button', { type: 'button', class: 'btn grande', onclick: () => { chiudi(); accorcia(a); } }, 'Accorcia fino a ieri'));
      }
      pulsanti.push(h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi'));
      chiudi = finestra({ titolo: (a.persona ? a.persona + ' · ' : '') + P.tipoVisto(a), corpo, pulsanti, fuoco: false });
    }

    async function annullaAssenza(a, mia) {
      const motivo = h('input', { type: 'text' });
      let chiudi;
      const vai = async () => {
        if (!mia && !motivo.value.trim()) { motivo.focus(); avviso('Scrivi il motivo: arriva a chi l\'ha chiesta', true); return; }
        const r = await lavora('Annullo', () => Rete.post('/server/annullaAssenza', { id: a.id, motivo: motivo.value.trim() }));
        if (!r) return;
        chiudi();
        dopoAssenza('Annullata');
      };
      chiudi = finestra({ titolo: mia ? 'Annullare la richiesta?' : 'Annullare l\'assenza?', corpo: [h('p', { class: 'testo-forte' }, P.tipoVisto(a) + ' · ' + P.quandoAssenza(a)), campo(mia ? 'Motivo (se vuoi)' : 'Motivo', motivo)],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Indietro'), h('button', { type: 'button', class: 'btn grande pericolo', onclick: vai }, 'Annulla l\'assenza')] });
    }

    async function accorcia(a) {
      const ieri = P.giorniDopo(oggi(), -1);
      const ok = await conferma('Accorciare fino a ieri?', P.tipoVisto(a) + ': finisce ' + P.giornoLungo(ieri) + '. Le ore si rifanno.', 'Accorcia');
      if (!ok) return;
      const r = await lavora('Accorcio', () => Rete.post('/server/salvaAssenza', { assenza: { id: a.id, al: ieri } }));
      if (r) dopoAssenza('Accorciata fino a ieri');
    }

    function dopoAssenza(frase) {
      M.assenze = null;
      M.persone = null;
      M.io = null;
      W.caricaDashboard();
      if (W.Ore) W.Ore.daRileggere();
      if (frase) avviso(frase);
      W.disegnaPagina();
      if (M.scheda && pannelloAperto && M.segmento === 'organico') apriPersona(M.scheda.id);
    }

    /** Il foglio dell'approvazione: persona, cosa, quando, il saldo prima e dopo, le anomalie; giallo Approva, Respingi col bordo. */
    async function apriApprova(a, persona) {
      // Le anomalie stanno nella voce di daApprovare (il server le calcola lì).
      const voce = await lavora('Apro la richiesta', async () => {
        const d = await Rete.get('/server/daApprovare');
        let v = null;
        (d.persone || []).forEach(p => (p.voci || []).forEach(x => { if (x.tipo === 'assenza' && String(x.id) === String(a.id)) v = x; }));
        let saldi = null;
        try { saldi = (await Rete.get('/server/saldi?idPersona=' + encodeURIComponent(a.idPersona))).saldi; } catch (e) { saldi = null; }
        return { v, saldi };
      });
      if (!voce) return;
      const v = voce.v || { anomalie: [], dettaglio: '' };
      const s = voce.saldi && (a.tipo === 'ferie' ? voce.saldi.ferie : a.tipo === 'permesso' ? voce.saldi.permessi : null);
      let chiudi;
      const decidi = async (decisione, motivo) => {
        const voci = [{ tipo: 'assenza', id: a.id }];
        const r = await lavora(decisione === 'approva' ? 'Approvo' : 'Respingo', () => Rete.post('/server/' + decisione, decisione === 'approva' ? { voci } : { voci, motivo }));
        if (!r) return false;
        chiudi();
        dopoAssenza();
        avviso(decisione === 'approva' ? P.tipoVisto(a) + ' di ' + (a.persona || '').split(' ')[0] + ' approvate' : 'Respinta, col motivo', false, null, { testo: 'Annulla', fn: async () => {
          const x = await lavora('Rimetto da approvare', () => Rete.post('/server/annullaApprovazione', { voci }));
          if (x) { dopoAssenza('Rimessa da approvare'); }
        } });
        return true;
      };
      const respingi = () => {
        const motivo = h('textarea', { rows: 3 });
        let chiudi2;
        const vai = async () => { if (!motivo.value.trim()) { motivo.focus(); avviso('Scrivi il motivo: arriva a chi l\'ha chiesta', true); return; } if (await decidi('respingi', motivo.value.trim())) chiudi2(); };
        chiudi2 = finestra({ titolo: 'Perché la respingi?', corpo: [h('p', { class: 'testo-forte' }, 'Il motivo arriva a ' + (a.persona || '').split(' ')[0] + ': può chiederne un\'altra.'), campo('Motivo', motivo)],
          pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi2() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Respingi')] });
      };
      const corpo = [
        h('div', { class: 'testa-persona piccola' }, iniziali(a.persona || '', true), h('div', { class: 'titoli' }, h('b', null, a.persona || (persona && persona.nome) || ''), h('span', { class: 'sotto-titolo' }, P.tipoVisto(a) + ' · ' + P.quandoAssenza(a)))),
        h('div', { class: 'scheda conto-ass' }, h('b', null, P.contoAssenza(a)),
          s && s.tenuto ? h('span', null, 'Saldo di oggi ' + (a.tipo === 'ferie' ? P.giorni1(s.giorniOggi !== undefined ? s.giorniOggi : P.giorniDaOre(s.oggi, s.oreGiorno)) : P.ore1(s.oggi)) +
            ' · dopo le richieste ' + (a.tipo === 'ferie' ? P.giorni1(s.giorniRestano !== undefined ? s.giorniRestano : P.giorniDaOre(s.restano, s.oreGiorno)) : P.ore1(s.restano))) : h('span', { class: 'calmo' }, 'Saldo non tenuto'),
          a.nota ? h('span', null, 'Nota: ' + a.nota) : null),
        (v.anomalie || []).length ? h('div', { class: 'anomalie-f6' }, v.anomalie.map(x => h('span', null, icona('allarme', 14, 2.4), x.testo))) : null,
      ];
      chiudi = finestra({ titolo: 'Approva la richiesta', corpo, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: respingi }, 'Respingi'), h('button', { type: 'button', class: 'btn giallo grande', onclick: () => decidi('approva') }, 'Approva')] });
    }

    // ----------------------------------------------------------------- chiedi ferie o permesso

    /**
     * Chiedi ferie o permesso (fase6.md §12.1): che cosa, quando, il conto grande col saldo che resta, chi altro è
     * assente; giallo Manda la richiesta (Segnala la malattia, o Salva per chi non deve chiedere).
     */
    async function chiediAssenza(base) {
      const b = base || {};
      const ok = await lavora('Preparo la richiesta', () => Promise.all([leggiPersone(), idPersonaIo() ? leggiIo().catch(() => null) : null, M.assenze ? null : leggiAssenze().catch(() => null)]).then(() => true));
      if (!ok) return;
      const persone = (M.persone && M.persone.persone) || [];
      const x = { idPersona: b.idPersona || idPersonaIo() || (persone[0] && persone[0].id), tipo: b.tipo || 'ferie', sottotipo: 'infortunio', dal: b.dal || oggi(), al: b.al || b.dal || oggi(), mezza: '', dalle: '15:00', alle: '18:00', aperta: false, certificato: false, nota: false };
      const v = { causale: h('input', { type: 'text' }), protocollo: h('input', { type: 'text' }), nota: h('textarea', { rows: 2 }), dal: h('input', { type: 'date', value: x.dal }), al: h('input', { type: 'date', value: x.al }) };
      const schede = {};
      const scheda = async id => {
        if (String(id) === String(idPersonaIo()) && M.io) return M.io;
        if (schede[id] === undefined) { try { schede[id] = (await Rete.get('/server/persona?id=' + encodeURIComponent(id))).persona; } catch (e) { schede[id] = null; } }
        return schede[id];
      };
      let errore = '';
      const zona = h('div', { class: 'modulo-chiedi' });
      const tipoVero = () => (x.tipo === 'altro' ? x.sottotipo : x.tipo);
      const segnalazione = () => P.SANITARIE.indexOf(tipoVero()) >= 0;
      const passo = (k, d) => { const m = P.minutiDa(x[k]) + d * 30; if (m < 0 || m > 23 * 60 + 30) return; x[k] = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); disegna(); };
      const leggi = () => {
        const tv = tipoVero();
        const a = { tipo: tv, dal: v.dal.value, al: tv === 'permesso' || (tv === 'legge104' && x.aOre) ? v.dal.value : (x.aperta ? v.dal.value : (v.al.value || v.dal.value)) };
        if (tv === 'ferie' && x.mezza && a.dal === a.al) a.mezza = x.mezza;
        if (tv === 'permesso') { a.dalle = x.dalle; a.alle = x.alle; }
        if (tv === 'altro') a.causale = v.causale.value.trim();
        if (segnalazione() && v.protocollo.value.trim()) a.protocollo = v.protocollo.value.trim();
        if (v.nota.value.trim()) a.nota = v.nota.value.trim();
        if (scrive() && x.idPersona) a.idPersona = x.idPersona;
        return a;
      };
      const disegna = async () => {
        const p = await scheda(x.idPersona);
        const a = leggi();
        const ant = P.anteprimaAssenza(a, p || {}, p && p.saldi, S.ana.impostazioni.FESTA_PATRONO || '');
        const perAltri = !(String(x.idPersona) === String(idPersonaIo()));
        const altri = ((M.assenze && M.assenze.aperte && M.assenze.aperte.assenze) || []).filter(y => String(y.idPersona) !== String(x.idPersona) && y.dal <= (a.al || a.dal) && (y.al || y.dal) >= a.dal && (y.stato === 'approvata' || y.stato === 'da_approvare'));
        const tv = tipoVero();
        aggiungi(svuota(zona), [
          h('div', { class: 'col' },
            scrive() ? h('div', { class: 'campo' }, h('label', null, 'Per chi'), h('div', { class: 'pillole' }, persone.map(q => h('button', { type: 'button', class: 'pillola' + (String(q.id) === String(x.idPersona) ? ' scelta' : ''), onclick: () => { x.idPersona = q.id; disegna(); } }, q.nome)))) : null,
            h('div', { class: 'campo' }, h('label', null, 'Che cosa'), h('div', { class: 'pillole' }, [['ferie', 'Ferie'], ['permesso', 'Permesso'], ['malattia', 'Malattia'], ['altro', 'Altro']].map(t => h('button', { type: 'button', class: 'pillola' + (x.tipo === t[0] ? ' scelta' : ''), onclick: () => { x.tipo = t[0]; disegna(); } }, t[1])))),
            x.tipo === 'altro' ? h('div', { class: 'pillole' }, [['infortunio', 'Infortunio'], ['congedo', 'Congedo'], ['legge104', 'Legge 104'], ['altro', 'Altro motivo']].map(t => h('button', { type: 'button', class: 'pillola piccola' + (x.sottotipo === t[0] ? ' scelta' : ''), onclick: () => { x.sottotipo = t[0]; disegna(); } }, t[1]))) : null,
            tv === 'altro' ? campo('Causale', v.causale) : null,
            tv === 'permesso' ? [campo('Il giorno', v.dal), h('div', { class: 'riga-stepper' }, h('span', { class: 'nome' }, h('b', null, 'Dalle')), h('span', { class: 'stepper' }, tondo('meno', 'Prima', () => passo('dalle', -1)), h('span', { class: 'valore' }, x.dalle), tondo('piu', 'Dopo', () => passo('dalle', 1)))),
              h('div', { class: 'riga-stepper' }, h('span', { class: 'nome' }, h('b', null, 'Alle')), h('span', { class: 'stepper' }, tondo('meno', 'Prima', () => passo('alle', -1)), h('span', { class: 'valore' }, x.alle), tondo('piu', 'Dopo', () => passo('alle', 1))))]
              : h('div', { class: 'riga-campi' }, campo(segnalazione() ? 'Dal' : 'Dal', v.dal), x.aperta ? h('div', { class: 'campo' }, h('label', null, 'Fino a quando?'), h('div', { class: 'valore-calmo' }, 'Non lo so ancora')) : campo(segnalazione() ? 'Fino a quando?' : 'Al', v.al)),
            segnalazione() ? h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: x.aperta, onchange: e => { x.aperta = e.target.checked; disegna(); } }), 'Non so ancora fino a quando') : null,
            tv === 'ferie' && a.dal === a.al ? h('div', { class: 'campo' }, h('label', null, 'Mezza giornata'), h('div', { class: 'pillole' }, [['', 'No'], ['mattina', 'Mattina'], ['pomeriggio', 'Pomeriggio']].map(t => h('button', { type: 'button', class: 'pillola piccola' + (x.mezza === t[0] ? ' scelta' : ''), onclick: () => { x.mezza = t[0]; disegna(); } }, t[1])))) : null,
            segnalazione() ? (x.certificato ? campo('Numero del certificato', v.protocollo) : h('button', { type: 'button', class: 'pillola tratteggiata', style: { alignSelf: 'flex-start' }, onclick: () => { x.certificato = true; disegna(); } }, '+ Numero del certificato')) : null),
          h('div', { class: 'col' },
            ant ? h('div', { class: 'scheda conto-ass' }, h('b', null, P.contoAssenza(ant.conto)),
              ant.saldo ? h('span', { class: ant.saldo.sottoZero ? 'rosso-t' : '' }, P.fraseRestano(ant.saldo, perAltri), ant.saldo.sottoZero ? pill('Sotto zero', 'rosso') : null) : h('span', { class: 'calmo' }, segnalazione() ? 'Si segnala: non va approvata' : 'Saldo non tenuto')) : null,
            altri.length ? h('div', { class: 'righe-calme' }, altri.slice(0, 4).map(y => h('span', null, (y.persona || '').split(' ')[0] + ' è assente ' + P.quandoAssenza(y).replace(/^Dal/, 'dal').replace(/^([A-Z])/, m => m.toLowerCase())))) : null,
            x.nota ? campo('Una nota per chi approva', v.nota) : h('button', { type: 'button', class: 'pillola tratteggiata', style: { alignSelf: 'flex-start' }, onclick: () => { x.nota = true; disegna(); } }, '+ Una nota per chi approva'),
            errore ? h('div', { class: 'campo' }, h('div', { class: 'errore' }, errore)) : null),
        ]);
        aggiornaGiallo();
      };
      const giallo = h('button', { type: 'button', class: 'btn giallo grande', onclick: () => manda() }, 'Manda la richiesta');
      const aggiornaGiallo = () => {
        const nessuno = interfaccia().approvazione === 'nessuno' || (titolare() && String(x.idPersona) === String(idPersonaIo()) && interfaccia().approvazione !== 'tutti');
        giallo.textContent = segnalazione() ? (tipoVero() === 'malattia' ? 'Segnala la malattia' : 'Segnala l\'assenza') : (nessuno || (scrive() && String(x.idPersona) !== String(idPersonaIo())) ? 'Salva' : 'Manda la richiesta');
      };
      [v.dal, v.al].forEach(i => i.addEventListener('change', () => { errore = ''; disegna(); }));
      let chiudi;
      const manda = async () => {
        const a = leggi();
        errore = '';
        if (!a.dal) errore = 'Dal: scrivi il primo giorno';
        else if (a.al && a.al < a.dal) errore = 'Al: non può venire prima di Dal';
        else if (a.tipo === 'altro' && !a.causale) errore = 'Altro: scrivi la causale';
        if (errore) { disegna(); return; }
        a.idLocale = 'pc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const r = await lavora('Mando', () => Rete.post('/server/salvaAssenza', { assenza: a }));
        if (!r) return;
        chiudi();
        const an = (r.anomalie || []).map(y => y.testo).join(' · ');
        dopoAssenza(r.assenza && r.assenza.stato === 'da_approvare' ? 'Richiesta mandata: aspetta l\'approvazione' + (an ? ' · ' + an : '') : 'Salvata' + (an ? ' · ' + an : ''));
      };
      disegna();
      chiudi = finestra({ titolo: scrive() ? 'Nuova richiesta' : 'Chiedi ferie o permesso', larghezza: 'media', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), giallo] });
    }

    // ----------------------------------------------------------------- chiusure dello studio

    async function finestraChiusure() {
      const anno = meseVisto().slice(0, 4);
      const r = await lavora('Leggo le chiusure', () => Rete.get('/server/chiusure?anno=' + anno));
      if (!r) return;
      const lista = r.chiusure || [];
      let chiudi;
      const corpo = [righe(lista.map(c => riga({ sinistra: quadrato('calendario'), titolo: c.frase || 'Studio chiuso: ' + c.nome, sotto: 'Dal ' + dataIt(c.dal) + ' al ' + dataIt(c.al) + (c.ferie ? ' · ferie per tutti' : ''),
        onclick: scrive() ? () => { chiudi(); moduloChiusura(c); } : null })), 'Nessuna chiusura nel ' + anno + '.')];
      chiudi = finestra({ titolo: 'Chiusure dello studio · ' + anno, corpo, fuoco: false,
        pulsanti: ['spazio', scrive() ? h('button', { type: 'button', class: 'btn grande', onclick: () => { chiudi(); moduloChiusura(null); } }, icona('piu', 18, 2.6), 'Nuova chiusura') : null,
          h('button', { type: 'button', class: 'btn giallo grande', onclick: () => chiudi() }, 'Chiudi')].filter(Boolean) });
    }

    function moduloChiusura(c0) {
      const c = c0 || { nome: '', dal: '', al: '', ferie: true };
      const v = { nome: h('input', { type: 'text', value: c.nome, placeholder: 'Natale' }), dal: h('input', { type: 'date', value: c.dal }), al: h('input', { type: 'date', value: c.al }) };
      let ferie = !!c.ferie;
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [campo('Nome', v.nome), h('div', { class: 'riga-campi' }, campo('Dal', v.dal), campo('Al', v.al)),
        h('div', { class: 'campo' }, h('label', null, 'Consuma le ferie di tutti'), segmenti([['si', 'Sì'], ['no', 'No']], ferie ? 'si' : 'no', k => { ferie = k === 'si'; disegna(); }))]);
      disegna();
      let chiudi;
      const salva = async () => {
        const ch = { nome: v.nome.value.trim(), dal: v.dal.value, al: v.al.value || v.dal.value, ferie };
        if (c0) ch.id = c0.id;
        const r = await scriviConferma('Salvo la chiusura', '/server/salvaChiusura', { chiusura: ch }, 'Nascono le ferie', 'Salva la chiusura');
        if (!r) return;
        chiudi();
        dopoAssenza('Chiusura salvata');
      };
      const togli = async () => {
        const r = await scriviConferma('Tolgo la chiusura', '/server/togliChiusura', { id: c0.id }, 'Togliere la chiusura?', 'Togli');
        if (!r) return;
        chiudi();
        dopoAssenza('Chiusura tolta');
      };
      chiudi = finestra({ titolo: c0 ? 'Chiusura: ' + c0.nome : 'Nuova chiusura', corpo: zona,
        pulsanti: [c0 ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: togli }, 'Togli') : null, 'spazio',
          h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva la chiusura')].filter(Boolean) });
    }

    // ----------------------------------------------------------------- presenze

    async function leggiPresenze() {
      const mese = meseVisto();
      if (M.presenze && M.presenze.mese === mese) return;
      M.presenze = await Rete.get('/server/presenze?mese=' + mese);
    }

    function presenze(pagina, voci) {
      aggiungi(pagina, [testata('Persone e risorse umane', 'Presenze'), barraSegmenti(voci, 'presenze')]);
      const mese = meseVisto();
      const sposta = d => { const x = new Date(mese + '-15T12:00:00'); x.setMonth(x.getMonth() + d); M.mese = R.isoGiorno(x).slice(0, 7); W.disegnaPagina(); };
      aggiungi(pagina, [h('div', { class: 'testa-calendario' }, tondo('indietro', 'Mese prima', () => sposta(-1)), tondo('avanti', 'Mese dopo', () => sposta(1)), h('h2', { class: 'titolo-calendario' }, C.nomeMese(mese)))]);
      conDati(pagina, leggiPresenze, () => {
        const ps = M.presenze.persone || [];
        // La colonna "Malattia" solo se il server ne manda il totale (chi vede i riservati, o la persona stessa): agli altri "Altre assenze".
        const conMalattia = ps.some(p => p.totali && Object.prototype.hasOwnProperty.call(p.totali, 'malattia'));
        const col = 'minmax(170px, 1.4fr) repeat(' + (conMalattia ? 7 : 6) + ', minmax(70px, 92px))';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Persona'), h('span', { class: 'n' }, 'Giorni lavorati'), h('span', { class: 'n' }, 'Ore lavorate'),
          h('span', { class: 'n' }, 'Straordinarie'), h('span', { class: 'n' }, 'Ferie (ore)'), h('span', { class: 'n' }, 'Permessi (ore)'), conMalattia ? h('span', { class: 'n' }, 'Malattia (giorni)') : null, h('span', { class: 'n' }, conMalattia ? 'Altre (ore)' : 'Altre assenze')));
        ps.forEach(p => {
          const t = p.totali || {};
          aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', onclick: () => giorniPresenze(p) },
            h('span', { class: 'con-cerchio' }, iniziali(p.nome, true), h('b', { class: 'taglia' }, p.nome)),
            h('span', { class: 'n' }, P.numIt(t.giorniLavorati)), h('span', { class: 'n' }, P.numIt(t.oreLavorate)), h('span', { class: 'n' }, P.numIt(t.straordinarie)),
            h('span', { class: 'n' }, P.numIt(t.ferie)), h('span', { class: 'n' }, P.numIt(t.permessi)),
            conMalattia ? h('span', { class: 'n' }, t.malattia ? P.numIt(t.malattia.giorni) : '—') : null,
            h('span', { class: 'n' }, P.numIt(t.altreAssenze)))]);
        });
        aggiungi(pagina, [ps.length ? tab : h('p', { class: 'vuoto' }, 'Nessuna persona.'),
          h('div', { class: 'filtri' }, h('button', { type: 'button', class: 'btn', onclick: () => W.esporta('presenze', { mese }) }, icona('scarica', 18, 2.2), 'Esporta per il consulente')),
          h('div', { class: 'scheda riga-non-collegata' }, h('span', { class: 'corpo' }, h('b', null, 'Programma paghe del consulente')), nonCollegato())]);
      });
    }

    function giorniPresenze(p) {
      const col = '150px repeat(4, 96px) minmax(0, 1fr)';
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Giorno'), h('span', { class: 'n' }, 'Previste'), h('span', { class: 'n' }, 'Lavorate'),
        h('span', { class: 'n' }, 'Straord.'), h('span', { class: 'n' }, 'Manca'), h('span', null, 'Assenza')),
      (p.giorni || []).filter(g => g.previste || g.lavorate || g.assenza || g.giorno).map(g => h('div', { class: 'r', style: { gridTemplateColumns: col } },
        h('span', { class: 'forte' }, P.maiuscola(P.giornoLungo(g.data))), h('span', { class: 'n' }, P.numIt(g.previste)), h('span', { class: 'n' }, P.numIt(g.lavorate)), h('span', { class: 'n' }, P.numIt(g.straordinarie)),
        h('span', { class: 'n' }, g.manca ? h('b', { class: 'giallo-t' }, P.numIt(g.manca)) : '0'),
        h('span', null, g.assenza ? pill(P.tipoVisto(g.assenza) + (g.assenza.ore ? ' · ' + P.ore1(g.assenza.ore) : ''), P.tipoVisto(g.assenza) === 'Ferie' ? 'verde' : P.tipoVisto(g.assenza) === 'Permesso' ? 'blu' : 'grigio') : g.giorno ? pill(g.giorno, 'grigio') : null))));
      let chiudi;
      chiudi = finestra({ titolo: p.nome + ' · ' + C.nomeMese(meseVisto()).toLowerCase(), larghezza: 'larga', corpo: tab, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn giallo grande', onclick: () => chiudi() }, 'Chiudi')] });
    }

    // ----------------------------------------------------------------- scadenze delle persone

    function scadenze(pagina, voci) {
      aggiungi(pagina, [testata('Persone e risorse umane', 'Scadenze delle persone', scrive() ? gialloPagina('Nuova scadenza', () => nuovaScadenza(), 'piu') : null), barraSegmenti(voci, 'scadenze')]);
      conDati(pagina, async () => { if (!M.scadenze) M.scadenze = await Rete.get('/server/scadenze?gruppo=persone'); }, () => {
        aggiungi(pagina, tabellaScadenze(M.scadenze, 'Persona'));
      });
    }

    async function nuovaScadenza() {
      if (!(await lavora('Leggo le persone', () => leggiPersone().then(() => true)))) return;
      const persone = (M.persone && M.persone.persone) || [];
      const x = { idPersona: persone[0] && persone[0].id, tipo: 'formazione' };
      const v = { titolo: h('input', { type: 'text', placeholder: 'Lo propone Wisper dal tipo' }), data: h('input', { type: 'date' }) };
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [
        h('div', { class: 'campo' }, h('label', null, 'Di chi'), h('div', { class: 'pillole' }, persone.map(q => h('button', { type: 'button', class: 'pillola' + (String(q.id) === String(x.idPersona) ? ' scelta' : ''), onclick: () => { x.idPersona = q.id; disegna(); } }, q.nome)))),
        campo('Che cosa scade', selezione([['formazione', 'Formazione'], ['abilitazione', 'Abilitazione'], ['visita_medica', 'Visita medica'], ['contratto_lavoro', 'Contratto di lavoro']], x.tipo, k => { x.tipo = k; })),
        campo('Titolo', v.titolo), campo('Il', v.data)]);
      disegna();
      let chiudi;
      const salva = async () => {
        if (!v.data.value) { v.data.focus(); avviso('Data: scrivi quando scade', true); return; }
        const sc = { tipo: x.tipo, idPersona: x.idPersona, data: v.data.value };
        if (v.titolo.value.trim()) sc.titolo = v.titolo.value.trim();
        const r = await lavora('Salvo la scadenza', () => Rete.post('/server/salvaScadenza', { scadenza: sc }));
        if (!r) return;
        chiudi();
        M.scadenze = null;
        W.caricaDashboard();
        avviso('Scadenza salvata: ' + r.scadenza.titolo + ', ' + C.data(r.scadenza.data));
        W.disegnaPagina();
      };
      chiudi = finestra({ titolo: 'Nuova scadenza', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva la scadenza')] });
    }

    // ----------------------------------------------------------------- costi del personale

    function costi(pagina, voci) {
      aggiungi(pagina, [testata('Persone e risorse umane', 'Costi del personale', scrive() && puo('costi', 2) ? gialloPagina('Nuovo costo', () => moduloCosto(null), 'piu') : null), barraSegmenti(voci, 'costi')]);
      conDati(pagina, leggiPersone, () => {
        const lista = M.persone.persone || [];
        const col = 'minmax(0, 1.5fr) minmax(0, 1fr) 160px 150px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Persona'), h('span', null, 'Ruolo nello studio'), h('span', { class: 'n' }, 'Costo orario'), h('span', null, 'Dal')));
        lista.forEach(p => aggiungi(tab, [h('div', { class: 'r cliccabile' + (String(M.aperta) === String(p.id) ? ' scelta' : ''), style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-persona': p.id, onclick: () => apriPersona(p.id) },
          h('span', { class: 'con-cerchio' }, iniziali(p.nome, true), h('b', { class: 'taglia' }, p.nome)), h('span', { class: 't2 taglia' }, p.ruoloStudio || '—'),
          h('span', { class: 'n' }, p.costoOrario !== null && p.costoOrario !== undefined ? h('b', null, C.euro(p.costoOrario)) : pill('Usa il costo dello studio', 'grigio')),
          h('span', { class: 't2' }, p.costoDal ? dataIt(p.costoDal) : '—'))]));
        aggiungi(pagina, [tab]);
      });
    }

    function moduloCosto(p0) {
      const persone = (M.persone && M.persone.persone) || (p0 ? [p0] : []);
      const x = { idPersona: p0 ? p0.id : (persone[0] && persone[0].id), modo: 'orario' };
      const v = { dal: h('input', { type: 'date', value: oggi().slice(0, 4) + '-01-01' }), orario: h('input', { type: 'text', inputmode: 'decimal' }), anno: h('input', { type: 'text', inputmode: 'decimal' }),
        ore: h('input', { type: 'text', inputmode: 'decimal', value: '1650' }), nota: h('input', { type: 'text' }) };
      const zona = h('div', { class: 'fila' });
      const proposta = h('div', { class: 'scheda conto-ass' });
      const aggiorna = () => {
        const c = x.modo === 'anno' ? P.costoOrarioDaAnno(C.num(v.anno.value), C.num(v.ore.value)) : C.numONull(v.orario.value);
        aggiungi(svuota(proposta), [h('span', null, 'Costo orario'), h('b', null, c !== null && c !== undefined ? C.euro(c) + ' l\'ora' : '—')]);
      };
      const disegna = () => {
        aggiungi(svuota(zona), [
          !p0 ? h('div', { class: 'campo' }, h('label', null, 'Di chi'), h('div', { class: 'pillole' }, persone.map(q => h('button', { type: 'button', class: 'pillola' + (String(q.id) === String(x.idPersona) ? ' scelta' : ''), onclick: () => { x.idPersona = q.id; disegna(); } }, q.nome)))) : h('p', { class: 'testo-forte' }, p0.nome),
          campo('Dal', v.dal),
          vedeRiservati() ? segmenti([['orario', 'Costo orario'], ['anno', 'Dal costo dell\'anno']], x.modo, k => { x.modo = k; disegna(); }) : null,
          x.modo === 'anno' ? h('div', { class: 'riga-campi' }, campo('Costo dell\'anno', conSuffisso(v.anno, '€')), campo('Ore lavorate all\'anno', conSuffisso(v.ore, 'ore'))) : campo('Costo orario', conSuffisso(v.orario, '€/h')),
          x.modo === 'anno' ? campo('Nota', v.nota) : null, proposta]);
        aggiorna();
      };
      [v.orario, v.anno, v.ore].forEach(i => i.addEventListener('input', aggiorna));
      disegna();
      let chiudi;
      const salva = async () => {
        const corpo = { idPersona: x.idPersona, dal: v.dal.value };
        if (x.modo === 'anno') { corpo.costoAnno = C.num(v.anno.value); corpo.oreAnno = C.num(v.ore.value); if (v.nota.value.trim()) corpo.nota = v.nota.value.trim(); } else corpo.costoOrario = C.numONull(v.orario.value);
        const r = await lavora('Salvo il costo', () => Rete.post('/server/salvaCostoPersona', corpo));
        if (!r) return;
        chiudi();
        avviso(r.frase || 'Costo salvato', false, 7000);
        rileggiScheda();
      };
      chiudi = finestra({ titolo: 'Nuovo costo', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva il costo')] });
    }

    // ----------------------------------------------------------------- aggiungi e cambia la persona

    /**
     * Aggiungi una persona (finestra a due colonne, fase6.md §12.2): a sinistra lavoro e orario, a destra contatti e
     * dati personali chiusi. Cambiando una scheda si vedono solo i campi che il server ha mandato (i riservati solo a chi li vede).
     */
    function moduloPersona(p0) {
      const p = p0 || { nome: '', rapporto: '', oreSettimana: 40, giorniSettimana: [1, 2, 3, 4, 5] };
      const ha = k => !p0 || Object.prototype.hasOwnProperty.call(p0, k);
      const val = k => (p[k] === null || p[k] === undefined ? '' : String(p[k]));
      const inp = (k, tipo) => h('input', { type: tipo || 'text', value: val(k), autocomplete: 'off' });
      const lavoro = { nome: inp('nome'), ruoloStudio: inp('ruoloStudio'), mansione: inp('mansione'), entrataIl: inp('entrataIl', 'date'), telefonoLavoro: inp('telefonoLavoro'), emailLavoro: inp('emailLavoro', 'email'),
        oreSettimana: h('input', { type: 'text', inputmode: 'decimal', value: p.oreSettimana === null || p.oreSettimana === undefined ? '' : R.numeroCampo(p.oreSettimana) }) };
      const pers = {};
      ['codiceFiscale', 'nascitaLuogo', 'indirizzo', 'cap', 'citta', 'provincia', 'telefonoPersonale', 'emailPersonale', 'iban', 'emergenzaNome', 'emergenzaTelefono'].forEach(k => { if (ha(k)) pers[k] = inp(k); });
      if (ha('nascitaData')) pers.nascitaData = inp('nascitaData', 'date');
      if (ha('contrattoScade')) pers.contrattoScade = inp('contrattoScade', 'date');
      ['ferieAnnueOre', 'permessiAnnuiOre'].forEach(k => { if (ha(k)) pers[k] = h('input', { type: 'text', inputmode: 'decimal', value: p[k] === null || p[k] === undefined ? '' : R.numeroCampo(p[k]) }); });
      const ris = {};
      const vedeRis = p0 ? Object.prototype.hasOwnProperty.call(p0, 'ccnl') && vedeRiservati() : vedeRiservati();
      if (vedeRis) { ris.ccnl = inp('ccnl'); ris.livello = inp('livello'); ris.noteRiservate = h('textarea', { rows: 2 }); ris.noteRiservate.value = val('noteRiservate'); }
      const x = { rapporto: p.rapporto || '', giorni: (p.giorniSettimana || [1, 2, 3, 4, 5]).slice(), contrattoTipo: p.contrattoTipo || '' };
      let errori = {};
      const zona = h('div', { class: 'modulo' });
      const disegna = () => {
        aggiungi(svuota(zona), [
          h('div', { class: 'col' }, h('h3', null, 'Lavoro'), campo('Nome', lavoro.nome, errori.nome),
            h('div', { class: 'campo' }, h('label', null, 'Rapporto con lo studio'), h('div', { class: 'pillole' }, P.RAPPORTI.map(r => h('button', { type: 'button', class: 'pillola piccola' + (x.rapporto === r[0] ? ' scelta' : ''), onclick: () => { x.rapporto = r[0]; disegna(); } }, r[1])))),
            h('div', { class: 'riga-campi' }, campo('Ruolo nello studio', lavoro.ruoloStudio), campo('Entrata', lavoro.entrataIl)),
            campo('Mansione', lavoro.mansione),
            h('h3', null, 'Orario'),
            h('div', { class: 'riga-campi' }, campo('Ore alla settimana', conSuffisso(lavoro.oreSettimana, 'ore'), errori.oreSettimana),
              h('div', { class: 'campo' }, h('label', null, 'In che giorni'), h('div', { class: 'pillole' }, [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Gio'], [5, 'Ven'], [6, 'Sab']].map(gg => h('button', { type: 'button', class: 'pillola piccola' + (x.giorni.indexOf(gg[0]) >= 0 ? ' scelta' : ''),
                onclick: () => { const i = x.giorni.indexOf(gg[0]); if (i >= 0) x.giorni.splice(i, 1); else x.giorni.push(gg[0]); x.giorni.sort(); disegna(); } }, gg[1]))))),
            h('h3', null, 'Contatti di lavoro'), h('div', { class: 'riga-campi' }, campo('Telefono di lavoro', lavoro.telefonoLavoro), campo('Email di lavoro', lavoro.emailLavoro, errori.emailLavoro))),
          h('div', { class: 'col' },
            Object.keys(pers).length ? h('details', { class: 'chiuso-f6', open: !!p0 && Object.keys(errori).some(k => pers[k]) }, h('summary', null, h('span', null, 'Dati personali'), icona('giu', 18, 2.4)),
              h('div', { class: 'fila dentro' },
                pers.codiceFiscale ? campo('Codice fiscale', pers.codiceFiscale, errori.codiceFiscale) : null,
                pers.nascitaData ? h('div', { class: 'riga-campi' }, campo('Nato il', pers.nascitaData), pers.nascitaLuogo ? campo('Nato a', pers.nascitaLuogo) : null) : null,
                pers.indirizzo ? campo('Indirizzo', pers.indirizzo) : null,
                pers.cap ? h('div', { class: 'riga-campi tre' }, campo('CAP', pers.cap, errori.cap), campo('Città', pers.citta), campo('Provincia', pers.provincia)) : null,
                pers.telefonoPersonale ? h('div', { class: 'riga-campi' }, campo('Telefono personale', pers.telefonoPersonale), campo('Email personale', pers.emailPersonale, errori.emailPersonale)) : null,
                pers.iban ? campo('IBAN per i rimborsi', pers.iban, errori.iban) : null,
                pers.emergenzaNome ? h('div', { class: 'riga-campi' }, campo('Contatto di emergenza', pers.emergenzaNome), campo('Il suo telefono', pers.emergenzaTelefono)) : null,
                pers.contrattoScade ? h('div', { class: 'campo' }, h('label', null, 'Contratto'), h('div', { class: 'pillole' }, [['', 'Non scritto']].concat(P.CONTRATTI).map(c => h('button', { type: 'button', class: 'pillola piccola' + (x.contrattoTipo === c[0] ? ' scelta' : ''), onclick: () => { x.contrattoTipo = c[0]; disegna(); } }, c[1])))) : null,
                pers.contrattoScade ? campo('Il contratto finisce il', pers.contrattoScade) : null,
                pers.ferieAnnueOre ? h('div', { class: 'riga-campi' }, campo('Ferie all\'anno', conSuffisso(pers.ferieAnnueOre, 'ore')), campo('Permessi all\'anno', conSuffisso(pers.permessiAnnuiOre, 'ore'))) : null)) : null,
            vedeRis ? h('div', { class: 'riservati-f6' }, h('span', { class: 'etichetta lucchetto-r' }, icona('lucchetto', 14, 2.4), 'Riservati'),
              h('div', { class: 'riga-campi' }, campo('CCNL', ris.ccnl), campo('Livello', ris.livello)), campo('Note riservate', ris.noteRiservate)) : null),
        ]);
      };
      disegna();
      let chiudi;
      const salva = async () => {
        errori = {};
        const nome = lavoro.nome.value.trim();
        if (!nome) errori.nome = 'Nome: scrivi il nome';
        const ore = C.numONull(lavoro.oreSettimana.value);
        if (lavoro.oreSettimana.value.trim() && (ore === null || ore < 1 || ore > 60)) errori.oreSettimana = 'Ore alla settimana: da 1 a 60';
        if (R.erroreEmail(lavoro.emailLavoro.value)) errori.emailLavoro = R.erroreEmail(lavoro.emailLavoro.value);
        if (pers.codiceFiscale && pers.codiceFiscale.value.trim() && !/^[A-Za-z0-9]{16}$/.test(pers.codiceFiscale.value.replace(/\s+/g, ''))) errori.codiceFiscale = 'Codice fiscale: deve avere 16 caratteri';
        if (pers.cap && R.erroreCap(pers.cap.value)) errori.cap = 'CAP: deve avere 5 cifre';
        if (pers.emailPersonale && R.erroreEmail(pers.emailPersonale.value)) errori.emailPersonale = R.erroreEmail(pers.emailPersonale.value);
        if (Object.keys(errori).length) { disegna(); avviso('Mancano dei dati: sono segnati in rosso', true); return; }
        const corpo = { nome, rapporto: x.rapporto, ruoloStudio: lavoro.ruoloStudio.value.trim(), mansione: lavoro.mansione.value.trim(), entrataIl: lavoro.entrataIl.value || '',
          telefonoLavoro: lavoro.telefonoLavoro.value.trim(), emailLavoro: lavoro.emailLavoro.value.trim(), oreSettimana: ore, giorniSettimana: x.giorni };
        Object.keys(pers).forEach(k => { corpo[k] = /AnnueOre|AnnuiOre/.test(k) ? C.numONull(pers[k].value) : pers[k].value.trim(); });
        if (pers.contrattoScade) corpo.contrattoTipo = x.contrattoTipo;
        if (vedeRis) { corpo.ccnl = ris.ccnl.value.trim(); corpo.livello = ris.livello.value.trim(); corpo.noteRiservate = ris.noteRiservate.value.trim(); }
        if (p0) corpo.id = p0.id;
        const r = await lavora('Salvo la persona', () => Rete.post('/server/salvaPersona', { persona: corpo }));
        if (!r) return;
        chiudi();
        M.persone = null;
        await W.ricaricaAnagrafiche().catch(() => null);
        avviso(p0 ? 'Scheda salvata' : 'Persona aggiunta: ' + r.persona.nome);
        if (M.segmento === 'io') { M.io = null; W.disegnaPagina(); return; }
        if (M.segmento !== 'organico') { M.segmento = 'organico'; W.vai('#persone/p/' + r.persona.id); return; }
        W.disegnaPagina();
        apriPersona(r.persona.id);
      };
      chiudi = finestra({ titolo: p0 ? 'Cambia la scheda di ' + p0.nome : 'Aggiungi una persona', larghezza: 'larga', corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, p0 ? 'Salva' : 'Salva la persona')] });
    }

    /** La persona stessa cambia solo i suoi contatti, l'indirizzo, l'IBAN e il contatto di emergenza. */
    function moduloContatti(p) {
      const campi = [['telefonoPersonale', 'Telefono personale'], ['emailPersonale', 'Email personale'], ['indirizzo', 'Indirizzo'], ['cap', 'CAP'], ['citta', 'Città'], ['provincia', 'Provincia'],
        ['iban', 'IBAN per i rimborsi'], ['emergenzaNome', 'Contatto di emergenza'], ['emergenzaTelefono', 'Il suo telefono']].filter(c => Object.prototype.hasOwnProperty.call(p, c[0]));
      const v = {};
      campi.forEach(([k]) => { v[k] = h('input', { type: 'text', value: p[k] || '' }); });
      let chiudi;
      const salva = async () => {
        const corpo = { id: p.id };
        campi.forEach(([k]) => { corpo[k] = v[k].value.trim(); });
        const r = await lavora('Salvo i contatti', () => Rete.post('/server/salvaPersona', { persona: corpo }));
        if (!r) return;
        chiudi();
        avviso('Contatti salvati');
        M.io = null;
        W.disegnaPagina();
      };
      chiudi = finestra({ titolo: 'Cambia i tuoi contatti', corpo: h('div', { class: 'fila' }, campi.map(([k, et]) => campo(et, v[k]))),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')] });
    }

    // ----------------------------------------------------------------- saldo, formazione, visite

    function moduloSaldo(p) {
      let tipo = 'ferie';
      const ieri = P.giorniDopo(oggi().slice(0, 8) + '01', -1);
      const v = { data: h('input', { type: 'date', value: ieri }), ore: h('input', { type: 'text', inputmode: 'decimal' }), nota: h('input', { type: 'text', placeholder: 'Cedolino di ' + P.MESI[Number(ieri.slice(5, 7)) - 1] }) };
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, p.nome), segmenti([['ferie', 'Ferie'], ['permessi', 'Permessi']], tipo, k => { tipo = k; disegna(); }),
        h('div', { class: 'riga-campi' }, campo('Residuo al', v.data), campo('Ore che restano', conSuffisso(v.ore, 'ore'))), campo('Nota', v.nota)]);
      disegna();
      let chiudi;
      const salva = async () => {
        if (!v.ore.value.trim() || C.numONull(v.ore.value) === null) { v.ore.focus(); avviso('Ore: scrivi il residuo del cedolino in ore', true); return; }
        const r = await lavora('Salvo il saldo', () => Rete.post('/server/salvaSaldo', { idPersona: p.id, tipo, data: v.data.value, ore: C.num(v.ore.value), nota: v.nota.value.trim() || v.nota.placeholder }));
        if (!r) return;
        chiudi();
        avviso('Saldo aggiornato dal cedolino');
        rileggiScheda();
      };
      chiudi = finestra({ titolo: 'Aggiorna dal cedolino', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva il saldo')] });
    }

    async function moduloQualifica(p, q0) {
      if (!M.tipi) { const r = await lavora('Leggo i tipi', () => Rete.get('/server/qualificheTipi')); if (!r) return; M.tipi = (r.tipi || []).filter(t => t.attivo !== false); }
      const x = { tipo: q0 ? q0.tipo : (M.tipi[0] && M.tipi[0].chiave) };
      const v = { titolo: h('input', { type: 'text', value: q0 ? q0.titolo || '' : '' }), data: h('input', { type: 'date', value: q0 ? '' : oggi() }), scade: h('input', { type: 'date' }), ente: h('input', { type: 'text', value: q0 ? q0.ente || '' : '' }) };
      const rinnovo = !!q0;
      const proponi = () => { const t = M.tipi.find(y => y.chiave === x.tipo); if (t && t.ogniMesi && v.data.value) v.scade.value = P.piuMesi(v.data.value, t.ogniMesi); else if (t && !t.ogniMesi) v.scade.value = ''; };
      v.data.addEventListener('change', proponi);
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [
        rinnovo ? h('p', { class: 'testo-forte' }, q0.nome + ' · ' + q0.statoVisto + (q0.statoDettaglio ? ' ' + q0.statoDettaglio : '')) : campo('Che cosa', selezione(M.tipi.map(t => [t.chiave, t.nome]), x.tipo, k => { x.tipo = k; proponi(); })),
        campo('Dettaglio', v.titolo), h('div', { class: 'riga-campi' }, campo(rinnovo ? 'Rinnovata il' : 'Data', v.data), campo('Scade il', v.scade)), campo('Ente', v.ente)]);
      disegna();
      proponi();
      let chiudi;
      const salva = async () => {
        if (!v.data.value) { v.data.focus(); avviso('Data: scrivi quando l\'ha fatta', true); return; }
        const qual = { idPersona: p.id, tipo: x.tipo, titolo: v.titolo.value.trim(), data: v.data.value, scade: v.scade.value || '', ente: v.ente.value.trim() };
        const r = await lavora('Salvo', () => Rete.post('/server/salvaQualifica', rinnovo ? { qualifica: qual, rinnova: q0.id } : { qualifica: qual }));
        if (!r) return;
        chiudi();
        W.caricaDashboard();
        avviso(rinnovo ? 'Rinnovata: la scadenza vecchia è fatta' : 'Salvata');
        rileggiScheda();
      };
      const togli = async () => {
        const ok = await conferma('Togliere ' + q0.nome + '?', 'Esce dalla scheda e la sua scadenza si toglie.', 'Togli', true);
        if (!ok) return;
        const r = await lavora('Tolgo', () => Rete.post('/server/togliQualifica', { id: q0.id }));
        if (!r) return;
        chiudi();
        avviso('Tolta', false, null, { testo: 'Annulla', fn: async () => { if (await lavora('Rimetto', () => Rete.post('/server/togliQualifica', { id: q0.id, annulla: true }))) rileggiScheda(); } });
        rileggiScheda();
      };
      chiudi = finestra({ titolo: rinnovo ? 'Rinnova' : 'Aggiungi competenza o formazione', corpo: zona, fuoco: false,
        pulsanti: [rinnovo ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: togli }, 'Togli') : null, 'spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, rinnovo ? 'Rinnova' : 'Salva')].filter(Boolean) });
    }

    function moduloVisita(p, v0) {
      const x = { tipo: v0 ? v0.tipo : 'periodica', giudizio: v0 && v0.giudizio ? v0.giudizio : '' };
      const conGiudizio = vedeRiservati();
      const v = { data: h('input', { type: 'date', value: v0 ? v0.data : oggi() }), prossima: h('input', { type: 'date', value: v0 ? v0.prossima || '' : P.piuMesi(oggi(), 12) }), medico: h('input', { type: 'text', value: v0 ? v0.medico || '' : '' }),
        prescrizioni: h('textarea', { rows: 2 }), validoFino: h('input', { type: 'date', value: v0 ? v0.validoFino || '' : '' }) };
      v.prescrizioni.value = v0 ? v0.prescrizioni || '' : '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, p.nome),
        h('div', { class: 'campo' }, h('label', null, 'Tipo'), h('div', { class: 'pillole' }, P.TIPI_VISITA.map(t => h('button', { type: 'button', class: 'pillola piccola' + (x.tipo === t[0] ? ' scelta' : ''), onclick: () => { x.tipo = t[0]; disegna(); } }, t[1])))),
        h('div', { class: 'riga-campi' }, campo('Il', v.data), campo('Prossima visita', v.prossima)),
        conGiudizio ? h('div', { class: 'campo' }, h('label', null, 'Giudizio'), h('div', { class: 'pillole' }, P.GIUDIZI.map(t => h('button', { type: 'button', class: 'pillola piccola' + (x.giudizio === t[0] ? ' scelta' : ''), onclick: () => { x.giudizio = t[0]; disegna(); } }, t[1])))) : null,
        conGiudizio && x.giudizio === 'idoneo_prescrizioni' ? campo('Prescrizioni', v.prescrizioni) : null,
        conGiudizio && x.giudizio === 'non_idoneo_temporaneo' ? campo('Fino al', v.validoFino) : null,
        campo('Medico', v.medico), h('span', { class: 'regola' }, 'Qui va solo il giudizio del medico, non la diagnosi')]);
      disegna();
      let chiudi;
      const salva = async () => {
        const vis = { idPersona: p.id, data: v.data.value, tipo: x.tipo, prossima: v.prossima.value || '', medico: v.medico.value.trim() };
        if (v0) vis.id = v0.id;
        if (conGiudizio && x.giudizio) { vis.giudizio = x.giudizio; vis.prescrizioni = x.giudizio === 'idoneo_prescrizioni' ? v.prescrizioni.value.trim() : ''; vis.validoFino = x.giudizio === 'non_idoneo_temporaneo' ? v.validoFino.value : ''; }
        const r = await lavora('Salvo la visita', () => Rete.post('/server/salvaVisita', { visita: vis }));
        if (!r) return;
        chiudi();
        W.caricaDashboard();
        avviso('Visita salvata');
        rileggiScheda();
      };
      chiudi = finestra({ titolo: v0 ? 'Visita del ' + dataIt(v0.data) : 'Nuova visita medica', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva la visita')] });
    }

    // ----------------------------------------------------------------- DPI

    /** Consegna un DPI: cosa, taglia, quanti, data, il DPI del catalogo; poi la firma di chi riceve su fondo bianco. */
    async function consegnaDpi(p) {
      let catalogo = [];
      if (puo('mezzi')) { try { catalogo = ((await Rete.get('/server/attrezzature?categoria=dpi&stato=disponibili')).attrezzature || []); } catch (e) { catalogo = []; } }
      const x = { cosa: P.PROPOSTE_DPI[0], idAttrezzatura: null };
      const v = { cosa: h('input', { type: 'text' }), taglia: h('input', { type: 'text' }), quantita: h('input', { type: 'text', inputmode: 'numeric', value: '1' }), data: h('input', { type: 'date', value: oggi() }) };
      const firma = tavolettaFirma('Ricevuto da ' + p.nome);
      const zona = h('div', { class: 'modulo' });
      const disegna = () => aggiungi(svuota(zona), [
        h('div', { class: 'col' }, h('div', { class: 'campo' }, h('label', null, 'Che cosa'), h('div', { class: 'pillole' }, P.PROPOSTE_DPI.map(c => h('button', { type: 'button', class: 'pillola piccola' + (x.cosa === c ? ' scelta' : ''), onclick: () => { x.cosa = c; x.idAttrezzatura = null; disegna(); } }, c)))),
          x.cosa === 'Altro' ? campo('Cosa', v.cosa) : null,
          catalogo.length ? h('div', { class: 'campo' }, h('label', null, 'DPI del catalogo'), h('div', { class: 'pillole' }, [h('button', { type: 'button', class: 'pillola piccola' + (!x.idAttrezzatura ? ' scelta' : ''), onclick: () => { x.idAttrezzatura = null; disegna(); } }, 'Nessuno')]
            .concat(catalogo.map(a => h('button', { type: 'button', class: 'pillola piccola' + (x.idAttrezzatura === a.id ? ' scelta' : ''), onclick: () => { x.idAttrezzatura = a.id; x.cosa = 'Altro'; v.cosa.value = a.nome; disegna(); } }, a.codice + ' · ' + a.nome))))) : null,
          h('div', { class: 'riga-campi tre' }, campo('Taglia', v.taglia), campo('Quanti', v.quantita), campo('Data', v.data))),
        h('div', { class: 'col' }, firma.el)]);
      disegna();
      let chiudi;
      const salva = async conFirma => {
        if (conFirma && firma.vuota()) { avviso('Firma vuota: firma di nuovo', true); return; }
        const cons = { idPersona: p.id, cosa: x.cosa === 'Altro' ? (v.cosa.value.trim() || 'Altro') : x.cosa, taglia: v.taglia.value.trim(), quantita: Number(v.quantita.value) || 1, data: v.data.value || oggi(),
          idLocale: 'pc-' + Date.now().toString(36) };
        if (x.idAttrezzatura) cons.idAttrezzatura = x.idAttrezzatura;
        const corpo = { consegna: cons };
        if (conFirma) corpo.firma = { base64: firma.base64(), mime: 'image/png' };
        const r = await lavora('Salvo la consegna', () => Rete.post('/server/salvaConsegnaDpi', corpo));
        if (!r) return;
        chiudi();
        avviso(conFirma ? 'Consegna firmata' : 'Consegna salvata: la firma si mette dopo, dal suo telefono');
        rileggiScheda();
      };
      chiudi = finestra({ titolo: 'Consegna un DPI', larghezza: 'media', corpo: zona, fuoco: false,
        pulsanti: [h('button', { type: 'button', class: 'btn testo grande', onclick: () => salva(false) }, 'Firma dopo, dal suo telefono'), 'spazio',
          h('button', { type: 'button', class: 'btn giallo grande', onclick: () => salva(true) }, 'Conferma la firma')] });
    }

    function firmaDopo(p, d) {
      const firma = tavolettaFirma('Ricevuto da ' + p.nome + ' · ' + d.cosa + ' · ' + dataIt(d.data));
      let chiudi;
      const salva = async () => {
        if (firma.vuota()) { avviso('Firma vuota: firma di nuovo', true); return; }
        const r = await lavora('Salvo la firma', () => Rete.post('/server/firmaConsegna', { id: d.id, base64: firma.base64(), mime: 'image/png' }));
        if (!r) return;
        chiudi();
        avviso('Consegna firmata');
        rileggiScheda();
      };
      chiudi = finestra({ titolo: 'Firma la consegna', larghezza: 'media', corpo: firma.el, fuoco: false,
        pulsanti: [scrive() || puo('mezzi', 2) ? h('button', { type: 'button', class: 'btn testo grande', onclick: async () => { chiudi(); const r = await lavora('Segno restituito', () => Rete.post('/server/restituisciDpi', { id: d.id })); if (r) { avviso('Restituito'); rileggiScheda(); } } }, 'Segna restituito') : null,
          'spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Conferma la firma')].filter(Boolean) });
    }

    // ----------------------------------------------------------------- documenti personali

    /** Carica uno o più documenti personali: la categoria si propone dal nome del file (si cambia). */
    async function caricaDocumenti(p) {
      const cats = await lavora('Leggo le categorie', () => categorie());
      if (!cats) return;
      const scelte = ['Contratti di lavoro', 'Cedolini', 'Idoneità sanitarie', 'Attestati e abilitazioni', 'Consegne DPI', 'Documenti personali'].filter(n => idCategoria(cats, n) && (vedeRiservati() || ['Contratti di lavoro', 'Cedolini', 'Idoneità sanitarie', 'Documenti personali'].indexOf(n) < 0));
      const scelto = await W.Archivio.scegliFile('documenti');
      if (!scelto) return;
      const x = { categoria: P.categoriaDaNomeFile(scelto.nome) || scelte[0] };
      if (scelte.indexOf(x.categoria) < 0) x.categoria = scelte[0];
      const titolo = h('input', { type: 'text', value: String(scelto.nome || '').replace(/\.[a-z0-9]+$/i, '') });
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, p.nome + ' · ' + scelto.nome), campo('Titolo', titolo),
        h('div', { class: 'campo' }, h('label', null, 'Categoria'), h('div', { class: 'pillole' }, scelte.map(n => h('button', { type: 'button', class: 'pillola piccola' + (x.categoria === n ? ' scelta' : ''), onclick: () => { x.categoria = n; disegna(); } }, n))))]);
      disegna();
      let chiudi;
      const salva = async () => {
        const idFile = 'pc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const r = await lavora('Carico il documento', async () => {
          const c = await W.Archivio.carica(scelto, 'persona', idFile);
          return Rete.post('/server/salvaDocumento', { documento: { titolo: titolo.value.trim() || scelto.nome, idCategoria: idCategoria(cats, x.categoria), origine: 'file', idFile: c.file.id, idPersona: p.id, idLocale: 'pc-' + idFile } });
        });
        if (!r) return;
        chiudi();
        avviso('Documento caricato');
        rileggiScheda();
      };
      chiudi = finestra({ titolo: 'Carica un documento', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Carica')] });
    }

    // ----------------------------------------------------------------- accesso, uscita, anonimizzazione

    function daiAccesso(p) {
      const email = h('input', { type: 'email', value: p.emailLavoro || '', autocomplete: 'off', spellcheck: 'false' });
      let ruolo = 'collaboratore';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, p.nome), campo('Email per entrare', email),
        h('div', { class: 'campo' }, h('label', null, 'Ruolo'), h('div', { class: 'scelte-ruolo' }, ['collaboratore', 'amministrazione', 'lettura', 'titolare'].map(k => h('button', { type: 'button', class: 'scelta-ruolo' + (ruolo === k ? ' scelto' : ''), onclick: () => { ruolo = k; disegna(); } },
          h('span', { class: 'pallino-scelta' }), h('span', { class: 'testi' }, h('b', null, R.RUOLI[k].nome), h('span', null, R.RUOLI[k].frase))))))]);
      disegna();
      const piede = h('div', { class: 'piede-f' });
      let chiudi;
      const vai = async () => {
        if (R.erroreEmail(email.value) || !email.value.trim()) { email.focus(); avviso(email.value.trim() ? R.erroreEmail(email.value) : 'Scrivi l\'email: serve per entrare', true); return; }
        const r = await lavora('Do l\'accesso', () => Rete.post('/server/daiAccesso', { idPersona: p.id, email: email.value.trim(), ruolo }));
        if (!r) return;
        await W.ricaricaAnagrafiche().catch(() => null);
        aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, p.nome + ' entra con ', h('b', null, email.value.trim()), ' e questa password:'), scatolaPassword(r.passwordIniziale || '')]);
        aggiungi(svuota(piede), [h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn giallo grande', onclick: () => chiudi() }, 'Fatto')]);
      };
      aggiungi(piede, [h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Dai l\'accesso')]);
      chiudi = finestra({ contenuto: [h('div', { class: 'testa-f' }, h('h2', null, 'Dai l\'accesso a Wisper'), tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')), h('div', { class: 'corpo-f' }, zona), piede],
        titolo: 'Dai l\'accesso a Wisper', allaChiusura: () => rileggiScheda() });
    }

    async function togliAccesso(p) {
      const ok = await conferma('Togliere l\'accesso a ' + p.nome + '?', 'Non entra più in Wisper da nessun dispositivo. La scheda resta.', 'Togli l\'accesso', true);
      if (!ok) return;
      const r = await lavora('Tolgo l\'accesso', () => Rete.post('/server/salvaUtente', { utente: { id: p.idUtente, attivo: false } }));
      if (!r) return;
      await W.ricaricaAnagrafiche().catch(() => null);
      avviso('Accesso tolto');
      rileggiScheda();
    }

    /** Segna l'uscita: data e motivo, poi l'elenco di cosa succede (dal server) e la conferma. */
    function segnaUscita(p) {
      const v = { data: h('input', { type: 'date', value: oggi() }), motivo: h('input', { type: 'text' }) };
      let chiudi;
      const avanti = async () => {
        if (!v.data.value) { v.data.focus(); avviso('Uscita: scrivi l\'ultimo giorno', true); return; }
        const corpo = { idPersona: p.id, data: v.data.value, motivo: v.motivo.value.trim() };
        const prima = await lavora('Guardo cosa succede', async () => { try { return await Rete.post('/server/segnaUscita', corpo); } catch (e) { if (e.dati && e.dati.serveConferma) return { domanda: e.dati }; throw e; } });
        if (!prima) return;
        chiudi();
        if (!prima.domanda) { avviso('Uscita segnata'); rileggiScheda(); return; }
        const d = prima.domanda.daFare || {};
        const elenco = [d.accesso, (d.daRestituire || []).length ? 'Da restituire: ' + d.daRestituire.map(x => x.nome).join(', ') : '',
          d.assenzeFuture ? (d.assenzeFuture === 1 ? '1 assenza futura si annulla' : d.assenzeFuture + ' assenze future si annullano') : '',
          (d.attivita || []).length ? 'Attività da riassegnare: ' + d.attivita.join(', ') : d.attivitaFuture ? d.attivitaFuture + ' attività restano senza nessuno' : '',
          (d.ticket || []).length ? 'Ticket che tornano aperti: ' + d.ticket.join(', ') : '',
          d.scadenzeAperte ? (d.scadenzeAperte === 1 ? '1 scadenza si annulla' : d.scadenzeAperte + ' scadenze si annullano') : '',
          (d.contattiTolti || []).length ? 'Si tolgono subito: ' + d.contattiTolti.join(' e ') : ''].filter(Boolean);
        let chiudi2;
        chiudi2 = finestra({ titolo: 'Segna l\'uscita', fuoco: false, corpo: [h('p', { class: 'testo-forte' }, prima.domanda.frase || ''), h('div', { class: 'scheda righe-calme' }, elenco.map(t => h('span', null, t)))],
          pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi2() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
            const r = await lavora('Segno l\'uscita', () => Rete.post('/server/segnaUscita', Object.assign({}, corpo, { conferma: true })));
            if (!r) return;
            chiudi2();
            await W.ricaricaAnagrafiche().catch(() => null);
            avviso('Uscita segnata');
            M.uscite = null;
            rileggiScheda();
          } }, 'Segna l\'uscita')] });
      };
      chiudi = finestra({ titolo: 'Segna l\'uscita di ' + p.nome, corpo: h('div', { class: 'fila' }, campo('Ultimo giorno', v.data), campo('Motivo', v.motivo)), fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: avanti }, 'Avanti')] });
    }

    async function annullaUscita(p) {
      const ok = await conferma('Annullare l\'uscita?', p.nome + ' torna nell\'organico. L\'accesso a Wisper non torna da solo.', 'Annulla l\'uscita');
      if (!ok) return;
      const r = await lavora('Annullo l\'uscita', () => Rete.post('/server/annullaUscita', { idPersona: p.id }));
      if (r) { avviso('Uscita annullata'); M.uscite = null; rileggiScheda(); }
    }

    async function anonimizza(p) {
      const prima = await lavora('Guardo cosa si toglie', async () => { try { return await Rete.post('/server/anonimizzaPersona', { idPersona: p.id }); } catch (e) { if (e.dati && e.dati.serveConferma) return { domanda: e.dati }; throw e; } });
      if (!prima || !prima.domanda) { if (prima) rileggiScheda(); return; }
      const d = prima.domanda;
      const lista = t => (Array.isArray(t) ? t : [t]).filter(Boolean);
      let chiudi;
      chiudi = finestra({ titolo: 'Rendi anonima la scheda', fuoco: false, corpo: [h('p', { class: 'testo-forte' }, d.frase || 'Non si torna indietro'),
        h('div', { class: 'scheda righe-calme' }, h('b', null, 'Si toglie'), lista(d.siToglie).map(t => h('span', null, typeof t === 'string' ? t : JSON.stringify(t)))),
        h('div', { class: 'scheda righe-calme' }, h('b', null, 'Resta'), lista(d.resta).map(t => h('span', null, typeof t === 'string' ? t : JSON.stringify(t)))),
        d.nomeNuovo ? h('p', null, 'Il nome diventa «' + d.nomeNuovo + '».') : null],
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn grande pericolo', onclick: async () => {
        const r = await lavora('Rendo anonima', () => Rete.post('/server/anonimizzaPersona', { idPersona: p.id, conferma: true }));
        if (!r) return;
        chiudi();
        await W.ricaricaAnagrafiche().catch(() => null);
        avviso('Scheda resa anonima');
        M.uscite = null;
        rileggiScheda();
      } }, 'Rendi anonima')] });
    }

    // ----------------------------------------------------------------- chi ha visto i dati riservati

    function paginaAccessi(pagina, id) {
      aggiungi(pagina, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Indietro', () => W.vai(String(id) === String(idPersonaIo()) && !scrive() ? '#persone/io' : '#persone/p/' + id)), h('span', { class: 'dove' }, 'Persone e risorse umane')),
        h('div', { class: 'testata' }, h('h1', null, 'Chi ha visto i dati riservati'))]);
      conDati(pagina, async () => { M.accessi = await Rete.get('/server/accessiRiservati?idPersona=' + encodeURIComponent(id)); }, () => {
        const r = M.accessi.righe || [];
        aggiungi(pagina, [h('div', { class: 'stretta-820' }, r.length ? h('div', { class: 'scheda righe' }, r.map(x => riga({ sinistra: quadrato(x.azione === 'scaricato' ? 'scarica' : x.azione === 'cambiato' ? 'firma' : x.azione === 'esportato' ? 'importa' : 'occhio'),
          titolo: x.frase, sotto: [x.utente, x.persona, R.quando(x.quando), x.disp].filter(Boolean).join(' · ') }))) : h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Nessuno ha visto i dati riservati.'))]);
      });
    }

    return { vista, M, daRileggere, chiudiPannello, apriPersona, chiediAssenza, consegnaDpi, F6 };
  };
})(window);
