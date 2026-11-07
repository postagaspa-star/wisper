package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.util.UUID

/**
 * Il rapportino della giornata (docs/gestionale/rapportino-lavori.md, riunione del 06/11/2026): la data, chi l'ha
 * scritto, il numero (RAP/2026/0153, lo da' il server) e i suoi **lavori**. Ogni lavoro e' quello che fino alla 1.1 era
 * un rapportino intero ([Rapportino]: cliente, commessa, progetto, ore, km, tariffa congelata, stato...), e i lavori di
 * uno stesso rapportino possono essere di clienti diversi.
 *
 * Sul telefono va in coda tutto insieme (un'operazione per rapportino, coi suoi lavori): [idLocale] nasce qui e non
 * cambia mai, cosi' un invio ripetuto non crea un secondo rapportino; ogni lavoro ha il suo idLocale per lo stesso
 * motivo. Il server risponde col rapportino come l'ha scritto (salvaRapportino, forma nuova, §3).
 */
data class Giornata(
    val idLocale: String,
    /** Il numero del server (RAP/2026/0153); vuoto finche' il server non ha risposto. */
    val id: String = "",
    val data: LocalDate,
    val tecnico: String = "",
    val lavori: List<Rapportino> = emptyList(),
) {
    /** Come si riconosce sul telefono: il numero, o l'idLocale finche' il numero non c'e'. */
    val chiave: String get() = id.ifBlank { idLocale }

    /** I lavori con la data, il tecnico e il rapportino della giornata, e il loro posto (1, 2, 3...). */
    fun lavoriAllineati(): List<Rapportino> = lavori.mapIndexed { i, l ->
        l.copy(
            data = if (l.bloccato) l.data else data,
            tecnico = tecnico.ifBlank { l.tecnico },
            idLocaleGiornata = idLocale,
            idGiornata = id.ifBlank { l.idGiornata },
            posizione = i + 1,
        )
    }

    /** Quello che parte con salvaRapportino, forma nuova: {idLocale, id?, data, tecnico, lavori: [...]}. */
    fun perIlServer(): JSONObject = JSONObject()
        .put("idLocale", idLocale)
        .apply { if (id.isNotBlank()) put("id", id) }
        .put("data", data.format(Rapportino.ISO))
        .put("tecnico", tecnico)
        .put("lavori", JSONArray().apply { lavoriAllineati().forEach { put(it.perIlFoglio()) } })

    /** Tutto, per la coda sul telefono (i lavori interi, come le copie locali dei rapportini). */
    fun aJson(): JSONObject = JSONObject()
        .put("idLocale", idLocale)
        .put("id", id)
        .put("data", data.format(Rapportino.ISO))
        .put("tecnico", tecnico)
        .put("lavori", JSONArray().apply { lavoriAllineati().forEach { put(it.aJson()) } })

    companion object {
        fun nuovoIdLocale(): String = "G-" + UUID.randomUUID().toString().replace("-", "").take(16)

        fun nuova(tecnico: String, giorno: LocalDate = LocalDate.now()) = Giornata(nuovoIdLocale(), data = giorno, tecnico = tecnico)

        /**
         * Dalla coda (copia del telefono, [aJson]) o dalla risposta del server ([dalServer]: {id, idLocale, data,
         * tecnico, lavori, totale}, i lavori come li manda l'azione rapportini).
         */
        fun daJson(o: JSONObject, dalServer: Boolean = false): Giornata {
            val idLocale = o.testo("idLocale")
            val id = o.testo("id")
            val data = runCatching { LocalDate.parse(o.testo("data").take(10), Rapportino.ISO) }.getOrDefault(LocalDate.now())
            val lavori = o.optJSONArray("lavori").oggetti().map { Rapportino.daJson(it, dalFoglio = dalServer) }
            val chiave = idLocale.ifBlank { if (id.isNotBlank()) "R-$id" else nuovoIdLocale() }
            return Giornata(
                idLocale = chiave, id = id, data = data, tecnico = o.testo("tecnico"),
                lavori = lavori.mapIndexed { i, l ->
                    l.copy(
                        idLocaleGiornata = chiave,
                        idGiornata = l.idGiornata.ifBlank { id },
                        posizione = if (l.posizione > 0) l.posizione else i + 1,
                    )
                },
            )
        }
    }
}

/**
 * Le regole del rapportino coi lavori, uguali per tutte le schermate: come si raggruppano i lavori, il riassunto degli
 * stati, cosa si toglie, a chi va l'email.
 */
object Giornate {

    /**
     * Il rapportino di un lavoro: il numero del server ([Rapportino.idGiornata]), o quello nato sul telefono, o (le righe
     * di prima, e quelle ancora in coda dalla 1.1) il lavoro stesso, che e' un rapportino con un solo lavoro.
     */
    fun chiaveDi(r: Rapportino): String = r.idGiornata.ifBlank { r.idLocaleGiornata }.ifBlank { r.id.ifBlank { r.idLocale } }

    /** Un rapportino con le sue voci (lavori o viste), nell'ordine dei lavori. */
    data class Gruppo<T>(
        val chiave: String,
        /** Il numero del server, vuoto finche' non c'e'. */
        val id: String,
        /** L'idLocale del rapportino: quello nato qui, o "R-" + numero per quelli letti dal server. */
        val idLocale: String,
        val data: LocalDate,
        val tecnico: String,
        val voci: List<T>,
    )

    /**
     * I lavori raggruppati per rapportino, nell'ordine in cui arriva il primo lavoro di ognuno (l'elenco del server e
     * quello del telefono sono gia' dal piu' recente); dentro, per [Rapportino.posizione] (0 = in fondo, nell'ordine
     * d'arrivo).
     */
    fun <T> raggruppa(voci: List<T>, lavoro: (T) -> Rapportino): List<Gruppo<T>> {
        val gruppi = LinkedHashMap<String, MutableList<T>>()
        voci.forEach { v -> gruppi.getOrPut(chiaveDi(lavoro(v))) { mutableListOf() }.add(v) }
        return gruppi.map { (chiave, lista) ->
            val ordinati = lista.withIndex()
                .sortedWith(compareBy<IndexedValue<T>> { lavoro(it.value).posizione.let { p -> if (p <= 0) Int.MAX_VALUE else p } }.thenBy { it.index })
                .map { it.value }
            val primo = lavoro(ordinati.first())
            val id = ordinati.map(lavoro).firstNotNullOfOrNull { it.idGiornata.takeIf { g -> g.isNotBlank() } }
                ?: if (ordinati.map(lavoro).all { it.idLocaleGiornata.isBlank() }) primo.id else ""
            val idLocale = ordinati.map(lavoro).firstNotNullOfOrNull { it.idLocaleGiornata.takeIf { g -> g.isNotBlank() } }
                ?: if (id.isNotBlank()) "R-$id" else "R-" + primo.idLocale
            Gruppo(chiave, id, idLocale, ordinati.map(lavoro).filterNot { it.bloccato }.firstOrNull()?.data ?: primo.data, primo.tecnico, ordinati)
        }
    }

    /** Il rapportino di un gruppo, coi lavori com'e' adesso: da riaprire e cambiare. */
    fun giornataDi(g: Gruppo<Rapportino>): Giornata = Giornata(g.idLocale, g.id, g.data, g.tecnico, g.voci)

    /** Il cliente di un lavoro, per contarli: il codice, o il nome finche' il codice non c'e'. */
    fun chiaveCliente(r: Rapportino): String = r.idCliente.ifBlank { Anagrafiche.normalizza(r.cliente) }

    fun quantiClienti(lavori: List<Rapportino>): Int = lavori.map(::chiaveCliente).filter { it.isNotBlank() }.distinct().size

    /** "1 lavoro", "3 lavori". */
    fun lavori(n: Int): String = if (n == 1) "1 lavoro" else "$n lavori"

    /** "per 1 cliente", "per 2 clienti". */
    fun perClienti(n: Int): String = if (n == 1) "per 1 cliente" else "per $n clienti"

    /** "3 lavori · per 2 clienti". */
    fun lavoriEClienti(lavori: List<Rapportino>): String = lavori(lavori.size) + " · " + perClienti(quantiClienti(lavori))

    /** Lo stato di un lavoro come si legge: Da inviare (anche il FIRMATO di prima), Inviato, Fatturato. */
    fun parolaStato(s: Stato): String = when (s) {
        Stato.BOZZA, Stato.FIRMATO -> "Da inviare"
        Stato.INVIATO -> "Inviato"
        Stato.FATTURATO -> "Fatturato"
        Stato.ANNULLATO -> "Annullato"
    }

    /** "2 da inviare · 1 inviato"; "3 da inviare" se sono tutti uguali. */
    fun riassunto(lavori: List<Rapportino>): String {
        val vivi = lavori.filter { it.stato != Stato.ANNULLATO }
        val parti = listOf(
            vivi.count { it.daInviare } to ("da inviare" to "da inviare"),
            vivi.count { it.stato == Stato.INVIATO } to ("inviato" to "inviati"),
            vivi.count { it.stato == Stato.FATTURATO } to ("fatturato" to "fatturati"),
        ).filter { it.first > 0 }
        return parti.joinToString(" · ") { (n, parola) -> "$n " + if (n == 1) parola.first else parola.second }
    }

    /**
     * Un no del server per un lavoro solo: "Lavoro 2: Scegli il progetto" -> (2, "Scegli il progetto"). Null se il
     * messaggio non dice il lavoro (vale per tutto il rapportino).
     */
    fun erroreDelLavoro(messaggio: String): Pair<Int, String>? {
        val m = Regex("""^Lavoro (\d+): ?(.*)$""", RegexOption.DOT_MATCHES_ALL).find(messaggio.trim()) ?: return null
        val n = m.groupValues[1].toIntOrNull() ?: return null
        return n to m.groupValues[2].trim().replaceFirstChar { it.uppercase() }
    }

    /** Un lavoro si toglie dal rapportino solo se e' ancora da inviare (il server controlla anche le fatture). */
    fun puoTogliere(r: Rapportino): Boolean = r.daInviare

    /** Un rapportino si elimina solo se tutti i suoi lavori sono ancora da inviare. */
    fun puoEliminare(lavori: List<Rapportino>): Boolean = lavori.isNotEmpty() && lavori.all { it.daInviare }

    // ------------------------------------------------------------- a chi va l'email (§4)

    /**
     * Un destinatario dell'invio: chi paga i lavori ([Conti.chiPaga], la regola di sempre), la sua email e SOLO i suoi
     * lavori. [rapportini] i numeri dei rapportini da cui vengono, nell'ordine.
     */
    data class Destinatario(
        val chiave: String,
        val nome: String,
        val email: String,
        val lavori: List<Rapportino>,
        val rapportini: List<String>,
    ) {
        /** Tutti i suoi lavori sono di un solo rapportino: parte il PDF del rapportino, non il riepilogo. */
        val unSoloRapportino: Boolean get() = rapportini.size == 1
    }

    /**
     * I lavori scelti divisi per destinatario, nell'ordine in cui compaiono: un'email per destinatario, con solo i suoi
     * lavori. Nessun cliente riceve i lavori di un altro.
     */
    fun dividi(lavori: List<Rapportino>, ana: Anagrafiche): List<Destinatario> {
        val gruppi = LinkedHashMap<String, Pair<Conti.ChiPaga, MutableList<Rapportino>>>()
        lavori.forEach { r ->
            val chi = Conti.chiPaga(r, ana)
            gruppi.getOrPut(chi.chiave) { chi to mutableListOf() }.second.add(r)
        }
        return gruppi.values.map { (chi, suoi) ->
            val ordinati = suoi.sortedWith(compareBy<Rapportino> { it.data }.thenBy { chiaveDi(it) }.thenBy { it.posizione })
            Destinatario(
                chiave = chi.chiave,
                nome = chi.nome,
                email = Conti.emailComune(ordinati, ana),
                lavori = ordinati,
                rapportini = ordinati.map(::chiaveDi).distinct(),
            )
        }
    }

    /** Oggetto e messaggio dell'email di un destinatario (§4, server/prove/casi-invio.json). */
    data class Email(val oggetto: String, val messaggio: String)

    /**
     * Con i lavori di un solo rapportino vale il caso "un rapportino solo" (Rapportino RAP/2026/0153 del 05/11/2026);
     * con piu' rapportini giorno, settimana o mese come nei casi, piu' il nome di chi riceve.
     */
    fun email(d: Destinatario, firma: String): Email {
        val testo = if (d.unSoloRapportino) {
            val primo = d.lavori.first()
            PeriodoInvio.periodoInvio(listOf(primo.data), primo.idGiornata.ifBlank { primo.id })
        } else PeriodoInvio.periodoInvio(d.lavori.map { it.data })
        val oggetto = if (d.unSoloRapportino) testo.oggetto else testo.oggetto + " · " + d.nome
        return Email(oggetto, "Buongiorno,\nin allegato " + testo.frase + ".\n\nCordiali saluti\n" + firma)
    }

    /**
     * Il primo argomento del modello rapportino() di pc/ui/documenti.js per i lavori di un rapportino e di un
     * destinatario: i campi del primo lavoro (cosi' un modello di prima stampa almeno quello), il numero, la data e il
     * tecnico del rapportino, e `lavori` = le righe dei lavori (contratto del 06/11/2026).
     */
    fun perPdf(lavori: List<JSONObject>): JSONObject {
        require(lavori.isNotEmpty())
        val primo = lavori.first()
        val o = JSONObject(primo.toString())
        val numero = primo.optString("idGiornata").ifBlank { primo.optString("id") }
        o.put("id", numero)
        o.put("numero", numero)
        o.put("data", primo.optString("data"))
        o.put("tecnico", primo.optString("tecnico"))
        o.put("lavori", JSONArray().apply { lavori.forEach { put(it) } })
        return o
    }
}
