# DATA_MODEL — Random Dots (WP2)
Versione 0.1 — 26/11/2026. Fonti: PROJECT_BRIEF (Dati, Stati), DECISIONI D-01…D-17.
Stato: **REALIZZATO** il modulo `src/shared/protocol.js` (testato). Regole Firestore **scritte, non ancora pubblicate né testate online** (l'emulatore non è scaricabile dal sandbox): si testano con la pagina di autotest dopo il passo R.

## Firestore (database eur3)
| Percorso | Contenuto | Chi legge | Chi scrive |
|---|---|---|---|
| `meta/current` | `session_id` della sessione corrente (URL breve senza codice) | utenti autenticati | facilitatore |
| `sessions/{sid}` | `state`, `created_at`, `updated_at`, `timers` (durate per fase, default 45-120-45-60-60), `timer` `{duration_s, started_at_ms, paused_remaining_s}`, `groups_locked`, `stimulus_params` (algoritmo, dimensioni, raggio, distanza minima: **senza seed**) | utenti autenticati | facilitatore; bloccato quando `state = completed` |
| `sessions/{sid}/private/secret` | `target` (conteggio esatto), `seed` | **solo facilitatore** (anche il Display, con il suo login) | facilitatore |
| `sessions/{sid}/participants/{uid}` | `group_id` (A/B), `joined_at`, `initial_estimate`, `initial_at`, `final_estimate`, `final_at`, `updated_at` | il partecipante stesso; facilitatore | il partecipante (vedi vincoli); il facilitatore (correzione gruppo) |
| `sessions/{sid}/groups/{A\|B}` | `spokesperson_uid`, `group_estimate`, `entry_mode` (spokesperson \| facilitator), `submitted_at` | membri di quel gruppo; facilitatore | facilitatore; il portavoce estratto (solo la stima) |

`uid` = identificativo dell'account anonimo Firebase del telefono: è l'ID anonimo che collega stima iniziale e finale e sopravvive al refresh. Nessun nome, email o altro dato personale. Gli account anonimi vengono cancellati da Firebase dopo 30 giorni (pulizia automatica attiva); i dati delle sessioni si cancellano dalla console (D-16).
La stima di gruppo sta solo in `groups/`, mai nei documenti dei partecipanti (brief: nessuna duplicazione).

## Vincoli applicati dalle regole (oltre all'interfaccia)
- Ingresso solo in `waiting_room` e `individual_estimation`; scelta o cambio del gruppo solo in queste due fasi (D-06).
- Stima iniziale: una sola volta, solo in `individual_estimation`, solo dopo aver scelto il gruppo, intero 1–2000 (D-03).
- Stima finale: una sola volta, solo in `individual_revision`, intero 1–2000.
- Stima di gruppo: solo il portavoce estratto, una sola volta, solo in `group_discussion` (D-07); il facilitatore può inserirla o correggerla.
- Nessun partecipante legge i documenti degli altri, il conteggio o il seed (brief; D-14).
- Facilitatore = solo l'account Google indicato nelle regole (email verificata, accesso Google).
- Sessione `completed`: nessuna modifica; consentita solo la cancellazione.
- Sessioni separate per percorso (`sessions/{sid}`); tutto il resto del database è chiuso.

## Macchina a stati (`src/shared/protocol.js`)
`created → waiting_room → individual_estimation → group_discussion → individual_revision → results → debriefing → completed`
- Transizioni solo manuali, un passo alla volta. Il timer è informativo e non avanza la sessione (D-03).
- Recupero: un passo indietro consentito, mai da `completed` né verso `created`.
- Stimolo sul Display: visibile in `individual_estimation` e `group_discussion`, nascosto in `individual_revision`, rivelato con il conteggio in `results` e `debriefing`.
- All'avvio di `group_discussion` (un'unica scrittura della console): gruppi bloccati, ingressi chiusi, estrazione del portavoce per gruppo tra chi ha inviato la stima iniziale (altrimenti tra tutti i membri). Il facilitatore può ri-estrarre.
- Timer: `{duration_s, started_at_ms, paused_remaining_s}`; pausa e ripresa ricalcolano l'inizio.
