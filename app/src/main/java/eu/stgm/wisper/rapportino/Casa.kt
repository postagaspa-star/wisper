package eu.stgm.wisper.rapportino

/**
 * Le regole della casa del design Fai (docs/gestionale/fai.md §5), come pc/ui/regole-casa.js: cosa va sulla scheda
 * gialla, quali azioni si vedono, quali righe in Da sistemare. Casi condivisi: pc/prove/casi-casa.json.
 */
data class SchedaImportante(
    val titolo: String,
    val dettaglio: String = "",
    val pillola: String = "",
    val importo: Double? = null,
    val nota: String = "",
    /** C'è solo per una fattura scaduta di un cliente solo: è quella a cui si manda il promemoria. */
    val idFattura: String? = null,
    val cliente: String = "",
)

/** Una delle sei azioni: la chiave, il testo, il modulo con cui si scrive e il colore. */
data class AzioneCasa(val chiave: String, val testo: String, val modulo: String, val tinta: String)

/** La prima cosa da fare, le righe di Da sistemare e quante ne restano in Vedi tutto. */
data class DaSistemare(val prima: VoceDashboard?, val righe: List<VoceDashboard>, val altre: Int)

object Casa {
    val AZIONI = listOf(
        AzioneCasa("rapportino", "Scrivi un rapportino", Moduli.RAPPORTINI, "giallo"),
        AzioneCasa("spesa", "Aggiungi una spesa", Moduli.SPESE, "corallo"),
        AzioneCasa("commessa", "Nuova commessa", Moduli.COMMESSE, "blu"),
        AzioneCasa("cliente", "Nuovo cliente", Moduli.CLIENTI, "verde"),
        AzioneCasa("preventivo", "Prepara un preventivo", Moduli.PREVENTIVI, "viola"),
        AzioneCasa("invia", "Invia un rapportino", Moduli.RAPPORTINI, "acqua"),
    )

    /** Le azioni che chi è entrato può fare: permesso di scrittura e funzione accesa, altrimenti la tessera sparisce. */
    fun azioniDi(puoScrivere: (String) -> Boolean): List<AzioneCasa> = AZIONI.filter { puoScrivere(it.modulo) }

    /** La frase del server "Fattura 2026/41 scaduta da 12 giorni". */
    private val FATTURA_SCADUTA = Regex("^Fattura (.+) scaduta da (.+)$")

    fun schedaImportante(v: VoceDashboard): SchedaImportante {
        val importo = if ((v.unita == "euro" || v.unita.isBlank()) && v.quanto != null) v.quanto else null
        val f = if (v.tipo == "fattura") FATTURA_SCADUTA.find(v.titolo) else null
        if (f != null) {
            val cliente = v.dettaglio.split(" · ").first().trim()
            val col = v.collegamento
            return SchedaImportante(
                titolo = if (cliente.isNotBlank()) "La fattura di $cliente è scaduta" else "La fattura ${f.groupValues[1]} è scaduta",
                pillola = "Scaduta da ${f.groupValues[2]}",
                importo = importo,
                nota = "Fattura ${f.groupValues[1]}",
                idFattura = if (col != null && col.pagina == "fattura" && col.id.isNotBlank()) col.id else null,
                cliente = cliente,
            )
        }
        return SchedaImportante(titolo = v.titolo, dettaglio = v.dettaglio, importo = importo)
    }

    /** [quante] sono le righe da mostrare; le altre le conta il server (d.quante), non l'elenco già tagliato. */
    fun daSistemare(
        urgenti: List<VoceDashboard>,
        settimana: List<VoceDashboard>,
        pianificare: List<VoceDashboard>,
        contate: Map<String, Int>,
        quante: Int,
    ): DaSistemare {
        val tutte = urgenti + settimana + pianificare
        val conte = listOf("urgenti", "settimana", "pianificare").sumOf { contate[it] ?: 0 }
        val totale = maxOf(conte, tutte.size)
        val prima = tutte.firstOrNull()
        val righe = tutte.drop(1).take(quante)
        return DaSistemare(prima, righe, maxOf(0, totale - (if (prima != null) 1 else 0) - righe.size))
    }

    private val TINTE = mapOf(
        "ambra" to listOf("budget", "commessa", "fine", "prestazione", "prestazioni"),
        "corallo" to listOf("spese", "rimborsi", "approvare", "respinta", "veicoli"),
        "blu" to listOf("appuntamento", "sopralluogo", "attivita", "agenda", "intervento", "giorno", "giorni", "scadenza"),
        "viola" to listOf("responsabile", "persona", "persone", "assenza", "qualifica", "visita", "collaboratore", "incarico", "preventivo", "preventivi"),
        "verde" to listOf("fattura", "fatturare", "fatturazione", "soldi", "cassa", "impegno", "conto", "pagamento", "ricevuta", "rapportini"),
        "acqua" to listOf("ticket", "messaggio", "portale", "documento", "contratto"),
    ).flatMap { (tinta, tipi) -> tipi.map { it to tinta } }.toMap()

    /** Il colore della riga di Da sistemare, dal tipo della voce. */
    fun tintaVoce(v: VoceDashboard): String = TINTE[v.tipo.lowercase()] ?: "ardesia"
}
