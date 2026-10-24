import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../test/msw/server";
import { apiFetch } from "./client";
import { ApiError, SessionExpiredError } from "./types";

// Spec: PR11 — apiFetch: fetch autenticado same-origin `/api/...` con refresh
// transparente single-flight ante 401 (dedupe con refreshPromise ??=).

describe("apiFetch", () => {
  // Estos tests cubren el refresh, no el corte de sesión (ver el describe de abajo). Desde
  // `/login` el corte no hace nada, así que una `SessionExpiredError` no deja un logout ni una
  // navegación pendientes que crucen al test siguiente.
  beforeEach(() => {
    vi.stubGlobal("location", { ...window.location, pathname: "/login", assign: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("2xx → returns the parsed JSON body as T", async () => {
    server.use(
      http.get("/api/tickets/1", () =>
        HttpResponse.json({ id: "1", nombre: "Ticket 1" }),
      ),
    );

    const result = await apiFetch<{ id: string; nombre: string }>("tickets/1");
    expect(result).toEqual({ id: "1", nombre: "Ticket 1" });
  });

  it("single 401 → refreshes once via /api/auth/refresh, then retries original request once and returns its result", async () => {
    let ticketCallCount = 0;
    let refreshCallCount = 0;

    server.use(
      http.post("/api/auth/refresh", () => {
        refreshCallCount += 1;
        return HttpResponse.json({ ok: true });
      }),
      http.get("/api/tickets/1", () => {
        ticketCallCount += 1;
        if (ticketCallCount === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ id: "1", nombre: "Ticket 1 (post-refresh)" });
      }),
    );

    const result = await apiFetch<{ id: string; nombre: string }>("tickets/1");

    expect(result).toEqual({ id: "1", nombre: "Ticket 1 (post-refresh)" });
    expect(refreshCallCount).toBe(1);
    expect(ticketCallCount).toBe(2);
  });

  it("N concurrent 401s → triggers exactly ONE refresh call (single-flight dedupe)", async () => {
    let refreshCallCount = 0;
    // Tracks which ticket ids already saw their forced 401 — each unique path
    // fails exactly once, then succeeds on the post-refresh retry.
    const seen = new Set<string>();

    server.use(
      http.post("/api/auth/refresh", async () => {
        refreshCallCount += 1;
        await delay(30); // hold the refresh in-flight so concurrent 401s overlap
        return HttpResponse.json({ ok: true });
      }),
      http.get("/api/tickets/:id", ({ params }) => {
        const key = String(params.id);
        if (!seen.has(key)) {
          seen.add(key);
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ id: params.id, nombre: `Ticket ${params.id}` });
      }),
    );

    const results = await Promise.all([
      apiFetch<{ id: string }>("tickets/1"),
      apiFetch<{ id: string }>("tickets/2"),
      apiFetch<{ id: string }>("tickets/3"),
    ]);

    expect(results.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(refreshCallCount).toBe(1);
  });

  it("refresh fails (401) → throws SessionExpiredError, does NOT retry the original request", async () => {
    let ticketCallCount = 0;

    server.use(
      http.post("/api/auth/refresh", () => new HttpResponse(null, { status: 401 })),
      http.get("/api/tickets/1", () => {
        ticketCallCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(apiFetch("tickets/1")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(ticketCallCount).toBe(1); // no retry after refresh failure
  });

  it("retry after successful refresh still returns 401 → throws SessionExpiredError (no infinite loop)", async () => {
    server.use(
      http.post("/api/auth/refresh", () => HttpResponse.json({ ok: true })),
      http.get("/api/tickets/1", () => new HttpResponse(null, { status: 401 })),
    );

    await expect(apiFetch("tickets/1")).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("path === 'auth/refresh' → skips the refresh loop entirely (prevents infinite recursion)", async () => {
    let refreshCallCount = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshCallCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(apiFetch("auth/refresh", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(refreshCallCount).toBe(1);
  });

  it("4xx non-401 error → throws ApiError with the backend message, no refresh triggered", async () => {
    let refreshCallCount = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshCallCount += 1;
        return HttpResponse.json({ ok: true });
      }),
      http.post("/api/tickets", () =>
        HttpResponse.json({ statusCode: 400, message: "nombre es requerido" }, { status: 400 }),
      ),
    );

    await expect(apiFetch("tickets", { method: "POST", json: {} })).rejects.toMatchObject({
      statusCode: 400,
      message: "nombre es requerido",
    });
    expect(refreshCallCount).toBe(0);
  });

  it("json shorthand → serializes body and sets Content-Type: application/json", async () => {
    let capturedBody: unknown = null;
    let capturedContentType: string | null = null;

    server.use(
      http.post("/api/tickets", async ({ request }) => {
        capturedContentType = request.headers.get("content-type");
        capturedBody = await request.json();
        return HttpResponse.json({ id: "1" });
      }),
    );

    await apiFetch("tickets", { method: "POST", json: { nombre: "Nuevo ticket" } });

    expect(capturedContentType).toContain("application/json");
    expect(capturedBody).toEqual({ nombre: "Nuevo ticket" });
  });

  it.each([
    "auth/login",
    "auth/2fa/verificar",
    "auth/2fa/enrolamiento/iniciar",
    "auth/2fa/enrolamiento/confirmar",
    "auth/login/continuar",
    "auth/login/seleccionar",
    "auth/sso/paso",
  ])("401 en %s → NO refresca ni reintenta (no re-postea la contraseña)", async (ruta) => {
    let llamadas = 0;
    let refrescos = 0;
    server.use(
      http.post(`/api/${ruta}`, () => {
        llamadas += 1;
        return HttpResponse.json({ statusCode: 401, message: "No" }, { status: 401 });
      }),
      http.post("/api/auth/refresh", () => {
        refrescos += 1;
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(apiFetch(ruta, { method: "POST", json: {} })).rejects.toBeInstanceOf(ApiError);
    expect(llamadas).toBe(1);
    expect(refrescos).toBe(0);
  });

  it("401 en una ruta fuera del set (auth/2fa) sí refresca y reintenta", async () => {
    let refrescos = 0;
    let llamadas = 0;
    server.use(
      http.get("/api/auth/2fa", () => {
        llamadas += 1;
        return llamadas === 1
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ activo: true });
      }),
      http.post("/api/auth/refresh", () => {
        refrescos += 1;
        return HttpResponse.json({ ok: true });
      }),
    );

    expect(await apiFetch("auth/2fa")).toEqual({ activo: true });
    expect(refrescos).toBe(1);
  });
});

// Pedido del dueño: cuando la sesión vence, la pantalla no queda quieta con errores sueltos:
// se abre el login con el aviso de sesión vencida. El guard del corte es de módulo, así que
// cada test carga `client` y sus dependencias de cero.
describe("apiFetch — corte por sesión vencida", () => {
  let assign: ReturnType<typeof vi.fn>;
  let logouts: number;

  async function cargar(pathname: string): Promise<{
    apiFetch: typeof apiFetch;
    SessionExpiredError: typeof SessionExpiredError;
  }> {
    vi.stubGlobal("location", { ...window.location, pathname, assign });
    vi.resetModules();
    const cliente = await import("./client");
    const tipos = await import("./types");
    return { apiFetch: cliente.apiFetch, SessionExpiredError: tipos.SessionExpiredError };
  }

  beforeEach(() => {
    assign = vi.fn();
    logouts = 0;
    server.use(
      http.post("/api/auth/logout", () => {
        logouts += 1;
        return HttpResponse.json({ ok: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("N pedidos concurrentes con la sesión vencida → todos lanzan SessionExpiredError y hay UNA sola redirección con el motivo", async () => {
    server.use(
      http.post("/api/auth/refresh", () => new HttpResponse(null, { status: 401 })),
      http.get("/api/tickets/:id", () => new HttpResponse(null, { status: 401 })),
    );
    const { apiFetch: fetchFresco, SessionExpiredError: Vencida } = await cargar("/tickets");

    const resultados = await Promise.allSettled([
      fetchFresco("tickets/1"),
      fetchFresco("tickets/2"),
      fetchFresco("tickets/3"),
    ]);

    for (const resultado of resultados) {
      expect(resultado.status).toBe("rejected");
      if (resultado.status === "rejected") expect(resultado.reason).toBeInstanceOf(Vencida);
    }
    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith("/login?motivo=sesion-vencida");
    expect(logouts).toBe(1);
  });

  it("refresh OK pero el reintento vuelve a dar 401 → también corta con el motivo (y hace logout para limpiar las cookies)", async () => {
    server.use(
      http.post("/api/auth/refresh", () => HttpResponse.json({ ok: true })),
      http.get("/api/tickets/1", () => new HttpResponse(null, { status: 401 })),
    );
    const { apiFetch: fetchFresco, SessionExpiredError: Vencida } = await cargar("/tickets");

    await expect(fetchFresco("tickets/1")).rejects.toBeInstanceOf(Vencida);
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/login?motivo=sesion-vencida"));
    expect(logouts).toBe(1);
  });

  it.each(["/login", "/c/hospital/pedido", "/encuesta/abc123"])(
    "en %s (ruta sin sesión) → lanza SessionExpiredError pero no redirige ni hace logout",
    async (ruta) => {
      server.use(
        http.post("/api/auth/refresh", () => new HttpResponse(null, { status: 401 })),
        http.get("/api/algo", () => new HttpResponse(null, { status: 401 })),
      );
      const { apiFetch: fetchFresco, SessionExpiredError: Vencida } = await cargar(ruta);

      await expect(fetchFresco("algo")).rejects.toBeInstanceOf(Vencida);
      // Deja correr el corte asíncrono, si lo hubiera, antes de afirmar la ausencia.
      await new Promise((resolver) => setTimeout(resolver, 20));
      expect(assign).not.toHaveBeenCalled();
      expect(logouts).toBe(0);
    },
  );

  it("401 del flujo de login (credencial inválida) → no es sesión vencida: no redirige", async () => {
    server.use(
      http.post("/api/auth/login", () => HttpResponse.json({ statusCode: 401, message: "No" }, { status: 401 })),
    );
    const { apiFetch: fetchFresco } = await cargar("/tickets");

    await expect(fetchFresco("auth/login", { method: "POST", json: {} })).rejects.toMatchObject({ statusCode: 401 });
    await new Promise((resolver) => setTimeout(resolver, 20));
    expect(assign).not.toHaveBeenCalled();
  });

  it("4xx que no es 401 → no corta la sesión", async () => {
    server.use(http.get("/api/tickets/1", () => HttpResponse.json({ statusCode: 403, message: "No" }, { status: 403 })));
    const { apiFetch: fetchFresco } = await cargar("/tickets");

    await expect(fetchFresco("tickets/1")).rejects.toMatchObject({ statusCode: 403 });
    await new Promise((resolver) => setTimeout(resolver, 20));
    expect(assign).not.toHaveBeenCalled();
    expect(logouts).toBe(0);
  });
});
