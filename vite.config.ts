import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify("0.1.0"),
    __BUILD_ID__: JSON.stringify("0.1.0"),
  },
  plugins: [
    react(),
    {
      name: "glsl-module-loader",
      transform(code, id) {
        if (id.endsWith(".glsl")) {
          if (code.includes("export default")) {
            return { code, map: null };
          }
          return {
            code: `export default ${JSON.stringify(code)};`,
            map: null,
          };
        }
      },
    },
  ],
  server: {
    port: 3000,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  worker: {
    format: "es",
  },
});
