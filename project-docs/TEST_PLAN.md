# TEST_PLAN — Random Dots
Versione 0.1 — 26/11/2026 sera. Esiti: **OK** = eseguito e superato (data); **DA FARE** = non ancora eseguito.

## 1. Test automatici (`npm test`, 46 test)
| Area | Cosa verificano | Esito |
|---|---|---|
| Stimolo | conteggio esatto, nessuna sovrapposizione, margini, riproducibilità dal seed (hash fissati), rifiuto di parametri impossibili | OK 26/11 |
| Formule | media, mediana, SD (n−1), quartili type 7, IQR, errori, miglioramento, mancanti; confronto con numpy su 159 dataset | OK 26/11 |
| Protocollo | ordine degli stati, avanzamento manuale, un passo indietro, visibilità dello stimolo, apertura e chiusura di ingressi e gruppi, validazione 1–2000, estrazione del portavoce (anche uniformità), timer e pausa | OK 26/11 |
| CSV e debrief | 3 file, pseudonimi P01…, nessun uid, nessuna stima di gruppo nei record individuali, messaggi neutrali | OK 26/11 |
| Pubblicazione | nessun seed, conteggio, email o regola nei file pubblici | OK 26/11 |

## 2. Test online (browser integrato, progetto Firebase reale)
| Test | Esito |
|---|---|
| `check.html`: init, accesso anonimo su Spark, Firestore raggiungibile | OK 26/11 |
| `selftest.html`: regole + 20 partecipanti simulati (circa 45 operazioni lecite e illecite, realtime, analisi sui dati salvati, CSV, sessione completata bloccata, pulizia) | OK 26/11, 49/49 |
| Prova completa a schermo: console + Display + 2 partecipanti (`&sim=1`) su sessione di prova (seed 777, 150 punti), tutte le fasi da `created` a `completed`; stima non valida; conferma; pausa del timer; portavoce estratto; stima A dal portavoce, stima B dalla console; stimolo nascosto nella fase 3; risultati e debrief con numeri ricontrollati a mano; telefoni "Thank you"; cancellazione dei dati | OK 26/11 sera |
| Difetti trovati e corretti in quella prova: messaggio di validazione del browser nella lingua del telefono; "Group A" ripetuto; facilitatore che apre il link partecipante nello stesso browser | Corretti, da riverificare in T1 |

## 3. Test che richiedono dispositivi reali (Lorenzo)
| ID | Test | Esito |
|---|---|---|
| T1 | Smoke test: console sullo smartphone, Display sul PC, un telefono (o finestra in incognito) come partecipante; refresh del partecipante a metà; scaricamento dei 3 CSV dallo smartphone | DA FARE (26/11 sera) |
| T2 | Pilot 1–2 persone: un iPhone e un Android, Wi-Fi e rete mobile, 7 minuti completi | DA FARE (weekend) |
| T3 | Prova generale in sala o simulata: proiettore, schermo intero, leggibilità del QR da lontano | DA FARE (dom/lun) |

## 4. Criteri di accettazione del brief
| Criterio | Copertura |
|---|---|
| Conteggio esatto e seed | automatici |
| QR | Display (a schermo); scansione reale in T1 |
| 12 utenti simultanei | selftest con 20 |
| ID anonimi e collegamento delle stime | selftest + prova a schermo |
| Stime di gruppo separate | automatici + selftest |
| Fasi manuali, timer non bloccante | prova a schermo (timer in pausa, nessun avanzamento automatico) |
| Aggiornamenti realtime | selftest (< 2 s per 20 client) + prova a schermo |
| Formule | automatici + controllo a mano |
| Mancanti e duplicati | automatici + selftest |
| iOS/Android, Wi-Fi e rete mobile | T2 |
| Refresh e riconnessione | T1 (identità anonima persistente nel browser) |
| CSV | automatici; scaricamento reale in T1 |
| Protezione della dashboard | regole + controllo facilitatore (selftest e prova a schermo) |
| Sessioni multiple | sessioni separate per percorso; selftest su sessione usa e getta |
| Procedura di emergenza | FACILITATOR_GUIDE §5 |
