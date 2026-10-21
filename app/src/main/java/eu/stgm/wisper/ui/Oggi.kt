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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.platform.LocalContext
import eu.stgm.wisper.Dati
import eu.stgm.wisper.NuoveVersioni
import eu.stgm.wisper.Riepiloghi
import eu.stgm.wisper.Riepiloghi.TipoGiorno
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Stato
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private val IT = Locale.ITALY

/** "Come ieri" solo se è davvero ieri; se no il giorno, perché si capisca cosa si ricopia. */
private fun comeQuando(d: LocalDate, oggi: LocalDate = LocalDate.now()): String {
    val giorni = java.time.temporal.ChronoUnit.DAYS.between(d, oggi)
    return when {
        giorni == 1L -> "Come ieri"
        giorni in 2..6 -> "Come " + d.dayOfWeek.getDisplayName(TextStyle.FULL, IT)
        else -> "Come il " + d.format(DateTimeFormatter.ofPattern("d MMMM", IT))
    }
}

/**
 * La casa (docs/aspetto.md §3): in cima la settimana coi giorni che mancano, poi
 * "il rapportino di oggi è scritto?", poi quello che c'è da far firmare.
 * L'elenco dei rapportini sta nel Mese, non qui.
 */
@Composable
fun SchermataOggi(
    dati: Dati,
    onNuovo: (LocalDate) -> Unit,
    onComeIeri: (Rapportino) -> Unit,
    onApri: (String) -> Unit,
    onMese: () -> Unit,
    onImpostazioni: () -> Unit,
    onFineMese: () -> Unit = {},
    onDaFirmare: () -> Unit = onMese,
) {
    val c = W.colori
    val visita = LocalVisita.current
    val viste by dati.viste.collectAsStateWithLifecycle()
    val operazioni by dati.operazioni.collectAsStateWithLifecycle()
    val oggi = LocalDate.now()

    val diOggi = viste.filter { it.rapportino.data == oggi }
    val ieri = Riepiloghi.ultimo(viste, oggi)
    val settimana = Riepiloghi.settimana(viste, oggi)
    val daFirmare = Riepiloghi.daFirmare(viste)
    val delMese = viste.filter { YearMonth.from(it.rapportino.data) == YearMonth.from(oggi) }
    val inAttesa = operazioni.count { !it.rifiutata }
    val rifiutata = operazioni.firstOrNull { it.rifiutata }
    val nome = dati.tecnico.substringBefore(' ').trim()
    val sigla = dati.tecnico.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase().ifBlank { "?" }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 10.dp, bottom = 90.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(Modifier.fillMaxWidth().height(48.dp), verticalAlignment = Alignment.CenterVertically) {
                Simbolo()
                Spacer(Modifier.width(10.dp))
                Text("Wisper", style = Testi.titoloSezione.copy(fontSize = Testi.titoloSezione.fontSize * 1.05f), color = c.testo)
                Spacer(Modifier.weight(1f))
                Box(
                    Modifier.size(44.dp).clip(CircleShape).background(c.superficie2).clickable(onClick = onImpostazioni)
                        .semantics { contentDescription = "Impostazioni" },
                    contentAlignment = Alignment.Center,
                ) { Text(sigla, style = Testi.forte.copy(fontSize = Testi.secondarioGrande.fontSize), color = c.testo) }
            }

            if (rifiutata != null) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.rossoTenue).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text("Il foglio non ha accettato un rapportino", style = Testi.forte, color = c.rossoTesto)
                    Text(rifiutata.errore, style = Testi.secondario, color = c.testo2)
                    Row {
                        PulsanteTesto("Riprova", { dati.riprova(rifiutata.idOp) }, colore = c.testo)
                        PulsanteTesto("Scarta", { dati.scarta(rifiutata.idOp) }, colore = c.rossoTesto)
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(oggi.format(DateTimeFormatter.ofPattern("EEEE d MMMM", IT)).replaceFirstChar { it.uppercase() }, style = Testi.secondarioGrande, color = c.tenue)
                Text(
                    Riepiloghi.saluto() + if (nome.isNotBlank()) ", $nome" else "",
                    style = Testi.titoloPagina, color = c.testo,
                )
            }

            // ---------------------------------------------------------- la settimana
            // In cima, come chiede lo studio: prima si vede la settimana, poi il rapportino di oggi.
            Scheda(orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp, spazio = 14.dp) {
                val passati = settimana.count { it.tipo != TipoGiorno.FUTURO && it.data.dayOfWeek.value <= 5 }
                val fatti = settimana.count { (it.tipo == TipoGiorno.FATTO || it.tipo == TipoGiorno.OGGI_FATTO) && it.data.dayOfWeek.value <= 5 }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Etichetta("Questa settimana", Modifier.weight(1f))
                    Text("$fatti di $passati giorni", style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.testo)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    settimana.forEach { g -> GiornoSettimana(g, Modifier.weight(1f), onNuovo, onMese) }
                }
            }

            // ---------------------------------------------------------- il rapportino di oggi
            Scheda(Modifier.bersaglio("giorno"), orizzontale = 20.dp, verticale = 20.dp, raggio = 24.dp, spazio = 14.dp) {
                Etichetta("Il rapportino di oggi")
                if (diOggi.isEmpty()) {
                    val weekend = oggi.dayOfWeek.value >= 6
                    Text(
                        if (weekend) "Oggi è ${oggi.dayOfWeek.getDisplayName(TextStyle.FULL, IT)}" else "Non l'hai ancora scritto",
                        style = Testi.titoloScheda, color = c.testo,
                    )
                    PulsantePrincipale(
                        if (weekend) "Scrivi comunque" else "Scrivi il rapportino",
                        { visita?.azione("scrivi"); onNuovo(oggi) },
                        Modifier.bersaglio("scrivi"),
                        icona = Icone.piu,
                    )
                    if (ieri != null) {
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 60.dp).clip(RoundedCornerShape(16.dp)).background(c.fondo)
                                .clickable { onComeIeri(ieri) }.padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icone.copia, null, tint = c.testo, modifier = Modifier.size(22.dp))
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(comeQuando(ieri.data), style = Testi.forte, color = c.testo)
                                Text(
                                    listOf(ieri.cliente, ieri.commessa.takeIf { it.isNotBlank() }, Numeri.ore(ieri.oreTotali), "${Numeri.scrivi(ieri.km)} km")
                                        .filterNotNull().joinToString(" · "),
                                    style = Testi.secondario, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
                        }
                    }
                } else {
                    diOggi.forEach { v ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { onApri(v.rapportino.idLocale) }.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(Modifier.size(40.dp).clip(CircleShape).background(c.testo), contentAlignment = Alignment.Center) {
                                Icon(Icone.spunta, null, tint = c.scheda, modifier = Modifier.size(20.dp))
                            }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Fatto: ${v.rapportino.cliente}", style = Testi.titoloSezione, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    Numeri.ore(v.rapportino.oreTotali) + (v.conto?.let { " · " + Numeri.euro(it.totale) } ?: ""),
                                    style = Testi.secondario, color = c.tenue,
                                )
                            }
                            ParolaStato(v.rapportino.stato)
                        }
                    }
                    PulsanteBordo("Aggiungi un altro rapportino", { onNuovo(oggi) }, Modifier.fillMaxWidth(), icona = Icone.piu)
                }
            }

            // ---------------------------------------------------------- fine mese
            // Negli ultimi giorni del mese, se c'è qualcosa da fatturare: porta all'Ufficio.
            val pronti = delMese.filter { it.rapportino.stato == Stato.FIRMATO || it.rapportino.stato == Stato.INVIATO }
            if (pronti.isNotEmpty() && oggi.dayOfMonth >= 20) {
                val clientiPronti = pronti.map { it.rapportino.idCliente.ifBlank { it.rapportino.cliente } }.distinct().size
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.scheda)
                        .border(1.dp, c.bordoScheda, RoundedCornerShape(20.dp)).clickable(onClick = onFineMese)
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(44.dp).clip(CircleShape).background(c.gialloTenue), contentAlignment = Alignment.Center) {
                        Icon(Icone.scontrino, null, tint = c.gialloTesto, modifier = Modifier.size(22.dp))
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Fine mese", style = Testi.forte, color = c.testo)
                        Text(
                            (if (clientiPronti == 1) "1 cliente da fatturare" else "$clientiPronti clienti da fatturare") + " · " + Numeri.euro(pronti.sumOf { it.conto?.totale ?: 0.0 }),
                            style = Testi.secondario, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
                }
            }

            // ---------------------------------------------------------- da far firmare
            if (daFirmare.isNotEmpty()) {
                val clienti = daFirmare.map { it.rapportino.cliente }.distinct()
                val giorni = daFirmare.sortedBy { it.rapportino.data }.map { it.rapportino.data.dayOfMonth.toString() }
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.scheda)
                        .border(1.dp, c.bordoScheda, RoundedCornerShape(20.dp)).clickable(onClick = onDaFirmare)
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(44.dp).clip(CircleShape).background(c.gialloTenue), contentAlignment = Alignment.Center) {
                        Icon(Icone.firma, null, tint = c.gialloTesto, modifier = Modifier.size(22.dp))
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (daFirmare.size == 1) "1 da far firmare" else "${daFirmare.size} da far firmare", style = Testi.forte, color = c.testo)
                        Text(
                            clienti.take(2).joinToString(", ") + ", " + giorni.joinToString(" e ").let { if (giorni.size > 3) giorni.take(3).joinToString(", ") + "…" else it },
                            style = Testi.secondario, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
                }
            }

            // ---------------------------------------------------------- il mese
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = onMese).padding(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Etichetta(oggi.format(DateTimeFormatter.ofPattern("LLLL", IT)))
                    Text(
                        "${Numeri.scrivi(delMese.sumOf { it.rapportino.oreTotali })} h · ${Numeri.euro(delMese.sumOf { it.conto?.totale ?: 0.0 })}",
                        style = Testi.titoloSezione.copy(fontSize = Testi.titoloSezione.fontSize * 1.1f), color = c.testo,
                    )
                }
                Text("Il mese", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
                Icon(Icone.freccia, null, tint = c.gialloTesto, modifier = Modifier.size(16.dp))
            }

            // ---------------------------------------------------------- versione nuova
            // Di solito si installa da sola ad app chiusa; questa riga c'è solo se il
            // telefono ha chiesto un tocco per installarla.
            val versioni by NuoveVersioni.stato.collectAsStateWithLifecycle()
            if (!dati.esempio && versioni.pronta != null && versioni.attesaConferma) {
                val ctx = LocalContext.current
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.scheda)
                        .border(1.dp, c.bordoScheda, RoundedCornerShape(20.dp))
                        .clickable { NuoveVersioni.installa(ctx, chiesto = true) }
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Simbolo(dimensione = 44.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Versione nuova di Wisper", style = Testi.forte, color = c.testo)
                        Text("La ${versioni.nome} è pronta: tocca per installarla", style = Testi.secondario, color = c.tenue)
                    }
                    Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
                }
            }
        }

        if (inAttesa > 0) {
            PillolaRete(
                if (inAttesa == 1) "1 rapportino parte appena c'è rete" else "$inAttesa rapportini partono appena c'è rete",
                Modifier.align(Alignment.BottomCenter).padding(horizontal = 20.dp, vertical = 16.dp),
            )
        }
    }
}

@Composable
private fun GiornoSettimana(g: Riepiloghi.Giorno, modifier: Modifier, onNuovo: (LocalDate) -> Unit, onMese: () -> Unit) {
    val c = W.colori
    val nome = g.data.dayOfWeek.getDisplayName(TextStyle.SHORT, IT).replaceFirstChar { it.uppercase() } + " " + g.data.dayOfMonth
    val toccabile = when (g.tipo) {
        TipoGiorno.MANCA, TipoGiorno.OGGI -> Modifier.clickable { onNuovo(g.data) }
        TipoGiorno.FATTO, TipoGiorno.OGGI_FATTO -> Modifier.clickable(onClick = onMese)
        TipoGiorno.FUTURO -> Modifier
    }
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).then(toccabile).padding(vertical = 2.dp)
            .then(if (g.tipo == TipoGiorno.MANCA) Modifier.bersaglio("manca") else Modifier),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val oggi = g.tipo == TipoGiorno.OGGI || g.tipo == TipoGiorno.OGGI_FATTO
        Text(nome, style = if (oggi) Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold) else Testi.piccolo.copy(fontWeight = FontWeight.Bold),
            color = when (g.tipo) { TipoGiorno.FUTURO -> c.moltoTenue; TipoGiorno.OGGI, TipoGiorno.OGGI_FATTO -> c.testo; else -> c.tenue })
        when (g.tipo) {
            TipoGiorno.FATTO, TipoGiorno.OGGI_FATTO -> Box(Modifier.size(44.dp).clip(CircleShape).background(c.testo), contentAlignment = Alignment.Center) {
                Icon(Icone.spunta, null, tint = c.scheda, modifier = Modifier.size(20.dp))
            }
            TipoGiorno.MANCA -> Box(
                Modifier.size(44.dp).bordoTratteggiato(c.gialloTesto, 22.dp),
                contentAlignment = Alignment.Center,
            ) { Icon(Icone.piu, null, tint = c.gialloTesto, modifier = Modifier.size(18.dp)) }
            TipoGiorno.OGGI -> Box(Modifier.size(44.dp).clip(CircleShape).background(c.giallo), contentAlignment = Alignment.Center) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(c.suGiallo))
            }
            TipoGiorno.FUTURO -> Box(Modifier.size(44.dp).clip(CircleShape).background(c.superficie2))
        }
        Text(
            when (g.tipo) {
                TipoGiorno.FATTO, TipoGiorno.OGGI_FATTO -> Numeri.ore(g.ore)
                TipoGiorno.MANCA -> "manca"
                TipoGiorno.OGGI -> "oggi"
                TipoGiorno.FUTURO -> " "
            },
            style = Testi.piccolo.copy(fontWeight = if (g.tipo == TipoGiorno.MANCA || g.tipo == TipoGiorno.OGGI) FontWeight.Bold else FontWeight.SemiBold),
            color = when (g.tipo) { TipoGiorno.MANCA -> c.gialloTesto; TipoGiorno.OGGI -> c.testo; else -> c.tenue },
        )
    }
}
