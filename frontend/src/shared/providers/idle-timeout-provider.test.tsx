import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { IDLE_LOGOUT_KEY } from "@/shared/auth/idle-storage";
import type { JwtPayload } from "@/shared/api/types";

// Spec: PR11 — IdleTimeoutProvider: no-op sin sesión, corte real llama a
// /api/auth/logout y navega a /login?motivo=inactividad, sincroniza el corte entre pestañas.

// El guard del corte (`shared/auth/cortar-sesion`) es de módulo y no se reinicia: cada test
// carga los providers de cero.
let IdleTimeoutProvider: typeof import("./idle-timeout-provider").IdleTimeoutProvider;
let SessionProvider: typeof import("./session-provider").SessionProvider;

const PAYLOAD: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "USUARIO",
  permisos: [],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
  modulos: [],
  nombre: "Juan",
  apellido: "Pérez",
};

describe("IdleTimeoutProvider", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.localStorage.clear();
    vi.resetModules();
    ({ IdleTimeoutProvider } = await import("./idle-timeout-provider"));
    ({ SessionProvider } = await import("./session-provider"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no session (user=null) → no idle warning ever shows, even after a long time", async () => {
    render(
      <SessionProvider>
        <IdleTimeoutProvider>
          <div>content</div>
        </IdleTimeoutProvider>
      </SessionProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(20 * 60 * 1000); // 20 min, way past the 15min threshold
    });

    expect(screen.queryByText(/sesión está por expirar/i)).not.toBeInTheDocument();
  });

  it("authenticated session, idle past IDLE_TIMEOUT_MS → calls POST /api/auth/logout then navigates to /login?motivo=inactividad", async () => {
    let logoutCalled = false;
    server.use(
      http.post("/api/auth/logout", () => {
        logoutCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    const assignSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignSpy });

    render(
      <SessionProvider initialUser={PAYLOAD}>
        <IdleTimeoutProvider>
          <div>content</div>
        </IdleTimeoutProvider>
      </SessionProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(900_000); // IDLE_TIMEOUT_MS default (15min)
    });

    await waitFor(() => expect(logoutCalled).toBe(true));
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/login?motivo=inactividad"));
    expect(assignSpy).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(IDLE_LOGOUT_KEY)).toMatch(/^inactividad:\d+$/);

    vi.unstubAllGlobals();
  });

  it("cross-tab cutoff signal without a reason (legacy value) → navigates to /login WITHOUT calling logout again", async () => {
    let logoutCallCount = 0;
    server.use(
      http.post("/api/auth/logout", () => {
        logoutCallCount += 1;
        return HttpResponse.json({ ok: true });
      }),
    );

    const assignSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignSpy });

    render(
      <SessionProvider initialUser={PAYLOAD}>
        <IdleTimeoutProvider>
          <div>content</div>
        </IdleTimeoutProvider>
      </SessionProvider>,
    );

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: IDLE_LOGOUT_KEY, newValue: String(Date.now()) }),
      );
    });

    expect(assignSpy).toHaveBeenCalledWith("/login");
    expect(logoutCallCount).toBe(0);

    vi.unstubAllGlobals();
  });

  it.each([
    ["inactividad", "/login?motivo=inactividad"],
    ["sesion-vencida", "/login?motivo=sesion-vencida"],
  ])("cross-tab cutoff signal with reason %s → navigates to %s, without calling logout again", async (motivo, destino) => {
    let logoutCallCount = 0;
    server.use(
      http.post("/api/auth/logout", () => {
        logoutCallCount += 1;
        return HttpResponse.json({ ok: true });
      }),
    );

    const assignSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignSpy });

    render(
      <SessionProvider initialUser={PAYLOAD}>
        <IdleTimeoutProvider>
          <div>content</div>
        </IdleTimeoutProvider>
      </SessionProvider>,
    );

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: IDLE_LOGOUT_KEY, newValue: `${motivo}:${Date.now()}` }),
      );
    });

    expect(assignSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledWith(destino);
    expect(logoutCallCount).toBe(0);

    vi.unstubAllGlobals();
  });
});
