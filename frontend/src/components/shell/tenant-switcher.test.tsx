import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../test/msw/server";
import { TenantSwitcher } from "./tenant-switcher";
import { SessionProvider } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

// Spec: [R28] Switcher en el shell — desplegable con membresias[] del token,
// selecciona → POST /api/auth/switch → actualiza sesión sin reload.

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const PAYLOAD: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: [],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [
    { cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" },
    { cliente_id: "c2", nombre: "Cliente Dos", rol: "TECNICO" },
  ],
};

function renderSwitcher(user: JwtPayload | null = PAYLOAD) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider initialUser={user}>
        <TenantSwitcher />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("TenantSwitcher", () => {
  beforeEach(() => {
    refreshMock.mockClear();
  });

  it("no user → renders nothing", () => {
    const { container } = renderSwitcher(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current cliente_nombre as the trigger label", () => {
    renderSwitcher();
    expect(screen.getByRole("button", { name: /cliente uno/i })).toBeInTheDocument();
  });

  it("opening the menu lists every membresía from the token", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: /cliente uno/i }));

    expect(await screen.findByRole("menuitem", { name: /cliente dos/i })).toBeInTheDocument();
  });

  it("selecting a different membresía calls POST /api/auth/switch with { clienteId } and refreshes the router", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("/api/auth/switch", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          user: { ...PAYLOAD, cliente_id: "c2", cliente_nombre: "Cliente Dos" },
        });
      }),
    );

    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: /cliente uno/i }));
    await user.click(await screen.findByRole("menuitem", { name: /cliente dos/i }));

    await waitFor(() => expect(capturedBody).toEqual({ clienteId: "c2" }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });
});
