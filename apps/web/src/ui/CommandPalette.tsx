import { useEffect, useMemo, useRef, useState } from "react";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** Ctrl/Cmd+K launcher. Every page action should be reachable from here. */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((c) => words.every((w) => c.label.toLowerCase().includes(w)));
  }, [commands, query]);

  if (!open) return null;

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          else if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(matches[index]);
          }
        }}
      >
        <input
          ref={inputRef}
          id="command-search"
          placeholder="Search for a page or action"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={matches[index] ? `cmd-${matches[index].id}` : undefined}
        />
        <ul id="command-list" role="listbox">
          {matches.length === 0 && <li className="muted">No matches</li>}
          {matches.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(c)}
            >
              {c.label}
              {c.hint && <span className="hint">{c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
