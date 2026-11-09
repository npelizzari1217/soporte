import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/types";
import { QueryProvider } from "./query-provider";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const saturado = (): ApiError =>
  new ApiError(503, "Saturado", ["Saturado"], undefined, "SERVICIO_SATURADO");

function Lista({ consulta }: { consulta: () => Promise<string> }) {
  const query = useQuery({ queryKey: ["lista"], queryFn: consulta, retry: false });
  return <p>{query.data ?? (query.isError ? "con error" : "cargando")}</p>;
}

/** Aviso global de saturación en cualquier pantalla (odd/saturacion-conexiones, S2). */
describe("QueryProvider — saturación del servidor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("una consulta que falla por saturación muestra el aviso, y «Reintentar» la vuelve a pedir", async () => {
    const consulta = vi.fn().mockRejectedValueOnce(saturado()).mockResolvedValue("datos");
    render(
      <QueryProvider>
        <Lista consulta={consulta} />
      </QueryProvider>,
    );

    await screen.findByText("con error");
    expect(toast.error).toHaveBeenCalledWith(
      "El sistema está saturado en este momento",
      expect.objectContaining({ id: "servicio-saturado" }),
    );

    const accion: unknown = vi.mocked(toast.error).mock.calls[0][1]?.action;
    if (typeof accion !== "object" || accion === null || !("onClick" in accion) || typeof accion.onClick !== "function") {
      throw new Error("el aviso no trae la acción «Reintentar»");
    }
    accion.onClick();

    expect(await screen.findByText("datos")).toBeInTheDocument();
    await waitFor(() => expect(consulta).toHaveBeenCalledTimes(2));
  });

  it("otro error de una consulta no muestra el aviso de saturación", async () => {
    const consulta = vi.fn().mockRejectedValue(new ApiError(500, "Error"));
    render(
      <QueryProvider>
        <Lista consulta={consulta} />
      </QueryProvider>,
    );

    await screen.findByText("con error");
    expect(toast.error).not.toHaveBeenCalled();
  });
});
