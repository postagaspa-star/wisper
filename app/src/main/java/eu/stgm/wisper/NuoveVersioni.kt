package eu.stgm.wisper

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.concurrent.TimeUnit

/**
 * Wisper si aggiorna da solo: un controllo ogni ora (WorkManager, quando c'è rete).
 *
 * Chiede a GitHub, alla pagina delle versioni del progetto, aggiornamento.json:
 * l'elenco delle versioni firmato con la chiave privata di chi pubblica (in
 * wisper-keys, mai nel repo). Senza firma valida non si scarica niente. Se c'è
 * una versione più nuova si scarica l'APK, si controlla che sia proprio quello
 * dell'elenco (SHA-256) e si installa con il PackageInstaller di Android, che a
 * sua volta accetta solo un APK firmato con la stessa chiave dell'app.
 *
 * Si installa solo quando l'app non è davanti e non c'è un rapportino a metà:
 * l'installazione chiude l'app. Da Android 12, dopo il primo aggiornamento fatto
 * da Wisper stesso, non serve più nessun tocco; la prima volta (o se il telefono
 * lo chiede) arriva una notifica "Tocca per installare".
 */
object NuoveVersioni {

    /** La chiave pubblica (wisper-keys/aggiornamenti-pubblica.txt): valgono solo gli elenchi firmati con la sua privata. */
    private const val CHIAVE_PUBBLICA =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEcytO0JAM8WZdBrGMSdnF211vK29aUdNOIhPaPpG9XOj3qSd0aKRi8GRmLsxNAbvTmgbvJ9uZ6gjI7euYqqfC7Q=="

    private const val TAG = "NuoveVersioni"
    const val CANALE = "versioni"
    private const val LAVORO = "controllo-versioni"
    private const val DIMENSIONE_MASSIMA = 200_000_000L

    data class Stato(
        /** Il codice della versione scaricata e pronta da installare, o null. */
        val pronta: Int? = null,
        val nome: String = "",
        /** Il telefono ha chiesto un tocco per installarla. */
        val attesaConferma: Boolean = false,
        val inCorso: Boolean = false,
        val messaggio: String = "",
        val controllato: Long = 0,
    )

    private val _stato = MutableStateFlow(Stato())
    val stato: StateFlow<Stato> = _stato.asStateFlow()

    private val unoAllaVolta = Mutex()
    private val http by lazy {
        OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("versioni", Context.MODE_PRIVATE)
    private fun cartella(ctx: Context) = File(ctx.filesDir, "versioni").apply { mkdirs() }
    private fun fileDi(ctx: Context, codice: Int) = File(cartella(ctx), "wisper-$codice.apk")

    /** All'avvio dell'app: lo stato salvato, e via gli APK già installati. */
    fun carica(ctx: Context) {
        val p = prefs(ctx)
        val codice = p.getInt("pronta", 0)
        val pronta = codice.takeIf { it > BuildConfig.VERSION_CODE && fileDi(ctx, it).exists() }
        if (pronta == null) {
            p.edit().remove("pronta").remove("nome").remove("attesaConferma").apply()
            cartella(ctx).listFiles()?.forEach { it.delete() }
        }
        _stato.value = Stato(
            pronta = pronta,
            nome = if (pronta != null) p.getString("nome", "").orEmpty() else "",
            attesaConferma = pronta != null && p.getBoolean("attesaConferma", false),
            controllato = p.getLong("controllato", 0),
        )
    }

    /** Il controllo ogni ora. KEEP: un'app aggiornata non rimette in coda un secondo controllo. */
    fun programma(ctx: Context) {
        val richiesta = PeriodicWorkRequestBuilder<ControllaVersioni>(1, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(LAVORO, ExistingPeriodicWorkPolicy.KEEP, richiesta)
    }

    /** Chiede se c'è una versione nuova e, se c'è, la scarica. Vero se ce n'è una pronta. */
    suspend fun controlla(ctx: Context): Boolean = withContext(Dispatchers.IO) {
        unoAllaVolta.withLock {
            _stato.value = _stato.value.copy(inCorso = true)
            try {
                val testo = scarica(BuildConfig.AGGIORNAMENTI_URL).use { it.body?.string().orEmpty() }
                val (manifesto, firma) = leggi(testo)
                if (!firmaValida(manifesto, firma)) error("l'elenco delle versioni non ha una firma valida")
                val adesso = System.currentTimeMillis()
                prefs(ctx).edit().putLong("controllato", adesso).apply()

                val android = JSONObject(manifesto).optJSONObject("android")
                val codice = android?.optInt("codice", 0) ?: 0
                if (android == null || codice <= BuildConfig.VERSION_CODE) {
                    _stato.value = _stato.value.copy(inCorso = false, messaggio = "Hai l'ultima versione", controllato = adesso)
                    return@withLock _stato.value.pronta != null
                }
                val nome = android.optString("nome")
                if (_stato.value.pronta == codice) {
                    _stato.value = _stato.value.copy(inCorso = false, controllato = adesso)
                    return@withLock true
                }
                val url = android.optString("url")
                val sha = android.optString("sha256").lowercase()
                val dimensione = android.optLong("dimensione", 0)
                if (!indirizzoAmmesso(url) || sha.length != 64 || dimensione <= 0 || dimensione > DIMENSIONE_MASSIMA) {
                    error("l'elenco delle versioni è incompleto")
                }

                _stato.value = _stato.value.copy(messaggio = "Scarico la versione $nome")
                val destinazione = fileDi(ctx, codice)
                scaricaApk(url, destinazione, sha, dimensione)
                cartella(ctx).listFiles()?.filter { it != destinazione }?.forEach { it.delete() }

                prefs(ctx).edit().putInt("pronta", codice).putString("nome", nome).putBoolean("attesaConferma", false).apply()
                _stato.value = Stato(pronta = codice, nome = nome, messaggio = "La versione $nome è pronta", controllato = adesso)
                Log.i(TAG, "versione $nome ($codice) scaricata")
                true
            } catch (e: java.io.IOException) {
                // Senza rete si riprova fra un'ora, senza disturbare.
                _stato.value = _stato.value.copy(inCorso = false, messaggio = "Non ho raggiunto il server degli aggiornamenti")
                _stato.value.pronta != null
            } catch (e: Exception) {
                Log.w(TAG, "controllo versioni non riuscito", e)
                _stato.value = _stato.value.copy(inCorso = false, messaggio = "L'aggiornamento non è andato: riprovo fra un'ora")
                _stato.value.pronta != null
            }
        }
    }

    private fun scarica(url: String) = http.newCall(Request.Builder().url(url).build()).execute().also {
        if (!it.isSuccessful) { it.close(); throw java.io.IOException("risposta ${it.code}") }
    }

    private fun scaricaApk(url: String, destinazione: File, sha: String, dimensione: Long) {
        val parziale = File(destinazione.parentFile, destinazione.name + ".parziale")
        val digest = MessageDigest.getInstance("SHA-256")
        var scritti = 0L
        scarica(url).use { risposta ->
            val corpo = risposta.body ?: throw java.io.IOException("risposta vuota")
            corpo.byteStream().use { dentro ->
                parziale.outputStream().use { fuori ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val letti = dentro.read(buffer)
                        if (letti < 0) break
                        scritti += letti
                        if (scritti > dimensione) break
                        digest.update(buffer, 0, letti)
                        fuori.write(buffer, 0, letti)
                    }
                }
            }
        }
        val impronta = digest.digest().joinToString("") { "%02x".format(it) }
        if (scritti != dimensione || impronta != sha) {
            parziale.delete()
            error("il file scaricato non è quello dell'elenco delle versioni")
        }
        if (!parziale.renameTo(destinazione)) { destinazione.delete(); parziale.renameTo(destinazione) }
    }

    /** Si scarica solo in https; in chiaro solo dal computer delle prove (l'emulatore lo vede a 10.0.2.2). */
    private fun indirizzoAmmesso(url: String): Boolean {
        val u = runCatching { URI(url) }.getOrNull() ?: return false
        if (u.scheme == "https") return true
        val prove = setOf("10.0.2.2", "localhost", "127.0.0.1")
        val elenco = runCatching { URI(BuildConfig.AGGIORNAMENTI_URL) }.getOrNull()
        return u.scheme == "http" && u.host in prove && elenco?.scheme == "http" && elenco.host in prove
    }

    /** aggiornamento.json: { "manifesto": "<json come testo>", "firma": "<base64>" }. */
    fun leggi(testo: String): Pair<String, String> {
        val o = JSONObject(testo)
        return o.optString("manifesto") to o.optString("firma")
    }

    fun firmaValida(manifesto: String, firma: String, chiave: String = CHIAVE_PUBBLICA): Boolean {
        if (manifesto.isEmpty() || firma.isEmpty()) return false
        return runCatching {
            val base64 = java.util.Base64.getMimeDecoder()
            val pubblica = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(base64.decode(chiave)))
            Signature.getInstance("SHA256withECDSA").run {
                initVerify(pubblica)
                update(manifesto.toByteArray(Charsets.UTF_8))
                verify(base64.decode(firma))
            }
        }.getOrDefault(false)
    }

    /**
     * Ci si può installare adesso? Solo con l'app chiusa o dietro, e senza un
     * rapportino a metà: l'installazione chiude l'app.
     */
    fun momentoGiusto(ctx: Context): Boolean =
        !WisperApp.davanti.value && !File(ctx.filesDir, "modulo-in-corso.json").exists()

    /** Installa la versione pronta. Con [chiesto] è l'utente che l'ha toccato: la conferma si apre subito. */
    fun installa(ctx: Context, chiesto: Boolean = false) {
        val codice = _stato.value.pronta ?: return
        val apk = fileDi(ctx, codice)
        if (!apk.exists()) { carica(ctx); return }
        if (chiesto) prefs(ctx).edit().putBoolean("chiesto", true).apply()
        try {
            val installatore = ctx.packageManager.packageInstaller
            val parametri = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                setAppPackageName(ctx.packageName)
                setSize(apk.length())
                // Da Android 12 un'app che ha installato sé stessa si aggiorna senza chiedere niente.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            val id = installatore.createSession(parametri)
            installatore.openSession(id).use { sessione ->
                sessione.openWrite("wisper.apk", 0, apk.length()).use { fuori ->
                    apk.inputStream().use { it.copyTo(fuori) }
                    sessione.fsync(fuori)
                }
                val esito = PendingIntent.getBroadcast(
                    ctx, id, Intent(ctx, EsitoInstallazione::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0),
                )
                sessione.commit(esito.intentSender)
            }
            Log.i(TAG, "installo la versione $codice")
        } catch (e: Exception) {
            Log.w(TAG, "installazione non partita", e)
            _stato.value = _stato.value.copy(messaggio = "L'installazione non è partita: riprovo più tardi")
        }
    }

    internal fun serveConferma(ctx: Context, conferma: Intent?) {
        prefs(ctx).edit().putBoolean("attesaConferma", true).apply()
        _stato.value = _stato.value.copy(attesaConferma = true)
        conferma ?: return
        conferma.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val chiesto = prefs(ctx).getBoolean("chiesto", false)
        prefs(ctx).edit().remove("chiesto").apply()
        if (chiesto && WisperApp.davanti.value) {
            // L'ha appena toccato: la richiesta del telefono si apre subito.
            runCatching { ctx.startActivity(conferma) }.onSuccess { return }
        }
        val gestore = ctx.getSystemService(NotificationManager::class.java)
        gestore.createNotificationChannel(NotificationChannel(CANALE, ctx.getString(R.string.canale_versioni), NotificationManager.IMPORTANCE_DEFAULT))
        val tocco = PendingIntent.getActivity(ctx, 7, conferma, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val nome = _stato.value.nome
        val notifica = Notification.Builder(ctx, CANALE)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Versione nuova di Wisper")
            .setContentText("La $nome è pronta: tocca per installarla")
            .setContentIntent(tocco)
            .setAutoCancel(true)
            .build()
        runCatching { gestore.notify(7, notifica) }
    }

    internal fun installazioneFallita(ctx: Context, messaggio: String?) {
        Log.w(TAG, "installazione non riuscita: $messaggio")
        _stato.value = _stato.value.copy(attesaConferma = false, messaggio = "L'installazione non è andata: riprovo più tardi")
        prefs(ctx).edit().putBoolean("attesaConferma", false).apply()
    }
}

/** Il controllo di ogni ora. Se c'è una versione pronta e il momento è giusto, la installa. */
class ControllaVersioni(ctx: Context, parametri: WorkerParameters) : CoroutineWorker(ctx, parametri) {
    override suspend fun doWork(): Result {
        val pronta = NuoveVersioni.controlla(applicationContext)
        if (pronta && NuoveVersioni.momentoGiusto(applicationContext)) NuoveVersioni.installa(applicationContext)
        return Result.success()
    }
}

/** Le risposte del PackageInstaller: fatto, serve un tocco, o non è andata. */
class EsitoInstallazione : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val conferma = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                else intent.getParcelableExtra(Intent.EXTRA_INTENT)
                NuoveVersioni.serveConferma(ctx, conferma)
            }
            PackageInstaller.STATUS_SUCCESS -> Log.i("NuoveVersioni", "installata")
            else -> NuoveVersioni.installazioneFallita(ctx, intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
        }
    }
}
