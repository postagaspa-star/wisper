package eu.stgm.wisper.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.selection.toggleable
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
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.CambioStato
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Riepiloghi
import eu.stgm.wisper.Vista
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Stato
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private val IT = Locale.ITALY

/** I Dati di cui si è già chiesto lo storico (la visita guidata ha i suoi). */
private var storicoLettoDa: Dati? = null

/**
 * La sezione Rapportini (prototipo SCHERMI.rapportini, pagina #rapportini di
 * Wisper Ufficio): il mese nel titolo, la ricerca, Tutti | Da fatturare | Da
 * firmare, i rapportini per cliente col totale. "Seleziona" sceglie più
 * rapportini per un riepilogo o per segnarli insieme.
 *
 * Mese, segmento, ricerca e filtro stanno in [filtro]: tornando da un
 * rapportino si ritrova l'elenco com'era. La selezione no: è di un momento.
 */
@Composable
fun SchermataRapportini(dati: Dati, nav: Navigatore, filtro: FiltroRapportini, onFiltro: (FiltroRapportini) -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val storico by dati.storico.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val oggi = YearMonth.now()

    // Lo storico ha anche i mesi vecchi; le viste possono essere un attimo più fresche.
    val tutti = remember(storico, viste) {
        (storico.associateBy { it.rapportino.idLocale } + viste.associateBy { it.rapportino.idLocale }).values.toList()
    }
    val mesi = remember(tutti) {
        (tutti.filter { it.rapportino.stato != Stato.ANNULLATO }.map { YearMonth.from(it.rapportino.data) } + oggi)
            .distinct().sortedDescending()
    }
    val lista = remember(tutti, filtro) { filtraRapportini(tutti, filtro) }

    // Tutti i rapportini si leggono solo quando servono (più lento): tutti i mesi,
    // un mese oltre gli ultimi sei, la scelta del mese. Una volta per apertura
    // dell'app: i mesi vecchi cambiano di rado, e quelli recenti li rilegge aggiorna().
    fun chiediStorico() {
        if (storicoLettoDa !== dati) { storicoLettoDa = dati; dati.aggiornaStorico() }
    }
    // Una lettura andata male (niente rete) si riprova la prossima volta che serve.
    val aggiornamento by dati.aggiornamento.collectAsStateWithLifecycle()
    LaunchedEffect(aggiornamento.errore) { if (aggiornamento.errore.isNotBlank()) storicoLettoDa = null }
    LaunchedEffect(filtro.mese) {
        val m = filtro.mese
        if (m == null || m.isBefore(oggi.minusMonths(5))) chiediStorico()
    }

    // La selezione: null = niente caselle. Gli id sono idLocale.
    var scelti by rememberSaveable { mutableStateOf<List<String>?>(null) }
    var foglioMese by remember { mutableStateOf(false) }
    var foglioAzioni by remember { mutableStateOf(false) }
    var daSegnare by remember { mutableStateOf<Stato?>(null) }
    BackHandler(enabled = scelti != null) { scelti = null }

    val selezionati = scelti?.let { ids -> lista.filter { it.rapportino.idLocale in ids } }.orEmpty()
    val conFiltri = filtro.quali != Quali.TUTTI || filtro.testo.isNotBlank() || filtro.idCliente != null || filtro.idCommessa != null
    // Con un cliente o una commessa scelti il cliente è già detto: la riga dice il lavoro.
    val perLavoro = filtro.idCliente != null || filtro.idCommessa != null
    val piuMesi = lista.map { YearMonth.from(it.rapportino.data) }.distinct().size > 1

    fun meseDopo(m: YearMonth) {
        val dopo = m.plusMonths(1)
        // Il mese che verrà non ha ancora rapportini: si dice, invece di mostrare un elenco vuoto.
        if (dopo.isAfter(oggi) && mesi.none { !it.isBefore(dopo) }) {
            avvisi.mostra("${nomeMese(dopo).substringBefore(' ')} non è ancora cominciato")
        } else onFiltro(filtro.copy(mese = dopo))
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                filtro.mese?.let { m ->
                    PulsanteTondo(Icone.frecciaSinistra, "Mese prima", {
                        val prima = m.minusMonths(1)
                        if (prima.isBefore(oggi.minusMonths(5))) chiediStorico()
                        onFiltro(filtro.copy(mese = prima))
                    })
                    Spacer(Modifier.width(8.dp))
                    PulsanteTondo(Icone.freccia, "Mese dopo", { meseDopo(m) })
                }
                Spacer(Modifier.weight(1f))
                PulsanteTesto(if (scelti != null) "Fine" else "Seleziona", { scelti = if (scelti == null) emptyList() else null }, colore = c.testo)
            }

            Row(
                Modifier.clip(RoundedCornerShape(12.dp)).clickable { chiediStorico(); foglioMese = true }
                    .semantics(mergeDescendants = true) { role = Role.Button; contentDescription = "Scegli il mese" },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(filtro.mese?.let { nomeMese(it) } ?: "Tutti i mesi", style = Testi.titoloPagina, color = c.testo)
                Icon(Icone.giu, null, tint = c.testo, modifier = Modifier.size(22.dp))
            }

            CampoCerca(filtro.testo, { onFiltro(filtro.copy(testo = it)) }, "Cliente, commessa, lavoro, numero")
            Segmenti(
                listOf(Quali.TUTTI to "Tutti", Quali.FATTURARE to "Da fatturare", Quali.FIRMARE to "Da firmare"),
                filtro.quali, { onFiltro(filtro.copy(quali = it)) },
            )
            val chip = when {
                filtro.idCliente != null -> ana.cliente(filtro.idCliente)?.nome ?: filtro.idCliente
                filtro.idCommessa != null -> listOfNotNull(filtro.idCommessa, ana.commessa(filtro.idCommessa)?.descrizione?.takeIf { it.isNotBlank() }).joinToString(" · ")
                else -> null
            }
            if (chip != null) ChipFiltro(chip, { onFiltro(filtro.copy(idCliente = null, idCommessa = null)) })

            Text(
                "${Testo.quanti(lista.size, "rapportino", "rapportini")} · ${Numeri.ore(lista.sumOf { it.rapportino.oreTotali })} · ${Numeri.euro(lista.sumOf { it.conto?.totale ?: 0.0 })}",
                style = Testi.secondario, color = c.tenue,
            )

            if (lista.isEmpty()) {
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 28.dp, horizontal = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (conFiltri) {
                        Icon(Icone.cerca, null, tint = c.tenue, modifier = Modifier.size(28.dp))
                        Text("Nessun rapportino con questi filtri", style = Testi.secondarioGrande, color = c.tenue, textAlign = TextAlign.Center)
                        PulsanteBordo("Togli i filtri", {
                            onFiltro(filtro.copy(quali = Quali.TUTTI, idCliente = null, idCommessa = null, testo = ""))
                        }, Modifier.padding(top = 4.dp))
                    } else {
                        Text(
                            filtro.mese?.let { "Nessun rapportino a " + it.format(DateTimeFormatter.ofPattern("LLLL", IT)) } ?: "Ancora nessun rapportino",
                            style = Testi.secondarioGrande, color = c.tenue, textAlign = TextAlign.Center,
                        )
                    }
                }
            }

            // Per cliente (chi paga, come il computer), nell'ordine dell'ultimo rapportino.
            lista.groupBy { Riepiloghi.chiPaga(it.rapportino, ana) }.forEach { (chi, vv) ->
                TitoloSezione(chi, Numeri.euro(vv.sumOf { it.conto?.totale ?: 0.0 }))
                SchedaElenco {
                    vv.forEachIndexed { i, v ->
                        if (i > 0) LineaElenco()
                        val id = v.rapportino.idLocale
                        RigaElencoRapportini(
                            v, perLavoro = perLavoro, conMese = piuMesi,
                            scelto = scelti?.let { id in it },
                            onClick = {
                                val s = scelti
                                if (s == null) nav.apriRapportino(id) else scelti = if (id in s) s - id else s + id
                            },
                        )
                    }
                }
            }
        }

        if (scelti != null) {
            BarraScelti(selezionati, { foglioAzioni = true }, Modifier.align(Alignment.BottomCenter))
        } else {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo rapportino", { nav.nuovoRapportino() }, icona = Icone.piu)
            }
        }
    }

    // ---------------------------------------------------------- fogli dal basso
    if (foglioMese) {
        FoglioDalBasso({ foglioMese = false }) {
            Text("Quale mese", style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState())) {
                (mesi.map<YearMonth, YearMonth?> { it } + null).forEachIndexed { i, m ->
                    if (i > 0) LineaElenco()
                    VoceScelta(m?.let { nomeMese(it) } ?: "Tutti i mesi", filtro.mese == m) {
                        foglioMese = false
                        onFiltro(filtro.copy(mese = m))
                    }
                }
            }
        }
    }

    if (foglioAzioni) {
        FoglioDalBasso({ foglioAzioni = false }) {
            Text(Testo.quanti(selezionati.size, "rapportino scelto", "rapportini scelti"), style = Testi.titoloScheda, color = c.testo)
            Text(Numeri.euro(selezionati.sumOf { it.conto?.totale ?: 0.0 }), style = Testi.testo, color = c.testo2)
            VoceMenu(Icone.pdf, "Prepara riepilogo", {
                foglioAzioni = false
                val ids = selezionati.joinToString(",") { it.rapportino.idLocale }
                scelti = null
                nav.vai("invio/scelti/$ids")
            })
            VoceMenu(Icone.invia, "Segna inviati", {
                foglioAzioni = false
                if (daCambiare(selezionati, Stato.INVIATO).isEmpty()) avvisi.mostra("Niente da cambiare: sono già inviati o fatturati")
                else daSegnare = Stato.INVIATO
            })
            VoceMenu(Icone.spunta, "Segna fatturati", {
                foglioAzioni = false
                if (daCambiare(selezionati, Stato.FATTURATO).isEmpty()) avvisi.mostra("Niente da cambiare: sono già fatturati")
                else daSegnare = Stato.FATTURATO
            })
        }
    }

    daSegnare?.let { st ->
        val quali = daCambiare(selezionati, st)
        val n = quali.size
        val parola = parolaStato(st, n)
        FoglioConferma(
            titolo = "Segnare ${Testo.quanti(n, "rapportino", "rapportini")} come $parola?",
            testo = "${Numeri.euro(quali.sumOf { it.conto?.totale ?: 0.0 })} in tutto.",
            azione = "Segna $parola",
            onConferma = {
                daSegnare = null
                scelti = null
                val cambio = dati.cambiaStato(quali.map { it.rapportino.idLocale }, st)
                avvisaCambio(avvisi, dati, cambio)
            },
            onAnnulla = { daSegnare = null },
        )
    }
}

/**
 * I rapportini che passano davvero, con le regole del computer: "Segna inviati"
 * salta i fatturati (inviato viene prima), e chi è già in quello stato non conta.
 */
private fun daCambiare(vv: List<Vista>, st: Stato): List<Vista> = vv.filter {
    val prima = it.rapportino.stato
    prima != st && !(st == Stato.INVIATO && prima == Stato.FATTURATO)
}

/** "inviato" / "inviati", "fatturato" / "fatturati". */
private fun parolaStato(st: Stato, n: Int): String = when (st) {
    Stato.INVIATO -> if (n == 1) "inviato" else "inviati"
    Stato.FATTURATO -> if (n == 1) "fatturato" else "fatturati"
    else -> st.etichetta.lowercase()
}

/**
 * L'avviso dopo un cambio di stato, con Annulla che rimette com'era quello che
 * si può (Dati.annullaCambioStato). Se qualcosa non torna, lo si dice.
 */
internal fun avvisaCambio(avvisi: Avvisi, dati: Dati, cambio: CambioStato, testo: String? = null) {
    val n = cambio.quanti
    if (n == 0) { avvisi.mostra("Niente da cambiare"); return }
    val frase = testo ?: (Testo.quanti(n, "rapportino segnato", "rapportini segnati") + " " + parolaStato(cambio.stato, n))
    avvisi.mostra(frase, annulla = {
        val tornati = dati.annullaCambioStato(cambio)
        if (tornati < n) {
            // Dopo Annulla l'avviso si chiude: questo va mostrato subito dopo.
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                avvisi.mostra(
                    if (tornati == 0) "Non si torna indietro: sul foglio è già cambiato"
                    else "Tornati com'erano $tornati su $n: gli altri sul foglio sono già cambiati",
                )
            }
        }
    })
}

/**
 * Filtra come filtra() di pc/ui/conti.js: mese, cliente, commessa, segmento e
 * testo (numero, cliente, commessa, lavoro, luogo, ticket), i più recenti prima.
 */
internal fun filtraRapportini(viste: List<Vista>, f: FiltroRapportini): List<Vista> {
    val testo = Anagrafiche.normalizza(f.testo)
    return viste.filter { v ->
        val r = v.rapportino
        r.stato != Stato.ANNULLATO &&
            (f.mese == null || YearMonth.from(r.data) == f.mese) &&
            (f.idCliente == null || r.idCliente == f.idCliente) &&
            (f.idCommessa == null || r.idCommessa.equals(f.idCommessa, ignoreCase = true)) &&
            when (f.quali) {
                Quali.TUTTI -> true
                Quali.FATTURARE -> r.stato == Stato.FIRMATO || r.stato == Stato.INVIATO
                Quali.FIRMARE -> r.stato == Stato.BOZZA
            } &&
            (testo.isEmpty() || Anagrafiche.normalizza(
                listOf(r.id, r.cliente, r.commessa, r.idCommessa, r.codiceProposto, r.descrizione, r.luogo, r.ticket).joinToString(" "),
            ).contains(testo))
    }.sortedWith(compareByDescending<Vista> { it.rapportino.data }.thenByDescending { it.rapportino.id })
}

/**
 * Una riga: giorno, chi (o il lavoro, se il cliente è già nel filtro), ore e
 * commessa, importo e UNA parola di stato. Ancora sul telefono: la nuvola;
 * rifiutato dal foglio: il bordo rosso. In selezione, la casella a sinistra.
 */
@Composable
private fun RigaElencoRapportini(v: Vista, perLavoro: Boolean, conMese: Boolean, scelto: Boolean?, onClick: () -> Unit) {
    val c = W.colori
    val r = v.rapportino
    val codice = r.idCommessa.ifBlank { r.codiceProposto }.ifBlank { r.commessa }.takeIf { it.isNotBlank() }
    val titolo = if (perLavoro) r.descrizione.ifBlank { r.commessa }.ifBlank { r.cliente } else r.cliente.ifBlank { "Senza cliente" }
    // Prima le ore: il lavoro può essere lungo e si taglia lui.
    val sotto = listOfNotNull(Numeri.ore(r.oreTotali), codice, r.descrizione.takeIf { !perLavoro && it.isNotBlank() }).joinToString(" · ")
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp)
            .then(if (scelto == true) Modifier.background(c.gialloTenue) else Modifier)
            .then(
                if (scelto != null) Modifier.toggleable(value = scelto, role = Role.Checkbox, onValueChange = { onClick() })
                else Modifier.clickable(onClick = onClick),
            )
            .padding(vertical = 10.dp)
            .then(if (v.errore.isNotBlank()) Modifier.border(1.5.dp, c.rossoPieno, RoundedCornerShape(12.dp)) else Modifier),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (scelto != null) {
            Casella(scelto)
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.width(40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(r.data.dayOfMonth.toString(), style = Testi.titoloScheda, color = c.testo)
            Text(
                // Su più mesi il mese dice di più del giorno della settimana.
                if (conMese) r.data.month.getDisplayName(TextStyle.SHORT, IT) else r.data.dayOfWeek.getDisplayName(TextStyle.SHORT, IT),
                style = Testi.piccolo.copy(fontSize = Testi.etichetta.fontSize), color = c.tenue,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(titolo, style = Testi.forte, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (v.inCoda) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icone.nuvola, null, tint = c.tenue, modifier = Modifier.size(16.dp).semantics { contentDescription = "Ancora sul telefono" })
                }
            }
            Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(v.conto?.let { Numeri.euro(it.totale) } ?: "", style = Testi.forte, color = c.testo)
            ParolaStato(r.stato)
        }
    }
}

/** La casella della selezione: vuota col bordo, piena e scura con la spunta. */
@Composable
private fun Casella(scelta: Boolean) {
    val c = W.colori
    Box(
        Modifier.size(26.dp).clip(RoundedCornerShape(8.dp))
            .background(if (scelta) c.testo else c.scheda)
            .border(2.dp, if (scelta) c.testo else c.bordoCampo, RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center,
    ) { if (scelta) Icon(Icone.spunta, null, tint = c.scheda, modifier = Modifier.size(16.dp)) }
}

/** La barra scura sopra la barra delle sezioni: quanti scelti, quanto, e Cosa faccio. */
@Composable
private fun BarraScelti(scelti: List<Vista>, onAzioni: () -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    val n = scelti.size
    Row(
        modifier.padding(12.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.testo)
            .padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                if (n == 0) "Tocca i rapportini" else if (n == 1) "1 scelto" else "$n scelti",
                style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.scheda,
            )
            Text(
                if (n == 0) "per sceglierli" else Numeri.euro(scelti.sumOf { it.conto?.totale ?: 0.0 }),
                style = Testi.piccolo, color = c.scheda.copy(alpha = 0.75f),
            )
        }
        Box(
            Modifier.height(44.dp).clip(RoundedCornerShape(12.dp)).background(c.giallo.copy(alpha = if (n > 0) 1f else 0.5f))
                .clickable(enabled = n > 0, onClick = onAzioni).padding(horizontal = 14.dp),
            contentAlignment = Alignment.Center,
        ) { Text("Cosa faccio", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.suGiallo) }
    }
}

/** Una voce da scegliere in un foglio dal basso (il mese), con la spunta su quella attuale. */
@Composable
private fun VoceScelta(testo: String, scelta: Boolean, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick).padding(horizontal = 4.dp)
            .semantics { selected = scelta },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(testo, style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
        if (scelta) Icon(Icone.spunta, null, tint = c.testo, modifier = Modifier.size(20.dp))
    }
}
