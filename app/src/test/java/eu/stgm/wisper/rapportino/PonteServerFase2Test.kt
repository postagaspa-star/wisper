package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.util.Base64

/**
 * Le azioni della fase 2 (architettura.md §13) contro un server HTTP finto su una
 * porta di questo computer (MockWebServer): cosa parte, con quali campi, e come
 * si leggono le risposte, compresi i "serve conferma".
 */
class PonteServerFase2Test {
    private lateinit var server: MockWebServer
    private lateinit var ponte: PonteServer

    @Before
    fun accendi() {
        server = MockWebServer()
        server.start()
        ponte = PonteServer({ server.url("/").toString() }, { "token-di-prova" }, { mapOf("disp" to "prova", "app" to "telefono prove") })
    }

    @After
    fun spegni() = server.shutdown()

    private fun risponde(json: String) = server.enqueue(MockResponse().setBody(json).setHeader("Content-Type", "application/json"))
    private fun corpo(r: RecordedRequest): JSONObject = JSONObject(r.body.readUtf8())

    private val preventivo = """{"id":4,"numero":"PR/2026/012","revisione":1,"idCliente":"C002","oggetto":"Capannone","stato":"BOZZA","statoVisto":"BOZZA",
        "data":"2026-10-15","scadenza":"2026-10-28","eppiPercentuale":5,"ivaPercentuale":22,"modificabile":true,
        "sezioni":[{"id":7,"titolo":"Progettazione","ordine":1,"subtotale":350,"voci":[{"id":11,"idSezione":7,"descrizione":"Sopralluogo","modo":"corpo",
        "quantita":1,"prezzo":350,"scontoPercentuale":0,"facoltativa":false,"alternativa":"","scelta":false,"ordine":1,"importo":350,"conta":true}]}],
        "scadenzePagamento":[],"conti":{"sommaVoci":350,"scontoDaPercentuale":0,"scontoEuro":0,"imponibile":350,"contributo":17.5,"baseIva":367.5,"iva":80.85,"totale":448.35},
        "revisioni":[],"mancano":[]}"""

    @Test
    fun `listino, voce nuova e voce tolta`() = runBlocking {
        risponde("""{"ok":true,"listino":[{"id":1,"codice":"SOP","nome":"Sopralluogo e rilievo","modo":"corpo","unita":"","prezzo":350,"attivo":true,"ordine":1}]}""")
        val l = ponte.listino()
        val r1 = server.takeRequest()
        assertEquals("GET", r1.method)
        assertEquals("listino", r1.requestUrl!!.queryParameter("azione"))
        assertEquals("Bearer token-di-prova", r1.getHeader("Authorization"))
        assertEquals(350.0, l.single().prezzo!!, 0.0)

        risponde("""{"ok":true,"voce":{"id":9,"nome":"Collaudo","modo":"ore","unita":"ore","prezzo":60}}""")
        val v = ponte.salvaVoceListino(VoceListino("", "Collaudo", modo = ModoVoce.ORE, prezzo = 60.0), costi = false)
        val o = corpo(server.takeRequest())
        assertEquals("salvaVoceListino", o.getString("azione"))
        assertFalse(o.getJSONObject("voce").has("prezzo"))   // senza i soldi il prezzo non parte
        assertFalse(o.getJSONObject("voce").has("id"))
        assertEquals("9", v.id)

        risponde("""{"ok":true,"voce":{"id":9,"nome":"Collaudo","attivo":false}}""")
        ponte.archiviaVoceListino("9")
        val a = corpo(server.takeRequest())
        assertEquals(9, a.getInt("id"))
        assertTrue(a.getBoolean("archiviata"))
    }

    @Test
    fun `l'elenco chiede anche i modelli, la pagina ha conti e voci`() = runBlocking {
        risponde("""{"ok":true,"oggi":"2026-10-22","preventivi":[{"id":4,"numero":"PR/2026/012","revisione":1,"etichetta":"PR/2026/012 rev. 1","stato":"INVIATO","statoVisto":"SCADUTO","totale":4291.35},
            {"id":9,"numero":"","etichetta":"Modello","modello":true,"stato":"BOZZA","statoVisto":"BOZZA","oggetto":"Verifica"}]}""")
        val l = ponte.preventivi(modelli = true)
        assertEquals("1", server.takeRequest().requestUrl!!.queryParameter("modelli"))
        assertEquals(StatoPreventivo.SCADUTO, l[0].statoVisto())
        assertTrue(l[1].modello)

        risponde("""{"ok":true,"preventivo":$preventivo}""")
        val p = ponte.preventivo("4")
        assertEquals("4", server.takeRequest().requestUrl!!.queryParameter("id"))
        assertEquals(448.35, p.conto().totale, 0.0)
        assertEquals("11", p.voci.single().id)
        assertTrue(p.modificabile!!)
    }

    @Test
    fun `salvaPreventivo manda il preventivo intero, la risposta torna col numero`() = runBlocking {
        risponde("""{"ok":true,"preventivo":$preventivo}""")
        val p = ponte.salvaPreventivo(
            Preventivo(idCliente = "C002", oggetto = "Capannone", sezioni = listOf(SezionePreventivo(PonteServer.NUOVO + "1", "Progettazione", listOf(VocePreventivo(PonteServer.NUOVO + "2", "Sopralluogo", prezzo = 350.0, idListino = "1"))))),
            costi = true,
        )
        val o = corpo(server.takeRequest())
        assertEquals("salvaPreventivo", o.getString("azione"))
        val x = o.getJSONObject("preventivo")
        assertEquals("C002", x.getString("idCliente"))
        assertFalse(x.has("id"))
        val voce = x.getJSONArray("sezioni").getJSONObject(0).getJSONArray("voci").getJSONObject(0)
        assertEquals(1, voce.getInt("idListino"))
        assertEquals(350.0, voce.getDouble("prezzo"), 0.0)
        assertEquals("PR/2026/012", p.numero)
    }

    @Test
    fun `inviare con qualcosa che manca chiede conferma, e con conferma parte`() = runBlocking {
        risponde("""{"ok":false,"errore":"Prima di inviarlo manca: i prezzi, il grado di complessità","mancano":[{"campo":"prezzi","testo":"1 voce è senza prezzo"},
            {"campo":"complessita","testo":"Il grado di complessità"}],"serveConferma":true}""")
        val pdf = "%PDF-1.4".toByteArray()
        val e = runCatching { ponte.inviaPreventivo("4", "rossi@esempio.it", "", "Preventivo", "Buongiorno", listOf(Allegato("p.pdf", "application/pdf", pdf)), aMe = false) }.exceptionOrNull()
        assertTrue(e is PonteServer.DaConfermare)
        assertEquals(2, (e as PonteServer.DaConfermare).risposta.getJSONArray("mancano").length())
        val prima = corpo(server.takeRequest())
        assertFalse(prima.has("conferma"))
        assertEquals("inviaPreventivo", prima.getString("azione"))
        assertEquals("p.pdf", prima.getJSONArray("allegati").getJSONObject(0).getString("nome"))
        assertEquals("%PDF-1.4", String(Base64.getDecoder().decode(prima.getJSONArray("allegati").getJSONObject(0).getString("base64"))))

        risponde("""{"ok":true,"preventivo":${preventivo.replace("\"stato\":\"BOZZA\"", "\"stato\":\"INVIATO\"")}}""")
        val p = ponte.inviaPreventivo("4", "rossi@esempio.it", "", "Preventivo", "Buongiorno", emptyList(), aMe = false, conferma = true)
        assertTrue(corpo(server.takeRequest()).getBoolean("conferma"))
        assertEquals(StatoPreventivo.INVIATO, p.stato)

        risponde("""{"ok":true,"preventivo":$preventivo}""")
        ponte.segnaInviato("4", conferma = true)
        val s = corpo(server.takeRequest())
        assertEquals("segnaInviato", s.getString("azione"))
        assertTrue(s.getBoolean("conferma"))
    }

    @Test
    fun `accettare con la firma, rifiutare, riaprire, revisione, duplicare`() = runBlocking {
        risponde("""{"ok":true,"preventivo":$preventivo}""")
        ponte.accettaPreventivo("4", "firma", " Andrea Rossi ", mapOf("8" to true, "9" to false), Allegato("firma.png", "image/png", byteArrayOf(1, 2)), idFile = "abc123")
        val a = corpo(server.takeRequest())
        assertEquals("accettaPreventivo", a.getString("azione"))
        assertEquals(4, a.getInt("id"))
        assertEquals("firma", a.getString("modo"))
        assertEquals("Andrea Rossi", a.getString("nome"))
        assertTrue(a.getJSONObject("scelte").getBoolean("8"))
        assertFalse(a.getJSONObject("scelte").getBoolean("9"))
        assertEquals("image/png", a.getJSONObject("firma").getString("mime"))
        assertEquals("abc123", a.getJSONObject("firma").getString("idFile"))

        listOf("rifiutaPreventivo", "riapriPreventivo", "nuovaRevisione", "duplicaPreventivo").forEach { risponde("""{"ok":true,"preventivo":$preventivo}""") }
        ponte.rifiutaPreventivo("4", " troppo caro ")
        assertEquals("troppo caro", corpo(server.takeRequest()).getString("motivo"))
        ponte.riapriPreventivo("4")
        assertEquals("riapriPreventivo", corpo(server.takeRequest()).getString("azione"))
        ponte.nuovaRevisione("4")
        assertEquals("nuovaRevisione", corpo(server.takeRequest()).getString("azione"))
        ponte.duplicaPreventivo("4", comeModello = true)
        assertTrue(corpo(server.takeRequest()).getBoolean("comeModello"))
    }

    @Test
    fun `la commessa dal preventivo torna con le sue prestazioni`() = runBlocking {
        risponde("""{"ok":true,"commessa":{"id":"26ST003","idCliente":"C002","descrizione":"Capannone","stato":"APERTA","budgetOre":16,"prezzoOrario":45,"importoContratto":4040,"sedeId":3,"responsabileId":1,"persone":[]},
            "prestazioni":[{"id":7,"idCommessa":"26ST003","nome":"Sopralluogo e rilievo","descrizione":"Progettazione","valore":350,"avanzamento":0,"stato":"da_fare","ordine":1}],
            "preventivo":$preventivo}""")
        val n = ponte.creaCommessaDaPreventivo("4")
        assertEquals("creaCommessaDaPreventivo", corpo(server.takeRequest()).getString("azione"))
        assertEquals("26ST003", n.commessa.id)
        assertEquals(4040.0, n.commessa.importoContratto!!, 0.0)
        assertEquals("Sopralluogo e rilievo", n.prestazioni.single().nome)
        assertNotNull(n.preventivo)
    }

    @Test
    fun `le attività senza date per l'elenco e con le date per il calendario`() = runBlocking {
        risponde("""{"ok":true,"attivita":[{"id":4,"titolo":"Polizza","tipo":"attivita","scadenza":"2026-10-28","assegnataA":1}]}""")
        risponde("""{"ok":true,"attivita":[]}""")
        assertEquals(1, ponte.attivita(null, null).size)
        val senza = server.takeRequest().requestUrl!!
        assertEquals("attivita", senza.queryParameter("azione"))
        assertFalse(senza.queryParameterNames.contains("da"))
        ponte.attivita(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31))
        val con = server.takeRequest().requestUrl!!
        assertEquals("2026-10-01", con.queryParameter("da"))
        assertEquals("2026-10-31", con.queryParameter("a"))
    }

    @Test
    fun `salvare un appuntamento che si accavalla chiede conferma`() = runBlocking {
        risponde("""{"ok":false,"errore":"Si sovrappone a: Riunione di cantiere Batokyo (8:30-10:00)","sovrapposte":[{"id":8,"titolo":"Riunione di cantiere Batokyo"}],"serveConferma":true}""")
        val a = Attivita("", "Collaudo", tipo = TipoAttivita.APPUNTAMENTO, inizio = LocalDate.of(2026, 10, 24).atTime(9, 0), fine = LocalDate.of(2026, 10, 24).atTime(11, 0), assegnataA = "1")
        val e = runCatching { ponte.salvaAttivita(a) }.exceptionOrNull()
        assertTrue(e is PonteServer.DaConfermare)
        assertEquals("Si sovrappone a: Riunione di cantiere Batokyo (8:30-10:00)", e!!.message)
        val prima = corpo(server.takeRequest())
        assertEquals("2026-10-24T09:00:00", prima.getJSONObject("attivita").getString("inizio"))
        assertFalse(prima.getJSONObject("attivita").has("id"))

        risponde("""{"ok":true,"attivita":{"id":12,"titolo":"Collaudo","tipo":"appuntamento","inizio":"2026-10-24T09:00:00","fine":"2026-10-24T11:00:00","assegnataA":1}}""")
        val s = ponte.salvaAttivita(a, perRicorrenza = "questa", conRicorrenza = false, conferma = true)
        val dopo = corpo(server.takeRequest())
        assertTrue(dopo.getBoolean("conferma"))
        assertEquals("questa", dopo.getString("perRicorrenza"))
        assertFalse(dopo.getJSONObject("attivita").has("ricorrenza"))
        assertEquals("12", s.id)
    }

    @Test
    fun `fatta, annullata, checklist e allegati`() = runBlocking {
        val att = """{"ok":true,"attivita":{"id":4,"titolo":"Polizza","stato":"fatta","checklist":[{"id":1,"testo":"Chiedere","fatta":true}]}}"""
        risponde(att)
        assertTrue(ponte.faiAttivita("4", true).fatta)
        val f = corpo(server.takeRequest())
        assertEquals("faiAttivita", f.getString("azione"))
        assertTrue(f.getBoolean("fatta"))

        risponde("""{"ok":true,"tolte":3}""")
        ponte.togliAttivita("4", "future")
        assertEquals("future", corpo(server.takeRequest()).getString("perRicorrenza"))

        risponde(att)
        assertTrue(ponte.spuntaChecklist("1", true)!!.checklist.single().fatta)
        val c = corpo(server.takeRequest())
        assertEquals("spuntaChecklist", c.getString("azione"))
        assertEquals(1, c.getInt("id"))

        risponde("""{"ok":true,"file":{"id":"D04yLN6e265kAflzujHc6Pa8OL2Q","url":"/file/D04yLN6e265kAflzujHc6Pa8OL2Q","nome":"foto.png"}}""")
        ponte.caricaFile("attivita", byteArrayOf(9), "image/png", nome = "foto.png", idAttivita = "4")
        val k = corpo(server.takeRequest())
        assertEquals("attivita", k.getString("tipo"))
        assertEquals(4, k.getInt("idAttivita"))

        risponde(att)
        ponte.togliAllegato("D04yLN6e265kAflzujHc6Pa8OL2Q")
        assertEquals("togliAllegato", corpo(server.takeRequest()).getString("azione"))
    }
}
