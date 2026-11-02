// L'indirizzo della pagina del portale dal .env (WISPER_PORTALE_INDIRIZZO): il server vero lo scrive in
// PORTALE_INDIRIZZO all'avvio solo se li' e' vuoto, e solo se e' un https. Un database nuovo (la sera del cambio) lo
// ritrova da solo; chi lo cambia da Impostazioni non se lo vede rimettere.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, cartellaNuova } = require('./aiuto');

async function indirizzoDopoAvvio(dati, valore) {
  const s = await serverDiProva({ dati, prova: false, env: { WISPER_PORTALE_INDIRIZZO: valore } });
  try {
    return s.wisper.leggiImpostazioni().PORTALE_INDIRIZZO;
  } finally {
    await s.ferma();
  }
}

test('database nuovo: l\'indirizzo del .env finisce nelle impostazioni, senza la barra in fondo', async () => {
  assert.equal(await indirizzoDopoAvvio(cartellaNuova('indirizzo'), ' https://portale-esempio.netlify.app/ '), 'https://portale-esempio.netlify.app');
});

test('impostazione gia\' scritta: il .env non la cambia', async () => {
  const dati = cartellaNuova('indirizzo');
  assert.equal(await indirizzoDopoAvvio(dati, 'https://portale-esempio.netlify.app'), 'https://portale-esempio.netlify.app');
  assert.equal(await indirizzoDopoAvvio(dati, 'https://un-altro-esempio.netlify.app'), 'https://portale-esempio.netlify.app');
});

test('valori che non sono un indirizzo https: le impostazioni restano vuote', async () => {
  for (const v of ['', 'http://portale-esempio.netlify.app', 'portale-esempio.netlify.app', 'javascript:alert(1)', 'https://', 'https://esempio.netlify.app/?x=1', 'https://esem pio.app']) {
    assert.equal(await indirizzoDopoAvvio(cartellaNuova('indirizzo'), v), '', 'con ' + JSON.stringify(v));
  }
});

test('in prova il .env non tocca i dati di esempio da qui', async () => {
  const s = await serverDiProva({ env: { WISPER_PORTALE_INDIRIZZO: 'https://portale-esempio.netlify.app' } });
  try {
    // I dati di esempio scrivono l'indirizzo da process.env (vuoto nelle prove): resta il loro.
    assert.equal(s.wisper.leggiImpostazioni().PORTALE_INDIRIZZO, String(process.env.WISPER_PORTALE_INDIRIZZO || '').replace(/\/+$/, ''));
  } finally {
    await s.ferma();
  }
});
