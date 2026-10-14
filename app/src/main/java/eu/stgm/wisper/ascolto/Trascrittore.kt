package eu.stgm.wisper.ascolto

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Trascrive quello che il tecnico detta, col riconoscitore di sistema.
 *
 * Perche' non Vosk anche qui: Vosk gira offline ed e' perfetto per una parola
 * sola sempre uguale, ma il suo modello italiano piccolo (50 MB) sbaglia
 * parecchio su un discorso intero, e soprattutto sui cognomi. Il riconoscitore
 * di Android usa il motore di Google, molto piu' forte sul parlato libero.
 *
 * REGOLA DEL MICROFONO: mentre questo lavora, [RilevatoreWake] deve essere in
 * pausa. Un microfono, un padrone. Due insieme non danno errore: danno silenzio.
 *
 * Garanzia: ogni [avvia] chiama [onEsito] ESATTAMENTE una volta, col testo o
 * con null (silenzio, rumore, errore). Chi sta sopra deve solo sapere se c'e'
 * del testo — se non arrivasse mai la risposta, il giro resterebbe appeso e il
 * tecnico non saprebbe che fare, perche' non sta guardando lo schermo.
 *
 * Da chiamare dal thread principale.
 */
class Trascrittore(
    private val ctx: Context,
    private val registro: (String, String) -> Unit = { _, _ -> },
) {

    private var recognizer: SpeechRecognizer? = null

    /**
     * Ogni ascolto ha il suo numero. Fermarlo lo incrementa, e le richiamate
     * che arrivano dal riconoscitore vecchio vengono scartate.
     *
     * Serve perche' distruggere il riconoscitore mentre lavora gli fa emettere
     * un errore, e senza questa guardia una chiusura VOLUTA verrebbe scambiata
     * per un guasto del microfono e annunciata ad alta voce.
     */
    private var sessione = 0

    val disponibile: Boolean
        get() = SpeechRecognizer.isRecognitionAvailable(ctx)

    /** Com'e' finito un ascolto. */
    enum class Esito {
        /** C'e' del testo. */
        TESTO,

        /** Nessuno ha parlato. NON e' un guasto: e' una pausa. */
        SILENZIO,

        /** Il microfono non ha funzionato: questo va detto ad alta voce. */
        GUASTO,
    }

    /**
     * @param onParziale le parole man mano che escono, per mostrarle a schermo
     *                   mentre parla: e' quello che fa sembrare l'app viva.
     */
    fun avvia(
        onParziale: (String) -> Unit = {},
        onEsito: (Esito, String?) -> Unit,
    ) {
        ferma()
        if (!disponibile) {
            registro("trascrizione_indisponibile", "")
            onEsito(Esito.GUASTO, null)
            return
        }

        val mia = ++sessione
        var consegnato = false
        fun consegna(esito: Esito, testo: String? = null) {
            if (consegnato || mia != sessione) return
            consegnato = true
            onEsito(esito, testo)
        }

        apri(mia, 0, onParziale) { esito, testo -> consegna(esito, testo) }
    }

    /**
     * Crea il riconoscitore e comincia ad ascoltare.
     *
     * @param ripartenze quante volte questo stesso ascolto e' gia' ripartito da
     *        solo dopo un errore di avvio, vedi [ripartibile].
     */
    private fun apri(
        mia: Int,
        ripartenze: Int,
        onParziale: (String) -> Unit,
        consegna: (Esito, String?) -> Unit,
    ) {
        recognizer?.destroy()
        var pronto = false

        recognizer = SpeechRecognizer.createSpeechRecognizer(ctx).apply {
            setRecognitionListener(object : RecognitionListener {

                override fun onResults(results: Bundle) {
                    val testo = results
                        .getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        ?.takeIf { it.isNotBlank() }
                    if (testo != null) {
                        registro("trascritto", testo)
                        consegna(Esito.TESTO, testo)
                    } else {
                        registro("silenzio", "")
                        consegna(Esito.SILENZIO, null)
                    }
                }

                override fun onPartialResults(partialResults: Bundle) {
                    partialResults
                        .getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        ?.takeIf { it.isNotBlank() }
                        ?.let(onParziale)
                }

                override fun onError(codice: Int) {
                    if (mia != sessione) return   // ascolto gia' fermato: niente da dire

                    // Riparte da solo, senza dirlo a nessuno, se non ha ancora
                    // cominciato ad ascoltare: il tecnico non ha detto niente,
                    // quindi non c'e' niente di perso e niente da annunciare.
                    if (!pronto && ripartibile(codice) && ripartenze < MAX_RIPARTENZE) {
                        registro("trascrizione_riparte", nomeErrore(codice))
                        mano.postDelayed(
                            { if (mia == sessione) apri(mia, ripartenze + 1, onParziale, consegna) },
                            PAUSA_RIPARTENZA_MS,
                        )
                        return
                    }

                    // Si annuncia SOLO cio' che impedisce davvero di lavorare.
                    // "Non ho capito", "timeout" e gli errori di client sono
                    // pause o inciampi passeggeri: si riprova in silenzio.
                    val guasto = codice == SpeechRecognizer.ERROR_AUDIO ||
                        codice == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ||
                        codice == SpeechRecognizer.ERROR_SERVER ||
                        codice == SpeechRecognizer.ERROR_NETWORK
                    registro(
                        if (guasto) "trascrizione_errore" else "silenzio",
                        nomeErrore(codice),
                    )
                    consegna(if (guasto) Esito.GUASTO else Esito.SILENZIO, null)
                }

                override fun onReadyForSpeech(params: Bundle?) {
                    pronto = true
                }
                override fun onBeginningOfSpeech() = Unit
                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() = Unit
                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })

            startListening(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(
                        RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                    )
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "it-IT")
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    // Un tecnico che detta si ferma a pensare in mezzo alla frase:
                    // guarda l'impianto, conta le ore, si ricorda dei chilometri.
                    // Il default di Android chiude dopo un attimo e tronca il
                    // discorso; quattro secondi sono una pausa umana, non un
                    // silenzio.
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 2000L)
                }
            )
        }
    }

    fun ferma() {
        sessione++            // invalida le richiamate dell'ascolto in corso
        mano.removeCallbacksAndMessages(null)   // e le ripartenze in attesa
        recognizer?.destroy()
        recognizer = null
    }

    private val mano = Handler(Looper.getMainLooper())

    /**
     * Gli errori con cui il riconoscitore puo' fallire appena creato, prima di
     * aver sentito una sola parola.
     *
     * TROVATO il 26/09 nel log di una prova vera: OGNI ascolto cominciava con
     * "server scollegato" (codice 11) dopo venti millisecondi, e ripartendo
     * funzionava. Succede perche' il riconoscitore di prima viene distrutto un
     * istante prima di crearne uno nuovo, e il servizio di Google non ha
     * ancora finito di staccarsi. Il danno non era il ritardo ma il conto: ogni
     * volta risultava un "silenzio" del tecnico, e dopo tre silenzi di fila
     * Wisper chiude la conversazione. Con una pausa vera in mezzo, la chiudeva
     * molto prima del previsto.
     */
    private fun ripartibile(codice: Int): Boolean =
        codice == ERRORE_SERVER_SCOLLEGATO ||
            codice == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ||
            codice == SpeechRecognizer.ERROR_CLIENT

    private companion object {
        /** SpeechRecognizer.ERROR_SERVER_DISCONNECTED, che esiste solo da Android 12. */
        const val ERRORE_SERVER_SCOLLEGATO = 11
        const val MAX_RIPARTENZE = 2
        const val PAUSA_RIPARTENZA_MS = 150L
    }

    private fun nomeErrore(c: Int): String = when (c) {
        ERRORE_SERVER_SCOLLEGATO -> "server scollegato"
        SpeechRecognizer.ERROR_CLIENT -> "errore del client"
        SpeechRecognizer.ERROR_NO_MATCH -> "non ho capito"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "silenzio"
        SpeechRecognizer.ERROR_AUDIO -> "problema audio"
        SpeechRecognizer.ERROR_NETWORK -> "rete"
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "rete lenta"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "riconoscitore occupato"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "manca il permesso"
        else -> "codice $c"
    }
}
