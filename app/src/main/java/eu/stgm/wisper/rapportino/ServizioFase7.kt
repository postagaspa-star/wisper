package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.LocalDateTime
import java.util.UUID

/*
 * Le azioni della fase 7 (fase7.md §10), coi nomi esatti del server, e il servizio che
 * le schermate chiamano: le letture che restano sul telefono (§3.20: Da mandare, lo
 * storico, i modelli, le notifiche, il portale dell'ultima lettura), la coda per quello
 * che si fa anche senza rete, le cose ancora in coda mostrate subito.
 */

/** Le chiamate al server della fase 7: lanciano le eccezioni di [PonteServer]. */
class Fase7(private val t: TrasportoFase5) {

    private fun corpo(azione: String) = JSONObject().put("azione", azione)
    private fun idJson(id: String): Any = PonteServer.idJson(id)
    private fun p(vararg coppie: Pair<String, String?>): List<Pair<String, String>> = coppie.mapNotNull { (k, v) -> v?.takeIf { it.isNotBlank() }?.let { k to it } }

    // -------------------------------------------------- portale (§10.1)

    suspend fun portaleJson(): JSONObject = t.leggiAzione("portale")

    suspend fun segnaVistoPortale(id: String) { t.scriviAzione(corpo("segnaVistoPortale").put("id", idJson(id))) }

    suspend fun portaleClienteJson(idCliente: String): JSONObject = t.leggiAzione("portaleCliente", listOf("idCliente" to idCliente))

    suspend fun salvaPortaleCliente(idCliente: String, portale: Boolean? = null, regole: RegolePortale? = null, importi: Boolean? = null): ClientePortale {
        val c = corpo("salvaPortaleCliente").put("idCliente", idCliente)
        portale?.let { c.put("portale", it) }
        regole?.let { c.put("regole", it.aJson()) }
        importi?.let { c.put("importi", it) }
        return ClientePortale.daJson(t.scriviAzione(c))
    }

    /** L'invito: torna il referente e "mandata" o "domani" (la quota delle email, §3.12). */
    suspend fun invitaReferente(idReferente: String?, idCliente: String?, permessi: Map<String, Int>?, sedi: List<String>?, manda: Boolean = true): Pair<ReferentePortale?, String> {
        val c = corpo("invitaReferente").put("manda", manda)
        if (!idReferente.isNullOrBlank()) c.put("idReferente", idJson(idReferente))
        if (!idCliente.isNullOrBlank()) c.put("idCliente", idCliente)
        permessi?.let { m -> c.put("permessi", JSONObject().apply { m.forEach { (k, v) -> put(k, v) } }) }
        if (sedi != null) c.put("sedi", JSONArray().apply { sedi.forEach { put(idJson(it)) } }) else c.put("sedi", JSONObject.NULL)
        val r = t.scriviAzione(c)
        return r.optJSONObject("referente")?.let(ReferentePortale::daJson) to r.testo("email")
    }

    suspend fun salvaAccessoReferente(idReferente: String, permessi: Map<String, Int>?, sedi: List<String>?, tutteLeSedi: Boolean, avvisiEmail: Boolean?): ReferentePortale? {
        val c = corpo("salvaAccessoReferente").put("idReferente", idJson(idReferente))
        permessi?.let { m -> c.put("permessi", JSONObject().apply { m.forEach { (k, v) -> put(k, v) } }) }
        if (tutteLeSedi) c.put("sedi", JSONObject.NULL) else if (sedi != null) c.put("sedi", JSONArray().apply { sedi.forEach { put(idJson(it)) } })
        avvisiEmail?.let { c.put("avvisiEmail", it) }
        val r = t.scriviAzione(c)
        return (r.optJSONObject("referente") ?: r.takeIf { it.has("id") })?.let(ReferentePortale::daJson)
    }

    suspend fun togliAccessoReferente(idReferente: String) { t.scriviAzione(corpo("togliAccessoReferente").put("idReferente", idJson(idReferente))) }

    /** Torna i nomi di chi la vedrà. Senza nessuno che possa vederla: [PonteServer.DaConfermare] (serveConferma). */
    suspend fun pubblica(c: JSONObject): List<String> = t.scriviAzione(JSONObject(c.toString()).put("azione", "pubblica")).optJSONArray("vedranno")?.stringhe().orEmpty()

    suspend fun togliDalPortale(id: String, annulla: Boolean = false) {
        val c = corpo("togliDalPortale").put("id", idJson(id))
        if (annulla) c.put("annulla", true)
        t.scriviAzione(c)
    }

    suspend fun pubblicaPrima(idCliente: String, tipo: String): List<JSONObject> = t.scriviAzione(corpo("pubblicaPrima").put("idCliente", idCliente).put("tipo", tipo)).optJSONArray("proposte").oggetti()

    suspend fun pubblicatiJson(idCliente: String? = null, tipo: String? = null, visto: String? = null): JSONObject =
        t.leggiAzione("pubblicati", p("idCliente" to idCliente, "tipo" to tipo, "visto" to visto))

    suspend fun caricamentiJson(stato: String? = null, idCliente: String? = null): JSONObject = t.leggiAzione("caricamentiPortale", p("stato" to stato, "idCliente" to idCliente))

    suspend fun accessiPortale(idCliente: String? = null, idReferente: String? = null, azione: String? = null, pagina: Int = 1): List<AccessoPortale> =
        t.leggiAzione("accessiPortale", p("idCliente" to idCliente, "idReferente" to idReferente, "gruppo" to azione, "pagina" to pagina.toString()))
            .let { (it.optJSONArray("righe") ?: it.optJSONArray("accessi")).oggetti().map(AccessoPortale::daJson) }

    suspend fun anteprimaPortale(idReferente: String): String = t.scriviAzione(corpo("anteprimaPortale").put("idReferente", idJson(idReferente))).testo("link")

    suspend fun mostraNelPortale(idTicket: String, visibile: Boolean): JSONObject = t.scriviAzione(corpo("mostraNelPortale").put("idTicket", idJson(idTicket)).put("visibile", visibile))

    /** Il controllo adesso (§3.18): "si", "no" o "non_collegato" e i millisecondi. */
    suspend fun controllaPortale(): Pair<String, Int?> = t.scriviAzione(corpo("controllaPortale")).let { it.testo("collegato") to it.numero("ms")?.toInt() }

    /** Senza [conferma] il server chiede (DaConfermare con la frase). */
    suspend fun spegniPortale(conferma: Boolean) { t.scriviAzione(corpo("spegniPortale").apply { if (conferma) put("conferma", true) }) }

    // -------------------------------------------------- comunicazioni (§10.2)

    suspend fun comunicazioniJson(filtri: List<Pair<String, String>>): JSONObject = t.leggiAzione("comunicazioni", filtri)

    suspend fun daMandareJson(): JSONObject = t.leggiAzione("daMandare")

    suspend fun preparaMessaggio(modello: String, canale: String, rif: Map<String, String>): MessaggioPronto =
        MessaggioPronto.daJson(t.leggiAzione("preparaMessaggio", listOf("modello" to modello, "canale" to canale) + rif.filterValues { it.isNotBlank() }.toList()))

    suspend fun salvaMessaggio(m: JSONObject): JSONObject = t.scriviAzione(corpo("salvaMessaggio").put("messaggio", m))

    suspend fun segnaMandato(id: String, mandato: Boolean): JSONObject = t.scriviAzione(corpo("segnaMandato").put("id", idJson(id)).put("mandato", mandato))

    suspend fun mandaEmail(m: JSONObject): Comunicazione = Comunicazione.daJson(t.scriviAzione(corpo("mandaEmail").put("messaggio", m)).optJSONObject("comunicazione") ?: JSONObject())

    suspend fun segnaWhatsapp(idReferente: String, ok: Boolean): Referente? =
        t.scriviAzione(corpo("segnaWhatsapp").put("idReferente", idJson(idReferente)).put("ok", ok)).optJSONObject("referente")?.let(Referente::daJson)

    suspend fun modelliJson(): JSONObject = t.leggiAzione("modelliMessaggi")

    suspend fun salvaModello(m: ModelloMessaggio): ModelloMessaggio {
        val o = JSONObject().put("nome", m.nome.trim()).put("canale", m.canale).put("uso", m.uso).put("oggetto", m.oggetto.trim()).put("testo", m.testo).put("attivo", m.attivo)
        if (m.chiave.isNotBlank()) o.put("chiave", m.chiave)
        return ModelloMessaggio.daJson(t.scriviAzione(corpo("salvaModelloMessaggio").put("modello", o)).optJSONObject("modello") ?: o)
    }

    suspend fun togliModello(chiave: String) { t.scriviAzione(corpo("togliModelloMessaggio").put("chiave", chiave)) }

    suspend fun nonSollecitare(idFattura: String, motivo: String): JSONObject = t.scriviAzione(corpo("nonSollecitare").put("idFattura", idJson(idFattura)).put("motivo", motivo.trim()))

    suspend fun allegaCopiaFattura(id: String, nome: String, mime: String, base64: String): JSONObject =
        t.scriviAzione(corpo("allegaCopiaFattura").put("id", idJson(id)).put("nome", nome).put("mime", mime).put("base64", base64))

    // -------------------------------------------------- notifiche (§10.3)

    suspend fun notificheJson(soloNuove: Boolean = false, pagina: Int = 1): JSONObject =
        t.leggiAzione("notifiche", buildList { if (soloNuove) add("soloNuove" to "true"); if (pagina > 1) add("pagina" to pagina.toString()) })

    suspend fun segnaLette(ids: List<String>? = null, tutte: Boolean = false): Int {
        val c = corpo("segnaLette")
        if (tutte) c.put("tutte", true) else c.put("ids", JSONArray().apply { ids.orEmpty().forEach { put(idJson(it)) } })
        return t.scriviAzione(c).optInt("nuove", 0)
    }

    suspend fun salvaPreferenzeNotifiche(telefono: Boolean) { t.scriviAzione(corpo("salvaPreferenzeNotifiche").put("telefono", telefono)) }

    suspend fun segnaMostrate(ids: List<String>) { t.scriviAzione(corpo("segnaMostrate").put("ids", JSONArray().apply { ids.forEach { put(idJson(it)) } })) }
}

/** Quello che si fa anche senza rete (§3.20): va nella coda su disco. Lo fa Archivio; nella visita guidata niente. */
interface CodaFase7 {
    fun azione(chiave: String, corpo: JSONObject)
    /** Vero se la chiave è ancora in coda (non partita): un messaggio preparato si può ancora cambiare. */
    fun presente(chiave: String): Boolean
    /** Toglie dalla coda una chiave non ancora partita (l'Annulla). Torna vero se c'era. */
    fun togli(chiave: String): Boolean
}

/**
 * Come partono dalla coda le cose della fase 7. SENZA DOPPIONI: il messaggio ha il suo
 * idLocale (ripetuto, il server torna la stessa riga), pubblica e togli ripetuti non
 * rifanno niente; un "già fatto" alla seconda volta non è un errore.
 */
class InvioFase7(private val t: TrasportoFase5, private val scaffale: Scaffale) {
    suspend fun esegui(op: CodaInvii.Operazione) {
        val c = op.corpoJson()
        val azione = c.testo("azione")
        if (azione == "segnaMandato" && c.testo("id").isBlank()) {
            // Il messaggio era nato qui: l'id del server l'ha imparato la coda quando è partito.
            val id = idDiMessaggio(c.testo("idLocaleMessaggio")) ?: throw PonteServer.Rifiutato("Il messaggio non è ancora sul server: riprova fra poco")
            c.put("id", PonteServer.idJson(id))
            c.remove("idLocaleMessaggio")
        }
        // I campi che cominciano con "_" servono solo a mostrare il messaggio sul telefono.
        c.optJSONObject("messaggio")?.let { m -> m.keys().asSequence().toList().filter { it.startsWith("_") }.forEach { m.remove(it) } }
        try {
            val r = t.scriviAzione(c)
            if (azione == "salvaMessaggio") {
                val com = r.optJSONObject("comunicazione")
                val idLocale = c.optJSONObject("messaggio")?.testo("idLocale").orEmpty()
                if (com != null && idLocale.isNotBlank()) ricorda(idLocale, com.testo("id"))
            }
        } catch (e: PonteServer.DaConfermare) {
            throw e
        } catch (e: PonteServer.Rifiutato) {
            // Ripetuta dopo che era già arrivata ("È già nel portale", "già deciso", "già tolto"): niente da rifare.
            val m = e.message.orEmpty().lowercase()
            if (azione in RIPETIBILI && m.contains("già")) return
            throw e
        }
    }

    private fun ricorda(idLocale: String, id: String) {
        if (id.isBlank()) return
        val m = scaffale.leggi("messaggi-id") ?: JSONObject()
        scaffale.scrivi("messaggi-id", JSONObject(m.toString()).put(idLocale, id))
    }

    fun idDiMessaggio(idLocale: String): String? = scaffale.leggi("messaggi-id")?.testo(idLocale)?.takeIf { it.isNotBlank() }

    companion object {
        val RIPETIBILI = setOf("pubblica", "togliDalPortale", "accettaCaricamento", "rifiutaCaricamento", "segnaVistoPortale", "nonMandare", "mostraNelPortale", "segnaMandato")
    }
}

// ---------------------------------------------------------------------------------- le cose ancora in coda

/**
 * Le cose della fase 7 scritte sul telefono e non ancora arrivate, mostrate subito (§3.20):
 * il messaggio preparato fra i preparati, la proposta usata che sparisce, la riga dello
 * storico in cima, la cosa tolta dal portale, il file deciso, la risposta nel ticket.
 * Funzioni pure: le prove le rifanno.
 */
object InCoda7 {
    private fun vive(ops: List<CodaInvii.Operazione>) = ops.filter { it.fase7 && !it.rifiutata }.map { it to it.corpoJson() }

    private fun messaggi(ops: List<CodaInvii.Operazione>) = vive(ops).filter { it.second.testo("azione") == "salvaMessaggio" }

    /** Una riga dello storico da un salvaMessaggio in coda. */
    fun comunicazioneDaCorpo(op: CodaInvii.Operazione, c: JSONObject = op.corpoJson()): Comunicazione {
        val m = c.optJSONObject("messaggio") ?: JSONObject()
        return Comunicazione(
            idLocale = m.testo("idLocale").ifBlank { op.idLocale }, quando = m.testo("quando").ifBlank { m.testo("_quando").ifBlank { op.quando } }, canale = m.testo("canale"),
            direzione = m.testo("direzione").ifBlank { "uscita" }, tipo = m.testo("tipo").ifBlank { m.testo("modello").ifBlank { "libero" } },
            cliente = m.testo("_cliente"), idCliente = m.testo("idCliente"), referente = m.testo("_referente"), idReferente = m.testo("idReferente"),
            a = m.testo("a"), testo = m.testoIntero("testo"), stato = m.testo("stato"), proposta = m.testo("proposta"),
            riferimento = Riferimento7(m.testo("_rifTipo"), m.testo("_rifId"), m.testo("_rifEtichetta")), inCoda = true,
        )
    }

    /** Le chiavi delle proposte già usate o scartate qui. */
    fun proposteUsate(ops: List<CodaInvii.Operazione>): Set<String> = vive(ops).mapNotNull { (_, c) ->
        when (c.testo("azione")) {
            "salvaMessaggio" -> c.optJSONObject("messaggio")?.testo("proposta")
            "nonMandare" -> if (c.vero("annulla")) null else c.testo("proposta")
            else -> null
        }?.takeIf { it.isNotBlank() }
    }.toSet()

    /** Gli id delle comunicazioni segnate mandate qui. */
    private fun segnateMandate(ops: List<CodaInvii.Operazione>): Set<String> = vive(ops).filter { it.second.testo("azione") == "segnaMandato" && it.second.vero("mandato") }
        .map { it.second.testo("id").ifBlank { it.second.testo("idLocaleMessaggio") } }.toSet()

    fun applicaDaMandare(d: DaMandare, ops: List<CodaInvii.Operazione>): DaMandare {
        val usate = proposteUsate(ops)
        val mandate = segnateMandate(ops)
        val inCoda = messaggi(ops).map { (op, c) -> comunicazioneDaCorpo(op, c) }
        val preparatiQui = inCoda.filter { it.canale == "whatsapp" && it.stato == "preparato" }
        val chiaviQui = inCoda.map { it.idLocale }.toSet()
        val preparati = preparatiQui + d.preparati.filter { it.idLocale !in chiaviQui && it.id !in mandate && it.idLocale !in mandate }
        fun via(l: List<Proposta>) = l.filter { it.proposta !in usate }
        return d.copy(oggi = via(d.oggi), domani = via(d.domani), proposti = via(d.proposti), preparati = preparati)
    }

    fun applicaStorico(l: List<Comunicazione>, ops: List<CodaInvii.Operazione>, canale: String = ""): List<Comunicazione> {
        val mandate = segnateMandate(ops)
        val inCoda = messaggi(ops).map { (op, c) -> comunicazioneDaCorpo(op, c) }
        val chiaviQui = inCoda.map { it.idLocale }.toSet()
        val lette = l.filter { it.idLocale.isBlank() || it.idLocale !in chiaviQui }
            .map { if (it.id in mandate || (it.idLocale.isNotBlank() && it.idLocale in mandate)) it.copy(stato = "mandato", statoVisto = "Mandato", inCoda = true) else it }
        val nuove = inCoda.filter { canale.isBlank() || it.canale == canale || (canale == "telefonata" && it.canale == "nota") }
        return nuove.sortedByDescending { it.quando } + lette
    }

    fun applicaDaGuardare(l: List<VoceDaGuardare>, ops: List<CodaInvii.Operazione>): List<VoceDaGuardare> {
        val v = vive(ops)
        val visti = v.filter { it.second.testo("azione") == "segnaVistoPortale" }.map { it.second.testo("id") }.toSet()
        val decisi = v.filter { it.second.testo("azione") in setOf("accettaCaricamento", "rifiutaCaricamento") }.map { it.second.testo("id") }.toSet()
        val risposti = v.filter { it.second.testo("azione") == "rispondiNelPortale" }.map { it.second.testo("idTicket") }.toSet()
        return l.filter { d ->
            d.id !in visti &&
                !(d.tipo == "caricamento" && d.collegamento?.id in decisi) &&
                !(d.tipo == "messaggio" && d.collegamento?.pagina == "ticket" && d.collegamento.id in risposti)
        }
    }

    fun applicaCaricamenti(l: List<Caricamento>, ops: List<CodaInvii.Operazione>): List<Caricamento> {
        val v = vive(ops)
        val accettati = v.filter { it.second.testo("azione") == "accettaCaricamento" }.map { it.second.testo("id") }.toSet()
        val rifiutati = v.filter { it.second.testo("azione") == "rifiutaCaricamento" }.associate { it.second.testo("id") to it.second.testo("motivo") }
        return l.map { c ->
            when (c.id) {
                in accettati -> c.copy(stato = "accettato", inCoda = true)
                in rifiutati.keys -> c.copy(stato = "rifiutato", motivo = rifiutati[c.id].orEmpty(), inCoda = true)
                else -> c
            }
        }
    }

    /** Le pubblicazioni tolte qui spariscono subito; quelle rimesse con Annulla tornano. */
    fun applicaPubblicati(l: List<Pubblicazione>, ops: List<CodaInvii.Operazione>): List<Pubblicazione> {
        val tolte = tolte(ops)
        return l.filter { it.id !in tolte }
    }

    private fun tolte(ops: List<CodaInvii.Operazione>): Set<String> {
        val s = LinkedHashSet<String>()
        vive(ops).filter { it.second.testo("azione") == "togliDalPortale" }.forEach { (_, c) -> if (c.vero("annulla")) s.remove(c.testo("id")) else s.add(c.testo("id")) }
        return s
    }

    /** Una cosa pubblicata o tolta qui: true messa nel portale, false tolta, null niente in coda. */
    fun portaleInCoda(tipo: String, id: String, idPubblicazione: String, ops: List<CodaInvii.Operazione>): Boolean? {
        var esito: Boolean? = null
        vive(ops).forEach { (_, c) ->
            when (c.testo("azione")) {
                "pubblica" -> if (c.testo("tipo") == tipo && c.testo("id") == id) esito = true
                "togliDalPortale" -> if (idPubblicazione.isNotBlank() && c.testo("id") == idPubblicazione) esito = c.vero("annulla")
            }
        }
        return esito
    }

    /** Le risposte nel portale scritte qui per un ticket, non ancora partite. */
    fun risposte(idTicket: String, ops: List<CodaInvii.Operazione>): List<MessaggioTicket> = vive(ops)
        .filter { (_, c) -> c.testo("azione") == "rispondiNelPortale" && c.testo("idTicket") == idTicket }
        .map { (op, c) -> MessaggioTicket(op.quando, "Studio Tecnico GM", c.testo("testo"), dalCliente = false, inCoda = true) }

    /** La visibilità nel portale di un ticket cambiata qui (Mostra nel portale). */
    fun visibileInCoda(idTicket: String, ops: List<CodaInvii.Operazione>): Boolean? =
        vive(ops).lastOrNull { (_, c) -> c.testo("azione") == "mostraNelPortale" && c.testo("idTicket") == idTicket }?.second?.vero("visibile")
}

// ---------------------------------------------------------------------------------- il servizio

/**
 * Quello che le schermate della fase 7 chiamano: le azioni come Result, le copie sul
 * telefono (§3.20), la coda.
 */
class ServizioFase7(
    trasporto: TrasportoFase5,
    val scaffale: Scaffale,
    private val esecutore: EsecutoreFase4,
    private val coda: CodaFase7,
    private val dopoScrittura: () -> Unit = {},
) {
    val f = Fase7(trasporto)
    private val t = trasporto

    private suspend fun <T> leggi(lavoro: suspend Fase7.() -> T): Result<T> = esecutore.esegui { f.lavoro() }
    private suspend fun <T> scrivi(lavoro: suspend Fase7.() -> T): Result<T> = esecutore.esegui { f.lavoro() }.also { if (it.isSuccess) dopoScrittura() }

    private fun senzaRete(e: Throwable): Boolean = e !is PonteServer.Rifiutato && e !is PonteServer.AccessoScaduto &&
        (e is IOException || e.cause is IOException || e is java.net.SocketTimeoutException || e.cause is java.net.SocketTimeoutException)

    private fun adesso(): String = LocalDateTime.now(java.time.ZoneId.of("Europe/Rome")).withNano(0).toString()

    /** Legge e tiene una copia; senza rete torna l'ultima copia con "_lettoAl" (l'ora della lettura). */
    private suspend fun leggiOCopia(nome: String, leggi: suspend Fase7.() -> JSONObject): Result<JSONObject> {
        val r = esecutore.esegui { f.leggi() }
        r.onSuccess { o -> scaffale.scrivi(nome, JSONObject(o.toString()).put("_lettoAlCopia", adesso())) }
        val e = r.exceptionOrNull() ?: return r
        if (!senzaRete(e)) return r
        val copia = scaffale.leggi(nome) ?: return r
        return Result.success(JSONObject(copia.toString()).put("_lettoAl", copia.testo("_lettoAlCopia")))
    }

    /** L'ultima copia, senza chiedere al server (i numerini del menu, la campanella senza rete). */
    fun copia(nome: String): JSONObject? = scaffale.leggi(nome)

    // -------------------------------------------------- comunicazioni

    suspend fun daMandare(): Result<DaMandare> = leggiOCopia("da-mandare") { daMandareJson() }.map(DaMandare::daJson)

    /** Lo storico: quello di base (gli ultimi, tutti i canali) resta sul telefono; i filtri no. */
    suspend fun storico(filtri: List<Pair<String, String>> = emptyList()): Result<Storico7> =
        if (filtri.isEmpty()) leggiOCopia("storico") { comunicazioniJson(emptyList()) }.map(Storico7::daJson)
        else leggi { Storico7.daJson(comunicazioniJson(filtri)) }

    /** Le comunicazioni di un cliente (con le righe calme degli accessi) o di una commessa: restano sul telefono anche loro. */
    suspend fun storicoDi(chiave: String, valore: String, conAccessi: Boolean = false): Result<Storico7> =
        leggiOCopia("storico-$chiave-$valore") { comunicazioniJson(listOf(chiave to valore) + if (conAccessi) listOf("conAccessi" to "true") else emptyList()) }.map(Storico7::daJson)

    suspend fun modelli(): Result<ModelliMessaggi> = leggiOCopia("modelli") { modelliJson() }.map(ModelliMessaggi::daJson)

    suspend fun prepara(modello: String, canale: String, rif: Map<String, String>) = leggi { preparaMessaggio(modello, canale, rif) }

    suspend fun salvaModello(m: ModelloMessaggio) = scrivi { salvaModello(m) }
    suspend fun togliModello(chiave: String) = scrivi { togliModello(chiave) }
    suspend fun segnaWhatsapp(idReferente: String, ok: Boolean) = scrivi { segnaWhatsapp(idReferente, ok) }
    suspend fun nonSollecitare(idFattura: String, motivo: String) = scrivi { nonSollecitare(idFattura, motivo) }
    suspend fun allegaCopiaFattura(id: String, nome: String, mime: String, dati: ByteArray) =
        scrivi { allegaCopiaFattura(id, nome, mime, java.util.Base64.getEncoder().encodeToString(dati)) }

    /** L'email parte subito dal postino: vuole la rete (§3.20). */
    suspend fun mandaEmail(m: JSONObject) = scrivi { mandaEmail(m.put("idLocale", m.testo("idLocale").ifBlank { nuovoId("E") })) }

    /**
     * Un messaggio WhatsApp preparato (prima di aprire WhatsApp) o mandato, una telefonata
     * o una nota: in coda col suo idLocale, parte da solo. [m] è il messaggio di
     * salvaMessaggio; i campi che cominciano con "_" restano sul telefono (per mostrarlo).
     */
    fun salvaMessaggio(m: JSONObject): String {
        val idLocale = m.testo("idLocale").ifBlank { nuovoId("M") }
        m.put("idLocale", idLocale)
        // Il momento resta sul telefono (per mostrarlo subito); al server va solo per telefonate e note,
        // annotate magari dopo: un WhatsApp parte subito e prende l'ora del server.
        m.put("_quando", adesso())
        if (m.testo("canale") != "whatsapp" && m.testo("quando").isBlank()) m.put("quando", adesso())
        coda.azione("msg:$idLocale", JSONObject().put("azione", "salvaMessaggio").put("messaggio", m))
        return idLocale
    }

    /**
     * L'hai mandato? → Sì: se il messaggio è ancora in coda si cambia lì (parte una volta,
     * già mandato); se è partito, segnaMandato col suo id (anche se lo conosce solo la coda).
     */
    fun segnaMandato(c: Comunicazione) {
        val chiave = "msg:${c.idLocale}"
        if (c.idLocale.isNotBlank() && coda.presente(chiave)) {
            val vecchio = scaffaleMessaggio(c)
            if (vecchio != null) {
                coda.azione(chiave, JSONObject().put("azione", "salvaMessaggio").put("messaggio", vecchio.put("stato", "mandato")))
                return
            }
        }
        val corpo = JSONObject().put("azione", "segnaMandato").put("mandato", true)
        if (c.id.isNotBlank()) corpo.put("id", PonteServer.idJson(c.id)) else corpo.put("idLocaleMessaggio", c.idLocale)
        coda.azione("segna:${c.chiave}", corpo)
    }

    /** Il corpo del messaggio in coda (per cambiarlo prima che parta), se c'è. */
    private val ultimiMessaggi = HashMap<String, JSONObject>()
    private fun scaffaleMessaggio(c: Comunicazione): JSONObject? = ultimiMessaggi[c.idLocale]?.let { JSONObject(it.toString()) }

    /** Come [salvaMessaggio], ricordando il corpo per poterlo segnare mandato prima che parta. */
    fun preparaWhatsapp(m: JSONObject): String {
        val id = salvaMessaggio(m)
        ultimiMessaggi[id] = JSONObject(m.toString())
        return id
    }

    /** Non mandare una proposta (con l'Annulla): in coda. */
    fun nonMandare(proposta: String, motivo: String = "") {
        val chiave = "nonmandare:$proposta"
        coda.azione(chiave, JSONObject().put("azione", "nonMandare").put("proposta", proposta).put("idLocale", nuovoId("N")).apply { if (motivo.isNotBlank()) put("motivo", motivo.trim()) })
    }

    fun annullaNonMandare(proposta: String) {
        if (coda.togli("nonmandare:$proposta")) return
        coda.azione("nonmandare:$proposta:annulla", JSONObject().put("azione", "nonMandare").put("proposta", proposta).put("annulla", true))
    }

    // -------------------------------------------------- notifiche

    suspend fun notifiche(): Result<Notifiche7> = leggiOCopia("notifiche") { notificheJson() }.map(Notifiche7::daJson)
    suspend fun segnaLette(ids: List<String>? = null, tutte: Boolean = false) = scrivi { segnaLette(ids, tutte) }
    suspend fun salvaPreferenzeNotifiche(telefono: Boolean) = scrivi { salvaPreferenzeNotifiche(telefono) }

    /** Il controllo periodico (§3.16): le nuove non ancora mostrate dal telefono. */
    suspend fun nuoveDaMostrare(): Result<List<Notifica>> = leggi { Notifiche7.daJson(notificheJson(soloNuove = true)).notifiche.filter { !it.letta && !it.mostrata } }
    suspend fun segnaMostrate(ids: List<String>) = leggi { segnaMostrate(ids) }

    // -------------------------------------------------- portale

    suspend fun portale(): Result<Portale7> = leggiOCopia("portale") { portaleJson() }.map(Portale7::daJson)

    suspend fun portaleCliente(idCliente: String): Result<ClientePortale> = leggiOCopia("portale-cliente-$idCliente") { portaleClienteJson(idCliente) }.map(ClientePortale::daJson)

    /** L'ultima lettura del cliente nel portale (chi vedrà una cosa da pubblicare, anche senza rete). */
    fun portaleClienteLetto(idCliente: String): ClientePortale? = scaffale.leggi("portale-cliente-$idCliente")?.let(ClientePortale::daJson)

    suspend fun pubblicati(idCliente: String? = null, tipo: String? = null, visto: String? = null): Result<List<Pubblicazione>> =
        (if (idCliente == null && tipo == null && visto == null) leggiOCopia("pubblicati") { pubblicatiJson() } else leggi { pubblicatiJson(idCliente, tipo, visto) })
            .map { o -> (o.optJSONArray("pubblicati") ?: o.optJSONArray("righe")).oggetti().map(Pubblicazione::daJson) }

    suspend fun caricamenti(stato: String? = null, idCliente: String? = null): Result<List<Caricamento>> =
        (if (stato == null && idCliente == null) leggiOCopia("caricamenti") { caricamentiJson() } else leggi { caricamentiJson(stato, idCliente) })
            .map { o -> (o.optJSONArray("caricamenti") ?: o.optJSONArray("righe")).oggetti().map(Caricamento::daJson) }

    suspend fun accessi(idCliente: String? = null, idReferente: String? = null, azione: String? = null) = leggi { accessiPortale(idCliente, idReferente, azione) }

    suspend fun salvaPortaleCliente(idCliente: String, portale: Boolean? = null, regole: RegolePortale? = null, importi: Boolean? = null) =
        scrivi { salvaPortaleCliente(idCliente, portale, regole, importi) }

    /** L'invito parte subito dal postino: vuole la rete (§3.20). */
    suspend fun invita(idReferente: String?, idCliente: String?, permessi: Map<String, Int>?, sedi: List<String>?) = scrivi { invitaReferente(idReferente, idCliente, permessi, sedi) }
    suspend fun salvaAccesso(idReferente: String, permessi: Map<String, Int>?, sedi: List<String>?, tutteLeSedi: Boolean, avvisiEmail: Boolean?) =
        scrivi { salvaAccessoReferente(idReferente, permessi, sedi, tutteLeSedi, avvisiEmail) }
    suspend fun togliAccesso(idReferente: String) = scrivi { togliAccessoReferente(idReferente) }
    suspend fun pubblicaPrima(idCliente: String, tipo: String) = leggi { pubblicaPrima(idCliente, tipo) }
    suspend fun anteprima(idReferente: String) = leggi { anteprimaPortale(idReferente) }
    suspend fun controlla() = leggi { controllaPortale() }
    suspend fun spegni(conferma: Boolean) = scrivi { spegniPortale(conferma) }

    /** Pubblica nel portale (in coda: parte appena c'è rete, §3.20). [conferma]: pubblica lo stesso. */
    /** [prima] = "Pubblica anche quelli di prima" (§8.3, §15): nessuna email d'avviso ai referenti. */
    fun pubblica(tipo: String, id: String, daFirmare: Boolean = false, conferma: Boolean = false, prima: Boolean = false) {
        val c = JSONObject().put("azione", "pubblica").put("tipo", tipo).put("id", PonteServer.idJson(id))
        if (daFirmare) c.put("daFirmare", true)
        if (conferma) c.put("conferma", true)
        if (prima) c.put("prima", true)
        coda.azione("pubblica:$tipo:$id", c)
    }

    /** Pubblica una fattura con la copia di cortesia (PDF): l'allegato vuole la rete, va in diretta. */
    suspend fun pubblicaConAllegato(id: String, nome: String, dati: ByteArray, conferma: Boolean) = scrivi {
        pubblica(JSONObject().put("tipo", "fattura").put("id", PonteServer.idJson(id)).put("conferma", conferma)
            .put("allegato", JSONObject().put("nome", nome).put("mime", "application/pdf").put("base64", java.util.Base64.getEncoder().encodeToString(dati))))
    }

    /** Togli dal portale, subito (in coda); [annulla] la rimette (l'Annulla dell'avviso). */
    fun togliDalPortale(idPubblicazione: String, annulla: Boolean = false) {
        if (annulla && coda.togli("togli:$idPubblicazione")) return
        val c = JSONObject().put("azione", "togliDalPortale").put("id", PonteServer.idJson(idPubblicazione))
        if (annulla) c.put("annulla", true)
        coda.azione("togli:$idPubblicazione" + if (annulla) ":annulla" else "", c)
    }

    fun segnaVisto(id: String) { coda.azione("visto:$id", JSONObject().put("azione", "segnaVistoPortale").put("id", PonteServer.idJson(id))) }

    /** Rispondi nel portale (in coda, §3.20). L'idLocale evita il doppione se la rete cade a metà. */
    fun rispondi(idTicket: String, testo: String) {
        val idLocale = nuovoId("P")
        coda.azione("risposta:$idLocale", JSONObject().put("azione", "rispondiNelPortale").put("idTicket", PonteServer.idJson(idTicket)).put("testo", testo.trim()).put("idLocale", idLocale))
    }

    fun mostraNelPortale(idTicket: String, visibile: Boolean) {
        coda.azione("mostra:$idTicket", JSONObject().put("azione", "mostraNelPortale").put("idTicket", PonteServer.idJson(idTicket)).put("visibile", visibile))
    }

    /** Accetta e archivia un file del cliente (in coda). [campi]: titolo, idCategoria, idCommessa, idSede, idTicket o soloTicket. */
    fun accettaFile(id: String, campi: JSONObject) {
        val c = JSONObject(campi.toString()).put("azione", "accettaCaricamento").put("id", PonteServer.idJson(id)).put("idLocale", nuovoId("C"))
        coda.azione("file:$id", c)
    }

    fun rifiutaFile(id: String, motivo: String) {
        coda.azione("file:$id", JSONObject().put("azione", "rifiutaCaricamento").put("id", PonteServer.idJson(id)).put("motivo", motivo.trim()).put("idLocale", nuovoId("C")))
    }

    /** Il file di un caricamento da aprire (sempre scaricato, §3.11): in cacheDir/pdf col prefisso "portale-". */
    suspend fun scaricaFile(idFile: String, nome: String, cartella: java.io.File?): Result<java.io.File> = esecutore.esegui {
        val pdf = java.io.File(cartella ?: throw PonteServer.Rifiutato("Il file qui non si apre"), "pdf").apply { mkdirs() }
        val (byte, _) = try {
            t.file(idFile)
        } catch (e: IOException) {
            throw PonteServer.Rifiutato("Si apre quando c'è rete")
        }
        java.io.File(pdf, "portale-" + nome.replace(Regex("""[\\/:*?"<>|]"""), "_").ifBlank { "file" }).apply { writeBytes(byte) }
    }

    fun svuota() = scaffale.svuota()

    companion object {
        fun nuovoId(lettera: String): String = "$lettera-" + UUID.randomUUID().toString().replace("-", "").take(16)
    }
}
