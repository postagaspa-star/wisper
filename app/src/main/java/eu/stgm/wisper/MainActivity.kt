package eu.stgm.wisper

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.rapportino.Stato
import eu.stgm.wisper.ui.Avvisi
import eu.stgm.wisper.ui.BarraSezioni
import eu.stgm.wisper.ui.FiltroRapportini
import eu.stgm.wisper.ui.LocalAvvisi
import eu.stgm.wisper.ui.Navigatore
import eu.stgm.wisper.ui.Sezione
import eu.stgm.wisper.ui.StratoAvvisi
import eu.stgm.wisper.ui.rottaCompito
import eu.stgm.wisper.ui.SchermataUfficio
import eu.stgm.wisper.ui.SchermataInvio
import eu.stgm.wisper.ui.SchermataRapportini
import eu.stgm.wisper.ui.SchermataCommesse
import eu.stgm.wisper.ui.SchermataCommessa
import eu.stgm.wisper.ui.SchermataModificaCommessa
import eu.stgm.wisper.ui.SchermataClienti
import eu.stgm.wisper.ui.SchermataCliente
import eu.stgm.wisper.ui.SchermataModificaCliente
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.ui.BozzaModulo
import eu.stgm.wisper.ui.LocalVisita
import eu.stgm.wisper.ui.ModuloStato
import eu.stgm.wisper.ui.SchermataCollega
import eu.stgm.wisper.ui.SchermataFirma
import eu.stgm.wisper.ui.SchermataImpostazioni
import eu.stgm.wisper.ui.SchermataOggi
import eu.stgm.wisper.ui.SchermataRapportino
import eu.stgm.wisper.ui.StratoVisita
import eu.stgm.wisper.ui.TemaWisper
import eu.stgm.wisper.ui.Visita
import eu.stgm.wisper.ui.W
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

/** La versione della visita guidata: chi ha visto una visita più vecchia la rivede una volta. */
private const val VISITA_ATTUALE = 2

class MainActivity : ComponentActivity() {

    private val chiediNotifiche =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // L'unico permesso: l'avviso "rapportini non ancora sul foglio" quando
        // l'app e' chiusa. Senza, si vede lo stesso dentro l'app.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            chiediNotifiche.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        val archivio = (application as WisperApp).archivio
        setContent { Wisper(archivio, this) }
    }

    override fun onResume() {
        super.onResume()
        // Ogni volta che si torna nell'app si rilegge il foglio: magari dal
        // computer e' cambiato qualcosa.
        (application as WisperApp).archivio.aggiorna()
    }
}

/**
 * Le schermate (docs/aspetto.md §2, docs/telefono-ufficio.md). Niente libreria di
 * navigazione: una stringa per le pagine a tutto schermo e una pila di rotte per
 * ognuna delle tre sezioni, tutto salvato per la rotazione.
 *
 *  - "collega"       primo avvio, senza indirizzo o codice del foglio
 *  - "sezioni"       Oggi · Rapportini · Ufficio con la barra in basso, ognuna con la sua pila
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
        val esempio = remember(visita.attiva) { if (visita.attiva) DatiEsempio() else null }
        val dati: Dati = esempio ?: archivio

        // Se Android ha chiuso l'app a metà rapportino (la fotocamera, una
        // telefonata), si riparte da lì.
        var modulo by remember { mutableStateOf(bozza.leggi()) }
        var pagina by rememberSaveable {
            mutableStateOf(
                when {
                    !archivio.configurato -> "collega"
                    modulo != null -> "rapportino"
                    else -> "sezioni"
                }
            )
        }
        if (pagina == "rapportino" && modulo == null) pagina = "sezioni"

        // Le tre sezioni, ognuna con la sua pila di rotte (una riga per rotta, per salvarle).
        var sezioneNome by rememberSaveable { mutableStateOf(Sezione.OGGI.name) }
        val sezione = Sezione.valueOf(sezioneNome)
        var pileTesto by rememberSaveable { mutableStateOf(List(Sezione.entries.size) { "" }) }
        fun pila(s: Sezione): List<String> = pileTesto[s.ordinal].split('\n').filter { it.isNotEmpty() }
        fun mettiPila(s: Sezione, rotte: List<String>) {
            pileTesto = pileTesto.toMutableList().also { it[s.ordinal] = rotte.joinToString("\n") }
        }
        var filtro by remember { mutableStateOf(FiltroRapportini()) }
        var avanti by remember { mutableStateOf(true) }
        val avvisi = remember { Avvisi() }

        fun aOggi() {
            sezioneNome = Sezione.OGGI.name
            mettiPila(Sezione.OGGI, emptyList())
            pagina = "sezioni"
        }

        visita.vaiA = { p -> if (p == "oggi") { modulo = null; aOggi() } else pagina = p }
        visita.allaFine = {
            modulo = null
            aOggi()
            config.visitaVista = VISITA_ATTUALE
        }
        LaunchedEffect(Unit) {
            if (archivio.configurato && config.visitaVista < VISITA_ATTUALE && modulo == null) visita.inizia()
        }

        fun nuovo(giorno: LocalDate, idCliente: String? = null, idCommessa: String? = null) {
            val ana = dati.anagrafiche.value
            val com = idCommessa?.let { id -> ana.commesse.firstOrNull { it.id == id } }
            val cli = (idCliente ?: com?.idCliente)?.let { id -> ana.clienti.firstOrNull { it.id == id } }
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
        )

        // Indietro: prima la pila della sezione, poi si torna a Oggi; da Oggi esce dall'app.
        BackHandler(enabled = pagina == "sezioni" && (pila(sezione).isNotEmpty() || sezione != Sezione.OGGI)) {
            if (pila(sezione).isNotEmpty()) nav.indietro() else aOggi()
        }

        val viste by dati.viste.collectAsStateWithLifecycle()
        val daFatturare = remember(viste) {
            val mese = YearMonth.now()
            viste.map { it.rapportino }
                .filter { YearMonth.from(it.data) == mese && (it.stato == Stato.FIRMATO || it.stato == Stato.INVIATO) }
                .map { it.idCliente.ifBlank { it.cliente } }.distinct().size
        }

        CompositionLocalProvider(LocalVisita provides visita, LocalAvvisi provides avvisi) {
            Box(Modifier.fillMaxSize()) {
                AnimatedContent(
                    targetState = pagina,
                    transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(160)) },
                    label = "pagine",
                ) { p ->
                    when {
                        p == "collega" -> SchermataCollega(archivio) {
                            aOggi()
                            if (config.visitaVista < VISITA_ATTUALE) visita.inizia()
                        }

                        p == "sezioni" -> {
                            val cima = pila(sezione).lastOrNull()
                            Column(Modifier.fillMaxSize().background(W.colori.fondo)) {
                                Box(Modifier.weight(1f).fillMaxWidth()) {
                                    AnimatedContent(
                                        targetState = sezione to cima,
                                        transitionSpec = {
                                            if (initialState.first != targetState.first) fadeIn(tween(200)) togetherWith fadeOut(tween(120))
                                            else if (avanti) (slideInHorizontally(tween(260)) { it / 12 } + fadeIn(tween(260))) togetherWith fadeOut(tween(120))
                                            else (slideInHorizontally(tween(260)) { -it / 12 } + fadeIn(tween(260))) togetherWith fadeOut(tween(120))
                                        },
                                        label = "sezione",
                                    ) { (s, rotta) ->
                                        Box(Modifier.fillMaxSize().statusBarsPadding().let { if (rottaCompito(rotta)) it.navigationBarsPadding().imePadding() else it }) {
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
                                    StratoAvvisi(avvisi, Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp))
                                }
                                if (!rottaCompito(cima)) {
                                    BarraSezioni(sezione, daFatturare, onSezione = { s ->
                                        if (s == sezione) { avanti = false; mettiPila(s, emptyList()) }
                                        else { nav.sezione(s) }
                                    })
                                }
                            }
                        }

                        p == "rapportino" -> modulo?.let { m ->
                            SchermataRapportino(
                                dati = dati,
                                stato = m,
                                bozza = bozza,
                                onFirma = { idLocale -> pagina = "firma:$idLocale" },
                                onChiudi = { modulo = null; pagina = "sezioni" },
                                // "Invia al cliente": si chiude il rapportino e si prepara l'invio nella sezione aperta.
                                onInvia = { idLocale -> modulo = null; pagina = "sezioni"; nav.vai("invio/rapportino/$idLocale") },
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
                StratoVisita(visita)
            }
        }
    }
}

/** Quale schermata mostrare in una sezione: la sua prima pagina, o la rotta in cima alla pila. */
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
    when {
        rotta == null -> when (sezione) {
            Sezione.OGGI -> SchermataOggi(
                dati = dati,
                onNuovo = onNuovo,
                onComeIeri = onComeIeri,
                onApri = { nav.apriRapportino(it) },
                onMese = { nav.sezione(Sezione.RAPPORTINI, FiltroRapportini()) },
                onImpostazioni = { nav.vai("impostazioni") },
                onFineMese = { nav.sezione(Sezione.UFFICIO) },
                onDaFirmare = { nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, quali = eu.stgm.wisper.ui.Quali.FIRMARE)) },
            )
            Sezione.RAPPORTINI -> SchermataRapportini(dati, nav, filtro, onFiltro)
            Sezione.UFFICIO -> SchermataUfficio(dati, nav)
        }
        rotta == "impostazioni" -> SchermataImpostazioni(
            archivio = archivio,
            tema = tema,
            onTema = onTema,
            onVisita = onVisita,
            onChiudi = { nav.indietro() },
        )
        rotta.startsWith("invio/") -> SchermataInvio(dati, nav, rotta.removePrefix("invio/"))
        rotta == "commesse" -> SchermataCommesse(dati, nav)
        rotta.startsWith("commessa/") -> SchermataCommessa(dati, nav, rotta.removePrefix("commessa/"))
        rotta.startsWith("commessa-modifica/") -> SchermataModificaCommessa(dati, nav, rotta.removePrefix("commessa-modifica/"), null)
        rotta.startsWith("commessa-nuova") -> SchermataModificaCommessa(dati, nav, null, rotta.removePrefix("commessa-nuova").removePrefix("/").ifBlank { null })
        rotta == "clienti" -> SchermataClienti(dati, nav)
        rotta.startsWith("cliente/") -> SchermataCliente(dati, nav, rotta.removePrefix("cliente/"))
        rotta.startsWith("cliente-modifica/") -> SchermataModificaCliente(dati, nav, rotta.removePrefix("cliente-modifica/"))
        rotta == "cliente-nuovo" -> SchermataModificaCliente(dati, nav, null)
    }
}
