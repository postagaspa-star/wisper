package eu.stgm.wisper.rapportino

import eu.stgm.wisper.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Il collegamento col foglio Google, attraverso lo script pubblicato come
 * app web. Legge clienti e commesse, scrive il rapportino finito.
 *
 * Perche' non le API di Google Fogli: richiederebbero credenziali dentro
 * l'app e un giro di autorizzazioni. Lo script invece e' un solo indirizzo,
 * e la parte delicata resta dentro il foglio.
 *
 * ATTENZIONE AL REINDIRIZZAMENTO. Apps Script risponde con un rimbalzo verso
 * un secondo indirizzo, e la risposta vera arriva da li'. Il comportamento
 * predefinito di OkHttp e' quello giusto e non va toccato: forzare il metodo
 * a restare POST rompe tutto con un errore 411. Verificato il 07/08.
 */
class PonteFoglio(
    private val url: String = BuildConfig.SHEET_URL,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) {

    val configurato: Boolean get() = url.isNotBlank()

    class ErroreFoglio(messaggio: String) : Exception(messaggio)

    /**
     * Clienti e commesse dal foglio. Se il ponte non e' configurato o la rete
     * non c'e', torna vuoto invece di lanciare: l'app deve poter dettare un
     * rapportino anche senza anagrafica, il nome cliente lo scrive e basta.
     */
    suspend fun caricaAnagrafiche(): Anagrafiche = withContext(Dispatchers.IO) {
        if (!configurato) return@withContext Anagrafiche()
        try {
            val risposta = chiama(Request.Builder().url(url).get().build())
            Anagrafiche(
                clienti = risposta.optJSONArray("clienti").mappa { o ->
                    Cliente(
                        id = o.optString("id"),
                        nome = o.optString("nome"),
                        alias = o.optJSONArray("alias").let { a ->
                            (0 until (a?.length() ?: 0)).map { a!!.optString(it) }
                        }.filter { it.isNotBlank() },
                    )
                }.filter { it.nome.isNotBlank() },
                commesse = risposta.optJSONArray("commesse").mappa { o ->
                    Commessa(
                        id = o.optString("id"),
                        idCliente = o.optString("idCliente"),
                        descrizione = o.optString("descrizione"),
                        stato = o.optString("stato"),
                        indirizzo = o.optString("indirizzo"),
                    )
                }.filter { it.id.isNotBlank() },
            )
        } catch (_: Exception) {
            Anagrafiche()
        }
    }

    /**
     * Scrive la riga nel foglio. Qui invece l'errore si propaga: finche' il
     * foglio non risponde con un id, il rapportino resta in [CodaInvii].
     * Torna l'identificativo della riga (es. RAP-20260807-194006).
     *
     * Un tentativo solo, e paziente. I tentativi successivi li fa la coda, con
     * le pause giuste e anche dopo un riavvio: il vecchio "riprova fra un
     * secondo" aveva senso quando il rapportino viveva solo in memoria.
     * La pazienza invece serve: lo script ci ha messo diciotto secondi il
     * 26/09, e rinunciare troppo presto vuol dire ritentare una riga che forse
     * e' gia' stata scritta.
     *
     * @param data il giorno del rapportino (gg/mm/aaaa). Se manca, lo script
     *        mette quello di arrivo, sbagliato per un rapportino partito tardi.
     * @param idLocale uguale a ogni tentativo dello stesso rapportino: permette
     *        allo script di riconoscere una riga gia' scritta.
     */
    suspend fun salva(r: Rapportino, data: String? = null, idLocale: String? = null): String =
        withContext(Dispatchers.IO) {
            if (!configurato) throw ErroreFoglio("indirizzo del foglio non configurato")

            val corpo = JSONObject().apply {
                put("cliente", r.cliente ?: "")
                put("commessa", r.commessa ?: "")
                put("descrizione", r.descrizione ?: "")
                put("ore", r.ore ?: 0.0)
                put("km", r.km ?: 0.0)
                put("spese", r.spese ?: 0.0)
                put("statoCommessa", r.statoCommessa?.parlato?.uppercase() ?: "")
                data?.let { put("data", it) }
                idLocale?.let { put("idLocale", it) }
            }.toString()

            val richiesta = Request.Builder()
                .url(url)
                // text/plain di proposito: evita il preflight e Apps Script legge
                // comunque il corpo grezzo con postData.contents.
                .post(corpo.toRequestBody("text/plain;charset=utf-8".toMediaType()))
                .build()

            chiama(richiesta, clientSalvataggio)
                .optString("id")
                .ifBlank { throw ErroreFoglio("il foglio non ha restituito un id") }
        }

    /** Lo stesso client, con l'attesa che serve all'Apps Script quando scrive. */
    private val clientSalvataggio: OkHttpClient by lazy {
        client.newBuilder().readTimeout(90, TimeUnit.SECONDS).build()
    }

    /**
     * Crea un cliente nuovo nel foglio e restituisce come si chiama davvero.
     * Se esiste gia' (anche solo come soprannome) lo script restituisce quello
     * esistente invece di duplicarlo: dettando a voce e' facilissimo ricreare
     * lo stesso cliente con una sillaba di differenza.
     */
    suspend fun creaCliente(nome: String): Cliente = withContext(Dispatchers.IO) {
        val r = posta(
            JSONObject().put("azione", "creaCliente").put("nome", nome)
        ).optJSONObject("cliente") ?: throw ErroreFoglio("il foglio non ha creato il cliente")
        Cliente(id = r.optString("id"), nome = r.optString("nome"))
    }

    /** Come sopra per le commesse. Il cliente deve gia' esistere. */
    suspend fun creaCommessa(idCliente: String, descrizione: String): Commessa =
        withContext(Dispatchers.IO) {
            val r = posta(
                JSONObject()
                    .put("azione", "creaCommessa")
                    .put("idCliente", idCliente)
                    .put("descrizione", descrizione)
            ).optJSONObject("commessa") ?: throw ErroreFoglio("il foglio non ha creato la commessa")
            Commessa(
                id = r.optString("id"),
                idCliente = idCliente,
                descrizione = r.optString("descrizione"),
                stato = "APERTA",
            )
        }

    /**
     * Cambia lo stato di una commessa nel foglio.
     *
     * Il rapportino racconta la giornata; questo cambia lo stato del mondo.
     * Se il tecnico dice "ho finito il lavoro" e la commessa restasse APERTA,
     * domani Wisper gliela riproporrebbe come se niente fosse.
     */
    suspend fun impostaStatoCommessa(idCommessa: String, stato: String) =
        withContext(Dispatchers.IO) {
            posta(
                JSONObject()
                    .put("azione", "statoCommessa")
                    .put("idCommessa", idCommessa)
                    .put("stato", stato.uppercase())
            )
            Unit
        }

    // --- interno ---

    private fun posta(corpo: JSONObject): JSONObject {
        if (!configurato) throw ErroreFoglio("indirizzo del foglio non configurato")
        return chiama(
            Request.Builder()
                .url(url)
                .post(corpo.toString().toRequestBody("text/plain;charset=utf-8".toMediaType()))
                .build()
        )
    }

    private fun chiama(richiesta: Request, c: OkHttpClient = client): JSONObject {
        c.newCall(richiesta).execute().use { r ->
            val testo = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw ErroreFoglio("HTTP ${r.code}")
            val json = try {
                JSONObject(testo)
            } catch (_: Exception) {
                // Succede quando lo script non e' pubblicato come "Chiunque":
                // Google risponde con una pagina di accesso invece del JSON.
                throw ErroreFoglio("risposta non valida dal foglio (accesso non pubblico?)")
            }
            if (!json.optBoolean("ok")) {
                throw ErroreFoglio(json.optString("errore").ifBlank { "errore sconosciuto" })
            }
            return json
        }
    }

    private fun <T> JSONArray?.mappa(trasforma: (JSONObject) -> T): List<T> {
        if (this == null) return emptyList()
        return (0 until length()).mapNotNull { i -> optJSONObject(i)?.let(trasforma) }
    }
}
