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
        versionCode = 1
        versionName = "0.1.0"

        // Indirizzo dell'Apps Script che scrive sul foglio Google.
        buildConfigField("String", "SHEET_URL", "\"${chiave("sheetUrl")}\"")
        // Chiave del riconoscimento/AI (si riempie domani, quando sappiamo quale porta usiamo).
        buildConfigField("String", "AI_KEY", "\"${chiave("aiKey")}\"")

        // Vosk porta la sua libreria nativa per QUATTRO architetture: da sole
        // pesano 35 MB, e tre non servono. Ogni telefono uscito dal 2017 in poi
        // e' arm64. Conseguenza voluta: l'app non gira sull'emulatore, che per
        // la parte audio era comunque inutilizzabile.
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    buildTypes {
        release {
            // R8 rompe le cose in modi che scopri solo sull'APK finale, e non
            // avremmo il tempo di diagnosticarli. APK piu' grosso, va benissimo.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)

    implementation("${libs.vosk.android.get()}@aar")
    implementation("${libs.jna.get()}@aar")

    debugImplementation(libs.androidx.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.org.json)
}
