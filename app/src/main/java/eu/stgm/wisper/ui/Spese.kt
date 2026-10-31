@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.CategoriaSpesa
import eu.stgm.wisper.rapportino.ContiOreSpese
import eu.stgm.wisper.rapportino.Destinazione
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.FilaOreSpese
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.RimborsoPersona
import eu.stgm.wisper.rapportino.Spesa
import eu.stgm.wisper.rapportino.StatoVoce
import eu.stgm.wisper.rapportino.Trasferta
import eu.stgm.wisper.rapportino.Veicolo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit

/*
 * Spese e trasferte (fase 3, voce 7: docs/gestionale/fase3.md §5, prototipo
 * Gestionale-fase3.html, pagSpese): il mese con ‹ ›, i tre riquadri, Spese ·
 * Trasferte · Rimborsi, Nuova spesa (prima la foto). Le spese vanno nella coda
 * su disco con lo scontrino e partono quando c'è rete; trasferte e rimborsi si
 * fanno in diretta.
 */

enum class SegmentoSpese { SPESE, TRASFERTE, RIMBORSI }

object RicordoSpese {
    var segmento by mutableStateOf(SegmentoSpese.SPESE)
    var mese: YearMonth = YearMonth.now()
    var spesa: Spesa? = null
    var trasferta: Trasferta? = null
}

@Composable
fun SchermataSpese(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val perm = LocalPermessi.current
    val scrive = perm.modifica(Moduli.SPESE)
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val spese by dati.spese.collectAsStateWithLifecycle()
    val trasferte by dati.trasferte.collectAsStateWithLifecycle()
    val aggiornamento by dati.aggiornamento.collectAsStateWithLifecycle()
    var mese by rememberSaveable { mutableStateOf(RicordoSpese.mese) }
    LaunchedEffect(mese) { RicordoSpese.mese = mese; dati.aggiornaSpese(mese) }
    val elencoS = spese?.takeIf { YearMonth.from(it.da) == mese }
    val elencoT = trasferte?.takeIf { YearMonth.from(it.da) == mese }
    val seg = RicordoSpese.segmento
    val io = sessione.utente.id
    var menu by remember { mutableStateOf(false) }
    val esporta = rememberEsportaPerExcel(dati)

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataMenu { PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            TitoloPagina("Spese e trasferte")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(nomeMese(mese), style = Testi.titoloScheda, color = c.testo, modifier = Modifier.weight(1f))
                PulsanteTondo(Icone.frecciaSinistra, "Mese prima", { mese = mese.minusMonths(1) })
                Spacer(Modifier.width(8.dp))
                PulsanteTondo(Icone.freccia, "Mese dopo", {
                    if (mese.plusMonths(1).isAfter(YearMonth.now())) avvisi.mostra("${nomeMese(mese.plusMonths(1)).substringBefore(' ')} non è ancora cominciato")
                    else mese = mese.plusMonths(1)
                })
            }
            val tot = elencoS?.totali
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RiquadroSoldi("Al cliente", tot?.cliente, Modifier.weight(1f))
                RiquadroSoldi("Allo studio", tot?.studio, Modifier.weight(1f))
                RiquadroSoldi("Da rimborsare", tot?.let { it.daRimborsare + (elencoT?.totali?.daRimborsare ?: 0.0) }?.let(ContiOreSpese::centesimi), Modifier.weight(1f))
            }
            Segmenti(
                listOf(SegmentoSpese.SPESE to "Spese", SegmentoSpese.TRASFERTE to "Trasferte", SegmentoSpese.RIMBORSI to "Rimborsi"),
                seg, { RicordoSpese.segmento = it },
            )
            val errore = aggiornamento.errore.takeIf { it.isNotBlank() && !aggiornamento.inCorso }
            when (seg) {
                SegmentoSpese.SPESE -> when {
                    elencoS == null && errore != null -> ErroreConRiprova(errore) { dati.aggiornaSpese(mese) }
                    elencoS == null -> Segnaposto(200.dp)
                    else -> SchedaElenco {
                        if (elencoS.spese.isEmpty()) RigaCalma("Nessuna spesa a " + nomeMese(mese).substringBefore(' ').lowercase(ITALIA))
                        elencoS.spese.forEachIndexed { i, s ->
                            if (i > 0) LineaElenco()
                            RigaSpesa(s, mostraChi = s.idUtente.isNotBlank() && s.idUtente != io) {
                                RicordoSpese.spesa = s
                                nav.vai("spesa/" + s.chiave)
                            }
                        }
                    }
                }
                SegmentoSpese.TRASFERTE -> {
                    when {
                        elencoT == null && errore != null -> ErroreConRiprova(errore) { dati.aggiornaSpese(mese) }
                        elencoT == null -> Segnaposto(120.dp)
                        else -> SchedaElenco {
                            if (elencoT.trasferte.isEmpty()) RigaCalma("Nessuna trasferta a " + nomeMese(mese).substringBefore(' ').lowercase(ITALIA))
                            elencoT.trasferte.forEachIndexed { i, t ->
                                if (i > 0) LineaElenco()
                                RigaTrasferta(t, mostraChi = t.idUtente.isNotBlank() && t.idUtente != io) {
                                    RicordoSpese.trasferta = t
                                    nav.vai("trasferta/" + t.id)
                                }
                            }
                        }
                    }
                    if (scrive) PulsanteBordo("Nuova trasferta", { RicordoSpese.trasferta = null; nav.vai("trasferta-nuova") }, Modifier.fillMaxWidth(), icona = Icone.piu)
                }
                SegmentoSpese.RIMBORSI -> PaginaRimborsi(dati)
            }
        }
        if (scrive) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuova spesa", { RicordoSpese.spesa = null; nav.vai("spesa-nuova") }, Modifier.bersaglio("nuova-spesa"), icona = Icone.fotocamera)
            }
        }
    }

    // Il riepilogo e i file per Excel del mese (sul computer: i pulsanti del Riepilogo).
    if (menu) {
        val nomeM = nomeMese(mese).substringBefore(' ').lowercase(ITALIA)
        FoglioDalBasso({ menu = false }) {
            Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
            VoceMenu(Icone.lista, "Riepilogo del mese", { menu = false; nav.vai("spese-riepilogo") })
            VoceMenu(Icone.scarica, "Esporta le spese di $nomeM", { menu = false; esporta("spese", mese.atDay(1), mese.atEndOfMonth(), "Le spese di $nomeM") })
            VoceMenu(Icone.scarica, "Esporta le trasferte di $nomeM", { menu = false; esporta("trasferte", mese.atDay(1), mese.atEndOfMonth(), "Le trasferte di $nomeM") })
            VoceMenu(Icone.scarica, "Esporta i rimborsi da fare", { menu = false; esporta("rimborsi", null, null, "I rimborsi da fare") })
        }
    }
}

@Composable
private fun ErroreConRiprova(testo: String, onRiprova: () -> Unit) {
    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
        Text(testo, style = Testi.testo, color = W.colori.testo2)
        PulsanteBordo("Riprova", onRiprova, Modifier.fillMaxWidth(), icona = Icone.riapri)
    }
}

/** Un riquadro coi soldi del mese: l'importo all'italiana, più piccolo se è lungo. */
@Composable
private fun RiquadroSoldi(etichetta: String, valore: Double?, modifier: Modifier) {
    val c = W.colori
    val testo = valore?.let { Numeri.euro(it) } ?: "—"
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(c.scheda).border(1.dp, c.bordoScheda, RoundedCornerShape(18.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(testo, style = Testi.titoloSezione.copy(fontSize = if (testo.length > 9) 15.sp else 18.sp), color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(etichetta, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Una spesa: l'icona della categoria, cosa, commessa e giorno, l'importo, a chi va e lo stato se non è approvata. */
@Composable
private fun RigaSpesa(s: Spesa, mostraChi: Boolean, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconaRiga(iconaCategoria(s.categoria))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(s.descrizione.ifBlank { CategoriaSpesa.nome(s.categoria) }, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (s.inCoda) NuvolaInCoda()
            }
            val sotto = listOfNotNull(
                s.idCommessa.ifBlank { if (s.idRapportino.isNotBlank()) null else "Senza commessa" },
                s.idRapportino.ifBlank { null },
                FilaOreSpese.giornoBreve(s.data),
                when {
                    s.pagataDaMe && mostraChi -> "pagata da " + s.utente.substringBefore(' ')
                    s.pagataDaMe -> "pagata da me"
                    mostraChi -> s.utente.substringBefore(' ')
                    else -> null
                },
                if (s.foto.isEmpty() && !s.fotoInCoda) "senza scontrino" else null,
            ).joinToString(" · ")
            Text(sotto, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (s.stato == StatoVoce.RESPINTA) PillolaStatoVoce(s.stato, s.motivoRifiuto, Modifier.padding(top = 2.dp))
            if (s.errore.isNotBlank()) Text(s.errore, style = Testi.secondario, color = c.rossoTesto)
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(Numeri.euro(s.importo), style = Testi.forte, color = c.testo)
            PillolaDestinazione(s.destinazione)
            if (s.stato != StatoVoce.RESPINTA) PillolaStatoVoce(s.stato)
        }
    }
}

@Composable
private fun RigaTrasferta(t: Trasferta, mostraChi: Boolean, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconaRiga(Icone.auto, blu = true)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(t.destinazione, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val sotto = listOfNotNull(
                t.idCommessa.ifBlank { null },
                FilaOreSpese.giornoBreve(t.dal) + if (t.al != t.dal) "–" + FilaOreSpese.giornoBreve(t.al) else "",
                if (t.kmTotali > 0) Numeri.scrivi(t.kmTotali) + " km" + (t.euroKm?.let { " × " + Numeri.scrivi(it) + " €" } ?: "") else null,
                if (mostraChi) t.utente.substringBefore(' ') else null,
            ).joinToString(" · ")
            Text(sotto, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (t.stato == StatoVoce.RESPINTA) PillolaStatoVoce(t.stato, t.motivoRifiuto, Modifier.padding(top = 2.dp))
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(Numeri.euro(t.totale), style = Testi.forte, color = c.testo)
            if (t.stato != StatoVoce.RESPINTA) PillolaStatoVoce(t.stato)
        }
    }
}

/** Rimborsi (fase3.md §5): per persona il totale da restituire e le voci; Segna rimborsato solo per chi può. */
@Composable
private fun PaginaRimborsi(dati: Dati) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.rimborsi() }
    var daSegnare by remember { mutableStateOf<RimborsoPersona?>(null) }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> ErroreConRiprova(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val r = lettura.dato
            if (r.persone.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Nessun rimborso da fare") }
            r.persone.forEach { p ->
                Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 8.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(p.nome.ifBlank { "Senza nome" }, style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
                        Text(Numeri.euro(p.totale), style = Testi.titoloScheda, color = c.testo)
                    }
                    val sotto = listOfNotNull(
                        if (p.spese > 0) Testo.quanti(p.spese, "spesa pagata di tasca sua", "spese pagate di tasca sua") else null,
                        if (p.km > 0) Numeri.scrivi(p.km) + " km di trasferte" else null,
                    ).joinToString(" · ")
                    if (sotto.isNotBlank()) Text(sotto, style = Testi.secondarioGrande, color = c.tenue)
                    if (p.inAttesa > 0) Text("In attesa di approvazione: " + Numeri.euro(p.inAttesa), style = Testi.secondario, color = c.gialloTesto)
                    p.voci.forEach { v ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 32.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                listOfNotNull(v.data?.let { FilaOreSpese.giornoBreve(it) }, v.descrizione.ifBlank { null }, v.idCommessa.ifBlank { null }).joinToString(" · "),
                                style = Testi.secondario, color = c.testo2, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(Numeri.euro(v.importo), style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.testo)
                        }
                    }
                    if (r.puoSegnare && p.totale > 0) PulsanteRiga("Segna rimborsato", { daSegnare = p })
                }
            }
            daSegnare?.let { p ->
                FoglioConferma(
                    titolo = "Segnare rimborsati ${Numeri.euro(p.totale)} a ${p.nome.substringBefore(' ')}?",
                    testo = "Le spese e le trasferte rimborsate non si cambiano più.",
                    azione = "Segna rimborsato",
                    onConferma = {
                        daSegnare = null
                        ambitoFase3.launch {
                            dati.segnaRimborsato(p.voci)
                                .onSuccess { (_, totale) ->
                                    giro++
                                    avvisi.mostra("Segnato rimborsato: " + Numeri.euro(totale), annulla = {
                                        ambitoFase3.launch { dati.segnaRimborsato(p.voci, annulla = true).onSuccess { giro++ }.onFailure { e -> avvisi.mostra(spiegaErrore2(e, "Non è tornato com'era: riprova")) } }
                                    })
                                }
                                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non l'ho segnato: riprova")) }
                        }
                    },
                    onAnnulla = { daSegnare = null },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------------- la spesa

/**
 * Nuova spesa (fase3.md §5): prima la fotocamera (o "Senza scontrino"), poi
 * l'importo grande, la categoria a pillole, il giorno, la commessa, A chi va,
 * "Il documento è intestato al cliente", L'ho pagata io, la descrizione.
 * [arg]: "nuova", "nuova/trasferta/<id>" o la chiave di una spesa.
 */
@Composable
fun SchermataSpesa(dati: Dati, nav: Navigatore, arg: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val spese by dati.spese.collectAsStateWithLifecycle()
    val trasferte by dati.trasferte.collectAsStateWithLifecycle()
    val nuova = arg.startsWith("nuova")
    val idTrasferta = if (arg.startsWith("nuova/trasferta/")) arg.removePrefix("nuova/trasferta/") else ""
    val esistente = remember(arg) { if (nuova) null else RicordoSpese.spesa?.takeIf { it.chiave == arg } ?: spese?.spese?.firstOrNull { it.chiave == arg } }
    if (!nuova && esistente == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            RigaCalma("Questa spesa non c'è più")
        }
        return
    }
    val trasferta = trasferte?.trasferte?.firstOrNull { it.id == idTrasferta }
    val recenti = remember(ana, viste, spese) { FilaOreSpese.commesseRecenti(ana, viste.map { it.rapportino }, spese = spese?.spese.orEmpty()) }

    // Fase 5 (§7.5): "+ Materiale o spesa" dal ticket: materiale, al cliente, la commessa e il ticket.
    val delTicket = remember(arg) { if (nuova && idTrasferta.isBlank()) RicordoTicket.perOreSpese.also { RicordoTicket.perOreSpese = null } else null }
    var passo by rememberSaveable { mutableStateOf(if (nuova) 1 else 2) }
    var foto by rememberSaveable { mutableStateOf<String?>(null) }
    var importo by rememberSaveable { mutableStateOf(esistente?.importo?.takeIf { it > 0 }?.let(::soldiNelCampo).orEmpty()) }
    var categoria by rememberSaveable { mutableStateOf(esistente?.categoria ?: if (delTicket != null) "materiale" else "altro") }
    var data by rememberSaveable { mutableStateOf(esistente?.data ?: trasferta?.dal ?: LocalDate.now()) }
    var idCommessa by rememberSaveable { mutableStateOf(esistente?.idCommessa ?: delTicket?.idCommessa ?: trasferta?.idCommessa ?: recenti.firstOrNull()?.id ?: "") }
    var destinazione by rememberSaveable { mutableStateOf<String?>(esistente?.destinazione ?: if (delTicket != null) Destinazione.CLIENTE else null) }
    var anticipazione by rememberSaveable { mutableStateOf(esistente?.anticipazione ?: false) }
    var pagataDaMe by rememberSaveable { mutableStateOf(esistente?.pagataDaMe ?: true) }
    var descrizione by rememberSaveable { mutableStateOf(esistente?.descrizione.orEmpty()) }
    // Fase 6 (§7.4): per carburante, pedaggio e parcheggio il mezzo (prima quelli che ho io), per il carburante i km.
    var idVeicolo by rememberSaveable { mutableStateOf(esistente?.idVeicolo.orEmpty()) }
    var kmContachilometri by rememberSaveable { mutableStateOf(esistente?.km?.toString().orEmpty()) }
    val mezziSpesa = remember(ana) { ana.mezzi.sortedByDescending { it.mio } }
    val chiedeMezzo = categoria in CategoriaSpesa.CON_MEZZO && mezziSpesa.isNotEmpty()
    // Fase 6 (§12.8): l'esterno non ha rimborsi dallo studio, la spesa va nella sua fattura.
    val esterno = dati.sessione.value.interfaccia.esternoId.isNotBlank()
    var errore by remember { mutableStateOf<String?>(null) }
    var finestraGiorno by remember { mutableStateOf(false) }
    val dest = destinazione ?: Destinazione.diBase(idCommessa)
    fun cambia(campo: String) = esistente?.cambia(campo) ?: true
    val sola = esistente != null && !esistente.puoScrivere

    // Gli scontrini già sul server: si aprono; chi può cambiare la spesa li toglie (vanno nel cestino, §14.8).
    var fotoServer by remember(esistente) { mutableStateOf(esistente?.foto.orEmpty()) }
    var daTogliere by remember { mutableStateOf<FileRemoto?>(null) }
    var togliendo by remember { mutableStateOf(false) }
    val togliFoto = esistente != null && esistente.puoScrivere && esistente.soloCampi == null
    fun apriScontrino(f: FileRemoto) {
        ambitoFase3.launch { apriScontrinoDelServer(ctx, dati, f)?.let { avvisi.mostra(it) } }
    }
    fun togliScontrino(f: FileRemoto) {
        if (togliendo) return
        togliendo = true
        ambitoFase3.launch {
            dati.togliFotoSpesa(f.id)
                .onSuccess { s -> fotoServer = s.foto; avvisi.mostra("Scontrino tolto") }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Lo scontrino non è stato tolto: riprova")) }
            togliendo = false
        }
    }

    // ---- la foto: come nel rapportino, ridotta subito e tenuta sul telefono finché non parte.
    var scattoInCorso by rememberSaveable { mutableStateOf<String?>(null) }
    val fotocamera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { riuscito ->
        val percorso = scattoInCorso ?: return@rememberLauncherForActivityResult
        scattoInCorso = null
        val scatto = File(percorso)
        if (!riuscito) { scatto.delete(); return@rememberLauncherForActivityResult }
        scope.launch {
            runCatching { dati.preparaFoto(Uri.fromFile(scatto)) }.onSuccess { foto = it.path; passo = 2 }
                .onFailure { avvisi.mostra("La foto non si legge: riprova") }
            scatto.delete()
        }
    }
    val galleria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { runCatching { dati.preparaFoto(uri) }.onSuccess { foto = it.path; passo = 2 } }
    }
    fun scatta() {
        if (dati.esempio) { foto = File(ctx.cacheDir, "esempio-scontrino.jpg").path; passo = 2; return }
        val f = Immagini.fileScatto(ctx)
        scattoInCorso = f.path
        fotocamera.launch(FileProvider.getUriForFile(ctx, ctx.packageName + ".foto", f))
    }
    fun dallaGalleria() {
        if (dati.esempio) { scatta(); return }
        galleria.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    fun salva() {
        errore = null
        if (sola) {
            // Una spesa che non si cambia più: si aggiunge solo lo scontrino.
            foto?.let { dati.aggiungiScontrino(esistente!!, File(it)); avvisi.mostra("Scontrino aggiunto") }
            nav.indietro()
            return
        }
        val euro = numeroScritto(importo)
        if (cambia("importo") && (euro == null || euro <= 0)) { errore = "Importo: scrivi quanto hai speso"; return }
        if (cambia("destinazione") && dest == Destinazione.CLIENTE && idCommessa.isBlank() && (esistente?.idCliente.isNullOrBlank())) {
            errore = "Al cliente: scegli la commessa o il cliente"; return
        }
        val kmScritti = kmContachilometri.trim().takeIf { it.isNotEmpty() }?.toLongOrNull()
        if (chiedeMezzo && categoria == "carburante" && idVeicolo.isNotBlank() && kmContachilometri.isNotBlank() && kmScritti == null) {
            errore = "Km del contachilometri: scrivi un numero"; return
        }
        val s = (esistente ?: Spesa(idLocale = "", idTrasferta = idTrasferta, idTicket = delTicket?.chiave.orEmpty(), idCliente = if (idCommessa.isBlank()) delTicket?.idCliente.orEmpty() else "")).copy(
            data = data, importo = euro?.let(ContiOreSpese::centesimi) ?: esistente?.importo ?: 0.0, categoria = categoria,
            descrizione = descrizione.trim(), idCommessa = idCommessa, destinazione = dest,
            anticipazione = dest == Destinazione.CLIENTE && anticipazione, pagataDaMe = pagataDaMe,
            idVeicolo = if (chiedeMezzo) idVeicolo else esistente?.idVeicolo.orEmpty(),
            km = if (chiedeMezzo && categoria == "carburante" && idVeicolo.isNotBlank()) kmScritti else esistente?.km,
            mezzoChiesto = chiedeMezzo,
        )
        dati.salvaSpesa(s, foto?.let(::File))
        RicordoSpese.spesa = null
        RicordoSpese.mese = YearMonth.from(data)
        nav.indietro()
        avvisi.mostra("Spesa salvata")
    }

    fun togli() {
        val s = esistente ?: return
        ambitoFase3.launch {
            dati.togliSpesa(s)
                .onSuccess {
                    nav.indietro()
                    avvisi.mostra("Spesa tolta", annulla = { ambitoFase3.launch { dati.togliSpesa(s, annulla = true).onFailure { e -> avvisi.mostra(spiegaErrore2(e, "Non è tornata: riprova")) } } })
                }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non l'ho tolta: riprova")) }
        }
    }

    if (passo == 1) {
        Column(
            Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Nuova spesa", sopra = trasferta?.destinazione?.let { "Trasferta · $it" })
            Column(
                Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(22.dp)).background(c.scelta)
                    .bordoTratteggiato(c.bordoCampo, 22.dp).clickable { scatta() }.semantics { role = Role.Button },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(Icone.fotocamera, null, tint = c.testo, modifier = Modifier.size(36.dp))
                Spacer(Modifier.height(8.dp))
                Text("Fotografa lo scontrino", style = Testi.forteGrande, color = c.testo)
            }
            PulsanteBordo("Scegli dalla galleria", { dallaGalleria() }, Modifier.fillMaxWidth(), icona = Icone.galleria)
            PulsanteTesto("Senza scontrino", { passo = 2 }, Modifier.fillMaxWidth(), colore = c.testo)
        }
        return
    }

    val focusImporto = remember { FocusRequester() }
    LaunchedEffect(Unit) { if (nuova && importo.isBlank()) runCatching { focusImporto.requestFocus() } }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true) {
                if (esistente != null && esistente.puoScrivere && esistente.soloCampi == null) PulsanteTesto("Togli", { togli() }, colore = c.rossoTesto)
            }
            TitoloPagina(if (nuova) "Nuova spesa" else "La spesa", sopra = (trasferta?.destinazione ?: esistente?.utente?.takeIf { esistente.idUtente != dati.sessione.value.utente.id })?.let { if (trasferta != null) "Trasferta · $it" else it })
            if (esistente?.stato == StatoVoce.RESPINTA) {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.rossoTenue).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Respinta" + if (esistente.approvataDaNome.isNotBlank()) " da ${esistente.approvataDaNome}" else "", style = Testi.forte, color = c.rossoTesto)
                    Text(esistente.motivoRifiuto, style = Testi.secondarioGrande, color = c.testo2)
                }
            }
            esistente?.bloccata?.takeIf { it.isNotBlank() }?.let { Scheda(orizzontale = 16.dp, verticale = 14.dp) { Text(it, style = Testi.secondarioGrande, color = c.testo2) } }

            // Lo scontrino: quelli già sul server in fila sotto, ognuno si apre col tocco.
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (fotoServer.isEmpty() || foto != null) MiniaturaScontrino(foto?.let(::File))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    val quante = fotoServer.size + (if (foto != null || esistente?.fotoInCoda == true) 1 else 0)
                    Text(if (quante == 0) "Senza scontrino" else Testo.quanti(quante, "scontrino", "scontrini"), style = Testi.forte, color = c.testo)
                    if (foto != null || esistente?.fotoInCoda == true) Text("Parte con la spesa", style = Testi.secondario, color = c.tenue)
                }
                PulsanteRiga(if (foto != null) "Rifai" else "Fotografa", { scatta() })
            }
            if (fotoServer.isNotEmpty()) {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    fotoServer.forEachIndexed { i, f ->
                        ScontrinoDelServer(dati, f, i + 1, { apriScontrino(f) }, if (togliFoto) ({ daTogliere = f }) else null)
                    }
                }
            }

            CampoTesto(
                importo, { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) { importo = t; errore = null } }, "Importo",
                tastiera = KeyboardType.Decimal, suffisso = "€", abilitato = cambia("importo"),
                stile = Testi.numeroGrande, campoModifier = Modifier.focusRequester(focusImporto),
            )
            Etichetta("Categoria")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CategoriaSpesa.ELENCO.forEach { k -> Pillola(CategoriaSpesa.nome(k), k == categoria, { if (cambia("categoria")) categoria = k }, altezza = 48.dp) }
            }
            if (chiedeMezzo) {
                Etichetta("Per quale mezzo")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    mezziSpesa.forEach { m ->
                        Pillola(m.titolo + if (m.fermo) " · fermo" else "", m.id == idVeicolo, { if (cambia("idVeicolo")) idVeicolo = m.id }, altezza = 48.dp)
                    }
                    Pillola("Nessuno", idVeicolo.isBlank(), { if (cambia("idVeicolo")) idVeicolo = "" }, altezza = 48.dp)
                }
                if (categoria == "carburante" && idVeicolo.isNotBlank()) {
                    CampoTesto(
                        kmContachilometri, { t -> if (t.all { it.isDigit() }) { kmContachilometri = t; errore = null } }, "Km del contachilometri",
                        tastiera = KeyboardType.Number, suffisso = "km", abilitato = cambia("km"),
                    )
                }
            }
            CampoQuando("Giorno", giornoEsteso(data).replaceFirstChar { it.uppercase() }, { if (cambia("data")) finestraGiorno = true })
            Etichetta("Commessa")
            SceltaCommessa(ana, recenti, idCommessa, { idCommessa = it }, conStudio = true, etichettaStudio = "Nessuna", abilitata = cambia("idCommessa"))
            Etichetta("A chi va")
            Segmenti(
                listOf(Destinazione.CLIENTE to "Al cliente", Destinazione.STUDIO to "Allo studio", Destinazione.PERSONALE to "Mia"),
                dest, { if (cambia("destinazione")) destinazione = it },
            )
            if (dest == Destinazione.CLIENTE) {
                SceltaGrande("Il documento è intestato al cliente", anticipazione, { if (cambia("anticipazione")) anticipazione = !anticipazione }, casella = true)
            }
            SceltaGrande(if (esterno) "La metto nella mia fattura" else "L'ho pagata io", pagataDaMe, { if (cambia("pagataDaMe")) pagataDaMe = !pagataDaMe }, casella = true)
            CampoTesto(descrizione, { descrizione = it }, "Descrizione", abilitato = cambia("descrizione"))
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        if (!sola || foto != null) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(if (sola) "Aggiungi lo scontrino" else "Salva la spesa", { salva() })
            }
        }
    }
    if (finestraGiorno) FinestraGiorno(data, { data = it }, { finestraGiorno = false })
    daTogliere?.let { f ->
        FoglioConferma(
            "Togliere lo scontrino?", "Va nel cestino.", "Togli lo scontrino",
            onConferma = { daTogliere = null; togliScontrino(f) }, onAnnulla = { daTogliere = null }, pericolo = true,
        )
    }
}

/**
 * Uno scontrino già sul server (§14.8): la copia sul telefono se c'è (quella
 * fotografata qui), altrimenti scaricato da /file/<id>. Il tocco lo apre; la x,
 * per chi può, chiede di toglierlo.
 */
@Composable
private fun ScontrinoDelServer(dati: Dati, f: FileRemoto, numero: Int, onApri: () -> Unit, onTogli: (() -> Unit)?) {
    val c = W.colori
    val ctx = LocalContext.current
    Box(Modifier.size(96.dp)) {
        Box(
            Modifier.align(Alignment.BottomStart).size(84.dp).clip(RoundedCornerShape(14.dp)).background(c.superficie2)
                .border(1.dp, c.bordoScheda, RoundedCornerShape(14.dp)).clickable(onClick = onApri)
                .semantics { role = Role.Button; contentDescription = "Apri lo scontrino $numero" },
            contentAlignment = Alignment.Center,
        ) {
            val bitmap = produceState<Bitmap?>(null, f.id) {
                value = withContext(Dispatchers.IO) {
                    Immagini.fotoLocale(ctx, f.id)?.let { Immagini.miniatura(it, 240) }
                        ?: runCatching { dati.file(f.id)?.first?.let { b -> miniaturaDa(b, 240) } }.getOrNull()
                }
            }.value
            if (bitmap != null) Image(bitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else Icon(Icone.scontrino, null, tint = c.tenue, modifier = Modifier.size(28.dp))
        }
        if (onTogli != null) {
            // Il tocco è di 48 dp, il cerchio che si vede più piccolo, sull'angolo.
            Box(
                Modifier.align(Alignment.TopEnd).size(48.dp).clip(CircleShape).clickable(onClick = onTogli)
                    .semantics { role = Role.Button; contentDescription = "Togli lo scontrino $numero" },
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(28.dp).clip(CircleShape).background(c.testo), contentAlignment = Alignment.Center) {
                    Icon(Icone.chiudi, null, tint = c.scheda, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}

/** Una miniatura dai byte scaricati (null se non è una foto: un PDF fatto al computer). */
private fun miniaturaDa(byte: ByteArray, lato: Int): Bitmap? {
    val misure = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
    android.graphics.BitmapFactory.decodeByteArray(byte, 0, byte.size, misure)
    if (misure.outWidth <= 0) return null
    var passo = 1
    while (maxOf(misure.outWidth, misure.outHeight) / (passo * 2) >= lato) passo *= 2
    return android.graphics.BitmapFactory.decodeByteArray(byte, 0, byte.size, android.graphics.BitmapFactory.Options().apply { inSampleSize = passo })
}

/**
 * Apre uno scontrino del server con l'app delle foto: la copia sul telefono se
 * c'è (si apre anche senza rete), altrimenti lo scarica. Torna l'errore da dire.
 */
private suspend fun apriScontrinoDelServer(ctx: android.content.Context, dati: Dati, f: FileRemoto): String? {
    val locale = Immagini.fotoLocale(ctx, f.id) ?: return apriFileDelServer(ctx, dati, f.id, "scontrino-${f.id}", "")
    val copia = withContext(Dispatchers.IO) {
        File(File(ctx.cacheDir, "pdf").apply { mkdirs() }, "scontrino-${f.id}.jpg").also { locale.copyTo(it, overwrite = true) }
    }
    return if (eu.stgm.wisper.rapportino.Stampa.apri(ctx, copia, "image/jpeg")) null else "Sul telefono non c'è un'app per aprire le foto"
}

/** Un importo da correggere in un campo: "8,40" (i centesimi sempre, se ci sono), "52" se è tondo. */
internal fun soldiNelCampo(n: Double): String =
    if (n == Math.floor(n)) Numeri.scrivi(n) else java.text.DecimalFormat("0.00", java.text.DecimalFormatSymbols(ITALIA)).format(n)

@Composable
private fun MiniaturaScontrino(file: File?) {
    val c = W.colori
    Box(
        Modifier.size(64.dp).clip(RoundedCornerShape(14.dp)).background(c.superficie2).border(1.dp, c.bordoScheda, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        val bitmap = file?.let { f ->
            produceState<Bitmap?>(null, f.path) { value = withContext(Dispatchers.IO) { if (f.exists()) Immagini.miniatura(f, 240) else null } }.value
        }
        if (bitmap != null) Image(bitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Icon(Icone.scontrino, null, tint = c.tenue, modifier = Modifier.size(26.dp))
    }
}

// ---------------------------------------------------------------------------------- la trasferta

/**
 * La trasferta (fase3.md §5): dal/al, destinazione, motivo, commessa, km con
 * "Andata e ritorno", il veicolo col suo €/km, l'indennità; il rimborso km si
 * vede subito (ContiOreSpese.rimborsoTrasferta, gli stessi conti del server).
 * [arg]: "nuova" o l'id.
 */
@Composable
fun SchermataTrasferta(dati: Dati, nav: Navigatore, arg: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val trasferte by dati.trasferte.collectAsStateWithLifecycle()
    val nuova = arg == "nuova"
    val esistente = remember(arg, trasferte) { if (nuova) null else trasferte?.trasferte?.firstOrNull { it.id == arg } ?: RicordoSpese.trasferta?.takeIf { it.id == arg } }
    if (!nuova && esistente == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            RigaCalma("Questa trasferta non c'è più")
        }
        return
    }
    val veicoli = rememberLettura(Unit, 0) { dati.veicoli() }
    val elencoVeicoli = (veicoli as? Lettura.Pronta)?.dato?.veicoli.orEmpty()
    val aciAnno = (veicoli as? Lettura.Pronta)?.dato?.aciAnno
    val recenti = remember(ana, viste) { FilaOreSpese.commesseRecenti(ana, viste.map { it.rapportino }) }
    val perGiorno = Numeri.leggi(ana.impostazione("INDENNITA_TRASFERTA"))

    var destinazione by rememberSaveable { mutableStateOf(esistente?.destinazione.orEmpty()) }
    var motivo by rememberSaveable { mutableStateOf(esistente?.motivo.orEmpty()) }
    var dal by rememberSaveable { mutableStateOf(esistente?.dal ?: LocalDate.now()) }
    var al by rememberSaveable { mutableStateOf(esistente?.al ?: LocalDate.now()) }
    var idCommessa by rememberSaveable { mutableStateOf(esistente?.idCommessa ?: recenti.firstOrNull()?.id ?: "") }
    var km by rememberSaveable { mutableStateOf(esistente?.km?.takeIf { it > 0 }?.let { Numeri.scrivi(it) }.orEmpty()) }
    var andataRitorno by rememberSaveable { mutableStateOf(esistente?.andataRitorno ?: true) }
    var idVeicolo by rememberSaveable { mutableStateOf(esistente?.idVeicolo.orEmpty()) }
    var indennita by rememberSaveable { mutableStateOf(esistente?.indennita?.takeIf { it > 0 }?.let(::soldiNelCampo)) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    var finestra by remember { mutableStateOf<String?>(null) }

    val giorni = (ChronoUnit.DAYS.between(dal, al) + 1).toInt().coerceAtLeast(1)
    val veicolo: Veicolo? = elencoVeicoli.firstOrNull { it.id == idVeicolo } ?: if (idVeicolo.isBlank()) elencoVeicoli.firstOrNull { it.attivo } else null
    // L'euro al km resta quello con cui è nata, finché non si cambia veicolo (§14.9).
    // Fase 6 (§3.7): con un mezzo dello studio niente rimborso km (carburante e manutenzione li paga lo studio).
    val delloStudio = if (esistente != null && (veicolo == null || veicolo.id == esistente.idVeicolo)) esistente.mezzoDelloStudio || veicolo?.delloStudio == true else veicolo?.delloStudio == true
    val euroKm = if (esistente != null && (veicolo == null || veicolo.id == esistente.idVeicolo)) esistente.euroKm else if (veicolo?.delloStudio == true) 0.0 else veicolo?.euroKm
    val indennitaEuro = indennita?.let(::numeroScritto) ?: if (esistente == null && perGiorno != null) ContiOreSpese.centesimi(perGiorno * giorni) else 0.0
    val conto = ContiOreSpese.rimborsoTrasferta(numeroScritto(km) ?: 0.0, andataRitorno, euroKm, indennitaEuro)
    val puoScrivere = esistente?.puoScrivere ?: true

    fun salva() {
        errore = null
        if (destinazione.isBlank()) { errore = "Destinazione: scrivi dove sei andato"; return }
        if (al.isBefore(dal)) { errore = "Al: non può venire prima della partenza"; return }
        val k = if (km.isBlank()) 0.0 else numeroScritto(km) ?: run { errore = "Km: scrivi un numero"; return }
        if (inCorso) return
        inCorso = true
        val t = (esistente ?: Trasferta()).copy(
            dal = dal, al = al, destinazione = destinazione.trim(), motivo = motivo.trim(), idCommessa = idCommessa,
            km = k, andataRitorno = andataRitorno, idVeicolo = veicolo?.id ?: esistente?.idVeicolo.orEmpty(), indennita = indennitaEuro,
        )
        ambitoFase3.launch {
            dati.salvaTrasferta(t)
                .onSuccess { RicordoSpese.mese = YearMonth.from(dal); nav.indietro(); avvisi.mostra("Trasferta salvata: " + Numeri.euro(it.totale)) }
                .onFailure { errore = spiegaErrore2(it, "La trasferta non si è salvata: riprova") }
            inCorso = false
        }
    }

    fun togli() {
        val t = esistente ?: return
        ambitoFase3.launch {
            dati.togliTrasferta(t.id)
                .onSuccess {
                    nav.indietro()
                    avvisi.mostra("Trasferta tolta", annulla = { ambitoFase3.launch { dati.togliTrasferta(t.id, annulla = true) } })
                }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non l'ho tolta: riprova")) }
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true) {
                if (esistente != null && puoScrivere) PulsanteTesto("Togli", { togli() }, colore = c.rossoTesto)
            }
            TitoloPagina(if (nuova) "Nuova trasferta" else "La trasferta")
            if (esistente?.stato == StatoVoce.RESPINTA) {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.rossoTenue).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Respinta" + if (esistente.approvataDaNome.isNotBlank()) " da ${esistente.approvataDaNome}" else "", style = Testi.forte, color = c.rossoTesto)
                    Text(esistente.motivoRifiuto, style = Testi.secondarioGrande, color = c.testo2)
                }
            }
            esistente?.bloccata?.takeIf { it.isNotBlank() }?.let { Scheda(orizzontale = 16.dp, verticale = 14.dp) { Text(it, style = Testi.secondarioGrande, color = c.testo2) } }
            CampoTesto(destinazione, { destinazione = it; errore = null }, "Destinazione", abilitato = puoScrivere)
            CampoTesto(motivo, { motivo = it }, "Motivo", abilitato = puoScrivere)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CampoQuando("Dal", FilaOreSpese.giornoBreve(dal), { if (puoScrivere) finestra = "dal" }, Modifier.weight(1f))
                CampoQuando("Al", FilaOreSpese.giornoBreve(al), { if (puoScrivere) finestra = "al" }, Modifier.weight(1f))
            }
            Etichetta("Commessa")
            SceltaCommessa(ana, recenti, idCommessa, { idCommessa = it }, conStudio = true, etichettaStudio = "Nessuna", abilitata = puoScrivere)
            CampoTesto(km, { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) km = t }, "Km", tastiera = KeyboardType.Decimal, suffisso = "km", abilitato = puoScrivere)
            SceltaGrande("Andata e ritorno", andataRitorno, { if (puoScrivere) andataRitorno = !andataRitorno }, casella = true)
            if (elencoVeicoli.size > 1) {
                Etichetta("Veicolo")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Fase 6: il nome con la targa, e "Fermo" accanto a quello che non si dovrebbe usare.
                    elencoVeicoli.filter { it.attivo }.forEach { v -> Pillola(v.titolo.ifBlank { v.nome } + if (v.fermo) " · Fermo" else "", v.id == veicolo?.id, { if (puoScrivere) idVeicolo = v.id }, altezza = 48.dp) }
                }
            }
            CampoTesto(
                indennita ?: if (indennitaEuro > 0) soldiNelCampo(indennitaEuro) else "", { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) indennita = t },
                "Indennità", tastiera = KeyboardType.Decimal, suffisso = "€", abilitato = puoScrivere,
            )
            // Il rimborso calcolato subito, coi conti del server.
            Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (delloStudio) "Mezzo dello studio: niente rimborso km"
                    else (veicolo?.nome ?: esistente?.veicolo?.ifBlank { null } ?: "Senza veicolo") +
                        (euroKm?.let { " · " + Veicolo(euroKm = it).euroKmTesto } ?: "") +
                        ((veicolo?.annoAci ?: aciAnno)?.let { " (ACI $it)" } ?: ""),
                    style = Testi.secondario, color = c.tenue, modifier = Modifier.weight(1f),
                )
                Text(Numeri.euro(conto.totale), style = Testi.titoloScheda, color = c.testo)
            }
            if (esistente != null) {
                TitoloSezione("Spese della trasferta", if (esistente.speseTotale > 0) Numeri.euro(esistente.speseTotale) else null)
                if (esistente.spese.isNotEmpty()) SchedaElenco {
                    esistente.spese.forEachIndexed { i, s ->
                        if (i > 0) LineaElenco()
                        RigaSpesa(s, mostraChi = false) { RicordoSpese.spesa = s; nav.vai("spesa/" + s.chiave) }
                    }
                }
                if (puoScrivere) PulsanteBordo("Aggiungi una spesa", { RicordoSpese.spesa = null; nav.vai("spesa-nuova/trasferta/${esistente.id}") }, Modifier.fillMaxWidth(), icona = Icone.piu)
            }
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        if (puoScrivere) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(if (inCorso) "Salvo…" else "Salva la trasferta", { salva() })
            }
        }
    }
    finestra?.let { q ->
        FinestraGiorno(if (q == "dal") dal else al, { d -> if (q == "dal") { dal = d; if (al.isBefore(d)) al = d } else al = d }, { finestra = null })
    }
}

// ---------------------------------------------------------------------------------- riepilogo

/** Riepiloghi semplici (§14.10): il mese per persona, per commessa o per categoria. */
@Composable
fun SchermataRiepilogoSpese(dati: Dati, nav: Navigatore) {
    val c = W.colori
    var mese by rememberSaveable { mutableStateOf(RicordoSpese.mese) }
    var per by rememberSaveable { mutableStateOf("persona") }
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(mese to per, giro) { dati.riepilogoSpese(mese, per) }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        Row(verticalAlignment = Alignment.CenterVertically) {
            TitoloPagina("Riepilogo di " + nomeMese(mese).substringBefore(' ').lowercase(ITALIA))
            Spacer(Modifier.weight(1f))
            PulsanteTondo(Icone.frecciaSinistra, "Mese prima", { mese = mese.minusMonths(1) })
            Spacer(Modifier.width(8.dp))
            PulsanteTondo(Icone.freccia, "Mese dopo", { if (!mese.plusMonths(1).isAfter(YearMonth.now())) mese = mese.plusMonths(1) })
        }
        Segmenti(listOf("persona" to "Per persona", "commessa" to "Per commessa", "categoria" to "Per categoria"), per, { per = it })
        when (lettura) {
            is Lettura.InCorso -> Segnaposto(200.dp)
            is Lettura.Errore -> ErroreConRiprova(lettura.messaggio) { giro++ }
            is Lettura.Pronta -> {
                val r = lettura.dato
                SchedaElenco {
                    if (r.righe.isEmpty()) RigaCalma("Nessuna spesa in questo mese")
                    r.righe.forEachIndexed { i, x ->
                        if (i > 0) LineaElenco()
                        val sotto = listOfNotNull(
                            x.nomeCliente.ifBlank { null },
                            if (x.cliente > 0) "al cliente " + Numeri.euro(x.cliente) else null,
                            if (x.studio > 0) "allo studio " + Numeri.euro(x.studio) else null,
                            if (x.personale > 0) "mie " + Numeri.euro(x.personale) else null,
                            if (x.km > 0) Numeri.scrivi(x.km) + " km · " + Numeri.euro(x.rimborsoKm) else null,
                        ).joinToString(" · ")
                        RigaVoce(
                            if (per == "commessa" && x.chiave.isNotBlank()) x.chiave + " · " + x.nome else x.nome.ifBlank { if (per == "commessa") "Senza commessa" else "Senza nome" },
                            sotto = sotto.ifBlank { null },
                            valore = Numeri.euro(x.totale), freccia = false,
                        )
                    }
                }
                r.totale?.let { t ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Totale per lo studio", style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
                        Text(Numeri.euro(t.totale), style = Testi.titoloScheda, color = c.testo)
                    }
                }
            }
        }
    }
}
