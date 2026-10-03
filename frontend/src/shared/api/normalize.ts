import { ApiError } from "./types";

/**
 * Normalizes a raw fetch `Response` into a typed value `T` or throws `ApiError`.
 *
 * Handles:
 * - 204 No Content → returns `undefined` without attempting a JSON parse
 * - 2xx with JSON body → returns the parsed DTO as T (BFF passes the backend body through as-is)
 * - 4xx/5xx with NestJS `{ statusCode, message }` body → throws `ApiError`
 *
 * Spec: PR11 — apiFetch response/error normalization.
 */
export async function normalize<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type");
  const isJson = contentType?.includes("application/json") ?? false;
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    // NestJS error shape: { statusCode: number, message: string | string[], error?: string }
    const rawMsg = (body as Record<string, unknown>)?.message;
    const msgs: string[] = Array.isArray(rawMsg)
      ? (rawMsg as string[])
      : [typeof rawMsg === "string" ? rawMsg : res.statusText];
    const rawCode = (body as Record<string, unknown>)?.code;
    throw new ApiError(res.status, msgs[0], msgs, body, typeof rawCode === "string" ? rawCode : undefined);
  }

  return body as T;
}
