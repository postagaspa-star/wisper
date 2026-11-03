package eu.stgm.wisper

import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Anomalia
import eu.stgm.wisper.rapportino.Collegamento
import eu.stgm.wisper.rapportino.ContiOreSpese
import eu.stgm.wisper.rapportino.DaApprovare
import eu.stgm.wisper.rapportino.Destinazione
import eu.stgm.wisper.rapportino.ElencoOre
import eu.stgm.wisper.rapportino.ElencoSpese
import eu.stgm.wisper.rapportino.ElencoTrasferte
import eu.stgm.wisper.rapportino.ElencoVeicoli
import eu.stgm.wisper.rapportino.EsitoApprovazione
import eu.stgm.wisper.rapportino.FileRemoto
import eu.stgm.wisper.rapportino.FilaOreSpese
import eu.stgm.wisper.rapportino.GiornoOre
import eu.stgm.wisper.rapportino.CategoriaSpesa
import eu.stgm.wisper.rapportino.PersonaDaApprovare
import eu.stgm.wisper.rapportino.RigaOre
import eu.stgm.wisper.rapportino.RigaRiepilogoSpese
import eu.stgm.wisper.rapportino.RigaStatisticaOre
import eu.stgm.wisper.rapportino.StatisticheOre
import eu.stgm.wisper.rapportino.RiepilogoSpese
import eu.stgm.wisper.rapportino.Rimborsi
import eu.stgm.wisper.rapportino.Spesa
import eu.stgm.wisper.rapportino.StatoVoce
import eu.stgm.wisper.rapportino.TimerAcceso
import eu.stgm.wisper.rapportino.TimerFermato
import eu.stgm.wisper.rapportino.TimerLetto
import eu.stgm.wisper.rapportino.TotaliOre
import eu.stgm.wisper.rapportino.TotaliTrasferte
import eu.stgm.wisper.rapportino.Trasferta
import eu.stgm.wisper.rapportino.Veicolo
import eu.stgm.wisper.rapportino.VoceDaApprovare
import eu.stgm.wisper.rapportino.VoceDashboard
import eu.stgm.wisper.rapportino.VoceRimborso
import kotlinx.coroutines.flow.MutableStateFlow
import java.io.File
import java.time.DayOfWeek
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * La fase 3 della visita guidata (ore, timer, approvazioni, spese, trasferte,
 * rimborsi, veicoli) con i dati del prototipo docs/prototipo/Gestionale-fase3.html,
 * in memoria e con le regole del server (§14): DatiEsempio la usa per le schermate
 * vere. Chi è entrato è Manuel (titolare, id 1); Marco Rossato (id 3) è il collaboratore.
 */
internal class EsempioFase3(private val oggi: LocalDate, private val ana: () -> Anagrafiche, private val oreRapportini: (LocalDate) -> Double) {
    private val io = "1"
    private val ioNome = "Manuel Gasparotto"
    private val lunedi = oggi.with(DayOfWeek.MONDAY)
    /** Il terzo giorno delle righe: oggi, o il giovedì se oggi è sabato o domenica. */
    private val giorno3 = if (oggi.dayOfWeek.value <= 5) oggi else lunedi.plusDays(3)
    private val mese = YearMonth.from(oggi)
    private fun nelMese(giorniFa: Long): LocalDate = oggi.minusDays(giorniFa).let { if (it.isBefore(mese.atDay(1))) mese.atDay(1) else it }
    private var prossimo = 100
    private fun nuovoId() = (prossimo++).toString()
    private fun adesso() = LocalDateTime.now().withNano(0).toString()

    private fun ore(id: String, data: LocalDate, idCommessa: String, descrizione: String, ore: Double, fatturabile: Boolean, stato: String) =
        RigaOre(
            id = id, idUtente = io, utente = ioNome, data = data, ore = ore, idCommessa = idCommessa,
            commessa = ana().commessa(idCommessa)?.descrizione.orEmpty(), descrizione = descrizione, fatturabile = fatturabile, stato = stato,
            puoScrivere = true, creato = adesso(),
        )

    private val righe = mutableListOf(
        ore("1", lunedi, "26ST044", "Progetto esecutivo: schema unifilare", 6.0, true, StatoVoce.APPROVATA),
        ore("2", lunedi, "", "Aggiornamento normativa CEI", 1.5, false, StatoVoce.APPROVATA),
        ore("3", lunedi.plusDays(1), "26ST045", "Collaudo quadro: preparazione verbali", 4.0, true, StatoVoce.BOZZA),
        ore("4", giorno3, "26ST044", "Riunione cantiere Batokyo", 1.5, true, StatoVoce.BOZZA).copy(inizio = "08:30", fine = "10:00"),
    )

    private fun spesa(id: String, utente: String, data: LocalDate, importo: Double, categoria: String, descrizione: String, idCommessa: String, dest: String, mia: Boolean, stato: String, foto: Boolean = true): Spesa {
        val m = ana().commessa(idCommessa)
        return Spesa(
            id = id, idUtente = utente, utente = if (utente == io) ioNome else "Marco Rossato", data = data, importo = importo, categoria = categoria,
            descrizione = descrizione, idCommessa = idCommessa, commessa = m?.descrizione.orEmpty(), idCliente = m?.idCliente.orEmpty(),
            cliente = m?.idCliente?.let { ana().cliente(it)?.nome }.orEmpty(), destinazione = dest, pagataDaMe = mia, stato = stato,
            foto = if (foto) listOf(FileRemoto("esempio-scontrino-$id", "")) else emptyList(), puoScrivere = utente == io || stato != StatoVoce.APPROVATA, creato = adesso(),
        )
    }

    private val veicoli = mutableListOf(Veicolo("1", "Volvo XC40", "gasolio", 0.76, oggi.year, true, 1))

    private val tutteSpese = mutableListOf(
        spesa("1", io, nelMese(3), 8.4, "pedaggio", "Pedaggio A4 Vicenza Ovest", "26ST044", Destinazione.CLIENTE, true, StatoVoce.APPROVATA),
        spesa("2", io, nelMese(2), 62.0, "carburante", "Gasolio", "", Destinazione.STUDIO, false, StatoVoce.APPROVATA),
        spesa("3", "3", nelMese(2), 14.5, "vitto", "Pranzo in cantiere", "26ST045", Destinazione.CLIENTE, true, StatoVoce.DA_APPROVARE),
        spesa("4", io, nelMese(0), 3.0, "parcheggio", "Parcheggio Schio centro", "26ST044", Destinazione.CLIENTE, true, StatoVoce.APPROVATA),
        spesa("5", io, nelMese(0), 21.9, "materiale", "Morsetti e fascette", "", Destinazione.STUDIO, false, StatoVoce.APPROVATA),
    )

    private val tutteTrasferte = mutableListOf(
        trasferta("1", io, nelMese(3), "Schio, cantiere Batokyo", "Riunione di cantiere", "26ST044", 60.0, true, StatoVoce.APPROVATA),
    )

    private fun trasferta(id: String, utente: String, dal: LocalDate, dest: String, motivo: String, idCommessa: String, km: Double, ar: Boolean, stato: String, idVeicolo: String = "1", indennita: Double = 0.0): Trasferta {
        val v = veicoli.firstOrNull { it.id == idVeicolo }
        val r = ContiOreSpese.rimborsoTrasferta(km, ar, v?.euroKm, indennita)
        val m = ana().commessa(idCommessa)
        return Trasferta(
            id = id, idUtente = utente, utente = if (utente == io) ioNome else "Marco Rossato", dal = dal, al = dal, destinazione = dest, motivo = motivo,
            idCommessa = idCommessa, commessa = m?.descrizione.orEmpty(), idCliente = m?.idCliente.orEmpty(), km = km, andataRitorno = ar,
            kmTotali = r.kmTotali, idVeicolo = v?.id.orEmpty(), veicolo = v?.nome.orEmpty(), euroKm = v?.euroKm, rimborsoKm = r.rimborsoKm,
            indennita = r.indennita, totale = r.totale, stato = stato, creato = adesso(),
        )
    }

    private val giornoIt = DateTimeFormatter.ofPattern("EEEE d", Locale.ITALY)

    private var approvare = DaApprovare(
        oggi = oggi, quante = 5, conAnomalie = 2,
        persone = listOf(
            PersonaDaApprovare(
                "3", "Marco Rossato", 5, 2,
                listOf(
                    VoceDaApprovare("ore", "201", "3", lunedi.plusDays(1), "Ore", "26ST046 · Calcolo cabina MT · " + lunedi.plusDays(1).format(giornoIt), 7.0, "ore"),
                    VoceDaApprovare("ore", "202", "3", lunedi.plusDays(2), "Ore", "26ST046 · Cablaggio quadri · " + lunedi.plusDays(2).format(giornoIt), 13.0, "ore", anomalie = listOf(Anomalia("troppeOre", "13 ore in un giorno"))),
                    VoceDaApprovare("spesa", "203", "3", lunedi.plusDays(1), "Spesa", "Pedaggio A4 · 26ST046 · " + lunedi.plusDays(1).format(giornoIt), 8.4, "euro"),
                    VoceDaApprovare("spesa", "204", "3", lunedi.plusDays(2), "Spesa", "Pranzo · senza commessa · " + lunedi.plusDays(2).format(giornoIt), 16.5, "euro", anomalie = listOf(Anomalia("senzaFoto", "Senza scontrino"))),
                    VoceDaApprovare("rapportino", "RAP/${oggi.year}/0142", "3", lunedi.plusDays(2), "Rapportino", "RAP/${oggi.year}/0142 · Linea 3 · " + lunedi.plusDays(2).format(giornoIt), 6.5, "ore", km = 22.0),
                ),
            ),
        ),
    )
    /** Le voci decise, per l'Annulla. */
    private val decise = mutableMapOf<String, VoceDaApprovare>()

    // ------------------------------------------------------------- flussi (li espone DatiEsempio)

    val elencoOre = MutableStateFlow<ElencoOre?>(null)
    val timer = MutableStateFlow<TimerLetto?>(TimerLetto(null, adesso(), System.currentTimeMillis()))
    val elencoSpese = MutableStateFlow<ElencoSpese?>(null)
    val elencoTrasferte = MutableStateFlow<ElencoTrasferte?>(null)
    private var periodo: Pair<LocalDate, LocalDate> = lunedi to lunedi.plusDays(6)
    private var meseSpese: YearMonth = mese

    init {
        aggiornaOre(lunedi, lunedi.plusDays(6))
        aggiornaSpese(mese)
    }

    fun aggiornaOre(da: LocalDate, a: LocalDate) {
        periodo = da to a
        val vive = righe.filter { !it.data.isBefore(da) && !it.data.isAfter(a) && it.tolta.isBlank() }
        val giorni = generateSequence(da) { it.plusDays(1) }.takeWhile { !it.isAfter(a) }
            .map { d -> GiornoOre(d, vive.filter { it.data == d && it.stato != StatoVoce.RESPINTA }.sumOf { it.ore }, oreRapportini(d)) }.toList()
        val base = ElencoOre(da, a, 8.0, vive, giorni, TotaliOre())
        elencoOre.value = FilaOreSpese.oreConCoda(base, emptyList())
    }

    fun salvaOre(r: RigaOre, bozza: Boolean) {
        val m = ana().commessa(r.idCommessa)
        val calcolate = if (r.conOrari) runCatching { ContiOreSpese.oreDaOrari(r.inizio, r.fine, r.pausaMinuti) }.getOrNull() else null
        val stato = if (bozza) StatoVoce.BOZZA else StatoVoce.APPROVATA
        val nuova = r.copy(
            id = r.id.ifBlank { nuovoId() }, idUtente = io, utente = ioNome, commessa = m?.descrizione.orEmpty(),
            ore = calcolate?.ore ?: r.ore, giornoDopo = calcolate?.giornoDopo ?: false, stato = stato, motivoRifiuto = "",
            idLocale = "", inCoda = false, puoScrivere = true, modificato = adesso(),
        )
        righe.removeAll { it.id == nuova.id }
        righe += nuova
        aggiornaOre(periodo.first, periodo.second)
    }

    fun togliOre(r: RigaOre, annulla: Boolean) {
        val i = righe.indexOfFirst { it.id == r.id }
        if (i >= 0) righe[i] = righe[i].copy(tolta = if (annulla) "" else adesso())
        else if (annulla) righe += r.copy(tolta = "")
        aggiornaOre(periodo.first, periodo.second)
    }

    fun avviaTimer(idCommessa: String, descrizione: String): Result<TimerLetto> {
        timer.value?.timer?.let { t -> return Result.failure(Exception("Il timer è già acceso dalle ${t.dalle}: fermalo prima di avviarne un altro")) }
        val m = ana().commessa(idCommessa)
        val t = TimerLetto(TimerAcceso(adesso(), m?.id.orEmpty(), m?.descrizione.orEmpty(), descrizione = descrizione, fatturabile = m != null), adesso(), System.currentTimeMillis())
        timer.value = t
        return Result.success(t)
    }

    fun fermaTimer(): Result<TimerFermato> {
        val letto = timer.value ?: return Result.failure(Exception("Il timer non è acceso"))
        val t = letto.timer ?: return Result.failure(Exception("Il timer non è acceso"))
        val partito = runCatching { LocalDateTime.parse(t.partitoIl) }.getOrDefault(LocalDateTime.now())
        val fine = LocalDateTime.now()
        val inizio = "%02d:%02d".format(partito.hour, partito.minute)
        val fineOra = "%02d:%02d".format(fine.hour, fine.minute)
        val calcolate = if (inizio != fineOra && Duration.between(partito, fine).toHours() < 24) runCatching { ContiOreSpese.oreDaOrari(inizio, fineOra, 0) }.getOrNull() else null
        val riga = RigaOre(
            id = nuovoId(), idUtente = io, utente = ioNome, data = partito.toLocalDate(), inizio = inizio, fine = if (calcolate != null) fineOra else "",
            ore = calcolate?.ore ?: 0.0, idCommessa = t.idCommessa, commessa = t.commessa, descrizione = t.descrizione,
            fatturabile = t.fatturabile, stato = StatoVoce.BOZZA, dalTimer = true, creato = adesso(),
        )
        righe += riga
        timer.value = TimerLetto(null, adesso(), System.currentTimeMillis())
        aggiornaOre(periodo.first, periodo.second)
        return Result.success(TimerFermato(riga))
    }

    fun daApprovare(): DaApprovare = approvare

    fun decidi(voci: List<VoceDaApprovare>, annulla: Boolean): EsitoApprovazione {
        if (annulla) {
            val tornano = voci.mapNotNull { decise.remove(it.chiave) }
            if (tornano.isNotEmpty()) {
                val p = approvare.persone.firstOrNull() ?: PersonaDaApprovare("3", "Marco Rossato", 0, 0, emptyList())
                val tutte = (p.voci + tornano).sortedBy { it.data }
                approvare = approvare.copy(persone = listOf(p.copy(voci = tutte, quante = tutte.size, conAnomalie = tutte.count { it.anomalie.isNotEmpty() })))
                approvare = approvare.copy(quante = approvare.persone.sumOf { it.quante }, conAnomalie = approvare.persone.sumOf { it.conAnomalie })
            }
            return EsitoApprovazione(tornano.size)
        }
        val chiavi = voci.map { it.chiave }.toSet()
        approvare.voci.filter { it.chiave in chiavi }.forEach { decise[it.chiave] = it }
        approvare = approvare.senza(chiavi)
        return EsitoApprovazione(voci.size)
    }

    // ------------------------------------------------------------- spese

    fun aggiornaSpese(m: YearMonth) {
        meseSpese = m
        val nel = tutteSpese.filter { YearMonth.from(it.data) == m && it.tolta.isBlank() }.sortedByDescending { it.data }
        elencoSpese.value = ElencoSpese(m.atDay(1), m.atEndOfMonth(), nel, ContiOreSpese.totaliSpese(nel))
        val tr = tutteTrasferte.filter { YearMonth.from(it.dal) == m && it.tolta.isBlank() }
        val vive = tr.filter { it.stato != StatoVoce.RESPINTA }
        elencoTrasferte.value = ElencoTrasferte(
            m.atDay(1), m.atEndOfMonth(), tr,
            TotaliTrasferte(
                vive.size, vive.sumOf { it.kmTotali }, vive.sumOf { it.rimborsoKm }, vive.sumOf { it.indennita }, vive.sumOf { it.totale },
                vive.filter { it.rimborsataIl.isBlank() && StatoVoce.conta(it.stato) }.sumOf { it.totale },
            ),
        )
    }

    fun salvaSpesa(s: Spesa, foto: File?) {
        val m = ana().commessa(s.idCommessa)
        val vecchia = tutteSpese.firstOrNull { it.id == s.id }
        val nuova = s.copy(
            id = s.id.ifBlank { nuovoId() }, idUtente = vecchia?.idUtente ?: io, utente = vecchia?.utente ?: ioNome,
            commessa = m?.descrizione.orEmpty(), idCliente = m?.idCliente ?: s.idCliente, cliente = m?.idCliente?.let { ana().cliente(it)?.nome }.orEmpty(),
            stato = vecchia?.stato ?: StatoVoce.APPROVATA, idLocale = "", inCoda = false, fotoInCoda = false,
            foto = (vecchia?.foto.orEmpty() + listOfNotNull(foto?.let { FileRemoto("esempio-" + it.nameWithoutExtension, "") })).distinctBy { it.id },
            anticipazione = s.destinazione == Destinazione.CLIENTE && s.anticipazione,
        )
        tutteSpese.removeAll { it.id == nuova.id }
        tutteSpese += nuova
        aggiornaSpese(meseSpese)
    }

    fun togliSpesa(s: Spesa, annulla: Boolean) {
        val i = tutteSpese.indexOfFirst { it.id == s.id }
        if (i >= 0) tutteSpese[i] = tutteSpese[i].copy(tolta = if (annulla) "" else adesso())
        aggiornaSpese(meseSpese)
    }

    fun salvaTrasferta(t: Trasferta): Trasferta {
        val vecchia = tutteTrasferte.firstOrNull { it.id == t.id }
        val v = veicoli.firstOrNull { it.id == t.idVeicolo } ?: veicoli.firstOrNull { it.attivo }
        // L'euro al km resta quello di quando è nata, se il veicolo non cambia (§14.9).
        val euroKm = if (vecchia != null && vecchia.idVeicolo == v?.id) vecchia.euroKm else v?.euroKm
        val r = ContiOreSpese.rimborsoTrasferta(t.km, t.andataRitorno, euroKm, t.indennita)
        val m = ana().commessa(t.idCommessa)
        val nuova = t.copy(
            id = t.id.ifBlank { nuovoId() }, idUtente = vecchia?.idUtente ?: io, utente = vecchia?.utente ?: ioNome,
            giorni = (Duration.between(t.dal.atStartOfDay(), t.al.atStartOfDay()).toDays() + 1).toInt().coerceAtLeast(1),
            commessa = m?.descrizione.orEmpty(), idCliente = m?.idCliente.orEmpty(), idVeicolo = v?.id.orEmpty(), veicolo = v?.nome.orEmpty(),
            euroKm = euroKm, kmTotali = r.kmTotali, rimborsoKm = r.rimborsoKm, indennita = r.indennita, totale = r.totale,
            stato = vecchia?.stato ?: StatoVoce.APPROVATA, spese = tutteSpese.filter { it.idTrasferta == t.id && t.id.isNotBlank() },
        )
        tutteTrasferte.removeAll { it.id == nuova.id }
        tutteTrasferte += nuova
        aggiornaSpese(meseSpese)
        return nuova
    }

    fun togliTrasferta(id: String, annulla: Boolean): Result<Trasferta> {
        val i = tutteTrasferte.indexOfFirst { it.id == id }
        if (i < 0) return Result.failure(Exception("Trasferta $id non trovata"))
        val n = tutteSpese.count { it.idTrasferta == id && it.tolta.isBlank() }
        if (!annulla && n > 0) return Result.failure(Exception("La trasferta ha $n ${if (n == 1) "spesa" else "spese"}: prima toglile o spostale"))
        tutteTrasferte[i] = tutteTrasferte[i].copy(tolta = if (annulla) "" else adesso())
        aggiornaSpese(meseSpese)
        return Result.success(tutteTrasferte[i])
    }

    fun rimborsi(): Rimborsi {
        val nomi = mapOf(io to ioNome, "3" to "Marco Rossato")
        val persone = ContiOreSpese.rimborsiDovuti(tutteSpese, tutteTrasferte).map { it.copy(nome = nomi[it.idUtente].orEmpty()) }
        return Rimborsi(ContiOreSpese.centesimi(persone.sumOf { it.totale }), true, persone)
    }

    fun segnaRimborsato(voci: List<VoceRimborso>, annulla: Boolean): Pair<Int, Double> {
        var fatte = 0
        var totale = 0.0
        val quando = if (annulla) "" else adesso()
        for (v in voci) {
            if (v.tipo == "spesa") {
                val i = tutteSpese.indexOfFirst { it.id == v.id }
                if (i >= 0) { tutteSpese[i] = tutteSpese[i].copy(rimborsataIl = quando); fatte++; totale += tutteSpese[i].importo }
            } else {
                val i = tutteTrasferte.indexOfFirst { it.id == v.id }
                if (i >= 0) { tutteTrasferte[i] = tutteTrasferte[i].copy(rimborsataIl = quando); fatte++; totale += tutteTrasferte[i].totale }
            }
        }
        aggiornaSpese(meseSpese)
        return fatte to ContiOreSpese.centesimi(totale)
    }

    fun veicoli(tutti: Boolean): ElencoVeicoli =
        ElencoVeicoli(oggi.year, "https://www.aci.it/", veicoli.filter { tutti || it.attivo }.map { v -> v.copy(trasferte = tutteTrasferte.count { it.idVeicolo == v.id && it.tolta.isBlank() }) })

    fun salvaVeicolo(v: Veicolo): Result<Veicolo> {
        if ((v.euroKm ?: 0.0) < 0) return Result.failure(Exception("Euro al km: non può essere negativo"))
        val nuovo = v.copy(id = v.id.ifBlank { nuovoId() }, annoAci = v.annoAci ?: oggi.year)
        veicoli.removeAll { it.id == nuovo.id }
        veicoli += nuovo
        return Result.success(nuovo)
    }

    /** Il riepilogo del mese come lo fa il server (§14.10), sulle spese e trasferte mandate o approvate. */
    fun riepilogo(m: YearMonth, per: String): RiepilogoSpese {
        val sp = tutteSpese.filter { YearMonth.from(it.data) == m && it.tolta.isBlank() && StatoVoce.conta(it.stato) }
        val tr = if (per == "categoria") emptyList() else tutteTrasferte.filter { YearMonth.from(it.dal) == m && it.tolta.isBlank() && StatoVoce.conta(it.stato) }
        fun chiaveS(s: Spesa) = when (per) { "commessa" -> s.idCommessa; "categoria" -> s.categoria; else -> s.idUtente }
        fun chiaveT(t: Trasferta) = if (per == "commessa") t.idCommessa else t.idUtente
        fun nome(k: String) = when (per) {
            "commessa" -> if (k.isBlank()) "Senza commessa" else ana().commessa(k)?.descrizione.orEmpty()
            "categoria" -> CategoriaSpesa.nome(k)
            else -> if (k == io) ioNome else "Marco Rossato"
        }
        val chiavi = (sp.map(::chiaveS) + tr.map(::chiaveT)).distinct()
        val c = ContiOreSpese::centesimi
        val righe = chiavi.map { k ->
            val s = sp.filter { chiaveS(it) == k }
            val t = tr.filter { chiaveT(it) == k }
            val cliente = c(s.filter { it.destinazione == Destinazione.CLIENTE }.sumOf { it.importo })
            val studio = c(s.filter { it.destinazione == Destinazione.STUDIO }.sumOf { it.importo })
            RigaRiepilogoSpese(
                chiave = k, nome = nome(k), quante = s.size, cliente = cliente, studio = studio,
                nomeCliente = if (per == "commessa") ana().commessa(k)?.idCliente?.let { ana().cliente(it)?.nome }.orEmpty() else "",
                personale = c(s.filter { it.destinazione == Destinazione.PERSONALE }.sumOf { it.importo }),
                trasferte = t.size, km = t.sumOf { it.kmTotali }, rimborsoKm = c(t.sumOf { it.rimborsoKm }), indennita = c(t.sumOf { it.indennita }),
                totale = c(cliente + studio + t.sumOf { it.rimborsoKm } + t.sumOf { it.indennita }),
            )
        }.sortedByDescending { it.totale }
        val totale = RigaRiepilogoSpese(
            "", "Totale", righe.sumOf { it.quante }, c(righe.sumOf { it.cliente }), c(righe.sumOf { it.studio }), c(righe.sumOf { it.personale }),
            trasferte = righe.sumOf { it.trasferte }, km = righe.sumOf { it.km }, rimborsoKm = c(righe.sumOf { it.rimborsoKm }), totale = c(righe.sumOf { it.totale }),
        )
        return RiepilogoSpese(per, righe, totale)
    }

    fun togliFotoSpesa(idFile: String): Result<Spesa> {
        val i = tutteSpese.indexOfFirst { s -> s.foto.any { it.id == idFile } }
        if (i < 0) return Result.failure(Exception("Foto $idFile non trovata"))
        tutteSpese[i] = tutteSpese[i].copy(foto = tutteSpese[i].foto.filterNot { it.id == idFile })
        aggiornaSpese(meseSpese)
        return Result.success(tutteSpese[i])
    }

    /**
     * Le statistiche del mese come le fa il server (§14.11): le ore registrate
     * mandate o approvate, più quelle dei rapportini di Manuel ([oreRapportiniMese]).
     */
    fun statistiche(m: YearMonth, per: String, oreRapportiniMese: Map<String, Pair<Double, Double>>): StatisticheOre {
        val vive = righe.filter { YearMonth.from(it.data) == m && it.tolta.isBlank() && StatoVoce.conta(it.stato) }
        data class Somma(var ore: Double = 0.0, var fatt: Double = 0.0, var rap: Double = 0.0, var reg: Double = 0.0)
        val per2 = LinkedHashMap<String, Somma>()
        vive.forEach { r -> val k = if (per == "persona") r.idUtente else r.idCommessa; per2.getOrPut(k) { Somma() }.apply { ore += r.ore; reg += r.ore; if (r.fatturabile) fatt += r.ore } }
        // I rapportini: per persona sono tutti di Manuel; per commessa la chiave è la commessa.
        oreRapportiniMese.forEach { (commessa, of) -> val k = if (per == "persona") io else commessa; per2.getOrPut(k) { Somma() }.apply { ore += of.first; rap += of.first; fatt += of.second } }
        // Le ore di Marco della visita (le stesse delle cose da approvare, già approvate prima).
        if (per == "persona") per2.getOrPut("3") { Somma() }.apply { ore += 31.5; reg += 31.5; fatt += 28.0 }
        val arr = { n: Double -> Math.floor(n * 100 + 0.5) / 100.0 }
        val righe2 = per2.map { (k, s) ->
            val nome = if (per == "persona") (if (k == io) ioNome else "Marco Rossato") else if (k.isBlank()) "Attività dello studio" else ana().commessa(k)?.descrizione.orEmpty()
            RigaStatisticaOre(k, nome, arr(s.ore), arr(s.fatt), RigaStatisticaOre.percentuale(s.fatt, s.ore), arr(s.rap), arr(s.reg), costo = arr(s.ore * 22), costoNoto = true,
                idCliente = if (per == "commessa") ana().commessa(k)?.idCliente.orEmpty() else "")
        }.sortedByDescending { it.ore }
        val ore = arr(righe2.sumOf { it.ore }); val fatt = arr(righe2.sumOf { it.fatturabili })
        return StatisticheOre(per, righe2, RigaStatisticaOre("", "Totale", ore, fatt, RigaStatisticaOre.percentuale(fatt, ore), arr(righe2.sumOf { it.oreRapportini }), arr(righe2.sumOf { it.oreRegistrate }), arr(righe2.sumOf { it.costo ?: 0.0 })))
    }

    /** Le righe del CSV di [cosa] per la visita (le colonne principali di §14.14). */
    fun righeCsv(cosa: String, da: LocalDate?, a: LocalDate?, utente: String = ""): List<List<String>> {
        fun dentro(d: LocalDate) = (da == null || !d.isBefore(da)) && (a == null || !d.isAfter(a))
        val n = { x: Double? -> eu.stgm.wisper.rapportino.Numeri.scrivi(x) }
        return when (cosa) {
            "ore" -> listOf(listOf("Data", "Persona", "Inizio", "Fine", "Ore", "Codice commessa", "Commessa", "Descrizione", "Fatturabile", "Tipo", "Stato")) +
                righe.filter { it.tolta.isBlank() && dentro(it.data) && (utente.isBlank() || it.idUtente == utente) }.map { listOf(it.data.toString(), it.utente, it.inizio, it.fine, n(it.ore), it.idCommessa, it.commessa.ifBlank { "Attività dello studio" }, it.descrizione, if (it.fatturabile) "Sì" else "No", it.tipo, StatoVoce.parola(it.stato).ifBlank { "Approvata" }) }
            "spese" -> listOf(listOf("Data", "Persona", "Categoria", "Descrizione", "Importo", "A chi va", "Codice commessa", "Scontrino", "Stato")) +
                tutteSpese.filter { it.tolta.isBlank() && dentro(it.data) }.map { listOf(it.data.toString(), it.utente, CategoriaSpesa.nome(it.categoria), it.descrizione, n(it.importo), Destinazione.nome(it.destinazione), it.idCommessa, if (it.foto.isEmpty()) "No" else "Sì", StatoVoce.parola(it.stato).ifBlank { "Approvata" }) }
            "trasferte" -> listOf(listOf("Dal", "Al", "Persona", "Destinazione", "Codice commessa", "Veicolo", "Km totali", "Euro al km", "Rimborso km", "Totale")) +
                tutteTrasferte.filter { it.tolta.isBlank() && dentro(it.dal) }.map { listOf(it.dal.toString(), it.al.toString(), it.utente, it.destinazione, it.idCommessa, it.veicolo, n(it.kmTotali), n(it.euroKm), n(it.rimborsoKm), n(it.totale)) }
            else -> listOf(listOf("Persona", "Tipo", "Data", "Descrizione", "Codice commessa", "Km", "Importo")) +
                rimborsi().persone.flatMap { p -> p.voci.map { v -> listOf(p.nome, if (v.tipo == "spesa") "Spesa" else "Trasferta", v.data?.toString().orEmpty(), v.descrizione, v.idCommessa, n(v.km), n(v.importo)) } }
        }
    }

    /** Le voci della fase 3 nella Dashboard della visita, come le manda il server (§14.13). */
    fun vociDashboard(): Pair<List<VoceDashboard>, List<VoceDashboard>> {
        val urgenti = mutableListOf<VoceDashboard>()
        val settimana = mutableListOf<VoceDashboard>()
        val a = approvare
        if (a.quante > 0) {
            val p = a.persone.singleOrNull()
            urgenti += VoceDashboard(
                tipo = "approvare", gravita = "attenzione",
                titolo = "${a.quante} ${if (a.quante == 1) "cosa" else "cose"} da approvare" + (p?.let { " di ${it.nome}" } ?: ""),
                dettaglio = "Ore, spese e un rapportino" + if (a.conAnomalie > 0) " · ${a.conAnomalie} con un'anomalia" else "",
                quanto = a.quante.toDouble(), unita = "voci",
                collegamento = Collegamento("rapportini", parametri = mapOf("segmento" to "daApprovare")),
            )
        }
        timer.value?.timer?.let { t ->
            val ore = timer.value!!.secondi(System.currentTimeMillis()) / 3600
            if (ore >= 10) urgenti += VoceDashboard(
                "timer", "Il timer è acceso da $ore ore", "${t.idCommessa.ifBlank { "Studio" }} · dalle ${t.dalle} · fermalo e correggi le ore", ore.toDouble(),
                "attenzione", Collegamento("rapportini", parametri = mapOf("segmento" to "ore")), "ore",
            )
        }
        val r = rimborsi()
        if (r.totale > 0) settimana += VoceDashboard(
            "rimborsi", "Rimborsi da fare", r.persone.take(3).joinToString(", ") { it.nome + " " + eu.stgm.wisper.rapportino.Numeri.euro(it.totale) }, r.totale,
            "soldi", Collegamento("spese", parametri = mapOf("segmento" to "rimborsi")), "euro",
        )
        return urgenti to settimana
    }
}
