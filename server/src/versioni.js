/*
 * Gli aggiornamenti li annuncia il NAS (03/11/2026, Andrea: "non è l'app a controllare ogni volta, è il NAS ad avvisare
 * l'app"). Il server guarda l'elenco firmato delle versioni (aggiornamento.json dell'ultima release su GitHub, lo stesso
 * che leggono le app) ogni WISPER_VERSIONI_MINUTI minuti (di base 10) e, quando cambia, lo dice a telefoni e computer:
 *
 *  - in ogni risposta di /exec c'e' "versioni" ({giro, android: {codice, nome}, computer: {versione}}), anche quando la
 *    richiesta passa dalla porta Google: l'app la legge in silenzio e, se e' indietro, scarica e installa da sola;
 *  - /campanello?giro=<n> (solo in casa, non passa da internet ne' da Google): una richiesta che resta aperta finche'
 *    l'elenco non cambia (al massimo 50 secondi, poi si rifa'). Cosi' un'app aperta e ferma lo sa subito.
 *
 * L'elenco vale solo con la firma giusta (la stessa chiave pubblica delle app): un elenco falso non sveglia nessuno.
 * Le app controllano comunque firma e impronta prima di installare.
 */
'use strict';

const crypto = require('node:crypto');
const { messaggio, adesso } = require('./utili');

/** wisper-keys/aggiornamenti-pubblica.txt (la stessa di NuoveVersioni.kt e Aggiornamenti.cs). */
const CHIAVE_PUBBLICA = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEcytO0JAM8WZdBrGMSdnF211vK29aUdNOIhPaPpG9XOj3qSd0aKRi8GRmLsxNAbvTmgbvJ9uZ6gjI7euYqqfC7Q==';
const ELENCO = 'https://github.com/postagaspa-star/wisper/releases/latest/download/aggiornamento.json';
const ATTESA_MASSIMA = 50000;

function chiave(base64) {
  return crypto.createPublicKey({ key: Buffer.from(base64 || CHIAVE_PUBBLICA, 'base64'), format: 'der', type: 'spki' });
}

/** L'elenco {manifesto: "<json>", firma: "<base64>"}: il manifesto letto, solo se la firma torna. */
function leggiFirmato(j, chiavePubblica) {
  if (!j || typeof j.manifesto !== 'string' || typeof j.firma !== 'string') throw new Error('elenco delle versioni senza manifesto o firma');
  const buona = crypto.verify('sha256', Buffer.from(j.manifesto, 'utf8'), { key: chiave(chiavePubblica), dsaEncoding: 'der' }, Buffer.from(j.firma, 'base64'));
  if (!buona) throw new Error('la firma dell\'elenco delle versioni non torna');
  const m = JSON.parse(j.manifesto);
  const android = m.android && Number(m.android.codice) > 0 ? { codice: Number(m.android.codice), nome: String(m.android.nome || '') } : null;
  const computer = m.computer && /^\d+\.\d+\.\d+(\.\d+)?$/.test(String(m.computer.versione || '')) ? { versione: String(m.computer.versione) } : null;
  if (!android && !computer) throw new Error('l\'elenco delle versioni è vuoto');
  return { android, computer };
}

class Vedetta {
  /** @param o {url, minuti, chiavePubblica, w}: w riceve versioniUltime (Dashboard, controllo Aggiornamenti) */
  constructor(o) {
    this.url = o.url || ELENCO;
    this.minuti = Number(o.minuti) > 0 ? Number(o.minuti) : 10;
    this.chiavePubblica = o.chiavePubblica || CHIAVE_PUBBLICA;
    this.w = o.w || null;
    this.giro = 0;
    this.versioni = null;
    this.firmaUltima = '';
    this.controllato = '';
    this.errore = '';
    this.inAttesa = new Set();
    this.timer = null;
  }

  avvia(primoDopoMs) {
    const giro = () => { this.controlla().catch(() => null); };
    const primo = setTimeout(giro, primoDopoMs === undefined ? 3000 : primoDopoMs);
    if (primo.unref) primo.unref();
    this.timer = setInterval(giro, Math.round(this.minuti * 60000));
    if (this.timer.unref) this.timer.unref();
    return this;
  }

  ferma() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sveglia();
  }

  async controlla() {
    try {
      const r = await fetch(this.url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok) throw new Error('GitHub ha risposto ' + r.status);
      const v = leggiFirmato(await r.json(), this.chiavePubblica);
      this.controllato = adesso();
      this.errore = '';
      const firma = JSON.stringify(v);
      if (firma !== this.firmaUltima) {
        this.firmaUltima = firma;
        this.versioni = v;
        this.giro++;
        if (this.w) this.w.versioniUltime = { telefono: v.android ? v.android.nome : '', computer: v.computer ? v.computer.versione : '', quando: this.controllato };
        console.log('[versioni] ' + (this.giro === 1 ? 'ultime versioni: ' : 'versione nuova, avviso telefoni e computer: ') +
          [v.android ? 'telefono ' + v.android.nome + ' (' + v.android.codice + ')' : '', v.computer ? 'computer ' + v.computer.versione : ''].filter(Boolean).join(', '));
        this.sveglia();
      }
      return v;
    } catch (err) {
      this.errore = messaggio(err);
      throw err;
    }
  }

  /** Il pezzo "versioni" delle risposte (null finche' l'elenco non si e' letto una volta). */
  perRisposta() {
    if (!this.giro || !this.versioni) return null;
    return { giro: this.giro, android: this.versioni.android, computer: this.versioni.computer };
  }

  /** Aspetta che il giro non sia piu' quello detto (o che passi il tempo). */
  attendi(giro, ms) {
    if (Number(giro) !== this.giro) return Promise.resolve();
    return new Promise(fatto => {
      const via = () => { clearTimeout(t); this.inAttesa.delete(via); fatto(); };
      const t = setTimeout(via, Math.min(Number(ms) || ATTESA_MASSIMA, ATTESA_MASSIMA));
      this.inAttesa.add(via);
    });
  }

  sveglia() {
    for (const via of Array.from(this.inAttesa)) via();
  }

  stato() {
    return { giro: this.giro, versioni: this.versioni, controllato: this.controllato, errore: this.errore, ogniMinuti: this.minuti, inAttesa: this.inAttesa.size };
  }
}

module.exports = { Vedetta, leggiFirmato, CHIAVE_PUBBLICA, ELENCO, ATTESA_MASSIMA };
