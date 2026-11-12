package eu.stgm.wisper.rapportino

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * "Cerca nelle impostazioni" e le voci di Dati dello studio (06/11/2026): senza accenti e senza maiuscole, le pagine
 * e le impostazioni dentro le pagine; il codice SDI; il nome dello studio accanto al logo nei PDF.
 */
class CercaImpostazioniTest {

    private val pagine = listOf(
        VoceCercabile("Dati dello studio", "Lo studio", "studio", sotto = "Studio Tecnico GM · logo sui PDF"),
        VoceCercabile("Funzioni accese", "Lo studio", "funzioni", sotto = "Le parti che lo studio usa"),
        VoceCercabile("Sicurezza", "Persone e accessi", "sicurezza", sotto = "Accessi, dispositivi, copia cifrata"),
        VoceCercabile("Numerazioni", "Regole", "numerazioni", sotto = "Prossima commessa 26ST047"),
    )
    private val tutte = pagine + CercaImpostazioni.CAMPI

    private fun titoli(testo: String) = CercaImpostazioni.trova(tutte, testo).map { it.titolo }

    @Test
    fun `senza accenti e senza maiuscole`() {
        assertTrue(titoli("citta").contains("Comune"))           // "città" è tra le altre parole del Comune
        assertTrue(titoli("VALIDITA").contains("Validità dei preventivi"))
        assertTrue(titoli("validità").contains("Validità dei preventivi"))
        assertTrue(titoli("dell'albo").contains("Provincia dell'albo"))
    }

    @Test
    fun `le pagine si trovano dal titolo, dal gruppo e dalla riga sotto`() {
        assertEquals("Sicurezza", titoli("sicur").first())
        assertTrue(titoli("persone e accessi").contains("Sicurezza"))
        assertTrue(titoli("26st047").contains("Numerazioni"))
        // La pagina trovata non ha chiave: si apre e basta.
        assertEquals("", CercaImpostazioni.trova(tutte, "sicurezza").first { it.titolo == "Sicurezza" }.chiave)
    }

    @Test
    fun `le impostazioni dentro le pagine portano alla pagina e al campo`() {
        val sdi = CercaImpostazioni.trova(tutte, "sdi").first()
        assertEquals("Codice SDI", sdi.titolo)
        assertEquals("studio", sdi.rotta)
        assertEquals(CampiStudio.STUDIO_SDI, sdi.chiave)
        val km = CercaImpostazioni.trova(tutte, "rimborso km").first()
        assertEquals("tariffe", km.rotta)
        assertEquals(Anagrafiche.EURO_KM, km.chiave)
        assertEquals(CampiStudio.PDF_NOME, CercaImpostazioni.trova(tutte, "nome accanto al logo").first().chiave)
        // Ogni parola deve esserci, in qualunque ordine.
        assertTrue(titoli("iva partita").contains("Partita IVA"))
        assertTrue(titoli("piva").contains("Partita IVA"))
    }

    @Test
    fun `prima chi comincia col testo, poi chi lo ha nel titolo, poi il resto`() {
        val r = titoli("iva")
        assertEquals("IVA", r.first())
        assertTrue(r.indexOf("Partita IVA") < r.indexOf("Documento").let { if (it < 0) Int.MAX_VALUE else it })
    }

    @Test
    fun `testo vuoto non trova niente, testo che non c'e' nemmeno`() {
        assertTrue(CercaImpostazioni.trova(tutte, "").isEmpty())
        assertTrue(CercaImpostazioni.trova(tutte, "   ").isEmpty())
        assertTrue(CercaImpostazioni.trova(tutte, "zzqqxx").isEmpty())
    }

    @Test
    fun `una stessa voce una volta sola, e quelle del server e le funzioni si aggiungono`() {
        val gruppi = listOf(
            GruppoImpostazioni(
                "lavoro", "Lavoro",
                listOf(VoceImpostazione("ORE_GIORNO", "Ore di lavoro al giorno", "numero")),
                collegamenti = listOf(CollegamentoImpostazione("Impostazioni fiscali", "amministrazione", "fiscale")),
            ),
        )
        val funzioni = listOf(Funzione("mezzi", "Mezzi e attrezzature", accesa = true, spegnibile = true))
        val voci = tutte + CercaImpostazioni.daGenerali(gruppi) + CercaImpostazioni.daGenerali(gruppi) + CercaImpostazioni.daFunzioni(funzioni)
        val ore = CercaImpostazioni.trova(voci, "ore di lavoro")
        assertEquals(1, ore.count { it.titolo == "Ore di lavoro al giorno" })
        assertEquals("impostazioni", ore.first().rotta)
        assertEquals("ORE_GIORNO", ore.first().chiave)
        assertEquals("fiscale", CercaImpostazioni.trova(voci, "impostazioni fiscali").first { it.dove.startsWith("Impostazioni generali") }.rotta)
        val m = CercaImpostazioni.trova(voci, "mezzi").first { it.rotta == "funzioni" }
        assertEquals("funzione-mezzi", m.chiave)
    }

    @Test
    fun `dati dello studio nell'ordine della riunione, l'albo a parte`() {
        assertEquals(
            listOf(
                // 1.4.0 (servizi.md §3): la Qualifica sotto il nome.
                "Ragione sociale", "Qualifica", "Nome breve", "Chi compila i rapportini", "Partita IVA", "Codice fiscale", "Indirizzo", "CAP",
                "Comune", "Provincia", "Codice SDI", "Email per le risposte", "Telefono", "PEC", "Sito", "Riga in fondo ai PDF",
            ),
            CampiStudio.STUDIO.map { it.titolo },
        )
        assertEquals(listOf("ALBO", "ALBO_PROVINCIA", "ALBO_NUMERO", "ALBO_DATA"), CampiStudio.ALBO.map { it.chiave })
        assertEquals(Anagrafiche.TECNICO, CampiStudio.STUDIO[3].chiave)
        assertEquals("STUDIO_QUALIFICA", CampiStudio.STUDIO[1].chiave)
    }

    @Test
    fun `il codice SDI vuoto o di 7 lettere o cifre, in maiuscolo`() {
        assertNull(CampiStudio.erroreSdi(""))
        assertNull(CampiStudio.erroreSdi("M5UXCR1"))
        assertNull(CampiStudio.erroreSdi("0000000"))
        assertEquals("M5UXCR1", CampiStudio.sdi(" m5ux cr1 "))
        assertTrue(CampiStudio.erroreSdi("M5UXCR") != null)
        assertTrue(CampiStudio.erroreSdi("M5UXCR12") != null)
        assertTrue(CampiStudio.erroreSdi("M5UX-R1") != null)
        assertTrue(CampiStudio.erroreSdi("m5uxcr1") != null)   // si salva solo dopo sdi(): maiuscolo
    }

    @Test
    fun `nome accanto al logo e logo sui PDF, di base si', come i PDF del computer`() {
        assertTrue(CampiStudio.acceso(""))
        assertTrue(CampiStudio.acceso("true"))
        assertTrue(CampiStudio.acceso("SI"))
        assertFalse(CampiStudio.acceso("false"))
        assertFalse(CampiStudio.acceso("NO"))
        assertFalse(CampiStudio.acceso("0"))
    }

    @Test
    fun `PDF_NOME e STUDIO_SDI arrivano ai modelli dei PDF con le impostazioni`() {
        val ana = Anagrafiche(impostazioni = mapOf("RAGIONE_SOCIALE" to "Studio Tecnico GM", CampiStudio.PDF_NOME to "false", CampiStudio.STUDIO_SDI to "M5UXCR1"))
        val imp = ana.aJson().getJSONObject("impostazioni")
        assertEquals("false", imp.getString(CampiStudio.PDF_NOME))
        assertEquals("M5UXCR1", imp.getString(CampiStudio.STUDIO_SDI))
    }
}
