package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * I conti della fase 6 (architettura.md §17.20) contro i casi condivisi del server,
 * letti dal file così com'è: server/prove/casi-persone.json (festivi, giorni lavorativi,
 * ore di un'assenza, saldo di ferie e permessi, costo orario dal costo dell'anno),
 * casi-mezzi.json (stato della taratura, revisione, tagliando a km), casi-incarichi.json
 * (i soldi di un incarico). Il telefono deve ritrovare ogni numero al centesimo.
 */
class ContiFase6Test {

    private fun casi(nome: String): JSONObject? =
        listOf("../server/prove/$nome", "server/prove/$nome").map(::File).firstOrNull { it.exists() }?.let { JSONObject(it.readText()) }

    private fun giorni(a: JSONArray?): List<Int> = a?.let { (0 until it.length()).map { i -> it.getInt(i) } } ?: listOf(1, 2, 3, 4, 5)
    private fun d(s: String?): LocalDate? = s?.takeIf { it.isNotBlank() }?.let { LocalDate.parse(it) }
    private fun numeroONull(o: JSONObject, k: String): Double? = if (!o.has(k) || o.isNull(k)) null else o.getDouble(k)

    @Test
    fun `festivi, giorni lavorativi e ore delle assenze come il server`() {
        val c = casi("casi-persone.json")
        assumeTrue("Manca server/prove/casi-persone.json", c != null)
        c!!.getJSONArray("festivi").oggetti().forEach { k ->
            val attesi = (0 until k.getJSONArray("atteso").length()).map { LocalDate.parse(k.getJSONArray("atteso").getString(it)) }
            assertEquals(k.testo("nome"), attesi, ContiPersone.festivi(k.getInt("anno"), k.testo("patrono")))
        }
        c.getJSONArray("giorniLavorativi").oggetti().forEach { k ->
            val dal = LocalDate.parse(k.testo("dal"))
            val al = LocalDate.parse(k.testo("al"))
            val f = ContiPersone.festiviTra(dal, al, k.testo("patrono"))
            assertEquals(k.testo("nome"), k.getInt("atteso"), ContiPersone.giorniLavorativi(dal, al, giorni(k.optJSONArray("giorni")), f))
        }
        c.getJSONArray("oreAssenza").oggetti().forEach { k ->
            val a = k.getJSONObject("assenza")
            val p = k.getJSONObject("persona")
            val dal = LocalDate.parse(a.testo("dal"))
            val al = d(a.testo("al")) ?: dal
            val (gg, ore) = ContiPersone.oreAssenza(
                ContiPersone.DatiAssenza(a.testo("tipo"), dal, al, a.testo("mezza"), a.testo("dalle"), a.testo("alle"), numeroONull(a, "ore")),
                numeroONull(p, "oreSettimana"), giorni(p.optJSONArray("giorniSettimana")), ContiPersone.festiviTra(dal, al, k.testo("patrono")),
            )
            val atteso = k.getJSONObject("atteso")
            assertEquals(k.testo("nome") + ": giorni", atteso.getDouble("giorni"), gg, 0.001)
            assertEquals(k.testo("nome") + ": ore", atteso.getDouble("ore"), ore, 0.001)
        }
    }

    @Test
    fun `saldo di ferie e permessi dal cedolino, come il server`() {
        val c = casi("casi-persone.json")
        assumeTrue("Manca server/prove/casi-persone.json", c != null)
        c!!.getJSONArray("saldoAssenze").oggetti().forEach { k ->
            val s = ContiPersone.saldo(
                annue = numeroONull(k, "annue"),
                saldi = k.optJSONArray("saldi").oggetti().map { ContiPersone.SaldoScritto(LocalDate.parse(it.testo("data")), it.getDouble("ore")) },
                assenze = k.optJSONArray("assenze").oggetti().map { ContiPersone.AssenzaSaldo(LocalDate.parse(it.testo("dal")), it.getDouble("ore"), it.testo("stato")) },
                oggi = LocalDate.parse(k.testo("oggi")), entrata = d(k.testo("entrata")), uscita = d(k.testo("uscita")),
            )
            val atteso = k.getJSONObject("atteso")
            val nome = k.testo("nome")
            if (!atteso.optBoolean("tenuto")) { assertNull(nome, s); return@forEach }
            assertTrue(nome, s!!.tenuto)
            for (campo in listOf("scritto", "maturate", "godute", "oggi", "prenotate", "restano")) {
                val v = when (campo) { "scritto" -> s.scritto; "maturate" -> s.maturate; "godute" -> s.godute; "oggi" -> s.oggi; "prenotate" -> s.prenotate; else -> s.restano }
                assertEquals("$nome: $campo", atteso.getDouble(campo), v, 0.001)
            }
            if (atteso.has("scrittoIl")) assertEquals("$nome: scrittoIl", atteso.testo("scrittoIl"), s.scrittoIl)
        }
        c.getJSONArray("costoOrarioDaAnno").oggetti().forEach { k ->
            val r = ContiPersone.costoOrarioDaAnno(k.getDouble("costoAnno"), k.getDouble("oreAnno"))
            if (k.isNull("atteso")) assertNull(r) else assertEquals(k.getDouble("atteso"), r!!, 0.001)
        }
        // Le ore diventano giorni con le ore del giorno della persona (104 ore a 8 = 13, a un decimale come il server).
        assertEquals(13.0, ContiPersone.giorniDaOre(104.0, 8.0), 0.0)
        assertEquals(8.0, ContiPersone.giorniDaOre(64.0, 8.0), 0.0)
        assertEquals(12.0, ContiPersone.giorniDaOre(72.0, 6.0), 0.0)
    }

    @Test
    fun `stato della taratura, revisione e tagliando come il server`() {
        val c = casi("casi-mezzi.json")
        assumeTrue("Manca server/prove/casi-mezzi.json", c != null)
        c!!.getJSONArray("statoTaratura").oggetti().forEach { k ->
            val x = k.getJSONObject("x")
            val s = ContiMezzi.statoTaratura(x.testo("controllo"), ContiMezzi.Ultima.daJson(x.optJSONObject("ultima")), x.testo("fuoriUso"), x.optBoolean("inLaboratorio"),
                LocalDate.parse(k.testo("oggi")), k.getInt("preavviso"))
            val nome = k.testo("nome")
            if (k.isNull("atteso")) { assertNull(nome, s); return@forEach }
            val a = k.getJSONObject("atteso")
            assertEquals("$nome: stato", a.testo("stato"), s!!.stato)
            assertEquals("$nome: parola", a.testo("parola"), s.parola)
            assertEquals("$nome: giorni", if (a.isNull("giorni")) null else a.getInt("giorni"), s.giorni)
            assertEquals("$nome: scade", a.testo("scade"), s.scade)
        }
        c.getJSONArray("scadenzaRevisione").oggetti().forEach { k ->
            assertEquals(k.testo("nome"), k.testo("atteso"), ContiMezzi.scadenzaRevisione(k.testo("immatricolazione"), k.testo("ultimaRevisione")))
        }
        c.getJSONArray("kmAlTagliando").oggetti().forEach { k ->
            val r = ContiMezzi.kmAlTagliando(numeroONull(k, "tagliandoKm"), numeroONull(k, "tagliandoUltimoKm"), numeroONull(k, "km"))
            if (k.isNull("atteso")) assertNull(k.testo("nome"), r) else assertEquals(k.testo("nome"), k.getLong("atteso"), r)
        }
    }

    @Test
    fun `i soldi di un incarico come il server`() {
        val c = casi("casi-incarichi.json")
        assumeTrue("Manca server/prove/casi-incarichi.json", c != null)
        c!!.getJSONArray("incarichi").oggetti().forEach { k ->
            val r = ContiIncarichi.conti(
                modo = k.testo("modo"), compenso = k.optDouble("compenso", 0.0), tariffa = k.optDouble("tariffa", 0.0), orePreviste = k.optDouble("orePreviste", 0.0),
                tetto = numeroONull(k, "tetto"), avanzamento = k.optDouble("avanzamento", 0.0), oreApprovate = k.optDouble("oreApprovate", 0.0),
                speseComprese = !k.has("speseComprese") || k.optBoolean("speseComprese", true), speseDaRiconoscere = k.optDouble("speseDaRiconoscere", 0.0),
                ricevute = k.optJSONArray("ricevute").oggetti().map { ContiIncarichi.Ricevuta(it.optDouble("imponibile", 0.0), it.optDouble("contributo", 0.0), it.optDouble("bollo", 0.0), it.testo("tipo"), it.optDouble("daPagare", 0.0)) },
            )
            val a = k.getJSONObject("atteso")
            val nome = k.testo("nome")
            assertEquals("$nome: pattuito", a.getDouble("pattuito"), r.pattuito, 0.001)
            assertEquals("$nome: maturato", a.getDouble("maturato"), r.maturato, 0.001)
            assertEquals("$nome: fatturato", a.getDouble("fatturato"), r.fatturato, 0.001)
            assertEquals("$nome: costo", a.getDouble("costo"), r.costo, 0.001)
            assertEquals("$nome: da fatturare", a.getDouble("daFatturare"), r.daFatturare, 0.001)
            if (a.has("daPagare")) assertEquals("$nome: da pagare", a.getDouble("daPagare"), r.daPagare, 0.001)
        }
    }

    @Test
    fun `senza rete lo stato della taratura si rifà dalla data`() {
        // Il multimetro che scade stanotte: oggi "scade oggi", domattina "scaduta" anche senza rete (§3.13).
        val s = StrumentoMio("4", "AT004", "Multimetro 87V", "strumento", "6011-2381", "taratura", "",
            ContiMezzi.Ultima("2025-10-22", "2026-10-22", "conforme"), ContiMezzi.StatoTaratura("in_scadenza", "Taratura scade oggi", 0, "2026-10-22"))
        assertEquals("in_scadenza", s.statoOggi(LocalDate.parse("2026-10-22"))!!.stato)
        assertEquals("Taratura scaduta da 1 giorno", s.statoOggi(LocalDate.parse("2026-10-23"))!!.parola)
        // Al laboratorio resta al laboratorio: lo dice il server, non la data.
        val lab = s.copy(taratura = ContiMezzi.StatoTaratura("laboratorio", "In taratura", null, "2026-10-22"))
        assertEquals("laboratorio", lab.statoOggi(LocalDate.parse("2026-11-30"))!!.stato)
    }
}
