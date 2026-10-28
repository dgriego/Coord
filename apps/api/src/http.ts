import type { Context } from "hono";
import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 415 | 429,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = "That item") => new HttpError(404, "not_found", `${what} wasn't found.`);
export const forbidden = (message = "Your role doesn't allow this. Ask a studio owner or admin.") =>
  new HttpError(403, "forbidden", message);

/**
 * For PATCH: parses like `body` but keeps only the keys the client sent.
 * Zod 4 applies `.default()` even inside `.partial()`, which would otherwise
 * reset every field the request didn't mention.
 */
export async function patchBody<S extends z.ZodType>(c: Context, schema: S): Promise<Partial<z.infer<S>>> {
  const raw = await readJson(c);
  const parsed = (await body(c, schema, raw)) as Record<string, unknown>;
  const sent = raw && typeof raw === "object" ? new Set(Object.keys(raw)) : new Set<string>();
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => sent.has(k))) as Partial<z.infer<S>>;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "The request body must be JSON.");
  }
}

/** Parses a JSON body against a schema, turning issues into field messages. */
export async function body<S extends z.ZodType>(c: Context, schema: S, preread?: unknown): Promise<z.infer<S>> {
  const raw = preread === undefined ? await readJson(c) : preread;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new HttpError(400, "invalid_input", "Some fields need attention.", fields);
  }
  return parsed.data;
}
