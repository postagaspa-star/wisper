package eu.stgm.wisper.rapportino

/**
 * Il rapportino mentre si compone.
 *
 * Tutti i campi sono opzionali di proposito: si riempie un pezzo alla volta
 * mentre il tecnico parla, e a meta' discorso e' normale che meta' sia vuoto.
 * E' anche il motivo per cui e' immutabile — ogni frase produce una copia
 * nuova, e la schermata ridisegna solo i campi cambiati.
 */
data class Rapportino(
    val cliente: String? = null,
    val commessa: String? = null,
    val descrizione: String? = null,
    val ore: Double? = null,
    val km: Double? = null,
    val spese: Double? = null,
    /**
     * Come resta la commessa dopo questa giornata: aperta o chiusa.
     *
     * Ha preso il posto del vecchio "esito" (positivo/negativo), che guardava
     * indietro e non serviva a nessuno. Questo guarda avanti: dice all'ufficio
     * se il lavoro va rimesso in calendario.
     */
    val statoCommessa: StatoCommessa? = null,
) {

    /**
     * I cinque campi senza i quali il rapportino non ha senso: a chi, su cosa,
     * che lavoro, per quanto tempo, per quanta strada. Spese ed esito sono un
     * di piu': utili, ma un rapportino senza di loro sta comunque in piedi.
     *
     * Attenzione: km VALE anche a zero. "Zero chilometri" e' una risposta;
     * non averne parlato e' un buco. Per questo il campo e' nullable e non
     * azzerato di default.
     */
    val completo: Boolean
        get() = !cliente.isNullOrBlank() && !commessa.isNullOrBlank() &&
            !descrizione.isNullOrBlank() && ore != null && km != null &&
            statoCommessa != null

    /** Cosa manca ancora, in italiano, per farlo chiedere all'AI. */
    val mancanti: List<String>
        get() = buildList {
            if (cliente.isNullOrBlank()) add("cliente")
            if (commessa.isNullOrBlank()) add("commessa")
            if (descrizione.isNullOrBlank()) add("descrizione")
            if (ore == null) add("ore")
            if (km == null) add("chilometri")
            if (statoCommessa == null) add("se il lavoro è finito")
        }

    /**
     * Cosa manca, detto come lo direbbe una persona invece che col nome del
     * campo. Un posto solo, perche' queste parole servono in due punti — il
     * riepilogo finale e le domande a meta' strada — e se divergessero Wisper
     * chiamerebbe la stessa cosa in due modi nella stessa conversazione.
     *
     * Le spese stanno qui ma non fra i campi obbligatori: chiederle e' giusto,
     * pretenderle no.
     */
    val mancanzeParlate: List<String>
        get() = buildList {
            if (descrizione.isNullOrBlank()) add("che lavoro hai fatto")
            if (ore == null) add("quanto è durato")
            if (km == null) add("i chilometri")
            if (spese == null) add("le spese")
            if (statoCommessa == null) add("se il lavoro è finito")
        }

    /**
     * "Mi devi ancora dire i chilometri e se il lavoro è finito", oppure null.
     *
     * Il verbo e' scelto perche' regge tutti i pezzi senza sgrammaticature:
     * "mi manca" andrebbe accordato al plurale, "mi devi dire" no.
     */
    fun domandaSuCosaManca(): String? =
        mancanzeParlate.takeIf { it.isNotEmpty() }
            ?.let { "Mi devi ancora dire ${unisci(it)}" }

    /**
     * Applica solo i campi valorizzati: un campo null NON cancella quello che
     * c'era. Serve perche' l'AI manda solo cio' che ha appena capito, non
     * tutto il rapportino ogni volta.
     */
    fun aggiorna(patch: Rapportino): Rapportino = Rapportino(
        cliente = patch.cliente?.takeIf { it.isNotBlank() } ?: cliente,
        commessa = patch.commessa?.takeIf { it.isNotBlank() } ?: commessa,
        descrizione = patch.descrizione?.takeIf { it.isNotBlank() } ?: descrizione,
        ore = patch.ore ?: ore,
        km = patch.km ?: km,
        spese = patch.spese ?: spese,
        statoCommessa = patch.statoCommessa ?: statoCommessa,
    )

    /**
     * Il riepilogo che Wisper rilegge prima di salvare, costruito DAI CAMPI
     * e non chiesto al modello.
     *
     * Motivo, trovato sul telefono il 07/08: il modello aveva annunciato
     * "quaranta chilometri e dodici euro" avendone scritto solo uno dei due.
     * Su un rapportino e' il difetto peggiore che ci sia — il tecnico sente
     * confermare un dato, ci crede, e quel dato non esiste. Quello che si
     * sente e' quello che si salva, perche' e' la stessa fonte.
     *
     * @param commessaLeggibile la descrizione, non il codice: "M001" a voce
     *        non vuol dire niente per chi lavora.
     */
    fun riletturaAdAltaVoce(commessaLeggibile: String? = null): String {
        val frasi = mutableListOf<String>()

        // 1. Chi e su cosa.
        frasi += buildString {
            append("Oggi hai lavorato per ${cliente ?: "un cliente che non mi hai detto"}")
            append(
                commessaLeggibile?.takeIf { it.isNotBlank() }
                    ?.let { ", sulla commessa $it" }
                    ?: ", ma non mi hai detto su quale commessa"
            )
        }

        // 2. Quello che SO. "Non hai speso nulla" sta qui, non fra le mancanze:
        //    zero e' un dato che il tecnico ha detto, non un buco. Il buco e'
        //    non averne parlato affatto — ed e' per questo che i campi sono
        //    nullable e non azzerati di default.
        val presenti = mutableListOf<String>()
        descrizione?.takeIf { it.isNotBlank() }?.let {
            presenti += "hai fatto ${it.replaceFirstChar { c -> c.lowercaseChar() }}"
        }
        ore?.let { presenti += "il lavoro è durato ${oreParlate()}" }
        km?.let {
            presenti += if (it > 0) "hai percorso ${numeroParlato(it)} chilometri"
            else "non hai fatto chilometri"
        }
        spese?.let {
            presenti += if (it > 0) "hai speso ${euroParlati(it)}"
            else "non hai speso nulla"
        }
        if (presenti.isNotEmpty()) frasi += unisci(presenti)

        statoCommessa?.let {
            frasi += if (it == StatoCommessa.CHIUSA) "Il lavoro è concluso"
            else "Il lavoro resta aperto"
        }

        // 3. Le mancanze TUTTE INSIEME, in una frase sola e con UN solo "però".
        //    Sparpagliarle fra le altre le fa sembrare piu' gravi di quello che
        //    sono e riempie la frase di avversative; raccolte qui si sente in
        //    un colpo cosa manca e si risponde una volta.
        val mancano = mancanzeParlate
        if (mancano.isNotEmpty()) frasi += "Non mi hai però detto ${unisci(mancano)}"

        // Ogni frase comincia con la maiuscola: i pezzi vengono costruiti in
        // minuscolo per potersi incastrare fra loro, ma dopo un punto stona —
        // e la voce sintetica ci mette anche l'intonazione sbagliata.
        return frasi.joinToString(". ") { it.replaceFirstChar { c -> c.uppercaseChar() } } +
            ". È tutto corretto?"
    }

    /** "a, b e c" — con la virgola fra i primi e la "e" davanti all'ultimo. */
    private fun unisci(pezzi: List<String>): String = when (pezzi.size) {
        0 -> ""
        1 -> pezzi.first()
        else -> pezzi.dropLast(1).joinToString(", ") + " e " + pezzi.last()
    }

    /**
     * "Tre ore e mezza", non "3 e mezzo ore". Il mezzo in italiano va DOPO
     * l'unita', e questa e' la frase su cui il tecnico dice "confermo": se
     * suona sgrammaticata, si perde a decifrarla invece di ascoltare i numeri.
     */
    private fun oreParlate(): String {
        val o = ore ?: return "Ore non indicate"
        return when {
            o == 0.5 -> "Mezz'ora"
            o == 1.0 -> "Un'ora"
            o == 1.5 -> "Un'ora e mezza"
            o % 1.0 == 0.5 -> "${o.toInt()} ore e mezza"
            o % 1.0 == 0.0 -> "${o.toInt()} ore"
            else -> "${o.toString().replace('.', ',')} ore"
        }
    }

    /** 42.5 -> "quarantadue euro e cinquanta"; 12.0 -> "12 euro". */
    private fun euroParlati(n: Double): String {
        if (n % 1.0 == 0.0) return "${n.toInt()} euro"
        val centesimi = Math.round((n % 1.0) * 100).toInt()
        return "${n.toInt()} euro e ${if (centesimi < 10) "zero$centesimi" else "$centesimi"}"
    }

    /** Mai col punto decimale: la voce sintetica leggerebbe "tre punto cinque". */
    private fun numeroParlato(n: Double): String = when {
        n % 1.0 == 0.0 -> n.toInt().toString()
        n % 1.0 == 0.5 -> "${n.toInt()} e mezzo"
        else -> n.toString().replace('.', ',')
    }
}

/**
 * Come resta la commessa dopo la giornata. Nel foglio finisce nella colonna
 * "STATO COMMESSA"; nel parlato il tecnico la chiama "lavoro".
 */
enum class StatoCommessa(val parlato: String) {
    APERTA("aperta"),
    CHIUSA("chiusa");

    companion object {
        fun da(testo: String?): StatoCommessa? = when (testo?.lowercase()?.trim()) {
            "chiusa", "chiuso", "finita", "finito", "concluso", "conclusa", "completato" -> CHIUSA
            "aperta", "aperto", "in corso", "da finire", "da riprendere" -> APERTA
            else -> null
        }
    }
}

/** Un cliente come sta nel foglio. */
data class Cliente(
    val id: String,
    val nome: String,
    val alias: List<String> = emptyList(),
)

/** Una commessa come sta nel foglio. */
data class Commessa(
    val id: String,
    val idCliente: String,
    val descrizione: String,
    val stato: String,
    /**
     * Dove si trova il cantiere. Lo mette l'ufficio nel foglio, il tecnico non
     * lo detta mai.
     *
     * Non serve a navigarci — il rapportino si compila a lavoro finito, la
     * strada l'ha gia' fatta. Serve a DISTINGUERE: quando un cliente ha due
     * lavori aperti, un tecnico non dice "la M004", dice "quello di via Roma
     * a Thiene". E' l'unico modo in cui quei due lavori sono diversi per lui.
     */
    val indirizzo: String = "",
) {
    val aperta: Boolean get() = stato.equals("APERTA", ignoreCase = true)

    /**
     * L'indirizzo come lo si dice a voce: via e citta', senza numero civico
     * ne' CAP ne' provincia. "Via Roma 47, 36016 Thiene VI" letto da una voce
     * sintetica e' rumore; "via Roma a Thiene" e' un'informazione.
     */
    val indirizzoParlato: String
        get() {
            if (indirizzo.isBlank()) return ""
            val pezzi = indirizzo.split(",").map { it.trim() }.filter { it.isNotBlank() }

            // Il numero finale si toglie SOLO nel formato canonico "Via X 47,
            // 36016 Citta", riconoscibile dalla virgola. Senza virgola non si
            // sa cosa sia quel numero: in "Zona industriale lotto 7" e' il
            // lotto, e toglierlo rovina l'indirizzo invece di ripulirlo.
            val canonico = pezzi.size > 1
            val via = pezzi.firstOrNull().orEmpty()
                .let { if (canonico) it.replace(Regex("\\s*\\d+\\s*$"), "") else it }
                .trim()
            val citta = pezzi.getOrNull(1).orEmpty()
                .replace(Regex("^\\d{5}\\s*"), "")      // via il CAP
                .replace(Regex("\\s*\\([^)]*\\)$"), "") // via la provincia fra parentesi
                .replace(Regex("\\s+[A-Z]{2}$"), "")    // via la sigla provincia
                .trim()
            return when {
                via.isNotBlank() && citta.isNotBlank() -> "$via a $citta"
                via.isNotBlank() -> via
                else -> indirizzo
            }
        }
}

/** Quello che il foglio sa: serve all'AI per riconoscere i nomi veri. */
data class Anagrafiche(
    val clienti: List<Cliente> = emptyList(),
    val commesse: List<Commessa> = emptyList(),
) {
    fun commesseDi(idCliente: String): List<Commessa> =
        commesse.filter { it.idCliente == idCliente && it.aperta }

    /**
     * Da "M001" a "FV Fara Vicentino".
     *
     * Nel foglio la commessa e' il codice, ma il tecnico i codici non li ha in
     * mente: per lui e' "il fotovoltaico di Fara". Quindi a schermo e a voce si
     * mostra sempre la descrizione, e il codice resta un fatto interno.
     */
    fun descrizioneCommessa(codice: String?): String? {
        if (codice.isNullOrBlank()) return null
        val trovata = commesse.firstOrNull { it.id.equals(codice.trim(), ignoreCase = true) }
        return trovata?.descrizione?.takeIf { it.isNotBlank() } ?: codice
    }

    /** Il cantiere di una commessa, per intero, da mostrare a schermo. */
    fun indirizzoCommessa(codice: String?): String? {
        if (codice.isNullOrBlank()) return null
        return commesse.firstOrNull { it.id.equals(codice.trim(), ignoreCase = true) }
            ?.indirizzo?.takeIf { it.isNotBlank() }
    }
}
