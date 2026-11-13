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
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import eu.stgm.wisper.rapportino.UnaVoltaPerCodice
import eu.stgm.wisper.rapportino.Versioni
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
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
 * Wisper si aggiorna da solo. Dal 03/11/2026 (1.1.0, progetti.md §6) non controlla piu' ogni ora: e' il NAS ad
 * annunciare le versioni nuove, in ogni risposta e col campanello (AnnuncioVersioni). Quando il server dice un codice
 * piu' alto di questo, il controllo qui sotto parte una volta sola per quel codice; "Controlla" nelle Impostazioni resta.
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
 *
 * 13/11/2026 (Andrea: "da telefono non viene nemmeno la notifica di aggiornamento, e quindi i telefoni restano fermi"):
 * - l'attesa "dietro da un minuto" la tiene WorkManager ([InstallaVersione]): prima era un'attesa dentro l'app, e Android
 *   la fermava insieme all'app, così l'installazione non partiva mai;
 * - ad app chiusa ci pensa il controllo di ogni 15 minuti ([inSottofondo]): installa la versione già scaricata e, se
 *   nessuno ha guardato da sei ore, legge l'elenco firmato;
 * - quando serve un tocco (la prima volta, o un rapportino a metà) arriva la notifica "Versione nuova di Wisper", che
 *   apre Wisper e fa partire l'installazione ([avvisaPronta]); dopo l'installazione "Wisper aggiornato" ([avvisaInstallata]);
 * - la Casa mostra la versione pronta sempre, e nelle Impostazioni c'è "Controlla aggiornamenti".
 */
object NuoveVersioni {

    /** La chiave pubblica (wisper-keys/aggiornamenti-pubblica.txt): valgono solo gli elenchi firmati con la sua privata. */
    private const val CHIAVE_PUBBLICA =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEcytO0JAM8WZdBrGMSdnF211vK29aUdNOIhPaPpG9XOj3qSd0aKRi8GRmLsxNAbvTmgbvJ9uZ6gjI7euYqqfC7Q=="

    private const val TAG = "NuoveVersioni"
    const val CANALE = "versioni"
    /** Il controllo di ogni ora delle versioni di prima: dalla 1.1.0 si toglie all'avvio. */
    private const val LAVORO = "controllo-versioni"
    private const val DIMENSIONE_MASSIMA = 200_000_000L

    /** Quanto deve restare dietro l'app prima di installare: una foto o un'altra app di passaggio non chiudono Wisper. */
    private const val DIETRO_DA_MS = 60_000L
    private const val LAVORO_INSTALLA = "installa-versione"
    /** Ad app chiusa, se nessuno ha guardato l'elenco delle versioni da tanto, lo guarda il controllo in sottofondo. */
    private const val OGNI_QUANTO_MS = 6 * 60 * 60 * 1000L
    /** La notifica "tocca per installarla" non torna prima di un giorno, se la si è tolta senza installare. */
    private const val AVVISO_OGNI_MS = 24 * 60 * 60 * 1000L
    private const val CHIESTO_VALE_MS = 2 * 60 * 1000L
    private const val NOTIFICA = 7
    private const val NOTIFICA_FATTA = 8
    /** Nell'intent che apre Wisper dalla notifica: installa la versione pronta. */
    const val EXTRA_INSTALLA = "eu.stgm.wisper.installa"

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
        // La prima volta su questo telefono: la versione di adesso e' quella "vista" (niente "Wisper aggiornato" per lei).
        if (p.getInt("codiceVisto", 0) == 0) p.edit().putInt("codiceVisto", BuildConfig.VERSION_CODE).apply()
    }

    /** Il controllo ogni ora delle versioni di prima: dalla 1.1.0 lo annuncia il NAS, il lavoro si toglie all'avvio. */
    fun togliControlloOrario(ctx: Context) {
        runCatching { WorkManager.getInstance(ctx).cancelUniqueWork(LAVORO) }
    }

    private val ambito = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val unaVolta = UnaVoltaPerCodice(BuildConfig.VERSION_CODE)

    /** "controllato oggi alle 10:05", "controllato ieri alle 18:20", "controllato il 12/11"; vuoto se mai. */
    fun quandoControllato(millis: Long, adesso: java.time.LocalDateTime = java.time.LocalDateTime.now()): String {
        if (millis <= 0) return ""
        val t = java.time.Instant.ofEpochMilli(millis).atZone(java.time.ZoneId.systemDefault()).toLocalDateTime()
        val ora = t.format(java.time.format.DateTimeFormatter.ofPattern("H:mm"))
        return when (t.toLocalDate()) {
            adesso.toLocalDate() -> "controllato oggi alle $ora"
            adesso.toLocalDate().minusDays(1) -> "controllato ieri alle $ora"
            else -> "controllato il " + t.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM"))
        }
    }

    /** L'ultimo controllo e' arrivato fino in fondo (elenco letto e firma buona): per lo stesso codice non si rifa'. */
    @Volatile
    private var ultimoRiuscito = false

    /**
     * Il NAS ha detto le versioni (in una risposta o dal campanello). Se il telefono e' indietro, il controllo parte una
     * volta sola per quel codice; la versione scaricata si installa al momento giusto. Nessun avviso a schermo.
     */
    fun annunciata(ctx: Context, v: Versioni) {
        val codice = v.codiceAndroid
        if (codice <= BuildConfig.VERSION_CODE) return
        if (_stato.value.pronta == codice) { installaAlMomentoGiusto(ctx); return }
        if (!unaVolta.daFare(codice)) return
        Log.i(TAG, "il NAS annuncia la versione ${v.nomeAndroid} ($codice): controllo, una volta sola")
        ambito.launch {
            val pronta = controlla(ctx)
            unaVolta.esito(codice, ultimoRiuscito)
            if (pronta) installaAlMomentoGiusto(ctx)
        }
    }

    /**
     * Installa la versione pronta quando l'app e' dietro da un minuto e non c'e' un rapportino a meta' ([momentoGiusto]):
     * l'installazione chiude l'app. L'attesa la tiene WorkManager, che riparte anche se Android ha fermato l'app. Con
     * l'app davanti non parte niente (lo dice la Casa): parte quando l'app va dietro ([davantiCambiato]).
     */
    fun installaAlMomentoGiusto(ctx: Context) {
        if (_stato.value.pronta == null) return
        if (WisperApp.davanti.value) { annullaInstallazione(ctx); return }
        val lavoro = OneTimeWorkRequestBuilder<InstallaVersione>().setInitialDelay(DIETRO_DA_MS, TimeUnit.MILLISECONDS).build()
        runCatching { WorkManager.getInstance(ctx).enqueueUniqueWork(LAVORO_INSTALLA, ExistingWorkPolicy.REPLACE, lavoro) }
    }

    private fun annullaInstallazione(ctx: Context) {
        runCatching { WorkManager.getInstance(ctx).cancelUniqueWork(LAVORO_INSTALLA) }
    }

    /** L'app e' passata davanti o dietro (WisperApp): dietro parte l'attesa, davanti si ferma. */
    fun davantiCambiato(ctx: Context, davanti: Boolean) {
        if (davanti) annullaInstallazione(ctx) else installaAlMomentoGiusto(ctx)
    }

    /**
     * Dal lavoro in sottofondo, con l'app dietro o chiusa: installa se si puo'. Se Android ha gia' detto che vuole un tocco,
     * o c'e' un rapportino a meta', lo dice la notifica (il tocco apre Wisper e installa).
     */
    internal fun provaAInstallare(ctx: Context) {
        if (_stato.value.pronta == null || WisperApp.davanti.value) return
        if (_stato.value.attesaConferma || !momentoGiusto(ctx)) avvisaPronta(ctx) else installa(ctx)
    }

    /**
     * Dal controllo di ogni 15 minuti (ControlloNotifiche), anche ad app chiusa e per tutti: una versione gia' scaricata si
     * installa; se da sei ore nessuno ha guardato l'elenco firmato (il NAS non ha potuto annunciare niente: app chiusa,
     * notifiche spente) lo si guarda adesso. Con l'app davanti non fa niente.
     */
    suspend fun inSottofondo(ctx: Context) {
        if (WisperApp.davanti.value) return
        if (_stato.value.pronta == null) {
            if (System.currentTimeMillis() - prefs(ctx).getLong("controllato", 0) < OGNI_QUANTO_MS) return
            controlla(ctx)
        }
        provaAInstallare(ctx)
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
                ultimoRiuscito = true

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
                // Senza rete si riprova al prossimo annuncio del NAS (dopo un'ora per lo stesso codice), senza disturbare.
                ultimoRiuscito = false
                _stato.value = _stato.value.copy(inCorso = false, messaggio = "Non ho raggiunto il server degli aggiornamenti")
                _stato.value.pronta != null
            } catch (e: Exception) {
                ultimoRiuscito = false
                Log.w(TAG, "controllo versioni non riuscito", e)
                _stato.value = _stato.value.copy(inCorso = false, messaggio = "L'aggiornamento non è andato: riprovo più tardi")
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
        // "L'ha chiesto la persona" vale due minuti: e' un'ora, non un si'/no, cosi' l'esito di un'installazione di prima
        // buttata via qui sotto (che arriva come "annullata") non lo cancella.
        if (chiesto) prefs(ctx).edit().putLong("chiestoIl", System.currentTimeMillis()).apply()
        if (chiesto) runCatching { ctx.getSystemService(NotificationManager::class.java).cancel(NOTIFICA) }
        try {
            val installatore = ctx.packageManager.packageInstaller
            // Le installazioni lasciate a meta' (una conferma mai data) si buttano: ne resta una sola.
            runCatching { installatore.mySessions.forEach { installatore.abandonSession(it.sessionId) } }
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
            if (!WisperApp.davanti.value) avvisaPronta(ctx)
        }
    }

    internal fun serveConferma(ctx: Context, conferma: Intent?) {
        prefs(ctx).edit().putBoolean("attesaConferma", true).apply()
        _stato.value = _stato.value.copy(attesaConferma = true)
        val chiesto = System.currentTimeMillis() - prefs(ctx).getLong("chiestoIl", 0) < CHIESTO_VALE_MS
        prefs(ctx).edit().remove("chiestoIl").apply()
        if (conferma != null && chiesto) {
            // L'ha appena toccato (dalla Casa, dalle Impostazioni o dalla notifica): la richiesta del telefono si apre subito.
            conferma.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runCatching { ctx.startActivity(conferma) }.onSuccess { return }
        }
        // Nessuno l'ha chiesto adesso (l'installazione in sottofondo): la notifica, che apre Wisper e ci riprova con la persona davanti.
        avvisaPronta(ctx, subito = true)
    }

    private fun puoAvvisare(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun canale(ctx: Context): NotificationManager = ctx.getSystemService(NotificationManager::class.java).also {
        it.createNotificationChannel(NotificationChannel(CANALE, ctx.getString(R.string.canale_versioni), NotificationManager.IMPORTANCE_DEFAULT))
    }

    /**
     * "Versione nuova di Wisper · La 1.4.2 è pronta: tocca per installarla". Il tocco apre Wisper, che fa partire
     * l'installazione con la persona davanti ([EXTRA_INSTALLA]). Una volta al giorno per versione al massimo ([subito]: la
     * prima volta che Android chiede il tocco, sempre).
     */
    internal fun avvisaPronta(ctx: Context, subito: Boolean = false) {
        val codice = _stato.value.pronta ?: return
        if (!puoAvvisare(ctx)) return
        val p = prefs(ctx)
        val adesso = System.currentTimeMillis()
        val giaDetta = p.getInt("avvisata", 0) == codice
        if (giaDetta && (!subito || adesso - p.getLong("avvisataIl", 0) < 60_000) && adesso - p.getLong("avvisataIl", 0) < AVVISO_OGNI_MS) return
        p.edit().putInt("avvisata", codice).putLong("avvisataIl", adesso).apply()
        val tocco = PendingIntent.getActivity(
            ctx, NOTIFICA,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra(EXTRA_INSTALLA, true),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notifica = Notification.Builder(ctx, CANALE)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Versione nuova di Wisper")
            .setContentText("La ${_stato.value.nome} è pronta: tocca per installarla")
            .setContentIntent(tocco)
            .setAutoCancel(true)
            .build()
        runCatching { canale(ctx).notify(NOTIFICA, notifica) }
    }

    /**
     * Dopo che Android ha messo la versione nuova (MY_PACKAGE_REPLACED): "Wisper aggiornato". L'installazione chiude
     * l'app e non la riapre: il tocco la riapre. Una volta per versione.
     */
    internal fun avvisaInstallata(ctx: Context) {
        val p = prefs(ctx)
        val prima = p.getInt("codiceVisto", 0)
        p.edit().putInt("codiceVisto", BuildConfig.VERSION_CODE).remove("avvisata").remove("avvisataIl").apply()
        if (prima == BuildConfig.VERSION_CODE || !puoAvvisare(ctx)) return
        val gestore = canale(ctx)
        gestore.cancel(NOTIFICA)
        val tocco = PendingIntent.getActivity(
            ctx, NOTIFICA_FATTA, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notifica = Notification.Builder(ctx, CANALE)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Wisper aggiornato")
            .setContentText("Ora hai la versione ${BuildConfig.VERSION_NAME}")
            .setContentIntent(tocco)
            .setAutoCancel(true)
            .build()
        runCatching { gestore.notify(NOTIFICA_FATTA, notifica) }
    }

    internal fun installazioneFallita(ctx: Context, messaggio: String?) {
        Log.w(TAG, "installazione non riuscita: $messaggio")
        _stato.value = _stato.value.copy(attesaConferma = false, messaggio = "L'installazione non è andata: riprovo più tardi")
        prefs(ctx).edit().putBoolean("attesaConferma", false).apply()
    }

    /**
     * Un'installazione annullata: l'ha buttata via [installa] per farne una nuova, oppure la persona ha detto no alla
     * richiesta del telefono. La versione resta pronta, senza frasi d'errore: la Casa e le Impostazioni la offrono ancora.
     */
    internal fun installazioneAnnullata() {
        Log.i(TAG, "installazione annullata: la versione resta pronta")
    }
}

/** L'installazione della versione pronta dopo un minuto con l'app dietro (13/11/2026): la tiene WorkManager. */
class InstallaVersione(ctx: Context, parametri: WorkerParameters) : CoroutineWorker(ctx, parametri) {
    override suspend fun doWork(): Result {
        NuoveVersioni.provaAInstallare(applicationContext)
        return Result.success()
    }
}

/** Android ha messo la versione nuova: lo dice una notifica (l'app e' stata chiusa dall'installazione). */
class VersioneInstallata : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) NuoveVersioni.avvisaInstallata(ctx)
    }
}

/**
 * Il controllo di ogni ora delle versioni di prima della 1.1.0. Resta la classe perche' WorkManager puo' ancora avere in
 * coda il lavoro salvato: se parte prima che l'avvio lo tolga, non fa niente e si toglie (progetti.md §6).
 */
class ControllaVersioni(ctx: Context, parametri: WorkerParameters) : CoroutineWorker(ctx, parametri) {
    override suspend fun doWork(): Result {
        NuoveVersioni.togliControlloOrario(applicationContext)
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
            PackageInstaller.STATUS_FAILURE_ABORTED -> NuoveVersioni.installazioneAnnullata()
            else -> NuoveVersioni.installazioneFallita(ctx, intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
        }
    }
}
