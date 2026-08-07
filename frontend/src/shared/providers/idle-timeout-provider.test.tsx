import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { IdleTimeoutProvider } from "./idle-timeout-provider";
import { SessionProvider } from "./session-provider";
import { IDLE_LOGOUT_KEY } from "@/shared/auth/idle-storage";
import type { JwtPayload } from "@/shared/api/types";

// Spec: PR11 — IdleTimeoutProvider: no-op sin sesión, corte real llama a
// /api/auth/logout y navega a /login, sincroniza el corte entre pestañas.

const PAYLOAD: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "USUARIO",
  permisos: [],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
};

describe("IdleTimeoutProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.localStorage.clear();
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

  it("authenticated session, idle past IDLE_TIMEOUT_MS → calls POST /api/auth/logout then navigates to /login", async () => {
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
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/login"));

    vi.unstubAllGlobals();
  });

  it("cross-tab cutoff signal (storage event on IDLE_LOGOUT_KEY) → navigates to /login WITHOUT calling logout again", async () => {
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
});
