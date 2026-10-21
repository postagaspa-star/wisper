import java.io.FileInputStream
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Le chiavi vivono FUORI dal repo e fuori da OneDrive, in C:\Users\andre\wisper-keys\.
// Se il file manca, l'app compila lo stesso: le chiavi diventano stringhe vuote e
// i pezzi che le usano si spengono da soli. Non deve mai rompersi la build.
val chiaviFile = file("C:/Users/andre/wisper-keys/wisper.properties")
val chiavi = Properties().apply {
    if (chiaviFile.exists()) FileInputStream(chiaviFile).use { load(it) }
}
fun chiave(nome: String): String = chiavi.getProperty(nome) ?: ""

android {
    namespace = "eu.stgm.wisper"
    compileSdk = 35

    defaultConfig {
        applicationId = "eu.stgm.wisper"
        minSdk = 26
        targetSdk = 35
        // Il codice decide gli aggiornamenti: quello pubblicato deve essere più alto di quello installato.
        // (-PcodiceVersione=4 -PnomeVersione=0.4.0 solo per provare gli aggiornamenti sull'emulatore.)
        versionCode = (project.findProperty("codiceVersione") as String?)?.toInt() ?: 8
        versionName = (project.findProperty("nomeVersione") as String?) ?: "0.4.0"

        // Indirizzo dell'Apps Script che fa da ponte col foglio Google, e il
        // codice senza il quale lo script non risponde (lo crea preparaFoglio()).
        // Sono solo i valori di partenza: dalle impostazioni dell'app si cambiano
        // senza ricompilare, per esempio se il codice va rifatto.
        //
        // NELL'APK CHE SI PUBBLICA NON CI SONO: le release di GitHub sono pubbliche, e
        // da un APK si legge tutto. Ci sono nelle build di prova (debug, sotto) e, solo
        // se lo si chiede con -PconIndirizzo, in un APK da installare a mano su un
        // telefono di casa. Il telefono li salva al primo avvio (Configurazione.kt),
        // quindi gli aggiornamenti senza indirizzo non lo scollegano.
        val conIndirizzo = project.hasProperty("conIndirizzo")
        buildConfigField("String", "SHEET_URL", "\"${if (conIndirizzo) chiave("sheetUrl") else ""}\"")
        buildConfigField("String", "SHEET_CODICE", "\"${if (conIndirizzo) chiave("sheetCodice") else ""}\"")

        // L'elenco firmato delle versioni (NuoveVersioni.kt). Per le prove se ne usa
        // un altro: ./gradlew assembleDebug -PaggiornamentiUrl=http://10.0.2.2:8767/aggiornamento.json
        val aggiornamenti = (project.findProperty("aggiornamentiUrl") as String?)
            ?: "https://github.com/postagaspa-star/wisper/releases/latest/download/aggiornamento.json"
        buildConfigField("String", "AGGIORNAMENTI_URL", "\"$aggiornamenti\"")
    }

    // La firma delle versioni da distribuire: sempre la stessa, o Android non accetta
    // gli aggiornamenti. La chiave vive in wisper-keys; senza, l'APK release esce non firmato.
    val archivioChiavi = chiave("releaseStoreFile").takeIf { it.isNotBlank() }?.let { file(it) }?.takeIf { it.exists() }
    signingConfigs {
        if (archivioChiavi != null) create("release") {
            storeFile = archivioChiavi
            storePassword = chiave("releaseStorePassword")
            keyAlias = chiave("releaseKeyAlias")
            keyPassword = chiave("releaseKeyPassword")
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "SHEET_URL", "\"${chiave("sheetUrl")}\"")
            buildConfigField("String", "SHEET_CODICE", "\"${chiave("sheetCodice")}\"")
        }
        release {
            // R8 rompe le cose in modi che scopri solo sull'APK finale, e non
            // avremmo il tempo di diagnosticarli. APK piu' grosso, va benissimo.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (archivioChiavi != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions { jvmTarget = "11" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }

    // Il modello vocale del primo Wisper (Vosk, 88 MB) puo' essere ancora nella
    // cartella assets di chi l'aveva scaricato. Non serve piu', e dentro l'APK
    // lo porterebbe da una decina di MB a sessanta.
    androidResources { ignoreAssetsPatterns += listOf("!modello-it") }
}

// I PDF del telefono (rapportino/Stampa.kt) escono dagli stessi modelli di Wisper
// Ufficio: a ogni build si copiano da pc/ui negli asset dell'app, in ufficio/.
// Una sola sorgente: si cambia documenti.js e cambiano computer e telefono insieme.
abstract class CopiaModelliPdf : DefaultTask() {
    @get:InputFile @get:PathSensitive(PathSensitivity.NONE) abstract val documenti: RegularFileProperty
    @get:InputFile @get:PathSensitive(PathSensitivity.NONE) abstract val conti: RegularFileProperty
    @get:InputFile @get:PathSensitive(PathSensitivity.NONE) abstract val carattere: RegularFileProperty
    @get:OutputDirectory abstract val cartella: DirectoryProperty

    @TaskAction
    fun copia() {
        val ufficio = cartella.get().asFile.resolve("ufficio")
        documenti.get().asFile.copyTo(ufficio.resolve("documenti.js"), overwrite = true)
        conti.get().asFile.copyTo(ufficio.resolve("conti.js"), overwrite = true)
        carattere.get().asFile.copyTo(ufficio.resolve("font/Figtree.ttf"), overwrite = true)
    }
}

androidComponents {
    onVariants { variant ->
        val ui = rootProject.layout.projectDirectory.dir("pc/ui")
        val copia = tasks.register<CopiaModelliPdf>("copiaModelliPdf" + variant.name.replaceFirstChar { it.uppercase() }) {
            documenti.set(ui.file("documenti.js"))
            conti.set(ui.file("conti.js"))
            carattere.set(ui.file("font/Figtree.ttf"))
        }
        variant.sources.assets?.addGeneratedSourceDirectory(copia, CopiaModelliPdf::cartella)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.icons)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    implementation(libs.androidx.work.runtime)

    debugImplementation(libs.androidx.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.org.json)
}
