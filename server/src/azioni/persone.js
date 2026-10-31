/*
 * Persone e risorse umane (fase 6, accordo in docs/gestionale/fase6.md §3.1-3.3, §5, §9; risposte in
 * architettura.md §17): l'organico, la scheda della persona coi tre livelli di dati, il costo orario con la sua
 * storia, competenze e formazione, visite mediche (solo il giudizio e le date), DPI consegnati, uscita e
 * anonimizzazione, il registro di chi apre i dati riservati.
 *
 * La privacy non e' un dettaglio:
 *  - i campi personali li vedono chi ha persone 2 e la persona stessa; i riservati chi ha "riservati" e la persona
 *    stessa (tranne il costo). Il server li toglie in un punto solo (permessi.js, togliPersonali, chiamato da
 *    richieste.js su ogni risposta): qui gli oggetti si segnano con datiPersona;
 *  - nel registro delle modifiche i valori personali e riservati sono "(riservato)" (wisper.js, annota);
 *  - chi vede, scarica, cambia o esporta un dato riservato di un'altra persona lascia una riga in accessi_riservati,
 *    che non si modifica e non si cancella;
 *  - mai dati clinici: della visita il giudizio e le date, della malattia il periodo e il numero del certificato.
 */
'use strict';

const fs = require('node:fs');
const { Rifiuto, senzaPermesso, testo, numero, numeroONull, centesimi, adesso, oggi, dataIso, dataDaIso, dataOraIso, piuGiorni } = require('../utili');
const C = require('../conti');
const { datiPersona, togliPersonali } = require('../permessi');

const RAPPORTI = ['titolare', 'socio', 'dipendente', 'apprendista', 'tirocinante', 'autonomo', 'altro'];
const NOMI_RAPPORTO = {
  titolare: 'Titolare', socio: 'Socio', dipendente: 'Dipendente', apprendista: 'Apprendista', tirocinante: 'Tirocinante',
  autonomo: 'A partita IVA nello studio', altro: 'Altro', '': 'Da completare',
};
const CONTRATTI = ['indeterminato', 'determinato', 'apprendistato', 'stage', 'parasubordinato', 'partita_iva'];
const TIPI_VISITA = ['preventiva', 'periodica', 'richiesta', 'cambio_mansione', 'rientro', 'cessazione'];
const GIUDIZI = ['idoneo', 'idoneo_prescrizioni', 'non_idoneo_temporaneo', 'non_idoneo'];
const NOMI_GIUDIZIO = { idoneo: 'Idoneo', idoneo_prescrizioni: 'Idoneo con prescrizioni', non_idoneo_temporaneo: 'Non idoneo per ora', non_idoneo: 'Non idoneo' };
const GRUPPI_QUALIFICA = ['elettrico', 'sicurezza', 'emergenza', 'altro'];
/** Quello che la persona stessa cambia della sua scheda (fase6.md §5.1): contatti personali, indirizzo, IBAN, emergenza. */
const SUOI_CAMPI = ['telefonoPersonale', 'emailPersonale', 'indirizzo', 'cap', 'citta', 'provincia', 'iban', 'emergenzaNome', 'emergenzaTelefono'];
/** I campi della scheda: nome nella risposta -> colonna. */
const CAMPI = {
  nome: 'nome', ruoloStudio: 'ruolo_studio', mansione: 'mansione', emailLavoro: 'email_lavoro', telefonoLavoro: 'telefono_lavoro',
  entrataIl: 'entrata_il', contrattoTipo: 'contratto_tipo', contrattoScade: 'contratto_scade',
  codiceFiscale: 'codice_fiscale', nascitaData: 'nascita_data', nascitaLuogo: 'nascita_luogo', indirizzo: 'indirizzo', cap: 'cap', citta: 'citta',
  provincia: 'provincia', telefonoPersonale: 'telefono_personale', emailPersonale: 'email_personale', iban: 'iban',
  emergenzaNome: 'emergenza_nome', emergenzaTelefono: 'emergenza_telefono', ccnl: 'ccnl', livello: 'livello', noteRiservate: 'note_riservate',
};
const CAMPI_DATA = ['entrataIl', 'contrattoScade', 'nascitaData'];
const CAMPI_RISERVATI_SCHEDA = ['ccnl', 'livello', 'noteRiservate'];
const DPI_PROPOSTI = ['Guanti isolanti', 'Elmetto con visiera', 'Calzature di sicurezza', 'Occhiali', 'Imbracatura anticaduta', 'Tuta', 'Otoprotettori', 'Altro'];

const si = v => v === true || v === 1 || v === '1' || v === 'true';
const vuoto = v => v === undefined || v === null || v === '';
const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');
const giorniTra = (da, a) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(da + 'T12:00:00')) / 86400000);
const urlFile = id => '/file/' + id;
const json = (v, base) => { try { const x = JSON.parse(v); return x === null || x === undefined ? base : x; } catch (e) { return base; } };
/** "PES · Persona esperta (CEI 11-27)" -> "PES": il nome corto nelle frasi delle scadenze. */
const nomeCorto = n => String(n || '').split(' · ')[0];

module.exports = {
  // ------------------------------------------------------------------ chi e' chi

  /** La persona di un utente (o null). */
  personaDiUtente(idUtente) {
    if (idUtente === null || idUtente === undefined) return null;
    return this.db.riga('SELECT * FROM persone WHERE utente_id = ?', idUtente);
  },

  /** L'id della persona di chi lavora (o null: il sistema, il ponte senza persona, un esterno). */
  miaPersonaId() {
    const c = this.chi();
    if (!c.utente) return null;
    const p = this.db.riga('SELECT id FROM persone WHERE utente_id = ?', c.utente.id);
    return p ? p.id : null;
  },

  nomePersona(id) {
    const p = id ? this.db.riga('SELECT nome FROM persone WHERE id = ?', id) : null;
    return p ? p.nome : '';
  },

  /** I dati personali di questa persona: persone 2, o e' la propria scheda. */
  vedePersonaliDi(idPersona) {
    if (this.chi().sistema) return true;
    return this.livello('persone') >= 2 || (idPersona !== null && idPersona !== undefined && idPersona === this.miaPersonaId());
  },

  /** I dati riservati di questa persona (non il costo): "riservati", o e' la propria scheda. */
  vedeRiservatiDi(idPersona) {
    if (this.chi().sistema) return true;
    return this.livello('riservati') >= 1 || (idPersona !== null && idPersona !== undefined && idPersona === this.miaPersonaId());
  },

  /** Chi vede l'organico intero coi dati di lavoro completi (competenze comprese): non il collaboratore (rubrica). */
  vedeLavoroCompleto(idPersona) {
    if (this.chi().sistema) return true;
    if (this.livello('persone') < 1) return false;
    return !this.soloSuoi() || idPersona === this.miaPersonaId();
  },

  /** Puo' approvare le assenze: titolare e amministrazione con persone 2 (le proprie solo il titolare, assenze.js). */
  puoApprovareAssenze() {
    const c = this.chi();
    if (c.sistema) return true;
    if (!c.utente || this.soloSuoi()) return false;
    return this.livello('persone') >= 2;
  },

  rigaPersona(id) {
    const p = this.db.riga('SELECT * FROM persone WHERE id = ?', Number(id) || 0);
    if (!p) throw new Rifiuto('Persona ' + testo(id) + ' non trovata');
    // Il collaboratore apre le schede dei colleghi (coi dati di lavoro): l'organico e' una rubrica. Gli usciti no.
    if (this.soloSuoi() && p.id !== this.miaPersonaId() && p.uscita_il && p.uscita_il < oggi()) throw new Rifiuto('Persona ' + testo(id) + ' non trovata');
    return p;
  },

  /** Le persone attive oggi (o in un giorno): entrate e non ancora uscite, non rese anonime. */
  personeAttive(giorno) {
    const g = giorno || oggi();
    return this.db.righe("SELECT * FROM persone WHERE anonimizzata_il = '' AND (entrata_il = '' OR entrata_il <= ?) AND (uscita_il = '' OR uscita_il >= ?) ORDER BY nome", g, g);
  },

  /** Ore alla settimana e giorni di una persona, per i conti di conti.js. */
  orarioPersona(p) {
    const imp = this.leggiImpostazioni();
    return {
      oreSettimana: p && p.ore_settimana !== null && p.ore_settimana !== undefined ? p.ore_settimana : null,
      giorniSettimana: p ? json(p.giorni_settimana, [1, 2, 3, 4, 5]) : [1, 2, 3, 4, 5],
      oreGiornaliere: numero(imp.ORE_GIORNALIERE) || 8,
    };
  },

  // ------------------------------------------------------------------ il registro di chi apre i dati riservati

  /**
   * Una riga in accessi_riservati (§5.7). "visto": una per utente, persona e cosa al giorno, per non riempire il
   * registro; le altre (scaricato, cambiato, esportato) sempre. Chi apre i suoi dati non lascia traccia.
   */
  registraAccessoRiservato(idPersona, cosa, azione, riferimento) {
    const c = this.chi();
    if (c.sistema || !c.utente || idPersona === null || idPersona === undefined) return;
    if (idPersona === this.miaPersonaId()) return;
    const ora = adesso();
    if (azione === 'visto') {
      const gia = this.db.riga("SELECT id FROM accessi_riservati WHERE utente_id = ? AND persona_id = ? AND cosa = ? AND azione = 'visto' AND substr(quando, 1, 10) = ?",
        c.utente.id, idPersona, cosa, ora.slice(0, 10));
      if (gia) return;
    }
    this.db.esegui('INSERT INTO accessi_riservati (quando, utente_id, persona_id, cosa, riferimento, azione, disp) VALUES (?,?,?,?,?,?,?)',
      ora, c.utente.id, idPersona, cosa, String(riferimento === undefined || riferimento === null ? '' : riferimento),
      azione, testo(c.dispNome || c.disp || c.app).slice(0, 80));
  },

  /** Chi scarica un documento riservato di un'altra persona lascia sempre una riga ("scaricato"). */
  notaScaricoRiservato(f) {
    if (!f || f.documento_id === null || f.documento_id === undefined) return;
    const doc = this.db.riga('SELECT id, persona_id, vede FROM documenti WHERE id = ?', f.documento_id);
    if (doc && doc.persona_id && doc.vede === 'riservati') this.registraAccessoRiservato(doc.persona_id, 'documento', 'scaricato', doc.id);
  },

  /** Un file di /carica per una persona: la riga c'e', ma nel registro il nome e' "(riservato)". */
  inserisciFileRiservato(valori, nota) {
    const colonne = Object.keys(valori);
    this.db.esegui('INSERT INTO file (' + colonne.join(', ') + ') VALUES (' + colonne.map(c => '@' + c).join(', ') + ')', valori);
    const dopo = {};
    for (const k of colonne) if (valori[k] !== null && valori[k] !== undefined && valori[k] !== '' && k !== 'sha256') dopo[k] = valori[k];
    dopo.nome = '(riservato)';
    this.annota('file', valori.id, null, dopo, nota);
  },

  /** Il passaggio finale di ogni risposta (richieste.js): toglie i campi personali e riservati che chi chiede non vede. */
  togliDatiPersona(risposta) {
    const c = this.chi();
    if (c.sistema) return risposta;
    const vede = {
      personali: this.livello('persone') >= 2, riservati: this.livello('riservati') >= 1, idPersona: this.miaPersonaId(),
      visto: (idPersona, cosa) => { try { this.registraAccessoRiservato(idPersona, cosa, 'visto'); } catch (e) { /* il registro non ferma la risposta */ } },
    };
    return togliPersonali(risposta, vede);
  },

  /** accessiRiservati {idPersona?, da?, a?, utente?, pagina?}: il titolare tutto, la persona i suoi. 100 per pagina. */
  leggiAccessiRiservati(d) {
    d = d || {};
    const c = this.chi();
    const titolare = c.sistema || (c.utente && c.utente.ruolo === 'titolare');
    const mia = this.miaPersonaId();
    let idPersona = testo(d.idPersona) ? Number(d.idPersona) : null;
    if (!titolare) {
      if (mia === null || (idPersona !== null && idPersona !== mia)) throw senzaPermesso('vedere chi ha aperto i dati riservati (lo vede il titolare)');
      idPersona = mia;
    }
    const cond = [];
    const par = [];
    if (idPersona !== null) { cond.push('a.persona_id = ?'); par.push(idPersona); }
    if (testo(d.da)) { cond.push('substr(a.quando, 1, 10) >= ?'); par.push(dataDaIso(d.da)); }
    if (testo(d.a)) { cond.push('substr(a.quando, 1, 10) <= ?'); par.push(dataDaIso(d.a)); }
    if (testo(d.utente)) { cond.push('a.utente_id = ?'); par.push(Number(d.utente)); }
    const dove = cond.length ? ' WHERE ' + cond.join(' AND ') : '';
    const quanti = this.db.riga('SELECT COUNT(*) n FROM accessi_riservati a' + dove, ...par).n;
    const pagine = Math.max(1, Math.ceil(quanti / 100));
    const pagina = Math.min(Math.max(1, Math.round(numero(d.pagina)) || 1), pagine);
    const nomiU = {};
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { nomiU[u.id] = u.nome; });
    const nomiP = {};
    this.db.righe('SELECT id, nome FROM persone').forEach(p => { nomiP[p.id] = p.nome; });
    const titoli = {};
    const righe = this.db.righe('SELECT a.* FROM accessi_riservati a' + dove + ' ORDER BY a.id DESC LIMIT 100 OFFSET ' + (pagina - 1) * 100, ...par).map(r => {
      let frase;
      if (r.cosa === 'documento') {
        if (!(r.riferimento in titoli)) {
          const doc = Number(r.riferimento) ? this.db.riga('SELECT titolo FROM documenti WHERE id = ?', Number(r.riferimento)) : null;
          // Senza riferimento (l'elenco dei documenti visto): "i documenti riservati"; con un id che non c'e' piu': tolto.
          titoli[r.riferimento] = doc ? doc.titolo : Number(r.riferimento) ? 'un documento tolto' : 'i documenti riservati';
        }
        const t = ['un documento tolto', 'i documenti riservati'].includes(titoli[r.riferimento]) ? titoli[r.riferimento] : '«' + titoli[r.riferimento] + '»';
        frase = r.azione === 'scaricato' ? 'Ha scaricato ' + t : r.azione === 'cambiato' ? 'Ha cambiato ' + t : 'Ha visto ' + t;
      } else {
        const cosa = { scheda: 'i dati riservati della scheda', costo: 'il costo dell\'anno', visita: 'il giudizio della visita medica',
          assenza: 'il tipo delle assenze', esportazione: 'i dati riservati' }[r.cosa] || r.cosa;
        frase = { visto: 'Ha visto ', scaricato: 'Ha scaricato ', cambiato: 'Ha cambiato ', esportato: 'Ha esportato ' }[r.azione] + cosa;
      }
      return {
        quando: dataOraIso(r.quando), idUtente: r.utente_id, utente: nomiU[r.utente_id] || '', idPersona: r.persona_id,
        persona: nomiP[r.persona_id] || '', cosa: r.cosa, azione: r.azione, riferimento: r.riferimento, frase, disp: r.disp,
      };
    });
    return { ok: true, pagina, pagine, quanti, righe };
  },

  // ------------------------------------------------------------------ il costo orario

  costiPersona(idPersona) {
    return this.db.righe('SELECT * FROM persona_costi WHERE persona_id = ? ORDER BY dal DESC, id DESC', idPersona);
  },

  /** Il costo orario valido oggi (la riga con dal piu' recente <= oggi), o null. */
  costoDiOggi(idPersona, giorno) {
    const g = giorno || oggi();
    return this.db.riga('SELECT * FROM persona_costi WHERE persona_id = ? AND dal <= ? ORDER BY dal DESC, id DESC LIMIT 1', idPersona, g);
  },

  /**
   * Il costo orario da congelare in una riga di ore o in un rapportino che nasce (fase6.md §3.3, conti.js
   * costoOrarioDelLavoro): l'esterno (o le ore senza utente, di un collaboratore senza accesso) 0; la persona col
   * costo valido alla data del lavoro; altrimenti la regola di oggi (cliente, commessa, COSTO_ORARIO).
   */
  costoOrarioLavoro({ idUtente, senzaUtente, data, commessa, cliente }) {
    let esterno = !!senzaUtente;
    let costiPersona = [];
    if (!esterno && idUtente !== null && idUtente !== undefined) {
      const u = this.db.riga('SELECT ruolo FROM utenti WHERE id = ?', idUtente);
      if (u && u.ruolo === 'esterno') esterno = true;
      const p = this.personaDiUtente(idUtente);
      if (p) costiPersona = this.costiPersona(p.id).map(r => ({ dal: r.dal, costoOrario: r.costo_orario }));
    }
    let cli = cliente;
    if (cli === undefined) cli = commessa && commessa.idCliente ? this.soggetto(commessa.idCliente) : null;
    return C.costoOrarioDelLavoro({ esterno, costiPersona, data: data || oggi(), cliente: cli, commessa, impostazioni: this.leggiImpostazioni() });
  },

  /** salvaCostoPersona {idPersona, dal, costoOrario?, costoAnno?, oreAnno?, nota?} (persone 2, costi 2; l'anno e la nota con riservati 2). */
  salvaCostoPersona(d) {
    if (this.livello('costi') < 2) throw senzaPermesso('scrivere i costi delle persone');
    const p = this.rigaPersona(d.idPersona);
    const dal = testo(d.dal) ? dataDaIso(d.dal) : '';
    if (!dal) throw new Rifiuto('Dal: scrivi da quando vale il costo');
    const conAnno = !vuoto(d.costoAnno) || !vuoto(d.oreAnno) || !vuoto(d.nota);
    if (conAnno && this.livello('riservati') < 2) throw senzaPermesso('scrivere il costo dell\'anno (è un dato riservato)');
    let costo = numeroONull(d.costoOrario);
    const costoAnno = numeroONull(d.costoAnno);
    const oreAnno = numeroONull(d.oreAnno);
    if (costo === null && costoAnno !== null && oreAnno !== null) costo = C.costoOrarioDaAnno(costoAnno, oreAnno);
    if (costo === null || !(costo >= 0)) throw new Rifiuto('Costo orario: scrivi il costo o il costo dell\'anno e le ore');
    if (this.db.riga('SELECT id FROM persona_costi WHERE persona_id = ? AND dal = ?', p.id, dal)) throw new Rifiuto('Dal: c\'è già un costo da quel giorno');
    const c = this.chi();
    this.inserisci('persona_costi', {
      persona_id: p.id, dal, costo_orario: centesimi(costo), costo_anno: costoAnno === null ? null : centesimi(costoAnno), ore_anno: oreAnno,
      nota: testo(d.nota), utente_id: c.utente ? c.utente.id : null, creato: adesso(),
    }, 'id', 'costo dal ' + dataIt(dal) + ': vale per le righe nuove');
    if (conAnno) this.registraAccessoRiservato(p.id, 'costo', 'cambiato', '');
    return {
      ok: true, costi: this.costiDaMandare(p.id),
      frase: 'Vale per le ore e i rapportini nuovi dal ' + dataIt(dal) + ': quelli già scritti tengono il loro costo',
    };
  },

  /** togliCostoPersona {id} (persone 2, costi 2): le righe gia' scritte tengono il costo che avevano. */
  togliCostoPersona(d) {
    if (this.livello('costi') < 2) throw senzaPermesso('scrivere i costi delle persone');
    const r = this.db.riga('SELECT * FROM persona_costi WHERE id = ?', Number(d.id) || 0);
    if (!r) throw new Rifiuto('Costo ' + testo(d.id) + ' non trovato');
    this.db.esegui('DELETE FROM persona_costi WHERE id = ?', r.id);
    this.annota('persona_costi', r.id, Object.assign({}, r), null, 'tolto: le righe già scritte tengono il loro costo');
    return { ok: true, costi: this.costiDaMandare(r.persona_id) };
  },

  costiDaMandare(idPersona) {
    return this.costiPersona(idPersona).map(r => datiPersona({
      id: r.id, dal: r.dal, costoOrario: r.costo_orario, costoAnno: r.costo_anno, oreAnno: r.ore_anno, notaCosto: r.nota,
    }, idPersona, 'costo'));
  },

  // ------------------------------------------------------------------ le persone degli utenti

  /** Un utente nuovo (non esterno) fa nascere la sua persona con lo stesso nome (rapporto vuoto: "Da completare"). */
  creaPersonaPerUtente(u) {
    if (!u || u.ruolo === 'esterno' || this.personaDiUtente(u.id)) return null;
    const ora = adesso();
    return this.inserisci('persone', { nome: u.nome, utente_id: u.id, rapporto: u.ruolo === 'titolare' ? 'titolare' : '', creato: ora, modificato: ora },
      'id', 'la persona dell\'utente nuovo');
  },

  /**
   * L'uscita di una persona disattiva il suo accesso dalla fine di quel giorno: qui (all'avvio, ogni notte, e quando
   * un token arriva) gli utenti delle persone uscite prima di oggi si disattivano e i loro dispositivi escono.
   */
  applicaUscite() {
    const t = oggi();
    let fatte = 0;
    for (const p of this.db.righe("SELECT p.id, p.utente_id, p.uscita_il FROM persone p JOIN utenti u ON u.id = p.utente_id WHERE p.uscita_il <> '' AND p.uscita_il < ? AND u.attivo = 1", t)) {
      this.aggiorna('utenti', p.utente_id, { attivo: 0 }, 'id', 'uscita: ' + dataIt(p.uscita_il) + ', accesso disattivato');
      this.db.esegui('UPDATE sessioni SET revocata = ? WHERE utente_id = ? AND revocata IS NULL', adesso(), p.utente_id);
      fatte++;
    }
    return fatte;
  },

  // ------------------------------------------------------------------ l'organico e la scheda

  /** Lo stato visto di una qualifica: Valida, Scade fra N giorni, Scaduta, Non scade. */
  statoQualifica(q, preavviso) {
    if (!q.scade) return { statoVisto: 'Non scade', statoDettaglio: '', giorni: null };
    const g = giorniTra(oggi(), q.scade);
    if (g < 0) return { statoVisto: 'Scaduta', statoDettaglio: 'da ' + (-g === 1 ? '1 giorno' : -g + ' giorni'), giorni: -g };
    if (g <= (preavviso === null || preavviso === undefined ? 30 : preavviso)) {
      return { statoVisto: g === 0 ? 'Scade oggi' : 'Scade fra ' + (g === 1 ? '1 giorno' : g + ' giorni'), statoDettaglio: '', giorni: g };
    }
    return { statoVisto: 'Valida', statoDettaglio: 'fino al ' + dataIt(q.scade), giorni: g };
  },

  tipiQualifica() {
    const out = {};
    this.db.righe('SELECT * FROM qualifica_tipi').forEach(t => { out[t.chiave] = t; });
    return out;
  },

  qualificaDaRiga(q, tipi) {
    const t = (tipi || this.tipiQualifica())[q.tipo] || {};
    const st = this.statoQualifica(q, t.preavviso_giorni);
    return {
      id: q.id, idPersona: q.persona_id, tipo: q.tipo, nome: t.nome || q.tipo, gruppo: t.gruppo || 'altro', titolo: q.titolo, data: q.data,
      scade: q.scade, ente: q.ente, ore: q.ore, idDocumento: q.documento_id, idScadenza: q.scadenza_id, nota: q.nota,
      statoVisto: st.statoVisto, statoDettaglio: st.statoDettaglio, giorni: st.giorni, rinnovataDa: q.rinnovata_da,
    };
  },

  visitaDaRiga(v) {
    return datiPersona({
      id: v.id, idPersona: v.persona_id, data: v.data, tipo: v.tipo, giudizio: v.giudizio, giudizioVisto: v.giudizio ? NOMI_GIUDIZIO[v.giudizio] : '',
      prescrizioni: v.prescrizioni, validoFino: v.valido_fino, prossima: v.prossima, medico: v.medico, idDocumento: v.documento_id,
      riga: 'Visita del ' + dataIt(v.data) + (v.prossima ? ' · prossima il ' + dataIt(v.prossima) : ''),
    }, v.persona_id, 'visita');
  },

  dpiDaRiga(x, nomi) {
    return datiPersona({
      id: x.id, idLocale: x.id_locale || '', idPersona: x.persona_id, persona: (nomi || {})[x.persona_id] || this.nomePersona(x.persona_id),
      cosa: x.cosa, taglia: x.taglia, quantita: x.quantita, data: x.data, idAttrezzatura: x.attrezzatura_id, scade: x.scade,
      firmata: !!x.firma_file_id, firmataIl: dataOraIso(x.firmata_il), firma: x.firma_file_id ? { id: x.firma_file_id, url: urlFile(x.firma_file_id) } : null,
      restituitoIl: x.restituito_il, nota: x.nota, daFirmare: !x.firma_file_id && !x.restituito_il,
    }, x.persona_id, 'scheda');
  },

  /** Cosa manca a una scheda per un conto (solo a chi puo' scriverlo): le frasi pronte. */
  daCompletareDi(p, costoOggi) {
    const out = [];
    if (this.livello('persone') < 2) return out;
    if (!p.rapporto) out.push('Scegli il rapporto con lo studio');
    if (this.livello('costi') >= 2 && p.utente_id && p.rapporto !== 'titolare' && !costoOggi) out.push('Manca il costo orario: le sue ore usano il costo dello studio');
    return out;
  },

  /** Un'assenza in corso oggi di una persona, come la vede chi chiede ({dal, al, tipoVisto} o null). */
  assenteOggiDi(idPersona, giorno) {
    const g = giorno || oggi();
    const a = this.db.riga("SELECT * FROM assenze WHERE persona_id = ? AND stato = 'approvata' AND dal <= ? AND al >= ? ORDER BY dal LIMIT 1", idPersona, g, g);
    if (!a) return null;
    return { dal: a.dal, al: a.al, tipoVisto: this.tipoVistoAssenza(a) };
  },

  /** Le cose che la persona ha in uso (mezzi e attrezzature con un'assegnazione o un prestito in corso). */
  inUsoDi(idPersona) {
    const mezzi = [];
    const attrezzature = [];
    for (const x of this.db.righe('SELECT * FROM assegnazioni WHERE persona_id = ? AND al IS NULL ORDER BY dal', idPersona)) {
      if (x.veicolo_id) {
        const v = this.db.riga('SELECT * FROM veicoli WHERE id = ?', x.veicolo_id);
        if (v) mezzi.push({ tipo: 'mezzo', id: v.id, nome: this.titoloMezzo(v), come: x.tipo, dal: dataIso(x.dal), rientro: x.rientro });
      } else {
        const a = this.db.riga('SELECT * FROM attrezzature WHERE id = ?', x.attrezzatura_id);
        if (a) {
          const t = this.taraturaDi(a);
          attrezzature.push({ id: a.id, codice: a.codice, nome: a.nome, categoria: a.categoria, come: x.tipo, dal: dataIso(x.dal), rientro: x.rientro, taratura: t ? t.parola : '' });
        }
      }
    }
    // L'auto di una persona (proprieta "persona") e' sua.
    for (const v of this.db.righe("SELECT * FROM veicoli WHERE proprieta = 'persona' AND persona_id = ? AND dismesso_il = ''", idPersona)) {
      if (!mezzi.some(m => m.id === v.id)) mezzi.push({ tipo: 'mezzo', id: v.id, nome: this.titoloMezzo(v), come: 'sua', dal: '', rientro: '' });
    }
    return { mezzi, attrezzature };
  },

  /** La riga dell'organico. */
  personaInElenco(p, aiuti) {
    const costo = this.costoDiOggi(p.id);
    const u = p.utente_id ? aiuti.utenti[p.utente_id] : null;
    const o = {
      id: p.id, nome: p.nome, rapporto: p.rapporto, rapportoNome: NOMI_RAPPORTO[p.rapporto] || '', ruoloStudio: p.ruolo_studio,
      telefonoLavoro: p.telefono_lavoro, emailLavoro: p.email_lavoro, entrataIl: p.entrata_il, uscitaIl: p.uscita_il,
      idUtente: p.utente_id, ruoloWisper: u ? u.ruolo : '', accessoAttivo: u ? u.attivo === 1 : false,
      assenteOggi: this.assenteOggiDi(p.id), daCompletare: !p.rapporto, anonimizzata: !!p.anonimizzata_il,
    };
    if (this.vedePersonaliDi(p.id)) {
      o.scadenzeVicine = this.db.righe("SELECT data, preavviso_giorni FROM scadenze WHERE persona_id = ? AND stato = 'aperta'", p.id)
        .filter(s => giorniTra(oggi(), s.data) <= s.preavviso_giorni).length;
      o.scadute = this.db.riga("SELECT COUNT(*) n FROM scadenze WHERE persona_id = ? AND stato = 'aperta' AND data < ?", p.id, oggi()).n;
    }
    if (this.vedeCosti()) {
      o.costoOrario = costo ? costo.costo_orario : null;
      o.costoDal = costo ? costo.dal : '';
    }
    return o;
  },

  /** persone {stato?: attive|uscite|tutte, testo?} (persone 1). Il collaboratore riceve le attive coi campi di lavoro. */
  leggiPersone(d) {
    d = d || {};
    let stato = testo(d.stato) || 'attive';
    if (['attive', 'uscite', 'tutte'].indexOf(stato) < 0) throw new Rifiuto('Stato: attive, uscite o tutte');
    if (this.soloSuoi()) stato = 'attive';
    const t = oggi();
    let righe = this.db.righe('SELECT * FROM persone ORDER BY nome, id');
    const uscita = p => !!p.uscita_il && p.uscita_il < t;
    if (stato === 'attive') righe = righe.filter(p => !uscita(p) && !p.anonimizzata_il);
    else if (stato === 'uscite') righe = righe.filter(p => uscita(p) || p.anonimizzata_il);
    const cerca = testo(d.testo).toLowerCase();
    if (cerca) righe = righe.filter(p => [p.nome, p.ruolo_studio, p.mansione].some(x => String(x || '').toLowerCase().indexOf(cerca) >= 0));
    const aiuti = { utenti: {} };
    this.db.righe('SELECT id, ruolo, attivo FROM utenti').forEach(u => { aiuti.utenti[u.id] = u; });
    const persone = righe.map(p => this.personaInElenco(p, aiuti));
    const attive = this.db.righe('SELECT * FROM persone').filter(p => !uscita(p) && !p.anonimizzata_il);
    return {
      ok: true, persone,
      conteggi: {
        attive: attive.length, senzaAccesso: attive.filter(p => !p.utente_id).length,
        assentiOggi: attive.filter(p => this.assenteOggiDi(p.id)).length, daCompletare: attive.filter(p => !p.rapporto).length,
      },
    };
  },

  /** persona {id} (persone 1; la propria scheda anche al collaboratore): la scheda coi tre livelli (§5.1). */
  personaCompleta(p) {
    const id = p.id;
    const personali = this.vedePersonaliDi(id);
    const lavoro = this.vedeLavoroCompleto(id);
    const u = p.utente_id ? this.db.riga('SELECT * FROM utenti WHERE id = ?', p.utente_id) : null;
    const costo = this.costoDiOggi(id);
    const orario = this.orarioPersona(p);
    const o = datiPersona({
      id, nome: p.nome, rapporto: p.rapporto, rapportoNome: NOMI_RAPPORTO[p.rapporto] || '', ruoloStudio: p.ruolo_studio, mansione: p.mansione,
      emailLavoro: p.email_lavoro, telefonoLavoro: p.telefono_lavoro, entrataIl: p.entrata_il, uscitaIl: p.uscita_il,
      oreSettimana: p.ore_settimana, giorniSettimana: orario.giorniSettimana, oreGiorno: C.oreGiornoPersona(orario), partTime: p.part_time === 1,
      idUtente: p.utente_id, ruoloWisper: u ? u.ruolo : '', accessoAttivo: u ? u.attivo === 1 : false, ultimoAccesso: u ? dataOraIso(u.ultimo_accesso) : '',
      assenteOggi: this.assenteOggiDi(id), anonimizzata: !!p.anonimizzata_il, anonimizzataIl: dataOraIso(p.anonimizzata_il),
      // personali (togliPersonali li toglie a chi non li vede)
      codiceFiscale: p.codice_fiscale, nascitaData: p.nascita_data, nascitaLuogo: p.nascita_luogo, indirizzo: p.indirizzo, cap: p.cap,
      citta: p.citta, provincia: p.provincia, telefonoPersonale: p.telefono_personale, emailPersonale: p.email_personale, iban: p.iban,
      emergenzaNome: p.emergenza_nome, emergenzaTelefono: p.emergenza_telefono, contrattoTipo: p.contratto_tipo, contrattoScade: p.contratto_scade,
      motivoUscita: p.motivo_uscita, ferieAnnueOre: p.ferie_annue_ore, permessiAnnuiOre: p.permessi_annui_ore,
      // riservati
      ccnl: p.ccnl, livello: p.livello, noteRiservate: p.note_riservate,
    }, id, 'scheda');
    if (this.vedeCosti()) {
      o.costoOrario = costo ? costo.costo_orario : null;
      o.costoDal = costo ? costo.dal : '';
      o.costoAnno = costo ? costo.costo_anno : null;
      o.oreAnno = costo ? costo.ore_anno : null;
      o.notaCosto = costo ? costo.nota : '';
      o.costi = this.costiDaMandare(id);
    }
    // Ha in uso: mezzi e attrezzature (dati di lavoro).
    const uso = this.inUsoDi(id);
    o.mezzi = uso.mezzi;
    o.attrezzature = uso.attrezzature;
    o.qualifiche = [];
    if (lavoro) {
      const tipi = this.tipiQualifica();
      o.qualifiche = this.db.righe('SELECT * FROM qualifiche WHERE persona_id = ? AND tolta IS NULL ORDER BY (rinnovata_da IS NOT NULL), data DESC, id DESC', id)
        .map(q => this.qualificaDaRiga(q, tipi));
    }
    if (personali) {
      const visite = this.db.righe('SELECT * FROM visite_mediche WHERE persona_id = ? ORDER BY data DESC, id DESC', id);
      o.visite = visite.map(v => this.visitaDaRiga(v));
      const prossima = visite.find(v => v.prossima);
      o.prossimaVisita = prossima ? prossima.prossima : '';
      o.dpi = this.db.righe('SELECT * FROM dpi_consegne WHERE persona_id = ? ORDER BY data DESC, id DESC', id).map(x => this.dpiDaRiga(x));
      o.saldi = this.saldiPersona(p);
      o.assenze = this.assenzeDellaPersona(id, { future: true });
      const a = this.aiutiScadenze();
      o.scadenze = this.db.righe("SELECT * FROM scadenze WHERE persona_id = ? AND stato = 'aperta' ORDER BY data", id).map(s => this.scadenzaDaRiga(s, a));
      o.documenti = this.documentiDellaPersona(id);
    } else {
      o.documenti = [];
    }
    o.puoScrivere = this.livello('persone') >= 2;
    o.puoCambiareContatti = this.livello('persone') >= 2 || id === this.miaPersonaId();
    o.puoVedereRiservati = this.vedeRiservatiDi(id);
    o.puoApprovare = this.puoApprovareAssenze() && (id !== this.miaPersonaId() || (this.chi().utente && this.chi().utente.ruolo === 'titolare'));
    o.daCompletare = this.daCompletareDi(p, costo);
    o.programmaPaghe = 'non collegato';
    return o;
  },

  /** I documenti della persona che chi chiede vede (persone 2 e la persona; i riservati con "riservati"). */
  documentiDellaPersona(idPersona) {
    const righe = this.db.righe('SELECT * FROM documenti WHERE persona_id = ? AND archiviato IS NULL ORDER BY modificato DESC, id DESC', idPersona)
      .filter(x => this.vedeDocumento(x));
    if (!righe.length) return [];
    const a = this.aiutiDocumenti(righe);
    return righe.map(x => datiPersona(Object.assign(this.documentoDaRiga(x, a), { riservato: x.vede === 'riservati' }), idPersona, 'documento'));
  },

  // ------------------------------------------------------------------ scrivere la scheda

  /**
   * salvaPersona {persona: {...}} (persone 2: tutto, i riservati con riservati 2; la persona stessa solo i suoi
   * contatti personali, l'indirizzo, l'IBAN e il contatto di emergenza). Il nome cambia anche nell'utente.
   */
  salvaPersona(d) {
    const x = (d && d.persona) || d || {};
    const prima = testo(x.id) ? this.rigaPersona(x.id) : null;
    if (prima && prima.anonimizzata_il) throw new Rifiuto('La scheda è stata resa anonima: non si cambia');
    const scrive = this.livello('persone') >= 2;
    const propria = prima && prima.id === this.miaPersonaId();
    if (!prima && !scrive) throw senzaPermesso('aggiungere persone');
    if (prima && !scrive && !propria) throw senzaPermesso('cambiare le schede degli altri');
    const v = {};
    const diversi = [];
    const valore = k => {
      if (CAMPI_DATA.indexOf(k) >= 0) return testo(x[k]) ? dataDaIso(x[k]) : '';
      return testo(x[k]);
    };
    for (const k of Object.keys(CAMPI)) {
      if (x[k] === undefined) continue;
      const nuovo = valore(k);
      if (prima && String(prima[CAMPI[k]] || '') === nuovo) continue;
      v[CAMPI[k]] = nuovo;
      diversi.push(k);
    }
    const altri = { rapporto: 'rapporto', oreSettimana: 'ore_settimana', giorniSettimana: 'giorni_settimana', partTime: 'part_time',
      ferieAnnueOre: 'ferie_annue_ore', permessiAnnuiOre: 'permessi_annui_ore' };
    for (const k of Object.keys(altri)) {
      if (x[k] === undefined) continue;
      let nuovo;
      if (k === 'rapporto') nuovo = testo(x.rapporto).toLowerCase();
      else if (k === 'giorniSettimana') {
        const l = Array.isArray(x.giorniSettimana) ? x.giorniSettimana.map(Number).filter(n => n >= 1 && n <= 7) : [];
        if (!l.length) throw new Rifiuto('Giorni: scegli in che giorni lavora');
        nuovo = JSON.stringify(Array.from(new Set(l)).sort());
      } else if (k === 'partTime') nuovo = si(x.partTime) ? 1 : 0;
      else nuovo = numeroONull(x[k]);
      const vecchio = prima ? prima[altri[k]] : undefined;
      if (prima && (vecchio === nuovo || (vecchio !== null && nuovo !== null && String(vecchio) === String(nuovo)))) continue;
      v[altri[k]] = nuovo;
      diversi.push(k);
    }
    if (!scrive) {
      // La persona stessa: solo i suoi contatti. Il resto, se arriva uguale, si ignora; se cambia, si dice di no.
      if (diversi.some(k => SUOI_CAMPI.indexOf(k) < 0)) throw new Rifiuto('Puoi cambiare solo i tuoi contatti, l\'indirizzo, l\'IBAN e il contatto di emergenza', { permesso: false });
    }
    if (diversi.some(k => CAMPI_RISERVATI_SCHEDA.indexOf(k) >= 0) && this.livello('riservati') < 2) throw senzaPermesso('scrivere i dati riservati');
    // Controlli
    const nome = v.nome !== undefined ? v.nome : prima ? prima.nome : '';
    if (!nome) throw new Rifiuto('Nome: scrivi il nome');
    if (v.rapporto !== undefined && v.rapporto !== '' && RAPPORTI.indexOf(v.rapporto) < 0) throw new Rifiuto('Rapporto: titolare, socio, dipendente, apprendista, tirocinante, autonomo o altro');
    if (v.contratto_tipo !== undefined && v.contratto_tipo !== '' && CONTRATTI.indexOf(v.contratto_tipo) < 0) {
      throw new Rifiuto('Contratto: indeterminato, determinato, apprendistato, stage, parasubordinato o partita_iva');
    }
    if (v.codice_fiscale !== undefined) {
      v.codice_fiscale = v.codice_fiscale.toUpperCase().replace(/\s/g, '');
      if (v.codice_fiscale && !/^[A-Z0-9]{16}$/.test(v.codice_fiscale)) throw new Rifiuto('Codice fiscale: deve avere 16 caratteri');
    }
    if (v.iban !== undefined) {
      v.iban = v.iban.toUpperCase().replace(/\s/g, '');
      if (v.iban && !C.ibanValido(v.iban)) throw new Rifiuto('IBAN: non sembra giusto');
    }
    if (v.provincia !== undefined) v.provincia = v.provincia.toUpperCase();
    if (v.cap !== undefined && v.cap && !/^\d{5}$/.test(v.cap)) throw new Rifiuto('CAP: deve avere 5 cifre');
    for (const k of ['email_lavoro', 'email_personale']) if (v[k] && !/^[^@\s]+@[^@\s]+$/.test(v[k])) throw new Rifiuto('Email: manca la @ o c\'è uno spazio');
    if (v.ore_settimana !== undefined && v.ore_settimana !== null && !(v.ore_settimana >= 1 && v.ore_settimana <= 60)) throw new Rifiuto('Ore alla settimana: da 1 a 60');
    for (const k of ['ferie_annue_ore', 'permessi_annui_ore']) {
      if (v[k] !== undefined && v[k] !== null && !(v[k] >= 0 && v[k] <= 1000)) throw new Rifiuto((k === 'ferie_annue_ore' ? 'Ferie' : 'Permessi') + ' all\'anno: da 0 a 1000 ore');
    }
    const entrata = v.entrata_il !== undefined ? v.entrata_il : prima ? prima.entrata_il : '';
    const uscita = prima ? prima.uscita_il : '';
    if (entrata && uscita && uscita < entrata) throw new Rifiuto('Uscita: non può venire prima dell\'entrata');
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('persone', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('persone', Object.assign({ rapporto: '', giorni_settimana: '[1,2,3,4,5]' }, v, { nome, creato: ora, modificato: ora }));
    }
    const dopo = this.db.riga('SELECT * FROM persone WHERE id = ?', id);
    // Il nome sta in tutti e due i posti: il server li tiene uguali (stessa transazione).
    if (dopo.utente_id && v.nome !== undefined) {
      const u = this.db.riga('SELECT nome FROM utenti WHERE id = ?', dopo.utente_id);
      if (u && u.nome !== dopo.nome) this.aggiorna('utenti', dopo.utente_id, { nome: dopo.nome }, 'id', 'il nome della scheda della persona');
    }
    // La scadenza del contratto a termine ("Contratto di {persona} finisce", una volta, preavviso 60).
    if (v.contratto_scade !== undefined || v.nome !== undefined) this.scadenzaContratto(dopo);
    if (diversi.some(k => CAMPI_RISERVATI_SCHEDA.indexOf(k) >= 0)) this.registraAccessoRiservato(id, 'scheda', 'cambiato', '');
    return { ok: true, persona: this.personaCompleta(dopo) };
  },

  /** Crea, sposta o toglie la scadenza della fine del contratto di lavoro. */
  scadenzaContratto(p) {
    const attuale = p.scadenza_contratto_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', p.scadenza_contratto_id) : null;
    const ora = adesso();
    if (!p.contratto_scade) {
      if (attuale && attuale.stato === 'aperta') this.aggiorna('scadenze', attuale.id, { stato: 'annullata', motivo: 'tolta dalla scheda', modificato: ora });
      return;
    }
    const titolo = 'Contratto di ' + p.nome + ' finisce';
    if (attuale && attuale.stato === 'aperta') {
      this.aggiorna('scadenze', attuale.id, { data: p.contratto_scade, titolo, modificato: ora });
      return;
    }
    const id = this.inserisci('scadenze', {
      titolo, tipo: 'contratto_lavoro', persona_id: p.id, data: p.contratto_scade, preavviso_giorni: 60, ogni_mesi: null, dalla_fatta: 0,
      azione: 'promemoria', stato: 'aperta', creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
    });
    this.aggiorna('persone', p.id, { scadenza_contratto_id: id });
  },

  /** daiAccesso {idPersona, email, ruolo} (amministrazione 2): crea l'utente col nome della persona e lo lega. */
  async daiAccesso(d) {
    const p = this.rigaPersona(d.idPersona);
    if (p.utente_id) throw new Rifiuto(p.nome + ' ha già l\'accesso');
    if (p.anonimizzata_il) throw new Rifiuto('La scheda è stata resa anonima');
    const ruolo = testo(d.ruolo).toLowerCase() || 'collaboratore';
    if (['titolare', 'amministrazione', 'collaboratore', 'lettura'].indexOf(ruolo) < 0) throw new Rifiuto('Ruolo: titolare, amministrazione, collaboratore o lettura');
    return this.salvaUtente({ nome: p.nome, email: d.email, ruolo, perPersona: p.id });
  },

  // ------------------------------------------------------------------ competenze e formazione

  qualificheTipi() {
    return {
      ok: true,
      tipi: this.db.righe('SELECT * FROM qualifica_tipi ORDER BY ordine, nome').map(t => ({
        chiave: t.chiave, nome: t.nome, gruppo: t.gruppo, ogniMesi: t.ogni_mesi, preavvisoGiorni: t.preavviso_giorni, ordine: t.ordine,
        attivo: t.attivo === 1, sistema: t.sistema === 1,
      })),
    };
  },

  /** salvaQualificaTipo {tipo: {chiave?, nome, gruppo, ogniMesi, preavvisoGiorni, attivo}} (amministrazione 2). */
  salvaQualificaTipo(d) {
    const x = (d && d.tipo) || {};
    const nome = testo(x.nome);
    let chiave = testo(x.chiave).toLowerCase();
    const prima = chiave ? this.db.riga('SELECT * FROM qualifica_tipi WHERE chiave = ?', chiave) : null;
    if (!nome && !prima) throw new Rifiuto('Nome: scrivi il nome della formazione o abilitazione');
    if (!chiave) chiave = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'tipo';
    const gruppo = x.gruppo !== undefined ? testo(x.gruppo) || 'altro' : prima ? prima.gruppo : 'altro';
    if (GRUPPI_QUALIFICA.indexOf(gruppo) < 0) throw new Rifiuto('Gruppo: elettrico, sicurezza, emergenza o altro');
    const ogni = x.ogniMesi !== undefined ? (vuoto(x.ogniMesi) || Number(x.ogniMesi) === 0 ? null : Math.round(numero(x.ogniMesi))) : prima ? prima.ogni_mesi : null;
    if (ogni !== null && !(ogni >= 1 && ogni <= 240)) throw new Rifiuto('Ogni: da 1 a 240 mesi');
    const preavviso = x.preavvisoGiorni !== undefined ? (vuoto(x.preavvisoGiorni) ? null : Math.round(numero(x.preavvisoGiorni))) : prima ? prima.preavviso_giorni : 30;
    if (preavviso !== null && !(preavviso >= 0 && preavviso <= 365)) throw new Rifiuto('Preavviso: da 0 a 365 giorni');
    const v = { nome: nome || prima.nome, gruppo, ogni_mesi: ogni, preavviso_giorni: preavviso, attivo: x.attivo !== undefined ? (si(x.attivo) ? 1 : 0) : prima ? prima.attivo : 1 };
    if (prima) this.aggiorna('qualifica_tipi', chiave, v, 'chiave');
    else {
      if (this.db.riga('SELECT chiave FROM qualifica_tipi WHERE chiave = ?', chiave)) throw new Rifiuto('C\'è già un tipo «' + nome + '»');
      const ordine = (this.db.riga('SELECT MAX(ordine) m FROM qualifica_tipi').m || 0) + 1;
      this.inserisci('qualifica_tipi', Object.assign({ chiave, ordine, sistema: 0 }, v), 'chiave');
    }
    return this.qualificheTipi();
  },

  /** Un documento dell'archivio fatto da un file di /carica, legato a una persona, a un mezzo, a uno strumento o a un incarico. */
  documentoDaCarica({ idFile, titolo, categoria, personaId, veicoloId, attrezzaturaId, incaricoId, clienteId, dataDocumento, riferimento }) {
    const f = this.fileDaLegare(idFile);
    const cat = this.categoriaDiSistema(categoria);
    if (!cat) throw new Rifiuto('Categoria «' + categoria + '» non trovata');
    this.controllaSpazio('documento');
    const ora = adesso();
    const id = this.inserisci('documenti', {
      titolo: testo(titolo) || String(f.nome || f.id).replace(/\.[A-Za-z0-9]{1,5}$/, ''), categoria_id: cat.id, cliente_id: clienteId || '', commessa_id: '',
      origine: 'file', vede: cat.vede, data_documento: dataDocumento || ora.slice(0, 10), riferimento: testo(riferimento),
      persona_id: personaId || null, veicolo_id: veicoloId || null, attrezzatura_id: attrezzaturaId || null, incarico_id: incaricoId || null,
      creato_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
    });
    this.aggiungiVersione(id, f, '', 'approvata', '');
    return id;
  },

  /**
   * salvaQualifica {qualifica: {id?, idPersona, tipo, titolo?, data, scade?, ente?, ore?, idFile?, nota?}, rinnova?: id}
   * (persone 2): con "scade" nasce la sua scadenza (formazione o abilitazione); "Rinnova" fa la qualifica nuova e segna
   * fatta la scadenza della vecchia, che resta nello storico.
   */
  salvaQualifica(d) {
    const x = (d && d.qualifica) || {};
    const prima = testo(x.id) ? this.db.riga('SELECT * FROM qualifiche WHERE id = ?', Number(x.id) || 0) : null;
    if (testo(x.id) && !prima) throw new Rifiuto('Qualifica ' + testo(x.id) + ' non trovata');
    const vecchia = testo(d.rinnova) ? this.db.riga('SELECT * FROM qualifiche WHERE id = ?', Number(d.rinnova) || 0) : null;
    if (testo(d.rinnova) && !vecchia) throw new Rifiuto('Qualifica ' + testo(d.rinnova) + ' non trovata');
    const p = this.rigaPersona(x.idPersona !== undefined ? x.idPersona : prima ? prima.persona_id : vecchia ? vecchia.persona_id : null);
    const tipi = this.tipiQualifica();
    const tipo = x.tipo !== undefined ? testo(x.tipo) : prima ? prima.tipo : vecchia ? vecchia.tipo : '';
    const t = tipi[tipo];
    if (!t) throw new Rifiuto('Tipo: scegli la formazione o l\'abilitazione');
    const data = x.data !== undefined ? (testo(x.data) ? dataDaIso(x.data) : '') : prima ? prima.data : '';
    if (!data) throw new Rifiuto('Data: scrivi quando l\'ha conseguita');
    let scade;
    if (x.scade !== undefined) scade = testo(x.scade) ? dataDaIso(x.scade) : '';
    else if (prima && prima.data === data) scade = prima.scade;
    else scade = t.ogni_mesi ? C.piuMesi(data, t.ogni_mesi) : '';
    if (scade && scade <= data) throw new Rifiuto('Scade: deve venire dopo la data');
    const titolo = x.titolo !== undefined ? testo(x.titolo) : prima ? prima.titolo : '';
    if (tipo === 'altro' && !titolo) throw new Rifiuto('Altro: scrivi di cosa si tratta');
    const v = {
      persona_id: p.id, tipo, titolo, data, scade, ente: x.ente !== undefined ? testo(x.ente) : prima ? prima.ente : '',
      ore: x.ore !== undefined ? numeroONull(x.ore) : prima ? prima.ore : null, nota: x.nota !== undefined ? testo(x.nota) : prima ? prima.nota : '',
    };
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('qualifiche', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('qualifiche', Object.assign(v, { creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora }));
    }
    if (testo(x.idFile)) {
      const doc = this.documentoDaCarica({ idFile: x.idFile, titolo: (t.nome ? nomeCorto(t.nome) : tipo) + ' di ' + p.nome, categoria: 'Attestati e abilitazioni', personaId: p.id, dataDocumento: data });
      this.aggiorna('qualifiche', id, { documento_id: doc });
    }
    const q = this.db.riga('SELECT * FROM qualifiche WHERE id = ?', id);
    // La scadenza: una per qualifica.
    const s = q.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', q.scadenza_id) : null;
    const titoloScadenza = (tipo === 'altro' ? titolo : nomeCorto(t.nome)) + ' di ' + p.nome;
    if (q.scade) {
      if (s && s.stato === 'aperta') this.aggiorna('scadenze', s.id, { data: q.scade, titolo: titoloScadenza, modificato: ora });
      else if (!s || s.stato !== 'fatta') {
        const sid = this.inserisci('scadenze', {
          titolo: titoloScadenza, tipo: t.gruppo === 'elettrico' || tipo === 'patente' ? 'abilitazione' : 'formazione', persona_id: p.id, qualifica_id: id,
          documento_id: q.documento_id, data: q.scade, preavviso_giorni: t.preavviso_giorni === null ? 30 : t.preavviso_giorni, ogni_mesi: null, dalla_fatta: 1,
          azione: 'promemoria', stato: 'aperta', creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
        });
        this.aggiorna('qualifiche', id, { scadenza_id: sid });
      }
    } else if (s && s.stato === 'aperta') this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo: 'la qualifica non scade più', modificato: ora });
    // Rinnova: la vecchia resta nello storico, la sua scadenza e' fatta (dalla nuova).
    if (vecchia && !prima) {
      this.aggiorna('qualifiche', vecchia.id, { rinnovata_da: id, modificato: ora }, 'id', 'rinnovata');
      const sv = vecchia.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', vecchia.scadenza_id) : null;
      if (sv && sv.stato === 'aperta') this.aggiorna('scadenze', sv.id, { stato: 'fatta', fatta_il: data, documento_fatto_id: q.documento_id, modificato: ora });
    }
    const dopo = this.db.riga('SELECT * FROM qualifiche WHERE id = ?', id);
    const sc = dopo.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', dopo.scadenza_id) : null;
    return { ok: true, qualifica: this.qualificaDaRiga(dopo), scadenza: sc ? this.scadenzaDaRiga(sc) : null };
  },

  /** togliQualifica {id, annulla?} (persone 2): la qualifica esce dalla scheda (annulla la rimette); la sua scadenza si toglie. */
  togliQualifica(d) {
    const q = this.db.riga('SELECT * FROM qualifiche WHERE id = ?', Number(d.id) || 0);
    if (!q) throw new Rifiuto('Qualifica ' + testo(d.id) + ' non trovata');
    this.rigaPersona(q.persona_id);
    const ora = adesso();
    if (si(d.annulla)) {
      if (q.tolta) this.aggiorna('qualifiche', q.id, { tolta: null, modificato: ora });
    } else if (!q.tolta) {
      this.aggiorna('qualifiche', q.id, { tolta: ora, modificato: ora });
      const s = q.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', q.scadenza_id) : null;
      if (s && s.stato === 'aperta') this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo: 'qualifica tolta', modificato: ora });
    }
    return { ok: true, qualifica: this.qualificaDaRiga(this.db.riga('SELECT * FROM qualifiche WHERE id = ?', q.id)) };
  },

  // ------------------------------------------------------------------ visite mediche

  /**
   * salvaVisita {visita: {id?, idPersona, data, tipo, giudizio?, prescrizioni?, validoFino?, prossima?, medico?, idFile?}}
   * (persone 2; giudizio, prescrizioni, validoFino e il documento con riservati 2). Mai la diagnosi: non c'e' il campo.
   */
  salvaVisita(d) {
    const x = (d && d.visita) || {};
    const prima = testo(x.id) ? this.db.riga('SELECT * FROM visite_mediche WHERE id = ?', Number(x.id) || 0) : null;
    if (testo(x.id) && !prima) throw new Rifiuto('Visita ' + testo(x.id) + ' non trovata');
    const p = this.rigaPersona(x.idPersona !== undefined ? x.idPersona : prima ? prima.persona_id : null);
    const riservati = ['giudizio', 'prescrizioni', 'validoFino', 'idFile'].some(k => x[k] !== undefined && testo(x[k]) !== '' &&
      !(prima && k !== 'idFile' && String(prima[{ giudizio: 'giudizio', prescrizioni: 'prescrizioni', validoFino: 'valido_fino' }[k]] || '') === testo(x[k])));
    if (riservati && this.livello('riservati') < 2) throw senzaPermesso('scrivere il giudizio del medico (è un dato riservato)');
    const data = x.data !== undefined ? (testo(x.data) ? dataDaIso(x.data) : '') : prima ? prima.data : '';
    if (!data) throw new Rifiuto('Data: scrivi il giorno della visita');
    const tipo = x.tipo !== undefined ? testo(x.tipo) || 'periodica' : prima ? prima.tipo : 'periodica';
    if (TIPI_VISITA.indexOf(tipo) < 0) throw new Rifiuto('Tipo: preventiva, periodica, richiesta, cambio_mansione, rientro o cessazione');
    const giudizio = x.giudizio !== undefined ? testo(x.giudizio) : prima ? prima.giudizio : '';
    if (giudizio && GIUDIZI.indexOf(giudizio) < 0) throw new Rifiuto('Giudizio: idoneo, idoneo_prescrizioni, non_idoneo_temporaneo o non_idoneo');
    const prossima = x.prossima !== undefined ? (testo(x.prossima) ? dataDaIso(x.prossima) : '') : prima ? prima.prossima : '';
    if (prossima && prossima <= data) throw new Rifiuto('Prossima: deve venire dopo la visita');
    const v = {
      persona_id: p.id, data, tipo, giudizio,
      prescrizioni: x.prescrizioni !== undefined ? testo(x.prescrizioni) : prima ? prima.prescrizioni : '',
      valido_fino: x.validoFino !== undefined ? (testo(x.validoFino) ? dataDaIso(x.validoFino) : '') : prima ? prima.valido_fino : '',
      prossima, medico: x.medico !== undefined ? testo(x.medico) : prima ? prima.medico : '',
    };
    const ora = adesso();
    const io = this.chi().utente ? this.chi().utente.id : null;
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('visite_mediche', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('visite_mediche', Object.assign(v, { creata_da: io, creato: ora, modificato: ora }));
      // La visita fatta chiude la scadenza "Visita medica" aperta della persona.
      for (const s of this.db.righe("SELECT * FROM scadenze WHERE persona_id = ? AND tipo = 'visita_medica' AND stato = 'aperta'", p.id)) {
        this.aggiorna('scadenze', s.id, { stato: 'fatta', fatta_il: data, modificato: ora });
      }
    }
    if (testo(x.idFile)) {
      const doc = this.documentoDaCarica({ idFile: x.idFile, titolo: 'Giudizio di idoneità del ' + dataIt(data), categoria: 'Idoneità sanitarie', personaId: p.id, dataDocumento: data });
      this.aggiorna('visite_mediche', id, { documento_id: doc });
    }
    // La prossima visita fa nascere (o sposta) la sua scadenza.
    const vis = this.db.riga('SELECT * FROM visite_mediche WHERE id = ?', id);
    const s = vis.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', vis.scadenza_id) : null;
    if (vis.prossima) {
      if (s && s.stato === 'aperta') this.aggiorna('scadenze', s.id, { data: vis.prossima, modificato: ora });
      else if (!s) {
        const sid = this.inserisci('scadenze', {
          titolo: 'Visita medica di ' + p.nome, tipo: 'visita_medica', persona_id: p.id, visita_id: id, data: vis.prossima, preavviso_giorni: 30,
          ogni_mesi: null, dalla_fatta: 1, azione: 'promemoria', stato: 'aperta', creata_da: io, creato: ora, modificato: ora,
        });
        this.aggiorna('visite_mediche', id, { scadenza_id: sid });
      }
    } else if (s && s.stato === 'aperta') this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo: 'tolta dalla visita', modificato: ora });
    if (riservati) this.registraAccessoRiservato(p.id, 'visita', 'cambiato', id);
    return { ok: true, visita: this.visitaDaRiga(this.db.riga('SELECT * FROM visite_mediche WHERE id = ?', id)) };
  },

  /** togliVisita {id} (persone 2): la riga si toglie (e la sua scadenza si annulla). */
  togliVisita(d) {
    const v = this.db.riga('SELECT * FROM visite_mediche WHERE id = ?', Number(d.id) || 0);
    if (!v) throw new Rifiuto('Visita ' + testo(d.id) + ' non trovata');
    this.rigaPersona(v.persona_id);
    if (v.giudizio && this.livello('riservati') < 2) throw senzaPermesso('togliere una visita col giudizio del medico');
    const s = v.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', v.scadenza_id) : null;
    if (s && s.stato === 'aperta') this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo: 'visita tolta', modificato: adesso() });
    this.db.esegui('UPDATE scadenze SET visita_id = NULL WHERE visita_id = ?', v.id);
    this.db.esegui('DELETE FROM visite_mediche WHERE id = ?', v.id);
    this.annota('visite_mediche', v.id, Object.assign({}, v), null, 'tolta');
    return { ok: true };
  },

  // ------------------------------------------------------------------ DPI consegnati

  /**
   * dpi {idPersona?}: le consegne. Chi ha persone 2 o mezzi 2 vede tutte; gli altri solo le proprie (le consegne sono
   * dati personali: fase6.md §3.2; §10.1 diceva "mezzi 1 per tutti", qui si sceglie la strada piu' prudente).
   */
  leggiDpi(d) {
    d = d || {};
    const tutti = this.chi().sistema || this.livello('persone') >= 2 || this.livello('mezzi') >= 2;
    const mia = this.miaPersonaId();
    let idPersona = testo(d.idPersona) ? Number(d.idPersona) : null;
    if (!tutti) {
      if (idPersona !== null && idPersona !== mia) throw senzaPermesso('vedere i DPI degli altri');
      idPersona = mia === null ? -1 : mia;
    }
    const nomi = {};
    this.db.righe('SELECT id, nome FROM persone').forEach(p => { nomi[p.id] = p.nome; });
    const righe = this.db.righe('SELECT * FROM dpi_consegne' + (idPersona !== null ? ' WHERE persona_id = ?' : '') + ' ORDER BY data DESC, id DESC', ...(idPersona !== null ? [idPersona] : []));
    return { ok: true, consegne: righe.map(x => this.dpiDaRiga(x, nomi)), proposte: DPI_PROPOSTI };
  },

  puoConsegnareDpi() {
    return this.chi().sistema || this.livello('persone') >= 2 || this.livello('mezzi') >= 2;
  },

  /** La firma di chi riceve un DPI o uno strumento: un file "firma_consegna". */
  salvaFirmaConsegna(firma, legami, idFile) {
    const dati = Buffer.from(String(firma.base64 || ''), 'base64');
    if (!dati.length) throw new Rifiuto('Firma vuota: firma di nuovo');
    const { tipoDaSalvare } = require('../documenti');
    const mime = tipoDaSalvare(firma.mime || 'image/png', dati.subarray(0, 512));
    if (!/^image\//.test(mime)) throw new Rifiuto('La firma deve essere un\'immagine');
    this.controllaSpazio('lavoro');
    const f = this.salvaFile({ dati, nome: 'firma-consegna.png', mime, tipo: 'firma_consegna', idClient: testo(idFile) || null });
    this.aggiorna('file', f.id, legami);
    return f.id;
  },

  /**
   * salvaConsegnaDpi {consegna: {id?, idLocale?, idPersona, cosa, taglia?, quantita?, data?, idAttrezzatura?, scade?, nota?},
   * firma?: {base64, mime}} (persone 2 o mezzi 2). Un DPI del catalogo consegnato e' assegnato alla persona.
   */
  salvaConsegnaDpi(d) {
    if (!this.puoConsegnareDpi()) throw senzaPermesso('consegnare i DPI');
    const x = (d && d.consegna) || {};
    if (!testo(x.id) && testo(x.idLocale)) {
      const gia = this.db.riga('SELECT * FROM dpi_consegne WHERE id_locale = ?', testo(x.idLocale));
      if (gia) return { ok: true, consegna: this.dpiDaRiga(gia), giaArrivata: true };
    }
    const prima = testo(x.id) ? this.db.riga('SELECT * FROM dpi_consegne WHERE id = ?', Number(x.id) || 0) : null;
    if (testo(x.id) && !prima) throw new Rifiuto('Consegna ' + testo(x.id) + ' non trovata');
    const p = this.rigaPersona(x.idPersona !== undefined ? x.idPersona : prima ? prima.persona_id : null);
    if (p.anonimizzata_il) throw new Rifiuto('La scheda è stata resa anonima');
    const cosa = x.cosa !== undefined ? testo(x.cosa) : prima ? prima.cosa : '';
    if (!cosa) throw new Rifiuto('Cosa: scrivi cosa consegni');
    const quantita = x.quantita !== undefined ? Math.round(numero(x.quantita)) : prima ? prima.quantita : 1;
    if (!(quantita >= 1 && quantita <= 999)) throw new Rifiuto('Quanti: da 1 a 999');
    let idAtt = x.idAttrezzatura !== undefined ? (vuoto(x.idAttrezzatura) ? null : Number(x.idAttrezzatura)) : prima ? prima.attrezzatura_id : null;
    let att = null;
    if (idAtt !== null) {
      att = this.db.riga('SELECT * FROM attrezzature WHERE id = ?', idAtt);
      if (!att) throw new Rifiuto('Attrezzatura ' + idAtt + ' non trovata');
      if (att.categoria !== 'dpi') throw new Rifiuto(att.codice + ' non è un DPI del catalogo');
    }
    const v = {
      persona_id: p.id, cosa, taglia: x.taglia !== undefined ? testo(x.taglia) : prima ? prima.taglia : '', quantita,
      data: x.data !== undefined && testo(x.data) ? dataDaIso(x.data) : prima ? prima.data : oggi(), attrezzatura_id: idAtt,
      scade: x.scade !== undefined ? (testo(x.scade) ? dataDaIso(x.scade) : '') : prima ? prima.scade : '',
      nota: x.nota !== undefined ? testo(x.nota) : prima ? prima.nota : '',
    };
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('dpi_consegne', id, v);
    } else {
      id = this.inserisci('dpi_consegne', Object.assign(v, { id_locale: testo(x.idLocale) || null, consegnata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora }));
      // Un DPI del catalogo consegnato: assegnato alla persona (chiude quello che c'era).
      if (att) this.assegnaInterno({ attrezzatura: att, tipo: 'assegnato', personaId: p.id, nota: 'consegna DPI' });
    }
    if (d.firma && d.firma.base64) {
      const f = this.salvaFirmaConsegna(d.firma, { consegna_id: id });
      this.aggiorna('dpi_consegne', id, { firma_file_id: f, firmata_il: ora });
    }
    // La scadenza del DPI consegnato (quando ne ha una).
    const c = this.db.riga('SELECT * FROM dpi_consegne WHERE id = ?', id);
    const s = c.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', c.scadenza_id) : null;
    if (c.scade && !c.restituito_il) {
      if (s && s.stato === 'aperta') this.aggiorna('scadenze', s.id, { data: c.scade, modificato: ora });
      else if (!s) {
        const sid = this.inserisci('scadenze', {
          titolo: c.cosa + ' di ' + p.nome + ' scade', tipo: 'altro', persona_id: p.id, data: c.scade, preavviso_giorni: 30, dalla_fatta: 0,
          azione: 'promemoria', stato: 'aperta', creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
        });
        this.aggiorna('dpi_consegne', id, { scadenza_id: sid });
      }
    }
    return { ok: true, consegna: this.dpiDaRiga(this.db.riga('SELECT * FROM dpi_consegne WHERE id = ?', id)) };
  },

  /** firmaConsegna {id, base64, mime}: la persona firma le sue consegne (anche dopo, dal suo telefono), o chi consegna. */
  firmaConsegna(d) {
    const c = this.db.riga('SELECT * FROM dpi_consegne WHERE id = ?', Number(d.id) || 0);
    const mia = this.miaPersonaId();
    if (!c || (!this.puoConsegnareDpi() && c.persona_id !== mia)) throw new Rifiuto('Consegna ' + testo(d.id) + ' non trovata');
    if (c.firma_file_id) return { ok: true, consegna: this.dpiDaRiga(c) };
    const f = this.salvaFirmaConsegna({ base64: d.base64, mime: d.mime }, { consegna_id: c.id }, d.idFile);
    this.aggiorna('dpi_consegne', c.id, { firma_file_id: f, firmata_il: adesso() }, 'id', 'consegna firmata');
    return { ok: true, consegna: this.dpiDaRiga(this.db.riga('SELECT * FROM dpi_consegne WHERE id = ?', c.id)) };
  },

  /** restituisciDpi {id, data?} (persone 2 o mezzi 2): un DPI del catalogo torna disponibile. */
  restituisciDpi(d) {
    if (!this.puoConsegnareDpi()) throw senzaPermesso('segnare i DPI restituiti');
    const c = this.db.riga('SELECT * FROM dpi_consegne WHERE id = ?', Number(d.id) || 0);
    if (!c) throw new Rifiuto('Consegna ' + testo(d.id) + ' non trovata');
    if (c.restituito_il) return { ok: true, consegna: this.dpiDaRiga(c) };
    const data = testo(d.data) ? dataDaIso(d.data) : oggi();
    this.aggiorna('dpi_consegne', c.id, { restituito_il: data }, 'id', 'restituito');
    if (c.attrezzatura_id) {
      const a = this.db.riga('SELECT * FROM assegnazioni WHERE attrezzatura_id = ? AND al IS NULL AND persona_id = ?', c.attrezzatura_id, c.persona_id);
      if (a) this.aggiorna('assegnazioni', a.id, { al: adesso() }, 'id', 'restituito');
    }
    const s = c.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', c.scadenza_id) : null;
    if (s && s.stato === 'aperta') this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo: 'DPI restituito', modificato: adesso() });
    return { ok: true, consegna: this.dpiDaRiga(this.db.riga('SELECT * FROM dpi_consegne WHERE id = ?', c.id)) };
  },

  // ------------------------------------------------------------------ uscita e anonimizzazione (§9)

  /** Cosa succede con l'uscita: l'elenco della prima risposta. */
  cosaSuccedeConUscita(p, data) {
    const u = p.utente_id ? this.db.riga('SELECT * FROM utenti WHERE id = ?', p.utente_id) : null;
    const daRestituire = [];
    const uso = this.inUsoDi(p.id);
    uso.mezzi.filter(m => m.come !== 'sua').forEach(m => daRestituire.push({ tipo: 'mezzo', id: m.id, nome: m.nome }));
    uso.attrezzature.forEach(a => daRestituire.push({ tipo: a.categoria === 'dpi' ? 'dpi' : 'attrezzatura', id: a.id, nome: a.nome }));
    this.db.righe("SELECT * FROM dpi_consegne WHERE persona_id = ? AND restituito_il = '' AND attrezzatura_id IS NULL", p.id)
      .forEach(x => daRestituire.push({ tipo: 'dpi', id: x.id, nome: x.cosa }));
    const assenzeFuture = this.db.righe("SELECT * FROM assenze WHERE persona_id = ? AND stato IN ('bozza', 'da_approvare', 'approvata') AND al > ?", p.id, data);
    const attivitaFuture = u ? this.attivitaDaLiberare(u.id, data) : [];
    const ticketInCarico = u ? this.db.righe("SELECT * FROM ticket WHERE responsabile_id = ? AND stato IN ('in_carico', 'in_attesa', 'aperto')", u.id) : [];
    const scadenzeAperte = this.db.righe("SELECT * FROM scadenze WHERE persona_id = ? AND stato = 'aperta'", p.id);
    const contatti = [];
    if (p.telefono_personale) contatti.push('telefono personale');
    if (p.emergenza_nome || p.emergenza_telefono) contatti.push('contatto di emergenza');
    return {
      u, assenzeFuture, attivitaFuture, ticketInCarico, scadenzeAperte,
      daFare: {
        accesso: !u ? 'Non ha l\'accesso a Wisper' : u.attivo !== 1 ? 'L\'accesso è già disattivato'
          : data < oggi() ? 'L\'accesso a Wisper si disattiva adesso' : 'L\'accesso a Wisper si disattiva alla fine del ' + dataIt(data),
        daRestituire, assenzeFuture: assenzeFuture.length, attivitaFuture: attivitaFuture.length, ticketInCarico: ticketInCarico.length,
        attivita: attivitaFuture.map(a => a.titolo), ticket: ticketInCarico.map(t => t.numero + ' · ' + t.titolo),
        scadenzeAperte: scadenzeAperte.length, contattiTolti: contatti,
      },
    };
  },

  /** Le attivita' assegnate a un utente da dopo quel giorno (o senza data), non fatte: alla sua uscita restano senza nessuno. */
  attivitaDaLiberare(idUtente, data) {
    return this.db.righe("SELECT * FROM attivita WHERE assegnata_a = ? AND stato IN ('da_fare', 'in_corso')", idUtente)
      .filter(a => {
        const g = a.inizio ? dataIso(a.inizio) : a.scadenza;
        return !g || g > data;
      });
  },

  /**
   * segnaUscita {idPersona, data, motivo?, conferma?} (persone 2). Prima risposta serveConferma con daFare; con conferma:
   * accesso disattivato dalla fine di quel giorno (subito se e' passato), assenze future annullate (quelle a cavallo
   * accorciate), attivita' da dopo l'uscita senza nessuno, ticket in carico di nuovo aperti, scadenze della persona
   * annullate, telefono personale e contatto di emergenza tolti subito. Ore, rapportini, spese restano.
   */
  segnaUscita(d) {
    const p = this.rigaPersona(d.idPersona);
    if (p.anonimizzata_il) throw new Rifiuto('La scheda è stata resa anonima');
    const data = testo(d.data) ? dataDaIso(d.data) : '';
    if (!data) throw new Rifiuto('Uscita: scrivi l\'ultimo giorno');
    if (p.entrata_il && data < p.entrata_il) throw new Rifiuto('Uscita: non può venire prima dell\'entrata');
    const cosa = this.cosaSuccedeConUscita(p, data);
    if (!si(d.conferma)) {
      return { ok: false, serveConferma: true, frase: p.nome + ' esce il ' + dataIt(data) + '. Ecco cosa succede:', daFare: cosa.daFare,
        errore: p.nome + ' esce il ' + dataIt(data) + ': conferma per segnare l\'uscita' };
    }
    const ora = adesso();
    const motivo = testo(d.motivo);
    this.aggiorna('persone', p.id, { uscita_il: data, motivo_uscita: motivo, telefono_personale: '', emergenza_nome: '', emergenza_telefono: '', modificato: ora },
      'id', 'uscita: ' + dataIt(data));
    for (const a of cosa.assenzeFuture) {
      if (a.dal > data) this.aggiorna('assenze', a.id, { stato: 'annullata', annullata_il: ora, motivo_annullo: 'Uscita', modificato: ora }, 'id', 'assenza annullata: uscita');
      else this.aggiorna('assenze', a.id, Object.assign({ al: data, modificato: ora }, this.contoAssenza(Object.assign({}, a, { al: data }), p)), 'id', 'accorciata: uscita');
    }
    for (const a of cosa.attivitaFuture) this.aggiorna('attivita', a.id, { assegnata_a: null, modificato: ora }, 'id', 'non assegnata: uscita di ' + p.nome);
    for (const t of cosa.ticketInCarico) {
      this.aggiorna('ticket', t.id, { responsabile_id: null, stato: t.stato === 'in_carico' ? 'aperto' : t.stato, modificato: ora }, 'id', 'di nuovo aperto: uscita di ' + p.nome);
      this.eventoTicket(t.id, 'Nessuno lo segue più');
    }
    for (const s of cosa.scadenzeAperte) this.aggiorna('scadenze', s.id, { stato: 'annullata', motivo: 'Uscita', modificato: ora });
    this.applicaUscite();
    return { ok: true, persona: this.personaCompleta(this.db.riga('SELECT * FROM persone WHERE id = ?', p.id)), daRestituire: cosa.daFare.daRestituire };
  },

  /** annullaUscita {idPersona} (persone 2): finche' la data non e' passata, o entro 30 giorni (l'accesso non torna da solo). */
  annullaUscita(d) {
    const p = this.rigaPersona(d.idPersona);
    if (!p.uscita_il) throw new Rifiuto(p.nome + ' non ha l\'uscita segnata');
    if (p.anonimizzata_il) throw new Rifiuto('La scheda è stata resa anonima');
    if (giorniTra(p.uscita_il, oggi()) > 30) throw new Rifiuto('L\'uscita è di più di 30 giorni fa: non si annulla');
    this.aggiorna('persone', p.id, { uscita_il: '', motivo_uscita: '', modificato: adesso() }, 'id', 'uscita annullata');
    return { ok: true, persona: this.personaCompleta(this.db.riga('SELECT * FROM persone WHERE id = ?', p.id)) };
  },

  /** Le persone uscite da piu' di PERSONE_CONSERVA_ANNI anni, non ancora anonime (la Dashboard le propone al titolare). */
  daRendereAnonime() {
    const anni = numero(this.leggiImpostazioni().PERSONE_CONSERVA_ANNI) || 10;
    const limite = C.piuMesi(oggi(), -12 * anni);
    return this.db.righe("SELECT * FROM persone WHERE uscita_il <> '' AND uscita_il < ? AND anonimizzata_il = ''", limite);
  },

  /**
   * anonimizzaPersona {idPersona, conferma?} (solo il titolare, con riservati 2): definitiva. Svuota i campi personali
   * e riservati, toglie costi, assenze, saldi, visite, formazione, consegne DPI e firme, le scadenze della persona, i
   * documenti legati a lei (righe e file dal disco, anche le revisioni); nome = "Persona uscita nel {anno}". Restano ore,
   * rapportini, spese, trasferte, attivita', ticket (lavoro dello studio) e accessi_riservati (solo id e date).
   */
  anonimizzaPersona(d) {
    const c = this.chi();
    if (!c.sistema && !(c.utente && c.utente.ruolo === 'titolare' && this.livello('riservati') >= 2)) throw senzaPermesso('rendere anonima una scheda (lo fa solo il titolare)');
    const p = this.rigaPersona(d.idPersona);
    if (p.anonimizzata_il) return { ok: true, persona: this.personaCompleta(p) };
    if (!p.uscita_il) throw new Rifiuto('Prima segna l\'uscita di ' + p.nome);
    if (p.utente_id && c.utente && p.utente_id === c.utente.id) throw new Rifiuto('Non puoi rendere anonima la tua scheda');
    const nome = 'Persona uscita nel ' + p.uscita_il.slice(0, 4);
    const documenti = this.db.righe('SELECT * FROM documenti WHERE persona_id = ?', p.id);
    if (!si(d.conferma)) {
      return {
        ok: false, serveConferma: true, errore: 'Non si torna indietro: conferma per rendere anonima la scheda di ' + p.nome,
        frase: 'Non si torna indietro',
        siToglie: ['dati personali e riservati della scheda', 'costi', 'assenze e saldi', 'visite mediche', 'formazione e attestati',
          'consegne DPI e firme', documenti.length === 1 ? '1 documento (anche dal disco del NAS)' : documenti.length + ' documenti (anche dal disco del NAS)'],
        resta: ['ore', 'rapportini (anche il nome sul PDF di quelli firmati)', 'spese e trasferte', 'attività', 'ticket'],
        nomeNuovo: nome,
      };
    }
    const ora = adesso();
    const vuoti = {};
    for (const col of ['codice_fiscale', 'nascita_data', 'nascita_luogo', 'indirizzo', 'cap', 'citta', 'provincia', 'telefono_personale', 'email_personale', 'iban',
      'emergenza_nome', 'emergenza_telefono', 'ccnl', 'livello', 'note_riservate', 'motivo_uscita', 'contratto_tipo', 'contratto_scade', 'mansione',
      'email_lavoro', 'telefono_lavoro', 'ruolo_studio']) vuoti[col] = '';
    this.aggiorna('persone', p.id, Object.assign(vuoti, { nome, ferie_annue_ore: null, permessi_annui_ore: null, anonimizzata_il: ora, modificato: ora }), 'id', 'persona resa anonima');
    if (p.utente_id) {
      this.aggiorna('utenti', p.utente_id, { nome, attivo: 0 }, 'id', 'persona resa anonima');
      this.db.esegui('UPDATE sessioni SET revocata = ? WHERE utente_id = ? AND revocata IS NULL', ora, p.utente_id);
    }
    const via = (tabella, cond, ...par) => {
      for (const r of this.db.righe('SELECT * FROM ' + tabella + ' WHERE ' + cond, ...par)) {
        this.db.esegui('DELETE FROM ' + tabella + ' WHERE id = ?', r.id);
        this.annota(tabella, r.id, null, null, 'persona resa anonima');
      }
    };
    // Le firme delle consegne e i file dei documenti: dal disco, per sempre (non nel cestino).
    const fileDaTogliere = new Set();
    this.db.righe('SELECT firma_file_id FROM dpi_consegne WHERE persona_id = ? AND firma_file_id IS NOT NULL', p.id).forEach(r => fileDaTogliere.add(r.firma_file_id));
    for (const doc of documenti) {
      this.db.righe('SELECT file_id FROM documento_versioni WHERE documento_id = ?', doc.id).forEach(v => fileDaTogliere.add(v.file_id));
      this.db.esegui('UPDATE scadenze SET documento_id = NULL WHERE documento_id = ?', doc.id);
      this.db.esegui('UPDATE scadenze SET documento_fatto_id = NULL WHERE documento_fatto_id = ?', doc.id);
      this.db.esegui('DELETE FROM documento_condivisioni WHERE documento_id = ?', doc.id);
      this.db.esegui('DELETE FROM documento_versioni WHERE documento_id = ?', doc.id);
      this.db.esegui('DELETE FROM documenti WHERE id = ?', doc.id);
      this.annota('documenti', doc.id, null, null, 'persona resa anonima: documento tolto per sempre');
    }
    via('persona_costi', 'persona_id = ?', p.id);
    via('assenze', 'persona_id = ?', p.id);
    via('assenze_saldi', 'persona_id = ?', p.id);
    via('visite_mediche', 'persona_id = ?', p.id);
    via('qualifiche', 'persona_id = ?', p.id);
    via('dpi_consegne', 'persona_id = ?', p.id);
    via('scadenze', 'persona_id = ?', p.id);
    for (const id of fileDaTogliere) {
      const f = this.db.riga('SELECT * FROM file WHERE id = ?', id);
      if (!f) continue;
      if (f.percorso) {
        try { fs.rmSync(this.percorsoFile(f.percorso), { force: true }); } catch (e) { /* gia' tolto */ }
      }
      this.db.esegui('DELETE FROM file WHERE id = ?', f.id);
      this.annota('file', f.id, null, null, 'persona resa anonima: file tolto dal disco');
    }
    this.aggiorna('persone', p.id, { scadenza_contratto_id: null });
    return { ok: true, persona: this.personaCompleta(this.db.riga('SELECT * FROM persone WHERE id = ?', p.id)) };
  },
};

Object.defineProperties(module.exports, {
  NOMI_RAPPORTO: { value: NOMI_RAPPORTO },
  NOMI_GIUDIZIO: { value: NOMI_GIUDIZIO },
  nomeCorto: { value: nomeCorto },
  DPI_PROPOSTI: { value: DPI_PROPOSTI },
});
