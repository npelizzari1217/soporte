/**
 * Tests for useIdleTimeout (idle-session-timeout, Fase 2 — hook core)
 * Spec: [SPEC:frontend-auth/Auto-logout por inactividad tras 15 minutos]
 *       [SPEC:frontend-auth/Aviso de cuenta regresiva antes del corte]
 *       [SPEC:frontend-auth/"Seguir conectado" reinicia la sesión sin re-login]
 *       [SPEC:frontend-auth/Corte real de sesión al agotarse el countdown]
 *       [SPEC:frontend-auth/No-op del timer sin sesión autenticada]
 *       [SPEC:frontend-auth/Sincronización de inactividad entre pestañas]
 *       [SPEC:frontend-auth/Persistencia de última actividad ante refresh o remount]
 * Task: T5
 * Design: ADR-1 (API del hook), ADR-2 (init desde localStorage / anti-bypass),
 *         ADR-3 (sync cross-tab vía storage event), ADR-8 (actividad pasiva ignorada en warning)
 *
 * `now` es inyectado explícitamente (no `Date.now()` real) — un reloj manual
 * (`currentTime` + `advance()`) que avanza en lockstep con los fake timers de vitest.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { IDLE_TIMEOUT_MS, WARNING_BEFORE_MS } from "@/shared/auth/idle-config";
import { IDLE_LAST_ACTIVITY_KEY } from "@/shared/auth/idle-storage";
import { useIdleTimeout } from "./use-idle-timeout";

vi.mock("@/shared/auth/idle-storage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/shared/auth/idle-storage")>();
  return {
    ...actual,
    readLastActivity: vi.fn(),
    writeLastActivity: vi.fn(),
  };
});

import { readLastActivity, writeLastActivity } from "@/shared/auth/idle-storage";

const mockReadLastActivity = vi.mocked(readLastActivity);
const mockWriteLastActivity = vi.mocked(writeLastActivity);

const BASE_TIME = 1_752_000_000_000;

describe("useIdleTimeout", () => {
  let currentTime: number;
  const now = () => currentTime;

  function advance(ms: number) {
    currentTime += ms;
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    currentTime = BASE_TIME;
    mockReadLastActivity.mockReset().mockReturnValue(null);
    mockWriteLastActivity.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("case 1: sin actividad previa, agenda warning en IDLE_TIMEOUT_MS - WARNING_BEFORE_MS con secondsLeft=60", () => {
    const onCutoff = vi.fn();
    const { result } = renderHook(() =>
      useIdleTimeout({ enabled: true, onCutoff, now }),
    );

    expect(result.current.isWarning).toBe(false);

    advance(IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);

    expect(result.current.isWarning).toBe(true);
    expect(result.current.secondsLeft).toBe(60);
    expect(onCutoff).not.toHaveBeenCalled();
  });

  it("case 2: avanzando hasta IDLE_TIMEOUT_MS, onCutoff se llama exactamente 1 vez", () => {
    const onCutoff = vi.fn();
    renderHook(() => useIdleTimeout({ enabled: true, onCutoff, now }));

    advance(IDLE_TIMEOUT_MS);

    expect(onCutoff).toHaveBeenCalledTimes(1);

    // no debe volver a dispararse aunque el countdown ya haya llegado a 0
    advance(5_000);
    expect(onCutoff).toHaveBeenCalledTimes(1);
  });

  it("case 3: stayConnected() durante warning resetea el deadline y cancela el corte pendiente", () => {
    const onCutoff = vi.fn();
    const { result } = renderHook(() =>
      useIdleTimeout({ enabled: true, onCutoff, now }),
    );

    advance(IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);
    expect(result.current.isWarning).toBe(true);

    act(() => {
      result.current.stayConnected();
    });

    expect(result.current.isWarning).toBe(false);
    expect(mockWriteLastActivity).toHaveBeenCalledWith(currentTime);

    // el corte VIEJO habría caído acá (base_original + IDLE_TIMEOUT_MS); si los timers
    // viejos no se limpiaron, onCutoff dispararía en este punto.
    advance(WARNING_BEFORE_MS);
    expect(onCutoff).not.toHaveBeenCalled();
  });

  it("case 4: evento de actividad respeta ACTIVITY_THROTTLE_MS — dos disparos en <1s solo reprograman una vez", () => {
    const onCutoff = vi.fn();
    renderHook(() => useIdleTimeout({ enabled: true, onCutoff, now }));

    advance(2_000); // pasado el throttle inicial desde el mount
    mockWriteLastActivity.mockClear(); // limpia el write del mount (stored===null)

    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });
    expect(mockWriteLastActivity).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("keydown"));
    });
    // segundo disparo dentro de la ventana de throttle: no reprograma de nuevo
    expect(mockWriteLastActivity).toHaveBeenCalledTimes(1);
  });

  it("case 5: actividad pasiva durante isWarning=true es IGNORADA (ADR-8)", () => {
    const onCutoff = vi.fn();
    const { result } = renderHook(() =>
      useIdleTimeout({ enabled: true, onCutoff, now }),
    );

    advance(IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);
    expect(result.current.isWarning).toBe(true);

    mockWriteLastActivity.mockClear();
    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });
    expect(mockWriteLastActivity).not.toHaveBeenCalled();

    // el countdown NO se reseteó por la actividad pasiva: el corte llega en tiempo
    advance(WARNING_BEFORE_MS);
    expect(onCutoff).toHaveBeenCalledTimes(1);
  });

  it("case 6: init con readLastActivity ya vencido dispara onCutoff inmediato en el primer efecto", () => {
    mockReadLastActivity.mockReturnValue(currentTime - IDLE_TIMEOUT_MS - 1_000);
    const onCutoff = vi.fn();

    renderHook(() => useIdleTimeout({ enabled: true, onCutoff, now }));

    expect(onCutoff).toHaveBeenCalledTimes(1);
  });

  it("case 7: init dentro de la ventana de warning muestra isWarning con secondsLeft correcto", () => {
    const elapsed = 14.5 * 60 * 1000; // 14.5 min transcurridos
    mockReadLastActivity.mockReturnValue(currentTime - elapsed);
    const onCutoff = vi.fn();

    const { result } = renderHook(() =>
      useIdleTimeout({ enabled: true, onCutoff, now }),
    );

    expect(result.current.isWarning).toBe(true);
    const expectedSecondsLeft = Math.ceil((IDLE_TIMEOUT_MS - elapsed) / 1000);
    expect(result.current.secondsLeft).toBe(expectedSecondsLeft);
    expect(onCutoff).not.toHaveBeenCalled();
  });

  it("case 8: enabled=false no registra listeners de DOM ni agenda timers", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const onCutoff = vi.fn();

    renderHook(() => useIdleTimeout({ enabled: false, onCutoff, now }));

    const relevantCalls = addEventListenerSpy.mock.calls.filter(([type]) =>
      ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "storage"].includes(
        type as string,
      ),
    );
    expect(relevantCalls).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(mockReadLastActivity).not.toHaveBeenCalled();
    expect(onCutoff).not.toHaveBeenCalled();
  });

  it("case 9: evento storage sintético sobre IDLE_LAST_ACTIVITY_KEY reprograma el timer sin re-escribir localStorage", () => {
    const onCutoff = vi.fn();
    const { result } = renderHook(() =>
      useIdleTimeout({ enabled: true, onCutoff, now }),
    );

    // 1s antes del umbral de warning original
    advance(IDLE_TIMEOUT_MS - WARNING_BEFORE_MS - 1_000);
    expect(result.current.isWarning).toBe(false);

    mockWriteLastActivity.mockClear();
    const newActivityTs = currentTime;
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: IDLE_LAST_ACTIVITY_KEY,
          newValue: String(newActivityTs),
        }),
      );
    });

    // handler read-only: no vuelve a escribir en localStorage
    expect(mockWriteLastActivity).not.toHaveBeenCalled();

    // el umbral VIEJO (1s después) ya no dispara warning: el deadline se corrió
    advance(1_000);
    expect(result.current.isWarning).toBe(false);

    // el umbral NUEVO (recalculado desde newActivityTs) sí lo hace
    advance(IDLE_TIMEOUT_MS - WARNING_BEFORE_MS - 1_000);
    expect(result.current.isWarning).toBe(true);
  });
});
