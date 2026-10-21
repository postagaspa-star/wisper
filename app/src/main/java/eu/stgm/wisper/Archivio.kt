package eu.stgm.wisper

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
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
import eu.stgm.wisper.rapportino.Calcolo
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.CodaInvii
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
    })
    private val coda = CodaInvii(ctx)
    private val copia = CopiaLocale(ctx)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Un invio alla volta: il lavoratore in sottofondo e l'app non mandano mai la stessa cosa due volte. */
    private val invio = Mutex()

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
        copia.scriviDashboard(j)
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
    suspend fun entra(email: String, password: String, server: String = configurazione.server): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            if (server.trim() != configurazione.server) configurazione.server = server.trim()
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

    /** Cambia l'indirizzo del server: il token di prima non vale lì, si rientra. */
    fun cambiaServer(nuovo: String) {
        configurazione.server = nuovo.trim()
        esciQui(perScadenza = false)
    }

    /** Il server ha detto "accesso scaduto": si torna alla schermata di accesso, la coda aspetta. */
    private fun segnaUscito() {
        if (configurazione.token.isBlank() && _sessione.value.utente.id.isBlank()) return
        esciQui(perScadenza = true)
        _aggiornamento.update { it.copy(inCorso = false, errore = "Sei uscito da questo dispositivo: entra di nuovo") }
    }

    private fun esciQui(perScadenza: Boolean) {
        configurazione.token = ""
        configurazione.uscitoPerScadenza = perScadenza
        _sessione.value = Sessione.NESSUNA.copy(scaduta = perScadenza)
    }

    /** Un'altra persona: via le copie lette dal server (non la coda, che è ancora da mandare). */
    private fun svuotaCopie() {
        copia.svuota()
        _dalFoglio.value = emptyList()
        _storicoFoglio.value = emptyList()
        _anagrafiche.value = Anagrafiche()
        _dashboard.value = null
    }

    /** Chi sono e cosa posso: i permessi cambiati da Amministrazione valgono subito. */
    private suspend fun aggiornaIo() {
        val io = ponte.io()
        configurazione.titolare = io.titolare
        configurazione.ragioneSociale = io.ragioneSociale
        if (io.utente.id.isNotBlank()) {
            val s = Sessione(io.utente, io.permessi)
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
            if (tutti) {
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
            } else {
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
            if (!tutti) provaONull { leggiDashboard() }
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
        _coda.value.lastOrNull { it.tipo == CodaInvii.Tipo.SALVA && it.rapportino?.let(::suo) == true }
            ?.rapportino?.tariffa?.takeIf { it > 0 }?.let { return it }
        cliente?.ultimaTariffa?.takeIf { it > 0 }?.let { return it }
        return _dalFoglio.value.filter(::suo).maxByOrNull { it.data }?.tariffa?.takeIf { it > 0 }
    }

    // ------------------------------------------------------------- modifiche



    override fun salva(r: Rapportino) {
        coda.salva(r)
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
        coda.tutte().firstOrNull { it.idOp == idOp }?.let { op ->
            coda.togli(op.idOp)
            if (op.percorso.isNotBlank()) File(op.percorso).delete()
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
        val salvato = ponte.salvaSoggetto(cliente, nuovo, costi)
        mettiInAnagrafica { a -> conSoggetto(a, salvato.dato) }
        rileggiAnagrafiche()
        salvato
    }

    /** Chi è entrato vede i soldi: solo allora tariffe e importi si mandano. */
    private val costi: Boolean get() = _sessione.value.permessi.costi

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
            ponte.creaCommessa(commessa.copy(id = codice), cliente, costi)
        } else {
            if (commessa.id.isBlank()) throw PonteServer.Rifiutato("Manca il codice della commessa")
            Salvataggio(ponte.aggiornaCommessa(commessa, cliente, costi))
        }
        mettiInAnagrafica { a ->
            a.copy(commesse = sostituisci(a.commesse, salvata.dato) { it.id.equals(salvata.dato.id, ignoreCase = true) })
        }
        rileggiAnagrafiche()
        salvata
    }

    override suspend fun salvaImpostazioni(valori: Map<String, String>): Result<Map<String, String>> = inDiretta {
        val pronti = valori.mapValues { (k, v) ->
            val t = v.trim()
            if (k in Anagrafiche.IMPOSTAZIONI_NUMERICHE && t.isNotEmpty()) {
                Numeri.leggi(t) ?: throw PonteServer.Rifiutato(
                    if (k == Anagrafiche.EURO_KM) "Il rimborso km dev'essere un numero, per esempio 0,76"
                    else "Il costo orario dev'essere un numero, per esempio 22"
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
        if (coda.tutte().none { it.idLocale in ids }) return
        mandaCoda()
        if (coda.tutte().none { it.idLocale in ids }) return
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
                    if (gruppo.size > 1) {
                        sostituisciRemoti(ponte.stato(gruppo.map { chiaveFoglio(it.idLocale) }, op.stato!!))
                    } else {
                        esegui(op)
                    }
                    gruppo.forEach { coda.togli(it.idOp) }
                    if (op.tipo == CodaInvii.Tipo.SALVA) salvati = true
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
                    coda.aggiorna(op.copy(errore = e.message ?: "rifiutato"))
                    _coda.value = coda.tutte()
                    avvisa(ID_RIFIUTATO, "Il server ha rifiutato un rapportino", e.message.orEmpty(), importante = true)
                    return@withLock Esito.RIFIUTATO
                } catch (e: Exception) {
                    val tentativi = op.tentativi + 1
                    coda.aggiorna(op.copy(tentativi = tentativi))
                    _coda.value = coda.tutte()
                    if (tentativi == AVVISO_DOPO_TENTATIVI) {
                        avvisa(
                            ID_NON_ANCORA, "Rapportini non ancora partiti",
                            "Sono al sicuro sul telefono. Partono da soli appena c'è rete.", importante = false,
                        )
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
        }
    }

    private suspend fun esegui(op: CodaInvii.Operazione) {
        when (op.tipo) {
            CodaInvii.Tipo.SALVA -> sostituisciRemoto(ponte.salva(op.rapportino!!))

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
            val attuale = viste[op.idLocale]
            val nuova: Vista? = when (op.tipo) {
                CodaInvii.Tipo.SALVA -> {
                    val scritto = op.rapportino ?: continue
                    val base = attuale?.rapportino
                    // Del rapportino scritto qui contano i campi compilati; numero,
                    // foto, firma e stato restano quelli che sa il foglio.
                    val unito = base?.let { b ->
                        scritto.soloCompilato().copy(
                            id = b.id, gruppo = b.gruppo, foto = b.foto, firma = b.firma,
                            firmatario = b.firmatario, firmatoIl = b.firmatoIl, stato = b.stato,
                            modificato = b.modificato, inviatoIl = b.inviatoIl, fatturatoIl = b.fatturatoIl,
                            creato = b.creato, costoOrario = b.costoOrario,
                        )
                    } ?: scritto.copy(conto = null)
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
