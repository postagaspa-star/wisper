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

/** Di quale modulo serve almeno la lettura, per ogni cosa da esportare. */
const MODULO = {
  rapportini: 'rapportini', clienti: 'clienti', fornitori: 'clienti', commesse: 'commesse', registro: 'amministrazione',
  preventivi: 'preventivi', attivita: 'attivita',
  ore: 'rapportini', spese: 'spese', trasferte: 'spese', rimborsi: 'spese',
};

module.exports = {
  esporta(d) {
    const cosa = testo(d.cosa);
    if (!MODULO[cosa]) throw new Rifiuto('Cosa esportare? rapportini, clienti, fornitori, commesse, registro, preventivi, attivita, ore, spese, trasferte o rimborsi');
    if (this.livello(MODULO[cosa]) < 1) throw senzaPermesso('esportare ' + cosa);
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
};

Object.defineProperty(module.exports, 'cella', { value: cella });
