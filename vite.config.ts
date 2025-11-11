import { defineConfig } from "vite";
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync, mkdirSync } from "fs";

export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: "copy-extension-files",
      closeBundle() {
        // Copy manifest
        copyFileSync("manifest.json", "dist/manifest.json");

        // Copy HTML files
        copyFileSync("popup.html", "dist/popup.html");
        copyFileSync("instruction.html", "dist/instruction.html");

        // Copy non-built JS files
        copyFileSync("background.js", "dist/background.js");
        copyFileSync("content.js", "dist/content.js");

        // Copy CSS for content script
        copyFileSync("styles.css", "dist/styles.css");

        // Copy icons
        mkdirSync("dist/icons", { recursive: true });
        copyFileSync("icons/icon16.png", "dist/icons/icon16.png");
        copyFileSync("icons/icon48.png", "dist/icons/icon48.png");
        copyFileSync("icons/icon128.png", "dist/icons/icon128.png");
      },
    },
  ],

  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.tsx"),
        instruction: resolve(__dirname, "instruction.tsx"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },

  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
});
