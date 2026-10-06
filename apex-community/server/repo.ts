import { AppError } from "./errors";

export interface RepoData {
  repo: string;
  branch: string;
  commit: string;
  paths: Set<string>;
  ranked: string[];
  summary: string;
  excerpts: { path: string; text: string }[];
  partial: boolean;
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

async function gh<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "destructgithub",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 404) throw new AppError("not_found", "Repository not found, or it is private.");
  if (res.status === 403 || res.status === 429) {
    throw new AppError("rate_limited", "GitHub rate limit reached. Add GITHUB_TOKEN or try again later.");
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

function score(p: string): number {
  const lower = p.toLowerCase();
  const base = lower.slice(lower.lastIndexOf("/") + 1);
  const depth = p.split("/").length - 1;
  let s = 50;
  if (/^readme(\.\w+)?$/.test(lower)) s = 0;
  else if (/^(package\.json|pyproject\.toml|go\.mod|cargo\.toml|setup\.py|pom\.xml|build\.gradle|gemfile|composer\.json)$/.test(base) && depth <= 1) s = 5;
  else if (/^(main|index|app|server|cli|__main__|__init__|lib|mod|root)\.\w+$/.test(base)) s = 10;
  else if (/(^|\/)cmd\//.test(lower)) s = 12;
  else if (/^(dockerfile|docker-compose\.ya?ml|makefile|tsconfig\.json)$/.test(base) || lower.startsWith(".github/workflows/")) s = 25;
  else if (/(^|\/)(src|lib|app|pkg|internal|core)\//.test(lower)) s = 35;
  else if (/(^|\/)(test|tests|__tests__|docs?|examples?)\//.test(lower) || /\.(test|spec)\./.test(lower)) s = 70;
  return s + depth * 3;
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
  const partial = tree.truncated;
  let all = tree.tree.filter((t) => t.type === "blob").map((t) => t.path).filter(keep);
  if (all.length === 0) throw new AppError("not_found", "No readable source files in this repository.");

  const ranked = [...all].sort((a, b2) => score(a) - score(b2) || a.length - b2.length);
  const paths = new Set(all);

  const top = ranked.slice(0, 8);
  const fetched = await Promise.all(
    top.map(async (p) => {
      try {
        const r = await fetch(`https://raw.githubusercontent.com/${repo}/${commit}/${p.split("/").map(encodeURIComponent).join("/")}`);
        if (!r.ok) return null;
        const text = (await r.text()).split("\n").slice(0, 120).join("\n").slice(0, 3200);
        return { path: p, text };
      } catch {
        return null;
      }
    }),
  );
  const excerpts = fetched.filter((x): x is { path: string; text: string } => x !== null);
  const summary = folderSummary(all);

  return { repo, branch, commit, paths, ranked, summary, excerpts, partial };
}
