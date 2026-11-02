package eu.stgm.wisper.ui

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

/**
 * La fotocamera di sistema per le foto di sempre (scontrini, ticket, guasti,
 * documenti, il foglio firmato): si usa come il lanciatore di TakePicture,
 * `fotocamera.launch(uri)`, e l'esito arriva vero o falso come prima.
 *
 * Perché non basta più TakePicture: da quando il manifest dichiara il permesso
 * CAMERA (Collega un computer, docs/gestionale/collega-qr.md §7) Android fa partire
 * la fotocamera di sistema solo se il permesso è dato, altrimenti l'avvio lancia
 * SecurityException e l'app si chiude. Qui, se manca, prima si chiede il permesso
 * e poi si scatta; se lo si nega la foto non parte, lo si dice con un avviso e
 * l'esito è falso, come uno scatto annullato (il file vuoto si cancella come prima).
 */
class FotoSistema internal constructor(private val avvia: (Uri) -> Unit) {
    fun launch(uri: Uri) = avvia(uri)
}

/** Il lanciatore della fotocamera di sistema col permesso chiesto quando serve. [onEsito] come quello di TakePicture. */
@Composable
fun rememberFotoSistema(onEsito: (Boolean) -> Unit): FotoSistema {
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val esito by rememberUpdatedState(onEsito)
    // Il file dello scatto mentre Android chiede il permesso (resta anche se l'app viene chiusa nel frattempo).
    var inAttesa by rememberSaveable { mutableStateOf<String?>(null) }
    val scatta = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> esito(ok) }

    fun avviaSicuro(uri: Uri) {
        try {
            scatta.launch(uri)
        } catch (_: SecurityException) {
            avvisi.mostra(SENZA_FOTOCAMERA)
            esito(false)
        } catch (_: ActivityNotFoundException) {
            avvisi.mostra("Su questo telefono non trovo un'app per le foto")
            esito(false)
        }
    }

    val permesso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { dato ->
        val uri = inAttesa?.let(Uri::parse)
        inAttesa = null
        if (uri == null) return@rememberLauncherForActivityResult
        if (dato) avviaSicuro(uri) else {
            avvisi.mostra(SENZA_FOTOCAMERA)
            esito(false)
        }
    }
    return remember {
        FotoSistema { uri ->
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                avviaSicuro(uri)
            } else {
                inAttesa = uri.toString()
                permesso.launch(Manifest.permission.CAMERA)
            }
        }
    }
}

private const val SENZA_FOTOCAMERA = "Per la foto serve la fotocamera: puoi darle il permesso nelle impostazioni di Android"
