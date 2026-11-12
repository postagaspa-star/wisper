/*
 * Servizi e indennita' (12/11/2026, docs/gestionale/servizi.md).
 *
 * Il listino della fase 2 e' l'anagrafica dei servizi coi campi di Flextaxa (il programma con cui Manuel emette le
 * fatture). Le indennita' di un lavoro del rapportino sono servizi congelati quel giorno, con la quantita': un
 * cambio del prezzo nei Servizi non riscrive i rapportini gia' fatti.
 *
 * Qui le regole che servono a piu' parti del server: le unita' e il modo, i tag, il servizio in risposta, le
 * indennita' pulite e il loro importo, e il lettore del CSV che Flextaxa esporta.
 */
'use strict';

const { Rifiuto, testo, numero, numeroONull, centesimi } = require('./utili');

/** Le unita' di misura che si scelgono (quelle di Flextaxa e qualcuna in piu'); se ne puo' scrivere un'altra. */
const UNITA = ['Nr', 'Ore', 'Pz', 'Km', 'Giorni', 'A corpo'];
const ALIQUOTE = [22, 10, 5, 4, 0];
const TIPI = ['servizio', 'prodotto'];

const vuoto = v => v === undefined || v === null || v === '';
const urlFile = id => '/file/' + id;

/** Il modo del preventivo che viene dall'unita': Ore -> ore, A corpo (o niente) -> corpo, le altre -> quantita. */
function modoDaUnita(unita) {
  const u = testo(unita).toLowerCase();
  if (!u || u === 'a corpo' || u === 'corpo') return 'corpo';
  if (u === 'ore' || u === 'ora' || u === 'h') return 'ore';
  return 'quantita';
}

/** I tag come elenco: da un elenco o da "trasferta, cantiere" (senza vuoti ne' doppioni, maiuscole a parte). */
function tagDa(v) {
  const l = Array.isArray(v) ? v : String(v === undefined || v === null ? '' : v).split(/[,;\n]/);
  const visti = new Set();
  const out = [];
  for (const x of l) {
    const t = testo(x).replace(/\s+/g, ' ');
    if (!t || visti.has(t.toLowerCase())) continue;
    visti.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/** Un'aliquota IVA in percento (22, 10...): dal numero o da "22,00%"; vuota = di base. */
function aliquotaDa(v, base) {
  if (vuoto(v)) return base;
  const n = typeof v === 'number' ? v : numero(String(v).replace('%', '').trim().replace(/\./g, '').replace(',', '.'));
  if (!(n >= 0) || n > 100) throw new Rifiuto('Aliquota IVA: scrivi un numero fra 0 e 100');
  return Math.round(n * 100) / 100;
}

/** Il servizio come lo leggono le app (servizi.md §1). */
function servizioDaRiga(r) {
  return {
    id: r.id, codice: r.codice, nome: r.nome, descrizione: r.descrizione, modo: r.modo, unita: r.unita,
    prezzo: numeroONull(r.prezzo), attivo: r.attivo === 1, ordine: r.ordine,
    tipo: r.tipo || 'servizio', aliquotaIva: r.aliquota_iva === undefined || r.aliquota_iva === null ? 22 : numero(r.aliquota_iva),
    prezzoAcquisto: numeroONull(r.prezzo_acquisto), aliquotaAcquisto: r.aliquota_acquisto === undefined || r.aliquota_acquisto === null ? 22 : numero(r.aliquota_acquisto),
    fornitore: testo(r.fornitore), tag: tagDa(r.tag), note: testo(r.note),
    immagine: testo(r.immagine) ? { id: r.immagine, url: urlFile(r.immagine) } : null,
    modificato: r.modificato || '',
  };
}

/** L'importo di un'indennita': quantita' (vuota = 1) per prezzo, al centesimo. */
function importoDi(x) {
  const q = vuoto(x.quantita) ? 1 : numero(x.quantita);
  return centesimi(q * numero(x.prezzo));
}

/** La somma delle indennita' di un lavoro (ognuna gia' al centesimo). */
function importoIndennita(lista) {
  return centesimi((lista || []).reduce((t, x) => t + importoDi(x), 0));
}

/** Le indennita' salvate nel lavoro (la colonna JSON), [] se vuota o rotta. */
function indennitaDi(r) {
  const s = testo(r && r.indennita);
  if (!s) return [];
  try {
    const l = JSON.parse(s);
    return Array.isArray(l) ? l : [];
  } catch (e) {
    return [];
  }
}

/** L'indennita' come la leggono le app: i campi del servizio, la quantita' e l'importo. */
function indennitaInRisposta(x) {
  return {
    idServizio: vuoto(x.idServizio) ? null : x.idServizio, codice: testo(x.codice), descrizione: testo(x.descrizione),
    quantita: vuoto(x.quantita) ? 1 : numero(x.quantita), unita: testo(x.unita), prezzo: numeroONull(x.prezzo),
    aliquotaIva: vuoto(x.aliquotaIva) ? 22 : numero(x.aliquotaIva), tipo: x.tipo === 'prodotto' ? 'prodotto' : 'servizio',
    prezzoAcquisto: numeroONull(x.prezzoAcquisto), aliquotaAcquisto: vuoto(x.aliquotaAcquisto) ? 22 : numero(x.aliquotaAcquisto),
    fornitore: testo(x.fornitore), tag: tagDa(x.tag), note: testo(x.note),
    immagine: x.immagine && x.immagine.id ? { id: x.immagine.id, url: urlFile(x.immagine.id) } : (typeof x.immagine === 'string' && x.immagine ? { id: x.immagine, url: urlFile(x.immagine) } : null),
    importo: importoDi(x),
  };
}

/**
 * Le indennita' pulite di un lavoro che si salva.
 * @param lista     quelle che arrivano (undefined = il lavoro non le porta: restano le vecchie)
 * @param vecchie   quelle che il lavoro aveva
 * @param servizio  id -> riga del listino (o null)
 * @param vedeCosti chi salva vede i soldi; senza, il prezzo resta quello che l'indennita' aveva (stessa posizione e
 *                  stesso servizio) o quello del servizio
 */
function pulisciIndennita(lista, vecchie, servizio, vedeCosti) {
  if (lista === undefined || lista === null) return vecchie || [];
  if (!Array.isArray(lista)) throw new Rifiuto('Indennità: serve un elenco');
  return lista.map((x0, i) => {
    const x = x0 || {};
    const idServizio = vuoto(x.idServizio) ? null : Number(x.idServizio);
    const s = idServizio ? servizio(idServizio) : null;
    if (idServizio && !s) throw new Rifiuto('Indennità ' + (i + 1) + ': il servizio ' + idServizio + ' non c\'è');
    const descrizione = testo(x.descrizione) || (s ? s.nome : '');
    if (!descrizione) throw new Rifiuto('Indennità ' + (i + 1) + ': scrivi la descrizione');
    const quantita = vuoto(x.quantita) ? 1 : numero(x.quantita);
    if (!(quantita >= 0)) throw new Rifiuto('Indennità ' + (i + 1) + ': la quantità non può essere negativa');
    let prezzo;
    let prezzoAcquisto;
    if (vedeCosti) {
      prezzo = vuoto(x.prezzo) ? (s ? numeroONull(s.prezzo) : null) : numero(x.prezzo);
      prezzoAcquisto = vuoto(x.prezzoAcquisto) ? null : numero(x.prezzoAcquisto);
    } else {
      const v = (vecchie || [])[i];
      const stessa = v && String(v.idServizio || '') === String(idServizio || '');
      prezzo = stessa && !vuoto(v.prezzo) ? numero(v.prezzo) : (s ? numeroONull(s.prezzo) : null);
      prezzoAcquisto = stessa && !vuoto(v.prezzoAcquisto) ? numero(v.prezzoAcquisto) : (s ? numeroONull(s.prezzo_acquisto) : null);
    }
    if (prezzo === null) throw new Rifiuto('Indennità ' + (i + 1) + ': scrivi il prezzo');
    if (prezzo < 0) throw new Rifiuto('Indennità ' + (i + 1) + ': il prezzo non può essere negativo');
    const immagine = x.immagine && typeof x.immagine === 'object' ? testo(x.immagine.id) : testo(x.immagine);
    const pulita = {
      idServizio, codice: vuoto(x.codice) && s ? s.codice : testo(x.codice), descrizione, quantita,
      unita: vuoto(x.unita) && s ? s.unita : testo(x.unita), prezzo,
      aliquotaIva: aliquotaDa(x.aliquotaIva, s ? numero(s.aliquota_iva) : 22),
      tipo: x.tipo === 'prodotto' || (vuoto(x.tipo) && s && s.tipo === 'prodotto') ? 'prodotto' : 'servizio',
      prezzoAcquisto, aliquotaAcquisto: aliquotaDa(x.aliquotaAcquisto, s ? numero(s.aliquota_acquisto) : 22),
      fornitore: x.fornitore === undefined && s ? testo(s.fornitore) : testo(x.fornitore),
      tag: tagDa(x.tag === undefined && s ? s.tag : x.tag), note: x.note === undefined && s ? testo(s.note) : testo(x.note),
      immagine: immagine || (x.immagine === undefined && s ? testo(s.immagine) : ''),
    };
    pulita.importo = importoDi(pulita);
    return pulita;
  });
}

/** Le indennita' per la colonna JSON (senza vuoti). */
function indennitaPerDb(lista) {
  return lista && lista.length ? JSON.stringify(lista) : '';
}

// ------------------------------------------------------------------ il CSV di Flextaxa

/** Un campo del CSV di Flextaxa (separatore ";", virgolette doppie, "" dentro). */
function righeCsv(t) {
  const righe = [];
  let riga = [];
  let campo = '';
  let dentro = false;
  const s = String(t || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (dentro) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') dentro = false; else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ';') { riga.push(campo); campo = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      riga.push(campo); campo = '';
      if (riga.some(x => x.trim())) righe.push(riga);
      riga = [];
    } else campo += c;
  }
  riga.push(campo);
  if (riga.some(x => x.trim())) righe.push(riga);
  return righe;
}

/** "€ 1.234,56" -> 1234.56; vuoto -> null. */
function euroDa(v) {
  const s = testo(v).replace(/€/g, '').replace(/\s/g, '');
  if (!s) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

/**
 * I servizi del CSV che Flextaxa esporta (Tipo;Descrizione;Codice;Fornitore;UM;Prezzo acquisto;Prezzo vendita;
 * Aliquota;Prezzo vendita con IVA;Tags;Note), come li vuole salvaVoceListino.
 */
function serviziDaCsv(t) {
  const righe = righeCsv(t);
  if (!righe.length) return [];
  const testa = righe[0].map(x => testo(x).toLowerCase());
  const col = parola => testa.findIndex(x => x.indexOf(parola) >= 0);
  const c = {
    tipo: col('tipo'), descrizione: col('descrizione'), codice: col('codice'), fornitore: col('fornitore'), um: testa.indexOf('um'),
    acquisto: col('prezzo acquisto'), vendita: testa.findIndex(x => x.indexOf('prezzo vendita') >= 0 && x.indexOf('senza iva') >= 0),
    aliquota: col('aliquota'), tag: col('tag'), note: col('note'),
  };
  if (c.descrizione < 0 || c.vendita < 0) throw new Rifiuto('Il file non sembra l\'esportazione dei prodotti e servizi di Flextaxa');
  const v = (r, i) => (i >= 0 ? testo(r[i]) : '');
  return righe.slice(1).map(r => {
    const unita = v(r, c.um);
    return {
      tipo: /prodott/i.test(v(r, c.tipo)) ? 'prodotto' : 'servizio',
      nome: v(r, c.descrizione), codice: v(r, c.codice), fornitore: v(r, c.fornitore),
      unita: unita || 'A corpo', modo: modoDaUnita(unita),
      prezzoAcquisto: euroDa(v(r, c.acquisto)), prezzo: euroDa(v(r, c.vendita)),
      aliquotaIva: v(r, c.aliquota) ? aliquotaDa(v(r, c.aliquota), 22) : 22,
      tag: tagDa(v(r, c.tag)), note: v(r, c.note),
    };
  }).filter(s => s.nome);
}

module.exports = {
  UNITA, ALIQUOTE, TIPI, modoDaUnita, tagDa, aliquotaDa, servizioDaRiga, importoDi, importoIndennita, indennitaDi,
  indennitaInRisposta, pulisciIndennita, indennitaPerDb, righeCsv, euroDa, serviziDaCsv,
};
