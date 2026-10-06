import fs from "node:fs";
import path from "node:path";
import type { Tour } from "../src/types";

/** What chat needs to know about a repo without re-reading GitHub. */
export interface RepoMeta {
  repo: string;
  branch: string;
  /** Full SHA, so raw file fetches are pinned. */
  commit: string;
  /** Verified paths, most important first. */
  ranked: string[];
}

const CACHE_DIR = path.resolve(".cache");
const tours = new Map<string, Tour>();
const metas = new Map<string, RepoMeta>();

export const key = (repo: string, sha: string) => `${repo}@${sha.slice(0, 7)}`;
const file = (repo: string, sha: string, ext: string) =>
  path.join(CACHE_DIR, `${repo.replace("/", "__")}@${sha.slice(0, 7)}${ext}`);

function readJSON<T>(f: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJSON(f: string, v: unknown) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v));
}

export function loadTour(repo: string, sha: string): Tour | null {
  const k = key(repo, sha);
  const hit = tours.get(k) ?? readJSON<Tour>(file(repo, sha, ".json"));
  if (hit) tours.set(k, hit);
  return hit;
}

export function saveTour(repo: string, sha: string, tour: Tour) {
  tours.set(key(repo, sha), tour);
  writeJSON(file(repo, sha, ".json"), tour);
}

export function loadMeta(repo: string, sha: string): RepoMeta | null {
  const k = key(repo, sha);
  const hit = metas.get(k) ?? readJSON<RepoMeta>(file(repo, sha, ".meta.json"));
  if (hit) metas.set(k, hit);
  return hit;
}

export function saveMeta(meta: RepoMeta) {
  metas.set(key(meta.repo, meta.commit), meta);
  writeJSON(file(meta.repo, meta.commit, ".meta.json"), meta);
}
