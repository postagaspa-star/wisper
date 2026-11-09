// Le schermate dell'interfaccia di Wisper Ufficio, con Edge senza finestra e un
// profilo temporaneo (mai il browser di chi lavora), per confrontarle col prototipo.
//
//   node pc/prove/finto-ponte.js 8790 --esempio        (in un'altra finestra)
//   node pc/prove/schermate.js --uscita <cartella> [--porta 8790] [--scuro] [--chi manuel] [--solo dashboard,clienti]
//
// Entra con l'utente di prova scelto (password "prova"), apre le pagine una per
// una e salva un PNG per pagina (1280x800, come il prototipo). Gli errori di
// JavaScript della pagina li scrive qui: una schermata bella con un errore sotto non vale.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8790));
const USCITA = path.resolve(opz('--uscita', path.join(os.tmpdir(), 'wisper-schermate')));
const SCURO = arg.includes('--scuro');
const CHI = opz('--chi', 'manuel');
const SOLO = (opz('--solo', '') || '').split(',').filter(Boolean);
const LARGO = Number(opz('--largo', 1280));
const ALTO = Number(opz('--alto', 800));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;

// Fase 5: chiude finestre e pannelli dopo la schermata; clicca il giallo della pagina col testo dato.
const CHIUDI = "document.querySelectorAll('.velo, .pannello, .pannello-doc, .pannello-ticket, .pannello-contratto, .pannello-com, .pannello-file').forEach(v => v.remove())";
const GIALLO = testo => "[...document.querySelectorAll('.btn.giallo, [data-giallo-pagina]')].find(b => b.textContent.indexOf(" + JSON.stringify(testo) + ") >= 0).click()";
// Fase 6: aspetta che la pagina abbia letto dal server (i pannelli si aprono dopo la lettura).
const ATTENDI = ms => 'await new Promise(r => setTimeout(r, ' + ms + '))';

// Le pagine: nome del file, indirizzo, e cosa fare prima della schermata (JavaScript nella pagina).
const PAGINE = [
  { nome: 'accesso', esci: true },
  { nome: 'dashboard', hash: '#dashboard' },
  { nome: 'lato-richiuso', hash: '#dashboard', fai: "document.getElementById('richiudi').click()", dopo: "document.getElementById('richiudi').click()" },
  { nome: 'clienti', hash: '#clienti' },
  { nome: 'fornitori', hash: '#clienti', fai: "document.querySelectorAll('.segmenti button')[1].click()", dopo: "document.querySelectorAll('.segmenti button')[0] && document.querySelectorAll('.segmenti button')[0].click()" },
  { nome: 'cliente-dati', hash: '#clienti/C002' },
  { nome: 'cliente-referenti', hash: '#clienti/C001', fai: "document.querySelectorAll('.segmenti button')[1].click()" },
  { nome: 'cliente-sedi', hash: '#clienti/C001', fai: "document.querySelectorAll('.segmenti button')[2].click()" },
  { nome: 'cliente-modulo', hash: '#clienti/C002', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => b.textContent === 'Modifica').click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'commesse', hash: '#commesse' },
  { nome: 'commessa-prestazioni', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST044' },
  { nome: 'commessa-panoramica', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST045', fai: "document.querySelectorAll('.segmenti button')[0].click()" },
  { nome: 'commessa-costi', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST045', fai: "[...document.querySelectorAll('.segmenti button')].find(b => /Costi/.test(b.textContent)).click()" },
  { nome: 'commessa-menu', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST044', fai: "document.querySelector('.testata .tondo[aria-label=\"Altre azioni\"]').click()", dopo: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))" },
  { nome: 'commessa-modulo', hash: '#commesse', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuova commessa/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'rapportini', hash: '#rapportini/elenco' },
  // 07/11/2026: ogni rapportino una scheda; il secondo scelto (la casella c'è solo sulla testata).
  { nome: 'rapportini-schede', hash: '#rapportini/elenco', fai: "await new Promise(r => setTimeout(r, 1500)); document.querySelectorAll('.avviso').forEach(x => x.remove()); document.querySelectorAll('.tab .r.rap input')[1].click(); await new Promise(r => setTimeout(r, 900)); document.querySelectorAll('.avviso').forEach(x => x.remove())" },
  { nome: 'rapportino-modulo', hash: '#rapportini/elenco', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuovo rapportino/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'rapportino-pannello', hash: '#rapportini/elenco', fai: "document.querySelector('.tab .r.cliccabile').click()", dopo: "document.querySelector('.pannello') && document.querySelector('.pannello').remove()" },
  // fase 3: ore, timer, approvazioni, statistiche, spese e trasferte, veicoli
  { nome: 'ore', hash: '#rapportini/ore' },
  { nome: 'ore-registra', hash: '#rapportini/ore', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Registra ore/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 300)); [...document.querySelectorAll('.finestra .segmenti button')].find(b => b.textContent === 'Inizio e fine').click(); const f = document.querySelector('.finestra'); const i = [...f.querySelectorAll('.campo')]; const m = (et, v) => { const c = i.find(x => x.querySelector('label') && x.querySelector('label').textContent === et); const x = c.querySelector('input'); x.value = v; x.dispatchEvent(new Event('input', { bubbles: true })); }; m('Inizio', '8:30'); m('Fine', '17:00'); m('Pausa', '30')", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'ore-timer-avvia', hash: '#rapportini/ore', fai: "[...document.querySelectorAll('.zona-timer .btn')].find(b => /Avvia il timer/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'ore-giorno', hash: '#rapportini/ore', fai: "document.querySelector('button.cella-ore.apri').click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'statistiche', hash: '#rapportini/statistiche' },
  { nome: 'da-approvare', hash: '#rapportini/approvare' },
  { nome: 'da-approvare-respingi', hash: '#rapportini/approvare', fai: "[...document.querySelectorAll('.azioni-approva .btn')].find(b => b.textContent === 'Respingi').click(); await new Promise(r => setTimeout(r, 300)); [...document.querySelectorAll('.finestra .btn.giallo')].pop().click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'spese', hash: '#spese' },
  { nome: 'spesa-nuova', hash: '#spese', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuova spesa/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'spesa-foto', hash: '#spese', fai: "[...document.querySelectorAll('.scheda.righe .riga')].find(r => r.querySelector('.ico-riga')).click(); await new Promise(r => setTimeout(r, 300)); const r = [...document.querySelectorAll('.scheda.righe .riga')].find(x => !/senza scontrino/.test(x.textContent)); if (r) { document.querySelectorAll('.velo').forEach(v => v.remove()); r.click(); }", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'trasferte', hash: '#spese', fai: "[...document.querySelectorAll('.segmenti button')].find(b => /^Trasferte/.test(b.textContent)).click()" },
  { nome: 'trasferta-modulo', hash: '#spese', fai: "[...document.querySelectorAll('.segmenti button')].find(b => /^Trasferte/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 900)); document.querySelector('.scheda.righe .riga').click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'rimborsi', hash: '#spese', fai: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Rimborsi').click()" },
  { nome: 'riepiloghi', hash: '#spese/riepiloghi' },
  { nome: 'veicoli', hash: '#amministrazione/veicoli' },
  { nome: 'fatturazione', hash: '#fatturazione' },
  { nome: 'amministrazione', hash: '#amministrazione' },
  { nome: 'studio', hash: '#amministrazione/studio' },
  { nome: 'utenti', hash: '#amministrazione/utenti' },
  { nome: 'utente', hash: '#amministrazione/utenti/2' },
  { nome: 'nuovo-utente', hash: '#amministrazione/utenti', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuovo utente/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'permessi', hash: '#amministrazione/permessi' },
  { nome: 'numerazioni', hash: '#amministrazione/numerazioni' },
  { nome: 'tariffe', hash: '#amministrazione/tariffe' },
  { nome: 'registro', hash: '#amministrazione/registro' },
  { nome: 'copie', hash: '#amministrazione/copie' },
  { nome: 'cestino', hash: '#amministrazione/cestino' },
  { nome: 'app', hash: '#amministrazione/app' },
  // fase 2: preventivi, attività e calendario
  { nome: 'preventivi', hash: '#preventivi' },
  { nome: 'preventivo', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/012') },
  { nome: 'preventivo-menu', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/012'), fai: "document.querySelector('.testata .tondo[aria-label=\"Altre azioni\"]').click()", dopo: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))" },
  // Fase 4: il PR/2026/012 è accettato (è il contratto di 26ST003): si accetta il PR/2026/007, ancora inviato.
  { nome: 'preventivo-accetta', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/007'), fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Segna accettato/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'preventivo-invio', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/013'), fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Invia al cliente/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('.finestra .btn.giallo')].find(b => /Mandalo/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'preventivo-editor', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/012') + '/modifica' },
  { nome: 'preventivo-editor-bozza', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/013') + '/modifica' },
  { nome: 'preventivo-nuovo', hash: '#preventivi/nuovo', fai: "document.querySelector('.piede-sez .btn').click()", dopo: "document.querySelectorAll('.menu').forEach(m => m.remove())" },
  { nome: 'preventivo-crea-commessa', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/009'), fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Crea la commessa/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'listino', hash: '#preventivi/listino' },
  { nome: 'contratti', hash: '#preventivi/contratti' },
  { nome: 'attivita', hash: '#attivita' },
  { nome: 'attivita-squadra', hash: '#attivita', fai: "document.querySelectorAll('.segmenti button')[1].click()" },
  { nome: 'attivita-modulo', hash: '#attivita', fai: "document.querySelectorAll('.riga-attivita')[1].click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'attivita-nuova', hash: '#attivita', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuova attività/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'calendario', hash: '#attivita/calendario' },
  { nome: 'calendario-mese', hash: '#attivita/calendario', fai: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Mese').click()", dopo: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Settimana').click()" },
  { nome: 'calendario-giorno', hash: '#attivita/calendario', fai: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Giorno').click()", dopo: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Settimana').click()" },
  { nome: 'pianificazione', hash: '#attivita/pianificazione' },
  // fase 4: fatturazione, banche e scadenze (col server di prova: i dati di esempio della fase 4 sono lì)
  { nome: 'fatt-scelta', hash: '#fatturazione', fai: "[...document.querySelectorAll('.scheda-cliente-df .btn.collegamento')].find(b => b.textContent === 'Scegli tutto').click()" },
  { nome: 'fatt-mese-aperto', hash: '#fatturazione', fai: "await new Promise(r => setTimeout(r, 900)); document.querySelector('.apri-mese').click(); await new Promise(r => setTimeout(r, 300)); const el = document.querySelector('.riga-mese'); document.querySelector('#principale').scrollTop = el.getBoundingClientRect().top + document.querySelector('#principale').scrollTop - 90" },
  { nome: 'bozza', hash: '#fatturazione/bozza/15' },
  { nome: 'bozza-modificata', hash: '#fatturazione/bozza/15', fai: "const i = document.querySelectorAll('.tab-bozza input.num-riga')[1]; i.value = '1400'; i.dispatchEvent(new Event('change', { bubbles: true }))" },
  { nome: 'passa', hash: '#fatturazione/bozza/15', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Passa al programma/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'fatture', hash: '#fatturazione/fatture' },
  { nome: 'fattura-scaduta', hash: '#fatturazione/fatture', fai: "document.querySelector('.tab .r[data-id=\"12\"]').click()", dopo: "document.querySelectorAll('.pannello').forEach(p => p.remove())" },
  { nome: 'fattura-pronta', hash: '#fatturazione/fatture', fai: "document.querySelector('.tab .r[data-id=\"14\"]').click()", dopo: "document.querySelectorAll('.pannello').forEach(p => p.remove())" },
  { nome: 'incasso', hash: '#fatturazione/fatture', fai: "document.querySelector('.tab .r[data-id=\"12\"]').click(); await new Promise(r => setTimeout(r, 900)); [...document.querySelectorAll('.pannello .btn.giallo')].find(b => /Segna un incasso/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('.finestra .segmenti button')].find(b => b.textContent === 'In parte').click(); const i = document.querySelector('.finestra input.importo-grande'); i.value = '200'", dopo: "document.querySelectorAll('.velo, .pannello').forEach(v => v.remove())" },
  { nome: 'nota-credito', hash: '#fatturazione/fatture', fai: "document.querySelector('.tab .r[data-id=\"13\"]').click(); await new Promise(r => setTimeout(r, 900)); document.querySelector('.pannello .tondo[aria-label=\"Altre azioni\"]').click(); await new Promise(r => setTimeout(r, 200)); [...document.querySelectorAll('.menu button')].find(b => /nota di credito/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 300)); [...document.querySelectorAll('.finestra .segmenti button')].find(b => b.textContent === 'Righe scelte').click()", dopo: "document.querySelectorAll('.velo, .pannello, .menu').forEach(v => v.remove())" },
  { nome: 'importa', hash: '#fatturazione/fatture', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Importa XML/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'importa-letto', hash: '#fatturazione/fatture', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Importa XML/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 300)); document.querySelector('.zona-xml').click(); await new Promise(r => setTimeout(r, 2500))", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'ricevute', hash: '#fatturazione/ricevute' },
  { nome: 'ricevuta', hash: '#fatturazione/ricevute', fai: "document.querySelector('.tab .r.cliccabile').click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'scadenze-pagamento', hash: '#fatturazione/scadenze' },
  { nome: 'riepilogo-fatturato', hash: '#fatturazione/riepilogo' },
  { nome: 'scadenziario', hash: '#banche' },
  { nome: 'scadenziario-90', hash: '#banche', fai: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === '90 giorni').click(); await new Promise(r => setTimeout(r, 1200)); const g = document.querySelector('.intesta-giorno.sotto-soglia'); if (g) document.querySelector('#principale').scrollTop = g.getBoundingClientRect().top + document.querySelector('#principale').scrollTop - 300" },
  { nome: 'movimenti', hash: '#banche/movimenti' },
  { nome: 'movimento-nuovo', hash: '#banche/movimenti', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuovo movimento/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'tributi', hash: '#banche/tributi' },
  { nome: 'tributo-nuovo', hash: '#banche/tributi', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuovo tributo/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'conti', hash: '#banche/conti' },
  { nome: 'situazione', hash: '#banche/situazione' },
  { nome: 'fiscale', hash: '#amministrazione/fiscale' },
  { nome: 'cliente-modulo-fatture', hash: '#clienti/C002', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => b.textContent === 'Modifica').click(); await new Promise(r => setTimeout(r, 400)); const c = document.querySelector('.finestra .corpo-f'); c.scrollTop = c.scrollHeight", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'commessa-fatturazione', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST003', fai: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Panoramica').click()" },
  { nome: 'commessa-dafatturare', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST002', fai: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Da fatturare').click()" },
  // fase 5: documenti, ticket e assistenza (col server di prova: i dati di esempio della fase 5 sono lì)
  { nome: 'documenti', hash: '#documenti' },
  { nome: 'documento', hash: '#documenti/doc/1', fai: "await new Promise(r => setTimeout(r, 900))", dopo: CHIUDI },
  { nome: 'documento-collegamento', hash: '#documenti/doc/4', fai: "await new Promise(r => setTimeout(r, 900))", dopo: CHIUDI },
  { nome: 'documento-percorso', hash: '#documenti/doc/9', fai: "await new Promise(r => setTimeout(r, 900))", dopo: CHIUDI },
  { nome: 'aggiungi-documento', hash: '#documenti', fai: GIALLO('Aggiungi un documento'), dopo: CHIUDI },
  { nome: 'aggiungi-collegamento', hash: '#documenti', fai: GIALLO('Aggiungi un documento') + "; await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('.finestra .scelta-ruolo')][1].click(); await new Promise(r => setTimeout(r, 200)); const i = document.querySelector('.finestra .campo-con-pulsante input'); i.value = 'https://esempio-my.sharepoint.com/:f:/g/personal/studio/Commesse/26ST041'; i.dispatchEvent(new Event('input', { bubbles: true }))", dopo: CHIUDI },
  { nome: 'da-approvare-doc', hash: '#documenti/approvare' },
  { nome: 'scadenze-doc', hash: '#documenti/scadenze' },
  { nome: 'scadenza', hash: '#documenti/scadenza/5', fai: "await new Promise(r => setTimeout(r, 600))", dopo: CHIUDI },
  { nome: 'nuova-scadenza', hash: '#documenti/scadenze', fai: GIALLO('Nuova scadenza'), dopo: CHIUDI },
  { nome: 'modelli', hash: '#documenti/modelli' },
  { nome: 'testi-modello', hash: '#documenti/modelli/lettera', fai: "await new Promise(r => setTimeout(r, 600))", dopo: CHIUDI },
  { nome: 'nuova-lettera', hash: '#documenti/modelli', fai: GIALLO('Nuova lettera') + "; await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('.finestra .scelta-card')].find(b => /Batokyo/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 900)); const p = [...document.querySelectorAll('.finestra .pillola')].find(b => /terra/.test(b.textContent) && /stabilimento/i.test(b.textContent)); if (p) p.click(); await new Promise(r => setTimeout(r, 900))", dopo: CHIUDI },
  { nome: 'ticket', hash: '#ticket' },
  { nome: 'ticket-urgente', hash: '#ticket/tk/14', fai: "await new Promise(r => setTimeout(r, 900))", dopo: CHIUDI },
  { nome: 'ticket-risolto', hash: '#ticket/tk/12', fai: "await new Promise(r => setTimeout(r, 900))", dopo: CHIUDI },
  { nome: 'ticket-risolto-giu', hash: '#ticket/tk/12', fai: "await new Promise(r => setTimeout(r, 900)); const c = document.querySelector('.pannello-ticket .corpo'); c.scrollTop = 700", dopo: CHIUDI },
  { nome: 'nuovo-ticket', hash: '#ticket', fai: GIALLO('Nuovo ticket') + "; await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('.finestra .scelta-card')].find(b => /Rossi/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 900)); [...document.querySelectorAll('.finestra .pillola')].find(b => b.textContent === 'Cabina MT Acme').click(); const t = [...document.querySelectorAll('.finestra .campo')].find(c => c.querySelector('label') && c.querySelector('label').textContent === 'Cosa succede').querySelector('input'); t.value = 'Scatta il generale MT'; [...document.querySelectorAll('.finestra .pillola')].find(b => b.textContent === 'Fermo').click(); [...document.querySelectorAll('.finestra .pillola')].find(b => b.textContent === 'Subito').click()", dopo: CHIUDI },
  { nome: 'pianifica', hash: '#ticket/tk/15', fai: "await new Promise(r => setTimeout(r, 900)); [...document.querySelectorAll('.pannello-ticket .btn.giallo')].pop().click(); await new Promise(r => setTimeout(r, 1200))", dopo: CHIUDI },
  { nome: 'chiudi-ticket', hash: '#ticket/tk/12', fai: "await new Promise(r => setTimeout(r, 900)); [...document.querySelectorAll('.pannello-ticket .btn.giallo')].pop().click(); await new Promise(r => setTimeout(r, 600))", dopo: CHIUDI },
  { nome: 'programmati', hash: '#ticket/programmati' },
  { nome: 'chiusi', hash: '#ticket/chiusi' },
  { nome: 'contratti-assistenza', hash: '#ticket/contratti' },
  { nome: 'contratto', hash: '#ticket/contratto/2', fai: "await new Promise(r => setTimeout(r, 900))", dopo: CHIUDI },
  { nome: 'nuovo-contratto', hash: '#ticket/contratti', fai: GIALLO('Nuovo contratto'), dopo: CHIUDI },
  { nome: 'statistiche-ticket', hash: '#ticket/statistiche' },
  { nome: 'impianto', hash: '#ticket/impianto/4' },
  { nome: 'categorie', hash: '#amministrazione/categorie' },
  { nome: 'spazio', hash: '#amministrazione/spazio' },
  { nome: 'cliente-documenti', hash: '#clienti/C002', fai: "await new Promise(r => setTimeout(r, 500)); [...document.querySelectorAll('.segmenti button')].find(b => /^Documenti/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 800))" },
  { nome: 'cliente-sedi-impianti', hash: '#clienti/C002', fai: "[...document.querySelectorAll('.segmenti button')].find(b => /^Sedi/.test(b.textContent)).click()" },
  { nome: 'commessa-documenti', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST005', fai: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Documenti').click(); await new Promise(r => setTimeout(r, 800))" },
  // fase 6: persone, mezzi e attrezzature, collaboratori esterni (col server di prova: i dati di esempio della fase 6 sono lì).
  // Con --chi marco le pagine di Persone si aprono su "Io"; con --chi luca (esterno) solo la sua scheda e la Dashboard.
  { nome: 'f6-organico', hash: '#persone/organico' },
  { nome: 'f6-persona', hash: '#persone/p/3', fai: ATTENDI(1200) },
  { nome: 'f6-persona-giu', hash: '#persone/p/3', fai: ATTENDI(1200) + "; const c = document.querySelector('.pannello-f6 .corpo'); if (c) c.scrollTop = 900", dopo: CHIUDI },
  { nome: 'f6-persona-laura', hash: '#persone/p/2', fai: ATTENDI(1200), dopo: CHIUDI },
  { nome: 'f6-io', hash: '#persone/io', fai: ATTENDI(900) },
  { nome: 'f6-aggiungi-persona', hash: '#persone/organico', fai: GIALLO('Aggiungi una persona'), dopo: CHIUDI },
  { nome: 'f6-ferie', hash: '#persone/ferie', fai: ATTENDI(900) },
  { nome: 'f6-chiedi', hash: '#persone/ferie', fai: ATTENDI(900) + "; [...document.querySelectorAll('.btn.giallo')].find(b => /richiesta|Chiedi/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 1200))", dopo: CHIUDI },
  { nome: 'f6-approva', hash: '#persone/ferie', fai: ATTENDI(900) + "; const r = [...document.querySelectorAll('.colonna-f6 .riga')].find(x => /Da approvare/.test(x.textContent)); if (r) r.click(); await new Promise(r => setTimeout(r, 1200))", dopo: CHIUDI },
  { nome: 'f6-presenze', hash: '#persone/presenze', fai: ATTENDI(900) },
  { nome: 'f6-scadenze-persone', hash: '#persone/scadenze', fai: ATTENDI(900) },
  { nome: 'f6-costi', hash: '#persone/costi', fai: ATTENDI(900) },
  { nome: 'f6-nuovo-costo', hash: '#persone/costi', fai: ATTENDI(900) + ';' + GIALLO('Nuovo costo'), dopo: CHIUDI },
  { nome: 'f6-accessi', hash: '#persone/accessi/3', fai: ATTENDI(900) },
  { nome: 'f6-mezzi', hash: '#mezzi/mezzi', fai: ATTENDI(900) },
  { nome: 'f6-miei', hash: '#mezzi/miei', fai: ATTENDI(900) },
  { nome: 'f6-mezzo', hash: '#mezzi/mezzo/2', fai: ATTENDI(1200), dopo: CHIUDI },
  { nome: 'f6-aggiungi-mezzo', hash: '#mezzi/mezzi', fai: ATTENDI(600) + ';' + GIALLO('Aggiungi un mezzo'), dopo: CHIUDI },
  { nome: 'f6-strumenti', hash: '#mezzi/strumenti', fai: ATTENDI(900) },
  { nome: 'f6-strumento', hash: '#mezzi/at/4', fai: ATTENDI(1500), dopo: CHIUDI },
  { nome: 'f6-aggiungi-strumento', hash: '#mezzi/strumenti', fai: ATTENDI(600) + ';' + GIALLO('Aggiungi uno strumento'), dopo: CHIUDI },
  { nome: 'f6-taratura', hash: '#mezzi/at/4', fai: ATTENDI(1500) + "; [...document.querySelectorAll('.pannello-f6 .btn.giallo')].pop().click(); await new Promise(r => setTimeout(r, 500))", dopo: CHIUDI },
  { nome: 'f6-attrezzature', hash: '#mezzi/attrezzature', fai: ATTENDI(900) },
  { nome: 'f6-dpi', hash: '#mezzi/dpi', fai: ATTENDI(900) },
  { nome: 'f6-assegnazioni', hash: '#mezzi/assegnazioni', fai: ATTENDI(900) },
  { nome: 'f6-manutenzioni', hash: '#mezzi/manutenzioni', fai: ATTENDI(900) },
  { nome: 'f6-scadenze-mezzi', hash: '#mezzi/scadenze', fai: ATTENDI(900) },
  { nome: 'f6-guasto', hash: '#mezzi/mezzo/2', fai: ATTENDI(1200) + "; [...document.querySelectorAll('.pannello-f6 .btn')].find(b => /Segnala un guasto/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 400))", dopo: CHIUDI },
  { nome: 'f6-collaboratori', hash: '#collaboratori/elenco', fai: ATTENDI(900) },
  { nome: 'f6-collaboratore', hash: '#collaboratori/c/F006', fai: ATTENDI(1200), dopo: CHIUDI },
  { nome: 'f6-nuovo-collaboratore', hash: '#collaboratori/elenco', fai: ATTENDI(600) + ';' + GIALLO('Nuovo collaboratore'), dopo: CHIUDI },
  { nome: 'f6-incarichi', hash: '#collaboratori/incarichi', fai: ATTENDI(900) },
  { nome: 'f6-incarico', hash: '#collaboratori/in/1', fai: ATTENDI(1200), dopo: CHIUDI },
  { nome: 'f6-nuovo-incarico', hash: '#collaboratori/incarichi', fai: ATTENDI(900) + ';' + GIALLO('Nuovo incarico'), dopo: CHIUDI },
  { nome: 'f6-compensi', hash: '#collaboratori/compensi', fai: ATTENDI(900) },
  { nome: 'f6-documenti-coll', hash: '#collaboratori/documenti', fai: ATTENDI(900) },
  { nome: 'f6-la-tua-scheda', hash: '#collaboratori', fai: ATTENDI(1200) },
  { nome: 'f6-rapportino-strumenti', hash: '#rapportini/elenco', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuovo rapportino|Scrivi il rapportino/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 500)); const p = [...document.querySelectorAll('.finestra .pillola')].find(b => /Strumenti usati/.test(b.textContent)); if (p) p.click(); await new Promise(r => setTimeout(r, 800)); const c = document.querySelector('.finestra .corpo-f'); if (c) c.scrollTop = c.scrollHeight", dopo: CHIUDI },
  { nome: 'f6-rapportino-pannello', hash: '#rapportini/elenco', fai: "await new Promise(r => setTimeout(r, 600)); const r = document.querySelector('.tab .r[data-chiave=\"RAP/' + new Date().getFullYear() + '/0006\"]') || document.querySelector('.tab .r.cliccabile'); r.click(); await new Promise(r => setTimeout(r, 400)); const c = document.querySelector('.pannello .corpo'); if (c) c.scrollTop = 400", dopo: CHIUDI },
  { nome: 'f6-pianificazione', hash: '#attivita/pianificazione', fai: ATTENDI(1200) },
  { nome: 'f6-commessa-costi', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST001', fai: "await new Promise(r => setTimeout(r, 600)); [...document.querySelectorAll('.segmenti button')].find(b => /Costi/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 1200))" },
  { nome: 'f6-commessa-incarichi', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST001', fai: "await new Promise(r => setTimeout(r, 600)); const b = [...document.querySelectorAll('.segmenti button')].find(b => /Incarichi/.test(b.textContent)); if (b) b.click(); await new Promise(r => setTimeout(r, 1200))" },
  { nome: 'f6-ricevuta', hash: '#fatturazione/ricevute', fai: "await new Promise(r => setTimeout(r, 900)); const r = [...document.querySelectorAll('.tab .r.cliccabile')].find(x => /Impianti Veneti/.test(x.textContent)); if (r) r.click(); await new Promise(r => setTimeout(r, 1200))", dopo: CHIUDI },
  { nome: 'f6-ticket-strumenti', hash: '#ticket/tk/12', fai: "await new Promise(r => setTimeout(r, 1200)); const c = document.querySelector('.pannello-ticket .corpo'); if (c) c.scrollTop = 600", dopo: CHIUDI },
  { nome: 'f6-permessi-esterno', hash: '#amministrazione/permessi', fai: "await new Promise(r => setTimeout(r, 900)); const b = [...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Esterno'); if (b) b.click(); await new Promise(r => setTimeout(r, 600))" },
  { nome: 'f6-impostazioni', hash: '#amministrazione/persone', fai: ATTENDI(900) },
  { nome: 'f6-dashboard', hash: '#dashboard', fai: ATTENDI(900) },
  // fase 7: WhatsApp e comunicazioni, Portale clienti (lo studio), le aggiunte alle altre pagine
  { nome: 'f7-dashboard', hash: '#dashboard', fai: ATTENDI(900) },
  { nome: 'f7-da-mandare', hash: '#comunicazioni', fai: ATTENDI(1200) },
  { nome: 'f7-storico', hash: '#comunicazioni/storico', fai: ATTENDI(1200) },
  { nome: 'f7-storico-pannello', hash: '#comunicazioni/storico', fai: ATTENDI(1200) + "; const r = document.querySelector('.tab .r.cliccabile'); if (r) r.click(); await new Promise(r => setTimeout(r, 600))", dopo: CHIUDI },
  { nome: 'f7-modelli', hash: '#comunicazioni/modelli', fai: ATTENDI(1200) },
  { nome: 'f7-modello', hash: '#comunicazioni/modelli', fai: ATTENDI(1200) + "; const r = document.querySelector('.tab .r.cliccabile'); if (r) r.click(); await new Promise(r => setTimeout(r, 600))", dopo: CHIUDI },
  { nome: 'f7-notifiche', hash: '#comunicazioni/notifiche', fai: ATTENDI(1200) },
  { nome: 'f7-portale', hash: '#portale', fai: ATTENDI(1200) },
  { nome: 'f7-portale-file', hash: '#portale', fai: ATTENDI(1200) + "; const c = [...document.querySelectorAll('.carta-msg')].find(x => /File dal cliente/i.test(x.textContent)); if (c) c.querySelector('.testa-proposta').click(); await new Promise(r => setTimeout(r, 1200))", dopo: CHIUDI },
  { nome: 'f7-portale-clienti', hash: '#portale/clienti', fai: ATTENDI(1800) },
  { nome: 'f7-portale-pubblicati', hash: '#portale/pubblicati', fai: ATTENDI(1200) },
  { nome: 'f7-portale-accessi', hash: '#portale/accessi', fai: ATTENDI(1200) },
  { nome: 'f7-amm-portale', hash: '#amministrazione/portale', fai: ATTENDI(1200) },
  { nome: 'f7-amm-comunicazioni', hash: '#amministrazione/comunicazioni', fai: ATTENDI(900) },
  // fase 8: integrazioni, calendario in altre app, ricerca dentro i file, Dashboard coi riquadri, amministrazione completa
  { nome: 'f8-dashboard', hash: '#dashboard', fai: ATTENDI(900) },
  { nome: 'f8-tutto', hash: '#dashboard/tutto', fai: ATTENDI(1200) },
  { nome: 'f8-riquadri', hash: '#dashboard/tutto', fai: ATTENDI(1200) + "; [...document.querySelectorAll('#principale button, #principale a')].find(b => /Cambia i riquadri/.test(b.textContent)).click()", dopo: CHIUDI },
  { nome: 'f8-integrazioni', hash: '#integrazioni', fai: ATTENDI(1200) },
  { nome: 'f8-integrazione-errore', hash: '#integrazioni/vies', fai: ATTENDI(1600), dopo: "document.querySelectorAll('.pannello').forEach(p => p.remove())" },
  { nome: 'f8-integrazione-ricerca', hash: '#integrazioni/ricerca', fai: ATTENDI(1600), dopo: "document.querySelectorAll('.pannello').forEach(p => p.remove())" },
  { nome: 'f8-integrazione-noncollegato', hash: '#integrazioni/sdi', fai: ATTENDI(1600), dopo: "document.querySelectorAll('.pannello').forEach(p => p.remove())" },
  { nome: 'f8-calendario-altre', hash: '#attivita/altreapp', fai: ATTENDI(1400) },
  { nome: 'f8-nuovo-indirizzo', hash: '#attivita/altreapp', fai: ATTENDI(1200) + "; [...document.querySelectorAll('.btn')].find(b => /Nuovo indirizzo/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 300)); const i = document.querySelector('.finestra input'); i.value = 'Tablet di Manuel'; i.dispatchEvent(new Event('input', { bubbles: true }))", dopo: CHIUDI },
  { nome: 'f8-documenti-terra', hash: '#documenti', fai: ATTENDI(1200) + "; const i = document.querySelector('.cerca input'); i.value = 'terra'; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 1500))" },
  { nome: 'f8-amministrazione', hash: '#amministrazione', fai: ATTENDI(1800) },
  { nome: 'f8-studio', hash: '#amministrazione/studio', fai: ATTENDI(900) },
  { nome: 'f8-impostazioni', hash: '#amministrazione/impostazioni', fai: ATTENDI(1200) },
  { nome: 'f8-funzioni', hash: '#amministrazione/funzioni', fai: ATTENDI(1200) },
  { nome: 'f8-spegni-mezzi', hash: '#amministrazione/funzioni', fai: ATTENDI(1200) + "; document.querySelector('[data-modulo=\"mezzi\"] .interruttore').click()", dopo: CHIUDI },
  { nome: 'f8-numerazioni', hash: '#amministrazione/numerazioni', fai: ATTENDI(600) },
  { nome: 'f8-formato', hash: '#amministrazione/formato', fai: ATTENDI(600) + "; [...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Testo prima').click(); await new Promise(r => setTimeout(r, 100)); [...document.querySelectorAll('.segmenti button')].find(b => b.textContent === '-').click(); await new Promise(r => setTimeout(r, 100)); [...document.querySelectorAll('.segmenti button')].find(b => b.textContent === '4').click()" },
  { nome: 'f8-notifiche', hash: '#amministrazione/notifiche', fai: ATTENDI(1200) },
  { nome: 'f8-sicurezza', hash: '#amministrazione/sicurezza', fai: ATTENDI(1200) },
  { nome: 'f8-aspetto', hash: '#amministrazione/app', fai: ATTENDI(600) },
  { nome: 'f8-copie', hash: '#amministrazione/copie', fai: ATTENDI(1200) },
  { nome: 'f8-ripristino', hash: '#amministrazione/copie', fai: ATTENDI(1200) + "; " + GIALLO('Segna il ripristino provato'), dopo: CHIUDI },
  { nome: 'f8-importa', hash: '#amministrazione/importa', fai: ATTENDI(1400) },
  { nome: 'f8-importazione', hash: '#amministrazione/importa', fai: ATTENDI(1200) + "; " + GIALLO('Importa clienti e fornitori') + "; await new Promise(r => setTimeout(r, 2200))", dopo: CHIUDI },
  { nome: 'f8-stato', hash: '#amministrazione/stato', fai: ATTENDI(1400) },
  { nome: 'f8-controlli', hash: '#amministrazione/controlli', fai: ATTENDI(1400) },
  { nome: 'f8-controllo', hash: '#amministrazione/controlli', fai: ATTENDI(1400) + "; document.querySelector('.tab-controlli .r[data-chiave=\"T04\"]').click()", dopo: "document.querySelectorAll('.pannello').forEach(p => p.remove())" },
];

const aspetta = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(USCITA, { recursive: true });
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-prove-'));
  const porta = 9300 + Math.floor(Math.random() * 500);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--user-data-dir=' + profilo, '--remote-debugging-port=' + porta, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  try {
    let lista = null;
    for (let i = 0; i < 50 && !lista; i++) {
      await aspetta(200);
      lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json()).catch(() => null);
    }
    const pagina = (lista || []).find(x => x.type === 'page');
    if (!pagina) throw new Error('Edge senza finestra non è partito');
    ws = new WebSocket(pagina.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    let n = 0;
    const attese = new Map();
    const errori = [];
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && attese.has(d.id)) { attese.get(d.id)(d); attese.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') errori.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errori.push(d.params.args.map(a => a.value || a.description).join(' '));
    };
    const cdp = (method, params) => new Promise(ok => { const id = ++n; attese.set(id, ok); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const valuta = async espr => {
      const r = await cdp('Runtime.evaluate', { expression: espr, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) errori.push('[valuta] ' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text));
      return r.result && r.result.result ? r.result.result.value : undefined;
    };
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: LARGO, height: ALTO, deviceScaleFactor: 1, mobile: false });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: SCURO ? 'dark' : 'light' }] });

    const email = CHI === 'lettura' ? 'lettura@esempio.it' : CHI + '@esempio.it';
    // Ogni pagina si carica da capo (cambiando solo il #, il browser non ricarica niente).
    let giro = 0;
    const vai = async hash => {
      await cdp('Page.navigate', { url: BASE + '/?g=' + (++giro) + (hash || '') });
      await aspetta(1100);
    };
    // La visita guidata non deve coprire le schermate: si segna come già vista, su una
    // pagina vuota della stessa origine, prima che l'interfaccia parta.
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); localStorage.setItem('wisper-tema', 'auto'); localStorage.removeItem('wisper-lato'); true");
    // Si entra sempre come l'utente scelto: chi era dentro prima esce.
    await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' }).then(r => r.json())");
    for (const p of PAGINE) {
      if (SOLO.length && SOLO.indexOf(p.nome) < 0) continue;
      const prima = errori.length;
      if (p.esci) {
        await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' }).then(r => r.json())");
        await vai('#dashboard');
      } else {
        await valuta("fetch('/locale/stato').then(r => r.json()).then(s => s.entrato ? true : fetch('/locale/accedi', { method: 'POST', body: JSON.stringify({ email: '" + email + "', password: 'prova' }) }).then(r => r.json()))");
        await vai(p.hash);
        if (p.fai) { await valuta('(async () => { ' + p.fai + ' })()'); await aspetta(600); }
      }
      const foto = await cdp('Page.captureScreenshot', { format: 'png' });
      const file = path.join(USCITA, p.nome + (SCURO ? '-scuro' : '') + (CHI !== 'manuel' ? '-' + CHI : '') + '.png');
      fs.writeFileSync(file, Buffer.from(foto.result.data, 'base64'));
      console.log((errori.length > prima ? 'ERRORI ' : 'ok     ') + file);
      for (const e of errori.slice(prima)) console.log('   ' + String(e).split('\n').slice(0, 3).join('\n   '));
      if (p.dopo) { await valuta(p.dopo); await aspetta(200); }
    }
    if (errori.length) process.exitCode = 1;
  } finally {
    if (ws) ws.close();
    edge.kill();
    await aspetta(500);
    try { fs.rmSync(profilo, { recursive: true, force: true }); } catch (e) { /* Edge a volte tiene un file ancora un attimo */ }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
