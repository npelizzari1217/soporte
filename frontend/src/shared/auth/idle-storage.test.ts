import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDLE_LAST_ACTIVITY_KEY,
  IDLE_LOGOUT_KEY,
  readLastActivity,
  writeLastActivity,
  signalLogout,
} from "./idle-storage";

// Spec: PR11 — persistencia de última actividad (localStorage) para el idle-timeout,
// con degradación elegante en SSR / modo privado / cuota excedida.

describe("idle-storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("readLastActivity → returns null when nothing was written yet", () => {
    expect(readLastActivity()).toBeNull();
  });

  it("writeLastActivity then readLastActivity → round-trips the exact timestamp", () => {
    writeLastActivity(1_700_000_000_000);
    expect(readLastActivity()).toBe(1_700_000_000_000);
  });

  it("readLastActivity → returns null for a non-numeric stored value (corrupted)", () => {
    window.localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, "not-a-number");
    expect(readLastActivity()).toBeNull();
  });

  it("writeLastActivity → degrades to silent no-op when localStorage throws (quota/private mode)", () => {
    const setItemSpy = vi
      .spyOn(window.localStorage.__proto__, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => writeLastActivity(123)).not.toThrow();

    setItemSpy.mockRestore();
  });

  it("signalLogout → writes a value to IDLE_LOGOUT_KEY so a storage event fires in other tabs", () => {
    expect(window.localStorage.getItem(IDLE_LOGOUT_KEY)).toBeNull();
    signalLogout();
    expect(window.localStorage.getItem(IDLE_LOGOUT_KEY)).not.toBeNull();
  });
});
