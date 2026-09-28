import { describe, expect, it } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { errorDeRestablecerPassword, useRestablecerPassword } from "./use-restablecer-password";
import { ApiError } from "@/shared/api/types";

// Spec: sdd/reseteo-contrasena-olvidada — Requirement "Confirmar con un
// token inválido responde igual sin importar la causa" (400 único), Req 13
// (rate limiting propio).

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useRestablecerPassword", () => {
  it("204 → isSuccess true, sin error", async () => {
    server.use(http.post("/api/auth/reset-password", () => new HttpResponse(null, { status: 204 })));

    const { result } = renderHook(() => useRestablecerPassword(), { wrapper });
    act(() => result.current.restablecer("token-valido", "nuevaClave123"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it("400 (vencido/usado/revocado/inexistente) → link inválido, con link de solicitud", async () => {
    server.use(
      http.post("/api/auth/reset-password", () =>
        HttpResponse.json({ statusCode: 400, message: "El link no es válido o venció." }, { status: 400 }),
      ),
    );

    const { result } = renderHook(() => useRestablecerPassword(), { wrapper });
    act(() => result.current.restablecer("token-invalido", "nuevaClave123"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.mensaje).toMatch(/no es válido o venció/i);
    expect(result.current.error?.mostrarLinkSolicitud).toBe(true);
  });

  it.each([
    [429, { statusCode: 429, message: "ThrottlerException" }, /demasiados/i],
    [500, { statusCode: 500, message: "Internal Server Error" }, /servidor/i],
  ])("%i → mensaje de infraestructura, sin link de solicitud", async (status, body, patron) => {
    server.use(http.post("/api/auth/reset-password", () => HttpResponse.json(body, { status })));

    const { result } = renderHook(() => useRestablecerPassword(), { wrapper });
    act(() => result.current.restablecer("token-valido", "nuevaClave123"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.mensaje).toMatch(patron);
    expect(result.current.error?.mostrarLinkSolicitud).toBe(false);
  });

  it("caída de red (ApiError statusCode 0) → mensaje de infraestructura", async () => {
    server.use(http.post("/api/auth/reset-password", () => HttpResponse.error()));

    const { result } = renderHook(() => useRestablecerPassword(), { wrapper });
    act(() => result.current.restablecer("token-valido", "nuevaClave123"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.mensaje).toMatch(/conectar/i);
    expect(result.current.error?.mostrarLinkSolicitud).toBe(false);
  });

  it("errorDeRestablecerPassword: 400 siempre da el mismo mensaje sin importar la causa real", () => {
    const mensajes = ["vencido", "usado", "revocado", "inexistente"].map(
      (detalle) => errorDeRestablecerPassword(new ApiError(400, detalle)).mensaje,
    );
    expect(new Set(mensajes).size).toBe(1);
  });
});
