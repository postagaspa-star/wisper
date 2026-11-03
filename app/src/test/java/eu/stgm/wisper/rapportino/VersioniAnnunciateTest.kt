package eu.stgm.wisper.rapportino

import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

/**
 * Gli aggiornamenti annunciati dal NAS (progetti.md §6, server/src/versioni.js): "versioni" letto da ogni risposta
 * (casa e Google, anche i no), il controllo una volta sola per codice, il campanello che resta aperto e si riapre,
 * aspetta dopo un errore e non manda il token.
 */
class VersioniAnnunciateTest {
    private lateinit var server: MockWebServer
    private val visti = CopyOnWriteArrayList<RecordedRequest>()
    private var risposta: (RecordedRequest) -> MockResponse = { json("""{"ok":true}""") }
    private val arrivate = CopyOnWriteArrayList<Versioni>()

    private fun json(t: String) = MockResponse().setBody(t).setHeader("Content-Type", "application/json; charset=utf-8")
    private fun versioni(giro: Int, codice: Int) = """{"giro":$giro,"android":{"codice":$codice,"nome":"1.1.$codice"},"computer":{"versione":"1.1.0"}}"""

    @Before
    fun accendi() {
        AnnuncioVersioni.dimentica()
        AnnuncioVersioni.quandoArriva = { arrivate += it }
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                visti += request
                return risposta(request)
            }
        }
        server.start()
    }

    @After
    fun spegni() {
        AnnuncioVersioni.dimentica()
        runCatching { server.shutdown() }
    }

    @Test
    fun `il pezzo versioni si legge com'e', e manca senza danni`() {
        val v = Versioni.daJson(JSONObject(versioni(3, 11)))!!
        assertEquals(Versioni(3, 11, "1.1.11", "1.1.0"), v)
        assertNull(Versioni.daJson(null))
        assertEquals(0, Versioni.daJson(JSONObject("""{"giro":1,"android":null}"""))!!.codiceAndroid)
        AnnuncioVersioni.leggi(JSONObject("""{"ok":true}"""))
        assertTrue("senza versioni non si avvisa nessuno", arrivate.isEmpty())
        // statoSistema (Amministrazione › Sistema) ha un suo "versioni" ({ultime, dispositivi}): non e' l'annuncio.
        val sistema = JSONObject("""{"ok":true,"versioni":{"ultime":{"telefono":"1.1.0","computer":"1.1.0"},"dispositivi":[{"nome":"Telefono","versione":"1.0.0"}]}}""")
        assertNull(Versioni.daJson(sistema.optJSONObject("versioni")))
        AnnuncioVersioni.leggi(sistema)
        assertTrue("il versioni di statoSistema si ignora", arrivate.isEmpty())
        assertNull(AnnuncioVersioni.ultime)
        assertEquals(12, Versioni.daJson(JSONObject("""{"android":{"codice":12,"nome":"1.2.0"}}"""))!!.codiceAndroid)
        assertNull("un giro che non e' un numero non basta", Versioni.daJson(JSONObject("""{"giro":"tre"}""")))
    }

    @Test
    fun `ogni risposta del server, anche un no, porta le versioni a chi ascolta`() = runBlocking<Unit> {
        risposta = { json("""{"ok":true,"versioni":${versioni(2, 11)}}""") }
        val p = PonteServer({ server.url("/").toString() }, { "tok" })
        p.leggiAzione("io", emptyList())
        assertEquals(11, arrivate.single().codiceAndroid)
        assertEquals(2, AnnuncioVersioni.ultime?.giro)
        risposta = { json("""{"ok":false,"errore":"Commessa non trovata","versioni":${versioni(3, 12)}}""") }
        runCatching { p.scriviAzione(JSONObject().put("azione", "salvaCommessa")) }
        assertEquals(listOf(11, 12), arrivate.map { it.codiceAndroid })
        assertEquals(Strade.Dove.CASA, p.strade.dove.value)
    }

    @Test
    fun `il controllo parte una volta sola per codice, dopo un errore si riprova solo dopo un'ora`() {
        var adesso = 1_000_000L
        val u = UnaVoltaPerCodice(versioneMia = 10, riprovaDopoMs = 3_600_000L, orologio = { adesso })
        assertFalse("la versione che ho gia'", u.daFare(10))
        assertFalse("una piu' vecchia", u.daFare(9))
        assertTrue(u.daFare(11))
        assertFalse("lo stesso annuncio in ogni risposta", u.daFare(11))
        u.esito(11, ok = true)
        adesso += 10 * 3_600_000L
        assertFalse("andato bene: per l'11 mai piu'", u.daFare(11))
        assertTrue("una versione ancora piu' nuova", u.daFare(12))
        u.esito(12, ok = false)
        adesso += 60_000L
        assertFalse("non andato: non subito", u.daFare(12))
        adesso += 3_600_000L
        assertTrue("non andato: dopo un'ora si riprova", u.daFare(12))
    }

    @Test
    fun `il campanello si riapre subito col giro nuovo, senza token, e annuncia le versioni`() = runBlocking<Unit> {
        risposta = { r ->
            when (r.requestUrl!!.queryParameter("giro")) {
                "0" -> json("""{"ok":true,"giro":1,"versioni":${versioni(1, 10)}}""")
                // Il server tiene aperta la richiesta finche' l'elenco non cambia: qui un attimo, poi il giro 2.
                "1" -> json("""{"ok":true,"giro":2,"versioni":${versioni(2, 11)}}""").setBodyDelay(300, TimeUnit.MILLISECONDS)
                else -> json("""{"ok":true,"giro":2,"versioni":${versioni(2, 11)}}""").setBodyDelay(5, TimeUnit.SECONDS)
            }
        }
        val c = Campanello({ server.url("/campanello") }, OkHttpClient(), pausaErroreMs = 50L)
        val lavoro = launch { c.suona() }
        withTimeout(5_000) { while (visti.size < 3) delay(20) }
        lavoro.cancel()
        assertEquals(listOf("0", "1", "2"), visti.take(3).map { it.requestUrl!!.queryParameter("giro") })
        assertTrue(visti.all { it.requestUrl!!.encodedPath == "/campanello" && it.getHeader("Authorization") == null })
        assertEquals(listOf(10, 11), arrivate.map { it.codiceAndroid })
    }

    @Test
    fun `dopo un errore il campanello aspetta, e fuori casa non suona`() = runBlocking<Unit> {
        risposta = { MockResponse().setResponseCode(500) }
        val c = Campanello({ server.url("/campanello") }, OkHttpClient(), pausaErroreMs = 400L)
        val lavoro = launch { c.suona() }
        delay(1_000)
        lavoro.cancel()
        assertTrue("con 400 ms di pausa, in un secondo al massimo 3 richieste: ${visti.size}", visti.size in 1..3)
        // Un server senza vedetta dice "spento": si richiede di rado.
        visti.clear()
        risposta = { json("""{"ok":true,"giro":0,"versioni":null,"spento":true}""") }
        val spento = Campanello({ server.url("/campanello") }, OkHttpClient(), pausaErroreMs = 10L, pausaSpentoMs = 60_000L)
        val l2 = launch { spento.suona() }
        delay(500)
        l2.cancel()
        assertEquals(1, visti.size)
        // Via Google (nessun indirizzo di casa): non parte niente.
        visti.clear()
        withTimeout(1_000) { Campanello({ null }, OkHttpClient()).suona() }
        assertTrue(visti.isEmpty())
    }
}
