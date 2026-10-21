package eu.stgm.wisper

import android.graphics.Bitmap
import android.net.Uri
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Calcolo
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.CodaInvii
import eu.stgm.wisper.rapportino.Commessa
import eu.stgm.wisper.rapportino.Conti
import eu.stgm.wisper.rapportino.Documento
import eu.stgm.wisper.rapportino.DocumentiCommessa
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Salvataggio
import eu.stgm.wisper.rapportino.Stato
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter

/**
 * I dati della visita guidata: tre clienti, qualche commessa col suo budget e
 * dei rapportini in tutti gli stati, attorno a oggi, tutto in memoria. Niente
 * foglio, niente coda, niente file: anche le cose dell'ufficio (clienti,
 * commesse, email) riescono e restano qui. Finita la visita sparisce tutto, e
 * l'app torna ai dati veri.
 */
class DatiEsempio(oggi: LocalDate = LocalDate.now()) : Dati {

    private val _ana = MutableStateFlow(
        Anagrafiche(
            clienti = listOf(
                Cliente(
                    "C001", "Elettrodinamica", tariffaFissa = 30.0, pagaViaggio = false, kmRimborsati = true,
                    email = "amministrazione@elettrodinamica.example", telefono = "0445 380 112",
                    indirizzo = "Via dell'Industria 12, Thiene (VI)", partitaIva = "01234567890", costoFisso = 22.0,
                    note = "Tariffa fissa: il tempo di viaggio non si paga, i km sì.",
                ),
                Cliente(
                    "C002", "Rossi Impianti Srl", ultimaTariffa = 42.0, email = "ufficio@rossi-impianti.example",
                    telefono = "0445 521 908", indirizzo = "Via Roma 4, Schio (VI)", partitaIva = "02345678901",
                ),
                Cliente(
                    "C003", "Bianchi Termoidraulica", ultimaTariffa = 38.0, email = "info@bianchi-termo.example",
                    telefono = "0424 470 233", indirizzo = "Via Vicenza 88, Marostica (VI)", partitaIva = "03456789012",
                ),
            ),
            commesse = listOf(
                Commessa(
                    "26ST001", "C001", "Nuovo magazzino automatico Batokyo", "APERTA", "Zona industriale, Schio",
                    budgetOre = 120.0, inizio = oggi.minusDays(40), finePrevista = oggi.plusDays(25),
                    note = "Quadro nel locale tecnico a nord. Chiavi dal custode, citofono 2.",
                ),
                Commessa(
                    "26ST002", "C002", "Quadro elettrico capannone", "APERTA", "Via Roma 4, Schio",
                    prezzoOrario = 42.0, budgetOre = 20.0, costoOrario = 25.0,
                    inizio = oggi.minusDays(30), finePrevista = oggi.plusDays(12),
                ),
                Commessa(
                    "26ST003", "C003", "Caldaia via Roma", "APERTA", "Via Roma 21, Bassano del Grappa",
                    prezzoOrario = 38.0, budgetOre = 8.0, inizio = oggi.minusDays(50), finePrevista = oggi.minusDays(5),
                ),
                Commessa(
                    "26ST004", "C002", "Manutenzione cabina MT", "SOSPESA", "Via Roma 4, Schio",
                    prezzoOrario = 42.0, budgetOre = 16.0, inizio = oggi.minusDays(20),
                ),
                Commessa(
                    "25ST118", "C001", "Revamping linea di verniciatura", "CHIUSA", "Via dell'Industria 12, Thiene",
                    budgetEuro = 6000.0, inizio = oggi.minusMonths(7), finePrevista = oggi.minusMonths(4),
                ),
            ),
            impostazioni = mapOf(
                "EURO_KM" to "0.76", "TECNICO" to "Manuel Gasparotto", "AUTO" to "Volvo XC40", "COSTO_ORARIO" to "22",
                "TICKET_ATTIVO" to "NO", "RAGIONE_SOCIALE" to "Studio Tecnico GM", "INDIRIZZO" to "Via Esempio 1, Marostica (VI)",
                "PARTITA_IVA" to "00000000000", "EMAIL" to "studio@esempio.example", "TELEFONO" to "0424 000 000",
                "PEC" to "", "FIRMA_TECNICO" to "",
            ),
        )
    )
    private val ana: Anagrafiche get() = _ana.value

    // Prima dei rapportini, che lo usano mentre si creano.
    override val tecnico: String = "Manuel Gasparotto"

    private val _viste = MutableStateFlow(iniziali(oggi))
    override val viste: StateFlow<List<Vista>> = _viste.asStateFlow()

    /** Nella visita i rapportini sono pochi: lo storico e' lo stesso elenco. */
    override val storico: StateFlow<List<Vista>> = _viste.asStateFlow()
    override val anagrafiche: StateFlow<Anagrafiche> = _ana.asStateFlow()
    override val operazioni: StateFlow<List<CodaInvii.Operazione>> = MutableStateFlow(emptyList<CodaInvii.Operazione>()).asStateFlow()
    override val aggiornamento: StateFlow<Archivio.Aggiornamento> =
        MutableStateFlow(Archivio.Aggiornamento(ultimo = LocalDateTime.now())).asStateFlow()
    override val esempio: Boolean = true

    private val documentiEsempio = mutableMapOf(
        "26ST001" to listOf(
            Documento("esempio-doc-1", "Offerta firmata.pdf", "", "application/pdf", oggi.minusDays(38).atTime(9, 12)),
            Documento("esempio-doc-2", "Layout magazzino.pdf", "", "application/pdf", oggi.minusDays(35).atTime(16, 40)),
            Documento("esempio-doc-3", "Schema quadro di linea.pdf", "", "application/pdf", oggi.minusDays(12).atTime(11, 5)),
        ),
        "26ST002" to listOf(
            Documento("esempio-doc-4", "Preventivo quadro.pdf", "", "application/pdf", oggi.minusDays(29).atTime(10, 0)),
        ),
    )

    private fun conConto(r: Rapportino): Vista =
        Vista(r.copy(conto = Calcolo.calcola(r, ana.regoleDi(ana.cliente(r.idCliente, r.cliente), ana.commessa(r.idCommessa)))))

    /**
     * Ogni giorno lavorativo passato della settimana ha il suo rapportino, tranne
     * l'ultimo: così nella settimana si vede un giorno che manca, come capita
     * davvero. In più due bozze di Rossi da far firmare, e prima ancora quello
     * che serve all'ufficio: firmati da fatturare, inviati, fatturati, anche del
     * mese prima. I rapportini nuovi stanno tutti prima delle bozze: i primi
     * "recenti" della visita restano quelli di sempre.
     */
    private fun iniziali(oggi: LocalDate): List<Vista> {
        val lunedi = oggi.with(DayOfWeek.MONDAY)
        val passati = (0L until 5L).map { lunedi.plusDays(it) }.filter { it.isBefore(oggi) }
        val fatti = if (passati.size > 1) passati.dropLast(1) else passati
        val settimana = fatti.mapIndexed { i, d ->
            Rapportino(
                idLocale = "esempio-s$i", data = d, tecnico = tecnico, idCliente = "C001", cliente = "Elettrodinamica",
                idCommessa = "26ST001", commessa = "Nuovo magazzino automatico Batokyo",
                descrizione = if (i % 2 == 0) "Cablaggio quadro di linea" else "Collaudo sensori del nastro",
                oreLavoro = if (i % 2 == 0) 6.5 else 8.0, oreViaggio = 1.0, km = 96.0, id = "RAP/2026/00${10 + i}",
                stato = Stato.INVIATO, costoOrario = 22.0, inviatoIl = d.atTime(18, 0).format(ISO_ORA),
            )
        }
        val bozze = listOf(
            Rapportino(
                idLocale = "esempio-b1", data = lunedi.minusDays(5), tecnico = tecnico, idCliente = "C002",
                cliente = "Rossi Impianti Srl", idCommessa = "26ST002",
                commessa = "Quadro elettrico capannone", descrizione = "Sostituzione interruttore generale",
                oreLavoro = 3.5, km = 22.0, tariffa = 42.0, id = "RAP/2026/0004", costoOrario = 25.0,
            ),
            Rapportino(
                idLocale = "esempio-b2", data = lunedi.minusDays(3), tecnico = tecnico, idCliente = "C002",
                cliente = "Rossi Impianti Srl", idCommessa = "26ST002",
                commessa = "Quadro elettrico capannone", descrizione = "Verifica impianto di terra",
                oreLavoro = 2.5, oreViaggio = 1.0, km = 30.0, tariffa = 42.0, id = "RAP/2026/0005", costoOrario = 25.0,
            ),
        )
        val mesePrima = YearMonth.from(oggi).minusMonths(1)
        fun ufficio(
            n: Int, data: LocalDate, cliente: String, commessa: String, lavoro: String, ore: Double, stato: Stato,
            viaggio: Double = 1.0, km: Double = 0.0, spese: Double = 0.0, noteSpese: String = "",
        ): Rapportino {
            val c = ana.cliente(cliente)!!
            val m = ana.commessa(commessa)!!
            val d = feriale(data)
            val firmato = stato != Stato.BOZZA
            return Rapportino(
                idLocale = "esempio-u$n", data = d, tecnico = tecnico, idCliente = c.id, cliente = c.nome,
                idCommessa = m.id, commessa = m.descrizione, descrizione = lavoro, oreLavoro = ore, oreViaggio = viaggio,
                km = km, spese = spese, noteSpese = noteSpese, tariffa = if (c.tariffaFissa == null) c.ultimaTariffa else null,
                id = "RAP/${d.year}/0${100 + n}", stato = stato,
                firmatario = if (firmato) "Referente ${c.nome.substringBefore(' ')}" else "",
                firmatoIl = if (firmato) d.atTime(17, 30).format(ISO_ORA) else "",
                inviatoIl = if (stato == Stato.INVIATO || stato == Stato.FATTURATO) d.plusDays(1).atTime(9, 0).format(ISO_ORA) else "",
                fatturatoIl = if (stato == Stato.FATTURATO) d.plusDays(10).atTime(9, 0).format(ISO_ORA) else "",
                costoOrario = c.costoFisso ?: m.costoOrario ?: 22.0,
            )
        }
        val perUfficio = listOf(
            // Questo mese: firmati da fatturare.
            ufficio(1, lunedi.minusDays(7), "C001", "26ST001", "Posa canaline e passerelle", 8.0, Stato.FIRMATO, km = 96.0),
            ufficio(2, lunedi.minusDays(6), "C002", "26ST002", "Montaggio quadro di distribuzione", 6.0, Stato.FIRMATO, km = 30.0),
            ufficio(3, lunedi.minusDays(8), "C003", "26ST003", "Sostituzione bruciatore", 2.5, Stato.FIRMATO, km = 18.0,
                spese = 24.5, noteSpese = "Raccordi"),
            ufficio(4, lunedi.minusDays(11), "C002", "26ST002", "Cablaggio quadro di distribuzione", 6.0, Stato.INVIATO, km = 30.0),
            ufficio(5, lunedi.minusDays(13), "C001", "26ST001", "Tracciamento linee e sopralluogo", 7.5, Stato.INVIATO, km = 96.0),
            // Il mese prima: fatturati, e due rimasti da fatturare.
            ufficio(6, mesePrima.atDay(6), "C001", "26ST001", "Sopralluogo e rilievi", 6.0, Stato.FATTURATO, km = 96.0),
            ufficio(7, mesePrima.atDay(13), "C001", "26ST001", "Progetto quadro di linea", 8.0, Stato.FATTURATO, viaggio = 0.0),
            ufficio(8, mesePrima.atDay(20), "C001", "26ST001", "Preparazione materiali", 8.0, Stato.INVIATO, viaggio = 0.0),
            ufficio(9, mesePrima.atDay(9), "C003", "26ST003", "Smontaggio caldaia vecchia", 4.0, Stato.FATTURATO, km = 18.0),
            ufficio(10, mesePrima.atDay(16), "C003", "26ST003", "Posa caldaia nuova", 3.0, Stato.INVIATO, km = 18.0),
            ufficio(11, mesePrima.atDay(22), "C002", "26ST004", "Verifica cabina MT", 4.0, Stato.FATTURATO, km = 30.0),
            // Una commessa chiusa, mesi fa: tutto fatturato.
            ufficio(12, oggi.minusMonths(5).withDayOfMonth(10), "C001", "25ST118", "Smontaggio linea vecchia", 8.0, Stato.FATTURATO, km = 40.0),
            ufficio(13, oggi.minusMonths(5).withDayOfMonth(17), "C001", "25ST118", "Collaudo linea nuova", 8.0, Stato.FATTURATO, km = 40.0),
        )
        return (settimana + bozze + perUfficio).map(::conConto).sortedByDescending { it.rapportino.data }
    }

    /** Un sabato o una domenica diventa il venerdi' prima: i rapportini finti sono di giorni di lavoro. */
    private fun feriale(d: LocalDate): LocalDate = when (d.dayOfWeek) {
        DayOfWeek.SATURDAY -> d.minusDays(1)
        DayOfWeek.SUNDAY -> d.minusDays(2)
        else -> d
    }

    private fun cambia(idLocale: String, f: (Rapportino) -> Rapportino) {
        _viste.value = _viste.value.map { if (it.rapportino.idLocale == idLocale) conConto(f(it.rapportino)) else it }
    }

    private fun adesso(): String = LocalDateTime.now().format(ISO_ORA)

    /** Lo stesso cambio che farebbe lo script (cambiaStato), sul rapportino in memoria. */
    private fun conStato(r: Rapportino, stato: Stato): Rapportino = when (stato) {
        Stato.BOZZA -> r.copy(stato = Stato.BOZZA, firma = null, firmatario = "", firmatoIl = "", inviatoIl = "", fatturatoIl = "")
        Stato.INVIATO -> r.copy(stato = Stato.INVIATO, inviatoIl = adesso(), fatturatoIl = "")
        Stato.FATTURATO -> r.copy(stato = Stato.FATTURATO, fatturatoIl = adesso())
        else -> r.copy(stato = stato)
    }

    override fun aggiorna(mese: YearMonth?) = Unit
    override fun aggiornaStorico() = Unit

    override fun tariffaProposta(cliente: Cliente?, nomeCliente: String): Double? = cliente?.ultimaTariffa

    override fun salva(r: Rapportino) {
        val v = conConto(r)
        _viste.value = (_viste.value.filterNot { it.rapportino.idLocale == r.idLocale } + v)
            .sortedByDescending { it.rapportino.data }
    }

    override fun accodaFoto(idLocale: String, file: File) = Unit

    /** Nella visita la fotocamera non si apre: lo scontrino è finto. */
    override suspend fun preparaFoto(sorgente: Uri): File = File("esempio-scontrino.jpg")

    override fun togliFoto(idLocale: String, remota: FileRemoto?, locale: File?) = Unit

    override suspend fun firma(idLocale: String, disegno: Bitmap, firmatario: String) {
        cambia(idLocale) { it.copy(stato = Stato.FIRMATO, firmatario = firmatario, firmatoIl = LocalDateTime.now().toString()) }
    }

    override fun riportaInBozza(idLocale: String) {
        cambia(idLocale) { conStato(it, Stato.BOZZA) }
    }

    override fun elimina(idLocale: String) {
        _viste.value = _viste.value.filterNot { it.rapportino.idLocale == idLocale }
    }

    override fun riprova(idOp: String) = Unit
    override fun scarta(idOp: String) = Unit

    // ------------------------------------------------------------- l'ufficio, in memoria

    /** Le stesse regole del computer e di [Archivio.cambiaStato]. */
    override fun cambiaStato(idLocali: List<String>, stato: Stato): CambioStato {
        val prima = LinkedHashMap<String, Stato>()
        val tutti = _viste.value.associateBy { it.rapportino.idLocale }
        for (id in idLocali.distinct()) {
            val ora = tutti[id]?.rapportino?.stato ?: continue
            val daCambiare = when (stato) {
                Stato.INVIATO -> ora != Stato.FATTURATO && ora != Stato.INVIATO
                Stato.FATTURATO -> ora != Stato.FATTURATO
                Stato.BOZZA -> ora != Stato.BOZZA
                Stato.ANNULLATO -> true
                Stato.FIRMATO -> false
            }
            if (!daCambiare) continue
            prima[id] = ora
            if (stato == Stato.ANNULLATO) elimina(id) else cambia(id) { conStato(it, stato) }
        }
        return CambioStato(stato, prima)
    }

    /** Nella visita si torna sempre indietro, anche a firmato: niente foglio a dire di no. */
    override fun annullaCambioStato(cambio: CambioStato): Int {
        var tornati = 0
        cambio.prima.forEach { (id, st) ->
            if (_viste.value.any { it.rapportino.idLocale == id }) {
                cambia(id) { r ->
                    when (st) {
                        Stato.FIRMATO -> r.copy(stato = Stato.FIRMATO, inviatoIl = "", fatturatoIl = "")
                        Stato.INVIATO -> r.copy(stato = Stato.INVIATO, fatturatoIl = "")
                        else -> r.copy(stato = st)
                    }
                }
                tornati++
            }
        }
        return tornati
    }

    override suspend fun salvaCliente(cliente: Cliente, nuovo: Boolean): Result<Salvataggio<Cliente>> {
        if (cliente.nome.isBlank()) return errore("Scrivi il nome del cliente")
        val clienti = ana.clienti
        if (nuovo) {
            ana.cliente("", cliente.nome)?.let { return Result.success(Salvataggio(it, giaEsisteva = true)) }
            val max = clienti.mapNotNull { Regex("""^C(\d+)$""").find(it.id)?.groupValues?.get(1)?.toIntOrNull() }.maxOrNull() ?: 0
            val c = cliente.copy(id = "C%03d".format(max + 1), nome = cliente.nome.trim())
            _ana.value = ana.copy(clienti = clienti + c)
            return Result.success(Salvataggio(c))
        }
        _ana.value = ana.copy(clienti = clienti.map { if (it.id == cliente.id) cliente else it })
        return Result.success(Salvataggio(cliente))
    }

    override suspend fun salvaCommessa(commessa: Commessa, nuova: Boolean): Result<Salvataggio<Commessa>> {
        if (commessa.idCliente.isBlank()) return errore("Scegli il cliente della commessa")
        if (commessa.descrizione.isBlank()) return errore("Scrivi come si chiama la commessa")
        val commesse = ana.commesse
        if (nuova) {
            commesse.firstOrNull {
                it.idCliente == commessa.idCliente && Anagrafiche.normalizza(it.descrizione) == Anagrafiche.normalizza(commessa.descrizione)
            }?.let { return Result.success(Salvataggio(it, giaEsisteva = true)) }
            val id = commessa.id.trim().uppercase().ifBlank { ana.prossimoCodiceCommessa(LocalDate.now().year) }
            if (commesse.any { it.id.equals(id, ignoreCase = true) }) return errore("Il codice $id è già di un'altra commessa")
            val m = commessa.copy(id = id, stato = "APERTA", inizio = commessa.inizio ?: LocalDate.now())
            _ana.value = ana.copy(commesse = commesse + m)
            return Result.success(Salvataggio(m))
        }
        _ana.value = ana.copy(commesse = commesse.map { if (it.id.equals(commessa.id, ignoreCase = true)) commessa else it })
        return Result.success(Salvataggio(commessa))
    }

    override suspend fun salvaImpostazioni(valori: Map<String, String>): Result<Map<String, String>> {
        val pronti = valori.mapValues { (k, v) ->
            val t = v.trim()
            if (k in Anagrafiche.IMPOSTAZIONI_NUMERICHE && t.isNotEmpty()) {
                val n = Numeri.leggi(t) ?: return errore(
                    if (k == Anagrafiche.EURO_KM) "Il rimborso km dev'essere un numero, per esempio 0,76"
                    else "Il costo orario dev'essere un numero, per esempio 22"
                )
                n.toString()
            } else t
        }
        _ana.value = ana.copy(impostazioni = ana.impostazioni + pronti)
        return Result.success(ana.impostazioni)
    }

    override suspend fun documenti(idCommessa: String): Result<DocumentiCommessa> =
        Result.success(DocumentiCommessa("", documentiEsempio[idCommessa].orEmpty().sortedByDescending { it.data }))

    override suspend fun caricaDocumento(idCommessa: String, uri: Uri): Result<Documento> {
        val nome = uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: "Documento.pdf"
        val d = Documento("esempio-doc-${System.nanoTime()}", nome, "", "application/pdf", LocalDateTime.now())
        documentiEsempio[idCommessa] = documentiEsempio[idCommessa].orEmpty() + d
        return Result.success(d)
    }

    override suspend fun caricaFirmaTecnico(png: ByteArray): Result<FileRemoto> {
        val f = FileRemoto("esempioFirmaTecnico", "https://drive.google.com/file/d/esempioFirmaTecnico/view")
        _ana.value = ana.copy(impostazioni = ana.impostazioni + (Anagrafiche.FIRMA_TECNICO to f.url))
        return Result.success(f)
    }

    override suspend fun caricaFoglioFirmato(idLocale: String, uri: Uri, firmatario: String): Result<Rapportino> {
        if (firmatario.isBlank()) return errore("Scrivi il nome di chi ha firmato")
        val r = _viste.value.firstOrNull { it.rapportino.idLocale == idLocale }?.rapportino ?: return errore("Rapportino non trovato")
        cambia(idLocale) {
            it.copy(
                firmatario = firmatario.trim(), firmatoIl = adesso(),
                stato = if (r.stato == Stato.INVIATO || r.stato == Stato.FATTURATO) r.stato else Stato.FIRMATO,
            )
        }
        return Result.success(_viste.value.first { it.rapportino.idLocale == idLocale }.rapportino)
    }

    /** Nella visita l'email non parte: i rapportini si segnano inviati e basta. */
    override suspend fun inviaEmail(
        a: String,
        cc: String,
        oggetto: String,
        messaggio: String,
        pdf: File?,
        idLocali: List<String>,
        aMe: Boolean,
    ): Result<List<Rapportino>> {
        if (!aMe && a.isBlank()) return errore("Manca l'indirizzo: scrivilo qui (lo puoi salvare nella scheda del cliente)")
        if (aMe) return Result.success(emptyList())
        val daSegnare = _viste.value.filter { it.rapportino.idLocale in idLocali && it.rapportino.stato != Stato.FATTURATO }
        daSegnare.forEach { v -> cambia(v.rapportino.idLocale) { conStato(it, Stato.INVIATO) } }
        val chiavi = daSegnare.map { it.rapportino.idLocale }.toSet()
        return Result.success(_viste.value.map { it.rapportino }.filter { it.idLocale in chiavi })
    }

    /** Niente file nella visita: i PDF restano senza immagini. */
    override suspend fun file(id: String): Pair<ByteArray, String>? = null

    override fun perStampa(idLocali: List<String>): DatiStampa {
        val tutte = _viste.value.associateBy { it.rapportino.idLocale }
        val scelte = idLocali.distinct().mapNotNull { tutte[it] }
        val conConti = scelte.conConti()
        return DatiStampa(
            rapportini = scelte.map { it.rapportino.comeDalFoglio(it.conto) },
            anagrafiche = ana.aJson(),
            intestatario = Conti.intestatarioRiepilogo(conConti, ana).aJson(),
            periodo = Conti.periodoDi(conConti),
        )
    }

    private fun <T> errore(messaggio: String): Result<T> = Result.failure(Exception(messaggio))

    private companion object {
        val ISO_ORA: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
    }
}
