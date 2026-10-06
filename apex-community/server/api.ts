import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { AppError, STATUS } from "./errors";
import { parseRepo, readRepo } from "./repo";
import { generate } from "./generate";
import { DEFAULT_MODEL, type ModelEnv, type Provider } from "./model";
import { validate, usable } from "./validate";
import { loadMeta, loadTour, saveMeta, saveTour } from "./cache";
import { chat, type ChatRequest } from "./chat";
import type { Tour } from "../src/types";

interface Env {
  OPENROUTER_API_KEY: string;
  LLM_MODEL: string;
  GITHUB_TOKEN: string;
}

/** Per-request overrides from the Settings panel. */
export interface LlmChoice {
  provider?: string;
  model?: string;
  key?: string;
}

function resolveModel(env: Env, c: LlmChoice): ModelEnv {
  const provider: Provider = c.provider === "gemini" ? "gemini" : "openrouter";
  const key = c.key?.trim() || (provider === "openrouter" ? env.OPENROUTER_API_KEY : "");
  const model = c.model?.trim() || (provider === "openrouter" && env.LLM_MODEL) || DEFAULT_MODEL[provider];
  return { provider, apiKey: key, model };
}

const inflight = new Map<string, Promise<Tour>>();

export async function getTour(input: string, env: Env, choice: LlmChoice = {}): Promise<Tour> {
  const repo = parseRepo(input);
  const key = repo.toLowerCase();
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const r = await readRepo(repo, env.GITHUB_TOKEN || undefined);
    // chat needs the verified path list even when the tour itself comes from cache
    if (!loadMeta(r.repo, r.commit)) saveMeta({ repo: r.repo, branch: r.branch, commit: r.commit, ranked: r.ranked.slice(0, 4000) });
    const hit = loadTour(r.repo, r.commit);
    if (hit) return hit;
    const { a, b, metrics } = await generate(resolveModel(env, choice), r);
    const tour = validate(a, b, r, { metrics, notices: r.notices });
    const bad = usable(tour);
    if (bad) throw new AppError("model", bad);
    saveTour(r.repo, r.commit, tour);
    return tour;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new AppError("invalid", "Message too large."));
        req.destroy();
        return;
      }
      parts.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString("utf8") || "{}"));
      } catch {
        reject(new AppError("invalid", "Request body must be JSON."));
      }
    });
    req.on("error", () => reject(new AppError("unknown", "Could not read the request.")));
  });
}

export function apiPlugin(env: Env): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "";
    if (url.startsWith("/api/config")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ serverKey: !!env.OPENROUTER_API_KEY, model: env.LLM_MODEL || DEFAULT_MODEL.openrouter }));
      return;
    }
    const isTour = url.startsWith("/api/tour");
    const isChat = url.startsWith("/api/chat");
    if (!isTour && !isChat) return next();
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    };
    const h = (k: string) => {
      const v = req.headers[k];
      return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
    };
    const choice: LlmChoice = { provider: h("x-llm-provider"), model: h("x-llm-model"), key: h("x-llm-key") };
    try {
      if (isChat) {
        if (req.method !== "POST") throw new AppError("invalid", "Use POST.");
        const body = (await readBody(req)) as ChatRequest;
        send(200, await chat(resolveModel(env, choice), body));
        return;
      }
      const repo = new URL(url, "http://x").searchParams.get("repo") ?? "";
      send(200, await getTour(repo, env, choice));
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError("unknown", e instanceof Error ? e.message : "Unknown error.");
      console.error(`[api] ${err.kind}: ${err.message}`);
      send(STATUS[err.kind], { error: { kind: err.kind, message: err.message, retryAfter: err.retryAfter } });
    }
  };
  return {
    name: "destructgithub-api",
    configureServer(s) {
      s.middlewares.use(handler);
    },
    configurePreviewServer(s) {
      s.middlewares.use(handler);
    },
  };
}
