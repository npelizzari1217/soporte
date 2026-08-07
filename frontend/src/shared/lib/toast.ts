import { toast } from "sonner";
import { ApiError } from "@/shared/api/types";

/**
 * Toast helpers (ADR-8: Error → toast sonner con `messages`).
 *
 * `notifyError` normalizes any thrown value into a user-facing message:
 * - `ApiError` → joins ALL entries of `.messages` (NestJS can return several
 *   validation errors at once; showing only the first would hide the rest).
 * - Anything else (unexpected `Error`, non-Error throw) → generic fallback,
 *   never leaks internal error text to the user.
 */
export function notifySuccess(message: string): void {
  toast.success(message);
}

export function notifyError(err: unknown): void {
  if (err instanceof ApiError) {
    toast.error(err.messages.join(" "));
    return;
  }
  toast.error("Ocurrió un error inesperado. Intentá de nuevo.");
}
