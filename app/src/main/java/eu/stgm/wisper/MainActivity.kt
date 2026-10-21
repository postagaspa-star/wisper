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
import eu.stgm.wisper.ui.SchermataListino
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
import eu.stgm.wisper.ui.SchermataDashboard
import eu.stgm.wisper.ui.SchermataFirma
import eu.stgm.wisper.ui.SchermataInvio
import eu.stgm.wisper.ui.SchermataModificaCliente
import eu.stgm.wisper.ui.SchermataModificaCommessa
import eu.stgm.wisper.ui.SchermataRapportini
import eu.stgm.wisper.ui.SchermataRapportino
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
        leggiPromemoria(intent)
        setContent { Wisper(archivio, this) }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        leggiPromemoria(intent)
    }

    /** Toccando la notifica di un promemoria si apre quell'attività. */
    private fun leggiPromemoria(intent: android.content.Intent?) {
        intent?.getStringExtra(Promemoria.EXTRA_ATTIVITA)?.takeIf { it.isNotBlank() }?.let { attivitaDaAprire.value = it }
    }

    companion object {
        /** L'attività da aprire arrivando da un promemoria: la legge la schermata e la vuota. */
        val attivitaDaAprire = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)
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
 *  - "rapportino"    il rapportino aperto (stato in [modulo], su disco in [BozzaModulo])
 *  - "firma:<id>"    la firma del cliente
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

        fun aCasa() {
            sezioneNome = Sezione.DASHBOARD.name
            mettiPila(Sezione.DASHBOARD, emptyList())
            pagina = "sezioni"
        }

        visita.vaiA = { p -> if (p == "dashboard") { modulo = null; scope.launch { cassetto.close() }; aCasa() } else pagina = p }
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
        LaunchedEffect(permessi) {
            if (permessi.livelli.isNotEmpty() && !permessi.vede(sezione.modulo)) aCasa()
        }

        fun nuovo(giorno: LocalDate, idCliente: String? = null, idCommessa: String? = null) {
            val anag = dati.anagrafiche.value
            val com = idCommessa?.let { id -> anag.commesse.firstOrNull { it.id == id } }
            val cli = (idCliente ?: com?.idCliente)?.let { id -> anag.clienti.firstOrNull { it.id == id } }
            var r = Rapportino.nuovo(dati.tecnico, giorno)
            if (cli != null) r = r.copy(idCliente = cli.id, cliente = cli.nome)
            if (com != null) r = r.copy(idCommessa = com.id, commessa = com.descrizione)
            modulo = ModuloStato(r, nuovo = true)
            pagina = "rapportino"
        }

        fun apri(idLocale: String) {
            (dati.viste.value.firstOrNull { it.rapportino.idLocale == idLocale } ?: dati.storico.value.firstOrNull { it.rapportino.idLocale == idLocale })?.let { v ->
                modulo = ModuloStato(v.rapportino, nuovo = false)
                pagina = "rapportino"
            }
        }

        val nav = Navigatore(
            onVai = { rotta -> avanti = true; mettiPila(sezione, pila(sezione) + rotta) },
            onIndietro = { avanti = false; mettiPila(sezione, pila(sezione).dropLast(1)) },
            onSezione = { s, f ->
                avanti = true
                if (f != null) filtro = f
                mettiPila(s, emptyList())
                sezioneNome = s.name
                pagina = "sezioni"
            },
            onApriRapportino = ::apri,
            onNuovoRapportino = { g, cli, com -> nuovo(g, cli, com) },
            onFirmaPreventivo = { id -> pagina = "firma-preventivo:$id" },
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

        // Indietro: prima la pila della voce, poi si torna alla Dashboard; dalla Dashboard esce dall'app.
        BackHandler(enabled = pagina == "sezioni" && (pila(sezione).isNotEmpty() || sezione != Sezione.DASHBOARD)) {
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
                            val voci = Sezione.entries.filter { permessi.vede(it.modulo) }
                            ModalNavigationDrawer(
                                drawerState = cassetto,
                                // Si apre dal pulsante Menu e dal bordo; aperto, si chiude anche scorrendo a sinistra.
                                gesturesEnabled = cassetto.isOpen,
                                scrimColor = W.colori.veloMenu,
                                drawerContent = {
                                    ModalDrawerSheet(
                                        modifier = Modifier.width(312.dp),
                                        drawerShape = RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp),
                                        drawerContainerColor = W.colori.scheda,
                                    ) {
                                        CassettoMenu(
                                            utente = sessione.utente,
                                            voci = voci,
                                            attiva = sezioneDiRotta(cima, sezione),
                                            numeroFatturazione = if (permessi.costi) daFatturare else 0,
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
                                        )
                                        CompositionLocalProvider(LocalGuscio provides guscio) {
                                            Box(
                                                Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()
                                                    .let { if (rottaCompito(rotta)) it.imePadding() else it },
                                            ) {
                                                PaginaSezione(
                                                    s, rotta, dati, archivio, nav, filtro, { filtro = it }, tema,
                                                    onTema = { tema = it; config.tema = it },
                                                    onVisita = { visita.inizia() },
                                                    onNuovo = { g -> nuovo(g) },
                                                    onComeIeri = { r ->
                                                        modulo = ModuloStato(Riepiloghi.comeIeri(r), nuovo = true, tariffaToccata = true, passoIniziale = 4)
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

                        p == "rapportino" -> modulo?.let { m ->
                            SchermataRapportino(
                                dati = dati,
                                stato = m,
                                bozza = bozza,
                                onFirma = { idLocale -> pagina = "firma:$idLocale" },
                                onChiudi = { modulo = null; pagina = "sezioni" },
                                // "Invia al cliente": si chiude il rapportino e si prepara l'invio nella voce aperta.
                                onInvia = { idLocale -> modulo = null; pagina = "sezioni"; nav.vai("invio/rapportino/$idLocale") },
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

                        p.startsWith("firma:") -> {
                            val idLocale = p.removePrefix("firma:")
                            val r = (dati.viste.value.firstOrNull { it.rapportino.idLocale == idLocale } ?: dati.storico.value.firstOrNull { it.rapportino.idLocale == idLocale })?.rapportino
                            SchermataFirma(
                                rapportino = r,
                                onConferma = { disegno, nome ->
                                    scope.launch { dati.firma(idLocale, disegno, nome) }
                                    modulo = null
                                    pagina = "sezioni"
                                },
                                onAnnulla = {
                                    // Si torna al rapportino, già salvato.
                                    modulo = r?.let { ModuloStato(it, nuovo = false) }
                                    pagina = if (modulo != null) "rapportino" else "sezioni"
                                },
                            )
                        }
                    }
                }
                foglioTu?.let { modoTu ->
                    FoglioTu(
                        dati = dati,
                        onChiudi = { foglioTu = null },
                        onApp = { foglioTu = null; nav.vai("amm/app") },
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
    onTema: (String) -> Unit,
    onVisita: () -> Unit,
    onNuovo: (LocalDate) -> Unit,
    onComeIeri: (Rapportino) -> Unit,
) {
    val permessi = LocalPermessi.current
    // Una pagina del modulo che il ruolo non vede: la scheda calma "Non hai il permesso".
    // L'app (tema, visita, versione) è di tutti.
    val modulo = sezioneDiRotta(rotta, sezione).modulo
    if (rotta != "amm/app" && permessi.livelli.isNotEmpty() && !permessi.vede(modulo)) {
        NonPermesso(if (rotta != null) ({ nav.indietro() }) else null)
        return
    }
    when {
        rotta == null -> when (sezione) {
            Sezione.DASHBOARD -> SchermataDashboard(dati, nav, onNuovo, onComeIeri)
            Sezione.CLIENTI -> SchermataClienti(dati, nav)
            Sezione.COMMESSE -> SchermataCommesse(dati, nav)
            Sezione.PREVENTIVI -> SchermataPreventivi(dati, nav)
            Sezione.ATTIVITA -> SchermataAttivita(dati, nav)
            Sezione.RAPPORTINI -> SchermataRapportini(dati, nav, filtro, onFiltro)
            Sezione.FATTURAZIONE -> SchermataUfficio(dati, nav)
            Sezione.AMMINISTRAZIONE -> SchermataAmministrazione(dati, archivio, nav)
        }
        rotta.startsWith("amm/") -> PaginaAmministrazione(rotta.removePrefix("amm/"), dati, archivio, nav, tema, onTema, onVisita)
        rotta == "impostazioni" -> PaginaAmministrazione("app", dati, archivio, nav, tema, onTema, onVisita)
        rotta.startsWith("invio/preventivo/") -> SchermataInvioPreventivo(dati, nav, rotta.removePrefix("invio/preventivo/"))
        rotta.startsWith("invio/") -> SchermataInvio(dati, nav, rotta.removePrefix("invio/"))
        rotta == "preventivi" -> SchermataPreventivi(dati, nav)
        rotta.startsWith("preventivo/") -> SchermataPreventivo(dati, nav, rotta.removePrefix("preventivo/"))
        rotta.startsWith("preventivo-nuovo") || rotta.startsWith("preventivo-modifica/") -> SchermataEditorPreventivo(dati, nav, rotta)
        rotta == "listino" -> SchermataListino(dati, nav)
        rotta == "contratti" -> SchermataContratti(dati, nav)
        rotta == "attivita" -> SchermataAttivita(dati, nav)
        rotta.startsWith("attivita/") -> SchermataDettaglioAttivita(dati, nav, rotta.removePrefix("attivita/"))
        rotta.startsWith("attivita-nuova") || rotta.startsWith("attivita-modifica/") -> SchermataModificaAttivita(dati, nav, rotta)
        rotta.startsWith("calendario") -> SchermataCalendario(dati, nav, rotta.removePrefix("calendario").removePrefix("/"))
        rotta == "commesse" -> SchermataCommesse(dati, nav)
        rotta.startsWith("commessa/") -> SchermataCommessa(dati, nav, rotta.removePrefix("commessa/"))
        rotta.startsWith("commessa-modifica/") -> SchermataModificaCommessa(dati, nav, rotta.removePrefix("commessa-modifica/"), null)
        rotta.startsWith("commessa-nuova") -> SchermataModificaCommessa(dati, nav, null, rotta.removePrefix("commessa-nuova").removePrefix("/").ifBlank { null })
        rotta == "clienti" -> SchermataClienti(dati, nav)
        rotta == "soggetti-archiviati" -> SchermataSoggettiArchiviati(dati, nav)
        rotta.startsWith("cliente/") -> SchermataCliente(dati, nav, rotta.removePrefix("cliente/"))
        rotta.startsWith("cliente-modifica/") -> SchermataModificaCliente(dati, nav, rotta.removePrefix("cliente-modifica/"), fornitore = false)
        rotta == "cliente-nuovo" -> SchermataModificaCliente(dati, nav, null, fornitore = false)
        rotta == "fornitore-nuovo" -> SchermataModificaCliente(dati, nav, null, fornitore = true)
    }
}
