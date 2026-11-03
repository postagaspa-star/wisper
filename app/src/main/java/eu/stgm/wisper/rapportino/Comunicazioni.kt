package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Fase 7 (docs/gestionale/fase7.md): comunicazioni, WhatsApp, notifiche e la parte del
 * portale clienti che vede lo studio. Qui i modelli letti dal server (§10, campo per
 * campo) e le regole pure (il numero per WhatsApp di §9.3, il link di §9.4, i
 * segnaposti che mancano di §9.2): le prove le rifanno coi casi condivisi.
 */

/** Un testo di messaggio com'è (con lo spazio in fondo di "Buongiorno Mario, "): testo() lo accorcerebbe. */
internal fun JSONObject.testoIntero(campo: String): String = if (!has(campo) || isNull(campo)) "" else optString(campo)

// ---------------------------------------------------------------------------------- WhatsApp

/** Il numero ripulito per WhatsApp (§9.3): [numero] solo cifre col prefisso, [visto] come si mostra. */
data class NumeroWhatsapp(val valido: Boolean, val numero: String = "", val fisso: Boolean = false, val visto: String = "")

/**
 * Il numero e il link di WhatsApp, uguali a `numeroWhatsapp` del server e a
 * pc/ui/regole-comunicazioni.js (casi in server/prove/casi-whatsapp.json, che valgono loro).
 */
object Whatsapp {
    /** I due pacchetti di WHATSAPP_APP (§3.13), anche nelle `<queries>` del manifest. */
    const val PACCHETTO_BUSINESS = "com.whatsapp.w4b"
    const val PACCHETTO_NORMALE = "com.whatsapp"

    fun numero(testo: String?): NumeroWhatsapp {
        val t = testo.orEmpty().trim()
        // 1) solo cifre e un + iniziale
        val piu = t.startsWith("+")
        var cifre = t.filter { it.isDigit() }
        // 2) + o 00 davanti: il numero è già internazionale
        var internazionale = piu
        if (!piu && cifre.startsWith("00")) {
            cifre = cifre.substring(2)
            internazionale = true
        }
        val n = cifre.length
        return when {
            n == 0 -> NumeroWhatsapp(false)
            // 3) cellulare italiano senza prefisso
            !internazionale && cifre.startsWith("3") && n in 9..10 -> fatto("39$cifre", false)
            // 4) fisso italiano senza prefisso
            !internazionale && cifre.startsWith("0") && n in 6..11 -> fatto("39$cifre", true)
            // 5) col 39 davanti
            cifre.startsWith("39") && n in 11..12 -> fatto(cifre, cifre.getOrNull(2) == '0')
            // 6) estero col prefisso
            n in 8..15 -> fatto(cifre, false)
            else -> NumeroWhatsapp(false)
        }
    }

    private fun fatto(n: String, fisso: Boolean) = NumeroWhatsapp(true, n, fisso, visto(n))

    /** "+39 333 000 1122" (cellulare italiano), "+39 0445000100" (fisso), "+41790001122" (estero). */
    fun visto(numero: String): String = when {
        numero.isBlank() -> ""
        numero.startsWith("39") && numero.getOrNull(2) == '3' && numero.length > 8 ->
            "+39 " + numero.substring(2, 5) + " " + numero.substring(5, 8) + " " + numero.substring(8)
        numero.startsWith("39") && numero.getOrNull(2) == '0' -> "+39 " + numero.substring(2)
        else -> "+$numero"
    }

    /** Come encodeURIComponent di JavaScript: UTF-8, a capo %0A, e restano A-Z a-z 0-9 - _ . ! ~ * ' ( ). */
    fun codifica(testo: String): String = URLEncoder.encode(testo, "UTF-8")
        .replace("+", "%20").replace("%21", "!").replace("%27", "'").replace("%28", "(").replace("%29", ")").replace("%7E", "~")

    /** `https://wa.me/<numero>?text=<testo>` (§9.4). */
    fun link(numero: String, testo: String): String = "https://wa.me/$numero?text=" + codifica(testo)

    /** Il pacchetto da usare per WHATSAPP_APP: null = chiedi (il sistema sceglie e ricorda). */
    fun pacchetto(app: String): String? = when (app) {
        "business" -> PACCHETTO_BUSINESS
        "normale" -> PACCHETTO_NORMALE
        else -> null
    }
}

// ---------------------------------------------------------------------------------- segnaposti

/** I segnaposti dei modelli (§9.2): quelli che restano scritti sono da completare ("manca il luogo"). */
object Segnaposti {
    private val forma = Regex("""\{[a-z_]+\}""")

    val SEMPRE = listOf("{nome}", "{cliente}", "{studio}", "{mittente}", "{telefono_studio}", "{oggi}", "{portale}")
    val PER_USO = mapOf(
        "appuntamento" to listOf("{giorno}", "{ora}", "{cosa}", "{luogo}", "{impianto}", "{commessa}", "{ticket}"),
        "intervento" to listOf("{giorno}", "{ora}", "{cosa}", "{luogo}", "{impianto}", "{commessa}", "{ticket}"),
        "preventivo" to listOf("{preventivo}", "{oggetto}", "{scadenza}", "{totale}"),
        "rapportino" to listOf("{data}", "{lavoro}", "{rapportino}"),
        "pagamento" to listOf("{fattura}", "{data_fattura}", "{importo}", "{scadenza}"),
        "portale" to emptyList(),
        "libero" to emptyList(),
    )

    /** I segnaposti rimasti nel testo, nell'ordine e una volta sola. */
    fun mancano(testo: String): List<String> = forma.findAll(testo).map { it.value }.distinct().toList()

    /** "manca il luogo", "manca il giorno"… (la parola del segnaposto, come la scrive il computer). */
    fun manca(segnaposto: String): String = "manca " + when (segnaposto) {
        "{nome}" -> "il nome"
        "{cliente}" -> "il cliente"
        "{giorno}" -> "il giorno"
        "{ora}" -> "l'ora"
        "{cosa}" -> "cosa"
        "{luogo}" -> "il luogo"
        "{impianto}" -> "l'impianto"
        "{commessa}" -> "la commessa"
        "{ticket}" -> "il ticket"
        "{preventivo}" -> "il preventivo"
        "{oggetto}" -> "l'oggetto"
        "{scadenza}" -> "la scadenza"
        "{totale}" -> "il totale"
        "{data}" -> "la data"
        "{lavoro}" -> "il lavoro"
        "{rapportino}" -> "il rapportino"
        "{fattura}" -> "la fattura"
        "{data_fattura}" -> "la data della fattura"
        "{importo}" -> "l'importo"
        "{portale}" -> "l'indirizzo del portale"
        else -> segnaposto
    }

    /** Quelli che si possono usare con un uso (le pillole sotto il testo del modello). */
    fun per(uso: String, dalServer: Map<String, List<String>> = emptyMap()): List<String> =
        (dalServer["sempre"] ?: SEMPRE) + (dalServer[uso] ?: PER_USO[uso].orEmpty())

    /** Uno sconosciuto per quell'uso, come lo rifiuta il server ("Segnaposto sconosciuto: {cleinte}"). */
    fun sconosciuto(testo: String, uso: String, dalServer: Map<String, List<String>> = emptyMap()): String? {
        val buoni = per(uso, dalServer).toSet()
        return mancano(testo).firstOrNull { it !in buoni }
    }
}

// ---------------------------------------------------------------------------------- parole

/** Le parole fisse di §12 (uguali su telefono e computer). */
object Parole7 {
    val CANALI = mapOf("whatsapp" to "WhatsApp", "email" to "Email", "portale" to "Portale", "telefonata" to "Telefonata", "nota" to "Nota")
    val STATI = mapOf("preparato" to "Preparato", "mandato" to "Mandato", "non_mandato" to "Non mandato", "errore" to "Errore", "ricevuto" to "Ricevuto")
    val MODELLI = mapOf(
        "promemoria_appuntamento" to "Promemoria appuntamento",
        "intervento_fissato" to "Intervento fissato",
        "preventivo_mandato" to "Preventivo mandato",
        "rapportino_da_firmare" to "Rapportino da firmare",
        "promemoria_pagamento" to "Promemoria di pagamento",
        "secondo_promemoria_pagamento" to "Secondo promemoria di pagamento",
        "invito_portale" to "Invito al portale",
        "libero" to "Messaggio libero",
        "messaggio" to "Messaggio", "domanda" to "Domanda", "segnalazione" to "Segnalazione",
        "rapportino" to "Rapportino", "riepilogo" to "Riepilogo", "preventivo" to "Preventivo", "documento" to "Documento",
        "avviso_parcella" to "Avviso di parcella", "invito_portale_email" to "Invito al portale",
        "avviso_portale" to "Avviso del portale", "conferma_portale" to "Conferma del portale",
    )
    val TIPI_PUBBLICAZIONE = mapOf("preventivo" to "Preventivo", "contratto" to "Contratto", "rapportino" to "Rapportino", "fattura" to "Fattura", "documento" to "Documento", "ticket" to "Richiesta")
    val DA_GUARDARE = mapOf(
        "richiesta" to "Richiesta dal portale", "accettato" to "Accettato nel portale", "rifiutato" to "Non accettato nel portale",
        "domanda" to "Domanda", "firmato" to "Firmato nel portale", "segnalato" to "Segnalazione", "caricamento" to "File dal cliente", "messaggio" to "Messaggio",
    )
    /** I cinque tipi del portale coi tre livelli (§12.3): il terzo dice cosa fa. */
    val PERMESSI = listOf(
        Triple("preventivi", "Preventivi e contratti", "Accetta"),
        Triple("rapportini", "Rapportini", "Firma"),
        Triple("fatture", "Fatture", ""),
        Triple("documenti", "Documenti", "Manda file"),
        Triple("richieste", "Richieste d'intervento", "Apre"),
    )
    /** I permessi di base all'invito (§3.6): tutto a 2, fatture a 0 (a 1 per un privato). */
    fun permessiDiBase(privato: Boolean): Map<String, Int> = mapOf("preventivi" to 2, "rapportini" to 2, "fatture" to if (privato) 1 else 0, "documenti" to 2, "richieste" to 2)

    fun canale(c: String) = CANALI[c] ?: c.replaceFirstChar { it.uppercase() }
    fun stato(s: String) = STATI[s] ?: s.replaceFirstChar { it.uppercase() }
    fun modello(chiave: String, nome: String = "") = nome.ifBlank { MODELLI[chiave] ?: "Messaggio" }
}

// ---------------------------------------------------------------------------------- comunicazioni

/** A chi va un messaggio (§10.2 `a`): il referente col numero già ripulito e il sì a WhatsApp. */
data class Destinatario(
    val idReferente: String = "",
    val nome: String = "",
    val cliente: String = "",
    val idCliente: String = "",
    val numero: String = "",
    val numeroVisto: String = "",
    val email: String = "",
    val whatsappOk: Boolean = false,
    val fisso: Boolean = false,
) {
    val conNumero: Boolean get() = numero.isNotBlank()

    fun aJson(): JSONObject = JSONObject().put("idReferente", idReferente).put("nome", nome).put("cliente", cliente).put("idCliente", idCliente)
        .put("numero", numero).put("numeroVisto", numeroVisto).put("email", email).put("whatsappOk", whatsappOk).put("fisso", fisso)

    companion object {
        fun daJson(o: JSONObject?): Destinatario {
            if (o == null) return Destinatario()
            val numero = o.testo("numero")
            val n = if (numero.isNotBlank()) Whatsapp.numero(numero) else NumeroWhatsapp(false)
            return Destinatario(
                idReferente = o.testo("idReferente"), nome = o.testo("nome"), cliente = o.testo("cliente"), idCliente = o.testo("idCliente"),
                numero = numero, numeroVisto = o.testo("numeroVisto").ifBlank { n.visto },
                email = o.testo("email"), whatsappOk = o.vero("whatsappOk"), fisso = if (o.has("fisso")) o.vero("fisso") else n.fisso,
            )
        }

        /** Dal referente delle anagrafiche: il numero di WhatsApp, se no il telefono, se no quello del cliente (§3.13). */
        fun da(r: Referente, cliente: Cliente?): Destinatario {
            val n = listOf(r.whatsapp, r.telefono, cliente?.telefono.orEmpty()).map { Whatsapp.numero(it) }.firstOrNull { it.valido }
            return Destinatario(r.id, r.nome, cliente?.nome.orEmpty(), r.idSoggetto, n?.numero.orEmpty(), n?.visto.orEmpty(), r.email, r.whatsappOk, n?.fisso == true)
        }
    }
}

/** La cosa di cui parla un messaggio (un ticket, un preventivo, un'attività…), con la sua etichetta. */
data class Riferimento7(val tipo: String = "", val id: String = "", val etichetta: String = "") {
    companion object {
        fun daJson(o: JSONObject?): Riferimento7 = if (o == null) Riferimento7() else Riferimento7(o.testo("tipo"), o.testo("id"), o.testo("etichetta"))
    }
}

/** Una proposta di Da mandare (§9.5): si calcola sul server, ha una chiave stabile. */
data class Proposta(
    val proposta: String,
    val tipo: String = "",
    val titolo: String = "",
    val dettaglio: String = "",
    val canale: String = "whatsapp",
    val a: Destinatario = Destinatario(),
    val riferimento: Riferimento7 = Riferimento7(),
    val modello: String = "",
    val testo: String = "",
    val oggetto: String = "",
    val mancano: List<String> = emptyList(),
) {
    /** I promemoria di pagamento: col foglio vedono "Ultimo movimento segnato in Banche e scadenze". */
    val pagamento: Boolean get() = modello.contains("pagamento") || proposta.startsWith("fattura:")

    fun aJson(): JSONObject = JSONObject().put("proposta", proposta).put("tipo", tipo).put("titolo", titolo).put("dettaglio", dettaglio).put("canale", canale)
        .put("a", a.aJson()).put("riferimento", JSONObject().put("tipo", riferimento.tipo).put("id", riferimento.id).put("etichetta", riferimento.etichetta))
        .put("modello", modello).put("testo", testo).put("oggetto", oggetto).put("mancano", JSONArray(mancano))

    companion object {
        fun daJson(o: JSONObject) = Proposta(
            proposta = o.testo("proposta"), tipo = o.testo("tipo"), titolo = o.testo("titolo"), dettaglio = o.testo("dettaglio"),
            canale = o.testo("canale").ifBlank { "whatsapp" }, a = Destinatario.daJson(o.optJSONObject("a")), riferimento = Riferimento7.daJson(o.optJSONObject("riferimento")),
            modello = o.testo("modello").ifBlank { o.testo("tipo") }, testo = o.testoIntero("testo"), oggetto = o.testo("oggetto"),
            mancano = o.optJSONArray("mancano")?.stringhe() ?: Segnaposti.mancano(o.testoIntero("testo")),
        )
    }
}

/** Una riga dello storico (§10.2 `comunicazioni`). [inCoda]: scritta qui, non ancora arrivata. */
data class Comunicazione(
    val id: String = "",
    val idLocale: String = "",
    val quando: String = "",
    val canale: String = "",
    val direzione: String = "uscita",
    val tipo: String = "",
    val tipoNome: String = "",
    val cliente: String = "",
    val idCliente: String = "",
    val referente: String = "",
    val idReferente: String = "",
    val a: String = "",
    val oggetto: String = "",
    val testo: String = "",
    val stato: String = "",
    val statoVisto: String = "",
    val riferimento: Riferimento7 = Riferimento7(),
    val chi: String = "",
    val errore: String = "",
    val motivo: String = "",
    val mandatoIl: String = "",
    val proposta: String = "",
    val inCoda: Boolean = false,
) {
    val entrata: Boolean get() = direzione == "entrata"
    val nome: String get() = Parole7.modello(tipo, tipoNome)
    val parolaStato: String get() = statoVisto.ifBlank { Parole7.stato(stato) }
    /** Una riga dello storico si riconosce dall'id, o (nata qui) dall'idLocale. */
    val chiave: String get() = id.ifBlank { idLocale }

    companion object {
        fun daJson(o: JSONObject) = Comunicazione(
            id = o.testo("id"), idLocale = o.testo("idLocale"), quando = o.testo("quando"), canale = o.testo("canale"),
            direzione = o.testo("direzione").ifBlank { "uscita" }, tipo = o.testo("tipo"), tipoNome = o.testo("tipoNome"),
            cliente = o.testo("cliente"), idCliente = o.testo("idCliente"), referente = o.testo("referente"), idReferente = o.testo("idReferente"),
            a = o.testo("a"), oggetto = o.testo("oggetto"), testo = o.testo("testo"), stato = o.testo("stato"), statoVisto = o.testo("statoVisto"),
            riferimento = Riferimento7.daJson(o.optJSONObject("riferimento")), chi = o.testo("chi"), errore = o.testo("errore"), motivo = o.testo("motivo"),
            mandatoIl = o.testo("mandatoIl"), proposta = o.testo("proposta"),
        )
    }
}

/** Una riga calma dello storico del cliente (§9.1): "Sig. Ferretti ha visto il preventivo …". */
data class RigaCalma7(val quando: String, val frase: String)

/** `daMandare {}` (§10.2): i quattro gruppi. [lettoAl]: senza rete, l'ora dell'ultima lettura. */
data class DaMandare(
    val oggi: List<Proposta> = emptyList(),
    val domani: List<Proposta> = emptyList(),
    val proposti: List<Proposta> = emptyList(),
    val preparati: List<Comunicazione> = emptyList(),
    val lettoAl: String = "",
) {
    val tutte: List<Proposta> get() = oggi + domani + proposti

    companion object {
        fun daJson(o: JSONObject) = DaMandare(
            oggi = o.optJSONArray("oggi").oggetti().map(Proposta::daJson),
            domani = o.optJSONArray("domani").oggetti().map(Proposta::daJson),
            proposti = o.optJSONArray("proposti").oggetti().map(Proposta::daJson),
            preparati = o.optJSONArray("preparati").oggetti().map(Comunicazione::daJson),
            lettoAl = o.testo("_lettoAl"),
        )
    }
}

/** `comunicazioni {...}` (§10.2): una pagina dello storico, con le righe calme degli accessi. */
data class Storico7(
    val comunicazioni: List<Comunicazione> = emptyList(),
    val accessi: List<RigaCalma7> = emptyList(),
    val pagina: Int = 1,
    val pagine: Int = 1,
    val quante: Int = 0,
    val lettoAl: String = "",
) {
    companion object {
        fun daJson(o: JSONObject) = Storico7(
            comunicazioni = o.optJSONArray("comunicazioni").oggetti().map(Comunicazione::daJson),
            accessi = o.optJSONArray("accessi").oggetti().map { RigaCalma7(it.testo("quando"), it.testo("frase")) },
            pagina = o.optInt("pagina", 1), pagine = o.optInt("pagine", 1), quante = o.optInt("quante", 0), lettoAl = o.testo("_lettoAl"),
        )
    }
}

/** `preparaMessaggio` (§10.2): il testo composto, a chi, il link di wa.me, i segnaposti senza valore. */
data class MessaggioPronto(
    val testo: String = "",
    val oggetto: String = "",
    val a: Destinatario = Destinatario(),
    val link: String = "",
    val mancano: List<String> = emptyList(),
    val ultimoMovimento: String = "",
) {
    companion object {
        fun daJson(o: JSONObject) = MessaggioPronto(
            testo = o.testoIntero("testo"), oggetto = o.testo("oggetto"), a = Destinatario.daJson(o.optJSONObject("a")), link = o.testo("link"),
            mancano = o.optJSONArray("mancano")?.stringhe() ?: Segnaposti.mancano(o.testoIntero("testo")), ultimoMovimento = o.testo("ultimoMovimento"),
        )
    }
}

/** Un modello di messaggio (§5.4 `modelli_messaggi`). [canale]: "whatsapp", "email" o "tutti". */
data class ModelloMessaggio(
    val chiave: String = "",
    val nome: String = "",
    val canale: String = "tutti",
    val uso: String = "libero",
    val oggetto: String = "",
    val testo: String = "",
    val attivo: Boolean = true,
    val sistema: Boolean = false,
    val ordine: Int = 0,
) {
    val perWhatsapp: Boolean get() = canale == "whatsapp" || canale == "tutti"
    val perEmail: Boolean get() = canale == "email" || canale == "tutti"
    val canaleVisto: String get() = when (canale) { "whatsapp" -> "WhatsApp"; "email" -> "Email"; else -> "Tutti e due" }

    fun aJson(): JSONObject = JSONObject().put("chiave", chiave).put("nome", nome).put("canale", canale).put("uso", uso)
        .put("oggetto", oggetto).put("testo", testo).put("attivo", attivo).put("sistema", sistema).put("ordine", ordine)

    companion object {
        fun daJson(o: JSONObject) = ModelloMessaggio(
            chiave = o.testo("chiave"), nome = o.testo("nome").ifBlank { Parole7.modello(o.testo("chiave")) }, canale = o.testo("canale").ifBlank { "tutti" },
            uso = o.testo("uso").ifBlank { "libero" }, oggetto = o.testo("oggetto"), testo = o.testoIntero("testo"),
            attivo = o.booleanoONull("attivo") ?: true, sistema = o.vero("sistema"), ordine = o.optInt("ordine", 0),
        )
    }
}

data class ModelliMessaggi(val modelli: List<ModelloMessaggio> = emptyList(), val segnaposti: Map<String, List<String>> = emptyMap(), val lettoAl: String = "") {
    companion object {
        fun daJson(o: JSONObject): ModelliMessaggi {
            val s = o.optJSONObject("segnaposti")
            return ModelliMessaggi(
                o.optJSONArray("modelli").oggetti().map(ModelloMessaggio::daJson).sortedBy { it.ordine },
                s?.keys()?.asSequence()?.associateWith { k -> s.optJSONArray(k)?.stringhe().orEmpty() }.orEmpty(),
                o.testo("_lettoAl"),
            )
        }
    }
}

/** Una notifica interna (§10.3). */
data class Notifica(
    val id: String,
    val tipo: String = "",
    val titolo: String = "",
    val dettaglio: String = "",
    val collegamento: Collegamento? = null,
    val creata: String = "",
    val letta: Boolean = false,
    /** Già mostrata dal telefono (segnaMostrate): il controllo periodico non la rimostra. */
    val mostrata: Boolean = false,
) {
    companion object {
        fun daJson(o: JSONObject) = Notifica(
            o.testo("id"), o.testo("tipo"), o.testo("titolo"), o.testo("dettaglio"), Collegamento.daJson(o.optJSONObject("collegamento")),
            o.testo("creata"), o.vero("letta"), o.vero("mostrata"),
        )
    }
}

data class Notifiche7(val nuove: Int = 0, val notifiche: List<Notifica> = emptyList(), val lettoAl: String = "") {
    companion object {
        fun daJson(o: JSONObject) = Notifiche7(o.optInt("nuove", 0), o.optJSONArray("notifiche").oggetti().map(Notifica::daJson), o.testo("_lettoAl"))
    }
}

// ---------------------------------------------------------------------------------- portale (lo studio)

/**
 * Lo stato del portale (§0.5): [collegato] "si" | "no" (non si raggiunge) | "non_collegato"
 * (manca l'indirizzo); [script] "attivo" | "non risponde" | "non collegato".
 */
data class StatoPortale(
    val attivo: Boolean = false,
    val indirizzo: String = "",
    val collegato: String = "non_collegato",
    val controllatoIl: String = "",
    val script: String = "non collegato",
    val emailRimaste: Int? = null,
) {
    /** "studiogm-portale.netlify.app": l'indirizzo senza https e senza la barra finale. */
    val host: String get() = indirizzo.removePrefix("https://").removePrefix("http://").trimEnd('/')
    val nonCollegato: Boolean get() = collegato == "non_collegato" || indirizzo.isBlank()

    /** La parola della riga dello stato (§12): Collegato, Non si raggiunge, Non collegato, Spento. */
    val parola: String get() = when {
        nonCollegato -> "Non collegato"
        !attivo -> "Spento"
        collegato == "si" -> "Collegato"
        else -> "Non si raggiunge"
    }

    companion object {
        fun daJson(o: JSONObject?) = if (o == null) StatoPortale() else StatoPortale(
            attivo = o.vero("attivo"), indirizzo = o.testo("indirizzo"), collegato = o.testo("collegato").ifBlank { "non_collegato" },
            controllatoIl = o.testo("controllatoIl"), script = o.testo("script").ifBlank { "non collegato" }, emailRimaste = o.numero("emailRimaste")?.toInt(),
        )
    }
}

/** Una cosa arrivata dal portale da guardare (§10.1 `daGuardare`). */
data class VoceDaGuardare(
    val id: String,
    val tipo: String,
    val titolo: String = "",
    val dettaglio: String = "",
    val quando: String = "",
    val collegamento: Collegamento? = null,
    val inCoda: Boolean = false,
) {
    val urgente: Boolean get() = tipo == "richiesta" && titolo.lowercase().contains("urgente")
    val nome: String get() = Parole7.DA_GUARDARE[tipo] ?: "Dal portale"
    /** Il titolo senza la parola del tipo davanti ("Richiesta urgente: TK/2026/0016" → "TK/2026/0016"). */
    val titoloBreve: String get() = titolo.substringAfter(": ", titolo)

    companion object {
        fun daJson(o: JSONObject) = VoceDaGuardare(o.testo("id"), o.testo("tipo"), o.testo("titolo"), o.testo("dettaglio"), o.testo("quando"), Collegamento.daJson(o.optJSONObject("collegamento")))
    }
}

/** `portale {}` (§10.1). */
data class Portale7(
    val stato: StatoPortale = StatoPortale(),
    val conteggi: Map<String, Int> = emptyMap(),
    val daGuardare: List<VoceDaGuardare> = emptyList(),
    val lettoAl: String = "",
) {
    companion object {
        fun daJson(o: JSONObject): Portale7 {
            val k = o.optJSONObject("conteggi")
            return Portale7(
                StatoPortale.daJson(o.optJSONObject("stato")),
                k?.keys()?.asSequence()?.associateWith { k.optInt(it, 0) }.orEmpty(),
                o.optJSONArray("daGuardare").oggetti().map(VoceDaGuardare::daJson),
                o.testo("_lettoAl"),
            )
        }
    }
}

/** Cosa si pubblica da solo per un cliente (§8.1). [richieste]: "portale" o "tutte". */
data class RegolePortale(
    val preventivi: Boolean = true,
    val contratti: Boolean = true,
    val rapportiniFirmati: Boolean = true,
    val rapportiniDaFirmare: Boolean = false,
    val fatture: Boolean = false,
    val richieste: String = "portale",
) {
    fun aJson(): JSONObject = JSONObject().put("preventivi", preventivi).put("contratti", contratti).put("rapportiniFirmati", rapportiniFirmati)
        .put("rapportiniDaFirmare", rapportiniDaFirmare).put("fatture", fatture).put("richieste", richieste)

    companion object {
        fun daJson(o: JSONObject?) = if (o == null) RegolePortale() else RegolePortale(
            preventivi = o.booleanoONull("preventivi") ?: true, contratti = o.booleanoONull("contratti") ?: true,
            rapportiniFirmati = o.booleanoONull("rapportiniFirmati") ?: true, rapportiniDaFirmare = o.vero("rapportiniDaFirmare"),
            fatture = o.vero("fatture"), richieste = o.testo("richieste").ifBlank { "portale" },
        )
    }
}

/** Un referente visto dal portale (§10.1 `portaleCliente.referenti`). [sedi] null = tutte. */
data class ReferentePortale(
    val id: String,
    val nome: String = "",
    val ruolo: String = "",
    val email: String = "",
    val telefono: String = "",
    val portale: Boolean = false,
    val statoVisto: String = "Senza accesso",
    val permessi: Map<String, Int> = Parole7.permessiDiBase(false),
    val sedi: List<String>? = null,
    val avvisiEmail: Boolean = true,
    val ultimoAccesso: String = "",
    val invitatoIl: String = "",
    val pagamenti: Boolean = false,
    val whatsappOk: Boolean = false,
) {
    fun livello(tipo: String): Int = permessi[tipo] ?: 0

    companion object {
        fun daJson(o: JSONObject): ReferentePortale {
            val p = o.optJSONObject("permessi")
            return ReferentePortale(
                id = o.testo("id"), nome = o.testo("nome"), ruolo = o.testo("ruolo"), email = o.testo("email"), telefono = o.testo("telefono"),
                portale = o.vero("portale"), statoVisto = o.testo("statoVisto").ifBlank { if (o.vero("portale")) "Invitato" else "Senza accesso" },
                permessi = p?.keys()?.asSequence()?.associateWith { p.optInt(it, 0).coerceIn(0, 2) } ?: Parole7.permessiDiBase(false),
                sedi = if (!o.has("sedi") || o.isNull("sedi")) null else (o.optJSONArray("sedi")?.let { a -> (0 until a.length()).map { a.opt(it).toString() } } ?: emptyList()),
                avvisiEmail = o.booleanoONull("avvisiEmail") ?: true, ultimoAccesso = o.testo("ultimoAccesso"), invitatoIl = o.testo("invitatoIl"),
                pagamenti = o.vero("pagamenti"), whatsappOk = o.vero("whatsappOk"),
            )
        }
    }
}

/** Una cosa pubblicata nel portale (§5.4 `portale_pubblicazioni`): [id] è quello della pubblicazione. */
data class Pubblicazione(
    val id: String,
    val tipo: String = "",
    val titolo: String = "",
    val pubblicataIl: String = "",
    val origine: String = "",
    val vistoIl: String = "",
    val vistoDa: String = "",
    val daFirmare: Boolean = false,
    val cliente: String = "",
    /** L'id interno della cosa, se il server lo manda (serve per aprirla). */
    val rif: String = "",
    val inCoda: Boolean = false,
) {
    companion object {
        fun daJson(o: JSONObject) = Pubblicazione(
            o.testo("id"), o.testo("tipo"), o.testo("titolo"), o.testo("pubblicataIl"), o.testo("origine"), o.testo("vistoIl"), o.testo("vistoDa"),
            o.vero("daFirmare"), o.testo("cliente"), o.primoTesto("rif", "idCosa"),
        )
    }
}

/** Un file arrivato dal portale (§5.4 `portale_caricamenti`). [stato]: da_guardare, accettato, rifiutato. */
data class Caricamento(
    val id: String,
    val titolo: String = "",
    val nome: String = "",
    val byte: Long = 0,
    val referente: String = "",
    val creato: String = "",
    val stato: String = "da_guardare",
    val cliente: String = "",
    val idCliente: String = "",
    val ticket: String = "",
    val nota: String = "",
    val motivo: String = "",
    val inCoda: Boolean = false,
    /** Il file da scaricare (`file.id`), e l'id del ticket se è una foto di una richiesta. */
    val idFile: String = "",
    val idTicket: String = "",
) {
    val estensione: String get() = nome.substringAfterLast('.', "").lowercase()
    /** Le immagini si aprono come immagini; gli altri si scaricano e chiedono conferma (§3.11). */
    val immagine: Boolean get() = estensione in setOf("jpg", "jpeg", "png")
    val parolaStato: String get() = when (stato) { "accettato" -> "Accettato"; "rifiutato" -> "Rifiutato"; else -> "Da guardare" }

    companion object {
        fun daJson(o: JSONObject) = Caricamento(
            o.testo("id"), o.testo("titolo"), o.testo("nome"), (o.numero("byte") ?: 0.0).toLong(), o.testo("referente"), o.testo("creato"),
            o.testo("stato").ifBlank { "da_guardare" }, o.testo("cliente"), o.testo("idCliente"),
            ticket = o.optJSONObject("ticket")?.testo("numero") ?: o.primoTesto("ticket", "numeroTicket"), nota = o.testo("nota"), motivo = o.testo("motivo"),
            idFile = o.optJSONObject("file")?.testo("id") ?: o.testo("idFile"), idTicket = o.optJSONObject("ticket")?.testo("id").orEmpty(),
        )
    }
}

/** Una riga del registro degli accessi del portale (§10.1). L'IP non si mostra (§0.4: Google non lo passa). */
data class AccessoPortale(
    val quando: String = "",
    val cliente: String = "",
    val referente: String = "",
    val frase: String = "",
    val oggetto: String = "",
    val esito: String = "ok",
    val dispositivo: String = "",
) {
    val errore: Boolean get() = esito == "no"
    val entrata: Boolean get() = frase.startsWith("Entrat")

    companion object {
        fun daJson(o: JSONObject) = AccessoPortale(
            o.testo("quando"), o.testo("cliente"), o.testo("referente"), o.testo("frase"), o.testo("oggetto"), o.testo("esito").ifBlank { "ok" }, o.testo("dispositivo"),
        )
    }
}

/** `portaleCliente {idCliente}` (§10.1). */
data class ClientePortale(
    val id: String,
    val nome: String = "",
    val portale: Boolean = false,
    val importi: Boolean = false,
    val regole: RegolePortale = RegolePortale(),
    val referenti: List<ReferentePortale> = emptyList(),
    val pubblicati: List<Pubblicazione> = emptyList(),
    val caricamenti: List<Caricamento> = emptyList(),
    val accessi: List<AccessoPortale> = emptyList(),
) {
    companion object {
        fun daJson(o: JSONObject): ClientePortale {
            val c = o.optJSONObject("cliente") ?: JSONObject()
            return ClientePortale(
                id = c.testo("id"), nome = c.testo("nome"), portale = c.vero("portale"), importi = c.vero("importi"), regole = RegolePortale.daJson(c.optJSONObject("regole")),
                referenti = o.optJSONArray("referenti").oggetti().map(ReferentePortale::daJson),
                pubblicati = o.optJSONArray("pubblicati").oggetti().map(Pubblicazione::daJson),
                caricamenti = o.optJSONArray("caricamenti").oggetti().map(Caricamento::daJson),
                accessi = o.optJSONArray("accessi").oggetti().map(AccessoPortale::daJson),
            )
        }
    }
}

/**
 * Il pezzo `portale` di una cosa dello studio (preventivo, rapportino, fattura, documento,
 * §10.4, §15): [id] è `portale.pubblicazione`, l'id della pubblicazione aperta (Togli dal portale).
 */
data class InfoPortale(
    val pubblicato: Boolean = false,
    val vistoIl: String = "",
    val vistoDa: String = "",
    val daFirmare: Boolean = false,
    val id: String = "",
) {
    companion object {
        fun daJson(o: JSONObject?): InfoPortale? = o?.let {
            InfoPortale(it.vero("pubblicato"), it.testo("vistoIl"), it.testo("vistoDa"), it.vero("daFirmare"), it.primoTesto("pubblicazione", "id", "idPubblicazione"))
        }
    }
}

/** L'accettazione di un preventivo (§10.4): [prova] solo con preventivi 2 (via, browser, impronta; mai l'IP, §0.4). */
data class Accettazione7(val modo: String = "", val da: String = "", val il: String = "", val referente: String = "", val prova: JSONObject? = null) {
    val nelPortale: Boolean get() = modo == "portale"

    companion object {
        fun daJson(o: JSONObject?): Accettazione7? = o?.let {
            Accettazione7(it.testo("modo"), it.testo("da"), it.testo("il"), it.optJSONObject("referente")?.testo("nome") ?: it.testo("referente"), it.optJSONObject("prova"))
        }
    }
}

/** Un messaggio della conversazione pubblica di un ticket (§10.4 `ticket.messaggi`). */
data class MessaggioTicket(val quando: String = "", val da: String = "", val testo: String = "", val chi: String = "", val dalCliente: Boolean = false, val file: List<String> = emptyList(), val inCoda: Boolean = false) {
    companion object {
        fun daJson(o: JSONObject): MessaggioTicket {
            val da = o.testo("da")
            val dir = o.testo("direzione")
            return MessaggioTicket(
                o.testo("quando"), da, o.testo("testo"), o.testo("chi"),
                dalCliente = if (dir.isNotBlank()) dir == "entrata" else da.isNotBlank() && da != "Studio Tecnico GM" && o.testo("chi").isBlank(),
                file = o.optJSONArray("file").oggetti().map { it.testo("nome") },
            )
        }
    }
}

/** Quello che serve sapere del portale di un ticket: visibile, i messaggi nuovi, la conversazione. */
data class TicketPortale(val visibile: Boolean = false, val messaggiNuovi: Int = 0, val messaggi: List<MessaggioTicket> = emptyList()) {
    companion object {
        fun daJson(o: JSONObject): TicketPortale? {
            val p = o.optJSONObject("portale")
            val m = o.optJSONArray("messaggi")
            if (p == null && m == null) return null
            return TicketPortale(p?.vero("visibile") == true, p?.optInt("messaggiNuovi", 0) ?: 0, m.oggetti().map(MessaggioTicket::daJson))
        }
    }
}

/** I numeri della Dashboard della fase 7 (§11.1): null quelli che il ruolo non vede. */
data class NumeriFase7(
    val portaleDaGuardare: Int? = null,
    val richiesteNuove: Int = 0,
    val caricamenti: Int = 0,
    val referenti: Int = 0,
    val collegato: String = "",
    val daMandareOggi: Int? = null,
    val preparati: Int = 0,
    val proposti: Int = 0,
) {
    /** Il numerino giallo di WhatsApp e comunicazioni: da mandare oggi più preparati non mandati. */
    val numerinoComunicazioni: Int get() = (daMandareOggi ?: 0) + preparati

    companion object {
        fun daJson(numeri: JSONObject?): NumeriFase7 {
            val p = numeri?.optJSONObject("portale")
            val c = numeri?.optJSONObject("comunicazioni")
            return NumeriFase7(
                portaleDaGuardare = p?.optInt("daGuardare", 0), richiesteNuove = p?.optInt("richiesteNuove", 0) ?: 0, caricamenti = p?.optInt("caricamenti", 0) ?: 0,
                referenti = p?.optInt("referenti", 0) ?: 0, collegato = p?.testo("collegato").orEmpty(),
                daMandareOggi = c?.optInt("daMandareOggi", 0), preparati = c?.optInt("preparati", 0) ?: 0, proposti = c?.optInt("proposti", 0) ?: 0,
            )
        }
    }
}
