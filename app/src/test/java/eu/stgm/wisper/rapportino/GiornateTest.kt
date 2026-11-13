package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * Il rapportino con più lavori (docs/gestionale/rapportino-lavori.md): come si raggruppano i lavori, il riassunto
 * degli stati, cosa si toglie, la divisione per destinatario dell'invio (un'email per chi paga, solo i suoi lavori),
 * oggetto e frase dell'email (server/prove/casi-invio.json), il primo argomento del PDF e la forma per il server.
 */
class GiornateTest {

    private val giorno = LocalDate.of(2026, 11, 5)

    private val ana = Anagrafiche(
        clienti = listOf(
            Cliente("C001", "Elettrodinamica", email = "ufficio@elettrodinamica.esempio.it", tariffaFissa = 30.0),
            Cliente("C002", "Rossi Impianti Srl", email = "amministrazione@rossi.esempio.it"),
            Cliente("C003", "Mario Bianchi", email = ""),
        ),
    )

    private fun lavoro(
        idLocale: String, idCliente: String, cliente: String, stato: Stato = Stato.BOZZA, data: LocalDate = giorno,
        idGiornata: String = "", idLocaleGiornata: String = "", posizione: Int = 0, id: String = "",
    ) = Rapportino(
        idLocale = idLocale, data = data, tecnico = "Manuel Gasparotto", idCliente = idCliente, cliente = cliente,
        descrizione = "Lavoro $idLocale", oreLavoro = 2.0, stato = stato, id = id,
        idGiornata = idGiornata, idLocaleGiornata = idLocaleGiornata, posizione = posizione,
    )

    // Un rapportino del server con tre lavori di due clienti, in disordine; uno di prima con un lavoro solo; uno nato sul telefono.
    private val l3 = lavoro("w3", "C002", "Rossi Impianti Srl", idGiornata = "RAP/2026/0153", posizione = 3, id = "RAP/2026/0153-3")
    private val l1 = lavoro("w1", "C001", "Elettrodinamica", Stato.INVIATO, idGiornata = "RAP/2026/0153", posizione = 1, id = "RAP/2026/0153")
    private val vecchio = lavoro("w9", "C003", "Mario Bianchi", Stato.FIRMATO, data = giorno.minusDays(2), id = "RAP/2026/0140")
    private val l2 = lavoro("w2", "C002", "Rossi Impianti Srl", idGiornata = "RAP/2026/0153", posizione = 2, id = "RAP/2026/0153-2")
    private val nuovo = lavoro("w5", "C003", "Mario Bianchi", data = giorno.plusDays(1), idLocaleGiornata = "G-telefono", posizione = 1)

    @Test
    fun `i lavori si raggruppano per rapportino, nell'ordine dei lavori`() {
        val gruppi = Giornate.raggruppa(listOf(nuovo, l3, l1, vecchio, l2)) { it }
        assertEquals(listOf("G-telefono", "RAP/2026/0153", "RAP/2026/0140"), gruppi.map { it.chiave })
        val g = gruppi[1]
        assertEquals(listOf("w1", "w2", "w3"), g.voci.map { it.idLocale })
        assertEquals("RAP/2026/0153", g.id)
        assertEquals("R-RAP/2026/0153", g.idLocale)
        // Il lavoro di prima è un rapportino con un lavoro solo, col suo numero.
        assertEquals("RAP/2026/0140", gruppi[2].id)
        assertEquals(listOf("w9"), gruppi[2].voci.map { it.idLocale })
        // Quello nato sul telefono non ha ancora il numero: si riconosce dall'idLocale.
        assertEquals("", gruppi[0].id)
        assertEquals("G-telefono", gruppi[0].idLocale)
        // Riaperto: lo stesso rapportino coi suoi lavori.
        val giornata = Giornate.giornataDi(g)
        assertEquals(giorno, giornata.data)
        assertEquals(3, giornata.lavori.size)
    }

    @Test
    fun `riassunto degli stati, lavori e clienti`() {
        val lavori = listOf(l1, l2, l3)
        assertEquals("2 da inviare · 1 inviato", Giornate.riassunto(lavori))
        assertEquals("3 lavori · per 2 clienti", Giornate.lavoriEClienti(lavori))
        assertEquals("1 da inviare", Giornate.riassunto(listOf(vecchio)))
        assertEquals("1 lavoro · per 1 cliente", Giornate.lavoriEClienti(listOf(vecchio)))
        assertEquals("1 inviato · 2 fatturati", Giornate.riassunto(listOf(l1, l2.copy(stato = Stato.FATTURATO), l3.copy(stato = Stato.FATTURATO))))
        // Il FIRMATO di prima è da inviare: la firma non c'è più.
        assertEquals("Da inviare", Giornate.parolaStato(Stato.FIRMATO))
        assertTrue(vecchio.daInviare)
    }

    @Test
    fun `si toglie un lavoro se non è fatturato (anche inviato), si elimina un rapportino se nessun lavoro lo è`() {
        assertTrue(Giornate.puoTogliere(l2))
        assertTrue(Giornate.puoTogliere(vecchio))
        assertTrue("dal 13/11/2026 anche un inviato", Giornate.puoTogliere(l1))
        assertFalse(Giornate.puoTogliere(l2.copy(stato = Stato.FATTURATO)))
        assertTrue(Giornate.puoEliminare(listOf(l2, l3)))
        assertTrue(Giornate.puoEliminare(listOf(l1, l2, l3)))
        assertFalse(Giornate.puoEliminare(listOf(l1, l2.copy(stato = Stato.FATTURATO))))
        assertFalse(Giornate.puoEliminare(emptyList()))
        assertFalse("un inviato non è più bloccato", l1.bloccato)
        assertTrue(l1.copy(stato = Stato.FATTURATO).bloccato)
    }

    @Test
    fun `un lavoro inviato che cambia torna da inviare, quello rimasto uguale no`() {
        val inviato2 = l2.copy(stato = Stato.INVIATO, inviatoIl = "2026-11-06T09:00:00")
        val prima = listOf(l1, inviato2, l3)
        // Niente è cambiato: restano com'erano.
        assertEquals(listOf(Stato.INVIATO, Stato.INVIATO, Stato.BOZZA), Giornate.dopoLaModifica(prima, prima, false).map { it.stato })
        // Cambia un inviato (le ore): torna da inviare lui solo, senza la data dell'invio.
        val dopo = Giornate.dopoLaModifica(listOf(l1, inviato2.copy(oreLavoro = 3.5), l3), prima, false)
        assertEquals(listOf(Stato.INVIATO, Stato.BOZZA, Stato.BOZZA), dopo.map { it.stato })
        assertEquals("", dopo[1].inviatoIl)
        assertEquals(3.5, dopo[1].oreLavoro, 0.0)
        // Cambia la data del rapportino: tutti gli inviati tornano da inviare.
        assertEquals(listOf(Stato.BOZZA, Stato.BOZZA, Stato.BOZZA), Giornate.dopoLaModifica(prima, prima, true).map { it.stato })
        // Un fatturato non torna mai indietro da solo.
        val fatturato = l1.copy(stato = Stato.FATTURATO)
        assertEquals(Stato.FATTURATO, Giornate.dopoLaModifica(listOf(fatturato), listOf(fatturato), true).single().stato)
    }

    @Test
    fun `con un'indennità le ore non servono, e prima dell'invio la frase lo dice`() {
        val ind = listOf(Indennita(descrizione = "Indennità di trasferta", quantita = 1.0, prezzo = 30.0))
        val senza = l2.copy(oreLavoro = 0.0, indennita = ind)
        assertTrue(senza.indennitaSenzaOre)
        assertFalse(l2.copy(indennita = ind).indennitaSenzaOre)
        assertFalse(senza.copy(oreViaggio = 0.5).indennitaSenzaOre)
        assertFalse(l2.copy(oreLavoro = 0.0).indennitaSenzaOre)
        assertNull(Giornate.fraseSenzaOre(listOf(l1, l2, l3)))
        assertEquals("Nel lavoro per Rossi Impianti Srl c'è un'indennità ma non sono segnate ore.", Giornate.fraseSenzaOre(listOf(l1, senza)))
        assertEquals(
            "In 2 lavori ci sono indennità ma non sono segnate ore: Rossi Impianti Srl, Elettrodinamica.",
            Giornate.fraseSenzaOre(listOf(senza, l1.copy(oreLavoro = 0.0, indennita = ind), l3)),
        )
    }

    @Test
    fun `l'invio si divide per chi paga, ognuno coi suoi lavori soltanto`() {
        val altro = lavoro("w7", "C002", "Rossi Impianti Srl", data = giorno.minusDays(1), id = "RAP/2026/0150")
        val d = Giornate.dividi(listOf(l1, l2, l3, altro), ana)
        assertEquals(listOf("c:C001", "c:C002"), d.map { it.chiave })
        assertEquals(listOf("w1"), d[0].lavori.map { it.idLocale })
        assertEquals("ufficio@elettrodinamica.esempio.it", d[0].email)
        assertTrue(d[0].unSoloRapportino)
        // Rossi: due lavori del 153 e uno del 150, il più vecchio prima; due rapportini, quindi il riepilogo.
        assertEquals(listOf("w7", "w2", "w3"), d[1].lavori.map { it.idLocale })
        assertEquals(listOf("RAP/2026/0150", "RAP/2026/0153"), d[1].rapportini)
        assertFalse(d[1].unSoloRapportino)
        assertEquals("amministrazione@rossi.esempio.it", d[1].email)
        // Nessun lavoro va a due destinatari, nessuno si perde.
        assertEquals(4, d.sumOf { it.lavori.size })
        // Senza email in anagrafica il campo A resta vuoto.
        assertEquals("", Giornate.dividi(listOf(vecchio), ana).single().email)
    }

    @Test
    fun `oggetto e frase come casi-invio, il caso un rapportino solo anche con più lavori`() {
        val d = Giornate.dividi(listOf(l1, l2, l3), ana)
        // Rossi: due lavori dello stesso rapportino = "un rapportino solo".
        val rossi = Giornate.email(d[1], "Manuel Gasparotto")
        assertEquals("Rapportino RAP/2026/0153 del 05/11/2026", rossi.oggetto)
        assertEquals("Buongiorno,\nin allegato il rapportino del 05/11/2026.\n\nCordiali saluti\nManuel Gasparotto", rossi.messaggio)
        // Più rapportini: il periodo dei casi più il nome di chi riceve.
        val altro = lavoro("w7", "C002", "Rossi Impianti Srl", data = LocalDate.of(2026, 11, 3), id = "RAP/2026/0150")
        val due = Giornate.email(Giornate.dividi(listOf(l2, altro), ana).single(), "Manuel")
        assertEquals("Rapportini della settimana dal 3 al 5 novembre 2026 · Rossi Impianti Srl", due.oggetto)
        assertEquals("Buongiorno,\nin allegato il riepilogo dei rapportini della settimana dal 3 al 5 novembre 2026.\n\nCordiali saluti\nManuel", due.messaggio)
        // Il caso del file condiviso, uguale al computer e al server.
        val casi = JSONObject(File(cartellaProgetto(), "server/prove/casi-invio.json").readText()).getJSONArray("casi")
        val solo = (0 until casi.length()).map { casi.getJSONObject(it) }.first { it.getString("nome") == "un rapportino solo" }
        val uno = lavoro("w8", "C002", "Rossi Impianti Srl", data = LocalDate.parse(solo.getJSONArray("date").getString(0)), id = solo.getString("numero"))
        val e = Giornate.email(Giornate.dividi(listOf(uno), ana).single(), "Manuel")
        assertEquals(solo.getString("oggetto"), e.oggetto)
        assertTrue(e.messaggio.contains(solo.getString("frase")))
    }

    @Test
    fun `il primo argomento del PDF porta numero, data e lavori`() {
        val righe = listOf(l2, l3).map { it.comeDalFoglio() }
        val g = Giornate.perPdf(righe)
        assertEquals("RAP/2026/0153", g.getString("id"))
        assertEquals("RAP/2026/0153", g.getString("numero"))
        assertEquals("2026-11-05", g.getString("data").take(10))
        assertEquals("Manuel Gasparotto", g.getString("tecnico"))
        assertEquals(2, g.getJSONArray("lavori").length())
        assertEquals("Lavoro w3", g.getJSONArray("lavori").getJSONObject(1).getString("descrizione"))
        // Un modello di prima, che non sa dei lavori, stampa almeno il primo.
        assertEquals("Lavoro w2", g.getString("descrizione"))
    }

    @Test
    fun `al server partono i lavori allineati al rapportino`() {
        val g = Giornata("G-uno", data = giorno, tecnico = "Manuel Gasparotto", lavori = listOf(
            lavoro("a", "C001", "Elettrodinamica", data = giorno.minusDays(3)),
            lavoro("b", "C002", "Rossi Impianti Srl"),
            l1.copy(stato = Stato.FATTURATO, data = giorno.minusDays(5)),   // fatturato: la sua data non cambia
        ))
        val allineati = g.lavoriAllineati()
        assertEquals(listOf(1, 2, 3), allineati.map { it.posizione })
        assertEquals(listOf(giorno, giorno, giorno.minusDays(5)), allineati.map { it.data })
        assertTrue(allineati.all { it.idLocaleGiornata == "G-uno" })
        val s = g.perIlServer()
        assertEquals("G-uno", s.getString("idLocale"))
        assertFalse(s.has("id"))
        assertEquals("2026-11-05", s.getString("data"))
        assertEquals(3, s.getJSONArray("lavori").length())
        assertEquals("a", s.getJSONArray("lavori").getJSONObject(0).getString("idLocale"))
        // Dalla coda torna uguale.
        val riletta = Giornata.daJson(g.aJson())
        assertEquals(g.idLocale, riletta.idLocale)
        assertEquals(allineati.map { it.idLocale to it.posizione }, riletta.lavori.map { it.idLocale to it.posizione })
        // Col numero del server, il numero va anche ai lavori.
        assertEquals("RAP/2026/0160", g.copy(id = "RAP/2026/0160").perIlServer().getString("id"))
    }

    @Test
    fun `un no del server per un lavoro va su quel lavoro`() {
        assertEquals(2 to "Scegli il progetto", Giornate.erroreDelLavoro("Lavoro 2: scegli il progetto"))
        assertEquals(1 to "Manca il cliente", Giornate.erroreDelLavoro("Lavoro 1: Manca il cliente"))
        assertNull(Giornate.erroreDelLavoro("Aggiungi almeno un lavoro"))
        assertNull(Giornate.erroreDelLavoro("Il lavoro per Rossi Impianti Srl è in una fattura: non si toglie"))
    }

    /** La cartella del progetto (le prove girano da app/). */
    private fun cartellaProgetto(): File {
        var d: File? = File("").absoluteFile
        while (d != null && !File(d, "server/prove/casi-invio.json").exists()) d = d.parentFile
        return d ?: error("Non trovo server/prove/casi-invio.json")
    }
}
