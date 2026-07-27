#!/usr/bin/env bun
/**
 * Run Pixel Discord invite bot (Gateway).
 *   DISCORD_BOT_TOKEN=… bun run discord:bot
 */
import { registerCommands, runGatewayBot } from "../src/discord/pixel-invite-bot";

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    console.error(
      "Missing DISCORD_BOT_TOKEN.\n" +
        "Portal: https://discord.com/developers/applications → Bot → Reset Token\n" +
        "Docs: docs/demos/discord-bot.md",
    );
    process.exit(1);
  }
  const appId = process.env.DISCORD_APP_ID?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  if (appId && process.env.DISCORD_REGISTER_ON_START !== "0") {
    await registerCommands({ token, appId, guildId });
  }
  await runGatewayBot(token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
