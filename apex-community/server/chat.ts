import { AppError } from "./errors";
import { generateJSON, generateText, type ChatMessage, type ModelEnv } from "./model";
import { loadMeta, loadTour, type RepoMeta } from "./cache";
import type { Level, Stage, Tour } from "../src/types";

export interface ChatRequest {
  repo: string;
  commit: string;
  messages: { role: string; content: string }[];
  stage?: string;
  level?: string | null;
}

/** A backticked path-like token in a reply: `path` is the real file, or null if it is not in the repo. */
export interface PathRef {
  token: string;
  path: string | null;
}

export interface ChatReply {
  reply: string;
  refs: PathRef[];
  /** Files whose real contents were given to the model for this answer. */
  sources: string[];
}

const MAX_TURNS = 8;
const MAX_MESSAGE = 2000;
const MAX_FILES = 3;
const FILE_LINES = 150;
const FILE_CHARS = 5000;
const TOUR_CHARS = 12000;

const STAGES: Stage[] = ["understand", "placement", "projects", "rebuild"];
const LEVELS: Level[] = ["novice", "intermediate", "advanced"];

/** Keep the last turns, drop anything but user/assistant, and make sure the last one is the user's. */
export function sanitizeMessages(raw: unknown): ChatMessage[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ChatMessage[] = [];
  for (const m of list) {
    const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
    const content = typeof m?.content === "string" ? m.content.trim().slice(0, MAX_MESSAGE) : "";
    if (!role || !content) continue;
    out.push({ role, content });
  }
  const tail = out.slice(-MAX_TURNS);
  // history must start with a user turn
  while (tail.length && tail[0].role !== "user") tail.shift();
  if (!tail.length || tail[tail.length - 1].role !== "user") {
    throw new AppError("invalid", "Ask a question first.");
  }
  return tail;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The tour, flattened into text the model can lean on. Capped so free-tier limits survive. */
export function tourContext(t: Tour): string {
  const lines: string[] = [
    `REPO: ${t.repo} (branch ${t.branch}, commit ${t.commit})`,
    `SUMMARY: ${t.overview.summary}`,
    `STACK: ${t.overview.stack.join(", ")}`,
    `AUDIENCE: ${t.overview.audience}`,
    "COMPONENTS:",
    ...t.components.map((c) => `- ${c.id}: ${c.name}: ${c.role} [${c.paths.join(", ")}]`),
    "CONNECTIONS:",
    ...t.edges.map((e) => `- ${e.from} -> ${e.to}: ${e.label}`),
    "READING PATH:",
    ...t.readingPath.map((s) => `${s.order}. ${s.path}: ${s.why}`),
    "GLOSSARY:",
    ...t.glossary.map((g) => `- ${g.term}: ${g.plain} (see ${g.seenIn})`),
    "PROJECTS:",
    ...t.projects.map(
      (p) => `${p.n}. [${p.tag}] ${p.title}: ${p.goal}\n   study: ${p.study.join(", ")}\n   steps: ${p.steps.join(" | ")}`,
    ),
    "REBUILD PHASES:",
    ...t.rebuild.map((ph) => `- ${ph.phase}: ${ph.steps.map((s) => s.action).join("; ")}`),
  ];
  return clip(lines.join("\n"), TOUR_CHARS);
}

function baseIndex(ranked: string[]): Map<string, string[]> {
  const byBase = new Map<string, string[]>();
  for (const p of ranked) {
    const base = p.slice(p.lastIndexOf("/") + 1);
    byBase.set(base, [...(byBase.get(base) ?? []), p]);
  }
  return byBase;
}

/**
 * Backticked file names in a reply, checked against the real tree. Exact paths and unique basenames link;
 * slash-paths that do not exist are flagged. Bare dotted names (`res.json`) are left alone: too ambiguous.
 */
export function pathRefs(reply: string, ranked: string[]): PathRef[] {
  const known = new Set(ranked);
  const byBase = baseIndex(ranked);
  const out: PathRef[] = [];
  for (const m of reply.matchAll(/`([^`\n]+)`/g)) {
    const token = m[1].trim();
    if (out.some((r) => r.token === token) || /\s/.test(token)) continue;
    const bare = token.replace(/^\.\//, "");
    if (known.has(bare)) out.push({ token, path: bare });
    else if (!bare.includes("/") && byBase.get(bare)?.length === 1) out.push({ token, path: byBase.get(bare)![0] });
    else if (bare.includes("/") && /\.\w{1,8}$/.test(bare) && !/^https?:/.test(bare)) out.push({ token, path: null });
  }
  return out;
}

/** Paths the learner named outright: exact path, or a basename that exists exactly once. */
export function mentionedPaths(text: string, ranked: string[]): string[] {
  const known = new Set(ranked);
  const byBase = baseIndex(ranked);
  const out: string[] = [];
  for (const m of text.matchAll(/[\w@./-]+\.\w+|[\w@./-]*\/[\w@./-]+/g)) {
    const tok = m[0].replace(/^\.\//, "").replace(/[.,:;)]+$/, "");
    const hit = known.has(tok) ? tok : byBase.get(tok)?.length === 1 ? byBase.get(tok)![0] : null;
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out.slice(0, MAX_FILES);
}

/** Pull a path list out of whatever the picker model said, keeping only real paths. */
export function parseFileChoice(raw: unknown, ranked: string[]): string[] {
  const known = new Set(ranked);
  const files = Array.isArray((raw as { files?: unknown })?.files) ? ((raw as { files: unknown[] }).files as unknown[]) : [];
  const out: string[] = [];
  for (const f of files) {
    if (typeof f === "string" && known.has(f) && !out.includes(f)) out.push(f);
  }
  return out.slice(0, MAX_FILES);
}

async function pickFiles(env: ModelEnv, t: Tour, meta: RepoMeta, question: string, lastReply: string): Promise<string[]> {
  const prompt = [
    "You choose which repository files to read so a mentor can answer a learner's question.",
    'Output ONE JSON object: {"files": ["PATH", ...]} with 0 to 3 paths copied verbatim from the PATH LIST.',
    'Output {"files": []} if the answer needs no code: a concept question, a greeting, or something the TOUR NOTES already cover.',
    "",
    `REPO: ${t.repo}`,
    `TOUR NOTES:\n${t.components.map((c) => `- ${c.name}: ${c.role} [${c.paths.join(", ")}]`).join("\n")}`,
    `PATH LIST:\n${meta.ranked.slice(0, 200).join("\n")}`,
    lastReply ? `PREVIOUS ANSWER (for context): ${clip(lastReply, 400)}` : "",
    `QUESTION: ${question}`,
    "",
    "Now output the JSON object.",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    return parseFileChoice(await generateJSON(env, prompt, { maxTokens: 300, temperature: 0 }, 1), meta.ranked);
  } catch (e) {
    // a failed picker should not block the answer; the main call surfaces key and quota problems itself
    console.warn(`[chat] file picker failed: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

async function fetchFile(meta: RepoMeta, p: string): Promise<{ path: string; text: string } | null> {
  const url = `https://raw.githubusercontent.com/${meta.repo}/${meta.commit}/${p.split("/").map(encodeURIComponent).join("/")}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const all = (await r.text()).split("\n");
    let text = all.slice(0, FILE_LINES).join("\n");
    const cut = all.length > FILE_LINES || text.length > FILE_CHARS;
    text = text.slice(0, FILE_CHARS) + (cut ? "\n... (file continues; only the start is shown)" : "");
    return { path: p, text };
  } catch {
    return null;
  }
}

export function systemPrompt(t: Tour, meta: RepoMeta, stage: Stage | null, level: Level | null, files: { path: string; text: string }[]): string {
  return [
    `You are a patient mentor helping a developer understand the GitHub repository ${t.repo}. They are using DestructGitHub, a learning tour with four steps: understand, check your level, three projects, rebuild guide.`,
    "",
    "RULES:",
    "- Answer from the TOUR NOTES and FILE CONTENTS below. Do not invent files, functions or behaviour.",
    "- If the answer is not in what you were given, say \"I haven't seen that in the files I have\" and suggest which file from the PATH LIST to open.",
    "- Refer to files by exact path in backticks, copied from the PATH LIST. Never mention a path that is not in the PATH LIST.",
    "- Be concrete and short: a few paragraphs at most. Use fenced code blocks only for code that appears in FILE CONTENTS or that you are clearly proposing as the learner's own code.",
    "- Teach, don't just answer: when helping with a project, give hints and the next step before giving the whole solution, unless they ask for it.",
    "",
    `LEARNER STATE: step = ${stage ?? "unknown"}; level = ${level ?? "not tested yet"}.`,
    "",
    `TOUR NOTES:\n${tourContext(t)}`,
    "",
    `PATH LIST (top ${Math.min(150, meta.ranked.length)} of the verified files):\n${meta.ranked.slice(0, 150).join("\n")}`,
    files.length
      ? `\nFILE CONTENTS (read from ${t.repo} at ${t.commit} for this question):\n${files.map((f) => `=== ${f.path} ===\n${f.text}`).join("\n\n")}`
      : "\n(No file contents were loaded for this question; rely on TOUR NOTES.)",
  ].join("\n");
}

export async function chat(env: ModelEnv, req: ChatRequest): Promise<ChatReply> {
  const sha = String(req.commit ?? "");
  const repo = String(req.repo ?? "");
  const meta = loadMeta(repo, sha);
  const tour = loadTour(repo, sha);
  if (!meta || !tour) {
    throw new AppError("not_found", "This tour is no longer cached on the server. Go back and generate it again to chat about it.");
  }
  const history = sanitizeMessages(req.messages);
  const question = history[history.length - 1].content;
  const lastReply = [...history].reverse().find((m) => m.role === "assistant")?.content ?? "";

  let picks = mentionedPaths(question, meta.ranked);
  if (!picks.length) picks = await pickFiles(env, tour, meta, question, lastReply);
  const files = (await Promise.all(picks.map((p) => fetchFile(meta, p)))).filter((f): f is { path: string; text: string } => !!f);

  const stage = STAGES.find((s) => s === req.stage) ?? null;
  const level = LEVELS.find((l) => l === req.level) ?? null;
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(tour, meta, stage, level, files) }, ...history];
  const reply = await generateText(env, messages, { maxTokens: 1500, temperature: 0.3 });
  return { reply, refs: pathRefs(reply, meta.ranked), sources: files.map((f) => f.path) };
}
