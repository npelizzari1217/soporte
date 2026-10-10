import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useApiClaves } from "./use-api-claves";
import { useCrearApiClave, useRevocarApiClave } from "./use-api-claves-mutations";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CLAVE_EN_CLARO = "sop_abcd1234_secreto-que-no-se-cachea";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, Wrapper };
}

const FILA = {
  id: "k-1",
  nombre: "ERP",
  prefijo: "sop_abcd1234",
  permisos: ["TICKETS:LECTURA"],
  creadaAt: "2026-10-01T12:00:00.000Z",
  ultimoUsoAt: null,
  revocadaAt: null,
};

describe("hooks de claves de la API pública", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("useApiClaves lee GET /integraciones/claves y valida la forma", async () => {
    server.use(http.get("/api/integraciones/claves", () => HttpResponse.json([FILA])));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useApiClaves(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([FILA]);
  });

  it("useApiClaves falla con un permiso que el backend no acepta", async () => {
    server.use(http.get("/api/integraciones/claves", () => HttpResponse.json([{ ...FILA, permisos: ["TICKETS:BORRAR"] }])));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useApiClaves(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useCrearApiClave entrega la clave por callback, no la deja en el cache e invalida la lista", async () => {
    let body: unknown;
    let lecturas = 0;
    server.use(
      http.get("/api/integraciones/claves", () => {
        lecturas += 1;
        return HttpResponse.json([FILA]);
      }),
      http.post("/api/integraciones/claves", async ({ request }) => {
        body = await request.json();
        const { id, nombre, prefijo, permisos, creadaAt } = FILA;
        return HttpResponse.json({ id, nombre, prefijo, permisos, creadaAt, clave: CLAVE_EN_CLARO }, { status: 201 });
      }),
    );
    const onClaveCreada = vi.fn();
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => ({ lista: useApiClaves(), crear: useCrearApiClave(onClaveCreada) }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true));

    let devuelto: unknown;
    await act(async () => {
      devuelto = await result.current.crear.mutateAsync({ nombre: "ERP", permisos: ["TICKETS:LECTURA"] });
    });

    expect(body).toEqual({ nombre: "ERP", permisos: ["TICKETS:LECTURA"] });
    expect(onClaveCreada).toHaveBeenCalledWith(CLAVE_EN_CLARO);
    expect(devuelto).toMatchObject({ id: "k-1", prefijo: "sop_abcd1234" });
    expect(devuelto).not.toHaveProperty("clave");
    const cache = JSON.stringify([
      queryClient.getQueryCache().getAll().map((q) => q.state),
      queryClient.getMutationCache().getAll().map((m) => m.state),
    ]);
    expect(cache).not.toContain(CLAVE_EN_CLARO);
    await waitFor(() => expect(lecturas).toBe(2));
  });

  it("useCrearApiClave informa el 422 con el mensaje del backend y no llama al callback", async () => {
    server.use(
      http.post("/api/integraciones/claves", () =>
        HttpResponse.json({ statusCode: 422, message: "La API del cliente no está habilitada." }, { status: 422 }),
      ),
    );
    const onClaveCreada = vi.fn();
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCrearApiClave(onClaveCreada), { wrapper: Wrapper });

    await act(() =>
      result.current.mutateAsync({ nombre: "ERP", permisos: ["TICKETS:LECTURA"] }).catch(() => undefined),
    );

    expect(toast.error).toHaveBeenCalledWith("La API del cliente no está habilitada.");
    expect(onClaveCreada).not.toHaveBeenCalled();
  });

  it("useRevocarApiClave envía el DELETE con el id, notifica e invalida la lista", async () => {
    let revocada: string | readonly string[] | undefined;
    let lecturas = 0;
    server.use(
      http.get("/api/integraciones/claves", () => {
        lecturas += 1;
        return HttpResponse.json([FILA]);
      }),
      http.delete("/api/integraciones/claves/:id", ({ params }) => {
        revocada = params.id;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => ({ lista: useApiClaves(), revocar: useRevocarApiClave() }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true));

    await act(() => result.current.revocar.mutateAsync("k-1"));

    expect(revocada).toBe("k-1");
    expect(toast.success).toHaveBeenCalledWith("Clave revocada.");
    await waitFor(() => expect(lecturas).toBe(2));
  });
});
