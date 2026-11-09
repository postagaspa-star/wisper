@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Accettazione7
import eu.stgm.wisper.rapportino.Attivita
import eu.stgm.wisper.rapportino.Destinatario
import eu.stgm.wisper.rapportino.Fattura
import eu.stgm.wisper.rapportino.InCoda7
import eu.stgm.wisper.rapportino.InfoPortale
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Preventivo
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Referente
import eu.stgm.wisper.rapportino.Riferimento7
import eu.stgm.wisper.rapportino.Ticket
import eu.stgm.wisper.rapportino.TipoAttivita
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/*
 * I pezzi della fase 7 nelle pagine che c'erano già (fase7.md §12.6): la scheda cliente
 * (Portale, Comunicazioni, i referenti con WhatsApp, Email e Chiama), la commessa, il
 * preventivo (nel portale, l'accettazione con la firma e la prova senza IP), il rapportino
 * (firmato nel portale), il ticket (messaggi col cliente), l'attività (Avvisa il cliente),
 * la fattura (copia PDF, promemoria di pagamento), il documento.
 */

/** Il messaggio da aprire da qualunque pagina (anche dall'avviso dopo che la pagina se n'è andata): lo mostra MainActivity. */
object MessaggioDaAprire {
    var bozza by mutableStateOf<Bozza7?>(null)
}

/** In MainActivity: il foglio Messaggio aperto da [MessaggioDaAprire]. */
@Composable
fun FoglioMessaggioGlobale(dati: Dati) {
    val b = MessaggioDaAprire.bozza ?: return
    FoglioMessaggio(dati, b) { MessaggioDaAprire.bozza = null; RicordoPromemoria.chiuso() }
}

/** Il destinatario per un messaggio del cliente: il referente scelto, o quello col sì a WhatsApp, o il primo (§9.5). */
internal fun destinatarioDi(dati: Dati, idCliente: String, idReferente: String = "", pagamenti: Boolean = false): Destinatario {
    val ana = dati.anagrafiche.value
    val cl = ana.cliente(idCliente, "")
    val refs = ana.referentiDi(idCliente)
    val r = refs.firstOrNull { it.id == idReferente }
        ?: (if (pagamenti) refs.firstOrNull { it.pagamenti } else null)
        ?: refs.firstOrNull { it.whatsappOk } ?: refs.firstOrNull()
    if (r != null) return Destinatario.da(r, cl)
    val n = eu.stgm.wisper.rapportino.Whatsapp.numero(cl?.telefono)
    return Destinatario("", cl?.nome.orEmpty(), cl?.nome.orEmpty(), idCliente, if (n.valido) n.numero else "", n.visto, cl?.email.orEmpty(), false, n.fisso)
}

/** Apre il Messaggio per un cliente con un modello (il testo lo compone il server). */
internal fun apriMessaggio(dati: Dati, idCliente: String, modello: String, rif: Riferimento7 = Riferimento7(), idReferente: String = "", riga: String = "", canale: String? = null) {
    val a = destinatarioDi(dati, idCliente, idReferente, pagamenti = modello.contains("pagamento"))
    MessaggioDaAprire.bozza = Bozza7(
        a = a, canale = canale ?: if (a.conNumero && (a.whatsappOk || !modello.contains("pagamento"))) "whatsapp" else "email", modello = modello, uso = Bozza7.usoDi(modello),
        riferimento = rif, rigaRiferimento = riga, rif = Bozza7.rifDa(rif), daPreparare = true,
    )
}

/** La firma (PNG) di un file del server, su fondo bianco come sul foglio. */
@Composable
internal fun ImmagineFirma(dati: Dati, idFile: String, altezza: Int = 110) {
    if (idFile.isBlank() || dati.esempio) return
    val bmp = produceState<android.graphics.Bitmap?>(null, idFile) {
        value = withContext(Dispatchers.IO) { runCatching { dati.file(idFile)?.first?.let { BitmapFactory.decodeByteArray(it, 0, it.size) } }.getOrNull() }
    }.value
    if (bmp != null) Image(bmp.asImageBitmap(), "Firma del cliente", Modifier.fillMaxWidth().height(altezza.dp).clip(RoundedCornerShape(12.dp)).background(Color.White), contentScale = ContentScale.Fit)
}

/** "22/10/2026 10:07" da un istante. */
internal fun istanteVisto(istante: String): String =
    eu.stgm.wisper.rapportino.istanteLocale(istante)?.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")).orEmpty()

// ---------------------------------------------------------------------------------- scheda cliente

/** La sezione Portale della scheda cliente (§12.6): stato, "2 referenti con l'accesso · ultimo accesso oggi", Apri. */
@Composable
internal fun SezionePortaleCliente(dati: Dati, nav: Navigatore, idCliente: String) {
    if (!LocalPermessi.current.vede(Moduli.PORTALE)) return
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val cl = ana.cliente(idCliente, "") ?: return
    val refs = ana.referentiDi(idCliente).filter { it.portale }
    val ultimo = refs.map { it.ultimoAccesso }.filter { it.isNotBlank() }.maxOrNull()
    Sezione5("Portale") {
        SchedaElenco {
            RigaVoce(
                if (cl.portale) "Acceso" else "Spento",
                sotto = (if (refs.isEmpty()) "Nessun referente con l'accesso" else Testo.quanti(refs.size, "referente con l'accesso", "referenti con l'accesso")) + (ultimo?.let { " · ultimo accesso " + quando7(it) } ?: ""),
                inizio = { IconaTinta(Icone.globo, if (cl.portale) "verde" else "grigio") },
                fine = { Text("Apri", style = Testi.pulsanteSecondario, color = W.colori.collegamento) },
                freccia = false,
                onClick = { nav.vai("portale-cliente/$idCliente") },
            )
        }
    }
}

/**
 * Le comunicazioni di un cliente o di una commessa (§12.6): le ultime 5 (col cliente anche le
 * righe calme degli accessi), Tutte, Scrivi col bordo.
 */
@Composable
internal fun SezioneComunicazioni(dati: Dati, nav: Navigatore, idCliente: String = "", idCommessa: String = "", conTitolo: Boolean = true) {
    if (!LocalPermessi.current.vede(Moduli.COMUNICAZIONI)) return
    val c = W.colori
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val chiave = if (idCommessa.isNotBlank()) "idCommessa" to idCommessa else "idCliente" to idCliente
    val lettura = rememberLettura("com-${chiave.first}-${chiave.second}", Giri7.comunicazioni) { dati.fase7.storicoDi(chiave.first, chiave.second, conAccessi = idCommessa.isBlank()) }
    val contenuto: @Composable () -> Unit = {
        when (lettura) {
            is Lettura.InCorso -> Segnaposto(90.dp)
            is Lettura.Errore -> SchedaErrore(lettura.messaggio) {}
            is Lettura.Pronta -> {
                val l = InCoda7.applicaStorico(lettura.dato.comunicazioni, ops).filter { it.inCoda.not() || idCliente.isBlank() || it.idCliente == idCliente }.take(if (conTitolo) 5 else 50)
                SchedaElenco {
                    if (l.isEmpty() && lettura.dato.accessi.isEmpty()) RigaCalma("Nessuna comunicazione")
                    l.forEachIndexed { i, x ->
                        if (i > 0) LineaElenco()
                        RigaComunicazione(x, conGiorno = true) { RicordoComunicazioni.aperta = x; nav.vai("comunicazione/${x.chiave}") }
                    }
                    lettura.dato.accessi.take(2).forEach { a ->
                        LineaElenco()
                        Text(a.frase + " · " + quando7(a.quando), style = Testi.secondario, color = c.tenue, modifier = Modifier.padding(vertical = 12.dp))
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            PulsanteTesto("Tutte", {
                RicordoComunicazioni.mostra("storico", idCliente, idCommessa)
                nav.sezione(Sezione.COMUNICAZIONI)
            }, colore = c.gialloTesto)
            if (scriveComunicazioni()) {
                val idCl = idCliente.ifBlank { dati.anagrafiche.value.commessa(idCommessa)?.idCliente.orEmpty() }
                if (idCl.isNotBlank()) PulsanteBordo("Scrivi", {
                    apriMessaggio(dati, idCl, "libero", if (idCommessa.isNotBlank()) Riferimento7("commessa", idCommessa, idCommessa) else Riferimento7())
                }, altezza = 48.dp, icona = Icone.fumetto)
            }
        }
    }
    if (conTitolo) Sezione5("Comunicazioni") { contenuto() } else Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { contenuto() }
}

/**
 * Un referente nella scheda cliente (§12.6): nome, ruolo e telefono, le pillole Accesso al
 * portale, Ha detto sì a WhatsApp, Paga le fatture; le icone WhatsApp, Email, Chiama.
 */
@Composable
internal fun RigaReferente7(dati: Dati, r: Referente, onApri: (() -> Unit)?, onChiama: () -> Unit, onEmail: () -> Unit) {
    val c = W.colori
    val comunica = LocalPermessi.current.vede(Moduli.COMUNICAZIONI) && scriveComunicazioni()
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).let { if (onApri != null) it.clickable(onClick = onApri) else it }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        CerchioPersona(r.nome.split(' ', '.').filter { it.length > 1 && it.first().isLetter() }.take(2).joinToString("") { it.take(1) }.uppercase().ifBlank { "?" }, 40.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(r.nome, style = Testi.forte, color = c.testo)
            val sotto = listOf(r.ruolo, r.telefono).filter { it.isNotBlank() }.joinToString(" · ")
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondario, color = c.tenue)
            PilloleReferente(r.portale, r.whatsappOk, r.pagamenti)
        }
        if (comunica && (r.telefono.isNotBlank() || r.whatsapp.isNotBlank())) TondoAzione(Icone.whatsapp, "WhatsApp a ${r.nome}") {
            val ana = dati.anagrafiche.value
            MessaggioDaAprire.bozza = Bozza7(a = Destinatario.da(r, ana.cliente(r.idSoggetto, "")), canale = "whatsapp", modello = "libero", daPreparare = true)
        }
        if (r.email.isNotBlank()) TondoAzione(Icone.email, "Email a ${r.nome}", onEmail)
        if (r.telefono.isNotBlank()) TondoAzione(Icone.telefono, "Chiama ${r.nome}", onChiama)
    }
}

