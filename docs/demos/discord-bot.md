# Discord invite bot — `/pixel join|tip|wallet`

Thin Discord surface for friends. **Not** a wallet. **Not** a second Earth.

| Command | Does |
| --- | --- |
| `/pixel join` | Friend pack (phone `/wallet`, laptop `join --require-crowned`, never `init`) |
| `/pixel tip` | Live public tip `/health` — crowned genesis `f1d193…` |
| `/pixel wallet` | Link to site `/wallet` |

---

## Portal setup (Erik — once)

Discord **blocks app creation** until the account has a **verified email**.

Account `chefmcfl` is phone-only. `erik@mcflamingo.com` is already on another Discord account.

Pick one:

1. **Preferred:** Log into the Discord account that already owns `erik@mcflamingo.com` → [Developer Portal](https://discord.com/developers/applications) → create **Pixel Ledger**.
2. **Or:** Add a free alias to `chefmcfl`, e.g. `erik+pixel@mcflamingo.com` (or `discord@mcflamingo.com`) → verify the mail → then create the app.

Then:

1. **Bot** → Reset Token → copy token (secret).
2. OAuth2 → URL Generator → scopes: `bot` + `applications.commands`  
   Permissions: Send Messages, Embed Links, Read Message History, Use Application Commands.
3. Open the invite URL → add bot to your friend server.
4. Copy **Application ID** (General Information).

---

## Run locally

```bash
export DISCORD_BOT_TOKEN='…'
export DISCORD_APP_ID='…'
export DISCORD_GUILD_ID='…'   # optional — instant slash commands in one server
export PIXEL_TIP_RPC=https://pixel-tip-production.up.railway.app
export PIXEL_SITE_URL=https://pixel-chain-story.lovable.app   # or your Lovable URL

bun run discord:register
bun run discord:bot
```

In Discord: `/pixel join` · `/pixel tip` · `/pixel wallet`

---

## Railway (optional always-on)

New service in project (or same workspace), Dockerfile `Dockerfile.discord`:

```
DISCORD_BOT_TOKEN=…
DISCORD_APP_ID=…
DISCORD_GUILD_ID=…          # optional
PIXEL_TIP_RPC=https://pixel-tip-production.up.railway.app
PIXEL_SITE_URL=https://…    # Lovable site origin
```

No volume needed. Process is Gateway long-poll.

---

## Honesty

- Phone custody stays on `/wallet`.
- Tip proof is `GET /health` on the crowned tip — not Discord storage.
- Bot never runs `pixel init`.
