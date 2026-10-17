package eu.stgm.wisper.rapportino

import android.content.Context
import android.os.Build
import eu.stgm.wisper.BuildConfig
import java.util.UUID

/**
 * Le tre cose che l'app deve sapere: dove sta il foglio, il codice per
 * entrarci e chi sta compilando.
 *
 * Indirizzo e codice si scrivono nella schermata "Collega" e si cambiano dalle
 * impostazioni: se il codice va rifatto perche' e' finito in mani sbagliate, non
 * serve un'app nuova. Nell'APK pubblicato non ci sono (build.gradle.kts).
 */
class Configurazione(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("wisper", Context.MODE_PRIVATE)

    var url: String
        get() = prefs.getString("url", null)?.takeIf { it.isNotBlank() } ?: BuildConfig.SHEET_URL
        set(v) = prefs.edit().putString("url", v.trim()).apply()

    var codice: String
        get() = prefs.getString("codice", null)?.takeIf { it.isNotBlank() } ?: BuildConfig.SHEET_CODICE
        set(v) = prefs.edit().putString("codice", v.trim()).apply()

    init {
        // Un APK di casa (build di prova, o -PconIndirizzo) porta l'indirizzo dentro:
        // si salva subito, perche' l'aggiornamento dopo, preso da GitHub, non ce l'ha.
        if (prefs.getString("url", null).isNullOrBlank() && BuildConfig.SHEET_URL.isNotBlank()) url = BuildConfig.SHEET_URL
        if (prefs.getString("codice", null).isNullOrBlank() && BuildConfig.SHEET_CODICE.isNotBlank()) codice = BuildConfig.SHEET_CODICE
    }

    /**
     * Come si presenta questo telefono al foglio, che lo scrive nella scheda
     * Accessi a ogni richiesta. Nasce qui al primo avvio e non e' mai uguale su
     * due telefoni: un dispositivo che il foglio non conosce si vede subito.
     */
    val dispositivo: String
        get() = prefs.getString("dispositivo", null)
            ?: UUID.randomUUID().toString().also { prefs.edit().putString("dispositivo", it).apply() }

    /** "motorola edge 60 pro": quello che si legge nella scheda Accessi. */
    val nomeDispositivo: String
        get() = if (Build.MODEL.startsWith(Build.MANUFACTURER, ignoreCase = true)) Build.MODEL
        else "${Build.MANUFACTURER} ${Build.MODEL}"

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
