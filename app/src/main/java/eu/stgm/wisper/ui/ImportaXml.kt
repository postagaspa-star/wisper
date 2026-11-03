@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.DocumentoXml
import eu.stgm.wisper.rapportino.LetturaXml
import eu.stgm.wisper.rapportino.Ricevuta
import eu.stgm.wisper.rapportino.SceltaXml
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/*
 * Importa l'XML (fase4.md §9, §13.2): i file scelti dal telefono o arrivati da
 * "Condividi → Wisper" (email, WhatsApp: .xml, .p7m, .zip). Il server legge e
 * propone senza cambiare niente; qui si guarda documento per documento e si
 * conferma. Niente si abbina da solo: una "Diversa", o una "Probabile" con più
 * bozze uguali, aspetta che si scelga.
 */

/** Un file arrivato da fuori, già copiato nell'app (il permesso di leggerlo dura poco). */
class FileArrivato(val nome: String, val byte: ByteArray)

/** I file arrivati col Condividi di Android: li mette MainActivity, li prende la pagina Importa. */
object FileInArrivo {
    val file = MutableStateFlow<List<FileArrivato>?>(null)

    private val accettati = listOf(".xml", ".p7m", ".zip")
    const val MAX_BYTE = 30L * 1024 * 1024
    const val MAX_FILE = 300

    fun accettato(nome: String) = accettati.any { nome.lowercase().endsWith(it) }

    /** Legge nome e byte degli [uri] (fino a 30 MB e 300 file); torna i file e le frasi di quelli lasciati fuori. */
    fun leggi(ctx: Context, uri: List<Uri>): Pair<List<FileArrivato>, List<String>> {
        val presi = ArrayList<FileArrivato>()
        val fuori = ArrayList<String>()
        var totale = 0L
        uri.forEach { u ->
            val nome = runCatching {
                ctx.contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
            }.getOrNull() ?: u.lastPathSegment?.substringAfterLast('/') ?: "file"
            when {
                !accettato(nome) -> fuori.add("$nome: non è un file di fattura (servono .xml, .p7m o .zip)")
                presi.size >= MAX_FILE -> fuori.add("$nome: troppi file, al massimo $MAX_FILE per volta")
                else -> {
                    val byte = runCatching { ctx.contentResolver.openInputStream(u)?.use { it.readBytes() } }.getOrNull()
                    when {
                        byte == null -> fuori.add("$nome: non si legge")
                        totale + byte.size > MAX_BYTE -> fuori.add("$nome: file troppo grandi, al massimo 30 MB per volta")
                        else -> { totale += byte.size; presi.add(FileArrivato(nome, byte)) }
                    }
                }
            }
        }
        return presi to fuori
    }
}

@Composable
fun SchermataImportaXml(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val scrive = scriveFatture()
    var lettura by remember { mutableStateOf<LetturaXml?>(null) }
    var fuoriQui by remember { mutableStateOf<List<String>>(emptyList()) }
    var errore by remember { mutableStateOf<String?>(null) }
    var leggo by remember { mutableStateOf(false) }
    var confermo by remember { mutableStateOf(false) }
    var scelte by remember { mutableStateOf<Map<String, SceltaXml>>(emptyMap()) }
    var cambia by remember { mutableStateOf<DocumentoXml?>(null) }
    var ultimiFile by remember { mutableStateOf<List<FileArrivato>>(emptyList()) }

    fun leggi(file: List<FileArrivato>, fuori: List<String>) {
        fuoriQui = fuori
        errore = null
        if (file.isEmpty()) { if (fuori.isEmpty()) errore = "Nessun file scelto"; return }
        ultimiFile = file
        leggo = true
        scope.launch {
            dati.fase4.leggiXml(file.map { it.nome to it.byte })
                .onSuccess { l -> lettura = l; scelte = l.documenti.associate { it.chiave to SceltaXml.iniziale(it) } }
                .onFailure { errore = spiegaErrore2(it, "I file non si sono letti: riprova") }
            leggo = false
        }
    }

    val scegli = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uri ->
        if (uri.isNotEmpty()) scope.launch {
            val (file, fuori) = withContext(Dispatchers.IO) { FileInArrivo.leggi(ctx, uri) }
            leggi(file, fuori)
        }
    }
    val tipi = arrayOf("application/xml", "text/xml", "application/pkcs7-mime", "application/x-pkcs7-mime", "application/zip", "application/x-zip-compressed", "application/octet-stream")
    val arrivati by FileInArrivo.file.collectAsStateWithLifecycle()
    LaunchedEffect(arrivati) {
        val a = arrivati
        if (a != null) {
            FileInArrivo.file.value = null
            leggi(a, emptyList())
        } else if (lettura == null && ultimiFile.isEmpty() && !leggo) scegli.launch(tipi)
    }

    val l = lettura
    val daMandare = SceltaXml.daMandare(scelte.values)
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina(if (l == null) "Importa l'XML" else "Cosa ho trovato")
            if (l != null) Text(
                Testo.quanti(l.documenti.size, "documento", "documenti") + " in " + Testo.quanti(ultimiFile.size, "file", "file") + " · niente cambia finché non confermi",
                style = Testi.secondarioGrande, color = c.tenue,
            )
            errore?.let { SchedaErrore(it) { if (ultimiFile.isNotEmpty()) leggi(ultimiFile, fuoriQui) else scegli.launch(tipi) } }
            if (leggo) { Segnaposto(140.dp); Segnaposto(140.dp) }
            if (l == null && !leggo) PulsanteBordo("Scegli i file", { scegli.launch(tipi) }, Modifier.fillMaxWidth(), icona = Icone.carica)
            l?.documenti?.forEach { d ->
                val s = scelte[d.chiave] ?: SceltaXml.iniziale(d)
                SchedaDocumento(d, s, scrive, onScelta = { scelte = scelte + (d.chiave to it) }, onCambia = { cambia = d })
            }
            val scartati = (l?.scartati?.map { it.nomeFile + ": " + it.motivo }.orEmpty()) + fuoriQui
            if (scartati.isNotEmpty()) {
                TitoloSezione("Scartati")
                scartati.forEach { Text(it, style = Testi.secondario, color = c.tenue) }
            }
            if (l != null) PulsanteBordo("Scegli altri file", { lettura = null; scelte = emptyMap(); scegli.launch(tipi) }, Modifier.fillMaxWidth(), icona = Icone.carica)
        }
        if (scrive && l != null) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(if (confermo) "Registro…" else "Conferma (${daMandare.size})", {
                    if (confermo) return@PulsantePrincipale
                    if (daMandare.isEmpty()) { avvisi.mostra("Niente da registrare: scegli cosa fare dei documenti"); return@PulsantePrincipale }
                    confermo = true
                    scope.launch {
                        dati.fase4.confermaXml(l.idLettura, daMandare)
                            .onSuccess { e ->
                                RicordoFatture.giro++
                                avvisi.mostra(e.frase + if (e.avvisi.isNotEmpty()) ". " + e.avvisi.first() else "")
                                nav.indietro()
                            }
                            .onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è registrato niente: riprova")) }
                        confermo = false
                    }
                }, abilitato = daMandare.isNotEmpty() && !confermo, icona = Icone.spunta)
            }
        }
    }
    cambia?.let { d ->
        FoglioCambiaScelta(d, scelte[d.chiave] ?: SceltaXml.iniziale(d), onChiudi = { cambia = null }) { nuova -> scelte = scelte + (d.chiave to nuova); cambia = null }
    }
}

/** La pillola della certezza: Sicura verde, Probabile blu, Diversa e Senza bozza giallo scuro, Ricevuta blu, Già importata grigia. */
@Composable
private fun PillolaCertezza(d: DocumentoXml) {
    val c = W.colori
    val p = d.proposta
    when {
        p.azione == "gia" -> Pillolina("Già importata", c.fatturatoTesto, c.fatturatoFondo)
        d.tipo == "esito" -> Pillolina(if (d.esito == "scartata") "Scartata dallo SDI" else "Esito", if (d.esito == "scartata") c.rossoTesto else c.inviatoTesto, if (d.esito == "scartata") c.rossoTenue else c.inviatoFondo)
        d.tipo == "ricevuta" -> Pillolina("Ricevuta", c.inviatoTesto, c.inviatoFondo)
        p.certezza == "certa" -> Pillolina("Sicura", c.firmatoTesto, c.firmatoFondo)
        p.certezza == "probabile" -> Pillolina("Probabile", c.inviatoTesto, c.inviatoFondo)
        p.certezza == "diversa" -> Pillolina("Diversa", c.gialloTesto, c.gialloTenue)
        else -> Pillolina("Senza bozza", c.gialloTesto, c.gialloTenue)
    }
}

private fun nomeCampo(campo: String) = when (campo) {
    "totale" -> "Totale"
    "compenso" -> "Compenso"
    "contributo" -> "Contributo"
    "iva" -> "IVA"
    "ritenuta" -> "Ritenuta"
    "anticipazioni" -> "Spese anticipate"
    "bollo" -> "Bollo"
    else -> campo
}

/** Cosa farà Conferma con questo documento, a parole. */
private fun azioneParole(d: DocumentoXml, s: SceltaXml): String = when {
    !s.confermata -> "Da scegliere: tocca Cambia"
    s.azione == "salta" -> "Lo salto"
    d.tipo == "esito" -> "Lo registro sulla fattura"
    d.tipo == "ricevuta" -> "La aggiungo alle fatture ricevute" + if (s.categoria.isNotBlank()) " (${Ricevuta.nomeCategoria(s.categoria).lowercase()})" else ""
    s.azione == "abbina" -> "La abbino alla bozza " + (d.proposta.alternative.firstOrNull { it.idFattura == s.idFattura }?.riferimento ?: d.proposta.riferimento.ifBlank { "W-" + s.idFattura })
    s.azione == "senzaBozza" -> "La registro senza bozza" + if (s.creaCliente) ", col cliente nuovo dai dati dell'XML" else ""
    else -> ""
}

@Composable
private fun SchedaDocumento(d: DocumentoXml, s: SceltaXml, scrive: Boolean, onScelta: (SceltaXml) -> Unit, onCambia: () -> Unit) {
    val c = W.colori
    val p = d.proposta
    Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 8.dp) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(listOf(d.cosa, d.controparte).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.forte, color = c.testo)
                Text(d.nomeFile, style = Testi.piccolo, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (d.totale != null) Text(euro(d.totale), style = Testi.forte, color = c.testo)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            PillolaCertezza(d)
            val frase = when {
                p.azione == "gia" -> ""
                d.tipo == "esito" -> when (d.esito) {
                    "consegnata" -> "Consegnata al cliente" + if (p.numero.isNotBlank()) ": fattura ${p.numero}" else ""
                    "non_consegnata" -> "Non consegnata, ma vale: è nell'area riservata del cliente"
                    "scartata" -> "La fattura torna pronta, da correggere nel programma"
                    else -> ""
                }
                d.tipo == "ricevuta" -> "Fattura ricevuta da ${d.controparte}: la aggiungo"
                p.certezza == "certa" || p.certezza == "probabile" -> "È la bozza ${p.riferimento}"
                p.certezza == "diversa" -> "Somiglia alla bozza ${p.riferimento}, ma i conti sono diversi"
                else -> "Fatta fuori da Wisper: nessuna bozza combacia"
            }
            if (frase.isNotBlank()) Text(frase, style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.testo2)
        }
        if (d.bozzaDiWisper) Text(
            "È l'XML da completare preparato da Wisper (numero «BOZZA»), non la fattura emessa dal programma: lo salto. Importa l'XML che ti dà il programma dopo averla emessa.",
            style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.rossoTesto,
        )
        d.avvisi.forEach { Text(it, style = Testi.secondario, color = c.gialloTesto) }
        d.errori.forEach { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        if (p.differenze.isNotEmpty()) {
            Row(Modifier.fillMaxWidth()) {
                Text("", Modifier.weight(1.2f))
                Text("Bozza", style = Testi.etichetta, color = c.tenue, modifier = Modifier.weight(1f))
                Text("XML", style = Testi.etichetta, color = c.tenue, modifier = Modifier.weight(1f))
            }
            p.differenze.forEach { x ->
                Row(Modifier.fillMaxWidth().heightIn(min = 28.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(nomeCampo(x.campo), style = Testi.secondario, color = c.testo2, modifier = Modifier.weight(1.2f))
                    Text(euro(x.bozza), style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.testo, modifier = Modifier.weight(1f))
                    Text(euro(x.xml), style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.testo, modifier = Modifier.weight(1f))
                }
            }
            val tornano = p.righeMancanti.filter { it.gruppo in s.libera }
            if (s.azione == "abbina" && tornano.isNotEmpty()) Text("Tornano da fatturare: " + tornano.joinToString(", ") { it.descrizione }, style = Testi.secondario, color = c.gialloTesto)
        }
        if (d.tipo == "emessa" && s.azione == "senzaBozza" && p.collegabili.isNotEmpty() && !d.nota) {
            LineaElenco()
            Etichetta("Era da fatturare in Wisper?")
            p.collegabili.forEach { col ->
                val spuntato = col.voci.isNotEmpty() && col.voci.all { it in s.collega }
                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (scrive) CasellaScelta(spuntato, col.titolo) {
                        onScelta(s.copy(collega = if (spuntato) s.collega - col.voci.toSet() else (s.collega + col.voci).distinct()))
                    }
                    Column(Modifier.weight(1f)) {
                        Text(col.titolo, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                        Text(
                            (if (col.spuntato) "Stessi importi: " + euro(col.importo) + " di compenso" else euro(col.importo)) + if (spuntato) ". Spuntato, esce da Da fatturare" else "",
                            style = Testi.secondario, color = c.tenue,
                        )
                    }
                }
            }
        }
        if (d.nota && s.azione == "senzaBozza" && p.gruppiFattura.isNotEmpty()) {
            LineaElenco()
            Etichetta("Cosa torna da fatturare?")
            p.gruppiFattura.forEach { g ->
                val spuntato = g.gruppo in s.libera
                Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (scrive) CasellaScelta(spuntato, g.descrizione) { onScelta(s.copy(libera = if (spuntato) s.libera - g.gruppo else s.libera + g.gruppo)) }
                    Text(g.descrizione, style = Testi.secondarioGrande, color = c.testo, modifier = Modifier.weight(1f))
                    Text(euro(g.importo), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                }
            }
        }
        if (d.tipo == "emessa" && d.idSoggetto.isBlank() && s.azione == "senzaBozza") {
            Text(if (d.clienteNuovo) "Cliente nuovo: lo creo dai dati dell'XML" else "Il cliente non c'è in Wisper", style = Testi.secondario, color = c.gialloTesto)
        }
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(azioneParole(d, s), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = if (s.confermata) c.testo2 else c.gialloTesto, modifier = Modifier.weight(1f))
            if (scrive && p.azione != "gia" && !d.bozzaDiWisper) PulsanteBordo("Cambia", onCambia, altezza = 48.dp)
        }
    }
}

/** Cambia: Abbina (alla bozza proposta o a un'altra uguale) · Senza bozza · Salta; per le ricevute Aggiungi · Salta. */
@Composable
private fun FoglioCambiaScelta(d: DocumentoXml, s: SceltaXml, onChiudi: () -> Unit, onScelta: (SceltaXml) -> Unit) {
    val c = W.colori
    val p = d.proposta
    FoglioDalBasso(onChiudi) {
        Text(d.cosa, style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when (d.tipo) {
                "ricevuta" -> {
                    SceltaGrande("Aggiungi alle fatture ricevute", s.azione == "nuova" && s.confermata, { onScelta(s.copy(azione = "nuova", confermata = true)) })
                    Etichetta("Categoria")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Ricevuta.CATEGORIE.forEach { (k, nome) -> Pillola(nome, s.categoria == k, { onScelta(s.copy(azione = "nuova", categoria = k, confermata = true)) }, altezza = 44.dp) }
                    }
                }
                "esito" -> if (p.idFattura.isNotBlank()) SceltaGrande("Registralo sulla fattura", s.azione == "abbina" && s.confermata, { onScelta(s.copy(azione = "abbina", idFattura = p.idFattura, confermata = true)) })
                else -> {
                    if (p.idFattura.isNotBlank()) SceltaGrande(
                        (if (p.certezza == "diversa") "Abbina lo stesso alla " else "Abbina alla ") + p.riferimento,
                        s.azione == "abbina" && s.idFattura == p.idFattura && s.confermata,
                        { onScelta(s.copy(azione = "abbina", idFattura = p.idFattura, libera = p.libera, confermata = true)) },
                        sotto = if (p.certezza == "diversa") "Vince l'XML: numero, data e importi" else null,
                    )
                    p.alternative.forEach { a ->
                        SceltaGrande("Abbina alla ${a.riferimento}", s.azione == "abbina" && s.idFattura == a.idFattura && s.confermata,
                            { onScelta(s.copy(azione = "abbina", idFattura = a.idFattura, libera = emptyList(), confermata = true)) }, sotto = euro(a.totale))
                    }
                    SceltaGrande("Senza bozza", s.azione == "senzaBozza" && s.confermata, {
                        onScelta(SceltaXml(d.chiave, "senzaBozza", creaCliente = d.idSoggetto.isBlank() && d.clienteNuovo,
                            collega = p.collegabili.filter { it.spuntato }.flatMap { it.voci }, libera = if (d.nota) p.libera else emptyList(), confermata = true))
                    }, sotto = "Registrata coi conti dell'XML")
                }
            }
            SceltaGrande("Salta", s.azione == "salta", { onScelta(s.copy(azione = "salta", confermata = true)) })
        }
        PulsanteTesto("Chiudi", onChiudi, Modifier.fillMaxWidth(), colore = c.testo)
    }
}
