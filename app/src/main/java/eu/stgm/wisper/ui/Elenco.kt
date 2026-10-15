package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Archivio
import eu.stgm.wisper.Vista
import eu.stgm.wisper.rapportino.CodaInvii
import eu.stgm.wisper.rapportino.Numeri
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private val IT = Locale.ITALY

/** "ottobre 2026" -> "Ottobre 2026" */
fun nomeMese(m: YearMonth): String =
    m.format(DateTimeFormatter.ofPattern("LLLL yyyy", IT)).replaceFirstChar { it.uppercase() }

/**
 * La schermata d'apertura: i rapportini del mese, con i totali.
 *
 * E' quello che mancava al primo Wisper, che sapeva solo compilarne di nuovi:
 * qui si vede cosa si e' fatto, si riapre un rapportino per correggerlo o
 * aggiungere la foto di uno scontrino, e si vede a colpo d'occhio cosa e'
 * ancora da far firmare.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SchermataElenco(
    archivio: Archivio,
    onApri: (String) -> Unit,
    onNuovo: () -> Unit,
    onImpostazioni: () -> Unit,
) {
    val viste by archivio.viste.collectAsStateWithLifecycle()
    val aggiornamento by archivio.aggiornamento.collectAsStateWithLifecycle()
    val operazioni by archivio.operazioni.collectAsStateWithLifecycle()

    var meseTesto by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    val mese = YearMonth.parse(meseTesto)
    var filtroCliente by rememberSaveable { mutableStateOf<String?>(null) }

    // I mesi oltre gli ultimi sei non sono sul telefono: si chiedono al foglio
    // quando li si sfoglia.
    LaunchedEffect(meseTesto) {
        if (mese.isBefore(YearMonth.now().minusMonths(5))) archivio.aggiorna(mese)
    }

    val delMese = viste.filter { YearMonth.from(it.rapportino.data) == mese }
    val clientiDelMese = delMese.map { it.rapportino.cliente }.filter { it.isNotBlank() }.distinct().sorted()
    val mostrate = delMese.filter { filtroCliente == null || it.rapportino.cliente == filtroCliente }

    Scaffold(
        containerColor = Nero,
        topBar = {
            TopAppBar(
                title = { Text("Rapportini", style = MaterialTheme.typography.titleLarge) },
                actions = {
                    if (aggiornamento.inCorso) {
                        CircularProgressIndicator(Modifier.size(22.dp).padding(end = 2.dp), strokeWidth = 2.dp, color = Giallo)
                        Spacer(Modifier.width(14.dp))
                    } else {
                        IconButton(onClick = { archivio.aggiorna() }) { Icon(Icons.Default.Refresh, "Aggiorna dal foglio") }
                    }
                    IconButton(onClick = onImpostazioni) { Icon(Icons.Default.Settings, "Impostazioni") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Nero),
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNuovo,
                icon = { Icon(Icons.Default.Add, null) },
                text = { Text("Nuovo rapportino") },
                containerColor = Giallo,
                contentColor = Nero,
            )
        },
    ) { margini ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(margini),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    IconButton(onClick = { meseTesto = mese.minusMonths(1).toString(); filtroCliente = null }) {
                        Icon(Icons.Default.KeyboardArrowLeft, "Mese prima")
                    }
                    Text(
                        nomeMese(mese),
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                    IconButton(onClick = { meseTesto = mese.plusMonths(1).toString(); filtroCliente = null }) {
                        Icon(Icons.Default.KeyboardArrowRight, "Mese dopo")
                    }
                }
            }

            item { AvvisiInvio(archivio, operazioni, aggiornamento) }

            item { Totali(mostrate) }

            if (clientiDelMese.size > 1) {
                item {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilterChip(
                            selected = filtroCliente == null,
                            onClick = { filtroCliente = null },
                            label = { Text("Tutti") },
                            colors = coloriChip(),
                        )
                        clientiDelMese.forEach { c ->
                            FilterChip(
                                selected = filtroCliente == c,
                                onClick = { filtroCliente = if (filtroCliente == c) null else c },
                                label = { Text(c) },
                                colors = coloriChip(),
                            )
                        }
                    }
                }
            }

            if (mostrate.isEmpty()) {
                item {
                    Text(
                        if (aggiornamento.inCorso) "Leggo il foglio…"
                        else "Nessun rapportino a ${nomeMese(mese).substringBefore(' ').lowercase()}.",
                        color = Smorzato,
                        modifier = Modifier.fillMaxWidth().padding(top = 40.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }

            items(mostrate, key = { it.rapportino.idLocale }) { v ->
                RigaRapportino(v) { onApri(v.rapportino.idLocale) }
            }
        }
    }
}

@Composable
private fun coloriChip() = FilterChipDefaults.filterChipColors(
    selectedContainerColor = Giallo.copy(alpha = 0.18f),
    selectedLabelColor = Giallo,
    labelColor = Smorzato,
)

/**
 * Cosa c'e' sul telefono che il foglio non ha ancora. Detto chiaro, perche'
 * finche' un rapportino non e' sul foglio per l'ufficio quella giornata non
 * esiste; e quando il foglio rifiuta qualcosa, qui si decide cosa farne.
 */
@Composable
private fun AvvisiInvio(
    archivio: Archivio,
    operazioni: List<CodaInvii.Operazione>,
    aggiornamento: Archivio.Aggiornamento,
) {
    val rifiutata = operazioni.firstOrNull { it.rifiutata }
    val inAttesa = operazioni.count { !it.rifiutata }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (rifiutata != null) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Rosso.copy(alpha = 0.12f))
                    .border(1.dp, Rosso.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
                    .padding(14.dp),
            ) {
                Text("Il foglio ha rifiutato una modifica", color = Rosso, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text(rifiutata.errore, color = Bianco)
                Text(
                    "Finché non decidi, le modifiche dopo questa restano sul telefono.",
                    color = Smorzato, fontSize = 13.sp,
                )
                Row {
                    TextButton(onClick = { archivio.riprova(rifiutata.idOp) }) { Text("Riprova", color = Giallo) }
                    TextButton(onClick = { archivio.scarta(rifiutata.idOp) }) { Text("Scarta la modifica", color = Rosso) }
                }
            }
        }
        if (inAttesa > 0) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(Giallo))
                Spacer(Modifier.width(8.dp))
                Text(
                    if (inAttesa == 1) "1 modifica è sul telefono e parte appena c'è rete"
                    else "$inAttesa modifiche sono sul telefono e partono appena c'è rete",
                    color = Giallo, fontSize = 14.sp,
                )
            }
        }
        if (aggiornamento.errore.isNotBlank()) {
            Text(aggiornamento.errore, color = Smorzato, fontSize = 13.sp)
        }
    }
}

/** Ore, km e soldi del mese (o del cliente scelto): il numero che serve per la fattura. */
@Composable
private fun Totali(viste: List<Vista>) {
    val ore = viste.sumOf { it.rapportino.oreTotali }
    val km = viste.sumOf { it.rapportino.km }
    val totale = viste.sumOf { it.conto?.totale ?: 0.0 }
    Scheda {
        Row(Modifier.fillMaxWidth()) {
            Totale("Ore", Numeri.scrivi(ore), Modifier.weight(1f))
            Totale("Km", Numeri.scrivi(km), Modifier.weight(1f))
            Totale("Totale", Numeri.euro(totale), Modifier.weight(1.6f), forte = true)
        }
    }
}

@Composable
private fun Totale(etichetta: String, valore: String, modifier: Modifier, forte: Boolean = false) {
    Column(modifier) {
        Text(etichetta.uppercase(), color = Smorzato, style = MaterialTheme.typography.labelMedium)
        Text(
            valore,
            color = if (forte) Giallo else Bianco,
            fontSize = if (forte) 22.sp else 20.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
    }
}

@Composable
private fun RigaRapportino(v: Vista, onClick: () -> Unit) {
    val r = v.rapportino
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Carta)
            .border(1.dp, if (v.errore.isNotBlank()) Rosso.copy(alpha = 0.5f) else Bordo, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(Modifier.width(44.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(r.data.dayOfMonth.toString(), fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Bianco)
            Text(
                r.data.dayOfWeek.getDisplayName(TextStyle.SHORT, IT),
                fontSize = 12.sp, color = Smorzato,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(r.cliente.ifBlank { "—" }, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (r.commessa.isNotBlank()) {
                Text(r.commessa, color = Smorzato, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (r.descrizione.isNotBlank()) {
                Text(r.descrizione, color = Bianco.copy(alpha = 0.8f), fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ChipStato(r.stato)
                val foto = r.foto.size + v.fotoInAttesa.size
                if (foto > 0) Text("$foto foto", color = Smorzato, fontSize = 12.sp)
                if (v.errore.isNotBlank()) Text("rifiutato", color = Rosso, fontSize = 12.sp)
                else if (v.inCoda) Text("sul telefono", color = Giallo, fontSize = 12.sp)
            }
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(v.conto?.let { Numeri.euro(it.totale) } ?: "", fontWeight = FontWeight.SemiBold, color = Bianco)
            Text(Numeri.ore(r.oreTotali), color = Smorzato, fontSize = 14.sp)
            if (r.km > 0) Text("${Numeri.scrivi(r.km)} km", color = Smorzato, fontSize = 13.sp)
        }
    }
}

/** "giovedì 15 ottobre 2026" */
fun dataLunga(d: LocalDate): String =
    d.format(DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", IT))
