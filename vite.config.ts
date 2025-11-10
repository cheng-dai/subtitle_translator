import { defineConfig } from "vite";
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],

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
