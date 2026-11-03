/*
 * La prova di carico (fase 8, fase8.md §11.5), contro un server acceso coi dati finti di dieci anni:
 *
 *   node server/strumenti/dati-finti.js --anni 10 --persone 5 --dati <cartella di prova>
 *   node server/src/avvio.js --dati <cartella di prova> --porta 8499
 *   node server/prove/carico.js --server http://localhost:8499 [--nas] [--email manuel@esempio.it] [--password prova] [--mese 2026-10]
 *
 * Misura la mediana e il 95° percentile di 20 chiamate (utente titolare) e le confronta coi tempi dell'accordo: quelli
 * del PC di Andrea, o quelli del NAS con --nas. Le cose lunghe (esporta di dieci anni, Esporta tutto, la copia) si
 * misurano meno volte (5, 3, 3), scritto nella tabella. Esce con 1 se una riga sfora.
 * Non e' un file *.test.js: "npm test" non lo fa girare. Mai contro il server coi dati veri.
 */
'use strict';

const LIMITI = [
  // [nome, ms PC, ms NAS, volte, richiesta]
  ['anagrafiche', 150, 400, 20, { azione: 'anagrafiche' }],
  ['rapportini del mese', 150, 400, 20, null],
  ['documenti con ricerca nel titolo', 150, 400, 20, { azione: 'documenti', archivio: true, testo: 'verifica', dentro: false }],
  ['dashboard', 300, 800, 20, { azione: 'dashboard' }],
  ['dashboard {tutto}', 300, 800, 20, { azione: 'dashboard', tutto: true }],
  ['documenti {testo, dentro}', 200, 500, 20, { azione: 'documenti', archivio: true, testo: 'impianto terra', dentro: true }],
  ['esporta rapportini di 10 anni', 2000, 5000, 5, { azione: 'esporta', cosa: 'rapportini', tutti: true }],
  ['esportaTutto', 15000, 40000, 3, 'esportaTutto'],
  ['copia della notte (VACUUM INTO)', 30000, 120000, 3, 'copia'],
];

function argomenti(argv) {
  const a = { email: 'manuel@esempio.it', password: 'prova', nas: false, mese: '2026-10' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--server') a.server = argv[++i].replace(/\/+$/, '');
    else if (argv[i] === '--email') a.email = argv[++i];
    else if (argv[i] === '--password') a.password = argv[++i];
    else if (argv[i] === '--mese') a.mese = argv[++i];
    else if (argv[i] === '--nas') a.nas = true;
    else throw new Error('Non conosco "' + argv[i] + '"');
  }
  if (!a.server) throw new Error('Si usa: node server/prove/carico.js --server http://localhost:8499 [--nas]');
  return a;
}

const mediana = l => { const s = l.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const percentile = (l, p) => { const s = l.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };

async function carico(a) {
  const exec = async (corpo, token) => {
    const r = await fetch(a.server + '/exec', { method: 'POST', headers: Object.assign({ 'Content-Type': 'text/plain;charset=utf-8' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify(corpo) });
    return r.json();
  };
  const ac = await exec({ azione: 'accedi', email: a.email, password: a.password, disp: 'carico', dispNome: 'prova di carico', app: 'carico' });
  if (!ac.ok) throw new Error('Accesso non riuscito: ' + ac.errore);
  const token = ac.token;
  const [anno, mese] = a.mese.split('-').map(Number);
  const ultimo = new Date(anno, mese, 0).getDate();
  const righe = [];
  for (const [nome, pc, nas, volte, richiesta] of LIMITI) {
    const tempi = [];
    for (let i = 0; i < volte; i++) {
      const t0 = Date.now();
      if (richiesta === 'esportaTutto') {
        const e = await exec({ azione: 'esportaTutto' }, token);
        if (!e.ok) throw new Error('esportaTutto: ' + e.errore);
        for (;;) {
          const l = await exec({ azione: 'esportazioni' }, token);
          const x = l.esportazioni.find(y => y.id === e.esportazione.id);
          if (x && x.stato !== 'in_corso') { if (x.stato !== 'pronta') throw new Error('esportaTutto: ' + x.errore); break; }
          await new Promise(r => setTimeout(r, 100));
        }
      } else if (richiesta === 'copia') {
        const c = await exec({ azione: 'copiaAdesso' }, token);
        if (!c.ok) throw new Error('copiaAdesso: ' + c.errore);
      } else {
        const corpo = richiesta || { azione: 'rapportini', da: a.mese + '-01', a: a.mese + '-' + ultimo, tutti: true };
        const r = await exec(corpo, token);
        if (!r.ok) throw new Error(nome + ': ' + r.errore);
      }
      tempi.push(Date.now() - t0);
    }
    const limite = a.nas ? nas : pc;
    const p95 = percentile(tempi, 95);
    righe.push({ nome, volte, mediana: Math.round(mediana(tempi)), p95, limite, va: p95 <= limite });
  }
  const st = await exec({ azione: 'statoSistema' }, token);
  return { righe, mb: st.ok ? st.database.mb : null };
}

if (require.main === module) {
  let a;
  try { a = argomenti(process.argv.slice(2)); } catch (err) { console.error(err.message); process.exit(2); }
  carico(a).then(r => {
    console.log('Prova di carico contro ' + a.server + ' (tempi ' + (a.nas ? 'del NAS' : 'del PC') + ')');
    for (const x of r.righe) console.log((x.va ? '  ok   ' : '  NO   ') + x.nome.padEnd(36) + ' mediana ' + String(x.mediana).padStart(6) + ' ms · 95° ' + String(x.p95).padStart(6) + ' ms · limite ' + x.limite + ' ms (' + x.volte + ' volte)');
    console.log('  Database: ' + (r.mb === null ? '?' : r.mb + ' MB') + ' (atteso sotto 600 MB)');
    process.exit(r.righe.every(x => x.va) ? 0 : 1);
  }).catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { carico, LIMITI };
