#!/usr/bin/env bun
/**
 * Register /pixel slash commands (guild = instant; global = up to 1h).
 *   DISCORD_BOT_TOKEN=… DISCORD_APP_ID=… [DISCORD_GUILD_ID=…] bun run discord:register
 */
import { registerCommands } from "../src/discord/pixel-invite-bot";

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const appId = process.env.DISCORD_APP_ID?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  if (!token || !appId) {
    console.error("Need DISCORD_BOT_TOKEN and DISCORD_APP_ID");
    process.exit(1);
  }
  await registerCommands({ token, appId, guildId });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
