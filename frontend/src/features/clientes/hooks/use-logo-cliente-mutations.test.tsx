import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { useSubirLogoCliente, useQuitarLogoCliente } from "./use-clientes-mutations";

/**
 * useSubirLogoCliente / useQuitarLogoCliente — sdd/logo-por-cliente WU4.
 *
 * La validación cliente-side (espejo de `validarLogoCliente` del backend,
 * design.md D7) vive DENTRO de la mutación como defensa en profundidad: en
 * el flujo normal el diálogo ya deshabilita "Subir" con un archivo inválido
 * (configurar-logo-dialog.test.tsx), pero si algo invoca la mutación
 * directamente, un SVG o un archivo de más de 512 KB nunca debe armar el
 * `FormData` ni golpear la red.
 */
function buildFile({
  name = "logo.png",
  type = "image/png",
  size = 1024,
}: Partial<{ name: string; type: string; size: number }> = {}) {
  const file = new File(["contenido"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const CLIENTE_ID = "c1";

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useSubirLogoCliente", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  });

  it("rechaza un SVG SIN pegarle a la red", async () => {
    let called = false;
    server.use(
      http.post(`/api/clientes/${CLIENTE_ID}/logo`, () => {
        called = true;
        return HttpResponse.json({ logoUpdatedAt: null });
      }),
    );
    const { result } = renderHook(() => useSubirLogoCliente(CLIENTE_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate(buildFile({ name: "logo.svg", type: "image/svg+xml" }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(called).toBe(false);
    expect(result.current.error?.message).toMatch(/no permitido/i);
  });

  it("rechaza un archivo de más de 512 KB SIN pegarle a la red", async () => {
    let called = false;
    server.use(
      http.post(`/api/clientes/${CLIENTE_ID}/logo`, () => {
        called = true;
        return HttpResponse.json({ logoUpdatedAt: null });
      }),
    );
    const { result } = renderHook(() => useSubirLogoCliente(CLIENTE_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate(buildFile({ size: 512 * 1024 + 1 }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(called).toBe(false);
    expect(result.current.error?.message).toMatch(/512 KB/i);
  });

  it("un PNG válido arma FormData con el campo 'logo' y hace POST", async () => {
    // `request.formData()` de undici no acepta el `File` de jsdom (falla el
    // `webidl.is.File` interno) — se inspecciona el body multipart crudo en
    // vez de parsearlo. El nombre de archivo tampoco sobrevive el viaje
    // jsdom `File` → undici `FormData` en este entorno de test (queda
    // "blob"); lo determinante para este hook es el campo y el tipo del body.
    let capturedContentType: string | null = null;
    let capturedRawBody = "";
    server.use(
      http.post(`/api/clientes/${CLIENTE_ID}/logo`, async ({ request }) => {
        capturedContentType = request.headers.get("content-type");
        capturedRawBody = await request.text();
        return HttpResponse.json({ logoUpdatedAt: "2026-09-21T00:00:00.000Z" });
      }),
    );
    const { result } = renderHook(() => useSubirLogoCliente(CLIENTE_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate(buildFile());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedContentType).toMatch(/^multipart\/form-data/);
    expect(capturedRawBody).toContain('name="logo"');
    expect(capturedRawBody).toContain("Content-Type: image/png");
  });
});

describe("useQuitarLogoCliente", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  });

  it("hace DELETE e invalida ['clientes'] (idempotente en el backend, spec regla 11)", async () => {
    server.use(http.delete(`/api/clientes/${CLIENTE_ID}/logo`, () => new HttpResponse(null, { status: 204 })));
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useQuitarLogoCliente(CLIENTE_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((call: unknown[]) => (call[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["clientes"]);
  });
});
