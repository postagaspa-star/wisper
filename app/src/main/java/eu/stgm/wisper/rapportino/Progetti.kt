package eu.stgm.wisper.rapportino

import org.json.JSONObject
import java.time.LocalDate
import java.util.UUID

/*
 * I progetti (03/11/2026, chiesti da Manuel; accordo docs/gestionale/progetti.md): cliente -> commessa -> progetto ->
 * rapportino. Ogni progetto ha un codice (a mano le prime volte, poi proposto da Wisper con la regola trovata nei primi:
 * [CodiciProgetto], la stessa di server/src/codici-progetto.js), a chi e' intestato (facoltativo ma sempre visibile) e
 * una descrizione. Il cliente del progetto e' quello della sua commessa.
 *
 * Sul telefono i progetti arrivano con le anagrafiche (servono senza rete, per il rapportino); quelli nati in un
 * rapportino senza rete viaggiano dentro il rapportino ([ProgettoNuovo]) finche' il server non li crea.
 */

/** Un progetto come lo manda il server (progetti.md §2). */
data class Progetto(
    /** L'id del server (un numero, come testo). Vuoto per un progetto nato sul telefono e non ancora arrivato. */
    val id: String,
    /** Quello del telefono che l'ha creato dentro un rapportino ("P-..."): il server non ne fa un secondo. */
    val idLocale: String = "",
    val idCommessa: String,
    val idCliente: String = "",
    val codice: String,
    val intestatoA: String = "",
    val descrizione: String = "",
    /** "APERTO" o "CHIUSO". */
    val stato: String = APERTO,
    val codiceAutomatico: Boolean = false,
    val creato: String = "",
    val modificato: String = "",
    val rapportini: Int = 0,
    val ore: Double = 0.0,
    val ultimoRapportino: String = "",
) {
    val aperto: Boolean get() = !stato.equals(CHIUSO, ignoreCase = true)

    /** Nato sul telefono, ancora in coda dentro un rapportino. */
    val inAttesa: Boolean get() = id.isBlank()

    /** "ED-003 · Quadro QE1": come si mostra nei rapportini e nelle scelte. */
    val etichetta: String get() = etichetta(codice, descrizione)

    /** "Aperto" o "Chiuso". */
    val parolaStato: String get() = if (aperto) "Aperto" else "Chiuso"

    /** Per la regola del codice. */
    fun perCodice(): CodiciProgetto.PerCodice = CodiciProgetto.PerCodice(id.toLongOrNull() ?: 0L, codice, idCommessa, idCliente, creato)

    fun aJson(): JSONObject = JSONObject()
        .put("id", PonteServer.idJson(id)).put("idLocale", idLocale).put("idCommessa", idCommessa).put("idCliente", idCliente)
        .put("codice", codice).put("intestatoA", intestatoA).put("descrizione", descrizione).put("stato", stato)
        .put("codiceAutomatico", codiceAutomatico).put("creato", creato).put("modificato", modificato)
        .put("rapportini", rapportini).put("ore", ore).put("ultimoRapportino", ultimoRapportino)

    companion object {
        const val APERTO = "APERTO"
        const val CHIUSO = "CHIUSO"

        fun etichetta(codice: String, descrizione: String): String =
            listOf(codice.trim(), descrizione.trim()).filter { it.isNotBlank() }.joinToString(" · ")

        fun daJson(o: JSONObject) = Progetto(
            id = o.testo("id"),
            idLocale = o.testo("idLocale"),
            idCommessa = o.testo("idCommessa"),
            idCliente = o.testo("idCliente"),
            codice = o.testo("codice"),
            intestatoA = o.testo("intestatoA"),
            descrizione = o.testo("descrizione"),
            stato = o.testo("stato").uppercase().ifBlank { APERTO },
            codiceAutomatico = o.vero("codiceAutomatico"),
            creato = o.testo("creato"),
            modificato = o.testo("modificato"),
            rapportini = o.numero("rapportini")?.toInt() ?: 0,
            ore = o.numero("ore") ?: 0.0,
            ultimoRapportino = o.testo("ultimoRapportino"),
        )
    }
}

/**
 * Un progetto nato sul telefono dentro un rapportino, anche senza rete (progetti.md §2): parte con il rapportino come
 * `progettoNuovo` e il server lo crea sotto la commessa del rapportino. Lo stesso [idLocale] rimandato (o usato da un
 * secondo rapportino) non fa un secondo progetto. [codiceProposto]: il codice l'ha proposto il telefono, quindi se nel
 * frattempo e' stato preso il server usa il successivo libero.
 */
data class ProgettoNuovo(
    val idLocale: String,
    val codice: String,
    val codiceProposto: Boolean,
    val intestatoA: String = "",
    val descrizione: String = "",
) {
    fun aJson(): JSONObject = JSONObject().put("idLocale", idLocale).put("codice", codice).put("codiceProposto", codiceProposto)
        .put("intestatoA", intestatoA).put("descrizione", descrizione)

    /** Come un progetto (in attesa) della commessa [idCommessa]: per le scelte e la regola del codice. */
    fun comeProgetto(idCommessa: String, idCliente: String, creato: String): Progetto =
        Progetto(id = "", idLocale = idLocale, idCommessa = idCommessa, idCliente = idCliente, codice = codice, intestatoA = intestatoA,
            descrizione = descrizione, creato = creato)

    companion object {
        fun nuovoIdLocale(): String = "P-" + UUID.randomUUID().toString().replace("-", "").take(16)

        fun daJson(o: JSONObject?): ProgettoNuovo? {
            if (o == null) return null
            val idLocale = o.testo("idLocale")
            if (idLocale.isBlank() && o.testo("codice").isBlank() && o.testo("descrizione").isBlank()) return null
            return ProgettoNuovo(idLocale, o.testo("codice"), o.vero("codiceProposto"), o.testo("intestatoA"), o.testo("descrizione"))
        }

        fun da(p: Progetto, codiceProposto: Boolean): ProgettoNuovo = ProgettoNuovo(p.idLocale, p.codice, codiceProposto, p.intestatoA, p.descrizione)
    }
}

/**
 * Il codice proposto per un progetto nuovo: la regola di server/src/codici-progetto.js portata riga per riga, con gli
 * stessi casi di prova (server/prove/casi-codici-progetto.json, CodiciProgettoTest). Telefono e server devono proporre
 * lo stesso codice anche senza rete.
 *
 * Wisper guarda gli ultimi tre codici (o gli ultimi due, se i tre non tornano) dei progetti della stessa commessa, poi
 * dello stesso cliente, poi di tutti. Le parti fisse devono essere uguali, un solo numero deve cambiare (il contatore,
 * con gli zeri davanti se li hanno); il codice della commessa dentro il codice e l'anno di nascita del progetto (4 o 2
 * cifre) si riconoscono. Il nuovo e' il piu' alto piu' uno; mai un codice gia' dato a un progetto dello stesso cliente.
 */
object CodiciProgetto {

    /** Quello che serve alla regola di un progetto: {id, codice, idCommessa, idCliente, creato}. */
    data class PerCodice(val id: Long, val codice: String, val idCommessa: String, val idCliente: String, val creato: String)

    /** Il codice proposto e dove si e' trovata la forma: "commessa", "cliente", "tutti" (vuoti se niente). */
    data class Proposta(val codice: String, val da: String)

    private const val COMMESSA = '\u0001'
    private const val CAMPIONI = 3

    private enum class Tipo { COMMESSA, NUMERO, TESTO }

    private data class Pezzo(val tipo: Tipo, val valore: String)

    /** Un posto della forma: testo, commessa, anno4, anno2, fisso, contatore. */
    private data class Posto(val tipo: String, val valore: String = "", val larghezza: Int = 0)

    private class Letto(val n: Long, val anno4: Long?, val anno2: Long?)

    private val PEZZI = Regex("\u0001|[0-9]+|[^0-9\u0001]+")

    private fun ordina(progetti: List<PerCodice>): List<PerCodice> =
        progetti.sortedWith { a, b ->
            val c = a.creato.compareTo(b.creato)
            if (c != 0) c else a.id.compareTo(b.id)
        }

    private fun annoDi(p: PerCodice, annoDiOggi: Int): Int {
        val n = p.creato.take(4).toIntOrNull() ?: 0
        return if (n in 1900..2999) n else annoDiOggi
    }

    /** Il codice della commessa conta solo se lungo almeno 3. */
    private fun pezzi(codice: String, codiceCommessa: String): List<Pezzo> {
        var s = codice.trim()
        val k = codiceCommessa.trim()
        if (k.length >= 3) {
            val i = s.uppercase().indexOf(k.uppercase())
            if (i >= 0) s = s.substring(0, i) + COMMESSA + s.substring(i + k.length)
        }
        return PEZZI.findAll(s).map { m ->
            val v = m.value
            Pezzo(if (v == COMMESSA.toString()) Tipo.COMMESSA else if (v[0].isAsciiDigit()) Tipo.NUMERO else Tipo.TESTO, v)
        }.toList()
    }

    private fun Char.isAsciiDigit(): Boolean = this in '0'..'9'

    /** La forma comune di 2 o 3 codici, o null. */
    private fun forma(campioni: List<PerCodice>, annoDiOggi: Int): List<Posto>? {
        if (campioni.size < 2) return null
        val scomposti = campioni.map { pezzi(it.codice, it.idCommessa) }
        val n = scomposti[0].size
        if (n == 0 || scomposti.any { it.size != n }) return null
        val posti = mutableListOf<Posto>()
        var contatori = 0
        for (i in 0 until n) {
            val tipo = scomposti[0][i].tipo
            if (scomposti.any { it[i].tipo != tipo }) return null
            val valori = scomposti.map { it[i].valore }
            when (tipo) {
                // Le parti fisse si confrontano senza badare alle maiuscole; nel codice nuovo va come nell'ultimo.
                Tipo.TESTO -> {
                    if (valori.any { it.uppercase() != valori[0].uppercase() }) return null
                    posti += Posto("testo", valori.last())
                }
                Tipo.COMMESSA -> posti += Posto("commessa")
                Tipo.NUMERO -> {
                    val anni = campioni.map { annoDi(it, annoDiOggi) }
                    when {
                        valori.withIndex().all { (j, v) -> v == anni[j].toString() } -> posti += Posto("anno4")
                        valori.withIndex().all { (j, v) -> v.length == 2 && v == (anni[j] % 100).toString().padStart(2, '0') } -> posti += Posto("anno2")
                        valori.all { it == valori[0] } -> posti += Posto("fisso", valori[0])
                        else -> {
                            contatori++
                            val stessa = valori.all { it.length == valori[0].length }
                            posti += Posto("contatore", larghezza = if (stessa && valori.any { it[0] == '0' }) valori[0].length else 0)
                        }
                    }
                }
            }
        }
        return if (contatori == 1) posti else null
    }

    /** Il contatore (e l'anno) di un codice che ha la forma, o null. */
    private fun leggi(posti: List<Posto>, codice: String, codiceCommessa: String): Letto? {
        val re = StringBuilder("^")
        val gruppi = mutableListOf<String>()
        for (p in posti) {
            when (p.tipo) {
                "testo", "fisso" -> re.append(Regex.escape(p.valore))
                "commessa" -> re.append(Regex.escape(codiceCommessa))
                else -> {
                    re.append(if (p.tipo == "anno4") "([0-9]{4})" else if (p.tipo == "anno2") "([0-9]{2})" else "([0-9]+)")
                    gruppi += p.tipo
                }
            }
        }
        // Escape vuoto (\Q\E) per un codice di commessa vuoto: va bene, come in JavaScript.
        val m = Regex(re.append("$").toString(), RegexOption.IGNORE_CASE).find(codice.trim()) ?: return null
        var n = 0L
        var anno4: Long? = null
        var anno2: Long? = null
        gruppi.forEachIndexed { i, tipo ->
            val v = m.groupValues[i + 1].toLongOrNull() ?: 0L
            when (tipo) {
                "contatore" -> n = v
                "anno4" -> if (anno4 == null) anno4 = v
                "anno2" -> if (anno2 == null) anno2 = v
            }
        }
        return Letto(n, anno4, anno2)
    }

    private fun scrivi(posti: List<Posto>, n: Long, codiceCommessa: String, anno: Int): String = posti.joinToString("") { p ->
        when (p.tipo) {
            "testo", "fisso" -> p.valore
            "commessa" -> codiceCommessa
            "anno4" -> anno.toString()
            "anno2" -> (anno % 100).toString().padStart(2, '0')
            else -> n.toString().padStart(p.larghezza, '0')
        }
    }

    /**
     * Il codice proposto per un progetto nuovo della commessa [idCommessa] (il suo id e' il suo codice) del cliente
     * [idCliente], con l'anno di oggi [anno]. [progetti]: tutti quelli che ci sono.
     */
    fun proponi(progetti: List<PerCodice>, idCommessa: String, idCliente: String, anno: Int): Proposta {
        val tutti = ordina(progetti.filter { it.codice.trim().isNotEmpty() })
        val gruppi = listOf(
            "commessa" to tutti.filter { it.idCommessa.uppercase() == idCommessa.uppercase() },
            "cliente" to if (idCliente.isNotEmpty()) tutti.filter { it.idCliente == idCliente } else emptyList(),
            "tutti" to tutti,
        )
        for ((da, elenco) in gruppi) {
            if (elenco.size < 2) continue
            // Gli ultimi tre; se non hanno una forma comune, gli ultimi due (la regola e' cambiata: bastano due codici nuovi).
            val posti = forma(elenco.takeLast(CAMPIONI), anno) ?: forma(elenco.takeLast(2), anno) ?: continue
            val conCommessa = posti.any { it.tipo == "commessa" }
            // Il codice della commessa dentro il codice, ma la commessa non ha ancora il suo: niente proposta, si scrive a mano.
            if (conCommessa && idCommessa.isEmpty()) continue
            val conAnno = posti.any { it.tipo == "anno4" || it.tipo == "anno2" }
            // Con la commessa nel codice si conta dentro la commessa nuova; senza, nel gruppo dove si e' trovata la forma.
            val daContare = if (conCommessa) gruppi[0].second else elenco
            val letti = daContare.mapNotNull { leggi(posti, it.codice, it.idCommessa) }
            var base = letti
            if (conAnno) {
                val diOggi = letti.filter { l -> if (l.anno4 != null) l.anno4 == anno.toLong() else l.anno2 == (anno % 100).toLong() }
                if (diOggi.isNotEmpty()) base = diOggi
            }
            var n = base.fold(0L) { max, l -> maxOf(max, l.n) } + 1
            // Mai un codice gia' dato a un progetto dello stesso cliente.
            val presi = tutti.filter { idCliente.isEmpty() || it.idCliente == idCliente }.map { it.codice.trim().uppercase() }.toSet()
            var codice = scrivi(posti, n, idCommessa, anno)
            var i = 0
            while (i < 1000 && codice.uppercase() in presi) { codice = scrivi(posti, ++n, idCommessa, anno); i++ }
            return Proposta(codice, da)
        }
        return Proposta("", "")
    }
}

/**
 * Le regole dei progetti sul telefono (progetti.md §3, §4): quali si vedono, quali si scelgono nel rapportino, il
 * codice proposto senza rete. I progetti "locali" sono quelli delle anagrafiche piu' quelli nati sul telefono e ancora
 * in coda dentro un rapportino (lo stesso progetto in due rapportini in coda e' uno solo: conta l'idLocale).
 */
object RegoleProgetti {

    /** La funzione Progetti c'e' ed e' accesa: un server di prima non manda il modulo nei permessi. */
    fun attivi(s: Sessione): Boolean =
        s.permessi.livelli.containsKey(Moduli.PROGETTI) && Moduli.PROGETTI !in s.interfaccia.funzioniSpente

    /** I progetti nati sul telefono e ancora in coda (dentro i rapportini non ancora arrivati), uno per idLocale. */
    fun inAttesa(ana: Anagrafiche, rapportini: List<Rapportino>): List<Progetto> {
        val noti = ana.progetti.map { it.idLocale }.filter { it.isNotBlank() }.toSet()
        return rapportini.mapNotNull { r ->
            val n = r.progettoNuovo ?: return@mapNotNull null
            if (r.idProgetto.isNotBlank() || n.idLocale.isBlank() || n.idLocale in noti || r.idCommessa.isBlank() && r.codiceProposto.isBlank()) return@mapNotNull null
            val commessa = r.idCommessa.ifBlank { r.codiceProposto }
            n.comeProgetto(commessa, r.idCliente.ifBlank { ana.commessa(commessa)?.idCliente.orEmpty() }, r.creato.ifBlank { r.data.toString() + "T23:59:59" })
        }.distinctBy { it.idLocale }
    }

    /** Tutti: anagrafiche + in attesa. */
    fun tutti(ana: Anagrafiche, rapportini: List<Rapportino>): List<Progetto> = ana.progetti + inAttesa(ana, rapportini)

    /** Quelli aperti della commessa, i piu' recenti prima: le scelte del rapportino. */
    fun apertiDi(ana: Anagrafiche, rapportini: List<Rapportino>, idCommessa: String): List<Progetto> =
        if (idCommessa.isBlank()) emptyList()
        else tutti(ana, rapportini).filter { it.aperto && it.idCommessa.equals(idCommessa, ignoreCase = true) }
            .sortedWith(compareByDescending<Progetto> { it.creato }.thenByDescending { it.id.toLongOrNull() ?: Long.MAX_VALUE })

    /** Il codice che il telefono propone per un progetto nuovo della commessa (vuoto se Wisper non ha ancora imparato la forma). */
    fun codiceProposto(ana: Anagrafiche, rapportini: List<Rapportino>, idCommessa: String, idCliente: String, oggi: LocalDate = LocalDate.now()): String =
        CodiciProgetto.proponi(tutti(ana, rapportini).map { it.perCodice() }, idCommessa, idCliente, oggi.year).codice

    /** Il codice e' gia' di un altro progetto dello stesso cliente (maiuscole e minuscole uguali)? */
    fun codiceGiaPreso(ana: Anagrafiche, rapportini: List<Rapportino>, codice: String, idCliente: String, tranneId: String = ""): Progetto? =
        tutti(ana, rapportini).firstOrNull { p ->
            p.codice.trim().equals(codice.trim(), ignoreCase = true) && p.idCliente == idCliente && (tranneId.isBlank() || p.id != tranneId)
        }
}

/**
 * Le azioni dei progetti (progetti.md §2), coi nomi esatti del server. Attenzione: in creaProgetto il codice va in
 * `codiceProgetto` (il server toglie `codice` da ogni richiesta, era il codice d'accesso del foglio); dentro `campi` di
 * aggiornaProgetto si chiama `codice`.
 */
class AzioniProgetti(private val t: TrasportoFase5) {

    private fun corpo(azione: String) = JSONObject().put("azione", azione)
    private fun conProgetto(r: JSONObject): Progetto =
        Progetto.daJson(r.optJSONObject("progetto") ?: throw PonteServer.Rifiutato("Il server non ha restituito il progetto"))

    suspend fun elenco(idCommessa: String = "", stato: String = "", cerca: String = ""): List<Progetto> =
        t.leggiAzione("progetti", buildList {
            if (idCommessa.isNotBlank()) add("idCommessa" to idCommessa)
            if (stato.isNotBlank()) add("stato" to stato)
            if (cerca.isNotBlank()) add("cerca" to cerca)
        }).optJSONArray("progetti").oggetti().map(Progetto::daJson)

    /** La scheda e i suoi rapportini. */
    suspend fun scheda(id: String): Pair<Progetto, List<Rapportino>> {
        val r = t.leggiAzione("progetto", listOf("id" to id))
        return conProgetto(r) to r.optJSONArray("rapportini").oggetti().map { Rapportino.daJson(it, dalFoglio = true) }
    }

    /** Il codice che propone il server (vuoto se non ha ancora una forma). */
    /**
     * Il codice che Wisper propone. Anche per una commessa che nasce col rapportino (non c'e' ancora): [idCommessa] e' il
     * codice che avra' (se si sa) e [idCliente] il cliente (se c'e'). Il server non rifiuta mai; vuoto = non sa ancora.
     */
    suspend fun codice(idCommessa: String, idCliente: String = ""): CodiciProgetto.Proposta {
        val r = t.leggiAzione("codiceProgetto", buildList {
            add("idCommessa" to idCommessa)
            if (idCliente.isNotBlank()) add("idCliente" to idCliente)
        })
        return CodiciProgetto.Proposta(r.testo("codice"), r.testo("da"))
    }

    suspend fun crea(idCommessa: String, codice: String, codiceProposto: Boolean, intestatoA: String, descrizione: String, idLocale: String = ""): Salvataggio<Progetto> {
        val c = corpo("creaProgetto").put("idCommessa", idCommessa).put("codiceProgetto", codice.trim())
            .put("intestatoA", intestatoA.trim()).put("descrizione", descrizione.trim())
        if (codiceProposto) c.put("codiceProposto", true)
        if (idLocale.isNotBlank()) c.put("idLocale", idLocale)
        val o = t.scriviAzione(c).optJSONObject("progetto") ?: throw PonteServer.Rifiutato("Il server non ha restituito il progetto")
        return Salvataggio(Progetto.daJson(o), o.vero("giaEsisteva"))
    }

    /** [campi]: codice, intestatoA, descrizione, stato, idCommessa (solo quelli da cambiare). */
    suspend fun aggiorna(id: String, campi: Map<String, String>): Progetto =
        conProgetto(t.scriviAzione(corpo("aggiornaProgetto").put("id", PonteServer.idJson(id)).put("campi", JSONObject(campi))))

    suspend fun togli(id: String) {
        t.scriviAzione(corpo("togliProgetto").put("id", PonteServer.idJson(id)))
    }
}

/**
 * Quello che le schermate dei progetti chiamano: le azioni come Result, in diretta (sono cose da ufficio: senza rete
 * "Serve la rete", come le altre). Dopo ogni scrittura si rileggono le anagrafiche, che portano i progetti per il
 * rapportino. I progetti nati nel rapportino senza rete non passano di qui: viaggiano col rapportino ([ProgettoNuovo]).
 */
class ServizioProgetti(
    trasporto: TrasportoFase5,
    private val esecutore: EsecutoreFase4,
    private val dopoScrittura: suspend () -> Unit = {},
) {
    val a = AzioniProgetti(trasporto)

    private suspend fun <T> leggi(lavoro: suspend AzioniProgetti.() -> T): Result<T> = esecutore.esegui { a.lavoro() }
    private suspend fun <T> scrivi(lavoro: suspend AzioniProgetti.() -> T): Result<T> =
        esecutore.esegui { a.lavoro() }.also { if (it.isSuccess) runCatching { dopoScrittura() } }

    suspend fun scheda(id: String) = leggi { scheda(id) }
    suspend fun codice(idCommessa: String, idCliente: String = "") = leggi { codice(idCommessa, idCliente) }

    suspend fun crea(idCommessa: String, codice: String, codiceProposto: Boolean, intestatoA: String, descrizione: String): Result<Salvataggio<Progetto>> {
        if (idCommessa.isBlank()) return Result.failure(PonteServer.Rifiutato("Scegli la commessa del progetto"))
        if (descrizione.isBlank()) return Result.failure(PonteServer.Rifiutato("Scrivi la descrizione del progetto"))
        return scrivi { crea(idCommessa, codice, codiceProposto, intestatoA, descrizione) }
    }

    suspend fun aggiorna(id: String, campi: Map<String, String>) = scrivi { aggiorna(id, campi) }
    suspend fun chiudi(id: String, chiuso: Boolean) = scrivi { aggiorna(id, mapOf("stato" to if (chiuso) Progetto.CHIUSO else Progetto.APERTO)) }
    suspend fun togli(id: String) = scrivi { togli(id) }
}
