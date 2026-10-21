package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/** Un cliente come sta nel foglio. */
data class Cliente(
    val id: String,
    val nome: String,
    val alias: List<String> = emptyList(),
    /** Solo nei fogli di prima della 0.3.5: le regole ora stanno sulla scheda del cliente. */
    val gruppo: String = "",
    val email: String = "",
    val indirizzo: String = "",
    /** Elettrodinamica: 30. Null = tariffa libera, scritta nel rapportino. */
    val tariffaFissa: Double? = null,
    /** L'ultima tariffa libera usata per questo cliente: il foglio se la ricorda. */
    val ultimaTariffa: Double? = null,
    /** Null = come di solito: viaggio non pagato, km pagati. */
    val pagaViaggio: Boolean? = null,
    val kmRimborsati: Boolean? = null,
    val maggExtra: Double? = null,
    // ---- il resto della scheda, come sul foglio (0.4.0) ----
    /** Testo, non numero: lo zero davanti dei fissi resta. */
    val telefono: String = "",
    /** Testo, non numero: "01234567890" tiene lo zero. */
    val partitaIva: String = "",
    /** Quanto costa a te un'ora per questo cliente, sempre uguale (Elettrodinamica). Vince sul costo della commessa. */
    val costoFisso: Double? = null,
    val note: String = "",
) {
    /** Nella forma dello script (leggiClienti): per la copia sul telefono e per i PDF. */
    fun aJson(): JSONObject = JSONObject()
        .put("id", id).put("nome", nome).put("alias", JSONArray(alias))
        .put("gruppo", gruppo).put("email", email).put("telefono", telefono)
        .put("indirizzo", indirizzo).put("partitaIva", partitaIva)
        .put("tariffaFissa", tariffaFissa ?: JSONObject.NULL)
        .put("costoFisso", costoFisso ?: JSONObject.NULL)
        .put("ultimaTariffa", ultimaTariffa ?: JSONObject.NULL)
        .put("pagaViaggio", pagaViaggio ?: JSONObject.NULL)
        .put("kmRimborsati", kmRimborsati ?: JSONObject.NULL)
        .put("maggExtra", maggExtra ?: JSONObject.NULL)
        .put("note", note)

    companion object {
        fun daJson(c: JSONObject) = Cliente(
            id = c.testo("id"),
            nome = c.testo("nome"),
            alias = c.optJSONArray("alias").let { a ->
                (0 until (a?.length() ?: 0)).map { a!!.optString(it).trim() }
            }.filter { it.isNotBlank() },
            gruppo = c.testo("gruppo"),
            email = c.testo("email"),
            indirizzo = c.testo("indirizzo"),
            tariffaFissa = c.numero("tariffaFissa"),
            ultimaTariffa = c.numero("ultimaTariffa"),
            pagaViaggio = c.booleanoONull("pagaViaggio"),
            kmRimborsati = c.booleanoONull("kmRimborsati"),
            maggExtra = c.numero("maggExtra"),
            telefono = c.testo("telefono"),
            partitaIva = c.testo("partitaIva"),
            costoFisso = c.numero("costoFisso"),
            note = c.testo("note"),
        )
    }
}

/** Una commessa: un lavoro presso un cliente. */
data class Commessa(
    val id: String,
    val idCliente: String,
    val descrizione: String,
    val stato: String = "APERTA",
    val indirizzo: String = "",
    /** Il rimborso chilometrico di questa commessa; null = quello delle impostazioni. */
    val euroKm: Double? = null,
    /** Il prezzo di un'ora: si propone come tariffa (non per un cliente a tariffa fissa). */
    val prezzoOrario: Double? = null,
    // ---- il resto della scheda, come sul foglio (0.4.0) ----
    /** Il budget: ore previste x prezzo orario = budget in euro. Ne bastano due (vedi [Conti.budgetDi]). */
    val budgetOre: Double? = null,
    val budgetEuro: Double? = null,
    /** Quanto costa a te un'ora di questa commessa; null = COSTO_ORARIO delle impostazioni. */
    val costoOrario: Double? = null,
    val inizio: LocalDate? = null,
    val finePrevista: LocalDate? = null,
    /** L'indirizzo della cartella su Drive: lo script la crea la prima volta che si guardano i documenti. */
    val cartella: String = "",
    /** Il codice di prima dei 26ST (P2601, M001): un rapportino vecchio in coda lo usa ancora. */
    val codicePrecedente: String = "",
    val note: String = "",
) {
    /** Solo le aperte si propongono nei rapportini nuovi. Le sospese e le chiuse restano sul foglio. */
    val aperta: Boolean get() = stato.equals("APERTA", ignoreCase = true)
    val sospesa: Boolean get() = stato.equals("SOSPESA", ignoreCase = true)
    val chiusa: Boolean get() = stato.equals("CHIUSA", ignoreCase = true)

    /** "Aperta", "Sospesa", "Chiusa": lo stato con la parola. */
    val etichettaStato: String
        get() = stato.trim().lowercase().replaceFirstChar { it.uppercase() }.ifBlank { "Aperta" }

    /** Nella forma dello script (leggiCommesse): per la copia sul telefono e per i PDF. */
    fun aJson(): JSONObject = JSONObject()
        .put("id", id).put("idCliente", idCliente)
        .put("descrizione", descrizione).put("stato", stato).put("indirizzo", indirizzo)
        .put("budgetOre", budgetOre ?: JSONObject.NULL)
        .put("budgetEuro", budgetEuro ?: JSONObject.NULL)
        .put("prezzoOrario", prezzoOrario ?: JSONObject.NULL)
        .put("costoOrario", costoOrario ?: JSONObject.NULL)
        .put("euroKm", euroKm ?: JSONObject.NULL)
        .put("inizio", inizio?.format(Rapportino.ISO) ?: "")
        .put("finePrevista", finePrevista?.format(Rapportino.ISO) ?: "")
        .put("cartella", cartella)
        .put("codicePrecedente", codicePrecedente)
        .put("note", note)

    companion object {
        /** Gli stati che lo script accetta, in ordine. */
        val STATI = listOf("APERTA", "SOSPESA", "CHIUSA")

        fun daJson(m: JSONObject) = Commessa(
            id = m.testo("id"),
            idCliente = m.testo("idCliente"),
            descrizione = m.testo("descrizione"),
            stato = m.testo("stato").uppercase().ifBlank { "APERTA" },
            indirizzo = m.testo("indirizzo"),
            euroKm = m.numero("euroKm"),
            prezzoOrario = m.numero("prezzoOrario"),
            budgetOre = m.numero("budgetOre"),
            budgetEuro = m.numero("budgetEuro"),
            costoOrario = m.numero("costoOrario"),
            inizio = m.data("inizio"),
            finePrevista = m.data("finePrevista"),
            cartella = m.testo("cartella"),
            codicePrecedente = m.testo("codicePrecedente"),
            note = m.testo("note"),
        )
    }
}

/** I gruppi dei fogli di prima della 0.3.5 (Elettrodinamica e Privato): solo per leggerli. */
data class Gruppo(
    val nome: String,
    /** Null = tariffa libera, la scrive il tecnico. */
    val tariffaFissa: Double? = null,
    val pagaViaggio: Boolean = false,
    val kmRimborsati: Boolean = true,
    val maggExtra: Double = 0.0,
)

/** Quello che il foglio sa oltre ai rapportini. */
data class Anagrafiche(
    val clienti: List<Cliente> = emptyList(),
    val commesse: List<Commessa> = emptyList(),
    val gruppi: List<Gruppo> = emptyList(),
    /** La scheda Impostazioni: CHIAVE -> valore, sempre testo ("0.76", "SI"). Le chiavi sono in [Anagrafiche.Companion]. */
    val impostazioni: Map<String, String> = emptyMap(),
) {
    val euroKm: Double get() = Numeri.leggi(impostazioni[EURO_KM]) ?: 0.0
    val ticketAttivo: Boolean get() = impostazioni[TICKET_ATTIVO].equals("SI", ignoreCase = true)
    val tecnico: String get() = impostazioni[TECNICO].orEmpty()

    /** Quanto costa un'ora di lavoro, se scritto: serve solo al margine delle commesse. */
    val costoOrario: Double? get() = Numeri.leggi(impostazioni[COSTO_ORARIO])
    val ragioneSociale: String get() = impostazioni[RAGIONE_SOCIALE].orEmpty()

    /** L'indirizzo su Drive della firma del compilatore; vuoto se non e' ancora caricata. */
    val firmaTecnico: String get() = impostazioni[FIRMA_TECNICO].orEmpty()

    /** L'id del file della firma del compilatore, da chiedere a Dati.file(). */
    val idFirmaTecnico: String get() = FileRemoto.idDaUrl(firmaTecnico)

    /** Un valore delle impostazioni, vuoto se manca. */
    fun impostazione(chiave: String): String = impostazioni[chiave].orEmpty()

    fun cliente(id: String, nome: String = ""): Cliente? =
        clienti.firstOrNull { id.isNotBlank() && it.id == id }
            ?: nome.takeIf { it.isNotBlank() }?.let { n ->
                val chiave = normalizza(n)
                clienti.firstOrNull { c -> (listOf(c.nome) + c.alias).any { normalizza(it) == chiave } }
            }

    /** Il cliente di una commessa. */
    fun clienteDi(commessa: Commessa?): Cliente? = commessa?.let { cliente(it.idCliente) }

    fun commesseAperteDi(idCliente: String): List<Commessa> =
        commesse.filter { it.idCliente == idCliente && it.aperta }

    /** Tutte le commesse di un cliente, aperte, sospese e chiuse. */
    fun commesseDi(idCliente: String): List<Commessa> = commesse.filter { it.idCliente == idCliente }

    /**
     * Le regole di un rapportino: la tariffa fissa dalla scheda del cliente
     * (Elettrodinamica 30, gli altri liberi), il rimborso chilometrico dalla
     * commessa se ne ha uno. Stessa logica di regoleDi() nello script.
     */
    fun regoleDi(cliente: Cliente?, commessa: Commessa? = null): Regole {
        val nomeGruppo = cliente?.gruppo.orEmpty()
        val g = gruppi.firstOrNull { nomeGruppo.isNotBlank() && normalizza(it.nome) == normalizza(nomeGruppo) }
        return Regole(
            gruppo = g?.nome ?: nomeGruppo,
            tariffaFissa = cliente?.tariffaFissa ?: g?.tariffaFissa,
            pagaViaggio = cliente?.pagaViaggio ?: g?.pagaViaggio ?: false,
            kmRimborsati = cliente?.kmRimborsati ?: g?.kmRimborsati ?: true,
            maggExtra = cliente?.maggExtra ?: g?.maggExtra ?: 0.0,
            euroKm = commessa?.euroKm ?: euroKm,
        )
    }

    /**
     * Per codice, anche quello di prima dei 26ST: un rapportino rimasto in coda su
     * un telefono puo' avere ancora P2601, come cerca lo script in salvaRapportino.
     */
    fun commessa(id: String): Commessa? {
        if (id.isBlank()) return null
        return commesse.firstOrNull { it.id.equals(id.trim(), ignoreCase = true) }
            ?: commesse.firstOrNull { it.codicePrecedente.isNotBlank() && it.codicePrecedente.equals(id.trim(), ignoreCase = true) }
    }

    /**
     * Il codice di una commessa nuova: anno a due cifre, ST, e il numero dopo il
     * piu' alto usato (26ST047). Il numero non riparte a gennaio. Come nello script:
     * se nel frattempo il computer ha dato lo stesso codice a un'altra, il foglio
     * ne sceglie un altro.
     */
    fun prossimoCodiceCommessa(anno: Int): String {
        val max = commesse.mapNotNull { CODICE_COMMESSA.find(it.id.trim().uppercase())?.groupValues?.get(1)?.toIntOrNull() }.maxOrNull() ?: 0
        val n = max + 1
        return "%02d".format(anno % 100) + "ST" + (if (n < 1000) "%03d".format(n) else n.toString())
    }

    companion object {
        // Le chiavi della scheda Impostazioni (IMPOSTAZIONI_INIZIALI nello script).
        const val EURO_KM = "EURO_KM"
        const val AUTO = "AUTO"
        const val COSTO_ORARIO = "COSTO_ORARIO"
        const val TICKET_ATTIVO = "TICKET_ATTIVO"
        const val TECNICO = "TECNICO"
        const val RAGIONE_SOCIALE = "RAGIONE_SOCIALE"
        const val INDIRIZZO = "INDIRIZZO"
        const val PARTITA_IVA = "PARTITA_IVA"
        const val EMAIL = "EMAIL"
        const val TELEFONO = "TELEFONO"
        const val PEC = "PEC"
        const val FIRMA_TECNICO = "FIRMA_TECNICO"
        const val EMAIL_AVVISI = "EMAIL_AVVISI"

        /** Quelle che lo script vuole come numero: il computer le manda cosi', e cosi' anche il telefono. */
        val IMPOSTAZIONI_NUMERICHE = setOf(EURO_KM, COSTO_ORARIO)

        /** "Rossi Impianti S.r.l." e "rossi impianti srl" sono lo stesso cliente. */
        fun normalizza(s: String): String = s.lowercase().replace(Regex("[^a-z0-9]"), "")

        /** 26ST047: anno, ST (Studio Tecnico GM), numero. */
        private val CODICE_COMMESSA = Regex("""^\d{2}ST(\d+)$""")

        fun daJson(o: JSONObject) = Anagrafiche(
            clienti = o.optJSONArray("clienti").oggetti().map(Cliente::daJson).filter { it.nome.isNotBlank() },
            commesse = o.optJSONArray("commesse").oggetti().map(Commessa::daJson).filter { it.id.isNotBlank() },
            gruppi = o.optJSONArray("gruppi").oggetti().map { g ->
                Gruppo(
                    nome = g.testo("nome"),
                    tariffaFissa = g.numero("tariffaFissa"),
                    pagaViaggio = g.optBoolean("pagaViaggio", false),
                    kmRimborsati = g.optBoolean("kmRimborsati", true),
                    maggExtra = g.numero("maggExtra") ?: 0.0,
                )
            }.filter { it.nome.isNotBlank() },
            impostazioni = impostazioniDaJson(o.optJSONObject("impostazioni")),
        )

        /** { EURO_KM: 0.76, AUTO: "Volvo XC40" } -> mappa di testi. Un numero intero resta senza ",0". */
        fun impostazioniDaJson(imp: JSONObject?): Map<String, String> =
            imp?.keys()?.asSequence()?.associateWith { k ->
                when (val v = if (imp.isNull(k)) null else imp.opt(k)) {
                    null -> ""
                    is Number -> v.toDouble().let { d -> if (d == Math.floor(d) && !d.isInfinite()) d.toLong().toString() else d.toString() }
                    else -> v.toString()
                }
            } ?: emptyMap()
    }

    /** Per la copia sul telefono e per i PDF: la stessa forma della risposta dello script. */
    fun aJson(): JSONObject = JSONObject()
        .put("clienti", JSONArray().apply { clienti.forEach { put(it.aJson()) } })
        .put("commesse", JSONArray().apply { commesse.forEach { put(it.aJson()) } })
        .put("gruppi", JSONArray().apply {
            gruppi.forEach { g ->
                put(
                    JSONObject().put("nome", g.nome).put("tariffaFissa", g.tariffaFissa ?: JSONObject.NULL)
                        .put("pagaViaggio", g.pagaViaggio).put("kmRimborsati", g.kmRimborsati)
                        .put("maggExtra", g.maggExtra)
                )
            }
        })
        .put("impostazioni", JSONObject(impostazioni))
}
