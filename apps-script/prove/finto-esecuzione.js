// Un'esecuzione dello script nel finto Google, in un filo a parte (worker_threads).
//
// Google fa girare ogni richiesta all'app web in un'esecuzione sua, e ne tiene
// fino a 30 insieme: con la porta Google (Porta.gs) un'esecuzione aspetta la
// risposta del server mentre un'altra, quella del server sul NAS, viene a
// prendere il lavoro. Nel finto Google ogni richiesta HTTP gira qui, in un filo
// suo, con Code.gs, Ponte.gs e Porta.gs caricati da capo (come su Google le
// variabili globali ripartono a ogni esecuzione).
//
// Fogli, Drive, proprieta', cache, posta stanno nel filo principale
// (finto-google.js), uno solo per tutte le esecuzioni: qui se ne usano delle
// controfigure che chiamano il filo principale e aspettano la risposta
// (Atomics.wait + receiveMessageOnPort). Restano qui solo le cose che non
// condividono niente: Utilities.sleep (ferma solo questo filo), ContentService,
// Logger e il lucchetto, che chiede al filo principale ma aspetta qui.
'use strict';

process.env.TZ = 'Europe/Rome';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { workerData, receiveMessageOnPort } = require('node:worker_threads');

const { porta, segnale: memoriaSegnale, radici, file, tipo, evento, ritardo } = workerData;
const segnale = new Int32Array(memoriaSegnale);
const MANIGLIA = Symbol('maniglia');

function dormi(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, Number(ms) || 0));
}

/** Una chiamata al filo principale, che aspetta la risposta. */
function chiedi(m) {
  Atomics.store(segnale, 0, 0);
  porta.postMessage(m);
  let r;
  while (!(r = receiveMessageOnPort(porta))) Atomics.wait(segnale, 0, 0, 20);
  if (r.message.errore !== undefined) throw new Error(r.message.errore);
  return r.message.valore;
}

const eData = v => Object.prototype.toString.call(v) === '[object Date]';

/** Quello che arriva dal filo principale: le maniglie diventano controfigure. */
function daPrincipale(v) {
  if (v === null || typeof v !== 'object') return v;
  if (v.__maniglia !== undefined) return controfigura(v);
  if (eData(v) || ArrayBuffer.isView(v)) return v;
  if (Array.isArray(v)) return v.map(daPrincipale);
  const o = {};
  for (const k of Object.keys(v)) o[k] = daPrincipale(v[k]);
  return o;
}

/** Quello che va al filo principale: le controfigure tornano maniglie. */
function versoPrincipale(v) {
  if (v === null || (typeof v !== 'object' && typeof v !== 'function')) return v;
  if (v[MANIGLIA] !== undefined) return { __maniglia: v[MANIGLIA] };
  if (typeof v === 'function') throw new Error('Il finto Google non sa passare una funzione a un servizio');
  if (eData(v)) return new Date(v.getTime());
  if (ArrayBuffer.isView(v)) return v;
  if (Array.isArray(v)) return v.map(versoPrincipale);
  const o = {};
  for (const k of Object.keys(v)) o[k] = versoPrincipale(v[k]);
  return o;
}

function controfigura(d) {
  const metodi = new Set(d.metodi);
  const pronti = new Map();
  return new Proxy({}, {
    get(_, k) {
      if (k === MANIGLIA) return d.__maniglia;
      if (typeof k === 'symbol' || k === 'then') return undefined;
      if (metodi.has(k)) {
        if (!pronti.has(k)) {
          pronti.set(k, (...argomenti) => daPrincipale(chiedi({ tipo: 'chiama', maniglia: d.__maniglia, metodo: k, argomenti: versoPrincipale(argomenti) })));
        }
        return pronti.get(k);
      }
      return daPrincipale(chiedi({ tipo: 'leggi', maniglia: d.__maniglia, proprieta: k }));
    },
    set(_, k, v) {
      chiedi({ tipo: 'scrivi', maniglia: d.__maniglia, proprieta: k, valore: versoPrincipale(v) });
      return true;
    },
  });
}

// ------------------------------------------------------------------ il contesto dello script

const contesto = {};
for (const nome of Object.keys(radici)) contesto[nome] = daPrincipale(radici[nome]);

const utilitaVere = contesto.Utilities;
contesto.Utilities = new Proxy({}, { get: (_, k) => (k === 'sleep' ? dormi : utilitaVere[k]) });

let tengo = false;
const lucchetto = {
  tryLock(ms) {
    const fine = Date.now() + (Number(ms) || 0);
    do {
      if (chiedi({ tipo: 'lucchetto', cosa: 'prendi' })) { tengo = true; return true; }
      dormi(10);
    } while (Date.now() < fine);
    return false;
  },
  waitLock(ms) {
    if (!this.tryLock(ms)) throw new Error('Lock timeout: another process was holding the lock for too long.');
  },
  releaseLock() {
    if (tengo) chiedi({ tipo: 'lucchetto', cosa: 'lascia' });
    tengo = false;
  },
  hasLock() { return tengo; },
};
contesto.LockService = { getScriptLock: () => lucchetto };
contesto.ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput: testo => ({ testo, setMimeType() { return this; } }),
};
contesto.Logger = { log: (...x) => console.log('[script]', ...x) };
contesto.console = console;
vm.createContext(contesto);
for (const f of file) vm.runInContext(fs.readFileSync(f, 'utf8'), contesto, { filename: path.basename(f) });

// Google impiega un po' ad avviare un'esecuzione: WISPER_FINTO_RITARDO_MS lo imita (di base niente).
if (ritardo) dormi(ritardo);

let testo;
let errore;
try {
  const out = contesto[tipo](evento);
  testo = out && typeof out.testo === 'string' ? out.testo : String(out && out.testo);
} catch (e) {
  errore = e && e.message ? e.message : String(e);
}
porta.postMessage({ tipo: 'fine', testo, errore });
porta.close();
