package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.PonteServer
import kotlinx.coroutines.launch
import java.time.LocalDate

/*
 * Amministrazione › Impostazioni della fase 7 (fase7.md §12.6 e §0.5): la scheda Portale
 * clienti (indirizzo con lo stato e Prova adesso, lo script del portale, Portale acceso,
 * durate, file, email lasciate allo studio, informativa, Spegni il portale adesso) e la
 * scheda Comunicazioni (WhatsApp sul telefono, promemoria, i Non collegati col perché).
 * Ognuna col suo Salva col bordo; niente giallo.
 */

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PaginaPortaleImpostazioni(dati: Dati, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    fun v(k: String) = ana.impostazione(k)
    var giro by remember { mutableIntStateOf(0) }
    val portale = rememberLettura("portale-imp", giro) { dati.fase7.portale() }
    val stato = (portale as? Lettura.Pronta)?.dato?.stato
    var indirizzo by remember { mutableStateOf(v("PORTALE_INDIRIZZO")) }
    var attivo by remember { mutableStateOf<Boolean?>(null) }
    var link by remember { mutableStateOf(v("PORTALE_LINK_MINUTI").ifBlank { "10" }) }
    var sessione by remember { mutableStateOf(v("PORTALE_SESSIONE_MINUTI").ifBlank { "30" }) }
    var ore by remember { mutableStateOf(v("PORTALE_SESSIONE_ORE").ifBlank { "8" }) }
    var mb by remember { mutableStateOf(v("PORTALE_FILE_MAX_MB").ifBlank { "20" }) }
    var riserva by remember { mutableStateOf(v("PORTALE_EMAIL_RISERVA").ifBlank { "20" }) }
    var provo by remember { mutableStateOf(false) }
    var spegni by remember { mutableStateOf<String?>(null) }
    var informativa by remember { mutableStateOf(false) }
    val soloCifre = { t: String -> t.all { it.isDigit() } }
    val acceso = attivo ?: stato?.attivo ?: (v("PORTALE_ATTIVO") == "true")
    fun salva(valori: Map<String, String>, frase: String) {
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        ambitoAmm.launch {
            dati.salvaImpostazioni(valori).fold(onSuccess = { avvisi.mostra(frase); giro++; Giri7.portale++ }, onFailure = { avvisi.mostra(spiegaErrore2(it, "Non si è salvato: riprova")) })
        }
    }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Portale clienti", sopra = "Impostazioni")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            CampoTesto(indirizzo, { indirizzo = it.trim() }, "Indirizzo del portale", Modifier.fillMaxWidth(), segnaposto = "https://studiogm-portale.netlify.app", tastiera = KeyboardType.Uri, abilitato = puo)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                // La pillola e "provato il" in mezzo all'altezza di Prova adesso (48 dp).
                Box(Modifier.align(Alignment.CenterVertically)) {
                    when {
                        stato == null -> if (portale is Lettura.InCorso) Segnaposto(32.dp) else PillolaScollegata()
                        stato.nonCollegato -> PillolaScollegata()
                        stato.collegato == "si" -> Parola7("Collegato")
                        else -> Parola7("Non si raggiunge")
                    }
                }
                stato?.controllatoIl?.takeIf { it.isNotBlank() }?.let { Text("provato " + quando7(it), style = Testi.secondario, color = c.tenue, modifier = Modifier.align(Alignment.CenterVertically)) }
                PulsanteTesto(if (provo) "Provo…" else "Prova adesso", {
                    if (provo) return@PulsanteTesto
                    if (dati.esempio) { avvisi.mostra("Raggiunto da fuori in 412 ms"); return@PulsanteTesto }
                    provo = true
                    ambitoAmm.launch {
                        dati.fase7.controlla()
                            .onSuccess { (col, ms) -> avvisi.mostra(when (col) { "si" -> "Raggiunto da fuori" + (ms?.let { " in $it ms" } ?: ""); "no" -> "Non si raggiunge da fuori"; else -> "Il portale non è collegato: manca l'indirizzo" }); giro++ }
                            .onFailure { avvisi.mostra(it.message ?: "La prova non è riuscita: riprova") }
                        provo = false
                    }
                })
            }
            if (stato?.nonCollegato != false) Text("Il portale non è ancora su internet", style = Testi.secondario, color = c.tenue)
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Script del portale", style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
                when (stato?.script) {
                    "attivo" -> Parola7("Attivo")
                    "non risponde" -> Parola7("Non risponde")
                    else -> PillolaScollegata()
                }
            }
            if (stato != null && stato.script != "attivo" && stato.script != "non risponde") Text("Mancano WISPER_PORTALE_URL e SEGRETO_PORTALE sul NAS", style = Testi.secondario, color = c.tenue)
            RigaInterruttore("Portale acceso", acceso, { si ->
                if (!puo) return@RigaInterruttore
                if (!si) { spegni = ""; return@RigaInterruttore }
                attivo = true
                salva(mapOf("PORTALE_ATTIVO" to "true"), "Portale acceso")
            })
            if (puo) PulsanteBordo("Salva", {
                if (indirizzo.isNotBlank() && !indirizzo.startsWith("https://")) { avvisi.mostra("Indirizzo: deve cominciare con https://"); return@PulsanteBordo }
                salva(mapOf("PORTALE_INDIRIZZO" to indirizzo.trimEnd('/')), if (indirizzo.isBlank()) "Salvato: il portale è Non collegato" else "Salvato: provo a raggiungerlo da fuori")
            }, Modifier.fillMaxWidth(), altezza = 48.dp)
        }

        Etichetta("Ingresso e file")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            CampoTesto(link, { if (soloCifre(it)) link = it }, "Link e codice valgono", tastiera = KeyboardType.Number, suffisso = "minuti", abilitato = puo)
            CampoTesto(sessione, { if (soloCifre(it)) sessione = it }, "Sessione senza uso", tastiera = KeyboardType.Number, suffisso = "minuti", abilitato = puo)
            CampoTesto(ore, { if (soloCifre(it)) ore = it }, "Sessione al massimo", tastiera = KeyboardType.Number, suffisso = "ore", abilitato = puo)
            Coppia("File dal cliente", "PDF, foto, DWG, DXF, Word, Excel")
            CampoTesto(mb, { if (soloCifre(it)) mb = it }, "Grandezza massima di un file", tastiera = KeyboardType.Number, suffisso = "MB", abilitato = puo)
            CampoTesto(riserva, { if (soloCifre(it)) riserva = it }, "Email lasciate allo studio", tastiera = KeyboardType.Number, suffisso = "al giorno", abilitato = puo)
            stato?.emailRimaste?.let { Coppia("Email che Google lascia mandare oggi", "$it") }
            if (puo) PulsanteBordo("Salva", {
                salva(mapOf("PORTALE_LINK_MINUTI" to link, "PORTALE_SESSIONE_MINUTI" to sessione, "PORTALE_SESSIONE_ORE" to ore, "PORTALE_FILE_MAX_MB" to mb, "PORTALE_EMAIL_RISERVA" to riserva), "Salvato")
            }, Modifier.fillMaxWidth(), altezza = 48.dp)
        }

        Etichetta("Informativa per i clienti")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            val data = v("PORTALE_INFORMATIVA_DATA").ifBlank { "2026-10-22" }
            Coppia("Versione", "del " + dataVista(data))
            if (puo) PulsanteBordo("Cambia", { informativa = true }, Modifier.fillMaxWidth(), altezza = 48.dp)
        }

        if (puo) PulsantePericolo("Spegni il portale adesso", { spegni = "" }, Modifier.fillMaxWidth())
    }

    spegni?.let {
        FoglioConferma(
            "Spegnere il portale?", "Il portale si spegne per tutti i clienti: chi è dentro esce subito. Si riaccende da qui.", "Spegni il portale adesso",
            onConferma = {
                spegni = null
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@FoglioConferma }
                attivo = false
                ambitoAmm.launch {
                    dati.fase7.spegni(conferma = true)
                        .onSuccess { avvisi.mostra("Portale spento: nessun cliente può entrare"); giro++; Giri7.portale++ }
                        .onFailure { e -> attivo = null; avvisi.mostra(if (e is PonteServer.DaConfermare) e.message.orEmpty() else e.message ?: "Il portale non si è spento: riprova") }
                }
            },
            onAnnulla = { spegni = null }, pericolo = true,
        )
    }
    if (informativa) {
        var testo by remember { mutableStateOf(v("PORTALE_INFORMATIVA")) }
        FoglioDalBasso({ informativa = false }) {
            Text("Informativa per i clienti", style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState())) {
                CampoTesto(testo, { testo = it }, "Testo", Modifier.fillMaxWidth(), righe = 10)
            }
            PulsantePrincipale("Salva l'informativa", {
                informativa = false
                salva(mapOf("PORTALE_INFORMATIVA" to testo, "PORTALE_INFORMATIVA_DATA" to LocalDate.now().toString()), "Salvata: i clienti la rivedono al prossimo ingresso")
            }, altezza = 56.dp)
        }
    }
}

@Composable
fun PaginaComunicazioniImpostazioni(dati: Dati, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    fun v(k: String) = ana.impostazione(k)
    var app by remember { mutableStateOf(v("WHATSAPP_APP").ifBlank { "chiedi" }) }
    var giorniPrima by remember { mutableStateOf(v("PROMEMORIA_GIORNI_PRIMA").ifBlank { "1" }) }
    var dopo by remember { mutableStateOf(v("SOLLECITO_DOPO_GIORNI").ifBlank { "7" }) }
    var secondo by remember { mutableStateOf(v("SOLLECITO_SECONDO_GIORNI").ifBlank { "30" }) }
    val soloCifre = { t: String -> t.all { it.isDigit() } }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Comunicazioni", sopra = "Impostazioni")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            Etichetta("WhatsApp sul telefono")
            Segmenti(listOf("business" to "Business", "normale" to "Normale", "chiedi" to "Chiedi"), app, { if (puo) app = it })
            CampoTesto(giorniPrima, { if (soloCifre(it)) giorniPrima = it }, "Promemoria degli appuntamenti", tastiera = KeyboardType.Number, suffisso = "giorno lavorativo prima", abilitato = puo)
            CampoTesto(dopo, { if (soloCifre(it)) dopo = it }, "Promemoria di pagamento dopo", tastiera = KeyboardType.Number, suffisso = "giorni", abilitato = puo)
            CampoTesto(secondo, { if (soloCifre(it)) secondo = it }, "Il secondo dopo", tastiera = KeyboardType.Number, suffisso = "giorni", abilitato = puo)
            if (puo) PulsanteBordo("Salva", {
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsanteBordo }
                ambitoAmm.launch {
                    dati.salvaImpostazioni(mapOf("WHATSAPP_APP" to app, "PROMEMORIA_GIORNI_PRIMA" to giorniPrima, "SOLLECITO_DOPO_GIORNI" to dopo, "SOLLECITO_SECONDO_GIORNI" to secondo))
                        .fold(onSuccess = { avvisi.mostra("Salvato"); Giri7.comunicazioni++ }, onFailure = { avvisi.mostra(spiegaErrore2(it, "Non si è salvato: riprova")) })
                }
            }, Modifier.fillMaxWidth(), altezza = 48.dp)
        }
        Etichetta("Non collegati")
        RigheNonCollegate(avvisi, conFrase = true)
    }
}
