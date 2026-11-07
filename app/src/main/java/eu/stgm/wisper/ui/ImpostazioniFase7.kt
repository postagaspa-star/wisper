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
 * Dal 06/11/2026 i campi si salvano da soli; l'informativa resta un foglio a parte, perché
 * una versione nuova la rivedono tutti i clienti. Niente giallo.
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
    val salvaDaSolo = rememberSalvaDaSolo()
    var attivo by remember { mutableStateOf<Boolean?>(null) }
    var provo by remember { mutableStateOf(false) }
    var spegni by remember { mutableStateOf<String?>(null) }
    var informativa by remember { mutableStateOf(false) }
    val soloCifre = { t: String -> t.filter { it.isDigit() } }
    val acceso = attivo ?: stato?.attivo ?: (v("PORTALE_ATTIVO") == "true")
    fun salva(valori: Map<String, String>, frase: String) {
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        ambitoAmm.launch {
            dati.salvaImpostazioni(valori).fold(onSuccess = { avvisi.mostra(frase); giro++; Giri7.portale++ }, onFailure = { avvisi.mostra(spiegaErrore2(it, "Non si è salvato: riprova")) })
        }
    }
    suspend fun scrivi(k: String, valore: String): Result<*> = dati.salvaImpostazioni(mapOf(k to valore)).onSuccess { giro++; Giri7.portale++ }

    /** Un numero del portale che si salva da solo; vuoto = quello di base. */
    @Composable
    fun Numero(k: String, base: String, etichetta: String, suffisso: String) = CampoSalvato(
        salvaDaSolo, k, v(k).ifBlank { base }, etichetta, abilitato = puo, tastiera = KeyboardType.Number, suffisso = suffisso, cambia = soloCifre,
    ) { scrivi(k, it) }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Portale clienti", sopra = "Impostazioni")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            CampoSalvato(
                salvaDaSolo, "PORTALE_INDIRIZZO", v("PORTALE_INDIRIZZO"), "Indirizzo del portale", abilitato = puo,
                segnaposto = "https://studiogm-portale.netlify.app", tastiera = KeyboardType.Uri, cambia = { it.trim() },
                controlla = { t -> if (t.isEmpty() || t.startsWith("https://")) null else "Deve cominciare con https://" },
            ) { t ->
                scrivi("PORTALE_INDIRIZZO", t.trimEnd('/')).onSuccess {
                    avvisi.mostra(if (t.isBlank()) "Il portale è Non collegato" else "Provo a raggiungerlo da fuori")
                }
            }
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
            Box(Modifier.evidenziabile("PORTALE_ATTIVO")) {
                RigaInterruttore("Portale acceso", acceso, { si ->
                    if (!puo) return@RigaInterruttore
                    if (!si) { spegni = ""; return@RigaInterruttore }
                    attivo = true
                    salva(mapOf("PORTALE_ATTIVO" to "true"), "Portale acceso")
                })
            }
        }

        Etichetta("Ingresso e file")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            Numero("PORTALE_LINK_MINUTI", "10", "Link e codice valgono", "minuti")
            Numero("PORTALE_SESSIONE_MINUTI", "30", "Sessione senza uso", "minuti")
            Numero("PORTALE_SESSIONE_ORE", "8", "Sessione al massimo", "ore")
            Coppia("File dal cliente", "PDF, foto, DWG, DXF, Word, Excel")
            Numero("PORTALE_FILE_MAX_MB", "20", "Grandezza massima di un file", "MB")
            Numero("PORTALE_EMAIL_RISERVA", "20", "Email lasciate allo studio", "al giorno")
            stato?.emailRimaste?.let { Coppia("Email che Google lascia mandare oggi", "$it") }
        }

        Etichetta("Informativa per i clienti")
        Scheda(Modifier.evidenziabile("PORTALE_INFORMATIVA"), orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
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
            // Non si salva da sola: una versione nuova la rivedono tutti i clienti al prossimo ingresso.
            PulsantePrincipale("Pubblica la versione nuova", {
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
    val salvaDaSolo = rememberSalvaDaSolo()
    val soloCifre = { t: String -> t.filter { it.isDigit() } }
    suspend fun scrivi(k: String, valore: String): Result<*> = dati.salvaImpostazioni(mapOf(k to valore)).onSuccess { Giri7.comunicazioni++ }

    @Composable
    fun Numero(k: String, base: String, etichetta: String, suffisso: String) = CampoSalvato(
        salvaDaSolo, k, v(k).ifBlank { base }, etichetta, abilitato = puo, tastiera = KeyboardType.Number, suffisso = suffisso, cambia = soloCifre,
    ) { scrivi(k, it) }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Comunicazioni", sopra = "Impostazioni")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            Column(Modifier.fillMaxWidth().evidenziabile("WHATSAPP_APP"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Etichetta("WhatsApp sul telefono", Modifier.weight(1f))
                    SegnoSalvato(salvaDaSolo, "WHATSAPP_APP")
                }
                Segmenti(listOf("business" to "Business", "normale" to "Normale", "chiedi" to "Chiedi"), app, { nuovo ->
                    if (!puo || nuovo == app) return@Segmenti
                    val prima = app
                    app = nuovo
                    salvaDaSolo.subito("WHATSAPP_APP", onFallito = { app = prima }) { scrivi("WHATSAPP_APP", nuovo) }
                })
                salvaDaSolo.errori["WHATSAPP_APP"]?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
            }
            Numero("PROMEMORIA_GIORNI_PRIMA", "1", "Promemoria degli appuntamenti", "giorno lavorativo prima")
            Numero("SOLLECITO_DOPO_GIORNI", "7", "Promemoria di pagamento dopo", "giorni")
            Numero("SOLLECITO_SECONDO_GIORNI", "30", "Il secondo dopo", "giorni")
        }
        Etichetta("Non collegati")
        RigheNonCollegate(avvisi, conFrase = true)
    }
}
