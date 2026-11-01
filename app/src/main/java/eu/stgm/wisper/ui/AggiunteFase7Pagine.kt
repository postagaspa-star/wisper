@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Accettazione7
import eu.stgm.wisper.rapportino.Attivita
import eu.stgm.wisper.rapportino.Fattura
import eu.stgm.wisper.rapportino.InCoda7
import eu.stgm.wisper.rapportino.InfoPortale
import eu.stgm.wisper.rapportino.MessaggioTicket
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Preventivo
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Riferimento7
import eu.stgm.wisper.rapportino.StatoPreventivo
import eu.stgm.wisper.rapportino.Ticket
import eu.stgm.wisper.rapportino.TipoAttivita
import kotlinx.coroutines.launch
import java.time.format.DateTimeFormatter

/*
 * Fase 7 nelle pagine di preventivo, rapportino, ticket, attività e fattura (fase7.md §12.6).
 */

// ---------------------------------------------------------------------------------- preventivo

/** Il pezzo `portale` e l'accettazione di un preventivo, dalla risposta del server (§10.4). */
internal fun portaleDi(p: Preventivo): InfoPortale? = InfoPortale.daJson(p.grezzo?.optJSONObject("portale"))
internal fun accettazioneDi(p: Preventivo): Accettazione7? = Accettazione7.daJson(p.grezzo?.optJSONObject("accettazione"))

/**
 * Nel preventivo (§12.6): la pillola Nel portale · visto il …; l'accettazione nel portale con
 * la firma, "Roberto Ferretti · 22/10/2026 10:07 · nel portale" e, con preventivi 2, Prova
 * dell'accettazione (via, browser, impronta: l'IP non c'è, §0.4); Manda anche un WhatsApp.
 */
@Composable
internal fun BloccoPortalePreventivo(dati: Dati, p: Preventivo) {
    val c = W.colori
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val info = portaleDi(p)
    val inCoda = InCoda7.portaleInCoda("preventivo", p.id, info?.id.orEmpty(), ops)
    val acc = accettazioneDi(p)
    var prova by remember { mutableStateOf(false) }
    if (info?.pubblicato == true || inCoda != null) Row { PillolaNelPortale(info, inCoda) }
    if (acc?.nelPortale == true) {
        Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 10.dp) {
            Text("Accettato nel portale", style = Testi.forte, color = c.firmatoTesto)
            Text(listOf(acc.da.ifBlank { p.accettatoDa }, istanteVisto(acc.il.ifBlank { p.accettatoIl }), "nel portale").filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.testo2)
            ImmagineFirma(dati, p.idFirma)
            if (LocalPermessi.current.modifica(Moduli.PREVENTIVI) && acc.prova != null) RigaVoce("Prova dell'accettazione", sotto = "Via Google · browser e impronta del preventivo visto", icona = Icone.scudo, onClick = { prova = true })
        }
    }
    if (p.stato == StatoPreventivo.INVIATO && scriveComunicazioni() && p.idCliente.isNotBlank()) {
        PulsanteBordo("Manda anche un WhatsApp", {
            apriMessaggio(dati, p.idCliente, "preventivo_mandato", Riferimento7("preventivo", p.id, p.numero), idReferente = p.idReferente)
        }, altezza = 48.dp, icona = Icone.whatsapp)
    }
    val pr = acc?.prova
    if (prova && pr != null) {
        FoglioDalBasso({ prova = false }) {
            Text("Prova dell'accettazione", style = Testi.titoloScheda, color = c.testo)
            Coppia("Chi", listOf(pr.optString("nome").ifBlank { acc.da }, pr.optString("email")).filter { it.isNotBlank() }.joinToString(" · "))
            Coppia("Quando", istanteVisto(pr.optString("il").ifBlank { pr.optString("istante").ifBlank { acc.il } }))
            Coppia("Da dove", "Via Google: l'indirizzo IP non arriva")
            Coppia("Browser", pr.optString("agente").ifBlank { pr.optString("browser") })
            Coppia("Impronta del preventivo visto", pr.optString("impronta"))
            Coppia("Versione", pr.optString("versione"))
        }
    }
}

/** Le voci ⋯ del portale per una cosa (Pubblica nel portale / Togli dal portale): solo con portale 2. */
@Composable
internal fun VociPortale(dati: Dati, info: InfoPortale?, inCoda: Boolean?, puoPubblicare: Boolean, onPubblica: () -> Unit, onFatto: () -> Unit) {
    if (!LocalPermessi.current.modifica(Moduli.PORTALE)) return
    val avvisi = LocalAvvisi.current
    val pubblicato = inCoda ?: (info?.pubblicato == true)
    if (pubblicato) VoceMenu(Icone.chiudi, "Togli dal portale", { onFatto(); togliDalPortale(dati, info?.id.orEmpty(), avvisi) })
    else if (puoPubblicare) VoceMenu(Icone.globo, "Pubblica nel portale", { onFatto(); onPubblica() })
}

// ---------------------------------------------------------------------------------- rapportino

/** Sotto la firma (§12.6): "Firmato nel portale da Roberto Ferretti · 22/10/2026 10:15"; la pillola del portale. */
@Composable
internal fun BloccoPortaleRapportino(dati: Dati, r: Rapportino) {
    val c = W.colori
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val info = InfoPortale(r.portalePubblicato, r.portaleVistoIl, "", r.portaleDaFirmare, r.portaleId)
    val inCoda = if (r.id.isNotBlank()) InCoda7.portaleInCoda("rapportino", r.id, r.portaleId, ops) else null
    if (r.portalePubblicato || inCoda != null) Row { PillolaNelPortale(info, inCoda) }
    if (r.firmaModo == "portale") Text(
        "Firmato nel portale da " + r.firmaReferente.ifBlank { r.firmatario } + (istanteVisto(r.firmatoIl).takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
        style = Testi.secondario, color = c.firmatoTesto,
    )
}

// ---------------------------------------------------------------------------------- ticket

/**
 * Nel ticket (§12.6): i Messaggi col cliente (la conversazione pubblica, divisa dalla
 * cronologia interna), Rispondi nel portale col bordo, Mostra nel portale.
 */
@Composable
internal fun BloccoTicketPortale(dati: Dati, t: Ticket) {
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val avvisi = LocalAvvisi.current
    val scrive = LocalPermessi.current.modifica(Moduli.TICKET) && t.puoScrivere
    var rispondi by remember { mutableStateOf(false) }
    if (t.id.isBlank()) return
    val p = t.portale
    val visibile = InCoda7.visibileInCoda(t.id, ops) ?: p?.visibile ?: t.dalPortale
    val clientePortale = dati.anagrafiche.value.cliente(t.idCliente, "")?.portale == true
    if (p == null && !t.dalPortale && !clientePortale) return
    val messaggi = p?.messaggi.orEmpty() + InCoda7.risposte(t.id, ops)
    Sezione5("Messaggi col cliente", messaggi.size.takeIf { it > 0 }) {
        Scheda(orizzontale = 14.dp, verticale = 14.dp, spazio = 10.dp) {
            if (messaggi.isEmpty()) RigaCalma("Nessun messaggio col cliente")
            messaggi.forEach { m -> Bolla(m) }
            if (scrive) PulsanteBordo("Rispondi nel portale", {
                if (!visibile) avvisi.mostra("La richiesta non è nel portale: mostrala prima") else rispondi = true
            }, Modifier.fillMaxWidth(), altezza = 48.dp, icona = Icone.invia)
        }
    }
    if (scrive) Scheda(orizzontale = 18.dp, verticale = 4.dp, spazio = 0.dp) {
        RigaInterruttore("Mostra nel portale", visibile, { si ->
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@RigaInterruttore }
            dati.fase7.mostraNelPortale(t.id, si)
            avvisi.mostra(if (si) "Il cliente vede la richiesta e i messaggi" else "La richiesta non si vede più nel portale")
        })
    }
    if (rispondi) FoglioRispondiNelPortale(dati, t.id, t.cliente) { rispondi = false }
}

/** Un messaggio come in una chat: il cliente a sinistra, lo studio a destra, con l'ora. */
@Composable
private fun Bolla(m: MessaggioTicket) {
    val c = W.colori
    val cliente = m.dalCliente
    // Come nel prototipo: il cliente ("loro") a sinistra su fondo scheda col bordo, lo studio ("noi") a destra in giallo tenue.
    val forma = if (cliente) RoundedCornerShape(18.dp, 18.dp, 18.dp, 6.dp) else RoundedCornerShape(18.dp, 18.dp, 6.dp, 18.dp)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (cliente) Arrangement.Start else Arrangement.End) {
        Column(
            Modifier.widthIn(max = 280.dp).clip(forma).background(if (cliente) c.scheda else c.gialloTenue)
                .let { if (cliente) it.border(1.dp, c.bordoScheda, forma) else it }.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            val chi = if (cliente) m.da else "Studio Tecnico GM" + (m.chi.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")
            Text(listOf(chi, if (m.inCoda) "parte appena c'è rete" else quando7(m.quando)).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.piccolo, color = c.tenue)
            Text(m.testo, style = Testi.testo, color = c.testo)
            m.file.forEach { Text(it, style = Testi.secondario, color = c.testo2) }
        }
    }
}

// ---------------------------------------------------------------------------------- attività

/** Avvisa il cliente (§3.14): solo per appuntamento, sopralluogo, intervento con un cliente. */
internal fun conAvviso(a: Attivita): Boolean = a.tipo != TipoAttivita.ATTIVITA && a.idCliente.isNotBlank()

/** La proposta di base (§3.14): WhatsApp se il referente ha detto sì, se no email se c'è, se no niente. */
internal fun avvisoDiBase(dati: Dati, a: Attivita): String {
    val d = destinatarioDi(dati, a.idCliente, a.idReferenteAvviso)
    return when {
        d.whatsappOk && d.conNumero -> "whatsapp"
        d.email.isNotBlank() -> "email"
        else -> ""
    }
}

/** La riga Avvisa il cliente (WhatsApp · Email · No) e il referente. */
@Composable
internal fun RigaAvvisaCliente(dati: Dati, a: Attivita, onCambia: (Attivita) -> Unit) {
    if (!conAvviso(a) || !LocalPermessi.current.vede(Moduli.COMUNICAZIONI)) return
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val scelto = a.avvisaCliente ?: avvisoDiBase(dati, a)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Avvisa il cliente", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        Segmenti(listOf("whatsapp" to "WhatsApp", "email" to "Email", "" to "No"), scelto, { onCambia(a.copy(avvisaCliente = it)) })
        val refs = ana.referentiDi(a.idCliente)
        if (scelto.isNotBlank() && refs.size > 1) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val attuale = a.idReferenteAvviso.ifBlank { destinatarioDi(dati, a.idCliente).idReferente }
            refs.forEach { r -> Pillola(r.nome, r.id == attuale, { onCambia(a.copy(idReferenteAvviso = r.id, avvisaCliente = scelto)) }) }
        }
    }
}

/** Dopo il salvataggio di un appuntamento con un cliente (§3.14): "Intervento fissato per giovedì 23" con Avvisa il cliente. */
internal fun avvisoInterventoFissato(dati: Dati, a: Attivita, avvisi: Avvisi): Boolean {
    val inizio = a.inizio
    if (!conAvviso(a) || inizio == null) return false
    val giorno = inizio.format(DateTimeFormatter.ofPattern("EEEE d", ITALIA))
    val nome = when (a.tipo) { TipoAttivita.APPUNTAMENTO -> "Appuntamento fissato"; TipoAttivita.SOPRALLUOGO -> "Sopralluogo fissato"; else -> "Intervento fissato" }
    avvisi.mostraConAzione("$nome per $giorno", "Avvisa il cliente") {
        apriMessaggio(
            dati, a.idCliente, "intervento_fissato", Riferimento7("attivita", a.id, a.titolo), idReferente = a.idReferenteAvviso,
            riga = a.titolo + " · " + inizio.format(DateTimeFormatter.ofPattern("EEEE d MMMM 'alle' H:mm", ITALIA)),
            canale = (a.avvisaCliente ?: avvisoDiBase(dati, a)).ifBlank { null },
        )
    }
    return true
}

// ---------------------------------------------------------------------------------- fattura

internal fun portaleDi(f: Fattura): InfoPortale? = InfoPortale.daJson(f.grezzo?.optJSONObject("portale"))
internal fun sollecitiNo(f: Fattura): String = f.grezzo?.optString("sollecitiNo").orEmpty()
internal fun copiaDi(f: Fattura): String = f.grezzo?.optJSONObject("copia")?.optString("nome").orEmpty()

/** Nella fattura emessa (§12.6): la pillola Nel portale, la copia PDF, il promemoria di pagamento (fatturazione 2 e soldi). */
@Composable
internal fun BloccoFatturaPortale(dati: Dati, f: Fattura) {
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val info = portaleDi(f)
    val inCoda = InCoda7.portaleInCoda("fattura", f.id, info?.id.orEmpty(), ops)
    if (info?.pubblicato == true || inCoda != null) Row { PillolaNelPortale(info, inCoda) }
    copiaDi(f).takeIf { it.isNotBlank() }?.let { RigaInfo("Copia di cortesia: $it") }
    sollecitiNo(f).takeIf { it.isNotBlank() }?.let { RigaInfo("Niente promemoria di pagamento: $it") }
    if (f.emessa && !f.nota && f.scaduta && (f.residuo ?: 0.0) > 0 && sollecitiNo(f).isBlank() && vedePagamenti() && LocalPermessi.current.vede(Moduli.COMUNICAZIONI) && f.idCliente.isNotBlank()) {
        PulsanteBordo("Prepara un promemoria di pagamento", {
            apriMessaggio(dati, f.idCliente, "promemoria_pagamento", Riferimento7("fattura", f.id, "Fattura " + f.numero))
        }, Modifier.fillMaxWidth(), altezza = 48.dp, icona = Icone.whatsapp)
    }
}

/** Allega la copia PDF (§8.2): la copia di cortesia dal programma di Manuel. Vuole la rete (va in diretta). */
@Composable
internal fun rememberAllegaCopia(dati: Dati, f: Fattura?, onFatto: () -> Unit): () -> Unit {
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val scegli = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val x = f ?: return@rememberLauncherForActivityResult
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val letto = runCatching { leggiFileScelto(ctx, uri, 10) }.getOrElse { avvisi.mostra(it.message ?: "Il file non si legge"); return@launch }
            if (!letto.first.lowercase().endsWith(".pdf")) { avvisi.mostra("La copia di cortesia è un PDF"); return@launch }
            dati.fase7.allegaCopiaFattura(x.id, letto.first, "application/pdf", letto.third)
                .onSuccess { avvisi.mostra("Copia PDF allegata"); onFatto() }
                .onFailure { e -> avvisi.mostra(if (e is java.io.IOException || e.cause is java.io.IOException) "Serve la rete: la copia si allega da qui appena c'è" else e.message ?: "La copia non è stata allegata: riprova") }
        }
    }
    return { if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO) else scegli.launch(arrayOf("application/pdf")) }
}

/** Dopo un ⋯ che pubblica: il foglio Pubblica nel portale per la cosa. */
@Composable
internal fun FoglioPubblicaSe(dati: Dati, aperto: Boolean, tipo: String, id: String, idCliente: String, nomeCliente: String, inBozza: Boolean = false, onChiudi: () -> Unit) {
    if (aperto) FoglioPubblica(dati, tipo, id, idCliente, nomeCliente, inBozza, onChiudi)
}

/** Non mandare promemoria (§3.15): il motivo ("pagherà a fine mese, d'accordo al telefono"); vuoto lo toglie. */
@Composable
internal fun FoglioNonSollecitare(dati: Dati, f: Fattura, onChiudi: (Boolean) -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var motivo by remember { mutableStateOf(sollecitiNo(f)) }
    FoglioDalBasso({ onChiudi(false) }) {
        Text("Non mandare promemoria", style = Testi.titoloScheda, color = c.testo)
        CampoTesto(motivo, { motivo = it }, "Perché", Modifier.fillMaxWidth(), segnaposto = "Pagherà a fine mese, d'accordo al telefono", righe = 2)
        PulsantePrincipale("Salva", {
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(false); return@PulsantePrincipale }
            scope.launch {
                dati.fase7.nonSollecitare(f.id, motivo)
                    .onSuccess { avvisi.mostra(if (motivo.isBlank()) "I promemoria tornano" else "Niente promemoria per questa fattura"); onChiudi(true) }
                    .onFailure { avvisi.mostra(it.message ?: "Non si è salvato: riprova") }
            }
        }, altezza = 56.dp)
    }
}
