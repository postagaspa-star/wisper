package eu.stgm.wisper

import android.graphics.Bitmap
import android.net.Uri
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Attivita
import eu.stgm.wisper.rapportino.Preventivo
import eu.stgm.wisper.rapportino.VoceListino
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.CodaInvii
import eu.stgm.wisper.rapportino.Commessa
import eu.stgm.wisper.rapportino.Dashboard
import eu.stgm.wisper.rapportino.DatiPartitaIva
import eu.stgm.wisper.rapportino.Dispositivo
import eu.stgm.wisper.rapportino.Documento
import eu.stgm.wisper.rapportino.DocumentiCommessa
import eu.stgm.wisper.rapportino.FileCestino
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.FiltroRegistro
import eu.stgm.wisper.rapportino.Numerazione
import eu.stgm.wisper.rapportino.PaginaRegistro
import eu.stgm.wisper.rapportino.Permessi
import eu.stgm.wisper.rapportino.Prestazione
import eu.stgm.wisper.rapportino.Referente
import eu.stgm.wisper.rapportino.Sede
import eu.stgm.wisper.rapportino.Sessione
import eu.stgm.wisper.rapportino.StatoCopie
import eu.stgm.wisper.rapportino.Utente
import eu.stgm.wisper.rapportino.UtenteSalvato
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Salvataggio
import eu.stgm.wisper.rapportino.Stato
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.YearMonth

/**
 * Quello che le schermate sanno chiedere. Due realizzazioni: [Archivio], i dati
 * veri del foglio, e [DatiEsempio], i dati finti della visita guidata. Le
 * schermate non sanno quale stanno usando: la visita gira sull'app vera, non
 * su una sua imitazione.
 *
 * Due modi di cambiare le cose:
 *  - quelle del lavoro di campo e gli stati dei rapportini passano dalla coda
 *    ([salva], [firma], [cambiaStato]...): si vedono subito e partono quando c'e'
 *    rete;
 *  - quelle dell'ufficio (clienti, commesse, impostazioni, documenti, email) si
 *    fanno in diretta e tornano un [Result]: con la rete, e con un esito da
 *    mostrare. In caso di errore il messaggio dell'eccezione e' gia' in italiano,
 *    da mostrare cosi' com'e' (cosa e' successo e cosa fare).
 */
interface Dati {
    val viste: StateFlow<List<Vista>>
    val anagrafiche: StateFlow<Anagrafiche>
    val operazioni: StateFlow<List<CodaInvii.Operazione>>
    val aggiornamento: StateFlow<Archivio.Aggiornamento>
    val tecnico: String

    /** Vero durante la visita guidata: niente foglio, niente coda, niente file. */
    val esempio: Boolean

    fun aggiorna(mese: YearMonth? = null)
    fun tariffaProposta(cliente: Cliente?, nomeCliente: String): Double?
    fun salva(r: Rapportino)
    fun accodaFoto(idLocale: String, file: File)
    suspend fun preparaFoto(sorgente: Uri): File
    fun togliFoto(idLocale: String, remota: FileRemoto?, locale: File?)
    suspend fun firma(idLocale: String, disegno: Bitmap, firmatario: String)
    fun riportaInBozza(idLocale: String)
    fun elimina(idLocale: String)
    fun riprova(idOp: String)
    fun scarta(idOp: String)

    // ------------------------------------------------------------- l'ufficio (0.4.0)

    /**
     * TUTTI i rapportini del foglio, non solo gli ultimi mesi, con sopra la coda
     * come [viste]. Per il cruscotto delle commesse e per "restano da fatturare
     * dei mesi prima". Finche' non li si e' letti tutti almeno una volta
     * ([aggiornaStorico]) contiene almeno quelli di [viste].
     */
    val storico: StateFlow<List<Vista>>

    /** Rilegge clienti, commesse e TUTTI i rapportini (piu' lento di [aggiorna]). L'esito va in [aggiornamento]. */
    fun aggiornaStorico()

    /**
     * Cambia lo stato di tanti rapportini insieme. Passa dalla coda come il resto,
     * quindi funziona anche senza rete. Le regole sono quelle del computer, e un
     * passo indietro per errore non c'e':
     *  - INVIATO salta i fatturati (e quelli gia' inviati);
     *  - FATTURATO vale da qualunque stato (salta quelli gia' fatturati);
     *  - BOZZA e' "Riporta in bozza": la firma cade (come [riportaInBozza]);
     *  - ANNULLATO e' [elimina]; FIRMATO non si puo' (serve la firma) e non fa niente.
     * Torna cosa e' cambiato davvero, per l'avviso ("3 rapportini segnati
     * fatturati") e per [annullaCambioStato].
     */
    fun cambiaStato(idLocali: List<String>, stato: Stato): CambioStato

    /**
     * L'Annulla dell'avviso: riporta i rapportini allo stato di prima, dove si
     * puo'. Se il cambio non era ancora partito si toglie dalla coda e basta;
     * se e' gia' sul foglio si rimanda indietro (da fatturato a inviato o a bozza,
     * da inviato a bozza se era una bozza). Un rapportino che era FIRMATO e ora e'
     * gia' inviato o fatturato sul foglio non si puo' riportare a firmato: lo
     * script non lo permette. Torna quanti sono tornati com'erano.
     */
    fun annullaCambioStato(cambio: CambioStato): Int

    /**
     * Crea ([nuovo]) o aggiorna un cliente. Uno nuovo che c'era gia' (stesso nome
     * o altro nome) non si crea due volte: torna quello, con giaEsisteva = true
     * ("C'era già: Rossi"). Dopo, le anagrafiche si rileggono.
     */
    suspend fun salvaCliente(cliente: Cliente, nuovo: Boolean): Result<Salvataggio<Cliente>>

    /**
     * Crea ([nuova]) o aggiorna una commessa, stato compreso. Una nuova con il
     * codice vuoto (o col codice proposto, il prossimo libero) lo prende dallo
     * script; con un codice scritto a mano gia' usato il foglio rifiuta. Se il
     * cliente ha gia' una commessa con lo stesso nome torna quella, con
     * giaEsisteva = true. Dopo, le anagrafiche si rileggono.
     */
    suspend fun salvaCommessa(commessa: Commessa, nuova: Boolean): Result<Salvataggio<Commessa>>

    /**
     * Scrive le impostazioni date (CHIAVE -> valore, vedi le chiavi in
     * Anagrafiche.Companion). EURO_KM e COSTO_ORARIO si scrivono alla italiana
     * ("0,76") e partono come numero. Torna tutte le impostazioni del foglio.
     */
    suspend fun salvaImpostazioni(valori: Map<String, String>): Result<Map<String, String>>

    /** La cartella su Drive della commessa e i suoi documenti, piu' recenti prima. */
    suspend fun documenti(idCommessa: String): Result<DocumentiCommessa>

    /** Carica nella cartella della commessa un file scelto dal telefono (al massimo 20 MB). */
    suspend fun caricaDocumento(idCommessa: String, uri: Uri): Result<Documento>

    /** La firma del compilatore (PNG), che si mette da sola su ogni rapportino. Dopo, le anagrafiche si rileggono. */
    suspend fun caricaFirmaTecnico(png: ByteArray): Result<FileRemoto>

    /**
     * La foto o la scansione del rapportino firmato a mano: vale come firma, e il
     * rapportino diventa FIRMATO (uno gia' inviato o fatturato resta com'e').
     * Serve che il rapportino sia gia' sul foglio e non abbia gia' una firma.
     */
    suspend fun caricaFoglioFirmato(idLocale: String, uri: Uri, firmatario: String): Result<Rapportino>

    /**
     * Manda l'email col [pdf] allegato e segna inviati i rapportini [idLocali]
     * (i fatturati restano fatturati). Prima fa partire le modifiche in coda di
     * quei rapportini: l'email deve partire dopo. Con [aMe] la manda solo alla
     * casella del foglio, come prova, e non segna niente.
     *
     * Non si ripete mai da sola: due tentativi sarebbero due email. Se la
     * risposta non arriva, il messaggio dice di guardare la posta inviata prima
     * di riprovare. Torna i rapportini segnati (gia' aggiornati in [viste] e [storico]).
     */
    suspend fun inviaEmail(
        a: String,
        cc: String,
        oggetto: String,
        messaggio: String,
        pdf: File?,
        idLocali: List<String>,
        aMe: Boolean = false,
    ): Result<List<Rapportino>>

    /**
     * Un file del foglio per i PDF (firme, scontrini, la firma del compilatore):
     * i byte e il tipo ("image/png"). Prima le copie sul telefono (anche foto e
     * firme ancora in coda), poi il foglio, una volta sola.
     *
     * Null SOLO quando il file non c'e' davvero (il foglio dice che non lo trova,
     * o l'id e' vuoto): il PDF si fa senza, come sul computer. Senza rete, o con un
     * altro errore, LANCIA un'eccezione col messaggio in italiano: un rapportino
     * firmato non deve mai partire col riquadro della firma vuoto.
     */
    suspend fun file(id: String): Pair<ByteArray, String>?

    /**
     * I rapportini [idLocali] e le anagrafiche nella forma esatta dello script
     * (quella che leggono rapportino() e riepilogo() di pc/ui/documenti.js), con
     * le modifiche ancora in coda. Gli id che non si trovano si saltano.
     */
    fun perStampa(idLocali: List<String>): DatiStampa

    // ------------------------------------------------------------- il gestionale (fase 1)

    /**
     * Chi e' entrato e cosa puo' fare. Le schermate nascondono voci e pulsanti
     * secondo [Sessione.permessi]; la garanzia la da' il server.
     */
    val sessione: StateFlow<Sessione>

    /** La pagina iniziale: l'ultima letta (resta anche senza rete). Null finche' non c'e'. */
    val dashboard: StateFlow<Dashboard?>

    /** Rilegge la dashboard (la mette in [dashboard]); un errore va in [aggiornamento]. */
    fun aggiornaDashboard()

    /** Rilegge le anagrafiche con gli archiviati dentro (per l'elenco degli archiviati). */
    fun aggiornaArchiviati()

    /** Archivia ([archivia] vero) o ripristina un cliente o un fornitore. */
    suspend fun archiviaSoggetto(id: String, archivia: Boolean): Result<Unit>

    /** Chiede al registro delle imprese nome e indirizzo di una partita IVA. */
    suspend fun controllaPartitaIva(partitaIva: String): Result<DatiPartitaIva>

    suspend fun salvaReferente(r: Referente): Result<Referente>
    suspend fun togliReferente(id: String): Result<Unit>
    suspend fun salvaSede(s: Sede): Result<Sede>
    suspend fun archiviaSede(id: String, archivia: Boolean): Result<Unit>

    suspend fun salvaPrestazione(p: Prestazione): Result<Prestazione>
    suspend fun togliPrestazione(id: String): Result<Unit>

    /** Le prestazioni della commessa nell'ordine dato (id). */
    suspend fun ordinaPrestazioni(idCommessa: String, ordine: List<String>): Result<Unit>

    /** Copia dati, prestazioni (avanzamento a zero) e persone in una commessa nuova, col codice nuovo. */
    suspend fun duplicaCommessa(id: String, comeModello: Boolean): Result<Commessa>
    suspend fun archiviaCommessa(id: String, archivia: Boolean): Result<Unit>

    /** Tutti gli utenti, con email, ruolo, ultimo accesso e se sono attivi. */
    suspend fun utenti(): Result<List<Utente>>

    /**
     * Crea ([Utente.id] vuoto) o cambia un utente. Con [password] non vuota la
     * password diventa quella (la iniziale, o una nuova): si mostra una volta sola.
     */
    suspend fun salvaUtente(u: Utente, password: String = ""): Result<UtenteSalvato>

    /** I dispositivi collegati di un utente. */
    suspend fun dispositivi(idUtente: String): Result<List<Dispositivo>>
    suspend fun scollega(idDispositivo: String): Result<Unit>

    /** I permessi di ogni ruolo. */
    suspend fun permessiRuoli(): Result<Map<String, Permessi>>
    suspend fun salvaPermesso(ruolo: String, modulo: String, livello: Int): Result<Unit>

    suspend fun registro(filtro: FiltroRegistro): Result<PaginaRegistro>

    suspend fun salvaNumerazione(n: Numerazione): Result<Numerazione>

    suspend fun cestino(): Result<List<FileCestino>>
    suspend fun ripristinaFile(id: String): Result<Unit>

    suspend fun copie(): Result<StatoCopie>
    suspend fun copiaAdesso(): Result<StatoCopie>

    /**
     * Un file per Excel (CSV con ;) di [cosa]: "rapportini", "clienti",
     * "fornitori", "commesse", "registro". Torna il file nella cartella dei PDF,
     * pronto per il foglio Condividi.
     */
    suspend fun esporta(cosa: String, filtro: FiltroRegistro? = null): Result<File>

    suspend fun cambiaPassword(vecchia: String, nuova: String): Result<Unit>

    /** Un rapportino annullato torna allo stato di prima (firmato solo se la firma c'è ancora). */
    suspend fun ripristinaRapportino(idLocale: String): Result<Rapportino>

    /** Esce da questo telefono: i rapportini in attesa restano e partono dopo il prossimo accesso. */
    suspend fun esci(): Result<Unit>

    // ------------------------------------------------------------- fase 2: preventivi (docs/gestionale/fase2.md)

    /** L'elenco dei preventivi con totale e stato (anche SCADUTO), l'ultimo letto: resta anche senza rete. */
    val preventivi: StateFlow<List<Preventivo>>

    /** I preventivi aperti per intero (sezioni, voci, conti, revisioni), gli ultimi letti, per id. */
    val dettagliPreventivi: StateFlow<Map<String, Preventivo>>

    /** Il listino delle prestazioni dello studio. */
    val listino: StateFlow<List<VoceListino>>

    /** Rilegge elenco dei preventivi e listino; un errore va in [aggiornamento]. */
    fun aggiornaPreventivi()

    /** Un preventivo per intero (lo mette anche in [dettagliPreventivi]). */
    suspend fun preventivo(id: String): Result<Preventivo>

    suspend fun salvaVoceListino(v: VoceListino): Result<VoceListino>
    suspend fun archiviaVoceListino(id: String): Result<Unit>

    /** Crea (id vuoto) o aggiorna una bozza: testata, sezioni, voci e scadenze in una volta. */
    suspend fun salvaPreventivo(p: Preventivo): Result<Preventivo>

    suspend fun duplicaPreventivo(id: String, comeModello: Boolean): Result<Preventivo>

    /** Una revisione nuova dello stesso numero, in bozza; la vecchia diventa SOSTITUITO. */
    suspend fun nuovaRevisione(id: String): Result<Preventivo>

    /**
     * Manda il preventivo col PDF allegato e lo segna INVIATO. Come per i
     * rapportini non si ripete mai da sola. Con [aMe] la manda solo allo studio.
     */
    suspend fun inviaPreventivo(
        id: String, a: String, cc: String, oggetto: String, messaggio: String, pdf: File?, aMe: Boolean = false, conferma: Boolean = false,
    ): Result<Preventivo>

    /** Segna INVIATO senza email. Con quello che manca per la legge il server chiede conferma (vedi PonteServer.DaConfermare). */
    suspend fun segnaInviato(id: String, conferma: Boolean = false): Result<Preventivo>

    /**
     * Il cliente ha accettato: [modo] "firma", "email", "documento" o "voce";
     * [scelte] idVoce -> scelta per facoltative e alternative; [firma] il PNG
     * della firma col dito, [documento] il foglio firmato scelto dal telefono.
     */
    suspend fun accettaPreventivo(
        id: String,
        modo: String,
        nome: String,
        scelte: Map<String, Boolean>,
        firma: ByteArray? = null,
        documento: Uri? = null,
    ): Result<Preventivo>

    suspend fun rifiutaPreventivo(id: String, motivo: String): Result<Preventivo>

    /** Da RIFIUTATO di nuovo in bozza, con una revisione nuova. */
    suspend fun riapriPreventivo(id: String): Result<Preventivo>

    /** La commessa nuova dal preventivo accettato (una volta sola): cliente, prestazioni, valori, scadenze. */
    suspend fun creaCommessaDaPreventivo(id: String): Result<Commessa>

    /** Le anagrafiche nella forma dei modelli dei PDF (pc/ui/documenti.js), per preventivo e incarico. */
    fun anagrafichePerStampa(): JSONObject

    // ------------------------------------------------------------- fase 2: attività e calendario

    /** Le attività lette (la finestra attorno a oggi e quelle senza data), l'ultima lettura. */
    val attivita: StateFlow<List<Attivita>>

    /** Rilegge le attività; con [da] e [a] allarga la finestra (il calendario che sfoglia). */
    fun aggiornaAttivita(da: LocalDate? = null, a: LocalDate? = null)

    /**
     * Crea o cambia; per una ricorrente [perRicorrenza] è "questa", "future" o
     * "tutte"; [conRicorrenza] manda la regola (nuova o cambiata); [conferma]
     * salva anche un appuntamento che si accavalla (il server lo chiede prima).
     */
    suspend fun salvaAttivita(a: Attivita, perRicorrenza: String? = null, conRicorrenza: Boolean = true, conferma: Boolean = false): Result<Attivita>

    /** Fatta o di nuovo da fare: si vede subito, e se il server dice di no torna com'era. */
    suspend fun faiAttivita(id: String, fatta: Boolean): Result<Attivita>

    /** Annulla l'attività (non si cancella: resta nel registro). */
    suspend fun togliAttivita(id: String, perRicorrenza: String? = null): Result<Unit>

    suspend fun spuntaChecklist(idAttivita: String, idVoce: String, fatta: Boolean): Result<Attivita>

    /** Allega un file scelto dal telefono (al massimo 10 MB). */
    suspend fun caricaAllegatoAttivita(idAttivita: String, uri: Uri): Result<Attivita>

    /** Toglie un allegato (va nel cestino). */
    suspend fun togliAllegatoAttivita(idAttivita: String, idFile: String): Result<Attivita>
}

/**
 * Quello che cambiaStato() ha fatto: lo stato di prima di ogni rapportino
 * cambiato. [quanti] e' il numero da dire nell'avviso.
 */
data class CambioStato(
    val stato: Stato,
    val prima: Map<String, Stato> = emptyMap(),
    /** Le operazioni messe in coda, per toglierle con Annulla se non sono ancora partite. */
    val operazioni: Map<String, String> = emptyMap(),
) {
    val quanti: Int get() = prima.size
}

/**
 * I dati di un PDF, nella forma dello script: [rapportini] come li da' l'azione
 * "rapportini", [anagrafiche] come "anagrafiche" ({clienti, commesse, gruppi,
 * impostazioni}). [intestatario] ({nome, righe, email, mostraCliente}) e [periodo]
 * ("Luglio 2026") sono quelli del riepilogo, come li sceglie il computer.
 */
class DatiStampa(
    val rapportini: List<JSONObject>,
    val anagrafiche: JSONObject,
    val intestatario: JSONObject,
    val periodo: String,
) {
    fun rapportiniJson(): JSONArray = JSONArray().apply { rapportini.forEach { put(it) } }
}

/** I rapportini col loro conto, anche quelli cambiati qui e non ancora partiti: per [eu.stgm.wisper.rapportino.Conti]. */
fun List<Vista>.conConti(): List<Rapportino> = map { v -> if (v.rapportino.conto === v.conto) v.rapportino else v.rapportino.copy(conto = v.conto) }
