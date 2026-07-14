/**
 * Tests for idle-storage (localStorage I/O with guards)
 * Spec: [SPEC:frontend-auth/Persistencia de última actividad ante refresh o remount]
 *       [SPEC:frontend-auth/Sincronización de inactividad entre pestañas]
 * Task: T3
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  IDLE_LAST_ACTIVITY_KEY,
  IDLE_LOGOUT_KEY,
  readLastActivity,
  writeLastActivity,
  signalLogout,
} from "./idle-storage";

describe("idle-storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("writeLastActivity + readLastActivity roundtrip", () => {
    writeLastActivity(1_752_000_000_000);
    expect(readLastActivity()).toBe(1_752_000_000_000);
  });

  it("readLastActivity returns null when the key does not exist", () => {
    expect(readLastActivity()).toBeNull();
  });

  it("readLastActivity returns null when the stored value is not numeric", () => {
    window.localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, "not-a-number");
    expect(readLastActivity()).toBeNull();
  });

  it("signalLogout writes a changing string value to IDLE_LOGOUT_KEY", () => {
    signalLogout();
    const first = window.localStorage.getItem(IDLE_LOGOUT_KEY);
    expect(first).not.toBeNull();

    signalLogout();
    const second = window.localStorage.getItem(IDLE_LOGOUT_KEY);
    expect(second).not.toBeNull();
  });

  it("writeLastActivity does not crash when localStorage.setItem throws (private mode/quota)", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(
      () => {
        throw new Error("QuotaExceededError");
      },
    );

    expect(() => writeLastActivity(Date.now())).not.toThrow();
  });

  it("readLastActivity does not crash and returns null when localStorage.getItem throws", () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(
      () => {
        throw new Error("SecurityError");
      },
    );

    expect(readLastActivity()).toBeNull();
  });

  it("signalLogout does not crash when localStorage.setItem throws", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(
      () => {
        throw new Error("QuotaExceededError");
      },
    );

    expect(() => signalLogout()).not.toThrow();
  });
});
