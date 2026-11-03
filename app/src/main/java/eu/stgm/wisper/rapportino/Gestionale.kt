package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId

/*
 * I pezzi del gestionale (fase 1, docs/gestionale/architettura.md): chi entra e
 * cosa puo' fare, referenti, sedi e impianti, prestazioni delle commesse, la
 * dashboard, il registro, le numerazioni, le copie. Solo dati: i conti restano
 * in Conti.kt e sul server.
 */

/** I moduli del menu con la chiave del server, e le due chiavi speciali. */
object Moduli {
    const val DASHBOARD = "dashboard"
    const val CLIENTI = "clienti"
    const val COMMESSE = "commesse"
    /** I progetti delle commesse (03/11/2026, docs/gestionale/progetti.md): nel menu subito dopo le commesse. */
    const val PROGETTI = "progetti"
    const val PREVENTIVI = "preventivi"
    const val ATTIVITA = "attivita"
    const val RAPPORTINI = "rapportini"
    /** Spese e trasferte (fase 3, voce 7). */
    const val SPESE = "spese"
    const val FATTURAZIONE = "fatturazione"
    /** Banche e scadenze (fase 4, voce 9). */
    const val BANCHE = "banche"
    /** Documenti (fase 5, voce 11): archivio, revisioni, scadenze, modelli. */
    const val DOCUMENTI = "documenti"
    /** Ticket e assistenza (fase 5, voce 12): ticket, contratti, storico degli impianti. */
    const val TICKET = "ticket"
    const val AMMINISTRAZIONE = "amministrazione"

    /** Fase 6 (fase6.md §11.2): persone e risorse umane (voce 10), mezzi e attrezzature (13), collaboratori esterni (16). */
    const val PERSONE = "persone"
    const val MEZZI = "mezzi"
    const val COLLABORATORI = "collaboratori"

    /** Fase 7 (fase7.md §11.2): WhatsApp e comunicazioni (voce 14), portale clienti (15). */
    const val COMUNICAZIONI = "comunicazioni"
    const val PORTALE = "portale"

    /** Fase 8 (fase8.md §4.3, §15): Integrazioni (voce 17), dopo Collaboratori esterni. */
    const val INTEGRAZIONI = "integrazioni"

    /** Tariffe, totali, costi orari, budget in euro, margini. */
    const val COSTI = "costi"

    /** Fase 6: i dati riservati delle persone (costo dell'anno, giudizi, cedolini, tipo delle malattie). */
    const val RISERVATI = "riservati"

    /** Quelli che funzionano nella fase 1, nell'ordine del menu. */
    val FASE1 = listOf(DASHBOARD, CLIENTI, COMMESSE, RAPPORTINI, FATTURAZIONE, AMMINISTRAZIONE)

    /**
     * Quelli che funzionano, nell'ordine del menu (Persone dopo Banche, Mezzi dopo Ticket, Collaboratori dopo Mezzi; dal
     * 03/11/2026 Progetti dopo Commesse).
     */
    val FUNZIONANTI = listOf(DASHBOARD, CLIENTI, COMMESSE, PROGETTI, PREVENTIVI, ATTIVITA, RAPPORTINI, SPESE, FATTURAZIONE, BANCHE, PERSONE, DOCUMENTI, TICKET, MEZZI, COMUNICAZIONI, PORTALE, COLLABORATORI, INTEGRAZIONI, AMMINISTRAZIONE)

    /** Fatturazione e Banche si vedono solo col modulo e col permesso dei soldi (§15.1). */
    val CON_SOLDI = setOf(FATTURAZIONE, BANCHE)
}

/** I quattro ruoli, con la frase che li spiega (docs/gestionale/fase1-schermate.md §7). */
object Ruoli {
    const val TITOLARE = "titolare"
    const val AMMINISTRAZIONE = "amministrazione"
    const val COLLABORATORE = "collaboratore"
    const val LETTURA = "lettura"

    /** Fase 6 (fase6.md §8.4): un collaboratore esterno che vede solo le sue cose. */
    const val ESTERNO = "esterno"

    /** I quattro ruoli dello studio (l'esterno si invita dal collaboratore, non da qui). */
    val ELENCO = listOf(TITOLARE, AMMINISTRAZIONE, COLLABORATORE, LETTURA)

    fun nome(ruolo: String): String = when (ruolo) {
        TITOLARE -> "Titolare"
        AMMINISTRAZIONE -> "Amministrazione"
        COLLABORATORE -> "Collaboratore"
        LETTURA -> "Lettura"
        ESTERNO -> "Esterno"
        else -> ruolo.replaceFirstChar { it.uppercase() }
    }

    fun frase(ruolo: String): String = when (ruolo) {
        TITOLARE -> "Vede e cambia tutto, anche utenti e permessi."
        AMMINISTRAZIONE -> "Clienti, commesse, fatture e soldi. Non cambia utenti e permessi."
        COLLABORATORE -> "Scrive i suoi rapportini e vede le commesse, senza importi."
        LETTURA -> "Vede tutto, non cambia niente. Per il commercialista."
        ESTERNO -> "Un collaboratore esterno: vede solo le commesse dei suoi incarichi e le sue cose."
        else -> ""
    }
}

/** Chi e' entrato (o una persona dell'elenco degli utenti). */
data class Utente(
    val id: String,
    val nome: String,
    val email: String = "",
    val ruolo: String = Ruoli.TITOLARE,
    val attivo: Boolean = true,
    /** Istante ISO dell'ultimo accesso, vuoto se mai. */
    val ultimoAccesso: String = "",
    /** Fase 6 (§5.2): la scheda della persona; per un esterno il collaboratore di cui fa parte. */
    val idPersona: String = "",
    val idSoggetto: String = "",
) {
    /** "MG" per Manuel Gasparotto. */
    val iniziali: String
        get() = nome.split(' ', '.', '-').filter { it.isNotBlank() && it.first().isLetterOrDigit() }
            .take(2).joinToString("") { it.take(1) }.uppercase().ifBlank { "?" }

    fun aJson(): JSONObject = JSONObject().put("id", id).put("nome", nome).put("email", email)
        .put("ruolo", ruolo).put("attivo", attivo).put("ultimoAccesso", ultimoAccesso)
        .apply { if (idPersona.isNotBlank()) put("idPersona", idPersona); if (idSoggetto.isNotBlank()) put("idSoggetto", idSoggetto) }

    companion object {
        fun daJson(o: JSONObject) = Utente(
            id = o.testo("id"),
            nome = o.testo("nome"),
            email = o.testo("email"),
            ruolo = o.testo("ruolo").ifBlank { Ruoli.COLLABORATORE },
            attivo = o.booleanoONull("attivo") ?: (o.numero("attivo")?.let { it != 0.0 } ?: true),
            ultimoAccesso = o.testo("ultimoAccesso").ifBlank { o.testo("ultimo_accesso") },
            idPersona = o.testo("idPersona"),
            idSoggetto = o.testo("idSoggetto"),
        )
    }
}

/**
 * I permessi di chi e' entrato: 0 niente, 1 vede, 2 modifica, per modulo.
 * Le app nascondono voci e pulsanti; la garanzia la da' il server.
 */
data class Permessi(val livelli: Map<String, Int>) {
    fun livello(modulo: String): Int = livelli[modulo] ?: 0
    fun vede(modulo: String): Boolean = livello(modulo) >= 1 && (modulo !in Moduli.CON_SOLDI || livello(Moduli.COSTI) >= 1)
    fun modifica(modulo: String): Boolean = livello(modulo) >= 2 && (modulo !in Moduli.CON_SOLDI || livello(Moduli.COSTI) >= 1)

    /** Tariffe, totali, costi e margini: senza, il server non li manda e l'app non li mostra. */
    val costi: Boolean get() = vede(Moduli.COSTI)

    fun aJson(): JSONObject = JSONObject().apply { livelli.forEach { (k, v) -> put(k, v) } }

    companion object {
        /** Tutto: il foglio di prima (un codice solo) e il titolare. */
        val TUTTO = Permessi((Moduli.FUNZIONANTI + Moduli.COSTI + Moduli.RISERVATI).associateWith { 2 })

        fun daJson(o: JSONObject?): Permessi =
            Permessi(o?.keys()?.asSequence()?.associateWith { k -> o.optInt(k, 0).coerceIn(0, 2) } ?: emptyMap())

        /** I valori iniziali dell'accordo (architettura.md §3), gli stessi del server. */
        fun iniziali(ruolo: String): Permessi {
            val p = (Moduli.FUNZIONANTI + Moduli.COSTI + Moduli.RISERVATI).associateWith { 0 }.toMutableMap()
            when (ruolo) {
                Ruoli.TITOLARE -> p.keys.forEach { p[it] = 2 }
                Ruoli.AMMINISTRAZIONE -> {
                    Moduli.FUNZIONANTI.forEach { p[it] = 2 }
                    p[Moduli.AMMINISTRAZIONE] = 1
                    p[Moduli.COSTI] = 2
                }
                Ruoli.COLLABORATORE -> {
                    p[Moduli.DASHBOARD] = 1; p[Moduli.CLIENTI] = 1; p[Moduli.COMMESSE] = 1; p[Moduli.PROGETTI] = 1; p[Moduli.RAPPORTINI] = 2
                    p[Moduli.ATTIVITA] = 2; p[Moduli.SPESE] = 2
                    // Fase 5 (architettura.md §16.1): i documenti in lettura, i ticket in scrittura.
                    p[Moduli.DOCUMENTI] = 1; p[Moduli.TICKET] = 2
                    // Fase 6 (§17.18): la rubrica e la sua scheda, i mezzi e gli strumenti che ha.
                    p[Moduli.PERSONE] = 1; p[Moduli.MEZZI] = 1
                    // Fase 7 (fase7.md §11.2): le sue comunicazioni sì, il portale no.
                    p[Moduli.COMUNICAZIONI] = 2
                }
                Ruoli.LETTURA -> {
                    Moduli.FUNZIONANTI.forEach { p[it] = 1 }
                    p[Moduli.AMMINISTRAZIONE] = 0
                    p[Moduli.COSTI] = 1
                }
                // Fase 6 (§17.18): solo le sue cose; mai persone, mezzi, clienti, soldi, amministrazione.
                Ruoli.ESTERNO -> {
                    p[Moduli.DASHBOARD] = 1; p[Moduli.COMMESSE] = 1; p[Moduli.PROGETTI] = 1; p[Moduli.RAPPORTINI] = 2; p[Moduli.ATTIVITA] = 2
                    p[Moduli.SPESE] = 2; p[Moduli.TICKET] = 2; p[Moduli.DOCUMENTI] = 1; p[Moduli.COLLABORATORI] = 1
                }
            }
            return Permessi(p)
        }
    }
}

/**
 * Quello che `io` dice dell'interfaccia dalla fase 3 (§14.1): chi vede il
 * segmento Da approvare e il pulsante Segna rimborsato, la regola delle
 * approvazioni, le ore di una giornata. Null = il server non l'ha detto (una
 * versione vecchia, o non ancora letto): vale la regola dei ruoli.
 */
data class Interfaccia(
    val puoApprovare: Boolean? = null,
    val puoSegnareRimborsi: Boolean? = null,
    /** "collaboratori" | "tutti" | "nessuno". */
    val approvazione: String = "collaboratori",
    val oreGiornaliere: Double = 8.0,
    /** Fase 5 (§16.2): chi approva le revisioni dei documenti, chi chiude i ticket, i link per i clienti, i MB di un file. */
    val puoApprovareDocumenti: Boolean? = null,
    val puoChiudereTicket: Boolean? = null,
    val condivisioneCollegata: Boolean = false,
    val fileMaxMb: Int = 50,
    /** Fase 6 (§17.2): la persona di chi è entrato ("" per l'esterno), chi approva le assenze, chi vede i riservati. */
    val idPersona: String = "",
    val puoApprovareAssenze: Boolean? = null,
    val vedeRiservati: Boolean = false,
    /** Per l'esterno: il collaboratore di cui fa parte (idSoggetto, nome). */
    val esternoId: String = "",
    val esternoNome: String = "",
    /** "avviso" (lo strumento scaduto si usa confermando) o "blocco" (non si sceglie). */
    val taraturaBlocco: String = "avviso",
    /** Fase 7 (fase7.md §10.4): il portale collegato e acceso, l'app di WhatsApp, le notifiche nuove, i caratteri di un WhatsApp. */
    val portaleCollegato: Boolean = false,
    val portaleAttivo: Boolean = false,
    /** "business", "normale" o "chiedi". */
    val whatsappApp: String = "chiedi",
    val notificheNuove: Int = 0,
    val whatsappTestoMax: Int = 1000,
    /** Fase 8 (fase8.md §13.7): le funzioni spente (via dal menu), il nome breve, il logo, l'ora del server. */
    val funzioniSpente: List<String> = emptyList(),
    val nomeBreve: String = "",
    val logo: String = "",
    val oraServer: String = "",
) {
    fun aJson(): JSONObject = JSONObject()
        .put("puoApprovare", puoApprovare ?: JSONObject.NULL)
        .put("puoSegnareRimborsi", puoSegnareRimborsi ?: JSONObject.NULL)
        .put("approvazione", approvazione)
        .put("oreGiornaliere", oreGiornaliere)
        .put("puoApprovareDocumenti", puoApprovareDocumenti ?: JSONObject.NULL)
        .put("puoChiudereTicket", puoChiudereTicket ?: JSONObject.NULL)
        .put("condivisioneCollegata", condivisioneCollegata)
        .put("fileMaxMb", fileMaxMb)
        .put("idPersona", idPersona.ifBlank { null } ?: JSONObject.NULL)
        .put("puoApprovareAssenze", puoApprovareAssenze ?: JSONObject.NULL)
        .put("vedeRiservati", vedeRiservati)
        .put("esterno", if (esternoId.isBlank()) JSONObject.NULL else JSONObject().put("idSoggetto", esternoId).put("nome", esternoNome))
        .put("taraturaBlocco", taraturaBlocco)
        .put("portaleCollegato", portaleCollegato)
        .put("portaleAttivo", portaleAttivo)
        .put("whatsappApp", whatsappApp)
        .put("notificheNuove", notificheNuove)
        .put("whatsappTestoMax", whatsappTestoMax)
        .put("funzioniSpente", JSONArray(funzioniSpente))
        .put("nomeBreve", nomeBreve)
        .put("logo", logo)
        .put("oraServer", oraServer)

    companion object {
        fun daJson(o: JSONObject?) = Interfaccia(
            puoApprovare = o?.booleanoONull("puoApprovare"),
            puoSegnareRimborsi = o?.booleanoONull("puoSegnareRimborsi"),
            approvazione = o?.testo("approvazione")?.ifBlank { null } ?: "collaboratori",
            oreGiornaliere = o?.numero("oreGiornaliere") ?: 8.0,
            puoApprovareDocumenti = o?.booleanoONull("puoApprovareDocumenti"),
            puoChiudereTicket = o?.booleanoONull("puoChiudereTicket"),
            condivisioneCollegata = o?.vero("condivisioneCollegata") == true,
            fileMaxMb = o?.numero("fileMaxMb")?.toInt() ?: 50,
            idPersona = o?.testo("idPersona").orEmpty(),
            puoApprovareAssenze = o?.booleanoONull("puoApprovareAssenze"),
            vedeRiservati = o?.vero("vedeRiservati") == true,
            esternoId = o?.optJSONObject("esterno")?.testo("idSoggetto").orEmpty(),
            esternoNome = o?.optJSONObject("esterno")?.testo("nome").orEmpty(),
            taraturaBlocco = o?.testo("taraturaBlocco")?.ifBlank { null } ?: "avviso",
            portaleCollegato = o?.vero("portaleCollegato") == true,
            portaleAttivo = o?.vero("portaleAttivo") == true,
            whatsappApp = o?.testo("whatsappApp")?.ifBlank { null } ?: "chiedi",
            notificheNuove = o?.numero("notificheNuove")?.toInt() ?: 0,
            whatsappTestoMax = o?.numero("whatsappTestoMax")?.toInt()?.takeIf { it > 0 } ?: 1000,
            funzioniSpente = o?.optJSONArray("funzioniSpente")?.stringhe().orEmpty(),
            nomeBreve = o?.testo("nomeBreve").orEmpty(),
            logo = o?.testo("logo").orEmpty(),
            oraServer = o?.testo("oraServer").orEmpty(),
        )
    }
}

/** Chi e' entrato su questo telefono e cosa puo' fare. */
data class Sessione(
    val utente: Utente,
    val permessi: Permessi,
    /** Vero quando il server ha detto che l'accesso e' scaduto o revocato: si torna alla schermata di accesso. */
    val scaduta: Boolean = false,
    val interfaccia: Interfaccia = Interfaccia(),
) {
    private val approvaPerRuolo: Boolean
        get() = utente.ruolo == Ruoli.TITOLARE || utente.ruolo == Ruoli.AMMINISTRAZIONE

    /** Il segmento Da approvare: titolare e amministrazione col modulo in scrittura (§14.1), o quello che dice il server. */
    val puoApprovare: Boolean
        get() = interfaccia.puoApprovare ?: (approvaPerRuolo && (permessi.modifica(Moduli.RAPPORTINI) || permessi.modifica(Moduli.SPESE)))

    /** Segna rimborsato: solo titolare e amministrazione, con le spese in scrittura. */
    val puoSegnareRimborsi: Boolean
        get() = interfaccia.puoSegnareRimborsi ?: (approvaPerRuolo && permessi.modifica(Moduli.SPESE))

    /** Fase 5 (§16.19): approvare le revisioni, titolare e amministrazione coi documenti in scrittura. */
    val puoApprovareDocumenti: Boolean
        get() = interfaccia.puoApprovareDocumenti ?: (approvaPerRuolo && permessi.modifica(Moduli.DOCUMENTI))

    /** Chiudere i ticket (e scegliere come si fatturano): titolare e amministrazione, coi ticket in scrittura e i soldi. */
    val puoChiudereTicket: Boolean
        get() = interfaccia.puoChiudereTicket ?: (approvaPerRuolo && permessi.modifica(Moduli.TICKET) && permessi.costi)

    /** Il collaboratore vede e cambia solo i suoi ticket (§16.19). */
    val collaboratore: Boolean get() = utente.ruolo == Ruoli.COLLABORATORE

    /** Fase 6: un collaboratore esterno (vede solo le sue cose: menu ridotto, "La tua scheda"). */
    val esterno: Boolean get() = utente.ruolo == Ruoli.ESTERNO

    /** Fase 6: la persona di chi è entrato (vuota per l'esterno e per i server di prima). */
    val idPersona: String get() = interfaccia.idPersona

    /** Fase 6 (§6.4): approvare le assenze, titolare e amministrazione con le persone in scrittura. */
    val puoApprovareAssenze: Boolean
        get() = interfaccia.puoApprovareAssenze ?: (approvaPerRuolo && permessi.modifica(Moduli.PERSONE))

    /** Fase 6: chi vede i dati riservati (di base solo il titolare). */
    val vedeRiservati: Boolean get() = interfaccia.vedeRiservati || permessi.livello(Moduli.RISERVATI) >= 1

    /** Lo stato che avra' una riga scritta adesso da chi e' entrato, per mostrarla subito senza rete. */
    val statoPrevisto: String get() = FilaOreSpese.statoPrevisto(interfaccia.approvazione, utente.ruolo)

    companion object {
        val NESSUNA = Sessione(Utente("", ""), Permessi(emptyMap()))
    }
}

/** Una persona da chiamare presso un cliente o un fornitore. */
data class Referente(
    val id: String,
    val idSoggetto: String,
    val nome: String,
    val ruolo: String = "",
    val email: String = "",
    val telefono: String = "",
    val note: String = "",
    val ordine: Int = 0,
    /** Fase 7 (fase7.md §10.4): l'accesso al portale e le sue parole (Attivo, Invitato, Senza accesso, Tolto). */
    val portale: Boolean = false,
    val statoPortale: String = "",
    /** Paga le fatture: a lui (e solo a lui) i promemoria di pagamento (§3.15). */
    val pagamenti: Boolean = false,
    /** Il numero per WhatsApp, se diverso dal telefono. */
    val whatsapp: String = "",
    /** Ha detto di sì a WhatsApp (§3.13). */
    val whatsappOk: Boolean = false,
    val ultimoAccesso: String = "",
) {
    fun aJson(): JSONObject = JSONObject().put("id", id).put("soggettoId", idSoggetto).put("nome", nome)
        .put("ruolo", ruolo).put("email", email).put("telefono", telefono).put("note", note).put("ordine", ordine)
        .put("portale", portale).put("statoPortale", statoPortale).put("pagamenti", pagamenti).put("whatsapp", whatsapp)
        .put("whatsappOk", whatsappOk).put("ultimoAccesso", ultimoAccesso)

    companion object {
        fun daJson(o: JSONObject) = Referente(
            id = o.testo("id"),
            idSoggetto = o.testo("soggettoId").ifBlank { o.testo("idSoggetto") }.ifBlank { o.testo("soggetto_id") },
            nome = o.testo("nome"),
            ruolo = o.testo("ruolo"),
            email = o.testo("email"),
            telefono = o.testo("telefono"),
            note = o.testo("note"),
            ordine = o.optInt("ordine", 0),
            portale = o.vero("portale"),
            statoPortale = o.testo("statoPortale"),
            pagamenti = o.vero("pagamenti"),
            whatsapp = o.testo("whatsapp"),
            whatsappOk = o.vero("whatsappOk"),
            ultimoAccesso = o.testo("ultimoAccesso"),
        )
    }
}

/** Una sede o un impianto di un cliente (dove si lavora). */
data class Sede(
    val id: String,
    val idSoggetto: String,
    /** "sede" o "impianto". */
    val tipo: String = "sede",
    val nome: String,
    val indirizzo: String = "",
    val cap: String = "",
    val citta: String = "",
    val provincia: String = "",
    val note: String = "",
    val archiviata: Boolean = false,
    // ---- fase 5 (§16.2): i dati dell'impianto, tutti facoltativi
    val categoria: String = "",
    val categoriaNome: String = "",
    val sedePadreId: String = "",
    val matricola: String = "",
    val potenza: String = "",
    val tensione: String = "",
    val messaInServizio: String = "",
    val ambiente: String = "",
    val referenteId: String = "",
    val datiTecnici: String = "",
) {
    val impianto: Boolean get() = tipo.equals("impianto", ignoreCase = true)

    /** "Via Roma 40, Zanè (VI)". */
    val indirizzoCompleto: String
        get() = listOf(indirizzo, listOf(cap, citta).filter { it.isNotBlank() }.joinToString(" ") + (if (provincia.isNotBlank()) " ($provincia)" else ""))
            .map { it.trim() }.filter { it.isNotBlank() }.joinToString(", ")

    fun aJson(): JSONObject = JSONObject().put("id", id).put("soggettoId", idSoggetto).put("tipo", tipo).put("nome", nome)
        .put("indirizzo", indirizzo).put("cap", cap).put("citta", citta).put("provincia", provincia)
        .put("note", note).put("archiviata", archiviata)
        .put("categoria", categoria).put("categoriaNome", categoriaNome).put("sedePadreId", sedePadreId)
        .put("matricola", matricola).put("potenza", potenza).put("tensione", tensione).put("messaInServizio", messaInServizio)
        .put("ambiente", ambiente).put("referenteId", referenteId).put("datiTecnici", datiTecnici)

    companion object {
        fun daJson(o: JSONObject) = Sede(
            id = o.testo("id"),
            idSoggetto = o.testo("soggettoId").ifBlank { o.testo("idSoggetto") }.ifBlank { o.testo("soggetto_id") },
            tipo = o.testo("tipo").lowercase().ifBlank { "sede" },
            nome = o.testo("nome"),
            indirizzo = o.testo("indirizzo"),
            cap = o.testo("cap"),
            citta = o.testo("citta"),
            provincia = o.testo("provincia"),
            note = o.testo("note"),
            archiviata = o.vero("archiviata"),
            categoria = o.testo("categoria"),
            categoriaNome = o.testo("categoriaNome"),
            sedePadreId = o.testo("sedePadreId"),
            matricola = o.testo("matricola"),
            potenza = o.testo("potenza"),
            tensione = o.testo("tensione"),
            messaInServizio = o.testo("messaInServizio"),
            ambiente = o.testo("ambiente"),
            referenteId = o.testo("referenteId"),
            datiTecnici = o.testo("datiTecnici"),
        )
    }
}

/** Una parte della commessa con il suo valore e il suo avanzamento (sopralluogo, progetto, direzione lavori). */
data class Prestazione(
    val id: String,
    val idCommessa: String,
    val nome: String,
    val descrizione: String = "",
    /** In euro; null se non si vedono i soldi o non e' scritto. */
    val valore: Double? = null,
    /** Da 0 a 100. */
    val avanzamento: Int = 0,
    val ordine: Int = 0,
) {
    /** Lo stato segue l'avanzamento: 0 da fare, 1-99 in corso, 100 fatta. */
    val stato: String get() = statoDi(avanzamento)
    val fatta: Boolean get() = avanzamento >= 100

    fun aJson(): JSONObject = JSONObject().put("id", id).put("commessaId", idCommessa).put("nome", nome)
        .put("descrizione", descrizione).put("valore", valore ?: JSONObject.NULL).put("avanzamento", avanzamento)
        .put("stato", stato).put("ordine", ordine)

    companion object {
        const val DA_FARE = "da_fare"
        const val IN_CORSO = "in_corso"
        const val FATTA = "fatta"

        fun statoDi(avanzamento: Int): String = when {
            avanzamento >= 100 -> FATTA
            avanzamento <= 0 -> DA_FARE
            else -> IN_CORSO
        }

        fun daJson(o: JSONObject) = Prestazione(
            id = o.testo("id"),
            idCommessa = o.testo("commessaId").ifBlank { o.testo("idCommessa") }.ifBlank { o.testo("commessa_id") },
            nome = o.testo("nome"),
            descrizione = o.testo("descrizione"),
            valore = o.numero("valore"),
            avanzamento = (o.numero("avanzamento") ?: 0.0).toInt().coerceIn(0, 100),
            ordine = o.optInt("ordine", 0),
        )
    }
}

/**
 * Come si numerano commesse e rapportini: `{AA}ST{NNN}`, `RAP/{AAAA}/{NNNN}`.
 * Il prossimo numero e' sempre il piu' alto gia' usato + 1.
 */
data class Numerazione(
    /** "commessa" o "rapportino". */
    val tipo: String,
    val formato: String,
    val ultimo: Int = 0,
    /** Vero se il numero riparte a gennaio. */
    val annuale: Boolean = false,
    /** Il prossimo, se lo dice il server. */
    val prossimo: String = "",
) {
    /** Il prossimo numero: quello del server se c'e', altrimenti si calcola dal formato. */
    fun prossimoNumero(anno: Int = LocalDate.now().year): String =
        prossimo.ifBlank { applica(formato, ultimo + 1, anno) }

    fun aJson(): JSONObject = JSONObject().put("tipo", tipo).put("formato", formato).put("ultimo", ultimo)
        .put("annuale", annuale).put("prossimo", prossimo)

    companion object {
        /** `{AAAA}` anno, `{AA}` anno a due cifre, `{N…}` il numero con almeno tante cifre quante N. */
        fun applica(formato: String, numero: Int, anno: Int): String =
            formato.replace("{AAAA}", anno.toString())
                .replace("{AA}", "%02d".format(anno % 100))
                .replace(Regex("""\{(N+)\}""")) { m -> numero.toString().padStart(m.groupValues[1].length, '0') }

        /** Il formato a parole: "anno a due cifre, ST, numero". */
        fun aParole(formato: String): String {
            val pezzi = Regex("""\{AAAA\}|\{AA\}|\{N+\}|[^{]+""").findAll(formato).map { it.value }.toList()
            return pezzi.mapNotNull { p ->
                when {
                    p == "{AAAA}" -> "anno"
                    p == "{AA}" -> "anno a due cifre"
                    p.startsWith("{N") -> "numero"
                    else -> p.trim().trim('/', '-', '.', ' ').ifBlank { null }
                }
            }.joinToString(", ")
        }

        fun daJson(o: JSONObject) = Numerazione(
            tipo = o.testo("tipo"),
            formato = o.testo("formato"),
            ultimo = (o.numero("ultimo") ?: 0.0).toInt(),
            annuale = o.vero("annuale"),
            prossimo = o.testo("prossimo"),
        )
    }
}

// ---------------------------------------------------------------------------------- dashboard

/**
 * Dove porta una riga della dashboard: una pagina, a volte con un id, e il filtro
 * dell'elenco ({stato: "BOZZA", a: "2026-10-14"}, {mese: "2026-10"},
 * {sezione: "prestazioni"}, {senzaRapportino: true}). [filtro] e' la forma corta
 * di una parola sola ("firmare", "ritardo") che usa il telefono.
 */
data class Collegamento(
    val pagina: String,
    val id: String = "",
    val filtro: String = "",
    val parametri: Map<String, String> = emptyMap(),
) {
    companion object {
        fun daJson(o: JSONObject?): Collegamento? = o?.let {
            val f = it.optJSONObject("filtro")
            Collegamento(
                pagina = it.testo("pagina"),
                id = it.testo("id"),
                filtro = if (f == null) it.testo("filtro") else "",
                parametri = f?.keys()?.asSequence()?.associateWith { k -> if (f.isNull(k)) "" else f.opt(k).toString() }.orEmpty(),
            )
        }
    }
}

/**
 * Una cosa da fare o da guardare. [gravita]: "urgente", "attenzione", "soldi",
 * "info". [quanto] col suo [unita] ("euro", "ore", "giorni", "rapportini",
 * "prestazioni"): il numero a destra. Senza il permesso dei soldi niente euro.
 */
data class VoceDashboard(
    val tipo: String,
    val titolo: String,
    val dettaglio: String = "",
    val quanto: Double? = null,
    val gravita: String = "info",
    val collegamento: Collegamento? = null,
    val unita: String = "euro",
    /** Fase 8 (§8.2, §13.5): la cosa di cui parla ("ticket:23"), la famiglia, l'area, e se si nasconde per 30 giorni. */
    val oggetto: String = "",
    val famiglia: String = "",
    val area: String = "",
    val nascondibile: Boolean = false,
    /** "Da approvare" in una voce sola (§8.2 punto 5): le righe del foglio. */
    val pezzi: List<PezzoDaApprovare> = emptyList(),
) {
    companion object {
        fun daJson(o: JSONObject) = VoceDashboard(
            tipo = o.testo("tipo"),
            titolo = o.testo("titolo"),
            dettaglio = o.testo("dettaglio"),
            quanto = o.numero("quanto"),
            gravita = o.testo("gravita").ifBlank { "info" },
            collegamento = Collegamento.daJson(o.optJSONObject("collegamento")),
            unita = o.testo("unita"),
            oggetto = o.testo("oggetto"),
            famiglia = o.testo("famiglia"),
            area = o.testo("area"),
            nascondibile = o.vero("nascondibile"),
            pezzi = (o.optJSONArray("pezzi") ?: o.optJSONArray("righe")).oggetti().map(PezzoDaApprovare::daJson),
        )
    }
}

/** I quattro numeri delle commesse in fondo alla dashboard. */
data class NumeriCommesse(val aperte: Int = 0, val sospese: Int = 0, val inRitardo: Int = 0, val chiuse: Int = 0) {
    companion object {
        fun daJson(o: JSONObject?) = NumeriCommesse(
            aperte = o?.optInt("aperte") ?: 0,
            sospese = o?.optInt("sospese") ?: 0,
            inRitardo = o?.optInt("inRitardo", o.optInt("ritardo", 0)) ?: 0,
            chiuse = o?.optInt("chiuse") ?: 0,
        )
    }
}

/** La pagina iniziale: cosa fare adesso, diviso in tre, e le commesse. */
data class Dashboard(
    val urgenti: List<VoceDashboard> = emptyList(),
    val settimana: List<VoceDashboard> = emptyList(),
    val pianificare: List<VoceDashboard> = emptyList(),
    val commesse: NumeriCommesse = NumeriCommesse(),
    /** Dalla fase 3 (§14.13): ore, cose da approvare, rimborsi da fare. */
    val fase3: NumeriFase3 = NumeriFase3(),
    /** Dalla fase 4 (§15.16): i soldi di fatture e banche; null per chi non li vede. */
    val fase4: NumeriFase4? = null,
    /** Dalla fase 5 (§16.18): ticket, documenti, scadenze, contratti, spazio. */
    val fase5: NumeriFase5 = NumeriFase5(),
    /** Dalla fase 6 (§17.17): persone, mezzi, collaboratori; chi è assente oggi; gli incarichi dell'esterno. */
    val fase6: NumeriFase6 = NumeriFase6(),
    val assentiOggi: List<AssenteDashboard> = emptyList(),
    val incarichiEsterno: List<Incarico> = emptyList(),
    /** Dalla fase 7 (fase7.md §11.1): portale e comunicazioni. */
    val fase7: NumeriFase7 = NumeriFase7(),
    /** Fase 8 (§8.2, §13.5): quante voci ha ogni sezione (oltre i tetti), i quattro riquadri, quelli tra cui scegliere, le nascoste. */
    val quante: Map<String, Int> = emptyMap(),
    val riquadri: List<Riquadro8>? = null,
    val riquadriPossibili: List<String> = emptyList(),
    val nascoste: Int = 0,
    /** I collegamenti in Errore (il numerino di Integrazioni, §8.6), se il server lo dice. */
    val integrazioniErrore: Int? = null,
    /** I numerini del menu con la regola sola della fase 8 (§8.6): modulo → cose che aspettano te. Null con un server di prima. */
    val numerini: Map<String, Int>? = null,
) {
    val vuota: Boolean get() = urgenti.isEmpty() && settimana.isEmpty() && pianificare.isEmpty()

    /** Le regole della fase 8: il server manda i riquadri della persona (con un server di prima no). */
    val regoleNuove: Boolean get() = riquadri != null

    companion object {
        fun daJson(o: JSONObject) = Dashboard(
            urgenti = o.optJSONArray("urgenti").oggetti().map(VoceDashboard::daJson),
            settimana = o.optJSONArray("settimana").oggetti().map(VoceDashboard::daJson),
            pianificare = o.optJSONArray("pianificare").oggetti().map(VoceDashboard::daJson),
            commesse = NumeriCommesse.daJson(o.optJSONObject("numeri")?.optJSONObject("commesse") ?: o.optJSONObject("commesse")),
            fase3 = NumeriFase3.daJson(o.optJSONObject("numeri")),
            fase4 = NumeriFase4.daJson(o.optJSONObject("numeri")?.optJSONObject("soldi")),
            fase5 = NumeriFase5.daJson(o.optJSONObject("numeri")),
            fase6 = NumeriFase6.daJson(o.optJSONObject("numeri")),
            assentiOggi = o.optJSONArray("assentiOggi").oggetti().map { AssenteDashboard(it.testo("idPersona"), it.testo("nome"), it.testo("tipoVisto").ifBlank { "Assente" }, it.testo("fino")) },
            incarichiEsterno = if (o.testo("per") == "esterno") o.optJSONArray("incarichi").oggetti().map(Incarico::daJson) else emptyList(),
            fase7 = NumeriFase7.daJson(o.optJSONObject("numeri")),
            quante = (o.optJSONObject("quante") ?: JSONObject()).let { q -> q.keys().asSequence().associateWith { q.optInt(it) } }
                .ifEmpty { listOf("urgenti", "settimana", "pianificare").mapNotNull { s -> o.optJSONObject(s + "Info")?.let { s to it.optInt("quante") } }.toMap() },
            riquadri = o.optJSONArray("riquadri")?.oggetti()?.map(Riquadro8::daJson),
            riquadriPossibili = (o.optJSONArray("riquadriDaScegliere") ?: o.optJSONArray("riquadriPossibili") ?: o.optJSONArray("riquadriDisponibili"))?.let { a ->
                (0 until a.length()).mapNotNull { i -> (a.opt(i) as? JSONObject)?.testo("chiave") ?: a.optString(i).takeIf { it.isNotBlank() } }
            }.orEmpty(),
            nascoste = o.numero("nascoste")?.toInt() ?: 0,
            integrazioniErrore = o.optJSONObject("numerini")?.let { if (it.has("integrazioni")) it.optInt("integrazioni") else if (o.has("riquadri")) 0 else null }
                ?: o.optJSONObject("numeri")?.optJSONObject("integrazioni")?.numero("errori")?.toInt(),
            numerini = o.optJSONObject("numerini")?.let { n -> n.keys().asSequence().associateWith { n.optInt(it) } },
        )
    }
}

/** Chi è assente oggi (§17.17): il tipo come lo si può vedere ("Ferie", o "Assente"). */
data class AssenteDashboard(val idPersona: String, val nome: String, val tipoVisto: String, val fino: String)

/** I numeri della fase 6 (§17.17): null quelli che il ruolo non vede. */
data class NumeriFase6(
    val personeAttive: Int? = null,
    val assentiOggi: Int = 0,
    val ferieDaApprovare: Int = 0,
    val scadenzePersone: Int = 0,
    val scadutePersone: Int = 0,
    val mezzi: Boolean = false,
    val fermi: Int = 0,
    val guastiAperti: Int = 0,
    val tarateScadute: Int = 0,
    val tarateInScadenza: Int = 0,
    val prestitiInRitardo: Int = 0,
    val scadenzeMezzi: Int = 0,
    val collaboratori: Boolean = false,
    val incarichiInCorso: Int = 0,
    val nonInRegola: Int = 0,
    val documentiInScadenza: Int = 0,
    val daValutare: Int = 0,
    val compensiDaFatturare: Double? = null,
) {
    /** Il numerino giallo di Mezzi e attrezzature (§11.1): tarature scadute, mezzi fermi, prestiti in ritardo. */
    val numerinoMezzi: Int get() = tarateScadute + fermi + prestitiInRitardo

    /** Scadenze vicine di persone, mezzi, strumenti e collaboratori (il riquadro della Dashboard). */
    val scadenzeVicine: Int get() = scadenzePersone + scadutePersone + scadenzeMezzi + documentiInScadenza

    companion object {
        fun daJson(n: JSONObject?): NumeriFase6 {
            val p = n?.optJSONObject("persone")
            val m = n?.optJSONObject("mezzi")
            val c = n?.optJSONObject("collaboratori")
            return NumeriFase6(
                personeAttive = p?.optInt("attive"), assentiOggi = p?.optInt("assentiOggi") ?: 0, ferieDaApprovare = p?.optInt("daApprovare") ?: 0,
                scadenzePersone = p?.optInt("scadenzeVicine") ?: 0, scadutePersone = p?.optInt("scadute") ?: 0,
                mezzi = m != null, fermi = m?.optInt("fermi") ?: 0, guastiAperti = m?.optInt("guastiAperti") ?: 0, tarateScadute = m?.optInt("tarateScadute") ?: 0,
                tarateInScadenza = m?.optInt("tarateInScadenza") ?: 0, prestitiInRitardo = m?.optInt("prestitiInRitardo") ?: 0, scadenzeMezzi = m?.optInt("scadenzeVicine") ?: 0,
                collaboratori = c != null, incarichiInCorso = c?.optInt("incarichiInCorso") ?: 0, nonInRegola = c?.optInt("nonInRegola") ?: 0,
                documentiInScadenza = c?.optInt("documentiInScadenza") ?: 0, daValutare = c?.optInt("daValutare") ?: 0,
                compensiDaFatturare = n?.optJSONObject("soldi")?.numero("compensiDaFatturare"),
            )
        }
    }
}

/** I numeri della fase 5 (§16.18): quelli null il ruolo non li vede. */
data class NumeriFase5(
    val ticketAperti: Int? = null,
    val ticketUrgenti: Int = 0,
    val ticketNonAssegnati: Int = 0,
    val ticketInRitardo: Int = 0,
    val interventiOggi: Int = 0,
    val risoltiDaChiudere: Int = 0,
    val programmatiDaPianificare: Int = 0,
    val documentiDaApprovare: Int? = null,
    val documentiInScadenza: Int = 0,
    val documentiScaduti: Int = 0,
    val daClassificare: Int = 0,
    val scadenzeScadute: Int? = null,
    val scadenzeEntro: Int = 0,
    val scadenzeVicine: Int = 0,
    val contrattiAttivi: Int? = null,
    val contrattiInScadenza: Int = 0,
    val liberoMb: Double? = null,
    val spazioAvviso: Boolean = false,
) {
    companion object {
        fun daJson(n: JSONObject?): NumeriFase5 {
            val t = n?.optJSONObject("ticket")
            val d = n?.optJSONObject("documenti")
            val s = n?.optJSONObject("scadenze")
            val c = n?.optJSONObject("contratti")
            val sp = n?.optJSONObject("spazio")
            return NumeriFase5(
                ticketAperti = t?.optInt("aperti"),
                ticketUrgenti = t?.optInt("urgenti") ?: 0,
                ticketNonAssegnati = t?.optInt("nonAssegnati") ?: 0,
                ticketInRitardo = t?.optInt("inRitardo") ?: 0,
                interventiOggi = t?.optInt("interventiOggi") ?: 0,
                risoltiDaChiudere = t?.optInt("risoltiDaChiudere") ?: 0,
                programmatiDaPianificare = t?.optInt("programmatiDaPianificare") ?: 0,
                documentiDaApprovare = d?.optInt("daApprovare"),
                documentiInScadenza = d?.optInt("inScadenza") ?: 0,
                documentiScaduti = d?.optInt("scaduti") ?: 0,
                daClassificare = d?.optInt("daClassificare") ?: 0,
                scadenzeScadute = s?.optInt("scadute"),
                scadenzeEntro = s?.optInt("entro") ?: 0,
                scadenzeVicine = s?.optInt("vicine") ?: 0,
                contrattiAttivi = c?.optInt("attivi"),
                contrattiInScadenza = c?.optInt("inScadenza") ?: 0,
                liberoMb = sp?.numero("liberoMb"),
                spazioAvviso = sp?.vero("avviso") == true,
            )
        }
    }
}

// ---------------------------------------------------------------------------------- amministrazione

/** Un campo cambiato, nel registro: prima e dopo come testo da leggere. */
data class CampoCambiato(val campo: String, val prima: String, val dopo: String)

/**
 * Una voce del registro attivita': chi, cosa, su cosa, prima e dopo. Non si
 * modifica. [frase] e' la frase gia' pronta se il server la manda ("ha cambiato
 * la tariffa di"), altrimenti la scrive l'app da [azione] e [tabella].
 */
data class VoceRegistro(
    val id: String,
    /** Istante ISO. */
    val quando: String,
    val chi: String,
    val azione: String = "",
    val tabella: String = "",
    val idRiga: String = "",
    /** Il nome della cosa toccata: "Rossi Impianti Srl", "RAP/2026/0142". */
    val oggetto: String = "",
    val frase: String = "",
    /** Quello che viene dopo l'oggetto: "per Linea 3", "a 26ST044". */
    val coda: String = "",
    val campi: List<CampoCambiato> = emptyList(),
    /** Una riga nuova (prima vuoto) o una tolta (dopo vuoto). */
    val nuova: Boolean = false,
    val tolta: Boolean = false,
    /** "dalla versione vecchia (ponte)", "tolto"... */
    val nota: String = "",
) {
    val istante: LocalDateTime? get() = istanteLocale(quando)

    companion object {
        fun daJson(o: JSONObject): VoceRegistro {
            val prima = o.optJSONObject("prima")
            val dopo = o.optJSONObject("dopo")
            val campi = o.optJSONArray("campi").oggetti().map { CampoCambiato(it.testo("campo"), it.testo("prima"), it.testo("dopo")) }
                .ifEmpty {
                    val chiavi = ((prima?.keys()?.asSequence()?.toList() ?: emptyList()) + (dopo?.keys()?.asSequence()?.toList() ?: emptyList())).distinct()
                    chiavi.map { k -> CampoCambiato(nomeCampo(k), prima?.let { valoreLeggibile(it, k) }.orEmpty(), dopo?.let { valoreLeggibile(it, k) }.orEmpty()) }
                }
            return VoceRegistro(
                id = o.testo("id"),
                quando = o.testo("quando"),
                chi = o.testo("chi").ifBlank { o.testo("utente") }.ifBlank { o.testo("nome") },
                azione = o.testo("azione"),
                tabella = o.testo("tabella"),
                idRiga = o.testo("idRiga").ifBlank { o.testo("id_riga") },
                oggetto = o.testo("oggetto"),
                frase = o.testo("frase"),
                coda = o.testo("coda"),
                campi = campi,
                nuova = o.has("prima") && o.isNull("prima") && !o.isNull("dopo"),
                tolta = o.has("dopo") && o.isNull("dopo") && !o.isNull("prima"),
                nota = o.testo("nota"),
            )
        }

        /** "ultima_tariffa" -> "Ultima tariffa", "partita_iva" -> "Partita IVA". */
        fun nomeCampo(k: String): String = when (k) {
            "partita_iva", "partitaIva" -> "Partita IVA"
            "codice_sdi", "codiceSdi" -> "Codice SDI"
            "pec" -> "PEC"
            "cap" -> "CAP"
            "euro_km", "EURO_KM" -> "Rimborso km"
            "COSTO_ORARIO" -> "Costo orario"
            else -> Regex("([a-z])([A-Z])").replace(k, "$1 $2").replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() }
        }

        private fun valoreLeggibile(o: JSONObject, k: String): String =
            if (o.isNull(k)) "" else when (val v = o.opt(k)) {
                is Number -> Numeri.scrivi(v.toDouble())
                is Boolean -> if (v) "sì" else "no"
                else -> v?.toString().orEmpty()
            }
    }
}

/** Una pagina del registro: le voci e se ce ne sono altre piu' vecchie. */
data class PaginaRegistro(val voci: List<VoceRegistro>, val altre: Boolean = false)

/** I filtri del registro: persona (id utente), cosa (tabella), da quanti giorni (0 = tutto). */
data class FiltroRegistro(val utente: String = "", val tabella: String = "", val giorni: Int = 7, val pagina: Int = 0)

/** Un dispositivo collegato di un utente (una sessione aperta). */
data class Dispositivo(
    val id: String,
    val nome: String,
    val app: String = "",
    /** Istante ISO dell'ultimo uso. */
    val ultimoUso: String = "",
    val questo: Boolean = false,
) {
    companion object {
        fun daJson(o: JSONObject) = Dispositivo(
            id = o.testo("id"),
            nome = o.testo("dispNome").ifBlank { o.testo("nome") }.ifBlank { o.testo("disp_nome") }.ifBlank { "Dispositivo" },
            app = o.testo("app"),
            ultimoUso = o.testo("ultimoUso").ifBlank { o.testo("ultimo_uso") },
            questo = o.vero("questo") || o.vero("questa"),
        )
    }
}

/** Un utente appena creato o con la password nuova: la password si mostra una volta sola. */
data class UtenteSalvato(val utente: Utente, val password: String = "")

/** Un file tolto, recuperabile dal cestino. */
data class FileCestino(val id: String, val nome: String, val daDove: String = "", val quando: String = "") {
    companion object {
        fun daJson(o: JSONObject) = FileCestino(
            id = o.testo("id"),
            nome = o.testo("nome").ifBlank { "File senza nome" },
            daDove = o.testo("daDove").ifBlank { o.testo("idRapportino") }.ifBlank { o.testo("idCommessa") },
            quando = o.testo("quando").ifBlank { o.testo("cestinato") },
        )
    }
}

/** Una copia di sicurezza del database. */
data class CopiaSicurezza(
    val quando: String,
    val riuscita: Boolean = true,
    /** "Sul NAS e fuori casa, su Drive", o cosa non ha funzionato. */
    val dove: String = "",
    val byte: Long = 0,
) {
    /** Il foglio riscritto dopo la copia (§12.14: foglio "ok"). */
    var foglio: Boolean = false

    companion object {
        /**
         * Dal server (§12.14): `locale` (la copia sul NAS), `fuori` (su Drive) e
         * `foglio` valgono "ok", "ok · 1 file", "errore: ..." o "postino non collegato".
         */
        fun daJson(o: JSONObject): CopiaSicurezza {
            if (!o.has("locale")) {
                return CopiaSicurezza(
                    quando = o.testo("quando"),
                    riuscita = o.booleanoONull("riuscita") ?: o.booleanoONull("ok") ?: (o.testo("esito").ifBlank { "ok" } == "ok"),
                    dove = o.testo("dove").ifBlank { o.testo("messaggio") }.ifBlank { o.testo("errore") },
                    byte = (o.numero("byte") ?: 0.0).toLong(),
                )
            }
            val locale = o.testo("locale")
            val fuori = o.testo("fuori")
            val okLocale = locale.startsWith("ok")
            val okFuori = fuori.startsWith("ok")
            val dove = when {
                !okLocale -> "Sul NAS: " + locale.removePrefix("errore:").trim()
                okFuori -> "Sul NAS e fuori casa, su Drive"
                fuori.startsWith("errore") -> "Sul NAS · fuori casa no: " + fuori.removePrefix("errore:").trim()
                else -> "Sul NAS · fuori casa no: il postino non è collegato"
            }
            return CopiaSicurezza(o.testo("quando"), riuscita = okLocale, dove = dove, byte = (o.numero("byte") ?: 0.0).toLong())
                .also { it.foglio = o.testo("foglio").startsWith("ok") }
        }
    }
}

data class StatoCopie(val ultima: CopiaSicurezza? = null, val elenco: List<CopiaSicurezza> = emptyList(), val foglioAggiornato: Boolean = false) {
    companion object {
        /** `copie {}`: le ultime copie, la piu' recente prima. */
        fun daJson(o: JSONObject): StatoCopie {
            val elenco = o.optJSONArray("copie").oggetti().map(CopiaSicurezza::daJson).sortedByDescending { it.quando }
            return StatoCopie(elenco.firstOrNull(), elenco, elenco.firstOrNull()?.foglio == true)
        }
    }
}

/** Quello che il registro delle imprese dice di una partita IVA. */
data class DatiPartitaIva(
    val valida: Boolean,
    val nome: String = "",
    val indirizzo: String = "",
    val cap: String = "",
    val citta: String = "",
    val provincia: String = "",
)

// ---------------------------------------------------------------------------------- aiuti

/** Vero per true, 1, "1", "SI": i booleani arrivano in forme diverse da foglio e database. */
internal fun JSONObject.vero(campo: String): Boolean {
    if (!has(campo) || isNull(campo)) return false
    return when (val v = opt(campo)) {
        is Boolean -> v
        is Number -> v.toDouble() != 0.0
        is String -> v.trim().lowercase() in setOf("1", "true", "si", "sì", "yes")
        else -> false
    }
}

/** Un istante ISO (con o senza fuso) nell'ora di qui. */
fun istanteLocale(testo: String): LocalDateTime? {
    if (testo.isBlank()) return null
    return runCatching { OffsetDateTime.parse(testo).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime() }.getOrNull()
        ?: runCatching { java.time.Instant.parse(testo).atZone(ZoneId.systemDefault()).toLocalDateTime() }.getOrNull()
        ?: runCatching { LocalDateTime.parse(testo.take(19)) }.getOrNull()
        ?: runCatching { LocalDate.parse(testo.take(10)).atStartOfDay() }.getOrNull()
}

internal fun JSONArray.stringhe(): List<String> = (0 until length()).map { optString(it) }.filter { it.isNotBlank() }

/** Le partite IVA italiane: undici cifre. Quelle estere (con le lettere davanti) non si controllano. */
object PartitaIva {
    /** Cosa non va, o null se va bene (o se e' estera, o vuota). */
    fun errore(testo: String): String? {
        val t = testo.trim().replace(" ", "")
        if (t.isEmpty() || !t.all { it.isDigit() }) return null
        return if (t.length != 11) "La partita IVA ha 11 cifre" else null
    }
}
