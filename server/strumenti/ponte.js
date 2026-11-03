/*
 * Il ponte delle versioni vecchie, acceso o spento dal NAS (Ponte.gs, postinoPonte): la sera del cambio la
 * proprieta' PONTE_PORTA dello script la scrive il server, non Andrea a mano.
 *
 *   node server/strumenti/ponte.js si     (le app 0.4.0 passano dal server)
 *   node server/strumenti/ponte.js no     (il ritorno indietro: il foglio risponde da se')
 *
 * Usa WISPER_POSTINO_URL, il segreto e WISPER_INVITO_SCRIPT del .env (nel contenitore:
 * docker compose -p wisper exec wisper node strumenti/ponte.js si).
 */
'use strict';

const { Postino } = require('../src/postino');

async function ponte(postino, acceso) {
  const r = await postino.chiama('postinoPonte', { acceso: !!acceso });
  return r.ponte;
}

if (require.main === module) {
  const scelta = String(process.argv[2] || '').toLowerCase();
  if (scelta !== 'si' && scelta !== 'no') {
    console.error('Si usa: node server/strumenti/ponte.js si|no');
    process.exit(1);
  }
  ponte(Postino.dalEnv(process.env), scelta === 'si').then(acceso => {
    console.log(acceso ? 'Ponte acceso: le versioni vecchie passano dal server.' : 'Ponte spento: il foglio risponde da sé.');
  }).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { ponte };
