package eu.stgm.wisper.rapportino

import androidx.core.content.FileProvider

/**
 * L'indirizzo dei PDF per le altre app (Stampa.apri e Stampa.condividi): cacheDir/pdf
 * e basta (res/xml/percorsi_pdf.xml). Un provider a parte da quello delle foto, così
 * chi riceve un PDF non arriva agli scatti, e la fotocamera non arriva ai PDF.
 */
class StampaFile : FileProvider()
