/*
 * I km dallo studio (12/11/2026, Manuel: i km del rapportino "suggeriti in automatico"; Andrea ha scelto: dal luogo del
 * lavoro, andata e ritorno, con la mappa di Google attraverso lo script del foglio). docs/gestionale/km.md.
 *
 * Il luogo del lavoro: il Dove del progetto (di solito la sede di chi e' "Intestato a"), l'indirizzo della commessa (o della
 * sua sede), l'indirizzo del cliente. La strada in auto dallo studio la calcola lo script (postinoDistanza, il servizio Maps
 * di Apps Script: gratis, senza chiavi), UNA volta per indirizzo: si ricorda nella tabella distanze. Le app ricevono con le
 * anagrafiche kmStudio (andata e ritorno, in km interi) su progetti, commesse e clienti; la scelta di cosa proporre nel
 * rapportino (la memoria prima, poi questi km) e' in pc/ui/regole-km.js e rapportino/Km.kt.
 *
 * Il giro (giroKm) gira ogni 2 minuti: guarda quali indirizzi non hanno ancora la loro strada e la chiede, al massimo
 * MASSIMO_PER_GIRO alla volta. Se il postino non c'e' o non risponde, si riprova al giro dopo: niente si blocca.
 */
'use strict';

const { testo, adesso } = require('../utili');

const MASSIMO_PER_GIRO = 10;
// Dopo un errore del postino il giro si ferma un po': ogni chiamata lascia una riga in Accessi sul foglio, e uno script
// che non ha ancora postinoDistanza (non incollato) sbaglierebbe 720 volte al giorno.
const PAUSA_DOPO_ERRORE = 15 * 60000;
const PAUSA_AZIONE_SCONOSCIUTA = 60 * 60000;

/** L'indirizzo come chiave: minuscolo, spazi singoli, virgole con uno spazio dopo. "Via Roma 1,Bassano" = "via roma 1, bassano". */
function normalizza(s) {
  return testo(s).toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/^[,\s]+|[,\s]+$/g, '').trim();
}

/**
 * "Via Arrigo Boito 2, 36031 Dueville (VI)": indirizzo, CAP, comune e provincia, quelli che ci sono. Se l'indirizzo ha gia'
 * dentro il CAP o il comune (scritti tutti in una riga) non si ripetono.
 */
function indirizzoIntero(indirizzo, cap, citta, provincia) {
  const via = testo(indirizzo);
  const dentro = x => !!testo(x) && via.toLowerCase().indexOf(testo(x).toLowerCase()) >= 0;
  if (dentro(cap) || dentro(citta)) return via;
  const luogo = [testo(cap), testo(citta)].filter(Boolean).join(' ') + (testo(provincia) ? ' (' + testo(provincia).toUpperCase() + ')' : '');
  return [via, luogo.trim()].filter(Boolean).join(', ');
}

/** Andata e ritorno, in km interi, dai metri della sola andata. */
const kmAndataRitorno = metri => (metri === null || metri === undefined ? null : Math.round((2 * Number(metri)) / 1000));

module.exports = {
  /** L'indirizzo dello studio (Dati dello studio), da dove si parte. '' se non c'e'. */
  indirizzoStudio(imp) {
    const x = imp || this.leggiImpostazioni();
    return indirizzoIntero(x.INDIRIZZO, x.STUDIO_CAP, x.STUDIO_COMUNE, x.STUDIO_PROVINCIA);
  },

  /** Le strade gia' calcolate dallo studio di oggi: { indirizzo normalizzato: metri | null }. */
  strade(daStudio) {
    const da = normalizza(daStudio === undefined ? this.indirizzoStudio() : daStudio);
    const out = new Map();
    if (!da) return out;
    for (const r of this.db.righe('SELECT a, metri FROM distanze WHERE da = ?', da)) out.set(r.a, r.metri === null ? null : Number(r.metri));
    return out;
  },

  /** I luoghi di lavoro che servono: progetti aperti, commesse e clienti non archiviati. Indirizzi interi, senza doppioni. */
  luoghiDiLavoro() {
    const out = new Map();
    const metti = s => { const k = normalizza(s); if (k && !out.has(k)) out.set(k, testo(s)); };
    this.db.righe("SELECT dove FROM progetti WHERE stato = 'APERTO' AND TRIM(dove) <> ''").forEach(r => metti(r.dove));
    this.db.righe("SELECT c.indirizzo, s.indirizzo si, s.cap, s.citta, s.provincia FROM commesse c LEFT JOIN sedi s ON s.id = c.sede_id WHERE c.archiviata = 0 AND c.modello = 0")
      .forEach(r => metti(testo(r.indirizzo) || indirizzoIntero(r.si, r.cap, r.citta, r.provincia)));
    this.db.righe('SELECT indirizzo, cap, citta, provincia FROM soggetti WHERE cliente = 1 AND archiviato = 0')
      .forEach(r => metti(indirizzoIntero(r.indirizzo, r.cap, r.citta, r.provincia)));
    return out;
  },

  /** I luoghi che non hanno ancora la loro strada dallo studio di oggi (indirizzo intero, come va chiesto alla mappa). */
  luoghiDaCalcolare() {
    const studio = this.indirizzoStudio();
    if (!normalizza(studio)) return [];
    const fatte = this.strade(studio);
    return Array.from(this.luoghiDiLavoro()).filter(([k]) => !fatte.has(k) && k !== normalizza(studio)).map(([, v]) => v);
  },

  /**
   * Un giro: chiede allo script la strada degli indirizzi che mancano (al massimo MASSIMO_PER_GIRO). Torna
   * { fatte, mancano, motivo? }. Senza postino, senza indirizzo dello studio o con il postino che non risponde si ferma e
   * riprova al giro dopo (dopo un errore del postino: fra 15 minuti, fra un'ora se lo script non conosce postinoDistanza;
   * opzioni.subito salta la pausa); un indirizzo che la mappa non trova si ricorda come non trovato (si riprova se lo si cambia).
   */
  async giroKm(opzioni) {
    if (this.giroKmInCorso) return { fatte: 0, mancano: 0, motivo: 'giro già in corso' };
    const o = opzioni || {};
    if (!o.subito && this.kmFermoFino && Date.now() < this.kmFermoFino) return { fatte: 0, mancano: 0, motivo: 'in pausa' };
    const studio = this.indirizzoStudio();
    if (!normalizza(studio)) return { fatte: 0, mancano: 0, motivo: 'manca l\'indirizzo dello studio' };
    if (!this.postino || !this.postino.configurato()) return { fatte: 0, mancano: 0, motivo: 'postino non collegato' };
    const lista = this.luoghiDaCalcolare();
    this.giroKmInCorso = true;
    let fatte = 0;
    try {
      for (const a of lista.slice(0, o.massimo || MASSIMO_PER_GIRO)) {
        let r;
        try {
          r = await this.postino.chiama('postinoDistanza', { da: studio, a });
        } catch (err) {
          // Il postino non risponde, ha finito le richieste del giorno o non ha ancora postinoDistanza: si riprova dopo.
          this.ultimoErroreKm = err.message;
          this.kmFermoFino = Date.now() + (/sconosciut/i.test(err.message) ? PAUSA_AZIONE_SCONOSCIUTA : PAUSA_DOPO_ERRORE);
          return { fatte, mancano: lista.length - fatte, motivo: err.message };
        }
        // Mentre si aspettava la risposta l'indirizzo dello studio puo' essere cambiato: la strada di prima non vale.
        if (normalizza(this.indirizzoStudio()) !== normalizza(studio)) return { fatte, mancano: 0, motivo: 'indirizzo dello studio cambiato' };
        const metri = r && r.trovata && Number(r.metri) > 0 ? Math.round(Number(r.metri)) : null;
        this.db.esegui('INSERT OR REPLACE INTO distanze (da, a, metri, trovato_a, calcolato) VALUES (?, ?, ?, ?, ?)',
          normalizza(studio), normalizza(a), metri, testo(r && r.a).slice(0, 300), adesso());
        fatte++;
      }
      this.ultimoErroreKm = '';
      this.kmFermoFino = 0;
      return { fatte, mancano: Math.max(0, lista.length - fatte) };
    } finally {
      this.giroKmInCorso = false;
    }
  },

  /** I km dallo studio (andata e ritorno) per un indirizzo, o null se non si sanno (ancora). */
  kmStudioDi(indirizzo, strade) {
    const k = normalizza(indirizzo);
    if (!k) return null;
    const s = strade || this.strade();
    return s.has(k) ? kmAndataRitorno(s.get(k)) : null;
  },

  /**
   * Le anagrafiche col loro kmStudio (andata e ritorno, km interi, o null): i progetti dal Dove, le commesse dal loro
   * indirizzo (o da quello della sede), i clienti dalla sede. Si chiama dentro rispostaAnagrafiche. opzioni.clienti false:
   * i clienti restano come sono (l'esterno ne vede solo il nome).
   */
  conKmStudio(r, opzioni) {
    const strade = this.strade();
    const sedi = new Map((r.sedi || []).map(s => [s.id, s]));
    (r.progetti || []).forEach(p => { p.kmStudio = this.kmStudioDi(p.dove, strade); });
    (r.commesse || []).forEach(m => {
      const s = m.sedeId !== null && m.sedeId !== undefined ? sedi.get(m.sedeId) : null;
      m.kmStudio = this.kmStudioDi(testo(m.indirizzo) || (s ? indirizzoIntero(s.indirizzo, s.cap, s.citta, s.provincia) : ''), strade);
    });
    if (!opzioni || opzioni.clienti !== false) {
      (r.clienti || []).forEach(c => { c.kmStudio = this.kmStudioDi(indirizzoIntero(c.indirizzo, c.cap, c.citta, c.provincia), strade); });
    }
    return r;
  },

  /** Il Dove di un altro progetto con lo stesso "Intestato a" (lo stesso posto), o ''. Il piu' recente che ce l'ha. */
  doveDiIntestato(intestatoA, tranneId) {
    const nome = testo(intestatoA).toLowerCase().replace(/\s+/g, ' ');
    if (!nome) return '';
    const r = this.db.riga("SELECT dove FROM progetti WHERE LOWER(TRIM(intestato_a)) = ? AND TRIM(dove) <> '' AND id <> ? ORDER BY creato DESC, id DESC LIMIT 1",
      nome, tranneId === undefined || tranneId === null ? -1 : Number(tranneId));
    return r ? testo(r.dove) : '';
  },
};

Object.defineProperties(module.exports, {
  normalizzaLuogo: { value: normalizza },
  indirizzoIntero: { value: indirizzoIntero },
  kmAndataRitorno: { value: kmAndataRitorno },
});
