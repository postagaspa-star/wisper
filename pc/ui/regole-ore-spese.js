/*
 * Wisper Ufficio: le regole di ore, spese e trasferte (fase 3), senza niente di grafico.
 *
 * I conti condivisi col server (architettura.md §14.15, casi in
 * server/prove/casi-ore-spese.json): le ore da inizio, fine e pausa (anche a
 * cavallo della mezzanotte), il rimborso di una trasferta, i rimborsi dovuti a
 * ogni persona. Il server resta la garanzia: qui servono per l'anteprima mentre
 * si scrive, e devono dare gli stessi numeri e le stesse frasi.
 *
 * Poi le regole delle pagine: le parole e i colori degli stati, "a chi va", le
 * categorie, il timesheet della settimana (righe = commesse, colonne = giorni) e
 * la regola per scrivere una cella senza perdere le righe con inizio e fine,
 * il timer, il costo della commessa con le ore registrate, le spese e le trasferte.
 * Si provano con Node (prove/ore-spese.test.js).
 */
(function (radice) {
  'use strict';

  const C = radice.WisperConti || (typeof require === 'function' ? require('./conti.js') : null);

  const due = n => String(n).padStart(2, '0');
  const testo = v => (v === null || v === undefined ? '' : String(v).trim());
  const numero = v => (v === null || v === undefined || v === '' ? 0 : (typeof v === 'number' ? (isNaN(v) ? 0 : v) : C.num(v)));
  const centesimi = n => Math.round(n * 100) / 100;

  /** Un errore con la frase pronta da mostrare (la stessa del server). */
  function rifiuto(frase) {
    const e = new Error(frase);
    e.rifiuto = true;
    return e;
  }

  // ------------------------------------------------------------------ ore da inizio, fine e pausa (§14.15)

  /** "8:30", "08:30", "08.30" o "08:30:00" -> minuti dalla mezzanotte (510), oppure null. */
  function minutiDa(ora) {
    const m = testo(ora).match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    return h > 23 || mi > 59 ? null : h * 60 + mi;
  }

  /** 510 -> "08:30". */
  const oraDaMinuti = minuti => due(Math.floor(minuti / 60)) + ':' + due(minuti % 60);

  /**
   * Le ore di una riga da inizio, fine e pausa (in minuti), come il server.
   * Una fine prima dell'inizio è del giorno dopo (22:00-06:00 = 8 ore); fine uguale
   * all'inizio è un errore; la pausa deve essere più corta del lavoro. Le ore a due
   * decimali (8:00-12:20 = 4,33). Gli errori hanno la frase del server.
   */
  function oreDaOrari(inizio, fine, pausaMinuti) {
    const a = minutiDa(inizio);
    if (a === null) throw rifiuto('Inizio: scrivi l\'ora come 8:30');
    const b = minutiDa(fine);
    if (b === null) throw rifiuto('Fine: scrivi l\'ora come 17:30');
    if (a === b) throw rifiuto('Fine: deve essere diversa dall\'inizio');
    const pausa = pausaMinuti === undefined || pausaMinuti === null || pausaMinuti === '' ? 0 : Number(pausaMinuti);
    if (!(pausa >= 0) || Math.round(pausa) !== pausa) throw rifiuto('Pausa: scrivi i minuti, da zero in su');
    const giornoDopo = b < a;
    const durata = (giornoDopo ? b + 1440 : b) - a;
    if (pausa >= durata) throw rifiuto('Pausa: è più lunga del lavoro');
    const minuti = durata - pausa;
    return { inizio: oraDaMinuti(a), fine: oraDaMinuti(b), pausaMinuti: pausa, minuti, ore: Math.round(minuti / 60 * 100) / 100, giornoDopo };
  }

  /** Come oreDaOrari, ma senza eccezioni: { ore... } oppure { errore }. Per l'anteprima mentre si scrive. */
  function provaOreDaOrari(inizio, fine, pausaMinuti) {
    try { return oreDaOrari(inizio, fine, pausaMinuti); } catch (e) { return { errore: e.message }; }
  }

  // ------------------------------------------------------------------ trasferte e rimborsi (§14.15)

  /** Il rimborso di una trasferta: km (x2 con andata e ritorno) x euro al km, al centesimo; più l'indennità. */
  function rimborsoTrasferta(t) {
    const x = t || {};
    const kmTotali = Math.round(numero(x.km) * (x.andataRitorno ? 2 : 1) * 100) / 100;
    const rimborsoKm = centesimi(kmTotali * numero(x.euroKm));
    const indennita = centesimi(numero(x.indennita));
    return { kmTotali, rimborsoKm, indennita, totale: centesimi(rimborsoKm + indennita) };
  }

  /**
   * I rimborsi dovuti a ogni persona: spese pagate da lei (pagataDaMe), approvate,
   * non "Mia", più le trasferte approvate, meno quelle già rimborsate. inAttesa =
   * le stesse cose ancora da approvare. Le persone in ordine di idUtente.
   */
  function rimborsiDovuti(spese, trasferte) {
    const per = {};
    const di = id => per[id] || (per[id] = { idUtente: id, totale: 0, inAttesa: 0, spese: 0, trasferte: 0, km: 0, voci: [] });
    for (const s of spese || []) {
      if (!s.pagataDaMe || s.destinazione === 'personale' || s.rimborsataIl || s.tolta || s.idUtente === null || s.idUtente === undefined) continue;
      const p = di(s.idUtente);
      const euro = centesimi(numero(s.importo));
      if (s.stato === 'approvata') {
        p.totale = centesimi(p.totale + euro);
        p.spese++;
        p.voci.push(Object.assign({ tipo: 'spesa' }, s));
      } else if (s.stato === 'da_approvare') p.inAttesa = centesimi(p.inAttesa + euro);
    }
    for (const t of trasferte || []) {
      if (t.rimborsataIl || t.tolta || t.idUtente === null || t.idUtente === undefined) continue;
      const r = rimborsoTrasferta(t);
      if (!(r.totale > 0)) continue;
      const p = di(t.idUtente);
      if (t.stato === 'approvata') {
        p.totale = centesimi(p.totale + r.totale);
        p.trasferte++;
        p.km = Math.round((p.km + r.kmTotali) * 100) / 100;
        p.voci.push(Object.assign({ tipo: 'trasferta' }, t));
      } else if (t.stato === 'da_approvare') p.inAttesa = centesimi(p.inAttesa + r.totale);
    }
    return Object.values(per).filter(p => p.totale > 0 || p.inAttesa > 0).sort((a, b) => a.idUtente - b.idUtente);
  }

  // ------------------------------------------------------------------ stati, a chi va, categorie

  /** Gli stati di ore, spese e trasferte, sempre con la parola. Approvata non ha pillola (è la normalità). */
  const STATI = {
    bozza: { parola: 'Bozza', colore: 'grigio' },
    da_approvare: { parola: 'Da approvare', colore: 'giallo' },
    approvata: { parola: 'Approvata', colore: 'verde' },
    respinta: { parola: 'Respinta', colore: 'rosso' },
  };

  /** La pillola di stato di una riga: null se è approvata; "Respinta: motivo" se è respinta. */
  function pillolaStato(x) {
    const st = x && STATI[x.stato];
    if (!st || x.stato === 'approvata') return null;
    if (x.stato === 'respinta') return { testo: 'Respinta' + (x.motivoRifiuto ? ': ' + x.motivoRifiuto : ''), colore: 'rosso' };
    return { testo: st.parola, colore: st.colore };
  }

  /** La pillola di un rapportino (§14.7): "Da approvare" o "Respinto: motivo"; niente se non serve o è approvato. */
  function pillolaApprovazione(r) {
    const st = r ? r.statoApprovazione : '';
    if (st === 'da_approvare') return { testo: 'Da approvare', colore: 'giallo' };
    if (st === 'respinto') return { testo: 'Respinto' + (r.motivoRifiuto ? ': ' + r.motivoRifiuto : ''), colore: 'rosso' };
    return null;
  }

  /**
   * Un rapportino che aspetta l'approvazione (o è stato respinto) non si manda al
   * cliente e non si fattura: il server lo rifiuta, l'interfaccia lo dice prima,
   * con la stessa frase. '' se si può.
   */
  function bloccoInvio(r) {
    if (!r) return '';
    if (r.statoApprovazione === 'da_approvare') return 'Il rapportino ' + (r.id || '') + ' aspetta l\'approvazione: si manda al cliente e si fattura solo dopo';
    if (r.statoApprovazione === 'respinto') return 'Il rapportino ' + (r.id || '') + ' è stato respinto' + (r.motivoRifiuto ? ' (' + r.motivoRifiuto + ')' : '') + ': correggilo e rimandalo in approvazione';
    return '';
  }

  /** A chi va una spesa: Al cliente (blu), Allo studio (grigia), Mia (viola). */
  const DESTINAZIONI = [
    ['cliente', 'Al cliente', 'blu'],
    ['studio', 'Allo studio', 'grigio'],
    ['personale', 'Mia', 'viola'],
  ];
  function destinazione(d) {
    const x = DESTINAZIONI.find(v => v[0] === (d === 'mia' ? 'personale' : d)) || DESTINAZIONI[1];
    return { valore: x[0], parola: x[1], colore: x[2] };
  }

  /** A chi va di base: al cliente se c'è una commessa, un cliente o un rapportino; allo studio se no (§14.8). */
  function destinazioneDiBase(s) {
    const x = s || {};
    return testo(x.idCommessa) || testo(x.idCliente) || testo(x.idRapportino) ? 'cliente' : 'studio';
  }

  /** Le categorie, coi loro nomi e le icone. */
  const CATEGORIE = [
    ['carburante', 'Carburante', 'carburante'], ['pedaggio', 'Pedaggio', 'pedaggio'], ['parcheggio', 'Parcheggio', 'parcheggio'],
    ['vitto', 'Vitto', 'vitto'], ['alloggio', 'Alloggio', 'alloggio'], ['treno', 'Treno', 'treno'], ['aereo', 'Aereo', 'aereo'],
    ['taxi', 'Taxi', 'taxi'], ['materiale', 'Materiale', 'materiale'], ['altro', 'Altro', 'scontrino'],
  ];
  const categoria = c => { const x = CATEGORIE.find(v => v[0] === c) || CATEGORIE[CATEGORIE.length - 1]; return { valore: x[0], nome: x[1], icona: x[2] }; };

  // ------------------------------------------------------------------ giorni e periodi

  function daIso(s) { return new Date(String(s).slice(0, 10) + 'T12:00:00'); }
  function isoDi(d) { return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()); }
  function piuGiorni(s, n) { const d = daIso(s); d.setDate(d.getDate() + n); return isoDi(d); }
  /** I sette giorni della settimana di un giorno, da lunedì. */
  function settimanaDi(s) {
    const d = daIso(s);
    const lunedi = piuGiorni(isoDi(d), -((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (x, i) => piuGiorni(lunedi, i));
  }
  /** Il primo e l'ultimo giorno di un mese ("2026-10"). */
  function periodoMese(mese) {
    const [a, m] = String(mese).slice(0, 7).split('-').map(Number);
    return { da: a + '-' + due(m) + '-01', a: isoDi(new Date(a, m, 0, 12)) };
  }
  function spostaMese(mese, d) {
    const [a, m] = String(mese).slice(0, 7).split('-').map(Number);
    const x = new Date(a, m - 1 + d, 1, 12);
    return x.getFullYear() + '-' + due(x.getMonth() + 1);
  }

  const GIORNI_BREVI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  /** "Lun 20" */
  const giornoBreve = s => GIORNI_BREVI[daIso(s).getDay()] + ' ' + daIso(s).getDate();
  /** "martedì 20 ottobre" */
  const giornoLungo = s => { const d = daIso(s); return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()]; };
  /** "Dal 19 al 25 ottobre", "Dal 27 ottobre al 2 novembre" */
  function titoloSettimana(giorni) {
    const a = daIso(giorni[0]);
    const b = daIso(giorni[giorni.length - 1]);
    return a.getMonth() === b.getMonth() ? 'Dal ' + a.getDate() + ' al ' + b.getDate() + ' ' + MESI[b.getMonth()]
      : 'Dal ' + a.getDate() + ' ' + MESI[a.getMonth()] + ' al ' + b.getDate() + ' ' + MESI[b.getMonth()];
  }

  // ------------------------------------------------------------------ timesheet della settimana (§14.3)

  /** La chiave della riga del timesheet: il codice della commessa in maiuscolo, '' per lo studio. */
  const chiaveCommessa = id => testo(id).toUpperCase();

  /**
   * I giorni da mostrare: da lunedì a venerdì sempre, sabato e domenica solo se
   * hanno ore (come la settimana del telefono).
   */
  function giorniDaMostrare(settimana, ore, giorniServer) {
    const conOre = new Set((ore || []).filter(o => o.stato !== 'respinta' && numero(o.ore) > 0).map(o => o.data));
    (giorniServer || []).forEach(g => { if (numero(g.ore) > 0 || numero(g.oreRapportini) > 0) conOre.add(g.data); });
    return settimana.filter((g, i) => i < 5 || conOre.has(g));
  }

  /**
   * Il timesheet di una persona: righe = commesse (più "Studio", sempre in fondo),
   * colonne = giorni, cella = somma delle righe non respinte di quella commessa e
   * quel giorno. Ogni cella tiene anche le sue righe (respinte comprese), perché
   * la regola per scriverla dipende da quante e quali sono.
   * aggiunte = codici di commesse da mostrare anche senza ore (scelte a mano).
   */
  function timesheet(ore, giorni, aggiunte, nomeCommessa) {
    const righe = new Map();
    const riga = (id, nome) => {
      const k = chiaveCommessa(id);
      if (!righe.has(k)) righe.set(k, { chiave: k, idCommessa: testo(id), nome: nome || (k ? (nomeCommessa ? nomeCommessa(k) : '') : 'Attività dello studio'), celle: {}, totale: 0 });
      return righe.get(k);
    };
    (aggiunte || []).forEach(id => riga(id));
    for (const o of ore || []) {
      if (o.tolta || giorni.indexOf(o.data) < 0) continue;
      const r = riga(o.idCommessa, o.commessa);
      if (!r.nome && o.commessa) r.nome = o.commessa;
      const c = r.celle[o.data] || (r.celle[o.data] = { data: o.data, ore: 0, righe: [] });
      c.righe.push(o);
      if (o.stato !== 'respinta') c.ore = Math.round((c.ore + numero(o.ore)) * 100) / 100;
    }
    riga('', 'Attività dello studio');
    const lista = Array.from(righe.values()).sort((a, b) => (a.chiave === '') - (b.chiave === '') || a.chiave.localeCompare(b.chiave));
    const perGiorno = {};
    giorni.forEach(g => { perGiorno[g] = 0; });
    lista.forEach(r => {
      giorni.forEach(g => {
        if (!r.celle[g]) r.celle[g] = { data: g, ore: 0, righe: [] };
        perGiorno[g] = Math.round((perGiorno[g] + r.celle[g].ore) * 100) / 100;
      });
      r.totale = Math.round(giorni.reduce((s, g) => s + r.celle[g].ore, 0) * 100) / 100;
    });
    const totale = Math.round(giorni.reduce((s, g) => s + perGiorno[g], 0) * 100) / 100;
    return { righe: lista, perGiorno, totale };
  }

  /**
   * La regola sicura per scrivere una cella del timesheet (si scrive solo se non si
   * perde niente):
   *  - nessuna riga: si scrive, e nasce una riga nuova con le sole ore;
   *  - una riga sola, con le ore scritte a mano (senza inizio e fine) e che si può
   *    cambiare: si scrive, e cambiano solo le sue ore (descrizione, prestazione,
   *    fatturabile restano: salvaOre con id cambia solo i campi mandati);
   *  - una riga con inizio e fine (anche quella del timer): no, perché mandare le ore
   *    a mano toglierebbe gli orari; si apre il giorno;
   *  - più righe: no, non si sa quale cambiare; si apre il giorno;
   *  - una riga bloccata (approvata, per il collaboratore) o senza il permesso: no.
   * Torna { scrivibile, riga, perche } con perche = '' | 'sola' | 'piu' | 'orari' | 'bloccata'.
   */
  function cellaScrivibile(cella, puoScrivere) {
    const righe = (cella && cella.righe) || [];
    if (!puoScrivere) return { scrivibile: false, riga: null, perche: 'sola' };
    if (!righe.length) return { scrivibile: true, riga: null, perche: '' };
    if (righe.length > 1) return { scrivibile: false, riga: null, perche: 'piu' };
    const r = righe[0];
    if (testo(r.inizio) || testo(r.fine)) return { scrivibile: false, riga: r, perche: 'orari' };
    if (r.puoScrivere === false || testo(r.bloccata)) return { scrivibile: false, riga: r, perche: 'bloccata' };
    return { scrivibile: true, riga: r, perche: '' };
  }

  /** Perché una cella non si scrive, a parole (il titolo che compare passando sopra). */
  function motivoNonScrivibile(perche, n) {
    return {
      piu: (n || 2) + ' righe in questo giorno: apri per cambiarle una per una',
      orari: 'Ore con inizio e fine: apri per cambiarle',
      bloccata: 'Già approvate: per cambiarle chiedi a chi approva',
      sola: '',
    }[perche] || '';
  }

  /** Quello che si scrive in una cella ("1,5", "", "2.5", "8 h") -> { ore } oppure { errore }. Vuoto = 0. */
  function leggiCella(valore) {
    const s = testo(valore).replace(/\s*h$/i, '');
    if (!s) return { ore: 0 };
    if (!/^\d{1,2}([.,]\d{1,2})?$/.test(s)) return { errore: 'Scrivi le ore con la virgola, per esempio 1,5' };
    const n = Number(s.replace(',', '.'));
    if (n > 24) return { errore: 'Ore: da 0 a 24' };
    return { ore: Math.round(n * 100) / 100 };
  }

  /**
   * Cosa fare scrivendo una cella: { tipo: 'niente' } (uguale a prima),
   * 'crea' (riga nuova con quelle ore), 'cambia' (le ore della riga id), 'togli'
   * (una riga sola portata a zero: si toglie, con Annulla), 'apri' (la cella non
   * si scrive: si apre il giorno), 'errore'.
   */
  function azioneCella(cella, valore, puoScrivere) {
    const s = cellaScrivibile(cella, puoScrivere);
    if (!s.scrivibile) return { tipo: 'apri', perche: s.perche };
    const v = leggiCella(valore);
    if (v.errore) return { tipo: 'errore', errore: v.errore };
    if (!s.riga) return v.ore > 0 ? { tipo: 'crea', ore: v.ore } : { tipo: 'niente' };
    if (v.ore === 0) return { tipo: 'togli', id: s.riga.id, prima: numero(s.riga.ore) };
    // Una riga respinta riscritta con le stesse ore si rimanda lo stesso (chi l'ha scritta la corregge).
    if (v.ore === numero(s.riga.ore) && s.riga.stato !== 'respinta') return { tipo: 'niente' };
    return { tipo: 'cambia', id: s.riga.id, ore: v.ore, prima: numero(s.riga.ore) };
  }

  /** Il valore di una cella da scrivere nel campo: "1,5", vuoto per zero. */
  const valoreCella = n => (numero(n) ? String(Math.round(numero(n) * 100) / 100).replace('.', ',') : '');

  // ------------------------------------------------------------------ timer

  /** 5432 secondi -> "01:30:32". */
  function durata(secondi) {
    const s = Math.max(0, Math.floor(numero(secondi)));
    return due(Math.floor(s / 3600)) + ':' + due(Math.floor(s / 60) % 60) + ':' + due(s % 60);
  }

  /**
   * I secondi del timer adesso: quelli del server al momento della lettura più il
   * tempo passato da allora sull'orologio di questo computer (che può essere
   * sbagliato di qualche minuto, ma scorre giusto).
   */
  function secondiTimer(timer, lettoAlle, adesso) {
    if (!timer) return 0;
    return numero(timer.secondi) + Math.max(0, Math.floor(((adesso || Date.now()) - (lettoAlle || Date.now())) / 1000));
  }

  // ------------------------------------------------------------------ approvazioni

  /** Il numero a destra di una voce da approvare: "4,5 h" o "230,00 €". */
  function quantoVoce(v) {
    if (!v || v.quanto === null || v.quanto === undefined) return '';
    return v.unita === 'euro' ? C.euro(v.quanto) : C.ore(v.quanto);
  }

  /** La chiave di una voce da approvare (tipo e id: gli id di tipi diversi si ripetono). */
  const chiaveVoce = v => v.tipo + ':' + v.id;

  /** "4 approvate", "1 respinta", "3 rimesse da approvare". */
  function fraseDecisione(n, decisione) {
    const una = n === 1;
    if (decisione === 'approva') return n + (una ? ' approvata' : ' approvate');
    if (decisione === 'respingi') return n + (una ? ' respinta' : ' respinte') + ', col motivo';
    return n + (una ? ' rimessa da approvare' : ' rimesse da approvare');
  }

  // ------------------------------------------------------------------ costo della commessa (§14.11)

  /**
   * Il costo della commessa con le ore registrate, le spese e le trasferte: costo
   * sostenuto = totale di costoCommessa (server); lavoro = lavoro dei rapportini +
   * ore registrate; costo atteso = max(lavoro, costo previsto dal budget) + auto +
   * spese dei rapportini + spese fuori dai rapportini + trasferte; margine atteso =
   * valore atteso - costo atteso. k è il cruscotto della fase 1 (conti.js), cc la
   * risposta del server. Senza ore, spese e trasferte nuove i numeri sono quelli
   * del cruscotto al centesimo.
   */
  function costiConFase3(k, cc) {
    if (!cc) return null;
    const lavoro = centesimi(numero(cc.lavoro) + numero(cc.costoOreRegistrate));
    const lavoroNoto = cc.lavoroNoto !== false;
    const previsto = k && k.previsto && k.previsto.costoPrevisto !== null && k.previsto.costoPrevisto !== undefined ? numero(k.previsto.costoPrevisto) : null;
    const lavoroAtteso = previsto !== null && lavoroNoto ? Math.max(lavoro, previsto) : lavoro;
    // Fase 6 (§17.15): il costo atteso sa dei collaboratori esterni dal giorno dell'incarico (il più grande fra pattuito e
    // fatturato) e delle altre fatture ricevute della commessa; il sostenuto (cc.totale) li ha già dentro.
    const altro = numero(cc.auto) + numero(cc.speseRapportini) + numero(cc.speseFuoriRapportini) + numero(cc.trasferte) + numero(cc.collaboratoriPrevisto) + numero(cc.altreRicevute);
    const costoAtteso = centesimi(lavoroAtteso + altro);
    const valoreAtteso = k ? numero(k.valoreAtteso) : 0;
    const margine = centesimi(valoreAtteso - costoAtteso);
    return {
      costoSostenuto: numero(cc.totale), lavoro, lavoroNoto, costoAtteso, margine,
      percMargine: valoreAtteso > 0 ? margine / valoreAtteso : null,
      margineDaBudget: lavoroAtteso > lavoro,
      // Le parti nuove della fase 3: se non ce ne sono, è il numero della fase 1.
      conFase3: numero(cc.costoOreRegistrate) > 0 || numero(cc.speseFuoriRapportini) > 0 || numero(cc.trasferte) > 0 || numero(cc.collaboratoriPrevisto) > 0 || numero(cc.altreRicevute) > 0,
    };
  }

  // ------------------------------------------------------------------ statistiche

  /** La larghezza di una barra in percento (0-100), rispetto al massimo. */
  const larghezza = (x, massimo) => (massimo > 0 ? Math.max(0, Math.min(100, Math.round(numero(x) / massimo * 100))) : 0);

  /** "86% fatturabili" o "" senza ore. */
  const testoPercentuale = p => (p === null || p === undefined ? '' : p + '% fatturabili');

  const RegoleOreSpese = {
    minutiDa, oraDaMinuti, oreDaOrari, provaOreDaOrari, rimborsoTrasferta, rimborsiDovuti, centesimi,
    STATI, pillolaStato, pillolaApprovazione, bloccoInvio, DESTINAZIONI, destinazione, destinazioneDiBase, CATEGORIE, categoria,
    piuGiorni, settimanaDi, periodoMese, spostaMese, giornoBreve, giornoLungo, titoloSettimana, MESI,
    chiaveCommessa, giorniDaMostrare, timesheet, cellaScrivibile, motivoNonScrivibile, leggiCella, azioneCella, valoreCella,
    durata, secondiTimer, quantoVoce, chiaveVoce, fraseDecisione, costiConFase3, larghezza, testoPercentuale,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RegoleOreSpese;
  else radice.WisperRegoleOreSpese = RegoleOreSpese;
})(typeof window !== 'undefined' ? window : globalThis);
