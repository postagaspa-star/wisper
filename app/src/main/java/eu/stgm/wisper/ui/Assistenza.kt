@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.Contratto
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Sede
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.dataIt
import eu.stgm.wisper.rapportino.giornoParole
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/*
 * Lo storico dell'impianto e i contratti di assistenza sul telefono (fase5.md §12.1):
 * la scheda dell'impianto è il suo storico (ticket, rapportini, documenti, verifiche,
 * contratti in una riga del tempo); il contratto col periodo, le rate, le visite.
 */

private val CATEGORIE_IMPIANTO = linkedMapOf(
    "cabina_mt" to "Cabina MT", "quadro" to "Quadro", "terra" to "Impianto di terra", "scariche" to "Protezione dalle scariche",
    "fotovoltaico" to "Fotovoltaico", "automazione" to "Automazione", "illuminazione" to "Illuminazione", "altro" to "Altro",
)
private val AMBIENTI = linkedMapOf("ordinario" to "Ordinario", "cantiere" to "Cantiere", "medico" to "Medico", "incendio" to "Incendio", "esplosione" to "Esplosione")

@Composable
fun SchermataImpianto(dati: Dati, nav: Navigatore, idSede: String) {
    val c = W.colori
    val viste by dati.viste.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val perm = LocalPermessi.current
    var giro by remember { mutableIntStateOf(0) }
    var pagina by remember { mutableIntStateOf(1) }
    var cambia by remember { mutableStateOf(false) }
    val lettura = rememberLettura(idSede to pagina, giro) { dati.fase5.storicoImpianto(idSede, pagina) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            TestataInterna({ nav.indietro() })
            when (lettura) {
                is Lettura.InCorso -> { Segnaposto(120.dp); Segnaposto(200.dp) }
                is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
                is Lettura.Pronta -> {
                    val s = lettura.dato
                    val im = s.impianto
                    if (im.categoriaNome.isNotBlank()) Parola5(im.categoriaNome, colore = ColoreFase5.BLU)
                    Text(im.nome, style = Testi.titoloPagina, color = c.testo)
                    Text(listOf(im.cliente, im.indirizzo).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
                    Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 6.dp) {
                        listOf("Potenza" to im.potenza, "Tensione" to im.tensione, "Messa in servizio" to dataIt(im.messaInServizio), "Matricola" to im.matricola,
                            "Ambiente" to im.ambienteNome, "Referente sul posto" to im.referente, "Note" to im.datiTecnici)
                            .filter { it.second.isNotBlank() }.forEach { (k, v) -> RigaDato(k, v) }
                        if (listOf(im.potenza, im.tensione, im.matricola, im.ambienteNome, im.referente, im.datiTecnici).all { it.isBlank() }) RigaCalma("I dati dell'impianto non sono scritti.")
                        if (perm.modifica(Moduli.CLIENTI) && ana.sedi.any { it.id == idSede }) PulsanteBordo("Cambia", { cambia = true }, altezza = 48.dp)
                    }
                    if (s.aperti.isNotEmpty()) Sezione5("Aperti", s.aperti.size) {
                        SchedaElenco { s.aperti.forEachIndexed { i, a -> if (i > 0) LineaElenco(); RigaVoce("${a.numero} · ${a.titolo}", icona = Icone.chiave, fine = { Parola5(a.statoVisto) }, onClick = { nav.vai("ticket/${a.id}") }) } }
                    }
                    if (s.scadenze.isNotEmpty()) Sezione5("Scadenze", s.scadenze.size) {
                        SchedaElenco { s.scadenze.forEachIndexed { i, x -> if (i > 0) LineaElenco(); RigaVoce(x.titolo, sotto = dataIt(x.data), icona = Icone.bandiera, fine = { Parola5(x.statoVisto) }, onClick = { nav.vai("scadenza/${x.id}") }) } }
                    }
                    if (s.contratti.isNotEmpty()) Sezione5("Contratto") {
                        SchedaElenco { s.contratti.forEachIndexed { i, x -> if (i > 0) LineaElenco(); RigaVoce(x.numero + " · " + x.titolo, icona = Icone.preventivo, fine = { Parola5(x.statoVisto) }, onClick = { nav.vai("contratto-ca/${x.id}") }) } }
                    }
                    Sezione5("Storico") {
                        var anno = ""
                        SchedaElenco {
                            if (s.voci.isEmpty()) RigaCalma("Ancora niente.")
                            s.voci.forEachIndexed { i, v ->
                                val a = v.data.take(4)
                                if (a != anno) { anno = a; if (i > 0) LineaElenco(); Etichetta(a, Modifier.padding(top = 12.dp, bottom = 2.dp)) } else LineaElenco()
                                val apri: (() -> Unit)? = when (v.tipo) {
                                    "ticket", "foto" -> ({ nav.vai("ticket/${v.idTicket.ifBlank { v.id }}") })
                                    "documento" -> ({ nav.vai("documento/${v.id}") })
                                    "contratto" -> ({ nav.vai("contratto-ca/${v.id}") })
                                    "scadenza" -> ({ nav.vai("scadenza/${v.id}") })
                                    "rapportino" -> if (v.apribile && v.id.isNotBlank()) ({
                                        viste.firstOrNull { it.rapportino.id == v.id }?.let { nav.apriRapportino(it.rapportino.idLocale) } ?: nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, testo = v.id))
                                    }) else null
                                    else -> null
                                }
                                RigaStorico(v, apri)
                            }
                        }
                        if (s.pagine > s.pagina) PulsanteBordo("Voci più vecchie", { pagina++ }, Modifier.fillMaxWidth(), altezza = 48.dp)
                        if (s.pagina > 1) PulsanteBordo("Voci più recenti", { pagina-- }, Modifier.fillMaxWidth(), altezza = 48.dp)
                    }
                }
            }
        }
        if (scriveTicket()) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Nuovo ticket per questo impianto", { nav.vai("ticket-nuovo/$idSede") }, icona = Icone.piu)
        }
    }
    if (cambia) ana.sedi.firstOrNull { it.id == idSede }?.let { sede -> FoglioDatiImpianto(dati, sede, onChiudi = { cambia = false }) { giro++ } }
}

/** I dati dell'impianto (§4.3): categoria, matricola, potenza, tensione, messa in servizio, ambiente, note. */
@Composable
private fun FoglioDatiImpianto(dati: Dati, s: Sede, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var categoria by remember { mutableStateOf(s.categoria) }
    var matricola by remember { mutableStateOf(s.matricola) }
    var potenza by remember { mutableStateOf(s.potenza) }
    var tensione by remember { mutableStateOf(s.tensione) }
    var servizio by remember { mutableStateOf(s.messaInServizio) }
    var ambiente by remember { mutableStateOf(s.ambiente) }
    var note by remember { mutableStateOf(s.datiTecnici) }
    var giorno by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    FoglioDalBasso(onChiudi) {
        Text(s.nome, style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 540.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Domanda("Che impianto è") { SceltePillole(CATEGORIE_IMPIANTO.toList(), categoria, { categoria = it }) }
            CampoTesto(potenza, { potenza = it }, "Potenza", segnaposto = "630 kVA")
            CampoTesto(tensione, { tensione = it }, "Tensione", segnaposto = "15 kV / 400 V")
            CampoDaScegliere("Messa in servizio", if (servizio.isBlank()) "Scegli il giorno" else dataIt(servizio), servizio.isBlank(), { giorno = true })
            CampoTesto(matricola, { matricola = it }, "Matricola")
            Domanda("Ambiente") { SceltePillole(AMBIENTI.toList(), ambiente, { ambiente = if (ambiente == it) "" else it }) }
            CampoTesto(note, { note = it }, "Note", righe = 3)
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        }
        PulsantePrincipale("Salva", {
            scope.launch {
                dati.salvaSede(s.copy(categoria = categoria, matricola = matricola, potenza = potenza, tensione = tensione, messaInServizio = servizio, ambiente = ambiente, datiTecnici = note))
                    .onSuccess { onChiudi(); avvisi.mostra("Salvato"); onFatto() }.onFailure { errore = spiegaErrore2(it, "Non si è salvato: riprova") }
            }
        }, icona = Icone.spunta)
    }
    if (giorno) FinestraGiorno(runCatching { LocalDate.parse(servizio) }.getOrNull(), { servizio = it.toString() }, { giorno = false })
}

// ---------------------------------------------------------------------------------- contratto

@Composable
fun SchermataContratto(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val perm = LocalPermessi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(id, giro + Giri5.ticket * 1000) { dati.fase5.contratto(id) }
    val ticket = rememberLettura("ticket-contratto-$id", giro) { dati.fase5.tickets("tutti", listOf("idContratto" to id)) }
    var menu by remember { mutableStateOf(false) }
    var disdici by remember { mutableStateOf(false) }
    var rinnova by remember { mutableStateOf(false) }
    var chiudiConferma by remember { mutableStateOf<String?>(null) }
    val k = (lettura as? Lettura.Pronta)?.dato
    if (k == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            TestataInterna({ nav.indietro() })
            if (lettura is Lettura.Errore) SchedaErrore(lettura.messaggio) { giro++ } else Segnaposto(200.dp)
        }
        return
    }
    val scrive = k.puoScrivere && perm.modifica(Moduli.TICKET) && perm.livello(Moduli.COSTI) >= 2
    fun fatto(r: Result<Contratto>, testo: String) { r.onSuccess { avvisi.mostra(testo); giro++; Giri5.ticket++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è cambiato: riprova")) } }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            TestataInterna({ nav.indietro() }) { if (scrive || perm.costi) PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { CodiceCommessa(k.numero); Parola5(k.statoVisto) }
            Text(k.titolo, style = Testi.titoloPagina.copy(fontSize = Testi.titoloPagina.fontSize * 0.87f), color = c.testo)
            Text(k.cliente + " · dal " + dataIt(k.dal) + " al " + dataIt(k.al), style = Testi.secondarioGrande, color = c.tenue)
            if (k.statoDettaglio.isNotBlank()) Text(
                if (k.rinnovo == "tacito" && k.disdettaEntro.isNotBlank()) "Si rinnova da solo: la " + k.statoDettaglio else k.statoDettaglio.replaceFirstChar { it.uppercase() },
                style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.ambraTesto,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.ambraFondo).padding(14.dp),
            )
            Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 6.dp) {
                RigaDato("Rinnovo", if (k.rinnovo == "tacito") "Da solo, disdetta ${k.disdettaGiorni} giorni prima" else "Senza rinnovo")
                RigaDato("Copre", k.copreParole + if (k.materialiInclusi) ", materiali compresi" else ", materiale a parte")
                if (perm.costi) k.canone?.let { RigaDato("Canone", Numeri.euro(it) + " all'anno, " + Contratto.RATE[k.fatturazioneCanone].orEmpty().lowercase()) }
                if (perm.costi) k.tariffaExtra?.let { RigaDato("Fuori contratto", Numeri.euro(it) + " all'ora") }
                k.tempi?.let { t -> t.optJSONObject("urgente")?.let { u -> RigaDato("Tempi promessi", "urgente: presa ${Numeri.scrivi(u.optDouble("presa"))} h, intervento ${Numeri.scrivi(u.optDouble("intervento"))} h") } }
            }
            if (k.idCommessa.isNotBlank()) SchedaElenco { RigaVoce(k.commessa.ifBlank { k.idCommessa }, sotto = "Commessa ${k.idCommessa}", icona = Icone.commesse, onClick = { nav.vai("commessa/${k.idCommessa}") }) }
            Sezione5("Impianti e visite", k.impianti.size) {
                SchedaElenco {
                    if (k.impianti.isEmpty()) RigaCalma("Nessun impianto.")
                    k.impianti.forEachIndexed { i, x ->
                        if (i > 0) LineaElenco()
                        RigaVoce(x.nome, sotto = listOfNotNull(x.ogniMesi?.let { "una visita ogni $it mesi" }, x.prossimaVisita.takeIf { it.isNotBlank() }?.let { "la prossima " + giornoParole(it) }).joinToString(" · ").ifBlank { null },
                            icona = Icone.fulmine, onClick = { nav.vai("impianto/${x.idSede}") })
                    }
                }
            }
            if (perm.costi && k.rate.isNotEmpty()) Sezione5("Rate del canone", k.rate.size) {
                SchedaElenco { k.rate.forEachIndexed { i, r -> if (i > 0) LineaElenco(); RigaVoce(r.descrizione, sotto = dataIt(r.data) + (r.importo?.let { " · " + Numeri.euro(it) } ?: ""), icona = Icone.fatturazione, freccia = false, fine = { Parola5(r.statoVisto, colore = if (r.stato == "fatturata") ColoreFase5.VERDE else ColoreFase5.GRIGIO) }) } }
            }
            if (perm.costi && k.rendeMargine != null) Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 6.dp) {
                Etichetta("Rende")
                k.rendeCanone?.let { RigaDato("Canone", Numeri.euro(it)) }
                k.rendeExtra?.let { RigaDato("Fatturato fuori contratto", Numeri.euro(it)) }
                k.rendeCosto?.let { RigaDato("Costo dei ticket", Numeri.euro(it)) }
                RigaDato("Margine", Numeri.euro(k.rendeMargine))
            }
            Sezione5("Ticket del contratto", k.ticketAnno.takeIf { it > 0 }) {
                when (ticket) {
                    is Lettura.Pronta -> SchedaElenco {
                        if (ticket.dato.ticket.isEmpty()) RigaCalma("Nessun ticket.")
                        ticket.dato.ticket.take(10).forEachIndexed { i, t -> if (i > 0) LineaElenco(); RigaTicket(t) { nav.vai("ticket/${t.chiave}") } }
                    }
                    else -> Segnaposto(72.dp)
                }
            }
            if (k.idDocumento.isNotBlank()) Sezione5("Documento") { SchedaElenco { RigaVoce(k.documento, sotto = "Contratti", icona = Icone.documento, onClick = { nav.vai("documento/${k.idDocumento}") }) } }
        }
        val giallo = when {
            !scrive -> null
            k.stato == "bozza" -> "Attiva il contratto"
            k.statoVisto == "In scadenza" && k.rinnovo == "no" -> "Rinnova"
            else -> null
        }
        if (giallo != null) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(giallo, {
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
                if (k.stato == "bozza") scope.launch { fatto(dati.fase5.attivaContratto(k.id), "Contratto attivo: commessa, rate e visite pronte") } else rinnova = true
            }, icona = Icone.spunta)
        }
    }
    if (menu) FoglioDalBasso({ menu = false }) {
        Text(k.numero, style = Testi.titoloScheda, color = c.testo)
        if (scrive && k.stato != "chiuso") VoceMenu(Icone.matita, "Cambia", { menu = false; nav.vai("contratto-ca-modifica/${k.id}") })
        if (scrive && k.stato == "attivo") VoceMenu(Icone.chiudi, "Disdici", { menu = false; disdici = true })
        if (scrive && (k.stato == "attivo" || k.stato == "disdetto")) VoceMenu(Icone.cestino, "Chiudi adesso", {
            menu = false
            scope.launch {
                val r = dati.fase5.chiudiContratto(k.id, false)
                val d = r.exceptionOrNull()?.let(::daConfermare)
                if (d != null) chiudiConferma = d.message else fatto(r, "Contratto chiuso")
            }
        }, pericolo = true)
        VoceMenu(Icone.pdf, "Contratto in PDF", {
            menu = false
            scope.launch {
                runCatching {
                    val testo = dati.fase5.componi("CONTRATTO_CONDIZIONI", mapOf("idContratto" to k.id)).getOrNull()?.testo.orEmpty()
                    // I campi che legge WisperDocumenti.contrattoAssistenza (pc/ui/documenti.js), gli stessi del computer.
                    val modello = JSONObject().put("numero", k.numero).put("titolo", k.titolo).put("cliente", k.cliente).put("dal", k.dal).put("al", k.al).put("condizioni", testo)
                        .put("rinnovo", k.rinnovo).put("disdettaGiorni", k.disdettaGiorni).put("copre", k.copre).put("materialiInclusi", k.materialiInclusi)
                        .put("fatturazioneCanone", k.fatturazioneCanone)
                        .put("impianti", JSONArray(k.impianti.map { i ->
                            JSONObject().put("nome", i.nome).put("ogniMesi", i.ogniMesi ?: JSONObject.NULL).put("primaVisita", i.primaVisita).put("prossimaVisita", i.prossimaVisita)
                        }))
                    if (k.tempi != null) modello.put("tempi", k.tempi)
                    if (perm.costi) { k.canone?.let { modello.put("canone", it) }; k.tariffaExtra?.let { modello.put("tariffaExtra", it) } }
                    val riserva = "<div style=\"font-family:Figtree,sans-serif;padding:48px 56px;color:#1B1B1F\"><h2>Contratto di assistenza ${k.numero}</h2><p><b>${k.titolo}</b> · ${k.cliente}</p><p>Dal ${dataIt(k.dal)} al ${dataIt(k.al)}</p>" +
                        testo.split("\n").joinToString("") { "<p>" + it.replace("<", "&lt;") + "</p>" } + "</div>"
                    Stampa.documentoFase4(ctx, "contrattoAssistenza", modello, riserva, Stampa.nomeFile("Contratto di assistenza", k.numero.replace('/', '-') + " " + k.cliente), JSONObject(ana.impostazioni))
                }.onSuccess { if (!Stampa.apri(ctx, it)) avvisi.mostra("PDF pronto") }.onFailure { avvisi.mostra(it.message ?: "Il PDF non si è fatto") }
            }
        })
    }
    if (disdici) FoglioMotivo("Disdici il contratto", "Il cliente non lo rinnova", "Disdici", onChiudi = { disdici = false }) { m ->
        disdici = false
        scope.launch { fatto(dati.fase5.disdiciContratto(k.id, null, m), "Disdetto: finisce il " + dataIt(k.al)) }
    }
    if (rinnova) FoglioDalBasso({ rinnova = false }) {
        var canone by remember { mutableStateOf(k.canone?.let { importoNelCampo(it) }.orEmpty()) }
        Text("Rinnova ${k.numero}", style = Testi.titoloScheda, color = c.testo)
        Text("Il periodo nuovo parte il giorno dopo il " + dataIt(k.al) + " e dura 12 mesi.", style = Testi.testo, color = c.testo2)
        if (perm.costi) CampoTesto(canone, { canone = it }, "Canone all'anno", tastiera = KeyboardType.Decimal, suffisso = "€")
        PulsantePrincipale("Rinnova", { rinnova = false; scope.launch { fatto(dati.fase5.rinnovaContratto(k.id, null, importoScritto(canone), null), "Rinnovato") } }, icona = Icone.riapri)
    }
    chiudiConferma?.let { testo ->
        FoglioConferma("Chiudere il contratto?", testo, "Chiudi adesso", onConferma = {
            chiudiConferma = null
            scope.launch { fatto(dati.fase5.chiudiContratto(k.id, true), "Contratto chiuso") }
        }, onAnnulla = { chiudiConferma = null }, pericolo = true)
    }
}

/** Nuovo contratto o Cambia (§12.1): cliente, titolo, impianti con le visite, periodo, rinnovo, canone, cosa copre, tempi. */
@Composable
fun SchermataModificaContratto(dati: Dati, nav: Navigatore, id: String?) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val esistente = if (id != null) (rememberLettura(id, 0) { dati.fase5.contratto(id) } as? Lettura.Pronta)?.dato else null
    if (id != null && esistente == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina)) { Testata(onIndietro = { nav.indietro() }, chiudi = true); Segnaposto(200.dp) }
        return
    }
    val bozza = esistente == null || esistente.stato == "bozza"
    var idCliente by rememberSaveable { mutableStateOf(esistente?.idCliente.orEmpty()) }
    var titolo by rememberSaveable { mutableStateOf(esistente?.titolo.orEmpty()) }
    var dal by rememberSaveable { mutableStateOf(esistente?.dal ?: LocalDate.now().plusMonths(1).withDayOfMonth(1).toString()) }
    var rinnovo by rememberSaveable { mutableStateOf(esistente?.rinnovo ?: "tacito") }
    var disdetta by rememberSaveable { mutableStateOf(esistente?.disdettaGiorni ?: 60) }
    var canone by rememberSaveable { mutableStateOf(esistente?.canone?.let { importoNelCampo(it) }.orEmpty()) }
    var rate by rememberSaveable { mutableStateOf(esistente?.fatturazioneCanone ?: "annuale") }
    var copre by rememberSaveable { mutableStateOf(esistente?.copre ?: "visite") }
    var materiali by rememberSaveable { mutableStateOf(esistente?.materialiInclusi ?: false) }
    var extra by rememberSaveable { mutableStateOf(esistente?.tariffaExtra?.let { importoNelCampo(it) }.orEmpty()) }
    var presa by rememberSaveable { mutableStateOf(esistente?.tempi?.optJSONObject("urgente")?.optDouble("presa", 1.0) ?: 1.0) }
    var intervento by rememberSaveable { mutableStateOf(esistente?.tempi?.optJSONObject("urgente")?.optDouble("intervento", 4.0) ?: 4.0) }
    var impianti by remember { mutableStateOf<Map<String, Int>>(esistente?.impianti?.associate { it.idSede to (it.ogniMesi ?: 0) } ?: emptyMap()) }
    var sceltaCliente by remember { mutableStateOf(false) }
    var giorno by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    var invio by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(if (esistente == null) "Nuovo contratto" else "Cambia ${esistente.numero}")
            if (bozza) CampoDaScegliere("Cliente", ana.cliente(idCliente)?.nome ?: "Scegli il cliente", idCliente.isBlank(), { sceltaCliente = true })
            CampoTesto(titolo, { titolo = it }, "Titolo", segnaposto = "Manutenzione cabina MT")
            if (idCliente.isNotBlank()) Domanda("Impianti coperti") {
                ana.sediDi(idCliente).filter { it.impianto && !it.archiviata }.forEach { s ->
                    val ogni = impianti[s.id]
                    Scheda(orizzontale = 14.dp, verticale = 10.dp, spazio = 8.dp) {
                        RigaCasella(s.nome, ogni != null) { impianti = if (ogni != null) impianti - s.id else impianti + (s.id to 6) }
                        if (ogni != null) SceltePillole(listOf(3 to "Ogni 3 mesi", 6 to "6 mesi", 12 to "12 mesi", 0 to "Senza visite"), ogni, { impianti = impianti + (s.id to it) })
                    }
                }
            }
            if (bozza) {
                CampoDaScegliere("Dal", dataIt(dal), false, { giorno = true })
                Text("Dura 12 mesi: fino al " + dataIt(LocalDate.parse(dal).plusMonths(12).minusDays(1).toString()), style = Testi.secondario, color = c.tenue)
            }
            Domanda("Rinnovo") { SceltePillole(listOf("tacito" to "Tacito", "no" to "No"), rinnovo, { rinnovo = it }) }
            if (rinnovo == "tacito") Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Disdetta, giorni prima", style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
                Stepper("$disdetta", { disdetta = (disdetta - 15).coerceAtLeast(0) }, { disdetta = (disdetta + 15).coerceAtMost(365) }, "i giorni")
            }
            if (bozza) {
                CampoTesto(canone, { canone = it }, "Canone all'anno", tastiera = KeyboardType.Decimal, suffisso = "€")
                Domanda("Rate") { SceltePillole(Contratto.RATE.toList(), rate, { rate = it }) }
            }
            Domanda("Copre") { SceltePillole(listOf("visite" to "Solo visite", "visite_guasti" to "Visite e guasti"), copre, { copre = it }) }
            RigaSiNo("Materiali compresi", materiali) { materiali = it }
            CampoTesto(extra, { extra = it }, "Tariffa fuori contratto", tastiera = KeyboardType.Decimal, suffisso = "€/h")
            Domanda("Tempi promessi per gli urgenti") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Presa", style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
                    Stepper(Numeri.scrivi(presa) + " h", { presa = (presa - 0.5).coerceAtLeast(0.5) }, { presa += 0.5 }, "le ore di presa")
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Intervento", style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
                    Stepper(Numeri.scrivi(intervento) + " h", { intervento = (intervento - 1).coerceAtLeast(1.0) }, { intervento += 1 }, "le ore d'intervento")
                }
            }
            errore?.let { Text(it, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (invio) "Salvo…" else if (bozza) "Salva la bozza" else "Salva", {
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
                if (invio) return@PulsantePrincipale
                val o = JSONObject().put("titolo", titolo.trim()).put("rinnovo", rinnovo).put("disdettaGiorni", disdetta).put("copre", copre).put("materialiInclusi", materiali)
                    .put("tariffaExtra", importoScritto(extra) ?: JSONObject.NULL)
                    .put("tempi", JSONObject().put("urgente", JSONObject().put("presa", presa).put("intervento", intervento)))
                    .put("impianti", JSONArray(impianti.map { (s, ogni) -> JSONObject().put("idSede", PonteServer.idJson(s)).put("ogniMesi", if (ogni > 0) ogni else JSONObject.NULL) }))
                if (bozza) o.put("idCliente", idCliente).put("dal", dal).put("canone", importoScritto(canone) ?: 0.0).put("fatturazioneCanone", rate)
                if (esistente != null) o.put("id", PonteServer.idJson(esistente.id))
                invio = true
                scope.launch {
                    dati.fase5.salvaContratto(o).onSuccess { k -> avvisi.mostra("Salvato ${k.numero}"); Giri5.ticket++; nav.indietro(); if (esistente == null) nav.vai("contratto-ca/${k.id}") }
                        .onFailure { errore = spiegaErrore2(it, "Il contratto non si è salvato: riprova") }
                    invio = false
                }
            }, icona = Icone.spunta, abilitato = !invio)
        }
    }
    if (sceltaCliente) FoglioSceltaCliente(ana, idCliente, { cl -> idCliente = cl?.id.orEmpty(); impianti = emptyMap(); sceltaCliente = false }, { sceltaCliente = false })
    if (giorno) FinestraGiorno(LocalDate.parse(dal), { dal = it.toString() }, { giorno = false })
}
