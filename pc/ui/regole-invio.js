/*
 * Wisper Ufficio: le regole dell'invio dei rapportini, senza niente di grafico (riunione con Manuel del 06/11/2026).
 *
 * - periodoInvio: oggetto e frase dell'email capiscono il periodo dei rapportini (stesso giorno, stessa settimana
 *   lunedì-domenica, stesso mese, più mesi); un rapportino solo resta come prima ("Rapportino 153 del 05/11/2026").
 *   Casi condivisi col telefono in server/prove/casi-invio.json.
 * - emailDestinatario: l'email già scritta nel campo A. Un rapportino: quella del suo cliente (senza, quella del cliente
 *   della commessa, cioè chi paga). Più rapportini: quella dell'unico destinatario, quando hanno tutti lo stesso cliente o
 *   tutti la stessa email.
 *
 * Stanno qui da sole perché si provano con Node (prove/invio.test.js).
 */
(function (radice) {
  'use strict';

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  /** "2026-11-05" -> { a, m, g, giorno della settimana 0 = lunedì, numero del giorno per confrontare } (null se non è una data). */
  function leggi(iso) {
    const x = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!x) return null;
    const a = Number(x[1]); const m = Number(x[2]); const g = Number(x[3]);
    const t = Date.UTC(a, m - 1, g);
    const giorni = Math.round(t / 86400000);
    return { a, m, g, iso: x[0], giorni, lunedi: giorni - ((new Date(t).getUTCDay() + 6) % 7) };
  }

  const dueCifre = n => String(n).padStart(2, '0');
  const dataBreve = d => dueCifre(d.g) + '/' + dueCifre(d.m) + '/' + d.a;
  /** Il giorno: "1°" il primo del mese, altrimenti il numero. */
  const numeroGiorno = g => (g === 1 ? '1°' : String(g));
  /** "del 5", "dell'8", "dall'11", "al 1°" (prep: del, dal, al): davanti a 8 e 11 la preposizione si apostrofa. */
  const conPreposizione = (prep, g) => (g === 8 || g === 11 ? prep + 'l\'' : prep + ' ') + numeroGiorno(g);

  /**
   * L'oggetto e la frase dell'email per i rapportini di queste date. numero: il numero del rapportino quando è uno solo.
   * La frase va dopo "in allegato ".
   */
  function periodoInvio(date, numero) {
    const lista = (Array.isArray(date) ? date : [date]).map(leggi).filter(Boolean).sort((x, y) => x.giorni - y.giorni);
    if (!lista.length) return { oggetto: 'Rapportini', frase: 'il riepilogo dei rapportini' };
    const primo = lista[0];
    const ultimo = lista[lista.length - 1];
    if (lista.length === 1 && numero !== undefined && numero !== null) {
      const n = String(numero).trim();
      return { oggetto: 'Rapportino ' + (n ? n + ' ' : '') + 'del ' + dataBreve(primo), frase: 'il rapportino del ' + dataBreve(primo) };
    }
    let periodo;
    if (primo.giorni === ultimo.giorni) {
      periodo = conPreposizione('del', primo.g) + ' ' + MESI[primo.m - 1] + ' ' + primo.a;
    } else if (primo.lunedi === ultimo.lunedi) {
      const stessoMese = primo.m === ultimo.m && primo.a === ultimo.a;
      const inizio = conPreposizione('dal', primo.g) + (stessoMese ? '' : ' ' + MESI[primo.m - 1] + (primo.a === ultimo.a ? '' : ' ' + primo.a));
      periodo = 'della settimana ' + inizio + ' ' + conPreposizione('al', ultimo.g) + ' ' + MESI[ultimo.m - 1] + ' ' + ultimo.a;
    } else if (primo.m === ultimo.m && primo.a === ultimo.a) {
      periodo = 'di ' + MESI[primo.m - 1] + ' ' + primo.a;
    } else {
      // davanti ad aprile e agosto la a diventa ad (da aprile ad agosto)
      const a = /^a/.test(MESI[ultimo.m - 1]) ? ' ad ' : ' a ';
      periodo = 'da ' + MESI[primo.m - 1] + (primo.a === ultimo.a ? '' : ' ' + primo.a) + a + MESI[ultimo.m - 1] + ' ' + ultimo.a;
    }
    return { oggetto: 'Rapportini ' + periodo, frase: 'il riepilogo dei rapportini ' + periodo };
  }

  /** Il corpo dell'email: "Buongiorno,\nin allegato <frase>.\n\nCordiali saluti\n<firma>". */
  function messaggioInvio(frase, firma) {
    return 'Buongiorno,\nin allegato ' + frase + '.\n\nCordiali saluti\n' + (firma || '');
  }

  const norm = s => String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const pulita = e => String(e || '').trim();

  /**
   * Il cliente di un rapportino (dal suo id, oppure dal nome se il rapportino non ha l'id) e la sua email; senza email,
   * quella del cliente della commessa. trova: { cliente(id), perNome(nome), commessa(id) }.
   */
  function destinatarioDi(r, trova) {
    const t = trova || {};
    const c = (r.idCliente && t.cliente && t.cliente(r.idCliente)) || (r.cliente && t.perNome && t.perNome(r.cliente)) || null;
    let email = pulita(c && c.email);
    if (!email && r.idCommessa && t.commessa) {
      const m = t.commessa(r.idCommessa);
      const daCommessa = m && m.idCliente && t.cliente ? t.cliente(m.idCliente) : null;
      email = pulita(daCommessa && daCommessa.email);
    }
    return { chiave: c ? 'id:' + c.id : 'nome:' + norm(r.cliente), email };
  }

  /**
   * L'email già scritta nel campo A per questi rapportini ('' se non si sa a chi va): tutti dello stesso cliente = la
   * sua; clienti diversi ma la stessa email per tutti = quella; altrimenti niente (la si scrive a mano).
   */
  function emailDestinatario(lista, trova) {
    const dest = (lista || []).filter(Boolean).map(r => destinatarioDi(r, trova));
    if (!dest.length) return '';
    const chiavi = new Set(dest.map(d => d.chiave));
    const email = dest.map(d => d.email).find(Boolean) || '';
    if (chiavi.size === 1) return email;
    const tutte = new Set(dest.map(d => d.email.toLowerCase()));
    return tutte.size === 1 && email ? email : '';
  }

  const Regole = { periodoInvio, messaggioInvio, emailDestinatario, destinatarioDi, MESI };

  if (typeof module !== 'undefined' && module.exports) module.exports = Regole;
  else radice.WisperRegoleInvio = Regole;
})(typeof window !== 'undefined' ? window : globalThis);
