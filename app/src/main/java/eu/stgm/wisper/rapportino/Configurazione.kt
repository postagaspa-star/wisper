package eu.stgm.wisper.rapportino

import android.content.Context
import eu.stgm.wisper.BuildConfig

/**
 * Le tre cose che l'app deve sapere: dove sta il foglio, il codice per
 * entrarci e chi sta compilando.
 *
 * Indirizzo e codice partono da quelli messi in fase di compilazione (le chiavi
 * fuori dal repo), ma si cambiano dalle impostazioni: se il codice va rifatto
 * perche' e' finito in mani sbagliate, non serve un'app nuova.
 */
class Configurazione(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("wisper", Context.MODE_PRIVATE)

    var url: String
        get() = prefs.getString("url", null)?.takeIf { it.isNotBlank() } ?: BuildConfig.SHEET_URL
        set(v) = prefs.edit().putString("url", v.trim()).apply()

    var codice: String
        get() = prefs.getString("codice", null)?.takeIf { it.isNotBlank() } ?: BuildConfig.SHEET_CODICE
        set(v) = prefs.edit().putString("codice", v.trim()).apply()

    /**
     * Chi compila su QUESTO telefono. Vuoto = quello scritto nelle impostazioni
     * del foglio. Se un giorno i telefoni sono due, ognuno ha il suo nome e i
     * rapportini escono gia' firmati dalla persona giusta.
     */
    var tecnico: String
        get() = prefs.getString("tecnico", "").orEmpty()
        set(v) = prefs.edit().putString("tecnico", v.trim()).apply()

    /** "auto" (segue il telefono), "chiaro" o "scuro". */
    var tema: String
        get() = prefs.getString("tema", "auto") ?: "auto"
        set(v) = prefs.edit().putString("tema", v).apply()

    /**
     * La visita guidata parte da sola una volta: al primo collegamento, o al
     * primo avvio dopo l'aggiornamento al nuovo aspetto (versione 2).
     */
    var visitaVista: Int
        get() = prefs.getInt("visitaVista", 0)
        set(v) = prefs.edit().putInt("visitaVista", v).apply()
}
