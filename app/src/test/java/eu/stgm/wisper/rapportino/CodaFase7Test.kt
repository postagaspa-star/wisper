package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * La fase 7 senza rete (fase7.md §3.20): quello che va nella coda col suo idLocale, come si
 * vede subito (InCoda7), come parte senza doppioni (InvioFase7), la pillola grigia.
 */
class CodaFase7Test {
    @get:Rule val cartella = TemporaryFolder()

    /** La coda vera su un file temporaneo, vista dal servizio come la vede Archivio. */
    private inner class CodaSuFile {
        val coda = CodaInvii(cartella.newFile().apply { writeText("[]") })
        val perServizio = object : CodaFase7 {
            override fun azione(chiave: String, corpo: JSONObject) { coda.azione7(chiave, corpo) }
            override fun presente(chiave: String) = coda.tutte().any { it.tipo == CodaInvii.Tipo.AZIONE7 && it.idLocale == chiave && !it.rifiutata }
            override fun togli(chiave: String): Boolean {
                val l = coda.tutte().filter { it.tipo == CodaInvii.Tipo.AZIONE7 && it.idLocale == chiave }
                l.forEach { coda.togli(it.idOp) }
                return l.isNotEmpty()
            }
        }
    }

    /** Un server finto che ricorda cosa riceve e risponde come §10.2. */
    private class Registra : TrasportoFase5 {
        val ricevute = mutableListOf<JSONObject>()
        var rispostaGia: String? = null
        override suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>>) = JSONObject().put("ok", true)
        override suspend fun scriviAzione(corpo: JSONObject): JSONObject {
            ricevute += JSONObject(corpo.toString())
            rispostaGia?.let { throw PonteServer.Rifiutato(it) }
            return when (corpo.optString("azione")) {
                "salvaMessaggio" -> JSONObject().put("ok", true).put("comunicazione", JSONObject().put("id", 70).put("idLocale", corpo.getJSONObject("messaggio").optString("idLocale")))
                else -> JSONObject().put("ok", true)
            }
        }
        override suspend fun file(id: String): Pair<ByteArray, String> = ByteArray(0) to ""
        override suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray) = JSONObject()
    }

    private val esecutore = object : EsecutoreFase4 {
        override suspend fun <T> esegui(lavoro: suspend () -> T): Result<T> = runCatching { lavoro() }
    }

    private fun servizio(c: CodaSuFile, t: TrasportoFase5 = Registra()) = ServizioFase7(t, Scaffale(null, "f7-"), esecutore, c.perServizio)

    private fun messaggio(proposta: String = "attivita:31:2026-10-23") = JSONObject().put("canale", "whatsapp").put("tipo", "promemoria_appuntamento").put("modello", "promemoria_appuntamento")
        .put("proposta", proposta).put("idReferente", 3).put("testo", "Buongiorno Sig. Ferretti").put("stato", "preparato").put("a", "+39 333 000 1122")
        .put("_referente", "Sig. Ferretti").put("_cliente", "Rossi Impianti Srl")

    @Test
    fun `il messaggio preparato va in coda col suo idLocale, e segnato mandato prima di partire parte una volta sola`() {
        val c = CodaSuFile()
        val s = servizio(c)
        val id = s.preparaWhatsapp(messaggio())
        assertTrue(id.startsWith("M-"))
        val op = c.coda.tutte().single()
        assertEquals(CodaInvii.Tipo.AZIONE7, op.tipo)
        assertEquals("msg:$id", op.idLocale)
        assertTrue(op.fase7)
        assertEquals("preparato", op.corpoJson().getJSONObject("messaggio").getString("stato"))

        s.segnaMandato(Comunicazione(idLocale = id, stato = "preparato"))
        val dopo = c.coda.tutte()
        assertEquals("niente doppioni: la stessa operazione, col corpo nuovo", 1, dopo.size)
        assertEquals("mandato", dopo.single().corpoJson().getJSONObject("messaggio").getString("stato"))
        assertEquals(id, dopo.single().corpoJson().getJSONObject("messaggio").getString("idLocale"))
    }

    @Test
    fun `segnato mandato dopo che è partito, segnaMandato con l id che la coda ha imparato`() = runBlocking {
        val c = CodaSuFile()
        val server = Registra()
        val s = servizio(c, server)
        val invio = InvioFase7(server, Scaffale(null, "f7id-"))
        val id = s.preparaWhatsapp(messaggio())
        invio.esegui(c.coda.tutte().single())
        c.coda.togli(c.coda.tutte().single().idOp)
        val partito = server.ricevute.single().getJSONObject("messaggio")
        assertFalse("i campi col trattino basso restano sul telefono", partito.has("_referente") || partito.has("_cliente"))
        assertEquals(id, partito.getString("idLocale"))

        s.segnaMandato(Comunicazione(idLocale = id, stato = "preparato"))
        val op = c.coda.tutte().single()
        assertEquals("segnaMandato", op.corpoJson().getString("azione"))
        invio.esegui(op)
        val segna = server.ricevute.last()
        assertEquals("segnaMandato", segna.getString("azione"))
        assertEquals(70, segna.getInt("id"))
        assertTrue(segna.getBoolean("mandato"))
        assertFalse(segna.has("idLocaleMessaggio"))
    }

    @Test
    fun `Pubblica anche quelli di prima manda prima true, la pubblicazione normale no`() {
        val c = CodaSuFile()
        val s = servizio(c)
        s.pubblica("rapportino", "RAP/2026/0002", conferma = true, prima = true)
        s.pubblica("preventivo", "7")
        val corpi = c.coda.tutte().map { it.corpoJson() }
        assertTrue(corpi.first { it.testo("tipo") == "rapportino" }.getBoolean("prima"))
        assertFalse(corpi.first { it.testo("tipo") == "preventivo" }.has("prima"))
    }

    @Test
    fun `un già fatto ripetuto non è un errore, il resto sì`() = runBlocking {
        val server = Registra().apply { rispostaGia = "È già nel portale" }
        val invio = InvioFase7(server, Scaffale(null, "f7id-"))
        val c = CodaSuFile()
        servizio(c, server).pubblica("preventivo", "12")
        invio.esegui(c.coda.tutte().single())
        server.rispostaGia = "Il preventivo PR/2026/013 è in bozza: si pubblica quando lo mandi"
        try {
            invio.esegui(c.coda.tutte().single())
            throw AssertionError("doveva dire di no")
        } catch (e: PonteServer.Rifiutato) {
            assertTrue(e.message!!.contains("bozza"))
        }
    }

    @Test
    fun `Non mandare e il suo Annulla, Togli dal portale e il suo Annulla prima che partano`() {
        val c = CodaSuFile()
        val s = servizio(c)
        s.nonMandare("fattura:43:1", "pagherà a fine mese")
        assertEquals("fattura:43:1", InCoda7.proposteUsate(c.coda.tutte()).single())
        s.annullaNonMandare("fattura:43:1")
        assertTrue("l'Annulla prima di partire toglie dalla coda", c.coda.tutte().isEmpty())

        s.togliDalPortale("12")
        assertEquals(false, InCoda7.portaleInCoda("preventivo", "7", "12", c.coda.tutte()))
        s.togliDalPortale("12", annulla = true)
        assertTrue(c.coda.tutte().isEmpty())
    }

    @Test
    fun `quello in coda si vede subito in Da mandare, storico, da guardare, file, pubblicati, risposte`() {
        val c = CodaSuFile()
        val s = servizio(c)
        val proposte = DaMandare(
            oggi = listOf(Proposta("attivita:31:2026-10-23", testo = "a"), Proposta("attivita:3:2026-10-23", testo = "b")),
            proposti = listOf(Proposta("fattura:43:1", modello = "promemoria_pagamento")),
            preparati = listOf(Comunicazione(id = "55", canale = "whatsapp", stato = "preparato", quando = "2026-10-20T07:55:00")),
        )
        val id = s.preparaWhatsapp(messaggio("attivita:31:2026-10-23"))
        s.nonMandare("fattura:43:1")
        s.segnaMandato(Comunicazione(id = "55", stato = "preparato"))
        val d = InCoda7.applicaDaMandare(proposte, c.coda.tutte())
        assertEquals("la proposta usata sparisce", listOf("attivita:3:2026-10-23"), d.oggi.map { it.proposta })
        assertTrue("quella scartata anche", d.proposti.isEmpty())
        assertEquals("il preparato qui c'è, quello segnato mandato no", listOf(id), d.preparati.map { it.idLocale })
        assertEquals("Sig. Ferretti", d.preparati.single().referente)
        assertTrue(d.preparati.single().inCoda)

        val storico = InCoda7.applicaStorico(listOf(Comunicazione(id = "55", stato = "preparato", canale = "whatsapp")), c.coda.tutte())
        assertEquals(id, storico.first().idLocale)
        assertEquals("Mandato", storico[1].parolaStato)
        assertTrue("filtrato per email, il WhatsApp in coda non c'è", InCoda7.applicaStorico(emptyList(), c.coda.tutte(), "email").isEmpty())

        s.segnaVisto("41")
        s.accettaFile("31", JSONObject().put("idCategoria", 2))
        s.rifiutaFile("32", "Non è il nostro impianto")
        s.rispondi("14", "Veniamo giovedì alle 9")
        val dg = InCoda7.applicaDaGuardare(listOf(
            VoceDaGuardare("41", "richiesta", "Richiesta urgente: TK/2026/0016"),
            VoceDaGuardare("42", "caricamento", "Schema quadro QG2.pdf", collegamento = Collegamento("caricamento", "31")),
            VoceDaGuardare("43", "messaggio", "Messaggio di Sig. Ferretti su TK/2026/0014", collegamento = Collegamento("ticket", "14")),
            VoceDaGuardare("45", "firmato", "RAP/2026/0153 firmato nel portale"),
        ), c.coda.tutte())
        assertEquals("visto, file deciso e messaggio risposto escono; il firmato resta", listOf("45"), dg.map { it.id })
        val cars = InCoda7.applicaCaricamenti(listOf(Caricamento("31"), Caricamento("32"), Caricamento("33")), c.coda.tutte())
        assertEquals(listOf("accettato", "rifiutato", "da_guardare"), cars.map { it.stato })
        assertEquals("Non è il nostro impianto", cars[1].motivo)
        assertEquals("Veniamo giovedì alle 9", InCoda7.risposte("14", c.coda.tutte()).single().testo)
        assertTrue(InCoda7.risposte("14", c.coda.tutte()).single().inCoda)

        s.pubblica("documento", "9")
        assertEquals(true, InCoda7.portaleInCoda("documento", "9", "", c.coda.tutte()))
        assertNull(InCoda7.portaleInCoda("documento", "10", "", c.coda.tutte()))
        s.togliDalPortale("15")
        assertEquals(listOf("12"), InCoda7.applicaPubblicati(listOf(Pubblicazione("12"), Pubblicazione("15")), c.coda.tutte()).map { it.id })
        s.mostraNelPortale("16", false)
        assertEquals(false, InCoda7.visibileInCoda("16", c.coda.tutte()))
    }

    @Test
    fun `la pillola grigia dice 2 messaggi e 1 risposta partono appena c è rete`() {
        val c = CodaSuFile()
        val s = servizio(c)
        s.preparaWhatsapp(messaggio())
        s.salvaMessaggio(JSONObject().put("canale", "telefonata").put("testo", "Ha chiamato per il collaudo").put("stato", "mandato"))
        s.rispondi("14", "Veniamo giovedì")
        assertEquals("2 messaggi e 1 risposta partono appena c'è rete", TestiCoda.inAttesa(c.coda.tutte()))
        assertEquals("Il server non ha accettato un'azione di comunicazioni o portale", TestiCoda.rifiutata(CodaInvii.Tipo.AZIONE7))
        val sola = CodaSuFile()
        servizio(sola).pubblica("preventivo", "12")
        assertEquals("1 cambio del portale parte appena c'è rete", TestiCoda.inAttesa(sola.coda.tutte()))
        assertFalse("non è un rapportino", sola.coda.tutte().single().delRapportino)
    }
}
