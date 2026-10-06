export type Provider = "openrouter" | "gemini";

export interface LlmSettings {
  provider: Provider;
  model: string;
  key: string;
}

export const PROVIDERS: Record<Provider, { label: string; keyHint: string; keyUrl: string; models: string[] }> = {
  openrouter: {
    label: "OpenRouter",
    keyHint: "sk-or-v1-…",
    keyUrl: "https://openrouter.ai/keys",
    models: ["google/gemma-4-31b-it", "google/gemma-4-31b-it:free", "google/gemini-2.5-flash", "deepseek/deepseek-chat", "openai/gpt-4o-mini"],
  },
  gemini: {
    label: "Google Gemini API",
    keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    models: ["gemma-4-31b-it", "gemini-2.5-flash"],
  },
};

const STORE = "dg_llm";

export function loadSettings(): LlmSettings {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (s && (s.provider === "openrouter" || s.provider === "gemini")) {
      return { provider: s.provider, model: String(s.model ?? ""), key: String(s.key ?? "") };
    }
  } catch {
    /* fall through */
  }
  return { provider: "openrouter", model: "", key: "" };
}

export function saveSettings(s: LlmSettings): void {
  localStorage.setItem(STORE, JSON.stringify(s));
}

export function settingsHeaders(s: LlmSettings): Record<string, string> {
  const h: Record<string, string> = { "x-llm-provider": s.provider };
  if (s.model.trim()) h["x-llm-model"] = s.model.trim();
  if (s.key.trim()) h["x-llm-key"] = s.key.trim();
  return h;
}
