/**
 * Tests for idle-config constants
 * Spec: [SPEC:frontend-auth/Constantes de configuración del idle-timeout]
 * Task: T1
 */
import { describe, it, expect } from "vitest";
import {
  IDLE_TIMEOUT_MS,
  WARNING_BEFORE_MS,
  ACTIVITY_THROTTLE_MS,
  IDLE_ACTIVITY_EVENTS,
} from "./idle-config";

describe("idle-config", () => {
  it("IDLE_TIMEOUT_MS is 900000 (15 min)", () => {
    expect(IDLE_TIMEOUT_MS).toBe(900_000);
  });

  it("WARNING_BEFORE_MS is 60000 (60s)", () => {
    expect(WARNING_BEFORE_MS).toBe(60_000);
  });

  it("ACTIVITY_THROTTLE_MS is 1000 (1s)", () => {
    expect(ACTIVITY_THROTTLE_MS).toBe(1_000);
  });

  it("IDLE_ACTIVITY_EVENTS contains exactly the expected DOM events", () => {
    expect(IDLE_ACTIVITY_EVENTS).toEqual([
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ]);
  });
});
