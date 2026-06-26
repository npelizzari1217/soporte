/**
 * T17 — SessionProvider + use-session — RED phase
 *
 * Test cases per tasks.md T17:
 * 1. Without initialUser: isLoading=true, user=null initially
 * 2. With initialUser: isLoading=false immediately, user matches
 * 3. can("ticket:crear") → true; can("compra:aprobar") → false
 * 4. Gated element NOT in DOM when can() is false
 * 5. isLoading=true → gated element not rendered (no FOUC of authz)
 *
 * Spec: [SPEC:frontend-ui-states/authz-ui SessionProvider], [SPEC:frontend-ui-states/authz-ui no FOUC]
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SessionProvider } from "./session-provider";
import { useSession } from "@/shared/hooks/use-session";
import type { JwtPayload } from "@/shared/api/types";

const ADMIN_USER: JwtPayload = {
  sub: "1",
  email: "x@y.com",
  roles: ["ADMIN"],
  permisos: ["ticket:crear"],
  cliente_id: "c1",
};

// ── helper components ──────────────────────────────────────────────────────

function LoadingConsumer() {
  const { user, isLoading } = useSession();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user ? user.email : "null"}</span>
    </div>
  );
}

function CanConsumer() {
  const { can } = useSession();
  return (
    <div>
      <span data-testid="can-ticket">{String(can("ticket:crear"))}</span>
      <span data-testid="can-compra">{String(can("compra:aprobar"))}</span>
    </div>
  );
}

function GatedByPermiso({ permiso }: { permiso: string }) {
  const { can } = useSession();
  return <div>{can(permiso) && <button>Acción protegida</button>}</div>;
}

function GatedByLoading({ permiso }: { permiso: string }) {
  const { isLoading, can } = useSession();
  return <div>{!isLoading && can(permiso) && <button>Acción protegida</button>}</div>;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("SessionProvider", () => {
  it("without initialUser: isLoading=true, user=null initially", () => {
    render(
      <SessionProvider>
        <LoadingConsumer />
      </SessionProvider>,
    );
    expect(screen.getByTestId("loading").textContent).toBe("true");
    expect(screen.getByTestId("user").textContent).toBe("null");
  });

  it("with initialUser: isLoading=false immediately, user matches", () => {
    render(
      <SessionProvider initialUser={ADMIN_USER}>
        <LoadingConsumer />
      </SessionProvider>,
    );
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("x@y.com");
  });

  it('can("ticket:crear") → true; can("compra:aprobar") → false', () => {
    render(
      <SessionProvider initialUser={ADMIN_USER}>
        <CanConsumer />
      </SessionProvider>,
    );
    expect(screen.getByTestId("can-ticket").textContent).toBe("true");
    expect(screen.getByTestId("can-compra").textContent).toBe("false");
  });

  it("gated element NOT in DOM when can() is false", () => {
    render(
      <SessionProvider initialUser={ADMIN_USER}>
        <GatedByPermiso permiso="compra:aprobar" />
      </SessionProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("isLoading=true → gated element not rendered (no FOUC of authz)", () => {
    // Without initialUser, isLoading=true — even if can() were somehow true,
    // the guarded element must not appear until loading resolves.
    render(
      <SessionProvider>
        <GatedByLoading permiso="ticket:crear" />
      </SessionProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
