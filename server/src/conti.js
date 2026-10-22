/*
 * I conti: le stesse funzioni di apps-script/Code.gs (regoleDi, calcola) e di
 * pc/ui/conti.js (budget della commessa), riga per riga. I casi di prova sono
 * gli stessi (apps-script/prove/casi-calcolo.json): telefono, computer e server
 * devono dare lo stesso totale al centesimo.
 */
'use strict';

const { numero, numeroONull, normalizza, centesimi, testo, due, Rifiuto } = require('./utili');

/**
 * Elettrodinamica: il cliente a cui si fattura a tariffa fissa, 30 euro l'ora,
 * i km si' e il tempo di viaggio no. Gli altri clienti hanno la tariffa libera,
 * scritta nel rapportino, e il server se la ricorda cliente per cliente.
 */
const ELETTRODINAMICA = {
  nome: 'Elettrodinamica', tariffaFissa: 30, pagaViaggio: 'NO', kmRimborsati: 'SI', maggExtra: 0,
  note: 'Tariffa fissa: il tempo di viaggio non si paga, i km si.',
};

/** Gli stati di un rapportino, in ordine di vita. */
const STATI = ['BOZZA', 'FIRMATO', 'INVIATO', 'FATTURATO', 'ANNULLATO'];

/** Da firmato in poi il contenuto non si tocca: si riporta in bozza, e la firma cade. */
const STATI_BLOCCATI = ['FIRMATO', 'INVIATO', 'FATTURATO'];

/**
 * Le regole economiche di un rapportino: dalla scheda del cliente, e il
 * rimborso chilometrico dalla commessa. Il costo orario: prima il costo fisso
 * del cliente, poi quello della commessa, poi COSTO_ORARIO. I gruppi valgono
 * solo per un cliente dei fogli vecchi che ne ha uno e non ha la sua tariffa.
 */
function regoleDi(cliente, gruppi, impostazioni, commessa) {
  const c = cliente || {};
  const nomeGruppo = c.gruppo || '';
  const g = (gruppi || []).filter(x => normalizza(x.nome) === normalizza(nomeGruppo))[0];
  const scritto = v => v !== null && v !== undefined;
  const tariffaFissa = scritto(c.tariffaFissa) ? c.tariffaFissa : (g && scritto(g.tariffaFissa) ? g.tariffaFissa : null);
  return {
    gruppo: g ? g.nome : nomeGruppo,
    tariffaFissa: tariffaFissa,
    pagaViaggio: scritto(c.pagaViaggio) ? c.pagaViaggio : (g ? g.pagaViaggio : false),
    kmRimborsati: scritto(c.kmRimborsati) ? c.kmRimborsati : (g ? g.kmRimborsati : true),
    maggExtra: scritto(c.maggExtra) ? c.maggExtra : (g ? g.maggExtra : 0),
    euroKm: commessa && scritto(commessa.euroKm) ? commessa.euroKm : numero(impostazioni.EURO_KM),
    costoOrario: scritto(c.costoFisso) ? c.costoFisso
      : commessa && scritto(commessa.costoOrario) ? commessa.costoOrario : numeroONull(impostazioni.COSTO_ORARIO),
  };
}

/**
 * Il conto di un rapportino. Ogni pezzo si arrotonda al centesimo PRIMA di
 * sommare: il totale e' sempre la somma esatta dei pezzi che si vedono sul PDF.
 */
function calcola(r, regole) {
  const lavoro = numero(r.oreLavoro);
  const extra = numero(r.oreExtra);
  const viaggio = numero(r.oreViaggio);
  const tariffa = regole.tariffaFissa !== null && regole.tariffaFissa !== undefined
    ? regole.tariffaFissa : numero(r.tariffa);
  const compenso = centesimi(
    (lavoro + (regole.pagaViaggio ? viaggio : 0)) * tariffa +
    extra * tariffa * (1 + numero(regole.maggExtra) / 100)
  );
  const rimborso = regole.kmRimborsati ? centesimi(numero(r.km) * numero(regole.euroKm)) : 0;
  const spese = centesimi(numero(r.spese));
  return {
    oreTotali: Math.round((lavoro + extra + viaggio) * 100) / 100,
    tariffa: tariffa,
    compensoOre: compenso,
    rimborsoKm: rimborso,
    totale: centesimi(compenso + rimborso + spese),
  };
}

/**
 * Prossimo codice libero di una serie tipo C001: il piu' alto gia' presente
 * piu' uno, cosi' i buchi non si riusano e un codice non finisce mai su due
 * anagrafiche diverse.
 */
function prossimoCodice(codici, lettera) {
  let max = 0;
  codici.forEach(c => {
    const m = String(c).trim().toUpperCase().match(new RegExp('^' + lettera + '(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  const n = max + 1;
  return lettera + (n < 1000 ? ('00' + n).slice(-3) : String(n));
}

/** Il codice delle commesse di prima dei formati (26ST001): serve all'importazione. */
const RE_CODICE_COMMESSA = /^\d{2}ST(\d+)$/;

/**
 * La tariffa da proporre quando chi scrive non vede i prezzi (un collaboratore):
 * il prezzo della commessa, poi l'ultima del cliente, poi quella del suo ultimo
 * rapportino. Come tariffaProposta() di pc/ui/conti.js.
 */
function tariffaProposta(cliente, rapportini, commessa) {
  if (commessa && commessa.prezzoOrario > 0) return commessa.prezzoOrario;
  if (cliente && cliente.ultimaTariffa > 0) return cliente.ultimaTariffa;
  if (!cliente) return null;
  const suoi = (rapportini || []).filter(r => r.idCliente === cliente.id && r.tariffa > 0)
    .sort((a, b) => (a.data < b.data ? 1 : -1));
  return suoi.length ? suoi[0].tariffa : null;
}

const scritto = v => v !== null && v !== undefined && v !== '';

/** Il prezzo di un'ora: la tariffa fissa del cliente (Elettrodinamica) o quello della commessa. */
function prezzoOrarioDi(cliente, commessa) {
  if (cliente && scritto(cliente.tariffaFissa)) return numero(cliente.tariffaFissa);
  return commessa && scritto(commessa.prezzoOrario) ? numero(commessa.prezzoOrario) : null;
}

/** Quanto costa un'ora: il costo fisso del cliente, poi quello della commessa, poi le impostazioni. */
function costoOrarioDi(cliente, commessa, impostazioni) {
  if (cliente && scritto(cliente.costoFisso)) return numero(cliente.costoFisso);
  if (commessa && scritto(commessa.costoOrario)) return numero(commessa.costoOrario);
  return numeroONull((impostazioni || {}).COSTO_ORARIO);
}

/** Ore previste x prezzo orario = budget; ore x costo orario = costo previsto; la differenza e' il margine. */
function budgetDi(commessa, cliente, impostazioni) {
  const prezzo = prezzoOrarioDi(cliente, commessa);
  const costo = costoOrarioDi(cliente, commessa, impostazioni);
  let ore = scritto(commessa.budgetOre) && numero(commessa.budgetOre) > 0 ? numero(commessa.budgetOre) : null;
  let euro = scritto(commessa.budgetEuro) && numero(commessa.budgetEuro) > 0 ? numero(commessa.budgetEuro) : null;
  if (euro === null && ore !== null && prezzo) euro = centesimi(ore * prezzo);
  if (ore === null && euro !== null && prezzo) ore = Math.round(euro / prezzo * 10) / 10;
  const costoPrevisto = ore !== null && costo !== null ? centesimi(ore * costo) : null;
  return {
    ore, prezzo, costo, euro, costoPrevisto,
    margine: euro !== null && costoPrevisto !== null ? centesimi(euro - costoPrevisto) : null,
  };
}

/**
 * Il codice di controllo di una partita IVA italiana (11 cifre, l'ultima e' di
 * controllo, Luhn modificato): le cifre in posizione dispari si sommano, quelle
 * pari si raddoppiano (togliendo 9 se passano 9). Il totale deve finire per 0.
 */
function partitaIvaItalianaValida(v) {
  const s = testo(v).replace(/\s/g, '').toUpperCase().replace(/^IT(?=\d{11}$)/, '');
  if (!/^\d{11}$/.test(s)) return false;
  let somma = 0;
  for (let i = 0; i < 11; i++) {
    let c = s.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      c *= 2;
      if (c > 9) c -= 9;
    }
    somma += c;
  }
  return somma % 10 === 0;
}

// ------------------------------------------------------------------ i conti del preventivo (fase 2)

/** L'importo di una voce: quantita' x prezzo x (1 - sconto della voce), al centesimo. */
function importoVoce(v) {
  return centesimi(numero(v.quantita) * numero(v.prezzo) * (1 - numero(v.scontoPercentuale) / 100));
}

/** Il nome del gruppo di alternative: senza badare a maiuscole e spazi ("Collaudo " = "collaudo"). */
const gruppoAlternativa = v => testo(v.alternativa).toLowerCase().replace(/\s+/g, ' ');

/**
 * Quali voci contano: le normali sempre, le facoltative se il cliente le vuole
 * (scelta), e di ogni gruppo di alternative solo la prima scelta. Torna un
 * elenco di vero/falso nello stesso ordine delle voci.
 */
function vociCheContano(voci) {
  const presi = {};
  return voci.map(v => {
    const g = gruppoAlternativa(v);
    if (g) {
      if (!v.scelta || presi[g]) return false;
      presi[g] = true;
      return true;
    }
    if (v.facoltativa) return !!v.scelta;
    return true;
  });
}

/**
 * Il conto di un preventivo, solo qui: telefono e computer lo rifanno uguale
 * per l'anteprima, con i casi di server/prove/casi-preventivo.json.
 *
 * p = {scontoPercentuale, scontoEuro, eppiPercentuale, ivaPercentuale,
 *      sezioni: [{voci: [{quantita, prezzo, scontoPercentuale, facoltativa, alternativa, scelta, modo}]}],
 *      scadenzePagamento: [{tipo: 'percentuale'|'importo', valore}]}
 *
 * Ogni pezzo si arrotonda al centesimo PRIMA di sommare, come i rapportini:
 * il totale e' sempre la somma esatta dei pezzi scritti sul PDF.
 */
function contiPreventivo(p) {
  const sezioni = (p.sezioni || []).map(s => s.voci || []);
  const tutte = [].concat(...sezioni);
  const contano = vociCheContano(tutte);
  let i = 0;
  let somma = 0;
  let ore = 0;
  const voci = [];
  const subtotali = sezioni.map(lista => {
    let sub = 0;
    for (const v of lista) {
      const importo = importoVoce(v);
      const conta = contano[i++];
      voci.push({ importo, conta });
      if (conta) {
        sub = centesimi(sub + importo);
        if (v.modo === 'ore') ore += numero(v.quantita);
      }
    }
    somma = centesimi(somma + sub);
    return sub;
  });
  const scontoDaPercentuale = centesimi(somma * numero(p.scontoPercentuale) / 100);
  const scontoEuro = centesimi(numero(p.scontoEuro));
  const imponibile = centesimi(somma - scontoDaPercentuale - scontoEuro);
  const contributo = centesimi(imponibile * numero(p.eppiPercentuale) / 100);
  const baseIva = centesimi(imponibile + contributo);
  const iva = centesimi(baseIva * numero(p.ivaPercentuale) / 100);
  const scadenze = (p.scadenzePagamento || []).map(s => (s.tipo === 'importo'
    ? centesimi(numero(s.valore)) : centesimi(imponibile * numero(s.valore) / 100)));
  return {
    sommaVoci: somma,
    scontoDaPercentuale,
    scontoEuro,
    imponibile,
    eppiPercentuale: numero(p.eppiPercentuale),
    contributo,
    baseIva,
    ivaPercentuale: numero(p.ivaPercentuale),
    iva,
    totale: centesimi(baseIva + iva),
    oreVoci: Math.round(ore * 100) / 100,
    senzaPrezzo: tutte.filter(v => !(numero(v.prezzo) > 0)).length,
    restoScadenze: centesimi(imponibile - scadenze.reduce((a, b) => centesimi(a + b), 0)),
    voci,
    sezioni: subtotali,
    scadenze,
  };
}

// ------------------------------------------------------------------ fase 3: ore, trasferte, rimborsi, costo della commessa
//
// Come per il preventivo, i conti stanno solo qui; telefono e computer li rifanno
// per l'anteprima con i casi di server/prove/casi-ore-spese.json.

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
 * Le ore di una riga da inizio, fine e pausa (in minuti).
 *
 * La regola della mezzanotte: una fine PRIMA dell'inizio e' del giorno dopo
 * (22:00-06:00 sono 8 ore) e la riga resta del giorno in cui il lavoro e'
 * cominciato. Una fine uguale all'inizio e' un errore (zero o 24 ore? non si
 * indovina). La pausa non puo' essere lunga quanto il lavoro. Le ore sono
 * arrotondate a due decimali (8:00-12:20 = 4,33).
 */
function oreDaOrari(inizio, fine, pausaMinuti) {
  const a = minutiDa(inizio);
  if (a === null) throw new Rifiuto('Inizio: scrivi l\'ora come 8:30');
  const b = minutiDa(fine);
  if (b === null) throw new Rifiuto('Fine: scrivi l\'ora come 17:30');
  if (a === b) throw new Rifiuto('Fine: deve essere diversa dall\'inizio');
  const pausa = pausaMinuti === undefined || pausaMinuti === null || pausaMinuti === '' ? 0 : Number(pausaMinuti);
  if (!(pausa >= 0) || Math.round(pausa) !== pausa) throw new Rifiuto('Pausa: scrivi i minuti, da zero in su');
  const giornoDopo = b < a;
  const durata = (giornoDopo ? b + 1440 : b) - a;
  if (pausa >= durata) throw new Rifiuto('Pausa: è più lunga del lavoro');
  const minuti = durata - pausa;
  return { inizio: oraDaMinuti(a), fine: oraDaMinuti(b), pausaMinuti: pausa, minuti, ore: Math.round(minuti / 60 * 100) / 100, giornoDopo };
}

/**
 * Il rimborso di una trasferta: km (x2 con andata e ritorno) x euro al km
 * congelato, al centesimo; piu' l'indennita'. Ogni pezzo arrotondato prima di
 * sommare, come i rapportini.
 */
function rimborsoTrasferta(t) {
  const kmTotali = Math.round(numero(t.km) * (t.andataRitorno ? 2 : 1) * 100) / 100;
  const rimborsoKm = centesimi(kmTotali * numero(t.euroKm));
  const indennita = centesimi(numero(t.indennita));
  return { kmTotali, rimborsoKm, indennita, totale: centesimi(rimborsoKm + indennita) };
}

/** Le ore di un rapportino per le statistiche: tutte, fatturabili (il viaggio solo se si paga) e il loro costo. */
function oreDelRapportino(r, costoOrarioDiRiserva) {
  const lavoro = numero(r.oreLavoro) + numero(r.oreExtra);
  const viaggio = numero(r.oreViaggio);
  const co = scritto(r.costoOrario) ? numero(r.costoOrario) : (costoOrarioDiRiserva === undefined ? null : costoOrarioDiRiserva);
  return {
    ore: Math.round((numero(r.oreTotali) || lavoro + viaggio) * 100) / 100,
    fatturabili: Math.round((lavoro + (r.pagaViaggio ? viaggio : 0)) * 100) / 100,
    // Come il cruscotto della fase 1: il costo orario comprende gia' il viaggio.
    costo: co === null ? null : centesimi(lavoro * co),
  };
}

/** Una riga che conta nei conti: mandata o approvata (non bozza, non respinta, non tolta). */
const contaNeiConti = x => !x.tolta && (x.stato === 'da_approvare' || x.stato === 'approvata');

/**
 * I rimborsi dovuti a ogni persona: le spese che ha pagato lei (pagataDaMe),
 * approvate, che non sono "Mia" (personale), piu' le trasferte approvate
 * (rimborso km + indennita'), meno quelle gia' rimborsate. inAttesa = le stesse
 * cose ancora da approvare. spese e trasferte sono quelle delle risposte
 * (spesaDaRiga, trasfertaDaRiga); le spese dei rapportini annullati vanno
 * tolte prima. Le persone in ordine di idUtente.
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

/**
 * Il costo di una commessa (architettura.md §14.10). La prima parte e' quella
 * del cruscotto della fase 1 (pc/ui/conti.js, cruscotto): le ore di lavoro e
 * straordinarie dei rapportini non annullati al loro costo orario (quello di
 * oggi se la riga non l'ha), i km al loro euro al km, le spese dei rapportini.
 * La fase 3 aggiunge: le ore registrate (mandate o approvate) al costo orario
 * congelato nella riga, le spese della commessa fuori dai rapportini (al
 * cliente e allo studio; le "Mia" no), le spese di un rapportino spostate allo
 * studio (uscite dal suo conto), le trasferte (rimborso km + indennita').
 * soloRapportini = il numero della fase 1: senza ore, spese e trasferte nuove
 * i due coincidono al centesimo.
 */
function costoCommessa({ commessa, cliente, impostazioni, rapportini, ore, spese, trasferte }) {
  const id = String(commessa.id).toUpperCase();
  const stessa = x => String(x || '').toUpperCase() === id;
  const costoOggi = costoOrarioDi(cliente, commessa, impostazioni);
  const euroKmOggi = numero((impostazioni || {}).EURO_KM);
  let lavoro = 0;
  let lavoroNoto = true;
  let auto = 0;
  let speseRapportini = 0;
  const annullati = new Set();
  for (const r of rapportini || []) {
    if (!stessa(r.idCommessa)) continue;
    if (r.stato === 'ANNULLATO') { annullati.add(r.id); continue; }
    const co = scritto(r.costoOrario) ? numero(r.costoOrario) : costoOggi;
    if (co === null) lavoroNoto = false;
    else lavoro += (numero(r.oreLavoro) + numero(r.oreExtra)) * co;
    auto += numero(r.km) * (numero(r.euroKm) || euroKmOggi);
    speseRapportini += numero(r.spese);
  }
  lavoro = centesimi(lavoro);
  auto = centesimi(auto);
  speseRapportini = centesimi(speseRapportini);

  let oreRegistrate = 0;
  let oreRegistrateCosto = 0;
  for (const o of ore || []) {
    if (!stessa(o.idCommessa) || !contaNeiConti(o)) continue;
    const co = scritto(o.costoOrario) ? numero(o.costoOrario) : costoOggi;
    oreRegistrate += numero(o.ore);
    if (co === null) lavoroNoto = false;
    else oreRegistrateCosto += numero(o.ore) * co;
  }
  let speseFuori = 0;
  for (const s of spese || []) {
    if (!stessa(s.idCommessa) || s.tolta || s.destinazione === 'personale') continue;
    if (s.idRapportino) {
      // Quelle al cliente sono gia' nella colonna spese del rapportino; quelle spostate allo studio no.
      if (s.destinazione === 'studio' && !annullati.has(s.idRapportino) && (rapportini || []).some(r => r.id === s.idRapportino)) speseFuori += numero(s.importo);
    } else if (contaNeiConti(s)) speseFuori += numero(s.importo);
  }
  let costoTrasferte = 0;
  let kmTrasferte = 0;
  for (const t of trasferte || []) {
    if (!stessa(t.idCommessa) || !contaNeiConti(t)) continue;
    const r = rimborsoTrasferta(t);
    costoTrasferte += r.totale;
    kmTrasferte += r.kmTotali;
  }
  const oreCosto = centesimi(oreRegistrateCosto);
  const fuori = centesimi(speseFuori);
  const tr = centesimi(costoTrasferte);
  return {
    lavoro, lavoroNoto, auto, speseRapportini,
    oreRegistrate: Math.round(oreRegistrate * 100) / 100, costoOreRegistrate: oreCosto,
    speseFuoriRapportini: fuori, trasferte: tr, kmTrasferte: Math.round(kmTrasferte * 100) / 100,
    soloRapportini: centesimi(lavoro + auto + speseRapportini),
    totale: centesimi(lavoro + auto + speseRapportini + oreCosto + fuori + tr),
  };
}

// ------------------------------------------------------------------ fase 4: i conti della fattura
//
// Solo qui (accordo fase4.md §6). Telefono (rapportino/Fatture.kt) e computer
// (pc/ui/regole-fatture.js) li rifanno per l'anteprima mentre si cambia una
// bozza e passano gli stessi casi: server/prove/casi-fattura.json.

/** L'importo di una riga: "importo" se c'e' (righe raggruppate), se no quantita' x prezzo (quantita' mancante = 1). */
function importoRigaFattura(r) {
  if (r.importo !== undefined && r.importo !== null && r.importo !== '') return centesimi(numero(r.importo));
  const q = r.quantita === undefined || r.quantita === null || r.quantita === '' ? 1 : numero(r.quantita);
  return centesimi(q * numero(r.prezzo));
}

/**
 * I conti di una fattura (o di una nota di credito, con gli importi positivi).
 *
 * f = {regime: 'ordinario'|'forfettario', ivaPercentuale, eppiPercentuale, ritenutaPercentuale,
 *      ritenuta: true|false (il cliente e' sostituto d'imposta), bolloSoglia, bolloImporto, bolloRivalsa,
 *      righe: [{tipo: 'compenso'|'anticipazione', quantita, prezzo, importo?, tributoCliente?}]}
 *
 * Ogni pezzo arrotondato al centesimo PRIMA di sommare, come i rapportini e i
 * preventivi. La riga del bollo non entra in f (la aggiunge il server quando
 * bolloAddebitato e' piu' di zero): se arriva, si salta.
 */
function contiFattura(f) {
  const forfettario = f.regime === 'forfettario';
  let compenso = 0;
  let anticipazioni = 0;
  let perIlBollo = 0;
  const righe = [];
  for (const r of f.righe || []) {
    if (r.tipo === 'bollo') continue;
    const importo = importoRigaFattura(r);
    righe.push(importo);
    if (r.tipo === 'anticipazione') {
      anticipazioni = centesimi(anticipazioni + importo);
      if (!r.tributoCliente) perIlBollo = centesimi(perIlBollo + importo);
    } else {
      compenso = centesimi(compenso + importo);
    }
  }
  const contributo = centesimi(compenso * numero(f.eppiPercentuale) / 100);
  const baseIva = forfettario ? 0 : centesimi(compenso + contributo);
  const iva = forfettario ? 0 : centesimi(baseIva * numero(f.ivaPercentuale) / 100);
  const parteSenzaIva = forfettario ? centesimi(compenso + contributo + perIlBollo) : perIlBollo;
  const bollo = parteSenzaIva > numero(f.bolloSoglia) ? centesimi(numero(f.bolloImporto)) : 0;
  const bolloAddebitato = f.bolloRivalsa ? bollo : 0;
  const totale = forfettario
    ? centesimi(compenso + contributo + anticipazioni + bolloAddebitato)
    : centesimi(baseIva + iva + anticipazioni + bolloAddebitato);
  const ritenuta = !forfettario && f.ritenuta ? centesimi(compenso * numero(f.ritenutaPercentuale) / 100) : 0;
  return {
    righe, compenso, contributo, baseIva, iva, anticipazioni, parteSenzaIva, bollo, bolloAddebitato, totale, ritenuta,
    netto: centesimi(totale - ritenuta),
  };
}

// ------------------------------------------------------------------ fase 4: le righe che nascono dal lavoro (§5.2)
//
// I testi sono quelli dell'accordo, coi numeri all'italiana. Li fa solo il
// server (i raggruppamenti di casi-fattura.json li prova solo lui).

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre',
  'novembre', 'dicembre'];

/** "2026-09" -> "settembre 2026". */
const nomeMese = aaaamm => MESI[Number(String(aaaamm).slice(5, 7)) - 1] + ' ' + String(aaaamm).slice(0, 4);

/** Un numero all'italiana: 6,5 e 1.393,92 (min e max decimali). */
function numeroIt(n, minimo, massimo) {
  return numero(n).toLocaleString('it-IT', {
    minimumFractionDigits: minimo === undefined ? 0 : minimo,
    maximumFractionDigits: massimo === undefined ? 2 : massimo,
    useGrouping: true,
  });
}

/** Gli euro con due decimali: 8,40 e 1.520,00. */
const euroIt = n => numeroIt(n, 2, 2);

/** "2026-10-21" -> "21/10/2026". */
const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');

const due2 = n => Math.round(numero(n) * 100) / 100;

/** Ore pagate di un rapportino = lavoro + straordinarie + viaggio se il cliente paga il viaggio. */
function orePagate(r, pagaViaggioCliente) {
  const paga = r.pagaViaggio === undefined || r.pagaViaggio === null ? !!pagaViaggioCliente : !!r.pagaViaggio;
  return due2(numero(r.oreLavoro) + numero(r.oreExtra) + (paga ? numero(r.oreViaggio) : 0));
}

/** Quanto vale un rapportino come sorgente: compenso ore + rimborso km (+ le spese vecchie senza righe, §5.1). */
function importoRapportino(r) {
  return centesimi(numero(r.compensoOre) + numero(r.rimborsoKm) + numero(r.speseSenzaRighe));
}

/**
 * Le righe dei rapportini di un cliente (§5.2), coi gruppi (§5.3).
 *
 * @param x.raggruppa 'mese' (di base per i clienti a tariffa fissa) | 'rapportino'
 * @param x.cliente   {id, tariffaFissa, pagaViaggio}
 * @param x.rapportini [{id, data, descrizione, oreLavoro, oreExtra, oreViaggio, pagaViaggio?, tariffa, maggExtra,
 *                      compensoOre, km, euroKm, rimborsoKm, speseSenzaRighe?, idCommessa?}]
 * @param x.spese     [{id, idRapportino, data, descrizione, importo, anticipazione, tributoCliente?}] (le loro)
 * @return [{gruppo, righe: [{tipo, descrizione, quantita, unita, prezzo, importo, idCommessa, periodoDa, periodoA}],
 *           sorgenti: [{tipo, id, importo}]}]
 *
 * Mese: per mese una riga di ore per tariffa, una di km per euro al km, una
 * delle spese non anticipate; l'importo e' la somma delle sorgenti (gia'
 * arrotondate e firmate): se quantita' x prezzo non torna al centesimo, la
 * riga diventa "a corpo". Rapportino: una riga per rapportino col suo compenso,
 * i km e le spese non anticipate. Le anticipazioni sono sempre una riga per
 * spesa (natura N1), nel gruppo del loro rapportino.
 */
function righeRapportini(x) {
  const cliente = x.cliente || {};
  const rapportini = (x.rapportini || []).slice().sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.id < b.id ? -1 : 1)));
  const spese = x.spese || [];
  const speseDi = id => spese.filter(s => s.idRapportino === id).sort((a, b) => numero(a.id) - numero(b.id));
  const anticipazione = s => ({
    tipo: 'anticipazione', descrizione: 'Spesa anticipata per conto del cliente: ' + (testo(s.descrizione) || 'spesa') + ' del ' + dataIt(s.data),
    quantita: 1, unita: '', prezzo: centesimi(numero(s.importo)), importo: centesimi(numero(s.importo)), tributoCliente: !!s.tributoCliente,
    idCommessa: testo(s.idCommessa), periodoDa: '', periodoA: '',
  });
  const stessaCommessa = lista => {
    const c = Array.from(new Set(lista.map(r => testo(r.idCommessa).toUpperCase())));
    return c.length === 1 ? testo(lista[0].idCommessa) : '';
  };
  const gruppi = [];

  if (x.raggruppa === 'rapportino') {
    for (const r of rapportini) {
      const sue = speseDi(r.id);
      const nonAnticipate = centesimi(sue.filter(s => !s.anticipazione).reduce((t, s) => t + numero(s.importo), 0) + numero(r.speseSenzaRighe));
      const importo = centesimi(numero(r.compensoOre) + numero(r.rimborsoKm) + nonAnticipate);
      const ore = orePagate(r, cliente.pagaViaggio);
      const parti = [];
      if (ore > 0) parti.push(numeroIt(ore) + (ore === 1 ? ' ora' : ' ore'));
      if (numero(r.km) > 0 && numero(r.rimborsoKm) > 0) parti.push(numeroIt(r.km) + ' km');
      if (nonAnticipate > 0) parti.push('spese ' + euroIt(nonAnticipate) + ' €');
      const descrizione = 'Rapportino ' + r.id + ' del ' + dataIt(r.data) + (testo(r.descrizione) ? ': ' + testo(r.descrizione) : '') +
        (parti.length ? ' (' + parti.join(', ') + ')' : '');
      const righe = [{ tipo: 'compenso', descrizione, quantita: 1, unita: '', prezzo: importo, importo, idCommessa: testo(r.idCommessa), periodoDa: r.data, periodoA: r.data }];
      sue.filter(s => s.anticipazione).forEach(s => righe.push(anticipazione(s)));
      gruppi.push({
        gruppo: 'rapportino:' + r.id, righe,
        sorgenti: [{ tipo: 'rapportino', id: r.id, importo: importoRapportino(r) }].concat(sue.map(s => ({ tipo: 'spesa', id: String(s.id), importo: centesimi(numero(s.importo)) }))),
      });
    }
    return gruppi;
  }

  // Per mese.
  const perMese = new Map();
  for (const r of rapportini) {
    const m = String(r.data).slice(0, 7);
    if (!perMese.has(m)) perMese.set(m, []);
    perMese.get(m).push(r);
  }
  for (const [mese, lista] of perMese) {
    const quando = nomeMese(mese);
    const righe = [];
    const commessa = stessaCommessa(lista);
    const periodoDa = lista[0].data;
    const periodoA = lista[lista.length - 1].data;
    // Ore: una riga per tariffa.
    const perTariffa = new Map();
    for (const r of lista) {
      const t = numero(r.tariffa);
      if (!perTariffa.has(t)) perTariffa.set(t, { n: 0, ore: 0, extra: 0, importo: 0 });
      const g = perTariffa.get(t);
      g.n++;
      g.ore = due2(g.ore + orePagate(r, cliente.pagaViaggio));
      g.extra = due2(g.extra + numero(r.oreExtra));
      g.importo = centesimi(g.importo + numero(r.compensoOre));
    }
    for (const [tariffa, g] of perTariffa) {
      if (!(g.importo > 0) && !(g.ore > 0)) continue;
      const base = 'Prestazioni professionali di ' + quando + ' (' + g.n + (g.n === 1 ? ' rapportino' : ' rapportini');
      if (centesimi(g.ore * tariffa) === g.importo) {
        righe.push({ tipo: 'compenso', descrizione: base + ')', quantita: g.ore, unita: 'ore', prezzo: tariffa, importo: g.importo, idCommessa: commessa, periodoDa, periodoA });
      } else {
        const dettaglio = ', ' + numeroIt(g.ore) + ' ore' + (g.extra > 0 ? ' di cui ' + numeroIt(g.extra) + ' straordinari' + (g.extra === 1 ? 'a' : 'e') : '');
        righe.push({ tipo: 'compenso', descrizione: base + dettaglio + ')', quantita: 1, unita: '', prezzo: g.importo, importo: g.importo, idCommessa: commessa, periodoDa, periodoA });
      }
    }
    // Km: una riga per euro al km (con l'euro al km nella descrizione se nel mese sono piu' d'uno).
    const perEuroKm = new Map();
    for (const r of lista) {
      if (!(numero(r.km) > 0) || !(numero(r.rimborsoKm) > 0)) continue;
      const e = numero(r.euroKm);
      if (!perEuroKm.has(e)) perEuroKm.set(e, { km: 0, importo: 0 });
      const g = perEuroKm.get(e);
      g.km = due2(g.km + numero(r.km));
      g.importo = centesimi(g.importo + numero(r.rimborsoKm));
    }
    const piuEuroKm = perEuroKm.size > 1;
    for (const [euroKm, g] of perEuroKm) {
      const descrizione = 'Rimborso chilometrico di ' + quando + (piuEuroKm ? ' (' + numeroIt(euroKm, 2, 4) + ' €/km)' : '');
      if (centesimi(g.km * euroKm) === g.importo) {
        righe.push({ tipo: 'compenso', descrizione, quantita: g.km, unita: 'km', prezzo: euroKm, importo: g.importo, idCommessa: commessa, periodoDa, periodoA });
      } else {
        righe.push({ tipo: 'compenso', descrizione: descrizione + ' (' + numeroIt(g.km) + ' km)', quantita: 1, unita: '', prezzo: g.importo, importo: g.importo, idCommessa: commessa, periodoDa, periodoA });
      }
    }
    // Spese non anticipate (e quelle di prima della fase 3 rimaste solo nel rapportino).
    const sue = [].concat(...lista.map(r => speseDi(r.id)));
    const nonAnticipate = centesimi(sue.filter(s => !s.anticipazione).reduce((t, s) => t + numero(s.importo), 0) +
      lista.reduce((t, r) => t + numero(r.speseSenzaRighe), 0));
    if (nonAnticipate > 0) {
      righe.push({ tipo: 'compenso', descrizione: 'Spese di viaggio e materiale di ' + quando, quantita: 1, unita: '', prezzo: nonAnticipate, importo: nonAnticipate, idCommessa: commessa, periodoDa, periodoA });
    }
    sue.filter(s => s.anticipazione).forEach(s => righe.push(anticipazione(s)));
    gruppi.push({
      gruppo: 'rapportini:' + testo(cliente.id) + ':' + mese, righe,
      sorgenti: lista.map(r => ({ tipo: 'rapportino', id: r.id, importo: importoRapportino(r) }))
        .concat(sue.map(s => ({ tipo: 'spesa', id: String(s.id), importo: centesimi(numero(s.importo)) }))),
    });
  }
  return gruppi;
}

/**
 * La riga di una scadenza di pagamento: "40% a fine progetto: Adeguamento ...
 * (commessa 26ST003, contratto PR/2026/012 rev. 1)", quantita' 1.
 */
function rigaScadenza(s, commessa, contratto) {
  const importo = centesimi(numero(s.importo));
  const tra = '(commessa ' + testo(commessa && commessa.id) + (contratto ? ', contratto ' + contratto : '') + ')';
  return {
    tipo: 'compenso', descrizione: testo(s.descrizione) + (commessa && testo(commessa.descrizione) ? ': ' + testo(commessa.descrizione) : '') + ' ' + tra,
    quantita: 1, unita: '', prezzo: importo, importo, idCommessa: testo(commessa && commessa.id), periodoDa: '', periodoA: '',
  };
}

/** Una spesa al cliente fuori dai rapportini: anticipazione (N1) o compenso ("{descrizione} del {data}"). */
function rigaSpesa(s) {
  const importo = centesimi(numero(s.importo));
  const cosa = testo(s.descrizione) || 'Spesa';
  return s.anticipazione
    ? { tipo: 'anticipazione', descrizione: 'Spesa anticipata per conto del cliente: ' + cosa + ' del ' + dataIt(s.data), quantita: 1, unita: '',
      prezzo: importo, importo, tributoCliente: !!s.tributoCliente, idCommessa: testo(s.idCommessa), periodoDa: '', periodoA: '' }
    : { tipo: 'compenso', descrizione: cosa + ' del ' + dataIt(s.data), quantita: 1, unita: '', prezzo: importo, importo,
      idCommessa: testo(s.idCommessa), periodoDa: '', periodoA: '' };
}

/**
 * Le ore registrate di una commessa, per mese e prezzo: "Ore di lavoro su
 * 26ST045 Quadro capannone di ottobre 2026", quantita' ore, prezzo orario.
 * Senza prezzo: la riga resta senza prezzo (si scrive nella bozza).
 */
function rigaOre(ore, commessa, prezzo, mese) {
  const q = due2(ore);
  const conPrezzo = prezzo !== null && prezzo !== undefined;
  return {
    tipo: 'compenso', descrizione: 'Ore di lavoro su ' + testo(commessa.id) + ' ' + testo(commessa.descrizione) + ' di ' + nomeMese(mese),
    quantita: q, unita: 'ore', prezzo: conPrezzo ? numero(prezzo) : null, importo: conPrezzo ? centesimi(q * numero(prezzo)) : 0,
    idCommessa: testo(commessa.id), periodoDa: '', periodoA: '',
  };
}

// ------------------------------------------------------------------ fase 4: date del pagamento e dei tributi

/** "2026-10-22" + n giorni (anche negativi). */
function giorniDopo(iso, n) {
  const [a, m, g] = String(iso).split('-').map(Number);
  const d = new Date(a, m - 1, g + n, 12);
  return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
}

/** L'ultimo giorno del mese di un giorno. */
function fineMese(iso) {
  const [a, m] = String(iso).split('-').map(Number);
  const d = new Date(a, m, 0, 12);
  return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
}

/** La scadenza di una fattura: data + giorni, poi (se si vuole) alla fine di quel mese. */
function scadenzaFattura(data, giorni, finePerMese) {
  const d = giorniDopo(data, Math.max(0, Math.round(numero(giorni))));
  return finePerMese ? fineMese(d) : d;
}

/** La Pasqua (calcolo gregoriano di Meeus): serve al lunedi' dell'Angelo. */
function pasqua(anno) {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return anno + '-' + due(mese) + '-' + due(giorno);
}

/** Sabato, domenica o festa nazionale (le scadenze fiscali slittano al primo giorno lavorativo). */
function nonLavorativo(iso) {
  const giorno = new Date(iso + 'T12:00:00').getDay();
  if (giorno === 0 || giorno === 6) return true;
  const mg = iso.slice(5);
  if (['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].indexOf(mg) >= 0) return true;
  return iso === giorniDopo(pasqua(Number(iso.slice(0, 4))), 1);
}

/** Il giorno stesso se e' lavorativo, se no il primo dopo. */
function primoLavorativo(iso) {
  let d = iso;
  for (let i = 0; i < 10 && nonLavorativo(d); i++) d = giorniDopo(d, 1);
  return d;
}

/** Il controllo dell'IBAN (ISO 13616, modulo 97): spazi tolti, da 15 a 34 caratteri, l'italiano di 27. */
function ibanValido(v) {
  const s = testo(v).replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.slice(0, 2) === 'IT' && s.length !== 27) return false;
  const giro = s.slice(4) + s.slice(0, 4);
  let resto = 0;
  for (const ch of giro) {
    const n = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const cifra of n) resto = (resto * 10 + Number(cifra)) % 97;
  }
  return resto === 1;
}

module.exports = {
  ELETTRODINAMICA, STATI, STATI_BLOCCATI, regoleDi, calcola, prossimoCodice, RE_CODICE_COMMESSA,
  tariffaProposta, prezzoOrarioDi, costoOrarioDi, budgetDi, partitaIvaItalianaValida,
  importoVoce, vociCheContano, gruppoAlternativa, contiPreventivo,
  minutiDa, oraDaMinuti, oreDaOrari, rimborsoTrasferta, oreDelRapportino, contaNeiConti, rimborsiDovuti, costoCommessa,
  // fase 4
  importoRigaFattura, contiFattura, MESI, nomeMese, numeroIt, euroIt, dataIt, orePagate, importoRapportino, righeRapportini,
  rigaScadenza, rigaSpesa, rigaOre, giorniDopo, fineMese, scadenzaFattura, pasqua, nonLavorativo, primoLavorativo, ibanValido,
};
