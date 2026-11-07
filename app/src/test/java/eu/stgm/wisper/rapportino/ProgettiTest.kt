package eu.stgm.wisper.rapportino

import eu.stgm.wisper.Riepiloghi
import eu.stgm.wisper.Vista
import eu.stgm.wisper.ui.ModuloStato
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * I progetti sul telefono (docs/gestionale/progetti.md): la regola dei codici uguale a quella del server (tutti i casi
 * di server/prove/casi-codici-progetto.json, letti dal file cosi' com'e'), le letture, il rapportino col progetto
 * scelto o nato sul telefono, i progetti in coda, i recenti e il modulo che vuole il progetto.
 */
class ProgettiTest {

    private fun file(): File? = listOf("../server/prove/casi-codici-progetto.json", "server/prove/casi-codici-progetto.json")
        .map(::File).firstOrNull { it.exists() }

    @Test
    fun `lo stesso codice del server su ogni caso di casi-codici-progetto json`() {
        val f = file()
        assumeTrue("Manca server/prove/casi-codici-progetto.json", f != null)
        val casi = JSONObject(f!!.readText(Charsets.UTF_8)).getJSONArray("casi")
        assertTrue("i casi sono almeno 20", casi.length() >= 20)
        var provati = 0
        for (i in 0 until casi.length()) {
            val caso = casi.getJSONObject(i)
            val nome = caso.getString("nome")
            val progetti = caso.getJSONArray("progetti").let { a ->
                (0 until a.length()).map { j ->
                    val p = a.getJSONObject(j)
                    CodiciProgetto.PerCodice(p.optLong("id", 0L), p.optString("codice"), p.optString("idCommessa"), p.optString("idCliente"), p.optString("creato"))
                }
            }
            val dove = caso.getJSONObject("dove")
            val atteso = caso.getJSONObject("atteso")
            val p = CodiciProgetto.proponi(progetti, dove.getString("idCommessa"), dove.optString("idCliente"), dove.getInt("anno"))
            assertEquals("$nome: codice", atteso.getString("codice"), p.codice)
            assertEquals("$nome: da", atteso.getString("da"), p.da)
            provati++
        }
        assertEquals("tutti i casi", casi.length(), provati)
    }

    private val ana = Anagrafiche.daJson(
        JSONObject(
            """{"ok":true,"clienti":[{"id":"C001","nome":"Elettrodinamica"},{"id":"C002","nome":"Rossi Impianti Srl"}],
            "commesse":[{"id":"26ST044","idCliente":"C001","descrizione":"Magazzino","stato":"APERTA"},
                        {"id":"26ST045","idCliente":"C002","descrizione":"Capannone","stato":"APERTA"}],
            "progetti":[
              {"id":1,"idCommessa":"26ST044","idCliente":"C001","codice":"ED-001","intestatoA":"Batokyo Srl","descrizione":"Quadro QL1","stato":"APERTO","creato":"2026-10-01T09:00:00","rapportini":3,"ore":20.5},
              {"id":2,"idCommessa":"26ST044","idCliente":"C001","codice":"ED-002","descrizione":"Nastro","stato":"CHIUSO","creato":"2026-10-02T09:00:00"},
              {"id":3,"idCommessa":"26ST045","idCliente":"C002","codice":"RS-01","descrizione":"Quadro QG2","stato":"APERTO","creato":"2026-10-03T09:00:00"}
            ]}""",
        ),
    )

    @Test
    fun `le anagrafiche portano i progetti, con conti e stato`() {
        assertEquals(3, ana.progetti.size)
        val p = ana.progetto("1")!!
        assertEquals("ED-001 · Quadro QL1", p.etichetta)
        assertEquals("Batokyo Srl", p.intestatoA)
        assertEquals(3, p.rapportini)
        assertEquals(20.5, p.ore, 0.0)
        assertTrue(p.aperto)
        assertFalse(ana.progetto("2")!!.aperto)
        assertEquals("Chiuso", ana.progetto("2")!!.parolaStato)
        assertEquals(listOf("2", "1"), ana.progettiDi("26ST044").map { it.id })
        // Andata e ritorno (la copia sul telefono, per lavorare senza rete).
        assertEquals(ana.progetti, Anagrafiche.daJson(ana.aJson()).progetti)
        assertEquals(p, Progetto.daJson(p.aJson()))
    }

    private fun rapportino(idLocale: String = "W-1") = Rapportino.nuovo("Manuel", LocalDate.of(2026, 11, 3)).copy(
        idLocale = idLocale, idCliente = "C001", cliente = "Elettrodinamica", idCommessa = "26ST044", commessa = "Magazzino",
        descrizione = "Cablaggio", oreLavoro = 4.0,
    )

    @Test
    fun `il rapportino col progetto scelto manda idProgetto, quello nato sul telefono manda progettoNuovo`() {
        val scelto = rapportino().copy(idProgetto = "1", progetto = "ED-001", progettoDescrizione = "Quadro QL1", progettoIntestatoA = "Batokyo Srl")
        val j = scelto.perIlFoglio()
        assertEquals(1L, (j.get("idProgetto") as Number).toLong())
        assertFalse(j.has("progettoNuovo"))
        assertEquals("ED-001 · Quadro QL1", scelto.etichettaProgetto)
        assertTrue(scelto.conProgetto)

        val n = ProgettoNuovo("P-abc", "ED-003", codiceProposto = true, intestatoA = "Bianchi Spa", descrizione = "Linea 2")
        val nuovo = rapportino("W-2").copy(progetto = "ED-003", progettoDescrizione = "Linea 2", progettoNuovo = n)
        val k = nuovo.perIlFoglio()
        assertTrue(!k.has("idProgetto") || k.isNull("idProgetto"))
        val pn = k.getJSONObject("progettoNuovo")
        assertEquals("P-abc", pn.getString("idLocale"))
        assertEquals("ED-003", pn.getString("codice"))
        assertTrue(pn.getBoolean("codiceProposto"))
        assertEquals("Bianchi Spa", pn.getString("intestatoA"))
        assertEquals("ED-003 · Linea 2", nuovo.etichettaProgetto)

        // Sul telefono (la coda, la bozza) restano tutti e due; il PDF ha codice, descrizione e intestatario.
        assertEquals(scelto.idProgetto, Rapportino.daJson(scelto.aJson()).idProgetto)
        val ritorno = Rapportino.daJson(nuovo.aJson())
        assertEquals(n, ritorno.progettoNuovo)
        assertEquals("ED-003", ritorno.progetto)
        val foglio = scelto.comeDalFoglio()
        assertEquals("ED-001", foglio.getString("progetto"))
        assertEquals("Quadro QL1", foglio.getString("progettoDescrizione"))
        assertEquals("Batokyo Srl", foglio.getString("progettoIntestatoA"))
        // Senza progetto non cambia niente (Progetti spenta: tutto come prima).
        val senza = rapportino("W-3").perIlFoglio()
        assertFalse(senza.has("progettoNuovo"))
        assertFalse(rapportino("W-3").conProgetto)
    }

    @Test
    fun `i progetti nati sul telefono e in coda, uno per idLocale, spariscono quando arrivano`() {
        val n = ProgettoNuovo("P-xyz", "ED-003", true, "", "Linea 2")
        val due = listOf(rapportino("W-1").copy(progettoNuovo = n), rapportino("W-2").copy(progettoNuovo = n))
        val attesa = RegoleProgetti.inAttesa(ana, due)
        assertEquals(1, attesa.size)
        assertTrue(attesa.single().inAttesa)
        assertEquals("26ST044", attesa.single().idCommessa)
        assertEquals("C001", attesa.single().idCliente)
        // Fra le scelte della commessa (gli aperti, i piu' recenti prima), anche quello in coda.
        assertEquals(listOf("ED-003", "ED-001"), RegoleProgetti.apertiDi(ana, due, "26ST044").map { it.codice })
        assertEquals(listOf("RS-01"), RegoleProgetti.apertiDi(ana, due, "26ST045").map { it.codice })
        // Il codice proposto conta anche quelli in coda: dopo ED-003 viene ED-004.
        assertEquals("ED-003", RegoleProgetti.codiceProposto(ana, emptyList(), "26ST044", "C001", LocalDate.of(2026, 11, 3)))
        assertEquals("ED-004", RegoleProgetti.codiceProposto(ana, due, "26ST044", "C001", LocalDate.of(2026, 11, 3)))
        // Gia' preso: lo stesso cliente, maiuscole o minuscole; un altro cliente puo' averlo.
        assertNotNull(RegoleProgetti.codiceGiaPreso(ana, due, "ed-003", "C001"))
        assertNotNull(RegoleProgetti.codiceGiaPreso(ana, emptyList(), "ed-002", "C001"))
        assertNull(RegoleProgetti.codiceGiaPreso(ana, emptyList(), "ED-001", "C002"))
        assertNull(RegoleProgetti.codiceGiaPreso(ana, emptyList(), "ED-001", "C001", tranneId = "1"))
        // Arrivato al server (le anagrafiche lo portano con lo stesso idLocale): non e' piu' in attesa.
        val arrivato = ana.copy(progetti = ana.progetti + Progetto("9", idLocale = "P-xyz", idCommessa = "26ST044", idCliente = "C001", codice = "ED-003"))
        assertTrue(RegoleProgetti.inAttesa(arrivato, due).isEmpty())
    }

    @Test
    fun `i progetti sono accesi solo se il server li manda nei permessi e non sono spenti`() {
        val conProgetti = Sessione(Utente("1", "Manuel", "m@esempio.it", Ruoli.TITOLARE, true, ""), Permessi.iniziali(Ruoli.TITOLARE))
        assertTrue(RegoleProgetti.attivi(conProgetti))
        assertFalse(RegoleProgetti.attivi(conProgetti.copy(interfaccia = Interfaccia(funzioniSpente = listOf(Moduli.PROGETTI)))))
        // Un server di prima della 0.12 non conosce i progetti: niente campo nel rapportino.
        assertFalse(RegoleProgetti.attivi(conProgetti.copy(permessi = Permessi(conProgetti.permessi.livelli - Moduli.PROGETTI))))
    }

    @Test
    fun `i recenti coi progetti, uno per progetto, solo aperti, niente rapportini senza commessa`() {
        val viste = listOf(
            Vista(rapportino("W-1").copy(data = LocalDate.of(2026, 11, 3), idProgetto = "1", progetto = "ED-001")),
            Vista(rapportino("W-2").copy(data = LocalDate.of(2026, 11, 2), idProgetto = "2", progetto = "ED-002")),
            Vista(rapportino("W-3").copy(data = LocalDate.of(2026, 11, 1), idCommessa = "", commessa = "")),
        )
        val conProgetti = Riepiloghi.recenti(viste, ana, conProgetti = true)
        assertEquals("ED-001", conProgetti.first().progetto?.codice)
        // ED-002 e' chiuso: la commessa torna, ma senza progetto (si sceglie).
        assertEquals(listOf("26ST044", "26ST044"), conProgetti.filter { it.idCommessa == "26ST044" }.map { it.idCommessa })
        assertNull(conProgetti.first { it.idCommessa == "26ST044" && it.progetto == null }.progetto)
        assertTrue(conProgetti.none { it.idCommessa.isBlank() })
        // Progetti spenti: come prima, una riga per commessa e anche quella senza commessa.
        val senza = Riepiloghi.recenti(viste, ana)
        assertEquals(1, senza.count { it.idCommessa == "26ST044" })
        assertTrue(senza.any { it.idCommessa.isBlank() })
        assertTrue(senza.all { it.progetto == null })
    }

    @Test
    fun `il modulo coi progetti accesi non si salva senza progetto, e il progetto nuovo parte col rapportino`() {
        val regole = Regole(tariffaFissa = 30.0)
        val m = ModuloStato(rapportino(), nuovo = true)
        assertTrue("spenti: come prima", m.valida(regole))
        m.progettiAttivi = true
        assertFalse(m.valida(regole))
        assertEquals("Scegli il progetto", m.errori["progetto"])
        assertFalse(m.validaPasso(1, regole))
        m.scegliProgetto(ana.progetto("1")!!)
        assertTrue(m.valida(regole))
        assertEquals("1", m.rapportino().idProgetto)
        assertEquals("ED-001 · Quadro QL1", m.etichettaProgetto)
        // Un progetto nato qui: niente idProgetto, il progettoNuovo col codice proposto.
        val n = ProgettoNuovo("P-1", "ED-003", true, "", "Linea 2")
        m.nuovoProgetto(n)
        assertEquals("", m.rapportino().idProgetto)
        assertEquals(n, m.rapportino().progettoNuovo)
        assertTrue(m.valida(regole))
        // Un progetto ancora in coda scelto da un altro rapportino: resta "nuovo", con lo stesso idLocale.
        m.scegliProgetto(n.comeProgetto("26ST044", "C001", ""))
        assertEquals("P-1", m.rapportino().progettoNuovo?.idLocale)
        // Cambiata la commessa, il progetto va scelto di nuovo; senza commessa si chiede la commessa.
        m.togliProgetto()
        assertFalse(m.valida(regole))
        m.idCommessa = ""; m.commessa = ""
        assertFalse(m.valida(regole))
        assertEquals("Scegli la commessa", m.errori["cliente"])
        // La bozza su disco tiene il progetto.
        m.idCommessa = "26ST044"; m.commessa = "Magazzino"; m.scegliProgetto(ana.progetto("1")!!)
        val copia = ModuloStato.daJson(m.aJson())
        assertEquals("1", copia.idProgetto)
        assertEquals("ED-001", copia.progetto)
    }

    @Test
    fun `progetto obbligatorio solo per Elettrodinamica, su ogni caso di casi-progetto-obbligatorio json`() {
        val f = listOf("../server/prove/casi-progetto-obbligatorio.json", "server/prove/casi-progetto-obbligatorio.json").map(::File).firstOrNull { it.exists() }
        assumeTrue("Manca server/prove/casi-progetto-obbligatorio.json", f != null)
        val casi = JSONObject(f!!.readText(Charsets.UTF_8)).getJSONArray("casi")
        assertTrue("ci sono dei casi", casi.length() > 0)
        var provati = 0
        for (i in 0 until casi.length()) {
            val caso = casi.getJSONObject(i)
            assertEquals("«${caso.getString("cliente")}»", caso.getBoolean("obbligatorio"), RegoleProgetti.progettoObbligatorio(caso.getString("cliente")))
            provati++
        }
        assertEquals("tutti i casi", casi.length(), provati)
    }

    @Test
    fun `coi progetti accesi un cliente qualunque si salva senza progetto e senza commessa, Elettrodinamica no`() {
        val regole = Regole(tariffaFissa = 30.0)
        val m = ModuloStato(rapportino().copy(idCliente = "C002", cliente = "Rossi Impianti Srl", idCommessa = "26ST045", commessa = "Capannone"), nuovo = true)
        m.progettiAttivi = true
        assertFalse(m.progettoRichiesto)
        assertTrue("Nessun progetto", m.valida(regole))
        m.idCommessa = ""; m.commessa = ""
        assertTrue("Senza commessa", m.valida(regole))
        // Lo stesso modulo con Elettrodinamica vuole di nuovo commessa e progetto, con le parole di sempre.
        m.idCliente = "C001"; m.cliente = "Elettrodinamica"
        assertTrue(m.progettoRichiesto)
        assertFalse(m.valida(regole))
        assertEquals("Scegli la commessa", m.errori["cliente"])
        m.idCommessa = "26ST044"; m.commessa = "Magazzino"
        assertFalse(m.valida(regole))
        assertEquals("Scegli il progetto", m.errori["progetto"])
        // I recenti: un rapportino senza commessa di un cliente qualunque torna fra i recenti anche coi progetti.
        val viste = listOf(
            Vista(rapportino("W-1").copy(idCliente = "C002", cliente = "Rossi Impianti Srl", idCommessa = "", commessa = "")),
            Vista(rapportino("W-2").copy(idCommessa = "", commessa = "")),
        )
        val recenti = Riepiloghi.recenti(viste, ana, conProgetti = true)
        assertTrue(recenti.any { it.cliente == "Rossi Impianti Srl" && it.idCommessa.isBlank() })
        assertTrue(recenti.none { it.cliente == "Elettrodinamica" && it.idCommessa.isBlank() })
    }
}
