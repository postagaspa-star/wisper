package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * La fase 7 sul telefono senza server (fase7.md): il numero e il link di WhatsApp coi casi
 * condivisi (server/prove/casi-whatsapp.json, gli stessi del server e del computer), i
 * segnaposti che mancano, e le risposte di §10 lette campo per campo.
 */
class ComunicazioniTest {

    private fun casi(nome: String): JSONObject? =
        listOf("../server/prove/$nome", "server/prove/$nome").map(::File).firstOrNull { it.exists() }?.let { JSONObject(it.readText()) }

    // ---------------------------------------------------------------------------- WhatsApp, coi casi condivisi

    @Test
    fun `il numero per WhatsApp come casi-whatsapp json`() {
        val c = casi("casi-whatsapp.json")
        assumeTrue("Manca server/prove/casi-whatsapp.json", c != null)
        val elenco = c!!.getJSONArray("casi").oggetti()
        assertTrue("i casi ci sono tutti", elenco.size >= 17)
        elenco.forEach { x ->
            val n = Whatsapp.numero(x.optString("testo"))
            val nome = x.testo("nome")
            assertEquals("$nome: valido", x.optBoolean("valido"), n.valido)
            if (x.optBoolean("valido")) {
                assertEquals("$nome: numero", x.testo("numero"), n.numero)
                assertEquals("$nome: fisso", x.optBoolean("fisso"), n.fisso)
                assertEquals("$nome: visto", x.testo("visto"), n.visto)
            }
        }
    }

    @Test
    fun `il link di wa me come casi-whatsapp json`() {
        val c = casi("casi-whatsapp.json")
        assumeTrue("Manca server/prove/casi-whatsapp.json", c != null)
        c!!.getJSONArray("link").oggetti().forEach { x ->
            assertEquals(x.testo("link"), Whatsapp.link(x.testo("numero"), x.optString("testo")))
        }
    }

    @Test
    fun `i casi di fase7 md 9 3 anche senza il file`() {
        assertEquals("393330001122", Whatsapp.numero("333 000 1122").numero)
        assertEquals("393330001122", Whatsapp.numero("+39 333-000-1122").numero)
        assertEquals("393330001122", Whatsapp.numero("0039 3330001122").numero)
        Whatsapp.numero("0445 000100").let { assertEquals("390445000100", it.numero); assertTrue(it.fisso); assertEquals("+39 0445000100", it.visto) }
        assertEquals("41790001122", Whatsapp.numero("+41 79 000 11 22").numero)
        assertFalse(Whatsapp.numero("123").valido)
        assertFalse(Whatsapp.numero("").valido)
        assertFalse(Whatsapp.numero(null).valido)
        assertEquals("+39 333 000 1122", Whatsapp.visto("393330001122"))
    }

    @Test
    fun `il pacchetto di WHATSAPP_APP`() {
        assertEquals("com.whatsapp.w4b", Whatsapp.pacchetto("business"))
        assertEquals("com.whatsapp", Whatsapp.pacchetto("normale"))
        assertNull("chiedi: sceglie il sistema", Whatsapp.pacchetto("chiedi"))
    }

    @Test
    fun `codifica come encodeURIComponent, accenti e a capo compresi`() {
        assertEquals("gioved%C3%AC%2023%0Aciao", Whatsapp.codifica("giovedì 23\nciao"))
        assertEquals("l'appuntamento%20(ok)!~*", Whatsapp.codifica("l'appuntamento (ok)!~*"))
        assertEquals("a%2Bb%26c%3D%3F%2F", Whatsapp.codifica("a+b&c=?/"))
    }

    // ---------------------------------------------------------------------------- segnaposti

    @Test
    fun `i segnaposti che restano si dicono con la loro parola`() {
        val t = "Buongiorno Sig. Ferretti, l'appuntamento di {giorno} alle 9:00 presso {luogo}: {luogo}."
        assertEquals(listOf("{giorno}", "{luogo}"), Segnaposti.mancano(t))
        assertEquals("manca il luogo", Segnaposti.manca("{luogo}"))
        assertEquals("manca l'ora", Segnaposti.manca("{ora}"))
        assertTrue(Segnaposti.mancano("Buongiorno Mario Bianchi, ").isEmpty())
    }

    @Test
    fun `un segnaposto sconosciuto o di un altro uso si rifiuta`() {
        assertEquals("{cleinte}", Segnaposti.sconosciuto("Buongiorno {nome} di {cleinte}", "libero"))
        assertEquals("{fattura}", Segnaposti.sconosciuto("La fattura {fattura}", "appuntamento"))
        assertNull(Segnaposti.sconosciuto("Il {giorno} alle {ora} da {nome}, {mittente}", "appuntamento"))
        assertNull(Segnaposti.sconosciuto("Fattura {fattura} di {importo}", "pagamento"))
        assertTrue(Segnaposti.per("pagamento").containsAll(listOf("{nome}", "{portale}", "{fattura}", "{data_fattura}", "{importo}", "{scadenza}")))
    }

    // ---------------------------------------------------------------------------- le risposte di §10, campo per campo

    @Test
    fun `daMandare come fase7 md 10 2`() {
        val o = JSONObject("""{"ok": true, "oggi": [
            {"proposta": "attivita:31:2026-10-23", "tipo": "promemoria_appuntamento", "titolo": "Promemoria appuntamento",
             "dettaglio": "Domani alle 9:00 · Intervento TK/2026/0014 · Cabina MT di Zanè", "canale": "whatsapp",
             "a": {"idReferente": 3, "nome": "Sig. Ferretti", "cliente": "Rossi Impianti Srl", "numero": "393330001122",
                   "numeroVisto": "+39 333 000 1122", "email": "f.ferretti@rossi.example", "whatsappOk": true, "fisso": false},
             "riferimento": {"tipo": "attivita", "id": 31}, "modello": "promemoria_appuntamento",
             "testo": "Buongiorno Sig. Ferretti, le ricordo l'appuntamento di giovedì 23 ottobre alle 9:00 presso Cabina MT di Zanè: Intervento TK/2026/0014. Se non va più bene mi scriva pure. Manuel Gasparotto · Studio Tecnico GM",
             "oggetto": "Promemoria: giovedì 23 ottobre alle 9:00", "mancano": []}],
           "domani": [], "proposti": [{"proposta": "fattura:43:1", "modello": "promemoria_pagamento", "canale": "email", "a": {"nome": "Mario Bianchi", "email": "mario.bianchi@esempio.it"}, "testo": "Buongiorno {nome}"}],
           "preparati": [{"id": 55, "quando": "2026-10-20T07:55:00", "canale": "whatsapp", "direzione": "uscita", "tipo": "promemoria_appuntamento", "stato": "preparato", "referente": "Giulia Neri", "a": "+39 348 000 7788"}]}""")
        val d = DaMandare.daJson(o)
        val p = d.oggi.single()
        assertEquals("attivita:31:2026-10-23", p.proposta)
        assertEquals("3", p.a.idReferente)
        assertEquals("+39 333 000 1122", p.a.numeroVisto)
        assertTrue(p.a.whatsappOk)
        assertEquals("attivita", p.riferimento.tipo)
        assertEquals("31", p.riferimento.id)
        assertFalse(p.pagamento)
        val pag = d.proposti.single()
        assertTrue("il promemoria di pagamento lo è", pag.pagamento)
        assertEquals("i mancano si ricavano dal testo se il server non li manda", listOf("{nome}"), pag.mancano)
        assertEquals("Preparato", d.preparati.single().parolaStato)
        assertEquals("Promemoria appuntamento", d.preparati.single().nome)
        assertEquals("oggi, domani e proposti", 2, d.tutte.size)
    }

    @Test
    fun `comunicazioni e preparaMessaggio come fase7 md 10 2`() {
        val s = Storico7.daJson(JSONObject("""{"ok": true, "pagina": 1, "pagine": 1, "quante": 2, "comunicazioni": [
            {"id": 57, "quando": "2026-10-21T16:42:00", "canale": "portale", "direzione": "uscita", "tipo": "messaggio", "tipoNome": "Messaggio",
             "cliente": "Rossi Impianti Srl", "referente": "Sig. Ferretti", "a": "", "oggetto": "", "testo": "Veniamo giovedì alle 9 con il misuratore.",
             "stato": "mandato", "statoVisto": "Mandato", "riferimento": {"tipo": "ticket", "id": 14, "etichetta": "TK/2026/0014"}, "chi": "Manuel Gasparotto"},
            {"id": 60, "quando": "2026-10-22T09:12:00", "canale": "portale", "direzione": "entrata", "tipo": "messaggio", "stato": "ricevuto"}],
           "accessi": [{"quando": "2026-10-21T17:40:00", "frase": "Sig. Ferretti ha visto il preventivo PR/2026/012 rev. 1"}]}"""))
        assertEquals(2, s.quante)
        assertEquals("TK/2026/0014", s.comunicazioni.first().riferimento.etichetta)
        assertEquals("Manuel Gasparotto", s.comunicazioni.first().chi)
        assertTrue(s.comunicazioni[1].entrata)
        assertEquals("Ricevuto", s.comunicazioni[1].parolaStato)
        assertEquals("Sig. Ferretti ha visto il preventivo PR/2026/012 rev. 1", s.accessi.single().frase)

        val m = MessaggioPronto.daJson(JSONObject("""{"ok": true, "testo": "Buongiorno Mario, presso {luogo}", "oggetto": "Promemoria", "a": {"idReferente": 7, "nome": "Mario Bianchi", "numero": "393400004455"},
            "link": "https://wa.me/393400004455?text=Buongiorno", "mancano": ["{luogo}"], "ultimoMovimento": "2026-10-15"}"""))
        assertEquals(listOf("{luogo}"), m.mancano)
        assertEquals("2026-10-15", m.ultimoMovimento)
        assertEquals("+39 340 000 4455", m.a.numeroVisto)
    }

    @Test
    fun `modelli e notifiche come fase7 md 10 2 e 10 3`() {
        val m = ModelliMessaggi.daJson(JSONObject("""{"ok": true, "modelli": [
            {"chiave": "invito_portale", "nome": "Invito al portale", "canale": "whatsapp", "uso": "portale", "testo": "Buongiorno {nome}", "attivo": true, "sistema": true, "ordine": 7},
            {"chiave": "promemoria_appuntamento", "nome": "Promemoria appuntamento", "canale": "tutti", "uso": "appuntamento", "oggetto": "Promemoria: {giorno}", "testo": "x", "attivo": true, "sistema": true, "ordine": 1}],
           "segnaposti": {"sempre": ["{nome}", "{cliente}"], "appuntamento": ["{giorno}"]}}"""))
        assertEquals("ordinati", "promemoria_appuntamento", m.modelli.first().chiave)
        assertEquals("Tutti e due", m.modelli.first().canaleVisto)
        assertTrue(m.modelli.last().perWhatsapp && !m.modelli.last().perEmail)
        assertEquals(listOf("{nome}", "{cliente}", "{giorno}"), Segnaposti.per("appuntamento", m.segnaposti))

        val n = Notifiche7.daJson(JSONObject("""{"ok": true, "nuove": 1, "notifiche": [{"id": 1, "tipo": "richiesta_portale", "titolo": "Richiesta dal portale: TK/2026/0016",
            "dettaglio": "Rossi Impianti Srl · Urgente", "collegamento": {"pagina": "ticket", "id": 16}, "creata": "2026-10-22T09:12:00", "letta": false}]}"""))
        assertEquals(1, n.nuove)
        assertEquals("ticket", n.notifiche.single().collegamento!!.pagina)
        assertEquals("16", n.notifiche.single().collegamento!!.id)
    }

    @Test
    fun `portale come fase7 md 10 1 e lo stato di 0 5`() {
        val p = Portale7.daJson(JSONObject("""{"ok": true,
           "stato": {"attivo": true, "indirizzo": "https://studiogm-portale.netlify.app", "collegato": "si", "controllatoIl": "2026-10-22T10:00:00", "script": "attivo", "emailRimaste": 71},
           "conteggi": {"daGuardare": 4, "clienti": 3, "referenti": 4, "pubblicati": 23, "accessiOggi": 3},
           "daGuardare": [
            {"id": 41, "tipo": "richiesta", "titolo": "Richiesta urgente: TK/2026/0016", "dettaglio": "Rossi Impianti Srl · Capannone di Thiene · Sig. Ferretti · alle 9:12",
             "quando": "2026-10-22T09:12:00", "collegamento": {"pagina": "ticket", "id": 16}},
            {"id": 42, "tipo": "caricamento", "titolo": "Schema quadro QG2.pdf", "dettaglio": "Rossi Impianti Srl · Sig. Ferretti · 1,2 MB",
             "quando": "2026-10-22T09:20:00", "collegamento": {"pagina": "caricamento", "id": 31}}]}"""))
        assertEquals("Collegato", p.stato.parola)
        assertEquals("studiogm-portale.netlify.app", p.stato.host)
        assertEquals(71, p.stato.emailRimaste)
        assertEquals(4, p.conteggi["daGuardare"])
        assertTrue(p.daGuardare.first().urgente)
        assertEquals("TK/2026/0016", p.daGuardare.first().titoloBreve)
        assertEquals("File dal cliente", p.daGuardare[1].nome)
        assertFalse(p.daGuardare[1].urgente)

        assertEquals("Non collegato", StatoPortale.daJson(JSONObject("""{"attivo": true, "indirizzo": "", "collegato": "non_collegato", "script": "non collegato"}""")).parola)
        assertEquals("Spento", StatoPortale.daJson(JSONObject("""{"attivo": false, "indirizzo": "https://x.netlify.app", "collegato": "si"}""")).parola)
        assertEquals("Non si raggiunge", StatoPortale.daJson(JSONObject("""{"attivo": true, "indirizzo": "https://x.netlify.app", "collegato": "no"}""")).parola)
        assertTrue("senza stato è Non collegato", StatoPortale.daJson(null).nonCollegato)
    }

    @Test
    fun `portaleCliente come fase7 md 10 1, senza IP`() {
        val c = ClientePortale.daJson(JSONObject("""{"ok": true,
           "cliente": {"id": "C002", "nome": "Rossi Impianti Srl", "portale": true, "importi": false,
                       "regole": {"preventivi": true, "contratti": true, "rapportiniFirmati": true, "rapportiniDaFirmare": false, "fatture": false, "richieste": "portale"}},
           "referenti": [
            {"id": 3, "nome": "Sig. Ferretti", "ruolo": "Ufficio tecnico", "email": "f.ferretti@rossi.example", "telefono": "333 000 1122",
             "portale": true, "statoVisto": "Attivo", "permessi": {"preventivi": 2, "rapportini": 2, "fatture": 1, "documenti": 2, "richieste": 2},
             "sedi": null, "avvisiEmail": true, "ultimoAccesso": "2026-10-22T09:58:00", "invitatoIl": "2026-10-14T11:00:00", "pagamenti": false, "whatsappOk": true},
            {"id": 6, "nome": "Giulia Neri", "portale": true, "statoVisto": "Attivo", "permessi": {"preventivi": 1}, "sedi": [7]}],
           "pubblicati": [{"id": 12, "tipo": "preventivo", "titolo": "Preventivo PR/2026/012 rev. 1", "pubblicataIl": "2026-10-15T10:00:00",
                           "origine": "regola", "vistoIl": "2026-10-21T17:40:00", "vistoDa": "Sig. Ferretti", "daFirmare": false}],
           "caricamenti": [{"id": 31, "titolo": "Schema quadro QG2", "nome": "Schema quadro QG2.pdf", "byte": 1258291, "referente": "Sig. Ferretti", "creato": "2026-10-22T09:20:00", "stato": "da_guardare"}],
           "accessi": [{"quando": "2026-10-22T09:58:00", "referente": "Sig. Ferretti", "frase": "Entrato", "dispositivo": "Chrome · Android", "ip": ""}]}"""))
        assertTrue(c.portale)
        assertEquals("portale", c.regole.richieste)
        assertFalse(c.regole.rapportiniDaFirmare)
        val f = c.referenti.first()
        assertNull("sedi null = tutte", f.sedi)
        assertEquals(1, f.livello("fatture"))
        assertTrue(f.whatsappOk)
        assertEquals(listOf("7"), c.referenti[1].sedi)
        assertEquals(0, c.referenti[1].livello("rapportini"))
        assertEquals("Sig. Ferretti", c.pubblicati.single().vistoDa)
        val car = c.caricamenti.single()
        assertEquals("pdf", car.estensione)
        assertFalse("un PDF chiede conferma prima di aprirsi", car.immagine)
        assertEquals("Da guardare", car.parolaStato)
        assertTrue(c.accessi.single().entrata)
        assertEquals("Chrome · Android", c.accessi.single().dispositivo)
        assertEquals("le regole tornano uguali", c.regole, RegolePortale.daJson(c.regole.aJson()))
    }

    @Test
    fun `i permessi di base all'invito, fatture a 0 e a 1 per un privato`() {
        assertEquals(mapOf("preventivi" to 2, "rapportini" to 2, "fatture" to 0, "documenti" to 2, "richieste" to 2), Parole7.permessiDiBase(false))
        assertEquals(1, Parole7.permessiDiBase(true)["fatture"])
    }

    @Test
    fun `io, anagrafiche e dashboard coi campi della fase 7`() {
        val i = Interfaccia.daJson(JSONObject("""{"portaleCollegato": true, "portaleAttivo": true, "whatsappApp": "business", "notificheNuove": 3, "whatsappTestoMax": 1000}"""))
        assertTrue(i.portaleCollegato && i.portaleAttivo)
        assertEquals("business", i.whatsappApp)
        assertEquals(3, i.notificheNuove)
        assertEquals("ritorna uguale dalla copia", i, Interfaccia.daJson(i.aJson()))
        assertEquals("chiedi di base", "chiedi", Interfaccia.daJson(JSONObject()).whatsappApp)

        val r = Referente.daJson(JSONObject("""{"id": 3, "soggettoId": "C002", "nome": "Sig. Ferretti", "portale": true, "statoPortale": "Attivo", "pagamenti": false, "whatsapp": "", "whatsappOk": true}"""))
        assertTrue(r.portale && r.whatsappOk)
        assertEquals("Attivo", r.statoPortale)
        assertEquals(r, Referente.daJson(r.aJson()))
        val cl = Cliente.daJson(JSONObject("""{"id": "C002", "nome": "Rossi Impianti Srl", "portale": true}"""))
        assertTrue(cl.portale)
        assertTrue(Cliente.daJson(cl.aJson()).portale)

        val d = Dashboard.daJson(JSONObject("""{"numeri": {"portale": {"daGuardare": 4, "richiesteNuove": 1, "accettati": 1, "firmati": 1, "caricamenti": 2, "messaggi": 1, "clienti": 3, "referenti": 4, "collegato": "si"},
            "comunicazioni": {"daMandareOggi": 2, "preparati": 1, "proposti": 2}}}"""))
        assertEquals(4, d.fase7.portaleDaGuardare)
        assertEquals("da mandare oggi più preparati", 3, d.fase7.numerinoComunicazioni)
        val coll = Dashboard.daJson(JSONObject("""{"numeri": {"comunicazioni": {"daMandareOggi": 1, "preparati": 0, "proposti": 0}}}"""))
        assertNull("il collaboratore non vede il portale", coll.fase7.portaleDaGuardare)
        assertEquals(1, coll.fase7.daMandareOggi)
    }

    @Test
    fun `il destinatario dalle anagrafiche, numero WhatsApp, se no telefono, se no quello del cliente`() {
        val cl = Cliente("C002", "Rossi Impianti Srl", telefono = "0424 555 010")
        assertEquals("393330009999", Destinatario.da(Referente("3", "C002", "Sig. Ferretti", telefono = "333 000 1122", whatsapp = "333 000 9999"), cl).numero)
        assertEquals("393330001122", Destinatario.da(Referente("3", "C002", "Sig. Ferretti", telefono = "333 000 1122"), cl).numero)
        val fisso = Destinatario.da(Referente("4", "C002", "Anna Rossi", telefono = "chiamare il centralino"), cl)
        assertEquals("390424555010", fisso.numero)
        assertTrue(fisso.fisso)
    }

    @Test
    fun `i permessi iniziali dei ruoli per comunicazioni e portale come fase7 md 11 2`() {
        fun l(ruolo: String, m: String) = Permessi.iniziali(ruolo).livello(m)
        assertEquals(2, l(Ruoli.TITOLARE, Moduli.COMUNICAZIONI)); assertEquals(2, l(Ruoli.TITOLARE, Moduli.PORTALE))
        assertEquals(2, l(Ruoli.AMMINISTRAZIONE, Moduli.COMUNICAZIONI)); assertEquals(2, l(Ruoli.AMMINISTRAZIONE, Moduli.PORTALE))
        assertEquals(2, l(Ruoli.COLLABORATORE, Moduli.COMUNICAZIONI)); assertEquals(0, l(Ruoli.COLLABORATORE, Moduli.PORTALE))
        assertEquals(1, l(Ruoli.LETTURA, Moduli.COMUNICAZIONI)); assertEquals(1, l(Ruoli.LETTURA, Moduli.PORTALE))
        assertEquals(0, l(Ruoli.ESTERNO, Moduli.COMUNICAZIONI)); assertEquals(0, l(Ruoli.ESTERNO, Moduli.PORTALE))
        val ordine = Moduli.FUNZIONANTI
        assertTrue("dopo Mezzi, prima di Collaboratori", ordine.indexOf(Moduli.MEZZI) < ordine.indexOf(Moduli.COMUNICAZIONI) &&
            ordine.indexOf(Moduli.COMUNICAZIONI) < ordine.indexOf(Moduli.PORTALE) && ordine.indexOf(Moduli.PORTALE) < ordine.indexOf(Moduli.COLLABORATORI))
    }
}
