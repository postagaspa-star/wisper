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
import eu.stgm.wisper.rapportino.Conti
import eu.stgm.wisper.rapportino.Giornate
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Stato
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private val IT = Locale.ITALY

/** I Dati di cui si è già chiesto lo storico (la visita guidata ha i suoi). */
private var storicoLettoDa: Dati? = null

/**
 * La sezione Rapportini (prototipo SCHERMI.rapportini, pagina #rapportini di
 * Wisper Ufficio): il mese nel titolo, la ricerca, Tutti | Da inviare | Da
 * fatturare. Dal 06/11/2026 (rapportino-lavori.md §5.4) un blocco per rapportino
 * (il giorno, il numero, "3 lavori · 2 clienti", il riassunto degli stati, il totale)
 * con i suoi lavori sotto. La casella c'è sempre, sul rapportino (sceglie tutti i suoi
 * lavori) e su ogni lavoro: toccare la riga apre, toccare la casella sceglie; con
 * almeno un lavoro scelto c'è la barra "N lavori scelti · N clienti".
 *
 * Mese, segmento, ricerca e filtro stanno in [filtro]: tornando da un
 * rapportino si ritrova l'elenco com'era. La selezione no: è di un momento.
 */
@Composable
fun SchermataRapportini(
    dati: Dati,
    nav: Navigatore,
    filtro: FiltroRapportini,
    onFiltro: (FiltroRapportini) -> Unit,
    /** Dalla fase 3: il titolo "Rapportini" e i segmenti (07/11/2026: senza Ore), sopra l'elenco. Il mese diventa più piccolo. */
    sopra: (@Composable () -> Unit)? = null,
) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val visita = LocalVisita.current
    val perm = LocalPermessi.current
    val costi = perm.costi
    // Chi vede i rapportini solo in lettura non ha i pulsanti per scrivere. Scegliere, mandare e segnare inviati sono di
    // Rapportini in Modifica (06/11/2026, come il computer); segnare fatturati resta della Fatturazione.
    val scrive = perm.modifica(eu.stgm.wisper.rapportino.Moduli.RAPPORTINI)
    val fattura = perm.modifica(eu.stgm.wisper.rapportino.Moduli.FATTURAZIONE) && costi
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

    // La selezione: gli idLocale scelti con la casella. Indietro con qualcosa di scelto toglie prima la scelta.
    var scelti by rememberSaveable { mutableStateOf<List<String>>(emptyList()) }
    var foglioMese by remember { mutableStateOf(false) }
    var foglioAzioni by remember { mutableStateOf(false) }
    var daSegnare by remember { mutableStateOf<Stato?>(null) }
    BackHandler(enabled = scelti.isNotEmpty()) { scelti = emptyList() }

    var chiediRiporta by remember { mutableStateOf(false) }
    val selezionati = lista.filter { it.rapportino.idLocale in scelti }
    val inviatiScelti = selezionati.filter { it.rapportino.stato == Stato.INVIATO }
    // 07/11/2026: si scelgono i rapportini interi, mai un lavoro da solo; la barra li conta.
    val rapportiniScelti = Giornate.raggruppa(selezionati) { it.rapportino }.size
    val conFiltri = filtro.quali != Quali.TUTTI || filtro.testo.isNotBlank() || filtro.idCliente != null || filtro.idCommessa != null || filtro.a != null
    // Con un cliente o una commessa scelti il cliente è già detto: la riga dice il lavoro.
    val perLavoro = filtro.idCliente != null || filtro.idCommessa != null
    // I lavori che passano il filtro, raggruppati per rapportino (il blocco mostra quelli e conta quelli).
    val gruppi = remember(lista) { Giornate.raggruppa(lista) { it.rapportino } }

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
            Testata(onIndietro = { if (scelti.isNotEmpty()) scelti = emptyList() else nav.indietro() })
            sopra?.invoke()

            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                // Il mese prende tutto lo spazio fino alle frecce (prima ne aveva metà: "Novembre / 2026" su due righe
                // e la freccia giù sparita).
                Box(Modifier.weight(1f)) {
                    Row(
                        Modifier.clip(RoundedCornerShape(12.dp)).clickable { chiediStorico(); foglioMese = true }
                            .semantics(mergeDescendants = true) { role = Role.Button; contentDescription = "Scegli il mese" },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            filtro.mese?.let { nomeMese(it) } ?: "Tutti i mesi", style = if (sopra != null) Testi.titoloScheda else Testi.titoloPagina,
                            color = c.testo, modifier = Modifier.weight(1f, fill = false),
                        )
                        Icon(Icone.giu, null, tint = c.testo, modifier = Modifier.size(22.dp))
                    }
                }
                Spacer(Modifier.width(8.dp))
                filtro.mese?.let { m ->
                    PulsanteTondo(Icone.frecciaSinistra, "Mese prima", {
                        val prima = m.minusMonths(1)
                        if (prima.isBefore(oggi.minusMonths(5))) chiediStorico()
                        onFiltro(filtro.copy(mese = prima))
                    })
                    Spacer(Modifier.width(8.dp))
                    PulsanteTondo(Icone.freccia, "Mese dopo", { meseDopo(m) })
                }
            }

            CampoCerca(filtro.testo, { onFiltro(filtro.copy(testo = it)) }, "Cliente, commessa, lavoro, numero")
            Segmenti(
                listOf(Quali.TUTTI to "Tutti", Quali.INVIARE to "Da inviare", Quali.FATTURARE to "Da fatturare"),
                filtro.quali, { onFiltro(filtro.copy(quali = it)) },
            )
            val chip = when {
                filtro.idCliente != null -> ana.cliente(filtro.idCliente)?.nome ?: filtro.idCliente
                filtro.idCommessa != null -> listOfNotNull(filtro.idCommessa, ana.commessa(filtro.idCommessa)?.descrizione?.takeIf { it.isNotBlank() }).joinToString(" · ")
                else -> null
            }
            if (chip != null) ChipFiltro(chip, { onFiltro(filtro.copy(idCliente = null, idCommessa = null)) })
            // Dalla Dashboard ("N lavori da inviare da più di una settimana"): quelli di prima di quel giorno.
            filtro.a?.let { ChipFiltro("Prima del " + it.format(DateTimeFormatter.ofPattern("d MMMM", IT)), { onFiltro(filtro.copy(a = null)) }) }

            Text(
                "${Testo.quanti(gruppi.size, "rapportino", "rapportini")} · ${Giornate.lavori(lista.size)} · ${Numeri.ore(lista.sumOf { it.rapportino.oreTotali })}" +
                    if (costi) " · ${Numeri.euro(lista.sumOf { it.conto?.totale ?: 0.0 })}" else "",
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
                            onFiltro(filtro.copy(quali = Quali.TUTTI, idCliente = null, idCommessa = null, testo = "", a = null))
                        }, Modifier.padding(top = 4.dp))
                    } else {
                        Text(
                            filtro.mese?.let { "Nessun rapportino a " + it.format(DateTimeFormatter.ofPattern("LLLL", IT)) } ?: "Ancora nessun rapportino",
                            style = Testi.secondarioGrande, color = c.tenue, textAlign = TextAlign.Center,
                        )
                    }
                }
            }

            // 11/11/2026 (Andrea): "una volta applicati i filtri e anche prima, si deve poter selezionare tutto". La casella
            // sceglie (o toglie) tutti i rapportini in vista, cioè quelli che passano i filtri; sta in fila con le caselle dei
            // rapportini.
            if (scrive && lista.isNotEmpty()) {
                val visti = lista.map { it.rapportino.idLocale }
                val quantiVisti = visti.count { it in scelti }
                val tuttiVisti = quantiVisti == visti.size
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp))
                        .toggleable(value = tuttiVisti, role = Role.Checkbox, onValueChange = {
                            scelti = if (tuttiVisti) scelti - visti.toSet() else (scelti + visti).distinct()
                        })
                        .padding(start = 7.dp, end = 12.dp).bersaglio("scegli-tutti"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { Casella(tuttiVisti, parziale = quantiVisti > 0 && !tuttiVisti) }
                    Spacer(Modifier.width(6.dp))
                    Text("Scegli tutti", style = Testi.pulsanteSecondario, color = c.testo)
                }
            }

            // Un blocco per rapportino, il più recente prima; dentro, i lavori nel loro ordine. Fra un rapportino e l'altro
            // più aria che fra le altre cose (07/11/2026: "non si capisce quando inizia un rapportino e quando finisce").
            Column(verticalArrangement = Arrangement.spacedBy(20.dp)) { gruppi.forEachIndexed { i, g ->
                val ids = g.voci.map { it.rapportino.idLocale }
                BloccoRapportino(
                    g, perLavoro = perLavoro, costi = costi, annoDiverso = g.data.year != oggi.year,
                    scelti = if (scrive) scelti else null,
                    onApri = { nav.apriRapportino(ids.first()) },
                    onApriLavoro = { id -> nav.apriRapportino(id, lavoro = true) },
                    onScegliTutti = {
                        // La casella del rapportino: se sono già tutti scelti li toglie, se no li sceglie tutti.
                        scelti = if (ids.all { it in scelti }) scelti - ids.toSet() else (scelti + ids).distinct()
                        if (i == 0) visita?.azione("casella-0")
                    },
                    casella = if (i == 0) "casella-0" else null,
                )
            } }
        }

        if (selezionati.isNotEmpty()) {
            BarraScelti(rapportiniScelti, selezionati.map { it.rapportino }, selezionati.sumOf { it.conto?.totale ?: 0.0 }, costi, { foglioAzioni = true }, Modifier.align(Alignment.BottomCenter))
        } else if (scrive) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo rapportino", { nav.nuovoRapportino() }, Modifier.bersaglio("azione-gialla"), icona = Icone.piu)
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
            Text(Testo.quanti(rapportiniScelti, "rapportino scelto", "rapportini scelti"), style = Testi.titoloScheda, color = c.testo)
            Text(
                Giornate.lavoriEClienti(selezionati.map { it.rapportino }).replaceFirstChar { it.uppercase() } +
                    if (costi) " · " + Numeri.euro(selezionati.sumOf { it.conto?.totale ?: 0.0 }) else "",
                style = Testi.testo, color = c.testo2,
            )
            // 06/11/2026: "Da inviare" apre Invio rapportini, diviso per destinatario (§4).
            VoceMenu(Icone.invia, "Da inviare", {
                foglioAzioni = false
                val ids = selezionati.joinToString(",") { android.net.Uri.encode(it.rapportino.idLocale) }
                scelti = emptyList()
                nav.vai("invio/scelti/$ids")
            })
            VoceMenu(Icone.invia, "Segna inviati", {
                foglioAzioni = false
                if (daCambiare(selezionati, Stato.INVIATO).isEmpty()) avvisi.mostra("Niente da cambiare: sono già inviati o fatturati")
                else daSegnare = Stato.INVIATO
            })
            if (fattura) VoceMenu(Icone.spunta, "Segna fatturati", {
                foglioAzioni = false
                if (daCambiare(selezionati, Stato.FATTURATO).isEmpty()) avvisi.mostra("Niente da cambiare: sono già fatturati")
                else daSegnare = Stato.FATTURATO
            })
            // 13/11/2026: gli inviati scelti tornano da inviare anche da qui, tutti insieme.
            if (inviatiScelti.isNotEmpty()) VoceMenu(Icone.indietroStato, "Riporta da inviare", { foglioAzioni = false; chiediRiporta = true })
        }
    }

    if (chiediRiporta) {
        val n = inviatiScelti.size
        FoglioConferma(
            titolo = if (n == 1) "Riportare da inviare il lavoro inviato?" else "Riportare da inviare $n lavori inviati?",
            testo = "Tornano da cambiare e da mandare di nuovo al cliente.",
            azione = "Riporta da inviare",
            onConferma = {
                chiediRiporta = false
                val ids = inviatiScelti.map { it.rapportino.idLocale }
                scelti = emptyList()
                avvisaCambio(avvisi, dati, dati.cambiaStato(ids, Stato.BOZZA), if (n == 1) "Riportato da inviare" else "$n lavori riportati da inviare")
            },
            onAnnulla = { chiediRiporta = false },
        )
    }

    daSegnare?.let { st ->
        val quali = daCambiare(selezionati, st)
        val n = quali.size
        val parola = parolaStato(st, n)
        FoglioConferma(
            titolo = "Segnare ${Testo.quanti(n, "lavoro", "lavori")} come $parola?",
            testo = if (costi) "${Numeri.euro(quali.sumOf { it.conto?.totale ?: 0.0 })} in tutto." else null,
            azione = "Segna $parola",
            onConferma = {
                daSegnare = null
                scelti = emptyList()
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
    val frase = testo ?: (Testo.quanti(n, "lavoro segnato", "lavori segnati") + " " + parolaStato(cambio.stato, n))
    avvisi.mostra(frase, annulla = {
        val tornati = dati.annullaCambioStato(cambio)
        if (tornati < n) {
            // Dopo Annulla l'avviso si chiude: questo va mostrato subito dopo.
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                avvisi.mostra(
                    if (tornati == 0) "Non si torna indietro: sul server è già cambiato"
                    else "Tornati com'erano $tornati su $n: gli altri sul server sono già cambiati",
                )
            }
        }
    })
}

/**
 * Filtra i lavori come filtra() di pc/ui/conti.js: mese, cliente, commessa, segmento, "prima del" (dalla Dashboard) e
 * testo (numero del rapportino o del lavoro, cliente, commessa, lavoro, luogo, ticket), i più recenti prima.
 * Da inviare = BOZZA e il FIRMATO di prima; Da fatturare = anche i Da inviare (rapportino-lavori.md §3).
 */
internal fun filtraRapportini(viste: List<Vista>, f: FiltroRapportini): List<Vista> {
    val testo = Anagrafiche.normalizza(f.testo)
    return viste.filter { v ->
        val r = v.rapportino
        r.stato != Stato.ANNULLATO &&
            (f.mese == null || YearMonth.from(r.data) == f.mese) &&
            (f.a == null || r.data.isBefore(f.a)) &&
            (f.idCliente == null || r.idCliente == f.idCliente) &&
            (f.idCommessa == null || r.idCommessa.equals(f.idCommessa, ignoreCase = true)) &&
            when (f.quali) {
                Quali.TUTTI -> true
                Quali.FATTURARE -> Conti.daFatturare(r)
                Quali.INVIARE -> r.daInviare
            } &&
            (testo.isEmpty() || Anagrafiche.normalizza(
                listOf(r.id, r.idGiornata, r.cliente, r.commessa, r.idCommessa, r.codiceProposto, r.descrizione, r.luogo, r.ticket,
                    r.progetto, r.progettoDescrizione, r.progettoIntestatoA, r.progettoNuovo?.codice.orEmpty(), r.progettoNuovo?.descrizione.orEmpty()).joinToString(" "),
            ).contains(testo))
    }.sortedWith(compareByDescending<Vista> { it.rapportino.data }.thenByDescending { it.rapportino.id })
}

/**
 * Un rapportino nell'elenco (rapportino-lavori.md §5.4): in testa il giorno, il numero, "3 lavori · 2 clienti", il
 * riassunto degli stati e il totale; sotto, una riga per lavoro. La testata apre il rapportino, una riga apre quel
 * lavoro. Con [scelti] (chi può mandarli) la casella c'è sempre: quella della testata sceglie tutti i suoi lavori.
 *
 * La scheda non ha margini ai lati: ogni riga ha i suoi, così il giallo di una riga scelta la riempie tutta fino al
 * bordo (la scheda taglia gli angoli tondi).
 */
@Composable
private fun BloccoRapportino(
    g: Giornate.Gruppo<Vista>,
    perLavoro: Boolean,
    costi: Boolean,
    annoDiverso: Boolean,
    scelti: List<String>?,
    onApri: () -> Unit,
    onApriLavoro: (String) -> Unit,
    onScegliTutti: () -> Unit,
    casella: String? = null,
) {
    val c = W.colori
    val lavori = g.voci.map { it.rapportino }
    val ids = lavori.map { it.idLocale }
    val quanti = scelti?.let { s -> ids.count { it in s } } ?: 0
    val tutti = ids.isNotEmpty() && quanti == ids.size
    val forma = RoundedCornerShape(22.dp)
    val giorno = g.data.format(DateTimeFormatter.ofPattern(if (annoDiverso) "EEEE d MMMM yyyy" else "EEEE d MMMM", IT))
        .replaceFirstChar { it.uppercase() }
    val numero = g.id.takeIf { it.isNotBlank() }?.let { "N° $it" }
    val clienti = Giornate.quantiClienti(lavori)
    Column(Modifier.fillMaxWidth().clip(forma).background(c.scheda).border(if (tutti) 2.dp else 1.dp, if (tutti) c.testo else c.bordoScheda, forma)) {
        // La testata e' la parte che si sceglie: su fondo piu' scuro, cosi' si vede dove comincia il rapportino.
        Row(
            Modifier.fillMaxWidth().heightIn(min = 64.dp)
                .background(if (tutti) c.gialloTenue else c.fondo)
                .clickable(onClick = onApri)
                .padding(start = if (scelti != null) 6.dp else 16.dp, end = 16.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (scelti != null) {
                Box(
                    Modifier.size(48.dp).clip(RoundedCornerShape(12.dp))
                        .toggleable(value = tutti, role = Role.Checkbox, onValueChange = { onScegliTutti() })
                        .let { if (casella != null) it.bersaglio(casella) else it }
                        .semantics { contentDescription = "Scegli il rapportino del ${g.data.dayOfMonth} " + g.data.month.getDisplayName(TextStyle.FULL, IT) },
                    contentAlignment = Alignment.Center,
                ) { Casella(tutti, parziale = quanti > 0 && !tutti) }
                Spacer(Modifier.width(6.dp))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(giorno, style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f, fill = false))
                    if (g.voci.any { it.inCoda }) {
                        Spacer(Modifier.width(6.dp))
                        Icon(Icone.nuvola, null, tint = c.tenue, modifier = Modifier.size(16.dp).semantics { contentDescription = "Ancora sul telefono" })
                    }
                }
                RigaAPezzi(listOfNotNull(numero, Giornate.lavori(lavori.size), if (clienti == 1) "1 cliente" else "$clienti clienti"), Testi.secondario, c.tenue)
                Text(Giornate.riassunto(lavori), style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.testo2)
            }
            if (costi) {
                Spacer(Modifier.width(8.dp))
                Text(Numeri.euro(g.voci.sumOf { it.conto?.totale ?: 0.0 }), style = Testi.forte, color = c.testo)
            }
        }
        g.voci.forEach { v ->
            LineaElenco()
            val id = v.rapportino.idLocale
            RigaLavoroElenco(v, perLavoro = perLavoro, costi = costi, scelto = tutti, onClick = { onApriLavoro(id) })
        }
    }
}

/**
 * Un lavoro nell'elenco: cliente (o il lavoro, se il cliente è già nel filtro), ore e commessa o progetto, la
 * descrizione su due righe, importo e UNA parola di stato. Ancora sul telefono: la nuvola; rifiutato dal server: la
 * frase in rosso. Con [scelto] la casella a sinistra, sempre: la riga apre il lavoro, la casella lo sceglie.
 */
@Composable
private fun RigaLavoroElenco(
    v: Vista, perLavoro: Boolean, scelto: Boolean, costi: Boolean = true,
    onClick: () -> Unit,
) {
    val c = W.colori
    val r = v.rapportino
    // Col progetto (progetti.md §4.7) "ED-003 · Quadro QE1" al posto del codice della commessa, che il progetto gia' dice.
    val codice = r.etichettaProgetto.ifBlank { r.idCommessa.ifBlank { r.codiceProposto }.ifBlank { r.commessa } }.takeIf { it.isNotBlank() }
    val titolo = if (perLavoro) r.descrizione.ifBlank { r.commessa }.ifBlank { r.cliente } else r.cliente.ifBlank { "Senza cliente" }
    val sotto = listOfNotNull(Numeri.ore(r.oreTotali), codice).joinToString(" · ")
    val descrizione = r.descrizione.takeIf { !perLavoro && it.isNotBlank() }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp)
            .then(if (scelto) Modifier.background(c.scelta) else Modifier)
            .clickable(onClick = onClick)
            .padding(start = 20.dp, end = 16.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(titolo, style = Testi.forte, color = c.testo)
            Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue)
            // La descrizione va a capo quanto serve (07/11/2026: niente puntini sulle righe).
            if (descrizione != null) Text(descrizione, style = Testi.secondario, color = c.testo2)
            // Fase 3 (§14.7): "Da approvare" o "Respinto: motivo", dove serve.
            r.pillolaApprovazione?.let { p ->
                val respinto = r.statoApprovazione == "respinto"
                PillolaParola(p, if (respinto) c.rossoTesto else c.gialloTesto, if (respinto) c.rossoTenue else c.gialloTenue, Modifier.padding(top = 4.dp), righe = 2)
            }
            if (v.errore.isNotBlank()) Text(v.errore, style = Testi.secondario, color = c.rossoTesto, modifier = Modifier.padding(top = 2.dp))
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (costi) Text(v.conto?.let { Numeri.euro(it.totale) } ?: "", style = Testi.secondarioGrande, color = c.testo2)
            ParolaStato(r.stato)
            if (v.inCoda) Icon(Icone.nuvola, null, tint = c.tenue, modifier = Modifier.size(16.dp).semantics { contentDescription = "Ancora sul telefono" })
        }
    }
}

/** La casella della selezione: vuota col bordo, piena e scura con la spunta; [parziale] col trattino (una parte scelta). */
@Composable
private fun Casella(scelta: Boolean, parziale: Boolean = false) {
    val c = W.colori
    val piena = scelta || parziale
    Box(
        Modifier.size(26.dp).clip(RoundedCornerShape(8.dp))
            .background(if (piena) c.testo else c.foglio)
            .border(2.dp, if (piena) c.testo else c.bordoCampo, RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center,
    ) {
        when {
            scelta -> Icon(Icone.spunta, null, tint = c.foglio, modifier = Modifier.size(16.dp))
            parziale -> Box(Modifier.width(12.dp).height(2.5.dp).clip(RoundedCornerShape(2.dp)).background(c.scheda))
        }
    }
}

/** La barra scura in fondo, con almeno un lavoro scelto: "N lavori scelti · N clienti", quanto (con i costi), e Cosa faccio. */
@Composable
private fun BarraScelti(rapportini: Int, scelti: List<eu.stgm.wisper.rapportino.Rapportino>, totale: Double, costi: Boolean, onAzioni: () -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    val n = scelti.size
    val clienti = Giornate.quantiClienti(scelti)
    Row(
        modifier.padding(12.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.testo)
            .padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                if (rapportini == 1) "1 rapportino scelto" else "$rapportini rapportini scelti",
                style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.scheda,
            )
            Text(
                listOfNotNull(Giornate.lavori(n), if (clienti == 1) "1 cliente" else "$clienti clienti", if (costi) Numeri.euro(totale) else null).joinToString(" · "),
                style = Testi.piccolo, color = c.scheda.copy(alpha = 0.75f),
            )
        }
        Box(
            Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).background(c.giallo)
                .clickable(onClick = onAzioni).bersaglio("cosa-faccio").padding(horizontal = 14.dp, vertical = 8.dp),
            contentAlignment = Alignment.Center,
        ) { Text("Cosa faccio", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.suGiallo, softWrap = false) }
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
