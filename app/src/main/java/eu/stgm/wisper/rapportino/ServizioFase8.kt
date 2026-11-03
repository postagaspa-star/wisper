package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDateTime
import java.util.Base64

/*
 * Le azioni della fase 8 (fase8.md §13, con la §0 sopra a tutto), coi nomi esatti del
 * server, e il servizio che le schermate chiamano. Tutto in diretta: sono cose da ufficio
 * (integrazioni, impostazioni, controlli) che senza rete dicono "Serve la rete" come le
 * altre letture in diretta. Niente coda: nessuna di queste azioni ha un idLocale contro i
 * doppioni, e ripeterle da sole farebbe danni (Scollega tutti, la cifratura, l'importazione).
 */

/** Le chiamate al server della fase 8: lanciano le eccezioni di [PonteServer]. */
class Fase8(private val t: TrasportoFase5) {

    private fun corpo(azione: String) = JSONObject().put("azione", azione)
    private fun idJson(id: String): Any = PonteServer.idJson(id)

    // -------------------------------------------------- integrazioni (§13.1)

    suspend fun integrazioni(): ElencoIntegrazioni = ElencoIntegrazioni.daJson(t.leggiAzione("integrazioni"))

    suspend fun integrazione(chiave: String): Integrazione {
        val r = t.leggiAzione("integrazione", listOf("chiave" to chiave))
        // La riga può stare dentro "integrazione" o essere la risposta stessa (coi controlli accanto).
        val riga = r.optJSONObject("integrazione")?.let { o ->
            if (!o.has("controlli") && r.has("controlli")) JSONObject(o.toString()).put("controlli", r.get("controlli")) else o
        }?.let { o -> if (!o.has("impostazioni") && r.has("impostazioni")) JSONObject(o.toString()).put("impostazioni", r.get("impostazioni")) else o } ?: r
        return Integrazione.daJson(riga)
    }

    suspend fun provaIntegrazione(chiave: String): Integrazione =
        Integrazione.daJson(t.scriviAzione(corpo("provaIntegrazione").put("chiave", chiave)).let { it.optJSONObject("integrazione") ?: it })

    suspend fun salvaIntegrazione(chiave: String, account: String? = null, impostazioni: Map<String, Any?>? = null): Integrazione {
        val c = corpo("salvaIntegrazione").put("chiave", chiave)
        account?.let { c.put("account", it.trim()) }
        impostazioni?.let { m -> c.put("impostazioni", JSONObject().apply { m.forEach { (k, v) -> put(k, v ?: JSONObject.NULL) } }) }
        return Integrazione.daJson(t.scriviAzione(c).let { it.optJSONObject("integrazione") ?: it })
    }

    // -------------------------------------------------- calendario (§5.4, §5.5)

    /** Il file .ics: nome, quanti eventi, i byte. */
    suspend fun esportaCalendario(cosa: String, assenze: Boolean, scadenze: Boolean): Triple<String, Int, ByteArray> {
        val r = t.leggiAzione("esportaCalendario", listOf("cosa" to cosa, "assenze" to assenze.toString(), "scadenze" to scadenze.toString()))
        val byte = try {
            Base64.getMimeDecoder().decode(r.testo("base64"))
        } catch (_: IllegalArgumentException) {
            throw PonteServer.Rifiutato("Il file arrivato dal server non si legge")
        }
        return Triple(r.testo("nome").ifBlank { "wisper-calendario.ics" }, r.numero("eventi")?.toInt() ?: 0, byte)
    }

    suspend fun feedCalendario(): ElencoFeed = ElencoFeed.daJson(t.leggiAzione("feedCalendario"))

    suspend fun nuovoFeed(nome: String, cosa: CosaCalendario, dettagli: Boolean, pubblico: Boolean): FeedCreato {
        val c = corpo("nuovoFeed").put("nome", nome.trim()).put("cosa", cosa.aJson()).put("dettagli", dettagli)
        if (pubblico) c.put("pubblico", true)
        return FeedCreato.daJson(t.scriviAzione(c))
    }

    suspend fun revocaFeed(id: String) { t.scriviAzione(corpo("revocaFeed").put("id", idJson(id))) }

    // -------------------------------------------------- ricerca dentro i file (§6.3)

    suspend fun letturaFile(idFile: String): LetturaFile = LetturaFile.daJson(t.leggiAzione("letturaFile", listOf("idFile" to idFile)))

    /** Senza [idFile] si rilegge tutto (amministrazione 2): torna quanti file sono da leggere. */
    suspend fun rileggiFile(idFile: String? = null): Int =
        t.scriviAzione(corpo("rileggiFile").apply { if (!idFile.isNullOrBlank()) put("idFile", idJson(idFile)) }).numero("daLeggere")?.toInt() ?: 0

    // -------------------------------------------------- importa ed esporta (§7, §13.4)

    suspend fun esportaTutto(): Esportazione = Esportazione.daJson(t.scriviAzione(corpo("esportaTutto")).let { it.optJSONObject("esportazione") ?: it })

    suspend fun esportazioni(): List<Esportazione> = Esportazione.elenco(t.leggiAzione("esportazioni"))

    suspend fun leggiImport(nome: String, dati: ByteArray): LetturaImport =
        LetturaImport.daJson(t.scriviAzione(corpo("leggiImport").put("nome", nome).put("base64", Base64.getEncoder().encodeToString(dati))))

    private fun colonneJson(colonne: List<ColonnaImport>) = JSONArray().apply { colonne.forEach { put(it.aJson()) } }

    suspend fun controllaImport(idLettura: String, colonne: List<ColonnaImport>, tipo: String): ControlloImport =
        ControlloImport.daJson(t.scriviAzione(corpo("controllaImport").put("idLettura", idLettura).put("colonne", colonneJson(colonne)).put("tipo", tipo)))

    suspend fun importaSoggetti(idLettura: String, colonne: List<ColonnaImport>, tipo: String): Importazione =
        Importazione.daJson(t.scriviAzione(corpo("importaSoggetti").put("idLettura", idLettura).put("colonne", colonneJson(colonne)).put("tipo", tipo)).let { it.optJSONObject("importazione") ?: it })

    /** Torna gli archiviati e quelli che restano (con commesse, rapportini, preventivi o fatture). */
    suspend fun archiviaImportati(idImportazione: String): Pair<Int, Int> =
        t.scriviAzione(corpo("archiviaImportati").put("idImportazione", idJson(idImportazione))).let { (it.numero("archiviati")?.toInt() ?: 0) to (it.numero("restano")?.toInt() ?: 0) }

    suspend fun importazioni(): List<Importazione> = Importazione.elenco(t.leggiAzione("importazioni"))

    // -------------------------------------------------- dashboard (§13.5)

    suspend fun dashboardTutto(): Dashboard = Dashboard.daJson(t.leggiAzione("dashboard", listOf("tutto" to "true")))

    suspend fun salvaRiquadri(riquadri: List<String>) { t.scriviAzione(corpo("salvaRiquadri").put("riquadri", JSONArray(riquadri))) }

    suspend fun nascondiVoce(oggetto: String, giorni: Int = 30) { t.scriviAzione(corpo("nascondiVoce").put("oggetto", oggetto).put("giorni", giorni)) }

    suspend fun mostraNascoste() { t.scriviAzione(corpo("mostraNascoste")) }

    // -------------------------------------------------- amministrazione (§13.6)

    suspend fun impostazioniGenerali(): List<GruppoImpostazioni> = GruppoImpostazioni.elenco(t.leggiAzione("impostazioniGenerali"))

    /** salvaImpostazioni come sempre, coi valori del tipo giusto (numeri, sì/no, la tabella dei tempi). */
    suspend fun salvaImpostazioni(valori: Map<String, Any?>): Map<String, String> {
        val v = JSONObject()
        valori.forEach { (k, x) -> v.put(k, x ?: JSONObject.NULL) }
        return Anagrafiche.impostazioniDaJson(t.scriviAzione(corpo("salvaImpostazioni").put("valori", v)).optJSONObject("impostazioni"))
    }

    suspend fun funzioni(): List<Funzione> = Funzione.elenco(t.leggiAzione("funzioni"))

    /** Torna i nomi delle altre funzioni cambiate insieme (le dipendenze, progetti.md §5). */
    suspend fun salvaFunzioni(modulo: String, accesa: Boolean): List<String> =
        t.scriviAzione(corpo("salvaFunzioni").put("modulo", modulo).put("accesa", accesa)).optJSONArray("anche").oggetti().map { it.testo("nome").ifBlank { it.testo("modulo") } }

    suspend fun notifichePreferenze(): PreferenzeNotifiche = PreferenzeNotifiche.daJson(t.leggiAzione("notifichePreferenze"))

    suspend fun salvaNotifichePreferenze(telefono: Boolean?, silenzioSera: Boolean?, tipi: Map<String, Boolean>?) {
        val c = corpo("salvaNotifichePreferenze")
        telefono?.let { c.put("telefono", it) }
        silenzioSera?.let { c.put("silenzioSera", it) }
        tipi?.let { m -> c.put("tipi", JSONObject().apply { m.forEach { (k, v) -> put(k, v) } }) }
        t.scriviAzione(c)
    }

    /** Un'email di prova dal postino: torna a chi è andata. */
    suspend fun provaAvvisi(): List<String> = t.scriviAzione(corpo("provaAvvisi")).optJSONArray("a")?.stringhe().orEmpty()

    suspend fun sicurezza(): Sicurezza = Sicurezza.daJson(t.leggiAzione("sicurezza"))

    suspend fun scollegaTutti(password: String): Int = t.scriviAzione(corpo("scollegaTutti").put("password", password)).numero("scollegati")?.toInt() ?: 0

    /** La chiave si vede solo in questa risposta (§9.8): il telefono non la tiene da nessuna parte. */
    suspend fun accendiCifratura(): String = t.scriviAzione(corpo("accendiCifratura")).testo("chiave")

    suspend fun spegniCifratura() { t.scriviAzione(corpo("spegniCifratura").put("conferma", true)) }

    suspend fun copie(): CopieERipristino = CopieERipristino.daJson(t.leggiAzione("copie"))

    suspend fun provaCopia(): ProvaCopia = ProvaCopia.daJson(t.scriviAzione(corpo("provaCopia")).let { it.optJSONObject("prova") ?: it })

    suspend fun segnaRipristino(copia: String, da: String, conChiave: Boolean, controlli: List<Boolean>, note: String): ProvaCopia =
        ProvaCopia.daJson(t.scriviAzione(corpo("segnaRipristino").put("copia", copia).put("da", da).put("conChiave", conChiave)
            .put("controlli", JSONArray(controlli)).put("note", note.trim())).let { it.optJSONObject("prova") ?: it })

    suspend fun statoSistema(oraDispositivo: LocalDateTime): StatoSistema =
        StatoSistema.daJson(t.leggiAzione("statoSistema", listOf("oraDispositivo" to oraDispositivo.withNano(0).toString())))

    suspend fun controlliFinali(): ControlliFinali = ControlliFinali.daJson(t.leggiAzione("controlliFinali"))

    suspend fun segnaControllo(chiave: String, stato: String, nota: String, idDocumento: String? = null): RigaControllo {
        val c = corpo("segnaControllo").put("chiave", chiave).put("stato", stato)
        if (nota.isNotBlank()) c.put("nota", nota.trim())
        if (!idDocumento.isNullOrBlank()) c.put("idDocumento", idJson(idDocumento))
        return RigaControllo.daJson(t.scriviAzione(c).let { it.optJSONObject("riga") ?: it })
    }

    /** segnaCambio {stato: prima | prova | fatto | chiuso} (solo il titolare). */
    suspend fun segnaCambio(stato: String): StatoCambio = StatoCambio.daJson(t.scriviAzione(corpo("segnaCambio").put("stato", stato)).optJSONObject("cambio"))

    /**
     * Il logo dello studio (§9.3): caricaFile {tipo: "logo", base64, mime, idFile} (il server non lo prende da /carica),
     * PNG o JPG fino a 1 MB. Il server lo mette da solo in STUDIO_LOGO. Torna l'id del file.
     */
    suspend fun caricaLogo(nome: String, mime: String, dati: ByteArray): String {
        val c = corpo("caricaFile").put("tipo", "logo").put("mime", mime).put("nome", nome)
            .put("idFile", "logo-" + java.util.UUID.randomUUID().toString().replace("-", "").take(16))
            .put("base64", Base64.getEncoder().encodeToString(dati))
        val r = t.scriviAzione(c)
        val f = r.optJSONObject("file")
        return f?.testo("id").orEmpty().ifBlank { r.testo("id") }.ifBlank { FileRemoto.idDaUrl(f?.testo("url").orEmpty()) }
    }
}

// ---------------------------------------------------------------------------------- il servizio

/**
 * Quello che le schermate della fase 8 chiamano: le azioni come Result, i file pronti per
 * Condividi (il calendario .ics e lo ZIP di Esporta tutto in cacheDir/pdf), e i giri
 * da rifare dopo una scrittura (la Dashboard, le anagrafiche, chi sono).
 *
 * @param scaricaEsportazione `GET /esportazione/<id>` col Bearer (solo dalla strada di casa): i byte dello ZIP.
 */
class ServizioFase8(
    trasporto: TrasportoFase5,
    private val cartella: File?,
    private val esecutore: EsecutoreFase4,
    private val dopoScrittura: () -> Unit = {},
    private val impostazioniCambiate: suspend () -> Unit = {},
    private val chiSonoCambiato: suspend () -> Unit = {},
    private val scaricaEsportazione: suspend (String) -> ByteArray = { throw PonteServer.Rifiutato("Il file si scarica quando sei in ufficio") },
) {
    val f = Fase8(trasporto)

    private suspend fun <T> leggi(lavoro: suspend Fase8.() -> T): Result<T> = esecutore.esegui { f.lavoro() }
    private suspend fun <T> scrivi(lavoro: suspend Fase8.() -> T): Result<T> = esecutore.esegui { f.lavoro() }.also { if (it.isSuccess) dopoScrittura() }

    /** Un file in cacheDir/pdf (la cartella che il foglio Condividi può dare alle altre app). */
    private fun salvaFile(nome: String, byte: ByteArray): File {
        val dir = File(cartella ?: throw PonteServer.Rifiutato("Il file qui non si salva"), "pdf").apply { mkdirs() }
        return File(dir, nome.replace(Regex("""[^A-Za-z0-9._ -]"""), "_")).apply { writeBytes(byte) }
    }

    // -------------------------------------------------- integrazioni
    suspend fun integrazioni() = leggi { integrazioni() }
    suspend fun integrazione(chiave: String) = leggi { integrazione(chiave) }
    suspend fun provaIntegrazione(chiave: String) = scrivi { provaIntegrazione(chiave) }
    suspend fun salvaIntegrazione(chiave: String, account: String? = null, impostazioni: Map<String, Any?>? = null) =
        scrivi { salvaIntegrazione(chiave, account, impostazioni) }.also { if (it.isSuccess) impostazioniCambiate() }

    // -------------------------------------------------- calendario
    /** Il file .ics pronto per Condividi, e quanti eventi ha. */
    suspend fun esportaCalendario(cosa: String, assenze: Boolean, scadenze: Boolean): Result<Pair<File, Int>> = esecutore.esegui {
        val (nome, eventi, byte) = f.esportaCalendario(cosa, assenze, scadenze)
        salvaFile(nome, byte) to eventi
    }
    suspend fun feedCalendario() = leggi { feedCalendario() }
    suspend fun nuovoFeed(nome: String, cosa: CosaCalendario, dettagli: Boolean, pubblico: Boolean): Result<FeedCreato> {
        if (nome.isBlank()) return Result.failure(PonteServer.Rifiutato("Nome: scrivi un nome per riconoscerlo"))
        return scrivi { nuovoFeed(nome, cosa, dettagli, pubblico) }
    }
    suspend fun revocaFeed(id: String) = scrivi { revocaFeed(id) }

    // -------------------------------------------------- ricerca
    suspend fun letturaFile(idFile: String) = leggi { letturaFile(idFile) }
    suspend fun rileggiFile(idFile: String? = null) = scrivi { rileggiFile(idFile) }

    // -------------------------------------------------- importa ed esporta
    suspend fun esportaTutto() = scrivi { esportaTutto() }
    suspend fun esportazioni() = leggi { esportazioni() }
    /** Lo ZIP pronto per Condividi. */
    suspend fun scarica(e: Esportazione): Result<File> = esecutore.esegui { salvaFile(e.nome, scaricaEsportazione(e.id)) }
    suspend fun leggiImport(nome: String, dati: ByteArray) = leggi { leggiImport(nome, dati) }
    suspend fun controllaImport(idLettura: String, colonne: List<ColonnaImport>, tipo: String) = leggi { controllaImport(idLettura, colonne, tipo) }
    suspend fun importaSoggetti(idLettura: String, colonne: List<ColonnaImport>, tipo: String) =
        scrivi { importaSoggetti(idLettura, colonne, tipo) }.also { if (it.isSuccess) impostazioniCambiate() }
    suspend fun archiviaImportati(id: String) = scrivi { archiviaImportati(id) }.also { if (it.isSuccess) impostazioniCambiate() }
    suspend fun importazioni() = leggi { importazioni() }

    // -------------------------------------------------- dashboard
    suspend fun dashboardTutto() = leggi { dashboardTutto() }
    suspend fun salvaRiquadri(riquadri: List<String>): Result<Unit> {
        if (riquadri.size != 4) return Result.failure(PonteServer.Rifiutato("Scegline 4"))
        return scrivi { salvaRiquadri(riquadri) }
    }
    suspend fun nascondiVoce(oggetto: String, giorni: Int = 30) = scrivi { nascondiVoce(oggetto, giorni) }
    suspend fun mostraNascoste() = scrivi { mostraNascoste() }

    // -------------------------------------------------- amministrazione
    suspend fun impostazioniGenerali() = leggi { impostazioniGenerali() }
    suspend fun salvaImpostazioni(valori: Map<String, Any?>) = scrivi { salvaImpostazioni(valori) }.also { if (it.isSuccess) impostazioniCambiate() }
    suspend fun funzioni() = leggi { funzioni() }
    /** Spegnere o accendere una funzione cambia il menu di tutti: si rilegge chi sono (permessi e funzioni spente). */
    suspend fun salvaFunzioni(modulo: String, accesa: Boolean) = scrivi { salvaFunzioni(modulo, accesa) }.also { if (it.isSuccess) chiSonoCambiato() }
    suspend fun notifichePreferenze() = leggi { notifichePreferenze() }
    suspend fun salvaNotifichePreferenze(telefono: Boolean?, silenzioSera: Boolean?, tipi: Map<String, Boolean>?) = scrivi { salvaNotifichePreferenze(telefono, silenzioSera, tipi) }
    suspend fun provaAvvisi() = scrivi { provaAvvisi() }
    suspend fun sicurezza() = leggi { sicurezza() }
    suspend fun scollegaTutti(password: String): Result<Int> {
        if (password.isBlank()) return Result.failure(PonteServer.Rifiutato("La tua password: scrivila per confermare"))
        return scrivi { scollegaTutti(password) }
    }
    suspend fun accendiCifratura() = scrivi { accendiCifratura() }
    suspend fun spegniCifratura() = scrivi { spegniCifratura() }
    suspend fun copie() = leggi { copie() }
    suspend fun provaCopia() = scrivi { provaCopia() }
    suspend fun segnaRipristino(copia: String, da: String, conChiave: Boolean, controlli: List<Boolean>, note: String) = scrivi { segnaRipristino(copia, da, conChiave, controlli, note) }
    suspend fun statoSistema() = leggi { statoSistema(LocalDateTime.now(java.time.ZoneId.of("Europe/Rome"))) }
    suspend fun controlliFinali() = leggi { controlliFinali() }
    suspend fun segnaControllo(chiave: String, stato: String, nota: String, idDocumento: String? = null) = scrivi { segnaControllo(chiave, stato, nota, idDocumento) }
    suspend fun segnaCambio(stato: String) = scrivi { segnaCambio(stato) }
    suspend fun caricaLogo(nome: String, mime: String, dati: ByteArray): Result<String> {
        val m = mime.lowercase()
        if ((m != "image/png" && m != "image/jpeg" && m != "image/jpg") || dati.size > 1024 * 1024) {
            return Result.failure(PonteServer.Rifiutato("Il logo deve essere un PNG o un JPG di al massimo 1 MB"))
        }
        // Il server mette da solo il file in STUDIO_LOGO: qui si rileggono le impostazioni per l'anteprima.
        return scrivi { caricaLogo(nome, if (m == "image/jpg") "image/jpeg" else m, dati) }.also { if (it.isSuccess) impostazioniCambiate() }
    }
}
