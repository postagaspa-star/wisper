package eu.stgm.wisper.ui

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Riepiloghi
import eu.stgm.wisper.Vista
import eu.stgm.wisper.rapportino.Calcolo
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.Km
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Progetto
import eu.stgm.wisper.rapportino.ProgettoNuovo
import eu.stgm.wisper.rapportino.RegoleProgetti
import eu.stgm.wisper.rapportino.Stato
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val IT = Locale.ITALY

internal fun dataLungaIt(d: LocalDate): String {
    val oggi = LocalDate.now()
    val base = d.format(DateTimeFormatter.ofPattern("EEEE d MMMM", IT))
    return when (d) {
        oggi -> "Oggi, $base"
        oggi.minusDays(1) -> "Ieri, $base"
        else -> base.replaceFirstChar { it.uppercase() }
    }
}

/**
 * Il lavoro scelto nella pagina del rapportino (11/11/2026, Andrea: "Fai lo stesso editor a tre colonne anche sul
 * telefono", scelta "Pagina unica"). Tutti i campi uno sotto l'altro, negli stessi gruppi e nello stesso ordine del
 * computer (dai piu' usati nei rapportini veri): **Per chi**, **Il lavoro**, **Strada e tariffa**, **Altro**, poi **Il
 * conto**. Niente piu' 3 passi ne' "Aggiungi al rapportino": quello che si scrive va subito nel lavoro della fila in
 * alto ([GiornataStato.sincronizza]) e si salva tutto con Salva rapportino.
 *
 * Un lavoro Inviato o Fatturato (o per chi legge soltanto) si vede col suo riepilogo, senza Cambia. Niente firma
 * (06/11/2026: "La firma non ha più senso").
 *
 * @param numero il posto del lavoro nella fila: "Lavoro 2".
 * @param onTolto dopo "Togli questo lavoro": la pagina sceglie un altro lavoro.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun ColumnScope.LavoroNellaPagina(
    dati: Dati,
    giornata: GiornataStato,
    stato: ModuloStato,
    numero: Int,
    onTolto: () -> Unit,
) {
    val c = W.colori
    val ctx = LocalContext.current
    var legaTicket by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val visita = LocalVisita.current
    val avvisi = LocalAvvisi.current
    val perm = LocalPermessi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val storico by dati.storico.collectAsStateWithLifecycle()
    // Un lavoro di un mese vecchio (aperto dalla sezione Rapportini) sta solo nello storico.
    val vista: Vista? = viste.firstOrNull { it.rapportino.idLocale == stato.base.idLocale }
        ?: storico.firstOrNull { it.rapportino.idLocale == stato.base.idLocale }

    // Quello che sa il server (numero, stato, foto) può cambiare mentre il lavoro è aperto: si aggiorna la base, non i
    // campi che si stanno scrivendo.
    LaunchedEffect(vista?.rapportino?.id, vista?.rapportino?.stato, vista?.rapportino?.foto) {
        vista?.rapportino?.let { r ->
            stato.base = stato.base.copy(id = r.id, foto = r.foto, firma = r.firma, firmatario = r.firmatario,
                firmatoIl = r.firmatoIl, stato = r.stato, gruppo = r.gruppo,
                idTicket = r.idTicket.ifBlank { stato.base.idTicket }, numeroTicket = r.numeroTicket.ifBlank { stato.base.numeroTicket }, nonSiFattura = r.nonSiFattura)
        }
    }

    // Senza il permesso dei soldi (il collaboratore) niente tariffa, totale e conto: ore, km e spese sì.
    val costi = perm.costi
    // Chi vede i rapportini solo in lettura non cambia niente; un lavoro Inviato o Fatturato non si cambia.
    val scrive = perm.modifica(eu.stgm.wisper.rapportino.Moduli.RAPPORTINI)
    val bloccato = stato.base.bloccato || !scrive
    val clienteScelto: Cliente? = ana.cliente(stato.idCliente, if (stato.idCliente.isBlank()) stato.cliente else "")
    val regole = ana.regoleDi(clienteScelto, ana.commessa(stato.idCommessa))
    // I progetti (progetti.md §4.6): con la funzione accesa il lavoro vuole il progetto (solo Elettrodinamica, 06/11).
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val progettiAttivi = RegoleProgetti.attivi(sessione)
    stato.progettiAttivi = progettiAttivi
    // Commesse spenta (progetti.md §5, "i rapportini non chiedono più la commessa"): si sceglie solo il cliente.
    val commesseAccese = eu.stgm.wisper.rapportino.Moduli.COMMESSE !in sessione.interfaccia.funzioniSpente
    // La tariffa da proporre: il prezzo della commessa, se ce l'ha; altrimenti l'ultima del cliente (anche un lavoro di
    // questo rapportino, non ancora salvato).
    val prezzoCommessa = ana.commessa(stato.idCommessa)?.prezzoOrario?.takeIf { it > 0 }
    val nelRapportino = giornata.lavori.filter { it.idLocale != stato.base.idLocale }
    val propostaQui = nelRapportino.lastOrNull { l ->
        (stato.idCliente.isNotBlank() && l.idCliente == stato.idCliente) ||
            (stato.cliente.isNotBlank() && eu.stgm.wisper.rapportino.Anagrafiche.normalizza(l.cliente) == eu.stgm.wisper.rapportino.Anagrafiche.normalizza(stato.cliente))
    }?.tariffa?.takeIf { it > 0 }
    val proposta = prezzoCommessa ?: propostaQui ?: dati.tariffaProposta(clienteScelto, stato.cliente)
    // 12/11/2026 (km.md): i km da proporre (rapportino/Km.kt): l'ultima volta per lo stesso posto o la strada dallo studio.
    val kmProposte = run {
        val idProgetto = stato.idProgetto.ifBlank { stato.progettoNuovo?.idLocale.orEmpty() }
        val luogo = stato.progettoNuovo?.let { Km.Luogo(it.intestatoA, it.dove, null) }
            ?: ana.progetti.firstOrNull { stato.idProgetto.isNotBlank() && it.id == stato.idProgetto }?.let { Km.Luogo(it.intestatoA, it.dove, it.kmStudio) }
        // Dal più recente: gli altri lavori di questo rapportino (anche non ancora salvati) e quelli già scritti.
        val storico = (giornata.lavori + viste.map { it.rapportino }.filterNot { v -> giornata.lavori.any { it.idLocale == v.idLocale } })
            .filter { it.idLocale != stato.base.idLocale }.sortedByDescending { it.data }
            .map { Km.Storia(it.data.toString(), it.idCliente, it.idCommessa, it.idProgetto, it.km) }
        // Un viaggio una volta sola: con i km gia' in un lavoro prima di questo nel rapportino, Wisper non li riscrive da solo.
        val kmPrima = giornata.lavori.takeWhile { it.idLocale != stato.base.idLocale }.any { it.km > 0 }
        Km.proposte(Km.Lavoro(stato.idCliente, stato.idCommessa, idProgetto), luogo, ana.commessa(stato.idCommessa)?.kmStudio, clienteScelto?.kmStudio, storico, kmPrima)
    }
    LaunchedEffect(kmProposte.proposta, bloccato) { if (!bloccato) stato.proponiKm(kmProposte.proposta?.km) }
    // "Come il lavoro prima": l'ultimo lavoro scritto prima di questo nella fila.
    val prima = giornata.lavori.takeWhile { it.idLocale != stato.base.idLocale }.lastOrNull { it.cliente.isNotBlank() }

    // Nella visita la descrizione non si può scrivere (è sotto il velo): c'è già, appena scelto il cliente.
    LaunchedEffect(stato.cliente) {
        if (dati.esempio && !bloccato && stato.cliente.isNotBlank() && stato.descrizione.isBlank()) stato.descrizione = "Collaudo del quadro della linea 2"
    }

    // La tariffa libera si propone da sola: il prezzo della commessa o l'ultima usata per questo cliente.
    LaunchedEffect(stato.idCliente, stato.cliente, stato.idCommessa, regole.tariffaFissa) {
        if (!bloccato && !stato.tariffaToccata && regole.tariffaFissa == null) stato.tariffa = Numeri.scrivi(proposta)
    }

    var chiediTogli by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }

    // ---- foto ----
    var scattoInCorso by rememberSaveable { mutableStateOf<String?>(null) }
    val fotocamera = rememberFotoSistema { riuscito ->
        val percorso = scattoInCorso ?: return@rememberFotoSistema
        scattoInCorso = null
        val scatto = File(percorso)
        if (!riuscito) { scatto.delete(); return@rememberFotoSistema }
        scope.launch {
            runCatching { dati.preparaFoto(Uri.fromFile(scatto)) }.onSuccess { stato.fotoNuove.add(it); stato.speseAperte = true }
            scatto.delete()
        }
    }
    val galleria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            runCatching { dati.preparaFoto(uri) }.onSuccess { stato.fotoNuove.add(it); stato.speseAperte = true }
        }
    }
    fun scatta() {
        if (dati.esempio) { stato.fotoNuove.add(File("esempio-scontrino-${stato.fotoNuove.size}.jpg")); stato.speseAperte = true; return }
        val f = Immagini.fileScatto(ctx)
        scattoInCorso = f.path
        fotocamera.launch(FileProvider.getUriForFile(ctx, ctx.packageName + ".foto", f))
    }
    fun dallaGalleria() {
        if (dati.esempio) { scatta(); return }
        galleria.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    val r = stato.rapportino()
    val conto = if (!stato.cambiato && vista?.conto != null) vista.conto else Calcolo.calcola(r, regole)
    // Fase 5 (§3.3): legare dopo un lavoro scritto dalla strada solita, o toglierlo dal ticket.
    val conTicket = scrive && stato.base.id.isNotBlank() && stato.base.stato != Stato.FATTURATO && perm.vede(eu.stgm.wisper.rapportino.Moduli.TICKET) && !dati.esempio
    // L'unico lavoro di un rapportino nuovo non si toglie: per lasciar perdere c'e' la X in alto.
    val puoTogliere = scrive && eu.stgm.wisper.rapportino.Giornate.puoTogliere(stato.base) && !(giornata.nuova && giornata.lavori.size == 1)

    // ---------------------------------------------------------- la testa del lavoro
    Row(Modifier.fillMaxWidth().padding(top = 4.dp).heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Etichetta(if (giornata.lavori.size > 1) "Lavoro $numero di ${giornata.lavori.size}" else "Lavoro $numero", Modifier.weight(1f))
        if (!stato.nuovo) ParolaStato(stato.base.stato)
        if (conTicket || puoTogliere) {
            Spacer(Modifier.width(8.dp))
            PulsanteTondo(Icone.altro, "Altre azioni del lavoro", { menu = true })
        }
    }
    vista?.errore?.takeIf { it.isNotBlank() }?.let {
        Text("Il server non l'ha accettato: $it", style = Testi.secondario, color = c.rossoTesto)
    }
    if (stato.base.numeroTicket.isNotBlank() || stato.base.nonSiFattura.isNotBlank()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (stato.base.numeroTicket.isNotBlank()) Parola5("Ticket ${stato.base.numeroTicket}", colore = eu.stgm.wisper.rapportino.ColoreFase5.GRIGIO)
        if (stato.base.nonSiFattura.isNotBlank()) Parola5(stato.base.nonSiFattura, colore = eu.stgm.wisper.rapportino.ColoreFase5.GRIGIO)
    }

    if (bloccato) {
        PassoRiepilogo(stato, vista, conto, regole, dati, solaLettura = true, commesseAccese = commesseAccese)
    } else {
        // ---------------------------------------------------------- Per chi
        TitoloGruppo("Per chi")
        if (stato.perChiAperto) {
            PassoPerChi(stato, dati, viste, ana, regole, progettiAttivi, commesseAccese, prima = if (stato.nuovo) prima else null,
                onScelto = { visita?.azione(it); stato.chiudiPerChi() })
            if (stato.perChiAnnullabile) PulsanteTesto("Lascia com'era", { stato.annullaPerChi() }, Modifier.fillMaxWidth(), colore = c.testo)
        } else {
            PerChiScelto(stato, regole, commesseAccese)
        }

        // ---------------------------------------------------------- Il lavoro
        TitoloGruppo("Il lavoro")
        OreDiLavoro(stato)
        CampoTesto(
            stato.descrizione, { stato.descrizione = it; stato.errori = stato.errori - "descrizione" }, "Cosa hai fatto",
            Modifier.vaiAllErrore(stato, "descrizione"), righe = 4, errore = stato.errori["descrizione"],
        )

        // ---------------------------------------------------------- Strada e tariffa
        TitoloGruppo(if (costi) "Strada e tariffa" else "Strada")
        Chilometri(stato, regole, kmProposte)
        if (costi) Tariffa(stato, regole, proposta, clienteScelto, prezzoCommessa != null)

        // ---------------------------------------------------------- Altro
        TitoloGruppo("Altro")
        ViaggioEdExtra(stato, regole)
        SpeseDelLavoro(stato, vista, dati, onScatta = { scatta() }, onGalleria = { dallaGalleria() })
        AltroDelLavoro(stato, ana.ticketAttivo, dati)

        // ---------------------------------------------------------- Il conto
        if (costi) {
            TitoloGruppo("Il conto")
            ContoDelLavoro(r, conto, regole)
        }
    }

    if (chiediTogli) {
        FoglioConferma(
            titolo = "Togliere questo lavoro?",
            testo = "Esce dal rapportino quando lo salvi.",
            azione = "Togli il lavoro",
            onConferma = {
                chiediTogli = false
                val foto = giornata.togli(stato.base.idLocale)
                if (!dati.esempio) (foto + stato.fotoNuove).distinct().forEach { it.delete() }
                avvisi.mostra("Lavoro tolto: salva il rapportino")
                onTolto()
            },
            onAnnulla = { chiediTogli = false },
            pericolo = true,
        )
    }

    // ---------------------------------------------------------- il menu ⋯ del lavoro
    if (menu) {
        FoglioDalBasso({ menu = false }) {
            if (conTicket) {
                if (stato.base.conTicket) VoceMenu(Icone.chiudi, "Togli dal ticket", {
                    menu = false
                    scope.launch {
                        dati.fase5.legaRapportino(stato.base.id, null).onSuccess { r -> stato.base = stato.base.copy(idTicket = "", idLocaleTicket = "", numeroTicket = "", ticket = r.ticket); stato.ticket = r.ticket; dati.aggiorna(); avvisi.mostra("Tolto dal ticket") }
                            .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato tolto: riprova")) }
                    }
                })
                else VoceMenu(Icone.chiave, "Lega a un ticket", { menu = false; legaTicket = true })
            }
            if (puoTogliere) VoceMenu(Icone.cestino, "Togli questo lavoro", { menu = false; chiediTogli = true }, pericolo = true)
        }
    }

    if (legaTicket) FoglioLegaTicket(dati, stato.base, onChiudi = { legaTicket = false }, onLegato = { legaTicket = false })
}

/** Il titolo di un gruppo di campi della pagina (come le sezioni dell'editor del computer). */
@Composable
private fun TitoloGruppo(testo: String) {
    Text(testo, style = Testi.titoloScheda, color = W.colori.testo, modifier = Modifier.padding(top = 14.dp))
}

/**
 * Cliente, commessa e progetto scelti, ognuno col suo "Cambia" (che riapre la scelta da quel punto). La commessa col suo
 * codice (26ST047), come la conosce lo studio.
 */
@Composable
private fun PerChiScelto(stato: ModuloStato, regole: eu.stgm.wisper.rapportino.Regole, commesseAccese: Boolean) {
    val c = W.colori
    val r = stato.rapportino()
    Scheda(verticale = 4.dp, spazio = 0.dp) {
        RigaRiepilogo(
            r.cliente.ifBlank { "Manca il cliente" },
            if (stato.idCliente.isBlank()) "Cliente nuovo · tariffa libera" else if (regole.tariffaFissa != null) "Tariffa fissa" else "Tariffa libera",
            false,
        ) { stato.apriPerChi(commessa = false, progetto = false) }
        val conCommessa = r.idCommessa.isNotBlank() || r.codiceProposto.isNotBlank()
        if (commesseAccese || conCommessa) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
            RigaRiepilogo(
                listOf(r.idCommessa.ifBlank { r.codiceProposto }, r.commessa).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "Senza commessa" },
                if (r.idCommessa.isBlank() && r.codiceProposto.isNotBlank()) "Commessa nuova" else "Commessa",
                !commesseAccese,
            ) { stato.apriPerChi(commessa = true, progetto = false) }
        }
        // I progetti (progetti.md §4.6-7): dal 06/11/2026 obbligatorio solo per Elettrodinamica; per gli altri "Nessun
        // progetto", e senza commessa niente riga.
        if (r.conProgetto || (stato.progettiAttivi && (stato.progettoRichiesto || conCommessa))) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
            RigaRiepilogo(
                r.etichettaProgetto.ifBlank { if (stato.progettoRichiesto) "Manca il progetto" else "Nessun progetto" },
                r.progettoIntestatoA.takeIf { it.isNotBlank() }?.let { "Intestato a $it" } ?: "Progetto",
                !stato.progettiAttivi,
            ) { if (conCommessa || stato.progettoRichiesto) stato.apriPerChi(commessa = true, progetto = true) else stato.apriPerChi(commessa = false, progetto = false) }
        }
    }
    (stato.errori["cliente"] ?: stato.errori["progetto"])?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
}

/** Le ore di lavoro: il più e il meno, e 4, 6, 8 a un tocco. */
@Composable
private fun OreDiLavoro(stato: ModuloStato) {
    val c = W.colori
    val visita = LocalVisita.current
    Scheda(Modifier.vaiAllErrore(stato, "oreLavoro")) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Ore di lavoro", style = Testi.titoloSezione, color = c.testo, modifier = Modifier.weight(1f))
            Stepper(Numeri.ore(Numeri.leggi(stato.oreLavoro) ?: 0.0), { stato.cambia("oreLavoro", -0.5) }, { stato.cambia("oreLavoro", 0.5) }, "lavoro")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(4.0, 6.0, 8.0).forEach { h ->
                Pillola(
                    Numeri.ore(h), (Numeri.leggi(stato.oreLavoro) ?: 0.0) == h,
                    {
                        stato.oreLavoro = Numeri.scrivi(h); stato.errori = stato.errori - "oreLavoro"
                        visita?.azione("ore-${h.toInt()}")
                    },
                    Modifier.weight(1f).bersaglio("ore-${h.toInt()}").portaInVista("ore-${h.toInt()}"),
                )
            }
        }
        stato.errori["oreLavoro"]?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
    }
}

/**
 * I chilometri (12/11/2026, km.md): in un lavoro nuovo li scrive Wisper (ModuloStato.proponiKm); le pillole "Ultima volta"
 * (l'ultimo lavoro per lo stesso posto), "Dallo studio" (la strada dallo studio, andata e ritorno) e "Senza auto".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Chilometri(stato: ModuloStato, regole: eu.stgm.wisper.rapportino.Regole, proposte: Km.Proposte) {
    val c = W.colori
    val visita = LocalVisita.current
    Scheda(Modifier.vaiAllErrore(stato, "km")) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Chilometri", style = Testi.titoloSezione, color = c.testo, modifier = Modifier.weight(1f))
            CampoTesto(
                stato.km, { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) stato.scegliKm(t) }, null,
                Modifier.width(128.dp), segnaposto = "0", tastiera = KeyboardType.Decimal, suffisso = "km",
                stile = Testi.titoloScheda, errore = stato.errori["km"],
            )
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val ultima = proposte.ultima?.takeIf { it != proposte.studio }
            if (ultima != null) {
                Pillola(
                    "Ultima volta · ${Numeri.scrivi(ultima)} km", Numeri.leggi(stato.km) == ultima,
                    { stato.scegliKm(Numeri.scrivi(ultima)); visita?.azione("km-ultimi") },
                    Modifier.bersaglio("km-ultimi").portaInVista("km-ultimi"), altezza = 44.dp,
                )
            }
            proposte.studio?.let { km ->
                Pillola("Dallo studio · ${Numeri.scrivi(km)} km", Numeri.leggi(stato.km) == km, { stato.scegliKm(Numeri.scrivi(km)); visita?.azione("km-ultimi") },
                    if (ultima == null) Modifier.bersaglio("km-ultimi").portaInVista("km-ultimi") else Modifier, altezza = 44.dp)
            }
            Pillola("Senza auto", stato.km.isNotBlank() && Numeri.leggi(stato.km) == 0.0, { stato.scegliKm("0") }, altezza = 44.dp)
        }
        if (!regole.kmRimborsati) Text("Questo cliente non rimborsa i km", style = Testi.piccolo, color = c.tenue)
    }
}

/** La tariffa: fissa per il cliente, o quella scritta qui (proposta: il prezzo della commessa o l'ultima usata). */
@Composable
private fun Tariffa(
    stato: ModuloStato,
    regole: eu.stgm.wisper.rapportino.Regole,
    proposta: Double?,
    cliente: Cliente?,
    /** La tariffa proposta e' il prezzo della commessa, non l'ultima del cliente. */
    daCommessa: Boolean,
) {
    val c = W.colori
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp).vaiAllErrore(stato, "tariffa"), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(if (regole.tariffaFissa != null) "Tariffa fissa ${stato.cliente}" else "Tariffa oraria", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
            if (regole.tariffaFissa == null) Text(
                when {
                    stato.cliente.isBlank() -> "scegli prima il cliente"
                    daCommessa && Numeri.leggi(stato.tariffa) == proposta -> "il prezzo della commessa"
                    daCommessa -> "la commessa è a ${Numeri.scrivi(proposta)} €/h"
                    proposta != null && Numeri.leggi(stato.tariffa) == proposta -> "l'ultima usata per ${(cliente?.nome ?: stato.cliente).substringBefore(' ')}"
                    proposta != null -> "l'ultima volta era ${Numeri.scrivi(proposta)} €/h"
                    else -> "prima volta per questo cliente"
                },
                style = Testi.piccolo, color = c.tenue,
            )
        }
        if (regole.tariffaFissa != null) {
            Text(
                "${Numeri.scrivi(regole.tariffaFissa)} €/h", style = Testi.forte, color = c.testo,
                modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(c.superficie2).padding(horizontal = 12.dp, vertical = 10.dp),
            )
        } else {
            CampoTesto(
                stato.tariffa, { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) { stato.tariffa = t; stato.tariffaToccata = true; stato.errori = stato.errori - "tariffa" } },
                null, Modifier.width(132.dp), segnaposto = "0", tastiera = KeyboardType.Decimal, suffisso = "€/h", stile = Testi.forteGrande,
            )
        }
    }
    stato.errori["tariffa"]?.let { Text(it, style = Testi.secondario, color = c.rossoTesto, modifier = Modifier.padding(horizontal = 4.dp)) }
}

/** Le ore di viaggio (pagate o no, per il cliente) e, se aperte, le ore extra. */
@Composable
private fun ViaggioEdExtra(stato: ModuloStato, regole: eu.stgm.wisper.rapportino.Regole) {
    val c = W.colori
    Scheda(Modifier.vaiAllErrore(stato, "oreViaggio", "oreExtra")) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Viaggio", style = Testi.titoloSezione, color = c.testo)
                Text(if (regole.pagaViaggio) "pagato" else "non pagato", style = Testi.piccolo, color = c.tenue)
            }
            Stepper(Numeri.ore(Numeri.leggi(stato.oreViaggio) ?: 0.0), { stato.cambia("oreViaggio", -0.5) }, { stato.cambia("oreViaggio", 0.5) }, "viaggio")
        }
        if (stato.extraAperto) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Extra", style = Testi.titoloSezione, color = c.testo)
                    if (regole.maggExtra > 0) Text("+${Numeri.scrivi(regole.maggExtra)}%", style = Testi.piccolo, color = c.tenue)
                }
                Stepper(Numeri.ore(Numeri.leggi(stato.oreExtra) ?: 0.0), { stato.cambia("oreExtra", -0.5) }, { stato.cambia("oreExtra", 0.5) }, "extra")
            }
        }
    }
}

/** Le spese: importo e di cosa, gli scontrini fotografati o presi dalla galleria. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SpeseDelLavoro(stato: ModuloStato, vista: Vista?, dati: Dati, onScatta: () -> Unit, onGalleria: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val remote = stato.base.foto
    val inAttesa = vista?.fotoInAttesa.orEmpty()
    val nessuna = remote.isEmpty() && inAttesa.isEmpty() && stato.fotoNuove.isEmpty()
    Scheda(Modifier.vaiAllErrore(stato, "spese")) {
        Text("Spese", style = Testi.titoloSezione, color = c.testo)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CampoTesto(
                stato.spese, { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) { stato.spese = t; stato.errori = stato.errori - "spese" } },
                "Importo", Modifier.weight(1f), segnaposto = "0", tastiera = KeyboardType.Decimal, suffisso = "€", errore = stato.errori["spese"],
            )
            CampoTesto(stato.noteSpese, { stato.noteSpese = it }, "Di cosa", Modifier.weight(1.4f), segnaposto = "Pranzo, pedaggio…")
        }
        if (!nessuna) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                remote.forEach { f ->
                    RiquadroFoto(Immagini.fotoLocale(ctx, f.id), onApri = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(f.url))) },
                        onTogli = { dati.togliFoto(stato.base.idLocale, f, null) })
                }
                inAttesa.forEach { f -> RiquadroFoto(f, null, onTogli = { dati.togliFoto(stato.base.idLocale, null, f) }) }
                stato.fotoNuove.forEach { f -> RiquadroFoto(f, null, onTogli = { stato.fotoNuove.remove(f); if (!dati.esempio) f.delete() }) }
            }
        }
        // Ognuno largo quanto la sua scritta: se non stanno in una riga, "Dalla galleria" va sotto (mai scritte tagliate).
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PulsanteBordo(
                if (nessuna) "Fotografa lo scontrino" else "Un altro scontrino", onScatta,
                Modifier.bersaglio("scontrino").portaInVista("scontrino"), icona = Icone.fotocamera, altezza = 48.dp, tratteggiato = true,
            )
            PulsanteBordo("Dalla galleria", onGalleria, icona = Icone.galleria, altezza = 48.dp)
        }
    }
}

/**
 * Quello che serve di rado: chiuso in una riga di pillole finché non serve (ore extra, luogo, nota, strumenti). Dalla
 * 1.4.0 le indennità (servizi.md §2): le righe sopra le pillole, "+ Indennità" sempre per ultima.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.AltroDelLavoro(stato: ModuloStato, ticketAttivo: Boolean, dati: Dati) {
    // Fase 6 (§3.9): gli strumenti usati, chiusi in una riga come la nota; aperti se il rapportino ne ha.
    val conMezzi = LocalPermessi.current.vede(eu.stgm.wisper.rapportino.Moduli.MEZZI)
    val avvisi = LocalAvvisi.current
    if (stato.luogoAperto) CampoTesto(stato.luogo, { stato.luogo = it }, "Luogo")
    if (ticketAttivo || stato.ticket.isNotBlank()) CampoTesto(stato.ticket, { stato.ticket = it }, "Ticket")
    if (stato.notaAperta) CampoTesto(stato.noteInterne, { stato.noteInterne = it }, "Nota per te, non va al cliente", righe = 2)
    if (conMezzi && stato.strumentiAperti) StrumentiUsati(stato, dati)
    RigheIndennita(
        stato.indennita.orEmpty(), LocalPermessi.current.costi,
        onApri = { stato.apriIndennita(it) },
        onTogli = { n ->
            val prima = stato.indennita
            stato.togliIndennita(n)
            avvisi.mostra("Indennità tolta", annulla = { stato.indennita = prima })
        },
    )
    val chiusi = listOfNotNull(
        if (!stato.extraAperto) "+ Ore extra" to { stato.extraAperto = true } else null,
        if (!stato.luogoAperto) "+ Luogo" to { stato.luogoAperto = true } else null,
        if (!stato.notaAperta) "+ Una nota per te" to { stato.notaAperta = true } else null,
        if (conMezzi && !stato.strumentiAperti) "+ Strumenti usati" to { stato.strumentiAperti = true; if (stato.strumenti == null) stato.strumenti = emptyList() } else null,
        // Sempre l'ultima: un lavoro può avere più indennità.
        "+ Indennità" to { stato.nuovaIndennita() },
    )
    if (chiusi.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        chiusi.forEach { (testo, apri) -> Pillola(testo, false, apri, altezza = 44.dp) }
    }
}

/** Il conto del lavoro (come la colonna a destra del computer): ore per tariffa, km, spese e il totale. */
@Composable
private fun ContoDelLavoro(r: eu.stgm.wisper.rapportino.Rapportino, conto: eu.stgm.wisper.rapportino.Conto, regole: eu.stgm.wisper.rapportino.Regole) {
    val c = W.colori
    Scheda(verticale = 16.dp, spazio = 8.dp) {
        val orePagate = r.oreLavoro + r.oreExtra + if (conto.pagaViaggio || regole.pagaViaggio) r.oreViaggio else 0.0
        RigaConto("Ore · ${Numeri.ore(orePagate)} × ${Numeri.scrivi(conto.tariffa)} €", Numeri.euro(conto.compensoOre))
        RigaConto("Km · ${Numeri.scrivi(r.km)} × ${Numeri.scrivi(conto.euroKm)} €", Numeri.euro(conto.rimborsoKm))
        RigaConto("Spese", Numeri.euro(r.spese))
        if (!r.indennita.isNullOrEmpty() || conto.indennita > 0) RigaConto("Indennità", Numeri.euro(conto.indennita))
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.bordoScheda))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text("Totale del lavoro", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
            EuroAnimati(conto.totale, Testi.titoloScheda)
        }
    }
}

/** Dopo Salva rapportino con qualcosa che manca: la pagina scorre fino al primo campo con l'errore. */
@OptIn(ExperimentalFoundationApi::class)
private fun Modifier.vaiAllErrore(stato: ModuloStato, vararg campi: String): Modifier = composed {
    val richiesta = remember { BringIntoViewRequester() }
    var alto by remember { mutableStateOf(0) }
    // Sotto il campo resta lo spazio per l'avviso (se no copre la frase rossa).
    val spazio = with(LocalDensity.current) { 120.dp.toPx() }
    val volta = stato.mostraErrore
    LaunchedEffect(volta) {
        if (volta > 0 && stato.primoErrore?.let { it in campi } == true) {
            delay(150)
            richiesta.bringIntoView(Rect(0f, 0f, 1f, alto + spazio))
        }
    }
    this.bringIntoViewRequester(richiesta).onSizeChanged { alto = it.height }
}

/**
 * Nella visita guidata la pagina scorre da sola fino all'elemento del passo (le ore, i km, lo scontrino), lasciando
 * sotto lo spazio per il fumetto.
 */
@OptIn(ExperimentalFoundationApi::class)
internal fun Modifier.portaInVista(id: String): Modifier = composed {
    val v = LocalVisita.current
    val qui = v != null && v.attiva && v.corrente.bersaglio == id
    val richiesta = remember { BringIntoViewRequester() }
    var alto by remember { mutableStateOf(0) }
    val spazio = with(LocalDensity.current) { 220.dp.toPx() }
    LaunchedEffect(qui) {
        if (qui) {
            delay(120)
            richiesta.bringIntoView(Rect(0f, 0f, 1f, alto + spazio))
        }
    }
    this.bringIntoViewRequester(richiesta).onSizeChanged { alto = it.height }
}

// ============================================================================ Per chi

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ColumnScope.PassoPerChi(
    stato: ModuloStato,
    dati: Dati,
    viste: List<Vista>,
    ana: eu.stgm.wisper.rapportino.Anagrafiche,
    regole: eu.stgm.wisper.rapportino.Regole,
    progettiAttivi: Boolean,
    commesseAccese: Boolean,
    /** Dal secondo lavoro in poi: il lavoro prima, per "Come il lavoro prima" (stesso cliente, commessa e progetto). */
    prima: eu.stgm.wisper.rapportino.Rapportino? = null,
    onScelto: (String) -> Unit,
) {
    val c = W.colori
    val altri = viste.filterNot { it.rapportino.idLocale == stato.base.idLocale }.map { it.rapportino }

    /** Scelto il cliente: si sceglie la commessa; con Commesse spenta si va avanti senza. */
    fun dopoCliente(azione: String) {
        stato.commessa = ""; stato.idCommessa = ""; stato.codiceProposto = ""
        stato.togliProgetto()
        stato.errori = stato.errori - "cliente"
        if (commesseAccese) stato.sceltaCommessa = true else onScelto(azione)
    }

    /**
     * Scelta la commessa: con i progetti accesi si sceglie il progetto. Per Elettrodinamica e' obbligatorio (uno solo
     * aperto: e' gia' scelto); per gli altri clienti (06/11/2026) e' facoltativo: senza progetti aperti si va avanti con
     * "Nessun progetto" (dal riepilogo lo si sceglie lo stesso), altrimenti si sceglie, anche "Nessun progetto".
     */
    fun dopoCommessa(azione: String) {
        stato.togliProgetto()
        if (!progettiAttivi) { onScelto(azione); return }
        val obbligatorio = RegoleProgetti.progettoObbligatorio(stato.cliente)
        val commessa = stato.idCommessa.ifBlank { stato.codiceProposto }
        if (!obbligatorio && commessa.isBlank()) { onScelto(azione); return }
        val aperti = RegoleProgetti.apertiDi(ana, altri, commessa)
        if (obbligatorio && aperti.size == 1) { stato.scegliProgetto(aperti.first()); onScelto(azione); return }
        if (!obbligatorio && aperti.isEmpty()) { onScelto(azione); return }
        stato.sceltaCommessa = true
        stato.sceltaProgetto = true
    }

    // Il titolo "Per chi" e' della pagina; la data e' del rapportino (si cambia li'), non del lavoro.

    if (!stato.sceltaCommessa || !commesseAccese) {
        // rapportino-lavori.md §5.2: dal secondo lavoro, in cima, lo stesso cliente con la stessa commessa e lo stesso
        // progetto; ore, km e lavoro nuovi.
        if (prima != null && prima.cliente.isNotBlank() && !stato.sceltaCommessa) {
            SchedaScelta(
                nome = prima.cliente,
                titolo = "Come il lavoro prima",
                sotto = prima.cliente,
                piccolo = listOf(prima.idCommessa.ifBlank { prima.codiceProposto }.ifBlank { prima.commessa }, prima.etichettaProgetto).filter { it.isNotBlank() }.joinToString(" · "),
                modifier = Modifier.bersaglio("come-prima"),
            ) {
                stato.cliente = prima.cliente; stato.idCliente = prima.idCliente
                stato.commessa = prima.commessa; stato.idCommessa = prima.idCommessa; stato.codiceProposto = prima.codiceProposto
                stato.idProgetto = prima.idProgetto; stato.progetto = prima.progetto; stato.progettoDescrizione = prima.progettoDescrizione
                stato.progettoIntestatoA = prima.progettoIntestatoA; stato.progettoNuovo = prima.progettoNuovo
                prima.tariffa?.let { stato.tariffa = Numeri.scrivi(it); stato.tariffaToccata = true }
                stato.errori = stato.errori - "cliente" - "progetto"
                onScelto("come-prima")
            }
        }
        val recenti = Riepiloghi.recenti(viste.filterNot { it.rapportino.idLocale == stato.base.idLocale }, ana, conProgetti = progettiAttivi, soloClienti = !commesseAccese)
        if (recenti.isNotEmpty()) Etichetta("Recenti", Modifier.padding(top = 4.dp))
        recenti.forEachIndexed { i, rc ->
            val pr = rc.progetto
            SchedaScelta(
                nome = rc.cliente,
                titolo = rc.cliente,
                sotto = pr?.etichetta ?: rc.commessa.ifBlank { if (commesseAccese) "Senza commessa" else "" },
                piccolo = if (pr != null) listOf(rc.idCommessa, rc.commessa).filter { it.isNotBlank() }.joinToString(" · ") else rc.idCommessa,
                modifier = Modifier.bersaglio("recente-$i"),
            ) {
                stato.cliente = rc.cliente; stato.idCliente = rc.idCliente
                if (!commesseAccese) { dopoCliente("recente-$i"); return@SchedaScelta }
                stato.commessa = rc.commessa; stato.idCommessa = rc.idCommessa; stato.codiceProposto = ""
                stato.errori = stato.errori - "cliente"
                when {
                    pr != null -> { stato.scegliProgetto(pr); onScelto("recente-$i") }
                    // Un recente senza progetto di un cliente che non lo vuole: si riprende com'era, senza progetto.
                    progettiAttivi && !RegoleProgetti.progettoObbligatorio(rc.cliente) -> onScelto("recente-$i")
                    else -> dopoCommessa("recente-$i")
                }
            }
        }
        CampoTesto(
            stato.ricerca, { stato.ricerca = it }, "Altro cliente", Modifier.padding(top = 4.dp),
            segnaposto = "Scrivi il nome", iconaInizio = Icone.cerca, errore = stato.errori["cliente"],
        )
        val testo = stato.ricerca.trim()
        if (testo.isNotEmpty()) {
            val trovati = ana.clienti.filter { cl ->
                (listOf(cl.nome) + cl.alias).any { it.contains(testo, ignoreCase = true) }
            }.sortedBy { it.nome.lowercase() }.take(6)
            trovati.forEach { cl ->
                SchedaScelta(nome = cl.nome, titolo = cl.nome, sotto = if (cl.tariffaFissa != null) "Tariffa fissa" else "", piccolo = "", compatta = true) {
                    stato.cliente = cl.nome; stato.idCliente = cl.id
                    dopoCliente("cliente")
                }
            }
            // Fase 6 (§8.4): l'esterno scrive solo sulle commesse dei suoi incarichi (cliente o commessa nuovi no).
            if (!dati.sessione.value.esterno && trovati.none { it.nome.equals(testo, ignoreCase = true) }) {
                // Un cliente nuovo ha la tariffa libera: Elettrodinamica, l'unica fissa, c'è già.
                PulsanteBordo("Cliente nuovo «$testo»", {
                    stato.cliente = testo; stato.idCliente = ""
                    dopoCliente("cliente")
                }, Modifier.fillMaxWidth(), icona = Icone.piu, tratteggiato = true)
            }
        }
    } else if (stato.sceltaProgetto) {
        SceltaProgetto(stato, dati, ana, altri, onIndietro = { stato.sceltaProgetto = false }, onScelto = { onScelto("progetto") })
    } else {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
            Iniziali(stato.cliente, dimensione = 44.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(stato.cliente, style = Testi.forteGrande, color = c.testo)
                Text(if (stato.idCliente.isBlank()) "Cliente nuovo · tariffa libera" else if (regole.tariffaFissa != null) "Tariffa fissa" else "Tariffa libera", style = Testi.secondario, color = c.tenue)
            }
            PulsanteTesto("Cambia", { stato.sceltaCommessa = false })
        }
        Etichetta("Commessa", Modifier.padding(top = 6.dp))
        stato.errori["cliente"]?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        val commesse = if (stato.idCliente.isBlank()) emptyList() else ana.commesseAperteDi(stato.idCliente)
        commesse.forEach { m ->
            SchedaScelta(nome = stato.cliente, titolo = m.descrizione, sotto = m.indirizzo, piccolo = m.id, compatta = true) {
                stato.commessa = m.descrizione; stato.idCommessa = m.id; stato.codiceProposto = ""
                stato.errori = stato.errori - "cliente"
                dopoCommessa("commessa")
            }
        }
        val esterno = dati.sessione.value.esterno
        // Per Elettrodinamica coi progetti accesi la commessa serve (il progetto sta sotto la commessa): "Senza commessa"
        // non c'e'. Per gli altri clienti c'e' di nuovo (06/11/2026).
        if (!esterno && !stato.progettoRichiesto) PulsanteBordo("Senza commessa", { stato.commessa = ""; stato.idCommessa = ""; stato.codiceProposto = ""; stato.togliProgetto(); onScelto("commessa") }, Modifier.fillMaxWidth())
        var nuova by remember { mutableStateOf("") }
        if (!esterno) CampoTesto(nuova, { nuova = it }, "Commessa nuova", segnaposto = "Come la chiami tu")
        if (nuova.isNotBlank() && !esterno) {
            // Il codice della commessa nuova si sa subito, anche senza rete.
            val codice = ana.prossimoCodiceCommessa(stato.data.year)
            PulsanteBordo("Usa «${nuova.trim()}» · $codice", {
                stato.commessa = nuova.trim(); stato.idCommessa = ""; stato.codiceProposto = codice
                stato.errori = stato.errori - "cliente"
                dopoCommessa("commessa")
            }, Modifier.fillMaxWidth(), icona = Icone.piu)
        }
    }
}

/** La data del rapportino con "Cambia" (06/11/2026: e' del rapportino, vale per i suoi lavori da inviare). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RigaData(data: LocalDate, abilitato: Boolean, onCambia: (LocalDate) -> Unit) {
    val c = W.colori
    var aperto by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(16.dp)).background(c.foglio)
            .border(1.5.dp, c.bordoCampo, RoundedCornerShape(16.dp)).clickable(enabled = abilitato) { aperto = true }
            .padding(horizontal = 16.dp, vertical = 8.dp).bersaglio("data-rapportino"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icone.calendario, null, tint = c.testo, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Text(dataLungaIt(data), style = Testi.pulsanteSecondario, color = c.testo, modifier = Modifier.weight(1f))
        if (abilitato) Text("Cambia", style = Testi.pulsanteSecondario, color = c.collegamento)
    }
    if (aperto) {
        val s = rememberDatePickerState(initialSelectedDateMillis = data.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { aperto = false },
            confirmButton = {
                TextButton(onClick = {
                    s.selectedDateMillis?.let { onCambia(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                    aperto = false
                }) { Text("Ok", color = W.colori.testo) }
            },
            dismissButton = { TextButton(onClick = { aperto = false }) { Text("Annulla", color = W.colori.testo) } },
        ) { DatePicker(state = s) }
    }
}

/** Una scheda da toccare per scegliere: cliente e commessa in un colpo solo. */
@Composable
private fun SchedaScelta(
    nome: String,
    titolo: String,
    sotto: String,
    piccolo: String,
    modifier: Modifier = Modifier,
    compatta: Boolean = false,
    /** Al posto delle iniziali (i progetti: tutti dello stesso cliente). */
    icona: androidx.compose.ui.graphics.vector.ImageVector? = null,
    onClick: () -> Unit,
) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().heightIn(min = if (compatta) 64.dp else 84.dp).clip(RoundedCornerShape(20.dp)).background(c.scheda)
            .border(1.dp, c.bordoScheda, RoundedCornerShape(20.dp)).clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icona != null) Box(Modifier.size(40.dp).clip(RoundedCornerShape(20.dp)).background(c.superficie2), contentAlignment = Alignment.Center) {
            Icon(icona, null, tint = c.testo, modifier = Modifier.size(20.dp))
        } else Iniziali(nome, dimensione = if (compatta) 40.dp else 48.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            // I testi vanno a capo (06/11/2026: niente puntini sulle righe), anche la commessa.
            Text(titolo, style = Testi.forteGrande, color = c.testo)
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Medium), color = c.testo2)
            if (piccolo.isNotBlank()) Text(piccolo, style = Testi.piccolo, color = c.tenue)
        }
        Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun RiquadroFoto(file: File?, onApri: (() -> Unit)?, onTogli: () -> Unit) {
    val c = W.colori
    Box(
        Modifier.size(84.dp).clip(RoundedCornerShape(14.dp)).background(c.superficie2)
            .border(1.dp, c.bordoScheda, RoundedCornerShape(14.dp))
            .let { if (onApri != null) it.clickable(onClick = onApri) else it },
        contentAlignment = Alignment.Center,
    ) {
        val bitmap = file?.let { f ->
            produceState<Bitmap?>(null, f.path) { value = withContext(Dispatchers.IO) { if (f.exists()) Immagini.miniatura(f, 360) else null } }.value
        }
        if (bitmap != null) Image(bitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Icon(Icone.scontrino, null, tint = c.tenue, modifier = Modifier.size(28.dp))
        Box(
            Modifier.align(Alignment.TopEnd).padding(4.dp).size(28.dp).clip(CircleShape).background(c.testo.copy(alpha = 0.7f))
                .clickable(onClick = onTogli).semantics { contentDescription = "Togli lo scontrino" },
            contentAlignment = Alignment.Center,
        ) { Icon(Icone.chiudi, null, tint = c.foglio, modifier = Modifier.size(14.dp)) }
    }
}

// ============================================================================ Riepilogo

@Composable
private fun ColumnScope.PassoRiepilogo(
    stato: ModuloStato,
    vista: Vista?,
    conto: eu.stgm.wisper.rapportino.Conto,
    regole: eu.stgm.wisper.rapportino.Regole,
    dati: Dati,
    onCambia: (Int) -> Unit = {},
    /** Chi vede i rapportini solo in lettura: niente "Cambia". */
    solaLettura: Boolean = false,
    /** Commesse spenta: sotto il cliente non si scrive "Senza commessa" (una commessa gia' messa resta). */
    commesseAccese: Boolean = true,
) {
    val c = W.colori
    val ctx = LocalContext.current
    val bloccato = stato.base.bloccato || solaLettura
    val r = stato.rapportino()

    // La testa (Lavoro N, lo stato, il ticket, l'errore del server) e' della pagina: qui le righe e il conto.
    Scheda(verticale = 4.dp, spazio = 0.dp) {
        // La commessa col suo codice (26ST047), non con la descrizione: come la conosce lo studio.
        RigaRiepilogo(r.cliente.ifBlank { "Manca il cliente" }, r.idCommessa.ifBlank { r.codiceProposto }.ifBlank { r.commessa }.ifBlank { if (commesseAccese) "Senza commessa" else "Cliente" }, bloccato) { onCambia(1) }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
        // I progetti (progetti.md §4.6-7): la riga Progetto, "ED-003 · Quadro QE1" e a chi e' intestato.
        // Dal 06/11/2026 obbligatorio solo per Elettrodinamica: per gli altri "Nessun progetto", e senza commessa niente riga.
        val conCommessa = r.idCommessa.isNotBlank() || r.codiceProposto.isNotBlank()
        if (r.conProgetto || (stato.progettiAttivi && (stato.progettoRichiesto || conCommessa))) {
            RigaRiepilogo(
                r.etichettaProgetto.ifBlank { if (stato.progettoRichiesto) "Manca il progetto" else "Nessun progetto" },
                r.progettoIntestatoA.takeIf { it.isNotBlank() }?.let { "Intestato a $it" } ?: "Progetto",
                bloccato || !stato.progettiAttivi,
            ) { onCambia(if (conCommessa || stato.progettoRichiesto) PASSO_PROGETTO else 1) }
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
        }
        RigaRiepilogo(
            listOf("${Numeri.ore(r.oreLavoro)} di lavoro", r.oreViaggio.takeIf { it > 0 }?.let { "${Numeri.ore(it)} di viaggio" },
                r.oreExtra.takeIf { it > 0 }?.let { "${Numeri.ore(it)} extra" }).filterNotNull().joinToString(" · "),
            "${Numeri.scrivi(r.km)} km", bloccato,
        ) { onCambia(2) }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
        val scontrini = stato.base.foto.size + (vista?.fotoInAttesa?.size ?: 0) + stato.fotoNuove.size
        RigaRiepilogo(
            r.descrizione.ifBlank { "Manca il lavoro svolto" },
            if (r.spese > 0 || scontrini > 0) "Spese ${Numeri.euro(r.spese)}" + (if (scontrini > 0) " · $scontrini " + (if (scontrini == 1) "scontrino" else "scontrini") else "") else "Nessuna spesa",
            bloccato,
        ) { onCambia(3) }
        if (r.luogo.isNotBlank()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
            Text("Luogo · ${r.luogo}", style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, modifier = Modifier.padding(vertical = 12.dp))
        }
        // Fase 6 (§3.9): la riga Strumenti coi nomi e lo stato; Cambia riporta al passo 3.
        val strumenti = r.strumenti.orEmpty()
        if (strumenti.isNotEmpty()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.riga))
            RigaRiepilogo(
                "Strumenti: " + strumenti.joinToString(", ") { it.riga },
                if (strumenti.any { it.statoAllora == eu.stgm.wisper.rapportino.ContiMezzi.SCADUTA }) "Uno strumento ha la taratura scaduta" else "Strumenti usati",
                bloccato,
            ) { onCambia(3) }
        }
    }

    // 1.4.0: le indennità del lavoro, in lettura (si cambiano solo da Da inviare).
    RigheIndennita(r.indennita.orEmpty(), LocalPermessi.current.costi, onApri = null, onTogli = null)

    if (LocalPermessi.current.costi) Scheda(verticale = 16.dp, spazio = 8.dp) {
        val orePagate = r.oreLavoro + r.oreExtra + if (conto.pagaViaggio || regole.pagaViaggio) r.oreViaggio else 0.0
        RigaConto("Ore · ${Numeri.ore(orePagate)} × ${Numeri.scrivi(conto.tariffa)} €", Numeri.euro(conto.compensoOre))
        RigaConto("Km · ${Numeri.scrivi(r.km)} × ${Numeri.scrivi(conto.euroKm)} €", Numeri.euro(conto.rimborsoKm))
        RigaConto("Spese", Numeri.euro(r.spese))
        if (!r.indennita.isNullOrEmpty() || conto.indennita > 0) RigaConto("Indennità", Numeri.euro(conto.indennita))
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.bordoScheda))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text("Totale", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
            EuroAnimati(conto.totale, Testi.totale)
        }
    }

    // Fase 7 (§12.6): Da firmare nel portale o Nel portale; "Firmato nel portale da …".
    if (!stato.nuovo) BloccoPortaleRapportino(dati, stato.base)
    // 06/11/2026: niente piu' firma del cliente nei rapportini. Le foto di un lavoro che non si cambia si guardano qui.
    if (bloccato) {
        if (stato.base.foto.isNotEmpty() || stato.fotoNuove.isNotEmpty()) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                stato.base.foto.forEach { f -> RiquadroFoto(Immagini.fotoLocale(ctx, f.id), { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(f.url))) }, {}) }
                stato.fotoNuove.forEach { f -> RiquadroFoto(f, null, {}) }
            }
        }
    }

    // Non va sul PDF del cliente: si vede solo qui.
    if (r.noteInterne.isNotBlank()) {
        Scheda {
            Etichetta("Nota per te")
            Text(r.noteInterne, style = Testi.testo, color = c.testo)
        }
    }
}

/** Un'immagine scaricata (la firma, il foglio firmato) ridotta al lato dato: una scansione intera pesa troppo. */
private fun immagineRidotta(byte: ByteArray, lato: Int): Bitmap? {
    val misure = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(byte, 0, byte.size, misure)
    var passo = 1
    while (maxOf(misure.outWidth, misure.outHeight) / (passo * 2) >= lato) passo *= 2
    return BitmapFactory.decodeByteArray(byte, 0, byte.size, BitmapFactory.Options().apply { inSampleSize = passo })
}

@Composable
private fun RigaRiepilogo(titolo: String, sotto: String, bloccato: Boolean, onCambia: () -> Unit) {
    val c = W.colori
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(titolo, style = Testi.forte, color = c.testo)
            Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue)
        }
        if (!bloccato) PulsanteTesto("Cambia", onCambia)
    }
}

/** "Cambia" sulla riga del progetto del riepilogo: non e' un passo, e' la scelta del progetto dentro il passo 1. */
private const val PASSO_PROGETTO = 11

/**
 * Il campo Progetto del rapportino (progetti.md §4.6): i progetti aperti della commessa scelta (anche quelli nati sul
 * telefono e ancora in coda) e, per chi puo' crearli, **Nuovo progetto** dentro il rapportino stesso: codice gia'
 * proposto (cambiabile), intestato a, descrizione. Il progetto nuovo parte col rapportino, anche senza rete.
 */
@Composable
private fun ColumnScope.SceltaProgetto(
    stato: ModuloStato,
    dati: Dati,
    ana: eu.stgm.wisper.rapportino.Anagrafiche,
    altri: List<eu.stgm.wisper.rapportino.Rapportino>,
    onIndietro: () -> Unit,
    onScelto: () -> Unit,
) {
    val c = W.colori
    val commessa = stato.idCommessa.ifBlank { stato.codiceProposto }
    val aperti = RegoleProgetti.apertiDi(ana, altri, commessa)
    val puoCrearlo = LocalPermessi.current.modifica(eu.stgm.wisper.rapportino.Moduli.PROGETTI)
    val idCliente = stato.idCliente.ifBlank { ana.commessa(commessa)?.idCliente.orEmpty() }

    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
        Iniziali(stato.cliente, dimensione = 44.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            // 07/11/2026: a capo, niente puntini (a 360 dp la commessa si tagliava).
            Text(stato.cliente, style = Testi.forteGrande, color = c.testo)
            Text(listOf(commessa, stato.commessa).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.tenue)
        }
        PulsanteTesto("Cambia", onIndietro)
    }
    Etichetta("Progetto", Modifier.padding(top = 6.dp))
    stato.errori["progetto"]?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
    // Per i clienti che non lo vogliono (06/11/2026) il progetto si puo' lasciare: "Nessun progetto" per primo.
    if (!stato.progettoRichiesto) {
        SchedaScelta(
            nome = "", titolo = "Nessun progetto", sotto = "", piccolo = "", compatta = true, icona = Icone.chiudi,
            modifier = Modifier.bersaglio("progetto-nessuno"),
        ) {
            stato.togliProgetto()
            onScelto()
        }
    }
    aperti.forEachIndexed { i, p ->
        SchedaScelta(
            nome = p.codice, titolo = p.etichetta,
            sotto = p.intestatoA.takeIf { it.isNotBlank() }?.let { "Intestato a $it" } ?: "",
            piccolo = if (p.inAttesa) "Nuovo, parte col rapportino" else "", compatta = true, icona = Icone.progetti,
            modifier = Modifier.bersaglio("progetto-$i"),
        ) {
            stato.scegliProgetto(p)
            onScelto()
        }
    }
    if (aperti.isEmpty() && !puoCrearlo && stato.progettoRichiesto) {
        Text("Questa commessa non ha progetti aperti. Chiedi all'ufficio di aprirne uno.", style = Testi.testo, color = c.testo2)
    }
    if (puoCrearlo) NuovoProgettoNelRapportino(stato, dati, ana, altri, commessa, idCliente, onScelto)
}

@Composable
private fun NuovoProgettoNelRapportino(
    stato: ModuloStato,
    dati: Dati,
    ana: eu.stgm.wisper.rapportino.Anagrafiche,
    altri: List<eu.stgm.wisper.rapportino.Rapportino>,
    commessa: String,
    idCliente: String,
    onScelto: () -> Unit,
) {
    var aperto by remember(commessa) { mutableStateOf(false) }
    // Il codice proposto, come lo proporrebbe il server: la stessa regola, anche senza rete.
    val propostoQui = remember(commessa, ana.progetti, altri.size) {
        RegoleProgetti.codiceProposto(ana, altri, commessa, idCliente, stato.data)
    }
    // Con la rete lo si chiede anche al server (vede tutti i progetti, anche per una commessa che nasce col rapportino).
    var propostoServer by remember(commessa) { mutableStateOf<String?>(null) }
    val proposto = propostoServer?.takeIf { it.isNotBlank() } ?: propostoQui
    var codice by remember(commessa) { mutableStateOf(proposto) }
    LaunchedEffect(aperto, commessa) {
        if (!aperto || propostoServer != null) return@LaunchedEffect
        val prima = codice
        dati.progetti.codice(commessa, idCliente).onSuccess { p ->
            propostoServer = p.codice
            // Si scrive nel campo solo se non lo si e' gia' cambiato a mano.
            if (p.codice.isNotBlank() && (prima.isBlank() || prima == propostoQui) && codice == prima) codice = p.codice
        }
    }
    var intestatoA by remember(commessa) { mutableStateOf("") }
    // 12/11/2026 (km.md): dove si lavora; lo stesso Intestato a di un altro progetto lo riempie da solo (finché non lo si cambia).
    var dove by remember(commessa) { mutableStateOf("") }
    var doveAuto by remember(commessa) { mutableStateOf("") }
    var descrizione by remember(commessa) { mutableStateOf("") }
    var errori by remember(commessa) { mutableStateOf(emptyMap<String, String>()) }

    if (!aperto) {
        PulsanteBordo("Nuovo progetto", { aperto = true; codice = proposto }, Modifier.fillMaxWidth().bersaglio("progetto-nuovo"), icona = Icone.piu, tratteggiato = true)
        return
    }
    Scheda {
        Text("Nuovo progetto", style = Testi.titoloScheda, color = W.colori.testo)
        CampoTesto(codice, { codice = it; errori = errori - "codice" }, "Codice", segnaposto = "Per esempio ED-001", errore = errori["codice"])
        CampoTesto(intestatoA, {
            intestatoA = it
            if (dove.isBlank() || dove == doveAuto) Km.doveDiIntestato(ana.progetti, it).let { d -> if (d.isNotBlank() || doveAuto.isNotBlank()) { dove = d; doveAuto = d } }
        }, "Intestato a", segnaposto = "Facoltativo")
        CampoTesto(dove, { dove = it }, "Dove", segnaposto = "Via, numero e comune")
        CampoTesto(descrizione, { descrizione = it; errori = errori - "descrizione" }, "Descrizione", segnaposto = "Per esempio Quadro QE1", errore = errori["descrizione"])
        PulsanteBordo("Usa questo progetto", {
            val e = mutableMapOf<String, String>()
            val cod = codice.trim()
            // Finche' Wisper non ha imparato la regola (meno di due codici) il codice si scrive a mano: senza, il server
            // rifiuterebbe il rapportino solo al salvataggio.
            if (cod.isBlank()) e["codice"] = "Scrivi il codice del progetto: dopo i primi due Wisper lo propone da solo"
            else if (RegoleProgetti.codiceGiaPreso(ana, altri, cod, idCliente) != null) e["codice"] = "Il codice $cod è già di un altro progetto di questo cliente"
            if (descrizione.isBlank()) e["descrizione"] = "Scrivi la descrizione del progetto"
            errori = e
            if (e.isEmpty()) {
                stato.nuovoProgetto(ProgettoNuovo(ProgettoNuovo.nuovoIdLocale(), cod, proposto.isNotBlank() && cod.equals(proposto, ignoreCase = true), intestatoA.trim(), descrizione.trim(), dove.trim()))
                onScelto()
            }
        }, Modifier.fillMaxWidth(), icona = Icone.spunta)
        PulsanteTesto("Annulla", { aperto = false; errori = emptyMap() }, Modifier.fillMaxWidth(), colore = W.colori.testo)
    }
}
