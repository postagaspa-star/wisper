package eu.stgm.wisper

import eu.stgm.wisper.rapportino.EsecutoreFase4
import eu.stgm.wisper.rapportino.FiltroFatture
import eu.stgm.wisper.rapportino.RegoleFattura
import eu.stgm.wisper.rapportino.SceltaDaFatturare
import eu.stgm.wisper.rapportino.ServizioFase4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * Fatture, banche e scadenze della visita guidata (EsempioFase4): le pagine nuove
 * hanno da mostrare, i conti tornano con RegoleFattura, e le azioni da un minuto
 * (bozza, passaggio, incasso) si possono fare senza uscire dal telefono.
 */
class DatiEsempioFase4Test {
    private val oggi = LocalDate.of(2026, 10, 22)
    private val s = ServizioFase4(EsempioFase4(oggi), null, object : EsecutoreFase4 {
        override suspend fun <T> esegui(lavoro: suspend () -> T): Result<T> = runCatching { lavoro() }
    })

    @Test
    fun `da fatturare, la bozza, il passaggio e un incasso in parte`() = runBlocking {
        val d = s.daFatturare().getOrThrow()
        assertEquals(2, d.gruppi.size)
        val rap = d.tutte.first { it.tipo == "rapportino" && it.idCliente == "C002" }
        val scelte = SceltaDaFatturare.cambia(emptySet(), rap, d.tutte).scelte
        val bozza = s.preparaFattura("C002", d.tutte.filter { it.chiave in scelte }, null).getOrThrow()
        assertEquals("bozza", bozza.stato)
        val k = RegoleFattura.calcola(bozza.parametri, bozza.righe.map { it.perConti(false) })
        assertEquals(bozza.conti!!.netto, k.netto, 0.0)
        assertTrue("non torna più da fatturare", s.daFatturare().getOrThrow().tutte.none { it.chiave == rap.chiave })
        assertTrue(s.passaAlProgramma(bozza.id, false).isFailure)
        val (pronta, pacchetto) = s.passaAlProgramma(bozza.id, true).getOrThrow()
        assertEquals("pronta", pronta.stato)
        assertTrue(pacchetto!!.sezioni.isNotEmpty())
        // 45/2026: 1.232,34 da incassare, 500 in parte.
        val f45 = s.fatture(FiltroFatture()).getOrThrow().first { it.numero.startsWith("45/") }
        assertEquals(1232.34, f45.residuo!!, 0.0)
        val (_, dopo) = s.segnaIncasso(f45.id, 500.0, oggi, "1", false).getOrThrow()
        assertEquals("Pagata in parte", dopo!!.statoVisto)
        assertEquals(732.34, dopo.residuo!!, 0.0)
        assertTrue(s.segnaIncasso(f45.id, 1000.0, oggi, "1", false).isFailure)
    }

    @Test
    fun `scadenziario, situazione, tributi, conti, ricevute e riepilogo hanno da mostrare`() = runBlocking {
        val sc = s.scadenziario().getOrThrow()
        assertTrue(sc.giorni.isNotEmpty())
        assertTrue("la 39/2026 è scaduta", sc.scaduti.isNotEmpty())
        assertTrue("c'è un giorno sotto soglia", sc.giorni.any { it.sottoSoglia })
        sc.ricalcola().forEachIndexed { i, (saldo, sotto) ->
            assertEquals(sc.giorni[i].saldo!!, saldo, 0.005)
            assertEquals(sc.giorni[i].sottoSoglia, sotto)
        }
        assertEquals(13, s.situazione().getOrThrow().settimane.size)
        assertTrue(s.impegni().getOrThrow().any { it.proposta })
        assertEquals("3456", s.conti().getOrThrow().first().ultimeCifre)
        assertTrue(s.ricevute("da_pagare").getOrThrow().isNotEmpty())
        assertTrue(s.riepilogoFatturato(2026, "mese").getOrThrow().righe.isNotEmpty())
        assertTrue(s.movimenti().getOrThrow().movimenti.isNotEmpty())
        // Il resto dice che è un esempio, non finge di salvare.
        assertTrue(s.salvaConto(org.json.JSONObject().put("nome", "Prova")).exceptionOrNull()!!.message!!.contains("esempio"))
    }
}
