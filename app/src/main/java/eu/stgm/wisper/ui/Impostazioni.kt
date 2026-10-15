package eu.stgm.wisper.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Archivio
import eu.stgm.wisper.BuildConfig
import eu.stgm.wisper.rapportino.Numeri
import java.time.format.DateTimeFormatter

/**
 * Chi compila, dove sta il foglio, e quello che il foglio dice sulle tariffe.
 * Tariffe e clienti si cambiano dal programma del computer: qui si guardano.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SchermataImpostazioni(archivio: Archivio, onChiudi: () -> Unit) {
    val config = archivio.configurazione
    val ana by archivio.anagrafiche.collectAsStateWithLifecycle()
    val aggiornamento by archivio.aggiornamento.collectAsStateWithLifecycle()
    val operazioni by archivio.operazioni.collectAsStateWithLifecycle()

    var tecnico by remember { mutableStateOf(config.tecnico) }
    var url by remember { mutableStateOf(config.url) }
    var codice by remember { mutableStateOf(config.codice) }

    BackHandler { onChiudi() }

    Scaffold(
        containerColor = Nero,
        topBar = {
            TopAppBar(
                navigationIcon = { IconButton(onClick = onChiudi) { Icon(Icons.Default.ArrowBack, "Indietro") } },
                title = { Text("Impostazioni", style = MaterialTheme.typography.titleMedium) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Nero),
            )
        },
    ) { margini ->
        Column(
            Modifier.fillMaxSize().padding(margini).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        ) {
            Sezione("Chi compila su questo telefono")
            Scheda {
                CampoTesto(
                    tecnico, { tecnico = it }, "Nome e cognome",
                    aiuto = if (tecnico.isBlank() && ana.tecnico.isNotBlank()) "Vuoto: uso «${ana.tecnico}», dal foglio" else null,
                )
            }

            Sezione("Il foglio")
            Scheda {
                CampoTesto(url, { url = it }, "Indirizzo dello script", righe = 2)
                CampoTesto(codice, { codice = it }, "Codice", aiuto = "Lo scrive preparaFoglio() nel registro dello script")
                Button(
                    onClick = {
                        config.tecnico = tecnico
                        config.url = url
                        config.codice = codice
                        archivio.aggiorna()
                    },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Giallo, contentColor = Nero),
                    shape = RoundedCornerShape(12.dp),
                ) { Text("Salva e prova il collegamento") }
                Text(
                    when {
                        aggiornamento.inCorso -> "Leggo il foglio…"
                        aggiornamento.errore.isNotBlank() -> aggiornamento.errore
                        aggiornamento.ultimo != null ->
                            "Collegato. Ultima lettura: " + aggiornamento.ultimo!!.format(DateTimeFormatter.ofPattern("dd/MM HH:mm"))
                        else -> ""
                    },
                    color = if (aggiornamento.errore.isNotBlank()) Rosso else Smorzato,
                    fontSize = 14.sp,
                )
                val inAttesa = operazioni.size
                if (inAttesa > 0) Text("$inAttesa modifiche ancora sul telefono", color = Giallo, fontSize = 14.sp)
            }

            Sezione("Tariffe (dal foglio)")
            Scheda {
                if (ana.gruppi.isEmpty()) {
                    Text("Ancora niente: si leggono dal foglio al primo collegamento.", color = Smorzato)
                }
                ana.gruppi.forEach { g ->
                    RigaConto(
                        g.nome,
                        g.tariffaFissa?.let { "${Numeri.scrivi(it)} €/h" } ?: "libera",
                        sotto = listOfNotNull(
                            if (g.pagaViaggio) "viaggio pagato" else "viaggio non pagato",
                            if (g.kmRimborsati) "km rimborsati" else "km non rimborsati",
                            g.maggExtra.takeIf { it > 0 }?.let { "extra +${Numeri.scrivi(it)}%" },
                        ).joinToString(" · "),
                    )
                }
                RigaConto(
                    "Rimborso km",
                    "${Numeri.scrivi(ana.euroKm)} €/km",
                    sotto = ana.impostazioni["AUTO"]?.takeIf { it.isNotBlank() }?.let { "Tabella ACI, $it" },
                )
                Text("Si cambiano dal programma Wisper Ufficio sul computer.", color = Smorzato, fontSize = 13.sp)
            }

            Spacer(Modifier.height(24.dp))
            Text("Wisper ${BuildConfig.VERSION_NAME}", color = Smorzato, fontSize = 12.sp)
            Spacer(Modifier.height(24.dp))
        }
    }
}
