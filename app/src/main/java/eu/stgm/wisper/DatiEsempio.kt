package eu.stgm.wisper

import android.graphics.Bitmap
import android.net.Uri
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Calcolo
import eu.stgm.wisper.rapportino.CampoCambiato
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.CodaInvii
import eu.stgm.wisper.rapportino.Commessa
import eu.stgm.wisper.rapportino.Conti
import eu.stgm.wisper.rapportino.CopiaSicurezza
import eu.stgm.wisper.rapportino.CosaFare
import eu.stgm.wisper.rapportino.Dashboard
import eu.stgm.wisper.rapportino.DatiPartitaIva
import eu.stgm.wisper.rapportino.Dispositivo
import eu.stgm.wisper.rapportino.Documento
import eu.stgm.wisper.rapportino.DocumentiCommessa
import eu.stgm.wisper.rapportino.FileCestino
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.FiltroRegistro
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numerazione
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.PaginaRegistro
import eu.stgm.wisper.rapportino.PartitaIva
import eu.stgm.wisper.rapportino.Permessi
import eu.stgm.wisper.rapportino.Prestazione
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Referente
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.Salvataggio
import eu.stgm.wisper.rapportino.Sede
import eu.stgm.wisper.rapportino.Sessione
import eu.stgm.wisper.rapportino.Stato
import eu.stgm.wisper.rapportino.StatoCopie
import eu.stgm.wisper.rapportino.Utente
import eu.stgm.wisper.rapportino.UtenteSalvato
import eu.stgm.wisper.rapportino.VoceRegistro
import eu.stgm.wisper.rapportino.istanteLocale
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
 * I dati della visita guidata, gli stessi del prototipo della fase 1
 * (docs/prototipo/Gestionale-fase1.html): clienti e fornitori con referenti e
 * sedi, commesse con le prestazioni, gli utenti dello studio, il registro, e dei
 * rapportini in tutti gli stati attorno a oggi. Tutto in memoria: niente server,
 * niente coda, niente file veri. Finita la visita sparisce tutto e l'app torna
 * ai dati veri.
 *
 * @param cartella dove mettere i file per Excel (la cartella dei PDF), se serve.
 */
class DatiEsempio(oggi: LocalDate = LocalDate.now(), private val cartella: File? = null) : Dati {

    private val lunedi = oggi.with(DayOfWeek.MONDAY)

    private val utentiEsempio = listOf(
        Utente("1", "Manuel Gasparotto", "manuel@esempio.it", Ruoli.TITOLARE, true, oggi.atTime(8, 12).toString()),
        Utente("2", "Laura Bianchi", "laura@esempio.it", Ruoli.AMMINISTRAZIONE, true, oggi.minusDays(1).atTime(17, 40).toString()),
        Utente("3", "Marco Rossato", "marco@esempio.it", Ruoli.COLLABORATORE, true, oggi.atTime(7, 55).toString()),
        Utente("4", "Studio Conti", "commercialista@esempio.it", Ruoli.LETTURA, false, ""),
    )

    private val _ana = MutableStateFlow(
        Anagrafiche(
            clienti = listOf(
                Cliente(
                    "C001", "Elettrodinamica", tariffaFissa = 30.0, pagaViaggio = false, kmRimborsati = true,
                    email = "rapportini@elettrodinamica.esempio", telefono = "0445 123456",
                    indirizzo = "Via dell'Industria 12", cap = "36016", citta = "Thiene", provincia = "VI",
                    partitaIva = "01234567890", codiceFiscale = "01234567890", codiceSdi = "M5UXCR1",
                    pec = "elettrodinamica@pec.esempio.it", costoFisso = 22.0,
                    note = "Tariffa fissa: il tempo di viaggio non si paga, i km sì.",
                ),
                Cliente(
                    "C002", "Rossi Impianti Srl", ultimaTariffa = 42.0, email = "rossi@esempio.it",
                    telefono = "0424 555 010", indirizzo = "Via Nuova 3", cap = "36061", citta = "Bassano del Grappa",
                    provincia = "VI", partitaIva = "04455667788", codiceFiscale = "04455667788",
                ),
                Cliente(
                    "C003", "Mario Bianchi", ultimaTariffa = 38.0, email = "mario.bianchi@esempio.it",
                    telefono = "347 000 1122", indirizzo = "Via Montegrappa 8", cap = "36063", citta = "Marostica", provincia = "VI",
                ),
            ),
            fornitori = listOf(
                Cliente(
                    "F001", "Comel Forniture Elettriche", cliente = false, fornitore = true, email = "ordini@comel.esempio",
                    telefono = "0444 900 100", citta = "Vicenza", provincia = "VI", partitaIva = "09988776655",
                    codiceSdi = "KRRH6B9", pec = "comel@pec.esempio.it",
                ),
                Cliente(
                    "F002", "Verifiche Nord Snc", cliente = false, fornitore = true, email = "info@verifichenord.esempio",
                    telefono = "049 700 200", citta = "Padova", provincia = "PD", partitaIva = "05544332211",
                ),
            ),
            archiviati = listOf(
                Cliente("C004", "Impianti Vecchi Snc", citta = "Schio", provincia = "VI", archiviato = true, ultimaTariffa = 35.0),
            ),
            referenti = listOf(
                Referente("R1", "C001", "Giulia Dal Santo", "Ufficio tecnico", "g.dalsanto@elettrodinamica.esempio", "0445 123456 int. 4", ordine = 1),
                Referente("R2", "C001", "Paolo Zordan", "Amministrazione", "amministrazione@elettrodinamica.esempio", "0445 123456 int. 2", ordine = 2),
                Referente("R3", "C002", "Andrea Rossi", "Titolare", "rossi@esempio.it", "333 123 4567", ordine = 1),
                Referente("R4", "F001", "Sara Comel", "Ordini", "ordini@comel.esempio", "0444 900 101", ordine = 1),
            ),
            sedi = listOf(
                Sede("S1", "C001", "sede", "Sede legale", "Via dell'Industria 12", "36016", "Thiene", "VI"),
                Sede("S2", "C001", "impianto", "Magazzino automatico Batokyo", "Zona industriale", "36015", "Schio", "VI"),
                Sede("S3", "C001", "impianto", "Cabina MT Acme", "Via Roma 40", "36010", "Zanè", "VI"),
                Sede("S4", "C002", "sede", "Capannone", "Via Nuova 3", "36061", "Bassano del Grappa", "VI"),
                Sede("S5", "C003", "impianto", "Fotovoltaico casa", "Via Montegrappa 8", "36063", "Marostica", "VI"),
            ),
            commesse = listOf(
                Commessa(
                    "26ST044", "C001", "Nuovo magazzino automatico", "APERTA", "Zona industriale, Schio",
                    budgetOre = 120.0, inizio = oggi.minusDays(60), finePrevista = oggi.with(DayOfWeek.FRIDAY).let { if (it.isBefore(oggi)) oggi else it },
                    note = "Quadro nel locale tecnico a nord. Chiavi dal custode, citofono 2.",
                    idSede = "S2", idResponsabile = "1", persone = listOf("1", "3"), importoContratto = 3700.0,
                ),
                Commessa(
                    "26ST045", "C002", "Quadro capannone", "APERTA", "Via Nuova 3, Bassano del Grappa",
                    prezzoOrario = 42.0, budgetOre = 40.0, costoOrario = 25.0,
                    inizio = oggi.minusDays(45), finePrevista = oggi.plusDays(38),
                    idSede = "S4", persone = listOf("1"), importoContratto = 1600.0,
                ),
                Commessa(
                    "26ST046", "C001", "Linea 3", "APERTA", "Via Roma 40, Zanè",
                    budgetOre = 24.0, inizio = oggi.minusDays(30), finePrevista = oggi.minusDays(4),
                    idSede = "S3", idResponsabile = "3", persone = listOf("3"),
                ),
                Commessa(
                    "26ST047", "C003", "Impianto fotovoltaico", "APERTA", "Via Montegrappa 8, Marostica",
                    prezzoOrario = 38.0, inizio = oggi.minusDays(15), idSede = "S5", persone = listOf("1"),
                ),
                Commessa(
                    "26ST043", "C002", "Manutenzione cabina MT", "SOSPESA", "Via Nuova 3, Bassano del Grappa",
                    prezzoOrario = 42.0, budgetOre = 16.0, inizio = oggi.minusDays(50), idSede = "S4", idResponsabile = "1",
                ),
                Commessa(
                    "25ST118", "C001", "Revamping linea di verniciatura", "CHIUSA", "Via dell'Industria 12, Thiene",
                    budgetEuro = 6000.0, inizio = oggi.minusMonths(7), finePrevista = oggi.minusMonths(4), idSede = "S1", idResponsabile = "1",
                ),
                Commessa(
                    "25ST090", "C004", "Quadro officina", "CHIUSA", "Schio", budgetOre = 10.0,
                    inizio = oggi.minusMonths(11), finePrevista = oggi.minusMonths(10), archiviata = true,
                ),
                Commessa(
                    "26ST030", "C002", "Modello: quadro elettrico standard", "APERTA", "", prezzoOrario = 42.0, budgetOre = 24.0,
                    modello = true, importoContratto = 1200.0,
                ),
            ),
            prestazioni = listOf(
                Prestazione("P1", "26ST044", "Sopralluogo e rilievo", valore = 300.0, avanzamento = 100, ordine = 1),
                Prestazione("P2", "26ST044", "Progetto esecutivo", "Schemi, layout e distinta del quadro", 1800.0, 60, 2),
                Prestazione("P3", "26ST044", "Direzione lavori", valore = 1200.0, avanzamento = 0, ordine = 3),
                Prestazione("P4", "26ST044", "Dichiarazione di rispondenza", valore = 400.0, avanzamento = 0, ordine = 4),
                Prestazione("P5", "26ST045", "Progetto quadro", valore = 900.0, avanzamento = 100, ordine = 1),
                Prestazione("P6", "26ST045", "Collaudo", valore = 700.0, avanzamento = 30, ordine = 2),
                Prestazione("P7", "26ST030", "Progetto", valore = 800.0, ordine = 1),
                Prestazione("P8", "26ST030", "Collaudo", valore = 400.0, ordine = 2),
            ),
            utenti = utentiEsempio,
            numerazioni = listOf(
                Numerazione("commessa", "{AA}ST{NNN}", 47, annuale = false),
                Numerazione("rapportino", "RAP/{AAAA}/{NNNN}", 142, annuale = true),
            ),
            impostazioni = mapOf(
                "EURO_KM" to "0.76", "TECNICO" to "Manuel Gasparotto", "AUTO" to "Volvo XC40", "COSTO_ORARIO" to "22",
                "TICKET_ATTIVO" to "NO", "RAGIONE_SOCIALE" to "Studio Tecnico GM", "INDIRIZZO" to "Via Esempio 1, Marostica (VI)",
                "PARTITA_IVA" to "00000000000", "EMAIL" to "studio@esempio.it", "TELEFONO" to "0424 000 000",
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

    private val permessiPerRuolo = Ruoli.ELENCO.associateWith { Permessi.iniziali(it) }.toMutableMap()

    override val sessione: StateFlow<Sessione> =
        MutableStateFlow(Sessione(utentiEsempio.first(), Permessi.iniziali(Ruoli.TITOLARE))).asStateFlow()

    private val _dashboard = MutableStateFlow<Dashboard?>(null)
    override val dashboard: StateFlow<Dashboard?> = _dashboard.asStateFlow()

    private val documentiEsempio = mutableMapOf(
        "26ST044" to listOf(
            Documento("esempio-doc-1", "Offerta firmata.pdf", "", "application/pdf", oggi.minusDays(58).atTime(9, 12)),
            Documento("esempio-doc-2", "Layout magazzino.pdf", "", "application/pdf", oggi.minusDays(35).atTime(16, 40)),
            Documento("esempio-doc-3", "Schema quadro di linea.pdf", "", "application/pdf", oggi.minusDays(12).atTime(11, 5)),
        ),
        "26ST045" to listOf(
            Documento("esempio-doc-4", "Preventivo quadro.pdf", "", "application/pdf", oggi.minusDays(44).atTime(10, 0)),
        ),
    )

    private val registroEsempio = mutableListOf(
        voce("1", oggi.atTime(16, 20), "Laura", "aggiorna", "soggetti", "C002", "Rossi Impianti Srl", "ha cambiato la tariffa di", listOf(CampoCambiato("Ultima tariffa", "40 €/h", "42 €/h"))),
        voce("2", oggi.atTime(12, 5), "Marco", "crea", "rapportini", "RAP/2026/0142", "RAP/2026/0142", "ha scritto il rapportino", emptyList(), dopo = "per Linea 3"),
        voce("3", oggi.atTime(9, 31), "Manuel", "stato", "rapportini", "", "4 rapportini", "ha segnato come fatturati", emptyList(), dopo = "di Elettrodinamica"),
        voce("4", oggi.minusDays(1).atTime(18, 2), "Manuel", "crea", "prestazioni", "P4", "Dichiarazione di rispondenza", "ha aggiunto la prestazione", listOf(CampoCambiato("Valore", "", "400 €")), dopo = "a 26ST044"),
        voce("5", oggi.minusDays(1).atTime(17, 45), "Manuel", "aggiorna", "utenti", "3", "Marco Rossato", "ha cambiato il ruolo di", listOf(CampoCambiato("Ruolo", "Lettura", "Collaboratore"))),
        voce("6", oggi.minusDays(1).atTime(11, 10), "Laura", "archivia", "soggetti", "C004", "Impianti Vecchi Snc", "ha archiviato il cliente", emptyList()),
        voce("7", oggi.minusDays(4).atTime(10, 0), "Manuel", "crea", "commesse", "26ST047", "26ST047", "ha creato la commessa", emptyList(), dopo = "Impianto fotovoltaico"),
    )

    private val cestinoEsempio = mutableListOf(
        FileCestino("esempio-c1", "scontrino-autostrada.jpg", "RAP/2026/0131", oggi.minusDays(2).atTime(15, 30).toString()),
        FileCestino("esempio-c2", "Schema vecchio.pdf", "26ST044", oggi.minusDays(9).atTime(9, 10).toString()),
    )

    private val dispositiviEsempio = mutableMapOf(
        "1" to mutableListOf(
            Dispositivo("D1", "motorola edge 60 pro", "telefono 0.5.0", oggi.atTime(8, 12).toString(), questo = true),
            Dispositivo("D2", "PC dell'ufficio", "computer 0.5.0", oggi.minusDays(1).atTime(18, 30).toString()),
        ),
        "2" to mutableListOf(Dispositivo("D3", "PC dell'amministrazione", "computer 0.5.0", oggi.minusDays(1).atTime(17, 40).toString())),
        "3" to mutableListOf(Dispositivo("D4", "Samsung Galaxy A55", "telefono 0.5.0", oggi.atTime(7, 55).toString())),
    )

    private var utentiCorrenti = utentiEsempio

    private fun voce(
        id: String, quando: LocalDateTime, chi: String, azione: String, tabella: String, idRiga: String,
        oggetto: String, frase: String, campi: List<CampoCambiato>, dopo: String = "",
    ) = VoceRegistro(id, quando.toString(), chi, azione, tabella, idRiga, oggetto, frase, dopo, campi)

    private fun conConto(r: Rapportino): Vista =
        Vista(r.copy(conto = Calcolo.calcola(r, ana.regoleDi(ana.cliente(r.idCliente, r.cliente), ana.commessa(r.idCommessa)))))

    /**
     * Ogni giorno lavorativo passato della settimana ha il suo rapportino, tranne
     * l'ultimo: così nella settimana si vede un giorno che manca, come capita
     * davvero. Due bozze vecchie da far firmare (Rossi e Mario Bianchi), e quello
     * che serve all'ufficio: firmati da fatturare, inviati, fatturati, anche dei
     * mesi prima. Le ore delle commesse sono quelle del prototipo (74 su 120, 46
     * su 40, 20 su 24, 6 senza budget). I rapportini nuovi stanno tutti prima
     * delle bozze: i primi "recenti" della visita restano quelli di sempre.
     */
    private fun iniziali(oggi: LocalDate): List<Vista> {
        val passati = (0L until 5L).map { lunedi.plusDays(it) }.filter { it.isBefore(oggi) }
        val fatti = if (passati.size > 1) passati.dropLast(1) else passati
        val settimana = fatti.mapIndexed { i, d ->
            Rapportino(
                idLocale = "esempio-s$i", data = d, tecnico = tecnico, idCliente = "C001", cliente = "Elettrodinamica",
                idCommessa = "26ST044", commessa = "Nuovo magazzino automatico",
                descrizione = if (i % 2 == 0) "Cablaggio quadro di linea" else "Collaudo sensori del nastro",
                oreLavoro = if (i % 2 == 0) 6.5 else 8.0, oreViaggio = 1.0, km = 96.0, id = "RAP/${d.year}/01${30 + i}",
                stato = Stato.INVIATO, costoOrario = 22.0, inviatoIl = d.atTime(18, 0).format(ISO_ORA),
            )
        }
        val bozze = listOf(
            Rapportino(
                idLocale = "esempio-b1", data = feriale(oggi.minusDays(9)), tecnico = tecnico, idCliente = "C002",
                cliente = "Rossi Impianti Srl", idCommessa = "26ST045",
                commessa = "Quadro capannone", descrizione = "Sostituzione interruttore generale",
                oreLavoro = 3.5, km = 22.0, tariffa = 42.0, id = "RAP/${oggi.year}/0128", costoOrario = 25.0,
            ),
            Rapportino(
                idLocale = "esempio-b2", data = feriale(oggi.minusDays(10)), tecnico = tecnico, idCliente = "C003",
                cliente = "Mario Bianchi", idCommessa = "26ST047",
                commessa = "Impianto fotovoltaico", descrizione = "Sopralluogo sul tetto",
                oreLavoro = 2.5, oreViaggio = 0.5, km = 12.0, tariffa = 38.0, id = "RAP/${oggi.year}/0127", costoOrario = 22.0,
            ),
        )
        val mesePrima = YearMonth.from(oggi).minusMonths(1)
        val dueMesiPrima = YearMonth.from(oggi).minusMonths(2)
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
                id = "RAP/${d.year}/0${n + 20}", stato = stato,
                firmatario = if (firmato) "Referente ${c.nome.substringBefore(' ')}" else "",
                firmatoIl = if (firmato) d.atTime(17, 30).format(ISO_ORA) else "",
                inviatoIl = if (stato == Stato.INVIATO || stato == Stato.FATTURATO) d.plusDays(1).atTime(9, 0).format(ISO_ORA) else "",
                fatturatoIl = if (stato == Stato.FATTURATO) d.plusDays(10).atTime(9, 0).format(ISO_ORA) else "",
                costoOrario = c.costoFisso ?: m.costoOrario ?: 22.0,
            )
        }
        val giorniMese = YearMonth.from(oggi).atDay(1)
        fun questoMese(giorniFa: Long): LocalDate = oggi.minusDays(giorniFa).let { if (it.isBefore(giorniMese)) giorniMese else it }
        val perUfficio = listOf(
            // Questo mese: firmati e inviati da fatturare.
            ufficio(1, questoMese(14), "C001", "26ST044", "Posa canaline e passerelle", 8.0, Stato.FIRMATO, km = 96.0),
            ufficio(2, questoMese(13), "C002", "26ST045", "Montaggio quadro di distribuzione", 6.0, Stato.FIRMATO, km = 30.0),
            ufficio(3, questoMese(15), "C003", "26ST047", "Posa staffe dei pannelli", 3.5, Stato.FIRMATO, km = 12.0,
                spese = 24.5, noteSpese = "Raccordi"),
            ufficio(4, questoMese(16), "C002", "26ST045", "Cablaggio quadro di distribuzione", 6.0, Stato.INVIATO, km = 30.0),
            ufficio(5, questoMese(17), "C001", "26ST044", "Tracciamento linee e sopralluogo", 7.5, Stato.INVIATO, km = 96.0),
            ufficio(6, questoMese(12), "C001", "26ST046", "Cablaggio cabina", 6.0, Stato.FIRMATO, km = 40.0),
            // Il mese prima: Rossi ancora da fatturare (la cosa piu' urgente), il resto fatturato.
            ufficio(7, mesePrima.atDay(8), "C002", "26ST045", "Progetto del quadro", 8.0, Stato.INVIATO, viaggio = 0.0),
            ufficio(8, mesePrima.atDay(15), "C002", "26ST045", "Disegno dei fronti quadro", 8.0, Stato.INVIATO, viaggio = 0.0),
            ufficio(9, mesePrima.atDay(22), "C002", "26ST045", "Sopralluogo e misure", 7.5, Stato.FIRMATO, km = 30.0),
            ufficio(10, mesePrima.atDay(6), "C001", "26ST044", "Sopralluogo e rilievi", 6.0, Stato.FATTURATO, km = 96.0),
            ufficio(11, mesePrima.atDay(13), "C001", "26ST044", "Progetto quadro di linea", 8.0, Stato.FATTURATO, viaggio = 0.0),
            ufficio(12, mesePrima.atDay(20), "C001", "26ST044", "Preparazione materiali", 8.0, Stato.FATTURATO, viaggio = 0.0),
            ufficio(13, mesePrima.atDay(27), "C001", "26ST044", "Progetto esecutivo", 8.0, Stato.FATTURATO, viaggio = 0.0),
            ufficio(14, mesePrima.atDay(9), "C001", "26ST046", "Sopralluogo in cabina", 8.0, Stato.FATTURATO, km = 40.0),
            ufficio(15, mesePrima.atDay(16), "C001", "26ST046", "Schema della cabina", 6.0, Stato.FATTURATO, viaggio = 0.0),
            ufficio(16, mesePrima.atDay(23), "C002", "26ST043", "Verifica cabina MT", 4.0, Stato.FATTURATO, km = 30.0),
            ufficio(17, dueMesiPrima.atDay(10), "C002", "26ST045", "Primo sopralluogo", 7.0, Stato.FATTURATO, km = 30.0),
            ufficio(18, dueMesiPrima.atDay(17), "C001", "26ST044", "Offerta e rilievo", 7.5, Stato.FATTURATO, km = 96.0),
            // Una commessa chiusa, mesi fa: tutto fatturato.
            ufficio(19, oggi.minusMonths(5).withDayOfMonth(10), "C001", "25ST118", "Smontaggio linea vecchia", 8.0, Stato.FATTURATO, km = 40.0),
            ufficio(20, oggi.minusMonths(5).withDayOfMonth(17), "C001", "25ST118", "Collaudo linea nuova", 8.0, Stato.FATTURATO, km = 40.0),
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

    override fun aggiorna(mese: YearMonth?) = aggiornaDashboard()
    override fun aggiornaStorico() = Unit
    override fun aggiornaArchiviati() = Unit

    override fun aggiornaDashboard() {
        _dashboard.value = CosaFare.calcola(ana, _viste.value.conConti())
    }

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
        if (cliente.nome.isBlank()) return errore("Scrivi il nome o la ragione sociale")
        if (nuovo) {
            ana.doppioneDi(cliente.nome, cliente.alias, cliente.partitaIva)?.let { return Result.success(Salvataggio(it, giaEsisteva = true)) }
            val prefisso = if (cliente.cliente) "C" else "F"
            val max = ana.soggetti.mapNotNull { Regex("""^$prefisso(\d+)$""").find(it.id)?.groupValues?.get(1)?.toIntOrNull() }.maxOrNull() ?: 0
            val c = cliente.copy(id = prefisso + "%03d".format(max + 1), nome = cliente.nome.trim())
            metti(c)
            return Result.success(Salvataggio(c))
        }
        metti(cliente)
        return Result.success(Salvataggio(cliente))
    }

    /** Un soggetto al suo posto negli elenchi giusti (clienti, fornitori, archiviati). */
    private fun metti(s: Cliente) {
        val a = ana
        fun via(l: List<Cliente>) = l.filterNot { it.id == s.id }
        fun dentro(l: List<Cliente>, si: Boolean) = if (si) (via(l) + s).sortedBy { it.nome.lowercase() } else via(l)
        _ana.value = a.copy(
            clienti = dentro(a.clienti, s.cliente && !s.archiviato),
            fornitori = dentro(a.fornitori, s.fornitore && !s.archiviato),
            archiviati = dentro(a.archiviati, s.archiviato),
        )
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
            _ana.value = ana.copy(commesse = commesse + m, numerazioni = conUltimo("commessa"))
            return Result.success(Salvataggio(m))
        }
        _ana.value = ana.copy(commesse = commesse.map { if (it.id.equals(commessa.id, ignoreCase = true)) commessa else it })
        return Result.success(Salvataggio(commessa))
    }

    private fun conUltimo(tipo: String): List<Numerazione> = ana.numerazioni.map { if (it.tipo == tipo) it.copy(ultimo = it.ultimo + 1, prossimo = "") else it }

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
        val f = FileRemoto("esempioFirmaTecnico", "/file/esempioFirmaTecnico")
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

    // ------------------------------------------------------------- il gestionale, in memoria

    override suspend fun archiviaSoggetto(id: String, archivia: Boolean): Result<Unit> {
        val s = ana.soggetto(id) ?: return errore("Non trovo questa anagrafica")
        metti(s.copy(archiviato = archivia))
        return Result.success(Unit)
    }

    override suspend fun controllaPartitaIva(partitaIva: String): Result<DatiPartitaIva> {
        val p = partitaIva.filter { it.isDigit() }
        PartitaIva.errore(p)?.let { return errore(it) }
        // Nella visita il registro delle imprese non si chiama: risponde un'azienda di esempio.
        return Result.success(DatiPartitaIva(true, "Esempio Impianti Srl", "Via dell'Esempio 1", "36100", "Vicenza", "VI"))
    }

    override suspend fun salvaReferente(r: Referente): Result<Referente> {
        if (r.nome.isBlank()) return errore("Scrivi il nome del referente")
        val nuovo = if (r.id.isBlank()) r.copy(id = "R${System.nanoTime()}", ordine = ana.referentiDi(r.idSoggetto).size + 1) else r
        _ana.value = ana.copy(referenti = ana.referenti.filterNot { it.id == nuovo.id } + nuovo)
        return Result.success(nuovo)
    }

    override suspend fun togliReferente(id: String): Result<Unit> {
        _ana.value = ana.copy(referenti = ana.referenti.filterNot { it.id == id })
        return Result.success(Unit)
    }

    override suspend fun salvaSede(s: Sede): Result<Sede> {
        if (s.nome.isBlank()) return errore("Scrivi il nome della sede o dell'impianto")
        val nuova = if (s.id.isBlank()) s.copy(id = "S${System.nanoTime()}") else s
        _ana.value = ana.copy(sedi = ana.sedi.filterNot { it.id == nuova.id } + nuova)
        return Result.success(nuova)
    }

    override suspend fun archiviaSede(id: String, archivia: Boolean): Result<Unit> {
        _ana.value = ana.copy(sedi = ana.sedi.map { if (it.id == id) it.copy(archiviata = archivia) else it })
        return Result.success(Unit)
    }

    override suspend fun salvaPrestazione(p: Prestazione): Result<Prestazione> {
        if (p.nome.isBlank()) return errore("Scrivi il nome della prestazione")
        val nuova = if (p.id.isBlank()) p.copy(id = "P${System.nanoTime()}", ordine = (ana.prestazioniDi(p.idCommessa).maxOfOrNull { it.ordine } ?: 0) + 1) else p
        _ana.value = ana.copy(prestazioni = ana.prestazioni.map { if (it.id == nuova.id) nuova else it }.let { l -> if (l.any { it.id == nuova.id }) l else l + nuova })
        return Result.success(nuova)
    }

    override suspend fun togliPrestazione(id: String): Result<Unit> {
        _ana.value = ana.copy(prestazioni = ana.prestazioni.filterNot { it.id == id })
        return Result.success(Unit)
    }

    override suspend fun ordinaPrestazioni(idCommessa: String, ordine: List<String>): Result<Unit> {
        _ana.value = ana.copy(prestazioni = ana.prestazioni.map { p -> ordine.indexOf(p.id).takeIf { it >= 0 }?.let { p.copy(ordine = it + 1) } ?: p })
        return Result.success(Unit)
    }

    override suspend fun duplicaCommessa(id: String, comeModello: Boolean): Result<Commessa> {
        val m = ana.commessa(id) ?: return errore("Non trovo la commessa $id")
        val codice = ana.prossimoCodiceCommessa(LocalDate.now().year)
        val nuova = m.copy(
            id = codice, stato = "APERTA", archiviata = false, modello = comeModello, inizio = if (comeModello) null else LocalDate.now(),
            finePrevista = null, cartella = "", codicePrecedente = "",
            descrizione = if (comeModello && !m.modello) "Modello: ${m.descrizione}" else if (!comeModello && m.modello) m.descrizione.removePrefix("Modello: ") else m.descrizione,
        )
        val prestazioni = ana.prestazioniDi(id).mapIndexed { i, p -> p.copy(id = "P${System.nanoTime()}$i", idCommessa = codice, avanzamento = 0) }
        _ana.value = ana.copy(commesse = ana.commesse + nuova, prestazioni = ana.prestazioni + prestazioni, numerazioni = conUltimo("commessa"))
        return Result.success(nuova)
    }

    override suspend fun archiviaCommessa(id: String, archivia: Boolean): Result<Unit> {
        _ana.value = ana.copy(commesse = ana.commesse.map { if (it.id.equals(id, ignoreCase = true)) it.copy(archiviata = archivia) else it })
        return Result.success(Unit)
    }

    override suspend fun utenti(): Result<List<Utente>> = Result.success(utentiCorrenti)

    override suspend fun salvaUtente(u: Utente, password: String): Result<UtenteSalvato> {
        if (u.nome.isBlank()) return errore("Scrivi il nome")
        if (!u.email.contains('@')) return errore("Scrivi un'email valida, per esempio nome@esempio.it")
        val altro = utentiCorrenti.firstOrNull { it.email.equals(u.email.trim(), ignoreCase = true) && it.id != u.id }
        if (altro != null) return errore("C'è già un utente con questa email: ${altro.nome}")
        val salvato = if (u.id.isBlank()) u.copy(id = ((utentiCorrenti.maxOfOrNull { it.id.toIntOrNull() ?: 0 } ?: 0) + 1).toString()) else u
        utentiCorrenti = utentiCorrenti.filterNot { it.id == salvato.id } + salvato
        _ana.value = ana.copy(utenti = utentiCorrenti)
        return Result.success(UtenteSalvato(salvato, password))
    }

    override suspend fun dispositivi(idUtente: String): Result<List<Dispositivo>> = Result.success(dispositiviEsempio[idUtente].orEmpty())

    override suspend fun scollega(idDispositivo: String): Result<Unit> {
        dispositiviEsempio.values.forEach { l -> l.removeAll { it.id == idDispositivo } }
        return Result.success(Unit)
    }

    override suspend fun permessiRuoli(): Result<Map<String, Permessi>> = Result.success(permessiPerRuolo.toMap())

    override suspend fun salvaPermesso(ruolo: String, modulo: String, livello: Int): Result<Unit> {
        if (ruolo == Ruoli.TITOLARE) return errore("Il titolare ha sempre tutto")
        val p = permessiPerRuolo[ruolo] ?: return errore("Ruolo sconosciuto")
        permessiPerRuolo[ruolo] = Permessi(p.livelli + (modulo to livello.coerceIn(0, 2)))
        return Result.success(Unit)
    }

    override suspend fun registro(filtro: FiltroRegistro): Result<PaginaRegistro> {
        val da = if (filtro.giorni > 0) LocalDate.now().minusDays(filtro.giorni.toLong() - 1).atStartOfDay() else null
        val nomeUtente = utentiCorrenti.firstOrNull { it.id == filtro.utente }?.nome?.substringBefore(' ')
        val voci = registroEsempio.filter { v ->
            (da == null || (istanteLocale(v.quando)?.isBefore(da) == false)) &&
                (nomeUtente == null || v.chi == nomeUtente) &&
                (filtro.tabella.isBlank() || v.tabella == filtro.tabella)
        }.sortedByDescending { it.quando }
        return Result.success(PaginaRegistro(voci, altre = false))
    }

    override suspend fun salvaNumerazione(n: Numerazione): Result<Numerazione> {
        if (!Regex("""\{N+\}""").containsMatchIn(n.formato)) return errore("Nel formato serve il numero")
        val nuova = n.copy(prossimo = "")
        _ana.value = ana.copy(numerazioni = ana.numerazioni.map { if (it.tipo == n.tipo) nuova else it })
        return Result.success(nuova)
    }

    override suspend fun cestino(): Result<List<FileCestino>> = Result.success(cestinoEsempio.toList())

    override suspend fun ripristinaFile(id: String): Result<Unit> {
        cestinoEsempio.removeAll { it.id == id }
        return Result.success(Unit)
    }

    private var copieEsempio = StatoCopie(
        ultima = CopiaSicurezza(LocalDate.now().atTime(2, 30).toString(), true, "Sul NAS e fuori casa, su Drive", 4_812_000),
        elenco = (0L until 5L).map { CopiaSicurezza(LocalDate.now().minusDays(it).atTime(2, 30).toString(), true, "Sul NAS e fuori casa, su Drive", 4_812_000 - it * 21_000) },
        foglioAggiornato = true,
    )

    override suspend fun copie(): Result<StatoCopie> = Result.success(copieEsempio)

    override suspend fun copiaAdesso(): Result<StatoCopie> {
        val c = CopiaSicurezza(LocalDateTime.now().toString(), true, "Sul NAS e fuori casa, su Drive", 4_830_000)
        copieEsempio = copieEsempio.copy(ultima = c, elenco = listOf(c) + copieEsempio.elenco)
        return Result.success(copieEsempio)
    }

    override suspend fun esporta(cosa: String, filtro: FiltroRegistro?): Result<File> {
        val dir = cartella?.let { File(it, "pdf") } ?: return errore("Nella visita il file non si salva")
        val righe: List<List<String>> = when (cosa) {
            "rapportini" -> listOf(listOf("Numero", "Data", "Cliente", "Commessa", "Lavoro", "Ore", "Km", "Totale", "Stato")) +
                _viste.value.map { v -> v.rapportino.let { r -> listOf(r.id, r.data.toString(), r.cliente, r.idCommessa, r.descrizione, Numeri.scrivi(r.oreTotali), Numeri.scrivi(r.km), Numeri.scrivi(v.conto?.totale ?: 0.0), r.stato.etichetta) } }
            "clienti", "fornitori" -> listOf(listOf("Codice", "Nome", "Cliente", "Fornitore", "Partita IVA", "Città", "Email", "Telefono")) +
                ana.soggetti.map { listOf(it.id, it.nome, if (it.cliente) "sì" else "no", if (it.fornitore) "sì" else "no", it.partitaIva, it.citta, it.email, it.telefono) }
            "commesse" -> listOf(listOf("Codice", "Commessa", "Cliente", "Stato", "Ore previste")) +
                ana.commesse.filter { !it.modello }.map { listOf(it.id, it.descrizione, ana.cliente(it.idCliente)?.nome.orEmpty(), it.etichettaStato, Numeri.scrivi(it.budgetOre)) }
            else -> listOf(listOf("Quando", "Chi", "Cosa", "Su cosa")) + registroEsempio.map { listOf(it.quando, it.chi, it.frase, it.oggetto + if (it.coda.isNotBlank()) " " + it.coda else "") }
        }
        val testo = "﻿" + righe.joinToString("\r\n") { r -> r.joinToString(";") { "\"" + it.replace("\"", "\"\"") + "\"" } }
        return runCatching {
            dir.mkdirs()
            File(dir, "Wisper-$cosa-esempio.csv").apply { writeText(testo) }
        }
    }

    override suspend fun cambiaPassword(vecchia: String, nuova: String): Result<Unit> =
        if (nuova.length < 8) errore("La password nuova deve avere almeno 8 caratteri") else Result.success(Unit)

    override suspend fun esci(): Result<Unit> = errore("Nella visita non si esce: tocca Salta la visita")

    override suspend fun ripristinaRapportino(idLocale: String): Result<Rapportino> = errore("Nella visita i rapportini annullati non si recuperano")

    private fun <T> errore(messaggio: String): Result<T> = Result.failure(Exception(messaggio))

    init {
        aggiornaDashboard()
    }

    private companion object {
        val ISO_ORA: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
    }
}

/** Il nome di un modulo come lo dice il menu, per i permessi. */
internal fun nomeModulo(modulo: String): String = when (modulo) {
    Moduli.DASHBOARD -> "Dashboard"
    Moduli.CLIENTI -> "Clienti e fornitori"
    Moduli.COMMESSE -> "Progetti e commesse"
    Moduli.RAPPORTINI -> "Ore e rapportini"
    Moduli.FATTURAZIONE -> "Fatturazione"
    Moduli.AMMINISTRAZIONE -> "Amministrazione"
    Moduli.COSTI -> "Soldi"
    else -> modulo
}
