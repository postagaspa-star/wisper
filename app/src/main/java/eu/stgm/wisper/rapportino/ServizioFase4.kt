package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.util.Base64

/**
 * Come si parla col server per la fase 4: le stesse letture e scritture di
 * [PonteServer] (GET /exec?azione=, POST /exec), più i file. La visita guidata ne
 * ha una sua in memoria (EsempioFase4).
 */
interface TrasportoFase4 {
    suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>> = emptyList()): JSONObject
    suspend fun scriviAzione(corpo: JSONObject): JSONObject
    suspend fun file(id: String): Pair<ByteArray, String>
}

/**
 * Le azioni della fase 4 (architettura.md §15), coi nomi esatti del server. Tutto in
 * diretta: la fatturazione vuole la rete (niente in coda: un'emissione o un
 * abbinamento ripetuto da solo farebbe danni), e anche gli incassi, perché
 * `segnaIncasso` non ha un idLocale contro i doppioni (§15.13).
 * Le funzioni lanciano le eccezioni di [PonteServer]; [ServizioFase4] le fa diventare Result.
 */
class Fase4(private val t: TrasportoFase4) {

    private fun corpo(azione: String) = JSONObject().put("azione", azione)
    private fun fattura(r: JSONObject): Fattura = Fattura.daJson(r.optJSONObject("fattura") ?: throw PonteServer.Rifiutato("Il server non ha restituito la fattura"))

    // -------------------------------------------------- fatturazione

    suspend fun daFatturare(idCliente: String = "", idCommessa: String = ""): DaFatturare =
        DaFatturare.daJson(t.leggiAzione("daFatturare", buildList {
            if (idCliente.isNotBlank()) add("idCliente" to idCliente)
            if (idCommessa.isNotBlank()) add("idCommessa" to idCommessa)
        }))

    suspend fun preparaFattura(idCliente: String, voci: List<VoceDaFatturare>, raggruppa: String? = null): Fattura {
        val c = corpo("preparaFattura").put("idCliente", idCliente).put("voci", JSONArray().apply { voci.forEach { put(it.perServer()) } })
        if (!raggruppa.isNullOrBlank()) c.put("raggruppa", raggruppa)
        return fattura(t.scriviAzione(c))
    }

    suspend fun nuovaFattura(idCliente: String): Fattura = fattura(t.scriviAzione(corpo("nuovaFattura").put("idCliente", idCliente)))

    suspend fun fatture(f: FiltroFatture = FiltroFatture()): List<Fattura> =
        t.leggiAzione("fatture", f.parametri()).optJSONArray("fatture").oggetti().map(Fattura::daJson)

    suspend fun fattura(id: String): Fattura = fattura(t.leggiAzione("fattura", listOf("id" to id)))

    /** Torna la fattura e le cose tornate da fatturare (un gruppo tolto). */
    suspend fun salvaFattura(f: JSONObject): Pair<Fattura, List<String>> {
        val r = t.scriviAzione(corpo("salvaFattura").put("fattura", f))
        return fattura(r) to r.optJSONArray("liberate").oggetti().map { it.testo("descrizione").ifBlank { it.testo("id") } }
    }

    suspend fun scartaFattura(id: String, motivo: String = "", conferma: Boolean = false): Fattura {
        val c = corpo("scartaFattura").put("id", PonteServer.idJson(id)).put("motivo", motivo.trim())
        if (conferma) c.put("conferma", true)
        return fattura(t.scriviAzione(c))
    }

    suspend fun passaAlProgramma(id: String, conferma: Boolean = false): Pair<Fattura, Pacchetto?> {
        val c = corpo("passaAlProgramma").put("id", PonteServer.idJson(id))
        if (conferma) c.put("conferma", true)
        val r = t.scriviAzione(c)
        return fattura(r) to r.optJSONObject("pacchetto")?.let(Pacchetto::daJson)
    }

    suspend fun pacchetto(id: String): Pacchetto = Pacchetto.daJson(t.leggiAzione("pacchetto", listOf("id" to id)))

    suspend fun tornaInBozza(id: String): Fattura = fattura(t.scriviAzione(corpo("tornaInBozza").put("id", PonteServer.idJson(id))))

    suspend fun segnaEmessa(id: String, numero: String, data: LocalDate, conferma: Boolean): Fattura {
        val c = corpo("segnaEmessa").put("id", PonteServer.idJson(id)).put("numero", numero.trim()).put("data", data.toString())
        if (conferma) c.put("conferma", true)
        return fattura(t.scriviAzione(c))
    }

    suspend fun inviaAvviso(id: String, a: String, oggetto: String, messaggio: String, pdf: File): Fattura {
        val c = corpo("inviaAvviso").put("id", PonteServer.idJson(id)).put("a", a.trim()).put("oggetto", oggetto).put("messaggio", messaggio)
            .put("allegati", JSONArray().put(JSONObject().put("nome", pdf.name).put("mime", "application/pdf").put("base64", Base64.getEncoder().encodeToString(pdf.readBytes()))))
        return fattura(t.scriviAzione(c))
    }

    /** [file]: nome e byte di ogni file scelto (xml, p7m, zip). Non cambia niente sul server. */
    suspend fun leggiXml(file: List<Pair<String, ByteArray>>): LetturaXml {
        val c = corpo("leggiXml").put("file", JSONArray().apply {
            file.forEach { (nome, byte) -> put(JSONObject().put("nome", nome).put("base64", Base64.getEncoder().encodeToString(byte))) }
        })
        return LetturaXml.daJson(t.scriviAzione(c))
    }

    suspend fun confermaXml(idLettura: String, scelte: List<SceltaXml>): EsitoConferma =
        EsitoConferma.daJson(t.scriviAzione(corpo("confermaXml").put("idLettura", idLettura).put("scelte", JSONArray().apply { scelte.forEach { put(it.perServer()) } })))

    /** [righe]: idRiga -> importo da stornare (null = tutta la riga). */
    suspend fun preparaNotaCredito(idFattura: String, tutta: Boolean, righe: Map<String, Double?>, motivo: String): Fattura {
        val c = corpo("preparaNotaCredito").put("idFattura", PonteServer.idJson(idFattura)).put("motivo", motivo.trim())
        if (tutta) c.put("tutta", true)
        else c.put("righe", JSONArray().apply {
            righe.forEach { (id, imp) -> put(JSONObject().put("idRiga", PonteServer.idJson(id)).apply { if (imp != null) put("importo", imp) }) }
        })
        return fattura(t.scriviAzione(c))
    }

    suspend fun segnaFatturataFuori(voci: List<VoceDaFatturare>, nota: String = ""): Int =
        t.scriviAzione(corpo("segnaFatturataFuori").put("voci", JSONArray().apply { voci.forEach { put(it.perServer()) } }).put("nota", nota)).optInt("fatte")

    suspend fun ricevute(stato: String = "tutte", testo: String = ""): List<Ricevuta> =
        t.leggiAzione("ricevute", buildList { add("stato" to stato); if (testo.isNotBlank()) add("testo" to testo) })
            .optJSONArray("ricevute").oggetti().map(Ricevuta::daJson)

    suspend fun ricevuta(id: String): Ricevuta =
        Ricevuta.daJson(t.leggiAzione("ricevuta", listOf("id" to id)).optJSONObject("ricevuta") ?: throw PonteServer.Rifiutato("Il server non ha restituito la fattura ricevuta"))

    /** Per quelle arrivate dall'XML si cambiano solo categoria, commessa, spesa e note. */
    suspend fun salvaRicevuta(r: JSONObject): Ricevuta =
        Ricevuta.daJson(t.scriviAzione(corpo("salvaRicevuta").put("ricevuta", r)).optJSONObject("ricevuta") ?: throw PonteServer.Rifiutato("Il server non ha restituito la fattura ricevuta"))

    suspend fun annullaRicevuta(id: String, motivo: String): Ricevuta =
        Ricevuta.daJson(t.scriviAzione(corpo("annullaRicevuta").put("id", PonteServer.idJson(id)).put("motivo", motivo.trim())).optJSONObject("ricevuta") ?: JSONObject().put("id", id))

    suspend fun scadenzePagamento(idCommessa: String = ""): List<ScadenzaCommessa> =
        t.leggiAzione("scadenzePagamento", if (idCommessa.isNotBlank()) listOf("idCommessa" to idCommessa) else emptyList())
            .optJSONArray("scadenze").oggetti().map(ScadenzaCommessa::daJson)

    suspend fun fatturazioneCommessa(id: String): FatturazioneCommessa = FatturazioneCommessa.daJson(t.leggiAzione("fatturazioneCommessa", listOf("id" to id)))

    suspend fun riepilogoFatturato(anno: Int, per: String): RiepilogoFatturato =
        RiepilogoFatturato.daJson(t.leggiAzione("riepilogoFatturato", listOf("anno" to anno.toString(), "per" to per)))

    suspend fun confermaRegoleFiscali(data: LocalDate?, commercialista: String): Map<String, String> {
        val c = corpo("confermaRegoleFiscali").put("data", data?.toString() ?: JSONObject.NULL).put("commercialista", commercialista.trim())
        return Anagrafiche.impostazioniDaJson(t.scriviAzione(c).optJSONObject("impostazioni"))
    }

    /** Le impostazioni fiscali coi loro tipi veri (numeri, sì/no, testo). */
    suspend fun salvaImpostazioni(valori: Map<String, Any>): Map<String, String> {
        val v = JSONObject()
        valori.forEach { (k, x) -> v.put(k, x) }
        return Anagrafiche.impostazioniDaJson(t.scriviAzione(corpo("salvaImpostazioni").put("valori", v)).optJSONObject("impostazioni"))
    }

    // -------------------------------------------------- banche e scadenze

    suspend fun conti(tutti: Boolean = false): List<ContoBanca> =
        t.leggiAzione("conti", if (tutti) listOf("tutti" to "true") else emptyList()).optJSONArray("conti").oggetti().map(ContoBanca::daJson)

    suspend fun salvaConto(c: JSONObject): ContoBanca =
        ContoBanca.daJson(t.scriviAzione(corpo("salvaConto").put("conto", c)).optJSONObject("conto") ?: throw PonteServer.Rifiutato("Il server non ha restituito il conto"))

    suspend fun aggiornaSaldo(idConto: String, saldo: Double, data: LocalDate): ContoBanca =
        ContoBanca.daJson(
            t.scriviAzione(corpo("aggiornaSaldo").put("idConto", PonteServer.idJson(idConto)).put("saldo", saldo).put("data", data.toString())).optJSONObject("conto")
                ?: throw PonteServer.Rifiutato("Il server non ha restituito il conto"),
        )

    suspend fun movimenti(verso: String = "", verificato: Boolean? = null, testo: String = "", pagina: Int = 1): ElencoMovimenti =
        ElencoMovimenti.daJson(t.leggiAzione("movimenti", buildList {
            if (verso.isNotBlank()) add("verso" to verso)
            if (verificato != null) add("verificato" to verificato.toString())
            if (testo.isNotBlank()) add("testo" to testo)
            if (pagina > 1) add("pagina" to pagina.toString())
        }))

    suspend fun salvaMovimento(m: JSONObject): Movimento =
        Movimento.daJson(t.scriviAzione(corpo("salvaMovimento").put("movimento", m)).optJSONObject("movimento") ?: throw PonteServer.Rifiutato("Il server non ha restituito il movimento"))

    /** La strada corta: il movimento già abbinato alla fattura. Senza [importo] il server prende il residuo. */
    suspend fun segnaIncasso(idFattura: String, importo: Double?, data: LocalDate, idConto: String, verificato: Boolean): Pair<Movimento, Fattura?> {
        val c = corpo("segnaIncasso").put("idFattura", PonteServer.idJson(idFattura)).put("data", data.toString()).put("verificato", verificato)
        if (importo != null) c.put("importo", importo)
        if (idConto.isNotBlank()) c.put("idConto", PonteServer.idJson(idConto))
        val r = t.scriviAzione(c)
        return Movimento.daJson(r.optJSONObject("movimento") ?: JSONObject()) to r.optJSONObject("fattura")?.let(Fattura::daJson)
    }

    /** [cosa] "ricevuta" o "impegno". */
    suspend fun segnaPagamento(cosa: String, id: String, importo: Double?, data: LocalDate, idConto: String, verificato: Boolean): Movimento {
        val c = corpo("segnaPagamento").put(if (cosa == "impegno") "idImpegno" else "idRicevuta", PonteServer.idJson(id)).put("data", data.toString()).put("verificato", verificato)
        if (importo != null) c.put("importo", importo)
        if (idConto.isNotBlank()) c.put("idConto", PonteServer.idJson(idConto))
        return Movimento.daJson(t.scriviAzione(c).optJSONObject("movimento") ?: JSONObject())
    }

    suspend fun verificaMovimenti(ids: List<String>, verificato: Boolean): Int =
        t.scriviAzione(corpo("verificaMovimenti").put("ids", JSONArray(ids.map(PonteServer::idJson))).put("verificato", verificato)).optInt("fatte")

    suspend fun annullaMovimento(id: String, motivo: String): Movimento =
        Movimento.daJson(t.scriviAzione(corpo("annullaMovimento").put("id", PonteServer.idJson(id)).put("motivo", motivo.trim())).optJSONObject("movimento") ?: JSONObject().put("id", id))

    suspend fun scadenziario(giorni: Int = 90, idConto: String = ""): Scadenziario =
        Scadenziario.daJson(t.leggiAzione("scadenziario", buildList {
            add("da" to LocalDate.now().toString()); add("a" to LocalDate.now().plusDays(giorni.toLong()).toString())
            if (idConto.isNotBlank()) add("idConto" to idConto)
        }))

    suspend fun impegni(stato: String = "aperti"): List<Impegno> =
        t.leggiAzione("impegni", listOf("stato" to stato)).optJSONArray("impegni").oggetti().map(Impegno::daJson)

    suspend fun salvaImpegno(i: JSONObject, perRicorrenza: String? = null): Impegno {
        val c = corpo("salvaImpegno").put("impegno", i)
        if (!perRicorrenza.isNullOrBlank()) c.put("perRicorrenza", perRicorrenza)
        return Impegno.daJson(t.scriviAzione(c).optJSONObject("impegno") ?: throw PonteServer.Rifiutato("Il server non ha restituito l'impegno"))
    }

    suspend fun confermaImpegno(id: String, importo: Double?): Impegno {
        val c = corpo("confermaImpegno").put("id", PonteServer.idJson(id))
        if (importo != null) c.put("importo", importo)
        return Impegno.daJson(t.scriviAzione(c).optJSONObject("impegno") ?: JSONObject().put("id", id))
    }

    suspend fun togliImpegno(id: String, perRicorrenza: String? = null, motivo: String = ""): Int {
        val c = corpo("togliImpegno").put("id", PonteServer.idJson(id))
        if (!perRicorrenza.isNullOrBlank()) c.put("perRicorrenza", perRicorrenza)
        if (motivo.isNotBlank()) c.put("motivo", motivo)
        return t.scriviAzione(c).optInt("tolti", 1)
    }

    suspend fun situazione(): Situazione = Situazione.daJson(t.leggiAzione("situazione"))

    /** Il CSV per Excel (§15.17): nome e byte. */
    suspend fun esporta(cosa: String, parametri: List<Pair<String, String>> = emptyList()): Pair<String, ByteArray> {
        val r = t.leggiAzione("esporta", listOf("cosa" to cosa) + parametri)
        val byte = try {
            Base64.getMimeDecoder().decode(r.testo("base64"))
        } catch (_: IllegalArgumentException) {
            throw PonteServer.Rifiutato("Il file arrivato dal server non si legge")
        }
        return r.testo("nome").ifBlank { "wisper-$cosa.csv" } to byte
    }
}

/** Chi fa diventare un lavoro un Result col messaggio da mostrare (Archivio: inDiretta). */
interface EsecutoreFase4 {
    suspend fun <T> esegui(lavoro: suspend () -> T): Result<T>
}

/**
 * Quello che le schermate chiamano: le azioni di [Fase4] come Result, i file dove li
 * vuole il foglio Condividi di Android (cacheDir/pdf), e la Dashboard riletta dopo
 * ogni scrittura.
 */
class ServizioFase4(
    trasporto: TrasportoFase4,
    private val cartella: File?,
    private val esecutore: EsecutoreFase4,
    private val dopoScrittura: () -> Unit = {},
    private val impostazioniCambiate: suspend () -> Unit = {},
) {
    val f = Fase4(trasporto)
    private val t = trasporto

    private suspend fun <T> leggi(lavoro: suspend Fase4.() -> T): Result<T> = esecutore.esegui { f.lavoro() }
    private suspend fun <T> scrivi(lavoro: suspend Fase4.() -> T): Result<T> = esecutore.esegui { f.lavoro() }.also { if (it.isSuccess) dopoScrittura() }

    suspend fun daFatturare(idCliente: String = "", idCommessa: String = "") = leggi { daFatturare(idCliente, idCommessa) }
    suspend fun preparaFattura(idCliente: String, voci: List<VoceDaFatturare>, raggruppa: String?) = scrivi { preparaFattura(idCliente, voci, raggruppa) }
    suspend fun nuovaFattura(idCliente: String) = scrivi { nuovaFattura(idCliente) }
    suspend fun fatture(filtro: FiltroFatture) = leggi { fatture(filtro) }
    suspend fun fattura(id: String) = leggi { fattura(id) }
    suspend fun salvaFattura(o: JSONObject) = scrivi { salvaFattura(o) }
    suspend fun scartaFattura(id: String, motivo: String, conferma: Boolean) = scrivi { scartaFattura(id, motivo, conferma) }
    suspend fun passaAlProgramma(id: String, conferma: Boolean) = scrivi { passaAlProgramma(id, conferma) }
    suspend fun pacchetto(id: String) = leggi { pacchetto(id) }
    suspend fun tornaInBozza(id: String) = scrivi { tornaInBozza(id) }
    suspend fun segnaEmessa(id: String, numero: String, data: LocalDate, conferma: Boolean) = scrivi { segnaEmessa(id, numero, data, conferma) }
    suspend fun inviaAvviso(id: String, a: String, oggetto: String, messaggio: String, pdf: File) = scrivi { inviaAvviso(id, a, oggetto, messaggio, pdf) }
    suspend fun leggiXml(file: List<Pair<String, ByteArray>>) = leggi { leggiXml(file) }
    suspend fun confermaXml(idLettura: String, scelte: List<SceltaXml>) = scrivi { confermaXml(idLettura, scelte) }
    suspend fun preparaNotaCredito(idFattura: String, tutta: Boolean, righe: Map<String, Double?>, motivo: String) = scrivi { preparaNotaCredito(idFattura, tutta, righe, motivo) }
    suspend fun segnaFatturataFuori(voci: List<VoceDaFatturare>, nota: String) = scrivi { segnaFatturataFuori(voci, nota) }
    suspend fun ricevute(stato: String, testo: String = "") = leggi { ricevute(stato, testo) }
    suspend fun ricevuta(id: String) = leggi { ricevuta(id) }
    suspend fun salvaRicevuta(o: JSONObject) = scrivi { salvaRicevuta(o) }
    suspend fun annullaRicevuta(id: String, motivo: String) = scrivi { annullaRicevuta(id, motivo) }
    suspend fun scadenzePagamento(idCommessa: String = "") = leggi { scadenzePagamento(idCommessa) }
    suspend fun fatturazioneCommessa(id: String) = leggi { fatturazioneCommessa(id) }
    suspend fun riepilogoFatturato(anno: Int, per: String) = leggi { riepilogoFatturato(anno, per) }
    suspend fun confermaRegoleFiscali(data: LocalDate?, commercialista: String) =
        scrivi { confermaRegoleFiscali(data, commercialista) }.also { if (it.isSuccess) impostazioniCambiate() }
    suspend fun salvaImpostazioniFiscali(valori: Map<String, Any>) = scrivi { salvaImpostazioni(valori) }.also { if (it.isSuccess) impostazioniCambiate() }

    suspend fun conti(tutti: Boolean = false) = leggi { conti(tutti) }
    suspend fun salvaConto(o: JSONObject) = scrivi { salvaConto(o) }
    suspend fun aggiornaSaldo(idConto: String, saldo: Double, data: LocalDate) = scrivi { aggiornaSaldo(idConto, saldo, data) }
    suspend fun movimenti(verso: String = "", verificato: Boolean? = null, testo: String = "") = leggi { movimenti(verso, verificato, testo) }
    suspend fun salvaMovimento(o: JSONObject) = scrivi { salvaMovimento(o) }
    suspend fun segnaIncasso(idFattura: String, importo: Double?, data: LocalDate, idConto: String, verificato: Boolean) = scrivi { segnaIncasso(idFattura, importo, data, idConto, verificato) }
    suspend fun segnaPagamento(cosa: String, id: String, importo: Double?, data: LocalDate, idConto: String, verificato: Boolean) = scrivi { segnaPagamento(cosa, id, importo, data, idConto, verificato) }
    suspend fun verificaMovimenti(ids: List<String>, verificato: Boolean) = scrivi { verificaMovimenti(ids, verificato) }
    suspend fun annullaMovimento(id: String, motivo: String) = scrivi { annullaMovimento(id, motivo) }
    suspend fun scadenziario(giorni: Int = 90) = leggi { scadenziario(giorni) }
    suspend fun impegni(stato: String = "aperti") = leggi { impegni(stato) }
    suspend fun salvaImpegno(o: JSONObject, perRicorrenza: String?) = scrivi { salvaImpegno(o, perRicorrenza) }
    suspend fun confermaImpegno(id: String, importo: Double?) = scrivi { confermaImpegno(id, importo) }
    suspend fun togliImpegno(id: String, perRicorrenza: String?, motivo: String) = scrivi { togliImpegno(id, perRicorrenza, motivo) }
    suspend fun situazione() = leggi { situazione() }

    /** Un file in cacheDir/pdf (la cartella che il foglio Condividi può dare alle altre app). */
    private fun salvaFile(nome: String, byte: ByteArray): File {
        val dir = File(cartella ?: throw PonteServer.Rifiutato("Il file qui non si salva"), "pdf").apply { mkdirs() }
        return File(dir, nome).apply { writeBytes(byte) }
    }

    /** Il CSV per Excel di [cosa] (fatture, ricevute, daFatturare, riepilogo, movimenti, scadenziario, impegni). */
    suspend fun esporta(cosa: String, parametri: List<Pair<String, String>> = emptyList()): Result<File> = esecutore.esegui {
        val (nome, byte) = f.esporta(cosa, parametri)
        salvaFile(nome.replace(Regex("""[^A-Za-z0-9._ -]"""), "_").ifBlank { "wisper-$cosa.csv" }, byte)
    }

    /** L'XML da completare del pacchetto, col nome che dice di non inviarlo. */
    fun fileXml(p: Pacchetto, riferimento: String): Result<File> = runCatching {
        val byte = try {
            Base64.getMimeDecoder().decode(p.xmlBase64)
        } catch (e: IllegalArgumentException) {
            throw PonteServer.Rifiutato("L'XML arrivato dal server non si legge")
        }
        salvaFile(Pacchetto.nomeXmlSicuro(p.xmlNome, riferimento), byte)
    }

    /** L'XML (o il .p7m) emesso, come l'ha mandato il programma. */
    suspend fun fileEmesso(file: FileFattura): Result<File> = esecutore.esegui {
        val (byte, _) = t.file(file.id)
        salvaFile(file.nome.replace(Regex("""[\\/:*?"<>|]"""), "_").ifBlank { "fattura.xml" }, byte)
    }
}
