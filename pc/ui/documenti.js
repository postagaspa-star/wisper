/*
 * Wisper Ufficio: i documenti da stampare in PDF.
 *
 * Due documenti:
 *  - il rapportino singolo, impaginato come quello di Pleya (che a chi lo deve
 *    usare piace): intestazione, mittente e cliente affiancati, la commessa, i
 *    dati in griglia, il lavoro, le firme. Gli importi solo se richiesti.
 *  - il riepilogo di un periodo per un cliente: le righe del mese
 *    con i totali, quello da cui si fa la fattura.
 *
 * Sono HTML fisso: il programma lo stampa con una WebView senza script. Il
 * formato della pagina (A4, margini, "Pagina X / Y") lo decide il CSS qui sotto.
 * Ogni testo che viene dal foglio passa da esc(): un cliente che si chiama
 * "<b>Rossi</b>" resta un nome, non diventa grassetto.
 */
(function (radice) {
  'use strict';

  const C = radice.WisperConti || (typeof require === 'function' ? require('./conti.js') : null);

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Testo dentro una stringa CSS ("..."): niente virgolette né a capo che la spezzino. */
  function escCss(s) {
    return String(s || '').replace(/[\\"]/g, '').replace(/[\r\n]+/g, ' ');
  }

  /**
   * L'id di un file dal suo indirizzo: quello di Drive (".../d/<id>/view", il foglio)
   * o quello del server ("/file/<id>", dalla 0.5: per esempio la firma del tecnico).
   */
  function idDaUrl(url) {
    const s = String(url || '');
    const m = s.match(/\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/^\/file\/([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : '';
  }

  function immagine(id, classe) {
    return id ? '<img class="' + classe + '" src="/file/' + encodeURIComponent(id) + '" alt="">' : '';
  }

  // Il simbolo di Wisper, piccolo, accanto al numero di pagina.
  const SIMBOLO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#1B1B1F"/>' +
    [[16, 7.5], [22, 10], [24.5, 16], [22, 22], [16, 24.5], [10, 22], [7.5, 16], [10, 10]].map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="#FFC53D"/>').join('') +
    '<circle cx="16" cy="16" r="3.2" fill="#F2F4F7"/></svg>');

  /**
   * Il formato: A4, Figtree, i grigi di docs/aspetto.md. Niente giallo pieno:
   * si stampa anche in bianco e nero.
   */
  function stile(imp) {
    const piede = [imp.RAGIONE_SOCIALE, imp.PARTITA_IVA ? 'P.IVA ' + imp.PARTITA_IVA : ''].filter(Boolean).join(' · ');
    const carattere = '"Figtree", "Segoe UI", Arial, sans-serif';
    return '<style>' +
      '@font-face { font-family: "Figtree"; src: url("/font/Figtree.ttf") format("truetype"); font-weight: 300 900; font-display: block; }' +
      '@page { size: A4; margin: 14mm 14mm 18mm 14mm;' +
      '  @bottom-left { content: "' + escCss(piede) + '"; font: 500 8.5px ' + carattere + '; color: #8A8A92; }' +
      '  @bottom-right { content: url("' + SIMBOLO + '") "  Pagina " counter(page) " / " counter(pages); font: 500 8.5px ' + carattere + '; color: #8A8A92; } }' +
      '* { box-sizing: border-box; }' +
      'body { margin: 0; font: 500 10.5px/1.45 ' + carattere + '; color: #1B1B1F; }' +
      '.testa { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1B1B1F; padding-bottom: 10px; margin-bottom: 14px; }' +
      '.azienda { font-size: 17px; font-weight: 800; letter-spacing: -0.2px; }' +
      '.tipo { text-align: right; } .tipo .etichetta { font-size: 8.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #5F5F67; }' +
      '.tipo .numero { font-size: 19px; font-weight: 800; letter-spacing: -0.3px; } .tipo .sotto { color: #5F5F67; font-weight: 600; }' +
      '.parti { display: flex; gap: 12px; margin-bottom: 12px; }' +
      '.parte { flex: 1; background: #F4F4F2; border-radius: 8px; padding: 9px 11px; }' +
      '.parte .etichetta, .cella .etichetta, .blocco .etichetta { font-size: 8.5px; font-weight: 700; letter-spacing: .1em; color: #5F5F67; text-transform: uppercase; margin-bottom: 3px; }' +
      '.parte .nome { font-weight: 800; font-size: 12px; }' +
      '.barra { border: 1.5px solid #1B1B1F; border-radius: 8px; padding: 7px 11px; font-weight: 700; font-size: 11.5px; margin-bottom: 12px; }' +
      '.barra .cod { font-family: Consolas, monospace; font-weight: 700; background: #1B1B1F; color: #FFFFFF; border-radius: 4px; padding: 1px 6px; margin-right: 8px; }' +
      '.griglia { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 12px; margin-bottom: 12px; }' +
      '.cella .valore { font-size: 12px; font-weight: 700; }' +
      '.blocco { border: 1px solid #E6E5E1; border-radius: 8px; padding: 9px 11px; margin-bottom: 10px; break-inside: avoid; }' +
      '.blocco .testo { white-space: pre-wrap; font-size: 11px; }' +
      'table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }' +
      'th { font-size: 8.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #5F5F67; text-align: left; border-bottom: 1.5px solid #1B1B1F; padding: 5px 4px; }' +
      'td { border-bottom: 1px solid #EFEEEB; padding: 5px 4px; vertical-align: top; }' +
      'tr { break-inside: avoid; }' +
      '.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }' +
      'tfoot td { font-weight: 800; border-top: 1.5px solid #1B1B1F; border-bottom: none; }' +
      '.conto { margin-left: auto; width: 55%; } .conto td { border: none; padding: 3px 4px; } .conto .tot td { font-size: 13px; font-weight: 800; border-top: 1.5px solid #1B1B1F; padding-top: 6px; }' +
      '.sotto-riga { color: #5F5F67; font-size: 9px; }' +
      '.firme { display: flex; gap: 24px; margin-top: 22px; break-inside: avoid; }' +
      '.firma { flex: 1; } .firma .spazio { height: 62px; display: flex; align-items: flex-end; border-bottom: 1px solid #1B1B1F; }' +
      '.firma img { max-height: 60px; max-width: 100%; } .firma .chi { margin-top: 3px; color: #5F5F67; font-size: 9.5px; }' +
      '.allegati { break-before: page; } .allegati h2 { font-size: 13px; font-weight: 800; margin: 0 0 10px; }' +
      '.foto { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }' +
      '.foto figure { margin: 0; break-inside: avoid; border: 1px solid #E6E5E1; border-radius: 8px; padding: 6px; }' +
      '.foto img { width: 100%; max-height: 330px; object-fit: contain; } .foto figcaption { font-size: 9px; color: #5F5F67; margin-top: 4px; }' +
      // Preventivo e incarico (fase 2): sezioni con il subtotale, voci facoltative e alternative marcate.
      'h3.sez { font-size: 11.5px; font-weight: 800; margin: 14px 0 4px; letter-spacing: -0.1px; }' +
      'table.voci td.desc { width: 52%; } table.voci tfoot td { font-weight: 700; border-top: 1px solid #1B1B1F; }' +
      'tr.fuori td { color: #8A8A92; } tr.fuori td.n { text-decoration: line-through; }' +
      '.segno { display: inline-block; font-size: 8px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border: 1px solid #8A8A92; color: #3F3F46; border-radius: 4px; padding: 0 4px; margin-left: 4px; }' +
      '.articolo { margin-bottom: 10px; break-inside: avoid; } .articolo h3 { font-size: 11.5px; font-weight: 800; margin: 0 0 3px; }' +
      '.articolo .testo { white-space: pre-wrap; font-size: 10.5px; }' +
      '.due-blocchi { display: flex; gap: 12px; } .due-blocchi .blocco { flex: 1; }' +
      '</style>';
  }

  function intestazione(imp, etichetta, numero, sotto) {
    return '<div class="testa"><div class="azienda">' + esc(imp.RAGIONE_SOCIALE || '') + '</div>' +
      '<div class="tipo"><div class="etichetta">' + esc(etichetta) + '</div>' +
      '<div class="numero">' + esc(numero) + '</div><div class="sotto">' + esc(sotto) + '</div></div></div>';
  }

  function mittente(imp) {
    const righe = [
      imp.INDIRIZZO,
      imp.PARTITA_IVA ? 'P.IVA ' + imp.PARTITA_IVA : '',
      [imp.EMAIL, imp.TELEFONO].filter(Boolean).join(' · '),
      imp.PEC ? 'PEC ' + imp.PEC : '',
    ].filter(Boolean);
    return '<div class="parte"><div class="etichetta">Mittente</div><div class="nome">' + esc(imp.RAGIONE_SOCIALE || '') + '</div>' +
      righe.map(r => '<div>' + esc(r) + '</div>').join('') + '</div>';
  }

  function destinatario(nome, righe) {
    return '<div class="parte"><div class="etichetta">Spett.le</div><div class="nome">' + esc(nome) + '</div>' +
      righe.filter(Boolean).map(r => '<div>' + esc(r) + '</div>').join('') + '</div>';
  }

  function cella(etichetta, valore) {
    return '<div class="cella"><div class="etichetta">' + esc(etichetta) + '</div><div class="valore">' + esc(valore) + '</div></div>';
  }

  function pagina(imp, titolo, corpo) {
    return '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>' + esc(titolo) + '</title>' +
      stile(imp) + '</head><body>' + corpo + '</body></html>';
  }

  function righeConto(r) {
    const orePagate = C.num(r.oreLavoro) + (r.pagaViaggio ? C.num(r.oreViaggio) : 0);
    let dettaglioOre = C.ore(orePagate) + ' × ' + C.euro(r.tariffa);
    if (C.num(r.oreExtra) > 0) {
      dettaglioOre += ' + ' + C.ore(r.oreExtra) + ' extra' + (C.num(r.maggExtra) > 0 ? ' (+' + C.numero(r.maggExtra) + '%)' : '');
    }
    return '<table class="conto"><tbody>' +
      '<tr><td>Compenso ore<div class="sotto-riga">' + esc(dettaglioOre) + '</div></td><td class="n">' + esc(C.euro(r.compensoOre)) + '</td></tr>' +
      '<tr><td>Rimborso km<div class="sotto-riga">' +
      esc(r.kmRimborsati ? C.numero(r.km) + ' km × ' + C.numero(r.euroKm) + ' €' : 'non rimborsati') +
      '</div></td><td class="n">' + esc(C.euro(r.rimborsoKm)) + '</td></tr>' +
      '<tr><td>Spese</td><td class="n">' + esc(C.euro(r.spese)) + '</td></tr>' +
      '<tr class="tot"><td>Totale</td><td class="n">' + esc(C.euro(r.totale)) + '</td></tr>' +
      '</tbody></table>';
  }

  /**
   * Il rapportino singolo.
   * opzioni: conImporti (il conto, di solito no: al cliente serve il lavoro), conFoto (gli scontrini in fondo).
   */
  function rapportino(r, ana, opzioni) {
    const o = opzioni || {};
    const imp = ana.impostazioni || {};
    const cliente = (ana.clienti || []).find(c => c.id === r.idCliente) || { nome: r.cliente };
    const commessa = (ana.commesse || []).find(m => m.id === r.idCommessa);
    const stato = C.ETICHETTE_STATO[r.stato] || r.stato;
    let corpo = intestazione(imp, 'Rapportino di lavoro', r.id || 'Rapportino', 'del ' + C.data(r.data) + ' · ' + stato);
    corpo += '<div class="parti">' + mittente(imp) + destinatario(cliente.nome || r.cliente, [
      cliente.indirizzo,
      cliente.partitaIva ? 'P.IVA ' + cliente.partitaIva : '',
      cliente.email,
    ]) + '</div>';
    // La commessa si indica col suo codice (26ST001), come vuole lo studio: la descrizione no.
    corpo += '<div class="barra">' + (r.idCommessa ? '<span class="cod">' + esc(r.idCommessa) + '</span>' : 'Senza commessa') + '</div>';
    corpo += '<div class="griglia">' +
      cella('Data', C.data(r.data)) +
      cella('Tecnico', r.tecnico || imp.TECNICO || '') +
      cella('Luogo', r.luogo || (commessa && commessa.indirizzo) || '—') +
      (r.ticket ? cella('Ticket', r.ticket) : cella('Stato', stato)) +
      cella('Ore di lavoro', C.ore(r.oreLavoro)) +
      cella('Ore extra', C.ore(r.oreExtra)) +
      cella('Ore di viaggio', C.ore(r.oreViaggio)) +
      cella('Chilometri', C.numero(r.km) + ' km') +
      '</div>';
    corpo += '<div class="blocco"><div class="etichetta">Attività svolte</div><div class="testo">' + esc(r.descrizione || '') + '</div></div>';
    if (C.num(r.spese) > 0 || r.noteSpese) {
      corpo += '<div class="blocco"><div class="etichetta">Spese</div><div class="testo">' +
        esc(C.euro(r.spese) + (r.noteSpese ? ' · ' + r.noteSpese : '')) +
        ((r.foto || []).length ? ' · ' + (r.foto.length === 1 ? '1 scontrino' : r.foto.length + ' scontrini') + ' in allegato' : '') +
        '</div></div>';
    }
    // Le note interne non ci vanno MAI: in Pleya si chiamano "non visibili al
    // cliente" e poi finiscono sul foglio stampato.
    if (o.conImporti) corpo += righeConto(r);

    const firmaTecnico = idDaUrl(imp.FIRMA_TECNICO);
    const firmaCliente = r.firma && r.firma.id;
    corpo += '<div class="firme">' +
      '<div class="firma"><div class="spazio">' + immagine(firmaTecnico, 'sig') + '</div>' +
      '<div class="chi">Firma del compilatore · ' + esc(r.tecnico || imp.TECNICO || '') + '</div></div>' +
      '<div class="firma"><div class="spazio">' + immagine(firmaCliente, 'sig') + '</div>' +
      '<div class="chi">Firma per accettazione' + (r.firmatario ? ' · ' + esc(r.firmatario) : '') +
      (r.firmatoIl ? ' · firmato il ' + esc(C.data(r.firmatoIl)) : '') + '</div></div>' +
      '</div>';

    if (o.conFoto && (r.foto || []).length) {
      corpo += '<div class="allegati"><h2>Scontrini · ' + esc(r.id) + '</h2><div class="foto">' +
        r.foto.map((f, i) => '<figure>' + immagine(f.id, '') + '<figcaption>Scontrino ' + (i + 1) +
          (r.noteSpese ? ' · ' + esc(r.noteSpese) : '') + '</figcaption></figure>').join('') +
        '</div></div>';
    }
    return pagina(imp, 'Rapportino ' + (r.id || ''), corpo);
  }

  /**
   * Il riepilogo di un periodo: le righe e i totali, per fare la fattura.
   * destinatario: { nome, righe[] }  (il cliente, per esempio Elettrodinamica)
   * opzioni: conImporti (di solito sì), conFoto
   */
  function riepilogo(lista, ana, intestatario, periodo, opzioni) {
    const o = opzioni || {};
    const imp = ana.impostazioni || {};
    const righe = C.ordina(lista, 'data', 1);
    const t = C.totali(righe);
    let corpo = intestazione(imp, 'Riepilogo rapportini', periodo || '', intestatario.nome + ' · ' +
      (t.n === 1 ? '1 rapportino' : t.n + ' rapportini'));
    corpo += '<div class="parti">' + mittente(imp) + destinatario(intestatario.nome, intestatario.righe || []) + '</div>';

    const conImporti = !!o.conImporti;
    corpo += '<table><thead><tr><th>Data</th><th>N°</th><th>Commessa</th><th>Lavoro svolto</th>' +
      '<th class="n">Lavoro</th><th class="n">Extra</th><th class="n">Viaggio</th><th class="n">Km</th><th class="n">Spese</th>' +
      (conImporti ? '<th class="n">Importo</th>' : '') + '</tr></thead><tbody>';
    righe.forEach(r => {
      corpo += '<tr><td>' + esc(C.data(r.data)) + '</td><td>' + esc(r.id) + '</td>' +
        '<td>' + esc(r.idCommessa || r.commessa || '') +
        (intestatario.mostraCliente ? '<div class="sotto-riga">' + esc(r.cliente) + '</div>' : '') + '</td>' +
        '<td>' + esc(r.descrizione || '') + '</td>' +
        '<td class="n">' + esc(C.numero(r.oreLavoro)) + '</td><td class="n">' + esc(C.numero(r.oreExtra)) + '</td>' +
        '<td class="n">' + esc(C.numero(r.oreViaggio)) + '</td><td class="n">' + esc(C.numero(r.km)) + '</td>' +
        '<td class="n">' + esc(C.num(r.spese) ? C.euro(r.spese) : '') + '</td>' +
        (conImporti ? '<td class="n">' + esc(C.euro(r.totale)) + '</td>' : '') + '</tr>';
    });
    corpo += '</tbody><tfoot><tr><td colspan="4">Totale</td>' +
      '<td class="n">' + esc(C.numero(t.oreLavoro)) + '</td><td class="n">' + esc(C.numero(t.oreExtra)) + '</td>' +
      '<td class="n">' + esc(C.numero(t.oreViaggio)) + '</td><td class="n">' + esc(C.numero(t.km)) + '</td>' +
      '<td class="n">' + esc(C.euro(t.spese)) + '</td>' + (conImporti ? '<td class="n">' + esc(C.euro(t.totale)) + '</td>' : '') +
      '</tr></tfoot></table>';

    if (conImporti) {
      corpo += '<table class="conto"><tbody>' +
        '<tr><td>Ore totali</td><td class="n">' + esc(C.ore(t.ore)) + '</td></tr>' +
        '<tr><td>Compenso ore</td><td class="n">' + esc(C.euro(t.compenso)) + '</td></tr>' +
        '<tr><td>Rimborso km<div class="sotto-riga">' + esc(C.numero(t.km)) + ' km</div></td><td class="n">' + esc(C.euro(t.rimborso)) + '</td></tr>' +
        '<tr><td>Spese</td><td class="n">' + esc(C.euro(t.spese)) + '</td></tr>' +
        '<tr class="tot"><td>Totale</td><td class="n">' + esc(C.euro(t.totale)) + '</td></tr>' +
        '</tbody></table>';
    }

    if (o.conFoto) {
      const conFoto = righe.filter(r => (r.foto || []).length);
      if (conFoto.length) {
        corpo += '<div class="allegati"><h2>Scontrini</h2><div class="foto">' +
          conFoto.map(r => r.foto.map((f, i) => '<figure>' + immagine(f.id, '') + '<figcaption>' +
            esc(r.id + ' · ' + C.data(r.data) + (r.noteSpese ? ' · ' + r.noteSpese : '') + (r.foto.length > 1 ? ' · ' + (i + 1) : '')) +
            '</figcaption></figure>').join('')).join('') +
          '</div></div>';
      }
    }
    return pagina(imp, 'Riepilogo ' + (periodo || ''), corpo);
  }

  // ======================================================================= preventivo e incarico (fase 2)

  const COMPLESSITA = { bassa: 'Bassa', media: 'Media', alta: 'Alta' };
  const QUANDO_PAGARE = { firma: 'alla firma', avanzamento: 'ad avanzamento dei lavori', fine: 'a fine lavori', data: 'alla data' };

  /** Il numero con la revisione: "PR/2026/012 rev. 1". */
  function numeroPreventivo(p) {
    return (p.numero || 'Preventivo') + (Number(p.revisione) > 0 ? ' rev. ' + p.revisione : '');
  }

  /** Le sezioni con le loro voci, in ordine (accetta anche le voci in un elenco solo, con idSezione). */
  function sezioniDi(p) {
    const ordina = l => (l || []).slice().sort((a, b) => (Number(a.ordine) || 0) - (Number(b.ordine) || 0));
    const sezioni = ordina(p.sezioni).map(s => Object.assign({}, s, { voci: ordina(s.voci) }));
    if (Array.isArray(p.voci) && p.voci.length) {
      sezioni.forEach(s => { s.voci = ordina(p.voci.filter(v => String(v.idSezione) === String(s.id))); });
      const sciolte = ordina(p.voci.filter(v => !sezioni.some(s => String(s.id) === String(v.idSezione))));
      if (sciolte.length) sezioni.push({ id: '', titolo: '', voci: sciolte });
    }
    return sezioni;
  }

  function quantitaVoce(v) {
    const q = C.num(v.quantita === undefined || v.quantita === null || v.quantita === '' ? 1 : v.quantita);
    if (v.modo === 'ore') return C.numero(q) + ' h';
    if (v.modo === 'quantita') return C.numero(q) + (v.unita ? ' ' + v.unita : '');
    return 'a corpo';
  }

  /** La tabella di una sezione: le voci che non contano (facoltative non scelte, alternative scartate) in grigio. */
  function tabellaSezione(s, conti, accettato, contaDi) {
    let righe = '';
    s.voci.forEach(v => {
      const conta = contaDi(v);
      const segni = [];
      if (C.gruppoAlternativa(v)) segni.push(conta ? 'scelta' : 'in alternativa');
      else if (v.facoltativa === true || v.facoltativa === 1) segni.push(conta ? 'facoltativa, compresa' : (accettato ? 'facoltativa, non scelta' : 'facoltativa'));
      const sconto = C.num(v.scontoPercentuale);
      const prezzo = v.modo === 'corpo' || !v.modo ? C.euro(v.prezzo) : C.euro(v.prezzo) + (v.modo === 'ore' ? '/h' : (v.unita ? '/' + v.unita : ''));
      righe += '<tr class="' + (conta ? '' : 'fuori') + '"><td class="desc">' + esc(v.descrizione || '') +
        segni.map(x => '<span class="segno">' + esc(x) + '</span>').join('') + '</td>' +
        '<td class="n">' + esc(quantitaVoce(v)) + '</td><td class="n">' + esc(prezzo) + '</td>' +
        '<td class="n">' + (sconto ? esc('−' + C.numero(sconto) + '%') : '') + '</td>' +
        '<td class="n">' + esc(C.euro(C.importoVoce(v))) + '</td></tr>';
    });
    const sub = conti.perSezione[String(s.id === undefined ? '' : s.id)] || 0;
    return (s.titolo ? '<h3 class="sez">' + esc(s.titolo) + '</h3>' : '') +
      '<table class="voci"><thead><tr><th>Prestazione</th><th class="n">Quantità</th><th class="n">Prezzo</th><th class="n">Sconto</th><th class="n">Importo</th></tr></thead>' +
      '<tbody>' + righe + '</tbody><tfoot><tr><td colspan="4">' + esc(s.titolo ? 'Totale ' + s.titolo.toLowerCase() : 'Totale') + '</td><td class="n">' + esc(C.euro(sub)) + '</td></tr></tfoot></table>';
  }

  function tabellaConto(p, k) {
    const righe = [];
    if (k.sconto > 0) {
      righe.push(['Totale delle prestazioni', k.sommaVoci]);
      if (k.scontoDaPercentuale > 0) righe.push(['Sconto ' + C.numero(p.scontoPercentuale) + '%', -k.scontoDaPercentuale]);
      if (k.scontoEuro > 0) righe.push(['Sconto', -k.scontoEuro]);
    }
    righe.push(['Imponibile', k.imponibile]);
    righe.push(['Contributo integrativo EPPI ' + C.numero(p.eppiPercentuale) + '%', k.contributo]);
    righe.push(['IVA ' + C.numero(p.ivaPercentuale) + '% su ' + C.euro(k.baseIva), k.iva]);
    return '<table class="conto"><tbody>' + righe.map(r => '<tr><td>' + esc(r[0]) + '</td><td class="n">' + esc(C.euro(r[1])) + '</td></tr>').join('') +
      '<tr class="tot"><td>Totale</td><td class="n">' + esc(C.euro(k.totale)) + '</td></tr></tbody></table>';
  }

  function tabellaScadenze(p, k) {
    const lista = p.scadenzePagamento || [];
    if (!lista.length) return '';
    return '<table><thead><tr><th>Pagamento</th><th>Quando</th><th class="n">Quota</th><th class="n">Importo</th></tr></thead><tbody>' +
      lista.map(s => '<tr><td>' + esc(s.descrizione || '') + '</td><td>' + esc(s.quando === 'data' && s.data ? 'il ' + C.data(s.data) : (QUANDO_PAGARE[s.quando] || '')) + '</td>' +
        '<td class="n">' + esc(s.tipo === 'importo' ? '' : C.numero(s.valore) + '%') + '</td>' +
        '<td class="n">' + esc(C.euro(s.importo !== undefined && s.importo !== null && s.importo !== '' ? s.importo : C.importoScadenza(s, k.imponibile))) + '</td></tr>').join('') +
      '</tbody></table>';
  }

  /** "Polizza Compagnia n. 123, massimale 1.000.000 €" e i titoli: li chiede la legge (L. 124/2017). */
  function polizzaETitoli(imp) {
    const polizza = [imp.POLIZZA_COMPAGNIA, imp.POLIZZA_NUMERO ? 'n. ' + imp.POLIZZA_NUMERO : '',
      imp.POLIZZA_MASSIMALE !== undefined && imp.POLIZZA_MASSIMALE !== null && imp.POLIZZA_MASSIMALE !== '' ? 'massimale ' + (typeof imp.POLIZZA_MASSIMALE === 'number' ? C.euro(imp.POLIZZA_MASSIMALE) : imp.POLIZZA_MASSIMALE) : '']
      .filter(Boolean).join(', ');
    return { polizza, titoli: String(imp.TITOLI || '').trim() };
  }

  function clienteDi(p, ana) {
    return (ana.clienti || ana.soggetti || []).find(c => c.id === p.idCliente) || { nome: p.cliente || '' };
  }

  function righeCliente(c, ana, p) {
    const sede = (ana.sedi || []).find(s => String(s.id) === String(p.idSede !== undefined ? p.idSede : p.sedeId));
    const referente = (ana.referenti || []).find(r => String(r.id) === String(p.idReferente !== undefined ? p.idReferente : p.referenteId));
    const indirizzo = [c.indirizzo, [c.cap, c.citta].filter(Boolean).join(' ') + (c.provincia ? ' (' + c.provincia + ')' : '')].filter(x => String(x || '').trim()).join(', ');
    return [indirizzo, c.partitaIva ? 'P.IVA ' + c.partitaIva : (c.codiceFiscale ? 'C.F. ' + c.codiceFiscale : ''),
      c.pec ? 'PEC ' + c.pec : c.email, sede ? 'Presso: ' + sede.nome + (sede.citta ? ', ' + sede.citta : '') : '',
      referente ? 'Alla cortese attenzione di ' + referente.nome : ''];
  }

  function firmeDocumento(p, imp, etichettaStudio) {
    const firmaTecnico = idDaUrl(imp.FIRMA_TECNICO);
    const firmaCliente = p.firma && (p.firma.id || idDaUrl(p.firma.url));
    return '<div class="firme">' +
      '<div class="firma"><div class="spazio">' + immagine(firmaTecnico, 'sig') + '</div>' +
      '<div class="chi">' + esc(etichettaStudio) + ' · ' + esc(imp.TECNICO || imp.RAGIONE_SOCIALE || '') + '</div></div>' +
      '<div class="firma"><div class="spazio">' + immagine(firmaCliente, 'sig') + '</div>' +
      '<div class="chi">Per accettazione' + (p.accettatoDa ? ' · ' + esc(p.accettatoDa) : '') +
      (p.accettatoIl ? ' · il ' + esc(C.data(p.accettatoIl)) : ' · data') + '</div></div></div>';
  }

  /**
   * Il preventivo (docs/gestionale/fase2.md §5): intestazione, cliente, oggetto,
   * complessità, sezioni e voci con gli importi (facoltative e alternative marcate),
   * il conto con il contributo EPPI e l'IVA, le scadenze di pagamento, gli oneri
   * previsti, le condizioni, la validità, polizza e titoli, lo spazio per la firma.
   * Tutto quello che chiede la legge per i professionisti (DL 1/2012 art. 9, L. 124/2017).
   * opzioni: scelte { idVoce: true|false } per mostrare il conto con le scelte del cliente.
   */
  function preventivo(p0, ana, opzioni) {
    const o = opzioni || {};
    const imp = ana.impostazioni || {};
    const sezioni0 = sezioniDi(p0);
    const tutte = C.applicaScelte(sezioni0.reduce((a, s) => a.concat(s.voci.map(v => Object.assign({ idSezione: s.id }, v))), []), o.scelte);
    const sezioni = sezioni0.map(s => Object.assign({}, s, { voci: tutte.filter(v => String(v.idSezione) === String(s.id)) }));
    const p = p0;
    const k = C.contiPreventivo(p, tutte);
    const cliente = clienteDi(p, ana);
    const accettato = p.stato === 'ACCETTATO';
    const validita = p.scadenza ? 'valido fino al ' + C.data(p.scadenza) : '';
    let corpo = intestazione(imp, 'Preventivo', numeroPreventivo(p), ['del ' + C.data(p.data), validita].filter(Boolean).join(' · '));
    corpo += '<div class="parti">' + mittente(imp) + destinatario(cliente.nome || '', righeCliente(cliente, ana, p)) + '</div>';
    corpo += '<div class="barra">Oggetto: ' + esc(p.oggetto || '') + '</div>';
    if (p.introduzione) corpo += '<div class="blocco"><div class="testo">' + esc(p.introduzione) + '</div></div>';
    corpo += '<div class="griglia">' +
      cella('Grado di complessità', COMPLESSITA[p.complessita] || '—') +
      cella('Data', C.data(p.data)) +
      cella('Validità', p.scadenza ? 'fino al ' + C.data(p.scadenza) : '—') +
      cella('Totale', C.euro(k.totale)) +
      '</div>';
    if (p.complessitaNota) corpo += '<div class="blocco"><div class="etichetta">La complessità dell\'incarico</div><div class="testo">' + esc(p.complessitaNota) + '</div></div>';
    const contano = C.vociCheContano(tutte);
    const contaDi = v => contano[tutte.indexOf(v)];
    sezioni.forEach(s => { if (s.voci.length) corpo += tabellaSezione(s, k, accettato, contaDi); });
    corpo += tabellaConto(p, k);
    corpo += '<div class="sotto-riga" style="margin:-6px 0 12px">Importi comprensivi di spese. Contributo integrativo e IVA come indicati; le voci facoltative non scelte e le alternative scartate non sono nel totale.</div>';
    if ((p.scadenzePagamento || []).length) corpo += '<h3 class="sez">Pagamenti</h3>' + tabellaScadenze(p, k);
    const pt = polizzaETitoli(imp);
    corpo += '<div class="due-blocchi">' +
      '<div class="blocco"><div class="etichetta">Oneri ipotizzabili dal conferimento alla conclusione</div><div class="testo">' + esc(p.oneriPrevisti || 'Nessun onere oltre a quelli indicati.') + '</div></div>' +
      '<div class="blocco"><div class="etichetta">Polizza professionale e titoli</div><div class="testo">' + esc(
        (pt.polizza ? 'Polizza: ' + pt.polizza : 'Polizza: —') + '\n' + (pt.titoli || 'Titoli: —')) + '</div></div></div>';
    if (p.condizioni) corpo += '<div class="blocco"><div class="etichetta">Condizioni</div><div class="testo">' + esc(p.condizioni) + '</div></div>';
    if (p.scadenza) corpo += '<div class="blocco"><div class="etichetta">Validità dell\'offerta</div><div class="testo">' + esc('Questa offerta vale fino al ' + C.data(p.scadenza) + '. Dopo l\'accettazione i prezzi non cambiano.') + '</div></div>';
    corpo += firmeDocumento(p, imp, 'Per lo studio');
    return pagina(imp, 'Preventivo ' + numeroPreventivo(p), corpo);
  }

  /**
   * L'incarico professionale, dal preventivo accettato: le parti, l'oggetto, le
   * prestazioni scelte con i loro importi, il compenso, i pagamenti, gli oneri, le
   * condizioni, la polizza e i titoli, e le firme.
   */
  function incarico(p, ana, opzioni) {
    const imp = ana.impostazioni || {};
    const sezioni = sezioniDi(p);
    const voci = sezioni.reduce((a, s) => a.concat(s.voci.map(v => Object.assign({ idSezione: s.id }, v))), []);
    const k = C.contiPreventivo(p, voci);
    const contano = C.vociCheContano(voci);
    const contate = voci.filter((v, i) => contano[i]);
    const cliente = clienteDi(p, ana);
    const pt = polizzaETitoli(imp);
    const MODI = { firma: 'firmato dal cliente', email: 'accettato per email', documento: 'con il documento firmato', voce: 'accettato a voce' };
    let corpo = intestazione(imp, 'Incarico professionale', numeroPreventivo(p),
      ['dal preventivo del ' + C.data(p.data), p.accettatoIl ? 'accettato il ' + C.data(p.accettatoIl) : ''].filter(Boolean).join(' · '));
    corpo += '<div class="parti">' +
      '<div class="parte"><div class="etichetta">Il professionista</div><div class="nome">' + esc(imp.RAGIONE_SOCIALE || '') + '</div>' +
      [imp.TECNICO, imp.INDIRIZZO, imp.PARTITA_IVA ? 'P.IVA ' + imp.PARTITA_IVA : '', imp.PEC ? 'PEC ' + imp.PEC : imp.EMAIL].filter(Boolean).map(r => '<div>' + esc(r) + '</div>').join('') + '</div>' +
      '<div class="parte"><div class="etichetta">Il committente</div><div class="nome">' + esc(cliente.nome || '') + '</div>' +
      righeCliente(cliente, ana, p).filter(Boolean).map(r => '<div>' + esc(r) + '</div>').join('') + '</div></div>';
    let n = 0;
    const articolo = (titolo, html) => '<div class="articolo"><h3>' + (++n) + '. ' + esc(titolo) + '</h3>' + html + '</div>';
    corpo += articolo('Oggetto dell\'incarico', '<div class="testo">' + esc(p.oggetto || '') + (p.introduzione ? '\n' + p.introduzione : '') + '</div>' +
      '<div class="sotto-riga">Grado di complessità: ' + esc((COMPLESSITA[p.complessita] || '—').toLowerCase()) + (p.complessitaNota ? ' · ' + esc(p.complessitaNota) : '') + '</div>');
    corpo += articolo('Prestazioni', '<table class="voci"><thead><tr><th>Prestazione</th><th class="n">Quantità</th><th class="n">Importo</th></tr></thead><tbody>' +
      contate.map(v => '<tr><td class="desc">' + esc(v.descrizione || '') + '</td><td class="n">' + esc(quantitaVoce(v)) + '</td><td class="n">' + esc(C.euro(C.importoVoce(v))) + '</td></tr>').join('') +
      '</tbody></table>');
    corpo += articolo('Compenso', tabellaConto(p, k));
    if ((p.scadenzePagamento || []).length) corpo += articolo('Pagamenti', tabellaScadenze(p, k));
    corpo += articolo('Oneri ipotizzabili', '<div class="testo">' + esc(p.oneriPrevisti || 'Nessun onere oltre a quelli indicati.') + '</div>');
    if (p.condizioni) corpo += articolo('Condizioni', '<div class="testo">' + esc(p.condizioni) + '</div>');
    corpo += articolo('Polizza professionale e titoli', '<div class="testo">' + esc((pt.polizza ? 'Polizza: ' + pt.polizza : 'Polizza: —') + '\n' + (pt.titoli || 'Titoli: —')) + '</div>');
    corpo += '<div class="sotto-riga">L\'incarico riprende il preventivo ' + esc(numeroPreventivo(p)) +
      (p.accettazioneModo ? ', ' + esc(MODI[p.accettazioneModo] || '') : '') + (p.accettatoDa ? ' da ' + esc(p.accettatoDa) : '') + '.</div>';
    corpo += firmeDocumento(p, imp, 'Il professionista');
    return pagina(imp, 'Incarico ' + numeroPreventivo(p), corpo);
  }

  const Documenti = { rapportino, riepilogo, preventivo, incarico, numeroPreventivo, esc, idDaUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = Documenti;
  else radice.WisperDocumenti = Documenti;
})(typeof window !== 'undefined' ? window : globalThis);
