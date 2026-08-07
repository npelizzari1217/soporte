import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/types";
import { notifyError, notifySuccess } from "./toast";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("notifySuccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the given message via toast.success", () => {
    notifySuccess("Ticket creado correctamente.");
    expect(toast.success).toHaveBeenCalledWith("Ticket creado correctamente.");
  });
});

describe("notifyError", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ApiError with a single message → shows that exact message", () => {
    const err = new ApiError(422, "El título es obligatorio.");
    notifyError(err);
    expect(toast.error).toHaveBeenCalledWith("El título es obligatorio.");
  });

  it("ApiError with MULTIPLE messages → joins them all (does not drop any)", () => {
    const err = new ApiError(400, "Errores de validación", ["El título es obligatorio.", "La prioridad es inválida."]);
    notifyError(err);
    expect(toast.error).toHaveBeenCalledWith("El título es obligatorio. La prioridad es inválida.");
  });

  it("plain unexpected Error (not ApiError) → falls back to a generic message, never crashes", () => {
    notifyError(new Error("boom"));
    expect(toast.error).toHaveBeenCalledWith("Ocurrió un error inesperado. Intentá de nuevo.");
  });
});
