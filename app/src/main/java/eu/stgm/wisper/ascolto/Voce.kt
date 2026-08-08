package eu.stgm.wisper.ascolto

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice as VoceSistema
import java.util.Locale

/**
 * La voce di Wisper: la sintesi vocale di sistema, in italiano.
 *
 * SCELTA DELLA VOCE. Android non usa una voce sola: ne ha diverse per lingua,
 * di qualita' molto diversa. Quella predefinita e' spesso una locale piccola,
 * che suona metallica. Le voci di rete di Google sono molto piu' naturali, ma
 * non vengono scelte da sole. Qui le passiamo in rassegna e prendiamo la
 * migliore: prima la qualita' dichiarata, poi si preferisce una voce di rete,
 * infine si penalizzano quelle marcate come "a bassa latenza" (sono le
 * compresse, quelle che suonano da navigatore).
 *
 * Due garanzie, entrambe perche' il tecnico non guarda lo schermo:
 *  - [parla] richiama SEMPRE [poi], anche se la sintesi fallisce o non e'
 *    pronta. Se saltasse, il giro resterebbe fermo senza che nessuno lo sappia.
 *  - le frasi non si accavallano: una nuova interrompe quella in corso.
 */
class Voce(
    ctx: Context,
    private val registro: (String, String) -> Unit = { _, _ -> },
) {

    private var tts: TextToSpeech? = null
    private var pronta = false
    private var inAttesa: Pair<String, () -> Unit>? = null
    private val callback = HashMap<String, () -> Unit>()

    init {
        // Il motore puo' richiamare questa funzione PRIMA che l'assegnazione a
        // `tts` sia finita: dentro, `tts` sarebbe ancora null. Si tiene quindi
        // il riferimento in una variabile locale e lo si usa da li'.
        lateinit var motore: TextToSpeech
        motore = TextToSpeech(ctx.applicationContext) { esito ->
            pronta = esito == TextToSpeech.SUCCESS
            if (pronta) {
                tts = motore
                configura(motore)
                registro("voce_pronta", descrizioneVoce())
                inAttesa?.let { (frase, poi) -> inAttesa = null; parla(frase, poi) }
            } else {
                registro("voce_errore", "sintesi non disponibile")
                // Anche senza voce il giro deve andare avanti.
                inAttesa?.let { (_, poi) -> inAttesa = null; poi() }
            }
        }
        tts = motore
    }

    private fun configura(t: TextToSpeech) {
        t.language = Locale.ITALIAN

        val italiane = try {
            t.voices.orEmpty().filter { it.locale.language == "it" }
        } catch (_: Exception) {
            emptyList()
        }

        // Utile una volta sola, per sapere cosa offre davvero il telefono.
        italiane.forEach { v ->
            registro(
                "voce_disponibile",
                "${v.name} q=${v.quality} rete=${v.isNetworkConnectionRequired} feat=${v.features}",
            )
        }

        // Voce scelta a mano dopo aver confrontato i quattro campioni del
        // telefono. Non e' la prima per punteggio — sono tutte a 400 — ma e'
        // quella con la prosodia meno piatta: sulla stessa frase varia il 13%
        // in piu' di intensita' e ha piu' pause. "Robotico" e' quasi sempre
        // questo: una voce che non varia. Se un domani manca, si torna alla
        // scelta automatica invece di restare muti.
        val scelta = italiane.firstOrNull { it.name == VOCE_PREFERITA } ?: migliore(italiane)
        scelta?.let {
            t.voice = it
            registro("voce_scelta", "${it.name} q=${it.quality}")
        }

        // Un filo sotto la velocita' piena: le voci italiane migliori tendono a
        // correre, e su un rapportino con numeri e cognomi si perde la meta'.
        t.setSpeechRate(0.98f)
        t.setPitch(1.0f)

        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) = concludi(utteranceId)
            @Deprecated("firma vecchia, obbligatoria")
            override fun onError(utteranceId: String?) = concludi(utteranceId)
            override fun onError(utteranceId: String?, errorCode: Int) = concludi(utteranceId)
        })
    }

    /**
     * Punteggio della voce. La qualita' dichiarata pesa piu' di tutto; a pari
     * qualita' vince quella di rete, che e' il modello grande. Le voci con la
     * caratteristica "latenza bassissima" sono le versioni compresse: si
     * penalizzano, perche' e' esattamente quel suono metallico da evitare.
     */
    private fun migliore(voci: List<VoceSistema>): VoceSistema? = voci.maxByOrNull { v ->
        var p = v.quality                       // 100..500
        if (v.isNetworkConnectionRequired) p += 120
        // Una voce elencata ma non scaricata suonerebbe... per niente.
        if (v.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) == true) p -= 1000
        if (v.name.contains("network", true)) p += 60
        if (v.name.contains("local", true)) p -= 20
        if (v.name.contains("low-latency", true) || v.name.contains("compact", true)) p -= 200
        p
    }

    private companion object {
        /** Confrontata a orecchio e alla misura contro le altre tre di rete. */
        const val VOCE_PREFERITA = "it-it-x-itd-network"
    }

    private fun descrizioneVoce(): String =
        tts?.voice?.let { "${it.name} q=${it.quality}" } ?: "predefinita"

    fun parla(frase: String, poi: () -> Unit = {}) {
        val t = tts
        if (!pronta || t == null) {
            inAttesa = frase to poi
            return
        }
        val id = "wisper-${System.nanoTime()}"
        callback[id] = poi
        registro("voce", frase)
        t.speak(frase, TextToSpeech.QUEUE_FLUSH, null, id)
    }

    /** Impone una voce per nome (es. "it-it-x-kda-network"). Vuoto = lascia la scelta automatica. */
    fun imponiVoce(nome: String) {
        val t = tts ?: return
        val v = t.voices.orEmpty().firstOrNull { it.name == nome } ?: return
        t.voice = v
        registro("voce_scelta", "${v.name} (imposta)")
    }

    /**
     * Genera la stessa frase con TUTTE le voci italiane, un file per voce.
     * Serve solo a scegliere: quale suona meglio non si decide da un punteggio,
     * si decide ascoltando. Da lanciare dal collaudo, non dall'app vera.
     */
    fun campionaVoci(frase: String, cartella: java.io.File, onFatto: (List<java.io.File>) -> Unit) {
        val t = tts
        if (t == null) { onFatto(emptyList()); return }
        val voci = t.voices.orEmpty().filter { it.locale.language == "it" }.sortedBy { it.name }
        if (voci.isEmpty()) { onFatto(emptyList()); return }

        cartella.mkdirs()
        val fatti = java.util.Collections.synchronizedList(mutableListOf<java.io.File>())
        val vocePrecedente = t.voice

        voci.forEach { v ->
            val file = java.io.File(cartella, "${v.name}.wav")
            val id = "campione-${v.name}"
            callback[id] = {
                fatti.add(file)
                if (fatti.size == voci.size) {
                    vocePrecedente?.let { t.voice = it }
                    registro("campioni_pronti", "${fatti.size} voci")
                    onFatto(fatti.toList())
                }
            }
            t.voice = v
            t.synthesizeToFile(frase, null, file, id)
        }
    }

    fun zitta() {
        tts?.stop()
        callback.clear()
    }

    fun spegni() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        pronta = false
        callback.clear()
    }

    private fun concludi(id: String?) {
        val poi = callback.remove(id) ?: return
        poi()
    }
}
