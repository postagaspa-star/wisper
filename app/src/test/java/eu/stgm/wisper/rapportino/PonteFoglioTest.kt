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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.time.LocalDate

/**
 * Il telefono si presenta al foglio a ogni richiesta (disp, dispNome, app): lo
 * script lo scrive nella scheda Accessi. Qui al posto del foglio c'e' un
 * intercettore che risponde "ok" e si tiene le richieste.
 */
class PonteFoglioTest {
    private val viste = mutableListOf<Request>()
    private val client = OkHttpClient.Builder().addInterceptor { catena ->
        viste += catena.request()
        Response.Builder()
            .request(catena.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
            .body("""{"ok":true,"rapportini":[]}""".toResponseBody("application/json".toMediaType()))
            .build()
    }.build()

    private val ponte = PonteFoglio(
        url = { "https://script.example.com/exec" },
        codice = { "prova" },
        chiSono = { mapOf("disp" to "id-di-prova", "dispNome" to "motorola edge 60 pro", "app" to "telefono 0.3.3") },
        client = client,
    )

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
        val corpo = Buffer().also { viste.single().body!!.writeTo(it) }.readUtf8()
        val o = JSONObject(corpo)
        assertEquals("id-di-prova", o.getString("disp"))
        assertEquals("motorola edge 60 pro", o.getString("dispNome"))
        assertEquals("telefono 0.3.3", o.getString("app"))
        assertEquals("stato", o.getString("azione"))
    }

    @Test
    fun `collega il computer manda l'indirizzo del foglio`() {
        runBlocking { ponte.collegaComputer() }
        val o = JSONObject(Buffer().also { viste.single().body!!.writeTo(it) }.readUtf8())
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
}
