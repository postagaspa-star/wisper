package eu.stgm.wisper.rapportino

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import android.print.PrintAttributes
import androidx.core.content.FileProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import kotlin.math.roundToInt

/**
 * I PDF del rapportino e del riepilogo, uguali a quelli di Wisper Ufficio.
 *
 * Il telefono non ha un suo modello: usa pc/ui/documenti.js e pc/ui/conti.js del
 * computer, che la build copia negli asset (app/build.gradle.kts, copiaModelliPdf),
 * col carattere Figtree. Una WebView nascosta fa scrivere la pagina a documenti.js coi
 * dati del foglio e la stampa in PDF come la WebView2 del computer (StampaPagina.kt).
 *
 * I dati sono gli stessi JSON che dà lo script (rapportini come in `rapportini`,
 * anagrafiche = {clienti, commesse, impostazioni, …}): quelli che documenti.js legge già.
 *
 * [immagine] dà byte e tipo di un file di Drive (firme, scontrini, FIRMA_TECNICO):
 * null vuol dire che il file non c'è più, e il PDF si fa senza, come sul computer;
 * un'eccezione vuol dire che non si è potuto scaricare, e il PDF non si fa (meglio
 * nessun PDF che un rapportino "firmato" con lo spazio della firma vuoto).
 */
object Stampa {

    /** Il PDF non si è fatto: il messaggio dice cosa è successo e cosa fare. */
    class ErroreStampa(messaggio: String, causa: Throwable? = null) : Exception(messaggio, causa)

    /** A chi va il riepilogo: il cliente che paga, o "Vari clienti" (allora ogni riga dice il suo). */
    data class Intestatario(val nome: String, val righe: List<String>, val email: String, val mostraCliente: Boolean) {
        fun json(): JSONObject = JSONObject()
            .put("nome", nome).put("righe", JSONArray(righe)).put("email", email).put("mostraCliente", mostraCliente)
    }

    // Una stampa alla volta, come sul computer: la WebView è una e i PDF del mese pesano.
    private val unaAllaVolta = Mutex()

    private const val TEMPO_MODELLO = 30_000L
    private const val TEMPO_IMMAGINE = 60_000L
    private const val TEMPO_STAMPA = 90_000L

    // ---------------------------------------------------------------- i due documenti

    /** Il PDF del rapportino singolo, come il pulsante PDF del computer. */
    suspend fun rapportino(
        ctx: Context,
        rapportino: JSONObject,
        anagrafiche: JSONObject,
        conImporti: Boolean,
        conFoto: Boolean,
        immagine: suspend (String) -> Pair<ByteArray, String>?,
    ): File = rapportino(ctx, rapportino, anagrafiche, conImporti, conFoto, nomeRapportino(rapportino), immagine)

    /** Come sopra, col nome del file deciso da chi chiama (Invia al cliente usa [nomeInvio]). */
    suspend fun rapportino(
        ctx: Context,
        rapportino: JSONObject,
        anagrafiche: JSONObject,
        conImporti: Boolean,
        conFoto: Boolean,
        nome: String,
        immagine: suspend (String) -> Pair<ByteArray, String>?,
    ): File = stampa(
        ctx,
        "WisperDocumenti.rapportino($rapportino,$anagrafiche,${opzioni(conImporti, conFoto)})",
        nome, immagine,
    )

    /** Il riepilogo di più rapportini (intestatario e periodo come sul computer). */
    suspend fun riepilogo(
        ctx: Context,
        rapportini: JSONArray,
        anagrafiche: JSONObject,
        conImporti: Boolean,
        conFoto: Boolean,
        immagine: suspend (String) -> Pair<ByteArray, String>?,
    ): File = riepilogo(ctx, rapportini, anagrafiche, conImporti, conFoto, nomeRiepilogo(rapportini, anagrafiche), immagine)

    /** Come sopra, col nome del file deciso da chi chiama. */
    suspend fun riepilogo(
        ctx: Context,
        rapportini: JSONArray,
        anagrafiche: JSONObject,
        conImporti: Boolean,
        conFoto: Boolean,
        nome: String,
        immagine: suspend (String) -> Pair<ByteArray, String>?,
    ): File {
        if (rapportini.length() == 0) throw ErroreStampa("Non c'è niente da mettere nel riepilogo")
        val chi = intestatario(rapportini, anagrafiche).json()
        val quando = JSONObject.quote(periodo(rapportini))
        return stampa(
            ctx,
            "WisperDocumenti.riepilogo($rapportini,$anagrafiche,$chi,$quando,${opzioni(conImporti, conFoto)})",
            nome, immagine,
        )
    }

    private fun opzioni(conImporti: Boolean, conFoto: Boolean) =
        JSONObject().put("conImporti", conImporti).put("conFoto", conFoto)

    // ---------------------------------------------------------------- aprire e condividere

    /**
     * Apre il PDF con l'app del telefono che legge i PDF. Falso se non ce n'è una
     * (Android mostra comunque "Nessuna app": chi chiama può suggerire Condividi).
     */
    fun apri(ctx: Context, pdf: File): Boolean {
        val vedi = Intent(Intent.ACTION_VIEW)
            .setDataAndType(indirizzo(ctx, pdf), "application/pdf")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return try {
            avvia(ctx, vedi)
            true
        } catch (e: ActivityNotFoundException) {
            avvia(ctx, Intent.createChooser(vedi, null))
            false
        }
    }

    /**
     * Il foglio "Condividi" di Android col PDF allegato. [titolo] è il documento
     * ("Rapportino RAP/2026/0003 del 05/07/2026"): fa da oggetto se si sceglie l'email.
     */
    fun condividi(ctx: Context, pdf: File, titolo: String) {
        val uri = indirizzo(ctx, pdf)
        val manda = Intent(Intent.ACTION_SEND)
            .setType("application/pdf")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_SUBJECT, titolo)
            .putExtra(Intent.EXTRA_TITLE, titolo)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        // Senza ClipData, da Android 10 il foglio non mostra l'anteprima e alcune app non ricevono il permesso.
        manda.clipData = ClipData.newUri(ctx.contentResolver, titolo, uri)
        avvia(ctx, Intent.createChooser(manda, titolo))
    }

    private fun indirizzo(ctx: Context, pdf: File): Uri =
        try {
            FileProvider.getUriForFile(ctx, ctx.packageName + ".pdf", pdf)
        } catch (e: IllegalArgumentException) {
            throw IllegalArgumentException("Si condividono solo i PDF fatti da Stampa (cacheDir/pdf): $pdf", e)
        }

    private fun avvia(ctx: Context, intent: Intent) {
        // Da un contesto che non è una schermata Android vuole un'attività nuova.
        if (attivita(ctx) == null) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
    }

    private fun attivita(ctx: Context): Activity? {
        var c: Context? = ctx
        while (c is ContextWrapper) {
            if (c is Activity) return c
            c = c.baseContext
        }
        return null
    }

    // ---------------------------------------------------------------- nomi dei file

    /**
     * Il nome del PDF come sul computer: nomeFile() di app.js e poi NomeFilePulito()
     * di Ponte.cs ("RAP/2026/0003 Batokyo" -> "RAP-2026-0003 Batokyo"). Senza ".pdf".
     */
    fun nomeFile(prefisso: String, testo: String): String =
        pulisci("$prefisso $testo".replace(Regex("""[\\/:*?"<>|]+"""), "-").trim())

    /** Il pulsante PDF del rapportino: numero, cliente e data ("RAP-2026-0003 Batokyo 05-07-2026"). */
    fun nomeRapportino(r: JSONObject): String =
        nomeFile(testo(r, "id").ifEmpty { "Rapportino" }, testo(r, "cliente") + " " + data(testo(r, "data")).replace('/', '-'))

    /** Invia al cliente: numero e cliente, senza data ("RAP-2026-0003 Batokyo"). */
    fun nomeInvio(r: JSONObject): String =
        nomeFile(testo(r, "id").ifEmpty { "Rapportino" }, testo(r, "cliente"))

    /** Il riepilogo: "Riepilogo Elettrodinamica Ottobre 2026". */
    fun nomeRiepilogo(rapportini: JSONArray, anagrafiche: JSONObject): String =
        nomeFile("Riepilogo", intestatario(rapportini, anagrafiche).nome + " " + periodo(rapportini))

    /** NomeFilePulito di Ponte.cs: via i caratteri che Windows rifiuta, niente spazi, punti o trattini ai bordi, 120 al massimo. */
    internal fun pulisci(nome: String): String {
        val pulito = nome.map { if (it < ' ' || it in "\"<>|:*?\\/") '-' else it }.joinToString("").trim(' ', '.', '-')
        if (pulito.length <= 120) return pulito
        // Non si taglia a metà una lettera fatta di due caratteri (un'emoji nel nome del cliente).
        return pulito.substring(0, if (pulito[119].isHighSurrogate()) 119 else 120)
    }

    // ---------------------------------------------------------------- intestatario e periodo (app.js)

    /**
     * intestatarioRiepilogo() di app.js: se i rapportini li paga un cliente solo, il
     * riepilogo è intestato a lui (nome, indirizzo, P.IVA, email dalla sua scheda);
     * altrimenti a "Vari clienti", e ogni riga dice il suo.
     */
    fun intestatario(rapportini: JSONArray, anagrafiche: JSONObject): Intestatario {
        val clienti = anagrafiche.optJSONArray("clienti") ?: JSONArray()
        val gruppi = LinkedHashMap<String, Intestatario>()
        for (r in oggetti(rapportini)) {
            val idCliente = testo(r, "idCliente")
            // chiPaga(): il cliente del rapportino; se non è in anagrafica, il nome scritto sul rapportino.
            val c = oggetti(clienti).firstOrNull { idCliente.isNotEmpty() && testo(it, "id") == idCliente }
            val chiave = "c:" + idCliente.ifEmpty { normalizza(testo(r, "cliente")) }
            if (chiave in gruppi) continue
            gruppi[chiave] = if (c == null) {
                Intestatario(testo(r, "cliente"), emptyList(), "", false)
            } else {
                val piva = testo(c, "partitaIva")
                Intestatario(
                    testo(c, "nome"),
                    listOf(testo(c, "indirizzo"), if (piva.isNotEmpty()) "P.IVA $piva" else "", testo(c, "email")).filter { it.isNotEmpty() },
                    testo(c, "email"),
                    false,
                )
            }
        }
        return gruppi.values.singleOrNull() ?: Intestatario("Vari clienti", emptyList(), "", true)
    }

    /** periodoDi() di app.js: "Ottobre 2026", o "Settembre 2026 – Ottobre 2026" se sono più mesi. */
    fun periodo(rapportini: JSONArray): String {
        val mesi = oggetti(rapportini).map { testo(it, "data").take(7) }.toSortedSet().toList()
        return when (mesi.size) {
            0 -> ""
            1 -> nomeMese(mesi[0])
            else -> nomeMese(mesi.first()) + " – " + nomeMese(mesi.last())
        }
    }

    private val MESI = listOf(
        "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
        "settembre", "ottobre", "novembre", "dicembre",
    )

    /** conti.js nomeMese: "2026-07" -> "Luglio 2026". */
    internal fun nomeMese(m: String): String {
        val x = Regex("""^(\d{4})-(\d{2})""").find(m) ?: return ""
        val nome = MESI.getOrNull(x.groupValues[2].toInt() - 1) ?: return ""
        return nome.replaceFirstChar { it.uppercase() } + " " + x.groupValues[1]
    }

    /** conti.js data: "2026-07-05" -> "05/07/2026". */
    internal fun data(iso: String): String {
        val m = Regex("""^(\d{4})-(\d{2})-(\d{2})""").find(iso) ?: return ""
        return m.groupValues[3] + "/" + m.groupValues[2] + "/" + m.groupValues[1]
    }

    /** conti.js normalizza: solo lettere e cifre minuscole. */
    private fun normalizza(s: String) = s.lowercase().replace(Regex("[^a-z0-9]"), "")

    // Un campo come testo: null del foglio (JSONObject.NULL) e campi mancanti diventano "".
    private fun testo(o: JSONObject, chiave: String): String {
        val v = o.opt(chiave)
        return if (v == null || v == JSONObject.NULL) "" else v.toString()
    }

    private fun oggetti(a: JSONArray): List<JSONObject> = (0 until a.length()).mapNotNull { a.optJSONObject(it) }

    // ---------------------------------------------------------------- margini da @page

    private val MARGINI_DI_RISERVA = doubleArrayOf(14.0, 14.0, 18.0, 14.0)   // mm: sopra, destra, sotto, sinistra

    /**
     * I margini di "@page { margin: … }" del documento, in millesimi di pollice come li
     * vuole Android: [sinistra, sopra, destra, sotto]. Si leggono dal CSS di documenti.js
     * perché a decidere il foglio sia lui, come sul computer.
     */
    internal fun margini(html: String): IntArray {
        val mm = margineCss(html) ?: MARGINI_DI_RISERVA
        val mils = mm.map { (it / 25.4 * 1000).roundToInt() }
        return intArrayOf(mils[3], mils[0], mils[1], mils[2])
    }

    private fun margineCss(html: String): DoubleArray? {
        val pagina = Regex("""@page\s*\{([^{}]*)""").find(html)?.groupValues?.get(1) ?: return null
        val valore = Regex("""(?<![-\w])margin\s*:\s*([^;}]+)""").find(pagina)?.groupValues?.get(1) ?: return null
        val v = valore.trim().split(Regex("""\s+""")).map { inMm(it) ?: return null }
        return when (v.size) {
            1 -> doubleArrayOf(v[0], v[0], v[0], v[0])
            2 -> doubleArrayOf(v[0], v[1], v[0], v[1])
            3 -> doubleArrayOf(v[0], v[1], v[2], v[1])
            4 -> doubleArrayOf(v[0], v[1], v[2], v[3])
            else -> null
        }
    }

    private fun inMm(s: String): Double? {
        val m = Regex("""^(\d+(?:\.\d+)?|\.\d+)(mm|cm|in|pt|px)?$""").find(s) ?: return null
        val n = m.groupValues[1].toDouble()
        return when (m.groupValues[2]) {
            "mm" -> n
            "cm" -> n * 10
            "in" -> n * 25.4
            "pt" -> n * 25.4 / 72
            "px" -> n * 25.4 / 96
            else -> if (n == 0.0) 0.0 else null
        }
    }

    // ---------------------------------------------------------------- la stampa

    private suspend fun stampa(
        ctx: Context,
        chiamata: String,
        nome: String,
        immagine: suspend (String) -> Pair<ByteArray, String>?,
    ): File = unaAllaVolta.withLock {
        val app = ctx.applicationContext
        val pulito = pulisci(nome).ifEmpty { "Documento" }
        val (pronto, provvisorio) = withContext(Dispatchers.IO) {
            val cartella = File(app.cacheDir, "pdf")
            if (!cartella.isDirectory && !cartella.mkdirs()) {
                throw ErroreStampa("Non riesco a salvare il PDF sul telefono: la memoria potrebbe essere piena.")
            }
            File(cartella, "$pulito.pdf") to File.createTempFile("in-corso-", ".tmp", cartella)
        }
        var pagina: StampaPagina? = null
        try {
            val html = withContext(Dispatchers.Main) {
                pagina = StampaPagina.crea(app)
                entro(TEMPO_MODELLO, "Il PDF non si è creato: il modello del documento non si è caricato in tempo. Riprova.") {
                    pagina!!.componi(chiamata)
                }
            }
            val arrivate = scarica(html, immagine)
            withContext(Dispatchers.Main) {
                pagina!!.immagini(arrivate)
                val m = margini(html)
                entro(TEMPO_STAMPA, "Il PDF non si è creato in tempo. Riprova; se il documento ha molte foto, prova senza.") {
                    pagina!!.stampa(html, pulito, provvisorio, PrintAttributes.Margins(m[0], m[1], m[2], m[3]))
                }
            }
            withContext(Dispatchers.IO) {
                if (!pareUnPdf(provvisorio)) throw ErroreStampa("Il PDF è uscito vuoto. Riprova.")
                // Il file vecchio con lo stesso nome si sostituisce solo a PDF finito.
                Files.move(provvisorio.toPath(), pronto.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
            pronto
        } catch (e: ErroreStampa) {
            throw e
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            throw ErroreStampa("Il PDF non si è creato. Riprova; se succede ancora, chiudi e riapri l'app.", e)
        } finally {
            withContext(NonCancellable + Dispatchers.Main) { pagina?.chiudi() }
            withContext(NonCancellable + Dispatchers.IO) { provvisorio.delete() }
        }
    }

    private suspend fun <T : Any> entro(millisecondi: Long, messaggio: String, blocco: suspend () -> T): T =
        withTimeoutOrNull(millisecondi) { blocco() } ?: throw ErroreStampa(messaggio)

    /** Gli id delle immagini /file/<id> che documenti.js ha messo nella pagina. */
    // Gli id di Drive sono lettere, cifre, - e _: encodeURIComponent li lascia come sono.
    internal fun idImmagini(html: String): Set<String> =
        Regex("""src="/file/([A-Za-z0-9_-]{10,})"""").findAll(html).map { it.groupValues[1] }.toSet()

    /** Le scarica prima di caricare la pagina, quattro alla volta: la pagina le trova già tutte. */
    private suspend fun scarica(
        html: String,
        immagine: suspend (String) -> Pair<ByteArray, String>?,
    ): Map<String, Pair<ByteArray, String>> {
        val ids = idImmagini(html)
        if (ids.isEmpty()) return emptyMap()
        val turni = Semaphore(4)
        val arrivate = coroutineScope {
            ids.map { id ->
                async(Dispatchers.IO) {
                    turni.withPermit {
                        val esito = try {
                            withTimeoutOrNull(TEMPO_IMMAGINE) { Arrivata(immagine(id)) }
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            throw ErroreStampa("Non riesco a scaricare le firme e le foto del documento. Controlla la connessione e riprova.", e)
                        } ?: throw ErroreStampa("Le firme e le foto del documento non arrivano: la connessione è lenta. Riprova fra poco.")
                        esito.file?.let { id to it }
                    }
                }
            }.awaitAll()
        }
        return arrivate.filterNotNull().toMap()
    }

    private class Arrivata(val file: Pair<ByteArray, String>?)

    private fun pareUnPdf(f: File): Boolean {
        if (f.length() < 5) return false
        val testa = ByteArray(4)
        f.inputStream().use { if (it.read(testa) != 4) return false }
        return String(testa, Charsets.US_ASCII) == "%PDF"
    }
}
