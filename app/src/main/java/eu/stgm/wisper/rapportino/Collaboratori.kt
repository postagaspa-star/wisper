package eu.stgm.wisper.rapportino

import org.json.JSONObject

/*
 * Fase 6, collaboratori esterni (fase6.md §8, architettura.md §17.14-§17.16): il
 * fornitore con la scheda del collaboratore, l'idoneità coi documenti, gli incarichi
 * coi compensi, l'accesso col ruolo `esterno`. I soldi (tariffa, compensi, conti)
 * arrivano solo con `costi`, e all'esterno i suoi: null = non si vedono.
 */

/** I conti di un incarico portati da conti.js, coi casi di server/prove/casi-incarichi.json. */
object ContiIncarichi {
    private fun c(n: Double) = Math.floor(n * 100 + 0.5) / 100.0

    data class Ricevuta(val imponibile: Double, val contributo: Double = 0.0, val bollo: Double = 0.0, val tipo: String = "TD01", val daPagare: Double = 0.0)

    data class Conti(val pattuito: Double, val maturato: Double, val fatturato: Double, val costo: Double, val daFatturare: Double, val daPagare: Double)

    fun conti(
        modo: String, compenso: Double = 0.0, tariffa: Double = 0.0, orePreviste: Double = 0.0, tetto: Double? = null, avanzamento: Double = 0.0,
        oreApprovate: Double = 0.0, speseComprese: Boolean = true, speseDaRiconoscere: Double = 0.0, ricevute: List<Ricevuta> = emptyList(),
    ): Conti {
        val corpo = modo != "ore"
        val t = tetto?.takeIf { it > 0 }
        var pattuito: Double
        var maturato: Double
        if (corpo) {
            pattuito = c(compenso)
            maturato = c(compenso * avanzamento / 100)
        } else {
            pattuito = c(orePreviste * tariffa)
            if (t != null && t < pattuito) pattuito = c(t)
            maturato = c(oreApprovate * tariffa)
            if (t != null && maturato > t) maturato = c(t)
        }
        if (!speseComprese) maturato = c(maturato + speseDaRiconoscere)
        var fatturato = 0.0
        var costo = 0.0
        var daPagare = 0.0
        for (r in ricevute) {
            val segno = if (r.tipo == "TD04") -1 else 1
            fatturato += segno * r.imponibile
            costo += segno * (r.imponibile + r.contributo + r.bollo)
            if (segno > 0) daPagare += r.daPagare
        }
        fatturato = c(fatturato)
        costo = c(costo)
        return Conti(pattuito, maturato, fatturato, costo, c(maxOf(0.0, maturato - fatturato)), c(daPagare))
    }
}

/** L'idoneità di un collaboratore: In regola (verde), Manca qualcosa (ambra), Documenti scaduti (rosso). */
data class Idoneita(val stato: String, val parola: String, val frase: String = "", val mancano: List<String> = emptyList(), val scaduti: List<String> = emptyList(), val prossima: String = "") {
    val colore: String
        get() = when (stato) {
            "in_regola" -> ColoreFase5.VERDE
            "manca" -> ColoreFase5.AMBRA
            "scaduti" -> ColoreFase5.ROSSO
            else -> ColoreFase5.GRIGIO
        }
    val inRegola: Boolean get() = stato == "in_regola" || stato.isBlank()

    companion object {
        fun daJson(o: JSONObject?): Idoneita? = o?.let {
            val p = it.optJSONObject("prossima")
            Idoneita(
                it.testo("stato"), it.testo("parola"), it.testo("frase"),
                it.optJSONArray("mancano")?.let { a -> (0 until a.length()).map { i -> a.optString(i) } }.orEmpty(),
                it.optJSONArray("scaduti")?.let { a -> (0 until a.length()).map { i -> a.optString(i) } }.orEmpty(),
                p?.let { x -> listOf(x.testo("nome"), x.testo("data").let(::dataIt)).filter { s -> s.isNotBlank() }.joinToString(" · ") }.orEmpty(),
            )
        }
    }
}

/** I soldi di un incarico o di un collaboratore: null = non si vedono. */
data class Compensi(val pattuito: Double, val maturato: Double, val fatturato: Double, val daFatturare: Double, val daPagare: Double, val incarichi: Int = 0) {
    companion object {
        fun daJson(o: JSONObject?): Compensi? = o?.let {
            Compensi(it.numero("pattuito") ?: 0.0, it.numero("maturato") ?: 0.0, it.numero("fatturato") ?: 0.0, it.numero("daFatturare") ?: 0.0, it.numero("daPagare") ?: 0.0, it.optInt("incarichi"))
        }
    }
}

data class Valutazioni(val bene: Int = 0, val problemi: Int = 0, val male: Int = 0) {
    val totale: Int get() = bene + problemi + male

    companion object {
        fun daJson(o: JSONObject?) = Valutazioni(o?.optInt("bene") ?: 0, o?.optInt("problemi") ?: 0, o?.optInt("male") ?: 0)
    }
}

/** Una riga dell'elenco dei collaboratori. */
data class RigaCollaboratore(val idSoggetto: String, val nome: String, val tipo: String, val tipoNome: String, val mestiere: String, val attivo: Boolean, val idoneita: Idoneita?, val incarichiInCorso: Int, val valutazioni: Valutazioni, val daFatturare: Double?) {
    companion object {
        fun daJson(o: JSONObject) = RigaCollaboratore(
            o.testo("idSoggetto"), o.testo("nome"), o.testo("tipo"), o.testo("tipoNome"), o.testo("mestiere"), !o.has("attivo") || o.vero("attivo"),
            Idoneita.daJson(o.optJSONObject("idoneita")), o.optInt("incarichiInCorso"), Valutazioni.daJson(o.optJSONObject("valutazioni")), o.numero("daFatturare"),
        )
    }
}

/** Un documento del collaboratore (DURC, visura, polizza) con la sua scadenza. */
data class DocumentoCollaboratore(val id: String, val titolo: String, val tipoScadenza: String, val tipoNome: String, val data: String, val scade: String, val statoVisto: String, val url: String) {
    companion object {
        fun daJson(o: JSONObject) = DocumentoCollaboratore(o.testo("id"), o.testo("titolo"), o.testo("tipoScadenza"), o.testo("tipoNome"), o.testo("data"), o.testo("scade"), o.testo("statoVisto"), o.testo("url"))
    }
}

data class AccessoEsterno(val idUtente: String, val nome: String, val email: String, val ultimoAccesso: String, val attivo: Boolean)

/** Un incarico (§8.2): [conti] null se i soldi non si vedono. */
data class Incarico(
    val id: String, val numero: String, val idSoggetto: String = "", val collaboratore: String = "", val idCommessa: String = "", val commessa: String = "",
    val cliente: String = "", val titolo: String = "", val modo: String = "corpo", val modoVisto: String = "", val stato: String = "bozza", val statoVisto: String = "",
    val avanzamento: Int = 0, val dal: String = "", val al: String = "", val orePreviste: Double? = null, val speseComprese: Boolean = true,
    val referente: String = "", val compenso: Double? = null, val tariffa: Double? = null, val tetto: Double? = null, val conti: Compensi? = null,
    val oreApprovate: Double = 0.0, val valutazione: String = "", val valutazioneVista: String = "", val daValutare: Boolean = false,
    // ---- la pagina
    val descrizione: String = "", val occasionale: Boolean = false, val idoneita: Idoneita? = null, val collaboratoreHaAccesso: Boolean = false,
    val ricevute: List<RicevutaIncarico> = emptyList(), val ore: List<RigaOreIncarico> = emptyList(), val cronologia: List<VoceCronologia> = emptyList(),
    val valutazioneNota: String = "", val puoScrivere: Boolean = false,
    /** I rapportini sull'incarico, le spese, i documenti legati (la lettera d'incarico). */
    val rapportini: List<RapportinoIncarico> = emptyList(), val spese: List<SpesaIncarico> = emptyList(), val documenti: List<DocArchivio> = emptyList(),
) {
    val colore: String
        get() = when (stato) {
            "bozza" -> ColoreFase5.GIALLO
            "affidato" -> ColoreFase5.BLU
            "concluso" -> ColoreFase5.VERDE
            else -> ColoreFase5.GRIGIO
        }

    companion object {
        fun daJson(o: JSONObject): Incarico {
            val k = o.optJSONObject("conti")
            return Incarico(
                id = o.testo("id"), numero = o.testo("numero"), idSoggetto = o.testo("idSoggetto"), collaboratore = o.testo("collaboratore"),
                idCommessa = o.testo("idCommessa"), commessa = o.testo("commessa"), cliente = o.testo("cliente"), titolo = o.testo("titolo"),
                modo = o.testo("modo").ifBlank { "corpo" }, modoVisto = o.testo("modoVisto").ifBlank { if (o.testo("modo") == "ore") "A ore" else "A corpo" },
                stato = o.testo("stato"), statoVisto = o.testo("statoVisto"), avanzamento = (o.numero("avanzamento") ?: 0.0).toInt(),
                dal = o.testo("dal"), al = o.testo("al"), orePreviste = o.numero("orePreviste"), speseComprese = !o.has("speseComprese") || o.vero("speseComprese"),
                referente = o.testo("referente"), compenso = o.numero("compenso"), tariffa = o.numero("tariffa"), tetto = o.numero("tetto"),
                conti = Compensi.daJson(k), oreApprovate = k?.numero("oreApprovate") ?: 0.0,
                valutazione = o.testo("valutazione"), valutazioneVista = o.testo("valutazioneVista"), daValutare = o.vero("daValutare"),
                descrizione = o.testo("descrizione"), occasionale = o.vero("occasionale"), idoneita = Idoneita.daJson(o.optJSONObject("idoneita")),
                collaboratoreHaAccesso = o.vero("collaboratoreHaAccesso"), ricevute = o.optJSONArray("ricevute").oggetti().map(RicevutaIncarico::daJson),
                ore = o.optJSONArray("ore").oggetti().map(RigaOreIncarico::daJson),
                cronologia = o.optJSONArray("cronologia").oggetti().map { VoceCronologia(it.testo("quando"), it.testo("chi"), it.testo("testo")) },
                valutazioneNota = o.testo("valutazioneNota"), puoScrivere = o.vero("puoScrivere"),
                rapportini = o.optJSONArray("rapportini").oggetti().map(RapportinoIncarico::daJson),
                spese = o.optJSONArray("spese").oggetti().map(SpesaIncarico::daJson),
                documenti = o.optJSONArray("documenti").oggetti().map(DocArchivio::daJson),
            )
        }
    }
}

data class RicevutaIncarico(val id: String, val numero: String, val data: String, val imponibile: Double?, val statoPagamento: String) {
    companion object {
        fun daJson(o: JSONObject) = RicevutaIncarico(o.testo("id"), o.testo("numero"), o.testo("data"), o.numero("imponibile"), o.testo("statoPagamento"))
    }
}

/** Un rapportino scritto sull'incarico: numero, giorno, cosa, le ore. */
data class RapportinoIncarico(val id: String, val data: String, val descrizione: String, val ore: Double) {
    companion object {
        fun daJson(o: JSONObject) = RapportinoIncarico(o.testo("id"), o.testo("data"), o.testo("descrizione"), o.numero("oreTotali") ?: 0.0)
    }
}

/** Una spesa sull'incarico (l'importo non c'è senza i soldi). */
data class SpesaIncarico(val descrizione: String, val data: String, val importo: Double?) {
    companion object {
        fun daJson(o: JSONObject) = SpesaIncarico(o.testo("descrizione").ifBlank { CategoriaSpesa.nome(o.testo("categoria")) }, o.testo("data"), o.numero("importo"))
    }
}

data class RigaOreIncarico(val data: String, val ore: Double, val descrizione: String, val stato: String) {
    companion object {
        fun daJson(o: JSONObject) = RigaOreIncarico(o.testo("data"), o.numero("ore") ?: 0.0, o.testo("descrizione"), o.testo("statoVisto").ifBlank { o.testo("stato") })
    }
}

/** La scheda del collaboratore (§8.1, §17.14): note e valutazioni dello studio non arrivano all'esterno. */
data class Collaboratore(
    val idSoggetto: String, val nome: String, val tipo: String = "", val tipoNome: String = "", val mestiere: String = "", val abilitazioni: String = "",
    val referente: String = "", val attivo: Boolean = true, val partitaIva: String = "", val telefono: String = "", val email: String = "", val citta: String = "",
    val idoneita: Idoneita? = null, val documenti: List<DocumentoCollaboratore> = emptyList(), val inCorso: Int = 0, val conclusi: Int = 0, val daValutare: Int = 0,
    val valutazioni: Valutazioni? = null, val incarichi: List<Incarico> = emptyList(), val accessi: List<AccessoEsterno> = emptyList(),
    val tariffa: Double? = null, val compensi: Compensi? = null, val programmaDurc: String = "", val comunicazioneIspettorato: String = "",
    val puoScrivere: Boolean = false, val puoAffidare: Boolean = false, val puoCaricareDocumenti: Boolean = false,
) {
    companion object {
        fun daJson(o: JSONObject): Collaboratore {
            val i = o.optJSONObject("incarichi")
            return Collaboratore(
                idSoggetto = o.testo("idSoggetto"), nome = o.testo("nome"), tipo = o.testo("tipo"), tipoNome = o.testo("tipoNome"), mestiere = o.testo("mestiere"),
                abilitazioni = o.testo("abilitazioni"), referente = o.testo("referente"), attivo = !o.has("attivo") || o.vero("attivo"),
                partitaIva = o.testo("partitaIva"), telefono = o.testo("telefono"), email = o.testo("email"), citta = o.testo("citta"),
                idoneita = Idoneita.daJson(o.optJSONObject("idoneita")), documenti = o.optJSONArray("documenti").oggetti().map(DocumentoCollaboratore::daJson),
                inCorso = i?.optInt("inCorso") ?: 0, conclusi = i?.optInt("conclusi") ?: 0, daValutare = i?.optInt("daValutare") ?: 0,
                valutazioni = if (o.has("valutazioni")) Valutazioni.daJson(o.optJSONObject("valutazioni")) else null,
                incarichi = o.optJSONArray("elencoIncarichi").oggetti().map(Incarico::daJson),
                accessi = o.optJSONArray("accessi").oggetti().map { AccessoEsterno(it.testo("idUtente"), it.testo("nome"), it.testo("email"), it.testo("ultimoAccesso"), it.vero("attivo")) },
                tariffa = o.numero("tariffa"), compensi = Compensi.daJson(o.optJSONObject("compensi")), programmaDurc = o.testo("programmaDurc"),
                comunicazioneIspettorato = o.testo("comunicazioneIspettorato"), puoScrivere = o.vero("puoScrivere"), puoAffidare = o.vero("puoAffidare"),
                puoCaricareDocumenti = o.vero("puoCaricareDocumenti"),
            )
        }
    }
}
