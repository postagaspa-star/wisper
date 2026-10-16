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
/// E una per sé: --attendi PID, la usa il riavvio dopo un aggiornamento per
/// aspettare che il programma vecchio si chiuda.
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
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--attendi" && i + 1 < args.Length) { attendi = int.TryParse(args[++i], out var pid) ? pid : null; continue; }
            var prima = i;
            if (args[i] == "--dati" && i + 1 < args.Length) appData = locale = Path.GetFullPath(args[++i]);
            else if (args[i] == "--foglio" && i + 2 < args.Length) { url = args[++i]; codice = args[++i]; }
            else if (args[i] == "--stampa-prova" && i + 2 < args.Length) stampaProva = (Path.GetFullPath(args[++i]), Path.GetFullPath(args[++i]));
            else if (args[i] == "--aggiornamenti" && i + 1 < args.Length) indirizzoAggiornamenti = args[++i];
            // Al riavvio dopo un aggiornamento si riparte con le stesse opzioni.
            for (int k = prima; k <= i; k++) daRipetere.Add(args[k]);
        }

        // Dopo un aggiornamento: si aspetta che il programma vecchio abbia chiuso la finestra.
        if (attendi is int vecchio)
        {
            try { using var p = System.Diagnostics.Process.GetProcessById(vecchio); p.WaitForExit(30_000); }
            catch (ArgumentException) { /* già chiuso */ }
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
            MessageBox.Show("Wisper Ufficio è già aperto.", "Wisper Ufficio", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        Directory.CreateDirectory(locale);
        Log.File = Path.Combine(locale, "registro.txt");
        Log.Info("avvio " + typeof(Program).Assembly.GetName().Version?.ToString(3));

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

        // Si aggiorna da solo solo il programma in un file solo (quello che si distribuisce):
        // una build di sviluppo ha le sue dll accanto, e un exe nuovo da solo non le sostituirebbe.
#pragma warning disable IL3000 // in un file solo Location è vuoto: è proprio quello che si controlla
        var unFileSolo = string.IsNullOrEmpty(typeof(Program).Assembly.Location);
#pragma warning restore IL3000
        var aggiornamenti = new Aggiornamenti(indirizzoAggiornamenti, unFileSolo && stampaProva == null ? Environment.ProcessPath : null);
        ponte.Aggiornamenti = aggiornamenti;
        ponte.ArgomentiDiAvvio = daRipetere;
        aggiornamenti.Avvia();

        Application.Run(new Finestra(ponte, cartellaUi, Path.Combine(locale, "WebView2"), stampaProva));
    }
}
