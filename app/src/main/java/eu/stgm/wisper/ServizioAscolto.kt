package eu.stgm.wisper

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Il servizio che tiene Wisper in ascolto anche ad app chiusa.
 *
 * PERCHE' ESISTE. Prima il rilevatore viveva dentro la schermata: chiudendo
 * l'app la schermata veniva distrutta e la parola magica moriva con lei.
 * Wisper sentiva solo mentre lo stavi gia' guardando — l'esatto contrario di
 * quello che serve a un tecnico con le mani occupate.
 *
 * Qui dentro vive il giro completo, non solo l'orecchio: la conversazione
 * funziona per intero senza nessuna schermata aperta, perche' e' tutta voce.
 * La schermata, quando c'e', si limita a guardare.
 *
 * La notifica persistente non e' un fastidio da sopportare: da Android 8 e'
 * il prezzo per poter tenere il microfono acceso, ed e' anche l'unico modo
 * che l'utente ha di sapere che Wisper sta ascoltando. Onesto che si veda.
 */
class ServizioAscolto : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var giroLocale: GiroWisper

    override fun onCreate() {
        super.onCreate()
        avviaInPrimoPiano()

        giroLocale = GiroWisper(
            ctx = applicationContext,
            scope = scope,
            registro = { tipo, dettaglio ->
                Log.i("Wisper", if (dettaglio.isBlank()) tipo else "$tipo: $dettaglio")
            },
            // Quando parte una conversazione, la schermata va portata davanti:
            // il tecnico non la sta guardando, ma chi gli sta accanto — e la
            // telecamera — devono vedere i campi riempirsi.
            onSveglia = { portaAvanti() },
        )
        giroLocale.avvia()
        _giro.value = giroLocale

        // La notifica racconta lo stato: in ascolto, sto capendo, sto parlando.
        // A ogni cambio di fase si ricontrolla anche di chi debba essere il
        // microfono: appena una conversazione finisce puo' darsi che vada
        // ceduto a un'altra app che nel frattempo e' passata davanti.
        scope.launch {
            giroLocale.fase.collect { aggiornaNotifica(it); rivaluta("fase") }
        }

        // Chi e' davanti agli occhi dell'utente. Se non e' Wisper, il microfono
        // non e' suo.
        scope.launch {
            WisperApp.davanti.collect { rivaluta("davanti") }
        }

        // Schermo spento a meta' conversazione = "ho finito". Si chiude il giro
        // e si torna ad aspettare la parola magica. Senza questo il microfono
        // resta acceso in tasca e raccoglie i discorsi di chi sta intorno.
        // Attenzione: NON spegne la parola magica — dire "Wisper" a schermo
        // spento deve continuare a funzionare, e' il senso del progetto.
        ContextCompat.registerReceiver(
            this, schermo,
            IntentFilter(Intent.ACTION_SCREEN_OFF).apply { addAction(Intent.ACTION_SCREEN_ON) },
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )

        // Le telefonate non si vedono dallo schermo: durante una chiamata lo
        // schermo e' spento, perche' hai il telefono contro l'orecchio.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audio.addOnModeChangedListener(mainExecutor, ascoltaModo)
        }

        rivaluta("avvio")
    }

    private val audio by lazy { getSystemService(android.media.AudioManager::class.java) }

    private val ascoltaModo = android.media.AudioManager.OnModeChangedListener { rivaluta("modo audio") }

    private val schermo = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            if (i?.action == Intent.ACTION_SCREEN_OFF) giroLocale.interrompi()
            rivaluta("schermo")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            AZIONE_PARLA -> giroLocale.apriAMano()
            AZIONE_PAUSA -> { aMano = true; rivaluta("pausa a mano") }
            AZIONE_RIPRENDI -> { aMano = false; rivaluta("ripresa a mano") }
        }
        // START_STICKY: se Android lo uccide per fare spazio, lo riavvia.
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(schermo) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching { audio.removeOnModeChangedListener(ascoltaModo) }
        }
        _giro.value = null
        giroLocale.spegni()
        scope.cancel()
        super.onDestroy()
    }

    // ------------------------------------------------- di chi e' il microfono

    /** Messo in pausa dall'utente col pulsante nella notifica. */
    private var aMano = false

    /** L'ultimo motivo per cui si e' ceduto, per scriverlo nella notifica. */
    private var motivoCessione: String? = null

    private val mano = android.os.Handler(android.os.Looper.getMainLooper())
    private val ricontrollo = Runnable { applica(motivoAttuale(), "ricontrollo") }

    /**
     * Il motivo per cui in questo istante il microfono non dovrebbe essere di
     * Wisper, oppure null se puo' tenerselo.
     *
     * LA REGOLA, in una riga: Wisper ascolta a schermo spento, oppure quando
     * e' lui l'app che stai guardando. Se stai usando il telefono per altro, o
     * sei in chiamata, si fa da parte.
     *
     * Perche' proprio questa. Il caso per cui Wisper esiste e' il tecnico col
     * telefono in tasca e le mani occupate: schermo spento, e li' deve sentire.
     * Tutti i casi in cui rubava il microfono agli altri — un vocale su
     * WhatsApp, un video, l'assistente di Google — hanno invece lo schermo
     * acceso e un'altra app davanti. Le due situazioni non si sovrappongono
     * mai, quindi la regola non toglie niente a nessuna delle due.
     *
     * Le chiamate stanno a parte perche' hanno lo schermo spento esattamente
     * come la tasca: si riconoscono dal modo audio del sistema, non da li'.
     *
     * Mentre una conversazione e' in corso non si cede per "un'altra app
     * davanti": o Wisper e' davanti, o l'utente e' passato ad altro e allora
     * gli basta spegnere lo schermo, che chiude gia' tutto.
     */
    private fun motivoAttuale(): String? {
        val schermoAcceso = getSystemService(android.os.PowerManager::class.java).isInteractive
        val alTelefono = audio.mode != android.media.AudioManager.MODE_NORMAL
        val altrove = schermoAcceso &&
            !WisperApp.davanti.value &&
            giroLocale.fase.value == Fase.RIPOSO
        return when {
            aMano -> "l'hai messo in pausa"
            alTelefono -> "sei in chiamata"
            altrove -> ALTROVE
            else -> null
        }
    }

    private fun rivaluta(perche: String) {
        mano.removeCallbacks(ricontrollo)
        val motivo = motivoAttuale()

        // Svegliandosi da solo, Wisper accende lo schermo e POI porta avanti la
        // propria schermata. Nel mezzo c'e' un istante identico a "l'utente sta
        // usando un'altra app", e cedendo subito Wisper si ammazzerebbe appena
        // sveglio. Un secondo di pazienza distingue le due cose e non costa
        // niente: nessuno registra un vocale entro un secondo dall'aver aperto
        // WhatsApp. Riprendersi il microfono invece e' sempre immediato.
        if (motivo == ALTROVE && motivoCessione == null) {
            mano.postDelayed(ricontrollo, ATTESA_ALTROVE)
            return
        }
        applica(motivo, perche)
    }

    private fun applica(motivo: String?, perche: String) {
        if (motivo == motivoCessione) return
        motivoCessione = motivo

        if (motivo != null) giroLocale.cediMicrofono("$motivo ($perche)")
        else giroLocale.riprendiMicrofono(perche)

        aggiornaNotifica(giroLocale.fase.value)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ---- notifica ----

    /**
     * Il tipo dichiarato al sistema decide cosa il servizio puo' toccare.
     *
     * Microfono e' ovvio. La POSIZIONE meno, e senza costava la funzione piu'
     * bella: a un'app che non e' in primo piano Android non da' la posizione,
     * quindi riconoscere il cantiere funzionava solo aprendo l'app a mano.
     * Svegliando Wisper col telefono in tasca — cioe' sempre, nell'uso vero —
     * l'ultima posizione nota tornava vuota e apriva col saluto generico.
     * Misurato il 09/08: a schermo acceso 43 m dal cantiere, a schermo spento
     * "il telefono non ha nessuna posizione nota".
     *
     * Il permesso resta quello di sempre, "solo mentre l'app e' in uso": il
     * servizio in primo piano *e'* l'app in uso. Nessun tracciamento di sfondo.
     */
    private fun avviaInPrimoPiano() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val tipi = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                if (posizioneConcessa()) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
            startForeground(ID_NOTIFICA, costruisciNotifica(Fase.RIPOSO), tipi)
        } else {
            startForeground(ID_NOTIFICA, costruisciNotifica(Fase.RIPOSO))
        }
    }

    /**
     * Dichiarare il tipo "posizione" senza averne il permesso fa morire il
     * servizio all'avvio con un'eccezione, e Wisper non parte piu'. Meglio
     * partire senza quella funzione che non partire.
     */
    private fun posizioneConcessa(): Boolean =
        ContextCompat.checkSelfPermission(
            this, android.Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                this, android.Manifest.permission.ACCESS_FINE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED

    private fun costruisciNotifica(fase: Fase): Notification {
        val apri = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val parla = PendingIntent.getService(
            this, 1,
            Intent(this, ServizioAscolto::class.java).setAction(AZIONE_PARLA),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val interruttore = PendingIntent.getService(
            this, 3,
            Intent(this, ServizioAscolto::class.java)
                .setAction(if (aMano) AZIONE_RIPRENDI else AZIONE_PAUSA),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        // Quando il microfono e' di qualcun altro va detto, e va detto perche':
        // una notifica che dice "In ascolto" mentre non ascolta e' una bugia,
        // e sarebbe l'unica cosa che l'utente ha per capire cosa sta succedendo.
        val testo = motivoCessione?.let { "In pausa, $it" } ?: when (fase) {
            Fase.RIPOSO -> "In ascolto — di' «Wisper»"
            Fase.ASCOLTO -> "Ti sto ascoltando"
            Fase.PENSA -> "Sto capendo…"
            Fase.PARLA -> "Sto rispondendo"
            Fase.SALVA -> "Salvo sul foglio"
        }
        return NotificationCompat.Builder(this, WisperApp.CANALE_ASCOLTO)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Wisper")
            .setContentText(testo)
            .setContentIntent(apri)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .addAction(0, "Parla", parla)
            .addAction(0, if (aMano) "Riprendi" else "Pausa", interruttore)
            .build()
    }

    private fun aggiornaNotifica(fase: Fase) {
        getSystemService(NotificationManager::class.java)
            .notify(ID_NOTIFICA, costruisciNotifica(fase))
    }

    /**
     * Porta la schermata davanti quando parte una conversazione.
     *
     * Da Android 10 un'app in sottofondo non puo' aprire una schermata a
     * piacimento. Un servizio in primo piano di tipo microfono e' fra i casi
     * ammessi, ma non su tutti i telefoni: se il sistema rifiuta, la voce
     * continua a funzionare lo stesso — e' tutta la parte che conta — e resta
     * la notifica da toccare.
     */
    private fun portaAvanti() {
        val apri = PendingIntent.getActivity(
            this, 2,
            Intent(this, MainActivity::class.java).addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            ),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        // Prima si prova la strada diretta: funziona quando l'app e' gia' in
        // primo piano o appena uscita.
        runCatching {
            startActivity(
                Intent(this, MainActivity::class.java).addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                )
            )
        }

        // Poi la notifica a schermo intero, che e' il meccanismo delle
        // chiamate: e' l'unico che Android accetta da un servizio in
        // sottofondo, e funziona anche a telefono bloccato. Se il permesso
        // non c'e' degrada da sola in un avviso in cima allo schermo: la voce
        // funziona comunque, si perde solo l'apertura automatica.
        val n = NotificationCompat.Builder(this, WisperApp.CANALE_SVEGLIA)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Wisper")
            .setContentText("Ti sto ascoltando")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(apri, true)
            .setContentIntent(apri)
            .setAutoCancel(true)
            .setTimeoutAfter(8_000)
            .build()
        runCatching {
            getSystemService(NotificationManager::class.java).notify(ID_SVEGLIA, n)
        }.onFailure { Log.w("Wisper", "sveglia non mostrata: ${it.message}") }
    }

    companion object {
        private const val ID_NOTIFICA = 1
        private const val ID_SVEGLIA = 2
        const val AZIONE_PARLA = "eu.stgm.wisper.PARLA"
        const val AZIONE_PAUSA = "eu.stgm.wisper.PAUSA"
        const val AZIONE_RIPRENDI = "eu.stgm.wisper.RIPRENDI"

        private const val ALTROVE = "stai usando il telefono"
        private const val ATTESA_ALTROVE = 1_200L

        /**
         * Il giro vive nel servizio, non nella schermata. La schermata lo
         * guarda da qui: cosi' puo' aprirsi e chiudersi quante volte vuole
         * senza che la conversazione ne risenta.
         */
        private val _giro = MutableStateFlow<GiroWisper?>(null)
        val giro: StateFlow<GiroWisper?> = _giro.asStateFlow()

        fun accendi(ctx: Context) {
            ContextCompat.startForegroundService(
                ctx, Intent(ctx, ServizioAscolto::class.java),
            )
        }
    }
}
