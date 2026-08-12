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
