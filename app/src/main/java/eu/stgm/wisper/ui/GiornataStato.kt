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
 * Il rapportino della giornata mentre lo si scrive (rapportino-lavori.md §5): la data, i lavori in ordine e il modulo
 * del lavoro scelto ([aperto]). Si salva tutto insieme con "Salva rapportino".
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

    /** Il lavoro scelto nella fila, coi suoi campi sotto (dal 11/11/2026 la pagina e' una sola, niente piu' 3 passi). */
    var aperto by mutableStateOf<ModuloStato?>(null)

    /** Il foglio "Rapportino salvato" dopo Salva rapportino. */
    var salvato by mutableStateOf(false)

    /**
     * Vero se c'e' qualcosa da salvare. Un lavoro appena aggiunto e non ancora toccato ([vuoto]) non conta: uscendo non
     * si chiede niente e Salva rapportino lo lascia fuori.
     */
    val cambiata: Boolean
        get() {
            val veri = lavori.filterNot(::vuoto)
            return (nuova && veri.isNotEmpty() && base.isEmpty()) || data != dataBase || fotoNuove.values.any { it.isNotEmpty() } ||
                veri.size != base.size || veri.zip(base).any { (a, b) -> a.idLocale != b.idLocale || a.soloCompilato() != b.soloCompilato() }
        }

    /** Un lavoro aggiunto qui e lasciato com'era: niente cliente, ore, km, lavoro, spese, note, scontrini. */
    fun vuoto(l: Rapportino): Boolean = base.none { it.idLocale == l.idLocale } && fotoNuove[l.idLocale].isNullOrEmpty() &&
        l.cliente.isBlank() && l.descrizione.isBlank() && l.oreLavoro + l.oreExtra + l.oreViaggio == 0.0 && l.km == 0.0 &&
        l.spese == 0.0 && l.noteSpese.isBlank() && l.luogo.isBlank() && l.noteInterne.isBlank() && l.idTicket.isBlank() && l.foto.isEmpty()

    // ---- la pagina unica (11/11/2026): i lavori in una fila, quello scelto ([aperto]) coi suoi campi sotto

    /** Il modulo di ogni lavoro toccato in questa pagina: tornando a un lavoro si ritrova com'era (anche la scelta a meta'). */
    private val moduli = mutableMapOf<String, ModuloStato>()

    fun moduloDi(l: Rapportino): ModuloStato = moduli.getOrPut(l.idLocale) {
        aperto?.takeIf { it.base.idLocale == l.idLocale } ?: run {
            val nuovo = base.none { it.idLocale == l.idLocale }
            // Un lavoro nuovo ritrovato (dalla copia su disco) che ha gia' la sua tariffa non se la vede riproporre.
            ModuloStato(l, nuovo, tariffaToccata = !nuovo || (l.tariffa ?: 0.0) > 0).also { m -> fotoNuove[l.idLocale]?.let { m.fotoNuove.addAll(it) } }
        }
    }

    /** Vero se il lavoro, controllato a Salva rapportino, ha qualcosa che manca (la sua scheda nella fila ha il bordo rosso). */
    fun erroriDi(idLocale: String): Boolean = moduli[idLocale]?.errori?.isNotEmpty() == true

    /** Il lavoro da controllare a Salva rapportino: nuovo o cambiato qui (quelli che non si sono toccati il server li ha gia'). */
    fun daControllare(l: Rapportino): Boolean = base.none { it.idLocale == l.idLocale } || moduli[l.idLocale]?.cambiato == true

    /** Sceglie il lavoro da mostrare sotto la fila. */
    fun scegli(l: Rapportino) {
        aperto = moduloDi(l)
    }

    /** "Aggiungi un lavoro": in fondo alla fila, scelto, con la scelta del cliente aperta. */
    fun aggiungiLavoro(): ModuloStato {
        val r = lavoroNuovo()
        val m = ModuloStato(r, nuovo = true)
        moduli[r.idLocale] = m
        lavori.add(r)
        aperto = m
        return m
    }

    /**
     * All'apertura della pagina: il lavoro gia' aperto (dalla Casa, da una commessa, dalla copia su disco) entra nella
     * fila; se no si sceglie il primo; un rapportino senza lavori ne ha subito uno nuovo (solo per chi scrive).
     */
    fun preparaPagina(scrive: Boolean) {
        val a = aperto
        if (a != null) {
            moduli[a.base.idLocale] = a
            if (lavori.none { it.idLocale == a.base.idLocale }) {
                if (scrive && !a.base.bloccato) lavori.add(a.rapportino().copy(data = data, idLocaleGiornata = idLocale, idGiornata = id))
                else aperto = null
            }
            if (aperto != null) return
        }
        val primo = lavori.firstOrNull { !it.bloccato } ?: lavori.firstOrNull()
        when {
            primo != null -> scegli(primo)
            scrive -> aggiungiLavoro()
        }
    }

    /** Quello che si scrive nel modulo va subito nel lavoro della fila (e nella copia su disco). */
    fun sincronizza(m: ModuloStato) {
        if (lavori.none { it.idLocale == m.base.idLocale }) return
        val r = if (m.cambiato) m.rapportino().copy(data = data, idLocaleGiornata = idLocale, idGiornata = id) else m.base
        metti(r, m.fotoNuove.toList())
    }

    /** Toglie dalla fila i lavori lasciati vuoti (Salva rapportino, se ce n'e' almeno uno scritto). */
    fun togliVuoti() {
        lavori.filter(::vuoto).forEach { togli(it.idLocale) }
        if (aperto?.let { a -> lavori.none { it.idLocale == a.base.idLocale } } == true) aperto = null
    }

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
        moduli.remove(idLocaleLavoro)
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
    val riassunto: String get() = if (Giornate.quantiClienti(lavori) == 0) Giornate.lavori(lavori.size) else Giornate.lavoriEClienti(lavori)

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
