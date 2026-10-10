import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_MAX_AGE,
  clearCookieAttrs,
  cookieAttrs,
  cookieName,
  COOKIE_AT,
  COOKIE_RT,
  COOKIE_SSO_ESTADO,
  COOKIE_SSO_PASO,
  SSO_ESTADO_MAX_AGE,
  SSO_PASO_MAX_AGE,
  REFRESH_MAX_AGE,
} from "./cookies";

// Spec: [R23] BFF login route — cookie attribute contract (httpOnly, SameSite=Lax, Secure in prod, Path=/)

describe("cookieName", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the bare name outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(cookieName(COOKIE_AT)).toBe("at");
  });

  it("prefixes with __Host- in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(cookieName(COOKIE_RT)).toBe("__Host-rt");
  });
});

describe("cookieAttrs", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds httpOnly, SameSite=Lax attributes with the given maxAge for the access cookie", () => {
    const attrs = cookieAttrs(COOKIE_AT, ACCESS_MAX_AGE);
    expect(attrs).toMatchObject({
      name: "at",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 900,
      secure: false,
    });
  });

  it("builds attributes for the refresh cookie with a different maxAge (900 vs 604800)", () => {
    const attrs = cookieAttrs(COOKIE_RT, REFRESH_MAX_AGE);
    expect(attrs.name).toBe("rt");
    expect(attrs.maxAge).toBe(604800);
  });

  it("marks secure=true in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const attrs = cookieAttrs(COOKIE_AT, ACCESS_MAX_AGE);
    expect(attrs.secure).toBe(true);
    expect(attrs.name).toBe("__Host-at");
  });
});

describe("clearCookieAttrs", () => {
  it("returns maxAge=0 to expire the cookie immediately", () => {
    const attrs = clearCookieAttrs(COOKIE_RT);
    expect(attrs.maxAge).toBe(0);
    expect(attrs.httpOnly).toBe(true);
  });
});

describe("cookies SSO", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("nombres y vigencias del flujo SSO", () => {
    expect(COOKIE_SSO_ESTADO).toBe("sso_st");
    expect(COOKIE_SSO_PASO).toBe("sso_paso");
    expect(SSO_ESTADO_MAX_AGE).toBe(600);
    expect(SSO_PASO_MAX_AGE).toBe(120);
  });

  it("sso_st usa los helpers: httpOnly, lax, Path=/ y __Host- en producción", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(cookieAttrs(COOKIE_SSO_ESTADO, SSO_ESTADO_MAX_AGE)).toMatchObject({
      name: "__Host-sso_st",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 600,
    });
    expect(clearCookieAttrs(COOKIE_SSO_PASO)).toMatchObject({ name: "__Host-sso_paso", maxAge: 0 });
  });
});
