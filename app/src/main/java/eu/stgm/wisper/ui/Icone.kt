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
}
