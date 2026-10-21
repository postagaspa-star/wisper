package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Archivio
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Vista
import eu.stgm.wisper.conConti
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Commessa
import eu.stgm.wisper.rapportino.Conti
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Stato
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private val IT = Locale.ITALY

/** "ottobre": dentro le frasi. */
private fun meseMinuscolo(m: YearMonth): String = Conti.nomeMese(m).substringBefore(' ').lowercase()

private fun totaleDi(lista: List<Rapportino>): Double = Conti.totali(lista).totale

/**
 * Tutti i rapportini si rileggono al massimo ogni cinque minuti quando si apre
 * l'Ufficio: servono per i mesi prima e per le commesse, ma sono la lettura più
 * lenta del foglio. Per averli subito c'è Aggiorna.
 */
private var storicoLettoAlle = 0L

/**
 * La chiave di chi paga che va nella rotta invio/cliente/<chiave>/<mese>: il codice
 * del cliente sul foglio, o il nome ripulito se non ne ha ancora uno. È quella di
 * [Conti.chiPaga] senza il "c:" davanti, così la schermata Invio li ritrova.
 */
internal fun chiaveRotta(r: Rapportino, ana: Anagrafiche): String = Conti.chiPaga(r, ana).chiave.removePrefix("c:")

/**
 * La fine del mese sul telefono (docs/telefono-ufficio.md, prototipo SCHERMI.ufficio):
 * quanto c'è da fatturare e a chi, cosa manca da far firmare, quali commesse
 * guardare. È la pagina Fine mese di Wisper Ufficio, in colonna.
 */
@Composable
fun SchermataUfficio(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val storico by dati.storico.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val agg by dati.aggiornamento.collectAsStateWithLifecycle()
    var meseTesto by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    val mese = YearMonth.parse(meseTesto)
    var daConfermare by remember { mutableStateOf<Conti.PerChiPaga?>(null) }

    LaunchedEffect(Unit) {
        val adesso = System.currentTimeMillis()
        if (adesso - storicoLettoAlle > 5 * 60_000L) {
            storicoLettoAlle = adesso
            dati.aggiornaStorico()
        }
    }

    val delMese = storico.filter { YearMonth.from(it.rapportino.data) == mese }
    val daFatturare = delMese.filter { Conti.daFatturare(it.rapportino) }.conConti()
    val bozze = delMese.filter { it.rapportino.stato == Stato.BOZZA }.sortedByDescending { it.rapportino.data }
    val fatturati = delMese.filter { it.rapportino.stato == Stato.FATTURATO }.conConti()
    val gruppi = Conti.perChiPaga(daFatturare, ana)
    // I mesi prima con qualcosa ancora da fatturare: non devono sparire dalla vista.
    val prima = storico.filter { Conti.daFatturare(it.rapportino) && YearMonth.from(it.rapportino.data).isBefore(mese) }.conConti()
    val oggi = LocalDate.now().toString()
    val fattiOggi = fatturati.filter { it.fatturatoIl.startsWith(oggi) }.map { Conti.chiPaga(it, ana).nome }.distinct()
    val daGuardare = commesseDaGuardare(ana, storico)

    val sigla = dati.tecnico.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase().ifBlank { "?" }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(MarginePagina).padding(bottom = 90.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PulsanteTondo(Icone.indietro, "Mese prima", { meseTesto = mese.minusMonths(1).toString() })
                PulsanteTondo(Icone.freccia, "Mese dopo", {
                    val dopo = mese.plusMonths(1)
                    // Un mese non ancora cominciato non ha niente da fatturare: lo si dice invece di mostrarlo vuoto.
                    if (dopo.isAfter(YearMonth.now())) avvisi.mostra("${Conti.nomeMese(dopo).substringBefore(' ')} non è ancora cominciato")
                    else meseTesto = dopo.toString()
                })
                Spacer(Modifier.weight(1f))
                Box(
                    Modifier.size(44.dp).clip(CircleShape).background(c.superficie2).clickable { nav.vai("impostazioni") }
                        .semantics { contentDescription = "Impostazioni"; role = Role.Button },
                    contentAlignment = Alignment.Center,
                ) { Text(sigla, style = Testi.forte.copy(fontSize = Testi.secondarioGrande.fontSize), color = c.testo) }
            }

            TitoloPagina(Conti.nomeMese(mese), sopra = "Fine mese", etichettaSopra = true)

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Riquadro(
                    "Da fatturare", Testo.euroTondi(totaleDi(daFatturare)), Modifier.weight(1f),
                    nota = Testo.quanti(daFatturare.size, "rapportino", "rapportini"), acceso = daFatturare.isNotEmpty(),
                    onClick = { nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese, Quali.FATTURARE)) },
                )
                Riquadro(
                    "Da firmare", Testo.euroTondi(totaleDi(bozze.conConti())), Modifier.weight(1f),
                    nota = Testo.quanti(bozze.size, "rapportino", "rapportini"),
                    onClick = { nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese, Quali.FIRMARE)) },
                )
                Riquadro(
                    "Fatturato", Testo.euroTondi(totaleDi(fatturati)), Modifier.weight(1f),
                    nota = if (mese == YearMonth.now()) "questo mese" else "a ${meseMinuscolo(mese)}",
                )
            }

            // ---- Da fatturare: una scheda per chi paga
            TitoloSezione("Da fatturare")
            if (gruppi.isEmpty()) {
                Scheda(orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        SpuntaVerde(32)
                        Text("Niente da fatturare per ${meseMinuscolo(mese)}", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                    }
                }
            }
            gruppi.forEach { g ->
                val r0 = g.rapportini.first()
                val idCliente = ana.cliente(r0.idCliente, r0.cliente)?.id ?: r0.idCliente
                SchedaChiPaga(
                    g,
                    onVedi = {
                        nav.sezione(
                            Sezione.RAPPORTINI,
                            // Senza codice del cliente si filtra per nome: è l'unica cosa che quei rapportini hanno.
                            if (idCliente.isNotBlank()) FiltroRapportini(mese, Quali.FATTURARE, idCliente = idCliente)
                            else FiltroRapportini(mese, Quali.FATTURARE, testo = g.chi.nome),
                        )
                    },
                    onPrepara = { nav.vai("invio/cliente/${chiaveRotta(r0, ana)}/$mese") },
                    onSegnaFatturati = { daConfermare = g },
                )
            }
            if (prima.isNotEmpty()) {
                val mesiPrima = prima.map { YearMonth.from(it.data) }.distinct().sorted()
                val ultimo = mesiPrima.last()
                RigaMesiPrima(
                    titolo = "Restano da fatturare anche ${Testo.quanti(prima.size, "rapportino", "rapportini")} " +
                        if (mesiPrima.size == 1) "di ${meseMinuscolo(ultimo)}" else "dei mesi prima",
                    totale = Numeri.euro(totaleDi(prima)),
                    mese = Conti.nomeMese(ultimo).substringBefore(' '),
                    onClick = { nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(ultimo, Quali.FATTURARE)) },
                )
            }

            // ---- Da far firmare: le ultime bozze del mese
            if (bozze.isNotEmpty()) {
                TitoloSezione("Da far firmare", valore = Numeri.euro(totaleDi(bozze.conConti())))
                SchedaElenco {
                    val mostrate = bozze.take(6)
                    mostrate.forEachIndexed { i, v ->
                        RigaBozza(v) { nav.apriRapportino(v.rapportino.idLocale) }
                        if (i < mostrate.lastIndex) LineaElenco()
                    }
                }
                if (bozze.size > 6) {
                    PulsanteTesto(
                        "Vedi tutti i ${bozze.size}",
                        { nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese, Quali.FIRMARE)) },
                        Modifier.align(Alignment.CenterHorizontally),
                    )
                }
            }

            if (fattiOggi.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icone.spunta, null, tint = c.firmatoTesto, modifier = Modifier.size(16.dp))
                    Text("Fatturato oggi: ${fattiOggi.joinToString(", ")}", style = Testi.secondario, color = c.tenue)
                }
            }

            // ---- Commesse da guardare: vicine o oltre il budget di ore, o oltre la fine prevista
            if (daGuardare.isNotEmpty()) {
                TitoloSezione("Commesse da guardare")
                SchedaElenco {
                    daGuardare.forEachIndexed { i, (m, k) ->
                        RigaDaGuardare(m, k) { nav.vai("commessa/${m.id}") }
                        if (i < daGuardare.lastIndex) LineaElenco()
                    }
                }
            }

            // ---- Tutto l'ufficio
            TitoloSezione("Tutto l'ufficio")
            SchedaElenco {
                val aperte = ana.commesse.count { it.aperta }
                val sospese = ana.commesse.count { it.sospesa }
                RigaVoce(
                    "Commesse", icona = Icone.cartella,
                    sotto = if (ana.commesse.isEmpty()) "Nessuna commessa"
                    else listOfNotNull(
                        Testo.quanti(aperte, "aperta", "aperte"),
                        if (sospese > 0) Testo.quanti(sospese, "sospesa", "sospese") else null,
                    ).joinToString(" · "),
                    onClick = { nav.vai("commesse") },
                )
                LineaElenco()
                RigaVoce("Clienti", icona = Icone.persone, sotto = Testo.quanti(ana.clienti.size, "cliente", "clienti"), onClick = { nav.vai("clienti") })
                LineaElenco()
                RigaVoce("Impostazioni", icona = Icone.ingranaggio, sotto = "Lo studio, la firma, rimborso km e costi", onClick = { nav.vai("impostazioni") })
            }

            RigaFoglio(agg) {
                storicoLettoAlle = System.currentTimeMillis()
                dati.aggiornaStorico()
            }
        }

        daConfermare?.let { g ->
            val n = g.rapportini.size
            FoglioConferma(
                titolo = "Segnare ${Testo.quanti(n, "rapportino", "rapportini")} di ${g.chi.nome} come ${if (n == 1) "fatturato" else "fatturati"}?",
                testo = "${Numeri.euro(g.totale)}. Spariscono da Da fatturare.",
                azione = "Segna fatturati",
                onConferma = {
                    daConfermare = null
                    val cambio = dati.cambiaStato(g.rapportini.map { it.idLocale }, Stato.FATTURATO)
                    if (cambio.quanti > 0) avvisi.mostra(if (cambio.quanti == 1) "Fatturato" else "Fatturati", annulla = { dati.annullaCambioStato(cambio) })
                },
                onAnnulla = { daConfermare = null },
            )
        }
    }
}

/**
 * Le commesse aperte da guardare, come la Fine mese del computer: dall'85% delle
 * ore di budget, oltre il budget, o oltre la fine prevista.
 */
private fun commesseDaGuardare(ana: Anagrafiche, storico: List<Vista>): List<Pair<Commessa, Conti.Cruscotto>> {
    val aperte = ana.commesse.filter { it.aperta }
    if (aperte.isEmpty()) return emptyList()
    val tutti = storico.conConti()
    return aperte.map { it to Conti.cruscotto(it, tutti, ana) }
        .filter { (_, k) -> k.livelloOre == Conti.Livello.VICINA || k.livelloOre == Conti.Livello.OLTRE || k.scaduta }
}

/** La spunta verde nel cerchio: "fatto, a posto". */
@Composable
private fun SpuntaVerde(dimensione: Int) {
    val c = W.colori
    Box(Modifier.size(dimensione.dp).clip(CircleShape).background(c.firmatoFondo), contentAlignment = Alignment.Center) {
        Icon(Icone.spunta, null, tint = c.firmatoTesto, modifier = Modifier.size((dimensione * 0.6f).dp))
    }
}

/** Il pulsante dentro le schede: alto 52, poco margine di lato perché ne stanno due affiancati. */
@Composable
private fun PulsanteScheda(testo: String, giallo: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    val forma = RoundedCornerShape(16.dp)
    Box(
        modifier.height(52.dp).clip(forma)
            .background(if (giallo) c.giallo else c.scheda)
            .let { if (giallo) it else it.border(1.5.dp, c.bordoCampo, forma) }
            .clickable(onClick = onClick)
            .semantics { role = Role.Button }
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            testo, style = Testi.pulsanteSecondario.copy(fontWeight = if (giallo) FontWeight.ExtraBold else FontWeight.Bold),
            color = if (giallo) c.suGiallo else c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Una scheda per chi paga: quanto, quante ore, e la cosa da fare adesso. Prima
 * dell'invio è Prepara riepilogo; quando tutti i suoi rapportini del mese sono
 * inviati diventa Segna fatturati, come sul computer.
 */
@Composable
private fun SchedaChiPaga(g: Conti.PerChiPaga, onVedi: () -> Unit, onPrepara: () -> Unit, onSegnaFatturati: () -> Unit) {
    val c = W.colori
    val tuttiInviati = g.rapportini.all { it.stato == Stato.INVIATO }
    Scheda(orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp, spazio = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Iniziali(g.chi.nome, dimensione = 44.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(g.chi.nome, style = Testi.forteGrande, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    "${Testo.quanti(g.rapportini.size, "rapportino", "rapportini")} · ${Numeri.ore(Conti.totali(g.rapportini).ore)}",
                    style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Text(Numeri.euro(g.totale), style = Testi.titoloSezione.copy(fontSize = 20.sp, letterSpacing = (-0.3).sp), color = c.testo)
        }
        if (tuttiInviati) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SpuntaVerde(22)
                Text(
                    "Riepilogo inviato" + (if (g.chi.email.isNotBlank()) " a ${g.chi.email}" else ""),
                    style = Testi.secondario, color = c.firmatoTesto, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PulsanteScheda("Vedi rapportini", giallo = false, onClick = onVedi, modifier = Modifier.weight(1f))
            if (tuttiInviati) PulsanteScheda("Segna fatturati", giallo = true, onClick = onSegnaFatturati, modifier = Modifier.weight(1f))
            else PulsanteScheda("Prepara riepilogo", giallo = true, onClick = onPrepara, modifier = Modifier.weight(1f))
        }
    }
}

/** "Restano da fatturare anche…": i mesi prima non si dimenticano. */
@Composable
private fun RigaMesiPrima(titolo: String, totale: String, mese: String, onClick: () -> Unit) {
    val c = W.colori
    val forma = RoundedCornerShape(20.dp)
    Row(
        Modifier.fillMaxWidth().clip(forma).background(c.scheda).border(1.dp, c.bordoScheda, forma)
            .clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(titolo, style = Testi.forte, color = c.testo)
            Text(totale, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(mese, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            Icon(Icone.freccia, null, tint = c.gialloTesto, modifier = Modifier.size(16.dp))
        }
    }
}

/** Una bozza come nelle righe del mese: giorno, cliente, ore · commessa · lavoro, importo e stato. */
@Composable
private fun RigaBozza(v: Vista, onClick: () -> Unit) {
    val c = W.colori
    val r = v.rapportino
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(r.data.dayOfMonth.toString(), style = Testi.titoloScheda, color = c.testo)
            Text(r.data.dayOfWeek.getDisplayName(TextStyle.SHORT, IT), style = Testi.piccolo.copy(fontSize = Testi.etichetta.fontSize), color = c.tenue)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    r.cliente.ifBlank { "Senza cliente" }, style = Testi.forte, color = c.testo,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                )
                if (v.inCoda) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icone.nuvola, null, tint = c.tenue, modifier = Modifier.size(16.dp).semantics { contentDescription = "Ancora sul telefono" })
                }
            }
            Text(
                // Prima le ore: il lavoro può essere lungo e si taglia lui.
                listOf(Numeri.ore(r.oreTotali), r.idCommessa.ifBlank { r.commessa }, r.descrizione).filter { it.isNotBlank() }.joinToString(" · "),
                style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(v.conto?.let { Numeri.euro(it.totale) } ?: "", style = Testi.forte, color = c.testo)
            ParolaStato(r.stato)
        }
    }
}

/** Una commessa da guardare: codice, nome, la parola, la barra delle ore e il margine atteso. */
@Composable
private fun RigaDaGuardare(m: Commessa, k: Conti.Cruscotto, onClick: () -> Unit) {
    val c = W.colori
    val (parola, grave) = when {
        k.livelloOre == Conti.Livello.OLTRE -> "Oltre il budget" to true
        k.livelloOre == Conti.Livello.VICINA -> "Vicina al budget" to false
        else -> "Scaduta" to true
    }
    val budget = k.budgetOre
    Column(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CodiceCommessa(m.id)
            Text(m.descrizione.ifBlank { m.id }, style = Testi.forte, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            ParolaAvviso(parola, grave)
        }
        if (budget != null) BarraBudget(k.ore, budget, alta = false)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                when {
                    budget != null -> "${Numeri.ore(k.ore)} di ${Numeri.ore(budget)}"
                    m.finePrevista != null -> "Fine prevista il " + m.finePrevista.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
                    else -> Numeri.ore(k.ore)
                },
                style = Testi.piccolo, color = c.tenue,
            )
            // Senza il costo di un'ora il margine non si inventa.
            if (k.costo.lavoroNoto) Text("margine atteso ${Testo.euroTondi(k.margine)}", style = Testi.piccolo, color = c.tenue)
        }
    }
}

/** La riga calma in fondo: quando si è letto il foglio, e Aggiorna. Mai rossa: la rete che manca non è un errore. */
@Composable
private fun RigaFoglio(agg: Archivio.Aggiornamento, onAggiorna: () -> Unit) {
    val c = W.colori
    val stile = Testi.secondario
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp))
            .let { if (agg.inCorso) it else it.clickable(onClick = onAggiorna) }
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when {
            agg.inCorso -> Text("Leggo il foglio…", style = stile, color = c.tenue)
            agg.errore.isNotBlank() -> {
                Icon(Icone.avviso, null, tint = c.tenue, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    agg.errore, style = stile, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center, modifier = Modifier.weight(1f, fill = false),
                )
                Text(" · Riprova", style = stile.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            }
            else -> {
                if (agg.ultimo != null) {
                    Icon(Icone.spunta, null, tint = c.firmatoTesto, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                }
                Text(
                    agg.ultimo?.let { "Foglio letto alle " + it.format(DateTimeFormatter.ofPattern("H:mm")) } ?: "Foglio non ancora letto",
                    style = stile, color = c.tenue,
                )
                Text(" · Aggiorna", style = stile.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            }
        }
    }
}
