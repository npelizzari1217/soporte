// @vitest-environment node
// Reason: middleware uses jose-backed crypto (via verifyAccessToken, mocked
// here) and NextRequest. jsdom's Uint8Array realm mismatch is irrelevant
// once mocked, but Node keeps parity with the Edge runtime's single realm.
/**
 * Tests for middleware.ts (route protection gate, Edge Runtime).
 *
 * Strategy: mock verifyAccessToken so tests control the result without a
 * real JWT. NextRequest is constructed with Cookie headers to simulate
 * browser behavior.
 *
 * Spec: [R26] Middleware Edge (jose) — verifica el `at` en rutas protegidas;
 * expirado con `rt` presente → tolerante (deja pasar, el refresh transparente
 * de PR11 lo resuelve); sin sesión → redirect /login.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/shared/auth/verify");

import { verifyAccessToken } from "@/shared/auth/verify";
import middleware, { config } from "./middleware";
import type { JwtPayload } from "@/shared/api/types";

const mockVerify = vi.mocked(verifyAccessToken);

const VALID_PAYLOAD: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "TECNICO",
  permisos: ["ticket:ver_todos"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [{ cliente_id: "c1", nombre: "Cliente Uno", rol: "TECNICO" }],
  modulos: [],
  nombre: "Juan",
  apellido: "Pérez",
};

function makeRequest(path: string, cookies: Record<string, string> = {}): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  return new NextRequest(`http://localhost${path}`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Protected routes ──────────────────────────────────────────────────────

  it("redirects to /login (307) when no `at` and no `rt` cookie", async () => {
    const req = makeRequest("/tickets");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("passes through when no `at` but `rt` is present (tolerant, ADR-4-style)", async () => {
    const req = makeRequest("/tickets", { rt: "some-refresh-token" });
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("passes through when `at` is valid", async () => {
    mockVerify.mockResolvedValueOnce(VALID_PAYLOAD);
    const req = makeRequest("/tickets", { at: "valid-token" });
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when `at` is expired but `rt` is present (R26 tolerant)", async () => {
    mockVerify.mockResolvedValueOnce("expired");
    const req = makeRequest("/compras", { at: "expired-token", rt: "refresh-token" });
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to /login when `at` is expired and no `rt`", async () => {
    mockVerify.mockResolvedValueOnce("expired");
    const req = makeRequest("/reparaciones", { at: "expired-token" });
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects to /login and clears the `at` cookie when `at` has an invalid signature", async () => {
    mockVerify.mockResolvedValueOnce("invalid");
    const req = makeRequest("/tickets", { at: "forged-token" });
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("at=");
    expect(setCookie).toContain("Max-Age=0");
  });

  // ── /pedido-qr: la visita directa sin sesión conserva el QR (S4a) ────────
  // El rechazo de un `siguiente` hostil sigue cubierto en el bloque de /login (allowlist de destinoPosLogin).

  it("redirects /pedido-qr?c=x&e=y without a session to /login?siguiente=<path+query>", async () => {
    const res = await middleware(makeRequest("/pedido-qr?c=x&e=y"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `http://localhost/login?siguiente=${encodeURIComponent("/pedido-qr?c=x&e=y")}`,
    );
  });

  it("redirects a bare /pedido-qr without a session to /login?siguiente=/pedido-qr", async () => {
    const res = await middleware(makeRequest("/pedido-qr"));

    expect(res.headers.get("location")).toBe(`http://localhost/login?siguiente=${encodeURIComponent("/pedido-qr")}`);
  });

  it("keeps siguiente on /pedido-qr when `at` is expired and there is no `rt`", async () => {
    mockVerify.mockResolvedValue("expired");
    const res = await middleware(makeRequest("/pedido-qr?c=x", { at: "old" }));

    expect(res.headers.get("location")).toBe(`http://localhost/login?siguiente=${encodeURIComponent("/pedido-qr?c=x")}`);
  });

  it("keeps siguiente on /pedido-qr when `at` is invalid", async () => {
    mockVerify.mockResolvedValue("invalid");
    const res = await middleware(makeRequest("/pedido-qr?c=x", { at: "bad" }));

    expect(res.headers.get("location")).toBe(`http://localhost/login?siguiente=${encodeURIComponent("/pedido-qr?c=x")}`);
  });

  it("other protected routes still redirect to a bare /login (no siguiente)", async () => {
    const res = await middleware(makeRequest("/tickets?x=1"));

    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("a look-alike path (/pedido-qr/x) gets no siguiente", async () => {
    const res = await middleware(makeRequest("/pedido-qr/x"));

    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  // ── /login path (redirect away if a session is alive) ─────────────────────

  it("passes through for /login when there is no session (no at, no rt)", async () => {
    const req = makeRequest("/login");
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("redirects to / when /login is accessed with a valid `at` (session exists)", async () => {
    mockVerify.mockResolvedValueOnce(VALID_PAYLOAD);
    const req = makeRequest("/login", { at: "valid-token" });
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).not.toMatch(/\/login/);
    expect(location).toMatch(/\/$/);
  });

  it("redirects to / when /login is accessed with only `rt` present (tolerant)", async () => {
    const req = makeRequest("/login", { rt: "refresh-token" });
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).not.toMatch(/\/login/);
  });

  // Spec: sdd/formulario-publico-qr, D3 — con sesion viva, /login vuelve al landing del QR.
  it("redirects /login?siguiente=/pedido-qr?... to the landing when a session exists", async () => {
    mockVerify.mockResolvedValueOnce(VALID_PAYLOAD);
    const siguiente = "/pedido-qr?c=mi-colegio&e=tok-1";
    const req = makeRequest(`/login?siguiente=${encodeURIComponent(siguiente)}`, { at: "valid-token" });
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://localhost${siguiente}`);
  });

  it.each(["//evil.com", "https://evil.com", "/tickets"])(
    "redirects /login?siguiente=%s to / (outside the allowlist)",
    async (siguiente) => {
      const req = makeRequest(`/login?siguiente=${encodeURIComponent(siguiente)}`, { rt: "refresh-token" });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/");
    },
  );

  it("passes through /login?siguiente=... without a session (no redirect, the form shows)", async () => {
    const req = makeRequest(`/login?siguiente=${encodeURIComponent("/pedido-qr?c=a")}`);
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  // ── Rutas públicas (ADR-C7): el route group (publico) NO alcanza solo ────
  // El matcher intercepta todo salvo _next/api/archivos-con-extensión; la
  // única forma de que /encuesta/:token sea accesible sin sesión es una
  // allowlist explícita ANTES de la lógica de at/rt. Sin ella, un
  // destinatario del mail cae en un 307 a /login y no puede responder nunca
  // (bug del proposal original — ver sdd/csat/design ADR-C7).

  it("passes through /encuesta/:token without any cookie (ADR-C7 regression)", async () => {
    const req = makeRequest("/encuesta/abc123");
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("still redirects /tickets to /login without cookies (allowlist must stay narrow)", async () => {
    const req = makeRequest("/tickets");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  /**
   * [WU12.4] Fijar el CONTENIDO de RUTAS_PUBLICAS (los dos tests de arriba)
   * no fija la SEMÁNTICA del operador que lo evalúa. Con `.includes()` en
   * vez de `.startsWith()`, cualquier ruta que CONTENGA "/encuesta/" en el
   * medio (no solo al principio) quedaría pública — un agujero real el día
   * que exista una ruta protegida así.
   */
  it("still redirects a protected route that CONTAINS /encuesta/ but doesn't start with it (match must be prefix, not substring)", async () => {
    const req = makeRequest("/admin/encuesta/plantillas");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  // ── /restablecer-password (sdd/reseteo-contrasena-olvidada, WU-10) ───────
  // El token viaja en el fragmento (`#token=...`), que nunca llega al
  // servidor: la página SIEMPRE se sirve sin sesión, exista o no el token.

  it("passes through /restablecer-password without any cookie", async () => {
    const req = makeRequest("/restablecer-password");
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("does NOT treat a longer path starting with /restablecer-password as public", async () => {
    const req = makeRequest("/restablecer-password-x");
    const res = await middleware(req);

    expect(res.headers.get("location")).toContain("/login");
  });

  // ── /olvide-password (sdd/reseteo-contrasena-olvidada, WU-11) ────────────
  // Pantalla de solicitud, público por diseño: nadie tiene sesión antes de
  // pedir el reset.

  it("passes through /olvide-password without any cookie", async () => {
    const req = makeRequest("/olvide-password");
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  // ── /c/ (sdd/formulario-publico-qr, WU-16) ───────────────────────────────
  // Formulario público del QR: nadie tiene sesión. Es prefijo, no substring.

  it.each(["/c/mi-colegio/pedido", "/c/mi-colegio/pedido/confirmar"])(
    "passes through %s without any cookie",
    async (ruta) => {
      const res = await middleware(makeRequest(ruta));

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(mockVerify).not.toHaveBeenCalled();
    },
  );

  it.each(["/clientes", "/compras", "/admin/c/x"])(
    "still redirects %s to /login (/c/ is a prefix, not a substring)",
    async (ruta) => {
      const res = await middleware(makeRequest(ruta));

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    },
  );

  // ── Matcher exclusions ────────────────────────────────────────────────────

  it("config.matcher is exported and excludes api/_next/favicon", () => {
    expect(Array.isArray(config.matcher)).toBe(true);
    const pattern = config.matcher[0];
    expect(pattern).toContain("_next/static");
    expect(pattern).toContain("_next/image");
    expect(pattern).toContain("api");
    expect(pattern).toContain("favicon.ico");
  });
});
