/*
 * Ruoli e permessi (accordo §3). Ogni azione dice di quale modulo ha bisogno e
 * a che livello (0 niente, 1 lettura, 2 scrittura): il controllo sta in un
 * punto solo, prima dell'azione (richieste.js). Le app nascondono le voci, ma
 * la garanzia e' qui.
 */
'use strict';

/** Le 18 voci del menu, nell'ordine delle specifiche. */
const MODULI = ['dashboard', 'clienti', 'commesse', 'preventivi', 'attivita', 'rapportini', 'spese',
  'fatturazione', 'banche', 'persone', 'documenti', 'ticket', 'mezzi', 'comunicazioni', 'portale',
  'collaboratori', 'integrazioni', 'amministrazione'];

/**
 * Le due chiavi speciali: "costi" (tariffe, totali, costi orari, budget in euro,
 * margini: senza, il server toglie quei campi dalle risposte) e "riservati"
 * (stipendi e documenti personali, dalla fase 6).
 */
const SPECIALI = ['costi', 'riservati'];

const TUTTE = MODULI.concat(SPECIALI);

const RUOLI = ['titolare', 'amministrazione', 'collaboratore', 'lettura'];

/** I valori iniziali della tabella dell'accordo. */
function iniziali(ruolo) {
  const p = {};
  TUTTE.forEach(m => { p[m] = 0; });
  if (ruolo === 'titolare') {
    TUTTE.forEach(m => { p[m] = 2; });
  } else if (ruolo === 'amministrazione') {
    MODULI.forEach(m => { p[m] = 2; });
    p.amministrazione = 1;
    p.costi = 2;
  } else if (ruolo === 'collaboratore') {
    Object.assign(p, { dashboard: 1, clienti: 1, commesse: 1, rapportini: 2, attivita: 2, spese: 2,
      documenti: 1, ticket: 2, mezzi: 1 });
  } else if (ruolo === 'lettura') {
    MODULI.forEach(m => { p[m] = 1; });
    p.amministrazione = 0;
    p.costi = 1;
  }
  return p;
}

/**
 * I campi economici: con "costi" a 0 spariscono da ogni risposta, a qualunque
 * profondita' (rapportini, clienti, commesse, prestazioni, impostazioni, e il
 * prima/dopo del registro). Restano ore, km, spese e descrizioni.
 */
const CAMPI_COSTI = new Set([
  'tariffa', 'tariffaFissa', 'costoFisso', 'ultimaTariffa', 'maggExtra', 'euroKm', 'compensoOre',
  'rimborsoKm', 'totale', 'costoOrario', 'prezzoOrario', 'budgetEuro', 'importoContratto', 'valore',
  'soldi', 'EURO_KM', 'COSTO_ORARIO',
  'tariffa_fissa', 'costo_fisso', 'ultima_tariffa', 'magg_extra', 'euro_km', 'compenso_ore', 'rimborso_km',
  'costo_orario', 'prezzo_orario', 'budget_euro', 'importo_contratto',
  // Fase 2: preventivi e listino (prezzi, importi delle voci e delle scadenze, sconti, i conti interi).
  'prezzo', 'importo', 'subtotale', 'sommaVoci', 'scontoPercentuale', 'scontoEuro', 'scontoDaPercentuale',
  'imponibile', 'contributo', 'baseIva', 'iva', 'restoScadenze', 'conti', 'preventiviInAttesa',
  'sconto_percentuale', 'sconto_euro',
  // Fase 3: il costo delle ore (ore x costo orario congelato) e il costo della commessa.
  'costo', 'costoCommessa', 'costoOreRegistrate',
]);

/**
 * I soldi della persona (fase 3): una spesa che ha pagato, il rimborso km e
 * l'indennita' delle sue trasferte, l'euro al km del veicolo con cui si
 * calcola, i suoi rimborsi. Non sono costi dello studio: chi vede la spesa o la
 * trasferta li vede anche senza "costi" (un collaboratore vede solo le sue).
 * Un oggetto segnato con soldiPropri(o, campi) tiene quei campi; tutto il resto
 * (anche dentro di lui) segue la regola di sempre.
 */
const SOLDI_PROPRI = Symbol('soldiPropri');

function soldiPropri(o, campi) {
  if (o && typeof o === 'object') o[SOLDI_PROPRI] = new Set(campi);
  return o;
}

function togliCosti(x) {
  if (Array.isArray(x)) return x.map(togliCosti);
  if (x && typeof x === 'object') {
    const o = {};
    const tenuti = x[SOLDI_PROPRI];
    for (const k of Object.keys(x)) {
      if (CAMPI_COSTI.has(k) && !(tenuti && tenuti.has(k))) continue;
      o[k] = togliCosti(x[k]);
    }
    return o;
  }
  return x;
}

module.exports = { MODULI, SPECIALI, TUTTE, RUOLI, iniziali, CAMPI_COSTI, togliCosti, soldiPropri, SOLDI_PROPRI };
