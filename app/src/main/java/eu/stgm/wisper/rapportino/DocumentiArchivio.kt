package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.text.Normalizer

/*
 * Fase 5, Documenti (docs/gestionale/fase5.md §5-6, risposte in architettura.md
 * §16.3-16.10): l'archivio, le revisioni, i collegamenti a OneDrive, SharePoint e
 * Drive, le scadenze, i modelli, lo spazio sul NAS. Solo dati e regole; le
 * schermate stanno in ui/Documenti*.kt.
 */

// ---------------------------------------------------------------------------------- i collegamenti

/** Che cosa è un indirizzo incollato (§5.1): tipo, se sembra una cartella, la parola della pillola. */
data class TipoCollegamento(val url: String, val tipo: String, val cartella: Boolean, val pillola: String)

/**
 * tipoCollegamento(url) di server/src/documenti.js, rifatto per la pillola mentre si
 * incolla (casi in server/prove/casi-collegamenti.json). L'indirizzo si salva com'è,
 * senza gli spazi in fondo; quello che non va si dice con la frase del server.
 */
object Collegamenti {
    const val ERRORE = "Collegamento: incolla un indirizzo che comincia con https:// o un percorso come \\\\server\\cartella"

    val PILLOLE = mapOf("onedrive" to "OneDrive", "sharepoint" to "SharePoint", "gdrive" to "Google Drive", "percorso" to "Cartella del computer", "web" to "Sito")

    /** Il tipo, o null se l'indirizzo non va (allora si mostra [ERRORE]). */
    fun tipo(valore: String?): TipoCollegamento? {
        val url = valore.orEmpty().trim()
        if (url.isEmpty() || url.any { it == '\r' || it == '\n' || it == '\t' }) return null
        if (Regex("""^\\\\[^\\/\s][^\\/]*\\""").containsMatchIn(url) || Regex("""^[A-Za-z]:\\""").containsMatchIn(url) || Regex("""^file:///""", RegexOption.IGNORE_CASE).containsMatchIn(url)) {
            val pulito = url.replace(Regex("""^file:///""", RegexOption.IGNORE_CASE), "")
            val ultimo = pulito.split('\\', '/').last()
            val cartella = Regex("""[\\/]$""").containsMatchIn(pulito) || !Regex("""\.[A-Za-z0-9]{1,6}$""").containsMatchIn(ultimo)
            return TipoCollegamento(url, "percorso", cartella, PILLOLE.getValue("percorso"))
        }
        if (url.any { it.isWhitespace() }) return null
        val u = runCatching { URI(url) }.getOrNull() ?: return null
        if (!u.scheme.equals("https", ignoreCase = true) || u.host.isNullOrBlank()) return null
        val host = u.host.lowercase()
        val percorso = u.rawPath.orEmpty()
        val resto = percorso + (u.rawQuery?.let { "?$it" } ?: "")
        return when {
            host.endsWith("-my.sharepoint.com") || host == "1drv.ms" || host == "onedrive.live.com" || host.endsWith(".onedrive.live.com") ->
                TipoCollegamento(url, "onedrive", resto.contains("/:f:/") || resto.contains("/f/"), PILLOLE.getValue("onedrive"))
            host.endsWith(".sharepoint.com") ->
                TipoCollegamento(url, "sharepoint", resto.contains("/:f:/") || Regex("Forms/AllItems", RegexOption.IGNORE_CASE).containsMatchIn(resto), PILLOLE.getValue("sharepoint"))
            host == "drive.google.com" || host == "docs.google.com" ->
                TipoCollegamento(url, "gdrive", Regex("""/drive/(u/\d+/)?folders/""").containsMatchIn(percorso), PILLOLE.getValue("gdrive"))
            else -> TipoCollegamento(url, "web", false, PILLOLE.getValue("web"))
        }
    }

    /** Il primo indirizzo dentro un testo condiviso ("Guarda questo: https://1drv.ms/…"), o un percorso. */
    fun daTestoCondiviso(testo: String?): String? {
        val t = testo.orEmpty().trim()
        if (t.isEmpty()) return null
        Regex("""https://\S+""").find(t)?.let { return it.value.trimEnd('.', ',', ')', ']', '>', '"', '\'') }
        return t.lines().map { it.trim() }.firstOrNull { tipo(it) != null }
    }

    /** "Apri in OneDrive", "Apri in Google Drive", "Apri il sito"; null per un percorso (sul telefono non si apre). */
    fun apriCon(tipo: String): String? = when (tipo) {
        "onedrive" -> "Apri in OneDrive"
        "sharepoint" -> "Apri in SharePoint"
        "gdrive" -> "Apri in Google Drive"
        "web" -> "Apri il sito"
        else -> null
    }

    /** Il titolo da proporre per un collegamento: l'ultimo pezzo dell'indirizzo, leggibile. */
    fun titoloProposto(url: String): String {
        val t = tipo(url) ?: return ""
        val pezzi = t.url.replace('\\', '/').substringBefore('?').trimEnd('/').split('/').filter { it.isNotBlank() }
        val ultimo = pezzi.lastOrNull().orEmpty()
        val leggibile = runCatching { java.net.URLDecoder.decode(ultimo, "UTF-8") }.getOrDefault(ultimo)
        return when {
            t.tipo == "gdrive" || leggibile.length > 40 || leggibile.startsWith(":") || leggibile.length < 3 -> ""
            else -> leggibile.substringBeforeLast('.').replace('_', ' ').replace('-', ' ').trim().replaceFirstChar { it.uppercase() }
        }
    }
}

/** La ricerca senza maiuscole, accenti e spazi doppi (pulisciRicerca del server). */
fun pulisciRicerca(t: String): String =
    Normalizer.normalize(t, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase().replace(Regex("\\s+"), " ").trim()

// ---------------------------------------------------------------------------------- l'archivio

/** La scadenza breve di un documento (§16.4). */
data class ScadenzaBreve(val id: String, val data: String, val statoVisto: String, val giorni: Int?, val ogniMesi: Int?) {
    companion object {
        fun daJson(o: JSONObject?): ScadenzaBreve? = o?.let { ScadenzaBreve(it.testo("id"), it.testo("data"), it.testo("statoVisto"), it.numero("giorni")?.toInt(), it.numero("ogniMesi")?.toInt()) }
    }
}

/** Una revisione di un documento (§16.4): Valida, Superata, Da approvare, Respinta. */
data class VersioneDoc(
    val id: String,
    val numero: Int,
    val statoVisto: String,
    val nomeFile: String,
    val nomeDaScaricare: String,
    val mime: String,
    val byte: Long?,
    val url: String,
    val nota: String,
    val caricataDa: String,
    val caricataIl: String,
    val decisaDa: String,
    val decisaIl: String,
    val motivoRifiuto: String,
    val puoTogliere: Boolean,
) {
    val idFile: String get() = FileRemoto.idDaUrl(url)

    companion object {
        fun daJson(o: JSONObject) = VersioneDoc(
            o.testo("id"), o.numero("numero")?.toInt() ?: 0, o.testo("statoVisto"), o.testo("nomeFile"), o.testo("nomeDaScaricare").ifBlank { o.testo("nomeFile") },
            o.testo("mime"), o.numero("byte")?.toLong(), o.testo("url"), o.testo("nota"), o.testo("caricataDa"), o.testo("caricataIl"),
            o.testo("decisaDa"), o.testo("decisaIl"), o.testo("motivoRifiuto"), o.vero("puoTogliere"),
        )
    }
}

/** Un link per i clienti (§16.7): il link intero non torna mai. */
data class Condivisione(val id: String, val perChi: String, val scade: String, val revocata: Boolean, val scaduta: Boolean, val aperture: Int) {
    companion object {
        fun daJson(o: JSONObject) = Condivisione(o.testo("id"), o.testo("perChi"), o.testo("scade"), o.vero("revocata"), o.vero("scaduta"), o.optInt("aperture"))
    }
}

/**
 * Un documento dell'archivio (§16.4): un file sul NAS con le revisioni, un
 * collegamento (OneDrive, SharePoint, Drive, percorso, sito) o la copia di quello
 * che Wisper ha mandato. Il dettaglio (versioni, cronologia…) c'è con `documento {id}`.
 */
data class DocArchivio(
    val id: String,
    val idLocale: String = "",
    val titolo: String,
    val idCategoria: String = "",
    val categoria: String = "",
    val daClassificare: Boolean = false,
    val origine: String = "file",
    val collegamentoTipo: String = "",
    val collegamentoNome: String = "",
    val cartella: Boolean = false,
    val principale: Boolean = false,
    val url: String = "",
    val idCliente: String = "",
    val cliente: String = "",
    val idCommessa: String = "",
    val commessa: String = "",
    val idSede: String = "",
    val impianto: String = "",
    val idTicket: String = "",
    val ticket: String = "",
    val idContratto: String = "",
    val contratto: String = "",
    val riferimento: String = "",
    val dataDocumento: String = "",
    val revisione: Int? = null,
    val statoVisto: String = "",
    val daApprovare: Int? = null,
    val nomeFile: String = "",
    val mime: String = "",
    val byte: Long? = null,
    val scadenza: ScadenzaBreve? = null,
    val vede: String = "tutti",
    val archiviato: Boolean = false,
    val puoScrivere: Boolean = false,
    val creato: String = "",
    val modificato: String = "",
    // ---- documento {id}
    val descrizione: String = "",
    val parole: String = "",
    val versioni: List<VersioneDoc> = emptyList(),
    val condivisioni: List<Condivisione> = emptyList(),
    val cronologia: List<VoceCronologia> = emptyList(),
    val righe: List<String> = emptyList(),
    val puoApprovare: Boolean = false,
    val mieRespinte: List<Pair<Int, String>> = emptyList(),
    /** Fase 7 (fase7.md §10.4): pubblicato nel portale e visto dal cliente. */
    val portale: InfoPortale? = null,
    /** Fase 8 (fase8.md §6.2): trovato dentro il file, con l'estratto ("…di [terra] è…"). */
    val trovato: TrovatoNelTesto? = null,
) {
    val collegamento: Boolean get() = origine == "collegamento"
    val idFile: String get() = if (origine == "collegamento") "" else FileRemoto.idDaUrl(url)

    /** La revisione in attesa (se c'è nel dettaglio). */
    val versioneDaApprovare: VersioneDoc? get() = versioni.firstOrNull { it.statoVisto == "Da approvare" }

    /** "Rossi Impianti Srl · 26ST005 · Cabina MT Acme", o "Studio". */
    val legatoA: String get() = listOf(cliente.ifBlank { "Studio" }, idCommessa, impianto).filter { it.isNotBlank() }.joinToString(" · ")

    /** Il nome del file da scaricare (la valida, o quella che si apre). */
    val nomeDaScaricare: String get() = versioni.firstOrNull { it.idFile == idFile }?.nomeDaScaricare ?: nomeFile.ifBlank { titolo }

    companion object {
        fun daJson(o: JSONObject) = DocArchivio(
            id = o.testo("id"), idLocale = o.testo("idLocale"), titolo = o.testo("titolo"), idCategoria = o.testo("idCategoria"), categoria = o.testo("categoria"),
            daClassificare = o.vero("daClassificare"), origine = o.testo("origine").ifBlank { "file" }, collegamentoTipo = o.testo("collegamentoTipo"),
            collegamentoNome = o.testo("collegamentoNome").ifBlank { Collegamenti.PILLOLE[o.testo("collegamentoTipo")].orEmpty() },
            cartella = o.vero("cartella"), principale = o.vero("principale"), url = o.testo("url"),
            idCliente = o.testo("idCliente"), cliente = o.testo("cliente"), idCommessa = o.testo("idCommessa"), commessa = o.testo("commessa"),
            idSede = o.testo("idSede"), impianto = o.testo("impianto"), idTicket = o.testo("idTicket"), ticket = o.testo("ticket"),
            idContratto = o.testo("idContratto"), contratto = o.testo("contratto"), riferimento = o.testo("riferimento"), dataDocumento = o.testo("dataDocumento"),
            revisione = o.numero("revisione")?.toInt(), statoVisto = o.testo("statoVisto"), daApprovare = o.numero("daApprovare")?.toInt(),
            nomeFile = o.testo("nomeFile"), mime = o.testo("mime"), byte = o.numero("byte")?.toLong(), scadenza = ScadenzaBreve.daJson(o.optJSONObject("scadenza")),
            vede = o.testo("vede").ifBlank { "tutti" }, archiviato = o.vero("archiviato"), puoScrivere = o.vero("puoScrivere"),
            creato = o.testo("creato"), modificato = o.testo("modificato"), descrizione = o.testo("descrizione"), parole = o.testo("parole"),
            versioni = o.optJSONArray("versioni").oggetti().map(VersioneDoc::daJson),
            condivisioni = o.optJSONArray("condivisioni").oggetti().map(Condivisione::daJson),
            cronologia = VoceCronologia.elenco(o.optJSONArray("cronologia")),
            righe = o.optJSONArray("righe")?.stringhe().orEmpty(),
            puoApprovare = o.vero("puoApprovare"),
            mieRespinte = o.optJSONArray("mieRespinte").oggetti().map { (it.numero("numero")?.toInt() ?: 0) to it.testo("motivo") },
            portale = InfoPortale.daJson(o.optJSONObject("portale")),
            trovato = TrovatoNelTesto.daJson(o.optJSONObject("trovato")),
        )
    }
}

/** Quello che Wisper fa già (§16.4, "Da Wisper"): righe che aprono la loro pagina, non copie. */
data class VoceDaWisper(val tipo: String, val id: String, val titolo: String, val dettaglio: String, val data: String, val pagina: String) {
    companion object {
        fun daJson(o: JSONObject) = VoceDaWisper(o.testo("tipo"), o.testo("id"), o.testo("titolo"), o.testo("dettaglio"), o.testo("data"), o.testo("pagina"))
    }
}

data class ConteggiDocumenti(val daApprovare: Int = 0, val inScadenza: Int = 0, val scaduti: Int = 0, val daClassificare: Int = 0) {
    companion object {
        fun daJson(o: JSONObject?) = ConteggiDocumenti(o?.optInt("daApprovare") ?: 0, o?.optInt("inScadenza") ?: 0, o?.optInt("scaduti") ?: 0, o?.optInt("daClassificare") ?: 0)
    }
}

data class ElencoArchivio(
    val pagina: Int = 1,
    val pagine: Int = 1,
    val quanti: Int = 0,
    val conteggi: ConteggiDocumenti = ConteggiDocumenti(),
    val documenti: List<DocArchivio> = emptyList(),
    val daWisper: List<VoceDaWisper> = emptyList(),
) {
    companion object {
        fun daJson(o: JSONObject) = ElencoArchivio(
            o.optInt("pagina", 1), o.optInt("pagine", 1), o.optInt("quanti"), ConteggiDocumenti.daJson(o.optJSONObject("conteggi")),
            o.optJSONArray("documenti").oggetti().map(DocArchivio::daJson), o.optJSONArray("daWisper").oggetti().map(VoceDaWisper::daJson),
        )
    }
}

/** I filtri dell'archivio (§16.4): tutti facoltativi. */
data class FiltroArchivio(
    val testo: String = "",
    val idCategoria: String = "",
    val idCliente: String = "",
    val idCommessa: String = "",
    val idSede: String = "",
    val idTicket: String = "",
    val idContratto: String = "",
    val stato: String = "",
    val scadenza: String = "",
    val daClassificare: Boolean = false,
    val archiviati: Boolean = false,
    val pagina: Int = 1,
    /** Fase 8 (§6.2): cerca anche dentro i file; null = come dice il server (RICERCA_FILE). */
    val dentro: Boolean? = null,
) {
    fun parametri(): List<Pair<String, String>> = buildList {
        add("archivio" to "true")
        if (testo.isNotBlank()) add("testo" to testo.trim())
        if (idCategoria.isNotBlank()) add("idCategoria" to idCategoria)
        if (idCliente.isNotBlank()) add("idCliente" to idCliente)
        if (idCommessa.isNotBlank()) add("idCommessa" to idCommessa)
        if (idSede.isNotBlank()) add("idSede" to idSede)
        if (idTicket.isNotBlank()) add("idTicket" to idTicket)
        if (idContratto.isNotBlank()) add("idContratto" to idContratto)
        if (stato.isNotBlank()) add("stato" to stato)
        if (scadenza.isNotBlank()) add("scadenza" to scadenza)
        if (daClassificare) add("daClassificare" to "true")
        if (archiviati) add("archiviati" to "true")
        if (pagina > 1) add("pagina" to pagina.toString())
        dentro?.let { add("dentro" to it.toString()) }
    }
}

/** Una categoria dei documenti (§16.8). */
data class CategoriaDoc(
    val id: String,
    val nome: String,
    val approvazione: Boolean,
    val vede: String,
    val scadenzaMesi: Int?,
    val ordine: Int,
    val attiva: Boolean,
    val sistema: Boolean,
    val documenti: Int,
) {
    companion object {
        fun daJson(o: JSONObject) = CategoriaDoc(
            o.testo("id"), o.testo("nome"), o.vero("approvazione"), o.testo("vede").ifBlank { "tutti" }, o.numero("scadenzaMesi")?.toInt(),
            o.optInt("ordine"), if (o.has("attiva")) o.vero("attiva") else true, o.vero("sistema"), o.optInt("documenti"),
        )
    }
}

/** Il file arrivato con /carica (§16.3) e, se c'è già, il documento che lo ha. */
data class FileCaricato(val id: String, val nome: String, val mime: String, val byte: Long, val sha256: String, val giaIdDocumento: String = "", val giaTitolo: String = "", val giaRevisione: Int? = null) {
    companion object {
        fun daJson(o: JSONObject): FileCaricato {
            val f = o.optJSONObject("file") ?: JSONObject()
            val g = o.optJSONObject("gia")
            return FileCaricato(f.testo("id"), f.testo("nome"), f.testo("mime"), f.numero("byte")?.toLong() ?: 0L, f.testo("sha256"),
                g?.testo("idDocumento").orEmpty(), g?.testo("titolo").orEmpty(), g?.numero("revisione")?.toInt())
        }
    }
}

// ---------------------------------------------------------------------------------- scadenze

/** Una scadenza (§16.10): verifiche, documenti, visite dei contratti, polizze. */
data class Scadenza(
    val id: String,
    val titolo: String,
    val tipo: String = "altro",
    val tipoNome: String = "",
    val idCliente: String = "",
    val cliente: String = "",
    val idSede: String = "",
    val impianto: String = "",
    val idContratto: String = "",
    val contratto: String = "",
    val data: String = "",
    val preavvisoGiorni: Int? = null,
    val ogniMesi: Int? = null,
    val dallaFatta: Boolean = true,
    val azione: String = "promemoria",
    val anticipoGiorni: Int? = null,
    val stato: String = "aperta",
    val statoVisto: String = "",
    val statoDettaglio: String = "",
    val giorni: Int? = null,
    val fattaIl: String = "",
    val motivo: String = "",
    val idDocumento: String = "",
    val documento: String = "",
    val idTicket: String = "",
    val ticket: String = "",
    val idProssima: String = "",
    val assegnataA: String = "",
    val assegnata: String = "",
    val note: String = "",
    val puoScrivere: Boolean = false,
    /** Del telefono: segnata fatta senza rete, parte appena c'è. */
    val inCoda: Boolean = false,
    /** Fase 6 (§17.2): di chi è la scadenza (una persona, un mezzo, uno strumento, un collaboratore) e il gruppo. */
    val gruppo: String = "",
    val idPersona: String = "",
    val idVeicolo: String = "",
    val idAttrezzatura: String = "",
    val idSoggetto: String = "",
) {
    /** "ogni 5 anni", "ogni 6 mesi", "ogni anno", "una volta". */
    val ogniParole: String get() = ogniParole(ogniMesi)

    companion object {
        val TIPI = linkedMapOf(
            "verifica_terra" to "Verifica impianto di terra", "verifica_scariche" to "Verifica protezione dalle scariche",
            "verifica_protezioni" to "Verifica protezioni SPG e SPI", "manutenzione" to "Manutenzione", "documento" to "Documento",
            "polizza" to "Polizza", "contratto" to "Contratto", "altro" to "Altro",
        )

        fun ogniParole(mesi: Int?): String = when {
            mesi == null || mesi <= 0 -> "una volta"
            mesi == 12 -> "ogni anno"
            mesi % 12 == 0 -> "ogni ${mesi / 12} anni"
            mesi == 1 -> "ogni mese"
            else -> "ogni $mesi mesi"
        }

        fun daJson(o: JSONObject) = Scadenza(
            id = o.testo("id"), titolo = o.testo("titolo"), tipo = o.testo("tipo").ifBlank { "altro" }, tipoNome = o.testo("tipoNome"),
            idCliente = o.testo("idCliente"), cliente = o.testo("cliente"), idSede = o.testo("idSede"), impianto = o.testo("impianto"),
            idContratto = o.testo("idContratto"), contratto = o.testo("contratto"), data = o.testo("data"),
            preavvisoGiorni = o.numero("preavvisoGiorni")?.toInt(), ogniMesi = o.numero("ogniMesi")?.toInt()?.takeIf { it > 0 },
            dallaFatta = if (o.has("dallaFatta")) o.vero("dallaFatta") else true, azione = o.testo("azione").ifBlank { "promemoria" },
            anticipoGiorni = o.numero("anticipoGiorni")?.toInt(), stato = o.testo("stato").ifBlank { "aperta" }, statoVisto = o.testo("statoVisto"),
            statoDettaglio = o.testo("statoDettaglio"), giorni = o.numero("giorni")?.toInt(), fattaIl = o.testo("fattaIl"), motivo = o.testo("motivo"),
            idDocumento = o.testo("idDocumento"), documento = o.testo("documento"), idTicket = o.testo("idTicket"), ticket = o.testo("ticket"),
            idProssima = o.testo("idProssima"), assegnataA = o.testo("assegnataA"), assegnata = o.testo("assegnata"), note = o.testo("note"),
            puoScrivere = o.vero("puoScrivere"),
            gruppo = o.testo("gruppo"), idPersona = o.testo("idPersona"), idVeicolo = o.testo("idVeicolo"),
            idAttrezzatura = o.testo("idAttrezzatura"), idSoggetto = o.testo("idSoggetto"),
        )
    }
}

/** `scadenze {}`: le aperte divise (scadute, nel preavviso, più avanti), o quelle di un periodo ([periodo]). */
data class ElencoScadenze(
    val oggi: String = "",
    val scadute: List<Scadenza> = emptyList(),
    val entro: List<Scadenza> = emptyList(),
    val piuAvanti: List<Scadenza> = emptyList(),
    val periodo: List<Scadenza> = emptyList(),
) {
    val tutte: List<Scadenza> get() = scadute + entro + piuAvanti + periodo

    companion object {
        fun daJson(o: JSONObject) = ElencoScadenze(
            o.testo("oggi"), o.optJSONArray("scadute").oggetti().map(Scadenza::daJson), o.optJSONArray("entro").oggetti().map(Scadenza::daJson),
            o.optJSONArray("piuAvanti").oggetti().map(Scadenza::daJson), o.optJSONArray("scadenze").oggetti().map(Scadenza::daJson),
        )
    }
}

// ---------------------------------------------------------------------------------- modelli, spazio

data class TestoModello(val chiave: String, val nome: String, val testo: String, val segnaposti: List<String>, val modificato: String, val modificatoDa: String) {
    companion object {
        fun daJson(o: JSONObject) = TestoModello(o.testo("chiave"), o.testo("nome"), o.optString("testo", ""), o.optJSONArray("segnaposti")?.stringhe().orEmpty(), o.testo("modificato"), o.testo("modificatoDa"))
    }
}

data class ModelloWisper(val chiave: String, val nome: String, val testi: List<TestoModello>)

/** `modelli {}` (§16.8): i modelli di Wisper coi loro testi, quelli dello studio, i segnaposti, le lettere. */
data class Modelli(val wisper: List<ModelloWisper>, val studio: List<DocArchivio>, val segnaposti: List<String>, val lettere: List<Pair<String, String>>) {
    companion object {
        fun daJson(o: JSONObject) = Modelli(
            o.optJSONArray("wisper").oggetti().map { m -> ModelloWisper(m.testo("chiave"), m.testo("nome"), m.optJSONArray("testi").oggetti().map(TestoModello::daJson)) },
            o.optJSONArray("studio").oggetti().map(DocArchivio::daJson),
            o.optJSONArray("segnaposti")?.stringhe().orEmpty(),
            o.optJSONArray("lettere").oggetti().map { it.testo("chiave") to it.testo("nome") },
        )
    }
}

/** `componiModello` (§16.8): il testo coi segnaposti riempiti; quelli senza valore in [mancano]. */
data class ModelloComposto(val chiave: String, val titolo: String, val testo: String, val mancano: List<String>, val valori: Map<String, String>) {
    companion object {
        fun daJson(o: JSONObject): ModelloComposto {
            val v = o.optJSONObject("valori")
            return ModelloComposto(o.testo("chiave"), o.testo("titolo"), o.optString("testo", ""), o.optJSONArray("mancano")?.stringhe().orEmpty(),
                v?.keys()?.asSequence()?.associateWith { v.testo(it) }.orEmpty())
        }
    }
}

data class TipoSpazio(val tipo: String, val nome: String, val mb: Double, val quanti: Int)
data class FileGrande(val id: String, val nome: String, val mb: Double, val documento: String, val fuori: String)

/** `spazio {}` (§16.9): disco, file di Wisper per tipo, i più grandi, la copia fuori casa, il cestino vecchio. */
data class Spazio(
    val totaleMb: Double,
    val liberoMb: Double,
    val avvisoMb: Double,
    val minimoMb: Double,
    val fileMb: Double,
    val fileQuanti: Int,
    val perTipo: List<TipoSpazio>,
    val piuGrandi: List<FileGrande>,
    val fuoriUltima: String,
    val fuoriDaCopiare: Int,
    val troppoGrandi: List<FileGrande>,
    val cestinoVecchioMb: Double,
    val cestinoVecchioQuanti: Int,
    val cestinoPrima: String,
) {
    companion object {
        fun daJson(o: JSONObject): Spazio {
            val d = o.optJSONObject("disco") ?: JSONObject()
            val f = o.optJSONObject("file") ?: JSONObject()
            val fu = o.optJSONObject("fuori") ?: JSONObject()
            val cv = o.optJSONObject("cestinoVecchio") ?: JSONObject()
            fun grande(x: JSONObject) = FileGrande(x.testo("id"), x.testo("nome"), x.numero("mb") ?: 0.0, x.testo("documento"), x.testo("fuori"))
            return Spazio(
                d.numero("totaleMb") ?: 0.0, d.numero("liberoMb") ?: 0.0, d.numero("avvisoMb") ?: 0.0, d.numero("minimoMb") ?: 0.0,
                f.numero("mb") ?: 0.0, f.optInt("quanti"),
                o.optJSONArray("perTipo").oggetti().map { TipoSpazio(it.testo("tipo"), it.testo("nome"), it.numero("mb") ?: 0.0, it.optInt("quanti")) },
                o.optJSONArray("piuGrandi").oggetti().map(::grande), fu.testo("ultima"), fu.optInt("daCopiare"), fu.optJSONArray("troppoGrandi").oggetti().map(::grande),
                cv.numero("mb") ?: 0.0, cv.optInt("quanti"), cv.testo("prima"),
            )
        }

        /** "1.800 GB", "34 GB", "610 MB", "0,1 MB": lo spazio all'italiana. */
        fun parole(mb: Double): String = when {
            mb >= 10240 -> Numeri.scrivi(Math.round(mb / 1024.0).toDouble()).let { java.text.DecimalFormat("#,##0", java.text.DecimalFormatSymbols(java.util.Locale.ITALY)).format(Math.round(mb / 1024.0)) } + " GB"
            mb >= 1024 -> Numeri.scrivi(Math.round(mb / 102.4) / 10.0) + " GB"
            mb >= 10 -> Math.round(mb).toString() + " MB"
            else -> Numeri.scrivi(Math.round(mb * 10) / 10.0) + " MB"
        }
    }
}

internal fun JSONArray?.testi(): List<String> = this?.stringhe().orEmpty()
