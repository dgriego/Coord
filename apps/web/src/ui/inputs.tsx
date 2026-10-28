import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons.tsx";

/** Side panel for create and edit forms. Escape or the backdrop closes it. */
export function Drawer({ open, title, onClose, children, footer, wide }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className={`drawer${wide ? " drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-sm" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

const toDollars = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(/\.00$/, "");

/** Dollar text box that stores cents. Commits on blur so typing isn't interrupted. */
export function MoneyInput({ id, value, onChange, placeholder, disabled, allowEmpty }: {
  id: string;
  value: number | null;
  onChange: (cents: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(toDollars(value));
  useEffect(() => setText(toDollars(value)), [value]);
  const commit = () => {
    const clean = text.replace(/[$,\s]/g, "");
    if (clean === "") return onChange(allowEmpty ? null : 0);
    const n = Number(clean);
    if (Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100));
    else setText(toDollars(value));
  };
  return (
    <span className="affix">
      <span className="affix-label">$</span>
      <input
        id={id}
        className="input num"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </span>
  );
}

/** Percent text box that stores basis points (35% → 3500). */
export function PercentInput({ id, value, onChange, disabled, max = 1000 }: {
  id: string;
  value: number;
  onChange: (bps: number) => void;
  disabled?: boolean;
  max?: number;
}) {
  const fmt = (bps: number) => String(Math.round(bps) / 100);
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const commit = () => {
    const n = Number(text.replace("%", ""));
    if (Number.isFinite(n) && n >= 0 && n <= max) onChange(Math.round(n * 100));
    else setText(fmt(value));
  };
  return (
    <span className="affix">
      <input
        id={id}
        className="input num"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <span className="affix-label">%</span>
    </span>
  );
}

/** Label around any control, matching Field's layout. */
export function Labeled({ label, htmlFor, children, hint, error }: { label: string; htmlFor: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="muted small">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

/** Inline confirm: the first click arms it, the second does the action. */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled }: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button type="button" className="btn btn-danger" disabled={disabled} onClick={onConfirm}>{confirmLabel}</button>
  ) : (
    <button type="button" className="btn btn-ghost btn-danger" disabled={disabled} onClick={() => setArmed(true)}>{label}</button>
  );
}
