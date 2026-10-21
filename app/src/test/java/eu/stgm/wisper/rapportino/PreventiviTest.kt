package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * I conti del preventivo sul telefono devono dare i numeri del server al
 * centesimo (fase2.md §3, architettura.md §13.4): qui gli stessi casi di
 * server/prove/casi-preventivo.json, letti dal file così com'è, più le letture
 * delle risposte della §13 e le regole delle scelte del cliente.
 */
class PreventiviTest {

    private fun file(): File? = listOf("../server/prove/casi-preventivo.json", "server/prove/casi-preventivo.json")
        .map(::File).firstOrNull { it.exists() }

    @Test
    fun `gli stessi conti del server su ogni caso di casi-preventivo json`() {
        val f = file()
        assumeTrue("Manca server/prove/casi-preventivo.json", f != null)
        val casi = JSONObject(f!!.readText(Charsets.UTF_8)).getJSONArray("casi")
        assertTrue(casi.length() >= 10)
        for (i in 0 until casi.length()) {
            val caso = casi.getJSONObject(i)
            val nome = caso.getString("nome")
            val p = Preventivo.daJson(caso.getJSONObject("preventivo"))
            // Senza EPPI e IVA scritti valgono zero, come numero() del server.
            val k = ContiPreventivo.calcola(p, eppiPredefinito = 0.0, ivaPredefinita = 0.0)
            val a = caso.getJSONObject("atteso")
            fun uguale(campo: String, valore: Double) {
                if (a.has(campo)) assertEquals("$nome: $campo", a.getDouble(campo), valore, 0.0)
            }
            uguale("sommaVoci", k.somma)
            uguale("scontoDaPercentuale", k.scontoPercentuale)
            uguale("scontoEuro", k.scontoEuro)
            uguale("imponibile", k.imponibile)
            uguale("contributo", k.contributo)
            uguale("baseIva", k.baseIva)
            uguale("iva", k.iva)
            uguale("totale", k.totale)
            uguale("oreVoci", k.oreVoci)
            uguale("restoScadenze", k.restoScadenze)
            if (a.has("eppiPercentuale")) assertEquals(nome, a.getDouble("eppiPercentuale"), p.eppiPercentuale!!, 0.0)
            if (a.has("ivaPercentuale")) assertEquals(nome, a.getDouble("ivaPercentuale"), p.ivaPercentuale!!, 0.0)
            if (a.has("senzaPrezzo")) assertEquals("$nome: senzaPrezzo", a.getInt("senzaPrezzo"), k.senzaPrezzo)
            a.optJSONArray("voci")?.let { voci ->
                for (j in 0 until voci.length()) {
                    val v = voci.getJSONObject(j)
                    assertEquals("$nome: importo della voce ${j + 1}", v.getDouble("importo"), k.importi[j], 0.0)
                    assertEquals("$nome: conta la voce ${j + 1}", v.getBoolean("conta"), k.contano[j])
                }
            }
            a.optJSONArray("sezioni")?.let { s ->
                for (j in 0 until s.length()) assertEquals("$nome: subtotale ${j + 1}", s.getDouble(j), k.subtotali[j], 0.0)
            }
            a.optJSONArray("scadenze")?.let { s ->
                for (j in 0 until s.length()) assertEquals("$nome: scadenza ${j + 1}", s.getDouble(j), k.scadenze[j], 0.0)
            }
        }
    }

    // Il PR/2026/012 del prototipo, scritto a mano: due sezioni, una facoltativa, due alternative.
    private val dodici = Preventivo(
        id = "5", numero = "PR/2026/012", revisione = 1, eppiPercentuale = 5.0, ivaPercentuale = 22.0,
        sezioni = listOf(
            SezionePreventivo("1", "Progettazione", listOf(
                VocePreventivo("1", "Sopralluogo", prezzo = 350.0),
                VocePreventivo("2", "Progetto esecutivo", prezzo = 1900.0),
            )),
            SezionePreventivo("2", "Cantiere", listOf(
                VocePreventivo("3", "Direzione lavori", ModoVoce.ORE, 16.0, "ore", 45.0),
                VocePreventivo("4", "DiRi", prezzo = 450.0, facoltativa = true),
                VocePreventivo("5", "Collaudo nostro", prezzo = 380.0, alternativa = "collaudo", scelta = true),
                VocePreventivo("6", "Collaudo esterno", prezzo = 620.0, alternativa = "Collaudo ", scelta = false),
            )),
        ),
    )

    @Test
    fun `il prototipo fa 4291,35 e le scelte del cliente lo cambiano`() {
        val k = dodici.conto()
        assertEquals(3350.0, k.imponibile, 0.0)
        assertEquals(167.5, k.contributo, 0.0)
        assertEquals(773.85, k.iva, 0.0)
        assertEquals(4291.35, k.totale, 0.0)
        assertEquals(listOf(2250.0, 1100.0), k.subtotali)
        // Il cliente vuole la DiRi e il collaudo esterno: "Collaudo " e "collaudo" sono lo stesso gruppo.
        val scelte = ContiPreventivo.conScelte(dodici.voci, mapOf("4" to true, "6" to true))
        assertFalse(scelte.first { it.id == "5" }.scelta)
        val conScelte = dodici.conVoci(scelte).conto()
        assertEquals(3350.0 + 450 - 380 + 620, conScelte.imponibile, 0.001)
        // Toccando un'alternativa diventa la sola scelta del suo gruppo.
        val toccate = ContiPreventivo.tocca(dodici.voci, "6")
        assertEquals(listOf(false, true), toccate.filter { it.inAlternativa }.map { it.scelta })
        assertEquals(listOf(true), ContiPreventivo.tocca(dodici.voci, "4").filter { it.facoltativa }.map { it.scelta })
    }

    @Test
    fun `cosa chiede la legge, dalle impostazioni o da quello che dice il server`() {
        val imp = mapOf("POLIZZA_COMPAGNIA" to "Esempio", "POLIZZA_NUMERO" to "1", "TITOLI" to "Perito industriale")
        val locale = ContiPreventivo.legge(dodici, imp).associate { it.chiave to it.ok }
        assertEquals(false, locale["complessita"])
        assertEquals(false, locale["oneri"])
        assertEquals(true, locale["polizza"])
        assertEquals(true, locale["titoli"])
        assertEquals(true, locale["prezzi"])
        val senzaPolizza = ContiPreventivo.legge(dodici.copy(complessita = "media", oneriPrevisti = "Pratiche"), emptyMap()).associate { it.chiave to it.ok }
        assertEquals(false, senzaPolizza["polizza"])
        assertEquals(true, senzaPolizza["complessita"])
        // Col server vince la sua lista: qui manca solo la polizza.
        val server = dodici.copy(mancanoServer = listOf(Mancanza("polizza", "Gli estremi della polizza professionale: scrivili in Amministrazione")))
        val r = ContiPreventivo.legge(server, emptyMap()).associate { it.chiave to it.ok }
        assertEquals(false, r["polizza"])
        assertEquals(true, r["titoli"])
        assertEquals(true, r["complessita"])
    }

    @Test
    fun `la pagina del preventivo letta dalla risposta della §13 4`() {
        val o = JSONObject(
            """{"ok":true,"preventivo":{"id":5,"numero":"PR/2026/012","revisione":1,"etichetta":"PR/2026/012 rev. 1","idCliente":"C002",
            "cliente":"Rossi Impianti Srl","oggetto":"Adeguamento impianto elettrico capannone","data":"2026-10-14","scadenza":"2026-10-27",
            "stato":"INVIATO","statoVisto":"INVIATO","scaduto":false,"giorniAllaScadenza":6,"inviatoIl":"2026-10-14T10:00:00","accettatoIl":"",
            "idCommessa":"","modello":false,"senzaPrezzo":0,"imponibile":3350,"totale":4291.35,"modificato":"2026-10-14T10:00:00",
            "idSede":3,"idReferente":3,"introduzione":"","complessita":"media","complessitaNota":"","oneriPrevisti":"Pratiche","condizioni":"...",
            "scontoPercentuale":0,"scontoEuro":0,"eppiPercentuale":5,"ivaPercentuale":22,"accettatoDa":"","accettazioneModo":"","firma":null,
            "rifiutatoIl":"","motivoRifiuto":"","noteInterne":"","idUtente":1,"creato":"2026-10-14T09:12:00","modificabile":false,
            "sezioni":[{"id":3,"titolo":"Cantiere","ordine":2,"subtotale":1100,"voci":[
              {"id":7,"idSezione":3,"idListino":4,"descrizione":"Direzione lavori","modo":"ore","quantita":16,"unita":"ore","prezzo":45,"scontoPercentuale":0,
               "facoltativa":false,"alternativa":"","scelta":false,"ordine":1,"importo":720,"conta":true},
              {"id":8,"idSezione":3,"idListino":5,"descrizione":"Dichiarazione di rispondenza","modo":"corpo","quantita":1,"unita":"","prezzo":450,
               "scontoPercentuale":0,"facoltativa":true,"alternativa":"","scelta":false,"ordine":2,"importo":450,"conta":false}]}],
            "scadenzePagamento":[{"id":1,"descrizione":"30% alla firma","tipo":"percentuale","valore":30,"quando":"firma","data":"","importo":1005,"stato":"prevista","ordine":1,"idCommessa":""}],
            "conti":{"sommaVoci":3350,"scontoDaPercentuale":0,"scontoEuro":0,"imponibile":3350,"eppiPercentuale":5,"contributo":167.5,"baseIva":3517.5,
              "ivaPercentuale":22,"iva":773.85,"totale":4291.35,"oreVoci":16,"senzaPrezzo":0,"restoScadenze":0},
            "revisioni":[{"id":4,"revisione":0,"etichetta":"PR/2026/012","stato":"SOSTITUITO","data":"2026-10-11","totale":3971.13},
              {"id":5,"revisione":1,"etichetta":"PR/2026/012 rev. 1","stato":"INVIATO","data":"2026-10-14","totale":4291.35}],
            "mancano":[{"campo":"polizza","testo":"Gli estremi della polizza professionale: scrivili in Amministrazione › Dati dello studio"}]}}""",
        )
        val p = Preventivo.daJson(o)
        assertEquals("5", p.id)
        assertEquals("3", p.idSede)
        assertEquals("3", p.idReferente)
        assertEquals("Rossi Impianti Srl", p.nomeCliente)
        assertEquals(LocalDate.of(2026, 10, 27), p.scadenza)
        assertEquals(6, p.giorniAllaScadenza)
        assertEquals(false, p.modificabile)
        assertEquals(1100.0, p.sezioni.single().subtotaleServer!!, 0.0)
        assertEquals(1100.0, ContiPreventivo.subtotale(p.sezioni.single()), 0.0)
        assertEquals(listOf(true, false), p.voci.map { ContiPreventivo.conta(it) })
        assertEquals(4291.35, p.conto().totale, 0.0)
        assertEquals(3350.0, p.conto().somma, 0.0)
        assertEquals(1005.0, ContiPreventivo.importoScadenza(p.scadenzePagamento.single(), 3350.0), 0.0)
        assertEquals(2, p.revisioni.size)
        assertEquals("polizza", p.mancanoServer!!.single().campo)
        // Il 27 è passato: per il telefono è SCADUTO anche se il server l'aveva detto inviato.
        assertEquals(StatoPreventivo.SCADUTO, p.statoVisto(LocalDate.of(2026, 10, 28)))
        assertEquals(StatoPreventivo.INVIATO, p.statoVisto(LocalDate.of(2026, 10, 21)))
        assertNull(p.perModifica().contiServer)
        assertNull(p.perModifica().sezioni.single().subtotaleServer)
    }

    @Test
    fun `nell'elenco lo stato visto del server vince`() {
        val p = Preventivo.daJson(JSONObject("""{"id":2,"numero":"PR/2026/007","stato":"INVIATO","statoVisto":"SCADUTO","scaduto":true,"totale":1152.9}"""))
        assertEquals(StatoPreventivo.SCADUTO, p.statoVisto(LocalDate.of(2026, 10, 1)))
        assertEquals(1152.9, p.totaleServer!!, 0.0)
    }

    @Test
    fun `il preventivo da salvare manda le sezioni intere, senza gli id nati sul telefono`() {
        val ponte = PonteServer({ "http://x" }, { "t" })
        val p = dodici.copy(
            id = "", idCliente = "C002", idSede = "3", oggetto = "Capannone", data = null, scadenza = null,
            sezioni = dodici.sezioni + SezionePreventivo(PonteServer.NUOVO + "a", "Extra", listOf(VocePreventivo(PonteServer.NUOVO + "b", "Voce nuova", prezzo = 10.0))),
            scadenzePagamento = listOf(ScadenzaPagamento(PonteServer.NUOVO + "c", "Saldo", valore = 100.0, quando = ScadenzaPagamento.FINE)),
        )
        val o = ponte.perSalvare(p, costi = true)
        assertFalse(o.has("id"))
        assertFalse(o.has("data"))
        assertEquals(3, o.getInt("idSede"))
        val sezioni = o.getJSONArray("sezioni")
        assertEquals(3, sezioni.length())
        assertEquals(1, sezioni.getJSONObject(0).getInt("id"))
        assertFalse(sezioni.getJSONObject(2).has("id"))
        assertFalse(sezioni.getJSONObject(2).getJSONArray("voci").getJSONObject(0).has("id"))
        assertEquals(10.0, sezioni.getJSONObject(2).getJSONArray("voci").getJSONObject(0).getDouble("prezzo"), 0.0)
        assertFalse(o.getJSONArray("scadenzePagamento").getJSONObject(0).has("id"))
        // Senza i soldi niente prezzi né sconti: il server tiene quelli che c'erano.
        val senza = ponte.perSalvare(p, costi = false)
        assertFalse(senza.has("scontoPercentuale"))
        assertFalse(senza.getJSONArray("sezioni").getJSONObject(0).getJSONArray("voci").getJSONObject(0).has("prezzo"))
    }

    @Test
    fun `il listino della §13 2`() {
        val l = VoceListino.daJson(JSONObject("""{"id":8,"codice":"CON","nome":"Ore di consulenza","descrizione":"","modo":"ore","unita":"ore","prezzo":null,"attivo":true,"ordine":8}"""))
        assertEquals(ModoVoce.ORE, l.modo)
        assertNull(l.prezzo)
        assertEquals("8", l.id)
    }
}
