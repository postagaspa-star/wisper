package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import eu.stgm.wisper.ui.FiltroRapportini
import eu.stgm.wisper.ui.Navigatore
import eu.stgm.wisper.ui.Quali
import eu.stgm.wisper.ui.RicordoRapportini
import eu.stgm.wisper.ui.Sezione
import eu.stgm.wisper.ui.SegmentoRapportini
import eu.stgm.wisper.ui.apriCollegamento
import java.time.LocalDate
import java.time.YearMonth

/**
 * I conti della fase 3 (architettura.md §14.15) sui casi condivisi di
 * server/prove/casi-ore-spese.json, letti dal file così com'è: il telefono deve
 * ritrovare gli stessi numeri al centesimo e le stesse frasi del server. Poi le
 * letture delle risposte di §14 e le regole per metterle in fila.
 */
class OreSpeseTest {

    private fun casi(): JSONObject? = listOf("../server/prove/casi-ore-spese.json", "server/prove/casi-ore-spese.json")
        .map(::File).firstOrNull { it.exists() }?.let { JSONObject(it.readText()) }

    // ------------------------------------------------------------------ i casi condivisi

    @Test
    fun `le ore da inizio fine e pausa come il server, su ogni caso`() {
        val c = casi()
        assumeTrue("Manca server/prove/casi-ore-spese.json", c != null)
        val ore = c!!.getJSONArray("ore")
        assertTrue(ore.length() >= 14)
        for (i in 0 until ore.length()) {
            val k = ore.getJSONObject(i)
            val nome = k.getString("nome")
            val pausa: Any? = if (k.has("pausaMinuti")) k.get("pausaMinuti") else null
            if (k.has("errore")) {
                try {
                    ContiOreSpese.oreDaOrari(k.getString("inizio"), k.getString("fine"), pausa)
                    fail("$nome: doveva dare errore")
                } catch (e: ErroreOre) {
                    assertEquals(nome, k.getString("errore"), e.message)
                }
            } else {
                val a = k.getJSONObject("atteso")
                val o = ContiOreSpese.oreDaOrari(k.getString("inizio"), k.getString("fine"), pausa)
                assertEquals("$nome: inizio", a.getString("inizio"), o.inizio)
                assertEquals("$nome: fine", a.getString("fine"), o.fine)
                assertEquals("$nome: pausa", a.getInt("pausaMinuti"), o.pausaMinuti)
                assertEquals("$nome: minuti", a.getInt("minuti"), o.minuti)
                assertEquals("$nome: ore", a.getDouble("ore"), o.ore, 0.0)
                assertEquals("$nome: giorno dopo", a.getBoolean("giornoDopo"), o.giornoDopo)
            }
        }
    }

    @Test
    fun `il rimborso delle trasferte come il server, su ogni caso`() {
        val c = casi()
        assumeTrue("Manca server/prove/casi-ore-spese.json", c != null)
        val tr = c!!.getJSONArray("trasferte")
        assertTrue(tr.length() >= 5)
        for (i in 0 until tr.length()) {
            val k = tr.getJSONObject(i)
            val t = k.getJSONObject("trasferta")
            val a = k.getJSONObject("atteso")
            val r = ContiOreSpese.rimborsoTrasferta(t.getDouble("km"), t.getBoolean("andataRitorno"), t.numero("euroKm"), t.numero("indennita"))
            val nome = k.getString("nome")
            assertEquals("$nome: km totali", a.getDouble("kmTotali"), r.kmTotali, 0.0)
            assertEquals("$nome: rimborso km", a.getDouble("rimborsoKm"), r.rimborsoKm, 0.0)
            assertEquals("$nome: indennità", a.getDouble("indennita"), r.indennita, 0.0)
            assertEquals("$nome: totale", a.getDouble("totale"), r.totale, 0.0)
            // La stessa cosa partendo da una trasferta letta dal server.
            assertEquals(nome, a.getDouble("totale"), ContiOreSpese.rimborsoTrasferta(Trasferta.daJson(t.put("dal", "2026-10-20"))).totale, 0.0)
        }
    }

    @Test
    fun `i rimborsi dovuti come il server, su ogni caso`() {
        val c = casi()
        assumeTrue("Manca server/prove/casi-ore-spese.json", c != null)
        val rr = c!!.getJSONArray("rimborsi")
        for (i in 0 until rr.length()) {
            val k = rr.getJSONObject(i)
            val spese = k.getJSONArray("spese").oggetti().map(Spesa::daJson)
            val trasferte = k.getJSONArray("trasferte").oggetti().map { Trasferta.daJson(it.put("dal", "2026-10-20")) }
            val per = ContiOreSpese.rimborsiDovuti(spese, trasferte)
            val atteso = k.getJSONArray("atteso").oggetti()
            assertEquals(k.getString("nome"), atteso.size, per.size)
            atteso.forEachIndexed { j, a ->
                val p = per[j]
                val nome = k.getString("nome") + " persona " + a.getInt("idUtente")
                assertEquals(nome, a.getInt("idUtente").toString(), p.idUtente)
                assertEquals("$nome: totale", a.getDouble("totale"), p.totale, 0.0)
                assertEquals("$nome: in attesa", a.getDouble("inAttesa"), p.inAttesa, 0.0)
                assertEquals("$nome: spese", a.getInt("spese"), p.spese)
                assertEquals("$nome: trasferte", a.getInt("trasferte"), p.trasferte)
                assertEquals("$nome: km", a.getDouble("km"), p.km, 0.0)
                assertEquals("$nome: voci", p.spese + p.trasferte, p.voci.size)
            }
        }
    }

    @Test
    fun `le ore si scrivono in tanti modi e tornano HH MM`() {
        assertEquals(510, ContiOreSpese.minutiDa("8:30"))
        assertEquals(510, ContiOreSpese.minutiDa("08.30"))
        assertEquals(510, ContiOreSpese.minutiDa("08:30:00"))
        assertNull(ContiOreSpese.minutiDa("24:00"))
        assertNull(ContiOreSpese.minutiDa("8"))
        assertEquals("08:30", ContiOreSpese.oraDaMinuti(510))
        assertEquals(0.5, ContiOreSpese.centesimi(0.495), 0.0)
        assertEquals(-2.0, ContiOreSpese.centesimi(-2.005), 0.0) // come Math.round di JavaScript: il mezzo verso l'alto
    }

    // ------------------------------------------------------------------ le risposte di §14

    private val elencoOre = JSONObject(
        """{"ok": true, "da": "2026-10-19", "a": "2026-10-25", "oreGiornaliere": 8,
         "ore": [
          {"id": 12, "idUtente": 1, "utente": "Manuel Gasparotto", "data": "2026-10-21", "inizio": "22:00", "fine": "06:00",
           "pausaMinuti": 30, "ore": 7.5, "giornoDopo": true, "idCommessa": "26ST002", "commessa": "Quadro elettrico capannone",
           "idCliente": "C002", "cliente": "Rossi Impianti Srl", "idPrestazione": null, "prestazione": "", "idAttivita": null,
           "attivita": "", "descrizione": "Prova notturna del quadro", "fatturabile": true, "tipo": "ordinaria",
           "costoOrario": 25, "costo": 187.5, "stato": "approvata", "approvataDa": null, "approvataDaNome": "", "approvataIl": "",
           "motivoRifiuto": "", "dalTimer": false, "tolta": "", "puoScrivere": true, "bloccata": "",
           "creato": "2026-10-22T01:41:11", "modificato": "2026-10-22T01:41:11"},
          {"id": 11, "idUtente": 3, "utente": "Marco Collaboratore", "data": "2026-10-19", "inizio": "", "fine": "", "pausaMinuti": 0,
           "ore": 2, "giornoDopo": false, "idCommessa": "", "commessa": "", "descrizione": "Riordino del magazzino",
           "fatturabile": false, "stato": "respinta", "approvataDa": 1, "approvataDaNome": "Manuel Gasparotto",
           "approvataIl": "2026-10-22T01:40:39", "motivoRifiuto": "Il riordino del magazzino non si segna: è dentro le ore di studio"},
          {"id": 13, "idUtente": 1, "data": "2026-10-21", "inizio": "08:00", "fine": "12:00", "pausaMinuti": 0, "ore": 4,
           "idCommessa": "26ST001", "descrizione": "Schema", "fatturabile": true, "tipo": "straordinaria", "stato": "da_approvare"}],
         "giorni": [{"data": "2026-10-19", "ore": 0, "oreRapportini": 0}, {"data": "2026-10-20", "ore": 0, "oreRapportini": 6.5},
                    {"data": "2026-10-21", "ore": 11.5, "oreRapportini": 0}, {"data": "2026-10-22", "ore": 0, "oreRapportini": 0},
                    {"data": "2026-10-23", "ore": 0, "oreRapportini": 0}, {"data": "2026-10-24", "ore": 0, "oreRapportini": 0},
                    {"data": "2026-10-25", "ore": 0, "oreRapportini": 0}],
         "totali": {"ore": 11.5, "fatturabili": 11.5, "straordinarie": 4, "oreRapportini": 6.5, "daApprovare": 1}}""",
    )

    @Test
    fun `l'elenco delle ore si legge coi nomi di architettura 14_3`() {
        val e = ElencoOre.daJson(elencoOre)
        assertEquals(LocalDate.of(2026, 10, 19), e.da)
        assertEquals(3, e.ore.size)
        val r = e.ore[0]
        assertEquals("12", r.id)
        assertEquals("22:00", r.inizio)
        assertTrue(r.giornoDopo)
        assertTrue(r.conOrari)
        assertEquals(7.5, r.ore, 0.0)
        assertEquals(187.5, r.costo!!, 0.0)
        assertEquals("", r.idPrestazione)
        assertEquals("ore:12", r.chiave)
        val respinta = e.ore[1]
        assertTrue(respinta.studio)
        assertEquals(StatoVoce.RESPINTA, respinta.stato)
        assertEquals("Respinta: Il riordino del magazzino non si segna: è dentro le ore di studio", StatoVoce.parola(respinta.stato, respinta.motivoRifiuto))
        assertTrue(e.ore[2].straordinaria)
        assertEquals(6.5, e.giorni[1].oreRapportini, 0.0)
        assertEquals(1, e.totali.daApprovare)
        // Senza il permesso dei soldi i campi non ci sono: si leggono come "non si vede".
        assertNull(e.ore[1].costo)
    }

    @Test
    fun `i giorni e i totali rifatti sul telefono sono quelli del server, e le righe in coda ci entrano`() {
        val e = ElencoOre.daJson(elencoOre)
        // Senza niente in coda: gli stessi numeri del server (la respinta non conta).
        val uguale = FilaOreSpese.oreConCoda(e, emptyList())
        assertEquals(e.totali.ore, uguale.totali.ore, 0.0)
        assertEquals(e.totali.straordinarie, uguale.totali.straordinarie, 0.0)
        assertEquals(e.giorni.map { it.ore }, uguale.giorni.map { it.ore })
        assertEquals(6.5, uguale.giorni[1].oreRapportini, 0.0)
        // Una riga cambiata in coda prende il posto della sua; una nuova si aggiunge, una fuori dal periodo no.
        val cambiata = e.ore[2].copy(ore = 5.0, inCoda = true)
        val nuova = RigaOre(idLocale = "O-1", data = LocalDate.of(2026, 10, 22), ore = 2.5, fatturabile = true, stato = StatoVoce.DA_APPROVARE, inCoda = true)
        val fuori = RigaOre(idLocale = "O-2", data = LocalDate.of(2026, 10, 30), ore = 3.0)
        val con = FilaOreSpese.oreConCoda(e, listOf(cambiata, nuova, fuori))
        assertEquals(4, con.ore.size)
        assertEquals(5.0, con.ore.first { it.id == "13" }.ore, 0.0)
        assertEquals(12.5, con.giorni[2].ore, 0.0)
        assertEquals(2.5, con.giorni[3].ore, 0.0)
        assertEquals(15.0, con.totali.ore, 0.0)
        assertEquals(2, con.totali.daApprovare)
    }

    @Test
    fun `la settimana mostra il sabato solo se ci sono ore, e le righe del giorno vanno per inizio`() {
        val lunedi = LocalDate.of(2026, 10, 19)
        val vuota = FilaOreSpese.giorniSettimana(lunedi, null)
        assertEquals(5, vuota.size)
        val e = ElencoOre.daJson(elencoOre).let { it.copy(giorni = it.giorni.map { g -> if (g.data.dayOfMonth == 24) g.copy(ore = 3.0) else g }) }
        val conSabato = FilaOreSpese.giorniSettimana(lunedi, e)
        assertEquals(6, conSabato.size)
        assertEquals(LocalDate.of(2026, 10, 24), conSabato.last().data)
        val righe = FilaOreSpese.righeDelGiorno(ElencoOre.daJson(elencoOre), LocalDate.of(2026, 10, 21))
        assertEquals(listOf("13", "12"), righe.map { it.id })
        assertEquals(LocalDate.of(2026, 10, 19), FilaOreSpese.lunedi(LocalDate.of(2026, 10, 25)))
    }

    @Test
    fun `il corpo di salvaOre con inizio e fine, o con le ore a mano`() {
        val conOrari = RigaOre(id = "12", data = LocalDate.of(2026, 10, 21), inizio = "08:00", fine = "12:30", pausaMinuti = 30, ore = 99.0, idCommessa = "26ST001", fatturabile = true, tipo = RigaOre.STRAORDINARIA, idPrestazione = "2")
        val o = conOrari.perSalvare()
        assertEquals(12L, o.get("id"))
        assertEquals("08:00", o.getString("inizio"))
        assertEquals(30, o.getInt("pausaMinuti"))
        assertFalse("con inizio e fine le ore le calcola il server", o.has("ore"))
        assertEquals(2L, o.get("idPrestazione"))
        assertEquals("straordinaria", o.getString("tipo"))
        assertFalse(o.has("bozza"))
        val aMano = RigaOre(data = LocalDate.of(2026, 10, 21), ore = 2.5).perSalvare(bozza = true)
        assertFalse(aMano.has("id"))
        assertEquals("", aMano.getString("inizio"))
        assertEquals("", aMano.getString("fine"))
        assertEquals(2.5, aMano.getDouble("ore"), 0.0)
        assertTrue(aMano.isNull("idPrestazione"))
        assertTrue(aMano.getBoolean("bozza"))
        // Lo stepper va a mezz'ore, da mezz'ora a 24.
        assertEquals(2.5, FilaOreSpese.passo(2.0, 0.5), 0.0)
        assertEquals(0.5, FilaOreSpese.passo(0.5, -0.5), 0.0)
        assertEquals(24.0, FilaOreSpese.passo(24.0, 0.5), 0.0)
    }

    @Test
    fun `una riga in coda si vede subito col nome della commessa e lo stato che avrà`() {
        val ana = Anagrafiche(commesse = listOf(Commessa("26ST001", "C001", "Magazzino", "APERTA")), clienti = listOf(Cliente("C001", "Elettrodinamica")))
        val corpo = RigaOre(data = LocalDate.of(2026, 10, 21), inizio = "08:00", fine = "10:15", idCommessa = "26st001", fatturabile = true).perSalvare()
        val r = RigaOre.daCorpo(corpo, "O-abc", "", null, ana, StatoVoce.DA_APPROVARE)
        assertEquals("26ST001", r.idCommessa)
        assertEquals("Magazzino", r.commessa)
        assertEquals("Elettrodinamica", r.cliente)
        assertEquals(2.25, r.ore, 0.0)
        assertEquals(StatoVoce.DA_APPROVARE, r.stato)
        assertTrue(r.inCoda)
        assertEquals("O-abc", r.chiave)
        val bozza = RigaOre.daCorpo(RigaOre(data = LocalDate.of(2026, 10, 21), ore = 1.0).perSalvare(bozza = true), "O-x", "14", null, ana, StatoVoce.APPROVATA)
        assertEquals(StatoVoce.BOZZA, bozza.stato)
        assertEquals("14", bozza.id)
        // Chi decide lo stato: la regola APPROVAZIONE e il ruolo (§14.1).
        assertEquals(StatoVoce.DA_APPROVARE, FilaOreSpese.statoPrevisto("collaboratori", Ruoli.COLLABORATORE))
        assertEquals(StatoVoce.APPROVATA, FilaOreSpese.statoPrevisto("collaboratori", Ruoli.TITOLARE))
        assertEquals(StatoVoce.DA_APPROVARE, FilaOreSpese.statoPrevisto("tutti", Ruoli.TITOLARE))
        assertEquals(StatoVoce.APPROVATA, FilaOreSpese.statoPrevisto("nessuno", Ruoli.COLLABORATORE))
    }

    @Test
    fun `il timer fa scorrere i secondi del server col contatore del telefono`() {
        val t = TimerLetto.daJson(
            JSONObject("""{"ok": true, "adesso": "2026-10-22T01:41:11", "timer": {"partitoIl": "2026-10-22T00:10:39", "idCommessa": "26ST001",
              "commessa": "Nuovo magazzino automatico Batokyo", "idPrestazione": null, "idAttivita": null, "descrizione": "Cablaggio quadro di linea 3",
              "fatturabile": true, "secondi": 5432}}"""),
            lettoAlMs = 1_000_000L,
        )
        assertTrue(t.acceso)
        assertEquals(5432L, t.secondi(1_000_000L))
        assertEquals(5442L, t.secondi(1_010_400L))
        assertEquals(5432L, t.secondi(900_000L)) // l'orologio tornato indietro non toglie tempo
        assertEquals("01:30:32", TimerAcceso.durata(5432))
        assertEquals("0:10", t.timer!!.dalle)
        assertEquals(LocalDate.of(2026, 10, 22), t.timer.giorno)
        val spento = TimerLetto.daJson(JSONObject("""{"ok":true,"adesso":"2026-10-22T01:58:30","timer":null}"""), 0)
        assertFalse(spento.acceso)
        assertEquals(0L, spento.secondi(99_999))
    }

    @Test
    fun `da approvare, tutte scelte all'inizio, seleziona tutto e quelle già decise che spariscono`() {
        val d = DaApprovare.daJson(
            JSONObject("""{"ok": true, "oggi": "2026-10-22", "quante": 3, "conAnomalie": 2,
             "persone": [{"idUtente": 3, "nome": "Marco Collaboratore", "quante": 3, "conAnomalie": 2, "voci": [
               {"tipo": "rapportino", "id": "RAP/2026/0006", "idUtente": 3, "data": "2026-10-16", "cosa": "Rapportino",
                "dettaglio": "RAP/2026/0006 · Verifica impianto di terra · venerdì 16", "quanto": 4.5, "unita": "ore", "km": 22, "anomalie": []},
               {"tipo": "spesa", "id": 12, "idUtente": 3, "data": "2026-10-20", "cosa": "Spesa", "dettaglio": "Albergo · 26ST001 · martedì 20",
                "quanto": 230, "unita": "euro", "anomalie": [{"tipo": "sopra200", "testo": "Spesa sopra i 200 €"}]},
               {"tipo": "ore", "id": 12, "idUtente": 3, "data": "2026-10-21", "cosa": "Ore", "dettaglio": "26ST001 · mercoledì 21",
                "quanto": 8, "unita": "ore", "anomalie": [{"tipo": "troppeOre", "testo": "13 ore in un giorno"}]}]}]}"""),
        )
        assertEquals(3, d.voci.size)
        assertEquals("230,00 €", d.voci[1].quantoTesto)
        assertEquals("8 h", d.voci[2].quantoTesto)
        assertEquals("Spesa sopra i 200 €", d.voci[1].anomalie.single().testo)
        // La spesa 12 e le ore 12 sono cose diverse.
        val tutte = d.tutteLeChiavi()
        assertEquals(setOf("rapportino:RAP/2026/0006", "spesa:12", "ore:12"), tutte)
        assertEquals(emptySet<String>(), d.selezionaTutto(tutte))
        assertEquals(tutte, d.selezionaTutto(tutte - "spesa:12"))
        assertEquals(listOf("rapportino", "ore"), d.scelte(tutte - "spesa:12").map { it.tipo })
        // Il rapportino si manda col suo numero, le altre con l'id numerico.
        assertEquals("RAP/2026/0006", d.voci[0].perServer().get("id"))
        assertEquals(12L, d.voci[1].perServer().get("id"))
        val dopo = d.senza(setOf("spesa:12", "ore:12"))
        assertEquals(1, dopo.quante)
        assertEquals(0, dopo.conAnomalie)
        assertTrue(d.senza(tutte).persone.isEmpty())
        val esito = EsitoApprovazione.daJson(JSONObject("""{"ok":true,"fatte":1,"voci":[{"tipo":"ore","id":7,"stato":"approvata"},{"tipo":"rapportino","id":"RAP/2026/0006","stato":"approvato"}]}"""))
        assertEquals(1, esito.fatte)
        assertEquals("ore:7" to "approvata", esito.voci[0])
    }

    @Test
    fun `una spesa coi nomi di 14_8, soloCampi e il corpo di salvaSpesa`() {
        val s = Spesa.daJson(
            JSONObject("""{"id": 1, "data": "2026-10-02", "importo": 14.5, "categoria": "altro", "descrizione": "Pranzo", "idCommessa": "26ST001",
             "idRapportino": "RAP/2026/0002", "destinazione": "cliente", "pagataDaMe": false, "stato": "approvata", "dalRapportino": true,
             "foto": [], "puoScrivere": true, "idTrasferta": null,
             "bloccata": "È nel rapportino RAP/2026/0002, già firmato: si cambiano solo categoria, descrizione e chi l'ha pagata",
             "soloCampi": ["categoria", "descrizione", "pagataDaMe"]}"""),
        )
        assertEquals("RAP/2026/0002", s.idRapportino)
        assertEquals("", s.idTrasferta)
        assertTrue(s.dalRapportino)
        assertEquals(listOf("categoria", "descrizione", "pagataDaMe"), s.soloCampi)
        assertTrue(s.cambia("descrizione"))
        assertFalse(s.cambia("importo"))
        val corpo = s.copy(categoria = "vitto", pagataDaMe = true).perSalvare()
        assertEquals(setOf("id", "categoria", "descrizione", "pagataDaMe"), corpo.keys().asSequence().toSet())
        // Una spesa nuova: "L'ho pagata io" si manda sempre, l'anticipazione solo al cliente.
        val nuova = Spesa(data = LocalDate.of(2026, 10, 21), importo = 8.4, categoria = "pedaggio", idCommessa = "26ST001", destinazione = Destinazione.STUDIO, anticipazione = true, pagataDaMe = true).perSalvare()
        assertFalse(nuova.has("id"))
        assertTrue(nuova.getBoolean("pagataDaMe"))
        assertFalse(nuova.getBoolean("anticipazione"))
        assertEquals(8.4, nuova.getDouble("importo"), 0.0)
        assertEquals(Destinazione.CLIENTE, Destinazione.diBase("26ST001"))
        assertEquals(Destinazione.STUDIO, Destinazione.diBase(""))
        assertEquals("Mia", Destinazione.nome(Destinazione.PERSONALE))
    }

    @Test
    fun `i tre riquadri delle spese si rifanno come il server, anche con quelle in coda`() {
        fun s(id: String, importo: Double, dest: String, mia: Boolean, stato: String, foto: Boolean = true, rimborsata: String = "") =
            Spesa(id = id, idUtente = "3", data = LocalDate.of(2026, 10, 20), importo = importo, destinazione = dest, pagataDaMe = mia, stato = stato,
                foto = if (foto) listOf(FileRemoto("f$id", "")) else emptyList(), rimborsataIl = rimborsata)
        val spese = listOf(
            s("1", 52.0, Destinazione.CLIENTE, true, StatoVoce.APPROVATA),
            s("2", 62.0, Destinazione.STUDIO, false, StatoVoce.APPROVATA, foto = false),
            s("3", 12.0, Destinazione.PERSONALE, true, StatoVoce.APPROVATA),
            s("4", 16.5, Destinazione.STUDIO, true, StatoVoce.DA_APPROVARE),
            s("5", 10.0, Destinazione.STUDIO, true, StatoVoce.RESPINTA),
            s("6", 7.0, Destinazione.CLIENTE, true, StatoVoce.APPROVATA, rimborsata = "2026-10-20T18:00:00"),
            s("7", 3.0, Destinazione.CLIENTE, true, StatoVoce.BOZZA),
        )
        val t = ContiOreSpese.totaliSpese(spese)
        assertEquals(6, t.quante)
        assertEquals(62.0, t.cliente, 0.0)
        assertEquals(78.5, t.studio, 0.0)
        assertEquals(12.0, t.personale, 0.0)
        assertEquals(68.5, t.daRimborsare, 0.0)
        assertEquals(1, t.senzaFoto)
        val elenco = ElencoSpese(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), spese.take(2), ContiOreSpese.totaliSpese(spese.take(2)))
        val nuova = Spesa(idLocale = "S-1", data = LocalDate.of(2026, 10, 22), importo = 8.4, destinazione = Destinazione.CLIENTE, pagataDaMe = true, stato = StatoVoce.APPROVATA, inCoda = true, fotoInCoda = true)
        val con = FilaOreSpese.speseConCoda(elenco, listOf(nuova))
        assertEquals("S-1", con.spese.first().chiave)
        assertEquals(60.4, con.totali.cliente, 0.0)
        assertEquals(60.4, con.totali.daRimborsare, 0.0)
        assertEquals(1, con.totali.senzaFoto)
    }

    @Test
    fun `una spesa in coda si vede subito, scontrino compreso`() {
        val ana = Anagrafiche(commesse = listOf(Commessa("26ST001", "C001", "Magazzino", "APERTA")), clienti = listOf(Cliente("C001", "Elettrodinamica")))
        val corpo = Spesa(data = LocalDate.of(2026, 10, 21), importo = 8.4, categoria = "pedaggio", idCommessa = "26ST001", destinazione = Destinazione.CLIENTE, pagataDaMe = true).perSalvare()
        val s = Spesa.daCorpo(corpo, "S-9", "", null, ana, StatoVoce.DA_APPROVARE, conFoto = true)
        assertEquals("Magazzino", s.commessa)
        assertEquals("C001", s.idCliente)
        assertEquals(StatoVoce.DA_APPROVARE, s.stato)
        assertTrue(s.fotoInCoda)
        assertTrue(s.inCoda)
        // Una modifica di una spesa del rapportino tiene lo stato del rapportino.
        val prima = Spesa(id = "1", idRapportino = "RAP/2026/0002", stato = StatoVoce.APPROVATA, soloCampi = listOf("categoria", "descrizione", "pagataDaMe"))
        val cambiata = Spesa.daCorpo(prima.copy(categoria = "vitto").perSalvare(), "spesa:1", "1", prima, ana, StatoVoce.DA_APPROVARE, conFoto = false)
        assertEquals(StatoVoce.APPROVATA, cambiata.stato)
        assertEquals("vitto", cambiata.categoria)
    }

    @Test
    fun `trasferte, veicoli, rimborsi e riepilogo coi nomi di 14_9 e 14_10`() {
        val t = Trasferta.daJson(
            JSONObject("""{"id": 2, "idUtente": 3, "utente": "Marco Collaboratore", "dal": "2026-10-20", "al": "2026-10-21", "giorni": 2,
             "destinazione": "Schio, passando dal fornitore a Padova", "motivo": "Collaudo notturno della linea 3",
             "idCommessa": "26ST001", "km": 90, "andataRitorno": true, "kmTotali": 180, "idVeicolo": 1, "veicolo": "Volvo XC40", "euroKm": 0.76,
             "rimborsoKm": 136.8, "indennita": 0, "totale": 136.8, "stato": "da_approvare", "rimborsataIl": "",
             "spese": [{"id": 12, "importo": 230, "categoria": "alloggio", "descrizione": "Albergo", "idTrasferta": 2}], "speseTotale": 230}"""),
        )
        assertEquals(2, t.giorni)
        assertEquals(LocalDate.of(2026, 10, 21), t.al)
        assertEquals("1", t.idVeicolo)
        assertEquals(1, t.spese.size)
        assertEquals("2", t.spese[0].idTrasferta)
        assertEquals(t.totale, ContiOreSpese.rimborsoTrasferta(t).totale, 0.0)
        val corpo = t.perSalvare()
        assertEquals(2L, corpo.get("id"))
        assertEquals(1L, corpo.get("idVeicolo"))
        assertFalse("euroKm lo congela il server", corpo.has("euroKm"))

        val v = ElencoVeicoli.daJson(JSONObject("""{"ok":true,"aciAnno":2026,"paginaAci":"https://www.aci.it/","veicoli":[{"id":2,"nome":"Furgone di prova","alimentazione":"gasolio","euroKm":0.5432,"annoAci":2026,"attivo":true,"trasferte":0}]}"""))
        assertEquals(2026, v.aciAnno)
        assertEquals("0,5432 €/km", v.veicoli[0].euroKmTesto)
        assertEquals("0,76 €/km", Veicolo(euroKm = 0.76).euroKmTesto)

        val r = Rimborsi.daJson(JSONObject("""{"ok": true, "totale": 150.66, "puoSegnare": true, "persone": [
          {"idUtente": 1, "nome": "Manuel Gasparotto", "totale": 136.36, "inAttesa": 0, "spese": 3, "trasferte": 1, "km": 96, "voci": [
            {"tipo": "spesa", "id": 4, "data": "2026-10-22", "descrizione": "Parcheggio Schio centro", "categoria": "parcheggio", "idCommessa": "26ST001", "importo": 3, "km": null},
            {"tipo": "trasferta", "id": 1, "data": "2026-10-21", "descrizione": "Schio, cantiere Batokyo", "categoria": "", "idCommessa": "26ST001", "importo": 72.96, "km": 96}]}]}"""))
        assertTrue(r.puoSegnare)
        assertEquals(72.96, r.persone[0].voci[1].importo, 0.0)
        assertEquals(1L, r.persone[0].voci[1].perServer().get("id"))
        assertNull(r.persone[0].voci[0].km)

        val rp = RiepilogoSpese.daJson(JSONObject("""{"ok": true, "per": "persona", "righe": [{"chiave": 1, "nome": "Manuel Gasparotto", "quante": 6, "cliente": 77.9, "studio": 83.9, "personale": 0,
            "anticipazioni": 52, "daRimborsare": 136.36, "inAttesa": 0, "trasferte": 1, "km": 96, "rimborsoKm": 72.96, "indennita": 0, "totale": 234.76}],
            "totale": {"quante": 12, "cliente": 320.8, "studio": 110.2, "personale": 12, "anticipazioni": 52, "daRimborsare": 542.36, "inAttesa": 391.7, "trasferte": 2, "km": 276, "rimborsoKm": 209.76, "indennita": 0, "totale": 640.76}}"""))
        assertEquals("1", rp.righe[0].chiave)
        assertEquals(234.76, rp.righe[0].totale, 0.0)
        assertEquals(640.76, rp.totale!!.totale, 0.0)
        // Per commessa il nome del cliente sta in nomeCliente; "cliente" è la somma delle spese al cliente.
        val perCommessa = RiepilogoSpese.daJson(JSONObject("""{"ok":true,"per":"commessa","righe":[{"chiave":"26ST001","nome":"Magazzino","cliente":242.9,"studio":0,"km":276,"rimborsoKm":209.76,"indennita":0,"totale":452.66,"idCliente":"C001","nomeCliente":"Elettrodinamica"}],"totale":{"cliente":242.9,"totale":452.66}}"""))
        assertEquals("Elettrodinamica", perCommessa.righe[0].nomeCliente)
        assertEquals("C001", perCommessa.righe[0].idCliente)
        assertEquals(242.9, perCommessa.righe[0].cliente, 0.0)
        assertEquals(452.66, perCommessa.righe[0].totale, 0.0)
        assertEquals(ContiOreSpese.centesimi(perCommessa.righe[0].cliente + perCommessa.righe[0].rimborsoKm), perCommessa.righe[0].totale, 0.0)
        assertEquals(452.66, perCommessa.totale!!.totale, 0.0)
        // totale = cliente + studio + rimborso km + indennità (le "Mia" no)
        assertEquals(rp.righe[0].totale, ContiOreSpese.centesimi(rp.righe[0].cliente + rp.righe[0].studio + rp.righe[0].rimborsoKm + rp.righe[0].indennita), 0.0)
    }

    @Test
    fun `la dashboard ha i numeri della fase 3, e io dice chi approva`() {
        val d = Dashboard.daJson(JSONObject("""{"urgenti": [{"tipo": "approvare", "gravita": "attenzione", "titolo": "8 cose da approvare di Marco Collaboratore",
          "quanto": 8, "unita": "voci", "collegamento": {"pagina": "rapportini", "filtro": {"segmento": "daApprovare"}}}],
          "numeri": {"commesse": {"aperte": 2}, "ore": {"settimana": 43, "mese": 43, "fatturabiliMese": 34, "timerAcceso": false},
          "approvare": {"voci": 8, "conAnomalie": 5}, "rimborsi": {"daFare": 150.66, "persone": 3}}}"""))
        assertEquals(43.0, d.fase3.ore!!.settimana, 0.0)
        assertEquals(8, d.fase3.approvare!!.voci)
        assertEquals(150.66, d.fase3.rimborsi!!.daFare, 0.0)
        assertEquals("daApprovare", d.urgenti[0].collegamento!!.parametri["segmento"])
        // Il collaboratore: niente cose da approvare, niente rimborsi.
        val marco = Dashboard.daJson(JSONObject("""{"numeri": {"ore": {"settimana": 23, "mese": 23, "fatturabiliMese": 23, "timerAcceso": true}}}"""))
        assertTrue(marco.fase3.ore!!.timerAcceso)
        assertNull(marco.fase3.approvare)
        assertNull(marco.fase3.rimborsi)

        val i = Interfaccia.daJson(JSONObject("""{"ticketAttivo":false,"puoApprovare":true,"puoSegnareRimborsi":false,"approvazione":"tutti","oreGiornaliere":8}"""))
        val s = Sessione(Utente("2", "Laura", ruolo = Ruoli.AMMINISTRAZIONE), Permessi.iniziali(Ruoli.AMMINISTRAZIONE), interfaccia = i)
        assertTrue(s.puoApprovare)
        assertFalse(s.puoSegnareRimborsi)
        assertEquals(StatoVoce.DA_APPROVARE, s.statoPrevisto)
        assertEquals(i, Interfaccia.daJson(i.aJson()))
        // Senza le parole del server vale la regola dei ruoli (§14.1): il collaboratore non approva mai.
        val marcoS = Sessione(Utente("3", "Marco", ruolo = Ruoli.COLLABORATORE), Permessi.iniziali(Ruoli.COLLABORATORE))
        assertFalse(marcoS.puoApprovare)
        assertFalse(marcoS.puoSegnareRimborsi)
        assertTrue(marcoS.permessi.modifica(Moduli.SPESE))
        val manuel = Sessione(Utente("1", "Manuel", ruolo = Ruoli.TITOLARE), Permessi.iniziali(Ruoli.TITOLARE))
        assertTrue(manuel.puoApprovare)
        assertTrue(manuel.puoSegnareRimborsi)
    }

    @Test
    fun `il rapportino dice se aspetta l'approvazione o è stato respinto`() {
        val base = JSONObject("""{"idLocale": "W-1", "id": "RAP/2026/0012", "data": "2026-10-21", "stato": "BOZZA"}""")
        assertNull(Rapportino.daJson(base, dalFoglio = true).pillolaApprovazione)
        assertEquals("Da approvare", Rapportino.daJson(JSONObject(base.toString()).put("statoApprovazione", "da_approvare"), dalFoglio = true).pillolaApprovazione)
        val respinto = Rapportino.daJson(JSONObject(base.toString()).put("statoApprovazione", "respinto").put("motivoRifiuto", "Le ore di viaggio mancano"), dalFoglio = true)
        assertEquals("Respinto: Le ore di viaggio mancano", respinto.pillolaApprovazione)
        // La copia sul telefono la ricorda; al server non si manda (lo decide lui).
        assertEquals("respinto", Rapportino.daJson(respinto.aJson()).statoApprovazione)
        assertFalse(respinto.perIlFoglio().has("statoApprovazione"))
    }

    @Test
    fun `le commesse recenti vengono da rapportini ore e spese, solo le aperte`() {
        val ana = Anagrafiche(
            commesse = listOf(
                Commessa("26ST001", "C001", "Magazzino", "APERTA"), Commessa("26ST002", "C002", "Quadro", "APERTA"),
                Commessa("26ST003", "C001", "Vecchia", "CHIUSA"), Commessa("26ST004", "C001", "Linea 3", "APERTA"),
            ),
        )
        val oggi = LocalDate.of(2026, 10, 22)
        val rap = listOf(Rapportino("W-1", oggi.minusDays(5), idCommessa = "26ST002"), Rapportino("W-2", oggi.minusDays(1), idCommessa = "26ST003"))
        val ore = listOf(RigaOre(data = oggi, idCommessa = "26st004"), RigaOre(data = oggi.minusDays(2), idCommessa = ""))
        val spese = listOf(Spesa(data = oggi.minusDays(3), idCommessa = "26ST001"))
        val r = FilaOreSpese.commesseRecenti(ana, rap, ore, spese)
        assertEquals(listOf("26ST004", "26ST001", "26ST002"), r.map { it.id })
        assertEquals("Linea 3", r[0].nome)
        // Senza storia: le aperte, le ultime create prima.
        assertEquals(listOf("26ST004", "26ST002"), FilaOreSpese.commesseRecenti(ana, emptyList(), quante = 2).map { it.id })
    }

    @Test
    fun `la pillola della rete dice cosa aspetta`() {
        fun op(tipo: CodaInvii.Tipo, chiave: String, errore: String = "") = CodaInvii.Operazione("x-$chiave-$tipo", tipo, chiave, errore = errore)
        assertNull(TestiCoda.inAttesa(emptyList()))
        assertEquals("1 rapportino parte appena c'è rete", TestiCoda.inAttesa(listOf(op(CodaInvii.Tipo.SALVA, "W-1"))))
        assertEquals("2 righe di ore partono appena c'è rete", TestiCoda.inAttesa(listOf(op(CodaInvii.Tipo.ORE, "O-1"), op(CodaInvii.Tipo.ORE, "O-2"))))
        // Una spesa col suo scontrino conta una volta.
        assertEquals("1 spesa parte appena c'è rete", TestiCoda.inAttesa(listOf(op(CodaInvii.Tipo.SPESA, "S-1"), op(CodaInvii.Tipo.FOTO_SPESA, "S-1"))))
        assertEquals("3 modifiche partono appena c'è rete", TestiCoda.inAttesa(listOf(op(CodaInvii.Tipo.SALVA, "W-1"), op(CodaInvii.Tipo.ORE, "O-1"), op(CodaInvii.Tipo.SPESA, "S-1"))))
        assertNull(TestiCoda.inAttesa(listOf(op(CodaInvii.Tipo.ORE, "O-1", errore = "no"))))
        assertEquals("Il server non ha accettato una spesa", TestiCoda.rifiutata(CodaInvii.Tipo.FOTO_SPESA))
        assertEquals("Il server non ha accettato un rapportino", TestiCoda.rifiutata(CodaInvii.Tipo.STATO))
    }

    @Test
    fun `senza le Ore, da approvare e Dashboard di un server di prima`() {
        // 07/11/2026 (richiesta del titolare): le Ore non ci sono più. Un server di prima le manda ancora.
        val d = DaApprovare.daJson(
            JSONObject("""{"ok": true, "quante": 3, "conAnomalie": 2, "persone": [{"idUtente": 3, "nome": "Marco Collaboratore", "quante": 3, "conAnomalie": 2, "voci": [
               {"tipo": "rapportino", "id": "RAP/2026/0006", "idUtente": 3, "cosa": "Rapportino", "dettaglio": "RAP/2026/0006", "quanto": 4.5, "unita": "ore", "anomalie": []},
               {"tipo": "spesa", "id": 12, "idUtente": 3, "cosa": "Spesa", "dettaglio": "Albergo", "quanto": 230, "unita": "euro", "anomalie": [{"tipo": "sopra200", "testo": "Spesa sopra i 200 €"}]},
               {"tipo": "ore", "id": 12, "idUtente": 3, "cosa": "Ore", "dettaglio": "26ST001", "quanto": 8, "unita": "ore", "anomalie": [{"tipo": "troppeOre", "testo": "13 ore in un giorno"}]}]}]}"""),
        )
        val s = d.senzaOre()
        assertEquals(listOf("rapportino", "spesa"), s.voci.map { it.tipo })
        assertEquals(2, s.quante)
        assertEquals(1, s.conAnomalie)
        assertTrue(s.senzaOre() === s)
        // Il timer acceso e le ore respinte di un giorno non si mostrano; il resto sì, anche col segmento "ore".
        val dash = Dashboard.daJson(JSONObject("""{"urgenti": [
            {"tipo": "timer", "titolo": "Il timer è acceso da 11 ore", "collegamento": {"pagina": "rapportini", "filtro": {"segmento": "ore"}}},
            {"tipo": "respinta", "titolo": "Ore del 21/10 respinte", "collegamento": {"pagina": "rapportini", "filtro": {"segmento": "ore", "giorno": "2026-10-21"}}},
            {"tipo": "respinta", "titolo": "RAP/2026/0006 respinto", "collegamento": {"pagina": "rapportini", "filtro": {"segmento": "rapportini", "id": "RAP/2026/0006"}}},
            {"tipo": "respinta", "titolo": "4 cose respinte da correggere", "collegamento": {"pagina": "rapportini", "filtro": {"segmento": "ore", "stato": "respinta"}}}],
            "settimana": [{"tipo": "timer", "titolo": "Il timer di Marco è acceso da 12 ore"}], "pianificare": []}"""))
        assertEquals(listOf("RAP/2026/0006 respinto", "4 cose respinte da correggere"), dash.urgenti.map { it.titolo })
        assertTrue(dash.settimana.isEmpty())
    }

    @Test
    fun `i collegamenti di prima alle Ore aprono i Rapportini`() {
        val aperte = mutableListOf<Pair<Sezione, FiltroRapportini?>>()
        val rotte = mutableListOf<String>()
        val nav = Navigatore({ rotte += it }, {}, { s, f -> aperte += s to f }, { _, _ -> }, { _, _, _ -> })
        // Server di prima: {segmento: 'ore'} (il riquadro Ore della settimana, il timer), anche col giorno.
        apriCollegamento(Collegamento("rapportini", parametri = mapOf("segmento" to "ore")), nav, emptyList())
        apriCollegamento(Collegamento("rapportini", parametri = mapOf("segmento" to "ore", "giorno" to "2026-10-21")), nav, emptyList())
        apriCollegamento(Collegamento("rapportini", parametri = mapOf("segmento" to "ore", "stato" to "respinta")), nav, emptyList())
        // Server nuovo: oreSettimana con {pagina: 'rapportini'}.
        apriCollegamento(Collegamento("rapportini"), nav, emptyList())
        assertTrue(rotte.isEmpty())
        assertEquals(List(4) { Sezione.RAPPORTINI }, aperte.map { it.first })
        assertEquals(YearMonth.now(), aperte[0].second?.mese)
        assertEquals(YearMonth.of(2026, 10), aperte[1].second?.mese)
        assertTrue(aperte.all { it.second?.quali == Quali.TUTTI })
        apriCollegamento(Collegamento("rapportini", parametri = mapOf("segmento" to "daApprovare")), nav, emptyList())
        assertEquals(SegmentoRapportini.APPROVARE, RicordoRapportini.segmento)
        RicordoRapportini.segmento = SegmentoRapportini.RAPPORTINI
    }

}
