package eu.stgm.wisper

import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.TrasportoFase5
import eu.stgm.wisper.rapportino.Whatsapp
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Comunicazioni e portale della visita guidata (fase7.md): un server finto in memoria che
 * risponde come quello vero (§10), coi nomi di esempio dell'accordo e del prototipo
 * (Rossi Impianti Srl con Sig. Ferretti, Mario Bianchi privato). Solo dati di esempio.
 * Scrivere dice che è un esempio.
 */
class EsempioFase7(private val oggi: LocalDate = LocalDate.now()) : TrasportoFase5 {

    private val esempio = "Nella visita guidata è un esempio: qui non si salva niente"
    private fun arr(vararg o: JSONObject) = JSONArray().apply { o.forEach { put(it) } }
    private fun ora(giorni: Long, h: Int, m: Int) = oggi.plusDays(giorni).atTime(h, m).toString() + ":00"
    private val domani = generateSequence(oggi.plusDays(1)) { it.plusDays(1) }.first { it.dayOfWeek != DayOfWeek.SATURDAY && it.dayOfWeek != DayOfWeek.SUNDAY }
    private val giornoDomani = domani.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALY))
    private val portale = "https://studiogm-portale.netlify.app"

    private fun a(id: Int, nome: String, cliente: String, idCliente: String, tel: String, email: String, ok: Boolean): JSONObject {
        val n = Whatsapp.numero(tel)
        return JSONObject().put("idReferente", id).put("nome", nome).put("cliente", cliente).put("idCliente", idCliente)
            .put("numero", if (n.valido) n.numero else "").put("numeroVisto", n.visto).put("email", email).put("whatsappOk", ok).put("fisso", n.fisso)
    }

    private val ferretti = a(5, "Sig. Ferretti", "Rossi Impianti Srl", "C002", "333 000 1122", "f.ferretti@rossi.example", true)
    private val bianchi = a(7, "Mario Bianchi", "Mario Bianchi", "C003", "340 000 4455", "mario.bianchi@esempio.it", true)
    private val anna = a(6, "Anna Rossi", "Rossi Impianti Srl", "C002", "0445 000004", "amministrazione@rossi.example", false)

    private fun proposta(chiave: String, modello: String, titolo: String, dettaglio: String, a: JSONObject, rif: JSONObject, testo: String, oggetto: String) =
        JSONObject().put("proposta", chiave).put("tipo", modello).put("titolo", titolo).put("dettaglio", dettaglio).put("canale", "whatsapp").put("a", a)
            .put("riferimento", rif).put("modello", modello).put("testo", testo).put("oggetto", oggetto).put("mancano", JSONArray())

    private val promemoria = proposta(
        "attivita:31:$domani", "promemoria_appuntamento", "Promemoria appuntamento", "Domani alle 9:00 · Intervento TK/2026/0014 · Cabina MT di Zanè", ferretti,
        JSONObject().put("tipo", "attivita").put("id", 31).put("etichetta", "Intervento TK/2026/0014"),
        "Buongiorno Sig. Ferretti, le ricordo l'appuntamento di $giornoDomani alle 9:00 presso Cabina MT di Zanè: Intervento TK/2026/0014. Se non va più bene mi scriva pure. Manuel Gasparotto · Studio Tecnico GM",
        "Promemoria: $giornoDomani alle 9:00",
    )
    private val pagamento = proposta(
        "fattura:43:1", "promemoria_pagamento", "Promemoria di pagamento", "Fattura 41/2026 · scaduta da 12 giorni", bianchi,
        JSONObject().put("tipo", "fattura").put("id", 43).put("etichetta", "Fattura 41/2026"),
        "Buongiorno Mario Bianchi, le scrivo per un promemoria: la fattura 41/2026 del 25/09/2026, di 162,36 €, risultava da saldare entro il 10/10/2026. Se il pagamento è già partito, non tenga conto di questo messaggio. Grazie. Manuel Gasparotto · Studio Tecnico GM",
        "Promemoria: fattura 41/2026",
    )
    private val daFirmare = proposta(
        "rapportino:153", "rapportino_da_firmare", "Rapportino da firmare", "Rapportino del 21/10/2026 · già nel portale", ferretti,
        JSONObject().put("tipo", "rapportino").put("id", 153).put("etichetta", "RAP/2026/0153"),
        "Buongiorno Sig. Ferretti, il rapportino del 21/10/2026 (Ricerca guasto sul quadro QG2, sostituito il differenziale) è ancora da firmare.\nPuò firmarlo nel portale: $portale\nAltrimenti lo firmiamo alla prossima visita. Manuel Gasparotto · Studio Tecnico GM",
        "Rapportino del 21/10/2026 da firmare",
    )

    private fun com(id: Int, quando: String, canale: String, dir: String, tipo: String, nomeTipo: String, cliente: String, idCliente: String, ref: String, idRef: Int, a: String, testo: String, stato: String, rif: JSONObject?, chi: String, errore: String = "") =
        JSONObject().put("id", id).put("quando", quando).put("canale", canale).put("direzione", dir).put("tipo", tipo).put("tipoNome", nomeTipo).put("cliente", cliente)
            .put("idCliente", idCliente).put("referente", ref).put("idReferente", idRef).put("a", a).put("oggetto", "").put("testo", testo).put("stato", stato)
            .put("statoVisto", eu.stgm.wisper.rapportino.Parole7.stato(stato)).put("riferimento", rif ?: JSONObject.NULL).put("chi", chi).put("errore", errore)

    private fun rif(tipo: String, id: Int, et: String) = JSONObject().put("tipo", tipo).put("id", id).put("etichetta", et)

    private val storico = listOf(
        com(60, ora(0, 9, 12), "portale", "entrata", "messaggio", "Messaggio", "Rossi Impianti Srl", "C002", "Sig. Ferretti", 5, "", "Da stamattina alle 8 scatta ogni dieci minuti, la linea 4 è ferma.", "ricevuto", rif("ticket", 16, "TK/2026/0016"), "Sig. Ferretti"),
        com(59, ora(0, 8, 15), "portale", "entrata", "messaggio", "Messaggio", "Rossi Impianti Srl", "C002", "Sig. Ferretti", 5, "", "Va bene, vi aspetta il custode al cancello nord.", "ricevuto", rif("ticket", 14, "TK/2026/0014"), "Sig. Ferretti"),
        com(58, ora(-1, 16, 42), "portale", "uscita", "messaggio", "Messaggio", "Rossi Impianti Srl", "C002", "Sig. Ferretti", 5, "", "Veniamo giovedì alle 9 con il misuratore.", "mandato", rif("ticket", 14, "TK/2026/0014"), "Manuel Gasparotto"),
        com(57, ora(-1, 11, 45), "email", "uscita", "rapportino", "Rapportino", "Mario Bianchi", "C003", "Mario Bianchi", 7, "mario.bianchi@esempio.it", "Rapportino RAP/2026/0151 firmato, in allegato.", "mandato", rif("rapportino", 151, "RAP/2026/0151"), "Manuel Gasparotto"),
        com(56, ora(-2, 8, 2), "whatsapp", "uscita", "promemoria_appuntamento", "Promemoria appuntamento", "Mario Bianchi", "C003", "Mario Bianchi", 7, "+39 340 000 4455", "Buongiorno Mario Bianchi, le ricordo l'appuntamento di domani alle 10:00 presso Casa di Marostica: Intervento TK/2026/0012. Se non va più bene mi scriva pure. Manuel Gasparotto · Studio Tecnico GM", "mandato", rif("ticket", 12, "TK/2026/0012"), "Manuel Gasparotto"),
        com(55, ora(-2, 7, 55), "whatsapp", "uscita", "promemoria_appuntamento", "Promemoria appuntamento", "Rossi Impianti Srl", "C002", "Sig. Ferretti", 5, "+39 333 000 1122", "Buongiorno Sig. Ferretti, le ricordo l'appuntamento di oggi alle 9:00 presso Capannone di Thiene: prova delle protezioni.", "preparato", rif("attivita", 28, "Attività del giorno"), "Manuel Gasparotto"),
        com(54, ora(-7, 10, 0), "email", "uscita", "preventivo", "Preventivo", "Rossi Impianti Srl", "C002", "Sig. Ferretti", 5, "f.ferretti@rossi.example", "Preventivo PR/2026/012 rev. 1, in allegato.", "mandato", rif("preventivo", 12, "PR/2026/012 rev. 1"), "Manuel Gasparotto"),
        com(52, ora(-9, 18, 20), "email", "uscita", "preventivo", "Preventivo", "Rossi Impianti Srl", "C002", "Anna Rossi", 6, "amministrazione@rossi.example", "Preventivo PR/2026/014, in allegato.", "errore", rif("preventivo", 14, "PR/2026/014"), "Manuel Gasparotto", "Il postino non ha risposto: riprova"),
    )

    private val modelli = listOf(
        listOf("promemoria_appuntamento", "Promemoria appuntamento", "tutti", "appuntamento", "Promemoria: {giorno} alle {ora}", "Buongiorno {nome}, le ricordo l'appuntamento di {giorno} alle {ora} presso {luogo}: {cosa}. Se non va più bene mi scriva pure. {mittente}"),
        listOf("intervento_fissato", "Intervento fissato", "tutti", "intervento", "Intervento fissato per {giorno}", "Buongiorno {nome}, l'intervento per {cosa} è fissato per {giorno} alle {ora} presso {luogo}.\nLo trova anche nel portale: {portale}\n{mittente}"),
        listOf("preventivo_mandato", "Preventivo mandato", "tutti", "preventivo", "Preventivo {preventivo}", "Buongiorno {nome}, le ho mandato per email il preventivo {preventivo} per {oggetto}.\nLo trova anche nel portale, dove può accettarlo: {portale}\nResto a disposizione per qualsiasi domanda. {mittente}"),
        listOf("rapportino_da_firmare", "Rapportino da firmare", "tutti", "rapportino", "Rapportino del {data} da firmare", "Buongiorno {nome}, il rapportino del {data} ({lavoro}) è ancora da firmare.\nPuò firmarlo nel portale: {portale}\nAltrimenti lo firmiamo alla prossima visita. {mittente}"),
        listOf("promemoria_pagamento", "Promemoria di pagamento", "tutti", "pagamento", "Promemoria: fattura {fattura}", "Buongiorno {nome}, le scrivo per un promemoria: la fattura {fattura} del {data_fattura}, di {importo}, risultava da saldare entro il {scadenza}. Se il pagamento è già partito, non tenga conto di questo messaggio. Grazie. {mittente}"),
        listOf("secondo_promemoria_pagamento", "Secondo promemoria di pagamento", "tutti", "pagamento", "Fattura {fattura}", "Buongiorno {nome}, torno a scriverle per la fattura {fattura} del {data_fattura}, di {importo}, con scadenza il {scadenza}. Mi può dire quando è previsto il pagamento? Se è già partito, mi scusi per il disturbo. Grazie. {mittente}"),
        listOf("invito_portale", "Invito al portale", "whatsapp", "portale", "", "Buongiorno {nome}, da oggi preventivi, rapportini e documenti dello studio li trova anche nel portale: {portale}\nPer entrare basta la sua email: le arriva un link. {mittente}"),
        listOf("libero", "Messaggio libero", "tutti", "libero", "", "Buongiorno {nome}, "),
    ).mapIndexed { i, m ->
        JSONObject().put("chiave", m[0]).put("nome", m[1]).put("canale", m[2]).put("uso", m[3]).put("oggetto", m[4]).put("testo", m[5]).put("attivo", true).put("sistema", true).put("ordine", i + 1)
    }

    private fun voceDg(id: Int, tipo: String, titolo: String, det: String, quando: String, pagina: String, idCosa: Int) =
        JSONObject().put("id", id).put("tipo", tipo).put("titolo", titolo).put("dettaglio", det).put("quando", quando).put("collegamento", JSONObject().put("pagina", pagina).put("id", idCosa))

    private val daGuardare = listOf(
        voceDg(41, "richiesta", "Richiesta urgente: TK/2026/0016", "Rossi Impianti Srl · Capannone di Thiene · Sig. Ferretti · alle 9:12", ora(0, 9, 12), "ticket", 16),
        voceDg(42, "caricamento", "Schema quadro QG2.pdf", "Rossi Impianti Srl · Sig. Ferretti · 1,2 MB", ora(0, 9, 20), "caricamento", 31),
        voceDg(43, "messaggio", "Messaggio di Sig. Ferretti su TK/2026/0014", "Va bene, vi aspetta il custode al cancello nord.", ora(0, 8, 15), "ticket", 14),
        voceDg(44, "caricamento", "Foto targa inverter.jpg", "Mario Bianchi · 2,4 MB", ora(-1, 19, 2), "caricamento", 32),
    )

    private fun pub(id: Int, tipo: String, titolo: String, quando: String, origine: String, vistoIl: String, vistoDa: String, cliente: String, daFirmare: Boolean = false) =
        JSONObject().put("id", id).put("tipo", tipo).put("titolo", titolo).put("pubblicataIl", quando).put("origine", origine).put("vistoIl", vistoIl).put("vistoDa", vistoDa)
            .put("daFirmare", daFirmare).put("cliente", cliente)

    private val pubblicati = listOf(
        pub(12, "preventivo", "Preventivo PR/2026/012 rev. 1", ora(-7, 10, 0), "regola", ora(-1, 17, 40), "Sig. Ferretti", "Rossi Impianti Srl"),
        pub(15, "rapportino", "Rapportino del 21/10/2026", ora(-1, 17, 12), "mano", "", "", "Rossi Impianti Srl", daFirmare = true),
        pub(9, "documento", "Schema unifilare cabina MT rev. 2", ora(-2, 11, 2), "mano", "", "", "Rossi Impianti Srl"),
        pub(21, "ticket", "Richiesta TK/2026/0014", ora(-2, 8, 40), "mano", ora(-1, 17, 2), "Sig. Ferretti", "Rossi Impianti Srl"),
        pub(40, "preventivo", "Preventivo PR/2026/011", ora(-24, 9, 0), "regola", "", "", "Mario Bianchi"),
        pub(43, "fattura", "Fattura 41/2026", ora(-27, 9, 0), "regola", "", "", "Mario Bianchi"),
    )

    private fun car(id: Int, titolo: String, nome: String, byte: Long, ref: String, quando: String, cliente: String, idCliente: String, nota: String) =
        JSONObject().put("id", id).put("titolo", titolo).put("nome", nome).put("byte", byte).put("referente", ref).put("creato", quando).put("stato", "da_guardare")
            .put("cliente", cliente).put("idCliente", idCliente).put("ticket", "").put("nota", nota)

    private val caricamenti = listOf(
        car(31, "Schema quadro QG2", "Schema quadro QG2.pdf", 1258291, "Sig. Ferretti", ora(0, 9, 20), "Rossi Impianti Srl", "C002", "Versione aggiornata dal nostro ufficio"),
        car(32, "Foto targa inverter", "Foto targa inverter.jpg", 2516582, "Mario Bianchi", ora(-1, 19, 2), "Mario Bianchi", "C003", ""),
    )

    private fun acc(quando: String, cliente: String, ref: String, frase: String, disp: String, esito: String = "ok") =
        JSONObject().put("quando", quando).put("cliente", cliente).put("referente", ref).put("frase", frase).put("oggetto", "").put("esito", esito).put("ip", "").put("dispositivo", disp)

    private val accessi = listOf(
        acc(ora(0, 9, 58), "Rossi Impianti Srl", "Sig. Ferretti", "Entrato", "Chrome · Android"),
        acc(ora(0, 9, 20), "Rossi Impianti Srl", "Sig. Ferretti", "Ha mandato il file Schema quadro QG2.pdf", "Chrome · Android"),
        acc(ora(0, 9, 12), "Rossi Impianti Srl", "Sig. Ferretti", "Ha aperto la richiesta TK/2026/0016", "Chrome · Android"),
        acc(ora(-1, 17, 40), "Rossi Impianti Srl", "Sig. Ferretti", "Ha visto il preventivo PR/2026/012 rev. 1", "Edge · Windows"),
        acc(ora(-1, 19, 2), "Mario Bianchi", "Mario Bianchi", "Ha mandato il file Foto targa inverter.jpg", "Chrome · Android"),
        acc(ora(-2, 22, 14), "Rossi Impianti Srl", "", "Codice sbagliato", "Firefox · Windows", "no"),
    )

    private fun refPortale(id: Int, nome: String, ruolo: String, email: String, tel: String, stato: String, permessi: JSONObject, ultimo: String, pagamenti: Boolean, wa: Boolean) =
        JSONObject().put("id", id).put("nome", nome).put("ruolo", ruolo).put("email", email).put("telefono", tel).put("portale", stato != "Senza accesso")
            .put("statoVisto", stato).put("permessi", permessi).put("sedi", JSONObject.NULL).put("avvisiEmail", true).put("ultimoAccesso", ultimo)
            .put("invitatoIl", ora(-8, 11, 0)).put("pagamenti", pagamenti).put("whatsappOk", wa)

    private fun perm(p: Int, r: Int, f: Int, d: Int, q: Int) = JSONObject().put("preventivi", p).put("rapportini", r).put("fatture", f).put("documenti", d).put("richieste", q)

    private fun portaleCliente(id: String): JSONObject {
        val rossi = id == "C002"
        val nome = when (id) { "C002" -> "Rossi Impianti Srl"; "C003" -> "Mario Bianchi"; else -> "Elettrodinamica" }
        val referenti = when (id) {
            "C002" -> arr(
                refPortale(5, "Sig. Ferretti", "Ufficio tecnico", "f.ferretti@rossi.example", "333 000 1122", "Attivo", perm(2, 2, 1, 2, 2), ora(0, 9, 58), false, true),
                refPortale(6, "Anna Rossi", "Amministrazione", "amministrazione@rossi.example", "0445 000004", "Invitato", perm(1, 1, 1, 1, 0), "", true, false),
            )
            "C003" -> arr(refPortale(7, "Mario Bianchi", "Cliente privato", "mario.bianchi@esempio.it", "340 000 4455", "Invitato", perm(2, 2, 1, 2, 2), "", true, true))
            else -> JSONArray()
        }
        return JSONObject().put("ok", true)
            .put("cliente", JSONObject().put("id", id).put("nome", nome).put("portale", id != "C001").put("importi", id == "C003")
                .put("regole", JSONObject().put("preventivi", true).put("contratti", true).put("rapportiniFirmati", true).put("rapportiniDaFirmare", false).put("fatture", id == "C003").put("richieste", "portale")))
            .put("referenti", referenti)
            .put("pubblicati", JSONArray().apply { pubblicati.filter { it.optString("cliente") == nome }.forEach { put(it) } })
            .put("caricamenti", JSONArray().apply { caricamenti.filter { it.optString("idCliente") == id }.forEach { put(it) } })
            .put("accessi", JSONArray().apply { accessi.filter { it.optString("cliente") == nome }.take(if (rossi) 5 else 3).forEach { put(it) } })
    }

    private val notifiche = listOf(
        JSONObject().put("id", 1).put("tipo", "richiesta_portale").put("titolo", "Richiesta dal portale: TK/2026/0016").put("dettaglio", "Rossi Impianti Srl · Scatta il differenziale del quadro QG2 · Urgente")
            .put("collegamento", JSONObject().put("pagina", "ticket").put("id", 16)).put("creata", ora(0, 9, 12)).put("letta", false),
        JSONObject().put("id", 2).put("tipo", "file_portale").put("titolo", "File dal portale: Schema quadro QG2.pdf").put("dettaglio", "Rossi Impianti Srl · 1,2 MB")
            .put("collegamento", JSONObject().put("pagina", "portale").put("filtro", JSONObject().put("segmento", "daguardare"))).put("creata", ora(0, 9, 20)).put("letta", false),
        JSONObject().put("id", 3).put("tipo", "da_mandare").put("titolo", "1 messaggio da mandare oggi").put("dettaglio", "Promemoria a Sig. Ferretti")
            .put("collegamento", JSONObject().put("pagina", "comunicazioni").put("filtro", JSONObject().put("segmento", "damandare"))).put("creata", ora(0, 8, 0)).put("letta", true),
    )

    override suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>>): JSONObject {
        val p = parametri.toMap()
        val ok = JSONObject().put("ok", true)
        return when (azione) {
            "daMandare" -> ok.put("oggi", arr(promemoria)).put("domani", JSONArray()).put("proposti", arr(pagamento, daFirmare))
                .put("preparati", JSONArray().apply { storico.filter { it.optString("stato") == "preparato" }.forEach { put(it) } })
            "comunicazioni" -> {
                val canale = p["canale"].orEmpty()
                val idCliente = p["idCliente"].orEmpty()
                val l = storico.filter { (canale.isBlank() || it.optString("canale") == canale || (canale == "telefonata" && it.optString("canale") == "nota")) && (idCliente.isBlank() || it.optString("idCliente") == idCliente) }
                ok.put("pagina", 1).put("pagine", 1).put("quante", l.size).put("comunicazioni", JSONArray().apply { l.forEach { put(it) } })
                    .put("accessi", if (p["conAccessi"] == "true" && idCliente == "C002") arr(JSONObject().put("quando", ora(-1, 17, 40)).put("frase", "Sig. Ferretti ha visto il preventivo PR/2026/012 rev. 1")) else JSONArray())
            }
            "modelliMessaggi" -> ok.put("modelli", JSONArray().apply { modelli.forEach { put(it) } }).put("segnaposti", JSONObject()
                .put("sempre", JSONArray(eu.stgm.wisper.rapportino.Segnaposti.SEMPRE)).apply { eu.stgm.wisper.rapportino.Segnaposti.PER_USO.forEach { (k, v) -> put(k, JSONArray(v)) } })
            "preparaMessaggio" -> {
                val m = modelli.firstOrNull { it.optString("chiave") == p["modello"] } ?: modelli.last()
                val dest = if (p["idReferente"] == "7" || p["idCliente"] == "C003") bianchi else if (p["idReferente"] == "6") anna else ferretti
                val testo = m.optString("testo").replace("{nome}", dest.optString("nome")).replace("{cliente}", dest.optString("cliente"))
                    .replace("{mittente}", "Manuel Gasparotto · Studio Tecnico GM").replace("{studio}", "Studio Tecnico GM").replace("{portale}", portale).replace("{telefono_studio}", "0445 000100")
                ok.put("testo", testo).put("oggetto", m.optString("oggetto")).put("a", dest)
                    .put("link", Whatsapp.link(dest.optString("numero"), testo)).put("mancano", JSONArray(eu.stgm.wisper.rapportino.Segnaposti.mancano(testo)))
                    .put("ultimoMovimento", if (m.optString("uso") == "pagamento") oggi.minusDays(7).toString() else "")
            }
            "notifiche" -> {
                val l = if (p["soloNuove"] == "true") notifiche.filter { !it.optBoolean("letta") } else notifiche
                ok.put("nuove", notifiche.count { !it.optBoolean("letta") }).put("notifiche", JSONArray().apply { l.forEach { put(it) } })
            }
            "portale" -> ok.put("stato", JSONObject().put("attivo", true).put("indirizzo", portale).put("collegato", "si").put("controllatoIl", ora(0, 10, 0)).put("script", "attivo").put("emailRimaste", 71))
                .put("conteggi", JSONObject().put("daGuardare", daGuardare.size).put("clienti", 2).put("referenti", 3).put("pubblicati", pubblicati.size).put("accessiOggi", 3))
                .put("daGuardare", JSONArray().apply { daGuardare.forEach { put(it) } })
            "portaleCliente" -> portaleCliente(p["idCliente"].orEmpty())
            "pubblicati" -> ok.put("pubblicati", JSONArray().apply {
                pubblicati.filter { (p["tipo"].isNullOrBlank() || it.optString("tipo") == p["tipo"]) && (p["visto"] != "no" || it.optString("vistoIl").isBlank()) }.forEach { put(it) }
            })
            "caricamentiPortale" -> ok.put("caricamenti", JSONArray().apply { caricamenti.forEach { put(it) } })
            "accessiPortale" -> ok.put("righe", JSONArray().apply { accessi.forEach { put(it) } })
            else -> throw PonteServer.Rifiutato(esempio)
        }
    }

    override suspend fun scriviAzione(corpo: JSONObject): JSONObject = throw PonteServer.Rifiutato(esempio)
    override suspend fun file(id: String): Pair<ByteArray, String> = throw PonteServer.Rifiutato(esempio)
    override suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray): JSONObject = throw PonteServer.Rifiutato(esempio)
}
