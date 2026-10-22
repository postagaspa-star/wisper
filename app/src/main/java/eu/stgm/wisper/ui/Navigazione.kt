package eu.stgm.wisper.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Permessi
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.Utente
import java.time.LocalDate
import java.time.YearMonth

/**
 * Le voci del menu laterale (docs/gestionale/fase1-schermate.md §1), nell'ordine
 * delle specifiche e solo quelle che funzionano: ognuna con la sua pila di pagine.
 * La Dashboard e' la casa.
 */
enum class Sezione(val nome: String, val icona: ImageVector, val modulo: String) {
    DASHBOARD("Dashboard", Icone.dashboard, Moduli.DASHBOARD),
    CLIENTI("Clienti e fornitori", Icone.clienti, Moduli.CLIENTI),
    COMMESSE("Progetti e commesse", Icone.commesse, Moduli.COMMESSE),
    PREVENTIVI("Preventivi e contratti", Icone.preventivo, Moduli.PREVENTIVI),
    ATTIVITA("Attività e calendario", Icone.calendario, Moduli.ATTIVITA),
    RAPPORTINI("Ore e rapportini", Icone.ore, Moduli.RAPPORTINI),
    SPESE("Spese e trasferte", Icone.scontrino, Moduli.SPESE),
    FATTURAZIONE("Fatturazione", Icone.fatturazione, Moduli.FATTURAZIONE),
    BANCHE("Banche e scadenze", Icone.barre, Moduli.BANCHE),
    DOCUMENTI("Documenti", Icone.documento, Moduli.DOCUMENTI),
    TICKET("Ticket e assistenza", Icone.chiave, Moduli.TICKET),
    AMMINISTRAZIONE("Amministrazione", Icone.amministrazione, Moduli.AMMINISTRAZIONE),
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
 * Quello che le schermate sanno fare per spostarsi. Le rotte sono stringhe:
 * "commessa/26ST002", "cliente/C001", "amm/utenti", "invio/rapportino/W-…".
 */
class Navigatore(
    private val onVai: (String) -> Unit,
    private val onIndietro: () -> Unit,
    private val onSezione: (Sezione, FiltroRapportini?) -> Unit,
    private val onApriRapportino: (String) -> Unit,
    private val onNuovoRapportino: (LocalDate, String?, String?) -> Unit,
    private val onFirmaPreventivo: (String) -> Unit = {},
    private val onRapportinoDaTicket: (eu.stgm.wisper.rapportino.Rapportino) -> Unit = {},
) {
    fun vai(rotta: String) = onVai(rotta)
    fun indietro() = onIndietro()

    /** Va a una sezione dalla sua prima pagina; per Rapportini si può dare il filtro. */
    fun sezione(s: Sezione, filtro: FiltroRapportini? = null) = onSezione(s, filtro)

    /** Il rapportino a tutto schermo, come si apre dalla Dashboard (riepilogo, menu, firma). */
    fun apriRapportino(idLocale: String) = onApriRapportino(idLocale)

    /** Un rapportino nuovo, già col cliente e la commessa quando si parte da una commessa. */
    fun nuovoRapportino(giorno: LocalDate = LocalDate.now(), idCliente: String? = null, idCommessa: String? = null) =
        onNuovoRapportino(giorno, idCliente, idCommessa)

    /** La firma del cliente per accettare un preventivo, a tutto schermo come quella del rapportino. */
    fun firmaPreventivo(id: String) = onFirmaPreventivo(id)

    /** Fase 5: il rapportino di sempre già compilato dal ticket, aperto al passo 2 (fase5.md §3.3). */
    fun rapportinoDaTicket(r: eu.stgm.wisper.rapportino.Rapportino) = onRapportinoDaTicket(r)
}

/** Le rotte "compito" (moduli, invio): a tutto schermo, niente menu, si esce con la ×. */
fun rottaCompito(rotta: String?): Boolean =
    rotta != null && (rotta.startsWith("invio/") || rotta.startsWith("commessa-modifica/") || rotta.startsWith("commessa-nuova") ||
        rotta.startsWith("cliente-modifica/") || rotta.startsWith("cliente-nuovo") || rotta.startsWith("fornitore-nuovo") ||
        rotta.startsWith("preventivo-modifica/") || rotta.startsWith("preventivo-nuovo") ||
        rotta.startsWith("attivita-modifica/") || rotta.startsWith("attivita-nuova") ||
        rotta.startsWith("ore-registra") || rotta.startsWith("spesa-nuova") || rotta.startsWith("spesa/") ||
        rotta.startsWith("trasferta-nuova") || rotta.startsWith("trasferta/") || rotta.startsWith("amm/veicolo") ||
        // Fase 5: i moduli di ticket, contratti, documenti, scadenze e lettere.
        rotta.startsWith("ticket-nuovo") || rotta.startsWith("ticket-modifica/") || rotta.startsWith("contratto-ca-nuovo") ||
        rotta.startsWith("contratto-ca-modifica/") || rotta.startsWith("documento-nuovo") || rotta.startsWith("scadenza-nuova") ||
        rotta.startsWith("lettera-nuova"))

/** La sezione di una pagina interna: dice il nome piccolo accanto a "indietro" e il permesso che serve. */
fun sezioneDiRotta(rotta: String?, base: Sezione): Sezione = when {
    rotta == null -> base
    rotta == "amm/app" -> base
    rotta.startsWith("client") || rotta.startsWith("fornitor") || rotta.startsWith("soggett") -> Sezione.CLIENTI
    rotta.startsWith("commess") -> Sezione.COMMESSE
    rotta.startsWith("preventiv") || rotta == "listino" || rotta == "contratti" || rotta.startsWith("invio/preventivo") -> Sezione.PREVENTIVI
    rotta.startsWith("attivita") || rotta.startsWith("calendario") -> Sezione.ATTIVITA
    rotta.startsWith("ore-") -> Sezione.RAPPORTINI
    rotta.startsWith("spes") || rotta.startsWith("trasfert") -> Sezione.SPESE
    // Fase 4: fatture, ricevute, importazione; banche e situazione.
    rotta.startsWith("fattur") || rotta.startsWith("ricevut") -> Sezione.FATTURAZIONE
    rotta.startsWith("banche") -> Sezione.BANCHE
    // Fase 5: ticket, impianti e contratti di assistenza; documenti, scadenze, lettere e testi dei modelli.
    rotta.startsWith("ticket") || rotta.startsWith("impianto/") || rotta.startsWith("contratto-ca") -> Sezione.TICKET
    rotta.startsWith("document") || rotta.startsWith("scadenz") || rotta.startsWith("lettera") || rotta.startsWith("modello-testi") -> Sezione.DOCUMENTI
    rotta == "amm/categorie" || rotta == "amm/spazio" -> Sezione.AMMINISTRAZIONE
    rotta.startsWith("amm/") -> Sezione.AMMINISTRAZIONE
    else -> base
}

// ---------------------------------------------------------------------------------- guscio

/**
 * Quello che la testata di una pagina deve sapere: se è di primo livello (Menu)
 * o interna (indietro + nome della sezione), e cosa aprono Menu e il cerchio.
 */
class Guscio(
    val primoLivello: Boolean,
    val sezione: Sezione,
    val utente: Utente,
    val apriMenu: () -> Unit,
    val apriTu: () -> Unit,
)

val LocalGuscio = staticCompositionLocalOf<Guscio?> { null }

/** I permessi di chi è entrato: voci, pulsanti e importi si mostrano secondo questi. */
val LocalPermessi = staticCompositionLocalOf { Permessi.TUTTO }

/** Il nome del titolare, per "Chiedi a Manuel". */
val LocalTitolare = staticCompositionLocalOf { "" }

/** Il pulsante Menu con la parola: il menu nascosto si scopre di meno, la parola aiuta. */
@Composable
fun PulsanteMenu(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    Row(
        modifier.height(44.dp).clip(RoundedCornerShape(22.dp)).background(c.superficie2)
            .clickable(onClick = onClick)
            .semantics { contentDescription = "Apri il menu"; role = Role.Button }
            .padding(start = 10.dp, end = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icone.menu, null, tint = c.testo, modifier = Modifier.size(22.dp))
        Text("Menu", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
    }
}

/** Il cerchio con le iniziali di una persona, nei colori ambra del prototipo. */
@Composable
fun CerchioPersona(iniziali: String, dimensione: Dp = 40.dp, modifier: Modifier = Modifier) {
    val c = W.colori
    Box(modifier.size(dimensione).clip(CircleShape).background(c.ambraFondo), contentAlignment = Alignment.Center) {
        Text(
            iniziali, style = Testi.forte.copy(fontSize = (dimensione.value * 0.35f).coerceIn(11f, 18f).sp),
            color = c.ambraTesto, maxLines = 1,
        )
    }
}

/** Il cerchio in alto a destra: apre il foglio "Tu". */
@Composable
private fun CerchioTu(g: Guscio) {
    Box(
        Modifier.size(48.dp).clip(CircleShape).clickable(onClick = g.apriTu)
            .semantics { contentDescription = "${g.utente.nome.ifBlank { "Tu" }}: password ed esci"; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) { CerchioPersona(g.utente.iniziali) }
}

/**
 * La testata delle pagine di primo livello: Menu a sinistra, le azioni e il
 * cerchio con le iniziali a destra.
 */
@Composable
fun TestataMenu(azioni: @Composable RowScope.() -> Unit = {}) {
    val g = LocalGuscio.current
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (g != null) PulsanteMenu(g.apriMenu, Modifier.bersaglio("menu"))
        Spacer(Modifier.weight(1f))
        azioni()
        if (g != null) CerchioTu(g)
    }
}

/**
 * La testata delle pagine interne: indietro, il nome della sezione in piccolo,
 * le azioni e il cerchio. Una pagina interna aperta come prima pagina della sua
 * sezione (le Commesse dal menu) mette Menu al posto di indietro.
 */
@Composable
fun TestataInterna(onIndietro: () -> Unit, azioni: @Composable RowScope.() -> Unit = {}) {
    val g = LocalGuscio.current
    if (g?.primoLivello == true) {
        TestataMenu(azioni)
        return
    }
    val c = W.colori
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PulsanteTondo(Icone.indietro, "Indietro", onIndietro)
        if (g != null) {
            Text(
                g.sezione.nome, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.26.sp), color = c.tenue,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
            )
        }
        Spacer(Modifier.weight(1f))
        azioni()
        if (g != null) CerchioTu(g)
    }
}

/**
 * Il bordo sinistro da cui, scorrendo verso destra, si apre il menu. Con la
 * navigazione a gesti il bordo è dell'indietro di Android: il pulsante Menu resta
 * la strada principale.
 */
@Composable
fun BordoMenu(onApri: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier.fillMaxHeight().width(16.dp).pointerInput(Unit) {
            var tratto = 0f
            detectHorizontalDragGestures(
                onDragStart = { tratto = 0f },
                onHorizontalDrag = { cambio, dx -> tratto += dx; if (tratto > 0) cambio.consume() },
                onDragEnd = { if (tratto > 50.dp.toPx()) onApri() },
            )
        },
    )
}

// ---------------------------------------------------------------------------------- il menu laterale

/**
 * Il contenuto del menu (prototipo, .cassetto): chi è entrato, le voci che il
 * ruolo vede, il numerino giallo su Fatturazione, lo stato del collegamento ed Esci.
 */
@Composable
fun CassettoMenu(
    utente: Utente,
    voci: List<Sezione>,
    attiva: Sezione,
    /** I numerini gialli: Fatturazione (clienti da fatturare), Ticket e assistenza (da prendere), Documenti (da approvare). */
    numeri: Map<Sezione, Int>,
    collegato: Boolean,
    statoCollegamento: String,
    onVoce: (Sezione) -> Unit,
    onRiprova: () -> Unit,
    onEsci: () -> Unit,
) {
    val c = W.colori
    Column(Modifier.fillMaxSize().padding(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 18.dp)) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, top = 10.dp, bottom = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CerchioPersona(utente.iniziali, 48.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(utente.nome.ifBlank { "Wisper" }, style = Testi.forteGrande, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(Ruoli.nome(utente.ruolo), style = Testi.secondario, color = c.tenue, maxLines = 1)
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
            Spacer(Modifier.height(0.dp))
            voci.forEach { s ->
                VoceCassetto(s, s == attiva, numeri[s] ?: 0) { onVoce(s) }
            }
        }
        Column(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
            Column(Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, top = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 32.dp).let { if (!collegato) it.clip(RoundedCornerShape(8.dp)).clickable(onClick = onRiprova) else it },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(if (collegato) c.firmatoTesto else c.moltoTenue))
                    Text(statoCollegamento, style = Testi.piccolo, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (!collegato) Text("· Riprova", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
                }
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onEsci)
                        .semantics { role = Role.Button },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Icon(Icone.esci, null, tint = c.testo2, modifier = Modifier.size(20.dp))
                    Text("Esci", style = Testi.pulsanteSecondario, color = c.testo2)
                }
            }
        }
    }
}

@Composable
private fun VoceCassetto(s: Sezione, attiva: Boolean, numero: Int, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(16.dp))
            .background(if (attiva) c.gialloTenue else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(onClick = onClick)
            .semantics { role = Role.Tab; selected = attiva }
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(s.icona, null, tint = if (attiva) c.testo else c.testo2, modifier = Modifier.size(22.dp))
        Text(
            s.nome, style = Testi.pulsanteSecondario.copy(fontWeight = if (attiva) FontWeight.ExtraBold else FontWeight.Bold),
            color = if (attiva) c.testo else c.testo2, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        if (numero > 0) {
            Box(
                Modifier.widthIn(min = 24.dp).height(24.dp).clip(RoundedCornerShape(12.dp)).background(c.giallo).padding(horizontal = 7.dp)
                    .semantics {
                        contentDescription = when (s) {
                            Sezione.TICKET -> "$numero da prendere"
                            Sezione.DOCUMENTI -> "$numero da approvare"
                            else -> "$numero da fatturare"
                        }
                    },
                contentAlignment = Alignment.Center,
            ) { Text("$numero", style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = c.suGiallo) }
        }
    }
}

// ---------------------------------------------------------------------------------- stati comuni

/** Una pagina che il ruolo non vede: una scheda calma, e a chi chiedere. */
@Composable
fun NonPermesso(onIndietro: (() -> Unit)?) {
    val c = W.colori
    val titolare = LocalTitolare.current
    Column(
        Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (onIndietro != null) TestataInterna(onIndietro) else TestataMenu()
        Scheda(orizzontale = 20.dp, verticale = 18.dp) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.superficie2), contentAlignment = Alignment.Center) {
                    Icon(Icone.lucchetto, null, tint = c.testo2, modifier = Modifier.size(20.dp))
                }
                Text(
                    "Non hai il permesso per vedere questa pagina." + if (titolare.isNotBlank()) " Chiedi a $titolare." else " Chiedi al titolare.",
                    style = Testi.testo, color = c.testo2, modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** I segnaposto che pulsano piano mentre si legge (niente rotelle infinite). */
@Composable
fun Segnaposto(altezza: Dp = 72.dp, modifier: Modifier = Modifier) {
    val c = W.colori
    val pulsa = rememberInfiniteTransition(label = "segnaposto")
    val alfa = pulsa.animateFloat(0.45f, 0.9f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "alfa")
    Box(
        modifier.fillMaxWidth().height(altezza).clip(RoundedCornerShape(20.dp))
            .background(c.superficie2.copy(alpha = alfa.value)),
    )
}

/** Un'etichetta "URGENTI · 3" sopra una scheda a righe. */
@Composable
fun ColumnScope.EtichettaConto(testo: String, numero: Int? = null) {
    Etichetta(if (numero != null) "$testo · $numero" else testo)
}
