package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.YearMonth

/**
 * Le tre sezioni del telefono (docs/telefono-ufficio.md): Oggi resta la casa, il
 * lavoro di campo; Rapportini e Ufficio portano sul telefono quello che fa Wisper
 * Ufficio. Una barra in basso con l'etichetta, mai un menu nascosto.
 */
enum class Sezione(val nome: String, val icona: ImageVector) {
    OGGI("Oggi", Icone.oggi),
    RAPPORTINI("Rapportini", Icone.rapportini),
    UFFICIO("Ufficio", Icone.ufficio),
}

/** I segmenti della sezione Rapportini, come sul computer. */
enum class Quali { TUTTI, FATTURARE, FIRMARE }

/** Il filtro della sezione Rapportini. Mese null = tutti i mesi. */
data class FiltroRapportini(
    val mese: YearMonth? = YearMonth.now(),
    val quali: Quali = Quali.TUTTI,
    val idCliente: String? = null,
    val idCommessa: String? = null,
    val testo: String = "",
)

/**
 * Quello che le schermate sanno fare per spostarsi. Le rotte sono stringhe
 * (docs/telefono-ufficio.md, tabella "Rotte"): "commessa/26ST002", "invio/rapportino/W-…".
 */
class Navigatore(
    private val onVai: (String) -> Unit,
    private val onIndietro: () -> Unit,
    private val onSezione: (Sezione, FiltroRapportini?) -> Unit,
    private val onApriRapportino: (String) -> Unit,
    private val onNuovoRapportino: (LocalDate, String?, String?) -> Unit,
) {
    fun vai(rotta: String) = onVai(rotta)
    fun indietro() = onIndietro()

    /** Va a una sezione dalla sua prima pagina; per Rapportini si può dare il filtro. */
    fun sezione(s: Sezione, filtro: FiltroRapportini? = null) = onSezione(s, filtro)

    /** Il rapportino a tutto schermo, come si apre da Oggi (riepilogo, menu, firma). */
    fun apriRapportino(idLocale: String) = onApriRapportino(idLocale)

    /** Un rapportino nuovo, già col cliente e la commessa quando si parte da una commessa. */
    fun nuovoRapportino(giorno: LocalDate = LocalDate.now(), idCliente: String? = null, idCommessa: String? = null) =
        onNuovoRapportino(giorno, idCliente, idCommessa)
}

/** Le rotte "compito" (moduli, invio): niente barra in basso, si esce con la ×. */
fun rottaCompito(rotta: String?): Boolean =
    rotta != null && (rotta.startsWith("invio/") || rotta.startsWith("commessa-modifica/") || rotta.startsWith("commessa-nuova") ||
        rotta.startsWith("cliente-modifica/") || rotta == "cliente-nuovo")

/** La barra delle sezioni: tre voci con l'etichetta, quella aperta su giallo tenue. */
@Composable
fun BarraSezioni(attiva: Sezione, numeroUfficio: Int, onSezione: (Sezione) -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    Column(modifier.fillMaxWidth().background(c.scheda)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.bordoScheda))
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().height(76.dp).padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Sezione.entries.forEach { s ->
                val su = s == attiva
                Column(
                    Modifier.weight(1f).height(64.dp).let { if (s == Sezione.UFFICIO) it.bersaglio("sezione-ufficio") else it }
                        .clip(RoundedCornerShape(16.dp)).clickable { onSezione(s) }
                        .semantics { role = Role.Tab; selected = su },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Box(
                            Modifier.size(width = 64.dp, height = 32.dp).clip(RoundedCornerShape(16.dp)).background(if (su) c.gialloTenue else c.scheda),
                            contentAlignment = Alignment.Center,
                        ) { Icon(s.icona, null, tint = c.testo, modifier = Modifier.size(22.dp)) }
                        if (s == Sezione.UFFICIO && numeroUfficio > 0) {
                            Box(
                                Modifier.align(Alignment.TopEnd).offset(x = (-8).dp, y = (-4).dp).widthIn(min = 20.dp).height(20.dp)
                                    .clip(RoundedCornerShape(10.dp)).background(c.giallo).border(2.dp, c.scheda, RoundedCornerShape(10.dp))
                                    .padding(horizontal = 5.dp),
                                contentAlignment = Alignment.Center,
                            ) { Text("$numeroUfficio", style = Testi.pillola.copy(fontWeight = FontWeight.ExtraBold), color = c.suGiallo) }
                        }
                    }
                    Text(
                        s.nome, style = Testi.piccolo.copy(fontWeight = if (su) FontWeight.ExtraBold else FontWeight.Bold),
                        color = if (su) c.testo else c.tenue,
                    )
                }
            }
        }
    }
}
