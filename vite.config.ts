import { defineConfig } from "vite";

// GitHub project page: https://<user>.github.io/<repo>/
export default defineConfig({
  base: "/dream-journal/",
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
