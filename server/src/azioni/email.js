/*
 * Le email partono dal Gmail del foglio, attraverso il postino (come oggi
 * partivano dallo script): il cliente riceve il rapportino dallo stesso
 * indirizzo di sempre.
 */
'use strict';

const { Rifiuto, testo } = require('../utili');

module.exports = {
  /** A chi va un'email "a me": l'email di chi e' entrato, o quella dello studio. */
  emailMia() {
    const c = this.chi();
    if (c.utente && testo(c.utente.email)) return testo(c.utente.email);
    const studio = testo(this.leggiImpostazioni().EMAIL);
    if (studio) return studio;
    throw new Rifiuto('Il server non sa a chi mandare l\'email: scrivi l\'email dello studio nelle impostazioni');
  },

  /**
   * Manda la mail coi PDF allegati e segna i rapportini come INVIATO. Con aMe
   * la manda solo a se stessi, come anteprima, e non cambia niente. Un
   * riepilogo puo' contenere rapportini gia' fatturati: mandarlo non li riporta
   * indietro a "inviato".
   */
  async inviaEmail(d) {
    const aMe = d.aMe === true;
    const destinatario = aMe ? this.emailMia() : testo(d.a);
    if (!destinatario) throw new Rifiuto('Manca l\'indirizzo del cliente');
    const ids = Array.isArray(d.ids) ? d.ids : [];
    // Un collaboratore manda solo i suoi: si controlla prima di spedire, non dopo.
    if (!aMe) {
      for (const id of ids) {
        const r = this.trovaRiga(id, id);
        if (r) this.controllaSuo(r, 'mandare i rapportini degli altri');
        // Fase 3: uno che aspetta l'approvazione non parte (prima di spedire, non dopo).
        if (r && testo(r.stato).toUpperCase() !== 'FATTURATO') this.controllaApprovato(r);
      }
    }
    if (!this.postino || !this.postino.configurato()) {
      throw new Rifiuto('Le email non sono collegate: manca il postino (WISPER_POSTINO_URL nel .env del server)');
    }
    const imp = this.leggiImpostazioni();
    const posta = {
      a: destinatario,
      nome: testo(imp.RAGIONE_SOCIALE) || 'Wisper',
      oggetto: testo(d.oggetto) || 'Rapportino',
      messaggio: testo(d.messaggio) || ' ',
      allegati: (d.allegati || []).map(a => ({ nome: a.nome || 'rapportino.pdf', mime: a.mime || 'application/pdf', base64: a.base64 })),
    };
    if (!aMe && testo(d.cc)) posta.cc = testo(d.cc);
    if (testo(imp.EMAIL)) posta.rispondiA = testo(imp.EMAIL);
    try {
      await this.postino.email(posta);
    } catch (err) {
      throw new Rifiuto('L\'email non è partita: ' + err.message, err.rete ? { rete: true } : {});
    }
    if (aMe || !ids.length) return [];
    return this.db.transazione(() => {
      const daSegnare = ids.filter(id => {
        const r = this.trovaRiga(id, id);
        return r && testo(r.stato).toUpperCase() !== 'FATTURATO';
      });
      return daSegnare.length ? this.cambiaStato(daSegnare, 'INVIATO') : [];
    });
  },
};
