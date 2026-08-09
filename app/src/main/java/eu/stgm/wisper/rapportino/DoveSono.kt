package eu.stgm.wisper.rapportino

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Locale

/**
 * Capisce in quale cantiere si trova il tecnico, confrontando dove si trova il
 * telefono con gli indirizzi delle commesse aperte.
 *
 * Perche' serve: il tecnico apre Wisper stando gia' sul posto. Fargli dire
 * cliente e commessa quando il telefono sa gia' dove si trova e' fargli
 * ripetere una cosa ovvia, ed e' esattamente il tipo di attrito per cui i
 * rapportini si compilano male.
 *
 * Come e' fatto, e perche' cosi':
 *  - si usa l'ULTIMA posizione nota, non un aggancio GPS nuovo. Aspettare un
 *    fix fresco vuol dire tenere il tecnico in attesa per decine di secondi,
 *    e in un capannone non arriva mai. L'ultima nota e' istantanea e in un
 *    cantiere dove sei stato tutto il giorno e' precisa a sufficienza.
 *  - gli indirizzi delle commesse si convertono in coordinate una volta sola
 *    e si tengono in memoria: sono pochi e non cambiano durante la giornata.
 *  - se non si trova niente entro [RAGGIO_METRI], si risponde null e Wisper
 *    chiede come ha sempre fatto. Non indovina mai.
 */
class DoveSono(private val ctx: Context) {

    /** Coordinate gia' risolte, per non richiedere due volte lo stesso posto. */
    private val coordinate = mutableMapOf<String, Pair<Double, Double>?>()

    /**
     * Perche' l'ultimo tentativo e' andato come e' andato, in una riga.
     *
     * Serve perche' quando questa cosa non funziona non si vede niente: Wisper
     * apre col saluto generico e sembra che la posizione non sia prevista. Una
     * mattina intera persa a indovinare quale dei cinque passaggi mancasse.
     */
    var motivo: String = "mai provato"
        private set

    val permesso: Boolean
        get() = ContextCompat.checkSelfPermission(
            ctx, Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                ctx, Manifest.permission.ACCESS_FINE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED

    /**
     * La commessa aperta piu' vicina a dove ti trovi, se ce n'e' una abbastanza
     * vicina da non essere una coincidenza.
     *
     * @return la commessa e quante altre ne ha aperte lo stesso cliente li'
     *         vicino. Se sono piu' d'una, Wisper deve chiedere quale.
     */
    suspend fun commessaQui(anagrafiche: Anagrafiche): Vicinanza? =
        withContext(Dispatchers.IO) {
            if (!permesso) {
                motivo = "permesso posizione negato"
                return@withContext null
            }
            val qui = ultimaPosizione()
            if (qui == null) {
                motivo = "il telefono non ha nessuna posizione nota"
                return@withContext null
            }

            val aperte = anagrafiche.commesse.filter { it.aperta && it.indirizzo.isNotBlank() }
            if (aperte.isEmpty()) {
                motivo = "nessuna commessa aperta con un indirizzo " +
                    "(ne conosco ${anagrafiche.commesse.size} in tutto)"
                return@withContext null
            }

            val misurate = aperte.map { m ->
                val punto = coordinateDi(m.indirizzo)
                if (punto == null) {
                    m to -1f
                } else {
                    val d = FloatArray(1)
                    Location.distanceBetween(
                        qui.latitude, qui.longitude, punto.first, punto.second, d,
                    )
                    m to d[0]
                }
            }
            motivo = misurate.joinToString("; ") { (m, d) ->
                if (d < 0) "${m.id} indirizzo non trovato sulla mappa"
                else "${m.id} a ${d.toInt()} m"
            }

            val vicine = misurate.filter { it.second in 0f..RAGGIO_METRI }.sortedBy { it.second }

            val piuVicina = vicine.firstOrNull() ?: run {
                motivo = "nessuna entro ${RAGGIO_METRI.toInt()} m — $motivo"
                return@withContext null
            }
            val cliente = anagrafiche.clienti
                .firstOrNull { it.id == piuVicina.first.idCliente }
            if (cliente == null) {
                motivo = "la commessa ${piuVicina.first.id} punta a un cliente che non esiste"
                return@withContext null
            }

            // Quante altre commesse aperte ha QUESTO cliente qui intorno: se
            // ce n'e' una sola si puo' proporla, se ce ne sono due va chiesto.
            val altreQui = vicine.count { it.first.idCliente == cliente.id }
            motivo = "sei da ${cliente.nome}, ${piuVicina.first.descrizione} " +
                "a ${piuVicina.second.toInt()} m"

            Vicinanza(
                cliente = cliente,
                commessa = piuVicina.first,
                metri = piuVicina.second.toInt(),
                soloQuesta = altreQui == 1,
            )
        }

    /** Ultima posizione nota, presa dal fornitore che ce l'ha piu' fresca. */
    private fun ultimaPosizione(): Location? = try {
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        lm.getProviders(true)
            .mapNotNull { @Suppress("MissingPermission") lm.getLastKnownLocation(it) }
            .maxByOrNull { it.time }
    } catch (_: SecurityException) {
        null
    } catch (_: Exception) {
        null
    }

    /** Da "Via Roma 47, 36016 Thiene (VI)" a latitudine e longitudine. */
    private fun coordinateDi(indirizzo: String): Pair<Double, Double>? =
        coordinate.getOrPut(indirizzo) {
            try {
                @Suppress("DEPRECATION")
                Geocoder(ctx, Locale.ITALY).getFromLocationName(indirizzo, 1)
                    ?.firstOrNull()
                    ?.let { it.latitude to it.longitude }
            } catch (_: Exception) {
                null
            }
        }

    private companion object {
        /**
         * Quanto vicino deve essere un cantiere per considerarlo "sei qui".
         * Trecento metri: abbastanza da coprire un capannone e il parcheggio,
         * poco da non prendere il cantiere di un altro cliente in fondo alla
         * stessa via.
         */
        const val RAGGIO_METRI = 300f
    }
}

/** Il cantiere in cui il telefono dice che ti trovi. */
data class Vicinanza(
    val cliente: Cliente,
    val commessa: Commessa,
    val metri: Int,
    /** Vero se qui il cliente ha una sola commessa aperta: si puo' proporla. */
    val soloQuesta: Boolean,
)
