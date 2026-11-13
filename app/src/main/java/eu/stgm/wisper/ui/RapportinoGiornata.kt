package eu.stgm.wisper.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Vista
import eu.stgm.wisper.rapportino.Calcolo
import eu.stgm.wisper.rapportino.Conto
import eu.stgm.wisper.rapportino.Giornata
import eu.stgm.wisper.rapportino.Giornate
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.RegoleProgetti
import eu.stgm.wisper.rapportino.Stato
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch

/**
 * Il rapportino della giornata, su una pagina sola (11/11/2026, Andrea: "Fai lo stesso editor a tre colonne anche sul
 * telefono", scelta "Pagina unica"). Le tre colonne del computer, una sopra l'altra:
 * - **in alto** "Rapportino", la data con Cambia e la **fila dei lavori** (scorre di lato; toccarne uno lo sceglie);
 * - **in mezzo** tutti i campi del lavoro scelto ([LavoroNellaPagina]): Per chi, Il lavoro, Strada e tariffa, Altro, Il
 *   conto; quello che si scrive va subito nel lavoro della fila;
 * - **in basso** il conto del lavoro scelto e il totale del giorno, **Aggiungi un lavoro** e **Salva rapportino**.
 *
 * Salva rapportino controlla i lavori uno per uno, come il computer: il primo con qualcosa che manca si sceglie e
 * l'avviso dice quale ("Lavoro 2: scrivi che lavoro hai fatto"). Un lavoro aggiunto e lasciato vuoto non si salva.
 * Riaperto (non cambiato) il pulsante giallo e' **Invia ai clienti** se c'e' qualcosa da inviare; nel menu ⋯ Segna
 * inviato senza email, Segna fatturato, Riporta da inviare, Elimina. Mentre si scrive (tastiera aperta) la parte in
 * basso si nasconde, per lasciare posto ai campi.
 *
 * @param onInvia gli idLocale dei lavori da mandare: si apre l'Invio, diviso per destinatario.
 * @param onSalvata dopo Salva rapportino (fase 5: un lavoro col ticket chiede "Il lavoro è finito?").
 */
@OptIn(FlowPreview::class, ExperimentalLayoutApi::class)
@Composable
fun SchermataGiornata(
    dati: Dati,
    stato: GiornataStato,
    bozza: BozzaModulo,
    onChiudi: () -> Unit,
    onInvia: (List<String>) -> Unit,
    onSalvata: (Giornata) -> Unit = {},
) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val visita = LocalVisita.current
    val perm = LocalPermessi.current
    val costi = perm.costi
    val scrive = perm.modifica(eu.stgm.wisper.rapportino.Moduli.RAPPORTINI)
    val fattura = perm.modifica(eu.stgm.wisper.rapportino.Moduli.FATTURAZIONE) && costi
    // Il lavoro da mostrare si sceglie subito (un rapportino nuovo ne ha gia' uno, con la scelta del cliente aperta).
    remember(stato) { stato.preparaPagina(scrive); true }
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val storico by dati.storico.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val progettiAttivi = RegoleProgetti.attivi(sessione)
    val perId = remember(viste, storico) { (storico.associateBy { it.rapportino.idLocale } + viste.associateBy { it.rapportino.idLocale }) }
    val scope = rememberCoroutineScope()
    val scorri = rememberScrollState()

    // Quello che sa il server (numero, stato di ogni lavoro) arriva mentre la pagina e' aperta: si aggiorna senza
    // toccare quello che si sta scrivendo.
    LaunchedEffect(perId) {
        stato.lavori.toList().forEachIndexed { i, l ->
            val v = perId[l.idLocale]?.rapportino ?: return@forEachIndexed
            if (v.stato != l.stato || v.id != l.id || v.idGiornata != l.idGiornata || v.foto != l.foto || v.statoApprovazione != l.statoApprovazione) {
                val nuovo = l.copy(stato = v.stato, id = v.id, idGiornata = v.idGiornata, foto = v.foto, inviatoIl = v.inviatoIl,
                    fatturatoIl = v.fatturatoIl, statoApprovazione = v.statoApprovazione, motivoRifiuto = v.motivoRifiuto)
                if (stato.lavori.getOrNull(i)?.idLocale == l.idLocale) stato.lavori[i] = nuovo
                stato.base = stato.base.map { b -> if (b.idLocale == l.idLocale) b.copy(stato = v.stato, id = v.id, idGiornata = v.idGiornata) else b }
            }
            if (stato.id.isBlank() && v.idGiornata.isNotBlank()) stato.id = v.idGiornata
        }
    }
    // Il lavoro scelto va nella fila a ogni tasto (cliente, ore, km, conto: la fila e i totali si aggiornano subito).
    val scelto = stato.aperto
    LaunchedEffect(scelto, scrive) {
        val m = scelto ?: return@LaunchedEffect
        if (!scrive) return@LaunchedEffect
        snapshotFlow { if (m.base.bloccato) null else m.rapportino() to m.fotoNuove.toList() }.collect { if (it != null) stato.sincronizza(m) }
    }
    // La copia su disco mentre c'e' qualcosa da salvare (se Android chiude l'app); niente nella visita.
    LaunchedEffect(stato) {
        if (!dati.esempio) snapshotFlow { if (stato.cambiata) stato.aJson().toString() else "" }.debounce(400).collect {
            if (it.isNotEmpty()) bozza.scrivi(stato) else bozza.cancella()
        }
    }

    var chiediUscita by remember { mutableStateOf(false) }
    var chiediElimina by remember { mutableStateOf(false) }
    var chiediDaInviare by remember { mutableStateOf(false) }
    var chiediSenzaOre by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf(false) }

    fun esci() {
        if (!dati.esempio) stato.fotoNuove.values.flatten().forEach { it.delete() }
        bozza.cancella()
        onChiudi()
    }

    fun uscita() {
        if (stato.cambiata && !dati.esempio) chiediUscita = true else esci()
    }
    // Indietro dentro la scelta di cliente, commessa o progetto torna com'era (o un passo indietro); se no esce.
    BackHandler {
        val m = stato.aperto
        when {
            m == null || !m.perChiAperto -> uscita()
            m.perChiAnnullabile -> m.annullaPerChi()
            m.sceltaProgetto -> m.sceltaProgetto = false
            m.sceltaCommessa -> m.sceltaCommessa = false
            else -> uscita()
        }
    }

    /** Un lavoro nuovo: in fondo alla fila, scelto, con la scelta del cliente aperta; la pagina torna in cima. */
    fun aggiungi() {
        visita?.azione("aggiungi")
        stato.aggiungiLavoro()
        scope.launch { scorri.animateScrollTo(0) }
    }

    /** Le regole del lavoro (tariffa fissa, km, viaggio) per controllarlo: quelle del suo cliente e della sua commessa. */
    fun valido(m: ModuloStato): Boolean {
        m.progettiAttivi = progettiAttivi
        val cl = ana.cliente(m.idCliente, if (m.idCliente.isBlank()) m.cliente else "")
        return m.valida(ana.regoleDi(cl, ana.commessa(m.idCommessa)), costi)
    }

    fun salva() {
        // Un lavoro aggiunto e lasciato vuoto non si salva (se ce n'e' almeno uno scritto).
        if (stato.lavori.any { !stato.vuoto(it) }) stato.togliVuoti()
        if (stato.lavori.isEmpty()) { avvisi.mostra("Aggiungi almeno un lavoro"); return }
        if (stato.aperto == null) stato.preparaPagina(scrive)
        // I controlli lavoro per lavoro, come il computer: il primo con un errore si sceglie e l'avviso dice quale.
        val sbagliati = stato.lavori.mapIndexedNotNull { i, l -> i.takeIf { !l.bloccato && stato.daControllare(l) && !valido(stato.moduloDi(l)) } }
        if (sbagliati.isNotEmpty()) {
            val i = sbagliati.first()
            val m = stato.moduloDi(stato.lavori[i])
            stato.aperto = m
            if ("progetto" in m.errori) { m.perChiAperto = true; m.sceltaCommessa = true; m.sceltaProgetto = true }
            else if ("cliente" in m.errori) { m.perChiAperto = true; m.sceltaCommessa = m.cliente.isNotBlank(); m.sceltaProgetto = false }
            if ("cliente" in m.errori || "progetto" in m.errori) scope.launch { scorri.animateScrollTo(0) } else m.mostraErrore++
            val frase = m.errori.values.first()
            val altri = sbagliati.drop(1).map { it + 1 }
            avvisi.mostra(
                (if (stato.lavori.size > 1) "Lavoro ${i + 1}: " + frase.replaceFirstChar { it.lowercase() } else frase) +
                    (if (altri.isEmpty()) "" else " (anche " + (if (altri.size == 1) "il lavoro " else "i lavori ") + altri.joinToString(", ") + ")"),
            )
            return
        }
        // 13/11/2026: un lavoro gia' inviato che e' cambiato torna Da inviare.
        stato.riportaCambiati()
        val g = stato.giornata()
        dati.salvaGiornata(g)
        // Le foto dopo il rapportino: il lavoro deve esistere sul server quando arriva la sua foto.
        stato.fotoNuove.forEach { (id, file) -> file.forEach { dati.accodaFoto(id, it) } }
        stato.salvataAdesso()
        bozza.cancella()
        visita?.azione("salva-rapportino")
        onSalvata(g)
        stato.salvato = true
    }

    val lavori = stato.lavori.toList()
    /** Il conto di un lavoro: quello del server se il lavoro e' com'era, altrimenti rifatto qui con le stesse regole. */
    fun contoDi(l: Rapportino): Conto {
        val v = perId[l.idLocale]
        if (v?.conto != null && v.rapportino.soloCompilato() == l.soloCompilato()) return v.conto
        return Calcolo.calcola(l, ana.regoleDi(ana.cliente(l.idCliente, l.cliente), ana.commessa(l.idCommessa)))
    }
    val conti = lavori.map(::contoDi)
    val daInviare = lavori.filter { it.daInviare }
    val inviati = lavori.filter { it.stato == Stato.INVIATO }
    val nonFatturati = lavori.filter { it.stato != Stato.FATTURATO }
    val tuttiBloccati = lavori.isNotEmpty() && lavori.any { it.bloccato }
    val iScelto = lavori.indexOfFirst { it.idLocale == scelto?.base?.idLocale }
    val tastiera = WindowInsets.isImeVisible

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 10.dp).heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                PulsanteTondo(Icone.chiudi, "Chiudi", { uscita() })
                Spacer(Modifier.weight(1f))
                if (!stato.nuova && scrive && lavori.isNotEmpty()) PulsanteTondo(Icone.altro, "Altre azioni", { menu = true })
            }
            // Con la tastiera aperta la parte in basso si nasconde e i campi scorrono sopra la tastiera.
            Box(Modifier.weight(1f).fillMaxWidth().imePadding()) {
                Column(
                    Modifier.fillMaxSize().verticalScroll(scorri).padding(horizontal = 20.dp).padding(top = 14.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    TitoloPagina("Rapportino", sopra = stato.id.takeIf { it.isNotBlank() }?.let { "N° $it" })
                    // La data vale per tutti i lavori: con un lavoro fatturato non si cambia piu' (resterebbe divisa). Con uno
                    // inviato si': cambia anche per lui, e torna da inviare.
                    RigaData(stato.data, abilitato = scrive && !tuttiBloccati) { stato.data = it }
                    if (lavori.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(stato.riassunto, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                            if (!stato.nuova && lavori.any { !it.daInviare }) Text(Giornate.riassunto(lavori), style = Testi.secondario, color = c.tenue)
                        }
                        FilaLavori(lavori, conti, iScelto, costi, errore = { l -> stato.erroriDi(l.idLocale) || perId[l.idLocale]?.errore?.isNotBlank() == true }) { stato.scegli(it) }
                    }
                    if (scelto != null && iScelto >= 0) key(scelto) {
                        LavoroNellaPagina(dati, stato, scelto, iScelto + 1, onTolto = {
                            val resto = stato.lavori
                            if (resto.isEmpty()) stato.aperto = null else stato.scegli(resto[(iScelto - 1).coerceIn(0, resto.lastIndex)])
                        })
                    } else if (scrive && lavori.isEmpty()) {
                        PulsanteBordo("Aggiungi un lavoro", { aggiungi() }, Modifier.fillMaxWidth().bersaglio("aggiungi"), icona = Icone.piu, altezza = 56.dp, tratteggiato = true)
                    }
                }
                StratoAvvisi(avvisi, Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp))
            }

            // ---------------------------------------------------------- in basso: il lavoro, il giorno e i pulsanti
            if (lavori.isNotEmpty() && !tastiera) Column(
                // Una riga sottile sopra, non una cornice: ai lati il fondo continua.
                Modifier.fillMaxWidth().background(c.fondo)
                    .drawBehind { drawLine(c.bordoScheda, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
                    .navigationBarsPadding()
                    .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                fun oreKm(l: List<Rapportino>) = listOf(Numeri.ore(l.sumOf { it.oreTotali }), Numeri.scrivi(l.sumOf { it.km }) + " km").joinToString(" · ")
                val totaleGiorno = conti.sumOf { it.totale }
                if (lavori.size == 1 || iScelto < 0) {
                    // Un lavoro solo: il suo conto e' il totale del giorno.
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(oreKm(lavori), style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.tenue, modifier = Modifier.weight(1f))
                        if (costi) Column(horizontalAlignment = Alignment.End, modifier = Modifier.bersaglio("totale").bersaglio("totale-giorno")) {
                            Text("Totale del giorno", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue)
                            EuroAnimati(totaleGiorno, Testi.titoloScheda)
                        }
                    }
                } else Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f).bersaglio("totale")) {
                        Text("Lavoro ${iScelto + 1} · " + oreKm(listOf(lavori[iScelto])), style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue)
                        if (costi) EuroAnimati(conti[iScelto].totale, Testi.titoloScheda)
                    }
                    Column(Modifier.weight(1f).bersaglio("totale-giorno"), horizontalAlignment = Alignment.End) {
                        Text("Il giorno · " + oreKm(lavori), style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue, textAlign = TextAlign.End)
                        if (costi) EuroAnimati(totaleGiorno, Testi.titoloScheda)
                    }
                }
                // 11/11/2026 (Andrea): "Aggiungi un lavoro" subito a sinistra del pulsante che chiude il rapportino.
                if (scrive) Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PulsanteAggiungiLavoro({ aggiungi() }, Modifier.weight(1f).fillMaxHeight().bersaglio("aggiungi"))
                    when {
                        stato.cambiata || stato.nuova -> PulsantePrincipale("Salva rapportino", { salva() }, Modifier.weight(1f).fillMaxHeight().bersaglio("salva-rapportino"))
                        daInviare.isNotEmpty() -> PulsantePrincipale("Invia ai clienti", { onInvia(daInviare.map { it.idLocale }) }, Modifier.weight(1f).fillMaxHeight())
                        else -> Unit
                    }
                }
            }
        }
        // 1.4.0 (servizi.md §2): l'indennità aperta copre tutta la pagina finché non si chiude o si salva.
        scelto?.let { m -> m.indennitaAperta?.let { a -> key(a) { SchermataIndennita(dati, m, a) } } }
    }

    // ---------------------------------------------------------- dopo il salvataggio
    if (stato.salvato) {
        FoglioDalBasso({ stato.salvato = false; onChiudi() }) {
            Text("Rapportino salvato", style = Testi.titoloScheda, color = c.testo)
            Text(Giornate.lavori(lavori.size) + " " + Giornate.perClienti(Giornate.quantiClienti(lavori)), style = Testi.testo, color = c.testo2)
            // 13/11/2026: quello che era gia' partito ed e' cambiato va mandato di nuovo.
            stato.tornatiDaInviare.takeIf { it > 0 }?.let { n ->
                Text(
                    if (lavori.size == 1) "Era già inviato: adesso torna da inviare."
                    else if (n == 1) "Il lavoro già inviato che hai cambiato torna da inviare."
                    else "$n lavori già inviati tornano da inviare.",
                    style = Testi.testo, color = c.testo2,
                )
            }
            if (scrive && daInviare.isNotEmpty()) {
                PulsantePrincipale("Invia ai clienti", { stato.salvato = false; onInvia(daInviare.map { it.idLocale }) }, Modifier.bersaglio("invia-clienti"), icona = Icone.invia)
            }
            PulsanteTesto("Più tardi", { stato.salvato = false; onChiudi() }, Modifier.fillMaxWidth(), colore = c.testo)
        }
    }

    if (chiediUscita) {
        AlertDialog(
            onDismissRequest = { chiediUscita = false },
            title = { Text("Uscire senza salvare?", style = Testi.titoloSezione) },
            text = { Text("Quello che hai scritto in questo rapportino si perde.", style = Testi.testo) },
            confirmButton = { TextButton(onClick = { chiediUscita = false; esci() }) { Text("Esci", color = c.rossoTesto) } },
            dismissButton = { TextButton(onClick = { chiediUscita = false }) { Text("Resta", color = c.testo) } },
        )
    }

    // ---------------------------------------------------------- il menu ⋯ del rapportino
    if (menu) {
        FoglioDalBasso({ menu = false }) {
            if (daInviare.isNotEmpty()) {
                VoceMenu(Icone.invia, "Invia ai clienti", {
                    menu = false
                    if (stato.cambiata) salva()
                    onInvia(daInviare.map { it.idLocale })
                })
                VoceMenu(Icone.invia, "Segna inviato senza email", {
                    menu = false
                    if (stato.cambiata) salva()
                    // 13/11/2026: un'indennità senza ore si segna inviata solo dopo una conferma.
                    val frase = Giornate.fraseSenzaOre(daInviare)
                    if (frase != null) chiediSenzaOre = frase
                    else avvisaCambio(avvisi, dati, dati.cambiaStato(daInviare.map { it.idLocale }, Stato.INVIATO))
                })
            }
            if (fattura && nonFatturati.isNotEmpty()) VoceMenu(Icone.spunta, "Segna fatturato", {
                menu = false
                if (stato.cambiata) salva()
                avvisaCambio(avvisi, dati, dati.cambiaStato(nonFatturati.map { it.idLocale }, Stato.FATTURATO))
            })
            if (inviati.isNotEmpty()) VoceMenu(Icone.indietroStato, "Riporta da inviare", { menu = false; chiediDaInviare = true })
            if (Giornate.puoEliminare(lavori)) VoceMenu(Icone.cestino, "Elimina", { menu = false; chiediElimina = true }, pericolo = true)
        }
    }
    chiediSenzaOre?.let { frase ->
        FoglioConferma(
            titolo = "Indennità senza ore",
            testo = "$frase Lo segno inviato lo stesso?",
            azione = "Segna inviato",
            onConferma = {
                chiediSenzaOre = null
                avvisaCambio(avvisi, dati, dati.cambiaStato(stato.lavori.filter { it.daInviare }.map { it.idLocale }, Stato.INVIATO))
            },
            onAnnulla = { chiediSenzaOre = null },
        )
    }
    if (chiediDaInviare) {
        FoglioConferma(
            titolo = if (inviati.size == 1) "Riportare da inviare il lavoro inviato?" else "Riportare da inviare ${inviati.size} lavori inviati?",
            testo = "Come se non fosse partito: si manda di nuovo quando vuoi.",
            azione = "Riporta da inviare",
            onConferma = {
                chiediDaInviare = false
                avvisaCambio(avvisi, dati, dati.cambiaStato(inviati.map { it.idLocale }, Stato.BOZZA), "Riportato da inviare")
            },
            onAnnulla = { chiediDaInviare = false },
        )
    }
    if (chiediElimina) {
        FoglioConferma(
            titolo = "Eliminare il rapportino?",
            testo = "Sul server resta, segnato come annullato: si recupera da lì.",
            azione = "Elimina",
            onConferma = {
                chiediElimina = false
                dati.eliminaGiornata(Giornata(stato.idLocale, stato.id, stato.data, stato.tecnico, (lavori + stato.base).distinctBy { it.idLocale }))
                avvisi.mostra("Rapportino eliminato")
                esci()
            },
            onAnnulla = { chiediElimina = false },
            pericolo = true,
        )
    }
}

/**
 * Un lavoro nel rapportino: il cerchio del cliente, il cliente, commessa · progetto, "Intestato a …", il lavoro su due
 * righe, ore e km, l'importo e lo stato se non e' Da inviare. I testi lunghi vanno a capo (il cliente) o si accorciano
 * coi puntini (il lavoro, dopo due righe): niente larghezze fisse.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SchedaLavoro(l: Rapportino, v: Vista?, conto: Conto?, costi: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = W.colori
    val commessa = listOf(l.idCommessa.ifBlank { l.codiceProposto }.ifBlank { l.commessa }, l.etichettaProgetto).filter { it.isNotBlank() }.joinToString(" · ")
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.scheda)
            .border(if (v?.errore?.isNotBlank() == true) 1.5.dp else 1.dp, if (v?.errore?.isNotBlank() == true) c.rossoPieno else c.bordoScheda, RoundedCornerShape(20.dp))
            .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Iniziali(l.cliente.ifBlank { "?" }, dimensione = 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            // 07/11/2026: il cliente e l'importo sulla stessa riga quando ci stanno, se no l'importo va sotto
            // (a 360 dp col carattere grande, con l'importo a lato, "Elettrodinamica" si spezzava a metà).
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(l.cliente.ifBlank { "Manca il cliente" }, style = Testi.forte, color = c.testo, modifier = Modifier.padding(end = 10.dp))
                if (costi && conto != null) Text(Numeri.euro(conto.totale), style = Testi.forte, color = c.testo, maxLines = 1, softWrap = false)
            }
            if (commessa.isNotBlank()) Text(commessa, style = Testi.secondario, color = c.testo2)
            if (l.progettoIntestatoA.isNotBlank()) Text("Intestato a ${l.progettoIntestatoA}", style = Testi.secondario, color = c.tenue)
            // Il lavoro intero, a capo (07/11/2026: niente puntini; su una riga, a 360 dp, se ne leggevano poche parole).
            if (l.descrizione.isNotBlank()) Text(l.descrizione, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue)
            FlowRow(
                Modifier.padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    listOf(Numeri.ore(l.oreTotali), Numeri.scrivi(l.km) + " km").joinToString(" · "),
                    style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.testo, modifier = Modifier.align(Alignment.CenterVertically),
                )
                if (!l.daInviare) ParolaStato(l.stato, Modifier.align(Alignment.CenterVertically))
                l.pillolaApprovazione?.let { p ->
                    val respinto = l.statoApprovazione == "respinto"
                    PillolaParola(p, if (respinto) c.rossoTesto else c.gialloTesto, if (respinto) c.rossoTenue else c.gialloTenue, righe = 2)
                }
                if (v?.inCoda == true) Icon(Icone.nuvola, null, tint = c.tenue, modifier = Modifier.size(16.dp).align(Alignment.CenterVertically).semantics { contentDescription = "Ancora sul telefono" })
            }
            v?.errore?.takeIf { it.isNotBlank() }?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        }
    }
}

/**
 * La fila dei lavori in cima alla pagina (11/11/2026): una scheda stretta per lavoro, che scorre di lato. Quella scelta
 * e' bianca col bordo scuro; un lavoro con qualcosa che manca ha il bordo rosso. Le schede hanno tutte la stessa
 * altezza e i nomi vanno a capo (niente puntini).
 */
@Composable
private fun FilaLavori(
    lavori: List<Rapportino>,
    conti: List<Conto>,
    scelto: Int,
    costi: Boolean,
    errore: (Rapportino) -> Boolean,
    onScegli: (Rapportino) -> Unit,
) {
    val scorri = rememberScrollState()
    val passo = with(LocalDensity.current) { (LARGHEZZA_SCHEDA_FILA + 10.dp).toPx() }
    // Il lavoro scelto si vede sempre, con un pezzo di quello prima.
    LaunchedEffect(scelto, lavori.size) {
        if (scelto >= 0) scorri.animateScrollTo(((scelto - 0.4f).coerceAtLeast(0f) * passo).toInt())
    }
    Row(
        Modifier.fillMaxWidth().horizontalScroll(scorri).height(IntrinsicSize.Max),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        lavori.forEachIndexed { i, l ->
            SchedaFila(i + 1, l, conti.getOrNull(i), costi, i == scelto, errore(l), Modifier.fillMaxHeight().bersaglio("lavoro-$i")) { onScegli(l) }
        }
    }
}

private val LARGHEZZA_SCHEDA_FILA = 168.dp

@Composable
private fun SchedaFila(n: Int, l: Rapportino, conto: Conto?, costi: Boolean, scelta: Boolean, errore: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val c = W.colori
    val forma = RoundedCornerShape(18.dp)
    val commessa = listOf(l.idCommessa.ifBlank { l.codiceProposto }.ifBlank { l.commessa }, l.progetto).filter { it.isNotBlank() }.joinToString(" · ")
    Column(
        modifier.width(LARGHEZZA_SCHEDA_FILA).clip(forma).background(if (scelta) c.foglio else c.scheda)
            .border(if (scelta || errore) 2.dp else 1.dp, when { errore -> c.rossoPieno; scelta -> c.testo; else -> c.bordoScheda }, forma)
            .clickable(onClick = onClick).semantics { selected = scelta }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text("Lavoro $n", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue)
        Text(l.cliente.ifBlank { "Manca il cliente" }, style = Testi.forte, color = if (l.cliente.isBlank()) c.tenue else c.testo)
        if (commessa.isNotBlank()) Text(commessa, style = Testi.piccolo, color = c.tenue)
        Spacer(Modifier.weight(1f).heightIn(min = 6.dp))
        Text(listOf(Numeri.ore(l.oreTotali), Numeri.scrivi(l.km) + " km").joinToString(" · "), style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.testo)
        if (costi && conto != null) Text(Numeri.euro(conto.totale), style = Testi.forte, color = c.testo)
        if (!l.daInviare) ParolaStato(l.stato, Modifier.padding(top = 4.dp))
    }
}

/**
 * "Aggiungi un lavoro" nella barra in basso (11/11/2026): bianco col bordo scuro e la scritta in grassetto, come sul
 * computer; risalta più di un pulsante normale ma il giallo resta solo sul pulsante principale. Alto almeno 64 come
 * quello accanto; su un telefono stretto la scritta va a capo e il pulsante cresce.
 */
@Composable
private fun PulsanteAggiungiLavoro(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    val premi = remember { MutableInteractionSource() }
    Row(
        modifier
            .molla(premi)
            .heightIn(min = 64.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(c.fondo)
            .border(1.5.dp, c.testo, RoundedCornerShape(18.dp))
            .clickable(interactionSource = premi, indication = LocalIndication.current, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icone.piu, null, tint = c.testo, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp))
        Text("Aggiungi un lavoro", style = Testi.pulsante, color = c.testo, textAlign = TextAlign.Center)
    }
}
