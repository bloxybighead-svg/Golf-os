import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  // Compile .tsx tests with the automatic JSX runtime (components don't import React),
  // so component smoke tests can render to HTML with react-dom/server.
  esbuild: { jsx: "automatic" },
})
