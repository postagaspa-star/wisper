package eu.stgm.wisper

import eu.stgm.wisper.rapportino.ContiOreSpese
import eu.stgm.wisper.rapportino.Destinazione
import eu.stgm.wisper.rapportino.FilaOreSpese
import eu.stgm.wisper.rapportino.RigaOre
import eu.stgm.wisper.rapportino.Spesa
import eu.stgm.wisper.rapportino.StatoVoce
import eu.stgm.wisper.rapportino.Trasferta
import eu.stgm.wisper.rapportino.Veicolo
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

/**
 * La visita guidata mostra anche i moduli della fase 3 (DatiEsempio con
 * EsempioFase3): ore e timer, approvazioni con Annulla, spese, trasferte,
 * rimborsi, veicoli, e le voci nuove della Dashboard, con le regole del server.
 */
class DatiEsempioFase3Test {
    private val oggi = LocalDate.of(2026, 10, 22) // un giovedì

    @Test
    fun `la settimana delle ore del prototipo, e una riga nuova che entra nei conti`() = runBlocking {
        val d = DatiEsempio(oggi)
        val e = d.ore.value!!
        assertEquals(LocalDate.of(2026, 10, 19), e.da)
        assertEquals(4, e.ore.size)
        val lunedi = e.giorni.first()
        assertEquals(7.5, lunedi.ore, 0.0)
        assertTrue("i rapportini del lunedì si vedono accanto", lunedi.oreRapportini > 0)
        d.salvaOre(RigaOre(idLocale = "", data = oggi, ore = 2.0, idCommessa = "26ST045", fatturabile = true, descrizione = "Revisione tavole"))
        val dopo = d.ore.value!!
        assertEquals(5, dopo.ore.size)
        assertEquals(e.totali.ore + 2.0, dopo.totali.ore, 0.0)
        val nuova = dopo.ore.first { it.descrizione == "Revisione tavole" }
        assertEquals("Quadro capannone", nuova.commessa)
        d.togliOre(nuova)
        assertEquals(4, d.ore.value!!.ore.size)
        d.togliOre(nuova, annulla = true)
        assertEquals(5, d.ore.value!!.ore.size)
    }

    @Test
    fun `il timer si accende una volta sola e fermandolo nasce la bozza`() = runBlocking {
        val d = DatiEsempio(oggi)
        assertFalse(d.timer.value!!.acceso)
        val t = d.avviaTimer("26ST044", "Cablaggio").getOrThrow()
        assertTrue(t.acceso)
        assertEquals("Nuovo magazzino automatico", t.timer!!.commessa)
        assertTrue(d.avviaTimer("26ST045").isFailure)
        val f = d.fermaTimer().getOrThrow()
        assertEquals(StatoVoce.BOZZA, f.riga.stato)
        assertTrue(f.riga.dalTimer)
        assertFalse(d.timer.value!!.acceso)
        assertTrue(d.fermaTimer().isFailure)
    }

    @Test
    fun `approvare, respingere col motivo e Annulla, e la dashboard che cambia`() = runBlocking {
        val d = DatiEsempio(oggi)
        val a = d.daApprovare().getOrThrow()
        // 07/11/2026: le Ore non ci sono più: da approvare restano due spese e un rapportino.
        assertEquals(3, a.quante)
        assertEquals(1, a.conAnomalie)
        assertTrue(a.voci.none { it.tipo == "ore" })
        assertTrue(d.dashboard.value!!.urgenti.any { it.tipo == "approvare" && it.collegamento?.parametri?.get("segmento") == "daApprovare" })
        assertTrue(d.dashboard.value!!.urgenti.none { it.tipo == "timer" })
        val due = a.voci.take(2)
        assertEquals(2, d.approva(due).getOrThrow().fatte)
        assertEquals(1, d.daApprovare().getOrThrow().quante)
        assertTrue(d.respingi(a.voci.drop(2).take(1), " ").isFailure)
        d.respingi(a.voci.drop(2).take(1), "Manca lo scontrino").getOrThrow()
        assertEquals(0, d.daApprovare().getOrThrow().quante)
        d.annullaApprovazione(due)
        assertEquals(2, d.daApprovare().getOrThrow().quante)
        d.approva(d.daApprovare().getOrThrow().voci)
        assertTrue(d.dashboard.value!!.urgenti.none { it.tipo == "approvare" })
    }

    @Test
    fun `spese del mese, i tre riquadri, una spesa nuova con lo scontrino e i rimborsi`() = runBlocking {
        val d = DatiEsempio(oggi)
        val s = d.spese.value!!
        assertEquals(5, s.spese.size)
        assertEquals(ContiOreSpese.totaliSpese(s.spese), s.totali)
        assertEquals(25.9, s.totali.cliente, 0.0)
        assertEquals(83.9, s.totali.studio, 0.0)
        d.salvaSpesa(Spesa(idLocale = "", data = oggi, importo = 4.5, categoria = "parcheggio", idCommessa = "26ST044", destinazione = Destinazione.CLIENTE, pagataDaMe = true), java.io.File("s.jpg"))
        val dopo = d.spese.value!!
        assertEquals(6, dopo.spese.size)
        assertEquals(30.4, dopo.totali.cliente, 0.0)
        assertTrue(dopo.spese.first { it.importo == 4.5 }.foto.isNotEmpty())
        // Rimborsi: Manuel ha pedaggio, parcheggi e la trasferta; Marco ha solo cose da approvare.
        val r = d.rimborsi().getOrThrow()
        val manuel = r.persone.first { it.idUtente == "1" }
        assertEquals(ContiOreSpese.centesimi(8.4 + 3.0 + 4.5 + 91.2), manuel.totale, 0.0)
        assertEquals(120.0, manuel.km, 0.0)
        val marco = r.persone.first { it.idUtente == "3" }
        assertEquals(0.0, marco.totale, 0.0)
        assertEquals(14.5, marco.inAttesa, 0.0)
        assertTrue(d.dashboard.value!!.settimana.any { it.tipo == "rimborsi" })
        d.segnaRimborsato(manuel.voci)
        assertTrue(d.rimborsi().getOrThrow().persone.none { it.idUtente == "1" })
        d.segnaRimborsato(manuel.voci, annulla = true)
        assertEquals(manuel.totale, d.rimborsi().getOrThrow().persone.first { it.idUtente == "1" }.totale, 0.0)
    }

    @Test
    fun `una trasferta col rimborso calcolato e l'euro al km che resta quello di quando è nata`() = runBlocking {
        val d = DatiEsempio(oggi)
        val nuova = d.salvaTrasferta(Trasferta(dal = oggi, destinazione = "Zanè, cabina MT Acme", km = 60.0, andataRitorno = true)).getOrThrow()
        assertEquals(91.2, nuova.totale, 0.0)
        assertEquals("Volvo XC40", nuova.veicolo)
        val volvo = d.veicoli().getOrThrow().veicoli.first()
        d.salvaVeicolo(volvo.copy(euroKm = 0.8)).getOrThrow()
        val cambiata = d.salvaTrasferta(nuova.copy(motivo = "Sopralluogo")).getOrThrow()
        assertEquals(0.76, cambiata.euroKm!!, 0.0)
        assertEquals(91.2, cambiata.totale, 0.0)
        assertTrue(d.salvaTrasferta(Trasferta(dal = oggi, destinazione = " ")).isFailure)
        assertTrue(d.salvaVeicolo(Veicolo(nome = "")).isFailure)
        val riep = d.riepilogoSpese(YearMonth.from(oggi), "persona").getOrThrow()
        assertNotNull(riep.totale)
        assertEquals(ContiOreSpese.centesimi(riep.righe.sumOf { it.totale }), riep.totale!!.totale, 0.0)
    }

    @Test
    fun `le statistiche della visita, per persona e per commessa, coi conti del server`() = runBlocking {
        val d = DatiEsempio(oggi)
        val p = d.statisticheOre(YearMonth.from(oggi), "persona").getOrThrow()
        assertEquals("persona", p.per)
        assertTrue("Manuel e Marco", p.righe.size >= 2)
        assertEquals(p.righe.maxOf { it.ore }, p.righe.first().ore, 0.0)
        val t = p.totale!!
        assertEquals(ContiOreSpese.centesimi(p.righe.sumOf { it.ore }), t.ore, 0.001)
        p.righe.forEach { r ->
            assertTrue(r.nome, r.fatturabili <= r.ore)
            assertEquals(r.nome, eu.stgm.wisper.rapportino.RigaStatisticaOre.percentuale(r.fatturabili, r.ore), r.percentuale)
        }
        val c = d.statisticheOre(YearMonth.from(oggi), "commessa").getOrThrow()
        assertEquals("commessa", c.per)
        assertTrue(c.righe.any { it.chiave.isNotBlank() && it.nome.isNotBlank() && it.idCliente.isNotBlank() })
        // Le stesse ore, contate in due modi, tranne quelle di Marco che la visita mette solo per persona.
        assertEquals(t.ore - 31.5, c.totale!!.ore, 0.001)
    }

    @Test
    fun `nella visita lo scontrino si toglie e i file per Excel si preparano`() = runBlocking {
        val cartella = java.nio.file.Files.createTempDirectory("wisper-esempio").toFile()
        try {
            val d = DatiEsempio(oggi, cartella)
            val conFoto = d.spese.value!!.spese.first { it.foto.isNotEmpty() }
            val dopo = d.togliFotoSpesa(conFoto.foto.first().id).getOrThrow()
            assertEquals(conFoto.foto.size - 1, dopo.foto.size)
            assertEquals(dopo.foto.size, d.spese.value!!.spese.first { it.id == conFoto.id }.foto.size)
            assertTrue(d.togliFotoSpesa("non-esiste").isFailure)

            for (cosa in listOf("ore", "spese", "trasferte", "rimborsi")) {
                val f = d.esportaPeriodo(cosa, if (cosa == "rimborsi") null else oggi.withDayOfMonth(1), if (cosa == "rimborsi") null else oggi).getOrThrow()
                val righe = f.readText().removePrefix("\uFEFF").split("\r\n")
                assertTrue("$cosa: l'intestazione e almeno una riga", righe.size >= 2)
                assertTrue(cosa, righe[0].startsWith("\""))
            }
            // Le ore della settimana di una persona sola.
            val mie = d.esportaPeriodo("ore", oggi.minusDays(3), oggi, utente = "1").getOrThrow().readText().split("\r\n").drop(1)
            assertTrue(mie.isNotEmpty())
            assertTrue(mie.all { it.contains("Manuel") })
            assertTrue("senza cartella non si salva", DatiEsempio(oggi).esportaPeriodo("ore", null, null).isFailure)
        } finally {
            cartella.deleteRecursively()
        }
    }

    @Test
    fun `le commesse recenti della visita sono quelle dei rapportini`() {
        val d = DatiEsempio(oggi)
        val r = FilaOreSpese.commesseRecenti(d.anagrafiche.value, d.viste.value.map { it.rapportino }, d.ore.value!!.ore)
        assertEquals("26ST044", r.first().id)
        assertTrue(r.none { it.id == "26ST043" }) // sospesa
    }
}
