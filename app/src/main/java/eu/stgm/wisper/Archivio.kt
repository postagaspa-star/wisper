package eu.stgm.wisper

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import eu.stgm.wisper.rapportino.Allegato
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Attivita
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Preventivo
import eu.stgm.wisper.rapportino.StatoAttivita
import eu.stgm.wisper.rapportino.VoceListino
import eu.stgm.wisper.rapportino.Calcolo
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.CodaInvii
import eu.stgm.wisper.rapportino.IdRichiesta
import eu.stgm.wisper.rapportino.Strade
import eu.stgm.wisper.rapportino.Commessa
import eu.stgm.wisper.rapportino.Configurazione
import eu.stgm.wisper.rapportino.Conti
import eu.stgm.wisper.rapportino.Conto
import eu.stgm.wisper.rapportino.CopiaLocale
import eu.stgm.wisper.rapportino.Documento
import eu.stgm.wisper.rapportino.DocumentiCommessa
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Giornata
import eu.stgm.wisper.rapportino.Giornate
import eu.stgm.wisper.rapportino.Salvataggio
import eu.stgm.wisper.rapportino.Stato
import eu.stgm.wisper.rapportino.Dashboard
import eu.stgm.wisper.rapportino.DatiPartitaIva
import eu.stgm.wisper.rapportino.Dispositivo
import eu.stgm.wisper.rapportino.FileCestino
import eu.stgm.wisper.rapportino.FiltroRegistro
import eu.stgm.wisper.rapportino.Numerazione
import eu.stgm.wisper.rapportino.PaginaRegistro
import eu.stgm.wisper.rapportino.Permessi
import eu.stgm.wisper.rapportino.Prestazione
import eu.stgm.wisper.rapportino.Referente
import eu.stgm.wisper.rapportino.Sede
import eu.stgm.wisper.rapportino.Sessione
import eu.stgm.wisper.rapportino.StatoCopie
import eu.stgm.wisper.rapportino.Utente
import eu.stgm.wisper.rapportino.testo
import eu.stgm.wisper.rapportino.DaApprovare
import eu.stgm.wisper.rapportino.ElencoOre
import eu.stgm.wisper.rapportino.ElencoSpese
import eu.stgm.wisper.rapportino.ElencoTrasferte
import eu.stgm.wisper.rapportino.ElencoVeicoli
import eu.stgm.wisper.rapportino.EsitoApprovazione
import eu.stgm.wisper.rapportino.FilaOreSpese
import eu.stgm.wisper.rapportino.InvioFase3
import eu.stgm.wisper.rapportino.RiepilogoSpese
import eu.stgm.wisper.rapportino.RigaOre
import eu.stgm.wisper.rapportino.Rimborsi
import eu.stgm.wisper.rapportino.EsecutoreFase4
import eu.stgm.wisper.rapportino.ServizioFase4
import eu.stgm.wisper.rapportino.ServizioFase5
import eu.stgm.wisper.rapportino.CodaFase5
import eu.stgm.wisper.rapportino.InvioFase5
import eu.stgm.wisper.rapportino.Scaffale
import eu.stgm.wisper.rapportino.Spesa
import eu.stgm.wisper.rapportino.StatisticheOre
import eu.stgm.wisper.rapportino.StatoVoce
import eu.stgm.wisper.rapportino.TestiCoda
import eu.stgm.wisper.rapportino.TimerFermato
import eu.stgm.wisper.rapportino.TimerLetto
import eu.stgm.wisper.rapportino.Trasferta
import eu.stgm.wisper.rapportino.Veicolo
import eu.stgm.wisper.rapportino.VoceDaApprovare
import eu.stgm.wisper.rapportino.VoceRimborso
import eu.stgm.wisper.rapportino.UtenteSalvato
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Un rapportino come lo si vede sul telefono: quello che dice il foglio, con
 * sopra quello che e' stato fatto qui e non e' ancora arrivato.
 *
 * @param conto del foglio se il rapportino e' quello del foglio; ricalcolato
 *        con [Calcolo] se e' stato cambiato sul telefono e non e' ancora partito.
 * @param errore il motivo per cui il foglio ha rifiutato qualcosa di questo rapportino.
 */
data class Vista(
    val rapportino: Rapportino,
    val conto: Conto? = rapportino.conto,
    val inCoda: Boolean = false,
    val cambiatoQui: Boolean = false,
    val fotoInAttesa: List<File> = emptyList(),
    val firmaInAttesa: File? = null,
    val errore: String = "",
)

/**
 * Tutti i dati dell'app e il loro viaggio verso il server di Wisper (dalla fase 1
 * del gestionale; prima era il foglio Google, e molti nomi qui dentro lo ricordano).
 *
 * Le schermate leggono da qui e chiedono a qui; nessuna parla col server da
 * sola. Ogni modifica va prima nella [CodaInvii] (cioe' su disco) e solo dopo
 * parte: cosi' quello che si vede e' sempre quello che e' al sicuro. Se l'accesso
 * scade la coda si ferma e aspetta che si rientri, senza perdere niente.
 *
 * Le cose dell'ufficio (clienti, commesse, impostazioni, documenti, email) invece
 * si fanno in diretta e tornano un Result: sono rare, si fanno con calma, e
 * chi le fa vuole sapere subito se sono andate.
 */
class Archivio(private val ctx: Context) : Dati {

    val configurazione = Configurazione(ctx)
    private val ponte = PonteServer({ configurazione.server }, { configurazione.token }, {
        mapOf(
            "disp" to configurazione.dispositivo,
            "dispNome" to configurazione.nomeDispositivo,
            "app" to "telefono ${BuildConfig.VERSION_NAME}",
        )
    }, google = { configurazione.google })
    private val coda = CodaInvii(ctx)
    private val copia = CopiaLocale(ctx)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Un invio alla volta: il lavoratore in sottofondo e l'app non mandano mai la stessa cosa due volte. */
    private val invio = Mutex()

    init {
        // La regola di casa (docs/gestionale/porta-google.md §8.1): quando cambia la rete
        // (Wi-Fi e dati, un'altra Wi-Fi) casa o Google si sceglie di nuovo alla prossima richiesta.
        runCatching {
            ctx.getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = ponte.reteCambiata()
                override fun onLost(network: Network) = ponte.reteCambiata()
            })
        }
    }

    /** Da dove è arrivata l'ultima risposta del server: in ufficio (casa) o attraverso Google. */
    val dove: StateFlow<Strade.Dove?> get() = ponte.strade.dove

    /** Il campanello degli aggiornamenti (progetti.md §6): lo suona WisperApp con l'app davanti e il server di casa. */
    val campanello: eu.stgm.wisper.rapportino.Campanello by lazy {
        eu.stgm.wisper.rapportino.Campanello(ponte.strade::indirizzoCampanello, ponte.strade.clientCampanello, traccia = { android.util.Log.d("Campanello", it) })
    }

    private val _anagrafiche = MutableStateFlow(copia.anagrafiche())
    override val anagrafiche: StateFlow<Anagrafiche> = _anagrafiche.asStateFlow()

    /** L'ultimo elenco letto dal foglio (gli ultimi mesi), aggiornato a ogni risposta. */
    private val _dalFoglio = MutableStateFlow(copia.rapportini())

    /** Tutti i rapportini del foglio, l'ultima volta che li si e' letti tutti. Vuoto finche' non succede. */
    private val _storicoFoglio = MutableStateFlow(copia.storico())

    private val _coda = MutableStateFlow(coda.tutte())
    override val operazioni: StateFlow<List<CodaInvii.Operazione>> = _coda.asStateFlow()

    data class Aggiornamento(
        val inCorso: Boolean = false,
        val ultimo: LocalDateTime? = null,
        val errore: String = "",
    )

    private val _aggiornamento = MutableStateFlow(Aggiornamento())
    override val aggiornamento: StateFlow<Aggiornamento> = _aggiornamento.asStateFlow()

    override val viste: StateFlow<List<Vista>> = combine(_dalFoglio, _coda, _anagrafiche, ::componi)
        .stateIn(scope, SharingStarted.Eagerly, componi(_dalFoglio.value, _coda.value, _anagrafiche.value))

    override val storico: StateFlow<List<Vista>> =
        combine(_storicoFoglio, _dalFoglio, _coda, _anagrafiche) { s, d, c, a -> componi(unisci(s, d), c, a) }
            .stateIn(
                scope, SharingStarted.Eagerly,
                componi(unisci(_storicoFoglio.value, _dalFoglio.value), _coda.value, _anagrafiche.value),
            )

    /**
     * Chi è entrato e cosa può fare: quello che il server ha detto l'ultima volta
     * (resta anche senza rete). [Sessione.NESSUNA] = si deve entrare; con
     * [Sessione.scaduta] la schermata di accesso dice "Sei uscito da questo dispositivo".
     */
    private val _sessione = MutableStateFlow(configurazione.sessioneSalvata())
    override val sessione: StateFlow<Sessione> = _sessione.asStateFlow()

    /** La dashboard del server, l'ultima letta (anche dopo un riavvio senza rete). */
    private val _dashboard = MutableStateFlow(copia.dashboard()?.let { runCatching { Dashboard.daJson(it) }.getOrNull() })
    override val dashboard: StateFlow<Dashboard?> = _dashboard.asStateFlow()
    private val leggoDashboard = java.util.concurrent.atomic.AtomicBoolean(false)

    override fun aggiornaDashboard() {
        if (!ponte.configurato || !leggoDashboard.compareAndSet(false, true)) return
        scope.launch {
            try {
                leggiDashboard()
            } catch (e: CancellationException) {
                throw e
            } catch (e: PonteServer.AccessoScaduto) {
                segnaUscito()
            } catch (_: Exception) {
                // Senza rete resta quella di prima; l'errore lo dice la lettura generale.
            } finally {
                leggoDashboard.set(false)
            }
        }
    }

    private suspend fun leggiDashboard() {
        val j = ponte.dashboard()
        _dashboard.value = Dashboard.daJson(j)
        // Fase 6: sul disco niente tipo delle malattie e niente giudizi di idoneità (PrivacyDisco).
        copia.scriviDashboard(eu.stgm.wisper.rapportino.PrivacyDisco.dashboard(j))
    }

    /** Le anagrafiche arrivano già con archiviati e modelli: non c'è altro da leggere. */
    override fun aggiornaArchiviati() = Unit

    /** Chi compila: chi è entrato (il server mette comunque il suo nome); senza accesso, quello di questo telefono. */
    override val tecnico: String
        get() = _sessione.value.utente.nome.ifBlank { configurazione.tecnico.ifBlank { _anagrafiche.value.tecnico } }

    /** C'è l'indirizzo del server e un token: si può parlare col server. */
    val configurato: Boolean get() = ponte.configurato

    /**
     * Entra con email e password. Se entra un'altra persona, le copie sul telefono
     * (rapportini, anagrafiche, immagini) si rifanno da capo: ognuno vede solo il
     * suo. La coda dei rapportini non si tocca: parte adesso, col nuovo accesso.
     *
     * Un no del server (password sbagliata, troppi tentativi, utente disattivato)
     * torna come [PonteServer.Rifiutato]; la rete come un altro errore.
     */
    suspend fun entra(
        email: String,
        password: String,
        server: String = configurazione.server,
        google: String = configurazione.google,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            if (server.trim() != configurazione.server) configurazione.server = server.trim()
            if (google.trim() != configurazione.google) configurazione.google = google.trim()
            configurazione.ultimaEmail = email.trim()
            val a = ponte.accedi(email, password)
            if (configurazione.idUltimoUtente.isNotBlank() && configurazione.idUltimoUtente != a.utente.id) svuotaCopie()
            configurazione.token = a.token
            configurazione.uscitoPerScadenza = false
            val s = Sessione(a.utente, a.permessi)
            configurazione.salvaSessione(s)
            _sessione.value = s
            provaONull { aggiornaIo() }
            aggiorna()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Cambia l'indirizzo del server di casa: il token di prima potrebbe non valere lì, si rientra. */
    fun cambiaServer(nuovo: String) {
        configurazione.server = nuovo.trim()
        esciQui(perScadenza = false)
    }

    /**
     * Cambia l'indirizzo della porta Google. Il server è lo stesso (lo script passa
     * le richieste al NAS): chi è entrato resta dentro, la strada si sceglie di nuovo.
     */
    fun cambiaGoogle(nuovo: String) {
        configurazione.google = nuovo.trim()
        ponte.reteCambiata()
    }

    /** Il server ha detto "accesso scaduto": si torna alla schermata di accesso, la coda aspetta. */
    private fun segnaUscito() {
        if (configurazione.token.isBlank() && _sessione.value.utente.id.isBlank()) return
        esciQui(perScadenza = true)
        _aggiornamento.update { it.copy(inCorso = false, errore = "Sei uscito da questo dispositivo: entra di nuovo") }
    }

    private fun esciQui(perScadenza: Boolean) {
        // Chi esce non riceve più i promemoria delle sue attività su questo telefono.
        Promemoria.programma(ctx, emptyList(), "")
        configurazione.token = ""
        configurazione.uscitoPerScadenza = perScadenza
        _sessione.value = Sessione.NESSUNA.copy(scaduta = perScadenza)
        // Fase 6 (§3.13): le copie per lavorare senza rete (la mia scheda, le assenze, i mezzi)
        // e i documenti personali aperti si tolgono all'uscita dall'account. La coda resta.
        fase6.togliRiservati()
        // Fase 7: le copie di messaggi, notifiche e portale sono di chi è entrato.
        fase7.svuota()
    }

    /** Un'altra persona: via le copie lette dal server (non la coda, che è ancora da mandare). */
    private fun svuotaCopie() {
        copia.svuota()
        _dalFoglio.value = emptyList()
        _storicoFoglio.value = emptyList()
        _anagrafiche.value = Anagrafiche()
        _dashboard.value = null
        _preventivi.value = emptyList()
        _dettagli.value = emptyMap()
        _listino.value = emptyList()
        _attivita.value = emptyList()
        _oreLette.value = null
        _timer.value = null
        _speseLette.value = null
        _trasferteLette.value = null
        fase5.scaffale.svuota()
        fase6.togliRiservati()
        fase7.svuota()
        Promemoria.programma(ctx, emptyList(), "")
    }

    /** Chi sono e cosa posso: i permessi cambiati da Amministrazione valgono subito. */
    private suspend fun aggiornaIo() {
        val io = ponte.io()
        configurazione.titolare = io.titolare
        configurazione.ragioneSociale = io.ragioneSociale
        if (io.utente.id.isNotBlank()) {
            val s = Sessione(io.utente, io.permessi, interfaccia = io.interfaccia)
            configurazione.salvaSessione(s)
            _sessione.value = s
        }
    }

    /**
     * Quando ogni rapportino e' stato scritto qui l'ultima volta (un contatore,
     * non un'ora). Una lettura del foglio partita prima non lo riporta indietro:
     * il foglio l'ha letto quando la modifica non c'era ancora.
     */
    private val scrittoAl = ConcurrentHashMap<String, Long>()
    private val contatore = AtomicLong()

    // ------------------------------------------------------------- lettura

    /** Rilegge clienti, commesse e rapportini. Con [mese], legge anche quel mese (per sfogliare indietro). */
    override val esempio: Boolean = false

    override fun aggiorna(mese: YearMonth?) {
        scope.launch { aggiornaOra(mese) }
        programmaInvio()
    }

    override fun aggiornaStorico() {
        scope.launch { aggiornaOra(tutti = true) }
        programmaInvio()
    }

    private suspend fun aggiornaOra(mese: YearMonth? = null, tutti: Boolean = false) {
        if (!ponte.configurato) {
            _aggiornamento.update { it.copy(inCorso = false, errore = "Entra in Wisper per leggere i dati") }
            return
        }
        _aggiornamento.update { it.copy(inCorso = true) }
        try {
            aggiornaIo()
            val ana = ponte.anagrafiche()
            _anagrafiche.value = ana
            copia.scriviAnagrafiche(ana)

            // Gli ultimi sei mesi bastano per tutti i giorni; quelli prima si
            // leggono solo quando li si sfoglia, o quando l'ufficio li vuole tutti.
            val oggi = LocalDate.now()
            val inizio = contatore.get()
            // Dal 03/11/2026 ogni funzione si spegne (progetti.md §5): con Rapportini spenta (o senza il permesso)
            // i rapportini non si chiedono, il server direbbe di no. Restano quelli già sul telefono.
            val leggeRapportini = _sessione.value.permessi.let { it.livelli.isEmpty() || it.vede(Moduli.RAPPORTINI) }
            if (leggeRapportini && tutti) {
                val letti = ponte.rapportiniTutti()
                _storicoFoglio.update { vecchi -> applica(vecchi, letti, inizio) { false } }
                copia.scriviStorico(_storicoFoglio.value)
                // I recenti si allineano: quelli degli ultimi mesi, piu' quelli gia'
                // sfogliati. Uno che nel foglio non c'e' piu' (annullato dal computer) sparisce.
                val da = oggi.withDayOfMonth(1).minusMonths(5)
                val a = YearMonth.from(oggi).plusMonths(1).atEndOfMonth()
                _dalFoglio.update { vecchi ->
                    val gia = chiavi(vecchi)
                    applica(vecchi, letti.filter { (!it.data.isBefore(da) && !it.data.isAfter(a)) || it.dentro(gia) }, inizio) { false }
                }
                copia.scriviRapportini(_dalFoglio.value)
            } else if (leggeRapportini) {
                val da = mese?.atDay(1) ?: oggi.withDayOfMonth(1).minusMonths(5)
                val a = mese?.atEndOfMonth() ?: YearMonth.from(oggi).plusMonths(1).atEndOfMonth()
                val letti = ponte.rapportini(da, a)
                val fuori = { r: Rapportino -> r.data < da || r.data > a }
                _dalFoglio.update { vecchi -> applica(vecchi, letti, inizio, fuori) }
                copia.scriviRapportini(_dalFoglio.value)
                if (_storicoFoglio.value.isNotEmpty()) {
                    _storicoFoglio.update { vecchi -> applica(vecchi, letti, inizio, fuori) }
                    copia.scriviStorico(_storicoFoglio.value)
                }
            }
            _aggiornamento.value = Aggiornamento(ultimo = LocalDateTime.now())
            // La Dashboard spenta non si chiede (progetti.md §5): l'app si apre sulla prima voce accesa.
            if (!tutti && _sessione.value.permessi.let { it.livelli.isEmpty() || it.vede(Moduli.DASHBOARD) }) provaONull { leggiDashboard() }
            // Fase 2: preventivi e attività, se il ruolo li vede. Senza rete resta l'ultima lettura.
            if (!tutti) {
                provaONull { leggiPreventivi() }
                provaONull { leggiAttivita() }
                // Fase 3: gli elenchi già aperti. 07/11/2026: il timer non si legge più (le Ore non ci sono più).
                periodoOre?.let { (da, a) -> provaONull { leggiOre(da, a) } }
                meseSpese?.let { provaONull { leggiSpese(it) } }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: PonteServer.AccessoScaduto) {
            segnaUscito()
        } catch (e: Exception) {
            _aggiornamento.update { it.copy(inCorso = false, errore = spiega(e)) }
        }
    }

    /**
     * L'elenco dopo una lettura: quelli letti, piu' i vecchi che la lettura non
     * copriva ([fuori]). Un rapportino scritto qui mentre la lettura era in corso
     * vince su quello letto, e resta anche se la lettura non l'aveva ancora.
     */
    private fun applica(
        vecchi: List<Rapportino>,
        letti: List<Rapportino>,
        inizio: Long,
        fuori: (Rapportino) -> Boolean,
    ): List<Rapportino> {
        val appenaScritti = vecchi.filter { (scrittoAl[it.idLocale] ?: 0L) > inizio }
        val chiaviScritti = chiavi(appenaScritti)
        val chiaviLetti = chiavi(letti)
        val tenuti = vecchi.filter { fuori(it) && !it.dentro(chiaviLetti) && !it.dentro(chiaviScritti) }
        return tenuti + letti.filterNot { it.dentro(chiaviScritti) } + appenaScritti
    }

    /** Lo storico con sopra i recenti: dove ci sono tutti e due vincono i recenti, che sono quelli di ogni giorno. */
    private fun unisci(tutti: List<Rapportino>, recenti: List<Rapportino>): List<Rapportino> {
        if (tutti.isEmpty()) return recenti
        val chiaviRecenti = chiavi(recenti)
        return tutti.filterNot { it.dentro(chiaviRecenti) } + recenti
    }

    /** idLocale e numero RAP/...: i rapportini del primo Wisper si riconoscono solo dal numero. */
    private fun chiavi(lista: List<Rapportino>): Set<String> =
        lista.flatMapTo(HashSet()) { r -> if (r.id.isNotBlank()) listOf(r.idLocale, r.id) else listOf(r.idLocale) }

    private fun Rapportino.dentro(chiavi: Set<String>) = idLocale in chiavi || (id.isNotBlank() && id in chiavi)

    /**
     * La tariffa da proporre per un cliente a tariffa libera: quella dell'ultimo
     * rapportino scritto per lui. Prima quelli ancora sul telefono (sono i piu'
     * recenti), poi quella che il foglio si ricorda, poi l'ultimo rapportino letto.
     */
    override fun tariffaProposta(cliente: Cliente?, nomeCliente: String): Double? {
        val nome = Anagrafiche.normalizza(cliente?.nome ?: nomeCliente)
        if (nome.isEmpty()) return null
        fun suo(r: Rapportino) = (cliente != null && r.idCliente == cliente.id) ||
            Anagrafiche.normalizza(r.cliente) == nome
        // Anche i lavori dei rapportini in coda (06/11/2026): il piu' recente scritto per lui.
        _coda.value.flatMap { op ->
            when (op.tipo) {
                CodaInvii.Tipo.SALVA -> listOfNotNull(op.rapportino)
                CodaInvii.Tipo.GIORNATA -> op.giornata()?.lavori.orEmpty()
                else -> emptyList()
            }
        }.lastOrNull(::suo)?.tariffa?.takeIf { it > 0 }?.let { return it }
        cliente?.ultimaTariffa?.takeIf { it > 0 }?.let { return it }
        return _dalFoglio.value.filter(::suo).maxByOrNull { it.data }?.tariffa?.takeIf { it > 0 }
    }

    // ------------------------------------------------------------- modifiche



    override fun salva(r: Rapportino) {
        coda.salva(r)
        dopoModifica()
    }

    /** Il rapportino coi suoi lavori (06/11/2026): in coda tutto insieme, parte una volta sola. */
    override fun salvaGiornata(g: Giornata) {
        coda.giornata(g)
        dopoModifica()
    }

    /**
     * Elimina il rapportino intero (solo se i lavori sono tutti da inviare: lo decide chi chiama). Quello mai arrivato al
     * server sparisce dalla coda con le foto dei suoi lavori; i lavori gia' sul server diventano annullati e si
     * recuperano da li'.
     */
    override fun eliminaGiornata(g: Giornata) {
        coda.tutte().filter { it.tipo == CodaInvii.Tipo.GIORNATA && it.idLocale == g.idLocale }.forEach { coda.togli(it.idOp) }
        g.lavori.map { it.idLocale }.distinct().forEach { id -> eliminaSenzaInvio(id) }
        dopoModifica()
    }

    /**
     * Una foto gia' ridotta da [Immagini.preparaFoto]. Si accoda DOPO il
     * salvataggio del rapportino: lo script mette la foto sulla riga, e la
     * riga deve esistere.
     */
    override fun accodaFoto(idLocale: String, file: File) {
        coda.foto(idLocale, file.nameWithoutExtension, file.path)
        dopoModifica()
    }

    override suspend fun preparaFoto(sorgente: Uri): File = withContext(Dispatchers.IO) {
        Immagini.preparaFoto(ctx, sorgente).second
    }

    /** Una foto ancora sul telefono si toglie e basta; una gia' sul foglio va tolta anche li'. */
    override fun togliFoto(idLocale: String, remota: FileRemoto?, locale: File?) {
        if (locale != null) {
            coda.tutte().firstOrNull { it.tipo == CodaInvii.Tipo.FOTO && it.percorso == locale.path }
                ?.let { coda.togli(it.idOp) }
            locale.delete()
        }
        if (remota != null) coda.togliFoto(idLocale, remota.id)
        dopoModifica()
    }

    override suspend fun firma(idLocale: String, disegno: Bitmap, firmatario: String): Unit = withContext(Dispatchers.IO) {
        val (idFile, file) = Immagini.salvaFirma(ctx, disegno)
        coda.firma(idLocale, idFile, file.path, firmatario, LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
        dopoModifica()
    }

    /**
     * Torna in bozza per poterlo correggere. La firma cade: il cliente ha
     * firmato quello che c'era, e se cambia quella firma non vale piu'.
     * Una firma che non e' ancora partita si toglie e basta.
     */
    override fun riportaInBozza(idLocale: String) {
        inBozza(idLocale)
        dopoModifica()
    }

    /** Torna l'operazione messa in coda, o null se e' bastato togliere una firma non ancora partita. */
    private fun inBozza(idLocale: String): String? {
        val firmeInAttesa = coda.diRapportino(idLocale).filter { it.tipo == CodaInvii.Tipo.FIRMA }
        firmeInAttesa.forEach { coda.togli(it.idOp); File(it.percorso).delete() }
        val remoto = remotoDi(idLocale)
        // Anche un cambio di stato ancora in coda (inviato, fatturato) va riportato indietro.
        val statoInCoda = coda.diRapportino(idLocale).any { it.tipo == CodaInvii.Tipo.STATO && it.stato != Stato.BOZZA }
        return if ((remoto != null && remoto.stato != Stato.BOZZA) || statoInCoda) coda.stato(idLocale, Stato.BOZZA).idOp else null
    }

    /** Un rapportino mai arrivato sul foglio sparisce; uno gia' sul foglio diventa ANNULLATO e si recupera da li'. */
    override fun elimina(idLocale: String) {
        eliminaSenzaInvio(idLocale)
        dopoModifica()
    }

    private fun eliminaSenzaInvio(idLocale: String): String? {
        if (remotoDi(idLocale) == null) {
            coda.diRapportino(idLocale).forEach { op ->
                coda.togli(op.idOp)
                if (op.percorso.isNotBlank()) File(op.percorso).delete()
            }
            return null
        }
        return coda.stato(idLocale, Stato.ANNULLATO).idOp
    }

    /** Il foglio aveva rifiutato: si riprova (dopo aver sistemato, per esempio, il codice). */
    override fun riprova(idOp: String) {
        coda.tutte().firstOrNull { it.idOp == idOp }?.let { coda.aggiorna(it.copy(errore = "", tentativi = 0)) }
        dopoModifica()
    }

    /** Il foglio aveva rifiutato e non serve piu': si butta, e con lei il suo file. */
    override fun scarta(idOp: String) {
        val tutte = coda.tutte()
        tutte.firstOrNull { it.idOp == idOp }?.let { op ->
            coda.togli(op.idOp)
            if (op.percorso.isNotBlank()) File(op.percorso).delete()
            // Fase 6: i km e il guasto mai arrivati si portano via le loro foto.
            if (op.tipo == CodaInvii.Tipo.KM || op.tipo == CodaInvii.Tipo.GUASTO) {
                val foto = if (op.tipo == CodaInvii.Tipo.KM) CodaInvii.Tipo.FOTO_KM else CodaInvii.Tipo.FOTO_GUASTO
                tutte.filter { it.tipo == foto && it.idLocale == op.idLocale }.forEach { f ->
                    coda.togli(f.idOp)
                    if (f.percorso.isNotBlank()) File(f.percorso).delete()
                }
            }
            // Una spesa mai arrivata si porta via il suo scontrino: senza spesa non avrebbe dove andare.
            if (op.tipo == CodaInvii.Tipo.SPESA && op.idRemoto.isBlank()) {
                tutte.filter { it.tipo == CodaInvii.Tipo.FOTO_SPESA && it.idLocale == op.idLocale && it.idRemoto.isBlank() }.forEach { f ->
                    coda.togli(f.idOp)
                    if (f.percorso.isNotBlank()) File(f.percorso).delete()
                }
            }
        }
        dopoModifica()
    }

    /**
     * Gli stati passano dalla coda come il resto. Le regole sono quelle del
     * computer: "Segna inviati" salta i fatturati, FIRMATO non si segna (serve la
     * firma). Si guarda lo stato come si vede qui, coda compresa.
     */
    override fun cambiaStato(idLocali: List<String>, stato: Stato): CambioStato {
        val adesso = compostiOra()
        val prima = LinkedHashMap<String, Stato>()
        val operazioni = LinkedHashMap<String, String>()
        for (id in idLocali.distinct()) {
            val v = adesso[id] ?: continue
            val ora = v.rapportino.stato
            when (stato) {
                Stato.INVIATO -> if (ora != Stato.FATTURATO && ora != Stato.INVIATO) {
                    prima[id] = ora
                    operazioni[id] = coda.stato(id, Stato.INVIATO).idOp
                }
                Stato.FATTURATO -> if (ora != Stato.FATTURATO) {
                    prima[id] = ora
                    operazioni[id] = coda.stato(id, Stato.FATTURATO).idOp
                }
                Stato.BOZZA -> if (ora != Stato.BOZZA || v.firmaInAttesa != null) {
                    prima[id] = ora
                    inBozza(id)?.let { operazioni[id] = it }
                }
                Stato.ANNULLATO -> {
                    prima[id] = ora
                    eliminaSenzaInvio(id)?.let { operazioni[id] = it }
                }
                Stato.FIRMATO -> Unit
            }
        }
        // Qualche secondo prima di partire: il tempo dell'Annulla, che cosi' toglie
        // il cambio dalla coda invece di rimandarlo indietro sul foglio.
        if (prima.isNotEmpty()) dopoModifica(ritardoSecondi = ATTESA_ANNULLA)
        return CambioStato(stato, prima, operazioni)
    }

    override fun annullaCambioStato(cambio: CambioStato): Int {
        // Se il lavoratore sta mandando la coda, il cambio puo' essere gia' in viaggio:
        // allora non lo si toglie, si manda quello indietro dopo.
        val inViaggio = invio.isLocked
        val inCoda = coda.tutte().associateBy { it.idOp }
        var tornati = 0
        for ((id, prima) in cambio.prima) {
            val idOp = cambio.operazioni[id]
            if (idOp != null && !inViaggio && inCoda[idOp] != null) {
                coda.togli(idOp)
                tornati++
                continue
            }
            if (idOp == null) continue   // tolto dal telefono e basta: non c'e' niente da rimandare
            // Gia' partito: si rimanda indietro dove lo script lo permette.
            // Riportare in bozza, invece, ha tolto la firma: quella non torna.
            if (cambio.stato == Stato.BOZZA) continue
            val ora = compostiOra()[id]?.rapportino?.stato ?: remotoDi(id)?.stato ?: continue
            if (ora == prima) { tornati++; continue }
            if (prima == Stato.BOZZA || prima == Stato.INVIATO || prima == Stato.FATTURATO) {
                coda.stato(id, prima)
                tornati++
            }
        }
        if (tornati > 0) dopoModifica()
        return tornati
    }

    private fun dopoModifica(ritardoSecondi: Long = 0) {
        _coda.value = coda.tutte()
        programmaInvio(ritardoSecondi)
    }

    // ------------------------------------------------------------- l'ufficio, in diretta

    /** Un cliente o un fornitore, con tutti i campi (salvaSoggetto, §12.5). */
    override suspend fun salvaCliente(cliente: Cliente, nuovo: Boolean): Result<Salvataggio<Cliente>> = inDiretta {
        if (cliente.nome.isBlank()) throw PonteServer.Rifiutato("Scrivi il nome o la ragione sociale")
        if (!nuovo && cliente.id.isBlank()) throw PonteServer.Rifiutato("Manca il codice del cliente")
        val salvato = ponte.salvaSoggetto(cliente, nuovo, costi, fatturazione)
        mettiInAnagrafica { a -> conSoggetto(a, salvato.dato) }
        rileggiAnagrafiche()
        salvato
    }

    /** Chi è entrato vede i soldi: solo allora tariffe e importi si mandano. */
    private val costi: Boolean get() = _sessione.value.permessi.costi

    /** Fase 4: sostituto d'imposta, pagamento e "come si fattura" si mandano solo a chi vede le fatture. */
    private val fatturazione: Boolean get() = _sessione.value.permessi.vede(eu.stgm.wisper.rapportino.Moduli.FATTURAZIONE)

    /** Un soggetto al suo posto: clienti, fornitori, archiviati. */
    private fun conSoggetto(a: Anagrafiche, s: Cliente): Anagrafiche {
        fun dentro(l: List<Cliente>, si: Boolean) = if (si) sostituisci(l, s) { it.id == s.id } else l.filterNot { it.id == s.id }
        return a.copy(
            clienti = dentro(a.clienti, s.cliente && !s.archiviato),
            fornitori = dentro(a.fornitori, s.fornitore && !s.archiviato),
            archiviati = dentro(a.archiviati, s.archiviato),
        )
    }

    override suspend fun salvaCommessa(commessa: Commessa, nuova: Boolean): Result<Salvataggio<Commessa>> = inDiretta {
        if (commessa.idCliente.isBlank()) throw PonteServer.Rifiutato("Scegli il cliente della commessa")
        if (commessa.descrizione.isBlank()) throw PonteServer.Rifiutato("Scrivi come si chiama la commessa")
        val ana = _anagrafiche.value
        val cliente = ana.cliente(commessa.idCliente)
        val salvata = if (nuova) {
            // Il codice proposto (il prossimo libero) lo sceglie lo script: se nel frattempo
            // il computer l'ha dato a un'altra, lo script prende il primo libero invece di dire di no.
            val proposto = ana.prossimoCodiceCommessa(LocalDate.now().year)
            val codice = commessa.id.trim().uppercase().takeUnless { it == proposto }.orEmpty()
            ponte.creaCommessa(commessa.copy(id = codice), cliente, costi, fatturazione)
        } else {
            if (commessa.id.isBlank()) throw PonteServer.Rifiutato("Manca il codice della commessa")
            Salvataggio(ponte.aggiornaCommessa(commessa, cliente, costi, fatturazione))
        }
        mettiInAnagrafica { a ->
            a.copy(commesse = sostituisci(a.commesse, salvata.dato) { it.id.equals(salvata.dato.id, ignoreCase = true) })
        }
        rileggiAnagrafiche()
        salvata
    }

    override suspend fun cambiaCodiceCommessa(id: String, nuovoCodice: String): Result<Commessa> = inDiretta {
        val (nuova, vecchio) = try {
            ponte.cambiaCodiceCommessa(id, nuovoCodice)
        } catch (e: java.io.IOException) {
            // Niente rete: la frase di questa azione. Il resto (server lento, porta Google) si spiega come sempre.
            if (e is java.net.UnknownHostException || e is java.net.ConnectException || e is java.net.NoRouteToHostException)
                throw PonteServer.Rifiutato("Serve la rete per cambiare il codice")
            throw e
        }
        val conPrima = nuova.copy(codicePrecedente = nuova.codicePrecedente.ifBlank { vecchio })
        // Subito anche qui: la commessa col codice nuovo, che si trova anche col vecchio (Anagrafiche.commessa).
        mettiInAnagrafica { a ->
            a.copy(
                commesse = sostituisci(a.commesse.filterNot { it.id.equals(vecchio, ignoreCase = true) }, conPrima) { it.id.equals(conPrima.id, ignoreCase = true) },
                progetti = a.progetti.map { if (it.idCommessa.equals(vecchio, ignoreCase = true)) it.copy(idCommessa = conPrima.id) else it },
            )
        }
        rileggiAnagrafiche()
        // I rapportini del server col codice nuovo; quelli ancora in coda partono col vecchio, e il server li riconosce.
        aggiorna()
        conPrima
    }

    override suspend fun salvaImpostazioni(valori: Map<String, String>): Result<Map<String, String>> = inDiretta {
        val pronti = valori.mapValues { (k, v) ->
            val t = v.trim()
            if (k in Anagrafiche.IMPOSTAZIONI_NUMERICHE && t.isNotEmpty()) {
                Numeri.leggi(t) ?: throw PonteServer.Rifiutato(
                    Anagrafiche.erroreNumerica(k)
                )
            } else t
        }
        val imp = ponte.salvaImpostazioni(pronti)
        mettiInAnagrafica { it.copy(impostazioni = imp) }
        rileggiAnagrafiche()
        imp
    }

    override suspend fun documenti(idCommessa: String): Result<DocumentiCommessa> = inDiretta {
        ponte.documenti(idCommessa)
    }

    override suspend fun caricaDocumento(idCommessa: String, uri: Uri): Result<Documento> = inDiretta {
        val (nome, mime, dati) = leggiDalTelefono(uri)
        val f = ponte.caricaFile("documento", dati, mime, idCommessa = idCommessa, nome = nome)
        Documento(f.id, nome, f.url, mime, LocalDateTime.now())
    }

    override suspend fun caricaFirmaTecnico(png: ByteArray): Result<FileRemoto> = inDiretta {
        val f = ponte.caricaFile("firmaTecnico", png, "image/png")
        copia.scriviFileDelFoglio(f.id, png, "image/png")
        // Lo script la scrive in FIRMA_TECNICO: si vede subito, anche se la rilettura non riesce.
        mettiInAnagrafica { it.copy(impostazioni = it.impostazioni + (Anagrafiche.FIRMA_TECNICO to f.url)) }
        rileggiAnagrafiche()
        f
    }

    override suspend fun caricaFoglioFirmato(idLocale: String, uri: Uri, firmatario: String): Result<Rapportino> = inDiretta {
        val chi = firmatario.trim()
        if (chi.isEmpty()) throw PonteServer.Rifiutato("Scrivi il nome di chi ha firmato")
        val v = compostiOra()[idLocale] ?: throw PonteServer.Rifiutato("Rapportino non trovato")
        // Lo script non sostituisce una firma che c'e' gia': terrebbe quella vecchia senza dirlo.
        if (v.firmaInAttesa != null || (v.rapportino.firma != null && v.rapportino.bloccato)) {
            throw PonteServer.Rifiutato("Il rapportino ha già una firma: riportalo in bozza per caricarne un'altra")
        }
        val tipo = ctx.contentResolver.getType(uri)
        if (tipo != null && !tipo.startsWith("image/")) {
            throw PonteServer.Rifiutato("Serve una foto o un'immagine del foglio firmato")
        }
        prontiSulFoglio(listOf(idLocale), "La firma non è stata caricata")
        val remoto = remotoDi(idLocale)
            ?: throw PonteServer.Rifiutato("Il rapportino non è ancora arrivato al server: riprova tra poco")
        // Ridotta e raddrizzata come gli scontrini: si legge benissimo e parte in fretta.
        val (idFile, file) = Immagini.preparaFoto(ctx, uri)
        try {
            val dati = file.readBytes()
            val adesso = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
            val f = ponte.caricaFile(
                "firma", dati, "image/jpeg", idLocale = idLocale, id = remoto.id, idFile = idFile,
                firmatario = chi, firmatoIl = adesso,
            )
            copia.scriviFileDelFoglio(f.id, dati, "image/jpeg")
            // Come fa il computer: si rilegge il rapportino. Se non riesce, lo si sistema qui.
            val riletto = provaONull {
                ponte.rapportini(remoto.data, remoto.data)
                    .firstOrNull { it.idLocale == idLocale || (remoto.id.isNotBlank() && it.id == remoto.id) }
            }
            val nuovo = riletto ?: remoto.copy(
                firma = f, firmatario = chi, firmatoIl = adesso,
                stato = if (remoto.stato == Stato.INVIATO || remoto.stato == Stato.FATTURATO) remoto.stato else Stato.FIRMATO,
            )
            sostituisciRemoti(listOf(nuovo))
            nuovo
        } finally {
            file.delete()
        }
    }

    override suspend fun inviaEmail(
        a: String,
        cc: String,
        oggetto: String,
        messaggio: String,
        pdf: File?,
        idLocali: List<String>,
        aMe: Boolean,
    ): Result<List<Rapportino>> = inDiretta(email = true) {
        if (!aMe && a.isBlank()) {
            throw PonteServer.Rifiutato("Manca l'indirizzo: scrivilo qui (lo puoi salvare nella scheda del cliente)")
        }
        // Le modifiche in coda di questi rapportini partono prima: l'email li segna
        // inviati, e dopo il foglio rifiuterebbe una correzione arrivata in ritardo.
        if (!aMe) prontiSulFoglio(idLocali, "L'email non è partita")
        val allegati = pdf?.let { listOf(Allegato(it.name, mimeDi(it.name), it.readBytes())) }.orEmpty()
        val tornati = ponte.inviaEmail(a, cc, oggetto, messaggio, allegati, idLocali.map(::chiaveFoglio), aMe)
        sostituisciRemoti(tornati)
        tornati
    }

    override suspend fun file(id: String): Pair<ByteArray, String>? = withContext(Dispatchers.IO) {
        if (id.isBlank()) return@withContext null
        copia.fileDelFoglio(id)?.let { return@withContext it }
        // Le foto e le firme fatte con questo telefono ci sono gia', anche quelle ancora in coda.
        Immagini.fotoLocale(ctx, id)?.let { f -> provaONull { f.readBytes() }?.let { return@withContext it to "image/jpeg" } }
        File(Immagini.cartellaFirme(ctx), "$id.png").takeIf { it.exists() }
            ?.let { f -> provaONull { f.readBytes() }?.let { return@withContext it to "image/png" } }
        val scaricato = try {
            ponte.file(id)
        } catch (e: CancellationException) {
            throw e
        } catch (e: PonteServer.AccessoScaduto) {
            segnaUscito()
            throw Exception(NON_SCARICA + "sei uscito da questo dispositivo: entra di nuovo", e)
        } catch (e: PonteServer.Rifiutato) {
            // Il server ha risposto: se dice di no per il collegamento e' un errore; se dice
            // di no per il file (non c'e' piu', e' nel cestino, non e' ancora stato copiato da
            // Drive, non lo puoi vedere) il file non c'e', e il PDF si fa senza, come sul computer.
            if (erroreDiCollegamento(e.message.orEmpty())) throw Exception(NON_SCARICA + spiegaInDiretta(e), e)
            return@withContext null
        } catch (e: Exception) {
            // Rete o Google: MAI null, se no il rapportino firmato partirebbe col riquadro della firma vuoto.
            throw Exception(NON_SCARICA + spiegaInDiretta(e), e)
        }
        copia.scriviFileDelFoglio(id, scaricato.first, scaricato.second)
        scaricato
    }

    /** I no che non riguardano il file: l'indirizzo, una risposta che non è del server. */
    private fun erroreDiCollegamento(messaggio: String): Boolean {
        val m = messaggio.lowercase()
        return listOf("indirizzo", "risposta non valida").any { it in m }
    }

    override fun perStampa(idLocali: List<String>): DatiStampa {
        // Composti adesso, non dallo storico: un cambio di stato di un attimo fa deve gia' esserci.
        val tutte = compostiOra()
        val scelte = idLocali.distinct().mapNotNull { tutte[it] }
        val ana = _anagrafiche.value
        val conConti = scelte.conConti()
        return DatiStampa(
            rapportini = scelte.map { v ->
                v.rapportino.comeDalFoglio(v.conto, v.fotoInAttesa.map { it.nameWithoutExtension }, v.firmaInAttesa?.nameWithoutExtension)
            },
            anagrafiche = ana.aJson(),
            intestatario = Conti.intestatarioRiepilogo(conConti, ana).aJson(),
            periodo = Conti.periodoDi(conConti),
        )
    }

    /**
     * Fa il lavoro e ne fa un Result con un messaggio da mostrare. Mai ripetuto
     * da solo: chi l'ha chiesto vede com'e' andata e decide.
     */
    private suspend fun <T> inDiretta(email: Boolean = false, lavoro: suspend () -> T): Result<T> =
        withContext(Dispatchers.IO) {
            try {
                Result.success(lavoro())
            } catch (e: CancellationException) {
                throw e
            } catch (e: PonteServer.AccessoScaduto) {
                segnaUscito()
                Result.failure(Exception("Sei uscito da questo dispositivo: entra di nuovo", e))
            } catch (e: Exception) {
                Result.failure(Exception(spiegaInDiretta(e, email), e))
            }
        }

    /**
     * Prima di un'azione in diretta su questi rapportini, le loro modifiche in coda
     * devono essere arrivate: l'ordine e' quello in cui le cose sono state fatte.
     */
    private suspend fun prontiSulFoglio(idLocali: Collection<String>, cosaNonEPartito: String) {
        val ids = idLocali.toSet()
        // Anche il rapportino in coda che ha dentro uno di questi lavori (06/11/2026).
        fun riguarda(op: CodaInvii.Operazione) = op.idLocale in ids ||
            (op.tipo == CodaInvii.Tipo.GIORNATA && op.giornata()?.lavori?.any { it.idLocale in ids } == true)
        if (coda.tutte().none(::riguarda)) return
        mandaCoda()
        if (coda.tutte().none(::riguarda)) return
        throw PonteServer.Rifiutato(
            if (coda.tutte().any { it.rifiutata }) {
                "Prima va sistemata una modifica che il server ha rifiutato (la vedi nella Dashboard). $cosaNonEPartito"
            } else {
                "Le ultime modifiche di questi rapportini non sono ancora arrivate al server. $cosaNonEPartito: riprova quando c'è rete"
            }
        )
    }

    private suspend fun rileggiAnagrafiche() {
        provaONull { ponte.anagrafiche() }?.let { ana ->
            _anagrafiche.value = ana
            copia.scriviAnagrafiche(ana)
        }
    }

    private fun mettiInAnagrafica(cambia: (Anagrafiche) -> Anagrafiche) {
        _anagrafiche.update(cambia)
        copia.scriviAnagrafiche(_anagrafiche.value)
    }

    /** Al suo posto se c'era, in fondo se e' nuovo. */
    private fun <T> sostituisci(lista: List<T>, nuovo: T, stesso: (T) -> Boolean): List<T> =
        if (lista.any(stesso)) lista.map { if (stesso(it)) nuovo else it } else lista + nuovo

    /** Nome, tipo e contenuto di un file scelto dal telefono. */
    private fun leggiDalTelefono(uri: Uri): Triple<String, String, ByteArray> {
        val cr = ctx.contentResolver
        var nome: String? = null
        var dimensione = -1L
        runCatching {
            cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    nome = c.getString(0)
                    if (!c.isNull(1)) dimensione = c.getLong(1)
                }
            }
        }
        if (dimensione > MASSIMO_DOCUMENTO) throw PonteServer.Rifiutato(TROPPO_GRANDE)
        val dati = cr.openInputStream(uri)?.use { input ->
            // Letto a pezzi con un limite: un file enorme non deve riempire la memoria.
            val out = java.io.ByteArrayOutputStream()
            val pezzo = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(pezzo)
                if (n < 0) break
                out.write(pezzo, 0, n)
                if (out.size() > MASSIMO_DOCUMENTO) throw PonteServer.Rifiutato(TROPPO_GRANDE)
            }
            out.toByteArray()
        } ?: throw PonteServer.Rifiutato("Non riesco a leggere il file")
        val n = nome?.takeIf { it.isNotBlank() } ?: uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: "documento"
        return Triple(n, cr.getType(uri) ?: mimeDi(n), dati)
    }

    private fun mimeDi(nome: String): String = when (nome.substringAfterLast('.', "").lowercase()) {
        "pdf" -> "application/pdf"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "doc" -> "application/msword"
        "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        "xls" -> "application/vnd.ms-excel"
        "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        "dwg" -> "application/acad"
        "txt" -> "text/plain"
        else -> "application/octet-stream"
    }

    // ------------------------------------------------------------- il gestionale (fase 1, §12)

    override suspend fun archiviaSoggetto(id: String, archivia: Boolean): Result<Unit> = inDiretta {
        val s = ponte.archiviaSoggetto(id, archivia)
        val prima = _anagrafiche.value.soggetto(id)
        mettiInAnagrafica { a -> conSoggetto(a, if (s.nome.isNotBlank()) s else (prima ?: s).copy(archiviato = archivia)) }
        rileggiAnagrafiche()
    }

    override suspend fun controllaPartitaIva(partitaIva: String): Result<DatiPartitaIva> = inDiretta { ponte.controllaPartitaIva(partitaIva) }

    override suspend fun salvaReferente(r: Referente): Result<Referente> = inDiretta {
        val salvato = ponte.salvaReferente(r)
        mettiInAnagrafica { a -> a.copy(referenti = sostituisci(a.referenti, salvato) { it.id == salvato.id }) }
        salvato
    }

    override suspend fun togliReferente(id: String): Result<Unit> = inDiretta {
        ponte.togliReferente(id)
        mettiInAnagrafica { a -> a.copy(referenti = a.referenti.filterNot { it.id == id }) }
    }

    override suspend fun salvaSede(s: Sede): Result<Sede> = inDiretta {
        val salvata = ponte.salvaSede(s)
        mettiInAnagrafica { a -> a.copy(sedi = sostituisci(a.sedi, salvata) { it.id == salvata.id }) }
        salvata
    }

    override suspend fun archiviaSede(id: String, archivia: Boolean): Result<Unit> = inDiretta {
        ponte.archiviaSede(id, archivia)
        mettiInAnagrafica { a -> a.copy(sedi = a.sedi.map { if (it.id == id) it.copy(archiviata = archivia) else it }) }
    }

    override suspend fun salvaPrestazione(p: Prestazione): Result<Prestazione> = inDiretta {
        val salvata = ponte.salvaPrestazione(p, costi)
        // Senza i soldi il server non manda il valore: si tiene quello che c'era (che è comunque vuoto).
        mettiInAnagrafica { a -> a.copy(prestazioni = sostituisci(a.prestazioni, salvata) { it.id == salvata.id }) }
        salvata
    }

    override suspend fun togliPrestazione(id: String): Result<Unit> = inDiretta {
        ponte.togliPrestazione(id)
        mettiInAnagrafica { a -> a.copy(prestazioni = a.prestazioni.filterNot { it.id == id }) }
    }

    override suspend fun ordinaPrestazioni(idCommessa: String, ordine: List<String>): Result<Unit> = inDiretta {
        val nuove = ponte.ordinaPrestazioni(idCommessa, ordine)
        mettiInAnagrafica { a ->
            if (nuove.isEmpty()) a.copy(prestazioni = a.prestazioni.map { p -> ordine.indexOf(p.id).takeIf { it >= 0 }?.let { p.copy(ordine = it + 1) } ?: p })
            else a.copy(prestazioni = a.prestazioni.filterNot { it.idCommessa.equals(idCommessa, ignoreCase = true) } + nuove)
        }
    }

    override suspend fun duplicaCommessa(id: String, comeModello: Boolean): Result<Commessa> = inDiretta {
        val nuova = ponte.duplicaCommessa(id, comeModello)
        mettiInAnagrafica { a -> a.copy(commesse = sostituisci(a.commesse, nuova) { it.id.equals(nuova.id, ignoreCase = true) }) }
        rileggiAnagrafiche()
        nuova
    }

    override suspend fun archiviaCommessa(id: String, archivia: Boolean): Result<Unit> = inDiretta {
        ponte.archiviaCommessa(id, archivia)
        mettiInAnagrafica { a -> a.copy(commesse = a.commesse.map { if (it.id.equals(id, ignoreCase = true)) it.copy(archiviata = archivia) else it }) }
        rileggiAnagrafiche()
    }

    override suspend fun utenti(): Result<List<Utente>> = inDiretta { ponte.utenti() }

    /**
     * Un utente nuovo riceve la password iniziale dal server; per uno che c'è già,
     * una [password] non vuota vuol dire "Nuova password" (la sceglie il server).
     */
    override suspend fun salvaUtente(u: Utente, password: String): Result<UtenteSalvato> = inDiretta {
        if (u.id.isNotBlank() && password.isNotBlank()) {
            UtenteSalvato(u, ponte.nuovaPassword(u.id))
        } else {
            val s = ponte.salvaUtente(u)
            rileggiAnagrafiche()
            s
        }
    }

    override suspend fun dispositivi(idUtente: String): Result<List<Dispositivo>> = inDiretta { ponte.sessioni(idUtente) }
    override suspend fun scollega(idDispositivo: String): Result<Unit> = inDiretta { ponte.revocaSessione(idDispositivo) }
    override suspend fun permessiRuoli(): Result<Map<String, Permessi>> = inDiretta { ponte.permessi() }

    override suspend fun salvaPermesso(ruolo: String, modulo: String, livello: Int): Result<Unit> = inDiretta {
        ponte.salvaPermesso(ruolo, modulo, livello)
        // Se è il ruolo di chi è entrato, vale subito anche qui.
        if (_sessione.value.utente.ruolo == ruolo) provaONull { aggiornaIo() }
    }

    override suspend fun registro(filtro: FiltroRegistro): Result<PaginaRegistro> = inDiretta { ponte.registro(filtro) }

    override suspend fun salvaNumerazione(n: Numerazione): Result<Numerazione> = inDiretta {
        val salvata = ponte.salvaNumerazione(n)
        mettiInAnagrafica { a -> a.copy(numerazioni = sostituisci(a.numerazioni, salvata) { it.tipo == salvata.tipo }) }
        salvata
    }

    override suspend fun cestino(): Result<List<FileCestino>> = inDiretta { ponte.cestino() }
    override suspend fun ripristinaFile(id: String): Result<Unit> = inDiretta { ponte.ripristinaFile(id) }
    override suspend fun copie(): Result<StatoCopie> = inDiretta { ponte.copie() }

    override suspend fun copiaAdesso(): Result<StatoCopie> = inDiretta {
        ponte.copiaAdesso()
        ponte.copie()
    }

    /** Il file per Excel nella cartella dei PDF: si condivide col foglio Condividi di Android. */
    override suspend fun esporta(cosa: String, filtro: FiltroRegistro?): Result<File> = inDiretta {
        val (nome, _, byte) = ponte.esporta(cosa, filtro)
        val cartella = File(ctx.cacheDir, "pdf").apply { mkdirs() }
        val sicuro = nome.replace(Regex("""[^A-Za-z0-9._ -]"""), "_").ifBlank { "wisper-$cosa.csv" }
        File(cartella, sicuro).apply { writeBytes(byte) }
    }

    override suspend fun cambiaPassword(vecchia: String, nuova: String): Result<Unit> = inDiretta { ponte.cambiaPassword(vecchia, nuova) }

    override suspend fun ripristinaRapportino(idLocale: String): Result<Rapportino> = inDiretta {
        val r = ponte.ripristinaRapportino(chiaveFoglio(idLocale))
        sostituisciRemoti(listOf(r))
        r
    }

    /**
     * Esce da questo telefono. Se il server non si raggiunge si esce lo stesso
     * qui (il token resta valido sul server finché non lo si scollega da
     * Amministrazione). I rapportini in attesa restano e partono dopo il prossimo accesso.
     */
    override suspend fun esci(): Result<Unit> = withContext(Dispatchers.IO) {
        provaONull { ponte.esci() }
        esciQui(perScadenza = false)
        Result.success(Unit)
    }

    // ------------------------------------------------------------- fase 2: preventivi

    private val _preventivi = MutableStateFlow(copia.preventivi())
    override val preventivi: StateFlow<List<Preventivo>> = _preventivi.asStateFlow()
    private val _dettagli = MutableStateFlow(copia.dettagliPreventivi())
    override val dettagliPreventivi: StateFlow<Map<String, Preventivo>> = _dettagli.asStateFlow()
    private val _listino = MutableStateFlow(copia.listino())
    override val listino: StateFlow<List<VoceListino>> = _listino.asStateFlow()

    override fun aggiornaPreventivi() {
        if (!ponte.configurato) return
        scope.launch {
            try {
                leggiPreventivi()
            } catch (e: CancellationException) {
                throw e
            } catch (e: PonteServer.AccessoScaduto) {
                segnaUscito()
            } catch (e: Exception) {
                _aggiornamento.update { it.copy(inCorso = false, errore = spiega(e)) }
            }
        }
    }

    private suspend fun leggiPreventivi() {
        // 1.4.0 (servizi.md §1): i servizi li vede anche chi fa i rapportini o le fatture (le indennità), non solo i preventivi.
        if (_sessione.value.permessi.vedeServizi) provaONull { leggiServizi() }
        if (!_sessione.value.permessi.vede(Moduli.PREVENTIVI)) return
        // Con i modelli: servono a "Nuovo preventivo · Da un modello".
        val elenco = ponte.preventivi(modelli = true)
        _preventivi.value = elenco
        copia.scriviPreventivi(elenco)
    }

    /** I servizi, anche gli archiviati (i Servizi li mostrano a parte). */
    private suspend fun leggiServizi() {
        val l = ponte.listino(tutte = true)
        _listino.value = l
        copia.scriviListino(l)
    }

    override fun aggiornaServizi() {
        if (!ponte.configurato) return
        scope.launch {
            try {
                leggiServizi()
            } catch (e: CancellationException) {
                throw e
            } catch (e: PonteServer.AccessoScaduto) {
                segnaUscito()
            } catch (e: Exception) {
                _aggiornamento.update { it.copy(inCorso = false, errore = spiega(e)) }
            }
        }
    }

    override suspend fun caricaImmagineServizio(jpg: ByteArray, perIndennita: Boolean): Result<FileRemoto> = inDiretta {
        val f = ponte.caricaFile(
            "servizio", jpg, "image/jpeg", nome = "servizio.jpg",
            idFile = java.util.UUID.randomUUID().toString().replace("-", "").take(20), per = if (perIndennita) "indennita" else "",
        )
        // Si vede subito anche senza rete: la copia resta sul telefono come le foto gia' arrivate.
        copia.scriviFileDelFoglio(f.id, jpg, "image/jpeg")
        f
    }

    /** Un preventivo arrivato dal server al suo posto: nell'elenco e fra quelli aperti. */
    private fun mettiPreventivo(p: Preventivo) {
        if (p.id.isBlank()) return
        _dettagli.update { (it - p.id) + (p.id to p) }
        copia.scriviDettagliPreventivi(_dettagli.value)
        _preventivi.update { l -> if (l.any { it.id == p.id }) l.map { if (it.id == p.id) p else it } else listOf(p) + l }
        copia.scriviPreventivi(_preventivi.value)
    }

    override suspend fun preventivo(id: String): Result<Preventivo> = inDiretta {
        ponte.preventivo(id).also(::mettiPreventivo)
    }

    override suspend fun salvaVoceListino(v: VoceListino): Result<VoceListino> = inDiretta {
        if (v.nome.isBlank()) throw PonteServer.Rifiutato("Descrizione: scrivi la descrizione del servizio")
        val salvata = ponte.salvaVoceListino(v, costi)
        _listino.update { l -> sostituisci(l, salvata) { it.id == salvata.id } }
        copia.scriviListino(_listino.value)
        salvata
    }

    override suspend fun archiviaVoceListino(id: String, archiviata: Boolean): Result<Unit> = inDiretta {
        ponte.archiviaVoceListino(id, archiviata)
        // Dalla 1.4.0 un servizio archiviato resta, fra gli archiviati (servizi.md §1).
        _listino.update { l -> l.map { if (it.id == id) it.copy(attivo = !archiviata) else it } }
        copia.scriviListino(_listino.value)
    }

    override suspend fun salvaPreventivo(p: Preventivo): Result<Preventivo> = inDiretta {
        if (p.idCliente.isBlank()) throw PonteServer.Rifiutato("Scegli il cliente del preventivo")
        if (p.oggetto.isBlank()) throw PonteServer.Rifiutato("Scrivi l'oggetto del preventivo")
        ponte.salvaPreventivo(p, costi).also(::mettiPreventivo)
    }

    override suspend fun duplicaPreventivo(id: String, comeModello: Boolean): Result<Preventivo> = inDiretta {
        ponte.duplicaPreventivo(id, comeModello).also(::mettiPreventivo)
    }

    override suspend fun nuovaRevisione(id: String): Result<Preventivo> = inDiretta {
        val nuova = ponte.nuovaRevisione(id)
        mettiPreventivo(nuova)
        // La vecchia ora è SOSTITUITO: si rilegge l'elenco.
        provaONull { leggiPreventivi() }
        nuova
    }

    override suspend fun inviaPreventivo(
        id: String, a: String, cc: String, oggetto: String, messaggio: String, pdf: File?, aMe: Boolean, conferma: Boolean,
    ): Result<Preventivo> =
        inDiretta(email = true) {
            if (!aMe && a.isBlank()) throw PonteServer.Rifiutato("Manca l'indirizzo: scrivilo qui (lo puoi salvare nella scheda del cliente)")
            val allegati = pdf?.let { listOf(Allegato(it.name, "application/pdf", it.readBytes())) }.orEmpty()
            ponte.inviaPreventivo(id, a, cc, oggetto, messaggio, allegati, aMe, conferma).also { if (!aMe) mettiPreventivo(it) }
        }

    override suspend fun segnaInviato(id: String, conferma: Boolean): Result<Preventivo> = inDiretta { ponte.segnaInviato(id, conferma).also(::mettiPreventivo) }

    override suspend fun accettaPreventivo(
        id: String, modo: String, nome: String, scelte: Map<String, Boolean>, firma: ByteArray?, documento: Uri?,
    ): Result<Preventivo> = inDiretta {
        val allegato = when {
            firma != null -> Allegato("firma.png", "image/png", firma)
            documento != null -> leggiDalTelefono(documento).let { (n, m, d) -> Allegato(n, m, d) }
            else -> null
        }
        ponte.accettaPreventivo(id, modo, nome, scelte, allegato, idFile = java.util.UUID.randomUUID().toString().replace("-", "").take(28))
            .also(::mettiPreventivo)
    }

    override suspend fun rifiutaPreventivo(id: String, motivo: String): Result<Preventivo> = inDiretta { ponte.rifiutaPreventivo(id, motivo).also(::mettiPreventivo) }

    override suspend fun riapriPreventivo(id: String): Result<Preventivo> = inDiretta {
        ponte.riapriPreventivo(id).also { mettiPreventivo(it); provaONull { leggiPreventivi() } }
    }

    override suspend fun creaCommessaDaPreventivo(id: String): Result<Commessa> = inDiretta {
        val nata = ponte.creaCommessaDaPreventivo(id)
        val m = nata.commessa
        mettiInAnagrafica { a ->
            a.copy(
                commesse = sostituisci(a.commesse, m) { it.id.equals(m.id, ignoreCase = true) },
                prestazioni = a.prestazioni.filterNot { it.idCommessa.equals(m.id, ignoreCase = true) } + nata.prestazioni,
            )
        }
        (nata.preventivo ?: provaONull { ponte.preventivo(id) })?.let(::mettiPreventivo)
        // Le prestazioni nuove della commessa arrivano con le anagrafiche.
        rileggiAnagrafiche()
        m
    }

    override fun anagrafichePerStampa(): JSONObject = _anagrafiche.value.aJson()

    // ------------------------------------------------------------- fase 2: attività

    private val _attivita = MutableStateFlow(copia.attivita())
    override val attivita: StateFlow<List<Attivita>> = _attivita.asStateFlow()

    /** La finestra delle attività lette: due mesi indietro e tre avanti, allargata da chi sfoglia il calendario. */
    @Volatile private var finestraDa: LocalDate = LocalDate.now().minusDays(60)
    @Volatile private var finestraA: LocalDate = LocalDate.now().plusDays(90)

    override fun aggiornaAttivita(da: LocalDate?, a: LocalDate?) {
        if (da != null && da.isBefore(finestraDa)) finestraDa = da
        if (a != null && a.isAfter(finestraA)) finestraA = a
        if (!ponte.configurato) return
        scope.launch {
            try {
                leggiAttivita()
            } catch (e: CancellationException) {
                throw e
            } catch (e: PonteServer.AccessoScaduto) {
                segnaUscito()
            } catch (e: Exception) {
                _aggiornamento.update { it.copy(inCorso = false, errore = spiega(e)) }
            }
        }
    }

    private suspend fun leggiAttivita() {
        if (!_sessione.value.permessi.vede(Moduli.ATTIVITA)) {
            // Attivita' spenta (progetti.md §5, "niente promemoria delle attività"): via quelli gia' messi.
            Promemoria.programma(ctx, emptyList(), "")
            return
        }
        // Due letture (§13.6): le aperte di ogni giorno, senza data comprese, per l'elenco;
        // quelle del periodo in ogni stato, per il calendario. Insieme, una volta sola ciascuna.
        val aperte = ponte.attivita(null, null)
        val periodo = ponte.attivita(finestraDa, finestraA)
        val lette = (periodo + aperte).distinctBy { it.id }
        _attivita.value = lette
        copia.scriviAttivita(lette)
        Promemoria.programma(ctx, lette, _sessione.value.utente.id)
    }

    private fun mettiAttivita(a: Attivita) {
        _attivita.update { l -> sostituisci(l, a) { it.id == a.id } }
        copia.scriviAttivita(_attivita.value)
        Promemoria.programma(ctx, _attivita.value, _sessione.value.utente.id)
    }

    override suspend fun salvaAttivita(a: Attivita, perRicorrenza: String?, conRicorrenza: Boolean, conferma: Boolean): Result<Attivita> = inDiretta {
        if (a.titolo.isBlank()) throw PonteServer.Rifiutato("Titolo: scrivi cosa c'è da fare")
        val salvata = ponte.salvaAttivita(a, perRicorrenza, conRicorrenza, conferma)
        mettiAttivita(salvata)
        // Una ricorrente cambia anche le altre occorrenze: si rilegge tutto.
        if (salvata.ricorrente || a.ricorrente) provaONull { leggiAttivita() }
        salvata
    }

    override suspend fun faiAttivita(id: String, fatta: Boolean): Result<Attivita> {
        val prima = _attivita.value.firstOrNull { it.id == id }
        // Si vede subito; se il server dice di no torna com'era.
        if (prima != null) {
            _attivita.update { l ->
                l.map { if (it.id == id) it.copy(stato = if (fatta) StatoAttivita.FATTA else StatoAttivita.DA_FARE, fattaIl = if (fatta) LocalDateTime.now().toString() else "") else it }
            }
        }
        val esito = inDiretta { ponte.faiAttivita(id, fatta) }
        esito.onSuccess { mettiAttivita(it) }.onFailure {
            if (prima != null) _attivita.update { l -> l.map { x -> if (x.id == id) prima else x } }
        }
        return esito
    }

    override suspend fun togliAttivita(id: String, perRicorrenza: String?): Result<Unit> = inDiretta {
        ponte.togliAttivita(id, perRicorrenza)
        _attivita.update { l -> l.map { if (it.id == id) it.copy(stato = StatoAttivita.ANNULLATA) else it } }
        copia.scriviAttivita(_attivita.value)
        if (!perRicorrenza.isNullOrBlank() && perRicorrenza != "questa") provaONull { leggiAttivita() }
        Promemoria.programma(ctx, _attivita.value, _sessione.value.utente.id)
    }

    override suspend fun spuntaChecklist(idAttivita: String, idVoce: String, fatta: Boolean): Result<Attivita> = inDiretta {
        val tornata = ponte.spuntaChecklist(idVoce, fatta)
        val nuova = tornata ?: _attivita.value.firstOrNull { it.id == idAttivita }?.let { a ->
            a.copy(checklist = a.checklist.map { if (it.id == idVoce) it.copy(fatta = fatta) else it })
        } ?: throw PonteServer.Rifiutato("Non trovo l'attività")
        mettiAttivita(nuova)
        nuova
    }

    override suspend fun caricaAllegatoAttivita(idAttivita: String, uri: Uri): Result<Attivita> = inDiretta {
        val (nome, mime, dati) = leggiDalTelefono(uri)
        val f = ponte.caricaFile("attivita", dati, mime, nome = nome, idAttivita = idAttivita)
        val a = _attivita.value.firstOrNull { it.id == idAttivita } ?: throw PonteServer.Rifiutato("Non trovo l'attività")
        val nuova = a.copy(allegati = a.allegati + Documento(f.id, nome, f.url, mime, LocalDateTime.now()))
        mettiAttivita(nuova)
        nuova
    }

    override suspend fun togliAllegatoAttivita(idAttivita: String, idFile: String): Result<Attivita> = inDiretta {
        val tornata = ponte.togliAllegato(idFile)
        val nuova = tornata ?: _attivita.value.firstOrNull { it.id == idAttivita }?.let { a -> a.copy(allegati = a.allegati.filterNot { it.id == idFile }) }
            ?: throw PonteServer.Rifiutato("Non trovo l'attività")
        mettiAttivita(nuova)
        nuova
    }

    // ------------------------------------------------------------- fase 3: ore, timer, approvazioni (architettura.md §14)

    private val invio3 = InvioFase3(ponte, coda, Immagini.cartellaFoto(ctx))

    private val _oreLette = MutableStateFlow(copia.fase3("ore")?.let { runCatching { ElencoOre.daJson(it) }.getOrNull() })
    override val ore: StateFlow<ElencoOre?> = combine(_oreLette, _coda, _anagrafiche, _sessione) { e, c, a, s -> oreConCoda(e, c, a, s) }
        .stateIn(scope, SharingStarted.Eagerly, oreConCoda(_oreLette.value, _coda.value, _anagrafiche.value, _sessione.value))

    /** Il periodo delle ore letto per ultimo: si rilegge dopo che la coda ha mandato qualcosa. */
    @Volatile private var periodoOre: Pair<LocalDate, LocalDate>? = null

    private val _timer = MutableStateFlow(copia.fase3("timer")?.let { runCatching { TimerLetto.daJson(it, it.optLong("lettoAlMs")) }.getOrNull() })
    override val timer: StateFlow<TimerLetto?> = _timer.asStateFlow()

    /** Le righe in coda sopra quelle lette: si vedono subito, con la nuvola, anche senza rete. */
    private fun oreConCoda(e: ElencoOre?, ops: List<CodaInvii.Operazione>, ana: Anagrafiche, s: Sessione): ElencoOre? {
        val inCoda = ops.filter { it.tipo == CodaInvii.Tipo.ORE }.map { op ->
            val corpo = op.corpoJson()
            val idNoto = op.idRemoto.ifBlank { corpo.testo("id") }
            val prima = e?.ore?.firstOrNull { idNoto.isNotBlank() && it.id == idNoto }
            RigaOre.daCorpo(corpo, op.idLocale, op.idRemoto, prima, ana, s.statoPrevisto)
                .let { r -> if (prima == null) r.copy(idUtente = s.utente.id, utente = s.utente.nome) else r }
                .copy(errore = op.errore)
        }
        if (e == null) {
            if (inCoda.isEmpty()) return null
            val lunedi = FilaOreSpese.lunedi(LocalDate.now())
            return FilaOreSpese.oreConCoda(ElencoOre(lunedi, lunedi.plusDays(6)), inCoda)
        }
        return FilaOreSpese.oreConCoda(e, inCoda)
    }

    override fun aggiornaOre(da: LocalDate, a: LocalDate) {
        periodoOre = da to a
        if (!ponte.configurato) return
        leggiInSottofondo { leggiOre(da, a) }
    }

    private suspend fun leggiOre(da: LocalDate, a: LocalDate) {
        if (!_sessione.value.permessi.vede(Moduli.RAPPORTINI)) return
        val e = ponte.ore(da, a, utente = _sessione.value.utente.id)
        _oreLette.value = e
        e.grezzo?.let { copia.scriviFase3("ore", it) }
    }

    /** Una riga tornata dal server al suo posto nell'elenco (se è del periodo letto). */
    private fun mettiOre(r: RigaOre) {
        _oreLette.update { e ->
            if (e == null || r.data.isBefore(e.da) || r.data.isAfter(e.a)) e
            else e.copy(ore = if (r.tolta.isNotBlank()) e.ore.filterNot { it.id == r.id } else sostituisci(e.ore, r) { it.id == r.id })
        }
    }

    override fun aggiornaTimer() {
        if (!ponte.configurato) return
        leggiInSottofondo { leggiTimer() }
    }

    private suspend fun leggiTimer() {
        if (!_sessione.value.permessi.vede(Moduli.RAPPORTINI)) return
        mettiTimer(ponte.timer(System.currentTimeMillis()))
    }

    private fun mettiTimer(t: TimerLetto) {
        _timer.value = t
        copia.scriviFase3("timer", JSONObject().put("timer", t.timer?.aJson() ?: JSONObject.NULL).put("adesso", t.adesso).put("lettoAlMs", t.lettoAlMs))
    }

    override suspend fun avviaTimer(idCommessa: String, descrizione: String): Result<TimerLetto> {
        val esito = inDiretta { ponte.avviaTimer(idCommessa, descrizione, oraMs = System.currentTimeMillis()).also(::mettiTimer) }
        // Già acceso (magari da un altro telefono): si rilegge, così si vede quello vero.
        if (esito.isFailure) aggiornaTimer()
        return esito
    }

    override suspend fun fermaTimer(): Result<TimerFermato> {
        val esito = inDiretta {
            val f = ponte.fermaTimer()
            mettiTimer(TimerLetto(null, "", System.currentTimeMillis()))
            mettiOre(f.riga)
            f
        }
        if (esito.isFailure) aggiornaTimer()
        else aggiornaDashboard()
        return esito
    }

    override fun salvaOre(riga: RigaOre, bozza: Boolean) {
        val chiave = riga.chiave.ifBlank { RigaOre.nuovoIdLocale() }
        coda.ore(chiave, riga.perSalvare(bozza), idRemoto = riga.id)
        dopoModifica()
    }

    override suspend fun togliOre(riga: RigaOre, annulla: Boolean): Result<Unit> {
        if (riga.id.isBlank()) {
            // Mai arrivata al server: esce dalla coda e basta (Annulla la rimette).
            if (annulla) salvaOre(riga, bozza = riga.stato == StatoVoce.BOZZA)
            else {
                coda.tutte().filter { it.tipo == CodaInvii.Tipo.ORE && it.idLocale == riga.idLocale }.forEach { coda.togli(it.idOp) }
                dopoModifica()
            }
            return Result.success(Unit)
        }
        return inDiretta {
            if (!annulla) coda.tutte().filter { it.tipo == CodaInvii.Tipo.ORE && it.idLocale == riga.chiave && !it.rifiutata }.forEach { coda.togli(it.idOp) }
            val r = ponte.togliOre(riga.id, annulla)
            mettiOre(r)
            if (annulla) periodoOre?.let { (da, a) -> provaONull { leggiOre(da, a) } }
            _coda.value = coda.tutte()
        }
    }

    override suspend fun daApprovare(): Result<DaApprovare> = inDiretta { ponte.daApprovare() }

    override suspend fun approva(voci: List<VoceDaApprovare>): Result<EsitoApprovazione> = inDiretta { ponte.approva(voci) }.also { aggiornaDashboard() }

    override suspend fun respingi(voci: List<VoceDaApprovare>, motivo: String): Result<EsitoApprovazione> = inDiretta {
        if (motivo.isBlank()) throw PonteServer.Rifiutato("Scrivi il motivo: arriva a chi l'ha scritta")
        ponte.respingi(voci, motivo)
    }.also { aggiornaDashboard() }

    override suspend fun annullaApprovazione(voci: List<VoceDaApprovare>): Result<EsitoApprovazione> =
        inDiretta { ponte.annullaApprovazione(voci) }.also { aggiornaDashboard() }

    // ------------------------------------------------------------- fase 3: spese, trasferte, rimborsi, veicoli

    private val _speseLette = MutableStateFlow(copia.fase3("spese")?.let { runCatching { ElencoSpese.daJson(it) }.getOrNull() })
    override val spese: StateFlow<ElencoSpese?> = combine(_speseLette, _coda, _anagrafiche, _sessione) { e, c, a, s -> speseConCoda(e, c, a, s) }
        .stateIn(scope, SharingStarted.Eagerly, speseConCoda(_speseLette.value, _coda.value, _anagrafiche.value, _sessione.value))

    private val _trasferteLette = MutableStateFlow(copia.fase3("trasferte")?.let { runCatching { ElencoTrasferte.daJson(it) }.getOrNull() })
    override val trasferte: StateFlow<ElencoTrasferte?> = _trasferteLette.asStateFlow()

    @Volatile private var meseSpese: YearMonth? = null

    /** Gli scontrini delle spese tolte prima di partire: l'Annulla li rimette. */
    private val scontriniTolti = ConcurrentHashMap<String, String>()

    private fun speseConCoda(e: ElencoSpese?, ops: List<CodaInvii.Operazione>, ana: Anagrafiche, s: Sessione): ElencoSpese? {
        val foto = ops.filter { it.tipo == CodaInvii.Tipo.FOTO_SPESA }
        val salvate = ops.filter { it.tipo == CodaInvii.Tipo.SPESA }
        val inCoda = salvate.map { op ->
            val corpo = op.corpoJson()
            val idNoto = op.idRemoto.ifBlank { corpo.testo("id") }
            val prima = e?.spese?.firstOrNull { idNoto.isNotBlank() && it.id == idNoto }
            Spesa.daCorpo(corpo, op.idLocale, op.idRemoto, prima, ana, s.statoPrevisto, conFoto = foto.any { it.idLocale == op.idLocale })
                .let { x -> if (prima == null) x.copy(idUtente = s.utente.id, utente = s.utente.nome) else x }
                .copy(errore = op.errore)
        } + foto.filter { f -> salvate.none { it.idLocale == f.idLocale } }.mapNotNull { f ->
            // Solo lo scontrino di una spesa già sul server.
            val id = f.idRemoto.ifBlank { f.idLocale.removePrefix("spesa:") }
            e?.spese?.firstOrNull { it.id == id }?.copy(inCoda = true, fotoInCoda = true, idLocale = f.idLocale, errore = f.errore)
        }
        if (e == null) {
            if (inCoda.isEmpty()) return null
            val m = YearMonth.now()
            return FilaOreSpese.speseConCoda(ElencoSpese(m.atDay(1), m.atEndOfMonth()), inCoda)
        }
        return FilaOreSpese.speseConCoda(e, inCoda)
    }

    override fun aggiornaSpese(mese: YearMonth) {
        meseSpese = mese
        if (!ponte.configurato) return
        leggiInSottofondo { leggiSpese(mese) }
    }

    private suspend fun leggiSpese(mese: YearMonth) {
        if (!_sessione.value.permessi.vede(Moduli.SPESE)) return
        val s = ponte.spese(mese.atDay(1), mese.atEndOfMonth())
        _speseLette.value = s
        s.grezzo?.let { copia.scriviFase3("spese", it) }
        val t = ponte.trasferte(mese.atDay(1), mese.atEndOfMonth())
        _trasferteLette.value = t
        t.grezzo?.let { copia.scriviFase3("trasferte", it) }
    }

    private fun mettiSpesa(x: Spesa) {
        _speseLette.update { e ->
            if (e == null || x.data.isBefore(e.da) || x.data.isAfter(e.a)) e
            else e.copy(spese = if (x.tolta.isNotBlank()) e.spese.filterNot { it.id == x.id } else sostituisci(e.spese, x) { it.id == x.id })
        }
    }

    override fun salvaSpesa(spesa: Spesa, foto: File?) {
        val chiave = spesa.chiave.ifBlank { Spesa.nuovoIdLocale() }
        coda.spesa(chiave, spesa.perSalvare(), idRemoto = spesa.id)
        if (foto != null) coda.fotoSpesa(chiave, foto.nameWithoutExtension, foto.path, idRemoto = spesa.id)
        dopoModifica()
    }

    override fun aggiungiScontrino(spesa: Spesa, foto: File) {
        coda.fotoSpesa(spesa.chiave.ifBlank { Spesa.nuovoIdLocale() }, foto.nameWithoutExtension, foto.path, idRemoto = spesa.id)
        dopoModifica()
    }

    override suspend fun togliSpesa(spesa: Spesa, annulla: Boolean): Result<Unit> {
        if (spesa.id.isBlank()) {
            if (annulla) {
                val foto = scontriniTolti.remove(spesa.idLocale)?.let(::File)?.takeIf { it.exists() }
                salvaSpesa(spesa, foto)
            } else {
                coda.tutte().filter { (it.tipo == CodaInvii.Tipo.SPESA || it.tipo == CodaInvii.Tipo.FOTO_SPESA) && it.idLocale == spesa.idLocale }.forEach { op ->
                    if (op.tipo == CodaInvii.Tipo.FOTO_SPESA) scontriniTolti[spesa.idLocale] = op.percorso
                    coda.togli(op.idOp)
                }
                dopoModifica()
            }
            return Result.success(Unit)
        }
        return inDiretta {
            if (!annulla) coda.tutte().filter { it.tipo == CodaInvii.Tipo.SPESA && it.idLocale == spesa.chiave && !it.rifiutata }.forEach { coda.togli(it.idOp) }
            val s = ponte.togliSpesa(spesa.id, annulla)
            mettiSpesa(s)
            if (annulla) meseSpese?.let { provaONull { leggiSpese(it) } }
            _coda.value = coda.tutte()
        }
    }

    private fun mettiTrasferta(t: Trasferta) {
        _trasferteLette.update { e ->
            if (e == null || t.dal.isBefore(e.da) || t.dal.isAfter(e.a)) e
            else e.copy(trasferte = if (t.tolta.isNotBlank()) e.trasferte.filterNot { it.id == t.id } else sostituisci(e.trasferte, t) { it.id == t.id })
        }
    }

    override suspend fun salvaTrasferta(t: Trasferta): Result<Trasferta> = inDiretta {
        if (t.destinazione.isBlank()) throw PonteServer.Rifiutato("Destinazione: scrivi dove sei andato")
        ponte.salvaTrasferta(t.perSalvare()).also { mettiTrasferta(it) }
    }

    override suspend fun togliTrasferta(id: String, annulla: Boolean): Result<Trasferta> = inDiretta {
        ponte.togliTrasferta(id, annulla).also {
            mettiTrasferta(it)
            if (annulla) meseSpese?.let { m -> provaONull { leggiSpese(m) } }
        }
    }

    override suspend fun rimborsi(): Result<Rimborsi> = inDiretta { ponte.rimborsi() }

    // ------------------------------------------------------------- fase 4: fatturazione, banche e scadenze

    /** Tutto in diretta (serve la rete): niente coda per emissioni, abbinamenti e incassi (vedi Fase4). */
    override val fase4: ServizioFase4 by lazy {
        ServizioFase4(
            ponte, ctx.cacheDir,
            object : EsecutoreFase4 {
                override suspend fun <T> esegui(lavoro: suspend () -> T): Result<T> = inDiretta { lavoro() }
            },
            dopoScrittura = { aggiornaDashboard() },
            impostazioniCambiate = { rileggiAnagrafiche() },
        )
    }

    // ------------------------------------------------------------- fase 5: documenti, ticket e assistenza

    /** Quello che si fa anche senza rete (fase5.md §3.9) va nella coda su disco, come i rapportini. */
    private val codaFase5 = object : CodaFase5 {
        override fun ticket(chiave: String, corpo: JSONObject) { coda.ticket(chiave, corpo); dopoModifica() }
        override fun azioneTicket(chiave: String, corpo: JSONObject) { coda.azioneTicket(chiave, corpo); dopoModifica() }
        override fun fotoTicket(chiave: String, file: File) { coda.fotoTicket(chiave, file.nameWithoutExtension, file.path); dopoModifica() }
        override fun faiScadenza(id: String, corpo: JSONObject) { coda.faiScadenza(id, corpo); dopoModifica() }
    }

    /** Ticket, documenti, scadenze, contratti: in diretta, tranne quello che va in coda; le letture restano sul telefono. */
    override val fase5: ServizioFase5 by lazy {
        ServizioFase5(
            ponte, ctx.cacheDir, File(ctx.filesDir, "documenti"), Scaffale(File(ctx.filesDir, "fase5")),
            object : EsecutoreFase4 {
                override suspend fun <T> esegui(lavoro: suspend () -> T): Result<T> = inDiretta { lavoro() }
            },
            codaFase5,
            dopoScrittura = { aggiornaDashboard() },
        )
    }

    private val invio5 by lazy { InvioFase5(fase5.f) }

    // ------------------------------------------------------------- fase 6: persone, mezzi e attrezzature, collaboratori

    /** Quello che si fa anche senza rete (fase6.md §3.13) va nella coda su disco, come i rapportini. */
    private val codaFase6 = object : eu.stgm.wisper.rapportino.CodaFase6 {
        override fun assenza(chiave: String, corpo: JSONObject) { coda.assenza(chiave, corpo); dopoModifica() }
        override fun annullaAssenza(id: String, corpo: JSONObject) { coda.annullaAssenza(id, corpo); dopoModifica() }
        override fun togliAssenzaInCoda(chiave: String): Boolean {
            val l = coda.tutte().filter { it.tipo == CodaInvii.Tipo.ASSENZA && it.idLocale == chiave }
            l.forEach { coda.togli(it.idOp) }
            _coda.value = coda.tutte()
            return l.isNotEmpty()
        }
        override fun km(chiave: String, corpo: JSONObject) { coda.km(chiave, corpo); dopoModifica() }
        override fun fotoKm(chiave: String, file: File) { coda.fotoKm(chiave, file.nameWithoutExtension, file.path); dopoModifica() }
        override fun guasto(chiave: String, corpo: JSONObject) { coda.guasto(chiave, corpo); dopoModifica() }
        override fun fotoGuasto(chiave: String, file: File) { coda.fotoGuasto(chiave, file.nameWithoutExtension, file.path); dopoModifica() }
        override fun prestito(chiave: String, corpo: JSONObject) { coda.prestito(chiave, corpo); dopoModifica() }
        override fun restituisci(chiave: String, corpo: JSONObject) { coda.restituisci(chiave, corpo); dopoModifica() }
        override fun firmaDpi(id: String, file: File) { coda.firmaDpi(id, file.nameWithoutExtension, file.path); dopoModifica() }
    }

    override val fase6: eu.stgm.wisper.rapportino.ServizioFase6 by lazy {
        eu.stgm.wisper.rapportino.ServizioFase6(
            ponte, Scaffale(File(ctx.filesDir, "fase6"), prefisso = "f6-"),
            object : EsecutoreFase4 {
                override suspend fun <T> esegui(lavoro: suspend () -> T): Result<T> = inDiretta { lavoro() }
            },
            codaFase6,
            idPersonaMia = { _sessione.value.idPersona },
            cartellaFile = ctx.cacheDir,
            dopoScrittura = { aggiornaDashboard() },
        )
    }

    private val invio6 by lazy { eu.stgm.wisper.rapportino.InvioFase6(fase6.f) }

    // ------------------------------------------------------------- fase 7: comunicazioni, WhatsApp, portale clienti

    /** Quello che si fa anche senza rete (fase7.md §3.20) va nella coda su disco, come i rapportini. */
    private val codaFase7 = object : eu.stgm.wisper.rapportino.CodaFase7 {
        override fun azione(chiave: String, corpo: JSONObject) { coda.azione7(chiave, corpo); dopoModifica() }
        override fun presente(chiave: String): Boolean = coda.tutte().any { it.tipo == CodaInvii.Tipo.AZIONE7 && it.idLocale == chiave && !it.rifiutata }
        override fun togli(chiave: String): Boolean {
            val l = coda.tutte().filter { it.tipo == CodaInvii.Tipo.AZIONE7 && it.idLocale == chiave && !it.rifiutata }
            l.forEach { coda.togli(it.idOp) }
            _coda.value = coda.tutte()
            return l.isNotEmpty()
        }
    }

    override val fase7: eu.stgm.wisper.rapportino.ServizioFase7 by lazy {
        eu.stgm.wisper.rapportino.ServizioFase7(
            ponte, Scaffale(File(ctx.filesDir, "fase7"), prefisso = "f7-"),
            object : EsecutoreFase4 {
                override suspend fun <T> esegui(lavoro: suspend () -> T): Result<T> = inDiretta { lavoro() }
            },
            codaFase7,
            dopoScrittura = { aggiornaDashboard() },
        )
    }

    // ------------------------------------------------------------- fase 8: integrazioni, amministrazione, controlli

    /** Tutto in diretta (fase8.md §13): dopo le scritture si rilegge la Dashboard; le impostazioni e le funzioni rileggono anagrafiche e chi sono. */
    override val fase8: eu.stgm.wisper.rapportino.ServizioFase8 by lazy {
        eu.stgm.wisper.rapportino.ServizioFase8(
            ponte, ctx.cacheDir,
            object : EsecutoreFase4 {
                override suspend fun <T> esegui(lavoro: suspend () -> T): Result<T> = inDiretta { lavoro() }
            },
            dopoScrittura = { aggiornaDashboard() },
            impostazioniCambiate = { provaONull { rileggiAnagrafiche() } },
            // Accendere o spegnere una funzione cambia menu, permessi e quello che si legge: si rilegge tutto.
            chiSonoCambiato = { provaONull { aggiornaIo() }; aggiorna() },
            scaricaEsportazione = { id -> ponte.esportazione(id) },
        )
    }

    // ------------------------------------------------------------- progetti (progetti.md, 03/11/2026)

    /** In diretta; dopo ogni scrittura si rileggono le anagrafiche (portano i progetti per il rapportino) e la Dashboard. */
    override val progetti: eu.stgm.wisper.rapportino.ServizioProgetti by lazy {
        eu.stgm.wisper.rapportino.ServizioProgetti(
            ponte,
            object : EsecutoreFase4 {
                override suspend fun <T> esegui(lavoro: suspend () -> T): Result<T> = inDiretta { lavoro() }
            },
            dopoScrittura = { provaONull { rileggiAnagrafiche() }; aggiornaDashboard() },
        )
    }

    // ------------------------------------------------------------- collegare il computer col QR (collega-qr.md §4, §7)

    /**
     * Lo stesso id di richiesta per lo stesso QR (IdRichiesta.perOperazione): se la
     * risposta si perde per strada, o dopo Riprova si inquadra lo stesso codice, il
     * server ridà la risposta di prima invece di "già usato". Per questo, se la rete
     * cade, si riprova una volta da soli: sull'emulatore la prima scrittura dopo
     * qualche secondo fermo cadeva con "unexpected end of stream" (la connessione
     * tenuta aperta che il server aveva appena chiuso).
     */
    override suspend fun autorizzaComputer(codice: eu.stgm.wisper.rapportino.CodiceCollega): Result<String> = inDiretta {
        IdRichiesta.perOperazione("collega-qr-" + codice.id) {
            try {
                ponte.autorizzaComputer(codice)
            } catch (e: java.io.IOException) {
                if (e is PonteServer.ServizioNonRaggiunto) throw e
                try {
                    ponte.autorizzaComputer(codice)
                } catch (ancora: java.io.IOException) {
                    // Sulla pagina piena una frase semplice, senza i dettagli della connessione.
                    if (ancora is PonteServer.ServizioNonRaggiunto) throw ancora
                    throw Exception("Il server non risponde: controlla la rete e riprova", ancora)
                }
            }
        }
    }

    /** La rete che manca per un giro non è un no: torna RETE e la schermata richiede fra 1,5 secondi. */
    override suspend fun statoComputer(id: String): Result<eu.stgm.wisper.rapportino.StatoComputer> = withContext(Dispatchers.IO) {
        try {
            Result.success(ponte.statoComputer(id))
        } catch (e: CancellationException) {
            throw e
        } catch (e: PonteServer.AccessoScaduto) {
            segnaUscito()
            Result.failure(Exception("Sei uscito da questo dispositivo: entra di nuovo", e))
        } catch (e: PonteServer.Rifiutato) {
            Result.failure(Exception(spiegaInDiretta(e), e))
        } catch (_: Exception) {
            Result.success(eu.stgm.wisper.rapportino.StatoComputer(eu.stgm.wisper.rapportino.StatoComputer.RETE))
        }
    }

    /** Gli id dei messaggi nati qui (idLocale → id del server): non sono dati personali, restano anche dopo l'uscita. */
    private val invio7 by lazy { eu.stgm.wisper.rapportino.InvioFase7(ponte, Scaffale(File(ctx.filesDir, "fase7"), prefisso = "f7id-")) }

    override suspend fun segnaRimborsato(voci: List<VoceRimborso>, annulla: Boolean): Result<Pair<Int, Double>> = inDiretta {
        ponte.segnaRimborsato(voci, annulla).also { meseSpese?.let { m -> provaONull { leggiSpese(m) } } }
    }.also { aggiornaDashboard() }

    override suspend fun veicoli(tutti: Boolean): Result<ElencoVeicoli> = inDiretta { ponte.veicoli(tutti) }

    override suspend fun salvaVeicolo(v: Veicolo): Result<Veicolo> = inDiretta {
        if (v.nome.isBlank()) throw PonteServer.Rifiutato("Nome: scrivi il nome del veicolo")
        ponte.salvaVeicolo(v)
    }.also { aggiornaDashboard() }

    override suspend fun riepilogoSpese(mese: YearMonth, per: String): Result<RiepilogoSpese> =
        inDiretta { ponte.riepilogoSpese(mese.atDay(1), mese.atEndOfMonth(), per) }

    override suspend fun togliFotoSpesa(idFile: String): Result<Spesa> = inDiretta { ponte.togliFotoSpesa(idFile).also(::mettiSpesa) }

    override suspend fun statisticheOre(mese: YearMonth, per: String): Result<StatisticheOre> =
        inDiretta { ponte.statisticheOre(mese.atDay(1), mese.atEndOfMonth(), per) }

    override suspend fun esportaPeriodo(cosa: String, da: LocalDate?, a: LocalDate?, utente: String): Result<File> = inDiretta {
        val altri = buildList {
            da?.let { add("da" to it.toString()) }
            a?.let { add("a" to it.toString()) }
            if (utente.isNotBlank()) add("utente" to utente)
        }
        val (nome, _, byte) = ponte.esporta(cosa, null, altri)
        val cartella = File(ctx.cacheDir, "pdf").apply { mkdirs() }
        val sicuro = nome.replace(Regex("""[^A-Za-z0-9._ -]"""), "_").ifBlank { "wisper-$cosa.csv" }
        File(cartella, sicuro).apply { writeBytes(byte) }
    }

    /** Una lettura in sottofondo: senza rete resta l'ultima, l'errore va in [aggiornamento]. */
    private fun leggiInSottofondo(lavoro: suspend () -> Unit) {
        scope.launch {
            try {
                lavoro()
            } catch (e: CancellationException) {
                throw e
            } catch (e: PonteServer.AccessoScaduto) {
                segnaUscito()
            } catch (e: Exception) {
                _aggiornamento.update { it.copy(inCorso = false, errore = spiega(e)) }
            }
        }
    }

    /** Dopo che la coda ha mandato ore o spese: si rileggono, per avere gli stati e i numeri del server. */
    private suspend fun rileggiFase3() {
        periodoOre?.let { (da, a) -> provaONull { leggiOre(da, a) } }
        meseSpese?.let { provaONull { leggiSpese(it) } }
        provaONull { leggiDashboard() }
    }

    // ------------------------------------------------------------- invio

    /** ACCESSO: l'accesso è scaduto, la coda aspetta che si rientri (niente è scartato). */
    enum class Esito { TUTTO_INVIATO, RETE, RIFIUTATO, ACCESSO }

    /**
     * Ci pensa WorkManager: parte appena c'e' rete, anche ad app chiusa, e se la
     * rete cade a meta' riprova da solo con pause sempre piu' lunghe.
     * REPLACE: una modifica nuova fa ripartire subito il giro, invece di
     * aspettare la fine di una pausa cominciata prima.
     *
     * @param ritardoSecondi per i cambi di stato: il tempo dell'Annulla.
     */
    fun programmaInvio(ritardoSecondi: Long = 0) {
        if (coda.tutte().none { !it.rifiutata }) return
        // Senza accesso non si prova nemmeno: dopo l'accesso entra() fa ripartire tutto.
        if (!ponte.configurato) return
        val lavoro = OneTimeWorkRequestBuilder<InviaCoda>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .apply { if (ritardoSecondi > 0) setInitialDelay(ritardoSecondi, TimeUnit.SECONDS) }
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork("invia-coda", ExistingWorkPolicy.REPLACE, lavoro)
    }

    /**
     * Manda la coda al foglio, nell'ordine. Si ferma al primo problema: se la
     * rete non c'e' per uno non c'e' per nessuno, e se il foglio rifiuta
     * qualcosa le operazioni dopo potrebbero dipenderne.
     *
     * I cambi di stato uguali uno dopo l'altro (i 30 rapportini del riepilogo
     * segnati fatturati) partono in una richiesta sola, come fa il computer: uno
     * alla volta sarebbero minuti. Se il foglio ne rifiuta uno, si riprova uno
     * alla volta per sapere quale.
     */
    suspend fun mandaCoda(): Esito = invio.withLock {
        var salvati = false
        var fase3 = false
        var fase5 = false
        var fase6 = false
        var fase7 = false
        var unoAllaVolta = false
        try {
            while (true) {
                val tutte = coda.tutte()
                val op = tutte.firstOrNull() ?: return@withLock Esito.TUTTO_INVIATO
                if (op.rifiutata) return@withLock Esito.RIFIUTATO
                val gruppo = if (op.tipo == CodaInvii.Tipo.STATO && !unoAllaVolta) {
                    // Solo quelli di fila, e ogni rapportino una volta: l'ordine resta quello in cui sono stati fatti.
                    val visti = HashSet<String>()
                    tutte.takeWhile {
                        it.tipo == CodaInvii.Tipo.STATO && it.stato == op.stato && !it.rifiutata && visti.add(it.idLocale)
                    }.take(STATI_PER_RICHIESTA)
                } else listOf(op)
                try {
                    // Lo stesso id a ogni tentativo della stessa operazione, anche se passa da casa a Google (IdRichiesta).
                    IdRichiesta.perOperazione(op.idOp) {
                        if (gruppo.size > 1) {
                            sostituisciRemoti(ponte.stato(gruppo.map { chiaveFoglio(it.idLocale) }, op.stato!!))
                        } else {
                            esegui(op)
                        }
                    }
                    // Ore e spese escono da sole (CodaInvii.completa): se intanto sono state
                    // cambiate di nuovo restano, e ripartono come modifica.
                    // Il rapportino coi lavori esce da solo (CodaInvii.completaGiornata): cambiato intanto, riparte.
                    if (op.fase3) fase3 = true else if (op.tipo != CodaInvii.Tipo.GIORNATA) gruppo.forEach { coda.togli(it.idOp) }
                    if (op.tipo == CodaInvii.Tipo.SALVA || op.tipo == CodaInvii.Tipo.GIORNATA) salvati = true
                    if (op.fase5) fase5 = true
                    if (op.fase6) fase6 = true
                    if (op.fase7) fase7 = true
                    _coda.value = coda.tutte()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: PonteServer.AccessoScaduto) {
                    // Non è un no sul rapportino: resta in coda così com'è, e parte dopo il prossimo accesso.
                    segnaUscito()
                    return@withLock Esito.ACCESSO
                } catch (e: PonteServer.Rifiutato) {
                    if (gruppo.size > 1) {
                        unoAllaVolta = true
                        continue
                    }
                    // Quella di adesso: l'invio puo' averla cambiata (l'id imparato dal server).
                    val attuale = coda.tutte().firstOrNull { it.idOp == op.idOp } ?: op
                    coda.aggiorna(attuale.copy(errore = e.message ?: "rifiutato"))
                    _coda.value = coda.tutte()
                    // Fase 6: per un'assenza la notifica non dice il motivo (potrebbe dire il tipo, che è riservato).
                    val testo = if (op.tipo in CodaInvii.PERSONALI) "Apri Wisper per vedere il motivo" else e.message.orEmpty()
                    avvisa(ID_RIFIUTATO, TestiCoda.rifiutata(op.tipo), testo, importante = true)
                    return@withLock Esito.RIFIUTATO
                } catch (e: Exception) {
                    val attuale = coda.tutte().firstOrNull { it.idOp == op.idOp } ?: op
                    val tentativi = attuale.tentativi + 1
                    coda.aggiorna(attuale.copy(tentativi = tentativi))
                    _coda.value = coda.tutte()
                    if (tentativi == AVVISO_DOPO_TENTATIVI) {
                        avvisa(ID_NON_ANCORA, TestiCoda.titoloNonPartite(coda.tutte()), motivoNonPartite(e), importante = false)
                    }
                    return@withLock Esito.RETE
                }
            }
            @Suppress("UNREACHABLE_CODE")
            Esito.TUTTO_INVIATO
        } finally {
            if (coda.tutte().isEmpty()) togliAvviso(ID_NON_ANCORA)
            // Un rapportino puo' aver creato un cliente o una commessa nuovi:
            // si rilegge l'anagrafica perche' abbiano il loro codice.
            if (salvati) scope.launch { aggiornaOra() }
            else if (fase3) scope.launch { rileggiFase3() }
            // Partiti ticket o scadenze: si rileggono gli aperti e la Dashboard, coi numeri veri.
            if (fase5) scope.launch { provaONull { this@Archivio.fase5.tickets() }; provaONull { leggiDashboard() } }
            // Partite assenze, km, guasti o prestiti: anagrafiche (i miei strumenti) e Dashboard coi numeri veri.
            if (fase6 && !salvati) scope.launch { rileggiAnagrafiche(); provaONull { leggiDashboard() } }
            // Partiti messaggi o cambi del portale: la Dashboard (numerini, Da mandare) coi numeri veri.
            if (fase7 && !fase6 && !salvati) scope.launch { provaONull { leggiDashboard() } }
        }
    }

    private suspend fun esegui(op: CodaInvii.Operazione) {
        when (op.tipo) {
            CodaInvii.Tipo.SALVA -> sostituisciRemoto(ponte.salva(op.rapportino!!))

            CodaInvii.Tipo.GIORNATA -> {
                val g = op.giornata() ?: throw PonteServer.Rifiutato("Il rapportino in coda non si legge più")
                val tornata = ponte.salvaGiornata(g)
                // I lavori tengono l'idLocale del rapportino del telefono: se e' ancora in coda (cambiato intanto) si ritrovano.
                val lavori = tornata.lavori.map { it.copy(idLocaleGiornata = g.idLocale) }
                // I lavori tolti dal rapportino (il server li ha annullati) escono anche dal telefono.
                togliTolti(tornata.id, g.idLocale, chiavi(lavori))
                sostituisciRemoti(lavori)
                coda.completaGiornata(op.idOp, op.corpo, tornata.id)
            }

            CodaInvii.Tipo.FOTO -> {
                val file = File(op.percorso)
                if (!file.exists()) throw PonteServer.Rifiutato("La foto non è più sul telefono")
                val remoto = remotoDi(op.idLocale)
                val f = ponte.caricaFile("spesa", op.idLocale, remoto?.id.orEmpty(), op.idFile, file, "image/jpeg")
                // La copia locale resta, col nome del file su Drive: le foto di
                // Drive l'app non le puo' mostrare senza un accesso a Google.
                file.renameTo(File(Immagini.cartellaFoto(ctx), "${f.id}.jpg"))
                aggiornaRemoto(op.idLocale) { r -> r.copy(foto = (r.foto + f).distinctBy { it.id }) }
            }

            CodaInvii.Tipo.FIRMA -> {
                val file = File(op.percorso)
                if (!file.exists()) throw PonteServer.Rifiutato("La firma non è più sul telefono")
                val remoto = remotoDi(op.idLocale)
                val f = ponte.caricaFile(
                    "firma", op.idLocale, remoto?.id.orEmpty(), op.idFile, file, "image/png",
                    op.firmatario, op.firmatoIl,
                )
                // Una copia col nome di Drive: il PDF la trova senza scaricarla.
                provaONull { copia.scriviFileDelFoglio(f.id, file.readBytes(), "image/png") }
                aggiornaRemoto(op.idLocale) { r ->
                    r.copy(firma = f, firmatario = op.firmatario, firmatoIl = op.firmatoIl, stato = Stato.FIRMATO)
                }
            }

            CodaInvii.Tipo.STATO -> sostituisciRemoto(ponte.stato(chiaveFoglio(op.idLocale), op.stato!!))

            CodaInvii.Tipo.TOGLI_FOTO -> sostituisciRemoto(ponte.togliFile(chiaveFoglio(op.idLocale), op.fileId))

            CodaInvii.Tipo.TICKET, CodaInvii.Tipo.AZIONE_TICKET, CodaInvii.Tipo.FOTO_TICKET, CodaInvii.Tipo.FAI_SCADENZA -> invio5.esegui(op)

            CodaInvii.Tipo.ASSENZA, CodaInvii.Tipo.ANNULLA_ASSENZA, CodaInvii.Tipo.KM, CodaInvii.Tipo.FOTO_KM, CodaInvii.Tipo.GUASTO,
            CodaInvii.Tipo.FOTO_GUASTO, CodaInvii.Tipo.PRESTITO, CodaInvii.Tipo.RESTITUISCI, CodaInvii.Tipo.FIRMA_DPI -> {
                invio6.esegui(op)
                // La foto o la firma partita non serve più sul telefono.
                if (op.percorso.isNotBlank()) File(op.percorso).delete()
            }

            CodaInvii.Tipo.AZIONE7 -> invio7.esegui(op)

            CodaInvii.Tipo.ORE, CodaInvii.Tipo.SPESA, CodaInvii.Tipo.FOTO_SPESA -> when (val a = invio3.esegui(op)) {
                is InvioFase3.Arrivato.Ore -> mettiOre(a.riga)
                is InvioFase3.Arrivato.UnaSpesa -> mettiSpesa(a.spesa)
                is InvioFase3.Arrivato.Scontrino -> _speseLette.update { e ->
                    e?.copy(spese = e.spese.map { if (it.id == a.idSpesa) it.copy(foto = (it.foto + a.file).distinctBy { f -> f.id }) else it })
                }
            }
        }
    }

    private fun remotoDi(idLocale: String): Rapportino? =
        _dalFoglio.value.firstOrNull { it.idLocale == idLocale } ?: _storicoFoglio.value.firstOrNull { it.idLocale == idLocale }

    /** Il numero RAP/... se il foglio l'ha gia' dato: e' l'unico modo per trovare i rapportini del primo Wisper. */
    private fun chiaveFoglio(idLocale: String): String = remotoDi(idLocale)?.id?.takeIf { it.isNotBlank() } ?: idLocale

    private fun sostituisciRemoto(r: Rapportino) = sostituisciRemoti(listOf(r))

    /**
     * Mette i rapportini tornati dal foglio al posto dei vecchi, nei recenti e
     * nello storico. Uno vecchio (gia' solo nello storico) non entra nei recenti.
     */
    private fun sostituisciRemoti(lista: List<Rapportino>) {
        if (lista.isEmpty()) return
        lista.forEach { scrittoAl[it.idLocale] = contatore.incrementAndGet() }
        val chiaviNuovi = chiavi(lista)
        val neiRecenti = chiavi(_dalFoglio.value)
        val nelloStorico = chiavi(_storicoFoglio.value)
        val perRecenti = lista.filter { it.dentro(neiRecenti) || !it.dentro(nelloStorico) }
        if (perRecenti.isNotEmpty()) {
            val k = chiavi(perRecenti)
            _dalFoglio.update { vecchi -> vecchi.filterNot { it.dentro(k) } + perRecenti }
            copia.scriviRapportini(_dalFoglio.value)
        }
        if (_storicoFoglio.value.isNotEmpty()) {
            _storicoFoglio.update { vecchi -> vecchi.filterNot { it.dentro(chiaviNuovi) } + lista }
            copia.scriviStorico(_storicoFoglio.value)
        }
    }

    /** Toglie dai rapportini letti i lavori del rapportino [idGiornata] / [idLocaleGiornata] che non sono fra [tenuti]. */
    private fun togliTolti(idGiornata: String, idLocaleGiornata: String, tenuti: Set<String>) {
        fun tolto(r: Rapportino) = !r.dentro(tenuti) &&
            ((idGiornata.isNotBlank() && Giornate.chiaveDi(r) == idGiornata) || (idLocaleGiornata.isNotBlank() && r.idLocaleGiornata == idLocaleGiornata))
        if (_dalFoglio.value.any(::tolto)) {
            _dalFoglio.update { l -> l.filterNot(::tolto) }
            copia.scriviRapportini(_dalFoglio.value)
        }
        if (_storicoFoglio.value.any(::tolto)) {
            _storicoFoglio.update { l -> l.filterNot(::tolto) }
            copia.scriviStorico(_storicoFoglio.value)
        }
    }

    private fun aggiornaRemoto(idLocale: String, cambia: (Rapportino) -> Rapportino) {
        scrittoAl[idLocale] = contatore.incrementAndGet()
        _dalFoglio.update { lista -> lista.map { if (it.idLocale == idLocale) cambia(it) else it } }
        copia.scriviRapportini(_dalFoglio.value)
        if (_storicoFoglio.value.any { it.idLocale == idLocale }) {
            _storicoFoglio.update { lista -> lista.map { if (it.idLocale == idLocale) cambia(it) else it } }
            copia.scriviStorico(_storicoFoglio.value)
        }
    }

    // ------------------------------------------------------------- composizione

    /** Tutti i rapportini come si vedono adesso, coda compresa, per idLocale. */
    private fun compostiOra(): Map<String, Vista> =
        componi(unisci(_storicoFoglio.value, _dalFoglio.value), coda.tutte(), _anagrafiche.value)
            .associateBy { it.rapportino.idLocale }

    private fun componi(
        remoti: List<Rapportino>,
        operazioni: List<CodaInvii.Operazione>,
        ana: Anagrafiche,
    ): List<Vista> {
        val viste = LinkedHashMap<String, Vista>()
        remoti.forEach { viste[it.idLocale] = Vista(it) }

        for (op in operazioni) {
            // 06/11/2026: il rapportino coi lavori mette (o cambia) tutti i suoi lavori, e toglie quelli che non ha piu'.
            if (op.tipo == CodaInvii.Tipo.GIORNATA) {
                val g = op.giornata() ?: continue
                val idNoto = g.id.ifBlank { remoti.firstOrNull { it.idLocaleGiornata == g.idLocale && it.idGiornata.isNotBlank() }?.idGiornata.orEmpty() }
                val lavori = g.copy(id = idNoto).lavoriAllineati()
                val dentro = lavori.map { it.idLocale }.toSet()
                // Un no del server che dice il lavoro ("Lavoro 2: scegli il progetto") va su quel lavoro soltanto.
                val errore = if (op.rifiutata) Giornate.erroreDelLavoro(op.errore) else null
                viste.keys.toList().forEach { k ->
                    val r = viste[k]!!.rapportino
                    if (k !in dentro && (r.idLocaleGiornata == g.idLocale || (idNoto.isNotBlank() && Giornate.chiaveDi(r) == idNoto))) viste.remove(k)
                }
                lavori.forEach { scritto ->
                    val attuale = viste[scritto.idLocale]
                    val unito = attuale?.rapportino?.let { b -> unisciScritto(scritto, b) } ?: scritto.copy(conto = null)
                    viste[scritto.idLocale] = (attuale ?: Vista(unito)).copy(
                        rapportino = unito.copy(idGiornata = unito.idGiornata.ifBlank { idNoto }, idLocaleGiornata = g.idLocale, posizione = scritto.posizione),
                        cambiatoQui = true, inCoda = true,
                        errore = when {
                            !op.rifiutata -> attuale?.errore.orEmpty()
                            errore == null -> op.errore
                            errore.first == scritto.posizione -> errore.second
                            else -> ""
                        },
                    )
                }
                continue
            }
            val attuale = viste[op.idLocale]
            val nuova: Vista? = when (op.tipo) {
                CodaInvii.Tipo.SALVA -> {
                    val scritto = op.rapportino ?: continue
                    val base = attuale?.rapportino
                    // Del rapportino scritto qui contano i campi compilati; numero,
                    // foto, firma e stato restano quelli che sa il foglio.
                    val unito = base?.let { b -> unisciScritto(scritto, b) } ?: scritto.copy(conto = null)
                    (attuale ?: Vista(unito)).copy(rapportino = unito, cambiatoQui = true)
                }
                CodaInvii.Tipo.FOTO -> attuale?.copy(fotoInAttesa = attuale.fotoInAttesa + File(op.percorso))
                CodaInvii.Tipo.FIRMA -> attuale?.copy(
                    firmaInAttesa = File(op.percorso),
                    rapportino = attuale.rapportino.copy(
                        stato = Stato.FIRMATO, firmatario = op.firmatario, firmatoIl = op.firmatoIl,
                    ),
                )
                CodaInvii.Tipo.STATO -> attuale?.copy(
                    rapportino = attuale.rapportino.let { r ->
                        when (op.stato) {
                            Stato.BOZZA -> r.copy(
                                stato = Stato.BOZZA, firma = null, firmatario = "", firmatoIl = "",
                                inviatoIl = "", fatturatoIl = "",
                            )
                            Stato.INVIATO -> r.copy(stato = Stato.INVIATO, fatturatoIl = "")
                            else -> r.copy(stato = op.stato ?: r.stato)
                        }
                    },
                    firmaInAttesa = if (op.stato == Stato.BOZZA) null else attuale.firmaInAttesa,
                )
                CodaInvii.Tipo.TOGLI_FOTO -> attuale?.copy(
                    rapportino = attuale.rapportino.copy(foto = attuale.rapportino.foto.filterNot { it.id == op.fileId }),
                )
                // Ore e spese della fase 3: non sono rapportini (le mostrano [ore] e [spese]).
                CodaInvii.Tipo.ORE, CodaInvii.Tipo.SPESA, CodaInvii.Tipo.FOTO_SPESA -> null
                // Ticket e scadenze della fase 5: li mostra fase5 (TicketInCoda).
                CodaInvii.Tipo.TICKET, CodaInvii.Tipo.AZIONE_TICKET, CodaInvii.Tipo.FOTO_TICKET, CodaInvii.Tipo.FAI_SCADENZA -> null
                // Assenze, km, guasti, prestiti e firme della fase 6: li mostra fase6 (InCoda6).
                CodaInvii.Tipo.ASSENZA, CodaInvii.Tipo.ANNULLA_ASSENZA, CodaInvii.Tipo.KM, CodaInvii.Tipo.FOTO_KM, CodaInvii.Tipo.GUASTO,
                CodaInvii.Tipo.FOTO_GUASTO, CodaInvii.Tipo.PRESTITO, CodaInvii.Tipo.RESTITUISCI, CodaInvii.Tipo.FIRMA_DPI -> null
                // Messaggi e portale della fase 7: li mostra fase7 (InCoda7).
                CodaInvii.Tipo.AZIONE7 -> null
                // Il rapportino coi lavori lo mette il ramo qui sopra (prima del when).
                CodaInvii.Tipo.GIORNATA -> null
            }
            if (nuova != null) {
                viste[op.idLocale] = nuova.copy(
                    inCoda = true,
                    errore = if (op.rifiutata) op.errore else nuova.errore,
                )
            }
        }

        return viste.values
            .map { v ->
                val r = v.rapportino
                if (v.cambiatoQui || r.conto == null) {
                    v.copy(conto = Calcolo.calcola(r, ana.regoleDi(ana.cliente(r.idCliente, r.cliente), ana.commessa(r.idCommessa))))
                } else v
            }
            .filter { it.rapportino.stato != Stato.ANNULLATO }
            .sortedWith(compareByDescending<Vista> { it.rapportino.data }.thenByDescending { it.rapportino.id })
    }

    /** Un lavoro scritto qui sopra quello che sa il server: i campi compilati di qui, numero, foto, stato e il resto di la'. */
    private fun unisciScritto(scritto: Rapportino, b: Rapportino): Rapportino = scritto.soloCompilato().copy(
        id = b.id, gruppo = b.gruppo, foto = b.foto, firma = b.firma,
        firmatario = b.firmatario, firmatoIl = b.firmatoIl, stato = b.stato,
        modificato = b.modificato, inviatoIl = b.inviatoIl, fatturatoIl = b.fatturatoIl,
        creato = b.creato, costoOrario = b.costoOrario,
        statoApprovazione = b.statoApprovazione, motivoRifiuto = b.motivoRifiuto,
        firmaModo = b.firmaModo, firmaReferente = b.firmaReferente, portalePubblicato = b.portalePubblicato,
        portaleDaFirmare = b.portaleDaFirmare, portaleVistoIl = b.portaleVistoIl, portaleId = b.portaleId,
        idGiornata = b.idGiornata, idLocaleGiornata = b.idLocaleGiornata.ifBlank { scritto.idLocaleGiornata }, posizione = b.posizione,
    )

    // ------------------------------------------------------------- avvisi

    private fun avvisa(id: Int, titolo: String, testo: String, importante: Boolean) {
        // Con l'app davanti lo dice gia' la schermata: la notifica sarebbe un doppione.
        if (WisperApp.davanti.value) return
        val apri = PendingIntent.getActivity(
            ctx, id,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(ctx, WisperApp.CANALE_SALVATAGGI)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(titolo)
            .setContentText(testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo))
            .setContentIntent(apri)
            .setAutoCancel(true)
            .setSilent(!importante)
            .build()
        runCatching { ctx.getSystemService(NotificationManager::class.java).notify(id, n) }
    }

    private fun togliAvviso(id: Int) {
        runCatching { ctx.getSystemService(NotificationManager::class.java).cancel(id) }
    }

    companion object {
        private const val AVVISO_DOPO_TENTATIVI = 3
        private const val ID_NON_ANCORA = 3
        private const val ID_RIFIUTATO = 4

        /** I secondi dell'Annulla dopo un cambio di stato, prima che parta. */
        private const val ATTESA_ANNULLA = 8L

        /** Quanti cambi di stato in una richiesta sola. */
        private const val STATI_PER_RICHIESTA = 50

        /** Un documento della commessa: oltre, la richiesta allo script diventa troppo pesante per il telefono. */
        private const val MASSIMO_DOCUMENTO = 10L * 1024 * 1024
        private const val TROPPO_GRANDE = "Il file è troppo grande: al massimo 10 MB"
        private const val NON_SCARICA = "Non riesco a scaricare un'immagine del PDF (una firma o uno scontrino). "


        /**
         * Il testo dell'avviso "non ancora partiti": la rete che manca, il server dello
         * studio che non risponde (la porta Google dice spento o attesa), o una cosa troppo
         * grande per passare da Google, che parte dall'ufficio.
         */
        fun motivoNonPartite(e: Exception): String = when {
            e is PonteServer.SoloInUfficio -> "Una è troppo grande per passare da Google: parte da sola quando sei in ufficio. Intanto sono al sicuro sul telefono."
            e is PonteServer.ServizioNonRaggiunto && (e.porta == "spento" || e.porta == "attesa") ->
                "Il server dello studio non risponde: riprovo da solo. Intanto sono al sicuro sul telefono."
            e is PonteServer.ServizioNonRaggiunto && (e.porta == "occupato" || e.porta == "google") ->
                "Google non risponde: riprovo da solo. Intanto sono al sicuro sul telefono."
            else -> "Sono al sicuro sul telefono. Partono da soli appena c'è rete."
        }

        /** Un errore detto in modo che si capisca cosa fare. */
        fun spiega(e: Exception): String = when (e) {
            is PonteServer.Rifiutato -> e.message.orEmpty()
            is PonteServer.AccessoScaduto -> "Sei uscito da questo dispositivo: entra di nuovo"
            is java.net.UnknownHostException, is java.net.ConnectException, is java.net.NoRouteToHostException ->
                "Il server non risponde: controlla la rete e riprova"
            is java.net.SocketTimeoutException -> "Il server non ha risposto in tempo"
            is PonteServer.ServizioNonRaggiunto -> e.message.orEmpty()
            else -> e.message ?: e.javaClass.simpleName
        }

        /**
         * Cosa fare dopo un errore mandando la coda: [Esito.RIFIUTATO] il server ha
         * detto di no (anche per un permesso), [Esito.ACCESSO] si deve rientrare
         * (la coda aspetta), [Esito.RETE] si riprova.
         */
        fun esitoDi(e: Exception): Esito = when (e) {
            is PonteServer.AccessoScaduto -> Esito.ACCESSO
            is PonteServer.Rifiutato -> Esito.RIFIUTATO
            else -> Esito.RETE
        }

        /**
         * Lo stesso per le azioni in diretta, che non si ripetono da sole. Per
         * l'email conta dire se puo' essere partita: senza rete di sicuro no, ma
         * se la risposta non e' arrivata forse si'.
         */
        fun spiegaInDiretta(e: Exception, email: Boolean = false): String = when (e) {
            is PonteServer.Rifiutato -> e.message.orEmpty().replaceFirstChar { it.uppercase() }.ifBlank { "Il server ha detto di no" }
            is PonteServer.ServizioNonRaggiunto -> e.message.orEmpty().ifBlank { "Un servizio non risponde: riprova più tardi" }
            is PonteServer.AccessoScaduto -> "Sei uscito da questo dispositivo: entra di nuovo"
            is java.net.UnknownHostException, is java.net.ConnectException, is java.net.NoRouteToHostException ->
                if (email) "Niente rete: l'email non è partita. Riprova quando c'è campo"
                else "Serve la rete per salvare: riprova quando c'è"
            is java.net.SocketTimeoutException, is java.io.IOException ->
                if (email) "Il server non ha risposto e l'email potrebbe essere partita lo stesso: guarda nella posta inviata prima di riprovare"
                else if (e is java.net.SocketTimeoutException) "Il server non ha risposto in tempo: riprova tra poco"
                else "Il server non ha risposto bene (${e.message ?: "errore di rete"}): riprova tra poco"
            is IllegalArgumentException -> e.message ?: "Non riesco a leggere il file"
            else -> e.message ?: e.javaClass.simpleName
        }

        /** Per le cose facoltative: se non riesce, null (ma un annullamento resta un annullamento). */
        private suspend fun <T> provaONull(lavoro: suspend () -> T): T? = try {
            lavoro()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }
}

/** Il lavoratore di WorkManager: manda la coda e, se manca la rete, chiede di riprovare. */
class InviaCoda(ctx: Context, parametri: WorkerParameters) : CoroutineWorker(ctx, parametri) {
    override suspend fun doWork(): Result {
        val archivio = (applicationContext as WisperApp).archivio
        return when (archivio.mandaCoda()) {
            Archivio.Esito.RETE -> Result.retry()
            // ACCESSO: si aspetta il prossimo accesso, che fa ripartire la coda; RIFIUTATO: decide chi usa l'app.
            else -> Result.success()
        }
    }
}
