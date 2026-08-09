package eu.stgm.wisper

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import eu.stgm.wisper.ascolto.RilevatoreWake
import eu.stgm.wisper.ascolto.Trascrittore
import eu.stgm.wisper.ascolto.Voce
import eu.stgm.wisper.cervello.Azione
import eu.stgm.wisper.cervello.CervelloGemini
import eu.stgm.wisper.cervello.RispostaWisper
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.AnagraficheSalvate
import eu.stgm.wisper.rapportino.DoveSono
import eu.stgm.wisper.rapportino.PonteFoglio
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Vicinanza
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Dove si trova il giro in questo momento. Guida la palla e il form. */
enum class Fase { RIPOSO, ASCOLTO, PENSA, PARLA, SALVA }

private const val SILENZI_PRIMA_DI_CHIUDERE = 3

/**
 * Chi sta usando Wisper. Fisso, perche' oggi l'app e' a utente singolo: scrive
 * su un foglio solo, quello del suo proprietario. Quando diventera' multi-utente
 * questo nome arrivera' dall'account, insieme al foglio giusto e ai permessi.
 * E' uno dei limiti dichiarati apertamente nella presentazione.
 */
private const val NOME_UTENTE = "Andrea"

/**
 * Frasi che vogliono dire "ho finito di parlare", non "ho finito il lavoro".
 * Solo se dette da sole o quasi: dentro una frase piu' lunga "ho finito" torna
 * a essere un dato vero.
 */
private val CHIUSURE_DISCORSO = listOf(
    "ho finito", "basta", "basta cosi", "basta così", "e tutto", "è tutto",
    "niente", "no niente", "nient altro", "nient'altro", "stop", "fine",
    "va bene cosi", "va bene così", "ok cosi", "ok così",
)

/**
 * Il giro completo di Wisper, dalla parola magica alla riga sul foglio.
 *
 *   RIPOSO   Vosk aspetta "Wisper"
 *     |      sente -> Vosk molla il microfono, beep
 *   ASCOLTO  il riconoscitore di Android trascrive quello che detti
 *     |
 *   PENSA    Gemini estrae i campi e decide cosa rispondere
 *     |
 *   PARLA    la voce risponde -> si torna ad ASCOLTO senza ridire la parola
 *     |      magica, perche' una conversazione non si riapre ogni volta
 *   SALVA    solo quando confermi: la riga parte verso il foglio
 *     |
 *   RIPOSO   Vosk riprende il microfono
 *
 * DUE REGOLE DELLA CASA, e valgono per ogni riga di questo file.
 *
 * 1. UN SOLO PADRONE DEL MICROFONO. Vosk oppure il trascrittore, mai insieme.
 *    Due client sullo stesso microfono non danno errore: danno silenzio, e si
 *    finisce a cercare il guasto nella rete per due ore.
 *
 * 2. OGNI GIRO SI CHIUDE CON UNA FRASE. Errore di rete, silenzio, foglio
 *    irraggiungibile: si dice sempre qualcosa. Chi ha le mani sporche e non
 *    guarda lo schermo non ha nessun altro modo di sapere cos'e' successo, e
 *    un fallimento silenzioso e' un fallimento invisibile.
 */
class GiroWisper(
    private val ctx: Context,
    private val scope: CoroutineScope,
    private val registro: (String, String) -> Unit = { _, _ -> },
    /**
     * Chiamata quando si apre una conversazione. Serve al servizio per portare
     * la schermata davanti: il giro funziona anche senza, perche' e' tutta
     * voce, ma se nessuno guarda non si vedono i campi riempirsi.
     */
    private val onSveglia: () -> Unit = {},
) {

    private val _fase = MutableStateFlow(Fase.RIPOSO)
    val fase: StateFlow<Fase> = _fase.asStateFlow()

    private val _rapportino = MutableStateFlow(Rapportino())
    val rapportino: StateFlow<Rapportino> = _rapportino.asStateFlow()

    /** Quello che Wisper sta dicendo: sotto il form, e per chi guarda il video. */
    private val _messaggio = MutableStateFlow("")
    val messaggio: StateFlow<String> = _messaggio.asStateFlow()

    /** Le parole del tecnico mentre le sta ancora dicendo. */
    private val _trascrizione = MutableStateFlow("")
    val trascrizione: StateFlow<String> = _trascrizione.asStateFlow()

    private val _anagrafiche = MutableStateFlow(Anagrafiche())
    val anagrafiche: StateFlow<Anagrafiche> = _anagrafiche.asStateFlow()

    private val main = Handler(Looper.getMainLooper())
    private val voce = Voce(ctx, registro)
    private val trascrittore = Trascrittore(ctx, registro)
    private val cervello = CervelloGemini()
    private val ponte = PonteFoglio()
    private val dove = DoveSono(ctx)
    private val salvate = AnagraficheSalvate(ctx)
    private val beep = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70)

    private val wake = RilevatoreWake(
        ctx = ctx,
        registro = registro,
        // Tutto quello che Vosk crede di sentire finisce nei log. Senza, quando
        // la parola magica non scatta non si distingue fra "non sente niente",
        // "sente ma trascrive un'altra cosa" e "il microfono non e' suo".
        onSentito = { testo -> registro("sento", testo) },
        onWake = {
            main.post {
                // Se Wisper sta parlando, "Wisper" vuol dire "zitto, parlo io".
                // Chi ha le mani occupate non ha altro modo di fermarlo, e
                // stare ad ascoltare un riepilogo che gia' conosce e' il modo
                // piu' veloce per far sembrare lenta un'app che non lo e'.
                if (_fase.value == Fase.PARLA) interrompiIlParlato()
                else apriConversazione(saluto = false)
            }
        },
    )

    /**
     * Silenzi di fila prima di chiudere il giro. Con quattro secondi di attesa
     * a tentativo, sono circa dodici secondi di pausa concessi: il tempo di
     * guardare un impianto e ricordarsi i chilometri.
     */
    private var silenziDiFila = 0

    /**
     * Numero della conversazione in corso. Interrompere lo incrementa, e ogni
     * risposta che torna da Gemini controlla di appartenere ancora a quella
     * giusta prima di applicarsi.
     *
     * Senza, spegnendo lo schermo mentre il cervello sta pensando la risposta
     * arrivava lo stesso qualche secondo dopo, faceva parlare Wisper e
     * riaccendeva il microfono: sembrava che l'app "restasse sempre in ascolto"
     * ignorando lo spegnimento.
     */
    private var conversazione = 0

    /** L'ultima cosa detta da Wisper: serve a riprendere il filo, ripetendola. */
    private var ultimaFrase = ""

    /**
     * Se l'ultima frase era il riepilogo finale. Non si deduce dalle parole:
     * il riepilogo dice "il lavoro resta aperto" e finisce con "e' tutto
     * corretto?", quindi a cercarlo per parole chiave sembra la domanda sullo
     * stato del lavoro — e disattivava la protezione proprio quando serviva.
     * Questo riepilogo lo scrivo io, quindi lo so per certo invece di indovinarlo.
     */
    private var ultimaEraRiepilogo = false

    /**
     * Il caricamento dell'elenco di clienti e commesse, tenuto da parte per
     * poterlo aspettare.
     *
     * Trovato la mattina del 09/08, a poche ore dalla consegna. Il foglio ci
     * mette qualche secondo a rispondere e l'apertura per posizione partiva
     * subito, quindi guardava in un elenco ancora vuoto, non trovava niente e
     * ripiegava sul saluto generico. Sembrava che la geolocalizzazione fosse
     * rotta; era solo arrivata prima lei.
     */
    private var caricamento: Job? = null

    /** Vero fra "sei nel cantiere di X, è corretto?" e la risposta del tecnico. */
    private var cantiereDaConfermare = false

    /**
     * Le parole con cui si dice di sì a "è corretto?".
     *
     * Volutamente corta: se il tecnico risponde qualcosa di diverso, anche solo
     * "sì ma la commessa è l'altra", non deve entrare di qui. Nel dubbio decide
     * il modello, che e' piu' lento ma capisce le sfumature.
     */
    private fun suonaComeUnSi(testo: String): Boolean {
        val t = testo.lowercase().trim().trim('.', '!', ',')
        return t in setOf(
            "sì", "si", "sì esatto", "si esatto", "esatto", "sì corretto",
            "si corretto", "corretto", "giusto", "sì giusto", "si giusto",
            "certo", "sì certo", "si certo", "esattamente", "confermo",
            "va bene", "sì va bene", "si va bene", "ok", "sì ok", "si ok",
            "perfetto", "sì perfetto", "si perfetto", "proprio quella",
        )
    }

    // ---------------------------------------------------------------- avvio

    fun avvia() {
        // L'elenco di ieri, letto dal telefono: c'e' prima ancora che il
        // servizio finisca di partire, cosi' la posizione funziona al primo
        // colpo invece di aspettare il foglio.
        salvate.leggi().takeIf { it.commesse.isNotEmpty() }?.let {
            _anagrafiche.value = it
            registro("anagrafiche_salvate", "${it.clienti.size} clienti, ${it.commesse.size} commesse")
        }
        caricamento = ricaricaAnagrafiche()
        // Il servizio parte all'accensione dell'app e resta acceso: qui si
        // mette solo in ascolto della parola magica, senza aprire niente.
        // La conversazione la apre chi arriva: la voce, o la schermata.
        //
        // Il controllo sulla fase NON e' pignoleria: il modello ci mette un
        // paio di secondi a caricarsi, e in quel tempo la schermata puo' avere
        // gia' aperto una conversazione. Accendere qui l'orecchio senza
        // guardare metterebbe Vosk e il trascrittore sullo stesso microfono —
        // e due padroni non danno errore, danno silenzio.
        wake.prepara { ok ->
            if (ok && _fase.value == Fase.RIPOSO) riprendiOrecchio()
        }
    }

    // ------------------------------------------------------- il microfono e' di tutti

    /**
     * Vero quando Wisper si e' fatto da parte per lasciare il microfono a
     * qualcun altro.
     *
     * PERCHE' ESISTE, ed e' il difetto piu' grosso che questo progetto abbia
     * avuto. Vosk tiene il microfono aperto in permanenza, ed e' l'unico modo
     * di sentire una parola magica senza un chip apposta come quello che usa
     * Google. Solo che su Android il microfono e' di chi se lo prende: con un
     * servizio in primo piano acceso h24, Wisper vinceva sempre e le altre app
     * del telefono restavano mute. Un messaggio vocale su WhatsApp, un video,
     * una telefonata: tutto rotto, e per colpa nostra.
     *
     * Chi decide quando cedere non e' questa classe ma [ServizioAscolto], che
     * e' l'unico posto da cui si vedono lo schermo e le telefonate. Qui c'e'
     * solo l'interruttore.
     */
    private var sospeso = false

    /** Molla il microfono e chiude quello che c'era in corso. */
    fun cediMicrofono(motivo: String) {
        main.post {
            if (sospeso) return@post
            sospeso = true
            registro("microfono_ceduto", motivo)
            interrompi()
            wake.pausa()
        }
    }

    /** Si riprende il microfono, se nel frattempo non lo usa nessun altro. */
    fun riprendiMicrofono(motivo: String) {
        main.post {
            if (!sospeso) return@post
            sospeso = false
            registro("microfono_ripreso", motivo)
            if (_fase.value == Fase.RIPOSO) wake.ascolta()
        }
    }

    /**
     * L'unico modo consentito di riaccendere l'orecchio.
     *
     * Ogni punto del giro che finisce torna a Vosk, e ognuno di quei punti
     * deve rispettare la sospensione: bastava un solo `wake.ascolta()` diretto
     * a fine conversazione per riprendersi il microfono di soppiatto mentre
     * l'utente stava telefonando.
     */
    private fun riprendiOrecchio() {
        if (!sospeso) wake.ascolta()
    }

    fun spegni() {
        wake.spegni()
        trascrittore.ferma()
        voce.spegni()
        beep.release()
    }

    /** Aprendo l'app: c'e' tempo per il saluto intero, sei fermo a guardarla. */
    fun apriAMano() = apriConversazione(saluto = true)

    /**
     * Chiude subito la conversazione e torna ad aspettare la parola magica.
     *
     * Serve quando l'utente spegne lo schermo a meta' giro: e' un gesto che
     * vuol dire "ho finito". Senza, il riconoscitore resta acceso e si mangia
     * quello che dicono gli altri nella stanza, riempiendo il rapportino di
     * parole a caso. Il rapportino a meta' NON si butta: si riprende dicendo
     * di nuovo "Wisper".
     */
    fun interrompi() {
        main.post(
            Runnable {
                if (_fase.value == Fase.RIPOSO) return@Runnable
                registro("interrotto", _fase.value.name)
                conversazione++          // le risposte gia' in volo diventano vecchie
                voce.zitta()
                trascrittore.ferma()
                _trascrizione.value = ""
                chiudiGiro()
            }
        )
    }

    /**
     * Botola di collaudo: inietta una frase come se il microfono l'avesse
     * sentita, saltando solo la trascrizione.
     *
     * Serve perche' tutto il resto del giro — il cervello, i campi che si
     * riempiono, la voce, la riga che parte verso il foglio — si puo' provare
     * dal computer via adb, mentre il microfono richiede per forza una persona
     * che parli. Cosi' l'unica incognita che resta da provare a voce e' il
     * passaggio del microfono, invece di tutta la catena.
     *
     * Attiva solo nelle build di prova: [MainActivity] la registra sotto
     * BuildConfig.DEBUG.
     *
     *   adb shell am broadcast -a eu.stgm.wisper.DETTA --es testo "sono da Rossi tre ore"
     */
    /** Collaudo: genera un campione audio per ogni voce italiana del telefono. */
    fun campionaVoci() {
        main.post {
            voce.campionaVoci(
                frase = "Segnato Rossi Impianti, manutenzione caldaia, tre ore e mezza " +
                    "e cinquanta chilometri. Altro, o salvo?",
                cartella = java.io.File(ctx.getExternalFilesDir(null), "voci"),
            ) { file -> registro("campioni", "${file.size} file scritti") }
        }
    }

    /** Collaudo: impone una voce per nome, per confrontarle dal vivo. */
    fun imponiVoce(nome: String) = main.post { voce.imponiVoce(nome) }

    fun simulaDetto(testo: String) {
        main.post {
            when (_fase.value) {
                Fase.RIPOSO -> {
                    wake.pausa()
                    silenziDiFila = 0
                    suDetto(Trascrittore.Esito.TESTO, testo)
                }
                Fase.ASCOLTO -> {
                    trascrittore.ferma()
                    suDetto(Trascrittore.Esito.TESTO, testo)
                }
                // A meta' di un pensiero o di una frase si aspetta: iniettare
                // adesso creerebbe due giri sovrapposti.
                else -> registro("simulazione_scartata", _fase.value.name)
            }
        }
    }

    // ------------------------------------------------------------- il giro

    /**
     * Apre la conversazione. NON azzera il rapportino in corso.
     *
     * Sembra un dettaglio ed e' la differenza fra un giocattolo e uno strumento:
     * il tecnico si ferma a pensare, un camion copre la voce, qualcuno lo chiama.
     * Il giro si chiude da solo dopo due silenzi, e se ripartendo si buttasse
     * via il lavoro fatto, meta' rapportino sparirebbe senza che nessuno lo
     * abbia chiesto. Si riprende da dove si era rimasti; si riparte da zero
     * solo dopo un salvataggio riuscito o se e' lui a dire di ricominciare.
     */
    /**
     * @param saluto se aprire col saluto intero o con due parole.
     *        Chiamando "Wisper" a mani occupate, tre secondi di convenevoli
     *        prima di poter parlare sono tre secondi di troppo: si dice il
     *        minimo e si apre subito il microfono. Aprendo l'app invece sei
     *        fermo a guardarla, e il saluto ci sta.
     */
    private fun apriConversazione(saluto: Boolean) {
        if (_fase.value != Fase.RIPOSO) return
        // Se il microfono e' di qualcun altro non glielo si strappa di mano,
        // nemmeno quando a chiedere e' il pulsante "Parla" della notifica.
        if (sospeso) {
            registro("apertura_rifiutata", "microfono ceduto")
            return
        }
        wake.pausa()                    // handoff: il microfono passa al trascrittore
        silenziDiFila = 0
        onSveglia()
        beep.startTone(ToneGenerator.TONE_PROP_ACK, 120)

        // Wisper parla per primo. Chiamando per nome e facendo una domanda
        // aperta si toglie di mezzo il problema del "e adesso cosa dico": il
        // tecnico non deve ricordarsi nessuna formula, risponde e basta.
        // Se invece si sta riprendendo un rapportino a meta', il saluto
        // sarebbe fuori luogo: si dice dove eravamo rimasti.
        // Riprendendo un rapportino a meta' si RIPETE l'ultima domanda, non si
        // dice "riprendiamo": chi torna dopo un minuto non si ricorda a che
        // punto era, e "dimmi pure" lo costringe a ricostruirselo da solo.
        // Ripetere la domanda rimette tutti e due sullo stesso punto.
        // Se il rapportino e' gia' avviato si riprende il filo e basta: la
        // posizione a quel punto non serve piu', il cantiere lo sappiamo.
        if (_rapportino.value != Rapportino()) {
            val ripresa = if (ultimaFrase.isNotBlank()) "Dicevo: $ultimaFrase"
            else "Riprendiamo da dove eravamo. Dimmi pure."
            rispondi(ripresa) { ascolta() }
            return
        }

        // Rapportino nuovo: prima di chiedere, si guarda dove siamo.
        scope.launch {
            // Qui NON si aspetta niente. L'elenco arriva dal file salvato sul
            // telefono ed e' gia' pronto; il foglio ci mette dai sette ai
            // tredici secondi e dopo la parola magica quel silenzio si sente.
            // L'unica volta in cui l'elenco manca davvero e' al primo avvio
            // dopo l'installazione, e li' si apre col saluto normale.
            val qui = try {
                dove.commessaQui(_anagrafiche.value)
            } catch (e: Exception) {
                registro("posizione_errore", e.message ?: "sconosciuto")
                null
            }
            registro("posizione", dove.motivo)
            val apertura = aperturaPer(qui, saluto)
            // Solo se il cantiere e' stato riconosciuto e proposto: il "sì" che
            // arriva dopo e' una risposta a questa domanda, non una frase da
            // interpretare.
            cantiereDaConfermare = qui != null && qui.soloQuesta
            // Questa frase non l'ha scritta il modello: se non gliela si
            // racconta, la conversazione per lui comincia da un "si', esatto"
            // appeso al nulla e ricomincia a chiedere cose gia' proposte.
            cervello.ricorda(apertura)
            rispondi(apertura) { ascolta() }

            // E intanto si rilegge il foglio per la prossima volta: un
            // indirizzo corretto stamattina non deve aspettare un riavvio.
            caricamento = ricaricaAnagrafiche()
        }
    }

    private fun ricaricaAnagrafiche(): Job = scope.launch {
        val lette = runCatching { ponte.caricaAnagrafiche() }.getOrNull() ?: return@launch
        // Un elenco vuoto vuol dire che il foglio non ha risposto, non che
        // l'azienda non ha piu' clienti: quello buono che avevamo resta.
        if (lette.commesse.isEmpty() && _anagrafiche.value.commesse.isNotEmpty()) {
            registro("anagrafiche", "il foglio non ha risposto, tengo quelle salvate")
            return@launch
        }
        _anagrafiche.value = lette
        salvate.scrivi(lette)
        registro("anagrafiche", "${lette.clienti.size} clienti, ${lette.commesse.size} commesse")
    }

    /**
     * La frase di apertura, che cambia a seconda di quello che il telefono sa.
     *
     * Se siamo su un cantiere riconosciuto, cliente e commessa vengono
     * PROPOSTI, non dati per scontati: la domanda finisce sempre con "e'
     * corretto?", e se il tecnico dice di no si ricomincia normalmente. La
     * posizione e' un indizio forte, non una prova: si puo' essere in ufficio
     * a compilare il rapportino di ieri.
     */
    private fun aperturaPer(qui: Vicinanza?, saluto: Boolean): String {
        if (qui == null) {
            return if (saluto) "Ehi, ciao $NOME_UTENTE. Che cos'hai fatto oggi?"
            else "Dimmi, $NOME_UTENTE."
        }

        // I dati proposti si scrivono subito nella scheda, cosi' si vedono
        // mentre Wisper li dice. Se il tecnico smentisce, li corregge parlando.
        _rapportino.value = _rapportino.value.aggiorna(
            Rapportino(cliente = qui.cliente.nome, commessa = qui.commessa.id)
        )

        // Qui si saluta sempre, anche svegliandolo con la parola magica. Aprire
        // con "ho visto che sei nel cantiere di..." senza dire prima il nome
        // suona come un sistema che ti sorveglia; con il nome davanti suona
        // come qualcuno che ti riconosce.
        val saluti = "Ehi, ciao $NOME_UTENTE. "
        return if (qui.soloQuesta) {
            saluti + "Ho visto che sei nel cantiere di ${qui.cliente.nome}, " +
                "e qui hai aperta solo ${qui.commessa.descrizione}. È corretto?"
        } else {
            saluti + "Ho visto che sei nel cantiere di ${qui.cliente.nome}, " +
                "ma qui ha più di un lavoro aperto. Su quale hai lavorato?"
        }
    }

    private fun azzera() {
        _rapportino.value = Rapportino()
        cervello.ricomincia()
        _messaggio.value = ""
    }

    /**
     * Wisper smette di parlare e passa la parola, subito.
     *
     * Il "poi" della frase interrotta non parte: [Voce.zitta] scarta le
     * richiamate, quindi il giro non prosegue per conto suo. Da qui in avanti
     * comanda quello che dira' il tecnico.
     */
    private fun interrompiIlParlato() {
        registro("interrotto_a_voce", "")
        voce.zitta()
        beep.startTone(ToneGenerator.TONE_PROP_ACK, 90)
        ascolta()
    }

    private fun ascolta() {
        // Il microfono torna al trascrittore: durante il parlato lo teneva
        // Vosk, per poter sentire l'interruzione.
        wake.pausa()
        _fase.value = Fase.ASCOLTO
        _trascrizione.value = ""
        trascrittore.avvia(
            onParziale = { _trascrizione.value = it },
            onEsito = { esito, testo -> main.post { suDetto(esito, testo) } },
        )
    }

    private fun suDetto(esito: Trascrittore.Esito, testo: String?) {
        _trascrizione.value = ""

        // Il microfono si e' guastato davvero: questo si dice, perche' chi non
        // guarda lo schermo non ha altro modo di accorgersene.
        if (esito == Trascrittore.Esito.GUASTO) {
            rispondi("Ho un problema col microfono.") { chiudiGiro() }
            return
        }

        // Silenzio: NON e' un errore, e' una pausa. Non si commenta.
        // Chi si e' fermato a pensare lo sa gia' di essersi fermato, e sentirsi
        // dire "non ho sentito" mentre si guarda un impianto e' solo fastidio.
        // Si riprova in silenzio, e dopo qualche giro si chiude senza dire
        // niente: la palla che torna bianca e' gia' la risposta.
        if (esito == Trascrittore.Esito.SILENZIO || testo.isNullOrBlank()) {
            silenziDiFila++
            if (silenziDiFila >= SILENZI_PRIMA_DI_CHIUDERE) {
                chiudiGiro()
            } else {
                ascolta()
            }
            return
        }
        silenziDiFila = 0

        // Il "sì" al cantiere proposto non ha bisogno di nessun ragionamento:
        // cliente e commessa sono gia' scritti nella scheda da prima che il
        // tecnico rispondesse. Mandarlo al modello vuol dire aspettare due
        // secondi per sentirsi dire, con parole sue, quello che gia' sappiamo,
        // e ogni tanto anche il codice della commessa letto ad alta voce.
        // Quindi la risposta a questo turno la diamo noi, subito.
        if (cantiereDaConfermare && suonaComeUnSi(testo)) {
            cantiereDaConfermare = false
            val frase = "Ottimo, e cos'hai fatto oggi?"
            cervello.ricordaScambio(testo, frase)
            rispondi(frase) { ascolta() }
            return
        }
        cantiereDaConfermare = false

        if (!cervello.configurato) {
            rispondi("Non ho la chiave per capire quello che dici.") { chiudiGiro() }
            return
        }

        _fase.value = Fase.PENSA
        val mia = conversazione
        scope.launch {
            val risposta = try {
                cervello.elabora(testo, _anagrafiche.value, _rapportino.value)
            } catch (e: Exception) {
                registro("cervello_errore", e.message ?: e.javaClass.simpleName)
                if (mia == conversazione) {
                    rispondi("Non riesco a collegarmi. Riprova fra un attimo.") { chiudiGiro() }
                }
                return@launch
            }

            // Nel frattempo l'utente puo' aver spento lo schermo: la risposta
            // e' di una conversazione che non esiste piu' e va buttata, non
            // pronunciata.
            if (mia != conversazione) {
                registro("risposta_scartata", "conversazione chiusa nel frattempo")
                return@launch
            }

            // I campi si aggiornano PRIMA di parlare: cosi' chi guarda vede
            // comparire il dato e poi sente la conferma, non il contrario.
            //
            // "Ho finito" in italiano vuol dire due cose: ho finito di parlare
            // e ho finito il lavoro. Il modello sceglieva la seconda e chiudeva
            // commesse che il tecnico aveva appena dichiarato aperte.
            //
            // Due controlli, non uno: ci sono cascato scegliendone uno per volta.
            //  - sulle PAROLE, perche' "no ho finito" a volte il modello lo
            //    classifica "aggiorna" e un controllo sull'azione non scatta;
            //  - sull'AZIONE, perche' "si confermo salva" non e' una frase di
            //    chiusura riconoscibile a parole, ma e' comunque un turno in cui
            //    non si stanno dando dati nuovi.
            // Su un campo che cambia lo stato del foglio, due reti sono giuste.
            // ...con un'eccezione: se Wisper aveva APPENA chiesto se il lavoro
            // e' finito, allora "ho finito" e' la risposta a quella domanda e
            // vale davvero. Le stesse parole cambiano senso a seconda di cosa
            // e' stato chiesto un attimo prima — bloccarle sempre significava
            // non poter piu' rispondere.
            val turnoDiChiusura = !hoAppenaChiestoLoStato() && (
                risposta.azione == Azione.CONFERMA ||
                    risposta.azione == Azione.SALVA ||
                    chiudeIlDiscorso(testo)
                )
            val patch =
                if (turnoDiChiusura) risposta.dati.copy(statoCommessa = null)
                else risposta.dati
            val commessaPrima = _rapportino.value.commessa

            // Il modello, quando non trova il lavoro che gli hai nominato, a
            // volte ripiega sulla commessa piu' simile fra quelle aperte. Se
            // le parole del tecnico e quella commessa non hanno niente in
            // comune, quel lavoro e' nuovo e va aperto: non si accetta il
            // ripiego.
            val ripiego = commessaDiRipiego(patch, commessaPrima, risposta.commessaDetta)
            if (ripiego != null) {
                _rapportino.value = _rapportino.value.aggiorna(patch.copy(commessa = null))
                registro("commessa_ripiego_rifiutato", ripiego)
                creaCommessa(risposta.copy(nuovoNome = ripiego, frase = ""))
                return@launch
            }

            _rapportino.value = _rapportino.value.aggiorna(patch)

            when (risposta.azione) {
                Azione.AGGIORNA ->
                    rispondi(conLaCommessaGiusta(risposta.frase, commessaPrima)) { ascolta() }

                // Il riepilogo finale NON lo scrive il modello: lo costruiamo
                // dai campi. E' l'unico punto in cui il tecnico da' l'ok a
                // qualcosa che non puo' vedere, quindi cio' che sente deve
                // venire dalla stessa fonte di cio' che verra' salvato.
                Azione.CONFERMA -> {
                    val r = _rapportino.value
                    val commessa = _anagrafiche.value.descrizioneCommessa(r.commessa)
                    ultimaEraRiepilogo = true
                    rispondi(r.riletturaAdAltaVoce(commessa)) { ascolta() }
                }
                Azione.ANNULLA -> {
                    azzera()
                    rispondi(risposta.frase) { ascolta() }
                }
                Azione.CREA_CLIENTE -> creaCliente(risposta)
                Azione.CREA_COMMESSA -> creaCommessa(risposta)
                Azione.SALVA -> salva(risposta.frase)
            }
        }
    }

    // ---------------------------------------------- anagrafiche dettate a voce

    /**
     * Crea un cliente nuovo nel foglio mentre si parla, e lo imposta sul
     * rapportino in corso.
     *
     * Le anagrafiche vengono ricaricate subito dopo: servono al cervello per
     * riconoscere quel nome nelle frasi successive. Senza, il tecnico lo
     * creerebbe e poi Wisper non saprebbe piu' chi e'.
     */
    private suspend fun creaCliente(risposta: RispostaWisper) {
        val nome = risposta.nuovoNome
        if (nome.isNullOrBlank()) {
            rispondi("Non ho capito il nome del cliente.") { ascolta() }
            return
        }
        _fase.value = Fase.SALVA
        _messaggio.value = "Creo il cliente…"
        try {
            val creato = ponte.creaCliente(nome)
            _anagrafiche.value = ponte.caricaAnagrafiche()
            _rapportino.value = _rapportino.value.aggiorna(Rapportino(cliente = creato.nome))
            registro("cliente_creato", "${creato.id} ${creato.nome}")
            annunciate += "${creato.nome} come nuovo cliente"
            // L'annuncio lo scrivo io, non il modello: aggiungere una riga
            // all'anagrafica dell'azienda va detto sempre e con le stesse
            // parole, non "se al modello viene in mente".
            rispondi("Ok, aggiungo ${creato.nome} come nuovo cliente. ${risposta.frase}") {
                ascolta()
            }
        } catch (e: Exception) {
            registro("cliente_non_creato", e.message ?: "sconosciuto")
            rispondi("Non sono riuscito a creare il cliente sul foglio.") { ascolta() }
        }
    }

    private suspend fun creaCommessa(risposta: RispostaWisper) {
        val desc = risposta.nuovoNome
        if (desc.isNullOrBlank()) {
            rispondi("Non ho capito che commessa vuoi aprire.") { ascolta() }
            return
        }
        // La commessa nasce sotto un cliente: senza, non si sa dove metterla.
        val idCliente = _anagrafiche.value.clienti
            .firstOrNull { it.nome.equals(_rapportino.value.cliente?.trim(), ignoreCase = true) }
            ?.id
        if (idCliente.isNullOrBlank()) {
            rispondi("Prima dimmi per quale cliente, poi apro la commessa.") { ascolta() }
            return
        }
        _fase.value = Fase.SALVA
        _messaggio.value = "Apro la commessa…"
        try {
            val creata = ponte.creaCommessa(idCliente, desc)
            _anagrafiche.value = ponte.caricaAnagrafiche()
            _rapportino.value = _rapportino.value.aggiorna(Rapportino(commessa = creata.id))
            registro("commessa_creata", "${creata.id} ${creata.descrizione}")
            annunciate += "${creata.descrizione} come nuova commessa"
            // La coda della frase la porta il modello, tranne quando e' stato
            // proprio lui a sbagliare commessa: in quel caso il suo seguito
            // nomina il lavoro che avevamo appena scartato, e ci si sentirebbe
            // dire due nomi diversi nella stessa frase. Allora la scriviamo noi.
            val coda = risposta.frase.trim().ifBlank {
                _rapportino.value.domandaSuCosaManca()?.let { "$it." } ?: "Altro, o salvo?"
            }
            rispondi("Ok, aggiungo ${creata.descrizione} come nuova commessa. $coda") {
                ascolta()
            }
        } catch (e: Exception) {
            registro("commessa_non_creata", e.message ?: "sconosciuto")
            rispondi("Non sono riuscito ad aprire la commessa sul foglio.") { ascolta() }
        }
    }

    private fun salva(fraseDiChiusura: String) {
        _fase.value = Fase.SALVA
        _messaggio.value = "Salvo…"
        scope.launch {
            try {
                // Rete di sicurezza: se il rapportino nomina un cliente o una
                // commessa che nel foglio non esistono, si creano PRIMA di
                // salvare. Senza, la riga finirebbe nel foglio con un nome
                // scritto a mano e l'anagrafica non imparerebbe niente: domani
                // Wisper non lo riconoscerebbe ancora.
                val (r, aggiunte) = creaCioCheManca(_rapportino.value)
                _rapportino.value = r

                val id = ponte.salva(r)
                registro("salvato", id)

                // Appena la riga e' scritta si parla. Tutto il resto — cambiare
                // lo stato della commessa, ricaricare l'anagrafica — sono altri
                // due viaggi di rete, e farli PRIMA di rispondere lasciava il
                // tecnico ad aspettare in silenzio per secondi, chiedendosi se
                // avesse funzionato. Il dato che conta e' gia' al sicuro.
                // Le aggiunte all'anagrafica si dicono: sono modifiche al foglio
                // dell'azienda, non dettagli. Se Wisper le ha gia' annunciate
                // durante la conversazione non si ripetono.
                val avviso = aggiunte.filterNot { annunciate.contains(it) }
                    .joinToString("") { " Ho aggiunto anche $it." }
                rispondi(fraseDiChiusura + avviso) { azzera(); chiudiGiro() }

                // Il rapportino racconta la giornata, questo cambia il mondo:
                // va fatto, ma non davanti a nessuno che aspetta.
                aggiornaStatoCommessa(r)
            } catch (e: Exception) {
                registro("salvataggio_fallito", e.message ?: "sconosciuto")
                // Non si dice mai "salvato" se non e' vero: e' l'unica cosa che
                // il tecnico non puo' verificare da solo con le mani occupate.
                rispondi(
                    "Attenzione: non sono riuscito a salvare sul foglio. Il rapportino resta qui."
                ) { chiudiGiro() }
            }
        }
    }

    /**
     * Vero se la frase e' solo un modo per dire "ho finito di parlare".
     *
     * Sono le frasi in cui "finito" si riferisce al DISCORSO, non al lavoro:
     * corte, senza altri dati dentro. Se il tecnico dice "ho finito il lavoro,
     * non devo tornarci" la frase e' piu' lunga e non ricade qui — quello e'
     * un dato vero e va scritto.
     */
    /**
     * Vero se l'ultima cosa detta da Wisper era la domanda sullo stato del
     * lavoro. Si riconosce dalle parole, perche' la domanda la formula il
     * modello e cambia ogni volta: "l'hai finito o ci devi tornare?",
     * "il lavoro e' concluso?", "ci devi tornare?".
     */
    private fun hoAppenaChiestoLoStato(): Boolean {
        if (ultimaEraRiepilogo) return false
        val f = ultimaFrase.lowercase(java.util.Locale.ITALIAN)
        if (!f.contains("?")) return false
        return listOf("finito", "tornarci", "tornare", "concluso", "chiuso", "aperto")
            .any { f.contains(it) }
    }

    private fun chiudeIlDiscorso(testo: String): Boolean {
        val pulito = testo.lowercase(java.util.Locale.ITALIAN)
            .replace(Regex("[^a-zàèéìòù ]"), " ")
            .replace(Regex(" +"), " ")
            .trim()
        if (pulito.split(' ').size > 4) return false
        return CHIUSURE_DISCORSO.any { pulito == it || pulito.endsWith(" $it") }
    }

    /** Cio' che Wisper ha gia' annunciato di aver aggiunto, per non ripeterlo. */
    private val annunciate = mutableSetOf<String>()

    /**
     * Crea nel foglio il cliente e la commessa che il rapportino nomina ma che
     * l'anagrafica non conosce, e restituisce il rapportino con i nomi e i
     * codici veri.
     *
     * L'ordine conta: prima il cliente, perche' una commessa senza un cliente
     * a cui appartenere non si puo' creare.
     *
     * @return il rapportino aggiornato e l'elenco di cio' che e' stato aggiunto.
     */
    private suspend fun creaCioCheManca(iniziale: Rapportino): Pair<Rapportino, List<String>> {
        var r = iniziale
        val aggiunte = mutableListOf<String>()
        val note = _anagrafiche.value

        val nomeCliente = r.cliente?.trim()
        var idCliente = note.clienti
            .firstOrNull { it.nome.equals(nomeCliente, ignoreCase = true) }?.id

        if (!nomeCliente.isNullOrBlank() && idCliente == null) {
            runCatching { ponte.creaCliente(nomeCliente) }
                .onSuccess { creato ->
                    idCliente = creato.id
                    r = r.copy(cliente = creato.nome)
                    aggiunte += "${creato.nome} come nuovo cliente"
                    registro("cliente_creato", "${creato.id} ${creato.nome}")
                }
                .onFailure { registro("cliente_non_creato", it.message ?: "sconosciuto") }
        }

        // La commessa che non corrisponde a nessun codice noto e' una commessa
        // nuova, e cio' che il tecnico ha detto ne e' la descrizione.
        val commessa = r.commessa?.trim()
        val codiceNoto = note.commesse.any { it.id.equals(commessa, ignoreCase = true) }
        if (!commessa.isNullOrBlank() && !codiceNoto && !idCliente.isNullOrBlank()) {
            runCatching { ponte.creaCommessa(idCliente!!, commessa) }
                .onSuccess { creata ->
                    r = r.copy(commessa = creata.id)
                    aggiunte += "${creata.descrizione} come nuova commessa"
                    registro("commessa_creata", "${creata.id} ${creata.descrizione}")
                }
                .onFailure { registro("commessa_non_creata", it.message ?: "sconosciuto") }
        }

        if (aggiunte.isNotEmpty()) {
            runCatching { _anagrafiche.value = ponte.caricaAnagrafiche() }
        }
        return r to aggiunte
    }

    /**
     * Allinea lo STATO della commessa nel foglio a quanto detto dal tecnico.
     * Gira in sottofondo, dopo che Wisper ha gia' risposto: se fallisce non si
     * perde niente di importante, e alla prossima conversazione l'anagrafica
     * viene comunque riletta.
     */
    private fun aggiornaStatoCommessa(r: Rapportino) {
        val codice = r.commessa
        val stato = r.statoCommessa
        if (codice.isNullOrBlank() || stato == null) return

        val eraGiaCosi = _anagrafiche.value.commesse
            .firstOrNull { it.id.equals(codice, ignoreCase = true) }
            ?.stato?.equals(stato.parlato, ignoreCase = true) == true
        if (eraGiaCosi) return

        scope.launch {
            try {
                ponte.impostaStatoCommessa(codice, stato.parlato)
                _anagrafiche.value = ponte.caricaAnagrafiche()
                registro("commessa_aggiornata", "$codice -> ${stato.parlato}")
            } catch (e: Exception) {
                registro("commessa_non_aggiornata", e.message ?: "sconosciuto")
            }
        }
    }

    /**
     * La descrizione da aprire come commessa nuova, quando il modello ha
     * ripiegato su una gia' esistente che non c'entra. Null se e' tutto a posto.
     *
     * IL CASO, visto sul telefono l'08/08. Dicendo "la commessa e' la
     * manutenzione della caldaia", che nel foglio non c'e', il modello ha
     * scritto M001, cioe' FV Fara Vicentino, l'unica aperta per quel cliente.
     * E' il tipo di errore peggiore che possa fare, perche' e' invisibile: il
     * tecnico non guarda lo schermo, sente "ok" e va avanti, e a fine mese
     * quelle ore risultano su un lavoro dove non ha mai messo piede.
     *
     * COME SI RICONOSCE. Non serve capire il senso: bastano le parole. Il
     * modello riporta in "commessaDetta" come il tecnico ha chiamato il lavoro,
     * e si guarda se quelle parole e la descrizione della commessa scelta ne
     * hanno almeno una in comune. "Quella dei pannelli a Fara" e "FV Fara
     * Vicentino" condividono Fara: e' la stessa. "Manutenzione della caldaia" e
     * "FV Fara Vicentino" non condividono niente: e' un altro lavoro.
     *
     * COSA SI FA. Si apre la commessa nuova, dicendolo ad alta voce. Non si
     * chiede: chiedere vuol dire un turno in piu' a ogni lavoro nuovo, e i
     * lavori nuovi capitano di continuo. Se ha sbagliato lui, dice "cancella
     * tutto" e si ricomincia.
     *
     * Vale solo quando la commessa CAMBIA in questo turno e solo se il tecnico
     * l'ha davvero nominata: se non ha detto niente sul lavoro, il modello che
     * mette l'unica commessa aperta del cliente sta facendo la cosa giusta.
     */
    private fun commessaDiRipiego(
        patch: Rapportino,
        prima: String?,
        detta: String?,
    ): String? {
        val codice = patch.commessa?.trim()?.takeIf { it.isNotBlank() } ?: return null
        if (codice == prima) return null
        val nome = detta?.trim()?.takeIf { it.isNotBlank() } ?: return null
        // Se il codice non esiste ci pensa gia' la creazione automatica al
        // salvataggio: qui interessa solo il ripiego su una commessa VERA.
        val vera = _anagrafiche.value.descrizioneCommessa(codice) ?: return null
        return if (parlaDi(nome, vera)) null else nome
    }

    /**
     * Se in questo turno e' cambiata la commessa, la frase deve chiamarla col
     * nome che ha davvero nel foglio.
     *
     * Trovato sul telefono l'08/08. Dicendo "la commessa e' la manutenzione
     * della caldaia", che nel foglio non esiste, il modello ha assegnato
     * l'unica commessa aperta di quel cliente — scelta ragionevole, e' l'unica
     * possibile — ma poi ha detto ad alta voce il nome che avevo pronunciato
     * io, non quello che aveva scritto. Sullo schermo c'era "FV Fara
     * Vicentino", nelle orecchie "manutenzione caldaia".
     *
     * E' lo stesso difetto dei chilometri annunciati e mai salvati, e fa male
     * per lo stesso motivo: il tecnico non sta guardando lo schermo, sente
     * confermare una cosa e ci crede. Quindi quando la commessa cambia la
     * frase la scriviamo qui, dai campi. Si perde la scorrevolezza del
     * modello e si guadagna che quel che si sente e quel che si salva escono
     * dallo stesso posto.
     *
     * Se il modello stava gia' parlando della commessa giusta non si tocca
     * niente, ed e' il caso normale: riscrivere la sua frase costa la conferma
     * di tutto il resto — ore, chilometri, spese — che su quel turno sparirebbe.
     *
     * "Parlava della commessa giusta" non vuol dire averne ripetuto il nome
     * lettera per lettera. "FV Fara Vicentino" detto da una persona diventa
     * "la commessa a Fara Vicentino", ed e' la stessa cosa. Basta una parola
     * riconoscibile in comune: chi ha capito il lavoro sbagliato non ne
     * azzecca nessuna, come "manutenzione caldaia" contro "FV Fara Vicentino".
     */
    private fun conLaCommessaGiusta(frase: String, prima: String?): String {
        val r = _rapportino.value
        val codice = r.commessa ?: return frase
        if (codice == prima) return frase
        val vera = _anagrafiche.value.descrizioneCommessa(codice) ?: return frase
        if (parlaDi(frase, vera)) return frase

        registro("commessa_rinominata", "il modello la chiamava altrimenti, è $vera")
        val poi = r.domandaSuCosaManca()?.let { "$it." } ?: "Altro, o salvo?"
        return "Ho segnato $vera. $poi"
    }

    /**
     * Se la frase nomina davvero quel lavoro, anche detto con parole sue.
     *
     * Si guardano solo le parole abbastanza lunghe da distinguere qualcosa:
     * "FV" e "di" starebbero in qualunque frase e direbbero il falso. Sotto le
     * quattro lettere non si decide niente.
     */
    private fun parlaDi(frase: String, descrizione: String): Boolean {
        val f = frase.lowercase()
        val parole = descrizione.lowercase()
            .split(Regex("[^\\p{L}\\p{N}]+"))
            .filter { it.length >= 4 }
        // Una descrizione fatta solo di sigle non ha appigli: meglio dirla noi
        // per intero che fidarsi.
        if (parole.isEmpty()) return false
        return parole.any { f.contains(it) }
    }

    private fun rispondi(frase: String, poi: () -> Unit) {
        _fase.value = Fase.PARLA
        _messaggio.value = frase
        // Si ricorda solo cio' che e' una domanda vera, non le riprese: se no
        // ripetendo si finirebbe a dire "Dicevo: dicevo: dicevo...".
        if (!frase.startsWith("Dicevo:")) ultimaFrase = frase
        // Ogni frase che non sia il riepilogo azzera il segno. Il riepilogo lo
        // rialza subito prima di chiamare questa, quindi non si perde.
        if (!frase.startsWith("Oggi hai lavorato per")) ultimaEraRiepilogo = false

        // Mentre parla, il microfono e' libero — la voce esce dall'altoparlante,
        // non entra. Lo si da' a Vosk, che cosi' puo' sentire l'interruzione.
        // Nessun rischio che si attivi da solo: Wisper il proprio nome non lo
        // pronuncia mai.
        riprendiOrecchio()

        voce.parla(frase) { main.post(poi) }
    }

    private fun chiudiGiro() {
        _fase.value = Fase.RIPOSO
        _trascrizione.value = ""
        trascrittore.ferma()
        riprendiOrecchio()              // handoff inverso: il microfono torna a Vosk
    }
}
