import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { useLogin } from "./use-login";
import { writeLastActivity } from "@/shared/auth/idle-storage";

// Spec: [R23] BFF login route — flujo de 1 vs varias membresías.
// Spec: PR11 — use-login container hook.

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/shared/auth/idle-storage", () => ({
  writeLastActivity: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useLogin", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.mocked(writeLastActivity).mockClear();
  });

  it("single-membership login (200 with { user }) → redirects to / directly, no membresías state", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ user: { sub: "1", cliente_id: "c1", rol: "USUARIO", permisos: [], is_global_admin: false, cliente_nombre: "Cliente Uno", membresias: [] } }),
      ),
    );

    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => {
      result.current.login("user@example.com", "secret123");
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(result.current.membresias).toBeNull();
    // Regresión (bug idle-timeout): un login exitoso DEBE resetear el reloj de
    // inactividad a "ahora", si no un timestamp añejo en localStorage dispara el
    // auto-logout inmediato y rebota a /login.
    expect(writeLastActivity).toHaveBeenCalledWith(expect.any(Number));
  });

  it("needsClienteSelection NO resetea el idle clock todavía (aún no hay sesión)", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({
          needsClienteSelection: true,
          membresias: [{ cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" }],
        }),
      ),
    );

    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => {
      result.current.login("multi@example.com", "secret123");
    });

    await waitFor(() => expect(result.current.membresias).not.toBeNull());
    expect(writeLastActivity).not.toHaveBeenCalled();
  });

  it("multi-membership login (needsClienteSelection) → exposes membresias[], does NOT redirect yet", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({
          needsClienteSelection: true,
          membresias: [
            { cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" },
            { cliente_id: "c2", nombre: "Cliente Dos", rol: "TECNICO" },
          ],
        }),
      ),
    );

    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => {
      result.current.login("multi@example.com", "secret123");
    });

    await waitFor(() => expect(result.current.membresias).not.toBeNull());
    expect(result.current.membresias).toHaveLength(2);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("selectCliente after multi-membership → re-posts with { email, password, clienteId } and redirects on success", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("/api/auth/login", async ({ request }) => {
        const body = (await request.json()) as { clienteId?: string };
        if (body.clienteId) {
          capturedBody = body;
          return HttpResponse.json({ user: { sub: "1", cliente_id: "c2", rol: "TECNICO", permisos: [], is_global_admin: false, cliente_nombre: "Cliente Dos", membresias: [] } });
        }
        return HttpResponse.json({
          needsClienteSelection: true,
          membresias: [{ cliente_id: "c2", nombre: "Cliente Dos", rol: "TECNICO" }],
        });
      }),
    );

    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => {
      result.current.login("multi@example.com", "secret123");
    });
    await waitFor(() => expect(result.current.membresias).not.toBeNull());

    act(() => {
      result.current.selectCliente("c2");
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(capturedBody).toEqual({
      email: "multi@example.com",
      password: "secret123",
      clienteId: "c2",
    });
  });

  it("401 credenciales inválidas → shows a generic toast error, does not redirect", async () => {
    const { toast } = await import("sonner");
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ statusCode: 401, message: "Credenciales inválidas" }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => {
      result.current.login("wrong@example.com", "bad");
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("403 tenant suspendido → shows the specific suspended-tenant toast message", async () => {
    const { toast } = await import("sonner");
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ statusCode: 403, message: "Cliente suspendido" }, { status: 403 }),
      ),
    );

    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => {
      result.current.login("suspended@example.com", "secret123");
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/suspendid/i)),
    );
  });
});
