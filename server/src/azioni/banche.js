/*
 * Banche e scadenze (fase4.md §10): conti, saldo, movimenti scritti a mano,
 * incassi e pagamenti (anche in parte) abbinati a fatture, ricevute e impegni,
 * tributi e F24 (anche ricorrenti, e le proposte di Wisper), scadenziario col
 * saldo previsto prudente, situazione finanziaria.
 *
 * Tre livelli sempre distinti, con la parola: PREVISTO (una scadenza aperta:
 * nessun movimento), REGISTRATO (movimento scritto), VERIFICATO IN BANCA
 * (movimento con la spunta "l'ho visto sull'estratto conto"). Il collegamento
 * alla banca e l'import degli estratti conto non ci sono: "Non collegato".
 *
 * Nessun movimento e nessun impegno si cancella: si annulla, col motivo.
 */
'use strict';

const { Rifiuto, testo, numero, numeroONull, centesimi, adesso, oggi, dataIso, dataDaIso, dataOraIso } = require('../utili');
const C = require('../conti');
const { diverso } = require('./ore');

const si = v => v === true || v === 1 || v === '1' || v === 'true';
const vuoto = v => v === undefined || v === null || v === '';
const PER_PAGINA = 100;
const CATEGORIE = ['incasso', 'pagamento', 'tributo', 'stipendio', 'giroconto', 'altro'];
const TIPI_IMPEGNO = ['f24', 'tributo', 'rata', 'altro'];
const MESI_AVANTI = 12;
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
/** "Lunedì 26 ottobre". */
const giornoTitolo = iso => {
  const g = GIORNI[new Date(iso + 'T12:00:00').getDay()];
  return g.charAt(0).toUpperCase() + g.slice(1) + ' ' + Number(iso.slice(8, 10)) + ' ' + C.MESI[Number(iso.slice(5, 7)) - 1];
};
const dataBreve = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
const giorniTra = (da, a) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(da + 'T12:00:00')) / 86400000);
/** Il motivo con cui Wisper toglie una sua proposta che non serve piu' (una tolta dalla persona ha il suo). */
const MOTIVO_AUTO = 'proposta di Wisper che non serve più';
const ultime = iban => (testo(iban) ? testo(iban).replace(/\s/g, '').slice(-4) : '');

/** "ogni mese", "ogni 3 mesi", "ogni anno". */
function ripete(r) {
  if (!r) return '';
  const n = Math.max(1, r.ogni || 1);
  if (r.regola === 'anni') return n === 1 ? 'ogni anno' : 'ogni ' + n + ' anni';
  if (r.regola === 'mesi') return n === 1 ? 'ogni mese' : 'ogni ' + n + ' mesi';
  if (r.regola === 'settimane') return n === 1 ? 'ogni settimana' : 'ogni ' + n + ' settimane';
  return n === 1 ? 'ogni giorno' : 'ogni ' + n + ' giorni';
}

/** Il giorno "giorno" del mese (meseIndice da 0); se il mese e' piu' corto, l'ultimo. */
function giornoDelMese(anno, meseIndice, giorno) {
  const a = anno + Math.floor(meseIndice / 12);
  const m = ((meseIndice % 12) + 12) % 12;
  const ultimo = new Date(a, m + 1, 0).getDate();
  return a + '-' + String(m + 1).padStart(2, '0') + '-' + String(Math.min(giorno, ultimo)).padStart(2, '0');
}

/** I giorni di una serie di impegni (ogni N mesi o anni) fra l'inizio e "finoA", fermandosi alla sua fine. */
function giorniSerie(ric, finoA) {
  const fine = ric.fine && ric.fine < finoA ? ric.fine : finoA;
  const out = [];
  if (!ric.inizio || fine < ric.inizio) return out;
  const [a, m, g] = ric.inizio.split('-').map(Number);
  const ogni = Math.max(1, ric.ogni || 1);
  for (let k = 0; k < 2000; k += ogni) {
    const d = ric.regola === 'anni' ? giornoDelMese(a + k, m - 1, g) : giornoDelMese(a, m - 1 + k, g);
    if (d > fine) break;
    out.push(d);
  }
  return out;
}

module.exports = {
  // ------------------------------------------------------------------ conti e saldo (§10.1)

  rigaConto(id) {
    const c = this.db.riga('SELECT * FROM conti WHERE id = ?', Number(id) || 0);
    if (!c) throw new Rifiuto('Conto ' + testo(id) + ' non trovato');
    return c;
  },

  /**
   * Il saldo di un conto oggi: l'ultimo saldo scritto (letto sull'estratto
   * conto) + entrate - uscite dei movimenti non annullati DOPO quel giorno. E'
   * "registrato", non "verificato".
   */
  saldoConto(c, finoA) {
    const scritto = this.db.riga('SELECT * FROM conto_saldi WHERE conto_id = ? ORDER BY data DESC, id DESC LIMIT 1', c.id);
    const da = scritto ? scritto.data : '';
    const movimenti = this.db.righe('SELECT * FROM movimenti WHERE conto_id = ? AND annullato = 0 AND data > ?' + (finoA ? ' AND data <= ?' : ''),
      c.id, da, ...(finoA ? [finoA] : []));
    const saldo = centesimi(movimenti.reduce((t, m) => t + (m.verso === 'entrata' ? 1 : -1) * numero(m.importo), scritto ? numero(scritto.saldo) : 0));
    return {
      saldo, saldoAl: da, saldoScritto: scritto ? scritto.saldo : null, movimentiDopo: movimenti.length,
      verificatiDopo: movimenti.filter(m => m.verificato === 1).length,
    };
  },

  contoDaRiga(c) {
    const s = this.saldoConto(c);
    const o = {
      id: c.id, nome: c.nome, banca: c.banca, ultimeCifre: ultime(c.iban), predefinito: c.predefinito === 1,
      soglia: c.soglia === null ? null : c.soglia, attivo: c.attivo === 1, note: c.note,
      saldo: s.saldo, saldoAl: s.saldoAl, saldoScritto: s.saldoScritto, movimentiDopo: s.movimentiDopo, verificatiDopo: s.verificatiDopo,
      collegamento: 'non_collegato', creato: dataOraIso(c.creato), modificato: dataOraIso(c.modificato),
    };
    // L'IBAN intero solo a chi scrive in Banche (serve al prospetto e al modulo del conto).
    if (this.livello('banche') >= 2) o.iban = testo(c.iban);
    return o;
  },

  /** conti {tutti?} (§11.5): i conti attivi (tutti = anche quelli chiusi). */
  leggiConti(d) {
    return this.db.righe('SELECT * FROM conti' + (si(d && d.tutti) ? '' : ' WHERE attivo = 1') + ' ORDER BY predefinito DESC, id').map(c => this.contoDaRiga(c));
  },

  /** salvaConto {conto: {id?, nome, banca?, iban?, predefinito?, soglia?, attivo?, note?}}. Il primo conto e' il predefinito. */
  salvaConto(d) {
    const x = d.conto || d;
    const prima = testo(x.id) ? this.rigaConto(x.id) : null;
    const v = {};
    if (x.nome !== undefined || !prima) {
      v.nome = testo(x.nome);
      if (!v.nome) throw new Rifiuto('Nome: scrivi il nome del conto');
    }
    if (x.banca !== undefined) v.banca = testo(x.banca);
    if (x.iban !== undefined) {
      const iban = testo(x.iban).replace(/\s/g, '').toUpperCase();
      if (iban && !C.ibanValido(iban)) throw new Rifiuto('IBAN: non sembra giusto');
      v.iban = iban;
    }
    if (x.soglia !== undefined) {
      v.soglia = vuoto(x.soglia) ? null : centesimi(numero(x.soglia));
      if (v.soglia !== null && v.soglia < 0) throw new Rifiuto('Soglia: non può essere negativa');
    }
    if (x.attivo !== undefined) v.attivo = si(x.attivo) ? 1 : 0;
    if (x.note !== undefined) v.note = testo(x.note);
    const ora = adesso();
    const nessuno = !this.db.riga('SELECT id FROM conti WHERE predefinito = 1');
    const predefinito = x.predefinito !== undefined ? si(x.predefinito) : (prima ? prima.predefinito === 1 : nessuno);
    if (predefinito) {
      for (const c of this.db.righe('SELECT id FROM conti WHERE predefinito = 1 AND id <> ?', prima ? prima.id : 0)) this.aggiorna('conti', c.id, { predefinito: 0, modificato: ora });
    }
    v.predefinito = predefinito ? 1 : 0;
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('conti', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('conti', Object.assign({ banca: '', iban: '', attivo: 1, note: '', creato: ora, modificato: ora }, v));
    }
    return { ok: true, conto: this.contoDaRiga(this.rigaConto(id)) };
  },

  /** aggiornaSaldo {idConto, data?, saldo}: il saldo letto in banca quel giorno. */
  aggiornaSaldo(d) {
    const c = this.rigaConto(d.idConto);
    if (vuoto(d.saldo)) throw new Rifiuto('Saldo: scrivi il saldo letto in banca');
    const data = d.data ? dataDaIso(d.data) : oggi();
    if (data > oggi()) throw new Rifiuto('Data: il saldo letto in banca non può essere di un giorno che deve ancora venire');
    const ch = this.chi();
    this.inserisci('conto_saldi', { conto_id: c.id, data, saldo: centesimi(numero(d.saldo)), utente_id: ch.utente ? ch.utente.id : null, creato: adesso() });
    return { ok: true, conto: this.contoDaRiga(c) };
  },

  // ------------------------------------------------------------------ movimenti e abbinamenti (§10.2)

  rigaMovimento(id) {
    const m = this.db.riga('SELECT * FROM movimenti WHERE id = ?', Number(id) || 0);
    if (!m) throw new Rifiuto('Movimento ' + testo(id) + ' non trovato');
    return m;
  },

  /** Un abbinamento come lo vedono le app: {tipo, id, etichetta, importo}. */
  abbinamentoDaRiga(a) {
    if (a.fattura_id) {
      const f = this.db.riga('SELECT * FROM fatture WHERE id = ?', a.fattura_id);
      return { tipo: 'fattura', id: a.fattura_id, etichetta: f ? this.etichettaFattura(f) : 'W-' + a.fattura_id, importo: a.importo };
    }
    if (a.ricevuta_id) {
      const r = this.db.riga('SELECT r.numero, s.nome FROM fatture_ricevute r LEFT JOIN soggetti s ON s.id = r.fornitore_id WHERE r.id = ?', a.ricevuta_id);
      return { tipo: 'ricevuta', id: a.ricevuta_id, etichetta: r ? (r.numero + ' · ' + (r.nome || '')) : String(a.ricevuta_id), importo: a.importo };
    }
    const i = this.db.riga('SELECT descrizione, scadenza FROM impegni WHERE id = ?', a.impegno_id);
    return { tipo: 'impegno', id: a.impegno_id, etichetta: i ? i.descrizione + ' · ' + dataBreve(i.scadenza) : String(a.impegno_id), importo: a.importo };
  },

  movimentoDaRiga(m, nomi) {
    nomi = nomi || this.nomiBanche();
    return {
      id: m.id, idConto: m.conto_id, conto: nomi.conti[m.conto_id] || '', data: m.data, verso: m.verso, importo: m.importo, descrizione: m.descrizione,
      idSoggetto: m.soggetto_id, soggetto: m.soggetto_id ? nomi.soggetti[m.soggetto_id] || '' : '', categoria: m.categoria,
      verificato: m.verificato === 1, verificatoIl: dataOraIso(m.verificato_il), livello: m.verificato === 1 ? 'verificato' : 'registrato',
      abbinamenti: this.db.righe('SELECT * FROM movimento_abbinamenti WHERE movimento_id = ? ORDER BY id', m.id).map(a => this.abbinamentoDaRiga(a)),
      annullato: m.annullato === 1, motivo: m.motivo, puoScrivere: this.livello('banche') >= 2 && m.annullato !== 1,
      creato: dataOraIso(m.creato), modificato: dataOraIso(m.modificato),
    };
  },

  nomiBanche() {
    const n = { conti: {}, soggetti: {} };
    this.db.righe('SELECT * FROM conti').forEach(c => { n.conti[c.id] = this.nomeConto(c); });
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { n.soggetti[s.id] = s.nome; });
    return n;
  },

  /**
   * movimenti {da?, a?, idConto?, verso?, categoria?, verificato?, testo?,
   * annullati?, pagina?}: i piu' recenti prima, 100 per pagina. testo cerca in
   * descrizione, soggetto e importo ("500" e "500,00").
   */
  leggiMovimenti(d) {
    d = d || {};
    const cond = [];
    const par = [];
    if (!si(d.annullati)) cond.push('annullato = 0');
    if (testo(d.da)) { cond.push('data >= ?'); par.push(dataDaIso(d.da)); }
    if (testo(d.a)) { cond.push('data <= ?'); par.push(dataDaIso(d.a)); }
    if (testo(d.idConto)) { cond.push('conto_id = ?'); par.push(Number(d.idConto)); }
    if (testo(d.verso)) { cond.push('verso = ?'); par.push(testo(d.verso)); }
    if (testo(d.categoria)) { cond.push('categoria = ?'); par.push(testo(d.categoria)); }
    if (d.verificato !== undefined && testo(d.verificato) !== '') { cond.push('verificato = ?'); par.push(si(d.verificato) ? 1 : 0); }
    const nomi = this.nomiBanche();
    let righe = this.db.righe('SELECT * FROM movimenti' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') + ' ORDER BY data DESC, id DESC', ...par);
    const cerca = testo(d.testo).toLowerCase();
    if (cerca) {
      const cifra = cerca.replace(/\./g, '').replace(',', '.');
      righe = righe.filter(m => [m.descrizione, nomi.soggetti[m.soggetto_id] || ''].some(x => String(x).toLowerCase().indexOf(cerca) >= 0) ||
        (/^\d+(\.\d+)?$/.test(cifra) && (String(m.importo) === String(Number(cifra)) || C.euroIt(m.importo).indexOf(cerca) >= 0)));
    }
    const pagine = Math.max(1, Math.ceil(righe.length / PER_PAGINA));
    const pagina = Math.min(Math.max(1, Math.round(numero(d.pagina)) || 1), pagine);
    const entrate = centesimi(righe.filter(m => m.verso === 'entrata' && m.annullato === 0).reduce((t, m) => t + m.importo, 0));
    const uscite = centesimi(righe.filter(m => m.verso === 'uscita' && m.annullato === 0).reduce((t, m) => t + m.importo, 0));
    return {
      ok: true, pagina, pagine, quante: righe.length, entrate, uscite, daVerificare: righe.filter(m => m.verificato !== 1 && m.annullato === 0).length,
      importaEstrattoConto: 'non_collegato',
      movimenti: righe.slice((pagina - 1) * PER_PAGINA, pagina * PER_PAGINA).map(m => this.movimentoDaRiga(m, nomi)),
    };
  },

  /** Il residuo di quello a cui si abbina (fattura, ricevuta, impegno), senza contare un movimento (quello che si sta cambiando). */
  residuoDi(tipo, id, tranneMovimento) {
    const altri = this.db.riga('SELECT COALESCE(SUM(a.importo), 0) s FROM movimento_abbinamenti a JOIN movimenti m ON m.id = a.movimento_id WHERE m.annullato = 0 AND a.' +
      tipo + '_id = ? AND a.movimento_id <> ?', id, tranneMovimento || 0).s;
    if (tipo === 'fattura') {
      const f = this.db.riga('SELECT * FROM fatture WHERE id = ?', id);
      if (!f) throw new Rifiuto('Fattura ' + id + ' non trovata');
      if (f.tipo !== 'fattura' || ['bozza', 'pronta', 'emessa'].indexOf(f.stato) < 0) throw new Rifiuto('La fattura ' + this.etichettaFattura(f) + ' non si incassa');
      const note = this.db.riga("SELECT COALESCE(SUM(netto), 0) s FROM fatture WHERE tipo = 'nota' AND stato = 'emessa' AND fattura_collegata_id = ?", id).s;
      return { residuo: Math.max(0, centesimi(numero(f.netto) - note - altri)), etichetta: 'La fattura ' + (f.numero || f.riferimento), verbo: 'da incassare', riga: f };
    }
    if (tipo === 'ricevuta') {
      const r = this.db.riga('SELECT r.*, s.nome fornitore FROM fatture_ricevute r LEFT JOIN soggetti s ON s.id = r.fornitore_id WHERE r.id = ?', id);
      if (!r || r.stato !== 'attiva' || r.tipo_documento === 'TD04') throw new Rifiuto('Fattura ricevuta ' + id + ' non trovata');
      const note = this.db.riga("SELECT COALESCE(SUM(netto), 0) s FROM fatture_ricevute WHERE ricevuta_collegata_id = ? AND stato = 'attiva'", id).s;
      return { residuo: Math.max(0, centesimi(numero(r.netto) - note - altri)), etichetta: 'La fattura ' + r.numero + ' di ' + (r.fornitore || ''), verbo: 'da pagare', riga: r };
    }
    const i = this.db.riga('SELECT * FROM impegni WHERE id = ?', id);
    if (!i || i.annullato === 1) throw new Rifiuto('Impegno ' + id + ' non trovato');
    return { residuo: i.importo === null ? null : Math.max(0, centesimi(numero(i.importo) - altri)), etichetta: 'L\'impegno «' + i.descrizione + '»', verbo: 'da pagare', riga: i };
  },

  /** Controlla e scrive gli abbinamenti di un movimento (l'elenco intero). */
  scriviAbbinamenti(mov, lista) {
    const vecchi = this.db.righe('SELECT * FROM movimento_abbinamenti WHERE movimento_id = ?', mov.id);
    let somma = 0;
    const nuovi = [];
    for (const x of lista) {
      const tipo = testo(x && x.tipo);
      if (['fattura', 'ricevuta', 'impegno'].indexOf(tipo) < 0) throw new Rifiuto('Abbina a: fattura, ricevuta o impegno');
      const importo = centesimi(numero(x.importo));
      if (!(importo > 0)) throw new Rifiuto('Abbinamento: scrivi quanto');
      const r = this.residuoDi(tipo, Number(x.id), mov.id);
      if (tipo === 'fattura' && mov.verso !== 'entrata') throw new Rifiuto('Una fattura si abbina a un\'entrata');
      if (tipo === 'ricevuta' && mov.verso !== 'uscita') throw new Rifiuto('Una fattura ricevuta si abbina a un\'uscita');
      if (tipo === 'impegno' && r.riga.verso !== mov.verso) throw new Rifiuto('L\'impegno «' + r.riga.descrizione + '» è ' + (r.riga.verso === 'entrata' ? 'un\'entrata' : 'un\'uscita'));
      if (r.residuo !== null && importo > r.residuo + 0.001) {
        throw new Rifiuto(r.etichetta + ' ha ancora ' + r.verbo + ' ' + C.euroIt(r.residuo) + ': non puoi abbinarne ' + C.euroIt(importo));
      }
      somma = centesimi(somma + importo);
      nuovi.push({ tipo, id: Number(x.id), importo });
    }
    if (somma > centesimi(mov.importo) + 0.001) throw new Rifiuto('Hai abbinato ' + C.euroIt(somma) + ' su un movimento di ' + C.euroIt(mov.importo));
    for (const a of vecchi) {
      this.db.esegui('DELETE FROM movimento_abbinamenti WHERE id = ?', a.id);
      this.annota('movimento_abbinamenti', a.id, Object.assign({}, a), null, 'tolto');
    }
    for (const a of nuovi) {
      this.inserisci('movimento_abbinamenti', { movimento_id: mov.id, [a.tipo + '_id']: a.id, importo: a.importo, creato: adesso() });
      // Un impegno senza importo prende quello pagato; una proposta pagata e' confermata.
      if (a.tipo === 'impegno') {
        const i = this.db.riga('SELECT * FROM impegni WHERE id = ?', a.id);
        const v = {};
        if (i.importo === null) v.importo = a.importo;
        if (i.confermato !== 1) v.confermato = 1;
        if (Object.keys(v).length) this.aggiorna('impegni', i.id, Object.assign(v, { modificato: adesso() }), 'id', 'pagato');
      }
    }
  },

  /**
   * salvaMovimento {movimento: {id?, idConto, data, verso, importo, descrizione?,
   * idSoggetto?, categoria?, verificato?, abbinamenti?: [{tipo, id, importo}]}}.
   */
  salvaMovimento(d) {
    const x = d.movimento || d;
    const prima = testo(x.id) ? this.rigaMovimento(x.id) : null;
    if (prima && prima.annullato === 1) throw new Rifiuto('Il movimento è annullato: non si cambia');
    const idConto = x.idConto !== undefined ? x.idConto : prima ? prima.conto_id : null;
    if (vuoto(idConto)) throw new Rifiuto('Conto: scegli il conto');
    const conto = this.rigaConto(idConto);
    const verso = x.verso !== undefined ? testo(x.verso) : prima ? prima.verso : '';
    if (['entrata', 'uscita'].indexOf(verso) < 0) throw new Rifiuto('Entrata o uscita?');
    const importo = x.importo !== undefined ? centesimi(numero(x.importo)) : prima ? prima.importo : 0;
    if (!(importo > 0)) throw new Rifiuto('Importo: scrivi quanto');
    const categoria = x.categoria !== undefined ? testo(x.categoria) || 'altro' : prima ? prima.categoria : (verso === 'entrata' ? 'incasso' : 'pagamento');
    if (CATEGORIE.indexOf(categoria) < 0) throw new Rifiuto('Categoria: ' + CATEGORIE.slice(0, -1).join(', ') + ' o altro');
    const idSoggetto = x.idSoggetto !== undefined ? testo(x.idSoggetto) : prima ? prima.soggetto_id : '';
    if (idSoggetto && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', idSoggetto)) throw new Rifiuto('Soggetto ' + idSoggetto + ' non trovato');
    const ora = adesso();
    const ch = this.chi();
    const v = {
      conto_id: conto.id, data: x.data !== undefined ? dataDaIso(x.data) : prima ? prima.data : oggi(), verso, importo, categoria, soggetto_id: idSoggetto,
      descrizione: x.descrizione !== undefined ? testo(x.descrizione) : prima ? prima.descrizione : '',
    };
    if (x.verificato !== undefined) {
      const ver = si(x.verificato);
      if (!prima || (prima.verificato === 1) !== ver) Object.assign(v, { verificato: ver ? 1 : 0, verificato_il: ver ? ora : '', verificato_da: ver && ch.utente ? ch.utente.id : null });
    }
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('movimenti', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('movimenti', Object.assign({ verificato: 0, utente_id: ch.utente ? ch.utente.id : null, creato: ora, modificato: ora }, v));
    }
    const mov = this.rigaMovimento(id);
    if (Array.isArray(x.abbinamenti)) this.scriviAbbinamenti(mov, x.abbinamenti);
    else if (prima) {
      // Gli abbinamenti che c'erano restano: devono stare ancora dentro il movimento cambiato.
      const somma = centesimi(this.db.righe('SELECT importo FROM movimento_abbinamenti WHERE movimento_id = ?', id).reduce((t, a) => t + a.importo, 0));
      if (somma > centesimi(mov.importo) + 0.001) throw new Rifiuto('Hai abbinato ' + C.euroIt(somma) + ' su un movimento di ' + C.euroIt(mov.importo));
      if (mov.verso !== prima.verso && somma > 0) throw new Rifiuto('Il movimento è abbinato: per cambiare entrata o uscita togli prima gli abbinamenti');
    }
    this.aggiornaProposte();
    return { ok: true, movimento: this.movimentoDaRiga(this.rigaMovimento(id)) };
  },

  /** Il conto scelto, o il predefinito; senza conti: errore che dice dove crearlo. */
  contoPer(idConto) {
    if (!vuoto(idConto)) return this.rigaConto(idConto);
    const c = this.contoPredefinito();
    if (!c) throw new Rifiuto('Conto: prima scrivi il conto in Banche e scadenze › Conti');
    return c;
  },

  /** segnaIncasso {idFattura, importo?, data?, idConto?, verificato?}: il movimento gia' abbinato (importo di base = residuo). */
  segnaIncasso(d) {
    const f = this.rigaFattura(d.idFattura);
    const r = this.residuoDi('fattura', f.id);
    if (!(r.residuo > 0)) throw new Rifiuto('La fattura ' + this.etichettaFattura(f) + ' è già pagata');
    const importo = vuoto(d.importo) ? r.residuo : centesimi(numero(d.importo));
    if (!(importo > 0)) throw new Rifiuto('Importo: scrivi quanto');
    const conto = this.contoPer(d.idConto);
    const cliente = this.db.riga('SELECT nome FROM soggetti WHERE id = ?', f.cliente_id);
    const parte = importo < r.residuo - 0.001;
    const m = this.salvaMovimento({ movimento: {
      idConto: conto.id, data: d.data || oggi(), verso: 'entrata', importo, categoria: 'incasso', idSoggetto: f.cliente_id,
      descrizione: 'Incasso ' + (cliente ? cliente.nome : f.cliente_id) + ', ' + (f.stato === 'emessa' ? 'fattura ' + (f.numero || f.riferimento) : f.riferimento) + (parte ? ' (in parte)' : ''),
      verificato: si(d.verificato), abbinamenti: [{ tipo: 'fattura', id: f.id, importo }],
    } });
    return { ok: true, movimento: m.movimento, fattura: this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id)) };
  },

  /** segnaPagamento {idRicevuta?|idImpegno?, importo?, data?, idConto?, verificato?}. */
  segnaPagamento(d) {
    const tipo = testo(d.idRicevuta) ? 'ricevuta' : testo(d.idImpegno) ? 'impegno' : '';
    if (!tipo) throw new Rifiuto('Scegli cosa hai pagato: una fattura ricevuta o un impegno');
    const id = Number(tipo === 'ricevuta' ? d.idRicevuta : d.idImpegno);
    const r = this.residuoDi(tipo, id);
    if (r.residuo !== null && !(r.residuo > 0)) throw new Rifiuto(r.etichetta + ' è già pagat' + (tipo === 'impegno' ? 'o' : 'a'));
    let importo = vuoto(d.importo) ? r.residuo : centesimi(numero(d.importo));
    if (importo === null || !(importo > 0)) throw new Rifiuto('Importo: scrivi quanto');
    importo = centesimi(importo);
    const conto = this.contoPer(d.idConto);
    const riga = r.riga;
    const descrizione = tipo === 'ricevuta'
      ? 'Pagamento ' + (riga.fornitore || '') + ', fattura ' + riga.numero + (r.residuo !== null && importo < r.residuo - 0.001 ? ' (in parte)' : '')
      : riga.descrizione;
    const m = this.salvaMovimento({ movimento: {
      idConto: conto.id, data: d.data || oggi(), verso: tipo === 'impegno' ? riga.verso : 'uscita', importo,
      categoria: tipo === 'ricevuta' ? 'pagamento' : (riga.tipo === 'f24' || riga.tipo === 'tributo' ? 'tributo' : 'pagamento'),
      idSoggetto: tipo === 'ricevuta' ? riga.fornitore_id : riga.soggetto_id, descrizione, verificato: si(d.verificato),
      abbinamenti: [{ tipo, id, importo }],
    } });
    const out = { ok: true, movimento: m.movimento };
    if (tipo === 'ricevuta') out.ricevuta = this.ricevutaCompleta(this.rigaRicevuta(id));
    else out.impegno = this.impegnoDaRiga(this.db.riga('SELECT * FROM impegni WHERE id = ?', id));
    return out;
  },

  /** verificaMovimenti {ids, verificato}: la spunta "l'ho visto sull'estratto conto". */
  verificaMovimenti(d) {
    const ids = Array.isArray(d.ids) ? d.ids : [];
    if (!ids.length) throw new Rifiuto('Scegli i movimenti');
    const ver = d.verificato === undefined ? true : si(d.verificato);
    const ch = this.chi();
    const ora = adesso();
    const fatti = [];
    for (const id of ids) {
      const m = this.rigaMovimento(id);
      if (m.annullato === 1) throw new Rifiuto('Il movimento ' + m.id + ' è annullato');
      if ((m.verificato === 1) === ver) { fatti.push(m.id); continue; }
      this.aggiorna('movimenti', m.id, { verificato: ver ? 1 : 0, verificato_il: ver ? ora : '', verificato_da: ver && ch.utente ? ch.utente.id : null, modificato: ora },
        'id', ver ? 'visto sull\'estratto conto' : 'tolta la spunta dell\'estratto conto');
      fatti.push(m.id);
    }
    const nomi = this.nomiBanche();
    return { ok: true, fatte: fatti.length, movimenti: fatti.map(id => this.movimentoDaRiga(this.rigaMovimento(id), nomi)) };
  },

  /** annullaMovimento {id, motivo}: toglie i suoi abbinamenti (la fattura torna da incassare). */
  annullaMovimento(d) {
    const m = this.rigaMovimento(d.id);
    const motivo = testo(d.motivo);
    if (!motivo) throw new Rifiuto('Motivo: scrivi perché lo annulli');
    if (m.annullato === 1) return { ok: true, movimento: this.movimentoDaRiga(m) };
    for (const a of this.db.righe('SELECT * FROM movimento_abbinamenti WHERE movimento_id = ?', m.id)) {
      this.db.esegui('DELETE FROM movimento_abbinamenti WHERE id = ?', a.id);
      this.annota('movimento_abbinamenti', a.id, Object.assign({}, a), null, 'movimento annullato: ' + motivo);
    }
    this.aggiorna('movimenti', m.id, { annullato: 1, motivo, modificato: adesso() }, 'id', 'movimento annullato: ' + motivo);
    this.aggiornaProposte();
    return { ok: true, movimento: this.movimentoDaRiga(this.rigaMovimento(m.id)) };
  },

  // ------------------------------------------------------------------ impegni: tributi, F24, rate (§10.5)

  /** Quanto e' gia' stato pagato di un impegno. */
  pagatoImpegno(id) {
    return centesimi(this.db.riga('SELECT COALESCE(SUM(a.importo), 0) s FROM movimento_abbinamenti a JOIN movimenti m ON m.id = a.movimento_id WHERE m.annullato = 0 AND a.impegno_id = ?', id).s);
  },

  impegnoDaRiga(i) {
    const pagato = this.pagatoImpegno(i.id);
    const ric = i.ricorrenza_id ? this.db.riga('SELECT * FROM ricorrenze WHERE id = ?', i.ricorrenza_id) : null;
    const conto = i.conto_id ? this.db.riga('SELECT * FROM conti WHERE id = ?', i.conto_id) : null;
    const soggetto = i.soggetto_id ? this.db.riga('SELECT nome FROM soggetti WHERE id = ?', i.soggetto_id) : null;
    const daPagare = i.importo === null ? null : Math.max(0, centesimi(numero(i.importo) - pagato));
    const pagatoTutto = i.importo !== null && numero(i.importo) > 0 && daPagare <= 0;
    const stato = i.annullato === 1 ? 'annullato' : pagatoTutto ? 'pagato' : pagato > 0 ? 'in_parte' : 'aperto';
    const scaduto = stato !== 'annullato' && stato !== 'pagato' && i.scadenza < oggi();
    const statoVisto = stato === 'annullato' ? 'Annullato' : stato === 'pagato' ? 'Pagato' : i.confermato !== 1 ? 'Proposta' : scaduto ? 'Scaduto'
      : stato === 'in_parte' ? 'Pagato in parte' : 'Da pagare';
    return {
      id: i.id, tipo: i.tipo, verso: i.verso, descrizione: i.descrizione, codice: i.codice, scadenza: i.scadenza, importo: i.importo,
      importoDaScrivere: i.importo === null, idConto: i.conto_id === null ? null : i.conto_id, conto: this.nomeConto(conto),
      idSoggetto: i.soggetto_id, soggetto: soggetto ? soggetto.nome : '', idRicorrenza: i.ricorrenza_id === null ? null : i.ricorrenza_id,
      occorrenza: i.occorrenza, ricorrenza: ric ? { regola: ric.regola, ogni: ric.ogni, inizio: ric.inizio, fine: ric.fine } : null, ripete: ripete(ric),
      origine: i.origine, periodo: i.periodo, confermato: i.confermato === 1, proposta: i.confermato !== 1, pagato, daPagare, stato, statoVisto,
      scaduto, giorniScaduto: scaduto ? giorniTra(i.scadenza, oggi()) : 0, annullato: i.annullato === 1, motivo: i.motivo, note: i.note,
      puoScrivere: this.livello('banche') >= 2 && i.annullato !== 1, creato: dataOraIso(i.creato), modificato: dataOraIso(i.modificato),
    };
  },

  rigaImpegno(id) {
    const i = this.db.riga('SELECT * FROM impegni WHERE id = ?', Number(id) || 0);
    if (!i) throw new Rifiuto('Impegno ' + testo(id) + ' non trovato');
    return i;
  },

  /** impegni {da?, a?, tipo?, stato?: aperti|pagati|tutti}: per scadenza. */
  leggiImpegni(d) {
    d = d || {};
    const cond = [];
    const par = [];
    if (testo(d.da)) { cond.push('scadenza >= ?'); par.push(dataDaIso(d.da)); }
    if (testo(d.a)) { cond.push('scadenza <= ?'); par.push(dataDaIso(d.a)); }
    if (testo(d.tipo)) { cond.push('tipo = ?'); par.push(testo(d.tipo)); }
    const stato = testo(d.stato) || 'aperti';
    if (['aperti', 'pagati', 'tutti'].indexOf(stato) < 0) throw new Rifiuto('Stato: aperti, pagati o tutti');
    if (stato !== 'tutti') cond.push('annullato = 0');
    let lista = this.db.righe('SELECT * FROM impegni' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') + ' ORDER BY scadenza, id', ...par).map(i => this.impegnoDaRiga(i));
    if (stato === 'aperti') lista = lista.filter(i => i.stato === 'aperto' || i.stato === 'in_parte');
    if (stato === 'pagati') lista = lista.filter(i => i.stato === 'pagato');
    return lista;
  },

  /** I campi di un impegno dalla richiesta (prima = quello che c'era). */
  valoriImpegno(x, prima) {
    const v = {};
    const p = prima || {};
    v.tipo = x.tipo !== undefined ? testo(x.tipo) || 'tributo' : p.tipo || 'tributo';
    if (TIPI_IMPEGNO.indexOf(v.tipo) < 0) throw new Rifiuto('Tipo: f24, tributo, rata o altro');
    v.verso = x.verso !== undefined ? testo(x.verso) || 'uscita' : p.verso || 'uscita';
    if (['entrata', 'uscita'].indexOf(v.verso) < 0) throw new Rifiuto('Entrata o uscita?');
    v.descrizione = x.descrizione !== undefined ? testo(x.descrizione) : p.descrizione || '';
    if (!v.descrizione) throw new Rifiuto('Descrizione: scrivi cosa si paga');
    v.codice = x.codice !== undefined ? testo(x.codice) : p.codice || '';
    v.scadenza = x.scadenza !== undefined ? (testo(x.scadenza) ? dataDaIso(x.scadenza) : '') : p.scadenza || '';
    if (!v.scadenza) throw new Rifiuto('Scadenza: scrivi quando');
    if (x.importo !== undefined) {
      v.importo = vuoto(x.importo) ? null : centesimi(numero(x.importo));
      if (v.importo !== null && v.importo < 0) throw new Rifiuto('Importo: non può essere negativo');
    } else v.importo = prima ? p.importo : null;
    if (x.idConto !== undefined) v.conto_id = vuoto(x.idConto) ? null : this.rigaConto(x.idConto).id;
    else v.conto_id = prima ? p.conto_id : null;
    if (x.idSoggetto !== undefined) {
      v.soggetto_id = testo(x.idSoggetto);
      if (v.soggetto_id && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', v.soggetto_id)) throw new Rifiuto('Soggetto ' + v.soggetto_id + ' non trovato');
    } else v.soggetto_id = prima ? p.soggetto_id : '';
    v.note = x.note !== undefined ? testo(x.note) : p.note || '';
    return v;
  },

  regolaImpegno(r) {
    const regola = testo(r.regola).toLowerCase();
    if (['mesi', 'anni'].indexOf(regola) < 0) throw new Rifiuto('Ripeti: ogni N mesi o anni');
    return { regola, ogni: Math.max(1, Math.round(numero(r.ogni)) || 1), fine: r.fine ? dataDaIso(r.fine) : '' };
  },

  /** Le occorrenze di una serie di impegni che mancano, per i prossimi 12 mesi (o fino alla fine della serie). */
  generaImpegni(ricId) {
    const ric = this.db.riga("SELECT * FROM ricorrenze WHERE id = ? AND per = 'impegno'", ricId);
    if (!ric) return 0;
    const m = JSON.parse(ric.modello || '{}');
    const fino = C.giorniDopo(oggi(), 366);
    const esistenti = new Set(this.db.righe('SELECT occorrenza FROM impegni WHERE ricorrenza_id = ?', ric.id).map(r => r.occorrenza));
    let n = 0;
    for (const g of giorniSerie(ric, fino).filter(x => x <= giornoDelMese(Number(oggi().slice(0, 4)), Number(oggi().slice(5, 7)) - 1 + MESI_AVANTI, Number(oggi().slice(8, 10))))) {
      if (esistenti.has(g)) continue;
      const ora = adesso();
      this.inserisci('impegni', {
        tipo: m.tipo || 'tributo', verso: m.verso || 'uscita', descrizione: m.descrizione || '', codice: m.codice || '', scadenza: g,
        importo: m.importo === undefined ? null : m.importo, conto_id: m.conto_id || null, soggetto_id: m.soggetto_id || '', ricorrenza_id: ric.id,
        occorrenza: g, origine: 'mano', confermato: 1, note: m.note || '', utente_id: ric.creata_da, creato: ora, modificato: ora,
      });
      n++;
    }
    return n;
  },

  /** Ogni notte: le serie di impegni ancora vive si allungano fino a 12 mesi da oggi. */
  allungaImpegni() {
    return this.db.transazione(() => {
      let n = 0;
      for (const r of this.db.righe("SELECT id FROM ricorrenze WHERE per = 'impegno' AND (fine = '' OR fine >= ?)", oggi())) n += this.generaImpegni(r.id);
      return n;
    });
  },

  modelloImpegno(v) {
    return JSON.stringify({ tipo: v.tipo, verso: v.verso, descrizione: v.descrizione, codice: v.codice, importo: v.importo, conto_id: v.conto_id, soggetto_id: v.soggetto_id, note: v.note });
  },

  /** Una serie nuova che parte da questo impegno (che ne e' la prima occorrenza). */
  creaSerieImpegni(id, v, regola) {
    const r = this.regolaImpegno(regola);
    if (r.fine && r.fine < v.scadenza) throw new Rifiuto('Ripeti fino al: deve venire dopo la prima scadenza');
    const ch = this.chi();
    const ora = adesso();
    const ricId = this.inserisci('ricorrenze', Object.assign(r, {
      giorni_settimana: '', inizio: v.scadenza, modello: this.modelloImpegno(v), creata_da: ch.utente ? ch.utente.id : null, per: 'impegno', creato: ora, modificato: ora,
    }));
    this.aggiorna('impegni', id, { ricorrenza_id: ricId, occorrenza: v.scadenza });
    this.generaImpegni(ricId);
    return ricId;
  },

  /** Le occorrenze aperte (non pagate, non annullate) di una serie, da un giorno in poi. */
  occorrenzeAperte(ricId, da, tranneId) {
    return this.db.righe('SELECT * FROM impegni WHERE ricorrenza_id = ? AND annullato = 0 AND occorrenza >= ? AND id <> ? ORDER BY occorrenza', ricId, da, tranneId || 0)
      .filter(i => this.pagatoImpegno(i.id) <= 0);
  },

  /**
   * salvaImpegno {impegno: {id?, tipo, descrizione, codice?, scadenza, importo?,
   * verso?, idConto?, idSoggetto?, note?, ricorrenza?: {regola, ogni?, fine?} |
   * null}, perRicorrenza?: questa|future|tutte}. Cambiare una proposta di
   * Wisper la conferma (da li' non si aggiorna piu' da sola).
   */
  salvaImpegno(d) {
    const x = d.impegno || d;
    const prima = testo(x.id) ? this.rigaImpegno(x.id) : null;
    if (prima && prima.annullato === 1) throw new Rifiuto('L\'impegno è annullato: non si cambia');
    const v = this.valoriImpegno(x, prima);
    const ora = adesso();
    const ch = this.chi();
    if (!prima) {
      const id = this.inserisci('impegni', Object.assign({ origine: 'mano', confermato: 1, utente_id: ch.utente ? ch.utente.id : null, creato: ora, modificato: ora }, v));
      let occorrenze;
      if (x.ricorrenza) {
        const ricId = this.creaSerieImpegni(id, v, x.ricorrenza);
        occorrenze = this.db.riga('SELECT COUNT(*) n FROM impegni WHERE ricorrenza_id = ?', ricId).n;
      }
      return Object.assign({ ok: true, impegno: this.impegnoDaRiga(this.rigaImpegno(id)) }, occorrenze ? { occorrenze } : {});
    }
    const per = testo(d.perRicorrenza) || 'questa';
    if (['questa', 'future', 'tutte'].indexOf(per) < 0) throw new Rifiuto('Quali: questa, future o tutte');
    const conferma = prima.confermato !== 1 ? { confermato: 1 } : {};
    if (!prima.ricorrenza_id) {
      this.aggiorna('impegni', prima.id, Object.assign({}, v, conferma, { modificato: ora }));
      if (x.ricorrenza) this.creaSerieImpegni(prima.id, v, x.ricorrenza);
      return { ok: true, impegno: this.impegnoDaRiga(this.rigaImpegno(prima.id)) };
    }
    const ric = this.db.riga('SELECT * FROM ricorrenze WHERE id = ?', prima.ricorrenza_id);
    if (per === 'questa') {
      this.aggiorna('impegni', prima.id, Object.assign({}, v, conferma, { modificato: ora }));
      return { ok: true, impegno: this.impegnoDaRiga(this.rigaImpegno(prima.id)) };
    }
    const da = per === 'tutte' ? ric.inizio : prima.occorrenza;
    // Non si ripete piu': resta questa, le aperte seguenti si annullano.
    if (x.ricorrenza === null) {
      for (const o of this.occorrenzeAperte(ric.id, prima.occorrenza, prima.id)) this.aggiorna('impegni', o.id, { annullato: 1, motivo: 'la serie non si ripete più', modificato: ora }, 'id', 'tolto: la serie non si ripete più');
      this.aggiorna('ricorrenze', ric.id, { fine: prima.occorrenza, modificato: ora });
      this.aggiorna('impegni', prima.id, Object.assign({}, v, { modificato: ora }));
      return { ok: true, impegno: this.impegnoDaRiga(this.rigaImpegno(prima.id)) };
    }
    const nuovaRegola = x.ricorrenza ? this.regolaImpegno(x.ricorrenza) : null;
    const cambiaStruttura = v.scadenza !== prima.scadenza || (nuovaRegola && (nuovaRegola.regola !== ric.regola || nuovaRegola.ogni !== ric.ogni || nuovaRegola.fine !== ric.fine));
    if (!cambiaStruttura) {
      // Cambiano solo i campi: si riportano (solo quelli cambiati) sulle occorrenze aperte e su quelle che nasceranno.
      const campi = {};
      for (const k of Object.keys(v)) if (k !== 'scadenza' && diverso(prima[k], v[k])) campi[k] = v[k];
      if (Object.keys(campi).length) {
        for (const o of this.occorrenzeAperte(ric.id, da, prima.id)) this.aggiorna('impegni', o.id, Object.assign({}, campi, { modificato: ora }));
        const modello = Object.assign(JSON.parse(ric.modello || '{}'), campi);
        this.aggiorna('ricorrenze', ric.id, { modello: JSON.stringify(modello), modificato: ora });
      }
      this.aggiorna('impegni', prima.id, Object.assign({}, v, { modificato: ora }));
      return { ok: true, impegno: this.impegnoDaRiga(this.rigaImpegno(prima.id)) };
    }
    // Cambiano il giorno o la regola: da questa nasce una serie nuova; le aperte seguenti della vecchia si annullano.
    for (const o of this.occorrenzeAperte(ric.id, da, prima.id)) this.aggiorna('impegni', o.id, { annullato: 1, motivo: 'la ricorrenza è cambiata', modificato: ora }, 'id', 'tolto: la ricorrenza è cambiata');
    this.aggiorna('ricorrenze', ric.id, { fine: C.giorniDopo(prima.occorrenza, -1), modificato: ora });
    this.aggiorna('impegni', prima.id, Object.assign({}, v, { modificato: ora }));
    const ricId = this.creaSerieImpegni(prima.id, v, nuovaRegola || { regola: ric.regola, ogni: ric.ogni, fine: ric.fine });
    return { ok: true, impegno: this.impegnoDaRiga(this.rigaImpegno(prima.id)), occorrenze: this.db.riga('SELECT COUNT(*) n FROM impegni WHERE ricorrenza_id = ?', ricId).n };
  },

  /** confermaImpegno {id, importo?}: una proposta di Wisper diventa un impegno vero. */
  confermaImpegno(d) {
    const i = this.rigaImpegno(d.id);
    if (i.annullato === 1) throw new Rifiuto('L\'impegno è annullato');
    const v = { confermato: 1, modificato: adesso() };
    if (!vuoto(d.importo)) {
      v.importo = centesimi(numero(d.importo));
      if (v.importo < 0) throw new Rifiuto('Importo: non può essere negativo');
    }
    this.aggiorna('impegni', i.id, v, 'id', 'proposta confermata');
    return { ok: true, impegno: this.impegnoDaRiga(this.rigaImpegno(i.id)) };
  },

  /** togliImpegno {id, perRicorrenza?, motivo?}: annullato (non si cancella). Uno gia' pagato non si toglie. */
  togliImpegno(d) {
    const i = this.rigaImpegno(d.id);
    if (i.annullato === 1) return { ok: true, impegno: this.impegnoDaRiga(i), tolti: 0 };
    if (this.pagatoImpegno(i.id) > 0) throw new Rifiuto('L\'impegno ha già dei pagamenti: annulla prima il movimento');
    const motivo = testo(d.motivo) || 'tolto';
    const per = testo(d.perRicorrenza) || 'questa';
    if (['questa', 'future', 'tutte'].indexOf(per) < 0) throw new Rifiuto('Quali: questa, future o tutte');
    const ora = adesso();
    let tolti = 1;
    this.aggiorna('impegni', i.id, { annullato: 1, motivo, modificato: ora }, 'id', 'tolto: ' + motivo);
    if (i.ricorrenza_id && per !== 'questa') {
      const ric = this.db.riga('SELECT * FROM ricorrenze WHERE id = ?', i.ricorrenza_id);
      const da = per === 'tutte' ? ric.inizio : i.occorrenza;
      for (const o of this.occorrenzeAperte(ric.id, da, i.id)) {
        this.aggiorna('impegni', o.id, { annullato: 1, motivo, modificato: ora }, 'id', 'tolto: ' + motivo);
        tolti++;
      }
      this.aggiorna('ricorrenze', ric.id, { fine: C.giorniDopo(i.occorrenza, -1) < ric.inizio ? ric.inizio : C.giorniDopo(i.occorrenza, -1), modificato: ora });
    }
    return { ok: true, impegno: this.impegnoDaRiga(this.rigaImpegno(i.id)), tolti };
  },

  // ------------------------------------------------------------------ le proposte di Wisper (§10.5)

  /** Una proposta (origine, periodo): nasce, si aggiorna finche' non e' confermata, si toglie da sola se non serve piu'. */
  scriviProposta(origine, periodo, v) {
    const gia = this.db.riga('SELECT * FROM impegni WHERE origine = ? AND periodo = ?', origine, periodo);
    const ora = adesso();
    if (!gia) {
      if (!(v.importo > 0)) return;
      this.inserisci('impegni', Object.assign({ origine, periodo, verso: 'uscita', confermato: 0, conto_id: null, soggetto_id: '', note: '', creato: ora, modificato: ora }, v), 'id', 'proposta di Wisper');
      return;
    }
    if (gia.confermato === 1) return;
    if (gia.annullato === 1 && gia.motivo !== MOTIVO_AUTO) return;
    if (!(v.importo > 0)) {
      if (gia.annullato !== 1) this.aggiorna('impegni', gia.id, { annullato: 1, motivo: MOTIVO_AUTO, modificato: ora }, 'id', MOTIVO_AUTO);
      return;
    }
    this.aggiorna('impegni', gia.id, Object.assign({}, v, { annullato: 0, motivo: '', modificato: ora }), 'id', 'proposta aggiornata');
  },

  /**
   * Le proposte di Wisper: (1) le ritenute da versare (F24 1040) per ogni mese
   * in cui si sono pagate fatture ricevute con ritenuta, il 16 del mese dopo
   * (in proporzione se pagate in parte); (2) il bollo delle fatture
   * elettroniche per trimestre (stima: l'Agenzia lo calcola nel portale).
   */
  aggiornaProposte() {
    // (1) Ritenute sui compensi pagati.
    const perMese = new Map();
    for (const x of this.db.righe(
      "SELECT a.importo, m.data, r.ritenuta, r.netto FROM movimento_abbinamenti a JOIN movimenti m ON m.id = a.movimento_id JOIN fatture_ricevute r ON r.id = a.ricevuta_id WHERE m.annullato = 0 AND r.stato = 'attiva' AND r.ritenuta > 0")) {
      const mese = x.data.slice(0, 7);
      const parte = numero(x.netto) > 0 ? centesimi(numero(x.ritenuta) * numero(x.importo) / numero(x.netto)) : 0;
      perMese.set(mese, centesimi((perMese.get(mese) || 0) + parte));
    }
    const mesiConProposta = this.db.righe("SELECT periodo FROM impegni WHERE origine = 'ritenute'").map(r => r.periodo);
    for (const mese of new Set(Array.from(perMese.keys()).concat(mesiConProposta))) {
      const [a, m] = mese.split('-').map(Number);
      const dopo = giornoDelMese(a, m, 16);
      this.scriviProposta('ritenute', mese, {
        tipo: 'f24', codice: '1040', scadenza: C.primoLavorativo(dopo), importo: perMese.get(mese) || 0,
        descrizione: 'Ritenute sui compensi pagati a ' + C.MESI[m - 1],
      });
    }
    // (2) Bollo delle fatture elettroniche, per trimestre.
    const perTrimestre = new Map();
    for (const f of this.db.righe("SELECT data, bollo FROM fatture WHERE tipo = 'fattura' AND stato IN ('emessa', 'annullata') AND bollo > 0")) {
      const t = f.data.slice(0, 4) + '-T' + (Math.floor((Number(f.data.slice(5, 7)) - 1) / 3) + 1);
      perTrimestre.set(t, centesimi((perTrimestre.get(t) || 0) + numero(f.bollo)));
    }
    const trimestriConProposta = this.db.righe("SELECT periodo FROM impegni WHERE origine = 'bollo'").map(r => r.periodo);
    for (const t of new Set(Array.from(perTrimestre.keys()).concat(trimestriConProposta))) {
      const anno = Number(t.slice(0, 4));
      const n = Number(t.slice(-1));
      const scadenza = n === 1 ? anno + '-05-31' : n === 2 ? anno + '-09-30' : n === 3 ? anno + '-11-30' : C.fineMese((anno + 1) + '-02-01');
      this.scriviProposta('bollo', t, {
        tipo: 'f24', codice: '252' + n, scadenza: C.primoLavorativo(scadenza), importo: perTrimestre.get(t) || 0,
        descrizione: 'Bollo delle fatture del ' + n + '° trimestre (stima: controlla nel portale)',
      });
    }
  },

  // ------------------------------------------------------------------ scadenziario (§10.3)

  /**
   * Le righe dello scadenziario (non coperte), con la loro data: entrate
   * (rate delle emesse con residuo, pronte da emettere, scadenze dei contratti
   * con la data) e uscite (rate delle ricevute da pagare, impegni non pagati).
   */
  righeScadenziario(idConto) {
    const predefinito = this.contoPredefinito();
    const delConto = c => !idConto || Number(c || (predefinito ? predefinito.id : 0)) === Number(idConto);
    const clienti = {};
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { clienti[s.id] = s.nome; });
    const righe = [];
    // Entrate: fatture emesse con residuo (le rate, in ordine di data) e pronte da emettere.
    const fatture = this.db.righe("SELECT * FROM fatture WHERE tipo = 'fattura' AND stato IN ('pronta', 'emessa')");
    const a = this.aiutiFatture(fatture);
    for (const f of fatture) {
      if (!delConto(f.conto_id)) continue;
      const p = this.pagamentoDi(f, a);
      if (!(p.residuo > 0)) continue;
      const scadenze = a.scadenze[f.id] || [];
      scadenze.forEach((s, i) => {
        const resta = centesimi(numero(s.importo) - (p.coperture[i] || 0));
        if (!(resta > 0)) return;
        const emessa = f.stato === 'emessa';
        righe.push({
          tipo: 'fattura', id: f.id, data: s.data, verso: 'entrata',
          titolo: (emessa ? (f.numero || f.riferimento) : f.riferimento) + ' · ' + (clienti[f.cliente_id] || ''),
          dettaglio: emessa ? (p.incassato > 0 ? 'pagata in parte' : 'fattura emessa') : 'da emettere: è nel programma',
          importo: resta, stato: !emessa ? 'da_emettere' : (p.coperture[i] > 0 ? 'in_parte' : 'previsto'), proposta: false, idConto: f.conto_id || null,
        });
      });
    }
    // Entrate: le scadenze dei contratti con la data (non ancora in una pronta).
    const attive = this.sorgentiAttive();
    for (const s of this.db.righe("SELECT s.*, m.cliente_id FROM scadenze_pagamento s JOIN commesse m ON UPPER(m.id) = UPPER(s.commessa_id) WHERE s.stato = 'prevista' AND m.archiviata = 0")) {
      const at = attive.get('scadenza|' + s.id);
      if (at && at.stato !== 'bozza') continue;
      if (!delConto(null)) continue;
      const riga = {
        tipo: 'scadenza', id: s.id, data: s.quando === 'data' ? s.data : '', verso: 'entrata', titolo: s.descrizione + ' · ' + (clienti[s.cliente_id] || ''),
        dettaglio: 'Dal contratto · ' + s.commessa_id, importo: centesimi(numero(s.importo)), stato: 'previsto', proposta: false, idConto: null,
      };
      righe.push(riga);
    }
    // Uscite: le rate delle fatture ricevute da pagare.
    const ricevute = this.db.righe("SELECT * FROM fatture_ricevute WHERE stato = 'attiva' AND tipo_documento <> 'TD04'");
    const ar = this.aiutiRicevute(ricevute);
    for (const r of ricevute) {
      if (!delConto(null)) continue;
      const st = this.statoRicevuta(r, ar);
      if (!(st.daPagare > 0)) continue;
      (ar.scadenze[r.id] || []).forEach((s, i) => {
        const resta = centesimi(numero(s.importo) - (st.coperture[i] || 0));
        if (!(resta > 0)) return;
        righe.push({
          tipo: 'ricevuta', id: r.id, data: s.data, verso: 'uscita', titolo: (ar.soggetti[r.fornitore_id] || '') + ' · fattura ' + r.numero,
          dettaglio: r.scadenza_stimata === 1 ? 'scadenza stimata a 30 giorni' : r.categoria, importo: resta, stato: st.coperture[i] > 0 ? 'in_parte' : 'previsto',
          proposta: false, idConto: null,
        });
      });
    }
    // Uscite (e qualche entrata): impegni non pagati.
    for (const i of this.db.righe('SELECT * FROM impegni WHERE annullato = 0 ORDER BY scadenza, id')) {
      if (!delConto(i.conto_id)) continue;
      const x = this.impegnoDaRiga(i);
      if (x.stato === 'pagato') continue;
      righe.push({
        tipo: 'impegno', id: i.id, data: i.scadenza, verso: i.verso, titolo: i.descrizione,
        dettaglio: [i.codice ? 'codice ' + i.codice : '', x.ripete, x.importoDaScrivere ? 'importo da scrivere' : ''].filter(Boolean).join(' · '),
        importo: x.daPagare, stato: x.proposta ? 'proposto' : (x.pagato > 0 ? 'in_parte' : 'previsto'), proposta: x.proposta, idConto: i.conto_id || null,
        importoDaScrivere: x.importoDaScrivere,
      });
    }
    return righe;
  },

  /** Il saldo di oggi dei conti scelti (tutti gli attivi, o uno) e la soglia. */
  saldoESoglia(idConto) {
    const imp = this.leggiImpostazioni();
    if (idConto) {
      const c = this.rigaConto(idConto);
      return { saldo: this.saldoConto(c).saldo, soglia: c.soglia !== null ? c.soglia : numero(imp.SOGLIA_CASSA) };
    }
    const conti = this.db.righe('SELECT * FROM conti WHERE attivo = 1');
    return { saldo: centesimi(conti.reduce((t, c) => t + this.saldoConto(c).saldo, 0)), soglia: numero(imp.SOGLIA_CASSA) };
  },

  /**
   * scadenziario {da?, a?, idConto?} (§11.5; di base da oggi a 90 giorni). Il
   * saldo previsto e' PRUDENTE: parte dal saldo di oggi, le uscite scadute
   * contano oggi, le entrate scadute no (non si sa quando arriveranno); ogni
   * giorno ha il suo saldo di fine giornata, rosso sotto la soglia. Le scadenze
   * dei contratti senza data stanno a parte e non contano.
   */
  scadenziario(d) {
    d = d || {};
    const t = oggi();
    const da = testo(d.da) ? dataDaIso(d.da) : t;
    const a = testo(d.a) ? dataDaIso(d.a) : C.giorniDopo(t, 90);
    const idConto = testo(d.idConto) ? Number(d.idConto) : null;
    const { saldo: saldoOggi, soglia } = this.saldoESoglia(idConto);
    const tutte = this.righeScadenziario(idConto);
    const conta = r => !(r.importoDaScrivere) && r.importo > 0;
    const pulisci = r => {
      const o = Object.assign({}, r);
      delete o.idConto;
      if (!o.importoDaScrivere) delete o.importoDaScrivere;
      return o;
    };
    const scaduti = tutte.filter(r => r.data && r.data < t).sort((x, y) => (x.data < y.data ? -1 : 1)).map(r => Object.assign(pulisci(r), {
      stato: r.stato === 'da_emettere' ? 'da_emettere' : r.stato === 'proposto' ? 'proposto' : 'scaduto',
      dettaglio: 'scaduto da ' + giorniTra(r.data, t) + (giorniTra(r.data, t) === 1 ? ' giorno' : ' giorni') + (r.dettaglio ? ' · ' + r.dettaglio : ''),
      contaNelSaldo: r.verso === 'uscita' && conta(r),
    }));
    // Il saldo di partenza: oggi, meno le uscite scadute (le entrate scadute no).
    let saldo = centesimi(saldoOggi - scaduti.filter(r => r.contaNelSaldo).reduce((x, r) => x + r.importo, 0));
    let primoSottoSoglia = saldo < soglia ? t : '';
    const perGiorno = new Map();
    for (const r of tutte.filter(x => x.data && x.data >= t).sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : (x.verso === 'entrata' ? -1 : 1)))) {
      if (!perGiorno.has(r.data)) perGiorno.set(r.data, []);
      perGiorno.get(r.data).push(r);
    }
    const giorni = [];
    for (const [g, lista] of perGiorno) {
      for (const r of lista) if (conta(r)) saldo = centesimi(saldo + (r.verso === 'entrata' ? 1 : -1) * r.importo);
      const sotto = saldo < soglia;
      if (sotto && !primoSottoSoglia) primoSottoSoglia = g;
      if (g >= da && g <= a) {
        giorni.push({ data: g, titolo: giornoTitolo(g), saldo, sottoSoglia: sotto, righe: lista.map(r => Object.assign(pulisci(r), { contaNelSaldo: conta(r) })) });
      }
    }
    const senza = tutte.filter(r => !r.data);
    return {
      ok: true, oggi: t, da, a, saldoOggi, soglia, saldoPartenza: centesimi(saldoOggi - scaduti.filter(r => r.contaNelSaldo).reduce((x, r) => x + r.importo, 0)),
      scaduti, giorni, senzaData: { entrate: centesimi(senza.reduce((x, r) => x + r.importo, 0)), voci: senza.length },
      primoSottoSoglia, nota: 'Gli incassi scaduti non entrano nel saldo previsto',
    };
  },

  // ------------------------------------------------------------------ situazione finanziaria (§10.4)

  /** situazione {idConto?}: i numeri della pagina Situazione. */
  situazione(d) {
    d = d || {};
    const t = oggi();
    const idConto = testo(d.idConto) ? Number(d.idConto) : null;
    const conti = this.db.righe('SELECT * FROM conti WHERE attivo = 1 ORDER BY predefinito DESC, id').filter(c => !idConto || c.id === idConto);
    const saldi = conti.map(c => ({ idConto: c.id, nome: this.nomeConto(c), saldo: this.saldoConto(c).saldo }));
    const saldoOggi = centesimi(saldi.reduce((x, s) => x + s.saldo, 0));
    const righe = this.righeScadenziario(idConto);
    const entrateFatture = righe.filter(r => r.tipo === 'fattura' && r.stato !== 'da_emettere');
    const daIncassare = centesimi(entrateFatture.reduce((x, r) => x + r.importo, 0));
    const scadutoDaIncassare = centesimi(entrateFatture.filter(r => r.data < t).reduce((x, r) => x + r.importo, 0));
    const uscite = righe.filter(r => r.verso === 'uscita' && (r.tipo === 'ricevuta' || r.tipo === 'impegno') && !r.importoDaScrivere);
    const daPagare30 = centesimi(uscite.filter(r => r.data <= C.giorniDopo(t, 30)).reduce((x, r) => x + r.importo, 0));
    const scadutoDaPagare = centesimi(uscite.filter(r => r.data < t).reduce((x, r) => x + r.importo, 0));
    const s = this.scadenziario({ da: t, a: C.giorniDopo(t, 91), idConto: idConto || undefined });
    const saldoAl = giorno => {
      let x = s.saldoPartenza;
      for (const g of s.giorni) if (g.data <= giorno) x = g.saldo;
      return x;
    };
    const previsto = { 30: saldoAl(C.giorniDopo(t, 30)), 60: saldoAl(C.giorniDopo(t, 60)), 90: saldoAl(C.giorniDopo(t, 90)) };
    // Tredici settimane: entrate, uscite e saldo a fine settimana (da lunedi' a domenica).
    const lunedi = C.giorniDopo(t, -((new Date(t + 'T12:00:00').getDay() + 6) % 7));
    const settimane = [];
    for (let k = 0; k < 13; k++) {
      const inizio = C.giorniDopo(lunedi, 7 * k);
      const fine = C.giorniDopo(inizio, 6);
      let entrate = 0;
      let usciteS = 0;
      for (const g of s.giorni.filter(x => x.data >= inizio && x.data <= fine)) {
        for (const r of g.righe) if (r.contaNelSaldo) { if (r.verso === 'entrata') entrate += r.importo; else usciteS += r.importo; }
      }
      settimane.push({ da: inizio, a: fine, entrate: centesimi(entrate), uscite: centesimi(usciteS), saldo: saldoAl(fine), sottoSoglia: saldoAl(fine) < s.soglia });
    }
    const anno = t.slice(0, 4);
    const fatt = this.riepilogoFatturato({ anno, per: 'mese' });
    return {
      ok: true, oggi: t, saldi, saldoOggi, soglia: s.soglia, daIncassare, scadutoDaIncassare, daPagare30, scadutoDaPagare, previsto,
      primoSottoSoglia: s.primoSottoSoglia, settimane, fatturatoAnno: fatt.fatturato, incassatoAnno: fatt.incassato, collegamento: 'non_collegato',
    };
  },
};

Object.defineProperties(module.exports, {
  giorniSerie: { value: giorniSerie },
  ripete: { value: ripete },
  MOTIVO_AUTO: { value: MOTIVO_AUTO },
});
