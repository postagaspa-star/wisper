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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.ui.BozzaModulo
import eu.stgm.wisper.ui.ModuloStato
import eu.stgm.wisper.ui.SchermataElenco
import eu.stgm.wisper.ui.SchermataFirma
import eu.stgm.wisper.ui.SchermataImpostazioni
import eu.stgm.wisper.ui.SchermataModulo
import eu.stgm.wisper.ui.TemaWisper
import eu.stgm.wisper.ui.dataLunga
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val chiediNotifiche =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Icone chiare sulla barra di stato: lo sfondo dell'app e' sempre nero,
        // e con quelle scure ora e batteria non si vedevano.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )

        // L'unico permesso: l'avviso "rapportini non ancora sul foglio" quando
        // l'app e' chiusa. Senza, si vede lo stesso dentro l'app.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            chiediNotifiche.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        val archivio = (application as WisperApp).archivio
        setContent { TemaWisper { Wisper(archivio) } }
    }

    override fun onResume() {
        super.onResume()
        // Ogni volta che si torna nell'app si rilegge il foglio: magari dal
        // computer e' cambiato qualcosa (un cliente nuovo, un rapportino segnato
        // come inviato).
        (application as WisperApp).archivio.aggiorna()
    }
}

/**
 * Le quattro schermate. Niente libreria di navigazione: sono poche, e la
 * pagina corrente e' una stringa che sopravvive alla rotazione.
 *
 *  - "elenco"
 *  - "modulo"         il modulo aperto (il suo stato e' in [modulo], e su disco in [BozzaModulo])
 *  - "firma:<id>"     la firma del cliente per il rapportino <id>
 *  - "impostazioni"
 */
@Composable
private fun Wisper(archivio: Archivio) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val bozza = remember { BozzaModulo(ctx.filesDir) }
    val scope = rememberCoroutineScope()

    // Se Android ha chiuso l'app a meta' rapportino (la fotocamera, una
    // telefonata), si riparte da li'.
    var modulo by remember { mutableStateOf(bozza.leggi()) }
    var pagina by rememberSaveable { mutableStateOf(if (modulo != null) "modulo" else "elenco") }
    if (pagina == "modulo" && modulo == null) pagina = "elenco"

    val viste by archivio.viste.collectAsStateWithLifecycle()

    when {
        pagina == "elenco" -> SchermataElenco(
            archivio = archivio,
            onApri = { idLocale ->
                viste.firstOrNull { it.rapportino.idLocale == idLocale }?.let { v ->
                    modulo = ModuloStato(v.rapportino, nuovo = false)
                    pagina = "modulo"
                }
            },
            onNuovo = {
                modulo = ModuloStato(Rapportino.nuovo(archivio.tecnico), nuovo = true)
                pagina = "modulo"
            },
            onImpostazioni = { pagina = "impostazioni" },
        )

        pagina == "modulo" -> modulo?.let { m ->
            SchermataModulo(
                archivio = archivio,
                stato = m,
                bozza = bozza,
                onFirma = { idLocale -> pagina = "firma:$idLocale" },
                onChiudi = { modulo = null; pagina = "elenco" },
            )
        }

        pagina.startsWith("firma:") -> {
            val idLocale = pagina.removePrefix("firma:")
            val r = viste.firstOrNull { it.rapportino.idLocale == idLocale }?.rapportino
            SchermataFirma(
                titolo = listOfNotNull(r?.cliente?.takeIf { it.isNotBlank() }, r?.data?.let(::dataLunga)).joinToString(" · "),
                onConferma = { disegno, nome ->
                    scope.launch { archivio.firma(idLocale, disegno, nome) }
                    modulo = null
                    pagina = "elenco"
                },
                onAnnulla = {
                    // Si torna al rapportino, gia' salvato.
                    modulo = r?.let { ModuloStato(it, nuovo = false) }
                    pagina = if (modulo != null) "modulo" else "elenco"
                },
            )
        }

        pagina == "impostazioni" -> SchermataImpostazioni(archivio, onChiudi = { pagina = "elenco" })
    }

    LaunchedEffect(Unit) {
        if (!archivio.configurato) pagina = if (pagina == "elenco") "impostazioni" else pagina
    }
}
