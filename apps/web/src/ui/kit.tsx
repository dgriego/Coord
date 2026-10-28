import { createContext, useCallback, useContext, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { ApiError } from "../api.ts";

export function Field({
  label,
  error,
  ...input
}: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = input.id ?? input.name;
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input className="input" id={id} aria-invalid={error ? true : undefined} {...input} />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

/** Splits an API error into per-field messages and a form-level message. */
export function formErrors(err: unknown): { fields: Record<string, string>; message: string | null } {
  if (!err) return { fields: {}, message: null };
  if (err instanceof ApiError) {
    const hasFields = Object.keys(err.fields).length > 0;
    return { fields: err.fields, message: hasFields && err.code === "invalid_input" ? null : err.message };
  }
  return { fields: {}, message: "Something went wrong. Try again." };
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const AVATAR_PAINTS = ["marigold", "persimmon", "rosewater", "orchid", "cobalt", "lagoon", "fern", "citrine"] as const;

/** The same person always gets the same paint color. */
export function paintFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PAINTS[h % AVATAR_PAINTS.length]!;
}

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span className={`avatar paint-${paintFor(name)}${small ? " avatar-sm" : ""}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function BrandMark() {
  return (
    <span className="chips-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function EmptyState({ milestone, title, children }: { milestone?: string; title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="fan" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      {milestone && <span className="milestone">{milestone}</span>}
      <h2>{title}</h2>
      <div className="muted">{children}</div>
    </div>
  );
}

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const show = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => date.format(new Date(iso));
