package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/**
 * Le attività e il calendario (fase2.md §3, §5; architettura.md §13.6-13.7): i
 * gruppi dell'elenco, i buchi liberi della giornata, le sovrapposizioni, le
 * ricorrenze a parole, il promemoria, e le risposte del server.
 */
class AttivitaTest {
    private val oggi = LocalDate.of(2026, 10, 22)
    private fun alle(g: LocalDate, h: Int, m: Int = 0) = g.atTime(h, m)

    private val elenco = listOf(
        Attivita("1", "Chiamare Rossi", scadenza = oggi.minusDays(1), assegnataA = "1", priorita = Priorita.ALTA),
        Attivita("2", "Sopralluogo cabina", tipo = TipoAttivita.SOPRALLUOGO, inizio = alle(oggi, 14, 30), fine = alle(oggi, 16), assegnataA = "3"),
        Attivita("3", "Schema unifilare", scadenza = oggi, assegnataA = "1"),
        Attivita("4", "Rinnovo polizza", scadenza = oggi.plusDays(6), assegnataA = "1", ricorrenza = Ricorrenza(Ricorrenza.ANNI)),
        Attivita("5", "Cataloghi"),
        Attivita("6", "Già fatta ieri", scadenza = oggi.minusDays(1), stato = StatoAttivita.FATTA, fattaIl = "2026-10-21T18:00:00"),
        Attivita("7", "Fatta adesso", scadenza = oggi.minusDays(2), stato = StatoAttivita.FATTA, fattaIl = "2026-10-22T09:00:00"),
        Attivita("8", "Annullata", scadenza = oggi, stato = StatoAttivita.ANNULLATA),
        Attivita("9", "Riunione", tipo = TipoAttivita.APPUNTAMENTO, inizio = alle(oggi, 8, 30), fine = alle(oggi, 10), assegnataA = "1"),
    )

    @Test
    fun `i gruppi dell'elenco, con le fatte di oggi barrate e senza le annullate`() {
        val g = Agenda.gruppi(elenco, oggi)
        assertEquals(listOf(Agenda.Gruppo.SCADUTE, Agenda.Gruppo.OGGI, Agenda.Gruppo.PROSSIMI, Agenda.Gruppo.SENZA_DATA), g.keys.toList())
        assertEquals(listOf("1"), g.getValue(Agenda.Gruppo.SCADUTE).map { it.id })
        // Oggi: la fatta stamattina resta (barrata) anche se era di due giorni fa; prima quella col giorno più vecchio.
        assertEquals(setOf("2", "3", "7", "9"), g.getValue(Agenda.Gruppo.OGGI).map { it.id }.toSet())
        assertEquals(listOf("4"), g.getValue(Agenda.Gruppo.PROSSIMI).map { it.id })
        assertEquals(listOf("5"), g.getValue(Agenda.Gruppo.SENZA_DATA).map { it.id })
        assertTrue(g.values.flatten().none { it.id == "6" || it.id == "8" })
    }

    @Test
    fun `una ricorrente mostra solo la prossima, e oltre la settimana va in Più avanti`() {
        // La riunione di ogni lunedì per tre mesi: 13 ripetizioni, se ne vede una.
        val riunioni = (1..13).map { n ->
            Attivita("r$n", "Riunione di studio", tipo = TipoAttivita.APPUNTAMENTO, idRicorrenza = "7",
                inizio = alle(oggi.plusDays(2L + 7 * (n - 1)), 8, 30), fine = alle(oggi.plusDays(2L + 7 * (n - 1)), 9))
        }
        val lontana = Attivita("x", "Rinnovo assicurazione furgone", scadenza = oggi.plusDays(20))
        val g = Agenda.gruppi(riunioni + lontana, oggi)
        assertEquals(listOf("r1"), g.getValue(Agenda.Gruppo.PROSSIMI).map { it.id })
        assertEquals(listOf("x"), g.getValue(Agenda.Gruppo.PIU_AVANTI).map { it.id })
    }

    @Test
    fun `la giornata con gli orari e i buchi liberi`() {
        val giorno = Agenda.delGiorno(elenco, oggi)
        assertEquals(listOf("9", "2"), giorno.filter { it.conOra }.map { it.id })
        val pezzi = Agenda.giornata(giorno)
        assertEquals(3, pezzi.size)
        val libero = pezzi[1] as Agenda.Pezzo.Libero
        assertEquals(LocalTime.of(10, 0), libero.dalle)
        assertEquals(LocalTime.of(14, 30), libero.alle)
        // Due impegni attaccati non lasciano un buco; uno dentro l'altro neanche.
        val attaccati = listOf(
            Attivita("a", "A", tipo = TipoAttivita.APPUNTAMENTO, inizio = alle(oggi, 9), fine = alle(oggi, 10)),
            Attivita("b", "B", tipo = TipoAttivita.APPUNTAMENTO, inizio = alle(oggi, 10), fine = alle(oggi, 12)),
            Attivita("c", "C", tipo = TipoAttivita.APPUNTAMENTO, inizio = alle(oggi, 10, 30), fine = alle(oggi, 11)),
        )
        assertTrue(Agenda.giornata(attaccati).none { it is Agenda.Pezzo.Libero })
    }

    @Test
    fun `un appuntamento che si accavalla con un altro della stessa persona`() {
        val nuovo = Attivita("", "Collaudo", tipo = TipoAttivita.APPUNTAMENTO, inizio = alle(oggi, 9, 30), fine = alle(oggi, 11), assegnataA = "1")
        assertEquals(listOf("9"), Agenda.sovrapposti(nuovo, elenco).map { it.id })
        // Toccarsi non è sovrapporsi; un'altra persona non conta; tutto il giorno non conta.
        assertTrue(Agenda.sovrapposti(nuovo.copy(inizio = alle(oggi, 10), fine = alle(oggi, 11)), elenco).isEmpty())
        assertTrue(Agenda.sovrapposti(nuovo.copy(assegnataA = "3"), elenco).isEmpty())
        assertTrue(Agenda.sovrapposti(nuovo.copy(tuttoIlGiorno = true), elenco).isEmpty())
    }

    @Test
    fun `le ricorrenze a parole`() {
        assertEquals("ogni anno", Ricorrenza(Ricorrenza.ANNI).aParole)
        assertEquals("ogni 2 settimane il martedì e il giovedì", Ricorrenza(Ricorrenza.SETTIMANE, 2, listOf(4, 2)).aParole)
        assertEquals("ogni mese fino al 31/12/2026", Ricorrenza(Ricorrenza.MESI, fine = LocalDate.of(2026, 12, 31)).aParole)
        assertNull(Ricorrenza.daJson(JSONObject("{}")))
    }

    @Test
    fun `il promemoria, all'ora o alle 9 del giorno`() {
        assertEquals(alle(oggi, 13, 30), elenco[1].copy(promemoriaMinuti = 60).momentoPromemoria())
        assertEquals(alle(oggi.plusDays(5), 9), elenco[3].copy(promemoriaMinuti = 1440).momentoPromemoria())
        assertNull(elenco[4].copy(promemoriaMinuti = 60).momentoPromemoria())
        assertNull(elenco[2].momentoPromemoria())
    }

    @Test
    fun `l'attività della §13 6 e quello che si manda a salvaAttivita`() {
        val a = Attivita.daJson(
            JSONObject(
                """{"id":5,"titolo":"Rinnovo polizza professionale","descrizione":"","tipo":"attivita","idCliente":"","cliente":"","idCommessa":"",
                "commessa":"","idPrestazione":null,"assegnataA":1,"assegnata":"Manuel Gasparotto","creataDa":1,"priorita":"normale","stato":"da_fare",
                "scadenza":"2026-10-28","inizio":"","fine":"","tuttoIlGiorno":false,"luogo":"","promemoriaMinuti":1440,"idRicorrenza":1,"occorrenza":"2026-10-28",
                "ricorrenza":{"regola":"anni","ogni":1,"giorniSettimana":[],"inizio":"2026-10-28","fine":""},"fattaIl":"","giorno":"2026-10-28","gruppo":"prossimi",
                "checklist":[{"id":1,"testo":"Chiedere il preventivo alla compagnia","fatta":false,"ordine":1}],
                "allegati":[{"id":"D04yLN6e265kAflzujHc6Pa8OL2Q","nome":"polizza.pdf","mime":"application/pdf","url":"/file/D04yLN6e265kAflzujHc6Pa8OL2Q"}],
                "puoScrivere":true,"creato":"2026-10-21T08:00:00","modificato":"2026-10-21T08:00:00"}""",
            ),
        )
        assertEquals("1", a.assegnataA)
        assertEquals("Manuel Gasparotto", a.nomeAssegnata)
        assertEquals(LocalDate.of(2026, 10, 28), a.giorno)
        assertEquals(1440, a.promemoriaMinuti)
        assertEquals(Ricorrenza.ANNI, a.ricorrenza!!.regola)
        assertTrue(a.ricorrente)
        assertEquals("polizza.pdf", a.allegati.single().nome)
        assertEquals("1", a.checklist.single().id)
        assertNull(a.inizio)
        assertFalse(a.conOra)

        val app = Attivita.daJson(JSONObject("""{"id":3,"titolo":"Sopralluogo","tipo":"sopralluogo","inizio":"2026-10-22T14:30:00","fine":"2026-10-22T16:00:00","assegnataA":3}"""))
        assertEquals(LocalDateTime.of(2026, 10, 22, 14, 30), app.inizio)
        assertTrue(app.conOra)

        // A salvaAttivita: niente nomi né occorrenza; la checklist intera, senza gli id nati sul telefono; la regola solo se cambiata.
        val o = a.copy(checklist = a.checklist + VoceChecklist(PonteServer.NUOVO + "x", "Pagare")).perSalvare(conRicorrenza = false)
        assertEquals(5, o.getInt("id"))
        assertFalse(o.has("assegnata"))
        assertFalse(o.has("occorrenza"))
        assertFalse(o.has("ricorrenza"))
        assertEquals(1, o.getInt("assegnataA"))
        val cl = o.getJSONArray("checklist")
        assertEquals(2, cl.length())
        assertEquals(1, cl.getJSONObject(0).getInt("id"))
        assertFalse(cl.getJSONObject(1).has("id"))
        val nuova = Attivita("", "Nuova").perSalvare(conRicorrenza = true)
        assertFalse(nuova.has("id"))
        assertTrue(nuova.isNull("assegnataA"))
        assertTrue(nuova.isNull("ricorrenza"))
    }

    @Test
    fun `la dashboard della visita con le voci della fase 2`() {
        val ana = Anagrafiche(utenti = listOf(Utente("1", "Manuel Gasparotto"), Utente("3", "Marco Rossato")))
        val preventivi = listOf(
            Preventivo("P1", numero = "PR/2026/012", oggetto = "Capannone", stato = StatoPreventivo.INVIATO, data = oggi.minusDays(7), scadenza = oggi.plusDays(6)),
            Preventivo("P2", numero = "PR/2026/007", oggetto = "Quadro", stato = StatoPreventivo.INVIATO, data = oggi.minusDays(46), scadenza = oggi.minusDays(16)),
            Preventivo("P3", numero = "PR/2026/013", oggetto = "Terra", stato = StatoPreventivo.BOZZA, data = oggi),
        )
        val v = CosaFareFase2.calcola(preventivi, elenco, ana, oggi, conti = { 100.0 })
        assertTrue(v.urgenti.any { it.collegamento?.pagina == "attivita" && it.collegamento.id == "1" })
        assertTrue(v.urgenti.any { it.collegamento?.id == "P2" })
        assertTrue(v.settimana.any { it.titolo == "Sopralluogo cabina oggi alle 14:30" && it.collegamento?.pagina == "calendario" })
        assertTrue(v.settimana.any { it.collegamento?.id == "P1" && it.quanto == 100.0 })
        assertTrue(v.pianificare.any { it.tipo == "preventivo" && it.collegamento?.pagina == "preventivi" })
        // Il collaboratore: solo le sue, niente preventivi.
        val marco = CosaFareFase2.calcola(preventivi, elenco, ana, oggi, costi = false, vedePreventivi = false, soloDi = "3")
        assertTrue((marco.urgenti + marco.settimana + marco.pianificare).none { it.tipo == "preventivo" })
        assertTrue(marco.urgenti.isEmpty())
        assertEquals(1, marco.settimana.size)
    }
}
