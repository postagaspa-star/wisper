package eu.stgm.wisper.rapportino

/**
 * I modelli dei documenti che Wisper crea e i loro codici (1.5.0, 17/11/2026; docs/gestionale/modelli.md). Andrea: "censisci
 * i modelli che Wisper puo' creare [...] e ad ognuno dai un codice, che deve apparire nei posti opportuni di Wisper, oltre ad
 * avere anche una sua pagina dove poterli vedere tutti con relativi esempi, senza pero' poterne creare di nuovi".
 *
 * Lo stesso elenco e la stessa regola di pc/ui/documenti.js (MODELLI, modelloRapportino), con gli stessi casi
 * (pc/prove/casi-modelli.json, ModelliDocumentiTest). Il codice e' famiglia + numero e non si rinumera mai: un modello nuovo prende
 * il numero dopo. Sul documento sta in fondo a ogni pagina ("Mod. RAP-01"): lo scrive documenti.js, qui non si tocca.
 * L'esempio di ogni modello lo fa il modello vero coi dati di pc/ui/modelli-esempi.js ([Stampa.esempio]).
 */
object ModelliDocumenti {
    /** [testi]: la chiave dei testi che si cambiano in Documenti › Modelli ("" = nessuno). */
    data class Modello(val codice: String, val famiglia: String, val nome: String, val quando: String, val dove: String, val testi: String)

    val TUTTI: List<Modello> = listOf(
        Modello("RAP-01", "Rapportini", "Rapportino giornaliero, una commessa",
            quando = "Un rapportino con tutti i lavori sulla stessa commessa. In tabella c'è la descrizione del progetto, senza data e numero.",
            dove = "Rapportini › Invia, oppure il PDF del rapportino", testi = "rapportino"),
        Modello("RAP-02", "Rapportini", "Rapportino giornaliero, più commesse",
            quando = "Un rapportino con lavori su commesse diverse. In tabella ogni riga ha la data e il numero.",
            dove = "Rapportini › Invia, oppure il PDF del rapportino", testi = "rapportino"),
        Modello("RAP-03", "Rapportini", "Riepilogo dei rapportini del mese",
            quando = "Più rapportini dello stesso cliente, di solito quelli del mese: una riga per lavoro e i totali per la fattura.",
            dove = "Rapportini › Invia, con più rapportini scelti", testi = "riepilogo"),
        Modello("RAP-04", "Rapportini", "Rapportino di un lavoro, a scheda",
            quando = "Un lavoro solo, a riquadri invece che a tabella. Oggi lo usa solo il portale clienti.",
            dove = "Portale clienti", testi = ""),
        Modello("PRE-01", "Preventivi", "Preventivo",
            quando = "L'offerta al cliente: le voci divise in sezioni, i conti e le condizioni.",
            dove = "Preventivi › PDF o Invia", testi = "preventivo"),
        Modello("PRE-02", "Preventivi", "Incarico professionale",
            quando = "L'incarico da far firmare al cliente, da un preventivo accettato.",
            dove = "Preventivi › Incarico", testi = ""),
        Modello("FAT-01", "Fatture", "Parcella pro-forma",
            quando = "La bozza della fattura da mandare al cliente prima di emetterla. Non ha valore fiscale.",
            dove = "Fatture › Parcella pro-forma", testi = ""),
        Modello("FAT-02", "Fatture", "Parcella o fattura",
            quando = "La copia per il cliente della fattura emessa, col numero dato dal programma. Vale anche per la nota di credito.",
            dove = "Fatture › PDF della fattura emessa", testi = ""),
        Modello("FAT-03", "Fatture", "Prospetto per il programma delle fatture",
            quando = "I dati della fattura da copiare nel programma che la emette. Resta in studio, non va al cliente.",
            dove = "Fatture › Prospetto", testi = ""),
        Modello("LET-01", "Lettere e contratti", "Lettera",
            quando = "Una lettera al cliente da un testo già pronto, per esempio la verifica dell'impianto di terra.",
            dove = "Documenti › Modelli › Nuova lettera", testi = "lettera"),
        Modello("LET-02", "Lettere e contratti", "Lettera d'incarico al collaboratore",
            quando = "La lettera con cui lo studio affida un incarico a un collaboratore esterno.",
            dove = "Collaboratori › Incarico › Lettera d'incarico", testi = "incarico"),
        Modello("ASS-01", "Lettere e contratti", "Contratto di assistenza",
            quando = "Il contratto di assistenza: impianti, visite, tempi d'intervento e condizioni.",
            dove = "Ticket › Assistenza › PDF del contratto", testi = "contratto"),
    )

    /** Le famiglie nell'ordine dell'elenco: Rapportini, Preventivi, Fatture, Lettere e contratti. */
    val FAMIGLIE: List<String> = TUTTI.map { it.famiglia }.distinct()

    fun trova(codice: String): Modello? = TUTTI.firstOrNull { it.codice == codice }

    /** Come si scrive nell'app e sul documento: "Mod. RAP-01". */
    fun sigla(codice: String): String = "Mod. " + codice

    /** Il modulo del menu che da' il colore alla famiglia (come sul computer: ogni voce ha il suo colore). */
    fun moduloDi(famiglia: String): String = when (famiglia) {
        "Rapportini" -> Moduli.RAPPORTINI
        "Preventivi" -> Moduli.PREVENTIVI
        "Fatture" -> Moduli.FATTURAZIONE
        else -> Moduli.DOCUMENTI
    }

    /**
     * Documenti › Modelli (i testi che si cambiano): i codici dei modelli di una riga. Una riga puo' valere per piu'
     * modelli (il rapportino: RAP-01 e RAP-02); i due senza testi da cambiare non hanno la chiave nell'elenco.
     */
    private val SENZA_TESTI = mapOf("avviso" to "FAT-01", "prospetto" to "FAT-03")
    fun codiciDiRiga(chiave: String): List<String> =
        TUTTI.filter { it.testi.isNotBlank() && it.testi == chiave }.map { it.codice }.ifEmpty { listOfNotNull(SENZA_TESTI[chiave]) }

    /** Il nome e' quello della pagina Modelli quando la riga vale per un modello solo ("Parcella pro-forma", non "Avviso di parcella"). */
    fun nomeDiRiga(chiave: String, nome: String): String = codiciDiRiga(chiave).singleOrNull()?.let { trova(it)?.nome } ?: nome

    /** Un lavoro del rapportino per la regola: il suo giorno (vuoto = quello del rapportino) e la commessa. */
    data class Lavoro(val data: String = "", val idCommessa: String = "")

    /**
     * Il modello del PDF di un rapportino (un numero solo): RAP-01 se tutti i lavori sono dello stesso giorno e della
     * stessa commessa (anche "nessuna commessa" per tutti), altrimenti RAP-02. [data]: il giorno del rapportino.
     */
    fun rapportino(lavori: List<Lavoro>, data: String = ""): String {
        fun giorno(l: Lavoro) = l.data.ifBlank { data }.take(10)
        val primo = lavori.firstOrNull() ?: return "RAP-01"
        return if (lavori.all { giorno(it) == giorno(primo) && it.idCommessa.trim() == primo.idCommessa.trim() }) "RAP-01" else "RAP-02"
    }

    /** Il modello di un invio: un rapportino solo segue la regola, piu' rapportini sono il riepilogo. */
    fun invio(unRapportino: Boolean, lavori: List<Lavoro>, data: String = ""): String = if (unRapportino) rapportino(lavori, data) else "RAP-03"
}
