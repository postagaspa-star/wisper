@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.isImeVisible
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.Indennita
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Servizi
import eu.stgm.wisper.rapportino.VoceListino
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

/*
 * I Servizi (1.4.0, docs/gestionale/servizi.md §1): il listino della fase 2 diventa l'anagrafica dei servizi coi campi
 * di Flextaxa, il programma con cui Manuel emette le fatture. Un posto solo: lo stesso servizio si sceglie in un
 * preventivo e in un'indennità del rapportino. L'elenco (cerca in descrizione, codice e tag, archiviati a parte) e la
 * scheda con le tre parti della schermata di Flextaxa, nello stesso ordine e con le stesse parole. I campi della scheda
 * ([CampiServizio]) servono anche alla schermata Indennità del rapportino (Indennita.kt), con in più la Quantità.
 *
 * Li vede chi ha in lettura Preventivi, Rapportini o Fatture; li cambia chi ha Preventivi in scrittura. I prezzi (di
 * vendita e di acquisto) solo con il permesso dei soldi.
 */

/** Quello che resta scelto mentre si va e si torna: archiviati o no, e la ricerca. */
internal object RicordoServizi {
    var archiviati by mutableStateOf(false)
    var cerca by mutableStateOf("")
}

/** Le scritture che devono finire anche se si cambia pagina. */
private val ambitoServizi = MainScope()

// ---------------------------------------------------------------------------------- elenco

@Composable
fun SchermataServizi(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val perm = LocalPermessi.current
    val listino by dati.listino.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { dati.aggiornaServizi() }
    val archiviati = RicordoServizi.archiviati
    val attivi = Servizi.elenco(listino, RicordoServizi.cerca, attivi = true)
    val fermi = Servizi.elenco(listino, RicordoServizi.cerca, attivi = false)
    val mostrati = if (archiviati) fermi else attivi
    val puo = perm.modificaServizi

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina)
                .padding(bottom = if (puo) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Servizi")
            Segmenti(
                listOf(false to "Servizi · ${attivi.size}", true to "Archiviati · ${fermi.size}"),
                archiviati, { RicordoServizi.archiviati = it },
            )
            CampoCerca(RicordoServizi.cerca, { RicordoServizi.cerca = it }, "Descrizione, codice, tag")
            if (mostrati.isEmpty()) {
                TestoVuoto(
                    when {
                        RicordoServizi.cerca.isNotBlank() -> "Nessun servizio trovato"
                        archiviati -> "Nessun servizio archiviato"
                        else -> "Ancora nessun servizio"
                    },
                )
            } else {
                SchedaElenco {
                    mostrati.forEachIndexed { i, v ->
                        if (i > 0) LineaElenco()
                        RigaServizio(v, perm.costi, Modifier.bersaglio("servizio-riga-$i")) { nav.vai("servizio/${v.id}") }
                    }
                }
            }
        }
        if (puo) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo servizio", { nav.vai("servizio-nuovo") }, Modifier.bersaglio("servizio-nuovo"), icona = Icone.piu)
            }
        }
    }
}

/** Un servizio nell'elenco: il codice in evidenza, la descrizione, i tag; a destra il prezzo per unità (solo coi soldi). */
@Composable
internal fun RigaServizio(v: VoceListino, costi: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (v.codice.isNotBlank()) CodiceProgetto(v.codice)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(v.nome.ifBlank { "Senza descrizione" }, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val sotto = listOfNotNull(
                "Prodotto".takeIf { v.tipo == Servizi.PRODOTTO },
                v.unita.takeIf { it.isNotBlank() && !costi },
                v.tag.takeIf { it.isNotEmpty() }?.joinToString(", "),
            ).joinToString(" · ")
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (costi) {
            val p = v.prezzoPerUnita()
            if (p == null) Text("senza prezzo", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.tenue)
            else Text(p, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
        }
    }
}

// ---------------------------------------------------------------------------------- scheda

/**
 * La scheda di un servizio, nuovo ([id] null) o da cambiare: le tre parti di Flextaxa ("Anagrafica prodotti/servizi",
 * "Dettagli", "Note personali"), Salva, Archivia. Chi non può cambiare i servizi la legge soltanto.
 */
@Composable
fun SchermataServizio(dati: Dati, nav: Navigatore, id: String?) {
    val c = W.colori
    val perm = LocalPermessi.current
    val avvisi = LocalAvvisi.current
    val listino by dati.listino.collectAsStateWithLifecycle()
    val esistente = id?.let { i -> listino.firstOrNull { it.id == i } }
    if (id != null && esistente == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Servizio")
            TestoVuoto("Servizio non trovato")
        }
        return
    }
    val nuovo = esistente == null
    val puo = perm.modificaServizi
    val costi = perm.costi
    val m = remember(id) { ModuloServizio.da(esistente) }
    var salvo by remember { mutableStateOf(false) }
    var archivia by remember { mutableStateOf(false) }
    val scorri = rememberScrollState()
    val scope = rememberCoroutineScope()
    val tastiera = WindowInsets.isImeVisible

    fun salva() {
        if (salvo) return
        // Il prezzo lo vuole un servizio nuovo (come Flextaxa); uno di prima senza prezzo può restare senza.
        val prezzoObbligatorio = costi && (nuovo || esistente?.prezzo != null)
        m.errori(costi, prezzoObbligatorio, conQuantita = false)?.let { e ->
            avvisi.mostra(e)
            scope.launch { scorri.animateScrollTo(0) }
            return
        }
        salvo = true
        val base = esistente ?: VoceListino("", "", ordine = (listino.maxOfOrNull { it.ordine } ?: 0) + 1)
        ambitoServizi.launch {
            dati.salvaVoceListino(m.voce(base, costi))
                .onSuccess { avvisi.mostra("Salvato ${it.nome}"); nav.indietro() }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Il servizio non si è salvato: riprova")) }
            salvo = false
        }
    }

    fun archiviaOppure(archiviata: Boolean) {
        val v = esistente ?: return
        ambitoServizi.launch {
            dati.archiviaVoceListino(v.id, archiviata)
                .onSuccess {
                    avvisi.mostra(if (archiviata) "Archiviato: lo trovi fra gli archiviati" else "Di nuovo fra i servizi")
                    if (archiviata) nav.indietro()
                }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Il servizio non è cambiato: riprova")) }
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(scorri).padding(MarginePagina).padding(bottom = if (puo && !tastiera) 120.dp else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(
                if (nuovo) "Nuovo servizio" else esistente!!.nome.ifBlank { "Servizio" },
                sopra = if (esistente != null && !esistente.attivo) "Archiviato" else esistente?.codice?.ifBlank { null },
            )
            if (puo) {
                CampiServizio(dati, m, costi, perIndennita = false, conQuantita = false, titoloPrima = "Anagrafica prodotti/servizi")
                if (esistente != null) {
                    if (esistente.attivo) PulsanteTesto("Archivia il servizio", { archivia = true }, Modifier.fillMaxWidth(), colore = c.rossoTesto)
                    else PulsanteTesto("Rimetti fra i servizi", { archiviaOppure(false) }, Modifier.fillMaxWidth())
                }
            } else {
                esistente?.let { SchedaServizioLettura(dati, it, costi) }
            }
        }
        if (puo && !tastiera) FondoConPulsante(Modifier.align(Alignment.BottomCenter), sopraBarra = false) {
            PulsantePrincipale(if (salvo) "Salvo…" else "Salva", ::salva, Modifier.bersaglio("servizio-salva"), icona = Icone.spunta, abilitato = !salvo)
        }
    }

    if (archivia) FoglioConferma(
        "Archiviare ${esistente?.nome.orEmpty()}?",
        "Non si propone più nei preventivi e nelle indennità. Resta fra gli archiviati.",
        "Archivia", pericolo = true,
        onConferma = { archivia = false; archiviaOppure(true) },
        onAnnulla = { archivia = false },
    )
}

/** Il servizio per chi non lo cambia: le stesse tre parti, in lettura. */
@Composable
private fun SchedaServizioLettura(dati: Dati, v: VoceListino, costi: Boolean) {
    TitoloSezione("Anagrafica prodotti/servizi")
    Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 2.dp) {
        Coppia("Descrizione", v.nome)
        if (costi) Coppia("Prezzo di vendita unitario (IVA esclusa)", v.prezzo?.let { Numeri.euro(it) } ?: "senza prezzo")
        Coppia("Aliquota IVA", Servizi.aliquota(v.aliquotaIva))
    }
    TitoloSezione("Dettagli")
    Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 2.dp) {
        Coppia("Codice articolo", v.codice)
        if (costi) Coppia("Costo di acquisto unitario (IVA esclusa)", v.prezzoAcquisto?.let { Numeri.euro(it) } ?: "")
        Coppia("Aliquota IVA acquisto", Servizi.aliquota(v.aliquotaAcquisto))
        Coppia("Tipo", if (v.tipo == Servizi.PRODOTTO) "Prodotto" else "Servizio")
        Coppia("Unità di misura", v.unita)
        Coppia("Fornitore", v.fornitore)
        Coppia("Tag per ricerca", v.tag.joinToString(", "))
        v.immagine?.let { f ->
            Text("Immagine", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = W.colori.tenue, modifier = Modifier.padding(top = 4.dp))
            MiniaturaServizio(dati, f, 96.dp)
        }
    }
    TitoloSezione("Note personali (non visibili nei documenti)")
    Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 2.dp) {
        Text(v.note.ifBlank { "—" }, style = Testi.testo, color = W.colori.testo)
    }
}

// ---------------------------------------------------------------------------------- i campi (servizio e indennità)

/** Un prezzo nel campo: "1234,56", "0,50", "0,765" (senza punto delle migliaia: "1.234" si leggerebbe 1,234). */
internal fun prezzoNelCampo(n: Double?): String =
    n?.let { DecimalFormat("0.00##", DecimalFormatSymbols(Locale.ITALY)).format(it) }.orEmpty()

/**
 * I campi di un servizio mentre si scrivono (testo finché non si salva: "45," non è ancora un numero). Servono alla
 * scheda del servizio e alla schermata Indennità ([quantita] solo lì).
 */
internal class ModuloServizio(
    descrizione: String = "",
    prezzo: Double? = null,
    aliquotaIva: Double = 22.0,
    codice: String = "",
    prezzoAcquisto: Double? = null,
    aliquotaAcquisto: Double = 22.0,
    tipo: String = Servizi.SERVIZIO,
    unita: String = "",
    fornitore: String = "",
    tag: List<String> = emptyList(),
    immagine: FileRemoto? = null,
    note: String = "",
    quantita: Double? = 1.0,
) {
    var descrizione by mutableStateOf(descrizione)
    var prezzo by mutableStateOf(prezzoNelCampo(prezzo))
    var aliquotaIva by mutableStateOf(aliquotaIva)
    var codice by mutableStateOf(codice)
    var prezzoAcquisto by mutableStateOf(prezzoNelCampo(prezzoAcquisto))
    var aliquotaAcquisto by mutableStateOf(aliquotaAcquisto)
    var tipo by mutableStateOf(tipo)
    var unita by mutableStateOf(unitaScelta(unita))
    var fornitore by mutableStateOf(fornitore)
    var tag by mutableStateOf(tag.joinToString(", "))
    var immagine by mutableStateOf(immagine)
    var note by mutableStateOf(note)
    var quantita by mutableStateOf(Numeri.scrivi(quantita))
    /** Si è provato a salvare: da qui i campi che mancano si dicono in rosso. */
    var provato by mutableStateOf(false)
    /** L'immagine scelta sta partendo. */
    var caricando by mutableStateOf(false)

    val prezzoLetto: Double? get() = Numeri.leggi(prezzo)
    val quantitaLetta: Double? get() = Numeri.leggi(quantita)

    /** L'importo dell'indennità come lo farà il server: quantità (vuota = 1) per prezzo. */
    val importo: Double get() = Servizi.importo(quantitaLetta, prezzoLetto)

    val erroreDescrizione: String? get() = if (provato && descrizione.isBlank()) "Scrivi la descrizione" else null
    fun errorePrezzo(obbligatorio: Boolean): String? = when {
        prezzo.isNotBlank() && (prezzoLetto ?: -1.0) < 0 -> "Non è un prezzo"
        provato && obbligatorio && prezzo.isBlank() -> "Scrivi il prezzo"
        else -> null
    }
    val erroreAcquisto: String? get() = if (prezzoAcquisto.isNotBlank() && (Numeri.leggi(prezzoAcquisto) ?: -1.0) < 0) "Non è un prezzo" else null
    val erroreQuantita: String? get() = if (quantita.isNotBlank() && (quantitaLetta ?: -1.0) < 0) "Non è una quantità" else null
    val erroreUnita: String? get() = if (provato && unita.isBlank()) "Scegli l'unità di misura" else null

    /** Prova a salvare: il primo campo che manca (per l'avviso), o null se va tutto bene. */
    fun errori(costi: Boolean, prezzoObbligatorio: Boolean, conQuantita: Boolean): String? {
        provato = true
        return listOfNotNull(
            erroreDescrizione,
            if (conQuantita) erroreQuantita?.let { "Quantità: ${it.lowercase()}" } else null,
            if (costi) errorePrezzo(prezzoObbligatorio)?.let { if (it == "Scrivi il prezzo") it else "Prezzo: ${it.lowercase()}" } else null,
            if (costi) erroreAcquisto?.let { "Costo di acquisto: ${it.lowercase()}" } else null,
            erroreUnita,
        ).firstOrNull()
    }

    /** I campi riempiti da un servizio scelto (la schermata Indennità). Senza i soldi i prezzi restano quelli del server. */
    fun riempiDa(v: VoceListino) {
        descrizione = v.nome; codice = v.codice; unita = unitaScelta(v.unita); tipo = v.tipo
        prezzo = prezzoNelCampo(v.prezzo); prezzoAcquisto = prezzoNelCampo(v.prezzoAcquisto)
        aliquotaIva = v.aliquotaIva; aliquotaAcquisto = v.aliquotaAcquisto
        fornitore = v.fornitore; tag = v.tag.joinToString(", "); note = v.note; immagine = v.immagine
        provato = false
    }

    /** Il servizio da salvare: [base] con i campi scritti. Senza i soldi i prezzi restano quelli di prima. */
    fun voce(base: VoceListino, costi: Boolean): VoceListino = base.copy(
        nome = descrizione.trim(), codice = codice.trim(), unita = unita.trim(), modo = Servizi.modoDaUnita(unita),
        tipo = tipo, aliquotaIva = aliquotaIva, aliquotaAcquisto = aliquotaAcquisto, fornitore = fornitore.trim(),
        tag = Servizi.tagDa(tag), note = note.trim(), immagine = immagine,
        prezzo = if (costi) prezzoLetto else base.prezzo,
        prezzoAcquisto = if (costi) Numeri.leggi(prezzoAcquisto) else base.prezzoAcquisto,
    )

    /** L'indennità da mettere nel lavoro: [base] (col servizio da cui viene) con i campi scritti. */
    fun indennita(base: Indennita, costi: Boolean): Indennita = base.copy(
        descrizione = descrizione.trim(), codice = codice.trim(), unita = unita.trim(), quantita = quantitaLetta ?: 1.0,
        tipo = tipo, aliquotaIva = aliquotaIva, aliquotaAcquisto = aliquotaAcquisto, fornitore = fornitore.trim(),
        tag = Servizi.tagDa(tag), note = note.trim(), immagine = immagine,
        prezzo = if (costi) prezzoLetto else base.prezzo,
        prezzoAcquisto = if (costi) Numeri.leggi(prezzoAcquisto) else base.prezzoAcquisto,
        importoServer = null,
    )

    companion object {
        /** L'unità con la scrittura delle pillole ("ore" diventa "Ore"); una diversa resta com'è. */
        fun unitaScelta(u: String): String = Servizi.UNITA.firstOrNull { it.equals(u.trim(), ignoreCase = true) } ?: u.trim()

        /** Un servizio nuovo parte da Servizio, 22% e Nr; uno di prima senza unità e "a corpo" diventa A corpo. */
        fun da(v: VoceListino?): ModuloServizio = if (v == null) ModuloServizio(unita = "Nr") else ModuloServizio(
            v.nome, v.prezzo, v.aliquotaIva, v.codice, v.prezzoAcquisto, v.aliquotaAcquisto, v.tipo,
            v.unita.ifBlank { if (v.modo == eu.stgm.wisper.rapportino.ModoVoce.CORPO) "A corpo" else "" },
            v.fornitore, v.tag, v.immagine, v.note,
        )

        fun da(i: Indennita): ModuloServizio = ModuloServizio(
            i.descrizione, i.prezzo, i.aliquotaIva, i.codice, i.prezzoAcquisto, i.aliquotaAcquisto, i.tipo, i.unita,
            i.fornitore, i.tag, i.immagine, i.note, i.quantita,
        )
    }
}

/**
 * I campi della scheda di un servizio con le parole di Flextaxa (servizi.md §1), nell'ordine della sua schermata:
 * [titoloPrima] (la prima parte), Dettagli, Note personali. Con [conQuantita] (l'indennità) anche la Quantità, subito
 * sotto la Descrizione. Senza [costi] i due prezzi non si vedono.
 */
@Composable
internal fun CampiServizio(
    dati: Dati,
    m: ModuloServizio,
    costi: Boolean,
    perIndennita: Boolean,
    conQuantita: Boolean,
    titoloPrima: String?,
    prezzoObbligatorio: Boolean = true,
) {
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()

    // ---- Anagrafica prodotti/servizi
    if (titoloPrima != null) TitoloSezione(titoloPrima)
    Scheda(orizzontale = 16.dp, verticale = 16.dp, spazio = 14.dp) {
        CampoTesto(m.descrizione, { m.descrizione = it }, "Descrizione*", Modifier.bersaglio("servizio-descrizione"), righe = 2, errore = m.erroreDescrizione)
        if (conQuantita) CampoTesto(
            m.quantita, { m.quantita = it }, "Quantità", Modifier.fillMaxWidth(), segnaposto = "1", tastiera = KeyboardType.Decimal,
            suffisso = m.unita.ifBlank { null }, errore = m.erroreQuantita,
        )
        if (costi) CampoTesto(
            m.prezzo, { m.prezzo = it }, "Prezzo di vendita unitario (IVA esclusa)*", Modifier.fillMaxWidth(),
            tastiera = KeyboardType.Decimal, suffisso = "€", errore = m.errorePrezzo(prezzoObbligatorio),
        )
        Domanda("Aliquota IVA") { SceltaAliquota(m.aliquotaIva) { m.aliquotaIva = it } }
    }

    // ---- Dettagli
    TitoloSezione("Dettagli")
    Scheda(orizzontale = 16.dp, verticale = 16.dp, spazio = 14.dp) {
        CampoTesto(m.codice, { m.codice = it }, "Codice articolo", Modifier.fillMaxWidth())
        if (costi) CampoTesto(
            m.prezzoAcquisto, { m.prezzoAcquisto = it }, "Costo di acquisto unitario (IVA esclusa)", Modifier.fillMaxWidth(),
            tastiera = KeyboardType.Decimal, suffisso = "€", errore = m.erroreAcquisto,
        )
        Domanda("Aliquota IVA acquisto") { SceltaAliquota(m.aliquotaAcquisto) { m.aliquotaAcquisto = it } }
        Domanda("Tipo") {
            Segmenti(listOf(Servizi.SERVIZIO to "Servizio", Servizi.PRODOTTO to "Prodotto"), m.tipo, { m.tipo = it })
        }
        Domanda("Unità di misura*") {
            val opzioni = (Servizi.UNITA + listOfNotNull(m.unita.takeIf { u -> u.isNotBlank() && Servizi.UNITA.none { it.equals(u, ignoreCase = true) } }))
            SceltePillole(opzioni.map { it to it }, m.unita, { m.unita = it })
            m.erroreUnita?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CampoTesto(m.fornitore, { m.fornitore = it }, "Fornitore", Modifier.fillMaxWidth())
            // Si propongono i fornitori dell'anagrafica che cominciano o contengono quello che si scrive.
            val t = Servizi.normalizza(m.fornitore.trim())
            val proposte = if (t.length < 2) emptyList() else ana.fornitori.filter { f ->
                !f.archiviato && !f.nome.equals(m.fornitore.trim(), ignoreCase = true) && Servizi.normalizza(f.nome).contains(t)
            }.take(3)
            if (proposte.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                proposte.forEach { f -> Pillola(f.nome, false, { m.fornitore = f.nome }, altezza = 48.dp) }
            }
        }
        CampoTesto(m.tag, { m.tag = it }, "Tag per ricerca", Modifier.fillMaxWidth(), segnaposto = "trasferta, cantiere")
        ImmagineServizio(dati, m, perIndennita)
    }

    // ---- Note personali
    TitoloSezione("Note personali (non visibili nei documenti)")
    CampoTesto(m.note, { m.note = it }, null, Modifier.fillMaxWidth(), righe = 3)
}

/** Le aliquote IVA come pillole: 22%, 10%, 5%, 4%, 0% (e quella scritta, se è un'altra). */
@Composable
private fun SceltaAliquota(scelta: Double, onScelta: (Double) -> Unit) {
    val opzioni = Servizi.ALIQUOTE + listOfNotNull(scelta.takeIf { it !in Servizi.ALIQUOTE })
    SceltePillole(opzioni.map { it to Servizi.aliquota(it) }, scelta, onScelta)
}

/**
 * L'immagine del servizio: la miniatura con Cambia e Togli, o i due pulsanti per sceglierla dalla galleria o
 * fotografarla. Si riduce a un JPG di al massimo 1 MB e si carica subito; nel servizio resta l'id del file.
 */
@Composable
private fun ImmagineServizio(dati: Dati, m: ModuloServizio, perIndennita: Boolean) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var scatto by rememberSaveable { mutableStateOf<String?>(null) }

    fun carica(uri: Uri, poi: () -> Unit = {}) {
        if (dati.esempio) { avvisi.mostra("Nella visita guidata è un esempio"); poi(); return }
        m.caricando = true
        scope.launch {
            val jpg = runCatching { withContext(Dispatchers.IO) { Immagini.jpegPerServizio(ctx, uri) } }
            jpg.fold(
                { byte -> dati.caricaImmagineServizio(byte, perIndennita).onSuccess { m.immagine = it }.onFailure { avvisi.mostra(spiegaErrore2(it, "L'immagine non si è caricata: riprova")) } },
                { avvisi.mostra("Non riesco a leggere l'immagine") },
            )
            m.caricando = false
            poi()
        }
    }
    val galleria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) carica(uri) }
    val fotocamera = rememberFotoSistema { riuscito ->
        val percorso = scatto ?: return@rememberFotoSistema
        scatto = null
        val f = File(percorso)
        if (!riuscito) { f.delete(); return@rememberFotoSistema }
        carica(Uri.fromFile(f)) { f.delete() }
    }
    fun scegli() = galleria.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    fun fotografa() {
        val f = Immagini.fileScatto(ctx)
        scatto = f.path
        fotocamera.launch(FileProvider.getUriForFile(ctx, ctx.packageName + ".foto", f))
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Immagine", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        val f = m.immagine
        when {
            m.caricando -> Text("Carico l'immagine…", style = Testi.secondario, color = c.tenue)
            f != null -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MiniaturaServizio(dati, f, 84.dp)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    PulsanteTesto("Cambia", { scegli() })
                    PulsanteTesto("Togli", { m.immagine = null }, colore = c.rossoTesto)
                }
            }
            else -> FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PulsanteBordo("Dalla galleria", { scegli() }, icona = Icone.galleria, altezza = 48.dp)
                PulsanteBordo("Fotografa", { fotografa() }, icona = Icone.fotocamera, altezza = 48.dp)
            }
        }
    }
}

/** La miniatura dell'immagine di un servizio: dal telefono se c'è già, se no scaricata dal server. */
@Composable
internal fun MiniaturaServizio(dati: Dati, f: FileRemoto, dimensione: Dp) {
    val c = W.colori
    val bitmap by produceState<Bitmap?>(null, f.id) {
        value = withContext(Dispatchers.IO) {
            runCatching { dati.file(f.id)?.first?.let { b -> ridotta(b, (dimensione.value * 3).toInt()) } }.getOrNull()
        }
    }
    Box(
        Modifier.size(dimensione).clip(RoundedCornerShape(16.dp)).background(c.superficie2).semantics { contentDescription = "Immagine del servizio" },
        contentAlignment = Alignment.Center,
    ) {
        val b = bitmap
        if (b != null) Image(b.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Icon(Icone.galleria, null, tint = c.tenue, modifier = Modifier.size(28.dp))
    }
}

/** I byte di un'immagine ridotti al lato dato (una foto intera pesa troppo per una miniatura). */
private fun ridotta(byte: ByteArray, lato: Int): Bitmap? {
    val misure = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(byte, 0, byte.size, misure)
    var passo = 1
    while (maxOf(misure.outWidth, misure.outHeight) / (passo * 2) >= lato) passo *= 2
    return BitmapFactory.decodeByteArray(byte, 0, byte.size, BitmapFactory.Options().apply { inSampleSize = passo })
}
