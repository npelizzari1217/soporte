import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleTimeout } from "./use-idle-timeout";
import { IDLE_LAST_ACTIVITY_KEY } from "@/shared/auth/idle-storage";

// Spec: PR11 — idle-timeout: 15min de inactividad → aviso 60s antes, corte al vencer.

describe("useIdleTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enabled: false → never calls onCutoff, isWarning stays false regardless of elapsed time", () => {
    const onCutoff = vi.fn();
    const { result } = renderHook(() =>
      useIdleTimeout({ enabled: false, onCutoff, idleTimeoutMs: 1000, warningBeforeMs: 200 }),
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.isWarning).toBe(false);
    expect(onCutoff).not.toHaveBeenCalled();
  });

  it("enabled: true → enters warning state warningBeforeMs before idleTimeoutMs elapses", () => {
    const onCutoff = vi.fn();
    const { result } = renderHook(() =>
      useIdleTimeout({ enabled: true, onCutoff, idleTimeoutMs: 1000, warningBeforeMs: 300 }),
    );

    expect(result.current.isWarning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(700); // 1000 - 300 = warning threshold
    });

    expect(result.current.isWarning).toBe(true);
    expect(result.current.secondsLeft).toBeGreaterThan(0);
    expect(onCutoff).not.toHaveBeenCalled();
  });

  it("countdown reaches 0 → calls onCutoff exactly once and clears the warning", () => {
    const onCutoff = vi.fn();
    const { result } = renderHook(() =>
      useIdleTimeout({ enabled: true, onCutoff, idleTimeoutMs: 1000, warningBeforeMs: 300 }),
    );

    // Warning starts at t=700 (idleTimeoutMs - warningBeforeMs); the 1s countdown
    // interval is scheduled from THAT moment, so its first tick lands at t=1700
    // (700 + 1000), which is where `remaining <= 0` is observed and onCutoff fires.
    act(() => {
      vi.advanceTimersByTime(1700);
    });

    expect(onCutoff).toHaveBeenCalledTimes(1);
    expect(result.current.isWarning).toBe(false);

    // Idempotent: further time passing must NOT call onCutoff again.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onCutoff).toHaveBeenCalledTimes(1);
  });

  it("stayConnected during warning → resets the timer and closes the warning without calling onCutoff", () => {
    const onCutoff = vi.fn();
    const { result } = renderHook(() =>
      useIdleTimeout({ enabled: true, onCutoff, idleTimeoutMs: 1000, warningBeforeMs: 300 }),
    );

    act(() => {
      vi.advanceTimersByTime(700); // now warning
    });
    expect(result.current.isWarning).toBe(true);

    act(() => {
      result.current.stayConnected();
    });
    expect(result.current.isWarning).toBe(false);

    // Only 200ms after reset — must NOT be in warning yet (would need 700ms).
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.isWarning).toBe(false);
    expect(onCutoff).not.toHaveBeenCalled();
  });

  it("writes last-activity timestamp to localStorage so a refresh/remount survives an in-progress countdown", () => {
    renderHook(() =>
      useIdleTimeout({ enabled: true, onCutoff: vi.fn(), idleTimeoutMs: 1000, warningBeforeMs: 300 }),
    );

    expect(window.localStorage.getItem(IDLE_LAST_ACTIVITY_KEY)).not.toBeNull();
  });
});
