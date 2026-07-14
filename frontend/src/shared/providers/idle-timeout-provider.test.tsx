/**
 * Tests for IdleTimeoutProvider (idle-session-timeout, Fase 3 — provider)
 * Spec: [SPEC:frontend-auth/No-op del timer sin sesión autenticada]
 *       [SPEC:frontend-auth/Corte real de sesión al agotarse el countdown]
 *       [SPEC:frontend-auth/Sincronización de inactividad entre pestañas]
 * Task: T9
 * Design: ADR-4 (guard enabled = user != null && !isLoading),
 *         ADR-5 (handleCutoff: signalLogout → fetch logout → assign),
 *         ADR-3 (propagación cross-tab del corte vía storage 'logout')
 *
 * `useSession` y `useIdleTimeout` se mockean para aislar la lógica del provider
 * (el hook y el dialog ya están cubiertos por sus propios tests atómicos).
 * `window.location.assign` no existe en jsdom por defecto — se stubea explícitamente.
 */
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockUseSession = vi.fn();
vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

const mockUseIdleTimeout = vi.fn();
vi.mock("@/shared/hooks/use-idle-timeout", () => ({
  useIdleTimeout: (params: unknown) => mockUseIdleTimeout(params),
}));

vi.mock("@/components/shell/idle-warning-dialog", () => ({
  IdleWarningDialog: ({ open, secondsLeft }: { open: boolean; secondsLeft: number }) =>
    open ? <div data-testid="idle-warning-dialog">{secondsLeft}</div> : null,
}));

vi.mock("@/shared/auth/idle-storage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/shared/auth/idle-storage")>();
  return {
    ...actual,
    signalLogout: vi.fn(),
  };
});

import { signalLogout, IDLE_LOGOUT_KEY } from "@/shared/auth/idle-storage";
import { IdleTimeoutProvider } from "./idle-timeout-provider";

const mockSignalLogout = vi.mocked(signalLogout);

function renderProvider() {
  return render(
    <IdleTimeoutProvider>
      <div data-testid="children">contenido</div>
    </IdleTimeoutProvider>,
  );
}

describe("IdleTimeoutProvider", () => {
  const originalLocation = window.location;
  let assignMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUseSession.mockReset();
    mockUseIdleTimeout.mockReset();
    mockSignalLogout.mockReset();
    mockUseIdleTimeout.mockReturnValue({
      isWarning: false,
      secondsLeft: 0,
      stayConnected: vi.fn(),
    });

    assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, assign: assignMock },
      writable: true,
      configurable: true,
    });

    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    vi.unstubAllGlobals();
  });

  it("case 1: user === null → enabled=false pasado al hook, sin timers/listeners", () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false });
    renderProvider();

    expect(mockUseIdleTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(screen.getByTestId("children")).toBeInTheDocument();
  });

  it("case 2: isLoading === true → enabled=false sin importar user", () => {
    mockUseSession.mockReturnValue({
      user: { sub: "u1", permisos: [] },
      isLoading: true,
    });
    renderProvider();

    expect(mockUseIdleTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("case 3: user no-nulo + isLoading=false → enabled=true", () => {
    mockUseSession.mockReturnValue({
      user: { sub: "u1", permisos: [] },
      isLoading: false,
    });
    renderProvider();

    expect(mockUseIdleTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("case 4: handleCutoff hace signalLogout → fetch logout → window.location.assign, en ese orden", async () => {
    mockUseSession.mockReturnValue({
      user: { sub: "u1", permisos: [] },
      isLoading: false,
    });
    renderProvider();

    const onCutoff = mockUseIdleTimeout.mock.calls[0][0].onCutoff as () => Promise<void>;

    const callOrder: string[] = [];
    mockSignalLogout.mockImplementation(() => {
      callOrder.push("signalLogout");
    });
    fetchMock.mockImplementation(() => {
      callOrder.push("fetch");
      return Promise.resolve({ ok: true });
    });
    assignMock.mockImplementation(() => {
      callOrder.push("assign");
    });

    await onCutoff();

    expect(callOrder).toEqual(["signalLogout", "fetch", "assign"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
    expect(assignMock).toHaveBeenCalledWith("/login");
  });

  it("case 5: guard de doble disparo — invocar onCutoff dos veces ejecuta fetch/assign una sola vez", async () => {
    mockUseSession.mockReturnValue({
      user: { sub: "u1", permisos: [] },
      isLoading: false,
    });
    renderProvider();

    const onCutoff = mockUseIdleTimeout.mock.calls[0][0].onCutoff as () => Promise<void>;

    await onCutoff();
    await onCutoff();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledTimes(1);
    expect(mockSignalLogout).toHaveBeenCalledTimes(1);
  });

  it("case 6: storage event con IDLE_LOGOUT_KEY en pestaña no-originante → cleanup + assign sin volver a llamar fetch", () => {
    mockUseSession.mockReturnValue({
      user: { sub: "u1", permisos: [] },
      isLoading: false,
    });
    renderProvider();

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: IDLE_LOGOUT_KEY,
        newValue: String(Date.now()),
      }),
    );

    expect(assignMock).toHaveBeenCalledWith("/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
