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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.ui.graphics.lerp
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
 * La casa e' la prima voce accesa (di solito la Dashboard: dal 03/11/2026 si spegne
 * anche lei, progetti.md §5).
 */
enum class Sezione(val nome: String, val fondo: Long, val tratto: Long, disegno: String, val modulo: String) {
    // 09/11/2026 (design Fai, fai.md §6): voci di una parola, ognuna col suo colore. I nomi lunghi restano nei Permessi.
    DASHBOARD("Casa", 0xFF16171B, 0xFFFFC53D, "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z", Moduli.DASHBOARD),
    CLIENTI("Clienti", 0xFFDDF5E8, 0xFF067647, "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a4 4 0 0 0-3-3.9M15.5 4.1a3 3 0 0 1 0 5.8", Moduli.CLIENTI),
    // 03/11/2026 (progetti.md §4): i progetti hanno la loro voce subito sotto, e la voce di sopra torna "Commesse".
    COMMESSE("Commesse", 0xFFFFEBD1, 0xFFB54708, "M4 8h16v11H4zM9 8V5h6v3M4 13h16", Moduli.COMMESSE),
    PROGETTI("Progetti", 0xFFFFF0E6, 0xFFC4320A, "M4 4h16v16H4zM4 15h16M12 15v5", Moduli.PROGETTI),
    PREVENTIVI("Preventivi", 0xFFECE7FF, 0xFF5925DC, "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4", Moduli.PREVENTIVI),
    // 1.4.0 (servizi.md §1): i Servizi subito dopo Preventivi; un'etichetta del prezzo, fucsia (un colore che il menu non aveva).
    // Non e' un modulo del server: si vede con Preventivi, Rapportini o Fatture ([accesa]).
    SERVIZI("Servizi", 0xFFFBE8FF, 0xFF9F1AB1, "M4 4h7.2l9.3 9.3-7.2 7.2L4 11.2zM8.5 8.5h.01", Moduli.SERVIZI),
    ATTIVITA("Calendario", 0xFFDCE8FF, 0xFF1849A9, "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4", Moduli.ATTIVITA),
    // 07/11/2026 (richiesta del titolare): le Ore non ci sono più, la voce è solo "Rapportini".
    RAPPORTINI("Rapportini", 0xFFFFF0C2, 0xFF7A5600, "M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M9 14l2 2 4-4", Moduli.RAPPORTINI),
    SPESE("Spese", 0xFFFFE4DE, 0xFFB93815, "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3", Moduli.SPESE),
    FATTURAZIONE("Fatture", 0xFFD9F4FA, 0xFF0E7090, "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4", Moduli.FATTURAZIONE),
    BANCHE("Banche", 0xFFDDF3EF, 0xFF107569, "M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18", Moduli.BANCHE),
    // Fase 6 (fase6.md §12): Persone dopo Banche, Mezzi dopo Ticket, Collaboratori dopo Mezzi.
    PERSONE("Persone", 0xFFFCE7F6, 0xFFC11574, "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20a7 7 0 0 1 14 0", Moduli.PERSONE),
    DOCUMENTI("Documenti", 0xFFEAECF0, 0xFF344054, "M3 6h6l2 2h10v11H3z", Moduli.DOCUMENTI),
    TICKET("Ticket", 0xFFE0E7FF, 0xFF3538CD, "M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z", Moduli.TICKET),
    MEZZI("Mezzi", 0xFFF4EBDD, 0xFF8A5A12, "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4", Moduli.MEZZI),
    // Fase 7 (fase7.md §12): dopo Mezzi, prima di Collaboratori.
    COMUNICAZIONI("WhatsApp", 0xFFDCF8E7, 0xFF087443, "M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5z", Moduli.COMUNICAZIONI),
    PORTALE("Portale clienti", 0xFFE0F2FE, 0xFF026AA2, "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18", Moduli.PORTALE),
    COLLABORATORI("Collaboratori", 0xFFEAF8D7, 0xFF3B7C0F, "M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M3 20a7 7 0 0 1 12-4.9M19 14v6M16 17h6", Moduli.COLLABORATORI),
    // Fase 8 (fase8.md §15): 17 Integrazioni (la spina) dopo Collaboratori.
    INTEGRAZIONI("Integrazioni", 0xFFF2F4F7, 0xFF475467, "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4", Moduli.INTEGRAZIONI),
    AMMINISTRAZIONE("Impostazioni", 0xFFF2F4F7, 0xFF16171B, "M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4", Moduli.AMMINISTRAZIONE),
    ;

    val icona: ImageVector = Icone.voce(name, disegno)

    /**
     * La voce c'e' nel menu: il ruolo vede il suo modulo e la funzione e' accesa. Servizi (1.4.0) non ha un modulo suo: c'e'
     * se il ruolo vede Preventivi, Rapportini o Fatture e almeno una di quelle funzioni e' accesa.
     */
    fun accesa(p: Permessi, spente: Collection<String>): Boolean =
        if (this == SERVIZI) Moduli.CHI_VEDE_SERVIZI.any { p.vede(it) && it !in spente }
        else p.vede(modulo) && modulo !in spente

    /** Il ruolo puo' aprire le pagine della voce (senza guardare le funzioni spente). */
    fun vista(p: Permessi): Boolean = if (this == SERVIZI) p.vedeServizi else p.vede(modulo)
}

/** I segmenti della sezione Rapportini, come sul computer. */
/** I segmenti dei rapportini (06/11/2026): Tutti | Da inviare | Da fatturare. */
enum class Quali { TUTTI, INVIARE, FATTURARE }

/** Il filtro della sezione Rapportini. Mese null = tutti i mesi. */
data class FiltroRapportini(
    val mese: YearMonth? = YearMonth.now(),
    val quali: Quali = Quali.TUTTI,
    val idCliente: String? = null,
    val idCommessa: String? = null,
    val testo: String = "",
    /** Solo i lavori di prima di questo giorno (dalla Dashboard: "da inviare da più di una settimana"). */
    val a: java.time.LocalDate? = null,
)

/**
 * Quello che le schermate sanno fare per spostarsi. Le rotte sono stringhe:
 * "commessa/26ST002", "cliente/C001", "amm/utenti", "invio/rapportino/W-…".
 */
class Navigatore(
    private val onVai: (String) -> Unit,
    private val onIndietro: () -> Unit,
    private val onSezione: (Sezione, FiltroRapportini?) -> Unit,
    private val onApriRapportino: (String, Boolean) -> Unit,
    private val onNuovoRapportino: (LocalDate, String?, String?) -> Unit,
    private val onFirmaPreventivo: (String) -> Unit = {},
    private val onRapportinoDaTicket: (eu.stgm.wisper.rapportino.Rapportino) -> Unit = {},
    private val onNuovoRapportinoProgetto: (String) -> Unit = {},
) {
    fun vai(rotta: String) = onVai(rotta)
    fun indietro() = onIndietro()

    /** Va a una sezione dalla sua prima pagina; per Rapportini si può dare il filtro. */
    fun sezione(s: Sezione, filtro: FiltroRapportini? = null) = onSezione(s, filtro)

    /**
     * Il rapportino a tutto schermo, coi suoi lavori, dal lavoro [idLocale] (06/11/2026). Con [lavoro] (l'elenco dei
     * Rapportini) si apre anche quel lavoro, se il rapportino ne ha piu' d'uno.
     */
    fun apriRapportino(idLocale: String, lavoro: Boolean = false) = onApriRapportino(idLocale, lavoro)

    /** Un rapportino nuovo, già col cliente e la commessa quando si parte da una commessa. */
    fun nuovoRapportino(giorno: LocalDate = LocalDate.now(), idCliente: String? = null, idCommessa: String? = null) =
        onNuovoRapportino(giorno, idCliente, idCommessa)

    /** Un rapportino nuovo dalla scheda di un progetto: cliente, commessa e progetto già messi (progetti.md §4.4). */
    fun nuovoRapportinoProgetto(idProgetto: String) = onNuovoRapportinoProgetto(idProgetto)

    /** La firma del cliente per accettare un preventivo, a tutto schermo come quella del rapportino. */
    fun firmaPreventivo(id: String) = onFirmaPreventivo(id)

    /** Fase 5: il rapportino di sempre già compilato dal ticket, aperto al passo 2 (fase5.md §3.3). */
    fun rapportinoDaTicket(r: eu.stgm.wisper.rapportino.Rapportino) = onRapportinoDaTicket(r)
}

/** Le rotte "compito" (moduli, invio): a tutto schermo, niente menu, si esce con la ×. */
fun rottaCompito(rotta: String?): Boolean =
    rotta != null && (rotta.startsWith("invio/") || rotta.startsWith("commessa-modifica/") || rotta.startsWith("commessa-nuova") ||
        rotta.startsWith("progetto-nuovo") || rotta.startsWith("progetto-modifica/") ||
        rotta.startsWith("cliente-modifica/") || rotta.startsWith("cliente-nuovo") || rotta.startsWith("fornitore-nuovo") ||
        rotta.startsWith("preventivo-modifica/") || rotta.startsWith("preventivo-nuovo") ||
        // 1.4.0: la scheda di un servizio (nuovo o da cambiare).
        rotta.startsWith("servizio-nuovo") || rotta.startsWith("servizio/") ||
        rotta.startsWith("attivita-modifica/") || rotta.startsWith("attivita-nuova") ||
        rotta.startsWith("spesa-nuova") || rotta.startsWith("spesa/") || rotta.startsWith("spesa-veloce") ||
        rotta.startsWith("trasferta-nuova") || rotta.startsWith("trasferta/") || rotta.startsWith("amm/veicolo") ||
        // Fase 5: i moduli di ticket, contratti, documenti, scadenze e lettere.
        rotta.startsWith("ticket-nuovo") || rotta.startsWith("ticket-modifica/") || rotta.startsWith("contratto-ca-nuovo") ||
        rotta.startsWith("contratto-ca-modifica/") || rotta.startsWith("documento-nuovo") || rotta.startsWith("scadenza-nuova") ||
        rotta.startsWith("lettera-nuova") ||
        // Fase 6: i moduli di persone, assenze, DPI, guasti, mezzi, strumenti, collaboratori e incarichi.
        rotta.startsWith("persona-nuova") || rotta.startsWith("persona-modifica/") || rotta.startsWith("assenza-nuova") ||
        rotta.startsWith("dpi-consegna/") || rotta.startsWith("guasto-nuovo/") || rotta.startsWith("mezzo-nuovo") ||
        rotta.startsWith("strumento-nuovo") || rotta.startsWith("incarico-nuovo/") || rotta.startsWith("incarico-lettera/") ||
        rotta.startsWith("collaboratore-nuovo") ||
        // Fase 8: l'importazione di clienti e fornitori, a passi come il rapportino.
        rotta.startsWith("amm/importa-clienti"))

/** La sezione di una pagina interna: dice il nome piccolo accanto a "indietro" e il permesso che serve. */
fun sezioneDiRotta(rotta: String?, base: Sezione): Sezione = when {
    rotta == null -> base
    rotta == "amm/app" -> base
    // Fase 8: le pagine di Tu (notifiche, aspetto) sono di tutti, dalla voce in cui si è.
    rotta.startsWith("tu/") -> base
    rotta == "tutto" -> Sezione.DASHBOARD
    rotta.startsWith("integrazion") -> Sezione.INTEGRAZIONI
    rotta.startsWith("client") || rotta.startsWith("fornitor") || rotta.startsWith("soggett") -> Sezione.CLIENTI
    rotta.startsWith("commess") -> Sezione.COMMESSE
    rotta.startsWith("progett") -> Sezione.PROGETTI
    rotta.startsWith("preventiv") || rotta == "contratti" || rotta.startsWith("invio/preventivo") -> Sezione.PREVENTIVI
    // 1.4.0: il listino sono i Servizi (anche la rotta "listino" rimasta in una pila di prima).
    rotta.startsWith("servizi") || rotta == "listino" -> Sezione.SERVIZI
    rotta.startsWith("attivita") || rotta.startsWith("calendario") -> Sezione.ATTIVITA
    rotta.startsWith("ore-") -> Sezione.RAPPORTINI
    rotta.startsWith("spes") || rotta.startsWith("trasfert") -> Sezione.SPESE
    // Fase 4: fatture, ricevute, importazione; banche e situazione.
    rotta.startsWith("fattur") || rotta.startsWith("ricevut") -> Sezione.FATTURAZIONE
    rotta.startsWith("banche") -> Sezione.BANCHE
    // Fase 5: ticket, impianti e contratti di assistenza; documenti, scadenze, lettere e testi dei modelli.
    rotta.startsWith("ticket") || rotta.startsWith("impianto/") || rotta.startsWith("contratto-ca") -> Sezione.TICKET
    rotta.startsWith("document") || rotta.startsWith("scadenz") || rotta.startsWith("lettera") || rotta.startsWith("modello-testi") -> Sezione.DOCUMENTI
    // Fase 6: persone e assenze; mezzi, strumenti e guasti; collaboratori e incarichi.
    rotta.startsWith("persona") || rotta.startsWith("assenza") || rotta.startsWith("accessi-riservati") || rotta.startsWith("dpi-") -> Sezione.PERSONE
    rotta.startsWith("mezz") || rotta.startsWith("strumento") || rotta.startsWith("guasto") -> Sezione.MEZZI
    rotta.startsWith("collaborator") || rotta.startsWith("incaric") -> Sezione.COLLABORATORI
    // Fase 7: comunicazioni e modelli; il portale, i suoi clienti e i file arrivati.
    rotta.startsWith("comunicazion") || rotta.startsWith("modello-messaggio") -> Sezione.COMUNICAZIONI
    rotta.startsWith("portale") || rotta.startsWith("caricamento") -> Sezione.PORTALE
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
    /** Fase 7 (§3.16): le notifiche nuove e la campanella che le apre (null: chi non vede le comunicazioni). */
    val notifiche: Int = 0,
    val apriNotifiche: (() -> Unit)? = null,
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
        modifier.height(48.dp).clip(RoundedCornerShape(24.dp)).background(c.scheda)
            .clickable(onClick = onClick)
            .semantics { contentDescription = "Apri il menu"; role = Role.Button }
            .padding(start = 14.dp, end = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icone.menu, null, tint = c.testo, modifier = Modifier.size(22.dp))
        Text("Menu", style = Testi.pulsanteSecondario, color = c.testo)
    }
}

/** Il cerchio con le iniziali di una persona: nero nel chiaro, chiaro nello scuro (fai.md §8). */
@Composable
fun CerchioPersona(iniziali: String, dimensione: Dp = 40.dp, modifier: Modifier = Modifier) {
    val c = W.colori
    Box(modifier.size(dimensione).clip(CircleShape).background(c.testo), contentAlignment = Alignment.Center) {
        Text(
            iniziali, style = Testi.forte.copy(fontSize = (dimensione.value * 0.35f).coerceIn(11f, 18f).sp),
            color = c.foglio, maxLines = 1,
        )
    }
}

/** Fase 7 (§12): la campanella accanto al cerchio, col numero delle notifiche nuove. */
@Composable
internal fun Campanella(g: Guscio) {
    val apri = g.apriNotifiche ?: return
    val c = W.colori
    Box(
        Modifier.size(48.dp)
            .semantics(mergeDescendants = true) { contentDescription = if (g.notifiche > 0) "Notifiche: ${g.notifiche} nuove" else "Notifiche"; role = Role.Button }
            .bersaglio("campanella"),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(c.scheda).clickable(onClick = apri), contentAlignment = Alignment.Center) {
            Icon(Icone.campanella, null, tint = c.testo, modifier = Modifier.size(20.dp))
        }
        if (g.notifiche > 0) {
            Box(
                Modifier.align(Alignment.TopEnd).widthIn(min = 20.dp).height(20.dp).clip(RoundedCornerShape(10.dp)).background(c.testo).padding(horizontal = 5.dp),
                contentAlignment = Alignment.Center,
            ) { Text(if (g.notifiche > 99) "99" else "${g.notifiche}", style = Testi.pillola.copy(fontWeight = FontWeight.ExtraBold), color = c.foglio, maxLines = 1) }
        }
    }
}

/** Il cerchio in alto a destra: apre il foglio "Tu". */
@Composable
internal fun CerchioTu(g: Guscio) {
    Box(
        Modifier.size(48.dp).clip(CircleShape).clickable(onClick = g.apriTu)
            .semantics { contentDescription = "${g.utente.nome.ifBlank { "Tu" }}: password ed esci"; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) { CerchioPersona(g.utente.iniziali, 48.dp) }
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
        if (g != null) { Campanella(g); CerchioTu(g) }
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
        // 06/11/2026: il nome prende tutto lo spazio libero fino alle azioni; i puntini solo se davvero non ci sta
        // (prima due pesi a meta' tagliavano "Amministrazione" con lo spazio vuoto accanto).
        if (g != null) {
            Text(
                g.sezione.nome, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.26.sp), color = c.tenue,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
        } else Spacer(Modifier.weight(1f))
        azioni()
        if (g != null) { Campanella(g); CerchioTu(g) }
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
    onChiudi: () -> Unit,
    /** Fase 6: per l'esterno il nome del suo collaboratore (la pillola "Esterno · …" e la voce "La tua scheda"). */
    esterno: String = "",
    /** Collega un computer col QR (collega-qr.md §7); null = la voce non c'è (la visita guidata). */
    onCollega: (() -> Unit)? = null,
) {
    val c = W.colori
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(start = 20.dp, end = 16.dp, top = 20.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CerchioPersona(utente.iniziali, 48.dp)
            Column(Modifier.weight(1f)) {
                Text(utente.nome.ifBlank { "Wisper" }, style = Testi.forteGrande, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (esterno.isNotBlank()) Pillolina("Esterno · $esterno", c.fatturatoTesto, c.fatturatoFondo)
                else Text(Ruoli.nome(utente.ruolo), style = Testi.secondario, color = c.tenue, maxLines = 1)
            }
            Box(
                Modifier.size(48.dp).clip(CircleShape).background(c.scheda).clickable(onClick = onChiudi)
                    .semantics { contentDescription = "Chiudi il menu"; role = Role.Button },
                contentAlignment = Alignment.Center,
            ) { Icon(Icone.chiudi, null, tint = c.testo, modifier = Modifier.size(20.dp)) }
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            voci.forEach { s ->
                if (s == Sezione.AMMINISTRAZIONE) Box(Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = 6.dp, bottom = 6.dp).height(1.dp).background(c.riga))
                VoceCassetto(s, s == attiva, numeri[s] ?: 0, if (s == Sezione.COLLABORATORI && esterno.isNotBlank()) "La tua scheda" else s.nome) { onVoce(s) }
            }
            // Collega un computer col QR (prototipo Collega-QR.html): dopo le voci.
            if (onCollega != null) {
                Row(
                    Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp)).clickable(onClick = onCollega)
                        .semantics { role = Role.Button }.padding(horizontal = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(c.scheda), contentAlignment = Alignment.Center) {
                        Icon(Icone.pc, null, tint = c.testo, modifier = Modifier.size(20.dp))
                    }
                    Text("Collega un computer", style = Testi.pulsanteSecondario, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(bottomEnd = 28.dp)).background(c.lato).navigationBarsPadding()
                .padding(start = 20.dp, end = 16.dp, top = 12.dp, bottom = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                Modifier.weight(1f).heightIn(min = 48.dp).let { if (!collegato) it.clip(RoundedCornerShape(8.dp)).clickable(onClick = onRiprova) else it },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(if (collegato) androidx.compose.ui.graphics.Color(0xFF12B76A) else c.moltoTenue))
                Text(
                    if (collegato) statoCollegamento.substringBefore(" · ") else statoCollegamento,
                    style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = if (collegato) c.firmatoTesto else c.tenue,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                )
                if (!collegato) Text("· Riprova", style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.collegamento)
            }
            Box(
                Modifier.height(48.dp).clip(RoundedCornerShape(24.dp)).background(c.foglio).clickable(onClick = onEsci)
                    .semantics { role = Role.Button }.padding(horizontal = 18.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Esci", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo) }
        }
    }
}

@Composable
private fun VoceCassetto(s: Sezione, attiva: Boolean, numero: Int, nome: String = s.nome, onClick: () -> Unit) {
    val c = W.colori
    // Nel tema scuro il fondo è il tratto al 30% sulla scheda e il tratto si schiarisce (fai.md §3).
    val tratto = androidx.compose.ui.graphics.Color(s.tratto)
    val fondoIcona = if (c.scuro) lerp(c.scheda, tratto, 0.30f) else androidx.compose.ui.graphics.Color(s.fondo)
    val trattoIcona = if (c.scuro) lerp(tratto, androidx.compose.ui.graphics.Color.White, 0.60f) else tratto
    Row(
        Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp))
            .background(if (attiva) c.gialloTenue else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(onClick = onClick)
            .semantics { role = Role.Tab; selected = attiva }
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(fondoIcona), contentAlignment = Alignment.Center) {
            Icon(s.icona, null, tint = trattoIcona, modifier = Modifier.size(20.dp))
        }
        Text(
            nome, style = Testi.pulsanteSecondario.copy(fontWeight = if (attiva) FontWeight.ExtraBold else FontWeight.Bold),
            color = c.testo, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        if (numero > 0) {
            Box(
                Modifier.widthIn(min = 26.dp).height(26.dp).clip(RoundedCornerShape(13.dp)).background(c.testo).padding(horizontal = 8.dp)
                    .semantics {
                        contentDescription = when (s) {
                            Sezione.TICKET -> "$numero da prendere"
                            Sezione.DOCUMENTI -> "$numero da approvare"
                            Sezione.PERSONE -> if (numero == 1) "1 richiesta da approvare" else "$numero richieste da approvare"
                            Sezione.MEZZI -> "$numero da guardare"
                            Sezione.COLLABORATORI -> "$numero con documenti scaduti"
                            Sezione.COMUNICAZIONI -> if (numero == 1) "1 messaggio da mandare" else "$numero messaggi da mandare"
                            Sezione.PORTALE -> "$numero da guardare"
                            Sezione.INTEGRAZIONI -> "$numero in Errore"
                            Sezione.RAPPORTINI -> "$numero da approvare"
                            else -> "$numero da fatturare"
                        }
                    },
                contentAlignment = Alignment.Center,
            ) { Text(if (numero > 99) "99+" else "$numero", style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = c.foglio) }
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
