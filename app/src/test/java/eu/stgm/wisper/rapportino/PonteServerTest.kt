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
 * Il collegamento col server (docs/gestionale/architettura.md §2, §12). Qui al
 * posto del server c'e' un intercettore che risponde e si tiene le richieste.
 *
 * Le azioni di sempre devono mandare esattamente i campi che manda il computer
 * (pc/ui/app.js) e che legge lo script (apps-script/Code.gs): il server risponde
 * con gli stessi. Ogni richiesta porta il token (Authorization: Bearer).
 */
class PonteServerTest {
    private val viste = mutableListOf<Request>()

    /** La risposta del finto server: le prove la cambiano secondo l'azione. */
    private var risposta = """{"ok":true,"rapportini":[]}"""
    private var codiceHttp = 200
    private var byteRisposta: ByteArray? = null
    private var tipoRisposta = "application/json"
    private var token = "token-di-prova"

    private val client = OkHttpClient.Builder().addInterceptor { catena ->
        viste += catena.request()
        Response.Builder()
            .request(catena.request()).protocol(Protocol.HTTP_1_1).code(codiceHttp).message("OK")
            .body((byteRisposta ?: risposta.toByteArray()).toResponseBody(tipoRisposta.toMediaType()))
            .build()
    }.build()

    private val ponte = PonteServer(
        indirizzo = { "https://wisper.example.com" },
        token = { token },
        chiSono = { mapOf("disp" to "id-di-prova", "dispNome" to "motorola edge 60 pro", "app" to "telefono 0.5.0") },
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
        assertEquals("telefono 0.5.0", u.queryParameter("app"))
        assertEquals("rapportini", u.queryParameter("azione"))
        assertEquals("/exec", u.encodedPath)
        assertEquals("Bearer token-di-prova", viste.single().header("Authorization"))
        assertFalse(u.queryParameterNames.contains("codice"))
    }

    @Test
    fun `una scrittura porta il dispositivo nel corpo`() {
        // La risposta finta non ha il rapportino, quindi stato() fallisce dopo: conta la richiesta partita.
        runCatching { runBlocking { ponte.stato("RAP/2026/0001", Stato.INVIATO) } }
        val o = corpo()
        assertEquals("id-di-prova", o.getString("disp"))
        assertEquals("motorola edge 60 pro", o.getString("dispNome"))
        assertEquals("telefono 0.5.0", o.getString("app"))
        assertEquals("stato", o.getString("azione"))
        assertEquals("POST", viste.single().method)
        assertEquals("Bearer token-di-prova", viste.single().header("Authorization"))
        assertFalse(o.has("codice"))
    }

    @Test
    fun `senza chi sono non si aggiunge niente`() = runBlocking {
        PonteServer({ "https://wisper.example.com" }, { "t" }, client = client)
            .rapportini(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31))
        assertFalse(viste.single().url.queryParameterNames.contains("disp"))
    }

    @Test
    fun `l'indirizzo va bene anche con exec in fondo`() = runBlocking {
        PonteServer({ "http://10.0.2.2:8400/exec/" }, { "t" }, client = client).rapportiniTutti()
        assertEquals("http://10.0.2.2:8400/exec?azione=rapportini", viste.single().url.toString())
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
    fun `un file arriva coi suoi byte da file id, col token`() = runBlocking {
        val byte = byteArrayOf(1, 2, 3, 4, 5)
        byteRisposta = byte
        tipoRisposta = "image/png"
        val (dati, mime) = ponte.file("1AbCdEfGhIjK")
        val r = viste.single()
        assertEquals("/file/1AbCdEfGhIjK", r.url.encodedPath)
        assertEquals("GET", r.method)
        assertEquals("Bearer token-di-prova", r.header("Authorization"))
        assertArrayEquals(byte, dati)
        assertEquals("image/png", mime)
    }

    @Test
    fun `un file senza accesso, senza permesso, che non c'e'`() {
        codiceHttp = 401
        assertTrue(runCatching { runBlocking { ponte.file("abc") } }.exceptionOrNull() is PonteServer.AccessoScaduto)
        codiceHttp = 403
        assertTrue(runCatching { runBlocking { ponte.file("abc") } }.exceptionOrNull() is PonteServer.PermessoNegato)
        codiceHttp = 404
        val e = runCatching { runBlocking { ponte.file("abc") } }.exceptionOrNull()
        assertTrue(e is PonteServer.Rifiutato && e !is PonteServer.PermessoNegato)
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
        assertTrue(e is PonteServer.Rifiutato)
        assertFalse(e is PonteServer.PermessoNegato)
        assertEquals("Il codice 26ST001 e' gia' di un'altra commessa", e!!.message)
        assertEquals(1, viste.size)
    }

    // ------------------------------------------------------------- accesso (§12.2)

    @Test
    fun `accedi manda email, password e dispositivo, senza token`() = runBlocking {
        token = ""
        risposta = """{"ok":true,"token":"nuovo-token","utente":{"id":1,"nome":"Manuel Gasparotto","email":"manuel@esempio.it","ruolo":"titolare"},
            "permessi":{"dashboard":2,"rapportini":2,"costi":2},"sessione":1}"""
        val a = ponte.accedi(" manuel@esempio.it ", "prova")
        val r = viste.single()
        assertEquals("POST", r.method)
        assertEquals(null, r.header("Authorization"))
        val o = corpo()
        assertEquals("accedi", o.getString("azione"))
        assertEquals("manuel@esempio.it", o.getString("email"))
        assertEquals("prova", o.getString("password"))
        assertEquals("id-di-prova", o.getString("disp"))
        assertEquals("nuovo-token", a.token)
        assertEquals("1", a.utente.id)
        assertEquals(Ruoli.TITOLARE, a.utente.ruolo)
        assertTrue(a.permessi.costi)
    }

    @Test
    fun `password sbagliata, un no col messaggio del server`() {
        token = ""
        risposta = """{"ok":false,"errore":"Email o password sbagliate"}"""
        val e = runCatching { runBlocking { ponte.accedi("manuel@esempio.it", "x") } }.exceptionOrNull()
        assertTrue(e is PonteServer.Rifiutato)
        assertEquals("Email o password sbagliate", e!!.message)
    }

    @Test
    fun `io dice chi sono, il titolare e se vedo solo i miei`() = runBlocking {
        risposta = """{"ok":true,"utente":{"id":3,"nome":"Marco Collaboratore","email":"marco@esempio.it","ruolo":"collaboratore"},
            "permessi":{"dashboard":1,"rapportini":2,"costi":0},"titolare":"Manuel Gasparotto","ragioneSociale":"Studio Tecnico GM",
            "interfaccia":{"ticketAttivo":false,"tecnico":"Marco Collaboratore","soloSuoi":true}}"""
        val io = ponte.io()
        assertEquals("io", viste.single().url.queryParameter("azione"))
        assertEquals("Manuel Gasparotto", io.titolare)
        assertEquals("Studio Tecnico GM", io.ragioneSociale)
        assertTrue(io.soloSuoi)
        assertFalse(io.permessi.costi)
        assertEquals("Marco Collaboratore", io.tecnico)
    }

    @Test
    fun `accesso scaduto non e' un no sul rapportino`() {
        risposta = """{"ok":false,"errore":"Accesso scaduto: entra di nuovo","accesso":false}"""
        val e = runCatching { runBlocking { ponte.salva(Rapportino("W-1", LocalDate.of(2026, 10, 21))) } }.exceptionOrNull()
        assertTrue(e is PonteServer.AccessoScaduto)
        assertFalse(e is PonteServer.Rifiutato)
    }

    @Test
    fun `senza token non si chiama nemmeno, e la coda aspetta`() {
        token = ""
        val e = runCatching { runBlocking { ponte.anagrafiche() } }.exceptionOrNull()
        assertTrue(e is PonteServer.AccessoScaduto)
        assertTrue(viste.isEmpty())
    }

    @Test
    fun `permesso mancante e' un no, la rete dietro al server si riprova`() {
        risposta = """{"ok":false,"errore":"Non hai il permesso per scrivere i rapportini: chiedi al titolare","permesso":false}"""
        val e = runCatching { runBlocking { ponte.stato("RAP/2026/0001", Stato.FATTURATO) } }.exceptionOrNull()
        assertTrue(e is PonteServer.PermessoNegato)
        assertTrue(e is PonteServer.Rifiutato)
        assertEquals("Non hai il permesso per scrivere i rapportini: chiedi al titolare", e!!.message)
        risposta = """{"ok":false,"errore":"Il servizio europeo non risponde: riprova più tardi","rete":true}"""
        val r = runCatching { runBlocking { ponte.controllaPartitaIva("01234567897") } }.exceptionOrNull()
        assertTrue(r is java.io.IOException)
        assertFalse(r is PonteServer.Rifiutato)
    }

    @Test
    fun `cosa fa la coda dopo ogni errore`() {
        assertEquals(eu.stgm.wisper.Archivio.Esito.ACCESSO, eu.stgm.wisper.Archivio.esitoDi(PonteServer.AccessoScaduto()))
        assertEquals(eu.stgm.wisper.Archivio.Esito.RIFIUTATO, eu.stgm.wisper.Archivio.esitoDi(PonteServer.PermessoNegato("no")))
        assertEquals(eu.stgm.wisper.Archivio.Esito.RIFIUTATO, eu.stgm.wisper.Archivio.esitoDi(PonteServer.Rifiutato("no")))
        assertEquals(eu.stgm.wisper.Archivio.Esito.RETE, eu.stgm.wisper.Archivio.esitoDi(java.io.IOException("HTTP 502")))
        assertEquals(eu.stgm.wisper.Archivio.Esito.RETE, eu.stgm.wisper.Archivio.esitoDi(PonteServer.ServizioNonRaggiunto("postino")))
    }

    // ------------------------------------------------------------- il gestionale (§12.3-12.14)

    @Test
    fun `le anagrafiche si chiedono con archiviati e modelli`() = runBlocking {
        risposta = """{"ok":true,"clienti":[],"commesse":[],"gruppi":[],"impostazioni":{}}"""
        ponte.anagrafiche()
        val u = viste.single().url
        assertEquals("anagrafiche", u.queryParameter("azione"))
        assertEquals("1", u.queryParameter("archiviati"))
        assertEquals("1", u.queryParameter("modelli"))
    }

    @Test
    fun `salvaSoggetto manda le tariffe solo con i soldi`() = runBlocking {
        risposta = """{"ok":true,"soggetto":{"giaEsisteva":false,"id":"C003","nome":"Verdi Srl","cliente":true,"fornitore":false,"codiceSdi":"ABC1234"}}"""
        val c = Cliente("", "Verdi Srl", codiceSdi = "abc1234", partitaIva = "01234567897", tariffaFissa = 30.0, citta = "Thiene")
        val s = ponte.salvaSoggetto(c, nuovo = true, costi = false)
        var o = corpo().getJSONObject("soggetto")
        assertEquals("salvaSoggetto", corpo().getString("azione"))
        assertFalse(o.has("id"))
        assertFalse(o.has("tariffaFissa"))
        assertFalse(o.has("ultimaTariffa"))
        assertTrue(o.getBoolean("cliente"))
        assertEquals("Thiene", o.getString("citta"))
        assertEquals("IT", o.getString("nazione"))
        assertEquals("C003", s.dato.id)
        assertFalse(s.giaEsisteva)

        ponte.salvaSoggetto(c.copy(id = "C003"), nuovo = false, costi = true)
        o = corpo().getJSONObject("soggetto")
        assertEquals("C003", o.getString("id"))
        assertEquals(30.0, o.getDouble("tariffaFissa"), 0.0)
        assertTrue(o.isNull("costoFisso"))
    }

    @Test
    fun `una commessa porta sede, responsabile e persone come numeri, i soldi solo se si vedono`() = runBlocking {
        risposta = """{"ok":true,"commessa":{"id":"26ST003","idCliente":"C001","descrizione":"Quadro","sedeId":2,"responsabileId":1,"persone":[3],"importoContratto":1200}}"""
        val m = Commessa("", "C001", "Quadro", idSede = "2", idResponsabile = "1", persone = listOf("3"), importoContratto = 1200.0, prezzoOrario = 40.0)
        val s = ponte.creaCommessa(m, Cliente("C001", "Rossi"), costi = true)
        var o = corpo()
        assertEquals(2, o.getInt("sedeId"))
        assertEquals(1, o.getInt("responsabileId"))
        assertEquals(3, o.getJSONArray("persone").getInt(0))
        assertEquals(1200.0, o.getDouble("importoContratto"), 0.0)
        assertEquals(listOf("3"), s.dato.persone)
        assertEquals("2", s.dato.idSede)

        ponte.aggiornaCommessa(m.copy(id = "26ST003", idSede = "", idResponsabile = ""), costi = false)
        o = corpo().getJSONObject("campi")
        assertTrue(o.isNull("sedeId"))
        assertTrue(o.isNull("responsabileId"))
        assertFalse(o.has("importoContratto"))
        assertFalse(o.has("prezzoOrario"))
        assertFalse(o.has("budgetEuro"))
    }

    @Test
    fun `referenti, sedi, prestazioni e ordine`() = runBlocking {
        risposta = """{"ok":true,"referente":{"id":4,"idSoggetto":"C002","nome":"Anna Rossi","ruolo":"Acquisti","telefono":"0445 000004","ordine":2}}"""
        val r = ponte.salvaReferente(Referente("", "C002", "Anna Rossi", "Acquisti", telefono = "0445 000004"))
        assertFalse(corpo().getJSONObject("referente").has("id"))
        assertEquals("4", r.id)

        risposta = """{"ok":true,"sede":{"id":4,"idSoggetto":"C002","tipo":"impianto","nome":"Cabina MT","archiviata":true}}"""
        ponte.archiviaSede("4", true)
        assertEquals(4, corpo().getInt("id"))
        assertTrue(corpo().getBoolean("archiviata"))

        risposta = """{"ok":true,"prestazione":{"id":7,"idCommessa":"26ST002","nome":"Collaudo","valore":400,"avanzamento":50,"stato":"in_corso","ordine":4}}"""
        val p = ponte.salvaPrestazione(Prestazione("7", "26ST002", "Collaudo", valore = 400.0, avanzamento = 50, ordine = 4), costi = false)
        val o = corpo().getJSONObject("prestazione")
        assertEquals(7, o.getInt("id"))
        assertFalse(o.has("valore"))
        assertEquals(50, o.getInt("avanzamento"))
        assertEquals(Prestazione.IN_CORSO, p.stato)

        risposta = """{"ok":true,"prestazioni":[]}"""
        ponte.ordinaPrestazioni("26ST002", listOf("3", "2", "1"))
        assertEquals(listOf(3, 2, 1), (0 until 3).map { corpo().getJSONArray("ids").getInt(it) })
    }

    @Test
    fun `utente nuovo e password nuova, quella del server, coi trattini`() = runBlocking {
        risposta = """{"ok":true,"utente":{"id":5,"nome":"Giorgio Nuovo","email":"giorgio@esempio.it","ruolo":"collaboratore","attivo":true},"passwordIniziale":"G843-AMT3-44EV"}"""
        val s = ponte.salvaUtente(Utente("", "Giorgio Nuovo", "giorgio@esempio.it", Ruoli.COLLABORATORE))
        assertFalse(corpo().getJSONObject("utente").has("password"))
        assertEquals("G843-AMT3-44EV", s.password)
        assertEquals("5", s.utente.id)
        risposta = """{"ok":true,"passwordIniziale":"NRXF-MEWD-47K4"}"""
        assertEquals("NRXF-MEWD-47K4", ponte.nuovaPassword("5"))
        assertEquals(5, corpo().getInt("idUtente"))
    }

    @Test
    fun `un permesso cambiato, solo quello`() = runBlocking {
        risposta = """{"ok":true,"permessi":{"collaboratore":{"dashboard":1,"costi":1}}}"""
        val p = ponte.salvaPermesso("collaboratore", "costi", 1)
        assertEquals(1, corpo().getJSONObject("permessi").getJSONObject("collaboratore").getInt("costi"))
        assertTrue(p.getValue("collaboratore").costi)
    }

    @Test
    fun `il registro a pagine, e se ce ne sono altre`() = runBlocking {
        risposta = """{"ok":true,"pagina":1,"pagine":3,"quante":250,"righe":[{"id":18,"quando":"2026-10-21T22:30:15","utente":"Manuel Gasparotto",
            "azione":"salvaSoggetto","tabella":"soggetti","idRiga":"C002","prima":{"ultima_tariffa":40},"dopo":{"ultima_tariffa":42}}]}"""
        val p = ponte.registro(FiltroRegistro(utente = "2", tabella = "soggetti", giorni = 0))
        val u = viste.single().url
        assertEquals("1", u.queryParameter("pagina"))
        assertEquals("2", u.queryParameter("utente"))
        assertEquals("soggetti", u.queryParameter("tabella"))
        assertFalse(u.queryParameterNames.contains("da"))
        assertTrue(p.altre)
        assertEquals("40", p.voci.single().campi.single().prima)
    }

    @Test
    fun `il file per Excel arriva in base64, coi byte giusti`() = runBlocking {
        val csv = "﻿Codice;Nome\r\nC001;Elettrodinamica\r\n".toByteArray()
        risposta = """{"ok":true,"nome":"wisper-clienti-2026-10-21.csv","mime":"text/csv;charset=utf-8","righe":1,"base64":"${Base64.getEncoder().encodeToString(csv)}"}"""
        val (nome, mime, byte) = ponte.esporta("clienti")
        assertEquals("clienti", viste.single().url.queryParameter("cosa"))
        assertEquals("wisper-clienti-2026-10-21.csv", nome)
        assertTrue(mime.startsWith("text/csv"))
        assertArrayEquals(csv, byte)
    }

    @Test
    fun `cestino, copie e copia adesso`() = runBlocking {
        risposta = """{"ok":true,"file":[{"id":"D04y","nome":"RAP-2026-0007 spesa q.png","idRapportino":"RAP/2026/0007","cestinato":"2026-10-21T22:30:15"}]}"""
        assertEquals("RAP/2026/0007", ponte.cestino().single().daDove)
        risposta = """{"ok":true,"copie":[{"id":1,"quando":"2026-10-21T02:30:00","byte":221184,"locale":"ok","fuori":"ok · 1 file","foglio":"ok","nota":"notturna"}]}"""
        assertTrue(ponte.copie().ultima!!.riuscita)
        risposta = """{"ok":true,"copia":{"id":2,"quando":"2026-10-21T22:30:15","byte":221184,"locale":"ok","fuori":"postino non collegato","foglio":"postino non collegato","nota":"a mano"}}"""
        val k = ponte.copiaAdesso()
        assertEquals("POST", viste.last().method)
        assertTrue(k.riuscita)
    }
}
