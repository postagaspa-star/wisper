package eu.stgm.wisper

import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.TrasportoFase5
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime

/**
 * Documenti, ticket e assistenza della visita guidata: un server finto in memoria
 * che risponde come quello vero (architettura.md §16), coi nomi di esempio di
 * sempre. Si guarda tutto; scrivere dice che è un esempio. Niente esce dal telefono.
 */
class EsempioFase5(private val oggi: LocalDate = LocalDate.now()) : TrasportoFase5 {

    private val esempio = "Nella visita guidata è un esempio: qui non si salva niente"
    private fun d(giorni: Long) = oggi.plusDays(giorni).toString()
    private fun ist(giorni: Long, ora: Int, minuti: Int = 0) = LocalDateTime.of(oggi.plusDays(giorni), java.time.LocalTime.of(ora, minuti)).toString() + ":00"

    private fun arr(vararg o: JSONObject) = JSONArray().apply { o.forEach { put(it) } }

    private fun ticket(
        id: Int, titolo: String, tipo: String, idCliente: String, cliente: String, idSede: Int, impianto: String, priorita: String, stato: String,
        responsabile: Pair<Int, String>?, aperto: String, dettaglio: String = "", ritardo: String = "", contratto: String = "", fatt: String = "",
    ): JSONObject {
        val statoVisto = mapOf("aperto" to "Aperto", "in_carico" to "In carico", "in_attesa" to "In attesa", "risolto" to "Risolto", "chiuso" to "Chiuso")[stato]
        return JSONObject().put("id", id).put("numero", "TK/${oggi.year}/" + id.toString().padStart(4, '0')).put("idLocale", "").put("titolo", titolo)
            .put("tipo", tipo).put("tipoNome", mapOf("guasto" to "Guasto", "assistenza" to "Assistenza", "programmato" to "Programmato", "piccolo" to "Piccolo intervento")[tipo])
            .put("idCliente", idCliente).put("cliente", cliente).put("idSede", idSede).put("impianto", impianto)
            .put("idCommessa", "").put("commessa", "").put("idContratto", if (contratto.isBlank()) JSONObject.NULL else 2).put("contratto", contratto)
            .put("priorita", priorita).put("prioritaNome", priorita.replaceFirstChar { it.uppercase() }).put("stato", stato).put("statoVisto", statoVisto)
            .put("statoDettaglio", dettaglio).put("inRitardo", ritardo.isNotBlank()).put("ritardo", ritardo)
            .put("responsabileId", responsabile?.first ?: JSONObject.NULL).put("responsabile", responsabile?.second ?: "")
            .put("apertoIl", aperto).put("previstoIl", if (tipo == "programmato") d(28) else "")
            .put("entroPresa", aperto).put("entroIntervento", aperto).put("prossimoIntervento", JSONObject.NULL).put("rapportini", 0)
            .put("origine", "telefono").put("origineNome", "Telefono").put("fatturazione", fatt).put("fatturazioneNome", mapOf("ticket" to "Una riga", "no" to "Non si fattura")[fatt] ?: "")
            .put("chiusoIl", if (stato == "chiuso") ist(-8, 17) else "").put("puoScrivere", stato != "chiuso").put("puoPrendere", stato == "aperto" && responsabile == null).put("fattura", JSONObject.NULL)
    }

    private val aperti = listOf(
        ticket(14, "Scatta il generale MT", "guasto", "C002", "Rossi Impianti Srl", 4, "Cabina MT Acme", "urgente", "aperto", null, ist(0, 8, 40),
            ritardo = "Da prendere da 25 minuti", contratto = "CA/${oggi.year}/002"),
        ticket(13, "Navetta 2 si ferma in errore", "guasto", "C004", "Batokyo Srl", 6, "Magazzino automatico", "alta", "in_carico", 3 to "Marco Rossato", ist(-1, 16, 10),
            dettaglio = "oggi alle 14:30").put("prossimoIntervento", JSONObject().put("id", 25).put("inizio", ist(0, 14, 30)).put("fine", ist(0, 16)).put("assegnataA", 3).put("assegnata", "Marco Rossato").put("luogo", "Schio")),
        ticket(12, "Inverter in errore di isolamento", "guasto", "C003", "Mario Bianchi", 8, "Impianto fotovoltaico 6 kW", "normale", "risolto", 1 to "Manuel Gasparotto", ist(-2, 9, 15)),
        ticket(11, "Aggiungere un'uscita al PLC", "piccolo", "C001", "Elettrodinamica", 9, "Quadro di linea 3", "bassa", "in_attesa", 1 to "Manuel Gasparotto", ist(-7, 11),
            dettaglio = "Aspetta il modulo di uscite dal fornitore"),
    )
    private val programmati = listOf(ticket(15, "Manutenzione cabina MT Acme", "programmato", "C002", "Rossi Impianti Srl", 4, "Cabina MT Acme", "normale", "in_carico", 1 to "Manuel Gasparotto", ist(-1, 2)))
    private val chiusi = listOf(
        ticket(10, "Presa del quadro bruciata", "guasto", "C002", "Rossi Impianti Srl", 5, "Quadro generale capannone", "alta", "chiuso", 1 to "Manuel Gasparotto", ist(-10, 8, 5), dettaglio = "una riga per l'intervento", fatt = "ticket"),
        ticket(9, "Domanda sulla selettività degli interruttori", "assistenza", "C004", "Batokyo Srl", 6, "Magazzino automatico", "bassa", "chiuso", 3 to "Marco Rossato", ist(-13, 10), dettaglio = "non si fattura", fatt = "no"),
    )

    private fun dettaglio(t: JSONObject): JSONObject {
        val o = JSONObject(t.toString())
        val id = o.optInt("id")
        o.put("descrizione", if (id == 14) "Il generale della cabina scatta appena lo riarmano. Lo stabilimento è fermo." else "")
            .put("richiedente", if (id == 14) "Sig. Ferretti, manutenzione · 0445 000201" else "").put("idReferente", JSONObject.NULL).put("rifCliente", "")
            .put("impatto", if (id == 14) "fermo" else "").put("urgenza", if (id == 14) "subito" else "").put("prioritaAMano", false)
            .put("presoIl", "").put("interventoIl", "").put("risoltoIl", "").put("annullatoIl", "").put("motivo", "").put("esito", "")
            .put("prezzoCorpo", JSONObject.NULL).put("motivoNo", "").put("fatturatoIl", "").put("idScadenza", JSONObject.NULL).put("referente", JSONObject.NULL)
            .put("indirizzoImpianto", if (id == 14) "Via dell'Artigianato 9, 36010 Zanè (VI)" else "")
            .put("interventi", JSONArray()).put("rapportini", JSONArray()).put("ore", JSONArray()).put("spese", JSONArray()).put("foto", JSONArray()).put("documenti", JSONArray())
            .put("somma", JSONObject().put("ore", 0).put("km", 0).put("materiale", 0).put("spese", 0))
            .put("proposta", JSONObject().put("fatturazione", "contratto").put("perche", "Nel contratto CA/${oggi.year}/002: copre visite e guasti"))
            .put("daFirmare", "").put("riservata", JSONObject.NULL).put("puoChiudere", true)
            .put("storico", arr(
                JSONObject().put("tipo", "rapportino").put("data", d(-126)).put("titolo", "RAP/${oggi.year}/0098 · Manutenzione semestrale").put("dettaglio", "Manuel Gasparotto · 4 ore · firmato da R. Ferretti").put("id", "RAP/${oggi.year}/0098").put("apribile", false),
                JSONObject().put("tipo", "documento").put("data", d(-126)).put("titolo", "Schema unifilare cabina MT rev. 2").put("dettaglio", "Progetti e schemi · Valida").put("id", 1),
            ))
            .put("cronologia", arr(JSONObject().put("quando", o.testo("apertoIl")).put("chi", "Manuel Gasparotto").put("testo", "Aperto da Manuel Gasparotto (telefono)")))
            .put("giallo", when (o.testo("stato")) { "aperto" -> "prendi"; "in_carico" -> "rapportino"; "in_attesa" -> "riprendi"; "risolto" -> "chiudi"; else -> "" })
        return o
    }

    private fun JSONObject.testo(k: String) = optString(k, "")

    private fun documento(id: Int, titolo: String, categoria: String, origine: String, coll: String, url: String, cliente: String = "", impianto: String = "", stato: String = "Valida", rev: Int? = 0) =
        JSONObject().put("id", id).put("titolo", titolo).put("categoria", categoria).put("origine", origine).put("collegamentoTipo", coll)
            .put("collegamentoNome", mapOf("onedrive" to "OneDrive", "gdrive" to "Google Drive", "percorso" to "Cartella del computer", "web" to "Sito")[coll] ?: "")
            .put("cartella", coll == "onedrive" || coll == "percorso").put("url", url).put("cliente", cliente).put("impianto", impianto)
            .put("statoVisto", if (origine == "collegamento") "Collegamento" else stato).put("revisione", if (origine == "collegamento") JSONObject.NULL else rev)
            .put("daApprovare", if (id == 1) 3 else JSONObject.NULL).put("dataDocumento", d(-120)).put("vede", "tutti").put("puoScrivere", true)
            .put("nomeFile", if (origine == "file") "$titolo.pdf" else "").put("mime", if (origine == "file") "application/pdf" else "")
            .put("versioni", JSONArray()).put("cronologia", arr(JSONObject().put("quando", ist(-120, 10)).put("chi", "Manuel Gasparotto").put("testo", "Aggiunto da Manuel Gasparotto")))

    private val documenti = listOf(
        documento(1, "Schema unifilare cabina MT", "Progetti e schemi", "file", "", "/file/esempio1", "Rossi Impianti Srl", "Cabina MT Acme", rev = 2),
        documento(4, "Cartella della commessa 26ST003", "Progetti e schemi", "collegamento", "onedrive", "https://esempio-my.sharepoint.com/:f:/g/personal/studio/Commesse/26ST003", "Rossi Impianti Srl"),
        documento(5, "Progetto impianto fotovoltaico Bianchi", "Progetti e schemi", "collegamento", "gdrive", "https://drive.google.com/file/d/1AbCdEsempio/view", "Mario Bianchi"),
        documento(3, "Verbale verifica impianto di terra 2022", "Verbali di verifica", "file", "", "/file/esempio3", "Batokyo Srl", "Impianto di terra stabilimento"),
        documento(9, "Schemi elettrici archivio 2019", "Documenti dello studio", "collegamento", "percorso", "\\\\SERVER-STUDIO\\Archivio\\2019\\Schemi"),
        documento(11, "Relazione tecnica cabina MT", "Relazioni", "file", "", "/file/esempio11", "Rossi Impianti Srl", "Cabina MT Acme", rev = 1),
    )

    /** Fase 8: il testo letto dentro i file di esempio (la ricerca dentro i file, fase8.md §6). */
    private val testoDentro = mapOf(
        1 to "Schema unifilare: collettore di terra principale QG-PE, sezionatore di terra lato MT, interblocchi meccanici.",
        11 to "Relazione tecnica. La misura della resistenza di terra è stata eseguita il 12/03/2026 con il metodo voltamperometrico: 1,8 ohm.",
    )

    /** "…la misura della resistenza di [terra] è stata eseguita…": le parole trovate tra parentesi quadre. */
    private fun estratto(testo: String, parole: List<String>): String {
        val prima = parole.first()
        val i = testo.lowercase().indexOf(prima).coerceAtLeast(0)
        val da = (i - 40).coerceAtLeast(0)
        val a = (i + prima.length + 60).coerceAtMost(testo.length)
        var pezzo = testo.substring(da, a)
        parole.forEach { w -> pezzo = pezzo.replace(Regex(Regex.escape(w), RegexOption.IGNORE_CASE)) { m -> "[" + m.value + "]" } }
        return (if (da > 0) "…" else "") + pezzo + (if (a < testo.length) "…" else "")
    }

    private fun scadenza(id: Int, titolo: String, cliente: String, impianto: String, giorni: Long, stato: String, ogni: Int?) =
        JSONObject().put("id", id).put("titolo", titolo).put("tipo", "verifica_terra").put("cliente", cliente).put("impianto", impianto).put("data", d(giorni))
            .put("statoVisto", stato).put("statoDettaglio", if (giorni < 0) "da ${-giorni} giorni" else "").put("giorni", Math.abs(giorni)).put("ogniMesi", ogni ?: JSONObject.NULL)
            .put("preavvisoGiorni", 90).put("azione", "promemoria").put("stato", "aperta").put("puoScrivere", true)

    override suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>>): JSONObject {
        val p = parametri.toMap()
        val ok = JSONObject().put("ok", true)
        return when (azione) {
            "tickets" -> {
                val l = when (p["segmento"]) { "programmati" -> programmati; "chiusi" -> chiusi; else -> aperti }
                ok.put("adesso", ist(0, 10, 5)).put("segmento", p["segmento"] ?: "aperti")
                    .put("conteggi", JSONObject().put("aperti", 4).put("urgenti", 1).put("nonAssegnati", 1).put("inRitardo", 1).put("risoltiDaChiudere", 1).put("programmatiDaPianificare", 1))
                    .put("ticket", JSONArray(l.map { JSONObject(it.toString()) }))
            }
            "ticket" -> {
                val k = p["id"].orEmpty()
                val t = (aperti + programmati + chiusi).firstOrNull { it.optString("id") == k || it.optString("numero") == k } ?: throw PonteServer.Rifiutato("Ticket $k non trovato")
                ok.put("ticket", dettaglio(t))
            }
            "contratti" -> ok.put("oggi", d(0)).put("contratti", arr(
                JSONObject().put("id", 2).put("numero", "CA/${oggi.year}/002").put("titolo", "Manutenzione cabina MT Acme").put("idCliente", "C002").put("cliente", "Rossi Impianti Srl")
                    .put("dal", "${oggi.year}-01-01").put("al", "${oggi.year}-12-31").put("rinnovo", "tacito").put("stato", "attivo").put("statoVisto", "Attivo").put("canone", 1200)
                    .put("fatturazioneCanone", "semestrale").put("copre", "visite_guasti").put("impianti", arr(JSONObject().put("idSede", 4).put("nome", "Cabina MT Acme").put("ogniMesi", 6).put("prossimaVisita", d(29))))
                    .put("ticket", JSONObject().put("aperti", 2).put("anno", 3)).put("puoScrivere", false),
            ))
            "documenti" -> {
                // Fase 8 (fase8.md §6.2): con le parole, prima i titoli che le hanno, poi i documenti che le hanno dentro (con l'estratto).
                val parole = p["testo"].orEmpty().trim().lowercase().split(' ').filter { it.isNotBlank() }
                val trovati = if (parole.isEmpty()) documenti.map { JSONObject(it.toString()) } else {
                    val titolo = { d: JSONObject -> parole.all { d.testo("titolo").lowercase().contains(it) } }
                    val nelTitolo = documenti.filter(titolo).map { JSONObject(it.toString()) }
                    val dentro = if (p["dentro"] == "false") emptyList() else documenti.filterNot(titolo).mapNotNull { d ->
                        testoDentro[d.optInt("id")]?.takeIf { t -> parole.all { t.lowercase().contains(it) } }?.let { t ->
                            JSONObject(d.toString()).put("trovato", JSONObject().put("revisione", d.opt("revisione")).put("superata", false).put("estratto", estratto(t, parole)))
                        }
                    }
                    nelTitolo + dentro
                }
                ok.put("pagina", 1).put("pagine", 1).put("quanti", trovati.size)
                    .put("conteggi", JSONObject().put("daApprovare", 1).put("inScadenza", 1).put("scaduti", 0).put("daClassificare", 0))
                    .put("documenti", JSONArray(trovati)).put("daWisper", JSONArray())
            }
            "documento" -> ok.put("documento", documenti.firstOrNull { it.optString("id") == p["id"] } ?: throw PonteServer.Rifiutato("Documento ${p["id"]} non trovato"))
            "scadenze" -> ok.put("oggi", d(0))
                .put("scadute", arr(scadenza(7, "Verifica protezioni SPG e SPI", "Rossi Impianti Srl", "Cabina MT Acme", -22, "Scaduta", 60)))
                .put("entro", arr(scadenza(5, "Verifica impianto di terra (DPR 462)", "Batokyo Srl", "Impianto di terra stabilimento", 82, "Scade fra 82 giorni", 60)))
                .put("piuAvanti", JSONArray()).put("scadenze", JSONArray())
            "categorieDocumenti" -> ok.put("categorie", JSONArray(listOf("Progetti e schemi", "Dichiarazioni di conformità", "Verbali di verifica", "Certificati", "Corrispondenza", "Foto", "Modelli dello studio").mapIndexed { i, n ->
                JSONObject().put("id", i + 1).put("nome", n).put("approvazione", i < 2).put("vede", "tutti").put("ordine", i + 1).put("attiva", true).put("documenti", 1)
            }))
            "statisticheTicket" -> ok.put("da", d(-365)).put("a", d(0)).put("per", p["per"] ?: "tipo")
                .put("totale", JSONObject().put("aperti", 31).put("chiusi", 27).put("inCorso", 4).put("interventoMedioOre", 19).put("entroITempi", 85).put("ore", 96.5).put("km", 1840))
                .put("righe", arr(JSONObject().put("chiave", "guasto").put("nome", "Guasti").put("aperti", 14).put("chiusi", 12).put("interventoMedioOre", 6.2).put("ore", 41)))
            else -> throw PonteServer.Rifiutato(esempio)
        }
    }

    override suspend fun scriviAzione(corpo: JSONObject): JSONObject = throw PonteServer.Rifiutato(esempio)
    override suspend fun file(id: String): Pair<ByteArray, String> = throw PonteServer.Rifiutato(esempio)
    override suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray): JSONObject = throw PonteServer.Rifiutato(esempio)
}
