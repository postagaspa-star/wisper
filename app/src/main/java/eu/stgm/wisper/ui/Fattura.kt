@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ContoBanca
import eu.stgm.wisper.rapportino.Fattura
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Pacchetto
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.ProspettoPdf
import eu.stgm.wisper.rapportino.RegoleFattura
import eu.stgm.wisper.rapportino.RegoleFiscali
import eu.stgm.wisper.rapportino.RigaFattura
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.dataBreve
import eu.stgm.wisper.rapportino.dataDi
import eu.stgm.wisper.rapportino.dataIt
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

/*
 * La fattura sul telefono (fase4.md §13.2): la bozza con le righe e i conti del
 * server, il passaggio al programma (prospetto da copiare, XML da completare), la
 * fattura emessa con gli incassi, le note di credito. Un solo giallo secondo lo
 * stato; il resto nel menu ⋯.
 */

/** Le azioni che finiscono anche se la pagina se ne va (un salvataggio, l'Annulla). */
private val ambitoFattura = kotlinx.coroutines.MainScope()

@Composable
fun SchermataFattura(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val regole = RegoleFiscali.da(ana.impostazioni)
    val scriveModulo = scriveFatture()
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(id, giro + Giri7.portale * 100_000) { dati.fase4.fattura(id) }
    var f by remember(id) { mutableStateOf<Fattura?>(null) }
    LaunchedEffect(lettura) { (lettura as? Lettura.Pronta)?.dato?.let { f = it } }
    var menu by remember { mutableStateOf(false) }
    var riga by remember { mutableStateOf<Int?>(null) }
    var nuovaRiga by remember { mutableStateOf(false) }
    var dettagli by remember { mutableStateOf(false) }
    var incasso by remember { mutableStateOf(false) }
    var nota by remember { mutableStateOf(false) }
    var emessaAMano by remember { mutableStateOf(false) }
    var scarta by remember { mutableStateOf<String?>(null) }
    var avviso by remember { mutableStateOf<File?>(null) }
    var lavoro by remember { mutableStateOf(false) }

    fun ricarica() { giro++; RicordoFatture.giro++ }

    /** Salva le righe (l'elenco intero, nell'ordine) e gli altri campi: i conti tornano dal server. */
    fun salva(campi: JSONObject, cosa: String) {
        val x = f ?: return
        lavoro = true
        ambitoFattura.launch {
            dati.fase4.salvaFattura(campi.put("id", PonteServer.idJson(x.id)))
                .onSuccess { (nuova, liberate) ->
                    f = nuova
                    RicordoFatture.giro++
                    avvisi.mostra(if (liberate.isNotEmpty()) "Tornano da fatturare: " + liberate.joinToString(", ") else cosa)
                }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata salvata: riprova")) }
            lavoro = false
        }
    }

    fun righeJson(righe: List<RigaFattura>) = JSONArray().apply { righe.filter { !it.bollo }.forEach { put(it.perSalvare()) } }

    val x = f
    if (x == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() })
            when (lettura) {
                is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
                else -> { Segnaposto(120.dp); Segnaposto(240.dp) }
            }
        }
        return
    }
    val scrive = scriveModulo && x.puoScrivere
    // Fase 7
    var pubblica7 by remember { mutableStateOf(false) }
    var nonSollecitare by remember { mutableStateOf(false) }
    val ops7 by dati.operazioni.collectAsStateWithLifecycle()
    val allegaCopia = rememberAllegaCopia(dati, x) { ricarica() }
    val modificabile = scrive && x.modificabile && x.bozza

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }) { PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PillolaStato4(x.statoVisto)
                    if (x.nota) PillolaStato4("Nota di credito")
                }
                Text(
                    when {
                        x.bozza -> (if (x.nota) "Nota in bozza per " else "Bozza per ") + x.cliente
                        x.pronta -> (if (x.nota) "Nota pronta per " else "Pronta per ") + x.cliente
                        x.nota -> "Nota di credito " + x.numero
                        else -> "Fattura " + x.numero
                    },
                    style = Testi.titoloPagina.copy(fontSize = 26.sp(), lineHeight = 31.sp()), color = c.testo,
                )
                Text(
                    listOf("Rif. ${x.riferimento}", if (x.numero.isNotBlank() && !(x.bozza || x.pronta)) x.cliente else "", giornoDi(x.data)).filter { it.isNotBlank() }.joinToString(" · "),
                    style = Testi.secondarioGrande, color = c.tenue,
                )
                if (x.fatturaCollegata.isNotBlank()) Text("Corregge la fattura " + x.fatturaCollegata, style = Testi.secondarioGrande, color = c.tenue)
            }
            PassiFattura(x)
            if (x.bozza && !regole.confermate) FasciaRegole(null)
            x.avvisi.forEach { a ->
                val rosso = a.tipo == "scarto"
                Text(
                    a.testo, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = if (rosso) c.rossoTesto else c.gialloTesto,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (rosso) c.rossoTenue else c.gialloTenue).padding(12.dp),
                )
            }
            // Correzioni del 22/10/2026: soldi già incassati da restituire o compensare dopo una nota di credito.
            x.daRestituire?.takeIf { it > 0.005 }?.let { d ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.rossoTenue).padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(Icone.avviso, null, tint = c.rossoTesto, modifier = Modifier.size(20.dp))
                    Text(euro(d) + " da restituire o compensare", style = Testi.forte, color = c.rossoTesto, modifier = Modifier.weight(1f))
                }
            }
            if (x.mancano.isNotEmpty() && x.bozza) {
                Scheda(orizzontale = 16.dp, verticale = 12.dp, spazio = 4.dp) {
                    Text("Prima di passarla al programma manca", style = Testi.forte, color = c.testo)
                    x.mancano.forEach { Text(it.testo, style = Testi.secondario, color = c.gialloTesto) }
                }
            }

            // Le righe: tocco = foglio della riga (solo in bozza).
            TitoloSezione("Righe", Testo.quanti(x.righe.count { !it.bollo }, "riga", "righe"))
            SchedaElenco {
                if (x.righe.isEmpty()) RigaCalma("Nessuna riga")
                x.righe.forEachIndexed { i, r ->
                    if (i > 0) LineaElenco()
                    RigaDellaFattura(r, onClick = if (modificabile && !r.bollo) ({ riga = i }) else null)
                }
                if (modificabile) {
                    LineaElenco()
                    PulsanteTesto("Aggiungi una riga", { nuovaRiga = true }, Modifier.fillMaxWidth())
                }
            }

            x.conti?.let { k ->
                Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                    ContiDellaFattura(k, x.parametri, x.regoleConfermate || (x.bozza && regole.confermate), nota = x.nota)
                    if (x.totaleBozza != null && x.totaleBozza != k.totale) Text("La bozza diceva " + euro(x.totaleBozza), style = Testi.secondario, color = c.tenue)
                }
            }

            // Scadenza e conto: in bozza si cambiano (con data, causale e ritenuta).
            Scheda(orizzontale = 16.dp, verticale = 12.dp, spazio = 4.dp) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).let { if (modificabile) it.clickable { dettagli = true } else it },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        val sc = x.scadenze
                        Text(
                            if (sc.size > 1) "${sc.size} rate, la prima il ${dataBreve(sc.first().data)}" else "Scadenza " + (sc.firstOrNull()?.data?.let(::dataBreve) ?: "da calcolare"),
                            style = Testi.forte, color = c.testo,
                        )
                        Text("bonifico" + if (x.conto.isNotBlank()) " su ${x.conto}" else "", style = Testi.secondario, color = c.tenue)
                        if (x.causale.isNotBlank()) Text(x.causale, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    if (modificabile) Text("Cambia", style = Testi.pulsanteSecondario, color = c.gialloTesto)
                }
            }

            if (x.incassi.isNotEmpty() || (x.emessa && !x.nota)) {
                TitoloSezione(if (x.nota) "Rimborsi" else "Incassi")
                SchedaElenco {
                    if (x.incassi.isEmpty()) RigaCalma("Nessun incasso segnato")
                    x.incassi.forEachIndexed { i, inc ->
                        if (i > 0) LineaElenco()
                        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(dataIt(inc.data), style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                                Text(inc.conto, style = Testi.secondario, color = c.tenue)
                            }
                            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(euro(inc.importo), style = Testi.forte, color = c.testo)
                                if (inc.verificato) Pillolina("Verificato in banca", c.firmatoTesto, c.firmatoFondo) else Pillolina("Registrato", c.inviatoTesto, c.inviatoFondo)
                            }
                        }
                    }
                }
                if ((x.residuo ?: 0.0) > 0 && !x.nota) Text("Restano " + euro(x.residuo), style = Testi.forte, color = if (x.scaduta) c.rossoTesto else c.testo)
            }
            // Fase 7 (§12.6): nel portale, la copia di cortesia, il promemoria di pagamento.
            BloccoFatturaPortale(dati, x)
            if (x.note.isNotEmpty()) {
                TitoloSezione("Note di credito")
                SchedaElenco {
                    x.note.forEachIndexed { i, n ->
                        if (i > 0) LineaElenco()
                        RigaVoce("Nota di credito " + n.numero.ifBlank { "in bozza" }, sotto = dataIt(n.data), valore = euro(n.netto), onClick = { nav.vai("fattura/${n.id}") })
                    }
                }
            }
            if (x.file != null) RigaVoce("XML emesso", sotto = x.file.nome, icona = Icone.cartella, onClick = {
                scope.launch { dati.fase4.fileEmesso(x.file).onSuccess { condividiFile(ctx, it, x.file.nome, "application/octet-stream") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non si è scaricato: riprova")) } }
            })
            Scheda(orizzontale = 16.dp, verticale = 6.dp, spazio = 0.dp) { RigaNonCollegato("Invio allo SDI") }
            if (x.pronta && x.prontaIl.isNotBlank()) Text("Passata al programma il " + dataBreve(x.prontaIl), style = Testi.secondarioGrande, color = c.tenue)
        }

        // Un solo giallo, secondo lo stato (§13.2).
        if (scrive) {
            val giallo: Pair<String, () -> Unit>? = when {
                x.bozza -> "Passa al programma" to { nav.vai("fattura-passa/${x.id}") }
                x.pronta -> "Importa l'XML emesso" to { nav.vai("fatture-importa") }
                x.emessa && !x.nota && (x.residuo ?: 0.0) > 0 -> "Segna un incasso" to { incasso = true }
                else -> null
            }
            if (giallo != null) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(giallo.first, giallo.second, abilitato = !lavoro, icona = if (x.emessa) Icone.piu else null)
            }
        }
    }

    // ---------------------------------------------------------------- fogli

    if (menu) {
        FoglioDalBasso({ menu = false }) {
            Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
            VoceMenu(Icone.pdf, "Prospetto (PDF)", { menu = false; nav.vai("fattura-passa/${x.id}") })
            if (scrive && (x.bozza || x.pronta) && !x.nota) VoceMenu(Icone.email, "Avviso di parcella per il cliente", {
                menu = false
                avvisi.mostra("Preparo l'avviso…")
                scope.launch {
                    dati.fase4.pacchetto(x.id).fold(
                        { p -> runCatching { Stampa.documentoFase4(ctx, "avvisoParcella", p.modello, ProspettoPdf.avviso(p.modello, ana.ragioneSociale, regole), "Avviso di parcella ${x.riferimento} ${x.cliente}",
                            org.json.JSONObject().put("oggi", LocalDate.now().toString())) } },
                        { Result.failure(it) },
                    ).onSuccess { avviso = it }.onFailure { avvisi.mostra(spiegaErrore2(it, "L'avviso non si è preparato: riprova")) }
                }
            })
            if (scrive && x.pronta) {
                VoceMenu(Icone.indietroStato, "Torna in bozza", {
                    menu = false
                    scope.launch {
                        dati.fase4.tornaInBozza(x.id).onSuccess { f = it; RicordoFatture.giro++; avvisi.mostra("Tornata in bozza") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è tornata in bozza: riprova")) }
                    }
                })
                VoceMenu(Icone.matita, "Segna emessa senza XML", { menu = false; emessaAMano = true })
            }
            if (scrive && x.emessa && !x.nota) VoceMenu(Icone.riapri, "Prepara una nota di credito", { menu = false; nota = true })
            // Fase 7 (§12.6): Allega la copia PDF, Pubblica nel portale, Non mandare promemoria.
            if (scrive && x.emessa) VoceMenu(Icone.pdf, "Allega la copia PDF", { menu = false; allegaCopia() })
            if (x.emessa || x.stato == "annullata") {
                val info = portaleDi(x)
                VociPortale(dati, info, eu.stgm.wisper.rapportino.InCoda7.portaleInCoda("fattura", x.id, info?.id.orEmpty(), ops7), puoPubblicare = x.idCliente.isNotBlank(), onPubblica = { pubblica7 = true }, onFatto = { menu = false })
            }
            if (x.emessa && !x.nota && vedePagamenti() && scrive) VoceMenu(Icone.chiudi, "Non mandare promemoria", { menu = false; nonSollecitare = true })
            if (scrive && (x.bozza || x.pronta)) VoceMenu(Icone.cestino, if (x.bozza) "Scarta la bozza" else "Scarta", { menu = false; scarta = "" }, pericolo = true)
        }
    }

    FoglioPubblicaSe(dati, pubblica7, "fattura", x.id, x.idCliente, x.cliente) { pubblica7 = false; ricarica() }
    if (nonSollecitare) FoglioNonSollecitare(dati, x) { fatto -> nonSollecitare = false; if (fatto) ricarica() }

    riga?.let { i ->
        val r = x.righe.getOrNull(i) ?: return@let
        FoglioRiga(
            riga = r, fattura = x, impostazioni = ana.impostazioni, posizione = x.righe.filter { !it.bollo }.indexOf(r), quante = x.righe.count { !it.bollo },
            onChiudi = { riga = null },
            onSalva = { nuova -> riga = null; salva(JSONObject().put("righe", righeJson(x.righe.map { if (it === r) nuova else it })), "Riga salvata") },
            onSposta = { su ->
                val libere = x.righe.filter { !it.bollo }.toMutableList()
                val p = libere.indexOf(r)
                val q = if (su) p - 1 else p + 1
                if (q in libere.indices) {
                    libere.add(q, libere.removeAt(p))
                    riga = null
                    salva(JSONObject().put("righe", righeJson(libere)), "Ordine delle righe salvato")
                }
            },
            onTogli = { riga = null; salva(JSONObject().put("righe", righeJson(x.righe.filter { it !== r && (r.gruppo.isBlank() || it.gruppo != r.gruppo) })), "Riga tolta") },
        )
    }
    if (nuovaRiga) FoglioRiga(
        riga = RigaFattura(id = PonteServer.NUOVO + System.nanoTime(), quantita = 1.0), fattura = x, impostazioni = ana.impostazioni, posizione = -1, quante = 0,
        onChiudi = { nuovaRiga = false },
        onSalva = { nuova -> nuovaRiga = false; salva(JSONObject().put("righe", righeJson(x.righe + nuova)), "Riga aggiunta") },
        onSposta = {}, onTogli = { nuovaRiga = false },
    )
    if (dettagli) FoglioDettagliBozza(dati, x, onChiudi = { dettagli = false }) { campi -> dettagli = false; salva(campi, "Salvato") }
    if (incasso) FoglioSegnaSoldi(
        dati, "Segna un incasso", x.cliente + " · " + x.etichetta, x.residuo ?: 0.0, entrata = true,
        onChiudi = { incasso = false },
        onSegna = { imp, data, conto, ver -> dati.fase4.segnaIncasso(x.id, imp, data, conto, ver).map { (m, nuova) -> nuova?.let { f = it }; RicordoFatture.giro++; m.id } },
        onFatto = { ricarica() },
    )
    if (nota) FoglioNotaCredito(dati, x, onChiudi = { nota = false }) { n -> nota = false; nav.vai("fattura/${n.id}") }
    if (emessaAMano) FoglioSegnaEmessa(dati, x, onChiudi = { emessaAMano = false }) { nuova -> emessaAMano = false; f = nuova; RicordoFatture.giro++ }
    scarta?.let { domanda ->
        FoglioConferma(
            if (x.bozza) "Scartare la bozza ${x.riferimento}?" else "Scartare la ${x.riferimento}?",
            domanda.ifBlank { "Le cose che ha dentro tornano da fatturare." },
            "Scarta", pericolo = true,
            onConferma = {
                val conferma = domanda.isNotBlank()
                scarta = null
                scope.launch {
                    dati.fase4.scartaFattura(x.id, "", conferma)
                        .onSuccess { RicordoFatture.giro++; avvisi.mostra("Scartata: le sue cose tornano da fatturare"); nav.indietro() }
                        .onFailure { e -> daConfermare(e)?.let { scarta = it.message.orEmpty() } ?: avvisi.mostra(spiegaErrore2(e, "Non è stata scartata: riprova")) }
                }
            },
            onAnnulla = { scarta = null },
        )
    }
    avviso?.let { pdf -> FoglioAvvisoParcella(dati, x, pdf, ana.cliente(x.idCliente)?.email.orEmpty(), onChiudi = { avviso = null }) { avviso = null; giro++ } }
}

private fun Int.sp() = androidx.compose.ui.unit.TextUnit(this.toFloat(), androidx.compose.ui.unit.TextUnitType.Sp)

/** I passi Bozza → Pronta → Emessa → Pagata, con quello di adesso in nero. */
@Composable
private fun PassiFattura(x: Fattura) {
    val c = W.colori
    val passi = listOf("Bozza", "Pronta", "Emessa", if (x.nota) "Stornata" else "Pagata")
    val adesso = when {
        x.stato == "scartata" || x.stato == "annullata" -> -1
        x.bozza -> 0
        x.pronta -> 1
        x.emessa && (x.pagata || x.nota) -> 3
        x.emessa -> 2
        else -> -1
    }
    if (adesso < 0) return
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        passi.forEachIndexed { i, p ->
            Text(
                p, style = Testi.piccolo.copy(fontWeight = if (i == adesso) FontWeight.ExtraBold else FontWeight.SemiBold),
                color = when { i == adesso -> c.scheda; i < adesso -> c.testo; else -> c.moltoTenue },
                modifier = Modifier.clip(RoundedCornerShape(50)).background(if (i == adesso) c.testo else c.superficie2).padding(horizontal = 10.dp, vertical = 5.dp),
            )
            if (i < passi.lastIndex) Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.size(14.dp))
        }
    }
}

/** Una riga della fattura: descrizione, quantità × prezzo, importo; "era 317,88" se cambiata. */
@Composable
private fun RigaDellaFattura(r: RigaFattura, onClick: (() -> Unit)?) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 60.dp).let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(r.descrizione, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo, maxLines = 3, overflow = TextOverflow.Ellipsis)
            val sotto = listOfNotNull(
                if ((r.quantita ?: 1.0) != 1.0 || r.unita.isNotBlank()) Numeri.scrivi(r.quantita ?: 1.0) + (if (r.unita.isNotBlank()) " " + r.unita else "") + " × " + euro(r.prezzo) else null,
                if (r.prezzo == null && !r.bollo) "senza prezzo" else null,
                if (r.cambiata) "era " + euro(r.importoSorgenti).removeSuffix(" €") else null,
            ).joinToString(" · ")
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondario, color = c.tenue)
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(euro(r.importo), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
            if (r.tipo == "anticipazione" || r.bollo) Pillolina("Senza IVA", c.fatturatoTesto, c.fatturatoFondo)
        }
    }
}

/**
 * Il foglio di una riga della bozza: descrizione, quantità, unità, prezzo (righe
 * libere anche il tipo), l'anteprima dei conti con [RegoleFattura], Sposta su/giù,
 * Togli dalla bozza (con quello che torna da fatturare).
 */
@Composable
private fun FoglioRiga(
    riga: RigaFattura,
    fattura: Fattura,
    impostazioni: Map<String, String>,
    posizione: Int,
    quante: Int,
    onChiudi: () -> Unit,
    onSalva: (RigaFattura) -> Unit,
    onSposta: (Boolean) -> Unit,
    onTogli: () -> Unit,
) {
    val c = W.colori
    val nuova = posizione < 0
    var descrizione by remember { mutableStateOf(riga.descrizione) }
    var quantita by remember { mutableStateOf(Numeri.scrivi(riga.quantita ?: 1.0)) }
    var unita by remember { mutableStateOf(riga.unita) }
    var prezzo by remember { mutableStateOf(importoNelCampo(riga.prezzo)) }
    var tipo by remember { mutableStateOf(riga.tipo) }
    var togli by remember { mutableStateOf(false) }
    var provato by remember { mutableStateOf(false) }
    val q = Numeri.leggi(quantita)
    val p = Numeri.leggi(prezzo)
    val modificata = riga.copy(descrizione = descrizione.trim(), quantita = q, unita = unita.trim(), prezzo = p, tipo = tipo)
    // L'anteprima: le righe con questa cambiata; quelle dei gruppi non toccate tengono il loro importo.
    val altre = fattura.righe.filter { !it.bollo && it !== riga }
    val conti = RegoleFattura.calcola(
        RegoleFattura.parametriDa(impostazioni, fattura.parametri.ritenuta).copy(
            ivaPercentuale = fattura.parametri.ivaPercentuale, eppiPercentuale = fattura.parametri.eppiPercentuale,
            ritenutaPercentuale = fattura.parametri.ritenutaPercentuale, regime = fattura.parametri.regime, bolloRivalsa = fattura.parametri.bolloRivalsa,
        ),
        altre.map { it.perConti(false) } + (if (q != riga.quantita || p != riga.prezzo || riga.gruppo.isBlank()) modificata.perConti(true) else modificata.perConti(false)),
    )
    val sorgenti = fattura.sorgenti.filter { it.attiva && riga.gruppo.isNotBlank() && it.gruppo == riga.gruppo }
    FoglioDalBasso(onChiudi) {
        Text(if (nuova) "Riga nuova" else "La riga", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (riga.gruppo.isBlank()) Segmenti(listOf("compenso" to "Compenso", "anticipazione" to "Spesa anticipata"), tipo, { tipo = it })
            CampoTesto(descrizione, { descrizione = it }, "Descrizione", Modifier.fillMaxWidth(), righe = 2, errore = if (provato && descrizione.isBlank()) "Scrivi la descrizione" else null)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CampoTesto(quantita, { quantita = it }, "Quantità", Modifier.weight(1f), tastiera = KeyboardType.Decimal, errore = if (quantita.isNotBlank() && (q == null || q < 0)) "Non va" else null)
                CampoTesto(unita, { unita = it }, "Unità", Modifier.weight(1f), segnaposto = "ore, km")
            }
            CampoTesto(prezzo, { prezzo = it }, "Prezzo", Modifier.fillMaxWidth(), tastiera = KeyboardType.Decimal, suffisso = "€", errore = if (prezzo.isNotBlank() && (p == null || p < 0)) "Non è un prezzo" else null)
            if (riga.importoSorgenti != null && riga.gruppo.isNotBlank()) Text("Nata da: " + euro(riga.importoSorgenti), style = Testi.secondario, color = c.tenue)
            Scheda(orizzontale = 14.dp, verticale = 10.dp, spazio = 2.dp) {
                RigaDato("Totale della fattura", euro(conti.totale))
                RigaDato("Netto da incassare", euro(conti.netto))
                Text("Anteprima: i conti li rifà il server quando salvi", style = Testi.piccolo, color = c.tenue)
            }
            if (!nuova && quante > 1) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (posizione > 0) PulsanteBordo("Sposta su", { onSposta(true) }, Modifier.weight(1f), icona = Icone.su, altezza = 48.dp)
                if (posizione < quante - 1) PulsanteBordo("Sposta giù", { onSposta(false) }, Modifier.weight(1f), icona = Icone.giu, altezza = 48.dp)
            }
        }
        PulsantePrincipale(if (nuova) "Aggiungi la riga" else "Salva la riga", {
            provato = true
            if (descrizione.isBlank() || (quantita.isNotBlank() && (q == null || q < 0)) || (prezzo.isNotBlank() && (p == null || p < 0))) return@PulsantePrincipale
            onSalva(modificata)
        }, altezza = 56.dp)
        if (!nuova) PulsanteTesto("Togli dalla bozza", { togli = true }, Modifier.fillMaxWidth(), colore = c.rossoTesto)
    }
    if (togli) FoglioConferma(
        "Togliere la riga?",
        if (sorgenti.isNotEmpty()) "Tornano da fatturare: " + riassuntoSorgenti(sorgenti) + (if (fattura.righe.count { it.gruppo == riga.gruppo } > 1) ". Esce anche il resto del suo gruppo." else ".")
        else "È una riga libera: si toglie e basta.",
        "Togli dalla bozza", pericolo = true,
        onConferma = { togli = false; onTogli() }, onAnnulla = { togli = false },
    )
}

/** "6 rapportini e 2 spese" quando sono tante, se no l'elenco (fase4.md §5.3: "Tornano da fatturare 6 rapportini di settembre"). */
internal fun riassuntoSorgenti(s: List<eu.stgm.wisper.rapportino.SorgenteFattura>): String {
    if (s.size <= 3) return s.joinToString(", ") { it.descrizione }
    val nomi = mapOf("rapportino" to ("rapportino" to "rapportini"), "spesa" to ("spesa" to "spese"), "ore" to ("riga di ore" to "righe di ore"), "scadenza" to ("scadenza" to "scadenze"))
    return s.groupBy { it.tipo }.map { (t, l) -> val (uno, tanti) = nomi[t] ?: (t to t); Testo.quanti(l.size, uno, tanti) }.let { p ->
        if (p.size > 1) p.dropLast(1).joinToString(", ") + " e " + p.last() else p.first()
    }
}

/** Data, scadenza, conto, causale e ritenuta della bozza. */
@Composable
private fun FoglioDettagliBozza(dati: Dati, x: Fattura, onChiudi: () -> Unit, onSalva: (JSONObject) -> Unit) {
    val c = W.colori
    var data by remember { mutableStateOf(dataDi(x.data) ?: LocalDate.now()) }
    var scadenza by remember { mutableStateOf(if (x.scadenzaAMano) x.scadenze.firstOrNull()?.data?.let(::dataDi) else null) }
    var conto by remember { mutableStateOf(x.idConto) }
    var conti by remember { mutableStateOf<List<ContoBanca>>(emptyList()) }
    var causale by remember { mutableStateOf(x.causale) }
    var ritenuta by remember { mutableStateOf(x.parametri.ritenuta) }
    LaunchedEffect(Unit) { dati.fase4.conti().onSuccess { conti = it.filter { k -> k.attivo } } }
    FoglioDalBasso(onChiudi) {
        Text("La bozza", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PulsanteData("Data proposta", data) { data = it }
            val sc = scadenza
            if (sc != null) {
                PulsanteData("Scadenza scritta a mano", sc) { scadenza = it }
                PulsanteTesto("Torna alla scadenza calcolata", { scadenza = null })
            } else {
                Text("Scadenza calcolata: " + (x.scadenze.firstOrNull()?.data?.let(::dataIt) ?: "dopo il salvataggio"), style = Testi.secondarioGrande, color = c.tenue)
                PulsanteTesto("Scrivila a mano", { scadenza = dataDi(x.scadenze.firstOrNull()?.data.orEmpty()) ?: LocalDate.now().plusDays(30) })
            }
            if (conti.size > 1) { Etichetta("Conto"); SceltaConto(conti, conto) { conto = it } }
            CampoTesto(causale, { causale = it }, "Causale", Modifier.fillMaxWidth(), righe = 2)
            RigaSiNo("Il cliente trattiene la ritenuta", ritenuta) { ritenuta = it }
        }
        PulsantePrincipale("Salva", {
            val o = JSONObject().put("data", data.toString()).put("causale", causale.trim()).put("ritenuta", ritenuta)
                .put("scadenza", scadenza?.toString() ?: JSONObject.NULL)
            if (conto.isNotBlank()) o.put("idConto", PonteServer.idJson(conto))
            onSalva(o)
        }, altezza = 56.dp)
    }
}

/** Prepara una nota di credito (§9.5): tutta, o le righe scelte con l'importo; il motivo è obbligatorio. */
@Composable
private fun FoglioNotaCredito(dati: Dati, x: Fattura, onChiudi: () -> Unit, onPronta: (Fattura) -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var tutta by remember { mutableStateOf(true) }
    var scelte by remember { mutableStateOf(mapOf<String, String>()) }
    var motivo by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val righe = x.righe.filter { !it.bollo }
    FoglioDalBasso(onChiudi) {
        Text("Nota di credito per la ${x.numero}", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Segmenti(listOf(true to "Tutta la fattura", false to "Righe scelte"), tutta, { tutta = it })
            if (!tutta) righe.forEach { r ->
                val scelta = r.id in scelte
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CasellaScelta(scelta, r.descrizione) { scelte = if (scelta) scelte - r.id else scelte + (r.id to importoNelCampo(r.importo)) }
                        Text(r.descrizione, style = Testi.secondarioGrande, color = c.testo, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(euro(r.importo), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                    }
                    if (scelta) CampoTesto(scelte[r.id].orEmpty(), { scelte = scelte + (r.id to it) }, "Quanto stornare", Modifier.fillMaxWidth(), tastiera = KeyboardType.Decimal, suffisso = "€")
                }
            }
            CampoTesto(motivo, { motivo = it; errore = null }, "Perché la correggi", Modifier.fillMaxWidth(), righe = 2)
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        }
        PulsantePrincipale(if (inCorso) "Preparo…" else "Prepara la nota", {
            if (inCorso) return@PulsantePrincipale
            if (motivo.isBlank()) { errore = "Motivo: scrivi perché la correggi"; return@PulsantePrincipale }
            if (!tutta && scelte.isEmpty()) { errore = "Scegli le righe da stornare, o tutta la fattura"; return@PulsantePrincipale }
            val importi = scelte.mapValues { (id, t) ->
                val n = importoScritto(t)
                val r = righe.first { it.id == id }
                if (n == null || Math.abs(n - r.importo) < 0.005) null else n
            }
            inCorso = true
            scope.launch {
                dati.fase4.preparaNotaCredito(x.id, tutta, importi, motivo)
                    .onSuccess { n ->
                        RicordoFatture.giro++
                        avvisi.mostra(if (n.tornanoDaFatturare.isNotEmpty()) "Nota in bozza: quando è emessa tornano da fatturare " + n.tornanoDaFatturare.joinToString(", ") else "Nota di credito in bozza")
                        onPronta(n)
                    }
                    .onFailure { errore = spiegaErrore2(it, "La nota non si è preparata: riprova") }
                inCorso = false
            }
        }, altezza = 56.dp, abilitato = !inCorso)
    }
}

/** Segna emessa senza XML: il numero lo scrive Manuel, mai proposto da Wisper; il server chiede conferma. */
@Composable
private fun FoglioSegnaEmessa(dati: Dati, x: Fattura, onChiudi: () -> Unit, onFatto: (Fattura) -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var numero by remember { mutableStateOf("") }
    var data by remember { mutableStateOf(dataDi(x.data) ?: LocalDate.now()) }
    var domanda by remember { mutableStateOf<String?>(null) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Segna emessa senza XML", style = Testi.titoloScheda, color = c.testo)
        CampoTesto(numero, { numero = it; errore = null; domanda = null }, "Numero dato dal programma", Modifier.fillMaxWidth(), segnaposto = "46/2026")
        PulsanteData("Data della fattura", data) { data = it; domanda = null }
        domanda?.let { Text(it, style = Testi.testo, color = c.gialloTesto) }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (inCorso) "Un momento…" else if (domanda != null) "Sì, segna emessa" else "Segna emessa", {
            if (inCorso) return@PulsantePrincipale
            if (numero.isBlank()) { errore = "Numero: scrivi il numero che ha dato il programma"; return@PulsantePrincipale }
            inCorso = true
            scope.launch {
                dati.fase4.segnaEmessa(x.id, numero, data, conferma = domanda != null)
                    .onSuccess { avvisi.mostra("Emessa: ${it.numero}"); onFatto(it) }
                    .onFailure { e -> daConfermare(e)?.let { domanda = it.message } ?: run { errore = spiegaErrore2(e, "Non è stata segnata: riprova") } }
                inCorso = false
            }
        }, altezza = 56.dp, abilitato = !inCorso)
    }
}

/** L'avviso di parcella: condividere il PDF o mandarlo dal postino (segna la data). */
@Composable
private fun FoglioAvvisoParcella(dati: Dati, x: Fattura, pdf: File, email: String, onChiudi: () -> Unit, onMandato: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    // 06/11/2026: l'email del cliente com'è adesso (arriva anche dopo, se le anagrafiche si rileggono); scritta a mano resta.
    var aScritto by remember { mutableStateOf<String?>(null) }
    val a = aScritto ?: email
    LaunchedEffect(Unit) { if (!dati.esempio) dati.aggiorna() }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Avviso di parcella", style = Testi.titoloScheda, color = c.testo)
        Text("Documento senza valore fiscale: la fattura si emette al pagamento", style = Testi.secondarioGrande, color = c.tenue)
        PulsanteBordo("Apri il PDF", { Stampa.apri(ctx, pdf) }, Modifier.fillMaxWidth(), icona = Icone.pdf)
        PulsanteBordo("Condividi il PDF", { Stampa.condividi(ctx, pdf, "Avviso di parcella ${x.riferimento}") }, Modifier.fillMaxWidth(), icona = Icone.condividi)
        CampoTesto(a, { aScritto = it.trim() }, "A", Modifier.fillMaxWidth(), tastiera = KeyboardType.Email)
        PulsantePrincipale(if (inCorso) "Mando…" else "Mandalo per email", {
            if (inCorso || !a.contains('@')) { if (!a.contains('@')) avvisi.mostra("Scrivi l'email del cliente"); return@PulsantePrincipale }
            inCorso = true
            scope.launch {
                dati.fase4.inviaAvviso(x.id, a, "Avviso di parcella", "Buongiorno,\nin allegato l'avviso di parcella. La fattura la emetto al pagamento.\n\nCordiali saluti", pdf)
                    .onSuccess { avvisi.mostra("Avviso mandato a $a"); onMandato() }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "L'avviso non è partito: guarda la posta inviata prima di riprovare")) }
                inCorso = false
            }
        }, altezza = 56.dp, abilitato = !inCorso)
    }
}

// ---------------------------------------------------------------------------------- passa al programma

/**
 * Passa al programma (§13.2, §15.6): cosa passi, il prospetto con Copia su ogni campo,
 * condividi il prospetto (PDF) e l'XML da completare (col nome che dice di non
 * inviarlo), Invio allo SDI · Non collegato, e il giallo "Segna come passata al
 * programma" (solo per una bozza). Per una pronta o un'emessa è il prospetto da rivedere.
 */
@Composable
fun SchermataPassa(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val appunti = LocalClipboardManager.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val regole = RegoleFiscali.da(ana.impostazioni)
    var giro by remember { mutableIntStateOf(0) }
    val fattura = rememberLettura(id, giro) { dati.fase4.fattura(id) }
    val pacchetto = rememberLettura(id, giro) { dati.fase4.pacchetto(id) }
    var domanda by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    var copiato by remember { mutableStateOf("") }
    val salvaXml = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/xml")) { uri ->
        val p = (pacchetto as? Lettura.Pronta)?.dato ?: return@rememberLauncherForActivityResult
        if (uri != null) runCatching {
            ctx.contentResolver.openOutputStream(uri)?.use { it.write(java.util.Base64.getMimeDecoder().decode(p.xmlBase64)) }
        }.onSuccess { avvisi.mostra("XML salvato: non va inviato così, lo completa il programma") }.onFailure { avvisi.mostra("L'XML non si è salvato: riprova") }
    }
    val f = (fattura as? Lettura.Pronta)?.dato
    val p = (pacchetto as? Lettura.Pronta)?.dato
    val scrive = scriveFatture() && f?.puoScrivere == true && f.bozza

    fun passa(conferma: Boolean) {
        val x = f ?: return
        inCorso = true
        scope.launch {
            dati.fase4.passaAlProgramma(x.id, conferma)
                .onSuccess { RicordoFatture.giro++; avvisi.mostra("${x.riferimento} passata al programma: quando la emetti, importa l'XML"); nav.indietro() }
                .onFailure { e -> daConfermare(e)?.let { domanda = it.message } ?: avvisi.mostra(spiegaErrore2(e, "Non è passata: riprova")) }
            inCorso = false
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina(if (f?.bozza == true) "Passa al programma" else "Prospetto", sopra = f?.let { "Rif. ${it.riferimento} · ${it.cliente}" })
            when {
                fattura is Lettura.Errore -> SchedaErrore(fattura.messaggio) { giro++ }
                pacchetto is Lettura.Errore -> SchedaErrore(pacchetto.messaggio) { giro++ }
                f == null || p == null -> { Segnaposto(120.dp); Segnaposto(300.dp) }
                else -> {
                    if (!regole.confermate || p.avviso.isNotBlank()) FasciaRegole(null)
                    Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 4.dp) {
                        Text("Cosa passi al programma", style = Testi.forteGrande, color = c.testo)
                        RigaDato("Cliente", f.cliente)
                        RigaDato("Righe", "${f.righe.count { !it.bollo }}")
                        RigaDato("Totale della fattura", euro(f.conti?.totale))
                        RigaDato("Netto da incassare", euro(f.conti?.netto))
                        RigaDato("Scadenza", f.scadenza.let(::dataVista))
                    }
                    if (p.mancano.isNotEmpty()) Scheda(orizzontale = 16.dp, verticale = 12.dp, spazio = 4.dp) {
                        Text("Prima di passarla al programma manca", style = Testi.forte, color = c.testo)
                        p.mancano.forEach { Text(it.testo, style = Testi.secondario, color = c.gialloTesto) }
                    }
                    if (p.conProspetto) PulsanteBordo("Condividi il prospetto (PDF)", {
                        avvisi.mostra("Preparo il PDF…")
                        scope.launch {
                            runCatching {
                                Stampa.documentoFase4(ctx, "prospettoFattura", p.modello, ProspettoPdf.prospetto(p, f.riferimento, ana.ragioneSociale, regole), "Prospetto ${f.riferimento} ${f.cliente}",
                                    org.json.JSONObject().put("oggi", LocalDate.now().toString()).put("confermateIl", regole.confermateIl))
                            }.onSuccess { Stampa.condividi(ctx, it, "Prospetto ${f.riferimento} · non è una fattura") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il PDF non si è creato: riprova")) }
                        }
                    }, Modifier.fillMaxWidth(), icona = Icone.pdf)
                    if (p.conXml) {
                        PulsanteBordo("Condividi l'XML da completare", {
                            dati.fase4.fileXml(p, f.riferimento).onSuccess { condividiFile(ctx, it, it.name, "application/xml") }.onFailure { avvisi.mostra(spiegaErrore2(it, "L'XML non si è preparato")) }
                        }, Modifier.fillMaxWidth(), icona = Icone.condividi)
                        PulsanteBordo("Salva l'XML nei file", { salvaXml.launch(Pacchetto.nomeXmlSicuro(p.xmlNome, f.riferimento)) }, Modifier.fillMaxWidth(), icona = Icone.scarica)
                    }
                    PulsanteBordo("Copia i dati", { appunti.setText(AnnotatedString(p.testo)); avvisi.mostra("Dati copiati: incollali nel programma") }, Modifier.fillMaxWidth(), icona = Icone.copia)
                    Scheda(orizzontale = 16.dp, verticale = 6.dp, spazio = 0.dp) { RigaNonCollegato("Invio allo SDI") }
                    p.sezioni.forEach { s ->
                        TitoloSezione(s.titolo)
                        SchedaElenco {
                            s.campi.forEachIndexed { i, campo ->
                                if (i > 0) LineaElenco()
                                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(campo.etichetta, style = Testi.secondario, color = c.tenue)
                                        Text(campo.valore, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                                    }
                                    val chiave = s.titolo + "|" + campo.etichetta
                                    PulsanteTesto(if (copiato == chiave) "Copiato" else "Copia", {
                                        appunti.setText(AnnotatedString(campo.valore))
                                        copiato = chiave
                                        scope.launch { kotlinx.coroutines.delay(2000); if (copiato == chiave) copiato = "" }
                                    })
                                }
                            }
                        }
                    }
                }
            }
        }
        if (scrive && p != null && p.mancano.isEmpty()) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(if (inCorso) "Un momento…" else "Segna come passata al programma", { if (!inCorso) passa(false) }, abilitato = !inCorso)
            }
        }
    }
    domanda?.let { d ->
        FoglioConferma("Le regole non sono confermate", d, "Passala lo stesso", onConferma = { domanda = null; passa(true) }, onAnnulla = { domanda = null })
    }
}

/** Una fattura nuova con le righe libere: si sceglie il cliente, poi la bozza vuota. */
@Composable
fun SchermataNuovaFattura(dati: Dati, nav: Navigatore) {
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var aperto by remember { mutableStateOf(true) }
    Column(Modifier.fillMaxSize().background(W.colori.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Nuova fattura")
        PulsanteBordo("Scegli il cliente", { aperto = true }, Modifier.fillMaxWidth(), icona = Icone.clienti)
    }
    if (aperto) FoglioSceltaCliente(ana, "", { cl ->
        aperto = false
        if (cl != null) scope.launch {
            dati.fase4.nuovaFattura(cl.id)
                .onSuccess { RicordoFatture.giro++; nav.indietro(); nav.vai("fattura/${it.id}") }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "La bozza non si è creata: riprova")) }
        }
    }, { aperto = false })
}

/** Per chi deve condividere un file dal contesto (Banche). */
internal fun condividiCsv(ctx: Context, f: File, titolo: String) = condividiFile(ctx, f, titolo, "text/csv")
