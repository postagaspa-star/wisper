/*
 * Il ritorno dell'XML (fase4.md §9) e le fatture ricevute dai fornitori.
 *
 * Due passi: leggiXml NON cambia niente (legge i file, capisce cosa sono,
 * propone cosa fare e tiene i file per un'ora in letture_xml); confermaXml
 * applica le scelte, tutte insieme in una transazione. Niente si abbina senza
 * conferma, nemmeno quando la bozza e' "certa".
 *
 * Il lettore (fatturapa.js) e' scritto a mano, senza dipendenze, e non esegue
 * niente: rifiuta DOCTYPE ed entita', limita numero e grandezza dei file, non
 * apre zip dentro zip, non verifica la firma dei .p7m (legge e basta).
 *
 * Le regole che contano per i soldi:
 *  - vince l'XML: e' la fattura vera, emessa dal programma (gli importi della
 *    bozza restano in totale_bozza/netto_bozza);
 *  - un gruppo di cose da fatturare torna "da fatturare" solo se TUTTE le sue
 *    righe mancano dall'XML: se ne manca solo una parte, resta fatturato (meglio
 *    una riga da aggiungere a mano che una cosa fatturata due volte);
 *  - lo stesso XML importato due volte e' un doppione (la chiave
 *    partitaIva|tipo|anno|numero e' unica nel database).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Rifiuto, testo, numero, centesimi, adesso, oggi, dataIso, dataDaIso, dataOraIso, istante, adessoMs } = require('../utili');

/** Un numero che non può essere quello dato dal programma di fatturazione (vuoto, o il BOZZA dell'XML da completare). */
const numeroNonFiscale = n => /^(BOZZA)?$/i.test(String(n === undefined || n === null ? '' : n).replace(/\s+/g, ''));
const C = require('../conti');
const { leggiFatturePA } = require('../fatturapa');

const si = v => v === true || v === 1 || v === '1' || v === 'true';
const dataBreve = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
const chiavePiva = v => testo(v).toUpperCase().replace(/[\s.\-]/g, '').replace(/^IT(?=\d{11}$)/, '');
const VIVE = ['bozza', 'pronta'];
const AUTOFATTURE = ['TD16', 'TD17', 'TD18', 'TD19', 'TD20', 'TD21', 'TD29'];
const CATEGORIE = ['materiale', 'consulenze', 'servizi', 'utenze', 'affitto', 'altro'];
const ORA = 3600 * 1000;

/** Il tipo della riga dell'XML: bollo, anticipazione (N1) o compenso. */
function tipoRigaXml(r, doc) {
  const bolloImporto = doc.bollo ? numero(doc.bollo.importo) : 0;
  if (r.natura === 'N1' && /bollo/i.test(r.descrizione) && bolloImporto > 0 && centesimi(r.prezzoTotale) === centesimi(bolloImporto)) return 'bollo';
  if (r.natura === 'N1') return 'anticipazione';
  return 'compenso';
}

module.exports = {
  // ------------------------------------------------------------------ letture in attesa

  cartellaLetture() {
    return path.join(this.dati, 'letture');
  },

  /** Le letture scadute (piu' di un'ora) si tolgono, coi loro file. Non vanno nel registro. */
  pulisciLetture() {
    const ora = adesso();
    for (const l of this.db.righe('SELECT * FROM letture_xml WHERE scade < ?', ora)) {
      this.db.esegui('DELETE FROM letture_xml WHERE id = ?', l.id);
      if (l.cartella) fs.rmSync(path.join(this.cartellaLetture(), path.basename(l.cartella)), { recursive: true, force: true });
    }
  },

  /** Lo studio, per capire da che parte sta una fattura: partita IVA e codice fiscale. */
  identitaStudio() {
    const imp = this.leggiImpostazioni();
    const piva = chiavePiva(imp.PARTITA_IVA);
    if (!piva) throw new Rifiuto('Scrivi prima la partita IVA dello studio in Amministrazione › Dati dello studio: serve a capire quali fatture sono sue');
    return { piva, cf: testo(imp.CODICE_FISCALE).toUpperCase(), nome: testo(imp.RAGIONE_SOCIALE) || 'lo studio' };
  },

  /** Il soggetto con quella partita IVA (o quel codice fiscale). */
  soggettoPerFisco(partitaIva, codiceFiscale) {
    const p = chiavePiva(partitaIva);
    const cf = testo(codiceFiscale).toUpperCase();
    const tutti = this.db.righe("SELECT * FROM soggetti WHERE accorpato_in = '' ORDER BY archiviato, rowid");
    if (p) {
      const s = tutti.find(x => chiavePiva(x.partita_iva) === p);
      if (s) return s;
    }
    if (cf) {
      const s = tutti.find(x => testo(x.codice_fiscale).toUpperCase() === cf || (!p && chiavePiva(x.partita_iva) === cf));
      if (s) return s;
    }
    return null;
  },

  /** I dati per creare un cliente o un fornitore dall'XML. */
  soggettoDaXml(s) {
    const sede = s.sede || {};
    return {
      nome: s.nomeVisto || s.denominazione || [s.nome, s.cognome].filter(Boolean).join(' '),
      partitaIva: s.paese && s.paese !== 'IT' ? testo(s.partitaIva) : chiavePiva(s.partitaIva), codiceFiscale: testo(s.codiceFiscale).toUpperCase(),
      indirizzo: [sede.indirizzo, sede.numeroCivico].filter(Boolean).join(' '), cap: testo(sede.cap), citta: testo(sede.comune),
      provincia: testo(sede.provincia).toUpperCase(), nazione: testo(sede.nazione).toUpperCase() || 'IT', pec: testo(s.pec),
    };
  },

  /** Crea il soggetto dai dati dell'XML (cliente o fornitore), o rende cliente/fornitore quello che c'e'. */
  creaSoggettoDaXml(s, comeCliente) {
    const gia = this.soggettoPerFisco(s.partitaIva, s.codiceFiscale);
    if (gia) {
      const flag = comeCliente ? { cliente: 1 } : { fornitore: 1 };
      if ((comeCliente ? gia.cliente : gia.fornitore) !== 1) this.aggiorna('soggetti', gia.id, Object.assign(flag, { modificato: adesso() }));
      return this.db.riga('SELECT * FROM soggetti WHERE id = ?', gia.id);
    }
    const x = this.soggettoDaXml(s);
    const id = C.prossimoCodice(this.righeSoggetti().map(r => r.id), comeCliente ? 'C' : 'F');
    const ora = adesso();
    this.inserisci('soggetti', {
      id, cliente: comeCliente ? 1 : 0, fornitore: comeCliente ? 0 : 1, nome: x.nome || id, partita_iva: x.partitaIva, codice_fiscale: x.codiceFiscale,
      indirizzo: x.indirizzo, cap: x.cap, citta: x.citta, provincia: x.provincia, nazione: x.nazione, pec: x.pec, creato: ora, modificato: ora,
    }, 'id', 'creato dall\'XML della fattura');
    return this.db.riga('SELECT * FROM soggetti WHERE id = ?', id);
  },

  // ------------------------------------------------------------------ leggiXml: leggere e proporre

  /** leggiXml {file: [{nome, base64}]} (§11.4): legge, propone, tiene i file un'ora. Non cambia niente. */
  leggiXml(d) {
    this.pulisciLetture();
    const studio = this.identitaStudio();
    const { documenti, scartati } = leggiFatturePA(Array.isArray(d.file) ? d.file : []);
    const tenuti = [];
    const visti = new Map();
    for (const doc of documenti) {
      if (doc.genere === 'fattura') {
        if (AUTOFATTURE.indexOf(doc.tipoDocumento) >= 0) { scartati.push({ nomeFile: doc.nomeFile, motivo: 'Autofattura o integrazione: Wisper non la gestisce' }); continue; }
        const emessa = chiavePiva(doc.cedente.partitaIva) === studio.piva || (!doc.cedente.partitaIva && studio.cf && doc.cedente.codiceFiscale === studio.cf);
        const ricevuta = !emessa && (chiavePiva(doc.cessionario.partitaIva) === studio.piva || (studio.cf && testo(doc.cessionario.codiceFiscale).toUpperCase() === studio.cf));
        if (!emessa && !ricevuta) {
          scartati.push({ nomeFile: doc.nomeFile, motivo: 'Non è una fattura dello studio: né chi la emette né chi la riceve è ' + studio.nome });
          continue;
        }
        doc.lato = emessa ? 'emessa' : 'ricevuta';
        // L'XML da completare che Wisper prepara per il programma ha il numero BOZZA: se torna qui per sbaglio
        // non va mai preso per una fattura emessa (difetto trovato dal telefono il 22/10/2026).
        if (numeroNonFiscale(doc.numero)) {
          scartati.push({ nomeFile: doc.nomeFile, motivo: "È l'XML da completare preparato da Wisper, non una fattura emessa: importa l'XML che ti dà il programma dopo averla emessa" });
          continue;
        }
      }
      tenuti.push(doc);
    }
    // Le proposte (le fatture prima degli esiti: un esito puo' riguardare un file di questa stessa lettura).
    const proposte = [];
    for (const doc of tenuti.filter(x => x.genere === 'fattura')) {
      const p = doc.lato === 'emessa' ? this.propostaEmessa(doc, studio, visti) : this.propostaRicevuta(doc, visti);
      proposte.push(p);
    }
    for (const doc of tenuti.filter(x => x.genere === 'esito')) proposte.push(this.propostaEsito(doc, tenuti));
    // I file originali restano su disco per un'ora, per salvarli alla conferma.
    const id = crypto.randomBytes(17).toString('base64url').slice(0, 22);
    const cartella = path.join(this.cartellaLetture(), id);
    fs.mkdirSync(cartella, { recursive: true });
    const scritti = new Map();
    for (const doc of tenuti) {
      const buf = doc.originale;
      if (!buf) continue;
      if (!scritti.has(buf)) {
        const n = scritti.size + 1;
        fs.writeFileSync(path.join(cartella, String(n)), buf);
        scritti.set(buf, String(n));
      }
      doc.fileLettura = scritti.get(buf);
    }
    const c = this.chi();
    const ora = new Date(adessoMs());
    this.db.esegui('INSERT INTO letture_xml (id, utente_id, creato, scade, documenti, cartella) VALUES (?, ?, ?, ?, ?, ?)',
      id, c.utente ? c.utente.id : null, istante(ora), istante(new Date(ora.getTime() + ORA)), JSON.stringify(tenuti.map((doc, i) => ({ doc, proposta: proposte.find(p => p.chiave === doc.chiave) || null, i }))), id);
    // Nella risposta i documenti nell'ordine dei file caricati.
    const ordinati = tenuti.map(doc => proposte.find(p => p.chiave === doc.chiave)).filter(Boolean);
    return { ok: true, idLettura: id, scade: dataOraIso(istante(new Date(ora.getTime() + ORA))), documenti: ordinati, scartati };
  },

  /** I conti dell'XML come li mostrano le app. */
  contiXml(doc) {
    const k = doc.conti;
    return { compenso: k.compenso, contributo: k.contributo, iva: k.iva, anticipazioni: k.anticipazioni, bollo: k.bollo, bolloAddebitato: k.bolloAddebitato, totale: k.totale, ritenuta: k.ritenuta, netto: k.netto };
  },

  /** La proposta per una fattura (o nota) emessa dallo studio (§9.3, §9.4, §9.5). */
  propostaEmessa(doc, studio, visti) {
    const nota = doc.tipoDocumento === 'TD04';
    const cliente = this.soggettoPerFisco(doc.cessionario.partitaIva, doc.cessionario.codiceFiscale);
    const out = {
      chiave: doc.chiave, nomeFile: doc.nomeFile, tipo: 'emessa', tipoDocumento: doc.tipoDocumento, numero: doc.numero, data: doc.data,
      controparte: { nome: doc.cessionario.nomeVisto, partitaIva: chiavePiva(doc.cessionario.partitaIva), codiceFiscale: doc.cessionario.codiceFiscale, idSoggetto: cliente ? cliente.id : null },
      conti: this.contiXml(doc), scadenze: doc.scadenze.map(s => ({ data: s.data, importo: s.importo })),
      righe: doc.righe.map(r => ({ descrizione: r.descrizione, importo: r.prezzoTotale, natura: r.natura })),
      proposta: null, avvisi: [],
    };
    if (!cliente) out.clienteNuovo = this.soggettoDaXml(doc.cessionario);
    const chiave = this.chiaveFattura(doc.tipoDocumento, doc.data, doc.numero);
    // Lo stesso XML due volte nella stessa lettura.
    if (visti.has(chiave)) {
      out.proposta = { azione: 'gia', idFattura: null };
      out.avvisi.push('C\'è due volte tra i file caricati: la prendo una volta sola');
      return out;
    }
    visti.set(chiave, doc.chiave);
    const gia = this.db.riga('SELECT * FROM fatture WHERE chiave = ?', chiave);
    if (gia) {
      if (gia.numero_da === 'mano' && !gia.file_id) {
        // Emessa a mano, con lo stesso numero: l'XML le si attacca.
        out.proposta = this.proposta('abbina', 'certa', gia, doc);
        out.avvisi.push('È la ' + (gia.numero || gia.riferimento) + ' segnata emessa a mano: le attacco l\'XML');
        return out;
      }
      out.proposta = { azione: 'gia', idFattura: gia.id, riferimento: gia.riferimento };
      out.avvisi.push('Già importata il ' + dataBreve(dataIso(gia.emessa_il || gia.creato)));
      if (centesimi(gia.totale) !== centesimi(doc.conti.totale)) out.avvisi.push('C\'è già con importi diversi: tenuta quella di prima');
      return out;
    }
    if (nota) {
      const coll = this.fatturaCollegataDaXml(doc, cliente);
      if (coll) out.fatturaCollegata = { idFattura: coll.id, numero: coll.numero || coll.riferimento };
    }
    // 1. Il riferimento di Wisper (Rif. Wisper W-15) di una bozza o pronta di quel cliente: certa.
    if (cliente) {
      for (const rif of doc.riferimentiWisper || []) {
        const f = this.db.riga('SELECT * FROM fatture WHERE riferimento = ?', rif.toUpperCase());
        if (!f) continue;
        if (f.cliente_id !== cliente.id) { out.avvisi.push('Il riferimento ' + rif + ' è di una fattura per un altro cliente: non lo uso'); continue; }
        if (VIVE.indexOf(f.stato) < 0) { out.avvisi.push('La ' + rif + ' non è più una bozza (' + this.etichettaFattura(f) + '): non la uso'); continue; }
        if ((f.tipo === 'nota') !== nota) continue;
        out.proposta = this.proposta('abbina', 'certa', f, doc);
        return out;
      }
    }
    // 2. Le candidate: bozze e pronte dello stesso cliente e tipo, con la data dell'XML nella finestra.
    const candidate = cliente ? this.db.righe("SELECT * FROM fatture WHERE cliente_id = ? AND stato IN ('bozza', 'pronta') AND tipo = ? ORDER BY CASE stato WHEN 'pronta' THEN 0 ELSE 1 END, id",
      cliente.id, nota ? 'nota' : 'fattura').filter(f => {
      const passaggio = dataIso(f.pronta_il) || f.data || dataIso(f.creato);
      return doc.data >= C.giorniDopo(passaggio, -3) && doc.data <= C.giorniDopo(passaggio, 60);
    }) : [];
    const uguali = candidate.filter(f => Math.abs(numero(f.totale) - numero(doc.conti.totale)) <= 0.01);
    if (uguali.length) {
      out.proposta = this.proposta('abbina', 'probabile', uguali[0], doc);
      out.proposta.alternative = uguali.slice(1).map(f => ({ idFattura: f.id, riferimento: f.riferimento, totale: f.totale }));
      return out;
    }
    if (candidate.length) {
      const pronte = candidate.filter(f => f.stato === 'pronta');
      const scelta = (pronte.length ? pronte : candidate).slice().sort((a, b) => b.id - a.id)[0];
      out.proposta = this.proposta('abbina', 'diversa', scelta, doc);
      out.proposta.alternative = candidate.filter(f => f.id !== scelta.id).map(f => ({ idFattura: f.id, riferimento: f.riferimento, totale: f.totale }));
      return out;
    }
    // 3. Nessuna bozza: una fattura "senza bozza". Si propone di collegare le cose da fatturare con gli stessi importi.
    out.proposta = { azione: 'senzaBozza', certezza: 'nessuna', idFattura: null, riferimento: '', alternative: [], differenze: [], righeMancanti: [], collegabili: [], libera: [] };
    if (!nota && cliente) out.proposta.collegabili = this.collegabili(cliente.id, doc.conti.compenso);
    if (nota && out.fatturaCollegata) {
      const f = this.db.riga('SELECT * FROM fatture WHERE id = ?', out.fatturaCollegata.idFattura);
      const totale = numero(doc.conti.totale) >= numero(f.totale) - 0.01;
      out.proposta.gruppiFattura = this.gruppiDellaFattura(f.id);
      out.proposta.totale = totale;
      // Una nota che storna tutto propone di liberare tutto; una parziale chiede cosa torna da fatturare (niente spuntato).
      out.proposta.libera = totale ? out.proposta.gruppiFattura.map(g => g.gruppo) : [];
      if (!totale) out.avvisi.push('Nota di credito parziale: scegli cosa torna da fatturare');
    } else if (nota) {
      out.avvisi.push('Non trovo la fattura che corregge (' + ((doc.fattureCollegate[0] || {}).idDocumento || 'non scritta') + '): la tengo come nota senza fattura collegata');
    }
    return out;
  },

  /** La fattura che una nota corregge: DatiFattureCollegate (numero + anno, stesso cliente). */
  fatturaCollegataDaXml(doc, cliente) {
    for (const c of doc.fattureCollegate || []) {
      const n = testo(c.idDocumento);
      if (!n) continue;
      const anno = String(c.data || '').slice(0, 4);
      const righe = this.db.righe("SELECT * FROM fatture WHERE tipo = 'fattura' AND stato IN ('emessa', 'annullata') AND UPPER(REPLACE(numero, ' ', '')) = ?" +
        (cliente ? ' AND cliente_id = ?' : ''), n.toUpperCase().replace(/\s+/g, ''), ...(cliente ? [cliente.id] : []));
      const f = righe.find(x => !anno || x.data.slice(0, 4) === anno) || righe[0];
      if (f) return f;
    }
    return null;
  },

  /** I gruppi di una fattura con le cose che contiene (per "Cosa torna da fatturare?"). */
  gruppiDellaFattura(idFattura) {
    const per = new Map();
    for (const s of this.db.righe('SELECT * FROM fattura_sorgenti WHERE fattura_id = ? AND attiva = 1 ORDER BY id', idFattura)) {
      if (!per.has(s.gruppo)) per.set(s.gruppo, { gruppo: s.gruppo, importo: 0, sorgenti: [] });
      const g = per.get(s.gruppo);
      g.importo = centesimi(g.importo + numero(s.importo));
      g.sorgenti.push({ tipo: s.tipo, id: s.sorgente_id, descrizione: this.descrizioneSorgente(s.tipo, s.sorgente_id) });
    }
    return Array.from(per.values()).map(g => Object.assign(g, { descrizione: g.sorgenti.map(x => x.descrizione).slice(0, 3).join(', ') + (g.sorgenti.length > 3 ? '…' : '') }));
  },

  /** La proposta di abbinare a una bozza: differenze e righe che nell'XML non ci sono. */
  proposta(azione, certezza, f, doc) {
    const confronto = this.confrontaConXml(f, doc);
    return {
      azione, certezza, idFattura: f.id, riferimento: f.riferimento, alternative: [],
      differenze: confronto.differenze, righeMancanti: confronto.righeMancanti, collegabili: [], libera: confronto.gruppiInteri,
    };
  },

  /**
   * Il confronto bozza / XML. differenze: i conti diversi {campo, bozza, xml}.
   * righeMancanti: le righe della bozza che nell'XML non ritrovo (stesso
   * importo e stesso tipo, una per una). gruppiInteri: i gruppi con TUTTE le
   * righe mancanti, i soli che possono tornare da fatturare.
   */
  confrontaConXml(f, doc) {
    const campi = [['totale', 'totale'], ['compenso', 'compenso'], ['contributo', 'contributo'], ['iva', 'iva'], ['ritenuta', 'ritenuta'],
      ['anticipazioni', 'anticipazioni'], ['bollo', 'bollo']];
    const differenze = campi.filter(([k]) => centesimi(numero(f[k])) !== centesimi(numero(doc.conti[k])))
      .map(([k]) => ({ campo: k, bozza: centesimi(numero(f[k])), xml: centesimi(numero(doc.conti[k])) }));
    const bozza = this.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND origine = 'bozza' AND tipo <> 'bollo' ORDER BY ordine, id", f.id);
    const xml = doc.righe.map(r => ({ tipo: tipoRigaXml(r, doc), importo: centesimi(r.prezzoTotale) })).filter(r => r.tipo !== 'bollo');
    const usate = new Set();
    const righeMancanti = [];
    for (const r of bozza) {
      const i = xml.findIndex((x, k) => !usate.has(k) && x.tipo === r.tipo && x.importo === centesimi(r.importo));
      if (i >= 0) usate.add(i);
      else righeMancanti.push({ idRiga: r.id, descrizione: r.descrizione, importo: r.importo, tipo: r.tipo, gruppo: r.gruppo });
    }
    const mancanti = new Set(righeMancanti.map(r => r.idRiga));
    const gruppiInteri = Array.from(new Set(righeMancanti.map(r => r.gruppo).filter(Boolean)))
      .filter(g => bozza.filter(r => r.gruppo === g).every(r => mancanti.has(r.id)));
    return { differenze, righeMancanti, gruppiInteri };
  },

  /**
   * Le cose da fatturare di un cliente che una fattura fatta fuori da Wisper
   * potrebbe aver gia' fatturato, per gruppo (un mese di rapportini con le sue
   * spese, una scadenza, una spesa, le ore di un mese): spuntate quelle il cui
   * importo (senza le spese anticipate) e' uguale al compenso dell'XML.
   */
  collegabili(idCliente, compenso) {
    const voci = this.sorgentiDaFatturare({ idCliente });
    const gruppi = new Map();
    for (const v of voci) {
      let g;
      let titolo;
      if (v.tipo === 'rapportino' || (v.tipo === 'spesa' && v.idRapportino)) {
        const mese = v.tipo === 'rapportino' ? v.data.slice(0, 7) : (voci.find(x => x.tipo === 'rapportino' && x.id === v.idRapportino) || v).data.slice(0, 7);
        g = 'rapportini:' + idCliente + ':' + mese;
        titolo = C.nomeMese(mese).replace(/^./, c => c.toUpperCase());
      } else if (v.tipo === 'ticket' || (v.tipo === 'spesa' && v.idTicket)) {
        // Fase 5: un ticket con le sue spese anticipate e' un gruppo solo.
        g = v.gruppo;
        titolo = 'Intervento ' + (v.tipo === 'ticket' ? v.id + ' · ' + v.titolo : v.idTicket);
      } else if (v.tipo === 'scadenza') { g = 'scadenza:' + v.id; titolo = v.titolo + ' · ' + v.idCommessa; }
      else if (v.tipo === 'spesa') { g = 'spesa:' + v.id; titolo = v.titolo; }
      else { g = v.gruppo; titolo = 'Ore di ' + C.nomeMese(v.data.slice(0, 7)) + ' · ' + v.idCommessa; }
      if (!gruppi.has(g)) gruppi.set(g, { gruppo: g, titolo, importo: 0, voci: [], rapportini: 0 });
      const x = gruppi.get(g);
      if (!v.anticipazione) x.importo = centesimi(x.importo + v.importo);
      if (v.tipo === 'rapportino') x.rapportini++;
      x.voci.push({ tipo: v.tipo, id: String(v.id) });
    }
    return Array.from(gruppi.values()).map(g => ({
      gruppo: g.gruppo, titolo: g.titolo + (g.rapportini ? ' · ' + g.rapportini + (g.rapportini === 1 ? ' rapportino' : ' rapportini') : ''),
      importo: g.importo, voci: g.voci, spuntato: numero(compenso) > 0 && centesimi(g.importo) === centesimi(numero(compenso)),
    }));
  },

  /** La proposta per una fattura ricevuta da un fornitore (§9.7). */
  propostaRicevuta(doc, visti) {
    const fornitore = this.soggettoPerFisco(doc.cedente.partitaIva, doc.cedente.codiceFiscale);
    const k = doc.conti;
    const out = {
      chiave: doc.chiave, nomeFile: doc.nomeFile, tipo: 'ricevuta', tipoDocumento: doc.tipoDocumento, numero: doc.numero, data: doc.data,
      controparte: { nome: doc.cedente.nomeVisto, partitaIva: chiavePiva(doc.cedente.partitaIva), codiceFiscale: doc.cedente.codiceFiscale, idSoggetto: fornitore ? fornitore.id : null },
      conti: { totale: k.totale, imponibile: centesimi(k.compenso + k.altre), iva: k.iva, contributo: k.contributo, bollo: k.bollo, ritenuta: k.ritenuta, netto: k.netto },
      scadenze: doc.scadenze.map(s => ({ data: s.data, importo: s.importo })),
      righe: doc.righe.map(r => ({ descrizione: r.descrizione, importo: r.prezzoTotale, natura: r.natura })),
      proposta: { azione: 'nuova' }, avvisi: [],
    };
    if (!fornitore) out.fornitoreNuovo = this.soggettoDaXml(doc.cedente);
    const chiave = this.chiaveRicevuta(doc.cedente.partitaIva || doc.cedente.codiceFiscale, doc.tipoDocumento, doc.data, doc.numero);
    if (visti.has(chiave)) {
      out.proposta = { azione: 'gia', idRicevuta: null };
      out.avvisi.push('C\'è due volte tra i file caricati: la prendo una volta sola');
      return out;
    }
    visti.set(chiave, doc.chiave);
    const gia = this.db.riga('SELECT * FROM fatture_ricevute WHERE chiave = ?', chiave);
    if (gia) {
      out.proposta = { azione: 'gia', idRicevuta: gia.id };
      out.avvisi.push('Già importata il ' + dataBreve(dataIso(gia.creato)));
      if (centesimi(gia.totale) !== centesimi(k.totale)) out.avvisi.push('C\'è già con importi diversi: tenuta quella di prima');
      return out;
    }
    if (!doc.scadenze.length) out.avvisi.push('Scadenza non scritta nella fattura: messa a 30 giorni');
    if (doc.tipoDocumento === 'TD04') {
      const coll = this.ricevutaCollegataDaXml(doc, fornitore);
      if (coll) out.ricevutaCollegata = { idRicevuta: coll.id, numero: coll.numero };
    }
    // Una spesa della fase 3 con lo stesso importo, vicina di data, dello stesso fornitore o con una descrizione simile.
    const simile = this.spesaSimile(doc, fornitore);
    if (simile) {
      out.proposta.idSpesa = simile.id;
      out.avvisi.push('Potrebbe essere la spesa del ' + dataBreve(simile.data) + ' di ' + C.euroIt(simile.importo) + ' €: collegala per non contarla due volte nei costi');
    }
    out.proposta.categoria = doc.casse.some(x => x.tipo === 'TC04' || x.tipo === 'TC17') || doc.ritenute.length ? 'consulenze' : 'altro';
    // Fase 6 (§8.5): "È dell'incarico IN/2026/004? Restano da fatturare 720,00" (uno solo: gia' scelto; piu' di uno: si sceglie).
    const incarichi = fornitore ? this.propostaIncarico(fornitore.id) : [];
    if (incarichi.length) {
      out.incarichi = incarichi;
      if (incarichi.length === 1) {
        out.proposta.idIncarico = incarichi[0].idIncarico;
        out.proposta.idCommessa = incarichi[0].idCommessa;
      }
      out.avvisi.push(incarichi.length === 1 ? incarichi[0].frase : 'Ha ' + incarichi.length + ' incarichi da fatturare: scegli quello giusto');
    }
    return out;
  },

  chiaveRicevuta(partitaIva, tipo, data, numeroFiscale) {
    return chiavePiva(partitaIva) + '|' + testo(tipo).toUpperCase() + '|' + String(data).slice(0, 4) + '|' + testo(numeroFiscale).toUpperCase().replace(/\s+/g, '');
  },

  ricevutaCollegataDaXml(doc, fornitore) {
    if (!fornitore) return null;
    for (const c of doc.fattureCollegate || []) {
      const r = this.db.riga("SELECT * FROM fatture_ricevute WHERE fornitore_id = ? AND UPPER(REPLACE(numero, ' ', '')) = ? AND stato = 'attiva' ORDER BY id DESC LIMIT 1",
        fornitore.id, testo(c.idDocumento).toUpperCase().replace(/\s+/g, ''));
      if (r) return r;
    }
    return null;
  },

  /** Una spesa (fase 3) che potrebbe essere la stessa fattura: giorno +-3, stesso importo, stesso fornitore o descrizione simile. */
  spesaSimile(doc, fornitore) {
    const totale = centesimi(doc.conti.totale);
    const lista = this.db.righe('SELECT * FROM spese WHERE tolta IS NULL AND data >= ? AND data <= ? AND ABS(importo - ?) < 0.005',
      C.giorniDopo(doc.data, -3), C.giorniDopo(doc.data, 3), totale);
    const parole = s => testo(s).toLowerCase().split(/[^a-zà-ù0-9]+/).filter(p => p.length >= 4);
    const delFornitore = new Set(parole(fornitore ? fornitore.nome : doc.cedente.nomeVisto).concat(parole(doc.righe.map(r => r.descrizione).join(' '))));
    return lista.find(s => !this.db.riga('SELECT id FROM fatture_ricevute WHERE spesa_id = ? AND stato = \'attiva\'', s.id) &&
      (lista.length === 1 || parole(s.descrizione).some(p => delFornitore.has(p)))) || null;
  },

  /** La proposta per un esito dello SDI (§9.6): si abbina col NomeFile. */
  propostaEsito(doc, tenuti) {
    const out = {
      chiave: doc.chiave, nomeFile: doc.nomeFile, tipo: 'esito', esito: doc.esito, nomeFileFattura: doc.nomeFileFattura, data: doc.data,
      errori: doc.errori, proposta: { azione: 'salta' }, avvisi: [],
    };
    const f = this.db.riga("SELECT * FROM fatture WHERE nome_file_sdi = ? AND stato IN ('emessa', 'annullata', 'pronta') ORDER BY id DESC LIMIT 1", doc.nomeFileFattura);
    if (f) {
      out.proposta = { azione: 'abbina', idFattura: f.id, riferimento: f.riferimento, numero: f.numero };
      if (doc.esito === 'scartata') out.avvisi.push('Lo SDI ha scartato la fattura ' + (f.numero || f.riferimento) + ': torna pronta, da correggere nel programma');
      return out;
    }
    const nellaLettura = tenuti.find(x => x.genere === 'fattura' && x.nomeFile === doc.nomeFileFattura);
    if (nellaLettura) {
      out.proposta = { azione: 'abbina', idFattura: null, chiaveFattura: nellaLettura.chiave };
      return out;
    }
    out.avvisi.push('Esito per un file che Wisper non ha');
    return out;
  },

  // ------------------------------------------------------------------ confermaXml: applicare le scelte

  /**
   * confermaXml {idLettura, scelte: [{chiave, azione, idFattura?, creaCliente?,
   * idCliente?, idCommessa?, collega?, libera?, idSpesa?, categoria?}]} (§11.1).
   * Tutto in una transazione. Un documento senza scelta si salta.
   */
  confermaXml(d) {
    this.pulisciLetture();
    const l = this.db.riga('SELECT * FROM letture_xml WHERE id = ?', testo(d.idLettura));
    const c = this.chi();
    if (!l || (c.utente && l.utente_id !== c.utente.id)) throw new Rifiuto('La lettura è scaduta: carica di nuovo i file');
    const studio = this.identitaStudio();
    const voci = JSON.parse(l.documenti);
    const scelte = new Map((Array.isArray(d.scelte) ? d.scelte : []).map(s => [testo(s && s.chiave), s]));
    const conteggi = { abbinate: 0, nuove: 0, ricevute: 0, note: 0, esiti: 0, saltate: 0 };
    const fatture = [];
    const ricevute = [];
    const avvisi = [];
    const perChiave = new Map();
    const fileDi = v => (v.doc.fileLettura ? fs.readFileSync(path.join(this.cartellaLetture(), path.basename(l.cartella), v.doc.fileLettura)) : null);
    // Prima le fatture, poi le note di credito, poi le ricevute, per ultimi gli esiti.
    const ordine = v => (v.doc.genere === 'esito' ? 3 : v.doc.lato === 'ricevuta' ? 2 : v.doc.tipoDocumento === 'TD04' ? 1 : 0);
    for (const v of voci.slice().sort((a, b) => ordine(a) - ordine(b) || a.i - b.i)) {
      const s = scelte.get(v.doc.chiave);
      const azione = s ? testo(s.azione) : 'salta';
      if (!s || azione === 'salta' || azione === 'gia') { conteggi.saltate++; continue; }
      const nome = v.doc.genere === 'esito' ? 'L\'esito ' + v.doc.nomeFile : (v.doc.lato === 'ricevuta' ? 'La fattura ricevuta ' : (v.doc.tipoDocumento === 'TD04' ? 'La nota di credito ' : 'La fattura ')) + v.doc.numero;
      if (v.doc.genere === 'esito') {
        const r = this.applicaEsito(v, s, perChiave);
        if (r) { conteggi.esiti++; fatture.push(r); } else { conteggi.saltate++; avvisi.push(nome + ': nessuna fattura a cui abbinarlo, saltato'); }
        continue;
      }
      if (v.doc.lato === 'ricevuta') {
        const r = this.creaRicevutaDaXml(v.doc, s, fileDi(v), studio);
        if (r) { conteggi.ricevute++; ricevute.push(r); } else { conteggi.saltate++; avvisi.push(nome + ': c\'è già, saltata'); }
        continue;
      }
      const chiave = this.chiaveFattura(v.doc.tipoDocumento, v.doc.data, v.doc.numero);
      const gia = this.db.riga('SELECT * FROM fatture WHERE chiave = ?', chiave);
      if (gia && !(gia.numero_da === 'mano' && !gia.file_id && azione === 'abbina')) { conteggi.saltate++; avvisi.push(nome + ': già importata, saltata'); continue; }
      let f;
      if (azione === 'abbina') {
        f = this.abbinaXml(v.doc, s, gia, fileDi(v), avvisi, nome);
        conteggi[v.doc.tipoDocumento === 'TD04' ? 'note' : 'abbinate']++;
      } else if (azione === 'senzaBozza') {
        f = this.creaEmessaSenzaBozza(v.doc, s, fileDi(v), avvisi, nome);
        conteggi[v.doc.tipoDocumento === 'TD04' ? 'note' : 'nuove']++;
      } else throw new Rifiuto(nome + ': scegli abbina, senzaBozza o salta');
      perChiave.set(v.doc.chiave, f.id);
      fatture.push(this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id)));
    }
    this.db.esegui('DELETE FROM letture_xml WHERE id = ?', l.id);
    fs.rmSync(path.join(this.cartellaLetture(), path.basename(l.cartella)), { recursive: true, force: true });
    this.aggiornaProposte();
    return { ok: true, conteggi, fatture, ricevute: ricevute.map(r => this.ricevutaCompleta(r)), avvisi };
  },

  /** Il cliente di un XML emesso: quello scelto, quello trovato, o creato dai dati dell'XML (se lo si chiede). */
  clienteDaScelta(doc, s, nome) {
    if (testo(s.idCliente)) {
      const c = this.db.riga('SELECT * FROM soggetti WHERE id = ?', testo(s.idCliente));
      if (!c) throw new Rifiuto(nome + ': cliente ' + testo(s.idCliente) + ' non trovato');
      return c;
    }
    const trovato = this.soggettoPerFisco(doc.cessionario.partitaIva, doc.cessionario.codiceFiscale);
    if (trovato) return trovato;
    if (si(s.creaCliente)) return this.creaSoggettoDaXml(doc.cessionario, true);
    throw new Rifiuto(nome + ': scegli il cliente o crealo dai dati dell\'XML');
  },

  /** Salva l'XML (o il .p7m) com'era, come file della fattura. */
  salvaFileXml(doc, dati, tipo, idFattura, idRicevuta) {
    if (!dati) return null;
    const f = this.salvaFile({
      dati, nome: doc.nomeFile, mime: /\.p7m$/i.test(doc.nomeFile) ? 'application/pkcs7-mime' : 'application/xml', tipo,
      fatturaId: idFattura || null, ricevutaId: idRicevuta || null,
    });
    return f.id;
  },

  /** Le righe dell'XML nella fattura (origine xml), coi gruppi della bozza dove l'importo combacia. */
  scriviRigheXml(f, doc) {
    for (const r of this.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND origine = 'xml'", f.id)) this.togliRiga(r, 'tolta: arriva un XML nuovo');
    const bozza = this.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND origine = 'bozza' ORDER BY ordine, id", f.id);
    const usate = new Set();
    doc.righe.forEach((r, i) => {
      const tipo = tipoRigaXml(r, doc);
      const b = bozza.find(x => !usate.has(x.id) && x.tipo === tipo && centesimi(x.importo) === centesimi(r.prezzoTotale));
      if (b) usate.add(b.id);
      this.inserisci('fattura_righe', {
        fattura_id: f.id, ordine: i + 1, origine: 'xml', gruppo: b ? b.gruppo : '', tipo, descrizione: r.descrizione,
        quantita: r.quantita, unita: r.unitaMisura, prezzo: r.prezzoUnitario, importo: centesimi(r.prezzoTotale), aliquota_iva: numero(r.aliquotaIva),
        natura: r.natura, soggetta_ritenuta: r.ritenuta ? 1 : 0, tributo_cliente: b ? b.tributo_cliente : 0, commessa_id: b ? b.commessa_id : (f.commessa_id || ''),
        periodo_da: r.periodoDa || '', periodo_a: r.periodoA || '', importo_sorgenti: b ? b.importo_sorgenti : null,
        codice: r.codice || '', sconto: Number(r.sconto) || 0,
      });
    });
  },

  /** Le rate dell'XML (DettaglioPagamento con la data); senza, una sola col netto. */
  scriviScadenzeXml(f, doc, giorni) {
    for (const x of this.db.righe('SELECT * FROM fattura_scadenze WHERE fattura_id = ?', f.id)) {
      this.db.esegui('DELETE FROM fattura_scadenze WHERE id = ?', x.id);
      this.annota('fattura_scadenze', x.id, Object.assign({}, x), null, 'tolta: le scadenze arrivano dall\'XML');
    }
    const rate = doc.scadenze.length ? doc.scadenze : [{ data: C.scadenzaFattura(doc.data, giorni, false), importo: doc.conti.netto, modalita: 'MP05', iban: '' }];
    rate.forEach((x, i) => this.inserisci('fattura_scadenze', {
      fattura_id: f.id, ordine: i + 1, data: x.data, importo: centesimi(numero(x.importo)), modalita: testo(x.modalita), iban: testo(x.iban),
    }));
  },

  /** I conti dell'XML nelle colonne della fattura. */
  contiPerDb(doc) {
    const k = doc.conti;
    return {
      compenso: k.compenso, contributo: k.contributo, base_iva: k.baseIva, iva: k.iva, anticipazioni: k.anticipazioni, bollo: k.bollo,
      bollo_addebitato: k.bolloAddebitato, totale: k.totale, ritenuta: k.ritenuta, netto: k.netto,
    };
  },

  /**
   * Abbina un XML emesso alla sua bozza (o pronta), o lo attacca a un'emessa a
   * mano con lo stesso numero. Vince l'XML; i gruppi che mancano per intero
   * dall'XML tornano da fatturare se scelti (libera).
   */
  abbinaXml(doc, s, giaAMano, dati, avvisi, nome) {
    const nota = doc.tipoDocumento === 'TD04';
    let f = giaAMano || (s.idFattura ? this.db.riga('SELECT * FROM fatture WHERE id = ?', Number(s.idFattura)) : null);
    if (!f) throw new Rifiuto(nome + ': scegli la bozza a cui abbinarla');
    if (!giaAMano && VIVE.indexOf(f.stato) < 0) throw new Rifiuto(nome + ': la ' + f.riferimento + ' non è più una bozza (' + this.etichettaFattura(f) + ')');
    if ((f.tipo === 'nota') !== nota) throw new Rifiuto(nome + ': ' + (nota ? 'una nota di credito si abbina a una bozza di nota' : 'una fattura non si abbina a una bozza di nota di credito'));
    const cliente = this.clienteDaScelta(doc, s, nome);
    if (cliente.id !== f.cliente_id) throw new Rifiuto(nome + ' è per ' + cliente.nome + ': la ' + f.riferimento + ' è per un altro cliente');
    if (f.stato === 'bozza') this.ricalcolaFattura(f.id);
    f = this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id);
    const confronto = this.confrontaConXml(f, doc);
    const diversa = centesimi(f.totale) !== centesimi(doc.conti.totale) || centesimi(f.netto) !== centesimi(doc.conti.netto);
    const numeroFiscale = testo(doc.numero);
    const ora = adesso();
    const fileId = this.salvaFileXml(doc, dati, 'fattura', f.id, null);
    const regole = this.regoleConfermate();
    this.aggiorna('fatture', f.id, Object.assign({
      stato: 'emessa', numero: numeroFiscale, numero_da: 'xml', data: doc.data, tipo_documento: doc.tipoDocumento,
      chiave: this.chiaveFattura(doc.tipoDocumento, doc.data, numeroFiscale), emessa_il: f.emessa_il || ora, file_id: fileId, nome_file_sdi: doc.nomeFile,
      totale_bozza: diversa ? f.totale : null, netto_bozza: diversa ? f.netto : null,
      regole_confermate: f.regole_confermate || (regole ? regole.data : ''), esito_sdi: '', esito_il: '', modificato: ora,
    }, this.contiPerDb(doc)), 'id', giaAMano ? 'XML attaccato alla fattura emessa a mano: ' + doc.nomeFile : 'emessa dall\'XML ' + doc.nomeFile);
    this.scriviRigheXml(f, doc);
    this.scriviScadenzeXml(f, doc, f.giorni_pagamento);
    // I gruppi che tornano da fatturare: solo quelli che mancano per intero dall'XML.
    const libera = (Array.isArray(s.libera) ? s.libera : []).map(testo).filter(Boolean);
    const daLiberare = libera.filter(g => confronto.gruppiInteri.indexOf(g) >= 0);
    for (const g of libera.filter(g => daLiberare.indexOf(g) < 0)) avvisi.push(nome + ': il gruppo ' + g + ' è (almeno in parte) nell\'XML: resta fatturato');
    const etichetta = 'non è nella fattura ' + numeroFiscale;
    for (const g of daLiberare) {
      const sorgenti = this.db.righe('SELECT * FROM fattura_sorgenti WHERE fattura_id = ? AND gruppo = ? AND attiva = 1', f.id, g);
      this.liberaGruppo(f.id, g, etichetta);
      if (giaAMano) for (const x of sorgenti) this.togliFatturata(x.tipo, x.sorgente_id, etichetta);
      for (const r of this.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND origine = 'bozza' AND gruppo = ?", f.id, g)) this.togliRiga(r, 'tolta: ' + etichetta);
    }
    const dopo = this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id);
    if (!giaAMano) this.dopoEmissione(dopo);
    return dopo;
  },

  /**
   * Una fattura emessa senza bozza (§9.4): righe e importi dell'XML, senza
   * sorgenti, se non quelle che si chiede di collegare (collega), che diventano
   * fatturate. Una nota senza bozza libera i gruppi scelti della fattura che corregge.
   */
  creaEmessaSenzaBozza(doc, s, dati, avvisi, nome) {
    const nota = doc.tipoDocumento === 'TD04';
    const cliente = this.clienteDaScelta(doc, s, nome);
    const imp = this.leggiImpostazioni();
    const iva = doc.riepilogo.find(r => numero(r.aliquotaIva) > 0);
    const cassa = doc.casse[0];
    const rit = doc.ritenute[0];
    let collegata = null;
    if (nota) {
      collegata = s.idFattura ? this.db.riga("SELECT * FROM fatture WHERE id = ? AND tipo = 'fattura'", Number(s.idFattura)) : this.fatturaCollegataDaXml(doc, cliente);
      if (collegata && collegata.cliente_id !== cliente.id) throw new Rifiuto(nome + ': la fattura collegata è di un altro cliente');
    }
    let idCommessa = testo(s.idCommessa);
    if (idCommessa) {
      const m = this.db.riga('SELECT id FROM commesse WHERE id = ?', idCommessa);
      if (!m) throw new Rifiuto(nome + ': commessa ' + idCommessa + ' non trovata');
      idCommessa = m.id;
    }
    const numeroFiscale = testo(doc.numero);
    const ora = adesso();
    const par = this.parametriFiscali(cliente);
    const id = this.creaBozza(Object.assign({}, par, {
      tipo: nota ? 'nota' : 'fattura', tipo_documento: doc.tipoDocumento, fattura_collegata_id: collegata ? collegata.id : null, cliente_id: cliente.id,
      commessa_id: idCommessa || (collegata ? collegata.commessa_id : ''), data: doc.data,
      causale: doc.causale.join(' ').replace(/\s*Rif\. Wisper W-\d+/g, '').trim(),
      regime: doc.cedente.regimeFiscale === 'RF19' ? 'forfettario' : 'ordinario',
      iva_percentuale: iva ? numero(iva.aliquotaIva) : numero(imp.IVA), eppi_percentuale: cassa ? numero(cassa.aliquota) : 0,
      ritenuta_percentuale: rit ? numero(rit.aliquota) : this.percentualeRitenuta(), ritenuta_applicata: doc.ritenute.length ? 1 : 0,
    }));
    const fileId = this.salvaFileXml(doc, dati, 'fattura', id, null);
    this.aggiorna('fatture', id, Object.assign({
      stato: 'emessa', numero: numeroFiscale, numero_da: 'xml', chiave: this.chiaveFattura(doc.tipoDocumento, doc.data, numeroFiscale),
      emessa_il: ora, file_id: fileId, nome_file_sdi: doc.nomeFile, modificato: ora,
    }, this.contiPerDb(doc)), 'id', 'emessa dall\'XML ' + doc.nomeFile + ' (senza bozza)');
    const f = this.db.riga('SELECT * FROM fatture WHERE id = ?', id);
    this.scriviRigheXml(f, doc);
    this.scriviScadenzeXml(f, doc, par.giorni_pagamento);
    if (nota) {
      if (collegata) {
        const possibili = this.gruppiDellaFattura(collegata.id).map(g => g.gruppo);
        const libera = (Array.isArray(s.libera) ? s.libera : []).map(testo).filter(g => possibili.indexOf(g) >= 0);
        this.effettiNota(this.db.riga('SELECT * FROM fatture WHERE id = ?', id), libera);
      }
      return this.db.riga('SELECT * FROM fatture WHERE id = ?', id);
    }
    // collega: le cose da fatturare che questa fattura ha gia' fatturato (escono da Da fatturare).
    const collega = Array.isArray(s.collega) ? s.collega : [];
    if (collega.length) {
      const libere = new Map(this.sorgentiDaFatturare({ idCliente: cliente.id }).map(v => [v.tipo + '|' + v.id, v]));
      const perGruppo = new Map();
      for (const x of collega) {
        const k = testo(x && x.tipo) + '|' + testo(x && x.id);
        const v = libere.get(k);
        if (!v) {
          const a = this.sorgenteAttiva(testo(x && x.tipo), testo(x && x.id));
          throw new Rifiuto(a ? this.fraseGiaRiservata(testo(x.tipo), testo(x.id), a) : nome + ': ' + this.nomeSorgente(testo(x.tipo), testo(x.id)).replace(/^./, c => c.toLowerCase()) + ' non è da fatturare per ' + cliente.nome);
        }
        const g = v.tipo === 'scadenza' ? 'scadenza:' + v.id : v.tipo === 'spesa' && !v.idRapportino && !v.idTicket ? 'spesa:' + v.id : v.gruppo;
        if (!perGruppo.has(g)) perGruppo.set(g, []);
        if (!perGruppo.get(g).some(x => x.tipo === v.tipo && x.id === String(v.id))) perGruppo.get(g).push({ tipo: v.tipo, id: String(v.id), importo: v.importo });
        // Fase 5: un ticket porta con se' le sorgenti che ha dentro (rapportini, spese, ore), nello stesso gruppo.
        if (v.tipo === 'ticket') {
          for (const s of v.voceTicket.gruppi[0].sorgenti) if (s.tipo !== 'ticket' && !perGruppo.get(g).some(x => x.tipo === s.tipo && x.id === String(s.id))) perGruppo.get(g).push({ tipo: s.tipo, id: String(s.id), importo: s.importo });
        }
      }
      for (const [g, sorgenti] of perGruppo) this.legaSorgenti(id, g, sorgenti);
      // Con un gruppo solo, le righe dell'XML sono sue: cosi' una nota di credito che le storna lo libera.
      if (perGruppo.size === 1) {
        const g = Array.from(perGruppo.keys())[0];
        this.db.esegui("UPDATE fattura_righe SET gruppo = ? WHERE fattura_id = ? AND origine = 'xml' AND tipo <> 'bollo'", g, id);
      }
      this.dopoEmissione(f);
    }
    return this.db.riga('SELECT * FROM fatture WHERE id = ?', id);
  },

  /**
   * Un esito dello SDI. RC (consegnata) e MC (non consegnata ma a disposizione:
   * la fattura vale) si scrivono e basta. NS (scartata): la fattura torna
   * pronta, gli effetti dell'emissione si tolgono e le sorgenti restano sue.
   */
  applicaEsito(v, s, perChiave) {
    const doc = v.doc;
    let id = s.idFattura ? Number(s.idFattura) : (v.proposta && v.proposta.proposta ? v.proposta.proposta.idFattura : null);
    if (!id && v.proposta && v.proposta.proposta && v.proposta.proposta.chiaveFattura) id = perChiave.get(v.proposta.proposta.chiaveFattura) || null;
    if (!id) {
      const f = this.db.riga("SELECT * FROM fatture WHERE nome_file_sdi = ? AND stato IN ('emessa', 'annullata', 'pronta') ORDER BY id DESC LIMIT 1", doc.nomeFileFattura);
      id = f ? f.id : null;
    }
    const f = id ? this.db.riga('SELECT * FROM fatture WHERE id = ?', id) : null;
    if (!f || f.nome_file_sdi !== doc.nomeFileFattura) return null;
    const quando = doc.data || oggi();
    if (doc.esito !== 'scartata') {
      if (f.stato === 'pronta') return null;
      this.aggiorna('fatture', f.id, { esito_sdi: doc.esito, esito_il: quando, modificato: adesso() }, 'id',
        doc.esito === 'consegnata' ? 'consegnata dallo SDI' : 'non consegnata dallo SDI: è nell\'area riservata del cliente');
      return this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id));
    }
    if (f.stato === 'pronta' && f.esito_sdi === 'scartata') return this.fatturaCompleta(f);
    const etichetta = 'la fattura ' + (f.numero || f.riferimento) + ' è stata scartata dallo SDI';
    if (f.tipo === 'nota') this.ripristinaDaNota(f);
    else {
      for (const x of this.db.righe('SELECT * FROM fattura_sorgenti WHERE fattura_id = ? AND attiva = 1', f.id)) this.togliFatturata(x.tipo, x.sorgente_id, etichetta);
    }
    // Torna come prima dell'XML: le righe della bozza (se una fattura nata senza bozza non ne ha, quelle dell'XML lo diventano).
    const bozza = this.db.righe("SELECT id FROM fattura_righe WHERE fattura_id = ? AND origine = 'bozza'", f.id);
    if (bozza.length) for (const r of this.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND origine = 'xml'", f.id)) this.togliRiga(r, 'tolta: ' + etichetta);
    else this.db.esegui("UPDATE fattura_righe SET origine = 'bozza' WHERE fattura_id = ? AND origine = 'xml'", f.id);
    this.aggiorna('fatture', f.id, {
      stato: 'pronta', esito_sdi: 'scartata', esito_il: quando, numero: '', numero_da: '', chiave: null, file_id: null, emessa_il: '',
      totale_bozza: null, netto_bozza: null, pronta_il: f.pronta_il || adesso(), modificato: adesso(),
    }, 'id', 'scartata dallo SDI');
    this.ricalcolaFattura(f.id);
    return this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id));
  },

  /**
   * Una nota di credito scartata dallo SDI non vale: le cose che aveva fatto
   * tornare da fatturare tornano alla loro fattura (se nel frattempo non sono
   * finite in un'altra), e la fattura non e' piu' annullata.
   */
  ripristinaDaNota(nota) {
    if (!nota.fattura_collegata_id) return;
    const f = this.db.riga('SELECT * FROM fatture WHERE id = ?', nota.fattura_collegata_id);
    if (!f) return;
    const perche = 'nota di credito ' + (nota.numero || nota.riferimento);
    for (const x of this.db.righe('SELECT * FROM fattura_sorgenti WHERE fattura_id = ? AND attiva = 0 AND liberata_perche = ?', f.id, perche)) {
      if (this.sorgenteAttiva(x.tipo, x.sorgente_id)) continue;
      this.aggiorna('fattura_sorgenti', x.id, { attiva: 1, liberata_il: '', liberata_perche: '' }, 'id', 'la nota di credito ' + (nota.numero || nota.riferimento) + ' è stata scartata dallo SDI');
      if (f.stato === 'emessa' || f.stato === 'annullata') this.segnaSorgenteFatturata(x.tipo, x.sorgente_id, f.data, f.id, 'di nuovo dalla fattura ' + (f.numero || f.riferimento));
    }
    if (f.stato === 'annullata') this.aggiorna('fatture', f.id, { stato: 'emessa', annullata_il: '', modificato: adesso() }, 'id', 'non più annullata: la nota di credito è stata scartata dallo SDI');
  },

  // ------------------------------------------------------------------ fatture ricevute

  /** Crea la fattura ricevuta dall'XML (fornitore nuovo se serve). Torna la riga, o null se c'e' gia'. */
  creaRicevutaDaXml(doc, s, dati) {
    const fornitore = testo(s.idFornitore)
      ? this.db.riga('SELECT * FROM soggetti WHERE id = ?', testo(s.idFornitore))
      : this.creaSoggettoDaXml(doc.cedente, false);
    if (!fornitore) throw new Rifiuto('Fornitore ' + testo(s.idFornitore) + ' non trovato');
    const chiave = this.chiaveRicevuta(doc.cedente.partitaIva || doc.cedente.codiceFiscale, doc.tipoDocumento, doc.data, doc.numero);
    if (this.db.riga('SELECT id FROM fatture_ricevute WHERE chiave = ?', chiave)) return null;
    const k = doc.conti;
    const categoria = CATEGORIE.indexOf(testo(s.categoria)) >= 0 ? testo(s.categoria) : (doc.ritenute.length || doc.casse.length ? 'consulenze' : 'altro');
    let idCommessa = '';
    if (testo(s.idCommessa)) {
      const m = this.db.riga('SELECT id FROM commesse WHERE id = ?', testo(s.idCommessa));
      if (!m) throw new Rifiuto('Commessa ' + testo(s.idCommessa) + ' non trovata');
      idCommessa = m.id;
    }
    let idSpesa = null;
    if (testo(s.idSpesa)) {
      const sp = this.db.riga('SELECT id FROM spese WHERE id = ?', Number(s.idSpesa));
      if (!sp) throw new Rifiuto('Spesa ' + testo(s.idSpesa) + ' non trovata');
      idSpesa = sp.id;
    }
    // Fase 6: l'incarico del collaboratore (la ricevuta prende la sua commessa), il mezzo, lo strumento.
    const legami6 = this.legamiRicevuta6(s, fornitore.id);
    if (legami6.incarico_id && !idCommessa) idCommessa = legami6.commessa;
    delete legami6.commessa;
    const collegata = doc.tipoDocumento === 'TD04' ? this.ricevutaCollegataDaXml(doc, fornitore) : null;
    const ora = adesso();
    const c = this.chi();
    const id = this.inserisci('fatture_ricevute', {
      fornitore_id: fornitore.id, tipo_documento: doc.tipoDocumento, numero: testo(doc.numero), data: doc.data, chiave,
      descrizione: doc.righe.map(r => r.descrizione).filter(Boolean).slice(0, 3).join('; ').slice(0, 300), categoria, commessa_id: idCommessa, spesa_id: idSpesa,
      imponibile: centesimi(k.compenso + k.altre), iva: k.iva, contributo: k.contributo, bollo: k.bollo, totale: k.totale, ritenuta: k.ritenuta, netto: k.netto,
      ricevuta_collegata_id: collegata ? collegata.id : null, stato: 'attiva', origine: 'xml', nome_file_sdi: doc.nomeFile,
      scadenza_stimata: doc.scadenze.length ? 0 : 1, note: testo(s.note), utente_id: c.utente ? c.utente.id : null, creato: ora, modificato: ora,
      incarico_id: legami6.incarico_id || null, veicolo_id: legami6.veicolo_id || null, attrezzatura_id: legami6.attrezzatura_id || null,
    }, 'id', 'dall\'XML ' + doc.nomeFile);
    const fileId = this.salvaFileXml(doc, dati, 'ricevuta', null, id);
    if (fileId) this.aggiorna('fatture_ricevute', id, { file_id: fileId });
    const rate = doc.scadenze.length ? doc.scadenze : [{ data: C.giorniDopo(doc.data, 30), importo: k.netto, modalita: '', iban: '' }];
    rate.forEach((x, i) => this.inserisci('ricevuta_scadenze', {
      ricevuta_id: id, ordine: i + 1, data: x.data, importo: centesimi(numero(x.importo)), modalita: testo(x.modalita), iban: testo(x.iban),
    }));
    return this.db.riga('SELECT * FROM fatture_ricevute WHERE id = ?', id);
  },

  /**
   * Fase 6: idIncarico (dello stesso fornitore, non annullato: la ricevuta prende la sua commessa), idVeicolo,
   * idAttrezzatura di una fattura ricevuta. Torna le colonne (e "commessa", la commessa dell'incarico).
   */
  legamiRicevuta6(x, idFornitore) {
    const v = {};
    if (x.idIncarico !== undefined) {
      if (!testo(x.idIncarico)) v.incarico_id = null;
      else {
        const i = this.incaricoPerRicevuta(x.idIncarico, idFornitore);
        v.incarico_id = i.id;
        v.commessa = i.commessa_id;
      }
    }
    if (x.idVeicolo !== undefined) {
      v.veicolo_id = testo(x.idVeicolo) ? Number(x.idVeicolo) : null;
      if (v.veicolo_id !== null && !this.db.riga('SELECT id FROM veicoli WHERE id = ?', v.veicolo_id)) throw new Rifiuto('Mezzo ' + v.veicolo_id + ' non trovato');
    }
    if (x.idAttrezzatura !== undefined) {
      v.attrezzatura_id = testo(x.idAttrezzatura) ? Number(x.idAttrezzatura) : null;
      if (v.attrezzatura_id !== null && !this.db.riga('SELECT id FROM attrezzature WHERE id = ?', v.attrezzatura_id)) throw new Rifiuto('Attrezzatura ' + v.attrezzatura_id + ' non trovata');
    }
    return v;
  },

  rigaRicevuta(id) {
    const r = this.db.riga('SELECT * FROM fatture_ricevute WHERE id = ?', Number(id) || 0);
    if (!r) throw new Rifiuto('Fattura ricevuta ' + testo(id) + ' non trovata');
    return r;
  },

  /** I pagamenti di piu' ricevute: idRicevuta -> [{idMovimento, data, importo, conto, verificato}]. */
  pagamentiRicevute(ids) {
    const per = {};
    if (!ids.length) return per;
    const conti = {};
    this.db.righe('SELECT * FROM conti').forEach(c => { conti[c.id] = c; });
    for (const r of this.db.righe('SELECT a.ricevuta_id, a.importo, m.id idm, m.data, m.conto_id, m.verificato FROM movimento_abbinamenti a JOIN movimenti m ON m.id = a.movimento_id ' +
      'WHERE m.annullato = 0 AND a.ricevuta_id IN (' + ids.map(Number).join(',') + ') ORDER BY m.data, m.id')) {
      (per[r.ricevuta_id] = per[r.ricevuta_id] || []).push({ idMovimento: r.idm, data: r.data, importo: centesimi(r.importo), conto: this.nomeConto(conti[r.conto_id]), verificato: r.verificato === 1 });
    }
    return per;
  },

  /** Quanto resta da pagare di una ricevuta (netto - pagato - note di credito del fornitore), e se e' scaduta. */
  statoRicevuta(r, a) {
    const pagamenti = (a.pagamenti[r.id] || []);
    const pagato = centesimi(pagamenti.reduce((t, x) => t + x.importo, 0));
    // Fase 8 (prova di carico): le note di credito lette una volta per tutte in aiutiRicevute (stesso ordine, le righe).
    const note = a.note && a.noteDi.has(Number(r.id)) ? a.note[r.id] || [] : this.db.righe("SELECT netto FROM fatture_ricevute WHERE ricevuta_collegata_id = ? AND stato = 'attiva'", r.id);
    const noteNetto = centesimi(note.reduce((t, n) => t + numero(n.netto), 0));
    const scadenze = a.scadenze[r.id] || [];
    if (r.tipo_documento === 'TD04') return { pagato: 0, daPagare: 0, scaduta: false, giorniScaduta: 0, coperture: scadenze.map(() => 0), pagamenti };
    const daPagare = r.stato === 'annullata' ? 0 : Math.max(0, centesimi(numero(r.netto) - pagato - noteNetto));
    let disponibile = centesimi(pagato + noteNetto);
    const coperture = scadenze.map(s => { const c = Math.max(0, Math.min(numero(s.importo), disponibile)); disponibile = centesimi(disponibile - c); return centesimi(c); });
    const prima = scadenze.find((s, i) => coperture[i] < centesimi(numero(s.importo)) - 0.001);
    const scaduta = daPagare > 0 && !!prima && prima.data < oggi();
    return { pagato, daPagare, scaduta, giorniScaduta: scaduta ? Math.round((Date.parse(oggi() + 'T12:00:00') - Date.parse(prima.data + 'T12:00:00')) / 86400000) : 0, coperture, pagamenti };
  },

  aiutiRicevute(righe) {
    const ids = righe.map(r => r.id);
    const a = { pagamenti: this.pagamentiRicevute(ids), scadenze: {}, soggetti: {}, commesse: {} };
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { a.soggetti[s.id] = s.nome; });
    this.db.righe('SELECT id, descrizione FROM commesse').forEach(m => { a.commesse[String(m.id).toUpperCase()] = m.descrizione; });
    if (ids.length) this.db.righe('SELECT * FROM ricevuta_scadenze WHERE ricevuta_id IN (' + ids.map(Number).join(',') + ') ORDER BY data, ordine, id')
      .forEach(s => { (a.scadenze[s.ricevuta_id] = a.scadenze[s.ricevuta_id] || []).push(s); });
    if (ids.length) {
      a.note = {};
      a.noteDi = new Set(ids.map(Number));
      this.db.righe("SELECT ricevuta_collegata_id, netto FROM fatture_ricevute WHERE stato = 'attiva' AND ricevuta_collegata_id IN (" + ids.map(Number).join(',') + ') ORDER BY rowid')
        .forEach(n => { (a.note[n.ricevuta_collegata_id] = a.note[n.ricevuta_collegata_id] || []).push({ netto: n.netto }); });
    }
    return a;
  },

  /** Una fattura ricevuta come la vedono le app. */
  ricevutaCompleta(r, a) {
    a = a || this.aiutiRicevute([r]);
    const st = this.statoRicevuta(r, a);
    const scadenze = a.scadenze[r.id] || [];
    let statoVisto;
    if (r.stato === 'annullata') statoVisto = 'Annullata';
    else if (r.tipo_documento === 'TD04') statoVisto = 'Nota di credito';
    else if (st.daPagare <= 0) statoVisto = 'Pagata';
    else if (st.scaduta) statoVisto = 'Scaduta';
    else if (st.pagato > 0) statoVisto = 'Pagata in parte';
    else statoVisto = 'Da pagare';
    const file = r.file_id ? this.db.riga('SELECT id, nome FROM file WHERE id = ?', r.file_id) : null;
    return {
      id: r.id, idFornitore: r.fornitore_id, fornitore: a.soggetti[r.fornitore_id] || '', tipoDocumento: r.tipo_documento, numero: r.numero, data: r.data,
      descrizione: r.descrizione, categoria: r.categoria, idCommessa: r.commessa_id || '', commessa: r.commessa_id ? a.commesse[String(r.commessa_id).toUpperCase()] || '' : '',
      idSpesa: r.spesa_id === null ? null : r.spesa_id, imponibile: r.imponibile, iva: r.iva, contributo: r.contributo, bollo: r.bollo, totale: r.totale,
      ritenuta: r.ritenuta, netto: r.netto, pagato: st.pagato, daPagare: st.daPagare, stato: r.stato, statoVisto, scaduta: st.scaduta, giorniScaduta: st.giorniScaduta,
      scadenze: scadenze.map((s, i) => ({ id: s.id, data: s.data, importo: s.importo, coperta: st.coperture[i] || 0 })), scadenzaStimata: r.scadenza_stimata === 1,
      pagamenti: st.pagamenti, idRicevutaCollegata: r.ricevuta_collegata_id === null ? null : r.ricevuta_collegata_id, origine: r.origine,
      file: file ? { id: file.id, url: '/file/' + file.id, nome: file.nome } : null, nomeFileSdi: r.nome_file_sdi, note: r.note, motivo: r.motivo,
      puoScrivere: this.livello('fatturazione') >= 2, creato: dataOraIso(r.creato), modificato: dataOraIso(r.modificato),
      // Fase 6: l'incarico del collaboratore esterno, il mezzo, lo strumento.
      idIncarico: r.incarico_id === null || r.incarico_id === undefined ? null : r.incarico_id,
      incarico: r.incarico_id ? (this.db.riga('SELECT numero FROM incarichi WHERE id = ?', r.incarico_id) || {}).numero || '' : '',
      idVeicolo: r.veicolo_id === null || r.veicolo_id === undefined ? null : r.veicolo_id,
      idAttrezzatura: r.attrezzatura_id === null || r.attrezzatura_id === undefined ? null : r.attrezzatura_id,
    };
  },

  /** ricevute {stato?: da_pagare|pagate|tutte, idFornitore?, idCommessa?, testo?, anno?}: le piu' recenti prima. */
  leggiRicevute(d) {
    d = d || {};
    const cond = [];
    const par = [];
    if (testo(d.idFornitore)) { cond.push('fornitore_id = ?'); par.push(testo(d.idFornitore)); }
    if (testo(d.idCommessa)) { cond.push('commessa_id = ? COLLATE NOCASE'); par.push(testo(d.idCommessa)); }
    if (testo(d.anno)) { cond.push('substr(data, 1, 4) = ?'); par.push(testo(d.anno)); }
    // Fase 6
    if (testo(d.idIncarico)) { cond.push('incarico_id = ?'); par.push(Number(d.idIncarico)); }
    if (testo(d.idVeicolo)) { cond.push('veicolo_id = ?'); par.push(Number(d.idVeicolo)); }
    const righe = this.db.righe('SELECT * FROM fatture_ricevute' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') + ' ORDER BY data DESC, id DESC', ...par);
    const a = this.aiutiRicevute(righe);
    let lista = righe.map(r => this.ricevutaCompleta(r, a));
    const stato = testo(d.stato) || 'tutte';
    if (['da_pagare', 'pagate', 'tutte'].indexOf(stato) < 0) throw new Rifiuto('Stato: da_pagare, pagate o tutte');
    if (stato === 'da_pagare') lista = lista.filter(r => r.stato === 'attiva' && r.daPagare > 0);
    if (stato === 'pagate') lista = lista.filter(r => r.stato === 'attiva' && r.tipoDocumento !== 'TD04' && r.daPagare <= 0);
    const cerca = testo(d.testo).toLowerCase();
    if (cerca) lista = lista.filter(r => [r.numero, r.fornitore, r.descrizione, r.note].some(x => String(x || '').toLowerCase().indexOf(cerca) >= 0));
    return lista;
  },

  /**
   * salvaRicevuta {ricevuta: {...}}: a mano tutto; per quelle arrivate
   * dall'XML solo categoria, commessa, spesa, note e le scadenze se stimate.
   */
  salvaRicevuta(d) {
    const x = d.ricevuta || d;
    const prima = testo(x.id) ? this.rigaRicevuta(x.id) : null;
    if (prima && prima.stato === 'annullata') throw new Rifiuto('La fattura ricevuta ' + prima.numero + ' è annullata: non si cambia');
    const v = {};
    if (x.categoria !== undefined) {
      const cat = testo(x.categoria) || 'altro';
      if (CATEGORIE.indexOf(cat) < 0) throw new Rifiuto('Categoria: ' + CATEGORIE.slice(0, -1).join(', ') + ' o altro');
      v.categoria = cat;
    }
    if (x.idCommessa !== undefined) {
      if (!testo(x.idCommessa)) v.commessa_id = '';
      else {
        const m = this.db.riga('SELECT id FROM commesse WHERE id = ?', testo(x.idCommessa));
        if (!m) throw new Rifiuto('Commessa ' + testo(x.idCommessa) + ' non trovata');
        v.commessa_id = m.id;
      }
    }
    if (x.idSpesa !== undefined) {
      if (!testo(x.idSpesa)) v.spesa_id = null;
      else {
        const s = this.db.riga('SELECT id FROM spese WHERE id = ?', Number(x.idSpesa));
        if (!s) throw new Rifiuto('Spesa ' + testo(x.idSpesa) + ' non trovata');
        v.spesa_id = s.id;
      }
    }
    if (x.note !== undefined) v.note = testo(x.note);
    const daXml = prima && prima.origine === 'xml';
    // Fase 6: l'incarico (dello stesso fornitore: la ricevuta prende la sua commessa), il mezzo, lo strumento.
    const fornitoreDi = x.idFornitore !== undefined ? testo(x.idFornitore) : prima ? prima.fornitore_id : '';
    const legami6 = this.legamiRicevuta6(x, fornitoreDi);
    if (legami6.commessa && x.idCommessa === undefined) v.commessa_id = legami6.commessa;
    delete legami6.commessa;
    Object.assign(v, legami6);
    if (!daXml) {
      if (x.descrizione !== undefined) v.descrizione = testo(x.descrizione);
      const fornitoreId = x.idFornitore !== undefined ? testo(x.idFornitore) : prima ? prima.fornitore_id : '';
      const fornitore = this.db.riga('SELECT * FROM soggetti WHERE id = ?', fornitoreId);
      if (!fornitore) throw new Rifiuto('Fornitore: scegli il fornitore');
      v.fornitore_id = fornitore.id;
      const n = x.numero !== undefined ? testo(x.numero) : prima ? prima.numero : '';
      if (!n) throw new Rifiuto('Numero: scrivi il numero della fattura');
      v.numero = n;
      v.data = x.data !== undefined ? dataDaIso(x.data) : prima ? prima.data : oggi();
      const totale = x.totale !== undefined ? centesimi(numero(x.totale)) : prima ? prima.totale : 0;
      if (!(totale > 0)) throw new Rifiuto('Totale: scrivi quanto');
      const ritenuta = x.ritenuta !== undefined ? centesimi(numero(x.ritenuta)) : prima ? prima.ritenuta : 0;
      if (ritenuta < 0 || ritenuta >= totale) throw new Rifiuto('Ritenuta: deve essere meno del totale');
      v.totale = totale;
      v.ritenuta = ritenuta;
      v.netto = centesimi(totale - ritenuta);
      v.iva = x.iva !== undefined ? centesimi(numero(x.iva)) : prima ? prima.iva : 0;
      v.imponibile = x.imponibile !== undefined ? centesimi(numero(x.imponibile)) : prima ? prima.imponibile : centesimi(totale - v.iva);
      // Fase 6: la prestazione occasionale si registra a mano come ricevuta (con la ritenuta proposta del 20%).
      const occasionale = testo(x.tipoDocumento) === 'occasionale' || (prima && prima.tipo_documento === 'occasionale');
      v.tipo_documento = occasionale ? 'occasionale' : 'TD01';
      if (occasionale && x.ritenuta === undefined && !prima) {
        v.ritenuta = centesimi(numero(v.imponibile) * 0.2);
        v.netto = centesimi(totale - v.ritenuta);
      }
      v.chiave = this.chiaveRicevuta(fornitore.partita_iva || fornitore.codice_fiscale || fornitore.id, v.tipo_documento === 'occasionale' ? 'OCC' : 'TD01', v.data, n);
      const doppia = this.db.riga('SELECT id FROM fatture_ricevute WHERE chiave = ? AND id <> ?', v.chiave, prima ? prima.id : 0);
      if (doppia) throw new Rifiuto('C\'è già la fattura ' + n + ' di ' + fornitore.nome);
    }
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('fatture_ricevute', id, Object.assign(v, { modificato: ora }));
    } else {
      const c = this.chi();
      id = this.inserisci('fatture_ricevute', Object.assign({ categoria: 'altro', stato: 'attiva', origine: 'mano', utente_id: c.utente ? c.utente.id : null, creato: ora, modificato: ora }, v));
    }
    const r = this.db.riga('SELECT * FROM fatture_ricevute WHERE id = ?', id);
    // Le scadenze: a mano sempre; per quelle dall'XML solo se erano stimate.
    if (x.scadenze !== undefined || !prima) {
      if (daXml && r.scadenza_stimata !== 1 && x.scadenze !== undefined) throw new Rifiuto('Le scadenze di questa fattura sono scritte nell\'XML: non si cambiano');
      const lista = Array.isArray(x.scadenze) && x.scadenze.length ? x.scadenze : [{ data: C.giorniDopo(r.data, 30), importo: r.netto }];
      const rate = lista.map(s => ({ data: dataDaIso(s.data), importo: s.importo === undefined || s.importo === null || s.importo === '' ? r.netto : centesimi(numero(s.importo)) }));
      const somma = centesimi(rate.reduce((t, s) => t + s.importo, 0));
      if (Math.abs(somma - numero(r.netto)) > 0.01) throw new Rifiuto('Le scadenze fanno ' + C.euroIt(somma) + ' €: devono fare il netto da pagare, ' + C.euroIt(r.netto) + ' €');
      for (const s of this.db.righe('SELECT * FROM ricevuta_scadenze WHERE ricevuta_id = ?', id)) {
        this.db.esegui('DELETE FROM ricevuta_scadenze WHERE id = ?', s.id);
        this.annota('ricevuta_scadenze', s.id, Object.assign({}, s), null, 'tolta');
      }
      rate.forEach((s, i) => this.inserisci('ricevuta_scadenze', { ricevuta_id: id, ordine: i + 1, data: s.data, importo: s.importo, modalita: '', iban: '' }));
      const stimata = !(Array.isArray(x.scadenze) && x.scadenze.length) ? 1 : 0;
      if (r.scadenza_stimata !== stimata) this.aggiorna('fatture_ricevute', id, { scadenza_stimata: stimata });
    }
    this.aggiornaProposte();
    return { ok: true, ricevuta: this.ricevutaCompleta(this.db.riga('SELECT * FROM fatture_ricevute WHERE id = ?', id)) };
  },

  /** annullaRicevuta {id, motivo}: non si cancella. Con dei pagamenti, prima si annullano i movimenti. */
  annullaRicevuta(d) {
    const r = this.rigaRicevuta(d.id);
    const motivo = testo(d.motivo);
    if (!motivo) throw new Rifiuto('Motivo: scrivi perché la annulli');
    if (r.stato === 'annullata') return { ok: true, ricevuta: this.ricevutaCompleta(r) };
    const pagata = this.db.riga('SELECT COUNT(*) n FROM movimento_abbinamenti a JOIN movimenti m ON m.id = a.movimento_id WHERE a.ricevuta_id = ? AND m.annullato = 0', r.id).n;
    if (pagata) throw new Rifiuto('Ha già dei pagamenti: annulla prima i movimenti');
    this.aggiorna('fatture_ricevute', r.id, { stato: 'annullata', motivo, modificato: adesso() }, 'id', 'annullata: ' + motivo);
    this.aggiornaProposte();
    return { ok: true, ricevuta: this.ricevutaCompleta(this.db.riga('SELECT * FROM fatture_ricevute WHERE id = ?', r.id)) };
  },
};
