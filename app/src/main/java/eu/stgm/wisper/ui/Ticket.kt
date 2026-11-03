@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.Contratto
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Ticket
import eu.stgm.wisper.rapportino.TicketInCoda
import eu.stgm.wisper.rapportino.TestiCoda
import eu.stgm.wisper.rapportino.dataBreve
import eu.stgm.wisper.rapportino.dataIt
import eu.stgm.wisper.rapportino.pulisciRicerca
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

/*
 * 12 Ticket e assistenza sul telefono (fase5.md §12.1, prototipo Gestionale-fase5.html):
 * Aperti · Programmati · Chiusi · Contratti · Statistiche. Davanti le cose da un
 * minuto (il ticket urgente, Nuovo ticket anche senza rete); il resto un livello sotto.
 */

enum class SegmentoTicket(val nome: String) { APERTI("Aperti"), PROGRAMMATI("Programmati"), CHIUSI("Chiusi"), CONTRATTI("Contratti"), STATISTICHE("Statistiche") }

enum class FiltroTicket(val nome: String) { TUTTI("Tutti"), URGENTI("Urgenti"), MIEI("Miei"), DA_PRENDERE("Da prendere") }

/** Quello che la sezione ricorda fra una pagina e l'altra (e che la Dashboard sceglie). */
object RicordoTicket {
    var segmento by mutableStateOf(SegmentoTicket.APERTI)
    var filtro by mutableStateOf(FiltroTicket.TUTTI)
    var mese: YearMonth = YearMonth.now()

    /** Il ticket da cui si aprono + Ore e + Materiale o spesa. */
    var perOreSpese: Ticket? = null

    /** Dalla Dashboard: il segmento e il filtro giusti. */
    fun mostra(segmento: String = "", priorita: String = "", nonAssegnati: Boolean = false, mie: Boolean = false) {
        this.segmento = when (segmento) { "programmati" -> SegmentoTicket.PROGRAMMATI; "chiusi" -> SegmentoTicket.CHIUSI; else -> SegmentoTicket.APERTI }
        filtro = when {
            priorita == "urgente" -> FiltroTicket.URGENTI
            nonAssegnati -> FiltroTicket.DA_PRENDERE
            mie -> FiltroTicket.MIEI
            else -> FiltroTicket.TUTTI
        }
    }
}

/** Chi è entrato, per rifare il pulsante giallo dei ticket cambiati sul telefono. */
@Composable
internal fun chiTicket(dati: Dati): TicketInCoda.Chi {
    val s by dati.sessione.collectAsStateWithLifecycle()
    return TicketInCoda.Chi(s.utente.id, s.utente.nome, s.collaboratore, s.permessi.modifica(Moduli.TICKET), s.puoChiudereTicket)
}

@Composable
fun SchermataTicket(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val perm = LocalPermessi.current
    val scrive = perm.modifica(Moduli.TICKET)
    val scriveContratti = scrive && perm.livello(Moduli.COSTI) >= 2
    val seg = RicordoTicket.segmento
    var menu by remember { mutableStateOf(false) }
    val esporta: (String, String) -> Unit = { cosa, titolo ->
        avvisi.mostra("Preparo il file…")
        scope.launch { dati.fase5.esporta(cosa).onSuccess { condividiFile(ctx, it, titolo, "text/csv") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non si è preparato: riprova")) } }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() }) { PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            TitoloPagina("Ticket e assistenza")
            SegmentiScorrevoli(SegmentoTicket.entries.map { it to it.nome }, seg, { RicordoTicket.segmento = it })
            when (seg) {
                SegmentoTicket.APERTI -> PaginaAperti(dati, nav)
                SegmentoTicket.PROGRAMMATI -> PaginaProgrammati(dati, nav)
                SegmentoTicket.CHIUSI -> PaginaChiusi(dati, nav)
                SegmentoTicket.CONTRATTI -> PaginaContratti(dati, nav)
                SegmentoTicket.STATISTICHE -> PaginaStatisticheTicket(dati)
            }
        }
        when {
            seg == SegmentoTicket.APERTI && scrive -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo ticket", { nav.vai("ticket-nuovo") }, icona = Icone.piu)
            }
            seg == SegmentoTicket.CONTRATTI && scriveContratti -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo contratto", { nav.vai("contratto-ca-nuovo") }, icona = Icone.piu)
            }
        }
    }
    if (menu) {
        FoglioDalBasso({ menu = false }) {
            Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
            if (scrive) VoceMenu(Icone.piu, "Nuovo ticket", { menu = false; nav.vai("ticket-nuovo") })
            VoceMenu(Icone.scarica, "Esporta i ticket", { menu = false; esporta("ticket", "I ticket") })
            VoceMenu(Icone.scarica, "Esporta i contratti", { menu = false; esporta("contratti", "I contratti di assistenza") })
        }
    }
}

// ---------------------------------------------------------------------------------- aperti

@Composable
private fun PaginaAperti(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val chi = chiTicket(dati)
    var giro by remember { mutableIntStateOf(0) }
    var cerca by remember { mutableStateOf("") }
    val inCoda = ops.count { it.fase5 }
    val lettura = rememberLettura(Unit, giro + Giri5.ticket * 1000 + inCoda * 7) { dati.fase5.tickets() }
    val letto = (lettura as? Lettura.Pronta)?.dato ?: dati.fase5.aperti.value
    val io = sessione.utente.id
    val tutti = remember(letto, ops, viste, ana) { TicketInCoda.elenco(letto?.ticket.orEmpty(), ops, viste.map { it.rapportino to it.inCoda }, ana, chi) }

    CampoCerca(cerca, { cerca = it }, "Cerca un ticket, un cliente, un impianto")
    PilloleFiltro(FiltroTicket.entries.map { it to it.nome }, RicordoTicket.filtro, { RicordoTicket.filtro = it })
    TestiCoda.inAttesa(ops.filter { it.fase5 })?.let { PillolaRete(it) }
    letto?.lettoAl?.takeIf { it.isNotBlank() }?.let { RigaInfo(lettoAlle(it)) }

    if (letto == null && lettura is Lettura.InCorso) { Segnaposto(90.dp); Segnaposto(90.dp); return }
    if (letto == null && lettura is Lettura.Errore && tutti.isEmpty()) { SchedaErrore(lettura.messaggio) { giro++ }; return }

    val q = pulisciRicerca(cerca)
    var lista = tutti.filter { q.isBlank() || q.split(' ').all { p -> pulisciRicerca(listOf(it.numero, it.titolo, it.cliente, it.impianto, it.richiedente).joinToString(" ")).contains(p) } }
    lista = when (RicordoTicket.filtro) {
        FiltroTicket.URGENTI -> lista.filter { it.priorita == "urgente" }
        FiltroTicket.MIEI -> lista.filter { it.responsabileId == io }
        FiltroTicket.DA_PRENDERE -> lista.filter { it.responsabileId.isBlank() }
        FiltroTicket.TUTTI -> lista
    }
    var primo = true
    @Composable
    fun Elenco(l: List<Ticket>) {
        SchedaElenco {
            if (l.isEmpty()) RigaCalma("Niente qui.")
            l.forEachIndexed { i, t ->
                if (i > 0) LineaElenco()
                val m = if (primo) Modifier.bersaglio("ticket-urgente") else Modifier
                primo = false
                RigaTicket(t, m) { nav.vai("ticket/${t.chiave}") }
            }
        }
    }
    if (sessione.collaboratore && RicordoTicket.filtro == FiltroTicket.TUTTI) {
        val miei = lista.filter { it.responsabileId == io }
        val daPrendere = lista.filter { it.responsabileId.isBlank() }
        val altri = lista - miei.toSet() - daPrendere.toSet()
        Sezione5("In carico a te", miei.size) { Elenco(miei) }
        Sezione5("Da prendere", daPrendere.size) { Elenco(daPrendere) }
        if (altri.isNotEmpty()) Sezione5("Delle tue commesse", altri.size) { Elenco(altri) }
    } else {
        if (lista.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma(if (tutti.isEmpty()) "Nessun ticket aperto." else "Niente con questo filtro.") }
        else Elenco(lista)
    }
    if (lettura is Lettura.Errore && letto != null && letto.lettoAl.isBlank()) RigaInfo(lettura.messaggio)
}

// ---------------------------------------------------------------------------------- programmati

@Composable
private fun PaginaProgrammati(dati: Dati, nav: Navigatore) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("programmati", giro + Giri5.ticket * 1000) { dati.fase5.tickets("programmati") }
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(90.dp); Segnaposto(90.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val l = lettura.dato.ticket
            val daPianificare = l.filter { it.prossimoIntervento == null && it.vivo && it.stato != "risolto" }
            val inCalendario = l - daPianificare.toSet()
            @Composable
            fun Riga(t: Ticket) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable { nav.vai("ticket/${t.chiave}") }.padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    DataGrande(t.previstoIl, if (t.prossimoIntervento == null) ColoreFase5.GIALLO else ColoreFase5.BLU, conAnno = false)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(t.titolo, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(listOf(t.cliente, t.impianto).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.testo2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(listOf(t.numero, if (t.contratto.isNotBlank()) "contratto ${t.contratto}" else "").filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.tenue)
                        Parola5(if (t.prossimoIntervento == null) "Da pianificare" else "In calendario", Modifier.padding(top = 4.dp))
                    }
                    Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.width(18.dp))
                }
            }
            Sezione5("Da pianificare", daPianificare.size) {
                SchedaElenco { if (daPianificare.isEmpty()) RigaCalma("Niente da pianificare."); daPianificare.forEachIndexed { i, t -> if (i > 0) LineaElenco(); Riga(t) } }
            }
            Sezione5("In calendario", inCalendario.size) {
                SchedaElenco { if (inCalendario.isEmpty()) RigaCalma("Niente in calendario."); inCalendario.forEachIndexed { i, t -> if (i > 0) LineaElenco(); Riga(t) } }
            }
            RigaInfo("Le prossime visite nascono 30 giorni prima.")
        }
    }
}

// ---------------------------------------------------------------------------------- chiusi

@Composable
private fun PaginaChiusi(dati: Dati, nav: Navigatore) {
    var mese by remember { mutableStateOf(RicordoTicket.mese) }
    var cerca by remember { mutableStateOf("") }
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(mese, giro + Giri5.ticket * 1000) {
        dati.fase5.tickets("chiusi", listOf("da" to mese.atDay(1).toString(), "a" to mese.atEndOfMonth().toString()))
    }
    CampoCerca(cerca, { cerca = it }, "Cerca un ticket chiuso")
    Row(verticalAlignment = Alignment.CenterVertically) {
        PulsanteTondo(Icone.frecciaSinistra, "Mese prima", { mese = mese.minusMonths(1); RicordoTicket.mese = mese }, dimensione = 48.dp)
        Text(eu.stgm.wisper.rapportino.Conti.nomeMese(mese), style = Testi.titoloSezione, color = W.colori.testo, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        PulsanteTondo(Icone.freccia, "Mese dopo", {
            if (mese < YearMonth.now()) { mese = mese.plusMonths(1); RicordoTicket.mese = mese }
        }, dimensione = 48.dp)
    }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(90.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val q = pulisciRicerca(cerca)
            val l = lettura.dato.ticket.filter { q.isBlank() || pulisciRicerca(listOf(it.numero, it.titolo, it.cliente, it.impianto).joinToString(" ")).contains(q) }
            SchedaElenco {
                if (l.isEmpty()) RigaCalma("Nessun ticket chiuso a ${eu.stgm.wisper.rapportino.Conti.nomeMese(mese).substringBefore(' ').lowercase()}.")
                l.forEachIndexed { i, t -> if (i > 0) LineaElenco(); RigaTicket(t) { nav.vai("ticket/${t.chiave}") } }
            }
        }
    }
}

// ---------------------------------------------------------------------------------- contratti

@Composable
private fun PaginaContratti(dati: Dati, nav: Navigatore) {
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("contratti", giro + Giri5.ticket * 1000) { dati.fase5.contratti() }
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(90.dp); Segnaposto(90.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> SchedaElenco {
            if (lettura.dato.isEmpty()) RigaCalma("Nessun contratto di assistenza.")
            lettura.dato.forEachIndexed { i, x -> if (i > 0) LineaElenco(); RigaContratto(x) { nav.vai("contratto-ca/${x.id}") } }
        }
    }
}

/** Una riga dei contratti (§12.1): numero in pillola nera, titolo, cliente e periodo, stato, canone coi soldi. */
@Composable
internal fun RigaContratto(x: Contratto, onClick: () -> Unit) {
    val c = W.colori
    val costi = LocalPermessi.current.costi
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(onClick = onClick).semantics { role = Role.Button }.padding(vertical = 12.dp),
        verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CodiceCommessa(x.numero.removePrefix("CA/"))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(x.titolo, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(x.cliente + " · dal " + dataBreve(x.dal) + " al " + dataIt(x.al), style = Testi.secondario, color = c.testo2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (x.rinnovo == "tacito") "si rinnova da solo" else "senza rinnovo", style = Testi.secondario, color = c.tenue)
            FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Parola5(x.statoVisto)
                if (costi && x.canone != null) Text(Numeri.euro(x.canone) + "/anno", style = Testi.secondario.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
            }
        }
        Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.padding(top = 4.dp).width(18.dp))
    }
}

// ---------------------------------------------------------------------------------- statistiche

private enum class PeriodoStat(val nome: String) { DODICI("12 mesi"), QUESTANNO("Quest'anno"), SCORSO("Scorso anno") }

@Composable
private fun PaginaStatisticheTicket(dati: Dati) {
    val c = W.colori
    val costi = LocalPermessi.current.costi
    var periodo by remember { mutableStateOf(PeriodoStat.DODICI) }
    var per by remember { mutableStateOf("tipo") }
    var giro by remember { mutableIntStateOf(0) }
    val oggi = LocalDate.now()
    val (da, a) = when (periodo) {
        PeriodoStat.DODICI -> null to null
        PeriodoStat.QUESTANNO -> oggi.withDayOfYear(1) to oggi
        PeriodoStat.SCORSO -> oggi.minusYears(1).withDayOfYear(1) to oggi.withDayOfYear(1).minusDays(1)
    }
    val lettura = rememberLettura(periodo to per, giro) { dati.fase5.statistiche(da, a, per) }
    PilloleFiltro(PeriodoStat.entries.map { it to it.nome }, periodo, { periodo = it })
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(150.dp); Segnaposto(200.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val s = lettura.dato
            val t = s.totale
            RiquadriDue(listOf(
                Triple("${t.aperti}", "aperti", null),
                Triple("${t.chiusi}", "chiusi", null),
                Triple(t.interventoMedioOre?.let { Numeri.scrivi(it) + " ore" } ?: "—", "intervento medio", null),
                Triple(t.entroITempi?.let { "${Math.round(it)}%" } ?: "—", "entro i tempi", null),
            ))
            SegmentiScorrevoli(listOf("tipo" to "Per tipo", "cliente" to "Per cliente", "impianto" to "Per impianto", "persona" to "Per persona"), per, { per = it })
            val massimo = (s.righe.maxOfOrNull { it.aperti } ?: 1).coerceAtLeast(1)
            Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 10.dp) {
                Etichetta("Ticket e tempo medio d'intervento")
                if (s.righe.isEmpty()) RigaCalma("Nessun ticket nel periodo.")
                s.righe.forEach { r ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(r.nome.ifBlank { "Nessuno" }, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(Testo.quanti(r.aperti, "ticket", "ticket") + (r.interventoMedioOre?.let { " · " + Numeri.scrivi(it) + " h" } ?: ""), style = Testi.secondario, color = c.tenue)
                        }
                        Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(c.superficie2)) {
                            Box(Modifier.fillMaxWidth(r.aperti.toFloat() / massimo).fillMaxHeight().clip(RoundedCornerShape(5.dp)).background(c.testo))
                        }
                        val sotto = listOfNotNull(
                            "ore " + Numeri.scrivi(r.ore),
                            if (costi) r.costo?.let { "costo " + Numeri.euro(it) } else null,
                            if (costi) r.fatturato?.let { "fatturato " + Numeri.euro(it) } else null,
                        ).joinToString(" · ")
                        Text(sotto, style = Testi.piccolo, color = c.tenue)
                    }
                }
            }
            Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 6.dp) {
                RigaDato("Ore", Numeri.scrivi(t.ore))
                RigaDato("Km", Numeri.scrivi(t.km))
                t.chiusuraMediaGiorni?.let { RigaDato("Chiusura media", Numeri.scrivi(it) + " giorni") }
                t.presaMediaOre?.let { RigaDato("Presa media", Numeri.scrivi(it) + " ore") }
                if (costi) {
                    t.costo?.let { RigaDato("Costo", Numeri.euro(it)) }
                    t.fatturato?.let { RigaDato("Fatturato", Numeri.euro(it)) }
                    RigaDato("Nel contratto", Testo.quanti(t.nelContratto, "ticket", "ticket"))
                }
            }
        }
    }
}
