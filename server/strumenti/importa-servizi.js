/*
 * I servizi di Flextaxa nei Servizi di Wisper (1.4.0, docs/gestionale/servizi.md §1).
 *
 * Legge il CSV che Flextaxa esporta (Prodotti e servizi: Tipo;Descrizione;Codice;Fornitore;UM;Prezzo acquisto;Prezzo
 * vendita;Aliquota;...;Tags;Note) e per ogni riga aggiorna il servizio con lo stesso codice o ne crea uno nuovo.
 * I prezzi veri stanno solo nel database: il CSV non va nel repository, e qui si stampano solo i numeri.
 *
 *   node server/strumenti/importa-servizi.js <file.csv | -> [--dati <cartella>] [--prova] [--archivia-altri]
 *
 * --prova           dice cosa farebbe, senza scrivere
 * --archivia-altri  archivia i servizi che non sono nel file e che nessun preventivo usa (quelli d'esempio della
 *                   fase 2: Sopralluogo, Progetto preliminare...); restano fra gli archiviati
 * "-" legge il CSV da stdin (sul NAS: docker exec -i wisper node strumenti/importa-servizi.js - < servizi.csv).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { serviziDaCsv } = require('../src/servizi');

function principale(argv) {
  let dati = process.env.WISPER_DATI || '/data';
  let prova = false;
  let archiviaAltri = false;
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dati') dati = argv[++i];
    else if (argv[i] === '--prova') prova = true;
    else if (argv[i] === '--archivia-altri') archiviaAltri = true;
    else file = argv[i];
  }
  if (!file) throw new Error('Si usa: node server/strumenti/importa-servizi.js <file.csv | -> [--dati <cartella>] [--prova] [--archivia-altri]');
  const testo = fs.readFileSync(file === '-' ? 0 : path.resolve(file), 'utf8');
  const servizi = serviziDaCsv(testo);
  if (!servizi.length) throw new Error('Nel file non c\'è nessun servizio');

  const { Wisper, SISTEMA } = require('../src/wisper');
  const w = new Wisper({ dati: path.resolve(dati) });
  const esito = { nuovi: 0, aggiornati: 0, uguali: 0, archiviati: 0, senzaCodice: 0 };
  try {
    w.come(Object.assign({}, SISTEMA, { app: 'importa-servizi.js', dispNome: 'NAS' }), () => w.db.transazione(() => {
      const tutti = w.leggiListino(true);
      const perCodice = new Map(tutti.filter(s => s.codice).map(s => [s.codice.toUpperCase(), s]));
      const toccati = new Set();
      let ordine = tutti.reduce((m, s) => Math.max(m, Number(s.ordine) || 0), 0);
      for (const s of servizi) {
        if (!s.codice) esito.senzaCodice++;
        const c = s.codice ? perCodice.get(s.codice.toUpperCase()) : tutti.find(x => !x.codice && x.nome.toLowerCase() === s.nome.toLowerCase());
        const voce = Object.assign({}, s, { attivo: true });
        if (c) {
          toccati.add(c.id);
          const uguale = ['nome', 'unita', 'prezzo', 'prezzoAcquisto', 'aliquotaIva', 'fornitore', 'note', 'tipo'].every(k => String(c[k] === null ? '' : c[k]) === String(voce[k] === null ? '' : voce[k])) &&
            c.tag.join(',') === voce.tag.join(',') && c.attivo;
          if (uguale) { esito.uguali++; continue; }
          esito.aggiornati++;
          if (!prova) w.salvaVoceListino(Object.assign({ id: c.id }, voce));
        } else {
          esito.nuovi++;
          if (!prova) {
            const nuovo = w.salvaVoceListino(Object.assign({ ordine: ++ordine }, voce));
            toccati.add(nuovo.id);
          }
        }
      }
      if (archiviaAltri) {
        const usati = new Set(w.db.righe('SELECT DISTINCT listino_id FROM preventivo_voci WHERE listino_id IS NOT NULL').map(r => r.listino_id));
        for (const s of tutti) {
          if (!s.attivo || toccati.has(s.id) || usati.has(s.id)) continue;
          if (s.codice && servizi.some(x => x.codice && x.codice.toUpperCase() === s.codice.toUpperCase())) continue;
          esito.archiviati++;
          if (!prova) w.archiviaVoceListino(s.id, true);
        }
      }
      if (prova) throw Object.assign(new Error('prova'), { prova: true });
    }));
  } catch (err) {
    if (!err.prova) throw err;
  } finally {
    w.chiudi();
  }
  console.log((prova ? '[prova, niente scritto] ' : '') + 'servizi nel file: ' + servizi.length + ' | nuovi: ' + esito.nuovi + ' | aggiornati: ' + esito.aggiornati +
    ' | gia\' uguali: ' + esito.uguali + (archiviaAltri ? ' | archiviati: ' + esito.archiviati : '') + (esito.senzaCodice ? ' | senza codice: ' + esito.senzaCodice : ''));
  return esito;
}

if (require.main === module) {
  try {
    principale(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { principale };
