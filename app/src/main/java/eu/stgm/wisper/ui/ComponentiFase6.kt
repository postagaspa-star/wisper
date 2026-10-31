@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import eu.stgm.wisper.rapportino.Assenza
import eu.stgm.wisper.rapportino.Attrezzatura
import eu.stgm.wisper.rapportino.Chiusura
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.ContiMezzi
import eu.stgm.wisper.rapportino.ContiPersone
import eu.stgm.wisper.rapportino.Mezzo
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Saldo
import eu.stgm.wisper.rapportino.dataBreve
import eu.stgm.wisper.rapportino.dataDi
import eu.stgm.wisper.rapportino.dataIt
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/*
 * I pezzi comuni delle schermate della fase 6 (fase6.md §12): le parole di stato coi
 * loro colori (sempre insieme), la striscia delle assenze, il saldo, le righe di
 * persone, assenze, strumenti e mezzi.
 */

/** Il colore di una parola della fase 6 (fase6.md §12, "Colori sempre con la parola"). */
object ColoreFase6 {
    fun di(parola: String): String {
        val p = parola.trim()
        return when {
            p.startsWith("Taratura scaduta") || p.startsWith("Verifica scaduta") || p == "Non conforme" || p.startsWith("Fuori uso") || p.startsWith("Fermo") ||
                p.startsWith("Scadut") || p == "Respinta" || p == "Documenti scaduti" || p == "Non idoneo" || p == "Male" || p == "Sotto zero" || p == "Oltre il rientro" -> ColoreFase5.ROSSO
            p.startsWith("Scade") || p.startsWith("Taratura fra") || p.startsWith("Verifica fra") || p.startsWith("Taratura scade") || p == "In officina" ||
                p == "Manca qualcosa" || p == "Idoneo con prescrizioni" || p == "Con qualche problema" || p.startsWith("Non idoneo per") -> ColoreFase5.AMBRA
            p == "Da approvare" || p == "Bozza" || p == "Da completare" || p == "Da firmare" -> ColoreFase5.GIALLO
            p.startsWith("Assegnato") || p.startsWith("In prestito") || p == "In taratura" || p == "In verifica" || p == "In riparazione" || p == "Affidato" || p == "Permesso" -> ColoreFase5.BLU
            p == "Disponibile" || p.startsWith("Tarato") || p.startsWith("Verificato") || p == "Valida" || p == "Approvata" || p == "In regola" || p == "Idoneo" ||
                p == "Concluso" || p == "Bene" || p == "Ferie" || p == "Firmata" || p == "Risolto" -> ColoreFase5.VERDE
            else -> ColoreFase5.GRIGIO
        }
    }
}

/** Una parola di stato della fase 6 col suo colore. */
@Composable
internal fun Parola6(parola: String, modifier: Modifier = Modifier, colore: String? = null) {
    if (parola.isBlank()) return
    val (testo, fondo) = coloriFase5(colore ?: ColoreFase6.di(parola))
    Pillolina(parola, testo, fondo, modifier)
}

/** Il permesso di scrivere nei moduli della fase 6. */
@Composable
internal fun scrive6(modulo: String): Boolean = LocalPermessi.current.modifica(modulo)

/** Un contatore per rileggere le schermate della fase 6 dopo un'azione. */
internal object Giri6 {
    var persone by mutableIntStateOf(0)
    var mezzi by mutableIntStateOf(0)
    var collaboratori by mutableIntStateOf(0)
}

/** "lunedì 2 novembre". */
internal fun giornoLungo(iso: String): String = dataDi(iso)?.format(DateTimeFormatter.ofPattern("EEEE d MMMM", ITALIA)).orEmpty()

/** "fino a venerdì", "fino a venerdì 23" (oltre la settimana). */
internal fun finoA(iso: String, oggi: LocalDate = LocalDate.now()): String {
    val d = dataDi(iso) ?: return ""
    val nome = d.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, ITALIA)
    return if (!d.isAfter(oggi.plusDays(6))) "fino a $nome" else "fino a $nome ${d.dayOfMonth}"
}

/** "Dal 2 al 6 novembre", "Venerdì 30 ottobre · 15:00-18:00". */
internal fun quandoAssenza(a: Assenza): String {
    val dal = dataDi(a.dal) ?: return ""
    val al = dataDi(a.al) ?: dal
    val f = DateTimeFormatter.ofPattern("d MMMM", ITALIA)
    return when {
        a.dalle.isNotBlank() -> giornoLungo(a.dal).replaceFirstChar { it.uppercase() } + " · ${a.dalle}-${a.alle}"
        dal == al -> giornoLungo(a.dal).replaceFirstChar { it.uppercase() } + if (a.mezza.isNotBlank()) " · " + a.mezza else ""
        dal.month == al.month -> "Dal ${dal.dayOfMonth} al " + al.format(f)
        else -> "Dal " + dal.format(f) + " al " + al.format(f)
    }
}

/** "5 giorni", "mezza giornata", "3 ore". */
internal fun quantoAssenza(a: Assenza): String = when {
    a.giorni == 0.5 -> "mezza giornata"
    a.giorni > 0 -> Testo.quanti(a.giorni.toInt(), "giorno", "giorni").let { if (a.giorni % 1 != 0.0) Numeri.scrivi(a.giorni) + " giorni" else it }
    else -> Numeri.scrivi(a.ore) + if (a.ore == 1.0) " ora" else " ore"
}

/** Una riga di un'assenza: icona nel colore del tipo, chi (se serve), cosa, quando, la parola dello stato. */
@Composable
internal fun RigaAssenza(a: Assenza, conPersona: Boolean, sotto: String? = null, onClick: (() -> Unit)? = null) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 68.dp).let { if (onClick != null) it.clickable(onClick = onClick).semantics { role = Role.Button } else it }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (conPersona) CerchioPersona(eu.stgm.wisper.rapportino.Utente("", a.persona).iniziali, 40.dp)
        else IconaColorata(Icone.valigia, ColoreFase6.di(a.tipoVisto).takeIf { it == ColoreFase5.VERDE || it == ColoreFase5.BLU } ?: ColoreFase5.GRIGIO)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text((if (conPersona) a.persona + " · " else "") + a.tipoVisto, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(quandoAssenza(a) + " · " + quantoAssenza(a), style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 2)
            if (!sotto.isNullOrBlank()) Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto, maxLines = 3)
            if (a.stato == "respinta" && a.motivoRifiuto.isNotBlank()) Text("Motivo: " + a.motivoRifiuto, style = Testi.secondario, color = c.testo2, maxLines = 3)
            FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Parola6(a.statoVisto)
                if (a.inCoda) PillolaInCoda()
            }
        }
        if (onClick != null) Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.padding(top = 10.dp).size(18.dp))
    }
}

/**
 * La striscia delle prossime settimane (§12.1): una riga per persona, i giorni assenti
 * pieni (verde Ferie, blu Permesso, grigio Assente), tratteggiati quelli da approvare,
 * le chiusure su tutti; sotto la legenda con le parole (mai solo il colore).
 */
@Composable
internal fun StrisciaAssenze(persone: List<Pair<String, String>>, assenze: List<Assenza>, chiusure: List<Chiusura>, festivi: Set<LocalDate>, giorni: Int = 14, oggi: LocalDate = LocalDate.now()) {
    val c = W.colori
    val elenco = (0 until giorni).map { oggi.plusDays(it.toLong()) }
    Scheda(orizzontale = 12.dp, verticale = 12.dp, spazio = 6.dp) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Spacer(Modifier.width(36.dp))
            elenco.forEach { g ->
                Text(
                    "${g.dayOfMonth}", style = Testi.piccolo.copy(fontWeight = if (g == oggi) FontWeight.ExtraBold else FontWeight.Bold),
                    color = if (g == oggi) c.testo else if (g.dayOfWeek.value >= 6 || g in festivi) c.moltoTenue else c.tenue,
                    textAlign = TextAlign.Center, modifier = Modifier.weight(1f), maxLines = 1,
                )
            }
        }
        persone.forEach { (id, nome) ->
            Row(Modifier.fillMaxWidth().height(32.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(36.dp)) { CerchioPersona(eu.stgm.wisper.rapportino.Utente("", nome).iniziali, 28.dp) }
                elenco.forEach { g ->
                    val libero = g.dayOfWeek.value >= 6 || g in festivi
                    val chiuso = chiusure.any { it.copre(g) }
                    val a = assenze.firstOrNull { it.idPersona == id && it.copre(g) }
                    val (fondo, tratteggio) = when {
                        libero -> c.superficie2.copy(alpha = 0.5f) to false
                        a != null && a.stato == "da_approvare" -> Color.Transparent to true
                        a != null && a.tipoVisto == "Ferie" -> c.firmatoTesto.copy(alpha = 0.75f) to false
                        a != null && a.tipoVisto == "Permesso" -> c.inviatoTesto.copy(alpha = 0.7f) to false
                        a != null -> c.moltoTenue.copy(alpha = 0.6f) to false
                        chiuso -> c.moltoTenue.copy(alpha = 0.35f) to false
                        else -> Color.Transparent to false
                    }
                    Box(Modifier.weight(1f).padding(horizontal = 1.dp).height(22.dp), contentAlignment = Alignment.Center) {
                        Box(
                            Modifier.fillMaxWidth().height(22.dp).clip(RoundedCornerShape(5.dp)).background(fondo)
                                .let { if (tratteggio) it.bordoTratteggiato(c.gialloTesto, 5.dp) else it },
                        )
                    }
                }
            }
        }
        FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Legenda("Ferie", c.firmatoTesto.copy(alpha = 0.75f))
            Legenda("Permesso", c.inviatoTesto.copy(alpha = 0.7f))
            Legenda("Assente", c.moltoTenue.copy(alpha = 0.6f))
            Legenda("Da approvare", null)
            if (chiusure.any { ch -> elenco.any { ch.copre(it) } }) Legenda("Studio chiuso", c.moltoTenue.copy(alpha = 0.35f))
        }
    }
}

@Composable
private fun Legenda(parola: String, colore: Color?) {
    val c = W.colori
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(12.dp).clip(RoundedCornerShape(3.dp)).let { if (colore != null) it.background(colore) else it.bordoTratteggiato(c.gialloTesto, 3.dp) })
        Text(parola, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue)
    }
}

/** I due numeri grandi del saldo: "13 giorni di ferie", "24 ore di permesso", e sotto da dove viene e quanto resta. */
@Composable
internal fun SaldoBox(ferie: Saldo?, permessi: Saldo?, oreGiorno: Double, azione: (@Composable () -> Unit)? = null) {
    val c = W.colori
    Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 10.dp) {
        if (ferie?.tenuto != true && permessi?.tenuto != true) {
            Text("Saldo non tenuto", style = Testi.forte, color = c.testo2)
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (ferie?.tenuto == true) Column(Modifier.weight(1f)) {
                    val g = ferie.giorniOggi ?: ContiPersone.giorniDaOre(ferie.oggi, oreGiorno)
                    Text(Numeri.scrivi(g) + if (g == 1.0) " giorno" else " giorni", style = Testi.numeroGrande, color = c.testo)
                    Text("di ferie (" + Numeri.scrivi(ferie.oggi) + " ore)", style = Testi.secondario, color = c.tenue)
                }
                if (permessi?.tenuto == true) Column(Modifier.weight(1f)) {
                    Text(Numeri.scrivi(permessi.oggi) + " ore", style = Testi.numeroGrande, color = c.testo)
                    Text("di permesso", style = Testi.secondario, color = c.tenue)
                }
            }
            if (ferie?.tenuto == true) {
                val resto = ferie.giorniRestano ?: ContiPersone.giorniDaOre(ferie.restano, oreGiorno)
                val da = if (ferie.scrittoIl.isNotBlank()) "Dal cedolino del " + dataIt(ferie.scrittoIl) else "Dalle ore all'anno"
                Text(
                    "$da · dopo le richieste restano " + Numeri.scrivi(resto) + if (resto == 1.0) " giorno" else " giorni",
                    style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = if (ferie.restano < 0) c.rossoTesto else c.testo2,
                )
            }
        }
        azione?.invoke()
    }
}

/** L'icona di una cosa del catalogo. */
internal fun iconaAttrezzatura(categoria: String): ImageVector = when (categoria) {
    "strumento" -> Icone.misura
    "dpi" -> Icone.scudo
    "informatica" -> Icone.monitor
    else -> Icone.attrezzo
}

/** Il colore dell'icona di uno strumento: rosso scaduto o non conforme, ambra in scadenza, grigio il resto. */
internal fun coloreTaratura(t: ContiMezzi.StatoTaratura?): String = when (t?.stato) {
    ContiMezzi.SCADUTA, ContiMezzi.NON_CONFORME -> ColoreFase5.ROSSO
    ContiMezzi.IN_SCADENZA -> ColoreFase5.AMBRA
    else -> ColoreFase5.GRIGIO
}

/** Una riga di uno strumento o di un'attrezzatura: icona, nome, "AT004 · matr. … · chi ce l'ha", la pillola della taratura. */
@Composable
internal fun RigaAttrezzatura(a: Attrezzatura, taratura: ContiMezzi.StatoTaratura? = a.taratura, modifier: Modifier = Modifier, onClick: (() -> Unit)?) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().heightIn(min = 68.dp).let { if (onClick != null) it.clickable(onClick = onClick).semantics { role = Role.Button } else it }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconaColorata(iconaAttrezzatura(a.categoria), coloreTaratura(taratura))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(a.nome, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val sotto = listOf(a.codice, if (a.matricola.isNotBlank()) "matr. ${a.matricola}" else "", a.statoVisto.takeIf { !it.startsWith("Taratura") && !it.startsWith("Verifica") }.orEmpty())
                .filter { it.isNotBlank() }.joinToString(" · ")
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
            FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                taratura?.let { Parola6(it.parola, colore = it.colore) }
            }
        }
        if (onClick != null) Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.padding(top = 10.dp).size(18.dp))
    }
}

/** Una riga di un mezzo: icona, "Fiat Doblò GA123BC", "Dello studio · Marco Rossato" o il rimborso km, le pillole. */
@Composable
internal fun RigaMezzo(m: Mezzo, onClick: (() -> Unit)?) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 68.dp).let { if (onClick != null) it.clickable(onClick = onClick).semantics { role = Role.Button } else it }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconaColorata(if (m.tipo == "auto") Icone.auto else Icone.mezzo, if (m.stato == "fermo") ColoreFase5.ROSSO else ColoreFase5.BLU)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(m.titolo, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val sotto = if (m.delloStudio) listOf("Dello studio", m.chi?.nome.orEmpty()).filter { it.isNotBlank() }.joinToString(" · ")
            else listOf(m.proprietaVista, m.euroKm?.let { "rimborso " + Numeri.scrivi(it) + " €/km" }.orEmpty()).filter { it.isNotBlank() }.joinToString(" · ")
            Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 2)
            FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (m.delloStudio) Parola6(if (m.stato == "fermo") "Fermo" else m.statoVisto.removePrefix("Assegnato a ").let { if (m.stato == "assegnato") "Assegnato" else m.statoVisto }, colore = m.coloreStato)
                m.prossimaScadenza?.takeIf { it.statoVisto.startsWith("Scad") }?.let { Parola6(scadenzaMezzoParola(it.tipo) + ": " + it.statoVisto.lowercase()) }
                if (m.guastiAperti > 0) Parola6(Testo.quanti(m.guastiAperti, "guasto aperto", "guasti aperti"), colore = ColoreFase5.GRIGIO)
            }
        }
        if (onClick != null) Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.padding(top = 10.dp).size(18.dp))
    }
}

/** "Assicurazione", "Bollo", "Revisione", "Tagliando". */
internal fun scadenzaMezzoParola(tipo: String): String = when (tipo) {
    "assicurazione" -> "Assicurazione"
    "bollo" -> "Bollo"
    "revisione" -> "Revisione"
    "tagliando" -> "Tagliando"
    else -> tipo.replaceFirstChar { it.uppercase() }
}

/** Una riga "chiave · valore" dentro una scheda (le coppie del prototipo). */
@Composable
internal fun Coppia(chiave: String, valore: String?, riservato: Boolean = false) {
    if (valore == null) return
    val c = W.colori
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            if (riservato) Icon(Icone.lucchetto, null, tint = c.tenue, modifier = Modifier.size(13.dp).semantics { contentDescription = "Riservato" })
            Text(chiave, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue)
        }
        Text(valore.ifBlank { "—" }, style = Testi.testo, color = c.testo)
    }
}

/** La riga di un'azione dentro un elenco ("+ Aggiungi", "Consegna un DPI"): col bordo, piccola. */
@Composable
internal fun RigaAzione(testo: String, icona: ImageVector = Icone.piu, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick).semantics { role = Role.Button }.padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.superficie2), contentAlignment = Alignment.Center) {
            Icon(icona, null, tint = c.testo2, modifier = Modifier.size(20.dp))
        }
        Text(testo, style = Testi.forte, color = c.gialloTesto)
    }
}

/** La fascia ambra (o rossa) in cima a una pagina: "Manca il DURC", gli usi da controllare. */
@Composable
internal fun Fascia6(testo: String, rossa: Boolean = false) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (rossa) c.rossoTenue else c.ambraFondo)
            .border(1.dp, (if (rossa) c.rossoTesto else c.ambraTesto).copy(alpha = 0.3f), RoundedCornerShape(16.dp)).padding(14.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icone.allarme, null, tint = if (rossa) c.rossoTesto else c.ambraTesto, modifier = Modifier.size(20.dp))
        Text(testo, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = if (rossa) c.rossoTesto else c.ambraTesto, modifier = Modifier.weight(1f))
    }
}

/** Una barra di avanzamento (incarichi a corpo). */
@Composable
internal fun BarraAvanzamento(percento: Int, modifier: Modifier = Modifier) {
    val c = W.colori
    Box(modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(c.superficie2).semantics { contentDescription = "$percento per cento" }) {
        Box(Modifier.fillMaxWidth(percento.coerceIn(0, 100) / 100f).height(10.dp).clip(RoundedCornerShape(5.dp)).background(c.testo))
    }
}

/** Il nome breve del giorno: "lun 3". */
internal fun giornoCorto(g: LocalDate): String = g.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, ITALIA) + " " + g.dayOfMonth

/** Le permissioni della fase 6 per le schermate. */
@Composable
internal fun vedePersone2(): Boolean = LocalPermessi.current.modifica(Moduli.PERSONE)

/** "18/10". */
internal fun breve(iso: String): String = if (iso.isBlank()) "" else dataBreve(iso)
