/*
 * Wisper Ufficio: le regole di attività e calendario (fase 2), senza niente di grafico.
 *
 * I gruppi che rispondono a "cosa devo fare oggi" (Scadute, Oggi, Prossimi giorni,
 * Senza data), i segmenti Mie / Squadra / Non assegnate, il dettaglio di una riga,
 * i giorni della settimana e del mese, i blocchi orari del calendario con le
 * sovrapposizioni, le ricorrenze a parole, la pianificazione persone × giorni e i
 * promemoria da dare. Si provano con Node (prove/attivita.test.js).
 */
(function (radice) {
  'use strict';

  const TIPI = [['attivita', 'Attività'], ['appuntamento', 'Appuntamento'], ['sopralluogo', 'Sopralluogo']];
  const PRIORITA = [['alta', 'Alta'], ['normale', 'Normale'], ['bassa', 'Bassa']];
  const PROMEMORIA = [['', 'Nessuno'], ['0', 'All\'ora'], ['15', '15 minuti prima'], ['60', 'Un\'ora prima'], ['1440', 'Il giorno prima']];
  const RIPETI = [['', 'Mai'], ['giorni', 'Ogni giorno'], ['settimane', 'Ogni settimana'], ['mesi', 'Ogni mese'], ['anni', 'Ogni anno'], ['personalizzato', 'Personalizzato']];
  const PER_RICORRENZA = [['questa', 'Solo questa'], ['future', 'Da questa in poi'], ['tutte', 'Tutte']];
  // Come il telefono (rapportino/Attivita.kt, Agenda.gruppi): "Prossimi giorni" è la settimana che viene, oltre "Più avanti".
  const GRUPPI = [['scadute', 'Scadute'], ['oggi', 'Oggi'], ['prossimi', 'Prossimi giorni'], ['piuAvanti', 'Più avanti'], ['senzaData', 'Senza data']];
  const GIORNI_PROSSIMI = 7;

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const GIORNI_BREVI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const due = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  const daIso = s => new Date(String(s).slice(0, 10) + 'T12:00:00');
  function oggiIso() { return iso(new Date()); }
  function piuGiorni(s, n) { const d = daIso(s); d.setDate(d.getDate() + n); return iso(d); }
  function giorniFra(a, b) { return Math.round((daIso(b) - daIso(a)) / 86400000); }

  const chiuse = a => a.stato === 'fatta' || a.stato === 'annullata';
  const conOrario = a => a.tipo === 'appuntamento' || a.tipo === 'sopralluogo' || (!!a.inizio && !a.scadenza);

  /** Il giorno di un'attività: la scadenza, o il giorno d'inizio per appuntamenti e sopralluoghi. '' = senza data. */
  function giornoDi(a) {
    if (!a) return '';
    if (conOrario(a) && a.inizio) return String(a.inizio).slice(0, 10);
    return String(a.scadenza || a.occorrenza || (a.inizio || '')).slice(0, 10);
  }

  /** "08:30" da un istante "2026-10-23T08:30:00". */
  function ora(istante) {
    const m = String(istante || '').match(/T(\d{2}):(\d{2})/);
    return m ? String(Number(m[1])) + ':' + m[2] : '';
  }
  /** Le ore in decimale (8:30 = 8,5) di un istante, per il calendario. */
  function oreDecimali(istante) {
    const m = String(istante || '').match(/T(\d{2}):(\d{2})/);
    return m ? Number(m[1]) + Number(m[2]) / 60 : null;
  }

  /** Il gruppo: scadute (prima di oggi, non fatte), oggi, prossimi giorni (i 7 dopo oggi), più avanti, senza data. */
  function gruppoDi(a, oggi) {
    const g = giornoDi(a);
    const o = oggi || oggiIso();
    if (!g) return 'senzaData';
    if (g < o) return chiuse(a) ? 'oggi' : 'scadute';
    if (g === o) return 'oggi';
    return g <= piuGiorni(o, GIORNI_PROSSIMI) ? 'prossimi' : 'piuAvanti';
  }

  /**
   * Quelle di un segmento. Mie: assegnate a me. Squadra: di tutti quelli che
   * posso vedere. Non assegnate: senza persona. Le annullate mai; le fatte solo se
   * fatte oggi (così si vede la spunta e si può annullare).
   */
  function filtraAttivita(lista, segmento, idIo, oggi) {
    const o = oggi || oggiIso();
    return (lista || []).filter(a => {
      if (a.stato === 'annullata') return false;
      if (a.stato === 'fatta' && String(a.fattaIl || '').slice(0, 10) !== o) return false;
      const chi = a.assegnataA === undefined || a.assegnataA === null || a.assegnataA === '' ? null : String(a.assegnataA);
      if (segmento === 'mie') return chi === String(idIo);
      if (segmento === 'libere') return chi === null;
      return true;
    });
  }

  const PESO_PRIORITA = { alta: 0, normale: 1, bassa: 2 };

  /** In ordine dentro un gruppo: giorno, ora, priorità alta prima, titolo. */
  function ordina(lista) {
    // Le senza data in fondo.
    const g = a => giornoDi(a) || '9999';
    return (lista || []).slice().sort((a, b) =>
      g(a).localeCompare(g(b)) ||
      String(conOrario(a) ? a.inizio || '' : '99').localeCompare(String(conOrario(b) ? b.inizio || '' : '99')) ||
      (PESO_PRIORITA[a.priorita] ?? 1) - (PESO_PRIORITA[b.priorita] ?? 1) ||
      String(a.titolo || '').localeCompare(String(b.titolo || ''), 'it'));
  }

  /**
   * I gruppi da mostrare, nell'ordine Scadute, Oggi, Prossimi giorni, Più avanti, Senza data; quelli vuoti non
   * ci sono. Di un'attività che si ripete (stesso idRicorrenza) delle volte future si vede solo la prossima: la
   * riunione di ogni lunedì non riempie l'elenco con 13 lunedì. Quelle di oggi e le scadute si vedono tutte.
   */
  function raggruppa(lista, oggi) {
    const o = oggi || oggiIso();
    const per = {};
    const viste = new Set();
    ordina(lista).forEach(a => {
      const g = gruppoDi(a, o);
      if (a.idRicorrenza && giornoDi(a) > o) {
        if (viste.has(String(a.idRicorrenza))) return;
        viste.add(String(a.idRicorrenza));
      }
      (per[g] = per[g] || []).push(a);
    });
    return GRUPPI.filter(g => per[g[0]]).map(g => ({ chiave: g[0], nome: g[1], voci: ordina(per[g[0]]) }));
  }

  /** "oggi", "ieri", "domani", "lunedì 27" (entro la settimana), "27 ottobre". */
  function quandoBreve(s, oggi) {
    if (!s) return '';
    const o = oggi || oggiIso();
    const n = giorniFra(o, s);
    const d = daIso(s);
    if (n === 0) return 'oggi';
    if (n === -1) return 'ieri';
    if (n === 1) return 'domani';
    if (n > 1 && n < 7) return GIORNI[d.getDay()] + ' ' + d.getDate();
    return d.getDate() + ' ' + MESI[d.getMonth()] + (d.getFullYear() !== daIso(o).getFullYear() ? ' ' + d.getFullYear() : '');
  }

  /** La riga sotto il titolo: "26ST045 · ieri", "26ST046 · 14:30", "Studio · lunedì 27". */
  function dettaglio(a, oggi) {
    const dove = a.idCommessa || (a.cliente ? a.cliente : 'Studio');
    const g = giornoDi(a);
    let quando = '';
    if (g) {
      const gr = gruppoDi(a, oggi);
      if (conOrario(a) && a.inizio && !a.tuttoIlGiorno) quando = (gr === 'oggi' ? '' : quandoBreve(g, oggi) + ' ') + ora(a.inizio);
      // Nel gruppo Oggi la parola "oggi" non serve.
      else quando = gr === 'oggi' && g === (oggi || oggiIso()) ? '' : quandoBreve(g, oggi);
    }
    return [dove, quando.trim()].filter(Boolean).join(' · ');
  }

  // ------------------------------------------------------------------ calendario

  /** I sette giorni (da lunedì) della settimana che contiene il giorno. */
  function settimanaDi(s) {
    const d = daIso(s || oggiIso());
    const lunedi = piuGiorni(iso(d), -((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (x, i) => piuGiorni(lunedi, i));
  }

  /** Il numero della settimana dell'anno (ISO 8601): "Ottobre, settimana 43". */
  function numeroSettimana(s) {
    const d = daIso(s);
    const g = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - g + 3);
    const primoGiovedi = new Date(d.getFullYear(), 0, 4, 12);
    return 1 + Math.round(((d - primoGiovedi) / 86400000 - 3 + ((primoGiovedi.getDay() + 6) % 7)) / 7);
  }

  /** Le settimane del mese (da lunedì a domenica), con i giorni degli altri mesi per riempire. */
  function grigliaMese(mese) {
    const primo = String(mese).slice(0, 7) + '-01';
    const inizio = settimanaDi(primo)[0];
    const settimane = [];
    let g = inizio;
    do {
      settimane.push(Array.from({ length: 7 }, (x, i) => piuGiorni(g, i)));
      g = piuGiorni(g, 7);
    } while (g.slice(0, 7) === primo.slice(0, 7));
    return settimane;
  }

  function nomeGiorno(s, breve) {
    const d = daIso(s);
    return breve ? GIORNI_BREVI[d.getDay()] + ' ' + d.getDate() : GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
  }
  function nomeMese(mese) {
    const d = daIso(String(mese).slice(0, 7) + '-01');
    const n = MESI[d.getMonth()];
    return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + d.getFullYear();
  }

  /**
   * I blocchi di un giorno per la griglia: gli appuntamenti con l'orario, posti in
   * colonne quando si sovrappongono. { a, da, a2, colonna, colonne } con da/a2 in ore.
   * Le attività con la sola scadenza vanno in cima al giorno (tuttoIlGiorno).
   */
  function blocchiDelGiorno(lista, giorno) {
    const delGiorno = (lista || []).filter(a => a.stato !== 'annullata' && giornoDi(a) === giorno);
    const conOra = delGiorno.filter(a => conOrario(a) && a.inizio && !a.tuttoIlGiorno && oreDecimali(a.inizio) !== null)
      .map(a => {
        const da = oreDecimali(a.inizio);
        let fine = a.fine && String(a.fine).slice(0, 10) === giorno ? oreDecimali(a.fine) : null;
        if (fine === null || fine <= da) fine = Math.min(24, da + 1);
        return { a, da, a2: fine, colonna: 0, colonne: 1 };
      })
      .sort((x, y) => x.da - y.da || y.a2 - x.a2);
    // Colonne: ogni blocco va nella prima colonna libera; i gruppi che si toccano condividono il numero di colonne.
    let gruppo = [];
    let fineGruppo = -1;
    const chiudi = () => { const n = Math.max(1, ...gruppo.map(b => b.colonna + 1)); gruppo.forEach(b => { b.colonne = n; }); gruppo = []; };
    conOra.forEach(b => {
      if (b.da >= fineGruppo) { chiudi(); fineGruppo = -1; }
      const occupate = gruppo.filter(x => x.a2 > b.da).map(x => x.colonna);
      let c = 0;
      while (occupate.indexOf(c) >= 0) c++;
      b.colonna = c;
      gruppo.push(b);
      fineGruppo = Math.max(fineGruppo, b.a2);
    });
    chiudi();
    const tuttoIlGiorno = delGiorno.filter(a => conOra.every(b => b.a !== a));
    return { conOra, tuttoIlGiorno };
  }

  /**
   * Gli appuntamenti della stessa persona che si sovrappongono a questo (fase2.md §5:
   * "chiede conferma"). Solo con inizio e fine; le annullate e le fatte no.
   */
  function sovrapposti(nuovo, lista) {
    if (!nuovo || !nuovo.inizio || nuovo.assegnataA === undefined || nuovo.assegnataA === null || nuovo.assegnataA === '') return [];
    // Senza fine un appuntamento dura un'ora.
    const fine = x => {
      if (x.fine && String(x.fine) > String(x.inizio)) return String(x.fine).slice(0, 19);
      const d = new Date(String(x.inizio).slice(0, 19));
      d.setHours(d.getHours() + 1);
      return iso(d) + 'T' + due(d.getHours()) + ':' + due(d.getMinutes()) + ':00';
    };
    const da = String(nuovo.inizio).slice(0, 19);
    const a = String(fine(nuovo));
    return (lista || []).filter(x => String(x.id) !== String(nuovo.id) && x.inizio && !chiuse(x) && !x.tuttoIlGiorno &&
      String(x.assegnataA) === String(nuovo.assegnataA) && String(x.inizio).slice(0, 19) < a && fine(x) > da);
  }

  // ------------------------------------------------------------------ ricorrenze

  /**
   * I giorni della settimana di una ricorrenza come li scrive il server (§13.6: 1 lunedì … 7 domenica,
   * in un elenco o separati da virgola), nei numeri di JavaScript (0 domenica … 6 sabato).
   */
  function giorniDellaRicorrenza(r) {
    const g = Array.isArray(r && r.giorniSettimana) ? r.giorniSettimana : String((r && r.giorniSettimana) || '').split(',');
    return g.filter(x => x !== '' && x !== null && x !== undefined).map(Number).filter(n => n >= 0 && n <= 7).map(n => n % 7);
  }
  /** Il giorno della settimana alla maniera del server: 1 lunedì … 7 domenica. */
  const giornoIso = s => { const d = daIso(s).getDay(); return d === 0 ? 7 : d; };

  /** "ogni settimana il lunedì", "ogni 2 mesi", "ogni giorno fino al 31/12". */
  function ricorrenzaAParole(r) {
    if (!r || !r.regola) return '';
    const ogni = Math.max(1, Number(r.ogni) || 1);
    const nomi = { giorni: ['giorno', 'giorni'], settimane: ['settimana', 'settimane'], mesi: ['mese', 'mesi'], anni: ['anno', 'anni'] }[r.regola];
    if (!nomi) return '';
    let s = ogni === 1 ? (r.regola === 'settimane' ? 'ogni settimana' : 'ogni ' + nomi[0]) : 'ogni ' + ogni + ' ' + nomi[1];
    const giorni = giorniDellaRicorrenza(r);
    // Prima i giorni feriali, la domenica in fondo.
    giorni.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (r.regola === 'settimane' && giorni.length) s += ' ' + (giorni.length === 1 ? 'il ' : '') + giorni.map(g => GIORNI[g]).join(', ');
    if (r.fine) s += ' fino al ' + String(r.fine).slice(8, 10) + '/' + String(r.fine).slice(5, 7) + '/' + String(r.fine).slice(0, 4);
    return s;
  }

  /** Le prossime n date di una ricorrenza da un giorno (compreso), per l'anteprima nel modulo. */
  function prossimeDate(r, da, n) {
    const out = [];
    if (!r || !r.regola) return out;
    const ogni = Math.max(1, Number(r.ogni) || 1);
    const giorni = giorniDellaRicorrenza(r);
    let g = String(da).slice(0, 10);
    let passi = 0;
    while (out.length < (n || 3) && passi < 800) {
      passi++;
      if (r.fine && g > r.fine) break;
      if (r.regola === 'settimane' && giorni.length) {
        const settimaneDa = Math.floor(giorniFra(settimanaDi(da)[0], g) / 7);
        if (settimaneDa % ogni === 0 && giorni.indexOf(daIso(g).getDay()) >= 0) out.push(g);
        g = piuGiorni(g, 1);
        continue;
      }
      out.push(g);
      const d = daIso(g);
      if (r.regola === 'giorni') d.setDate(d.getDate() + ogni);
      else if (r.regola === 'settimane') d.setDate(d.getDate() + 7 * ogni);
      else if (r.regola === 'mesi') d.setMonth(d.getMonth() + ogni);
      else d.setFullYear(d.getFullYear() + ogni);
      g = iso(d);
    }
    return out;
  }

  /** La ricorrenza dalla scelta del modulo ("Ogni settimana") e dal giorno: { regola, ogni, giorniSettimana, fine }. */
  function ricorrenzaDa(scelta, giorno, personalizzata) {
    if (!scelta) return null;
    if (scelta === 'personalizzato') return Object.assign({ regola: 'settimane', ogni: 1, giorniSettimana: [], fine: '' }, personalizzata || {});
    return { regola: scelta, ogni: 1, giorniSettimana: scelta === 'settimane' && giorno ? [giornoIso(giorno)] : [], fine: '' };
  }

  // ------------------------------------------------------------------ pianificazione e promemoria

  /**
   * La pianificazione della settimana: per ogni persona i giorni con le sue
   * attività; a parte quelle non assegnate (da trascinare su una persona e un giorno).
   */
  function pianificazione(lista, giorni, utenti) {
    const vive = (lista || []).filter(a => !chiuse(a));
    const righe = (utenti || []).map(u => ({
      utente: u,
      giorni: giorni.map(g => ordina(vive.filter(a => String(a.assegnataA) === String(u.id) && giornoDi(a) === g))),
    }));
    // Tutte quelle da assegnare; di una ricorrenza solo la prima volta.
    const viste = new Set();
    const libere = ordina(vive.filter(a => a.assegnataA === null || a.assegnataA === undefined || a.assegnataA === '')).filter(a => {
      if (!a.idRicorrenza) return true;
      if (viste.has(String(a.idRicorrenza))) return false;
      viste.add(String(a.idRicorrenza));
      return true;
    });
    return { righe, libere };
  }

  /** Quando suona il promemoria: l'inizio (o la scadenza alle 9:00) meno i minuti. Null senza promemoria. */
  function momentoPromemoria(a) {
    if (a.promemoriaMinuti === null || a.promemoriaMinuti === undefined || a.promemoriaMinuti === '') return null;
    const base = conOrario(a) && a.inizio && !a.tuttoIlGiorno ? String(a.inizio).slice(0, 16) : (giornoDi(a) ? giornoDi(a) + 'T09:00' : '');
    if (!base) return null;
    const d = new Date(base + ':00');
    if (isNaN(d.getTime())) return null;
    return new Date(d.getTime() - Number(a.promemoriaMinuti) * 60000);
  }

  /**
   * I promemoria da dare adesso: le mie attività non chiuse, il cui momento è
   * passato da meno di "entro" minuti (di base 12 ore: aprendo il programma la mattina
   * si vedono quelli della notte) e che non ho già visto.
   */
  function promemoriaDaDare(lista, adesso, idIo, giaDati, entroMinuti) {
    const ora0 = adesso instanceof Date ? adesso : new Date(adesso);
    const entro = (entroMinuti || 720) * 60000;
    const visti = giaDati || {};
    return (lista || []).filter(a => {
      if (chiuse(a) || String(a.assegnataA) !== String(idIo)) return false;
      const m = momentoPromemoria(a);
      if (!m) return false;
      const chiave = String(a.id) + '@' + m.toISOString();
      if (visti[chiave]) return false;
      return m <= ora0 && ora0 - m <= entro;
    }).map(a => ({ a, chiave: String(a.id) + '@' + momentoPromemoria(a).toISOString() }));
  }

  /** Le iniziali di una persona: "Marco Rossato" -> "MR". */
  function iniziali(nome) {
    const p = String(nome || '?').trim().split(/\s+/).filter(Boolean);
    return (p.length > 1 ? p[0][0] + p[1][0] : (p[0] || '?').slice(0, 2)).toUpperCase();
  }

  // ------------------------------------------------------------------ dalle risposte del server

  const DA_COLONNE = { assegnata_a: 'assegnataA', creata_da: 'creataDa', cliente_id: 'idCliente', commessa_id: 'idCommessa', clienteId: 'idCliente',
    commessaId: 'idCommessa', prestazione_id: 'idPrestazione', prestazioneId: 'idPrestazione', ricorrenza_id: 'idRicorrenza', ricorrenzaId: 'idRicorrenza',
    tutto_il_giorno: 'tuttoIlGiorno', promemoria_minuti: 'promemoriaMinuti', fatta_il: 'fattaIl', attivita_id: 'idAttivita' };
  function camel(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
    const x = {};
    Object.keys(o).forEach(k => { x[DA_COLONNE[k] || k.replace(/_([a-z])/g, (m, c) => c.toUpperCase())] = o[k]; });
    return x;
  }

  /** Un'attività come la usano le pagine: chiavi alla JavaScript, checklist e allegati sempre elenchi. */
  function normalizzaAttivita(a0) {
    const a = camel(a0 || {});
    a.tipo = a.tipo || 'attivita';
    a.stato = a.stato || 'da_fare';
    a.priorita = a.priorita || 'normale';
    a.tuttoIlGiorno = a.tuttoIlGiorno === true || a.tuttoIlGiorno === 1;
    a.checklist = (a.checklist || []).map(camel).map(c => Object.assign({}, c, { fatta: c.fatta === true || c.fatta === 1 }));
    a.allegati = (a.allegati || a.file || []).map(camel);
    if (a.ricorrenza) a.ricorrenza = camel(a.ricorrenza);
    if (a.assegnataA === '' || a.assegnataA === undefined) a.assegnataA = null;
    return a;
  }

  const RegoleAttivita = {
    TIPI, PRIORITA, PROMEMORIA, RIPETI, PER_RICORRENZA, GRUPPI, GIORNI_PROSSIMI, GIORNI, GIORNI_BREVI, MESI,
    oggiIso, piuGiorni, giorniFra, giornoDi, ora, oreDecimali, gruppoDi, filtraAttivita, ordina, raggruppa, quandoBreve, dettaglio,
    settimanaDi, numeroSettimana, grigliaMese, nomeGiorno, nomeMese, blocchiDelGiorno, sovrapposti,
    ricorrenzaAParole, prossimeDate, ricorrenzaDa, giorniDellaRicorrenza, giornoIso, pianificazione, momentoPromemoria, promemoriaDaDare, iniziali, normalizzaAttivita, conOrario,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RegoleAttivita;
  else radice.WisperRegoleAttivita = RegoleAttivita;
})(typeof window !== 'undefined' ? window : globalThis);
