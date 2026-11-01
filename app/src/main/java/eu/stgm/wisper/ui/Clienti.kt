package eu.stgm.wisper.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Vista
import eu.stgm.wisper.conConti
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.Conti
import eu.stgm.wisper.rapportino.DatiPartitaIva
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.PartitaIva
import eu.stgm.wisper.rapportino.Referente
import eu.stgm.wisper.rapportino.Sede
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import java.text.Collator
import java.time.YearMonth
import java.util.Locale

/*
 * Clienti e fornitori (docs/gestionale/fase1-schermate.md §4, prototipo
 * pagClienti/pagCliente): l'elenco coi due segmenti, la scheda con Dati,
 * Referenti, Sedi e impianti e Commesse, il modulo coi campi fiscali, gli
 * archiviati. Un'anagrafica sola: uno può essere cliente e fornitore insieme.
 */

/** Il segmento e la ricerca dell'elenco, la scheda aperta di ogni soggetto: restano andando e tornando. */
private object RicordoClienti {
    var segmento by mutableStateOf("clienti")
    var cerca by mutableStateOf("")
    val schede = mutableStateMapOf<String, String>()
}

/** Le scritture che finiscono anche se intanto si cambia pagina (l'Annulla di un avviso). */
private val ambito = MainScope()

private val ordineNomi: Comparator<Cliente> = compareBy(Collator.getInstance(Locale.ITALY)) { it.nome }

// ---------------------------------------------------------------------------------- elenco

@Composable
fun SchermataClienti(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val perm = LocalPermessi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val segmento = RicordoClienti.segmento
    val elenco = if (segmento == "fornitori") ana.fornitori else ana.clienti
    val lista = remember(elenco, RicordoClienti.cerca) {
        // "rossi imp" trova "Rossi Impianti S.r.l.", anche per altro nome, città, partita IVA ed email.
        val t = Anagrafiche.normalizza(RicordoClienti.cerca)
        elenco.filter { cl -> t.isEmpty() || Anagrafiche.normalizza(listOf(cl.id, cl.nome, cl.alias.joinToString(" "), cl.citta, cl.indirizzo, cl.partitaIva, cl.email).joinToString(" ")).contains(t) }
            .sortedWith(ordineNomi)
    }
    val puo = perm.modifica(Moduli.CLIENTI)
    val nuovo = if (segmento == "fornitori") "Nuovo fornitore" else "Nuovo cliente"

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina)
                .padding(bottom = if (puo) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Clienti e fornitori")
            SegmentiScorrevoli(
                listOf("clienti" to "Clienti · ${ana.clienti.size}", "fornitori" to "Fornitori · ${ana.fornitori.size}"),
                segmento, { RicordoClienti.segmento = it },
            )
            CampoCerca(RicordoClienti.cerca, { RicordoClienti.cerca = it }, "Nome, città, partita IVA")
            if (lista.isEmpty()) {
                TestoVuotoClienti(
                    when {
                        RicordoClienti.cerca.isNotBlank() -> "Nessuno con questo nome"
                        segmento == "fornitori" -> "Nessun fornitore"
                        else -> "Nessun cliente"
                    },
                )
            } else {
                Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
                    lista.forEachIndexed { i, cl ->
                        if (i > 0) LineaElenco()
                        val aperte = ana.commesseAperteDi(cl.id).size
                        RigaVoce(
                            cl.nome,
                            sotto = listOfNotNull(
                                cl.luogo.takeIf { it.isNotBlank() },
                                if (segmento == "clienti" && aperte > 0) Testo.quanti(aperte, "commessa aperta", "commesse aperte") else null,
                            ).joinToString(" · ").ifBlank { null },
                            inizio = { Iniziali(cl.nome, dimensione = 40.dp) },
                            // Fase 6 (§12.8): la pillola Collaboratore sul fornitore che ha la scheda: la apre.
                            fine = if (cl.collaboratore && perm.vede(Moduli.COLLABORATORI)) ({ PillolaCollaboratore { nav.vai("collaboratore/${cl.id}") } }) else null,
                            onClick = { nav.vai("cliente/${cl.id}") },
                        )
                    }
                }
            }
            PulsanteTesto(
                "Mostra gli archiviati" + if (ana.archiviati.isNotEmpty()) " (${ana.archiviati.size})" else "",
                { dati.aggiornaArchiviati(); nav.vai("soggetti-archiviati") },
                Modifier.fillMaxWidth(), colore = c.testo2,
            )
        }
        if (puo) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(nuovo, { nav.vai(if (segmento == "fornitori") "fornitore-nuovo" else "cliente-nuovo") }, icona = Icone.piu)
            }
        }
    }
}

/** Clienti e fornitori archiviati: si aprono, e dalla scheda si ripristinano. */
@Composable
fun SchermataSoggettiArchiviati(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val lista = ana.archiviati.sortedWith(ordineNomi)
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Archiviati")
        if (lista.isEmpty()) TestoVuotoClienti("Nessun cliente o fornitore archiviato")
        else Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
            lista.forEachIndexed { i, cl ->
                if (i > 0) LineaElenco()
                RigaVoce(
                    cl.nome,
                    sotto = listOfNotNull(if (cl.fornitore && !cl.cliente) "Fornitore" else "Cliente", cl.luogo.takeIf { it.isNotBlank() }).joinToString(" · "),
                    inizio = { Iniziali(cl.nome, dimensione = 40.dp) },
                    onClick = { nav.vai("cliente/${cl.id}") },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------------- scheda

@Composable
fun SchermataCliente(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val perm = LocalPermessi.current
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val cl = ana.soggetto(id)
    var menu by remember { mutableStateOf(false) }
    var archiviare by remember { mutableStateOf(false) }
    var referente by remember { mutableStateOf<Referente?>(null) }
    var sede by remember { mutableStateOf<Sede?>(null) }

    if (cl == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Scheda")
            Text("Non trovo questa anagrafica. Torna all'elenco e riprova.", style = Testi.testo, color = c.tenue)
        }
        return
    }
    val puo = perm.modifica(Moduli.CLIENTI)
    val referenti = ana.referentiDi(id)
    val sedi = ana.sediDi(id)
    val commesse = ana.commesseDi(id).filter { !it.modello && !it.archiviata }.sortedWith(compareBy({ !it.aperta }, { it.chiusa }, { it.id }))
    val schede = buildList {
        add("dati" to "Dati")
        add("referenti" to "Referenti · ${referenti.size}")
        add("sedi" to "Sedi e impianti · ${sedi.size}")
        if (cl.cliente) add("commesse" to "Commesse · ${commesse.size}")
        // Fase 5 (§12.5): i documenti del cliente (la sua cartella in cima) e i suoi ticket.
        if (cl.cliente && perm.vede(Moduli.DOCUMENTI)) add("documenti" to "Documenti")
        if (cl.cliente && perm.vede(Moduli.TICKET)) add("ticket" to "Ticket")
    }
    val scheda = RicordoClienti.schede[id]?.takeIf { s -> schede.any { it.first == s } } ?: "dati"

    fun archivia(si: Boolean) {
        ambito.launch {
            dati.archiviaSoggetto(id, si)
                .onSuccess {
                    if (si) {
                        avvisi.mostra("Archiviato ${cl.nome}") {
                            ambito.launch { dati.archiviaSoggetto(id, false).onFailure { avvisi.mostra(spiegaErrore(it)) } }
                        }
                    } else avvisi.mostra("Ripristinato ${cl.nome}")
                }
                .onFailure { avvisi.mostra(spiegaErrore(it)) }
        }
        if (si) nav.indietro()
    }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() }) {
            if (puo) PulsanteTondo(Icone.altro, "Altre azioni", { menu = true })
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Iniziali(cl.nome, dimensione = 56.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(cl.nome, style = Testi.titoloPagina.copy(fontSize = 26.sp, lineHeight = 30.sp), color = c.testo)
                @OptIn(ExperimentalLayoutApi::class)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (cl.cliente) PillolaTipo("Cliente", c.firmatoTesto, c.firmatoFondo)
                    if (cl.fornitore) PillolaTipo("Fornitore", c.inviatoTesto, c.inviatoFondo)
                    if (cl.collaboratore && perm.vede(Moduli.COLLABORATORI)) PillolaCollaboratore { nav.vai("collaboratore/${cl.id}") }
                    if (cl.archiviato) PillolaTipo("Archiviato", c.testo2, c.superficie2)
                    Text(
                        listOfNotNull(cl.id.takeIf { it.isNotBlank() }, cl.luogo.takeIf { it.isNotBlank() }).joinToString(" · "),
                        style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.align(Alignment.CenterVertically),
                    )
                }
            }
        }
        if (cl.telefono.isNotBlank() || cl.email.isNotBlank()) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (cl.telefono.isNotBlank()) PulsanteBordo("Chiama", { chiama(ctx, cl.telefono, avvisi) }, icona = Icone.telefono, altezza = 48.dp)
                if (cl.email.isNotBlank()) PulsanteBordo("Email", { scriviEmail(ctx, cl.email, avvisi) }, icona = Icone.email, altezza = 48.dp)
            }
        }
        SegmentiScorrevoli(schede, scheda, { RicordoClienti.schede[id] = it })

        when (scheda) {
            "dati" -> {
                if (cl.cliente && perm.costi && cl.codiceSdi.isBlank() && cl.pec.isBlank() && !cl.archiviato) {
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(c.gialloTenue).padding(18.dp)) {
                        Text("Mancano codice SDI e PEC: serviranno per le fatture.", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
                    }
                }
                val coppie = buildList {
                    add("Partita IVA" to cl.partitaIva)
                    add("Codice fiscale" to cl.codiceFiscale)
                    add("Codice SDI" to cl.codiceSdi)
                    add("PEC" to cl.pec)
                    add("Email" to cl.email)
                    add("Telefono" to cl.telefono)
                    add("Indirizzo" to cl.indirizzoCompleto)
                    if (cl.alias.isNotEmpty()) add("Altri nomi" to cl.alias.joinToString(", "))
                    if (cl.cliente && perm.costi) {
                        add("Tariffa" to tariffaBreve(cl))
                        add("Viaggio" to if (cl.pagaViaggio == true) "pagato" else "non pagato")
                        add("Chilometri" to if (cl.kmRimborsati != false) "rimborsati" else "non rimborsati")
                        cl.costoFisso?.let { add("Costo orario fisso" to "${Numeri.scrivi(it)} €/h") }
                    }
                    // Fase 4: come sul computer (pc/ui/clienti.js).
                    if (cl.cliente && perm.costi && perm.vede(Moduli.FATTURAZIONE) && cl.fatturazioneLetta) {
                        add("Sostituto d'imposta" to when (cl.sostitutoImposta) {
                            null -> if (cl.partitaIva.isNotBlank()) "sì (automatico: ha la partita IVA)" else "no (automatico: è un privato)"
                            true -> "sì"
                            false -> "no"
                        })
                        val giorni = cl.pagamentoGiorni ?: ana.impostazione("GIORNI_PAGAMENTO").toIntOrNull() ?: 30
                        val fine = cl.pagamentoFineMese ?: (ana.impostazione("PAGAMENTO_FINE_MESE") == "true")
                        add("Pagamento" to "$giorni giorni" + if (fine) ", fine mese" else "")
                    }
                }
                Scheda(orizzontale = 18.dp, verticale = 18.dp, raggio = 22.dp) { Coppie(coppie) }
                if (cl.note.isNotBlank()) {
                    Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 4.dp) {
                        Text("Note", style = Testi.piccolo, color = c.tenue)
                        Text(cl.note, style = Testi.testo, color = c.testo)
                    }
                }
                if (cl.cliente && perm.vede(Moduli.RAPPORTINI)) RigaRapportiniCliente(viste, ana, id, perm.costi) {
                    nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, idCliente = id))
                }
                // Fase 7 (§12.6): il portale del cliente e le sue ultime comunicazioni.
                if (cl.cliente && !cl.archiviato) {
                    SezionePortaleCliente(dati, nav, id)
                    SezioneComunicazioni(dati, nav, idCliente = id)
                }
            }
            "referenti" -> {
                Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
                    if (referenti.isEmpty()) TestoRiga("Nessun referente. Aggiungi chi chiami di solito.")
                    referenti.forEachIndexed { i, r ->
                        if (i > 0) LineaElenco()
                        // Fase 7 (§12.6): le pillole del portale e di WhatsApp, le icone WhatsApp, Email, Chiama.
                        val scriveCom = perm.modifica(Moduli.COMUNICAZIONI)
                        RigaReferente7(
                            dati, r,
                            onApri = if (puo) ({ referente = r }) else null,
                            onChiama = { chiama(ctx, r.telefono, avvisi) },
                            onEmail = {
                                if (scriveCom) MessaggioDaAprire.bozza = Bozza7(a = eu.stgm.wisper.rapportino.Destinatario.da(r, cl), canale = "email", modello = "libero", daPreparare = true)
                                else scriviEmail(ctx, r.email, avvisi)
                            },
                        )
                    }
                }
                if (puo) PulsanteBordo("Aggiungi un referente", { referente = Referente("", id, "") }, icona = Icone.piu, altezza = 48.dp)
            }
            "sedi" -> {
                Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
                    if (sedi.isEmpty()) TestoRiga("Nessuna sede o impianto.")
                    sedi.forEachIndexed { i, s ->
                        if (i > 0) LineaElenco()
                        // Fase 5: la riga dell'impianto mostra la categoria e apre lo storico.
                        RigaVoce(
                            s.nome,
                            sotto = listOf(s.categoriaNome, s.indirizzoCompleto).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { null },
                            icona = if (s.impianto) Icone.fulmine else Icone.luogo,
                            fine = { if (s.impianto) PillolaTipo("Impianto", c.inviatoTesto, c.inviatoFondo) else PillolaTipo("Sede", c.testo2, c.superficie2) },
                            freccia = s.impianto && perm.vede(Moduli.TICKET),
                            onClick = if (s.impianto && perm.vede(Moduli.TICKET)) ({ nav.vai("impianto/${s.id}") }) else if (puo) ({ sede = s }) else null,
                        )
                    }
                }
                if (puo) PulsanteBordo("Aggiungi una sede o un impianto", { sede = Sede("", id, "sede", "") }, icona = Icone.piu, altezza = 48.dp)
            }
            "documenti" -> ArchivioFiltrato(dati, nav, eu.stgm.wisper.rapportino.FiltroArchivio(idCliente = id))
            "ticket" -> {
                val lettura = rememberLettura("ticket-cliente-$id", Giri5.ticket) { dati.fase5.tickets("tutti", listOf("idCliente" to id)) }
                when (lettura) {
                    is Lettura.InCorso -> Segnaposto(90.dp)
                    is Lettura.Errore -> SchedaErrore(lettura.messaggio) {}
                    is Lettura.Pronta -> SchedaElenco {
                        if (lettura.dato.ticket.isEmpty()) RigaCalma("Nessun ticket.")
                        lettura.dato.ticket.forEachIndexed { i, t -> if (i > 0) LineaElenco(); RigaTicket(t) { nav.vai("ticket/${t.chiave}") } }
                    }
                }
                if (perm.modifica(Moduli.TICKET)) PulsanteBordo("Nuovo ticket", {
                    nav.vai("ticket-nuovo/" + (sedi.singleOrNull { it.impianto }?.id ?: ""))
                }, icona = Icone.piu, altezza = 48.dp)
            }
            "commesse" -> {
                Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
                    if (commesse.isEmpty()) TestoRiga("Ancora nessuna commessa.")
                    commesse.forEachIndexed { i, m ->
                        if (i > 0) LineaElenco()
                        RigaVoce(
                            m.descrizione.ifBlank { m.id },
                            sotto = listOfNotNull(ana.sede(m.idSede)?.nome, if (!m.aperta) m.etichettaStato else null).joinToString(" · ").ifBlank { null },
                            inizio = { CodiceCommessa(m.id) },
                            onClick = { nav.vai("commessa/${m.id}") },
                        )
                    }
                }
                if (perm.modifica(Moduli.COMMESSE) && !cl.archiviato) {
                    PulsanteBordo("Nuova commessa per ${cl.nome}", { nav.vai("commessa-nuova/$id") }, Modifier.fillMaxWidth(), icona = Icone.piu, altezza = 48.dp)
                }
            }
        }
    }

    if (menu) {
        FoglioDalBasso({ menu = false }) {
            Text(cl.nome, style = Testi.titoloScheda, color = c.testo)
            VoceMenu(Icone.matita, "Modifica", { menu = false; nav.vai("cliente-modifica/$id") })
            if (cl.archiviato) VoceMenu(Icone.riapri, "Ripristina", { menu = false; archivia(false) })
            else VoceMenu(Icone.cartella, "Archivia", { menu = false; archiviare = true })
        }
    }
    if (archiviare) {
        FoglioConferma(
            titolo = "Archiviare ${cl.nome}?",
            testo = "Non comparirà più negli elenchi e nei rapportini nuovi. Commesse e rapportini restano. Si ripristina dagli archiviati.",
            azione = "Archivia",
            onConferma = { archiviare = false; archivia(true) },
            onAnnulla = { archiviare = false },
        )
    }
    referente?.let { r ->
        FoglioReferente(
            r,
            onWhatsapp = if (perm.modifica(Moduli.CLIENTI) || perm.modifica(Moduli.COMUNICAZIONI)) ({ ok ->
                referente = null
                if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO)
                else ambito.launch {
                    dati.fase7.segnaWhatsapp(r.id, ok)
                        .onSuccess { dati.aggiorna(); avvisi.mostra(if (ok) "${r.nome} ha detto sì a WhatsApp" else "${r.nome} non vuole più WhatsApp") }
                        .onFailure { avvisi.mostra(spiegaErrore(it)) }
                }
            }) else null,
            onSalva = { nuovo, fatto ->
                ambito.launch {
                    dati.salvaReferente(nuovo).onSuccess { fatto(null); if (r.id.isBlank()) avvisi.mostra("Aggiunto ${nuovo.nome}") }
                        .onFailure { fatto(spiegaErrore(it)) }
                }
            },
            onTogli = {
                referente = null
                ambito.launch {
                    dati.togliReferente(r.id)
                        .onSuccess { avvisi.mostra("Tolto ${r.nome}") { ambito.launch { dati.salvaReferente(r.copy(id = "")) } } }
                        .onFailure { avvisi.mostra(spiegaErrore(it)) }
                }
            },
            onChiudi = { referente = null },
        )
    }
    sede?.let { s ->
        FoglioSede(
            s,
            onSalva = { nuova, fatto ->
                ambito.launch {
                    dati.salvaSede(nuova).onSuccess { fatto(null); if (s.id.isBlank()) avvisi.mostra("Aggiunta ${nuova.nome}") }
                        .onFailure { fatto(spiegaErrore(it)) }
                }
            },
            onArchivia = {
                sede = null
                ambito.launch {
                    dati.archiviaSede(s.id, true)
                        .onSuccess { avvisi.mostra("Archiviata ${s.nome}") { ambito.launch { dati.archiviaSede(s.id, false) } } }
                        .onFailure { avvisi.mostra(spiegaErrore(it)) }
                }
            },
            onChiudi = { sede = null },
        )
    }
}

/** Cliente (verde), Fornitore (blu), Sede (grigia), Impianto (blu): una parola in pillola. */
@Composable
private fun PillolaTipo(testo: String, colore: androidx.compose.ui.graphics.Color, fondo: androidx.compose.ui.graphics.Color) {
    Text(
        testo, style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = colore, maxLines = 1,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(fondo).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

/** Fase 6 (§12.8): "Collaboratore" in pillola blu sul fornitore che ha la scheda; il tocco (48 dp) la apre. */
@Composable
private fun PillolaCollaboratore(onApri: () -> Unit) {
    val c = W.colori
    Box(
        Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(50)).clickable(onClick = onApri)
            .semantics { role = Role.Button; contentDescription = "Apri la scheda del collaboratore" },
        contentAlignment = Alignment.Center,
    ) {
        PillolaTipo("Collaboratore", c.inviatoTesto, c.inviatoFondo)
    }
}

/** Coppie etichetta/valore su due colonne; "—" dove manca. */
@Composable
private fun Coppie(coppie: List<Pair<String, String>>) {
    val c = W.colori
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        coppie.chunked(2).forEach { riga ->
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                riga.forEach { (k, v) ->
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(k, style = Testi.piccolo, color = c.tenue)
                        Text(v.ifBlank { "—" }, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = if (v.isBlank()) c.tenue else c.testo)
                    }
                }
                if (riga.size == 1) Box(Modifier.weight(1f))
            }
        }
    }
}

/** La riga che apre i rapportini del cliente, col mese di adesso. */
@Composable
private fun RigaRapportiniCliente(viste: List<Vista>, ana: Anagrafiche, id: String, costi: Boolean, onClick: () -> Unit) {
    val mese = YearMonth.now()
    val delMese = viste.filter { YearMonth.from(it.rapportino.data) == mese && (ana.cliente(it.rapportino.idCliente, it.rapportino.cliente)?.id ?: it.rapportino.idCliente) == id }
    val t = Conti.totali(delMese.conConti())
    SchedaElenco {
        RigaVoce(
            "Rapportini",
            sotto = nomeMeseMinuscolo(mese) + " · " + Testo.ore(t.ore) + if (costi) " · " + Testo.euro(t.totale) else "",
            icona = Icone.ore,
            onClick = onClick,
        )
    }
}

/** Il foglio di un referente: nome, ruolo, telefono, email, note; Togli. */
@Composable
private fun FoglioReferente(r: Referente, onSalva: (Referente, (String?) -> Unit) -> Unit, onTogli: () -> Unit, onChiudi: () -> Unit, onWhatsapp: ((Boolean) -> Unit)? = null) {
    val c = W.colori
    var nome by remember(r.id) { mutableStateOf(r.nome) }
    var ruolo by remember(r.id) { mutableStateOf(r.ruolo) }
    var telefono by remember(r.id) { mutableStateOf(r.telefono) }
    var email by remember(r.id) { mutableStateOf(r.email) }
    var note by remember(r.id) { mutableStateOf(r.note) }
    // Fase 7 (§12.6): chi paga le fatture e il numero per WhatsApp, se diverso dal telefono.
    var pagamenti by remember(r.id) { mutableStateOf(r.pagamenti) }
    var whatsapp by remember(r.id) { mutableStateOf(r.whatsapp) }
    var errore by remember(r.id) { mutableStateOf<String?>(null) }
    var provato by remember(r.id) { mutableStateOf(false) }
    var salvo by remember(r.id) { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text(if (r.id.isBlank()) "Nuovo referente" else "Referente", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CampoTesto(nome, { nome = it }, "Nome", Modifier.fillMaxWidth(), errore = if (provato && nome.isBlank()) "Scrivi il nome" else null)
            CampoTesto(ruolo, { ruolo = it }, "Ruolo", Modifier.fillMaxWidth(), segnaposto = "Ufficio tecnico")
            CampoTesto(telefono, { telefono = it }, "Telefono", Modifier.fillMaxWidth(), tastiera = KeyboardType.Phone)
            CampoTesto(email, { email = it.trim() }, "Email", Modifier.fillMaxWidth(), tastiera = KeyboardType.Email, errore = erroreEmail(email))
            CampoTesto(note, { note = it }, "Note", Modifier.fillMaxWidth(), righe = 2)
            RigaInterruttore("Paga le fatture", pagamenti, { pagamenti = it })
            CampoTesto(whatsapp, { whatsapp = it }, "Numero WhatsApp", Modifier.fillMaxWidth(), tastiera = KeyboardType.Phone, segnaposto = "Se diverso dal telefono")
            if (r.id.isNotBlank() && onWhatsapp != null) {
                if (r.whatsappOk) PulsanteTesto("Non vuole più WhatsApp", { onWhatsapp(false) }, Modifier.fillMaxWidth(), colore = c.testo2)
                else PulsanteBordo("Ha detto sì a WhatsApp", { onWhatsapp(true) }, Modifier.fillMaxWidth(), altezza = 48.dp, icona = Icone.whatsapp)
            }
        }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (salvo) "Salvo…" else "Salva", {
            provato = true
            if (salvo || nome.isBlank() || erroreEmail(email) != null) return@PulsantePrincipale
            salvo = true
            errore = null
            onSalva(r.copy(nome = nome.trim(), ruolo = ruolo.trim(), telefono = telefono.trim(), email = email.trim(), note = note.trim(), pagamenti = pagamenti, whatsapp = whatsapp.trim())) { e ->
                salvo = false
                if (e == null) onChiudi() else errore = e
            }
        }, altezza = 56.dp, abilitato = !salvo)
        if (r.id.isNotBlank()) PulsanteTesto("Togli", onTogli, Modifier.fillMaxWidth(), colore = c.rossoTesto)
    }
}

/** Il foglio di una sede o di un impianto: tipo, nome, indirizzo, note; Archivia. */
@Composable
private fun FoglioSede(s: Sede, onSalva: (Sede, (String?) -> Unit) -> Unit, onArchivia: () -> Unit, onChiudi: () -> Unit) {
    val c = W.colori
    var tipo by remember(s.id) { mutableStateOf(if (s.impianto) "impianto" else "sede") }
    var nome by remember(s.id) { mutableStateOf(s.nome) }
    var indirizzo by remember(s.id) { mutableStateOf(s.indirizzo) }
    var cap by remember(s.id) { mutableStateOf(s.cap) }
    var citta by remember(s.id) { mutableStateOf(s.citta) }
    var provincia by remember(s.id) { mutableStateOf(s.provincia) }
    var note by remember(s.id) { mutableStateOf(s.note) }
    var errore by remember(s.id) { mutableStateOf<String?>(null) }
    var provato by remember(s.id) { mutableStateOf(false) }
    var salvo by remember(s.id) { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text(if (s.id.isBlank()) "Nuova sede o impianto" else if (s.impianto) "Impianto" else "Sede", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Segmenti(listOf("sede" to "Sede", "impianto" to "Impianto"), tipo, { tipo = it })
            CampoTesto(nome, { nome = it }, "Nome", Modifier.fillMaxWidth(), segnaposto = if (tipo == "impianto") "Cabina MT" else "Sede legale",
                errore = if (provato && nome.isBlank()) "Scrivi il nome" else null)
            CampoTesto(indirizzo, { indirizzo = it }, "Indirizzo", Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CampoTesto(cap, { cap = it.filter { ch -> ch.isDigit() }.take(5) }, "CAP", Modifier.weight(1f), tastiera = KeyboardType.Number)
                CampoTesto(citta, { citta = it }, "Città", Modifier.weight(2f))
            }
            CampoTesto(provincia, { provincia = it.uppercase().take(2) }, "Provincia", Modifier.fillMaxWidth(), segnaposto = "VI")
            CampoTesto(note, { note = it }, "Note", Modifier.fillMaxWidth(), righe = 2)
        }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (salvo) "Salvo…" else "Salva", {
            provato = true
            if (salvo || nome.isBlank()) return@PulsantePrincipale
            salvo = true
            errore = null
            onSalva(s.copy(tipo = tipo, nome = nome.trim(), indirizzo = indirizzo.trim(), cap = cap.trim(), citta = citta.trim(), provincia = provincia.trim(), note = note.trim())) { e ->
                salvo = false
                if (e == null) onChiudi() else errore = e
            }
        }, altezza = 56.dp, abilitato = !salvo)
        if (s.id.isNotBlank()) PulsanteTesto("Archivia", onArchivia, Modifier.fillMaxWidth(), colore = c.rossoTesto)
    }
}

// ---------------------------------------------------------------------------------- modulo

/** Com'è andato "Controlla" della partita IVA. */
private sealed interface Controllo {
    data object InCorso : Controllo
    data class Trovato(val dati: DatiPartitaIva) : Controllo
    data class Errore(val messaggio: String) : Controllo
}

/**
 * Il modulo di un cliente o di un fornitore (§4), a gruppi: chi è, dati fiscali
 * (con Controlla per la partita IVA), contatti, tariffa (solo clienti, solo con i
 * soldi), note. Un doppione si apre invece di crearne un altro.
 */
@Composable
fun SchermataModificaCliente(dati: Dati, nav: Navigatore, id: String?, fornitore: Boolean) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val perm = LocalPermessi.current
    val scope = rememberCoroutineScope()
    val scorri = rememberScrollState()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val esistente = id?.let { ana.soggetto(it) }

    if (id != null && esistente == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Modifica")
            Text("Non trovo questa anagrafica. Torna indietro e riprova.", style = Testi.testo, color = c.tenue)
        }
        return
    }

    // I campi partono da quello che c'è; rememberSaveable li tiene se si gira il telefono.
    var nome by rememberSaveable(id) { mutableStateOf(esistente?.nome.orEmpty()) }
    var eCliente by rememberSaveable(id) { mutableStateOf(esistente?.cliente ?: !fornitore) }
    var eFornitore by rememberSaveable(id) { mutableStateOf(esistente?.fornitore ?: fornitore) }
    var partitaIva by rememberSaveable(id) { mutableStateOf(esistente?.partitaIva.orEmpty()) }
    var codiceFiscale by rememberSaveable(id) { mutableStateOf(esistente?.codiceFiscale.orEmpty()) }
    var sdi by rememberSaveable(id) { mutableStateOf(esistente?.codiceSdi.orEmpty()) }
    var pec by rememberSaveable(id) { mutableStateOf(esistente?.pec.orEmpty()) }
    var email by rememberSaveable(id) { mutableStateOf(esistente?.email.orEmpty()) }
    var telefono by rememberSaveable(id) { mutableStateOf(esistente?.telefono.orEmpty()) }
    var indirizzo by rememberSaveable(id) { mutableStateOf(esistente?.indirizzo.orEmpty()) }
    var cap by rememberSaveable(id) { mutableStateOf(esistente?.cap.orEmpty()) }
    var citta by rememberSaveable(id) { mutableStateOf(esistente?.citta.orEmpty()) }
    var provincia by rememberSaveable(id) { mutableStateOf(esistente?.provincia.orEmpty()) }
    var altriNomi by rememberSaveable(id) { mutableStateOf(esistente?.alias.orEmpty().joinToString(", ")) }
    var fissa by rememberSaveable(id) { mutableStateOf(esistente?.tariffaFissa != null) }
    var tariffaFissa by rememberSaveable(id) { mutableStateOf(Numeri.scrivi(esistente?.tariffaFissa)) }
    var ultimaTariffa by rememberSaveable(id) { mutableStateOf(Numeri.scrivi(esistente?.ultimaTariffa)) }
    var costoFisso by rememberSaveable(id) { mutableStateOf(Numeri.scrivi(esistente?.costoFisso)) }
    // Di solito il viaggio non si paga e i km sì: è così finché non si sceglie altro (come sul computer).
    var pagaViaggio by rememberSaveable(id) { mutableStateOf(esistente?.pagaViaggio == true) }
    var kmRimborsati by rememberSaveable(id) { mutableStateOf(esistente?.kmRimborsati != false) }
    var note by rememberSaveable(id) { mutableStateOf(esistente?.note.orEmpty()) }
    // Fase 4: "auto" / "si" / "no" come sul computer; i giorni vuoti = quelli delle impostazioni.
    var sostituto by rememberSaveable(id) { mutableStateOf(when (esistente?.sostitutoImposta) { true -> "si"; false -> "no"; null -> "auto" }) }
    var giorniPagamento by rememberSaveable(id) { mutableStateOf(esistente?.pagamentoGiorni?.toString().orEmpty()) }
    var fineMese by rememberSaveable(id) { mutableStateOf(when (esistente?.pagamentoFineMese) { true -> "si"; false -> "no"; null -> "auto" }) }
    var fattureToccate by rememberSaveable(id) { mutableStateOf(false) }
    var provato by rememberSaveable(id) { mutableStateOf(false) }
    var salvo by remember { mutableStateOf(false) }
    var erroreSalva by remember { mutableStateOf<String?>(null) }
    var controllo by remember { mutableStateOf<Controllo?>(null) }

    val alias = altriNomi.split(',').map { it.trim() }.filter { it.isNotBlank() }
    val doppione = if (nome.isBlank() && partitaIva.isBlank()) null else ana.doppioneDi(nome, alias, partitaIva, tranne = esistente?.id.orEmpty())
    val conSoldi = eCliente && perm.costi
    val conFatture = conSoldi && perm.vede(Moduli.FATTURAZIONE)
    val errGiorni = giorniPagamento.trim().takeIf { it.isNotEmpty() }?.let { t -> if (t.toIntOrNull()?.let { it in 0..365 } != true) "Giorni di pagamento: da 0 a 365" else null }

    val errNome = if (provato && nome.isBlank()) "Scrivi il nome o la ragione sociale" else null
    val errTipo = if (provato && !eCliente && !eFornitore) "Scegli se è un cliente, un fornitore o tutti e due" else null
    val errPiva = PartitaIva.errore(partitaIva)
    val errSdi = if (sdi.isNotBlank() && sdi.trim().length != 7) "Il codice SDI ha 7 caratteri" else null
    val errPec = erroreEmail(pec)
    val errEmail = erroreEmail(email)
    val errCap = if (cap.isNotBlank() && !(cap.length == 5 && cap.all { it.isDigit() })) "Il CAP ha 5 cifre" else null
    val errProvincia = if (provincia.isNotBlank() && !(provincia.length == 2 && provincia.all { it.isLetter() })) "La provincia ha 2 lettere, per esempio VI" else null
    val errFissa = when {
        !conSoldi || !fissa -> null
        tariffaFissa.isBlank() -> if (provato) "Scrivi la tariffa" else null
        else -> erroreNumero(tariffaFissa)
    }
    val errUltima = if (!conSoldi || fissa) null else erroreNumero(ultimaTariffa)
    val errCosto = if (!conSoldi) null else erroreNumero(costoFisso)
    val errori = listOfNotNull(errPiva, errSdi, errPec, errEmail, errCap, errProvincia, errFissa, errUltima, errCosto, if (conFatture) errGiorni else null)

    fun controlla() {
        val p = partitaIva.filter { it.isDigit() }
        if (p.isEmpty()) { controllo = Controllo.Errore("Scrivi la partita IVA"); return }
        PartitaIva.errore(p)?.let { controllo = Controllo.Errore(it); return }
        controllo = Controllo.InCorso
        scope.launch {
            controllo = dati.controllaPartitaIva(p).fold(
                onSuccess = { d -> if (d.valida) Controllo.Trovato(d) else Controllo.Errore("Questa partita IVA non risulta attiva: controlla le cifre") },
                onFailure = { Controllo.Errore(spiegaErrore(it)) },
            )
        }
    }

    fun salva() {
        provato = true
        if (salvo) return
        if (nome.isBlank() || (!eCliente && !eFornitore) || errori.isNotEmpty() || (conSoldi && fissa && tariffaFissa.isBlank())) {
            scope.launch { scorri.animateScrollTo(0) }
            return
        }
        val base = esistente ?: Cliente(id = "", nome = "")
        val soggetto = base.copy(
            nome = nome.trim(),
            cliente = eCliente,
            fornitore = eFornitore,
            partitaIva = partitaIva.trim(),
            codiceFiscale = codiceFiscale.trim().uppercase(),
            codiceSdi = sdi.trim().uppercase(),
            pec = pec.trim(),
            email = email.trim(),
            telefono = telefono.trim(),
            indirizzo = indirizzo.trim(),
            cap = cap.trim(),
            citta = citta.trim(),
            provincia = provincia.trim().uppercase(),
            alias = alias,
            note = note.trim(),
        ).let { s ->
            // Le regole della tariffa si scrivono solo se si vedono: senza i soldi restano com'erano.
            if (!conSoldi) s else s.copy(
                tariffaFissa = if (fissa) Numeri.leggi(tariffaFissa) else null,
                // L'ultima libera resta anche per un cliente a tariffa fissa: se torna libero si riparte da lì.
                ultimaTariffa = Numeri.leggi(ultimaTariffa),
                costoFisso = Numeri.leggi(costoFisso),
                pagaViaggio = pagaViaggio,
                kmRimborsati = kmRimborsati,
            )
        }.let { s ->
            // Come il computer: si mandano solo se il modulo li conosce (letti dal server, o toccati qui).
            if (!conFatture || !(s.fatturazioneLetta || fattureToccate)) s else s.copy(
                sostitutoImposta = when (sostituto) { "si" -> true; "no" -> false; else -> null },
                pagamentoGiorni = giorniPagamento.trim().toIntOrNull(),
                pagamentoFineMese = when (fineMese) { "si" -> true; "no" -> false; else -> null },
                fatturazioneLetta = true,
            )
        }
        salvo = true
        erroreSalva = null
        scope.launch {
            dati.salvaCliente(soggetto, esistente == null).fold(
                onSuccess = { ris ->
                    avvisi.mostra(if (ris.giaEsisteva) "C'era già: ${ris.dato.nome}" else "Salvato ${ris.dato.nome}")
                    nav.indietro()
                    if (esistente == null && ris.dato.id.isNotBlank()) nav.vai("cliente/${ris.dato.id}")
                },
                onFailure = { e ->
                    salvo = false
                    erroreSalva = spiegaErrore(e)
                },
            )
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(scorri).padding(MarginePagina).padding(bottom = 170.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(
                when {
                    esistente != null -> "Modifica"
                    fornitore -> "Nuovo fornitore"
                    else -> "Nuovo cliente"
                },
            )

            // ---- chi è
            Etichetta("Chi è")
            CampoTesto(nome, { nome = it }, "Nome o ragione sociale", Modifier.fillMaxWidth(), errore = errNome)
            Scheda(orizzontale = 18.dp, verticale = 6.dp, raggio = 20.dp, spazio = 0.dp) {
                RigaInterruttore("È un cliente", eCliente) { eCliente = it }
                LineaElenco()
                RigaInterruttore("È un fornitore", eFornitore) { eFornitore = it }
            }
            errTipo?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }

            // ---- dati fiscali
            Etichetta("Dati fiscali", Modifier.padding(top = 8.dp))
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                // Testo, non numero: "01234567890" tiene lo zero davanti. Una estera (lettere davanti) resta com'è.
                CampoTesto(
                    partitaIva,
                    { v -> partitaIva = if (v.all { it.isDigit() }) v.take(11) else v.trim(); controllo = null },
                    "Partita IVA", Modifier.weight(1f), tastiera = KeyboardType.Number,
                )
                PulsanteBordo(if (controllo == Controllo.InCorso) "Controllo…" else "Controlla", { if (controllo != Controllo.InCorso) controlla() }, altezza = 56.dp)
            }
            when (val k = controllo) {
                is Controllo.Errore -> Text(k.messaggio, style = Testi.secondario, color = c.rossoTesto)
                is Controllo.Trovato -> PropostaPartitaIva(k.dati) {
                    if (k.dati.nome.isNotBlank()) nome = k.dati.nome
                    if (k.dati.indirizzo.isNotBlank()) indirizzo = k.dati.indirizzo
                    if (k.dati.cap.isNotBlank()) cap = k.dati.cap
                    if (k.dati.citta.isNotBlank()) citta = k.dati.citta
                    if (k.dati.provincia.isNotBlank()) provincia = k.dati.provincia
                    controllo = null
                    avvisi.mostra("Dati presi dal registro")
                }
                else -> if (errPiva != null) Text(errPiva, style = Testi.secondario, color = c.rossoTesto)
            }
            CampoTesto(codiceFiscale, { codiceFiscale = it.trim() }, "Codice fiscale", Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CampoTesto(sdi, { sdi = it.trim().uppercase().take(7) }, "Codice SDI", Modifier.weight(1f), errore = errSdi)
                CampoTesto(pec, { pec = it.trim() }, "PEC", Modifier.weight(1.4f), tastiera = KeyboardType.Email, errore = errPec)
            }

            // ---- contatti
            Etichetta("Contatti", Modifier.padding(top = 8.dp))
            CampoTesto(email, { email = it.trim() }, "Email", Modifier.fillMaxWidth(), tastiera = KeyboardType.Email, errore = errEmail)
            CampoTesto(telefono, { telefono = it }, "Telefono", Modifier.fillMaxWidth(), tastiera = KeyboardType.Phone)
            CampoTesto(indirizzo, { indirizzo = it }, "Indirizzo", Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CampoTesto(cap, { cap = it.filter { ch -> ch.isDigit() }.take(5) }, "CAP", Modifier.weight(1f), tastiera = KeyboardType.Number, errore = errCap)
                CampoTesto(citta, { citta = it }, "Città", Modifier.weight(2f))
            }
            CampoTesto(provincia, { provincia = it.uppercase().take(2) }, "Provincia", Modifier.fillMaxWidth(), segnaposto = "VI", errore = errProvincia)
            CampoTesto(altriNomi, { altriNomi = it }, "Altri nomi", Modifier.fillMaxWidth(), segnaposto = "—")

            // ---- tariffa (solo clienti, solo con i soldi)
            if (conSoldi) {
                Etichetta("Tariffa", Modifier.padding(top = 8.dp))
                Scheda(orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp, spazio = 10.dp) {
                    Segmenti(listOf(true to "Tariffa fissa", false to "Tariffa libera"), fissa, { fissa = it })
                    if (fissa) {
                        CampoTesto(
                            tariffaFissa, { tariffaFissa = it }, "Tariffa fissa", Modifier.fillMaxWidth(),
                            tastiera = KeyboardType.Decimal, suffisso = "€/h", errore = errFissa,
                        )
                    } else {
                        CampoTesto(
                            ultimaTariffa, { ultimaTariffa = it }, "Ultima tariffa usata", Modifier.fillMaxWidth(),
                            segnaposto = "—", tastiera = KeyboardType.Decimal, suffisso = "€/h", errore = errUltima,
                        )
                    }
                    CampoTesto(
                        costoFisso, { costoFisso = it }, "Costo orario fisso", Modifier.fillMaxWidth(),
                        segnaposto = "—", tastiera = KeyboardType.Decimal, suffisso = "€/h", errore = errCosto,
                    )
                    RigaSiNo("Viaggio pagato", pagaViaggio) { pagaViaggio = it }
                    RigaSiNo("Km rimborsati", kmRimborsati) { kmRimborsati = it }
                }
            }

            // ---- fatture (fase 4, solo per chi vede le fatture): sostituto d'imposta e pagamento
            if (conFatture) {
                Etichetta("Fatture", Modifier.padding(top = 8.dp))
                Scheda(orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp, spazio = 10.dp) {
                    Text("Sostituto d'imposta", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                    Segmenti(listOf("auto" to "Automatico", "si" to "Sì", "no" to "No"), sostituto, { sostituto = it; fattureToccate = true })
                    if (sostituto == "auto") Text(
                        if (partitaIva.isNotBlank()) "Sì: ha la partita IVA" else "No: è un privato",
                        style = Testi.secondario, color = c.tenue,
                    )
                    CampoTesto(
                        giorniPagamento, { giorniPagamento = it.filter { ch -> ch.isDigit() }.take(3); fattureToccate = true }, "Pagamento a",
                        Modifier.fillMaxWidth(), segnaposto = ana.impostazione("GIORNI_PAGAMENTO").ifBlank { "30" },
                        tastiera = KeyboardType.Number, suffisso = "giorni", errore = errGiorni,
                    )
                    Text("Poi a fine mese", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                    Segmenti(listOf("auto" to "Automatico", "si" to "Sì", "no" to "No"), fineMese, { fineMese = it; fattureToccate = true })
                }
            }

            // ---- note
            Etichetta("Note", Modifier.padding(top = 8.dp))
            CampoTesto(note, { note = it }, null, Modifier.fillMaxWidth(), righe = 3)
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter), sopraBarra = false) {
            erroreSalva?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
            if (doppione != null) {
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.rossoTenue).padding(horizontal = 14.dp, vertical = 12.dp)) {
                    Text("C'è già ${doppione.nome}" + if (doppione.archiviato) ", fra gli archiviati" else "", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.rossoTesto)
                }
                PulsantePrincipale("Apri ${doppione.nome}", { nav.indietro(); nav.vai("cliente/${doppione.id}") }, icona = Icone.freccia)
            } else {
                PulsantePrincipale(if (salvo) "Salvo…" else "Salva", { salva() }, icona = Icone.spunta, abilitato = !salvo)
            }
        }
    }
}

/** Quello che ha trovato "Controlla": nome e indirizzo, da accettare con un tocco. */
@Composable
private fun PropostaPartitaIva(d: DatiPartitaIva, onUsa: () -> Unit) {
    val c = W.colori
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.firmatoFondo).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Partita IVA attiva", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.firmatoTesto)
        if (d.nome.isNotBlank()) Text(d.nome, style = Testi.forte, color = c.testo)
        val dove = listOf(d.indirizzo, listOf(d.cap, d.citta).filter { it.isNotBlank() }.joinToString(" ") + if (d.provincia.isNotBlank()) " (${d.provincia})" else "")
            .map { it.trim() }.filter { it.isNotBlank() }.joinToString(", ")
        if (dove.isNotBlank()) Text(dove, style = Testi.secondario, color = c.testo2)
        if (d.nome.isNotBlank() || dove.isNotBlank()) PulsanteBordo("Usa questi dati", onUsa, altezza = 44.dp)
    }
}

// ---------------------------------------------------------------------------------- aiuti

/** "30 €/h fissa", "libera · ultima 42 €/h", "libera". */
private fun tariffaBreve(cl: Cliente): String = when {
    cl.tariffaFissa != null -> "${Numeri.scrivi(cl.tariffaFissa)} €/h fissa"
    cl.ultimaTariffa != null && cl.ultimaTariffa > 0 -> "libera · ultima ${Numeri.scrivi(cl.ultimaTariffa)} €/h"
    else -> "libera"
}

/** "ottobre": il mese dentro una frase ("12 h a ottobre"). */
private fun nomeMeseMinuscolo(m: YearMonth): String = Conti.nomeMese(m).substringBefore(' ').lowercase(Locale.ITALY)

/** "GD" per Giulia Dal Santo. */
private fun iniziali(nome: String): String =
    nome.split(' ', '.', '-').filter { it.isNotBlank() && it.first().isLetterOrDigit() }.take(2).joinToString("") { it.take(1) }.uppercase().ifBlank { "?" }

/** "Non è un numero" per "trenta" o "3,4,5"; niente per un campo vuoto. */
private fun erroreNumero(testo: String): String? =
    if (testo.isBlank() || Numeri.leggi(testo) != null) null else "Non è un numero"

/** Un'email senza la @ si dice subito. */
private fun erroreEmail(testo: String): String? =
    if (testo.isBlank() || (testo.contains('@') && testo.substringAfter('@').contains('.'))) null else "Scrivi l'email intera, per esempio nome@esempio.it"

/** Cosa è successo e cosa fare: Dati lo dice già in italiano; una frase di riserva se manca. */
private fun spiegaErrore(e: Throwable): String =
    e.message?.takeIf { it.isNotBlank() } ?: "Il server non risponde: controlla la rete e riprova."

/** Apre il telefono col numero già scritto. */
private fun chiama(ctx: Context, numero: String, avvisi: Avvisi) {
    try {
        ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + numero.filter { it.isDigit() || it == '+' })))
    } catch (_: ActivityNotFoundException) {
        avvisi.mostra("Su questo telefono non c'è un'app per chiamare")
    }
}

/** Apre la posta con l'indirizzo già scritto. */
private fun scriviEmail(ctx: Context, indirizzo: String, avvisi: Avvisi) {
    try {
        ctx.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$indirizzo")))
    } catch (_: ActivityNotFoundException) {
        avvisi.mostra("Su questo telefono non c'è un'app per la posta")
    }
}

/** La riga degli elenchi vuoti. */
@Composable
private fun TestoVuotoClienti(testo: String) {
    Text(
        testo, style = Testi.secondarioGrande, color = W.colori.tenue, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp, horizontal = 12.dp),
    )
}

/** La riga calma dentro una scheda vuota ("Nessun referente…"). */
@Composable
private fun TestoRiga(testo: String) {
    Text(testo, style = Testi.secondarioGrande, color = W.colori.tenue, modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp))
}
