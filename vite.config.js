import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/client",
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["benclmntdevbox0.exe.xyz"],
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
