# FACILITATOR GUIDE — Random Dots
Versione 0.1 — 26/11/2026. Per Lorenzo (facilitatore e relatore). Lingua dell'app: inglese.
Indirizzo per il pubblico: **https://lorenzolancisi.github.io/random-dots/**
Console (smartphone): `…/random-dots/console.html` · Display (PC + proiettore): `…/random-dots/display.html`

## 1. Prima della presentazione (a casa, una volta)
1. Prendi il **seed** e il **conteggio** della variante scelta: file riservato `Cartella_presentazione\random-dots\local\candidates.json`, voce con la lettera scelta. Non metterli nelle slide.
2. Metti nella slide iniziale il QR (lo mostra anche il Display) o l'indirizzo sopra.
3. Smartphone: apri la console, *Sign in with Google* con l'account del facilitatore. PC: apri il Display, stesso accesso. Gli accessi restano memorizzati.

## 2. In sala, prima del talk (≈5 min)
1. **PC collegato al proiettore → Display** (`display.html`), poi tasto ⛶ in basso a sinistra per lo schermo intero.
2. **Smartphone → console**:
   - Se c'è una sessione di prova vecchia, esporta il CSV se ti serve, poi *New session*.
   - Inserisci seed e conteggio e premi *Preview stimulus*: controlla che compaia l'immagine giusta.
   - Premi **Create session**.
3. In console: **Advance → Waiting room (QR open)**. Il Display mostra QR, indirizzo e iscritti per gruppo.
4. Lascia la sessione aperta durante la prima parte del talk (D-08).

## 3. Copione dei 7 minuti
| Fase (console: *Advance →*) | Durata | Cosa dici | Cosa vedono |
|---|---|---|---|
| Waiting room (già aperta) | — | "Scan the QR. This half of the room chooses **A**, that half **B**." Guarda in console i contatori A/B; correggi se un gruppo è vuoto. | Display: QR + iscritti. Telefoni: scelta A/B |
| **1 · Individual estimate** | 45 s | "How many dots? Your own estimate, no talking. Type a number and confirm." | Display: immagine + timer. Telefoni: campo numero |
| **2 · Group discussion** | 120 s | "Now discuss in your group. The app has picked a **spokesperson** for each group: they enter ONE number." | Display: immagine + timer + "sent ✓". Telefono del portavoce: campo stima di gruppo |
| **3 · Final individual estimate** | 45 s | "The image is gone. Your own final estimate again." | Display: immagine nascosta. Telefoni: campo numero |
| **4 · Results** | ~60 s | Commenta: verità, stime iniziali e finali, gruppi A/B. | Display: conteggio esatto, grafico, tabella |
| **5 · Debriefing** | ~60 s | Usa i 3 messaggi neutrali; niente conclusioni generali (D-05). | Display: risultati + messaggi |
| **Completed** | — | "Thank you." | Fine |

Il timer è solo informativo: a 0:00 non succede nulla, avanzi tu (D-03). Nella console ogni avanzamento chiede conferma.
Se il portavoce non reagisce: console → *Groups* → **Re-draw spokesperson**, oppure scrivi tu la stima del gruppo con **Enter/correct**.
Se avanzi per errore: **Back ←**, un passo indietro. Non è possibile da *Completed*.

## 4. Dopo l'evento
1. Console → **Export 3 CSV**: participants, group_estimates, session_summary.
2. Entro 7 giorni: **Delete this session's data**. Chiede di digitare il codice della sessione (D-16).

## 5. Problemi e ripieghi
| Problema | Cosa fare |
|---|---|
| Il telefono di un partecipante si blocca o si ricarica | Riaprire la pagina: riprende dalla fase corrente con la stessa identità |
| Qualcuno ha sbagliato gruppo | Prima della discussione cambia da solo; dopo: console → *Participants* → A/B |
| Lo smartphone della console è scarico o senza rete | Apri `console.html` in una seconda finestra del PC (D-15) |
| Il Display mostra "not the facilitator" | Accedi con l'account del facilitatore |
| Wi-Fi della sala non funziona | I partecipanti usano i dati mobili: l'app è su internet |
| Nulla funziona | Si fa a voce: stima scritta su un foglio o per alzata di mano; i dati non vengono raccolti (PIANO §6.8) |
