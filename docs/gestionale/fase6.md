# Fase 6: persone, mezzi e attrezzature, collaboratori esterni (accordo e schermate)

Si aggiunge ad [`architettura.md`](architettura.md), [`fase1-schermate.md`](fase1-schermate.md), [`fase2.md`](fase2.md),
[`fase3.md`](fase3.md), [`fase4.md`](fase4.md) e [`fase5.md`](fase5.md), che restano validi. Ricerca e fonti in
[`ricerca-fase6.md`](ricerca-fase6.md). Prototipo: [`docs/prototipo/Gestionale-fase6.html`](../prototipo/Gestionale-fase6.html).

Chi costruisce server, app Android e Wisper Ufficio legge **solo** questo file (più l'architettura e le fasi 3, 4 e 5,
da cui dipende): se qualcosa manca o non torna, lo dice invece di inventare. Le parole delle schermate sono quelle
scritte qui, uguali su telefono e computer. La migrazione è la **006** e viene dopo la 005 della fase 5.

## 1. Cosa consegna

- **10 Persone e risorse umane**: l'**organico** (chi lavora nello studio, anche chi non entra in Wisper), la **scheda
  della persona** con tre livelli di dati (di lavoro, personali, riservati), il legame persona ↔ utente, il **costo
  orario** con la sua storia (da lì il costo delle ore e dei rapportini nuovi), **competenze, abilitazioni e
  formazione** (PES, PAV, PEI, formazione 81/08, primo soccorso, antincendio, lavori in quota...), **visite mediche**
  (solo il giudizio e le date), **DPI consegnati** con la firma di chi li riceve, **documenti personali riservati**
  (contratto, cedolini, giudizi di idoneità), **ferie, permessi e assenze** con richiesta, approvazione (lo schema della
  fase 3) e **saldo**, le **chiusure dello studio**, le **presenze del mese** ricavate da ore, rapportini e assenze (senza
  timbrature), l'**uscita** di una persona, il **registro di chi apre i dati riservati**, la **conservazione** e
  l'anonimizzazione proposta. **Wisper non calcola le buste paga**: il programma paghe del consulente è **Non
  collegato**.
- **13 Mezzi e attrezzature**: la **scheda del mezzo** (i veicoli della fase 3 diventano mezzi: dello studio o auto di
  una persona) con assicurazione, bollo, revisione, tagliando, **km**, chi lo usa, **guasti** con la foto,
  manutenzioni e **costi**; **attrezzature, strumenti di misura e DPI con verifica** in un catalogo solo, con la
  **taratura** (stato sempre in vista, non conforme = non si usa, scaduta = avviso con traccia), **assegnazioni e
  prestiti** a persone, commesse, collaboratori e laboratori, con lo storico; lo **strumento usato** nel rapportino e
  nel ticket, senza cambiare i tre passi.
- **16 Collaboratori esterni**: un collaboratore è un **fornitore** della fase 1 con in più la **scheda del
  collaboratore** (tipo, mestiere, abilitazioni, tariffa); **documenti e scadenze** (DURC, visura, autocertificazione,
  polizza) con lo stato dell'**idoneità**; **incarichi** per commessa con il compenso pattuito (a corpo o a ore),
  avanzamento, **compensi maturati, fatturati e pagati** collegati alle **fatture ricevute** della fase 4;
  **valutazione** a fine incarico; **accesso a Wisper** facoltativo col ruolo nuovo `esterno` (solo le sue commesse).
- **Dashboard** con le voci nuove (chi è assente oggi, ferie da approvare, scadenze di persone, mezzi, strumenti e
  collaboratori, tarature scadute, prestiti in ritardo, guasti), **permessi** coerenti, **registro** di tutto.
- **Tutto su telefono e computer** (decisione 2). Sul telefono il tecnico vede il mezzo che ha, segna i km e un guasto
  con la foto, chiede ferie, vede i suoi strumenti e se la taratura vale, **anche senza rete** (§3.13).

## 2. Principi (dalla ricerca)

1. **Oggi lo studio sono due persone: niente deve pesare.** Della persona è obbligatorio solo il nome; tutto il resto
   è facoltativo e si scrive quando serve. Una scheda vuota non genera avvisi, tranne quelli che dicono cosa manca
   per un conto (il costo orario di chi registra ore).
2. **Un posto per ogni cosa** (specifiche §4). Le scadenze sono quelle della fase 5, i documenti quelli della fase 5,
   le fatture dei collaboratori sono le fatture ricevute della fase 4, le assenze stanno nel calendario della fase 2,
   le approvazioni sono quelle della fase 3. La fase 6 aggiunge i pezzi che mancano e li lega.
3. **I dati della persona si vedono a chi servono, e chi apre i riservati lascia traccia** (GDPR, art. 5 e 9). Tre
   livelli, la chiave `riservati` dell'architettura, un registro degli accessi che non si cancella.
4. **Mai dati clinici.** Del medico competente Wisper tiene il giudizio di idoneità e le date, mai la diagnosi; della
   malattia il periodo e il numero del certificato, mai il motivo.
5. **Il saldo si vede sempre**, a chi chiede e a chi approva (Pleya, Factorial), ed è prudente: le ferie che
   matureranno non si contano prima.
6. **Il catalogo dice chi ha cosa, e da quando** (Pleya: "chi ha il furgone, chi ha il casco, cosa è libero"; Hilti
   ON!Track), con lo storico.
7. **Lo stato della taratura sempre con la parola**; lo strumento **non conforme non si usa**; quello **scaduto si può
   usare solo confermando**, e la conferma resta scritta (ISO 9001 §7.1.5.2); dopo una taratura andata male, Wisper
   dice **in quali interventi** è stato usato.
8. **Il costo vero di un collaboratore è la sua fattura** (Pleya): le sue ore non hanno costo orario, il compenso
   pattuito serve per il margine atteso.
9. **Chi è esterno vede solo le sue cose** (specifiche, modulo 16; Pleya): le commesse dei suoi incarichi, i suoi
   rapportini, i suoi documenti, i suoi compensi; mai i clienti, i conti e le persone dello studio.
10. **Niente posizione, niente timbrature** (art. 4 dello Statuto dei lavoratori; Garante, provv. 135/2025): le presenze
    si ricavano dal lavoro registrato.
11. **Le regole di legge sono proposte**: periodicità della formazione, durata del DURC, revisione dei mezzi,
    conservazione dei dati si cambiano e sono "da confermare" con chi ne risponde.
12. **Quello che non è collegato si vede che non c'è** (specifiche §7): programma paghe, portale DURC On Line,
    comunicazione all'Ispettorato per gli occasionali hanno la pillola **Non collegato**.

## 3. Le scelte di questa fase, col perché

### 3.1 Persona, utente, collaboratore esterno: chi è chi

| Chi | Dove sta | Esempio | Ha ferie, costo, visite? | Entra in Wisper? |
|---|---|---|---|---|
| **Persona** dello studio (titolare, socio, dipendente, apprendista, tirocinante, chi lavora nello studio a partita IVA) | `persone` (nuova) | Laura Bianchi (amministrazione), Marco Rossato (tecnico), Elena Costa (tirocinio) | sì | se ha un **utente** (`persone.utente_id`), con uno dei quattro ruoli della fase 1 |
| **Collaboratore esterno** (impresa, professionista, occasionale) | `soggetti` (fornitore, fase 1) + `collaboratori` (nuova) | Impianti Veneti di Sartori Luca | no: ha DURC, polizza, incarichi, fatture | se qualcuno di lui ha un **utente col ruolo `esterno`** (`utenti.soggetto_id`) |

- Una **persona può non avere l'accesso** (la tirocinante, chi non usa il gestionale): ha la scheda, le ferie, la
  formazione, i DPI, ma non riceve attività né scrive rapportini. **Dai l'accesso a Wisper** dalla scheda crea l'utente
  (fase 1, `salvaUtente`) e lo lega.
- Un **utente nuovo** creato da Amministrazione › Utenti (ruoli titolare, amministrazione, collaboratore, lettura) fa
  nascere la sua persona con lo stesso nome (rapporto vuoto: pillola **Da completare** nell'organico). Il nome sta in
  tutti e due i posti e **il server li tiene uguali**: `salvaPersona` e `salvaUtente` cambiano tutti e due nella stessa
  transazione.
- Un **utente `esterno`** non ha la persona: è legato al suo fornitore. Le sue ore e i suoi rapportini hanno costo orario
  0 (§3.3) e il loro costo è l'incarico (§3.11).
- Perché il collaboratore esterno **non è una persona**: non ha ferie, cedolini, costo aziendale né visite; fattura (o fa
  una ricevuta) e la fase 4 tiene già le fatture ricevute **per fornitore**, con la ritenuta e la proposta di F24 1040.
  Farne una persona vorrebbe dire scrivere due volte l'anagrafica e sbagliare il costo (ore × costo orario **più** la sua
  fattura). Perché **non un'anagrafica a parte**: le specifiche chiedono anagrafiche condivise ("ogni cliente inserito
  una sola volta"), e un fornitore diventa collaboratore aggiungendo la scheda, senza ricopiarlo.

### 3.2 Tre livelli di dati e la chiave `riservati`

| Livello | Cosa | Chi lo vede |
|---|---|---|
| **Di lavoro** | nome, rapporto, ruolo nello studio, mansione, telefono ed email di lavoro, entrata, orario, competenze e abilitazioni (senza i documenti), mezzi e strumenti che ha, se è assente oggi, utente collegato | chi ha `persone` ≥ 1 (il collaboratore: l'organico come una rubrica, senza competenze degli altri) |
| **Personali** | codice fiscale, nascita, indirizzo, telefono ed email personali, IBAN (per i rimborsi), contatto di emergenza, tipo di contratto e scadenza, uscita e motivo, data della prossima visita medica, consegne DPI, ferie e permessi con il tipo (tranne i sanitari) | `persone` 2 (titolare e amministrazione) e **la persona stessa** |
| **Riservati** | costo dell'anno e note del costo, CCNL e livello, note riservate, **documenti riservati** (contratto firmato, cedolini, lettere), **giudizi di idoneità e prescrizioni**, **tipo delle assenze sanitarie** (malattia, infortunio, congedo, Legge 104) e numero del certificato | chi ha `riservati` (di base **solo il titolare**) e **la persona stessa** (tranne il costo) |

- Il **costo orario** è un campo dei costi (`costoOrario` è già in `CAMPI_COSTI`): lo vede chi ha `costi`, perché
  serve al margine delle commesse. **Il costo dell'anno** (che dice lo stipendio) è riservato. Limite detto con
  onestà: chi vede il costo orario e le ore ricava il costo dell'anno a grandi linee; per questo il costo orario si vede
  solo con `costi`.
- **La persona vede i suoi dati riservati** (cedolini, contratto, giudizi di idoneità, i suoi tipi di assenza: sono
  suoi), ma **non il suo costo** (è un numero per i conti delle commesse; se lo chiede, glielo dà il titolare).
- Il server **toglie** dalle risposte i campi che uno non vede (come `costi`): nomi dei campi riservati in §5.1. Senza il
  livello giusto i campi **non ci sono** (né valori né chiavi), e un'assenza sanitaria arriva con `tipoVisto: "Assente"`.
- **Registro**: nelle righe del registro delle modifiche i campi personali e riservati hanno `"(riservato)"` al posto
  dei valori, come le password. Così il registro non diventa una seconda copia dei dati e l'anonimizzazione (§9) non
  deve toccarlo.
- **Registro degli accessi ai riservati** (`accessi_riservati`, §5.7): chi ha visto o scaricato quale dato riservato di
  chi, e quando. Lo legge il titolare, e la persona per i suoi.

### 3.3 Il costo orario dalla persona

`costoOrarioDi({utente, data, cliente, commessa})` in `server/src/conti.js`, usato alla nascita di una riga di **ore**
(fase 3 §14.4) e di un **rapportino** (fase 1), e congelato lì come oggi:

1. l'utente è un **esterno** (ruolo `esterno`), o la riga di ore è di un collaboratore senza accesso (§8.2) → **0**:
   il suo costo è l'incarico;
2. la **persona** dell'utente ha un costo orario valido alla **data del lavoro** (`persona_costi`, la riga con `dal`
   più recente ≤ data) → **quello**;
3. altrimenti **la regola di oggi**: costo fisso del cliente → costo orario della commessa → `COSTO_ORARIO`.

- **Perché la persona prima del costo fisso del cliente e della commessa.** Quei due numeri sono nati quando lavorava
  solo Manuel: erano un modo di dire quanto costa un'ora dello studio. Con più persone il costo vero di un'ora dipende
  da **chi** la lavora; la regola del cliente e della commessa resta per chi non ha un costo scritto.
- **Per oggi non cambia niente.** La migrazione non scrive nessun costo; il costo del titolare si lascia vuoto di base
  (non ha uno stipendio: il suo costo è una convenzione) e quindi i rapportini di Manuel continuano a prendere il costo
  di oggi. Il costo della persona conta da quando qualcuno lo scrive, e **solo per le righe che nascono dopo**: quelle
  già scritte tengono il loro, come sempre ("cambiare un'impostazione non riscrive il passato").
- Si rifà, come oggi, solo se cambia la commessa; se una riga nasce oggi per un giorno passato, vale il costo di quel
  giorno.
- **Il budget e il costo previsto della commessa non cambiano** (cliente → commessa → impostazioni): sono una previsione
  fatta prima di sapere chi lavorerà.
- **Esterni con costo 0**: le loro righe hanno `costo_orario = 0` (non `null`), così il cruscotto della fase 1 (che usa
  "quello di oggi se manca") non conta due volte le loro ore; `costoNoto` resta vero (il costo c'è: è l'incarico).
- **Costo proposto dal costo dell'anno**: nella scheda si può scrivere il costo orario direttamente, oppure il **costo
  dell'anno** (dal prospetto del consulente) e le **ore lavorate all'anno**: costo orario proposto = costo dell'anno /
  ore, al centesimo (`costoOrarioDaAnno`, §6.3). Si salva quello che si vede.
- La Dashboard (da pianificare) dice "Marco Rossato non ha il costo orario: le sue ore usano il costo dello studio" solo
  se quella persona ha ore o rapportini nell'ultimo mese, e solo a chi ha `costi`.

### 3.4 Ferie e permessi: il saldo dal cedolino

Wisper **non calcola la maturazione** (la dice il CCNL e la fa il consulente). Fa come il saldo dei conti della fase 4:
**parte dall'ultimo saldo scritto** e conta quello che succede dopo.
- **Saldo scritto**: "Aggiorna dal cedolino" (persone 2): il residuo di ferie e di permessi che il cedolino dice a una
  data (di solito la fine del mese), in **ore**. Facoltativo.
- **Ore all'anno** (facoltative, nella scheda): ferie e permessi che maturano in un anno per quella persona. Ogni mese
  chiuso dopo il saldo scritto aggiunge un dodicesimo.
- **Godute**: le assenze approvate di quel tipo, giorno per giorno, dopo la data del saldo, fino a oggi compreso.
- **Prenotate**: quelle approvate da domani in poi, più quelle da approvare.
- **Saldo di oggi** = saldo scritto + maturate − godute. **Restano** = saldo di oggi − prenotate (prudente: le ferie
  che matureranno da qui al giorno delle ferie non si contano).
- Senza ore all'anno né saldo scritto (il titolare, una tirocinante): il saldo non c'è ("Saldo non tenuto"), le assenze
  si chiedono e si vedono lo stesso.
- Le ore diventano giorni con le **ore del giorno della persona** (`ore_settimana` / giorni lavorativi della settimana:
  Laura a 30 ore su 5 giorni ha 6 ore al giorno): "12 giorni (72 ore)". I permessi restano in ore.
- Perché in ore: i cedolini italiani di solito danno il residuo in ore, i part-time vengono giusti, e mezza giornata o un
  permesso di tre ore non hanno bisogno di regole a parte. Da confermare col consulente (ricerca §8.2).

### 3.5 Presenze senza timbrature

Le **presenze del mese** (§6.7) sono un prospetto **ricavato**: per ogni persona e giorno le ore previste (dall'orario e
dalle festività), le ore lavorate (ore registrate della fase 3 e ore dei rapportini), le straordinarie, le assenze, e
"manca" quando il giorno non torna. Serve al consulente per il cedolino e si esporta. **Non ci sono timbrature, totem o
posizione**: le ore della fase 3 hanno già inizio, fine e pause; una timbratura sarebbe una seconda volta la stessa
cosa, e con la posizione diventerebbe un controllo a distanza (art. 4 dello Statuto, accordo sindacale o autorizzazione
dell'Ispettorato; il Garante ha sanzionato un'app di timbratura con GPS nel 2025). Non è il libro unico: lo tiene il
consulente.

### 3.6 Le scadenze: sempre quelle della fase 5

Formazione, abilitazioni, visite mediche, fine dei contratti a termine, assicurazioni, bolli, revisioni, tagliandi,
tarature, verifiche dei DPI, DURC, visure, polizze dei collaboratori: **tutte righe di `scadenze`** (fase 5 §4.4) con le
colonne nuove `persona_id`, `veicolo_id`, `attrezzatura_id` (e `cliente_id` per il fornitore, §4.3). Stessi stati visti
(Scaduta, Scade fra N giorni, Prossima, Fatta), stesso **Segna fatta** che fa nascere la prossima, stesso calendario,
stessa Dashboard. Il pezzo nuovo è chi la fa nascere: salvare una qualifica, una visita, una taratura, un documento del
collaboratore o le date di un mezzo crea o aggiorna **la sua** scadenza (una per cosa: `scadenza_id`), e la cosa nuova
(il corso di aggiornamento, la taratura, la revisione fatta) la segna fatta.

### 3.7 Mezzi: dello studio o di una persona

I `veicoli` della fase 3 diventano i **mezzi**, con una colonna che cambia i conti:
- `proprieta = persona`: l'auto di qualcuno usata per lavoro. Le trasferte danno il **rimborso km** con l'euro al km
  della tabella ACI (come oggi). Wisper non tiene le sue scadenze se non le si scrive.
- `proprieta = studio` (anche a noleggio o in leasing): il mezzo dello studio. **Una trasferta con un mezzo dello studio
  non dà rimborso km** a chi guida (`euroKm` congelato 0, "Mezzo dello studio: niente rimborso km"): carburante e
  manutenzione li paga lo studio e sono **costi del mezzo** (§7.4).
- **La migrazione mette `persona` a tutti i veicoli di oggi**, senza persona: le trasferte di oggi non cambiano di un
  centesimo. Se il Volvo di oggi è dello studio, lo si cambia a mano (domanda per Manuel).

### 3.8 Tarature: avviso con traccia, non conforme bloccato

| Stato dello strumento | Si può scegliere nel rapportino? |
|---|---|
| **Tarato** / **Taratura fra N giorni** | sì |
| **Taratura scaduta** | con `TARATURA_BLOCCO = avviso` (di base): sì, **confermando** ("Lo uso lo stesso"); la conferma resta nel rapportino, nel ticket e nella Dashboard. Con `blocco`: no, mai |
| **Taratura non scritta** | sì, con la pillola grigia |
| **In taratura** (al laboratorio) | no: "È al laboratorio fino al 29/10" |
| **Non conforme** (l'ultima taratura è andata male) | **no, mai**: "Non conforme dal 02/10: non si usa finché non è tarato di nuovo" |

Perché non bloccare sempre lo scaduto: l'intervallo di taratura non lo fissa una legge (lo dicono il costruttore e il
sistema qualità dello studio, ricerca §4); il rapportino è il racconto di quello che è successo, e rifiutarlo in
cantiere, magari senza rete, farebbe solo perdere il racconto o scrivere il falso. Uno strumento **non conforme** invece
misura sbagliato per certo: lì il blocco serve. Il blocco totale dello scaduto è **un'impostazione** per quando Manuel lo
vorrà (domanda 3).
- **Il server non rifiuta mai un rapportino per uno strumento** (la coda del telefono si fermerebbe): se nel frattempo
  lo strumento è diventato non conforme, il rapportino si salva, lo strumento resta segnato col suo stato e la
  Dashboard lo dice.
- **Dopo una taratura non conforme** Wisper mette lo strumento **fuori uso** e mostra **gli interventi in cui è stato
  usato dall'ultima taratura buona** (rapportini e ticket, con cliente e impianto): "Usato in 6 interventi dal
  15/11/2025: controlla se le misure valgono" (ISO 9001 §7.1.5.2). Anche dopo una **riparazione** la taratura non vale
  più (ACCREDIA): chiudere una riparazione di uno strumento lo porta a **Taratura non scritta** finché non se ne registra
  una nuova.

### 3.9 Lo strumento nel rapportino senza cambiare i tre passi

- Nel **passo 3** (Il lavoro), sotto le spese, una riga chiusa **+ Strumenti usati** (come "+ Una nota per te"). Aperta:
  i **tuoi strumenti** (assegnati a te o in prestito a te) come pillole con lo stato della taratura, la riga **Come
  l'ultima volta qui: MT-500, Multimetro 87V** (gli strumenti dell'ultimo rapportino per lo stesso impianto, o cliente)
  e **Altro strumento** (ricerca nel catalogo). Il sistema propone, la persona tocca (principio 4 di `aspetto.md`).
  Dal ticket di tipo **Verifica** la riga parte già aperta.
- Toccare uno strumento scaduto apre il foglio **"Il Multimetro 87V ha la taratura scaduta"** · "Scaduta il 16/10/2026:
  le misure potrebbero non valere." · giallo **Scegli un altro strumento** · testo **Lo uso lo stesso** (solo con
  `avviso`). Uno non conforme o al laboratorio: pillola grigia spenta col motivo, il tocco dice il motivo.
- **Riepilogo**: riga "Strumenti" con i nomi e lo stato, e **Cambia** che riporta al passo 3.
- **PDF del rapportino**: una riga **Strumenti** compare **solo quando ce ne sono**: "Misuratore di terra MT-500 matr.
  22-0451, tarato fino al 15/11/2026 · Multimetro 87V matr. 6011-2381, tarato fino al 16/10/2026" (le date sono quelle
  vere, anche se passate). I rapportini senza strumenti restano identici (come la cella Ticket della fase 5).
- Da **firmato** in poi gli strumenti non cambiano (come le spese: per cambiarli si riporta in bozza).
- **Il ticket** mostra gli strumenti dei suoi rapportini, con lo stato **di quel giorno** (congelato) e la pillola rossa
  **Taratura scaduta** se uno era scaduto.

### 3.10 Collaboratori esterni: fornitori con la scheda

- **Nuovo collaboratore** crea il fornitore (fase 1, `salvaSoggetto` con `fornitore: true`; un doppione per nome o
  partita IVA restituisce quello che c'è) e la sua scheda; da un fornitore che c'è già, **Fanne un collaboratore**
  aggiunge la scheda. Nell'elenco dei fornitori la pillola **Collaboratore** apre la scheda.
- **Tipo**: **Impresa** (installatrice: DURC, visura, idoneità), **Professionista** (iscritto a un albo: polizza),
  **Occasionale** (prestazione occasionale con ricevuta: nessun documento obbligatorio, il promemoria della comunicazione
  all'Ispettorato con **Non collegato**, da confermare col consulente).
- **Idoneità** (stato visto, sempre con la parola): **In regola** (verde), **Manca qualcosa** (ambra: "Manca il DURC"),
  **Documenti scaduti** (rosso: "DURC scaduto il 12/10"). Quali documenti servono per tipo è un'impostazione
  (`COLLAB_DOCUMENTI`, proposta: impresa DURC, visura, autocertificazione di idoneità, polizza; professionista polizza e
  iscrizione all'albo). **Affidare un incarico** con l'idoneità non in regola chiede una conferma che dice cosa manca:
  blocco morbido come la taratura (è un controllo dello studio, non un divieto di Wisper).
- **Valutazione** alla fine di ogni incarico, con tre parole e una nota: **Bene**, **Con qualche problema**, **Male**. La
  scheda mostra quante di ognuna ("4 incarichi: 3 bene, 1 con qualche problema"). Niente stelline.

### 3.11 Il costo dei collaboratori nella commessa

- Un **incarico** ha un compenso **pattuito** (a corpo, o ore previste × tariffa, con un tetto facoltativo), un
  **maturato** (corpo: compenso × avanzamento; ore: ore approvate × tariffa, fino al tetto), un **fatturato** (somma
  dell'imponibile delle fatture ricevute collegate all'incarico, meno le note di credito) e un **pagato** (dalle fatture
  ricevute pagate della fase 4).
- **Costo sostenuto** della commessa: in più delle parti della fase 3, **le fatture ricevute** collegate (imponibile +
  contributo della cassa + bollo; l'IVA no). Proposta da confermare col commercialista.
- **Costo atteso**: per ogni incarico non annullato il più grande fra pattuito e già fatturato: così il margine atteso
  sa del collaboratore dal giorno in cui lo si incarica.
- Le **fatture ricevute con la commessa e senza incarico** (fase 4: "per i costi della commessa": materiale, consulenze)
  entrano anche loro nel costo sostenuto, tranne quelle legate a una spesa (`spesa_id`), che è già contata.
- Ore e rapportini degli esterni hanno **costo orario 0** (§3.3): niente doppio conto.

### 3.12 Uscita, conservazione e anonimizzazione

- **Segna l'uscita** (data e motivo): l'accesso a Wisper si **disattiva** dalla fine di quel giorno (subito, se la data è
  passata); le assenze future si annullano; le attività assegnate da quel giorno diventano non assegnate e i ticket in
  carico tornano aperti (con conferma che li elenca); le scadenze aperte della persona si annullano col motivo
  "Uscita"; il **contatto di emergenza** e il **telefono personale** si tolgono subito (non servono più); Wisper elenca
  **mezzi, strumenti e DPI da restituire**. Ore, rapportini, spese restano: sono il lavoro dello studio.
- **Conservazione** (`PERSONE_CONSERVA_ANNI`, proposta **10 anni dall'uscita**, da confermare col consulente del lavoro):
  passati, la Dashboard propone al titolare **Rendi anonima la scheda** (§9). Non parte da sola: è definitiva.
- Cosa toglie l'anonimizzazione: dati personali e riservati della scheda, costi, assenze e saldi, visite, formazione e
  attestati, consegne DPI e firme, documenti legati alla persona (tolti per sempre dal disco, non nel cestino); il nome
  della scheda e dell'utente diventa "Persona uscita nel 2026". Cosa resta: ore, rapportini, spese, trasferte, attività,
  ticket (lavoro dello studio, con i loro tempi: 10 anni per quello che è legato a fatture). **Il nome sul PDF di un
  rapportino firmato resta**: è un documento dello studio consegnato al cliente. Le copie di sicurezza tengono i dati
  vecchi fino alla loro scadenza (30 giorni, e una al mese per 12 mesi): va detto nell'informativa ai dipendenti.

### 3.13 Il telefono senza rete

Come i rapportini: si legge quello che è stato letto l'ultima volta, si scrive nella coda su disco, parte appena c'è
rete. Si salva a ogni lettura riuscita, con "letto alle 16:52".
- **Si leggono senza rete**: la mia scheda (dati di lavoro e personali, saldo di ferie e permessi), le mie richieste,
  chi è assente nelle prossime 4 settimane, il mio mezzo (scheda, scadenze, ultime letture dei km, guasti aperti), i miei
  strumenti e attrezzature con la data della taratura (lo **stato** il telefono lo ricalcola dalla data: uno strumento
  che scade stanotte domattina è **Taratura scaduta** anche senza rete), i miei DPI; per l'esterno i suoi incarichi.
- **Si fanno senza rete** (nella coda, nell'ordine): chiedere ferie o un permesso, segnalare una malattia, annullare una
  mia richiesta, **segnare i km** (con la foto del contachilometri), **segnalare un guasto** con le foto, **Lo prendo
  io** e **Restituisci**, firmare una consegna di DPI, gli strumenti usati nel rapportino (vanno con il rapportino).
- Pillola grigia in basso come oggi: "1 richiesta di ferie e 2 letture dei km partono appena c'è rete". Mai rosso per la
  sola rete. Se il server rifiuta (per esempio km più bassi dell'ultima lettura arrivata nel frattempo), la scheda rossa
  tenue della 0.4.0 con il motivo, **Riprova** e **Scarta**.

### 3.14 Wisper non fa le paghe

Il cedolino lo fa il consulente del lavoro. Wisper tiene: i **documenti** (contratto, cedolini, lettere) come documenti
riservati della persona; il **costo dell'anno** per il costo orario; ferie, permessi, assenze, straordinari e presenze
**da mandare** al consulente (esportazione CSV); formazione, visite, DPI e scadenze. Il **programma paghe del
consulente** è **Non collegato** (pillola in Presenze e nella scheda); l'importazione automatica dei cedolini o dei
saldi è fase 8.

## 4. Dati (migrazione 006)

`server/src/migrazioni/006-persone-mezzi-collaboratori.sql` + `006-persone-mezzi-collaboratori.js`, con la copia
`wisper.db.prima-6` prima (come le altre). Importi al centesimo con `centesimi()`; ore con due decimali; date
`aaaa-mm-gg`; istanti col fuso nel database e `"2026-10-22T08:40:00"` nelle risposte (§12.1). Le tabelle da cui si
tolgono righe hanno `AUTOINCREMENT`. Le tabelle che si rifanno (per un CHECK o una colonna che diventa facoltativa) si
rifanno **con tutte le colonne di oggi**, comprese quelle delle fasi 4 e 5.

### 4.1 Impostazioni nuove

| Chiave | Valore iniziale | Cosa |
|---|---|---|
| `FESTA_PATRONO` | `""` | il santo patrono del comune dello studio, `"mm-gg"` (vuoto = nessuno) |
| `PERSONE_CONSERVA_ANNI` | `10` | dopo quanti anni dall'uscita si propone l'anonimizzazione (da confermare) |
| `SALDO_AVVISO_GIORNI` | `60` | saldo di ferie non aggiornato dal cedolino da più giorni → da pianificare (solo per chi ha le ore all'anno) |
| `TARATURA_OGNI_MESI` | `12` | proposta per gli strumenti nuovi |
| `TARATURA_PREAVVISO_GIORNI` | `30` | preavviso delle scadenze di taratura e di verifica |
| `TARATURA_BLOCCO` | `"avviso"` | `avviso` (lo scaduto si usa confermando) o `blocco` (lo scaduto non si sceglie) |
| `DURC_GIORNI` | `120` | durata proposta di un DURC dalla data di emissione |
| `VISURA_MESI` | `6` | età massima proposta della visura camerale |
| `COLLAB_DOCUMENTI` | `{"impresa":["durc","visura","idoneita","polizza"],"professionista":["polizza","albo"],"occasionale":[]}` | documenti che servono per l'idoneità |
| `ACCESSO_ESTERNI_GIORNI` | `90` | dopo quanti giorni senza incarichi in corso si propone di togliere l'accesso a un esterno |
| `KM_TAGLIANDO_AVVISO` | `1000` | quanti km prima del tagliando la Dashboard avvisa |

`ORE_GIORNALIERE` (fase 3) resta il valore di base delle ore al giorno di una persona senza orario.

### 4.2 Numerazioni nuove

`incarico` = `IN/{AAAA}/{NNN}`, riparte ogni anno; `attrezzatura` = `AT{NNN}`, continua (è il codice dell'etichetta
attaccata allo strumento). Come le altre: "il più alto già usato + 1", i buchi non si riusano, `prossimo` in
`anagrafiche.numerazioni`. I mezzi non hanno numero: hanno la targa.

### 4.3 Colonne nuove su tabelle che ci sono

- `utenti`: `soggetto_id` TEXT (solo per il ruolo `esterno`: il fornitore di cui fa parte). `ruolo` accetta `esterno`.
- `permessi`: le righe del ruolo `esterno` (§11.2); per il collaboratore `persone` passa da 0 a **1** se è ancora 0.
- `veicoli` (i mezzi): `targa` TEXT · `tipo` TEXT NOT NULL DEFAULT `'auto'` (`auto` | `furgone` | `moto` | `altro`) ·
  `proprieta` TEXT NOT NULL DEFAULT `'persona'` (`persona` | `studio`) · `persona_id` INTEGER (con `persona`: di chi è
  l'auto) · `immatricolazione` TEXT (data) · `km` INTEGER e `km_il` TEXT (l'ultima lettura, tenuta dal server) ·
  `tagliando_km` INTEGER (ogni quanti km; `null` = non a km) · `tagliando_ultimo_km` INTEGER · `note` TEXT ·
  `dismesso_il` TEXT. `nome` resta ("Fiat Doblò"); nelle schermate il mezzo si chiama `nome + " " + targa`.
- `trasferte`: niente di nuovo nel database; con un veicolo `studio` l'`euro_km` congelato è 0 (§3.7).
- `scadenze` (fase 5): `persona_id`, `veicolo_id`, `attrezzatura_id`, `qualifica_id`, `visita_id` INTEGER; `fine_mese`
  INTEGER NOT NULL DEFAULT 0 (la prossima va all'ultimo giorno del mese: la revisione); `tipo` accetta anche
  `formazione`, `abilitazione`, `visita_medica`, `contratto_lavoro`, `assicurazione`, `bollo`, `revisione`,
  `tagliando`, `taratura`, `verifica_dpi`, `durc`, `visura`, `idoneita`, `albo` (CHECK rifatto). Per i collaboratori la
  scadenza usa `cliente_id` (è l'id di un soggetto: vale anche per un fornitore).
- `documenti` (fase 5): `persona_id`, `veicolo_id`, `attrezzatura_id`, `incarico_id` INTEGER. Un documento di un
  collaboratore usa `cliente_id` col suo F… (la colonna punta a `soggetti`: il nome resta, nelle risposte c'è anche
  `idSoggetto`).
- `spese` (fase 3): `veicolo_id`, `attrezzatura_id`, `incarico_id` INTEGER.
- `fatture_ricevute` (fase 4): `incarico_id`, `veicolo_id`, `attrezzatura_id` INTEGER.
- `impegni` (fase 4): `veicolo_id` INTEGER (bollo, rate dell'assicurazione).
- `ore` (fase 3): `incarico_id` INTEGER; `creata_da` INTEGER; `utente_id` diventa **facoltativo** (le ore di un
  collaboratore senza accesso: allora `incarico_id` è obbligatorio, CHECK). La tabella si rifà.
- `rapportini`: `incarico_id` INTEGER (il rapportino di un esterno, legato al suo incarico su quella commessa).
- `file`: tipi nuovi `guasto` (foto di un guasto), `km` (foto del contachilometri), `firma_consegna` (firma di chi
  riceve un DPI o uno strumento); colonne `manutenzione_id`, `lettura_id`, `consegna_id`, `assegnazione_id`. CHECK
  rifatto come nelle 002, 004, 005.
- `fattura_sorgenti`, `soggetti`, `commesse`: niente.

### 4.4 Tabelle nuove

**`persone`**: id INTEGER PK AUTOINCREMENT · `nome` TEXT NOT NULL · `utente_id` INTEGER UNIQUE (`null` = senza accesso) ·
`rapporto` TEXT NOT NULL DEFAULT `''` (`titolare` | `socio` | `dipendente` | `apprendista` | `tirocinante` | `autonomo`
| `altro` | `''` = da completare) · `ruolo_studio` TEXT ("Amministrazione", "Tecnico elettrico") · `mansione` TEXT (per
la sicurezza: "Lavori elettrici fuori tensione e in prossimità") · `email_lavoro`, `telefono_lavoro` · `entrata_il`,
`uscita_il` (date) · `motivo_uscita` · `ore_settimana` REAL (`null` = `ORE_GIORNALIERE` × 5) · `giorni_settimana` TEXT
JSON (di base `[1,2,3,4,5]`, 1 = lunedì) · `contratto_tipo` (`indeterminato` | `determinato` | `apprendistato` |
`stage` | `parasubordinato` | `partita_iva` | `''`) · `contratto_scade` (data) · `part_time` 0/1 · personali:
`codice_fiscale`, `nascita_data`, `nascita_luogo`, `indirizzo`, `cap`, `citta`, `provincia`, `telefono_personale`,
`email_personale`, `iban`, `emergenza_nome`, `emergenza_telefono` · riservati: `ccnl`, `livello`, `note_riservate` ·
`ferie_annue_ore`, `permessi_annui_ore` REAL (`null` = saldo non tenuto) · `anonimizzata_il` · `creato`, `modificato`.

**`persona_costi`**: id AUTOINCREMENT · `persona_id` · `dal` (data) · `costo_orario` REAL NOT NULL · `costo_anno` REAL
(riservato) · `ore_anno` REAL · `nota` (riservata: "Dal prospetto del consulente di febbraio") · `utente_id`,
`creato`. UNIQUE(`persona_id`, `dal`).

**`assenze`**: id AUTOINCREMENT · `id_locale` UNIQUE · `persona_id` · `tipo` (`ferie` | `permesso` | `malattia` |
`infortunio` | `congedo` | `legge104` | `altro`) · `causale` (per `altro`: "Lutto", "Studio", "Donazione di sangue",
"Matrimonio"...) · `dal`, `al` (date) · `mezza` (`''` | `mattina` | `pomeriggio`, solo con `dal = al`) · `dalle`,
`alle` (`"HH:MM"`, solo per un permesso di un giorno) · `ore` REAL (calcolate, §6.2) · `giorni` REAL · `stato`
(`bozza` | `da_approvare` | `approvata` | `respinta` | `annullata`) · `nota` (di chi chiede) · `protocollo` (numero del
certificato, riservato) · `approvata_da`, `approvata_il`, `motivo_rifiuto` · `annullata_il`, `motivo_annullo` ·
`chiusura_id` · `creata_da`, `creato`, `modificato`.

**`assenze_saldi`**: id AUTOINCREMENT · `persona_id` · `tipo` (`ferie` | `permessi`) · `data` · `ore` REAL (residuo, anche
negativo) · `nota` ("Cedolino di settembre") · `utente_id`, `creato`.

**`chiusure`**: id AUTOINCREMENT · `nome` ("Natale") · `dal`, `al` · `ferie` 0/1 (consuma ferie: nascono le assenze) ·
`creata_da`, `creato`.

**`qualifica_tipi`**: `chiave` PK · `nome` · `gruppo` (`elettrico` | `sicurezza` | `emergenza` | `altro`) · `ogni_mesi`
(`null` = non scade) · `preavviso_giorni` · `ordine` · `attivo` 0/1 · `sistema` 0/1. Righe iniziali in §5.3.

**`qualifiche`**: id AUTOINCREMENT · `persona_id` · `tipo` (→ `qualifica_tipi.chiave`) · `titolo` (dettaglio o nome per
`altro`: "Livelli 1A e 1B, 16 ore") · `data` (conseguita o attribuita) · `scade` (data; di base `data + ogni_mesi`;
vuota = non scade) · `ente` · `ore` · `documento_id` · `scadenza_id` · `nota` · `tolta` (istante) · `creata_da`,
`creato`, `modificato`.

**`visite_mediche`**: id AUTOINCREMENT · `persona_id` · `data` · `tipo` (`preventiva` | `periodica` | `richiesta` |
`cambio_mansione` | `rientro` | `cessazione`) · `giudizio` (riservato: `idoneo` | `idoneo_prescrizioni` |
`non_idoneo_temporaneo` | `non_idoneo`) · `prescrizioni` (riservato: le limitazioni come le scrive il medico) ·
`valido_fino` (per `non_idoneo_temporaneo`) · `prossima` (data) · `medico` (testo) · `documento_id` (il giudizio) ·
`scadenza_id` · `creata_da`, `creato`, `modificato`. **Nessun campo per diagnosi o dati clinici.**

**`dpi_consegne`**: id AUTOINCREMENT · `id_locale` UNIQUE · `persona_id` · `cosa` · `taglia` · `quantita` (di base 1) ·
`data` · `attrezzatura_id` (se è un DPI del catalogo con verifica: l'imbracatura AT015) · `firma_file_id`, `firmata_il` ·
`scade` · `scadenza_id` · `restituito_il` · `nota` · `consegnata_da`, `creato`.

**`accessi_riservati`**: id AUTOINCREMENT · `quando` · `utente_id` · `persona_id` (di chi sono i dati) · `cosa`
(`scheda` | `costo` | `documento` | `visita` | `assenza` | `esportazione`) · `riferimento` (id del documento o della
visita, o `''`) · `azione` (`visto` | `scaricato` | `cambiato` | `esportato`) · `disp`. Non si modifica e non si cancella
(due trigger, come il registro).

**`attrezzature`**: id AUTOINCREMENT · `codice` UNIQUE (AT003) · `nome` · `categoria` (`strumento` | `attrezzo` |
`informatica` | `dpi` | `altro`) · `marca`, `modello`, `matricola` · `proprieta` (`studio` | `noleggio` | `persona` |
`cliente`, di base `studio`) · `acquistato_il` · `fornitore_id` · `posizione` (testo: "Armadio dell'ufficio", "Sul
Doblò") · `controllo` (`''` | `taratura` | `verifica`: di base `taratura` per gli strumenti, `''` per gli altri) ·
`controllo_ogni_mesi` · `laboratorio_id` (il laboratorio di solito) · `fuori_uso` (`''` | `non_conforme` | `guasto` |
`perso`) · `fuori_uso_il`, `fuori_uso_motivo` · `dismesso_il`, `dismesso_motivo` · `note` · `creato`, `modificato`.

**`tarature`** (anche le verifiche dei DPI): id AUTOINCREMENT · `attrezzatura_id` · `data` · `scade` (di base `data +
controllo_ogni_mesi`) · `esito` (`conforme` | `regolato` | `non_conforme`) · `laboratorio_id` · `certificato` (numero:
"LAT 1234/25") · `documento_id` (il certificato) · `ricevuta_id` (il costo, fase 4) · `nota` · `utente_id`, `creato`.

**`assegnazioni`**: id AUTOINCREMENT · `id_locale` UNIQUE · `veicolo_id` | `attrezzatura_id` (uno solo: CHECK) · `tipo`
(`assegnato` | `prestito` | `laboratorio` | `riparazione`) · `persona_id` | `commessa_id` | `soggetto_id` (almeno uno;
`laboratorio` e `riparazione` vogliono il soggetto) · `dal` (istante) · `rientro` (data prevista) · `al` (istante di fine,
`null` = in corso) · `firma_file_id`, `firmata_il` · `nota` · `da_utente_id`, `creato`. **Una sola in corso per oggetto**
(indici unici parziali `WHERE al IS NULL`); assegnare chiude quella in corso.

**`manutenzioni`** (guasti e manutenzioni di mezzi e attrezzature): id AUTOINCREMENT · `id_locale` UNIQUE · `veicolo_id` |
`attrezzatura_id` · `tipo` (`guasto` | `manutenzione` | `tagliando` | `revisione` | `riparazione` | `gomme` | `altro`) ·
`stato` (`aperta` | `in_officina` | `chiusa`) · `fermo` 0/1 (non si usa finché non è chiusa) · `data` · `km` · `titolo`
("Spia della pressione delle gomme accesa") · `descrizione` · `fornitore_id` (officina o assistenza) · `spesa_id` |
`ricevuta_id` (il costo: **nessun importo scritto qui**) · `chiusa_il` · `esito` · `segnalata_da`, `creato`, `modificato`.

**`mezzo_letture`**: id AUTOINCREMENT · `id_locale` UNIQUE · `veicolo_id` · `data` · `km` · `utente_id` · `origine` (`mano`
| `rifornimento` | `manutenzione`) · `foto_file_id` · `nota` · `creato`.

**`strumenti_usati`**: id AUTOINCREMENT · `attrezzatura_id` · `rapportino_id` · `ticket_id` · `data` · `utente_id` ·
`scade_allora` (la scadenza della taratura quel giorno) · `stato_allora` (`valida` | `scaduta` | `senza` |
`non_conforme` | `laboratorio`) · `confermato` 0/1 (usato confermando la taratura scaduta) · `creato`.
UNIQUE(`attrezzatura_id`, `rapportino_id`).

**`collaboratori`** (la scheda del collaboratore esterno): `soggetto_id` TEXT PK (il fornitore F…) · `tipo` (`impresa` |
`professionista` | `occasionale`) · `mestiere` ("Impianti elettrici civili e industriali") · `abilitazioni` ("DM
37/2008, lettere A e B") · `tariffa` REAL (€/h proposta) · `referente_id` (la persona dello studio che lo segue) ·
`attivo` 0/1 · `note` · `creato`, `modificato`.

**`incarichi`**: id AUTOINCREMENT · `numero` UNIQUE (IN/2026/004) · `soggetto_id` · `commessa_id` NOT NULL ·
`prestazione_id` · `titolo` · `descrizione` · `modo` (`corpo` | `ore`) · `compenso` (corpo) · `tariffa`, `ore_previste`,
`tetto` (ore) · `spese_comprese` 0/1 (di base 1: le spese le mette nel compenso) · `dal`, `al` (previsti) · `stato`
(`bozza` | `affidato` | `concluso` | `annullato`) · `affidato_il`, `concluso_il`, `annullato_il`, `motivo` ·
`avanzamento` (0-100, corpo) · `referente_id` · `documento_id` (lettera d'incarico firmata) · `valutazione` (`''` |
`bene` | `problemi` | `male`) · `valutazione_nota` · `valutata_da`, `valutata_il` · `creato_da`, `creato`, `modificato`.

### 4.5 Categorie dei documenti e tipi di scadenza nuovi

Categorie nuove (in coda a quelle della fase 5; `sistema` = 1):

| Nome | Approvazione | Vede | Legata a | Scadenza proposta |
|---|---|---|---|---|
| Contratti di lavoro | no | riservati | persona | dal contratto (`contratto_scade`) |
| Cedolini | no | riservati | persona | — |
| Idoneità sanitarie | no | riservati | persona | dalla visita |
| Attestati e abilitazioni | no | tutti* | persona | dalla qualifica |
| Consegne DPI | no | tutti* | persona | — |
| Documenti dei mezzi | no | tutti | mezzo | libretto, polizza: dalla scadenza |
| Certificati di taratura | no | tutti | attrezzatura | dalla taratura |
| Documenti dei collaboratori | no | tutti | collaboratore | DURC 120 giorni, visura 6 mesi, polizza 12 mesi |
| Lettere d'incarico | no | costi | incarico | — |

\* **Un documento legato a una persona** (con `persona_id`) lo vedono **solo** chi ha `persone` 2 e la persona stessa,
qualunque sia `vede`; se `vede = riservati`, solo chi ha `riservati` e la persona stessa. "Documenti personali" della
fase 5 resta (riservati) per gli altri documenti personali. Il server non manda gli altri e non dice che esistono (come
la fase 5 §5.3); `GET /file/<id>` risponde 403.

Le **proposte delle scadenze** (si cambiano tutte):

| Tipo | Titolo proposto | Ogni | Dalla | Fine mese | Preavviso |
|---|---|---|---|---|---|
| `formazione`, `abilitazione` | "{qualifica} di {persona}" | dal tipo di qualifica (§5.3) | fatta | no | dal tipo |
| `visita_medica` | "Visita medica di {persona}" | la data `prossima` scritta | — | no | 30 |
| `contratto_lavoro` | "Contratto di {persona} finisce" | una volta | — | no | 60 |
| `assicurazione` | "Assicurazione {mezzo}" | 12 mesi | data | no | 30 |
| `bollo` | "Bollo {mezzo}" | 12 mesi | data | no | 30 |
| `revisione` | "Revisione {mezzo}" | prima: immatricolazione + 4 anni; poi 24 mesi | fatta | **sì** | 30 |
| `tagliando` | "Tagliando {mezzo}" | dal mezzo (mesi) | fatta | no | 30 |
| `taratura` | "Taratura {strumento}" | `controllo_ogni_mesi` | la data `scade` della taratura | no | `TARATURA_PREAVVISO_GIORNI` |
| `verifica_dpi` | "Verifica {DPI}" | `controllo_ogni_mesi` | come sopra | no | `TARATURA_PREAVVISO_GIORNI` |
| `durc` | "DURC di {collaboratore}" | `DURC_GIORNI` dalla data di emissione | data | no | 15 |
| `visura` | "Visura camerale di {collaboratore}" | `VISURA_MESI` | data | no | 15 |
| `idoneita` | "Autocertificazione di idoneità di {collaboratore}" | 12 mesi | data | no | 30 |
| `polizza` (c'è) | "Polizza di {collaboratore}" | 12 mesi | data | no | 30 |
| `albo` | "Iscrizione all'albo di {collaboratore}" | 12 mesi | data | no | 30 |

### 4.6 Cosa fa la migrazione ai dati di oggi

- Ogni **utente** che non è `esterno` riceve la sua **persona**: stesso nome, `utente_id`, `rapporto` = `titolare` per i
  titolari, `''` per gli altri. Nessun costo, nessun saldo, nessuna ora all'anno: **nessun conto cambia**.
- Ogni **veicolo** prende `proprieta = 'persona'`, `tipo = 'auto'`, senza persona: le trasferte restano identiche.
- Permessi: le righe di `esterno`; collaboratore `persone` 1 se era 0.
- Le categorie e i tipi di qualifica, le numerazioni `incarico` e `attrezzatura`, le impostazioni.
- Le tabelle `ore`, `scadenze`, `file` si rifanno (CHECK e colonna facoltativa) con tutte le righe.
- Le scadenze di taratura scritte nella fase 5 come scadenza di un documento (per esempio "Certificato di taratura del
  misuratore di terra") restano come sono: quando si crea lo strumento, il campo **Certificato di taratura** propone i
  documenti della categoria Certificati, e sceglierne uno lega a lui la sua scadenza (`attrezzatura_id`).
- Prova (`server/prove/migrazione-006.test.js`): un database della fase 5 coi rapportini, ore, trasferte e scadenze di
  prova; dopo la migrazione rapportini, ore e trasferte identici campo per campo, il costo della commessa e i soldi della
  Dashboard uguali al centesimo; un rapportino nuovo di Manuel prende lo stesso costo orario di prima.

## 5. Persone

### 5.1 La scheda e chi vede cosa

- Obbligatorio solo `nome`. Il **rapporto** si sceglie a pillole: Titolare · Socio · Dipendente · Apprendista ·
  Tirocinante · A partita IVA nello studio · Altro.
- **Campi personali** (`CAMPI_PERSONALI`, tolti senza `persone` 2, tranne alla persona stessa): `codiceFiscale`,
  `nascitaData`, `nascitaLuogo`, `indirizzo`, `cap`, `citta`, `provincia`, `telefonoPersonale`, `emailPersonale`,
  `iban`, `emergenzaNome`, `emergenzaTelefono`, `contrattoTipo`, `contrattoScade`, `motivoUscita`, `prossimaVisita`,
  `dpi`, `saldi`, `assenze`. **Campi riservati** (`CAMPI_RISERVATI`, tolti senza `riservati`, tranne alla persona stessa
  dove scritto in §3.2): `costoAnno`, `oreAnno`, `notaCosto`, `ccnl`, `livello`, `noteRiservate`, `giudizio`,
  `prescrizioni`, `validoFino`, `protocollo`, e il tipo vero delle assenze sanitarie. `costoOrario` resta dei costi.
  Il server toglie questi campi in un punto solo, come `togliCosti` (in `permessi.js`, funzione `togliPersonali`).
- **Chi modifica**: `persone` 2 tutto (i riservati solo con `riservati` 2; il costo con `costi` 2); **la persona
  stessa** (anche il collaboratore con `persone` 1) cambia i suoi **contatti personali, l'indirizzo, l'IBAN e il
  contatto di emergenza**, e niente altro. Il collaboratore apre le schede dei colleghi solo coi dati di lavoro.
- Il registro scrive `"(riservato)"` al posto dei valori dei campi personali e riservati.

`persona {id}` (persone 1) → vera per Manuel che guarda Marco (accorciata):
```json
{"ok": true, "persona": {"id": 3, "nome": "Marco Rossato", "rapporto": "dipendente", "rapportoNome": "Dipendente",
 "ruoloStudio": "Tecnico elettrico", "mansione": "Lavori elettrici fuori tensione e in prossimità; verifiche",
 "emailLavoro": "marco@esempio.it", "telefonoLavoro": "0445 000301", "entrataIl": "2023-05-02", "uscitaIl": "",
 "oreSettimana": 40, "giorniSettimana": [1, 2, 3, 4, 5], "oreGiorno": 8, "idUtente": 3, "ruoloWisper": "collaboratore",
 "ultimoAccesso": "2026-10-22T08:12:00", "assenteOggi": null,
 "codiceFiscale": "RSSMRC90A01L157X", "telefonoPersonale": "333 0000301", "iban": "IT60X0542811101000000123456",
 "emergenzaNome": "Giulia Rossato", "emergenzaTelefono": "333 0000302", "contrattoTipo": "indeterminato", "contrattoScade": "",
 "prossimaVisita": "2026-11-04",
 "costoOrario": 28.5, "costoDal": "2026-01-01", "costoAnno": 47025, "oreAnno": 1650,
 "ccnl": "Studi professionali", "livello": "3", "noteRiservate": "",
 "saldi": {"ferie": {"tenuto": true, "scritto": 104, "scrittoIl": "2026-09-30", "maturate": 0, "godute": 0, "oggi": 104,
            "prenotate": 40, "restano": 64, "oreGiorno": 8, "giorniOggi": 13, "giorniRestano": 8},
           "permessi": {"tenuto": true, "scritto": 24, "scrittoIl": "2026-09-30", "maturate": 0, "godute": 0, "oggi": 24,
            "prenotate": 3, "restano": 21}},
 "qualifiche": [{"id": 7, "tipo": "pes", "nome": "PES · Persona esperta (CEI 11-27)", "titolo": "Livelli 1A e 1B, 16 ore",
   "data": "2024-02-12", "scade": "2029-02-12", "statoVisto": "Valida", "idDocumento": 31}],
 "visite": [{"id": 2, "data": "2025-11-04", "tipo": "periodica", "giudizio": "idoneo_prescrizioni",
   "giudizioVisto": "Idoneo con prescrizioni", "prescrizioni": "Niente sollevamento di carichi oltre 15 kg",
   "prossima": "2026-11-04", "idDocumento": 40}],
 "dpi": [{"id": 4, "cosa": "Guanti isolanti classe 0", "data": "2026-03-02", "idAttrezzatura": 14, "firmata": true}],
 "mezzi": [{"tipo": "mezzo", "id": 2, "nome": "Fiat Doblò GA123BC", "come": "assegnato", "dal": "2025-01-10"}],
 "attrezzature": [{"id": 4, "codice": "AT004", "nome": "Multimetro 87V", "come": "assegnato", "taratura": "Taratura scaduta"}],
 "documenti": [{"id": 41, "titolo": "Cedolino settembre 2026", "categoria": "Cedolini", "vede": "riservati"}],
 "scadenze": [{"id": 31, "titolo": "Primo soccorso di Marco Rossato", "data": "2026-09-20", "statoVisto": "Scaduta da 32 giorni"}],
 "puoScrivere": true, "puoVedereRiservati": true, "daCompletare": []}}
```
Lo stesso visto da **Laura** (amministrazione: `persone` 2, `costi` 2, `riservati` 0): niente `costoAnno`, `oreAnno`,
`ccnl`, `livello`, `noteRiservate`, `giudizio`, `prescrizioni`, i documenti riservati non ci sono; c'è
`costoOrario`. Visto da **Marco** (sé stesso): tutto tranne `costoOrario`, `costoAnno`, `oreAnno`, `costoDal`. Visto
da un **collaboratore** che apre un collega: solo i campi di lavoro e `assenteOggi: {"dal": "2026-10-22", "al":
"2026-10-23", "tipoVisto": "Assente"}`.
`daCompletare`: le frasi di quello che serve a un conto ("Manca il costo orario: le sue ore usano il costo dello
studio"), solo a chi può scriverle.

### 5.2 Persona e accesso a Wisper

- **Dai l'accesso a Wisper** (`daiAccesso {idPersona, email, ruolo}`, amministrazione 2): crea l'utente (§12.8
  dell'architettura: password iniziale, che torna solo in questa risposta) col nome della persona e lo lega. Errori di
  `salvaUtente`, più `"Marco Rossato ha già l'accesso"`.
- **Togli l'accesso**: dalla scheda (amministrazione 2) = `salvaUtente {attivo: false}` (le sessioni escono); la persona
  resta.
- Amministrazione › Utenti (fase 1): ogni utente ha la riga **Scheda della persona** →; un utente nuovo crea la persona
  (§3.1). Un utente `esterno` ha la riga **Scheda del collaboratore** →.

### 5.3 Competenze, abilitazioni e formazione

Tipi iniziali (`qualifica_tipi`, proposte **da confermare** con l'RSPP e con Manuel, ricerca §2):

| Chiave | Nome | Gruppo | Ogni (mesi) | Preavviso |
|---|---|---|---|---|
| `pes` | PES · Persona esperta (CEI 11-27) | elettrico | 60 (aggiornamento) | 90 |
| `pav` | PAV · Persona avvertita (CEI 11-27) | elettrico | 60 | 90 |
| `pei` | PEI · Lavori sotto tensione (CEI 11-27) | elettrico | 60 | 90 |
| `formazione_generale` | Formazione generale dei lavoratori | sicurezza | — | — |
| `formazione_specifica` | Formazione specifica dei lavoratori | sicurezza | 60 (aggiornamento di 6 ore) | 90 |
| `preposto` | Preposto | sicurezza | 24 | 60 |
| `datore` | Datore di lavoro (accordo 2025) | sicurezza | 60 | 90 |
| `rspp_datore` | Datore di lavoro che fa da RSPP | sicurezza | 60 | 90 |
| `rls` | Rappresentante dei lavoratori per la sicurezza | sicurezza | 12 | 30 |
| `primo_soccorso` | Primo soccorso | emergenza | 36 | 60 |
| `antincendio` | Antincendio | emergenza | 60 | 60 |
| `quota` | Lavori in quota e DPI anticaduta | sicurezza | 60 | 60 |
| `ple` | Piattaforme di lavoro elevabili | sicurezza | 60 | 60 |
| `patente` | Patente di guida | altro | — (si scrive la scadenza) | 60 |
| `altro` | Altro | altro | — | 30 |

- PES, PAV, PEI sono **attribuzioni scritte del datore di lavoro** dopo il corso: la qualifica tiene la data
  dell'attribuzione, il corso nel `titolo` ("Livelli 1A e 1B, 16 ore"), e il documento è la **lettera di attribuzione**
  firmata (categoria Attestati e abilitazioni). Per il titolare, l'autocertificazione.
- Salvare una qualifica con `scade` crea la sua scadenza (`formazione` o `abilitazione`, `persona_id`, `qualifica_id`).
  **Rinnova** (aggiornamento fatto) crea la qualifica nuova dello stesso tipo e segna fatta la scadenza della vecchia
  (che resta nello storico).
- Stato visto della qualifica: **Valida** "fino al 12/02/2029", **Scade fra N giorni** (nel preavviso), **Scaduta** "da
  32 giorni", **Non scade**. Colori come le scadenze.

### 5.4 Visite mediche

- Solo se la valutazione dei rischi prevede la sorveglianza sanitaria (da confermare col DVR): niente visite, niente
  avvisi.
- `salvaVisita {visita: {id?, idPersona, data, tipo, giudizio?, prescrizioni?, validoFino?, prossima?, medico?, idFile?}}`
  (persone 2; `giudizio`, `prescrizioni`, `validoFino` e il documento vogliono `riservati` 2: l'amministrazione segna la
  data e la prossima visita, non il giudizio). `prossima` crea o sposta la scadenza `visita_medica`.
- Parole del giudizio: **Idoneo**, **Idoneo con prescrizioni**, **Non idoneo per ora** (fino al …), **Non idoneo**. Chi
  non ha `riservati` vede soltanto "Visita del 04/11/2025 · prossima il 04/11/2026".
- Nella pagina la riga fissa (non è una frase d'aiuto: è una regola della pagina, come quella della firma) **"Qui va solo
  il giudizio del medico, non la diagnosi"**.
- `non_idoneo` o `non_idoneo_temporaneo`: la Dashboard del titolare (urgenti) "Marco Rossato non è idoneo alla mansione
  fino al …" (con `riservati`; agli altri niente).

### 5.5 DPI consegnati

- Registro delle consegne: cosa (proposte a pillole: Guanti isolanti, Elmetto con visiera, Calzature di sicurezza,
  Occhiali, Imbracatura anticaduta, Tuta, Otoprotettori, Altro), taglia, quanti, data, scadenza facoltativa, ed
  eventualmente **il DPI del catalogo** (quelli con matricola e verifica periodica: §7.5).
- **Firma di chi riceve**: sul telefono di chi consegna (come la firma del cliente, foglio bianco: "Ricevuto da Marco
  Rossato · {cosa} · {data}", **Conferma la firma**), oppure dopo, dal telefono della persona (la consegna compare nella
  sua Dashboard: "Firma la consegna: Elmetto con visiera"). La firma è un file `firma_consegna`.
- **Restituito**: data; un DPI del catalogo torna disponibile.
- Si vedono nella scheda della persona (dati personali) e in Mezzi e attrezzature › DPI.

### 5.6 Documenti personali

- Sono documenti della fase 5 con `persona_id` e una delle categorie di §4.5. **Carica** dalla scheda (anche più file
  insieme: i cedolini del mese); la categoria si propone dal nome del file ("cedolino" → Cedolini, "contratto" →
  Contratti di lavoro, "idoneità" → Idoneità sanitarie), si cambia.
- La persona vede i suoi (anche riservati) dal telefono: scheda › Documenti; scaricare un suo documento non va nel
  registro degli accessi (sono suoi).

### 5.7 Il registro dei dati riservati

- Il server scrive una riga in `accessi_riservati` quando: una risposta contiene campi riservati di **un'altra**
  persona (`visto`, una riga per utente, persona e cosa al giorno, per non riempire il registro); si scarica un
  documento riservato di un'altra persona (`scaricato`, sempre); si cambia un campo riservato (`cambiato`); si esporta
  qualcosa con dati riservati (`esportato`).
- `accessiRiservati {idPersona?, da?, a?, utente?, pagina?}` (titolare, o la persona per i suoi), 100 per pagina:
  ```json
  {"ok": true, "pagina": 1, "pagine": 1, "quanti": 3,
   "righe": [{"quando": "2026-10-22T09:41:00", "utente": "Manuel Gasparotto", "persona": "Marco Rossato",
              "cosa": "documento", "azione": "scaricato", "frase": "Ha scaricato «Cedolino settembre 2026»", "disp": "Wisper Ufficio"}]}
  ```
- Dove si legge: scheda della persona › ⋯ › **Chi ha visto i dati riservati**; Amministrazione › Registro attività, filtro
  **Dati riservati** (solo titolare).

## 6. Ferie, permessi e assenze

### 6.1 Tipi e stati

| Tipo | Parola | Si chiede o si segnala | In ore o giorni | Chi vede il tipo |
|---|---|---|---|---|
| `ferie` | Ferie | si chiede (approvazione) | giorni (anche mezza giornata) | `persone` 2 e la persona; il collaboratore vede i colleghi come **Assente** |
| `permesso` | Permesso | si chiede | ore (dalle-alle) | come sopra |
| `altro` | la causale ("Lutto") | si chiede | giorni o ore | come sopra |
| `malattia` | Malattia | **si segnala**: nasce approvata | giorni | `riservati` e la persona; gli altri **Assente** |
| `infortunio` | Infortunio | si segnala | giorni | come malattia |
| `congedo` | Congedo | si segnala | giorni | come malattia |
| `legge104` | Legge 104 | si segnala | giorni o ore | come malattia |

- Stati (lo schema della fase 3): **Bozza**, **Da approvare** (giallo tenue), **Approvata** (verde), **Respinta** (rosso
  tenue, col motivo), **Annullata** (grigia). Le assenze che si segnalano non si approvano né si respingono: nascono
  approvate (la legge non lascia scegliere) e si possono solo annullare.
- **Malattia**: dal, al (anche aperta: "fino a quando?" si allunga dopo), il **numero di protocollo del certificato**
  (facoltativo, riservato). **Mai il motivo**.
- Una persona non ha due assenze approvate o da approvare nello stesso giorno: `"Il 03/11 sei già in ferie: cambia
  quella richiesta"` (un permesso a ore in un giorno di ferie no; due permessi in ore diverse sì).

### 6.2 Giorni lavorativi e ore

`giorniLavorativi(dal, al, giorniSettimana, festivi)` in `server/src/conti.js`: i giorni del periodo che sono nei giorni
lavorativi della persona e non sono festivi. **Festivi** (`festivi(anno, patrono)`): 1/1, 6/1, Pasquetta (lunedì dopo
Pasqua, calcolata), 25/4, 1/5, 2/6, 15/8, **4/10 (dal 2026)**, 1/11, 8/12, 25/12, 26/12, e `FESTA_PATRONO`. Le
**chiusure** dello studio non sono festivi: sono assenze (§6.6).
- Ferie: `ore` = giorni lavorativi × ore del giorno della persona; mezza giornata = metà. Permesso: `dalle`-`alle` (con
  la regola della mezzanotte della fase 3 no: un permesso sta in un giorno) o `ore` scritte. Malattia: `giorni` =
  giorni di calendario (servono al consulente), `ore` = giorni lavorativi × ore del giorno.
- Ore del giorno della persona = `ore_settimana` / numero di `giorni_settimana` (di base 40 / 5 = 8).

### 6.3 I conti condivisi

In `server/src/conti.js`, coi casi in **`server/prove/casi-persone.json`** (telefono e computer li rifanno per
l'anteprima e devono ritrovare gli stessi numeri):
- `festivi(anno, patrono)` → l'elenco dei giorni.
- `giorniLavorativi(dal, al, giorniSettimana, festivi)` → numero.
- `oreAssenza({tipo, dal, al, mezza, dalle, alle, ore}, persona, festivi)` → `{giorni, ore}`.
- `saldoAssenze({annue, saldi, assenze, oggi, entrata, uscita})` → `{tenuto, scritto, scrittoIl, maturate, godute, oggi,
  prenotate, restano}`. **Maturate** = `centesimi(annue × mesi / 12)`, dove `mesi` = i mesi che **finiscono** dopo
  `scrittoIl` e entro oggi (e dentro entrata-uscita); senza saldo scritto si parte da 0 al primo giorno del mese di
  entrata o dal 1° gennaio, quello che viene dopo. **Godute**: ore delle assenze approvate del tipo nei giorni dopo
  `scrittoIl` fino a oggi compreso (un'assenza a cavallo conta solo i suoi giorni dopo). **Prenotate**: approvate da
  domani più da approvare. Il rateo del mese di entrata e di uscita è pieno: **da confermare** col CCNL.
- `costoOrarioDaAnno(costoAnno, oreAnno)` → `centesimi(costoAnno / oreAnno)`.

Casi (estratto; il file completo li ha tutti):
```json
{"giorniLavorativi": [
  {"nome": "ferie di Marco, lunedì-venerdì", "dal": "2026-11-02", "al": "2026-11-06", "giorni": [1,2,3,4,5], "patrono": "", "atteso": 5},
  {"nome": "Natale con la chiusura", "dal": "2026-12-24", "al": "2027-01-06", "giorni": [1,2,3,4,5], "patrono": "", "atteso": 7},
  {"nome": "il 4 ottobre del 2027 è lunedì", "dal": "2027-10-01", "al": "2027-10-08", "giorni": [1,2,3,4,5], "patrono": "", "atteso": 5},
  {"nome": "Pasquetta 2027", "dal": "2027-03-29", "al": "2027-04-02", "giorni": [1,2,3,4,5], "patrono": "", "atteso": 4}],
 "oreAssenza": [
  {"nome": "mezza giornata di Laura a 30 ore", "assenza": {"tipo": "ferie", "dal": "2026-11-09", "al": "2026-11-09", "mezza": "mattina"},
   "persona": {"oreSettimana": 30, "giorniSettimana": [1,2,3,4,5]}, "atteso": {"giorni": 0.5, "ore": 3}},
  {"nome": "permesso dalle 15 alle 18", "assenza": {"tipo": "permesso", "dal": "2026-10-30", "al": "2026-10-30", "dalle": "15:00", "alle": "18:00"},
   "persona": {"oreSettimana": 40, "giorniSettimana": [1,2,3,4,5]}, "atteso": {"giorni": 0, "ore": 3}}],
 "saldoAssenze": [
  {"nome": "Marco oggi, con la richiesta del 2-6 novembre", "annue": 208, "oggi": "2026-10-22",
   "saldi": [{"data": "2026-09-30", "ore": 104}],
   "assenze": [{"dal": "2026-11-02", "al": "2026-11-06", "ore": 40, "stato": "da_approvare"}],
   "atteso": {"tenuto": true, "scritto": 104, "maturate": 0, "godute": 0, "oggi": 104, "prenotate": 40, "restano": 64}},
  {"nome": "Marco il 10 novembre, ferie godute e ottobre maturato", "annue": 208, "oggi": "2026-11-10",
   "saldi": [{"data": "2026-09-30", "ore": 104}],
   "assenze": [{"dal": "2026-11-02", "al": "2026-11-06", "ore": 40, "stato": "approvata"}],
   "atteso": {"tenuto": true, "scritto": 104, "maturate": 17.33, "godute": 40, "oggi": 81.33, "prenotate": 0, "restano": 81.33}},
  {"nome": "Laura oggi, primo giorno di ferie", "annue": 156, "oggi": "2026-10-22",
   "saldi": [{"data": "2026-09-30", "ore": 78}],
   "assenze": [{"dal": "2026-10-22", "al": "2026-10-22", "ore": 6, "stato": "approvata"}, {"dal": "2026-10-23", "al": "2026-10-23", "ore": 6, "stato": "approvata"}],
   "atteso": {"tenuto": true, "scritto": 78, "maturate": 0, "godute": 6, "oggi": 72, "prenotate": 6, "restano": 66}},
  {"nome": "senza ore all'anno né saldo", "annue": null, "oggi": "2026-10-22", "saldi": [], "assenze": [],
   "atteso": {"tenuto": false}}],
 "costoOrarioDaAnno": [{"costoAnno": 47025, "oreAnno": 1650, "atteso": 28.5}, {"costoAnno": 26880, "oreAnno": 1200, "atteso": 22.4}]}
```
(Nei casi `assenze` hanno già le ore: `saldoAssenze` non ricalcola i giorni. Per le assenze a cavallo del saldo il caso
completo le dà giorno per giorno.)

### 6.4 Approvazione

Lo schema della fase 3 (§14.1 e §14.6 dell'architettura), con il tipo nuovo `assenza`:
- **Chi approva**: titolare e amministrazione con `persone` 2. **Nessuno approva le proprie assenze, tranne il
  titolare**: le richieste dell'amministrazione vanno al titolare (`"Le tue ferie le approva il titolare"`).
- **Impostazione `APPROVAZIONE`** (fase 3): `collaboratori` (di base) = vanno approvate le richieste di chi non è
  titolare (per le assenze anche quelle dell'amministrazione, per la regola sopra); `tutti` = anche quelle del titolare
  (che può approvare le sue); `nessuno` = nascono approvate.
- `daApprovare` (fase 3) contiene anche le voci `assenza` per chi può approvarle:
  `{"tipo": "assenza", "id": 12, "idUtente": 3, "data": "2026-11-02", "cosa": "Ferie", "dettaglio": "Da lunedì 2 a
  venerdì 6 novembre · 5 giorni · restano 8 giorni", "quanto": 40, "unita": "ore", "anomalie": [{"tipo": "impegni",
  "testo": "Ha 1 attività in quei giorni: Sopralluogo quadri Batokyo martedì 3"}]}`. Le persone senza accesso compaiono
  col nome (`idUtente: null`, `idPersona`).
- **Anomalie** (in giallo scuro): `saldoNegativo` ("Dopo questa richiesta restano −8 ore di ferie"), `colleghiAssenti`
  ("Negli stessi giorni è assente anche Laura Bianchi"), `impegni` ("Ha 2 attività in quei giorni: …", le attività
  aperte assegnate a lui, interventi compresi), `oreRegistrate` (ore o rapportini già scritti in quei giorni).
- `approva`, `respingi {motivo}`, `annullaApprovazione` accettano `{tipo: "assenza", id}` (persone 2). Il motivo del
  rifiuto arriva a chi ha chiesto (Dashboard, registro, riga). Una ferie approvata e già cominciata non si rimette da
  approvare (`"Le ferie sono già cominciate: annullale dal giorno di oggi"`).
- **Annullare**: chi ha chiesto annulla la sua finché non comincia (`annullaAssenza {id}`); chi approva annulla
  sempre, col motivo; una ferie in corso si **accorcia** (`salvaAssenza {id, al: ieri}`), non si annulla.
- Nella pagina **Ferie e permessi** c'è il segmento **Da approvare** (le stesse voci); l'elenco generale di Ore e
  rapportini › Da approvare le mostra insieme alle altre, raggruppate per persona.

### 6.5 Calendario, attività e giorni senza rapportino

- **Calendario e pianificazione settimanale** (fase 2): le assenze approvate sono una fascia sul giorno della persona
  ("Ferie", "Permesso 15:00-18:00", o "Assente" per chi non vede il tipo); quelle da approvare tratteggiate con
  "da approvare". Le chiusure sono una fascia su tutti ("Studio chiuso: Natale"). Si leggono da `assenze {da, a}`.
- `salvaAttivita` e `pianificaTicket` (fasi 2 e 5) per una persona assente quel giorno rispondono come per le
  sovrapposizioni: `{"ok": false, "errore": "Marco Rossato è in ferie quel giorno (dal 2 al 6 novembre)", "assenti":
  [{"idUtente": 3, "nome": "Marco Rossato", "dal": "2026-11-02", "al": "2026-11-06", "tipoVisto": "Ferie"}],
  "serveConferma": true}`; con `conferma: true` si salva. Un permesso a ore conta solo se si accavalla con l'orario.
- **Approvare** ferie che toccano attività già assegnate fa nascere la voce della Dashboard (da pianificare) "Marco
  Rossato è in ferie martedì 3: ha il Sopralluogo quadri Batokyo" (a chi approva e a chi ha creato l'attività).
- **Giorni senza rapportino** (fase 1 §12.7) e la settimana di **Il tuo giorno**: un giorno di assenza approvata a
  giornata intera, un festivo o una chiusura **non è un giorno che manca**; nella settimana del telefono il giorno mostra
  "ferie" (o "assente", "festa", "chiuso") in grigio, non "manca".
- **Ore** (fase 3): `giorni` di `ore {}` ha in più `assenza` (`"Ferie"`, `"Assente"`, `""`); anomalia nuova di
  `daApprovare`: `inAssenza` ("Ore in un giorno di ferie").

### 6.6 Chiusure dello studio

`salvaChiusura {chiusura: {id?, nome, dal, al, ferie}, conferma?}` (persone 2): con `ferie: true` fa nascere, per ogni
persona attiva quei giorni con le ferie tenute (`ferie_annue_ore`), un'assenza `ferie` **approvata** con `chiusura_id`
(prima risposta `serveConferma`: "Nascono le ferie di Natale per 2 persone: Laura Bianchi 7 giorni (42 ore), Marco
Rossato 7 giorni (56 ore)"). Chi ha già un'assenza in quei giorni la tiene (si salta quel giorno). Cambiare o togliere la
chiusura rifà o toglie quelle assenze (non quelle cambiate a mano). Senza `ferie`: solo la fascia "Studio chiuso".

### 6.7 Presenze del mese

`presenze {mese: "2026-10", idPersona?}` (persone 1; il collaboratore solo la sua):
```json
{"ok": true, "mese": "2026-10", "festivi": ["2026-10-04"], "chiusure": [],
 "persone": [{"idPersona": 2, "nome": "Laura Bianchi", "oreGiorno": 6,
   "giorni": [{"data": "2026-10-12", "previste": 6, "lavorate": 0, "straordinarie": 0, "assenza": {"tipoVisto": "Malattia", "ore": 6}, "manca": 0},
              {"data": "2026-10-20", "previste": 6, "lavorate": 4, "straordinarie": 0, "assenza": null, "manca": 2}],
   "totali": {"giorniLavorati": 13, "oreLavorate": 78, "straordinarie": 0, "ferie": 12, "permessi": 0,
              "malattia": {"giorni": 2, "ore": 12}, "altreAssenze": 0, "mancano": 2}}],
 "programmaPaghe": "non collegato"}
```
- `lavorate` = ore registrate (mandate o approvate) + ore dei rapportini non annullati (lavoro + extra + viaggio) di
  quel giorno; `straordinarie` = ore di tipo straordinaria + ore extra dei rapportini; `manca` = previste − lavorate −
  ore di assenza, se positivo. Per chi non vede il tipo, le assenze sanitarie sono `"Assente"` e nei totali vanno in
  `altreAssenze`.
- **Esporta per il consulente** (`esporta {cosa: "presenze", mese}`): una riga per persona e giorno (Data, Persona, Ore
  previste, Lavorate, Straordinarie, Assenza, Ore di assenza, Mancano) più le righe dei totali; con i tipi sanitari solo
  con `riservati` (nota `esportato` nel registro degli accessi). Riga **Programma paghe del consulente · Non
  collegato**.

## 7. Mezzi e attrezzature

### 7.1 Il mezzo

- Dati: nome, targa, tipo, di chi è (**Dello studio** · **Auto di una persona**: quale), immatricolazione, alimentazione,
  euro al km e anno ACI (fase 3, solo per le auto delle persone: rimborso km), tagliando (ogni quanti km e/o mesi,
  ultimo), note.
- **Chi ce l'ha**: per un mezzo dello studio l'assegnazione in corso (§7.7): **Disponibile** (verde), **Assegnato a
  Marco Rossato** (blu), **In prestito a … fino al …** (blu), **In officina** (ambra: una manutenzione `in_officina` o con
  `fermo`), **Fermo** (rosso: assicurazione o revisione scadute, o guasto con `fermo`: "Non si usa: revisione scaduta").
  Un'auto di una persona: "Auto di Manuel Gasparotto" e il rimborso km.
- **Scadenze** del mezzo: assicurazione, bollo, revisione, tagliando (righe di `scadenze` con `veicolo_id`). La
  **revisione** si propone da sola: senza revisioni, l'ultimo giorno del mese dell'immatricolazione + 4 anni; segnata
  fatta, l'ultimo giorno del mese della revisione + 24 mesi (`scadenzaRevisione` in conti.js, casi in
  `casi-mezzi.json`: immatricolato il 05/11/2021 → 30/11/2025; revisione fatta il 12/11/2025 → 30/11/2027). Sopra 3,5 t
  ogni anno: tipo `altro` col suo intervallo.
- Una **trasferta** (fase 3) col mezzo con assicurazione o revisione scaduta si salva (è il racconto di quello che è
  successo) con la voce urgente in Dashboard; il picker dei veicoli mostra la pillola **Fermo** accanto.

### 7.2 Km e tagliando

- **Segna i km** (`segnaKm`): data (oggi), km, foto del contachilometri facoltativa. Controlli: km non meno dell'ultima
  lettura di un giorno uguale o precedente (`"Km: l'ultima lettura era 84.320 il 18/10"`); più di 5.000 km in più in
  meno di 7 giorni = `serveConferma` ("Sono 6.200 km in 3 giorni: è giusto?"). La lettura più recente aggiorna `km` e
  `km_il` del mezzo.
- Anche una **spesa di carburante** (fase 3) con il mezzo e i km del contachilometri fa nascere una lettura
  (`origine: rifornimento`), e una manutenzione chiusa coi km (`origine: manutenzione`).
- **Tagliando a km**: `kmAlTagliando` = `tagliando_ultimo_km + tagliando_km − km`; sotto `KM_TAGLIANDO_AVVISO` la voce
  della Dashboard "Fiat Doblò GA123BC: tagliando fra 800 km" (anche negativo: "tagliando passato di 300 km"). Una
  manutenzione `tagliando` chiusa coi km aggiorna `tagliando_ultimo_km` e segna fatta la scadenza del tagliando.

### 7.3 Guasti e manutenzioni

- **Segnala un guasto** (telefono, anche senza rete): cosa succede (una riga), foto (fotocamera, anche più di una),
  "Si può usare?" **Sì** · **No, è fermo**, km (proposti dall'ultima lettura). Nasce una manutenzione `guasto` `aperta`
  segnalata da chi la scrive; con `fermo` il mezzo o lo strumento diventa **Fermo** e non si propone (trasferte, Lo
  prendo io, strumenti del rapportino).
- **Manutenzioni** programmate o fatte (tagliando, gomme, revisione, riparazione): `salvaManutenzione` (mezzi 2). Stati
  **Segnalato**, **In officina** (mezzi) o **In riparazione** (attrezzature), **Risolto**. Il **costo** non si scrive
  qui: si collega la **spesa** (fase 3) o la **fattura ricevuta** dell'officina (fase 4): `idSpesa` | `idRicevuta`. Così
  non si conta due volte.
- Un guasto non è un ticket: i ticket sono per gli impianti dei clienti (fase 5).
- Chiudere la riparazione di uno **strumento** con taratura lo porta a **Taratura non scritta** (§3.8).

### 7.4 Costi

`costiMezzo {id, anno?}` (mezzi 1 **e** `costi` 1):
```json
{"ok": true, "anno": 2026, "km": {"primo": 65920, "ultimo": 84320, "anno": 18400},
 "voci": [{"chiave": "carburante", "nome": "Carburante", "importo": 1240.6, "quante": 31},
          {"chiave": "pedaggi", "nome": "Pedaggi e parcheggi", "importo": 186.4, "quante": 22},
          {"chiave": "manutenzioni", "nome": "Manutenzioni", "importo": 380, "quante": 1},
          {"chiave": "assicurazione", "nome": "Assicurazione", "importo": 612, "quante": 1},
          {"chiave": "bollo", "nome": "Bollo", "importo": 198, "quante": 1}],
 "totale": 2617, "euroKm": 0.14}
```
- Da dove: spese della fase 3 col `veicolo_id` (carburante, pedaggio, parcheggio; le altre in "altro"), fatture
  ricevute col `veicolo_id` (manutenzioni se legate a una manutenzione, assicurazione con categoria, altro), impegni
  pagati col `veicolo_id` (bollo, rate). Una spesa legata a una fattura ricevuta (`spesa_id`) si conta una volta.
  `euroKm` = totale / km dell'anno, al centesimo (`null` sotto 1.000 km).
- La **Nuova spesa** (fase 3) con categoria carburante, pedaggio o parcheggio mostra **Per quale mezzo** (pillole dei
  mezzi che ho, poi gli altri; "Nessuno") e, per il carburante, **Km del contachilometri** (facoltativo).
- Le fatture ricevute (fase 4) hanno in più, nella pagina della ricevuta, **Mezzo** e **Strumento** da scegliere come
  la commessa.

### 7.5 Attrezzature e strumenti

- Un catalogo solo (`attrezzature`) con le **categorie**: **Strumenti di misura** (con taratura), **Attrezzi**,
  **Informatica** (portatili, telefoni, tablet), **DPI** (quelli con matricola e verifica: guanti isolanti, imbracature,
  elmetti dielettrici), **Altro**.
- Dati: codice (AT003, proposto), nome, marca, modello, matricola, di chi è (dello studio, a noleggio, di una persona,
  del cliente), acquistato il, fornitore, posizione, controllo periodico (taratura per gli strumenti, verifica per i DPI)
  ogni N mesi e il laboratorio di solito, documenti (manuale, certificati).
- **Stato visto** (uno solo, il più importante): **Fuori uso** (rosso: non conforme, guasto, perso), **In taratura** /
  **In riparazione** (blu: dal laboratorio o in assistenza, "rientra il 29/10"), **Taratura scaduta** (rosso), **In
  prestito a …** (blu), **Assegnato a …** (blu), **Disponibile** (verde); più la pillola della taratura quando c'è
  (§7.6). **Dismesso** (grigio) esce dagli elenchi.
- `statoTaratura({controllo, ultima, fuoriUso, inLaboratorio}, oggi, preavviso)` in conti.js (casi in
  `casi-mezzi.json`) → `{stato, parola, giorni}`: `valida` "Tarato fino al 08/04/2027"; `in_scadenza` "Taratura fra 24
  giorni"; `scaduta` "Taratura scaduta da 6 giorni"; `laboratorio` "In taratura"; `non_conforme` "Non conforme"; `senza`
  "Taratura non scritta". Per i DPI le stesse con "Verifica" al posto di "Taratura" ("Verifica fra 12 giorni").

### 7.6 Tarature

- **Registra la taratura** (`registraTaratura`, mezzi 2): data, esito (**Conforme** · **Regolato** · **Non
  conforme**), scade il (proposta: data + mesi), laboratorio, numero del certificato, il **certificato** (file con
  `/carica`: documento categoria Certificati di taratura, legato allo strumento), il costo (la fattura ricevuta del
  laboratorio, facoltativa).
- Effetti: la scadenza `taratura` aperta si segna fatta col documento e nasce la prossima con la data `scade`; un
  prestito `laboratorio` in corso si chiude (lo strumento torna a chi l'aveva prima, se si sceglie, o disponibile).
- **Non conforme**: lo strumento diventa **Fuori uso · Non conforme**; la risposta ha `usiDaControllare` (gli
  `strumenti_usati` dall'ultima taratura buona: data, rapportino, ticket, cliente, impianto, chi), la pagina li mostra
  con la frase "Usato in 6 interventi dal 15/11/2025: controlla se le misure valgono" e ognuno apre il suo rapportino.
  Una taratura conforme dopo lo rimette in uso.
- **Manda in taratura** (`assegna {tipo: "laboratorio", idSoggetto, rientro}`): stato **In taratura**, "rientra il …";
  passata la data, voce della Dashboard "Analizzatore di rete AR-6: doveva rientrare dal laboratorio ieri".

### 7.7 Assegnazioni e prestiti

- **Assegnato**: stabile, a una persona (il furgone di Marco, il suo multimetro). **Prestito**: per un periodo, con il
  rientro previsto, a una persona, a una **commessa** (lo strumento lasciato in cantiere) o a un **collaboratore
  esterno**. **Laboratorio** e **Riparazione**: a un fornitore, col rientro.
- Una sola assegnazione in corso per cosa: assegnarne una nuova chiude quella in corso (lo storico resta: "dal 10/01/2025
  al 22/10/2026 a Marco Rossato").
- **Lo prendo io** (telefono, `mezzi` 1): una cosa **Disponibile** diventa in prestito a me (rientro proposto: oggi, si
  cambia) o assegnata a me se chi la prende ha `mezzi` 2 e lo sceglie. **Restituisci**: chiude il mio prestito; la cosa
  torna **Disponibile** (o a chi l'aveva assegnata, se era un prestito da un'assegnazione: la riga "Torna a Marco
  Rossato"). Una cosa **Fermo**, **Fuori uso** o al laboratorio non si prende.
- **Firma alla consegna** facoltativa (strumenti costosi, DPI): come la firma della consegna DPI (§5.5).
- Prestito passato il rientro: voce della Dashboard (urgenti) "Imbracatura anticaduta AT015: doveva rientrare ieri" ·
  "In prestito a Impianti Veneti di Sartori Luca dal 14/10".

### 7.8 Strumenti usati negli interventi

- `salvaRapportino` accetta `strumenti: [{idAttrezzatura, confermato?}]` (l'elenco intero, come la checklist delle
  attività). Il server scrive `strumenti_usati` con lo stato e la scadenza **di quel giorno** (la data del rapportino);
  `confermato` vale solo per uno scaduto. Con `TARATURA_BLOCCO = blocco`, uno scaduto non confermabile e uno non
  conforme o al laboratorio si salvano lo stesso (§3.8: mai rifiutare un rapportino della coda) con lo stato vero, e il
  rapportino ha in più `strumentiDaGuardare` per la Dashboard.
- La risposta del rapportino ha `strumenti: [{"idAttrezzatura": 4, "codice": "AT004", "nome": "Multimetro 87V",
  "matricola": "6011-2381", "scadeAllora": "2026-10-16", "statoAllora": "scaduta", "confermato": true}]`.
- Il **ticket** (fase 5) mostra `strumenti` dai suoi rapportini; `usiStrumento {idAttrezzatura, da?, a?}` (mezzi 1) dà gli
  usi di uno strumento.
- Versioni vecchie e ponte non mandano `strumenti`: niente cambia.

## 8. Collaboratori esterni

### 8.1 La scheda e l'idoneità

`collaboratore {id}` (collaboratori 1; l'esterno solo il suo) → vera, accorciata:
```json
{"ok": true, "collaboratore": {"idSoggetto": "F004", "nome": "Impianti Veneti di Sartori Luca", "tipo": "impresa",
 "tipoNome": "Impresa", "mestiere": "Impianti elettrici civili e industriali", "abilitazioni": "DM 37/2008, lettere A e B",
 "tariffa": 32, "referenteId": 1, "referente": "Manuel Gasparotto", "attivo": true,
 "partitaIva": "01234567897", "telefono": "0445 000401", "email": "info@impiantiveneti.example", "citta": "Thiene",
 "idoneita": {"stato": "in_regola", "parola": "In regola", "mancano": [], "scaduti": [],
   "prossima": {"tipo": "durc", "data": "2026-10-29", "giorni": 7}},
 "documenti": [{"id": 51, "titolo": "DURC", "tipoScadenza": "durc", "data": "2026-07-01", "scade": "2026-10-29", "statoVisto": "Scade fra 7 giorni"}],
 "incarichi": {"inCorso": 1, "conclusi": 2, "daValutare": 1},
 "compensi": {"pattuito": 3712, "maturato": 2304, "fatturato": 1200, "daFatturare": 1104, "daPagare": 0},
 "valutazioni": {"bene": 1, "problemi": 0, "male": 0},
 "accessi": [{"idUtente": 6, "nome": "Luca Sartori", "email": "luca@impiantiveneti.example", "ultimoAccesso": "2026-10-21T17:40:00", "attivo": true}],
 "programmaDurc": "non collegato", "puoScrivere": true}}
```
- `idoneita.stato`: `in_regola` | `manca` ("Manca il DURC") | `scaduti` ("DURC scaduto il 12/10"); per tipo da
  `COLLAB_DOCUMENTI`; un documento conta se è nella categoria Documenti dei collaboratori col tipo di scadenza giusto e
  non è scaduto.
- I documenti del collaboratore si caricano dalla scheda (**Aggiungi un documento**: il tipo a pillole DURC · Visura ·
  Autocertificazione di idoneità · Polizza · Iscrizione all'albo · Altro; la data; la scadenza proposta da §4.5) o li
  carica lui, se ha l'accesso. Riga **Scarica il DURC dal portale DURC On Line · Non collegato**.
- `compensi` somma gli incarichi non annullati **affidati nell'anno in corso** più quelli di prima che hanno ancora
  qualcosa da fatturare o da pagare (gli anni chiusi si vedono in Compensi, scegliendo l'anno).
- Senza `costi`: niente `tariffa`, niente `compensi` (tranne all'esterno per i suoi, §8.4).

### 8.2 Incarichi

| Da | Azione | A | Note |
|---|---|---|---|
| — | `salvaIncarico` (nuovo) | `bozza` | numero IN/aaaa/nnn alla nascita |
| `bozza` | `affidaIncarico {conferma?}` | `affidato` | idoneità non in regola → `serveConferma` con cosa manca; `affidato_il`; l'esterno vede la commessa |
| `affidato` | `aggiornaAvanzamento {avanzamento}` | `affidato` | solo a corpo; 0-100 |
| `affidato` | `concludiIncarico` | `concluso` | a corpo l'avanzamento va a 100; `concluso_il` |
| `concluso` | `riapriIncarico {motivo}` | `affidato` | |
| `bozza`, `affidato` | `annullaIncarico {motivo}` | `annullato` | non con fatture ricevute collegate (`"L'incarico ha la fattura 18/2026: scollegala prima"`) |
| `concluso` | `valutaIncarico {valutazione, nota?}` | `concluso` | si cambia finché si vuole |

- Campi: collaboratore, **commessa** (obbligatoria; e la prestazione, facoltativa), titolo, descrizione, **come si
  paga** (**A corpo**: compenso; **A ore**: tariffa proposta dalla scheda, ore previste, tetto facoltativo), le spese
  sono comprese (di base sì), dal-al previsti, chi lo segue nello studio, lettera d'incarico.
- **Lettera d'incarico**: modello testo nuovo `LETTERA_INCARICO` (fase 5 §5.7) coi segnaposti nuovi `{collaboratore}`,
  `{incarico}`, `{compenso}` (solo con `costi`), `{descrizione}`, più quelli che ci sono (`{commessa}`, `{cliente}`,
  `{dal}`, `{al}`, `{studio}`, `{oggi}`); `componiModello` accetta `idIncarico`; **Crea il PDF** e **Salva
  nell'archivio** (categoria Lettere d'incarico, legata all'incarico). Firmata, si carica come documento dell'incarico.
- **Ore**: se l'esterno ha l'accesso, scrive lui ore e rapportini sulla commessa (l'incarico si mette da solo: quello
  affidato a lui su quella commessa). **Se non ha l'accesso**, chi segue l'incarico scrive le sue ore nella pagina
  dell'incarico (**+ Ore del collaboratore**): righe `ore` senza utente, con `incarico_id` e `creata_da`. Ore e
  rapportini degli esterni vanno in approvazione come quelli dei collaboratori, e hanno costo orario 0.
- **Spese**: quelle che l'esterno scrive con `pagataDaMe` **non vanno nei rimborsi** (non è una persona dello studio):
  con `spese_comprese = 0` entrano nel maturato dell'incarico ("spese da riconoscere"), con `1` restano solo
  informative. Quelle "Al cliente" seguono la fase 3 e la fase 4 come sempre.
- **Occasionale**: nella pagina dell'incarico la riga **Comunicazione all'Ispettorato del lavoro · Non collegato** con
  la frase "Va fatta prima che cominci, dal portale dell'Ispettorato" (da confermare col consulente se riguarda lo
  studio).

### 8.3 Compensi: i conti condivisi

`contiIncarico({modo, compenso, tariffa, orePreviste, tetto, avanzamento, oreApprovate, speseComprese, speseDaRiconoscere,
ricevute})` in conti.js, casi in **`server/prove/casi-incarichi.json`**:
- **pattuito** = corpo: `compenso`; ore: `orePreviste × tariffa`, o `tetto` se c'è ed è più piccolo;
- **maturato** = corpo: `centesimi(compenso × avanzamento / 100)`; ore: `centesimi(oreApprovate × tariffa)`, al massimo
  `tetto`; più `speseDaRiconoscere` se `speseComprese` è falso;
- **fatturato** = somma dell'`imponibile` delle ricevute attive collegate, meno quello delle note di credito (TD04);
- **costo** = somma di imponibile + contributo + bollo delle stesse (per la commessa, §8.6);
- **daFatturare** = max(0, maturato − fatturato); **daPagare** = somma del residuo netto delle ricevute (fase 4).
```json
{"incarichi": [
  {"nome": "a corpo, 60%", "modo": "corpo", "compenso": 3200, "avanzamento": 60, "ricevute": [{"imponibile": 1200, "contributo": 0, "bollo": 0, "tipo": "TD01"}],
   "atteso": {"pattuito": 3200, "maturato": 1920, "fatturato": 1200, "costo": 1200, "daFatturare": 720}},
  {"nome": "a ore, 12 ore approvate", "modo": "ore", "tariffa": 32, "orePreviste": 16, "oreApprovate": 12, "ricevute": [],
   "atteso": {"pattuito": 512, "maturato": 384, "fatturato": 0, "costo": 0, "daFatturare": 384}},
  {"nome": "a ore col tetto", "modo": "ore", "tariffa": 32, "orePreviste": 20, "tetto": 500, "oreApprovate": 20, "ricevute": [],
   "atteso": {"pattuito": 500, "maturato": 500, "fatturato": 0, "costo": 0, "daFatturare": 500}},
  {"nome": "professionista con cassa 4%", "modo": "corpo", "compenso": 650, "avanzamento": 100, "ricevute": [{"imponibile": 650, "contributo": 26, "bollo": 0, "tipo": "TD01"}],
   "atteso": {"pattuito": 650, "maturato": 650, "fatturato": 650, "costo": 676, "daFatturare": 0}},
  {"nome": "nota di credito del fornitore", "modo": "corpo", "compenso": 1000, "avanzamento": 100, "ricevute": [{"imponibile": 1000, "contributo": 0, "bollo": 0, "tipo": "TD01"}, {"imponibile": 200, "contributo": 0, "bollo": 0, "tipo": "TD04"}],
   "atteso": {"pattuito": 1000, "maturato": 1000, "fatturato": 800, "costo": 800, "daFatturare": 200}}]}
```

### 8.4 L'accesso degli esterni (ruolo `esterno`)

- **Dai l'accesso a Wisper** dalla scheda del collaboratore (`invitaEsterno {idSoggetto, nome, email}`, amministrazione
  2): un utente `esterno` con `soggetto_id`, password iniziale come la fase 1. Più persone dello stesso collaboratore
  possono avere l'accesso.
- **Cosa vede e fa** (il server lo controlla con `utenti.soggetto_id`; le app nascondono il resto):
  - **Dashboard** sua: i suoi incarichi in corso con l'avanzamento, i suoi documenti in scadenza ("Il DURC scade fra 7
    giorni: carica quello nuovo"), i suoi rapportini da far firmare, le sue cose respinte;
  - **Commesse**: solo quelle con un suo incarico affidato o concluso, con codice, nome, cliente (solo il nome), sede o
    impianto con l'indirizzo e il referente sul posto, le attività sue; niente budget, costi, margini, prezzi;
  - **Ore e rapportini**: scrive i suoi, solo su quelle commesse (cliente o commessa nuovi no); la tariffa per il
    cliente non la vede (come il collaboratore);
  - **Spese**: le sue (§8.2); **Attività e calendario**: le sue; **Ticket**: quelli dove è responsabile o ha un intervento;
  - **Documenti**: quelli `vede = tutti` legati alle sue commesse e i suoi; carica i suoi documenti (DURC, polizza) e
    foto o documenti sulle sue commesse (questi ultimi nelle categorie con approvazione vanno *Da approvare*);
  - **Collaboratori esterni**: solo **la sua scheda** (documenti, incarichi, i suoi compensi: sono soldi suoi, come le
    spese della persona nella fase 3), mai gli altri collaboratori.
  - **Mai**: clienti (elenco e schede), fornitori, preventivi, fatturazione, banche, persone, mezzi, amministrazione,
    costi, riservati, le cose degli altri utenti.
- `salvaPermessi` rifiuta di dare a `esterno` più di 0 su `persone`, `mezzi`, `clienti`, `preventivi`,
  `fatturazione`, `banche`, `comunicazioni`, `portale`, `integrazioni`, `amministrazione`, `costi`, `riservati`
  (`"Un esterno non può vedere i soldi, le persone e l'amministrazione dello studio"`).
- **Senza incarichi in corso** da `ACCESSO_ESTERNI_GIORNI`: la Dashboard (da pianificare, amministrazione) "Luca Sartori
  non ha incarichi in corso da 90 giorni: togli l'accesso?" con **Togli l'accesso**. Non si toglie da solo.

### 8.5 Fatture ricevute e incarichi

- `salvaRicevuta` e `confermaXml` (fase 4) accettano `idIncarico`. Leggendo l'XML di un fornitore che ha incarichi
  affidati o conclusi con `daFatturare > 0`, la proposta dice "È dell'incarico IN/2026/004? Restano da fatturare 720,00"
  (uno solo: già scelto; più di uno: si sceglie); la ricevuta prende anche la commessa dell'incarico.
- La pagina della ricevuta (fase 4) ha **Incarico** da scegliere come la commessa; la pagina dell'incarico elenca le sue
  ricevute con lo stato del pagamento (Pagata, Da pagare, Scaduta) e **Collega una fattura ricevuta**.
- La ritenuta dei professionisti e la proposta di F24 1040 restano quelle della fase 4. La **prestazione occasionale**
  si registra a mano come ricevuta (`salvaRicevuta {tipoDocumento: "occasionale", ritenuta}`, ritenuta proposta del 20%
  sull'imponibile, da confermare col commercialista).

### 8.6 Costo della commessa

`costoCommessa` (fase 3 §14.11) ha in più (vero, 26ST044):
```json
{"costoCommessa": {"...": "le parti della fase 3",
  "collaboratori": 1200, "collaboratoriPrevisto": 3200, "altreRicevute": 486, "totale": 3891.34}}
```
- `collaboratori` = somma del **costo** (§8.3) degli incarichi non annullati della commessa; `collaboratoriPrevisto` =
  somma, per gli stessi, del più grande fra pattuito e fatturato; `altreRicevute` = imponibile + contributo + bollo delle
  ricevute attive con la commessa, senza incarico e senza `spesa_id`.
- `totale` (costo sostenuto) = quello della fase 3 + `collaboratori` + `altreRicevute`. Costo atteso (le app, §14.11) =
  quello della fase 3 + `collaboratoriPrevisto` + `altreRicevute`.
- Solo con `costi`. Nella pagina della commessa, scheda **Costi**, due righe nuove: "Collaboratori esterni" (con
  "previsto 3.200,00") e "Altre fatture ricevute".

## 9. Uscita di una persona e conservazione

- `segnaUscita {idPersona, data, motivo?, conferma?}` (persone 2). Prima risposta `serveConferma` con `daFare`:
  ```json
  {"ok": false, "serveConferma": true, "frase": "Elena Costa esce il 14/03/2027. Ecco cosa succede:",
   "daFare": {"accesso": "Non ha l'accesso a Wisper", "daRestituire": [{"tipo": "dpi", "nome": "Calzature di sicurezza"}],
     "assenzeFuture": 0, "attivitaFuture": 0, "ticketInCarico": 0, "scadenzeAperte": 1,
     "contattiTolti": ["telefono personale", "contatto di emergenza"]}}
  ```
  Con `conferma`: come §3.12. Nel registro, nota "uscita: {data}". `annullaUscita {idPersona}` finché la data non è
  passata (o entro 30 giorni, senza riattivare l'accesso da solo).
- **Da rendere anonima**: ogni notte, le persone uscite da più di `PERSONE_CONSERVA_ANNI` anni e non anonimizzate →
  voce della Dashboard (da pianificare, solo titolare) "Dati di Elena Costa: uscita nel 2027, conservazione finita" ·
  "Rendi anonima la scheda".
- `anonimizzaPersona {idPersona, conferma?}` (solo **titolare**, con `riservati` 2): prima risposta `serveConferma` con
  quello che si toglie e quello che resta (§3.12), "Non si torna indietro". Poi, in una transazione: svuota i campi
  personali e riservati e `persona_costi`, cancella `visite_mediche`, `assenze`, `assenze_saldi`, `dpi_consegne`,
  `qualifiche`, le scadenze della persona, i documenti legati alla persona (righe e **file dal disco**, anche le
  revisioni), le firme; `nome` della persona e dell'utente = "Persona uscita nel {anno}"; `anonimizzata_il`. Il
  registro ha la riga "persona resa anonima" (senza dati: non ce ne sono, §3.2). `accessi_riservati` della persona resta
  (ha solo id e date).

## 10. Azioni nuove

Tutte con `ok`, modulo e livello tra parentesi; quelle che scrivono vogliono una POST. Campi dei soldi nuovi da
aggiungere a `CAMPI_COSTI`: `costoDal`, `compenso`, `tariffaIncarico`, `pattuito`, `maturato`, `fatturato`,
`daFatturare`, `daPagare`, `collaboratori`, `collaboratoriPrevisto`, `altreRicevute`, `costiMezzo` (tutto l'oggetto),
`euroKmMezzo`, e le colonne `compenso`, `tetto`. Eccezione (come la fase 3, soldi propri): all'esterno restano i soldi dei
**suoi** incarichi (`soldiPropri`).

### 10.1 Persone (modulo `persone`)

- `persone {stato?: "attive"|"uscite"|"tutte", testo?}` (1) → `{"persone": [{"id", "nome", "rapporto", "rapportoNome",
  "ruoloStudio", "telefonoLavoro", "emailLavoro", "idUtente", "ruoloWisper", "assenteOggi", "daCompletare": bool,
  "scadenzeVicine": n, "costoOrario"?}], "conteggi": {"attive": 4, "senzaAccesso": 1, "assentiOggi": 1}}`. Il
  collaboratore riceve le attive coi campi di lavoro.
- `persona {id}` (1) → §5.1. `salvaPersona {persona: {...§5.1}}` (2; la persona stessa i suoi contatti). Errori: `"Nome:
  scrivi il nome"`, `"Codice fiscale: deve avere 16 caratteri"`, `"IBAN: non sembra giusto"` (mod 97 come i conti della
  fase 4), `"Ore alla settimana: da 1 a 60"`, `"Uscita: non può venire prima dell'entrata"`, `"Puoi cambiare solo i tuoi
  contatti, l'indirizzo, l'IBAN e il contatto di emergenza"`.
- `salvaCostoPersona {idPersona, dal, costoOrario?, costoAnno?, oreAnno?, nota?}` (2, `costi` 2; `costoAnno`, `oreAnno`,
  `nota` vogliono `riservati` 2): senza `costoOrario` e con `costoAnno` e `oreAnno` si usa `costoOrarioDaAnno`. Risponde
  con `costi: [{dal, costoOrario, costoAnno?, oreAnno?}]` e la frase di conferma "Vale per le ore e i rapportini nuovi
  dal 01/01/2026: quelli già scritti tengono il loro costo". Errori: `"Costo orario: scrivi il costo o il costo dell'anno
  e le ore"`, `"Dal: c'è già un costo da quel giorno"`. `togliCostoPersona {id}`.
- `daiAccesso {idPersona, email, ruolo}` (amministrazione 2) → `{"ok": true, "utente": {...}, "passwordIniziale": "…"}`.
- `qualificheTipi {}` (1); `salvaQualificaTipo {tipo: {chiave?, nome, gruppo, ogniMesi, preavvisoGiorni, attivo}}`
  (amministrazione 2).
- `salvaQualifica {qualifica: {id?, idPersona, tipo, titolo?, data, scade?, ente?, ore?, idFile?, nota?}, rinnova?: id}`
  (2) → la qualifica e la scadenza. `togliQualifica {id, annulla?}` (2).
- `salvaVisita {visita: {...§5.4}}` (2; giudizio e documento con `riservati` 2). `togliVisita {id}`.
- `dpi {idPersona?}` (persone 1 per i suoi, persone 2 o mezzi 1 per tutti); `salvaConsegnaDpi {consegna: {id?, idLocale?,
  idPersona, cosa, taglia?, quantita?, data?, idAttrezzatura?, scade?, nota?}, firma?: {base64, mime}}` (persone 2 o mezzi
  2); `firmaConsegna {id, base64, mime}` (la persona per le sue, o chi consegna); `restituisciDpi {id, data?}`.
- `segnaUscita`, `annullaUscita`, `anonimizzaPersona` (§9); `accessiRiservati` (§5.7).
- `esporta {cosa: "persone"}`: Nome, Rapporto, Ruolo nello studio, Mansione, Telefono di lavoro, Email di lavoro, Entrata,
  Uscita, Ore alla settimana, Accesso a Wisper, Ruolo; con `persone` 2 anche i campi personali; con `riservati` anche
  CCNL e livello (nota nel registro degli accessi); con `costi` il costo orario di oggi.
  `esporta {cosa: "qualifiche"}`: Persona, Qualifica, Dettaglio, Data, Scade, Stato, Ente, Ore.

### 10.2 Assenze e presenze (modulo `persone`)

- `assenze {da?, a?, idPersona?, stato?: "aperte"|"da_approvare"|"tutte", tipo?}` (1): senza date le future e quelle in
  corso, più le da approvare; con le date quelle del periodo (il calendario). Una voce: `{"id": 12, "idPersona": 3,
  "persona": "Marco Rossato", "tipo": "ferie", "tipoVisto": "Ferie", "causale": "", "dal": "2026-11-02", "al":
  "2026-11-06", "mezza": "", "dalle": "", "alle": "", "giorni": 5, "ore": 40, "stato": "da_approvare", "statoVisto": "Da
  approvare", "nota": "", "approvataDa": null, "motivoRifiuto": "", "chiusura": "", "puoScrivere": true, "puoAnnullare":
  true}`; più `chiusure` del periodo e `saldi` della persona se il filtro è una persona sola. Il collaboratore riceve
  le sue con tutto e quelle dei colleghi con `tipoVisto: "Assente"` e senza `nota`, `causale`, `protocollo`.
- `salvaAssenza {assenza: {id?, idLocale?, idPersona?, tipo, causale?, dal, al?, mezza?, dalle?, alle?, ore?, nota?,
  protocollo?, bozza?}}` (1 per sé, 2 per gli altri) → `{"ok": true, "assenza": {...}, "saldi": {...}, "anomalie":
  [...]}`. Di base `al` = `dal`, la persona di chi scrive. Lo stato nasce come §6.1 e §6.4. Ripetuta con lo stesso
  `idLocale`: la stessa. Errori: `"Dal: scrivi il primo giorno"`, `"Al: non può venire prima di Dal"`, `"In quei giorni
  non lavori: niente da chiedere"`, `"Permesso: scrivi dalle e alle, o le ore"`, `"Alle: deve venire dopo dalle"`, `"Il
  03/11 sei già in ferie: cambia quella richiesta"`, `"Tipo: ferie, permesso, malattia, infortunio, congedo, legge104 o
  altro"`, `"Altro: scrivi la causale"`, `"È già approvata: per cambiarla chiedi a chi approva"`.
- `annullaAssenza {id, motivo?}` (1 per le sue non cominciate; 2 sempre, motivo obbligatorio per quelle degli altri).
- `salvaSaldo {idPersona, tipo, data, ore, nota?}` (2) → i saldi. `saldi {idPersona}` (1, la propria o 2).
- `chiusure {anno?}` (1), `salvaChiusura`, `togliChiusura {id, conferma?}` (2) (§6.6).
- `presenze {mese, idPersona?}` (1) (§6.7).
- `esporta {cosa: "assenze"}`: Persona, Tipo, Dal, Al, Giorni, Ore, Stato, Approvata da, Il, Motivo del rifiuto, Nota
  (tipo sanitario vero solo con `riservati`); `esporta {cosa: "presenze", mese}` (§6.7).

### 10.3 Mezzi e attrezzature (modulo `mezzi`)

- `mezzi {tutti?}` (1) → `{"mezzi": [{"id": 2, "nome": "Fiat Doblò", "targa": "GA123BC", "titolo": "Fiat Doblò GA123BC",
  "tipo": "furgone", "proprieta": "studio", "statoVisto": "Assegnato a Marco Rossato", "stato": "assegnato", "chi":
  {"idPersona": 3, "nome": "Marco Rossato", "dal": "2025-01-10"}, "km": 84320, "kmIl": "2026-10-18", "kmAlTagliando":
  5680, "prossimaScadenza": {"tipo": "assicurazione", "data": "2026-11-05", "statoVisto": "Scade fra 14 giorni"},
  "guastiAperti": 1, "fermo": false, "mio": false}]}`. `mio` = ce l'ho io.
- `mezzo {id}` (1) → la voce più: `immatricolazione`, `alimentazione`, `euroKm` e `annoAci` (auto delle persone),
  `tagliandoKm`, `tagliandoUltimoKm`, `note`, `scadenze` (righe come la fase 5), `letture` (le ultime 10), `manutenzioni`
  (aperte e le ultime 10 chiuse, con `foto`), `assegnazioni` (lo storico), `documenti`, `costi` (§7.4, con `costi`),
  `trasferte` (quante e km dell'anno), `puoScrivere`, `puoSegnareKm`, `puoPrendere`.
- `salvaMezzo {mezzo: {id?, nome, targa?, tipo?, proprieta?, idPersona?, immatricolazione?, alimentazione?, euroKm?,
  annoAci?, tagliandoKm?, tagliandoUltimoKm?, tagliandoOgniMesi?, note?, scadenze?: {assicurazione?: data, bollo?: data,
  revisione?: data, tagliando?: data}}}` (2) → il mezzo; le date creano o spostano le scadenze. `salvaVeicolo` (fase 3,
  amministrazione 2) accetta gli stessi campi. Errori: `"Nome: scrivi il nome del mezzo"`, `"Targa: lettere e cifre,
  senza spazi"`, `"Euro al km: solo per l'auto di una persona"` (con `studio` si ignora e si mette `null`), `"Di chi è:
  scegli la persona"`. `dismettiMezzo {id, motivo}` (2).
- `segnaKm {idVeicolo, km, data?, idLocale?, idFile?, conferma?}` (1 se ce l'ho io, 2 sempre) → `{"ok": true, "lettura":
  {...}, "mezzo": {...}}`; errori §7.2; ripetuta con lo stesso `idLocale`: la stessa. Foto: `caricaFile {tipo: "km",
  idLettura | idLocaleLettura, base64, mime, idFile}`.
- `segnalaGuasto {guasto: {idVeicolo | idAttrezzatura, titolo, descrizione?, fermo?, km?, idLocale?}}` (1 se ce l'ho io,
  2 sempre) → la manutenzione; foto con `caricaFile {tipo: "guasto", idManutenzione | idLocaleManutenzione, ...}` (più
  foto). Errori: `"Scrivi in poche parole cosa succede"`.
- `salvaManutenzione {manutenzione: {id?, idVeicolo | idAttrezzatura, tipo, stato?, fermo?, data?, km?, titolo,
  descrizione?, idFornitore?, idSpesa?, idRicevuta?, esito?}}` (2); `chiudiManutenzione {id, esito?, km?, data?, idSpesa?,
  idRicevuta?}` (2; il segnalante può chiudere un suo guasto con mezzi 1: "Era la valvola, sistemato") → effetti §7.2,
  §7.3. `manutenzioni {aperte?, idVeicolo?, idAttrezzatura?}` (1).
- `costiMezzo {id, anno?}` (1 e `costi` 1) (§7.4).
- `attrezzature {categoria?, stato?: "disponibili"|"assegnate"|"fuori"|"dismesse"|"tutte", mie?, idPersona?, testo?,
  taratura?: "scadute"|"in_scadenza"}` (1) → righe `{"id", "codice", "nome", "categoria", "categoriaNome", "marca",
  "modello", "matricola", "statoVisto", "stato", "chi", "posizione", "taratura": {"stato", "parola", "giorni", "scade"} |
  null, "mio"}`.
- `attrezzatura {id}` (1) → più `tarature` (storico), `assegnazioni`, `manutenzioni`, `documenti`, `usi` (gli ultimi 10
  interventi), `usiDaControllare` (con non conforme), `costi` (acquisto e tarature, con `costi`).
- `salvaAttrezzatura {attrezzatura: {id?, codice?, nome, categoria, marca?, modello?, matricola?, proprieta?,
  acquistatoIl?, idFornitore?, posizione?, controllo?, controlloOgniMesi?, idLaboratorio?, note?, ultimaTaratura?: {data,
  scade?, certificato?, idDocumento?}}}` (2). Errori: `"Nome: scrivi cos'è"`, `"Codice: AT014 c'è già (Guanti isolanti
  classe 0)"`, `"Ogni: da 1 a 120 mesi"`. `dismettiAttrezzatura {id, motivo}` (2).
- `registraTaratura {taratura: {idAttrezzatura, data, esito, scade?, idLaboratorio?, certificato?, idFile?, idRicevuta?,
  nota?}}` (2) → `{"ok": true, "attrezzatura": {...}, "usiDaControllare": [...]}` (§7.6). Errori: `"Esito: conforme,
  regolato o non conforme"`, `"Scade: deve venire dopo la data della taratura"`.
- `assegna {idVeicolo | idAttrezzatura, tipo, idPersona? | idCommessa? | idSoggetto?, rientro?, nota?, idLocale?, firma?:
  {base64, mime}}` (2; con 1 solo `tipo: "prestito"` a sé stessi su una cosa Disponibile) → l'oggetto. Errori: `"È al
  laboratorio fino al 29/10"`, `"È fermo: Spia della pressione delle gomme"` (con `fermo`), `"Non conforme: non si usa
  finché non è tarato di nuovo"`, `"Scegli a chi"`, `"Rientro: deve venire dopo oggi"`.
  `restituisci {idAssegnazione | idVeicolo | idAttrezzatura, idLocale?}` (1 per le sue, 2 sempre).
- `assegnazioni {inCorso?, inRitardo?, idPersona?, idCommessa?, idSoggetto?}` (1).
- `usiStrumento {idAttrezzatura, da?, a?}` (1).
- `esporta {cosa: "mezzi" | "attrezzature" | "tarature" | "manutenzioni" | "assegnazioni" | "km"}`: colonne come i campi
  delle risposte, con le date all'italiana; i costi solo con `costi`.

### 10.4 Collaboratori esterni (modulo `collaboratori`)

- `collaboratori {testo?, stato?: "attivi"|"tutti", tipo?, idoneita?}` (1) → righe `{"idSoggetto", "nome", "tipo",
  "tipoNome", "mestiere", "idoneita": {"stato", "parola"}, "incarichiInCorso", "daFatturare"?, "valutazioni"}`.
- `collaboratore {id}` (1) (§8.1). `salvaCollaboratore {collaboratore: {idSoggetto?, soggetto?: {...i campi di
  salvaSoggetto}, tipo, mestiere?, abilitazioni?, tariffa?, referenteId?, attivo?, note?}}` (2; `tariffa` con `costi`
  2) → `{"ok": true, "collaboratore": {...}, "giaEsisteva": false}`. Errori: quelli di `salvaSoggetto`, `"Tipo: impresa,
  professionista o occasionale"`, `"F004 è già un collaboratore"`.
- `invitaEsterno {idSoggetto, nome, email}` (amministrazione 2) → `{"ok": true, "utente": {...}, "passwordIniziale":
  "…"}`.
- `incarichi {stato?: "aperti"|"conclusi"|"tutti", idSoggetto?, idCommessa?, daValutare?}` (1; l'esterno i suoi) → righe
  `{"id", "numero", "idSoggetto", "collaboratore", "idCommessa", "commessa", "titolo", "modo", "stato", "statoVisto",
  "avanzamento", "dal", "al", "conti": {...§8.3}?, "valutazione"}`.
- `incarico {id}` (1) → più `descrizione`, `ore` (righe della fase 3 con l'incarico), `rapportini`, `spese`, `ricevute`
  (`{id, numero, data, imponibile, totale, statoPagamento}`), `documenti`, `cronologia` (dal registro), `idoneita` del
  collaboratore, `puoScrivere`.
- `salvaIncarico {incarico: {id?, idSoggetto, idCommessa, idPrestazione?, titolo, descrizione?, modo, compenso?, tariffa?,
  orePreviste?, tetto?, speseComprese?, dal?, al?, referenteId?, idDocumento?}}` (2; i soldi con `costi` 2). In bozza si
  cambia tutto; affidato: titolo, descrizione, date, referente, documento, ore previste (i soldi solo con `costi` 2, nota
  nel registro). Errori: `"Commessa: scegli la commessa"`, `"Titolo: scrivi cosa deve fare"`, `"Compenso: scrivi quanto"`
  (corpo), `"Tariffa: scrivi quanto all'ora"` (ore), `"Collaboratore F009 non trovato"`.
- `affidaIncarico {id, conferma?}`, `aggiornaAvanzamento {id, avanzamento}`, `concludiIncarico {id}`, `riapriIncarico
  {id, motivo}`, `annullaIncarico {id, motivo}`, `valutaIncarico {id, valutazione, nota?}` (2) (§8.2). Errori:
  `"Avanzamento: da 0 a 100"`, `"Valutazione: bene, problemi o male"`.
- `compensi {idSoggetto?, anno?}` (1 e `costi` 1; l'esterno i suoi) → `{"righe": [{"idSoggetto", "nome", "pattuito",
  "maturato", "fatturato", "daFatturare", "daPagare", "incarichi": n}], "totale": {...}}`.
- `esporta {cosa: "collaboratori" | "incarichi" | "compensi"}`.

### 10.5 Cosa cambia nelle azioni che ci sono

- `io`: `interfaccia` ha in più `idPersona` (o `null`), `puoApprovareAssenze`, `vedeRiservati`, `esterno: {"idSoggetto":
  "F004", "nome": "Impianti Veneti di Sartori Luca"}` (solo per l'esterno), `taraturaBlocco` (`avviso` | `blocco`);
  `versioneServer` "0.9.0".
- `anagrafiche`: `utenti` con `idPersona`; `fornitori` con `collaboratore: true/false`; `numerazioni` con `incarico` e
  `attrezzatura`; con `mezzi` ≥ 1 anche `mezzi` (id, titolo, proprieta, stato, mio) e `mieiStrumenti` (le mie
  attrezzature con la taratura) per il telefono senza rete. Per l'esterno: solo le sue commesse, i loro clienti (nome) e
  sedi.
- `salvaUtente` (fase 1): un utente nuovo non esterno crea la persona; il nome cambiato cambia anche la persona; ruolo
  `esterno` vuole `idSoggetto` (`"Esterno: scegli il collaboratore"`).
- `salvaRapportino`: `strumenti` (§7.8); per l'esterno l'incarico si mette da solo (`incarico_id`), `"Non hai un incarico
  su 26ST045: chiedi allo studio"` se manca; costo orario come §3.3.
- `rapportini`, `rapportino`: `strumenti`, `idIncarico`.
- `salvaOre`: costo orario come §3.3; accetta `idIncarico` e, senza `idUtente`, le ore di un collaboratore senza accesso
  (collaboratori 2). `ore`: `incarico`, e in `giorni` il campo `assenza`.
- `veicoli`, `salvaTrasferta`: `proprieta`; con `studio` l'euro al km congelato è 0 e la trasferta ha `mezzoDelloStudio:
  true`; la pillola **Fermo** (`fermo: true`).
- `salvaSpesa`, `spese`: `idVeicolo`, `idAttrezzatura`, `idIncarico`, `km` (carburante: lettura del contachilometri).
  Le spese di un esterno non vanno in `rimborsi`.
- `salvaRicevuta`, `ricevute`, `ricevuta`, `leggiXml`, `confermaXml`: `idIncarico`, `idVeicolo`, `idAttrezzatura`, la
  proposta dell'incarico (§8.5).
- `scadenze`, `salvaScadenza`, `faiScadenza`: filtri e campi `idPersona`, `idVeicolo`, `idAttrezzatura`, `idSoggetto`, i
  tipi nuovi, `fineMese`; filtro `gruppo: "persone" | "mezzi" | "collaboratori"`. Chi le vede: quelle con persona come i
  dati personali (§3.2), con mezzo o attrezzatura chi ha `mezzi` 1, coi collaboratori chi ha `collaboratori` 1.
- `documenti`, `salvaDocumento`, `/carica`: `idPersona`, `idVeicolo`, `idAttrezzatura`, `idIncarico`, `idSoggetto`;
  `per=persona|mezzo|attrezzatura|collaboratore` in `/carica` (permessi del modulo in scrittura; la persona per i suoi
  contatti no: i documenti personali li carica chi ha persone 2).
- `salvaAttivita`, `pianificaTicket`: gli assenti (§6.5). `attivita {da, a}`: invariata; le assenze si leggono a parte.
- `daApprovare`, `approva`, `respingi`, `annullaApprovazione`: il tipo `assenza` (§6.4); le anomalie nuove `inAssenza`.
- `costoCommessa` (§8.6). `ticket {id}`: `strumenti`.
- `componiModello`: `idIncarico` e i segnaposti di §8.2; modello testo `LETTERA_INCARICO`.
- `dashboard`: §11.1.

## 11. Dashboard, permessi, registro

### 11.1 Dashboard

- `numeri.persone` (con persone 1): `{"attive": 4, "assentiOggi": 1, "assentiOggiNomi": ["Laura Bianchi"],
  "daApprovare": 1, "scadenzeVicine": 3, "scadute": 1}` (il collaboratore: `assentiOggi` e le sue).
- `numeri.mezzi` (con mezzi 1): `{"fermi": 0, "guastiAperti": 1, "tarateScadute": 1, "tarateInScadenza": 1,
  "prestitiInRitardo": 1, "scadenzeVicine": 2}` (il collaboratore: le cose sue).
- `numeri.collaboratori` (con collaboratori 1): `{"incarichiInCorso": 2, "nonInRegola": 0, "documentiInScadenza": 1,
  "daValutare": 1}`; con `costi` anche `numeri.soldi.compensiDaFatturare` (1.104,00 €).
- `oggi.assenti`: `[{"idPersona": 2, "nome": "Laura Bianchi", "tipoVisto": "Ferie", "fino": "2026-10-23"}]` (tipo come
  §6.1).
- Voci nuove (frasi esatte; `tipo` nuovi: `assenza`, `persona`, `qualifica`, `visita`, `mezzo`, `strumento`, `prestito`,
  `guasto`, `collaboratore`, `incarico`; unità nuove `persone`, `km`):
  - **urgenti**: strumenti con **taratura scaduta** ancora assegnati o usati negli ultimi 7 giorni ("Multimetro 87V:
    taratura scaduta da 6 giorni", "Ce l'ha Marco Rossato · usato ieri in RAP/2026/0155", `collegamento {pagina:
    "attrezzatura", id}`); strumenti **non conformi** usati da quando sono non conformi ("RAP/2026/0160 ha usato
    l'Analizzatore di rete AR-6, non conforme"); **mezzi fermi** per assicurazione o revisione scadute ("Fiat Doblò
    GA123BC: assicurazione scaduta, non si usa"); **prestiti oltre il rientro** ("Imbracatura anticaduta AT015: doveva
    rientrare ieri", "In prestito a Impianti Veneti di Sartori Luca dal 14/10"); **formazione o visita scaduta** (titolare
    e amministrazione, e la persona per la sua: "Primo soccorso di Marco Rossato scaduto da 32 giorni"); **DURC o
    documento scaduto** di un collaboratore con un incarico affidato ("DURC di Impianti Veneti di Sartori Luca scaduto
    il 12/10", "Incarico IN/2026/004 in corso"); **ferie da approvare che cominciano entro 7 giorni**; non idoneo
    (§5.4); le proprie richieste **respinte** col motivo ("Ferie dal 2 al 6 novembre respinte", "Motivo: … · Manuel
    Gasparotto").
  - **questa settimana**: **chi è assente oggi** (una voce, `tipo: "assenza"`, "Oggi è assente Laura Bianchi" /
    "Oggi sono assenti Laura Bianchi e Marco Rossato", dettaglio "Ferie fino a venerdì 23" o "Assente fino a …",
    `collegamento {pagina: "persone", filtro: {segmento: "ferie"}}`); **ferie e permessi da approvare** (chi approva: "1
    richiesta di ferie da approvare", "Marco Rossato · dal 2 al 6 novembre · 5 giorni"); scadenze di persone, mezzi,
    strumenti e collaboratori **nel preavviso entro 30 giorni** (la voce delle scadenze della fase 5 con i tipi nuovi:
    "Fiat Doblò GA123BC: assicurazione scade fra 14 giorni", "Misuratore di terra MT-500: taratura fra 24 giorni",
    "Visita medica di Marco Rossato fra 13 giorni", "DURC di Impianti Veneti di Sartori Luca scade fra 7 giorni");
    **tagliando** a km ("Fiat Doblò GA123BC: tagliando fra 800 km"); **rientri** previsti nei prossimi 7 giorni
    ("Analizzatore di rete AR-6 rientra dal laboratorio giovedì 29"); le proprie consegne di DPI **da firmare**; le
    proprie richieste **in attesa** ("Le tue ferie dal 2 al 6 novembre aspettano l'approvazione").
  - **da pianificare**: **guasti aperti** ("Fiat Doblò GA123BC: Spia della pressione delle gomme accesa", "Segnalato da
    Marco Rossato il 20/10"); **assenze sopra attività** (§6.5); persone senza costo orario con ore recenti (§3.3);
    **saldo** non aggiornato da `SALDO_AVVISO_GIORNI` ("Saldo delle ferie di Laura Bianchi: l'ultimo cedolino scritto è
    di luglio"); **ferie arretrate** (saldo di oggi oltre le ore di un anno: "Marco Rossato ha 30 giorni di ferie da
    smaltire"); strumenti **senza data di taratura**; collaboratori con incarico affidato e **idoneità non in regola**;
    **compensi maturati non fatturati** (amministrazione, con `costi`: "Impianti Veneti di Sartori Luca: 1.104,00 €
    maturati da fatturare"); incarichi **conclusi da valutare** ("IN/2026/002 concluso: com'è andato?"); **esterni senza
    incarichi** (§8.4); persone **da rendere anonime** (solo titolare, §9); **contratti a termine** che finiscono entro 60
    giorni.
- `collegamento.pagina` nuove: `persone` (filtro `segmento`: `organico` | `ferie` | `presenze` | `scadenze` | `costi`,
  e `daApprovare: true`), `persona` (`id`), `mezzi` (filtro `segmento`: `miei` | `mezzi` | `strumenti` | `attrezzature` |
  `scadenze` | `dpi`, `taratura`), `mezzo` (`id`), `attrezzatura` (`id`), `collaboratori` (filtro `segmento`:
  `elenco` | `incarichi` | `compensi` | `documenti`), `collaboratore` (`id`), `incarico` (`id`).
- **Il collaboratore**: chi è assente oggi (nomi, "Assente"), le sue richieste (in attesa, respinte col motivo), il mezzo
  che usa ("Il Fiat Doblò che usi: assicurazione fra 14 giorni"), i suoi strumenti ("Il tuo Multimetro 87V ha la taratura
  scaduta da 6 giorni"), la sua formazione e la sua visita, i DPI da firmare; niente soldi.
- **L'esterno**: §8.4.
- Riquadri della Dashboard per chi vede le persone: **Assenti oggi** · **Ferie da approvare** · **Tarature scadute** (rosso
  se > 0) · **Scadenze vicine** (persone, mezzi, strumenti e collaboratori nel preavviso), toccabili; sul telefono in due
  colonne.
- **Numerino giallo** nel menu: **Persone** = richieste da approvare (chi approva); **Mezzi e attrezzature** = tarature
  scadute più mezzi fermi più prestiti in ritardo (per il collaboratore: i suoi); **Collaboratori esterni** = collaboratori
  con un incarico affidato e documenti scaduti.

### 11.2 Permessi

La tabella dell'architettura §3 con le righe nuove e il ruolo `esterno`:

| | titolare | amministrazione | collaboratore | lettura | esterno |
|---|---|---|---|---|---|
| `persone` | 2 | 2 | **1** (era 0) | 1 | 0 |
| `mezzi` | 2 | 2 | 1 | 1 | 0 |
| `collaboratori` | 2 | 2 | 0 | 1 | 1 (solo la sua scheda) |
| `dashboard` | 2 | 2 | 1 | 1 | 1 |
| `commesse` | 2 | 2 | 1 | 1 | 1 (solo con un suo incarico) |
| `rapportini`, `attivita`, `spese`, `ticket` | 2 | 2 | 2 | 1 | 2 (solo i suoi) |
| `documenti` | 2 | 2 | 1 | 1 | 1 (più i suoi documenti) |
| tutti gli altri moduli | come prima | come prima | come prima | come prima | 0 |
| `costi` | 2 | 2 | 0 | 1 | 0 |
| `riservati` | 2 | 0 | 0 | 0 | 0 |

Regole:
- **Persone**: §3.2 e §5.1 (tre livelli, la persona stessa). Approvare le assenze: titolare e amministrazione con
  `persone` 2 (non le proprie, tranne il titolare). Anonimizzare: solo il titolare. Il menu mostra Persone con `persone`
  ≥ 1; al collaboratore la pagina si apre su **Io**.
- **Mezzi**: il collaboratore (mezzi 1) vede mezzi e attrezzature (senza costi), segna i km e segnala guasti **delle
  cose che ha**, prende in prestito una cosa disponibile per sé e restituisce le sue; non assegna ad altri, non registra
  tarature, non cambia le schede. Lettura vede tutto ed esporta.
- **Collaboratori**: scrivere vuole `collaboratori` 2; i soldi (tariffa, compensi) vogliono `costi`; affidare un incarico
  `collaboratori` 2 e `costi` 1.
- **Esterno**: §8.4. Prove "non deve vedere / non deve scrivere" per ogni ruolo su ogni azione nuova e su quelle delle fasi
  1-5 che l'esterno può chiamare (non trova commesse, rapportini, documenti, ticket, attività degli altri: `"Commessa
  26ST045 non trovata"`).
- Prove sui riservati: Laura non riceve `giudizio`, `costoAnno`, i cedolini (anche con `/file/<id>`: 403) e le malattie
  come tali; Marco non riceve il suo costo e i dati personali dei colleghi; ogni lettura riservata del titolare scrive
  `accessi_riservati`.

### 11.3 Registro

Tabelle nuove con i loro nomi (§4.4, tranne `accessi_riservati`, che è già un registro). Note: `"costo dal {data}:
vale per le righe nuove"`, `"richiesta di ferie"`, `"ferie approvate"`, `"ferie respinte: {motivo}"`, `"assenza
annullata: {motivo}"`, `"saldo dal cedolino del {data}"`, `"ferie della chiusura {nome}"`, `"uscita: {data}"`,
`"persona resa anonima"`, `"accesso dato a Wisper"`, `"km {km}"`, `"guasto segnalato"`, `"taratura {esito}"`, `"fuori uso:
non conforme"`, `"assegnato a {chi}"`, `"prestito a {chi} fino al {data}"`, `"restituito"`, `"incarico affidato"`,
`"incarico affidato con l'idoneità non in regola: {cosa}"`, `"avanzamento {n}%"`, `"incarico concluso"`, `"valutato:
{parola}"`, `"usato con la taratura scaduta"`. I campi personali e riservati nel prima/dopo sono `"(riservato)"`.

## 12. Schermate

**Parole fisse** (uguali ovunque): Persone — rapporto **Titolare**, **Socio**, **Dipendente**, **Apprendista**,
**Tirocinante**, **A partita IVA nello studio**, **Altro**, **Da completare**; **Senza accesso**; assenze **Ferie**,
**Permesso**, **Malattia**, **Infortunio**, **Congedo**, **Legge 104**, **Assente**, stati **Bozza**, **Da approvare**,
**Approvata**, **Respinta**, **Annullata**; **Saldo non tenuto**; visite **Idoneo**, **Idoneo con prescrizioni**,
**Non idoneo per ora**, **Non idoneo**; qualifiche **Valida**, **Scade fra N giorni**, **Scaduta**, **Non scade**; giorni
**festa**, **chiuso**, **manca**. Mezzi — **Disponibile**, **Assegnato a …**, **In prestito a …**, **In officina**,
**Fermo**, **Dello studio**, **Auto di …**; strumenti **Tarato**, **Taratura fra N giorni**, **Taratura scaduta**, **In
taratura**, **Non conforme**, **Taratura non scritta**, **Fuori uso**, **In riparazione**, **Dismesso**; DPI con
**Verifica** al posto di Taratura; guasti **Segnalato**, **In officina** / **In riparazione**, **Risolto**. Collaboratori —
**Impresa**, **Professionista**, **Occasionale**; **In regola**, **Manca qualcosa**, **Documenti scaduti**; incarichi
**Bozza**, **Affidato**, **Concluso**, **Annullato**; **A corpo**, **A ore**; **Bene**, **Con qualche problema**,
**Male**; **Non collegato**. Colori sempre con la parola: rosso tenue (Taratura scaduta, Non conforme, Fuori uso, Fermo,
Scaduta, Respinta, Documenti scaduti, Non idoneo, Male), ambra (Scade fra…, Taratura fra…, In officina, Manca qualcosa,
Idoneo con prescrizioni, Con qualche problema), giallo tenue (Da approvare, Bozza dell'incarico, Da completare), blu
(Assegnato, In prestito, In taratura, In riparazione, Affidato, Permesso), verde (Disponibile, Tarato, Valida, Approvata,
In regola, Idoneo, Concluso, Bene, Ferie), grigio (il resto, Assente). **Un solo pulsante giallo per schermata**, scritto qui
per ognuna; nelle pagine con un pannello aperto (computer) il giallo della pagina diventa col bordo.

Menu: **10 Persone e risorse umane** (icona della persona), **13 Mezzi e attrezzature** (icona del furgone), **16
Collaboratori esterni** (icona delle due persone), nell'ordine delle specifiche (Persone dopo Banche e scadenze, Mezzi
dopo Ticket, Collaboratori dopo Mezzi).

### 12.1 Persone: telefono

Segmenti: **Organico · Ferie e permessi · Presenze · Scadenze · Costi** (Costi solo con `costi`). Il collaboratore:
**Io · Ferie e permessi · Organico**.
- *Organico*: riquadri (Persone · Assenti oggi · Da completare); righe: cerchio con le iniziali, nome, "ruolo nello
  studio · rapporto", a destra le pillole (**Assente** con "fino a venerdì", **Senza accesso**, **Da completare**, le
  scadute in rosso tenue); in fondo "Uscite" chiuso. Giallo **Aggiungi una persona** (persone 2).
- *Aggiungi una persona* (pagina): nome, rapporto (pillole), ruolo nello studio, entrata; "+ Contatti di lavoro", "+
  Orario" (40 ore su 5 giorni già scritto); giallo **Salva la persona**. Dopo, la scheda con le righe da completare.
- *Scheda della persona* (pagina): cerchio grande, nome, "ruolo · rapporto", pillole (Assente, Senza accesso); poi a
  sezioni: **Lavoro** (mansione, contatti di lavoro, entrata, orario); **Ferie e permessi** (due numeri grandi "13
  giorni di ferie", "24 ore di permesso", sotto "dal cedolino di settembre · restano 8 giorni dopo le richieste",
  **Aggiorna dal cedolino** col bordo per persone 2; le prossime assenze); **Competenze e formazione** (righe con
  pillola di stato e "fino al …", **+ Aggiungi**); **Visite mediche** (con `riservati`: giudizio in pillola,
  prescrizioni in un riquadro grigio, la riga "Qui va solo il giudizio del medico, non la diagnosi"; senza: "Visita del
  04/11/2025 · prossima il 04/11/2026"); **Ha in uso** (mezzo e strumenti con lo stato della taratura, DPI con
  "firmato"); **Documenti** (personali e riservati, con lucchetto per i riservati; **Carica**); **Costo** (con `costi`:
  "28,50 € l'ora dal 01/01/2026", con `riservati` anche "costo dell'anno 47.025,00 € · 1.650 ore"; **Nuovo costo** col
  bordo); **Dati personali** (con persone 2 o se è la propria; chiusa di base); **Accesso a Wisper** (ruolo, ultimo
  accesso, **Dai l'accesso a Wisper** se non c'è). ⋯: Cambia, Chi ha visto i dati riservati (titolare), Segna l'uscita,
  Esporta. Giallo: dipende da cosa manca, uno solo, in quest'ordine: richiesta di questa persona da approvare (chi
  approva) → **Approva le ferie**; senza accesso → nessun giallo (Dai l'accesso è col bordo); altrimenti nessun giallo.
- *Io* (il collaboratore): la sua scheda, coi dati personali aperti da cambiare (**Cambia i tuoi contatti** col bordo),
  i documenti suoi, il saldo; giallo **Chiedi ferie o permesso**.
- *Ferie e permessi*: in cima la striscia delle prossime 4 settimane, una riga per persona (cerchio a sinistra), i
  giorni assenti pieni (verde Ferie, blu Permesso, grigio Assente, tratteggiato da approvare) e le chiusure su tutte;
  sotto, per chi approva, **Da approvare** (righe: persona, "Ferie · dal 2 al 6 novembre · 5 giorni", "restano 8
  giorni", l'anomalia in giallo scuro; tocco = foglio), poi **Prossime** e **Chiusure dello studio**. Giallo **Chiedi
  ferie o permesso** (per sé; chi ha persone 2 sceglie anche la persona nel modulo).
- *Chiedi ferie o permesso* (pagina): **Che cosa** (Ferie · Permesso · Malattia · Altro; Infortunio, Congedo, Legge 104
  sotto "Altro"), **Quando**: per Ferie dal-al col calendario (oggi già scelto) e "Mezza giornata" (Mattina ·
  Pomeriggio, solo un giorno); per Permesso il giorno e dalle-alle con più e meno a mezz'ore; per Malattia dal e
  "Fino a quando? Non lo so ancora", "+ Numero del certificato"; sotto, il **conto** grande: "5 giorni · 40 ore" e "Ti
  restano 8 giorni di ferie" (rossa con −… se va sotto zero, con la parola **Sotto zero**), e le righe calme di chi altro è
  assente e delle attività di quei giorni ("Martedì 3 hai il Sopralluogo quadri Batokyo"); "+ Una nota per chi approva".
  Giallo **Manda la richiesta** (per malattia **Segnala la malattia**; per chi non deve chiedere **Salva**). Senza rete:
  parte appena c'è rete.
- *Approva* (foglio): persona, cosa, quando, saldo prima e dopo, le anomalie; giallo **Approva**; **Respingi** col bordo
  (motivo obbligatorio). Dopo: avviso con Annulla.
- *Presenze*: il mese con ‹ ›; una scheda per persona: "ottobre · 13 giorni lavorati · 78 ore · 2 mancano"; tocco = i
  giorni in righe (giorno, ore previste, lavorate, assenza in pillola, "manca 2 ore" in giallo scuro); in fondo
  **Esporta per il consulente** (bordo) e la riga **Programma paghe del consulente · Non collegato**. Nessun giallo.
- *Scadenze*: le scadenze delle persone (formazione, visite, contratti) coi gruppi Scadute · Nel preavviso · Più avanti,
  come la fase 5; giallo **Nuova scadenza** (persone 2).
- *Costi* (con `costi`): righe per persona (nome, "28,50 € l'ora dal 01/01/2026", la pillola "Usa il costo dello studio"
  se manca); giallo **Nuovo costo** (foglio: persona, dal, **Costo orario** oppure **Dal costo dell'anno** (con
  `riservati`: costo dell'anno e ore, e il costo orario che esce), la frase di conferma dopo il salvataggio).
- *Segna l'uscita* (foglio): data, motivo, l'elenco di §9 ("Da restituire: Fiat Doblò GA123BC, Multimetro 87V"); giallo
  **Segna l'uscita**.
- *Chi ha visto i dati riservati* (pagina): righe con la frase, chi, quando, da dove. Nessun giallo.
- *Consegna DPI* (foglio, da Ha in uso › + DPI): cosa (pillole), taglia, quanti, data, DPI del catalogo (se c'è), poi il
  riquadro della firma su bianco "Ricevuto da Marco Rossato"; giallo **Conferma la firma**; testo **Firma dopo, dal suo
  telefono**.

### 12.2 Persone: computer

Stessa voce, segmenti **Organico · Ferie e permessi · Presenze · Scadenze · Costi**.
- *Organico*: riquadri; tabella (Nome con cerchio, Ruolo nello studio, Rapporto, Accesso, Assente, Scadenze, Costo orario
  con `costi`); tocco = **pannello della persona** (440) con il contenuto della scheda del telefono; giallo **Aggiungi
  una persona** (finestra a due colonne: a sinistra lavoro e orario, a destra contatti e dati personali chiusi).
- *Ferie e permessi*: la **griglia del mese** (righe = persone, colonne = giorni, festivi e weekend in grigio, chiusure a
  strisce, assenze come barre con la parola), a destra **Da approvare** con Approva (giallo nel foglio) e Respingi; giallo
  **Nuova richiesta**. Sopra la griglia **Chiusure dello studio** (bordo).
- *Presenze*: tabella del mese (righe = persone, colonne: giorni lavorati, ore lavorate, straordinarie, ferie, permessi,
  malattia o "altre assenze", mancano), tocco = il dettaglio dei giorni a colonne; **Esporta per il consulente** (bordo);
  Programma paghe **Non collegato**. Nessun giallo.
- *Scadenze*, *Costi*: tabelle coi campi del telefono.

### 12.3 Mezzi e attrezzature: telefono

Segmenti: **Il mio · Mezzi · Strumenti · Altro · Scadenze**. "Altro" ha le righe **Attrezzature**, **DPI**,
**Assegnazioni e prestiti**, **Guasti e manutenzioni** (un livello sotto, decisione 2).
- *Il mio*: **Il mezzo che usi** (scheda grande: "Fiat Doblò GA123BC", stato, "84.320 km · letti il 18/10", la prossima
  scadenza in pillola, il guasto aperto; due pulsanti col bordo **Segna i km** e **Segnala un guasto**); **I tuoi
  strumenti** (righe con la pillola della taratura: "Taratura scaduta da 6 giorni" rossa, "Taratura fra 24 giorni"
  ambra; **Restituisci** nel foglio della riga); **Attrezzature e DPI** che hai; giallo **Prendi uno strumento**
  (l'elenco dei disponibili, poi Lo prendo io). Senza niente: una riga calma "Non hai mezzi né strumenti assegnati".
- *Segna i km* (foglio): km grandi con la tastiera numerica, già scritto l'ultimo valore da correggere, "Ultima lettura:
  84.320 il 18/10", **Fotografa il contachilometri** (tratteggiato, facoltativo); giallo **Salva i km**.
- *Segnala un guasto* (pagina): mezzo o strumento (già scelto), **Cosa succede** (una riga), le foto (Fotografa
  tratteggiato, poi in fila), **Si può usare?** Sì · No, è fermo, km; giallo **Segnala il guasto**. Senza rete: parte
  appena c'è rete, con le foto.
- *Mezzi*: righe (icona del tipo, "Fiat Doblò GA123BC", "Dello studio · Marco Rossato", stato in pillola, prossima
  scadenza); l'auto di una persona "Auto di Manuel Gasparotto · rimborso 0,76 €/km". Giallo **Aggiungi un mezzo** (mezzi
  2).
- *Mezzo* (pagina): titolo, pillole (stato, Dello studio), **Chi ce l'ha** (riga con Cambia per mezzi 2: assegna o presta);
  **Scadenze** (assicurazione, bollo, revisione, tagliando con le pillole); **Km** (ultima lettura, "tagliando fra 5.680
  km", le ultime letture); **Guasti e manutenzioni** (aperti in cima con le foto); **Costi dell'anno** (con `costi`: le
  voci e "0,14 € al km"); **Documenti** (libretto, polizza); **Storico** delle assegnazioni. Giallo: guasto con fermo
  aperto e mezzi 2 → **Chiudi il guasto**; se ce l'ho io → **Segna i km**; se è disponibile → **Lo prendo io**;
  altrimenti nessuno. ⋯: Cambia, Assegna, Presta, Nuova manutenzione, Dismetti.
- *Strumenti*: pillole-filtro **Tutti · Miei · Taratura scaduta · Disponibili**; righe (codice in pillola nera, nome,
  "matr. 22-0451 · Marco Rossato", la pillola della taratura, lo stato). Giallo **Aggiungi uno strumento** (mezzi 2).
- *Strumento* (pagina): codice e nome, marca e modello, matricola, pillole (stato, taratura); **Taratura** ("Tarato il
  15/11/2025 da Laboratorio Tarature Nord Srl · certificato LAT 1234/25 · fino al 15/11/2026", il certificato da aprire,
  lo storico); con non conforme la scheda rossa tenue "Usato in 6 interventi dal 15/11/2025: controlla se le misure
  valgono" con le righe; **Chi ce l'ha**; **Usato in** (gli ultimi interventi: data, rapportino, cliente, impianto, con
  la pillola dello stato di quel giorno); **Guasti**; **Documenti**. Giallo: mezzi 2 e taratura scaduta, in scadenza o
  non conforme → **Registra la taratura** (con al laboratorio → **Registra la taratura** uguale); disponibile → **Lo prendo
  io**; mio → nessuno (Restituisci col bordo). ⋯: Manda in taratura, Assegna, Presta, Segnala un guasto, Dismetti.
- *Registra la taratura* (foglio): data (oggi), esito (Conforme · Regolato · Non conforme), scade il (proposta), laboratorio
  (pillole dei laboratori usati), numero del certificato, **Carica il certificato** (Fotografa · Dal telefono); giallo
  **Salva la taratura**. Non conforme: dopo, la pagina con gli usi da controllare.
- *DPI*: il registro delle consegne per persona (cosa, quando, firmato o "da firmare") e i DPI del catalogo con la
  verifica; giallo **Consegna un DPI**.
- *Assegnazioni e prestiti*: in corso (chi, da quando, rientro; in rosso tenue quelli oltre il rientro), poi lo storico.
  Nessun giallo.
- *Guasti e manutenzioni*: aperti e chiusi, con le foto; nessun giallo (le azioni nella scheda).
- *Scadenze*: quelle di mezzi, strumenti e DPI, come la fase 5; giallo **Nuova scadenza** (mezzi 2).

### 12.4 Mezzi e attrezzature: computer

Segmenti **Mezzi · Strumenti · Attrezzature · DPI · Assegnazioni · Manutenzioni · Scadenze**.
- *Mezzi*: riquadri (Mezzi · Fermi · Guasti aperti · Scadenze vicine); tabella (Mezzo, Di chi è, Chi ce l'ha, Km,
  Tagliando, Prossima scadenza, Stato); tocco = **pannello del mezzo** (440) come la pagina del telefono; giallo **Aggiungi
  un mezzo** (finestra: dati a sinistra, scadenze e tagliando a destra).
- *Strumenti*: riquadri (Strumenti · Taratura scaduta (rosso) · In scadenza · Al laboratorio); tabella (Codice, Nome,
  Matricola, Chi ce l'ha, Taratura (pillola e data), Laboratorio, Stato); pannello dello strumento; giallo **Aggiungi uno
  strumento**.
- *Attrezzature*, *DPI*, *Assegnazioni*, *Manutenzioni*, *Scadenze*: tabelle coi campi del telefono; giallo come sul
  telefono dove c'è.

### 12.5 Collaboratori esterni: telefono

Segmenti **Collaboratori · Incarichi · Compensi · Documenti** (Compensi solo con `costi`).
- *Collaboratori*: righe (cerchio, nome, "Impresa · Impianti elettrici civili e industriali", pillola dell'idoneità, "1
  incarico in corso"); giallo **Nuovo collaboratore** (collaboratori 2).
- *Nuovo collaboratore* (pagina): **Chi è** (ricerca tra i fornitori: "Fanne un collaboratore"; oppure nome e partita
  IVA con **Cerca la partita IVA** della fase 1), **Tipo** (Impresa · Professionista · Occasionale), mestiere,
  abilitazioni, tariffa (con `costi`), chi lo segue; giallo **Salva il collaboratore**.
- *Collaboratore* (pagina): nome, pillole (tipo, idoneità); **Idoneità** (le righe dei documenti che servono con la
  pillola: "DURC · scade fra 7 giorni", "Visura · fino al 01/01/2027"; riga **Scarica il DURC dal portale DURC On Line ·
  Non collegato**; **+ Aggiungi un documento**); **Incarichi** (righe: numero, titolo, commessa, stato, avanzamento in
  barra); **Compensi** (con `costi`: pattuito, maturato, fatturato, da fatturare, da pagare); **Valutazioni** ("1 bene",
  le note); **Accesso a Wisper** (le persone con l'accesso, ultimo accesso; **Dai l'accesso a Wisper** col bordo);
  **Contatti** (dal fornitore). Giallo **Nuovo incarico** (collaboratori 2 e `costi` 1). ⋯: Cambia, Apri il fornitore,
  Non più attivo.
- *Nuovo incarico* (pagina): collaboratore (già scelto), **Commessa** (recenti come schede, poi la ricerca), prestazione,
  **Cosa deve fare** (titolo e descrizione), **Come si paga** (A corpo: compenso · A ore: tariffa, ore previste, "+ Un
  tetto"), le spese comprese (Sì · No), dal-al, chi lo segue; giallo **Salva l'incarico**. Dopo: la pagina in bozza.
- *Incarico* (pagina): numero, pillola di stato, titolo, "commessa · cliente"; **Avanzamento** (barra e "60%", **Aggiorna**);
  **Soldi** (con `costi`: pattuito, maturato, fatturato, da fatturare, pagato); **Ore e rapportini** (righe; **+ Ore del
  collaboratore** se lui non ha l'accesso); **Spese**; **Fatture ricevute** (righe con lo stato del pagamento, **Collega
  una fattura ricevuta**); **Documenti** (lettera d'incarico, **Prepara la lettera d'incarico**); **Valutazione** (dopo la
  conclusione); con l'idoneità non in regola la fascia ambra "Manca il DURC"; per un occasionale la riga della
  comunicazione all'Ispettorato **Non collegato**. Giallo secondo lo stato: Bozza → **Affida l'incarico** (conferma con
  l'idoneità non in regola); Affidato a corpo con avanzamento sotto 100 → **Aggiorna l'avanzamento**; Affidato a ore →
  **Segna concluso** (le ore le scrive lui o "+ Ore"); Affidato al 100% → **Segna concluso**; Concluso senza valutazione →
  **Com'è andato?** (foglio: Bene · Con qualche problema · Male, nota, giallo **Salva**); Concluso valutato e Annullato →
  nessuno.
- *Incarichi*: pillole **In corso · Bozze · Conclusi · Da valutare**; righe; nessun giallo.
- *Compensi*: l'anno, righe per collaboratore coi cinque numeri, totale; **Esporta** (bordo); nessun giallo.
- *Documenti*: i documenti di tutti i collaboratori con la scadenza, coi gruppi Scaduti · Nel preavviso · Validi; giallo
  **Aggiungi un documento**.

### 12.6 Collaboratori esterni: computer

Stessa voce, stessi segmenti. *Collaboratori*: tabella (Nome, Tipo, Mestiere, Idoneità, Incarichi in corso, Da fatturare
con `costi`, Valutazioni); pannello del collaboratore; giallo **Nuovo collaboratore**. *Incarichi*: tabella (Numero,
Collaboratore, Commessa, Titolo, Come, Avanzamento, Maturato, Fatturato, Stato); pannello dell'incarico; giallo **Nuovo
incarico** (finestra a due colonne). *Compensi*: tabella e barre per collaboratore (maturato e fatturato); **Esporta**.

### 12.7 L'esterno

Menu ridotto: **Dashboard · Commesse · Ore e rapportini · Attività e calendario · Spese e trasferte · Documenti ·
Ticket e assistenza · La tua scheda** (= Collaboratori esterni, aperta sulla sua scheda). In alto, accanto al nome,
la pillola **Esterno · Impianti Veneti di Sartori Luca**. *Dashboard*: i suoi incarichi (riga con commessa, titolo,
avanzamento in barra), il DURC che scade ("Il DURC scade fra 7 giorni: carica quello nuovo"), i rapportini da far
firmare; giallo **Scrivi il rapportino**. *La tua scheda*: idoneità coi suoi documenti (**Carica un documento** giallo),
gli incarichi, i suoi compensi (maturato, fatturato, pagato: sono suoi), nessun altro collaboratore.

### 12.8 Le altre pagine

- **Rapportino**: passo 3 con **+ Strumenti usati** (§3.9); riepilogo con la riga Strumenti; pagina del rapportino con
  "Strumenti usati" e le pillole; PDF con la riga Strumenti quando c'è.
- **Ticket**: sezione **Strumenti usati** (dai rapportini), pillola rossa **Taratura scaduta** se uno lo era.
- **Calendario** e **Pianificazione settimanale**: le fasce delle assenze e delle chiusure (§6.5); salvando un'attività per
  un assente, il foglio "Marco Rossato è in ferie quel giorno" con **Salvala lo stesso** e **Cambia giorno** (giallo).
- **Il tuo giorno** (Dashboard del telefono): i giorni di ferie, festa, chiusura in grigio con la parola, non "manca".
- **Ore e rapportini › Da approvare**: le voci `assenza` raggruppate per persona.
- **Nuova spesa** (fase 3): **Per quale mezzo** e i **Km del contachilometri** (§7.4); per un esterno niente "L'ho pagata
  io → rimborso": "La metto nella mia fattura".
- **Trasferta**: con un mezzo dello studio "Mezzo dello studio: niente rimborso km" al posto del rimborso; il picker
  mostra **Fermo**.
- **Fatture ricevute** (fase 4): **Incarico**, **Mezzo**, **Strumento** da scegliere; la proposta dell'incarico
  nell'importazione.
- **Commessa**: scheda **Costi** con "Collaboratori esterni" e "Altre fatture ricevute" (§8.6); scheda nuova **Incarichi ·
  N** (con collaboratori 1); gli strumenti in prestito alla commessa.
- **Clienti e fornitori**: pillola **Collaboratore** sul fornitore che ha la scheda, che la apre.
- **Amministrazione**: **Utenti** con la riga Scheda della persona / del collaboratore; **Ruoli e permessi** con la colonna
  **Esterno** (righe bloccate dove non si può dare niente); **Registro attività** col filtro **Dati riservati** (titolare);
  **Impostazioni** › nuova scheda **Persone, mezzi e collaboratori** (santo patrono, conservazione, taratura: preavviso e
  "Con la taratura scaduta: Avviso e conferma · Non si usa", DURC e visura, documenti che servono ai collaboratori, giorni
  senza incarichi per gli esterni), ognuna col suo **Salva** col bordo; **Tipi di formazione** (le righe di §5.3 con
  "ogni" e preavviso; **Nuovo tipo** col bordo).
- **Visita guidata**: due passi in più sul telefono, sulle schermate vere coi dati di esempio: Mezzi › Il mio, la riga
  dello strumento scaduto (leggi: "I tuoi strumenti" / "Il colore e la parola ti dicono se la taratura vale."), e
  Persone › Ferie e permessi, il giallo (leggi: "Le ferie" / "Chiedile da qui: vedi subito quanti giorni ti restano.").

## 13. Prove di fine fase

- **Migrazione 006**: §4.6 (rapportini, ore, trasferte identici; persone dagli utenti; nessun costo cambia).
- **Costo orario**: persona senza costo → regola di oggi; con costo → quello alla data del lavoro; costo nuovo che non
  riscrive le righe vecchie; esterno e ore senza persona → 0 e `costoNoto` vero; il cruscotto della fase 1 che non conta
  due volte le ore degli esterni.
- **Assenze**: i casi di `casi-persone.json` uguali al server, in Kotlin e in `pc/ui/regole-persone.js`; richiesta,
  approvazione, rifiuto col motivo, Annulla, annullare prima e dopo l'inizio, accorciare; nessuno approva le proprie
  tranne il titolare; anomalie; malattia che nasce approvata; sovrapposizione con un'altra assenza; chiusura con le ferie
  per tutti; giorni senza rapportino che saltano ferie, festivi (anche il 4 ottobre) e chiusure; attività per un assente
  con `serveConferma`.
- **Riservati**: per ogni ruolo e per la persona stessa, i campi che arrivano e quelli che non arrivano (persona,
  persone, assenze, presenze, documenti, `/file/<id>`, esportazioni); `accessi_riservati` scritto e non cancellabile; il
  registro con `"(riservato)"`.
- **Uscita e anonimizzazione**: uscita con accesso disattivato, assenze future annullate, attività e ticket liberati,
  contatti tolti; anonimizzazione solo del titolare, file tolti dal disco, rapportini intatti.
- **Mezzi**: proprietà studio → trasferta senza rimborso; proprietà persona → come oggi; km più bassi rifiutati e salto
  grande con conferma; tagliando a km; revisione proposta (`casi-mezzi.json`); guasto con fermo che blocca Lo prendo io;
  costi del mezzo senza doppioni (spesa legata a ricevuta).
- **Tarature**: gli stati di `statoTaratura` (`casi-mezzi.json`); taratura conforme che chiude la scadenza e fa la
  prossima; non conforme con gli usi da controllare; riparazione che porta a "non scritta"; strumento scaduto nel
  rapportino con conferma (e con `blocco`), non conforme mai scelto, rapportino della coda mai rifiutato; stato congelato
  in `strumenti_usati`; PDF dei rapportini senza strumenti identico, con la riga Strumenti quando ci sono.
- **Assegnazioni**: una sola in corso; Lo prendo io e Restituisci senza rete con `idLocale` ripetuto; prestito oltre il
  rientro in Dashboard.
- **Collaboratori**: fornitore che diventa collaboratore (doppione per partita IVA); idoneità coi documenti e le
  scadenze; affidare con idoneità non in regola (conferma, nota nel registro); i casi di `casi-incarichi.json`; ricevuta
  collegata all'incarico dall'XML; costo della commessa con collaboratori e altre ricevute; esterno che vede solo le sue
  commesse e i suoi compensi, non trova le altre cose (prove su ogni azione), scrive rapportini con l'incarico messo da
  solo; spese dell'esterno fuori dai rimborsi.
- **Schermate vere** su telefono e computer, chiaro e scuro, confrontate col prototipo; il flusso intero coi dati di
  prova: Marco (senza rete) chiede le ferie, segna i km, segnala un guasto con la foto, scrive un rapportino col
  multimetro scaduto confermando → rete → Manuel approva le ferie vedendo l'anomalia, registra la taratura del
  multimetro, affida un incarico a Impianti Veneti con il DURC in scadenza → Luca entra come esterno, scrive le ore
  sull'incarico → la fattura ricevuta collegata → il costo della commessa.

## 14. Da confermare e da decidere

**Col consulente del lavoro** (fonti in `ricerca-fase6.md` §5 e §8): tempi di conservazione dopo l'uscita (10 anni
proposti) e l'informativa ai dipendenti; ferie e permessi in ore e le ore all'anno del CCNL; rateo del mese di entrata e
di uscita; colonne del riepilogo delle presenze; se la comunicazione preventiva degli occasionali riguarda lo studio.
**Con l'RSPP e il medico competente**: sorveglianza sanitaria sì o no e per chi; periodicità di formazione, PES, PAV,
PEI, primo soccorso, antincendio, lavori in quota (§5.3); DPI con verifica e ogni quanto; documenti da chiedere a imprese
e professionisti esterni. **Col commercialista**: costo di un collaboratore nella commessa (imponibile + cassa, senza
IVA); prestazione occasionale. **Con Manuel**: chi approva le ferie, chiusure e santo patrono; strumenti, intervalli e
laboratori; se il Volvo di oggi è dello studio o suo; quali collaboratori usa e se vuole dar loro l'accesso. Fino ad
allora valgono i valori proposti qui, tutti modificabili.

**Domande per Andrea** (la raccomandazione per prima):
1. **Collaboratori esterni come fornitori con la scheda** (consiglio sì): un'anagrafica sola, le loro fatture sono già le
   fatture ricevute della fase 4 con ritenuta e F24. L'alternativa (farne delle persone) scrive due volte l'anagrafica e
   conta due volte il loro costo.
2. **Costo orario: la persona prima del costo fisso del cliente e della commessa** (consiglio sì): il costo vero dipende
   da chi lavora; per oggi non cambia niente perché il costo del titolare resta vuoto. L'alternativa: il costo della
   persona solo al posto di `COSTO_ORARIO` (i costi fissi di cliente e commessa vincono sempre).
3. **Taratura scaduta: avviso con conferma e traccia, non conforme sempre bloccato** (consiglio sì), con l'impostazione
   per bloccare anche lo scaduto quando Manuel lo vorrà. L'alternativa: bloccare subito lo scaduto (rischio di rapportini
   non scritti in cantiere).
4. **Accesso agli esterni col ruolo `esterno`, facoltativo** (consiglio sì): scrivono loro ore e rapportini sulla
   commessa, vedono solo le loro cose. L'alternativa: niente accesso, le loro ore le scrive lo studio nella pagina
   dell'incarico (si può fare comunque).
5. **Il tipo delle assenze sanitarie solo col permesso `riservati`** (consiglio sì): l'amministrazione vede "Assente";
   le presenze per il consulente le manda il titolare, oppure il titolare dà `riservati` all'amministrazione da Ruoli e
   permessi. L'alternativa: malattie visibili a tutta l'amministrazione.
6. **Anonimizzazione proposta dopo 10 anni, solo col sì del titolare** (consiglio sì, termine da confermare). L'alternativa:
   automatica.
7. **Presenze ricavate, niente timbrature e niente posizione** (consiglio sì: le ore della fase 3 bastano, e la posizione
   è un controllo a distanza). L'alternativa: un pulsante "Inizio e fine giornata" sul telefono, senza posizione (sarebbe
   un secondo modo di scrivere le stesse ore).
8. **La persona vede i suoi documenti riservati su Wisper** (cedolini, contratto, giudizi) (consiglio sì: sono suoi, e li
   ha sul telefono). L'alternativa: li vede solo il titolare.

**Costi**: nessuno nuovo. Niente servizi esterni, niente abbonamenti: tutto gira sul server del NAS.
