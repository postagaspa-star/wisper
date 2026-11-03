package eu.stgm.wisper.rapportino

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * La dashboard calcolata sul telefono (visita guidata, e prima che arrivi quella
 * del server), con le regole di docs/gestionale/fase1-schermate.md §3.
 */
class CosaFareTest {
    /** Mercoledì 21 ottobre 2026. */
    private val oggi = LocalDate.of(2026, 10, 21)

    private val ana = Anagrafiche(
        clienti = listOf(
            Cliente("C001", "Elettrodinamica", tariffaFissa = 30.0, codiceSdi = "M5UXCR1", partitaIva = "01234567897"),
            Cliente("C002", "Rossi Impianti Srl", ultimaTariffa = 42.0, partitaIva = "04455667788"),
        ),
        commesse = listOf(
            Commessa("26ST044", "C001", "Nuovo magazzino", budgetOre = 120.0, finePrevista = LocalDate.of(2026, 10, 23), idResponsabile = "1"),
            Commessa("26ST045", "C002", "Quadro capannone", budgetOre = 10.0, prezzoOrario = 42.0, idResponsabile = "1"),
            Commessa("26ST046", "C001", "Linea 3", budgetOre = 24.0, finePrevista = LocalDate.of(2026, 10, 17)),
            Commessa("26ST047", "C002", "Fotovoltaico", idResponsabile = "1"),
            Commessa("26ST043", "C002", "Cabina", stato = "SOSPESA"),
            Commessa("25ST118", "C001", "Revamping", stato = "CHIUSA"),
            Commessa("26ST030", "C002", "Modello", modello = true),
        ),
        impostazioni = mapOf("EURO_KM" to "0.76"),
        utenti = listOf(Utente("1", "Manuel Gasparotto", ruolo = Ruoli.TITOLARE)),
    )

    private fun r(n: Int, data: LocalDate, idCommessa: String, ore: Double, stato: Stato): Rapportino {
        val m = ana.commessa(idCommessa)!!
        val c = ana.cliente(m.idCliente)!!
        val base = Rapportino(
            idLocale = "W-$n", data = data, idCliente = c.id, cliente = c.nome, idCommessa = m.id, commessa = m.descrizione,
            oreLavoro = ore, tariffa = c.ultimaTariffa, id = "RAP/2026/00$n", stato = stato, descrizione = "lavoro",
        )
        return base.copy(conto = Calcolo.calcola(base, ana.regoleDi(c, m)))
    }

    private val rapportini = listOf(
        r(1, LocalDate.of(2026, 10, 19), "26ST044", 8.0, Stato.FIRMATO),       // lunedì: fatto, martedì manca
        r(2, LocalDate.of(2026, 10, 6), "26ST045", 6.0, Stato.BOZZA),          // da firmare da più di una settimana
        r(3, LocalDate.of(2026, 10, 7), "26ST045", 6.0, Stato.INVIATO),        // oltre il budget (12 su 10)
        r(4, LocalDate.of(2026, 9, 15), "26ST045", 4.0, Stato.INVIATO),        // di settembre, da fatturare
    )

    @Test
    fun `prima i problemi, e la cosa piu' urgente sono i soldi dei mesi prima`() {
        val d = CosaFare.calcola(ana, rapportini, oggi)
        assertEquals("fatturare", d.urgenti.first().tipo)
        assertTrue(d.urgenti.first().titolo.startsWith("1 rapportino di settembre"))
        assertEquals("fatturazione", d.urgenti.first().collegamento!!.pagina)
        val tipi = d.urgenti.map { it.tipo }
        assertTrue("budget" in tipi)
        assertTrue("scadenza" in tipi)
        assertTrue("firma" in tipi)
        assertEquals("26ST045", d.urgenti.first { it.tipo == "budget" }.collegamento!!.id)
        assertTrue(d.urgenti.first { it.tipo == "scadenza" }.titolo.contains("scaduta da 4 giorni"))
    }

    @Test
    fun `la settimana, il giorno che manca, la commessa che finisce, da fatturare del mese`() {
        val d = CosaFare.calcola(ana, rapportini, oggi)
        val giorno = d.settimana.first { it.tipo == "giorno" }
        assertEquals("Martedì 20 senza rapportino", giorno.titolo)
        assertEquals("2026-10-20", giorno.collegamento!!.id)
        assertTrue(d.settimana.any { it.tipo == "fine" && it.titolo.startsWith("Nuovo magazzino finisce venerdì") })
        val soldi = d.settimana.first { it.tipo == "fatturare" }
        assertTrue(soldi.quanto!! > 0)
    }

    @Test
    fun `da pianificare, senza budget, senza responsabile, senza SDI e PEC`() {
        val d = CosaFare.calcola(ana, rapportini, oggi)
        assertTrue(d.pianificare.any { it.titolo == "Fotovoltaico non ha un budget" })
        assertTrue(d.pianificare.any { it.tipo == "responsabile" && it.collegamento!!.id == "26ST046" })
        assertTrue(d.pianificare.any { it.tipo == "sdi" && it.collegamento!!.id == "C002" })
        assertFalse(d.pianificare.any { it.tipo == "sdi" && it.collegamento!!.id == "C001" })
    }

    @Test
    fun `i numeri delle commesse, modelli e archiviate non contano`() {
        val d = CosaFare.calcola(ana, rapportini, oggi)
        assertEquals(NumeriCommesse(aperte = 4, sospese = 1, inRitardo = 1, chiuse = 1), d.commesse)
    }

    @Test
    fun `senza i soldi niente importi e niente voci di soldi`() {
        val d = CosaFare.calcola(ana, rapportini, oggi, costi = false)
        val tutte = d.urgenti + d.settimana + d.pianificare
        assertFalse(tutte.any { it.tipo == "fatturare" || it.tipo == "sdi" })
        assertTrue(tutte.all { it.quanto == null })
    }

    @Test
    fun `chi non scrive rapportini non ha i giorni che mancano`() {
        val d = CosaFare.calcola(ana, rapportini, oggi, scriveRapportini = false)
        assertFalse(d.settimana.any { it.tipo == "giorno" })
    }
}
