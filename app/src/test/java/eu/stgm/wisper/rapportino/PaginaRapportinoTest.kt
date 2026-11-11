package eu.stgm.wisper.rapportino

import eu.stgm.wisper.ui.GiornataStato
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * La pagina unica del rapportino sul telefono (11/11/2026, "lo stesso editor a tre colonne anche sul telefono"): la
 * fila dei lavori, il lavoro scelto che si copia nella fila mentre si scrive, i lavori aggiunti e lasciati vuoti, il
 * controllo lavoro per lavoro a Salva rapportino.
 */
class PaginaRapportinoTest {
    private val giorno = LocalDate.of(2026, 10, 22)

    private fun scritto(g: GiornataStato, cliente: String, ore: Double): Rapportino =
        g.lavoroNuovo().copy(cliente = cliente, idCliente = "C1", oreLavoro = ore, descrizione = "Collaudo", tariffa = 42.0)

    @Test
    fun `un rapportino nuovo ha subito un lavoro scelto, con la scelta del cliente aperta`() {
        val g = GiornataStato(Giornata.nuova("Manuel", giorno), nuova = true)
        g.preparaPagina(scrive = true)
        assertNotNull(g.aperto)
        val m = g.aperto!!
        assertEquals(1, g.lavori.size)
        assertTrue(m.perChiAperto)
        // Un lavoro aggiunto e non toccato non e' una modifica: uscendo non si chiede niente.
        assertTrue(g.vuoto(g.lavori.first()))
        assertFalse(g.cambiata)
    }

    @Test
    fun `chi legge soltanto non trova lavori nuovi`() {
        val g = GiornataStato(Giornata.nuova("Manuel", giorno), nuova = true)
        g.preparaPagina(scrive = false)
        assertNull(g.aperto)
        assertTrue(g.lavori.isEmpty())
    }

    @Test
    fun `quello che si scrive va subito nel lavoro della fila`() {
        val g = GiornataStato(Giornata.nuova("Manuel", giorno), nuova = true)
        g.preparaPagina(scrive = true)
        val m = g.aperto!!
        m.cliente = "Rossi Impianti Srl"; m.idCliente = "C2"; m.oreLavoro = "6"; m.km = "48"
        g.sincronizza(m)
        val l = g.lavori.single()
        assertEquals("Rossi Impianti Srl", l.cliente)
        assertEquals(6.0, l.oreLavoro, 0.0)
        assertEquals(48.0, l.km, 0.0)
        assertEquals(g.idLocale, l.idLocaleGiornata)
        assertTrue(g.cambiata)
    }

    @Test
    fun `tornando a un lavoro si ritrova il suo modulo, anche la scelta a meta'`() {
        val g = GiornataStato(Giornata.nuova("Manuel", giorno), nuova = true)
        g.preparaPagina(scrive = true)
        val primo = g.aperto!!
        primo.cliente = "Rossi Impianti Srl"; primo.apriPerChi(commessa = true, progetto = false)
        g.sincronizza(primo)
        val secondo = g.aggiungiLavoro()
        assertEquals(2, g.lavori.size)
        assertSame(secondo, g.aperto)
        g.scegli(g.lavori.first())
        assertSame(primo, g.aperto)
        assertTrue(primo.perChiAperto && primo.sceltaCommessa)
        // "Lascia com'era" rimette il cliente di prima del Cambia.
        primo.cliente = "Altro"
        primo.annullaPerChi()
        assertEquals("Rossi Impianti Srl", primo.cliente)
        assertFalse(primo.perChiAperto)
    }

    @Test
    fun `a Salva rapportino i lavori lasciati vuoti escono, quelli scritti restano`() {
        val g = GiornataStato(Giornata.nuova("Manuel", giorno), nuova = true)
        g.preparaPagina(scrive = true)
        val m = g.aperto!!
        m.cliente = "Rossi Impianti Srl"; m.oreLavoro = "4"; m.descrizione = "Collaudo"
        g.sincronizza(m)
        g.aggiungiLavoro()
        assertEquals(2, g.lavori.size)
        g.togliVuoti()
        assertEquals(1, g.lavori.size)
        assertEquals("Rossi Impianti Srl", g.lavori.single().cliente)
        // Il lavoro scelto era quello vuoto: la pagina ne scegliera' un altro.
        assertNull(g.aperto)
    }

    @Test
    fun `si controllano solo i lavori nuovi o cambiati qui`() {
        val vecchia = Giornata.nuova("Manuel", giorno)
        val g0 = GiornataStato(vecchia, nuova = true)
        val a = scritto(g0, "Rossi Impianti Srl", 4.0).copy(stato = Stato.BOZZA)
        val b = scritto(g0, "Mario Bianchi", 2.0).copy(stato = Stato.BOZZA)
        val g = GiornataStato(vecchia.copy(lavori = listOf(a, b)), nuova = false)
        g.preparaPagina(scrive = true)
        assertFalse(g.daControllare(a))
        assertFalse(g.daControllare(b))
        assertFalse(g.cambiata)
        val m = g.moduloDi(b)
        m.oreLavoro = "3"
        g.sincronizza(m)
        assertTrue(g.daControllare(b))
        assertFalse(g.daControllare(a))
        assertTrue(g.cambiata)
        // Tornato com'era: niente da salvare.
        m.oreLavoro = "2"
        g.sincronizza(m)
        assertFalse(g.cambiata)
    }

    @Test
    fun `il controllo trova il campo che manca e il primo errore nell'ordine della pagina`() {
        val g = GiornataStato(Giornata.nuova("Manuel", giorno), nuova = true)
        g.preparaPagina(scrive = true)
        val m = g.aperto!!
        m.cliente = "Rossi Impianti Srl"; m.km = "abc"
        assertFalse(m.valida(Regole(), chiediTariffa = false))
        assertEquals("oreLavoro", m.primoErrore)
        m.oreLavoro = "6"
        assertFalse(m.valida(Regole(), chiediTariffa = false))
        assertEquals("descrizione", m.primoErrore)
        assertTrue(g.erroriDi(m.base.idLocale))
    }

    @Test
    fun `il riassunto di un rapportino con un lavoro senza cliente non dice per 0 clienti`() {
        val g = GiornataStato(Giornata.nuova("Manuel", giorno), nuova = true)
        g.preparaPagina(scrive = true)
        assertEquals("1 lavoro", g.riassunto)
    }
}
