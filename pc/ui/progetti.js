/*
 * Wisper Ufficio: i Progetti (docs/gestionale/progetti.md §4, 03/11/2026, chiesti da Manuel).
 *
 * Cliente -> commessa -> progetto -> rapportino. L'elenco (cerca, Aperti | Chiusi | Tutti), la scheda del progetto
 * (codice, descrizione, a chi è intestato, cliente e commessa che si aprono, Chiudi / Riapri, i suoi rapportini,
 * Nuovo rapportino già con cliente, commessa e progetto, Togli solo senza rapportini), il modulo nuovo / modifica col
 * codice proposto dal server (codiceProgetto) già scritto e cambiabile, e la parte Progetti della scheda commessa.
 * Stesso disegno delle Commesse (commesse.js): niente stile nuovo.
 *
 * I progetti arrivano con le anagrafiche (S.ana.progetti); entrando nella pagina si rileggono (progetti), perché quanti
 * rapportini e quante ore li conta il server.
 */
(function (radice) {
  'use strict';

  radice.WisperProgetti = function (W) {
    const { S, C, B, Rete } = W;
    const RP = radice.WisperRegoleProgetti;
    const { h, aggiungi, svuota, icona, tondo, stato, pillola, avviso, lavora, finestra, conferma, apriMenu, campo, segmenti, cerca, riga, segnaposto } = B;
    const puo = W.puo;

    const M = { letti: false, errore: '', leggendo: null, filtri: { testo: '', stato: 'APERTO' }, schede: {} };
    function daRileggere() { M.letti = false; M.errore = ''; M.schede = {}; }

    const progetti = () => S.ana.progetti || [];
    const trova = id => progetti().find(p => String(p.id) === String(id)) || null;
    const nRapportini = n => (Number(n) === 1 ? '1 rapportino' : (Number(n) || 0) + ' rapportini');
    const codice = (p, grande) => h('span', { class: 'codice progetto' + (grande ? ' grande' : '') }, p.codice || '—');
    const commessaDi = p => W.commessa(p.idCommessa) || null;
    const clienteDi = p => W.cliente(p.idCliente || (commessaDi(p) || {}).idCliente) || null;
    const quanto = p => nRapportini(p.rapportini) + ' · ' + C.ore(Number(p.ore) || 0);

    /** Mette (o rimette) un progetto nell'elenco, con quello che ha risposto il server. */
    function metti(p) {
      if (!p || p.id === undefined) return;
      const l = progetti().slice();
      const i = l.findIndex(x => String(x.id) === String(p.id));
      if (i >= 0) l[i] = Object.assign({}, l[i], p); else l.unshift(p);
      S.ana.progetti = l;
    }

    async function leggi() {
      if (M.leggendo) return M.leggendo;
      M.leggendo = Rete.get('/server/progetti').then(r => {
        S.ana.progetti = r.progetti || [];
        M.letti = true;
        M.errore = '';
      }).catch(e => { if (e && e.accesso !== false) M.errore = e.message || String(e); throw e; }).finally(() => { M.leggendo = null; });
      return M.leggendo;
    }

    // ===================================================================== elenco

    function vista(pagina, a1) {
      if (a1) { scheda(pagina, a1); return; }
      const f = M.filtri;
      const n = RP.conta(progetti());
      const area = h('div', { class: 'sezione' });
      aggiungi(pagina, [
        h('div', { class: 'testata' }, h('div', { class: 'titoli' }, h('h1', null, 'Progetti')),
          puo('progetti', 2) ? h('button', { type: 'button', class: 'btn giallo', onclick: () => modulo(null) }, icona('piu', 18, 2.6), 'Nuovo progetto') : null),
        h('div', { class: 'filtri' },
          segmenti([['APERTO', 'Aperti · ' + n.aperti], ['CHIUSO', 'Chiusi · ' + n.chiusi], ['TUTTI', 'Tutti · ' + n.tutti]], f.stato || 'APERTO', x => { f.stato = x; W.disegnaPagina(); }),
          cerca(f.testo, 'Codice, intestato a, descrizione, commessa', x => { f.testo = x; tabella(area); })),
        area]);
      if (!M.letti) {
        if (M.errore) {
          aggiungi(area, [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, M.errore),
            h('button', { type: 'button', class: 'btn piccolo', onclick: () => { M.errore = ''; W.disegnaPagina(); } }, 'Riprova'))]);
          return;
        }
        aggiungi(area, [segnaposto(3, 64)]);
        leggi().then(() => { if (W.percorso() === 'progetti') W.disegnaPagina(); }).catch(() => { if (W.percorso() === 'progetti') W.disegnaPagina(); });
        return;
      }
      tabella(area);
    }

    const COLONNE = '120px minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1.7fr) 160px';

    function tabella(area) {
      svuota(area);
      const f = M.filtri;
      const lista = RP.filtra(progetti(), f, p => { const m = commessaDi(p); const c = clienteDi(p); return [m ? m.descrizione : '', c ? c.nome : ''].join(' '); });
      if (!lista.length) {
        const vuoto = f.testo ? 'Nessun progetto con questa ricerca.' : f.stato === 'CHIUSO' ? 'Nessun progetto chiuso.' : f.stato === 'TUTTI' ? 'Ancora nessun progetto.' : 'Nessun progetto aperto.';
        aggiungi(area, [h('p', { class: 'vuoto' }, vuoto)]);
        return;
      }
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: COLONNE } },
        h('span', null, 'Codice'), h('span', null, 'Descrizione'), h('span', null, 'Intestato a'), h('span', null, 'Cliente · commessa'), h('span', { class: 'n' }, 'Rapportini e ore')));
      lista.forEach(p => {
        const m = commessaDi(p);
        const c = clienteDi(p);
        const apri = () => W.vai('#progetti/' + encodeURIComponent(p.id));
        aggiungi(tab, [h('div', { class: 'r cliccabile alta', style: { gridTemplateColumns: COLONNE }, role: 'button', tabindex: '0', 'data-progetto': p.id,
          onclick: apri, onkeydown: e => { if (e.key === 'Enter') apri(); } },
        h('span', null, codice(p)),
        h('span', { class: 'doppia' }, h('span', { class: 'forte taglia' }, p.descrizione), String(p.stato).toUpperCase() === 'CHIUSO' ? h('span', null, 'Chiuso') : null),
        h('span', { class: 'taglia t2' }, p.intestatoA || '—'),
        h('span', { class: 'doppia' }, h('span', null, c ? c.nome : (p.idCliente || '')), h('span', null, p.idCommessa + (m ? ' · ' + m.descrizione : ''))),
        h('span', { class: 'n t2' }, quanto(p)))]);
      });
      aggiungi(area, [tab]);
    }

    // ===================================================================== scheda

    function scheda(contenitore, id) {
      const giaLetta = M.schede[id];
      if (!giaLetta) {
        M.schede[id] = 'leggo';
        Rete.get('/server/progetto?id=' + encodeURIComponent(id)).then(r => {
          M.schede[id] = 'letta';
          metti(r.progetto);
          // I rapportini del progetto entrano nell'elenco di sempre (il pannello si apre da lì).
          (r.rapportini || []).forEach(x => {
            const i = S.rapportini.findIndex(y => (x.id && y.id === x.id) || (x.idLocale && y.idLocale === x.idLocale));
            if (i >= 0) S.rapportini[i] = x; else S.rapportini.unshift(x);
          });
          if (W.percorso() === 'progetti/' + id) W.ridisegna();
        }).catch(e => {
          M.schede[id] = 'errore';
          if (e && e.accesso === false) return;
          if (W.percorso() === 'progetti/' + id) { avviso(e.message || String(e), true); W.ridisegna(); }
        });
      }
      const p = trova(id);
      if (!p) {
        aggiungi(contenitore, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna ai progetti', () => W.vai('#progetti')), h('span', { class: 'dove' }, 'Progetti')),
          M.schede[id] === 'leggo' ? segnaposto(3, 80) : h('p', { class: 'vuoto' }, 'Progetto non trovato.')]);
        return;
      }
      const m = commessaDi(p);
      const c = clienteDi(p);
      const chiuso = String(p.stato).toUpperCase() === 'CHIUSO';
      const scrive = puo('progetti', 2);
      const rapportini = C.ordina(S.rapportini.filter(r => r.stato !== 'ANNULLATO' && r.idProgetto !== null && r.idProgetto !== undefined && String(r.idProgetto) === String(p.id)), 'data', -1);
      const puoRapportino = puo('rapportini', 2) && !chiuso && W.funzioneAccesa('rapportini');
      const senzaRapportini = !(Number(p.rapportini) > 0) && !rapportini.length;

      const altro = scrive && senzaRapportini ? h('button', { type: 'button', class: 'tondo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 20)) : null;
      if (altro) altro.addEventListener('click', () => apriMenu(altro, [{ testo: 'Togli', fn: () => togliProgetto(p), pericolo: true }]));
      const giallo = puoRapportino ? 'rapportino' : scrive ? 'modifica' : '';
      const aprire = (testo, hash, permesso) => (permesso ? h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.vai(hash) }, testo) : h('span', { class: 'v' }, testo));

      aggiungi(contenitore, [
        h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna ai progetti', () => W.vai('#progetti')), h('span', { class: 'dove' }, 'Progetti')),
        h('div', { class: 'testata in-alto' },
          h('div', { class: 'titoli' },
            h('div', { class: 'pillole-testa' }, codice(p, true), stato(chiuso ? 'CHIUSO' : 'APERTO', true)),
            h('h1', { class: 'titolo-scheda' }, p.descrizione),
            h('span', { class: 'sotto-titolo' }, [c ? c.nome : p.idCliente, p.idCommessa + (m ? ' ' + m.descrizione : '')].filter(Boolean).join(' · '))),
          altro,
          scrive ? h('button', { type: 'button', class: 'btn' + (giallo === 'modifica' ? ' giallo' : ''), onclick: () => modulo(p) }, 'Modifica') : null,
          puoRapportino ? h('button', { type: 'button', class: 'btn giallo', onclick: () => W.moduloRapportino(null, { idCliente: (c && c.id) || p.idCliente, idCommessa: p.idCommessa, idProgetto: p.id }) },
            icona('piu', 18, 2.6), 'Nuovo rapportino') : null),
        h('div', { class: 'scheda persone-commessa scheda-progetto' },
          h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Intestato a'), h('span', { class: 'v' }, p.intestatoA || '—')),
          // 12/11/2026: dove si lavora e, quando la mappa l'ha calcolata, la strada dallo studio (andata e ritorno).
          h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Dove'), h('span', { class: 'v', 'data-dove': '' }, p.dove ? p.dove + (p.kmStudio ? ' · ' + C.numero(p.kmStudio) + ' km andata e ritorno' : '') : '—')),
          h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Cliente'), c ? aprire(c.nome, '#clienti/' + encodeURIComponent(c.id), puo('clienti')) : h('span', { class: 'v' }, p.idCliente || '—')),
          h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Commessa'), aprire(p.idCommessa + (m ? ' · ' + m.descrizione : ''), '#commesse/' + encodeURIComponent(p.idCommessa), puo('commesse') && !!m)),
          h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Stato'),
            h('span', { class: 'v stato-progetto' }, chiuso ? 'Chiuso' : 'Aperto',
              scrive ? h('button', { type: 'button', class: 'btn piccolo', onclick: () => cambiaStato(p, chiuso ? 'APERTO' : 'CHIUSO') }, chiuso ? 'Riapri' : 'Chiudi') : null))),
        h('div', { class: 'tre-colonne' },
          W.riquadro('Rapportini', String(Math.max(Number(p.rapportini) || 0, rapportini.length)), null),
          W.riquadro('Ore', C.ore(Number(p.ore) || C.totali(rapportini).ore), null),
          W.riquadro('Ultimo rapportino', p.ultimoRapportino ? C.data(p.ultimoRapportino) : '—', null)),
        h('div', { class: 'sezione' }, h('h2', null, 'Rapportini'),
          W.puo('rapportini') ? W.tabellaRapportini(rapportini) : h('p', { class: 'vuoto' }, nRapportini(p.rapportini) + '.'))]);
    }

    async function cambiaStato(p, st) {
      const frasi = {
        CHIUSO: ['Chiudere il progetto?', 'Non si propone più nei rapportini nuovi. I rapportini restano, e si può riaprire.', 'Chiudi'],
        APERTO: ['Riaprire il progetto?', 'Torna fra quelli proposti nei rapportini della sua commessa.', 'Riapri'],
      };
      if (!(await conferma(frasi[st][0], frasi[st][1], frasi[st][2]))) return;
      const prima = p.stato;
      const ris = await lavora(st === 'CHIUSO' ? 'Chiudo il progetto' : 'Riapro il progetto', () => Rete.post('/server/aggiornaProgetto', { id: p.id, campi: { stato: st } }));
      if (!ris) return;
      metti(ris.progetto);
      avviso(st === 'CHIUSO' ? 'Progetto chiuso' : 'Progetto riaperto', false, null, { testo: 'Annulla', fn: async () => {
        const indietro = await lavora('Rimetto com\'era', () => Rete.post('/server/aggiornaProgetto', { id: p.id, campi: { stato: prima } }));
        if (indietro) { metti(indietro.progetto); W.ridisegna(); }
      } });
      W.ridisegna();
    }

    async function togliProgetto(p) {
      if (!(await conferma('Togliere il progetto?', p.codice + ' · ' + p.descrizione + ' sparisce. Si toglie solo un progetto senza rapportini.', 'Togli', true))) return;
      const ris = await lavora('Tolgo il progetto', () => Rete.post('/server/togliProgetto', { id: p.id }));
      if (!ris) return;
      S.ana.progetti = progetti().filter(x => String(x.id) !== String(p.id));
      avviso('Progetto tolto');
      W.vai('#progetti');
    }

    // ===================================================================== la parte Progetti della scheda commessa

    function schedaCommessa(area, m) {
      const lista = progetti().filter(p => String(p.idCommessa).toUpperCase() === String(m.id).toUpperCase())
        .sort((a, b) => (String(a.stato).toUpperCase() === 'CHIUSO') - (String(b.stato).toUpperCase() === 'CHIUSO') || String(b.codice).localeCompare(String(a.codice), 'it', { numeric: true }));
      if (puo('progetti', 2) && !m.archiviata && !m.modello) {
        aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }),
          h('button', { type: 'button', class: 'btn', onclick: () => modulo(null, { idCommessa: m.id }) }, icona('piu', 18, 2.6), 'Nuovo progetto'))]);
      }
      if (!lista.length) { aggiungi(area, [h('p', { class: 'vuoto' }, 'Nessun progetto in questa commessa.')]); return; }
      aggiungi(area, [h('div', { class: 'scheda righe' }, lista.map(p => riga({
        sinistra: codice(p), titolo: p.descrizione,
        sotto: [p.intestatoA ? 'Intestato a ' + p.intestatoA : '', quanto(p)].filter(Boolean).join(' · '),
        destra: stato(String(p.stato).toUpperCase() === 'CHIUSO' ? 'CHIUSO' : 'APERTO'),
        onclick: () => W.vai('#progetti/' + encodeURIComponent(p.id)), attr: { 'data-progetto': p.id },
      })))]);
    }

    // ===================================================================== modulo nuovo / modifica

    /**
     * Il modulo del progetto: Commessa, Codice (quello proposto già scritto, cambiabile), Intestato a (sempre visibile,
     * facoltativo, coi nomi già usati per quel cliente), Descrizione. La commessa si cambia solo finché il progetto non ha
     * rapportini. opzioni: idCommessa (già messa, dalla commessa o dal rapportino), fissa (la commessa non si cambia),
     * senzaServer (per un rapportino su una commessa nuova: torna i dati e basta, il progetto lo crea il server col
     * rapportino), dopo(progetto) al posto di aprire la scheda.
     */
    function modulo(esistente, opzioni) {
      const o = opzioni || {};
      const p = esistente || {};
      const conRapportini = !!esistente && Number(p.rapportini) > 0;
      const idIniziale = p.idCommessa || o.idCommessa || '';
      const commesse = S.ana.commesse.filter(m => !m.modello && ((m.stato === 'APERTA' && !m.archiviata) || m.id === idIniziale))
        .sort((a, b) => String(b.id).localeCompare(String(a.id), 'it', { numeric: true }));
      const nomeCliente = m => (W.cliente(m.idCliente) || { nome: m.idCliente || '' }).nome;
      const v = {
        commessa: h('select', { disabled: conRapportini || !!o.fissa || !!o.senzaServer },
          [h('option', { value: '' }, o.senzaServer ? (o.nomeCommessa || 'Commessa nuova') : 'Scegli la commessa')].concat(commesse.map(m =>
            h('option', { value: m.id, selected: m.id === idIniziale }, m.id + ' · ' + m.descrizione + ' · ' + nomeCliente(m))))),
        codice: h('input', { type: 'text', value: p.codice || (o.dati && o.dati.codice) || '', autocomplete: 'off', maxlength: '60' }),
        intestato: h('input', { type: 'text', value: p.intestatoA || (o.dati && o.dati.intestatoA) || '', autocomplete: 'off' }),
        // 12/11/2026: dove si lavora (di solito la sede di chi è Intestato a): da qui i km dallo studio (km.md).
        dove: h('input', { type: 'text', value: p.dove || (o.dati && o.dati.dove) || '', autocomplete: 'off', maxlength: '300', placeholder: 'Via, numero e comune' }),
        descrizione: h('input', { type: 'text', value: p.descrizione || (o.dati && o.dati.descrizione) || '' }),
      };
      let errori = {};
      let toccato = !!esistente || !!(o.dati && o.dati.codice);
      let proposto = '';
      let giro = 0;
      const idLocale = 'U-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const zona = h('div', { class: 'fila', style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
      const zonaNomi = h('div');

      const clienteScelto = () => {
        const m = W.commessa(v.commessa.value);
        return m ? m.idCliente : (o.idCliente || '');
      };
      const disegnaNomi = () => {
        const nomi = RP.intestatiDelCliente(progetti().filter(x => String(x.id) !== String(p.id)), clienteScelto(), 4)
          .filter(n => n.toLowerCase() !== v.intestato.value.trim().toLowerCase());
        aggiungi(svuota(zonaNomi), nomi.length ? [h('div', { class: 'pillole' }, nomi.map(n => h('button', { type: 'button', class: 'pillola', onclick: () => { v.intestato.value = n; disegnaNomi(); doveDaIntestato(); } }, n)))] : []);
      };
      /** Il codice che propone il server per la commessa scelta: già scritto nel campo, finché non lo cambia la persona. */
      const proponi = async () => {
        if (esistente) return;
        const id = v.commessa.value;
        const mio = ++giro;
        if (!id && !o.senzaServer) { if (!toccato) v.codice.value = ''; proposto = ''; return; }
        try {
          // Commessa nuova (nasce col rapportino): il cliente e il codice che avrà la commessa, se si sanno.
          const r = await Rete.get(o.senzaServer
            ? '/server/codiceProgetto?idCliente=' + encodeURIComponent(o.idCliente || '') + '&idCommessa=' + encodeURIComponent(o.codiceCommessa || '')
            : '/server/codiceProgetto?idCommessa=' + encodeURIComponent(id));
          if (mio !== giro) return;
          if (!toccato || v.codice.value.trim() === proposto) { v.codice.value = r.codice || ''; toccato = false; }
          proposto = r.codice || '';
        } catch (e) { /* senza proposta il campo resta com'è */ }
      };
      v.codice.addEventListener('input', () => { toccato = v.codice.value.trim() !== proposto; if (errori.codice) { delete errori.codice; disegna(); v.codice.focus(); } });
      // Lo stesso Intestato a di un altro progetto: lo stesso posto. Il Dove si riempie da solo finché non lo cambia la persona.
      let doveAuto = '';
      const doveDaIntestato = () => {
        if (v.dove.value.trim() && v.dove.value !== doveAuto) return;
        const d = RP.doveDiIntestato(progetti(), v.intestato.value, p.id);
        if (d || doveAuto) { v.dove.value = d; doveAuto = d; }
      };
      v.intestato.addEventListener('input', () => { disegnaNomi(); doveDaIntestato(); });
      v.descrizione.addEventListener('input', () => { if (errori.descrizione) { delete errori.descrizione; disegna(); v.descrizione.focus(); } });
      v.commessa.addEventListener('change', () => { delete errori.commessa; disegna(); disegnaNomi(); proponi(); });

      const disegna = () => aggiungi(svuota(zona), [
        campo('Commessa', v.commessa, errori.commessa),
        campo('Codice', v.codice, errori.codice),
        h('div', null, campo('Intestato a', v.intestato), zonaNomi),
        campo('Dove', v.dove),
        campo('Descrizione', v.descrizione, errori.descrizione)]);
      disegna();
      disegnaNomi();
      proponi();

      let chiudi;
      const salva = async () => {
        errori = {};
        const dati = { codice: v.codice.value.trim(), intestatoA: v.intestato.value.trim(), dove: v.dove.value.trim(), descrizione: v.descrizione.value.trim() };
        if (!o.senzaServer && !v.commessa.value) errori.commessa = 'Scegli la commessa del progetto';
        if (!dati.descrizione) errori.descrizione = 'Scrivi la descrizione del progetto';
        if (esistente && !dati.codice) errori.codice = 'Il codice del progetto non può essere vuoto';
        // Sulla commessa nuova il progetto nasce col rapportino: se Wisper non sa ancora proporre il codice, va scritto ora.
        if (o.senzaServer && !dati.codice && !proposto) errori.codice = 'Scrivi il codice del progetto: dopo i primi due Wisper lo propone da solo';
        if (Object.keys(errori).length) { disegna(); return; }
        // Proposto e non toccato: lo ricalcola il server con la commessa vera (il suo codice può finire nel codice).
        if (o.senzaServer) { dati.proposto = !!proposto && dati.codice === proposto; chiudi(); if (o.dopo) o.dopo(dati); return; }
        let rifiuto = '';
        const ris = await lavora('Salvo il progetto', async () => {
          try {
            if (esistente) {
              const campi = { codice: dati.codice, intestatoA: dati.intestatoA, dove: dati.dove, descrizione: dati.descrizione };
              if (!conRapportini && v.commessa.value !== p.idCommessa) campi.idCommessa = v.commessa.value;
              return await Rete.post('/server/aggiornaProgetto', { id: p.id, campi });
            }
            // Il codice va in codiceProgetto: il server toglie "codice" da ogni richiesta (era il codice d'accesso del foglio).
            return await Rete.post('/server/creaProgetto', { idCommessa: v.commessa.value, codiceProgetto: dati.codice, intestatoA: dati.intestatoA, dove: dati.dove, descrizione: dati.descrizione, idLocale });
          } catch (e) {
            if (e && (e.accesso === false || e.rete || e.permesso === false)) throw e;
            rifiuto = (e && e.message) || String(e);
            return null;
          }
        });
        if (rifiuto) {
          // La frase del server va sotto il campo giusto, così com'è.
          if (/codice/i.test(rifiuto)) errori.codice = rifiuto;
          else if (/descrizione/i.test(rifiuto)) errori.descrizione = rifiuto;
          else if (/commessa/i.test(rifiuto)) errori.commessa = rifiuto;
          else avviso(rifiuto, true);
          disegna();
          return;
        }
        if (!ris || !ris.progetto) return;
        metti(ris.progetto);
        chiudi();
        avviso((esistente ? 'Salvato ' : ris.progetto.giaEsisteva ? 'C\'era già: ' : 'Creato ') + RP.etichetta(ris.progetto));
        if (o.dopo) { o.dopo(ris.progetto); return; }
        if (esistente) W.ridisegna(); else W.vai('#progetti/' + encodeURIComponent(ris.progetto.id));
      };
      chiudi = finestra({
        titolo: esistente ? 'Modifica ' + (p.codice || 'il progetto') : 'Nuovo progetto', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')],
      });
      setTimeout(() => (v.commessa.value || o.senzaServer ? v.descrizione : v.commessa).focus(), 40);
      return chiudi;
    }

    return { vista, modulo, schedaCommessa, daRileggere, leggi, metti, M };
  };
})(window);
