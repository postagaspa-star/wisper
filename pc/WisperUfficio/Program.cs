using System.Windows.Forms;

namespace WisperUfficio;

/// <summary>
/// Wisper Ufficio: il programma del computer. Commesse, rapportini, clienti, tariffe,
/// PDF e invii; il telefono serve a compilare i rapportini sul posto.
///
/// Opzioni, solo per le prove:
///   --dati CARTELLA            configurazione e copie in un'altra cartella
///   --foglio URL CODICE        collegamento al foglio senza salvarlo
///   --stampa-prova HTML PDF    stampa un documento col motore del programma ed esce
///                              (per capire, su un computer nuovo, se i PDF escono)
///   --aggiornamenti URL        un altro aggiornamento.json (le prove degli aggiornamenti)
///   --no-installa              parte da dov'è, senza installarsi
///   --installa-in CARTELLA     si installa lì invece che in Programs, Start e Desktop
///                              (le prove dell'installazione), senza toccare il registro
/// Quelle per sé: --attendi PID (il riavvio dopo un aggiornamento aspetta che il
/// programma vecchio si chiuda), --appena-installato (la prima apertura dopo
/// l'installazione lo dice nella pagina), --disinstalla (da App installate).
/// </summary>
internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        var appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "WisperUfficio");
        var locale = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WisperUfficio");
        string? url = null, codice = null;
        (string Html, string Pdf)? stampaProva = null;
        var indirizzoAggiornamenti = Aggiornamenti.IndirizzoPredefinito;
        int? attendi = null;
        var daRipetere = new List<string>();
        bool noInstalla = false, appenaInstallato = false, disinstalla = false;
        // Il doppio clic sul file dell'email ("Collega Wisper Ufficio.wisper") apre il
        // programma col percorso del file: si collega e il file non si ripete al riavvio.
        string? fileCollegamento = null;
        string? installaIn = null;
        // Per strumenti\rilascio.ps1, prima di pubblicare: esce con 3 se dentro c'è l'indirizzo
        // del foglio (un exe di casa), con 0 se no. Non apre niente e non si installa.
        if (args.Length == 1 && args[0] == "--indirizzo-incluso")
        {
            Environment.Exit(Configurazione.IndirizzoPredefinito.Length > 0 ? 3 : 0);
        }
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--attendi" && i + 1 < args.Length) { attendi = int.TryParse(args[++i], out var pid) ? pid : null; continue; }
            if (args[i] == "--appena-installato") { appenaInstallato = true; continue; }
            if (args[i] == "--disinstalla") { disinstalla = true; continue; }
            if (args[i].EndsWith(Collegamento.Estensione, StringComparison.OrdinalIgnoreCase) && File.Exists(args[i])) { fileCollegamento = args[i]; continue; }
            var prima = i;
            if (args[i] == "--no-installa") noInstalla = true;
            else if (args[i] == "--installa-in" && i + 1 < args.Length) installaIn = Path.GetFullPath(args[++i]);
            else if (args[i] == "--dati" && i + 1 < args.Length) appData = locale = Path.GetFullPath(args[++i]);
            else if (args[i] == "--foglio" && i + 2 < args.Length) { url = args[++i]; codice = args[++i]; }
            else if (args[i] == "--stampa-prova" && i + 2 < args.Length) stampaProva = (Path.GetFullPath(args[++i]), Path.GetFullPath(args[++i]));
            else if (args[i] == "--aggiornamenti" && i + 1 < args.Length) indirizzoAggiornamenti = args[++i];
            // Al riavvio dopo un aggiornamento si riparte con le stesse opzioni.
            for (int k = prima; k <= i; k++) daRipetere.Add(args[k]);
        }

        Directory.CreateDirectory(locale);
        Log.File = Path.Combine(locale, "registro.txt");

        // Si installa (e si aggiorna da solo) solo il programma in un file solo, quello che si
        // distribuisce: una build di sviluppo ha le sue dll accanto e un exe da solo non basterebbe.
#pragma warning disable IL3000 // in un file solo Location è vuoto: è proprio quello che si controlla
        var unFileSolo = string.IsNullOrEmpty(typeof(Program).Assembly.Location);
#pragma warning restore IL3000
        var luoghi = installaIn != null ? Installazione.Luoghi.DiProva(installaIn) : Installazione.Luoghi.Normali();
        if (disinstalla)
        {
            Installazione.Disinstalla(luoghi);
            MessageBox.Show("Wisper Ufficio è stato tolto da questo computer." + Environment.NewLine + @"I PDF in Documenti\Wisper restano dove sono.",
                "Wisper Ufficio", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        if (unFileSolo && !noInstalla && stampaProva == null && Environment.ProcessPath is string questo &&
            Installazione.InstallaSeServe(questo, luoghi, daRipetere))
        {
            return;
        }

        // Dopo un aggiornamento: si aspetta che il programma vecchio abbia chiuso la finestra.
        if (attendi is int vecchio)
        {
            try { using var p = System.Diagnostics.Process.GetProcessById(vecchio); p.WaitForExit(30_000); }
            catch (ArgumentException) { /* già chiuso */ }
        }

        // Il file dell'email si usa subito, prima di guardare se il programma è già aperto:
        // se lo è, si accorge da solo del collegamento nuovo (Configurazione.RileggiSeCambiato).
        var collegatoDaFile = false;
        if (fileCollegamento != null)
        {
            var errore = Collegamento.Importa(fileCollegamento, new Configurazione(Path.Combine(appData, "configurazione.json")));
            if (errore != null)
            {
                MessageBox.Show(errore, "Wisper Ufficio", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            collegatoDaFile = true;
        }

        // Un Wisper Ufficio alla volta per cartella di dati: due finestre sullo
        // stesso foglio salverebbero una sopra l'altra.
        // (string.GetHashCode cambia a ogni avvio in .NET: serve un'impronta stabile.)
        var impronta = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(appData.ToLowerInvariant())))[..12];
        using var unico = new Mutex(true, @"Local\WisperUfficio-" + impronta, out var primo);
        // Dopo un aggiornamento il programma vecchio può metterci un po' a lasciare il posto.
        if (!primo && attendi != null)
        {
            try { primo = unico.WaitOne(TimeSpan.FromSeconds(30)); }
            catch (AbandonedMutexException) { primo = true; }
        }
        if (!primo)
        {
            MessageBox.Show(collegatoDaFile
                ? "Wisper Ufficio è collegato al foglio. Torna alla sua finestra e premi Riprova, o aprilo di nuovo."
                : "Wisper Ufficio è già aperto.", "Wisper Ufficio", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        Log.Info("avvio " + typeof(Program).Assembly.GetName().Version?.ToString(3) + " da " + Environment.ProcessPath);

        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Log.Errore("eccezione non gestita", e.Exception);

        var config = new Configurazione(Path.Combine(appData, "configurazione.json"));
        if (url != null && codice != null) config.Imposta(url, codice);
        var foglio = new Foglio(config);
        var documenti = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Wisper");
        var ponte = new Ponte(config, foglio, Path.Combine(locale, "file"), documenti);
        var cartellaUi = Path.Combine(AppContext.BaseDirectory, "ui");

        ponte.AppenaInstallato = appenaInstallato;
        ponte.AppenaCollegato = collegatoDaFile;
        var aggiornamenti = new Aggiornamenti(indirizzoAggiornamenti, unFileSolo && stampaProva == null ? Environment.ProcessPath : null);
        ponte.Aggiornamenti = aggiornamenti;
        ponte.ArgomentiDiAvvio = daRipetere;
        aggiornamenti.Avvia();

        Application.Run(new Finestra(ponte, cartellaUi, Path.Combine(locale, "WebView2"), stampaProva));
    }
}
