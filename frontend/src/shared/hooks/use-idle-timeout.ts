"use client";

/**
 * useIdleTimeout — máquina de estados core del auto-logout por inactividad.
 * El hook NO hace red ni navega: solo detecta inactividad y dispara `onCutoff`.
 * El caller (provider) decide qué hacer con el corte (logout + redirect).
 *
 * Estados: active → warning → cutoff.
 *
 * Spec: PR11 — idle-timeout (15min inactividad → aviso 60s antes → corte).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVITY_THROTTLE_MS,
  IDLE_ACTIVITY_EVENTS,
  IDLE_TIMEOUT_MS,
  WARNING_BEFORE_MS,
} from "@/shared/auth/idle-config";
import {
  IDLE_LAST_ACTIVITY_KEY,
  readLastActivity,
  writeLastActivity,
} from "@/shared/auth/idle-storage";

export interface UseIdleTimeoutParams {
  /** El timer solo corre cuando `enabled === true` (provider: user != null && !isLoading). */
  enabled: boolean;
  /** Invocado exactamente 1 vez cuando el countdown llega a 0. El hook NO hace red ni nav. */
  onCutoff: () => void;
  /** Umbral total de inactividad. Default: `IDLE_TIMEOUT_MS`. */
  idleTimeoutMs?: number;
  /** Ventana de aviso antes del corte. Default: `WARNING_BEFORE_MS`. */
  warningBeforeMs?: number;
  /** Reloj inyectable para determinismo en tests con fake timers. Default: `Date.now`. */
  now?: () => number;
}

export interface UseIdleTimeoutResult {
  /** Controla la visibilidad del modal de aviso. */
  isWarning: boolean;
  /** Segundos restantes hasta el corte (válido durante `isWarning`). */
  secondsLeft: number;
  /** Resetea la actividad a "ahora" y cierra el aviso. */
  stayConnected: () => void;
}

export function useIdleTimeout({
  enabled,
  onCutoff,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
  warningBeforeMs = WARNING_BEFORE_MS,
  now = Date.now,
}: UseIdleTimeoutParams): UseIdleTimeoutResult {
  const [isWarning, setIsWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const onCutoffRef = useRef(onCutoff);
  onCutoffRef.current = onCutoff;

  const isWarningRef = useRef(false);
  useEffect(() => {
    isWarningRef.current = isWarning;
  }, [isWarning]);

  const lastActivityAtRef = useRef<number>(now());
  const cuttingOffRef = useRef(false);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (warningTimeoutRef.current !== null) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const triggerCutoff = useCallback(() => {
    if (cuttingOffRef.current) return; // idempotente: onCutoff dispara 1 sola vez
    cuttingOffRef.current = true;
    clearTimers();
    setIsWarning(false);
    onCutoffRef.current();
  }, [clearTimers]);

  const scheduleTimers = useCallback(
    (base: number) => {
      clearTimers();

      const elapsed = now() - base;

      if (elapsed >= idleTimeoutMs) {
        triggerCutoff();
        return;
      }

      const warningThreshold = idleTimeoutMs - warningBeforeMs;

      const enterWarning = () => {
        const msUntilCutoff = base + idleTimeoutMs - now();
        setIsWarning(true);
        setSecondsLeft(Math.max(0, Math.ceil(msUntilCutoff / 1000)));
        countdownIntervalRef.current = setInterval(() => {
          const remaining = base + idleTimeoutMs - now();
          if (remaining <= 0) {
            setSecondsLeft(0);
            triggerCutoff();
            return;
          }
          setSecondsLeft(Math.ceil(remaining / 1000));
        }, 1000);
      };

      if (elapsed >= warningThreshold) {
        enterWarning();
        return;
      }

      setIsWarning(false);
      const msUntilWarning = base + warningThreshold - now();
      warningTimeoutRef.current = setTimeout(enterWarning, msUntilWarning);
    },
    [clearTimers, idleTimeoutMs, warningBeforeMs, now, triggerCutoff],
  );

  const stayConnected = useCallback(() => {
    const nowTs = now();
    lastActivityAtRef.current = nowTs;
    writeLastActivity(nowTs);
    scheduleTimers(nowTs);
  }, [now, scheduleTimers]);

  /** Handler de actividad DOM local: throttled, ignorado durante warning. */
  const handleActivity = useCallback(() => {
    if (isWarningRef.current) return; // Actividad pasiva NO resetea en warning.
    const nowTs = now();
    if (nowTs - lastActivityAtRef.current < ACTIVITY_THROTTLE_MS) return;
    lastActivityAtRef.current = nowTs;
    writeLastActivity(nowTs);
    scheduleTimers(nowTs);
  }, [now, scheduleTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setIsWarning(false);
      setSecondsLeft(0);
      cuttingOffRef.current = false;
      return;
    }

    cuttingOffRef.current = false;

    // Init desde localStorage (anti-bypass): reconstruye el deadline desde la
    // última actividad persistida en vez de arrancar en `now()`.
    const stored = readLastActivity();
    const base = stored ?? now();
    if (stored === null) {
      writeLastActivity(base);
    }
    lastActivityAtRef.current = base;

    scheduleTimers(base);

    function onActivity() {
      handleActivity();
    }

    // Sync cross-tab: read-only, nunca vuelve a escribir en localStorage.
    function onStorage(event: StorageEvent) {
      if (event.key !== IDLE_LAST_ACTIVITY_KEY || event.newValue === null) {
        return;
      }
      const parsed = Number(event.newValue);
      if (!Number.isFinite(parsed)) return;
      lastActivityAtRef.current = parsed;
      scheduleTimers(parsed);
    }

    IDLE_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, onActivity);
    });
    window.addEventListener("storage", onStorage);

    return () => {
      IDLE_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
      window.removeEventListener("storage", onStorage);
      clearTimers();
    };
  }, [enabled, scheduleTimers, handleActivity, clearTimers, now]);

  return { isWarning, secondsLeft, stayConnected };
}
