# Fase 5: ricerca (documenti, ticket e assistenza)

Appunti raccolti il 22/10/2026 per scrivere [`fase5.md`](fase5.md). Le regole tecniche e normative qui sotto sono
quelle trovate nelle fonti: **vanno confermate con Manuel** (elenco in fondo, §6) prima di metterle come valori
proposti in Wisper. Wisper non decide niente di normativo: propone una scadenza, chi la conferma è il perito.

## 1. Come presentano ticket e assistenza i programmi di riferimento

**Pleya** (il riferimento delle specifiche), pagina Ticket e assistenza (https://pleya.it/funzionalita/ticketing):
- una coda sola con tre stati, **aperti, in lavorazione, risolti**; ogni ticket ha priorità, assegnatario, tipo e
  cliente;
- la coda mette in cima "ciò che è urgente adesso", non l'ultimo arrivato;
- tempi di risposta e di risoluzione "misurati, non stimati"; nessuna soglia SLA descritta;
- ticket dei clienti (dal portale), ticket interni e richieste al supporto nella stessa coda;
- la pagina non descrive collegamenti espliciti a interventi, rapportini o fatturazione: qui Wisper deve fare di più,
  perché le specifiche lo chiedono (§4: "un ticket deve poter generare un intervento con ore, spese, rapportino e
  successiva fatturazione").

**TeamSystem BPM Service** (gestionale per installatori e manutentori,
https://www.teamsystem.com/construction/bpm-service/funzionalita/):
- ticket inseriti a mano dall'operatore o da email, sito, portale; priorità; tempi di presa in carico e di chiusura
  per "il rispetto degli SLA contrattuali";
- le **richieste di intervento** nascono da tre strade: ticket, **piani dei contratti**, inserimento a mano; il
  tecnico si assegna dal calendario, che propone gli orari liberi;
- il tecnico chiude dall'agenda con attività, ricambi, spese e checklist, **firma del cliente** e PDF del rapporto;
- **contratti di manutenzione**: canone periodico, "generazione piano interventi" (le richieste nascono da sole),
  rinnovi e piani di fatturazione del canone;
- la **scheda dell'asset** (l'impianto del cliente) tiene ubicazione, componenti, garanzie, allegati e lo **storico**
  di ticket, interventi e ricambi;
- l'intervento si contabilizza con commessa, tariffa e condizioni di addebito.

**Programmi di field service esteri** (contratti con visite periodiche):
- FieldPulse (https://help.fieldpulse.com/en/articles/5722045-maintenance-agreements): le visite del contratto si
  creano da un modello e si tengono **12 mesi avanti**, e nascono **senza data** (da pianificare); l'impianto è
  legato al contratto e ogni visita resta nel suo storico;
- Odoo, modulo delle visite ricorrenti
  (https://apps.odoo.com/apps/modules/19.0/us_service_contract_recurring_visit_scheduler): dalla frequenza del
  contratto (mensile, trimestrale, semestrale, annuale) e dal periodo nascono gli ordini di lavoro; una visita oltre
  la data diventa "mancata";
- Microsoft Dynamics 365 Field Service: l'accordo dice frequenza, durata, persone e servizi, e da lì nascono ordini
  e prenotazioni.

**Priorità** (ITIL, https://blog.invgate.com/itil-priority-matrix e
https://support.deskpro.com/it/kb/articles/pdf/creating-an-impact-urgency-and-priority-matrix): la priorità nasce
dall'incrocio di **impatto** (quanto è grave: quante persone o quanta produzione ferma) e **urgenza** (per quando
serve). ITIL non fissa tempi: le soglie di risposta e risoluzione le decide l'organizzazione (o il contratto).

**Cosa ne prende Wisper**
1. Una coda sola, in ordine di urgenza vera (priorità, poi tempo che resta), con le parole di Pleya: *Aperto*, *In
   carico*, *Risolto*, più *In attesa* e *Chiuso* che servono alla fatturazione.
2. La priorità non si sceglie da una tendina: si risponde a **due domande semplici** ("L'impianto è fermo?" e "Per
   quando?") e la priorità esce dalla matrice; si può cambiare.
3. Due tempi misurati, uguali a quelli di Pleya e BPM: **presa in carico** e **intervento**; più la **chiusura**.
4. L'intervento si pianifica **nel calendario della fase 2** (un'attività legata al ticket), non in un'agenda nuova.
5. Le visite dei contratti nascono da sole **da pianificare** con un anticipo (30 giorni), una alla volta come le
   ricorrenze della fase 2 (si vede la prossima, non dieci).
6. La scheda dell'impianto diventa lo **storico**: ticket, rapportini, documenti, verifiche e contratti in una riga
   del tempo.

## 2. Come presentano i documenti i gestionali e le regole sul controllo dei documenti

**Pleya**, pagina Documenti (https://pleya.it/funzionalita/documenti):
- i documenti si generano da **modelli componibili a blocchi** (intestazione, premessa, righe, condizioni, firme);
  una volta pubblicato un modello, "ogni documento esce con la stessa impaginazione"; logo, colori e dati dello
  studio vengono dalle impostazioni;
- archivio con **categorie** decise dall'azienda, documenti aziendali e personali separati, **copia automatica su
  Google Drive**;
- "Chi apre un collegamento a un file è chi ha diritto di vederlo"; avviso **prima che i documenti scadano**;
  presa visione con la data;
- la pagina non descrive le revisioni.

**Controllo dei documenti** (ISO 9001 §7.5.3, riassunti in https://www.thecoresolution.com/clause-7-5-3-iso-90012015-explained
e https://www.folderit.com/?p=68170):
- un documento si **riesamina e approva prima di usarlo**;
- le **versioni superate** non si buttano: si conservano **segnate come superate**, perché nessuno le usi per
  sbaglio;
- serve la storia: chi ha sostituito cosa, quando e con cosa.

**Cosa ne prende Wisper**
1. Ogni documento ha le sue **revisioni** (rev. 0, 1, 2...): l'ultima approvata è **Valida**, le vecchie restano
   da aprire con la pillola **Superata**, una nuova in attesa è **Da approvare** e non sostituisce la valida finché
   non è approvata.
2. L'approvazione si decide **per categoria** (progetti, dichiarazioni, relazioni sì; foto e corrispondenza no) e
   vale per chi non approva (come le ore della fase 3).
3. I modelli dei PDF restano **impaginati nel codice** (come Pleya: "stessa impaginazione"), e si possono cambiare i
   **testi** (condizioni, lettere, email) con i segnaposti; i dati dello studio vengono da Amministrazione.
4. Le scadenze dei documenti avvisano prima, nella Dashboard.

## 3. Collegarsi agli archivi che ci sono già (OneDrive, SharePoint, Google Drive)

- **Sfogliare le cartelle da dentro Wisper** vuol dire usare le interfacce di Microsoft e Google. Il selettore di
  OneDrive e SharePoint (File Picker v8) chiede di **registrare un'applicazione in Microsoft Entra**, si basa su
  Microsoft Graph e a volte vuole l'**approvazione di un amministratore** dell'organizzazione la prima volta
  (https://learn.microsoft.com/onedrive/developer/controls/file-pickers,
  https://changelog.keboola.com/onedrive-file-picker-upgraded-to-microsofts-latest-version/). Non costa soldi (Graph
  è compreso in Microsoft 365, l'API di Google Drive è gratuita entro le quote), ma servono: un'app registrata nel
  Microsoft 365 di Manuel e una su Google Cloud, il consenso, e **chiavi che si rinnovano da tenere sul NAS**. È
  lavoro della fase 8 (Integrazioni), dove le specifiche lo mettono.
- **La strada semplice, gratuita e sicura che c'è già**: il **collegamento** (il link di condivisione che OneDrive,
  SharePoint e Google Drive danno con "Copia collegamento"). Wisper salva il link e il tipo; aprirlo apre OneDrive o
  Drive, che decidono loro chi può vedere. Sul telefono si arriva col **Condividi** di Android: chi riceve un testo
  `text/plain` riceve il link (https://developer.android.com/training/sharing/send; la fase 4 usa già
  "Condividi → Wisper" per gli XML). Nessuna chiave, nessun costo, nessun permesso nuovo.
- **I permessi dei link restano di Microsoft e Google**: in SharePoint e OneDrive l'amministratore decide se i link
  "Chiunque" sono permessi e se i link "Persone nell'organizzazione" scadono (da 7 a 720 giorni, una regola nuova del
  2026: https://blog-en.topedia.com/?p=64550, https://blog.admindroid.com/configure-expiration-policy-for-sharepoint-people-in-your-organization-sharing-links/).
  Quindi Wisper non può promettere che un collegamento si apra per un cliente: lo dice il tipo di link scelto in
  OneDrive.
- Un percorso di una cartella sincronizzata (`C:\Users\…\OneDrive - …\Commesse\26ST003`) funziona solo sul computer
  dove c'è quella cartella: va bene sul computer dello studio, non sul telefono.

## 4. Scadenze normative tipiche per un perito industriale elettrotecnico (da confermare con Manuel)

- **DPR 462/2001, verifiche periodiche** degli impianti di messa a terra e dei dispositivi contro le scariche
  atmosferiche: **ogni 5 anni**, **ogni 2 anni** nei cantieri, nei locali a uso medico e negli ambienti a maggior
  rischio in caso d'incendio; ogni 2 anni anche gli impianti nei luoghi con pericolo di esplosione. Le fanno **ASL,
  ARPA o gli organismi abilitati** dal Ministero, che danno il verbale al datore di lavoro, che lo conserva
  (testo del decreto: https://www.bosettiegatti.eu/INFO/norme/statali/2001_0462.htm; riassunto regionale:
  https://www.regione.piemonte.it/governo/bollettino/abbonati/2002/15/attach/circo.doc; guida CEI 0-14 per
  l'interpretazione: https://www.certifico.com/impianti/documenti-impianti/documenti-impianti-riservati/guida-cei-0-14-verifica-impianti-di-terra-dpr-462-01).
  Per lo studio è un **promemoria per il cliente** (e magari un incarico di assistenza alla verifica), non una
  verifica che fa lui. Da confermare: chi chiama l'organismo, se lo studio accompagna, se c'è una verifica
  straordinaria dopo modifiche.
- **DM 37/2008, dichiarazione di conformità** (DiCo): la rilascia l'**impresa installatrice** (modello allegato I);
  allegati obbligatori: progetto, relazione coi tipi di materiali, schema dell'impianto, riferimenti a dichiarazioni
  precedenti, certificato dei requisiti tecnico-professionali
  (https://certifico.com/impianti/documenti-impianti/documenti-impianti-riservati/dm-37-2008-allegati-obbligatori-dico-impianti).
  **Non scade**: in Wisper è un documento con allegati (il progetto, lo schema), non una scadenza. Per gli impianti
  di prima del 2008 senza DiCo vale la **dichiarazione di rispondenza** (DiRi, art. 7 comma 6) firmata da un
  professionista iscritto all'albo (con esperienza nel settore: requisito da confermare); il perito la firma, quindi
  è una categoria con approvazione.
- **Cabine MT del cliente**: la manutenzione segue la norma **CEI 78-17** (che ha sostituito la CEI 0-15; variante
  2020 con schede semplificate per gli indennizzi ARERA,
  https://content.voltimum.com/it/5545/voltimum_ppt_manutenzione_cabine-sessione-1.pdf, https://www.certifico.com/id/5474);
  le **verifiche delle protezioni** generale e d'interfaccia (SPG, SPI) sono **quinquennali** secondo la delibera
  ARERA 786/2016 citata nelle fonti. Le fonti non sono concordi sui dettagli (cabine "semplificate", dichiarazione di
  adeguatezza): **tutto da confermare con Manuel**, che di cabine ne fa.
- **Polizza professionale** (già in fase 2: `POLIZZA_*` e l'attività ricorrente "Rinnovo polizza"), certificati di
  **taratura degli strumenti** (fase 6, Mezzi e attrezzature: per ora una scadenza di un documento dello studio).

**Cosa ne prende Wisper**: le scadenze sono **proposte** (tipo, ogni quanti mesi, preavviso) e si cambiano; la
periodicità del DPR 462 si propone dall'**ambiente** dell'impianto (ordinario 60 mesi; cantiere, medico, incendio,
esplosione 24 mesi); la DiCo non ha scadenza; nessun testo di legge nelle schermate, solo "ogni 5 anni".

## 5. Spazio, copie e condivisione col cliente: i vincoli veri

- Oggi il server accetta richieste fino a 60 MB, coi file in base64 dentro il JSON (`server/src/http.js`): un file di
  45 MB diventa 60 MB di testo in memoria. Per i documenti serve un **caricamento a parte, in byte** (§5.4 di
  fase5.md).
- La copia fuori casa passa dal **postino** (Apps Script), che ha limiti suoi: richieste di circa 50 MB al massimo e
  6 minuti per esecuzione (CLAUDE.md, "Limiti di oggi"). Un file molto grande non ci passa: va segnato "solo sul NAS"
  invece di far fallire tutta la copia. Lo spazio su Drive è quello dell'account del foglio (gratis 15 GB, condiviso
  con Gmail).
- Un **link per il cliente** che si apre da fuori vuol dire esporre un pezzo del server su internet (il server oggi è
  raggiungibile solo in casa o col Tailscale di chi lavora). Pactum lo fa con Tailscale Funnel. Il portale clienti è
  della fase 7: in fase 5 il link si progetta ma resta **Non collegato** finché Andrea non decide di aprire quella
  porta; intanto il documento si **manda per email** come allegato (il postino lo fa già per i PDF, limite di Gmail
  25 MB per messaggio).

## 6. Da confermare con Manuel

1. Periodicità delle verifiche DPR 462 da proporre (5 e 2 anni) e quali impianti dei suoi clienti sono "a maggior
   rischio"; se lo studio segue le verifiche per i clienti (promemoria, incarico, accompagnamento).
2. Cabine MT: quali scadenze vuole vedere (manutenzione CEI 78-17 e con che frequenza, verifiche SPG/SPI ogni 5 anni,
   altro).
3. Quali categorie di documenti vuole e quali deve approvare lui prima che escano (proposta in fase5.md §4.3).
4. Cosa scrive oggi nel campo **Ticket** del rapportino (il numero dato dal cliente? un buono d'intervento?).
5. Come fattura oggi gli interventi: a ore come i rapportini, a corpo, con un diritto di chiamata; e se ha già
   contratti di manutenzione con canone (quanti, come si fatturano, se si rinnovano da soli).
6. I tempi d'intervento promessi ai clienti (urgente entro 4 ore? in ore di calendario o lavorative?).
7. Dove stanno oggi i documenti: OneDrive personale o SharePoint dello studio, e come sono fatte le cartelle (per
   cliente, per commessa, per anno).
