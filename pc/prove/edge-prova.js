'use strict';
// Edge senza finestra per le prove cliccate: la porta di DevTools e la chiusura.
//
// - La porta: WISPER_DEVTOOLS_PORTA se c'è (per tenere le prove in un giro di porte deciso, per esempio 8740-8759 quando
//   lavorano più persone sullo stesso computer), se no un numero a caso nel giro di sempre dello script.
// - La chiusura: Browser.close da DevTools chiude il browser intero; edge.kill() da solo chiudeva solo il primo processo
//   e lasciava vivi i figli (il 04/11/2026 c'erano 216 processi "wisper-edge-*").

const aspetta = ms => new Promise(r => setTimeout(r, ms));

function portaDevtools(da, quante) {
  const scelta = Number(process.env.WISPER_DEVTOOLS_PORTA);
  return scelta > 0 ? scelta : da + Math.floor(Math.random() * quante);
}

async function chiudiEdge(porta, edge) {
  try {
    const v = await fetch('http://127.0.0.1:' + porta + '/json/version').then(r => r.json()).catch(() => null);
    if (v && v.webSocketDebuggerUrl) {
      const b = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise(ok => { b.onopen = ok; b.onerror = ok; setTimeout(ok, 2000); });
      try { b.send(JSON.stringify({ id: 1, method: 'Browser.close' })); } catch (e) { /* già chiuso */ }
      await aspetta(800);
      try { b.close(); } catch (e) { /* già chiuso */ }
    }
  } catch (e) { /* già chiuso */ }
  // Si aspetta che Edge sia uscito davvero (fino a 8 s): finché è vivo tiene i file del profilo e la cartella non si
  // toglie (il 07/11/2026 restavano profili da 10-40 MB in Temp).
  if (edge && edge.exitCode === null && edge.signalCode === null) {
    await new Promise(ok => { const t = setTimeout(ok, 8000); edge.once('exit', () => { clearTimeout(t); ok(); }); });
  }
  try { if (edge && edge.exitCode === null) edge.kill(); } catch (e) { /* già chiuso */ }
  await aspetta(400);
}

/** Toglie una cartella di prova (il profilo di Edge): riprova fino a 20 s se un file è ancora aperto (i processi figli di Edge escono dopo). */
async function togliCartella(dir) {
  const fs = require('node:fs');
  for (let i = 0; i < 40; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return true; } catch (e) { await aspetta(500); }
  }
  return false;
}

module.exports = { portaDevtools, chiudiEdge, togliCartella };
