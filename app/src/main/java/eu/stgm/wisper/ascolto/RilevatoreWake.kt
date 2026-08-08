package eu.stgm.wisper.ascolto

import android.content.Context
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import org.vosk.android.StorageService
import java.util.Locale

/**
 * La parola magica: "Ehi Wisper".
 *
 * Gira tutta dentro il telefono con Vosk: nessun account, nessuna scadenza,
 * nessuna rete. Prima che la frase venga riconosciuta, nessun audio esce dal
 * dispositivo — cosa che vale la pena dire nella presentazione.
 *
 * PERCHE' NON USIAMO LA "GRAMMATICA" DI VOSK
 * Vosk sa limitarsi a una lista chiusa di frasi, ed e' il modo piu' preciso.
 * Ma funziona solo con parole presenti nel vocabolario del modello, e
 * "Wisper" in un modello italiano non c'e'. Quindi lasciamo il riconoscimento
 * libero e cerchiamo noi come SUONA: Vosk scrivera' "visper", "vispero",
 * "vis per" o simili, e a noi va bene qualunque di queste.
 *
 * Per questo esiste [onSentito]: durante il collaudo mostra a schermo cosa sta
 * scrivendo davvero Vosk quando dici la frase, cosi' si aggiungono le varianti
 * vere invece di indovinarle.
 *
 * REGOLA DEL MICROFONO
 * Qui dentro c'e' uno SpeechService che POSSIEDE il microfono. Prima di aprire
 * la conversazione va chiamata [pausa], e dopo [ascolta]. Due padroni insieme
 * non danno errore: danno silenzio, ed e' il bug piu' costoso del progetto.
 */
class RilevatoreWake(
    private val ctx: Context,
    private val registro: (String, String) -> Unit = { _, _ -> },
    /** Tutto quello che Vosk crede di sentire. Serve solo a tarare. */
    private val onSentito: (String) -> Unit = {},
    private val onWake: () -> Unit,
) {

    enum class Stato { SPENTO, CARICAMENTO, PRONTO, ERRORE }

    @Volatile
    var stato: Stato = Stato.SPENTO
        private set

    private var modello: Model? = null
    private var servizio: SpeechService? = null
    private var vuoleAscoltare = false
    private var ultimoScatto = 0L

    /**
     * Scompatta il modello dagli assets alla memoria dell'app. La prima volta
     * ci mette qualche secondo (sono 88 MB), dalla seconda e' immediato.
     * Da chiamare una volta sola.
     */
    fun prepara(onPronto: (Boolean) -> Unit = {}) {
        if (stato == Stato.CARICAMENTO || stato == Stato.PRONTO) return
        stato = Stato.CARICAMENTO
        registro("wake_caricamento", "scompatto il modello italiano")

        StorageService.unpack(
            ctx,
            CARTELLA_ASSET,
            CARTELLA_INTERNA,
            { m ->
                modello = m
                stato = Stato.PRONTO
                registro("wake_pronta", "modello caricato")
                if (vuoleAscoltare) avviaServizio()
                onPronto(true)
            },
            { e ->
                stato = Stato.ERRORE
                registro("wake_errore", e.message ?: e.javaClass.simpleName)
                onPronto(false)
            },
        )
    }

    /** Accende l'orecchio. Se il modello sta ancora caricando, parte da solo appena pronto. */
    fun ascolta() {
        vuoleAscoltare = true
        if (stato == Stato.PRONTO && servizio == null) avviaServizio()
    }

    /** Molla il microfono. Da chiamare SEMPRE prima di aprire la conversazione. */
    fun pausa() {
        vuoleAscoltare = false
        servizio?.let {
            it.stop()
            it.shutdown()
        }
        servizio = null
        registro("wake_pausa", "")
    }

    fun spegni() {
        pausa()
        modello?.close()
        modello = null
        stato = Stato.SPENTO
    }

    private fun avviaServizio() {
        val m = modello ?: return
        try {
            val riconoscitore = creaRiconoscitore(m)
            servizio = SpeechService(riconoscitore, FREQUENZA).also {
                it.startListening(Ascoltatore())
            }
            registro("wake_in_ascolto", modo)
        } catch (e: Exception) {
            stato = Stato.ERRORE
            registro("wake_errore", "avvio: ${e.message}")
        }
    }

    /** "lista" oppure "libero": utile a vedere a colpo d'occhio quale dei due sta girando. */
    private var modo = "?"

    /**
     * Riconoscimento LIBERO, per una ragione controintuitiva verificata sul
     * telefono il 07/08.
     *
     * La "lista chiusa" di Vosk sembra la scelta ovvia, ed e' peggiore: se le
     * uniche uscite ammesse sono «ehi whisper» e «[unk]», il decodificatore
     * DEVE incastrare in una delle due qualunque cosa senta, e spesso sceglie
     * male. "oggi sono" faceva scattare la parola magica.
     *
     * Col riconoscimento libero il modello ha duecentomila parole fra cui
     * scegliere, quindi "oggi sono" lo scrive "oggi sono" e non assomiglia a
     * niente. Costa piu' batteria, ma i falsi allarmi crollano.
     */
    private fun creaRiconoscitore(m: Model): Recognizer {
        modo = "libero"
        return Recognizer(m, FREQUENZA)
    }

    // ---- riconoscimento ----

    private fun testoDi(json: String?): String {
        if (json.isNullOrBlank()) return ""
        return try {
            val o = JSONObject(json)
            o.optString("text", "").ifBlank { o.optString("partial", "") }
        } catch (_: Exception) {
            ""
        }
    }

    /**
     * Basta il NOME: "Wisper" da solo, con o senza "ehi" davanti.
     *
     * Scelta deliberata dopo il collaudo del 07/08. L'"ehi" e' la parte che
     * Vosk sbaglia piu' spesso — e' corto, atono, e in italiano lo trascrive
     * in dieci modi diversi. Pretenderlo faceva perdere attivazioni vere.
     *
     * In un video una mancata attivazione e' molto peggio di una di troppo:
     * se scatta quando non deve si rifa' la ripresa, se non scatta quando parli
     * la demo si pianta davanti a chi guarda. Quindi si sbaglia da questa parte.
     *
     * Il confronto e' su parole INTERE, mai su pezzi di parola: cosi' "vespa"
     * o "vispo" non possono farlo scattare. E in [NOMI] non entrano mai parole
     * italiane vere — e' la regola che ci ha fregato la prima volta.
     */
    private fun suonaComeWisper(testo: String): Boolean {
        if (testo.isBlank()) return false
        return testo.lowercase(Locale.ITALIAN)
            .replace(Regex("[^a-z ]"), " ")
            .split(' ')
            .any { it in NOMI }
    }

    private fun scatta(origine: String) {
        val ora = System.currentTimeMillis()
        // Senza questa guardia la stessa frase scatta due volte: una sul
        // risultato parziale e una su quello finale.
        if (ora - ultimoScatto < ATTESA_MINIMA_MS) return
        ultimoScatto = ora
        registro("wake_rilevata", origine)
        onWake()
    }

    private inner class Ascoltatore : RecognitionListener {
        // Il parziale arriva mentre stai ancora parlando: e' quello che rende
        // lo scatto immediato invece di aspettare la fine della frase.
        override fun onPartialResult(hypothesis: String?) {
            val t = testoDi(hypothesis)
            if (t.isNotBlank()) onSentito(t)
            if (suonaComeWisper(t)) scatta("parziale")
        }

        override fun onResult(hypothesis: String?) {
            val t = testoDi(hypothesis)
            if (t.isNotBlank()) onSentito(t)
            if (suonaComeWisper(t)) scatta("finale")
        }

        override fun onFinalResult(hypothesis: String?) {
            if (suonaComeWisper(testoDi(hypothesis))) scatta("chiusura")
        }

        override fun onError(e: Exception?) {
            registro("wake_errore", e?.message ?: "sconosciuto")
        }

        override fun onTimeout() = Unit
    }

    private companion object {
        const val CARTELLA_ASSET = "modello-it"
        const val CARTELLA_INTERNA = "modello"
        const val FREQUENZA = 16000f
        const val ATTESA_MINIMA_MS = 2500L

        // Le uniche parole che fanno scattare Wisper. Sul telefono Vosk scrive
        // "whisper" con la grafia inglese: la parola sta nel vocabolario
        // italiano come prestito.
        //
        // REGOLA DA NON VIOLARE: qui dentro non entrano MAI parole italiane
        // vere. "vispe" e "vespe" c'erano, ed erano la causa dei falsi allarmi.
        // Prima di aggiungere una variante, chiediti se esiste in italiano.
        val NOMI = setOf("whisper", "wisper", "visper", "uisper", "wispern")
    }
}
