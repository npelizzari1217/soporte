import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_MAX_AGE,
  clearCookieAttrs,
  cookieAttrs,
  cookieName,
  COOKIE_AT,
  COOKIE_RT,
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
