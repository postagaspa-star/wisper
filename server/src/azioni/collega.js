/*
 * Collegare il computer col QR, come WhatsApp (docs/gestionale/collega-qr.md §4 e §5).
 *
 *  1. Wisper Ufficio crea una coppia di chiavi P-256 e un id a caso, e li mostra nel QR della pagina di accesso.
 *  2. Il telefono (gia' entrato) inquadra, chiede conferma e manda autorizzaComputer {id, chiave, nome}:
 *     il server si segna, in memoria, che quell'id puo' entrare come quell'utente, per 2 minuti.
 *  3. Il computer chiede attesaComputer {id} ogni 2 secondi, senza token e solo dalla rete di casa. Quando l'id
 *     e' autorizzato il server crea la sessione come accedi, e risponde UNA volta sola col pacchetto (la stessa
 *     risposta di accedi, piu' l'indirizzo Google) cifrato per la chiave del computer: chi ha visto il QR non
 *     puo' leggerlo, perche' la parte privata della chiave non lascia mai il computer.
 *  4. Il telefono chiede statoComputer {id} per dire "e' entrato" o "il computer non ha risposto".
 *
 * Niente tabella: una Map in memoria. Se il server si riavvia, chi stava collegando rifa' il QR.
 * Nessun segreto nel registro o negli accessi: solo il nome del computer.
 */
'use strict';

const crypto = require('node:crypto');
const { Rifiuto, testo, adessoMs } = require('../utili');
const { provenienza } = require('../provenienza');

/** Quanto vale un'autorizzazione del telefono. */
const DURATA_MS = 2 * 60000;
/** Quanto resta "entrato", perche' il telefono possa dirlo. */
const ENTRATO_MS = 5 * 60000;
/** Per quanto un id gia' usato resta rifiutato (un codice vive 2 minuti: un'ora basta e avanza). */
const USATO_MS = 60 * 60000;
/** Al massimo tante autorizzazioni in attesa per utente: le piu' vecchie si buttano. */
const MASSIMO_PER_UTENTE = 5;
/** Al massimo tanti id ricordati in tutto (un telefono che ne mandasse migliaia non riempie la memoria). */
const MASSIMO_RICORDATI = 2000;
/** L'"info" di HKDF: cambia solo con una versione nuova del protocollo (il "1" del QR). */
const INFO = Buffer.from('wisper-collega-1', 'utf8');

const NON_CODICE = 'Questo non è un codice di Wisper Ufficio';
const GIA_USATO = 'Questo codice è già stato usato: sul computer ne compare uno nuovo';
const SOLO_UFFICIO = 'Il collegamento col telefono si fa solo in ufficio';

/** Un testo base64url senza "=" che decodificato e' lungo esattamente n byte (e scritto nel solo modo giusto). */
function base64url(s, n) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const b = Buffer.from(s, 'base64url');
  return b.length === n && b.toString('base64url') === s ? b : null;
}

/** La chiave pubblica del computer: 33 byte compressi (02/03 + X) che sono davvero un punto di P-256. */
function chiaveComputer(s) {
  const b = base64url(s, 33);
  if (!b || (b[0] !== 2 && b[0] !== 3)) return null;
  try {
    const prova = crypto.createECDH('prime256v1');
    prova.generateKeys();
    prova.computeSecret(b);
    return b;
  } catch (e) {
    return null;
  }
}

/** Il nome del computer: 1-32 caratteri, senza caratteri di controllo ne' di formato (niente scritte rovesciate). */
function nomeComputer(s) {
  if (typeof s !== 'string') return null;
  const n = s.trim();
  const lunghezza = [...n].length;
  if (lunghezza < 1 || lunghezza > 32 || /[\p{Cc}\p{Cf}]/u.test(n)) return null;
  return n;
}

/**
 * Cifra il pacchetto per il computer (§5): ECDH P-256 con una chiave nuova del server, HKDF-SHA256 (sale = id,
 * info = "wisper-collega-1", 32 byte), AES-256-GCM con iv di 12 byte, AAD = id, tag di 16 byte in coda.
 * opzioni.privataServer e opzioni.iv: valori fissi, solo per il caso di prova condiviso col computer.
 * Torna {chiave: pubblica del server NON compressa (65 byte), iv, dati}, tutto in base64url.
 */
function cifraPacchetto(chiave, id, inChiaro, opzioni) {
  opzioni = opzioni || {};
  const server = crypto.createECDH('prime256v1');
  if (opzioni.privataServer) server.setPrivateKey(opzioni.privataServer);
  else server.generateKeys();
  const segreto = server.computeSecret(chiave);
  const aes = Buffer.from(crypto.hkdfSync('sha256', segreto, id, INFO, 32));
  const iv = opzioni.iv || crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', aes, iv, { authTagLength: 16 });
  c.setAAD(id);
  const dati = Buffer.concat([c.update(Buffer.from(inChiaro, 'utf8')), c.final(), c.getAuthTag()]);
  return { chiave: server.getPublicKey(null, 'uncompressed').toString('base64url'), iv: iv.toString('base64url'), dati: dati.toString('base64url') };
}

/**
 * La parte del computer, per le prove e per il finto ponte (quella vera e' in pc/WisperUfficio/CollegaQr.cs):
 * dalla chiave privata del computer (32 byte) e dalla risposta "pronto" al testo in chiaro. Lancia se non torna.
 */
function decifraPacchetto(privataComputer, id, r) {
  const computer = crypto.createECDH('prime256v1');
  computer.setPrivateKey(privataComputer);
  const segreto = computer.computeSecret(Buffer.from(r.chiave, 'base64url'));
  const aes = Buffer.from(crypto.hkdfSync('sha256', segreto, id, INFO, 32));
  const tutto = Buffer.from(r.dati, 'base64url');
  const d = crypto.createDecipheriv('aes-256-gcm', aes, Buffer.from(r.iv, 'base64url'), { authTagLength: 16 });
  d.setAAD(id);
  d.setAuthTag(tutto.subarray(tutto.length - 16));
  return Buffer.concat([d.update(tutto.subarray(0, tutto.length - 16)), d.final()]).toString('utf8');
}

module.exports = {
  /** Le autorizzazioni vive (id -> voce) e gli id gia' usati (id -> fino a quando), con la pulizia. */
  collegamentiQr() {
    if (!this.qrVivi) {
      this.qrVivi = new Map();
      this.qrUsati = new Map();
    }
    const ora = adessoMs();
    for (const [id, v] of this.qrVivi) {
      const fine = v.stato === 'entrato' ? v.entratoIl + ENTRATO_MS : v.quando + DURATA_MS;
      if (ora > fine) this.qrVivi.delete(id);
    }
    for (const [id, fino] of this.qrUsati) if (ora > fino) this.qrUsati.delete(id);
    // I piu' vecchi per primi (una Map tiene l'ordine di inserimento).
    while (this.qrUsati.size > MASSIMO_RICORDATI) this.qrUsati.delete(this.qrUsati.keys().next().value);
    return { vivi: this.qrVivi, usati: this.qrUsati };
  },

  /**
   * autorizzaComputer {id, chiave, nome} dal telefono gia' entrato (da casa o da Google). Nessun permesso di modulo:
   * ognuno collega un computer per se', coi suoi permessi.
   */
  autorizzaComputer(d) {
    const c = this.chi();
    // Serve una sessione vera (il ponte delle versioni vecchie lavora come titolare, senza sessione).
    if (!c.utente || !c.sessione) throw new Rifiuto('Per collegare un computer entra dal telefono con la tua email');
    const id = base64url(d.id, 16);
    const chiave = chiaveComputer(d.chiave);
    const nome = nomeComputer(d.nome);
    if (!id || !chiave || !nome) throw new Rifiuto(NON_CODICE);
    const { vivi, usati } = this.collegamentiQr();
    if (vivi.has(d.id) || usati.has(d.id)) throw new Rifiuto(GIA_USATO);
    const ora = adessoMs();
    // Al massimo 5 in attesa per utente: via le piu' vecchie.
    const mie = [...vivi.values()].filter(v => v.idUtente === c.utente.id && v.stato === 'autorizzato').sort((a, b) => a.quando - b.quando);
    while (mie.length >= MASSIMO_PER_UTENTE) vivi.delete(mie.shift().id);
    vivi.set(d.id, { id: d.id, idUtente: c.utente.id, idSessioneTelefono: c.sessione, chiave, nome, quando: ora, stato: 'autorizzato', entratoIl: 0 });
    usati.set(d.id, ora + USATO_MS);
    this.annota('collegamenti_qr', nome, null, { nome, stato: 'autorizzato' }, 'Collegamento col QR autorizzato per ' + nome);
    return { ok: true, nome };
  },

  /**
   * attesaComputer {id} dal computer, senza token, solo dalla rete di casa. Sempre "attesa" per un id che non c'e'
   * (non si capisce se esiste); "pronto" una volta sola, col pacchetto cifrato; "rifiutato" se chi ha inquadrato
   * nel frattempo e' stato disattivato o il suo telefono scollegato.
   */
  attesaComputer(d) {
    if (provenienza().daFuori) throw new Rifiuto(SOLO_UFFICIO);
    const { vivi } = this.collegamentiQr();
    const v = typeof d.id === 'string' ? vivi.get(d.id) : null;
    if (!v || v.stato !== 'autorizzato') return { ok: true, stato: 'attesa' };
    const u = this.db.riga('SELECT * FROM utenti WHERE id = ?', v.idUtente);
    const telefono = this.db.riga('SELECT revocata FROM sessioni WHERE id = ?', v.idSessioneTelefono);
    if (!u || u.attivo !== 1 || !telefono || telefono.revocata) {
      vivi.delete(v.id);
      return { ok: true, stato: 'rifiutato' };
    }
    // Da qui in poi una volta sola: lo stato cambia prima di creare la sessione.
    v.stato = 'entrato';
    v.entratoIl = adessoMs();
    const app = ('Wisper Ufficio · ' + v.nome).slice(0, 40);
    const disp = testo(d.disp).slice(0, 64) || 'qr-' + v.id.slice(0, 12);
    const pacchetto = this.creaSessione(u, { disp, dispNome: v.nome, app });
    // L'indirizzo Google solo se la porta Google e' configurata e accesa: con WISPER_PORTA_GOOGLE=no lo script non ha
    // ancora Porta.gs, e il computer ci manderebbe accedi e le richieste da fuori casa (collega-qr.md, decisioni).
    const porta = this.porta;
    if (porta && porta.configurata() && !porta.spenta) pacchetto.google = porta.url;
    const cifrato = cifraPacchetto(v.chiave, Buffer.from(v.id, 'base64url'), JSON.stringify(pacchetto));
    // La riga negli accessi, come accedi, con "col QR" (la richiesta di attesa in se' non lascia righe: arriva ogni 2 secondi).
    this.registraAccesso({ azione: 'accedi col QR', disp, dispNome: v.nome, app }, 'ok', { id: u.id });
    return { ok: true, stato: 'pronto', chiave: cifrato.chiave, iv: cifrato.iv, dati: cifrato.dati };
  },

  /** statoComputer {id} dal telefono: solo per chi l'ha autorizzato (per gli altri l'id non esiste: "scaduto"). */
  statoComputer(d) {
    const c = this.chi();
    const { vivi } = this.collegamentiQr();
    const v = typeof d.id === 'string' ? vivi.get(d.id) : null;
    if (!v || !c.utente || v.idUtente !== c.utente.id) return { ok: true, stato: 'scaduto', nome: '' };
    return { ok: true, stato: v.stato, nome: v.nome };
  },
};

Object.defineProperties(module.exports, {
  cifraPacchetto: { value: cifraPacchetto },
  decifraPacchetto: { value: decifraPacchetto },
  DURATA_MS: { value: DURATA_MS },
  ENTRATO_MS: { value: ENTRATO_MS },
  MASSIMO_PER_UTENTE: { value: MASSIMO_PER_UTENTE },
});
