package eu.stgm.wisper

import android.app.Activity
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Bundle
import eu.stgm.wisper.rapportino.AnnuncioVersioni
import eu.stgm.wisper.rapportino.Strade
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class WisperApp : Application() {

    /** Uno solo per tutta l'app: schermate e invio in sottofondo guardano gli stessi dati. */
    val archivio: Archivio by lazy { Archivio(this) }

    override fun onCreate() {
        super.onCreate()

        // Chi sta guardando cosa: con l'app davanti gli avvisi li mostra la
        // schermata, e la notifica sarebbe un doppione.
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            private var vive = 0
            override fun onActivityResumed(a: Activity) { vive++; _davanti.value = vive > 0 }
            override fun onActivityPaused(a: Activity) { vive--; _davanti.value = vive > 0 }
            override fun onActivityCreated(a: Activity, b: Bundle?) {}
            override fun onActivityStarted(a: Activity) {}
            override fun onActivityStopped(a: Activity) {}
            override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
            override fun onActivityDestroyed(a: Activity) {}
        })

        val gestore = getSystemService(NotificationManager::class.java)
        // I canali della voce, che non c'e' piu': sui telefoni che avevano la
        // versione vecchia resterebbero nelle impostazioni a non servire a niente.
        gestore.deleteNotificationChannel("ascolto")
        gestore.deleteNotificationChannel("sveglia")

        // "Rapportini non ancora sul foglio" e "il foglio ha rifiutato": servono
        // quando l'app e' chiusa e l'invio parte in sottofondo.
        gestore.createNotificationChannel(
            NotificationChannel(
                CANALE_SALVATAGGI,
                getString(R.string.canale_salvataggi),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { setShowBadge(true) }
        )

        // I promemoria di attività e appuntamenti (Promemoria.kt): devono farsi vedere, come una sveglia.
        gestore.createNotificationChannel(
            NotificationChannel(Promemoria.CANALE, getString(R.string.canale_promemoria), NotificationManager.IMPORTANCE_HIGH)
                .apply { setShowBadge(true) }
        )

        // Le versioni nuove (03/11/2026, progetti.md §6): lo stato salvato; niente piu' controllo di ogni ora (il lavoro
        // di prima si toglie), le annuncia il NAS in ogni risposta e col campanello.
        NuoveVersioni.carica(this)
        NuoveVersioni.togliControlloOrario(this)
        AnnuncioVersioni.quandoArriva = { v -> NuoveVersioni.annunciata(this, v) }
        // Una versione scaricata e non ancora installata si installa quando l'app e' dietro da un minuto: l'attesa la
        // tiene WorkManager (13/11/2026), e parte ogni volta che l'app va dietro.
        ambito.launch { davanti.collect { d -> NuoveVersioni.davantiCambiato(this@WisperApp, d) } }
        // Il campanello: con l'app davanti e il server di casa resta aperto; dietro, o via Google, si ferma.
        ambito.launch {
            davanti.first { it }
            val a = archivio
            combine(davanti, a.dove) { d, dove -> d && dove == Strade.Dove.CASA }
                .distinctUntilChanged()
                .collectLatest { suona -> if (suona) a.campanello.suona() }
        }
    }

    private val ambito = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        const val CANALE_SALVATAGGI = "salvataggi"

        /** Vero se una schermata di Wisper e' quella che l'utente sta guardando. */
        private val _davanti = MutableStateFlow(false)
        val davanti: StateFlow<Boolean> = _davanti.asStateFlow()
    }
}
