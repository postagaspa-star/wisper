package eu.stgm.wisper.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.contentDescription
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
import eu.stgm.wisper.rapportino.Stato
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce

/**
 * Il rapportino della giornata (rapportino-lavori.md §5.1): "Rapportino", la data con Cambia, "N lavori · per N
 * clienti", una scheda per lavoro e **Aggiungi un lavoro**. In basso ore e km del giorno, il totale e **Salva
 * rapportino**; dopo il salvataggio il foglio "Rapportino salvato" con **Invia ai clienti** e **Più tardi**.
 *
 * Riaperto (non cambiato) il pulsante giallo e' **Invia ai clienti** se c'e' qualcosa da inviare; nel menu ⋯ Segna
 * inviato senza email, Segna fatturato, Riporta da inviare, Elimina. Toccare un lavoro lo apre (i suoi 3 passi, o il
 * suo riepilogo; uno Inviato o Fatturato in sola lettura).
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
    // Un lavoro aperto prende tutto lo schermo; Indietro (o Fatto) torna qui.
    val aperto = stato.aperto
    if (aperto != null) {
        SchermataLavoro(dati, stato, aperto, bozza, onEsciDalRapportino = { bozza.cancella(); onChiudi() })
        return
    }

    val c = W.colori
    val avvisi = LocalAvvisi.current
    val visita = LocalVisita.current
    val perm = LocalPermessi.current
    val costi = perm.costi
    val scrive = perm.modifica(eu.stgm.wisper.rapportino.Moduli.RAPPORTINI)
    val fattura = perm.modifica(eu.stgm.wisper.rapportino.Moduli.FATTURAZIONE) && costi
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val storico by dati.storico.collectAsStateWithLifecycle()
    val perId = remember(viste, storico) { (storico.associateBy { it.rapportino.idLocale } + viste.associateBy { it.rapportino.idLocale }) }

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
    // La copia su disco mentre c'e' qualcosa da salvare (se Android chiude l'app); niente nella visita.
    LaunchedEffect(stato) {
        if (!dati.esempio) snapshotFlow { if (stato.cambiata) stato.aJson().toString() else "" }.debounce(400).collect {
            if (it.isNotEmpty()) bozza.scrivi(stato) else bozza.cancella()
        }
    }

    var chiediUscita by remember { mutableStateOf(false) }
    var chiediElimina by remember { mutableStateOf(false) }
    var chiediDaInviare by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }

    fun esci() {
        if (!dati.esempio) stato.fotoNuove.values.flatten().forEach { it.delete() }
        bozza.cancella()
        onChiudi()
    }

    fun uscita() {
        if (stato.cambiata && !dati.esempio) chiediUscita = true else esci()
    }
    BackHandler { uscita() }

    /** Un lavoro nuovo: i suoi 3 passi. */
    fun aggiungi() {
        visita?.azione("aggiungi")
        stato.aperto = ModuloStato(stato.lavoroNuovo(), nuovo = true)
    }

    fun apri(l: Rapportino) {
        stato.aperto = ModuloStato(l, nuovo = false).also { m -> stato.fotoNuove[l.idLocale]?.let { m.fotoNuove.addAll(it) } }
    }

    fun salva() {
        if (stato.lavori.isEmpty()) { avvisi.mostra("Aggiungi almeno un lavoro"); return }
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

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 10.dp).heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                PulsanteTondo(Icone.chiudi, "Chiudi", { uscita() })
                Spacer(Modifier.weight(1f))
                if (!stato.nuova && scrive && lavori.isNotEmpty()) PulsanteTondo(Icone.altro, "Altre azioni", { menu = true })
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 14.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    TitoloPagina("Rapportino", sopra = stato.id.takeIf { it.isNotBlank() }?.let { "N° $it" })
                    // La data vale per tutti i lavori: con un lavoro gia' inviato non si cambia piu' (resterebbe divisa).
                    RigaData(stato.data, abilitato = scrive && !tuttiBloccati) { stato.data = it }
                    if (lavori.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(stato.riassunto, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                            if (!stato.nuova && lavori.any { !it.daInviare }) Text(Giornate.riassunto(lavori), style = Testi.secondario, color = c.tenue)
                        }
                    }
                    lavori.forEachIndexed { i, l ->
                        SchedaLavoro(l, perId[l.idLocale], conti[i], costi, Modifier.bersaglio("lavoro-$i")) { apri(l) }
                    }
                    // Con almeno un lavoro "Aggiungi un lavoro" sta nella barra in basso, accanto al pulsante giallo.
                    if (scrive && lavori.isEmpty()) {
                        PulsanteBordo("Aggiungi un lavoro", { aggiungi() }, Modifier.fillMaxWidth().bersaglio("aggiungi"), icona = Icone.piu, altezza = 56.dp, tratteggiato = true)
                    }
                }
                StratoAvvisi(avvisi, Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp))
            }

            // ---------------------------------------------------------- in basso: il giorno e il pulsante
            if (lavori.isNotEmpty()) Column(
                // Una riga sottile sopra, non una cornice: ai lati il fondo continua.
                Modifier.fillMaxWidth().background(c.fondo)
                    .drawBehind { drawLine(c.bordoScheda, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
                    .navigationBarsPadding().imePadding()
                    .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        listOf(Numeri.ore(lavori.sumOf { it.oreTotali }), Numeri.scrivi(lavori.sumOf { it.km }) + " km").joinToString(" · "),
                        style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.tenue, modifier = Modifier.weight(1f),
                    )
                    if (costi) Column(horizontalAlignment = Alignment.End, modifier = Modifier.bersaglio("totale-giorno")) {
                        Text("Totale del giorno", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue)
                        EuroAnimati(conti.sumOf { it.totale }, Testi.titoloScheda)
                    }
                }
                // 12/11/2026 (Andrea): "Aggiungi un lavoro" subito a sinistra del pulsante che chiude il rapportino.
                if (scrive) Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PulsanteAggiungiLavoro({ aggiungi() }, Modifier.weight(1f).fillMaxHeight().bersaglio("aggiungi"))
                    when {
                        stato.cambiata -> PulsantePrincipale("Salva rapportino", { salva() }, Modifier.weight(1f).fillMaxHeight().bersaglio("salva-rapportino"))
                        daInviare.isNotEmpty() -> PulsantePrincipale("Invia ai clienti", { onInvia(daInviare.map { it.idLocale }) }, Modifier.weight(1f).fillMaxHeight())
                        else -> Unit
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------- dopo il salvataggio
    if (stato.salvato) {
        FoglioDalBasso({ stato.salvato = false; onChiudi() }) {
            Text("Rapportino salvato", style = Testi.titoloScheda, color = c.testo)
            Text(Giornate.lavori(lavori.size) + " " + Giornate.perClienti(Giornate.quantiClienti(lavori)), style = Testi.testo, color = c.testo2)
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
                    avvisaCambio(avvisi, dati, dati.cambiaStato(daInviare.map { it.idLocale }, Stato.INVIATO))
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
    if (chiediDaInviare) {
        FoglioConferma(
            titolo = if (inviati.size == 1) "Riportare da inviare il lavoro inviato?" else "Riportare da inviare ${inviati.size} lavori inviati?",
            testo = "Tornano da cambiare e da mandare.",
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
 * "Aggiungi un lavoro" nella barra in basso (12/11/2026): bianco col bordo scuro e la scritta in grassetto, come sul
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
