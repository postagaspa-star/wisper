package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.temporal.ChronoUnit

/**
 * Quello che serve alle prove del telefono contro il server di prova vero (ServerDiProva*Test).
 *
 * Si lanciano in un modo solo, dalla cartella del progetto:
 *
 *     node server/prove/telefono.js              (un giro su un server nuovo)
 *     node server/prove/telefono.js --giri 2     (due giri di fila sullo stesso server)
 *
 * Lo script accende un server di prova nuovo (database in memoria coi dati di esempio, porta libera) con
 * l'orologio fermo al giorno dei prototipi, giovedì 22/10/2026 (WISPER_OGGI_PROVA, come le prove del server
 * delle fasi 4 e 5), il finto Google con la porta, poi lancia `./gradlew :app:testDebugUnitTest --rerun` con
 * WISPER_SERVER_PROVA e WISPER_GOOGLE_PROVA e alla fine spegne tutto. Gli altri argomenti vanno a gradle
 * (`--tests '*Fase4*'`). Senza le variabili (il solito `./gradlew :app:testDebugUnitTest`) queste prove si saltano.
 * `--rerun` serve: senza, gradle vede la prova "già fatta" e il secondo giro non gira davvero.
 *
 * Le regole di queste prove:
 *  - ognuna crea quello che le serve (fatture, preventivi, numeri fiscali nuovi, un giorno libero) o rimette
 *    com'era quello che cambia: non dipendono dall'ordine né da cosa hanno fatto le altre, e passano anche due
 *    volte di fila sullo stesso server;
 *  - le date sono quelle del server ([oggi], [adesso]), mai quelle del telefono: l'orologio del server di prova
 *    è fermo a un altro giorno.
 */
object ServerDiProva {
    val indirizzo: String = System.getenv("WISPER_SERVER_PROVA").orEmpty()
    val google: String = System.getenv("WISPER_GOOGLE_PROVA").orEmpty()

    private val chi = mapOf("disp" to "prova-giorno", "dispNome" to "prove unitarie", "app" to "telefono prove")

    /** Oggi per il server (la Dashboard lo dice a tutti), letto una volta per giro. */
    val oggi: LocalDate by lazy {
        runBlocking {
            val token = PonteServer({ indirizzo }, { "" }, { chi }).accedi("manuel@esempio.it", "prova").token
            val p = PonteServer({ indirizzo }, { token }, { chi })
            LocalDate.parse(p.dashboard().getString("oggi").take(10)).also { p.esci() }
        }
    }

    /** Adesso per il server: il suo giorno con l'ora vera (l'orologio di prova sposta i giorni, non le ore). */
    fun adesso(): LocalDateTime = LocalDateTime.of(oggi, LocalTime.now().withNano(0))

    /** I giorni di [FiltroRegistro] per avere il registro da oggi del server: il telefono li conta dal suo giorno. */
    fun giorniDiRegistro(): Int = maxOf(1, ChronoUnit.DAYS.between(oggi, LocalDate.now()).toInt() + 1)
}
