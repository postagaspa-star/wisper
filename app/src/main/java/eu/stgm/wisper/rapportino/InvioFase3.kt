package eu.stgm.wisper.rapportino

import org.json.JSONObject
import java.io.File

/**
 * Come partono dalla coda le cose della fase 3 (ore, spese e scontrini), scritte
 * spesso in cantiere senza rete. Lo usa Archivio.mandaCoda, nell'ordine della
 * coda: una spesa nata qui parte prima del suo scontrino, e quando il server le
 * da' un id lo scontrino lo impara ([CodaInvii.completa]).
 *
 * SENZA DOPPIONI. Una riga nata qui parte col suo idLocale ("O-..." per le ore,
 * "S-..." per le spese), lo stesso a ogni tentativo: se la rete cade dopo che la
 * richiesta e' arrivata, il server la riconosce e risponde con quella invece di
 * crearne un'altra (architettura.md, "Senza doppioni dalla coda del telefono",
 * prima di §14.5). Le righe che il server conosce gia' partono col loro id.
 *
 * Se la riga era gia' arrivata ma qui e' stata cambiata intanto (il server non
 * applica le modifiche a una riga riconosciuta), l'operazione resta in coda con
 * l'id appena imparato e riparte subito come modifica.
 *
 * @param cartellaFoto dove resta la copia dello scontrino dopo l'invio (col nome del file sul server).
 */
class InvioFase3(
    private val ponte: PonteServer,
    private val coda: CodaInvii,
    private val cartellaFoto: File? = null,
) {
    /** Quello che e' arrivato, per aggiornare gli elenchi sul telefono. */
    sealed class Arrivato {
        data class Ore(val riga: RigaOre) : Arrivato()
        data class UnaSpesa(val spesa: Spesa) : Arrivato()
        data class Scontrino(val idSpesa: String, val file: FileRemoto) : Arrivato()
    }

    suspend fun esegui(op: CodaInvii.Operazione): Arrivato = when (op.tipo) {
        CodaInvii.Tipo.ORE -> ore(op)
        CodaInvii.Tipo.SPESA -> spesa(op)
        CodaInvii.Tipo.FOTO_SPESA -> scontrino(op)
        else -> throw IllegalArgumentException("Non è un'operazione della fase 3: ${op.tipo}")
    }

    private suspend fun ore(op: CodaInvii.Operazione): Arrivato {
        val (corpo, nuova) = corpoDaMandare(op)
        val s = ponte.salvaOreDallaCoda(corpo)
        // Gia' arrivata: se qui e' stata cambiata, quello che c'e' sul server e' la versione di prima.
        if (nuova && s.giaEsisteva && !oreCorrispondono(s.dato, corpo)) coda.impara(op.idOp, op.idLocale, s.dato.id)
        else coda.completa(op.idOp, op.corpo, op.idLocale, s.dato.id)
        return Arrivato.Ore(s.dato)
    }

    private suspend fun spesa(op: CodaInvii.Operazione): Arrivato {
        val (corpo, nuova) = corpoDaMandare(op)
        val s = ponte.salvaSpesa(corpo)
        // salvaSpesa non dice se era gia' arrivata: si guarda se dice le stesse cose del corpo.
        if (nuova && !speseCorrispondono(s, corpo)) coda.impara(op.idOp, op.idLocale, s.id)
        else coda.completa(op.idOp, op.corpo, op.idLocale, s.id)
        return Arrivato.UnaSpesa(s)
    }

    /** Il corpo con l'id del server, se la riga lo ha; altrimenti con l'idLocale (vero = creazione). */
    private fun corpoDaMandare(op: CodaInvii.Operazione): Pair<JSONObject, Boolean> {
        val corpo = op.corpoJson()
        val id = op.idRemoto.ifBlank { corpo.testo("id") }
        if (id.isNotBlank()) {
            corpo.put("id", PonteServer.idJson(id))
            corpo.remove("idLocale")
            return corpo to false
        }
        corpo.put("idLocale", op.idLocale)
        return corpo to true
    }

    private suspend fun scontrino(op: CodaInvii.Operazione): Arrivato {
        val idSpesa = op.idRemoto.ifBlank { op.idLocale.removePrefix("spesa:").takeIf { op.idLocale.startsWith("spesa:") }.orEmpty() }
        if (idSpesa.isBlank()) throw PonteServer.Rifiutato("La spesa di questo scontrino non è arrivata al server: scarta lo scontrino e rifai la spesa")
        val file = File(op.percorso)
        if (!file.exists()) throw PonteServer.Rifiutato("Lo scontrino non è più sul telefono")
        // Lo stesso idFile a ogni tentativo: il server non crea doppioni (§14.8).
        val f = ponte.caricaFotoSpesa(idSpesa, op.idFile, file)
        coda.completa(op.idOp, op.corpo, op.idLocale, idSpesa)
        // La copia resta sul telefono col nome del file sul server: si vede anche senza rete.
        if (cartellaFoto != null) runCatching { file.renameTo(File(cartellaFoto, "${f.id}.jpg")) }
        return Arrivato.Scontrino(idSpesa, f)
    }

    companion object {
        private fun uguali(a: String, b: String) = a.trim().equals(b.trim(), ignoreCase = true)

        /** La riga del server dice le stesse cose del corpo mandato? (Solo i campi che il corpo ha.) */
        fun oreCorrispondono(r: RigaOre, corpo: JSONObject): Boolean {
            val inizio = corpo.testo("inizio")
            val fine = corpo.testo("fine")
            val orari = if (inizio.isNotBlank() && fine.isNotBlank()) runCatching { ContiOreSpese.oreDaOrari(inizio, fine, corpo.numero("pausaMinuti") ?: 0.0) }.getOrNull() else null
            return (corpo.data("data") == null || r.data == corpo.data("data")) &&
                uguali(r.idCommessa, corpo.testo("idCommessa")) &&
                r.descrizione.trim() == corpo.testo("descrizione") &&
                r.fatturabile == corpo.vero("fatturabile") &&
                r.tipo == corpo.testo("tipo").ifBlank { RigaOre.ORDINARIA } &&
                (if (orari != null) r.inizio == orari.inizio && r.fine == orari.fine && r.pausaMinuti == orari.pausaMinuti
                else Math.abs(r.ore - (corpo.numero("ore") ?: r.ore)) < 0.005) &&
                (corpo.vero("bozza") == (r.stato == StatoVoce.BOZZA))
        }

        /** La spesa del server dice le stesse cose del corpo mandato? */
        fun speseCorrispondono(s: Spesa, corpo: JSONObject): Boolean {
            val destinazione = corpo.testo("destinazione").let { if (it == "mia") Destinazione.PERSONALE else it }
            return (corpo.data("data") == null || s.data == corpo.data("data")) &&
                (corpo.numero("importo") == null || Math.abs(s.importo - ContiOreSpese.centesimi(corpo.numero("importo")!!)) < 0.005) &&
                (!corpo.has("categoria") || s.categoria == corpo.testo("categoria").ifBlank { "altro" }) &&
                (!corpo.has("descrizione") || s.descrizione.trim() == corpo.testo("descrizione")) &&
                (destinazione.isBlank() || s.destinazione == destinazione) &&
                (!corpo.has("idCommessa") || uguali(s.idCommessa, corpo.testo("idCommessa"))) &&
                (!corpo.has("pagataDaMe") || s.pagataDaMe == corpo.vero("pagataDaMe")) &&
                (!corpo.has("anticipazione") || s.anticipazione == corpo.vero("anticipazione"))
        }
    }
}
