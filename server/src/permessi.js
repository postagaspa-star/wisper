/*
 * Ruoli e permessi (accordo §3). Ogni azione dice di quale modulo ha bisogno e
 * a che livello (0 niente, 1 lettura, 2 scrittura): il controllo sta in un
 * punto solo, prima dell'azione (richieste.js). Le app nascondono le voci, ma
 * la garanzia e' qui.
 */
'use strict';

/** Le voci del menu, nell'ordine delle specifiche; dal 03/11/2026 anche i progetti, sotto le commesse. */
const MODULI = ['dashboard', 'clienti', 'commesse', 'progetti', 'preventivi', 'attivita', 'rapportini', 'spese',
  'fatturazione', 'banche', 'persone', 'documenti', 'ticket', 'mezzi', 'comunicazioni', 'portale',
  'collaboratori', 'integrazioni', 'amministrazione'];

/**
 * Le due chiavi speciali: "costi" (tariffe, totali, costi orari, budget in euro,
 * margini: senza, il server toglie quei campi dalle risposte) e "riservati"
 * (stipendi e documenti personali, dalla fase 6).
 */
const SPECIALI = ['costi', 'riservati'];

const TUTTE = MODULI.concat(SPECIALI);

const RUOLI = ['titolare', 'amministrazione', 'collaboratore', 'lettura', 'esterno'];

/**
 * Fase 6: un esterno (collaboratore esterno con l'accesso) non puo' mai vedere i soldi, le persone e
 * l'amministrazione dello studio: salvaPermessi rifiuta di dargli piu' di 0 su questi.
 */
const VIETATI_ESTERNO = ['persone', 'mezzi', 'clienti', 'preventivi', 'fatturazione', 'banche', 'comunicazioni', 'portale',
  'integrazioni', 'amministrazione', 'costi', 'riservati'];

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
    // Fase 6: persone 1 (l'organico come una rubrica, e la propria scheda).
    // Fase 7: comunicazioni 2 (solo le sue: le sue attivita', i ticket e i rapportini che vede; mai i pagamenti), portale 0.
    Object.assign(p, { dashboard: 1, clienti: 1, commesse: 1, progetti: 1, rapportini: 2, attivita: 2, spese: 2,
      documenti: 1, ticket: 2, mezzi: 1, persone: 1, comunicazioni: 2 });
  } else if (ruolo === 'lettura') {
    MODULI.forEach(m => { p[m] = 1; });
    p.amministrazione = 0;
    p.costi = 1;
  } else if (ruolo === 'esterno') {
    // Fase 6: solo le sue commesse, i suoi rapportini, le sue spese, le sue attivita', i suoi ticket e documenti, la sua scheda.
    Object.assign(p, { dashboard: 1, commesse: 1, progetti: 1, rapportini: 2, attivita: 2, spese: 2, ticket: 2, documenti: 1, collaboratori: 1 });
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
  // Fase 4: fatture, incassi, saldi (servono dove una risposta arriva a chi non ha "costi": commessa, Dashboard, registro).
  // "scaduto" no: e' gia' un si'/no dei preventivi (fase 2), e il "scaduto" in euro della fase 4 sta solo dentro
  // numeri.soldi e nelle risposte di fatturazione e banche, che senza "costi" non arrivano proprio.
  'compenso', 'anticipazioni', 'bollo', 'bolloAddebitato', 'ritenuta', 'netto', 'incassato', 'residuo', 'parteSenzaIva',
  'totaleBozza', 'nettoBozza', 'saldo', 'saldoPrevisto', 'entrate', 'uscite', 'daIncassare', 'daPagare', 'fatturato',
  'fattureInBozza', 'incassiSettimana', 'pagamentiSettimana', 'saldoConti',
  'base_iva', 'bollo_addebitato', 'totale_bozza', 'netto_bozza',
  // Fase 5: il canone e la tariffa dei contratti, il prezzo a corpo e l'importo dei ticket, il loro costo, se un contratto rende.
  'canone', 'tariffaExtra', 'prezzoCorpo', 'importoTicket', 'costoTicket', 'rende', 'prezzo_corpo', 'tariffa_extra',
  // Fase 6: il costo orario della persona da quando vale, i soldi degli incarichi dei collaboratori, i costi del mezzo.
  // "collaboratori" e "daFatturare" no (fase6.md §10 li elencava): sono gia' chiavi che non sono soldi (il modulo
  // "collaboratori" nei permessi, numeri.rapportini.daFatturare che conta i rapportini). Stanno dentro costoCommessa,
  // "conti" e "compensi", che spariscono interi; dove serve, il server li toglie a mano (collaboratori.js).
  'costoDal', 'tariffaIncarico', 'pattuito', 'maturato', 'collaboratoriPrevisto', 'altreRicevute',
  'costiMezzo', 'euroKmMezzo', 'tetto', 'compensiDaFatturare', 'compensi', 'speseDaRiconoscere', 'costoAcquisto',
  // Fase 7: il residuo nelle proposte di pagamento, il totale accettato nel portale (Dashboard, Da guardare).
  'importoResiduo', 'totaleAccettato',
  // 1.4.0 (servizi.md): il costo di acquisto dei servizi, la somma delle indennita' di un lavoro.
  'prezzoAcquisto', 'prezzo_acquisto', 'importoIndennita', 'importo_indennita',
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

// ------------------------------------------------------------------ fase 6: i dati della persona
//
// Tre livelli (fase6.md §3.2): di lavoro (chi ha persone >= 1), personali (persone 2 e la persona stessa), riservati
// (chi ha "riservati" e la persona stessa, tranne il costo). Un oggetto con dati di una persona si segna con
// datiPersona(o, idPersona, cosa); togliPersonali(risposta, vede) toglie, a qualunque profondita', i campi che chi
// chiede non vede: ne' valori ne' chiavi. E' il punto solo, come togliCosti; richieste.js lo fa su ogni risposta.

/** I campi personali: tolti senza persone 2, tranne alla persona stessa. */
const CAMPI_PERSONALI = new Set([
  'codiceFiscale', 'nascitaData', 'nascitaLuogo', 'indirizzo', 'cap', 'citta', 'provincia', 'telefonoPersonale', 'emailPersonale',
  'iban', 'emergenzaNome', 'emergenzaTelefono', 'contrattoTipo', 'contrattoScade', 'motivoUscita', 'prossimaVisita', 'dpi', 'saldi',
  'assenze', 'visite', 'causale', 'nota', 'protocollo', 'oreAnnueFerie', 'oreAnnuePermessi', 'ferieAnnueOre', 'permessiAnnuiOre',
]);

/** I campi riservati: tolti senza "riservati", tranne alla persona stessa (non quelli del costo, sotto). */
const CAMPI_RISERVATI = new Set([
  'costoAnno', 'oreAnno', 'notaCosto', 'ccnl', 'livello', 'noteRiservate', 'giudizio', 'giudizioVisto', 'prescrizioni', 'validoFino',
  'protocollo', 'tipoSanitario', 'documentoRiservato',
]);

/** Del costo: nemmeno la persona stessa li vede (sono numeri per i conti delle commesse). */
const RISERVATI_DEL_COSTO = new Set(['costoAnno', 'oreAnno', 'notaCosto']);

const DATI_PERSONA = Symbol('datiPersona');

/**
 * Segna un oggetto come dati della persona idPersona. cosa: quale dato riservato contiene ('scheda', 'costo',
 * 'visita', 'assenza', 'documento'): serve al registro di chi apre i dati riservati.
 */
function datiPersona(o, idPersona, cosa) {
  if (o && typeof o === 'object') o[DATI_PERSONA] = { idPersona: idPersona === undefined ? null : idPersona, cosa: cosa || 'scheda' };
  return o;
}

/**
 * Toglie i campi che chi chiede non vede. vede = {personali, riservati, idPersona (la sua persona), visto(idPersona, cosa)}:
 * visto si chiama per ogni oggetto di un'altra persona che arriva coi campi riservati (il registro degli accessi).
 */
function togliPersonali(x, vede) {
  if (Array.isArray(x)) return x.map(v => togliPersonali(v, vede));
  if (x && typeof x === 'object') {
    const m = x[DATI_PERSONA];
    const o = {};
    let riservatoVisto = false;
    for (const k of Object.keys(x)) {
      if (m) {
        const propria = m.idPersona !== null && vede.idPersona !== null && vede.idPersona !== undefined && m.idPersona === vede.idPersona;
        if (CAMPI_RISERVATI.has(k)) {
          if (RISERVATI_DEL_COSTO.has(k) ? !vede.riservati : !(vede.riservati || propria)) continue;
          if (!propria && x[k] !== '' && x[k] !== null && x[k] !== undefined) riservatoVisto = true;
        } else if (CAMPI_PERSONALI.has(k) && !(vede.personali || propria)) continue;
      }
      o[k] = togliPersonali(x[k], vede);
    }
    if (m && riservatoVisto && vede.visto && m.idPersona !== null) vede.visto(m.idPersona, m.cosa);
    if (x[SOLDI_PROPRI]) o[SOLDI_PROPRI] = x[SOLDI_PROPRI];
    return o;
  }
  return x;
}

module.exports = {
  MODULI, SPECIALI, TUTTE, RUOLI, iniziali, CAMPI_COSTI, togliCosti, soldiPropri, SOLDI_PROPRI,
  VIETATI_ESTERNO, CAMPI_PERSONALI, CAMPI_RISERVATI, RISERVATI_DEL_COSTO, DATI_PERSONA, datiPersona, togliPersonali,
};
