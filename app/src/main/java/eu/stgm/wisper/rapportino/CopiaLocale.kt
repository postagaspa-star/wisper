package eu.stgm.wisper.rapportino

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * L'ultima versione letta dal foglio, tenuta sul telefono: clienti, commesse,
 * tariffe e i rapportini degli ultimi mesi.
 *
 * PERCHE' ESISTE, trovato col cronometro in mano il 09/08: il foglio chiamato da
 * freddo ci mette da sette a tredici secondi a rispondere. Aprire l'app e
 * aspettare tredici secondi per vedere i propri rapportini, o non vederli
 * affatto in un capannone senza campo, non e' accettabile. Cosi' si apre con i
 * dati dell'ultima volta e il foglio si rilegge dopo, con calma.
 *
 * Il rischio e' lavorare su dati vecchi di qualche ora, ed e' piccolo: clienti
 * e commesse cambiano qualche volta al mese.
 */
class CopiaLocale(cartella: File) {

    constructor(ctx: Context) : this(ctx.filesDir)

    private val fileAnagrafiche = File(cartella, "anagrafiche.json")
    private val fileRapportini = File(cartella, "rapportini.json")

    fun anagrafiche(): Anagrafiche = try {
        if (!fileAnagrafiche.exists()) Anagrafiche() else Anagrafiche.daJson(JSONObject(fileAnagrafiche.readText()))
    } catch (_: Exception) {
        Anagrafiche()
    }

    /**
     * Salva, ma solo se c'e' qualcosa da salvare: sovrascrivere un elenco buono
     * con uno vuoto, perche' il foglio non ha risposto, e' il modo piu' rapido
     * per perdere l'unica copia che avevamo.
     */
    fun scriviAnagrafiche(a: Anagrafiche) {
        if (a.clienti.isEmpty() && a.commesse.isEmpty() && a.gruppi.isEmpty()) return
        scriviAtomico(fileAnagrafiche, a.aJson().toString())
    }

    fun rapportini(): List<Rapportino> = try {
        if (!fileRapportini.exists()) emptyList()
        else JSONArray(fileRapportini.readText()).oggetti().map { Rapportino.daJson(it) }
    } catch (_: Exception) {
        emptyList()
    }

    fun scriviRapportini(lista: List<Rapportino>) {
        scriviAtomico(fileRapportini, JSONArray().apply { lista.forEach { put(it.aJson()) } }.toString())
    }

    private fun scriviAtomico(f: File, testo: String) {
        try {
            val tmp = File(f.parentFile, f.name + ".tmp")
            tmp.writeText(testo)
            if (!tmp.renameTo(f)) {
                f.delete()
                tmp.renameTo(f)
            }
        } catch (_: Exception) {
            // E' una comodita', non un pezzo da cui dipende il funzionamento:
            // se non si scrive si va avanti, e al prossimo giro si riprova.
        }
    }
}
