/**
 * Alias: deploy MockUSDC + PixelUsdcLock on Ethereum Sepolia.
 * Prefer: PIXEL_EVM_CHAIN=base-sepolia|amoy|sepolia bun run deploy:evm-lock
 */
process.env.PIXEL_EVM_CHAIN = process.env.PIXEL_EVM_CHAIN ?? "sepolia";
await import("./deploy-evm-usdc-lock");
