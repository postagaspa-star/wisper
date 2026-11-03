@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.ControlloNotifiche
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Comunicazione
import eu.stgm.wisper.rapportino.Destinatario
import eu.stgm.wisper.rapportino.InCoda7
import eu.stgm.wisper.rapportino.ModelloMessaggio
import eu.stgm.wisper.rapportino.Parole7
import eu.stgm.wisper.rapportino.Proposta
import eu.stgm.wisper.rapportino.Segnaposti
import eu.stgm.wisper.rapportino.TestiCoda
import kotlinx.coroutines.launch
import org.json.JSONObject

/*
 * 14 WhatsApp e comunicazioni sul telefono (fase7.md §12.1): Da mandare · Storico ·
 * Modelli · Notifiche. Wisper prepara i messaggi, Manuel li manda da WhatsApp; lo
 * storico tiene quello che è partito (o è stato preparato).
 */

@Composable
fun SchermataComunicazioni(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val seg = RicordoComunicazioni.segmento
    val scrive = scriveComunicazioni()
    var nuovo by remember { mutableStateOf(false) }
    var telefonata by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() }) {
                if (seg == SegmentoComunicazioni.STORICO && scrive) PulsanteTondo(Icone.altro, "Altre azioni", { menu = true })
            }
            TitoloPagina("Comunicazioni")
            SegmentiScorrevoli(SegmentoComunicazioni.entries.map { it to it.nome }, seg, { RicordoComunicazioni.segmento = it }, bersagli = { if (it == SegmentoComunicazioni.DA_MANDARE) "seg-damandare" else null })
            AvvisoRifiuto(dati)
            PillolaRete7(dati)
            when (seg) {
                SegmentoComunicazioni.DA_MANDARE -> PaginaDaMandare(dati) { MessaggioDaAprire.bozza = it }
                SegmentoComunicazioni.STORICO -> PaginaStorico(dati, nav)
                SegmentoComunicazioni.MODELLI -> PaginaModelli(dati, nav)
                SegmentoComunicazioni.NOTIFICHE -> PaginaNotifiche(dati, nav)
            }
        }
        val giallo: Pair<String, () -> Unit>? = when {
            !scrive -> null
            seg == SegmentoComunicazioni.MODELLI -> "Nuovo modello" to { nav.vai("modello-messaggio-nuovo") }
            seg == SegmentoComunicazioni.NOTIFICHE -> null
            else -> "Nuovo messaggio" to { nuovo = true }
        }
        giallo?.let { (t, fai) -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) { PulsantePrincipale(t, fai, icona = Icone.piu) } }
    }
    if (menu) FoglioDalBasso({ menu = false }) {
        VoceMenu(Icone.telefono, "Annota una telefonata", { menu = false; telefonata = true })
    }
    if (nuovo) FoglioAChi(dati, onScelto = { d -> nuovo = false; MessaggioDaAprire.bozza = Bozza7(a = d, canale = if (d.conNumero) "whatsapp" else "email", modello = "libero", daPreparare = true) }, onChiudi = { nuovo = false })
    if (telefonata) FoglioTelefonata(dati) { telefonata = false }
}

/** La pillola grigia di §3.20 con quello della fase 7 in coda ("2 messaggi e 1 risposta partono appena c'è rete"). */
@Composable
internal fun PillolaRete7(dati: Dati) {
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val p = TestiCoda.pezziFase7(ops.filter { it.fase7 && !it.rifiutata })
    if (p.isEmpty()) return
    PillolaRete(p.joinToString(", ") { it.second }.replace(Regex(", ([^,]+)$"), " e $1") + if (p.sumOf { it.first } > 1) " partono appena c'è rete" else " parte appena c'è rete")
}

// ---------------------------------------------------------------------------------- da mandare

@Composable
private fun PaginaDaMandare(dati: Dati, onApri: (Bozza7) -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("da-mandare", giro + Giri7.comunicazioni * 1000) { dati.fase7.daMandare() }
    val scrive = scriveComunicazioni()
    val pagamenti = vedePagamenti()
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(140.dp); Segnaposto(140.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val d = InCoda7.applicaDaMandare(lettura.dato, ops).let { x ->
                // Il collaboratore e chi non ha i soldi non vedono mai i pagamenti (§9.5).
                if (pagamenti && !sessione.collaboratore) x else x.copy(proposti = x.proposti.filter { !it.pagamento }, oggi = x.oggi.filter { !it.pagamento })
            }
            if (d.lettoAl.isNotBlank()) RigaInfo(lettoAlle(d.lettoAl))
            fun nonMandare(p: Proposta) {
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
                dati.fase7.nonMandare(p.proposta)
                avvisi.mostra("Non lo mando") { dati.fase7.annullaNonMandare(p.proposta) }
            }
            Sezione5("Oggi", d.oggi.size.takeIf { it > 0 }) {
                if (d.oggi.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Niente da mandare oggi") }
                d.oggi.forEachIndexed { i, p -> SchedaProposta(p, scrive, if (i == 0) Modifier.bersaglio("prima-proposta") else Modifier, { onApri(Bozza7.daProposta(p)) }) { nonMandare(p) } }
            }
            if (d.domani.isNotEmpty()) Sezione5("Domani", d.domani.size) { d.domani.forEach { p -> SchedaProposta(p, scrive, Modifier, { onApri(Bozza7.daProposta(p)) }) { nonMandare(p) } } }
            if (d.proposti.isNotEmpty()) Sezione5("Proposti", d.proposti.size) { d.proposti.forEach { p -> SchedaProposta(p, scrive, Modifier, { onApri(Bozza7.daProposta(p)) }) { nonMandare(p) } } }
            if (d.preparati.isNotEmpty()) Sezione5("Preparati, non mandati", d.preparati.size) {
                SchedaElenco {
                    d.preparati.forEachIndexed { i, m ->
                        if (i > 0) LineaElenco()
                        RigaVoce(
                            m.nome + " · " + m.referente.ifBlank { m.cliente }, sotto = listOf(m.cliente, quando7(m.quando)).filter { it.isNotBlank() }.joinToString(" · "),
                            inizio = { IconaCanale("whatsapp") }, fine = { Parola7(if (m.inCoda) "Preparato" else m.parolaStato) },
                            freccia = scrive, onClick = if (scrive) ({ onApri(Bozza7.daPreparato(m)) }) else null,
                        )
                    }
                }
            }
        }
    }
    Sezione5("Non collegati") { RigheNonCollegate(avvisi, conFrase = false) }
}

/** Una proposta di Da mandare (§12.1): icona del canale, modello, a chi, il riferimento, due righe del testo, Non mandare. */
@Composable
private fun SchedaProposta(p: Proposta, scrive: Boolean, modifier: Modifier, onApri: () -> Unit, onNonMandare: () -> Unit) {
    val c = W.colori
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(c.scheda)
            .let { if (scrive) it.clickable(onClick = onApri) else it }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconaCanale(p.canale)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(Parole7.modello(p.modello, p.titolo), style = Testi.forte, color = c.testo)
                Text(listOf(p.a.nome, p.a.cliente).filter { it.isNotBlank() }.distinct().joinToString(" · "), style = Testi.secondario, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (scrive) androidx.compose.material3.Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
        }
        if (p.dettaglio.isNotBlank()) Text(p.dettaglio, style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.testo2)
        Text(p.testo, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (p.canale == "whatsapp" && !p.a.whatsappOk) Parola7("WhatsApp non chiesto") else Parola7(Parole7.canale(p.canale))
            androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
            if (scrive) PulsanteTesto("Non mandare", onNonMandare, colore = c.tenue)
        }
    }
}

/** A chi scrivere (Nuovo messaggio): il cliente, poi il referente. */
@Composable
internal fun FoglioAChi(dati: Dati, onScelto: (Destinatario) -> Unit, onChiudi: () -> Unit) {
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var cliente by remember { mutableStateOf<eu.stgm.wisper.rapportino.Cliente?>(null) }
    val cl = cliente
    if (cl == null) {
        FoglioSceltaCliente(ana, "", onScelto = { scelto -> if (scelto != null) cliente = scelto }, onChiudi = onChiudi)
        return
    }
    val referenti = ana.referentiDi(cl.id)
    if (referenti.isEmpty()) {
        val n = eu.stgm.wisper.rapportino.Whatsapp.numero(cl.telefono)
        onScelto(Destinatario("", cl.nome, cl.nome, cl.id, if (n.valido) n.numero else "", n.visto, cl.email, false, n.fisso))
        return
    }
    val c = W.colori
    FoglioDalBasso(onChiudi) {
        Text("A chi", style = Testi.titoloScheda, color = c.testo)
        Text(cl.nome, style = Testi.secondarioGrande, color = c.tenue)
        Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            referenti.forEachIndexed { i, r ->
                if (i > 0) LineaElenco()
                val d = Destinatario.da(r, cl)
                RigaVoce(r.nome, sotto = listOf(r.ruolo, d.numeroVisto.ifBlank { r.email }).filter { it.isNotBlank() }.joinToString(" · "), freccia = false,
                    inizio = { CerchioPersona(r.nome.split(' ', '.').filter { it.length > 1 }.take(2).joinToString("") { it.take(1) }.uppercase(), 40.dp) },
                    onClick = { onScelto(d) })
            }
        }
    }
}

/** Annota una telefonata (⋯ dello storico): chi, telefonata o nota, in uscita o in entrata, il testo. In coda. */
@Composable
private fun FoglioTelefonata(dati: Dati, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var scegli by remember { mutableStateOf(true) }
    var dest by remember { mutableStateOf<Destinatario?>(null) }
    var canale by remember { mutableStateOf("telefonata") }
    var direzione by remember { mutableStateOf("entrata") }
    var testo by remember { mutableStateOf("") }
    var provato by remember { mutableStateOf(false) }
    if (scegli) {
        FoglioAChi(dati, onScelto = { dest = it; scegli = false }, onChiudi = onChiudi)
        return
    }
    val d = dest ?: return
    FoglioDalBasso(onChiudi) {
        Text("Annota una telefonata", style = Testi.titoloScheda, color = c.testo)
        Text(listOf(d.nome, d.cliente).filter { it.isNotBlank() }.distinct().joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
        Segmenti(listOf("telefonata" to "Telefonata", "nota" to "Nota"), canale, { canale = it })
        if (canale == "telefonata") Segmenti(listOf("entrata" to "Mi ha chiamato", "uscita" to "L'ho chiamato"), direzione, { direzione = it })
        CampoTesto(testo, { testo = it }, "Cosa vi siete detti", Modifier.fillMaxWidth(), righe = 4, errore = if (provato && testo.isBlank()) "Scrivi cosa vi siete detti" else null)
        PulsantePrincipale("Salva", {
            provato = true
            if (testo.isBlank()) return@PulsantePrincipale
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@PulsantePrincipale }
            val dir = if (canale == "nota") "uscita" else direzione
            // §15: in entrata il server la salva sempre "ricevuto"; la copia in coda dice lo stesso.
            val m = JSONObject().put("canale", canale).put("direzione", dir).put("tipo", "libero").put("testo", testo.trim()).put("stato", if (dir == "entrata") "ricevuto" else "mandato")
                .put("_cliente", d.cliente).put("_referente", d.nome)
            if (d.idReferente.isNotBlank()) m.put("idReferente", eu.stgm.wisper.rapportino.PonteServer.idJson(d.idReferente))
            if (d.idCliente.isNotBlank()) m.put("idCliente", d.idCliente)
            dati.fase7.salvaMessaggio(m)
            Giri7.comunicazioni++
            avvisi.mostra("Annotata: parte appena c'è rete")
            onChiudi()
        }, altezza = 56.dp)
    }
}

// ---------------------------------------------------------------------------------- storico

@Composable
private fun PaginaStorico(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val canale = RicordoComunicazioni.canale
    val cerca = RicordoComunicazioni.cerca
    val idCliente = RicordoComunicazioni.idCliente
    val idCommessa = RicordoComunicazioni.idCommessa
    val filtri = buildList {
        if (canale.isNotBlank()) add("canale" to canale)
        if (cerca.isNotBlank()) add("testo" to cerca.trim())
        if (idCliente.isNotBlank()) add("idCliente" to idCliente)
        if (idCommessa.isNotBlank()) add("idCommessa" to idCommessa)
    }
    val lettura = rememberLettura(filtri, giro + Giri7.comunicazioni * 1000) { dati.fase7.storico(filtri) }
    CampoCerca(cerca, { RicordoComunicazioni.cerca = it }, "Cerca nei messaggi")
    SchedePillole(listOf("" to "Tutti", "whatsapp" to "WhatsApp", "email" to "Email", "portale" to "Portale", "telefonata" to "Telefonate"), canale, { RicordoComunicazioni.canale = it })
    if (idCliente.isNotBlank() || idCommessa.isNotBlank()) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (idCliente.isNotBlank()) ChipFiltro(ana.cliente(idCliente, "")?.nome ?: idCliente, { RicordoComunicazioni.idCliente = "" })
        if (idCommessa.isNotBlank()) ChipFiltro(idCommessa, { RicordoComunicazioni.idCommessa = "" })
    }
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(90.dp); Segnaposto(90.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val l = InCoda7.applicaStorico(lettura.dato.comunicazioni, ops, canale).filter { x ->
                (idCliente.isBlank() || x.idCliente.isBlank() || x.idCliente == idCliente) && (cerca.isBlank() || !x.inCoda || x.testo.contains(cerca, true))
            }
            if (lettura.dato.lettoAl.isNotBlank()) RigaInfo(lettoAlle(lettura.dato.lettoAl))
            if (l.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Nessun messaggio") }
            l.groupBy { giorno7(it.quando) }.forEach { (giorno, righe) ->
                Sezione5(giorno) {
                    SchedaElenco {
                        righe.forEachIndexed { i, x ->
                            if (i > 0) LineaElenco()
                            RigaComunicazione(x) { RicordoComunicazioni.aperta = x; nav.vai("comunicazione/${x.chiave}") }
                        }
                    }
                }
            }
        }
    }
}

/** Una riga dello storico (§12.1): icona del canale, "Promemoria appuntamento · Sig. Ferretti", "Rossi Impianti Srl · 9:02", pillola. */
@Composable
internal fun RigaComunicazione(x: Comunicazione, conGiorno: Boolean = false, onClick: () -> Unit) {
    RigaVoce(
        x.nome + (x.referente.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
        sotto = listOf(x.cliente, if (conGiorno) quando7(x.quando) else ora7(x.quando), x.riferimento.etichetta).filter { it.isNotBlank() }.joinToString(" · "),
        inizio = { IconaCanale(x.canale, x.entrata) },
        fine = { if (x.inCoda && x.id.isBlank()) PillolaInCoda() else Parola7(x.parolaStato) },
        freccia = false,
        onClick = onClick,
    )
}

/** La pagina di una comunicazione (§12.1): canale, chi, quando, Testo preparato o Testo, i riferimenti, Segna mandato. */
@Composable
fun SchermataComunicazione(dati: Dati, nav: Navigatore, chiave: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val aperta = RicordoComunicazioni.aperta?.takeIf { it.chiave == chiave }
        ?: dati.fase7.copia("storico")?.let { eu.stgm.wisper.rapportino.Storico7.daJson(it).comunicazioni.firstOrNull { x -> x.chiave == chiave } }
    val scrive = scriveComunicazioni()
    var mandata by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() })
            if (aperta == null) {
                TitoloPagina("Messaggio")
                Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Non trovo questo messaggio: torna allo storico e riprova.") }
                return@Column
            }
            val x = if (mandata) aperta.copy(stato = "mandato", statoVisto = "Mandato") else aperta
            TitoloPagina(x.nome)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Parola7(Parole7.canale(x.canale))
                Parola7(x.parolaStato)
                if (x.entrata && x.canale == "portale") Parola7("Dal portale")
                if (x.inCoda) PillolaInCoda()
            }
            Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 12.dp) {
                Coppia(if (x.entrata) "Da chi" else "A chi", listOf(x.referente, x.cliente).filter { it.isNotBlank() }.distinct().joinToString(" · "))
                Coppia("Quando", quando7(x.quando))
                Coppia("Chi", if (x.entrata) x.referente else x.chi)
                Coppia("Indirizzo", x.a)
                if (x.oggetto.isNotBlank()) Coppia("Oggetto", x.oggetto)
            }
            Sezione5(if (x.canale == "whatsapp") "Testo preparato" else "Testo") {
                Scheda(orizzontale = 18.dp, verticale = 16.dp) { Text(x.testo.ifBlank { "—" }, style = Testi.testo, color = c.testo) }
            }
            if (x.errore.isNotBlank()) Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.rossoTenue).padding(14.dp)) { Text(x.errore, style = Testi.secondario, color = c.rossoTesto) }
            if (x.motivo.isNotBlank()) RigaInfo("Non mandato: " + x.motivo)
            if (x.riferimento.id.isNotBlank()) Sezione5("Riferimento") {
                SchedaElenco { RigaVoce(x.riferimento.etichetta.ifBlank { x.riferimento.tipo }, icona = Icone.link, onClick = { apriRiferimento(x.riferimento, nav, dati) }) }
            }
        }
        if (scrive && aperta?.stato == "preparato" && !mandata) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Segna mandato", {
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
                dati.fase7.segnaMandato(aperta)
                mandata = true
                Giri7.comunicazioni++
                avvisi.mostra("Segnato mandato")
            }, icona = Icone.spunta)
        }
    }
}

// ---------------------------------------------------------------------------------- modelli

@Composable
private fun PaginaModelli(dati: Dati, nav: Navigatore) {
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("modelli", giro + Giri7.comunicazioni * 1000) { dati.fase7.modelli() }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(200.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> SchedaElenco {
            val l = lettura.dato.modelli
            if (l.isEmpty()) RigaCalma("Nessun modello")
            l.forEachIndexed { i, m ->
                if (i > 0) LineaElenco()
                RigaVoce(
                    m.nome, sotto = m.testo.replace("\n", " ").take(64) + if (m.testo.length > 64) "…" else "",
                    inizio = { IconaCanale(if (m.canale == "email") "email" else "whatsapp") },
                    fine = { Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) { Parola7(m.canaleVisto); if (!m.attivo) Parola7("Spento") } },
                    freccia = false,
                    onClick = { RicordoComunicazioni.modello = m; RicordoComunicazioni.segnaposti = lettura.dato.segnaposti; nav.vai("modello-messaggio/${m.chiave}") },
                )
            }
        }
    }
}

/**
 * La pagina del modello (§12.1): nome, canale WhatsApp · Email · Tutti e due, uso, oggetto,
 * testo con le pillole dei segnaposti (si toccano per metterli nel testo), i caratteri per
 * WhatsApp; giallo Salva il modello.
 */
@Composable
fun SchermataModello(dati: Dati, nav: Navigatore, chiave: String?) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val base = RicordoComunicazioni.modello?.takeIf { it.chiave == chiave } ?: ModelloMessaggio(canale = "tutti", uso = "libero", testo = "Buongiorno {nome}, ")
    var nome by remember(chiave) { mutableStateOf(base.nome) }
    var canale by remember(chiave) { mutableStateOf(base.canale) }
    var uso by remember(chiave) { mutableStateOf(base.uso) }
    var oggetto by remember(chiave) { mutableStateOf(base.oggetto) }
    var testo by remember(chiave) { mutableStateOf(base.testo) }
    var attivo by remember(chiave) { mutableStateOf(base.attivo) }
    var errore by remember(chiave) { mutableStateOf<String?>(null) }
    var salvo by remember(chiave) { mutableStateOf(false) }
    val scrive = scriveComunicazioni()
    val max = sessione.interfaccia.whatsappTestoMax
    val segnaposti = Segnaposti.per(uso, RicordoComunicazioni.segnaposti)
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() })
            TitoloPagina(if (chiave == null) "Modello nuovo" else base.nome, sopra = "Comunicazioni › Modelli")
            CampoTesto(nome, { nome = it }, "Nome", Modifier.fillMaxWidth(), abilitato = scrive)
            Etichetta("Canale")
            Segmenti(listOf("whatsapp" to "WhatsApp", "email" to "Email", "tutti" to "Tutti e due"), canale, { if (scrive) canale = it })
            if (!base.sistema) {
                Etichetta("Uso")
                PilloleFiltro(listOf("libero" to "Libero", "appuntamento" to "Appuntamento", "intervento" to "Intervento", "preventivo" to "Preventivo", "rapportino" to "Rapportino", "pagamento" to "Pagamento", "portale" to "Portale"), uso, { if (scrive) uso = it })
            }
            if (canale != "whatsapp") CampoTesto(oggetto, { oggetto = it }, "Oggetto dell'email", Modifier.fillMaxWidth(), abilitato = scrive)
            CampoTesto(testo, { testo = it }, "Testo", Modifier.fillMaxWidth(), righe = 7, abilitato = scrive,
                errore = if (canale != "email" && testo.length > max) "Il messaggio è più lungo di ${eu.stgm.wisper.rapportino.Numeri.scrivi(max.toDouble())} caratteri: accorcialo" else null)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Etichetta("Segnaposti", Modifier.weight(1f))
                if (canale != "email") Text("${testo.length} di ${"%,d".format(java.util.Locale.ITALY, max)} caratteri", style = Testi.piccolo, color = c.tenue)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                segnaposti.forEach { s -> Pillola(s, false, { if (scrive) testo = (if (testo.isEmpty() || testo.endsWith(" ") || testo.endsWith("\n")) testo else "$testo ") + s }, altezza = 48.dp) }
            }
            if (base.sistema && scrive) RigaInterruttore("Modello acceso", attivo, { attivo = it })
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
            if (chiave != null && !base.sistema && scrive) PulsanteTesto("Togli il modello", {
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsanteTesto }
                scope.launch { dati.fase7.togliModello(chiave).onSuccess { Giri7.comunicazioni++; avvisi.mostra("Modello tolto"); nav.indietro() }.onFailure { avvisi.mostra(it.message ?: "Il modello non è stato tolto") } }
            }, colore = c.rossoTesto)
        }
        if (scrive) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (salvo) "Salvo…" else "Salva il modello", {
                if (salvo) return@PulsantePrincipale
                errore = when {
                    nome.isBlank() -> "Nome: scrivi come si chiama"
                    testo.isBlank() -> "Testo: scrivi il messaggio"
                    canale != "email" && testo.length > max -> "Il messaggio è più lungo di ${eu.stgm.wisper.rapportino.Numeri.scrivi(max.toDouble())} caratteri: accorcialo"
                    else -> Segnaposti.sconosciuto(testo + " " + oggetto, uso, RicordoComunicazioni.segnaposti)?.let { "Segnaposto sconosciuto: $it. Si possono usare " + segnaposti.joinToString(", ") }
                }
                if (errore != null) return@PulsantePrincipale
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
                salvo = true
                scope.launch {
                    dati.fase7.salvaModello(base.copy(nome = nome, canale = canale, uso = uso, oggetto = oggetto, testo = testo, attivo = attivo))
                        .onSuccess { Giri7.comunicazioni++; avvisi.mostra("Modello salvato"); nav.indietro() }
                        .onFailure { errore = it.message ?: "Il modello non è stato salvato: riprova" }
                    salvo = false
                }
            }, icona = Icone.spunta)
        }
    }
}

// ---------------------------------------------------------------------------------- notifiche

@Composable
private fun PaginaNotifiche(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("notifiche", giro + Giri7.comunicazioni * 1000) { dati.fase7.notifiche() }
    var lette by remember { mutableStateOf(setOf<String>()) }
    var telefono by remember { mutableStateOf(ControlloNotifiche.acceso(ctx)) }
    val viste by dati.viste.collectAsStateWithLifecycle()
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(200.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val l = lettura.dato.notifiche
            if (l.any { !it.letta && it.id !in lette }) Row {
                androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                PulsanteBordo("Segna tutte lette", {
                    if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsanteBordo }
                    lette = l.map { it.id }.toSet()
                    scope.launch { dati.fase7.segnaLette(tutte = true).onFailure { avvisi.mostra(it.message ?: "Non sono state segnate: riprova") }; dati.aggiornaDashboard() }
                }, altezza = 48.dp)
            }
            SchedaElenco {
                if (l.isEmpty()) RigaCalma("Nessuna notifica")
                l.forEachIndexed { i, n ->
                    if (i > 0) LineaElenco()
                    val nuova = !n.letta && n.id !in lette
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable {
                            if (nuova && !dati.esempio) { lette = lette + n.id; scope.launch { dati.fase7.segnaLette(listOf(n.id)) } }
                            apriCollegamento(n.collegamento, nav, viste.map { it.rapportino })
                        }.padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        IconaTinta(Icone.campanella, if (nuova) "giallo" else "grigio")
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                if (nuova) Box(Modifier.size(8.dp).clip(CircleShape).background(c.giallo))
                                Text(n.titolo, style = if (nuova) Testi.forte else Testi.forte.copy(fontWeight = FontWeight.SemiBold), color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            Text(listOf(n.dettaglio, quando7(n.creata)).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }
    Scheda(orizzontale = 18.dp, verticale = 4.dp) {
        RigaInterruttore("Avvisami sul telefono", telefono, { nuovo ->
            telefono = nuovo
            ControlloNotifiche.metti(ctx, nuovo)
            if (!dati.esempio) scope.launch { dati.fase7.salvaPreferenzeNotifiche(nuovo) }
        })
    }
}
