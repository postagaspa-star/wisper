package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Commessa
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Progetto
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.RegoleProgetti
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import java.time.LocalDate

/*
 * I progetti (03/11/2026, accordo docs/gestionale/progetti.md §4): cliente -> commessa -> progetto -> rapportino.
 * L'elenco, la scheda e il modulo, con lo stesso disegno delle Commesse (Commesse.kt): niente stile nuovo. Sul telefono
 * i progetti arrivano con le anagrafiche (anche senza rete); quelli nati in un rapportino e ancora in coda si vedono
 * con "Da inviare" finche' il server non li crea.
 */

/** Quello che resta scelto mentre si va e si torna: il segmento e la ricerca dell'elenco. */
internal object RicordoProgetti {
    /** "APERTO", "CHIUSO", "TUTTI". */
    var segmento by mutableStateOf(Progetto.APERTO)
    var cerca by mutableStateOf("")
}

/** Le scritture che devono finire anche se si cambia pagina (l'Annulla di un avviso). */
private val ambitoProgetti = MainScope()

/** Il codice del progetto in evidenza: pillola chiara col testo forte (quella nera e gialla e' della commessa). */
@Composable
internal fun CodiceProgetto(codice: String, modifier: Modifier = Modifier) {
    val c = W.colori
    Text(
        codice, style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = c.testo,
        modifier = modifier.clip(RoundedCornerShape(8.dp)).background(c.superficie2).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

/** Aperto (verde) o Chiuso (grigio), come le commesse. */
@Composable
internal fun ParolaStatoProgetto(p: Progetto, modifier: Modifier = Modifier) {
    val c = W.colori
    val (testo, fondo) = if (p.aperto) c.firmatoTesto to c.firmatoFondo else c.fatturatoTesto to c.fatturatoFondo
    Text(p.parolaStato, style = Testi.pillola, color = testo, modifier = modifier.clip(RoundedCornerShape(50)).background(fondo).padding(horizontal = 9.dp, vertical = 3.dp))
}

/** "3 rapportini · 20 h", vuoto se non ne ha. */
private fun contiDi(p: Progetto): String =
    if (p.rapportini <= 0) "" else (if (p.rapportini == 1) "1 rapportino" else "${p.rapportini} rapportini") + " · " + Testo.ore(p.ore)

/** I progetti che il telefono conosce: quelli delle anagrafiche e quelli nati qui ancora in coda. */
@Composable
private fun progettiDelTelefono(dati: Dati): List<Progetto> {
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    return remember(ana, viste) { RegoleProgetti.tutti(ana, viste.map { it.rapportino }) }
}

// ---------------------------------------------------------------------------------- elenco (§4.2)

@Composable
fun SchermataProgetti(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val perm = LocalPermessi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val tutti = progettiDelTelefono(dati)
    val segmento = RicordoProgetti.segmento

    // Come sul computer: codice, intestato a, descrizione e commessa (anche il suo nome e il cliente).
    val testo = Anagrafiche.normalizza(RicordoProgetti.cerca)
    val trovati = tutti.filter { p ->
        val m = ana.commessa(p.idCommessa)
        testo.isEmpty() || Anagrafiche.normalizza(
            listOf(p.codice, p.intestatoA, p.descrizione, p.idCommessa, m?.descrizione.orEmpty(), ana.cliente(p.idCliente)?.nome.orEmpty()).joinToString(" "),
        ).contains(testo)
    }
    fun nelSegmento(p: Progetto, s: String) = when (s) {
        Progetto.APERTO -> p.aperto
        Progetto.CHIUSO -> !p.aperto
        else -> true
    }
    val mostrati = trovati.filter { nelSegmento(it, segmento) }
        .sortedWith(compareByDescending<Progetto> { it.creato }.thenByDescending { it.id.toLongOrNull() ?: Long.MAX_VALUE })
    val puo = perm.modifica(Moduli.PROGETTI)

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina)
                .padding(bottom = if (puo) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Progetti")
            SegmentiScorrevoli(
                listOf(Progetto.APERTO to "Aperti", Progetto.CHIUSO to "Chiusi", "TUTTI" to "Tutti")
                    .map { (s, nome) -> s to "$nome · ${trovati.count { nelSegmento(it, s) }}" },
                segmento, { RicordoProgetti.segmento = it },
            )
            CampoCerca(RicordoProgetti.cerca, { RicordoProgetti.cerca = it }, "Codice, intestato a, descrizione")
            if (mostrati.isEmpty()) {
                TestoVuoto(
                    when {
                        tutti.isEmpty() -> "Ancora nessun progetto"
                        segmento == Progetto.CHIUSO -> "Nessun progetto chiuso"
                        else -> "Nessun progetto"
                    },
                )
            } else {
                SchedaElenco {
                    mostrati.forEachIndexed { i, p ->
                        RigaProgetto(p, ana, conCommessa = true, modifier = Modifier.bersaglio("progetto-riga-$i")) { nav.vai("progetto/" + p.id.ifBlank { p.idLocale }) }
                        if (i < mostrati.lastIndex) LineaElenco()
                    }
                }
            }
        }
        if (puo) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo progetto", { nav.vai("progetto-nuovo") }, Modifier.bersaglio("progetto-nuovo"), icona = Icone.piu)
            }
        }
    }
}

/** Un progetto nell'elenco: il codice in evidenza, la descrizione, a chi e' intestato, cliente e commessa, rapportini e ore. */
@Composable
private fun RigaProgetto(p: Progetto, ana: Anagrafiche, conCommessa: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = W.colori
    Column(
        modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(onClick = onClick).padding(vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CodiceProgetto(p.codice)
            Column(Modifier.weight(1f)) {
                Text(p.descrizione.ifBlank { p.codice }, style = Testi.forte, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (p.intestatoA.isNotBlank()) Text("Intestato a ${p.intestatoA}", style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            when {
                p.inAttesa -> ParolaGrigia("Da inviare")
                !p.aperto -> ParolaStatoProgetto(p)
            }
        }
        val dove = if (conCommessa) listOfNotNull(ana.cliente(p.idCliente)?.nome ?: ana.commessa(p.idCommessa)?.let { ana.cliente(it.idCliente)?.nome }, p.idCommessa.takeIf { it.isNotBlank() }).joinToString(" · ") else ""
        val conti = contiDi(p)
        if (dove.isNotBlank() || conti.isNotBlank()) Row(Modifier.fillMaxWidth()) {
            Text(dove, style = Testi.piccolo, color = c.tenue, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (conti.isNotBlank()) Text(conti, style = Testi.piccolo, color = c.tenue)
        }
    }
}

/** La parte Progetti della scheda commessa (§4.5): i suoi progetti e Nuovo progetto. */
@Composable
internal fun ProgettiDellaCommessa(dati: Dati, nav: Navigatore, m: Commessa) {
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val suoi = progettiDelTelefono(dati).filter { it.idCommessa.equals(m.id, ignoreCase = true) }
        .sortedWith(compareByDescending<Progetto> { it.aperto }.thenByDescending { it.creato })
    if (suoi.isEmpty()) TestoVuoto("Ancora nessun progetto")
    else SchedaElenco {
        suoi.forEachIndexed { i, p ->
            RigaProgetto(p, ana, conCommessa = false) { nav.vai("progetto/" + p.id.ifBlank { p.idLocale }) }
            if (i < suoi.lastIndex) LineaElenco()
        }
    }
    if (LocalPermessi.current.modifica(Moduli.PROGETTI)) {
        PulsanteBordo("Nuovo progetto", { nav.vai("progetto-nuovo/${m.id}") }, Modifier.fillMaxWidth(), icona = Icone.piu)
    }
}

/** I progetti di una commessa, per l'etichetta della scheda ("Progetti · 2"). */
@Composable
internal fun quantiProgetti(dati: Dati, idCommessa: String): Int =
    progettiDelTelefono(dati).count { it.idCommessa.equals(idCommessa, ignoreCase = true) }

// ---------------------------------------------------------------------------------- scheda (§4.4)

@Composable
fun SchermataProgetto(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val perm = LocalPermessi.current
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val storico by dati.storico.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val p = progettiDelTelefono(dati).firstOrNull { it.id == id || (it.idLocale.isNotBlank() && it.idLocale == id) }
    ChiediStorico(dati)
    if (p == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Progetto")
            TestoVuoto("Progetto non trovato")
        }
        return
    }
    val m = ana.commessa(p.idCommessa)
    val cliente = ana.cliente(p.idCliente) ?: m?.let { ana.cliente(it.idCliente) }
    // I rapportini del progetto: quelli del telefono (anche in coda) e dello storico, i piu' recenti prima.
    val tuttiR = remember(storico, viste) { (viste + storico).distinctBy { it.rapportino.idLocale } }
    val suoi = tuttiR.filter { v ->
        val r = v.rapportino
        (p.id.isNotBlank() && r.idProgetto == p.id) || (p.idLocale.isNotBlank() && r.idProgetto.isBlank() && r.progettoNuovo?.idLocale == p.idLocale)
    }.sortedWith(compareByDescending<eu.stgm.wisper.Vista> { it.rapportino.data }.thenByDescending { it.rapportino.id })
    val quantiRapportini = maxOf(p.rapportini, suoi.size)
    val puo = perm.modifica(Moduli.PROGETTI) && !p.inAttesa
    val scrivi = p.aperto && perm.modifica(Moduli.RAPPORTINI) && m?.aperta != false
    var menu by remember { mutableStateOf(false) }
    var togli by remember { mutableStateOf(false) }
    var inCorso by remember { mutableStateOf(false) }

    fun cambiaStato(chiuso: Boolean) {
        if (inCorso) return
        inCorso = true
        avvisi.mostra("Aggiorno il progetto…")
        ambitoProgetti.launch {
            dati.progetti.chiudi(p.id, chiuso)
                .onSuccess {
                    avvisi.mostra(if (chiuso) "Progetto chiuso" else "Progetto riaperto") {
                        ambitoProgetti.launch { dati.progetti.chiudi(p.id, !chiuso).onFailure { avvisi.mostra(spiegaErrore2(it, "Il progetto non è cambiato: riprova")) } }
                    }
                }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Il progetto non è cambiato: riprova")) }
            inCorso = false
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina)
                .padding(bottom = if (scrivi) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }) {
                if (puo) PulsanteTondo(Icone.altro, "Altre azioni", { if (!inCorso) menu = true })
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CodiceProgetto(p.codice)
                    if (p.inAttesa) ParolaGrigia("Da inviare") else ParolaStatoProgetto(p)
                }
                Text(p.descrizione.ifBlank { p.codice }, style = Testi.titoloPagina.copy(fontSize = 26.sp, lineHeight = 30.sp), color = c.testo)
            }
            SchedaElenco {
                // Sempre visibile, anche vuoto (progetti.md §2: facoltativo ma sempre visibile).
                RigaVoce(p.intestatoA.ifBlank { "Nessuno" }, sotto = "Intestato a", freccia = false, icona = Icone.persona,
                    titoloColore = if (p.intestatoA.isBlank()) c.tenue else c.testo)
                LineaElenco()
                RigaVoce(cliente?.nome ?: p.idCliente.ifBlank { "Cliente" }, sotto = "Cliente", inizio = { Iniziali(cliente?.nome ?: "?", dimensione = 40.dp) },
                    onClick = cliente?.let { cl -> { nav.vai("cliente/${cl.id}") } })
                LineaElenco()
                RigaVoce(m?.descrizione ?: p.idCommessa, sotto = "Commessa", inizio = { CodiceCommessa(p.idCommessa) },
                    onClick = m?.let { mm -> { nav.vai("commessa/${mm.id}") } })
                if (!p.inAttesa) {
                    LineaElenco()
                    RigaVoce(
                        p.parolaStato, sotto = "Stato", freccia = false, icona = if (p.aperto) Icone.spunta else Icone.lucchetto,
                        fine = if (puo) ({ PulsanteTesto(if (p.aperto) "Chiudi" else "Riapri", { cambiaStato(p.aperto) }, Modifier.bersaglio("progetto-stato")) }) else null,
                    )
                }
            }
            if (p.inAttesa) Text("È nato in un rapportino ancora sul telefono: parte con il rapportino.", style = Testi.secondario, color = c.tenue)

            Etichetta("Rapportini", Modifier.padding(top = 4.dp))
            if (suoi.isEmpty()) TestoVuoto(if (quantiRapportini > 0) "I rapportini di questo progetto non sono sul telefono" else "Ancora nessun rapportino")
            else {
                Text(
                    (if (suoi.size == 1) "1 rapportino" else "${suoi.size} rapportini") + " · " + Testo.ore(suoi.sumOf { it.rapportino.oreTotali }),
                    style = Testi.secondario, color = c.tenue,
                )
                ElencoRapportini(suoi.map { it.rapportino }, suoi.associateBy { it.rapportino.idLocale }, nav, perm.costi)
            }
        }
        if (scrivi) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo rapportino", { nav.nuovoRapportinoProgetto(p.id.ifBlank { p.idLocale }) }, Modifier.bersaglio("progetto-rapportino"), icona = Icone.piu)
            }
        }
    }

    if (menu) {
        FoglioDalBasso({ menu = false }) {
            Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
            VoceMenu(Icone.matita, "Modifica", { menu = false; nav.vai("progetto-modifica/${p.id}") })
            if (p.aperto) VoceMenu(Icone.lucchetto, "Chiudi il progetto", { menu = false; cambiaStato(true) })
            else VoceMenu(Icone.riapri, "Riapri il progetto", { menu = false; cambiaStato(false) })
            // Si toglie solo un progetto senza rapportini (creato per sbaglio): gli altri si chiudono.
            if (quantiRapportini == 0) VoceMenu(Icone.cestino, "Togli", { menu = false; togli = true }, pericolo = true)
        }
    }
    if (togli) {
        FoglioConferma(
            "Togliere ${p.codice}?", "Il progetto non ha rapportini: sparisce dall'elenco.", "Togli",
            onConferma = {
                togli = false
                inCorso = true
                ambitoProgetti.launch {
                    dati.progetti.togli(p.id)
                        .onSuccess { avvisi.mostra("Progetto tolto"); nav.indietro() }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Il progetto non è cambiato: riprova")) }
                    inCorso = false
                }
            },
            onAnnulla = { togli = false }, pericolo = true,
        )
    }
}

// ---------------------------------------------------------------------------------- nuovo e modifica (§4.3)

/**
 * Nuovo o Modifica progetto: Commessa (gia' messa se si arriva da una commessa), Codice (gia' scritto quello proposto,
 * cambiabile), Intestato a, Descrizione. La commessa si cambia solo finche' il progetto non ha rapportini.
 */
@Composable
fun SchermataModificaProgetto(dati: Dati, nav: Navigatore, id: String?, idCommessa: String?) {
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val nuovo = id == null
    val esistente = id?.let { i -> ana.progetti.firstOrNull { it.id == i } }
    if (!nuovo && esistente == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Progetto")
            TestoVuoto("Progetto non trovato")
        }
        return
    }
    val rapportini = remember(viste) { viste.map { it.rapportino } }
    val conRapportini = (esistente?.rapportini ?: 0) > 0 || rapportini.any { esistente != null && it.idProgetto == esistente.id }

    var idCom by rememberSaveable { mutableStateOf(esistente?.idCommessa ?: idCommessa.orEmpty()) }
    val commessa = ana.commessa(idCom)
    val idCliente = commessa?.idCliente ?: esistente?.idCliente.orEmpty()
    // Il codice proposto si rifà quando cambia la commessa: la stessa regola del server, anche senza rete.
    val proposto = remember(idCom, ana.progetti, rapportini) {
        if (idCom.isBlank()) "" else RegoleProgetti.codiceProposto(ana, rapportini, idCom, idCliente, LocalDate.now())
    }
    var codice by rememberSaveable { mutableStateOf(esistente?.codice ?: proposto) }
    var codiceToccato by rememberSaveable { mutableStateOf(!nuovo) }
    var intestatoA by rememberSaveable { mutableStateOf(esistente?.intestatoA.orEmpty()) }
    var descrizione by rememberSaveable { mutableStateOf(esistente?.descrizione.orEmpty()) }
    var sceltaCommessa by remember { mutableStateOf(false) }
    var provato by remember { mutableStateOf(false) }
    var salvo by remember { mutableStateOf(false) }
    if (nuovo && !codiceToccato && codice != proposto) codice = proposto

    val erroreCommessa = if (provato && commessa == null) "Scegli la commessa del progetto" else null
    val giaPreso = codice.isNotBlank() && idCliente.isNotBlank() && RegoleProgetti.codiceGiaPreso(ana, rapportini, codice, idCliente, esistente?.id.orEmpty()) != null
    val erroreCodice = when {
        provato && codice.isBlank() -> "Scrivi il codice del progetto"
        giaPreso -> "Il codice ${codice.trim()} è già di un altro progetto di questo cliente"
        else -> null
    }
    val erroreDescrizione = if (provato && descrizione.isBlank()) "Scrivi la descrizione del progetto" else null

    fun salva() {
        if (salvo) return
        provato = true
        if (commessa == null || codice.isBlank() || descrizione.isBlank() || giaPreso) return
        salvo = true
        scope.launch {
            if (nuovo) {
                val propostoUsato = proposto.isNotBlank() && codice.trim().equals(proposto, ignoreCase = true)
                dati.progetti.crea(commessa.id, codice.trim(), propostoUsato, intestatoA.trim(), descrizione.trim())
                    .onSuccess { s ->
                        avvisi.mostra(if (s.giaEsisteva) "C'era già: ${s.dato.codice}" else "Creato ${s.dato.codice}")
                        nav.indietro()
                        nav.vai("progetto/${s.dato.id}")
                    }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Il progetto non è cambiato: riprova")) }
            } else {
                val e = esistente!!
                val campi = buildMap {
                    if (codice.trim() != e.codice) put("codice", codice.trim())
                    if (intestatoA.trim() != e.intestatoA) put("intestatoA", intestatoA.trim())
                    if (descrizione.trim() != e.descrizione) put("descrizione", descrizione.trim())
                    if (!commessa.id.equals(e.idCommessa, ignoreCase = true)) put("idCommessa", commessa.id)
                }
                if (campi.isEmpty()) nav.indietro()
                else dati.progetti.aggiorna(e.id, campi)
                    .onSuccess { avvisi.mostra("Salvato ${it.codice}"); nav.indietro() }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Il progetto non è cambiato: riprova")) }
            }
            salvo = false
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(if (nuovo) "Nuovo progetto" else "Modifica ${esistente?.codice}")
            val nomeCommessa = commessa?.let { "${it.id} · ${it.descrizione}" } ?: "Scegli la commessa"
            if (conRapportini) CampoBloccato("Commessa", nomeCommessa)
            else Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                CampoScelta("Commessa", nomeCommessa, commessa == null) { sceltaCommessa = true }
                if (erroreCommessa != null) Text(erroreCommessa, style = Testi.secondario, color = c.rossoTesto)
            }
            if (commessa != null) Text(ana.cliente(commessa.idCliente)?.nome.orEmpty(), style = Testi.secondario, color = c.tenue)
            CampoTesto(codice, { codice = it; codiceToccato = true }, "Codice", Modifier.bersaglio("progetto-codice"), segnaposto = "Per esempio ED-001", errore = erroreCodice)
            CampoTesto(intestatoA, { intestatoA = it }, "Intestato a", segnaposto = "Facoltativo")
            CampoTesto(descrizione, { descrizione = it }, "Descrizione", segnaposto = "Per esempio Quadro QE1", errore = erroreDescrizione)
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter), sopraBarra = false) {
            PulsantePrincipale(if (salvo) "Salvo…" else "Salva", ::salva, Modifier.bersaglio("progetto-salva"), icona = Icone.spunta, abilitato = !salvo)
        }
    }

    if (sceltaCommessa) {
        var cerca by remember { mutableStateOf("") }
        val t = Anagrafiche.normalizza(cerca)
        val aperte = ana.commesse.filter { it.aperta && !it.modello && !it.archiviata }
            .filter { m -> t.isEmpty() || Anagrafiche.normalizza(listOf(m.id, m.descrizione, ana.cliente(m.idCliente)?.nome.orEmpty()).joinToString(" ")).contains(t) }
            .sortedByDescending { it.id }
        FoglioDalBasso({ sceltaCommessa = false }) {
            Text("Commessa", style = Testi.titoloScheda, color = c.testo)
            CampoCerca(cerca, { cerca = it }, "Codice, commessa, cliente")
            if (aperte.isEmpty()) TestoVuoto("Nessuna commessa aperta")
            Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                aperte.forEachIndexed { i, m ->
                    if (i > 0) LineaElenco()
                    RigaVoce(
                        m.descrizione, sotto = ana.cliente(m.idCliente)?.nome, inizio = { CodiceCommessa(m.id) }, freccia = false,
                        fine = if (m.id == idCom) ({ Icon(Icone.spunta, "Scelta", tint = c.testo, modifier = Modifier.size(20.dp)) }) else null,
                        onClick = { idCom = m.id; sceltaCommessa = false },
                    )
                }
            }
        }
    }
}

/** Il rapportino nuovo dalla scheda di un progetto: cliente, commessa e progetto gia' messi (progetti.md §4.4). */
internal fun rapportinoDelProgetto(base: Rapportino, ana: Anagrafiche, p: Progetto): Rapportino {
    val m = ana.commessa(p.idCommessa)
    val cl = ana.cliente(p.idCliente) ?: m?.let { ana.cliente(it.idCliente) }
    return base.copy(
        idCliente = cl?.id ?: base.idCliente, cliente = cl?.nome ?: base.cliente,
        idCommessa = m?.id ?: p.idCommessa, commessa = m?.descrizione.orEmpty(),
        idProgetto = p.id, progetto = p.codice, progettoDescrizione = p.descrizione, progettoIntestatoA = p.intestatoA,
        progettoNuovo = if (p.inAttesa) eu.stgm.wisper.rapportino.ProgettoNuovo.da(p, codiceProposto = true) else null,
    )
}
