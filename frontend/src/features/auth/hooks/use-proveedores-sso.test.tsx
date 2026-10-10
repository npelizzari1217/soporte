import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { useProveedoresSso } from "./use-proveedores-sso";

// Spec: sdd/login-sso — SC3, SC4.

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useProveedoresSso", () => {
  it("devuelve los proveedores habilitados que informa el backend", async () => {
    server.use(
      http.get("/api/auth/sso/proveedores", () => HttpResponse.json({ proveedores: ["google", "microsoft"] })),
    );

    const { result } = renderHook(() => useProveedoresSso(), { wrapper });

    await waitFor(() => expect(result.current.proveedores).toEqual(["google", "microsoft"]));
  });

  it("lista vacía → sin proveedores", async () => {
    let consultas = 0;
    server.use(
      http.get("/api/auth/sso/proveedores", () => {
        consultas += 1;
        return HttpResponse.json({ proveedores: [] });
      }),
    );

    const { result } = renderHook(() => useProveedoresSso(), { wrapper });

    await waitFor(() => expect(consultas).toBe(1));
    expect(result.current.proveedores).toEqual([]);
  });

  it("forma inválida → lista vacía (no hay botones)", async () => {
    let consultas = 0;
    server.use(
      http.get("/api/auth/sso/proveedores", () => {
        consultas += 1;
        return HttpResponse.json({ proveedores: ["github"] });
      }),
    );

    const { result } = renderHook(() => useProveedoresSso(), { wrapper });

    await waitFor(() => expect(consultas).toBe(1));
    expect(result.current.proveedores).toEqual([]);
  });

  it("falla del backend → lista vacía", async () => {
    let consultas = 0;
    server.use(
      http.get("/api/auth/sso/proveedores", () => {
        consultas += 1;
        return HttpResponse.json({ message: "boom" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useProveedoresSso(), { wrapper });

    await waitFor(() => expect(consultas).toBe(1));
    expect(result.current.proveedores).toEqual([]);
  });
});
