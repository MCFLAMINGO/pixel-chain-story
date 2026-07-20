// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const MCFLAMINGO_LIVE = "https://www.mcflamingo.com/";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        name: "pixel-mcflamingo-live-redirect",
        configureServer(server) {
          // /mcflamingo and /mcflamingo/ must never SPA-404 — send humans to the live site.
          server.middlewares.use((req, res, next) => {
            const path = (req.url ?? "").split("?")[0];
            if (path === "/mcflamingo" || path === "/mcflamingo/") {
              res.statusCode = 302;
              res.setHeader("Location", MCFLAMINGO_LIVE);
              res.end();
              return;
            }
            next();
          });
        },
      },
    ],
  },
});
