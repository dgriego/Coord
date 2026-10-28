import type { ApiError as ApiErrorBody } from "@coord/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, json?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: json === undefined ? {} : { "content-type": "application/json" },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new ApiError(0, "offline", "Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? "Something went wrong.", err?.fields);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, json: unknown = {}) => request<T>("POST", path, json),
  patch: <T>(path: string, json: unknown) => request<T>("PATCH", path, json),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
