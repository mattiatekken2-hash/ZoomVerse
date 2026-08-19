import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;
const basePath = process.env.BASE_PATH || "/";

// Unique stamp for this build. Baked into the bundle as `__BUILD_VERSION__`
// AND written to `version.json` at build time (see emit-version-json plugin).
// At runtime the app compares the two and force-reloads when they differ, so a
// fresh publish is picked up even inside Telegram's aggressive webview cache.
const BUILD_VERSION = String(Date.now());

export default defineConfig({
  base: basePath,
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    {
      // Keep the entry script at the end of <body> so the splash paints before JS downloads.
      name: "keep-entry-script-in-body",
      transformIndexHtml(html) {
        const scriptRe = /<script type="module" crossorigin src="(\/assets\/index-[^"]+\.js)"><\/script>\s*/;
        const match = html.match(scriptRe);
        if (!match) return html;
        const tag = match[0];
        let next = html.replace(tag, "");
        if (!next.includes("</body>")) return html;
        next = next.replace("</body>", `    ${tag.trim()}\n  </body>`);
        return next;
      },
    },
    {
      // Emit dist/public/version.json containing the same BUILD_VERSION so the
      // running app can detect when a newer build has been published.
      name: "emit-version-json",
      apply: "build",
      closeBundle() {
        const outDir = path.resolve(import.meta.dirname, "dist/public");
        try {
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(
            path.join(outDir, "version.json"),
            JSON.stringify({ version: BUILD_VERSION }),
          );
        } catch (err) {
          // Without version.json the auto-update mechanism silently breaks, so
          // surface the failure loudly during the build.
          this.error(
            `emit-version-json: failed to write version.json: ${String(err)}`,
          );
        }
      },
    },
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    modulePreload: { polyfill: false },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "https://zoomverse-api.onrender.com",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
