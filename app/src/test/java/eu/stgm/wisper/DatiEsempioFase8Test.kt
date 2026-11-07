package eu.stgm.wisper

import eu.stgm.wisper.rapportino.CosaCalendario
import eu.stgm.wisper.rapportino.FiltroArchivio
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.SegmentoIntegrazioni
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files
import java.time.LocalDate

/**
 * Integrazioni, calendario, ricerca, Dashboard e amministrazione della visita guidata
 * (EsempioFase8): le pagine nuove hanno da mostrare coi nomi del prototipo, solo dati di
 * esempio, e scrivere dice che è un esempio.
 */
class DatiEsempioFase8Test {
    private val cartella = Files.createTempDirectory("wisper-f8").toFile()
    private val dati = DatiEsempio(LocalDate.of(2026, 10, 22), cartella)

    // 07/11/2026: la cartella temporanea si toglie dopo ogni prova (ne restavano sei a ogni giro).
    @After
    fun pulisci() {
        cartella.deleteRecursively()
    }

    @Test
    fun `le integrazioni di esempio, una in Errore, e la pagina di un collegamento`() = runBlocking {
        val e = dati.fase8.integrazioni().getOrThrow()
        assertTrue("l'elenco unico: almeno 25 righe", e.integrazioni.size >= 25)
        assertEquals("Verifica della partita IVA", e.errori.single().nome)
        assertEquals(SegmentoIntegrazioni.DA_SISTEMARE, e.segmentoIniziale)
        assertTrue(e.di(SegmentoIntegrazioni.NON_COLLEGATI).all { it.perche.isNotBlank() })
        assertTrue("quelli di Andrea dicono da cosa dipendono", e.integrazioni.filter { it.gruppo == "scelta" }.all { it.parola == "Dipende da una scelta" && it.dipende.isNotBlank() })
        val v = dati.fase8.integrazione("vies").getOrThrow()
        assertTrue(v.inErrore)
        assertEquals(3, v.controlli.size)
        assertFalse(v.controlli[0].ok)
        val cal = dati.fase8.integrazione("calendario").getOrThrow()
        assertEquals(setOf("CALENDARIO_GIORNI_PRIMA", "CALENDARIO_MESI_DOPO", "CALENDARIO_PUBBLICO"), cal.impostazioni.map { it.chiave }.toSet())
        assertTrue("Prova adesso è un esempio", dati.fase8.provaIntegrazione("vies").isFailure)
        // Nessun indirizzo vero, nessuna chiave nelle risposte di esempio.
        assertTrue(e.integrazioni.none { (it.account + it.esito + it.esce).contains("script.google.com") || (it.account + it.esito).contains("192.168.") })
    }

    @Test
    fun `il calendario in altre app, il file e gli indirizzi`() = runBlocking {
        val f = dati.fase8.feedCalendario().getOrThrow()
        assertEquals(listOf("Telefono di Manuel", "Outlook in ufficio"), f.feed.map { it.nome })
        assertEquals("Mai letto", f.feed[1].letto())
        val (file, eventi) = dati.fase8.esportaCalendario("mie", true, false).getOrThrow()
        assertEquals(1, eventi)
        val testo = file.readText()
        assertTrue(testo.startsWith("BEGIN:VCALENDAR\r\n"))
        assertTrue("righe con CRLF", testo.contains("\r\nEND:VCALENDAR\r\n"))
        assertTrue(file.name.endsWith(".ics"))
        assertTrue("creare un indirizzo è un esempio", dati.fase8.nuovoFeed("Telefono", CosaCalendario(), true, false).isFailure)
        assertTrue("senza nome dice cosa manca", dati.fase8.nuovoFeed(" ", CosaCalendario(), true, false).exceptionOrNull()!!.message!!.startsWith("Nome:"))
    }

    @Test
    fun `cerca terra nei documenti, il verbale nel titolo e le relazioni nel testo`() = runBlocking {
        val r = dati.fase5.documenti(FiltroArchivio(testo = "terra")).getOrThrow().documenti
        assertTrue("il verbale prima, trovato nel titolo", r.first().titolo.startsWith("Verbale verifica impianto di terra"))
        val dentro = r.filter { it.trovato != null }
        assertTrue(dentro.isNotEmpty())
        assertTrue(dentro.all { it.trovato!!.estratto.contains("[terra]") })
        assertTrue("con dentro = false niente estratti", dati.fase5.documenti(FiltroArchivio(testo = "terra", dentro = false)).getOrThrow().documenti.none { it.trovato != null })
        assertEquals("Senza testo: è una scansione o un disegno", dati.fase8.letturaFile("esempio3").getOrThrow().frase)
        assertTrue(dati.fase8.letturaFile("esempio1").getOrThrow().frase.startsWith("Testo letto il"))
    }

    @Test
    fun `la Dashboard di esempio ha le regole nuove, Altre N e tutto quello che c'è da fare`() = runBlocking {
        val d = dati.dashboard.value!!
        assertTrue(d.regoleNuove)
        assertEquals(listOf("daFatturare", "scaduto", "ticketAperti", "daApprovare"), d.riquadri!!.map { it.chiave })
        assertTrue(d.riquadri!![1].rosso)
        assertTrue("ci sono voci oltre i tetti (Altre N)", (d.quante["urgenti"] ?: 0) > 8 || (d.quante["settimana"] ?: 0) > 7 || (d.quante["pianificare"] ?: 0) > 5)
        assertTrue(d.pianificare.any { it.nascondibile })
        assertTrue(d.settimana.any { it.tipo == "sistema" && it.collegamento?.pagina == "integrazione" })
        val t = dati.fase8.dashboardTutto().getOrThrow()
        assertEquals(d.quante["urgenti"], t.urgenti.size)
        assertEquals(d.quante["pianificare"], t.pianificare.size)
        assertTrue(t.urgenti.all { it.area.isNotBlank() || it.oggetto.isBlank() })
        assertTrue("Cambia i riquadri è un esempio", dati.fase8.salvaRiquadri(listOf("daFatturare", "scaduto", "nelConto", "daApprovare")).isFailure)
        assertTrue("servono 4 riquadri", dati.fase8.salvaRiquadri(listOf("daFatturare")).exceptionOrNull()!!.message == "Scegline 4")
    }

    @Test
    fun `amministrazione di esempio, impostazioni, funzioni, sicurezza, copie, stato e lista di controllo`() = runBlocking {
        val g = dati.fase8.impostazioniGenerali().getOrThrow()
        assertEquals("undici schede", 11, g.size)
        assertTrue(g.first { it.chiave == "lavoro" }.voci.any { it.chiave == "APPROVAZIONE" && it.scelte.size == 3 })
        val f = dati.fase8.funzioni().getOrThrow()
        // Dal 03/11/2026 (progetti.md §5): tutte e 19 come sul server, Progetti compresa, e si spengono tutte.
        assertEquals(19, f.size)
        assertTrue(f.all { it.spegnibile })
        assertEquals("Si spengono anche: Progetti, Collaboratori esterni.", eu.stgm.wisper.rapportino.Funzione.fraseAnche(f.first { it.modulo == "commesse" }, false, f))
        assertTrue("spegnere è un esempio", dati.fase8.salvaFunzioni("mezzi", false).isFailure)
        val s = dati.fase8.sicurezza().getOrThrow()
        assertFalse(s.copiaCifrata)
        assertEquals("Marco Rossato", s.passwordIniziali.single().second)
        assertTrue(s.dispositivi.any { it.vecchio })
        val k = dati.fase8.copie().getOrThrow()
        assertEquals("Tutto torna", k.ultimaAutomatica!!.parola)
        assertTrue(k.provata(k.ultimaAutomatica!!.copia))
        val st = dati.fase8.statoSistema().getOrThrow()
        assertEquals("1.0.0", st.versione)
        assertEquals(8, st.schema)
        val c = dati.fase8.controlliFinali().getOrThrow()
        assertTrue(c.frase.contains(" di ${c.totale} fatti"))
        assertTrue(c.gruppi.flatMap { it.righe }.any { it.dalServer && it.stato == "non_va" })
        val n = dati.fase8.notifichePreferenze().getOrThrow()
        assertTrue(n.tipi.containsKey("integrazione_errore"))
    }

    @Test
    fun `la sessione della visita vede Integrazioni nel menu`() {
        val p = dati.sessione.value.permessi
        assertTrue(p.vede(Moduli.INTEGRAZIONI))
        assertTrue(p.modifica(Moduli.INTEGRAZIONI))
        assertTrue(dati.sessione.value.interfaccia.funzioniSpente.isEmpty())
    }
}
