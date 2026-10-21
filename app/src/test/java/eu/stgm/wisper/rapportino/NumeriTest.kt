package eu.stgm.wisper.rapportino

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** I numeri come li scrive una persona: con la virgola. */
class NumeriTest {

    @Test
    fun `legge la virgola e il punto`() {
        assertEquals(6.5, Numeri.leggi("6,5")!!, 0.0)
        assertEquals(6.5, Numeri.leggi("6.5")!!, 0.0)
        assertEquals(8.0, Numeri.leggi(" 8 ")!!, 0.0)
        assertEquals(1250.5, Numeri.leggi("1.250,50")!!, 0.0)
    }

    @Test
    fun `vuoto e testo non sono numeri`() {
        assertNull(Numeri.leggi(""))
        assertNull(Numeri.leggi("sei"))
        assertNull(Numeri.leggi(null))
    }

    @Test
    fun `scrive all'italiana`() {
        assertEquals("6,5", Numeri.scrivi(6.5))
        assertEquals("4", Numeri.scrivi(4.0))
        assertEquals("", Numeri.scrivi(0.0, vuotoSeZero = true))
        assertEquals("1.234,50 €", Numeri.euro(1234.5))
    }
}
