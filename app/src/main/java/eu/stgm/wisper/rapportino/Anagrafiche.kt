package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject

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
)

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
) {
    /** Solo le aperte si propongono nei rapportini nuovi. Le sospese e le chiuse restano sul foglio. */
    val aperta: Boolean get() = stato.equals("APERTA", ignoreCase = true)
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
    val impostazioni: Map<String, String> = emptyMap(),
) {
    val euroKm: Double get() = Numeri.leggi(impostazioni["EURO_KM"]) ?: 0.0
    val ticketAttivo: Boolean get() = impostazioni["TICKET_ATTIVO"].equals("SI", ignoreCase = true)
    val tecnico: String get() = impostazioni["TECNICO"].orEmpty()

    fun cliente(id: String, nome: String = ""): Cliente? =
        clienti.firstOrNull { id.isNotBlank() && it.id == id }
            ?: nome.takeIf { it.isNotBlank() }?.let { n ->
                val chiave = normalizza(n)
                clienti.firstOrNull { c -> (listOf(c.nome) + c.alias).any { normalizza(it) == chiave } }
            }

    fun commesseAperteDi(idCliente: String): List<Commessa> =
        commesse.filter { it.idCliente == idCliente && it.aperta }

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

    fun commessa(id: String): Commessa? = commesse.firstOrNull { id.isNotBlank() && it.id.equals(id, ignoreCase = true) }

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
        /** "Rossi Impianti S.r.l." e "rossi impianti srl" sono lo stesso cliente. */
        fun normalizza(s: String): String = s.lowercase().replace(Regex("[^a-z0-9]"), "")

        /** 26ST047: anno, ST (Studio Tecnico GM), numero. */
        private val CODICE_COMMESSA = Regex("""^\d{2}ST(\d+)$""")

        fun daJson(o: JSONObject) = Anagrafiche(
            clienti = o.optJSONArray("clienti").oggetti().map { c ->
                Cliente(
                    id = c.testo("id"),
                    nome = c.testo("nome"),
                    alias = c.optJSONArray("alias").let { a ->
                        (0 until (a?.length() ?: 0)).map { a!!.optString(it) }
                    }.filter { it.isNotBlank() },
                    gruppo = c.testo("gruppo"),
                    email = c.testo("email"),
                    indirizzo = c.testo("indirizzo"),
                    tariffaFissa = c.numero("tariffaFissa"),
                    ultimaTariffa = c.numero("ultimaTariffa"),
                    pagaViaggio = c.booleanoONull("pagaViaggio"),
                    kmRimborsati = c.booleanoONull("kmRimborsati"),
                    maggExtra = c.numero("maggExtra"),
                )
            }.filter { it.nome.isNotBlank() },
            commesse = o.optJSONArray("commesse").oggetti().map { m ->
                Commessa(
                    id = m.testo("id"),
                    idCliente = m.testo("idCliente"),
                    descrizione = m.testo("descrizione"),
                    stato = m.testo("stato").ifBlank { "APERTA" },
                    indirizzo = m.testo("indirizzo"),
                    euroKm = m.numero("euroKm"),
                    prezzoOrario = m.numero("prezzoOrario"),
                )
            }.filter { it.id.isNotBlank() },
            gruppi = o.optJSONArray("gruppi").oggetti().map { g ->
                Gruppo(
                    nome = g.testo("nome"),
                    tariffaFissa = g.numero("tariffaFissa"),
                    pagaViaggio = g.optBoolean("pagaViaggio", false),
                    kmRimborsati = g.optBoolean("kmRimborsati", true),
                    maggExtra = g.numero("maggExtra") ?: 0.0,
                )
            }.filter { it.nome.isNotBlank() },
            impostazioni = o.optJSONObject("impostazioni")?.let { imp ->
                imp.keys().asSequence().associateWith { k -> if (imp.isNull(k)) "" else imp.optString(k) }
            } ?: emptyMap(),
        )
    }

    /** Per la copia sul telefono: la stessa forma della risposta dello script. */
    fun aJson(): JSONObject = JSONObject()
        .put("clienti", JSONArray().apply {
            clienti.forEach { c ->
                put(
                    JSONObject()
                        .put("id", c.id).put("nome", c.nome).put("alias", JSONArray(c.alias))
                        .put("gruppo", c.gruppo).put("email", c.email).put("indirizzo", c.indirizzo)
                        .put("tariffaFissa", c.tariffaFissa ?: JSONObject.NULL)
                        .put("ultimaTariffa", c.ultimaTariffa ?: JSONObject.NULL)
                        .put("pagaViaggio", c.pagaViaggio ?: JSONObject.NULL)
                        .put("kmRimborsati", c.kmRimborsati ?: JSONObject.NULL)
                        .put("maggExtra", c.maggExtra ?: JSONObject.NULL)
                )
            }
        })
        .put("commesse", JSONArray().apply {
            commesse.forEach { m ->
                put(
                    JSONObject().put("id", m.id).put("idCliente", m.idCliente)
                        .put("descrizione", m.descrizione).put("stato", m.stato).put("indirizzo", m.indirizzo)
                        .put("euroKm", m.euroKm ?: JSONObject.NULL)
                        .put("prezzoOrario", m.prezzoOrario ?: JSONObject.NULL)
                )
            }
        })
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
