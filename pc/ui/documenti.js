/*
 * Wisper Ufficio: i documenti da stampare in PDF.
 *
 * Due documenti:
 *  - il rapportino singolo, impaginato come quello di Pleya (che a chi lo deve
 *    usare piace): intestazione, mittente e cliente affiancati, la commessa, i
 *    dati in griglia, il lavoro, le firme. Gli importi solo se richiesti.
 *  - il riepilogo di un periodo per un cliente o un gruppo: le righe del mese
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

  function idDaUrl(url) {
    const m = String(url || '').match(/\/d\/([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : '';
  }

  function immagine(id, classe) {
    return id ? '<img class="' + classe + '" src="/file/' + encodeURIComponent(id) + '" alt="">' : '';
  }

  function stile(imp) {
    const piede = [imp.RAGIONE_SOCIALE, imp.PARTITA_IVA ? 'P.IVA ' + imp.PARTITA_IVA : ''].filter(Boolean).join(' · ');
    return '<style>' +
      '@page { size: A4; margin: 14mm 14mm 18mm 14mm;' +
      '  @bottom-left { content: "' + escCss(piede) + '"; font: 8.5px "Segoe UI", Arial, sans-serif; color: #8a8f98; }' +
      '  @bottom-right { content: "Pagina " counter(page) " / " counter(pages); font: 8.5px "Segoe UI", Arial, sans-serif; color: #8a8f98; } }' +
      '* { box-sizing: border-box; }' +
      'body { margin: 0; font: 10.5px/1.45 "Segoe UI", Arial, sans-serif; color: #1d2127; }' +
      '.testa { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1d2127; padding-bottom: 10px; margin-bottom: 14px; }' +
      '.azienda { font-size: 17px; font-weight: 700; }' +
      '.tipo { text-align: right; } .tipo .etichetta { font-size: 9px; letter-spacing: .14em; color: #6b717c; }' +
      '.tipo .numero { font-size: 19px; font-weight: 700; } .tipo .sotto { color: #6b717c; }' +
      '.parti { display: flex; gap: 12px; margin-bottom: 12px; }' +
      '.parte { flex: 1; background: #f3f4f6; border-radius: 6px; padding: 9px 11px; }' +
      '.parte .etichetta, .cella .etichetta, .blocco .etichetta { font-size: 8.5px; letter-spacing: .12em; color: #6b717c; text-transform: uppercase; margin-bottom: 3px; }' +
      '.parte .nome { font-weight: 700; font-size: 12px; }' +
      '.barra { background: #1d2127; color: #fff; border-radius: 6px; padding: 7px 11px; font-weight: 600; margin-bottom: 12px; }' +
      '.barra .cod { color: #ffc53d; margin-right: 6px; }' +
      '.griglia { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 12px; margin-bottom: 12px; }' +
      '.cella .valore { font-size: 12px; font-weight: 600; }' +
      '.blocco { border: 1px solid #e1e4e9; border-radius: 6px; padding: 9px 11px; margin-bottom: 10px; break-inside: avoid; }' +
      '.blocco .testo { white-space: pre-wrap; font-size: 11px; }' +
      'table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }' +
      'th { font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase; color: #6b717c; text-align: left; border-bottom: 1.5px solid #1d2127; padding: 5px 4px; }' +
      'td { border-bottom: 1px solid #e6e8ec; padding: 5px 4px; vertical-align: top; }' +
      'tr { break-inside: avoid; }' +
      '.n { text-align: right; white-space: nowrap; }' +
      'tfoot td { font-weight: 700; border-top: 1.5px solid #1d2127; border-bottom: none; }' +
      '.conto { margin-left: auto; width: 55%; } .conto td { border: none; padding: 3px 4px; } .conto .tot td { font-size: 13px; font-weight: 700; border-top: 1.5px solid #1d2127; padding-top: 6px; }' +
      '.sotto-riga { color: #6b717c; font-size: 9px; }' +
      '.firme { display: flex; gap: 24px; margin-top: 22px; break-inside: avoid; }' +
      '.firma { flex: 1; } .firma .spazio { height: 62px; display: flex; align-items: flex-end; border-bottom: 1px solid #1d2127; }' +
      '.firma img { max-height: 60px; max-width: 100%; } .firma .chi { margin-top: 3px; color: #6b717c; font-size: 9.5px; }' +
      '.allegati { break-before: page; } .allegati h2 { font-size: 13px; margin: 0 0 10px; }' +
      '.foto { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }' +
      '.foto figure { margin: 0; break-inside: avoid; border: 1px solid #e1e4e9; border-radius: 6px; padding: 6px; }' +
      '.foto img { width: 100%; max-height: 330px; object-fit: contain; } .foto figcaption { font-size: 9px; color: #6b717c; margin-top: 4px; }' +
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
      r.gruppo && C.normalizza(r.gruppo) !== 'privato' ? 'Per conto di ' + r.gruppo : '',
    ]) + '</div>';
    corpo += '<div class="barra">' + (r.idCommessa
      ? '<span class="cod">' + esc(r.idCommessa) + '</span>' + esc(r.commessa || (commessa && commessa.descrizione) || '')
      : 'Senza commessa') + '</div>';
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
   * destinatario: { nome, righe[] }  (il cliente, o il gruppo come Elettrodinamica)
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
        '<td>' + esc(r.commessa || '') + (r.idCommessa ? '<div class="sotto-riga">' + esc(r.idCommessa) + '</div>' : '') +
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

  const Documenti = { rapportino, riepilogo, esc, idDaUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = Documenti;
  else radice.WisperDocumenti = Documenti;
})(typeof window !== 'undefined' ? window : globalThis);
