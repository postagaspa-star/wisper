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
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--dati" && i + 1 < args.Length) appData = locale = Path.GetFullPath(args[++i]);
            else if (args[i] == "--foglio" && i + 2 < args.Length) { url = args[++i]; codice = args[++i]; }
            else if (args[i] == "--stampa-prova" && i + 2 < args.Length) stampaProva = (Path.GetFullPath(args[++i]), Path.GetFullPath(args[++i]));
        }

        // Un Wisper Ufficio alla volta per cartella di dati: due finestre sullo
        // stesso foglio salverebbero una sopra l'altra.
        // (string.GetHashCode cambia a ogni avvio in .NET: serve un'impronta stabile.)
        var impronta = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(appData.ToLowerInvariant())))[..12];
        using var unico = new Mutex(true, @"Local\WisperUfficio-" + impronta, out var primo);
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

        Application.Run(new Finestra(ponte, cartellaUi, Path.Combine(locale, "WebView2"), stampaProva));
    }
}
