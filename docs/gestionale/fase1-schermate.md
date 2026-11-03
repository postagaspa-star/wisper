# Fase 1: le schermate (guida per chi costruisce)

Vale per l'app Android e per Wisper Ufficio. Il riferimento visivo è il prototipo
[`docs/prototipo/Gestionale-fase1.html`](../prototipo/Gestionale-fase1.html) (in alto: Telefono/Computer,
Manuel/Marco), pubblicato anche su https://claude.ai/artifact/FjmuFjBhALHkEGs2urSBEy. Chi costruisce lo apre e ne
riproduce misure, colori, pesi e spaziature. Colori, caratteri, forme e regole dei testi sono quelli di
[`docs/aspetto.md`](../aspetto.md): questa guida dice solo cosa cambia e cosa si aggiunge. Il protocollo e le
risposte del server sono in [`architettura.md`](architettura.md) (§6 e §12).

## 0. Per chi e perché (dalla ricerca del 21/10)

Manuel (titolare) in cantiere col telefono e in ufficio al computer; Laura (amministrazione) al computer; Marco
(collaboratore) col telefono. Il lavoro: sapere ogni mattina cosa c'è da fare e cosa non va, tenere clienti,
fornitori, referenti e impianti in un posto solo, seguire le commesse per prestazioni, dare a ognuno solo quello che
gli serve.

Principi (con la fonte):
1. **La Dashboard risponde a "cosa devo fare adesso?"**: in cima la cosa più urgente, poi Urgenti, Questa settimana,
   Da pianificare; ogni riga porta dove si sistema (Pleya, home; dashboard operative: "prima i problemi, poi i
   grafici").
2. **Il giorno di chi scrive rapportini resta in cima** sul telefono ("Il tuo giorno" = la vecchia Oggi), per non
   rompere un'abitudine che funziona (legge di Jakob).
3. **Menu laterale, ma non nascosto del tutto**: pulsante con la parola "Menu", scorrimento dal bordo, collegamenti
   diretti dalla Dashboard; sul computer aperto con le scritte, richiudibile a icone con il nome al passaggio
   (Nielsen Norman Group: il menu nascosto si scopre il 20% in meno; linee guida delle barre laterali).
4. **Ogni numero apre il suo elenco già filtrato** (drill-down).
5. **Una scheda per tutto il cliente**: dati fiscali in alto, poi referenti, sedi e impianti, commesse, rapportini
   (schede dei CRM: intestazione compatta, record collegati vicini).
6. **Commessa per prestazioni**, ognuna con valore, avanzamento e stato (gestionali per studi tecnici: fasi con il
   loro valore).
7. **Permessi leggibili**: quattro ruoli spiegati con una frase, tre stati scritti (Niente, Vede, Modifica), i nuovi
   utenti partono dal ruolo più basso, l'ultimo titolare non si toglie (pattern dei permessi nei SaaS).
8. **Registro scritto come frasi**: chi, cosa, su cosa, prima e dopo, diviso per giorno, filtrabile, non modificabile
   (pattern dei registri attività).

## 1. Navigazione

**Ordine delle voci** (quello delle specifiche, solo i moduli che funzionano e che il ruolo può vedere):
Dashboard · Clienti e fornitori · Progetti e commesse · Ore e rapportini · Fatturazione · Amministrazione. Le voci
delle fasi successive si aggiungono al loro posto quando funzionano. Icone a tratto come nel prototipo.

**Telefono** (prende il posto della barra in basso della 0.4.0):
- Pagine di primo livello: in alto a sinistra il pulsante **Menu** (pillola alta 44 dp, fondo superficie, icona a tre
  righe + la parola "Menu", 15/800), a destra il cerchio con le iniziali (apre il foglio "Tu": nome, ruolo, Cambia la
  password, Esci).
- Menu a scomparsa da sinistra, largo 312 dp, angoli destri 24, velo nero al 45% (scuro 60%), entra in 300 ms.
  In cima: cerchio 48 con le iniziali, nome (17/800), ruolo (14/600 tenue). Voci alte 52, raggio 16, icona + nome
  (16/700); voce aperta su giallo tenue, 800. Numerino giallo su Fatturazione = clienti con qualcosa da fatturare
  nel mese. In fondo: stato del collegamento ("Collegato · letto alle 16:52" col pallino verde, oppure "Server non
  raggiunto · Riprova") ed **Esci**. Si chiude toccando il velo, scegliendo una voce, scorrendo a sinistra, col
  gesto indietro.
- Si apre anche scorrendo dal bordo sinistro dove il sistema lo permette (con la navigazione a gesti il bordo è del
  "indietro": il pulsante Menu resta la strada principale).
- Pagine interne: pulsante tondo indietro + nome della sezione in piccolo (13/700 tenue), al posto di Menu.
- Le pagine "compito" (rapportino a passi, firma, moduli, invio) restano a tutto schermo, senza menu, con la ×.

**Computer**: barra laterale bianca larga 248 (richiusa 76) col simbolo, "Wisper" e la ragione sociale; voci alte 46;
in fondo stato del collegamento, chi è entrato, **Richiudi il menu**. Richiusa: solo icone, il nome compare al
passaggio del mouse e al fuoco; lo stato aperto/chiuso si ricorda. Animazione 260 ms. Tasto rapido Ctrl+B.

**Pagina iniziale**: la Dashboard, per tutti.

## 2. Accesso

- Simbolo 64, "Entra in Wisper" (30/800), sotto la ragione sociale se il server l'ha già detta.
- **Indirizzo del server**: già scritto nelle build di sviluppo e salvato al primo avvio (come oggi l'indirizzo del
  foglio); se manca, un campo in più sopra l'email. Con l'indirizzo salvato, una riga "Server · Cambia" in fondo.
- Email, Password con l'occhio per mostrarla, **Entra** (giallo 64). Tastiera: email poi password poi Invio = Entra.
- Errori (riquadro rosso tenue sopra i campi, l'email resta scritta): "Email o password sbagliate."; "Troppi
  tentativi: riprova fra 15 minuti."; senza rete o server spento: riquadro grigio "Il server non risponde: controlla
  la rete e riprova." (mai rosso per la sola rete).
- Dopo l'accesso: la Dashboard; al primo accesso su quel dispositivo, la visita guidata.
- **Accesso scaduto o revocato** (`accesso:false`): si torna qui con un riquadro grigio "Sei uscito da questo
  dispositivo: entra di nuovo." I rapportini in attesa sul telefono restano e partono dopo l'accesso.
- **Il passaggio dalla 0.4.0**: al primo avvio della versione nuova l'app chiede di entrare una volta; i rapportini
  ancora in coda partono dopo l'accesso, verso il server.

## 3. Dashboard

Dati da `dashboard` (§12). Struttura dall'alto:
1. Data (15/600 tenue) e "Buongiorno/Buon pomeriggio/Buonasera, {nome}" (30/800).
2. **Il tuo giorno** (solo telefono, solo per chi può scrivere rapportini): la scheda della vecchia Oggi, com'era —
   settimana coi giorni che mancano, il rapportino di oggi con **Scrivi il rapportino** (giallo) e la riga Come ieri,
   la riga "N da far firmare", la pillola della rete in fondo alla pagina. Sul computer non c'è: c'è "Nuovo
   rapportino" (giallo) in alto a destra.
3. **La cosa più urgente** (se c'è): scheda col fondo `#FFF8E5` (scuro `#2A2414`) e il bordo giallo, etichetta "LA
   COSA PIÙ URGENTE" in giallo scuro, titolo 19/800, dettaglio, e un pulsante con bordo che fa la cosa (Prepara il
   riepilogo, Apri la commessa…). È la prima voce `urgenti` del server.
4. **Urgenti · N**, **Questa settimana · N**, **Da pianificare · N**: etichetta e una scheda a righe. Riga alta
   almeno 64: icona 40 in un quadrato a raggio 12 colorato per gravità (urgente = rosso tenue, attenzione = giallo
   tenue, soldi = blu tenue, info = superficie), titolo 16/800, dettaglio 14/600 tenue, importo a destra se c'è,
   freccia. Tocco = `collegamento`. Sezione vuota: non si mostra; tutte vuote: una riga calma con la spunta verde
   "Niente da sistemare oggi".
5. **Commesse**: quattro riquadri (aperte, sospese, in ritardo col numero in rosso se > 0, chiuse), ognuno apre
   Commesse sul filtro giusto. Sul computer stanno sotto il saluto, e le sezioni vanno su due colonne (Urgenti e
   Questa settimana a sinistra, Da pianificare a destra).
- Senza il permesso `costi` niente importi né voci di soldi (il server non li manda).
- Visita guidata: due passi nuovi in testa (Menu, poi "Qui vedi cosa fare adesso") e poi i passi di prima.

## 4. Clienti e fornitori

**Elenco**: titolo, segmenti **Clienti · N | Fornitori · N**, ricerca (nome, alias, città, partita IVA, email),
righe con cerchio colorato e iniziali, nome (16/800), "città · N commesse aperte". Sul computer tabella: cerchio,
Nome, Città, Partita IVA, Tariffa (o Email per i fornitori), Commesse. **Nuovo cliente / Nuovo fornitore** giallo (in
basso sul telefono, in alto a destra sul computer). In fondo all'elenco "Mostra gli archiviati (N)".

**Modulo** (nuovo e modifica, pagina intera sul telefono, finestra sul computer), a gruppi:
- *Chi è*: Nome o ragione sociale (obbligatorio); È un cliente / È un fornitore (tutti e due possibili).
- *Dati fiscali*: Partita IVA con **Controlla** accanto (`controllaPartitaIva`: se valida propone nome e indirizzo,
  che si accettano con un tocco), Codice fiscale, Codice SDI, PEC.
- *Contatti*: Email, Telefono, Indirizzo, CAP, Città, Provincia.
- *Tariffa* (solo clienti, solo con `costi`): come oggi (fissa o libera, costo fisso, viaggio, km).
- *Note*.
- Errori sotto il campo, in rosso, con cosa fare ("La partita IVA ha 11 cifre"). Doppione (stesso nome, alias o
  partita IVA): "C'è già Rossi Impianti Srl" con **Apri** al posto del salvataggio.

**Scheda**: cerchio 56, nome (26/800), pillola Cliente/Fornitore, "C001 · città"; pulsanti con bordo **Chiama**,
**Email** (aprono telefono e posta); sul computer **Modifica** giallo, sul telefono nel menu ⋯ (Modifica, Archivia o
Ripristina). Segmenti: **Dati | Referenti · N | Sedi e impianti · N | Commesse · N** (le commesse solo per i
clienti); in più la riga "Rapportini" che apre Ore e rapportini filtrato sul cliente.
- *Dati*: coppie etichetta/valore su due colonne; se mancano SDI e PEC (e si vedono i soldi) riquadro giallo tenue
  "Mancano codice SDI e PEC: serviranno per le fatture."
- *Referenti*: righe con iniziali, nome, "ruolo · telefono", pulsante tondo per chiamare; tocco = modifica (nome,
  ruolo, telefono, email, note; Togli). **Aggiungi un referente** con bordo.
- *Sedi e impianti*: righe con icona luogo, nome, indirizzo, pillola Sede (grigia) o Impianto (blu); tocco = modifica
  (tipo, nome, indirizzo, CAP, città, provincia, note; Archivia). **Aggiungi una sede o un impianto**.
- *Archivia*: foglio di conferma "Archiviare Rossi Impianti Srl? Non comparirà più negli elenchi e nei rapportini
  nuovi. Commesse e rapportini restano. Si ripristina dagli archiviati." Dopo: avviso con **Annulla**.

## 5. Progetti e commesse

**Elenco**: segmenti **Aperte · N | Sospese · N | Chiuse · N | Archivio · N** (le nascoste contate come oggi);
righe: codice (pillola nera, testo giallo), nome, cliente, barra delle ore sul budget (ambra ≥ 85%, rossa oltre).
Computer: Codice, Commessa, Cliente, Responsabile ("da scegliere" in giallo scuro se manca), Ore sul budget con la
barra, Margine (solo `costi`). **Nuova commessa** giallo; nel modulo "Da un modello" in alto se ci sono modelli.

**Pagina della commessa**: codice e stato in pillole, nome (26/800), "cliente · sede o impianto"; una scheda con
Responsabile, Persone (cerchi 32 con le iniziali), Fine prevista. Segmenti: **Panoramica | Prestazioni · N |
Rapportini | Documenti | Costi | Da fatturare** (gli ultimi due solo con `costi`). Si apre su Prestazioni se ce ne
sono, altrimenti su Panoramica. Menu ⋯: Duplica, Duplica come modello, Sospendi/Chiudi/Riapri, Archivia/Ripristina.
Panoramica, Rapportini, Documenti, Costi, Da fatturare: come la 0.4.0.

**Prestazioni**: in cima (con `costi`) l'importo fatto (28/800) "fatto su {totale} · contratto {importo}" e la
barra; poi le righe: nome (16/800), valore a destra, barra di avanzamento nera, percentuale, pillola **Da fare**
(grigia) / **In corso** (giallo tenue) / **Fatta** (verde). Con il permesso di scrittura, sotto ogni prestazione non
finita **+10%** e **Segna fatta** (pulsanti con bordo, alti 40). Tocco sulla riga = modifica: nome, descrizione,
valore, avanzamento a passi di 5 (lo stato segue: 0 da fare, 1-99 in corso, 100 fatta), **Togli**. Ordine: sul
computer trascinando, sul telefono con "Sposta su/giù" nel foglio di modifica. Nessuna prestazione: riga "Dividi la
commessa in prestazioni (sopralluogo, progetto, direzione lavori…) per seguirne valore e avanzamento." e **Aggiungi
una prestazione**.

**Modulo della commessa**: i campi di oggi più Sede o impianto (quelli del cliente), Responsabile (gli utenti),
Persone (scelta multipla), Importo del contratto (solo `costi`).

## 6. Ore e rapportini, Fatturazione

Come la 0.4.0: la sezione Rapportini diventa la voce "Ore e rapportini"; la fine del mese (oggi la casa di Wisper
Ufficio e la prima pagina di Ufficio sul telefono) diventa la voce **Fatturazione** con titolo "Da fatturare". Il
collaboratore vede solo i suoi rapportini, senza importi; chi ha `rapportini` in lettura non vede i pulsanti per
scrivere.

## 7. Amministrazione

Elenco di pagine (righe con icona, titolo, una riga di stato): **Dati dello studio** (intestazione dei PDF, la tua
firma: come le Impostazioni di oggi) · **Utenti** · **Ruoli e permessi** · **Numerazioni** · **Tariffe e
rimborsi** (rimborso km, costo orario: come oggi) · **Registro attività** · **Copie ed esportazioni** · **Cestino** ·
**L'app** (tema, visita guidata, versione e aggiornamenti: come oggi). Chi ha `amministrazione` in lettura vede tutto
senza pulsanti per cambiare.

**Utenti**: righe con iniziali, nome, "email · ultimo accesso …", pillola del ruolo; "Disattivato" in pillola grigia.
**Nuovo utente** (giallo): foglio con Nome, Email, Ruolo (quattro scelte, ognuna con la sua frase, già scelto
Collaboratore), **Crea l'utente**; dopo: "Password iniziale: XXXX-XXXX-XXXX · Copia · comunicala a voce, la cambierà
lui". Pagina dell'utente: ruolo (cambiarlo apre una conferma che dice cosa vedrà e cosa no), **Nuova password**,
**Disattiva/Riattiva**, **Dispositivi collegati** (nome, app, ultimo uso, **Scollega**). L'ultimo titolare non si
disattiva e non cambia ruolo: i pulsanti non ci sono e una riga dice perché.

Le frasi dei ruoli:
- Titolare: "Vede e cambia tutto, anche utenti e permessi."
- Amministrazione: "Clienti, commesse, fatture e soldi. Non cambia utenti e permessi."
- Collaboratore: "Scrive i suoi rapportini e vede le commesse, senza importi."
- Lettura: "Vede tutto, non cambia niente. Per il commercialista."

**Ruoli e permessi**: segmenti coi quattro ruoli; una scheda col nome e la frase; poi una riga per modulo (nome 15/800
+ una riga che spiega, 13/600) con tre pulsanti **Niente | Vede | Modifica** (scelto: grigio, blu tenue, verde
tenue). Righe: i moduli del menu più **Soldi** ("Tariffe, totali, costi e margini"). Il titolare è bloccato ("Il
titolare ha sempre tutto"). Ogni cambio vale subito: avviso "Permesso cambiato: vale da subito" con **Annulla**.

**Numerazioni**: una scheda per tipo (Commesse, Rapportini): il prossimo numero in pillola, il formato a parole, "il
numero continua da un anno all'altro" / "riparte a gennaio". **Modifica**: il formato con i pezzi da toccare
(anno a 4 o 2 cifre, testo fisso, numero con N cifre) e l'anteprima; "Vale solo per i numeri nuovi: quelli già dati
non cambiano."

**Registro attività**: filtri come pulsanti con bordo (Tutte le persone, Tutto, Ultimi 7 giorni); giorni divisi
("Oggi", "Ieri", "lunedì 20 ottobre"); ogni voce: iniziali, frase "**Laura** ha cambiato la tariffa di **Rossi
Impianti Srl**", sotto i valori prima (barrato, grigio) → dopo (verde tenue), e "oggi alle 16:20". Tocco = foglio con
tutti i campi cambiati. **Esporta per Excel** esporta quello che si vede. Fine: "Inizio del registro". Vuoto con
filtri: "Niente per questi filtri."

**Copie ed esportazioni**: scheda "Ultima copia" (scudo verde, "Stanotte alle 2:30", "Sul NAS e fuori casa, su
Drive · il foglio è aggiornato"; se non è riuscita: rosso tenue, cosa non ha funzionato, **Riprova**); **Fai una
copia adesso** con bordo; elenco delle copie; **Esporta per Excel**: Rapportini, Clienti e fornitori, Commesse
(il file si salva/condivide: telefono col foglio Condividi, computer con la finestra Salva).

**Cestino**: file tolti (nome, da dove, quando) con **Ripristina**.

## 8. Stati comuni

- Senza permesso per una pagina: scheda calma "Non hai il permesso per vedere questa pagina. Chiedi a {titolare}."
- Caricamento: segnaposto che pulsano piano. Errore del server: frase chiara nella scheda con **Riprova**.
- Senza rete: tutto resta consultabile con l'ultima lettura; scritture fuori dai rapportini chiedono la rete
  ("Serve la rete per salvare: riprova quando c'è").
- Avvisi in basso, scuri, 3,5 s; dopo ogni azione reversibile **Annulla**.

## 9. Cosa NON cambia

Il rapportino in tre passi, la firma, la coda senza rete, i PDF, gli stati e le loro regole, i conti, gli
aggiornamenti automatici firmati, la visita guidata coi dati di esempio (che va aggiornata con le pagine nuove).
