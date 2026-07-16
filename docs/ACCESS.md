# Access — Bangladesh · Kansas · everyone

A peasant and a farmer should not need wallets, hex, or broadband.

## Principle

**People speak intents. Gateways speak Pixel.**  
The ledger stays one. Access forms are many.

## Design personas

| Persona | Place | Typical door | First message |
| --- | --- | --- | --- |
| রহিম (Rahim) | Rural Bangladesh | SMS / USSD / hat helper | `পাঠাও rina 5` |
| Dale | Rural Kansas | Smartphone / co-op desk / offline queue | `SEND joe 12` |

Both resolve through a **local directory** (SIM, co-op roster, village phone book). Neither ever types `pix1…`.

## Forms

| Form | Who | How |
| --- | --- | --- |
| SMS | Feature phones | `BALANCE` / `SEND rina 5` / `পাঠাও rina 5` |
| USSD | Any GSM, no data | `1` Balance · `2` Send (name → amount) |
| Shared phone | Village / family Android | Big buttons, name+PIN confirm |
| Helper | Co-op desk, extension agent | Human enters; user confirms YES/PIN |
| Paper + light | Offline / low literacy | Receive via phone number; optical ceremony |
| Offline queue | Spotty coverage | Save intent; `flush` when connected |
| Voice | IVR | Same digit menus as USSD |
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

```ts
import { One } from "@/lib/pixel";

One.Access.parse("পাঠাও rina 5", "sms", "+8801711000001", "bn");
One.Access.handle(intent, { directory, balanceOf });
One.Access.ussd(session, "1", ctx);          // USSD digit menu
One.Access.helperSend(from, to, amt, "en", ctx, "YES");
One.Access.enqueue(queue, intent);           // offline
One.Access.flush(queue, ctx);                // back online
```

`src/lib/pixel/access.ts` — personas, parse, handle, USSD, helper, offline queue.
