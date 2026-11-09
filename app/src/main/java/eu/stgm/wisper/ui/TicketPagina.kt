@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.ContiTicket
import eu.stgm.wisper.rapportino.FotoTicket
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.ParoleTicket
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.Ticket
import eu.stgm.wisper.rapportino.TicketInCoda
import eu.stgm.wisper.rapportino.dataIt
import eu.stgm.wisper.rapportino.istanteLocale
import eu.stgm.wisper.rapportino.pulisciRicerca
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/*
 * Il ticket sul telefono (fase5.md §12.1): pillole, passi, cliente e impianto, tempi,
 * interventi, rapportini, ore e spese, foto, storico, cronologia; UN pulsante giallo
 * secondo lo stato (Prendo io, Pianifica l'intervento, Scrivi il rapportino, Segna
 * risolto, Chiudi il ticket, Riprendi). Senza rete si apre, si prende, si fotografa,
 * si scrive il rapportino e si segna risolto: tutto va nella coda.
 */

/** Il rapportino di sempre già compilato dal ticket (§3.3): cliente, commessa, luogo, il ticket. */
internal fun rapportinoDelTicket(t: Ticket, dati: Dati): Rapportino {
    val ana = dati.anagrafiche.value
    val m = ana.commessa(t.idCommessa)
    return Rapportino.nuovo(dati.tecnico).copy(
        idCliente = t.idCliente, cliente = t.cliente.ifBlank { ana.cliente(t.idCliente)?.nome.orEmpty() },
        idCommessa = m?.id ?: t.idCommessa, commessa = m?.descrizione ?: t.commessa,
        luogo = t.indirizzoImpianto, idTicket = t.id, idLocaleTicket = if (t.id.isBlank()) t.idLocale else "", numeroTicket = t.numero,
    )
}

/** Il ticket come si vede adesso: quello nato qui (in coda) o quello letto, con sopra le sue cose in coda. */
@Composable
internal fun rememberTicket(dati: Dati, chiave: String, giro: Int): Pair<Ticket?, Lettura<Ticket>?> {
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val chi = chiTicket(dati)
    val nato = remember(ops, ana, chiave) { TicketInCoda.nato(chiave, ops, ana, chi) }
    val inCoda = ops.count { it.fase5 }
    // Giri7.portale: quando la risposta nel portale o "Mostra nel portale" arriva al server, il ticket si rilegge.
    val lettura = rememberLettura(chiave to (nato != null), giro + Giri5.ticket * 1000 + inCoda * 7 + Giri7.portale * 100_000) {
        nato?.let { Result.success(it) } ?: dati.fase5.ticket(chiave)
    }
    val base = nato ?: (lettura as? Lettura.Pronta)?.dato
    val t = remember(base, ops, viste) { base?.let { TicketInCoda.applica(it, ops, viste.map { v -> v.rapportino to v.inCoda }, chi) } }
    return t to lettura
}

@Composable
fun SchermataDettaglioTicket(dati: Dati, nav: Navigatore, chiave: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val perm = LocalPermessi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val storico by dati.storico.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val (t, lettura) = rememberTicket(dati, chiave, giro)
    var menu by remember { mutableStateOf(false) }
    var pianifica by remember { mutableStateOf(false) }
    var chiudi by remember { mutableStateOf(false) }
    var motivo by remember { mutableStateOf<String?>(null) }
    var assegna by remember { mutableStateOf(false) }
    var lega by remember { mutableStateOf(false) }
    var fotoScelta by remember { mutableStateOf<FotoTicket?>(null) }
    var scattoInCorso by rememberSaveable { mutableStateOf<String?>(null) }

    if (t == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            TestataInterna({ nav.indietro() })
            when (lettura) {
                is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
                else -> { Segnaposto(120.dp); Segnaposto(200.dp) }
            }
        }
        return
    }
    val scrive = perm.modifica(Moduli.TICKET) && t.vivo && (t.puoScrivere || t.inCoda)
    val chiaveAzioni = t.chiave

    fun inCodaOEsempio(azione: () -> Unit, avviso: String) {
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        azione()
        avvisi.mostra(avviso)
    }

    val fotocamera = rememberFotoSistema { riuscito ->
        val percorso = scattoInCorso ?: return@rememberFotoSistema
        scattoInCorso = null
        val scatto = File(percorso)
        if (!riuscito) { scatto.delete(); return@rememberFotoSistema }
        scope.launch {
            runCatching { dati.preparaFoto(Uri.fromFile(scatto)) }
                .onSuccess { f -> dati.fase5.fotoTicket(chiaveAzioni, f); avvisi.mostra("Foto salvata sul telefono: parte appena c'è rete") }
                .onFailure { avvisi.mostra("La foto non si legge: riprova") }
            scatto.delete()
        }
    }
    fun scatta() {
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        val f = Immagini.fileScatto(ctx)
        scattoInCorso = f.path
        fotocamera.launch(FileProvider.getUriForFile(ctx, ctx.packageName + ".foto", f))
    }
    fun scriviRapportino() {
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        nav.rapportinoDaTicket(rapportinoDelTicket(t, dati))
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 140.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() }) { if (perm.modifica(Moduli.TICKET) || perm.vede(Moduli.TICKET)) PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Parola5(t.prioritaNome, colore = colorePriorita(t.priorita).takeIf { t.priorita != "normale" && t.priorita != "bassa" } ?: ColoreFase5.GRIGIO)
                Parola5(t.statoVisto + if (t.stato == "chiuso" && t.statoDettaglio.isNotBlank()) " · " + t.statoDettaglio else "")
                if (t.inRitardo) Parola5("In ritardo")
                if (t.inCoda) PillolaInCoda()
                // Fase 7 (§12.6): da dove arriva.
                if (t.dalPortale) Parola7("Dal portale")
            }
            Text(t.titolo, style = Testi.titoloPagina.copy(fontSize = Testi.titoloPagina.fontSize * 0.87f), color = c.testo)
            val aperto = istanteLocale(t.apertoIl)
            Text(
                listOf(t.numero, aperto?.let { "aperto " + ContiTicket.quando(t.apertoIl) }.orEmpty(), t.origineNome.lowercase(), t.tipoNome.lowercase()).filter { it.isNotBlank() }.joinToString(" · "),
                style = Testi.secondarioGrande, color = c.tenue,
            )
            PassiTicket(t.stato)
            t.lettoAl.takeIf { it.isNotBlank() }?.let { RigaInfo(lettoAlle(it)) }
            if (t.errore.isNotBlank()) {
                val op = TicketInCoda.operazioniDi(t, ops).firstOrNull { it.rifiutata }
                Scheda(orizzontale = 18.dp, verticale = 14.dp) {
                    Text("Il server non l'ha accettato: ${t.errore}", style = Testi.testo, color = c.rossoTesto)
                    if (op != null) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PulsanteBordo("Riprova", { dati.riprova(op.idOp) }, Modifier.weight(1f), altezza = 48.dp)
                        PulsanteBordo("Scarta", { dati.scarta(op.idOp) }, Modifier.weight(1f), altezza = 48.dp)
                    }
                }
            }

            // ---- cliente e impianto
            SchedaElenco {
                RigaVoce(t.cliente.ifBlank { "Cliente" }, sotto = t.richiedente.ifBlank { "Chi ha chiamato non è scritto" },
                    inizio = { Iniziali(t.cliente, dimensione = 40.dp) }, onClick = { nav.vai("cliente/${t.idCliente}") })
                val tel = Regex("""\+?\d[\d ]{6,}\d""").find(t.richiedente + " " + t.referenteTelefono)?.value
                if (tel != null) {
                    LineaElenco()
                    RigaVoce("Chiama", sotto = tel, icona = Icone.telefono, freccia = false, onClick = {
                        runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + tel.replace(" ", "")))) }
                    })
                }
                if (t.idSede.isNotBlank()) {
                    LineaElenco()
                    RigaVoce(t.impianto, sotto = t.indirizzoImpianto.ifBlank { null }, icona = Icone.fulmine, onClick = { nav.vai("impianto/${t.idSede}") })
                }
                if (t.contratto.isNotBlank()) {
                    LineaElenco()
                    RigaVoce("Nel contratto ${t.contratto}", sotto = t.commessa.ifBlank { null }, icona = Icone.preventivo, onClick = { nav.vai("contratto-ca/${t.idContratto}") })
                }
                if (t.rifCliente.isNotBlank()) {
                    LineaElenco()
                    RigaVoce("Riferimento del cliente", sotto = t.rifCliente, icona = Icone.numero, freccia = false)
                }
            }

            // ---- i tempi
            if (t.vivo && t.stato != "risolto") {
                val rosso = t.inRitardo
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (rosso) c.rossoTenue else c.superficie2).padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    val col = if (rosso) c.rossoTesto else c.testo2
                    if (t.programmato && t.previstoIl.isNotBlank()) Text("Da fare entro " + eu.stgm.wisper.rapportino.giornoParole(t.previstoIl), style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = col)
                    else {
                        if (t.responsabileId.isBlank() && t.entroPresa.isNotBlank()) Text("Da prendere entro " + ContiTicket.quando(t.entroPresa), style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = col)
                        if (t.entroIntervento.isNotBlank()) Text("Intervento entro " + ContiTicket.quando(t.entroIntervento), style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = col)
                    }
                    if (t.ritardo.isNotBlank()) Text(t.ritardo, style = Testi.secondario, color = col)
                }
            }

            if (t.descrizione.isNotBlank() || t.stato == "in_attesa") Sezione5("Cosa dice il cliente") {
                Scheda(orizzontale = 18.dp, verticale = 14.dp) {
                    if (t.descrizione.isNotBlank()) Text(t.descrizione, style = Testi.testo, color = c.testo)
                    if (t.stato == "in_attesa") Text("In attesa: " + t.statoDettaglio.ifBlank { t.motivo }, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.ambraTesto)
                }
            }
            if (t.esito.isNotBlank() && (t.stato == "risolto" || t.chiuso)) Sezione5("Cosa si è fatto") {
                Scheda(orizzontale = 18.dp, verticale = 14.dp) { Text(t.esito.replaceFirstChar { it.uppercase() }, style = Testi.testo, color = c.testo) }
            }

            // ---- interventi
            val interventi = t.interventi.filter { it.stato != "annullata" }
            if (interventi.isNotEmpty() || (t.vivo && t.stato != "risolto")) Sezione5("Interventi", interventi.size.takeIf { it > 0 }) {
                SchedaElenco {
                    if (interventi.isEmpty()) RigaCalma("Nessun intervento in calendario.")
                    interventi.forEachIndexed { i, a ->
                        if (i > 0) LineaElenco()
                        val quando = a.inizio?.let { ContiTicket.quando(it.toString()).replaceFirstChar { ch -> ch.uppercase() } } ?: "Senza ora"
                        RigaVoce(quando, sotto = listOf(a.nomeAssegnata, a.luogo, if (a.fatta) "fatto" else "").filter { it.isNotBlank() }.joinToString(" · "),
                            icona = Icone.calendario, onClick = { nav.vai("attivita/${a.id}") })
                    }
                    if (scrive && interventi.isNotEmpty()) {
                        LineaElenco()
                        RigaVoce("Un altro intervento", icona = Icone.piu, titoloColore = c.collegamento, freccia = false, onClick = { pianifica = true })
                    }
                }
            }

            // ---- rapportini
            if (t.rapportini.isNotEmpty()) Sezione5("Rapportini", t.rapportini.size) {
                SchedaElenco {
                    t.rapportini.forEachIndexed { i, r ->
                        if (i > 0) LineaElenco()
                        // 06/11/2026: niente firma. Da inviare, Inviato, Fatturato.
                        val stato = eu.stgm.wisper.rapportino.Stato.da(r.stato).etichetta
                        RigaVoce(
                            listOf(r.id.ifBlank { "Rapportino" }, dataIt(r.data).take(5)).joinToString(" · "),
                            sotto = listOf(Numeri.ore(r.ore), "${Numeri.scrivi(r.km)} km").filter { it.isNotBlank() }.joinToString(" · "),
                            icona = Icone.ore,
                            fine = { Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) { Parola5(stato); if (r.inCoda) NuvolaInCoda() } },
                            onClick = {
                                val v = (viste + storico).firstOrNull { (r.idLocale.isNotBlank() && it.rapportino.idLocale == r.idLocale) || (r.id.isNotBlank() && it.rapportino.id == r.id) }
                                if (v != null) nav.apriRapportino(v.rapportino.idLocale, lavoro = true)
                                else if (!r.apribile) avvisi.mostra("È un rapportino di ${r.tecnico}: lo apre lui")
                                else nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, testo = r.id))
                            },
                        )
                    }
                }
            }

            // ---- ore, materiali e spese
            Sezione5("Ore, materiali e spese") {
                SchedaElenco {
                    t.spese.forEachIndexed { i, s ->
                        if (i > 0) LineaElenco()
                        RigaVoce(s.descrizione.ifBlank { s.categoria }, sotto = listOf(s.categoria, s.utente).filter { it.isNotBlank() }.joinToString(" · "),
                            icona = Icone.scontrino, valore = if (perm.costi || s.importo > 0) Numeri.euro(s.importo) else null, freccia = false)
                    }
                    t.ore.forEachIndexed { i, o ->
                        if (i > 0 || t.spese.isNotEmpty()) LineaElenco()
                        RigaVoce(o.descrizione.ifBlank { "Ore" }, sotto = listOf(dataIt(o.data.toString()), o.utente).filter { it.isNotBlank() }.joinToString(" · "),
                            icona = Icone.ore, valore = Numeri.ore(o.ore), freccia = false)
                    }
                    if (t.spese.isNotEmpty() || t.ore.isNotEmpty()) LineaElenco()
                    val s = t.somma
                    Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        val riga = if (s == null || (s.ore == 0.0 && s.km == 0.0 && s.materiale == 0.0 && s.spese == 0.0)) "Ancora niente"
                        else listOf(Numeri.ore(s.ore), "${Numeri.scrivi(s.km)} km", if (s.materiale + s.spese > 0) "materiale e spese " + Numeri.euro(s.materiale + s.spese) else "").filter { it.isNotBlank() }.joinToString(" · ")
                        Text(riga, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                        if (perm.costi && (s?.importo ?: 0.0) > 0) Text("In fattura come lavoro: " + Numeri.euro(s!!.importo!!), style = Testi.secondario, color = c.tenue)
                    }
                    if (scrive && t.id.isNotBlank()) {
                        LineaElenco()
                        // 07/11/2026: le Ore non ci sono più (le ore si scrivono nel rapportino); resta Materiale o spesa.
                        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
                            PulsanteBordo("Materiale o spesa", { RicordoTicket.perOreSpese = t; nav.vai("spesa-nuova") }, Modifier.fillMaxWidth(), icona = Icone.piu, altezza = 48.dp)
                        }
                    }
                }
            }

            // ---- fase 6 (§3.9): gli strumenti usati negli interventi, con lo stato di quel giorno
            if (t.strumenti.isNotEmpty()) Sezione5("Strumenti usati", t.strumenti.size) {
                if (t.tarataScaduta) Parola5("Taratura scaduta", colore = eu.stgm.wisper.rapportino.ColoreFase5.ROSSO)
                SchedaElenco {
                    t.strumenti.forEachIndexed { i, s ->
                        if (i > 0) LineaElenco()
                        RigaVoce(s.nome, sotto = listOf(s.codice, if (s.matricola.isNotBlank()) "matr. ${s.matricola}" else "").filter { it.isNotBlank() }.joinToString(" · "), icona = Icone.misura,
                            fine = {
                                when (s.statoAllora) {
                                    eu.stgm.wisper.rapportino.ContiMezzi.SCADUTA -> Parola6("Taratura scaduta" + if (s.confermato) " · confermato" else "")
                                    eu.stgm.wisper.rapportino.ContiMezzi.NON_CONFORME -> Parola6("Non conforme")
                                    eu.stgm.wisper.rapportino.ContiMezzi.VALIDA -> Parola6("Tarato quel giorno", colore = eu.stgm.wisper.rapportino.ColoreFase5.VERDE)
                                    else -> {}
                                }
                            })
                    }
                }
            }

            // ---- foto
            Sezione5("Foto", t.foto.size.takeIf { it > 0 }) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    t.foto.forEach { f ->
                        if (f.locale != null) MiniaturaFoto(f.locale, "Foto del ticket, ancora sul telefono") { fotoScelta = f }
                        else if (f.dalCliente) Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { MiniaturaRemota(dati, f.id) { fotoScelta = f }; Parola7("Dal cliente") }
                        else MiniaturaRemota(dati, f.id) { fotoScelta = f }
                    }
                    if (scrive) RiquadroFotografa { scatta() }
                    if (t.foto.isEmpty() && !scrive) RigaCalma("Nessuna foto.")
                }
            }

            if (t.documenti.isNotEmpty()) Sezione5("Documenti", t.documenti.size) {
                SchedaElenco { t.documenti.forEachIndexed { i, d -> if (i > 0) LineaElenco(); RigaDocumento(d) { nav.vai("documento/${d.id}") } } }
            }

            if (t.idSede.isNotBlank()) Sezione5("Storico dell'impianto") {
                SchedaElenco {
                    val voci = t.storico.filterNot { it.tipo == "ticket" && it.idTicket == t.id }.take(3)
                    if (voci.isEmpty()) RigaCalma("Ancora niente.")
                    voci.forEachIndexed { i, v -> if (i > 0) LineaElenco(); RigaStorico(v, null) }
                    LineaElenco()
                    RigaVoce("Vedi tutto lo storico", titoloColore = c.collegamento, onClick = { nav.vai("impianto/${t.idSede}") })
                }
            }

            // Fase 7 (§12.6): la conversazione pubblica col cliente, divisa dalla cronologia interna.
            BloccoTicketPortale(dati, t)
            Sezione5("Cronologia") { Cronologia(t.cronologia) }
            if (t.stato == "risolto" && !sessione.puoChiudereTicket) Text("Lo chiude l'ufficio.", style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }

        // ---- UN pulsante giallo, secondo lo stato (§16.11)
        val giallo = if (perm.modifica(Moduli.TICKET)) t.giallo else ""
        if (giallo.isNotBlank()) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            val m = Modifier.bersaglio("ticket-giallo")
            when (giallo) {
                "prendi" -> PulsantePrincipale("Prendo io", { inCodaOEsempio({ dati.fase5.prendi(chiaveAzioni) }, "Preso: adesso pianifica l'intervento") }, m, icona = Icone.spunta)
                "pianifica" -> {
                    PulsantePrincipale("Pianifica l'intervento", { if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO) else pianifica = true }, m, icona = Icone.calendario)
                    PulsanteTesto("Scrivi subito il rapportino", { scriviRapportino() }, Modifier.fillMaxWidth(), colore = c.testo2)
                }
                "rapportino" -> PulsantePrincipale("Scrivi il rapportino", { scriviRapportino() }, m, icona = Icone.firma)
                "risolvi" -> PulsantePrincipale("Segna risolto", { inCodaOEsempio({ dati.fase5.risolvi(chiaveAzioni) }, "Risolto") }, m, icona = Icone.spunta)
                "chiudi" -> PulsantePrincipale("Chiudi il ticket", { if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO) else chiudi = true }, m, icona = Icone.spunta)
                "riprendi" -> PulsantePrincipale("Riprendi", { inCodaOEsempio({ dati.fase5.azioneInCoda(chiaveAzioni, "riprendiTicket") }, "Ripreso") }, m, icona = Icone.avvia)
            }
        }
    }

    if (menu) {
        FoglioDalBasso({ menu = false }) {
            Text(t.numero.ifBlank { "Ticket" }, style = Testi.titoloScheda, color = c.testo)
            if (scrive && t.id.isNotBlank()) VoceMenu(Icone.matita, "Cambia", { menu = false; nav.vai("ticket-modifica/${t.chiave}") })
            if (scrive && t.id.isNotBlank()) VoceMenu(Icone.persone, "Assegna", { menu = false; assegna = true })
            if (scrive && (t.stato == "aperto" || t.stato == "in_carico")) VoceMenu(Icone.pausa, "Metti in attesa", { menu = false; motivo = "attesa" })
            if (scrive && t.giallo != "rapportino") VoceMenu(Icone.firma, "Scrivi il rapportino", { menu = false; scriviRapportino() })
            if (scrive && t.id.isNotBlank()) VoceMenu(Icone.link, "Lega un rapportino", { menu = false; lega = true })
            if (perm.modifica(Moduli.TICKET) && (t.stato == "risolto" || (t.stato == "chiuso" && sessione.puoChiudereTicket && t.riservata.isBlank()))) VoceMenu(Icone.riapri, "Riapri", { menu = false; motivo = "riapri" })
            if (scrive && t.id.isNotBlank() && t.stato != "risolto") VoceMenu(Icone.chiudi, "Annulla il ticket", { menu = false; motivo = "annulla" }, pericolo = true)
            if (t.id.isNotBlank()) VoceMenu(Icone.scarica, "Esporta", {
                menu = false
                avvisi.mostra("Preparo il file…")
                scope.launch { dati.fase5.esporta("ticket", listOf("segmento" to "tutti", "testo" to t.numero)).onSuccess { condividiFile(ctx, it, t.numero, "text/csv") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non si è preparato: riprova")) } }
            })
        }
    }
    if (pianifica) FoglioPianifica(dati, t, onChiudi = { pianifica = false }, onFatto = { giro++; Giri5.ticket++ })
    if (chiudi) FoglioChiudiTicket(dati, t, onChiudi = { chiudi = false }, onFatto = { giro++; Giri5.ticket++ })
    motivo?.let { quale ->
        val (titolo, azione, server) = when (quale) {
            "attesa" -> Triple("Metti in attesa", "Metti in attesa", "sospendiTicket")
            "riapri" -> Triple("Riapri il ticket", "Riapri", "riapriTicket")
            else -> Triple("Annulla il ticket", "Annulla il ticket", "annullaTicket")
        }
        FoglioMotivo(titolo, if (quale == "attesa") "Aspetta il materiale" else "", azione, pericolo = quale == "annulla", onChiudi = { motivo = null }) { m ->
            motivo = null
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@FoglioMotivo }
            if (server == "sospendiTicket") {
                dati.fase5.azioneInCoda(chiaveAzioni, server, JSONObject().put("motivo", m)); avvisi.mostra("In attesa: $m")
            } else scope.launch {
                dati.fase5.azione(server, chiaveAzioni, JSONObject().put("motivo", m))
                    .onSuccess { avvisi.mostra(if (server == "riapriTicket") "Riaperto" else "Ticket annullato"); giro++; Giri5.ticket++ }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è cambiato: riprova")) }
            }
        }
    }
    if (assegna) FoglioAssegna(dati, t, onChiudi = { assegna = false }) { id ->
        assegna = false
        scope.launch {
            dati.fase5.azione("assegnaTicket", chiaveAzioni, JSONObject().put("responsabileId", id?.let { eu.stgm.wisper.rapportino.PonteServer.idJson(it) } ?: JSONObject.NULL))
                .onSuccess { avvisi.mostra(if (id == null) "Nessuno lo segue più" else "Assegnato a ${it.responsabile}"); giro++; Giri5.ticket++ }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato assegnato: riprova")) }
        }
    }
    if (lega) {
        val liberi = (viste + storico).map { it.rapportino }.distinctBy { it.idLocale }
            .filter { it.idCliente == t.idCliente && !it.conTicket && it.id.isNotBlank() && it.stato != eu.stgm.wisper.rapportino.Stato.FATTURATO }
            .sortedByDescending { it.data }.take(20)
        FoglioDalBasso({ lega = false }) {
            Text("Lega un rapportino", style = Testi.titoloScheda, color = c.testo)
            if (liberi.isEmpty()) RigaCalma("Nessun rapportino di ${t.cliente} senza ticket.")
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                liberi.forEachIndexed { i, r ->
                    if (i > 0) LineaElenco()
                    RigaVoce("${r.id} · ${dataIt(r.data.toString())}", sotto = r.descrizione.ifBlank { null }, freccia = false, onClick = {
                        lega = false
                        scope.launch {
                            dati.fase5.legaRapportino(r.id, chiaveAzioni).onSuccess { avvisi.mostra("Rapportino legato al ticket"); dati.aggiorna(); giro++ }
                                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è legato: riprova")) }
                        }
                    })
                }
            }
        }
    }
    fotoScelta?.let { f ->
        FoglioDalBasso({ fotoScelta = null }) {
            Text("Foto del ticket", style = Testi.titoloScheda, color = c.testo)
            VoceMenu(Icone.occhio, "Apri", {
                fotoScelta = null
                scope.launch {
                    if (f.locale != null) {
                        val copia = withContext(Dispatchers.IO) { File(File(ctx.cacheDir, "pdf").apply { mkdirs() }, f.locale.name).also { f.locale.copyTo(it, overwrite = true) } }
                        if (!eu.stgm.wisper.rapportino.Stampa.apri(ctx, copia, "image/jpeg")) avvisi.mostra("Sul telefono non c'è un'app per aprire le foto")
                    } else apriFile5(ctx, dati, f.id, f.nome.ifBlank { "foto-${f.id}.jpg" }, f.mime)?.let { avvisi.mostra(it) }
                }
            })
            if (f.locale == null && f.idDocumento.isBlank() && perm.modifica(Moduli.DOCUMENTI)) VoceMenu(Icone.documento, "Metti nell'archivio", {
                fotoScelta = null
                scope.launch {
                    val foto = dati.fase5.categorie().getOrNull()?.firstOrNull { it.nome == "Foto" }?.id.orEmpty()
                    val o = JSONObject().put("origine", "file").put("idFile", f.id).put("titolo", "Foto ${t.numero} · ${t.titolo}").put("idTicket", eu.stgm.wisper.rapportino.PonteServer.idJson(t.id))
                    if (t.idSede.isNotBlank()) o.put("idSede", eu.stgm.wisper.rapportino.PonteServer.idJson(t.idSede))
                    if (foto.isNotBlank()) o.put("idCategoria", eu.stgm.wisper.rapportino.PonteServer.idJson(foto))
                    dati.fase5.salvaDocumento(o).onSuccess { avvisi.mostra("Messa nell'archivio, in Foto"); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è entrata nell'archivio: riprova")) }
                }
            })
            if (f.locale == null && scrive) VoceMenu(Icone.cestino, "Togli la foto", {
                fotoScelta = null
                scope.launch {
                    dati.fase5.togliFoto(f.id).onSuccess {
                        giro++
                        avvisi.mostra("Foto tolta") { scope.launch { dati.fase5.togliFoto(f.id, annulla = true).onSuccess { giro++ } } }
                    }.onFailure { avvisi.mostra(spiegaErrore2(it, "La foto non è stata tolta: riprova")) }
                }
            }, pericolo = true)
        }
    }
}

/** I quattro passi del ticket: Aperto → In carico → Risolto → Chiuso. */
@Composable
internal fun PassiTicket(stato: String) {
    val c = W.colori
    val n = when (stato) { "aperto" -> 1; "in_carico", "in_attesa" -> 2; "risolto" -> 3; else -> 4 }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("Aperto", "In carico", "Risolto", "Chiuso").forEachIndexed { i, p ->
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(3.dp)).background(if (i < n) c.testo else c.superficie2))
                Text(p, style = Testi.piccolo.copy(fontWeight = if (i < n) FontWeight.ExtraBold else FontWeight.SemiBold), color = if (i < n) c.testo else c.tenue, maxLines = 1)
            }
        }
    }
}

/** Una foto del server, rimpicciolita, letta una volta (dal telefono se c'è). */
@Composable
private fun MiniaturaRemota(dati: Dati, id: String, onClick: () -> Unit) {
    val c = W.colori
    val bitmap = produceState<Bitmap?>(null, id) {
        value = withContext(Dispatchers.IO) {
            runCatching { dati.file(id)?.first }.getOrNull()?.let { b ->
                val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(b, 0, b.size, o)
                var scala = 1
                while (o.outWidth / scala > 480 || o.outHeight / scala > 480) scala *= 2
                BitmapFactory.decodeByteArray(b, 0, b.size, BitmapFactory.Options().apply { inSampleSize = scala })
            }
        }
    }.value
    Box(
        Modifier.size(84.dp).clip(RoundedCornerShape(16.dp)).background(c.superficie2).border(1.dp, c.bordoScheda, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick).semantics { contentDescription = "Foto del ticket"; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) Image(bitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Icon(Icone.foto, null, tint = c.tenue, modifier = Modifier.size(28.dp))
    }
}

/** Il foglio con un motivo (In attesa, Riapri, Annulla): obbligatorio, come vuole il server. */
@Composable
internal fun FoglioMotivo(titolo: String, segnaposto: String, azione: String, pericolo: Boolean = false, onChiudi: () -> Unit, onConferma: (String) -> Unit) {
    val c = W.colori
    var testo by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    FoglioDalBasso(onChiudi) {
        Text(titolo, style = Testi.titoloScheda, color = c.testo)
        CampoTesto(testo, { testo = it; errore = null }, "Motivo", segnaposto = segnaposto, errore = errore)
        if (pericolo) PulsanteBordo(azione, { if (testo.isBlank()) errore = "Scrivi il motivo" else onConferma(testo.trim()) }, Modifier.fillMaxWidth())
        else PulsantePrincipale(azione, { if (testo.isBlank()) errore = "Scrivi il motivo" else onConferma(testo.trim()) })
        PulsanteTesto("Annulla", onChiudi, Modifier.fillMaxWidth(), colore = c.testo)
    }
}

/** Chi lo segue: le persone (il collaboratore solo sé o nessuno). */
@Composable
private fun FoglioAssegna(dati: Dati, t: Ticket, onChiudi: () -> Unit, onScelto: (String?) -> Unit) {
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val persone = if (sessione.collaboratore) listOf(sessione.utente) else ana.utenti.filter { it.attivo && it.ruolo != Ruoli.LETTURA }
    FoglioDalBasso(onChiudi) {
        Text("Chi lo segue", style = Testi.titoloScheda, color = c.testo)
        persone.forEachIndexed { i, u ->
            if (i > 0) LineaElenco()
            RigaVoce(if (u.id == sessione.utente.id) "Io" else u.nome, inizio = { CerchioPersona(u.iniziali) }, freccia = false,
                fine = if (u.id == t.responsabileId) ({ Icon(Icone.spunta, "Scelto", tint = c.testo, modifier = Modifier.size(20.dp)) }) else null,
                onClick = { onScelto(u.id) })
        }
        LineaElenco()
        RigaVoce("Nessuno per ora", freccia = false, onClick = { onScelto(null) })
    }
}

/**
 * Pianifica l'intervento (§12.1): il giorno, l'ora a mezz'ore, quanto dura, chi va, il
 * luogo; sotto le cose già in calendario quel giorno. Mette un'attività "intervento".
 */
@Composable
private fun FoglioPianifica(dati: Dati, t: Ticket, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val attivita by dati.attivita.collectAsStateWithLifecycle()
    val oggi = LocalDate.now()
    var giorno by remember { mutableStateOf(oggi) }
    val adesso = LocalTime.now()
    var ora by remember { mutableStateOf(if (adesso.isBefore(LocalTime.of(8, 30))) LocalTime.of(9, 0) else LocalTime.of(minOf(18, adesso.hour + if (adesso.minute >= 30) 1 else 0), if (adesso.minute in 1..29) 30 else 0)) }
    var durata by remember { mutableStateOf(1L) }
    var chi by remember { mutableStateOf(t.responsabileId.ifBlank { sessione.utente.id }) }
    var luogo by remember { mutableStateOf(t.indirizzoImpianto) }
    var altroGiorno by remember { mutableStateOf(false) }
    var sovrapposto by remember { mutableStateOf<String?>(null) }
    var invio by remember { mutableStateOf(false) }
    val persone = if (sessione.collaboratore) listOf(sessione.utente) else ana.utenti.filter { it.attivo && it.ruolo != Ruoli.LETTURA }
    val giorni = (0L..5L).map { oggi.plusDays(it) }

    fun metti(conferma: Boolean) {
        if (invio) return
        invio = true
        val inizio = giorno.atTime(ora)
        scope.launch {
            dati.fase5.pianifica(t.chiave, inizio, inizio.plusHours(durata), chi, luogo, "", conferma)
                .onSuccess { onChiudi(); avvisi.mostra("Intervento in calendario: " + ContiTicket.quando(inizio.toString())); dati.aggiornaAttivita(); onFatto() }
                .onFailure { e -> val d = daConfermare(e); if (d != null) sovrapposto = d.message else avvisi.mostra(spiegaErrore2(e, "L'intervento non è stato messo: riprova")) }
            invio = false
        }
    }

    FoglioDalBasso(onChiudi) {
        Text("Pianifica l'intervento", style = Testi.titoloScheda, color = c.testo)
        Text(listOf(t.numero, t.titolo).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
        Domanda("Che giorno") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                giorni.forEach { g ->
                    val nome = when (g) { oggi -> "oggi"; oggi.plusDays(1) -> "domani"; else -> g.format(DateTimeFormatter.ofPattern("EEE d", ITALIA)) }
                    Pillola(nome, g == giorno, { giorno = g; sovrapposto = null }, altezza = 46.dp)
                }
                Pillola(if (giorno !in giorni) giorno.format(DateTimeFormatter.ofPattern("d MMM", ITALIA)) else "Altro giorno", giorno !in giorni, { altroGiorno = true }, altezza = 46.dp)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("A che ora", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
            Stepper(ora.format(DateTimeFormatter.ofPattern("H:mm")), { ora = ora.minusMinutes(30); sovrapposto = null }, { ora = ora.plusMinutes(30); sovrapposto = null }, "l'ora")
        }
        Domanda("Quanto dura") {
            SceltePillole(listOf(1L to "1 h", 2L to "2 h", 4L to "Mezza giornata"), durata, { durata = it; sovrapposto = null })
        }
        Domanda("Chi va") {
            SceltePillole(persone.map { it.id to if (it.id == sessione.utente.id) "Io" else it.nome }, chi, { chi = it; sovrapposto = null })
        }
        CampoTesto(luogo, { luogo = it }, "Luogo")
        val gia = attivita.filter { it.giorno == giorno && it.assegnataA == chi && it.stato != "annullata" && it.conOra }
        if (gia.isNotEmpty()) Text(
            "Già in calendario: " + gia.joinToString(", ") { a -> a.titolo + " " + a.inizio!!.toLocalTime().format(DateTimeFormatter.ofPattern("H:mm")) + (a.fine?.let { "-" + it.toLocalTime().format(DateTimeFormatter.ofPattern("H:mm")) } ?: "") },
            style = Testi.secondario, color = c.tenue,
        )
        sovrapposto?.let {
            Text(it, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.rossoTesto, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.rossoTenue).padding(14.dp))
        }
        PulsantePrincipale(if (invio) "Metto in calendario…" else if (sovrapposto != null) "Mettilo lo stesso" else "Metti in calendario", { metti(sovrapposto != null) }, icona = Icone.calendario, abilitato = !invio)
    }
    if (altroGiorno) FinestraGiorno(giorno, { giorno = it; sovrapposto = null }, { altroGiorno = false })
}

/**
 * Chiudi il ticket (§12.1, §16.14): come si fattura, con la proposta già scelta e il
 * perché; per "Una riga" la somma e A corpo; per "Non si fattura" il motivo.
 */
@Composable
private fun FoglioChiudiTicket(dati: Dati, t: Ticket, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val costi = LocalPermessi.current.costi
    var modo by remember { mutableStateOf(t.proposta.ifBlank { "ticket" }) }
    var corpo by remember { mutableStateOf(false) }
    var prezzo by remember { mutableStateOf("") }
    var motivo by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var conferma by remember { mutableStateOf<String?>(null) }
    var invio by remember { mutableStateOf(false) }

    fun manda(confermato: Boolean) {
        errore = null
        val p = if (modo == "ticket" && corpo) importoScritto(prezzo) else null
        if (modo == "ticket" && corpo && (p == null || p <= 0)) { errore = "Prezzo a corpo: scrivi quanto"; return }
        if (modo == "no" && motivo.isBlank()) { errore = "Scrivi perché non si fattura"; return }
        if (invio) return
        invio = true
        scope.launch {
            dati.fase5.chiudi(t.chiave, modo, p, motivo, confermato)
                .onSuccess { (_, voce) ->
                    onChiudi(); onFatto()
                    val testo = if (voce != null) "Chiuso: va in Da fatturare (" + Numeri.euro(voce.optDouble("importo", 0.0)) + ")" else "Chiuso: " + ParoleTicket.MODI[modo].orEmpty().lowercase()
                    avvisi.mostra(testo) {
                        scope.launch { dati.fase5.azione("riapriTicket", t.chiave, JSONObject().put("motivo", "chiusura annullata")).onSuccess { onFatto() } }
                    }
                }
                .onFailure { e -> val d = daConfermare(e); if (d != null) conferma = d.message else errore = spiegaErrore2(e, "Il ticket non si è chiuso: riprova") }
            invio = false
        }
    }

    FoglioDalBasso(onChiudi) {
        Text("Chiudi il ticket", style = Testi.titoloScheda, color = c.testo)
        Text(listOf(t.numero, t.cliente).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
        Text("Come si fattura?", style = Testi.forteGrande, color = c.testo)
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ParoleTicket.MODI.filterKeys { it != "contratto" || t.idContratto.isNotBlank() }.forEach { (k, nome) ->
                val sotto = if (k == "contratto" && t.contratto.isNotBlank()) "Lo copre il canone di ${t.contratto}" else ParoleTicket.MODI_SOTTO[k].orEmpty()
                SceltaGrande(nome, modo == k, { modo = k; conferma = null; errore = null }, sotto = sotto)
                // La proposta del server, in giallo scuro sotto la sua scelta (fase5.md §12.4).
                if (k == t.proposta && t.propostaPerche.isNotBlank())
                    Text("Proposta: ${t.propostaPerche}", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto, modifier = Modifier.padding(start = 8.dp))
            }
            // Senza rete (o ticket ancora in coda) i conti non ci sono: chiudere vuole la rete.
            if (t.inCoda || t.somma == null)
                Text("Per chiudere serve la rete: il conto lo fa il server.", style = Testi.secondarioGrande, color = c.tenue)
            if (modo == "ticket") Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 10.dp) {
                val s = t.somma
                Text(listOf(s?.ore?.let { Numeri.ore(it) }, s?.km?.let { "${Numeri.scrivi(it)} km" }, s?.let { if (it.materiale + it.spese > 0) "materiale " + Numeri.euro(it.materiale + it.spese) else null })
                    .filterNotNull().joinToString(" · ").ifBlank { "Ancora niente di registrato" }, style = Testi.secondarioGrande, color = c.testo2)
                if (costi && (corpo || s != null)) Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (corpo) "A corpo" else "In fattura", style = Testi.forte, color = c.tenue, modifier = Modifier.weight(1f))
                    Text(if (corpo) (importoScritto(prezzo)?.let { Numeri.euro(it) } ?: "—") else Numeri.euro(s?.importo ?: 0.0), style = Testi.titoloScheda, color = c.testo)
                }
                RigaCasella("A corpo, con un prezzo", corpo) { corpo = !corpo }
                if (corpo) CampoTesto(prezzo, { prezzo = it }, "Prezzo", tastiera = KeyboardType.Decimal, suffisso = "€")
            }
            if (modo == "no") CampoTesto(motivo, { motivo = it; errore = null }, "Perché non si fattura", segnaposto = "Garanzia dell'intervento di settembre")
            if (t.daFirmare.isNotBlank()) Text("${t.daFirmare}: va in fattura dopo", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
            conferma?.let { Text(it, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.ambraTesto, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.ambraFondo).padding(14.dp)) }
        }
        PulsantePrincipale(if (invio) "Chiudo…" else if (conferma != null) "Chiudi lo stesso" else "Chiudi il ticket", { manda(conferma != null) }, icona = Icone.spunta, abilitato = !invio)
    }
}

/**
 * Il lavoro è finito? (§3.3): dopo la firma (o Salva senza firma) di un rapportino
 * col ticket. Sì, è risolto (giallo) o Serve un altro intervento: in coda, anche senza rete.
 */
@Composable
fun FoglioLavoroFinito(dati: Dati, r: Rapportino, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val inCoda = ops.any { it.idLocale == r.idLocale }
    FoglioDalBasso(onChiudi) {
        Text("Il lavoro è finito?", style = Testi.titoloScheda, color = c.testo)
        val chi = if (r.firmatario.isNotBlank()) " firmato da ${r.firmatario}" else ""
        Text(listOf(r.id.ifBlank { "Rapportino del " + dataIt(r.data.toString()) } + chi, if (inCoda) "parte appena c'è rete" else "").filter { it.isNotBlank() }.joinToString(" · "),
            style = Testi.secondarioGrande, color = c.tenue)
        PulsantePrincipale("Sì, è risolto", {
            if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO) else { dati.fase5.risolvi(r.chiaveTicket); avvisi.mostra("Risolto: lo chiude l'ufficio") }
            onChiudi()
        }, icona = Icone.spunta)
        PulsanteTesto("Serve un altro intervento", {
            if (!dati.esempio) { dati.fase5.altroIntervento(r.chiaveTicket); avvisi.mostra("Il ticket resta in carico") }
            onChiudi()
        }, Modifier.fillMaxWidth(), colore = c.testo)
    }
}

/** Lega a un ticket (dal rapportino, menu ⋯): i ticket aperti di quel cliente. */
@Composable
fun FoglioLegaTicket(dati: Dati, r: Rapportino, onChiudi: () -> Unit, onLegato: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val lettura = rememberLettura(r.idCliente, 0) { dati.fase5.tickets("aperti", listOf("idCliente" to r.idCliente)) }
    FoglioDalBasso(onChiudi) {
        Text("Lega a un ticket", style = Testi.titoloScheda, color = c.testo)
        when (lettura) {
            is Lettura.InCorso -> Segnaposto(72.dp)
            is Lettura.Errore -> Text(lettura.messaggio, style = Testi.testo, color = c.testo2)
            is Lettura.Pronta -> {
                val l = lettura.dato.ticket.filter { it.stato != "risolto" || true }
                if (l.isEmpty()) RigaCalma("Nessun ticket aperto di ${r.cliente}.")
                Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                    l.forEachIndexed { i, t ->
                        if (i > 0) LineaElenco()
                        RigaVoce("${t.numero} · ${t.titolo}", sotto = t.impianto.ifBlank { null }, freccia = false, onClick = {
                            scope.launch {
                                dati.fase5.legaRapportino(r.id, t.id).onSuccess { avvisi.mostra("Legato a ${t.numero}"); dati.aggiorna(); onLegato() }
                                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è legato: riprova")) }
                            }
                        })
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------- nuovo ticket

/**
 * Nuovo ticket (§12.1): per chi, quale impianto, cosa succede, cosa dice il cliente, da
 * dove arriva, che cos'è, le due domande con la priorità che esce, chi lo segue.
 * Senza rete si apre lo stesso, col numero proposto. [arg]: "", l'id di un impianto,
 * o "modifica:<chiave>" per Cambia (che vuole la rete).
 */
@Composable
fun SchermataNuovoTicket(dati: Dati, nav: Navigatore, arg: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val modifica = arg.startsWith("modifica:")
    val chiaveModifica = arg.removePrefix("modifica:")
    val esistente = if (modifica) rememberTicket(dati, chiaveModifica, 0).first else null
    if (modifica && esistente == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true); Segnaposto(200.dp)
        }
        return
    }
    val sedeIniziale = if (!modifica) ana.sedi.firstOrNull { it.id == arg } else null

    var idCliente by rememberSaveable { mutableStateOf(esistente?.idCliente ?: sedeIniziale?.idSoggetto ?: "") }
    var idSede by rememberSaveable { mutableStateOf(esistente?.idSede ?: sedeIniziale?.id ?: "") }
    var titolo by rememberSaveable { mutableStateOf(esistente?.titolo ?: "") }
    var descrizione by rememberSaveable { mutableStateOf(esistente?.descrizione ?: "") }
    var richiedente by rememberSaveable { mutableStateOf(esistente?.richiedente ?: "") }
    var rif by rememberSaveable { mutableStateOf(esistente?.rifCliente ?: "") }
    var conChi by rememberSaveable { mutableStateOf(richiedente.isNotBlank() || rif.isNotBlank()) }
    var origine by rememberSaveable { mutableStateOf(esistente?.origine?.takeIf { it in ParoleTicket.ORIGINI } ?: "telefono") }
    var tipo by rememberSaveable { mutableStateOf(esistente?.tipo ?: "guasto") }
    var impatto by rememberSaveable { mutableStateOf(esistente?.impatto ?: "") }
    var urgenza by rememberSaveable { mutableStateOf(esistente?.urgenza ?: "") }
    var prioritaMano by rememberSaveable { mutableStateOf(if (esistente?.prioritaAMano == true) esistente.priorita else "") }
    var resp by rememberSaveable { mutableStateOf(if (modifica) esistente?.responsabileId.orEmpty() else if (sessione.collaboratore) sessione.utente.id else "") }
    var cerca by remember { mutableStateOf("") }
    var cambiaPrio by remember { mutableStateOf(false) }
    var impiantoNuovo by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    var invio by remember { mutableStateOf(false) }

    val cliente = ana.cliente(idCliente)
    val contratto = dati.fase5.contrattoDi(idSede)
    val priorita = prioritaMano.ifBlank { ContiTicket.prioritaDa(impatto, urgenza) }
    val tempi = ContiTicket.tempi(ana.impostazioni["TICKET_TEMPI"], contratto?.tempi)
    // L'ora del server è quella italiana: il telefono può avere un altro fuso (l'emulatore è in UTC).
    val entro = ContiTicket.entro(LocalDateTime.now(ZoneId.of("Europe/Rome")).withNano(0).toString(), priorita, tempi).second
    val recenti = remember(viste, ana) {
        (viste.map { it.rapportino.idCliente } + ana.clienti.map { it.id }).filter { it.isNotBlank() }.distinct().mapNotNull { ana.cliente(it) }.take(4)
    }

    fun apri() {
        errore = null
        if (idCliente.isBlank()) { errore = "Cliente: scegli il cliente"; return }
        if (titolo.isBlank()) { errore = "Titolo: scrivi in poche parole cosa succede"; return }
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        val o = JSONObject().put("idCliente", idCliente).put("titolo", titolo.trim()).put("descrizione", descrizione.trim())
            .put("tipo", tipo).put("origine", origine).put("richiedente", richiedente.trim()).put("rifCliente", rif.trim())
        o.put("idSede", if (idSede.isBlank()) JSONObject.NULL else eu.stgm.wisper.rapportino.PonteServer.idJson(idSede))
        if (impatto.isNotBlank()) o.put("impatto", impatto)
        if (urgenza.isNotBlank()) o.put("urgenza", urgenza)
        if (prioritaMano.isNotBlank()) o.put("priorita", prioritaMano)
        if (modifica && esistente != null) {
            if (invio) return
            invio = true
            o.put("id", eu.stgm.wisper.rapportino.PonteServer.idJson(esistente.id))
            scope.launch {
                dati.fase5.salvaTicket(o).onSuccess { avvisi.mostra("Salvato"); Giri5.ticket++; nav.indietro() }
                    .onFailure { errore = spiegaErrore2(it, "Il ticket non si è salvato: riprova") }
                invio = false
            }
            return
        }
        if (resp.isNotBlank()) o.put("responsabileId", eu.stgm.wisper.rapportino.PonteServer.idJson(resp))
        val inCoda = ops.count { it.tipo == eu.stgm.wisper.rapportino.CodaInvii.Tipo.TICKET }
        val numero = ContiTicket.numeroProposto(ana.numerazioni.firstOrNull { it.tipo == "ticket" }, giaInCoda = inCoda)
        if (numero.isNotBlank()) o.put("numero", numero)
        o.put("apertoIl", LocalDateTime.now(ZoneId.of("Europe/Rome")).withNano(0).toString())
        val k = dati.fase5.nuovoTicket(o)
        avvisi.mostra("Ticket ${numero.ifBlank { "nuovo" }} aperto")
        nav.indietro()
        nav.vai("ticket/$k")
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(if (modifica) "Cambia il ticket" else "Nuovo ticket")
            Domanda("Per chi") {
                if (cliente != null) {
                    SchedaElenco { RigaVoce(cliente.nome, sotto = cliente.citta.ifBlank { null }, inizio = { Iniziali(cliente.nome, dimensione = 44.dp) }, freccia = false,
                        fine = { if (!modifica || (esistente?.quantiRapportini ?: 0) == 0) PulsanteTesto("Cambia", { idCliente = ""; idSede = "" }) }) }
                } else {
                    recenti.forEach { cl ->
                        SceltaGrande(cl.nome, false, { idCliente = cl.id; idSede = ana.sediDi(cl.id).singleOrNull { it.impianto }?.id.orEmpty() }, sotto = cl.citta.ifBlank { null })
                    }
                    CampoCerca(cerca, { cerca = it }, "Altro cliente")
                    if (cerca.isNotBlank()) {
                        val q = pulisciRicerca(cerca)
                        SchedaElenco {
                            val trovati = ana.clienti.filter { pulisciRicerca(it.nome + " " + it.citta).contains(q) }.take(8)
                            if (trovati.isEmpty()) RigaCalma("Nessun cliente")
                            trovati.forEachIndexed { i, cl -> if (i > 0) LineaElenco(); RigaVoce(cl.nome, sotto = cl.citta.ifBlank { null }, freccia = false, onClick = { idCliente = cl.id; cerca = "" }) }
                        }
                    }
                }
            }
            if (cliente != null) Domanda("Quale impianto") {
                val sedi = ana.sediDi(idCliente).filter { !it.archiviata }.sortedBy { if (it.impianto) 0 else 1 }
                SceltePillole(sedi.map { it.id to it.nome } + ("" to "Nessuno in particolare"), idSede, { idSede = it })
                if (LocalPermessi.current.modifica(Moduli.CLIENTI)) PulsanteTesto("+ Impianto nuovo", { impiantoNuovo = true })
                contratto?.let { Text("Nel contratto ${it.numero} · copre ${it.copreParole.lowercase()}", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo2) }
            }
            CampoTesto(titolo, { titolo = it; errore = null }, "Cosa succede")
            CampoTesto(descrizione, { descrizione = it }, "Cosa dice il cliente", righe = 3)
            if (!conChi) PulsanteTesto("+ Chi ha chiamato e riferimento del cliente", { conChi = true })
            else {
                val referenti = ana.referentiDi(idCliente)
                if (referenti.isNotEmpty()) SceltePillole(referenti.map { r -> (r.nome + (if (r.telefono.isNotBlank()) " · " + r.telefono else "")) to r.nome }, richiedente, { richiedente = it })
                CampoTesto(richiedente, { richiedente = it }, "Chi ha chiamato")
                CampoTesto(rif, { rif = it }, "Riferimento del cliente")
            }
            Domanda("Da dove arriva") { SceltePillole(ParoleTicket.ORIGINI.toList(), origine, { origine = it }) }
            Domanda("Che cos'è") { SceltePillole(ParoleTicket.TIPI.toList().filter { it.first != "programmato" || tipo == "programmato" }, tipo, { tipo = it }) }
            Domanda("L'impianto è fermo?") { SceltePillole(ParoleTicket.IMPATTI.toList(), impatto, { impatto = if (impatto == it) "" else it }) }
            Domanda("Per quando?") { SceltePillole(ParoleTicket.URGENZE.toList(), urgenza, { urgenza = if (urgenza == it) "" else it }) }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.scheda).border(1.dp, c.bordoScheda, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Priorità", style = Testi.forte, color = c.testo)
                Spacer(Modifier.width(10.dp))
                Parola5(ParoleTicket.priorita(priorita), colore = colorePriorita(priorita))
                Spacer(Modifier.weight(1f))
                PulsanteTesto("Cambia", { cambiaPrio = true })
            }
            Text("Da intervenire entro " + ContiTicket.quando(entro), style = Testi.secondarioGrande, color = c.tenue)
            if (!modifica) Domanda("Chi lo segue") {
                val persone = if (sessione.collaboratore) listOf(sessione.utente.id to "Io")
                else listOf(sessione.utente.id to "Io") + ana.utenti.filter { it.attivo && it.id != sessione.utente.id && it.ruolo != Ruoli.LETTURA }.map { it.id to it.nome }
                SceltePillole(persone + ("" to "Nessuno per ora"), resp, { resp = it })
            }
            errore?.let { Text(it, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (invio) "Salvo…" else if (modifica) "Salva" else "Apri il ticket", { apri() }, icona = if (modifica) Icone.spunta else Icone.piu, abilitato = !invio)
        }
    }
    if (cambiaPrio) FoglioDalBasso({ cambiaPrio = false }) {
        Text("Cambia la priorità", style = Testi.titoloScheda, color = c.testo)
        SceltePillole(listOf("" to "Dalle due domande") + ParoleTicket.PRIORITA.toList(), prioritaMano, { prioritaMano = it; cambiaPrio = false })
    }
    if (impiantoNuovo) {
        var nome by remember { mutableStateOf("") }
        FoglioDalBasso({ impiantoNuovo = false }) {
            Text("Impianto nuovo", style = Testi.titoloScheda, color = c.testo)
            CampoTesto(nome, { nome = it }, "Nome", segnaposto = "Cabina MT")
            PulsantePrincipale("Aggiungi l'impianto", {
                if (nome.isBlank()) return@PulsantePrincipale
                scope.launch {
                    dati.salvaSede(eu.stgm.wisper.rapportino.Sede("", idCliente, "impianto", nome.trim()))
                        .onSuccess { s -> idSede = s.id; impiantoNuovo = false; avvisi.mostra("Impianto aggiunto") }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "L'impianto non si è salvato: serve la rete")) }
                }
            }, icona = Icone.piu)
        }
    }
}

/** Il numero del ticket da proporre senza rete, contando quelli già in coda. */
internal fun ContiTicket.numeroProposto(n: eu.stgm.wisper.rapportino.Numerazione?, giaInCoda: Int, anno: Int = LocalDate.now().year): String {
    if (n == null) return ""
    val base = numeroProposto(n, anno)
    if (giaInCoda <= 0) return base
    val cifre = Regex("""(\d+)$""").find(base) ?: return base
    val nuovo = (cifre.value.toInt() + giaInCoda).toString().padStart(cifre.value.length, '0')
    return base.substring(0, cifre.range.first) + nuovo
}

@Suppress("unused")
private fun Anagrafiche.nomeUtente(id: String) = utenti.firstOrNull { it.id == id }?.nome.orEmpty()
