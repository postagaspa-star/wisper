/*
 * I conti: le stesse funzioni di apps-script/Code.gs (regoleDi, calcola) e di
 * pc/ui/conti.js (budget della commessa), riga per riga. I casi di prova sono
 * gli stessi (apps-script/prove/casi-calcolo.json): telefono, computer e server
 * devono dare lo stesso totale al centesimo.
 */
'use strict';

const { numero, numeroONull, normalizza, centesimi, testo } = require('./utili');

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

module.exports = {
  ELETTRODINAMICA, STATI, STATI_BLOCCATI, regoleDi, calcola, prossimoCodice, RE_CODICE_COMMESSA,
  tariffaProposta, prezzoOrarioDi, costoOrarioDi, budgetDi, partitaIvaItalianaValida,
};
