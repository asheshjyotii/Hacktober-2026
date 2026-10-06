export type Level = "novice" | "intermediate" | "advanced";

export interface TourOverview {
  summary: string;
  stack: string[];
  audience: string;
}

export interface Component {
  id: string;
  name: string;
  role: string;
  paths: string[];
}

export interface Edge {
  from: string;
  to: string;
  label: string;
}

export interface GlossaryEntry {
  term: string;
  plain: string;
  seenIn: string;
}

export interface ReadingStep {
  order: number;
  path: string;
  why: string;
}

export interface PlacementQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  /** Which idea of the project this question actually tests. */
  tests: string;
}

export interface Project {
  n: number;
  tag: string;
  title: string;
  goal: string;
  study: string[];
  steps: string[];
  checklist: string[];
  minutes: number;
}

export interface RebuildStep {
  action: string;
  command?: string;
  check: string;
  source: string;
}

export interface RebuildPhase {
  phase: string;
  steps: RebuildStep[];
}

export interface TourMetrics {
  /** Cited paths that were real on the first attempt / cited in total. */
  preOk: number;
  preTotal: number;
  /** Model calls that were repeated because of bad paths or shape. */
  retries: number;
  /** Wall-clock generation time in ms. */
  ms: number;
}

export interface Tour {
  repo: string;
  branch: string;
  commit: string;
  fetchedAt: string;
  verified: { ok: number; total: number };
  overview: TourOverview;
  components: Component[];
  edges: Edge[];
  readingPath: ReadingStep[];
  glossary: GlossaryEntry[];
  placement: PlacementQuestion[];
  projects: Project[];
  rebuild: RebuildPhase[];
  /** How accurate the model was before our checks and retry. */
  metrics?: TourMetrics;
  /** Non-fatal caveats shown above the tour (truncated tree, no README, ...). */
  notices?: string[];
  /** Leaves for the exploded file-tree illustration. */
  tree: { path: string; depth: number; kind: "dir" | "file" }[];
}

export type Stage = "understand" | "placement" | "projects" | "rebuild";
