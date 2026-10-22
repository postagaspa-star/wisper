/*
 * L'uscita "XML da completare" (fase4.md §8.3): FatturaPA FPR12 1.2.3 dal
 * modello, con Numero "BOZZA" (non e' un numero fiscale: lo deve mettere il
 * programma, Wisper non ne inventa mai uno), ProgressivoInvio "W15" e il nome
 * del file che dice di non inviarlo. Mai il formato IT..._....xml dei file da
 * trasmettere. Se le regole fiscali non sono confermate, la causale lo dice.
 */
'use strict';

const { scriviFatturaPA } = require('../fatturapa');

const AVVISO_REGOLE = 'Conti da verificare: regole non confermate dal commercialista';

/** "Bozza W-15 Rossi Impianti Srl - non inviare.xml" (senza i caratteri che un nome di file non vuole). */
function nomeFile(modello) {
  const chi = (modello.committente && (modello.committente.denominazione ||
    [modello.committente.nome, modello.committente.cognome].filter(Boolean).join(' '))) || 'cliente';
  const pulito = s => String(s).replace(/[\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  return pulito('Bozza ' + modello.riferimento + ' ' + chi).slice(0, 120) + ' - non inviare.xml';
}

function crea(modello) {
  const m = Object.assign({}, modello, {
    causale: (modello.causale || []).concat(modello.regoleConfermate ? [] : [AVVISO_REGOLE]),
  });
  // Un IBAN coperto ("IT…3456", per chi legge e basta) non va nell'XML: meglio nessun IBAN che uno sbagliato.
  if (m.pagamento) {
    m.pagamento = Object.assign({}, m.pagamento, {
      dettagli: (m.pagamento.dettagli || []).map(d => (String(d.iban || '').indexOf('…') >= 0 ? Object.assign({}, d, { iban: '' }) : d)),
    });
  }
  const xml = scriviFatturaPA(m, { numero: 'BOZZA', progressivo: String(modello.riferimento || '').replace(/[^A-Za-z0-9]/g, '') });
  return { nome: nomeFile(modello), mime: 'application/xml', base64: Buffer.from(xml, 'utf8').toString('base64') };
}

module.exports = { crea, nomeFile, AVVISO_REGOLE };
