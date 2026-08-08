package eu.stgm.wisper

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
        scope.launch {
            giroLocale.fase.collect { aggiornaNotifica(it) }
        }

        // Schermo spento a meta' conversazione = "ho finito". Si chiude il giro
        // e si torna ad aspettare la parola magica. Senza questo il microfono
        // resta acceso in tasca e raccoglie i discorsi di chi sta intorno.
        // Attenzione: NON spegne la parola magica — dire "Wisper" a schermo
        // spento deve continuare a funzionare, e' il senso del progetto.
        ContextCompat.registerReceiver(
            this, schermoSpento, IntentFilter(Intent.ACTION_SCREEN_OFF),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    private val schermoSpento = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) = giroLocale.interrompi()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == AZIONE_PARLA) giroLocale.apriAMano()
        // START_STICKY: se Android lo uccide per fare spazio, lo riavvia.
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(schermoSpento) }
        _giro.value = null
        giroLocale.spegni()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ---- notifica ----

    private fun avviaInPrimoPiano() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                ID_NOTIFICA,
                costruisciNotifica(Fase.RIPOSO),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else {
            startForeground(ID_NOTIFICA, costruisciNotifica(Fase.RIPOSO))
        }
    }

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
        val testo = when (fase) {
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
