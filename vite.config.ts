import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // We hand-manage public/manifest.webmanifest and its <link> in
      // index.html (own branding/icons), so the plugin only needs to add
      // the service worker — not generate its own manifest.
      manifest: false,
      includeAssets: [
        "logo.svg",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "icon-512-maskable.png",
      ],
      workbox: {
        // Precache only the built app shell (JS/CSS/fonts/images). Convex's
        // websocket/HTTP calls are never intercepted, so financial data is
        // always live — offline just means the shell still loads instantly.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
