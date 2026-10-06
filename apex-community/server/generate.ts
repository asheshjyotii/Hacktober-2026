import { generateJSON, type ModelEnv } from "./model";
import { buildContext, type RepoData } from "./repo";

const RULES = `HARD RULES:
- Output ONE JSON object and nothing else. No markdown fences, no commentary.
- Every file path you output MUST be copied verbatim from the PATH LIST. Never invent or guess a path. Never output a directory as a path.
- Be specific to THIS repository. Plain language, no hype. Write for someone who just opened the repo.
- Keep strings short (under 200 characters each).`;

const SHAPE_A = `{
  "overview": { "summary": "2-3 sentences: what this project is and does", "stack": ["languages/frameworks"], "audience": "who uses it" },
  "components": [ { "id": "short-kebab-id", "name": "Name", "role": "one sentence", "paths": ["PATH from list"] } ],   // 3-6 items
  "edges": [ { "from": "component id", "to": "component id", "label": "how they connect" } ],                        // 2-8 items, ids must exist in components
  "readingPath": [ { "order": 1, "path": "PATH from list", "why": "why read this at this point" } ],                 // 6-10 steps, start with README if it exists, then entry points, then deeper
  "glossary": [ { "term": "project-specific term", "plain": "plain-English meaning", "seenIn": "PATH from list" } ]    // 8-12 items
}`;

const SHAPE_B = `{
  "placement": [ { "question": "...", "options": ["A","B","C","D"], "answerIndex": 0, "tests": "the idea tested, e.g. 'request lifecycle'" } ],  // EXACTLY 5 questions, 4 options each, answerIndex 0-3, vary the position of the right answer, about this repo's concepts, easy to hard
  "projects": [
    { "n": 1, "tag": "warm-up", "title": "...", "goal": "one sentence", "study": ["PATH from list"], "steps": ["do this..."], "checklist": ["done when..."], "minutes": 30 },
    { "n": 2, "tag": "core", "title": "...", "goal": "...", "study": ["PATH"], "steps": ["..."], "checklist": ["..."], "minutes": 60 },
    { "n": 3, "tag": "blind rebuild", "title": "...", "goal": "rebuild the core of the repo from memory without looking at the source", "study": ["PATH"], "steps": ["..."], "checklist": ["..."], "minutes": 120 }
  ],  // EXACTLY 3 projects in that order. Each: 2-4 study paths, 3-5 steps, 3-4 checklist items. Each is a small project the learner builds/changes themselves, getting harder each time.
  "rebuild": [ { "phase": "Phase name", "steps": [ { "action": "what to do", "command": "optional shell command", "check": "how to verify it worked", "source": "PATH from list that this step mirrors" } ] } ]  // 3-5 phases, 2-4 steps each, to recreate the repo's core from an empty folder
}`;

function prompt(task: string, shape: string, context: string): string {
  return `You are analysing a GitHub repository to build a learning tour for a newcomer.\n\n${RULES}\n\nTASK: ${task}\n\nOUTPUT SHAPE (comments after // are instructions, do not output them):\n${shape}\n\n${context}\n\nNow output the JSON object.`;
}

export async function generate(env: ModelEnv, r: RepoData): Promise<{ a: any; b: any }> {
  const [a, b] = await Promise.all([
    generateJSON(env, prompt("Explain the architecture, reading order and vocabulary.", SHAPE_A, buildContext(r, { maxPaths: 200, files: 5, chars: 2600 }))),
    generateJSON(env, prompt("Write the placement quiz, the three projects, and the rebuild guide.", SHAPE_B, buildContext(r, { maxPaths: 200, files: 3, chars: 2000 }))),
  ]);
  return { a, b };
}
