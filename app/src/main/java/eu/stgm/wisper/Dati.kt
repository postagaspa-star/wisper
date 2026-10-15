package eu.stgm.wisper

import android.graphics.Bitmap
import android.net.Uri
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.CodaInvii
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.Rapportino
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.time.YearMonth

/**
 * Quello che le schermate sanno chiedere. Due realizzazioni: [Archivio], i dati
 * veri del foglio, e [DatiEsempio], i dati finti della visita guidata. Le
 * schermate non sanno quale stanno usando: la visita gira sull'app vera, non
 * su una sua imitazione.
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
}
