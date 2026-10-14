package eu.stgm.wisper.rapportino

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * I rapportini gia' confermati con "salva" che non sono ancora arrivati sul
 * foglio, tenuti in un file sul telefono.
 *
 * PERCHE' ESISTE, misurato il 26/09. Fra "salva" e la riga sul foglio sono
 * passati diciotto secondi e mezzo, tutti dell'Apps Script, e in quel tempo il
 * rapportino esisteva solo in memoria: bastava che Android chiudesse l'app, o
 * che in cantiere sparisse il segnale, e la giornata di lavoro era persa senza
 * che nessuno se ne accorgesse.
 *
 * Adesso l'ordine e' rovesciato: prima il telefono, poi il foglio. Un
 * rapportino esce da qui solo quando il foglio ha risposto con il suo id, e
 * fino ad allora sopravvive a tutto — schermo spento, rete assente, app chiusa,
 * telefono riavviato.
 */
class CodaInvii(private val file: File) {

    constructor(ctx: Context) : this(File(ctx.filesDir, "coda-invii.json"))

    /**
     * @param idLocale nasce sul telefono ed e' unico. Resta lo stesso a ogni
     *        tentativo, cosi' il foglio puo' riconoscere un rapportino che ha
     *        gia' scritto e non duplicarlo.
     * @param data il giorno in cui il rapportino e' stato DETTO, non quello in
     *        cui parte. Senza, lo script mette la data di arrivo: un rapportino
     *        di lunedi' partito martedi' risulterebbe di martedi'.
     * @param tentativi quante volte il foglio non ha risposto.
     */
    data class Voce(
        val idLocale: String,
        val data: String,
        val rapportino: Rapportino,
        val tentativi: Int = 0,
    )

    private val lucchetto = Any()

    /** Mette in coda e restituisce la voce creata. Lancia se il file non si scrive. */
    fun aggiungi(r: Rapportino, ora: Date = Date()): Voce = synchronized(lucchetto) {
        val voce = Voce(
            idLocale = "W-" + SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ITALY).format(ora) +
                "-" + UUID.randomUUID().toString().take(6),
            data = SimpleDateFormat("dd/MM/yyyy", Locale.ITALY).format(ora),
            rapportino = r,
        )
        scrivi(leggi() + voce)
        voce
    }

    /** In ordine di arrivo: si mandano nell'ordine in cui sono stati detti. */
    fun tutte(): List<Voce> = synchronized(lucchetto) { leggi() }

    /** Sostituisce la voce con lo stesso idLocale, se c'e' ancora. */
    fun aggiorna(v: Voce) = synchronized(lucchetto) {
        scrivi(leggi().map { if (it.idLocale == v.idLocale) v else it })
    }

    fun togli(idLocale: String) = synchronized(lucchetto) {
        scrivi(leggi().filterNot { it.idLocale == idLocale })
    }

    // ---- file ----

    private fun leggi(): List<Voce> {
        if (!file.exists()) return emptyList()
        return try {
            val a = JSONArray(file.readText())
            (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let(::daJson) }
        } catch (_: Exception) {
            // Un file illeggibile non si sovrascrive: dentro possono esserci
            // rapportini veri. Si mette da parte, a mano si recuperano ancora.
            file.renameTo(File(file.parentFile, file.name + ".illeggibile-" + System.currentTimeMillis()))
            emptyList()
        }
    }

    /**
     * Scrittura atomica: prima un file a parte, poi lo scambio. Se Android
     * uccide l'app a meta' scrittura resta il file vecchio intero, non uno
     * troncato che al prossimo avvio non si legge piu'.
     */
    private fun scrivi(voci: List<Voce>) {
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(JSONArray().apply { voci.forEach { put(aJson(it)) } }.toString())
        if (!tmp.renameTo(file)) throw IOException("non riesco a scrivere ${file.name}")
    }

    private fun aJson(v: Voce): JSONObject {
        val r = v.rapportino
        return JSONObject()
            .put("idLocale", v.idLocale)
            .put("data", v.data)
            .put("tentativi", v.tentativi)
            .put(
                "rapportino",
                JSONObject().apply {
                    r.cliente?.let { put("cliente", it) }
                    r.commessa?.let { put("commessa", it) }
                    r.descrizione?.let { put("descrizione", it) }
                    r.ore?.let { put("ore", it) }
                    r.km?.let { put("km", it) }
                    r.spese?.let { put("spese", it) }
                    r.statoCommessa?.let { put("statoCommessa", it.name) }
                },
            )
    }

    private fun daJson(o: JSONObject): Voce? {
        val id = o.optString("idLocale").takeIf { it.isNotBlank() } ?: return null
        val r = o.optJSONObject("rapportino") ?: JSONObject()
        return Voce(
            idLocale = id,
            data = o.optString("data"),
            tentativi = o.optInt("tentativi"),
            rapportino = Rapportino(
                cliente = r.testo("cliente"),
                commessa = r.testo("commessa"),
                descrizione = r.testo("descrizione"),
                ore = r.numero("ore"),
                km = r.numero("km"),
                spese = r.numero("spese"),
                statoCommessa = r.testo("statoCommessa")
                    ?.let { s -> StatoCommessa.entries.firstOrNull { it.name == s } },
            ),
        )
    }

    private fun JSONObject.testo(campo: String): String? =
        if (isNull(campo)) null else optString(campo).takeIf { it.isNotBlank() }

    private fun JSONObject.numero(campo: String): Double? =
        if (!has(campo) || isNull(campo)) null else optDouble(campo).takeIf { !it.isNaN() }
}
