import React from "react";

/** Split highlight HTML on <mark> tags and render text nodes only. */
export function HighlightedText({ html }: { html: string }) {
  const parts = html.split(/(<\/?mark>)/i);
  const nodes: React.ReactNode[] = [];
  let marking = false;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^<mark>$/i.test(part)) {
      marking = true;
      continue;
    }
    if (/^<\/mark>$/i.test(part)) {
      marking = false;
      continue;
    }
    if (!part) continue;
    nodes.push(
      marking ? (
        <mark key={i} className="rounded-sm bg-amber-200/80 px-0.5 text-ink-950">
          {part}
        </mark>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    );
  }
  return <>{nodes}</>;
}
