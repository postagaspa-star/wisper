/*
 * Il postino: lo script del foglio (apps-script/Ponte.gs), che fa per il server
 * le cose che solo Google sa fare. Manda le email dal Gmail del foglio, salva le
 * copie fuori casa su Drive (Wisper/Copie NAS/) e riscrive le schede del foglio
 * ogni notte. Il protocollo e' in docs/gestionale/postino.md.
 *
 * Ogni chiamata porta il segreto (lo stesso SEGRETO_SERVER del .env): Apps
 * Script non legge le intestazioni HTTP, quindi sta nel corpo.
 *
 * Senza indirizzo vero (le prove, --prova) c'e' il postino finto: scrive tutto
 * su disco, in una cartella, invece di spedire.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Massimo 20 MB per chiamata: 15 MB di file diventano circa 20 MB in base64. */
const PEZZO = 15 * 1024 * 1024;
const ATTESA_MS = 120000;

class Postino {
  /**
   * @param o.url      l'indirizzo dello script (WISPER_POSTINO_URL)
   * @param o.segreto  WISPER_POSTINO_SEGRETO (o SEGRETO_SERVER)
   * @param o.cartella il postino finto: dove scrivere invece di spedire
   */
  constructor(o) {
    this.url = (o && o.url) || '';
    this.segreto = (o && o.segreto) || '';
    this.cartella = (o && o.cartella) || '';
  }

  configurato() {
    return !!(this.cartella || (this.url && this.segreto));
  }

  descrizione() {
    if (this.cartella) return 'finto (su disco)';
    if (this.url && this.segreto) return 'lo script del foglio';
    return 'non configurato';
  }

  async chiama(azione, corpo) {
    if (!this.configurato()) {
      throw new Error('Il postino non è collegato: mancano WISPER_POSTINO_URL e WISPER_POSTINO_SEGRETO nel .env del server');
    }
    const dati = Object.assign({ azione, segreto: this.segreto }, corpo);
    if (this.cartella) return scriviSuDisco(this.cartella, dati);
    let r;
    try {
      // Apps Script risponde a una POST con un rimbalzo (302) verso un secondo
      // indirizzo, da leggere con una GET: fetch lo fa da solo.
      r = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(dati),
        redirect: 'follow',
        signal: AbortSignal.timeout(ATTESA_MS),
      });
    } catch (err) {
      throw conRete(new Error('Il postino non risponde (' + (err.name === 'TimeoutError' ? 'tempo scaduto' : err.message) + ')'));
    }
    const testo = await r.text();
    if (!r.ok) throw conRete(new Error('Il postino ha risposto ' + r.status));
    let j;
    try { j = JSON.parse(testo); } catch (e) { throw conRete(new Error('Risposta non valida dal postino: lo script è pubblicato per "Chiunque"?')); }
    if (!j.ok) throw new Error('Il postino ha detto di no: ' + (j.errore || 'senza motivo'));
    return j;
  }

  /** {a, cc?, rispondiA?, nome?, oggetto, messaggio, allegati?: [{nome, mime, base64}], alProprietario?} */
  email(m) {
    return this.chiama('postinoEmail', m);
  }

  /**
   * Un file in Drive, Wisper/Copie NAS/<cartella>/<nome>. Oltre i 20 MB va in
   * pezzi <nome>.parte1, .parte2...: si rimettono insieme concatenandoli.
   */
  async copia({ cartella, nome, mime, dati }) {
    if (dati.length <= PEZZO) {
      return this.chiama('postinoCopia', { cartella, nome, mime, base64: dati.toString('base64') });
    }
    const risposte = [];
    for (let i = 0, n = 1; i < dati.length; i += PEZZO, n++) {
      risposte.push(await this.chiama('postinoCopia', {
        cartella, nome: nome + '.parte' + n, mime: 'application/octet-stream', base64: dati.subarray(i, i + PEZZO).toString('base64'),
      }));
    }
    return { ok: true, pezzi: risposte.length };
  }

  /** Riscrive una scheda del foglio: intestazioni e righe come oggi (SCHEMA di Code.gs). */
  foglio(scheda, intestazioni, righe) {
    return this.chiama('postinoFoglio', { scheda, intestazioni, righe });
  }

  prova() {
    return this.chiama('postinoProva', {});
  }

  /**
   * Fase 8 (fase8.md §9.10, §13.7): l'impronta di un file della copia fuori casa, come la calcola Drive
   * (Utilities.computeDigest nello script): {ok, byte, md5}. Serve alla prova automatica della copia. L'azione
   * postinoImpronta va aggiunta a Ponte.gs (da incollare e pubblicare come le altre).
   */
  impronta({ cartella, nome }) {
    return this.chiama('postinoImpronta', { cartella, nome });
  }
}

function conRete(err) {
  err.rete = true;
  return err;
}

/**
 * Il postino finto: quello che il vero farebbe, scritto in una cartella.
 *   email/<istante>/email.txt (+ allegati)
 *   copie/<cartella>/<nome>
 *   foglio/<scheda>.json
 */
function scriviSuDisco(cartella, d) {
  const quando = new Date().toISOString().replace(/[:.]/g, '-');
  if (d.azione === 'postinoEmail') {
    let dir = path.join(cartella, 'email', quando);
    for (let i = 2; fs.existsSync(dir); i++) dir = path.join(cartella, 'email', quando + '-' + i);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'email.txt'),
      'A: ' + (d.alProprietario ? '(proprietario del foglio ed EMAIL_AVVISI)' : d.a) + '\nCC: ' + (d.cc || '') +
      '\nDa: ' + (d.nome || '') + '\nRispondi a: ' + (d.rispondiA || '') + '\nOggetto: ' + d.oggetto + '\n\n' + d.messaggio + '\n');
    (d.allegati || []).forEach(a => fs.writeFileSync(path.join(dir, path.basename(a.nome || 'allegato')), Buffer.from(a.base64, 'base64')));
    return { ok: true, rimaste: 100 };
  }
  if (d.azione === 'postinoCopia') {
    if (['database', 'file'].indexOf(d.cartella) < 0) return { ok: false, errore: 'Cartella non valida: ' + d.cartella };
    const dir = path.join(cartella, 'copie', d.cartella);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, path.basename(d.nome)), Buffer.from(d.base64, 'base64'));
    return { ok: true, id: 'finto-' + path.basename(d.nome) };
  }
  if (d.azione === 'postinoFoglio') {
    const dir = path.join(cartella, 'foglio');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, path.basename(d.scheda) + '.json'), JSON.stringify({ intestazioni: d.intestazioni, righe: d.righe }, null, 1));
    return { ok: true, righe: (d.righe || []).length };
  }
  if (d.azione === 'postinoProva') return { ok: true, quando: new Date().toISOString(), rimaste: 100 };
  if (d.azione === 'postinoImpronta') {
    if (['database', 'file'].indexOf(d.cartella) < 0) return { ok: false, errore: 'Cartella non valida: ' + d.cartella };
    const p = path.join(cartella, 'copie', d.cartella, path.basename(String(d.nome || '')));
    if (!fs.existsSync(p)) return { ok: false, errore: 'File non trovato: ' + d.nome };
    const b = fs.readFileSync(p);
    return { ok: true, byte: b.length, md5: require('node:crypto').createHash('md5').update(b).digest('hex') };
  }
  return { ok: false, errore: 'Azione sconosciuta: ' + d.azione };
}

module.exports = { Postino, scriviSuDisco, PEZZO };
