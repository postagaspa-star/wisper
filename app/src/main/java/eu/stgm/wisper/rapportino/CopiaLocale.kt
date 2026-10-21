package eu.stgm.wisper.rapportino

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * L'ultima versione letta dal foglio, tenuta sul telefono: clienti, commesse,
 * tariffe, i rapportini degli ultimi mesi, tutti i rapportini (lo storico
 * dell'ufficio) e le immagini gia' scaricate per i PDF.
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
    private val fileStorico = File(cartella, "storico.json")

    /** Le immagini dei PDF (firme, scontrini, la firma del compilatore) gia' scaricate: si chiedono una volta sola. */
    private val cartellaFile = File(cartella, "file-foglio")

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

    /**
     * Tutti i rapportini del foglio, l'ultima volta che li si e' letti tutti (lo
     * storico dell'ufficio). Vuoto finche' non li si e' letti una volta.
     */
    fun storico(): List<Rapportino> = try {
        if (!fileStorico.exists()) emptyList()
        else JSONArray(fileStorico.readText()).oggetti().map { Rapportino.daJson(it) }
    } catch (_: Exception) {
        emptyList()
    }

    /** Qui un elenco vuoto si scrive: e' la risposta di un foglio senza rapportini, non un errore. */
    fun scriviStorico(lista: List<Rapportino>) {
        scriviAtomico(fileStorico, JSONArray().apply { lista.forEach { put(it.aJson()) } }.toString())
    }

    /** Un file del foglio gia' scaricato: i byte e il tipo, o null. */
    fun fileDelFoglio(id: String): Pair<ByteArray, String>? {
        if (!idValido(id)) return null
        val f = cartellaFile.listFiles()?.firstOrNull { it.name.startsWith("$id.") } ?: return null
        return try {
            f.readBytes() to mimeDa(f.extension)
        } catch (_: Exception) {
            null
        }
    }

    fun scriviFileDelFoglio(id: String, dati: ByteArray, mime: String) {
        if (!idValido(id) || dati.isEmpty()) return
        try {
            cartellaFile.mkdirs()
            val f = File(cartellaFile, "$id.${estensioneDi(mime)}")
            val tmp = File(cartellaFile, "$id.tmp")
            tmp.writeBytes(dati)
            if (!tmp.renameTo(f)) {
                f.delete()
                tmp.renameTo(f)
            }
        } catch (_: Exception) {
            // Come per il resto: se non si scrive, la prossima volta lo si scarica di nuovo.
        }
    }

    /** Gli id di Drive sono lettere, cifre, - e _: niente che possa uscire dalla cartella. */
    private fun idValido(id: String) = id.isNotBlank() && id.all { it.isLetterOrDigit() || it == '-' || it == '_' }

    private fun estensioneDi(mime: String) = when (mime.lowercase()) {
        "image/png" -> "png"
        "image/jpeg", "image/jpg" -> "jpg"
        "image/webp" -> "webp"
        "application/pdf" -> "pdf"
        else -> "bin"
    }

    private fun mimeDa(estensione: String) = when (estensione.lowercase()) {
        "png" -> "image/png"
        "jpg" -> "image/jpeg"
        "webp" -> "image/webp"
        "pdf" -> "application/pdf"
        else -> "application/octet-stream"
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
