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

const { Rifiuto, senzaPermesso, testo, oggi } = require('../utili');
const { togliCosti } = require('../permessi');

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

/** Di quale modulo serve almeno la lettura, per ogni cosa da esportare. */
const MODULO = { rapportini: 'rapportini', clienti: 'clienti', fornitori: 'clienti', commesse: 'commesse', registro: 'amministrazione' };

module.exports = {
  esporta(d) {
    const cosa = testo(d.cosa);
    if (!MODULO[cosa]) throw new Rifiuto('Cosa esportare? rapportini, clienti, fornitori, commesse o registro');
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
