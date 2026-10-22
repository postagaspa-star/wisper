package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.LocalDateTime

/**
 * Le regole della fase 5 che il telefono rifà (fase5.md §5.1, §7.2, §3.9):
 * priorità, tempi, tipo del collegamento coi casi condivisi del server, i ticket
 * con sopra la coda (nato senza rete, Prendo io, foto, rapportino, Il lavoro è
 * finito), la coda su disco e l'invio senza doppioni, le letture del server.
 */
class TicketTest {
    @get:Rule val cartella = TemporaryFolder()

    private fun casi(nome: String): JSONObject? =
        listOf("../server/prove/$nome", "server/prove/$nome").map(::File).firstOrNull { it.exists() }?.let { JSONObject(it.readText()) }

    // ---------------------------------------------------------------------------------- casi condivisi

    @Test
    fun `la priorita dalle due domande, come casi-ticket json`() {
        val c = casi("casi-ticket.json")
        assumeTrue("Manca server/prove/casi-ticket.json", c != null)
        val p = c!!.getJSONArray("priorita").oggetti()
        assertEquals(10, p.size)
        p.forEach { x -> assertEquals("${x.testo("impatto")} + ${x.testo("urgenza")}", x.testo("atteso"), ContiTicket.prioritaDa(x.testo("impatto"), x.testo("urgenza"))) }
        // "Cambia": la scritta a mano vince, le risposte restano (lo fa il server; qui la matrice dice urgente).
        val cambia = c.getJSONObject("cambia")
        assertEquals("urgente", ContiTicket.prioritaDa(cambia.testo("impatto"), cambia.testo("urgenza")))
        assertEquals("bassa", cambia.getJSONObject("atteso").testo("priorita"))
    }

    @Test
    fun `i tempi in ore di calendario, col cambio dell'ora e coi tempi del contratto`() {
        val c = casi("casi-ticket.json")
        assumeTrue("Manca server/prove/casi-ticket.json", c != null)
        val t = c!!.getJSONObject("tempi")
        val studio = t.getJSONObject("studio").toString()
        t.getJSONArray("casi").oggetti().forEach { x ->
            val tempi = ContiTicket.tempi(studio, x.optJSONObject("contratto"))
            val (presa, intervento) = ContiTicket.entro(x.testo("apertoIl"), x.testo("priorita"), tempi)
            val atteso = x.getJSONObject("atteso")
            assertEquals("${x.testo("apertoIl")} presa", atteso.testo("entroPresa"), presa)
            assertEquals("${x.testo("apertoIl")} intervento", atteso.testo("entroIntervento"), intervento)
        }
    }

    @Test
    fun `il tipo del collegamento, come casi-collegamenti json`() {
        val c = casi("casi-collegamenti.json")
        assumeTrue("Manca server/prove/casi-collegamenti.json", c != null)
        assertEquals(c!!.testo("frase"), Collegamenti.ERRORE)
        c.getJSONArray("casi").oggetti().forEach { x ->
            val t = Collegamenti.tipo(x.optString("url"))
            assertNotNull(x.testo("nome"), t)
            assertEquals(x.testo("nome"), x.testo("tipo"), t!!.tipo)
            assertEquals(x.testo("nome") + ": cartella", x.optBoolean("cartella"), t.cartella)
            assertEquals(x.testo("nome") + ": pillola", x.testo("pillola"), t.pillola)
            if (x.has("salvato")) assertEquals(x.testo("salvato"), t.url)
        }
        c.getJSONArray("rifiutati").oggetti().forEach { x -> assertNull(x.testo("nome"), Collegamenti.tipo(x.optString("url"))) }
    }

    @Test
    fun `il collegamento dentro un testo condiviso e il titolo proposto`() {
        assertEquals("https://1drv.ms/f/s!AbCdEf", Collegamenti.daTestoCondiviso("Guarda la cartella: https://1drv.ms/f/s!AbCdEf."))
        assertEquals("\\\\SERVER\\Archivio\\2019", Collegamenti.daTestoCondiviso("\\\\SERVER\\Archivio\\2019"))
        assertNull(Collegamenti.daTestoCondiviso("solo testo"))
        assertEquals("Schema unifilare", Collegamenti.titoloProposto("https://www.esempio.example/docs/schema_unifilare.pdf"))
        assertEquals("Apri in OneDrive", Collegamenti.apriCon("onedrive"))
        assertNull(Collegamenti.apriCon("percorso"))
    }

    @Test
    fun `la ricerca senza accenti, maiuscole e spazi doppi`() {
        assertEquals("verifica di conformita", pulisciRicerca("  Verifica   di CONFORMITÀ "))
    }

    // ---------------------------------------------------------------------------------- il giallo e il numero

    private fun ticket(stato: String, resp: String = "", rapportini: List<RapportinoTicket> = emptyList(), interventi: List<Attivita> = emptyList()) =
        Ticket(id = "17", numero = "TK/2026/0017", stato = stato, responsabileId = resp, rapportini = rapportini, interventi = interventi)

    @Test
    fun `il pulsante giallo segue lo stato, come il server`() {
        val adesso = LocalDateTime.of(2026, 10, 22, 10, 0)
        assertEquals("prendi", ContiTicket.giallo(ticket("aperto"), "1", false, true, true, adesso))
        assertEquals("pianifica", ContiTicket.giallo(ticket("in_carico", "1"), "1", false, true, true, adesso))
        val oggi = Attivita(id = "9", titolo = "x", tipo = TipoAttivita.INTERVENTO, inizio = adesso.minusHours(1))
        assertEquals("rapportino", ContiTicket.giallo(ticket("in_carico", "1", interventi = listOf(oggi)), "1", false, true, true, adesso))
        val domani = oggi.copy(inizio = adesso.plusDays(1))
        assertEquals("", ContiTicket.giallo(ticket("in_carico", "1", interventi = listOf(domani)), "1", false, true, true, adesso))
        val firmato = RapportinoTicket("RAP/2026/0016", "2026-10-22", stato = "FIRMATO")
        assertEquals("risolvi", ContiTicket.giallo(ticket("in_carico", "1", rapportini = listOf(firmato)), "1", false, true, true, adesso))
        assertEquals("chiudi", ContiTicket.giallo(ticket("risolto", "1"), "1", false, true, true, adesso))
        assertEquals("", ContiTicket.giallo(ticket("risolto", "3"), "3", true, true, false, adesso))
        assertEquals("riprendi", ContiTicket.giallo(ticket("in_attesa", "1"), "1", false, true, true, adesso))
        // Il collaboratore non scrive i ticket degli altri; la lettura mai.
        assertEquals("", ContiTicket.giallo(ticket("in_carico", "1"), "3", true, true, false, adesso))
        assertEquals("", ContiTicket.giallo(ticket("aperto"), "4", false, false, false, adesso))
    }

    @Test
    fun `il numero proposto senza rete viene dalla numerazione`() {
        val n = Numerazione("ticket", "TK/{AAAA}/{NNNN}", ultimo = 16, annuale = true, prossimo = "TK/2026/0017")
        assertEquals("TK/2026/0017", ContiTicket.numeroProposto(n, 2026))
        assertEquals("TK/2027/0001", ContiTicket.numeroProposto(n, 2027))
        assertEquals("", ContiTicket.numeroProposto(null, 2026))
    }

    // ---------------------------------------------------------------------------------- la coda

    private val chi = TicketInCoda.Chi("1", "Manuel Gasparotto", soloSuoi = false, scrive = true, chiude = true)
    private val ana = Anagrafiche(
        clienti = listOf(Cliente("C002", "Rossi Impianti Srl")),
        sedi = listOf(Sede("5", "C002", "impianto", "Quadro generale capannone", indirizzo = "Via delle Prove 5", citta = "Thiene")),
        impostazioni = mapOf("TICKET_TEMPI" to """{"urgente":{"presa":1,"intervento":4}}"""),
    )

    private fun nuovoInCoda(coda: CodaInvii, chiave: String = "T-prova1"): CodaInvii.Operazione = coda.ticket(
        chiave,
        JSONObject().put("idLocale", chiave).put("numero", "TK/2026/0017").put("idCliente", "C002").put("idSede", 5).put("titolo", "Scatta il generale")
            .put("impatto", "fermo").put("urgenza", "subito").put("origine", "telefono").put("apertoIl", "2026-10-22T08:40:00"),
    )

    @Test
    fun `il ticket nato senza rete si vede subito, col numero proposto e i tempi`() {
        val coda = CodaInvii(cartella.newFile("coda.json").apply { delete() })
        nuovoInCoda(coda)
        // Salvato due volte prima di partire: un posto solo nella coda.
        nuovoInCoda(coda)
        assertEquals(1, coda.tutte().count { it.tipo == CodaInvii.Tipo.TICKET })
        val l = TicketInCoda.elenco(emptyList(), coda.tutte(), emptyList(), ana, chi)
        assertEquals(1, l.size)
        val t = l.single()
        assertEquals("TK/2026/0017", t.numero)
        assertEquals("T-prova1", t.chiave)
        assertEquals("Rossi Impianti Srl", t.cliente)
        assertEquals("Quadro generale capannone", t.impianto)
        assertEquals("urgente", t.priorita)
        assertEquals("aperto", t.stato)
        assertEquals("2026-10-22T09:40:00", t.entroPresa)
        assertEquals("2026-10-22T12:40:00", t.entroIntervento)
        assertTrue(t.inCoda)
        assertEquals("prendi", t.giallo)
        assertEquals("Aperto da Manuel Gasparotto (telefono)", t.cronologia.single().testo)
    }

    @Test
    fun `Prendo io, la foto, il rapportino firmato e Il lavoro e finito, tutto senza rete`() {
        val coda = CodaInvii(cartella.newFile("coda.json").apply { delete() })
        nuovoInCoda(coda)
        coda.azioneTicket("T-prova1", JSONObject().put("azione", "prendiTicket"))
        val foto = cartella.newFile("guasto.jpg").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        coda.fotoTicket("T-prova1", "guasto", foto.path)
        var t = TicketInCoda.elenco(emptyList(), coda.tutte(), emptyList(), ana, chi).single()
        assertEquals("in_carico", t.stato)
        assertEquals("1", t.responsabileId)
        assertEquals("pianifica", t.giallo)
        assertEquals(1, t.foto.size)
        assertEquals(foto.path, t.foto.single().locale!!.path)

        // Il rapportino scritto dal ticket nato qui: con idLocaleTicket, firmato.
        val r = Rapportino.nuovo("Manuel Gasparotto").copy(idCliente = "C002", cliente = "Rossi Impianti Srl", idLocaleTicket = "T-prova1", oreLavoro = 2.0,
            stato = Stato.FIRMATO, firmatario = "Mario Bianchi", numeroTicket = "TK/2026/0017")
        assertEquals("T-prova1", r.perIlFoglio().testo("idLocaleTicket"))
        assertFalse(r.perIlFoglio().has("idTicket"))
        t = TicketInCoda.elenco(emptyList(), coda.tutte(), listOf(r to true), ana, chi).single()
        assertEquals(1, t.rapportini.size)
        assertTrue(t.rapportini.single().inCoda)
        assertEquals("risolvi", t.giallo)

        coda.azioneTicket("T-prova1", JSONObject().put("azione", "risolviTicket"))
        t = TicketInCoda.elenco(emptyList(), coda.tutte(), listOf(r to true), ana, chi).single()
        assertEquals("risolto", t.stato)
        assertEquals("chiudi", t.giallo)
        assertEquals("1 ticket e 1 rapportino partono appena c'è rete", TestiCoda.inAttesa(coda.tutte() + CodaInvii.Operazione("x", CodaInvii.Tipo.SALVA, r.idLocale, rapportino = r)))
        assertEquals("1 ticket parte appena c'è rete", TestiCoda.inAttesa(coda.tutte()))
    }

    @Test
    fun `un ticket gia arrivato non si vede due volte e prende le operazioni rimaste`() {
        val coda = CodaInvii(cartella.newFile("coda.json").apply { delete() })
        nuovoInCoda(coda)
        coda.azioneTicket("T-prova1", JSONObject().put("azione", "altroIntervento"))
        val dalServer = Ticket(id = "17", numero = "TK/2026/0017", idLocale = "T-prova1", titolo = "Scatta il generale", stato = "in_carico", responsabileId = "1", puoScrivere = true)
        val l = TicketInCoda.elenco(listOf(dalServer), coda.tutte(), emptyList(), ana, chi)
        assertEquals(1, l.size)
        assertEquals("17", l.single().id)
        assertEquals("Serve un altro intervento", l.single().cronologia.last().testo)
    }

    @Test
    fun `un rapportino gia partito non fa dire Parte appena c'e rete al ticket dell'elenco`() {
        // L'elenco non porta i rapportini: quello già sul server non è una novità (era il TK/2026/0012 sull'emulatore).
        val r = Rapportino.nuovo("Manuel Gasparotto").copy(id = "RAP/2026/0009", idTicket = "12", stato = Stato.FIRMATO)
        val risolto = Ticket(id = "12", numero = "TK/2026/0012", stato = "risolto", responsabileId = "1", puoScrivere = true)
        val t = TicketInCoda.elenco(listOf(risolto), emptyList(), listOf(r to false), ana, chi).single()
        assertFalse(t.inCoda)
        assertEquals("risolto", t.stato)
        // Lo stesso rapportino ancora in coda sì.
        assertTrue(TicketInCoda.elenco(listOf(risolto), emptyList(), listOf(r to true), ana, chi).single().inCoda)
    }

    @Test
    fun `la coda su disco tiene le operazioni dei ticket e quando sono state fatte`() {
        val f = cartella.newFile("coda.json").apply { delete() }
        val coda = CodaInvii(f)
        nuovoInCoda(coda)
        coda.faiScadenza("7", JSONObject().put("data", "2026-10-22"))
        val riletta = CodaInvii(f).tutte()
        assertEquals(listOf(CodaInvii.Tipo.TICKET, CodaInvii.Tipo.FAI_SCADENZA), riletta.map { it.tipo })
        assertTrue(riletta.all { it.fase5 && it.quando.isNotBlank() })
        assertEquals("scadenza:7", riletta[1].idLocale)
    }

    /** Un server finto che conta le scritture: per vedere che la coda manda le stesse cose ripetute uguali. */
    private class Finto : TrasportoFase5 {
        val scritte = ArrayList<JSONObject>()
        override suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>>) = JSONObject().put("ok", true)
        override suspend fun scriviAzione(corpo: JSONObject): JSONObject {
            scritte += corpo
            val r = JSONObject().put("ok", true)
            return when (corpo.testo("azione")) {
                "caricaFile" -> r.put("file", JSONObject().put("id", "F1").put("url", "/file/F1"))
                "faiScadenza" -> r.put("scadenza", JSONObject().put("id", corpo.testo("id")).put("stato", "fatta"))
                else -> r.put("ticket", JSONObject().put("id", 17).put("numero", "TK/2026/0017").put("idLocale", "T-prova1"))
            }
        }
        override suspend fun file(id: String): Pair<ByteArray, String> = ByteArray(0) to "application/octet-stream"
        override suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray) = JSONObject().put("ok", true)
    }

    @Test
    fun `la coda manda il ticket col suo idLocale, la foto col suo idFile, le azioni con la chiave`() = runBlocking {
        val coda = CodaInvii(cartella.newFile("coda.json").apply { delete() })
        val finto = Finto()
        val invio = InvioFase5(Fase5(finto))
        val op = nuovoInCoda(coda)
        invio.esegui(op)
        invio.esegui(op) // la rete era caduta dopo l'arrivo: si riprova uguale
        assertEquals(2, finto.scritte.size)
        assertTrue(finto.scritte.all { it.testo("azione") == "salvaTicket" && it.getJSONObject("ticket").testo("idLocale") == "T-prova1" })
        val prendi = coda.azioneTicket("T-prova1", JSONObject().put("azione", "prendiTicket"))
        invio.esegui(prendi)
        assertEquals("prendiTicket", finto.scritte.last().testo("azione"))
        assertEquals("T-prova1", finto.scritte.last().testo("id"))
        val foto = cartella.newFile("guasto.jpg").apply { writeBytes(byteArrayOf(9, 9)) }
        invio.esegui(coda.fotoTicket("T-prova1", "guasto-1", foto.path))
        assertEquals("ticket", finto.scritte.last().testo("tipo"))
        assertEquals("guasto-1", finto.scritte.last().testo("idFile"))
        invio.esegui(coda.faiScadenza("7", JSONObject().put("data", "2026-10-22")))
        assertEquals("faiScadenza", finto.scritte.last().testo("azione"))
        assertEquals(7, finto.scritte.last().getInt("id"))
    }

    // ---------------------------------------------------------------------------------- le letture

    @Test
    fun `un ticket letto dal server, coi nomi di architettura 16-11`() {
        val o = JSONObject("""{"id": 12, "numero": "TK/2026/0012", "titolo": "Inverter in errore di isolamento", "tipo": "guasto", "tipoNome": "Guasto",
            "idCliente": "C003", "cliente": "Mario Bianchi", "idSede": 8, "impianto": "Impianto fotovoltaico 6 kW", "idContratto": 3, "contratto": "CA/2025/004",
            "priorita": "normale", "prioritaNome": "Normale", "stato": "risolto", "statoVisto": "Risolto", "responsabileId": 1, "responsabile": "Manuel Gasparotto",
            "apertoIl": "2026-10-20T09:15:00", "rapportini": [{"id": "RAP/2026/0014", "data": "2026-10-21", "ore": 2.5, "km": 24, "stato": "FIRMATO", "firmatario": "Mario Bianchi", "apribile": true}],
            "spese": [{"id": 18, "importo": 18.5, "categoria": "materiale", "idTicket": 12, "ticket": "TK/2026/0012"}],
            "foto": [{"id": "abc", "url": "/file/abc", "nome": "Inverter.png", "mime": "image/png", "idDocumento": null}],
            "somma": {"ore": 2.5, "km": 24, "materiale": 18.5, "spese": 0, "costo": 66.74, "importo": 126.74},
            "proposta": {"fatturazione": "ticket", "perche": "Il contratto CA/2025/004 copre solo le visite"},
            "cronologia": [{"quando": "2026-10-20T09:15:00", "chi": "Manuel Gasparotto", "testo": "Aperto da Manuel Gasparotto (telefono)"}],
            "riservata": null, "puoChiudere": true, "giallo": "chiudi", "puoScrivere": true}""")
        val t = Ticket.daJson(o)
        assertTrue(t.dettaglio)
        assertEquals("12", t.id)
        assertEquals(1, t.quantiRapportini)
        assertTrue(t.rapportini.single().firmato)
        assertEquals("12", t.spese.single().idTicket)
        assertEquals(126.74, t.somma!!.importo!!, 0.0)
        assertEquals("ticket", t.proposta)
        assertEquals("chiudi", t.giallo)
        assertEquals("", t.riservata)
    }

    @Test
    fun `nella scelta di Da fatturare il ticket porta le sue spese anticipate`() {
        val tk = VoceDaFatturare("ticket", "TK/2026/0012", gruppo = "ticket:TK/2026/0012", idCliente = "C003", importo = 126.74)
        val anticipata = VoceDaFatturare("spesa", "41", gruppo = "ticket:TK/2026/0012", anticipazione = true, idCliente = "C003", importo = 30.0)
        val altra = VoceDaFatturare("rapportino", "RAP/2026/0003", idCliente = "C003", importo = 50.0)
        val tutte = listOf(tk, anticipata, altra)
        assertEquals(setOf("ticket:TK/2026/0012", "spesa:41"), SceltaDaFatturare.insieme(tk, tutte))
        assertEquals(setOf("ticket:TK/2026/0012", "spesa:41"), SceltaDaFatturare.insieme(anticipata, tutte))
        assertEquals(setOf("ticket:TK/2026/0012", "spesa:41"), SceltaDaFatturare.cambia(emptySet(), anticipata, tutte).scelte)
    }

    @Test
    fun `documento, scadenza e contratto letti dal server`() {
        val d = DocArchivio.daJson(JSONObject("""{"id": 1, "titolo": "Schema unifilare cabina MT", "origine": "file", "url": "/file/Nw1", "revisione": 2, "daApprovare": 3, "statoVisto": "Valida",
            "versioni": [{"id": 4, "numero": 3, "statoVisto": "Da approvare", "url": "/file/Pa4", "nomeFile": "rev3.pdf"}, {"id": 3, "numero": 2, "statoVisto": "Valida", "url": "/file/Nw1"}],
            "mieRespinte": [{"numero": 1, "motivo": "Manca la sezione"}]}"""))
        assertEquals("Nw1", d.idFile)
        assertEquals("4", d.versioneDaApprovare!!.id)
        assertEquals(3, d.daApprovare)
        assertEquals(1 to "Manca la sezione", d.mieRespinte.single())
        val col = DocArchivio.daJson(JSONObject("""{"id": 9, "titolo": "Schemi", "origine": "collegamento", "collegamentoTipo": "percorso", "url": "\\\\S\\A", "righe": ["Si apre dal computer dello studio"]}"""))
        assertTrue(col.collegamento)
        assertEquals("", col.idFile)
        assertEquals("Cartella del computer", col.collegamentoNome)
        val e = ElencoScadenze.daJson(JSONObject("""{"oggi": "2026-10-22", "scadute": [{"id": 7, "titolo": "Verifica protezioni SPG e SPI", "data": "2026-09-30", "ogniMesi": 60, "statoVisto": "Scaduta", "dallaFatta": true}], "entro": [], "piuAvanti": []}"""))
        assertEquals("ogni 5 anni", e.scadute.single().ogniParole)
        val k = Contratto.daJson(JSONObject("""{"id": 2, "numero": "CA/2026/002", "copre": "visite_guasti", "rate": [{"id": 14, "importo": 600, "stato": "fatturata", "statoVisto": "Fatturata fuori da Wisper"}], "rende": {"margine": 1200}}"""))
        assertEquals("Visite e guasti", k.copreParole)
        assertEquals(1200.0, k.rendeMargine!!, 0.0)
        assertNull(Contratto.daJson(JSONObject("""{"id": 2}""")).canone)
    }

    @Test
    fun `i colori delle parole della fase 5`() {
        assertEquals(ColoreFase5.ROSSO, ColoreFase5.di("Urgente"))
        assertEquals(ColoreFase5.ROSSO, ColoreFase5.di("Scaduta"))
        assertEquals(ColoreFase5.AMBRA, ColoreFase5.di("Scade fra 24 giorni"))
        assertEquals(ColoreFase5.GIALLO, ColoreFase5.di("Aperto"))
        assertEquals(ColoreFase5.BLU, ColoreFase5.di("In carico"))
        assertEquals(ColoreFase5.VERDE, ColoreFase5.di("Valida"))
        assertEquals(ColoreFase5.GRIGIO, ColoreFase5.di("Chiuso"))
    }
}
