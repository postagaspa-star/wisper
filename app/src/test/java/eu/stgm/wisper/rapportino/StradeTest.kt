package eu.stgm.wisper.rapportino

import eu.stgm.wisper.Archivio
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.util.Base64
import java.util.concurrent.CopyOnWriteArrayList

/**
 * La porta Google dal lato del telefono (docs/gestionale/porta-google.md): la
 * regola di casa con la firma, poi Google; lo stesso id a ogni tentativo e dopo
 * il passaggio casa → Google; le risposte "riprova" dello script come la rete; i
 * file grandi; il rimbalzo 302. Due server finti veri (MockWebServer): "casa"
 * (il server sul NAS) e "google" (lo script del foglio).
 */
class StradeTest {
    private val token = "token-di-prova-della-firma"
    private lateinit var casa: MockWebServer
    private lateinit var google: MockWebServer

    /** Una richiesta vista da un server finto, col corpo già letto. */
    private class Vista(val r: RecordedRequest, val byte: ByteArray) {
        val percorso: String get() = r.requestUrl!!.encodedPath
        val testo: String get() = String(byte, Charsets.UTF_8)
        fun json() = JSONObject(testo)
    }

    private val vistiCasa = CopyOnWriteArrayList<Vista>()
    private val vistiGoogle = CopyOnWriteArrayList<Vista>()

    /** La firma che manda "casa": giusta (il server vero) o no (un altro apparecchio con lo stesso indirizzo). */
    private var firma: (String) -> String = { prova -> Strade.firmaDiCasa(token, prova) }
    private var rispostaCasa: (Vista) -> MockResponse = { json("""{"ok":true,"da":"casa"}""") }
    private var rispostaGoogle: (Vista) -> MockResponse = { json("""{"ok":true,"da":"google"}""") }

    private fun json(t: String) = MockResponse().setBody(t).setHeader("Content-Type", "application/json; charset=utf-8")
    private fun json(o: JSONObject) = json(o.toString())

    private val chi = mapOf("disp" to "tel-prova", "dispNome" to "Telefono di prova", "app" to "telefono prove")
    private val urlGoogle: String get() = google.url("/macros/s/finto/exec").toString()
    private val urlCasa: String get() = casa.url("/").toString()

    private fun ponte(tok: String = token, conCasa: Boolean = true, conGoogle: Boolean = true) = PonteServer(
        { if (conCasa) urlCasa else "" }, { tok }, { chi }, google = { if (conGoogle) urlGoogle else "" },
    )

    @Before
    fun accendi() {
        casa = MockWebServer()
        casa.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val v = Vista(request, request.body.readByteArray())
                vistiCasa += v
                return if (v.percorso == "/salute") {
                    val prova = request.requestUrl!!.queryParameter("prova").orEmpty()
                    json(JSONObject().put("ok", true).put("versione", "0.9.0").put("firma", firma(prova)))
                } else rispostaCasa(v)
            }
        }
        casa.start()
        google = MockWebServer()
        google.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val v = Vista(request, request.body.readByteArray())
                vistiGoogle += v
                return rispostaGoogle(v)
            }
        }
        google.start()
    }

    @After
    fun spegni() {
        runCatching { casa.shutdown() }
        runCatching { google.shutdown() }
    }

    private fun prove() = vistiCasa.filter { it.percorso == "/salute" }
    private fun execDiCasa() = vistiCasa.filter { it.percorso != "/salute" }
    private fun idGoogle() = vistiGoogle.map { it.json().getString("id") }

    // ------------------------------------------------------------- la firma

    @Test
    fun `la firma di casa e' quella del server (stesso esempio calcolato con node)`() {
        // node: sha256(token).slice(0,16) e createHmac('sha256', sha256hex(token)).update(prova).digest('hex')
        assertEquals("ab5bd4aac6021884", Strade.chiDelToken(token))
        assertEquals(
            "5a13437751932761a50c20217e0c79af7c71b6bd579ad35c5635ad82e7d8abdc",
            Strade.firmaDiCasa(token, "Prova0123456789abcdefghijklmnopq"),
        )
    }

    @Test
    fun `con la firma giusta si va a casa, col token nell'intestazione e l'idRichiesta nel corpo`() = runBlocking {
        val p = ponte()
        val r = p.scriviAzione(JSONObject().put("azione", "salvaReferente").put("referente", JSONObject().put("nome", "Anna")))
        assertEquals("casa", r.getString("da"))
        assertTrue("Google non serve", vistiGoogle.isEmpty())
        // La prova: un testo a caso di 32 caratteri e i primi 16 dello SHA-256 del token. Il token NON parte.
        val prova = prove().single()
        val u = prova.r.requestUrl!!
        assertTrue(u.queryParameter("prova")!!.matches(Regex("[A-Za-z0-9_-]{32}")))
        assertEquals(Strade.chiDelToken(token), u.queryParameter("chi"))
        assertNull(prova.r.getHeader("Authorization"))
        assertFalse(u.toString().contains(token))
        // La richiesta: come prima, col Bearer, e con l'id della richiesta nel corpo.
        val w = execDiCasa().single()
        assertEquals("POST", w.r.method)
        assertEquals("/exec", w.percorso)
        assertEquals("Bearer $token", w.r.getHeader("Authorization"))
        assertTrue(w.json().getString("idRichiesta").matches(Regex("[A-Za-z0-9_-]{8,80}")))
        assertEquals("salvaReferente", w.json().getString("azione"))
        assertEquals(Strade.Dove.CASA, p.strade.dove.value)
        // La seconda richiesta non rifà la prova (la scelta vale 5 minuti).
        p.leggiAzione("io", emptyList())
        assertEquals(1, prove().size)
        assertEquals("GET", execDiCasa().last().r.method)
    }

    @Test
    fun `con la firma sbagliata (un altro apparecchio con lo stesso indirizzo) il token non parte e si va via Google`() = runBlocking {
        firma = { prova -> Strade.firmaDiCasa("il-token-di-un-altro", prova) }
        val p = ponte()
        val r = p.scriviAzione(JSONObject().put("azione", "salvaOre").put("riga", JSONObject().put("ore", 2)))
        assertEquals("google", r.getString("da"))
        assertTrue("a casa solo la prova, mai il token", execDiCasa().isEmpty())
        assertTrue(vistiCasa.none { it.r.getHeader("Authorization") != null || it.testo.contains(token) || it.r.requestUrl.toString().contains(token) })
        val g = vistiGoogle.single().json()
        assertEquals(1, g.getInt("porta"))
        assertEquals("exec", g.getString("strada"))
        assertEquals("POST", g.getString("metodo"))
        assertEquals(token, g.getString("token"))
        assertTrue(g.getString("id").matches(Regex("[A-Za-z0-9_-]{8,80}")))
        assertEquals("salvaOre", g.getJSONObject("dati").getString("azione"))
        assertEquals("tel-prova", g.getJSONObject("dati").getString("disp"))
        assertFalse("via Google basta id: idRichiesta lo mette il server", g.getJSONObject("dati").has("idRichiesta"))
        assertEquals("text/plain;charset=utf-8", vistiGoogle.single().r.getHeader("Content-Type")?.replace(" ", ""))
        assertEquals(Strade.Dove.GOOGLE, p.strade.dove.value)
        // Senza firma (una pagina qualunque che risponde ok): lo stesso.
        firma = { "" }
        p.reteCambiata()
        p.scriviAzione(JSONObject().put("azione", "prova"))
        assertEquals(2, vistiGoogle.size)
        assertTrue(execDiCasa().isEmpty())
    }

    @Test
    fun `casa che non risponde (fuori casa), via Google, senza aspettare`() = runBlocking {
        casa.shutdown()
        val t0 = System.currentTimeMillis()
        val r = ponte().leggiAzione("io", emptyList())
        assertEquals("google", r.getString("da"))
        assertTrue("la prova non fa aspettare: ${System.currentTimeMillis() - t0} ms", System.currentTimeMillis() - t0 < 5000)
        val g = vistiGoogle.single().json()
        assertEquals("GET", g.getString("metodo"))
        assertEquals("io", g.getJSONObject("dati").getString("azione"))
    }

    @Test
    fun `una risposta JSON di casa, anche un no, non e' la rete`() = runBlocking {
        rispostaCasa = { json("""{"ok":false,"errore":"Manca il nome"}""") }
        try {
            ponte().scriviAzione(JSONObject().put("azione", "salvaReferente"))
            fail("doveva dire di no")
        } catch (e: PonteServer.Rifiutato) {
            assertEquals("Manca il nome", e.message)
        }
        assertTrue("un no del server non si rifà via Google", vistiGoogle.isEmpty())
    }

    // ------------------------------------------------------------- la scelta e quanto dura

    @Test
    fun `la scelta vale 5 minuti, ogni risposta da casa la rinnova, la rete cambiata la rifa'`() {
        var ora = 1_000_000_000L
        val s = Strade({ urlCasa }, { urlGoogle }, { token }, OkHttpClient(), orologio = { ora })
        val corpo = { JSONObject().put("azione", "prova") }
        s.scrivi(corpo())
        assertEquals(1, prove().size)
        assertEquals(Strade.Dove.CASA, s.sceltaAttuale())
        ora += 4 * 60_000
        s.scrivi(corpo())
        assertEquals("entro 5 minuti niente prova", 1, prove().size)
        ora += 4 * 60_000
        s.scrivi(corpo())
        assertEquals("la risposta di 4 minuti fa ha rinnovato i 5 minuti", 1, prove().size)
        ora += 5 * 60_000 + 1
        assertNull("scaduta", s.sceltaAttuale())
        s.scrivi(corpo())
        assertEquals("piu' di 5 minuti dall'ultima risposta: si prova di nuovo", 2, prove().size)
        s.reteCambiata()
        assertNull(s.sceltaAttuale())
        s.scrivi(corpo())
        assertEquals("la rete e' cambiata: si prova subito", 3, prove().size)
        assertEquals(5, execDiCasa().size)
        assertTrue(vistiGoogle.isEmpty())

        // Fuori casa: Google per 5 minuti (le risposte di Google non la rinnovano), poi una prova nuova.
        firma = { "" }
        s.reteCambiata()
        s.scrivi(corpo())
        assertEquals(4, prove().size)
        assertEquals(Strade.Dove.GOOGLE, s.sceltaAttuale())
        ora += 3 * 60_000
        s.scrivi(corpo())
        assertEquals(4, prove().size)
        ora += 2 * 60_000 + 1
        s.scrivi(corpo())
        assertEquals(5, prove().size)
        assertEquals(3, vistiGoogle.size)
        // Tornati a casa (la Wi-Fi dello studio): la rete cambia, la firma torna, si va a casa.
        firma = { prova -> Strade.firmaDiCasa(token, prova) }
        s.reteCambiata()
        s.scrivi(corpo())
        assertEquals(Strade.Dove.CASA, s.sceltaAttuale())
        assertEquals(6, execDiCasa().size)
    }

    @Test
    fun `cambiato l'indirizzo o il token, la scelta di prima non vale`() {
        var tok = token
        val s = Strade({ urlCasa }, { urlGoogle }, { tok }, OkHttpClient())
        s.scrivi(JSONObject().put("azione", "prova"))
        tok = "un-altro-token"
        firma = { prova -> Strade.firmaDiCasa(tok, prova) }
        s.scrivi(JSONObject().put("azione", "prova"))
        assertEquals(2, prove().size)
        assertEquals(Strade.chiDelToken("un-altro-token"), prove().last().r.requestUrl!!.queryParameter("chi"))
    }

    // ------------------------------------------------------------- casa che cade: Google con lo stesso id

    @Test
    fun `una scrittura a casa senza risposta riparte via Google con lo stesso id, e la scelta passa a Google`() = runBlocking {
        // Il server l'ha ricevuta, ma la risposta si è persa (la Wi-Fi è caduta).
        rispostaCasa = { MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) }
        val p = ponte()
        val r = p.scriviAzione(JSONObject().put("azione", "salvaReferente").put("referente", JSONObject().put("nome", "Anna")))
        assertEquals("google", r.getString("da"))
        val aCasa = execDiCasa().single().json()
        val aGoogle = vistiGoogle.single().json()
        assertEquals("lo stesso id: il server non la fa due volte", aCasa.getString("idRichiesta"), aGoogle.getString("id"))
        assertEquals(aCasa.getString("azione"), aGoogle.getJSONObject("dati").getString("azione"))
        assertEquals(Strade.Dove.GOOGLE, p.strade.sceltaAttuale())
        // La richiesta dopo va diretta a Google, senza riprovare casa.
        p.leggiAzione("io", emptyList())
        assertEquals(1, prove().size)
        assertEquals(1, execDiCasa().size)
        assertEquals(2, vistiGoogle.size)
    }

    @Test
    fun `HTTP diverso da 200 o una pagina non JSON da casa sono la rete`() = runBlocking {
        rispostaCasa = { MockResponse().setResponseCode(502).setBody("Bad gateway") }
        assertEquals("google", ponte().leggiAzione("io", emptyList()).getString("da"))
        vistiGoogle.clear()
        rispostaCasa = { MockResponse().setBody("<html>portale dell'albergo</html>") }
        assertEquals("google", ponte().leggiAzione("io", emptyList()).getString("da"))
    }

    // ------------------------------------------------------------- le risposte "riprova" dello script

    @Test
    fun `attesa, spento e occupato sono come senza rete, la coda riprova e non scarta niente`() = runBlocking {
        val p = ponte(conCasa = false)
        val risposte = listOf(
            "attesa" to "Il server dello studio non ha risposto in tempo: riprova fra poco",
            "spento" to "Il server dello studio non risponde dalle 10:42: riprova più tardi",
            "occupato" to "Troppe richieste insieme: riprova fra poco",
        )
        for ((porta, frase) in risposte) {
            rispostaGoogle = { json(JSONObject().put("ok", false).put("rete", true).put("porta", porta).put("errore", frase).put("ultimoContatto", "2026-10-31T10:42:03")) }
            try {
                p.scriviAzione(JSONObject().put("azione", "salvaRapportino"))
                fail("$porta doveva essere un errore")
            } catch (e: PonteServer.ServizioNonRaggiunto) {
                assertEquals(porta, e.porta)
                assertEquals("il testo si mostra così com'è", frase, e.message)
                assertEquals("$porta = rete: la coda riprova", Archivio.Esito.RETE, Archivio.esitoDi(e))
                assertEquals(
                    if (porta == "occupato") "Google non risponde: riprovo da solo. Intanto sono al sicuro sul telefono."
                    else "Il server dello studio non risponde: riprovo da solo. Intanto sono al sicuro sul telefono.",
                    Archivio.motivoNonPartite(e),
                )
            }
        }
        // Senza rete vera resta il testo di sempre.
        assertEquals("Sono al sicuro sul telefono. Partono da soli appena c'è rete.", Archivio.motivoNonPartite(java.net.ConnectException("refused")))
        // "Richiesta non valida" (senza rete): riprovare non serve.
        rispostaGoogle = { json("""{"ok":false,"errore":"Richiesta non valida"}""") }
        val e = runCatching { p.scriviAzione(JSONObject().put("azione", "x")) }.exceptionOrNull()
        assertTrue(e is PonteServer.Rifiutato)
        assertEquals(Archivio.Esito.RIFIUTATO, Archivio.esitoDi(e as Exception))
    }

    @Test
    fun `una pagina HTML o un HTTP diverso da 200 dallo script sono la rete`() = runBlocking {
        val p = ponte(conCasa = false)
        rispostaGoogle = { MockResponse().setBody("<!DOCTYPE html><html><body>Errore dello script</body></html>").setHeader("Content-Type", "text/html") }
        val html = runCatching { p.leggiAzione("io", emptyList()) }.exceptionOrNull()
        assertTrue(html is PonteServer.ServizioNonRaggiunto)
        assertEquals(Archivio.Esito.RETE, Archivio.esitoDi(html as Exception))
        rispostaGoogle = { MockResponse().setResponseCode(429).setBody("Too many") }
        val troppe = runCatching { p.leggiAzione("io", emptyList()) }.exceptionOrNull() as PonteServer.ServizioNonRaggiunto
        assertEquals("occupato", troppe.porta)
        rispostaGoogle = { MockResponse().setResponseCode(500).setBody("") }
        assertTrue(runCatching { p.leggiAzione("io", emptyList()) }.exceptionOrNull() is PonteServer.ServizioNonRaggiunto)
    }

    // ------------------------------------------------------------- lo stesso id a ogni tentativo

    @Test
    fun `lo stesso id a ogni tentativo della stessa operazione della coda, uno nuovo per le altre`() = runBlocking {
        val p = ponte(conCasa = false)
        val ore = { n: Int -> JSONObject().put("azione", "salvaOre").put("riga", JSONObject().put("idLocale", "O-1").put("ore", n)) }
        var volte = 0
        // Il primo tentativo: "attesa" (il server è lento); il secondo: la risposta.
        rispostaGoogle = {
            if (++volte == 1) json("""{"ok":false,"rete":true,"porta":"attesa","errore":"Il server dello studio non ha risposto in tempo: riprova fra poco"}""")
            else json("""{"ok":true,"riga":{"id":7}}""")
        }
        val primo = runCatching { IdRichiesta.perOperazione("op-ore-1") { p.scriviAzione(ore(2)) } }
        assertTrue(primo.exceptionOrNull() is PonteServer.ServizioNonRaggiunto)
        val secondo = IdRichiesta.perOperazione("op-ore-1") { p.scriviAzione(ore(2)) }
        assertEquals(7, secondo.getJSONObject("riga").getInt("id"))
        val (a, b) = idGoogle()
        assertEquals("la coda riprova con lo stesso id", a, b)
        // Il contenuto cambiato nel frattempo (salvato di nuovo prima di partire): un id nuovo, se no il server ridarebbe la risposta vecchia.
        IdRichiesta.perOperazione("op-ore-1") { p.scriviAzione(ore(3)) }
        // Un'altra operazione con lo stesso contenuto: un altro id.
        IdRichiesta.perOperazione("op-ore-2") { p.scriviAzione(ore(2)) }
        // Fuori dalla coda (le azioni in diretta): un id nuovo a ogni chiamata.
        p.scriviAzione(ore(2))
        p.scriviAzione(ore(2))
        val id = idGoogle()
        assertEquals(6, id.size)
        assertEquals(5, id.toSet().size)
        assertNotEquals(id[0], id[2])
        assertNotEquals(id[0], id[3])
        assertNotEquals(id[4], id[5])
        assertTrue(id.all { it.matches(Regex("[A-Za-z0-9_-]{8,80}")) })
        // Dopo un nuovo accesso (un altro token) la stessa operazione ha un altro id: lo script tiene
        // le risposte per id e basta, e non deve ridare quella dell'accesso di prima.
        val dopoAccesso = PonteServer({ "" }, { "un-altro-token" }, { chi }, google = { urlGoogle })
        IdRichiesta.perOperazione("op-ore-1") { dopoAccesso.scriviAzione(ore(2)) }
        IdRichiesta.perOperazione("op-ore-1") { dopoAccesso.scriviAzione(ore(2)) }
        val ultimi = idGoogle().takeLast(2)
        assertEquals(ultimi[0], ultimi[1])
        assertNotEquals(id[0], ultimi[0])
    }

    @Test
    fun `le letture hanno un id nuovo ogni volta, anche dentro la coda`() = runBlocking {
        val p = ponte(conCasa = false)
        IdRichiesta.perOperazione("op-x") {
            p.leggiAzione("ore", listOf("da" to "2026-10-01"))
            p.leggiAzione("ore", listOf("da" to "2026-10-01"))
        }
        val (a, b) = idGoogle()
        assertNotEquals(a, b)
        val g = vistiGoogle.first().json()
        assertEquals("GET", g.getString("metodo"))
        val dati = g.getJSONObject("dati")
        assertEquals("ore", dati.getString("azione"))
        assertEquals("2026-10-01", dati.getString("da"))
        assertEquals("tel-prova", dati.getString("disp"))
        assertEquals("telefono prove", dati.getString("app"))
    }

    // ------------------------------------------------------------- accedi, solo casa, solo Google

    @Test
    fun `accedi va via Google anche con casa, senza token la firma non si controlla`() = runBlocking {
        rispostaGoogle = { json("""{"ok":true,"token":"nuovo-token","utente":{"id":"1","nome":"Manuel Gasparotto","ruolo":"titolare"},"permessi":{}}""") }
        val a = ponte(tok = "").accedi(" manuel@esempio.it ", "prova")
        assertEquals("nuovo-token", a.token)
        assertTrue("a casa niente, neanche la prova", vistiCasa.isEmpty())
        val g = vistiGoogle.single().json()
        assertEquals("", g.getString("token"))
        assertEquals("accedi", g.getJSONObject("dati").getString("azione"))
        assertEquals("manuel@esempio.it", g.getJSONObject("dati").getString("email"))
        assertEquals("tel-prova", g.getJSONObject("dati").getString("disp"))
    }

    @Test
    fun `senza indirizzo Google, solo casa, come prima, senza prova`() = runBlocking {
        val p = ponte(conGoogle = false)
        p.scriviAzione(JSONObject().put("azione", "stato"))
        p.leggiAzione("io", emptyList())
        assertTrue(prove().isEmpty())
        assertEquals(2, execDiCasa().size)
        assertTrue("anche a casa l'id della richiesta", execDiCasa().first().json().has("idRichiesta"))
        // Una risposta strana resta un no, come prima ("controlla l'indirizzo").
        rispostaCasa = { MockResponse().setBody("<html></html>") }
        assertTrue(runCatching { p.leggiAzione("io", emptyList()) }.exceptionOrNull() is PonteServer.Rifiutato)
        assertTrue(vistiGoogle.isEmpty())
        // E accedi va a casa.
        rispostaCasa = { json("""{"ok":true,"token":"t2","utente":{"id":"1"},"permessi":{}}""") }
        assertEquals("t2", ponte(tok = "", conGoogle = false).accedi("a@b.it", "x").token)
    }

    @Test
    fun `senza indirizzo di casa, solo Google`() = runBlocking {
        val p = ponte(conCasa = false)
        assertTrue(p.configurato)
        p.scriviAzione(JSONObject().put("azione", "stato"))
        assertTrue(vistiCasa.isEmpty())
        assertEquals(Strade.Dove.GOOGLE, p.strade.dove.value)
        // Senza nessun indirizzo: si deve entrare di nuovo, la coda aspetta.
        val senza = PonteServer({ "" }, { token }, google = { "" })
        assertFalse(senza.configurato)
        assertTrue(runCatching { senza.leggiAzione("io", emptyList()) }.exceptionOrNull() is PonteServer.AccessoScaduto)
    }

    @Test
    fun `il rimbalzo 302 di Google si segue con una GET, senza forzare la POST`() = runBlocking {
        rispostaGoogle = { v ->
            if (v.percorso.endsWith("/exec")) MockResponse().setResponseCode(302).setHeader("Location", google.url("/macros/echo?user_content_key=abc").toString())
            else json("""{"ok":true,"da":"googleusercontent"}""")
        }
        val r = ponte(conCasa = false).scriviAzione(JSONObject().put("azione", "salvaOre"))
        assertEquals("googleusercontent", r.getString("da"))
        assertEquals(listOf("POST", "GET"), vistiGoogle.map { it.r.method })
        assertEquals("/macros/echo", vistiGoogle[1].percorso)
    }

    // ------------------------------------------------------------- i file

    @Test
    fun `un file via Google arriva in base64, coi codici di casa nel campo stato`() = runBlocking {
        val p = ponte(conCasa = false)
        rispostaGoogle = { json(JSONObject().put("ok", true).put("nome", "Schema.pdf").put("mime", "application/pdf").put("byte", 3).put("base64", Base64.getEncoder().encodeToString("abc".toByteArray()))) }
        val (byte, mime) = p.file("aB3dE5fG")
        assertArrayEquals("abc".toByteArray(), byte)
        assertEquals("application/pdf", mime)
        val g = vistiGoogle.single().json()
        assertEquals("file", g.getString("strada"))
        assertEquals("aB3dE5fG", g.getString("file"))
        assertEquals(token, g.getString("token"))
        assertEquals("tel-prova", g.getString("disp"))
        assertEquals("Telefono di prova", g.getString("dispNome"))

        suspend fun conStato(stato: Int, errore: String): Throwable? {
            rispostaGoogle = { json(JSONObject().put("ok", false).put("stato", stato).put("errore", errore)) }
            return runCatching { p.file("aB3dE5fG") }.exceptionOrNull()
        }
        assertTrue(conStato(401, "Accesso scaduto: entra di nuovo") is PonteServer.AccessoScaduto)
        assertTrue(conStato(403, "Non hai il permesso") is PonteServer.PermessoNegato)
        val nonCe = conStato(404, "File non trovato")
        assertTrue(nonCe is PonteServer.Rifiutato && nonCe !is PonteServer.PermessoNegato)
        val grande = conStato(413, "Il file è troppo grande per passare da Google (più di 25 MB): aprilo quando sei in ufficio")
        assertTrue(grande is PonteServer.SoloInUfficio)
        assertEquals("si apre dall'ufficio: e' la rete, non un no", Archivio.Esito.RETE, Archivio.esitoDi(grande as Exception))
        rispostaGoogle = { json("""{"ok":false,"rete":true,"porta":"spento","errore":"Il server dello studio non risponde dalle 10:42: riprova più tardi"}""") }
        assertEquals("spento", (runCatching { p.file("aB3dE5fG") }.exceptionOrNull() as PonteServer.ServizioNonRaggiunto).porta)
    }

    @Test
    fun `carica via Google, la query, chi sono e il file in base64`() = runBlocking {
        rispostaGoogle = { json("""{"ok":true,"file":{"id":"f-1","nome":"Schema.pdf","byte":5}}""") }
        val dati = byteArrayOf(37, 80, 68, 70, 0)
        val r = IdRichiesta.perOperazione("op-carica") { ponte(conCasa = false).carica("Schema quadro.pdf", "application/pdf", "F-123", "documento", dati) }
        assertEquals("f-1", r.getJSONObject("file").getString("id"))
        val g = vistiGoogle.single().json()
        assertEquals("carica", g.getString("strada"))
        val q = g.getJSONObject("query")
        assertEquals("Schema quadro.pdf", q.getString("nome"))
        assertEquals("application/pdf", q.getString("mime"))
        assertEquals("F-123", q.getString("idFile"))
        assertEquals("documento", q.getString("per"))
        assertArrayEquals(dati, Base64.getDecoder().decode(g.getString("base64")))
        assertEquals("tel-prova", g.getString("disp"))
        assertEquals("telefono prove", g.getString("app"))
        // Ripetuta dalla coda: lo stesso id.
        IdRichiesta.perOperazione("op-carica") { ponte(conCasa = false).carica("Schema quadro.pdf", "application/pdf", "F-123", "documento", dati) }
        assertEquals(idGoogle()[0], idGoogle()[1])
    }

    @Test
    fun `i file grandi, oltre 26 MB non si mandano a Google ma la coda li tiene, e da casa partono`() = runBlocking {
        // Il limite e' uno solo: 26.000.000 byte (§14bis). Un byte in piu' non parte.
        val grande = ByteArray((Strade.FILE_MASSIMO_GOOGLE + 1).toInt()) { (it % 251).toByte() }
        val soloGoogle = runCatching { ponte(conCasa = false).carica("Tavola.pdf", "application/pdf", "F-g", "documento", grande) }.exceptionOrNull()
        assertTrue(soloGoogle is PonteServer.SoloInUfficio)
        assertEquals("le parole dello script e del computer", "La richiesta è troppo grande per passare da Google (al massimo 26 MB): mandala quando sei in ufficio", soloGoogle!!.message)
        assertEquals("non e' un no: la coda la tiene per l'ufficio", Archivio.Esito.RETE, Archivio.esitoDi(soloGoogle as Exception))
        assertTrue("non si manda neanche", vistiGoogle.isEmpty())
        assertTrue(Archivio.motivoNonPartite(soloGoogle).contains("quando sei in ufficio"))
        // In ufficio (firma giusta) la strada di casa non ha il limite.
        rispostaCasa = { json("""{"ok":true,"file":{"id":"f-grande"}}""") }
        val r = ponte().carica("Tavola.pdf", "application/pdf", "F-g", "documento", grande)
        assertEquals("f-grande", r.getJSONObject("file").getString("id"))
        assertEquals(grande.size, execDiCasa().single().byte.size)
        assertEquals("/carica", execDiCasa().single().percorso)
        // Se lo dice lo script (senza rete): lo stesso, si tiene per l'ufficio.
        rispostaGoogle = { json("""{"ok":false,"errore":"La richiesta è troppo grande per passare da Google (al massimo 26 MB): mandala quando sei in ufficio"}""") }
        assertTrue(runCatching { ponte(conCasa = false).scriviAzione(JSONObject().put("azione", "inviaEmail")) }.exceptionOrNull() is PonteServer.SoloInUfficio)
    }

    @Test
    fun `carica manda sempre idFile, e senza ne nasce uno uguale a ogni tentativo`() = runBlocking {
        rispostaGoogle = { json("""{"ok":true,"file":{"id":"f-1"}}""") }
        val p = ponte(conCasa = false)
        val dati = byteArrayOf(1, 2, 3)
        IdRichiesta.perOperazione("op-senza-idfile") { p.carica("Foto.jpg", "image/jpeg", "", "ticket", dati) }
        IdRichiesta.perOperazione("op-senza-idfile") { p.carica("Foto.jpg", "image/jpeg", "", "ticket", dati) }
        val (a, b) = vistiGoogle.map { it.json().getJSONObject("query").getString("idFile") }
        assertTrue(a, a.startsWith("tel-"))
        assertEquals("ripetuta dalla coda: lo stesso idFile", a, b)
        // A casa lo stesso: idFile nella query di /carica.
        rispostaCasa = { json("""{"ok":true,"file":{"id":"f-2"}}""") }
        ponte().carica("Foto.jpg", "image/jpeg", "", "ticket", dati)
        assertTrue(execDiCasa().single().r.requestUrl!!.queryParameter("idFile")!!.startsWith("tel-"))
        // Quello dato da chi chiama resta quello.
        ponte(conCasa = false).carica("Foto.jpg", "image/jpeg", "F-mio", "ticket", dati)
        assertEquals("F-mio", vistiGoogle.last().json().getJSONObject("query").getString("idFile"))
    }

    @Test
    fun `i file da casa, 401 403 404 sono risposte del server, solo 5xx e niente risposta sono la rete`() = runBlocking {
        val p = ponte()
        rispostaGoogle = { json(JSONObject().put("ok", true).put("mime", "image/png").put("base64", Base64.getEncoder().encodeToString(byteArrayOf(9)))) }
        rispostaCasa = { MockResponse().setResponseCode(404).setBody("""{"ok":false,"errore":"File non trovato"}""") }
        assertTrue(runCatching { p.file("abc") }.exceptionOrNull() is PonteServer.Rifiutato)
        rispostaCasa = { MockResponse().setResponseCode(403).setBody("""{"ok":false,"permesso":false}""") }
        assertTrue(runCatching { p.file("abc") }.exceptionOrNull() is PonteServer.PermessoNegato)
        rispostaCasa = { MockResponse().setResponseCode(401).setBody("""{"ok":false,"accesso":false}""") }
        assertTrue(runCatching { p.file("abc") }.exceptionOrNull() is PonteServer.AccessoScaduto)
        assertTrue("una risposta del server non si rifà via Google", vistiGoogle.isEmpty())
        // 503 (il server sta ripartendo): la rete, e la stessa richiesta passa da Google.
        rispostaCasa = { MockResponse().setResponseCode(503).setBody("") }
        val (byte, mime) = p.file("abc")
        assertArrayEquals(byteArrayOf(9), byte)
        assertEquals("image/png", mime)
        assertEquals(1, vistiGoogle.size)
    }

    @Test
    fun `i caratteri contano come li conta lo script`() {
        assertEquals(4L, Strade.caratteriPerGoogle("abcd"))
        assertEquals("la e accentata diventa \\u00e8", 10L, Strade.caratteriPerGoogle("caffè"))
    }

    // ------------------------------------------------------------- gli indirizzi detti in italiano

    @Test
    fun `i due indirizzi in italiano semplice`() {
        assertEquals("192.168.1.51", Indirizzi.breve("http://192.168.1.51:8400"))
        assertEquals("10.0.2.2:8450", Indirizzi.breve("http://10.0.2.2:8450/"))
        assertEquals("10.0.2.2", Indirizzi.breve("http://10.0.2.2:8400/exec"))
        assertEquals("Da fuori: Google · In casa: 192.168.1.51", Indirizzi.descrivi("http://192.168.1.51:8400", "https://script.google.com/macros/s/x/exec"))
        assertEquals("Solo in casa: 10.0.2.2:8450", Indirizzi.descrivi("http://10.0.2.2:8450", ""))
        assertEquals("Solo da fuori: Google", Indirizzi.descrivi("", "https://script.google.com/macros/s/x/exec"))
        assertFalse("l'indirizzo dello script non si mostra", Indirizzi.descrivi("http://192.168.1.51:8400", "https://script.google.com/macros/s/x/exec").contains("script"))
    }

    @Test
    fun `i controlli degli indirizzi`() {
        val soloCasa = { host: String -> host == "192.168.1.51" }
        assertEquals("Serve almeno un indirizzo: quello di Google o quello di casa.", Indirizzi.controlla("", " ", soloCasa))
        assertNull(Indirizzi.controlla(Indirizzi.CASA_DI_BASE, "https://script.google.com/macros/s/x/exec", soloCasa))
        assertNull(Indirizzi.controlla("", "https://script.google.com/macros/s/x/exec", soloCasa))
        assertNull(Indirizzi.controlla(Indirizzi.CASA_DI_BASE, "", soloCasa))
        assertTrue(Indirizzi.controlla(Indirizzi.CASA_DI_BASE, "http://script.google.com/macros/s/x/exec", soloCasa)!!.contains("https://"))
        assertTrue(Indirizzi.controlla("http://192.168.1.60:8400", "", soloCasa)!!.contains("192.168.1.51"))
        assertTrue(Indirizzi.controlla("non un indirizzo", "", soloCasa)!!.contains("non è valido"))
        // Le build di prova parlano in chiaro anche con 10.0.2.2 (il finto Google e il server di prova).
        val prove = { host: String -> host == "192.168.1.51" || host == "10.0.2.2" }
        assertNull(Indirizzi.controlla("http://10.0.2.2:8450", "http://10.0.2.2:8766/exec", prove))
    }
}
