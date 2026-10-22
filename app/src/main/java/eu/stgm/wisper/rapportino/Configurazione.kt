package eu.stgm.wisper.rapportino

import android.content.Context
import android.os.Build
import eu.stgm.wisper.BuildConfig
import org.json.JSONObject
import java.util.UUID

/**
 * Quello che l'app deve sapere su questo telefono: dove sta il server, il token
 * di chi è entrato (e chi è, per aprirsi anche senza rete), come si presenta il
 * telefono, il tema.
 *
 * L'indirizzo del server nelle build di sviluppo c'è già (build.gradle.kts, da
 * wisper-keys o 10.0.2.2:8400 per l'emulatore) e si salva al primo avvio; nell'APK
 * pubblicato non c'è e si scrive nella schermata di accesso. Il token sta nelle
 * preferenze private dell'app, mai nei log.
 */
class Configurazione(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("wisper", Context.MODE_PRIVATE)

    /** L'indirizzo del server: "https://wisper.nas.example" o "http://10.0.2.2:8400". */
    var server: String
        get() = prefs.getString("server", null)?.takeIf { it.isNotBlank() } ?: BuildConfig.SERVER_URL
        set(v) = prefs.edit().putString("server", v.trim()).apply()

    /** Il token di chi è entrato su questo telefono; vuoto = si deve entrare. */
    var token: String
        get() = prefs.getString("token", "").orEmpty()
        set(v) = prefs.edit().putString("token", v.trim()).apply()

    /** L'email dell'ultimo accesso: resta scritta nella schermata di accesso. */
    var ultimaEmail: String
        get() = prefs.getString("ultimaEmail", "").orEmpty()
        set(v) = prefs.edit().putString("ultimaEmail", v.trim()).apply()

    /** Vero se si è usciti perché il server ha detto "accesso scaduto" (non con Esci). */
    var uscitoPerScadenza: Boolean
        get() = prefs.getBoolean("uscitoPerScadenza", false)
        set(v) = prefs.edit().putBoolean("uscitoPerScadenza", v).apply()

    /** La ragione sociale, per la schermata di accesso ("Studio Tecnico GM"). */
    var ragioneSociale: String
        get() = prefs.getString("ragioneSociale", "").orEmpty()
        set(v) = prefs.edit().putString("ragioneSociale", v).apply()

    /** Il nome del titolare, per "Chiedi a Manuel". */
    var titolare: String
        get() = prefs.getString("titolare", "").orEmpty()
        set(v) = prefs.edit().putString("titolare", v).apply()

    /** Chi è entrato e i suoi permessi, l'ultima volta che il server li ha detti. */
    fun sessioneSalvata(): Sessione {
        if (token.isBlank()) return Sessione.NESSUNA.copy(scaduta = uscitoPerScadenza)
        val u = runCatching { Utente.daJson(JSONObject(prefs.getString("utente", "{}").orEmpty())) }.getOrNull()
        val p = runCatching { Permessi.daJson(JSONObject(prefs.getString("permessi", "{}").orEmpty())) }.getOrNull()
        if (u == null || u.id.isBlank()) return Sessione.NESSUNA
        val i = runCatching { Interfaccia.daJson(JSONObject(prefs.getString("interfaccia", "{}").orEmpty())) }.getOrDefault(Interfaccia())
        return Sessione(u, p ?: Permessi(emptyMap()), interfaccia = i)
    }

    fun salvaSessione(s: Sessione) {
        prefs.edit()
            .putString("utente", s.utente.aJson().toString())
            .putString("permessi", s.permessi.aJson().toString())
            .putString("interfaccia", s.interfaccia.aJson().toString())
            .apply()
    }

    /** L'id dell'ultimo utente entrato qui (anche dopo Esci): se cambia persona, le copie sul telefono si rifanno. */
    val idUltimoUtente: String
        get() = runCatching { JSONObject(prefs.getString("utente", "{}").orEmpty()).optString("id") }.getOrDefault("")

    init {
        // Un APK di casa (build di prova, o -PconIndirizzo) porta l'indirizzo dentro:
        // si salva subito, perché l'aggiornamento dopo, preso da GitHub, non ce l'ha.
        if (prefs.getString("server", null).isNullOrBlank() && BuildConfig.SERVER_URL.isNotBlank()) server = BuildConfig.SERVER_URL
    }

    /**
     * Come si presenta questo telefono al server, che lo scrive nel registro degli
     * accessi. Nasce qui al primo avvio e non è mai uguale su due telefoni.
     */
    val dispositivo: String
        get() = prefs.getString("dispositivo", null)
            ?: UUID.randomUUID().toString().also { prefs.edit().putString("dispositivo", it).apply() }

    /** "motorola edge 60 pro": quello che si legge fra i dispositivi collegati. */
    val nomeDispositivo: String
        get() = if (Build.MODEL.startsWith(Build.MANUFACTURER, ignoreCase = true)) Build.MODEL
        else "${Build.MANUFACTURER} ${Build.MODEL}"

    /**
     * Chi compila su QUESTO telefono, se non si è entrati (la visita, la 0.4.0).
     * Dalla fase 1 il nome è quello dell'utente che è entrato.
     */
    var tecnico: String
        get() = prefs.getString("tecnico", "").orEmpty()
        set(v) = prefs.edit().putString("tecnico", v.trim()).apply()

    /** "auto" (segue il telefono), "chiaro" o "scuro". */
    var tema: String
        get() = prefs.getString("tema", "auto") ?: "auto"
        set(v) = prefs.edit().putString("tema", v).apply()

    /**
     * La visita guidata parte da sola una volta: al primo accesso, o al primo
     * avvio dopo un aggiornamento che la cambia (3 = il gestionale).
     */
    var visitaVista: Int
        get() = prefs.getInt("visitaVista", 0)
        set(v) = prefs.edit().putInt("visitaVista", v).apply()
}
