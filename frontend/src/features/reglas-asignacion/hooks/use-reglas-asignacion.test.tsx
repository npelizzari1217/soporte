import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useReglasAsignacion } from "./use-reglas-asignacion";
import { useConfigurarReglaAsignacion } from "./use-configurar-regla-asignacion";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const FILA = {
  tipoId: "t-1",
  codigo: "INC",
  nombre: "Incidente",
  modulo: "SOPORTE",
  responsableId: null,
  responsableNombre: null,
  estado: "SIN_REGLA",
};

describe("hooks de reglas de asignación", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("useReglasAsignacion lee GET /reglas-asignacion y valida la forma", async () => {
    server.use(
      http.get("/api/reglas-asignacion", () => HttpResponse.json({ reglas: [FILA], candidatosPorModulo: {} })),
    );
    const { result } = renderHook(() => useReglasAsignacion(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.reglas).toHaveLength(1);
  });

  it("useReglasAsignacion falla si el backend manda una forma inesperada", async () => {
    server.use(http.get("/api/reglas-asignacion", () => HttpResponse.json({ reglas: [{ tipoId: 1 }] })));
    const { result } = renderHook(() => useReglasAsignacion(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useConfigurarReglaAsignacion envía el PUT, notifica el éxito e invalida la lista", async () => {
    let body: unknown;
    let lecturas = 0;
    server.use(
      http.get("/api/reglas-asignacion", () => {
        lecturas += 1;
        return HttpResponse.json({ reglas: [FILA], candidatosPorModulo: {} });
      }),
      http.put("/api/reglas-asignacion/t-1", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...FILA, responsableId: "u-1", estado: "VALIDA" });
      }),
    );
    const { result } = renderHook(() => ({ lista: useReglasAsignacion(), cfg: useConfigurarReglaAsignacion() }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true));

    await act(() => result.current.cfg.mutateAsync({ tipoId: "t-1", responsableId: "u-1" }));

    expect(body).toEqual({ responsableId: "u-1" });
    expect(toast.success).toHaveBeenCalledWith("Regla de asignación actualizada.");
    await waitFor(() => expect(lecturas).toBe(2));
  });

  it("useConfigurarReglaAsignacion informa el 422 con toast y no invalida la lista", async () => {
    let lecturas = 0;
    server.use(
      http.get("/api/reglas-asignacion", () => {
        lecturas += 1;
        return HttpResponse.json({ reglas: [FILA], candidatosPorModulo: {} });
      }),
      http.put("/api/reglas-asignacion/t-1", () =>
        HttpResponse.json({ statusCode: 422, message: "El responsable no es elegible." }, { status: 422 }),
      ),
    );
    const { result } = renderHook(() => ({ lista: useReglasAsignacion(), cfg: useConfigurarReglaAsignacion() }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true));

    await act(() => result.current.cfg.mutateAsync({ tipoId: "t-1", responsableId: "u-1" }).catch(() => undefined));

    expect(toast.error).toHaveBeenCalledWith("El responsable no es elegible.");
    expect(toast.success).not.toHaveBeenCalled();
    expect(lecturas).toBe(1);
  });
});
