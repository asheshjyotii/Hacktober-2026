# DestructGitHub — 2-phase plan

Based on `summary.md` (6 Oct 2026). The `Tour` type in `src/types.ts` stays the contract between backend and frontend in both phases.

---

## Phase 1 — Fastest working prototype (target: ~1 working session)

**Goal:** paste a real GitHub URL → server reads the repo → Gemma (Gemini API) analyses it → the existing 4-stage UI renders a real tour, including the three projects (warm-up, core, blind rebuild) tuned by the placement level. Unpolished is fine. Real data is required.

**Speed decisions (deliberate shortcuts):**

| Decision | Why it's fastest |
|---|---|
| API runs as **Vite dev-server middleware** (`server/` + a plugin in `vite.config.ts`) | One `npm run dev`, no Vercel/Cloudflare setup, no CORS. Handler is a plain function so it ports to a serverless route in Phase 2. |
| Plain `fetch` to GitHub + Gemini REST, **no SDKs** | Zero new runtime deps. |
| File contents via `raw.githubusercontent.com` | Doesn't count against the GitHub API rate limit. Only 3 API calls per repo (repo, branch, tree). |
| **Two parallel model calls** | Smaller JSON per call = fewer parse failures, and ~half the latency of sequential calls. |
| Prompted JSON + tolerant parser (strip ``` fences, `JSON.parse`) | Gemma on the Gemini API may not support `responseSchema`/JSON mode. Try `responseMimeType: "application/json"` first, fall back if the API rejects it. |
| Validator = **filter + count only**, no retry | Keeps the "never invent paths" promise with ~20 lines of code. Retry-with-errors waits for Phase 2. |
| Cache = in-memory `Map` + `.cache/<owner>__<name>@<sha>.json` on disk | Demo reruns are instant, and you don't burn quota while iterating on the UI. |
| Generating screen = honest indeterminate steps while the fetch is pending | No streaming/SSE needed. |

### Tasks (in order)

1. **Housekeeping (5 min)**
   - Add `.gitignore`: `node_modules`, `dist`, `.env*`, `.cache`.
   - Add `.env.example` with `GEMINI_API_KEY=`, `GITHUB_TOKEN=` (optional), `GEMINI_MODEL=gemma-4-31b-it`.
   - Commit the current UI prototype as the baseline.

2. **Repo reader — `server/repo.ts` (~45 min)**
   - `parseRepo(input)` → `owner/name` (reuse the Home normalisation).
   - `GET /repos/{o}/{r}` → `default_branch`; `GET /repos/{o}/{r}/branches/{b}` → commit SHA; `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` → tree.
   - Filter: drop lockfiles, `node_modules/`, `vendor/`, `dist/`, `build/`, binaries/images, `*.min.*`, generated files.
   - Rank: README > manifests (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`) > entry points (`main|index|app|server|cli`, `cmd/`) > config/Dockerfile/CI > everything else. Shallow paths beat deep ones.
   - Fetch the top ~12 files from raw, truncated to ~150 lines each. Pack: folder summary (top 2 levels + file counts) + the full filtered path list (capped at ~400 paths) + file excerpts. Budget ~15K tokens.
   - Returns `{ repo, branch, commit, paths: Set<string>, tree, context: string }`.
   - Errors to map: 404 (not found or private), 403/429 (rate-limited), `truncated: true` (too large → use top-level folders only, still proceed).

3. **Model client — `server/model.ts` (~20 min)**
   - One function: `generateJSON(prompt: string): Promise<unknown>` → `POST https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=...`.
   - Tolerant parse (strip fences, slice from the first `{` to the last `}`). Throws a typed `ModelError`.
   - This is the single swap point for a different provider or local Gemma later.

4. **Prompts + generator — `server/generate.ts` (~45 min)**
   - Call A: `overview`, `components`, `edges`, `readingPath` (6–10 steps), `glossary` (8–12).
   - Call B: `placement` (exactly 5 questions with `answerIndex`), `projects` (exactly 3: `n:1` warm-up, `n:2` core, `n:3` blind rebuild; each with `study` paths, `steps`, `checklist`, `minutes`), `rebuild` (3–5 phases).
   - Both prompts embed the exact TypeScript shape from `types.ts`, the packed context, and the hard rule: "Only use paths from the PATH LIST verbatim."
   - Run with `Promise.all`.

5. **Validator — `server/validate.ts` (~30 min)**
   - Coerce shape: default missing arrays to `[]`, clamp `answerIndex`, renumber `projects` to 1..3.
   - For every path-bearing field (`components[].paths`, `readingPath[].path`, `glossary[].seenIn`, `projects[].study`, `rebuild[].steps[].source`): count the total, keep the item only if its path is in `paths`, count `ok`. Drop glossary/reading/rebuild items whose path is invalid; for array fields, filter the bad entries out.
   - `verified = { ok, total }` comes from these real checks.
   - Attach `repo`, `branch`, `commit`, `fetchedAt`, and `tree` (the first ~40 ranked entries for the home illustration).

6. **API route — `server/api.ts` + Vite plugin (~20 min)**
   - `GET /api/tour?repo=owner/name` → cache check → reader → generator → validator → cache write → JSON.
   - Errors return `{ error: { kind: "invalid" | "not_found" | "rate_limited" | "model" | "unknown", message } }` with the right HTTP status.
   - Load `.env` with Vite's `loadEnv` in `vite.config.ts`; keys stay server-side.

7. **Wire the frontend (~45 min)**
   - `App.tsx`: `start(repo)` fires `fetch('/api/tour?repo=…')`, keeps `tour: Tour | null` and `error` in state. Generating stays up until the fetch resolves (keep a minimum of ~1 s so it doesn't flash), then shows the tour.
   - `Generating.tsx`: indeterminate step list ("Reading repo tree", "Picking key files", "Asking Gemma", "Checking every path"), no fake counts, no auto-`onDone`.
   - An error panel with the message and a "Try another repo" button.
   - Remove the hard-coded strings: Rebuild "214 files / four files", Understand "four parts, three connections", Home `FIRST_PATH` (derive from the first non-README `readingPath` entry). Update the header meta text.
   - **Fix the placement scoring bug** (`Placement.tsx:25`): count `a === q.answerIndex`; 0–1 novice, 2–3 intermediate, 4–5 advanced. The project start point depends on this, so it's in scope.
   - Example chips: replace the fictional `harbor/notes-api` and unverified `openclaw/openclaw` with real repos (e.g. `expressjs/express`, `tiangolo/typer`, `pallets/click`, `sindresorhus/ky`). Keep `MOCK_TOUR` only as the home-page tree illustration.

8. **Smoke test (~30 min)**
   - Run 3 real repos (a JS one, a Python one, a small Go one). Check that all 4 stages render, the three projects show real `study` files whose links open on GitHub, and that `verified` looks sane.
   - Tune the prompts once based on what breaks. Commit.

### Phase 1 definition of done
- [ ] `npm run dev` + `GEMINI_API_KEY` in `.env` is the only setup.
- [ ] Any small-to-mid public repo URL produces a tour in under ~60 s (instant on a cached rerun).
- [ ] Stages 1–4 are navigable from the rail. Placement changes which project is highlighted as the starting point.
- [ ] Projects 1/2/3 are repo-specific and every `study` path links to a real file.
- [ ] The verified badge reflects real checks.
- [ ] Not-found, rate-limited and model-failure errors show a readable message instead of a blank screen.
- [ ] `npm run build` passes.

**Out of scope for Phase 1:** deployment, KV, retry loop, streaming progress, per-level regeneration, Mermaid, dark mode, tests, visual polish.

---

## Phase 2 — Harden, deploy, evaluate, polish

Ordered by the PRD cut line: the validator, reading path, level adaptation and rehearsal never get dropped.

1. **Generation quality**
   - Use JSON-schema output if the model supports it. Validate with a small hand-written or `zod` schema.
   - Retry once with the list of invalid paths and schema errors, then drop the remaining bad items.
   - Record pre- vs post-validation path accuracy per run.
   - Better packing: an import-graph hint (files imported by the entry point rank higher), per-language entry-point rules.
2. **Level adaptation for real:** optionally regenerate projects for the chosen level (cache key `repo@commit#level`) instead of only changing the starting point.
3. **Deploy:** move the handler to a Vercel `api/tour.ts` (or a Cloudflare Worker) unchanged. Set env secrets there. Swap the disk cache for platform KV keyed `repo@commit`.
4. **Seed + fallback:** a `scripts/seed.ts` that pre-generates ~10 demo repos into KV. Use `MOCK_TOUR` as the offline fallback.
5. **Full error states (PRD):** private repo, too large (top-level-only mode with a notice), no README, rate-limited with a retry-after time, model timeout.
6. **Real progress:** an SSE or polling endpoint so Generating shows actual steps and counts.
7. **Evaluation harness:** `npm run eval` over the 5-repo benchmark (Python CLI, mid-size JS/TS, Go/Rust, weak README, very large repo). Reports path accuracy before and after validation, plus latency. Feeds the hackathon evaluation slide.
8. **UX polish:** Mermaid wiring diagram with a text fallback, dark mode, a shareable `?repo=` URL, persisting checklist ticks in `localStorage`, a responsive pass, an accessibility pass.
9. **Engineering hygiene:** ESLint + Prettier, unit tests for the ranker, validator and parser, a CI build check.
10. **P1 extras:** first-issue finder (GitHub issues labelled `good first issue` mapped to the projects), a share link.

---

## Risks to check early in Phase 1
- **Gemma on the Gemini API:** confirm the exact model ID, whether it accepts `systemInstruction` and `responseMimeType`, and the free-tier rate limit. If it rejects either option, put everything in the user turn and rely on the tolerant parser.
- **Output length:** call B (placement + 3 projects + rebuild) is the largest. If it truncates, split rebuild into a third parallel call.
- **Unauthenticated GitHub:** 60 requests/hr is ~20 repos/hr at 3 calls each. Fine for a prototype; add `GITHUB_TOKEN` if you hit the limit.
