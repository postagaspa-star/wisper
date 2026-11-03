/*
 * Il controllo della partita IVA col servizio europeo VIES (gratuito, senza
 * chiavi): dice se il numero esiste e, per l'Italia, di solito anche nome e
 * indirizzo, da proporre nel modulo del cliente.
 *
 * Prima di chiamare l'Europa si controlla la cifra di controllo: una partita
 * IVA italiana scritta male si rifiuta subito, senza aspettare nessuno.
 */
'use strict';

const { Rifiuto, testo } = require('../utili');
const { partitaIvaItalianaValida } = require('../conti');

const VIES = 'https://ec.europa.eu/taxation_customs/vies/rest-api';
const ATTESA_MS = 8000;

/** "VIA ROMA 1\n36016 THIENE VI" -> indirizzo, CAP, citta', provincia (quando si riesce). */
function spezzaIndirizzo(testoIndirizzo) {
  const righe = String(testoIndirizzo || '').split(/\r?\n/).map(s => s.trim()).filter(s => s && s !== '---');
  const out = { indirizzo: righe.join(', '), cap: '', citta: '', provincia: '' };
  for (let i = righe.length - 1; i >= 0; i--) {
    const m = righe[i].match(/^(\d{5})\s+(.+?)(?:\s+\(?([A-Z]{2})\)?)?$/);
    if (m) {
      out.cap = m[1];
      out.citta = m[2].trim();
      out.provincia = m[3] || '';
      out.indirizzo = righe.slice(0, i).concat(righe.slice(i + 1)).join(', ');
      break;
    }
  }
  return out;
}

function nonRisponde() {
  return new Rifiuto('Il servizio europeo non risponde: riprova più tardi', { rete: true });
}

module.exports = {
  async controllaPartitaIva(d) {
    const nazione = (testo(d.nazione) || 'IT').toUpperCase();
    let numero = testo(d.partitaIva).toUpperCase().replace(/[\s.\-]/g, '');
    if (numero.slice(0, 2) === nazione) numero = numero.slice(2);
    if (!/^[A-Z]{2}$/.test(nazione)) throw new Rifiuto('Nazione: due lettere, per esempio IT');
    if (nazione === 'IT') {
      if (!/^\d{11}$/.test(numero)) throw new Rifiuto('Partita IVA: deve avere 11 cifre');
      if (!partitaIvaItalianaValida(numero)) throw new Rifiuto('Partita IVA: il numero non torna, controlla le cifre');
    } else if (!/^[A-Z0-9]{2,14}$/.test(numero)) {
      throw new Rifiuto('Partita IVA: solo lettere e cifre, senza spazi');
    }
    const base = (process.env.WISPER_VIES_URL || VIES).replace(/\/+$/, '');
    let r;
    try {
      r = await fetch(base + '/ms/' + nazione + '/vat/' + encodeURIComponent(numero), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(ATTESA_MS),
      });
    } catch (err) {
      throw nonRisponde();
    }
    if (!r.ok) throw nonRisponde();
    let j;
    try { j = await r.json(); } catch (e) { throw nonRisponde(); }
    // Quando lo stato membro e' irraggiungibile VIES lo dice in userError, non con un errore HTTP.
    const errore = testo(j.userError).toUpperCase();
    if (errore && errore !== 'VALID' && errore !== 'INVALID' && j.isValid !== true) throw nonRisponde();
    const nome = testo(j.name) === '---' ? '' : testo(j.name);
    const ind = spezzaIndirizzo(j.address);
    return {
      ok: true,
      valida: j.isValid === true,
      partitaIva: numero,
      nazione,
      nome,
      indirizzo: ind.indirizzo,
      cap: ind.cap,
      citta: ind.citta,
      provincia: ind.provincia,
    };
  },
};

Object.defineProperty(module.exports, 'spezzaIndirizzo', { value: spezzaIndirizzo });
