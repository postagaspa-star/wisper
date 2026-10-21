package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.util.Base64

/**
 * Il telefono si presenta al foglio a ogni richiesta (disp, dispNome, app): lo
 * script lo scrive nella scheda Accessi. Qui al posto del foglio c'e' un
 * intercettore che risponde "ok" e si tiene le richieste.
 *
 * Le azioni dell'ufficio devono mandare allo script esattamente i campi che
 * manda il computer (pc/ui/app.js) e che lo script legge (apps-script/Code.gs).
 */
class PonteFoglioTest {
    private val viste = mutableListOf<Request>()

    /** La risposta del finto foglio: le prove la cambiano secondo l'azione. */
    private var risposta = """{"ok":true,"rapportini":[]}"""

    private val client = OkHttpClient.Builder().addInterceptor { catena ->
        viste += catena.request()
        Response.Builder()
            .request(catena.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
            .body(risposta.toResponseBody("application/json".toMediaType()))
            .build()
    }.build()

    private val ponte = PonteFoglio(
        url = { "https://script.example.com/exec" },
        codice = { "prova" },
        chiSono = { mapOf("disp" to "id-di-prova", "dispNome" to "motorola edge 60 pro", "app" to "telefono 0.3.3") },
        client = client,
    )

    private fun corpo(): JSONObject = JSONObject(Buffer().also { viste.last().body!!.writeTo(it) }.readUtf8())

    private val rapportinoFoglio = """{"id":"RAP/2026/0001","idLocale":"W-1","data":"2026-10-15","cliente":"Rossi",""" +
        """"stato":"INVIATO","totale":120,"tariffa":40,"inviatoIl":"2026-10-21T10:00:00","costoOrario":22}"""

    @Test
    fun `una lettura porta il dispositivo nell'indirizzo`() = runBlocking {
        ponte.rapportini(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31))
        val u = viste.single().url
        assertEquals("id-di-prova", u.queryParameter("disp"))
        assertEquals("motorola edge 60 pro", u.queryParameter("dispNome"))
        assertEquals("telefono 0.3.3", u.queryParameter("app"))
        assertEquals("rapportini", u.queryParameter("azione"))
    }

    @Test
    fun `una scrittura porta il dispositivo nel corpo`() {
        // La risposta finta non ha il rapportino, quindi stato() fallisce dopo: conta la richiesta partita.
        runCatching { runBlocking { ponte.stato("RAP/2026/0001", Stato.INVIATO) } }
        val o = corpo()
        assertEquals("id-di-prova", o.getString("disp"))
        assertEquals("motorola edge 60 pro", o.getString("dispNome"))
        assertEquals("telefono 0.3.3", o.getString("app"))
        assertEquals("stato", o.getString("azione"))
    }

    @Test
    fun `collega il computer manda l'indirizzo del foglio`() {
        runBlocking { ponte.collegaComputer() }
        val o = corpo()
        assertEquals("collegaComputer", o.getString("azione"))
        assertEquals("https://script.example.com/exec", o.getString("url"))
        assertEquals("id-di-prova", o.getString("disp"))
    }

    @Test
    fun `senza chi sono non si aggiunge niente`() = runBlocking {
        PonteFoglio({ "https://script.example.com/exec" }, { "prova" }, client = client)
            .rapportini(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31))
        assertFalse(viste.single().url.queryParameterNames.contains("disp"))
    }

    // ------------------------------------------------------------- l'ufficio

    @Test
    fun `tutti i rapportini, senza date, come il computer`() = runBlocking {
        risposta = """{"ok":true,"rapportini":[$rapportinoFoglio]}"""
        val letti = ponte.rapportiniTutti()
        val u = viste.single().url
        assertEquals("rapportini", u.queryParameter("azione"))
        assertFalse(u.queryParameterNames.contains("da"))
        assertFalse(u.queryParameterNames.contains("a"))
        val r = letti.single()
        assertEquals(Stato.INVIATO, r.stato)
        assertEquals("2026-10-21T10:00:00", r.inviatoIl)
        assertEquals(22.0, r.costoOrario!!, 0.0)
    }

    @Test
    fun `tanti rapportini cambiano stato in una richiesta`() = runBlocking {
        risposta = """{"ok":true,"rapportini":[$rapportinoFoglio]}"""
        val tornati = ponte.stato(listOf("RAP/2026/0001", "W-2"), Stato.FATTURATO)
        val o = corpo()
        assertEquals("stato", o.getString("azione"))
        assertEquals("FATTURATO", o.getString("stato"))
        assertEquals(listOf("RAP/2026/0001", "W-2"), (0 until 2).map { o.getJSONArray("ids").getString(it) })
        assertEquals(1, tornati.size)
    }

    @Test
    fun `cliente nuovo, e quello che c'era gia'`() = runBlocking {
        risposta = """{"ok":true,"cliente":{"id":"C002","nome":"Rossi Impianti Srl","telefono":"0445123456","partitaIva":"01234567890","giaEsisteva":true}}"""
        val s = ponte.creaCliente(Cliente("", " Rossi Impianti Srl ", email = "a@b.it", telefono = "0445123456", partitaIva = "01234567890"))
        val o = corpo()
        assertEquals("creaCliente", o.getString("azione"))
        assertEquals("Rossi Impianti Srl", o.getString("nome"))
        assertEquals("a@b.it", o.getString("email"))
        assertEquals("0445123456", o.getString("telefono"))
        assertEquals("01234567890", o.getString("partitaIva"))
        assertTrue(o.isNull("tariffaFissa"))   // vuota = tariffa libera
        assertTrue(s.giaEsisteva)
        assertEquals("C002", s.dato.id)
        assertEquals("01234567890", s.dato.partitaIva)
    }

    @Test
    fun `aggiornare un cliente manda tutta la scheda, i vuoti come null`() = runBlocking {
        risposta = """{"ok":true,"cliente":{"id":"C001","nome":"Elettrodinamica","tariffaFissa":30,"costoFisso":22}}"""
        val c = ponte.aggiornaCliente(
            Cliente("C001", "Elettrodinamica", alias = listOf("Batokyo", " "), tariffaFissa = 30.0, kmRimborsati = true, costoFisso = 22.0, note = "fissa")
        )
        val o = corpo()
        assertEquals("aggiornaCliente", o.getString("azione"))
        assertEquals("C001", o.getString("id"))
        val campi = o.getJSONObject("campi")
        assertEquals(1, campi.getJSONArray("alias").length())
        assertEquals("Batokyo", campi.getJSONArray("alias").getString(0))
        assertEquals(30.0, campi.getDouble("tariffaFissa"), 0.0)
        assertEquals(22.0, campi.getDouble("costoFisso"), 0.0)
        assertTrue(campi.getBoolean("kmRimborsati"))
        assertTrue(campi.isNull("pagaViaggio"))   // null = come di solito
        assertTrue(campi.isNull("ultimaTariffa"))
        assertEquals("fissa", campi.getString("note"))
        assertEquals(22.0, c.costoFisso!!, 0.0)
    }

    @Test
    fun `commessa nuova, il codice vuoto lo sceglie lo script`() = runBlocking {
        risposta = """{"ok":true,"commessa":{"id":"26ST047","idCliente":"C002","descrizione":"Quadro","stato":"APERTA","budgetOre":20,"inizio":"2026-10-21","giaEsisteva":false}}"""
        val s = ponte.creaCommessa(
            Commessa("", "C002", "Quadro", budgetOre = 20.0, prezzoOrario = 42.0, costoOrario = 25.0, inizio = LocalDate.of(2026, 10, 21)),
            Cliente("C002", "Rossi"),
        )
        val o = corpo()
        assertEquals("creaCommessa", o.getString("azione"))
        assertEquals("", o.getString("id"))
        assertEquals("C002", o.getString("idCliente"))
        assertEquals("Quadro", o.getString("descrizione"))
        assertEquals(20.0, o.getDouble("budgetOre"), 0.0)
        assertEquals(42.0, o.getDouble("prezzoOrario"), 0.0)
        assertEquals(25.0, o.getDouble("costoOrario"), 0.0)
        assertTrue(o.isNull("budgetEuro"))
        assertEquals("2026-10-21", o.getString("inizio"))
        assertEquals("", o.getString("finePrevista"))
        assertFalse(o.has("stato"))   // nasce APERTA: lo decide lo script
        assertEquals("26ST047", s.dato.id)
        assertEquals(LocalDate.of(2026, 10, 21), s.dato.inizio)
        assertFalse(s.giaEsisteva)
    }

    @Test
    fun `per Elettrodinamica prezzo e costo restano sulla scheda del cliente`() = runBlocking {
        risposta = """{"ok":true,"commessa":{"id":"26ST001","idCliente":"C001","descrizione":"Magazzino","stato":"SOSPESA"}}"""
        ponte.aggiornaCommessa(
            Commessa("26ST001", "C001", "Magazzino", stato = "sospesa", prezzoOrario = 50.0, costoOrario = 40.0),
            Cliente("C001", "Elettrodinamica", tariffaFissa = 30.0, costoFisso = 22.0),
        )
        val o = corpo()
        assertEquals("aggiornaCommessa", o.getString("azione"))
        assertEquals("26ST001", o.getString("id"))
        val campi = o.getJSONObject("campi")
        assertEquals("SOSPESA", campi.getString("stato"))
        assertFalse(campi.has("prezzoOrario"))
        assertFalse(campi.has("costoOrario"))
        assertEquals("", campi.getString("inizio"))   // vuoto = si toglie
    }

    @Test
    fun `impostazioni, i numeri come numeri`() = runBlocking {
        risposta = """{"ok":true,"impostazioni":{"EURO_KM":0.8,"COSTO_ORARIO":22,"PARTITA_IVA":"01234567890","TICKET_ATTIVO":"SI"}}"""
        val imp = ponte.salvaImpostazioni(mapOf("EURO_KM" to 0.8, "PARTITA_IVA" to "01234567890"))
        val v = corpo().getJSONObject("valori")
        assertEquals(0.8, v.getDouble("EURO_KM"), 0.0)
        assertEquals("01234567890", v.getString("PARTITA_IVA"))
        assertEquals("0.8", imp["EURO_KM"])
        assertEquals("22", imp["COSTO_ORARIO"])
        assertEquals("01234567890", imp["PARTITA_IVA"])
    }

    @Test
    fun `i documenti della commessa`() = runBlocking {
        risposta = """{"ok":true,"cartella":"https://drive.google.com/drive/folders/abc","documenti":[""" +
            """{"id":"1AbCdEfGhIjK","nome":"Offerta.pdf","url":"https://drive.google.com/file/d/1AbCdEfGhIjK/view","mime":"application/pdf","data":"2026-10-20T09:30:00"}]}"""
        val d = ponte.documenti("26ST001")
        val u = viste.single().url
        assertEquals("documenti", u.queryParameter("azione"))
        assertEquals("26ST001", u.queryParameter("idCommessa"))
        assertEquals("https://drive.google.com/drive/folders/abc", d.cartella)
        assertEquals("Offerta.pdf", d.documenti.single().nome)
        assertEquals(LocalDate.of(2026, 10, 20), d.documenti.single().data!!.toLocalDate())
    }

    @Test
    fun `un file del foglio arriva coi suoi byte`() = runBlocking {
        val byte = byteArrayOf(1, 2, 3, 4, 5)
        risposta = """{"ok":true,"file":{"id":"1AbCdEfGhIjK","nome":"firma.png","mime":"image/png","base64":"${Base64.getEncoder().encodeToString(byte)}"}}"""
        val (dati, mime) = ponte.file("1AbCdEfGhIjK")
        val u = viste.single().url
        assertEquals("file", u.queryParameter("azione"))
        assertEquals("1AbCdEfGhIjK", u.queryParameter("id"))
        assertArrayEquals(byte, dati)
        assertEquals("image/png", mime)
    }

    @Test
    fun `carica la firma del compilatore e un documento della commessa`() = runBlocking {
        risposta = """{"ok":true,"file":{"id":"1AbCdEfGhIjK","url":"https://drive.google.com/file/d/1AbCdEfGhIjK/view"}}"""
        val png = byteArrayOf(9, 8, 7)
        val f = ponte.caricaFile("firmaTecnico", png, "image/png")
        var o = corpo()
        assertEquals("caricaFile", o.getString("azione"))
        assertEquals("firmaTecnico", o.getString("tipo"))
        assertEquals("image/png", o.getString("mime"))
        assertArrayEquals(png, Base64.getDecoder().decode(o.getString("base64")))
        assertFalse(o.has("idCommessa"))
        assertEquals("1AbCdEfGhIjK", f.id)

        ponte.caricaFile("documento", png, "application/pdf", idCommessa = "26ST001", nome = "Offerta.pdf")
        o = corpo()
        assertEquals("documento", o.getString("tipo"))
        assertEquals("26ST001", o.getString("idCommessa"))
        assertEquals("Offerta.pdf", o.getString("nome"))
    }

    @Test
    fun `la foto del foglio firmato vale come firma, con chi ha firmato`() = runBlocking {
        risposta = """{"ok":true,"file":{"id":"1AbCdEfGhIjK","url":"u"}}"""
        ponte.caricaFile(
            "firma", byteArrayOf(1), "image/jpeg", idLocale = "W-1", id = "RAP/2026/0001", idFile = "abc",
            firmatario = "Mario Bianchi", firmatoIl = "2026-10-21T10:00:00",
        )
        val o = corpo()
        assertEquals("firma", o.getString("tipo"))
        assertEquals("W-1", o.getString("idLocale"))
        assertEquals("RAP/2026/0001", o.getString("id"))
        assertEquals("abc", o.getString("idFile"))
        assertEquals("Mario Bianchi", o.getString("firmatario"))
        assertEquals("2026-10-21T10:00:00", o.getString("firmatoIl"))
    }

    @Test
    fun `l'email porta il PDF e i rapportini da segnare`() = runBlocking {
        risposta = """{"ok":true,"rapportini":[$rapportinoFoglio]}"""
        val pdf = "%PDF-1.4".toByteArray()
        val tornati = ponte.inviaEmail(
            " ufficio@rossi.it ", "", "Rapportino RAP/2026/0001", "Buongiorno",
            listOf(Allegato("RAP-2026-0001 Rossi.pdf", "application/pdf", pdf)), listOf("RAP/2026/0001"),
        )
        val o = corpo()
        assertEquals("inviaEmail", o.getString("azione"))
        assertEquals("ufficio@rossi.it", o.getString("a"))
        assertEquals("", o.getString("cc"))
        assertEquals("Rapportino RAP/2026/0001", o.getString("oggetto"))
        assertEquals("Buongiorno", o.getString("messaggio"))
        assertFalse(o.getBoolean("aMe"))
        val a = o.getJSONArray("allegati").getJSONObject(0)
        assertEquals("RAP-2026-0001 Rossi.pdf", a.getString("nome"))
        assertEquals("application/pdf", a.getString("mime"))
        assertArrayEquals(pdf, Base64.getDecoder().decode(a.getString("base64")))
        assertEquals("RAP/2026/0001", o.getJSONArray("ids").getString(0))
        assertEquals(Stato.INVIATO, tornati.single().stato)
    }

    @Test
    fun `un no dello script arriva col suo messaggio, e una sola richiesta`() {
        risposta = """{"ok":false,"errore":"Il codice 26ST001 e' gia' di un'altra commessa"}"""
        val e = runCatching { runBlocking { ponte.creaCommessa(Commessa("26ST001", "C1", "x")) } }.exceptionOrNull()
        assertTrue(e is PonteFoglio.RifiutatoDalFoglio)
        assertEquals("Il codice 26ST001 e' gia' di un'altra commessa", e!!.message)
        assertEquals(1, viste.size)
    }
}
