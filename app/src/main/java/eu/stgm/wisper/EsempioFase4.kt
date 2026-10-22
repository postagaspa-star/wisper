package eu.stgm.wisper

import eu.stgm.wisper.rapportino.ContiFattura
import eu.stgm.wisper.rapportino.ParametriFattura
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.RegoleFattura
import eu.stgm.wisper.rapportino.RigaPerConti
import eu.stgm.wisper.rapportino.TrasportoFase4
import eu.stgm.wisper.rapportino.dataIt
import eu.stgm.wisper.rapportino.giornoParole
import eu.stgm.wisper.rapportino.numero
import eu.stgm.wisper.rapportino.oggetti
import eu.stgm.wisper.rapportino.testo
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/**
 * Fatture, banche e scadenze della visita guidata: un server finto in memoria che
 * risponde come quello vero (architettura.md §15), coi nomi di esempio di sempre.
 * I conti delle fatture li fa [RegoleFattura], come l'anteprima del telefono.
 * Si può preparare una bozza, passarla al programma e segnare un incasso; il resto
 * dice che è un esempio. Niente esce dal telefono.
 */
class EsempioFase4(private val oggi: LocalDate = LocalDate.now()) : TrasportoFase4 {

    private fun d(giorni: Long): String = oggi.plusDays(giorni).toString()
    private val esempio = "Nella visita guidata è un esempio: qui non si salva niente"

    private val fatture = linkedMapOf<String, JSONObject>()
    private val movimenti = ArrayList<JSONObject>()
    private var prossimo = 16

    init {
        fattura("15", "C002", "Rossi Impianti Srl", "bozza", "", d(0), true, "26ST003", "40% a fine progetto, commessa 26ST003",
            listOf(riga("40% a fine progetto: Adeguamento impianto elettrico capannone (commessa 26ST003, contratto PR/2026/012 rev. 1)", 1520.0, gruppo = "scadenza:8"),
                riga("Spesa anticipata per conto del cliente: Pratica di connessione al distributore del ${dataIt(d(-8))}", 120.0, "anticipazione", "spesa:13")))
        fattura("14", "C003", "Mario Bianchi", "pronta", "", d(-7), false, "", "Sopralluogo e rilievo, impianto fotovoltaico",
            listOf(riga("Sopralluogo e rilievo: Impianto fotovoltaico", 250.0, gruppo = "scadenza:5")))
        fattura("13", "C002", "Rossi Impianti Srl", "emessa", "45/${oggi.year}", d(-3), true, "26ST003", "Acconto 30% alla firma, commessa 26ST003",
            listOf(riga("30% alla firma: Adeguamento impianto elettrico capannone (commessa 26ST003)", 1140.0, gruppo = "scadenza:7")))
        fattura("12", "C002", "Rossi Impianti Srl", "emessa", "39/${oggi.year}", d(-42), true, "26ST002", "Progetto del quadro, commessa 26ST002",
            listOf(riga("Progetto del quadro elettrico (commessa 26ST002)", 750.0, gruppo = "scadenza:2")))
        fattura("11", "C001", "Elettrodinamica", "emessa", "38/${oggi.year}", d(-52), true, "", "Prestazioni del mese",
            listOf(riga("Prestazioni professionali (32 ore)", 960.0, gruppo = "rapportini:C001")))
        incassa("12", 500.0, d(-10), false)
        incassa("11", 1037.76, d(-23), true)
    }

    private fun riga(descrizione: String, prezzo: Double, tipo: String = "compenso", gruppo: String = "") = JSONObject()
        .put("tipo", tipo).put("descrizione", descrizione).put("quantita", 1).put("unita", "").put("prezzo", prezzo).put("importo", prezzo)
        .put("gruppo", gruppo).put("origine", "bozza").put("aliquotaIva", if (tipo == "anticipazione") 0 else 22).put("natura", if (tipo == "anticipazione") "N1" else "")
        .put("importoSorgenti", prezzo)

    private fun fattura(id: String, idCliente: String, cliente: String, stato: String, numero: String, data: String, sostituto: Boolean, idCommessa: String, causale: String, righe: List<JSONObject>) {
        val o = JSONObject().put("id", id).put("riferimento", "W-$id").put("tipo", "fattura").put("tipoDocumento", "TD01")
            .put("idCliente", idCliente).put("cliente", cliente).put("idCommessa", idCommessa).put("stato", stato).put("numero", numero)
            .put("numeroDa", if (numero.isBlank()) "" else "xml").put("data", data).put("causale", causale).put("regime", "ordinario")
            .put("ivaPercentuale", 22).put("eppiPercentuale", 5).put("ritenutaPercentuale", 20).put("ritenuta", sostituto).put("bolloRivalsa", true)
            .put("idConto", 1).put("conto", "Conto studio …3456").put("regoleConfermate", false).put("puoScrivere", true)
            .put("prontaIl", if (stato == "pronta") d(-6) + "T10:00:00" else "")
        val r = JSONArray()
        righe.forEachIndexed { i, x -> r.put(x.put("id", "${id}0$i").put("ordine", i + 1).put("ritenuta", sostituto && x.testo("tipo") == "compenso")) }
        o.put("righe", r).put("incassi", JSONArray()).put("sorgenti", JSONArray()).put("note", JSONArray()).put("avvisi", JSONArray()).put("mancano", JSONArray())
        fatture[id] = rifai(o)
    }

    /** Rifà conti, scadenza, pagamento e parole dalla fattura com'è, come farebbe il server. */
    private fun rifai(o: JSONObject): JSONObject {
        val righe = o.optJSONArray("righe").oggetti().filter { it.testo("tipo") != "bollo" }
        val p = ParametriFattura(ritenuta = o.optBoolean("ritenuta"))
        val k = RegoleFattura.calcola(p, righe.map { RigaPerConti(it.testo("tipo"), it.numero("quantita"), it.numero("prezzo"), null, false) })
        val tutte = JSONArray()
        righe.forEach { tutte.put(it.put("importo", RegoleFattura.importoRiga(RigaPerConti(it.testo("tipo"), it.numero("quantita"), it.numero("prezzo"))))) }
        if (k.bolloAddebitato > 0) tutte.put(JSONObject().put("id", o.testo("id") + "99").put("tipo", "bollo").put("descrizione", "Imposta di bollo").put("quantita", 1).put("prezzo", k.bolloAddebitato).put("importo", k.bolloAddebitato).put("natura", "N1").put("gruppo", ""))
        o.put("righe", tutte).put("conti", conti(k))
        val scadenza = LocalDate.parse(o.testo("data")).plusDays(30).toString()
        val incassato = RegoleFattura.centesimi(o.optJSONArray("incassi").oggetti().sumOf { it.numero("importo") ?: 0.0 })
        val residuo = RegoleFattura.centesimi((k.netto - incassato).coerceAtLeast(0.0))
        val stato = o.testo("stato")
        val pagamento = when {
            residuo <= 0 -> "pagata"
            incassato > 0 -> "in_parte"
            else -> "da_incassare"
        }
        val scaduta = stato == "emessa" && residuo > 0 && LocalDate.parse(scadenza).isBefore(oggi)
        val giorni = if (scaduta) java.time.temporal.ChronoUnit.DAYS.between(LocalDate.parse(scadenza), oggi).toInt() else 0
        val visto = when (stato) {
            "bozza" -> "Bozza"
            "pronta" -> if (pagamento == "pagata") "Pronta · già pagata" else "Pronta"
            else -> when {
                scaduta -> "Scaduta"
                pagamento == "pagata" -> "Pagata"
                pagamento == "in_parte" -> "Pagata in parte"
                else -> "Emessa"
            }
        }
        o.put("scadenze", JSONArray().put(JSONObject().put("id", o.testo("id")).put("data", scadenza).put("importo", k.netto).put("modalita", "MP05").put("coperta", minOf(incassato, k.netto))))
            .put("incassato", incassato).put("residuo", residuo).put("pagamento", pagamento).put("scaduta", scaduta).put("giorniScaduta", giorni)
            .put("statoVisto", visto).put("modificabile", stato == "bozza")
            .put("etichetta", when (stato) { "bozza" -> "Bozza W-" + o.testo("id"); "pronta" -> "Pronta W-" + o.testo("id"); else -> o.testo("numero") })
        return o
    }

    private fun conti(k: ContiFattura) = JSONObject().put("righe", JSONArray(k.righe)).put("compenso", k.compenso).put("contributo", k.contributo)
        .put("baseIva", k.baseIva).put("iva", k.iva).put("anticipazioni", k.anticipazioni).put("parteSenzaIva", k.parteSenzaIva).put("bollo", k.bollo)
        .put("bolloAddebitato", k.bolloAddebitato).put("totale", k.totale).put("ritenuta", k.ritenuta).put("netto", k.netto)

    private fun incassa(id: String, importo: Double, data: String, verificato: Boolean): JSONObject {
        val f = fatture[id] ?: throw PonteServer.Rifiutato("Fattura non trovata")
        val idMov = (movimenti.size + 1).toString()
        f.getJSONArray("incassi").put(JSONObject().put("idMovimento", idMov).put("data", data).put("importo", importo).put("conto", "Conto studio …3456").put("verificato", verificato))
        rifai(f)
        val m = JSONObject().put("id", idMov).put("idConto", 1).put("conto", "Conto studio …3456").put("data", data).put("verso", "entrata").put("importo", importo)
            .put("descrizione", "Incasso ${f.testo("cliente")}, fattura ${f.testo("etichetta")}" + if (f.testo("pagamento") == "in_parte") " (in parte)" else "")
            .put("soggetto", f.testo("cliente")).put("categoria", "incasso").put("verificato", verificato).put("livello", if (verificato) "verificato" else "registrato")
            .put("abbinamenti", JSONArray().put(JSONObject().put("tipo", "fattura").put("id", id).put("etichetta", f.testo("etichetta")).put("importo", importo)))
            .put("annullato", false).put("puoScrivere", true)
        movimenti.add(0, m)
        return m
    }

    private val saldoScritto = 8743.55
    private fun saldo(): Double = RegoleFattura.centesimi(saldoScritto + movimenti.filter { it.testo("data") > d(-21) }.sumOf { it.numero("importo") ?: 0.0 } - 0.0)

    // ------------------------------------------------------------------ le letture

    override suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>>): JSONObject {
        val p = parametri.toMap()
        return ok().apply {
            when (azione) {
                "daFatturare" -> daFatturare(this)
                "fatture" -> put("fatture", JSONArray(fatture.values.filter { f -> filtra(f, p) }.map { JSONObject(it.toString()).apply { remove("righe") } }))
                "fattura" -> put("fattura", fatture[p["id"]?.removePrefix("W-")] ?: throw PonteServer.Rifiutato("Fattura non trovata"))
                "pacchetto" -> pacchetto(this, fatture[p["id"]] ?: throw PonteServer.Rifiutato("Fattura non trovata"))
                "ricevute" -> put("ricevute", JSONArray(ricevute()))
                "ricevuta" -> put("ricevuta", ricevute().firstOrNull { it.testo("id") == p["id"] } ?: throw PonteServer.Rifiutato("Non trovata"))
                "riepilogoFatturato" -> riepilogo(this)
                "scadenzePagamento" -> put("scadenze", JSONArray())
                "fatturazioneCommessa" -> put("idCommessa", p["id"]).put("modoFatturazione", "corpo").put("contratto", 3800).put("fatturato", 1140).put("incassato", 0)
                    .put("daFatturare", 0).put("inBozza", 1520).put("previsto", 1140).put("scadenze", JSONArray()).put("fatture", JSONArray(fatture.values.filter { it.testo("idCommessa") == p["id"] }))
                "conti" -> put("conti", JSONArray().put(JSONObject().put("id", 1).put("nome", "Conto studio").put("banca", "Banca di esempio").put("ultimeCifre", "3456")
                    .put("predefinito", true).put("attivo", true).put("saldo", saldo()).put("saldoAl", d(-21)).put("saldoScritto", saldoScritto).put("movimentiDopo", movimenti.count { it.testo("data") > d(-21) }).put("verificatiDopo", 1)))
                    .put("collegamento", "non_collegato")
                "movimenti" -> put("movimenti", JSONArray(movimenti)).put("quante", movimenti.size).put("pagina", 1).put("pagine", 1)
                    .put("daVerificare", movimenti.count { !it.optBoolean("verificato") }).put("importaEstrattoConto", "non_collegato")
                "scadenziario" -> scadenziario(this)
                "impegni" -> put("impegni", JSONArray(impegni()))
                "situazione" -> situazione(this)
                "esporta" -> throw PonteServer.Rifiutato("Nella visita il file non si prepara")
                else -> throw PonteServer.Rifiutato(esempio)
            }
        }
    }

    private fun ok() = JSONObject().put("ok", true).put("oggi", oggi.toString())

    private fun filtra(f: JSONObject, p: Map<String, String>): Boolean = when {
        p["stato"] == "da_emettere" -> f.testo("stato") in setOf("bozza", "pronta")
        p["pagamento"] == "aperta" -> f.testo("stato") == "emessa" && (f.numero("residuo") ?: 0.0) > 0
        p["scadute"] == "true" -> f.optBoolean("scaduta")
        else -> true
    }

    private fun voce(tipo: String, id: String, titolo: String, dettaglio: String, importo: Double, gruppo: String, data: String, idCommessa: String = "", anticipazione: Boolean = false, idRapportino: String = "", spese: List<String> = emptyList(), conSpese: Double? = null) =
        JSONObject().put("tipo", tipo).put("id", id).put("titolo", titolo).put("dettaglio", dettaglio).put("importo", importo).put("gruppo", gruppo).put("data", data)
            .put("idCommessa", idCommessa).put("anticipazione", anticipazione).put("pronta", true).put("idRapportino", idRapportino).put("spese", JSONArray(spese))
            .apply { if (conSpese != null) put("totaleConSpese", conSpese) }

    private val giaPreparate = HashSet<String>()

    private fun daFatturare(o: JSONObject) {
        val mese = oggi.minusMonths(1).withDayOfMonth(3)
        val m = "rapportini:C001:" + mese.toString().take(7)
        val elettro = listOf(
            voce("rapportino", "RAP/2026/0007", "Rilievo quadri del magazzino", "6 ore · 52 km", 219.52, m, mese.toString(), spese = listOf("14"), conSpese = 227.92),
            voce("spesa", "14", "Pedaggio", "altro", 8.4, m, mese.toString(), idRapportino = "RAP/2026/0007"),
            voce("rapportino", "RAP/2026/0008", "Cablaggio quadro di linea 1", "7 ore · 52 km", 249.52, m, mese.plusDays(5).toString(), conSpese = 249.52),
            voce("rapportino", "RAP/2026/0010", "Messa in servizio nastri", "8 ore · 52 km", 279.52, m, mese.plusDays(13).toString(), conSpese = 279.52),
        )
        val rossi = listOf(
            voce("spesa", "6", "Diritti di segreteria del Comune", "26ST002 · ricevuta intestata al cliente", 52.0, "commessa:26ST002", d(-2), "26ST002", anticipazione = true),
            voce("rapportino", "RAP/2026/0013", "Collaudo quadro", "26ST002 · 6,5 ore · 48 km", 316.2, "rapportini:C002:" + oggi.toString().take(7), d(-1), "26ST002", spese = listOf("16"), conSpese = 324.6),
            voce("spesa", "16", "Pedaggio", "26ST002 · altro", 8.4, "rapportini:C002:" + oggi.toString().take(7), d(-1), "26ST002", idRapportino = "RAP/2026/0013"),
            voce("ore", "10", "Verifica impianto di terra", "26ST002 · 3 ore × 42,00 €", 126.0, "ore:26ST002:" + oggi.toString().take(7), d(-3), "26ST002"),
        )
        val gruppi = JSONArray()
        listOf(Triple("C001", "Elettrodinamica", elettro), Triple("C002", "Rossi Impianti Srl", rossi)).forEach { (id, nome, voci) ->
            val libere = voci.filter { (it.testo("tipo") + ":" + it.testo("id")) !in giaPreparate }
            if (libere.isNotEmpty()) gruppi.put(JSONObject().put("idCliente", id).put("cliente", nome).put("sostituto", true).put("mancano", JSONArray())
                .put("totale", RegoleFattura.centesimi(libere.sumOf { it.numero("importo") ?: 0.0 })).put("voci", JSONArray(libere)))
        }
        o.put("gruppi", gruppi).put("totale", RegoleFattura.centesimi(gruppi.oggetti().sumOf { it.numero("totale") ?: 0.0 })).put("clienti", gruppi.length())
            .put("piuAvanti", JSONArray().put(voce("scadenza", "9", "Saldo a fine lavori", "26ST003 · Adeguamento impianto elettrico capannone · PR/2026/012 rev. 1", 1140.0, "commessa:26ST003", "", "26ST003")
                .put("quando", "fine").put("pronta", false).put("idCliente", "C002").put("cliente", "Rossi Impianti Srl")))
            .put("inBozza", JSONArray(fatture.values.filter { it.testo("stato") in setOf("bozza", "pronta") }.map {
                JSONObject().put("idFattura", it.testo("id")).put("riferimento", it.testo("riferimento")).put("idCliente", it.testo("idCliente")).put("cliente", it.testo("cliente"))
                    .put("stato", it.testo("stato")).put("voci", 1).put("totale", it.optJSONObject("conti")?.numero("totale"))
            }))
            .put("riepiloghi", JSONArray().put(JSONObject().put("idCliente", "C001").put("mese", mese.toString().take(7)).put("rapportini", 3).put("inviatoIl", mese.withDayOfMonth(mese.lengthOfMonth()).toString() + "T18:05:00")))
            .put("raggruppa", JSONObject().put("C001", "mese").put("C002", "rapportino")).put("daFirmare", JSONArray())
    }

    private fun pacchetto(o: JSONObject, f: JSONObject) {
        val k = f.getJSONObject("conti")
        fun c(e: String, v: String) = JSONObject().put("etichetta", e).put("valore", v)
        fun e(n: Double?) = eu.stgm.wisper.rapportino.Numeri.euro(n ?: 0.0).removeSuffix(" €")
        val sezioni = JSONArray()
            .put(JSONObject().put("titolo", "Cliente").put("campi", JSONArray().put(c("Denominazione", f.testo("cliente"))).put(c("Partita IVA", "04455667784")).put(c("Codice destinatario", "0000000"))))
            .put(JSONObject().put("titolo", "Documento").put("campi", JSONArray().put(c("Tipo", "Fattura (TD01)")).put(c("Data proposta", dataIt(f.testo("data")))).put(c("Numero", "lo dà il programma")).put(c("Causale", f.testo("causale") + ". Rif. Wisper " + f.testo("riferimento")))))
            .put(JSONObject().put("titolo", "Totali").put("campi", JSONArray().put(c("Totale della fattura", e(k.numero("totale")))).put(c("Netto da incassare", e(k.numero("netto"))))))
        o.put("uscite", JSONArray().put("prospetto")).put("modello", JSONObject().put("riferimento", f.testo("riferimento"))).put("mancano", JSONArray())
            .put("prospetto", JSONObject().put("titolo", "Prospetto per il programma delle fatture").put("avviso", "Conti da verificare: regole non confermate dal commercialista").put("sezioni", sezioni)
                .put("testo", sezioni.oggetti().joinToString("\n\n") { s -> s.testo("titolo").uppercase() + "\n" + s.optJSONArray("campi").oggetti().joinToString("\n") { it.testo("etichetta") + ": " + it.testo("valore") } }))
    }

    private fun ricevute(): List<JSONObject> = listOf(
        JSONObject().put("id", "1").put("fornitore", "Materiale Elettrico Esempio Srl").put("numero", "A/233").put("data", d(-6)).put("categoria", "materiale").put("idCommessa", "26ST002")
            .put("totale", 486).put("ritenuta", 0).put("netto", 486).put("pagato", 0).put("daPagare", 486).put("statoVisto", "Da pagare").put("puoScrivere", true)
            .put("scadenze", JSONArray().put(JSONObject().put("id", 1).put("data", d(25)).put("importo", 486).put("coperta", 0))).put("pagamenti", JSONArray()),
        JSONObject().put("id", "2").put("fornitore", "Noleggi Piattaforme Prova Snc").put("numero", "77").put("data", d(-24)).put("categoria", "servizi")
            .put("totale", 732).put("ritenuta", 0).put("netto", 732).put("pagato", 0).put("daPagare", 732).put("statoVisto", "Da pagare").put("puoScrivere", true)
            .put("scadenze", JSONArray().put(JSONObject().put("id", 2).put("data", d(6)).put("importo", 732).put("coperta", 0))).put("pagamenti", JSONArray()),
    )

    private fun impegno(id: String, tipo: String, descrizione: String, codice: String, giorni: Long, importo: Double?, ripete: String = "", proposta: Boolean = false) =
        JSONObject().put("id", id).put("tipo", tipo).put("verso", "uscita").put("descrizione", descrizione).put("codice", codice).put("scadenza", d(giorni))
            .put("importo", importo ?: JSONObject.NULL).put("importoDaScrivere", importo == null).put("ripete", ripete).put("confermato", !proposta).put("proposta", proposta)
            .put("pagato", 0).put("daPagare", importo ?: JSONObject.NULL).put("stato", "aperto").put("statoVisto", if (proposta) "Proposta" else "Da pagare").put("puoScrivere", true)
            .apply { if (ripete.isNotBlank()) put("ricorrenza", JSONObject().put("regola", "mesi").put("ogni", 1).put("fine", "")) }

    private fun impegni(): List<JSONObject> = listOf(
        impegno("2", "rata", "Affitto ufficio", "", 4, 850.0, "ogni mese"),
        impegno("14", "altro", "Luce e gas dell'ufficio", "", 14, 142.3, "ogni mese"),
        impegno("26", "f24", "IVA del 3° trimestre", "6033", 25, 2380.0),
        impegno("40", "f24", "Ritenute sui compensi pagati a ottobre", "1040", 25, 100.0, proposta = true),
        impegno("27", "f24", "Secondo acconto IRPEF", "4034", 39, 3400.0),
    )

    private fun scadenziario(o: JSONObject) {
        data class R(val giorni: Long, val j: JSONObject)
        val righe = ArrayList<R>()
        impegni().forEach { i ->
            righe.add(R(java.time.temporal.ChronoUnit.DAYS.between(oggi, LocalDate.parse(i.testo("scadenza"))), JSONObject().put("tipo", "impegno").put("id", i.testo("id")).put("verso", "uscita")
                .put("titolo", i.testo("descrizione")).put("dettaglio", i.testo("ripete").ifBlank { "codice " + i.testo("codice") }).put("importo", i.numero("importo"))
                .put("stato", if (i.optBoolean("proposta")) "proposto" else "previsto").put("proposta", i.optBoolean("proposta")).put("contaNelSaldo", true)))
        }
        ricevute().forEach { r ->
            righe.add(R(java.time.temporal.ChronoUnit.DAYS.between(oggi, LocalDate.parse(r.getJSONArray("scadenze").getJSONObject(0).testo("data"))), JSONObject().put("tipo", "ricevuta").put("id", r.testo("id")).put("verso", "uscita")
                .put("titolo", r.testo("fornitore") + " · fattura " + r.testo("numero")).put("dettaglio", r.testo("categoria")).put("importo", r.numero("daPagare")).put("stato", "previsto").put("contaNelSaldo", true)))
        }
        val scaduti = JSONArray()
        fatture.values.filter { it.testo("stato") == "emessa" && (it.numero("residuo") ?: 0.0) > 0 }.forEach { f ->
            val data = f.getJSONArray("scadenze").getJSONObject(0).testo("data")
            val giorni = java.time.temporal.ChronoUnit.DAYS.between(oggi, LocalDate.parse(data))
            val riga = JSONObject().put("tipo", "fattura").put("id", f.testo("id")).put("data", data).put("verso", "entrata").put("titolo", f.testo("numero") + " · " + f.testo("cliente"))
                .put("importo", f.numero("residuo")).put("proposta", false)
            if (giorni < 0) scaduti.put(riga.put("dettaglio", "scaduto da ${-giorni} giorni" + if (f.testo("pagamento") == "in_parte") " · pagata in parte" else "").put("stato", "scaduto").put("contaNelSaldo", false))
            else righe.add(R(giorni, riga.put("dettaglio", "fattura emessa").put("stato", if (f.testo("pagamento") == "in_parte") "in_parte" else "previsto").put("contaNelSaldo", true)))
        }
        var s = saldo()
        val soglia = 3000.0
        var primo = ""
        val giorni = JSONArray()
        righe.sortedBy { it.giorni }.groupBy { it.giorni }.forEach { (g, rr) ->
            rr.forEach { r -> s = RegoleFattura.centesimi(s + (if (r.j.testo("verso") == "entrata") 1 else -1) * (r.j.numero("importo") ?: 0.0)) }
            val data = d(g)
            if (s < soglia && primo.isBlank()) primo = data
            giorni.put(JSONObject().put("data", data).put("titolo", giornoParole(data).replaceFirstChar { it.uppercase() }).put("saldo", s).put("sottoSoglia", s < soglia)
                .put("righe", JSONArray(rr.map { it.j.put("data", data) })))
        }
        o.put("saldoOggi", saldo()).put("saldoPartenza", saldo()).put("soglia", soglia).put("scaduti", scaduti).put("giorni", giorni)
            .put("senzaData", JSONObject().put("entrate", 1140).put("voci", 1)).put("primoSottoSoglia", primo).put("nota", "Gli incassi scaduti non entrano nel saldo previsto")
    }

    private fun situazione(o: JSONObject) {
        val sc = JSONObject()
        scadenziario(sc)
        val giorni = sc.getJSONArray("giorni").oggetti()
        fun previsto(n: Long) = giorni.lastOrNull { it.testo("data") <= d(n) }?.numero("saldo") ?: saldo()
        val aperte = fatture.values.filter { it.testo("stato") == "emessa" }
        o.put("saldi", JSONArray().put(JSONObject().put("idConto", 1).put("nome", "Conto studio …3456").put("saldo", saldo()))).put("saldoOggi", saldo()).put("soglia", 3000)
            .put("daIncassare", RegoleFattura.centesimi(aperte.sumOf { it.numero("residuo") ?: 0.0 }))
            .put("scadutoDaIncassare", RegoleFattura.centesimi(aperte.filter { it.optBoolean("scaduta") }.sumOf { it.numero("residuo") ?: 0.0 }))
            .put("daPagare30", RegoleFattura.centesimi(giorni.filter { it.testo("data") <= d(30) }.flatMap { it.optJSONArray("righe").oggetti() }.filter { it.testo("verso") == "uscita" }.sumOf { it.numero("importo") ?: 0.0 }))
            .put("scadutoDaPagare", 0).put("previsto", JSONObject().put("30", previsto(30)).put("60", previsto(60)).put("90", previsto(90)))
            .put("primoSottoSoglia", sc.testo("primoSottoSoglia"))
            .put("settimane", JSONArray((0 until 13).map { w ->
                val da = oggi.with(java.time.DayOfWeek.MONDAY).plusWeeks(w.toLong())
                val dentro = giorni.filter { it.testo("data") >= da.toString() && it.testo("data") <= da.plusDays(6).toString() }.flatMap { it.optJSONArray("righe").oggetti() }
                val saldoW = giorni.lastOrNull { it.testo("data") <= da.plusDays(6).toString() }?.numero("saldo") ?: saldo()
                JSONObject().put("da", da.toString()).put("a", da.plusDays(6).toString())
                    .put("entrate", dentro.filter { it.testo("verso") == "entrata" }.sumOf { it.numero("importo") ?: 0.0 })
                    .put("uscite", dentro.filter { it.testo("verso") == "uscita" }.sumOf { it.numero("importo") ?: 0.0 })
                    .put("saldo", saldoW).put("sottoSoglia", saldoW < 3000)
            }))
            .put("fatturatoAnno", RegoleFattura.centesimi(aperte.sumOf { it.getJSONObject("conti").numero("compenso") ?: 0.0 }))
            .put("incassatoAnno", RegoleFattura.centesimi(movimenti.filter { it.testo("verso") == "entrata" }.sumOf { it.numero("importo") ?: 0.0 }))
            .put("collegamento", "non_collegato")
    }

    private fun riepilogo(o: JSONObject) {
        val emesse = fatture.values.filter { it.testo("stato") == "emessa" }
        val righe = (1..oggi.monthValue).reversed().map { m ->
            val del = emesse.filter { LocalDate.parse(it.testo("data")).monthValue == m && LocalDate.parse(it.testo("data")).year == oggi.year }
            JSONObject().put("chiave", "%d-%02d".format(oggi.year, m)).put("nome", eu.stgm.wisper.rapportino.Conti.nomeMese(java.time.YearMonth.of(oggi.year, m)).lowercase())
                .put("fatture", del.size).put("compenso", del.sumOf { it.getJSONObject("conti").numero("compenso") ?: 0.0 })
                .put("totale", del.sumOf { it.getJSONObject("conti").numero("totale") ?: 0.0 })
                .put("incassato", movimenti.filter { LocalDate.parse(it.testo("data")).monthValue == m }.sumOf { it.numero("importo") ?: 0.0 })
        }.reversed()
        o.put("anno", oggi.year).put("per", "mese").put("righe", JSONArray(righe))
            .put("fatturato", RegoleFattura.centesimi(emesse.sumOf { it.getJSONObject("conti").numero("compenso") ?: 0.0 }))
            .put("incassato", RegoleFattura.centesimi(movimenti.filter { it.testo("verso") == "entrata" }.sumOf { it.numero("importo") ?: 0.0 }))
    }

    // ------------------------------------------------------------------ le scritture della visita

    override suspend fun scriviAzione(corpo: JSONObject): JSONObject {
        val id = corpo.testo("id").ifBlank { corpo.testo("idFattura") }
        return when (corpo.testo("azione")) {
            "segnaIncasso" -> {
                val f = fatture[id] ?: throw PonteServer.Rifiutato("Fattura non trovata")
                val residuo = f.numero("residuo") ?: 0.0
                if (residuo <= 0) throw PonteServer.Rifiutato("La fattura ${f.testo("etichetta")} è già pagata")
                val importo = corpo.numero("importo") ?: residuo
                if (importo > residuo + 0.005) throw PonteServer.Rifiutato("La fattura ${f.testo("etichetta")} ha ancora da incassare ${eu.stgm.wisper.rapportino.Numeri.euro(residuo).removeSuffix(" €")}: non puoi abbinarne ${eu.stgm.wisper.rapportino.Numeri.euro(importo).removeSuffix(" €")}")
                val m = incassa(id, RegoleFattura.centesimi(importo), corpo.testo("data").ifBlank { oggi.toString() }, corpo.optBoolean("verificato"))
                ok().put("movimento", m).put("fattura", f)
            }
            "passaAlProgramma" -> {
                val f = fatture[id] ?: throw PonteServer.Rifiutato("Fattura non trovata")
                if (f.testo("stato") == "bozza" && !corpo.optBoolean("conferma")) {
                    throw PonteServer.DaConfermare("Le regole delle fatture non sono ancora confermate dal commercialista: passala lo stesso?", JSONObject().put("serveConferma", true))
                }
                f.put("stato", "pronta").put("prontaIl", oggi.toString() + "T09:00:00")
                rifai(f)
                ok().put("fattura", f).put("pacchetto", JSONObject().also { pacchetto(it, f) })
            }
            "preparaFattura" -> {
                val voci = corpo.optJSONArray("voci").oggetti()
                if (voci.isEmpty()) throw PonteServer.Rifiutato("Scegli almeno una cosa da fatturare")
                val tutte = JSONObject().also { daFatturare(it) }.optJSONArray("gruppi").oggetti().flatMap { it.optJSONArray("voci").oggetti() }
                val scelte = voci.mapNotNull { v -> tutte.firstOrNull { it.testo("tipo") == v.testo("tipo") && it.testo("id") == v.opt("id").toString() } }
                val nuovo = (prossimo++).toString()
                val idCliente = corpo.testo("idCliente")
                fattura(nuovo, idCliente, if (idCliente == "C001") "Elettrodinamica" else "Rossi Impianti Srl", "bozza", "", oggi.toString(), true, "", "Prestazioni professionali",
                    scelte.filter { it.testo("tipo") != "spesa" || it.optBoolean("anticipazione") || it.testo("idRapportino").isBlank() }.map {
                        val tipo = if (it.optBoolean("anticipazione")) "anticipazione" else "compenso"
                        riga((if (it.testo("tipo") == "rapportino") "Rapportino ${it.testo("id")}: " else "") + it.testo("titolo"), it.numero("totaleConSpese") ?: it.numero("importo") ?: 0.0, tipo, it.testo("gruppo"))
                    })
                scelte.forEach { giaPreparate.add(it.testo("tipo") + ":" + it.testo("id")) }
                ok().put("fattura", fatture[nuovo])
            }
            else -> throw PonteServer.Rifiutato(esempio)
        }
    }

    override suspend fun file(id: String): Pair<ByteArray, String> = throw PonteServer.Rifiutato("Nella visita il file non c'è")
}
