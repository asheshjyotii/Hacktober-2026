import type { Tour } from "../types";

/** Mocked tour for hour-1 judging: the full product flow, no live pipeline. */
export const MOCK_TOUR: Tour = {
  repo: "harbor/notes-api",
  branch: "main",
  commit: "9f2c1ab",
  fetchedAt: "2026-10-06",
  verified: { ok: 12, total: 12 },
  overview: {
    summary:
      "A small web service for saving and reading short notes. Express routes sit in front of a PostgreSQL schema, and one test file doubles as the behavioural spec. Everything a newcomer needs lives in five files; the other two hundred are plumbing.",
    stack: ["TypeScript", "Express", "PostgreSQL", "Vitest"],
    audience: "Anyone who has written a bit of JavaScript and wants to see how a real API is assembled.",
  },
  components: [
    {
      id: "server",
      name: "Server",
      role: "Starts Express, loads config, mounts routes.",
      paths: ["src/server.ts", ".env.example"],
    },
    {
      id: "routes",
      name: "Routes",
      role: "Every endpoint the service offers. The surface area.",
      paths: ["src/routes/notes.ts"],
    },
    {
      id: "db",
      name: "Data",
      role: "Table shape and the connection pool queries run through.",
      paths: ["src/db/schema.sql", "src/db/pool.ts"],
    },
    {
      id: "tests",
      name: "Tests",
      role: "Expected behaviour, written as code. Read like a spec.",
      paths: ["tests/notes.test.ts"],
    },
  ],
  edges: [
    { from: "server", to: "routes", label: "mounts" },
    { from: "routes", to: "db", label: "queries through" },
    { from: "tests", to: "routes", label: "exercises" },
  ],
  readingPath: [
    {
      order: 1,
      path: "README.md",
      why: "What the service does and how to run it. Look for the environment section.",
    },
    {
      order: 2,
      path: "src/server.ts",
      why: "Where the program starts. Look for the port and the middleware it loads.",
    },
    {
      order: 3,
      path: "src/routes/notes.ts",
      why: "Every endpoint lives here. Look for the five HTTP methods.",
    },
    {
      order: 4,
      path: "src/db/schema.sql",
      why: "The shape of the stored data. Look for the notes table.",
    },
    {
      order: 5,
      path: "tests/notes.test.ts",
      why: "Examples of expected behaviour. Read after the routes.",
    },
  ],
  glossary: [
    {
      term: "Middleware",
      plain: "A function that runs before your route handler. One of them logs every request.",
      seenIn: "src/server.ts",
    },
    {
      term: "Endpoint",
      plain: "A URL the service answers, such as the one that lists notes.",
      seenIn: "src/routes/notes.ts",
    },
    {
      term: "Schema",
      plain: "The plan for how data is stored. In this repo it is one file of SQL.",
      seenIn: "src/db/schema.sql",
    },
    {
      term: "Pool",
      plain: "A small set of reusable database connections, so queries do not open a fresh one each time.",
      seenIn: "src/db/pool.ts",
    },
    {
      term: "Migration",
      plain: "A numbered change to the database shape, applied in order.",
      seenIn: "src/db/schema.sql",
    },
  ],
  placement: [
    {
      question: "You run the service and the console says “listening on 4000”. Which file made that happen?",
      options: ["src/server.ts", "src/routes/notes.ts", "src/db/pool.ts", "package.json"],
      answerIndex: 0,
      tests: "Where a program starts",
    },
    {
      question: "A request arrives at POST /notes. Where does the code that answers it live?",
      options: ["src/db/schema.sql", "src/routes/notes.ts", "src/server.ts", "tests/notes.test.ts"],
      answerIndex: 1,
      tests: "Request routing",
    },
    {
      question: "What is middleware doing in this service?",
      options: [
        "Storing notes in Postgres",
        "Validating the schema on startup",
        "Running before handlers, e.g. logging requests",
        "Generating the SQL migrations",
      ],
      answerIndex: 2,
      tests: "Request lifecycle",
    },
    {
      question: "Why does the code read DATABASE_URL from the environment instead of writing it in a file?",
      options: [
        "It is faster at runtime",
        "Secrets and per-machine settings should not be committed",
        "Postgres refuses literal connection strings",
        "TypeScript cannot hold long strings",
      ],
      answerIndex: 1,
      tests: "Configuration",
    },
    {
      question: "The test suite creates a note, lists notes, and expects the new one first. What is that test protecting?",
      options: [
        "The CSS of the list page",
        "The list endpoint’s ordering and the create endpoint working together",
        "The database connection pool size",
        "The README example",
      ],
      answerIndex: 1,
      tests: "Reading tests as specs",
    },
  ],
  projects: [
    {
      n: 1,
      tag: "Warm-up",
      title: "Serve one note by hand",
      goal: "Run the service locally and add GET /notes/:id, following the exact pattern the other routes use.",
      study: ["src/server.ts", "src/routes/notes.ts"],
      steps: [
        "Read the study files until you can describe a request’s path from URL to response.",
        "Copy the shape of an existing GET route and adapt it to take an id parameter.",
        "Return 404 when the id does not exist — copy how the repo signals “not found”.",
      ],
      checklist: [
        "Server starts with npm run dev",
        "GET /notes/:id returns one note",
        "Unknown id returns 404",
      ],
      minutes: 45,
    },
    {
      n: 2,
      tag: "Core work",
      title: "Give notes a real home",
      goal: "Move notes from the in-memory array into the real schema: add created_at, migrate, and make the list route order by it.",
      study: ["src/db/schema.sql", "src/db/pool.ts", "tests/notes.test.ts"],
      steps: [
        "Extend the schema with created_at as a timestamp defaulting to now().",
        "Rewrite create and list to use the pool instead of the array.",
        "Update the ordering test first, then make it pass.",
      ],
      checklist: [
        "Migration runs clean",
        "List is ordered newest first",
        "The test suite passes",
      ],
      minutes: 90,
    },
    {
      n: 3,
      tag: "Blind rebuild",
      title: "Rebuild the notes API from an empty folder",
      goal: "No copying. From an empty directory, rebuild the service end to end, peeking only at the reading path when stuck.",
      study: ["README.md"],
      steps: [
        "Empty folder, npm init, install express and pg.",
        "Server first: port from env, JSON middleware, routes mounted.",
        "Schema, then routes, then one test that proves create → list ordering.",
      ],
      checklist: [
        "Greenfield app boots",
        "Create, list, read endpoints work",
        "Your own test passes against your own app",
      ],
      minutes: 180,
    },
  ],
  rebuild: [
    {
      phase: "Phase 1 — Stand up the service",
      steps: [
        {
          action: "Create the project and install the two runtime dependencies.",
          command: "mkdir notes-api && cd notes-api && npm init -y && npm i express pg",
          check: "package.json exists with express and pg under dependencies.",
          source: "package.json",
        },
        {
          action: "Write the server: read the port from the environment, load JSON middleware, mount the notes router.",
          command: "touch src/server.ts",
          check: "npm run dev prints listening on 4000.",
          source: "src/server.ts",
        },
      ],
    },
    {
      phase: "Phase 2 — Model the data",
      steps: [
        {
          action: "Create the notes table: id, title, body, created_at.",
          command: "psql -f src/db/schema.sql",
          check: "\\d notes shows the four columns.",
          source: "src/db/schema.sql",
        },
        {
          action: "Add the pool so queries reuse connections.",
          command: "touch src/db/pool.ts",
          check: "One pool instance exported; no per-query connections.",
          source: "src/db/pool.ts",
        },
      ],
    },
    {
      phase: "Phase 3 — The endpoints",
      steps: [
        {
          action: "List and create notes on the router, querying through the pool.",
          command: "curl -s localhost:4000/notes",
          check: "Empty array on a fresh database.",
          source: "src/routes/notes.ts",
        },
        {
          action: "Add GET /notes/:id and the 404 path.",
          command: "curl -i localhost:4000/notes/9999",
          check: "HTTP/1.1 404 Not Found.",
          source: "src/routes/notes.ts",
        },
      ],
    },
    {
      phase: "Phase 4 — Prove it",
      steps: [
        {
          action: "Write the test that creates a note, lists notes, and expects the new one first.",
          command: "npm test",
          check: "Suite green on your rebuild, not the original.",
          source: "tests/notes.test.ts",
        },
      ],
    },
  ],
  tree: [
    { path: "harbor/notes-api", depth: 0, kind: "dir" },
    { path: "README.md", depth: 1, kind: "file" },
    { path: "package.json", depth: 1, kind: "file" },
    { path: ".env.example", depth: 1, kind: "file" },
    { path: "src", depth: 1, kind: "dir" },
    { path: "src/server.ts", depth: 2, kind: "file" },
    { path: "src/routes", depth: 2, kind: "dir" },
    { path: "src/routes/notes.ts", depth: 3, kind: "file" },
    { path: "src/db", depth: 2, kind: "dir" },
    { path: "src/db/schema.sql", depth: 3, kind: "file" },
    { path: "src/db/pool.ts", depth: 3, kind: "file" },
    { path: "tests", depth: 1, kind: "dir" },
    { path: "tests/notes.test.ts", depth: 2, kind: "file" },
  ],
};

export const EXAMPLE_REPOS = [
  "expressjs/express",
  "tiangolo/typer",
  "pallets/click",
  "sindresorhus/ky",
];
