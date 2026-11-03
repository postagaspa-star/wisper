/*
 * I progetti (03/11/2026, chiesti da Manuel): cliente -> commessa -> progetto -> rapportino. Ogni progetto ha un codice
 * (a mano le prime volte, poi proposto da Wisper con la regola trovata nei primi: src/codici-progetto.js), a chi e'
 * intestato (facoltativo) e una descrizione. Il codice non si ripete fra i progetti dello stesso cliente.
 *
 * Il cliente del progetto e' quello della sua commessa: non si scrive due volte.
 */
'use strict';

const { Rifiuto, senzaPermesso, testo, numero, adesso, oggi, dataOraIso } = require('../utili');
const { proponiCodice } = require('../codici-progetto');

const STATI = ['APERTO', 'CHIUSO'];

function progettoDaRiga(r, conti) {
  const c = (conti && conti[r.id]) || { rapportini: 0, ore: 0, ultimo: '' };
  return {
    id: r.id,
    idLocale: testo(r.id_locale),
    idCommessa: testo(r.commessa_id),
    idCliente: testo(r.cliente_id),
    codice: testo(r.codice),
    intestatoA: testo(r.intestato_a),
    descrizione: testo(r.descrizione),
    stato: testo(r.stato) || 'APERTO',
    codiceAutomatico: r.codice_automatico === 1,
    creato: dataOraIso(r.creato),
    modificato: dataOraIso(r.modificato),
    rapportini: c.rapportini,
    ore: Math.round(c.ore * 100) / 100,
    ultimoRapportino: c.ultimo,
  };
}

const SELEZIONE = 'SELECT p.*, c.cliente_id FROM progetti p LEFT JOIN commesse c ON c.id = p.commessa_id';

module.exports = {
  /** Quanti rapportini (non annullati) e quante ore per progetto; un collaboratore conta solo i suoi. */
  contiProgetti(id) {
    const condizioni = ["id_progetto IS NOT NULL", "UPPER(stato) <> 'ANNULLATO'"];
    const parametri = [];
    if (id !== undefined) { condizioni.push('id_progetto = ?'); parametri.push(id); }
    if (this.soloSuoi()) { condizioni.push('utente_id = ?'); parametri.push(this.chi().utente.id); }
    const out = {};
    for (const r of this.db.righe('SELECT id_progetto, COUNT(*) n, SUM(ore_totali) ore, MAX(data) ultimo FROM rapportini WHERE ' +
      condizioni.join(' AND ') + ' GROUP BY id_progetto', ...parametri)) {
      out[r.id_progetto] = { rapportini: r.n, ore: numero(r.ore), ultimo: testo(r.ultimo) };
    }
    return out;
  },

  /** Le righe dei progetti che chi chiede puo' vedere (l'esterno solo quelli delle commesse dei suoi incarichi). */
  righeProgetti(filtro) {
    const f = filtro || {};
    const condizioni = [];
    const parametri = [];
    if (testo(f.idCommessa)) { condizioni.push('p.commessa_id = ?'); parametri.push(testo(f.idCommessa)); }
    if (testo(f.idCliente)) { condizioni.push('c.cliente_id = ?'); parametri.push(testo(f.idCliente)); }
    if (testo(f.stato)) { condizioni.push('p.stato = ?'); parametri.push(testo(f.stato).toUpperCase()); }
    let righe = this.db.righe(SELEZIONE + (condizioni.length ? ' WHERE ' + condizioni.join(' AND ') : '') + ' ORDER BY p.creato, p.id', ...parametri);
    if (this.eEsterno()) {
      const mie = this.commesseEsterno();
      righe = righe.filter(r => mie.has(testo(r.commessa_id).toUpperCase()));
    }
    const cerca = testo(f.cerca).toLowerCase();
    if (cerca) righe = righe.filter(r => [r.codice, r.intestato_a, r.descrizione, r.commessa_id].some(v => testo(v).toLowerCase().indexOf(cerca) >= 0));
    return righe;
  },

  /** progetti {idCommessa?, idCliente?, stato?, cerca?}: i piu' recenti prima. */
  leggiProgetti(filtro) {
    const conti = this.contiProgetti();
    return this.righeProgetti(filtro).map(r => progettoDaRiga(r, conti)).reverse();
  },

  progettoRiga(id) {
    const n = Number(id);
    if (!(n > 0)) return null;
    return this.db.riga(SELEZIONE + ' WHERE p.id = ?', n) || null;
  },

  /** progetto {id}: la scheda e i suoi rapportini (i piu' recenti prima). */
  schedaProgetto(d) {
    const r = this.progettoRiga(d.id);
    if (!r || (this.eEsterno() && !this.commesseEsterno().has(testo(r.commessa_id).toUpperCase()))) throw new Rifiuto('Progetto non trovato');
    const progetto = progettoDaRiga(r, this.contiProgetti(r.id));
    const rapportini = this.livello('rapportini') >= 1 ? this.leggiRapportini('', '', false, { idProgetto: r.id }) : [];
    return { ok: true, progetto, rapportini };
  },

  /** Tutti i progetti come li vuole la regola del codice. */
  progettiPerCodice() {
    return this.db.righe(SELEZIONE).map(r => ({ id: r.id, codice: r.codice, idCommessa: r.commessa_id, idCliente: testo(r.cliente_id), creato: r.creato }));
  },

  /** codiceProgetto {idCommessa}: il codice che Wisper propone (vuoto finche' non ha imparato la regola). */
  codiceProgetto(d) {
    const commessa = testo(d.idCommessa) ? this.commessa(testo(d.idCommessa)) : null;
    // Per una commessa che nasce col rapportino (non c'e' ancora): idCliente, se c'e', e il codice che avra' la commessa,
    // se si sa; con un cliente nuovo anche niente (conta la forma di tutti i codici). E' solo una proposta: non rifiuta.
    // Codice vuoto = Wisper non sa ancora proporlo (meno di due codici): l'app lo chiede a mano.
    const dove = commessa ? { idCommessa: commessa.id, idCliente: commessa.idCliente } : { idCommessa: testo(d.idCommessa), idCliente: testo(d.idCliente) };
    const p = proponiCodice(this.progettiPerCodice(), { ...dove, anno: Number(oggi().slice(0, 4)) });
    return { ok: true, codice: p.codice, da: p.da };
  },

  /** Il codice e' gia' di un altro progetto dello stesso cliente? */
  codiceGiaPreso(codice, idCliente, tranneId) {
    return this.db.riga('SELECT p.id FROM progetti p LEFT JOIN commesse c ON c.id = p.commessa_id WHERE p.codice = ? AND IFNULL(c.cliente_id, \'\') = ? AND p.id <> ?',
      testo(codice), testo(idCliente), Number(tranneId) || 0) || null;
  },

  /**
   * creaProgetto {idCommessa, codiceProgetto?, intestatoA?, descrizione, idLocale?, codiceProposto?}. Il codice arriva in
   * codiceProgetto perche' /exec toglie "codice" da ogni richiesta (era il codice d'accesso di prima). Senza codice si usa quello
   * proposto da Wisper (se ha gia' imparato la regola). codiceProposto: true se il codice l'ha proposto un telefono senza
   * rete: se nel frattempo e' stato preso, si prende il successivo libero. Un codice scritto a mano e gia' preso si rifiuta.
   */
  creaProgetto(d) {
    const idLocale = testo(d.idLocale);
    if (idLocale) {
      const gia = this.db.riga('SELECT id FROM progetti WHERE id_locale = ?', idLocale);
      if (gia) return Object.assign({ giaEsisteva: true }, progettoDaRiga(this.progettoRiga(gia.id), this.contiProgetti(gia.id)));
    }
    const commessa = this.commessa(testo(d.idCommessa));
    if (!commessa) throw new Rifiuto(testo(d.idCommessa) ? 'Commessa ' + testo(d.idCommessa) + ' non trovata' : 'Scegli la commessa del progetto');
    if (this.eEsterno() && !this.commesseEsterno().has(commessa.id.toUpperCase())) throw new Rifiuto('Commessa ' + commessa.id + ' non trovata');
    const descrizione = testo(d.descrizione);
    if (!descrizione) throw new Rifiuto('Scrivi la descrizione del progetto');
    const proposta = proponiCodice(this.progettiPerCodice(), { idCommessa: commessa.id, idCliente: commessa.idCliente, anno: Number(oggi().slice(0, 4)) });
    let codice = testo(d.codiceProgetto !== undefined ? d.codiceProgetto : d.codice);
    const propostoDaTelefono = d.codiceProposto === true || d.codiceProposto === 'true';
    if (!codice) {
      if (!proposta.codice) throw new Rifiuto('Scrivi il codice del progetto: dopo i primi due Wisper lo propone da solo');
      codice = proposta.codice;
    }
    if (codice.length > 60) throw new Rifiuto('Il codice del progetto è troppo lungo (al massimo 60 caratteri)');
    if (this.codiceGiaPreso(codice, commessa.idCliente)) {
      if (!propostoDaTelefono || !proposta.codice) throw new Rifiuto('Il codice ' + codice + ' è già di un altro progetto di questo cliente');
      codice = proposta.codice;
    }
    const ora = adesso();
    const c = this.chi();
    const id = this.inserisci('progetti', {
      id_locale: idLocale || null,
      commessa_id: commessa.id,
      codice,
      intestato_a: testo(d.intestatoA),
      descrizione,
      stato: 'APERTO',
      codice_automatico: proposta.codice && codice.toUpperCase() === proposta.codice.toUpperCase() ? 1 : 0,
      utente_id: c.utente ? c.utente.id : null,
      creato: ora,
      modificato: ora,
    });
    return Object.assign({ giaEsisteva: false }, progettoDaRiga(this.progettoRiga(id), {}));
  },

  /**
   * aggiornaProgetto {id, campi: {codice?, intestatoA?, descrizione?, stato?, idCommessa?}}. La commessa si cambia solo
   * finche' il progetto non ha rapportini (i rapportini restano dove sono stati scritti).
   */
  aggiornaProgetto(id, campi) {
    const r = this.progettoRiga(id);
    if (!r) throw new Rifiuto('Progetto non trovato');
    const k = campi || {};
    const valori = {};
    let idCliente = testo(r.cliente_id);
    if (k.idCommessa !== undefined && testo(k.idCommessa).toUpperCase() !== testo(r.commessa_id).toUpperCase()) {
      const nuova = this.commessa(testo(k.idCommessa));
      if (!nuova) throw new Rifiuto('Commessa ' + testo(k.idCommessa) + ' non trovata');
      if (this.db.riga('SELECT id FROM rapportini WHERE id_progetto = ? LIMIT 1', r.id)) {
        throw new Rifiuto('Il progetto ha già dei rapportini: la commessa non si cambia');
      }
      valori.commessa_id = nuova.id;
      idCliente = nuova.idCliente;
    }
    if (k.codice !== undefined) {
      const codice = testo(k.codice);
      if (!codice) throw new Rifiuto('Il codice del progetto non può essere vuoto');
      if (codice.length > 60) throw new Rifiuto('Il codice del progetto è troppo lungo (al massimo 60 caratteri)');
      valori.codice = codice;
      if (codice.toUpperCase() !== testo(r.codice).toUpperCase()) valori.codice_automatico = 0;
    }
    const codiceFinale = valori.codice || testo(r.codice);
    if ((valori.codice || valori.commessa_id) && this.codiceGiaPreso(codiceFinale, idCliente, r.id)) {
      throw new Rifiuto('Il codice ' + codiceFinale + ' è già di un altro progetto di questo cliente');
    }
    if (k.intestatoA !== undefined) valori.intestato_a = testo(k.intestatoA);
    if (k.descrizione !== undefined) {
      if (!testo(k.descrizione)) throw new Rifiuto('La descrizione del progetto non può essere vuota');
      valori.descrizione = testo(k.descrizione);
    }
    if (k.stato !== undefined) {
      const s = testo(k.stato).toUpperCase();
      if (STATI.indexOf(s) < 0) throw new Rifiuto('Stato del progetto non valido: ' + s);
      valori.stato = s;
    }
    if (Object.keys(valori).length) {
      valori.modificato = adesso();
      this.aggiorna('progetti', r.id, valori);
      // Il codice scritto nei rapportini segue quello del progetto (e' quello che si cerca).
      if (valori.codice) this.db.esegui('UPDATE rapportini SET progetto = ? WHERE id_progetto = ?', valori.codice, r.id);
    }
    return progettoDaRiga(this.progettoRiga(r.id), this.contiProgetti(r.id));
  },

  /** togliProgetto {id}: solo un progetto senza rapportini (uno creato per sbaglio). */
  togliProgetto(id) {
    const r = this.progettoRiga(id);
    if (!r) throw new Rifiuto('Progetto non trovato');
    if (this.db.riga('SELECT id FROM rapportini WHERE id_progetto = ? LIMIT 1', r.id)) {
      throw new Rifiuto('Il progetto ha dei rapportini: non si toglie, si chiude');
    }
    this.db.esegui('DELETE FROM progetti WHERE id = ?', r.id);
    this.annota('progetti', r.id, { codice: r.codice, commessa_id: r.commessa_id, descrizione: r.descrizione }, null, 'progetto tolto');
    return { ok: true };
  },

  /**
   * Il progetto di un rapportino (salvaRapportino): quello scelto (idProgetto) o uno nuovo nato sul telefono
   * (progettoNuovo {idLocale, codice, codiceProposto, intestatoA, descrizione}). Prima i controlli: torna
   * {riga, nuovo} senza scrivere niente; il nuovo lo crea creaProgettoPerRapportino.
   */
  progettoPerRapportino(r, commessa) {
    const idProgetto = r.idProgetto === undefined || r.idProgetto === null || r.idProgetto === '' ? null : Number(r.idProgetto);
    const nuovo = r.progettoNuovo && typeof r.progettoNuovo === 'object' ? r.progettoNuovo : null;
    if (idProgetto) {
      const riga = this.progettoRiga(idProgetto);
      if (!riga) {
        // Un progetto nato sul telefono e gia' arrivato (il suo idLocale), mentre il rapportino era in coda.
        if (nuovo && testo(nuovo.idLocale)) {
          const gia = this.db.riga('SELECT id FROM progetti WHERE id_locale = ?', testo(nuovo.idLocale));
          if (gia) return { riga: this.progettoRiga(gia.id), nuovo: null };
        }
        throw new Rifiuto('Progetto non trovato: scegline un altro');
      }
      if (commessa && testo(riga.commessa_id).toUpperCase() !== commessa.id.toUpperCase()) {
        throw new Rifiuto('Il progetto ' + riga.codice + ' è della commessa ' + riga.commessa_id + ', non della ' + commessa.id);
      }
      return { riga, nuovo: null };
    }
    if (nuovo && (testo(nuovo.descrizione) || testo(nuovo.codice))) {
      if (testo(nuovo.idLocale)) {
        const gia = this.db.riga('SELECT id FROM progetti WHERE id_locale = ?', testo(nuovo.idLocale));
        if (gia) return { riga: this.progettoRiga(gia.id), nuovo: null };
      }
      if (this.livello('progetti') < 2) throw senzaPermesso('creare progetti: scegli un progetto dall\'elenco');
      return { riga: null, nuovo };
    }
    return { riga: null, nuovo: null };
  },

  /** Crea il progetto nuovo di un rapportino, sotto la sua commessa (che ormai c'e'). */
  creaProgettoPerRapportino(nuovo, commessa) {
    if (!commessa) throw new Rifiuto('Per un progetto nuovo serve la commessa');
    const p = this.creaProgetto({
      idCommessa: commessa.id, codice: testo(nuovo.codice), codiceProposto: nuovo.codiceProposto === true || nuovo.codiceProposto === 'true',
      intestatoA: testo(nuovo.intestatoA), descrizione: testo(nuovo.descrizione) || testo(nuovo.codice), idLocale: testo(nuovo.idLocale),
    });
    return this.progettoRiga(p.id);
  },
};

Object.defineProperties(module.exports, {
  progettoDaRiga: { value: progettoDaRiga },
});
