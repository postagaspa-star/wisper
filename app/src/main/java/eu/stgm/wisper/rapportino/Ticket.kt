package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

/*
 * Fase 5, Ticket e assistenza (docs/gestionale/fase5.md §7-9, risposte in
 * architettura.md §16.11-16.17): il ticket, i contratti di assistenza, lo storico
 * dell'impianto, le statistiche. Solo dati e regole (le stesse del server, con le
 * stesse parole): le schermate stanno in ui/Ticket*.kt.
 */

// ---------------------------------------------------------------------------------- parole fisse

/** Le parole fisse della fase 5 (fase5.md §12), uguali su telefono e computer. */
object ParoleTicket {
    val STATI = linkedMapOf("aperto" to "Aperto", "in_carico" to "In carico", "in_attesa" to "In attesa", "risolto" to "Risolto", "chiuso" to "Chiuso", "annullato" to "Annullato")
    val PRIORITA = linkedMapOf("urgente" to "Urgente", "alta" to "Alta", "normale" to "Normale", "bassa" to "Bassa")
    val TIPI = linkedMapOf("guasto" to "Guasto", "verifica" to "Verifica", "piccolo" to "Piccolo intervento", "assistenza" to "Assistenza", "programmato" to "Programmato")
    /** Da dove arriva un ticket: quelli che si scelgono (WhatsApp e portale sono della fase 7, scadenza la usa il server). */
    val ORIGINI = linkedMapOf("telefono" to "Telefono", "email" to "Email", "sopralluogo" to "Sopralluogo", "ufficio" to "Ufficio")
    val IMPATTI = linkedMapOf("fermo" to "Fermo", "ridotto" to "Va a metà", "nessuno" to "Funziona")
    val URGENZE = linkedMapOf("subito" to "Subito", "presto" to "Entro domani", "quando_si_puo" to "Quando si può")
    val MODI = linkedMapOf("ticket" to "Una riga per l'intervento", "separati" to "Con gli altri rapportini", "contratto" to "Nel contratto", "no" to "Non si fattura")
    val MODI_BREVI = mapOf("ticket" to "Una riga", "separati" to "Con i rapportini", "contratto" to "Nel contratto", "no" to "Non si fattura")
    val MODI_SOTTO = mapOf(
        "ticket" to "Una voce in Da fatturare con rapportini, ore e spese",
        "separati" to "I rapportini e le ore vanno in Da fatturare come sempre",
        "contratto" to "Lo copre il canone del contratto",
        "no" to "Garanzia o cortesia, col motivo",
    )

    fun stato(s: String) = STATI[s] ?: s.replaceFirstChar { it.uppercase() }
    fun priorita(p: String) = PRIORITA[p] ?: p.replaceFirstChar { it.uppercase() }
    fun tipo(t: String) = TIPI[t] ?: t.replaceFirstChar { it.uppercase() }
    fun origine(o: String) = ORIGINI[o] ?: if (o == "scadenza") "Da una scadenza" else o.replaceFirstChar { it.uppercase() }
}

/**
 * Il colore di una parola della fase 5 (§12: sempre con la parola): rosso tenue
 * (Urgente, In ritardo, Scaduta, Respinta, Scaduto), ambra (Alta, In attesa, Scade
 * fra…, In scadenza, Da classificare), giallo tenue (Aperto, Da approvare), blu (In
 * carico), verde (Risolto, Valida, Fatta, Attivo), grigio il resto.
 */
object ColoreFase5 {
    const val ROSSO = "rosso"
    const val AMBRA = "ambra"
    const val GIALLO = "giallo"
    const val BLU = "blu"
    const val VERDE = "verde"
    const val GRIGIO = "grigio"

    fun di(parola: String): String {
        val p = parola.trim()
        return when {
            p == "Urgente" || p == "In ritardo" || p.startsWith("Scadut") || p == "Respinta" -> ROSSO
            p == "Alta" || p.startsWith("In attesa") || p.startsWith("Scade ") || p == "In scadenza" || p == "Da classificare" -> AMBRA
            p.startsWith("Aperto") || p.startsWith("Da approvare") || p == "Da pianificare" || p == "Da far firmare" -> GIALLO
            p.startsWith("In carico") || p == "In calendario" -> BLU
            p == "Risolto" || p == "Valida" || p.startsWith("Fatta") || p == "Attivo" || p == "Firmato" -> VERDE
            else -> GRIGIO
        }
    }
}

// ---------------------------------------------------------------------------------- il ticket

/** Il prossimo intervento di un ticket (§16.11). */
data class InterventoBreve(
    val id: String,
    val inizio: LocalDateTime?,
    val fine: LocalDateTime?,
    val assegnataA: String,
    val assegnata: String,
    val luogo: String,
) {
    companion object {
        fun daJson(o: JSONObject?): InterventoBreve? = o?.let {
            InterventoBreve(it.testo("id"), istanteLocale(it.testo("inizio")), istanteLocale(it.testo("fine")), it.testo("assegnataA"), it.testo("assegnata"), it.testo("luogo"))
        }
    }
}

/** Un rapportino del ticket (§16.11): breve. [idLocale] e [inCoda] per quelli scritti qui e non ancora partiti. */
data class RapportinoTicket(
    val id: String,
    val data: String,
    val tecnico: String = "",
    val ore: Double = 0.0,
    val km: Double = 0.0,
    val stato: String = "BOZZA",
    val statoApprovazione: String = "",
    val firmatario: String = "",
    val descrizione: String = "",
    val apribile: Boolean = true,
    val idLocale: String = "",
    val inCoda: Boolean = false,
) {
    val firmato: Boolean get() = stato.uppercase() in setOf("FIRMATO", "INVIATO", "FATTURATO")

    companion object {
        fun daJson(o: JSONObject) = RapportinoTicket(
            id = o.testo("id"), data = o.testo("data"), tecnico = o.testo("tecnico"), ore = o.numero("ore") ?: 0.0, km = o.numero("km") ?: 0.0,
            stato = o.testo("stato").ifBlank { "BOZZA" }, statoApprovazione = o.testo("statoApprovazione"), firmatario = o.testo("firmatario"),
            descrizione = o.testo("descrizione"), apribile = if (o.has("apribile")) o.vero("apribile") else true,
        )
    }
}

/** Una foto del ticket. [locale] per quelle fatte qui e non ancora partite. */
data class FotoTicket(val id: String, val url: String, val nome: String = "", val mime: String = "", val idDocumento: String = "", val locale: File? = null) {
    companion object {
        fun daJson(o: JSONObject) = FotoTicket(o.testo("id"), o.testo("url"), o.testo("nome"), o.testo("mime"), o.testo("idDocumento"))
    }
}

/** La somma del ticket (§16.11): ore, km, materiale e spese; coi soldi anche costo e importo da fatturare. */
data class SommaTicket(val ore: Double, val km: Double, val materiale: Double, val spese: Double, val costo: Double?, val importo: Double?) {
    companion object {
        fun daJson(o: JSONObject?): SommaTicket? = o?.let {
            SommaTicket(it.numero("ore") ?: 0.0, it.numero("km") ?: 0.0, it.numero("materiale") ?: 0.0, it.numero("spese") ?: 0.0, it.numero("costo"), it.numero("importo"))
        }
    }
}

/** Una voce dello storico dell'impianto (§16.17). [id] apre la pagina: il numero per ticket e foto, l'id per gli altri. */
data class VoceStorico(
    val tipo: String,
    val data: String,
    val titolo: String,
    val dettaglio: String = "",
    val id: String = "",
    val idTicket: String = "",
    val apribile: Boolean = true,
) {
    companion object {
        fun daJson(o: JSONObject) = VoceStorico(
            o.testo("tipo"), o.testo("data"), o.testo("titolo"), o.testo("dettaglio"), o.testo("id"), o.testo("idTicket"),
            if (o.has("apribile")) o.vero("apribile") else true,
        )
    }
}

/** Una riga della cronologia (frasi pronte del server). */
data class VoceCronologia(val quando: String, val chi: String, val testo: String) {
    companion object {
        fun daJson(o: JSONObject) = VoceCronologia(o.testo("quando"), o.testo("chi"), o.testo("testo"))
        fun elenco(a: JSONArray?) = a.oggetti().map(::daJson)
    }
}

/** La fattura in cui sta un ticket (solo per chi vede le fatture coi soldi): "In bozza W-16", "Fattura 47/2026". */
data class FatturaTicket(val id: String, val riferimento: String, val stato: String, val etichetta: String) {
    companion object {
        fun daJson(o: JSONObject?): FatturaTicket? = o?.let { FatturaTicket(it.testo("id"), it.testo("riferimento"), it.testo("stato"), it.testo("etichetta")) }
    }
}

/**
 * Un ticket come lo manda il server: la riga di `tickets` e, con [dettaglio], tutto
 * quello che dà `ticket {id}`. Per quelli nati sul telefono [id] è vuoto e c'è
 * [idLocale]; [inCoda] dice che qualcosa di suo non è ancora partito.
 */
data class Ticket(
    val id: String = "",
    val numero: String = "",
    val idLocale: String = "",
    val titolo: String = "",
    val tipo: String = "guasto",
    val tipoNome: String = "Guasto",
    val idCliente: String = "",
    val cliente: String = "",
    val idSede: String = "",
    val impianto: String = "",
    val idCommessa: String = "",
    val commessa: String = "",
    val idContratto: String = "",
    val contratto: String = "",
    val priorita: String = "normale",
    val prioritaNome: String = "Normale",
    val stato: String = "aperto",
    val statoVisto: String = "Aperto",
    val statoDettaglio: String = "",
    val inRitardo: Boolean = false,
    val ritardo: String = "",
    val responsabileId: String = "",
    val responsabile: String = "",
    val apertoIl: String = "",
    val previstoIl: String = "",
    val entroPresa: String = "",
    val entroIntervento: String = "",
    val prossimoIntervento: InterventoBreve? = null,
    val quantiRapportini: Int = 0,
    val origine: String = "telefono",
    val origineNome: String = "Telefono",
    val fatturazione: String = "",
    val fatturazioneNome: String = "",
    val chiusoIl: String = "",
    val puoScrivere: Boolean = true,
    val puoPrendere: Boolean = false,
    val fattura: FatturaTicket? = null,
    // ---- il ticket aperto (ticket {id})
    val dettaglio: Boolean = false,
    val descrizione: String = "",
    val richiedente: String = "",
    val idReferente: String = "",
    val rifCliente: String = "",
    val impatto: String = "",
    val urgenza: String = "",
    val prioritaAMano: Boolean = false,
    val presoIl: String = "",
    val interventoIl: String = "",
    val risoltoIl: String = "",
    val motivo: String = "",
    val esito: String = "",
    val prezzoCorpo: Double? = null,
    val motivoNo: String = "",
    val fatturatoIl: String = "",
    val idScadenza: String = "",
    val referenteNome: String = "",
    val referenteTelefono: String = "",
    val indirizzoImpianto: String = "",
    val interventi: List<Attivita> = emptyList(),
    val rapportini: List<RapportinoTicket> = emptyList(),
    val ore: List<RigaOre> = emptyList(),
    val spese: List<Spesa> = emptyList(),
    val foto: List<FotoTicket> = emptyList(),
    val documenti: List<DocArchivio> = emptyList(),
    val somma: SommaTicket? = null,
    val proposta: String = "",
    val propostaPerche: String = "",
    val daFirmare: String = "",
    val storico: List<VoceStorico> = emptyList(),
    val cronologia: List<VoceCronologia> = emptyList(),
    val riservata: String = "",
    val puoChiudere: Boolean = false,
    /** Il pulsante giallo (§16.11): prendi, pianifica, rapportino, risolvi, chiudi, riprendi o vuoto. */
    val giallo: String = "",
    // ---- del telefono
    val inCoda: Boolean = false,
    val errore: String = "",
    /** Letto dalla copia sul telefono (senza rete): "letto alle 16:52". */
    val lettoAl: String = "",
) {
    /** La chiave per le azioni del server: l'id interno, o l'idLocale di uno nato qui. */
    val chiave: String get() = id.ifBlank { idLocale }

    val vivo: Boolean get() = stato in setOf("aperto", "in_carico", "in_attesa", "risolto")
    val programmato: Boolean get() = tipo == "programmato"
    val chiuso: Boolean get() = stato == "chiuso" || stato == "annullato"

    /** Risponde a [k]: id, numero o idLocale. */
    fun e(k: String): Boolean = k.isNotBlank() && (k == id || k == numero || k == idLocale)

    companion object {
        fun nuovoIdLocale(): String = "T-" + UUID.randomUUID().toString().replace("-", "").take(16)

        fun daJson(o: JSONObject): Ticket {
            val r = o.optJSONArray("rapportini")
            val referente = o.optJSONObject("referente")
            val proposta = o.optJSONObject("proposta")
            return Ticket(
                id = o.testo("id"),
                numero = o.testo("numero"),
                idLocale = o.testo("idLocale"),
                titolo = o.testo("titolo"),
                tipo = o.testo("tipo").ifBlank { "guasto" },
                tipoNome = o.testo("tipoNome").ifBlank { ParoleTicket.tipo(o.testo("tipo").ifBlank { "guasto" }) },
                idCliente = o.testo("idCliente"),
                cliente = o.testo("cliente"),
                idSede = o.testo("idSede"),
                impianto = o.testo("impianto"),
                idCommessa = o.testo("idCommessa"),
                commessa = o.testo("commessa"),
                idContratto = o.testo("idContratto"),
                contratto = o.testo("contratto"),
                priorita = o.testo("priorita").ifBlank { "normale" },
                prioritaNome = o.testo("prioritaNome").ifBlank { ParoleTicket.priorita(o.testo("priorita").ifBlank { "normale" }) },
                stato = o.testo("stato").ifBlank { "aperto" },
                statoVisto = o.testo("statoVisto").ifBlank { ParoleTicket.stato(o.testo("stato").ifBlank { "aperto" }) },
                statoDettaglio = o.testo("statoDettaglio"),
                inRitardo = o.vero("inRitardo"),
                ritardo = o.testo("ritardo"),
                responsabileId = o.testo("responsabileId"),
                responsabile = o.testo("responsabile"),
                apertoIl = o.testo("apertoIl"),
                previstoIl = o.testo("previstoIl"),
                entroPresa = o.testo("entroPresa"),
                entroIntervento = o.testo("entroIntervento"),
                prossimoIntervento = InterventoBreve.daJson(o.optJSONObject("prossimoIntervento")),
                // Nell'elenco "rapportini" è quanti; nel ticket aperto è l'elenco.
                quantiRapportini = if (r != null) r.length() else o.optInt("rapportini", 0),
                origine = o.testo("origine").ifBlank { "telefono" },
                origineNome = o.testo("origineNome").ifBlank { ParoleTicket.origine(o.testo("origine").ifBlank { "telefono" }) },
                fatturazione = o.testo("fatturazione"),
                fatturazioneNome = o.testo("fatturazioneNome"),
                chiusoIl = o.testo("chiusoIl"),
                puoScrivere = o.vero("puoScrivere"),
                puoPrendere = o.vero("puoPrendere"),
                fattura = FatturaTicket.daJson(o.optJSONObject("fattura")),
                dettaglio = o.has("cronologia"),
                descrizione = o.testo("descrizione"),
                richiedente = o.testo("richiedente"),
                idReferente = o.testo("idReferente"),
                rifCliente = o.testo("rifCliente"),
                impatto = o.testo("impatto"),
                urgenza = o.testo("urgenza"),
                prioritaAMano = o.vero("prioritaAMano"),
                presoIl = o.testo("presoIl"),
                interventoIl = o.testo("interventoIl"),
                risoltoIl = o.testo("risoltoIl"),
                motivo = o.testo("motivo"),
                esito = o.testo("esito"),
                prezzoCorpo = o.numero("prezzoCorpo"),
                motivoNo = o.testo("motivoNo"),
                fatturatoIl = o.testo("fatturatoIl"),
                idScadenza = o.testo("idScadenza"),
                referenteNome = referente?.testo("nome").orEmpty(),
                referenteTelefono = referente?.testo("telefono").orEmpty(),
                indirizzoImpianto = o.testo("indirizzoImpianto"),
                interventi = o.optJSONArray("interventi").oggetti().map(Attivita::daJson),
                rapportini = r.oggetti().map(RapportinoTicket::daJson),
                ore = o.optJSONArray("ore").oggetti().map(RigaOre::daJson),
                spese = o.optJSONArray("spese").oggetti().map(Spesa::daJson),
                foto = o.optJSONArray("foto").oggetti().map(FotoTicket::daJson).filter { it.id.isNotBlank() },
                documenti = o.optJSONArray("documenti").oggetti().map(DocArchivio::daJson),
                somma = SommaTicket.daJson(o.optJSONObject("somma")),
                proposta = proposta?.testo("fatturazione").orEmpty(),
                propostaPerche = proposta?.testo("perche").orEmpty(),
                daFirmare = o.testo("daFirmare"),
                storico = o.optJSONArray("storico").oggetti().map(VoceStorico::daJson),
                cronologia = VoceCronologia.elenco(o.optJSONArray("cronologia")),
                riservata = o.testo("riservata"),
                puoChiudere = o.vero("puoChiudere"),
                giallo = o.testo("giallo"),
                lettoAl = o.testo("_lettoAl"),
            )
        }
    }
}

/** I conteggi di `tickets` (§16.11), su tutti quelli che uno vede. [miei] per il collaboratore. */
data class ConteggiTicket(
    val aperti: Int = 0,
    val urgenti: Int = 0,
    val nonAssegnati: Int = 0,
    val inRitardo: Int = 0,
    val risoltiDaChiudere: Int = 0,
    val programmatiDaPianificare: Int = 0,
    val miei: Int? = null,
) {
    companion object {
        fun daJson(o: JSONObject?) = ConteggiTicket(
            o?.optInt("aperti") ?: 0, o?.optInt("urgenti") ?: 0, o?.optInt("nonAssegnati") ?: 0, o?.optInt("inRitardo") ?: 0,
            o?.optInt("risoltiDaChiudere") ?: 0, o?.optInt("programmatiDaPianificare") ?: 0, if (o?.has("miei") == true) o.optInt("miei") else null,
        )
    }
}

data class ElencoTicket(
    val adesso: String = "",
    val segmento: String = "aperti",
    val conteggi: ConteggiTicket = ConteggiTicket(),
    val ticket: List<Ticket> = emptyList(),
    val lettoAl: String = "",
) {
    companion object {
        fun daJson(o: JSONObject) = ElencoTicket(
            o.testo("adesso"), o.testo("segmento").ifBlank { "aperti" }, ConteggiTicket.daJson(o.optJSONObject("conteggi")),
            o.optJSONArray("ticket").oggetti().map(Ticket::daJson), o.testo("_lettoAl"),
        )
    }
}

// ---------------------------------------------------------------------------------- contratti

data class ImpiantoContratto(val idSede: String, val nome: String, val ogniMesi: Int?, val primaVisita: String, val prossimaVisita: String, val idScadenza: String) {
    companion object {
        fun daJson(o: JSONObject) = ImpiantoContratto(o.testo("idSede"), o.testo("nome"), o.numero("ogniMesi")?.toInt(), o.testo("primaVisita"), o.testo("prossimaVisita"), o.testo("idScadenza"))
    }
}

data class RataContratto(val id: String, val descrizione: String, val data: String, val importo: Double?, val stato: String, val statoVisto: String) {
    companion object {
        fun daJson(o: JSONObject) = RataContratto(o.testo("id"), o.testo("descrizione"), o.testo("data"), o.numero("importo"), o.testo("stato"), o.testo("statoVisto"))
    }
}

/** Un contratto di assistenza (§16.15). Senza i soldi [canone], [tariffaExtra] e [rende] sono null. */
data class Contratto(
    val id: String,
    val numero: String,
    val titolo: String,
    val idCliente: String,
    val cliente: String,
    val idCommessa: String = "",
    val commessa: String = "",
    val dal: String = "",
    val al: String = "",
    val rinnovo: String = "tacito",
    val disdettaGiorni: Int = 60,
    val disdettaEntro: String = "",
    val stato: String = "bozza",
    val statoVisto: String = "Bozza",
    val statoDettaglio: String = "",
    val canone: Double? = null,
    val fatturazioneCanone: String = "annuale",
    val copre: String = "visite",
    val materialiInclusi: Boolean = false,
    val tariffaExtra: Double? = null,
    val tempi: JSONObject? = null,
    val impianti: List<ImpiantoContratto> = emptyList(),
    val ticketAperti: Int = 0,
    val ticketAnno: Int = 0,
    val idDocumento: String = "",
    val documento: String = "",
    val note: String = "",
    val motivo: String = "",
    val puoScrivere: Boolean = false,
    val rate: List<RataContratto> = emptyList(),
    val rendeCanone: Double? = null,
    val rendeCosto: Double? = null,
    val rendeExtra: Double? = null,
    val rendeMargine: Double? = null,
) {
    /** "Solo visite" o "Visite e guasti". */
    val copreParole: String get() = if (copre == "visite_guasti") "Visite e guasti" else "Solo visite"

    companion object {
        val RATE = linkedMapOf("annuale" to "Annuale", "semestrale" to "Semestrale", "trimestrale" to "Trimestrale", "mensile" to "Mensile", "nessuna" to "Nessuna")

        fun daJson(o: JSONObject): Contratto {
            val t = o.optJSONObject("ticket")
            val d = o.optJSONObject("documento")
            val r = o.optJSONObject("rende")
            return Contratto(
                id = o.testo("id"), numero = o.testo("numero"), titolo = o.testo("titolo"), idCliente = o.testo("idCliente"), cliente = o.testo("cliente"),
                idCommessa = o.testo("idCommessa"), commessa = o.testo("commessa"), dal = o.testo("dal"), al = o.testo("al"),
                rinnovo = o.testo("rinnovo").ifBlank { "tacito" }, disdettaGiorni = o.numero("disdettaGiorni")?.toInt() ?: 60, disdettaEntro = o.testo("disdettaEntro"),
                stato = o.testo("stato").ifBlank { "bozza" }, statoVisto = o.testo("statoVisto").ifBlank { "Bozza" }, statoDettaglio = o.testo("statoDettaglio"),
                canone = o.numero("canone"), fatturazioneCanone = o.testo("fatturazioneCanone").ifBlank { "annuale" }, copre = o.testo("copre").ifBlank { "visite" },
                materialiInclusi = o.vero("materialiInclusi"), tariffaExtra = o.numero("tariffaExtra"), tempi = o.optJSONObject("tempi"),
                impianti = o.optJSONArray("impianti").oggetti().map(ImpiantoContratto::daJson),
                ticketAperti = t?.optInt("aperti") ?: 0, ticketAnno = t?.optInt("anno") ?: 0,
                idDocumento = d?.testo("id").orEmpty(), documento = d?.testo("titolo").orEmpty(), note = o.testo("note"), motivo = o.testo("motivo"),
                puoScrivere = o.vero("puoScrivere"), rate = o.optJSONArray("rate").oggetti().map(RataContratto::daJson),
                rendeCanone = r?.numero("canone"), rendeCosto = r?.numero("costo"), rendeExtra = r?.numero("fatturatoExtra"), rendeMargine = r?.numero("margine"),
            )
        }
    }
}

// ---------------------------------------------------------------------------------- storico dell'impianto e statistiche

data class DatiImpianto(
    val id: String,
    val nome: String,
    val categoria: String = "",
    val categoriaNome: String = "",
    val idCliente: String = "",
    val cliente: String = "",
    val indirizzo: String = "",
    val matricola: String = "",
    val potenza: String = "",
    val tensione: String = "",
    val messaInServizio: String = "",
    val ambiente: String = "",
    val ambienteNome: String = "",
    val idReferente: String = "",
    val referente: String = "",
    val datiTecnici: String = "",
) {
    companion object {
        fun daJson(o: JSONObject) = DatiImpianto(
            o.testo("id"), o.testo("nome"), o.testo("categoria"), o.testo("categoriaNome"), o.testo("idCliente"), o.testo("cliente"), o.testo("indirizzo"),
            o.testo("matricola"), o.testo("potenza"), o.testo("tensione"), o.testo("messaInServizio"), o.testo("ambiente"), o.testo("ambienteNome"),
            o.testo("idReferente"), o.testo("referente"), o.testo("datiTecnici"),
        )
    }
}

/** Una riga breve (aperti, scadenze, contratti) della scheda dell'impianto. */
data class RigaBreve(val id: String, val titolo: String, val statoVisto: String, val dettaglio: String = "", val data: String = "", val priorita: String = "", val numero: String = "")

data class StoricoImpianto(
    val impianto: DatiImpianto,
    val aperti: List<RigaBreve>,
    val scadenze: List<RigaBreve>,
    val contratti: List<RigaBreve>,
    val voci: List<VoceStorico>,
    val pagina: Int,
    val pagine: Int,
) {
    companion object {
        fun daJson(o: JSONObject) = StoricoImpianto(
            impianto = DatiImpianto.daJson(o.optJSONObject("impianto") ?: JSONObject()),
            aperti = o.optJSONArray("aperti").oggetti().map { RigaBreve(it.testo("idTicket").ifBlank { it.testo("id") }, it.testo("titolo"), it.testo("statoVisto"), priorita = it.testo("priorita"), numero = it.testo("id")) },
            scadenze = o.optJSONArray("scadenze").oggetti().map { RigaBreve(it.testo("id"), it.testo("titolo"), it.testo("statoVisto"), data = it.testo("data")) },
            contratti = o.optJSONArray("contratti").oggetti().map { RigaBreve(it.testo("id"), it.testo("titolo"), it.testo("statoVisto"), numero = it.testo("numero")) },
            voci = o.optJSONArray("voci").oggetti().map(VoceStorico::daJson),
            pagina = o.optInt("pagina", 1), pagine = o.optInt("pagine", 1),
        )
    }
}

data class RigaStatistica(
    val chiave: String,
    val nome: String,
    val aperti: Int,
    val chiusi: Int,
    val inCorso: Int,
    val presaMediaOre: Double?,
    val interventoMedioOre: Double?,
    val chiusuraMediaGiorni: Double?,
    val entroITempi: Double?,
    val ore: Double,
    val km: Double,
    val nelContratto: Int,
    val costo: Double?,
    val fatturato: Double?,
) {
    companion object {
        fun daJson(o: JSONObject) = RigaStatistica(
            o.testo("chiave"), o.testo("nome"), o.optInt("aperti"), o.optInt("chiusi"), o.optInt("inCorso"), o.numero("presaMediaOre"), o.numero("interventoMedioOre"),
            o.numero("chiusuraMediaGiorni"), o.numero("entroITempi"), o.numero("ore") ?: 0.0, o.numero("km") ?: 0.0, o.optInt("nelContratto"), o.numero("costo"), o.numero("fatturato"),
        )
    }
}

data class StatisticheTicket(val da: String, val a: String, val per: String, val totale: RigaStatistica, val righe: List<RigaStatistica>) {
    companion object {
        fun daJson(o: JSONObject) = StatisticheTicket(
            o.testo("da"), o.testo("a"), o.testo("per"), RigaStatistica.daJson(o.optJSONObject("totale") ?: JSONObject()),
            o.optJSONArray("righe").oggetti().map(RigaStatistica::daJson),
        )
    }
}

// ---------------------------------------------------------------------------------- le regole

/**
 * Le regole del ticket che il telefono rifà mentre si risponde o senza rete:
 * la priorità dalle due domande, i tempi, il pulsante giallo, il numero proposto.
 * Le stesse del server (server/src/conti.js, azioni/ticket.js), coi casi di
 * server/prove/casi-ticket.json.
 */
object ContiTicket {
    /** La matrice di fase5.md §7.2: impatto (fermo, ridotto, nessuno) per urgenza (subito, presto, quando_si_puo). */
    private val MATRICE = mapOf(
        "fermo" to mapOf("subito" to "urgente", "presto" to "alta", "quando_si_puo" to "normale"),
        "ridotto" to mapOf("subito" to "alta", "presto" to "normale", "quando_si_puo" to "bassa"),
        "nessuno" to mapOf("subito" to "normale", "presto" to "bassa", "quando_si_puo" to "bassa"),
    )

    /** Senza le due risposte: normale. */
    fun prioritaDa(impatto: String?, urgenza: String?): String = MATRICE[impatto.orEmpty()]?.get(urgenza.orEmpty()) ?: "normale"

    /** Le ore di presa e d'intervento per priorità (TICKET_TEMPI dello studio, ore di calendario). */
    val TEMPI_BASE: Map<String, Pair<Double, Double>> = mapOf(
        "urgente" to (1.0 to 4.0), "alta" to (2.0 to 24.0), "normale" to (8.0 to 72.0), "bassa" to (24.0 to 240.0),
    )

    /** TICKET_TEMPI (JSON come testo, dalle impostazioni) cambiato dai tempi di un contratto. */
    fun tempi(studio: String?, contratto: JSONObject? = null): Map<String, Pair<Double, Double>> {
        val s = runCatching { JSONObject(studio.orEmpty()) }.getOrNull()
        return TEMPI_BASE.mapValues { (p, base) ->
            var (presa, intervento) = base
            listOfNotNull(s?.optJSONObject(p), contratto?.optJSONObject(p)).forEach { o ->
                o.numero("presa")?.let { presa = it }
                o.numero("intervento")?.let { intervento = it }
            }
            presa to intervento
        }
    }

    private val ROMA: ZoneId = ZoneId.of("Europe/Rome")
    private val ISTANTE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")

    /**
     * entroPresa ed entroIntervento da [apertoIl] (ora italiana): ore di calendario,
     * notti e domeniche comprese, e il cambio dell'ora contato come il server.
     */
    fun entro(apertoIl: String, priorita: String, tempi: Map<String, Pair<Double, Double>> = TEMPI_BASE): Pair<String, String> {
        val inizio = runCatching { LocalDateTime.parse(apertoIl.take(19)) }.getOrNull() ?: return "" to ""
        val (presa, intervento) = tempi[priorita] ?: tempi.getValue("normale")
        fun piu(ore: Double) = inizio.atZone(ROMA).plusSeconds(Math.round(ore * 3600)).withZoneSameInstant(ROMA).toLocalDateTime().format(ISTANTE)
        return piu(presa) to piu(intervento)
    }

    /**
     * Il pulsante giallo del ticket (§16.11), per quelli cambiati sul telefono e non
     * ancora riletti: "prendi" (aperto senza responsabile), "riprendi" (in attesa, suo),
     * "chiudi" (risolto, per chi chiude), "risolvi" (suo, con un rapportino firmato),
     * "rapportino" (suo, con un intervento di oggi o passato o un rapportino non firmato),
     * "pianifica" (suo, senza interventi futuri né rapportini), "" (niente da fare).
     */
    fun giallo(t: Ticket, ioId: String, soloSuoi: Boolean, scrive: Boolean, chiude: Boolean, adesso: LocalDateTime = LocalDateTime.now(ZoneId.of("Europe/Rome"))): String {
        if (!scrive) return ""
        val suo = !soloSuoi || t.responsabileId == ioId || t.responsabileId.isBlank()
        val vivi = t.interventi.filter { it.stato != StatoAttivita.ANNULLATA }
        val rapportini = t.rapportini
        return when {
            t.stato == "aperto" && t.responsabileId.isBlank() -> "prendi"
            t.stato == "in_attesa" -> if (suo) "riprendi" else ""
            t.stato == "risolto" -> if (chiude) "chiudi" else ""
            t.stato == "aperto" || t.stato == "in_carico" -> when {
                !suo -> ""
                rapportini.any { it.firmato } -> "risolvi"
                vivi.any { (it.inizio?.toLocalDate() ?: it.giorno)?.let { g -> !g.isAfter(adesso.toLocalDate()) } == true } || rapportini.any { !it.firmato } -> "rapportino"
                vivi.none { (it.inizio ?: it.giorno?.atStartOfDay())?.isAfter(adesso) == true } && rapportini.isEmpty() -> "pianifica"
                else -> ""
            }
            else -> ""
        }
    }

    /** Il numero da proporre a un ticket nato senza rete: il prossimo della numerazione, nell'anno giusto. */
    fun numeroProposto(n: Numerazione?, anno: Int = LocalDate.now().year): String {
        if (n == null) return ""
        val prossimo = n.prossimo
        if (prossimo.isNotBlank() && prossimo.contains(anno.toString())) return prossimo
        return Numerazione.applica(n.formato.ifBlank { "TK/{AAAA}/{NNNN}" }, if (n.annuale && !prossimo.contains(anno.toString())) 1 else n.ultimo + 1, anno)
    }

    private val ORA: DateTimeFormatter = DateTimeFormatter.ofPattern("H:mm")
    private val GIORNO: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d", Locale.ITALY)

    /** "oggi alle 12:40", "domani alle 9:00", "giovedì 23 alle 9:00", "il 30/10 alle 8:00". */
    fun quando(istante: String, oggi: LocalDate = LocalDate.now()): String {
        val t = istanteLocale(istante) ?: return ""
        val g = t.toLocalDate()
        val giorno = when {
            g == oggi -> "oggi"
            g == oggi.plusDays(1) -> "domani"
            g == oggi.minusDays(1) -> "ieri"
            g.isAfter(oggi.minusDays(6)) && g.isBefore(oggi.plusDays(7)) -> g.format(GIORNO)
            else -> "il " + g.format(DateTimeFormatter.ofPattern("dd/MM"))
        }
        return "$giorno alle ${t.format(ORA)}"
    }

    /** "8:40" di un istante. */
    fun ora(istante: String): String = istanteLocale(istante)?.format(ORA).orEmpty()
}

// ---------------------------------------------------------------------------------- quello che è ancora in coda

/**
 * Come si vedono i ticket con sopra quello che è ancora sul telefono (fase5.md
 * §3.9): i ticket nati senza rete (dal corpo di salvaTicket), Prendo io, Il lavoro
 * è finito, le foto e i rapportini scritti dal ticket. Come Archivio.componi per
 * i rapportini: niente si perde e si vede subito; quando parte, si rilegge dal server.
 */
object TicketInCoda {

    /** Chi è entrato e cosa può: serve a rifare il pulsante giallo. */
    data class Chi(val id: String, val nome: String, val soloSuoi: Boolean, val scrive: Boolean, val chiude: Boolean)

    private val tipiTicket = setOf(CodaInvii.Tipo.TICKET, CodaInvii.Tipo.AZIONE_TICKET, CodaInvii.Tipo.FOTO_TICKET)

    /** Le operazioni di un ticket ([t] lo riconosce dall'id, dal numero o dall'idLocale). */
    fun operazioniDi(t: Ticket, ops: List<CodaInvii.Operazione>): List<CodaInvii.Operazione> =
        ops.filter { it.tipo in tipiTicket && t.e(it.idLocale) }

    /** Il ticket nato qui, dal corpo di salvaTicket ancora in coda. */
    fun daCorpo(op: CodaInvii.Operazione, ana: Anagrafiche, chi: Chi): Ticket {
        val c = op.corpoJson()
        val idCliente = c.testo("idCliente")
        val sede = ana.sedi.firstOrNull { it.id == c.testo("idSede") }
        val impatto = c.testo("impatto")
        val urgenza = c.testo("urgenza")
        val priorita = c.testo("priorita").ifBlank { ContiTicket.prioritaDa(impatto, urgenza) }
        val responsabile = c.testo("responsabileId")
        val apertoIl = c.testo("apertoIl").ifBlank { op.quando }
        val (presa, intervento) = ContiTicket.entro(apertoIl, priorita, ContiTicket.tempi(ana.impostazioni["TICKET_TEMPI"]))
        val origine = c.testo("origine").ifBlank { "telefono" }
        val tipo = c.testo("tipo").ifBlank { "guasto" }
        val stato = if (responsabile.isNotBlank()) "in_carico" else "aperto"
        val nomeResp = if (responsabile == chi.id) chi.nome else ana.utenti.firstOrNull { it.id == responsabile }?.nome.orEmpty()
        val m = ana.commessa(c.testo("idCommessa"))
        return Ticket(
            numero = c.testo("numero"), idLocale = op.idLocale, titolo = c.testo("titolo"), tipo = tipo, tipoNome = ParoleTicket.tipo(tipo),
            idCliente = idCliente, cliente = ana.cliente(idCliente)?.nome.orEmpty(), idSede = sede?.id.orEmpty(), impianto = sede?.nome.orEmpty(),
            idCommessa = m?.id.orEmpty(), commessa = m?.descrizione.orEmpty(),
            priorita = priorita, prioritaNome = ParoleTicket.priorita(priorita), stato = stato, statoVisto = ParoleTicket.stato(stato),
            responsabileId = responsabile, responsabile = nomeResp, apertoIl = apertoIl,
            entroPresa = presa, entroIntervento = intervento, origine = origine, origineNome = ParoleTicket.origine(origine),
            puoScrivere = chi.scrive, puoPrendere = responsabile.isBlank() && chi.scrive, dettaglio = true,
            descrizione = c.testo("descrizione"), richiedente = c.testo("richiedente"), rifCliente = c.testo("rifCliente"),
            impatto = impatto, urgenza = urgenza, prioritaAMano = c.has("priorita") && c.testo("priorita").isNotBlank(),
            presoIl = if (responsabile.isNotBlank()) apertoIl else "", indirizzoImpianto = sede?.indirizzoCompleto.orEmpty(),
            cronologia = listOf(VoceCronologia(apertoIl, chi.nome, "Aperto da ${chi.nome} (${ParoleTicket.origine(origine).lowercase()})")),
            inCoda = true, errore = op.errore,
        ).let { it.copy(giallo = ContiTicket.giallo(it, chi.id, chi.soloSuoi, chi.scrive, chi.chiude)) }
    }

    /**
     * Il ticket [t] con sopra le sue operazioni in coda e i rapportini scritti dal
     * ticket ancora sul telefono ([viste]: rapportino e chi lo segue).
     */
    fun applica(t: Ticket, ops: List<CodaInvii.Operazione>, rapportini: List<Pair<Rapportino, Boolean>>, chi: Chi, adesso: LocalDateTime = LocalDateTime.now(ZoneId.of("Europe/Rome"))): Ticket {
        val mie = operazioniDi(t, ops).filter { it.tipo != CodaInvii.Tipo.TICKET }
        val delTicket = rapportini.filter { (r, _) -> (r.idTicket.isNotBlank() && (r.idTicket == t.id || r.idTicket == t.numero)) || (r.idLocaleTicket.isNotBlank() && r.idLocaleTicket == t.idLocale) }
        // In coda, oppure già partito ma non ancora nella copia letta del ticket (solo nel dettaglio:
        // l'elenco non porta i rapportini, e lì un rapportino già arrivato non è una novità).
        val nuoviRap = delTicket.filter { (r, inCoda) -> inCoda || (t.dettaglio && t.rapportini.none { it.id.isNotBlank() && it.id == r.id }) }
        if (mie.isEmpty() && nuoviRap.isEmpty()) return t
        var x = t
        val cron = x.cronologia.toMutableList()
        fun inCarico() {
            if (x.stato == "aperto") {
                x = x.copy(stato = "in_carico", statoVisto = "In carico", responsabileId = x.responsabileId.ifBlank { chi.id },
                    responsabile = x.responsabile.ifBlank { chi.nome }, presoIl = x.presoIl.ifBlank { adesso.toString() }, puoPrendere = false)
            }
        }
        // Prima i rapportini: un rapportino su un ticket aperto lo porta in carico (§16.2).
        if (nuoviRap.isNotEmpty()) {
            val righe = nuoviRap.map { (r, inCoda) ->
                RapportinoTicket(
                    id = r.id, data = r.data.toString(), tecnico = r.tecnico, ore = r.oreLavoro + r.oreExtra + r.oreViaggio, km = r.km,
                    stato = r.stato.name, statoApprovazione = r.statoApprovazione, firmatario = r.firmatario, descrizione = r.descrizione,
                    idLocale = r.idLocale, inCoda = inCoda,
                )
            }
            x = x.copy(rapportini = x.rapportini.filterNot { v -> righe.any { it.id.isNotBlank() && it.id == v.id } } + righe)
            inCarico()
        }
        for (op in mie) {
            val c = op.corpoJson()
            when (op.tipo) {
                CodaInvii.Tipo.AZIONE_TICKET -> when (c.testo("azione")) {
                    "prendiTicket" -> { inCarico(); cron += VoceCronologia(op.quando, chi.nome, "Preso da ${chi.nome}") }
                    "riprendiTicket" -> if (x.stato == "in_attesa") {
                        val s = if (x.responsabileId.isBlank()) "aperto" else "in_carico"
                        x = x.copy(stato = s, statoVisto = ParoleTicket.stato(s), statoDettaglio = "")
                        cron += VoceCronologia(op.quando, chi.nome, "Ripreso")
                    }
                    "sospendiTicket" -> if (x.stato == "aperto" || x.stato == "in_carico") {
                        x = x.copy(stato = "in_attesa", statoVisto = "In attesa", statoDettaglio = c.testo("motivo"), motivo = c.testo("motivo"))
                        cron += VoceCronologia(op.quando, chi.nome, "In attesa: " + c.testo("motivo"))
                    }
                    "altroIntervento" -> { if (x.responsabileId.isNotBlank()) inCarico(); cron += VoceCronologia(op.quando, chi.nome, "Serve un altro intervento") }
                    "risolviTicket" -> if (x.stato in setOf("aperto", "in_carico", "in_attesa")) {
                        x = x.copy(stato = "risolto", statoVisto = "Risolto", statoDettaglio = "", risoltoIl = op.quando,
                            responsabileId = x.responsabileId.ifBlank { chi.id }, responsabile = x.responsabile.ifBlank { chi.nome })
                        cron += VoceCronologia(op.quando, chi.nome, "Risolto")
                    }
                }
                CodaInvii.Tipo.FOTO_TICKET -> x = x.copy(foto = x.foto + FotoTicket(op.idFile, "", File(op.percorso).name, "image/jpeg", locale = File(op.percorso)))
                else -> {}
            }
        }
        val errore = mie.firstOrNull { it.rifiutata }?.errore ?: x.errore
        // "Parte appena c'è rete" solo se qualcosa aspetta davvero nella coda.
        x = x.copy(cronologia = cron, inCoda = t.inCoda || mie.isNotEmpty() || nuoviRap.any { it.second }, errore = errore, inRitardo = if (x.stato == "risolto") false else x.inRitardo)
        return x.copy(giallo = ContiTicket.giallo(x, chi.id, chi.soloSuoi, chi.scrive && x.vivo, chi.chiude, adesso))
    }

    /**
     * L'elenco degli aperti come si vede adesso: prima quelli nati qui, poi gli altri
     * con sopra le loro operazioni in coda. Quelli nati qui e già arrivati (stesso
     * idLocale nell'elenco letto) non si mostrano due volte.
     */
    fun elenco(letti: List<Ticket>, ops: List<CodaInvii.Operazione>, rapportini: List<Pair<Rapportino, Boolean>>, ana: Anagrafiche, chi: Chi): List<Ticket> {
        val nuovi = ops.filter { it.tipo == CodaInvii.Tipo.TICKET && letti.none { t -> t.e(it.idLocale) } }.map { daCorpo(it, ana, chi) }
        return (nuovi + letti).map { applica(it, ops, rapportini, chi) }
    }

    /** Il ticket [chiave] nato qui e non ancora partito, se c'è. */
    fun nato(chiave: String, ops: List<CodaInvii.Operazione>, ana: Anagrafiche, chi: Chi): Ticket? =
        ops.firstOrNull { it.tipo == CodaInvii.Tipo.TICKET && (it.idLocale == chiave || it.corpoJson().testo("numero") == chiave) }?.let { daCorpo(it, ana, chi) }

    /** Quante cose di ticket e scadenze aspettano la rete (per la pillola grigia). */
    fun inAttesa(ops: List<CodaInvii.Operazione>): Int = ops.count { it.tipo in tipiTicket || it.tipo == CodaInvii.Tipo.FAI_SCADENZA }
}
