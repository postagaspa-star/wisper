package eu.stgm.wisper.ui

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Vista
import eu.stgm.wisper.conConti
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.Conti
import eu.stgm.wisper.rapportino.Numeri
import kotlinx.coroutines.launch
import java.text.Collator
import java.time.YearMonth
import java.util.Locale

/**
 * I clienti (docs/telefono-ufficio.md, prototipo SCHERMI.clienti/cliente/modCliente):
 * l'elenco, la pagina di un cliente e il modulo. Fanno quello che fa la pagina
 * Clienti di Wisper Ufficio (pc/ui/app.js), con le misure del telefono.
 */

// ---------------------------------------------------------------------------------- elenco

@Composable
fun SchermataClienti(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    var cerca by rememberSaveable { mutableStateOf("") }
    val mese = remember { YearMonth.now() }
    val delMese = remember(viste, ana) { totaliDelMese(viste, ana, mese) }
    val lista = remember(ana.clienti, cerca) {
        // Come il computer: "rossi imp" trova "Rossi Impianti S.r.l.", anche per alias, email e partita IVA.
        val t = Anagrafiche.normalizza(cerca)
        ana.clienti
            .filter { cl -> t.isEmpty() || Anagrafiche.normalizza(listOf(cl.id, cl.nome, cl.alias.joinToString(" "), cl.email, cl.partitaIva).joinToString(" ")).contains(t) }
            .sortedWith(compareBy(Collator.getInstance(Locale.ITALY)) { it.nome })
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = SpazioSottoBarra),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Clienti")
            CampoCerca(cerca, { cerca = it }, "Nome, email, partita IVA")
            if (lista.isEmpty()) {
                Text(
                    "Nessun cliente", style = Testi.secondarioGrande, color = c.tenue, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp, horizontal = 12.dp),
                )
            } else {
                SchedaElenco {
                    lista.forEachIndexed { i, cl ->
                        if (i > 0) LineaElenco()
                        val t = delMese[cl.id]
                        RigaVoce(
                            cl.nome,
                            sotto = tariffaBreve(cl),
                            inizio = { Iniziali(cl.nome, dimensione = 44.dp) },
                            fine = {
                                // Il mese solo se c'è stato lavoro: "0,00 €" su ogni riga sarebbe rumore.
                                if (t != null && t.n > 0) {
                                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(Testo.euro(t.totale), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo, maxLines = 1)
                                        Text("${Testo.ore(t.ore)} a ${nomeMeseMinuscolo(mese)}", style = Testi.piccolo, color = c.tenue, maxLines = 1)
                                    }
                                }
                            },
                            freccia = false,
                            onClick = { nav.vai("cliente/${cl.id}") },
                        )
                    }
                }
            }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Nuovo cliente", { nav.vai("cliente-nuovo") }, icona = Icone.piu)
        }
    }
}

// ---------------------------------------------------------------------------------- pagina del cliente

/** Quando si è chiesto l'ultima volta tutto lo storico da qui. */
private var storicoLettoAlle = 0L

@Composable
fun SchermataCliente(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val storico by dati.storico.collectAsStateWithLifecycle()
    val mese = remember { YearMonth.now() }
    val cl = ana.cliente(id)

    // Le ore delle commesse vogliono tutti i rapportini: si chiedono entrando, al più ogni cinque minuti (è la lettura lenta).
    LaunchedEffect(Unit) {
        val adesso = System.currentTimeMillis()
        if (adesso - storicoLettoAlle > 5 * 60_000L) {
            storicoLettoAlle = adesso
            dati.aggiornaStorico()
        }
    }

    if (cl == null) {
        NonTrovato("Cliente", "Non trovo questo cliente sul foglio. Torna all'elenco e riprova.") { nav.indietro() }
        return
    }

    val delMese = remember(viste, ana, id) { totaliDelMese(viste, ana, mese)[id] ?: Conti.Totali() }
    // Le commesse ancora vive: le chiuse si vedono da "Tutte".
    val commesse = remember(ana, id) {
        ana.commesseDi(id).filter { !it.chiusa }.sortedWith(compareBy({ it.sospesa }, { it.id }))
    }
    // Le ore delle commesse contano tutti i rapportini, non solo quelli degli ultimi mesi.
    val rapportiniTutti = remember(storico) { storico.conConti() }

    fun copia(cosa: String, valore: String) {
        ctx.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText(cosa, valore))
        avvisi.mostra("Copiato")
    }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() }) {
            PulsanteBordo("Modifica", { nav.vai("cliente-modifica/$id") }, icona = Icone.matita, altezza = 44.dp)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Iniziali(cl.nome, dimensione = 64.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(cl.nome, style = Testi.titoloPagina.copy(fontSize = 26.sp, lineHeight = 30.sp), color = c.testo)
                Text(
                    if (cl.alias.isNotEmpty()) "anche " + cl.alias.joinToString(", ") else tariffaLunga(cl),
                    style = Testi.secondarioGrande, color = c.tenue,
                )
            }
        }

        // Il mese di questo cliente: si tocca e si vedono i suoi rapportini.
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.scheda)
                .border(1.dp, c.bordoScheda, RoundedCornerShape(20.dp))
                .clickable { nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, idCliente = id)) }
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Etichetta(nomeMeseMinuscolo(mese))
                Text("${Testo.ore(delMese.ore)} · ${Testo.euro(delMese.totale)}", style = Testi.titoloSezione, color = c.testo)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Rapportini", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
                Icon(Icone.freccia, null, tint = c.gialloTesto, modifier = Modifier.size(16.dp))
            }
        }

        SchedaElenco {
            RigaContatto("Email", cl.email) { copia("Email", cl.email) }
            LineaElenco()
            RigaContatto("Telefono", cl.telefono) { copia("Telefono", cl.telefono) }
            LineaElenco()
            RigaContatto("Partita IVA", cl.partitaIva) { copia("Partita IVA", cl.partitaIva) }
            LineaElenco()
            RigaContatto("Indirizzo", cl.indirizzo, null)
        }

        TitoloSezione("Come si paga")
        SchedaElenco {
            RigaVoce("Tariffa", valore = tariffaBreve(cl))
            LineaElenco()
            RigaVoce("Costo orario fisso", valore = cl.costoFisso?.let { "${Numeri.scrivi(it)} €/h" } ?: "—")
            LineaElenco()
            // Di solito il viaggio non si paga e i km sì: vuoto sul foglio vuol dire questo.
            RigaVoce("Viaggio", valore = if (cl.pagaViaggio == true) "pagato" else "non pagato")
            LineaElenco()
            RigaVoce("Chilometri", valore = if (cl.kmRimborsati != false) "rimborsati" else "non rimborsati")
        }

        TitoloSezione("Commesse", azione = "Tutte", onAzione = { nav.vai("commesse") })
        SchedaElenco {
            commesse.forEach { m ->
                val k = remember(m, rapportiniTutti, ana) { Conti.cruscotto(m, rapportiniTutti, ana) }
                RigaVoce(
                    m.descrizione.ifBlank { m.id },
                    sotto = Testo.ore(k.ore) + (k.budgetOre?.let { " di " + Testo.ore(it) } ?: "") + if (m.sospesa) " · sospesa" else "",
                    inizio = { CodiceCommessa(m.id) },
                    onClick = { nav.vai("commessa/${m.id}") },
                )
                LineaElenco()
            }
            RigaVoce(
                "Nuova commessa per ${cl.nome}",
                icona = Icone.piu,
                freccia = false,
                onClick = { nav.vai("commessa-nuova/$id") },
            )
        }

        if (cl.note.isNotBlank()) {
            TitoloSezione("Note")
            Scheda { Text(cl.note, style = Testi.testo, color = c.testo) }
        }
    }
}

/** Email, telefono, partita IVA: il valore intero (va a capo) e il pulsante per copiarlo. */
@Composable
private fun RigaContatto(nome: String, valore: String, onCopia: (() -> Unit)?) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(nome, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.testo2)
            if (valore.isBlank()) Text("—", style = Testi.forte.copy(fontWeight = FontWeight.SemiBold), color = c.tenue)
            else Text(valore, style = Testi.forte, color = c.testo)
        }
        if (onCopia != null && valore.isNotBlank()) PulsanteTondo(Icone.copia, "Copia ${nome.lowercase(Locale.ITALY)}", onCopia)
    }
}

// ---------------------------------------------------------------------------------- modulo

@Composable
fun SchermataModificaCliente(dati: Dati, nav: Navigatore, id: String?) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val esistente = id?.let { ana.cliente(it) }

    if (id != null && esistente == null) {
        NonTrovato("Modifica il cliente", "Non trovo questo cliente sul foglio. Torna indietro e riprova.", chiudi = true) { nav.indietro() }
        return
    }

    // I campi partono da quello che c'è sul foglio; rememberSaveable li tiene se si gira il telefono.
    var nome by rememberSaveable(id) { mutableStateOf(esistente?.nome.orEmpty()) }
    var email by rememberSaveable(id) { mutableStateOf(esistente?.email.orEmpty()) }
    var telefono by rememberSaveable(id) { mutableStateOf(esistente?.telefono.orEmpty()) }
    var partitaIva by rememberSaveable(id) { mutableStateOf(esistente?.partitaIva.orEmpty()) }
    var indirizzo by rememberSaveable(id) { mutableStateOf(esistente?.indirizzo.orEmpty()) }
    var altriNomi by rememberSaveable(id) { mutableStateOf(esistente?.alias.orEmpty().joinToString(", ")) }
    var fissa by rememberSaveable(id) { mutableStateOf(esistente?.tariffaFissa != null) }
    var tariffaFissa by rememberSaveable(id) { mutableStateOf(Numeri.scrivi(esistente?.tariffaFissa)) }
    var ultimaTariffa by rememberSaveable(id) { mutableStateOf(Numeri.scrivi(esistente?.ultimaTariffa)) }
    var costoFisso by rememberSaveable(id) { mutableStateOf(Numeri.scrivi(esistente?.costoFisso)) }
    // Di solito il viaggio non si paga e i km sì: è così finché non si sceglie altro (come sul computer).
    var pagaViaggio by rememberSaveable(id) { mutableStateOf(esistente?.pagaViaggio == true) }
    var kmRimborsati by rememberSaveable(id) { mutableStateOf(esistente?.kmRimborsati != false) }
    var note by rememberSaveable(id) { mutableStateOf(esistente?.note.orEmpty()) }
    var provato by rememberSaveable(id) { mutableStateOf(false) }
    var salvo by remember { mutableStateOf(false) }
    var erroreSalva by remember { mutableStateOf<String?>(null) }

    val errNome = if (provato && nome.isBlank()) "Scrivi il nome del cliente" else null
    val errFissa = when {
        !fissa -> null
        tariffaFissa.isBlank() -> if (provato) "Scrivi la tariffa" else null
        else -> erroreNumero(tariffaFissa)
    }
    val errUltima = if (fissa) null else erroreNumero(ultimaTariffa)
    val errCosto = erroreNumero(costoFisso)

    fun salva() {
        provato = true
        if (salvo) return
        if (nome.isBlank() || (fissa && (tariffaFissa.isBlank() || erroreNumero(tariffaFissa) != null)) ||
            (!fissa && erroreNumero(ultimaTariffa) != null) || erroreNumero(costoFisso) != null
        ) return
        val cliente = (esistente ?: Cliente(id = "", nome = "")).copy(
            nome = nome.trim(),
            email = email.trim(),
            telefono = telefono.trim(),
            indirizzo = indirizzo.trim(),
            partitaIva = partitaIva.trim(),
            alias = altriNomi.split(',').map { it.trim() }.filter { it.isNotBlank() },
            tariffaFissa = if (fissa) Numeri.leggi(tariffaFissa) else null,
            // L'ultima libera resta anche per un cliente a tariffa fissa: se torna libero si riparte da lì.
            ultimaTariffa = Numeri.leggi(ultimaTariffa),
            costoFisso = Numeri.leggi(costoFisso),
            pagaViaggio = pagaViaggio,
            kmRimborsati = kmRimborsati,
            note = note.trim(),
        )
        salvo = true
        erroreSalva = null
        scope.launch {
            dati.salvaCliente(cliente, esistente == null).fold(
                onSuccess = { ris ->
                    avvisi.mostra(if (ris.giaEsisteva) "C'era già: ${ris.dato.nome}" else "Salvato ${cliente.nome}")
                    nav.indietro()
                },
                onFailure = { e ->
                    salvo = false
                    erroreSalva = spiegaErrore(e)
                },
            )
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 150.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(if (esistente != null) "Modifica il cliente" else "Nuovo cliente")
            CampoTesto(nome, { nome = it }, "Ragione sociale", Modifier.fillMaxWidth(), errore = errNome)
            CampoTesto(email, { email = it.trim() }, "Email", Modifier.fillMaxWidth(), tastiera = KeyboardType.Email)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CampoTesto(telefono, { telefono = it }, "Telefono", Modifier.weight(1f), tastiera = KeyboardType.Phone)
                // Testo, non numero: "01234567890" tiene lo zero davanti. Undici cifre, come le partite IVA italiane;
                // una estera incollata (lettere davanti) resta com'è.
                CampoTesto(
                    partitaIva,
                    { v -> partitaIva = if (v.all { it.isDigit() }) v.take(11) else v.trim() },
                    "Partita IVA", Modifier.weight(1f), tastiera = KeyboardType.Number,
                )
            }
            CampoTesto(indirizzo, { indirizzo = it }, "Indirizzo", Modifier.fillMaxWidth())
            CampoTesto(altriNomi, { altriNomi = it }, "Altri nomi", Modifier.fillMaxWidth(), segnaposto = "—")

            Scheda(orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp, spazio = 10.dp) {
                Text("Come si paga", style = Testi.titoloSezione, color = c.testo)
                Segmenti(listOf(true to "Tariffa fissa", false to "Tariffa libera"), fissa, { fissa = it })
                if (fissa) {
                    CampoTesto(
                        tariffaFissa, { tariffaFissa = it }, "Tariffa fissa", Modifier.fillMaxWidth(),
                        tastiera = KeyboardType.Decimal, suffisso = "€/h", errore = errFissa,
                    )
                } else {
                    CampoTesto(
                        ultimaTariffa, { ultimaTariffa = it }, "Ultima tariffa usata", Modifier.fillMaxWidth(),
                        segnaposto = "—", tastiera = KeyboardType.Decimal, suffisso = "€/h", errore = errUltima,
                    )
                }
                CampoTesto(
                    costoFisso, { costoFisso = it }, "Costo orario fisso", Modifier.fillMaxWidth(),
                    segnaposto = "—", tastiera = KeyboardType.Decimal, suffisso = "€/h", errore = errCosto,
                )
                RigaSiNo("Viaggio pagato", pagaViaggio) { pagaViaggio = it }
                RigaSiNo("Km rimborsati", kmRimborsati) { kmRimborsati = it }
            }

            CampoTesto(note, { note = it }, "Note", Modifier.fillMaxWidth(), righe = 3)
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter), sopraBarra = false) {
            erroreSalva?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
            PulsantePrincipale(if (salvo) "Salvo…" else "Salva", { salva() }, icona = Icone.spunta, abilitato = !salvo)
        }
    }
}

// ---------------------------------------------------------------------------------- aiuti

/** Una pagina il cui cliente non c'è più (tolto dal foglio, o il foglio non è ancora stato letto). */
@Composable
private fun NonTrovato(titolo: String, testo: String, chiudi: Boolean = false, onIndietro: () -> Unit) {
    Column(
        Modifier.fillMaxSize().background(W.colori.fondo).padding(MarginePagina),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro, chiudi = chiudi)
        TitoloPagina(titolo)
        Text(testo, style = Testi.testo, color = W.colori.tenue)
    }
}

/** "30 €/h fissa", "libera · ultima 42 €/h", "libera". */
private fun tariffaBreve(cl: Cliente): String = when {
    cl.tariffaFissa != null -> "${Numeri.scrivi(cl.tariffaFissa)} €/h fissa"
    cl.ultimaTariffa != null && cl.ultimaTariffa > 0 -> "libera · ultima ${Numeri.scrivi(cl.ultimaTariffa)} €/h"
    else -> "libera"
}

/** "Tariffa fissa 30 €/h", "Tariffa libera · ultima 42 €/h". */
private fun tariffaLunga(cl: Cliente): String = when {
    cl.tariffaFissa != null -> "Tariffa fissa ${Numeri.scrivi(cl.tariffaFissa)} €/h"
    cl.ultimaTariffa != null && cl.ultimaTariffa > 0 -> "Tariffa libera · ultima ${Numeri.scrivi(cl.ultimaTariffa)} €/h"
    else -> "Tariffa libera"
}

/** "ottobre": il mese dentro una frase ("12 h a ottobre"). */
private fun nomeMeseMinuscolo(m: YearMonth): String = Conti.nomeMese(m).substringBefore(' ').lowercase(Locale.ITALY)

/**
 * Ore e totale del mese per ogni cliente. Il conto è quello della vista: per un
 * rapportino cambiato qui e non ancora sul foglio è quello ricalcolato sul telefono.
 * Un rapportino senza codice cliente (scritto prima che il cliente esistesse) si
 * riconosce dal nome, come fa il foglio.
 */
private fun totaliDelMese(viste: List<Vista>, ana: Anagrafiche, mese: YearMonth): Map<String, Conti.Totali> =
    viste.filter { YearMonth.from(it.rapportino.data) == mese }
        .groupBy { v -> ana.cliente(v.rapportino.idCliente, v.rapportino.cliente)?.id ?: v.rapportino.idCliente }
        .mapValues { (_, lista) -> Conti.totali(lista.conConti()) }

/** "Non è un numero" per "trenta" o "3,4,5"; niente per un campo vuoto. */
private fun erroreNumero(testo: String): String? =
    if (testo.isBlank() || Numeri.leggi(testo) != null) null else "Non è un numero"

/** Cosa è successo e cosa fare: Dati lo dice già in italiano; una frase di riserva se manca. */
private fun spiegaErrore(e: Throwable): String =
    e.message?.takeIf { it.isNotBlank() } ?: "Il foglio non risponde: controlla la rete e riprova."
