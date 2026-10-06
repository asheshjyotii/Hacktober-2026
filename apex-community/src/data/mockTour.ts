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
