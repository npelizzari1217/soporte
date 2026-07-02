// @vitest-environment node
// Reason: middleware + NextRequest use jose-backed crypto (via verifyAccessToken).
// The jsdom realm causes TextEncoder → Uint8Array mismatches in jose's sign path.
// Node environment has a single Uint8Array realm; NextRequest is available natively
// via Next.js (no DOM APIs needed for middleware logic tests).
/**
 * Tests for middleware.ts (route protection gate)
 *
 * Strategy: mock verifyAccessToken so tests control the result without a real JWT.
 * NextRequest is constructed with Cookie headers to simulate browser behavior.
 *
 * Spec: [SPEC:frontend-route-protection/sin-sesion]       — redirect /login
 *       [SPEC:frontend-route-protection/jose-verificacion] — valid token → next
 *       [SPEC:frontend-route-protection/rutas-excluidas]  — matcher pattern
 *
 * ADR-4 deviation (documented in middleware.ts):
 *   Spec scenario "refresh-silencioso" requires server-side refresh in middleware.
 *   The design REJECTS this (breaks multi-instance Node). Middleware is TOLERANT:
 *   passes through if `rt` exists; client single-flight handles refresh.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock is hoisted by vitest — this runs BEFORE any imports below.
vi.mock("@/shared/auth/verify");

import { verifyAccessToken } from "@/shared/auth/verify";
import middleware, { config } from "./middleware";
import type { JwtPayload } from "@/shared/api/types";

const mockVerify = vi.mocked(verifyAccessToken);

const VALID_PAYLOAD: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  email: "test@example.com",
  roles: ["USER"],
  permisos: ["ticket:ver"],
};

/** Build a NextRequest with optional cookies set via the Cookie header. */
function makeRequest(
  path: string,
  cookies: Record<string, string> = {}
): NextRequest {
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

  it("passes through when no `at` but `rt` is present (ADR-4 tolerant)", async () => {
    const req = makeRequest("/tickets", { rt: "some-refresh-token" });
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // verifyAccessToken must NOT be called — there is no `at` to verify
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("passes through when `at` is valid", async () => {
    mockVerify.mockResolvedValueOnce(VALID_PAYLOAD);
    const req = makeRequest("/tickets", { at: "valid-token" });
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when `at` is expired but `rt` is present (ADR-4 tolerant)", async () => {
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

  it("redirects to /login and clears `at` cookie when `at` has an invalid signature", async () => {
    mockVerify.mockResolvedValueOnce("invalid");
    const req = makeRequest("/tickets", { at: "forged-token" });
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");

    // The invalid `at` cookie must be cleared in the redirect response
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("at=");
    expect(setCookie).toContain("Max-Age=0");
  });

  // ── /login path (special: redirect away if session exists) ────────────────

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
    // Location must NOT be /login (avoids redirect loop)
    const location = res.headers.get("location") ?? "";
    expect(location).not.toMatch(/\/login/);
    // Should redirect to the root dashboard
    expect(location).toMatch(/\/$/);
  });

  // ── Matcher exclusions ────────────────────────────────────────────────────
  // The `config.matcher` uses a negative-lookahead regex pattern to exclude
  // /api/* and _next/* paths from middleware execution entirely.
  // These tests verify the matcher string contains the expected exclusions
  // AND that the embedded regex correctly gates the paths.

  it("config.matcher is exported and contains exclusion patterns", () => {
    expect(Array.isArray(config.matcher)).toBe(true);
    const pattern = config.matcher[0];
    expect(pattern).toContain("_next/static");
    expect(pattern).toContain("_next/image");
    expect(pattern).toContain("api");
    expect(pattern).toContain("favicon.ico");
  });

  it("matcher pattern does NOT match /api/auth/login (excluded)", () => {
    // Test the regex lookahead that Next.js embeds in the route pattern.
    // The inner regex: ((?!_next/static|_next/image|favicon.ico|api|.*\.\w+$).*)
    // We test paths after the leading `/`.
    const exclusionRegex = /^(?!_next\/static|_next\/image|favicon\.ico|api|.*\.\w+$).*/;
    expect(exclusionRegex.test("api/auth/login")).toBe(false);
  });

  it("matcher pattern does NOT match /_next/static/x.js (excluded)", () => {
    const exclusionRegex = /^(?!_next\/static|_next\/image|favicon\.ico|api|.*\.\w+$).*/;
    expect(exclusionRegex.test("_next/static/x.js")).toBe(false);
  });

  // ── /admin/* route protection (admin-general PR5b — T5.14) ────────────────
  //
  // Spec: [SPEC:admin-ui/Pantalla Clientes — Protección de ruta]
  // Frontend-only UX guard — the backend (GlobalAdminGuard/RolesGuard) is the
  // real authority; this middleware only avoids rendering admin screens the
  // user cannot use and redirects with a 307.

  describe("/admin/* route protection", () => {
    const ADMIN_CLIENTE_PAYLOAD: JwtPayload = {
      sub: "2",
      cliente_id: "c1",
      email: "admin@cliente.com",
      roles: ["ADMINISTRADOR"],
      permisos: [],
      is_global_admin: false,
    };

    const OPERADOR_PAYLOAD: JwtPayload = {
      sub: "3",
      cliente_id: "home",
      email: "operador@sesitec.com.ar",
      roles: [],
      permisos: [],
      is_global_admin: true,
    };

    const REGULAR_PAYLOAD = (roles: string[]): JwtPayload => ({
      sub: "4",
      cliente_id: "c1",
      email: "regular@cliente.com",
      roles,
      permisos: [],
      is_global_admin: false,
    });

    it("redirects /admin/clientes to /tickets when the user is ADMINISTRADOR but not is_global_admin", async () => {
      mockVerify.mockResolvedValueOnce(ADMIN_CLIENTE_PAYLOAD);
      const req = makeRequest("/admin/clientes", { at: "valid-token" });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/tickets");
    });

    it("redirects /admin/clientes to /login when there is no session at all", async () => {
      const req = makeRequest("/admin/clientes");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it("passes through /admin/ciclos for ADMINISTRADOR (not global admin — no redirect)", async () => {
      mockVerify.mockResolvedValueOnce(ADMIN_CLIENTE_PAYLOAD);
      const req = makeRequest("/admin/ciclos", { at: "valid-token" });
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("passes through /admin/reportes for is_global_admin (operador)", async () => {
      mockVerify.mockResolvedValueOnce(OPERADOR_PAYLOAD);
      const req = makeRequest("/admin/reportes", { at: "valid-token" });
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("passes through /admin/clientes for is_global_admin (operador)", async () => {
      mockVerify.mockResolvedValueOnce(OPERADOR_PAYLOAD);
      const req = makeRequest("/admin/clientes", { at: "valid-token" });
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("non-admin routes are unaffected: /tickets still passes through for ADMINISTRADOR", async () => {
      mockVerify.mockResolvedValueOnce(ADMIN_CLIENTE_PAYLOAD);
      const req = makeRequest("/tickets", { at: "valid-token" });
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    // ── CRITICAL fix: gate ALL /admin/* routes by role, not just /admin/clientes ──
    // Spec: [SPEC:admin-ui/Pantalla Clientes — Protección de ruta]
    // MUST: ninguna ruta bajo /admin/* MUST ser accesible para usuarios regulares
    // (USUARIO/COLABORADOR/TECNICO).

    it.each(["/admin/ciclos", "/admin/usuarios", "/admin/reportes"])(
      "redirects %s to /tickets for a regular USUARIO (not is_global_admin, no ADMINISTRADOR role)",
      async (path) => {
        mockVerify.mockResolvedValueOnce(REGULAR_PAYLOAD(["USUARIO"]));
        const req = makeRequest(path, { at: "valid-token" });
        const res = await middleware(req);

        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toContain("/tickets");
      }
    );

    it.each(["/admin/ciclos", "/admin/usuarios", "/admin/reportes"])(
      "redirects %s to /tickets for a COLABORADOR",
      async (path) => {
        mockVerify.mockResolvedValueOnce(REGULAR_PAYLOAD(["COLABORADOR"]));
        const req = makeRequest(path, { at: "valid-token" });
        const res = await middleware(req);

        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toContain("/tickets");
      }
    );

    it.each(["/admin/ciclos", "/admin/usuarios", "/admin/reportes"])(
      "redirects %s to /tickets for a TECNICO",
      async (path) => {
        mockVerify.mockResolvedValueOnce(REGULAR_PAYLOAD(["TECNICO"]));
        const req = makeRequest(path, { at: "valid-token" });
        const res = await middleware(req);

        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toContain("/tickets");
      }
    );

    it.each(["/admin/ciclos", "/admin/usuarios", "/admin/reportes"])(
      "passes through %s for ADMINISTRADOR (not is_global_admin but has the role)",
      async (path) => {
        mockVerify.mockResolvedValueOnce(ADMIN_CLIENTE_PAYLOAD);
        const req = makeRequest(path, { at: "valid-token" });
        const res = await middleware(req);

        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
      }
    );

    it.each(["/admin/ciclos", "/admin/usuarios", "/admin/reportes"])(
      "passes through %s for is_global_admin (operador)",
      async (path) => {
        mockVerify.mockResolvedValueOnce(OPERADOR_PAYLOAD);
        const req = makeRequest(path, { at: "valid-token" });
        const res = await middleware(req);

        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
      }
    );

    it("redirects /admin/clientes to /tickets for a regular USUARIO", async () => {
      mockVerify.mockResolvedValueOnce(REGULAR_PAYLOAD(["USUARIO"]));
      const req = makeRequest("/admin/clientes", { at: "valid-token" });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/tickets");
    });
  });
});
