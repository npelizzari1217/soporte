import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { mensajeDeErrorDeLogin, useLogin } from "./use-login";
import { writeLastActivity } from "@/shared/auth/idle-storage";

// Spec: [R23] BFF login route — flujo de 1 vs varias membresías.
// Spec: PR11 — use-login container hook.

// use-login navega con window.location.assign (recarga completa de página en el
// login, ver su JSDoc), NO con router.push — por eso mockeamos window.location.
const assignMock = vi.fn();
const originalLocation = window.location;

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
  beforeEach(async () => {
    // El mock de `toast.error` vive a nivel módulo: sin limpiarlo, las llamadas
    // se ACUMULAN entre tests y cualquier assert sobre `mock.calls[0]` lee el
    // toast de un test anterior. Costó un rojo falso al agregar los casos de
    // 500/red.
    const { toast } = await import("sonner");
    vi.mocked(toast.error).mockClear();
    assignMock.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "http://localhost:3000/login",
        origin: "http://localhost:3000",
        pathname: "/login",
        search: "",
        assign: assignMock,
        replace: vi.fn(),
      },
    });
    vi.mocked(writeLastActivity).mockClear();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
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

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
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
    expect(assignMock).not.toHaveBeenCalled();
  });

  const USER_OK = { sub: "1", cliente_id: "c1", rol: "USUARIO", permisos: [], is_global_admin: false, cliente_nombre: "Cliente Uno", membresias: [] };
  const SIGUIENTE_QR = "/pedido-qr?c=mi-colegio&e=tok-1";

  function conSiguiente(valor: string) {
    window.location.search = `?siguiente=${encodeURIComponent(valor)}`;
  }

  // Spec: sdd/formulario-publico-qr, D3 — el login vuelve al landing del QR.
  it("con ?siguiente=/pedido-qr?... navega ahi tras un login de una sola membresia", async () => {
    server.use(http.post("/api/auth/login", () => HttpResponse.json({ user: USER_OK })));
    conSiguiente(SIGUIENTE_QR);

    const { result } = renderHook(() => useLogin(), { wrapper });
    act(() => {
      result.current.login("user@example.com", "secret123");
    });

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGUIENTE_QR));
  });

  it.each(["//evil.com", "https://evil.com", "/tickets"])(
    "con ?siguiente=%s (fuera de la allowlist) navega a /",
    async (valor) => {
      server.use(http.post("/api/auth/login", () => HttpResponse.json({ user: USER_OK })));
      conSiguiente(valor);

      const { result } = renderHook(() => useLogin(), { wrapper });
      act(() => {
        result.current.login("user@example.com", "secret123");
      });

      await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
      expect(assignMock).toHaveBeenCalledTimes(1);
    },
  );

  it("el selector multi-cliente tambien respeta ?siguiente= al elegir el cliente", async () => {
    server.use(
      http.post("/api/auth/login", async ({ request }) => {
        const body = (await request.json()) as { clienteId?: string };
        if (body.clienteId) return HttpResponse.json({ user: USER_OK });
        return HttpResponse.json({
          needsClienteSelection: true,
          membresias: [{ cliente_id: "c1", nombre: "Cliente Uno", rol: "USUARIO" }],
        });
      }),
    );
    conSiguiente(SIGUIENTE_QR);

    const { result } = renderHook(() => useLogin(), { wrapper });
    act(() => {
      result.current.login("multi@example.com", "secret123");
    });
    await waitFor(() => expect(result.current.membresias).not.toBeNull());
    expect(assignMock).not.toHaveBeenCalled();

    act(() => {
      result.current.selectCliente("c1");
    });

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGUIENTE_QR));
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

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
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

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/credenciales/i)),
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  /**
   * Anti-enumeración de usuarios: un email que NO existe y una contraseña
   * equivocada tienen que producir el MISMO texto, carácter por carácter. Si
   * difieren, el formulario se vuelve un oráculo para averiguar qué cuentas
   * existen. El assert compara los dos mensajes ENTRE SÍ, no contra un literal
   * — así sigue protegiendo la propiedad aunque se reescriba la redacción.
   */
  it("401 y 404 devuelven el MISMO mensaje: el login no revela si la cuenta existe", async () => {
    const { toast } = await import("sonner");
    const mensajes: string[] = [];

    for (const status of [401, 404]) {
      vi.mocked(toast.error).mockClear();
      server.use(
        http.post("/api/auth/login", () =>
          HttpResponse.json({ statusCode: status, message: `detalle ${status}` }, { status }),
        ),
      );

      const { result } = renderHook(() => useLogin(), { wrapper });
      act(() => {
        result.current.login("quien@example.com", "loquesea");
      });

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      mensajes.push(vi.mocked(toast.error).mock.calls[0][0] as string);
    }

    expect(mensajes[0]).toBe(mensajes[1]);
  });

  /**
   * Regresión: un 500 se reportaba como "Credenciales incorrectas". El usuario
   * quedaba re-tipeando una contraseña correcta mientras el problema era el
   * backend caído — pasó de verdad durante la verificación en el navegador.
   * Ocultar un error de servidor detrás de un mensaje de credenciales no suma
   * nada a la anti-enumeración: "el servidor explotó" no dice si la cuenta
   * existe.
   */
  it("500 del backend → NO dice credenciales incorrectas; avisa que el problema es del servidor", async () => {
    const { toast } = await import("sonner");
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ statusCode: 500, message: "Internal Server Error" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => {
      result.current.login("user@example.com", "secret123");
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const mensaje = vi.mocked(toast.error).mock.calls[0][0] as string;
    // La propiedad es "no se reporta IGUAL que credenciales inválidas", no
    // "no contiene la palabra credenciales" — el mensaje bueno justamente
    // aclara que NO son las credenciales.
    expect(mensaje).not.toBe(mensajeDeErrorDeLogin(401));
    expect(mensaje).toMatch(/servidor/i);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("caída de red (ApiError statusCode 0) → tampoco culpa a las credenciales", async () => {
    const { toast } = await import("sonner");
    server.use(http.post("/api/auth/login", () => HttpResponse.error()));

    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => {
      result.current.login("user@example.com", "secret123");
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const mensaje = vi.mocked(toast.error).mock.calls[0][0] as string;
    expect(mensaje).not.toBe(mensajeDeErrorDeLogin(401));
    expect(mensaje).toMatch(/conex|conectar/i);
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
