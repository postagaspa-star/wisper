package eu.stgm.wisper.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import eu.stgm.wisper.rapportino.Giornata
import eu.stgm.wisper.rapportino.Giornate
import eu.stgm.wisper.rapportino.Rapportino
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

/**
 * Il rapportino della giornata mentre lo si scrive (rapportino-lavori.md §5): la data, i lavori in ordine e, se ce n'e'
 * uno aperto, il suo modulo ([aperto], i 3 passi di un lavoro). Si salva tutto insieme con "Salva rapportino".
 *
 * [base] sono i lavori com'erano all'apertura: servono a sapere se e' cambiato qualcosa (e a non chiedere "Uscire senza
 * salvare?" per niente). Le foto fatte nei lavori aspettano in [fotoNuove] (per idLocale del lavoro) e partono dopo il
 * rapportino.
 */
class GiornataStato(
    giornata: Giornata,
    val nuova: Boolean,
) {
    val idLocale: String = giornata.idLocale
    var id by mutableStateOf(giornata.id)
    var data by mutableStateOf(giornata.data)
    val tecnico: String = giornata.tecnico
    val lavori = mutableStateListOf<Rapportino>().apply { addAll(giornata.lavori) }

    /** I lavori e la data com'erano all'apertura (o all'ultimo salvataggio). */
    var base by mutableStateOf(if (nuova) emptyList() else giornata.lavori)
    var dataBase by mutableStateOf(giornata.data)

    /** Le foto fatte nei lavori e non ancora in coda, per idLocale del lavoro. */
    val fotoNuove = mutableStateMapOf<String, List<File>>()

    /** Il lavoro aperto (i suoi 3 passi), o null se si vede il rapportino. */
    var aperto by mutableStateOf<ModuloStato?>(null)

    /** Il foglio "Rapportino salvato" dopo Salva rapportino. */
    var salvato by mutableStateOf(false)

    /** Vero se c'e' qualcosa da salvare. */
    val cambiata: Boolean
        get() = (nuova && lavori.isNotEmpty() && base.isEmpty()) || data != dataBase || fotoNuove.values.any { it.isNotEmpty() } ||
            lavori.size != base.size || lavori.zip(base).any { (a, b) -> a.idLocale != b.idLocale || a.soloCompilato() != b.soloCompilato() }

    /** Il rapportino com'e' adesso, da mettere in coda. */
    fun giornata(): Giornata = Giornata(idLocale, id, data, tecnico, lavori.toList())

    /** Un lavoro aggiunto o cambiato dal suo modulo: al suo posto, o in fondo se e' nuovo. */
    fun metti(lavoro: Rapportino, foto: List<File>) {
        val i = lavori.indexOfFirst { it.idLocale == lavoro.idLocale }
        if (i >= 0) lavori[i] = lavoro else lavori.add(lavoro)
        if (foto.isEmpty()) fotoNuove.remove(lavoro.idLocale) else fotoNuove[lavoro.idLocale] = foto
    }

    /** Toglie un lavoro (solo Da inviare: lo decide chi chiama). Le sue foto non ancora partite si buttano. */
    fun togli(idLocaleLavoro: String): List<File> {
        lavori.removeAll { it.idLocale == idLocaleLavoro }
        return fotoNuove.remove(idLocaleLavoro).orEmpty()
    }

    /** Dopo Salva rapportino: quello che c'e' adesso diventa la base. */
    fun salvataAdesso() {
        base = lavori.toList()
        dataBase = data
        fotoNuove.clear()
    }

    /** Un lavoro nuovo per questo rapportino, con la data del rapportino. */
    fun lavoroNuovo(): Rapportino = Rapportino.nuovo(tecnico, data).copy(idLocaleGiornata = idLocale, idGiornata = id)

    /** "3 lavori · per 2 clienti". */
    val riassunto: String get() = Giornate.lavoriEClienti(lavori)

    // ---- la copia su disco, se Android chiude l'app (la fotocamera, una telefonata)

    fun aJson(): JSONObject = JSONObject()
        .put("giornata", giornata().aJson())
        .put("nuova", nuova)
        .put("base", JSONArray().apply { base.forEach { put(it.aJson()) } })
        .put("dataBase", dataBase.toString())
        .put("fotoNuove", JSONObject().apply { fotoNuove.forEach { (k, v) -> put(k, JSONArray(v.map { it.path })) } })
        .put("aperto", aperto?.aJson() ?: JSONObject.NULL)

    companion object {
        fun daJson(o: JSONObject): GiornataStato {
            // Prima della 1.2 sul disco c'era il modulo di un rapportino solo: diventa un rapportino col suo lavoro aperto.
            if (!o.has("giornata")) {
                val m = ModuloStato.daJson(o)
                val g = Giornata(Giornata.nuovoIdLocale(), data = m.data, tecnico = m.base.tecnico)
                return GiornataStato(g, nuova = true).also { s ->
                    m.base = m.base.copy(idLocaleGiornata = s.idLocale)
                    s.aperto = m
                }
            }
            val g = Giornata.daJson(o.getJSONObject("giornata"))
            return GiornataStato(g, o.optBoolean("nuova")).also { s ->
                val base = o.optJSONArray("base")
                s.base = (0 until (base?.length() ?: 0)).mapNotNull { base!!.optJSONObject(it)?.let { j -> Rapportino.daJson(j) } }
                s.dataBase = runCatching { LocalDate.parse(o.optString("dataBase")) }.getOrDefault(g.data)
                o.optJSONObject("fotoNuove")?.let { f ->
                    f.keys().forEach { k ->
                        val a = f.optJSONArray(k) ?: return@forEach
                        val file = (0 until a.length()).map { File(a.getString(it)) }.filter { it.exists() }
                        if (file.isNotEmpty()) s.fotoNuove[k] = file
                    }
                }
                o.optJSONObject("aperto")?.let { s.aperto = ModuloStato.daJson(it) }
            }
        }
    }
}
