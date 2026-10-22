@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.ContiTicket
import eu.stgm.wisper.rapportino.DocArchivio
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Scadenza
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.Ticket
import eu.stgm.wisper.rapportino.VoceCronologia
import eu.stgm.wisper.rapportino.VoceStorico
import eu.stgm.wisper.rapportino.istanteLocale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/*
 * I pezzi comuni delle schermate della fase 5 (fase5.md §12): le parole di stato
 * coi loro colori, le righe di ticket, documenti, scadenze e storico, la
 * cronologia, aprire un file o un collegamento.
 */

/** Testo e fondo di un colore della fase 5 (ColoreFase5). */
@Composable
internal fun coloriFase5(colore: String): Pair<Color, Color> {
    val c = W.colori
    return when (colore) {
        ColoreFase5.ROSSO -> c.rossoTesto to c.rossoTenue
        ColoreFase5.AMBRA -> c.ambraTesto to c.ambraFondo
        ColoreFase5.GIALLO -> c.gialloTesto to c.gialloTenue
        ColoreFase5.BLU -> c.inviatoTesto to c.inviatoFondo
        ColoreFase5.VERDE -> c.firmatoTesto to c.firmatoFondo
        else -> c.fatturatoTesto to c.fatturatoFondo
    }
}

/** Una parola di stato col suo colore (sempre insieme, §12). [colore] se non è quello della parola. */
@Composable
internal fun Parola5(parola: String, modifier: Modifier = Modifier, colore: String? = null) {
    if (parola.isBlank()) return
    val (testo, fondo) = coloriFase5(colore ?: ColoreFase5.di(parola))
    Pillolina(parola, testo, fondo, modifier)
}

/** La pillola grigia "Parte appena c'è rete": quella cosa è ancora sul telefono. */
@Composable
internal fun PillolaInCoda() = Pillolina("Parte appena c'è rete", W.colori.fatturatoTesto, W.colori.fatturatoFondo)

/** Il quadratino con l'icona a sinistra di una riga, nel colore della parola. */
@Composable
internal fun IconaColorata(icona: ImageVector, colore: String) {
    val (testo, fondo) = coloriFase5(colore)
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(fondo), contentAlignment = Alignment.Center) {
        Icon(icona, null, tint = testo, modifier = Modifier.size(20.dp))
    }
}

/** Il colore del riquadro della priorità: urgente rosso, alta ambra, il resto grigio. */
internal fun colorePriorita(p: String) = when (p) {
    "urgente" -> ColoreFase5.ROSSO
    "alta" -> ColoreFase5.AMBRA
    else -> ColoreFase5.GRIGIO
}

internal fun iconaTicket(t: Ticket) = when (t.tipo) {
    "programmato" -> Icone.calendario
    "assistenza" -> Icone.telefono
    else -> Icone.chiave
}

/** "aperto alle 8:40 · nessuno", "Marco Rossato · oggi alle 14:30", "previsto per … · da pianificare". */
internal fun sottoTicket(t: Ticket, oggi: LocalDate = LocalDate.now()): String {
    val pi = t.prossimoIntervento
    return when {
        t.stato == "chiuso" || t.stato == "annullato" ->
            "chiuso il " + (istanteLocale(t.chiusoIl)?.format(DateTimeFormatter.ofPattern("dd/MM")) ?: "") + (if (t.responsabile.isNotBlank()) " · ${t.responsabile}" else "")
        pi?.inizio != null -> listOf(pi.assegnata.ifBlank { t.responsabile }, ContiTicket.quando(pi.inizio.toString(), oggi)).filter { it.isNotBlank() }.joinToString(" · ")
        t.stato == "in_attesa" -> t.statoDettaglio.ifBlank { t.motivo }
        t.programmato && t.previstoIl.isNotBlank() -> "previsto per " + eu.stgm.wisper.rapportino.giornoParole(t.previstoIl)
        else -> {
            val a = istanteLocale(t.apertoIl)
            val quando = if (a == null) "" else if (a.toLocalDate() == oggi) "aperto alle " + ContiTicket.ora(t.apertoIl) else "aperto " + ContiTicket.quando(t.apertoIl, oggi)
            listOf(quando, t.responsabile.ifBlank { "nessuno" }).filter { it.isNotBlank() }.joinToString(" · ")
        }
    }
}

/** Una riga dell'elenco dei ticket (§12.1): icona nel colore della priorità, numero e titolo, cliente e impianto, chi e quando, le pillole. */
@Composable
internal fun RigaTicket(t: Ticket, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(onClick = onClick).semantics { role = Role.Button }.padding(vertical = 12.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconaColorata(iconaTicket(t), if (t.chiuso) ColoreFase5.GRIGIO else colorePriorita(t.priorita))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(listOf(t.numero, t.titolo).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val luogo = listOf(t.cliente, t.impianto).filter { it.isNotBlank() }.joinToString(" · ")
            if (luogo.isNotBlank()) Text(luogo, style = Testi.secondario, color = c.testo2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val sotto = sottoTicket(t)
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
            FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (t.chiuso) {
                    if (t.fatturazioneNome.isNotBlank()) Parola5(t.fatturazioneNome, colore = ColoreFase5.GRIGIO)
                    else Parola5(t.statoVisto)
                    t.fattura?.let { Parola5(it.etichetta, colore = ColoreFase5.BLU) }
                } else {
                    if (t.priorita != "normale") Parola5(t.prioritaNome, colore = colorePriorita(t.priorita))
                    Parola5(t.statoVisto)
                    if (t.inRitardo) Parola5("In ritardo")
                    if (t.inCoda) PillolaInCoda()
                }
            }
        }
        Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.padding(top = 10.dp).size(18.dp))
    }
}

/** L'icona dell'origine di un documento (§12.3): foglio, foto, cartella, o il tipo di collegamento. */
internal fun iconaDocumento(d: DocArchivio): ImageVector = when {
    d.collegamento && d.collegamentoTipo == "gdrive" -> Icone.triangolo
    d.collegamento && d.collegamentoTipo == "percorso" -> Icone.monitor
    d.collegamento && d.cartella -> Icone.cartella
    d.collegamento -> Icone.link
    d.mime.startsWith("image/") || d.categoria == "Foto" -> Icone.foto
    else -> Icone.documento
}

/** Una riga dell'archivio: icona, titolo, "categoria · legato a · rev. 2", le pillole. */
@Composable
internal fun RigaDocumento(d: DocArchivio, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 68.dp).clickable(onClick = onClick).semantics { role = Role.Button }.padding(vertical = 12.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconaColorata(iconaDocumento(d), if (d.collegamento) ColoreFase5.BLU else ColoreFase5.GRIGIO)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(d.titolo, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            // "Da classificare" lo dice già la pillola: nella riga sotto non si ripete.
            val sotto = listOf(if (d.daClassificare) "" else d.categoria, d.legatoA, d.revisione?.let { "rev. $it" } ?: if (d.cartella) "cartella" else "").filter { it.isNotBlank() }.joinToString(" · ")
            Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val pillole = buildList {
                if (d.daApprovare != null) add("Da approvare")
                d.scadenza?.statoVisto?.takeIf { it.startsWith("Scad") }?.let { add(it) }
                if (d.daClassificare) add("Da classificare")
                if (d.collegamento) add(d.collegamentoNome)
                if (d.statoVisto == "Respinta") add("Respinta")
            }
            if (pillole.isNotEmpty() || d.vede == "costi") FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                pillole.forEach { p -> Parola5(p, colore = if (p == d.collegamentoNome && d.collegamento) ColoreFase5.BLU else null) }
                if (d.vede == "costi") Icon(Icone.lucchetto, null, tint = c.tenue, modifier = Modifier.size(16.dp).semantics { contentDescription = "Solo chi vede i prezzi" })
            }
        }
        Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.padding(top = 10.dp).size(18.dp))
    }
}

/** La data grande a sinistra delle righe delle scadenze: "12" sopra "gen 27", nel colore dello stato. */
@Composable
internal fun DataGrande(iso: String, colore: String = ColoreFase5.GRIGIO, conAnno: Boolean = true) {
    val (testo, fondo) = coloriFase5(colore)
    val g = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull()
    Column(
        Modifier.width(56.dp).clip(RoundedCornerShape(12.dp)).background(fondo).padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(g?.dayOfMonth?.toString() ?: "", style = Testi.titoloSezione, color = testo)
        Text(
            g?.let { it.format(DateTimeFormatter.ofPattern(if (conAnno) "MMM yy" else "MMM", ITALIA)) }.orEmpty(),
            style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = testo, maxLines = 1,
        )
    }
}

/** Una riga delle scadenze (§12.3): data grande, titolo, "cliente · impianto · ogni 5 anni", la pillola. */
@Composable
internal fun RigaScadenza(s: Scadenza, onClick: (() -> Unit)?) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 68.dp).let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        DataGrande(s.data, ColoreFase5.di(s.statoVisto).takeIf { it != ColoreFase5.VERDE } ?: ColoreFase5.GRIGIO)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(s.titolo, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val sotto = listOf(s.cliente.ifBlank { "Studio" }, s.impianto, s.ogniParole).filter { it.isNotBlank() }.joinToString(" · ")
            Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
            FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Parola5(if (s.inCoda) "Fatta" else s.statoVisto)
                if (s.inCoda) PillolaInCoda()
            }
        }
        if (onClick != null) Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.size(18.dp))
    }
}

/** L'icona di una voce dello storico dell'impianto. */
internal fun iconaStorico(tipo: String): ImageVector = when (tipo) {
    "ticket" -> Icone.chiave
    "rapportino" -> Icone.firma
    "documento" -> Icone.documento
    "scadenza" -> Icone.bandiera
    "foto" -> Icone.foto
    "contratto" -> Icone.preventivo
    else -> Icone.lista
}

/** Una voce dello storico (§7.7): icona, titolo, dettaglio, data. */
@Composable
internal fun RigaStorico(v: VoceStorico, onClick: (() -> Unit)?) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 60.dp).let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconaColorata(iconaStorico(v.tipo), if (v.tipo == "rapportino" || v.tipo == "scadenza") ColoreFase5.VERDE else if (v.tipo == "documento") ColoreFase5.BLU else ColoreFase5.GRIGIO)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(v.titolo, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val sotto = listOf(eu.stgm.wisper.rapportino.dataIt(v.data), v.dettaglio).filter { it.isNotBlank() }.joinToString(" · ")
            Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (onClick != null) Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.size(18.dp))
    }
}

/** La cronologia (frasi pronte del server, coi tempi): "22/10 8:40 · Aperto da Manuel Gasparotto (telefono)". */
@Composable
internal fun Cronologia(voci: List<VoceCronologia>) {
    val c = W.colori
    Scheda(orizzontale = 18.dp, verticale = 10.dp, spazio = 0.dp) {
        if (voci.isEmpty()) RigaCalma("Nessuna voce.")
        voci.forEachIndexed { i, v ->
            if (i > 0) LineaElenco()
            Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(quandoCorto(v.quando), style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue, modifier = Modifier.width(78.dp))
                Text(v.testo, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Medium), color = c.testo2, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** "oggi 8:40", "ieri 17:05", "21/10 11:40". */
internal fun quandoCorto(istante: String, oggi: LocalDate = LocalDate.now()): String {
    val t = istanteLocale(istante) ?: return ""
    val ora = t.format(DateTimeFormatter.ofPattern("H:mm"))
    return when (t.toLocalDate()) {
        oggi -> "oggi $ora"
        oggi.minusDays(1) -> "ieri $ora"
        else -> t.format(DateTimeFormatter.ofPattern("dd/MM")) + " $ora"
    }
}

/** Un'etichetta "INTERVENTI · 2" e sotto il suo contenuto. */
@Composable
internal fun Sezione5(nome: String, numero: Int? = null, contenuto: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Etichetta(if (numero != null) "$nome · $numero" else nome)
        contenuto()
    }
}

/** La riga "Sfoglia OneDrive e Google Drive" con Non collegato (fase 8): mai un pulsante che finge. */
@Composable
internal fun RigaSfoglia(sotto: String? = "Intanto incolla il collegamento") {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(16.dp)).background(c.scheda)
            .border(1.dp, c.bordoScheda, RoundedCornerShape(16.dp)).padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconaColorata(Icone.cartella, ColoreFase5.GRIGIO)
        Column(Modifier.weight(1f)) {
            Text("Sfoglia OneDrive e Google Drive", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo2)
            if (sotto != null) Text(sotto, style = Testi.secondario, color = c.tenue)
        }
        PillolaNonCollegato()
    }
}

/** Le pillole a scelta singola che vanno a capo (le domande del nuovo ticket). */
@Composable
internal fun <T> SceltePillole(opzioni: List<Pair<T, String>>, scelta: T?, onScelta: (T) -> Unit, modifier: Modifier = Modifier) {
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        opzioni.forEach { (v, nome) -> Pillola(nome, v == scelta, { onScelta(v) }, altezza = 46.dp) }
    }
}

/** Una domanda del modulo: la domanda in grassetto e le sue risposte. */
@Composable
internal fun Domanda(testo: String, contenuto: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(testo, style = Testi.forteGrande, color = W.colori.testo)
        contenuto()
    }
}

/** Una miniatura di foto (84, come nel prototipo): dal telefono se c'è, se no il segnaposto. */
@Composable
internal fun MiniaturaFoto(file: File?, descrizione: String, onClick: () -> Unit) {
    val c = W.colori
    Box(
        Modifier.size(84.dp).clip(RoundedCornerShape(16.dp)).background(c.superficie2).border(1.dp, c.bordoScheda, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick).semantics { contentDescription = descrizione; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) {
        val bitmap = file?.let { f -> produceState<Bitmap?>(null, f.path) { value = withContext(Dispatchers.IO) { if (f.exists()) Immagini.miniatura(f, 240) else null } }.value }
        if (bitmap != null) Image(bitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Icon(Icone.foto, null, tint = c.tenue, modifier = Modifier.size(28.dp))
    }
}

/** Il riquadro tratteggiato "Fotografa" accanto alle foto. */
@Composable
internal fun RiquadroFotografa(testo: String = "Fotografa", onClick: () -> Unit) {
    val c = W.colori
    Column(
        Modifier.size(84.dp).clip(RoundedCornerShape(16.dp)).bordoTratteggiato(c.bordoCampo, 16.dp).clickable(onClick = onClick)
            .semantics { role = Role.Button }.padding(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icone.fotocamera, null, tint = c.testo2, modifier = Modifier.size(24.dp))
        Text(testo, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.testo2, maxLines = 1)
    }
}

/** I quattro riquadri in due colonne (Dashboard, statistiche): numero grande e parola. */
@Composable
internal fun RiquadriDue(voci: List<Triple<String, String, (() -> Unit)?>>, rossi: Set<Int> = emptySet()) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        voci.chunked(2).forEachIndexed { r, riga ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                riga.forEachIndexed { i, (valore, nome, onClick) ->
                    RiquadroNumero(valore, nome, Modifier.weight(1f), rosso = (r * 2 + i) in rossi, onClick = onClick)
                }
                if (riga.size == 1) Box(Modifier.weight(1f))
            }
        }
    }
}

@Composable
internal fun RiquadroNumero(valore: String, nome: String, modifier: Modifier = Modifier, rosso: Boolean = false, onClick: (() -> Unit)? = null) {
    val c = W.colori
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(if (rosso) c.rossoTenue else c.scheda)
            .border(1.dp, if (rosso) c.rossoTesto.copy(alpha = 0.35f) else c.bordoScheda, RoundedCornerShape(18.dp))
            .let { if (onClick != null) it.clickable(onClick = onClick).semantics { role = Role.Button } else it }
            .heightIn(min = 72.dp).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(valore, style = Testi.numeroGrande.copy(fontSize = Testi.titoloScheda.fontSize), color = if (rosso) c.rossoTesto else c.testo, maxLines = 1)
        Text(nome, style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = if (rosso) c.rossoTesto else c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Le permissioni della fase 5 per le schermate. */
@Composable
internal fun scriveTicket(): Boolean = LocalPermessi.current.modifica(Moduli.TICKET)

@Composable
internal fun scriveDocumenti(): Boolean = LocalPermessi.current.modifica(Moduli.DOCUMENTI)

// ---------------------------------------------------------------------------------- aprire, copiare

/** Apre un collegamento (OneDrive, Drive, un sito) con l'app che lo sa aprire. */
internal fun apriIndirizzo5(ctx: Context, url: String, avvisi: Avvisi) {
    try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        avvisi.mostra("Nessuna app lo apre: installa OneDrive, Google Drive o un browser")
    } catch (_: Exception) {
        avvisi.mostra("Questo collegamento non si apre dal telefono")
    }
}

/** Copia un testo (un percorso, un collegamento) negli appunti. */
internal fun copiaTesto(ctx: Context, etichetta: String, testo: String, avvisi: Avvisi) {
    runCatching { ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText(etichetta, testo)) }
    avvisi.mostra("Copiato")
}

/** Il testo negli appunti (per Incolla), o vuoto. */
internal fun testoAppunti(ctx: Context): String =
    runCatching { ctx.getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.coerceToText(ctx)?.toString() }.getOrNull().orEmpty()

/** Scarica (o prende dal telefono) il file e lo apre con l'app che lo legge. */
internal suspend fun apriFile5(ctx: Context, dati: Dati, idFile: String, nome: String, mime: String): String? {
    val f = dati.fase5.fileDaAprire(idFile, nome).getOrElse { return it.message ?: "Il file non si apre: riprova" }
    return if (Stampa.apri(ctx, f, mime.ifBlank { mimeDaNome(nome) })) null else "Sul telefono non c'è un'app che apre questo file"
}

internal fun mimeDaNome(nome: String): String = when (nome.substringAfterLast('.', "").lowercase()) {
    "pdf" -> "application/pdf"
    "jpg", "jpeg" -> "image/jpeg"
    "png" -> "image/png"
    "doc" -> "application/msword"
    "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    "xls" -> "application/vnd.ms-excel"
    "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    "dwg" -> "image/vnd.dwg"
    "zip" -> "application/zip"
    "txt" -> "text/plain"
    else -> "application/octet-stream"
}

/** Nome e byte di un file scelto dal telefono (al massimo [massimoMb]). */
internal fun leggiFileScelto(ctx: Context, uri: Uri, massimoMb: Int = 50): Triple<String, String, ByteArray> {
    val nome = runCatching {
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    }.getOrNull() ?: uri.lastPathSegment?.substringAfterLast('/') ?: "documento"
    val mime = ctx.contentResolver.getType(uri) ?: mimeDaNome(nome)
    val byte = ctx.contentResolver.openInputStream(uri)?.use { s ->
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(64 * 1024)
        var tot = 0L
        while (true) {
            val n = s.read(buf)
            if (n < 0) break
            tot += n
            if (tot > massimoMb * 1024L * 1024L) throw IllegalArgumentException("Il file è più grande di $massimoMb MB: non si carica")
            out.write(buf, 0, n)
        }
        out.toByteArray()
    } ?: throw IllegalArgumentException("Il file non si legge")
    return Triple(nome, mime, byte)
}

/** "1,2 MB", "830 KB". */
internal fun peso(byte: Long?): String = when {
    byte == null -> ""
    byte >= 1024 * 1024 -> eu.stgm.wisper.rapportino.Numeri.scrivi(Math.round(byte / 104857.6) / 10.0) + " MB"
    byte >= 1024 -> "${Math.round(byte / 1024.0)} KB"
    else -> "$byte byte"
}

/** Un contatore per rileggere una schermata dopo un'azione (Riprova, dopo un salvataggio). */
internal object Giri5 {
    var ticket by mutableIntStateOf(0)
    var documenti by mutableIntStateOf(0)
}

/** Lo stato "letto alle 16:52" di una copia sul telefono. */
internal fun lettoAlle(istante: String): String = istanteLocale(istante)?.let { "Senza rete · letto alle " + it.format(DateTimeFormatter.ofPattern("H:mm")) }.orEmpty()

/** Nella visita guidata non si salva niente: lo si dice invece di fingere. */
internal const val SOLO_ESEMPIO = "Nella visita guidata è un esempio: qui non si salva niente"

@Composable
internal fun RigaInfo(testo: String) {
    Text(testo, style = Testi.secondario, color = W.colori.tenue, modifier = Modifier.fillMaxWidth())
}
