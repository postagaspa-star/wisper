package eu.stgm.wisper.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Archivio
import eu.stgm.wisper.BuildConfig
import eu.stgm.wisper.rapportino.Numeri
import java.time.format.DateTimeFormatter

/**
 * Le impostazioni (docs/aspetto.md §7): schede a gruppi, ogni voce col suo
 * valore; si cambia in un riquadro che si apre. Tariffe e clienti si cambiano
 * da Wisper Ufficio sul computer: qui si guardano.
 */
@Composable
fun SchermataImpostazioni(
    archivio: Archivio,
    tema: String,
    onTema: (String) -> Unit,
    onVisita: () -> Unit,
    onChiudi: () -> Unit,
) {
    val c = W.colori
    val ctx = LocalContext.current
    val config = archivio.configurazione
    val ana by archivio.anagrafiche.collectAsStateWithLifecycle()
    val aggiornamento by archivio.aggiornamento.collectAsStateWithLifecycle()
    var modifica by remember { mutableStateOf<String?>(null) }
    var licenza by remember { mutableStateOf(false) }

    BackHandler { onChiudi() }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.fillMaxWidth().height(48.dp), verticalAlignment = Alignment.CenterVertically) {
                PulsanteTondo(Icone.indietro, "Indietro", onChiudi)
            }
            Text("Impostazioni", style = Testi.titoloPagina, color = c.testo)

            Etichetta("Tu", Modifier.padding(top = 8.dp))
            Scheda(verticale = 2.dp, spazio = 0.dp) {
                Voce("Nome di chi compila", config.tecnico.ifBlank { ana.tecnico.ifBlank { "—" } }) { modifica = "tecnico" }
            }

            Etichetta("Il foglio", Modifier.padding(top = 8.dp))
            Scheda(verticale = 2.dp, spazio = 0.dp) {
                val collegato = aggiornamento.errore.isBlank() && aggiornamento.ultimo != null
                Row(Modifier.fillMaxWidth().heightIn(min = 60.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(if (collegato) c.firmatoTesto else c.rossoPieno))
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (collegato) "Collegato" else "Non collegato", style = Testi.forte, color = c.testo)
                        Text(
                            when {
                                aggiornamento.inCorso -> "Leggo il foglio…"
                                aggiornamento.errore.isNotBlank() -> aggiornamento.errore
                                aggiornamento.ultimo != null -> "Letto alle " + aggiornamento.ultimo!!.format(DateTimeFormatter.ofPattern("HH:mm"))
                                else -> ""
                            },
                            style = Testi.secondario, color = c.tenue, maxLines = 2,
                        )
                    }
                    PulsanteTesto(if (collegato) "Aggiorna" else "Riprova", { archivio.aggiorna() })
                }
                Linea()
                Voce("Indirizzo", config.url.ifBlank { "—" }) { modifica = "url" }
                Linea()
                Voce("Codice", if (config.codice.isBlank()) "—" else "••••••" + config.codice.takeLast(4)) { modifica = "codice" }
            }

            Etichetta("Tariffe", Modifier.padding(top = 8.dp))
            Scheda(spazio = 10.dp) {
                ana.gruppi.forEach { g ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(g.nome, style = Testi.forte, color = c.testo)
                            Text(
                                listOf(if (g.pagaViaggio) "viaggio pagato" else "viaggio non pagato", if (g.kmRimborsati) "km rimborsati" else "km non rimborsati")
                                    .joinToString(" · "),
                                style = Testi.secondario, color = c.tenue,
                            )
                        }
                        Text(g.tariffaFissa?.let { "${Numeri.scrivi(it)} €/h" } ?: "libera", style = Testi.forte, color = c.testo)
                    }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Rimborso km", style = Testi.forte, color = c.testo)
                        ana.impostazioni["AUTO"]?.takeIf { it.isNotBlank() }?.let { Text("Tabella ACI, $it", style = Testi.secondario, color = c.tenue) }
                    }
                    Text("${Numeri.scrivi(ana.euroKm)} €/km", style = Testi.forte, color = c.testo)
                }
            }

            Etichetta("App", Modifier.padding(top = 8.dp))
            Scheda(spazio = 10.dp) {
                Text("Tema", style = Testi.forte, color = c.testo)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("auto" to "Automatico", "chiaro" to "Chiaro", "scuro" to "Scuro").forEach { (k, nome) ->
                        Pillola(nome, tema == k, { onTema(k) }, Modifier.weight(if (k == "auto") 1.3f else 1f), altezza = 44.dp)
                    }
                }
            }
            Scheda(verticale = 2.dp, spazio = 0.dp) {
                Voce("Come funziona Wisper", "") { onVisita() }
                Linea()
                Voce("Licenze", "Carattere Figtree, SIL OFL 1.1") { licenza = true }
                Linea()
                Voce("Versione", BuildConfig.VERSION_NAME, freccia = false) {}
            }
        }
    }

    modifica?.let { campo ->
        var valore by remember(campo) {
            mutableStateOf(when (campo) { "tecnico" -> config.tecnico; "url" -> config.url; else -> "" })
        }
        AlertDialog(
            onDismissRequest = { modifica = null },
            title = { Text(when (campo) { "tecnico" -> "Nome di chi compila"; "url" -> "Indirizzo del foglio"; else -> "Codice" }, style = Testi.titoloSezione) },
            text = { CampoTesto(valore, { valore = it }, null, righe = if (campo == "url") 3 else 1, segnaposto = if (campo == "tecnico") ana.tecnico else "") },
            confirmButton = {
                TextButton(onClick = {
                    when (campo) {
                        "tecnico" -> config.tecnico = valore
                        "url" -> config.url = valore
                        "codice" -> if (valore.isNotBlank()) config.codice = valore
                    }
                    modifica = null
                    if (campo != "tecnico") archivio.aggiorna()
                }) { Text("Salva", color = c.testo, style = Testi.pulsanteSecondario) }
            },
            dismissButton = { TextButton(onClick = { modifica = null }) { Text("Annulla", color = c.testo2) } },
        )
    }
    if (licenza) {
        val testo = remember { runCatching { ctx.assets.open("licenze/figtree-OFL.txt").bufferedReader().use { it.readText() } }.getOrDefault("") }
        AlertDialog(
            onDismissRequest = { licenza = false },
            title = { Text("Figtree", style = Testi.titoloSezione) },
            text = { Text(testo, style = Testi.piccolo, modifier = Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) },
            confirmButton = { TextButton(onClick = { licenza = false }) { Text("Chiudi", color = c.testo) } },
        )
    }
}

@Composable
private fun Voce(titolo: String, valore: String, freccia: Boolean = true, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 60.dp).clickable(enabled = freccia, onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(titolo, style = Testi.forte, color = c.testo)
            if (valore.isNotBlank()) Text(valore, style = Testi.secondario, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (freccia) Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun Linea() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(W.colori.riga))
}

/** Il primo avvio: collegare l'app al foglio, con due campi grandi e un pulsante. */
@Composable
fun SchermataCollega(archivio: Archivio, onCollegato: () -> Unit) {
    val c = W.colori
    val config = archivio.configurazione
    val aggiornamento by archivio.aggiornamento.collectAsStateWithLifecycle()
    var url by remember { mutableStateOf(config.url) }
    var codice by remember { mutableStateOf(config.codice) }
    var provato by remember { mutableStateOf(false) }

    if (provato && !aggiornamento.inCorso && aggiornamento.errore.isBlank() && aggiornamento.ultimo != null) {
        androidx.compose.runtime.LaunchedEffect(Unit) { onCollegato() }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 64.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Simbolo(dimensione = 72.dp)
            Text("Collega Wisper al tuo foglio", style = Testi.titoloPagina, color = c.testo, textAlign = TextAlign.Center)
            CampoTesto(url, { url = it }, "Indirizzo", Modifier.fillMaxWidth(), segnaposto = "https://script.google.com/…", righe = 2)
            CampoTesto(codice, { codice = it }, "Codice", Modifier.fillMaxWidth())
            if (provato && aggiornamento.errore.isNotBlank()) {
                Text(aggiornamento.errore, style = Testi.secondario, color = c.rossoTesto, modifier = Modifier.fillMaxWidth())
            }
        }
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding().padding(20.dp)) {
            PulsantePrincipale(
                if (provato && aggiornamento.inCorso) "Collego…" else "Collega",
                {
                    config.url = url
                    config.codice = codice
                    provato = true
                    archivio.aggiorna()
                },
                abilitato = url.isNotBlank() && codice.isNotBlank(),
            )
        }
    }
}
