@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Caricamento
import eu.stgm.wisper.rapportino.Comunicazione
import eu.stgm.wisper.rapportino.Destinatario
import eu.stgm.wisper.rapportino.InfoPortale
import eu.stgm.wisper.rapportino.ModelloMessaggio
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Parole7
import eu.stgm.wisper.rapportino.Proposta
import eu.stgm.wisper.rapportino.Riferimento7
import eu.stgm.wisper.rapportino.Segnaposti
import eu.stgm.wisper.rapportino.Whatsapp
import eu.stgm.wisper.rapportino.istanteLocale
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/*
 * I pezzi comuni della fase 7 (fase7.md §12): le parole e i colori di comunicazioni e
 * portale, il messaggio pronto che apre WhatsApp e lo storico "L'hai mandato?", i fogli
 * che servono anche alle altre pagine (Pubblica nel portale, Rispondi nel portale, il file
 * arrivato dal cliente).
 */

// ---------------------------------------------------------------------------------- ricordi e giri

enum class SegmentoComunicazioni(val nome: String) { DA_MANDARE("Da mandare"), STORICO("Storico"), MODELLI("Modelli"), NOTIFICHE("Notifiche") }

enum class SegmentoPortale(val nome: String) { DA_GUARDARE("Da guardare"), CLIENTI("Clienti"), PUBBLICATI("Pubblicati"), ACCESSI("Accessi") }

object RicordoComunicazioni {
    var segmento by mutableStateOf(SegmentoComunicazioni.DA_MANDARE)
    /** Il filtro dello storico: "" tutti, whatsapp, email, portale, telefonata. */
    var canale by mutableStateOf("")
    var cerca by mutableStateOf("")
    /** Il cliente o la commessa da cui si arriva (la pillola con la ×). */
    var idCliente by mutableStateOf("")
    var idCommessa by mutableStateOf("")
    /** La comunicazione aperta dallo storico (la pagina la mostra anche senza rileggerla). */
    var aperta by mutableStateOf<Comunicazione?>(null)
    /** Il modello aperto e i segnaposti del server (la pagina del modello). */
    var modello by mutableStateOf<ModelloMessaggio?>(null)
    var segnaposti by mutableStateOf<Map<String, List<String>>>(emptyMap())

    /** Dalla Dashboard: {segmento: damandare | storico | modelli | notifiche, idCliente, idCommessa}. */
    fun mostra(segmento: String, idCliente: String = "", idCommessa: String = "") {
        this.segmento = when (segmento) {
            "storico" -> SegmentoComunicazioni.STORICO
            "modelli" -> SegmentoComunicazioni.MODELLI
            "notifiche" -> SegmentoComunicazioni.NOTIFICHE
            else -> SegmentoComunicazioni.DA_MANDARE
        }
        this.idCliente = idCliente
        this.idCommessa = idCommessa
    }
}

object RicordoPortale {
    var segmento by mutableStateOf(SegmentoPortale.DA_GUARDARE)
    var tipo by mutableStateOf("")
    var nonVisti by mutableStateOf(false)
    /** Accessi: "" tutti, "entrati", "azioni", "errori". */
    var accessi by mutableStateOf("")
    /** Il cliente a cui aprire il foglio Invita appena si arriva nella sua pagina. */
    var invita by mutableStateOf("")

    fun mostra(segmento: String) {
        this.segmento = when (segmento) {
            "clienti" -> SegmentoPortale.CLIENTI
            "pubblicati" -> SegmentoPortale.PUBBLICATI
            "accessi" -> SegmentoPortale.ACCESSI
            else -> SegmentoPortale.DA_GUARDARE
        }
    }
}

/** I giri delle letture della fase 7: dopo una scrittura in diretta si rileggono le pagine aperte. */
internal object Giri7 {
    var comunicazioni by mutableIntStateOf(0)
    var portale by mutableIntStateOf(0)
    fun tutto() { comunicazioni++; portale++ }
}

/**
 * Quando un'azione della fase 7 esce dalla coda (è arrivata al server), le pagine aperte
 * si rileggono: così una proposta usata o un file accettato spariscono coi dati del server.
 */
@Composable
fun SeguiCoda7(dati: Dati) {
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val quante = ops.count { it.fase7 && !it.rifiutata }
    var prima by remember { mutableIntStateOf(quante) }
    LaunchedEffect(quante) {
        if (quante < prima) Giri7.tutto()
        prima = quante
    }
}

@Composable
internal fun scriveComunicazioni(): Boolean = LocalPermessi.current.modifica(Moduli.COMUNICAZIONI)

@Composable
internal fun scrivePortale(): Boolean = LocalPermessi.current.modifica(Moduli.PORTALE)

/** I promemoria di pagamento: fatturazione 2 e i soldi (§3.15). */
@Composable
internal fun vedePagamenti(): Boolean = LocalPermessi.current.let { it.modifica(Moduli.FATTURAZIONE) && it.costi }

// ---------------------------------------------------------------------------------- parole e colori

/** "oggi alle 9:12", "ieri alle 16:42", "20/10 alle 8:02". */
internal fun quando7(istante: String, oggi: LocalDate = LocalDate.now()): String {
    val t = istanteLocale(istante) ?: return ""
    val ora = t.format(DateTimeFormatter.ofPattern("H:mm"))
    return when (t.toLocalDate()) {
        oggi -> "oggi alle $ora"
        oggi.minusDays(1) -> "ieri alle $ora"
        else -> t.format(DateTimeFormatter.ofPattern("dd/MM")) + " alle $ora"
    }
}

/** L'ora sola ("9:02"), per le righe raggruppate per giorno. */
internal fun ora7(istante: String): String = istanteLocale(istante)?.format(DateTimeFormatter.ofPattern("H:mm")).orEmpty()

/** "Oggi", "Ieri", "Martedì 20 ottobre": il nome del giorno di un gruppo dello storico. */
internal fun giorno7(istante: String, oggi: LocalDate = LocalDate.now()): String {
    val g = istanteLocale(istante)?.toLocalDate() ?: return "Senza data"
    return when (g) {
        oggi -> "Oggi"
        oggi.minusDays(1) -> "Ieri"
        else -> g.format(DateTimeFormatter.ofPattern("EEEE d MMMM", ITALIA)).replaceFirstChar { it.uppercase() }
    }
}

/** L'icona del canale nel suo colore (§12.1): WhatsApp verde scuro, Email blu, Portale viola, telefonate grigie; l'entrata con la freccia in dentro. */
@Composable
internal fun IconaCanale(canale: String, entrata: Boolean = false) {
    val c = W.colori
    val (icona, fondo, tinta) = when {
        entrata -> Triple(Icone.entrata, if (canale == "portale") c.violaFondo else c.superficie2, if (canale == "portale") c.violaTesto else c.testo2)
        canale == "whatsapp" -> Triple(Icone.whatsapp, c.firmatoFondo, c.firmatoTesto)
        canale == "email" -> Triple(Icone.email, c.inviatoFondo, c.inviatoTesto)
        canale == "portale" -> Triple(Icone.globo, c.violaFondo, c.violaTesto)
        canale == "nota" -> Triple(Icone.matita, c.superficie2, c.testo2)
        else -> Triple(Icone.telefono, c.superficie2, c.testo2)
    }
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(fondo), contentAlignment = Alignment.Center) {
        Icon(icona, null, tint = tinta, modifier = Modifier.size(20.dp))
    }
}

/** Un'icona colorata per una riga (verde, blu, rosso tenue, giallo, grigio). */
@Composable
internal fun IconaTinta(icona: ImageVector, tinta: String) {
    val c = W.colori
    val (fondo, colore) = when (tinta) {
        "verde" -> c.firmatoFondo to c.firmatoTesto
        "blu" -> c.inviatoFondo to c.inviatoTesto
        "rosso" -> c.rossoTenue to c.rossoTesto
        "giallo" -> c.gialloTenue to c.gialloTesto
        "viola" -> c.violaFondo to c.violaTesto
        else -> c.superficie2 to c.testo2
    }
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(fondo), contentAlignment = Alignment.Center) {
        Icon(icona, null, tint = colore, modifier = Modifier.size(20.dp))
    }
}

/**
 * Una parola con il suo colore (§12): verde, blu, giallo tenue, ambra, rosso tenue, grigio.
 * Mai solo il colore.
 */
@Composable
internal fun Parola7(parola: String, modifier: Modifier = Modifier) {
    val c = W.colori
    val (testo, fondo) = when (parola) {
        "Accettato", "Firmato", "Pagata", "Risolta", "Attivo", "Mandato", "Collegato", "Acceso", "Ha detto sì a WhatsApp", "Accesso al portale", "WhatsApp" -> c.firmatoTesto to c.firmatoFondo
        "Presa in carico", "Intervento fissato", "Da pagare", "Preparato", "Invitato", "Email" -> c.inviatoTesto to c.inviatoFondo
        "Da accettare", "Da firmare", "Da mandare", "Da guardare", "Da firmare nel portale", "Nuovo", "Non ancora visto" -> c.gialloTesto to c.gialloTenue
        "Scaduto", "Scadenza passata", "Pagata in parte", "In attesa" -> c.ambraTesto to c.ambraFondo
        "Errore", "Rifiutato", "Non si raggiunge", "Urgente" -> c.rossoTesto to c.rossoTenue
        "Portale", "Dal portale", "Dal cliente" -> c.violaTesto to c.violaFondo
        else -> c.fatturatoTesto to c.fatturatoFondo
    }
    Pillolina(parola, testo, fondo, modifier)
}

/** La pillola del portale di una cosa (§8.2): "Nel portale · visto il 23/10 alle 10:12" o "non ancora visto". */
@Composable
internal fun PillolaNelPortale(info: InfoPortale?, inCoda: Boolean? = null) {
    val c = W.colori
    val pubblicato = inCoda ?: (info?.pubblicato == true)
    if (!pubblicato) return
    when {
        inCoda == true && info?.pubblicato != true -> Pillolina("Nel portale · parte appena c'è rete", c.fatturatoTesto, c.fatturatoFondo)
        info?.daFirmare == true -> Pillolina("Da firmare nel portale", c.gialloTesto, c.gialloTenue)
        info?.vistoIl.isNullOrBlank() -> Pillolina("Nel portale · non ancora visto", c.gialloTesto, c.gialloTenue)
        else -> Pillolina("Nel portale · visto " + quando7(info!!.vistoIl).replace(" alle ", " alle ").let { if (it.startsWith("oggi") || it.startsWith("ieri")) it else "il $it" }, c.firmatoTesto, c.firmatoFondo)
    }
}

/** La pillola calma "Non collegato" con l'icona (§12). */
@Composable
internal fun PillolaScollegata() {
    val c = W.colori
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(c.fatturatoFondo).padding(horizontal = 9.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(Icone.scollegato, null, tint = c.fatturatoTesto, modifier = Modifier.size(15.dp))
        Text("Non collegato", style = Testi.pillola, color = c.fatturatoTesto)
    }
}

/** I segnaposti senza valore in giallo scuro ("manca il luogo"). */
@Composable
internal fun Mancano(mancano: List<String>) {
    if (mancano.isEmpty()) return
    val c = W.colori
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        mancano.forEach { Pillolina(Segnaposti.manca(it), c.gialloTesto, c.gialloTenue) }
    }
}

// ---------------------------------------------------------------------------------- WhatsApp

/** Il messaggio aperto in WhatsApp, per chiedere "L'hai mandato?" al ritorno nell'app (§3.13). */
object WhatsappInAttesa {
    var messaggio by mutableStateOf<Comunicazione?>(null)
    var nome by mutableStateOf("")
    /** Il momento in cui è partito: un ritorno subito dopo (il sistema che chiede l'app) non conta. */
    var partito: Long = 0L
    var lasciata = false
}

/** Il pacchetto di WhatsApp da usare (§3.13), o null se nessuna delle due app c'è. "" = c'è, sceglie il sistema. */
internal fun pacchettoWhatsapp(ctx: Context, app: String): String? {
    fun c(p: String) = runCatching { ctx.packageManager.getPackageInfo(p, 0); true }.getOrElse { false }
    val business = c(Whatsapp.PACCHETTO_BUSINESS)
    val normale = c(Whatsapp.PACCHETTO_NORMALE)
    return when {
        !business && !normale -> null
        app == "business" && business -> Whatsapp.PACCHETTO_BUSINESS
        app == "normale" && normale -> Whatsapp.PACCHETTO_NORMALE
        business && !normale -> Whatsapp.PACCHETTO_BUSINESS
        normale && !business -> Whatsapp.PACCHETTO_NORMALE
        else -> ""
    }
}

/** Apre `https://wa.me/...` (§9.4) col pacchetto scelto, o nel browser se [browser]. Vero se si è aperto qualcosa. */
internal fun apriWa(ctx: Context, link: String, pacchetto: String?): Boolean = try {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (!pacchetto.isNullOrBlank()) i.setPackage(pacchetto)
    ctx.startActivity(i)
    true
} catch (_: ActivityNotFoundException) {
    false
} catch (_: Exception) {
    false
}

/**
 * Al ritorno nell'app dopo WhatsApp (§3.13): "L'hai mandato?". Sta in cima a tutte le
 * pagine (MainActivity): Wisper non può sapere se è partito, lo dice chi l'ha mandato.
 */
@Composable
fun FoglioLhaiMandato(dati: Dati) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ciclo = LocalLifecycleOwner.current
    var chiedi by remember { mutableStateOf(false) }
    DisposableEffect(ciclo) {
        val osserva = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_STOP && WhatsappInAttesa.messaggio != null) WhatsappInAttesa.lasciata = true
            if (e == Lifecycle.Event.ON_RESUME && WhatsappInAttesa.messaggio != null && WhatsappInAttesa.lasciata) {
                WhatsappInAttesa.lasciata = false
                chiedi = true
            }
        }
        ciclo.lifecycle.addObserver(osserva)
        onDispose { ciclo.lifecycle.removeObserver(osserva) }
    }
    val m = WhatsappInAttesa.messaggio
    if (!chiedi || m == null) return
    fun chiudi() { chiedi = false; WhatsappInAttesa.messaggio = null }
    FoglioDalBasso({ chiudi() }) {
        Text("L'hai mandato?", style = Testi.titoloScheda, color = c.testo)
        Text("Il messaggio a " + WhatsappInAttesa.nome.ifBlank { m.referente.ifBlank { "il cliente" } }, style = Testi.forte, color = c.testo2)
        Text(m.testo, style = Testi.secondario, color = c.tenue, maxLines = 4)
        PulsantePrincipale("Sì, l'ho mandato", {
            if (!dati.esempio) dati.fase7.segnaMandato(m)
            Giri7.comunicazioni++
            avvisi.mostra(if (dati.esempio) SOLO_ESEMPIO else "Segnato mandato")
            chiudi()
        }, altezza = 56.dp, modifier = Modifier.bersaglio("si-mandato"))
        PulsanteBordo("Non ancora", { chiudi(); avvisi.mostra("Resta fra i preparati, non mandati") }, Modifier.fillMaxWidth())
    }
}

// ---------------------------------------------------------------------------------- il messaggio pronto

/**
 * Un messaggio da preparare (§12.1, foglio Messaggio): da una proposta di Da mandare, da un
 * preparato da riaprire, o nuovo (un referente col modello libero, un modello scelto). Con
 * [daPreparare] il testo lo compone il server (preparaMessaggio) all'apertura.
 */
data class Bozza7(
    val a: Destinatario = Destinatario(),
    val canale: String = "whatsapp",
    val modello: String = "libero",
    val uso: String = "libero",
    val testo: String = "",
    val oggetto: String = "",
    val mancano: List<String> = emptyList(),
    val proposta: String = "",
    val riferimento: Riferimento7 = Riferimento7(),
    /** "Intervento TK/2026/0014 · giovedì 23 ottobre alle 9:00". */
    val rigaRiferimento: String = "",
    /** idAttivita, idTicket, idPreventivo, idRapportino, idFattura, idCommessa: i riferimenti per preparaMessaggio e salvaMessaggio. */
    val rif: Map<String, String> = emptyMap(),
    val daPreparare: Boolean = false,
    val ultimoMovimento: String = "",
    /** Un preparato già nello storico (riaperto): non si salva di nuovo, si apre WhatsApp e si chiede. */
    val esistente: Comunicazione? = null,
) {
    val pagamento: Boolean get() = uso == "pagamento" || modello.contains("pagamento")

    companion object {
        fun daProposta(p: Proposta) = Bozza7(
            a = p.a, canale = p.canale, modello = p.modello, uso = usoDi(p.modello), testo = p.testo, oggetto = p.oggetto, mancano = p.mancano,
            proposta = p.proposta, riferimento = p.riferimento, rigaRiferimento = p.dettaglio,
            rif = rifDa(p.riferimento), daPreparare = false,
        )

        fun daPreparato(c: Comunicazione): Bozza7 {
            val n = Whatsapp.numero(c.a)
            return Bozza7(
                a = Destinatario(c.idReferente, c.referente, c.cliente, c.idCliente, n.numero, n.visto, "", true, n.fisso),
                canale = "whatsapp", modello = c.tipo, uso = usoDi(c.tipo), testo = c.testo, riferimento = c.riferimento,
                rigaRiferimento = c.riferimento.etichetta, rif = rifDa(c.riferimento), esistente = c,
            )
        }

        fun rifDa(r: Riferimento7): Map<String, String> = when (r.tipo) {
            "attivita" -> mapOf("idAttivita" to r.id)
            "ticket" -> mapOf("idTicket" to r.id)
            "preventivo" -> mapOf("idPreventivo" to r.id)
            "rapportino" -> mapOf("idRapportino" to r.id)
            "fattura" -> mapOf("idFattura" to r.id)
            "commessa" -> mapOf("idCommessa" to r.id)
            else -> emptyMap()
        }

        fun usoDi(modello: String): String = when (modello) {
            "promemoria_appuntamento" -> "appuntamento"
            "intervento_fissato" -> "intervento"
            "preventivo_mandato" -> "preventivo"
            "rapportino_da_firmare" -> "rapportino"
            "promemoria_pagamento", "secondo_promemoria_pagamento" -> "pagamento"
            "invito_portale" -> "portale"
            else -> "libero"
        }
    }
}

/**
 * Il foglio Messaggio (pagina intera sul telefono, §12.1): A con Cambia, Canale WhatsApp |
 * Email, i modelli di quell'uso, l'oggetto per l'email, il testo, i segnaposti che
 * mancano, il riferimento, l'ultimo movimento per i pagamenti, il fisso. Giallo Apri
 * WhatsApp (o Manda l'email); testo Copia il testo.
 */
@Composable
fun FoglioMessaggio(dati: Dati, iniziale: Bozza7, onChiudi: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    var b by remember { mutableStateOf(iniziale) }
    var preparo by remember { mutableStateOf(iniziale.daPreparare) }
    var errore by remember { mutableStateOf<String?>(null) }
    var cambia by remember { mutableStateOf(false) }
    var chiediSi by remember { mutableStateOf(false) }
    var nonCe by remember { mutableStateOf<String?>(null) }
    var mando by remember { mutableStateOf(false) }
    var segnaSi by remember { mutableStateOf(false) }
    val modelli = rememberLettura("modelli-msg", 0) { dati.fase7.modelli() }
    val max = sessione.interfaccia.whatsappTestoMax

    suspend fun prepara(modello: String, canale: String, a: Destinatario) {
        preparo = true
        val rif = b.rif + listOfNotNull(
            a.idReferente.takeIf { it.isNotBlank() }?.let { "idReferente" to it },
            a.idCliente.takeIf { it.isNotBlank() }?.let { "idCliente" to it },
            b.proposta.takeIf { it.isNotBlank() }?.let { "proposta" to it },
        )
        dati.fase7.prepara(modello, canale, rif)
            .onSuccess { m ->
                b = b.copy(testo = m.testo, oggetto = m.oggetto, mancano = m.mancano, modello = modello, canale = canale, uso = Bozza7.usoDi(modello),
                    a = if (m.a.nome.isNotBlank()) m.a else a, ultimoMovimento = m.ultimoMovimento)
                errore = null
            }
            .onFailure { e ->
                b = b.copy(modello = modello, canale = canale, a = a)
                if (b.testo.isBlank()) b = b.copy(testo = "Buongiorno ${a.nome}, ")
                avvisi.mostra(e.message?.takeIf { it.isNotBlank() } ?: "Senza rete il testo resta questo")
            }
        preparo = false
    }
    LaunchedEffect(Unit) { if (iniziale.daPreparare) prepara(iniziale.modello, iniziale.canale, iniziale.a) }

    fun riferimentiJson(m: JSONObject) {
        b.rif.forEach { (k, v) -> if (v.isNotBlank()) m.put(k, eu.stgm.wisper.rapportino.PonteServer.idJson(v)) }
    }

    fun apriWhatsapp(conSi: Boolean) {
        val a = b.a
        if (!a.conNumero) { errore = "${a.nome.ifBlank { "Il referente" }} non ha un numero di telefono"; return }
        if (b.testo.length > max) { errore = "Il messaggio è più lungo di ${eu.stgm.wisper.rapportino.Numeri.scrivi(max.toDouble())} caratteri: accorcialo"; return }
        if (!a.whatsappOk && !conSi && b.esistente == null) { chiediSi = true; return }
        val link = Whatsapp.link(a.numero, b.testo)
        val pacchetto = pacchettoWhatsapp(ctx, sessione.interfaccia.whatsappApp)
        // Il messaggio preparato va nello storico prima di aprire WhatsApp (§9.1): in coda, parte da solo.
        val com = b.esistente ?: run {
            val m = JSONObject().put("canale", "whatsapp").put("direzione", "uscita").put("tipo", b.modello).put("modello", b.modello)
                .put("testo", b.testo).put("stato", "preparato").put("a", a.numeroVisto)
                .put("_cliente", a.cliente).put("_referente", a.nome).put("_rifTipo", b.riferimento.tipo).put("_rifId", b.riferimento.id).put("_rifEtichetta", b.riferimento.etichetta)
            if (a.idReferente.isNotBlank()) m.put("idReferente", eu.stgm.wisper.rapportino.PonteServer.idJson(a.idReferente))
            if (a.idCliente.isNotBlank()) m.put("idCliente", a.idCliente)
            if (b.proposta.isNotBlank()) m.put("proposta", b.proposta)
            if (conSi) m.put("segnaSi", true)
            riferimentiJson(m)
            val idLocale = if (dati.esempio) "M-esempio" else dati.fase7.preparaWhatsapp(m)
            Comunicazione(idLocale = idLocale, canale = "whatsapp", tipo = b.modello, testo = b.testo, stato = "preparato", referente = a.nome, cliente = a.cliente, a = a.numeroVisto, inCoda = true)
        }
        Giri7.comunicazioni++
        if (pacchetto == null) { nonCe = link; WhatsappInAttesa.messaggio = com; WhatsappInAttesa.nome = a.nome; return }
        WhatsappInAttesa.messaggio = com
        WhatsappInAttesa.nome = a.nome
        WhatsappInAttesa.partito = System.currentTimeMillis()
        if (!apriWa(ctx, link, pacchetto.ifBlank { null })) { nonCe = link; return }
        onChiudi()
    }

    fun mandaEmail() {
        val a = b.a
        if (a.email.isBlank()) { errore = "${a.nome.ifBlank { "Il referente" }} non ha l'email"; return }
        if (b.oggetto.isBlank()) { errore = "Oggetto: scrivi di cosa si tratta"; return }
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return }
        mando = true
        val m = JSONObject().put("a", a.email).put("oggetto", b.oggetto.trim()).put("testo", b.testo).put("modello", b.modello)
        if (a.idReferente.isNotBlank()) m.put("idReferente", eu.stgm.wisper.rapportino.PonteServer.idJson(a.idReferente))
        if (a.idCliente.isNotBlank()) m.put("idCliente", a.idCliente)
        if (b.proposta.isNotBlank()) m.put("proposta", b.proposta)
        riferimentiJson(m)
        scope.launch {
            dati.fase7.mandaEmail(m)
                .onSuccess { com -> Giri7.comunicazioni++; avvisi.mostra(if (com.stato == "errore") "L'email non è partita: ${com.errore}" else "Email mandata a ${a.nome.ifBlank { a.email }}"); onChiudi() }
                .onFailure { e -> errore = if (e is java.io.IOException || e.cause is java.io.IOException) "Serve la rete: l'email parte da qui appena c'è" else e.message ?: "L'email non è partita: riprova" }
            mando = false
        }
    }

    // Pagina intera sopra quella di prima (§12.1): indietro la chiude; i tocchi non passano sotto.
    BackHandler(onBack = onChiudi)
    Box(Modifier.fillMaxSize().background(c.fondo).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}) {
        Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
            run {
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Testata(onChiudi, chiudi = true)
                    TitoloPagina(Parole7.modello(b.modello).let { if (b.modello == "libero") "Messaggio" else it })
                    // A
                    Scheda(orizzontale = 16.dp, verticale = 12.dp) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            CerchioPersona(b.a.nome.split(' ', '.').filter { it.length > 1 }.take(2).joinToString("") { it.take(1) }.uppercase().ifBlank { "?" }, 40.dp)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(b.a.nome.ifBlank { "Scegli a chi" }, style = Testi.forte, color = c.testo)
                                Text(listOf(b.a.cliente, if (b.canale == "email") b.a.email.ifBlank { "nessuna email" } else b.a.numeroVisto.ifBlank { "nessun numero" }).filter { it.isNotBlank() }.joinToString(" · "),
                                    style = Testi.secondario, color = c.tenue)
                            }
                            if (b.a.idCliente.isNotBlank() && ana.referentiDi(b.a.idCliente).size > 1 && b.esistente == null) PulsanteTesto("Cambia", { cambia = true })
                        }
                    }
                    // Canale
                    if (b.esistente == null) {
                        Etichetta("Canale")
                        Segmenti(listOf("whatsapp" to if (b.a.conNumero) "WhatsApp" else "WhatsApp · Nessun numero", "email" to "Email"), b.canale, { nuovo ->
                            if (nuovo == "whatsapp" && !b.a.conNumero) { avvisi.mostra("Nessun numero: scrivilo nella scheda del referente"); return@Segmenti }
                            b = b.copy(canale = nuovo)
                        })
                        if (b.canale == "whatsapp" && !b.a.whatsappOk) Row { Parola7("WhatsApp non chiesto") }
                    }
                    if (b.canale == "whatsapp" && b.a.fisso) RigaInfo("Sembra un numero fisso: WhatsApp potrebbe non esserci")
                    // Modello
                    val lista = (modelli as? Lettura.Pronta)?.dato?.modelli.orEmpty().filter { m ->
                        m.attivo && (m.uso == b.uso || (b.uso == "libero" && m.uso in setOf("libero", "portale"))) && (if (b.canale == "email") m.perEmail else m.perWhatsapp)
                    }
                    if (lista.size > 1 && b.esistente == null) {
                        Etichetta("Modello")
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            lista.forEach { m -> Pillola(m.nome, m.chiave == b.modello, { if (m.chiave != b.modello) scope.launch { prepara(m.chiave, b.canale, b.a) } }) }
                        }
                    }
                    if (b.canale == "email") CampoTesto(b.oggetto, { b = b.copy(oggetto = it) }, "Oggetto", Modifier.fillMaxWidth())
                    if (preparo) Segnaposto(160.dp)
                    else CampoTesto(b.testo, { b = b.copy(testo = it, mancano = Segnaposti.mancano(it)) }, if (b.esistente != null) "Testo preparato" else "Testo", Modifier.fillMaxWidth(), righe = 7,
                        errore = if (b.canale == "whatsapp" && b.testo.length > max) "Il messaggio è più lungo di ${eu.stgm.wisper.rapportino.Numeri.scrivi(max.toDouble())} caratteri: accorcialo" else null)
                    Mancano(b.mancano)
                    if (b.rigaRiferimento.isNotBlank()) Text(b.rigaRiferimento, style = Testi.secondario, color = c.tenue)
                    if (b.pagamento) {
                        val ultimo = b.ultimoMovimento
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.superficie2).padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Icon(Icone.banca, null, tint = c.testo2, modifier = Modifier.size(18.dp))
                            Text("Ultimo movimento segnato in Banche e scadenze: " + if (ultimo.isNotBlank()) dataVista(ultimo) else "nessuno", style = Testi.secondario, color = c.testo2, modifier = Modifier.weight(1f))
                        }
                    }
                    errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
                    PulsanteTesto("Copia il testo", { copiaTesto(ctx, "Messaggio", b.testo, avvisi) }, colore = c.gialloTesto)
                }
                FondoConPulsante(Modifier.align(Alignment.BottomCenter), sopraBarra = true) {
                    if (b.canale == "email") PulsantePrincipale(if (mando) "Mando…" else "Manda l'email", { if (!mando) mandaEmail() }, icona = Icone.email, abilitato = !mando)
                    else PulsantePrincipale("Apri WhatsApp", { apriWhatsapp(segnaSi) }, icona = Icone.whatsapp, modifier = Modifier.bersaglio("apri-whatsapp"))
                }
            }
            if (cambia) {
                FoglioDalBasso({ cambia = false }) {
                    Text("A chi", style = Testi.titoloScheda, color = c.testo)
                    ana.referentiDi(b.a.idCliente).forEach { r ->
                        val d = Destinatario.da(r, ana.cliente(r.idSoggetto, ""))
                        RigaVoce(r.nome, sotto = listOf(r.ruolo, d.numeroVisto.ifBlank { r.email }).filter { it.isNotBlank() }.joinToString(" · "), freccia = false, onClick = {
                            cambia = false
                            if (b.modello == "libero" && !b.daPreparare) b = b.copy(a = d, testo = b.testo.replace(b.a.nome, r.nome))
                            else scope.launch { prepara(b.modello, b.canale, d) }
                        })
                    }
                }
            }
            if (chiediSi) {
                FoglioDalBasso({ chiediSi = false }) {
                    Text("${b.a.nome} ha detto che si può scriver${pronome(b.a.nome)} su WhatsApp?", style = Testi.titoloScheda, color = c.testo)
                    PulsantePrincipale("Sì, me l'ha detto", { chiediSi = false; segnaSi = true; b = b.copy(a = b.a.copy(whatsappOk = true)); apriWhatsapp(true) }, altezza = 56.dp)
                    PulsanteBordo("Manda un'email", { chiediSi = false; b = b.copy(canale = "email") }, Modifier.fillMaxWidth())
                }
            }
            nonCe?.let { link ->
                FoglioDalBasso({ nonCe = null; WhatsappInAttesa.messaggio = null }) {
                    Text("WhatsApp non c'è su questo telefono", style = Testi.titoloScheda, color = c.testo)
                    Text("Il messaggio resta fra i preparati: copialo e mandalo da dove vuoi.", style = Testi.testo, color = c.testo2)
                    PulsantePrincipale("Copia il testo", { copiaTesto(ctx, "Messaggio", b.testo, avvisi); nonCe = null; WhatsappInAttesa.messaggio = null; onChiudi() }, icona = Icone.copia, altezza = 56.dp)
                    PulsanteBordo("Apri wa.me nel browser", {
                        nonCe = null
                        WhatsappInAttesa.partito = System.currentTimeMillis()
                        if (apriWa(ctx, link, null)) onChiudi() else { WhatsappInAttesa.messaggio = null; avvisi.mostra("Nessuna app apre il collegamento") }
                    }, Modifier.fillMaxWidth())
                }
            }
        }
        StratoAvvisi(avvisi, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 96.dp))
    }
}

// ---------------------------------------------------------------------------------- portale: i fogli che usano anche le altre pagine

/** Il tipo del portale (permessi del referente) di una cosa da pubblicare (§3.6). */
internal fun tipoPermesso(tipo: String): String = when (tipo) {
    "contratto" -> "preventivi"
    "ticket" -> "richieste"
    "fattura" -> "fatture"
    "documento" -> "documenti"
    "rapportino" -> "rapportini"
    else -> "preventivi"
}

/** "le fatture", "i preventivi": per la frase "Nessun referente di … può vedere …". */
private fun cosaPlurale(tipo: String): String = when (tipo) {
    "fattura" -> "le fatture"; "rapportino" -> "i rapportini"; "documento" -> "i documenti"; "ticket" -> "le richieste"; "contratto" -> "i contratti"; else -> "i preventivi"
}

/**
 * Pubblica nel portale (§8.2): "Lo vedrà Rossi Impianti Srl: Sig. Ferretti, Anna Rossi" (i
 * referenti coi permessi e le sedi giusti, dall'ultima lettura); Pubblica (giallo), o Pubblica lo stesso.
 * Dal 06/11/2026 (rapportino-lavori.md §3) niente "Da firmare nel portale": i rapportini non si firmano più.
 * Parte anche senza rete (in coda).
 */
@Composable
fun FoglioPubblica(dati: Dati, tipo: String, id: String, idCliente: String, nomeCliente: String, inBozza: Boolean = false, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val lettura = rememberLettura("pubblica-$idCliente", 0) { dati.fase7.portaleCliente(idCliente) }
    val cp = (lettura as? Lettura.Pronta)?.dato ?: dati.fase7.portaleClienteLetto(idCliente)
    val t = tipoPermesso(tipo)
    val vedranno = cp?.referenti.orEmpty().filter { it.portale && it.statoVisto != "Tolto" && it.livello(t) >= 1 }.map { it.nome }
    val acceso = cp?.portale ?: true
    FoglioDalBasso(onChiudi) {
        Text("Pubblica nel portale", style = Testi.titoloScheda, color = c.testo)
        when {
            cp == null && lettura is Lettura.InCorso -> Segnaposto(48.dp)
            !acceso -> Text("$nomeCliente non ha il portale acceso", style = Testi.testo, color = c.testo2)
            vedranno.isEmpty() -> Text("Nessun referente di $nomeCliente può vedere ${cosaPlurale(tipo)}", style = Testi.testo, color = c.testo2)
            else -> Text("Lo vedrà $nomeCliente: " + vedranno.joinToString(", "), style = Testi.testo, color = c.testo2)
        }
        val nessuno = cp != null && vedranno.isEmpty()
        PulsantePrincipale(if (nessuno) "Pubblica lo stesso" else "Pubblica", {
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@PulsantePrincipale }
            dati.fase7.pubblica(tipo, id, daFirmare = false, conferma = nessuno)
            Giri7.tutto()
            avvisi.mostra("Pubblicato nel portale: parte appena c'è rete")
            onChiudi()
        }, altezza = 56.dp, icona = Icone.globo)
    }
}

/** Togli dal portale: subito, senza conferma, con Annulla nell'avviso (§8.2). */
internal fun togliDalPortale(dati: Dati, idPubblicazione: String, avvisi: Avvisi) {
    if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
    if (idPubblicazione.isBlank()) { avvisi.mostra("Il server non ha detto quale pubblicazione togliere: toglila da Portale clienti › Pubblicati"); return }
    dati.fase7.togliDalPortale(idPubblicazione)
    Giri7.tutto()
    avvisi.mostra("Tolto dal portale") { dati.fase7.togliDalPortale(idPubblicazione, annulla = true); Giri7.tutto() }
}

/** Rispondi nel portale (§3.10): lo vede il cliente nella richiesta, firmato Studio Tecnico GM. In coda. */
@Composable
fun FoglioRispondiNelPortale(dati: Dati, idTicket: String, nomeCliente: String, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var testo by remember { mutableStateOf("") }
    var provato by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Rispondi nel portale", style = Testi.titoloScheda, color = c.testo)
        Text("Lo vede ${nomeCliente.ifBlank { "il cliente" }} nella richiesta, firmato Studio Tecnico GM", style = Testi.secondario, color = c.tenue)
        CampoTesto(testo, { testo = it }, "Risposta", Modifier.fillMaxWidth(), righe = 4, errore = if (provato && testo.isBlank()) "Scrivi la risposta" else null)
        PulsantePrincipale("Manda la risposta", {
            provato = true
            if (testo.isBlank()) return@PulsantePrincipale
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@PulsantePrincipale }
            dati.fase7.rispondi(idTicket, testo)
            Giri7.tutto()
            avvisi.mostra("Risposta mandata: parte appena c'è rete")
            onChiudi()
        }, altezza = 56.dp, icona = Icone.invia)
    }
}

/**
 * Il file arrivato dal cliente (§12.3): nome, chi e quando, grandezza, titolo e nota del
 * cliente, Scarica (la prima volta chiede la conferma di §3.11), Categoria, Commessa e
 * Impianto proposti; giallo Accetta e archivia; testo Rifiuta (motivo obbligatorio).
 */
@Composable
fun FoglioFileDalCliente(dati: Dati, car: Caricamento, idFile: String?, onChiudi: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val categorie = rememberLettura("categorie-7", 0) { dati.fase5.categorie() }
    var categoria by remember { mutableStateOf("") }
    val idCliente = car.idCliente.ifBlank { ana.clienti.firstOrNull { it.nome == car.cliente }?.id.orEmpty() }
    val commesse = ana.commesseDi(idCliente).filter { it.aperta && !it.modello && !it.archiviata }
    val impianti = ana.sediDi(idCliente)
    var commessa by remember { mutableStateOf(commesse.singleOrNull()?.id.orEmpty()) }
    var impianto by remember { mutableStateOf(impianti.singleOrNull()?.id.orEmpty()) }
    var conferma by remember { mutableStateOf(false) }
    var rifiuta by remember { mutableStateOf(false) }
    var motivo by remember { mutableStateOf("") }
    var provato by remember { mutableStateOf(false) }

    fun apri() {
        val f = idFile ?: return
        scope.launch {
            dati.fase7.scaricaFile(f, car.nome, ctx.cacheDir)
                .onSuccess { file -> if (!eu.stgm.wisper.rapportino.Stampa.apri(ctx, file, mimeDaNome(car.nome))) avvisi.mostra("Sul telefono non c'è un'app che apre questo file") }
                .onFailure { avvisi.mostra(it.message ?: "Il file non si apre: riprova") }
        }
    }

    FoglioDalBasso(onChiudi) {
        if (rifiuta) {
            Text("Rifiuta il file", style = Testi.titoloScheda, color = c.testo)
            CampoTesto(motivo, { motivo = it }, "Motivo: lo vede il cliente", Modifier.fillMaxWidth(), righe = 3, errore = if (provato && motivo.isBlank()) "Scrivi il motivo: lo vede il cliente" else null)
            PulsantePrincipale("Rifiuta il file", {
                provato = true
                if (motivo.isBlank()) return@PulsantePrincipale
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@PulsantePrincipale }
                dati.fase7.rifiutaFile(car.id, motivo)
                Giri7.tutto()
                avvisi.mostra("File rifiutato: il cliente vede il motivo")
                onChiudi()
            }, altezza = 56.dp)
            PulsanteTesto("Annulla", { rifiuta = false }, Modifier.fillMaxWidth(), colore = c.testo)
            return@FoglioDalBasso
        }
        if (conferma) {
            Text("Aprire il file?", style = Testi.titoloScheda, color = c.testo)
            Text("Arriva dal portale di ${car.cliente.ifBlank { "un cliente" }}: aprilo solo se te lo aspettavi", style = Testi.testo, color = c.testo2)
            PulsantePrincipale("Apri", { conferma = false; ConfermeFile.aperti.add(car.id); apri() }, altezza = 56.dp)
            PulsanteTesto("Annulla", { conferma = false }, Modifier.fillMaxWidth(), colore = c.testo)
            return@FoglioDalBasso
        }
        Text(car.nome, style = Testi.titoloScheda, color = c.testo)
        Text(listOf(car.cliente, car.referente, quando7(car.creato), peso(car.byte)).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.tenue)
        Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (car.titolo.isNotBlank() || car.nota.isNotBlank()) Scheda(orizzontale = 14.dp, verticale = 12.dp, spazio = 4.dp) {
                if (car.titolo.isNotBlank()) Text(car.titolo, style = Testi.forte, color = c.testo)
                if (car.nota.isNotBlank()) Text(car.nota, style = Testi.testo, color = c.testo2)
            }
            if (idFile != null) PulsanteBordo("Scarica", { if (car.immagine || car.id in ConfermeFile.aperti) apri() else conferma = true }, Modifier.fillMaxWidth(), icona = Icone.scarica)
            if (car.stato == "da_guardare") {
                Etichetta("Categoria")
                val cats = (categorie as? Lettura.Pronta)?.dato.orEmpty()
                if (categorie is Lettura.InCorso) Segnaposto(48.dp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    cats.forEach { k -> Pillola(k.nome, k.id == categoria, { categoria = k.id }) }
                }
                if (commesse.isNotEmpty()) {
                    Etichetta("Commessa")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pillola("Nessuna", commessa.isBlank(), { commessa = "" })
                        commesse.forEach { m -> Pillola(m.id + " · " + m.descrizione.take(24), m.id == commessa, { commessa = m.id }) }
                    }
                }
                if (impianti.isNotEmpty()) {
                    Etichetta("Impianto")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pillola("Nessuno", impianto.isBlank(), { impianto = "" })
                        impianti.forEach { s -> Pillola(s.nome, s.id == impianto, { impianto = s.id }) }
                    }
                }
            } else Row { Parola7(car.parolaStato) }
        }
        if (car.stato == "da_guardare" && LocalPermessi.current.modifica(Moduli.PORTALE) && LocalPermessi.current.modifica(Moduli.DOCUMENTI)) {
            // Le foto mandate con una richiesta restano foto del ticket (§10.1, soloTicket): niente categoria.
            if (car.idTicket.isNotBlank()) {
                PulsantePrincipale("Tienila nella richiesta ${car.ticket}", {
                    if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@PulsantePrincipale }
                    dati.fase7.accettaFile(car.id, JSONObject().put("soloTicket", true))
                    Giri7.tutto()
                    avvisi.mostra("Resta fra le foto della richiesta")
                    onChiudi()
                }, altezza = 56.dp, icona = Icone.spunta)
                PulsanteTesto("Rifiuta", { rifiuta = true; provato = false }, Modifier.fillMaxWidth(), colore = c.rossoTesto)
                return@FoglioDalBasso
            }
            if (provato && categoria.isBlank()) Text("Scegli la categoria", style = Testi.secondario, color = c.rossoTesto)
            PulsantePrincipale("Accetta e archivia", {
                provato = true
                if (categoria.isBlank()) return@PulsantePrincipale
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@PulsantePrincipale }
                val campi = JSONObject().put("titolo", car.titolo.ifBlank { car.nome.substringBeforeLast('.') }).put("idCategoria", eu.stgm.wisper.rapportino.PonteServer.idJson(categoria))
                if (commessa.isNotBlank()) campi.put("idCommessa", commessa)
                if (impianto.isNotBlank()) campi.put("idSede", eu.stgm.wisper.rapportino.PonteServer.idJson(impianto))
                dati.fase7.accettaFile(car.id, campi)
                Giri7.tutto()
                avvisi.mostra("Accettato: va fra i documenti appena c'è rete")
                onChiudi()
            }, altezza = 56.dp, icona = Icone.spunta, modifier = Modifier.bersaglio("accetta-file"))
            PulsanteTesto("Rifiuta", { rifiuta = true; provato = false }, Modifier.fillMaxWidth(), colore = c.rossoTesto)
        }
    }
}

/** "le" o "gli" per "si può scriverle/scrivergli": dal primo nome (Giulia, Anna, Sig.ra → le). */
internal fun pronome(nome: String): String {
    val parole = nome.trim().split(' ').filter { it.isNotBlank() }
    val primo = parole.firstOrNull().orEmpty()
    return when {
        primo.equals("Sig.ra", true) || primo.equals("Signora", true) -> "le"
        primo.startsWith("Sig", true) -> "gli"
        primo.lowercase().endsWith("a") && primo.lowercase() !in setOf("andrea", "luca", "nicola", "mattia", "elia", "enea") -> "le"
        else -> "gli"
    }
}

/** I file del portale già aperti una volta (la conferma di §3.11 si chiede la prima volta). */
internal object ConfermeFile {
    val aperti = mutableSetOf<String>()
}

/** Dove porta il riferimento di una comunicazione (§12.1: "righe che aprono la cosa"). */
internal fun apriRiferimento(r: Riferimento7, nav: Navigatore, dati: Dati) {
    if (r.id.isBlank()) return
    when (r.tipo) {
        "ticket" -> nav.vai("ticket/${r.id}")
        "preventivo" -> nav.vai("preventivo/${r.id}")
        "fattura" -> nav.vai("fattura/${r.id}")
        "attivita" -> nav.vai("attivita/${r.id}")
        "commessa" -> nav.vai("commessa/${r.id}")
        "documento" -> nav.vai("documento/${r.id}")
        "cliente" -> nav.vai("cliente/${r.id}")
        "rapportino" -> (dati.viste.value + dati.storico.value).firstOrNull { it.rapportino.id == r.id || it.rapportino.id == r.etichetta }?.let { nav.apriRapportino(it.rapportino.idLocale) }
            ?: nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, testo = r.etichetta.ifBlank { r.id }))
    }
}

/** Le tre righe calme dei Non collegati (§3.17), col perché al tocco. */
@Composable
internal fun RigheNonCollegate(avvisi: Avvisi, conFrase: Boolean) {
    val voci = listOf(
        Triple(Icone.whatsapp, "WhatsApp Business", "Costa a messaggio e vuole un indirizzo aperto su internet: per ora i messaggi li manda Manuel"),
        Triple(Icone.scontrino, "Spese via messaggio", "Con WhatsApp servirebbe l'API a pagamento; l'app lo fa già in meno di un minuto, anche senza rete"),
        Triple(Icone.fumetto, "Assistente operativo", "I dati dei clienti andrebbero a un fornitore fuori dall'Europa: da decidere nella fase 8"),
    )
    SchedaElenco {
        voci.forEachIndexed { i, (icona, titolo, perche) ->
            if (i > 0) LineaElenco()
            RigaVoce(titolo, sotto = if (conFrase) perche else null, icona = icona, fine = { PillolaScollegata() }, freccia = false, onClick = { avvisi.mostra(perche) })
        }
    }
}

/** Il colore di una parola sulla riga di un referente: le pillole "Accesso al portale", "Ha detto sì a WhatsApp", "Paga le fatture". */
@Composable
internal fun PilloleReferente(portale: Boolean, whatsappOk: Boolean, pagamenti: Boolean) {
    if (!portale && !whatsappOk && !pagamenti) return
    val c = W.colori
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (portale) Pillolina("Accesso al portale", c.firmatoTesto, c.firmatoFondo)
        if (whatsappOk) Pillolina("Ha detto sì a WhatsApp", c.fatturatoTesto, c.fatturatoFondo)
        if (pagamenti) Pillolina("Paga le fatture", c.fatturatoTesto, c.fatturatoFondo)
    }
}

/** Un cerchio con un'icona, 48 dp: WhatsApp, Email, Chiama sulla riga di un referente. */
@Composable
internal fun TondoAzione(icona: ImageVector, descrizione: String, onClick: () -> Unit) = PulsanteTondo(icona, descrizione, onClick, dimensione = 48.dp)

/** Il bordo rosso tenue di "Spegni il portale adesso". */
@Composable
internal fun PulsantePericolo(testo: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    Box(
        modifier.heightIn(min = 52.dp).clip(RoundedCornerShape(16.dp)).background(c.rossoTenue)
            .border(1.5.dp, c.rossoTesto, RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { Text(testo, style = Testi.pulsanteSecondario, color = c.rossoTesto) }
}

/** Una riga di campo per un numero WhatsApp (tastiera del telefono). */
@Composable
internal fun CampoNumero(valore: String, onCambia: (String) -> Unit, etichetta: String) {
    CampoTesto(valore, onCambia, etichetta, Modifier.fillMaxWidth(), tastiera = KeyboardType.Phone)
}
