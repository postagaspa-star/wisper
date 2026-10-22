package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.LocalDate
import java.time.LocalDateTime

/**
 * La fase 5 contro il server di prova vero (architettura.md §16), come
 * ServerDiProvaFase4Test:
 *
 *     node server/src/avvio.js --prova --porta 8431 --dati <cartella temporanea nuova>
 *     WISPER_SERVER_PROVA=http://localhost:8431 ./gradlew :app:testDebugUnitTest
 *
 * Senza la variabile si saltano. Il giro del ticket passa dalla coda del telefono
 * (InvioFase5, come quando torna la rete), ripetendo apposta gli invii: il server
 * deve riconoscerli (idLocale, idFile, azioni ripetute uguali).
 */
class ServerDiProvaFase5Test {
    @get:Rule val cartella = TemporaryFolder()
    private val indirizzo = System.getenv("WISPER_SERVER_PROVA").orEmpty()

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-app-5", "dispNome" to "prove unitarie", "app" to "telefono prove") })
    private fun entra(email: String): PonteServer = runBlocking { ponte(ponte("").accedi(email, "prova").token) }

    private val unico = System.nanoTime().toString().takeLast(6)

    @Test
    fun `il giro del ticket, dalla telefonata a Da fatturare, con la coda che ripete`() = runBlocking {
        val p = entra("manuel@esempio.it")
        val f5 = Fase5(p)
        val f4 = Fase4(p)
        val coda = CodaInvii(cartella.newFile("coda.json").apply { delete() })
        val invio = InvioFase5(f5)
        val idLocale = "T-prova$unico"
        val titolo = "Presa bruciata $unico"

        // 1. Nuovo ticket senza rete (in coda col suo idLocale), mandato due volte: uno solo.
        val numero = ContiTicket.numeroProposto(p.anagrafiche().numerazioni.firstOrNull { it.tipo == "ticket" })
        val op = coda.ticket(idLocale, JSONObject().put("idLocale", idLocale).put("numero", numero).put("idCliente", "C002").put("idSede", 5)
            .put("titolo", titolo).put("impatto", "ridotto").put("urgenza", "presto").put("origine", "telefono"))
        invio.esegui(op)
        invio.esegui(op)
        val elenco = f5.tickets("aperti")
        assertEquals("rimandato due volte = uno solo", 1, elenco.ticket.count { it.titolo == titolo })
        var t = f5.ticket(idLocale)
        assertEquals(idLocale, t.idLocale)
        assertEquals("normale", t.priorita)
        assertEquals("aperto", t.stato)
        assertEquals("prendi", t.giallo)

        // 2. Prendo io (anche questo dalla coda, ripetuto).
        val prendi = coda.azioneTicket(idLocale, JSONObject().put("azione", "prendiTicket"))
        invio.esegui(prendi); invio.esegui(prendi)
        t = f5.ticket(t.id)
        assertEquals("in_carico", t.stato)
        assertEquals("1", t.responsabileId)
        assertEquals("pianifica", t.giallo)

        // 3. Pianifica l'intervento (adesso meno un'ora: è "di oggi o passato", il giallo diventa Scrivi il rapportino).
        val inizio = LocalDateTime.now().withNano(0).withSecond(0).minusHours(1)
        val (_, attivita) = try {
            f5.pianificaTicket(t.id, inizio, inizio.plusHours(1), "", "", "", false)
        } catch (e: PonteServer.DaConfermare) {
            f5.pianificaTicket(t.id, inizio, inizio.plusHours(1), "", "", "", true)
        }
        assertNotNull(attivita)
        assertEquals(TipoAttivita.INTERVENTO, attivita!!.tipo)
        assertEquals(t.id, attivita.idTicket)
        t = f5.ticket(t.id)
        assertEquals(1, t.interventi.size)
        assertEquals("rapportino", t.giallo)

        // 4. Ore e spesa del ticket (i moduli della fase 3, col ticket).
        val ore = p.salvaOre(RigaOre(data = LocalDate.now(), ore = 0.5, descrizione = "Assistenza al telefono $unico", fatturabile = true, idTicket = t.id).perSalvare())
        assertEquals(t.id, ore.idTicket)
        val spesa = p.salvaSpesa(Spesa(idLocale = "", data = LocalDate.now(), importo = 12.4, categoria = "materiale", descrizione = "Presa industriale $unico",
            destinazione = Destinazione.CLIENTE, idCliente = "C002", idTicket = t.id).perSalvare())
        assertEquals(t.id, spesa.idTicket)

        // 5. Il rapportino del ticket nato senza rete (idLocaleTicket): il campo Ticket lo scrive il server.
        val r = p.salva(Rapportino.nuovo("Manuel Gasparotto").copy(idCliente = "C002", cliente = "Rossi Impianti Srl", idLocaleTicket = idLocale,
            descrizione = "Sostituita la presa $unico", oreLavoro = 1.5, km = 12.0, tariffa = 45.0))
        assertEquals(t.id, r.idTicket)
        assertEquals(t.numero, r.numeroTicket)
        assertEquals(t.numero, r.ticket)
        // La firma (dalla coda, come sempre): il rapportino è firmato e il giallo diventa Segna risolto.
        val firma = cartella.newFile("firma.png").apply { writeBytes(PNG) }
        p.caricaFile("firma", r.idLocale, r.id, "F-firma$unico", firma, "image/png", "Sig. Rossi", LocalDateTime.now().withNano(0).toString())
        t = f5.ticket(t.id)
        assertEquals("risolvi", t.giallo)
        assertTrue(t.rapportini.single().firmato)

        // 6. Il lavoro è finito: risolto (dalla coda, ripetuto).
        val risolvi = coda.azioneTicket(t.numero, JSONObject().put("azione", "risolviTicket"))
        invio.esegui(risolvi); invio.esegui(risolvi)
        t = f5.ticket(t.id)
        assertEquals("risolto", t.stato)
        assertEquals("chiudi", t.giallo)

        // Finché il ticket non è chiuso, il suo rapportino non è in Da fatturare.
        assertTrue(f4.daFatturare().tutte.none { it.tipo == "rapportino" && it.id == r.id })

        // 7. Chiudi con una riga: in Da fatturare una volta sola, e il rapportino non da solo.
        val (chiuso, voce) = f5.chiudiTicket(t.id, "ticket", null, "", false)
        assertEquals("chiuso", chiuso.stato)
        assertNotNull(voce)
        assertEquals(t.numero, voce!!.testo("id"))
        val df = f4.daFatturare().tutte
        assertEquals("una voce sola", 1, df.count { it.tipo == "ticket" && it.id == t.numero })
        assertTrue("il rapportino va con la riga del ticket", df.none { it.tipo == "rapportino" && it.id == r.id })
        val tk = df.first { it.tipo == "ticket" && it.id == t.numero }
        assertEquals("ticket:${t.numero}", tk.gruppo)
        // Richiuso uguale: ok, niente di nuovo.
        f5.chiudiTicket(t.id, "ticket", null, "", false)
        assertEquals(1, f4.daFatturare().tutte.count { it.tipo == "ticket" && it.id == t.numero })
    }

    @Test
    fun `documenti col caricamento in byte, il collegamento, la revisione e la scadenza fatta`() = runBlocking {
        val p = entra("manuel@esempio.it")
        val f5 = Fase5(p)
        val pdf = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF $unico\n".toByteArray()
        val idFile = "F-doc$unico"

        // /carica in byte, ripetuto con lo stesso idFile: lo stesso file.
        val a = f5.carica("Relazione $unico.pdf", "application/pdf", idFile, "documento", pdf)
        val b = f5.carica("Relazione $unico.pdf", "application/pdf", idFile, "documento", pdf)
        assertEquals(a.id, b.id)
        assertEquals(pdf.size.toLong(), a.byte)
        val categorie = f5.categorie()
        val relazioni = categorie.first { it.nome == "Relazioni e collaudi" }
        val (d, _) = f5.salvaDocumento(JSONObject().put("origine", "file").put("idFile", a.id).put("titolo", "Relazione $unico").put("idCategoria", relazioni.id.toInt()).put("idCliente", "C002"))
        assertEquals("file", d.origine)
        assertEquals("Valida", d.statoVisto) // la carica chi approva: approvata subito
        assertEquals(0, d.revisione)

        // Una revisione con la sua nota: la nuova valida.
        val pdf2 = (String(pdf) + "rev1").toByteArray()
        val c = f5.carica("Relazione $unico rev1.pdf", "application/pdf", "F-doc1$unico", "documento", pdf2)
        val d1 = f5.caricaVersione(d.id, c.id, "Aggiunte le misure")
        assertEquals(1, d1.revisione)
        assertEquals(listOf("Valida", "Superata"), d1.versioni.map { it.statoVisto })
        try {
            f5.caricaVersione(d.id, f5.carica("x.pdf", "application/pdf", "F-doc2$unico", "documento", (String(pdf) + "2").toByteArray()).id, "")
            fail("doveva chiedere cosa cambia")
        } catch (e: PonteServer.Rifiutato) {
            assertEquals("Scrivi cosa cambia in questa revisione", e.message)
        }

        // Un collegamento di OneDrive (come dal Condividi del telefono).
        val url = "https://esempio-my.sharepoint.com/:f:/g/personal/studio/Clienti/Prova$unico"
        assertEquals("onedrive", Collegamenti.tipo(url)!!.tipo)
        val (col, _) = f5.salvaDocumento(JSONObject().put("url", url).put("titolo", "Cartella $unico").put("idCategoria", categorie.first { it.nome == "Documenti dello studio" }.id.toInt()))
        assertEquals("collegamento", col.origine)
        assertEquals("onedrive", col.collegamentoTipo)
        assertTrue(col.cartella)
        assertEquals(listOf("Le revisioni le tiene OneDrive"), col.righe)

        // La ricerca la trova.
        assertTrue(f5.documenti(FiltroArchivio(testo = "relazione $unico")).documenti.any { it.id == d.id })

        // Una scadenza segnata fatta dalla coda, ripetuta: una sola prossima.
        val scadenza = Scadenza.daJson(JSONObject().put("id", f5.salvaScadenza(JSONObject().put("tipo", "altro").put("titolo", "Polizza $unico").put("data", LocalDate.now().plusDays(10).toString()).put("ogniMesi", 12)).id).put("titolo", "x"))
        val coda = CodaInvii(cartella.newFile("coda.json").apply { delete() })
        val op = coda.faiScadenza(scadenza.id, JSONObject().put("data", LocalDate.now().toString()))
        val invio = InvioFase5(f5)
        invio.esegui(op); invio.esegui(op)
        val aperte = f5.scadenze(listOf("stato" to "tutte")).tutte.filter { it.titolo == "Polizza $unico" }
        assertEquals("la fatta e una prossima", 2, aperte.size)
        assertEquals(1, aperte.count { it.stato == "fatta" })
        assertEquals(1, aperte.count { it.stato == "aperta" })
    }

    @Test
    fun `il collaboratore vede i suoi e quelli da prendere, non chiude e non carica documenti`() = runBlocking {
        val marco = Fase5(entra("marco@esempio.it"))
        val l = marco.tickets("aperti")
        assertTrue(l.ticket.all { it.responsabileId.isBlank() || it.responsabileId == "3" })
        assertNotNull(l.conteggi.miei)
        val suo = l.ticket.firstOrNull { it.responsabileId == "3" } ?: l.ticket.first()
        try {
            marco.chiudiTicket(suo.id, "ticket", 50.0, "", false)
            fail("il collaboratore non chiude")
        } catch (e: PonteServer.PermessoNegato) {
            assertEquals("Il ticket lo chiude l'ufficio: tu segnalo risolto", e.message)
        }
        try {
            marco.carica("x.pdf", "application/pdf", "F-marco$unico", "documento", "%PDF-1.4\n".toByteArray())
            fail("il collaboratore non carica documenti")
        } catch (e: PonteServer.PermessoNegato) {
            assertTrue(e.message, e.message!!.contains("caricare documenti"))
        }
        // I documenti li legge (tranne quelli dei prezzi).
        assertTrue(marco.documenti(FiltroArchivio()).documenti.none { it.vede == "costi" })
    }

    private companion object {
        /** Un PNG di un punto: basta per la firma. */
        val PNG: ByteArray = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
    }
}
