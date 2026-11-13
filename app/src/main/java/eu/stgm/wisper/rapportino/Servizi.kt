package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer

/*
 * Servizi e indennità (1.4.0, docs/gestionale/servizi.md §1-§2).
 *
 * Il listino della fase 2 ([VoceListino]) è l'anagrafica dei servizi coi campi di Flextaxa, il programma con cui
 * Manuel emette le fatture. Un'indennità di un lavoro del rapportino ([Indennita]) è un servizio "congelato" quel
 * giorno, con la quantità: cambiare il prezzo nei Servizi non riscrive i rapportini già fatti.
 *
 * Qui solo Kotlin semplice, per le prove: le regole sono le stesse di server/src/servizi.js (unità e modo, tag,
 * importo di un'indennità = centesimi(quantità × prezzo), quantità vuota = 1).
 */
object Servizi {
    /** Le unità di misura che si scelgono con un tocco (quelle di Flextaxa). Se ne può tenere un'altra già scritta. */
    val UNITA = listOf("Nr", "Ore", "Pz", "Km", "Giorni", "A corpo")

    /** Le aliquote IVA che si scelgono, in percento. */
    val ALIQUOTE = listOf(22.0, 10.0, 5.0, 4.0, 0.0)

    const val SERVIZIO = "servizio"
    const val PRODOTTO = "prodotto"

    /** Il modo del preventivo che viene dall'unità (modoDaUnita del server): Ore -> ore, A corpo o niente -> corpo, le altre -> quantità. */
    fun modoDaUnita(unita: String): String {
        val u = unita.trim().lowercase()
        return when {
            u.isEmpty() || u == "a corpo" || u == "corpo" -> ModoVoce.CORPO
            u == "ore" || u == "ora" || u == "h" -> ModoVoce.ORE
            else -> ModoVoce.QUANTITA
        }
    }

    /**
     * L'unità da mostrare e da proporre, anche per i servizi di prima della 1.4.0 (modo ore e unità "h", a corpo senza
     * unità): come unitaDi di pc/ui/regole-servizi.js. Senza, un servizio vecchio scelto come indennità chiedeva l'unità.
     */
    fun unitaDi(v: VoceListino): String {
        val u = v.unita.trim()
        if (u.isNotEmpty()) {
            UNITA.firstOrNull { it.equals(u, ignoreCase = true) }?.let { return it }
            return if (u.equals("h", ignoreCase = true)) "Ore" else u
        }
        return when (v.modo) {
            ModoVoce.ORE -> "Ore"
            ModoVoce.CORPO -> "A corpo"
            else -> ""
        }
    }

    /** I tag da "trasferta, cantiere": senza vuoti né doppioni (maiuscole a parte), come tagDa del server. */
    fun tagDa(testo: String): List<String> {
        val visti = HashSet<String>()
        return testo.split(',', ';', '\n').map { it.trim().replace(Regex("""\s+"""), " ") }
            .filter { it.isNotEmpty() && visti.add(it.lowercase()) }
    }

    /** I tag da un JSON: un elenco o un testo con le virgole (i dati di prima). */
    fun tagDaJson(o: JSONObject, campo: String = "tag"): List<String> {
        if (!o.has(campo) || o.isNull(campo)) return emptyList()
        val a = o.optJSONArray(campo)
        return if (a != null) tagDa((0 until a.length()).joinToString(",") { a.optString(it) }) else tagDa(o.optString(campo))
    }

    /** Minuscolo e senza accenti: "Indennità" e "indennita" sono la stessa parola. */
    fun normalizza(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("""\p{M}+"""), "").lowercase()

    /** Per cercare: solo lettere e cifre, senza accenti. */
    private fun piatto(s: String): String = normalizza(s).replace(Regex("[^a-z0-9]"), "")

    /** Il servizio si chiama "Indennità…": nella schermata Indennità viene prima degli altri. */
    fun eIndennita(v: VoceListino): Boolean = normalizza(v.nome).trimStart().startsWith("indennita")

    /** Vero se il servizio si trova con [testo] (descrizione, codice, tag, e la descrizione lunga se c'è). */
    fun trovato(v: VoceListino, testo: String): Boolean {
        val t = piatto(testo)
        if (t.isEmpty()) return true
        return piatto((listOf(v.nome, v.codice, v.descrizione) + v.tag).joinToString(" ")).contains(t)
    }

    /** L'elenco dei Servizi: quelli trovati, nell'ordine dello studio. */
    fun elenco(voci: List<VoceListino>, testo: String, attivi: Boolean = true): List<VoceListino> =
        voci.filter { it.attivo == attivi && trovato(it, testo) }.sortedWith(compareBy<VoceListino> { it.ordine }.thenBy { normalizza(it.nome) })

    /** I servizi da scegliere (per un'indennità, per una riga della fattura): un elenco solo, i non archiviati (13/11/2026: niente più "prima le indennità"). */
    fun perIndennita(voci: List<VoceListino>, testo: String): List<VoceListino> =
        elenco(voci, testo)

    /** Al centesimo, il mezzo verso l'alto (Math.round di JavaScript). */
    fun centesimi(n: Double): Double = Math.floor(n * 100 + 0.5) / 100.0

    /** L'importo di un'indennità: quantità (vuota = 1) per prezzo (vuoto = 0), al centesimo. */
    fun importo(quantita: Double?, prezzo: Double?): Double = centesimi((quantita ?: 1.0) * (prezzo ?: 0.0))

    /** La somma delle indennità di un lavoro, ognuna già al centesimo (importoIndennita del server). */
    fun somma(lista: List<Indennita>?): Double = centesimi(lista.orEmpty().sumOf { it.importo })

    /** "22%", "0%", "5,5%". */
    fun aliquota(n: Double): String = Numeri.scrivi(n) + "%"
}

/**
 * Un'indennità di un lavoro (servizi.md §2): i campi del servizio scelto, copiati e correggibili, più la quantità. In
 * andata e in ritorno come `indennita` di ogni lavoro di salvaRapportino; il server aggiunge `importo`.
 */
data class Indennita(
    /** Il servizio da cui viene; vuoto se scritta a mano. */
    val idServizio: String = "",
    val codice: String = "",
    val descrizione: String = "",
    /** Null = 1 (il campo lasciato vuoto). */
    val quantita: Double? = 1.0,
    val unita: String = "",
    /** Null senza il permesso dei soldi (il server non lo manda) o se non ancora scritto. */
    val prezzo: Double? = null,
    val aliquotaIva: Double = 22.0,
    val tipo: String = Servizi.SERVIZIO,
    val prezzoAcquisto: Double? = null,
    val aliquotaAcquisto: Double = 22.0,
    val fornitore: String = "",
    val tag: List<String> = emptyList(),
    val note: String = "",
    val immagine: FileRemoto? = null,
    /** L'importo come l'ha calcolato il server, se l'ha mandato. */
    val importoServer: Double? = null,
) {
    /** L'importo rifatto qui: lo stesso conto del server, anche prima che risponda. */
    val importo: Double get() = Servizi.importo(quantita, prezzo)

    /** "IND-TR · Indennità di trasferta", o la sola descrizione. */
    val titolo: String get() = listOf(codice, descrizione).filter { it.isNotBlank() }.joinToString(" · ")

    /** "2 Giorni × 30,00 € = 60,00 €"; senza i soldi "2 Giorni". */
    fun dettaglio(conPrezzi: Boolean): String {
        val quanto = (Numeri.scrivi(quantita ?: 1.0) + " " + unita).trim()
        return if (conPrezzi && prezzo != null) "$quanto × ${Numeri.euro(prezzo)} = ${Numeri.euro(importo)}" else quanto
    }

    /** Quello che parte con salvaRapportino (i nomi di servizi.md §2). */
    fun perServer(): JSONObject = JSONObject()
        .put("idServizio", idServizio.takeIf { it.isNotBlank() }?.let { PonteServer.idJson(it) } ?: JSONObject.NULL)
        .put("codice", codice.trim())
        .put("descrizione", descrizione.trim())
        .put("quantita", quantita ?: JSONObject.NULL)
        .put("unita", unita.trim())
        .put("prezzo", prezzo ?: JSONObject.NULL)
        .put("aliquotaIva", aliquotaIva)
        .put("tipo", tipo)
        .put("prezzoAcquisto", prezzoAcquisto ?: JSONObject.NULL)
        .put("aliquotaAcquisto", aliquotaAcquisto)
        .put("fornitore", fornitore.trim())
        .put("tag", JSONArray(tag))
        .put("note", note.trim())
        .put("immagine", immagine?.aJson() ?: JSONObject.NULL)

    /** Per le copie sul telefono e per i PDF: come sopra, più l'importo. */
    fun aJson(): JSONObject = perServer().put("importo", importoServer ?: importo)

    companion object {
        fun daJson(o: JSONObject) = Indennita(
            idServizio = o.primoTesto("idServizio", "id_servizio"),
            codice = o.testo("codice"),
            descrizione = o.testo("descrizione"),
            quantita = if (o.has("quantita")) o.numero("quantita") else 1.0,
            unita = o.testo("unita"),
            prezzo = o.numero("prezzo"),
            aliquotaIva = o.numero("aliquotaIva") ?: 22.0,
            tipo = if (o.testo("tipo").equals(Servizi.PRODOTTO, ignoreCase = true)) Servizi.PRODOTTO else Servizi.SERVIZIO,
            prezzoAcquisto = o.numero("prezzoAcquisto"),
            aliquotaAcquisto = o.numero("aliquotaAcquisto") ?: 22.0,
            fornitore = o.testo("fornitore"),
            tag = Servizi.tagDaJson(o),
            note = o.testo("note"),
            immagine = immagineDa(o),
            importoServer = o.numero("importo"),
        )

        /** L'elenco del JSON (vuoto se manca). */
        fun lista(a: JSONArray?): List<Indennita> = a.oggetti().map(::daJson)

        /** Un'indennità nuova dal servizio scelto: i suoi campi, quantità 1. */
        fun da(v: VoceListino, quantita: Double? = 1.0) = Indennita(
            idServizio = v.id, codice = v.codice, descrizione = v.nome, quantita = quantita, unita = v.unita,
            prezzo = v.prezzo, aliquotaIva = v.aliquotaIva, tipo = v.tipo, prezzoAcquisto = v.prezzoAcquisto,
            aliquotaAcquisto = v.aliquotaAcquisto, fornitore = v.fornitore, tag = v.tag, note = v.note, immagine = v.immagine,
        )

        /** L'immagine: {id, url}, o il solo id (un testo), o null. */
        internal fun immagineDa(o: JSONObject, campo: String = "immagine"): FileRemoto? {
            if (!o.has(campo) || o.isNull(campo)) return null
            o.optJSONObject(campo)?.let { f -> return FileRemoto.daJson(f).takeIf { it.id.isNotBlank() } }
            val id = o.optString(campo).trim()
            return if (id.isEmpty()) null else FileRemoto(id, "/file/$id")
        }
    }
}
