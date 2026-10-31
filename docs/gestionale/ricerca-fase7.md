# Ricerca per la fase 7: portale clienti, WhatsApp e comunicazioni

Appunti della ricerca fatta il 22/10/2026 prima di scrivere [`fase7.md`](fase7.md). Ogni punto ha la fonte; dove una pagina
non si apriva o non diceva una cosa è scritto **non verificato**. Le citazioni sono brevi; il resto è riassunto con
parole nostre. Le scelte che ne nascono sono in `fase7.md` §2 e §3.

## 1. Come fanno gli altri: portali clienti

### 1.1 Pleya (il riferimento delle specifiche)

- Il **portale clienti** c'è, con logo, colori e dominio dello studio, anche sui PDF e nelle email. Al cliente mostra
  "cosa deve firmare, cosa deve pagare, cosa ha aperto": preventivi da vedere e firmare, fatture con scadenza e stato,
  ore di assistenza usate e residue, DDT e rapportini da approvare, documenti condivisi, ticket con tutta la
  conversazione. https://pleya.it/funzionalita/portale-clienti
- **Accesso a un documento solo**: il cliente riceve un link (o inquadra un QR sul PDF), senza registrarsi, e firma col
  dito dal telefono. Come si entra nel portale completo e quanto durano i link non è descritto (**non verificato**).
  https://pleya.it/funzionalita/portale-clienti
- **Preventivi**: le alternative stanno nello stesso documento e il cliente sceglie quale accettare; un preventivo
  accettato diventa un progetto. https://pleya.it/funzionalita/preventivi-e-assistenza
- **Ticket**: il cliente li apre dal portale con gli allegati; stati mostrati "aperti, in lavorazione, risolti".
  https://pleya.it/funzionalita/ticketing
- **Documenti**: il link apre il file solo a chi ha diritto di vederlo. https://pleya.it/funzionalita/documenti
- Pleya è in accesso anticipato (lancio generale annunciato per gennaio 2027).

### 1.2 Programmi per installatori e assistenza tecnica

- **Jobber**: niente password, il cliente entra da un link per email o SMS; dopo 14 giorni dall'ultimo link chiede di
  nuovo l'email. Il preventivo si approva con un pulsante, poi firma disegnata o nome scritto (la firma è facoltativa:
  di base spenta). Il cliente riceve un'email di conferma, la ditta un avviso. Le **voci facoltative** si spuntano e il
  totale si aggiorna; quelle non scelte restano sul PDF in grigio, "non incluse".
  https://help.getjobber.com/en/articles/what-do-your-clients-see-in-client-hub/ ·
  https://help.getjobber.com/en/articles/quote-approvals/ ·
  https://help.getjobber.com/en/articles/optional-line-items-on-quotes/
- **Housecall Pro**: il link d'accesso per email vale 7 giorni; un link scaduto ne fa partire uno nuovo da solo. Firma
  del preventivo: nome, firma scritta o disegnata, casella "accetto di fare affari per via elettronica"; il PDF firmato
  porta IP, data e ora e va per email a tutti e due.
  https://help.housecallpro.com/en/articles/8448657-using-the-customer-portal ·
  https://help.housecallpro.com/en/articles/10040275-e-signatures-on-estimates
- **ServiceTitan**: "Sign & Accept"; sul computer si firma scrivendo il nome, sul telefono col dito. I file del lavoro
  si vedono solo se segnati "per il cliente".
  https://help.servicetitan.com/docs/the-new-customer-portal-end-user-experience
- **Tradify**: il cliente accetta, rifiuta o commenta da un link; non può accettare un preventivo scaduto o annullato.
  https://help.tradifyhq.com/hc/en-us/articles/360016571573
- **simPRO**: il cliente firma scrivendo il nome e può aggiungere il suo numero d'ordine (validità del link **non
  verificata**). https://helpguide.simprogroup.com/Content/Service-and-Enterprise/Quote-acceptance-online.htm

Cosa ne prendiamo: un solo link per email, nessuna password; due ingressi (portale completo e "dritto al documento");
voci facoltative con il totale che si aggiorna; firma con nome, tratto, casella delle condizioni e traccia (IP, ora);
email di conferma al cliente; il preventivo scaduto non si accetta.

### 1.3 Programmi di assistenza (help desk)

- **Zendesk**: al cliente tre stati soli (aperta, aspetta la tua risposta, risolta) che raccolgono gli stati interni;
  si può dare al cliente un nome diverso per uno stato. Il cliente risponde e allega file.
  https://support.zendesk.com/hc/en-us/articles/4408825864858 ·
  https://support.zendesk.com/hc/en-us/articles/4412575861018 ·
  https://support.zendesk.com/hc/en-us/articles/4408846805530
- **Jira Service Management**: per ogni tipo di richiesta ci sono nomi di stato pensati per il cliente; più stati
  interni finiscono sotto un nome solo. "Nota interna" e "Rispondi al cliente" sono due azioni separate.
  https://confluence.atlassian.com/servicemanagementserver0515/setting-up-request-types-1364724326.html ·
  https://confluence.atlassian.com/jirakb/customers-not-receiving-email-notification-when-changing-internal-comment-to-public-comment-1271267736.html
- **Freshdesk**: allegati fino a 20 MB per conversazione. https://support.freshdesk.com/support/solutions/articles/196643

Cosa ne prendiamo: il cliente vede **parole sue** (Ricevuta, Presa in carico, Intervento fissato, Risolta), mai le note
interne; le risposte al cliente sono una cosa diversa dalla cronologia interna.

### 1.4 Programmi italiani

- **Fatture in Cloud**: accettazione online del preventivo non trovata; c'è l'avviso quando il cliente apre l'email.
  https://www.fattureincloud.it/software-fatturazione/preventivi/
- **TeamSystem BPM Service**: ticket da email, sito e portale clienti, con i tempi promessi.
  https://www.teamsystem.com/construction/bpm-service/funzionalita/
- Nessuno dei programmi visti usa un codice OTP per accettare un preventivo: tutti usano la firma semplice con la traccia.

## 2. Sicurezza di un portale piccolo

### 2.1 OWASP

- **Sessioni**: identificativo casuale (almeno 64 bit); inattività 15-30 minuti per rischio basso, 2-5 per valore alto;
  scadenza assoluta 4-8 ore; identificativo nuovo dopo l'ingresso; cookie `Secure`, `HttpOnly`, `SameSite` (Strict o
  Lax), prefisso `__Host-` con `Path=/`; mai token nel `localStorage`; `Cache-Control: no-store`; all'uscita la sessione
  si chiude sul server. https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- **Link di recupero** (vale per i link d'accesso): token da generatore sicuro, monouso, legato alla persona, con
  scadenza; stessa risposta e stessi tempi che l'indirizzo esista o no; `Referrer-Policy: no-referrer`; mai costruire
  il link dall'intestazione Host. https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- **Autenticazione**: messaggi generici; limite ai tentativi contato per persona, non solo per IP. Non tratta i link
  magici. https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- **CSRF**: token legato alla sessione; `Sec-Fetch-Site` e poi `Origin` come controllo; SameSite è una difesa in più;
  mai cambiare qualcosa con una GET.
  https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- **Intestazioni**: HSTS, `X-Frame-Options: DENY` e `frame-ancestors`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, COOP e CORP; togliere `X-Powered-By`. https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- **Caricamento di file**: elenco chiuso di estensioni (attenzione alle doppie estensioni), il tipo dichiarato dal
  browser "è facile da falsificare", controllo dei primi byte, file rinominati con un id, limiti di grandezza, salvati
  fuori dalle pagine e serviti da un gestore che passa dall'id al file, antivirus o sandbox, niente ZIP.
  https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- **ASVS 5.0**: estensione **e** primi byte (5.2.2), nome del file nel `Content-Disposition` (5.4.1), antivirus sui file
  serviti (5.4.3). Codici monouso: generatore sicuro, almeno 6 cifre, **al massimo 10 minuti**, legati alla richiesta
  che li ha fatti nascere, con limite ai tentativi (6.5.1-6.5.5, 6.6.2-6.6.3). Al livello più alto (L3) l'email non vale
  come fattore di autenticazione (6.3.6). https://github.com/OWASP/ASVS/blob/master/5.0/en/0x14-V5-File-Handling.md ·
  https://github.com/OWASP/ASVS/blob/master/5.0/en/0x15-V6-Authentication.md
- **SVG**: forzare lo scaricamento può non bastare; meglio non accettarli. https://mantisbt.org/bugs/view.php?id=30384

### 2.2 NIST SP 800-63B

- Rev. 4 (dal 1/8/2025): l'**email non è ammessa** come autenticatore "fuori banda" per i livelli AAL; i codici monouso
  valgono 10 minuti, almeno 6 cifre, con limite ai tentativi (al massimo 100 errori di fila); un codice di recupero per
  email vale al massimo 24 ore. https://pages.nist.gov/800-63-4/sp800-63b.html (rev. 3:
  https://pages.nist.gov/800-63-3/sp800-63b.html)
- Detto con onestà: entrare con un link o un codice per email è una scelta di comodità; per NIST non è un'autenticazione
  di livello AAL2. Per un portale con i documenti del cliente stesso, senza pagamenti e senza dati dello studio, è il
  compromesso che usano Jobber, Housecall Pro, Slack e simili (fase7.md §3.4).

### 2.3 I filtri delle email aziendali consumano i link

- **Microsoft Defender (Safe Links)** apre in anticipo i link delle email che arrivano, per controllarli
  ("detonated asynchronously in the background"). https://learn.microsoft.com/en-us/defender-office-365/safe-links-about
- Succede con Mimecast e Proofpoint (Outlook): un link monouso aperto dal filtro non vale più quando arriva la persona.
  https://github.com/orgs/supabase/discussions/41618 ·
  https://thepluginpeople.atlassian.net/wiki/spaces/JEMHC/pages/3856236545/Security+Scanners+consuming+one+time+links ·
  https://stytch.com/docs/b2b/guides/magic-links/protected-eml
- Rimedio usato da tutti: la GET mostra una pagina con un pulsante; il link si consuma solo con la POST del pulsante.
  I clienti di Manuel sono aziende con Microsoft 365: il problema è concreto.

### 2.4 Tailscale Funnel

- Solo porte **443, 8443, 10000**, solo TLS; Funnel è "available for all plans" ma è ancora in beta; ha limiti di banda
  non configurabili e **senza numeri pubblicati**. https://tailscale.com/docs/features/tailscale-funnel
- Il TLS finisce sul nodo (nel NAS): i relay di Tailscale non decifrano, le chiavi nascono in locale.
  https://tailscale.com/kb/1153/enabling-https
- **Piano gratuito (Personal)**: 0 $, fino a 6 utenti, dispositivi illimitati, ma "only suitable for non-commercial use";
  un tailnet con un dominio aziendale è considerato uso commerciale. **Standard: 8 $ per utente al mese**, dispositivi
  degli utenti illimitati; si pagano i posti, non i dispositivi. https://tailscale.com/pricing ·
  https://tailscale.com/kb/1251/pricing-faq
- Configurazione nel contenitore (`TS_SERVE_CONFIG`): `TCP` → `443: {HTTPS: true}`, `Web` → gestori per percorso,
  `AllowFunnel` **per host:porta** (non per percorso: tutti i percorsi di quella porta diventano pubblici). Con un
  percorso diverso da `/` il prefisso viene tolto prima di passare al server (`http.StripPrefix`, dal codice).
  https://raw.githubusercontent.com/tailscale/tailscale/main/ipn/serve.go ·
  https://raw.githubusercontent.com/tailscale/tailscale/main/cmd/containerboot/serve.go ·
  https://tailscale.com/docs/features/containers/docker/docker-params
- Intestazioni che aggiunge (dal codice): `X-Forwarded-For` con l'IP di chi chiama (sostituito, non accodato),
  `X-Forwarded-Proto: https`, `X-Forwarded-Host`, e `Tailscale-Funnel-Request: ?1` sul traffico che arriva da internet;
  le intestazioni d'identità in arrivo da fuori vengono tolte. https://tailscale.com/kb/1312/serve
- I certificati dei nomi `*.ts.net` finiscono nei registri pubblici **Certificate Transparency**: il nome della macchina
  e del tailnet diventano pubblici. https://tailscale.com/kb/1153/enabling-https
- Due contenitori Tailscale con `TS_HOSTNAME` e `TS_STATE_DIR` propri = due nodi con due indirizzi; senza cartella di
  stato persistente a ogni riavvio nasce un nodo nuovo. https://tailscale.com/docs/features/containers/docker/docker-params
- Nodo spento: cosa vede chi apre l'indirizzo **non è documentato** (non verificato).

### 2.5 Strade che non toccano i DNS di stgm.eu

- **Cloudflare Tunnel** vuole "a domain on Cloudflare": un dominio **nuovo e separato** con i nameserver su Cloudflare
  non tocca stgm.eu. Si crea anche da riga di comando (`cloudflared tunnel create`). Gratis sul piano Free secondo guide
  di terzi; se il pannello Zero Trust chieda la carta **non verificato** (per Prospector la chiedeva Cloudflare Access).
  Cloudflare termina il TLS: vede il contenuto. https://developers.cloudflare.com/tunnel/get-started/ ·
  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/local-management/create-local-tunnel
- I **tunnel rapidi** (`trycloudflare`) sono "for testing and development", con un nome che cambia a ogni avvio: non
  vanno bene. https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
- Un dominio separato costa poco: `.com` circa 10 $ l'anno da Cloudflare; `.eu` circa 5,5 $ e `.it` circa 5-7 $ l'anno
  da altri registrar (Cloudflare non vende `.it` né `.eu`). https://priceworld.com/domains/cloudflare/ ·
  https://www.cloudflare.com/tld-policies/ · https://domainoffer.net/tld/eu · https://domainoffer.net/tld/it

### 2.6 Antivirus sul NAS

- **Synology Antivirus Essential**: motore ClamAV, scansioni pianificate di cartelle scelte, solo i file nuovi o
  cambiati, salta i file oltre 2 GB, RAM minima 1 GB. Gratuito secondo fonti di terzi (la pagina Synology non lo dice).
  https://www.synology.com/en-us/dsm/7.2/software_spec/antivirus_essential ·
  https://mariushosting.com/should-i-install-antivirus-package-on-my-synology-nas/
- **ClamAV in Docker** vuole 3-4 GB di RAM (le firme da sole 1,2 GB). https://docs.clamav.net/manual/Installing/Docker.html

## 3. WhatsApp

- **Clicca per chattare**: `https://wa.me/<numero>?text=<testo codificato>`; numero internazionale completo, senza `+`,
  senza zeri davanti, senza spazi né trattini. Funziona su telefono e su WhatsApp Web. Limite di lunghezza del testo
  **non documentato**. https://faq.whatsapp.com/5913398998672934
- **Android**: WhatsApp documenta `ACTION_SEND` con il pacchetto `com.whatsapp`; aprire `https://wa.me/...` con
  `ACTION_VIEW` funziona ma non è descritto da WhatsApp. WhatsApp Business è `com.whatsapp.w4b` (fonti di terzi). Da
  Android 11, per sapere se un'app c'è serve dichiararla in `<queries>` nel manifest.
  https://faq.whatsapp.com/android/28000012 · https://developer.android.com/training/basics/intents/package-visibility
- **Computer**: `whatsapp://send` per WhatsApp Desktop **non è documentato**; la strada documentata è wa.me (WhatsApp Web
  o l'app, se si prende il link).
- **Regole d'uso**: le condizioni per l'Europa vietano gli account creati in automatico e rimandano alle linee guida
  sui messaggi; la versione precedente vietava invii di massa, automatici e l'uso non personale non autorizzato.
  https://www.whatsapp.com/legal/terms-of-service-eea · https://www.whatsapp.com/legal/updates/terms-of-service-eea
- **WhatsApp Business app** (gratis): solo uso commerciale, niente messaggi non richiesti, rispettare chi chiede di non
  essere più contattato, i permessi dei clienti sono a carico dell'azienda. Le regole sui messaggi aziendali: si scrive
  solo a chi ha dato il numero e ha accettato di ricevere messaggi.
  https://www.whatsapp.com/legal/WhatsApp-Terms-for-WhatsApp-Business-App · https://business.whatsapp.com/policy ·
  https://blog.whatsapp.com/introducing-the-whats-app-business-app
- **WhatsApp Business Platform (API)**: dal 1/7/2025 si paga a messaggio (marketing, utility, autenticazione, servizio),
  con prezzi propri per l'Italia; dal 1/10/2026 i messaggi di servizio sono gratis fino a 1.000 al mese per numero. Prezzi
  per l'Italia da fonti di terzi: marketing circa 0,08 $, utility e autenticazione circa 0,036 $, servizio circa 0,03 $ a
  messaggio (**listino Meta non verificato**). Servono un portafoglio aziendale Meta, un numero, modelli approvati per
  scrivere fuori dalla finestra di 24 ore, un **webhook raggiungibile da internet** per i messaggi in arrivo; limite
  iniziale 250 destinatari al giorno. https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing ·
  https://developers.facebook.com/docs/whatsapp/cloud-api/get-started ·
  https://developers.facebook.com/docs/whatsapp/messaging-limits · https://chatalog.ai/en/pricing-whatsapp-conversation-fees-2025/ ·
  https://www.courier.com/tools/whatsapp-pricing-calculator
- **Telegram Bot API**: gratis ("at no cost") salvo invii oltre 30 messaggi al secondo; riceve i messaggi anche con il
  long polling, quindi il NAS non deve essere raggiungibile da fuori; servono una privacy policy e il rispetto del GDPR.
  https://core.telegram.org/bots/faq · https://core.telegram.org/bots/api · https://telegram.org/tos/bot-developers

## 4. Email dal postino (Apps Script)

- Destinatari al giorno: **100 per un account gmail.com**, 1.500 per Google Workspace; allegati fino a 25 MB.
  https://developers.google.com/apps-script/guides/services/quotas
- Workspace ha l'accordo sul trattamento dei dati (Google responsabile per conto del cliente); per il Gmail gratuito un
  accordo non l'abbiamo trovato su pagine Google (lo dice solo una fonte di terzi).
  https://workspace.google.com/terms/dpa_terms.html · https://support.google.com/google-workspace-individual/answer/10757067 ·
  https://www.simpleanalytics.com/is-gdpr-compliant/gmail

## 5. Privacy e norme

- **Cookie**: linee guida del Garante del 10/06/2021: i cookie tecnici non chiedono consenso; con soli cookie tecnici
  basta l'informativa, senza banner. https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876
- **Informativa** (art. 13 GDPR): titolare e contatti, finalità e base giuridica, interesse legittimo se usato,
  destinatari, trasferimenti fuori UE, conservazione, diritti, reclamo al Garante. Se i dati arrivano dall'azienda
  cliente e non dalla persona, vale l'art. 14. https://gdpr-text.com/it/read/article-13/
- **Base giuridica per i dipendenti dei clienti**: il contratto (art. 6.1.b) copre solo chi ne è parte; per i referenti
  delle aziende si usa di solito l'interesse legittimo (art. 6.1.f), con un bilanciamento scritto.
  https://stibbe.com/publications-and-insights/can-you-rely-on-your-contract-to-process-personal-data ·
  https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2024/guidelines-12024-processing-personal-data-based_en
- **Firma elettronica semplice** (un clic, il nome scritto, la firma col dito): non le si possono negare effetti solo
  perché è elettronica (eIDAS art. 25; Corte di giustizia UE C-302/23); in giudizio è "liberamente valutabile" per
  sicurezza, integrità e immodificabilità (CAD art. 20 c. 1-bis). Solo le firme avanzate e qualificate valgono come
  scrittura privata (art. 2702 c.c.). https://www.agendadigitale.eu/documenti/il-valore-probatorio-del-documento-informatico-cosa-dice-la-normativa/ ·
  https://www.dirittobancario.it/wp-content/uploads/2024/10/Corte-di-Giustizia-UE-Sez.-X-17-ottobre-2024-causa-C-302_23.pdf
- **Conservazione**: art. 2220 c.c., 10 anni dall'ultima registrazione per le scritture, le fatture e le lettere (anche
  le copie di quelle spedite). https://brocardi.it/codice-civile/libro-quinto/titolo-ii/capo-iii/sezione-iii/art2220.html
- **Solleciti di pagamento**: provvedimento del Garante del 30/11/2005 sul recupero crediti: vietato far sapere del
  debito a familiari, colleghi o vicini; solo i dati necessari, rispetto della dignità. Parla alle società di recupero,
  ma i principi valgono anche per chi sollecita da sé.
  https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/1213644 · https://www.garanteprivacy.it/temi/recupero-crediti
- **Interessi di mora tra imprese e professionisti** (D.Lgs. 231/2002): partono da soli dal giorno dopo la scadenza
  (di base 30 giorni dalla fattura), tasso BCE + 8 punti (10,40% nel secondo semestre 2026, fonte secondaria), più 40 €
  di costi di recupero. https://www.fiscoetasse.com/files/3127/appendice-normativa-dlgs-231-2002-dopo-le-modifiche.pdf ·
  https://www.fiscal-focus.it/quotidiano/il-quotidiano/articoli-fisco/ritardi-nei-pagamenti-interessi-di-mora-al-10-40-dal-1deg-luglio-2026,3,186713
- **Registro degli accessi** (IP): nessuna regola specifica per un sito; 6-12 mesi sono prassi. Vicino: per gli
  amministratori di sistema il Garante chiede almeno sei mesi.
  https://www.sentinelone.com/it/cybersecurity-101/cybersecurity/what-is-an-access-log/ · https://www.pmi.it/?p=198894
- **Preventivo del professionista** (DL 1/2012 art. 9 c. 4, come cambiato dalla L. 124/2017): obbligatorio "in forma
  scritta o digitale", con voci, oneri, complessità e polizza. La forma dell'accettazione non è regolata (**non
  verificato** sul testo ufficiale e sui codici deontologici).
  https://www.ecnews.it/fiscale/professionisti/professionisti-obbligo-preventivo-scritto-digitale/

## 6. Un assistente con un modello a pagamento: quanto costerebbe

- Prezzi Anthropic (dollari per milione di token, entrata / uscita): **Claude Haiku 5.5** 0,10 / 0,50 (richieste fino a
  100.000 token), Claude Haiku 4.5 1 / 5. https://platform.claude.com/docs/en/about-claude/pricing
- OpenAI: gpt-5-nano 0,05 / 0,40 (letto da un riassunto della pagina). https://developers.openai.com/api/docs/pricing
- Dati: con le API Anthropic richieste e risposte si cancellano entro 30 giorni e non servono all'addestramento senza
  permesso; con OpenAI log fino a 30 giorni. Resta un trasferimento di dati dei clienti fuori UE da mettere
  nell'informativa e in un accordo. https://privacy.claude.com/en/articles/7996866 ·
  https://developers.openai.com/api/docs/guides/your-data
- Conto di massima: una domanda con 20.000 token di dati e 600 di risposta su Haiku 5.5 costa circa 0,0023 $; 500 domande
  al mese circa 1,2 $. Il costo non è il problema; lo sono i dati dei clienti mandati fuori (fase7.md §3.17).
