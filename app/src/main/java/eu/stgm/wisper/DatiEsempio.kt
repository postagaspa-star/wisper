package eu.stgm.wisper

import android.graphics.Bitmap
import android.net.Uri
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Calcolo
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.CodaInvii
import eu.stgm.wisper.rapportino.Commessa
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Stato
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth

/**
 * I dati della visita guidata: tre clienti, tre commesse e qualche rapportino
 * attorno a oggi, tutto in memoria. Niente foglio, niente coda, niente file:
 * finita la visita sparisce tutto, e l'app torna ai dati veri.
 */
class DatiEsempio(oggi: LocalDate = LocalDate.now()) : Dati {

    private val ana = Anagrafiche(
        clienti = listOf(
            Cliente("C001", "Elettrodinamica", tariffaFissa = 30.0, pagaViaggio = false, kmRimborsati = true),
            Cliente("C002", "Rossi Impianti Srl", ultimaTariffa = 42.0),
            Cliente("C003", "Bianchi Termoidraulica", ultimaTariffa = 38.0),
        ),
        commesse = listOf(
            Commessa("26ST001", "C001", "Nuovo magazzino automatico Batokyo", "APERTA", "Zona industriale, Schio"),
            Commessa("26ST002", "C002", "Quadro elettrico capannone", "APERTA"),
            Commessa("26ST003", "C003", "Caldaia via Roma", "APERTA"),
        ),
        impostazioni = mapOf("EURO_KM" to "0.76", "TECNICO" to "Manuel Gasparotto", "AUTO" to "Volvo XC40"),
    )

    // Prima dei rapportini, che lo usano mentre si creano.
    override val tecnico: String = "Manuel Gasparotto"

    private val _viste = MutableStateFlow(iniziali(oggi))
    override val viste: StateFlow<List<Vista>> = _viste.asStateFlow()
    override val anagrafiche: StateFlow<Anagrafiche> = MutableStateFlow(ana).asStateFlow()
    override val operazioni: StateFlow<List<CodaInvii.Operazione>> = MutableStateFlow(emptyList<CodaInvii.Operazione>()).asStateFlow()
    override val aggiornamento: StateFlow<Archivio.Aggiornamento> =
        MutableStateFlow(Archivio.Aggiornamento(ultimo = LocalDateTime.now())).asStateFlow()
    override val esempio: Boolean = true

    private fun conConto(r: Rapportino): Vista =
        Vista(r.copy(conto = Calcolo.calcola(r, ana.regoleDi(ana.cliente(r.idCliente, r.cliente), ana.commessa(r.idCommessa)))))

    /**
     * Ogni giorno lavorativo passato della settimana ha il suo rapportino, tranne
     * l'ultimo: così nella settimana si vede un giorno che manca, come capita
     * davvero. In più due bozze di Rossi da far firmare.
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
                stato = Stato.INVIATO,
            )
        }
        val bozze = listOf(
            Rapportino(
                idLocale = "esempio-b1", data = lunedi.minusDays(5), tecnico = tecnico, idCliente = "C002",
                cliente = "Rossi Impianti Srl", idCommessa = "26ST002",
                commessa = "Quadro elettrico capannone", descrizione = "Sostituzione interruttore generale",
                oreLavoro = 3.5, km = 22.0, tariffa = 42.0, id = "RAP/2026/0004",
            ),
            Rapportino(
                idLocale = "esempio-b2", data = lunedi.minusDays(3), tecnico = tecnico, idCliente = "C002",
                cliente = "Rossi Impianti Srl", idCommessa = "26ST002",
                commessa = "Quadro elettrico capannone", descrizione = "Verifica impianto di terra",
                oreLavoro = 2.5, oreViaggio = 1.0, km = 30.0, tariffa = 42.0, id = "RAP/2026/0005",
            ),
        )
        return (settimana + bozze).map(::conConto).sortedByDescending { it.rapportino.data }
    }

    private fun cambia(idLocale: String, f: (Rapportino) -> Rapportino) {
        _viste.value = _viste.value.map { if (it.rapportino.idLocale == idLocale) conConto(f(it.rapportino)) else it }
    }

    override fun aggiorna(mese: YearMonth?) = Unit

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
        cambia(idLocale) { it.copy(stato = Stato.BOZZA, firma = null, firmatario = "", firmatoIl = "") }
    }

    override fun elimina(idLocale: String) {
        _viste.value = _viste.value.filterNot { it.rapportino.idLocale == idLocale }
    }

    override fun riprova(idOp: String) = Unit
    override fun scarta(idOp: String) = Unit
}
