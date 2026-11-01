/*
 * Esportazione per Excel: un CSV che Excel in italiano apre cosi' com'e', con
 * un doppio clic. Per questo: punto e virgola tra le colonne, la virgola nei
 * decimali, le date come 21/10/2026, e il BOM UTF-8 in testa (senza, Excel
 * legge "Città" come "CittÃ ").
 *
 * Le colonne dei soldi ci sono solo per chi ha "costi"; un collaboratore
 * esporta solo i suoi rapportini.
 */
'use strict';

const { Rifiuto, senzaPermesso, testo, oggi, dataOraIso } = require('../utili');
const { togliCosti } = require('../permessi');
const { statoVistoPreventivo } = require('./preventivi');

/** Una cella: i numeri con la virgola, il testo tra virgolette se serve. */
function cella(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Sì' : 'No';
  if (typeof v === 'number') return isFinite(v) ? String(v).replace('.', ',') : '';
  let s = String(v);
  // Una cella che comincia con = + - @ Excel la prende per una formula: con l'apostrofo resta testo.
  if (/^[=+\-@]/.test(s)) s = '\'' + s;
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const data = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
};
const dataOra = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] : data(iso);
};

function csv(colonne, righe) {
  const testa = colonne.map(c => cella(c[0])).join(';');
  const corpo = righe.map(r => colonne.map(c => cella(c[1](r))).join(';'));
  return Buffer.from('﻿' + [testa].concat(corpo).join('\r\n') + '\r\n', 'utf8');
}

/** [intestazione, valore(riga), soloConCosti] */
const COLONNE = {
  rapportini: [
    ['Numero', r => r.id], ['Data', r => data(r.data)], ['Tecnico', r => r.tecnico], ['Codice cliente', r => r.idCliente],
    ['Cliente', r => r.cliente], ['Codice commessa', r => r.idCommessa], ['Commessa', r => r.commessa], ['Ticket', r => r.ticket],
    ['Luogo', r => r.luogo], ['Descrizione', r => r.descrizione], ['Ore lavoro', r => r.oreLavoro], ['Ore extra', r => r.oreExtra],
    ['Ore viaggio', r => r.oreViaggio], ['Ore totali', r => r.oreTotali], ['Km', r => r.km], ['Spese', r => r.spese],
    ['Note spese', r => r.noteSpese], ['Tariffa', r => r.tariffa, true], ['Compenso ore', r => r.compensoOre, true],
    ['Euro al km', r => r.euroKm, true], ['Rimborso km', r => r.rimborsoKm, true], ['Totale', r => r.totale, true],
    ['Costo orario', r => r.costoOrario, true], ['Stato', r => r.stato], ['Firmato da', r => r.firmatario],
    ['Firmato il', r => dataOra(r.firmatoIl)], ['Inviato il', r => dataOra(r.inviatoIl)], ['Fatturato il', r => dataOra(r.fatturatoIl)],
  ],
  soggetti: [
    ['Codice', s => s.id], ['Ragione sociale', s => s.nome], ['Altri nomi', s => s.alias.join(', ')], ['Partita IVA', s => s.partitaIva],
    ['Codice fiscale', s => s.codiceFiscale], ['Codice SDI', s => s.codiceSdi], ['PEC', s => s.pec], ['Email', s => s.email],
    ['Telefono', s => s.telefono], ['Indirizzo', s => s.indirizzo], ['CAP', s => s.cap], ['Città', s => s.citta],
    ['Provincia', s => s.provincia], ['Nazione', s => s.nazione], ['Cliente', s => s.cliente], ['Fornitore', s => s.fornitore],
    ['Tariffa fissa', s => s.tariffaFissa, true], ['Costo fisso', s => s.costoFisso, true], ['Ultima tariffa', s => s.ultimaTariffa, true],
    ['Viaggio pagato', s => s.pagaViaggio], ['Km rimborsati', s => s.kmRimborsati], ['Note', s => s.note], ['Archiviato', s => s.archiviato],
  ],
  commesse: [
    ['Codice', m => m.id], ['Codice cliente', m => m.idCliente], ['Cliente', m => m.nomeCliente], ['Descrizione', m => m.descrizione],
    ['Stato', m => m.stato], ['Indirizzo', m => m.indirizzo], ['Inizio', m => data(m.inizio)], ['Fine prevista', m => data(m.finePrevista)],
    ['Budget ore', m => m.budgetOre], ['Budget euro', m => m.budgetEuro, true], ['Prezzo orario', m => m.prezzoOrario, true],
    ['Costo orario', m => m.costoOrario, true], ['Euro al km', m => m.euroKm, true], ['Importo del contratto', m => m.importoContratto, true],
    ['Responsabile', m => m.nomeResponsabile], ['Codice precedente', m => m.codicePrecedente], ['Note', m => m.note],
    ['Archiviata', m => m.archiviata], ['Modello', m => m.modello],
  ],
  registro: [
    ['Quando', r => dataOra(r.quando)], ['Chi', r => r.utente], ['Dispositivo', r => r.disp], ['Azione', r => r.azione],
    ['Tabella', r => r.tabella], ['Riga', r => r.idRiga], ['Prima', r => (r.prima ? JSON.stringify(r.prima) : '')],
    ['Dopo', r => (r.dopo ? JSON.stringify(r.dopo) : '')], ['Nota', r => r.nota],
  ],
};

// Fase 2: preventivi e attivita'.
COLONNE.preventivi = [
  ['Numero', p => p.riga.numero], ['Revisione', p => p.riga.revisione], ['Data', p => data(p.riga.data)], ['Scadenza', p => data(p.riga.scadenza)],
  ['Stato', p => STATO_A_PAROLE[p.statoVisto] || p.statoVisto], ['Codice cliente', p => p.riga.cliente_id], ['Cliente', p => p.cliente],
  ['Oggetto', p => p.riga.oggetto], ['Complessità', p => p.riga.complessita], ['Imponibile', p => p.conti.imponibile, true],
  ['Contributo integrativo', p => p.conti.contributo, true], ['IVA', p => p.conti.iva, true], ['Totale', p => p.conti.totale, true],
  ['Inviato il', p => dataOra(p.inviatoIl)], ['Accettato il', p => dataOra(p.accettatoIl)], ['Accettato da', p => p.riga.accettato_da],
  ['Come', p => p.riga.accettazione_modo], ['Commessa', p => p.riga.commessa_id], ['Rifiutato il', p => dataOra(p.rifiutatoIl)],
  ['Motivo', p => p.riga.motivo_rifiuto],
];
COLONNE.attivita = [
  ['Giorno', a => data(a.giorno)], ['Titolo', a => a.titolo], ['Tipo', a => a.tipo], ['Stato', a => a.stato.replace('_', ' ')],
  ['Priorità', a => a.priorita], ['Scadenza', a => data(a.scadenza)], ['Inizio', a => dataOra(a.inizio)], ['Fine', a => dataOra(a.fine)],
  ['Assegnata a', a => a.assegnata], ['Cliente', a => a.cliente], ['Commessa', a => a.idCommessa], ['Luogo', a => a.luogo],
  ['Si ripete', a => !!a.ricorrenza], ['Checklist', a => (a.checklist.length ? a.checklist.filter(c => c.fatta).length + '/' + a.checklist.length : '')],
  ['Fatta il', a => dataOra(a.fattaIl)], ['Descrizione', a => a.descrizione],
];
const STATO_A_PAROLE = { BOZZA: 'Bozza', INVIATO: 'Inviato', SCADUTO: 'Scaduto', ACCETTATO: 'Accettato', RIFIUTATO: 'Rifiutato', SOSTITUITO: 'Sostituito' };

// Fase 3: ore, spese, trasferte, rimborsi. L'importo delle spese e i rimborsi sono soldi della persona:
// ci sono anche senza "costi" (un collaboratore esporta solo i suoi); il costo delle ore no.
const STATO_RIGA = { bozza: 'Bozza', da_approvare: 'Da approvare', approvata: 'Approvata', respinta: 'Respinta' };
const A_CHI = { cliente: 'Al cliente', studio: 'Allo studio', personale: 'Mia' };
COLONNE.ore = [
  ['Data', o => data(o.data)], ['Persona', o => o.utente], ['Inizio', o => o.inizio], ['Fine', o => o.fine], ['Pausa (minuti)', o => o.pausaMinuti],
  ['Ore', o => o.ore], ['Codice commessa', o => o.idCommessa], ['Commessa', o => (o.idCommessa ? o.commessa : 'Attività dello studio')],
  ['Cliente', o => o.cliente], ['Prestazione', o => o.prestazione], ['Attività', o => o.attivita], ['Descrizione', o => o.descrizione],
  ['Fatturabile', o => o.fatturabile], ['Tipo', o => o.tipo], ['Costo orario', o => o.costoOrario, true], ['Costo', o => o.costo, true],
  ['Stato', o => STATO_RIGA[o.stato] || o.stato], ['Approvata o respinta da', o => o.approvataDaNome], ['Il', o => dataOra(o.approvataIl)],
  ['Motivo del rifiuto', o => o.motivoRifiuto], ['Dal timer', o => o.dalTimer],
];
COLONNE.spese = [
  ['Data', x => data(x.data)], ['Persona', x => x.utente], ['Categoria', x => x.categoria], ['Descrizione', x => x.descrizione], ['Importo', x => x.importo],
  ['A chi va', x => A_CHI[x.destinazione] || x.destinazione], ['Anticipazione', x => x.anticipazione], ['Pagata da chi l\'ha scritta', x => x.pagataDaMe],
  ['Codice commessa', x => x.idCommessa], ['Commessa', x => x.commessa], ['Codice cliente', x => x.idCliente], ['Cliente', x => x.cliente],
  ['Rapportino', x => x.idRapportino], ['Trasferta', x => x.idTrasferta], ['Scontrino', x => x.foto.length > 0],
  ['Stato', x => STATO_RIGA[x.stato] || x.stato], ['Approvata o respinta da', x => x.approvataDaNome], ['Il', x => dataOra(x.approvataIl)],
  ['Motivo del rifiuto', x => x.motivoRifiuto], ['Rimborsata il', x => dataOra(x.rimborsataIl)], ['Fatturata il', x => dataOra(x.fatturataIl)],
];
COLONNE.trasferte = [
  ['Dal', t => data(t.dal)], ['Al', t => data(t.al)], ['Giorni', t => t.giorni], ['Persona', t => t.utente], ['Destinazione', t => t.destinazione],
  ['Motivo', t => t.motivo], ['Codice commessa', t => t.idCommessa], ['Commessa', t => t.commessa], ['Cliente', t => t.cliente], ['Veicolo', t => t.veicolo],
  ['Km', t => t.km], ['Andata e ritorno', t => t.andataRitorno], ['Km totali', t => t.kmTotali], ['Euro al km', t => t.euroKm],
  ['Rimborso km', t => t.rimborsoKm], ['Indennità', t => t.indennita], ['Totale', t => t.totale], ['Stato', t => STATO_RIGA[t.stato] || t.stato],
  ['Approvata o respinta da', t => t.approvataDaNome], ['Il', t => dataOra(t.approvataIl)], ['Motivo del rifiuto', t => t.motivoRifiuto],
  ['Rimborsata il', t => dataOra(t.rimborsataIl)],
];
COLONNE.rimborsi = [
  ['Persona', v => v.nome], ['Tipo', v => (v.tipo === 'spesa' ? 'Spesa' : 'Trasferta')], ['Data', v => data(v.data)], ['Descrizione', v => v.descrizione],
  ['Codice commessa', v => v.idCommessa], ['Km', v => v.km], ['Importo', v => v.importo],
];

const STATO_FATTURA = { bozza: 'Bozza', pronta: 'Pronta', emessa: 'Emessa', scartata: 'Scartata', annullata: 'Annullata' };
const TIPO_DOC = { TD01: 'Fattura', TD06: 'Parcella', TD04: 'Nota di credito' };
const COLONNE_FASE4 = {
  fatture: [
    ['Riferimento', f => f.riferimento], ['Numero', f => f.numero], ['Data', f => data(f.data)], ['Tipo', f => TIPO_DOC[f.tipoDocumento] || f.tipoDocumento],
    ['Stato', f => f.statoVisto], ['Cliente', f => f.cliente], ['Partita IVA', f => f.partitaIva], ['Commessa', f => f.idCommessa],
    ['Compenso', f => f.conti.compenso], ['Contributo', f => f.conti.contributo], ['IVA', f => f.conti.iva], ['Spese anticipate', f => f.conti.anticipazioni],
    ['Bollo', f => f.conti.bolloAddebitato], ['Totale', f => f.conti.totale], ['Ritenuta', f => f.conti.ritenuta], ['Netto', f => f.conti.netto],
    ['Incassato', f => f.incassato], ['Residuo', f => f.residuo], ['Scadenza', f => data((f.scadenze[0] || {}).data)],
  ],
  ricevute: [
    ['Fornitore', r => r.fornitore], ['Numero', r => r.numero], ['Data', r => data(r.data)], ['Tipo', r => TIPO_DOC[r.tipoDocumento] || r.tipoDocumento],
    ['Categoria', r => r.categoria], ['Commessa', r => r.idCommessa], ['Imponibile', r => r.imponibile], ['IVA', r => r.iva], ['Contributo', r => r.contributo],
    ['Totale', r => r.totale], ['Ritenuta', r => r.ritenuta], ['Netto', r => r.netto], ['Pagato', r => r.pagato], ['Da pagare', r => r.daPagare],
    ['Scadenza', r => data((r.scadenze[0] || {}).data)], ['Stato', r => r.statoVisto], ['Note', r => r.note],
  ],
  daFatturare: [
    ['Codice cliente', v => v.idCliente], ['Cliente', v => v.cliente], ['Cosa', v => ({ scadenza: 'Scadenza di pagamento', rapportino: 'Rapportino', spesa: 'Spesa', ore: 'Ore', ticket: 'Ticket' })[v.tipo]],
    ['Codice', v => v.id], ['Commessa', v => v.idCommessa], ['Data', v => data(v.data)], ['Titolo', v => v.titolo], ['Dettaglio', v => v.dettaglio],
    ['Pronta', v => v.pronta], ['Importo', v => v.importo], ['Spesa anticipata', v => v.anticipazione],
  ],
  riepilogo: [
    ['Chiave', g => g.chiave], ['Nome', g => g.nome], ['Fatture', g => g.fatture], ['Compenso', g => g.compenso], ['Contributo', g => g.contributo],
    ['IVA', g => g.iva], ['Spese anticipate', g => g.anticipazioni], ['Totale', g => g.totale], ['Ritenute', g => g.ritenute], ['Incassato', g => g.incassato],
  ],
  movimenti: [
    ['Data', m => data(m.data)], ['Conto', m => m.conto], ['Entrata o uscita', m => (m.verso === 'entrata' ? 'Entrata' : 'Uscita')], ['Importo', m => m.importo],
    ['Descrizione', m => m.descrizione], ['Chi', m => m.soggetto], ['Categoria', m => m.categoria], ['Verificato in banca', m => m.verificato],
    ['Abbinato a', m => m.abbinamenti.map(a => a.etichetta + ' ' + String(a.importo).replace('.', ',')).join(', ')], ['Annullato', m => m.annullato], ['Motivo', m => m.motivo],
  ],
  scadenziario: [
    ['Giorno', r => data(r.data)], ['Cosa', r => r.titolo], ['Dettaglio', r => r.dettaglio], ['Entrata', r => (r.verso === 'entrata' ? r.importo : null)],
    ['Uscita', r => (r.verso === 'uscita' ? r.importo : null)], ['Saldo previsto', r => r.saldo], ['Stato', r => r.stato], ['Sotto soglia', r => r.sottoSoglia],
  ],
  impegni: [
    ['Scadenza', i => data(i.scadenza)], ['Descrizione', i => i.descrizione], ['Tipo', i => i.tipo], ['Codice', i => i.codice], ['Importo', i => i.importo],
    ['Pagato', i => i.pagato], ['Ripete', i => i.ripete], ['Stato', i => i.statoVisto], ['Conto', i => i.conto], ['Note', i => i.note],
  ],
};

// Fase 5: documenti, scadenze, ticket, contratti (fase5.md §10). [intestazione, valore(riga), soloConCosti]
const ORIGINE = { file: 'File', collegamento: 'Collegamento', inviato: 'Mandato' };
const MODI_TICKET = { ticket: 'Una riga per l\'intervento', separati: 'Con gli altri rapportini', contratto: 'Nel contratto', no: 'Non si fattura' };
const RATE = { annuale: 'Annuale', semestrale: 'Semestrale', trimestrale: 'Trimestrale', mensile: 'Mensile', nessuna: 'Nessuna' };
const COLONNE_FASE5 = {
  documenti: [
    ['Titolo', d => d.titolo], ['Categoria', d => d.categoria], ['Cliente', d => d.cliente], ['Commessa', d => d.idCommessa], ['Impianto', d => d.impianto],
    ['Ticket', d => d.ticket], ['Origine', d => ORIGINE[d.origine] || d.origine], ['Tipo di collegamento', d => d.collegamentoNome],
    ['Indirizzo', d => (d.origine === 'collegamento' ? d.url : '')], ['Revisione valida', d => (d.statoVisto === 'Valida' ? d.revisione : null)],
    ['Stato', d => d.statoVisto], ['Riferimento', d => d.riferimento], ['Data del documento', d => data(d.dataDocumento)],
    ['Scadenza', d => (d.scadenza ? data(d.scadenza.data) : '')], ['Caricato da', d => d.caricatoDa], ['Modificato', d => dataOra(d.modificato)],
  ],
  scadenze: [
    ['Data', s => data(s.data)], ['Titolo', s => s.titolo], ['Tipo', s => s.tipoNome], ['Cliente', s => s.cliente], ['Impianto', s => s.impianto],
    ['Ogni (mesi)', s => s.ogniMesi], ['Stato', s => s.statoVisto], ['Fatta il', s => data(s.fattaIl)], ['Documento', s => s.documento], ['Ticket', s => s.ticket],
  ],
  ticket: [
    ['Numero', t => t.numero], ['Aperto il', t => dataOra(t.apertoIl)], ['Cliente', t => t.cliente], ['Impianto', t => t.impianto], ['Titolo', t => t.titolo],
    ['Tipo', t => t.tipoNome], ['Da dove', t => t.origineNome], ['Priorità', t => t.prioritaNome], ['Stato', t => t.statoVisto], ['Responsabile', t => t.responsabile],
    ['Contratto', t => t.contratto], ['Commessa', t => t.idCommessa], ['Preso il', t => dataOra(t.presoIl)], ['Primo intervento il', t => dataOra(t.interventoIl)],
    ['Risolto il', t => dataOra(t.risoltoIl)], ['Chiuso il', t => dataOra(t.chiusoIl)], ['Ore', t => t.somma.ore], ['Km', t => t.somma.km],
    ['Spese', t => Math.round((t.somma.materiale + t.somma.spese) * 100) / 100], ['Come si fattura', t => MODI_TICKET[t.fatturazione] || ''],
    ['Importo', t => t.somma.importo, true], ['Fatturato il', t => data(t.fatturatoIl)],
  ],
  contratti: [
    ['Numero', c => c.numero], ['Cliente', c => c.cliente], ['Titolo', c => c.titolo], ['Dal', c => data(c.dal)], ['Al', c => data(c.al)],
    ['Rinnovo', c => (c.rinnovo === 'tacito' ? 'Tacito' : 'No')], ['Disdetta entro', c => data(c.disdettaEntro)], ['Stato', c => c.statoVisto],
    ['Canone', c => c.canone, true], ['Come si fattura il canone', c => RATE[c.fatturazioneCanone] || c.fatturazioneCanone],
    ['Copre', c => (c.copre === 'visite_guasti' ? 'Visite e guasti' : 'Solo visite')], ['Impianti', c => c.impianti.map(i => i.nome).join(', ')],
    ['Ticket nell\'anno', c => c.ticket.anno], ['Commessa', c => c.idCommessa],
  ],
};

/**
 * Fase 8 (fase8.md §7.1): gli elenchi che ancora non si esportavano da soli e che Esporta tutto mette nello ZIP:
 * referenti, sedi e impianti, prestazioni delle commesse, lo storico delle comunicazioni. Le righe sono quelle del
 * database (righeDaEsportareFase8 in importa.js).
 */
const CANALI = { email: 'Email', whatsapp: 'WhatsApp', portale: 'Portale', telefonata: 'Telefonata', nota: 'Nota' };
const COLONNE_FASE8 = {
  referenti: [
    ['Codice azienda', r => r.soggetto_id], ['Azienda', r => r.azienda], ['Nome', r => r.nome], ['Ruolo', r => r.ruolo], ['Email', r => r.email],
    ['Telefono', r => r.telefono], ['Note', r => r.note], ['Portale', r => r.portale === 1], ['WhatsApp sì', r => r.whatsapp_ok === 1],
  ],
  sedi: [
    ['Codice azienda', r => r.soggetto_id], ['Azienda', r => r.azienda], ['Tipo', r => (r.tipo === 'impianto' ? 'Impianto' : 'Sede')], ['Nome', r => r.nome],
    ['Indirizzo', r => r.indirizzo], ['CAP', r => r.cap], ['Città', r => r.citta], ['Provincia', r => r.provincia], ['Note', r => r.note], ['Archiviata', r => r.archiviata === 1],
  ],
  prestazioni: [
    ['Commessa', r => r.commessa_id], ['Prestazione', r => r.nome], ['Descrizione', r => r.descrizione], ['Valore', r => r.valore, true],
    ['Avanzamento %', r => r.avanzamento], ['Stato', r => ({ da_fare: 'Da fare', in_corso: 'In corso', fatta: 'Fatta' }[r.stato] || r.stato)],
  ],
  comunicazioni: [
    ['Quando', r => dataOra(r.quando)], ['Canale', r => CANALI[r.canale] || r.canale], ['Verso', r => (r.direzione === 'entrata' ? 'Ricevuta' : 'Mandata')], ['Tipo', r => r.tipo],
    ['Codice cliente', r => r.cliente_id], ['Commessa', r => r.commessa_id], ['Rapportino', r => r.rapportino_id], ['A', r => r.a], ['Oggetto', r => r.oggetto],
    ['Testo', r => r.testo], ['Stato', r => r.stato], ['Mandato il', r => dataOra(r.mandato_il)],
  ],
};

/** Di quale modulo serve almeno la lettura, per ogni cosa da esportare. */
const MODULO = {
  fatture: 'fatturazione', ricevute: 'fatturazione', daFatturare: 'fatturazione', riepilogo: 'fatturazione',
  movimenti: 'banche', scadenziario: 'banche', impegni: 'banche',
  rapportini: 'rapportini', clienti: 'clienti', fornitori: 'clienti', commesse: 'commesse', registro: 'amministrazione',
  preventivi: 'preventivi', attivita: 'attivita',
  ore: 'rapportini', spese: 'spese', trasferte: 'spese', rimborsi: 'spese',
  // Fase 5 (le scadenze: documenti o ticket, lo controlla esporta)
  documenti: 'documenti', scadenze: 'documenti', ticket: 'ticket', contratti: 'ticket',
  // Fase 6
  persone: 'persone', qualifiche: 'persone', assenze: 'persone', presenze: 'persone',
  mezzi: 'mezzi', attrezzature: 'mezzi', tarature: 'mezzi', manutenzioni: 'mezzi', assegnazioni: 'mezzi', km: 'mezzi',
  collaboratori: 'collaboratori', incarichi: 'collaboratori', compensi: 'collaboratori',
  // Fase 8
  referenti: 'clienti', sedi: 'clienti', prestazioni: 'commesse', comunicazioni: 'comunicazioni',
};
/** Fase 6: l'esterno esporta solo le sue cose (rapportini, ore, spese). */
const ESTERNO_ESPORTA = ['rapportini', 'ore', 'spese'];
const NOMI_RAPPORTO = { titolare: 'Titolare', socio: 'Socio', dipendente: 'Dipendente', apprendista: 'Apprendista', tirocinante: 'Tirocinante',
  autonomo: 'A partita IVA nello studio', altro: 'Altro', '': 'Da completare' };

module.exports = {
  esporta(d) {
    const cosa = testo(d.cosa);
    if (!MODULO[cosa]) throw new Rifiuto('Cosa esportare? referenti, sedi, prestazioni, comunicazioni, rapportini, clienti, fornitori, commesse, registro, preventivi, attivita, ore, spese, trasferte, rimborsi, fatture, ricevute, daFatturare, riepilogo, movimenti, scadenziario, impegni, documenti, scadenze, ticket, contratti, persone, qualifiche, assenze, presenze, mezzi, attrezzature, tarature, manutenzioni, assegnazioni, km, collaboratori, incarichi o compensi');
    const puo = cosa === 'scadenze' ? ['documenti', 'ticket', 'persone', 'mezzi', 'collaboratori'].some(m => this.livello(m) >= 1) : this.livello(MODULO[cosa]) >= 1;
    if (!puo || (this.eEsterno() && ESTERNO_ESPORTA.indexOf(cosa) < 0)) throw senzaPermesso('esportare ' + cosa);
    if (cosa === 'compensi' && !this.vedeCosti()) throw senzaPermesso('esportare i compensi (serve il permesso dei soldi)');
    // Fase 6: le esportazioni di persone, mezzi e collaboratori (le colonne dipendono da cosa uno vede).
    if (MODULO[cosa] === 'persone' || MODULO[cosa] === 'mezzi' || MODULO[cosa] === 'collaboratori') {
      const x = this.esportaFase6(cosa, d);
      const periodo6 = testo(d.mese) || [testo(d.da), testo(d.a)].filter(Boolean).join('-') || oggi();
      return { ok: true, nome: 'wisper-' + cosa + '-' + periodo6 + '.csv', mime: 'text/csv;charset=utf-8', righe: x.righe.length, base64: csv(x.colonne, x.righe).toString('base64') };
    }
    // Fase 8: referenti, sedi, prestazioni e comunicazioni (le comunicazioni solo a chi le vede tutte: niente collaboratori, i pagamenti coi soldi).
    if (COLONNE_FASE8[cosa]) {
      if (cosa === 'comunicazioni' && this.soloSuoi()) throw senzaPermesso('esportare le comunicazioni');
      const costi8 = this.vedeCosti();
      let righe8 = this.righeDaEsportareFase8(cosa);
      if (cosa === 'comunicazioni' && !this.vedePagamenti()) righe8 = righe8.filter(r => r.tipo !== 'pagamento' && !r.fattura_id);
      const colonne8 = COLONNE_FASE8[cosa].filter(c => costi8 || !c[2]);
      return { ok: true, nome: 'wisper-' + cosa + '-' + oggi() + '.csv', mime: 'text/csv;charset=utf-8', righe: righe8.length, base64: csv(colonne8, righe8).toString('base64') };
    }
    // Fase 4: fatture e banche si esportano solo col permesso dei soldi.
    if (COLONNE_FASE4[cosa] && !this.vedeCosti()) throw new Rifiuto('Per vedere le fatture serve anche il permesso dei soldi: chiedi al titolare', { permesso: false });
    const costi = this.vedeCosti();
    const scegli = lista => lista.filter(c => costi || !c[2]);
    let colonne;
    let righe;
    if (cosa === 'rapportini') {
      colonne = scegli(COLONNE.rapportini);
      righe = this.leggiRapportini(d.da, d.a, d.tutti === true || d.tutti === '1', { idCliente: d.idCliente, idCommessa: d.idCommessa })
        .sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : (x.id < y.id ? -1 : 1)));
    } else if (cosa === 'clienti' || cosa === 'fornitori') {
      colonne = scegli(COLONNE.soggetti);
      const archiviati = d.archiviati === true || d.archiviati === '1';
      righe = cosa === 'clienti' ? this.leggiClienti({ archiviati }) : this.leggiFornitori({ archiviati });
    } else if (cosa === 'commesse') {
      colonne = scegli(COLONNE.commesse);
      const nomi = {};
      this.soggettiAttivi().forEach(s => { nomi[s.id] = s.nome; });
      const utenti = {};
      this.db.righe('SELECT id, nome FROM utenti').forEach(u => { utenti[u.id] = u.nome; });
      righe = this.leggiCommesse({ archiviati: true, modelli: true }).map(m => Object.assign({}, m, {
        nomeCliente: nomi[m.idCliente] || '', nomeResponsabile: m.responsabileId ? utenti[m.responsabileId] || '' : '',
      }));
    } else if (cosa === 'preventivi') {
      colonne = scegli(COLONNE.preventivi);
      righe = this.elencoPreventivi(d).map(p => Object.assign(p, {
        statoVisto: statoVistoPreventivo(p.riga), inviatoIl: dataOraIso(p.riga.inviato_il),
        accettatoIl: dataOraIso(p.riga.accettato_il), rifiutatoIl: dataOraIso(p.riga.rifiutato_il),
      }));
    } else if (cosa === 'attivita') {
      colonne = COLONNE.attivita;
      righe = this.leggiAttivita(d);
    } else if (cosa === 'ore') {
      colonne = scegli(COLONNE.ore);
      righe = this.leggiOre(d).ore;
    } else if (cosa === 'spese') {
      colonne = COLONNE.spese;
      righe = this.leggiSpese(d).spese.slice().reverse();
    } else if (cosa === 'trasferte') {
      colonne = COLONNE.trasferte;
      righe = this.leggiTrasferte(d).trasferte.slice().reverse();
    } else if (COLONNE_FASE5[cosa]) {
      colonne = scegli(COLONNE_FASE5[cosa]);
      righe = this.righeDaEsportareFase5(cosa, d);
    } else if (COLONNE_FASE4[cosa]) {
      colonne = COLONNE_FASE4[cosa];
      righe = this.righeDaEsportareFase4(cosa, d);
    } else if (cosa === 'rimborsi') {
      colonne = COLONNE.rimborsi;
      righe = [];
      for (const p of this.rimborsi(d).persone) for (const v of p.voci) righe.push(Object.assign({ nome: p.nome }, v));
    } else {
      colonne = COLONNE.registro;
      righe = [];
      for (let pagina = 1; ; pagina++) {
        const p = this.leggiRegistro(Object.assign({}, d, { pagina }));
        righe = righe.concat(p.righe);
        if (pagina >= p.pagine) break;
      }
      // Anche il prima/dopo del registro senza i soldi, per chi non li vede.
      if (!costi) righe = togliCosti(righe);
    }
    const periodo = [testo(d.da), testo(d.a)].filter(Boolean).join('-') || oggi();
    const nome = 'wisper-' + cosa + '-' + periodo + '.csv';
    return { ok: true, nome, mime: 'text/csv;charset=utf-8', righe: righe.length, base64: csv(colonne, righe).toString('base64') };
  },

  /**
   * Fase 6: colonne e righe delle esportazioni di persone, assenze, presenze, mezzi, strumenti e collaboratori
   * (fase6.md §10). I campi personali solo con persone 2, CCNL e livello e i tipi sanitari solo con "riservati" (con la
   * riga "esportato" nel registro di chi apre i dati riservati), i soldi solo con "costi".
   */
  esportaFase6(cosa, d) {
    d = d || {};
    const costi = this.vedeCosti();
    const personali = this.livello('persone') >= 2;
    const riservati = this.livello('riservati') >= 1;
    const siNo = v => !!v;
    if (cosa === 'persone') {
      const tutte = this.db.righe('SELECT * FROM persone ORDER BY nome').filter(p => !p.anonimizzata_il && (!this.soloSuoi() || !p.uscita_il || p.uscita_il >= oggi()));
      const utenti = {};
      this.db.righe('SELECT * FROM utenti').forEach(u => { utenti[u.id] = u; });
      let colonne = [['Nome', p => p.nome], ['Rapporto', p => NOMI_RAPPORTO[p.rapporto] || ''], ['Ruolo nello studio', p => p.ruolo_studio], ['Mansione', p => p.mansione],
        ['Telefono di lavoro', p => p.telefono_lavoro], ['Email di lavoro', p => p.email_lavoro], ['Entrata', p => data(p.entrata_il)], ['Uscita', p => data(p.uscita_il)],
        ['Ore alla settimana', p => p.ore_settimana], ['Accesso a Wisper', p => siNo(p.utente_id && utenti[p.utente_id] && utenti[p.utente_id].attivo === 1)],
        ['Ruolo', p => (p.utente_id && utenti[p.utente_id] ? utenti[p.utente_id].ruolo : '')]];
      if (personali) {
        colonne = colonne.concat([['Codice fiscale', p => p.codice_fiscale], ['Nato il', p => data(p.nascita_data)], ['Nato a', p => p.nascita_luogo], ['Indirizzo', p => p.indirizzo],
          ['CAP', p => p.cap], ['Città', p => p.citta], ['Provincia', p => p.provincia], ['Telefono personale', p => p.telefono_personale], ['Email personale', p => p.email_personale],
          ['IBAN', p => p.iban], ['Contatto di emergenza', p => p.emergenza_nome], ['Telefono di emergenza', p => p.emergenza_telefono], ['Contratto', p => p.contratto_tipo],
          ['Contratto scade il', p => data(p.contratto_scade)]]);
      }
      if (riservati) {
        colonne = colonne.concat([['CCNL', p => p.ccnl], ['Livello', p => p.livello]]);
        tutte.forEach(p => { if (p.ccnl || p.livello) this.registraAccessoRiservato(p.id, 'esportazione', 'esportato', 'persone'); });
      }
      if (costi) colonne.push(['Costo orario', p => { const c = this.costoDiOggi(p.id); return c ? c.costo_orario : null; }]);
      return { colonne, righe: tutte };
    }
    if (cosa === 'qualifiche') {
      const tipi = this.tipiQualifica();
      const nomi = {};
      this.db.righe('SELECT id, nome FROM persone').forEach(p => { nomi[p.id] = p.nome; });
      const righe = this.db.righe('SELECT * FROM qualifiche WHERE tolta IS NULL ORDER BY persona_id, data DESC').filter(q => this.vedeLavoroCompleto(q.persona_id))
        .map(q => Object.assign({ persona: nomi[q.persona_id] || '' }, this.qualificaDaRiga(q, tipi)));
      return { colonne: [['Persona', q => q.persona], ['Qualifica', q => q.nome], ['Dettaglio', q => q.titolo], ['Data', q => data(q.data)], ['Scade', q => data(q.scade)],
        ['Stato', q => q.statoVisto], ['Ente', q => q.ente], ['Ore', q => q.ore]], righe };
    }
    if (cosa === 'assenze') {
      const anno = oggi().slice(0, 4);
      const r = this.leggiAssenze({ da: testo(d.da) || anno + '-01-01', a: testo(d.a) || anno + '-12-31', stato: 'tutte', idPersona: d.idPersona });
      const conTipoSanitario = r.assenze.filter(a => a.tipoSanitario);
      conTipoSanitario.forEach(a => this.registraAccessoRiservato(a.idPersona, 'esportazione', 'esportato', 'assenze'));
      const colonne = [['Persona', a => a.persona], ['Tipo', a => a.tipoVisto], ['Dal', a => data(a.dal)], ['Al', a => data(a.al)], ['Giorni', a => a.giorni], ['Ore', a => a.ore],
        ['Stato', a => a.statoVisto], ['Approvata da', a => a.approvataDaNome], ['Il', a => dataOra(a.approvataIl)], ['Motivo del rifiuto', a => a.motivoRifiuto]];
      if (personali) colonne.push(['Nota', a => a.nota || '']);
      return { colonne, righe: r.assenze };
    }
    if (cosa === 'presenze') {
      const p = this.presenze({ mese: d.mese, idPersona: d.idPersona });
      const righe = [];
      for (const x of p.persone) {
        for (const g of x.giorni) righe.push({ data: data(g.data), persona: x.nome, previste: g.previste, lavorate: g.lavorate, straordinarie: g.straordinarie,
          assenza: g.assenza ? g.assenza.tipoVisto : (g.giorno === 'festa' ? 'Festa' : g.giorno === 'chiuso' ? 'Studio chiuso' : ''), oreAssenza: g.assenza ? g.assenza.ore : 0, mancano: g.manca });
        const t = x.totali;
        righe.push({ data: 'Totale', persona: x.nome, previste: null, lavorate: t.oreLavorate, straordinarie: t.straordinarie,
          assenza: 'Ferie ' + String(t.ferie).replace('.', ',') + ' · Permessi ' + String(t.permessi).replace('.', ',') + (t.malattia ? ' · Malattia ' + String(t.malattia.ore).replace('.', ',') : '') + ' · Altre assenze ' + String(t.altreAssenze).replace('.', ','),
          oreAssenza: null, mancano: t.mancano });
        if (t.malattia && t.malattia.ore > 0 && riservati) this.registraAccessoRiservato(x.idPersona, 'esportazione', 'esportato', 'presenze ' + p.mese);
      }
      righe.push({ data: 'Programma paghe del consulente', persona: 'Non collegato', previste: null, lavorate: null, straordinarie: null, assenza: '', oreAssenza: null, mancano: null });
      return { colonne: [['Data', r => r.data], ['Persona', r => r.persona], ['Ore previste', r => r.previste], ['Lavorate', r => r.lavorate], ['Straordinarie', r => r.straordinarie],
        ['Assenza', r => r.assenza], ['Ore di assenza', r => r.oreAssenza], ['Mancano', r => r.mancano]], righe };
    }
    if (cosa === 'mezzi') {
      const righe = this.leggiMezzi({ tutti: d.tutti }).mezzi;
      return { colonne: [['Mezzo', m => m.nome], ['Targa', m => m.targa], ['Tipo', m => m.tipo], ['Di chi è', m => m.proprietaVista], ['Chi ce l\'ha', m => (m.chi ? m.chi.nome : '')],
        ['Km', m => m.km], ['Letti il', m => data(m.kmIl)], ['Tagliando fra km', m => m.kmAlTagliando], ['Prossima scadenza', m => (m.prossimaScadenza ? m.prossimaScadenza.tipo + ' ' + data(m.prossimaScadenza.data) : '')],
        ['Stato', m => m.statoVisto]], righe };
    }
    if (cosa === 'attrezzature') {
      const righe = this.leggiAttrezzature(Object.assign({ stato: 'tutte' }, d)).attrezzature;
      return { colonne: [['Codice', a => a.codice], ['Nome', a => a.nome], ['Categoria', a => a.categoriaNome], ['Marca', a => a.marca], ['Modello', a => a.modello],
        ['Matricola', a => a.matricola], ['Chi ce l\'ha', a => (a.chi ? a.chi.nome : '')], ['Posizione', a => a.posizione], ['Taratura', a => (a.taratura ? a.taratura.parola : '')],
        ['Scade', a => (a.taratura ? data(a.taratura.scade) : '')], ['Stato', a => a.statoVisto]], righe };
    }
    if (cosa === 'tarature') {
      const att = {};
      this.db.righe('SELECT id, codice, nome FROM attrezzature').forEach(a => { att[a.id] = a; });
      const righe = this.db.righe('SELECT * FROM tarature ORDER BY data DESC, id DESC').map(t => Object.assign({ a: att[t.attrezzatura_id] || {} }, this.taraturaDaRiga(t)));
      return { colonne: [['Codice', t => t.a.codice], ['Strumento', t => t.a.nome], ['Data', t => data(t.data)], ['Esito', t => t.esitoVisto], ['Scade', t => data(t.scade)],
        ['Laboratorio', t => t.laboratorio], ['Certificato', t => t.certificato]], righe };
    }
    if (cosa === 'manutenzioni') {
      const righe = this.leggiManutenzioni(d).manutenzioni;
      return { colonne: [['Mezzo o strumento', m => m.oggetto], ['Tipo', m => m.tipo], ['Stato', m => m.statoVisto], ['Data', m => data(m.data)], ['Km', m => m.km], ['Titolo', m => m.titolo],
        ['Descrizione', m => m.descrizione], ['Fornitore', m => m.fornitore], ['Fermo', m => m.fermo], ['Chiusa il', m => data(m.chiusaIl)], ['Esito', m => m.esito]], righe };
    }
    if (cosa === 'assegnazioni') {
      const righe = this.leggiAssegnazioni(d).assegnazioni;
      return { colonne: [['Cosa', x => x.oggetto], ['Tipo', x => x.tipoVisto], ['A chi', x => x.chi], ['Dal', x => data(x.dal)], ['Rientro', x => data(x.rientro)], ['Al', x => data(x.al)],
        ['In ritardo', x => x.inRitardo]], righe };
    }
    if (cosa === 'km') {
      const mezzi = {};
      this.db.righe('SELECT * FROM veicoli').forEach(v => { mezzi[v.id] = this.titoloMezzo(v); });
      const righe = this.db.righe('SELECT * FROM mezzo_letture' + (testo(d.idVeicolo) ? ' WHERE veicolo_id = ?' : '') + ' ORDER BY veicolo_id, data, id', ...(testo(d.idVeicolo) ? [Number(d.idVeicolo)] : []))
        .map(l => Object.assign({ mezzo: mezzi[l.veicolo_id] || '' }, this.letturaDaRiga(l)));
      return { colonne: [['Mezzo', l => l.mezzo], ['Data', l => data(l.data)], ['Km', l => l.km], ['Origine', l => l.origine], ['Chi', l => l.utente], ['Nota', l => l.nota]], righe };
    }
    if (cosa === 'collaboratori') {
      const righe = this.leggiCollaboratori({ stato: 'tutti' }).collaboratori.map(c => Object.assign({ abilitazioni: (this.db.riga('SELECT abilitazioni FROM collaboratori WHERE soggetto_id = ?', c.idSoggetto) || {}).abilitazioni || '' }, c));
      const colonne = [['Codice', c => c.idSoggetto], ['Nome', c => c.nome], ['Tipo', c => c.tipoNome], ['Mestiere', c => c.mestiere], ['Abilitazioni', c => c.abilitazioni],
        ['Idoneità', c => c.idoneita.parola], ['Incarichi in corso', c => c.incarichiInCorso], ['Valutazioni', c => c.valutazioni.bene + ' bene, ' + c.valutazioni.problemi + ' con qualche problema, ' + c.valutazioni.male + ' male']];
      if (costi) colonne.splice(7, 0, ['Da fatturare', c => c.daFatturare]);
      return { colonne, righe };
    }
    if (cosa === 'incarichi') {
      const righe = this.leggiIncarichi(Object.assign({ stato: 'tutti' }, d)).incarichi;
      let colonne = [['Numero', i => i.numero], ['Collaboratore', i => i.collaboratore], ['Commessa', i => i.idCommessa], ['Titolo', i => i.titolo], ['Come', i => i.modoVisto],
        ['Stato', i => i.statoVisto], ['Avanzamento', i => i.avanzamento], ['Dal', i => data(i.dal)], ['Al', i => data(i.al)]];
      if (costi) colonne = colonne.concat([['Pattuito', i => (i.conti ? i.conti.pattuito : null)], ['Maturato', i => (i.conti ? i.conti.maturato : null)],
        ['Fatturato', i => (i.conti ? i.conti.fatturato : null)], ['Da fatturare', i => (i.conti ? i.conti.daFatturare : null)], ['Da pagare', i => (i.conti ? i.conti.daPagare : null)]]);
      return { colonne, righe };
    }
    const c = this.compensi(d);
    return { colonne: [['Codice', r => r.idSoggetto], ['Collaboratore', r => r.nome], ['Incarichi', r => r.incarichi], ['Pattuito', r => r.pattuito], ['Maturato', r => r.maturato],
      ['Fatturato', r => r.fatturato], ['Da fatturare', r => r.daFatturare], ['Da pagare', r => r.daPagare]], righe: c.righe };
  },

  /**
   * Fase 8 (Esporta tutto): il CSV di un elenco della fase 5 dalle sue righe gia' pronte, con le stesse colonne e lo
   * stesso nome dell'esportazione singola (cosi' Esporta tutto puo' preparare le righe un po' alla volta).
   */
  esportaConRighe(cosa, righe, d) {
    const costi = this.vedeCosti();
    const colonne = COLONNE_FASE5[cosa].filter(c => costi || !c[2]);
    const periodo = [testo((d || {}).da), testo((d || {}).a)].filter(Boolean).join('-') || oggi();
    return { ok: true, nome: 'wisper-' + cosa + '-' + periodo + '.csv', mime: 'text/csv;charset=utf-8', righe: righe.length, base64: csv(colonne, righe).toString('base64') };
  },

  /** Le righe delle esportazioni della fase 5, coi filtri dei loro elenchi (tutte le pagine). */
  righeDaEsportareFase5(cosa, d) {
    if (cosa === 'documenti') {
      const nomi = {};
      this.db.righe('SELECT id, nome FROM utenti').forEach(u => { nomi[u.id] = u.nome; });
      const da = {};
      this.db.righe('SELECT id, creato_da FROM documenti').forEach(x => { da[x.id] = x.creato_da; });
      // Fase 8 (prova di carico): tutte le pagine in una lettura sola (tutte: true), nello stesso ordine.
      const tutte = this.leggiDocumenti(Object.assign({}, d, { archivio: true, tutte: true })).documenti;
      return tutte.map(x => Object.assign({ caricatoDa: da[x.id] ? nomi[da[x.id]] || '' : '' }, x));
    }
    if (cosa === 'scadenze') {
      const r = this.leggiScadenze(Object.assign({ stato: 'tutte' }, d));
      return r.scadenze || [].concat(r.scadute, r.entro, r.piuAvanti);
    }
    if (cosa === 'ticket') {
      const lista = this.leggiTicket(Object.assign({ segmento: 'tutti' }, d)).ticket;
      return lista.map(t => this.ticketCompleto(this.db.riga('SELECT * FROM ticket WHERE id = ?', t.id)));
    }
    return this.leggiContratti(d).contratti;
  },

  /** Le righe delle esportazioni della fase 4, coi filtri dei loro elenchi. */
  righeDaEsportareFase4(cosa, d) {
    if (cosa === 'fatture') {
      const piva = {};
      this.db.righe('SELECT id, partita_iva, codice_fiscale FROM soggetti').forEach(s => { piva[s.id] = s.partita_iva || s.codice_fiscale; });
      return this.leggiFatture(d).map(f => Object.assign({ partitaIva: piva[f.idCliente] || '' }, f)).reverse();
    }
    if (cosa === 'ricevute') return this.leggiRicevute(d).reverse();
    if (cosa === 'daFatturare') {
      const nomi = {};
      this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { nomi[s.id] = s.nome; });
      return this.sorgentiDaFatturare(d).map(v => Object.assign({}, v, { cliente: nomi[v.idCliente] || '' }));
    }
    if (cosa === 'riepilogo') return this.riepilogoFatturato(d).righe;
    if (cosa === 'movimenti') {
      const tutte = [];
      for (let pagina = 1; ; pagina++) {
        const p = this.leggiMovimenti(Object.assign({}, d, { pagina }));
        tutte.push(...p.movimenti);
        if (pagina >= p.pagine) break;
      }
      return tutte.reverse();
    }
    if (cosa === 'scadenziario') {
      const s = this.scadenziario(d);
      return s.scaduti.map(r => Object.assign({ saldo: null, sottoSoglia: false }, r))
        .concat([].concat(...s.giorni.map(g => g.righe.map(r => Object.assign({ data: g.data, saldo: g.saldo, sottoSoglia: g.sottoSoglia }, r)))));
    }
    return this.leggiImpegni(Object.assign({ stato: 'tutti' }, d));
  },
};

Object.defineProperty(module.exports, 'cella', { value: cella });
