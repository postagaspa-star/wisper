@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.CategoriaDoc
import eu.stgm.wisper.rapportino.Collegamenti
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.DocArchivio
import eu.stgm.wisper.rapportino.FiltroArchivio
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.Scadenza
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.dataIt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

/*
 * Il documento sul telefono (fase5.md §12.3): pillole, revisioni o collegamento, a cosa
 * è legato, scadenza, Manda per email e Link che scade (Non collegato), cronologia.
 * Il giallo: Approva la rev. N per chi approva, se no Apri / Apri in OneDrive.
 * Più Aggiungi un documento (fotocamera, file con /carica, collegamento anche dal
 * Condividi di Android), la lettera dal modello e i testi dei modelli.
 */

@Composable
fun SchermataDocumento(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val scrive = scriveDocumenti()
    var giro by remember { mutableIntStateOf(0) }
    // Giri7.portale: quando Pubblica o Togli dal portale arriva al server, la pagina si rilegge.
    val lettura = rememberLettura(id, giro + Giri5.documenti * 1000 + Giri7.portale * 100_000) { dati.fase5.documento(id) }
    var menu by remember { mutableStateOf(false) }
    var pubblicaDoc by remember { mutableStateOf(false) }
    val opsDoc by dati.operazioni.collectAsStateWithLifecycle()
    var respingi by remember { mutableStateOf(false) }
    var manda by remember { mutableStateOf(false) }
    var revisione by remember { mutableStateOf(false) }
    var cambia by remember { mutableStateOf(false) }
    var archivia by remember { mutableStateOf<String?>(null) }
    var tenuto by remember(id) { mutableStateOf(false) }

    val d = (lettura as? Lettura.Pronta)?.dato
    if (d == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            TestataInterna({ nav.indietro() })
            if (lettura is Lettura.Errore) SchedaErrore(lettura.messaggio) { giro++ } else { Segnaposto(120.dp); Segnaposto(200.dp) }
        }
        return
    }
    LaunchedEffect(d.idFile) { tenuto = d.idFile.isNotBlank() && dati.fase5.tenuto(d.idFile) }
    val attesa = d.versioneDaApprovare
    fun apri(idFile: String, nome: String, mime: String) {
        avvisi.mostra("Apro $nome…")
        scope.launch { apriFile5(ctx, dati, idFile, nome, mime)?.let { avvisi.mostra(it) } }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 140.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            TestataInterna({ nav.indietro() }) { PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Parola5(if (d.collegamento) d.collegamentoNome else d.statoVisto + (d.revisione?.let { " · rev. $it" } ?: ""), colore = if (d.collegamento) ColoreFase5.BLU else null)
                if (attesa != null && d.statoVisto != "Da approvare") Parola5("rev. ${attesa.numero} da approvare", colore = ColoreFase5.GIALLO)
                if (d.cartella) Parola5("Cartella", colore = ColoreFase5.GRIGIO)
                if (d.vede == "costi") Parola5("Chi vede i prezzi", colore = ColoreFase5.GRIGIO)
                if (d.daClassificare) Parola5("Da classificare")
                if (tenuto) Parola5("Sul telefono", colore = ColoreFase5.GRIGIO)
            }
            Text(d.titolo, style = Testi.titoloPagina.copy(fontSize = Testi.titoloPagina.fontSize * 0.8f), color = c.testo)
            Text(listOf(d.categoria, dataIt(d.dataDocumento), d.riferimento).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
            d.mieRespinte.forEach { (n, motivo) -> Text("La tua rev. $n è stata respinta: $motivo", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.rossoTesto) }

            if (d.collegamento) Sezione5("Collegamento") {
                Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 10.dp) {
                    Text(d.url, style = Testi.secondarioGrande, color = c.testo2, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    PulsanteBordo("Copia", { copiaTesto(ctx, d.titolo, d.url, avvisi) }, altezza = 48.dp, icona = Icone.copia)
                    d.righe.forEach { Text(it, style = Testi.secondario, color = c.tenue) }
                }
            } else {
                Scheda(orizzontale = 16.dp, verticale = 14.dp) {
                    RigaVoce(d.nomeFile.ifBlank { d.titolo }, sotto = listOf(d.mime.substringAfter('/').uppercase().take(5), peso(d.byte)).filter { it.isNotBlank() }.joinToString(" · "),
                        icona = iconaDocumento(d), freccia = false, onClick = if (d.idFile.isNotBlank()) ({ apri(d.idFile, d.nomeDaScaricare, d.mime) }) else null)
                    // Fase 8 (fase8.md §6.3): una riga calma su come è stato letto il file per la ricerca dentro i file.
                    if (d.idFile.isNotBlank()) {
                        val lettura = rememberLettura("lettura-${d.idFile}", 0) { dati.fase8.letturaFile(d.idFile) }
                        (lettura as? Lettura.Pronta)?.dato?.frase?.takeIf { it.isNotBlank() }?.let { Text(it, style = Testi.secondario, color = c.tenue) }
                    }
                }
                if (d.versioni.isNotEmpty()) Sezione5("Revisioni", d.versioni.size) {
                    SchedaElenco {
                        d.versioni.forEachIndexed { i, v ->
                            if (i > 0) LineaElenco()
                            RigaVoce("rev. ${v.numero}" + if (v.nota.isNotBlank()) " · ${v.nota}" else "",
                                sotto = listOf(v.caricataDa, quandoCorto(v.caricataIl), v.motivoRifiuto).filter { it.isNotBlank() }.joinToString(" · "),
                                icona = Icone.documento, fine = { Parola5(v.statoVisto) }, onClick = { apri(v.idFile, v.nomeDaScaricare, v.mime) })
                        }
                    }
                }
                if (scrive && d.origine == "file" && !d.archiviato) PulsanteBordo("Carica una revisione", { revisione = true }, Modifier.fillMaxWidth(), icona = Icone.importa)
            }

            Sezione5("A cosa è legato") {
                SchedaElenco {
                    if (d.idCliente.isNotBlank()) RigaVoce(d.cliente, sotto = "Cliente", inizio = { Iniziali(d.cliente, dimensione = 40.dp) }, onClick = { nav.vai("cliente/${d.idCliente}") })
                    else RigaVoce("Studio Tecnico GM", sotto = "Documento dello studio", icona = Icone.ufficio, freccia = false)
                    if (d.idCommessa.isNotBlank()) { LineaElenco(); RigaVoce(d.commessa.ifBlank { d.idCommessa }, sotto = "Commessa ${d.idCommessa}", icona = Icone.commesse, onClick = { nav.vai("commessa/${d.idCommessa}") }) }
                    if (d.idSede.isNotBlank()) { LineaElenco(); RigaVoce(d.impianto, sotto = "Impianto", icona = Icone.fulmine, onClick = { nav.vai("impianto/${d.idSede}") }) }
                    if (d.idTicket.isNotBlank()) { LineaElenco(); RigaVoce(d.ticket, sotto = "Ticket", icona = Icone.chiave, onClick = { nav.vai("ticket/${d.idTicket}") }) }
                    if (d.idContratto.isNotBlank()) { LineaElenco(); RigaVoce(d.contratto, sotto = "Contratto", icona = Icone.preventivo, onClick = { nav.vai("contratto-ca/${d.idContratto}") }) }
                }
            }
            d.scadenza?.let { s ->
                Sezione5("Scadenza") {
                    SchedaElenco {
                        RigaScadenza(Scadenza(s.id, d.titolo + " scade", data = s.data, statoVisto = s.statoVisto, ogniMesi = s.ogniMesi, cliente = d.cliente), null)
                        if (scrive && !s.statoVisto.startsWith("Fatta")) {
                            LineaElenco()
                            RigaVoce("Segna fatta", icona = Icone.spunta, freccia = false, onClick = {
                                if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO) else { dati.fase5.faiScadenza(s.id); avvisi.mostra("Fatta") }
                            })
                        }
                    }
                }
            }
            Sezione5("Condividi") {
                SchedaElenco {
                    val percorso = d.collegamentoTipo == "percorso"
                    RigaVoce("Manda per email", sotto = when { percorso -> "Un percorso del computer non si può mandare"; d.collegamento -> "Manda il collegamento"; else -> "Allegato, fino a 15 MB" },
                        icona = Icone.email, freccia = !percorso && scrive, onClick = if (!percorso && scrive) ({ manda = true }) else null)
                    LineaElenco()
                    val collegata = sessione.interfaccia.condivisioneCollegata
                    RigaVoce("Link che scade", sotto = "Per i clienti, fra 14 giorni", icona = Icone.link, freccia = false,
                        fine = { if (!collegata) PillolaNonCollegato() },
                        onClick = if (collegata && scrive && !d.collegamento) ({
                            scope.launch {
                                dati.fase5.condividi(d.id, d.cliente.ifBlank { "Cliente" }, null).onSuccess { copiaTesto(ctx, d.titolo, it, avvisi); avvisi.mostra("Link copiato: vale 14 giorni") }
                                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Il link non è stato creato")) }
                            }
                        }) else null)
                }
            }
            Sezione5("Cronologia") { Cronologia(d.cronologia) }
        }
        // ---- UN giallo: Approva per chi approva; altrimenti Apri.
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            when {
                attesa != null && d.puoApprovare -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    PulsanteBordo("Respingi", { respingi = true }, altezza = 64.dp)
                    PulsantePrincipale("Approva la rev. ${attesa.numero}", {
                        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
                        scope.launch {
                            dati.fase5.approva(attesa.id).onSuccess {
                                giro++; Giri5.documenti++
                                avvisi.mostra("rev. ${attesa.numero} approvata: ora è la valida") { scope.launch { dati.fase5.annullaDecisione(attesa.id).onSuccess { giro++ } } }
                            }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata approvata: riprova")) }
                        }
                    }, Modifier.weight(1f), icona = Icone.spunta)
                }
                d.collegamento && Collegamenti.apriCon(d.collegamentoTipo) != null ->
                    PulsantePrincipale(Collegamenti.apriCon(d.collegamentoTipo)!!, { apriIndirizzo5(ctx, d.url, avvisi) }, icona = Icone.link)
                d.collegamento -> Text("Si apre dal computer dello studio", style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                d.idFile.isNotBlank() -> PulsantePrincipale("Apri", { apri(d.idFile, d.nomeDaScaricare, d.mime) }, icona = Icone.occhio)
            }
        }
    }

    d?.let { doc -> FoglioPubblicaSe(dati, pubblicaDoc, "documento", doc.id, doc.idCliente, doc.cliente) { pubblicaDoc = false } }
    if (menu) FoglioDalBasso({ menu = false }) {
        Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
        if (scrive && d.puoScrivere && !d.archiviato) VoceMenu(Icone.matita, "Cambia", { menu = false; cambia = true })
        // Fase 7 (§12.6): Pubblica nel portale (mai riservati, collegamenti, archiviati; il cliente del documento).
        if (d.idCliente.isNotBlank()) VociPortale(dati, d.portale, eu.stgm.wisper.rapportino.InCoda7.portaleInCoda("documento", d.id, d.portale?.id.orEmpty(), opsDoc),
            puoPubblicare = !d.archiviato && !d.collegamento && d.vede != "riservati", onPubblica = { pubblicaDoc = true }, onFatto = { menu = false })
        if (d.idFile.isNotBlank()) {
            if (tenuto) VoceMenu(Icone.cestino, "Non tenere più sul telefono", { menu = false; dati.fase5.nonTenere(d.idFile); tenuto = false; avvisi.mostra("Tolto dal telefono") })
            else VoceMenu(Icone.scarica, "Tieni sul telefono", {
                menu = false
                scope.launch { dati.fase5.tieni(d.idFile, d.nomeDaScaricare).onSuccess { tenuto = true; avvisi.mostra("Tenuto sul telefono: si apre anche senza rete") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è scaricato: riprova")) } }
            })
            VoceMenu(Icone.condividi, "Scarica e condividi", {
                menu = false
                scope.launch { dati.fase5.fileDaAprire(d.idFile, d.nomeDaScaricare).onSuccess { Stampa.condividi(ctx, it, d.titolo, d.mime.ifBlank { mimeDaNome(d.nomeDaScaricare) }) }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non si è scaricato")) } }
            })
        }
        d.versioni.firstOrNull { it.puoTogliere }?.let { v ->
            VoceMenu(Icone.indietroStato, "Togli la mia rev. ${v.numero}", {
                menu = false
                scope.launch { dati.fase5.togliVersione(v.id).onSuccess { giro++; avvisi.mostra("rev. ${v.numero} tolta") { scope.launch { dati.fase5.togliVersione(v.id, annulla = true).onSuccess { giro++ } } } }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata tolta")) } }
            })
        }
        if (scrive && d.puoScrivere) VoceMenu(Icone.cartella, if (d.archiviato) "Togli dall'archiviati" else "Archivia", { menu = false; archivia = if (d.archiviato) "rimetti" else "archivia" })
    }
    if (respingi) attesa?.let { v ->
        FoglioMotivo("Respingi la rev. ${v.numero}", "Manca la sezione del trasformatore di riserva", "Respingi", onChiudi = { respingi = false }) { m ->
            respingi = false
            scope.launch { dati.fase5.respingi(v.id, m).onSuccess { giro++; Giri5.documenti++; avvisi.mostra("Respinta: il motivo arriva a ${v.caricataDa}") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata respinta: riprova")) } }
        }
    }
    if (manda) FoglioManda(dati, d, onChiudi = { manda = false }) { giro++ }
    if (revisione) FoglioRevisione(dati, d, onChiudi = { revisione = false }) { giro++; Giri5.documenti++ }
    if (cambia) FoglioCambiaDocumento(dati, d, onChiudi = { cambia = false }) { giro++; Giri5.documenti++ }
    archivia?.let { quale ->
        FoglioConferma(if (quale == "archivia") "Archiviare il documento?" else "Rimettere il documento?", if (quale == "archivia") "Esce dagli elenchi: si ritrova fra gli archiviati." else null,
            if (quale == "archivia") "Archivia" else "Rimetti", onConferma = {
                archivia = null
                scope.launch {
                    val r = dati.fase5.archivia(d.id, quale == "archivia")
                    val conf = r.exceptionOrNull()?.let(::daConfermare)
                    val fin = if (conf != null) dati.fase5.archivia(d.id, quale == "archivia", togliScadenza = false) else r
                    fin.onSuccess { avvisi.mostra(if (quale == "archivia") "Archiviato" else "Rimesso nell'archivio"); Giri5.documenti++; nav.indietro() }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è cambiato: riprova")) }
                }
            }, onAnnulla = { archivia = null })
    }
}

/** Manda per email (§5.8): a chi, il messaggio; per un collegamento la riga che avvisa. */
@Composable
private fun FoglioManda(dati: Dati, d: DocArchivio, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    // 06/11/2026: l'email già scritta è quella del cliente del documento (o della sua commessa), com'è adesso.
    var aScritto by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { if (!dati.esempio) dati.aggiorna() }
    val cliente = ana.cliente(d.idCliente) ?: ana.commessa(d.idCommessa)?.let { ana.cliente(it.idCliente) }
    val a = aScritto ?: cliente?.email.orEmpty()
    var messaggio by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var invio by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Manda per email", style = Testi.titoloScheda, color = c.testo)
        Text(d.titolo + (d.revisione?.let { " · rev. $it" } ?: "") + (peso(d.byte).takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""), style = Testi.secondarioGrande, color = c.tenue)
        CampoTesto(a, { aScritto = it; errore = null }, "A", tastiera = androidx.compose.ui.text.input.KeyboardType.Email, errore = errore)
        CampoTesto(messaggio, { messaggio = it }, "Messaggio", righe = 4)
        if (d.collegamento) Text("Il cliente lo apre solo se in ${d.collegamentoNome} è condiviso anche fuori dallo studio", style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.ambraTesto)
        PulsantePrincipale(if (invio) "Mando…" else "Manda", {
            if (a.isBlank()) { errore = "Manca l'indirizzo del cliente"; return@PulsantePrincipale }
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
            if (invio) return@PulsantePrincipale
            invio = true
            scope.launch {
                dati.fase5.invia(d.id, "", a, "", "", messaggio).onSuccess { onChiudi(); avvisi.mostra("Mandato a $a"); onFatto() }
                    .onFailure { errore = spiegaErrore2(it, "L'email non è partita") }
                invio = false
            }
        }, icona = Icone.invia, abilitato = !invio)
    }
}

/** Il file scelto per un documento o una revisione: fotocamera o dal telefono. */
private class FileScelto(val nome: String, val mime: String, val byte: ByteArray)

@Composable
private fun rememberSceltaFile(dati: Dati, onScelto: (FileScelto) -> Unit): Pair<() -> Unit, () -> Unit> {
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var scatto by rememberSaveable { mutableStateOf<String?>(null) }
    val fotocamera = rememberFotoSistema { ok ->
        val p = scatto ?: return@rememberFotoSistema
        scatto = null
        val f = File(p)
        if (!ok) { f.delete(); return@rememberFotoSistema }
        scope.launch {
            runCatching { dati.preparaFoto(Uri.fromFile(f)) }.onSuccess { r ->
                onScelto(FileScelto("Foto del " + dataIt(LocalDate.now().toString()).replace('/', '-') + ".jpg", "image/jpeg", withContext(Dispatchers.IO) { r.readBytes() }))
            }.onFailure { avvisi.mostra("La foto non si legge: riprova") }
            f.delete()
        }
    }
    val scegli = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { leggiFileScelto(ctx, uri) } }
                .onSuccess { (nome, mime, byte) -> onScelto(FileScelto(nome, mime, byte)) }
                .onFailure { avvisi.mostra(it.message ?: "Il file non si legge") }
        }
    }
    val foto = {
        if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO) else {
            val f = Immagini.fileScatto(ctx)
            scatto = f.path
            fotocamera.launch(FileProvider.getUriForFile(ctx, ctx.packageName + ".foto", f))
        }
    }
    val file = { if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO) else scegli.launch("*/*") }
    return foto to file
}

/** Carica una revisione (§5.2): il file e cosa cambia (obbligatorio dalla rev. 1). */
@Composable
private fun FoglioRevisione(dati: Dati, d: DocArchivio, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var scelto by remember { mutableStateOf<FileScelto?>(null) }
    var nota by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var invio by remember { mutableStateOf(false) }
    val idFile = remember { dati.fase5.nuovoIdFile() }
    val (foto, file) = rememberSceltaFile(dati) { scelto = it }
    FoglioDalBasso(onChiudi) {
        Text("Carica una revisione", style = Testi.titoloScheda, color = c.testo)
        val f = scelto
        if (f == null) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PulsanteBordo("Fotografa", foto, Modifier.weight(1f), icona = Icone.fotocamera)
            PulsanteBordo("Dal telefono", file, Modifier.weight(1f), icona = Icone.importa)
        } else RigaVoce(f.nome, sotto = peso(f.byte.size.toLong()), icona = Icone.documento, freccia = false, fine = { PulsanteTesto("Cambia", { scelto = null }) })
        CampoTesto(nota, { nota = it; errore = null }, "Cosa cambia", errore = errore)
        PulsantePrincipale(if (invio) "Carico…" else "Carica la revisione", {
            val x = scelto ?: run { errore = "Carica il file"; return@PulsantePrincipale }
            if (nota.isBlank()) { errore = "Scrivi cosa cambia in questa revisione"; return@PulsantePrincipale }
            if (invio) return@PulsantePrincipale
            invio = true
            scope.launch {
                dati.fase5.carica(x.nome, x.mime, x.byte, "documento", idFile).mapCatching { fc ->
                    dati.fase5.caricaVersione(d.id, fc.id, nota).getOrThrow()
                }.onSuccess { onChiudi(); avvisi.mostra(if (it.versioneDaApprovare != null) "Caricata: aspetta l'approvazione" else "Caricata: è la nuova valida"); onFatto() }
                    .onFailure { errore = spiegaErrore2(it, "La revisione non si è caricata: riprova") }
                invio = false
            }
        }, icona = Icone.importa, abilitato = !invio)
    }
}

/** Cambia (§16.5): titolo, categoria, riferimento, data, chi lo vede; per un collegamento l'indirizzo. */
@Composable
private fun FoglioCambiaDocumento(dati: Dati, d: DocArchivio, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val categorie = rememberLettura("categorie", 0) { dati.fase5.categorie() }
    var titolo by remember { mutableStateOf(d.titolo) }
    var idCategoria by remember { mutableStateOf(d.idCategoria) }
    var riferimento by remember { mutableStateOf(d.riferimento) }
    var url by remember { mutableStateOf(d.url) }
    var errore by remember { mutableStateOf<String?>(null) }
    FoglioDalBasso(onChiudi) {
        Text("Cambia il documento", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CampoTesto(titolo, { titolo = it }, "Titolo")
            (categorie as? Lettura.Pronta)?.dato?.filter { it.attiva && (!it.sistema || it.id == d.idCategoria || it.nome == "Da classificare") }?.let { cat ->
                Domanda("Categoria") { SceltePillole(cat.map { it.id to it.nome }, idCategoria, { idCategoria = it }) }
            }
            CampoTesto(riferimento, { riferimento = it }, "Riferimento", segnaposto = "DiCo 12/2026")
            if (d.collegamento) CampoTesto(url, { url = it; errore = null }, "Collegamento")
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        }
        PulsantePrincipale("Salva", {
            if (d.collegamento && Collegamenti.tipo(url) == null) { errore = Collegamenti.ERRORE; return@PulsantePrincipale }
            val o = JSONObject().put("id", PonteServer.idJson(d.id)).put("titolo", titolo.trim()).put("idCategoria", PonteServer.idJson(idCategoria)).put("riferimento", riferimento.trim())
            if (d.collegamento) o.put("url", url.trim())
            scope.launch { dati.fase5.salvaDocumento(o).onSuccess { onChiudi(); avvisi.mostra("Salvato"); onFatto() }.onFailure { errore = spiegaErrore2(it, "Non si è salvato: riprova") } }
        }, icona = Icone.spunta)
    }
}

// ---------------------------------------------------------------------------------- aggiungi un documento

/**
 * Aggiungi un documento (§12.3): Carica un file (Fotografa · Dal telefono, con /carica)
 * o Collega un file o una cartella (l'indirizzo con Incolla; la pillola del tipo mentre
 * si incolla); poi titolo, categoria, a cosa è legato, riferimento e data, scade, chi lo
 * vede. Dal Condividi di Android si arriva qui con l'indirizzo o il file già messo.
 */
@Composable
fun SchermataAggiungiDocumento(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val pronto = remember { RicordoDocumenti.preparato.also { RicordoDocumenti.preparato = null } }
    var modo by rememberSaveable { mutableStateOf(when { pronto?.url?.isNotBlank() == true -> "link"; pronto?.file != null -> "file"; else -> "" }) }
    var url by rememberSaveable { mutableStateOf(pronto?.url.orEmpty()) }
    var scelto by remember { mutableStateOf(pronto?.file?.let { FileScelto(it.nome, mimeDaNome(it.nome), it.byte) }) }
    var titolo by rememberSaveable { mutableStateOf(pronto?.file?.nome?.substringBeforeLast('.') ?: pronto?.url?.let { Collegamenti.titoloProposto(it) } ?: "") }
    var idCategoria by rememberSaveable { mutableStateOf("") }
    var idCliente by rememberSaveable { mutableStateOf(pronto?.idCliente ?: ana.sedi.firstOrNull { it.id == pronto?.idSede }?.idSoggetto ?: "") }
    var idCommessa by rememberSaveable { mutableStateOf(pronto?.idCommessa.orEmpty()) }
    var idSede by rememberSaveable { mutableStateOf(pronto?.idSede.orEmpty()) }
    val idTicket = pronto?.idTicket.orEmpty()
    val chiude = pronto?.chiudeScadenza.orEmpty()
    var cartella by rememberSaveable { mutableStateOf<Boolean?>(null) }
    var conRif by rememberSaveable { mutableStateOf(false) }
    var riferimento by rememberSaveable { mutableStateOf("") }
    var scade by rememberSaveable { mutableStateOf(false) }
    var scadeData by rememberSaveable { mutableStateOf(LocalDate.now().plusYears(1).toString()) }
    var scadeOgni by rememberSaveable { mutableStateOf(0) }
    var vede by rememberSaveable { mutableStateOf("") }
    var sceltaCliente by remember { mutableStateOf(false) }
    var sceltaCommessa by remember { mutableStateOf(false) }
    var giorno by remember { mutableStateOf(false) }
    var gia by remember { mutableStateOf<eu.stgm.wisper.rapportino.FileCaricato?>(null) }
    var chiudeScadenza by remember { mutableStateOf<Pair<String, Scadenza>?>(null) }
    var errore by remember { mutableStateOf<String?>(null) }
    var invio by remember { mutableStateOf(false) }
    val idFile = remember { dati.fase5.nuovoIdFile() }
    val categorie = rememberLettura("categorie", 0) { dati.fase5.categorie() }
    val lista: List<CategoriaDoc> = (categorie as? Lettura.Pronta)?.dato?.filter { it.attiva && (!it.sistema || it.nome == "Da classificare") }.orEmpty()
    LaunchedEffect(lista) { if (idCategoria.isBlank()) lista.firstOrNull { it.nome == (pronto?.categoria ?: "") }?.let { idCategoria = it.id } }
    val (foto, file) = rememberSceltaFile(dati) { f -> scelto = f; modo = "file"; if (titolo.isBlank()) titolo = f.nome.substringBeforeLast('.') }
    val tipo = if (modo == "link") Collegamenti.tipo(url) else null

    fun dopo(d: DocArchivio, s: Scadenza?) {
        Giri5.documenti++
        when {
            chiude.isNotBlank() -> scope.launch {
                dati.fase5.faiScadenzaSubito(chiude, LocalDate.now(), d.id).onSuccess { (_, prossima) -> avvisi.mostra("Salvato: la scadenza è fatta" + (prossima?.let { ", la prossima è il " + dataIt(it.data) } ?: "")) }
                    .onFailure { avvisi.mostra("Salvato. La scadenza non si è segnata: " + spiegaErrore2(it, "riprova dalla scadenza")) }
                nav.indietro(); nav.vai("documento/${d.id}")
            }
            s != null -> chiudeScadenza = d.id to s
            else -> { avvisi.mostra(if (d.collegamento) "Documento salvato: il file resta su ${d.collegamentoNome}" else "Documento salvato"); nav.indietro(); nav.vai("documento/${d.id}") }
        }
    }

    fun salva(ancheSeGia: Boolean = false) {
        errore = null
        if (modo.isBlank()) { errore = "Carica il file o incolla il collegamento"; return }
        if (modo == "link" && tipo == null) { errore = Collegamenti.ERRORE; return }
        if (modo == "file" && scelto == null) { errore = "Carica il file o incolla il collegamento"; return }
        if (titolo.isBlank()) { errore = "Titolo: scrivi di cosa si tratta"; return }
        if (idCategoria.isBlank()) { errore = "Categoria: scegli la categoria"; return }
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        if (invio) return
        invio = true
        scope.launch {
            val o = JSONObject().put("titolo", titolo.trim()).put("idCategoria", PonteServer.idJson(idCategoria))
            if (idCliente.isNotBlank()) o.put("idCliente", idCliente)
            if (idCommessa.isNotBlank()) o.put("idCommessa", idCommessa)
            if (idSede.isNotBlank()) o.put("idSede", PonteServer.idJson(idSede))
            if (idTicket.isNotBlank()) o.put("idTicket", PonteServer.idJson(idTicket))
            if (riferimento.isNotBlank()) o.put("riferimento", riferimento.trim())
            if (vede.isNotBlank()) o.put("vede", vede)
            if (scade) o.put("scadenza", JSONObject().put("data", scadeData).apply { if (scadeOgni > 0) put("ogniMesi", scadeOgni) })
            val r = if (modo == "link") {
                o.put("origine", "collegamento").put("url", url.trim())
                cartella?.let { o.put("cartella", it) }
                dati.fase5.salvaDocumento(o)
            } else {
                val x = scelto!!
                val caricato = gia ?: dati.fase5.carica(x.nome, x.mime, x.byte, "documento", idFile).getOrElse { e -> errore = spiegaErrore2(e, "Il file non si è caricato: riprova"); invio = false; return@launch }
                if (caricato.giaIdDocumento.isNotBlank() && !ancheSeGia) { gia = caricato; invio = false; return@launch }
                o.put("origine", "file").put("idFile", caricato.id)
                dati.fase5.salvaDocumento(o)
            }
            r.onSuccess { (d, s) -> dopo(d, s) }.onFailure { errore = spiegaErrore2(it, "Il documento non si è salvato: riprova") }
            invio = false
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Aggiungi un documento")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SceltaGrande("Carica un file", modo == "file", { modo = "file" }, sotto = "Fotografa o scegli", modifier = Modifier.weight(1f))
                SceltaGrande("Collega un file o una cartella", modo == "link", { modo = "link" }, sotto = "OneDrive, Drive, il computer", modifier = Modifier.weight(1f))
            }
            if (modo == "file") {
                val f = scelto
                if (f == null) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PulsanteBordo("Fotografa", foto, Modifier.weight(1f), icona = Icone.fotocamera)
                    PulsanteBordo("Dal telefono", file, Modifier.weight(1f), icona = Icone.importa)
                } else SchedaElenco { RigaVoce(f.nome, sotto = peso(f.byte.size.toLong()) + " · diventa la rev. 0", icona = Icone.documento, freccia = false, fine = { PulsanteTesto("Cambia", { scelto = null }) }) }
            }
            if (modo == "link") {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CampoTesto(url, { url = it; errore = null; if (titolo.isBlank()) titolo = Collegamenti.titoloProposto(it) }, "Collegamento", Modifier.weight(1f), segnaposto = "https://… o \\\\server\\cartella")
                    PulsanteBordo("Incolla", { val t = Collegamenti.daTestoCondiviso(testoAppunti(ctx)) ?: testoAppunti(ctx).trim(); url = t; if (titolo.isBlank()) titolo = Collegamenti.titoloProposto(t) }, altezza = 56.dp)
                }
                if (url.isNotBlank()) {
                    if (tipo != null) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Parola5(tipo.pillola, colore = ColoreFase5.BLU)
                        if (cartella ?: tipo.cartella) Parola5("Cartella", colore = ColoreFase5.GRIGIO)
                    } else Text(Collegamenti.ERRORE, style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.rossoTesto)
                    if (tipo != null) RigaSiNo("È una cartella", cartella ?: tipo.cartella) { cartella = it }
                }
            }
            RigaSfoglia(null)
            if (modo.isNotBlank()) {
                CampoTesto(titolo, { titolo = it; errore = null }, "Titolo")
                Domanda("Categoria") {
                    if (lista.isEmpty()) Segnaposto(48.dp) else SceltePillole(lista.map { it.id to it.nome }, idCategoria, { idCategoria = it; errore = null })
                }
                Domanda("A cosa è legato") {
                    SchedaElenco {
                        RigaVoce(ana.cliente(idCliente)?.nome ?: "Studio Tecnico GM", sotto = if (idCliente.isBlank()) "Documento dello studio" else "Cliente",
                            inizio = { Iniziali(ana.cliente(idCliente)?.nome ?: "GM", dimensione = 40.dp) }, freccia = false, fine = { PulsanteTesto("Cambia", { sceltaCliente = true }) })
                        LineaElenco()
                        RigaVoce(idCommessa.ifBlank { "Nessuna commessa" }, sotto = ana.commessa(idCommessa)?.descrizione, icona = Icone.commesse, freccia = false, fine = { PulsanteTesto(if (idCommessa.isBlank()) "Scegli" else "Cambia", { sceltaCommessa = true }) })
                        if (idCliente.isNotBlank()) {
                            LineaElenco()
                            Column(Modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Impianto", style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.tenue)
                                SceltePillole(ana.sediDi(idCliente).filter { it.impianto && !it.archiviata }.map { it.id to it.nome } + ("" to "Nessuno"), idSede, { idSede = it })
                            }
                        }
                    }
                }
                if (!conRif) PulsanteTesto("+ Riferimento e data", { conRif = true }) else CampoTesto(riferimento, { riferimento = it }, "Riferimento", segnaposto = "DiCo 12/2026")
                Domanda("Scade") {
                    SceltePillole(listOf(false to "No", true to "Sì"), scade, { scade = it })
                    if (scade) {
                        CampoDaScegliere("Quando", dataIt(scadeData), false, { giorno = true })
                        SceltePillole(listOf(0 to "Una volta", 12 to "Ogni anno", 24 to "Ogni 2 anni", 60 to "Ogni 5 anni"), scadeOgni, { scadeOgni = it })
                    }
                }
                Domanda("Chi lo vede") {
                    val opzioni = listOf("" to "Come la categoria", "tutti" to "Tutti", "costi" to "Chi vede i prezzi") + if (sessione.utente.ruolo == Ruoli.TITOLARE) listOf("riservati" to "Solo il titolare") else emptyList()
                    SceltePillole(opzioni, vede, { vede = it })
                }
            }
            errore?.let { Text(it, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.rossoTesto) }
        }
        if (modo.isNotBlank()) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (invio) "Salvo…" else "Salva il documento", { salva() }, icona = Icone.spunta, abilitato = !invio)
        }
    }
    if (sceltaCliente) FoglioSceltaCliente(ana, idCliente, { cl -> idCliente = cl?.id.orEmpty(); idSede = ""; if (cl == null) idCommessa = ""; sceltaCliente = false }, { sceltaCliente = false }, conNessuno = true)
    if (sceltaCommessa) FoglioSceltaCommessa(ana, idCommessa, { id -> idCommessa = id; ana.commessa(id)?.let { m -> idCliente = m.idCliente }; sceltaCommessa = false }, { sceltaCommessa = false })
    if (giorno) FinestraGiorno(LocalDate.parse(scadeData), { scadeData = it.toString() }, { giorno = false })
    gia?.let { g ->
        FoglioConferma("Questo file c'è già", "«${g.giaTitolo}» rev. ${g.giaRevisione ?: 0}. Lo carico lo stesso?", "Caricalo lo stesso",
            onConferma = { salva(ancheSeGia = true) }, onAnnulla = { gia = null })
    }
    chiudeScadenza?.let { (idDoc, s) ->
        FoglioDalBasso({ chiudeScadenza = null; nav.indietro(); nav.vai("documento/$idDoc") }) {
            Text("È la verifica che chiude la scadenza del ${dataIt(s.data)}?", style = Testi.titoloScheda, color = c.testo)
            Text(s.titolo, style = Testi.secondarioGrande, color = c.tenue)
            PulsantePrincipale("Sì, segna fatta", {
                scope.launch {
                    dati.fase5.faiScadenzaSubito(s.id, LocalDate.now(), idDoc).onSuccess { (_, p) -> avvisi.mostra("Fatta" + (p?.let { ": la prossima è il " + dataIt(it.data) } ?: "")) }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "La scadenza non si è segnata")) }
                    chiudeScadenza = null; nav.indietro(); nav.vai("documento/$idDoc")
                }
            }, icona = Icone.spunta)
            PulsanteTesto("No", { chiudeScadenza = null; nav.indietro(); nav.vai("documento/$idDoc") }, Modifier.fillMaxWidth(), colore = c.testo)
        }
    }
}

// ---------------------------------------------------------------------------------- l'archivio filtrato (cliente, commessa)

/**
 * I documenti di un cliente o di una commessa (§12.5): la cartella principale in cima
 * con Apri la cartella, poi i documenti e "Da Wisper"; Aggiungi un documento col bordo.
 */
@Composable
internal fun ArchivioFiltrato(dati: Dati, nav: Navigatore, filtro: FiltroArchivio) {
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(filtro, giro + Giri5.documenti * 1000) { dati.fase5.documenti(filtro) }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(90.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val e = lettura.dato
            val cartella = e.documenti.firstOrNull { it.principale && it.collegamento }
            if (cartella != null) Scheda(orizzontale = 16.dp, verticale = 14.dp) {
                RigaVoce(cartella.titolo, sotto = cartella.collegamentoNome, icona = Icone.cartella, freccia = false)
                if (cartella.collegamentoTipo == "percorso") Text("Si apre dal computer dello studio", style = Testi.secondario, color = W.colori.tenue)
                else PulsanteBordo("Apri la cartella", { apriIndirizzo5(ctx, cartella.url, avvisi) }, Modifier.fillMaxWidth(), icona = Icone.link, altezza = 48.dp)
            }
            val altri = e.documenti.filter { it != cartella }
            SchedaElenco {
                if (altri.isEmpty()) RigaCalma("Nessun documento.")
                altri.forEachIndexed { i, d -> if (i > 0) LineaElenco(); RigaDocumento(d) { nav.vai("documento/${d.id}") } }
            }
            if (e.daWisper.isNotEmpty()) Sezione5("Da Wisper", e.daWisper.size) { SchedaDaWisper(e.daWisper, nav, dati) }
        }
    }
    if (LocalPermessi.current.modifica(Moduli.DOCUMENTI)) PulsanteBordo("Aggiungi un documento", {
        RicordoDocumenti.preparato = DocumentoPreparato(idCliente = filtro.idCliente, idCommessa = filtro.idCommessa, idSede = filtro.idSede)
        nav.vai("documento-nuovo")
    }, Modifier.fillMaxWidth(), icona = Icone.piu, altezza = 48.dp)
}

// ---------------------------------------------------------------------------------- lettera e testi dei modelli

/**
 * Nuova lettera (§12.3): il modello, il cliente e l'impianto; il testo coi segnaposti
 * riempiti (quelli che mancano si vedono da completare); Crea il PDF (giallo) e Salva
 * nell'archivio. [idScadenza] quando si arriva da una verifica.
 */
@Composable
fun SchermataLettera(dati: Dati, nav: Navigatore, idScadenza: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val modelli = rememberLettura("modelli", 0) { dati.fase5.modelli() }
    var chiave by rememberSaveable { mutableStateOf("LETTERA_VERIFICA_TERRA") }
    var idCliente by rememberSaveable { mutableStateOf("") }
    var idSede by rememberSaveable { mutableStateOf("") }
    var testo by rememberSaveable { mutableStateOf("") }
    var titolo by rememberSaveable { mutableStateOf("") }
    var mancano by remember { mutableStateOf<List<String>>(emptyList()) }
    var sceltaCliente by remember { mutableStateOf(false) }
    var lavoro by remember { mutableStateOf<String?>(null) }
    // Dalla scadenza: cliente e impianto sono i suoi (prima di comporre il testo).
    var pronto by rememberSaveable { mutableStateOf(idScadenza.isBlank()) }
    LaunchedEffect(idScadenza) {
        if (!pronto) {
            dati.fase5.scadenze().getOrNull()?.tutte?.firstOrNull { it.id == idScadenza }?.let { s -> idCliente = s.idCliente; idSede = s.idSede }
            pronto = true
        }
    }
    LaunchedEffect(chiave, idCliente, idSede, pronto) {
        if (!pronto) return@LaunchedEffect
        dati.fase5.componi(chiave, mapOf("idCliente" to idCliente, "idSede" to idSede, "idScadenza" to idScadenza)).onSuccess { m ->
            testo = m.testo; titolo = m.titolo; mancano = m.mancano
            if (idCliente.isBlank()) m.valori["cliente"]?.let { nome -> ana.clienti.firstOrNull { it.nome == nome }?.let { idCliente = it.id } }
        }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il testo non si è preparato")) }
    }
    suspend fun pdf(): File {
        val nome = Stampa.nomeFile("Lettera", titolo.ifBlank { "lettera" } + " " + (ana.cliente(idCliente)?.nome ?: ""))
        val modello = JSONObject().put("titolo", titolo).put("testo", testo).put("cliente", JSONObject().put("nome", ana.cliente(idCliente)?.nome.orEmpty()).put("righe", JSONArray(listOfNotNull(ana.cliente(idCliente)?.indirizzo?.takeIf { it.isNotBlank() })))).put("impianto", ana.sedi.firstOrNull { it.id == idSede }?.nome.orEmpty())
        return Stampa.documentoFase4(ctx, "lettera", modello, paginaLettera(titolo, testo, ana.ragioneSociale), nome, JSONObject(ana.impostazioni))
    }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 150.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Nuova lettera")
            (modelli as? Lettura.Pronta)?.dato?.lettere?.let { l -> SceltePillole(l.map { it.first to it.second.replace("Lettera ", "").replace("\"", "").replaceFirstChar { ch -> ch.uppercase() } }, chiave, { chiave = it }) }
            CampoDaScegliere("Cliente", ana.cliente(idCliente)?.nome ?: "Scegli il cliente", idCliente.isBlank(), { sceltaCliente = true })
            if (idCliente.isNotBlank()) SceltePillole(ana.sediDi(idCliente).filter { it.impianto }.map { it.id to it.nome } + ("" to "Nessun impianto"), idSede, { idSede = it })
            CampoTesto(titolo, { titolo = it }, "Titolo")
            CampoTesto(testo, { testo = it }, "Testo", righe = 10)
            val ancora = mancano.filter { testo.contains(it) }
            if (ancora.isNotEmpty()) Text("Manca: " + ancora.joinToString(", ") { it.trim('{', '}').replace('_', ' ') } + ". Scrivilo nella lettera o nel cliente.", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(lavoro ?: "Crea il PDF", {
                if (lavoro != null) return@PulsantePrincipale
                lavoro = "Preparo il PDF…"
                scope.launch {
                    runCatching { pdf() }.onSuccess { if (!Stampa.apri(ctx, it)) avvisi.mostra("PDF pronto: ${it.name}") }.onFailure { avvisi.mostra(it.message ?: "Il PDF non si è fatto") }
                    lavoro = null
                }
            }, icona = Icone.pdf)
            if (LocalPermessi.current.modifica(Moduli.DOCUMENTI)) PulsanteTesto("Salva nell'archivio", {
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsanteTesto }
                if (lavoro != null) return@PulsanteTesto
                lavoro = "Salvo…"
                scope.launch {
                    runCatching {
                        val f = pdf()
                        val cat = dati.fase5.categorie().getOrThrow().firstOrNull { it.nome == "Corrispondenza" }?.id.orEmpty()
                        val caricato = dati.fase5.carica(f.name, "application/pdf", f.readBytes()).getOrThrow()
                        val o = JSONObject().put("origine", "file").put("idFile", caricato.id).put("titolo", f.nameWithoutExtension).put("idCategoria", PonteServer.idJson(cat))
                        if (idCliente.isNotBlank()) o.put("idCliente", idCliente)
                        if (idSede.isNotBlank()) o.put("idSede", PonteServer.idJson(idSede))
                        dati.fase5.salvaDocumento(o).getOrThrow()
                    }.onSuccess { avvisi.mostra("Salvata in Corrispondenza"); Giri5.documenti++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è salvata: riprova")) }
                    lavoro = null
                }
            }, Modifier.fillMaxWidth(), colore = c.testo2)
        }
    }
    if (sceltaCliente) FoglioSceltaCliente(ana, idCliente, { cl -> idCliente = cl?.id.orEmpty(); idSede = ""; sceltaCliente = false }, { sceltaCliente = false })
}

/** La lettera scritta dal telefono, finché pc/ui/documenti.js non ha il suo modello `lettera`. */
internal fun paginaLettera(titolo: String, testo: String, studio: String): String {
    fun h(t: String) = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return "<div style=\"font-family:Figtree,sans-serif;color:#1B1B1F;padding:48px 56px;font-size:12pt;line-height:1.5\">" +
        "<div style=\"font-weight:800;font-size:14pt\">${h(studio)}</div><div style=\"height:40px\"></div>" +
        "<div style=\"font-weight:800;font-size:13pt;margin-bottom:18px\">${h(titolo)}</div>" +
        testo.split("\n").joinToString("") { "<p style=\"margin:0 0 8px\">${h(it).ifBlank { "&nbsp;" }}</p>" } + "</div>"
}

/** I testi di un modello di Wisper (§12.3, solo amministrazione): ognuno col suo Salva, i segnaposti da toccare. */
@Composable
fun SchermataTestiModello(dati: Dati, nav: Navigatore, chiave: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(chiave, giro) { dati.fase5.modelli() }
    Column(Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TestataInterna({ nav.indietro() })
        when (lettura) {
            is Lettura.InCorso -> Segnaposto(200.dp)
            is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
            is Lettura.Pronta -> {
                val m = lettura.dato.wisper.firstOrNull { it.chiave == chiave }
                TitoloPagina("Testi: " + (m?.nome ?: chiave))
                if (m == null || m.testi.isEmpty()) RigaCalma("Questo modello non ha testi da cambiare.")
                m?.testi?.forEach { t ->
                    var valore by remember(t.chiave, t.testo) { mutableStateOf(t.testo) }
                    Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 10.dp) {
                        CampoTesto(valore, { valore = it }, t.nome, righe = if (t.chiave.endsWith("OGGETTO")) 1 else 5)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            t.segnaposti.ifEmpty { lettura.dato.segnaposti.take(10) }.forEach { p ->
                                Pillola("{$p}", false, { valore = valore + "{$p}" }, altezza = 44.dp)
                            }
                        }
                        PulsanteBordo("Salva", {
                            scope.launch { dati.fase5.salvaTestoModello(t.chiave, valore).onSuccess { avvisi.mostra("Salvato: vale per i documenti nuovi"); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è salvato")) } }
                        }, Modifier.fillMaxWidth(), altezza = 48.dp)
                    }
                }
            }
        }
    }
}

@Suppress("unused")
private val formaRiga = RoundedCornerShape(16.dp)

@Composable
@Suppress("unused")
private fun Vuoto() = Box(Modifier.clip(formaRiga))
