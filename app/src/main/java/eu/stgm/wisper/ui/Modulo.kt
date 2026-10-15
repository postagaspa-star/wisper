package eu.stgm.wisper.ui

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Archivio
import eu.stgm.wisper.Vista
import eu.stgm.wisper.rapportino.Calcolo
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Stato
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Il rapportino, nuovo o da correggere, in una schermata sola.
 *
 * Una schermata e non due: in Pleya si crea il rapportino e poi bisogna
 * riaprirlo per scrivere ore e foto, e la prima cosa che ha detto chi lo deve
 * usare e' stata "questo mi sembra un passaggio in piu'". Qui c'e' tutto, dalla
 * data alla firma, e "Salva" resta sempre in fondo allo schermo.
 */
@OptIn(ExperimentalMaterial3Api::class, kotlinx.coroutines.FlowPreview::class)
@Composable
fun SchermataModulo(
    archivio: Archivio,
    stato: ModuloStato,
    bozza: BozzaModulo,
    onFirma: (String) -> Unit,
    onChiudi: () -> Unit,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val avvisi = remember { SnackbarHostState() }
    val ana by archivio.anagrafiche.collectAsStateWithLifecycle()
    val viste by archivio.viste.collectAsStateWithLifecycle()
    val vista: Vista? = viste.firstOrNull { it.rapportino.idLocale == stato.base.idLocale }

    // Quello che sa il foglio (numero, stato, foto caricate) puo' cambiare mentre
    // il modulo e' aperto, per esempio quando parte la coda: si aggiorna la base,
    // non i campi che si stanno scrivendo.
    LaunchedEffect(vista?.rapportino?.id, vista?.rapportino?.stato, vista?.rapportino?.foto) {
        vista?.rapportino?.let { r ->
            stato.base = stato.base.copy(id = r.id, foto = r.foto, firma = r.firma, firmatario = r.firmatario,
                firmatoIl = r.firmatoIl, stato = r.stato, gruppo = r.gruppo)
        }
    }

    // Copia su disco a ogni modifica: vedi BozzaModulo.
    LaunchedEffect(stato) {
        snapshotFlow { stato.aJson().toString() }.debounce(400).collect { bozza.scrivi(stato) }
    }

    val bloccato = stato.base.bloccato
    val clienteScelto: Cliente? = ana.cliente(stato.idCliente, if (stato.idCliente.isBlank()) stato.cliente else "")
    val regole = ana.regoleDi(clienteScelto ?: Cliente(id = "", nome = stato.cliente, gruppo = stato.gruppoNuovo))
    val proposta = archivio.tariffaProposta(clienteScelto, stato.cliente)

    // La tariffa libera si propone da sola: l'ultima usata per questo cliente.
    // Se la persona l'ha gia' scritta a mano, non la si tocca.
    LaunchedEffect(stato.idCliente, stato.cliente, regole.tariffaFissa) {
        if (!bloccato && !stato.tariffaToccata && regole.tariffaFissa == null) {
            stato.tariffa = Numeri.scrivi(proposta)
        }
    }

    var chiediUscita by remember { mutableStateOf(false) }
    var chiediElimina by remember { mutableStateOf(false) }
    var chiediBozza by remember { mutableStateOf(false) }

    fun esci() {
        stato.fotoNuove.forEach { it.delete() }
        bozza.cancella()
        onChiudi()
    }

    fun indietro() {
        if (stato.cambiato) chiediUscita = true else esci()
    }

    BackHandler { indietro() }

    /** Salva e torna true; false se mancano dei dati (e lo si dice). */
    fun salva(): Boolean {
        val r = stato.rapportino()
        if (!bloccato) {
            if (!stato.valida(regole)) {
                scope.launch { avvisi.showSnackbar("Mancano dei dati: sono segnati in rosso") }
                return false
            }
            if (stato.cambiato || vista == null) archivio.salva(r)
        }
        stato.fotoNuove.forEach { archivio.accodaFoto(r.idLocale, it) }
        stato.fotoNuove.clear()
        bozza.cancella()
        return true
    }

    // ---- foto ----
    var scattoInCorso by rememberSaveable { mutableStateOf<String?>(null) }
    val fotocamera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { riuscito ->
        val percorso = scattoInCorso ?: return@rememberLauncherForActivityResult
        scattoInCorso = null
        val scatto = File(percorso)
        if (!riuscito) { scatto.delete(); return@rememberLauncherForActivityResult }
        scope.launch {
            runCatching { archivio.preparaFoto(Uri.fromFile(scatto)) }
                .onSuccess { stato.fotoNuove.add(it) }
                .onFailure { avvisi.showSnackbar("Non riesco a leggere la foto") }
            scatto.delete()
        }
    }
    val galleria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            runCatching { archivio.preparaFoto(uri) }
                .onSuccess { stato.fotoNuove.add(it) }
                .onFailure { avvisi.showSnackbar("Non riesco a leggere la foto") }
        }
    }
    fun scatta() {
        val f = Immagini.fileScatto(ctx)
        scattoInCorso = f.path
        fotocamera.launch(FileProvider.getUriForFile(ctx, ctx.packageName + ".foto", f))
    }

    Scaffold(
        containerColor = Nero,
        snackbarHost = { SnackbarHost(avvisi) },
        topBar = {
            TopAppBar(
                navigationIcon = { IconButton(onClick = { indietro() }) { Icon(Icons.Default.ArrowBack, "Indietro") } },
                title = {
                    Column {
                        Text(
                            if (stato.nuovo) "Nuovo rapportino" else stato.base.id.ifBlank { "Rapportino" },
                            style = MaterialTheme.typography.titleMedium,
                        )
                        if (!stato.nuovo && stato.base.id.isBlank()) {
                            Text("il numero arriva dal foglio", color = Smorzato, fontSize = 12.sp)
                        }
                    }
                },
                actions = {
                    if (!stato.nuovo && !bloccato) {
                        var menu by remember { mutableStateOf(false) }
                        IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, "Altro") }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(
                                text = { Text("Elimina rapportino") },
                                leadingIcon = { Icon(Icons.Default.Delete, null) },
                                onClick = { menu = false; chiediElimina = true },
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Nero),
            )
        },
        bottomBar = {
            if (!bloccato || stato.fotoNuove.isNotEmpty()) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .background(Nero)
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Button(
                        onClick = { if (salva()) onChiudi() },
                        modifier = Modifier.fillMaxWidth().height(54.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Giallo, contentColor = Nero),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text(if (bloccato) "Salva le foto" else "Salva", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        },
    ) { margini ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(margini)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
        ) {
            if (!stato.nuovo) {
                Spacer(Modifier.height(4.dp))
                Scheda { BarraAvanzamento(stato.base.stato) }
            }
            vista?.errore?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(10.dp))
                Text("Il foglio ha rifiutato questo rapportino: $it", color = Rosso, fontSize = 14.sp)
            }

            // ---------------------------------------------------------------- chi e quando
            Sezione("Quando e per chi")
            Scheda {
                CampoData(stato.data, abilitato = !bloccato) { stato.data = it }

                SceltaConRicerca(
                    testo = stato.cliente,
                    onTesto = { stato.cliente = it; stato.idCliente = ""; stato.idCommessa = "" },
                    opzioni = ana.clienti.sortedBy { it.nome.lowercase() }
                        .map { Opzione(it.id, it.nome, it.gruppo) },
                    onScelta = { o ->
                        stato.cliente = o.titolo
                        stato.idCliente = o.id
                        // La commessa di un altro cliente non ha senso qui.
                        if (ana.commesse.none { it.id == stato.idCommessa && it.idCliente == o.id }) {
                            stato.idCommessa = ""; stato.commessa = ""
                        }
                    },
                    etichetta = "Cliente",
                    errore = stato.errori["cliente"],
                    abilitato = !bloccato,
                    nuovo = { "Nuovo cliente: «$it»" },
                )

                if (stato.clienteNuovo && !bloccato) {
                    Text("Cliente nuovo: lo aggiungo al foglio. Di che gruppo è?", color = Smorzato, fontSize = 14.sp)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        val gruppi = ana.gruppi.map { it.nome }.ifEmpty { listOf("Elettrodinamica", "Privato") }
                        gruppi.forEach { g ->
                            FilterChip(
                                selected = stato.gruppoNuovo == g,
                                onClick = { stato.gruppoNuovo = g },
                                label = { Text(g) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Giallo.copy(alpha = 0.18f), selectedLabelColor = Giallo,
                                ),
                            )
                        }
                    }
                }

                val commesse = if (stato.idCliente.isBlank()) emptyList() else ana.commesseAperteDi(stato.idCliente)
                SceltaConRicerca(
                    testo = stato.commessa,
                    onTesto = { stato.commessa = it; stato.idCommessa = "" },
                    opzioni = commesse.map { Opzione(it.id, it.descrizione, listOf(it.id, it.indirizzo).filter(String::isNotBlank).joinToString(" · ")) },
                    onScelta = { o -> stato.commessa = o.titolo; stato.idCommessa = o.id },
                    etichetta = "Commessa",
                    aiuto = when {
                        stato.idCommessa.isNotBlank() -> "Codice ${stato.idCommessa}"
                        stato.commessa.isNotBlank() -> "Commessa nuova: la aggiungo al foglio col suo codice"
                        commesse.isEmpty() && stato.idCliente.isNotBlank() -> "Nessuna commessa aperta: scrivila per crearla"
                        else -> "Facoltativa"
                    },
                    abilitato = !bloccato,
                    nuovo = { "Nuova commessa: «$it»" },
                )

                if (ana.ticketAttivo || stato.ticket.isNotBlank()) {
                    CampoTesto(stato.ticket, { stato.ticket = it }, "Ticket", abilitato = !bloccato)
                }
                CampoTesto(stato.luogo, { stato.luogo = it }, "Luogo", aiuto = "Facoltativo", abilitato = !bloccato)
            }

            // ---------------------------------------------------------------- il lavoro
            Sezione("Il lavoro")
            Scheda {
                CampoTesto(
                    stato.descrizione, { stato.descrizione = it }, "Descrizione del lavoro",
                    righe = 4, errore = stato.errori["descrizione"], abilitato = !bloccato,
                )
            }

            // ---------------------------------------------------------------- ore e strada
            Sezione("Ore e strada")
            Scheda {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CampoNumero(stato.oreLavoro, { stato.oreLavoro = it }, "Lavoro", Modifier.weight(1f),
                        errore = stato.errori["oreLavoro"], abilitato = !bloccato, suffisso = "h")
                    CampoNumero(stato.oreExtra, { stato.oreExtra = it }, "Extra", Modifier.weight(1f),
                        errore = stato.errori["oreExtra"], abilitato = !bloccato, suffisso = "h")
                    CampoNumero(stato.oreViaggio, { stato.oreViaggio = it }, "Viaggio", Modifier.weight(1f),
                        errore = stato.errori["oreViaggio"], abilitato = !bloccato, suffisso = "h")
                }
                val totaleOre = listOf(stato.oreLavoro, stato.oreExtra, stato.oreViaggio).sumOf { Numeri.leggi(it) ?: 0.0 }
                Text(
                    "Totale ${Numeri.ore(totaleOre)}" +
                        if (!regole.pagaViaggio && (Numeri.leggi(stato.oreViaggio) ?: 0.0) > 0) " · il viaggio non si paga" else "",
                    color = Smorzato, fontSize = 14.sp,
                )
                CampoNumero(stato.km, { stato.km = it }, "Chilometri", errore = stato.errori["km"],
                    abilitato = !bloccato, suffisso = "km",
                    aiuto = if (regole.kmRimborsati) "Rimborso ACI ${Numeri.scrivi(regole.euroKm)} €/km" else "Questo cliente non rimborsa i km")
            }

            // ---------------------------------------------------------------- tariffa
            Sezione("Tariffa")
            Scheda {
                if (regole.tariffaFissa != null) {
                    RigaConto("Tariffa fissa ${regole.gruppo}", "${Numeri.scrivi(regole.tariffaFissa)} €/h")
                } else {
                    CampoNumero(
                        stato.tariffa,
                        { stato.tariffa = it; stato.tariffaToccata = true },
                        "Tariffa oraria",
                        errore = stato.errori["tariffa"],
                        abilitato = !bloccato,
                        suffisso = "€/h",
                        aiuto = when {
                            proposta != null && Numeri.leggi(stato.tariffa) == proposta ->
                                "L'ultima usata per ${clienteScelto?.nome ?: stato.cliente}"
                            proposta != null -> "L'ultima volta era ${Numeri.scrivi(proposta)} €/h"
                            stato.cliente.isNotBlank() -> "Prima volta per questo cliente: me la ricordo per la prossima"
                            else -> null
                        },
                    )
                }
            }

            // ---------------------------------------------------------------- spese
            Sezione("Spese")
            Scheda {
                CampoNumero(stato.spese, { stato.spese = it }, "Spese extra", errore = stato.errori["spese"],
                    abilitato = !bloccato, suffisso = "€", aiuto = "Pasti, pedaggi, materiale pagato da te")
                CampoTesto(stato.noteSpese, { stato.noteSpese = it }, "Di cosa", abilitato = !bloccato)
                Foto(
                    remote = stato.base.foto,
                    inAttesa = vista?.fotoInAttesa.orEmpty(),
                    nuove = stato.fotoNuove,
                    onApriRemota = { f -> ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(f.url))) },
                    onTogliRemota = { f -> archivio.togliFoto(stato.base.idLocale, f, null) },
                    onTogliInAttesa = { f -> archivio.togliFoto(stato.base.idLocale, null, f) },
                    onTogliNuova = { f -> stato.fotoNuove.remove(f); f.delete() },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { scatta() }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Scatta foto")
                    }
                    OutlinedButton(
                        onClick = { galleria.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        modifier = Modifier.weight(1f),
                    ) { Text("Dalla galleria") }
                }
            }

            // ---------------------------------------------------------------- note
            Sezione("Note interne")
            Scheda {
                CampoTesto(stato.noteInterne, { stato.noteInterne = it }, "Note per te",
                    righe = 2, aiuto = "Non finiscono sul PDF del cliente", abilitato = !bloccato)
            }

            // ---------------------------------------------------------------- conto
            Sezione("Conto")
            val r = stato.rapportino()
            val conto = if (!stato.cambiato && vista?.conto != null) vista.conto else Calcolo.calcola(r, regole)
            Scheda {
                val orePagate = r.oreLavoro + if (regole.pagaViaggio) r.oreViaggio else 0.0
                RigaConto(
                    "Compenso ore", Numeri.euro(conto.compensoOre),
                    sotto = buildString {
                        append("${Numeri.ore(orePagate)} × ${Numeri.scrivi(conto.tariffa)} €")
                        if (r.oreExtra > 0) append(" + ${Numeri.ore(r.oreExtra)} extra")
                        if (regole.maggExtra > 0 && r.oreExtra > 0) append(" (+${Numeri.scrivi(regole.maggExtra)}%)")
                    },
                )
                RigaConto(
                    "Rimborso km", Numeri.euro(conto.rimborsoKm),
                    sotto = if (conto.kmRimborsati) "${Numeri.scrivi(r.km)} km × ${Numeri.scrivi(conto.euroKm)} €" else "non rimborsati",
                )
                RigaConto("Spese", Numeri.euro(r.spese))
                RigaConto("Totale", Numeri.euro(conto.totale), forte = true)
                if (stato.cambiato || vista?.inCoda == true) {
                    Text("Calcolato sul telefono: il foglio lo conferma quando arriva.", color = Smorzato, fontSize = 12.sp)
                }
            }

            // ---------------------------------------------------------------- firma
            Sezione("Firma del cliente")
            Scheda {
                val firmato = stato.base.stato in Stato.BLOCCATI
                if (firmato) {
                    val quando = stato.base.firmatoIl.takeIf { it.isNotBlank() }?.let {
                        runCatching { LocalDateTime.parse(it).format(DateTimeFormatter.ofPattern("dd/MM/yyyy 'alle' HH:mm")) }.getOrNull()
                    }
                    Text(
                        "Firmato" + (stato.base.firmatario.takeIf { it.isNotBlank() }?.let { " da $it" } ?: "") +
                            (quando?.let { " il $it" } ?: ""),
                        color = Verde, fontWeight = FontWeight.SemiBold,
                    )
                    vista?.firmaInAttesa?.let { f ->
                        Miniatura(f, Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(10.dp)).background(Bianco), ContentScale.Fit)
                        Text("La firma parte appena c'è rete.", color = Giallo, fontSize = 13.sp)
                    }
                    TextButton(onClick = { chiediBozza = true }) { Text("Riporta in bozza per correggere", color = Giallo) }
                } else {
                    Text(
                        "Il cliente firma col dito su questo telefono. Prima salvo il rapportino.",
                        color = Smorzato, fontSize = 14.sp,
                    )
                    OutlinedButton(
                        onClick = { if (salva()) onFirma(stato.base.idLocale) },
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                    ) { Text("Fai firmare il cliente") }
                }
            }
        }
    }

    if (chiediUscita) {
        AlertDialog(
            onDismissRequest = { chiediUscita = false },
            title = { Text("Uscire senza salvare?") },
            text = { Text("Le modifiche a questo rapportino andranno perse.") },
            confirmButton = { TextButton(onClick = { chiediUscita = false; esci() }) { Text("Esci", color = Rosso) } },
            dismissButton = { TextButton(onClick = { chiediUscita = false }) { Text("Resta") } },
        )
    }
    if (chiediElimina) {
        AlertDialog(
            onDismissRequest = { chiediElimina = false },
            title = { Text("Eliminare il rapportino?") },
            text = {
                Text(
                    if (stato.base.id.isBlank()) "Non è ancora sul foglio: sparisce dal telefono."
                    else "Sul foglio resta, segnato come annullato: si recupera da lì."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    chiediElimina = false
                    archivio.elimina(stato.base.idLocale)
                    esci()
                }) { Text("Elimina", color = Rosso) }
            },
            dismissButton = { TextButton(onClick = { chiediElimina = false }) { Text("Annulla") } },
        )
    }
    if (chiediBozza) {
        AlertDialog(
            onDismissRequest = { chiediBozza = false },
            title = { Text("Riportare in bozza?") },
            text = { Text("La firma del cliente viene tolta: ha firmato il rapportino com'era. Dopo la correzione va rifirmato.") },
            confirmButton = {
                TextButton(onClick = {
                    chiediBozza = false
                    archivio.riportaInBozza(stato.base.idLocale)
                    stato.base = stato.base.copy(stato = Stato.BOZZA, firma = null, firmatario = "", firmatoIl = "")
                }) { Text("Riporta in bozza", color = Giallo) }
            },
            dismissButton = { TextButton(onClick = { chiediBozza = false }) { Text("Annulla") } },
        )
    }
}

/** La data: si tocca e si sceglie dal calendario. Di partenza e' oggi. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CampoData(data: java.time.LocalDate, abilitato: Boolean, onCambia: (java.time.LocalDate) -> Unit) {
    var aperto by remember { mutableStateOf(false) }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, Bordo, RoundedCornerShape(12.dp))
            .clickable(enabled = abilitato) { aperto = true }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Data", color = Smorzato, fontSize = 12.sp)
            Text(dataLunga(data).replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodyLarge)
        }
        Icon(Icons.Default.DateRange, "Cambia data", tint = if (abilitato) Giallo else Smorzato)
    }
    if (aperto) {
        val stato = rememberDatePickerState(
            initialSelectedDateMillis = data.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { aperto = false },
            confirmButton = {
                TextButton(onClick = {
                    stato.selectedDateMillis?.let { onCambia(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                    aperto = false
                }) { Text("Ok") }
            },
            dismissButton = { TextButton(onClick = { aperto = false }) { Text("Annulla") } },
        ) { DatePicker(state = stato) }
    }
}

/**
 * Le foto delle spese: quelle gia' sul foglio, quelle che stanno partendo e
 * quelle appena fatte. Le foto su Drive l'app non le puo' mostrare senza un
 * accesso a Google: se ce n'e' una copia sul telefono si vede quella,
 * altrimenti un riquadro che apre Drive.
 */
@Composable
private fun Foto(
    remote: List<FileRemoto>,
    inAttesa: List<File>,
    nuove: List<File>,
    onApriRemota: (FileRemoto) -> Unit,
    onTogliRemota: (FileRemoto) -> Unit,
    onTogliInAttesa: (File) -> Unit,
    onTogliNuova: (File) -> Unit,
) {
    if (remote.isEmpty() && inAttesa.isEmpty() && nuove.isEmpty()) return
    val ctx = LocalContext.current
    var daTogliere by remember { mutableStateOf<(() -> Unit)?>(null) }
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        remote.forEach { f ->
            val locale = Immagini.fotoLocale(ctx, f.id)
            RiquadroFoto(locale, "sul foglio", onClick = { onApriRemota(f) }, onTogli = { daTogliere = { onTogliRemota(f) } })
        }
        inAttesa.forEach { f -> RiquadroFoto(f, "in partenza", onClick = null, onTogli = { daTogliere = { onTogliInAttesa(f) } }) }
        nuove.forEach { f -> RiquadroFoto(f, "nuova", onClick = null, onTogli = { onTogliNuova(f) }) }
    }
    daTogliere?.let { azione ->
        AlertDialog(
            onDismissRequest = { daTogliere = null },
            title = { Text("Togliere la foto?") },
            text = { Text("Su Drive finisce nel cestino, da cui si recupera.") },
            confirmButton = { TextButton(onClick = { azione(); daTogliere = null }) { Text("Togli", color = Rosso) } },
            dismissButton = { TextButton(onClick = { daTogliere = null }) { Text("Annulla") } },
        )
    }
}

@Composable
private fun RiquadroFoto(file: File?, etichetta: String, onClick: (() -> Unit)?, onTogli: () -> Unit) {
    Box(
        Modifier
            .size(96.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(CartaAlta)
            .border(1.dp, Bordo, RoundedCornerShape(10.dp))
            .let { if (onClick != null) it.clickable(onClick = onClick) else it },
    ) {
        if (file != null) Miniatura(file, Modifier.fillMaxSize())
        else Text("Su Drive", color = Smorzato, fontSize = 13.sp, modifier = Modifier.align(Alignment.Center))
        Text(
            etichetta, fontSize = 10.sp, color = Bianco,
            modifier = Modifier.align(Alignment.BottomStart).background(Nero.copy(alpha = 0.6f)).padding(horizontal = 4.dp, vertical = 1.dp),
        )
        Box(
            Modifier.align(Alignment.TopEnd).padding(2.dp).size(26.dp).clip(RoundedCornerShape(13.dp))
                .background(Nero.copy(alpha = 0.6f)).clickable(onClick = onTogli),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Default.Close, "Togli", tint = Bianco, modifier = Modifier.size(16.dp)) }
    }
}

/** Una miniatura caricata fuori dal thread dello schermo. */
@Composable
fun Miniatura(file: File, modifier: Modifier = Modifier, scala: ContentScale = ContentScale.Crop) {
    val bitmap by produceState<Bitmap?>(null, file.path) {
        value = withContext(Dispatchers.IO) { Immagini.miniatura(file, 480) }
    }
    bitmap?.let { Image(it.asImageBitmap(), null, modifier, contentScale = scala) }
}
