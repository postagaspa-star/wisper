package eu.stgm.wisper.rapportino

import kotlinx.coroutines.asContextElement
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Le due strade verso il server sul NAS (docs/gestionale/porta-google.md):
 *
 *  - **in casa** il server direttamente (`http://192.168.1.51:8400`), come prima;
 *  - **da fuori** lo script Google del foglio, che tiene le richieste finché il
 *    server non le va a prendere ("la porta Google").
 *
 * La regola di casa (§8): prima di mandare il token sulla rete di casa, l'app
 * chiede `/salute` con un testo a caso, e vale "casa" solo se il server risponde
 * con la firma giusta (HMAC con lo SHA-256 del token, che conosce solo il server
 * vero). La scelta vale 5 minuti (ogni risposta da casa la rinnova), finché non
 * cambia la rete. Una richiesta a casa che cade per la rete riparte subito via
 * Google, con lo stesso id: il server non la fa due volte.
 *
 * Senza indirizzo Google: solo casa, come prima (niente firma). Senza indirizzo
 * di casa: solo Google. `accedi` (ancora senza token) va via Google, se c'è.
 *
 * Questa classe non legge le risposte: torna il JSON così com'è e
 * [PonteServer] lo traduce (ok, accesso, permesso, rete). Fa eccezione la
 * strada Google, che sa quando una risposta non è del server: pagina HTML,
 * HTTP diverso da 200, richiesta troppo grande.
 */
class Strade(
    private val casa: () -> String,
    private val google: () -> String,
    private val token: () -> String,
    client: OkHttpClient,
    private val orologio: () -> Long = { System.currentTimeMillis() },
) {
    enum class Dove { CASA, GOOGLE }

    private val _dove = MutableStateFlow<Dove?>(null)

    /** Da dove è arrivata l'ultima risposta: "In ufficio" o "Via Google" nelle Impostazioni. */
    val dove: StateFlow<Dove?> = _dove.asStateFlow()

    // ------------------------------------------------------------- i tempi

    /** Le letture di casa, come sempre. */
    private val casaLettura = client

    /** Tutti i rapportini, un file, un'esportazione: risposte grandi. */
    private val casaLunga = client.newBuilder().readTimeout(90, TimeUnit.SECONDS).build()

    /**
     * Le scritture aspettano di più e non si ripetono MAI da sole, neanche quando
     * OkHttp crede che la connessione sia caduta prima della risposta: l'email
     * riprovata sono due email. Riprova la coda, con lo stesso id.
     */
    private val casaScrittura = client.newBuilder().readTimeout(90, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false).build()

    private val casaCarica = casaScrittura.newBuilder().writeTimeout(5, TimeUnit.MINUTES).readTimeout(3, TimeUnit.MINUTES).build()

    /** Le scritture lunghe (la copia di sicurezza adesso): si aspetta come per le risposte grandi, mai ripetute da sole. */
    private val casaScritturaLunga = casaLunga.newBuilder().retryOnConnectionFailure(false).build()

    /** La prova di casa: 1,5 secondi in tutto, senza rimbalzi. */
    private val casaProva = client.newBuilder().callTimeout(PROVA_MS, TimeUnit.MILLISECONDS)
        .connectTimeout(PROVA_MS, TimeUnit.MILLISECONDS).readTimeout(PROVA_MS, TimeUnit.MILLISECONDS)
        .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build()

    /**
     * Verso lo script (§3): connessione 15 s, lettura 60 s (lo script aspetta fino a
     * 25 s, più il suo avvio e i file grandi), scrittura del corpo 120 s. Il
     * rimbalzo 302 di Google verso script.googleusercontent.com lo segue OkHttp da
     * solo, con una GET: non va forzato (la POST sul rimbalzo dà 411).
     */
    private val googleLettura = client.newBuilder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS).followRedirects(true).followSslRedirects(true).build()
    private val googleScrittura = googleLettura.newBuilder().retryOnConnectionFailure(false).build()

    // ------------------------------------------------------------- la scelta

    private val lucchetto = Any()
    private var scelta: Dove? = null
    private var sceltaFinoA = 0L
    private var sceltaPer = ""

    @Volatile
    private var generazione = 0

    /** La rete è cambiata (Wi-Fi ↔ dati, un'altra Wi-Fi): alla prossima richiesta si sceglie di nuovo. */
    fun reteCambiata() = synchronized(lucchetto) {
        generazione++
        scelta = null
    }

    /**
     * Il campanello degli aggiornamenti ([Campanello]): `<server di casa>/campanello`, solo mentre si parla col server di
     * casa (dalla porta Google no). Il token non parte.
     */
    fun indirizzoCampanello(): HttpUrl? =
        if (_dove.value == Dove.CASA) base(casa()).takeIf { it.isNotBlank() }?.let { (it + "/campanello").toHttpUrlOrNull() } else null

    /** Il client per il campanello (le stesse impostazioni di rete delle letture; i tempi li mette [Campanello]). */
    val clientCampanello: OkHttpClient = client

    /** Quale strada si userebbe adesso, senza provare niente (le prove). */
    internal fun sceltaAttuale(): Dove? = synchronized(lucchetto) { scelta?.takeIf { orologio() < sceltaFinoA } }

    // ------------------------------------------------------------- le richieste

    /** Una lettura: GET /exec?azione=... di casa, `metodo: "GET"` via Google. Un id nuovo ogni volta. */
    fun leggi(parametri: List<Pair<String, String>>, lunga: Boolean = false): JSONObject {
        val id = IdRichiesta.casuale()
        return instrada(
            conToken = true,
            daCasa = { base, doppia ->
                val u = (base + "/exec").toHttpUrlOrNull()?.newBuilder()
                    ?.apply { parametri.forEach { (k, v) -> addQueryParameter(k, v) } }?.build()
                    ?: throw PonteServer.Rifiutato("Indirizzo del server non valido: controllalo nella schermata di accesso")
                jsonDiCasa(if (lunga) casaLunga else casaLettura, Request.Builder().url(u).get().header("Authorization", "Bearer " + token()).build(), doppia)
            },
            daGoogle = { url ->
                val dati = JSONObject()
                parametri.forEach { (k, v) -> dati.put(k, v) }
                jsonDaGoogle(url, googleLettura, perGoogle(id, "exec").put("metodo", "GET").put("dati", dati))
            },
        )
    }

    /**
     * Una scrittura: POST /exec di casa (con `idRichiesta`), `metodo: "POST"` via
     * Google (con `id`). Lo stesso id nelle due strade, e a ogni tentativo della
     * stessa operazione della coda ([IdRichiesta]). [conToken] false solo per accedi.
     */
    fun scrivi(corpo: JSONObject, conToken: Boolean = true, lunga: Boolean = false): JSONObject {
        val testo = corpo.toString()
        val id = IdRichiesta.per("exec\n" + chiDelToken(if (conToken) token() else "") + "\n" + testo)
        return instrada(
            conToken = conToken,
            daCasa = { base, doppia ->
                val u = (base + "/exec").toHttpUrlOrNull() ?: throw PonteServer.Rifiutato("Indirizzo del server non valido: controllalo nella schermata di accesso")
                val conId = JSONObject(testo).put("idRichiesta", id)
                val r = Request.Builder().url(u)
                    // text/plain di proposito, come con lo script: il server legge comunque il corpo grezzo.
                    .post(conId.toString().toRequestBody(TESTO))
                    .apply { if (conToken) header("Authorization", "Bearer " + token()) }
                    .build()
                jsonDiCasa(if (lunga) casaScritturaLunga else casaScrittura, r, doppia)
            },
            daGoogle = { url ->
                val o = perGoogle(id, "exec", conToken).put("metodo", "POST").put("dati", JSONObject(testo))
                jsonDaGoogle(url, googleScrittura, o)
            },
        )
    }

    /**
     * Un file in byte: POST /carica di casa, `strada: "carica"` (in base64) via Google.
     * `idFile` parte sempre (§14bis): se chi chiama non lo dà nasce dall'id della
     * richiesta ("tel-..."), uguale a ogni tentativo della stessa operazione. È
     * l'idFile, non l'id, che impedisce di caricare due volte lo stesso file.
     */
    fun carica(query: List<Pair<String, String>>, byte: ByteArray, chi: Map<String, String>): JSONObject {
        val impronta = query.filterNot { it.first == "idFile" && it.second.isBlank() }.joinToString("\n") { it.first + "=" + it.second } + "\n" + sha256Hex(byte)
        val id = IdRichiesta.per("carica\n" + chiDelToken(token()) + "\n" + impronta)
        val query = if (query.any { it.first == "idFile" && it.second.isNotBlank() }) query
        else query.filterNot { it.first == "idFile" } + ("idFile" to "tel-$id")
        return instrada(
            conToken = true,
            daCasa = { base, doppia ->
                val u = (base + "/carica").toHttpUrlOrNull()?.newBuilder()
                    ?.apply { query.forEach { (k, v) -> addQueryParameter(k, v) } }?.build()
                    ?: throw PonteServer.Rifiutato("Indirizzo del server non valido: controllalo nella schermata di accesso")
                val r = Request.Builder().url(u)
                    .post(byte.toRequestBody("application/octet-stream".toMediaType()))
                    .header("Authorization", "Bearer " + token())
                    .apply { chi["disp"]?.let { header("X-Wisper-Disp", it) } }
                    .build()
                jsonDiCasa(casaCarica, r, doppia)
            },
            daGoogle = { url ->
                // Oltre 26.000.000 byte non passa da Google (§14bis): si rifiuta prima di mandare.
                if (byte.size > FILE_MASSIMO_GOOGLE) throw PonteServer.SoloInUfficio(TROPPO_GRANDE)
                val q = JSONObject()
                query.forEach { (k, v) -> q.put(k, v) }
                val o = perGoogle(id, "carica").put("query", q).conChi(chi).put("base64", Base64.getEncoder().encodeToString(byte))
                jsonDaGoogle(url, googleScrittura, o)
            },
        )
    }

    /**
     * Un file: GET /file/<id> di casa (i codici HTTP: 401, 403, 404), `strada:
     * "file"` via Google (gli stessi codici nel campo `stato`, il file in base64).
     */
    fun file(idFile: String, chi: Map<String, String>): Pair<ByteArray, String> {
        val id = IdRichiesta.casuale()
        return instrada(
            conToken = true,
            daCasa = { base, doppia ->
                val u = (base + "/file/" + java.net.URLEncoder.encode(idFile, "UTF-8")).toHttpUrlOrNull()
                    ?: throw PonteServer.Rifiutato("Indirizzo del server non valido")
                val richiesta = Request.Builder().url(u).get()
                    .header("Authorization", "Bearer " + token())
                    .apply { chi["disp"]?.let { header("X-Wisper-Disp", it) } }
                    .build()
                try {
                    casaLunga.newCall(richiesta).execute().use { r ->
                        // 401, 403, 404 sono risposte del server, non la rete (§14bis): non si riprova
                        // e non si passa a Google. La rete sono solo niente risposta, tempi scaduti e 5xx.
                        when (r.code) {
                            401 -> throw PonteServer.AccessoScaduto()
                            403 -> throw PonteServer.PermessoNegato("Non hai il permesso per vedere questo file")
                            404 -> throw PonteServer.Rifiutato("Il file non c'è")
                        }
                        if (r.code >= 500) throw IOException("HTTP ${r.code}")
                        if (!r.isSuccessful) throw PonteServer.Rifiutato("Il file non è arrivato (errore ${r.code})")
                        val tipo = (r.header("Content-Type") ?: r.body?.contentType()?.toString())?.substringBefore(';')?.trim()?.ifBlank { null }
                        val byte = r.body?.bytes() ?: throw IOException("risposta vuota")
                        byte to (tipo ?: "application/octet-stream")
                    }
                } catch (e: IOException) {
                    if (doppia) throw ReteDiCasa(e) else throw e
                }
            },
            daGoogle = { url ->
                val r = jsonDaGoogle(url, googleLettura, perGoogle(id, "file").put("file", idFile).conChi(chi))
                if (!r.optBoolean("ok")) {
                    val errore = r.optString("errore").ifBlank { "Il file non è arrivato" }
                    when {
                        r.optBoolean("rete", false) -> throw PonteServer.ServizioNonRaggiunto(errore, r.optString("porta"))
                        r.optInt("stato") == 401 || (r.has("accesso") && !r.optBoolean("accesso", true)) -> throw PonteServer.AccessoScaduto(errore)
                        r.optInt("stato") == 403 || (r.has("permesso") && !r.optBoolean("permesso", true)) ->
                            throw PonteServer.PermessoNegato("Non hai il permesso per vedere questo file")
                        r.optInt("stato") == 404 -> throw PonteServer.Rifiutato("Il file non c'è")
                        r.optInt("stato") == 413 -> throw PonteServer.SoloInUfficio(
                            r.optString("errore").ifBlank { "Il file è troppo grande per passare da Google: aprilo quando sei in ufficio" },
                        )
                        else -> throw PonteServer.Rifiutato(errore)
                    }
                }
                val byte = try {
                    Base64.getMimeDecoder().decode(r.optString("base64"))
                } catch (_: IllegalArgumentException) {
                    throw IOException("Il file arrivato da Google non si legge")
                }
                byte to r.optString("mime").substringBefore(';').trim().ifBlank { "application/octet-stream" }
            },
        )
    }

    /**
     * Fase 8 (fase8.md §7.1): lo ZIP di Esporta tutto da `GET /esportazione/<id>` col Bearer.
     * Solo dalla strada di casa: può essere grande e via Google non passa (porta-google.md non
     * ha questa strada); fuori casa si scarica in ufficio ([PonteServer.SoloInUfficio]).
     */
    fun esportazione(id: String, chi: Map<String, String>): ByteArray = instrada(
        conToken = true,
        daCasa = { base, doppia ->
            val u = (base + "/esportazione/" + java.net.URLEncoder.encode(id, "UTF-8")).toHttpUrlOrNull()
                ?: throw PonteServer.Rifiutato("Indirizzo del server non valido")
            val richiesta = Request.Builder().url(u).get()
                .header("Authorization", "Bearer " + token())
                .apply { chi["disp"]?.let { header("X-Wisper-Disp", it) } }
                .build()
            try {
                casaLunga.newCall(richiesta).execute().use { r ->
                    when (r.code) {
                        401 -> throw PonteServer.AccessoScaduto()
                        403 -> throw PonteServer.PermessoNegato("Il file con tutti i dati lo scarica solo chi l'ha chiesto")
                        404, 410 -> throw PonteServer.Rifiutato("Il file non c'è più: preparane uno nuovo")
                    }
                    if (r.code >= 500) throw IOException("HTTP ${r.code}")
                    if (!r.isSuccessful) throw PonteServer.Rifiutato("Il file non è arrivato (errore ${r.code})")
                    r.body?.bytes() ?: throw IOException("risposta vuota")
                }
            } catch (e: IOException) {
                if (doppia) throw ReteDiCasa(e) else throw e
            }
        },
        daGoogle = { throw PonteServer.SoloInUfficio("Il file con tutti i dati si scarica quando sei in ufficio") },
    )

    // ------------------------------------------------------------- interno

    /** Una richiesta a casa caduta per la rete, quando c'è anche Google: si riparte da lì. */
    private class ReteDiCasa(causa: IOException) : IOException(causa.message, causa)

    private fun <T> instrada(conToken: Boolean, daCasa: (String, Boolean) -> T, daGoogle: (String) -> T): T {
        val casa = base(casa())
        val g = google().trim()
        if (g.isBlank()) {
            // Senza Google: solo casa, come prima della porta (anche la firma no).
            return daCasa(casa, false).also { _dove.value = Dove.CASA }
        }
        if (casa.isBlank()) return daGoogle(g).also { _dove.value = Dove.GOOGLE }
        val tok = token()
        // accedi (senza token) va via Google: senza token la firma di casa non si può controllare.
        if (!conToken || tok.isBlank()) return daGoogle(g).also { _dove.value = Dove.GOOGLE }
        val chiave = casa + "\n" + g + "\n" + sha256Hex(tok.toByteArray())
        if (scegli(casa, chiave, tok) == Dove.CASA) {
            try {
                return daCasa(casa, true).also { rinnova(chiave); _dove.value = Dove.CASA }
            } catch (_: ReteDiCasa) {
                // La stessa richiesta, con lo stesso id, parte via Google (§8.5).
                passaAGoogle(chiave)
            }
        }
        return daGoogle(g).also { _dove.value = Dove.GOOGLE }
    }

    private fun scegli(casa: String, chiave: String, tok: String): Dove = synchronized(lucchetto) {
        val s = scelta
        if (s != null && sceltaPer == chiave && orologio() < sceltaFinoA) return s
        // Una prova sola alla volta: le altre richieste aspettano la sua risposta (al massimo 1,5 s).
        val prima = generazione
        val d = if (provaCasa(casa, tok)) Dove.CASA else Dove.GOOGLE
        if (prima == generazione) {
            scelta = d
            sceltaPer = chiave
            sceltaFinoA = orologio() + DURATA_SCELTA_MS
        }
        d
    }

    private fun rinnova(chiave: String) = synchronized(lucchetto) {
        if (scelta == Dove.CASA && sceltaPer == chiave) sceltaFinoA = orologio() + DURATA_SCELTA_MS
    }

    private fun passaAGoogle(chiave: String) = synchronized(lucchetto) {
        scelta = Dove.GOOGLE
        sceltaPer = chiave
        sceltaFinoA = orologio() + DURATA_SCELTA_MS
    }

    /**
     * La prova di casa (§8.2): `GET <casa>/salute?prova=P&chi=C`, 1,5 secondi in
     * tutto. Il token non parte: solo i primi 16 caratteri del suo SHA-256.
     */
    private fun provaCasa(casa: String, tok: String): Boolean {
        val prova = IdRichiesta.casuale(32)
        val u = (casa + "/salute").toHttpUrlOrNull()?.newBuilder()
            ?.addQueryParameter("prova", prova)?.addQueryParameter("chi", chiDelToken(tok))?.build() ?: return false
        return try {
            casaProva.newCall(Request.Builder().url(u).get().build()).execute().use { r ->
                if (r.code != 200) return false
                val j = JSONObject(r.body?.string().orEmpty())
                j.optBoolean("ok") && MessageDigest.isEqual(j.optString("firma").toByteArray(), firmaDiCasa(tok, prova).toByteArray())
            }
        } catch (_: Exception) {
            false
        }
    }

    /**
     * La risposta di casa. Con [doppia] (c'è anche Google) un errore di rete, un
     * HTTP diverso da 200 o una risposta che non è JSON diventano [ReteDiCasa];
     * senza Google, come prima: la rete è un'eccezione di rete e una risposta
     * strana un no ("controlla l'indirizzo").
     */
    private fun jsonDiCasa(c: OkHttpClient, richiesta: Request, doppia: Boolean): JSONObject {
        try {
            c.newCall(richiesta).execute().use { r ->
                val testo = r.body?.string().orEmpty()
                if (!r.isSuccessful) throw IOException("HTTP ${r.code}")
                return try {
                    // 03/11/2026: in ogni risposta le versioni annunciate dal NAS (AnnuncioVersioni), lette in silenzio.
                    JSONObject(testo).also { AnnuncioVersioni.leggi(it) }
                } catch (_: Exception) {
                    if (doppia) throw IOException("risposta non JSON")
                    throw PonteServer.Rifiutato("Risposta non valida dal server: controlla l'indirizzo")
                }
            }
        } catch (e: IOException) {
            if (doppia) throw ReteDiCasa(e) else throw e
        }
    }

    /**
     * La risposta dello script. Una pagina HTML (lo script si è fermato, una quota)
     * o un HTTP diverso da 200 (429 = troppe esecuzioni insieme) sono la rete (§4).
     */
    private fun jsonDaGoogle(url: String, c: OkHttpClient, corpo: JSONObject): JSONObject {
        val testo = corpo.toString()
        if (caratteriPerGoogle(testo) > MASSIMO_GOOGLE) throw PonteServer.SoloInUfficio(TROPPO_GRANDE)
        val u = url.toHttpUrlOrNull() ?: throw PonteServer.Rifiutato("L'indirizzo di Google non è valido: controllalo nelle Impostazioni")
        val r: Response = c.newCall(Request.Builder().url(u).post(testo.toRequestBody(TESTO)).build()).execute()
        r.use {
            val risposta = it.body?.string().orEmpty()
            if (it.code == 429) throw PonteServer.ServizioNonRaggiunto("Troppe richieste insieme: riprova fra poco", "occupato")
            if (it.code != 200) throw PonteServer.ServizioNonRaggiunto("Google non risponde (errore ${it.code}): riprova fra poco", "google")
            val j = try {
                JSONObject(risposta)
            } catch (_: Exception) {
                throw PonteServer.ServizioNonRaggiunto("Google non ha risposto come doveva: riprova fra poco", "google")
            }
            // Anche dalla porta Google (e quando dice di no) il server mette le versioni: l'app le legge lo stesso.
            AnnuncioVersioni.leggi(j)
            // Lo script ha già detto che oltre il limite non passa (senza rete): si tiene per l'ufficio.
            if (!j.optBoolean("ok") && !j.optBoolean("rete", false) && j.optString("errore").contains("troppo grande per passare da Google")) {
                throw PonteServer.SoloInUfficio(TROPPO_GRANDE)
            }
            return j
        }
    }

    /** I campi comuni di una richiesta allo script (§3). Il token nel corpo: lo script non legge le intestazioni. */
    private fun perGoogle(id: String, strada: String, conToken: Boolean = true): JSONObject =
        JSONObject().put("porta", 1).put("id", id).put("token", if (conToken) token() else "").put("strada", strada)

    private fun JSONObject.conChi(chi: Map<String, String>): JSONObject {
        listOf("disp", "dispNome", "app").forEach { k -> chi[k]?.let { put(k, it) } }
        return this
    }

    companion object {
        /** Quanto vale una scelta (casa o Google). */
        const val DURATA_SCELTA_MS = 5 * 60 * 1000L

        /** La prova di casa, connessione e risposta. */
        const val PROVA_MS = 1500L

        /** Un file più grande di così non passa da Google (§14bis): si rifiuta prima di mandarlo. */
        const val FILE_MASSIMO_GOOGLE = 26_000_000L

        /**
         * Il limite dello script per tutta la richiesta (Porta.gs, PORTA.massimoRichiesta):
         * 36 milioni di caratteri (i file in base64 dentro exec, gli allegati delle email).
         */
        const val MASSIMO_GOOGLE = 36_000_000L

        /** Le stesse parole dello script (§3) e del computer (Server.cs). */
        const val TROPPO_GRANDE = "La richiesta è troppo grande per passare da Google (al massimo 26 MB): mandala quando sei in ufficio"

        private val TESTO = "text/plain;charset=utf-8".toMediaType()

        /** L'indirizzo base, senza la barra e senza /exec in fondo. */
        fun base(indirizzo: String): String = indirizzo.trim().trimEnd('/').removeSuffix("/exec").trimEnd('/')

        fun sha256Hex(b: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }

        /** I primi 16 caratteri esadecimali dello SHA-256 del token: dicono al server quale sessione, senza il token. */
        fun chiDelToken(token: String): String = sha256Hex(token.toByteArray(Charsets.UTF_8)).take(16)

        /**
         * La firma che solo il server vero sa fare (§8.2): HMAC-SHA256 con chiave lo
         * SHA-256 del token scritto in esadecimale minuscolo (come testo UTF-8),
         * messaggio [prova]; in esadecimale minuscolo.
         */
        fun firmaDiCasa(token: String, prova: String): String {
            val chiave = sha256Hex(token.toByteArray(Charsets.UTF_8)).toByteArray(Charsets.UTF_8)
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(chiave, "HmacSHA256"))
            return mac.doFinal(prova.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        }

        /** Come conta lo script: le lettere oltre l'ASCII diventano \uXXXX, sei caratteri. */
        fun caratteriPerGoogle(testo: String): Long {
            var n = testo.length.toLong()
            for (ch in testo) if (ch.code > 0x7e) n += 5
            return n
        }
    }
}

/**
 * L'id di ogni richiesta (porta-google.md §5). Una lettura ne ha uno nuovo ogni
 * volta. Una scrittura fatta dentro [perOperazione] (la coda: l'operazione col suo
 * idOp, che resta lo stesso a ogni tentativo e dopo un "Riprova") ha un id che
 * dipende dall'operazione e da quello che si manda: uguale a ogni tentativo, anche
 * dopo il passaggio casa → Google; diverso se nel frattempo il contenuto è
 * cambiato (il server ridarebbe la risposta di prima senza fare la modifica nuova).
 * Fuori dalla coda (le azioni in diretta) un id nuovo a ogni chiamata, lo stesso
 * nelle due strade.
 *
 * Nell'impronta c'è anche il token (i primi caratteri del suo SHA-256): il server
 * riconosce un id solo con lo stesso token, ma lo script tiene le risposte per id e
 * basta. Dopo un nuovo accesso la stessa operazione ha un id nuovo, e non può
 * ricevere una risposta rimasta nello script per l'accesso di prima (per esempio
 * "accesso scaduto").
 */
object IdRichiesta {
    private val operazione = ThreadLocal<String?>()
    private val caso = SecureRandom()
    private const val LETTERE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    /** Le richieste fatte da [blocco] appartengono all'operazione [idOp] della coda. */
    suspend fun <T> perOperazione(idOp: String, blocco: suspend () -> T): T =
        withContext(operazione.asContextElement(idOp)) { blocco() }

    /** [n] caratteri `[A-Za-z0-9_-]` a caso (16 = 96 bit). */
    fun casuale(n: Int = 16): String = buildString(n) { repeat(n) { append(LETTERE[caso.nextInt(LETTERE.length)]) } }

    /** L'id di una scrittura con questo contenuto ([impronta]). */
    fun per(impronta: String): String {
        val op = operazione.get()
        if (op.isNullOrBlank()) return casuale()
        val md = MessageDigest.getInstance("SHA-256")
        md.update(op.toByteArray(Charsets.UTF_8))
        md.update(0)
        md.update(impronta.toByteArray(Charsets.UTF_8))
        return "q" + Base64.getUrlEncoder().withoutPadding().encodeToString(md.digest()).take(23)
    }
}

/** I due indirizzi detti in italiano semplice, e i loro controlli. */
object Indirizzi {
    /** Il server di casa, se non si scrive altro (il NAS dello studio). */
    const val CASA_DI_BASE = "http://192.168.1.51:8400"

    /** "192.168.1.51" per http://192.168.1.51:8400 (la porta di sempre non si dice), "10.0.2.2:8450" per gli altri. */
    fun breve(indirizzo: String): String {
        val t = indirizzo.trim()
        val u = Strade.base(t).toHttpUrlOrNull() ?: return t.removePrefix("https://").removePrefix("http://").trimEnd('/')
        val porta = if (u.port == 8400 || u.port == HttpUrl.defaultPort(u.scheme)) "" else ":${u.port}"
        return u.host + porta
    }

    /** "Da fuori: Google · In casa: 192.168.1.51". */
    fun descrivi(casa: String, google: String): String = when {
        casa.isNotBlank() && google.isNotBlank() -> "Da fuori: Google · In casa: ${breve(casa)}"
        casa.isNotBlank() -> "Solo in casa: ${breve(casa)}"
        google.isNotBlank() -> "Solo da fuori: Google"
        else -> "Nessun indirizzo"
    }

    /**
     * Null se i due indirizzi vanno bene, altrimenti la frase da mostrare.
     * [inChiaro] dice se il telefono può parlare in HTTP senza la S con quel nome
     * (la configurazione di rete: solo il server di casa, e 10.0.2.2 nelle build di prova).
     */
    fun controlla(casa: String, google: String, inChiaro: (String) -> Boolean): String? {
        val c = casa.trim()
        val g = google.trim()
        if (c.isBlank() && g.isBlank()) return "Serve almeno un indirizzo: quello di Google o quello di casa."
        if (g.isNotBlank()) {
            val u = g.toHttpUrlOrNull() ?: return "L'indirizzo di Google non è valido: controllalo."
            if (!u.isHttps && !inChiaro(u.host)) return "L'indirizzo di Google deve cominciare con https://"
        }
        if (c.isNotBlank()) {
            val u = Strade.base(c).toHttpUrlOrNull() ?: return "L'indirizzo di casa non è valido: controllalo."
            if (!u.isHttps && !inChiaro(u.host)) return "In casa il telefono parla solo col server dello studio (${breve(CASA_DI_BASE)})."
        }
        return null
    }
}
