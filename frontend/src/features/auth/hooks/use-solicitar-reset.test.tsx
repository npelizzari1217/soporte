import { describe, expect, it } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { MENSAJE_SOLICITUD_RESET, mensajeDeSolicitudReset, useSolicitarReset } from "./use-solicitar-reset";
import { ApiError } from "@/shared/api/types";

// Spec: sdd/reseteo-contrasena-olvidada — Requirement "La solicitud de reset
// devuelve una respuesta uniforme". El mensaje NUNCA distingue causa, salvo
// 429/red/5xx (infraestructura, no resultado de la solicitud).

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useSolicitarReset", () => {
  it("204 (email exista o no) → expone el mensaje genérico", async () => {
    server.use(http.post("/api/auth/forgot-password", () => new HttpResponse(null, { status: 204 })));

    const { result } = renderHook(() => useSolicitarReset(), { wrapper });
    expect(result.current.mensaje).toBeNull();

    act(() => result.current.solicitar("existe@example.com"));

    await waitFor(() => expect(result.current.mensaje).toBe(MENSAJE_SOLICITUD_RESET));
  });

  it.each([
    [429, { statusCode: 429, message: "ThrottlerException" }, /demasiados/i],
    [500, { statusCode: 500, message: "Internal Server Error" }, /servidor/i],
  ])("%i → mensaje de infraestructura, distinto del genérico", async (status, body, patron) => {
    server.use(http.post("/api/auth/forgot-password", () => HttpResponse.json(body, { status })));

    const { result } = renderHook(() => useSolicitarReset(), { wrapper });
    act(() => result.current.solicitar("existe@example.com"));

    await waitFor(() => expect(result.current.mensaje).not.toBeNull());
    expect(result.current.mensaje).not.toBe(MENSAJE_SOLICITUD_RESET);
    expect(result.current.mensaje).toMatch(patron);
  });

  it("caída de red (ApiError statusCode 0) → mensaje de infraestructura", async () => {
    server.use(http.post("/api/auth/forgot-password", () => HttpResponse.error()));

    const { result } = renderHook(() => useSolicitarReset(), { wrapper });
    act(() => result.current.solicitar("existe@example.com"));

    await waitFor(() => expect(result.current.mensaje).not.toBeNull());
    expect(result.current.mensaje).not.toBe(MENSAJE_SOLICITUD_RESET);
    expect(result.current.mensaje).toMatch(/conectar/i);
  });

  /**
   * Regresión de anti-enumeración: aunque llegara un 400 (no debería, el
   * schema local ya valida el email), el mensaje sigue siendo el genérico.
   */
  it("mensajeDeSolicitudReset: 400 y sin error dan el mismo mensaje genérico", () => {
    expect(mensajeDeSolicitudReset(new ApiError(400, "email must be an email"))).toBe(MENSAJE_SOLICITUD_RESET);
    expect(mensajeDeSolicitudReset(null)).toBe(MENSAJE_SOLICITUD_RESET);
  });
});
