package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.NuoveVersioni
import eu.stgm.wisper.Riepiloghi
import eu.stgm.wisper.Riepiloghi.TipoGiorno
import eu.stgm.wisper.rapportino.Giornate
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Rapportino
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

/*
 * "Il tuo giorno" (docs/gestionale/fase1-schermate.md §3, punto 2): la vecchia
 * casa Oggi, com'era, in cima alla Dashboard di chi scrive rapportini. La
 * settimana coi giorni che mancano, il rapportino di oggi coi suoi lavori (o Scrivi
 * il rapportino e Come ieri), i lavori da inviare, il mese, e la pillola della rete
 * in fondo alla pagina.
 */

/** Il foglio (dalla fase 1 il server) ha rifiutato qualcosa: una scheda rossa tenue in cima, con Riprova e Scarta. */
@Composable
fun AvvisoRifiuto(dati: Dati) {
    val c = W.colori
    val operazioni by dati.operazioni.collectAsStateWithLifecycle()
    val rifiutata = operazioni.firstOrNull { it.rifiutata } ?: return
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.rossoTenue).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(eu.stgm.wisper.rapportino.TestiCoda.rifiutata(rifiutata.tipo), style = Testi.forte, color = c.rossoTesto)
        Text(rifiutata.errore, style = Testi.secondario, color = c.testo2)
        Row {
            PulsanteTesto("Riprova", { dati.riprova(rifiutata.idOp) }, colore = c.testo)
            PulsanteTesto("Scarta", { dati.scarta(rifiutata.idOp) }, colore = c.rossoTesto)
        }
    }
}

/**
 * La scheda "Il tuo giorno": la settimana e, sotto, il rapportino di oggi coi suoi
 * lavori (rapportino-lavori.md §5.3). Poi la riga dei lavori da inviare, il mese e
 * la versione nuova.
 *
 * @param costi senza il permesso dei soldi i totali non si scrivono.
 */
@Composable
fun IlTuoGiorno(
    dati: Dati,
    costi: Boolean,
    onNuovo: (LocalDate) -> Unit,
    onComeIeri: (Rapportino) -> Unit,
    onApri: (String) -> Unit,
    onApriLavoro: (String) -> Unit,
    onMese: () -> Unit,
    onDaInviare: () -> Unit,
    /** Nei Rapportini (09/11/2026): solo la settimana e il rapportino di oggi, l'elenco sotto dice il resto. */
    soloGiorno: Boolean = false,
) {
    val c = W.colori
    val visita = LocalVisita.current
    val viste by dati.viste.collectAsStateWithLifecycle()
    val oggi = LocalDate.now()
    val diOggi = viste.filter { it.rapportino.data == oggi }
    val ieri = Riepiloghi.ultimo(viste, oggi)
    // Fase 6 (§6.5): ferie, festa e chiusure non sono giorni che mancano (anche senza rete: le copie lette per ultime).
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var assenze by remember { mutableStateOf(dati.fase6.assenzeLette()) }
    var chiusure by remember { mutableStateOf(dati.fase6.chiusureLette()) }
    if (LocalPermessi.current.vede(eu.stgm.wisper.rapportino.Moduli.PERSONE) && !dati.esempio) LaunchedEffect(Unit) {
        dati.fase6.assenze().onSuccess { assenze = it.assenze }
        dati.fase6.chiusure().onSuccess { chiusure = it }
    }
    val lunedi = oggi.with(java.time.DayOfWeek.MONDAY)
    val liberi = remember(assenze, chiusure, sessione.idPersona, ana) {
        dati.fase6.giorniLiberi(lunedi, lunedi.plusDays(6), sessione.idPersona, ana.impostazione("FESTA_PATRONO"), assenze, chiusure)
    }
    val settimana = Riepiloghi.settimana(viste, oggi, liberi)
    val daInviare = Riepiloghi.daInviare(viste)
    val delMese = viste.filter { YearMonth.from(it.rapportino.data) == YearMonth.from(oggi) }

    Scheda(Modifier.bersaglio("giorno"), orizzontale = 18.dp, verticale = 18.dp, raggio = 22.dp, spazio = 14.dp) {
        val passati = settimana.count { it.tipo != TipoGiorno.FUTURO && it.data.dayOfWeek.value <= 5 }
        val fatti = settimana.count { (it.tipo == TipoGiorno.FATTO || it.tipo == TipoGiorno.OGGI_FATTO) && it.data.dayOfWeek.value <= 5 }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Etichetta("Il tuo giorno", Modifier.weight(1f))
            Text("$fatti di $passati " + if (passati == 1) "giorno" else "giorni", style = Testi.secondario, color = c.tenue)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            settimana.forEach { g -> GiornoSettimana(g, Modifier.weight(1f), onNuovo, onMese) }
        }
        if (diOggi.isEmpty()) {
            val weekend = oggi.dayOfWeek.value >= 6
            Text(
                if (weekend) "Oggi è ${oggi.dayOfWeek.getDisplayName(TextStyle.FULL, IT)}" else "Il rapportino di oggi non l'hai ancora scritto",
                style = Testi.titoloScheda, color = c.testo,
            )
            // Nei Rapportini il pulsante giallo della pagina è Nuovo rapportino: uno solo per schermata.
            if (!soloGiorno) PulsantePrincipale(
                if (weekend) "Scrivi comunque" else "Scrivi il rapportino",
                { visita?.azione("scrivi"); onNuovo(oggi) },
                Modifier.bersaglio("scrivi"),
                icona = Icone.piu,
            )
            if (ieri != null) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 60.dp).clip(RoundedCornerShape(16.dp)).background(c.foglio)
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
                            style = Testi.secondario, color = c.tenue,
                        )
                    }
                    Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
                }
            }
        } else {
            // Il rapportino di oggi (di solito uno: il tuo; chi vede tutto vede anche quelli dei colleghi) coi suoi lavori.
            Giornate.raggruppa(diOggi) { it.rapportino }.forEach { g ->
                val lavori = g.voci.map { it.rapportino }
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(16.dp)).clickable { onApri(lavori.first().idLocale) }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(c.testo), contentAlignment = Alignment.Center) {
                        Icon(Icone.spunta, null, tint = c.foglio, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        val diAltri = g.tecnico.isNotBlank() && dati.tecnico.isNotBlank() && g.tecnico != dati.tecnico
                        Text(if (diAltri) "Rapportino di ${g.tecnico}" else "Il rapportino di oggi", style = Testi.titoloSezione, color = c.testo)
                        RigaAPezzi(
                            listOf(
                                Giornate.lavori(lavori.size), Giornate.perClienti(Giornate.quantiClienti(lavori)), Numeri.ore(lavori.sumOf { it.oreTotali }),
                                if (costi) Numeri.euro(g.voci.sumOf { it.conto?.totale ?: 0.0 }) else "",
                            ),
                            Testi.secondario, c.tenue,
                        )
                    }
                    Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
                }
                g.voci.forEach { v ->
                    val r = v.rapportino
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable { onApriLavoro(r.idLocale) }
                            .padding(start = 52.dp, top = 4.dp, bottom = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(r.cliente.ifBlank { "Senza cliente" }, style = Testi.forte, color = c.testo)
                            Text(
                                listOfNotNull(Numeri.ore(r.oreTotali), r.descrizione.takeIf { it.isNotBlank() }).joinToString(" · "),
                                style = Testi.secondario, color = c.tenue,
                            )
                        }
                        // Lo stato solo se non e' piu' da inviare (come le schede dei lavori nel rapportino).
                        if (!r.daInviare) {
                            Spacer(Modifier.width(8.dp))
                            ParolaStato(r.stato)
                        }
                    }
                }
            }
            PulsanteBordo("Aggiungi un lavoro", { onNuovo(oggi) }, Modifier.fillMaxWidth(), icona = Icone.piu)
        }
    }

    if (soloGiorno) return

    // ---------------------------------------------------------- da inviare
    if (daInviare.isNotEmpty()) {
        val clienti = daInviare.map { it.rapportino.cliente.ifBlank { "Senza cliente" } }.distinct()
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.scheda)
                .border(1.dp, c.bordoScheda, RoundedCornerShape(20.dp)).clickable(onClick = onDaInviare)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(44.dp).clip(CircleShape).background(c.gialloTenue), contentAlignment = Alignment.Center) {
                Icon(Icone.invia, null, tint = c.gialloTesto, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(Giornate.lavori(daInviare.size) + " da inviare", style = Testi.forte, color = c.testo)
                // I primi due clienti e quanti altri: si legge tutto, niente puntini.
                Text(
                    clienti.take(2).joinToString(", ") + when (val altri = clienti.size - 2) {
                        in Int.MIN_VALUE..0 -> ""
                        1 -> " e un altro"
                        else -> " e altri $altri"
                    },
                    style = Testi.secondario, color = c.tenue,
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
                "${Numeri.scrivi(delMese.sumOf { it.rapportino.oreTotali })} h" +
                    if (costi) " · ${Numeri.euro(delMese.sumOf { it.conto?.totale ?: 0.0 })}" else "",
                style = Testi.titoloSezione.copy(fontSize = Testi.titoloSezione.fontSize * 1.1f), color = c.testo,
            )
        }
        Text("Il mese", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.collegamento)
        Icon(Icone.freccia, null, tint = c.collegamento, modifier = Modifier.size(16.dp))
    }

    VersioneNuova(dati)
}

/**
 * Di solito la versione nuova si installa da sola ad app chiusa; questa riga c'è
 * solo se il telefono ha chiesto un tocco per installarla.
 */
@Composable
fun VersioneNuova(dati: Dati) {
    val c = W.colori
    val versioni by NuoveVersioni.stato.collectAsStateWithLifecycle()
    // 13/11/2026: sempre quando è pronta (prima solo se il telefono aveva già chiesto il tocco, e così non si vedeva mai).
    if (dati.esempio || versioni.pronta == null) return
    val ctx = LocalContext.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.scheda)
            .border(1.dp, c.bordoScheda, RoundedCornerShape(20.dp))
            .clickable { NuoveVersioni.installa(ctx, chiesto = true) }
            .bersaglio("versione-nuova")
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

/** La pillola grigia e calma della rete, in fondo alla pagina: mai rossa, niente è perso. */
@Composable
fun PillolaReteRapportini(dati: Dati, modifier: Modifier = Modifier) {
    val operazioni by dati.operazioni.collectAsStateWithLifecycle()
    // Dalla fase 3 in coda ci sono anche ore e spese: la frase dice cosa aspetta.
    eu.stgm.wisper.rapportino.TestiCoda.inAttesa(operazioni)?.let { testo ->
        PillolaRete(testo, modifier.padding(horizontal = 20.dp, vertical = 16.dp))
    }
}

@Composable
private fun GiornoSettimana(g: Riepiloghi.Giorno, modifier: Modifier, onNuovo: (LocalDate) -> Unit, onMese: () -> Unit) {
    val c = W.colori
    val nome = g.data.dayOfWeek.getDisplayName(TextStyle.SHORT, IT).replaceFirstChar { it.uppercase() } + " " + g.data.dayOfMonth
    val toccabile = when (g.tipo) {
        TipoGiorno.MANCA, TipoGiorno.OGGI -> Modifier.clickable { onNuovo(g.data) }
        TipoGiorno.FATTO, TipoGiorno.OGGI_FATTO -> Modifier.clickable(onClick = onMese)
        TipoGiorno.FUTURO, TipoGiorno.LIBERO -> Modifier
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
                Icon(Icone.spunta, null, tint = c.foglio, modifier = Modifier.size(20.dp))
            }
            TipoGiorno.MANCA -> Box(
                Modifier.size(44.dp).bordoTratteggiato(c.gialloTesto, 22.dp),
                contentAlignment = Alignment.Center,
            ) { Icon(Icone.piu, null, tint = c.gialloTesto, modifier = Modifier.size(18.dp)) }
            TipoGiorno.OGGI -> Box(Modifier.size(44.dp).clip(CircleShape).background(c.giallo), contentAlignment = Alignment.Center) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(c.suGiallo))
            }
            TipoGiorno.FUTURO -> Box(Modifier.size(44.dp).clip(CircleShape).background(c.superficie2))
            TipoGiorno.LIBERO -> Box(Modifier.size(44.dp).clip(CircleShape).background(c.superficie2), contentAlignment = Alignment.Center) {
                Icon(if (g.parola == "ferie" || g.parola == "assente") Icone.valigia else Icone.calendario, null, tint = c.tenue, modifier = Modifier.size(18.dp))
            }
        }
        Text(
            when (g.tipo) {
                TipoGiorno.FATTO, TipoGiorno.OGGI_FATTO -> Numeri.ore(g.ore)
                TipoGiorno.MANCA -> "manca"
                TipoGiorno.OGGI -> "oggi"
                TipoGiorno.FUTURO -> " "
                TipoGiorno.LIBERO -> g.parola
            },
            style = Testi.piccolo.copy(fontWeight = if (g.tipo == TipoGiorno.MANCA || g.tipo == TipoGiorno.OGGI) FontWeight.Bold else FontWeight.SemiBold),
            color = when (g.tipo) { TipoGiorno.MANCA -> c.gialloTesto; TipoGiorno.OGGI -> c.testo; else -> c.tenue },
        )
    }
}
