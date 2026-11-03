/*
 * Ferie, permessi e assenze, chiusure dello studio, presenze del mese (fase 6, accordo in docs/gestionale/fase6.md
 * §3.4, §3.5, §6; risposte in architettura.md §17).
 *
 *  - Wisper non calcola la maturazione (la dice il CCNL, la fa il consulente): il saldo parte dall'ultimo cedolino
 *    scritto e conta quello che succede dopo (saldoAssenze in conti.js);
 *  - le richieste si approvano con lo schema della fase 3 (approva, respingi, Annulla: ore.js decidi); nessuno approva
 *    le proprie, tranne il titolare; malattia, infortunio, congedo e Legge 104 si segnalano e nascono approvate;
 *  - il tipo delle assenze sanitarie lo vede solo chi ha "riservati" (e la persona): agli altri e' "Assente". Il
 *    collaboratore vede i colleghi tutti come "Assente". Mai il motivo: il periodo e il numero del certificato;
 *  - le presenze sono ricavate da ore, rapportini e assenze: niente timbrature, niente posizione.
 */
'use strict';

const { Rifiuto, senzaPermesso, testo, numero, centesimi, adesso, oggi, dataIso, dataDaIso, piuGiorni } = require('../utili');
const C = require('../conti');
const { datiPersona } = require('../permessi');

const TIPI = ['ferie', 'permesso', 'malattia', 'infortunio', 'congedo', 'legge104', 'altro'];
const NOMI_TIPO = { ferie: 'Ferie', permesso: 'Permesso', malattia: 'Malattia', infortunio: 'Infortunio', congedo: 'Congedo', legge104: 'Legge 104', altro: 'Altro' };
const NOMI_STATO = { bozza: 'Bozza', da_approvare: 'Da approvare', approvata: 'Approvata', respinta: 'Respinta', annullata: 'Annullata' };
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

const si = v => v === true || v === 1 || v === '1' || v === 'true';
const vuoto = v => v === undefined || v === null || v === '';
const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');
const dataBreve = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '');
const nomeGiorno = iso => GIORNI[new Date(iso + 'T12:00:00').getDay()];
const virgola = n => String(Math.round(numero(n) * 100) / 100).replace('.', ',');
const sanitaria = tipo => C.SANITARIE.indexOf(tipo) >= 0;
const ore2 = n => Math.round(numero(n) * 100) / 100;

/** "dal 2 al 6 novembre", "il 3 novembre", "dal 30 ottobre al 2 novembre" (le date nelle frasi). */
function periodoFrase(dal, al) {
  const g = iso => Number(iso.slice(8, 10));
  const m = iso => C.MESI[Number(iso.slice(5, 7)) - 1];
  if (!al || al === dal) return 'il ' + g(dal) + ' ' + m(dal);
  if (dal.slice(0, 7) === al.slice(0, 7)) return 'dal ' + g(dal) + ' al ' + g(al) + ' ' + m(al);
  return 'dal ' + g(dal) + ' ' + m(dal) + ' al ' + g(al) + ' ' + m(al);
}

/** "Da lunedì 2 a venerdì 6 novembre", "Lunedì 2 novembre". */
function periodoLungo(dal, al) {
  const g = iso => nomeGiorno(iso) + ' ' + Number(iso.slice(8, 10));
  const m = iso => C.MESI[Number(iso.slice(5, 7)) - 1];
  if (!al || al === dal) { const s = g(dal) + ' ' + m(dal); return s.charAt(0).toUpperCase() + s.slice(1); }
  if (dal.slice(0, 7) === al.slice(0, 7)) return 'Da ' + g(dal) + ' a ' + g(al) + ' ' + m(al);
  return 'Da ' + g(dal) + ' ' + m(dal) + ' a ' + g(al) + ' ' + m(al);
}

const quanti = (n, uno, tanti) => virgola(n) + ' ' + (numero(n) === 1 ? uno : tanti);

module.exports = {
  // ------------------------------------------------------------------ chi vede il tipo

  /** Il tipo di un'assenza: le sanitarie con "riservati" (o la persona), le altre con persone 2 (o la persona). */
  vedeTipoAssenza(a) {
    if (this.chi().sistema) return true;
    const propria = a.persona_id === this.miaPersonaId();
    if (propria) return true;
    if (sanitaria(a.tipo)) return this.livello('riservati') >= 1;
    return this.livello('persone') >= 2;
  },

  /** La parola dell'assenza per chi chiede: Ferie, Permesso, Malattia, ..., la causale per "altro", o "Assente". */
  tipoVistoAssenza(a) {
    if (!this.vedeTipoAssenza(a)) return 'Assente';
    if (a.tipo === 'altro') return testo(a.causale) || 'Altro';
    return NOMI_TIPO[a.tipo] || 'Assente';
  },

  festiviPer(dal, al) {
    return C.festiviTra(dal, al || dal, this.leggiImpostazioni().FESTA_PATRONO);
  },

  /** Giorni e ore di un'assenza per quella persona (conti.js oreAssenza). */
  contoAssenza(a, p) {
    const x = C.oreAssenza({ tipo: a.tipo, dal: a.dal, al: a.al, mezza: a.mezza, dalle: a.dalle, alle: a.alle, ore: a.ore }, this.orarioPersona(p), this.festiviPer(a.dal, a.al));
    return { giorni: x.giorni, ore: x.ore };
  },

  /** Le ore di un'assenza giorno per giorno ([{data, ore}]). */
  orePerGiorno(a, p) {
    return C.oreAssenzaPerGiorno({ tipo: a.tipo, dal: a.dal, al: a.al, mezza: a.mezza, dalle: a.dalle, alle: a.alle, ore: a.ore }, this.orarioPersona(p), this.festiviPer(a.dal, a.al));
  },

  /** Un'assenza come la vede chi chiede (il tipo vero solo a chi lo puo' vedere; senza, niente tipo, causale, nota, protocollo). */
  assenzaDaRiga(a, aiuti) {
    const nomi = (aiuti && aiuti.persone) || {};
    const vede = this.vedeTipoAssenza(a);
    const mia = this.miaPersonaId();
    const propria = a.persona_id === mia;
    const approva = this.puoApprovareAssenze() && (!propria || this.ruoloTitolare());
    const o = {
      id: a.id, idLocale: a.id_locale || '', idPersona: a.persona_id, persona: nomi[a.persona_id] !== undefined ? nomi[a.persona_id] : this.nomePersona(a.persona_id),
      tipo: a.tipo, tipoVisto: this.tipoVistoAssenza(a), causale: a.causale, dal: a.dal, al: a.al, mezza: a.mezza, dalle: a.dalle, alle: a.alle,
      giorni: a.giorni, ore: a.ore, stato: a.stato, statoVisto: NOMI_STATO[a.stato] || a.stato, nota: a.nota, protocollo: a.protocollo,
      approvataDa: a.approvata_da === null || a.approvata_da === undefined ? null : a.approvata_da,
      approvataDaNome: a.approvata_da ? ((aiuti && aiuti.utenti) || {})[a.approvata_da] || this.nomeUtente(a.approvata_da) : '',
      approvataIl: a.approvata_il ? require('../utili').dataOraIso(a.approvata_il) : '', motivoRifiuto: a.motivo_rifiuto, motivoAnnullo: a.motivo_annullo,
      chiusura: a.chiusura_id ? ((aiuti && aiuti.chiusure) || {})[a.chiusura_id] || '' : '', idChiusura: a.chiusura_id,
      daApprovare: a.stato === 'da_approvare',
      puoScrivere: a.stato !== 'annullata' && (approva || (propria && ['bozza', 'da_approvare', 'respinta'].indexOf(a.stato) >= 0)),
      puoAnnullare: a.stato !== 'annullata' && a.stato !== 'respinta' && (approva || (propria && a.dal > oggi())),
    };
    if (!vede) {
      delete o.tipo;
      delete o.causale;
      delete o.nota;
      delete o.protocollo;
    } else if (sanitaria(a.tipo) && !propria) {
      // Chi vede il tipo vero di un'assenza sanitaria di un altro lascia traccia (togliPersonali la segna nel registro).
      o.tipoSanitario = true;
    }
    return datiPersona(o, a.persona_id, 'assenza');
  },

  ruoloTitolare() {
    const c = this.chi();
    return c.sistema || !!(c.utente && c.utente.ruolo === 'titolare');
  },

  nomeUtente(id) {
    const u = id ? this.db.riga('SELECT nome FROM utenti WHERE id = ?', id) : null;
    return u ? u.nome : '';
  },

  aiutiAssenze() {
    const a = { persone: {}, utenti: {}, chiusure: {} };
    this.db.righe('SELECT id, nome FROM persone').forEach(p => { a.persone[p.id] = p.nome; });
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { a.utenti[u.id] = u.nome; });
    this.db.righe('SELECT id, nome FROM chiusure').forEach(c => { a.chiusure[c.id] = c.nome; });
    return a;
  },

  /** Le assenze di una persona (future e in corso, o tutte), per la scheda. */
  assenzeDellaPersona(idPersona, opzioni) {
    const o = opzioni || {};
    const righe = o.future
      ? this.db.righe("SELECT * FROM assenze WHERE persona_id = ? AND stato IN ('bozza', 'da_approvare', 'approvata', 'respinta') AND al >= ? ORDER BY dal, id", idPersona, oggi())
      : this.db.righe('SELECT * FROM assenze WHERE persona_id = ? ORDER BY dal DESC, id DESC', idPersona);
    const a = this.aiutiAssenze();
    return righe.map(x => this.assenzaDaRiga(x, a));
  },

  /**
   * assenze {da?, a?, idPersona?, stato?: aperte|da_approvare|tutte, tipo?} (persone 1). Senza date le future e in
   * corso, piu' le da approvare; con le date quelle del periodo (il calendario). Il collaboratore riceve le sue con tutto
   * e quelle dei colleghi come "Assente" (solo approvate e da approvare).
   */
  leggiAssenze(d) {
    d = d || {};
    const da = testo(d.da) ? dataDaIso(d.da) : '';
    const a = testo(d.a) ? dataDaIso(d.a) : '';
    const stato = testo(d.stato) || 'aperte';
    if (['aperte', 'da_approvare', 'tutte'].indexOf(stato) < 0) throw new Rifiuto('Stato: aperte, da_approvare o tutte');
    const cond = [];
    const par = [];
    if (da) { cond.push('al >= ?'); par.push(da); }
    if (a) { cond.push('dal <= ?'); par.push(a); }
    if (!da && !a) { cond.push("(al >= ? OR stato = 'da_approvare')"); par.push(oggi()); }
    if (stato === 'aperte') cond.push("stato IN ('bozza', 'da_approvare', 'approvata')");
    else if (stato === 'da_approvare') cond.push("stato = 'da_approvare'");
    if (testo(d.idPersona)) { cond.push('persona_id = ?'); par.push(Number(d.idPersona)); }
    if (testo(d.tipo)) {
      if (TIPI.indexOf(testo(d.tipo)) < 0) throw new Rifiuto('Tipo: ferie, permesso, malattia, infortunio, congedo, legge104 o altro');
      // Il filtro per tipo sanitario serve solo a chi vede quei tipi.
      if (sanitaria(testo(d.tipo)) && this.livello('riservati') < 1) {
        cond.push('persona_id = ?');
        par.push(this.miaPersonaId() || -1);
      }
      cond.push('tipo = ?');
      par.push(testo(d.tipo));
    }
    const mia = this.miaPersonaId();
    let righe = this.db.righe('SELECT * FROM assenze' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') + ' ORDER BY dal, id', ...par);
    // Chi non ha persone 2 vede le bozze e le respinte solo sue; degli altri solo quando sono assenti (approvate) o in attesa.
    if (this.livello('persone') < 2) righe = righe.filter(x => x.persona_id === mia || x.stato === 'approvata' || x.stato === 'da_approvare');
    const aiuti = this.aiutiAssenze();
    const out = { ok: true, oggi: oggi(), assenze: righe.map(x => this.assenzaDaRiga(x, aiuti)) };
    if (da || a) {
      out.chiusure = this.db.righe('SELECT * FROM chiusure WHERE (? = \'\' OR al >= ?) AND (? = \'\' OR dal <= ?) ORDER BY dal', da, da, a, a).map(c => this.chiusuraDaRiga(c));
      out.festivi = this.festiviPer(da || a, a || da).filter(g => (!da || g >= da) && (!a || g <= a));
    }
    if (testo(d.idPersona) && this.vedePersonaliDi(Number(d.idPersona))) {
      const p = this.db.riga('SELECT * FROM persone WHERE id = ?', Number(d.idPersona));
      if (p) out.saldi = this.saldiPersona(p);
    }
    return out;
  },

  // ------------------------------------------------------------------ saldi

  /** Il saldo di ferie e permessi di una persona, oggi (§3.4), coi giorni per le ferie. */
  saldiPersona(p, giorno) {
    const g = giorno || oggi();
    const orario = this.orarioPersona(p);
    const oreGiorno = C.oreGiornoPersona(orario);
    const out = {};
    for (const [chiave, tipo, colonna] of [['ferie', 'ferie', 'ferie_annue_ore'], ['permessi', 'permesso', 'permessi_annui_ore']]) {
      // Due saldi dello stesso giorno (il cedolino riscritto per correggerlo): vale l'ultimo scritto. saldoAssenze prende il
      // piu' recente per data e, a parita', il primo che trova: per questo, a parita' di data, prima l'id piu' alto.
      const saldi = this.db.righe('SELECT data, ore FROM assenze_saldi WHERE persona_id = ? AND tipo = ? ORDER BY data, id DESC', p.id, chiave);
      const assenze = [];
      for (const a of this.db.righe("SELECT * FROM assenze WHERE persona_id = ? AND tipo = ? AND stato IN ('approvata', 'da_approvare')", p.id, tipo)) {
        for (const x of this.orePerGiorno(a, p)) assenze.push({ dal: x.data, al: x.data, ore: x.ore, stato: a.stato });
      }
      const s = C.saldoAssenze({ annue: p[colonna], saldi, assenze, oggi: g, entrata: p.entrata_il, uscita: p.uscita_il });
      if (s.tenuto) {
        s.oreGiorno = oreGiorno;
        if (chiave === 'ferie' && oreGiorno > 0) {
          s.giorniOggi = Math.round(s.oggi / oreGiorno * 10) / 10;
          s.giorniRestano = Math.round(s.restano / oreGiorno * 10) / 10;
        }
      }
      out[chiave] = s;
    }
    return out;
  },

  /** saldi {idPersona} (persone 1 per la propria, 2 per gli altri). */
  leggiSaldi(d) {
    const p = this.rigaPersona(d.idPersona || this.miaPersonaId());
    if (!this.vedePersonaliDi(p.id)) throw senzaPermesso('vedere il saldo delle ferie degli altri');
    return { ok: true, idPersona: p.id, saldi: this.saldiPersona(p) };
  },

  /** salvaSaldo {idPersona, tipo: ferie|permessi, data, ore, nota?} (persone 2): "Aggiorna dal cedolino". */
  salvaSaldo(d) {
    if (this.livello('persone') < 2) throw senzaPermesso('aggiornare il saldo delle ferie');
    const p = this.rigaPersona(d.idPersona);
    const tipo = testo(d.tipo) || 'ferie';
    if (['ferie', 'permessi'].indexOf(tipo) < 0) throw new Rifiuto('Tipo: ferie o permessi');
    const data = testo(d.data) ? dataDaIso(d.data) : '';
    if (!data) throw new Rifiuto('Data: scrivi a che giorno è il residuo del cedolino');
    if (vuoto(d.ore) || isNaN(Number(String(d.ore).replace(',', '.')))) throw new Rifiuto('Ore: scrivi il residuo del cedolino in ore');
    this.inserisci('assenze_saldi', {
      persona_id: p.id, tipo, data, ore: ore2(d.ore), nota: testo(d.nota), utente_id: this.chi().utente ? this.chi().utente.id : null, creato: adesso(),
    }, 'id', 'saldo dal cedolino del ' + dataIt(data));
    return { ok: true, idPersona: p.id, saldi: this.saldiPersona(p) };
  },

  // ------------------------------------------------------------------ chiedere, segnalare, annullare

  /** Le assenze di chi lavora vanno approvate? (APPROVAZIONE della fase 3; il titolare solo con "tutti"). */
  serveApprovazioneAssenza(p) {
    const regola = this.regolaApprovazione();
    if (regola === 'nessuno' || !p.utente_id) return false;
    const u = this.db.riga('SELECT ruolo FROM utenti WHERE id = ?', p.utente_id);
    if (u && u.ruolo === 'titolare') return regola === 'tutti';
    return true;
  },

  /** Due assenze della stessa persona nello stesso giorno: no (due permessi in ore diverse si'). */
  controllaSovrapposizioneAssenza(v, p, tranneId) {
    const altre = this.db.righe("SELECT * FROM assenze WHERE persona_id = ? AND id <> ? AND stato IN ('da_approvare', 'approvata') AND dal <= ? AND al >= ? ORDER BY dal",
      p.id, tranneId || 0, v.al, v.dal);
    for (const a of altre) {
      const aOre = C.assenzaAOre(a) && testo(a.dalle) && testo(a.alle);
      const vOre = C.assenzaAOre(v) && testo(v.dalle) && testo(v.alle);
      if (aOre && vOre && a.dal === v.dal) {
        const m = C.minutiDa;
        if (m(a.alle) <= m(v.dalle) || m(v.alle) <= m(a.dalle)) continue;
      }
      const giorno = a.dal > v.dal ? a.dal : v.dal;
      const parola = !this.vedeTipoAssenza(a) || sanitaria(a.tipo) || a.tipo === 'altro' ? 'assente' : a.tipo === 'ferie' ? 'in ferie' : 'in permesso';
      const chi = p.id === this.miaPersonaId() ? 'sei' : p.nome + ' è';
      throw new Rifiuto('Il ' + dataBreve(giorno) + ' ' + chi + ' già ' + parola + ': cambia quella richiesta');
    }
  },

  /**
   * salvaAssenza {assenza: {id?, idLocale?, idPersona?, tipo, causale?, dal, al?, mezza?, dalle?, alle?, ore?, nota?,
   * protocollo?, bozza?}} (persone 1 per se', 2 per gli altri) -> {assenza, saldi, anomalie}. Le sanitarie nascono
   * approvate; le altre da approvare (o approvate, se per quella persona non serve: fase 3, APPROVAZIONE).
   */
  salvaAssenza(d) {
    const x = (d && d.assenza) || d || {};
    if (!testo(x.id) && testo(x.idLocale)) {
      const gia = this.db.riga('SELECT * FROM assenze WHERE id_locale = ?', testo(x.idLocale));
      if (gia) {
        if (gia.persona_id !== this.miaPersonaId() && this.livello('persone') < 2) throw new Rifiuto('Assenza non trovata');
        return this.rispostaAssenza(gia, true);
      }
    }
    const prima = testo(x.id) ? this.db.riga('SELECT * FROM assenze WHERE id = ?', Number(x.id) || 0) : null;
    const mia = this.miaPersonaId();
    if (testo(x.id) && (!prima || (prima.persona_id !== mia && this.livello('persone') < 2))) throw new Rifiuto('Assenza ' + testo(x.id) + ' non trovata');
    let idPersona = prima ? prima.persona_id : (testo(x.idPersona) ? Number(x.idPersona) : mia);
    if (idPersona === null) throw new Rifiuto('Di chi è l\'assenza? Manca la persona');
    const p = this.rigaPersona(idPersona);
    if (p.anonimizzata_il) throw new Rifiuto('La scheda è stata resa anonima');
    const propria = p.id === mia;
    if (!propria && this.livello('persone') < 2) throw senzaPermesso('chiedere le assenze degli altri');
    const approva = this.puoApprovareAssenze() && (!propria || this.ruoloTitolare());
    if (prima) {
      if (prima.stato === 'annullata') throw new Rifiuto('L\'assenza è stata annullata: chiedine una nuova');
      if (prima.stato === 'approvata' && !approva) throw new Rifiuto('È già approvata: per cambiarla chiedi a chi approva');
      if (prima.persona_id !== p.id) throw new Rifiuto('L\'assenza non cambia persona');
    }
    const tipo = x.tipo !== undefined ? testo(x.tipo).toLowerCase() : prima ? prima.tipo : '';
    if (TIPI.indexOf(tipo) < 0) throw new Rifiuto('Tipo: ferie, permesso, malattia, infortunio, congedo, legge104 o altro');
    if (prima && sanitaria(prima.tipo) !== sanitaria(tipo)) throw new Rifiuto('Il tipo non passa da una richiesta a una segnalazione: annullala e scrivine una nuova');
    const causale = x.causale !== undefined ? testo(x.causale) : prima ? prima.causale : '';
    if (tipo === 'altro' && !causale) throw new Rifiuto('Altro: scrivi la causale');
    const dal = x.dal !== undefined ? (testo(x.dal) ? dataDaIso(x.dal) : '') : prima ? prima.dal : '';
    if (!dal) throw new Rifiuto('Dal: scrivi il primo giorno');
    let al = x.al !== undefined ? (testo(x.al) ? dataDaIso(x.al) : dal) : prima ? (prima.al >= dal ? prima.al : dal) : dal;
    if (al < dal) throw new Rifiuto('Al: non può venire prima di Dal');
    let mezza = x.mezza !== undefined ? testo(x.mezza) : prima ? prima.mezza : '';
    if (['', 'mattina', 'pomeriggio'].indexOf(mezza) < 0) throw new Rifiuto('Mezza giornata: mattina o pomeriggio');
    if (mezza && (dal !== al || (tipo !== 'ferie' && tipo !== 'altro'))) mezza = '';
    let dalle = x.dalle !== undefined ? testo(x.dalle) : prima ? prima.dalle : '';
    let alle = x.alle !== undefined ? testo(x.alle) : prima ? prima.alle : '';
    let oreScritte = x.ore !== undefined ? x.ore : prima && !prima.dalle ? prima.ore : undefined;
    const conOre = tipo === 'permesso' || ((tipo === 'altro' || tipo === 'legge104') && (dalle || alle || (!vuoto(oreScritte) && numero(oreScritte) > 0 && x.ore !== undefined)));
    if (conOre) {
      al = dal;
      if (dalle || alle) {
        const m1 = C.minutiDa(dalle);
        const m2 = C.minutiDa(alle);
        if (!dalle || !alle || m1 === null || m2 === null) throw new Rifiuto('Permesso: scrivi dalle e alle, o le ore');
        if (m2 <= m1) throw new Rifiuto('Alle: deve venire dopo dalle');
        dalle = C.oraDaMinuti(m1);
        alle = C.oraDaMinuti(m2);
        oreScritte = undefined;
      } else if (vuoto(oreScritte) || !(numero(oreScritte) > 0)) throw new Rifiuto('Permesso: scrivi dalle e alle, o le ore');
      else if (numero(oreScritte) > 24) throw new Rifiuto('Ore: da 0 a 24');
    } else {
      dalle = '';
      alle = '';
      oreScritte = undefined;
    }
    const v = { persona_id: p.id, tipo, causale: tipo === 'altro' ? causale : '', dal, al, mezza, dalle, alle };
    const conto = this.contoAssenza(Object.assign({}, v, { ore: oreScritte }), p);
    if (!(conto.ore > 0) && !sanitaria(tipo)) throw new Rifiuto('In quei giorni non lavori: niente da chiedere');
    if (sanitaria(tipo) && !(conto.giorni > 0) && !(conto.ore > 0)) throw new Rifiuto('In quei giorni non lavori: niente da segnalare');
    Object.assign(v, conto, {
      nota: x.nota !== undefined ? testo(x.nota) : prima ? prima.nota : '',
      protocollo: x.protocollo !== undefined ? testo(x.protocollo) : prima ? prima.protocollo : '',
    });
    if (v.protocollo && !sanitaria(tipo)) v.protocollo = '';
    // Lo stato: le sanitarie nascono approvate; le altre come la fase 3.
    const bozza = si(x.bozza) && !sanitaria(tipo);
    let stato;
    if (sanitaria(tipo)) stato = 'approvata';
    else if (bozza) stato = 'bozza';
    else if (prima && approva && !propria) stato = prima.stato === 'bozza' ? (this.serveApprovazioneAssenza(p) ? 'da_approvare' : 'approvata') : prima.stato;
    else stato = this.serveApprovazioneAssenza(p) ? 'da_approvare' : 'approvata';
    if (stato !== 'bozza') this.controllaSovrapposizioneAssenza(v, p, prima ? prima.id : null);
    v.stato = stato;
    const ora = adesso();
    let id;
    const parola = sanitaria(tipo) ? 'assenza segnalata' : 'richiesta di ' + (tipo === 'ferie' ? 'ferie' : tipo === 'permesso' ? 'permesso' : 'assenza');
    if (prima) {
      if (prima.stato !== stato) Object.assign(v, { approvata_da: null, approvata_il: '', motivo_rifiuto: '' });
      // Cambiata a mano, non segue piu' la sua chiusura.
      id = prima.id;
      this.aggiorna('assenze', id, Object.assign(v, { chiusura_id: null, modificato: ora }));
    } else {
      id = this.inserisci('assenze', Object.assign(v, { id_locale: testo(x.idLocale) || null, creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora }),
        'id', parola);
    }
    if (sanitaria(tipo) && (v.protocollo || !prima)) this.registraAccessoRiservato(p.id, 'assenza', 'cambiato', id);
    return this.rispostaAssenza(this.db.riga('SELECT * FROM assenze WHERE id = ?', id), false);
  },

  rispostaAssenza(a, gia) {
    const p = this.db.riga('SELECT * FROM persone WHERE id = ?', a.persona_id);
    const r = { ok: true, assenza: this.assenzaDaRiga(a, this.aiutiAssenze()), saldi: this.vedePersonaliDi(p.id) ? this.saldiPersona(p) : null, anomalie: this.anomalieAssenza(a, p) };
    if (gia) r.giaArrivata = true;
    return r;
  },

  /** annullaAssenza {id, motivo?} (la persona le sue non cominciate; chi approva sempre, col motivo per quelle degli altri). */
  annullaAssenza(d) {
    const a = this.db.riga('SELECT * FROM assenze WHERE id = ?', Number(d.id) || 0);
    const mia = this.miaPersonaId();
    if (!a || (a.persona_id !== mia && this.livello('persone') < 2)) throw new Rifiuto('Assenza ' + testo(d.id) + ' non trovata');
    if (a.stato === 'annullata') return this.rispostaAssenza(a, false);
    const propria = a.persona_id === mia;
    const approva = this.puoApprovareAssenze() && (!propria || this.ruoloTitolare());
    const motivo = testo(d.motivo);
    if (!approva) {
      if (!propria) throw senzaPermesso('annullare le assenze degli altri');
      if (a.dal <= oggi()) throw new Rifiuto('L\'assenza è già cominciata: per cambiarla chiedi a chi approva');
    } else if (!propria && !motivo) throw new Rifiuto('Scrivi il motivo: arriva a chi l\'ha chiesta');
    // Una ferie in corso (cominciata prima di oggi e non finita) si accorcia, non si annulla (§6.4): annullarla
    // cancellerebbe anche i giorni gia' goduti, e il saldo sbaglierebbe. Le segnalate (malattia...) si annullano sempre.
    if (a.stato === 'approvata' && !sanitaria(a.tipo) && a.dal < oggi() && a.al >= oggi()) {
      throw new Rifiuto(a.tipo === 'ferie' ? 'Le ferie sono in corso: accorciale fino a ieri, non si annullano' : 'L\'assenza è in corso: accorciala fino a ieri, non si annulla');
    }
    const ora = adesso();
    this.aggiorna('assenze', a.id, { stato: 'annullata', annullata_il: ora, motivo_annullo: motivo, modificato: ora }, 'id', 'assenza annullata' + (motivo ? ': ' + motivo : ''));
    return this.rispostaAssenza(this.db.riga('SELECT * FROM assenze WHERE id = ?', a.id), false);
  },

  // ------------------------------------------------------------------ approvare (con ore.js decidi)

  /** Le parole della decisione nel registro: "ferie approvate", "permesso respinto: ...". */
  notaDecisioneAssenza(a, decisione, motivo) {
    const f = a.tipo === 'ferie' ? ['ferie', 'approvate', 'respinte', 'di nuovo da approvare']
      : a.tipo === 'permesso' ? ['permesso', 'approvato', 'respinto', 'di nuovo da approvare'] : ['assenza', 'approvata', 'respinta', 'di nuovo da approvare'];
    if (decisione === 'approva') return f[0] + ' ' + f[1];
    if (decisione === 'respingi') return f[0] + ' ' + f[2] + ': ' + motivo;
    return f[0] + ' ' + f[3];
  },

  /** Una voce "assenza" da decidere (§6.4): la riga e lo stato con le parole delle ore. */
  voceAssenza(id) {
    const a = this.db.riga('SELECT * FROM assenze WHERE id = ?', Number(id) || 0);
    if (!a || a.stato === 'annullata') throw new Rifiuto('Assenza ' + testo(id) + ' non trovata');
    return { tipo: 'assenza', r: a, tabella: 'assenze', id: a.id, modulo: 'persone', autore: null, stato: a.stato, nome: 'l\'assenza ' + periodoFrase(a.dal, a.al) };
  },

  /** decidi per le assenze: approva, respingi, annulla (Annulla dell'avviso). Torna i valori da scrivere, o null se e' gia' cosi'. */
  decisioneAssenza(v, decisione, motivo, io, ora) {
    const a = v.r;
    if (!this.puoApprovareAssenze()) throw senzaPermesso('approvare le assenze');
    if (a.persona_id === this.miaPersonaId() && !this.ruoloTitolare()) throw new Rifiuto('Le tue ' + (a.tipo === 'ferie' ? 'ferie' : 'assenze') + ' le approva il titolare');
    if (sanitaria(a.tipo)) throw new Rifiuto('Questa assenza non si approva: è nata approvata');
    const cominciata = a.dal <= oggi();
    const giaCominciata = a.tipo === 'ferie' ? 'Le ferie sono già cominciate: annullale dal giorno di oggi' : 'L\'assenza è già cominciata: annullala dal giorno di oggi';
    if (decisione === 'approva') {
      if (a.stato === 'approvata') return null;
      if (a.stato === 'bozza') throw new Rifiuto('La richiesta è ancora in bozza: chi l\'ha scritta deve prima mandarla');
      return { stato: 'approvata', approvata_da: io, approvata_il: ora, motivo_rifiuto: '' };
    }
    if (decisione === 'respingi') {
      if (a.stato === 'respinta' && a.motivo_rifiuto === motivo) return null;
      if (a.stato === 'bozza') throw new Rifiuto('La richiesta è ancora in bozza: chi l\'ha scritta deve prima mandarla');
      if (a.stato === 'approvata' && cominciata) throw new Rifiuto(giaCominciata);
      return { stato: 'respinta', approvata_da: io, approvata_il: ora, motivo_rifiuto: motivo };
    }
    if (a.stato === 'da_approvare') return null;
    if (a.stato === 'bozza') throw new Rifiuto('Non c\'è niente da annullare per ' + v.nome);
    if (a.stato === 'approvata' && cominciata) throw new Rifiuto(giaCominciata);
    return { stato: 'da_approvare', approvata_da: null, approvata_il: '', motivo_rifiuto: '' };
  },

  /** Le attivita' aperte assegnate a un utente fra due giorni (anche gli interventi). */
  attivitaTra(idUtente, dal, al) {
    if (!idUtente) return [];
    return this.db.righe("SELECT * FROM attivita WHERE assegnata_a = ? AND stato IN ('da_fare', 'in_corso')", idUtente).filter(x => {
      const g = x.inizio ? dataIso(x.inizio) : x.scadenza;
      const fine = x.fine ? dataIso(x.fine) : g;
      return g && g <= al && fine >= dal;
    });
  },

  /**
   * Le anomalie di una richiesta (§6.4, in giallo scuro): saldo che va sotto zero, colleghi assenti negli stessi
   * giorni, attivita' assegnate in quei giorni, ore o rapportini gia' scritti.
   */
  anomalieAssenza(a, p) {
    const out = [];
    if (a.stato === 'annullata' || a.stato === 'respinta') return out;
    if ((a.tipo === 'ferie' || a.tipo === 'permesso') && this.vedePersonaliDi(p.id)) {
      const s = this.saldiPersona(p)[a.tipo === 'ferie' ? 'ferie' : 'permessi'];
      if (s && s.tenuto && s.restano < 0) out.push({ tipo: 'saldoNegativo', testo: 'Dopo questa richiesta restano ' + virgola(s.restano).replace('-', '−') + ' ore di ' + (a.tipo === 'ferie' ? 'ferie' : 'permesso') });
    }
    const colleghi = this.db.righe("SELECT DISTINCT persona_id FROM assenze WHERE persona_id <> ? AND stato IN ('approvata', 'da_approvare') AND dal <= ? AND al >= ?", p.id, a.al, a.dal);
    if (colleghi.length) {
      const nomi = colleghi.map(c => this.nomePersona(c.persona_id)).filter(Boolean);
      out.push({ tipo: 'colleghiAssenti', testo: 'Negli stessi giorni ' + (nomi.length === 1 ? 'è assente anche ' : 'sono assenti anche ') + nomi.join(', ') });
    }
    const att = this.attivitaTra(p.utente_id, a.dal, a.al);
    if (att.length) {
      const g = x => { const d = x.inizio ? dataIso(x.inizio) : x.scadenza; return nomeGiorno(d) + ' ' + Number(d.slice(8, 10)); };
      out.push({ tipo: 'impegni', testo: 'Ha ' + (att.length === 1 ? '1 attività' : att.length + ' attività') + ' in quei giorni: ' + att.slice(0, 3).map(x => x.titolo + ' ' + g(x)).join(', ') });
    }
    if (p.utente_id && !C.assenzaAOre(a)) {
      const ore = this.db.riga("SELECT COUNT(*) n FROM ore WHERE utente_id = ? AND tolta IS NULL AND stato IN ('da_approvare', 'approvata') AND data BETWEEN ? AND ?", p.utente_id, a.dal, a.al).n;
      const rap = this.db.riga("SELECT COUNT(*) n FROM rapportini WHERE utente_id = ? AND UPPER(stato) <> 'ANNULLATO' AND data BETWEEN ? AND ?", p.utente_id, a.dal, a.al).n;
      if (ore || rap) out.push({ tipo: 'oreRegistrate', testo: 'Ha già ore o rapportini in quei giorni' });
    }
    return out;
  },

  /** Le voci "assenza" di daApprovare (per chi le approva), raggruppate poi per persona in ore.js. */
  vociAssenzeDaApprovare() {
    if (!this.puoApprovareAssenze()) return [];
    const mia = this.miaPersonaId();
    const titolare = this.ruoloTitolare();
    const out = [];
    for (const a of this.db.righe("SELECT * FROM assenze WHERE stato = 'da_approvare' ORDER BY dal, id")) {
      if (a.persona_id === mia && !titolare) continue;
      const p = this.db.riga('SELECT * FROM persone WHERE id = ?', a.persona_id);
      if (!p) continue;
      const aOre = C.assenzaAOre(a);
      const s = this.saldiPersona(p)[a.tipo === 'permesso' ? 'permessi' : 'ferie'];
      const restano = (a.tipo === 'ferie' || a.tipo === 'permesso') && s && s.tenuto
        ? (a.tipo === 'ferie' && s.giorniRestano !== undefined ? 'restano ' + quanti(s.giorniRestano, 'giorno', 'giorni') : 'restano ' + quanti(s.restano, 'ora', 'ore')) : '';
      const dettaglio = [periodoLungo(a.dal, a.al) + (a.dalle ? ' · ' + a.dalle + '-' + a.alle : ''),
        aOre ? quanti(a.ore, 'ora', 'ore') : quanti(a.giorni, 'giorno', 'giorni'), restano].filter(Boolean).join(' · ');
      out.push({
        tipo: 'assenza', id: a.id, idUtente: p.utente_id, idPersona: p.id, nome: p.nome, data: a.dal, cosa: this.tipoVistoAssenza(a), dettaglio,
        quanto: a.ore, unita: 'ore', anomalie: this.anomalieAssenza(a, p),
      });
    }
    return out;
  },

  // ------------------------------------------------------------------ calendario, attivita', giorni senza rapportino

  /** Le assenze approvate di una persona in un giorno (per i giorni senza rapportino e le presenze). */
  assenzeDelGiorno(idPersona, giorno) {
    return this.db.righe("SELECT * FROM assenze WHERE persona_id = ? AND stato = 'approvata' AND dal <= ? AND al >= ?", idPersona, giorno, giorno);
  },

  /** Un giorno "non da lavorare" per una persona: festivo, chiusura, o assente tutto il giorno. */
  giornoNonLavorato(idPersona, giorno) {
    if (this.festiviPer(giorno, giorno).indexOf(giorno) >= 0) return 'festa';
    if (this.db.riga('SELECT id FROM chiusure WHERE dal <= ? AND al >= ?', giorno, giorno)) return 'chiuso';
    if (idPersona) {
      const intere = this.assenzeDelGiorno(idPersona, giorno).filter(a => !C.assenzaAOre(a) && !(a.mezza && a.dal === a.al));
      if (intere.length) return this.vedeTipoAssenza(intere[0]) && intere[0].tipo === 'ferie' ? 'ferie' : 'assente';
    }
    return '';
  },

  /**
   * Un'attivita' per qualcuno assente quel giorno (§6.5): come le sovrapposizioni, serveConferma con gli assenti.
   * Un permesso a ore conta solo se si accavalla con l'orario dell'attivita'.
   */
  controllaAssenti(v) {
    // Come le sovrapposizioni: conta un impegno con l'ora (appuntamento, sopralluogo, intervento); un'attivita' con la sola
    // scadenza non e' "essere li' quel giorno".
    if (v.assegnata_a === null || v.assegnata_a === undefined || v.stato === 'fatta' || v.stato === 'annullata' || !v.inizio) return;
    const g = dataIso(v.inizio);
    if (!g) return;
    const fine = v.fine ? dataIso(v.fine) : g;
    const p = this.personaDiUtente(v.assegnata_a);
    if (!p) return;
    const assenze = this.db.righe("SELECT * FROM assenze WHERE persona_id = ? AND stato = 'approvata' AND dal <= ? AND al >= ?", p.id, fine, g).filter(a => {
      if (!C.assenzaAOre(a) || !a.dalle || !v.inizio || v.tutto_il_giorno) return true;
      const ini = new Date(v.inizio);
      const fin = new Date(v.fine || v.inizio);
      const mi = ini.getHours() * 60 + ini.getMinutes();
      const mf = fin.getHours() * 60 + fin.getMinutes();
      return C.minutiDa(a.dalle) < mf && mi < C.minutiDa(a.alle);
    });
    if (!assenze.length) return;
    const a = assenze[0];
    const parola = this.vedeTipoAssenza(a) && a.tipo === 'ferie' ? 'in ferie' : this.vedeTipoAssenza(a) && a.tipo === 'permesso' ? 'in permesso' : 'assente';
    throw new Rifiuto(p.nome + ' è ' + parola + ' quel giorno (' + periodoFrase(a.dal, a.al) + ')', {
      assenti: assenze.map(x => ({ idUtente: p.utente_id, idPersona: p.id, nome: p.nome, dal: x.dal, al: x.al, tipoVisto: this.tipoVistoAssenza(x) })),
      serveConferma: true,
    });
  },

  // ------------------------------------------------------------------ chiusure dello studio

  chiusuraDaRiga(c) {
    const n = this.db.riga("SELECT COUNT(*) n FROM assenze WHERE chiusura_id = ? AND stato = 'approvata'", c.id).n;
    return { id: c.id, nome: c.nome, dal: c.dal, al: c.al, ferie: c.ferie === 1, assenze: n, frase: 'Studio chiuso: ' + c.nome };
  },

  /** chiusure {anno?} (persone 1). */
  leggiChiusure(d) {
    const anno = testo(d && d.anno);
    const righe = anno ? this.db.righe("SELECT * FROM chiusure WHERE substr(dal, 1, 4) = ? OR substr(al, 1, 4) = ? ORDER BY dal", anno, anno)
      : this.db.righe('SELECT * FROM chiusure WHERE al >= ? ORDER BY dal', piuGiorni(oggi(), -366));
    return { ok: true, chiusure: righe.map(c => this.chiusuraDaRiga(c)) };
  },

  /**
   * Le ferie che una chiusura farebbe nascere: per ogni persona attiva quei giorni con le ferie tenute, i giorni
   * lavorativi della chiusura in cui non ha gia' un'assenza, a pezzi contigui.
   */
  ferieDellaChiusura(c) {
    const out = [];
    for (const p of this.db.righe("SELECT * FROM persone WHERE anonimizzata_il = '' AND ferie_annue_ore IS NOT NULL AND (entrata_il = '' OR entrata_il <= ?) AND (uscita_il = '' OR uscita_il >= ?) ORDER BY nome", c.al, c.dal)) {
      const orario = this.orarioPersona(p);
      const giorni = C.giorniLavorativiElenco(c.dal, c.al, orario.giorniSettimana, this.festiviPer(c.dal, c.al))
        .filter(g => (!p.entrata_il || g >= p.entrata_il) && (!p.uscita_il || g <= p.uscita_il))
        .filter(g => !this.db.riga("SELECT id FROM assenze WHERE persona_id = ? AND stato IN ('da_approvare', 'approvata') AND dal <= ? AND al >= ? AND (chiusura_id IS NULL OR chiusura_id <> ?)", p.id, g, g, c.id || 0));
      if (!giorni.length) continue;
      const pezzi = [];
      for (const g of giorni) {
        const ultimo = pezzi[pezzi.length - 1];
        // Contigui: nessun giorno lavorativo saltato fra l'ultimo e questo.
        if (ultimo && C.giorniLavorativi(piuGiorni(ultimo.al, 1), piuGiorni(g, -1), orario.giorniSettimana, this.festiviPer(ultimo.al, g)) === 0) ultimo.al = g;
        else pezzi.push({ dal: g, al: g });
      }
      const oreGiorno = C.oreGiornoPersona(orario);
      out.push({ persona: p, pezzi, giorni: giorni.length, ore: ore2(giorni.length * oreGiorno) });
    }
    return out;
  },

  /** salvaChiusura {chiusura: {id?, nome, dal, al, ferie}, conferma?} (persone 2). */
  salvaChiusura(d) {
    if (this.livello('persone') < 2) throw senzaPermesso('scrivere le chiusure dello studio');
    const x = (d && d.chiusura) || {};
    const prima = testo(x.id) ? this.db.riga('SELECT * FROM chiusure WHERE id = ?', Number(x.id) || 0) : null;
    if (testo(x.id) && !prima) throw new Rifiuto('Chiusura ' + testo(x.id) + ' non trovata');
    const nome = x.nome !== undefined ? testo(x.nome) : prima ? prima.nome : '';
    if (!nome) throw new Rifiuto('Nome: scrivi il nome della chiusura (per esempio Natale)');
    const dal = x.dal !== undefined ? (testo(x.dal) ? dataDaIso(x.dal) : '') : prima ? prima.dal : '';
    if (!dal) throw new Rifiuto('Dal: scrivi il primo giorno');
    const al = x.al !== undefined ? (testo(x.al) ? dataDaIso(x.al) : dal) : prima ? prima.al : dal;
    if (al < dal) throw new Rifiuto('Al: non può venire prima di Dal');
    const ferie = x.ferie !== undefined ? si(x.ferie) : prima ? prima.ferie === 1 : false;
    const prova = { id: prima ? prima.id : 0, nome, dal, al };
    const nascono = ferie ? this.ferieDellaChiusura(prova) : [];
    if (nascono.length && !si(d.conferma)) {
      const elenco = nascono.map(n => n.persona.nome + ' ' + quanti(n.giorni, 'giorno', 'giorni') + ' (' + virgola(n.ore) + ' ore)').join(', ');
      return { ok: false, serveConferma: true, errore: 'Nascono le ferie di ' + nome + ' per ' + (nascono.length === 1 ? '1 persona' : nascono.length + ' persone') + ': ' + elenco,
        persone: nascono.map(n => ({ idPersona: n.persona.id, nome: n.persona.nome, giorni: n.giorni, ore: n.ore })) };
    }
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('chiusure', id, { nome, dal, al, ferie: ferie ? 1 : 0 });
      // Le ferie nate dalla chiusura si rifanno (quelle cambiate a mano non le segue piu').
      this.togliFerieChiusura(id, 'Chiusura cambiata');
    } else {
      id = this.inserisci('chiusure', { nome, dal, al, ferie: ferie ? 1 : 0, creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora });
    }
    for (const n of ferie ? this.ferieDellaChiusura({ id, nome, dal, al }) : []) {
      for (const pz of n.pezzi) {
        const conto = this.contoAssenza({ tipo: 'ferie', dal: pz.dal, al: pz.al }, n.persona);
        this.inserisci('assenze', {
          persona_id: n.persona.id, tipo: 'ferie', dal: pz.dal, al: pz.al, giorni: conto.giorni, ore: conto.ore, stato: 'approvata', chiusura_id: id,
          creata_da: this.chi().utente ? this.chi().utente.id : null, creato: ora, modificato: ora,
        }, 'id', 'ferie della chiusura ' + nome);
      }
    }
    return { ok: true, chiusura: this.chiusuraDaRiga(this.db.riga('SELECT * FROM chiusure WHERE id = ?', id)) };
  },

  togliFerieChiusura(id, motivo) {
    const ora = adesso();
    for (const a of this.db.righe("SELECT * FROM assenze WHERE chiusura_id = ? AND stato <> 'annullata'", id)) {
      this.aggiorna('assenze', a.id, { stato: 'annullata', annullata_il: ora, motivo_annullo: motivo, modificato: ora }, 'id', 'assenza annullata: ' + motivo);
    }
  },

  /** togliChiusura {id, conferma?} (persone 2): toglie la chiusura e le sue ferie (non quelle cambiate a mano). */
  togliChiusura(d) {
    if (this.livello('persone') < 2) throw senzaPermesso('scrivere le chiusure dello studio');
    const c = this.db.riga('SELECT * FROM chiusure WHERE id = ?', Number(d.id) || 0);
    if (!c) throw new Rifiuto('Chiusura ' + testo(d.id) + ' non trovata');
    const n = this.db.riga("SELECT COUNT(*) n FROM assenze WHERE chiusura_id = ? AND stato <> 'annullata'", c.id).n;
    if (n && !si(d.conferma)) {
      return { ok: false, serveConferma: true, errore: 'Con la chiusura ' + c.nome + ' si tolgono anche ' + (n === 1 ? '1 assenza di ferie' : n + ' assenze di ferie') + ': la tolgo?' };
    }
    this.togliFerieChiusura(c.id, 'Chiusura tolta');
    this.db.esegui('UPDATE assenze SET chiusura_id = NULL WHERE chiusura_id = ?', c.id);
    this.db.esegui('DELETE FROM chiusure WHERE id = ?', c.id);
    this.annota('chiusure', c.id, Object.assign({}, c), null, 'tolta');
    return { ok: true };
  },

  // ------------------------------------------------------------------ presenze del mese (§3.5, §6.7)

  /**
   * presenze {mese: "2026-10", idPersona?} (persone 1; il collaboratore solo la sua): per persona e giorno le ore
   * previste (orario e festivi), lavorate (ore registrate mandate o approvate + rapportini non annullati), straordinarie,
   * l'assenza e quanto manca. Ricavate: niente timbrature, niente posizione.
   */
  presenze(d) {
    d = d || {};
    const mese = testo(d.mese) || oggi().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mese)) throw new Rifiuto('Mese: scrivi il mese come 2026-10');
    const da = mese + '-01';
    const a = C.fineMese(da);
    const mia = this.miaPersonaId();
    let persone = this.db.righe("SELECT * FROM persone WHERE anonimizzata_il = '' AND (entrata_il = '' OR entrata_il <= ?) AND (uscita_il = '' OR uscita_il >= ?) ORDER BY nome", a, da);
    if (this.soloSuoi()) persone = persone.filter(p => p.id === mia);
    if (testo(d.idPersona)) persone = persone.filter(p => p.id === Number(d.idPersona));
    const fest = this.festiviPer(da, a);
    const chiusure = this.db.righe('SELECT * FROM chiusure WHERE al >= ? AND dal <= ? ORDER BY dal', da, a);
    const chiuso = g => chiusure.some(c => c.dal <= g && c.al >= g);
    const giorniMese = [];
    for (let g = da; g <= a; g = piuGiorni(g, 1)) giorniMese.push(g);
    const out = [];
    for (const p of persone) {
      const orario = this.orarioPersona(p);
      const oreGiorno = C.oreGiornoPersona(orario);
      const lavorative = new Set(C.giorniLavorativiElenco(da, a, orario.giorniSettimana, fest));
      const lavorate = {};
      const straord = {};
      if (p.utente_id) {
        for (const o of this.db.righe("SELECT data, ore, tipo FROM ore WHERE utente_id = ? AND tolta IS NULL AND stato IN ('da_approvare', 'approvata') AND data BETWEEN ? AND ?", p.utente_id, da, a)) {
          lavorate[o.data] = (lavorate[o.data] || 0) + numero(o.ore);
          if (o.tipo === 'straordinaria') straord[o.data] = (straord[o.data] || 0) + numero(o.ore);
        }
        for (const r of this.db.righe("SELECT data, ore_lavoro, ore_extra, ore_viaggio FROM rapportini WHERE utente_id = ? AND UPPER(stato) <> 'ANNULLATO' AND data BETWEEN ? AND ?", p.utente_id, da, a)) {
          const g = dataIso(r.data);
          lavorate[g] = (lavorate[g] || 0) + numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio);
          straord[g] = (straord[g] || 0) + numero(r.ore_extra);
        }
      }
      const assenze = {};
      for (const x of this.db.righe("SELECT * FROM assenze WHERE persona_id = ? AND stato = 'approvata' AND dal <= ? AND al >= ?", p.id, a, da)) {
        for (const g of this.orePerGiorno(x, p)) {
          if (g.data < da || g.data > a) continue;
          const prima = assenze[g.data];
          assenze[g.data] = { r: x, ore: ore2((prima ? prima.ore : 0) + g.ore), tipoVisto: prima ? prima.tipoVisto : this.tipoVistoAssenza(x) };
        }
      }
      const vedeSanitarie = this.livello('riservati') >= 1 || p.id === mia;
      const tot = { giorniLavorati: 0, oreLavorate: 0, straordinarie: 0, ferie: 0, permessi: 0, malattia: { giorni: 0, ore: 0 }, altreAssenze: 0, mancano: 0 };
      const giorni = giorniMese.map(g => {
        const dentro = (!p.entrata_il || g >= p.entrata_il) && (!p.uscita_il || g <= p.uscita_il);
        const previste = dentro && lavorative.has(g) && !chiuso(g) ? oreGiorno : 0;
        const lav = ore2(lavorate[g] || 0);
        const str = ore2(straord[g] || 0);
        const as = assenze[g] || null;
        const oreAss = as ? as.ore : 0;
        const manca = Math.max(0, ore2(previste - lav - oreAss));
        if (lav > 0) tot.giorniLavorati++;
        tot.oreLavorate += lav;
        tot.straordinarie += str;
        tot.mancano += manca;
        if (as) {
          const t = as.r.tipo;
          if (t === 'ferie' && this.vedeTipoAssenza(as.r)) tot.ferie += as.ore;
          else if (t === 'permesso' && this.vedeTipoAssenza(as.r)) tot.permessi += as.ore;
          else if (t === 'malattia' && vedeSanitarie) { tot.malattia.giorni++; tot.malattia.ore += as.ore; }
          else tot.altreAssenze += as.ore;
        }
        return {
          data: g, previste, lavorate: lav, straordinarie: str, assenza: as ? { tipoVisto: as.tipoVisto, ore: as.ore } : null, manca,
          giorno: !dentro ? '' : fest.indexOf(g) >= 0 ? 'festa' : chiuso(g) ? 'chiuso' : '',
        };
      });
      ['oreLavorate', 'straordinarie', 'ferie', 'permessi', 'altreAssenze', 'mancano'].forEach(k => { tot[k] = ore2(tot[k]); });
      tot.malattia.ore = ore2(tot.malattia.ore);
      if (!vedeSanitarie) delete tot.malattia;
      // Il tipo di un'assenza sanitaria di un'altra persona e' un dato riservato (§5.7): chi lo vede qui lascia la riga
      // "visto" (una al giorno per persona), come quando arriva da "assenze".
      else if (p.id !== mia && Object.values(assenze).some(x => C.SANITARIE.indexOf(x.r.tipo) >= 0)) this.registraAccessoRiservato(p.id, 'assenza', 'visto', 'presenze ' + mese);
      out.push({ idPersona: p.id, nome: p.nome, oreGiorno, giorni, totali: tot });
    }
    return { ok: true, mese, festivi: fest.filter(g => g >= da && g <= a), chiusure: chiusure.map(c => this.chiusuraDaRiga(c)), persone: out, programmaPaghe: 'non collegato' };
  },
};

Object.defineProperties(module.exports, {
  TIPI_ASSENZA: { value: TIPI },
  NOMI_TIPO_ASSENZA: { value: NOMI_TIPO },
  NOMI_STATO_ASSENZA: { value: NOMI_STATO },
  periodoFrase: { value: periodoFrase },
  periodoLungo: { value: periodoLungo },
});
