# Access — Bangladesh · Kansas · everyone

A peasant and a farmer should not need wallets, hex, or broadband.

## Principle

**People speak intents. Gateways speak Pixel.**  
The ledger stays one. Access forms are many.

## Forms

| Form | Who | How |
| --- | --- | --- |
| SMS | Feature phones | `BALANCE` / `SEND rina 5` |
| USSD | Any GSM, no data | Numbered menus → same intents |
| Shared phone | Village / family Android | Big buttons, name+PIN |
| Helper | Co-op desk, extension agent | Human helps; user confirms |
| Paper + light | Offline / low literacy | Receive codes, optical ceremony |
| Offline queue | Spotty coverage | Save intent; sync later |
| Smartphone app | Anyone | Send / Receive / Balance only |

## Local directory

Users know **phone numbers and names**, not `pix1…` addresses.  
A co-op / SIM / village directory maps `rina` → ledger address.  
Helpers and gateways hold that map; peasants never see it.

## Locales

First-class reply copy: English, Bangla (`bn`), Hindi, Spanish, Swahili, plus numeric `und`.

## What we never require

- Always-on internet  
- English fluency  
- Understanding “gas”, “seed phrase”, or block explorers  
- Owning a personal smartphone  

## Code

`src/lib/pixel/access.ts` — `parseAccessText` + `handleAccessIntent`.
