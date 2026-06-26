import { ApiError } from "./types";

/**
 * Normalizes a raw fetch Response into a typed value `T` or throws `ApiError`.
 *
 * Handles:
 * - 204 No Content → returns `undefined` without attempting JSON parse
 * - 2xx with JSON body → returns parsed DTO as T (backend INTACTO, no {success,data} wrapper)
 * - 4xx/5xx with NestJS `{ statusCode, message }` body → throws ApiError
 * - TypeError during body parsing → throws ApiError(0, "Error de red")
 *
 * Spec: [SPEC:frontend-api-client/normalizacion-respuestas]
 * Spec: [SPEC:frontend-api-client/normalizacion-errores]
 */
export async function normalize<T>(res: Response): Promise<T> {
  try {
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
      throw new ApiError(res.status, msgs[0], msgs, body);
    }

    return body as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof TypeError) {
      throw new ApiError(0, "Error de red", ["Error de red"]);
    }
    throw err;
  }
}
