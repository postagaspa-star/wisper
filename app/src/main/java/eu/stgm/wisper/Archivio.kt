package eu.stgm.wisper

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Calcolo
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.CodaInvii
import eu.stgm.wisper.rapportino.Conto
import eu.stgm.wisper.rapportino.Configurazione
import eu.stgm.wisper.rapportino.CopiaLocale
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.PonteFoglio
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Stato
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
import java.util.concurrent.TimeUnit

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
 * Tutti i dati dell'app e il loro viaggio verso il foglio.
 *
 * Le schermate leggono da qui e chiedono a qui; nessuna parla col foglio da
 * sola. Ogni modifica va prima nella [CodaInvii] (cioe' su disco) e solo dopo
 * parte: cosi' quello che si vede e' sempre quello che e' al sicuro.
 */
class Archivio(private val ctx: Context) : Dati {

    val configurazione = Configurazione(ctx)
    private val ponte = PonteFoglio({ configurazione.url }, { configurazione.codice }, {
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

    /** L'ultimo elenco letto dal foglio, aggiornato a ogni risposta. */
    private val _dalFoglio = MutableStateFlow(copia.rapportini())

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

    /** Chi compila: il nome di questo telefono, o quello scritto nelle impostazioni del foglio. */
    override val tecnico: String
        get() = configurazione.tecnico.ifBlank { _anagrafiche.value.tecnico }

    val configurato: Boolean get() = ponte.configurato

    // ------------------------------------------------------------- lettura

    /** Rilegge clienti, commesse e rapportini. Con [mese], legge anche quel mese (per sfogliare indietro). */
    override val esempio: Boolean = false

    override fun aggiorna(mese: YearMonth?) {
        scope.launch { aggiornaOra(mese) }
        programmaInvio()
    }

    private suspend fun aggiornaOra(mese: YearMonth? = null) {
        if (!ponte.configurato) {
            _aggiornamento.update {
                it.copy(inCorso = false, errore = "Manca l'indirizzo o il codice del foglio: aprili dalle impostazioni")
            }
            return
        }
        _aggiornamento.update { it.copy(inCorso = true) }
        try {
            val ana = ponte.anagrafiche()
            _anagrafiche.value = ana
            copia.scriviAnagrafiche(ana)

            // Gli ultimi sei mesi bastano per tutti i giorni; quelli prima si
            // leggono solo quando li si sfoglia.
            val oggi = LocalDate.now()
            val da = mese?.atDay(1) ?: oggi.withDayOfMonth(1).minusMonths(5)
            val a = mese?.atEndOfMonth() ?: YearMonth.from(oggi).plusMonths(1).atEndOfMonth()
            val letti = ponte.rapportini(da, a)
            _dalFoglio.update { vecchi ->
                val fuori = vecchi.filter { it.data < da || it.data > a }
                val chiavi = letti.map { it.idLocale }.toSet()
                fuori.filterNot { it.idLocale in chiavi } + letti
            }
            copia.scriviRapportini(_dalFoglio.value)
            _aggiornamento.value = Aggiornamento(ultimo = LocalDateTime.now())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _aggiornamento.update { it.copy(inCorso = false, errore = spiega(e)) }
        }
    }

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

    /** "Collega il computer": l'email col file di collegamento. Serve la rete. */
    suspend fun collegaComputer(): Result<String> = runCatching { ponte.collegaComputer() }

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
        val firmeInAttesa = coda.diRapportino(idLocale).filter { it.tipo == CodaInvii.Tipo.FIRMA }
        firmeInAttesa.forEach { coda.togli(it.idOp); File(it.percorso).delete() }
        val remoto = remotoDi(idLocale)
        if (remoto != null && remoto.stato != Stato.BOZZA) coda.stato(idLocale, Stato.BOZZA)
        dopoModifica()
    }

    /** Un rapportino mai arrivato sul foglio sparisce; uno gia' sul foglio diventa ANNULLATO e si recupera da li'. */
    override fun elimina(idLocale: String) {
        if (remotoDi(idLocale) == null) {
            coda.diRapportino(idLocale).forEach { op ->
                coda.togli(op.idOp)
                if (op.percorso.isNotBlank()) File(op.percorso).delete()
            }
        } else {
            coda.stato(idLocale, Stato.ANNULLATO)
        }
        dopoModifica()
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

    private fun dopoModifica() {
        _coda.value = coda.tutte()
        programmaInvio()
    }

    // ------------------------------------------------------------- invio

    enum class Esito { TUTTO_INVIATO, RETE, RIFIUTATO }

    /**
     * Ci pensa WorkManager: parte appena c'e' rete, anche ad app chiusa, e se la
     * rete cade a meta' riprova da solo con pause sempre piu' lunghe.
     * REPLACE: una modifica nuova fa ripartire subito il giro, invece di
     * aspettare la fine di una pausa cominciata prima.
     */
    fun programmaInvio() {
        if (coda.tutte().none { !it.rifiutata }) return
        val lavoro = OneTimeWorkRequestBuilder<InviaCoda>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork("invia-coda", ExistingWorkPolicy.REPLACE, lavoro)
    }

    /**
     * Manda la coda al foglio, nell'ordine. Si ferma al primo problema: se la
     * rete non c'e' per uno non c'e' per nessuno, e se il foglio rifiuta
     * qualcosa le operazioni dopo potrebbero dipenderne.
     */
    suspend fun mandaCoda(): Esito = invio.withLock {
        var salvati = false
        try {
            while (true) {
                val op = coda.tutte().firstOrNull() ?: return@withLock Esito.TUTTO_INVIATO
                if (op.rifiutata) return@withLock Esito.RIFIUTATO
                try {
                    esegui(op)
                    coda.togli(op.idOp)
                    if (op.tipo == CodaInvii.Tipo.SALVA) salvati = true
                    _coda.value = coda.tutte()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: PonteFoglio.RifiutatoDalFoglio) {
                    coda.aggiorna(op.copy(errore = e.message ?: "rifiutato"))
                    _coda.value = coda.tutte()
                    avvisa(ID_RIFIUTATO, "Il foglio ha rifiutato un rapportino", e.message.orEmpty(), importante = true)
                    return@withLock Esito.RIFIUTATO
                } catch (e: Exception) {
                    val tentativi = op.tentativi + 1
                    coda.aggiorna(op.copy(tentativi = tentativi))
                    _coda.value = coda.tutte()
                    if (tentativi == AVVISO_DOPO_TENTATIVI) {
                        avvisa(
                            ID_NON_ANCORA, "Rapportini non ancora sul foglio",
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
                if (!file.exists()) throw PonteFoglio.RifiutatoDalFoglio("La foto non è più sul telefono")
                val remoto = remotoDi(op.idLocale)
                val f = ponte.caricaFile("spesa", op.idLocale, remoto?.id.orEmpty(), op.idFile, file, "image/jpeg")
                // La copia locale resta, col nome del file su Drive: le foto di
                // Drive l'app non le puo' mostrare senza un accesso a Google.
                file.renameTo(File(Immagini.cartellaFoto(ctx), "${f.id}.jpg"))
                aggiornaRemoto(op.idLocale) { r -> r.copy(foto = (r.foto + f).distinctBy { it.id }) }
            }

            CodaInvii.Tipo.FIRMA -> {
                val file = File(op.percorso)
                if (!file.exists()) throw PonteFoglio.RifiutatoDalFoglio("La firma non è più sul telefono")
                val remoto = remotoDi(op.idLocale)
                val f = ponte.caricaFile(
                    "firma", op.idLocale, remoto?.id.orEmpty(), op.idFile, file, "image/png",
                    op.firmatario, op.firmatoIl,
                )
                aggiornaRemoto(op.idLocale) { r ->
                    r.copy(firma = f, firmatario = op.firmatario, firmatoIl = op.firmatoIl, stato = Stato.FIRMATO)
                }
            }

            CodaInvii.Tipo.STATO -> sostituisciRemoto(ponte.stato(chiaveFoglio(op.idLocale), op.stato!!))

            CodaInvii.Tipo.TOGLI_FOTO -> sostituisciRemoto(ponte.togliFile(chiaveFoglio(op.idLocale), op.fileId))
        }
    }

    private fun remotoDi(idLocale: String): Rapportino? = _dalFoglio.value.firstOrNull { it.idLocale == idLocale }

    /** Il numero RAP/... se il foglio l'ha gia' dato: e' l'unico modo per trovare i rapportini del primo Wisper. */
    private fun chiaveFoglio(idLocale: String): String = remotoDi(idLocale)?.id?.takeIf { it.isNotBlank() } ?: idLocale

    private fun sostituisciRemoto(r: Rapportino) {
        _dalFoglio.update { lista -> lista.filterNot { it.idLocale == r.idLocale || (r.id.isNotBlank() && it.id == r.id) } + r }
        copia.scriviRapportini(_dalFoglio.value)
    }

    private fun aggiornaRemoto(idLocale: String, cambia: (Rapportino) -> Rapportino) {
        _dalFoglio.update { lista -> lista.map { if (it.idLocale == idLocale) cambia(it) else it } }
        copia.scriviRapportini(_dalFoglio.value)
    }

    // ------------------------------------------------------------- composizione

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
                            modificato = b.modificato,
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
                        if (op.stato == Stato.BOZZA) r.copy(stato = Stato.BOZZA, firma = null, firmatario = "", firmatoIl = "")
                        else r.copy(stato = op.stato ?: r.stato)
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

        /** Un errore detto in modo che si capisca cosa fare. */
        fun spiega(e: Exception): String = when (e) {
            is PonteFoglio.RifiutatoDalFoglio -> e.message.orEmpty()
            is java.net.UnknownHostException, is java.net.ConnectException -> "Niente rete: si aggiorna appena torna"
            is java.net.SocketTimeoutException -> "Il foglio non ha risposto in tempo"
            else -> e.message ?: e.javaClass.simpleName
        }
    }
}

/** Il lavoratore di WorkManager: manda la coda e, se manca la rete, chiede di riprovare. */
class InviaCoda(ctx: Context, parametri: WorkerParameters) : CoroutineWorker(ctx, parametri) {
    override suspend fun doWork(): Result {
        val archivio = (applicationContext as WisperApp).archivio
        return when (archivio.mandaCoda()) {
            Archivio.Esito.RETE -> Result.retry()
            else -> Result.success()
        }
    }
}
