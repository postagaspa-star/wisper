package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * Un rapportino: una giornata di lavoro per un cliente.
 *
 * La prima parte sono i campi che si compilano. La seconda e' quello che sa
 * solo il foglio: il numero RAP/2026/0001, i conti fatti dallo script, la firma
 * e lo stato. Sul telefono quei campi arrivano quando il foglio ha risposto;
 * fino ad allora i conti si mostrano con [Calcolo], che fa la stessa formula.
 *
 * [idLocale] nasce sul telefono e non cambia mai: e' quello che permette al
 * foglio di riconoscere un rapportino gia' scritto, sia quando un invio si
 * ripete perche' la risposta si era persa, sia quando lo si riapre per
 * correggerlo.
 */
data class Rapportino(
    val idLocale: String,
    val data: LocalDate,
    val tecnico: String = "",
    val idCliente: String = "",
    val cliente: String = "",
    val idCommessa: String = "",
    val commessa: String = "",
    /**
     * Per una commessa nuova, nata qui: il codice che avra' (26ST047), deciso sul
     * telefono anche senza rete. Il foglio lo usa se e' ancora libero, altrimenti
     * le da' il primo libero e lo rimanda in idCommessa.
     */
    val codiceProposto: String = "",
    val ticket: String = "",
    val luogo: String = "",
    val descrizione: String = "",
    val oreLavoro: Double = 0.0,
    val oreExtra: Double = 0.0,
    val oreViaggio: Double = 0.0,
    val km: Double = 0.0,
    val spese: Double = 0.0,
    val noteSpese: String = "",
    /** La tariffa scritta nel rapportino. Null per i gruppi a tariffa fissa: la decide il foglio. */
    val tariffa: Double? = null,
    /** Note per se'. Non finiscono mai sul PDF del cliente. */
    val noteInterne: String = "",

    // ---- dal foglio ----
    val id: String = "",
    val gruppo: String = "",
    val foto: List<FileRemoto> = emptyList(),
    val firma: FileRemoto? = null,
    val firmatario: String = "",
    val firmatoIl: String = "",
    val stato: Stato = Stato.BOZZA,
    /** I conti dello script. Null finche' il foglio non ha risposto. */
    val conto: Conto? = null,
    val modificato: String = "",
) {
    /** Firmato, inviato o fatturato: il lavoro non si tocca piu', si riporta in bozza. */
    val bloccato: Boolean get() = stato in Stato.BLOCCATI

    val oreTotali: Double get() = oreLavoro + oreExtra + oreViaggio

    /** I campi che si compilano, senza quello che aggiunge il foglio: per capire se e' cambiato qualcosa. */
    fun soloCompilato(): Rapportino = Rapportino(
        idLocale = idLocale, data = data, tecnico = tecnico, idCliente = idCliente,
        cliente = cliente, idCommessa = idCommessa, commessa = commessa, codiceProposto = codiceProposto, ticket = ticket,
        luogo = luogo, descrizione = descrizione, oreLavoro = oreLavoro, oreExtra = oreExtra,
        oreViaggio = oreViaggio, km = km, spese = spese, noteSpese = noteSpese,
        tariffa = tariffa, noteInterne = noteInterne,
    )

    /** Quello che si manda allo script con "salvaRapportino". */
    fun perIlFoglio(): JSONObject = JSONObject()
        .put("idLocale", idLocale)
        .put("id", id)
        .put("data", data.format(ISO))
        .put("tecnico", tecnico)
        .put("idCliente", idCliente)
        .put("cliente", cliente)
        .put("idCommessa", idCommessa)
        .put("commessa", commessa)
        .put("codiceProposto", codiceProposto)
        .put("ticket", ticket)
        .put("luogo", luogo)
        .put("descrizione", descrizione)
        .put("oreLavoro", oreLavoro)
        .put("oreExtra", oreExtra)
        .put("oreViaggio", oreViaggio)
        .put("km", km)
        .put("spese", spese)
        .put("noteSpese", noteSpese)
        .put("tariffa", tariffa ?: JSONObject.NULL)
        .put("noteInterne", noteInterne)

    /** Tutto, per le copie sul telefono (coda e ultimo elenco letto). */
    fun aJson(): JSONObject = perIlFoglio()
        .put("foto", JSONArray().apply { foto.forEach { put(it.aJson()) } })
        .put("firma", firma?.aJson() ?: JSONObject.NULL)
        .put("firmatario", firmatario)
        .put("firmatoIl", firmatoIl)
        .put("stato", stato.name)
        .put("modificato", modificato)
        .apply {
            conto?.let {
                put("oreTotali", it.oreTotali)
                put("compensoOre", it.compensoOre)
                put("rimborsoKm", it.rimborsoKm)
                put("totale", it.totale)
                put("tariffaApplicata", it.tariffa)
                put("euroKm", it.euroKm)
                put("pagaViaggio", it.pagaViaggio)
                put("kmRimborsati", it.kmRimborsati)
                put("maggExtra", it.maggExtra)
            }
        }

    companion object {
        val ISO: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

        fun nuovo(tecnico: String, oggi: LocalDate = LocalDate.now()) = Rapportino(
            idLocale = nuovoIdLocale(),
            data = oggi,
            tecnico = tecnico,
        )

        fun nuovoIdLocale(): String = "W-" + UUID.randomUUID().toString().replace("-", "").take(16)

        /**
         * Da JSON: sia la risposta dello script sia le copie sul telefono.
         *
         * Lo script manda i conti con i loro nomi (tariffa = quella applicata);
         * le copie locali li hanno sotto "tariffaApplicata", perche' "tariffa"
         * li' e' quella scritta a mano. Si capisce dalla presenza di "totale".
         */
        fun daJson(o: JSONObject, dalFoglio: Boolean = false): Rapportino {
            val haConto = o.has("totale") && !o.isNull("totale")
            val tariffaApplicata = when {
                dalFoglio -> o.numero("tariffa")
                else -> o.numero("tariffaApplicata")
            }
            val conto = if (haConto) Conto(
                oreTotali = o.numero("oreTotali") ?: 0.0,
                tariffa = tariffaApplicata ?: 0.0,
                compensoOre = o.numero("compensoOre") ?: 0.0,
                rimborsoKm = o.numero("rimborsoKm") ?: 0.0,
                totale = o.numero("totale") ?: 0.0,
                euroKm = o.numero("euroKm") ?: 0.0,
                pagaViaggio = o.optBoolean("pagaViaggio", false),
                kmRimborsati = o.optBoolean("kmRimborsati", true),
                maggExtra = o.numero("maggExtra") ?: 0.0,
            ) else null
            val id = o.testo("id")
            return Rapportino(
                // I rapportini del primo Wisper non hanno idLocale: li si
                // riconosce dal numero, e alla prima modifica ne prendono uno.
                idLocale = o.testo("idLocale").ifBlank { if (id.isNotBlank()) "R-$id" else nuovoIdLocale() },
                data = runCatching { LocalDate.parse(o.testo("data"), ISO) }.getOrDefault(LocalDate.now()),
                tecnico = o.testo("tecnico"),
                idCliente = o.testo("idCliente"),
                cliente = o.testo("cliente"),
                idCommessa = o.testo("idCommessa"),
                commessa = o.testo("commessa"),
                codiceProposto = o.testo("codiceProposto"),
                ticket = o.testo("ticket"),
                luogo = o.testo("luogo"),
                descrizione = o.testo("descrizione"),
                oreLavoro = o.numero("oreLavoro") ?: 0.0,
                oreExtra = o.numero("oreExtra") ?: 0.0,
                oreViaggio = o.numero("oreViaggio") ?: 0.0,
                km = o.numero("km") ?: 0.0,
                spese = o.numero("spese") ?: 0.0,
                noteSpese = o.testo("noteSpese"),
                // Dal foglio la tariffa e' sempre quella applicata: riaprendo un
                // rapportino privato la si ritrova scritta nel campo.
                tariffa = if (dalFoglio) tariffaApplicata?.takeIf { it > 0 } else o.numero("tariffa"),
                noteInterne = o.testo("noteInterne"),
                id = id,
                gruppo = o.testo("gruppo"),
                foto = o.optJSONArray("foto").oggetti().map(FileRemoto::daJson).filter { it.id.isNotBlank() },
                firma = o.optJSONObject("firma")?.let(FileRemoto::daJson)?.takeIf { it.id.isNotBlank() },
                firmatario = o.testo("firmatario"),
                firmatoIl = o.testo("firmatoIl"),
                stato = Stato.da(o.testo("stato")),
                conto = conto,
                modificato = o.testo("modificato"),
            )
        }
    }
}

/** I conti di un rapportino, come li ha fatti il foglio o [Calcolo] sul telefono. */
data class Conto(
    val oreTotali: Double,
    val tariffa: Double,
    val compensoOre: Double,
    val rimborsoKm: Double,
    val totale: Double,
    val euroKm: Double = 0.0,
    val pagaViaggio: Boolean = false,
    val kmRimborsati: Boolean = true,
    val maggExtra: Double = 0.0,
)

/** Un file su Drive: la foto di uno scontrino o una firma. */
data class FileRemoto(val id: String, val url: String) {
    fun aJson(): JSONObject = JSONObject().put("id", id).put("url", url)

    companion object {
        fun daJson(o: JSONObject) = FileRemoto(o.testo("id"), o.testo("url"))
    }
}

enum class Stato(val etichetta: String) {
    BOZZA("Bozza"),
    FIRMATO("Firmato"),
    INVIATO("Inviato"),
    FATTURATO("Fatturato"),
    ANNULLATO("Annullato");

    companion object {
        val BLOCCATI = setOf(FIRMATO, INVIATO, FATTURATO)

        fun da(testo: String?): Stato =
            entries.firstOrNull { it.name.equals(testo?.trim(), ignoreCase = true) } ?: BOZZA
    }
}

// ---- piccoli aiuti per org.json, che con i null e' scomodo ----

internal fun JSONObject.testo(campo: String): String =
    if (!has(campo) || isNull(campo)) "" else optString(campo).trim()

internal fun JSONObject.numero(campo: String): Double? {
    if (!has(campo) || isNull(campo)) return null
    val v = opt(campo)
    return when (v) {
        is Number -> v.toDouble()
        is String -> Numeri.leggi(v)
        else -> null
    }?.takeIf { !it.isNaN() }
}

internal fun JSONObject.booleanoONull(campo: String): Boolean? =
    if (!has(campo) || isNull(campo)) null else optBoolean(campo)

internal fun JSONArray?.oggetti(): List<JSONObject> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { optJSONObject(it) }
}
