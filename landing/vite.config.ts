import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // absolute base: the site is served at a domain root (Cloudflare Workers assets),
  // and SPA fallback can serve index.html at nested paths where "./" would break
  base: "/",
  server: { port: 5188, strictPort: true },
});
