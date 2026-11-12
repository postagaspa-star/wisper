package eu.stgm.wisper

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Stato
import eu.stgm.wisper.ui.Avvisi
import eu.stgm.wisper.ui.BordoMenu
import eu.stgm.wisper.ui.BozzaModulo
import eu.stgm.wisper.ui.CassettoMenu
import eu.stgm.wisper.ui.FiltroRapportini
import eu.stgm.wisper.ui.FirmaPreventivoInAttesa
import eu.stgm.wisper.ui.SchermataAttivita
import eu.stgm.wisper.ui.SchermataCalendario
import eu.stgm.wisper.ui.SchermataContratti
import eu.stgm.wisper.ui.SchermataDettaglioAttivita
import eu.stgm.wisper.ui.SchermataEditorPreventivo
import eu.stgm.wisper.ui.SchermataFirmaPreventivo
import eu.stgm.wisper.ui.SchermataInvioPreventivo
import eu.stgm.wisper.ui.SchermataModificaAttivita
import eu.stgm.wisper.ui.SchermataPreventivi
import eu.stgm.wisper.ui.SchermataPreventivo
import eu.stgm.wisper.ui.FoglioTu
import eu.stgm.wisper.ui.Guscio
import eu.stgm.wisper.ui.LocalAvvisi
import eu.stgm.wisper.ui.LocalGuscio
import eu.stgm.wisper.ui.LocalPermessi
import eu.stgm.wisper.ui.LocalTitolare
import eu.stgm.wisper.ui.LocalVisita
import eu.stgm.wisper.ui.ModuloStato
import eu.stgm.wisper.ui.Navigatore
import eu.stgm.wisper.ui.NonPermesso
import eu.stgm.wisper.ui.PaginaAmministrazione
import eu.stgm.wisper.ui.SchermataAmministrazione
import eu.stgm.wisper.ui.SchermataCliente
import eu.stgm.wisper.ui.SchermataClienti
import eu.stgm.wisper.ui.SchermataAccesso
import eu.stgm.wisper.ui.SchermataCommessa
import eu.stgm.wisper.ui.SchermataCommesse
import eu.stgm.wisper.ui.SchermataInvio
import eu.stgm.wisper.ui.SchermataModificaCliente
import eu.stgm.wisper.ui.SchermataModificaCommessa
import eu.stgm.wisper.ui.SchermataSezioneRapportini
import eu.stgm.wisper.ui.SchermataRiepilogoSpese
import eu.stgm.wisper.ui.SchermataSpesa
import eu.stgm.wisper.ui.SchermataSpese
import eu.stgm.wisper.ui.SchermataTrasferta
import eu.stgm.wisper.ui.SchermataGiornata
import eu.stgm.wisper.ui.GiornataStato
import eu.stgm.wisper.rapportino.Giornata
import eu.stgm.wisper.rapportino.Giornate
import eu.stgm.wisper.ui.SchermataSoggettiArchiviati
import eu.stgm.wisper.ui.SchermataUfficio
import eu.stgm.wisper.ui.Sezione
import eu.stgm.wisper.ui.StratoAvvisi
import eu.stgm.wisper.ui.StratoVisita
import eu.stgm.wisper.ui.TemaWisper
import eu.stgm.wisper.ui.Visita
import eu.stgm.wisper.ui.W
import eu.stgm.wisper.ui.rottaCompito
import eu.stgm.wisper.ui.sezioneDiRotta
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

/**
 * La versione della visita guidata: chi ha visto una visita più vecchia la rivede
 * una volta. La 3 è quella del gestionale (Menu e Dashboard in testa).
 */
private const val VISITA_ATTUALE = 3

class MainActivity : ComponentActivity() {

    private val chiediNotifiche =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // L'unico permesso: l'avviso "rapportini non ancora partiti" quando
        // l'app e' chiusa. Senza, si vede lo stesso dentro l'app.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            chiediNotifiche.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        val archivio = (application as WisperApp).archivio
        // Fase 7 (§3.16): il controllo delle notifiche ogni 15 minuti con la rete.
        ControlloNotifiche.canale(this)
        ControlloNotifiche.programma(this)
        leggiNotifica(intent)
        leggiPromemoria(intent)
        leggiFileCondivisi(intent)
        collegaDaProva.value = ProveCollega.testoDallIntent(intent) ?: collegaDaProva.value
        setContent { Wisper(archivio, this) }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        leggiNotifica(intent)
        leggiPromemoria(intent)
        leggiFileCondivisi(intent)
        collegaDaProva.value = ProveCollega.testoDallIntent(intent) ?: collegaDaProva.value
    }

    /**
     * "Condividi, Wisper" o "Apri con" di un XML, .p7m o .zip di fattura (fase4.md
     * §13.2): i file si copiano subito (il permesso di leggerli dura poco) e si apre
     * Fatturazione, Importa l'XML, che li fa leggere al server senza cambiare niente.
     */
    private fun leggiFileCondivisi(intent: android.content.Intent?) {
        val i = intent ?: return
        // Fase 8 (fase8.md §7.2): un elenco di clienti o fornitori (CSV o Excel) dal Condividi va in Importa clienti e fornitori.
        val flusso = if (i.action == android.content.Intent.ACTION_SEND) {
            if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(android.content.Intent.EXTRA_STREAM, android.net.Uri::class.java)
            else @Suppress("DEPRECATION") i.getParcelableExtra(android.content.Intent.EXTRA_STREAM)
        } else if (i.action == android.content.Intent.ACTION_VIEW) i.data else null
        if (flusso != null) {
            val nome = runCatching { contentResolver.query(flusso, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } }.getOrNull() ?: flusso.lastPathSegment.orEmpty()
            if (eu.stgm.wisper.ui.FileImport.accettato(nome, i.type)) {
                i.action = null
                Thread {
                    val dati = runCatching { contentResolver.openInputStream(flusso)?.use { it.readBytes() } }.getOrNull()
                    runOnUiThread {
                        when {
                            dati == null -> android.widget.Toast.makeText(this, "Il file non si legge", android.widget.Toast.LENGTH_LONG).show()
                            dati.size > 5L * 1024 * 1024 -> android.widget.Toast.makeText(this, "Il file è più grande di 5 MB: non si importa", android.widget.Toast.LENGTH_LONG).show()
                            else -> { eu.stgm.wisper.ui.FileImport.arrivato.value = nome.ifBlank { "clienti.csv" } to dati; apriImportaClienti.value = true }
                        }
                    }
                }.start()
                return
            }
        }
        // Fase 5 (fase5.md §3.1): un collegamento di OneDrive o Drive condiviso come testo va in Documenti, Aggiungi.
        if (i.action == android.content.Intent.ACTION_SEND && i.type?.startsWith("text/") == true) {
            val link = eu.stgm.wisper.rapportino.Collegamenti.daTestoCondiviso(i.getStringExtra(android.content.Intent.EXTRA_TEXT))
            i.action = null
            if (link == null) {
                android.widget.Toast.makeText(this, "Qui non c'è un collegamento da mettere nei documenti", android.widget.Toast.LENGTH_LONG).show()
            } else {
                eu.stgm.wisper.ui.RicordoDocumenti.preparato = eu.stgm.wisper.ui.DocumentoPreparato(url = link)
                apriDocumentoNuovo.value = true
            }
            return
        }
        val uri: List<android.net.Uri> = when (i.action) {
            android.content.Intent.ACTION_SEND -> listOfNotNull(
                if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(android.content.Intent.EXTRA_STREAM, android.net.Uri::class.java)
                else @Suppress("DEPRECATION") i.getParcelableExtra(android.content.Intent.EXTRA_STREAM),
            )
            android.content.Intent.ACTION_SEND_MULTIPLE -> (
                if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(android.content.Intent.EXTRA_STREAM, android.net.Uri::class.java)
                else @Suppress("DEPRECATION") i.getParcelableArrayListExtra(android.content.Intent.EXTRA_STREAM)
                ).orEmpty()
            android.content.Intent.ACTION_VIEW -> listOfNotNull(i.data)
            else -> emptyList()
        }
        if (uri.isEmpty()) return
        // Lo stesso intent non si rilegge (rotazione, ritorno nell'app).
        i.action = null
        // Fase 5: un PDF o una foto (non una fattura) va in Documenti, Aggiungi un documento.
        val nomeDi = { u: android.net.Uri -> runCatching { contentResolver.query(u, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } }.getOrNull() ?: u.lastPathSegment.orEmpty() }
        if (uri.size == 1 && !eu.stgm.wisper.ui.FileInArrivo.accettato(nomeDi(uri[0]))) {
            val u = uri[0]
            Thread {
                val dati = runCatching { contentResolver.openInputStream(u)?.use { it.readBytes() } }.getOrNull()
                runOnUiThread {
                    if (dati == null || dati.size > 50L * 1024 * 1024) {
                        android.widget.Toast.makeText(this, if (dati == null) "Il file non si legge" else "Il file è più grande di 50 MB: non si carica", android.widget.Toast.LENGTH_LONG).show()
                    } else {
                        eu.stgm.wisper.ui.RicordoDocumenti.preparato = eu.stgm.wisper.ui.DocumentoPreparato(file = eu.stgm.wisper.ui.FileArrivato(nomeDi(u), dati))
                        apriDocumentoNuovo.value = true
                    }
                }
            }.start()
            return
        }
        Thread {
            val (file, fuori) = eu.stgm.wisper.ui.FileInArrivo.leggi(this, uri)
            runOnUiThread {
                if (file.isEmpty()) {
                    android.widget.Toast.makeText(this, fuori.firstOrNull() ?: "Il file non si legge", android.widget.Toast.LENGTH_LONG).show()
                } else {
                    eu.stgm.wisper.ui.FileInArrivo.file.value = file
                    apriImporta.value = true
                }
            }
        }.start()
    }

    /** Fase 7: toccando una notifica dello studio si apre la cosa (il collegamento come la Dashboard). */
    private fun leggiNotifica(intent: android.content.Intent?) {
        val i = intent ?: return
        i.getStringExtra(ControlloNotifiche.EXTRA_COLLEGAMENTO)?.takeIf { it.isNotBlank() }?.let { collegamentoDaAprire.value = it }
        i.removeExtra(ControlloNotifiche.EXTRA_COLLEGAMENTO)
    }

    /** Toccando la notifica di un promemoria si apre quell'attività. */
    private fun leggiPromemoria(intent: android.content.Intent?) {
        intent?.getStringExtra(Promemoria.EXTRA_ATTIVITA)?.takeIf { it.isNotBlank() }?.let { attivitaDaAprire.value = it }
    }

    companion object {
        /** L'attività da aprire arrivando da un promemoria: la legge la schermata e la vuota. */
        val attivitaDaAprire = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)

        /** Sono arrivati file di fatture dal Condividi: si apre Importa l'XML appena si può. */
        val apriImporta = kotlinx.coroutines.flow.MutableStateFlow(false)

        /** Fase 5: un collegamento o un file dal Condividi: si apre Documenti, Aggiungi un documento. */
        val apriDocumentoNuovo = kotlinx.coroutines.flow.MutableStateFlow(false)

        /** Fase 8: un CSV o un Excel di clienti dal Condividi: si apre Amministrazione › Importa clienti e fornitori. */
        val apriImportaClienti = kotlinx.coroutines.flow.MutableStateFlow(false)

        /** Fase 7: il collegamento (JSON) di una notifica toccata, da aprire appena si può. */
        val collegamentoDaAprire = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)

        /** Solo nelle build di prova (ProveCollega): il testo di un QR da dare a Collega un computer. Nel rilascio resta null. */
        val collegaDaProva = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)
    }

    override fun onResume() {
        super.onResume()
        // Ogni volta che si torna nell'app si rilegge: magari dal computer e' cambiato qualcosa.
        (application as WisperApp).archivio.aggiorna()
    }
}

/**
 * Le schermate (docs/gestionale/fase1-schermate.md §1). Niente libreria di
 * navigazione: una stringa per le pagine a tutto schermo e una pila di rotte per
 * ognuna delle voci del menu laterale, tutto salvato per la rotazione.
 *
 *  - "accesso"       entrare con email e password (primo avvio, accesso scaduto, Esci)
 *  - "sezioni"       le voci del menu laterale, ognuna con la sua pila; la casa è la Dashboard
 *  - "rapportino"    il rapportino della giornata aperto, coi suoi lavori (stato in [modulo], su disco in [BozzaModulo])
 *  - "collega"       Collega un computer: la fotocamera che legge il QR di Wisper Ufficio (collega-qr.md §7)
 */
@Composable
private fun Wisper(archivio: Archivio, attivita: ComponentActivity) {
    val config = archivio.configurazione
    var tema by remember { mutableStateOf(config.tema) }

    TemaWisper(tema) {
        val scuro = W.colori.scuro
        LaunchedEffect(scuro) {
            val trasparente = android.graphics.Color.TRANSPARENT
            val stile = if (scuro) SystemBarStyle.dark(trasparente) else SystemBarStyle.light(trasparente, trasparente)
            attivita.enableEdgeToEdge(statusBarStyle = stile, navigationBarStyle = stile)
        }

        val ctx = LocalContext.current
        val scope = rememberCoroutineScope()
        val bozza = remember { BozzaModulo(ctx.filesDir) }
        val visita = remember { Visita() }
        // Durante la visita l'app gira sui dati di esempio, poi torna a quelli veri.
        val esempio = remember(visita.attiva) { if (visita.attiva) DatiEsempio(cartella = ctx.cacheDir) else null }
        val dati: Dati = esempio ?: archivio
        val sessione by dati.sessione.collectAsStateWithLifecycle()
        // Chi è entrato davvero (non quello della visita): senza, si torna all'accesso.
        val sessioneVera by archivio.sessione.collectAsStateWithLifecycle()
        val permessi = sessione.permessi
        val ana by dati.anagrafiche.collectAsStateWithLifecycle()

        // Se Android ha chiuso l'app a metà rapportino (la fotocamera, una
        // telefonata), si riparte da lì.
        var modulo by remember { mutableStateOf(bozza.leggi()) }
        var pagina by rememberSaveable {
            mutableStateOf(
                when {
                    !archivio.configurato -> "accesso"
                    modulo != null -> "rapportino"
                    else -> "sezioni"
                }
            )
        }
        if (pagina == "rapportino" && modulo == null) pagina = "sezioni"

        // Le voci del menu, ognuna con la sua pila di rotte (una riga per rotta, per salvarle).
        var sezioneNome by rememberSaveable { mutableStateOf(Sezione.DASHBOARD.name) }
        val sezione = Sezione.entries.firstOrNull { it.name == sezioneNome } ?: Sezione.DASHBOARD
        var pileTesto by rememberSaveable { mutableStateOf(List(Sezione.entries.size) { "" }) }
        fun pila(s: Sezione): List<String> = pileTesto.getOrElse(s.ordinal) { "" }.split('\n').filter { it.isNotEmpty() }
        fun mettiPila(s: Sezione, rotte: List<String>) {
            pileTesto = pileTesto.toMutableList().also { while (it.size < Sezione.entries.size) it.add(""); it[s.ordinal] = rotte.joinToString("\n") }
        }
        var filtro by remember { mutableStateOf(FiltroRapportini()) }
        var avanti by remember { mutableStateOf(true) }
        val avvisi = remember { Avvisi() }
        val cassetto = rememberDrawerState(DrawerValue.Closed)
        // Il foglio "Tu": null chiuso, "" dal cerchio, "esci" da Esci in fondo al menu.
        var foglioTu by remember { mutableStateOf<String?>(null) }
        // Fase 5: dopo la firma di un rapportino col ticket, "Il lavoro è finito?".
        var lavoroFinito by remember { mutableStateOf<Rapportino?>(null) }

        // 03/11/2026 (progetti.md §5): tutte le funzioni si spengono. La casa e' la prima voce accesa del menu (di solito la
        // Dashboard); se non ce n'e' nessuna, la pagina "Nessuna funzione accesa" (nella voce Dashboard, che non si vede).
        fun casa(): Sezione = vociVere(sessione).firstOrNull() ?: Sezione.DASHBOARD
        fun aCasa() {
            val s = casa()
            sezioneNome = s.name
            mettiPila(s, emptyList())
            pagina = "sezioni"
        }

        visita.vaiA = { p ->
            when (p) {
                "dashboard" -> { modulo = null; scope.launch { cassetto.close() }; aCasa() }
                // Fase 3: la visita passa da Spese e trasferte (Nuova spesa) e dai Rapportini (07/11/2026: niente più timer).
                // Fase 4: la visita passa da Fatturazione e da Banche e scadenze.
                "fatturazione", "banche" -> {
                    modulo = null
                    scope.launch { cassetto.close() }
                    val s = if (p == "fatturazione") Sezione.FATTURAZIONE else Sezione.BANCHE
                    if (p == "fatturazione") eu.stgm.wisper.ui.RicordoFatture.segmento = eu.stgm.wisper.ui.SegmentoFatture.DA_FATTURARE
                    else eu.stgm.wisper.ui.RicordoBanche.segmento = eu.stgm.wisper.ui.SegmentoBanche.SCADENZIARIO
                    mettiPila(s, emptyList())
                    sezioneNome = s.name
                    pagina = "sezioni"
                }
                "spese", "rapportini" -> {
                    modulo = null
                    scope.launch { cassetto.close() }
                    val s = if (p == "spese") Sezione.SPESE else Sezione.RAPPORTINI
                    if (p == "spese") eu.stgm.wisper.ui.RicordoSpese.segmento = eu.stgm.wisper.ui.SegmentoSpese.SPESE
                    else eu.stgm.wisper.ui.RicordoRapportini.segmento = eu.stgm.wisper.ui.SegmentoRapportini.RAPPORTINI
                    mettiPila(s, emptyList())
                    sezioneNome = s.name
                    pagina = "sezioni"
                }
                // Fase 5: la visita passa dai ticket (l'urgente in cima) e dal ticket aperto (il giallo).
                "ticket", "ticket-pagina" -> {
                    modulo = null
                    scope.launch { cassetto.close() }
                    eu.stgm.wisper.ui.RicordoTicket.segmento = eu.stgm.wisper.ui.SegmentoTicket.APERTI
                    eu.stgm.wisper.ui.RicordoTicket.filtro = eu.stgm.wisper.ui.FiltroTicket.TUTTI
                    mettiPila(Sezione.TICKET, if (p == "ticket") emptyList() else listOf("ticket/14"))
                    sezioneNome = Sezione.TICKET.name
                    pagina = "sezioni"
                }
                // Fase 6 (fase6.md §12.8): Mezzi › Il mio (lo strumento scaduto) e Persone › Ferie e permessi (il giallo).
                // Fase 7 (fase7.md §12.6): Comunicazioni › Da mandare, la prima scheda.
                "comunicazioni" -> {
                    modulo = null
                    scope.launch { cassetto.close() }
                    eu.stgm.wisper.ui.RicordoComunicazioni.mostra("damandare")
                    mettiPila(Sezione.COMUNICAZIONI, emptyList())
                    sezioneNome = Sezione.COMUNICAZIONI.name
                    pagina = "sezioni"
                }
                "mezzi", "persone" -> {
                    modulo = null
                    scope.launch { cassetto.close() }
                    val s = if (p == "mezzi") Sezione.MEZZI else Sezione.PERSONE
                    if (p == "mezzi") eu.stgm.wisper.ui.RicordoMezzi.segmento = eu.stgm.wisper.ui.SegmentoMezzi.MIO
                    else eu.stgm.wisper.ui.RicordoPersone.segmento = eu.stgm.wisper.ui.SegmentoPersone.FERIE
                    mettiPila(s, emptyList())
                    sezioneNome = s.name
                    pagina = "sezioni"
                }
                else -> pagina = p
            }
        }
        visita.allaFine = {
            modulo = null
            aCasa()
            config.visitaVista = VISITA_ATTUALE
        }
        LaunchedEffect(Unit) {
            if (archivio.configurato && config.visitaVista < VISITA_ATTUALE && modulo == null) visita.inizia()
        }
        // Accesso scaduto, revocato, o Esci: si torna alla schermata di accesso. Un rapportino
        // aperto non si toglie di mano: è già al sicuro nella coda, che aspetta il nuovo accesso.
        LaunchedEffect(pagina, sessioneVera.utente.id) {
            if (sessioneVera.utente.id.isBlank() && pagina == "sezioni" && !visita.attiva) {
                scope.launch { cassetto.close() }
                foglioTu = null
                pagina = "accesso"
            }
        }
        // Una voce che il ruolo non vede (dopo un cambio di permessi) riporta alla Dashboard.
        // Fase 8 (§9.5): anche una funzione spenta dal titolare.
        LaunchedEffect(permessi, sessione.interfaccia.funzioniSpente) {
            if (permessi.livelli.isNotEmpty() && sezione !in vociMenu(sessione)) aCasa()
        }

        /**
         * Il rapportino della giornata [giorno] (06/11/2026: uno al giorno, coi suoi lavori): quello che c'e' gia' (scritto
         * da chi e' entrato), o uno nuovo.
         */
        fun giornataDel(giorno: LocalDate): GiornataStato {
            val miei = (dati.storico.value + dati.viste.value).distinctBy { it.rapportino.idLocale }.map { it.rapportino }
                .filter { it.data == giorno && it.stato != Stato.ANNULLATO && (it.tecnico.isBlank() || it.tecnico == dati.tecnico) }
            val gruppo = Giornate.raggruppa(miei) { it }.firstOrNull()
            return if (gruppo != null) GiornataStato(Giornate.giornataDi(gruppo), nuova = false)
            else GiornataStato(Giornata.nuova(dati.tecnico, giorno), nuova = true)
        }

        fun nuovo(giorno: LocalDate, idCliente: String? = null, idCommessa: String? = null) {
            val anag = dati.anagrafiche.value
            val com = idCommessa?.let { id -> anag.commesse.firstOrNull { it.id == id } }
            val cli = (idCliente ?: com?.idCliente)?.let { id -> anag.clienti.firstOrNull { it.id == id } }
            val g = giornataDel(giorno)
            var r = g.lavoroNuovo()
            if (cli != null) r = r.copy(idCliente = cli.id, cliente = cli.nome)
            if (com != null) r = r.copy(idCommessa = com.id, commessa = com.descrizione)
            // Dalla commessa coi progetti accesi (progetti.md §4.6): un solo progetto aperto e' gia' scelto; con piu'
            // progetti il rapportino si apre sulla scelta del progetto.
            val aperti = if (com != null && eu.stgm.wisper.rapportino.RegoleProgetti.attivi(dati.sessione.value))
                eu.stgm.wisper.rapportino.RegoleProgetti.apertiDi(anag, dati.viste.value.map { it.rapportino }, com.id) else null
            if (aperti?.size == 1) r = eu.stgm.wisper.ui.rapportinoDelProgetto(r, anag, aperti.first())
            g.aperto = ModuloStato(r, nuovo = true).also { m ->
                if (aperti != null && aperti.size != 1) { m.perChiAperto = true; m.sceltaCommessa = true; m.sceltaProgetto = true }
            }
            modulo = g
            pagina = "rapportino"
        }

        /** Dalla scheda di un progetto: cliente, commessa e progetto gia' messi, si parte dalle ore (progetti.md §4.4). */
        fun nuovoDaProgetto(idProgetto: String) {
            val anag = dati.anagrafiche.value
            val p = eu.stgm.wisper.rapportino.RegoleProgetti.tutti(anag, dati.viste.value.map { it.rapportino })
                .firstOrNull { it.id == idProgetto || (it.idLocale.isNotBlank() && it.idLocale == idProgetto) } ?: return
            val g = giornataDel(LocalDate.now())
            val r = eu.stgm.wisper.ui.rapportinoDelProgetto(g.lavoroNuovo(), anag, p)
            g.aperto = ModuloStato(r, nuovo = true, passoIniziale = 2)
            modulo = g
            pagina = "rapportino"
        }

        /** Il rapportino del lavoro [idLocale], coi suoi lavori; con [lavoro] anche quel lavoro aperto. */
        fun apri(idLocale: String, lavoro: Boolean) {
            val tutti = (dati.storico.value + dati.viste.value).associateBy { it.rapportino.idLocale }.values.map { it.rapportino }
            val r = tutti.firstOrNull { it.idLocale == idLocale } ?: return
            val chiave = Giornate.chiaveDi(r)
            val gruppo = Giornate.raggruppa(tutti.filter { Giornate.chiaveDi(it) == chiave && it.stato != Stato.ANNULLATO }) { it }.firstOrNull() ?: return
            modulo = GiornataStato(Giornate.giornataDi(gruppo), nuova = false).also { g ->
                if (lavoro && gruppo.voci.size > 1) g.aperto = ModuloStato(r, nuovo = false)
            }
            pagina = "rapportino"
        }

        val nav = Navigatore(
            onVai = { rotta -> avanti = true; mettiPila(sezione, pila(sezione) + rotta) },
            onIndietro = { avanti = false; mettiPila(sezione, pila(sezione).dropLast(1)) },
            onSezione = { s, f ->
                avanti = true
                if (f != null) filtro = f
                // Un filtro dei rapportini (dalla Dashboard, da una commessa) apre il segmento Rapportini.
                if (s == Sezione.RAPPORTINI && f != null) eu.stgm.wisper.ui.RicordoRapportini.segmento = eu.stgm.wisper.ui.SegmentoRapportini.RAPPORTINI
                mettiPila(s, emptyList())
                sezioneNome = s.name
                pagina = "sezioni"
            },
            onApriRapportino = { id, lavoro -> apri(id, lavoro) },
            onNuovoRapportino = { g, cli, com -> nuovo(g, cli, com) },
            onFirmaPreventivo = { id -> pagina = "firma-preventivo:$id" },
            onRapportinoDaTicket = { r ->
                val g = giornataDel(r.data)
                g.aperto = ModuloStato(r.copy(idLocaleGiornata = g.idLocale, idGiornata = g.id), nuovo = true, passoIniziale = 2)
                modulo = g
                pagina = "rapportino"
            },
            onNuovoRapportinoProgetto = ::nuovoDaProgetto,
        )

        // Da un promemoria: la voce Attività, sull'attività.
        val daAprire by MainActivity.attivitaDaAprire.collectAsStateWithLifecycle()
        LaunchedEffect(daAprire, pagina) {
            val id = daAprire ?: return@LaunchedEffect
            if (pagina != "sezioni" || visita.attiva) return@LaunchedEffect
            MainActivity.attivitaDaAprire.value = null
            mettiPila(Sezione.ATTIVITA, listOf("attivita/$id"))
            sezioneNome = Sezione.ATTIVITA.name
        }

        // Fase 7: da una notifica dello studio, la cosa (come una riga della Dashboard).
        val daNotifica by MainActivity.collegamentoDaAprire.collectAsStateWithLifecycle()
        LaunchedEffect(daNotifica, pagina, visita.attiva) {
            val testo = daNotifica ?: return@LaunchedEffect
            if (pagina != "sezioni" || visita.attiva) return@LaunchedEffect
            MainActivity.collegamentoDaAprire.value = null
            val col = runCatching { eu.stgm.wisper.rapportino.Collegamento.daJson(org.json.JSONObject(testo)) }.getOrNull()
            eu.stgm.wisper.ui.apriCollegamento(col, nav, dati.viste.value.map { it.rapportino })
        }

        // Dal Condividi di Android (un XML di fattura da un'email o da WhatsApp): Fatturazione, Importa l'XML.
        val importa by MainActivity.apriImporta.collectAsStateWithLifecycle()
        LaunchedEffect(importa, pagina, visita.attiva) {
            if (!importa || pagina != "sezioni" || visita.attiva) return@LaunchedEffect
            MainActivity.apriImporta.value = false
            mettiPila(Sezione.FATTURAZIONE, listOf("fatture-importa"))
            sezioneNome = Sezione.FATTURAZIONE.name
        }

        // Dal Condividi di Android (un link di OneDrive o Drive, un PDF): Documenti, Aggiungi un documento.
        val docNuovo by MainActivity.apriDocumentoNuovo.collectAsStateWithLifecycle()
        LaunchedEffect(docNuovo, pagina, visita.attiva) {
            if (!docNuovo || pagina != "sezioni" || visita.attiva) return@LaunchedEffect
            MainActivity.apriDocumentoNuovo.value = false
            mettiPila(Sezione.DOCUMENTI, listOf("documento-nuovo"))
            sezioneNome = Sezione.DOCUMENTI.name
        }

        // Fase 8: un elenco di clienti dal Condividi: Amministrazione › Importa clienti e fornitori (con clienti: Modifica).
        val importaClienti by MainActivity.apriImportaClienti.collectAsStateWithLifecycle()
        LaunchedEffect(importaClienti, pagina, visita.attiva) {
            if (!importaClienti || pagina != "sezioni" || visita.attiva) return@LaunchedEffect
            MainActivity.apriImportaClienti.value = false
            if (!permessi.modifica(eu.stgm.wisper.rapportino.Moduli.CLIENTI)) {
                avvisi.mostra("Per importare clienti e fornitori serve Clienti: Modifica")
                eu.stgm.wisper.ui.FileImport.arrivato.value = null
                return@LaunchedEffect
            }
            mettiPila(Sezione.AMMINISTRAZIONE, listOf("amm/importa", "amm/importa-clienti"))
            sezioneNome = Sezione.AMMINISTRAZIONE.name
        }

        // Solo nelle build di prova: il testo di un QR arrivato con l'Intent apre Collega un computer (ProveCollega).
        val daProva by MainActivity.collegaDaProva.collectAsStateWithLifecycle()
        LaunchedEffect(daProva, pagina, visita.attiva) {
            if (daProva == null || visita.attiva || !archivio.configurato) return@LaunchedEffect
            if (pagina == "sezioni") pagina = "collega"
        }

        // Indietro: prima la pila della voce, poi si torna alla Dashboard; dalla Dashboard esce dall'app.
        BackHandler(enabled = pagina == "sezioni" && (pila(sezione).isNotEmpty() || sezione != casa())) {
            if (pila(sezione).isNotEmpty()) nav.indietro() else aCasa()
        }

        val viste by dati.viste.collectAsStateWithLifecycle()
        val daFatturare = remember(viste) {
            val mese = YearMonth.now()
            viste.map { it.rapportino }
                .filter { YearMonth.from(it.data) == mese && (it.stato == Stato.FIRMATO || it.stato == Stato.INVIATO) }
                .map { it.idCliente.ifBlank { it.cliente } }.distinct().size
        }
        val aggiornamento by dati.aggiornamento.collectAsStateWithLifecycle()
        val dashboardLetta by dati.dashboard.collectAsStateWithLifecycle()

        CompositionLocalProvider(
            LocalVisita provides visita,
            LocalAvvisi provides avvisi,
            LocalPermessi provides permessi,
            LocalTitolare provides ana.titolare.ifBlank { config.titolare.substringBefore(' ') },
        ) {
            Box(Modifier.fillMaxSize()) {
                AnimatedContent(
                    targetState = pagina,
                    transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(160)) },
                    label = "pagine",
                ) { p ->
                    when {
                        p == "accesso" -> SchermataAccesso(archivio) {
                            aCasa()
                            if (config.visitaVista < VISITA_ATTUALE) visita.inizia()
                        }

                        p == "sezioni" -> {
                            val cima = pila(sezione).lastOrNull()
                            val compito = rottaCompito(cima)
                            // Fase 8 (§9.5): una funzione spenta sparisce dal menu di tutti (il server mette anche il permesso a 0).
                            // Dal 03/11/2026 al titolare resta Amministrazione anche spenta, con la sola pagina Funzioni (vociMenu).
                            val voci = vociMenu(sessione)
                            ModalNavigationDrawer(
                                drawerState = cassetto,
                                // Si apre dal pulsante Menu e dal bordo; aperto, si chiude anche scorrendo a sinistra.
                                gesturesEnabled = cassetto.isOpen,
                                scrimColor = W.colori.veloMenu,
                                drawerContent = {
                                    ModalDrawerSheet(
                                        modifier = Modifier.width(312.dp),
                                        drawerShape = RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp),
                                        drawerContainerColor = W.colori.foglio,
                                        windowInsets = androidx.compose.foundation.layout.WindowInsets(0),
                                    ) {
                                        CassettoMenu(
                                            utente = sessione.utente,
                                            voci = voci,
                                            attiva = sezioneDiRotta(cima, sezione),
                                            // Fase 8 (§8.6): con un server della fase 8 i numerini li conta lui, con una regola sola.
                                            numeri = dashboardLetta?.numerini?.let { n -> Sezione.entries.associateWith { s -> n[s.modulo] ?: 0 } } ?: mapOf(
                                                Sezione.FATTURAZIONE to if (permessi.costi) (dashboardLetta?.fase4?.clientiDaFatturare ?: daFatturare) else 0,
                                                // Fase 5 (§16.18): i ticket che nessuno ha preso; i documenti da approvare, solo per chi approva.
                                                Sezione.TICKET to (dashboardLetta?.fase5?.ticketNonAssegnati ?: 0),
                                                Sezione.DOCUMENTI to if (sessione.puoApprovareDocumenti) (dashboardLetta?.fase5?.documentiDaApprovare ?: 0) else 0,
                                                // Fase 6 (§11.1): le richieste da approvare (chi approva); tarature scadute, mezzi fermi e
                                                // prestiti in ritardo; i collaboratori con un incarico affidato e documenti scaduti.
                                                Sezione.PERSONE to if (sessione.puoApprovareAssenze) (dashboardLetta?.fase6?.ferieDaApprovare ?: 0) else 0,
                                                Sezione.MEZZI to (dashboardLetta?.fase6?.numerinoMezzi ?: 0),
                                                Sezione.COLLABORATORI to if (sessione.esterno) 0 else (dashboardLetta?.fase6?.nonInRegola ?: 0),
                                                // Fase 7 (§11.1): da mandare oggi più preparati non mandati; da guardare del portale.
                                                Sezione.COMUNICAZIONI to (dashboardLetta?.fase7?.numerinoComunicazioni ?: 0),
                                                Sezione.PORTALE to (dashboardLetta?.fase7?.portaleDaGuardare ?: 0),
                                                // Fase 8 (§8.6): i collegamenti in Errore, solo per il titolare e chi ha Amministrazione: Modifica.
                                                Sezione.INTEGRAZIONI to if (sessione.utente.ruolo == eu.stgm.wisper.rapportino.Ruoli.TITOLARE || permessi.modifica(eu.stgm.wisper.rapportino.Moduli.AMMINISTRAZIONE))
                                                    (dashboardLetta?.integrazioniErrore ?: 0) else 0,
                                            ),
                                            esterno = if (sessione.esterno) sessione.interfaccia.esternoNome.ifBlank { "collaboratore" } else "",
                                            collegato = aggiornamento.errore.isBlank() && aggiornamento.ultimo != null,
                                            statoCollegamento = when {
                                                aggiornamento.inCorso && aggiornamento.ultimo == null -> "Mi collego…"
                                                aggiornamento.errore.isBlank() && aggiornamento.ultimo != null ->
                                                    "Collegato · letto alle " + aggiornamento.ultimo!!.format(DateTimeFormatter.ofPattern("H:mm"))
                                                else -> "Server non raggiunto"
                                            },
                                            onVoce = { s -> scope.launch { cassetto.close() }; nav.sezione(s) },
                                            onRiprova = { dati.aggiorna() },
                                            onEsci = { scope.launch { cassetto.close() }; foglioTu = "esci" },
                                            onChiudi = { scope.launch { cassetto.close() } },
                                            // Collega un computer: non nella visita guidata (dati di esempio).
                                            onCollega = if (dati.esempio) null else ({ scope.launch { cassetto.close() }; pagina = "collega" }),
                                        )
                                    }
                                },
                            ) {
                                Box(Modifier.fillMaxSize().background(W.colori.fondo)) {
                                    AnimatedContent(
                                        targetState = sezione to cima,
                                        transitionSpec = {
                                            if (initialState.first != targetState.first) fadeIn(tween(200)) togetherWith fadeOut(tween(120))
                                            else if (avanti) (slideInHorizontally(tween(260)) { it / 12 } + fadeIn(tween(260))) togetherWith fadeOut(tween(120))
                                            else (slideInHorizontally(tween(260)) { -it / 12 } + fadeIn(tween(260))) togetherWith fadeOut(tween(120))
                                        },
                                        label = "sezione",
                                    ) { (s, rotta) ->
                                        val guscio = Guscio(
                                            primoLivello = rotta == null,
                                            sezione = sezioneDiRotta(rotta, s),
                                            utente = sessione.utente,
                                            apriMenu = { scope.launch { cassetto.open() } },
                                            apriTu = { foglioTu = "" },
                                            // Fase 7: la campanella, per chi vede le comunicazioni.
                                            notifiche = sessione.interfaccia.notificheNuove,
                                            apriNotifiche = if (permessi.vede(eu.stgm.wisper.rapportino.Moduli.COMUNICAZIONI)) ({
                                                eu.stgm.wisper.ui.RicordoComunicazioni.segmento = eu.stgm.wisper.ui.SegmentoComunicazioni.NOTIFICHE
                                                nav.sezione(Sezione.COMUNICAZIONI)
                                            }) else null,
                                        )
                                        CompositionLocalProvider(LocalGuscio provides guscio) {
                                            Box(
                                                Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()
                                                    // 06/11/2026: anche Amministrazione, dove i campi stanno sulla pagina e si salvano da soli.
                                                    .let { if (rottaCompito(rotta) || rotta?.startsWith("amm/") == true) it.imePadding() else it },
                                            ) {
                                                PaginaSezione(
                                                    s, rotta, dati, archivio, nav, filtro, { filtro = it }, tema,
                                                    nessunaFunzione = vociVere(sessione).isEmpty() && permessi.livelli.isNotEmpty(),
                                                    titolare = sessione.utente.ruolo == eu.stgm.wisper.rapportino.Ruoli.TITOLARE,
                                                    onTema = { tema = it; config.tema = it },
                                                    onVisita = { visita.inizia() },
                                                    onNuovo = { g -> nuovo(g) },
                                                    onComeIeri = { r ->
                                                        // Il lavoro di ieri entra nel rapportino di oggi: si guarda e si salva.
                                                        val g = giornataDel(LocalDate.now())
                                                        g.lavori.add(Riepiloghi.comeIeri(r).copy(idLocaleGiornata = g.idLocale, idGiornata = g.id, data = g.data))
                                                        modulo = g
                                                        pagina = "rapportino"
                                                    },
                                                )
                                            }
                                        }
                                    }
                                    StratoAvvisi(avvisi, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 8.dp))
                                    if (!compito && !visita.attiva) BordoMenu({ scope.launch { cassetto.open() } }, Modifier.statusBarsPadding())
                                }
                            }
                            BackHandler(enabled = cassetto.isOpen) { scope.launch { cassetto.close() } }
                        }

                        p == "collega" -> eu.stgm.wisper.ui.SchermataCollegaComputer(
                            dati = dati,
                            testoProva = daProva,
                            onTestoProvaUsato = { MainActivity.collegaDaProva.value = null },
                            onChiudi = { pagina = "sezioni" },
                        )

                        p == "rapportino" -> modulo?.let { m ->
                            SchermataGiornata(
                                dati = dati,
                                stato = m,
                                bozza = bozza,
                                onChiudi = { modulo = null; pagina = "sezioni" },
                                // "Invia ai clienti": si chiude il rapportino e si prepara l'invio nella voce aperta, diviso per destinatario.
                                onInvia = { ids -> modulo = null; pagina = "sezioni"; nav.vai("invio/scelti/" + ids.joinToString(",") { android.net.Uri.encode(it) }) },
                                // Fase 5 (§3.3): un lavoro col ticket chiede "Il lavoro è finito?".
                                onSalvata = { g -> if (!dati.esempio) g.lavori.firstOrNull { it.conTicket }?.let { lavoroFinito = it } },
                            )
                        }

                        p.startsWith("firma-preventivo:") -> {
                            val id = p.removePrefix("firma-preventivo:")
                            val prev = dati.dettagliPreventivi.value[id] ?: dati.preventivi.value.firstOrNull { it.id == id }
                            val nomeCliente = prev?.let { ana.cliente(it.idCliente)?.nome ?: it.nomeCliente }.orEmpty()
                            SchermataFirmaPreventivo(
                                sopra = listOf(nomeCliente, prev?.numero.orEmpty()).filter { it.isNotBlank() }.joinToString(" · "),
                                oggetto = prev?.oggetto.orEmpty(),
                                // Mai i soldi: il telefono adesso è in mano al cliente.
                                dettaglio = prev?.let { pv -> listOfNotNull(pv.data?.let { "Preventivo del " + it.format(DateTimeFormatter.ofPattern("d MMMM yyyy", java.util.Locale.ITALY)) }, pv.scadenza?.let { "valido fino al " + it.format(DateTimeFormatter.ofPattern("d MMMM", java.util.Locale.ITALY)) }).joinToString(" · ") }.orEmpty(),
                                nome = if (FirmaPreventivoInAttesa.id == id) FirmaPreventivoInAttesa.nome else "",
                                onConferma = { disegno, nome ->
                                    val scelte = if (FirmaPreventivoInAttesa.id == id) FirmaPreventivoInAttesa.scelte else emptyMap()
                                    pagina = "sezioni"
                                    avvisi.mostra("Salvo la firma…")
                                    scope.launch {
                                        val png = java.io.ByteArrayOutputStream().use { out -> disegno.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out); out.toByteArray() }
                                        dati.accettaPreventivo(id, "firma", nome, scelte, firma = png)
                                            .onSuccess { avvisi.mostra("Firmato: preventivo accettato") }
                                            .onFailure { avvisi.mostra(it.message?.takeIf { m -> m.isNotBlank() } ?: "La firma non è stata salvata: riprova") }
                                    }
                                },
                                onAnnulla = { pagina = "sezioni" },
                            )
                        }

                        // 06/11/2026: niente piu' firma del cliente nei rapportini (la pagina "firma:" non c'e' piu').
                    }
                }
                lavoroFinito?.let { r -> eu.stgm.wisper.ui.FoglioLavoroFinito(dati, r) { lavoroFinito = null } }
                // Fase 7 (§3.13): al ritorno da WhatsApp, "L'hai mandato?".
                eu.stgm.wisper.ui.FoglioLhaiMandato(dati)
                eu.stgm.wisper.ui.FoglioMessaggioGlobale(dati)
                eu.stgm.wisper.ui.SeguiCoda7(dati)
                foglioTu?.let { modoTu ->
                    FoglioTu(
                        dati = dati,
                        onChiudi = { foglioTu = null },
                        onApp = { foglioTu = null; nav.vai("amm/app") },
                        onVai = { r -> foglioTu = null; nav.vai(r) },
                        onUscito = { foglioTu = null; aCasa() },
                        modoIniziale = modoTu,
                    )
                }
                StratoVisita(visita)
            }
        }
    }
}

/** Quale schermata mostrare in una voce: la sua prima pagina, o la rotta in cima alla pila. */
@Composable
private fun PaginaSezione(
    sezione: Sezione,
    rotta: String?,
    dati: Dati,
    archivio: Archivio,
    nav: Navigatore,
    filtro: FiltroRapportini,
    onFiltro: (FiltroRapportini) -> Unit,
    tema: String,
    /** Tutte le funzioni spente (progetti.md §5): la pagina vuota, col pulsante Funzioni per il titolare. */
    nessunaFunzione: Boolean,
    titolare: Boolean,
    onTema: (String) -> Unit,
    onVisita: () -> Unit,
    onNuovo: (LocalDate) -> Unit,
    onComeIeri: (Rapportino) -> Unit,
) {
    val permessi = LocalPermessi.current
    if (rotta == null && nessunaFunzione && sezione == Sezione.DASHBOARD) {
        PaginaNessunaFunzione(titolare) { nav.sezione(Sezione.AMMINISTRAZIONE) }
        return
    }
    // Amministrazione spenta (progetti.md §5): al titolare resta la sola pagina Funzioni, per riaccenderla.
    val ammRidotta = titolare && sezioneDiRotta(rotta, sezione) == Sezione.AMMINISTRAZIONE && !permessi.vede(eu.stgm.wisper.rapportino.Moduli.AMMINISTRAZIONE)
    if (ammRidotta && (rotta == null || rotta == "amm/funzioni")) {
        eu.stgm.wisper.ui.PaginaFunzioni(dati) { nav.indietro() }
        return
    }
    // Una pagina del modulo che il ruolo non vede: la scheda calma "Non hai il permesso".
    // L'app (tema, visita, versione) è di tutti.
    // 1.4.0: Servizi non ha un modulo suo (si vede con Preventivi, Rapportini o Fatture): lo dice Sezione.vista.
    val sezioneRotta = sezioneDiRotta(rotta, sezione)
    if (rotta != "amm/app" && rotta?.startsWith("tu/") != true && permessi.livelli.isNotEmpty() && !sezioneRotta.vista(permessi)) {
        NonPermesso(if (rotta != null) ({ nav.indietro() }) else null)
        return
    }
    when {
        rotta == null -> when (sezione) {
            Sezione.DASHBOARD -> eu.stgm.wisper.ui.SchermataCasa(dati, nav, onNuovo)
            Sezione.CLIENTI -> SchermataClienti(dati, nav)
            Sezione.COMMESSE -> SchermataCommesse(dati, nav)
            Sezione.PROGETTI -> eu.stgm.wisper.ui.SchermataProgetti(dati, nav)
            Sezione.PREVENTIVI -> SchermataPreventivi(dati, nav)
            Sezione.SERVIZI -> eu.stgm.wisper.ui.SchermataServizi(dati, nav)
            Sezione.ATTIVITA -> SchermataAttivita(dati, nav)
            Sezione.RAPPORTINI -> SchermataSezioneRapportini(dati, nav, filtro, onFiltro, onNuovo, onComeIeri)
            Sezione.SPESE -> SchermataSpese(dati, nav)
            Sezione.FATTURAZIONE -> eu.stgm.wisper.ui.SchermataFatturazione(dati, nav)
            Sezione.BANCHE -> eu.stgm.wisper.ui.SchermataBanche(dati, nav)
            Sezione.DOCUMENTI -> eu.stgm.wisper.ui.SchermataDocumenti(dati, nav)
            Sezione.TICKET -> eu.stgm.wisper.ui.SchermataTicket(dati, nav)
            Sezione.PERSONE -> eu.stgm.wisper.ui.SchermataPersone(dati, nav)
            Sezione.MEZZI -> eu.stgm.wisper.ui.SchermataMezzi(dati, nav)
            Sezione.COLLABORATORI -> eu.stgm.wisper.ui.SchermataCollaboratori(dati, nav)
            Sezione.COMUNICAZIONI -> eu.stgm.wisper.ui.SchermataComunicazioni(dati, nav)
            Sezione.PORTALE -> eu.stgm.wisper.ui.SchermataPortale(dati, nav)
            Sezione.INTEGRAZIONI -> eu.stgm.wisper.ui.SchermataIntegrazioni(dati, nav)
            Sezione.AMMINISTRAZIONE -> SchermataAmministrazione(dati, archivio, nav)
        }
        // Fase 8: integrazioni, Tutto quello che c'è da fare, il calendario in altre app, le pagine di Tu (docs/gestionale/fase8.md §15.1)
        rotta == "integrazioni" -> eu.stgm.wisper.ui.SchermataIntegrazioni(dati, nav)
        rotta.startsWith("integrazione/") -> eu.stgm.wisper.ui.SchermataIntegrazione(dati, nav, rotta.removePrefix("integrazione/"))
        rotta == "tutto" -> eu.stgm.wisper.ui.SchermataTutto(dati, nav)
        rotta == "calendario-altre" -> eu.stgm.wisper.ui.SchermataCalendarioAltre(dati, nav)
        rotta.startsWith("tu/") -> PaginaAmministrazione("tu-" + rotta.removePrefix("tu/"), dati, archivio, nav, tema, onTema, onVisita)
        // Fase 7: comunicazioni, modelli, portale clienti (docs/gestionale/fase7.md §12)
        rotta == "comunicazioni" -> eu.stgm.wisper.ui.SchermataComunicazioni(dati, nav)
        rotta.startsWith("comunicazione/") -> eu.stgm.wisper.ui.SchermataComunicazione(dati, nav, rotta.removePrefix("comunicazione/"))
        rotta == "modello-messaggio-nuovo" -> eu.stgm.wisper.ui.SchermataModello(dati, nav, null)
        rotta.startsWith("modello-messaggio/") -> eu.stgm.wisper.ui.SchermataModello(dati, nav, rotta.removePrefix("modello-messaggio/"))
        rotta == "portale" -> eu.stgm.wisper.ui.SchermataPortale(dati, nav)
        rotta.startsWith("portale-cliente/") -> eu.stgm.wisper.ui.SchermataPortaleCliente(dati, nav, rotta.removePrefix("portale-cliente/"))
        // Fase 6: persone, mezzi e attrezzature, collaboratori esterni (docs/gestionale/fase6.md §12)
        rotta == "persona-nuova" -> eu.stgm.wisper.ui.SchermataModificaPersona(dati, nav, null)
        rotta.startsWith("persona-modifica/") -> eu.stgm.wisper.ui.SchermataModificaPersona(dati, nav, rotta.removePrefix("persona-modifica/"))
        rotta.startsWith("persona/") -> eu.stgm.wisper.ui.SchermataPersona(dati, nav, rotta.removePrefix("persona/"))
        rotta == "assenza-nuova" -> eu.stgm.wisper.ui.SchermataChiedi(dati, nav)
        rotta.startsWith("accessi-riservati/") -> eu.stgm.wisper.ui.SchermataAccessiRiservati(dati, nav, rotta.removePrefix("accessi-riservati/"))
        rotta.startsWith("dpi-consegna/") -> eu.stgm.wisper.ui.SchermataConsegnaDpi(dati, nav, rotta.removePrefix("dpi-consegna/"))
        rotta == "mezzo-nuovo" -> eu.stgm.wisper.ui.SchermataNuovoMezzo(dati, nav)
        rotta.startsWith("mezzo/") -> eu.stgm.wisper.ui.SchermataMezzo(dati, nav, rotta.removePrefix("mezzo/"))
        rotta.startsWith("mezzi-altro/") -> eu.stgm.wisper.ui.SchermataAltroMezzi(dati, nav, rotta.removePrefix("mezzi-altro/"))
        rotta == "strumento-nuovo" -> eu.stgm.wisper.ui.SchermataNuovoStrumento(dati, nav)
        rotta.startsWith("strumento/") -> eu.stgm.wisper.ui.SchermataStrumento(dati, nav, rotta.removePrefix("strumento/"))
        rotta.startsWith("guasto-nuovo/") -> rotta.removePrefix("guasto-nuovo/").split('/').let { p -> eu.stgm.wisper.ui.SchermataGuasto(dati, nav, p.first(), p.getOrElse(1) { "" }) }
        rotta == "collaboratore-nuovo" -> eu.stgm.wisper.ui.SchermataNuovoCollaboratore(dati, nav)
        rotta.startsWith("collaboratore/") -> eu.stgm.wisper.ui.SchermataCollaboratore(dati, nav, rotta.removePrefix("collaboratore/"))
        rotta.startsWith("incarico-nuovo/") -> eu.stgm.wisper.ui.SchermataNuovoIncarico(dati, nav, rotta.removePrefix("incarico-nuovo/"))
        rotta.startsWith("incarico-lettera/") -> eu.stgm.wisper.ui.SchermataLetteraIncarico(dati, nav, rotta.removePrefix("incarico-lettera/"))
        rotta.startsWith("incarico/") -> eu.stgm.wisper.ui.SchermataIncarico(dati, nav, rotta.removePrefix("incarico/"))
        // Fase 5: ticket e assistenza (docs/gestionale/fase5.md §12.1)
        rotta == "ticket" -> eu.stgm.wisper.ui.SchermataTicket(dati, nav)
        rotta.startsWith("ticket-nuovo") -> eu.stgm.wisper.ui.SchermataNuovoTicket(dati, nav, rotta.removePrefix("ticket-nuovo").removePrefix("/"))
        rotta.startsWith("ticket-modifica/") -> eu.stgm.wisper.ui.SchermataNuovoTicket(dati, nav, "modifica:" + rotta.removePrefix("ticket-modifica/"))
        rotta.startsWith("ticket/") -> eu.stgm.wisper.ui.SchermataDettaglioTicket(dati, nav, rotta.removePrefix("ticket/"))
        rotta.startsWith("impianto/") -> eu.stgm.wisper.ui.SchermataImpianto(dati, nav, rotta.removePrefix("impianto/"))
        rotta == "contratto-ca-nuovo" -> eu.stgm.wisper.ui.SchermataModificaContratto(dati, nav, null)
        rotta.startsWith("contratto-ca-modifica/") -> eu.stgm.wisper.ui.SchermataModificaContratto(dati, nav, rotta.removePrefix("contratto-ca-modifica/"))
        rotta.startsWith("contratto-ca/") -> eu.stgm.wisper.ui.SchermataContratto(dati, nav, rotta.removePrefix("contratto-ca/"))
        // Fase 5: documenti (§12.3)
        rotta == "documenti" -> eu.stgm.wisper.ui.SchermataDocumenti(dati, nav)
        rotta.startsWith("documento-nuovo") -> eu.stgm.wisper.ui.SchermataAggiungiDocumento(dati, nav)
        rotta.startsWith("documento/") -> eu.stgm.wisper.ui.SchermataDocumento(dati, nav, rotta.removePrefix("documento/"))
        rotta == "scadenza-nuova" -> eu.stgm.wisper.ui.SchermataNuovaScadenza(dati, nav)
        rotta.startsWith("scadenza/") -> eu.stgm.wisper.ui.SchermataScadenza(dati, nav, rotta.removePrefix("scadenza/"))
        rotta.startsWith("lettera-nuova") -> eu.stgm.wisper.ui.SchermataLettera(dati, nav, rotta.removePrefix("lettera-nuova").removePrefix("/"))
        rotta.startsWith("modello-testi/") -> eu.stgm.wisper.ui.SchermataTestiModello(dati, nav, rotta.removePrefix("modello-testi/"))
        rotta.startsWith("amm/") -> PaginaAmministrazione(rotta.removePrefix("amm/"), dati, archivio, nav, tema, onTema, onVisita)
        rotta == "impostazioni" -> PaginaAmministrazione("app", dati, archivio, nav, tema, onTema, onVisita)
        rotta.startsWith("invio/preventivo/") -> SchermataInvioPreventivo(dati, nav, rotta.removePrefix("invio/preventivo/"))
        rotta.startsWith("invio/") -> SchermataInvio(dati, nav, rotta.removePrefix("invio/"))
        rotta == "preventivi" -> SchermataPreventivi(dati, nav)
        rotta.startsWith("preventivo/") -> SchermataPreventivo(dati, nav, rotta.removePrefix("preventivo/"))
        rotta.startsWith("preventivo-nuovo") || rotta.startsWith("preventivo-modifica/") -> SchermataEditorPreventivo(dati, nav, rotta)
        // 1.4.0 (servizi.md §1): il listino sono i Servizi; la scheda di un servizio, nuovo o da cambiare.
        rotta == "listino" || rotta == "servizi" -> eu.stgm.wisper.ui.SchermataServizi(dati, nav)
        rotta == "servizio-nuovo" -> eu.stgm.wisper.ui.SchermataServizio(dati, nav, null)
        rotta.startsWith("servizio/") -> eu.stgm.wisper.ui.SchermataServizio(dati, nav, rotta.removePrefix("servizio/"))
        rotta == "contratti" -> SchermataContratti(dati, nav)
        rotta == "attivita" -> SchermataAttivita(dati, nav)
        rotta.startsWith("attivita/") -> SchermataDettaglioAttivita(dati, nav, rotta.removePrefix("attivita/"))
        rotta.startsWith("attivita-nuova") || rotta.startsWith("attivita-modifica/") -> SchermataModificaAttivita(dati, nav, rotta)
        rotta.startsWith("calendario") -> SchermataCalendario(dati, nav, rotta.removePrefix("calendario").removePrefix("/"))
        rotta == "commesse" -> SchermataCommesse(dati, nav)
        // I progetti (docs/gestionale/progetti.md §4)
        rotta == "progetti" -> eu.stgm.wisper.ui.SchermataProgetti(dati, nav)
        rotta.startsWith("progetto/") -> eu.stgm.wisper.ui.SchermataProgetto(dati, nav, rotta.removePrefix("progetto/"))
        rotta.startsWith("progetto-modifica/") -> eu.stgm.wisper.ui.SchermataModificaProgetto(dati, nav, rotta.removePrefix("progetto-modifica/"), null)
        rotta.startsWith("progetto-nuovo") -> eu.stgm.wisper.ui.SchermataModificaProgetto(dati, nav, null, rotta.removePrefix("progetto-nuovo").removePrefix("/").ifBlank { null })
        rotta.startsWith("commessa/") -> SchermataCommessa(dati, nav, rotta.removePrefix("commessa/"))
        rotta.startsWith("commessa-modifica/") -> SchermataModificaCommessa(dati, nav, rotta.removePrefix("commessa-modifica/"), null)
        rotta.startsWith("commessa-nuova") -> SchermataModificaCommessa(dati, nav, null, rotta.removePrefix("commessa-nuova").removePrefix("/").ifBlank { null })
        // Fase 3: spese e trasferte (docs/gestionale/fase3.md). 07/11/2026: le Ore non ci sono più; una pagina
        // delle ore rimasta in una pila di prima (Registra ore, statistiche) torna subito ai Rapportini.
        rotta.startsWith("ore-") -> androidx.compose.runtime.LaunchedEffect(rotta) { nav.indietro() }
        rotta.startsWith("spesa-veloce") -> eu.stgm.wisper.ui.SchermataSpesaVeloce(dati, nav)
        rotta.startsWith("spesa-nuova") -> SchermataSpesa(dati, nav, "nuova" + rotta.removePrefix("spesa-nuova"))
        rotta.startsWith("spesa/") -> SchermataSpesa(dati, nav, rotta.removePrefix("spesa/"))
        rotta == "trasferta-nuova" -> SchermataTrasferta(dati, nav, "nuova")
        rotta.startsWith("trasferta/") -> SchermataTrasferta(dati, nav, rotta.removePrefix("trasferta/"))
        rotta == "spese-riepilogo" -> SchermataRiepilogoSpese(dati, nav)
        // Fase 4: fatture, ricevute, importazione dell'XML, banche (docs/gestionale/fase4.md)
        rotta.startsWith("fattura/") -> eu.stgm.wisper.ui.SchermataFattura(dati, nav, rotta.removePrefix("fattura/"))
        rotta.startsWith("fattura-passa/") -> eu.stgm.wisper.ui.SchermataPassa(dati, nav, rotta.removePrefix("fattura-passa/"))
        rotta == "fattura-nuova" -> eu.stgm.wisper.ui.SchermataNuovaFattura(dati, nav)
        rotta == "fatture-importa" -> eu.stgm.wisper.ui.SchermataImportaXml(dati, nav)
        rotta == "fatture-scadenze" -> eu.stgm.wisper.ui.SchermataScadenzeCommesse(dati, nav)
        rotta.startsWith("ricevuta/") -> eu.stgm.wisper.ui.SchermataRicevuta(dati, nav, rotta.removePrefix("ricevuta/"))
        rotta == "banche-situazione" -> eu.stgm.wisper.ui.SchermataSituazione(dati, nav)
        rotta == "clienti" -> SchermataClienti(dati, nav)
        rotta == "soggetti-archiviati" -> SchermataSoggettiArchiviati(dati, nav)
        rotta.startsWith("cliente/") -> SchermataCliente(dati, nav, rotta.removePrefix("cliente/"))
        rotta.startsWith("cliente-modifica/") -> SchermataModificaCliente(dati, nav, rotta.removePrefix("cliente-modifica/"), fornitore = false)
        rotta == "cliente-nuovo" -> SchermataModificaCliente(dati, nav, null, fornitore = false)
        rotta == "fornitore-nuovo" -> SchermataModificaCliente(dati, nav, null, fornitore = true)
    }
}

/**
 * Le voci vere del menu: le funzioni accese che il ruolo vede (progetti.md §5). La prima e' la casa.
 */
private fun vociVere(s: eu.stgm.wisper.rapportino.Sessione): List<Sezione> =
    Sezione.entries.filter { it.accesa(s.permessi, s.interfaccia.funzioniSpente) }

/** Le voci del menu: quelle vere, piu' Amministrazione per il titolare quando e' spenta (con la sola pagina Funzioni). */
private fun vociMenu(s: eu.stgm.wisper.rapportino.Sessione): List<Sezione> {
    val vere = vociVere(s)
    val titolare = s.utente.ruolo == eu.stgm.wisper.rapportino.Ruoli.TITOLARE
    return if (titolare && Sezione.AMMINISTRAZIONE !in vere) vere + Sezione.AMMINISTRAZIONE else vere
}

/** Tutte le funzioni spente (progetti.md §5): una pagina vuota e, per il titolare, il pulsante Funzioni. */
@Composable
private fun PaginaNessunaFunzione(titolare: Boolean, onFunzioni: () -> Unit) {
    val c = W.colori
    androidx.compose.foundation.layout.Column(
        Modifier.fillMaxSize().background(c.fondo).padding(eu.stgm.wisper.ui.MarginePagina),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(14.dp),
    ) {
        eu.stgm.wisper.ui.TestataMenu()
        eu.stgm.wisper.ui.TitoloPagina("Nessuna funzione accesa")
        androidx.compose.material3.Text(
            if (titolare) "Lo studio ha spento tutte le parti di Wisper. Riaccendi quelle che usate da Funzioni."
            else "Lo studio ha spento tutte le parti di Wisper. Chiedi al titolare di riaccenderle.",
            style = eu.stgm.wisper.ui.Testi.testo, color = c.testo2,
        )
        if (titolare) eu.stgm.wisper.ui.PulsantePrincipale("Funzioni", onFunzioni, icona = eu.stgm.wisper.ui.Icone.interruttore)
    }
}
