package eu.stgm.wisper.rapportino

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import java.io.File
import java.util.UUID
import kotlin.math.max

/**
 * Foto degli scontrini e firme, pronte per partire.
 *
 * Una foto del telefono pesa 4-8 MB: mandarla cosi' com'e' allo script vuol dire
 * minuti di caricamento con mezza tacca di segnale, e lo scontrino si legge
 * benissimo anche a 1600 pixel. Si riduce sul telefono, una volta sola.
 */
object Immagini {

    private const val LATO_MASSIMO = 1600

    fun cartellaFoto(ctx: Context) = File(ctx.filesDir, "foto").apply { mkdirs() }
    fun cartellaFirme(ctx: Context) = File(ctx.filesDir, "firme").apply { mkdirs() }

    /** Dove la fotocamera scrive lo scatto, prima di ridurlo. */
    fun fileScatto(ctx: Context): File =
        File(File(ctx.filesDir, "scatti").apply { mkdirs() }, "scatto-${UUID.randomUUID()}.jpg")

    /** La copia locale di una foto gia' arrivata sul foglio, se c'e'. */
    fun fotoLocale(ctx: Context, idRemoto: String): File? =
        File(cartellaFoto(ctx), "$idRemoto.jpg").takeIf { it.exists() }

    /**
     * Riduce e raddrizza una foto (dalla fotocamera o dalla galleria) e la
     * salva fra quelle in attesa. Torna l'id del file e il file pronto.
     */
    fun preparaFoto(ctx: Context, sorgente: Uri): Pair<String, File> {
        val limiti = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(sorgente)?.use { BitmapFactory.decodeStream(it, null, limiti) }
        val lato = max(limiti.outWidth, limiti.outHeight)
        if (lato <= 0) throw IllegalArgumentException("Non riesco a leggere la foto")
        var campione = 1
        while (lato / (campione * 2) >= LATO_MASSIMO) campione *= 2

        val bitmap = ctx.contentResolver.openInputStream(sorgente)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = campione })
        } ?: throw IllegalArgumentException("Non riesco a leggere la foto")

        // Le foto fatte col telefono in verticale arrivano coricate, con
        // l'orientamento scritto a parte: se non lo si applica, lo scontrino
        // sul PDF e' di traverso.
        val gradi = ctx.contentResolver.openInputStream(sorgente)?.use {
            when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        } ?: 0f

        val scala = LATO_MASSIMO.toFloat() / max(bitmap.width, bitmap.height)
        val m = Matrix().apply {
            if (scala < 1f) postScale(scala, scala)
            if (gradi != 0f) postRotate(gradi)
        }
        val pronta = if (m.isIdentity) bitmap else Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)

        val idFile = UUID.randomUUID().toString().replace("-", "").take(12)
        val destinazione = File(cartellaFoto(ctx), "$idFile.jpg")
        destinazione.outputStream().use { pronta.compress(Bitmap.CompressFormat.JPEG, 82, it) }
        if (pronta !== bitmap) pronta.recycle()
        bitmap.recycle()
        return idFile to destinazione
    }

    /** Salva la firma disegnata. Torna l'id del file e il file. */
    fun salvaFirma(ctx: Context, firma: Bitmap): Pair<String, File> {
        val idFile = UUID.randomUUID().toString().replace("-", "").take(12)
        val destinazione = File(cartellaFirme(ctx), "$idFile.png")
        destinazione.outputStream().use { firma.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return idFile to destinazione
    }

    /** Una miniatura leggera per l'elenco delle foto. */
    fun miniatura(file: File, lato: Int = 240): Bitmap? = runCatching {
        val limiti = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, limiti)
        var campione = 1
        while (max(limiti.outWidth, limiti.outHeight) / (campione * 2) >= lato) campione *= 2
        BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = campione })
    }.getOrNull()
}
