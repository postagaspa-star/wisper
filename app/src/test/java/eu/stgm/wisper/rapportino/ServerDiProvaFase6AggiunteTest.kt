package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * I pezzi della fase 6 nelle pagine che c'erano già (fase6.md §12.8), contro il server di prova vero:
 * la spesa di carburante col mezzo e i km, le ore di un collaboratore scritte dallo studio, la fattura
 * ricevuta collegata all'incarico, la lettera d'incarico nell'archivio, i tipi di formazione, il registro
 * dei dati riservati di tutti. Si lanciano con `node server/prove/telefono.js` (ServerDiProva.kt).
 */
class ServerDiProvaFase6AggiunteTest {
    private val indirizzo = ServerDiProva.indirizzo

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-app-6b", "dispNome" to "prove unitarie", "app" to "telefono prove") })
    private fun entra(email: String): PonteServer = runBlocking { ponte(ponte("").accedi(email, "prova").token) }
    private val unico = System.nanoTime().toString().takeLast(6)

    @Test
    fun `Marco segna il carburante del Doblò coi km del contachilometri, e i km del mezzo salgono`() = runBlocking {
        val marco = entra("marco@esempio.it")
        val f6 = Fase6(marco)
        val prima = f6.mezzoJson("2").getJSONObject("mezzo").optLong("km")
        val spesa = Spesa(data = ServerDiProva.oggi, importo = 61.4, categoria = "carburante", descrizione = "Gasolio $unico", destinazione = Destinazione.STUDIO,
            pagataDaMe = true, idVeicolo = "2", km = prima + 35, mezzoChiesto = true)
        val corpo = spesa.perSalvare()
        assertEquals(2, corpo.getInt("idVeicolo"))
        val salvata = marco.salvaSpesa(corpo)
        assertEquals("2", salvata.idVeicolo)
        assertEquals(prima + 35, salvata.km)
        assertEquals("la lettura del rifornimento conta per il mezzo", prima + 35, f6.mezzoJson("2").getJSONObject("mezzo").optLong("km"))
    }

    @Test
    fun `Manuel scrive le ore del collaboratore, collega una fattura ricevuta e salva la lettera d'incarico`() = runBlocking {
        val manuelP = entra("manuel@esempio.it")
        val manuel = Fase6(manuelP)
        val iv = manuel.collaboratori().first { it.nome.startsWith("Impianti Veneti") }
        // Un incarico a ore, affidato (con l'idoneità non in regola si conferma).
        val nuovo = manuel.salvaIncarico(JSONObject().put("idSoggetto", iv.idSoggetto).put("idCommessa", "26ST002").put("titolo", "Prova ore $unico")
            .put("modo", "ore").put("tariffa", 32).put("orePreviste", 10))
        val affidato = manuel.azioneIncarico("affidaIncarico", nuovo.id, JSONObject().put("conferma", true))
        assertEquals("affidato", affidato.stato)

        manuel.oreCollaboratore(affidato, ServerDiProva.oggi, 3.5, "Posa canaline $unico")
        val conOre = manuel.incarico(nuovo.id)
        assertTrue("le ore scritte dallo studio sono sull'incarico", conOre.ore.any { it.ore == 3.5 && it.descrizione == "Posa canaline $unico" })

        // Una fattura ricevuta del collaboratore senza incarico: la si collega.
        val f4 = Fase4(manuelP)
        val r = f4.salvaRicevuta(JSONObject().put("idFornitore", iv.idSoggetto).put("numero", "P$unico").put("data", ServerDiProva.oggi.toString())
            .put("imponibile", 112).put("iva", 24.64).put("totale", 136.64).put("categoria", "servizi"))
        assertTrue("nasce senza incarico", r.idIncarico.isBlank())
        val libere = f4.ricevute("tutte").filter { it.idFornitore == iv.idSoggetto && it.idIncarico.isBlank() && it.stato != "annullata" }
        assertTrue("è fra quelle da collegare", libere.any { it.id == r.id })
        val collegata = f4.salvaRicevuta(JSONObject().put("id", PonteServer.idJson(r.id)).put("idIncarico", PonteServer.idJson(nuovo.id)))
        assertEquals(nuovo.id, collegata.idIncarico)
        assertTrue("la fattura è nella pagina dell'incarico", manuel.incarico(nuovo.id).ricevute.any { it.id == r.id })

        // La lettera d'incarico dal modello, nell'archivio legata all'incarico.
        val f5 = Fase5(manuelP)
        val m = f5.componiModello("LETTERA_INCARICO", mapOf("idIncarico" to nuovo.id))
        assertTrue("il testo nomina l'incarico", m.testo.contains(nuovo.numero) || m.testo.contains("Prova ore $unico"))
        val cat = f5.categorie().firstOrNull { it.nome == "Lettere d'incarico" }
        assertNotNull("la categoria delle lettere d'incarico c'è", cat)
        val caricato = f5.carica("lettera-$unico.pdf", "application/pdf", "F-lettera$unico", "documento", "%PDF-1.4 prova".toByteArray())
        f5.salvaDocumento(JSONObject().put("origine", "file").put("idFile", caricato.id).put("titolo", "Lettera d'incarico ${nuovo.numero}")
            .put("idIncarico", PonteServer.idJson(nuovo.id)).put("idCommessa", "26ST002").put("idCategoria", PonteServer.idJson(cat!!.id)))
        assertTrue("la lettera è fra i documenti dell'incarico", manuel.incarico(nuovo.id).documenti.any { it.titolo == "Lettera d'incarico ${nuovo.numero}" })
    }

    @Test
    fun `un tipo di formazione nuovo col preavviso, e il registro dei dati riservati di tutti per il titolare`() = runBlocking {
        val manuel = Fase6(entra("manuel@esempio.it"))
        val tipi = manuel.salvaQualificaTipo(JSONObject().put("nome", "Prova formazione $unico").put("gruppo", "altro").put("ogniMesi", 12).put("preavvisoGiorni", 45))
        val t = tipi.first { it.nome == "Prova formazione $unico" }
        assertEquals(12, t.ogniMesi)
        assertEquals(45, t.preavvisoGiorni)

        manuel.persona("3")
        val tutti = manuel.accessiRiservati("")
        assertTrue("le righe di tutti, ognuna con la sua persona", tutti.isNotEmpty() && tutti.all { it.persona.isNotBlank() })
    }
}
