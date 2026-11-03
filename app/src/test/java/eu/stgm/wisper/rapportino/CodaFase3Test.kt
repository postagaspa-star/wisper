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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.LocalDate

/**
 * Senza rete non si perde niente (fase3.md, consegna 5): le ore e le spese,
 * scontrino compreso, vanno nella coda su disco come i rapportini, sopravvivono
 * al riavvio e partono dopo, nell'ordine; lo scontrino impara l'id della sua
 * spesa; una richiesta forse arrivata non diventa un doppione. Il server è finto
 * (MockWebServer): qui conta cosa parte e quando.
 */
class CodaFase3Test {
    @get:Rule
    val cartella = TemporaryFolder()

    private lateinit var server: MockWebServer
    private lateinit var ponte: PonteServer
    private val file: File get() = File(cartella.root, "coda-invii.json")

    @Before
    fun accendi() {
        server = MockWebServer()
        server.start()
        ponte = PonteServer({ server.url("/").toString() }, { "token-di-prova" }, { mapOf("disp" to "prova") })
    }

    @After
    fun spegni() = server.shutdown()

    private fun risponde(json: String) = server.enqueue(MockResponse().setBody(json).setHeader("Content-Type", "application/json"))
    private fun corpo(r: RecordedRequest): JSONObject = JSONObject(r.body.readUtf8())
    private fun azione(r: RecordedRequest): String = if (r.method == "GET") r.requestUrl!!.queryParameter("azione").orEmpty() else corpo(r).optString("azione")

    private val giorno = LocalDate.of(2026, 10, 21)
    private val spesa = Spesa(idLocale = "", data = giorno, importo = 8.4, categoria = "pedaggio", descrizione = "Pedaggio A4", idCommessa = "26ST001", destinazione = Destinazione.CLIENTE, pagataDaMe = true)
    private fun spesaDelServer(id: Int, creato: String = "2026-10-21T09:00:00") =
        """{"id": $id, "idUtente": 3, "data": "2026-10-21", "importo": 8.4, "categoria": "pedaggio", "descrizione": "Pedaggio A4", "idCommessa": "26ST001",
           "destinazione": "cliente", "pagataDaMe": true, "stato": "da_approvare", "foto": [], "dalRapportino": false, "creato": "$creato"}"""

    @Test
    fun `ore e spese con lo scontrino sopravvivono a un riavvio`() {
        val foto = cartella.newFile("scontrino.jpg").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        val coda = CodaInvii(file)
        coda.ore("O-1", RigaOre(data = giorno, ore = 2.5, descrizione = "Revisione tavole").perSalvare())
        coda.spesa("S-1", spesa.perSalvare())
        coda.fotoSpesa("S-1", "idfile123", foto.path)
        val riletta = CodaInvii(file).tutte()   // un'altra istanza: come dopo un riavvio
        assertEquals(listOf(CodaInvii.Tipo.ORE, CodaInvii.Tipo.SPESA, CodaInvii.Tipo.FOTO_SPESA), riletta.map { it.tipo })
        assertTrue(riletta.all { it.fase3 })
        assertEquals(2.5, riletta[0].corpoJson().getDouble("ore"), 0.0)
        assertEquals("Pedaggio A4", riletta[1].corpoJson().getString("descrizione"))
        assertEquals(foto.path, riletta[2].percorso)
        assertEquals("idfile123", riletta[2].idFile)
    }

    @Test
    fun `una riga cambiata prima di partire occupa un posto solo, con l'ultima versione`() {
        val coda = CodaInvii(file)
        coda.ore("O-1", RigaOre(data = giorno, ore = 2.0).perSalvare())
        coda.spesa("S-1", spesa.perSalvare())
        coda.ore("O-1", RigaOre(data = giorno, ore = 3.5).perSalvare())
        val tutte = coda.tutte()
        assertEquals(2, tutte.size)
        assertEquals(CodaInvii.Tipo.ORE, tutte[0].tipo)
        assertEquals(3.5, tutte[0].corpoJson().getDouble("ore"), 0.0)
    }

    @Test
    fun `completa toglie l'operazione e insegna l'id allo scontrino, ma tiene una modifica arrivata intanto`() {
        val coda = CodaInvii(file)
        val s = coda.spesa("S-1", spesa.perSalvare())
        coda.fotoSpesa("S-1", "f1", "/x.jpg")
        coda.completa(s.idOp, s.corpo, "S-1", "13")
        val dopo = coda.tutte()
        assertEquals(1, dopo.size)
        assertEquals(CodaInvii.Tipo.FOTO_SPESA, dopo[0].tipo)
        assertEquals("13", dopo[0].idRemoto)

        // Mentre partiva, la spesa è stata cambiata: resta, e ripartirà come modifica con l'id.
        val coda2 = CodaInvii(File(cartella.root, "altra.json"))
        val prima = coda2.spesa("S-2", spesa.perSalvare())
        coda2.spesa("S-2", spesa.copy(importo = 9.9).perSalvare())
        coda2.completa(prima.idOp, prima.corpo, "S-2", "14")
        val resta = coda2.tutte().single()
        assertEquals("14", resta.idRemoto)
        assertEquals(9.9, resta.corpoJson().getDouble("importo"), 0.0)
    }

    @Test
    fun `la spesa parte prima del suo scontrino, che usa l'id appena dato dal server`() = runBlocking {
        val foto = cartella.newFile("s.jpg").apply { writeBytes(byteArrayOf(9, 9, 9)) }
        val coda = CodaInvii(file)
        coda.spesa("S-1", spesa.perSalvare())
        coda.fotoSpesa("S-1", "idfisso", foto.path)
        val invio = InvioFase3(ponte, coda, cartella.root)
        risponde("""{"ok": true, "spesa": ${spesaDelServer(13)}}""")
        val a = invio.esegui(coda.tutte().first())
        assertEquals("13", (a as InvioFase3.Arrivato.UnaSpesa).spesa.id)
        val c1 = corpo(server.takeRequest())
        assertEquals("salvaSpesa", c1.getString("azione"))
        assertFalse("una spesa nuova non ha id", c1.getJSONObject("spesa").has("id"))
        assertEquals("S-1", c1.getJSONObject("spesa").getString("idLocale"))

        risponde("""{"ok": true, "file": {"id": "M8kCHDq", "url": "/file/M8kCHDq", "nome": "spesa 13"}}""")
        val b = invio.esegui(coda.tutte().first())
        assertEquals("13", (b as InvioFase3.Arrivato.Scontrino).idSpesa)
        val r2 = corpo(server.takeRequest())
        assertEquals("caricaFile", r2.getString("azione"))
        assertEquals("spesa", r2.getString("tipo"))
        assertEquals(13L, r2.getLong("idSpesa"))
        assertEquals("idfisso", r2.getString("idFile"))
        assertTrue(coda.tutte().isEmpty())
        // La copia resta sul telefono col nome del file sul server.
        assertTrue(File(cartella.root, "M8kCHDq.jpg").exists())
    }

    @Test
    fun `una riga nata qui parte col suo idLocale, lo stesso a ogni tentativo`() = runBlocking {
        val coda = CodaInvii(file)
        coda.spesa("S-1", spesa.perSalvare())
        val invio = InvioFase3(ponte, coda, null)
        // La rete cade dopo che la richiesta è partita: il server forse l'ha scritta.
        server.enqueue(MockResponse().setResponseCode(502))
        try {
            invio.esegui(coda.tutte().first())
            fail("doveva fallire")
        } catch (_: Exception) {
        }
        val c1 = corpo(server.takeRequest()).getJSONObject("spesa")
        assertEquals("S-1", c1.getString("idLocale"))
        assertFalse(c1.has("id"))
        assertEquals(1, coda.tutte().size)
        // Al giro dopo parte uguale, con lo stesso idLocale: se c'era già, il server risponde con quella.
        risponde("""{"ok": true, "spesa": ${spesaDelServer(21)}}""")
        val a = invio.esegui(coda.tutte().first())
        assertEquals("21", (a as InvioFase3.Arrivato.UnaSpesa).spesa.id)
        val c2 = corpo(server.takeRequest()).getJSONObject("spesa")
        assertEquals("S-1", c2.getString("idLocale"))
        assertTrue(coda.tutte().isEmpty())
        // Le ore lo stesso.
        coda.ore("O-7", RigaOre(data = giorno, ore = 2.0).perSalvare())
        risponde("""{"ok": true, "riga": {"id": 31, "data": "2026-10-21", "ore": 2, "stato": "approvata"}}""")
        invio.esegui(coda.tutte().first())
        assertEquals("O-7", corpo(server.takeRequest()).getJSONObject("riga").getString("idLocale"))
    }

    @Test
    fun `già arrivata ma cambiata intanto, riparte subito come modifica`() = runBlocking {
        val coda = CodaInvii(file)
        coda.ore("O-1", RigaOre(data = giorno, ore = 3.0, descrizione = "Dopo").perSalvare())
        val invio = InvioFase3(ponte, coda, null)
        // Il server la conosce già (giaArrivata) con le ore di prima: non applica la modifica.
        risponde("""{"ok": true, "giaArrivata": true, "riga": {"id": 30, "data": "2026-10-21", "ore": 2, "descrizione": "Prima", "stato": "approvata"}}""")
        invio.esegui(coda.tutte().first())
        server.takeRequest()
        val resta = coda.tutte().single()
        assertEquals("30", resta.idRemoto)
        risponde("""{"ok": true, "riga": {"id": 30, "data": "2026-10-21", "ore": 3, "descrizione": "Dopo", "stato": "approvata"}}""")
        invio.esegui(resta)
        val r = corpo(server.takeRequest()).getJSONObject("riga")
        assertEquals(30L, r.getLong("id"))
        assertFalse("la modifica non manda l'idLocale", r.has("idLocale"))
        assertEquals(3.0, r.getDouble("ore"), 0.0)
        assertTrue(coda.tutte().isEmpty())
        // Già arrivata e uguale: esce dalla coda e basta.
        coda.ore("O-2", RigaOre(data = giorno, ore = 2.0, descrizione = "Uguale").perSalvare())
        risponde("""{"ok": true, "giaArrivata": true, "riga": {"id": 32, "data": "2026-10-21", "ore": 2, "descrizione": "Uguale", "stato": "approvata"}}""")
        invio.esegui(coda.tutte().first())
        assertTrue(coda.tutte().isEmpty())
    }

    @Test
    fun `le ore nate qui ripartono come modifica quando il server ha dato l'id`() = runBlocking {
        val coda = CodaInvii(file)
        coda.ore("O-1", RigaOre(data = giorno, ore = 2.0, descrizione = "Prima").perSalvare())
        val invio = InvioFase3(ponte, coda)
        risponde("""{"ok": true, "riga": {"id": 30, "data": "2026-10-21", "ore": 2, "descrizione": "Prima", "stato": "approvata"}}""")
        invio.esegui(coda.tutte().first())
        server.takeRequest()
        // Cambiata dopo: la chiave è la stessa, e l'operazione nuova sa l'id.
        coda.ore("O-1", RigaOre(data = giorno, ore = 3.0, descrizione = "Dopo").perSalvare(), idRemoto = "30")
        risponde("""{"ok": true, "riga": {"id": 30, "data": "2026-10-21", "ore": 3, "stato": "approvata"}}""")
        invio.esegui(coda.tutte().first())
        val r = corpo(server.takeRequest()).getJSONObject("riga")
        assertEquals(30L, r.getLong("id"))
        assertEquals(3.0, r.getDouble("ore"), 0.0)
    }

    @Test
    fun `il confronto fra quello che si è mandato e quello che il server ha`() {
        val corpo = RigaOre(data = giorno, inizio = "8:00", fine = "12:20", idCommessa = "26ST001", descrizione = "Schema", fatturabile = true).perSalvare()
        val giusta = RigaOre(id = "5", data = giorno, inizio = "08:00", fine = "12:20", ore = 4.33, idCommessa = "26st001", descrizione = "Schema", fatturabile = true, stato = StatoVoce.APPROVATA)
        assertTrue(InvioFase3.oreCorrispondono(giusta, corpo))
        assertFalse("un'altra ora", InvioFase3.oreCorrispondono(giusta.copy(fine = "12:30"), corpo))
        assertFalse("in bozza", InvioFase3.oreCorrispondono(giusta.copy(stato = StatoVoce.BOZZA), corpo))
        val s = spesa.perSalvare()
        val trovata = Spesa.daJson(JSONObject(spesaDelServer(9)))
        assertTrue(InvioFase3.speseCorrispondono(trovata, s))
        assertFalse(InvioFase3.speseCorrispondono(trovata.copy(importo = 8.5), s))
        assertFalse(InvioFase3.speseCorrispondono(trovata.copy(pagataDaMe = false), s))
    }
}
