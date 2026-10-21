package eu.stgm.wisper.rapportino

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.AssetManager
import android.net.Uri
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.print.PrintAttributes
import android.print.StampaSilenziosa
import android.util.Log
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import eu.stgm.wisper.rapportino.Stampa.ErroreStampa
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * La WebView nascosta che fa i PDF, come la "stampante" di Finestra.cs sul computer.
 *
 * Tutto passa da un'origine finta (https://appassets.androidplatform.net, quella che
 * Android riserva a questo uso): da lì vengono conti.js e documenti.js, il carattere
 * (/font/Figtree.ttf, scritto così in documenti.js), le firme e le foto (/file/<id>)
 * e il documento da stampare (/stampa/<id>.html). Nessuna richiesta va in rete.
 *
 * Si usa solo dal thread principale, una alla volta (il Mutex è in Stampa).
 */
internal class StampaPagina private constructor(private val vista: WebView, private val asset: AssetManager) {

    private val documenti = ConcurrentHashMap<String, ByteArray>()
    private val immagini = ConcurrentHashMap<String, Pair<ByteArray, String>>()

    /** Chi aspetta la pagina o la stampa: se la WebView muore, lo si sveglia con l'errore. */
    private var guasto: ((Throwable) -> Unit)? = null
    private var morta = false
    private var attesa: Pair<String, (String?) -> Unit>? = null

    companion object {
        private const val TAG = "Stampa"
        private const val HOST = "appassets.androidplatform.net"
        private const val ORIGINE = "https://$HOST"
        private const val MOTORE = "/stampa/motore.html"

        /** Dove la build mette i modelli del computer (app/build.gradle.kts, copiaModelliPdf). */
        private const val CARTELLA = "ufficio"

        // La pagina che fa scrivere il documento a documenti.js, come il programma del computer.
        private const val PAGINA_MOTORE = "<!doctype html><html lang=\"it\"><head><meta charset=\"utf-8\">" +
            "<script src=\"/conti.js\"></script><script src=\"/documenti.js\"></script></head><body></body></html>"

        @SuppressLint("SetJavaScriptEnabled")
        fun crea(ctx: Context): StampaPagina {
            val vista = try {
                WebView(ctx.applicationContext)
            } catch (e: Exception) {
                // Succede se "Android System WebView" manca o si sta aggiornando.
                throw ErroreStampa("Il PDF non si può creare: manca un pezzo di Android (Android System WebView). Aggiornalo dal Play Store e riprova.", e)
            }
            val pagina = StampaPagina(vista, ctx.applicationContext.assets)
            vista.settings.apply {
                // Serve a documenti.js per scrivere la pagina; il documento stampato invece
                // non può eseguire niente (Content-Security-Policy, sotto).
                javaScriptEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                // Il PDF è uguale per tutti: niente ingrandimento del testo del telefono.
                textZoom = 100
                minimumFontSize = 1
                minimumLogicalFontSize = 1
            }
            vista.webViewClient = pagina.Cliente()
            // Una misura qualsiasi: staccata dallo schermo la WebView resta a 0x0.
            vista.measure(794, 1123)
            vista.layout(0, 0, 794, 1123)
            avvisaSePiedeMancante()
            return pagina
        }

        /**
         * "Pagina X / Y" e il piede stanno nei riquadri di @page (@bottom-left, @bottom-right):
         * Chromium li stampa dalla 131. Prima li salta e il resto del documento esce uguale.
         */
        private fun avvisaSePiedeMancante() {
            val versione = WebView.getCurrentWebViewPackage()?.versionName ?: return
            val principale = versione.substringBefore('.').toIntOrNull() ?: return
            if (principale < 131) Log.w(TAG, "WebView $versione: il PDF esce senza il piede con «Pagina X / Y»")
        }
    }

    /** Fa scrivere a documenti.js l'HTML del documento. [chiamata] è un'espressione JS. */
    suspend fun componi(chiamata: String): String {
        carica(ORIGINE + MOTORE)
        val script = "(function(){try{return{html:$chiamata};}catch(e){return{errore:String(e&&e.stack||e)};}})()"
        val risposta = valuta(script)
        val esito = try {
            JSONTokener(risposta ?: "null").nextValue() as? JSONObject
        } catch (e: Exception) {
            null
        } ?: throw ErroreStampa("Il PDF non si è creato: il modello del documento non si è caricato. Riprova.")
        esito.optString("errore").takeIf { it.isNotEmpty() }?.let {
            Log.e(TAG, "documenti.js: $it")
            throw ErroreStampa("Il PDF non si è creato: il modello non accetta questi dati. Riprova dopo aver aggiornato i dati.")
        }
        return esito.optString("html").takeIf { it.isNotEmpty() }
            ?: throw ErroreStampa("Il PDF non si è creato: il documento è uscito vuoto. Riprova.")
    }

    /** Le firme e le foto già scaricate, da dare alla pagina come /file/<id>. */
    fun immagini(arrivate: Map<String, Pair<ByteArray, String>>) {
        immagini.putAll(arrivate)
    }

    /** Carica [html] e lo stampa in [file]: A4 verticale, margini [margini] (millesimi di pollice). */
    suspend fun stampa(html: String, nome: String, file: File, margini: PrintAttributes.Margins) {
        val id = UUID.randomUUID().toString().replace("-", "")
        documenti[id] = html.toByteArray(Charsets.UTF_8)
        try {
            carica("$ORIGINE/stampa/$id.html")
            aspettaPronta()
            scrivi(nome, file, margini)
        } finally {
            documenti.remove(id)
        }
    }

    fun chiudi() {
        guasto = null
        attesa = null
        try {
            vista.stopLoading()
            vista.destroy()
        } catch (e: Exception) {
            Log.w(TAG, "WebView non chiusa", e)
        }
    }

    // ---------------------------------------------------------------- passi

    private fun vivo() {
        if (morta) throw ErroreStampa("Il PDF non si è creato: il componente che lo prepara si è chiuso. Riprova.")
    }

    /** Aspetta una risposta della WebView; se intanto Chromium si chiude, arriva l'errore. */
    private suspend fun <T> aspetta(avvia: (CancellableContinuation<T>) -> Unit): T {
        vivo()
        return try {
            suspendCancellableCoroutine { cont ->
                guasto = { if (cont.isActive) cont.resumeWithException(it) }
                avvia(cont)
            }
        } finally {
            guasto = null
        }
    }

    private suspend fun carica(url: String) = aspetta<Unit> { cont ->
        attesa = url to { errore ->
            attesa = null
            if (cont.isActive) {
                if (errore == null) cont.resume(Unit)
                else cont.resumeWithException(ErroreStampa("Il PDF non si è creato: la pagina non si è caricata ($errore). Riprova."))
            }
        }
        cont.invokeOnCancellation { attesa = null }
        vista.loadUrl(url)
    }

    private suspend fun valuta(script: String): String? = aspetta { cont ->
        vista.evaluateJavascript(script) { if (cont.isActive) cont.resume(it) }
    }

    /**
     * La pagina è caricata, ma il carattere si chiede solo quando serve per impaginare,
     * e una WebView staccata dallo schermo non impagina da sola: con font-display: block,
     * stampando subito, il testo uscirebbe invisibile. Si forza l'impaginazione e si
     * aspetta che carattere e immagini ci siano (al massimo una decina di secondi).
     */
    private suspend fun aspettaPronta() {
        val prova = "(function(){if(!document.body)return false;document.body.offsetHeight;" +
            "var f=!document.fonts||document.fonts.status==='loaded';" +
            "var i=Array.prototype.every.call(document.images,function(x){return x.complete;});return f&&i;})()"
        repeat(200) {
            when (valuta(prova)) {
                "true" -> return
                "false" -> delay(50)
                // Se la prova non gira (script fermati), si lascia un attimo e si stampa.
                else -> { delay(300); return }
            }
        }
        Log.w(TAG, "carattere o immagini non pronti dopo 10 s: stampo lo stesso")
    }

    private suspend fun scrivi(nome: String, file: File, margini: PrintAttributes.Margins) {
        vivo()
        val adapter = vista.createPrintDocumentAdapter(nome)
        val attributi = PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4.asPortrait())
            .setResolution(PrintAttributes.Resolution("wisper", "300 dpi", 300, 300))
            // La WebView usa questi margini al posto di quelli di @page, o li tiene come
            // riserva se legge il CSS: sono gli stessi, così il foglio esce uguale comunque.
            .setMinMargins(margini)
            .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
            .build()
        val fd = ParcelFileDescriptor.open(
            file,
            ParcelFileDescriptor.MODE_READ_WRITE or ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE,
        )
        var chiudiSubito = false
        try {
            aspetta<Unit> { cont ->
                StampaSilenziosa.scrivi(adapter, attributi, fd, CancellationSignal()) { errore ->
                    chiudiSubito = true
                    if (cont.isActive) {
                        if (errore == null) cont.resume(Unit)
                        else cont.resumeWithException(ErroreStampa("Il PDF non si è creato ($errore). Riprova."))
                    }
                }
            }
        } finally {
            if (chiudiSubito) {
                fd.close()
            } else {
                // Tempo scaduto a metà stampa: Chromium potrebbe ancora scrivere su quel
                // numero di file. Chiuderlo subito vorrebbe dire che un altro file aperto
                // dopo può riceverne il numero e i dati: lo si chiude più tardi.
                Handler(Looper.getMainLooper()).postDelayed({ runCatching { fd.close() } }, 60_000)
            }
        }
    }

    // ---------------------------------------------------------------- il "server" della pagina

    private inner class Cliente : WebViewClient() {

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse =
            try {
                risposta(request)
            } catch (e: Exception) {
                Log.w(TAG, "richiesta non servita: ${request.url}", e)
                vuota(404)
            }

        // La pagina non va da nessuna parte da sola: i link restano fermi.
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true

        override fun onPageFinished(view: WebView, url: String?) {
            val (atteso, fatto) = attesa ?: return
            if (url == atteso) fatto(null)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            val (atteso, fatto) = attesa ?: return
            if (request.url.toString() == atteso) fatto(error.description?.toString() ?: "errore ${error.errorCode}")
        }

        // Senza questo, se Chromium si chiude (memoria finita con decine di foto) si chiude anche l'app.
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            morta = true
            Log.w(TAG, "la WebView dei PDF si è chiusa (crash: ${detail.didCrash()})")
            guasto?.invoke(
                ErroreStampa(
                    "Il PDF non si è creato: il telefono ha chiuso il componente che lo prepara, forse per la memoria. " +
                        "Riprova, o prova senza le foto degli scontrini."
                )
            )
            return true
        }
    }

    private fun risposta(request: WebResourceRequest): WebResourceResponse {
        val uri: Uri = request.url
        if (uri.scheme != "https" || uri.host != HOST || request.method != "GET") return vuota(404)
        val percorso = uri.path ?: return vuota(404)
        return when {
            percorso == MOTORE -> pieno("text/html", PAGINA_MOTORE.toByteArray(Charsets.UTF_8))
            percorso.startsWith("/stampa/") -> {
                val html = documenti[percorso.removePrefix("/stampa/").removeSuffix(".html")] ?: return vuota(404)
                // Come la WebView2 del computer, che stampa con gli script spenti: il documento
                // è HTML fisso e ogni testo del foglio passa da esc(), ma non si sa mai.
                pieno("text/html", html, mapOf("Content-Security-Policy" to "script-src 'none'; object-src 'none'; base-uri 'none'"))
            }
            percorso.startsWith("/file/") -> {
                val id = percorso.removePrefix("/file/").trim('/')
                val (dati, mime) = immagini[id] ?: return vuota(404)
                pieno(mime, dati)
            }
            else -> asset(percorso)
        }
    }

    /** conti.js, documenti.js e il carattere, dagli asset copiati dalla build. */
    private fun asset(percorso: String): WebResourceResponse {
        val relativo = percorso.trimStart('/')
        if (relativo.isEmpty() || relativo.split('/').any { it.isEmpty() || it == "." || it == ".." }) return vuota(404)
        val mime = when (relativo.substringAfterLast('.', "").lowercase()) {
            "js" -> "text/javascript"
            "ttf" -> "font/ttf"
            "css" -> "text/css"
            else -> return vuota(404)
        }
        val flusso = try {
            asset.open("$CARTELLA/$relativo")
        } catch (e: IOException) {
            Log.e(TAG, "manca negli asset: $CARTELLA/$relativo (la build li copia da pc/ui)")
            return vuota(404)
        }
        return WebResourceResponse(mime, if (mime.startsWith("text/")) "utf-8" else null, flusso)
    }

    private fun pieno(mime: String, dati: ByteArray, intestazioni: Map<String, String> = emptyMap()) =
        WebResourceResponse(
            mime, if (mime.startsWith("text/")) "utf-8" else null, 200, "OK",
            intestazioni, ByteArrayInputStream(dati),
        )

    private fun vuota(stato: Int) =
        WebResourceResponse("text/plain", "utf-8", stato, "Non trovato", emptyMap(), ByteArrayInputStream(ByteArray(0)))
}
