import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { apiPlugin } from "./server/api";

export default defineConfig(({ mode }) => {
  const e = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      apiPlugin({
        OPENROUTER_API_KEY: e.OPENROUTER_API_KEY ?? "",
        LLM_MODEL: e.LLM_MODEL ?? "",
        GITHUB_TOKEN: e.GITHUB_TOKEN ?? "",
      }),
    ],
  };
});
