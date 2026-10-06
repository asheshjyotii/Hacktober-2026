import { AppError } from "./errors";

export interface Excerpt {
  path: string;
  text: string;
}

export interface RepoData {
  repo: string;
  branch: string;
  commit: string;
  paths: Set<string>;
  ranked: string[];
  summary: string;
  excerpts: Excerpt[];
  partial: boolean;
  /** Non-fatal caveats to show the user. */
  notices: string[];
}

export interface ContextOpts {
  maxPaths: number;
  files: number;
  chars: number;
  skipFiles?: number;
}

/** Free-tier Gemma allows ~16K input tokens/min, so each model call gets its own slice of the repo. */
export function buildContext(r: RepoData, o: ContextOpts): string {
  const listed = r.ranked.slice(0, o.maxPaths);
  const ex = r.excerpts.slice(o.skipFiles ?? 0, (o.skipFiles ?? 0) + o.files);
  return [
    `REPO: ${r.repo} (branch ${r.branch})`,
    r.partial ? "NOTE: the tree was truncated by GitHub; the list below is partial." : "",
    `FOLDER SUMMARY:\n${r.summary}`,
    `PATH LIST (${listed.length} of ${r.paths.size} files, most important first):\n${listed.join("\n")}`,
    `FILE EXCERPTS:\n${ex.map((e) => `=== FILE: ${e.path} ===\n${e.text.slice(0, o.chars)}`).join("\n\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parseRepo(input: string): string {
  const cleaned = (input ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
    .split("/")
    .slice(0, 2)
    .join("/");
  if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned)) {
    throw new AppError("invalid", "That doesn't look like a GitHub repository. Use owner/repo.");
  }
  return cleaned;
}

/** Seconds until GitHub lets us back in, from retry-after or the rate-limit reset header. */
export function retryAfterSeconds(h: { get(name: string): string | null }, now = Date.now()): number | undefined {
  const ra = Number(h.get("retry-after"));
  if (ra > 0) return Math.ceil(ra);
  const reset = Number(h.get("x-ratelimit-reset"));
  if (reset > 0) return Math.max(1, Math.ceil(reset - now / 1000));
  return undefined;
}

export function rateLimitMessage(wait: number | undefined, hasToken: boolean): string {
  const when = wait === undefined ? "later" : wait < 90 ? `in about ${wait}s` : `in about ${Math.ceil(wait / 60)} min`;
  return `GitHub rate limit reached. Try again ${when}${hasToken ? "." : ", or add a GITHUB_TOKEN to .env for a much higher limit."}`;
}

async function gh<T>(path: string, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "destructgithub",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new AppError("timeout", "GitHub took too long to answer. Try again in a moment.");
    }
    throw new AppError("unknown", "Could not reach GitHub. Check your connection.");
  }
  if (res.status === 404) {
    throw new AppError("not_found", "Repository not found. If it is private, DestructGitHub can only read public repositories.");
  }
  if (res.status === 403 || res.status === 429) {
    const limited = res.status === 429 || res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after");
    if (limited) {
      const wait = retryAfterSeconds(res.headers);
      throw new AppError("rate_limited", rateLimitMessage(wait, !!token), wait);
    }
    throw new AppError("private", "GitHub refused access to this repository. It may be private or blocked.");
  }
  if (!res.ok) throw new AppError("unknown", `GitHub API error ${res.status}.`);
  return (await res.json()) as T;
}

const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|out|target|\.git|\.github\/ISSUE_TEMPLATE|__pycache__|\.venv|venv|coverage|\.next|third_party|testdata|fixtures?|__snapshots__)\//;
const SKIP_FILE =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum|Gemfile\.lock|composer\.lock|uv\.lock|\.DS_Store)$|\.(png|jpe?g|gif|svg|ico|webp|pdf|zip|gz|tgz|jar|woff2?|ttf|eot|mp4|mov|mp3|wasm|bin|exe|dll|so|dylib|pyc|map|lock|snap|csv|parquet)$|\.min\.|\.generated\.|_pb2?\.|\.pb\.go$/i;

function keep(p: string): boolean {
  return !SKIP_DIR.test(p) && !SKIP_FILE.test(p);
}

export function score(p: string): number {
  const lower = p.toLowerCase();
  const base = lower.slice(lower.lastIndexOf("/") + 1);
  const depth = p.split("/").length - 1;
  let s = 50;
  if (/^readme(\.\w+)?$/.test(lower)) s = 0;
  else if (/^(package\.json|pyproject\.toml|go\.mod|cargo\.toml|setup\.py|pom\.xml|build\.gradle|gemfile|composer\.json)$/.test(base) && depth <= 1) s = 5;
  else if (/^(main|index|app|server|cli|__main__|__init__|lib|mod|root)\.\w+$/.test(base)) s = 10;
  // per-language entry points: Go cmd/<name>/main.go, Python cli/core/app, Rust src/main.rs + src/lib.rs
  else if (/^(cli|core|wsgi|asgi|manage|api|router|routes|handler|engine)\.(py|go|rs|rb|ts|js)$/.test(base)) s = 14;
  else if (/(^|\/)cmd\//.test(lower)) s = 12;
  else if (/^(dockerfile|docker-compose\.ya?ml|makefile|tsconfig\.json)$/.test(base) || lower.startsWith(".github/workflows/")) s = 25;
  else if (/(^|\/)(src|lib|app|pkg|internal|core)\//.test(lower)) s = 35;
  else if (/(^|\/)(test|tests|__tests__|docs?|examples?)\//.test(lower) || /\.(test|spec)\./.test(lower) || /_test\.go$|(^|\/)test_\w+\.py$/.test(lower)) s = 70;
  return s + depth * 3;
}

const JS_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.mjs"];

function joinRel(dir: string, rel: string): string {
  const out = dir ? dir.split("/") : [];
  for (const seg of rel.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/** Files that `file` imports, resolved to real paths. Best effort: JS/TS, Python, Rust. */
export function importedPaths(file: string, text: string, paths: Set<string>): string[] {
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
  const found = new Set<string>();
  const add = (p: string) => {
    if (p !== file && paths.has(p)) found.add(p);
  };
  if (/\.(m?[jt]sx?|cjs)$/.test(file)) {
    for (const m of text.matchAll(/(?:from\s+|require\(\s*|import\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = joinRel(dir, m[1]);
      for (const e of JS_EXT) add(base + e);
    }
  } else if (/\.py$/.test(file)) {
    const top = file.split("/")[0];
    const roots = ["", "src/", "lib/", `${top}/`];
    for (const m of text.matchAll(/^\s*(?:from\s+(\.*)([\w.]*)\s+import|import\s+([\w.]+))/gm)) {
      const dots = m[1]?.length ?? 0;
      const mod = (m[2] ?? m[3] ?? "").replace(/\./g, "/");
      if (dots > 0) {
        let d = dir;
        for (let i = 1; i < dots; i++) d = d.includes("/") ? d.slice(0, d.lastIndexOf("/")) : "";
        const base = joinRel(d, mod);
        add(`${base}.py`);
        add(`${base}/__init__.py`);
      } else if (mod) {
        for (const r of roots) {
          add(`${r}${mod}.py`);
          add(`${r}${mod}/__init__.py`);
        }
      }
    }
  } else if (/\.rs$/.test(file)) {
    for (const m of text.matchAll(/^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm)) {
      add(joinRel(dir, `${m[1]}.rs`));
      add(joinRel(dir, `${m[1]}/mod.rs`));
    }
  }
  return [...found];
}

/** Order files by importance. Files imported by entry points get a bonus. */
export function rankPaths(all: string[], boost: Set<string> = new Set()): string[] {
  const s = (p: string) => score(p) - (boost.has(p) ? 15 : 0);
  return [...all].sort((a, b) => s(a) - s(b) || a.length - b.length);
}

function folderSummary(paths: string[]): string {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let d = 1; d <= Math.min(2, parts.length - 1); d++) {
      const k = parts.slice(0, d).join("/") + "/";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const rootFiles = paths.filter((p) => !p.includes("/")).length;
  const lines = [`(root): ${rootFiles} files`];
  for (const [k, v] of [...counts].sort()) lines.push(`${k}: ${v} files`);
  return lines.slice(0, 40).join("\n");
}

const LARGE_REPO_FILES = 6000;
const TOP_LEVEL_DEPTH = 3;

export async function readRepo(input: string, token?: string): Promise<RepoData> {
  const repo = parseRepo(input);
  const meta = await gh<{ default_branch: string; private?: boolean }>(`/repos/${repo}`, token);
  const branch = meta.default_branch;
  const b = await gh<{ commit: { sha: string } }>(`/repos/${repo}/branches/${encodeURIComponent(branch)}`, token);
  const commit = b.commit.sha;
  const tree = await gh<{ tree: { path: string; type: string }[]; truncated: boolean }>(
    `/repos/${repo}/git/trees/${commit}?recursive=1`,
    token,
  );
  if (meta.private) throw new AppError("private", "This repository is private. DestructGitHub only reads public repositories.");
  const partial = tree.truncated;
  const notices: string[] = [];
  let all = tree.tree.filter((t) => t.type === "blob").map((t) => t.path).filter(keep);
  if (all.length === 0) throw new AppError("not_found", "No readable source files in this repository.");

  // Very large repo: stay on the top-level folders so every cited path is still real and the prompt stays small.
  if (partial || all.length > LARGE_REPO_FILES) {
    const deep = all.length;
    all = all.filter((p) => p.split("/").length <= TOP_LEVEL_DEPTH);
    if (all.length === 0) all = tree.tree.filter((t) => t.type === "blob").map((t) => t.path).filter(keep).slice(0, 400);
    notices.push(
      `This is a very large repository${partial ? " (GitHub only listed part of its tree)" : ` (${deep.toLocaleString()} files)`}. ` +
        `The tour covers the top ${TOP_LEVEL_DEPTH} folder levels only, so deeper files are not mentioned.`,
    );
  }
  if (!all.some((p) => /^readme(\.\w+)?$/i.test(p))) {
    notices.push("No README found in the repository root, so the explanation comes from the code and file layout alone.");
  }

  const paths = new Set(all);
  let ranked = rankPaths(all);

  const fetchOne = async (p: string) => {
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${repo}/${commit}/${p.split("/").map(encodeURIComponent).join("/")}`);
      if (!r.ok) return null;
      return { path: p, text: (await r.text()).split("\n").slice(0, 120).join("\n").slice(0, 3200) };
    } catch {
      return null;
    }
  };
  const some = (xs: (Excerpt | null)[]) => xs.filter((x): x is Excerpt => x !== null);

  // pass 1: the obvious entry files. Pass 2: whatever they import.
  const first = some(await Promise.all(ranked.slice(0, 5).map(fetchOne)));
  const boost = new Set(first.flatMap((e) => importedPaths(e.path, e.text, paths)));
  ranked = rankPaths(all, boost);
  const have = new Set(first.map((e) => e.path));
  const second = some(await Promise.all(ranked.filter((p) => !have.has(p)).slice(0, 3).map(fetchOne)));
  const excerpts = [...first, ...second];
  const summary = folderSummary(all);

  return { repo, branch, commit, paths, ranked, summary, excerpts, partial, notices };
}
