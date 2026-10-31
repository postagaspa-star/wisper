package eu.stgm.wisper.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Agenda
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Attivita
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.TipoAttivita
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle

/**
 * Il calendario sul telefono (fase2.md §5, prototipo): la striscia della settimana
 * in alto coi pallini, sotto l'elenco del giorno con gli orari e i buchi liberi.
 * Toccando il titolo si passa al mese. Da un sopralluogo o un appuntamento si
 * scrive il rapportino già compilato.
 *
 * @param giorno il giorno da aprire ("2026-10-23"), o vuoto = oggi.
 */
@Composable
fun SchermataCalendario(dati: Dati, nav: Navigatore, giorno: String) {
    val c = W.colori
    val perm = LocalPermessi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val tutte by dati.attivita.collectAsStateWithLifecycle()
    val oggi = LocalDate.now()
    var sceltoTesto by rememberSaveable { mutableStateOf(runCatching { LocalDate.parse(giorno) }.getOrNull()?.toString() ?: oggi.toString()) }
    val scelto = LocalDate.parse(sceltoTesto)
    var mese by rememberSaveable { mutableStateOf(false) }
    val lunedi = scelto.with(DayOfWeek.MONDAY)
    val meseVisto = YearMonth.from(scelto)

    // Sfogliando si allarga la finestra delle attività lette.
    LaunchedEffect(meseVisto) { dati.aggiornaAttivita(meseVisto.atDay(1).minusDays(7), meseVisto.atEndOfMonth().plusDays(7)) }

    val delGiorno = Agenda.delGiorno(tutte, scelto)
    val puo = perm.modifica(Moduli.ATTIVITA)
    // Fase 5 (fase5.md §3.6): le scadenze si vedono nel loro giorno, lette da `scadenze {da, a}`: non sono attività.
    val vedeScadenze = perm.vede(Moduli.DOCUMENTI) || perm.vede(Moduli.TICKET)
    val scadenze = if (vedeScadenze) rememberLettura(meseVisto, 0) { dati.fase5.scadenzePeriodo(meseVisto.atDay(1).minusDays(7), meseVisto.atEndOfMonth().plusDays(7)) } else null
    val scadenzeAperte = (scadenze as? Lettura.Pronta)?.dato?.periodo.orEmpty().filter { it.stato == "aperta" }
    val scadenzeDelGiorno = scadenzeAperte.filter { it.data.take(10) == scelto.toString() }
    // Anche le scadenze fanno il loro pallino nel giorno.
    val scadenzePerGiorno: Map<String, Int> = scadenzeAperte.groupingBy { it.data.take(10) }.eachCount()
    // Fase 6 (fase6.md §6.5): le assenze sono una fascia sul giorno della persona ("Assente" per chi non vede il tipo),
    // quelle da approvare con "da approvare"; le chiusure dello studio su tutti. Lette da `assenze {da, a}`.
    val assenzeL = if (perm.vede(Moduli.PERSONE) && !dati.esempio) rememberLettura("assenze-$meseVisto", 0) { dati.fase6.assenzePeriodo(meseVisto.atDay(1).minusDays(7), meseVisto.atEndOfMonth().plusDays(7)) } else null
    val elencoAssenze = (assenzeL as? Lettura.Pronta)?.dato
    val assenzeDelGiorno = elencoAssenze?.assenze.orEmpty().filter { it.copre(scelto) }
    val chiusureDelGiorno = elencoAssenze?.chiusure.orEmpty().filter { it.copre(scelto) }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = if (puo) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            // ---- il titolo col mese: toccandolo si passa al mese; le frecce sfogliano
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    Modifier.weight(1f).heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable { mese = !mese }
                        .semantics { role = Role.Button; contentDescription = if (mese) "Torna alla settimana" else "Vedi il mese" },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    val nome = scelto.month.getDisplayName(TextStyle.FULL_STANDALONE, ITALIA).replaceFirstChar { it.uppercase() } +
                        if (scelto.year != oggi.year) " ${scelto.year}" else ""
                    Text(nome, style = Testi.titoloPagina, color = c.testo)
                    Icon(if (mese) Icone.su else Icone.giu, null, tint = c.tenue, modifier = Modifier.size(22.dp))
                }
                PulsanteTondo(Icone.frecciaSinistra, if (mese) "Mese prima" else "Settimana prima", {
                    sceltoTesto = (if (mese) scelto.minusMonths(1) else scelto.minusWeeks(1)).toString()
                }, dimensione = 48.dp)
                PulsanteTondo(Icone.freccia, if (mese) "Mese dopo" else "Settimana dopo", {
                    sceltoTesto = (if (mese) scelto.plusMonths(1) else scelto.plusWeeks(1)).toString()
                }, dimensione = 48.dp)
            }

            AnimatedContent(targetState = mese, transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(160)) }, label = "settimana o mese") { vediMese ->
                if (vediMese) {
                    GrigliaMese(meseVisto, scelto, oggi, tutte, scadenzePerGiorno) { g -> sceltoTesto = g.toString(); mese = false }
                } else {
                    Scheda(orizzontale = 8.dp, verticale = 12.dp) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            (0L until 7L).map { lunedi.plusDays(it) }.forEach { g ->
                                GiornoStriscia(g, g == scelto, g == oggi, (Agenda.pallini(tutte, g) + (scadenzePerGiorno[g.toString()] ?: 0)).coerceAtMost(3), Modifier.weight(1f)) { sceltoTesto = g.toString() }
                            }
                        }
                    }
                }
            }

            // ---- il giorno: gli orari, i buchi liberi, poi quelle senza ora
            Etichetta(
                when (scelto) {
                    oggi -> "Oggi"
                    oggi.plusDays(1) -> "Domani"
                    oggi.minusDays(1) -> "Ieri"
                    else -> giornoEsteso(scelto)
                },
            )
            if (chiusureDelGiorno.isNotEmpty() || assenzeDelGiorno.isNotEmpty()) SchedaElenco {
                chiusureDelGiorno.forEachIndexed { i, k -> if (i > 0) LineaElenco(); RigaVoce(k.frase, icona = Icone.calendario) }
                assenzeDelGiorno.forEachIndexed { i, a ->
                    if (i > 0 || chiusureDelGiorno.isNotEmpty()) LineaElenco()
                    RigaVoce(
                        a.persona + " · " + a.tipoVisto + if (a.dalle.isNotBlank()) " ${a.dalle}-${a.alle}" else "",
                        sotto = if (a.stato == "da_approvare") "da approvare" else if (a.dalle.isNotBlank()) "Permesso" else "Tutto il giorno",
                        inizio = { CerchioPersona(eu.stgm.wisper.rapportino.Utente("", a.persona).iniziali, 36.dp) },
                        fine = { Parola6(if (a.stato == "da_approvare") "Da approvare" else a.tipoVisto) },
                    )
                }
            }
            SchedaElenco {
                if (delGiorno.isEmpty() && scadenzeDelGiorno.isEmpty()) RigaCalma("Niente in calendario. Giornata libera.")
                scadenzeDelGiorno.forEachIndexed { i, s ->
                    if (i > 0) LineaElenco()
                    RigaVoce("Scadenza: " + s.titolo, sotto = listOf(s.cliente.ifBlank { "Studio" }, s.impianto).filter { it.isNotBlank() }.joinToString(" · "),
                        icona = Icone.bandiera, onClick = { nav.vai("scadenza/${s.id}") })
                }
                if (scadenzeDelGiorno.isNotEmpty() && delGiorno.isNotEmpty()) LineaElenco()
                val pezzi = Agenda.giornata(delGiorno)
                pezzi.forEachIndexed { i, p ->
                    if (i > 0) LineaElenco()
                    when (p) {
                        is Agenda.Pezzo.Libero -> Row(Modifier.fillMaxWidth().heightIn(min = 36.dp).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("Libero dalle ${ora(p.dalle)} alle ${ora(p.alle)}", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.firmatoTesto)
                        }
                        is Agenda.Pezzo.Impegno -> RigaImpegno(p.attivita, ana, perm.modifica(Moduli.RAPPORTINI), nav)
                    }
                }
                val senzaOra = delGiorno.filter { !it.conOra }
                if (senzaOra.isNotEmpty() && pezzi.isNotEmpty()) LineaElenco()
                senzaOra.forEachIndexed { i, a ->
                    if (i > 0) LineaElenco()
                    RigaImpegno(a, ana, perm.modifica(Moduli.RAPPORTINI), nav)
                }
            }
        }
        if (puo) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo appuntamento", { nav.vai("attivita-nuova/${TipoAttivita.APPUNTAMENTO}/$scelto") }, icona = Icone.piu)
            }
        }
    }
}

/** Un giorno della striscia: il nome breve, il numero nel cerchio (giallo quello scelto), i pallini. */
@Composable
private fun GiornoStriscia(g: LocalDate, scelto: Boolean, oggi: Boolean, pallini: Int, modifier: Modifier, onClick: () -> Unit) {
    val c = W.colori
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick)
            .semantics { role = Role.Tab; selected = scelto; contentDescription = giornoEsteso(g) + if (pallini > 0) ", $pallini impegni" else "" }
            .padding(vertical = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            g.dayOfWeek.getDisplayName(TextStyle.SHORT, ITALIA).replaceFirstChar { it.uppercase() },
            style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = if (oggi) c.testo else c.tenue,
        )
        Box(
            Modifier.size(40.dp).clip(CircleShape).background(if (scelto) c.giallo else c.superficie2)
                .let { if (oggi && !scelto) it.border(2.dp, c.testo, CircleShape) else it },
            contentAlignment = Alignment.Center,
        ) { Text("${g.dayOfMonth}", style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = if (scelto) c.suGiallo else c.testo) }
        Row(Modifier.height(8.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
            repeat(pallini) { Box(Modifier.size(5.dp).clip(CircleShape).background(c.testo2)) }
        }
    }
}

/** Il mese: i giorni in griglia coi pallini; toccandone uno si torna alla settimana su quel giorno. */
@Composable
private fun GrigliaMese(m: YearMonth, scelto: LocalDate, oggi: LocalDate, tutte: List<Attivita>, scadenze: Map<String, Int>, onGiorno: (LocalDate) -> Unit) {
    val c = W.colori
    val primo = m.atDay(1)
    val inizio = primo.with(DayOfWeek.MONDAY)
    val settimane = ((m.lengthOfMonth() + primo.dayOfWeek.value - 1) + 6) / 7
    Scheda(orizzontale = 8.dp, verticale = 12.dp, spazio = 4.dp) {
        Row(Modifier.fillMaxWidth()) {
            DayOfWeek.entries.forEach { d ->
                Text(
                    d.getDisplayName(TextStyle.NARROW, ITALIA), style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue,
                    textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
                )
            }
        }
        repeat(settimane) { s ->
            Row(Modifier.fillMaxWidth()) {
                (0L until 7L).forEach { d ->
                    val g = inizio.plusDays(s * 7L + d)
                    val dentro = YearMonth.from(g) == m
                    val n = if (dentro) (Agenda.pallini(tutte, g) + (scadenze[g.toString()] ?: 0)).coerceAtMost(3) else 0
                    Column(
                        Modifier.weight(1f).heightIn(min = 52.dp).clip(RoundedCornerShape(12.dp)).let { if (dentro) it.clickable { onGiorno(g) } else it }
                            .semantics { if (dentro) contentDescription = giornoEsteso(g) + if (n > 0) ", $n impegni" else "" },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        if (dentro) {
                            Box(
                                Modifier.size(34.dp).clip(CircleShape).background(if (g == scelto) c.giallo else Color.Transparent)
                                    .let { if (g == oggi && g != scelto) it.border(2.dp, c.testo, CircleShape) else it },
                                contentAlignment = Alignment.Center,
                            ) { Text("${g.dayOfMonth}", style = Testi.secondario.copy(fontWeight = if (g == oggi) FontWeight.ExtraBold else FontWeight.SemiBold), color = if (g == scelto) c.suGiallo else c.testo) }
                            Row(Modifier.height(7.dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                                repeat(n) { Box(Modifier.size(4.dp).clip(CircleShape).background(c.testo2)) }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Un impegno del giorno: l'ora (inizio e fine), titolo, "MR · Zanè", e Rapportino per sopralluoghi e appuntamenti. */
@Composable
private fun RigaImpegno(a: Attivita, ana: Anagrafiche, scriveRapportini: Boolean, nav: Navigatore) {
    val c = W.colori
    // Fase 5: un intervento di un ticket ha la pillola Ticket e il tocco apre il ticket (§7.3).
    val delTicket = a.tipo == TipoAttivita.INTERVENTO && a.idTicket.isNotBlank()
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable { nav.vai(if (delTicket) "ticket/${a.idTicket}" else "attivita/${a.id}") }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.width(56.dp)) {
            if (a.conOra) {
                Text(ora(a.inizio!!.toLocalTime()), style = Testi.secondario.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
                a.fine?.let { Text(ora(it.toLocalTime()), style = Testi.secondario, color = c.tenue) }
            } else {
                Text(if (a.tipo == TipoAttivita.ATTIVITA) "entro" else "tutto", style = Testi.piccolo, color = c.tenue)
                Text(if (a.tipo == TipoAttivita.ATTIVITA) "oggi" else "il giorno", style = Testi.piccolo, color = c.tenue)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                a.titolo, style = Testi.forte.copy(textDecoration = if (a.fatta) TextDecoration.LineThrough else null),
                color = if (a.fatta) c.tenue else c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            val sotto = listOfNotNull(
                inizialiDi(a, ana),
                a.luogo.ifBlank { null } ?: ana.cliente(a.idCliente)?.nome ?: a.nomeCliente.ifBlank { null },
            ).joinToString(" · ")
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondario, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (delTicket) Parola5("Ticket", colore = eu.stgm.wisper.rapportino.ColoreFase5.BLU)
        else if (scriveRapportini && a.tipo != TipoAttivita.ATTIVITA && a.idCliente.isNotBlank()) {
            PulsanteRiga("Rapportino", { nav.nuovoRapportino(a.giorno ?: LocalDate.now(), a.idCliente, a.idCommessa.ifBlank { null }) })
        }
    }
}
