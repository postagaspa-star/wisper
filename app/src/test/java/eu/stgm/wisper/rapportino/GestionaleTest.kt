package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * I pezzi del gestionale letti dalle risposte del server così come le scrive
 * docs/gestionale/architettura.md §12 (gli stessi esempi, accorciati).
 */
class GestionaleTest {

    private val anagrafiche = JSONObject(
        """{"ok":true,
        "clienti":[{"id":"C001","nome":"Elettrodinamica","alias":[],"tariffaFissa":30,"partitaIva":"01234567897",
            "cliente":true,"fornitore":false,"pec":"","codiceFiscale":"","codiceSdi":"M5UXCR1","cap":"36016","citta":"Thiene",
            "provincia":"VI","nazione":"IT","archiviato":false},
          {"id":"C009","nome":"Vecchi Snc","cliente":true,"archiviato":true}],
        "fornitori":[{"id":"F001","nome":"Materiale Elettrico Esempio Srl","alias":[],"email":"ordini@materiale.example",
            "telefono":"0445 000100","indirizzo":"Via dei Fornitori 3","partitaIva":"01234567897","tariffaFissa":null,
            "cliente":false,"fornitore":true,"codiceSdi":"ABC1234","cap":"36016","citta":"Thiene","provincia":"VI","archiviato":false}],
        "commesse":[{"id":"26ST001","idCliente":"C001","descrizione":"Nuovo magazzino automatico Batokyo","stato":"APERTA",
            "sedeId":2,"responsabileId":1,"importoContratto":1200,"persone":[3],"archiviata":false,"modello":false},
          {"id":"26ST002","idCliente":"C001","descrizione":"Modello quadro","stato":"APERTA","modello":true},
          {"id":"25ST090","idCliente":"C009","descrizione":"Vecchia","stato":"CHIUSA","archiviata":true}],
        "gruppi":[],"impostazioni":{"EURO_KM":0.76},
        "referenti":[{"id":1,"idSoggetto":"C001","nome":"Giulia Bianchi","ruolo":"Ufficio tecnico","email":"g@e.it","telefono":"0445 000001","note":"","ordine":1}],
        "sedi":[{"id":2,"idSoggetto":"C001","tipo":"impianto","nome":"Magazzino automatico Batokyo","indirizzo":"Zona industriale",
            "cap":"36015","citta":"Schio","provincia":"VI","note":"","archiviata":false}],
        "prestazioni":[{"id":2,"idCommessa":"26ST001","nome":"Progetto esecutivo","descrizione":"Schemi","valore":600,"avanzamento":50,"stato":"in_corso","ordine":2}],
        "utenti":[{"id":1,"nome":"Manuel Gasparotto","ruolo":"titolare","attivo":true},{"id":3,"nome":"Marco Collaboratore","ruolo":"collaboratore","attivo":true}],
        "numerazioni":[{"tipo":"commessa","formato":"{AA}ST{NNN}","annuale":false,"ultimo":2,"prossimo":"26ST003"},
          {"tipo":"rapportino","formato":"RAP/{AAAA}/{NNNN}","annuale":true,"ultimo":6,"prossimo":"RAP/2026/0007"}]}""",
    )

    @Test
    fun `le anagrafiche del server, clienti, fornitori, archiviati, referenti, sedi, prestazioni`() {
        val a = Anagrafiche.daJson(anagrafiche)
        assertEquals(listOf("C001"), a.clienti.map { it.id })
        assertEquals(listOf("F001"), a.fornitori.map { it.id })
        assertEquals(listOf("C009"), a.archiviati.map { it.id })
        val c = a.clienti.single()
        assertEquals("M5UXCR1", c.codiceSdi)
        assertEquals("Thiene", c.citta)
        assertTrue(c.cliente)
        assertFalse(c.fornitore)
        val f = a.fornitori.single()
        assertTrue(f.fornitore)
        assertFalse(f.cliente)
        // Un archiviato si trova per codice (un rapportino vecchio), ma non si propone.
        assertEquals("Vecchi Snc", a.cliente("C009")?.nome)

        val m = a.commessa("26ST001")!!
        assertEquals("2", m.idSede)
        assertEquals("1", m.idResponsabile)
        assertEquals(listOf("3"), m.persone)
        assertEquals(1200.0, m.importoContratto!!, 0.0)
        assertTrue(m.aperta)
        // I modelli e le archiviate non si propongono nei rapportini.
        assertFalse(a.commessa("26ST002")!!.aperta)
        assertFalse(a.commessa("25ST090")!!.aperta)
        assertEquals(listOf("26ST001"), a.commesseAperteDi("C001").map { it.id })

        assertEquals("Giulia Bianchi", a.referentiDi("C001").single().nome)
        assertTrue(a.sediDi("C001").single().impianto)
        assertEquals("Zona industriale, 36015 Schio (VI)", a.sede("2")!!.indirizzoCompleto)
        val p = a.prestazioniDi("26ST001").single()
        assertEquals(50, p.avanzamento)
        assertEquals(Prestazione.IN_CORSO, p.stato)
        assertEquals(600.0, p.valore!!, 0.0)
        assertEquals("Manuel", a.titolare)
        assertEquals("26ST003", a.prossimoCodiceCommessa(2026))
        assertEquals("RAP/2026/0007", a.numerazione("rapportino")!!.prossimoNumero(2026))
    }

    @Test
    fun `la copia sul telefono rilegge le stesse anagrafiche`() {
        val a = Anagrafiche.daJson(anagrafiche)
        val b = Anagrafiche.daJson(a.aJson())
        assertEquals(a.clienti, b.clienti)
        assertEquals(a.fornitori, b.fornitori)
        assertEquals(a.archiviati.map { it.id }, b.archiviati.map { it.id })
        assertEquals(a.commesse, b.commesse)
        assertEquals(a.referenti, b.referenti)
        assertEquals(a.sedi, b.sedi)
        assertEquals(a.prestazioni, b.prestazioni)
        assertEquals(a.numerazioni, b.numerazioni)
    }

    @Test
    fun `senza i soldi i campi non ci sono, e non diventano zero`() {
        val a = Anagrafiche.daJson(JSONObject("""{"clienti":[{"id":"C001","nome":"Elettrodinamica"}],"commesse":[{"id":"26ST001","idCliente":"C001","descrizione":"x"}],
            "prestazioni":[{"id":1,"idCommessa":"26ST001","nome":"Collaudo","avanzamento":100}]}"""))
        assertNull(a.clienti.single().tariffaFissa)
        assertNull(a.commessa("26ST001")!!.importoContratto)
        assertNull(a.prestazioni.single().valore)
        assertEquals(Prestazione.FATTA, a.prestazioni.single().stato)
    }

    @Test
    fun `un doppione per nome, altro nome o partita IVA, anche fra gli archiviati`() {
        val a = Anagrafiche.daJson(anagrafiche)
        assertEquals("C001", a.doppioneDi("elettrodinamica", emptyList(), "")?.id)
        assertEquals("01234567897", a.doppioneDi("Un altro nome", emptyList(), "012 345 678 97")?.partitaIva)
        assertEquals("C009", a.doppioneDi("Vecchi S.n.c.", emptyList(), "")?.id)
        assertNull(a.doppioneDi("Elettrodinamica", emptyList(), "", tranne = "C001"))
        assertNull(a.doppioneDi("Bianchi Srl", emptyList(), ""))
    }

    @Test
    fun `numerazioni, il formato coi segnaposti e a parole`() {
        assertEquals("26ST048", Numerazione.applica("{AA}ST{NNN}", 48, 2026))
        assertEquals("26ST1048", Numerazione.applica("{AA}ST{NNN}", 1048, 2026))
        assertEquals("RAP/2026/0143", Numerazione.applica("RAP/{AAAA}/{NNNN}", 143, 2026))
        assertEquals("ST26-0004", Numerazione("commessa", "ST{AA}-{NNNN}", ultimo = 3).prossimoNumero(2026))
        assertEquals("anno a due cifre, ST, numero", Numerazione.aParole("{AA}ST{NNN}"))
        assertEquals("RAP, anno, numero", Numerazione.aParole("RAP/{AAAA}/{NNNN}"))
    }

    @Test
    fun `permessi, i valori iniziali sono quelli del server`() {
        val coll = Permessi.iniziali(Ruoli.COLLABORATORE)
        assertTrue(coll.modifica(Moduli.RAPPORTINI))
        assertTrue(coll.vede(Moduli.COMMESSE))
        assertFalse(coll.modifica(Moduli.COMMESSE))
        assertFalse(coll.vede(Moduli.FATTURAZIONE))
        assertFalse(coll.vede(Moduli.AMMINISTRAZIONE))
        assertFalse(coll.costi)
        val amm = Permessi.iniziali(Ruoli.AMMINISTRAZIONE)
        assertEquals(1, amm.livello(Moduli.AMMINISTRAZIONE))
        assertTrue(amm.costi)
        val lettura = Permessi.iniziali(Ruoli.LETTURA)
        assertTrue(lettura.vede(Moduli.FATTURAZIONE))
        assertFalse(lettura.modifica(Moduli.CLIENTI))
        assertFalse(lettura.vede(Moduli.AMMINISTRAZIONE))
        assertTrue(lettura.costi)
        // Dal server: un numero per modulo; quello che manca è "niente".
        val p = Permessi.daJson(JSONObject("""{"dashboard":1,"rapportini":2,"costi":0}"""))
        assertTrue(p.modifica("rapportini"))
        assertFalse(p.vede("clienti"))
    }

    @Test
    fun `la dashboard del server, con i numeri e i collegamenti col filtro`() {
        val d = Dashboard.daJson(JSONObject("""{"ok":true,"per":"titolare","oggi":"2026-10-21",
            "numeri":{"commesse":{"aperte":3,"sospese":0,"chiuse":1,"inRitardo":2},"rapportini":{"daFirmare":5}},
            "urgenti":[{"tipo":"rapportini","gravita":"urgente","titolo":"3 rapportini da far firmare da più di una settimana",
              "dettaglio":"Il più vecchio è del 08/10","quanto":3,"unita":"rapportini",
              "collegamento":{"pagina":"rapportini","filtro":{"stato":"BOZZA","a":"2026-10-14"}}}],
            "settimana":[{"tipo":"fatturazione","gravita":"soldi","titolo":"Da fatturare questo mese","dettaglio":"1 rapportino",
              "quanto":357.46,"unita":"euro","collegamento":{"pagina":"fatturazione","filtro":{"mese":"2026-10"}}}],
            "pianificare":[{"tipo":"commessa","gravita":"info","titolo":"26ST002: manca il responsabile","dettaglio":"Quadro",
              "quanto":null,"unita":null,"collegamento":{"pagina":"commessa","id":"26ST002"}}]}"""))
        assertEquals(NumeriCommesse(3, 0, 2, 1), d.commesse)
        val u = d.urgenti.single()
        assertEquals("rapportini", u.unita)
        assertEquals("BOZZA", u.collegamento!!.parametri["stato"])
        assertEquals("2026-10", d.settimana.single().collegamento!!.parametri["mese"])
        assertEquals(357.46, d.settimana.single().quanto!!, 0.0)
        assertNull(d.pianificare.single().quanto)
        assertEquals("26ST002", d.pianificare.single().collegamento!!.id)
        assertFalse(d.vuota)
    }

    @Test
    fun `una voce del registro, i campi cambiati coi nomi da leggere`() {
        val v = VoceRegistro.daJson(JSONObject("""{"id":18,"quando":"2026-10-21T22:30:15","idUtente":1,"utente":"Manuel Gasparotto",
            "azione":"salvaRapportino","tabella":"soggetti","idRiga":"C002","prima":{"ultima_tariffa":null},"dopo":{"ultima_tariffa":42},"nota":""}"""))
        assertEquals("Manuel Gasparotto", v.chi)
        assertEquals("C002", v.idRiga)
        assertEquals(CampoCambiato("Ultima tariffa", "", "42"), v.campi.single())
        assertFalse(v.nuova)
        val nuova = VoceRegistro.daJson(JSONObject("""{"id":19,"quando":"2026-10-21T22:31:00","utente":"Laura","azione":"salvaReferente",
            "tabella":"referenti","idRiga":"4","prima":null,"dopo":{"nome":"Anna Rossi"}}"""))
        assertTrue(nuova.nuova)
        assertEquals("Anna Rossi", nuova.campi.single().dopo)
    }

    @Test
    fun `le copie, riuscite, solo sul NAS, e il foglio`() {
        val s = StatoCopie.daJson(JSONObject("""{"ok":true,"copie":[
            {"id":2,"quando":"2026-10-21T02:30:00","byte":221184,"locale":"ok","fuori":"ok · 1 file","foglio":"ok","nota":"notturna"},
            {"id":1,"quando":"2026-10-20T02:30:00","byte":221000,"locale":"ok","fuori":"postino non collegato","foglio":"postino non collegato","nota":"notturna"}]}"""))
        assertTrue(s.ultima!!.riuscita)
        assertEquals("Sul NAS e fuori casa, su Drive", s.ultima!!.dove)
        assertTrue(s.foglioAggiornato)
        assertEquals("Sul NAS · fuori casa no: il postino non è collegato", s.elenco[1].dove)
        val rotta = CopiaSicurezza.daJson(JSONObject("""{"quando":"2026-10-21T02:30:00","locale":"errore: disco pieno","fuori":"","foglio":""}"""))
        assertFalse(rotta.riuscita)
        assertEquals("Sul NAS: disco pieno", rotta.dove)
    }

    @Test
    fun `utenti, dispositivi e cestino`() {
        val u = Utente.daJson(JSONObject("""{"id":5,"nome":"Giorgio Nuovo","email":"giorgio@esempio.it","ruolo":"collaboratore","attivo":true,"ultimoAccesso":""}"""))
        assertEquals("5", u.id)
        assertEquals("GN", u.iniziali)
        assertTrue(u.attivo)
        val d = Dispositivo.daJson(JSONObject("""{"id":1,"idUtente":1,"dispNome":"motorola edge 60","app":"telefono 0.5.0","ultimoUso":"2026-10-21T22:30:15","questa":true}"""))
        assertEquals("motorola edge 60", d.nome)
        assertTrue(d.questo)
        val f = FileCestino.daJson(JSONObject("""{"id":"D04y","nome":"RAP-2026-0007 spesa q.png","idRapportino":"RAP/2026/0007","idCommessa":"","cestinato":"2026-10-21T22:30:15"}"""))
        assertEquals("RAP/2026/0007", f.daDove)
        assertEquals("2026-10-21T22:30:15", f.quando)
    }

    @Test
    fun `partita IVA italiana, undici cifre, le estere non si toccano`() {
        assertNull(PartitaIva.errore("01234567897"))
        assertEquals("La partita IVA ha 11 cifre", PartitaIva.errore("0123456"))
        assertNull(PartitaIva.errore("DE123456789"))
        assertNull(PartitaIva.errore(""))
    }
}
