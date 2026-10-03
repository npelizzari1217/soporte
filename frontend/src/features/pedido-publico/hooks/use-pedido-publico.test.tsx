import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { ApiError } from "@/shared/api/types";
import {
  MENSAJE_FORMULARIO_NO_DISPONIBLE,
  mensajeDeErrorPedido,
  useContextoPedido,
  useEnviarPedido,
} from "./use-pedido-publico";

// Spec: sdd/formulario-publico-qr, pedido-publico: 404 uniforme y 429 por throttle.

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const VALORES = { nombre: "Ana", email: "ana@example.com", telefono: "", titulo: "No prende", descripcion: "Nada" };

describe("useContextoPedido", () => {
  it("manda el token del QR en `e` y devuelve el contexto", async () => {
    let visto: URL | null = null;
    server.use(
      http.get("/api/publico/c/mi-colegio/pedido/contexto", ({ request }) => {
        visto = new URL(request.url);
        return HttpResponse.json({ cliente: { nombre: "Colegio" }, equipo: { nombre: "PC 1" }, modo: "EXTERNO" });
      }),
    );

    const { result } = renderHook(() => useContextoPedido("mi-colegio", "tok/+1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.modo).toBe("EXTERNO");
    expect(visto!.searchParams.get("e")).toBe("tok/+1");
  });

  it("sin token no manda `e`", async () => {
    let visto: URL | null = null;
    server.use(
      http.get("/api/publico/c/mi-colegio/pedido/contexto", ({ request }) => {
        visto = new URL(request.url);
        return HttpResponse.json({ cliente: { nombre: "Colegio" }, equipo: null, modo: "SESION" });
      }),
    );

    const { result } = renderHook(() => useContextoPedido("mi-colegio", null), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(visto!.searchParams.has("e")).toBe(false);
  });

  it("404 queda como error con statusCode 404", async () => {
    server.use(
      http.get("/api/publico/c/x/pedido/contexto", () =>
        HttpResponse.json({ statusCode: 404, message: "no" }, { status: 404 }),
      ),
    );

    const { result } = renderHook(() => useContextoPedido("x", null), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.statusCode).toBe(404);
  });
});

describe("useEnviarPedido", () => {
  it("POST con el token del QR como equipoToken y sin telefono vacío", async () => {
    let cuerpo: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/publico/c/mi-colegio/pedido/solicitud", async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ mensaje: "ok" }, { status: 202 });
      }),
    );

    const { result } = renderHook(() => useEnviarPedido("mi-colegio", "tok1"), { wrapper });
    act(() => result.current.mutate(VALORES));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cuerpo).toMatchObject({ nombre: "Ana", titulo: "No prende", equipoToken: "tok1" });
    expect(cuerpo).not.toHaveProperty("telefono");
  });

  it("429 queda como error con statusCode 429", async () => {
    server.use(
      http.post("/api/publico/c/mi-colegio/pedido/solicitud", () =>
        HttpResponse.json({ statusCode: 429, message: "ThrottlerException" }, { status: 429 }),
      ),
    );

    const { result } = renderHook(() => useEnviarPedido("mi-colegio", null), { wrapper });
    act(() => result.current.mutate(VALORES));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.statusCode).toBe(429);
  });
});

describe("mensajeDeErrorPedido", () => {
  it("mapea 404 y 429 a mensajes distintos", () => {
    expect(mensajeDeErrorPedido(new ApiError(404, "x"))).toBe(MENSAJE_FORMULARIO_NO_DISPONIBLE);
    expect(mensajeDeErrorPedido(new ApiError(429, "x"))).toMatch(/demasiados pedidos/i);
  });

  it("red y 5xx son transitorios; 400 pide revisar los datos", () => {
    expect(mensajeDeErrorPedido(new ApiError(0, "x"))).toMatch(/conectar/i);
    expect(mensajeDeErrorPedido(new ApiError(503, "x"))).toMatch(/servidor/i);
    expect(mensajeDeErrorPedido(new ApiError(400, "x"))).toMatch(/revisá/i);
  });
});
