# ONE — Source · Word · Light

Three faces. One substance. Not three ledgers.

| Face | Meaning in Pixel |
| --- | --- |
| **Source** | Keys, genesis, law (21M), origin of commitment |
| **Word** | What is spoken into being — the pixel, the settlement, the artifact |
| **Light** | What reveals — PoLS shine, proximity, SISO continuity |

Without Light, the Word has no color.  
Without Source, Light has nothing to reveal.  
Without Word, Source and Light have no body in the world.

```ts
import { One } from "@/lib/pixel";

const alice = await One.Source.key();
let state = await One.Source.begin(alice);
const { state: next, summary } = await One.reveal({ ... });
```

That single `reveal` is the trinity acting as one: Source commits, Light shines, Word stands.

People who never see code still enter through **`One.Access`** — SMS, USSD, helper desk, offline queue — in Bangla, English, and more. Same ledger; many doors.
