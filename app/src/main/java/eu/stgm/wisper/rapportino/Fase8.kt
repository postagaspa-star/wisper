package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/*
 * Fase 8 (docs/gestionale/fase8.md, la §0 sopra a tutto): integrazioni, il calendario in
 * altre app, la ricerca dentro i file, importa ed esporta, la Dashboard con le regole nuove,
 * l'amministrazione completa e la lista di controllo. Solo i dati e le regole pure (le prove
 * le rifanno): le azioni stanno in ServizioFase8.kt, le schermate in ui/.
 * Le parole sono quelle dell'accordo (§15), uguali al computer.
 */

// ---------------------------------------------------------------------------------- parole

object Parole8 {
    const val COLLEGATO = "collegato"
    const val DA_CONFIGURARE = "da_configurare"
    const val ERRORE = "errore"
    const val NON_COLLEGATO = "non_collegato"
    const val IN_CORSO = "in_corso"

    /** I tre gruppi della pagina (§4.3). */
    const val G_COLLEGATI = "collegati"
    const val G_SCELTA = "scelta"
    const val G_NON_COLLEGATI = "noncollegati"

    /** La parola dello stato (§4.1, §15): "Dipende da una scelta" per quelli che aspettano Andrea. */
    fun stato(stato: String, gruppo: String = ""): String = when (stato) {
        COLLEGATO -> "Collegato"
        DA_CONFIGURARE -> "Da configurare"
        ERRORE -> "Errore"
        IN_CORSO -> "In corso"
        else -> if (gruppo == G_SCELTA || stato == "scelta") "Dipende da una scelta" else "Non collegato"
    }

    /** "oggi alle 10:00", "ieri alle 2:31", "il 18/10": il quando di un controllo (§4.1). */
    fun quando(istante: String, oggi: LocalDate = LocalDate.now(), sempreOra: Boolean = false): String {
        val t = istanteLocale(istante) ?: return ""
        val ora = t.format(DateTimeFormatter.ofPattern("H:mm"))
        return when (t.toLocalDate()) {
            oggi -> "oggi alle $ora"
            oggi.minusDays(1) -> "ieri alle $ora"
            // Nella storia dei controlli (uno al minuto) serve anche l'ora: "il 20/10 alle 6:00".
            else -> "il " + t.format(DateTimeFormatter.ofPattern("dd/MM")) + if (sempreOra) " alle $ora" else ""
        }
    }

    /** "controllato oggi alle 10:00" (§4.1); niente per chi non ha controlli. */
    fun controllato(istante: String, oggi: LocalDate = LocalDate.now()): String = quando(istante, oggi).let { if (it.isBlank()) "" else "controllato $it" }

    /** "in 412 ms", "in 8 s". */
    fun tempo(ms: Long?): String = when {
        ms == null || ms <= 0 -> ""
        ms >= 1000 -> "in " + Numeri.scrivi(Math.round(ms / 100.0) / 10.0) + " s"
        else -> "in $ms ms"
    }
}

// ---------------------------------------------------------------------------------- integrazioni (§4, §13.1)

/** Un controllo nella storia di un collegamento. */
data class ControlloIntegrazione(val quando: String, val ok: Boolean, val millisecondi: Long?, val testo: String) {
    companion object {
        fun daJson(o: JSONObject) = ControlloIntegrazione(
            o.testo("quando"), o.testo("esito").ifBlank { if (o.vero("ok")) "ok" else "errore" } == "ok",
            o.numero("millisecondi")?.toLong() ?: o.numero("ms")?.toLong(), o.testo("testo"),
        )
    }
}

/**
 * Un'impostazione come la manda il server (§13.6, e quelle di un collegamento): le parole,
 * le unità e i limiti sono del server, così telefono e computer dicono le stesse cose.
 * [tipo]: "numero", "testo", "scelta", "si" (sì/no), "sola" (da leggere), "tempi" (la
 * tabella dei tempi dei ticket), "email".
 */
data class VoceImpostazione(
    val chiave: String,
    val etichetta: String,
    val tipo: String,
    val valore: Any? = null,
    val scelte: List<Pair<String, String>> = emptyList(),
    val min: Double? = null,
    val max: Double? = null,
    val unita: String = "",
    /** Le righe e le colonne delle tabelle (tempi dei ticket, documenti dei collaboratori). */
    val righe: List<Pair<String, String>> = emptyList(),
    val colonne: List<Pair<String, String>> = emptyList(),
) {
    /** Il valore come si scrive nel campo. */
    val testo: String get() = when (val v = valore) {
        null, JSONObject.NULL -> ""
        is Number -> Numeri.scrivi(v.toDouble())
        is Boolean -> if (v) "true" else "false"
        else -> v.toString()
    }

    val acceso: Boolean get() = when (val v = valore) {
        is Boolean -> v
        is Number -> v.toDouble() != 0.0
        is String -> v.trim().lowercase() in setOf("true", "1", "si", "sì")
        else -> false
    }

    /** Cosa non va in quello che è scritto, con la parola davanti come il server ("Ore al giorno: da 1 a 12"), o null. */
    fun errore(scritto: String): String? {
        if (tipo != "numero") return null
        val t = scritto.trim()
        if (t.isEmpty()) return null
        val n = Numeri.leggi(t) ?: return "$etichetta: scrivi un numero"
        if ((min != null && n < min) || (max != null && n > max)) {
            return "$etichetta: da ${Numeri.scrivi(min ?: n)} a ${Numeri.scrivi(max ?: n)}"
        }
        return null
    }

    companion object {
        private fun coppie(a: JSONArray?): List<Pair<String, String>> = a?.let {
            (0 until it.length()).mapNotNull { i ->
                when (val x = it.opt(i)) {
                    is JSONArray -> x.optString(0) to x.optString(1, x.optString(0))
                    is JSONObject -> x.testo("valore").ifBlank { x.testo("chiave") } to x.testo("nome").ifBlank { x.testo("valore") }
                    is String -> x to x
                    else -> null
                }
            }
        }.orEmpty()

        fun daJson(o: JSONObject): VoceImpostazione {
            val scelte = coppie(o.optJSONArray("scelte"))
            val v = if (o.has("valore") && !o.isNull("valore")) o.get("valore") else null
            return VoceImpostazione(
                chiave = o.testo("chiave"), etichetta = o.testo("etichetta").ifBlank { o.testo("nome") }.ifBlank { o.testo("chiave") },
                tipo = o.testo("tipo").ifBlank { if (scelte.isNotEmpty()) "scelta" else if (v is Number) "numero" else if (v is Boolean) "si" else "testo" },
                valore = v, scelte = scelte, min = o.numero("min"), max = o.numero("max"), unita = o.testo("unita"),
                righe = coppie(o.optJSONArray("righe")), colonne = coppie(o.optJSONArray("colonne")),
            )
        }

        /** Le impostazioni di un collegamento: un elenco di voci, o un oggetto chiave → valore (le parole allora sono queste). */
        fun elenco(x: Any?): List<VoceImpostazione> = when (x) {
            is JSONArray -> x.oggetti().map(::daJson)
            is JSONObject -> x.keys().asSequence().toList().map { k ->
                val v = if (x.isNull(k)) null else x.get(k)
                if (v is JSONObject) daJson(JSONObject(v.toString()).put("chiave", k))
                else (NOMI_IMPOSTAZIONI[k] ?: (null to null)).let { (et, un) -> VoceImpostazione(k, et ?: k, if (v is Boolean) "si" else if (v is Number) "numero" else "testo", v, unita = un ?: "") }
            }
            else -> emptyList()
        }

        /** Le parole delle impostazioni dei collegamenti, se il server manda solo le chiavi. */
        val NOMI_IMPOSTAZIONI: Map<String, Pair<String?, String?>> = mapOf(
            "CALENDARIO_GIORNI_PRIMA" to ("Giorni passati nel calendario" to "giorni"),
            "CALENDARIO_MESI_DOPO" to ("Mesi futuri nel calendario" to "mesi"),
            "CALENDARIO_PUBBLICO" to ("Anche fuori casa (passa da Google)" to null),
            "RICERCA_FILE" to ("Cerca anche dentro i file" to null),
            "RICERCA_FILE_MAX_MB" to ("Grandezza massima di un file da leggere" to "MB"),
        )
    }
}

/** Un collegamento di un'impostazione con una pagina sua ("Impostazioni fiscali" → Amministrazione). */
data class CollegamentoImpostazione(val nome: String, val pagina: String, val sezione: String, val valore: String = "") {
    companion object {
        fun daJson(o: JSONObject) = CollegamentoImpostazione(o.testo("nome"), o.testo("pagina"), o.testo("sezione"), o.testo("valore").ifBlank { o.testo("stato") })
    }
}

data class GruppoImpostazioni(
    val chiave: String, val nome: String, val voci: List<VoceImpostazione>, val collegamenti: List<CollegamentoImpostazione> = emptyList(),
    /** Le azioni della scheda (Spegni il portale adesso): nome e azione del server. */
    val azioni: List<Pair<String, String>> = emptyList(),
) {
    /** Le voci che si possono salvare (non quelle da leggere). */
    val salvabile: Boolean get() = voci.any { it.tipo != "sola" && it.tipo != "sola_lettura" }

    companion object {
        fun daJson(o: JSONObject) = GruppoImpostazioni(
            o.testo("chiave"), o.testo("nome"), o.optJSONArray("voci").oggetti().map(VoceImpostazione::daJson),
            o.optJSONArray("collegamenti").oggetti().map(CollegamentoImpostazione::daJson),
            o.optJSONArray("azioni").oggetti().map { it.testo("nome") to it.testo("azione") },
        )

        fun elenco(o: JSONObject): List<GruppoImpostazioni> = o.optJSONArray("gruppi").oggetti().map(::daJson)

        /** Cerca un'impostazione (§9.4): nel nome del gruppo o nelle etichette, senza maiuscole e accenti. */
        fun filtra(gruppi: List<GruppoImpostazioni>, testo: String): List<GruppoImpostazioni> {
            val t = Testi8.semplice(testo)
            if (t.isBlank()) return gruppi
            return gruppi.mapNotNull { g ->
                if (Testi8.semplice(g.nome).contains(t)) g
                else {
                    val voci = g.voci.filter { Testi8.semplice(it.etichetta).contains(t) }
                    val col = g.collegamenti.filter { Testi8.semplice(it.nome).contains(t) }
                    if (voci.isEmpty() && col.isEmpty()) null else g.copy(voci = voci, collegamenti = col)
                }
            }
        }
    }
}

/** Un collegamento (§13.1): la riga dell'elenco, e nella sua pagina anche i controlli e le impostazioni. */
data class Integrazione(
    val chiave: String,
    val nome: String,
    val cosa: String = "",
    val gruppo: String = Parole8.G_COLLEGATI,
    val stato: String = Parole8.NON_COLLEGATO,
    val controllato: String = "",
    val millisecondi: Long? = null,
    val esito: String = "",
    val account: String = "",
    val esce: String = "",
    val costo: String = "",
    val regole: String = "",
    val provaAdesso: Boolean = false,
    val perche: String = "",
    val servirebbe: String = "",
    val erroriDiFila: Int = 0,
    /** Il controllo è più vecchio del doppio della sua frequenza (§4.1): "da allora nessun controllo". */
    val vecchio: Boolean = false,
    val controlli: List<ControlloIntegrazione> = emptyList(),
    val impostazioni: List<VoceImpostazione> = emptyList(),
    /** "Dipende da una scelta: è nelle domande della fase 8" (la frase del server per quelli che aspettano Andrea). */
    val dipende: String = "",
    /** Segue lo stato di un altro collegamento (link → portale, ponte → porta): niente controllo suo. */
    val segue: String = "",
) {
    val parola: String get() = Parole8.stato(stato, gruppo)
    val inErrore: Boolean get() = stato == Parole8.ERRORE

    /** Non collegato o in attesa di una scelta: niente controlli, niente Prova adesso (§4.3). */
    val senzaControlli: Boolean get() = stato == Parole8.NON_COLLEGATO || stato == "scelta" || (gruppo != Parole8.G_COLLEGATI && stato != Parole8.COLLEGATO && stato != Parole8.ERRORE && stato != Parole8.DA_CONFIGURARE && stato != Parole8.IN_CORSO)

    /** Da sistemare = Errore + Da configurare + quelli che dipendono da Andrea (§4.3). */
    val daSistemare: Boolean get() = stato == Parole8.ERRORE || stato == Parole8.DA_CONFIGURARE || gruppo == Parole8.G_SCELTA

    /** Collegato con l'ultimo controllo fallito (§4.1: uno solo non fa Errore). */
    val ultimoFallito: Boolean get() = stato == Parole8.COLLEGATO && erroriDiFila >= 1

    companion object {
        fun daJson(o: JSONObject): Integrazione = Integrazione(
            chiave = o.testo("chiave"), nome = o.testo("nome"), cosa = o.testo("cosa"), gruppo = o.testo("gruppo").ifBlank { Parole8.G_COLLEGATI },
            stato = o.testo("stato").ifBlank { Parole8.NON_COLLEGATO }, controllato = o.testo("controllato").ifBlank { o.testo("controllatoIl") },
            millisecondi = o.numero("millisecondi")?.toLong(), esito = o.testo("esito"), account = o.testo("account"), esce = o.testo("esce"),
            costo = o.testo("costo"), regole = o.testo("regole"), provaAdesso = o.vero("provaAdesso"), perche = o.testo("perche"),
            servirebbe = o.testo("servirebbe"), erroriDiFila = o.numero("erroriDiFila")?.toInt() ?: (if (o.vero("ultimoNonRiuscito")) 1 else 0), vecchio = o.vero("vecchio"),
            controlli = o.optJSONArray("controlli").oggetti().map(ControlloIntegrazione::daJson),
            impostazioni = VoceImpostazione.elenco(if (o.has("impostazioni") && !o.isNull("impostazioni")) o.get("impostazioni") else null),
            dipende = o.testo("dipende"), segue = o.testo("segue"),
        )
    }
}

/** I quattro segmenti della pagina (§4.3). */
enum class SegmentoIntegrazioni(val nome: String) { TUTTI("Tutti"), COLLEGATI("Collegati"), DA_SISTEMARE("Da sistemare"), NON_COLLEGATI("Non collegati") }

data class ElencoIntegrazioni(val integrazioni: List<Integrazione>, val fascia: String = "") {
    /** Il segmento si conta come lo si filtra (così il numero e l'elenco tornano sempre). */
    fun di(s: SegmentoIntegrazioni): List<Integrazione> = when (s) {
        SegmentoIntegrazioni.TUTTI -> integrazioni
        SegmentoIntegrazioni.COLLEGATI -> integrazioni.filter { it.gruppo == Parole8.G_COLLEGATI && !it.inErrore }
        SegmentoIntegrazioni.DA_SISTEMARE -> integrazioni.filter { it.daSistemare }
        SegmentoIntegrazioni.NON_COLLEGATI -> integrazioni.filter { it.gruppo == Parole8.G_NON_COLLEGATI }
    }

    val errori: List<Integrazione> get() = integrazioni.filter { it.inErrore }

    /** Si apre su Da sistemare se ce n'è almeno uno in Errore, altrimenti su Tutti (§4.3). */
    val segmentoIniziale: SegmentoIntegrazioni get() = if (errori.isNotEmpty()) SegmentoIntegrazioni.DA_SISTEMARE else SegmentoIntegrazioni.TUTTI

    companion object {
        fun daJson(o: JSONObject) = ElencoIntegrazioni(o.optJSONArray("integrazioni").oggetti().map(Integrazione::daJson), o.testo("fascia"))

        /** I nomi dei gruppi, nell'ordine della pagina. */
        val GRUPPI = listOf(Parole8.G_COLLEGATI to "Collegati a Wisper", Parole8.G_SCELTA to "Dipendono da una scelta", Parole8.G_NON_COLLEGATI to "Non collegati")
    }
}

// ---------------------------------------------------------------------------------- calendario (§0.3, §5)

/** Cosa c'è in un file o in un indirizzo (§5.2). */
data class CosaCalendario(val attivita: String = "mie", val assenze: Boolean = true, val scadenze: Boolean = false) {
    fun aJson(): JSONObject = JSONObject().put("attivita", attivita).put("assenze", assenze).put("scadenze", scadenze)

    /** "Le mie cose · ferie e assenze". */
    val visto: String get() = listOfNotNull(
        if (attivita == "studio") "Tutto lo studio" else "Le mie cose",
        if (assenze) "ferie e assenze" else null,
        if (scadenze) "scadenze" else null,
    ).joinToString(" · ")

    companion object {
        fun daJson(o: JSONObject?) = CosaCalendario(o?.testo("attivita")?.ifBlank { null } ?: "mie", o?.vero("assenze") == true, o?.vero("scadenze") == true)
    }
}

/** Un indirizzo d'abbonamento (§5.5): la chiave non torna mai, solo alla creazione. */
data class FeedCalendario(
    val id: String,
    val nome: String,
    val cosa: CosaCalendario = CosaCalendario(),
    val dettagli: Boolean = true,
    val pubblico: Boolean = false,
    val creato: String = "",
    val ultimoUso: String = "",
    val agente: String = "",
    val letture: Int = 0,
    /** Di chi è (solo in Sicurezza, dove si vedono quelli di tutti). */
    val di: String = "",
) {
    /** "ICSx⁵", "Outlook": dal nome dell'app che l'ha letto (i primi 60 caratteri dello User-Agent). */
    val app: String get() = appDa(agente)

    /** "letto oggi alle 9:40 · ICSx⁵", o "Mai letto" (§15). */
    fun letto(oggi: LocalDate = LocalDate.now()): String {
        if (ultimoUso.isBlank()) return "Mai letto"
        return listOf("letto " + Parole8.quando(ultimoUso, oggi), app).filter { it.isNotBlank() }.joinToString(" · ")
    }

    val parolaDettagli: String get() = if (dettagli) "Con i dettagli" else "Senza dettagli"

    companion object {
        fun daJson(o: JSONObject) = FeedCalendario(
            id = o.testo("id"), nome = o.testo("nome"), cosa = CosaCalendario.daJson(o.optJSONObject("cosa")), dettagli = o.vero("dettagli"),
            pubblico = o.vero("pubblico"), creato = o.testo("creato"), ultimoUso = o.testo("ultimoUso"), agente = o.testo("agente"),
            letture = o.numero("letture")?.toInt() ?: 0, di = o.testo("utente").ifBlank { o.testo("di") }.ifBlank { o.testo("nomeUtente") },
        )

        fun appDa(agente: String): String {
            val a = agente.lowercase()
            return when {
                a.isBlank() -> ""
                a.contains("icsx") || a.contains("icsdroid") -> "ICSx⁵"
                a.contains("outlook") || a.contains("microsoft") -> "Outlook"
                a.contains("google") -> "Google Calendar"
                a.contains("thunderbird") -> "Thunderbird"
                a.contains("calendar") && a.contains("mac") -> "Calendario di Apple"
                else -> agente.substringBefore('/').substringBefore(' ').take(24)
            }
        }
    }
}

/** feedCalendario {}: i miei indirizzi, e se il calendario fuori casa è acceso (la casella del foglio si vede solo allora). */
data class ElencoFeed(val feed: List<FeedCalendario>, val fuoriCasaAcceso: Boolean = false) {
    companion object {
        fun daJson(o: JSONObject) = ElencoFeed(
            o.optJSONArray("feed").oggetti().map(FeedCalendario::daJson),
            o.vero("calendarioPubblico") || o.vero("pubblicoAcceso") || o.vero("fuoriCasa"),
        )
    }
}

/** nuovoFeed: l'indirizzo e il webcal, solo in questa risposta (§5.5). */
data class FeedCreato(val feed: FeedCalendario, val indirizzo: String, val webcal: String) {
    companion object {
        fun daJson(o: JSONObject) = FeedCreato(
            FeedCalendario.daJson(o.optJSONObject("feed") ?: JSONObject()), o.testo("indirizzo"),
            o.testo("webcal").ifBlank { o.testo("indirizzo").replaceFirst(Regex("^https?://"), "webcal://") },
        )
    }
}

// ---------------------------------------------------------------------------------- ricerca dentro i file (§6)

/** Dove una ricerca ha trovato la parola dentro un file (§6.2). */
data class TrovatoNelTesto(val revisione: Int?, val superata: Boolean, val estratto: String) {
    /** "nella rev. 1 (superata)" quando l'ha trovata solo in una revisione superata. */
    val nota: String get() = if (superata && revisione != null) "nella rev. $revisione (superata)" else ""

    companion object {
        fun daJson(o: JSONObject?): TrovatoNelTesto? = o?.let { TrovatoNelTesto(it.numero("revisione")?.toInt(), it.vero("superata"), it.testo("estratto")) }

        /**
         * L'estratto per una riga sola: se la prima parola trovata è lontana dall'inizio, si
         * comincia poco prima di lei ("…dell'impianto di [terra] è…"), così il grassetto si vede.
         */
        fun vicino(estratto: String, prima: Int = 28): String {
            val i = estratto.indexOf('[')
            if (i <= prima + 8) return estratto
            val da = estratto.lastIndexOf(' ', i - prima).let { if (it < 0) i - prima else it + 1 }
            return "…" + estratto.substring(da).trimStart('…', ' ')
        }

        /** L'estratto a pezzi: quello tra parentesi quadre va in grassetto ("…l'impianto di [terra] è…"). */
        fun pezzi(estratto: String): List<Pair<String, Boolean>> {
            val out = mutableListOf<Pair<String, Boolean>>()
            var i = 0
            val re = Regex("""\[([^\[\]]*)]""")
            re.findAll(estratto).forEach { m ->
                if (m.range.first > i) out += estratto.substring(i, m.range.first) to false
                if (m.groupValues[1].isNotEmpty()) out += m.groupValues[1] to true
                i = m.range.last + 1
            }
            if (i < estratto.length) out += estratto.substring(i) to false
            return out
        }
    }
}

/** Come è stato letto un file (§6.3): la riga calma della pagina del documento. */
data class LetturaFile(val stato: String, val caratteri: Int? = null, val pagine: Int? = null, val letto: String = "", val motivo: String = "") {
    /** "Testo letto il 21/10 · 12 pagine", "Senza testo: è una scansione o un disegno"… */
    val frase: String get() = when (stato) {
        "letto" -> listOfNotNull(
            "Testo letto" + (istanteLocale(letto)?.let { " il " + it.format(DateTimeFormatter.ofPattern("dd/MM")) } ?: ""),
            pagine?.takeIf { it > 0 }?.let { if (it == 1) "1 pagina" else "$it pagine" },
        ).joinToString(" · ")
        "in_parte" -> "Letto in parte: è molto lungo"
        "senza_testo" -> "Senza testo: è una scansione o un disegno"
        "non_si_legge" -> "Non si legge"
        "troppo_grande" -> "Non si legge: è troppo grande"
        "da_leggere" -> "Da leggere"
        else -> ""
    }

    companion object {
        fun daJson(o: JSONObject) = LetturaFile(o.testo("stato"), o.numero("caratteri")?.toInt(), o.numero("pagine")?.toInt(), o.testo("letto"), o.testo("motivo"))
    }
}

// ---------------------------------------------------------------------------------- importa ed esporta (§7)

/** Esporta tutto (§7.1): il file si prepara in sottofondo e resta 7 giorni. */
data class Esportazione(val id: String, val stato: String, val byte: Long? = null, val creato: String = "", val scade: String = "", val errore: String = "") {
    val pronta: Boolean get() = stato == "pronta"
    val inCorso: Boolean get() = stato == "in_corso"

    /** "wisper-tutto-2026-10-22.zip". */
    val nome: String get() = "wisper-tutto-" + (istanteLocale(creato)?.toLocalDate() ?: LocalDate.now()) + ".zip"

    companion object {
        fun daJson(o: JSONObject) = Esportazione(o.testo("id"), o.testo("stato"), o.numero("byte")?.toLong(), o.testo("creato"), o.testo("scade"), o.testo("errore"))

        fun elenco(o: JSONObject): List<Esportazione> = (o.optJSONArray("esportazioni") ?: o.optJSONArray("righe")).oggetti().map(::daJson)
    }
}

/** Una colonna del file da importare, col campo di Wisper proposto (§7.2 passo 2). */
data class ColonnaImport(val intestazione: String, val campo: String, val esempi: List<String>) {
    fun aJson(): JSONObject = JSONObject().put("intestazione", intestazione).put("campo", campo)

    companion object {
        fun daJson(o: JSONObject) = ColonnaImport(o.testo("intestazione"), o.testo("campo"), o.optJSONArray("esempi")?.stringhe().orEmpty())

        /** I campi di Wisper a cui va una colonna; "" = Non importare. */
        val CAMPI = listOf(
            "nome" to "Nome", "partitaIva" to "Partita IVA", "codiceFiscale" to "Codice fiscale", "codiceSdi" to "Codice SDI", "pec" to "PEC",
            "email" to "Email", "telefono" to "Telefono", "indirizzo" to "Indirizzo", "cap" to "CAP", "citta" to "Città", "provincia" to "Provincia",
            "nazione" to "Nazione", "note" to "Note", "tipo" to "Cliente o fornitore", "" to "Non importare",
        )

        fun nomeCampo(campo: String): String = CAMPI.firstOrNull { it.first == campo }?.second ?: campo
    }
}

data class LetturaImport(val idLettura: String, val colonne: List<ColonnaImport>, val righe: Int) {
    companion object {
        fun daJson(o: JSONObject) = LetturaImport(o.testo("idLettura"), o.optJSONArray("colonne").oggetti().map(ColonnaImport::daJson), o.numero("righe")?.toInt() ?: 0)
    }
}

/** Una riga che si salta, con la frase di salvaSoggetto ("Riga 14 · Partita IVA: …"). */
data class RigaDaSistemare(val riga: Int, val errore: String, val nome: String = "") {
    /** La frase senza il "Riga 14 · " davanti (la riga la dice già il titolo). */
    val frase: String get() = errore.replaceFirst(Regex("""^Riga\s+\d+\s*·\s*"""), "")

    companion object {
        fun daJson(o: JSONObject) = RigaDaSistemare(o.numero("riga")?.toInt() ?: 0, o.testo("errore"), o.testo("nome"))
    }
}

/** Il controllo (§7.2 passo 3): niente è ancora scritto. */
data class ControlloImport(val nuovi: Int, val completati: Int, val daSistemare: List<RigaDaSistemare>, val anteprima: List<JSONObject>, val gia: Int = completati) {
    /** Le righe dell'anteprima di un gruppo: "nuovo", "gia", "sistemare" (come le manda il server). */
    fun righe(gruppo: String): List<JSONObject> = anteprima.filter { (it.testo("gruppo").ifBlank { it.testo("esito").ifBlank { "nuovo" } }) == gruppo }

    /** "Importa 42 e completa 7" (il giallo del passo 4). */
    val azione: String get() = when {
        nuovi > 0 && completati > 0 -> "Importa $nuovi e completa $completati"
        nuovi > 0 -> "Importa $nuovi"
        completati > 0 -> "Completa $completati"
        else -> "Niente da importare"
    }

    companion object {
        fun daJson(o: JSONObject) = ControlloImport(
            o.numero("nuovi")?.toInt() ?: 0, o.numero("completati")?.toInt() ?: 0,
            o.optJSONArray("daSistemare").oggetti().map(RigaDaSistemare::daJson), o.optJSONArray("anteprima").oggetti(),
            o.numero("gia")?.toInt() ?: o.numero("completati")?.toInt() ?: 0,
        )
    }
}

/** Un'importazione fatta (Amministrazione › Importa ed esporta). */
data class Importazione(
    val id: String, val nomeFile: String, val quando: String, val righe: Int = 0, val nuovi: Int = 0, val completati: Int = 0, val saltati: Int = 0, val archiviatiIl: String = "",
) {
    val archiviata: Boolean get() = archiviatiIl.isNotBlank()

    /** "Importati 42 clienti, completati 7, saltati 3". */
    fun frase(tipo: String = "clienti"): String = "Importati $nuovi $tipo, completati $completati, saltati $saltati"

    companion object {
        fun daJson(o: JSONObject) = Importazione(
            o.testo("id"), o.testo("nomeFile").ifBlank { o.testo("nome") }, o.testo("quando"), o.numero("righe")?.toInt() ?: 0,
            o.numero("nuovi")?.toInt() ?: 0, o.numero("completati")?.toInt() ?: 0, o.numero("saltati")?.toInt() ?: 0, o.testo("archiviatiIl").ifBlank { o.testo("archiviati") },
        )

        fun elenco(o: JSONObject): List<Importazione> = (o.optJSONArray("importazioni") ?: o.optJSONArray("righe")).oggetti().map(::daJson)
    }
}

// ---------------------------------------------------------------------------------- dashboard (§8)

/** Un riquadro della Dashboard (§8.4, §13.5). */
data class Riquadro8(val chiave: String, val numero: Double?, val unita: String = "", val rosso: Boolean = false, val collegamento: Collegamento? = null, val etichetta: String = "") {
    /** Il nome sotto il numero ("da fatturare"). */
    val nome: String get() = NOMI[chiave] ?: etichetta.replaceFirstChar { it.lowercase() }.ifBlank { chiave }

    /** "2.180,40 €", "31,5 h", "5". */
    val visto: String get() = when (unita) {
        "euro" -> numero?.let { Numeri.euro(it) } ?: "—"
        "ore" -> numero?.let { Numeri.ore(it) } ?: "—"
        else -> numero?.let { Numeri.scrivi(it) } ?: "—"
    }

    companion object {
        fun daJson(o: JSONObject) = Riquadro8(
            o.testo("chiave"), o.numero("numero"), o.testo("unita"), o.vero("rosso"), Collegamento.daJson(o.optJSONObject("collegamento")), o.testo("etichetta").ifBlank { o.testo("nome") },
        )

        /** I nomi dei riquadri tra cui scegliere (§8.4), come li scrive il prototipo. */
        val NOMI = linkedMapOf(
            "commesseAperte" to "commesse aperte", "commesseInRitardo" to "commesse in ritardo", "daFatturare" to "da fatturare", "daIncassare" to "da incassare",
            "scaduto" to "scaduto", "nelConto" to "nel conto", "ticketAperti" to "ticket aperti", "interventiOggi" to "interventi oggi",
            "scadenzeVicine" to "scadenze vicine", "assentiOggi" to "assenti oggi", "daApprovare" to "da approvare", "tarateScadute" to "tarature scadute",
            "dalPortale" to "dal portale", "daMandareOggi" to "da mandare oggi", "oreSettimana" to "ore della settimana", "attivitaOggi" to "attività di oggi",
            "mieiTicket" to "i miei ticket", "preventiviInAttesa" to "preventivi in attesa",
        )
    }
}

/** Le sezioni della Dashboard e i loro tetti (§8.2 punto 3). */
object Sezioni8 {
    const val URGENTI = "urgenti"
    const val SETTIMANA = "settimana"
    const val PIANIFICARE = "pianificare"
    val TETTI = mapOf(URGENTI to 7, SETTIMANA to 7, PIANIFICARE to 5)
    val NOMI = mapOf(URGENTI to "Urgenti", SETTIMANA to "Questa settimana", PIANIFICARE to "Da pianificare")

    /** Le aree di Tutto quello che c'è da fare (§8.5), nell'ordine delle pillole. */
    val AREE = listOf("" to "Tutto", "lavoro" to "Lavoro", "soldi" to "Soldi", "persone" to "Persone e mezzi", "documenti" to "Documenti e ticket", "clienti" to "Clienti e portale", "sistema" to "Sistema")

    /** Quante altre voci ci sono oltre quelle mostrate ("Altre 6"): [quante] del server meno quelle arrivate. */
    fun altre(quante: Int?, mostrate: Int): Int = ((quante ?: mostrate) - mostrate).coerceAtLeast(0)
}

/** Il foglio "N cose da approvare" (§8.2 punto 5): le righe che il server mette nel dettaglio della voce. */
data class PezzoDaApprovare(val titolo: String, val dove: String, val collegamento: Collegamento?, val numero: Int? = null) {
    companion object {
        fun daJson(o: JSONObject) = PezzoDaApprovare(
            o.testo("titolo").ifBlank { o.testo("nome") }, o.testo("dove").ifBlank { o.testo("dettaglio") }, Collegamento.daJson(o.optJSONObject("collegamento")), o.numero("numero")?.toInt(),
        )
    }
}

// ---------------------------------------------------------------------------------- amministrazione (§9)

/** Una funzione (§9.5): solo cinque si spengono. */
data class Funzione(
    val modulo: String,
    val nome: String,
    val accesa: Boolean,
    val spegnibile: Boolean,
    val cosaCambia: String = "",
    /** Dal 03/11/2026 (progetti.md §5): le funzioni di cui questa ha bisogno, che si accendono con lei. */
    val richiede: List<String> = emptyList(),
    /** Le funzioni che hanno bisogno di questa, che si spengono con lei. */
    val serveA: List<String> = emptyList(),
) {
    /** La parola: Accesa, Spenta, Sempre accesa (§15; dal 03/11/2026 si spengono tutte, "Sempre accesa" resta per i server di prima). */
    val parola: String get() = if (!spegnibile) "Sempre accesa" else if (accesa) "Accesa" else "Spenta"

    companion object {
        fun daJson(o: JSONObject) = Funzione(
            o.testo("modulo"), o.testo("nome"), o.vero("accesa"), o.vero("spegnibile"), o.testo("cosaCambia"),
            richiede = o.optJSONArray("richiede")?.stringhe().orEmpty(),
            serveA = o.optJSONArray("serveA")?.stringhe().orEmpty(),
        )

        fun elenco(o: JSONObject): List<Funzione> = o.optJSONArray("funzioni").oggetti().map(::daJson)

        /** "13 di 19 · spente: Portale clienti". */
        fun riassunto(l: List<Funzione>): String {
            if (l.isEmpty()) return ""
            val spente = l.filter { !it.accesa }
            return "${l.size - spente.size} di ${l.size} accese" + if (spente.isEmpty()) "" else " · spente: " + spente.joinToString(", ") { it.nome }
        }

        /**
         * Le altre che cambiano insieme (progetti.md §5): spegnendo [f], quelle accese che hanno bisogno di lei
         * ("Si spengono anche: …"); accendendola, quelle spente di cui ha bisogno ("Si accendono anche: …"). I nomi
         * nell'ordine del menu, come li dà [tutte].
         */
        fun anche(f: Funzione, accendi: Boolean, tutte: List<Funzione>): List<Funzione> {
            val quali = if (accendi) f.richiede else f.serveA
            return tutte.filter { it.modulo in quali && it.accesa != accendi }
        }

        /** La frase del foglio di conferma: "Si spengono anche: Progetti, Collaboratori esterni." (vuota se nessuna). */
        fun fraseAnche(f: Funzione, accendi: Boolean, tutte: List<Funzione>): String {
            val altre = anche(f, accendi, tutte)
            if (altre.isEmpty()) return ""
            return (if (accendi) "Si accendono anche: " else "Si spengono anche: ") + altre.joinToString(", ") { it.nome } + "."
        }

        /**
         * L'avviso dopo il salvataggio, con le parole del computer (pc/ui/regole-fase8.js, avvisoCambio):
         * "Commesse spenta, e anche Progetti e Collaboratori esterni: i dati restano".
         */
        fun avvisoCambio(nome: String, accesa: Boolean, anche: List<String>): String {
            val altri = anche.filter { it.isNotBlank() }
            val con = when (altri.size) {
                0 -> ""
                1 -> ", e anche " + altri[0]
                else -> ", e anche " + altri.dropLast(1).joinToString(", ") + " e " + altri.last()
            }
            return if (accesa) "$nome riaccesa$con: i dati sono come prima" else "$nome spenta$con: i dati restano"
        }
    }
}

/** Le notifiche della persona (§9.7). [tipi]: solo quelli che la persona può ricevere, come li manda il server. */
data class PreferenzeNotifiche(val telefono: Boolean, val silenzioSera: Boolean, val tipi: Map<String, Boolean>) {
    companion object {
        fun daJson(o: JSONObject): PreferenzeNotifiche {
            val t = o.optJSONObject("tipi")
            val tipi = LinkedHashMap<String, Boolean>()
            t?.keys()?.forEach { k -> tipi[k] = t.optBoolean(k, true) }
            return PreferenzeNotifiche(if (o.has("telefono")) o.vero("telefono") else true, if (o.has("silenzioSera")) o.vero("silenzioSera") else true, tipi)
        }

        /** I gruppi e le parole dei tipi (§9.7), nell'ordine della pagina. */
        val GRUPPI: List<Pair<String, List<Pair<String, String>>>> = listOf(
            "Lavoro" to listOf("assegnato" to "Ti hanno assegnato qualcosa", "da_mandare" to "Messaggi da mandare oggi"),
            "Clienti e portale" to listOf(
                "richiesta_portale" to "Richieste dal portale", "messaggio_portale" to "Messaggi dal portale", "file_portale" to "File dai clienti",
                "preventivo_accettato" to "Preventivi accettati", "preventivo_rifiutato" to "Preventivi non accettati", "domanda" to "Domande sui preventivi",
                "rapportino_firmato" to "Rapportini firmati nel portale", "segnalazione" to "Segnalazioni dal portale",
            ),
            "Sistema" to listOf(
                "portale_irraggiungibile" to "Il portale non risponde", "integrazione_errore" to "Un collegamento in Errore",
                "copia_non_riuscita" to "La copia non è riuscita", "ripristino_da_provare" to "Prova il ripristino",
            ),
            "Per te" to listOf("esportazione_pronta" to "Il file con tutti i dati è pronto", "importazione_finita" to "Importazione finita"),
        )

        /** I gruppi coi soli tipi che la persona riceve; un tipo che non conosciamo va in "Per te" col suo nome. */
        fun gruppiDi(tipi: Map<String, Boolean>): List<Pair<String, List<Pair<String, String>>>> {
            val noti = GRUPPI.flatMap { it.second.map { p -> p.first } }.toSet()
            val altri = tipi.keys.filter { it !in noti }.map { it to it.replace('_', ' ').replaceFirstChar { c -> c.uppercase() } }
            return GRUPPI.map { (g, l) -> g to (l.filter { it.first in tipi } + if (g == "Per te") altri else emptyList()) }.filter { it.second.isNotEmpty() }
        }
    }
}

/** Un dispositivo nella pagina Sicurezza o in Stato del sistema. */
data class DispositivoStudio(val id: String, val persona: String, val nome: String, val app: String, val ultimoUso: String, val vecchio: Boolean = false) {
    companion object {
        fun daJson(o: JSONObject) = DispositivoStudio(
            o.testo("id"), o.testo("persona").ifBlank { o.testo("utente") }.ifBlank { o.testo("nomeUtente") },
            o.testo("nome").ifBlank { o.testo("dispNome") }.ifBlank { "Dispositivo" }, o.testo("app"),
            o.testo("ultimoUso"), o.vero("vecchio") || o.vero("indietro"),
        )
    }
}

/** sicurezza {} (§9.8): le schede verdi o rosse, con cose vere. */
data class Sicurezza(
    val internetInternoOk: Boolean = true,
    val internetInternoUltimo: String = "",
    val copiaCifrata: Boolean = false,
    val accessiGiorni: Int = 30,
    val accessiSbagliati: Int = 0,
    val blocchi: Int = 0,
    val bloccatoChi: String = "",
    val dispositiviFermi: List<DispositivoStudio> = emptyList(),
    val utentiFermi: List<Pair<String, String>> = emptyList(),
    val passwordIniziali: List<Pair<String, String>> = emptyList(),
    val sessioneGiorni: Int = 180,
    val dispositivi: List<DispositivoStudio> = emptyList(),
    val feed: List<FeedCalendario> = emptyList(),
    /** Quello che dice il server (primaCosa, tuttoAPosto, la frase dell'ingresso): vale sopra al conto del telefono. */
    val primaCosa: String = "",
    val tuttoAPostoServer: Boolean? = null,
    val fraseInternetServer: String = "",
) {
    /** "Tutto a posto", o la prima cosa da sistemare (la riga di Amministrazione, §9.2). */
    val riassunto: String get() = primaCosa.ifBlank { null } ?: when {
        !internetInternoOk -> "Il server interno si raggiunge da internet"
        !copiaCifrata -> "La copia fuori casa non è cifrata"
        passwordIniziali.isNotEmpty() -> passwordIniziali.first().second + " non ha ancora cambiato la password iniziale"
        dispositiviFermi.isNotEmpty() -> Testi8.quanti(dispositiviFermi.size, "dispositivo non si usa", "dispositivi non si usano") + " da più di 60 giorni"
        else -> "Tutto a posto"
    }
    val tuttoAPosto: Boolean get() = tuttoAPostoServer ?: (riassunto == "Tutto a posto")

    /** La frase rossa dell'ingresso del NAS (§0.2). */
    val fraseInternet: String get() {
        if (fraseInternetServer.isNotBlank() && !internetInternoOk) return fraseInternetServer
        val q = istanteLocale(internetInternoUltimo)
        val quando = q?.let { " il " + it.format(DateTimeFormatter.ofPattern("dd/MM")) + " alle " + it.format(DateTimeFormatter.ofPattern("H:mm")) }.orEmpty()
        return "Una richiesta è arrivata da internet sull'ingresso del NAS$quando: con la porta Google l'ingresso va spento"
    }

    companion object {
        fun daJson(o: JSONObject): Sicurezza {
            val ii = o.optJSONObject("internetInterno")
            val acc = o.optJSONObject("accessiSbagliati")
            fun coppie(a: JSONArray?) = a.oggetti().map { (it.testo("idUtente").ifBlank { it.testo("id") }) to it.testo("nome") }
            return Sicurezza(
                internetInternoOk = ii?.let { if (it.has("ok")) it.vero("ok") else true } ?: true, internetInternoUltimo = ii?.testo("ultimo").orEmpty(),
                copiaCifrata = o.vero("copiaCifrata"), accessiGiorni = acc?.numero("giorni")?.toInt() ?: 30, accessiSbagliati = acc?.numero("quanti")?.toInt() ?: 0,
                blocchi = acc?.numero("blocchi")?.toInt() ?: 0, bloccatoChi = acc?.optJSONArray("chi")?.stringhe()?.joinToString(", ") ?: acc?.testo("chi").orEmpty(),
                dispositiviFermi = o.optJSONArray("dispositiviFermi").oggetti().map(DispositivoStudio::daJson),
                utentiFermi = coppie(o.optJSONArray("utentiFermi")), passwordIniziali = coppie(o.optJSONArray("passwordIniziali")),
                sessioneGiorni = o.numero("sessioneGiorni")?.toInt() ?: 180,
                dispositivi = o.optJSONArray("dispositivi").oggetti().map(DispositivoStudio::daJson),
                feed = o.optJSONArray("feed").oggetti().map(FeedCalendario::daJson),
                primaCosa = o.testo("primaCosa"), tuttoAPostoServer = o.booleanoONull("tuttoAPosto"), fraseInternetServer = ii?.testo("frase").orEmpty(),
            )
        }

        /** La chiave della copia cifrata (§9.8): 8 gruppi di 4, senza 0/O/1/I/L. Il telefono la mostra e basta. */
        fun chiaveBenScritta(chiave: String): Boolean = Regex("""^([2-9A-HJKMNP-Z]{4}-){7}[2-9A-HJKMNP-Z]{4}$""").matches(chiave.trim())
    }
}

/** Una prova della copia (§9.10): automatica o a mano. */
data class ProvaCopia(
    val id: String, val tipo: String, val copia: String, val esito: String, val quando: String = "",
    val integrita: String = "", val righeGiuste: Boolean? = null, val fileProvati: Int? = null, val fileGiusti: Int? = null, val fuori: String = "",
    val dettaglio: String = "", val da: String = "", val conChiave: Boolean = false, val utente: String = "",
) {
    val ok: Boolean get() = esito == "ok"
    val parola: String get() = if (ok) "Tutto torna" else "Non torna"

    companion object {
        fun daJson(o: JSONObject): ProvaCopia {
            val file = o.optJSONObject("file")
            val conteggi = o.optJSONObject("conteggi")
            val righe = conteggi?.let { c -> c.keys().asSequence().all { k -> c.optJSONArray(k)?.let { it.optLong(0) == it.optLong(1) } ?: true } }
            val dettagli = o.optJSONObject("dettagli")
            return ProvaCopia(
                id = o.testo("id"), tipo = o.testo("tipo"), copia = o.testo("copia"), esito = o.testo("esito"), quando = o.testo("quando"),
                integrita = o.testo("integrita"), righeGiuste = righe, fileProvati = file?.numero("provati")?.toInt(), fileGiusti = file?.numero("giusti")?.toInt(),
                fuori = o.optJSONObject("fuori")?.testo("md5").orEmpty(), dettaglio = o.testo("dettaglio").ifBlank { o.testo("cosa") }.ifBlank { dettagli?.testo("cosa").orEmpty() },
                da = o.testo("da"), conChiave = o.vero("conChiave"), utente = o.testo("utente"),
            )
        }
    }
}

/** copie {} con le prove (§9.10). */
data class CopieERipristino(val copie: StatoCopie, val prove: List<ProvaCopia>, val prossimaProva: String, val nomi: List<String>) {
    val ultimaAutomatica: ProvaCopia? get() = prove.firstOrNull { it.tipo == "automatica" }
    val ultimaAMano: ProvaCopia? get() = prove.firstOrNull { it.tipo == "a_mano" }
    fun provata(nome: String): Boolean = nome.isNotBlank() && prove.any { it.ok && it.copia == nome }

    companion object {
        fun daJson(o: JSONObject) = CopieERipristino(
            StatoCopie.daJson(o), o.optJSONArray("prove").oggetti().map(ProvaCopia::daJson).sortedByDescending { it.quando }, o.testo("prossimaProva"),
            o.optJSONArray("copie").oggetti().map { it.testo("nome").ifBlank { it.testo("file") } },
        )

        /** I cinque controlli del ripristino a mano (§11.4 punto 5). */
        val CONTROLLI = listOf(
            "L'ultimo rapportino di ieri c'è", "Il riepilogo del mese ha lo stesso totale", "Una foto e un documento si aprono",
            "La prossima commessa è uguale", "L'ultima riga del registro è di ieri sera",
        )
    }
}

/** statoSistema {} (§9.11). */
data class StatoSistema(
    val versione: String = "", val acceso: String = "", val schema: Int? = null, val node: String = "", val oraServer: String = "", val differenzaMinuti: Int? = null,
    val databaseMb: Double? = null, val integrita: String = "", val controllato: String = "",
    val liberoMb: Double? = null, val usatoMb: Double? = null,
    val lavori: List<Triple<String, String, String>> = emptyList(), val lavoriOk: List<Boolean> = emptyList(),
    /** "ok", "errore" o "fermo" (non è ancora girato: niente copie in prova, postino non collegato). */
    val lavoriEsiti: List<String> = emptyList(),
    val ultimeVersioni: Map<String, String> = emptyMap(), val dispositivi: List<DispositivoStudio> = emptyList(),
    /** La frase dell'ora del NAS come la scrive il server (avvisoOra). */
    val avvisoOra: String = "",
) {
    /** "12 giorni", "3 ore". */
    fun accesoDa(adesso: java.time.LocalDateTime = java.time.LocalDateTime.now()): String {
        val a = istanteLocale(acceso) ?: return ""
        val ore = java.time.Duration.between(a, adesso).toHours()
        return if (ore >= 48) "${ore / 24} giorni" else if (ore >= 1) Testi8.quanti(ore.toInt(), "ora", "ore") else "meno di un'ora"
    }

    /** La frase ambra se l'ora del NAS è lontana più di 2 minuti (§9.11); null se va bene. */
    val fraseOra: String? get() = avvisoOra.ifBlank { null } ?: differenzaMinuti?.takeIf { kotlin.math.abs(it) > 2 }?.let { d ->
        "L'ora del NAS è " + (if (d < 0) "indietro" else "avanti") + " di " + Testi8.quanti(kotlin.math.abs(d), "minuto", "minuti") + ": i rapportini prendono l'ora del NAS"
    }

    companion object {
        fun daJson(o: JSONObject): StatoSistema {
            val s = o.optJSONObject("server")
            val db = o.optJSONObject("database")
            val disco = o.optJSONObject("disco")
            val v = o.optJSONObject("versioni")
            val lavori = o.optJSONArray("lavori").oggetti()
            val ultime = v?.optJSONObject("ultime")
            return StatoSistema(
                versione = s?.testo("versione").orEmpty(), acceso = s?.testo("acceso").orEmpty(), schema = s?.numero("schema")?.toInt(), node = s?.testo("node").orEmpty(),
                oraServer = s?.testo("ora").orEmpty(),
                differenzaMinuti = (o.numero("differenzaMinuti") ?: s?.numero("differenzaMinuti") ?: s?.numero("differenzaSecondi")?.let { Math.round(it / 60.0).toDouble() } ?: o.numero("differenza"))?.toInt(),
                avvisoOra = s?.testo("avvisoOra").orEmpty(),
                databaseMb = db?.numero("mb"), integrita = db?.testo("integrita").orEmpty(), controllato = db?.testo("controllato").orEmpty(),
                liberoMb = disco?.numero("liberoMb") ?: disco?.numero("libero"), usatoMb = disco?.numero("wisperMb") ?: disco?.numero("usatoMb"),
                lavori = lavori.map { Triple(it.testo("nome"), it.testo("quando"), it.testo("nota")) }, lavoriOk = lavori.map { it.testo("esito").ifBlank { "ok" } == "ok" }, lavoriEsiti = lavori.map { it.testo("esito").ifBlank { "ok" } },
                ultimeVersioni = ultime?.keys()?.asSequence()?.associateWith { ultime.testo(it) }.orEmpty(),
                dispositivi = v?.optJSONArray("dispositivi").oggetti().map(DispositivoStudio::daJson),
            )
        }
    }
}

/** Una riga della lista di controllo (§11, §13.6). */
data class RigaControllo(
    val chiave: String, val testo: String, val tipo: String, val chi: String = "", val stato: String = "da_fare",
    val il: String = "", val utente: String = "", val versione: String = "", val nota: String = "", val documento: String = "",
) {
    /** Da fare, Fatto, Non va, Da rifare, In attesa di una scelta (§15). */
    val parola: String get() = when (stato) {
        "fatto" -> "Fatto"
        "non_va" -> "Non va"
        "da_rifare", "rifare" -> "Da rifare"
        "attesa" -> "In attesa di una scelta"
        else -> "Da fare"
    }
    val dalServer: Boolean get() = tipo == "server"

    /** "Automatica", "Dal server", "A mano", "Prova generale", "Automatica e a mano". */
    val tipoVisto: String get() = when (tipo) {
        "automatica" -> "Automatica"
        "server" -> "Dal server"
        "a_mano" -> "A mano"
        "prova_generale" -> "Prova generale"
        "automatica_a_mano" -> "Automatica e a mano"
        else -> tipo.replace('_', ' ').replaceFirstChar { it.uppercase() }
    }

    companion object {
        fun daJson(o: JSONObject) = RigaControllo(
            o.testo("chiave"), o.testo("testo"), o.testo("tipo"), o.testo("chi"), o.testo("stato").ifBlank { "da_fare" }, o.testo("il"),
            o.testo("utente"), o.testo("versione"), o.testo("nota"), o.testo("documento"),
        )
    }
}

data class GruppoControlli(val nome: String, val righe: List<RigaControllo>)

/** controlliFinali {} (§13.6): "41 di 58 fatti · 2 non vanno · 3 in attesa di una scelta". */
/**
 * Il cambio (fase8.md §10, §13.6): Prima del cambio, Prova generale, Cambio fatto, Ritorno chiuso, con la data di ogni
 * passo. Lo segna solo il titolare, dalla Lista di controllo (`segnaCambio {stato}`).
 */
data class StatoCambio(val stato: String = "prima", val provaIl: String = "", val cambioIl: String = "", val chiusoIl: String = "") {
    val parola: String get() = STATI.firstOrNull { it.first == stato }?.second ?: "Prima del cambio"

    /** "Cambio fatto il 05/11 alle 20:30". */
    fun frase(oggi: LocalDate = LocalDate.now()): String {
        val quando = when (stato) { "prova" -> provaIl; "fatto" -> cambioIl; "chiuso" -> chiusoIl; else -> "" }
        return listOf(parola, Parole8.quando(quando, oggi, sempreOra = true)).filter { it.isNotBlank() }.joinToString(" ")
    }

    companion object {
        val STATI = listOf("prima" to "Prima del cambio", "prova" to "Prova generale", "fatto" to "Cambio fatto", "chiuso" to "Ritorno chiuso")
        fun daJson(o: JSONObject?): StatoCambio = if (o == null) StatoCambio() else StatoCambio(
            o.testo("stato").ifBlank { "prima" }, o.testo("provaIl"), o.testo("cambioIl"), o.testo("chiusoIl"),
        )
    }
}

data class ControlliFinali(val fatti: Int, val totale: Int, val nonVanno: Int, val attesa: Int, val gruppi: List<GruppoControlli>, val cambio: StatoCambio = StatoCambio()) {
    val frase: String get() = "$fatti di $totale fatti" + (if (nonVanno > 0) " · " + Testi8.quanti(nonVanno, "non va", "non vanno") else "") +
        (if (attesa > 0) " · $attesa in attesa di una scelta" else "")

    val percento: Int get() = if (totale <= 0) 0 else (fatti * 100 / totale)

    /** Tutte · Da fare · Non vanno · Fatte. */
    fun filtra(segmento: String): List<GruppoControlli> = gruppi.map { g ->
        g.copy(righe = g.righe.filter { r ->
            when (segmento) {
                "dafare" -> r.stato == "da_fare" || r.stato == "da_rifare" || r.stato == "rifare"
                "nonvanno" -> r.stato == "non_va"
                "fatte" -> r.stato == "fatto"
                else -> true
            }
        })
    }.filter { it.righe.isNotEmpty() }

    companion object {
        fun daJson(o: JSONObject): ControlliFinali {
            val r = o.optJSONObject("riassunto")
            val gruppi = o.optJSONArray("gruppi").oggetti().map { g -> GruppoControlli(g.testo("nome"), g.optJSONArray("righe").oggetti().map(RigaControllo::daJson)) }
            val tutte = gruppi.flatMap { it.righe }
            return ControlliFinali(
                r?.numero("fatti")?.toInt() ?: tutte.count { it.stato == "fatto" }, r?.numero("totale")?.toInt() ?: tutte.size,
                r?.numero("nonVanno")?.toInt() ?: tutte.count { it.stato == "non_va" }, r?.numero("attesa")?.toInt() ?: tutte.count { it.stato == "attesa" }, gruppi,
                StatoCambio.daJson(o.optJSONObject("cambio")),
            )
        }
    }
}

// ---------------------------------------------------------------------------------- il codice delle commesse (§9.6)

/**
 * Il formato del codice commessa coi pezzi da toccare (§9.6): Anno (26 · 2026 · niente),
 * Testo (ST), Ordine (anno prima · testo prima), Separatore (niente · - · /), Cifre (3 · 4).
 * Diventa un formato coi segnaposti di sempre ({AA}ST{NNN}), che il server e il telefono
 * senza rete sanno scrivere con [CodiceCommessa.codiceDa].
 */
data class FormatoCommessa(val anno: String = "AA", val testo: String = "ST", val annoPrima: Boolean = true, val separatore: String = "", val cifre: Int = 3) {
    val formato: String get() {
        val a = if (anno.isBlank()) "" else "{$anno}"
        val testa = if (annoPrima) a + testo else testo + a
        return testa + (if (testa.isNotEmpty()) separatore else "") + "{" + "N".repeat(cifre.coerceIn(1, 6)) + "}"
    }

    companion object {
        /** Dal formato di adesso ai pezzi; un formato che non si scompone dà i pezzi di 26ST001. */
        fun da(formato: String): FormatoCommessa {
            val m = Regex("""^(\{A{2,4}\})?([^{}]*?)(\{A{2,4}\})?([-/]?)\{(N+)\}$""").matchEntire(formato.trim()) ?: return FormatoCommessa()
            val annoPrimo = m.groupValues[1]
            val annoDopo = m.groupValues[3]
            val annoPezzo = (annoPrimo.ifBlank { annoDopo }).trim('{', '}')
            return FormatoCommessa(
                anno = annoPezzo, testo = m.groupValues[2], annoPrima = annoPrimo.isNotBlank() || annoPezzo.isBlank(),
                separatore = m.groupValues[4], cifre = m.groupValues[5].length,
            )
        }
    }
}

object CodiceCommessa {
    /**
     * Il codice di una commessa (§9.6, casi condivisi in server/prove/casi-numerazioni.json):
     * `{AAAA}` anno, `{AA}` anno a due cifre, `{N…}` il numero con almeno tante cifre (il
     * numero più lungo non si taglia: col 1000 → 26ST1000).
     */
    fun codiceDa(formato: String, anno: Int, numero: Int): String = Numerazione.applica(formato, numero, anno)

    /**
     * Il numero dentro un codice scritto con [formato] (o null se il codice non è di quel
     * formato): serve per continuare dal più alto anche con i formati di prima.
     */
    fun numeroDa(formato: String, codice: String): Int? {
        val re = Regex("^" + Regex("""\{AAAA\}|\{AA\}|\{N+\}|[^{]+""").findAll(formato).joinToString("") { m ->
            when {
                m.value == "{AAAA}" -> "\\d{4}"
                m.value == "{AA}" -> "\\d{2}"
                m.value.startsWith("{N") -> "(\\d+)"
                else -> Regex.escape(m.value)
            }
        } + "$")
        return re.matchEntire(codice.trim())?.groupValues?.getOrNull(1)?.toIntOrNull()
    }

    /** Il prossimo numero: il più alto fra i codici già scritti (con il formato di adesso o con quelli di prima) più uno. */
    fun prossimo(formati: List<String>, codici: List<String>, ultimo: Int = 0): Int =
        maxOf(ultimo, codici.maxOfOrNull { c -> formati.firstNotNullOfOrNull { f -> numeroDa(f, c) } ?: 0 } ?: 0) + 1
}

// ---------------------------------------------------------------------------------- aiuti

object Testi8 {
    fun quanti(n: Int, uno: String, tanti: String): String = if (n == 1) "1 $uno" else "$n $tanti"

    /** Minuscolo e senza accenti: "Città" e "citta" si trovano a vicenda. */
    fun semplice(t: String): String = java.text.Normalizer.normalize(t.trim().lowercase(), java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")

    /** "3,3 MB". */
    fun peso(byte: Long?): String = when {
        byte == null -> ""
        byte >= 1024L * 1024 -> Numeri.scrivi(Math.round(byte / 1024.0 / 1024.0 * 10) / 10.0) + " MB"
        byte >= 1024 -> "${byte / 1024} KB"
        else -> "$byte byte"
    }
}
