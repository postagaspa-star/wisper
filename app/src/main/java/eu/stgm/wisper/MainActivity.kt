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
import androidx.compose.animation.AnimatedContent
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
import eu.stgm.wisper.ui.SchermataMese
import eu.stgm.wisper.ui.SchermataOggi
import eu.stgm.wisper.ui.SchermataRapportino
import eu.stgm.wisper.ui.StratoVisita
import eu.stgm.wisper.ui.TemaWisper
import eu.stgm.wisper.ui.Visita
import eu.stgm.wisper.ui.W
import kotlinx.coroutines.launch
import java.time.LocalDate

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
 * Le schermate (docs/aspetto.md §2). Niente libreria di navigazione: poche
 * pagine, una stringa che sopravvive alla rotazione.
 *
 *  - "collega"       primo avvio, senza indirizzo o codice del foglio
 *  - "oggi"          la casa
 *  - "mese"          i rapportini del mese, per chi paga
 *  - "rapportino"    il rapportino aperto (stato in [modulo], su disco in [BozzaModulo])
 *  - "firma:<id>"    la firma del cliente
 *  - "impostazioni"
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
                    else -> "oggi"
                }
            )
        }
        if (pagina == "rapportino" && modulo == null) pagina = "oggi"

        visita.vaiA = { p -> if (p == "oggi") modulo = null; pagina = p }
        visita.allaFine = {
            modulo = null
            pagina = "oggi"
            config.visitaVista = VISITA_ATTUALE
        }
        LaunchedEffect(Unit) {
            if (archivio.configurato && config.visitaVista < VISITA_ATTUALE && modulo == null) visita.inizia()
        }

        fun nuovo(giorno: LocalDate) {
            modulo = ModuloStato(Rapportino.nuovo(dati.tecnico, giorno), nuovo = true)
            pagina = "rapportino"
        }

        fun apri(idLocale: String) {
            dati.viste.value.firstOrNull { it.rapportino.idLocale == idLocale }?.let { v ->
                modulo = ModuloStato(v.rapportino, nuovo = false)
                pagina = "rapportino"
            }
        }

        CompositionLocalProvider(LocalVisita provides visita) {
            Box(Modifier.fillMaxSize()) {
                AnimatedContent(
                    targetState = pagina,
                    transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(160)) },
                    label = "pagine",
                ) { p ->
                    when {
                        p == "collega" -> SchermataCollega(archivio) {
                            pagina = "oggi"
                            if (config.visitaVista < VISITA_ATTUALE) visita.inizia()
                        }

                        p == "oggi" -> SchermataOggi(
                            dati = dati,
                            onNuovo = ::nuovo,
                            onComeIeri = { r ->
                                modulo = ModuloStato(Riepiloghi.comeIeri(r), nuovo = true, tariffaToccata = true, passoIniziale = 4)
                                pagina = "rapportino"
                            },
                            onApri = ::apri,
                            onMese = { pagina = "mese" },
                            onImpostazioni = { pagina = "impostazioni" },
                        )

                        p == "mese" -> SchermataMese(
                            dati = dati,
                            onApri = ::apri,
                            onNuovo = { nuovo(LocalDate.now()) },
                            onIndietro = { pagina = "oggi" },
                        )

                        p == "rapportino" -> modulo?.let { m ->
                            SchermataRapportino(
                                dati = dati,
                                stato = m,
                                bozza = bozza,
                                onFirma = { idLocale -> pagina = "firma:$idLocale" },
                                onChiudi = { modulo = null; pagina = "oggi" },
                            )
                        }

                        p.startsWith("firma:") -> {
                            val idLocale = p.removePrefix("firma:")
                            val r = dati.viste.value.firstOrNull { it.rapportino.idLocale == idLocale }?.rapportino
                            SchermataFirma(
                                rapportino = r,
                                onConferma = { disegno, nome ->
                                    scope.launch { dati.firma(idLocale, disegno, nome) }
                                    modulo = null
                                    pagina = "oggi"
                                },
                                onAnnulla = {
                                    // Si torna al rapportino, già salvato.
                                    modulo = r?.let { ModuloStato(it, nuovo = false) }
                                    pagina = if (modulo != null) "rapportino" else "oggi"
                                },
                            )
                        }

                        p == "impostazioni" -> SchermataImpostazioni(
                            archivio = archivio,
                            tema = tema,
                            onTema = { tema = it; config.tema = it },
                            onVisita = { visita.inizia() },
                            onChiudi = { pagina = "oggi" },
                        )
                    }
                }
                StratoVisita(visita)
            }
        }
    }
}
