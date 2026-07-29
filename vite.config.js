import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/client",
  server: {
    host: "0.0.0.0",
    port: 8000,
    allowedHosts: ["mmo.benclmnt.com", "ben-nmmo.exe.xyz"],
    proxy: {
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
