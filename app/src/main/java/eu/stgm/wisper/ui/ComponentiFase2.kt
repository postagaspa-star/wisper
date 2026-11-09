package eu.stgm.wisper.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.StatoPreventivo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * I pezzi comuni delle schermate della fase 2 (preventivi, attività, calendario),
 * nello stile di ComponentiUfficio.kt e del prototipo docs/prototipo/Gestionale-fase2.html.
 */

internal val ITALIA: Locale = Locale.ITALY

/** La riga calma degli elenchi vuoti. */
@Composable
internal fun RigaCalma(testo: String) {
    Text(
        testo, style = Testi.secondarioGrande, color = W.colori.tenue, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp, horizontal = 12.dp),
    )
}

/** Una pillola colorata con una parola (lo stato, "Alta", "Facoltativa"). */
@Composable
internal fun Pillolina(testo: String, colore: Color, fondo: Color, modifier: Modifier = Modifier) {
    Text(
        testo, style = Testi.pillola.copy(fontWeight = FontWeight.ExtraBold), color = colore, maxLines = 1,
        modifier = modifier.clip(RoundedCornerShape(50)).background(fondo).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

/** Lo stato del preventivo a parola (§13.3): Bozza grigia, Inviato blu, Accettato verde, Scaduto ambra, Rifiutato rosso tenue. */
@Composable
internal fun ParolaStatoPreventivo(stato: String, modifier: Modifier = Modifier) {
    val c = W.colori
    val (testo, fondo) = when (stato.uppercase()) {
        StatoPreventivo.INVIATO -> c.inviatoTesto to c.inviatoFondo
        StatoPreventivo.ACCETTATO -> c.firmatoTesto to c.firmatoFondo
        StatoPreventivo.SCADUTO -> c.gialloTesto to c.gialloTenue
        StatoPreventivo.RIFIUTATO -> c.rossoTesto to c.rossoTenue
        else -> c.testo2 to c.superficie2
    }
    Pillolina(StatoPreventivo.parola(stato), testo, fondo, modifier)
}

/** Il numero del preventivo in una pillola grigia: "PR/2026/012 · rev. 1". */
@Composable
internal fun PillolaNumero(testo: String, modifier: Modifier = Modifier) {
    val c = W.colori
    Pillolina(testo, c.testo2, c.superficie2, modifier)
}

/**
 * Una scelta fra poche, come nel prototipo (.scelta-ruolo): il pallino (o la
 * casella, per le scelte multiple), il titolo e una riga sotto.
 */
@Composable
internal fun SceltaGrande(titolo: String, scelto: Boolean, onClick: () -> Unit, sotto: String? = null, casella: Boolean = false, modifier: Modifier = Modifier) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(16.dp)).background(if (scelto) c.scelta else c.scheda)
            .border(if (scelto) 2.dp else 1.5.dp, if (scelto) c.testo else c.bordoScheda, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick).semantics { role = if (casella) Role.Checkbox else Role.RadioButton; selected = scelto }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val forma = if (casella) RoundedCornerShape(6.dp) else CircleShape
        Box(
            Modifier.size(22.dp).clip(forma).background(if (scelto && casella) c.testo else Color.Transparent)
                .border(2.dp, if (scelto) c.testo else c.bordoCampo, forma),
            contentAlignment = Alignment.Center,
        ) {
            if (scelto) {
                if (casella) Icon(Icone.spunta, null, tint = c.foglio, modifier = Modifier.size(14.dp))
                else Box(Modifier.size(10.dp).clip(CircleShape).background(c.testo))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(titolo, style = Testi.forte, color = c.testo)
            if (sotto != null) Text(sotto, style = Testi.secondario, color = c.tenue)
        }
    }
}

/** Un campo che si sceglie da un elenco: il valore, e "Scegli" o "Cambia". */
@Composable
internal fun CampoDaScegliere(
    etichetta: String,
    valore: String,
    vuoto: Boolean,
    onClick: () -> Unit,
    errore: String? = null,
    vuotoGiallo: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val c = W.colori
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(16.dp)).background(c.foglio)
                .border(1.5.dp, if (errore != null) c.rossoPieno else c.bordoCampo, RoundedCornerShape(16.dp))
                .clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp)
                .semantics(mergeDescendants = true) { contentDescription = "$etichetta: $valore" },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                valore, style = Testi.testoGrande,
                color = when { vuoto && vuotoGiallo -> c.gialloTesto; vuoto -> c.moltoTenue; else -> c.testo },
                modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            Text(if (vuoto) "Scegli" else "Cambia", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.collegamento)
        }
        if (errore != null) Text(errore, style = Testi.secondario, color = c.rossoTesto)
    }
}

/** Una data o un'ora da toccare (si sceglie, non si scrive); la × la toglie se si può togliere. */
@Composable
internal fun CampoQuando(
    etichetta: String,
    valore: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onTogli: (() -> Unit)? = null,
    errore: String? = null,
    icona: androidx.compose.ui.graphics.vector.ImageVector = Icone.calendario,
) {
    val c = W.colori
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 54.dp).clip(RoundedCornerShape(16.dp)).background(c.foglio)
                .border(1.5.dp, if (errore != null) c.rossoPieno else c.bordoCampo, RoundedCornerShape(16.dp))
                .clickable(onClick = onClick).padding(start = 16.dp, end = 6.dp)
                .semantics(mergeDescendants = true) { contentDescription = "$etichetta: ${valore ?: "nessuna"}" },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(valore ?: "—", style = Testi.testoGrande, color = if (valore != null) c.testo else c.moltoTenue, modifier = Modifier.weight(1f), maxLines = 1)
            if (valore != null && onTogli != null) {
                Box(
                    Modifier.size(44.dp).clip(CircleShape).clickable(onClick = onTogli).semantics { contentDescription = "Togli $etichetta" },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icone.chiudi, null, tint = c.tenue, modifier = Modifier.size(16.dp)) }
            } else {
                Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { Icon(icona, null, tint = c.tenue, modifier = Modifier.size(18.dp)) }
            }
        }
        if (errore != null) Text(errore, style = Testi.secondario, color = c.rossoTesto)
    }
}

/** Il calendario di Android in una finestra: il giorno si tocca. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FinestraGiorno(iniziale: LocalDate?, onScelto: (LocalDate) -> Unit, onChiudi: () -> Unit) {
    val c = W.colori
    val stato = rememberDatePickerState(initialSelectedDateMillis = (iniziale ?: LocalDate.now()).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
    DatePickerDialog(
        onDismissRequest = onChiudi,
        confirmButton = {
            PulsanteTesto("Fatto", {
                stato.selectedDateMillis?.let { onScelto(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                onChiudi()
            })
        },
        dismissButton = { PulsanteTesto("Annulla", onChiudi, colore = c.testo) },
    ) {
        DatePicker(stato, title = { Text("Scegli il giorno", style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.padding(start = 24.dp, top = 16.dp)) }, showModeToggle = false)
    }
}

/** L'orologio di Android in una finestra, a 24 ore. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FinestraOra(iniziale: LocalTime, titolo: String, onScelta: (LocalTime) -> Unit, onChiudi: () -> Unit) {
    val c = W.colori
    val stato = rememberTimePickerState(initialHour = iniziale.hour, initialMinute = iniziale.minute, is24Hour = true)
    Dialog(onDismissRequest = onChiudi) {
        Column(
            Modifier.clip(RoundedCornerShape(28.dp)).background(c.foglio).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(titolo, style = Testi.titoloSezione, color = c.testo, modifier = Modifier.fillMaxWidth())
            TimePicker(stato)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                PulsanteTesto("Annulla", onChiudi, colore = c.testo)
                PulsanteTesto("Fatto", { onScelta(LocalTime.of(stato.hour, stato.minute)); onChiudi() })
            }
        }
    }
}

/** I clienti dal foglio dal basso, con la ricerca. */
@Composable
internal fun FoglioSceltaCliente(ana: Anagrafiche, scelto: String, onScelto: (Cliente?) -> Unit, onChiudi: () -> Unit, conNessuno: Boolean = false) {
    val c = W.colori
    var cerca by remember { mutableStateOf("") }
    val t = Anagrafiche.normalizza(cerca)
    val lista = ana.clienti
        .filter { cl -> t.isEmpty() || Anagrafiche.normalizza((listOf(cl.nome, cl.email, cl.partitaIva, cl.citta) + cl.alias).joinToString(" ")).contains(t) }
        .sortedBy { it.nome.lowercase(ITALIA) }
    FoglioDalBasso(onChiudi) {
        Text("Cliente", style = Testi.titoloScheda, color = c.testo)
        CampoCerca(cerca, { cerca = it }, "Nome, città, partita IVA")
        Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            if (conNessuno) {
                RigaVoce("Nessuno", freccia = false, fine = if (scelto.isBlank()) ({ Icon(Icone.spunta, "Scelto", tint = c.testo, modifier = Modifier.size(20.dp)) }) else null, onClick = { onScelto(null) })
                if (lista.isNotEmpty()) LineaElenco()
            }
            if (lista.isEmpty()) RigaCalma("Nessun cliente")
            lista.forEachIndexed { i, cl ->
                RigaVoce(
                    cl.nome, sotto = cl.luogo.ifBlank { null }, freccia = false,
                    inizio = { Iniziali(cl.nome, dimensione = 44.dp) },
                    fine = if (cl.id == scelto) ({ Icon(Icone.spunta, "Scelto", tint = c.testo, modifier = Modifier.size(20.dp)) }) else null,
                    onClick = { onScelto(cl) },
                )
                if (i < lista.lastIndex) LineaElenco()
            }
        }
    }
}

/** Il messaggio di un errore: già in italiano da Dati; una frase di riserva se manca. */
internal fun spiegaErrore2(e: Throwable, altrimenti: String): String = e.message?.takeIf { it.isNotBlank() } ?: altrimenti

/** Il "serve conferma" del server (§13.5, §13.7), anche dentro l'errore di Dati. */
internal fun daConfermare(e: Throwable): PonteServer.DaConfermare? = e as? PonteServer.DaConfermare ?: e.cause as? PonteServer.DaConfermare

/**
 * Un numero come lo scrive una persona: "1.250" sono milleduecentocinquanta,
 * "6,5" sei e mezzo.
 */
internal fun numeroScritto(t: String): Double? {
    val s = t.trim().replace(" ", "").removeSuffix("€").removeSuffix("%")
    if (s.isEmpty()) return null
    if (Regex("""^\d{1,3}(\.\d{3})+(,\d+)?$""").matches(s)) return s.replace(".", "").replace(',', '.').toDoubleOrNull()
    return Numeri.leggi(s)
}

internal fun erroreDelNumero(t: String): String? = if (t.isNotBlank() && numeroScritto(t) == null) "Non è un numero" else null

/** "2 ottobre", con l'anno solo se non è quest'anno. */
internal fun giornoBreve(d: LocalDate): String =
    d.format(DateTimeFormatter.ofPattern(if (d.year == LocalDate.now().year) "d MMMM" else "d MMMM yyyy", ITALIA))

/** "lunedì 27 ottobre". */
internal fun giornoEsteso(d: LocalDate): String = d.format(DateTimeFormatter.ofPattern("EEEE d MMMM", ITALIA))

internal fun ora(t: LocalTime): String = t.format(DateTimeFormatter.ofPattern("H:mm"))

/**
 * Un file del server (un allegato) aperto con l'app del telefono: si copia nella
 * cartella dei PDF, l'unica che si può passare alle altre app.
 */
internal suspend fun apriFileDelServer(ctx: Context, dati: Dati, id: String, nome: String, mime: String): String? {
    val (byte, tipo) = try {
        dati.file(id) ?: return "Il file non c'è più"
    } catch (e: Exception) {
        return spiegaErrore2(e, "Non riesco a scaricare il file: riprova")
    }
    val f = withContext(Dispatchers.IO) {
        val cartella = File(ctx.cacheDir, "pdf").apply { mkdirs() }
        File(cartella, Stampa.pulisci(nome).ifBlank { "allegato" }).apply { writeBytes(byte) }
    }
    if (!Stampa.apri(ctx, f, mime.ifBlank { tipo })) return "Sul telefono non c'è un'app per aprire questo file"
    return null
}

/** La barra di avanzamento sottile dei compiti a passi (come il rapportino). */
@Composable
internal fun BarraPassiCompito(passo: Int, di: Int, modifier: Modifier = Modifier) {
    val c = W.colori
    Box(modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(c.superficie2)) {
        Box(Modifier.fillMaxWidth(passo.toFloat() / di).height(6.dp).clip(RoundedCornerShape(3.dp)).background(c.testo))
    }
}

/** Un cerchio piccolo con le iniziali di chi fa l'attività, o la pillola "libera". */
@Composable
internal fun ChiFa(iniziali: String?) {
    if (iniziali.isNullOrBlank()) {
        val c = W.colori
        Pillolina("libera", c.testo2, c.superficie2)
    } else CerchioPersona(iniziali, 30.dp)
}

/** Il pulsante col bordo, piccolo (alto 48), per le azioni dentro le righe. */
@Composable
internal fun PulsanteRiga(testo: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    PulsanteBordo(testo, onClick, modifier, altezza = 48.dp, stile = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold))
}

/** Un'etichetta di sezione colorata (Scadute in rosso tenue). */
@Composable
internal fun EtichettaColorata(testo: String, colore: Color) {
    Text(testo.uppercase(ITALIA), style = Testi.etichetta, color = colore)
}

/** Uno spazio largo [dp]: per le righe che si allineano. */
@Composable
internal fun Largo(dp: Int) = Box(Modifier.width(dp.dp))
