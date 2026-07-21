# Self-custody — the rule

> Every person holds their own Source. No gateway, helper, or pillar may spend for them.

## Law

| Actor          | May                                          | Must not                               |
| -------------- | -------------------------------------------- | -------------------------------------- |
| Person         | Hold optical Personal Source; Kindling; sign | Give seed to a “helpful” app server    |
| Light Pillar   | Provide screen/camera for Kindling           | Store private keys                     |
| SMS / USSD     | Balance, status, invite                      | Authorize spend or hold Source         |
| Helper / co-op | Aim lights, teach ceremony                   | Sign on behalf of the farmer           |
| Sequencer      | Illuminate pixels                            | Seize people’s UTXOs without their sig |

## It is always code

Spend authority is **key material + signature + (when Kindling) presence**.  
An optical grid / maze card / “wallet picture” is only a **representation** of that code — a codec channel, not magic ownership-in-pixels.

- The grid **does not have to show** for someone to hold or pay.
- A pretty face on the phone is not, by itself, the Source.
- Invent may keep the vault **never displayed** as a stealable still during pay.

## Pay face ≠ vault face (required split)

| Surface               | What it is                                                 | Photo / shoulder-surf?                               |
| --------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| **Pay face** (public) | How your hold _looks_ — multi-pixel picture of claim/state | Safe to be seen; must **not** encode the seed        |
| **Vault** (secret)    | Codec that recovers Source key material                    | **Never** show while paying in public; photo = theft |

**Lab honesty:** today’s `forgePersonalSource` maze card still encodes the seed in light (`custody.ts`). That is the **dangerous** row until pay-face ≠ vault is real in product. Do **not** teach “screenshot your wallet picture” as custody — that freezes the secret as a stealable still.

**Practical rule:** when paying, show only a **pay face**. Unlock vault in private — or invent presence where vault never appears on glass.

## Personal Source (not seed-phrase theater)

Default custody form is an **optical maze light card** (`forgePersonalSource` / `unlockPersonalSource`) as a _codec option_, not a requirement to display:

1. Forge once — Source seed exists as code; vault may encode it optically
2. Hold however invent allows — device keystore, never-shown vault, private unlock
3. Kindling: presence seal + **your** signature → settle
4. Pay face may update; vault must not leak into the pay face

No English 12-word ritual required. No telco custodial balance. No “photo of my glowing grid = you own my PIX.”

## Uptake without betrayal

Primitive doors exist so people can enter. They **branch toward** Kindling + Personal Source — they do not replace self-custody with M-Pesa cosplay.
