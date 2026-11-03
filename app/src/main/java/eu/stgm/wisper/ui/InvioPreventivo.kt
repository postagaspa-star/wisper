package eu.stgm.wisper.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
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
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.ContiPreventivo
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Stampa
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Invia al cliente un preventivo (fase2.md §5), come l'invio del riepilogo: la
 * pagina vera del PDF, a chi va, il messaggio, Invia per email. Se manca qualcosa
 * che la legge chiede lo dice prima; il server chiede conferma e si può inviare lo
 * stesso. L'email parte una volta sola per tocco.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchermataInvioPreventivo(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val perm = LocalPermessi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val dettagli by dati.dettagliPreventivi.collectAsStateWithLifecycle()
    LaunchedEffect(id) { if (dettagli[id] == null) dati.preventivo(id) }
    val p = dettagli[id]
    val puoWhatsapp = scriveComunicazioni()

    var aScritto by rememberSaveable(id) { mutableStateOf<String?>(null) }
    var ccScritto by rememberSaveable(id) { mutableStateOf("") }
    var oggettoScritto by rememberSaveable(id) { mutableStateOf<String?>(null) }
    var messaggioScritto by rememberSaveable(id) { mutableStateOf<String?>(null) }
    var erroreA by remember { mutableStateOf<String?>(null) }
    var erroreInvio by remember { mutableStateOf<String?>(null) }
    var foglioMessaggio by remember { mutableStateOf(false) }
    var occupato by remember { mutableStateOf<String?>(null) }
    var inRete by remember { mutableStateOf(false) }
    var daConfermare by remember { mutableStateOf<Pair<String, String>?>(null) }
    var menu by remember { mutableStateOf(false) }
    var grande by remember { mutableStateOf(false) }

    // ---- il PDF: si fa entrando, e si rifà con Riprova
    var tentativo by remember { mutableIntStateOf(0) }
    var esito by remember { mutableStateOf<EsitoPdf?>(null) }
    var anteprima by remember { mutableStateOf<ImageBitmap?>(null) }
    val chiave = "${p?.modificato}|${p?.stato}|$tentativo"
    LaunchedEffect(chiave) {
        val pp = p ?: return@LaunchedEffect
        delay(150)
        esito = try {
            val f = Stampa.preventivo(ctx, perModello(pp), dati.anagrafichePerStampa()) { dati.file(it) }
            anteprima = withContext(Dispatchers.IO) { disegnaPagine(f, 1080, 1).first.firstOrNull()?.asImageBitmap() }
            EsitoPdf(chiave, f, null)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            EsitoPdf(chiave, null, (e as? Stampa.ErroreStampa)?.message ?: "Il PDF non si è creato. Riprova.")
        }
    }
    val pronto = esito?.takeIf { it.chiave == chiave }

    BackHandler(enabled = inRete) { }
    if (p == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            Segnaposto(300.dp)
        }
        return
    }
    val cliente = ana.cliente(p.idCliente)
    val referente = ana.referentiDi(p.idCliente).firstOrNull { it.id == p.idReferente }
    val a = aScritto ?: referente?.email?.takeIf { it.isNotBlank() } ?: cliente?.email.orEmpty()
    val numero = etichettaDi(p).replace(" · ", " ")
    val oggetto = oggettoScritto ?: "Preventivo $numero · ${p.oggetto}"
    val firma = ana.impostazione(Anagrafiche.TECNICO).ifBlank { ana.ragioneSociale }
    val messaggio = messaggioScritto ?: ("Buongiorno,\nin allegato il preventivo $numero per «${p.oggetto}»" +
        (p.scadenza?.let { ", valido fino al " + giornoBreve(it) } ?: "") + ".\n\nCordiali saluti\n" + firma)
    val k = contoDi(p, ana)
    val manca = ContiPreventivo.legge(p, ana.impostazioni).filter { !it.ok }

    fun manda(aMe: Boolean, conferma: Boolean = false) {
        if (occupato != null) return
        val indirizzo = a.trim()
        if (!aMe && indirizzo.isBlank()) { erroreA = "Manca l'indirizzo: scrivilo qui"; return }
        val f = pronto?.file
        if (f == null) { erroreInvio = pronto?.errore ?: "Il PDF non è ancora pronto. Riprova fra poco."; return }
        erroreInvio = null
        occupato = if (aMe) "copia" else "invio"
        scope.launch {
            try {
                inRete = true
                val r = dati.inviaPreventivo(p.id, indirizzo, ccScritto.trim(), oggetto, messaggio, f, aMe, conferma)
                inRete = false
                r.onSuccess {
                    val esempio = if (dati.esempio) " (esempio: non è partito niente)" else ""
                    if (aMe) avvisi.mostra("Copia mandata alla tua casella$esempio")
                    else {
                        nav.indietro()
                        // Fase 7 (§12.6): l'avviso "Preventivo mandato" con Manda anche un WhatsApp.
                        if (puoWhatsapp && p.idCliente.isNotBlank()) avvisi.mostraConAzione("Preventivo mandato$esempio", "Manda anche un WhatsApp") {
                            apriMessaggio(dati, p.idCliente, "preventivo_mandato", eu.stgm.wisper.rapportino.Riferimento7("preventivo", p.id, p.numero), idReferente = p.idReferente)
                        } else avvisi.mostra("Preventivo inviato a $indirizzo$esempio")
                    }
                }.onFailure { e ->
                    val dc = daConfermare(e)
                    if (dc != null) daConfermare = "email" to dc.message.orEmpty()
                    else erroreInvio = spiegaErrore2(e, "L'email non è partita. Riprova.")
                }
            } finally {
                inRete = false
                occupato = null
            }
        }
    }

    fun segnaSenzaEmail(conferma: Boolean = false) {
        if (occupato != null) return
        occupato = "segna"
        scope.launch {
            dati.segnaInviato(p.id, conferma)
                .onSuccess { nav.indietro(); avvisi.mostra("Segnato inviato") }
                .onFailure { e ->
                    val dc = daConfermare(e)
                    if (dc != null) daConfermare = "segna" to dc.message.orEmpty() else erroreInvio = spiegaErrore2(e, "Non è stato segnato: riprova")
                }
            occupato = null
        }
    }

    val tastiera = WindowInsets.isImeVisible
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 250.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { if (!inRete) nav.indietro() }, chiudi = true) {
                PulsanteTondo(Icone.altro, "Altre azioni", { menu = true })
            }
            TitoloPagina("Preventivo $numero", sopra = nomeClienteDi(p, ana) + if (perm.costi) " · " + Numeri.euro(k.totale) else "")
            CornicePdf(anteprima, pronto, onIngrandisci = { if (pronto?.file != null) grande = true }, onRiprova = { tentativo++ })
            if (manca.isNotEmpty()) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.gialloTenue).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text("Manca per la legge", style = Testi.forte, color = c.gialloTesto)
                    Text(manca.joinToString(", ") { it.nome.lowercase() }, style = Testi.secondarioGrande, color = c.testo2)
                }
            }
            CampoTesto(a, { aScritto = it; erroreA = null }, "A", segnaposto = "email di ${nomeClienteDi(p, ana)}", errore = erroreA, tastiera = KeyboardType.Email)
            Scheda(orizzontale = 18.dp, verticale = 6.dp, spazio = 0.dp) {
                RigaVoce("Messaggio", sotto = oggetto, onClick = { foglioMessaggio = true })
            }
        }
        if (!tastiera) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter), sopraBarra = false) {
                erroreInvio?.let { Text(it, style = Testi.secondario, color = c.rossoTesto, modifier = Modifier.fillMaxWidth()) }
                PulsantePrincipale(
                    when (occupato) { "invio" -> "Invio in corso…"; "copia" -> "Mando la copia…"; else -> "Invia per email" },
                    { manda(aMe = false) }, icona = if (occupato == null) Icone.invia else null, abilitato = occupato == null,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PulsanteBordo("Apri il PDF", {
                        pronto?.file?.let { if (!Stampa.apri(ctx, it)) avvisi.mostra("Sul telefono non c'è un'app per i PDF: usa Condividi") }
                    }, Modifier.weight(1f), icona = Icone.pdf)
                    PulsanteBordo("Condividi", { pronto?.file?.let { Stampa.condividi(ctx, it, oggetto) } }, Modifier.weight(1f), icona = Icone.condividi)
                }
                if (p.bozza) PulsanteTesto("Segna come inviato senza email", { segnaSenzaEmail() }, Modifier.fillMaxWidth().height(48.dp), colore = c.tenue)
            }
        }
    }

    if (menu) FoglioDalBasso({ menu = false }) {
        VoceMenu(Icone.invia, "Mandane una copia a me", { menu = false; manda(aMe = true) })
    }
    if (foglioMessaggio) FoglioDalBasso({ foglioMessaggio = false }) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Messaggio", style = Testi.titoloScheda, color = c.testo)
            CampoTesto(oggetto, { oggettoScritto = it }, "Oggetto")
            CampoTesto(ccScritto, { ccScritto = it }, "Copia anche a", segnaposto = "—", tastiera = KeyboardType.Email)
            CampoTesto(messaggio, { messaggioScritto = it }, "Messaggio", righe = 6)
            PulsantePrincipale("Fatto", { foglioMessaggio = false }, altezza = 52.dp)
        }
    }
    daConfermare?.let { (cosa, testo) ->
        FoglioConferma(
            "Manca qualcosa per la legge", testo, if (cosa == "email") "Invia lo stesso" else "Segna inviato lo stesso",
            onConferma = { daConfermare = null; if (cosa == "email") manda(aMe = false, conferma = true) else segnaSenzaEmail(conferma = true) },
            onAnnulla = { daConfermare = null },
        )
    }
    val f = pronto?.file
    if (grande && f != null) AnteprimaGrande(f, anteprima) { grande = false }
}
