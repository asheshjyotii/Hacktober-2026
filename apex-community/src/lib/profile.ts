import type { Level, PlacementQuestion, Profile } from "../types";

/** 0-1 novice, 2-3 intermediate, 4-5 advanced (scaled for quizzes that are not exactly five). */
export function levelFromScore(score: number, total: number): Level {
  const r = total > 0 ? score / total : 0;
  return r < 0.4 ? "novice" : r < 0.8 ? "intermediate" : "advanced";
}

/**
 * Turn quiz answers into a profile. Returns null for invalid answers (wrong length, out of range)
 * so a server can reject them instead of guessing.
 */
export function buildProfile(questions: PlacementQuestion[], answers: unknown): Profile | null {
  if (!Array.isArray(answers) || answers.length !== questions.length || questions.length === 0) return null;
  const missed: Profile["missed"] = [];
  const known: string[] = [];
  let score = 0;
  let bits = "";
  for (let i = 0; i < questions.length; i++) {
    const a = answers[i];
    const q = questions[i];
    if (!Number.isInteger(a) || a < 0 || a >= q.options.length) return null;
    const ok = a === q.answerIndex;
    if (ok) {
      score++;
      known.push(q.tests);
    } else {
      missed.push({ tests: q.tests, ...(q.path ? { path: q.path } : {}) });
    }
    bits += ok ? "0" : "1";
  }
  const level = levelFromScore(score, questions.length);
  return { level, skipped: false, score, total: questions.length, missed, known, key: `${level}-${bits}` };
}

/** Someone who skipped the quiz is treated as new to the repo. */
export function skippedProfile(): Profile {
  return { level: "novice", skipped: true, score: 0, total: 0, missed: [], known: [], key: "skip" };
}
