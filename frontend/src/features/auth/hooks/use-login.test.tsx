import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { MENSAJE_VENCIDO, mensajeDeErrorDeLogin, useLogin } from "./use-login";
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

  const SELECCION = {
    needsClienteSelection: true,
    ticket: "tk-1",
    membresias: [
      { cliente_id: "c1", nombre: "Cliente Uno", rol: "USUARIO" },
      { cliente_id: "c2", nombre: "Cliente Dos", rol: "TECNICO" },
    ],
  };

  it("el selector multi-cliente tambien respeta ?siguiente= al elegir el cliente", async () => {
    server.use(
      http.post("/api/auth/login", () => HttpResponse.json(SELECCION)),
      http.post("/api/auth/login/seleccionar", () => HttpResponse.json({ user: USER_OK })),
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

  it("selectCliente usa el ticket: manda { ticket, clienteId } sin contraseña ni código", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("/api/auth/login", () => HttpResponse.json(SELECCION)),
      http.post("/api/auth/login/seleccionar", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ user: USER_OK });
      }),
    );

    const { result } = renderHook(() => useLogin(), { wrapper });
    act(() => {
      result.current.login("multi@example.com", "secret123");
    });
    await waitFor(() => expect(result.current.paso).toBe("seleccion"));

    act(() => {
      result.current.selectCliente("c2");
    });

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(capturedBody).toEqual({ ticket: "tk-1", clienteId: "c2" });
  });

  const DESAFIO = { needs2fa: true, desafio: "ds-1", recordarDisponible: true };

  async function llegarAlCodigo(respuesta: object = DESAFIO) {
    server.use(http.post("/api/auth/login", () => HttpResponse.json(respuesta)));
    const rendered = renderHook(() => useLogin(), { wrapper });
    act(() => {
      rendered.result.current.login("user@example.com", "secret123");
    });
    await waitFor(() => expect(rendered.result.current.paso).not.toBe("credenciales"));
    return rendered.result;
  }

  it("needs2fa → paso codigo, sin sesión ni redirección; expone recordarDisponible", async () => {
    const result = await llegarAlCodigo();
    expect(result.current.paso).toBe("codigo");
    expect(result.current.recordarDisponible).toBe(true);
    expect(assignMock).not.toHaveBeenCalled();
    expect(writeLastActivity).not.toHaveBeenCalled();
  });

  it("recordarDisponible === false se refleja; ausente se trata como disponible", async () => {
    const no = await llegarAlCodigo({ ...DESAFIO, recordarDisponible: false });
    expect(no.current.recordarDisponible).toBe(false);
    const ausente = await llegarAlCodigo({ needs2fa: true, desafio: "ds-1" });
    expect(ausente.current.recordarDisponible).toBe(true);
  });

  it("needsEnrolamiento2fa → paso enrolamiento", async () => {
    server.use(
      http.post("/api/auth/2fa/enrolamiento/iniciar", () =>
        HttpResponse.json({ otpauthUri: "otpauth://totp/x?secret=ABC", claveManual: "ABC" }),
      ),
    );
    const result = await llegarAlCodigo({ needsEnrolamiento2fa: true, desafio: "ds-2" });
    expect(result.current.paso).toBe("enrolamiento");
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("verificarCodigo → verificar con el desafío, luego continuar con el ticket, y redirige", async () => {
    let verificar: unknown = null;
    let continuar: unknown = null;
    server.use(
      http.post("/api/auth/2fa/verificar", async ({ request }) => {
        verificar = await request.json();
        return HttpResponse.json({ ticket: "tk-9" });
      }),
      http.post("/api/auth/login/continuar", async ({ request }) => {
        continuar = await request.json();
        return HttpResponse.json({ user: USER_OK });
      }),
    );
    const result = await llegarAlCodigo();

    act(() => {
      result.current.verificarCodigo("123456", true);
    });

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(verificar).toEqual({ desafio: "ds-1", codigo: "123456", recordar: true });
    expect(continuar).toEqual({ ticket: "tk-9" });
    expect(writeLastActivity).toHaveBeenCalledWith(expect.any(Number));
  });

  it("verificarCodigo con varias membresías → paso seleccion con el ticket que devuelve continuar", async () => {
    let seleccionar: unknown = null;
    server.use(
      http.post("/api/auth/2fa/verificar", () => HttpResponse.json({ ticket: "tk-9" })),
      http.post("/api/auth/login/continuar", () => HttpResponse.json(SELECCION)),
      http.post("/api/auth/login/seleccionar", async ({ request }) => {
        seleccionar = await request.json();
        return HttpResponse.json({ user: USER_OK });
      }),
    );
    const result = await llegarAlCodigo();

    act(() => {
      result.current.verificarCodigo("123456", false);
    });
    await waitFor(() => expect(result.current.paso).toBe("seleccion"));
    act(() => {
      result.current.selectCliente("c1");
    });

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(seleccionar).toEqual({ ticket: "tk-1", clienteId: "c1" });
  });

  it("código equivocado (401) → toast genérico, sigue en el paso codigo y no redirige", async () => {
    const { toast } = await import("sonner");
    server.use(
      http.post("/api/auth/2fa/verificar", () =>
        HttpResponse.json({ statusCode: 401, message: "detalle interno" }, { status: 401 }),
      ),
    );
    const result = await llegarAlCodigo();

    act(() => {
      result.current.verificarCodigo("000000", false);
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/código incorrecto/i)),
    );
    expect(result.current.paso).toBe("codigo");
    expect(assignMock).not.toHaveBeenCalled();
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

  it("volver desde el paso del código regresa a credenciales y descarta el desafío", async () => {
    const result = await llegarAlCodigo();
    act(() => {
      result.current.volver();
    });
    expect(result.current.paso).toBe("credenciales");
    act(() => {
      result.current.verificarCodigo("123456", false);
    });
    expect(result.current.isPending).toBe(false);
  });

  it("volver desde la selección regresa a credenciales", async () => {
    const result = await llegarAlCodigo(SELECCION);
    expect(result.current.paso).toBe("seleccion");
    act(() => {
      result.current.volver();
    });
    expect(result.current.paso).toBe("credenciales");
    expect(result.current.membresias).toBeNull();
  });

  it("continuar con 401 tras verificar → avisa que venció y vuelve a credenciales", async () => {
    const { toast } = await import("sonner");
    server.use(
      http.post("/api/auth/2fa/verificar", () => HttpResponse.json({ ticket: "tk-9" })),
      http.post("/api/auth/login/continuar", () => HttpResponse.json({ statusCode: 401 }, { status: 401 })),
    );
    const result = await llegarAlCodigo();
    act(() => {
      result.current.verificarCodigo("123456", false);
    });
    await waitFor(() => expect(result.current.paso).toBe("credenciales"));
    expect(toast.error).toHaveBeenCalledWith(MENSAJE_VENCIDO);
  });

  it("seleccionar con 401 → avisa que venció, no 'credenciales incorrectas', y vuelve a credenciales", async () => {
    const { toast } = await import("sonner");
    server.use(
      http.post("/api/auth/login/seleccionar", () => HttpResponse.json({ statusCode: 401 }, { status: 401 })),
    );
    const result = await llegarAlCodigo(SELECCION);
    act(() => {
      result.current.selectCliente("c1");
    });
    await waitFor(() => expect(result.current.paso).toBe("credenciales"));
    expect(toast.error).toHaveBeenCalledWith(MENSAJE_VENCIDO);
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringMatching(/credenciales incorrectas/i));
  });

  it("verificar rechazado pasado el plazo del desafío → vencido y vuelve a credenciales", async () => {
    const { toast } = await import("sonner");
    server.use(
      http.post("/api/auth/2fa/verificar", () => HttpResponse.json({ statusCode: 401 }, { status: 401 })),
    );
    const ahora = Date.now();
    const spy = vi.spyOn(Date, "now");
    spy.mockReturnValue(ahora);
    const result = await llegarAlCodigo();
    spy.mockReturnValue(ahora + 6 * 60_000);
    act(() => {
      result.current.verificarCodigo("000000", false);
    });
    await waitFor(() => expect(result.current.paso).toBe("credenciales"));
    expect(toast.error).toHaveBeenCalledWith(MENSAJE_VENCIDO);
    spy.mockRestore();
  });

  it.each([
    ["dentro del plazo de 15 min → código incorrecto y sigue en el alta", 14 * 60_000, "enrolamiento", false],
    ["pasado el plazo de 15 min → vencido y vuelve a credenciales", 16 * 60_000, "credenciales", true],
  ])("confirmar el alta con 401 %s", async (_titulo, demora, pasoEsperado, vencido) => {
    const { toast } = await import("sonner");
    server.use(
      http.post("/api/auth/2fa/enrolamiento/iniciar", () =>
        HttpResponse.json({ otpauthUri: "otpauth://totp/x?secret=ABC", claveManual: "ABC" }),
      ),
      http.post("/api/auth/2fa/enrolamiento/confirmar", () =>
        HttpResponse.json({ statusCode: 401 }, { status: 401 }),
      ),
    );
    const ahora = Date.now();
    const spy = vi.spyOn(Date, "now");
    spy.mockReturnValue(ahora);
    const result = await llegarAlCodigo({ needsEnrolamiento2fa: true, desafio: "ds-2" });
    await waitFor(() => expect(result.current.datosEnrolamiento).not.toBeNull());
    spy.mockReturnValue(ahora + demora);
    act(() => {
      result.current.confirmarEnrolamiento("123456");
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(result.current.paso).toBe(pasoEsperado);
    if (vencido) expect(toast.error).toHaveBeenCalledWith(MENSAJE_VENCIDO);
    else expect(toast.error).toHaveBeenCalledWith("Código incorrecto. Intentá de nuevo.");
    spy.mockRestore();
  });

  it("enrolamiento forzado: iniciar → confirmar → códigos → continuar → sesión", async () => {
    let confirmar: unknown = null;
    let continuar: unknown = null;
    server.use(
      http.post("/api/auth/2fa/enrolamiento/iniciar", () =>
        HttpResponse.json({ otpauthUri: "otpauth://totp/x?secret=ABC", claveManual: "ABC" }),
      ),
      http.post("/api/auth/2fa/enrolamiento/confirmar", async ({ request }) => {
        confirmar = await request.json();
        return HttpResponse.json({ codigosRecuperacion: ["AAAA-BBBB-CCCC"], ticket: "tk-5" });
      }),
      http.post("/api/auth/login/continuar", async ({ request }) => {
        continuar = await request.json();
        return HttpResponse.json({ user: USER_OK });
      }),
    );
    const result = await llegarAlCodigo({ needsEnrolamiento2fa: true, desafio: "ds-2" });
    await waitFor(() => expect(result.current.datosEnrolamiento).toEqual({ otpauthUri: "otpauth://totp/x?secret=ABC", claveManual: "ABC" }));

    act(() => {
      result.current.confirmarEnrolamiento("123456");
    });
    await waitFor(() => expect(result.current.paso).toBe("codigos"));
    expect(confirmar).toEqual({ desafio: "ds-2", codigo: "123456" });
    expect(result.current.codigosRecuperacion).toEqual(["AAAA-BBBB-CCCC"]);
    expect(continuar).toBeNull();

    act(() => {
      result.current.continuarTrasCodigos();
    });
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(continuar).toEqual({ ticket: "tk-5" });
  });
});
