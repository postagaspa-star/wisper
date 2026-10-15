package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Riepiloghi
import eu.stgm.wisper.Vista
import eu.stgm.wisper.rapportino.Numeri
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private val IT = Locale.ITALY

fun nomeMese(m: YearMonth): String =
    m.format(DateTimeFormatter.ofPattern("LLLL yyyy", IT)).replaceFirstChar { it.uppercase() }

/**
 * Il mese (docs/aspetto.md §6): i rapportini raggruppati per chi paga, col
 * totale di ognuno. È il numero che serve per la fattura, già fatto.
 */
@Composable
fun SchermataMese(dati: Dati, onApri: (String) -> Unit, onNuovo: () -> Unit, onIndietro: () -> Unit) {
    val c = W.colori
    val viste by dati.viste.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var meseTesto by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    val mese = YearMonth.parse(meseTesto)

    // I mesi oltre gli ultimi sei non sono sul telefono: si chiedono al foglio.
    LaunchedEffect(meseTesto) { if (mese.isBefore(YearMonth.now().minusMonths(5))) dati.aggiorna(mese) }

    val delMese = viste.filter { YearMonth.from(it.rapportino.data) == mese }
    val gruppi = delMese.groupBy { Riepiloghi.chiPaga(it.rapportino, ana) }
        .entries.sortedByDescending { (_, vv) -> vv.sumOf { it.conto?.totale ?: 0.0 } }

    androidx.activity.compose.BackHandler(onBack = onIndietro)

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.fillMaxWidth().height(48.dp), verticalAlignment = Alignment.CenterVertically) {
                PulsanteTondo(Icone.indietro, "Torna a Oggi", onIndietro)
                Spacer(Modifier.weight(1f))
                PulsanteTondo(Icone.frecciaSinistra, "Mese prima", { meseTesto = mese.minusMonths(1).toString() })
                Spacer(Modifier.width(8.dp))
                PulsanteTondo(Icone.freccia, "Mese dopo", { meseTesto = mese.plusMonths(1).toString() })
            }
            Text(nomeMese(mese), style = Testi.titoloPagina, color = c.testo)

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Riquadro("Ore", Numeri.scrivi(delMese.sumOf { it.rapportino.oreTotali }), Modifier.weight(1f))
                Riquadro("Km", Numeri.scrivi(delMese.sumOf { it.rapportino.km }), Modifier.weight(1f))
                Riquadro("Totale", Numeri.euro(delMese.sumOf { it.conto?.totale ?: 0.0 }).replace(",00 €", " €"), Modifier.weight(1.3f))
            }

            if (delMese.isEmpty()) {
                Text(
                    "Nessun rapportino a ${mese.format(DateTimeFormatter.ofPattern("LLLL", IT))}",
                    style = Testi.testo, color = c.tenue, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 40.dp),
                )
            }

            gruppi.forEach { (chi, vv) ->
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.Bottom) {
                    Text(chi.uppercase(), style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = Testi.etichetta.letterSpacing),
                        color = c.testo2, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(Numeri.euro(vv.sumOf { it.conto?.totale ?: 0.0 }), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
                }
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(c.scheda)
                        .border(1.dp, c.bordoScheda, RoundedCornerShape(22.dp)).padding(horizontal = 14.dp),
                ) {
                    val ordinate = vv.sortedByDescending { it.rapportino.data }
                    ordinate.forEachIndexed { i, v ->
                        RigaMese(v, gruppoCliente = chi != v.rapportino.cliente) { onApri(v.rapportino.idLocale) }
                        if (i < ordinate.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
                    }
                }
            }
        }

        Box(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .background(Brush.verticalGradient(0f to c.fondo.copy(alpha = 0f), 0.28f to c.fondo))
                .navigationBarsPadding().padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 16.dp),
        ) { PulsantePrincipale("Nuovo rapportino", onNuovo, icona = Icone.piu) }
    }
}

@Composable
private fun Riquadro(etichetta: String, valore: String, modifier: Modifier) {
    val c = W.colori
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(c.scheda).border(1.dp, c.bordoScheda, RoundedCornerShape(18.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(etichetta, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue)
        Text(valore, style = Testi.titoloScheda.copy(fontSize = Testi.titoloScheda.fontSize * 0.95f), color = c.testo, maxLines = 1)
    }
}

/**
 * Una riga: giorno, chi o cosa, ore, importo e UNA parola di stato. Se è ancora
 * sul telefono, l'icona della nuvola; se il foglio l'ha rifiutata, il bordo rosso.
 */
@Composable
private fun RigaMese(v: Vista, gruppoCliente: Boolean, onClick: () -> Unit) {
    val c = W.colori
    val r = v.rapportino
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(onClick = onClick).padding(vertical = 10.dp)
            .then(if (v.errore.isNotBlank()) Modifier.border(1.5.dp, c.rossoPieno, RoundedCornerShape(12.dp)) else Modifier),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(r.data.dayOfMonth.toString(), style = Testi.titoloScheda, color = c.testo)
            Text(r.data.dayOfWeek.getDisplayName(TextStyle.SHORT, IT), style = Testi.piccolo.copy(fontSize = Testi.etichetta.fontSize), color = c.tenue)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (gruppoCliente) r.cliente else r.descrizione.ifBlank { r.cliente },
                    style = Testi.forte, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                )
                if (v.inCoda) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icone.nuvola, null, tint = c.tenue, modifier = Modifier.size(16.dp).semantics { contentDescription = "Ancora sul telefono" })
                }
            }
            Text(
                // Prima le ore: il nome della commessa può essere lungo e si taglia lui.
                listOf(Numeri.ore(r.oreTotali), r.commessa.takeIf { it.isNotBlank() }).filterNotNull().joinToString(" · "),
                style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(v.conto?.let { Numeri.euro(it.totale) } ?: "", style = Testi.forte, color = c.testo)
            ParolaStato(r.stato)
        }
    }
}
