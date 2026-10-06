import { AppError } from "./errors";
import { toGeminiSchema, toStrictSchema, type JsonSchema } from "./schema";

export type Provider = "openrouter" | "gemini";

export interface ModelEnv {
  provider: Provider;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CallOpts {
  /** Ask the API for schema-constrained JSON. Silently dropped if the model rejects it. */
  schema?: JsonSchema;
  schemaName?: string;
  maxTokens?: number;
  temperature?: number;
}

export const DEFAULT_MODEL: Record<Provider, string> = {
  openrouter: "google/gemma-4-31b-it",
  gemini: "gemma-4-31b-it",
};

export function extractJSON(text: string): unknown {
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new AppError("model", "Model returned no JSON object.");
  t = t.slice(a, b + 1);
  try {
    return JSON.parse(t);
  } catch {
    // common small-model slip: trailing commas
    try {
      return JSON.parse(t.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      throw new AppError("model", "Model returned malformed JSON.");
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RawReply {
  text: string;
  note: string;
}

class QuotaError extends Error {
  constructor(
    public delaySec: number,
    public daily: boolean,
  ) {
    super("quota");
  }
}

/** HTTP 400: usually "this model does not support that option". */
class BadRequest extends Error {}

/** provider/model pairs that rejected schema output once; we stop sending it. */
const noSchema = new Set<string>();
const modelKey = (e: ModelEnv) => `${e.provider}/${e.model}`;

async function failFrom(res: Response, provider: Provider): Promise<never> {
  const body = await res.text().catch(() => "");
  const snippet = body.slice(0, 240).replace(/\s+/g, " ");
  if (res.status === 401 || (res.status === 403 && /key|auth|permission/i.test(body))) {
    throw new AppError("model", `${provider === "openrouter" ? "OpenRouter" : "Gemini"} rejected the API key. Check it in Settings.`);
  }
  if (res.status === 402) {
    throw new AppError("model", "OpenRouter says this account is out of credits. Add credits or pick a :free model in Settings.");
  }
  if (res.status === 429) {
    const m = /retry in ([\d.]+)s/i.exec(body);
    const h = Number(res.headers.get("retry-after"));
    const delay = m ? Math.ceil(Number(m[1])) : h > 0 ? Math.ceil(h) : 15;
    throw new QuotaError(delay, /PerDay|per day|daily/i.test(body));
  }
  if (res.status === 400) throw new BadRequest(snippet);
  throw new AppError("model", `Model API ${res.status}: ${snippet}`);
}

async function callOpenRouter(env: ModelEnv, messages: ChatMessage[], o: CallOpts): Promise<RawReply> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.apiKey}`,
      "x-title": "DestructGitHub",
      "http-referer": "http://localhost",
    },
    body: JSON.stringify({
      model: env.model,
      messages,
      temperature: o.temperature ?? 0.4,
      max_tokens: o.maxTokens ?? 14000,
      ...(o.schema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: o.schemaName ?? "result", strict: true, schema: toStrictSchema(o.schema) },
            },
          }
        : {}),
    }),
    signal: AbortSignal.timeout(170_000),
  });
  if (!res.ok) await failFrom(res, "openrouter");
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string; code?: number };
  };
  if (data.error) {
    if (data.error.code === 429) throw new QuotaError(15, false);
    if (data.error.code === 400) throw new BadRequest(String(data.error.message));
    throw new AppError("model", `OpenRouter error: ${String(data.error.message).slice(0, 200)}`);
  }
  const c = data.choices?.[0];
  return {
    text: c?.message?.content ?? "",
    note: `in=${data.usage?.prompt_tokens} out=${data.usage?.completion_tokens} finish=${c?.finish_reason}`,
  };
}

async function callGemini(env: ModelEnv, messages: ChatMessage[], o: CallOpts): Promise<RawReply> {
  // Gemma rejects systemInstruction, so fold system text into the first user turn.
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns = messages.filter((m) => m.role !== "system");
  const contents = turns.map((m, i) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: i === 0 && system ? `${system}\n\n${m.content}` : m.content }],
  }));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.apiKey },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: o.temperature ?? 0.4,
        maxOutputTokens: o.maxTokens ?? 16000,
        ...(o.schema ? { responseMimeType: "application/json", responseSchema: toGeminiSchema(o.schema) } : {}),
      },
    }),
    signal: AbortSignal.timeout(170_000),
  });
  if (!res.ok) await failFrom(res, "gemini");
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return {
    text: parts.filter((p) => !p.thought).map((p) => p.text ?? "").join(""),
    note: `in=${data.usageMetadata?.promptTokenCount} out=${data.usageMetadata?.candidatesTokenCount} finish=${data.candidates?.[0]?.finishReason}`,
  };
}

/** One provider call, dropping schema output if the model refuses it. */
async function complete(env: ModelEnv, messages: ChatMessage[], o: CallOpts): Promise<RawReply> {
  const call = env.provider === "gemini" ? callGemini : callOpenRouter;
  const useSchema = !!o.schema && !noSchema.has(modelKey(env));
  try {
    const r = await call(env, messages, useSchema ? o : { ...o, schema: undefined });
    console.log(`[model] ${modelKey(env)}${useSchema ? " +schema" : ""} ${r.note}`);
    return r;
  } catch (e) {
    if (e instanceof BadRequest) {
      if (useSchema) {
        noSchema.add(modelKey(env));
        console.error(`[model] ${modelKey(env)} rejected schema output, falling back: ${e.message.slice(0, 120)}`);
        return complete(env, messages, o);
      }
      throw new AppError("model", `Model API 400: ${e.message}`);
    }
    throw e;
  }
}

function describe(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return new AppError("timeout", "The model took too long to answer. Try again, or pick a faster model in Settings.");
  }
  return new AppError("model", `Model call failed: ${e instanceof Error ? e.message : String(e)}`);
}

/** Retries quota waits (not counted as attempts) and one transient failure. */
async function withRetries<T>(env: ModelEnv, fn: () => Promise<T>, attempts: number): Promise<T> {
  if (!env.apiKey) {
    throw new AppError("model", "No API key set. Open Settings on the home page and paste your OpenRouter key.");
  }
  let last: AppError = new AppError("model", "Model call failed.");
  let waits = 0;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof QuotaError) {
        if (!e.daily && waits < 4 && e.delaySec <= 65) {
          waits++;
          console.error(`[model] rate limited, waiting ${e.delaySec + 1}s (${waits}/4)`);
          await sleep((e.delaySec + 1) * 1000);
          i--; // a quota wait is not a failed attempt
          continue;
        }
        throw new AppError(
          "rate_limited",
          e.daily ? "Daily model quota is used up. Try another model or key in Settings." : `Model quota hit. Retry in about ${e.delaySec}s.`,
          e.daily ? undefined : e.delaySec,
        );
      }
      last = describe(e);
      // key/credit problems will not fix themselves on a second try
      if (/rejected the API key|out of credits/.test(last.message)) throw last;
    }
  }
  throw last;
}

/** Single swap point for a different provider. */
export async function generateJSON(env: ModelEnv, prompt: string, opts: CallOpts = {}, attempts = 2): Promise<unknown> {
  return withRetries(
    env,
    async () => extractJSON((await complete(env, [{ role: "user", content: prompt }], opts)).text),
    attempts,
  );
}

/** Plain-text reply, used by the repo chat. */
export async function generateText(env: ModelEnv, messages: ChatMessage[], opts: CallOpts = {}): Promise<string> {
  return withRetries(
    env,
    async () => {
      const text = (await complete(env, messages, opts)).text.trim();
      if (!text) throw new AppError("model", "Model returned an empty reply.");
      return text;
    },
    2,
  );
}
