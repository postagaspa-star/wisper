package eu.stgm.wisper.ui

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Riepiloghi
import eu.stgm.wisper.Vista
import eu.stgm.wisper.rapportino.Calcolo
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Stato
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private val IT = Locale.ITALY

private fun dataLungaIt(d: LocalDate): String {
    val oggi = LocalDate.now()
    val base = d.format(DateTimeFormatter.ofPattern("EEEE d MMMM", IT))
    return when (d) {
        oggi -> "Oggi, $base"
        oggi.minusDays(1) -> "Ieri, $base"
        else -> base.replaceFirstChar { it.uppercase() }
    }
}

/**
 * Il rapportino in passi brevi (docs/aspetto.md §4): Per chi → Ore e strada →
 * Il lavoro → Riepilogo. Una cosa per schermata, un pulsante grande in basso,
 * e il totale che si aggiorna mentre si compila. Un rapportino già scritto si
 * apre sul Riepilogo, e da lì "Cambia" porta al passo giusto.
 */
@OptIn(ExperimentalMaterial3Api::class, kotlinx.coroutines.FlowPreview::class)
@Composable
fun SchermataRapportino(
    dati: Dati,
    stato: ModuloStato,
    bozza: BozzaModulo,
    onFirma: (String) -> Unit,
    onChiudi: () -> Unit,
) {
    val c = W.colori
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val visita = LocalVisita.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val vista: Vista? = viste.firstOrNull { it.rapportino.idLocale == stato.base.idLocale }

    // Quello che sa il foglio (numero, stato, foto) può cambiare mentre il modulo
    // è aperto: si aggiorna la base, non i campi che si stanno scrivendo.
    LaunchedEffect(vista?.rapportino?.id, vista?.rapportino?.stato, vista?.rapportino?.foto) {
        vista?.rapportino?.let { r ->
            stato.base = stato.base.copy(id = r.id, foto = r.foto, firma = r.firma, firmatario = r.firmatario,
                firmatoIl = r.firmatoIl, stato = r.stato, gruppo = r.gruppo)
        }
    }
    // La copia su disco a ogni modifica, se Android chiude l'app (non nella visita).
    LaunchedEffect(stato) {
        if (!dati.esempio) snapshotFlow { stato.aJson().toString() }.debounce(400).collect { bozza.scrivi(stato) }
    }

    val bloccato = stato.base.bloccato
    val clienteScelto: Cliente? = ana.cliente(stato.idCliente, if (stato.idCliente.isBlank()) stato.cliente else "")
    val regole = ana.regoleDi(clienteScelto, ana.commessa(stato.idCommessa))
    // La tariffa da proporre: il prezzo della commessa, se ce l'ha; altrimenti l'ultima del cliente.
    val prezzoCommessa = ana.commessa(stato.idCommessa)?.prezzoOrario?.takeIf { it > 0 }
    val proposta = prezzoCommessa ?: dati.tariffaProposta(clienteScelto, stato.cliente)
    val ultimiKm = Riepiloghi.ultimiKm(viste.filterNot { it.rapportino.idLocale == stato.base.idLocale }, stato.idCommessa, stato.idCliente, stato.cliente)

    // Nella visita la descrizione non si può scrivere (è sotto il velo): c'è già.
    LaunchedEffect(stato.passo) {
        if (dati.esempio && stato.passo == 3 && stato.descrizione.isBlank()) stato.descrizione = "Collaudo del quadro della linea 2"
    }

    // La tariffa libera si propone da sola: il prezzo della commessa o l'ultima usata per questo cliente.
    LaunchedEffect(stato.idCliente, stato.cliente, stato.idCommessa, regole.tariffaFissa) {
        if (!bloccato && !stato.tariffaToccata && regole.tariffaFissa == null) stato.tariffa = Numeri.scrivi(proposta)
    }

    var chiediUscita by remember { mutableStateOf(false) }
    var chiediElimina by remember { mutableStateOf(false) }
    var chiediBozza by remember { mutableStateOf(false) }

    fun esci() {
        if (!dati.esempio) stato.fotoNuove.forEach { it.delete() }
        bozza.cancella()
        onChiudi()
    }

    fun vaiA(n: Int) {
        stato.passo = n
    }

    fun uscita() {
        if (stato.cambiato && !dati.esempio) chiediUscita = true else esci()
    }

    fun indietro() {
        when {
            stato.tornaAlRiepilogo -> { stato.tornaAlRiepilogo = false; vaiA(4) }
            stato.passo == 1 || (stato.passo == 4 && !stato.nuovo) -> uscita()
            else -> vaiA(stato.passo - 1)
        }
    }

    fun avanti() {
        if (!stato.validaPasso(stato.passo, regole)) return
        visita?.azione("avanti")
        if (stato.tornaAlRiepilogo) { stato.tornaAlRiepilogo = false; vaiA(4) } else vaiA(stato.passo + 1)
    }

    fun cambiaDa(n: Int) {
        stato.tornaAlRiepilogo = true
        if (n == 1) stato.sceltaCommessa = false
        vaiA(n)
    }

    BackHandler { indietro() }

    /** Salva e torna true; false se mancano dei dati (e si torna al passo che li ha). */
    fun salva(): Boolean {
        val r = stato.rapportino()
        if (!bloccato) {
            if (!stato.valida(regole)) {
                val passoConErrore = when {
                    "cliente" in stato.errori -> 1
                    stato.errori.keys.any { it in setOf("oreLavoro", "oreExtra", "oreViaggio", "km", "tariffa") } -> 2
                    else -> 3
                }
                stato.tornaAlRiepilogo = true
                vaiA(passoConErrore)
                return false
            }
            if (stato.cambiato || vista == null) dati.salva(r)
        }
        stato.fotoNuove.forEach { dati.accodaFoto(r.idLocale, it) }
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
            runCatching { dati.preparaFoto(Uri.fromFile(scatto)) }.onSuccess { stato.fotoNuove.add(it); stato.speseAperte = true }
            scatto.delete()
            if (bloccato) salva()
        }
    }
    val galleria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            runCatching { dati.preparaFoto(uri) }.onSuccess { stato.fotoNuove.add(it); stato.speseAperte = true }
            if (bloccato) salva()
        }
    }
    fun scatta() {
        if (dati.esempio) { stato.fotoNuove.add(File("esempio-scontrino-${stato.fotoNuove.size}.jpg")); stato.speseAperte = true; return }
        val f = Immagini.fileScatto(ctx)
        scattoInCorso = f.path
        fotocamera.launch(FileProvider.getUriForFile(ctx, ctx.packageName + ".foto", f))
    }
    fun dallaGalleria() {
        if (dati.esempio) { scatta(); return }
        galleria.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    val r = stato.rapportino()
    val conto = if (!stato.cambiato && vista?.conto != null) vista.conto else Calcolo.calcola(r, regole)
    val oreTotali = listOf(stato.oreLavoro, stato.oreExtra, stato.oreViaggio).sumOf { Numeri.leggi(it) ?: 0.0 }
    val progresso by animateFloatAsState(stato.passo / 4f, tween(300), label = "passo")

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            // ---------------------------------------------------------- in alto
            Column(Modifier.padding(horizontal = 20.dp).padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth().height(48.dp), verticalAlignment = Alignment.CenterVertically) {
                    val chiude = !stato.tornaAlRiepilogo && (stato.passo == 1 || (stato.passo == 4 && !stato.nuovo))
                    PulsanteTondo(if (chiude) Icone.chiudi else Icone.indietro, if (chiude) "Chiudi" else "Indietro", { indietro() })
                    Spacer(Modifier.weight(1f))
                    if (stato.passo == 4 && !stato.nuovo) {
                        ParolaStato(stato.base.stato)
                        if (!bloccato && stato.base.id.isNotBlank()) {
                            var menu by remember { mutableStateOf(false) }
                            Spacer(Modifier.width(8.dp))
                            Box {
                                PulsanteTondo(Icons.Default.MoreVert, "Altre azioni", { menu = true })
                                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                    DropdownMenuItem(
                                        text = { Text("Elimina il rapportino", style = Testi.testo) },
                                        leadingIcon = { Icon(Icons.Default.Delete, null) },
                                        onClick = { menu = false; chiediElimina = true },
                                    )
                                }
                            }
                        }
                    } else {
                        Text(if (stato.passo == 4) "Riepilogo" else "Passo ${stato.passo} di 3", style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.tenue)
                    }
                }
                if (stato.nuovo || stato.tornaAlRiepilogo || stato.passo < 4) {
                    Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(c.superficie2)) {
                        Box(Modifier.fillMaxWidth(progresso).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(c.testo))
                    }
                }
            }

            // ---------------------------------------------------------- i passi
            AnimatedContent(
                targetState = stato.passo,
                transitionSpec = {
                    if (targetState > initialState) (slideInHorizontally(tween(300)) { it / 4 } + fadeIn(tween(300))) togetherWith
                        (slideOutHorizontally(tween(300)) { -it / 4 } + fadeOut(tween(200)))
                    else (slideInHorizontally(tween(300)) { -it / 4 } + fadeIn(tween(300))) togetherWith
                        (slideOutHorizontally(tween(300)) { it / 4 } + fadeOut(tween(200)))
                },
                modifier = Modifier.weight(1f),
                label = "passi",
            ) { passo ->
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)
                        .padding(top = 16.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    when (passo) {
                        1 -> PassoPerChi(stato, dati, viste, ana, regole, onScelto = { visita?.azione(it); vaiA(if (stato.tornaAlRiepilogo) 4 else 2); stato.tornaAlRiepilogo = false })
                        2 -> PassoOre(stato, regole, proposta, ultimiKm, clienteScelto, prezzoCommessa != null)
                        3 -> PassoLavoro(stato, ana.ticketAttivo, vista, onScatta = { scatta() }, onGalleria = { dallaGalleria() }, dati = dati)
                        else -> PassoRiepilogo(stato, vista, conto, regole, onCambia = { cambiaDa(it) })
                    }
                }
            }

            // ---------------------------------------------------------- in basso
            Box(Modifier.fillMaxWidth().background(c.fondo).navigationBarsPadding().imePadding()) {
                when {
                    stato.passo == 2 || stato.passo == 3 -> Row(
                        Modifier.fillMaxWidth().border(1.dp, c.bordoScheda).padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f).bersaglio("totale")) {
                            Text("Totale", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue)
                            EuroAnimati(conto.totale, Testi.titoloScheda.copy(fontSize = Testi.titoloScheda.fontSize * 1.08f))
                        }
                        val pronto = stato.passo != 2 || oreTotali > 0
                        Box(
                            Modifier.width(172.dp).height(60.dp).clip(RoundedCornerShape(18.dp))
                                .background(if (pronto) c.giallo else c.superficie2).clickable { avanti() }.bersaglio("avanti"),
                            contentAlignment = Alignment.Center,
                        ) { Text("Avanti", style = Testi.pulsante, color = if (pronto) c.suGiallo else c.moltoTenue) }
                    }
                    stato.passo == 4 && !bloccato -> Column(
                        Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 10.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        PulsantePrincipale("Fai firmare al cliente", {
                            if (salva()) onFirma(stato.base.idLocale)
                        }, Modifier.bersaglio("firma"), icona = Icone.firma)
                        PulsanteTesto("Salva senza firma", { if (salva()) onChiudi() }, colore = c.testo2)
                    }
                    stato.passo == 4 && bloccato -> Column(
                        Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 10.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        PulsanteBordo("Aggiungi uno scontrino", { scatta() }, Modifier.fillMaxWidth(), icona = Icone.fotocamera, altezza = 60.dp)
                        PulsanteTesto("Riporta in bozza", { chiediBozza = true }, colore = c.testo2)
                    }
                }
            }
        }
    }

    if (chiediUscita) {
        AlertDialog(
            onDismissRequest = { chiediUscita = false },
            title = { Text("Uscire senza salvare?", style = Testi.titoloSezione) },
            text = { Text("Quello che hai scritto in questo rapportino si perde.", style = Testi.testo) },
            confirmButton = { TextButton(onClick = { chiediUscita = false; esci() }) { Text("Esci", color = c.rossoTesto) } },
            dismissButton = { TextButton(onClick = { chiediUscita = false }) { Text("Resta", color = c.testo) } },
        )
    }
    if (chiediElimina) {
        AlertDialog(
            onDismissRequest = { chiediElimina = false },
            title = { Text("Eliminare il rapportino?", style = Testi.titoloSezione) },
            text = { Text("Sul foglio resta, segnato come annullato: si recupera da lì.", style = Testi.testo) },
            confirmButton = { TextButton(onClick = { chiediElimina = false; dati.elimina(stato.base.idLocale); esci() }) { Text("Elimina", color = c.rossoTesto) } },
            dismissButton = { TextButton(onClick = { chiediElimina = false }) { Text("Annulla", color = c.testo) } },
        )
    }
    if (chiediBozza) {
        AlertDialog(
            onDismissRequest = { chiediBozza = false },
            title = { Text("Riportare in bozza?", style = Testi.titoloSezione) },
            text = { Text("La firma del cliente viene tolta: ha firmato il rapportino com'era.", style = Testi.testo) },
            confirmButton = {
                TextButton(onClick = {
                    chiediBozza = false
                    dati.riportaInBozza(stato.base.idLocale)
                    stato.base = stato.base.copy(stato = Stato.BOZZA, firma = null, firmatario = "", firmatoIl = "")
                }) { Text("Riporta in bozza", color = c.testo) }
            },
            dismissButton = { TextButton(onClick = { chiediBozza = false }) { Text("Annulla", color = c.testo) } },
        )
    }
}

// ============================================================================ Passo 1

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ColumnScope.PassoPerChi(
    stato: ModuloStato,
    dati: Dati,
    viste: List<Vista>,
    ana: eu.stgm.wisper.rapportino.Anagrafiche,
    regole: eu.stgm.wisper.rapportino.Regole,
    onScelto: (String) -> Unit,
) {
    val c = W.colori
    Text("Per chi?", style = Testi.titoloPagina, color = c.testo)
    RigaData(stato)

    if (!stato.sceltaCommessa) {
        val recenti = Riepiloghi.recenti(viste.filterNot { it.rapportino.idLocale == stato.base.idLocale }, ana)
        if (recenti.isNotEmpty()) Etichetta("Recenti", Modifier.padding(top = 4.dp))
        recenti.forEachIndexed { i, rc ->
            SchedaScelta(
                nome = rc.cliente,
                titolo = rc.cliente,
                sotto = rc.commessa.ifBlank { "Senza commessa" },
                piccolo = rc.idCommessa,
                modifier = Modifier.bersaglio("recente-$i"),
            ) {
                stato.cliente = rc.cliente; stato.idCliente = rc.idCliente
                stato.commessa = rc.commessa; stato.idCommessa = rc.idCommessa; stato.codiceProposto = ""
                stato.errori = stato.errori - "cliente"
                onScelto("recente-$i")
            }
        }
        CampoTesto(
            stato.ricerca, { stato.ricerca = it }, "Altro cliente", Modifier.padding(top = 4.dp),
            segnaposto = "Scrivi il nome", iconaInizio = Icone.cerca, errore = stato.errori["cliente"],
        )
        val testo = stato.ricerca.trim()
        if (testo.isNotEmpty()) {
            val trovati = ana.clienti.filter { cl ->
                (listOf(cl.nome) + cl.alias).any { it.contains(testo, ignoreCase = true) }
            }.sortedBy { it.nome.lowercase() }.take(6)
            trovati.forEach { cl ->
                SchedaScelta(nome = cl.nome, titolo = cl.nome, sotto = if (cl.tariffaFissa != null) "Tariffa fissa" else "", piccolo = "", compatta = true) {
                    stato.cliente = cl.nome; stato.idCliente = cl.id; stato.commessa = ""; stato.idCommessa = ""; stato.codiceProposto = ""
                    stato.errori = stato.errori - "cliente"
                    stato.sceltaCommessa = true
                }
            }
            if (trovati.none { it.nome.equals(testo, ignoreCase = true) }) {
                // Un cliente nuovo ha la tariffa libera: Elettrodinamica, l'unica fissa, c'è già.
                PulsanteBordo("Cliente nuovo «$testo»", {
                    stato.cliente = testo; stato.idCliente = ""
                    stato.commessa = ""; stato.idCommessa = ""; stato.codiceProposto = ""
                    stato.errori = stato.errori - "cliente"
                    stato.sceltaCommessa = true
                }, Modifier.fillMaxWidth(), icona = Icone.piu, tratteggiato = true)
            }
        }
    } else {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
            Iniziali(stato.cliente, dimensione = 44.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(stato.cliente, style = Testi.forteGrande, color = c.testo)
                Text(if (stato.idCliente.isBlank()) "Cliente nuovo · tariffa libera" else if (regole.tariffaFissa != null) "Tariffa fissa" else "Tariffa libera", style = Testi.secondario, color = c.tenue)
            }
            PulsanteTesto("Cambia", { stato.sceltaCommessa = false })
        }
        Etichetta("Commessa", Modifier.padding(top = 6.dp))
        val commesse = if (stato.idCliente.isBlank()) emptyList() else ana.commesseAperteDi(stato.idCliente)
        commesse.forEach { m ->
            SchedaScelta(nome = stato.cliente, titolo = m.descrizione, sotto = m.indirizzo, piccolo = m.id, compatta = true) {
                stato.commessa = m.descrizione; stato.idCommessa = m.id; stato.codiceProposto = ""
                onScelto("commessa")
            }
        }
        PulsanteBordo("Senza commessa", { stato.commessa = ""; stato.idCommessa = ""; stato.codiceProposto = ""; onScelto("commessa") }, Modifier.fillMaxWidth())
        var nuova by remember { mutableStateOf("") }
        CampoTesto(nuova, { nuova = it }, "Commessa nuova", segnaposto = "Come la chiami tu")
        if (nuova.isNotBlank()) {
            // Il codice della commessa nuova si sa subito, anche senza rete.
            val codice = ana.prossimoCodiceCommessa(stato.data.year)
            PulsanteBordo("Usa «${nuova.trim()}» · $codice", {
                stato.commessa = nuova.trim(); stato.idCommessa = ""; stato.codiceProposto = codice
                onScelto("commessa")
            }, Modifier.fillMaxWidth(), icona = Icone.piu)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RigaData(stato: ModuloStato) {
    val c = W.colori
    var aperto by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp)).background(c.scheda)
            .border(1.5.dp, c.bordoCampo, RoundedCornerShape(16.dp)).clickable(enabled = !stato.base.bloccato) { aperto = true }
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icone.calendario, null, tint = c.testo, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Text(dataLungaIt(stato.data), style = Testi.pulsanteSecondario, color = c.testo, modifier = Modifier.weight(1f))
        Text("Cambia", style = Testi.pulsanteSecondario, color = c.gialloTesto)
    }
    if (aperto) {
        val s = rememberDatePickerState(initialSelectedDateMillis = stato.data.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { aperto = false },
            confirmButton = {
                TextButton(onClick = {
                    s.selectedDateMillis?.let { stato.data = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    aperto = false
                }) { Text("Ok", color = W.colori.testo) }
            },
            dismissButton = { TextButton(onClick = { aperto = false }) { Text("Annulla", color = W.colori.testo) } },
        ) { DatePicker(state = s) }
    }
}

/** Una scheda da toccare per scegliere: cliente e commessa in un colpo solo. */
@Composable
private fun SchedaScelta(
    nome: String,
    titolo: String,
    sotto: String,
    piccolo: String,
    modifier: Modifier = Modifier,
    compatta: Boolean = false,
    onClick: () -> Unit,
) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().heightIn(min = if (compatta) 64.dp else 84.dp).clip(RoundedCornerShape(20.dp)).background(c.scheda)
            .border(1.dp, c.bordoScheda, RoundedCornerShape(20.dp)).clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Iniziali(nome, dimensione = if (compatta) 40.dp else 48.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(titolo, style = Testi.forteGrande, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Medium), color = c.testo2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (piccolo.isNotBlank()) Text(piccolo, style = Testi.piccolo, color = c.tenue)
        }
        Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
    }
}

// ============================================================================ Passo 2

@Composable
private fun ColumnScope.PassoOre(
    stato: ModuloStato,
    regole: eu.stgm.wisper.rapportino.Regole,
    proposta: Double?,
    ultimiKm: Double?,
    cliente: Cliente?,
    /** La tariffa proposta e' il prezzo della commessa, non l'ultima del cliente. */
    daCommessa: Boolean = false,
) {
    val c = W.colori
    val visita = LocalVisita.current
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(listOf(stato.cliente, stato.idCommessa.ifBlank { stato.codiceProposto }.ifBlank { stato.commessa }.takeIf { it.isNotBlank() }).filterNotNull().joinToString(" · "),
            style = Testi.secondarioGrande, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("Ore e strada", style = Testi.titoloPagina, color = c.testo)
    }

    Scheda {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Lavoro", style = Testi.titoloSezione, color = c.testo, modifier = Modifier.weight(1f))
            Stepper(Numeri.ore(Numeri.leggi(stato.oreLavoro) ?: 0.0), { stato.cambia("oreLavoro", -0.5) }, { stato.cambia("oreLavoro", 0.5) }, "lavoro")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(4.0, 6.0, 8.0).forEach { h ->
                Pillola(
                    Numeri.ore(h), (Numeri.leggi(stato.oreLavoro) ?: 0.0) == h,
                    {
                        stato.oreLavoro = Numeri.scrivi(h); stato.errori = stato.errori - "oreLavoro"
                        visita?.azione("ore-${h.toInt()}")
                    },
                    Modifier.weight(1f).bersaglio("ore-${h.toInt()}"),
                )
            }
        }
        stato.errori["oreLavoro"]?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
    }

    Scheda {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Viaggio", style = Testi.titoloSezione, color = c.testo)
                Text(
                    if (regole.pagaViaggio) "pagato" else "non pagato",
                    style = Testi.piccolo, color = c.tenue,
                )
            }
            Stepper(Numeri.ore(Numeri.leggi(stato.oreViaggio) ?: 0.0), { stato.cambia("oreViaggio", -0.5) }, { stato.cambia("oreViaggio", 0.5) }, "viaggio")
        }
    }

    if (!stato.extraAperto) {
        PulsanteBordo("Ore extra", { stato.extraAperto = true }, Modifier.fillMaxWidth(), icona = Icone.piu, altezza = 48.dp, tratteggiato = true)
    } else {
        Scheda {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Extra", style = Testi.titoloSezione, color = c.testo)
                    if (regole.maggExtra > 0) Text("+${Numeri.scrivi(regole.maggExtra)}%", style = Testi.piccolo, color = c.tenue)
                }
                Stepper(Numeri.ore(Numeri.leggi(stato.oreExtra) ?: 0.0), { stato.cambia("oreExtra", -0.5) }, { stato.cambia("oreExtra", 0.5) }, "extra")
            }
        }
    }

    Scheda {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Chilometri", style = Testi.titoloSezione, color = c.testo, modifier = Modifier.weight(1f))
            CampoTesto(
                stato.km, { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) { stato.km = t; stato.errori = stato.errori - "km" } }, null,
                Modifier.width(128.dp), segnaposto = "0", tastiera = KeyboardType.Decimal, suffisso = "km",
                stile = Testi.titoloScheda, errore = stato.errori["km"],
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (ultimiKm != null) {
                Pillola(
                    "Ultima volta · ${Numeri.scrivi(ultimiKm)} km", Numeri.leggi(stato.km) == ultimiKm,
                    { stato.km = Numeri.scrivi(ultimiKm); visita?.azione("km-ultimi") },
                    Modifier.weight(1.7f).bersaglio("km-ultimi"), altezza = 44.dp,
                )
            }
            Pillola("Senza auto", stato.km.isNotBlank() && Numeri.leggi(stato.km) == 0.0, { stato.km = "0" }, Modifier.weight(1f), altezza = 44.dp)
        }
        if (!regole.kmRimborsati) Text("Questo cliente non rimborsa i km", style = Testi.piccolo, color = c.tenue)
    }

    // La tariffa: fissa per il gruppo, o quella scritta qui (proposta: l'ultima usata).
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(if (regole.tariffaFissa != null) "Tariffa fissa ${stato.cliente}" else "Tariffa oraria", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
            if (regole.tariffaFissa == null) Text(
                when {
                    daCommessa && Numeri.leggi(stato.tariffa) == proposta -> "il prezzo della commessa"
                    daCommessa -> "la commessa è a ${Numeri.scrivi(proposta)} €/h"
                    proposta != null && Numeri.leggi(stato.tariffa) == proposta -> "l'ultima usata per ${(cliente?.nome ?: stato.cliente).substringBefore(' ')}"
                    proposta != null -> "l'ultima volta era ${Numeri.scrivi(proposta)} €/h"
                    else -> "prima volta per questo cliente"
                },
                style = Testi.piccolo, color = c.tenue,
            )
        }
        if (regole.tariffaFissa != null) {
            Text(
                "${Numeri.scrivi(regole.tariffaFissa)} €/h", style = Testi.forte, color = c.testo,
                modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(c.superficie2).padding(horizontal = 12.dp, vertical = 10.dp),
            )
        } else {
            CampoTesto(
                stato.tariffa, { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) { stato.tariffa = t; stato.tariffaToccata = true; stato.errori = stato.errori - "tariffa" } },
                null, Modifier.width(132.dp), segnaposto = "0", tastiera = KeyboardType.Decimal, suffisso = "€/h", stile = Testi.forteGrande,
            )
        }
    }
    stato.errori["tariffa"]?.let { Text(it, style = Testi.secondario, color = c.rossoTesto, modifier = Modifier.padding(horizontal = 4.dp)) }
}

// ============================================================================ Passo 3

@Composable
private fun ColumnScope.PassoLavoro(
    stato: ModuloStato,
    ticketAttivo: Boolean,
    vista: Vista?,
    onScatta: () -> Unit,
    onGalleria: () -> Unit,
    dati: Dati,
) {
    val c = W.colori
    val ctx = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            listOf(stato.cliente, Numeri.ore(listOf(stato.oreLavoro, stato.oreExtra, stato.oreViaggio).sumOf { Numeri.leggi(it) ?: 0.0 }),
                "${stato.km.ifBlank { "0" }} km").joinToString(" · "),
            style = Testi.secondarioGrande, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        Text("Il lavoro", style = Testi.titoloPagina, color = c.testo)
    }
    CampoTesto(
        stato.descrizione, { stato.descrizione = it; stato.errori = stato.errori - "descrizione" }, "Cosa hai fatto",
        righe = 5, errore = stato.errori["descrizione"],
    )

    Text("Spese", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo, modifier = Modifier.padding(top = 6.dp))
    val remote = stato.base.foto
    val inAttesa = vista?.fotoInAttesa.orEmpty()
    val nessuna = remote.isEmpty() && inAttesa.isEmpty() && stato.fotoNuove.isEmpty()
    if (nessuna) {
        Column(
            Modifier.fillMaxWidth().height(96.dp).clip(RoundedCornerShape(20.dp)).background(c.scheda)
                .bordoTratteggiato(c.bordoCampo, 20.dp).clickable(onClick = onScatta).bersaglio("scontrino"),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(Icone.fotocamera, null, tint = c.testo, modifier = Modifier.size(30.dp))
            Spacer(Modifier.height(6.dp))
            Text("Fotografa lo scontrino", style = Testi.pulsanteSecondario, color = c.testo)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pillola("Dalla galleria", false, onGalleria, Modifier.weight(1f), altezza = 44.dp)
            if (!stato.speseAperte) Pillola("Spesa senza scontrino", false, { stato.speseAperte = true }, Modifier.weight(1.3f), altezza = 44.dp)
        }
    } else {
        Row(Modifier.horizontalScroll(rememberScrollState()).bersaglio("scontrino"), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            remote.forEach { f ->
                RiquadroFoto(Immagini.fotoLocale(ctx, f.id), onApri = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(f.url))) },
                    onTogli = { dati.togliFoto(stato.base.idLocale, f, null) })
            }
            inAttesa.forEach { f -> RiquadroFoto(f, null, onTogli = { dati.togliFoto(stato.base.idLocale, null, f) }) }
            stato.fotoNuove.forEach { f -> RiquadroFoto(f, null, onTogli = { stato.fotoNuove.remove(f); if (!dati.esempio) f.delete() }) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pillola("+ Un altro scontrino", false, onScatta, Modifier.weight(1.3f), altezza = 44.dp)
            Pillola("Dalla galleria", false, onGalleria, Modifier.weight(1f), altezza = 44.dp)
        }
    }
    if (stato.speseAperte || !nessuna) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CampoTesto(stato.noteSpese, { stato.noteSpese = it }, "Di cosa", Modifier.weight(1.4f), segnaposto = "Pranzo, pedaggio…")
            CampoTesto(
                stato.spese, { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) { stato.spese = t; stato.errori = stato.errori - "spese" } },
                "Importo", Modifier.weight(1f), segnaposto = "0", tastiera = KeyboardType.Decimal, suffisso = "€", errore = stato.errori["spese"],
            )
        }
    }

    // Le cose che servono ogni tanto: chiuse finché non servono.
    Row(Modifier.padding(top = 4.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!stato.luogoAperto) Pillola("+ Luogo", false, { stato.luogoAperto = true }, altezza = 44.dp)
        if (!stato.notaAperta) Pillola("+ Una nota per te", false, { stato.notaAperta = true }, altezza = 44.dp)
    }
    if (stato.luogoAperto) CampoTesto(stato.luogo, { stato.luogo = it }, "Luogo")
    if (ticketAttivo || stato.ticket.isNotBlank()) CampoTesto(stato.ticket, { stato.ticket = it }, "Ticket")
    if (stato.notaAperta) CampoTesto(stato.noteInterne, { stato.noteInterne = it }, "Nota per te, non va al cliente", righe = 2)
}

@Composable
private fun RiquadroFoto(file: File?, onApri: (() -> Unit)?, onTogli: () -> Unit) {
    val c = W.colori
    Box(
        Modifier.size(84.dp).clip(RoundedCornerShape(14.dp)).background(c.superficie2)
            .border(1.dp, c.bordoScheda, RoundedCornerShape(14.dp))
            .let { if (onApri != null) it.clickable(onClick = onApri) else it },
        contentAlignment = Alignment.Center,
    ) {
        val bitmap = file?.let { f ->
            produceState<Bitmap?>(null, f.path) { value = withContext(Dispatchers.IO) { if (f.exists()) Immagini.miniatura(f, 360) else null } }.value
        }
        if (bitmap != null) Image(bitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Icon(Icone.scontrino, null, tint = c.tenue, modifier = Modifier.size(28.dp))
        Box(
            Modifier.align(Alignment.TopEnd).padding(4.dp).size(28.dp).clip(CircleShape).background(c.testo.copy(alpha = 0.7f))
                .clickable(onClick = onTogli).semantics { contentDescription = "Togli lo scontrino" },
            contentAlignment = Alignment.Center,
        ) { Icon(Icone.chiudi, null, tint = c.scheda, modifier = Modifier.size(14.dp)) }
    }
}

// ============================================================================ Riepilogo

@Composable
private fun ColumnScope.PassoRiepilogo(
    stato: ModuloStato,
    vista: Vista?,
    conto: eu.stgm.wisper.rapportino.Conto,
    regole: eu.stgm.wisper.rapportino.Regole,
    onCambia: (Int) -> Unit,
) {
    val c = W.colori
    val ctx = LocalContext.current
    val bloccato = stato.base.bloccato
    val r = stato.rapportino()

    if (!stato.nuovo) Scheda { Passi(stato.base.stato) }
    vista?.errore?.takeIf { it.isNotBlank() }?.let {
        Text("Il foglio non l'ha accettato: $it", style = Testi.secondario, color = c.rossoTesto)
    }
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(dataLungaIt(stato.data), style = Testi.secondarioGrande, color = c.tenue)
        Text(if (stato.base.id.isNotBlank()) stato.base.id else "Riepilogo", style = Testi.titoloPagina, color = c.testo)
    }

    Scheda(verticale = 4.dp, spazio = 0.dp) {
        // La commessa col suo codice (26ST047), non con la descrizione: come la conosce lo studio.
        RigaRiepilogo(r.cliente.ifBlank { "Manca il cliente" }, r.idCommessa.ifBlank { r.codiceProposto }.ifBlank { r.commessa }.ifBlank { "Senza commessa" }, bloccato) { onCambia(1) }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
        RigaRiepilogo(
            listOf("${Numeri.ore(r.oreLavoro)} di lavoro", r.oreViaggio.takeIf { it > 0 }?.let { "${Numeri.ore(it)} di viaggio" },
                r.oreExtra.takeIf { it > 0 }?.let { "${Numeri.ore(it)} extra" }).filterNotNull().joinToString(" · "),
            "${Numeri.scrivi(r.km)} km", bloccato,
        ) { onCambia(2) }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
        val scontrini = stato.base.foto.size + (vista?.fotoInAttesa?.size ?: 0) + stato.fotoNuove.size
        RigaRiepilogo(
            r.descrizione.ifBlank { "Manca il lavoro svolto" },
            if (r.spese > 0 || scontrini > 0) "Spese ${Numeri.euro(r.spese)}" + (if (scontrini > 0) " · $scontrini " + (if (scontrini == 1) "scontrino" else "scontrini") else "") else "Nessuna spesa",
            bloccato,
        ) { onCambia(3) }
    }

    Scheda(verticale = 16.dp, spazio = 8.dp) {
        val orePagate = r.oreLavoro + r.oreExtra + if (conto.pagaViaggio || regole.pagaViaggio) r.oreViaggio else 0.0
        RigaConto("Ore · ${Numeri.ore(orePagate)} × ${Numeri.scrivi(conto.tariffa)} €", Numeri.euro(conto.compensoOre))
        RigaConto("Km · ${Numeri.scrivi(r.km)} × ${Numeri.scrivi(conto.euroKm)} €", Numeri.euro(conto.rimborsoKm))
        RigaConto("Spese", Numeri.euro(r.spese))
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.bordoScheda))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text("Totale", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
            EuroAnimati(conto.totale, Testi.totale)
        }
    }

    if (bloccato) {
        val quando = stato.base.firmatoIl.takeIf { it.isNotBlank() }?.let {
            runCatching { LocalDateTime.parse(it).format(DateTimeFormatter.ofPattern("dd/MM 'alle' HH:mm")) }.getOrNull()
        }
        if (stato.base.firmatario.isNotBlank() || vista?.firmaInAttesa != null) {
            Scheda {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icone.firma, null, tint = c.firmatoTesto, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "Firmato" + (stato.base.firmatario.takeIf { it.isNotBlank() }?.let { " da $it" } ?: "") + (quando?.let { " il $it" } ?: ""),
                        style = Testi.forte, color = c.testo,
                    )
                }
                vista?.firmaInAttesa?.let { f ->
                    val bmp = produceState<Bitmap?>(null, f.path) { value = withContext(Dispatchers.IO) { Immagini.miniatura(f, 600) } }.value
                    if (bmp != null) Image(bmp.asImageBitmap(), null, Modifier.fillMaxWidth().height(96.dp).clip(RoundedCornerShape(12.dp)).background(androidx.compose.ui.graphics.Color.White), contentScale = ContentScale.Fit)
                }
            }
        }
        if (stato.base.foto.isNotEmpty() || stato.fotoNuove.isNotEmpty()) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                stato.base.foto.forEach { f -> RiquadroFoto(Immagini.fotoLocale(ctx, f.id), { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(f.url))) }, {}) }
                stato.fotoNuove.forEach { f -> RiquadroFoto(f, null, {}) }
            }
        }
    }
}

@Composable
private fun RigaRiepilogo(titolo: String, sotto: String, bloccato: Boolean, onCambia: () -> Unit) {
    val c = W.colori
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(titolo, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (!bloccato) PulsanteTesto("Cambia", onCambia)
    }
}
