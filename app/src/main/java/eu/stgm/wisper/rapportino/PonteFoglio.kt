package eu.stgm.wisper.rapportino

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/**
 * Il collegamento col foglio Google, attraverso lo script pubblicato come app
 * web (apps-script/Code.gs).
 *
 * Perche' non le API di Google Fogli: richiederebbero credenziali dentro l'app
 * e un giro di autorizzazioni. Lo script invece e' un indirizzo solo, protetto
 * da un codice, e i conti si fanno li'.
 *
 * ATTENZIONE AL REINDIRIZZAMENTO. Apps Script risponde con un rimbalzo verso un
 * secondo indirizzo, e la risposta vera arriva da li'. Il comportamento
 * predefinito di OkHttp e' quello giusto e non va toccato: forzare il metodo a
 * restare POST rompe tutto con un errore 411. Verificato il 07/08.
 *
 * Due tipi di errore, e la differenza conta per la coda:
 *  - [RifiutatoDalFoglio]: lo script ha risposto e ha detto di no ("codice
 *    sbagliato", "rapportino gia' firmato"). Riprovare uguale non serve.
 *  - qualunque altra eccezione: la rete o Google. Si riprova.
 */
class PonteFoglio(
    private val url: () -> String,
    private val codice: () -> String,
    /** Chi chiama (disp, dispNome, app): lo script lo scrive nel registro degli accessi. */
    private val chiSono: () -> Map<String, String> = { emptyMap() },
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) {

    val configurato: Boolean get() = url().isNotBlank() && codice().isNotBlank()

    class RifiutatoDalFoglio(messaggio: String) : Exception(messaggio)

    suspend fun anagrafiche(): Anagrafiche = withContext(Dispatchers.IO) {
        Anagrafiche.daJson(leggi("anagrafiche"))
    }

    /** I rapportini fra due date comprese, i piu' recenti prima. */
    suspend fun rapportini(da: LocalDate, a: LocalDate): List<Rapportino> = withContext(Dispatchers.IO) {
        leggi("rapportini", "da" to da.format(Rapportino.ISO), "a" to a.format(Rapportino.ISO))
            .optJSONArray("rapportini").oggetti()
            .map { Rapportino.daJson(it, dalFoglio = true) }
    }

    /** Crea o aggiorna la riga. Torna il rapportino come l'ha scritto il foglio, conti compresi. */
    suspend fun salva(r: Rapportino): Rapportino = withContext(Dispatchers.IO) {
        val risposta = scrivi(JSONObject().put("azione", "salvaRapportino").put("rapportino", r.perIlFoglio()))
        Rapportino.daJson(
            risposta.optJSONObject("rapportino") ?: throw RifiutatoDalFoglio("il foglio non ha restituito il rapportino"),
            dalFoglio = true,
        )
    }

    /**
     * Carica una foto di spesa o una firma. [idFile] e' lo stesso a ogni
     * tentativo: se il file e' gia' arrivato, lo script non ne crea un secondo.
     */
    suspend fun caricaFile(
        tipo: String,
        idLocale: String,
        id: String,
        idFile: String,
        file: File,
        mime: String,
        firmatario: String = "",
        firmatoIl: String = "",
    ): FileRemoto = withContext(Dispatchers.IO) {
        val corpo = JSONObject()
            .put("azione", "caricaFile")
            .put("tipo", tipo)
            .put("idLocale", idLocale)
            .put("id", id)
            .put("idFile", idFile)
            .put("mime", mime)
            .put("base64", Base64.encodeToString(file.readBytes(), Base64.NO_WRAP))
            .put("firmatario", firmatario)
            .put("firmatoIl", firmatoIl)
        val f = scrivi(corpo).optJSONObject("file") ?: throw RifiutatoDalFoglio("il foglio non ha salvato il file")
        FileRemoto.daJson(f)
    }

    /** @param chiave il numero RAP/... se il foglio l'ha gia' dato, altrimenti l'idLocale. */
    suspend fun togliFile(chiave: String, fileId: String): Rapportino = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", "togliFile").put("id", chiave).put("fileId", fileId))
        Rapportino.daJson(r.getJSONObject("rapportino"), dalFoglio = true)
    }

    /**
     * BOZZA (riporta in bozza: la firma cade), INVIATO, FATTURATO, ANNULLATO.
     * @param chiave il numero RAP/... se il foglio l'ha gia' dato, altrimenti l'idLocale.
     */
    suspend fun stato(chiave: String, stato: Stato): Rapportino = withContext(Dispatchers.IO) {
        val r = scrivi(
            JSONObject().put("azione", "stato").put("ids", JSONArray().put(chiave)).put("stato", stato.name)
        )
        Rapportino.daJson(r.getJSONArray("rapportini").getJSONObject(0), dalFoglio = true)
    }

    // --- interno ---

    private fun leggi(azione: String, vararg parametri: Pair<String, String>): JSONObject {
        controllaConfigurazione()
        val indirizzo = url().toHttpUrlOrNull()?.newBuilder()
            ?.addQueryParameter("codice", codice())
            ?.addQueryParameter("azione", azione)
            ?.apply { chiSono().forEach { (k, v) -> addQueryParameter(k, v) } }
            ?.apply { parametri.forEach { (k, v) -> addQueryParameter(k, v) } }
            ?.build()
            ?: throw RifiutatoDalFoglio("indirizzo del foglio non valido")
        return chiama(Request.Builder().url(indirizzo).get().build(), client)
    }

    private fun scrivi(corpo: JSONObject): JSONObject {
        controllaConfigurazione()
        corpo.put("codice", codice())
        chiSono().forEach { (k, v) -> corpo.put(k, v) }
        return chiama(
            Request.Builder()
                .url(url())
                // text/plain di proposito: evita il preflight e Apps Script legge
                // comunque il corpo grezzo con postData.contents.
                .post(corpo.toString().toRequestBody("text/plain;charset=utf-8".toMediaType()))
                .build(),
            clientScrittura,
        )
    }

    /**
     * Per le scritture si aspetta di piu'. Lo script ci ha messo diciotto
     * secondi il 26/09, e rinunciare troppo presto vuol dire ritentare una riga
     * che forse e' gia' stata scritta (non e' un dramma, grazie a idLocale, ma
     * e' tempo perso).
     */
    private val clientScrittura: OkHttpClient by lazy {
        client.newBuilder().readTimeout(90, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS).build()
    }

    private fun controllaConfigurazione() {
        if (!configurato) throw RifiutatoDalFoglio("Indirizzo o codice del foglio mancanti: vedi Impostazioni")
    }

    private fun chiama(richiesta: Request, c: OkHttpClient): JSONObject {
        c.newCall(richiesta).execute().use { r ->
            val testo = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw java.io.IOException("HTTP ${r.code}")
            val json = try {
                JSONObject(testo)
            } catch (_: Exception) {
                // Succede quando lo script non e' pubblicato come "Chiunque":
                // Google risponde con una pagina di accesso invece del JSON.
                throw RifiutatoDalFoglio("Risposta non valida dal foglio (lo script e' pubblicato per \"Chiunque\"?)")
            }
            if (!json.optBoolean("ok")) {
                throw RifiutatoDalFoglio(json.optString("errore").ifBlank { "errore sconosciuto" })
            }
            return json
        }
    }
}
