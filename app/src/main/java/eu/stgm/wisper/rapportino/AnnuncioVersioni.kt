package eu.stgm.wisper.rapportino

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/*
 * Gli aggiornamenti li annuncia il NAS (03/11/2026, Andrea: "non è l'app a controllare ogni volta, è il NAS ad avvisare
 * l'app"; accordo docs/gestionale/progetti.md §6, server/src/versioni.js). Il server guarda l'elenco firmato delle
 * versioni e lo mette in ogni risposta ("versioni": {giro, android: {codice, nome}, computer: {versione}}), anche da
 * Google e negli errori; in casa c'e' anche il campanello, una richiesta che resta aperta finche' l'elenco non cambia.
 *
 * Qui solo la lettura e il campanello: cosa fare con un annuncio (scaricare una volta per codice, installare al momento
 * giusto) lo decide NuoveVersioni, che controlla comunque firma e impronta prima di installare.
 */

/** Il pezzo "versioni" di una risposta del server. [codiceAndroid] 0 = l'elenco non ha il telefono. */
data class Versioni(val giro: Int, val codiceAndroid: Int, val nomeAndroid: String, val computer: String = "") {
    companion object {
        /**
         * Solo l'annuncio vero: "versioni" con un "giro" numerico o un "android" con "codice". La risposta di
         * statoSistema (Amministrazione › Sistema) ha un suo "versioni" diverso ({ultime, dispositivi}): si ignora.
         */
        fun daJson(o: JSONObject?): Versioni? {
            if (o == null) return null
            val android = o.optJSONObject("android")
            if (o.opt("giro") !is Number && android?.opt("codice") !is Number) return null
            return Versioni(
                giro = o.optInt("giro", 0),
                codiceAndroid = android?.optInt("codice", 0) ?: 0,
                nomeAndroid = android?.optString("nome").orEmpty(),
                computer = o.optJSONObject("computer")?.optString("versione").orEmpty(),
            )
        }
    }
}

/**
 * Il punto unico da cui passano le risposte del server ([Strade]: casa e Google, anche quelle che dicono di no; il
 * [Campanello]). Legge "versioni" in silenzio e lo passa a chi ascolta (WisperApp -> NuoveVersioni).
 */
object AnnuncioVersioni {

    /** Chi ascolta: si chiama a ogni risposta con "versioni" (dal filo di rete: deve essere svelto). */
    @Volatile
    var quandoArriva: (Versioni) -> Unit = {}

    @Volatile
    var ultime: Versioni? = null
        private set

    /** Una risposta del server (o del campanello): se dice le versioni, le si passa avanti. */
    fun leggi(risposta: JSONObject?) {
        val v = Versioni.daJson(risposta?.optJSONObject("versioni")) ?: return
        ultime = v
        runCatching { quandoArriva(v) }
    }

    /** Per le prove. */
    internal fun dimentica() {
        ultime = null
        quandoArriva = {}
    }
}

/**
 * Una volta per codice (progetti.md §6): lo stesso annuncio arriva in ogni risposta, ma il controllo parte una volta
 * sola per ogni versione nuova. Se non e' andato (la rete), si riprova dopo [riprovaDopoMs].
 */
class UnaVoltaPerCodice(
    private val versioneMia: Int,
    private val riprovaDopoMs: Long = 60 * 60 * 1000L,
    private val orologio: () -> Long = { System.currentTimeMillis() },
) {
    private var codice = 0
    private var partito = 0L
    private var riuscito = false

    /** Vero se per questo codice il controllo va fatto adesso (e lo segna come partito). */
    @Synchronized
    fun daFare(nuovo: Int): Boolean {
        if (nuovo <= versioneMia) return false
        if (nuovo == codice && (riuscito || orologio() - partito < riprovaDopoMs)) return false
        codice = nuovo
        partito = orologio()
        riuscito = false
        return true
    }

    /** Com'e' andato il controllo partito per [quale]. */
    @Synchronized
    fun esito(quale: Int, ok: Boolean) {
        if (quale == codice) riuscito = ok
    }
}

/**
 * Il campanello degli aggiornamenti (server/src/versioni.js, `/campanello?giro=<n>`): con l'app davanti e il server di casa, una
 * richiesta resta aperta finche' l'elenco delle versioni non cambia (il server risponde al massimo dopo 50 secondi);
 * appena torna se ne riapre un'altra. Dopo un errore si riprova fra [pausaErroreMs]. Il token non parte mai.
 *
 * @param indirizzo `<server di casa>/campanello`, o null se adesso non si parla col server di casa (Google): si smette.
 */
class Campanello(
    private val indirizzo: () -> HttpUrl?,
    client: OkHttpClient,
    private val annuncia: (JSONObject) -> Unit = AnnuncioVersioni::leggi,
    private val pausaErroreMs: Long = 30_000L,
    /** Un server senza vedetta (spento: true) non suonera' mai: si richiede di rado. */
    private val pausaSpentoMs: Long = 10 * 60_000L,
    private val orologio: () -> Long = { System.currentTimeMillis() },
    /** Il registro (logcat): solo il giro e com'e' andata, mai l'indirizzo o altro. */
    private val traccia: (String) -> Unit = {},
) {
    private val c = client.newBuilder().readTimeout(65, TimeUnit.SECONDS).callTimeout(0, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false).build()

    /** Quante richieste sono partite (le prove e il registro). */
    @Volatile
    var suonate = 0
        private set

    /** Suona finche' non lo si ferma (cancellando la coroutine) o finche' non si e' piu' in casa. */
    suspend fun suona() {
        var giro = AnnuncioVersioni.ultime?.giro ?: 0
        while (true) {
            val base = indirizzo() ?: return
            val inizio = orologio()
            val r = try {
                suonate++
                traccia("aperto col giro $giro")
                chiedi(base.newBuilder().addQueryParameter("giro", giro.toString()).build())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
            if (r == null || !r.optBoolean("ok")) { traccia("non risponde: riprovo fra ${pausaErroreMs / 1000} s"); delay(pausaErroreMs); continue }
            if (r.optBoolean("spento")) { traccia("il server non ha la vedetta: riprovo fra ${pausaSpentoMs / 60_000} min"); delay(pausaSpentoMs); continue }
            annuncia(r)
            val nuovo = r.optInt("giro", giro)
            traccia(if (nuovo != giro) "suonato: giro $nuovo" else "nessuna novita'")
            // Una risposta subito e uguale (dalla porta Google, o un server che non aspetta): non si martella il server.
            if (nuovo == giro && orologio() - inizio < 1_000L) delay(pausaErroreMs)
            giro = nuovo
        }
    }

    /** La GET, che si chiude davvero se la coroutine viene fermata (l'app va dietro). */
    private suspend fun chiedi(url: HttpUrl): JSONObject {
        val call = c.newCall(Request.Builder().url(url).get().build())
        return suspendCancellableCoroutine { cont ->
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (cont.isActive) cont.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    val esito = runCatching {
                        response.use { r ->
                            if (!r.isSuccessful) throw IOException("HTTP ${r.code}")
                            JSONObject(r.body?.string().orEmpty())
                        }
                    }
                    if (cont.isActive) esito.fold({ cont.resume(it) }, { cont.resumeWithException(it) })
                }
            })
        }
    }
}
