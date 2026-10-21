package eu.stgm.wisper.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Le icone a tratto del prototipo (docs/prototipo), le stesse del computer.
 * Disegnate qui da poche righe di tracciato: le icone di Material che servono
 * (fotocamera, scontrino, nuvola) stanno nel pacchetto esteso, che pesa
 * diversi megabyte per sei disegni.
 */
object Icone {
    private fun tratto(nome: String, spessore: Float, vararg tracciati: String): ImageVector =
        ImageVector.Builder(nome, 24.dp, 24.dp, 24f, 24f).apply {
            tracciati.forEach { d ->
                addPath(
                    pathData = addPathNodes(d),
                    fill = null,
                    stroke = SolidColor(Color.Black),
                    strokeLineWidth = spessore,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                )
            }
        }.build()

    val piu = tratto("piu", 2.4f, "M12 5v14M5 12h14")
    val meno = tratto("meno", 2.6f, "M5 12h14")
    val chiudi = tratto("chiudi", 2.4f, "M6 6l12 12M18 6L6 18")
    val indietro = tratto("indietro", 2.4f, "M15 5l-7 7 7 7")
    val freccia = tratto("freccia", 2.4f, "M9 6l6 6-6 6")
    val frecciaSinistra = tratto("frecciaSinistra", 2.6f, "M15 6l-6 6 6 6")
    val spunta = tratto("spunta", 3f, "M5 12.5l4.5 4.5L19 7.5")
    val copia = tratto(
        "copia", 2.2f,
        "M10.5 8h7A2.5 2.5 0 0 1 20 10.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 8 17.5v-7A2.5 2.5 0 0 1 10.5 8z",
        "M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2",
    )
    val calendario = tratto(
        "calendario", 2.2f,
        "M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5z",
        "M8 3v4M16 3v4M4 10h16",
    )
    val cerca = tratto("cerca", 2.4f, "M11 4.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13z", "M20 20l-4-4")
    val firma = tratto("firma", 2.2f, "M4 20c2-6 6-6 8-3s6 3 8-3", "M14 4l6 6-9 9H5v-6z")
    val nuvola = tratto(
        "nuvola", 2.2f,
        "M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8a4 4 0 0 1 .5 7.97",
        "M12 12v8M9 15l3-3 3 3",
    )
    val fotocamera = tratto(
        "fotocamera", 2f,
        "M4 8h3l2-3h6l2 3h3v11H4z",
        "M12 9.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z",
    )
    val scontrino = tratto("scontrino", 2f, "M6 3h12v18l-3-2-3 2-3-2-3 2z", "M9 8h6M9 12h6")
    val galleria = tratto(
        "galleria", 2f,
        "M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4z",
        "M4 16l5-5 4 4 2-2 5 5",
    )
    val avviso = tratto("avviso", 2.2f, "M12 4l9 16H3z", "M12 10v4M12 17h.01")
    val matita = tratto("matita", 2.2f, "M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4")

    // L'ufficio sul telefono (docs/prototipo/TelefonoUfficio.html)
    val oggi = tratto(
        "oggi", 2.2f,
        "M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z", "M8 3v4M16 3v4M4 10h16",
        "M12 13.4a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 1 1 0-3.2z",
    )
    val rapportini = tratto("rapportini", 2.2f, "M7 3h7l4 4v14H7z", "M14 3v4h4M10 12h5M10 16h5")
    val ufficio = tratto(
        "ufficio", 2.2f,
        "M6 7h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3z",
        "M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18",
    )
    val altro = tratto("altro", 3.2f, "M5 12h.01M12 12h.01M19 12h.01")
    val giu = tratto("giu", 2.4f, "M6 9l6 6 6-6")
    val invia = tratto("invia", 2.2f, "M4 12l16-8-6 16-2-7z")
    val condividi = tratto(
        "condividi", 2.2f,
        "M18 2.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z", "M6 9.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z",
        "M18 16.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z", "M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4",
    )
    val pdf = tratto("pdf", 2.2f, "M7 3h7l4 4v14H7z", "M14 3v4h4", "M9.5 15.5h5")
    val carica = tratto("carica", 2.2f, "M12 16V4M7 9l5-5 5 5", "M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3")
    val cestino = tratto("cestino", 2.2f, "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3")
    val pausa = tratto("pausa", 2.2f, "M7.5 5h1a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 8.5 19h-1A1.5 1.5 0 0 1 6 17.5v-11A1.5 1.5 0 0 1 7.5 5z", "M15.5 5h1A1.5 1.5 0 0 1 18 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 15.5 5z")
    val lucchetto = tratto("lucchetto", 2.2f, "M8 11h8a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3z", "M8 11V8a4 4 0 0 1 8 0v3")
    val riapri = tratto("riapri", 2.2f, "M4 12a8 8 0 0 1 14-5.3L20 9", "M20 4v5h-5", "M20 12a8 8 0 0 1-14 5.3L4 15")
    val indietroStato = tratto("indietroStato", 2.2f, "M9 14L4 9l5-5", "M4 9h11a5 5 0 0 1 0 10h-3")
    val ingranaggio = tratto(
        "ingranaggio", 2.2f,
        "M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6z",
        "M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1",
    )
    val persone = tratto(
        "persone", 2.2f,
        "M9 4.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z", "M2.5 20a6.5 6.5 0 0 1 13 0",
        "M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6",
    )
    val cartella = tratto("cartella", 2.2f, "M5 5h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z")
}
