/*
 * L'uscita "prospetto" (fase4.md §8.3): tutti i campi della fattura, sezione
 * per sezione, nell'ordine in cui un programma delle fatture li chiede. Funziona
 * con qualunque programma, anche ribattendo a mano: ogni campo ha il suo
 * pulsante "Copia" nelle app, e "testo" e' tutto insieme per "Copia tutto".
 * Il PDF lo fanno le app (prospettoFattura in pc/ui/documenti.js) da questi dati.
 */
'use strict';

const { numeroIt, euroIt, dataIt } = require('../conti');
const { AVVISO_REGOLE } = require('./xml');

const TIPI = { TD01: 'Fattura', TD06: 'Parcella', TD04: 'Nota di credito', TD05: 'Nota di debito', TD02: 'Acconto su fattura', TD03: 'Acconto su parcella' };
const MODALITA = { MP01: 'Contanti', MP02: 'Assegno', MP05: 'Bonifico', MP08: 'Carta di pagamento', MP12: 'RIBA', MP19: 'SEPA Direct Debit', MP23: 'PagoPA' };
const CASSE = { TC17: 'EPPI', TC04: 'Inarcassa' };

const percento = n => numeroIt(n, 0, 2) + '%';

/** Come si scrive l'IVA di una riga: "22%" oppure "Senza IVA (N1, art. 15)". */
function ivaDi(r) {
  if (r.natura === 'N1') return 'Senza IVA (N1, art. 15)';
  if (r.natura) return 'Senza IVA (' + r.natura + ')';
  return percento(r.aliquotaIva);
}

/**
 * @param m il modello della fattura (fatture.js, modelloFattura)
 * @return {titolo, avviso, sezioni: [{titolo, campi: [{etichetta, valore}]}], testo}
 */
function crea(m) {
  const c = m.committente || {};
  const sede = c.sede || {};
  const sezioni = [];
  const sezione = (titolo, campi) => sezioni.push({ titolo, campi: campi.filter(x => x && x.valore !== undefined && x.valore !== null && x.valore !== '') });
  const campo = (etichetta, valore) => ({ etichetta, valore: valore === undefined || valore === null ? '' : String(valore) });

  sezione('Cliente', [
    c.denominazione ? campo('Denominazione', c.denominazione) : campo('Nome', c.nome),
    c.denominazione ? null : campo('Cognome', c.cognome),
    campo('Partita IVA', c.partitaIva),
    campo('Codice fiscale', c.codiceFiscale),
    campo('Indirizzo', sede.indirizzo),
    campo('CAP', sede.cap),
    campo('Comune', sede.comune),
    campo('Provincia', sede.provincia),
    campo('Codice destinatario', c.codiceDestinatario),
    campo('PEC', c.pec),
  ]);
  const collegata = (m.fattureCollegate || [])[0];
  sezione('Documento', [
    campo('Tipo', (TIPI[m.tipoDocumento] || 'Documento') + ' (' + m.tipoDocumento + ')'),
    campo(m.numero ? 'Data' : 'Data proposta', dataIt(m.data || m.dataProposta)),
    campo('Numero', m.numero || 'lo dà il programma'),
    collegata ? campo('Fattura collegata', collegata.idDocumento + (collegata.data ? ' del ' + dataIt(collegata.data) : '')) : null,
    campo('Causale', (m.causale || []).join(' ')),
  ]);
  const righe = [];
  (m.righe || []).forEach(r => {
    const n = 'Riga ' + r.numero + ' · ';
    righe.push(campo(n + 'Descrizione', r.descrizione));
    righe.push(campo(n + 'Quantità', r.quantita === null || r.quantita === undefined ? '' : numeroIt(r.quantita, 0, 8)));
    if (r.unitaMisura) righe.push(campo(n + 'Unità di misura', r.unitaMisura));
    righe.push(campo(n + 'Prezzo', euroIt(r.prezzoUnitario)));
    righe.push(campo(n + 'Totale', euroIt(r.prezzoTotale)));
    righe.push(campo(n + 'IVA', ivaDi(r)));
    righe.push(campo(n + 'Ritenuta', r.ritenuta ? 'sì' : 'no'));
  });
  sezione('Righe', righe);
  if (m.cassa) {
    sezione('Cassa previdenziale', [
      campo('Cassa', (CASSE[m.cassa.tipo] || 'Cassa') + ' (' + m.cassa.tipo + ')'),
      campo('Aliquota', percento(m.cassa.aliquota)),
      campo('Imponibile', euroIt(m.cassa.imponibile)),
      campo('Importo', euroIt(m.cassa.importo)),
      campo('IVA', m.cassa.natura ? 'Senza IVA (' + m.cassa.natura + ')' : percento(m.cassa.aliquotaIva)),
    ]);
  }
  sezione('Ritenuta', m.ritenuta ? [
    campo('Tipo', m.ritenuta.tipo),
    campo('Aliquota', percento(m.ritenuta.aliquota)),
    campo('Causale', m.ritenuta.causale),
    campo('Importo', euroIt(m.ritenuta.importo)),
  ] : [campo('Ritenuta', c.partitaIva ? 'no' : 'no, è un privato')]);
  sezione('Bollo', m.bollo ? [
    campo('Bollo', m.bollo.virtuale ? 'virtuale' : 'sì'),
    campo('Importo', euroIt(m.bollo.importo)),
    campo('Riaddebitato al cliente', (m.righe || []).some(r => /bollo/i.test(r.descrizione) && r.natura === 'N1') ? 'sì' : 'no'),
  ] : [campo('Bollo', 'no')]);
  sezione('Riepilogo IVA', (m.riepilogo || []).map(r => campo(
    r.natura ? 'Senza IVA (' + r.natura + (r.natura === 'N1' ? ', art. 15' : '') + ')' : 'IVA ' + percento(r.aliquotaIva),
    r.natura ? euroIt(r.imponibile) + (r.riferimentoNormativo ? ' · ' + r.riferimentoNormativo : '')
      : 'imponibile ' + euroIt(r.imponibile) + ' · imposta ' + euroIt(r.imposta))));
  sezione('Totali', [
    campo(m.tipoDocumento === 'TD04' ? 'Totale della nota' : 'Totale della fattura', euroIt(m.totaleDocumento)),
    campo(m.tipoDocumento === 'TD04' ? 'Netto stornato' : 'Netto da incassare', euroIt(m.nettoAPagare)),
  ]);
  const pagamenti = [];
  ((m.pagamento && m.pagamento.dettagli) || []).forEach((p, i, tutti) => {
    const n = tutti.length > 1 ? 'Rata ' + (i + 1) + ' · ' : '';
    pagamenti.push(campo(n + 'Modalità', (MODALITA[p.modalita] || 'Pagamento') + ' (' + p.modalita + ')'));
    pagamenti.push(campo(n + 'Scadenza', dataIt(p.scadenza)));
    pagamenti.push(campo(n + 'Importo', euroIt(p.importo)));
    pagamenti.push(campo(n + 'IBAN', p.iban));
    pagamenti.push(campo(n + 'Banca', p.istituto));
  });
  sezione('Pagamento', pagamenti);

  const avviso = m.regoleConfermate ? '' : AVVISO_REGOLE;
  const righeTesto = [];
  if (avviso) righeTesto.push(avviso, '');
  righeTesto.push('Rif. ' + m.riferimento);
  for (const s of sezioni) {
    righeTesto.push('', s.titolo.toUpperCase());
    for (const x of s.campi) righeTesto.push(x.etichetta + ': ' + x.valore);
  }
  return { titolo: 'Prospetto per il programma delle fatture', avviso, sezioni, testo: righeTesto.join('\n') };
}

module.exports = { crea, TIPI, MODALITA };
