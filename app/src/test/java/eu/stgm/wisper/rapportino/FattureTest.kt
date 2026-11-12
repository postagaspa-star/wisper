package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * I conti della fattura sul telefono devono dare i numeri del server al centesimo
 * (fase4.md §6, architettura.md §15.18): qui tutti i casi di
 * server/prove/casi-fattura.json letti dal file così com'è, più le letture delle
 * risposte della §15, le regole della scelta in Da fatturare, l'abbinamento
 * dell'XML e lo scadenziario.
 */
class FattureTest {

    private fun file(): File? = listOf("../server/prove/casi-fattura.json", "server/prove/casi-fattura.json").map(::File).firstOrNull { it.exists() }

    private fun parametri(base: JSONObject, f: JSONObject): ParametriFattura {
        fun n(k: String) = if (f.has(k)) f.getDouble(k) else base.getDouble(k)
        fun b(k: String) = if (f.has(k)) f.getBoolean(k) else base.optBoolean(k)
        return ParametriFattura(
            regime = f.optString("regime", base.optString("regime", "ordinario")),
            ivaPercentuale = n("ivaPercentuale"), eppiPercentuale = n("eppiPercentuale"), ritenutaPercentuale = n("ritenutaPercentuale"),
            ritenuta = f.optBoolean("ritenuta"), bolloSoglia = n("bolloSoglia"), bolloImporto = n("bolloImporto"), bolloRivalsa = b("bolloRivalsa"),
        )
    }

    @Test
    fun `gli stessi conti del server su ogni caso di casi-fattura json, al centesimo`() {
        val f = file()
        assumeTrue("Manca server/prove/casi-fattura.json", f != null)
        val tutto = JSONObject(f!!.readText(Charsets.UTF_8))
        val base = tutto.getJSONObject("base")
        val casi = tutto.getJSONArray("casi")
        // 1.4.0: 32 casi (i due ultimi sono le parcelle d'esempio di servizi.md §3, il 32 con lo sconto sulle righe).
        assertTrue("almeno i 32 casi del contratto", casi.length() >= 32)
        for (i in 0 until casi.length()) {
            val caso = casi.getJSONObject(i)
            val nome = caso.getString("nome")
            val fattura = caso.getJSONObject("fattura")
            val righe = fattura.getJSONArray("righe").oggetti().map {
                RigaPerConti(it.getString("tipo"), it.numero("quantita"), it.numero("prezzo"), it.numero("importo"), it.optBoolean("tributoCliente"), it.numero("sconto"))
            }
            val k = RegoleFattura.calcola(parametri(base, fattura), righe)
            val a = caso.getJSONObject("atteso")
            val attese = a.getJSONArray("righe")
            assertEquals("$nome: quante righe", attese.length(), k.righe.size)
            for (j in 0 until attese.length()) assertEquals("$nome: riga ${j + 1}", attese.getDouble(j), k.righe[j], 0.0)
            fun uguale(campo: String, valore: Double) = assertEquals("$nome: $campo", a.getDouble(campo), valore, 0.0)
            uguale("compenso", k.compenso); uguale("contributo", k.contributo); uguale("baseIva", k.baseIva); uguale("iva", k.iva)
            uguale("anticipazioni", k.anticipazioni); uguale("parteSenzaIva", k.parteSenzaIva); uguale("bollo", k.bollo)
            uguale("bolloAddebitato", k.bolloAddebitato); uguale("totale", k.totale); uguale("ritenuta", k.ritenuta); uguale("netto", k.netto)
        }
    }

    @Test
    fun `il mezzo centesimo va in su come Math round di JavaScript`() {
        assertEquals(1.01, RegoleFattura.importoRiga(RigaPerConti("compenso", 3.0, 0.335)), 0.0)
        assertEquals(20.73, RegoleFattura.centesimi(414.5 * 5 / 100), 0.0)
        assertEquals(0.0, RegoleFattura.importoRiga(RigaPerConti("compenso", 4.0, null)), 0.0)
        assertEquals(450.0, RegoleFattura.importoRiga(RigaPerConti("compenso", null, 450.0)), 0.0)
    }

    @Test
    fun `lo sconto della riga in percento e l'IVA riga per riga come Flextaxa`() {
        // 2 h a 50 € meno il 40% = 60 €; senza sconto (0 o null) resta quantità per prezzo.
        assertEquals(60.0, RegoleFattura.importoRiga(RigaPerConti("compenso", 2.0, 50.0, sconto = 40.0)), 0.0)
        assertEquals(100.0, RegoleFattura.importoRiga(RigaPerConti("compenso", 2.0, 50.0, sconto = 0.0)), 0.0)
        // L'importo scritto vince sullo sconto (come il server: lo sconto conta solo quando "importo" manca).
        assertEquals(75.0, RegoleFattura.importoRiga(RigaPerConti("compenso", 2.0, 50.0, 75.0, sconto = 40.0)), 0.0)
        // Tre righe da 0,35 € al 22%: riga per riga 0,08 × 3 = 0,24; sul totale (1,05 × 22%) sarebbe 0,23.
        val p = ParametriFattura(regime = "ordinario", ivaPercentuale = 22.0, eppiPercentuale = 0.0, ritenutaPercentuale = 0.0,
            ritenuta = false, bolloSoglia = 77.47, bolloImporto = 2.0, bolloRivalsa = false)
        val k = RegoleFattura.calcola(p, List(3) { RigaPerConti("compenso", 1.0, 0.35) })
        assertEquals(0.24, k.iva, 0.0)
        // Forfettario: niente IVA.
        assertEquals(0.0, RegoleFattura.calcola(p.copy(regime = "forfettario"), List(3) { RigaPerConti("compenso", 1.0, 0.35) }).iva, 0.0)
    }

    // ------------------------------------------------------------------ le risposte della §15

    private val bozza15 = """{"id": 15, "riferimento": "W-15", "etichetta": "Bozza W-15", "tipo": "fattura", "tipoDocumento": "TD01", "idCliente": "C002",
 "cliente": "Rossi Impianti Srl", "idCommessa": "26ST003", "idFatturaCollegata": null, "stato": "bozza", "statoVisto": "Bozza",
 "pagamento": "da_incassare", "scaduta": false, "giorniScaduta": 0, "data": "2026-10-22", "numero": "", "numeroDa": "",
 "causale": "40% a fine progetto, commessa 26ST003", "noteInterne": "", "regime": "ordinario", "ivaPercentuale": 22,
 "eppiPercentuale": 5, "ritenutaPercentuale": 20, "ritenuta": true, "bolloRivalsa": true,
 "conti": {"righe": [1520, 120], "compenso": 1520, "contributo": 76, "baseIva": 1596, "iva": 351.12, "anticipazioni": 120,
   "bollo": 2, "bolloAddebitato": 2, "totale": 2069.12, "ritenuta": 304, "netto": 1765.12, "parteSenzaIva": 120},
 "totaleBozza": null, "nettoBozza": null,
 "scadenze": [{"id": 8, "data": "2026-11-21", "importo": 1765.12, "modalita": "MP05", "coperta": 0}],
 "scadenzaAMano": false, "idConto": 1, "conto": "Conto studio …3456", "incassato": 0, "residuo": 1765.12, "daEmettereEntro": "",
 "esitoSdi": "", "prontaIl": "", "emessaIl": "", "avvisoInviatoIl": "", "regoleConfermate": false,
 "righe": [
  {"id": 12, "ordine": 1, "origine": "bozza", "gruppo": "scadenza:8", "tipo": "compenso", "descrizione": "40% a fine progetto: Adeguamento impianto elettrico capannone (commessa 26ST003, contratto PR/2026/012 rev. 1)",
   "quantita": 1, "unita": "", "prezzo": 1520, "importo": 1520, "aliquotaIva": 22, "natura": "", "ritenuta": true, "tributoCliente": false, "idCommessa": "26ST003", "importoSorgenti": 1520},
  {"id": 13, "ordine": 2, "origine": "bozza", "gruppo": "spesa:13", "tipo": "anticipazione", "descrizione": "Spesa anticipata per conto del cliente: Pratica di connessione al distributore del 14/10/2026",
   "quantita": 1, "unita": "", "prezzo": 120, "importo": 120, "aliquotaIva": 0, "natura": "N1", "ritenuta": false},
  {"id": 14, "ordine": 3, "origine": "bozza", "gruppo": "", "tipo": "bollo", "descrizione": "Imposta di bollo", "quantita": 1, "unita": "", "prezzo": 2, "importo": 2, "aliquotaIva": 0, "natura": "N1", "importoSorgenti": null}],
 "sorgenti": [{"tipo": "scadenza", "id": "8", "gruppo": "scadenza:8", "descrizione": "40% a fine progetto · 26ST003", "importo": 1520, "attiva": true, "liberataIl": "", "liberataPerche": ""}],
 "incassi": [], "note": [], "fatturaCollegata": null, "file": null, "puoScrivere": true, "modificabile": true, "mancano": [], "avvisi": []}"""

    @Test
    fun `la bozza W-15 della risposta vera, e i suoi conti rifatti sul telefono`() {
        val f = Fattura.daJson(JSONObject(bozza15))
        assertEquals("15", f.id)
        assertEquals("Rif. W-15", f.numeroVisto)
        assertTrue(f.bozza && f.modificabile && f.puoScrivere)
        assertEquals(3, f.righe.size)
        assertTrue(f.righe[2].bollo)
        assertEquals("2026-11-21", f.scadenza)
        assertEquals(2069.12, f.conti!!.totale, 0.0)
        assertEquals(1765.12, f.residuo!!, 0.0)
        assertEquals("Conto studio …3456", f.conto)
        // L'anteprima sul telefono, con le righe della fattura (il bollo si salta): gli stessi numeri del server.
        val k = RegoleFattura.calcola(f.parametri, f.righe.map { it.perConti(false) })
        assertEquals(f.conti, k.copy(righe = f.conti.righe))
        // Salvare: niente bollo, id come numeri, niente gruppo.
        val r = f.righe[0].perSalvare()
        assertEquals(12L, r.get("id"))
        assertFalse(r.has("gruppo"))
    }

    @Test
    fun `una riga di un gruppo cambiata dice era 317,88`() {
        val r = RigaFattura(id = "1", gruppo = "rapportino:RAP/2026/0142", importo = 300.0, importoSorgenti = 317.88)
        assertTrue(r.cambiata)
        assertFalse(r.copy(importo = 317.88).cambiata)
        assertFalse(r.copy(gruppo = "").cambiata)
    }

    private val daFatturare = """{"ok": true, "oggi": "2026-10-22", "totale": 2671.88, "clienti": 2,
 "gruppi": [
  {"idCliente": "C002", "cliente": "Rossi Impianti Srl", "sostituto": true, "mancano": [], "totale": 724.6, "voci": [
   {"tipo": "spesa", "id": 6, "idCommessa": "26ST002", "data": "2026-10-20", "titolo": "Diritti di segreteria del Comune", "pronta": true, "importo": 52, "anticipazione": true, "gruppo": "commessa:26ST002"},
   {"tipo": "rapportino", "id": "RAP/2026/0013", "idCommessa": "26ST002", "data": "2026-10-21", "titolo": "Collaudo quadro", "pronta": true, "importo": 316.2, "spese": [16, 17], "totaleConSpese": 324.6, "anticipazione": false, "gruppo": "rapportini:C002:2026-10"},
   {"tipo": "spesa", "id": 16, "idCommessa": "26ST002", "titolo": "Pedaggio", "idRapportino": "RAP/2026/0013", "pronta": true, "importo": 8.4, "anticipazione": false, "gruppo": "rapportini:C002:2026-10"},
   {"tipo": "spesa", "id": 17, "titolo": "Corriere per i documenti", "idRapportino": "RAP/2026/0013", "pronta": true, "importo": 12, "anticipazione": true, "gruppo": "rapportini:C002:2026-10"},
   {"tipo": "ore", "id": 10, "idCommessa": "26ST002", "titolo": "Verifica impianto di terra", "pronta": true, "importo": 126, "gruppo": "ore:26ST002:2026-10"}]},
  {"idCliente": "C001", "cliente": "Elettrodinamica", "sostituto": true, "mancano": [{"campo": "destinatario", "testo": "Il codice destinatario o la PEC del cliente"}], "totale": 227.92, "voci": [
   {"tipo": "rapportino", "id": "RAP/2026/0007", "data": "2026-09-03", "titolo": "Rilievo quadri", "pronta": true, "importo": 219.52, "spese": [14], "gruppo": "rapportini:C001:2026-09"},
   {"tipo": "spesa", "id": 14, "titolo": "Pedaggio", "idRapportino": "RAP/2026/0007", "pronta": true, "importo": 8.4, "gruppo": "rapportini:C001:2026-09"}]}],
 "piuAvanti": [{"tipo": "scadenza", "id": 9, "idCommessa": "26ST003", "titolo": "Saldo a fine lavori", "quando": "fine", "pronta": false, "importo": 1140, "gruppo": "commessa:26ST003", "idCliente": "C002", "cliente": "Rossi Impianti Srl"}],
 "inBozza": [{"idFattura": 14, "riferimento": "W-14", "idCliente": "C003", "cliente": "Mario Bianchi", "stato": "pronta", "voci": 0, "totale": 320.25}],
 "riepiloghi": [{"idCliente": "C001", "mese": "2026-09", "rapportini": 6, "inviatoIl": "2026-09-30T18:05:00"}],
 "raggruppa": {"C001": "mese", "C002": "rapportino"},
 "daFirmare": [{"id": "RAP/2026/0003", "idCliente": "C001", "cliente": "Elettrodinamica", "idCommessa": "26ST001", "data": "2026-10-08", "descrizione": "Collaudo", "ore": 9}]}"""

    @Test
    fun `da fatturare si legge, e una fattura è per un cliente solo`() {
        val d = DaFatturare.daJson(JSONObject(daFatturare))
        assertEquals(2, d.gruppi.size)
        assertEquals("mese", d.raggruppa["C001"])
        assertEquals("C002", d.piuAvanti[0].idCliente)
        assertEquals("Il codice destinatario o la PEC del cliente", d.gruppi[1].mancano[0].testo)
        val tutte = d.tutte
        // Scegliere il rapportino porta le sue due spese.
        val rap = d.voce("rapportino:RAP/2026/0013")!!
        var e = SceltaDaFatturare.cambia(emptySet(), rap, tutte)
        assertEquals(setOf("rapportino:RAP/2026/0013", "spesa:16", "spesa:17"), e.scelte)
        assertNull(e.avviso)
        assertEquals(336.6, SceltaDaFatturare.totale(e.scelte, tutte), 0.0)
        // Togliere una sua spesa toglie tutto il rapportino.
        e = SceltaDaFatturare.cambia(e.scelte, d.voce("spesa:17")!!, tutte)
        assertTrue(e.scelte.isEmpty())
        // Scegliere una spesa del rapportino porta il rapportino.
        e = SceltaDaFatturare.cambia(emptySet(), d.voce("spesa:16")!!, tutte)
        assertEquals(3, e.scelte.size)
        // Un altro cliente: si tolgono le altre, con l'avviso.
        e = SceltaDaFatturare.cambia(e.scelte + "ore:10", d.voce("rapportino:RAP/2026/0007")!!, tutte)
        assertEquals(setOf("rapportino:RAP/2026/0007", "spesa:14"), e.scelte)
        assertEquals(SceltaDaFatturare.UN_CLIENTE, e.avviso)
        assertEquals("C001", SceltaDaFatturare.cliente(e.scelte, tutte))
        // Le voci di Più avanti si scelgono lo stesso.
        e = SceltaDaFatturare.cambia(emptySet(), d.piuAvanti[0], tutte)
        assertEquals(1140.0, SceltaDaFatturare.totale(e.scelte, tutte), 0.0)
        // Il mese intero: tutte o nessuna.
        val mese = tutte.filter { it.gruppo == "rapportini:C002:2026-10" }
        e = SceltaDaFatturare.cambia(emptySet(), mese, tutte)
        assertEquals(3, e.scelte.size)
        assertTrue(SceltaDaFatturare.cambia(e.scelte, mese, tutte).scelte.isEmpty())
        assertEquals(17L, (d.voce("spesa:17")!!.perServer().get("id") as Number).toLong())
    }

    private val lettura = """{"ok": true, "idLettura": "4oJhyBms8lf-02DlMDdkHE", "scade": "2026-10-22T08:32:34",
 "documenti": [
  {"chiave": "f1.1#1", "nomeFile": "IT00000000000_00046.xml.p7m", "tipo": "emessa", "tipoDocumento": "TD01", "numero": "46/2026", "data": "2026-10-22",
   "controparte": {"nome": "Mario Bianchi", "partitaIva": "", "codiceFiscale": "BNCMRA70C12L840K", "idSoggetto": "C003"},
   "conti": {"compenso": 250, "totale": 320.25, "ritenuta": 0, "netto": 320.25},
   "proposta": {"azione": "abbina", "certezza": "certa", "idFattura": 14, "riferimento": "W-14", "alternative": [], "differenze": [], "righeMancanti": [], "collegabili": [], "libera": []}, "avvisi": []},
  {"chiave": "f1.2#1", "nomeFile": "IT00000000000_00047.xml", "tipo": "emessa", "numero": "47/2026", "controparte": {"nome": "Elettrodinamica", "idSoggetto": "C001"},
   "conti": {"compenso": 1393.92, "totale": 1785.62, "netto": 1506.84},
   "proposta": {"azione": "senzaBozza", "certezza": "nessuna", "idFattura": null, "riferimento": "", "alternative": [], "differenze": [], "righeMancanti": [], "libera": [], "collegabili": [
      {"gruppo": "rapportini:C001:2026-10", "titolo": "Ottobre 2026 · 1 rapportino", "importo": 357.46, "voci": [{"tipo": "rapportino", "id": "RAP/2026/0002"}, {"tipo": "spesa", "id": "1"}], "spuntato": false},
      {"gruppo": "rapportini:C001:2026-09", "titolo": "Settembre 2026 · 6 rapportini", "importo": 1393.92, "voci": [{"tipo": "rapportino", "id": "RAP/2026/0007"}, {"tipo": "spesa", "id": "15"}], "spuntato": true}]}, "avvisi": []},
  {"chiave": "f1.3#1", "nomeFile": "IT09988776655_0A1B2.xml.p7m", "tipo": "ricevuta", "tipoDocumento": "TD01", "numero": "1301", "controparte": {"nome": "Comel Forniture Elettriche", "idSoggetto": null},
   "conti": {"totale": 117.58, "netto": 117.58}, "proposta": {"azione": "nuova", "categoria": "altro"}, "avvisi": [], "fornitoreNuovo": {"nome": "Comel"}},
  {"chiave": "f1.4#1", "nomeFile": "IT00000000000_00045.xml", "tipo": "emessa", "numero": "45/2026", "proposta": {"azione": "gia", "idFattura": 13, "riferimento": "W-13"}, "avvisi": ["Già importata il 20/10"]},
  {"chiave": "f2#1", "nomeFile": "IT00000000000_00049.xml", "tipo": "emessa", "numero": "49/2026", "controparte": {"nome": "Rossi Impianti Srl", "idSoggetto": "C002"}, "conti": {"totale": 1947.12},
   "proposta": {"azione": "abbina", "certezza": "diversa", "idFattura": 15, "riferimento": "W-15", "alternative": [],
     "differenze": [{"campo": "totale", "bozza": 2069.12, "xml": 1947.12}, {"campo": "anticipazioni", "bozza": 120, "xml": 0}],
     "righeMancanti": [{"idRiga": 13, "descrizione": "Spesa anticipata", "importo": 120, "tipo": "anticipazione", "gruppo": "spesa:13"}], "libera": ["spesa:13"], "collegabili": []}, "avvisi": []},
  {"chiave": "f3#1", "nomeFile": "x.xml", "tipo": "emessa", "numero": "60/2026", "controparte": {"nome": "Rossi Impianti Srl", "idSoggetto": "C002"}, "conti": {"totale": 100},
   "proposta": {"azione": "abbina", "certezza": "probabile", "idFattura": 20, "riferimento": "W-20", "alternative": [{"idFattura": 21, "riferimento": "W-21", "totale": 100}]}, "avvisi": []},
  {"chiave": "f4#1", "nomeFile": "IT00000000000_00045_RC_001.xml", "tipo": "esito", "esito": "consegnata", "nomeFileFattura": "IT00000000000_00045.xml",
   "proposta": {"azione": "abbina", "idFattura": 13, "riferimento": "W-13", "numero": "45/2026"}, "avvisi": []}],
 "scartati": [{"nomeFile": "foto.jpg", "motivo": "Non è un file di fattura: servono .xml, .p7m o .zip"}]}"""

    @Test
    fun `la lettura degli XML e le scelte di partenza, che non abbinano niente da sole se non è sicuro`() {
        val l = LetturaXml.daJson(JSONObject(lettura))
        assertEquals(7, l.documenti.size)
        assertEquals("foto.jpg", l.scartati[0].nomeFile)
        val s = l.documenti.associate { it.chiave to SceltaXml.iniziale(it) }
        // Sicura: abbina alla W-14, già scelta.
        assertEquals("abbina", s.getValue("f1.1#1").azione)
        assertEquals("14", s.getValue("f1.1#1").idFattura)
        assertTrue(s.getValue("f1.1#1").confermata)
        // Senza bozza: i collegabili spuntati (stesso importo) vanno con lei.
        assertEquals("senzaBozza", s.getValue("f1.2#1").azione)
        assertEquals(listOf("rapportino" to "RAP/2026/0007", "spesa" to "15"), s.getValue("f1.2#1").collega)
        // Ricevuta: nuova, con la categoria proposta.
        assertEquals("nuova", s.getValue("f1.3#1").azione)
        assertEquals("altro", s.getValue("f1.3#1").categoria)
        // Già importata: si salta.
        assertEquals("salta", s.getValue("f1.4#1").azione)
        // Diversa: non parte finché non si sceglie.
        assertFalse(s.getValue("f2#1").confermata)
        assertEquals(listOf("spesa:13"), s.getValue("f2#1").libera)
        assertEquals("Diversa", l.documenti[4].proposta.certezza.replaceFirstChar { it.uppercase() })
        // Probabile con due bozze uguali: aspetta che si scelga quale.
        assertFalse(s.getValue("f3#1").confermata)
        // Esito: sulla fattura.
        assertTrue(s.getValue("f4#1").confermata)
        val mandate = SceltaXml.daMandare(s.values)
        assertEquals(listOf("f1.1#1", "f1.2#1", "f1.3#1", "f4#1"), mandate.map { it.chiave })
        val j = mandate[1].perServer()
        assertEquals("senzaBozza", j.getString("azione"))
        assertEquals("RAP/2026/0007", j.getJSONArray("collega").getJSONObject(0).getString("id"))
        assertEquals(14L, (mandate[0].perServer().get("idFattura") as Number).toLong())
    }

    @Test
    fun `lo scadenziario della risposta vera torna giorno per giorno, saldo prudente e sotto soglia`() {
        val o = JSONObject("""{"ok": true, "oggi": "2026-10-22", "saldoOggi": 8743.55, "soglia": 3000, "saldoPartenza": 8743.55,
 "scaduti": [{"tipo": "fattura", "id": 12, "data": "2026-10-10", "verso": "entrata", "titolo": "39/2026 · Rossi Impianti Srl", "importo": 310.75, "stato": "scaduto", "contaNelSaldo": false}],
 "giorni": [
  {"data": "2026-10-26", "titolo": "Lunedì 26 ottobre", "saldo": 7893.55, "sottoSoglia": false, "righe": [{"tipo": "impegno", "id": 2, "verso": "uscita", "importo": 850, "stato": "previsto", "contaNelSaldo": true}]},
  {"data": "2026-11-16", "titolo": "Lunedì 16 novembre", "saldo": 4927.55, "sottoSoglia": false, "righe": [
    {"tipo": "ricevuta", "id": 1, "verso": "uscita", "importo": 486, "stato": "previsto", "contaNelSaldo": true},
    {"tipo": "impegno", "id": 26, "verso": "uscita", "importo": 2380, "stato": "previsto", "contaNelSaldo": true},
    {"tipo": "impegno", "id": 40, "verso": "uscita", "importo": 100, "stato": "proposto", "proposta": true, "contaNelSaldo": true}]},
  {"data": "2026-11-18", "titolo": "Mercoledì 18 novembre", "saldo": 6159.89, "sottoSoglia": false, "righe": [{"tipo": "fattura", "id": 13, "verso": "entrata", "importo": 1232.34, "stato": "previsto", "contaNelSaldo": true}]},
  {"data": "2026-11-30", "titolo": "Lunedì 30 novembre", "saldo": 2759.89, "sottoSoglia": true, "righe": [{"tipo": "impegno", "id": 27, "verso": "uscita", "importo": 3400, "stato": "previsto", "contaNelSaldo": true}]},
  {"data": "2026-12-16", "titolo": "Mercoledì 16 dicembre", "saldo": 2759.89, "sottoSoglia": true, "righe": [{"tipo": "impegno", "id": 28, "verso": "uscita", "importo": null, "importoDaScrivere": true, "stato": "previsto", "contaNelSaldo": false}]}],
 "senzaData": {"entrate": 4410, "voci": 3}, "primoSottoSoglia": "2026-11-30", "nota": "Gli incassi scaduti non entrano nel saldo previsto"}""")
        val s = Scadenziario.daJson(o)
        assertEquals(5, s.giorni.size)
        assertEquals(3, s.senzaDataVoci)
        assertEquals("Previsto", s.giorni[0].righe[0].parola)
        assertEquals("Proposta", s.giorni[1].righe[2].parola)
        // L'entrata scaduta non conta: si parte dal saldo di oggi.
        assertEquals(8743.55, s.partenzaRicalcolata(), 0.0)
        val rifatto = s.ricalcola()
        s.giorni.forEachIndexed { i, g ->
            assertEquals(g.data, g.saldo!!, rifatto[i].first, 0.0)
            assertEquals(g.data, g.sottoSoglia, rifatto[i].second)
        }
        // Un'uscita scaduta invece conta oggi.
        val conUscita = s.copy(scaduti = s.scaduti + RigaScadenziario("impegno", "9", "2026-10-16", "uscita", "F24", "", 500.0, "scaduto", false, true, false))
        assertEquals(8243.55, conUscita.partenzaRicalcolata(), 0.0)
    }

    @Test
    fun `l'XML da completare ricaricato per sbaglio non diventa mai una fattura emessa`() {
        val d = DocumentoXml.daJson(JSONObject("""{"chiave": "f1#1", "nomeFile": "Bozza W-17 Rossi Impianti Srl - non inviare.xml", "tipo": "emessa", "numero": "BOZZA",
            "proposta": {"azione": "abbina", "certezza": "certa", "idFattura": 17, "riferimento": "W-17"}}"""))
        assertTrue(d.bozzaDiWisper)
        val s = SceltaXml.iniziale(d)
        assertEquals("salta", s.azione)
        assertTrue(SceltaXml.daMandare(listOf(s)).isEmpty())
        // Anche rinominato: il numero BOZZA basta.
        assertTrue(DocumentoXml.daJson(JSONObject("""{"chiave": "f1#1", "nomeFile": "fattura.xml", "tipo": "emessa", "numero": "bozza"}""")).bozzaDiWisper)
        assertFalse(DocumentoXml.daJson(JSONObject("""{"chiave": "f1#1", "nomeFile": "IT00000000000_00046.xml", "tipo": "emessa", "numero": "46/2026"}""")).bozzaDiWisper)
    }

    @Test
    fun `i campi della fatturazione di cliente, commessa e fattura si leggono e si ricopiano`() {
        val c = Cliente.daJson(JSONObject("""{"id": "C002", "nome": "Rossi", "sostitutoImposta": false, "pagamentoGiorni": 60, "pagamentoFineMese": null}"""))
        assertTrue(c.fatturazioneLetta)
        assertEquals(false, c.sostitutoImposta)
        assertEquals(60, c.pagamentoGiorni)
        assertNull(c.pagamentoFineMese)
        assertEquals(c, Cliente.daJson(c.aJson()))
        // Una copia vecchia senza i campi: non letti, e non si riscrivono.
        val vecchio = Cliente.daJson(JSONObject("""{"id": "C002", "nome": "Rossi"}"""))
        assertFalse(vecchio.fatturazioneLetta)
        assertFalse(vecchio.aJson().has("sostitutoImposta"))
        assertEquals("corpo", Commessa.daJson(JSONObject("""{"id": "26ST003", "idCliente": "C002", "descrizione": "x", "modoFatturazione": "corpo"}""")).modoFatturazione)
        assertNull(Commessa.daJson(JSONObject("""{"id": "26ST003", "idCliente": "C002", "descrizione": "x"}""")).modoFatturazione)
        assertEquals(300.0, Fattura.daJson(JSONObject("""{"id": 18, "daRestituire": 300}""")).daRestituire!!, 0.0)
    }

    @Test
    fun `il nome dell'XML da completare dice sempre di non inviarlo`() {
        assertEquals("Bozza W-15 Rossi Impianti Srl - non inviare.xml", Pacchetto.nomeXmlSicuro("Bozza W-15 Rossi Impianti Srl - non inviare.xml", "W-15"))
        assertEquals("Bozza W-15 - non inviare.xml", Pacchetto.nomeXmlSicuro("", "W-15"))
        val n = Pacchetto.nomeXmlSicuro("IT00000000000_00015.xml", "W-15")
        assertTrue(n.contains("non inviare"))
        assertFalse(n.startsWith("IT"))
        assertEquals("Bozza W-1 a-b - non inviare.xml", Pacchetto.nomeXmlSicuro("Bozza W-1 a/b - non inviare.xml", "W-1"))
    }

    @Test
    fun `IBAN col controllo modulo 97 come il server`() {
        assertTrue(ContoBanca.ibanValido("IT60X0542811101000000123456"))
        assertTrue(ContoBanca.ibanValido("it60 x054 2811 1010 0000 0123 456"))
        assertFalse(ContoBanca.ibanValido("IT60X0542811101000000123457"))
        assertFalse(ContoBanca.ibanValido("IT60X05428111010000001234"))
    }

    @Test
    fun `le parole di stato hanno sempre il loro colore`() {
        assertEquals(ColoreStato.GRIGIO, ColoreStato.di("Bozza"))
        assertEquals(ColoreStato.BLU, ColoreStato.di("Pronta"))
        assertEquals(ColoreStato.BLU, ColoreStato.di("Pronta · già pagata"))
        assertEquals(ColoreStato.BLU, ColoreStato.di("Emessa"))
        assertEquals(ColoreStato.VERDE, ColoreStato.di("Pagata"))
        assertEquals(ColoreStato.AMBRA, ColoreStato.di("Pagata in parte"))
        assertEquals(ColoreStato.ROSSO, ColoreStato.di("Scaduta"))
        assertEquals(ColoreStato.GRIGIO, ColoreStato.di("Scartata"))
        assertEquals(ColoreStato.GRIGIO, ColoreStato.di("Annullata"))
    }

    @Test
    fun `fatturazione e banche solo col permesso dei soldi, e la dashboard coi numeri nuovi`() {
        val senzaSoldi = Permessi(mapOf(Moduli.FATTURAZIONE to 2, Moduli.BANCHE to 2, Moduli.COSTI to 0))
        assertFalse(senzaSoldi.vede(Moduli.FATTURAZIONE))
        assertFalse(senzaSoldi.vede(Moduli.BANCHE))
        val lettura = Permessi.iniziali(Ruoli.LETTURA)
        assertTrue(lettura.vede(Moduli.BANCHE))
        assertFalse(lettura.modifica(Moduli.BANCHE))
        assertFalse(Permessi.iniziali(Ruoli.COLLABORATORE).vede(Moduli.BANCHE))
        assertTrue(Permessi.iniziali(Ruoli.AMMINISTRAZIONE).modifica(Moduli.FATTURAZIONE))
        val d = Dashboard.daJson(JSONObject("""{"numeri": {"soldi": {"daFatturare": 2671.88, "clientiDaFatturare": 2, "fattureInBozza": 2389.37, "daIncassare": 1543.09,
            "scaduto": 310.75, "saldoConti": 8743.55, "incassiSettimana": 320.25, "pagamentiSettimana": 0, "saldoPrevisto30": 5285.59, "primoSottoSoglia": "2026-11-30"}}}"""))
        assertEquals(2, d.fase4!!.clientiDaFatturare)
        assertEquals(310.75, d.fase4.scaduto!!, 0.0)
        // Il collaboratore: niente soldi della fase 4.
        assertNull(Dashboard.daJson(JSONObject("""{"numeri": {"commesse": {"aperte": 3}}}""")).fase4)
    }

    @Test
    fun `regole fiscali confermate lette dalle impostazioni`() {
        assertFalse(RegoleFiscali.da(mapOf("REGOLE_FISCALI_CONFERMATE" to "")).confermate)
        assertFalse(RegoleFiscali.da(emptyMap()).confermate)
        val r = RegoleFiscali.da(mapOf("REGOLE_FISCALI_CONFERMATE" to """{"data":"2026-11-05","commercialista":"Studio di esempio","da":1}"""))
        assertTrue(r.confermate)
        assertEquals("Studio di esempio", r.commercialista)
        val p = RegoleFattura.parametriDa(mapOf("IVA" to "22", "EPPI_INTEGRATIVO" to "5", "BOLLO_RIVALSA" to "false", "REGIME_FISCALE" to "RF19"), ritenuta = false)
        assertEquals("forfettario", p.regime)
        assertFalse(p.bolloRivalsa)
    }
}
