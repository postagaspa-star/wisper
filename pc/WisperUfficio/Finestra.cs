using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Text;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace WisperUfficio;

/// <summary>
/// La finestra: una WebView2 che mostra l'interfaccia HTML (pc/ui) da
/// https://wisper.locale/, come Pactum. In più tiene una seconda WebView nascosta
/// che serve solo a stampare i PDF: si carica il documento, si stampa, si butta.
/// </summary>
public sealed class Finestra : Form, Ponte.IFinestra
{
    private readonly Ponte ponte;
    private readonly string cartellaUi;
    private readonly string cartellaDatiWebView;
    private readonly WebView2 vista;
    private CoreWebView2Environment? ambiente;

    /// <summary>La WebView invisibile dei PDF, creata alla prima stampa.</summary>
    private CoreWebView2Controller? stampante;

    /// <summary>I documenti in attesa di stampa, serviti a /stampa/{id}.html.</summary>
    private readonly Dictionary<string, byte[]> daStampare = new();

    private readonly SemaphoreSlim unaStampaAllaVolta = new(1, 1);

    /// <summary>--stampa-prova: il documento da stampare e dove, poi si esce.</summary>
    private readonly (string Html, string Pdf)? stampaProva;

    public Finestra(Ponte ponte, string cartellaUi, string cartellaDatiWebView, (string Html, string Pdf)? stampaProva = null)
    {
        this.stampaProva = stampaProva;
        this.ponte = ponte;
        this.cartellaUi = cartellaUi;
        this.cartellaDatiWebView = cartellaDatiWebView;
        ponte.Finestra = this;

        Text = "Wisper Ufficio";
        Icon = Icona();
        AutoScaleMode = AutoScaleMode.Dpi;
        AutoScaleDimensions = new SizeF(96F, 96F);
        ClientSize = new Size(1280, 820);
        MinimumSize = new Size(900, 600);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(0xF6, 0xF7, 0xF9);

        vista = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor };
        Controls.Add(vista);
        Load += async (_, _) => await InizializzaAsync();
    }

    private async Task InizializzaAsync()
    {
        try
        {
            ambiente = await CoreWebView2Environment.CreateAsync(null, cartellaDatiWebView);
            await vista.EnsureCoreWebView2Async(ambiente);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MostraMessaggio("Per aprire Wisper Ufficio serve Microsoft Edge WebView2, che su Windows 11 c'è sempre.");
            return;
        }
        catch (Exception e)
        {
            Log.Errore("WebView2 non avviata", e);
            MostraMessaggio("La finestra di Wisper Ufficio non si è aperta. Il motivo è nel registro.");
            return;
        }

        var core = vista.CoreWebView2;
        // Dopo un aggiornamento la WebView servirebbe dalla cache i file vecchi.
        await core.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache | CoreWebView2BrowsingDataKinds.CacheStorage);
#if !DEBUG
        core.Settings.AreDevToolsEnabled = false;
#endif
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreHostObjectsAllowed = false;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        // Niente SetVirtualHostNameToFolderMapping (provato in Pactum: con la mappatura
        // WebResourceRequested non scatta più). Tutto https://wisper.locale/ passa da qui.
        core.AddWebResourceRequestedFilter(Ponte.Origine + "/*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += SuRichiesta;
        core.NavigationStarting += SuNavigazione;
        core.NewWindowRequested += SuNuovaFinestra;

        if (stampaProva is { } prova)
        {
            var riuscita = await StampaAsync(await File.ReadAllTextAsync(prova.Html), prova.Pdf);
            Log.Info("stampa di prova " + (riuscita ? "riuscita: " : "FALLITA: ") + prova.Pdf);
            Environment.ExitCode = riuscita ? 0 : 1;
            Close();
            return;
        }
        core.Navigate(Ponte.Origine + "/index.html");
    }

    private async void SuRichiesta(object? mittente, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var rinvio = e.GetDeferral();
        try
        {
            var metodo = e.Request.Method;
            var uri = new Uri(e.Request.Uri);
            if (uri.AbsolutePath.StartsWith("/stampa/", StringComparison.Ordinal))
            {
                var id = Path.GetFileNameWithoutExtension(uri.AbsolutePath);
                e.Response = daStampare.TryGetValue(id, out var html)
                    ? Risposta(200, "text/html; charset=utf-8", html)
                    : Risposta(404, "text/plain", Encoding.UTF8.GetBytes("non trovato"));
                return;
            }
            if (Ponte.ÈFile(uri))
            {
                var (s, mime, dati) = await ponte.FileAsync(uri);
                e.Response = Risposta(s, mime, dati, cache: true);
                return;
            }
            if (!Ponte.ÈApi(uri))
            {
                var file = metodo is "GET" or "HEAD" ? Ponte.FileDellInterfaccia(cartellaUi, uri.AbsolutePath) : null;
                e.Response = file != null && File.Exists(file)
                    ? Risposta(200, Ponte.TipoContenuto(file), File.ReadAllBytes(file))
                    : Risposta(404, "text/plain", Encoding.UTF8.GetBytes("non trovato"));
                return;
            }
            string? corpo = null;
            if (e.Request.Content != null)
            {
                using var lettore = new StreamReader(e.Request.Content, Encoding.UTF8);
                corpo = await lettore.ReadToEndAsync();
            }
            var (stato, json) = await ponte.GestisciAsync(metodo, uri, corpo);
            e.Response = Risposta(stato, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
        }
        catch (Exception ex)
        {
            Log.Errore("richiesta dell'interfaccia", ex);
            e.Response = Risposta(500, "application/json; charset=utf-8", Encoding.UTF8.GetBytes("{\"ok\":false,\"errore\":\"Errore interno del programma\"}"));
        }
        finally
        {
            rinvio.Complete();
        }
    }

    private CoreWebView2WebResourceResponse Risposta(int stato, string tipo, byte[] dati, bool cache = false) =>
        ambiente!.CreateWebResourceResponse(
            new MemoryStream(dati), stato, stato < 400 ? "OK" : "Error",
            $"Content-Type: {tipo}\r\nCache-Control: {(cache ? "max-age=31536000" : "no-store")}\r\nX-Content-Type-Options: nosniff");

    private void SuNavigazione(object? mittente, CoreWebView2NavigationStartingEventArgs e)
    {
        if (Ponte.ÈInterno(e.Uri)) return;
        e.Cancel = true;
        ApriFuori(e.Uri);
    }

    private void SuNuovaFinestra(object? mittente, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        ApriFuori(e.Uri);
    }

    private static void ApriFuori(string indirizzo)
    {
        if (!Ponte.ApribileFuori(indirizzo)) return;
        try
        {
            Process.Start(new ProcessStartInfo(new Uri(indirizzo).AbsoluteUri) { UseShellExecute = true })?.Dispose();
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            Log.Errore("link esterno non aperto", e);
        }
    }

    // ---------------------------------------------------------------- PDF

    /// <summary>
    /// Stampa un documento HTML in PDF con la WebView nascosta. Le immagini (/file/...)
    /// passano dallo stesso ponte, quindi le foto e le firme di Drive ci sono.
    /// Il formato (A4, margini, "Pagina X / Y") lo decide il CSS del documento.
    /// </summary>
    public async Task<bool> StampaAsync(string html, string percorso)
    {
        if (ambiente == null) return false;
        await unaStampaAllaVolta.WaitAsync();
        var id = Guid.NewGuid().ToString("N");
        try
        {
            if (stampante == null)
            {
                stampante = await ambiente.CreateCoreWebView2ControllerAsync(Handle);
                stampante.IsVisible = false;
                stampante.Bounds = new Rectangle(0, 0, 900, 1200);
                var core = stampante.CoreWebView2;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsScriptEnabled = false;   // il documento è HTML fisso: niente script
                core.AddWebResourceRequestedFilter(Ponte.Origine + "/*", CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += SuRichiesta;
                core.NavigationStarting += (_, e) => { if (!Ponte.ÈInterno(e.Uri)) e.Cancel = true; };
            }
            daStampare[id] = Encoding.UTF8.GetBytes(html);
            var caricata = new TaskCompletionSource<bool>();
            void Fatto(object? s, CoreWebView2NavigationCompletedEventArgs e) => caricata.TrySetResult(e.IsSuccess);
            stampante.CoreWebView2.NavigationCompleted += Fatto;
            try
            {
                stampante.CoreWebView2.Navigate($"{Ponte.Origine}/stampa/{id}.html");
                if (!await caricata.Task.WaitAsync(TimeSpan.FromSeconds(60))) return false;
            }
            finally
            {
                stampante.CoreWebView2.NavigationCompleted -= Fatto;
            }

            var impostazioni = ambiente.CreatePrintSettings();
            impostazioni.ShouldPrintBackgrounds = true;
            impostazioni.ShouldPrintHeaderAndFooter = false;
            impostazioni.PageWidth = 8.27;    // A4 in pollici
            impostazioni.PageHeight = 11.69;
            impostazioni.MarginTop = impostazioni.MarginBottom = impostazioni.MarginLeft = impostazioni.MarginRight = 0;
            impostazioni.Orientation = CoreWebView2PrintOrientation.Portrait;
            return await stampante.CoreWebView2.PrintToPdfAsync(percorso, impostazioni);
        }
        catch (Exception e)
        {
            Log.Errore("PDF non creato", e);
            return false;
        }
        finally
        {
            daStampare.Remove(id);
            unaStampaAllaVolta.Release();
        }
    }

    // ---------------------------------------------------------------- file

    public (string Nome, byte[] Dati)? ScegliFile(string filtro)
    {
        using var finestra = new OpenFileDialog
        {
            Title = filtro == "immagini" ? "Scegli un'immagine" : "Scegli un file",
            Filter = filtro == "immagini"
                ? "Immagini (*.png;*.jpg;*.jpeg)|*.png;*.jpg;*.jpeg"
                : "Documenti e immagini|*.pdf;*.png;*.jpg;*.jpeg;*.doc;*.docx;*.xls;*.xlsx|Tutti i file|*.*",
            Multiselect = false,
        };
        if (finestra.ShowDialog(this) != DialogResult.OK) return null;
        return (Path.GetFileName(finestra.FileName), File.ReadAllBytes(finestra.FileName));
    }

    private void MostraMessaggio(string testo)
    {
        Controls.Clear();
        Controls.Add(new Label
        {
            Text = testo,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 11F),
            Padding = new Padding(40),
        });
    }

    /// <summary>L'icona: il cerchio giallo del primo Wisper su fondo scuro, disegnata qui per non portarsi dietro un .ico.</summary>
    private static Icon Icona()
    {
        using var bmp = new Bitmap(64, 64);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            using var fondo = new SolidBrush(Color.FromArgb(0x07, 0x08, 0x0A));
            g.FillEllipse(fondo, 2, 2, 60, 60);
            using var giallo = new SolidBrush(Color.FromArgb(0xFF, 0xC5, 0x3D));
            for (int i = 0; i < 8; i++)
            {
                var a = i * Math.PI / 4;
                g.FillEllipse(giallo, (float)(32 + 19 * Math.Cos(a) - 4.5), (float)(32 + 19 * Math.Sin(a) - 4.5), 9, 9);
            }
            using var bianco = new SolidBrush(Color.FromArgb(0xF2, 0xF4, 0xF7));
            g.FillEllipse(bianco, 25, 25, 14, 14);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }
}
