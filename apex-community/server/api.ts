import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { AppError, STATUS } from "./errors";
import { parseRepo, readRepo } from "./repo";
import { generate } from "./generate";
import { DEFAULT_MODEL, type ModelEnv, type Provider } from "./model";
import { validate, usable } from "./validate";
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

const mem = new Map<string, Tour>();
const inflight = new Map<string, Promise<Tour>>();
const CACHE_DIR = path.resolve(".cache");

function cachePath(repo: string, sha: string) {
  return path.join(CACHE_DIR, `${repo.replace("/", "__")}@${sha.slice(0, 7)}.json`);
}

export async function getTour(input: string, env: Env, choice: LlmChoice = {}): Promise<Tour> {
  const repo = parseRepo(input);
  const key = repo.toLowerCase();
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const r = await readRepo(repo, env.GITHUB_TOKEN || undefined);
    const mk = `${r.repo}@${r.commit.slice(0, 7)}`;
    const hit = mem.get(mk);
    if (hit) return hit;
    const file = cachePath(r.repo, r.commit);
    if (fs.existsSync(file)) {
      const t = JSON.parse(fs.readFileSync(file, "utf8")) as Tour;
      mem.set(mk, t);
      return t;
    }
    const { a, b, metrics } = await generate(resolveModel(env, choice), r);
    const tour = validate(a, b, r, { metrics, notices: r.notices });
    const bad = usable(tour);
    if (bad) throw new AppError("model", bad);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(tour));
    mem.set(mk, tour);
    return tour;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

export function apiPlugin(env: Env): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.startsWith("/api/config")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ serverKey: !!env.OPENROUTER_API_KEY, model: env.LLM_MODEL || DEFAULT_MODEL.openrouter }));
      return;
    }
    if (!req.url?.startsWith("/api/tour")) return next();
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    };
    try {
      const repo = new URL(req.url, "http://x").searchParams.get("repo") ?? "";
      const h = (k: string) => {
        const v = req.headers[k];
        return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
      };
      send(200, await getTour(repo, env, { provider: h("x-llm-provider"), model: h("x-llm-model"), key: h("x-llm-key") }));
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
