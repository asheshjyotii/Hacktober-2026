import type { ReactNode } from "react";
import { blobUrl } from "./github";

export interface PathRef {
  token: string;
  path: string | null;
}

interface Ctx {
  refs: PathRef[];
  repo: string;
  branch: string;
}

/** `code`, **bold**. Backticked file names become GitHub links, or a warning if they are not real. */
function inline(text: string, ctx: Ctx, key: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, i) => {
    const k = `${key}-${i}`;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      const token = part.slice(1, -1).trim();
      const ref = ctx.refs.find((r) => r.token === token);
      if (ref?.path) {
        return (
          <a key={k} className="chat-path" href={blobUrl(ctx.repo, ctx.branch, ref.path)} target="_blank" rel="noreferrer">
            <code>{token}</code>
          </a>
        );
      }
      if (ref) {
        return (
          <code key={k} className="chat-path-bad" title="This path is not in the repository tree. The model may have guessed it.">
            {token}
            <span className="chat-path-flag"> not found</span>
          </code>
        );
      }
      return <code key={k}>{token}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={k}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

/** Small on purpose: fences, bullet and numbered lists, headings, paragraphs. No HTML is ever injected. */
export function renderMarkdown(src: string, ctx: Ctx): ReactNode[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(
        <pre key={`b${n++}`} className="chat-code">
          <code>{buf.join("\n")}</code>
        </pre>,
      );
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const kids = items.map((t, j) => <li key={j}>{inline(t, ctx, `l${n}-${j}`)}</li>);
      out.push(ordered ? <ol key={`b${n++}`}>{kids}</ol> : <ul key={`b${n++}`}>{kids}</ul>);
    } else if (/^#{1,4}\s+/.test(line)) {
      out.push(
        <p key={`b${n++}`} className="chat-h">
          {inline(line.replace(/^#{1,4}\s+/, ""), ctx, `h${n}`)}
        </p>,
      );
      i++;
    } else if (!line.trim()) {
      i++;
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(```|[-*]\s|\d+\.\s|#{1,4}\s)/.test(lines[i])) buf.push(lines[i++]);
      out.push(<p key={`b${n++}`}>{inline(buf.join(" "), ctx, `p${n}`)}</p>);
    }
  }
  return out;
}
