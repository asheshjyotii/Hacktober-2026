import { useState } from "react";
import type { Tour } from "../types";
import { EXAMPLE_REPOS, MOCK_TOUR } from "../data/mockTour";

type TreeNode = {
  path: string;
  kind: "dir" | "file";
  depth: number;
  children: TreeNode[];
};

function buildTree(flat: Tour["tree"]): TreeNode[] {
  const root: TreeNode[] = [];
  const stack: { depth: number; children: TreeNode[] }[] = [{ depth: -1, children: root }];
  for (const leaf of flat) {
    const node: TreeNode = { path: leaf.path, kind: leaf.kind, depth: leaf.depth, children: [] };
    while (stack.length && stack[stack.length - 1].depth >= leaf.depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push({ depth: leaf.depth, children: node.children });
  }
  return root;
}

const FIRST_PATH = MOCK_TOUR.readingPath.find((s) => !/^readme/i.test(s.path))?.path ?? "";

function Leaf({ node, index }: { node: TreeNode; index: number }) {
  const label = node.path.includes("/") ? node.path.slice(node.path.lastIndexOf("/") + 1) : node.path;
  const isFirst = node.path === FIRST_PATH;
  return (
    <li
      className={`tree-leaf ${node.kind === "dir" ? "dir" : ""} ${isFirst ? "leaf-first" : ""} unfurl`}
      style={{ animationDelay: `${120 + index * 55}ms` }}
    >
      <span className="leaf-path">{node.kind === "dir" ? `${label}/` : label}</span>
      {isFirst && <span className="leaf-tag">start here</span>}
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child, i) => (
            <Leaf key={child.path} node={child} index={index + i + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Home({ onStart }: { onStart: (repo: string) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(raw: string) {
    const cleaned = raw
      .trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .replace(/\.git$/, "")
      .replace(/\/+$/, "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned)) {
      setError("That doesn't look like a GitHub repository. Try owner/repo, or a github.com link.");
      return;
    }
    setError(null);
    onStart(cleaned);
  }

  return (
    <div className="hero">
      <div className="hero-grid">
        <div>
          <p className="hero-kicker">for people who just opened a repository and froze</p>
          <h1 className="hero-title">
            Take a repository apart. <em>Learn</em> it. Put it back together.
          </h1>
          <p className="hero-sub">
            Paste a GitHub link. DestructGitHub explains what the project is and how it fits together,
            checks what you already know, then gives you three projects that take you from where you
            are to being able to rebuild the whole thing.
          </p>
          <form
            className="url-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit(url);
            }}
          >
            <input
              className="url-input"
              type="text"
              placeholder="github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="GitHub repository"
              aria-invalid={error ? true : undefined}
            />
            <button className="btn btn-solid" type="submit">
              Deconstruct
            </button>
          </form>
          {error && <p className="error-line">{error}</p>}
          <div className="chips">
            <span className="chip-label">Try one:</span>
            {EXAMPLE_REPOS.map((r) => (
              <button key={r} type="button" className="chip" onClick={() => submit(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="tree-panel" aria-label="Example of a deconstructed repository">
          <div className="tree-panel-head">
            <b>{MOCK_TOUR.repo}</b>
            <span>{MOCK_TOUR.branch} @ {MOCK_TOUR.commit}</span>
          </div>
          <ul className="tree">
            {buildTree(MOCK_TOUR.tree).map((node, i) => (
              <Leaf key={node.path} node={node} index={i} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
