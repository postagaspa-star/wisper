package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.LocalDate

/**
 * La fase 3 contro il server di prova vero (architettura.md §14). Si lanciano in un modo solo, con un server
 * nuovo fermo al 22/10/2026 (ServerDiProva.kt):
 *
 *     node server/prove/telefono.js            (--giri 2: due giri di fila sullo stesso server)
 *
 * Senza WISPER_SERVER_PROVA si saltano. Scrivono sul database di prova, righe con descrizioni nuove a ogni giro,
 * sul giorno del server.
 */
class ServerDiProvaFase3Test {
    private val indirizzo = ServerDiProva.indirizzo

    @get:Rule
    val cartella = TemporaryFolder()

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-app-3", "dispNome" to "prove unitarie", "app" to "telefono prove") })

    private fun entra(email: String): Pair<PonteServer.Accesso, PonteServer> = runBlocking {
        val a = ponte("").accedi(email, "prova")
        a to ponte(a.token)
    }

    /** Il giorno del server (letto solo quando una prova gira: senza server si saltano prima). */
    private val oggi: LocalDate get() = ServerDiProva.oggi
    private fun unico(testo: String) = "$testo ${System.nanoTime() % 1_000_000}"

    @Test
    fun `le ore del telefono sono quelle del server, e i giorni rifatti tornano`() = runBlocking {
        val (marco, p) = entra("marco@esempio.it")
        val desc = unico("Prova orari")
        val conOrari = p.salvaOre(RigaOre(data = oggi, inizio = "8:00", fine = "12:20", idCommessa = "26ST001", descrizione = desc, fatturabile = true).perSalvare())
        assertEquals(ContiOreSpese.oreDaOrari("8:00", "12:20", 0).ore, conOrari.ore, 0.0)
        assertEquals("08:00", conOrari.inizio)
        assertEquals(StatoVoce.DA_APPROVARE, conOrari.stato) // il collaboratore manda in approvazione
        assertNull("senza costi niente costo", conOrari.costo)
        val notte = p.salvaOre(RigaOre(data = oggi, inizio = "22:00", fine = "06:00", pausaMinuti = 30, descrizione = unico("Notte")).perSalvare(bozza = true))
        assertEquals(7.5, notte.ore, 0.0)
        assertTrue(notte.giornoDopo)
        assertEquals(StatoVoce.BOZZA, notte.stato)
        val aMano = p.salvaOre(RigaOre(data = oggi, ore = 2.5, descrizione = unico("A mano")).perSalvare())
        assertEquals(2.5, aMano.ore, 0.0)
        assertFalse("senza commessa di base non fatturabile", aMano.fatturabile)

        // L'elenco della settimana: le righe di Marco, e i giorni e i totali rifatti sul telefono sono quelli del server.
        val lunedi = FilaOreSpese.lunedi(oggi)
        val e = p.ore(lunedi, lunedi.plusDays(6), utente = marco.utente.id)
        assertTrue(e.ore.all { it.idUtente == marco.utente.id })
        assertTrue(e.ore.any { it.id == conOrari.id })
        val rifatto = FilaOreSpese.oreConCoda(e, emptyList())
        assertEquals(e.totali.ore, rifatto.totali.ore, 0.001)
        assertEquals(e.totali.fatturabili, rifatto.totali.fatturabili, 0.001)
        assertEquals(e.totali.daApprovare, rifatto.totali.daApprovare)
        e.giorni.forEach { g -> assertEquals("giorno ${g.data}", g.ore, rifatto.giorni.first { it.data == g.data }.ore, 0.001) }

        // Togliere e rimettere (l'Annulla).
        assertTrue(p.togliOre(aMano.id).tolta.isNotBlank())
        assertTrue(p.ore(lunedi, lunedi.plusDays(6)).ore.none { it.id == aMano.id })
        assertEquals("", p.togliOre(aMano.id, annulla = true).tolta)
        // Gli errori sono le frasi dei conti condivisi.
        try {
            p.salvaOre(RigaOre(data = oggi, inizio = "08:00", fine = "08:00").perSalvare())
            fail("doveva dire di no")
        } catch (e: PonteServer.Rifiutato) {
            assertEquals("Fine: deve essere diversa dall'inizio", e.message)
        }
        p.esci()
    }

    @Test
    fun `il timer, uno per persona, e la bozza che nasce fermandolo`() = runBlocking {
        val (_, p) = entra("marco@esempio.it")
        // Se è rimasto acceso (i dati di prova lo accendono), si ferma.
        if (p.timer().acceso) p.fermaTimer()
        assertFalse(p.timer().acceso)
        val acceso = p.avviaTimer("26ST001", unico("Timer"))
        assertTrue(acceso.acceso)
        assertEquals("26ST001", acceso.timer!!.idCommessa)
        try {
            p.avviaTimer("26ST002")
            fail("un timer solo per persona")
        } catch (e: PonteServer.Rifiutato) {
            assertTrue(e.message!!.startsWith("Il timer è già acceso dalle"))
        }
        val f = p.fermaTimer()
        assertTrue(f.riga.dalTimer)
        assertEquals(StatoVoce.BOZZA, f.riga.stato)
        assertTrue(f.riga.inizio.isNotBlank())
        assertFalse(p.timer().acceso)
        try {
            p.fermaTimer()
            fail("spento")
        } catch (e: PonteServer.Rifiutato) {
            assertEquals("Il timer non è acceso", e.message)
        }
        // La bozza corretta e mandata (come fa il modulo del telefono).
        val corretta = p.salvaOre(f.riga.copy(inizio = "", fine = "", ore = 1.5).perSalvare())
        assertEquals(1.5, corretta.ore, 0.0)
        assertEquals(StatoVoce.DA_APPROVARE, corretta.stato)
        p.esci()
    }

    @Test
    fun `approvare con Annulla, respingere col motivo, e il collaboratore che non approva`() = runBlocking {
        val (_, marco) = entra("marco@esempio.it")
        val desc = unico("Da approvare")
        val riga = marco.salvaOre(RigaOre(data = oggi, ore = 3.0, idCommessa = "26ST001", descrizione = desc).perSalvare())
        try {
            marco.daApprovare()
            fail("il collaboratore non approva")
        } catch (e: PonteServer.PermessoNegato) {
            assertTrue(e.message!!.isNotBlank())
        }
        val (_, manuel) = entra("manuel@esempio.it")
        val d = manuel.daApprovare()
        val voce = d.voci.first { it.tipo == "ore" && it.id == riga.id }
        assertTrue(d.tutteLeChiavi().contains(voce.chiave))
        assertEquals(1, manuel.approva(listOf(voce)).fatte)
        assertEquals(0, manuel.approva(listOf(voce)).fatte) // ripetuta dalla coda: non conta
        assertEquals(StatoVoce.APPROVATA, marco.ore(oggi, oggi).ore.first { it.id == riga.id }.stato)
        manuel.annullaApprovazione(listOf(voce))
        assertEquals(StatoVoce.DA_APPROVARE, marco.ore(oggi, oggi).ore.first { it.id == riga.id }.stato)
        try {
            manuel.respingi(listOf(voce), " ")
            fail("il motivo è obbligatorio")
        } catch (e: PonteServer.Rifiutato) {
            assertEquals("Scrivi il motivo: arriva a chi l'ha scritta", e.message)
        }
        manuel.respingi(listOf(voce), "Controlla le ore")
        val respinta = marco.ore(oggi, oggi).ore.first { it.id == riga.id }
        assertEquals(StatoVoce.RESPINTA, respinta.stato)
        assertEquals("Controlla le ore", respinta.motivoRifiuto)
        assertEquals("Manuel Gasparotto", respinta.approvataDaNome)
        // Nella sua Dashboard c'è la voce respinta; in quella di Manuel le cose da approvare.
        val dm = Dashboard.daJson(marco.dashboard())
        assertTrue(dm.urgenti.any { it.tipo == "respinta" })
        assertNull(dm.fase3.approvare)
        assertNotNull(dm.fase3.ore)
        assertNotNull(Dashboard.daJson(manuel.dashboard()).fase3.approvare)
        marco.esci(); manuel.esci()
    }

    @Test
    fun `una spesa con lo scontrino passa dalla coda, senza doppioni`() = runBlocking {
        val (marco, p) = entra("marco@esempio.it")
        val foto = cartella.newFile("scontrino.png").apply { writeBytes(PNG) }
        val coda = CodaInvii(File(cartella.root, "coda.json"))
        val desc = unico("Pedaggio di prova")
        val s = Spesa(idLocale = "", data = oggi, importo = 8.4, categoria = "pedaggio", descrizione = desc, idCommessa = "26ST001", destinazione = Destinazione.CLIENTE, pagataDaMe = true)
        val chiave = "S-" + System.nanoTime()
        coda.spesa(chiave, s.perSalvare())
        coda.fotoSpesa(chiave, "prova" + System.nanoTime(), foto.path)
        val invio = InvioFase3(p, coda)
        val arrivata = (invio.esegui(coda.tutte().first()) as InvioFase3.Arrivato.UnaSpesa).spesa
        assertEquals(StatoVoce.DA_APPROVARE, arrivata.stato)
        assertEquals(8.4, arrivata.importo, 0.0) // i soldi della persona si vedono anche senza costi
        invio.esegui(coda.tutte().first())
        assertTrue(coda.tutte().isEmpty())
        val elenco = p.spese(oggi.withDayOfMonth(1), oggi.withDayOfMonth(oggi.lengthOfMonth()))
        val conFoto = elenco.spese.first { it.id == arrivata.id }
        assertEquals(1, conFoto.foto.size)
        // I tre riquadri rifatti sul telefono sono quelli del server.
        val t = ContiOreSpese.totaliSpese(elenco.spese)
        assertEquals(elenco.totali.cliente, t.cliente, 0.001)
        assertEquals(elenco.totali.studio, t.studio, 0.001)
        assertEquals(elenco.totali.personale, t.personale, 0.001)
        assertEquals(elenco.totali.daRimborsare, t.daRimborsare, 0.001)
        assertEquals(elenco.totali.senzaFoto, t.senzaFoto)

        // Una creazione arrivata senza che il telefono lo sappia (la risposta si è persa):
        // rimandata dalla coda con lo stesso idLocale, il server non ne crea un'altra.
        val desc2 = unico("Parcheggio rimandato")
        val chiave2 = "S-" + System.nanoTime()
        val corpo = s.copy(descrizione = desc2, importo = 3.0, categoria = "parcheggio").perSalvare()
        coda.spesa(chiave2, corpo)
        val prima = p.salvaSpesa(JSONObject(corpo.toString()).put("idLocale", chiave2))
        val seconda = (invio.esegui(coda.tutte().first()) as InvioFase3.Arrivato.UnaSpesa).spesa
        assertEquals(prima.id, seconda.id)
        assertTrue(coda.tutte().isEmpty())
        assertEquals("nessun doppione", 1, p.spese(oggi, oggi).spese.count { it.descrizione == desc2 })
        p.esci()
    }

    @Test
    fun `le ore rimandate due volte dalla coda sono una riga sola, e una modifica fatta intanto arriva`() = runBlocking {
        val (marco, p) = entra("marco@esempio.it")
        val coda = CodaInvii(File(cartella.root, "coda-ore.json"))
        val invio = InvioFase3(p, coda)
        val desc = unico("Ore rimandate")
        val chiave = "O-" + System.nanoTime()
        val corpo = RigaOre(data = oggi, ore = 2.5, idCommessa = "26ST001", descrizione = desc, fatturabile = true).perSalvare()
        // Due volte lo stesso idLocale: la seconda risponde "giaArrivata" con la stessa riga.
        val uno = p.salvaOreDallaCoda(JSONObject(corpo.toString()).put("idLocale", chiave))
        val due = p.salvaOreDallaCoda(JSONObject(corpo.toString()).put("idLocale", chiave))
        assertFalse(uno.giaEsisteva)
        assertTrue(due.giaEsisteva)
        assertEquals(uno.dato.id, due.dato.id)
        assertEquals(1, p.ore(oggi, oggi, utente = marco.utente.id).ore.count { it.descrizione == desc })
        // Dalla coda, con la riga cambiata intanto (3 ore invece di 2,5): riconosciuta, poi mandata come modifica.
        coda.ore(chiave, RigaOre(data = oggi, ore = 3.0, idCommessa = "26ST001", descrizione = desc, fatturabile = true).perSalvare())
        invio.esegui(coda.tutte().first())
        assertEquals(uno.dato.id, coda.tutte().single().idRemoto)
        invio.esegui(coda.tutte().first())
        assertTrue(coda.tutte().isEmpty())
        val righe = p.ore(oggi, oggi, utente = marco.utente.id).ore.filter { it.descrizione == desc }
        assertEquals("una riga sola", 1, righe.size)
        assertEquals(3.0, righe.single().ore, 0.0)
        p.esci()
    }

    @Test
    fun `trasferte, rimborsi come i conti del telefono, segna rimborsato con Annulla`() = runBlocking {
        val (_, marco) = entra("marco@esempio.it")
        val t = marco.salvaTrasferta(Trasferta(dal = oggi, destinazione = unico("Zanè"), km = 11.0, andataRitorno = true, idCommessa = "26ST001").perSalvare())
        assertEquals(22.0, t.kmTotali, 0.0)
        assertEquals(ContiOreSpese.rimborsoTrasferta(11.0, true, t.euroKm, 0.0).rimborsoKm, t.rimborsoKm, 0.0)
        assertEquals(StatoVoce.DA_APPROVARE, t.stato)

        val (_, manuel) = entra("manuel@esempio.it")
        val da = LocalDate.of(2000, 1, 1)
        val a = LocalDate.of(2100, 12, 31)
        val r = manuel.rimborsi()
        assertTrue(r.puoSegnare)
        val calcolati = ContiOreSpese.rimborsiDovuti(manuel.spese(da, a).spese, manuel.trasferte(da, a).trasferte)
        for (p in r.persone) {
            val c = calcolati.first { it.idUtente == p.idUtente }
            assertEquals("totale di ${p.nome}", p.totale, c.totale, 0.001)
            assertEquals("in attesa di ${p.nome}", p.inAttesa, c.inAttesa, 0.001)
            assertEquals("km di ${p.nome}", p.km, c.km, 0.001)
        }
        val dovuta = r.persone.firstOrNull { it.totale > 0 }
        if (dovuta != null) {
            val (fatte, totale) = manuel.segnaRimborsato(dovuta.voci)
            assertEquals(dovuta.voci.size, fatte)
            assertEquals(dovuta.totale, totale, 0.001)
            assertTrue(manuel.rimborsi().persone.none { it.idUtente == dovuta.idUtente && it.totale > 0 })
            manuel.segnaRimborsato(dovuta.voci, annulla = true)
            assertEquals(dovuta.totale, manuel.rimborsi().persone.first { it.idUtente == dovuta.idUtente }.totale, 0.001)
        }
        // Il collaboratore vede solo la sua scheda e non segna.
        val rm = marco.rimborsi()
        assertFalse(rm.puoSegnare)
        assertTrue(rm.persone.all { it.nome.startsWith("Marco") })
        marco.esci(); manuel.esci()
    }

    @Test
    fun `veicoli e riepilogo, e i rapportini con lo stato dell'approvazione`() = runBlocking {
        val (_, manuel) = entra("manuel@esempio.it")
        val v = manuel.salvaVeicolo(Veicolo(nome = unico("Furgone"), alimentazione = "gasolio", euroKm = 0.5432))
        assertEquals(0.5432, v.euroKm!!, 0.0)
        assertTrue(manuel.veicoli().veicoli.any { it.id == v.id })
        manuel.salvaVeicolo(v.copy(attivo = false))
        assertTrue(manuel.veicoli().veicoli.none { it.id == v.id })
        assertTrue(manuel.veicoli(tutti = true).veicoli.any { it.id == v.id && !it.attivo })
        val riep = manuel.riepilogoSpese(oggi.withDayOfMonth(1), oggi.withDayOfMonth(oggi.lengthOfMonth()), "categoria")
        assertEquals("categoria", riep.per)
        riep.righe.forEach { x -> assertEquals(x.nome, ContiOreSpese.centesimi(x.cliente + x.studio + x.rimborsoKm + x.indennita), x.totale, 0.001) }
        // Per commessa: il nome del cliente in nomeCliente, i soldi di nuovo numeri (il difetto del 22/10 è sistemato).
        val perCommessa = manuel.riepilogoSpese(oggi.withDayOfMonth(1), oggi.withDayOfMonth(oggi.lengthOfMonth()), "commessa")
        assertTrue(perCommessa.righe.isNotEmpty())
        perCommessa.righe.forEach { x -> assertEquals(x.nome, ContiOreSpese.centesimi(x.cliente + x.studio + x.rimborsoKm + x.indennita), x.totale, 0.001) }
        assertTrue(perCommessa.righe.any { it.chiave.isNotBlank() && it.nomeCliente.isNotBlank() })

        val (_, marco) = entra("marco@esempio.it")
        try {
            marco.salvaVeicolo(Veicolo(nome = "No"))
            fail("il collaboratore non cambia i veicoli")
        } catch (e: PonteServer.PermessoNegato) {
            assertTrue(e.message!!.isNotBlank())
        }
        val io = marco.io()
        assertEquals(false, io.interfaccia.puoApprovare)
        assertEquals(false, io.interfaccia.puoSegnareRimborsi)
        val rap = marco.rapportini(oggi.minusMonths(2), oggi.plusDays(1))
        assertTrue(rap.isNotEmpty())
        assertTrue("i rapportini di Marco aspettano l'approvazione", rap.any { it.statoApprovazione.isNotBlank() })
        manuel.esci(); marco.esci()
    }

    @Test
    fun `statistiche, file per Excel e lo scontrino tolto, come li fa il computer`() = runBlocking {
        val (_, manuel) = entra("manuel@esempio.it")
        val (marcoA, marco) = entra("marco@esempio.it")
        val da = oggi.withDayOfMonth(1)
        val a = oggi.withDayOfMonth(oggi.lengthOfMonth())
        // Marco registra ore e le manda: contano nelle statistiche (le bozze no).
        val desc = unico("Ore per le statistiche")
        marco.salvaOre(RigaOre(idLocale = "", data = oggi, ore = 2.5, idCommessa = "26ST001", fatturabile = true, descrizione = desc).perSalvare())

        val perPersona = manuel.statisticheOre(da, a, "persona")
        assertEquals("persona", perPersona.per)
        assertTrue(perPersona.righe.any { it.chiave == marcoA.utente.id })
        perPersona.righe.forEach { r ->
            assertTrue(r.nome, r.fatturabili <= r.ore + 0.001)
            assertEquals(r.nome, RigaStatisticaOre.percentuale(r.fatturabili, r.ore), r.percentuale)
            assertNotNull("Manuel ha i soldi: il costo c'è", r.costo)
        }
        assertEquals(ContiOreSpese.centesimi(perPersona.righe.sumOf { it.ore }), perPersona.totale!!.ore, 0.01)
        val perCommessa = manuel.statisticheOre(da, a, "commessa")
        assertTrue(perCommessa.righe.any { it.chiave == "26ST001" && it.nome.isNotBlank() })
        assertEquals("le stesse ore, contate in due modi", perPersona.totale!!.ore, perCommessa.totale!!.ore, 0.01)
        // Il collaboratore vede solo le sue, e senza costo.
        val sue = marco.statisticheOre(da, a, "persona")
        assertTrue(sue.righe.all { it.chiave == marcoA.utente.id })
        assertTrue(sue.righe.all { it.costo == null })

        // I file per Excel di ore, spese, trasferte e rimborsi (§14.14).
        for (cosa in listOf("ore", "spese", "trasferte", "rimborsi")) {
            val filtri = if (cosa == "rimborsi") emptyList() else listOf("da" to da.toString(), "a" to a.toString())
            val (nome, _, byte) = manuel.esporta(cosa, null, filtri)
            val testo = String(byte, Charsets.UTF_8).removePrefix("\uFEFF")
            assertTrue("$cosa: $nome", nome.endsWith(".csv"))
            assertTrue("$cosa: " + testo.take(80), testo.contains(";"))
        }
        val (_, _, settimana) = manuel.esporta("ore", null, listOf("da" to oggi.toString(), "a" to oggi.toString(), "utente" to marcoA.utente.id))
        val righe = String(settimana, Charsets.UTF_8).lines().filter { it.isNotBlank() }
        assertTrue("le ore di Marco di oggi", righe.drop(1).any { it.contains(desc) })
        // La seconda colonna è la persona (in "Approvata o respinta da" può esserci Manuel).
        assertTrue("solo Marco", righe.drop(1).all { it.split(';')[1] == marcoA.utente.nome })

        // Lo scontrino di una spesa già sul server: si toglie (va nel cestino), la spesa resta.
        val foto = cartella.newFile("scontrino-da-togliere.png").apply { writeBytes(PNG) }
        val s = marco.salvaSpesa(Spesa(idLocale = "", data = oggi, importo = 5.0, categoria = "parcheggio", descrizione = unico("Parcheggio con foto"), destinazione = Destinazione.STUDIO, pagataDaMe = true).perSalvare())
        val f = marco.caricaFotoSpesa(s.id, "prova-togli-" + System.nanoTime(), foto)
        assertEquals(1, marco.spese(oggi, oggi).spese.first { it.id == s.id }.foto.size)
        assertTrue("il file si scarica", marco.file(f.id).first.isNotEmpty())
        val dopo = marco.togliFotoSpesa(f.id)
        assertEquals(s.id, dopo.id)
        assertTrue(dopo.foto.isEmpty())
        assertTrue(marco.spese(oggi, oggi).spese.first { it.id == s.id }.foto.isEmpty())
        manuel.esci(); marco.esci()
    }

    private companion object {
        /** Un PNG di un punto: basta per lo scontrino. */
        val PNG: ByteArray = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
    }
}
