package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/**
 * Un cliente o un fornitore (dalla fase 1 un'anagrafica sola, i "soggetti"):
 * [cliente] e [fornitore] possono essere veri tutti e due.
 */
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
    // ---- il gestionale (fase 1) ----
    val cliente: Boolean = true,
    val fornitore: Boolean = false,
    val pec: String = "",
    val codiceFiscale: String = "",
    val codiceSdi: String = "",
    val cap: String = "",
    val citta: String = "",
    val provincia: String = "",
    val nazione: String = "IT",
    val archiviato: Boolean = false,
    /**
     * Fase 4 (architettura.md §15.2): null = automatico (sì con la partita IVA, no senza);
     * true/false scritto a mano (un condominio sì, un forfettario no).
     */
    val sostitutoImposta: Boolean? = null,
    /** Giorni di pagamento del cliente; null = quelli delle impostazioni. */
    val pagamentoGiorni: Int? = null,
    /** Poi a fine mese; null = come le impostazioni. */
    val pagamentoFineMese: Boolean? = null,
    /**
     * Vero quando i tre campi qui sopra si sono letti davvero dal server (o li ha scritti il
     * modulo). Una copia vecchia non li ha: allora non si mandano, così un "null" non
     * cancella un "sì" scritto dal computer.
     */
    val fatturazioneLetta: Boolean = false,
    /** Fase 6 (§12.8): il fornitore ha la scheda del collaboratore esterno. */
    val collaboratore: Boolean = false,
    /** Fase 7 (fase7.md §10.4): il portale è acceso per questo cliente. */
    val portale: Boolean = false,
) {
    /** "C001 · Thiene": la citta', o l'indirizzo se la citta' non c'e' ancora (i clienti del foglio). */
    val luogo: String get() = citta.ifBlank { indirizzo }

    /** "Via dell'Industria 12, 36016 Thiene (VI)". */
    val indirizzoCompleto: String
        get() = listOf(indirizzo, listOf(cap, citta).filter { it.isNotBlank() }.joinToString(" ") + (if (provincia.isNotBlank()) " ($provincia)" else ""))
            .map { it.trim() }.filter { it.isNotBlank() }.joinToString(", ")

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
        .put("cliente", cliente).put("fornitore", fornitore).put("pec", pec)
        .put("codiceFiscale", codiceFiscale).put("codiceSdi", codiceSdi).put("cap", cap)
        .put("citta", citta).put("provincia", provincia).put("nazione", nazione).put("archiviato", archiviato)
        .apply {
            if (collaboratore) put("collaboratore", true)
            if (portale) put("portale", true)
            if (fatturazioneLetta) {
                put("sostitutoImposta", sostitutoImposta ?: JSONObject.NULL)
                put("pagamentoGiorni", pagamentoGiorni ?: JSONObject.NULL)
                put("pagamentoFineMese", pagamentoFineMese ?: JSONObject.NULL)
            }
        }

    companion object {
        fun daJson(c: JSONObject, comeFornitore: Boolean = false) = Cliente(
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
            // Senza i due campi (il foglio di prima) e' un cliente, o un fornitore se arriva dall'elenco dei fornitori.
            cliente = if (c.has("cliente")) c.vero("cliente") else !comeFornitore,
            fornitore = if (c.has("fornitore")) c.vero("fornitore") else comeFornitore,
            pec = c.testo("pec"),
            codiceFiscale = c.testo("codiceFiscale"),
            codiceSdi = c.testo("codiceSdi"),
            cap = c.testo("cap"),
            citta = c.testo("citta"),
            provincia = c.testo("provincia"),
            nazione = c.testo("nazione").ifBlank { "IT" },
            archiviato = c.vero("archiviato"),
            sostitutoImposta = c.booleanoONull("sostitutoImposta"),
            pagamentoGiorni = c.numero("pagamentoGiorni")?.toInt(),
            pagamentoFineMese = c.booleanoONull("pagamentoFineMese"),
            fatturazioneLetta = c.has("sostitutoImposta") || c.has("pagamentoGiorni") || c.has("pagamentoFineMese"),
            collaboratore = c.vero("collaboratore"),
            portale = c.vero("portale"),
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
    // ---- il gestionale (fase 1) ----
    /** La sede o l'impianto del cliente dove si lavora; vuoto = nessuno. */
    val idSede: String = "",
    /** L'utente responsabile; vuoto = da scegliere. */
    val idResponsabile: String = "",
    /** Gli utenti che ci lavorano. */
    val persone: List<String> = emptyList(),
    val importoContratto: Double? = null,
    val archiviata: Boolean = false,
    /** Una commessa modello: non compare negli elenchi normali, si usa per farne di nuove. */
    val modello: Boolean = false,
    /**
     * Fase 4 (§15.2): "ore" | "corpo" | "misto". Null = non letto (una copia vecchia): allora
     * non si manda, così salvare la commessa non la riporta "a ore" per sbaglio.
     */
    val modoFatturazione: String? = null,
    /** Fase 5 (§16.2): il contratto di assistenza di cui è la commessa (pillola Assistenza). */
    val idContratto: String = "",
) {
    /**
     * Solo le aperte si propongono nei rapportini nuovi. Le sospese e le chiuse
     * restano sul foglio; le archiviate e i modelli non si propongono mai.
     */
    val aperta: Boolean get() = stato.equals("APERTA", ignoreCase = true) && !archiviata && !modello
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
        .put("sedeId", idSede).put("responsabileId", idResponsabile).put("persone", JSONArray(persone))
        .put("importoContratto", importoContratto ?: JSONObject.NULL)
        .put("archiviata", archiviata).put("modello", modello)
        .apply { if (modoFatturazione != null) put("modoFatturazione", modoFatturazione) }
        .put("idContratto", idContratto)

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
            idSede = m.testo("sedeId").ifBlank { m.testo("idSede") },
            idResponsabile = m.testo("responsabileId").ifBlank { m.testo("idResponsabile") },
            persone = m.optJSONArray("persone")?.let { a ->
                (0 until a.length()).mapNotNull { i ->
                    when (val v = a.opt(i)) {
                        is JSONObject -> v.testo("id").ifBlank { v.testo("utenteId") }
                        null -> null
                        else -> v.toString()
                    }?.takeIf { it.isNotBlank() }
                }
            }.orEmpty(),
            importoContratto = m.numero("importoContratto"),
            archiviata = m.vero("archiviata"),
            modello = m.vero("modello"),
            modoFatturazione = m.testo("modoFatturazione").lowercase().takeIf { it in setOf("ore", "corpo", "misto") },
            idContratto = m.testo("idContratto"),
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

/**
 * Quello che il foglio (dalla fase 1 il server) sa oltre ai rapportini.
 *
 * [clienti] sono i clienti attivi: gli archiviati stanno in [archiviati], cosi'
 * non si propongono nei rapportini nuovi. [commesse] le ha tutte, anche
 * archiviate e modelli (vedi [Commessa.aperta]).
 */
data class Anagrafiche(
    val clienti: List<Cliente> = emptyList(),
    val commesse: List<Commessa> = emptyList(),
    val gruppi: List<Gruppo> = emptyList(),
    /** La scheda Impostazioni: CHIAVE -> valore, sempre testo ("0.76", "SI"). Le chiavi sono in [Anagrafiche.Companion]. */
    val impostazioni: Map<String, String> = emptyMap(),
    // ---- il gestionale (fase 1) ----
    /** I fornitori attivi (uno che e' anche cliente sta in tutti e due gli elenchi). */
    val fornitori: List<Cliente> = emptyList(),
    /** Clienti e fornitori archiviati. */
    val archiviati: List<Cliente> = emptyList(),
    val referenti: List<Referente> = emptyList(),
    val sedi: List<Sede> = emptyList(),
    val prestazioni: List<Prestazione> = emptyList(),
    /** Solo nome e ruolo: per responsabili, persone e la frase "Chiedi a". */
    val utenti: List<Utente> = emptyList(),
    val numerazioni: List<Numerazione> = emptyList(),
    /** Fase 6 (§17.2): con mezzi >= 1 i mezzi e i miei strumenti, per il telefono senza rete. */
    val mezzi: List<MezzoBreve> = emptyList(),
    val mieiStrumenti: List<StrumentoMio> = emptyList(),
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
            ?: archiviati.firstOrNull { id.isNotBlank() && it.id == id }
            ?: nome.takeIf { it.isNotBlank() }?.let { n ->
                val chiave = normalizza(n)
                clienti.firstOrNull { c -> (listOf(c.nome) + c.alias).any { normalizza(it) == chiave } }
            }

    /** Il cliente di una commessa. */
    fun clienteDi(commessa: Commessa?): Cliente? = commessa?.let { cliente(it.idCliente) }

    /** Clienti e fornitori, attivi e archiviati, una volta sola ciascuno. */
    val soggetti: List<Cliente> get() = (clienti + fornitori + archiviati).distinctBy { it.id }

    /** Un cliente o un fornitore per codice, anche archiviato. */
    fun soggetto(id: String): Cliente? = if (id.isBlank()) null else soggetti.firstOrNull { it.id == id }

    fun referentiDi(idSoggetto: String): List<Referente> = referenti.filter { it.idSoggetto == idSoggetto }.sortedBy { it.ordine }
    fun sediDi(idSoggetto: String, ancheArchiviate: Boolean = false): List<Sede> =
        sedi.filter { it.idSoggetto == idSoggetto && (ancheArchiviate || !it.archiviata) }
    fun sede(id: String): Sede? = if (id.isBlank()) null else sedi.firstOrNull { it.id == id }
    fun prestazioniDi(idCommessa: String): List<Prestazione> =
        prestazioni.filter { it.idCommessa.equals(idCommessa, ignoreCase = true) }.sortedWith(compareBy({ it.ordine }, { it.id }))
    fun utente(id: String): Utente? = if (id.isBlank()) null else utenti.firstOrNull { it.id == id }
    fun numerazione(tipo: String): Numerazione? = numerazioni.firstOrNull { it.tipo == tipo }

    /** Il nome del titolare per "Chiedi a Manuel": il primo titolare attivo. */
    val titolare: String get() = utenti.firstOrNull { it.ruolo == Ruoli.TITOLARE && it.attivo }?.nome?.substringBefore(' ').orEmpty()

    /**
     * Un altro soggetto con lo stesso nome, uno degli altri nomi, o la stessa
     * partita IVA: il doppione da aprire invece di crearne uno nuovo.
     */
    fun doppioneDi(nome: String, alias: List<String>, partitaIva: String, tranne: String = ""): Cliente? {
        val chiavi = (listOf(nome) + alias).map(::normalizza).filter { it.isNotEmpty() }.toSet()
        val piva = partitaIva.filter { it.isLetterOrDigit() }.uppercase()
        return soggetti.firstOrNull { s ->
            s.id != tranne && (
                (listOf(s.nome) + s.alias).any { normalizza(it) in chiavi } ||
                    (piva.isNotEmpty() && s.partitaIva.filter { it.isLetterOrDigit() }.uppercase() == piva)
                )
        }
    }

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
        numerazione("commessa")?.let { n -> if (n.formato.isNotBlank()) return n.prossimoNumero(anno) }
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
        val IMPOSTAZIONI_NUMERICHE = setOf(EURO_KM, COSTO_ORARIO, "IVA", "EPPI_INTEGRATIVO", "RITENUTA", "PREVENTIVO_VALIDITA_GIORNI")

        /** L'errore di un'impostazione numerica scritta male. */
        fun erroreNumerica(chiave: String): String = when (chiave) {
            EURO_KM -> "Il rimborso km dev'essere un numero, per esempio 0,76"
            COSTO_ORARIO -> "Il costo orario dev'essere un numero, per esempio 22"
            "PREVENTIVO_VALIDITA_GIORNI" -> "I giorni devono essere un numero, per esempio 30"
            else -> "Dev'essere un numero, per esempio 22"
        }

        /** "Rossi Impianti S.r.l." e "rossi impianti srl" sono lo stesso cliente. */
        fun normalizza(s: String): String = s.lowercase().replace(Regex("[^a-z0-9]"), "")

        /** 26ST047: anno, ST (Studio Tecnico GM), numero. */
        private val CODICE_COMMESSA = Regex("""^\d{2}ST(\d+)$""")

        fun daJson(o: JSONObject): Anagrafiche {
            val clienti = o.optJSONArray("clienti").oggetti().map { Cliente.daJson(it) }.filter { it.nome.isNotBlank() }
            val fornitori = o.optJSONArray("fornitori").oggetti().map { Cliente.daJson(it, comeFornitore = true) }.filter { it.nome.isNotBlank() }
            val dichiarati = o.optJSONArray("archiviati").oggetti().map { Cliente.daJson(it).copy(archiviato = true) }
            // Con "archiviati: true" il server puo' mandarli dentro gli elenchi, col loro segno.
            val archiviati = (dichiarati + (clienti + fornitori).filter { it.archiviato }).distinctBy { it.id }
            return daJsonCon(o, clienti.filterNot { it.archiviato }, fornitori.filterNot { it.archiviato }, archiviati)
        }

        private fun daJsonCon(o: JSONObject, clientiAttivi: List<Cliente>, fornitoriAttivi: List<Cliente>, archiviati: List<Cliente>) = Anagrafiche(
            clienti = clientiAttivi,
            fornitori = fornitoriAttivi,
            archiviati = archiviati,
            referenti = o.optJSONArray("referenti").oggetti().map(Referente::daJson),
            sedi = o.optJSONArray("sedi").oggetti().map(Sede::daJson),
            prestazioni = o.optJSONArray("prestazioni").oggetti().map(Prestazione::daJson),
            utenti = o.optJSONArray("utenti").oggetti().map(Utente::daJson),
            numerazioni = o.optJSONArray("numerazioni").oggetti().map(Numerazione::daJson).ifEmpty {
                // Il server puo' mandarle come oggetto { commessa: {...}, rapportino: {...} }.
                o.optJSONObject("numerazioni")?.let { n ->
                    n.keys().asSequence().mapNotNull { k -> n.optJSONObject(k)?.let { x -> Numerazione.daJson(x).let { if (it.tipo.isBlank()) it.copy(tipo = k) else it } } }.toList()
                }.orEmpty()
            },
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
            mezzi = o.optJSONArray("mezzi").oggetti().map(MezzoBreve::daJson).filter { it.id.isNotBlank() },
            mieiStrumenti = o.optJSONArray("mieiStrumenti").oggetti().map(StrumentoMio::daJson).filter { it.id.isNotBlank() },
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
        .put("fornitori", JSONArray().apply { fornitori.forEach { put(it.aJson()) } })
        .put("archiviati", JSONArray().apply { archiviati.forEach { put(it.aJson()) } })
        .put("referenti", JSONArray().apply { referenti.forEach { put(it.aJson()) } })
        .put("sedi", JSONArray().apply { sedi.forEach { put(it.aJson()) } })
        .put("prestazioni", JSONArray().apply { prestazioni.forEach { put(it.aJson()) } })
        .put("utenti", JSONArray().apply { utenti.forEach { put(it.aJson()) } })
        .put("numerazioni", JSONArray().apply { numerazioni.forEach { put(it.aJson()) } })
        .put("mezzi", JSONArray().apply { mezzi.forEach { put(it.aJson()) } })
        .put("mieiStrumenti", JSONArray().apply { mieiStrumenti.forEach { put(it.aJson()) } })
}
