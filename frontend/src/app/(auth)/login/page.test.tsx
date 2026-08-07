import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import LoginPage from "./page";

// Spec: [R23] BFF login route — página completa: 1 vs varias membresías.

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("single membership → submitting valid credentials redirects to /", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ user: { sub: "1", cliente_id: "c1", rol: "USUARIO", permisos: [], is_global_admin: false, cliente_nombre: "Cliente Uno", membresias: [] } }),
      ),
    );

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("multiple memberships → shows the cliente selector, picking one redirects to /", async () => {
    server.use(
      http.post("/api/auth/login", async ({ request }) => {
        const body = (await request.json()) as { clienteId?: string };
        if (body.clienteId === "c2") {
          return HttpResponse.json({ user: { sub: "1", cliente_id: "c2", rol: "TECNICO", permisos: [], is_global_admin: false, cliente_nombre: "Cliente Dos", membresias: [] } });
        }
        return HttpResponse.json({
          needsClienteSelection: true,
          membresias: [
            { cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" },
            { cliente_id: "c2", nombre: "Cliente Dos", rol: "TECNICO" },
          ],
        });
      }),
    );

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "multi@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByText("Cliente Uno")).toBeInTheDocument();
    expect(screen.getByText("Cliente Dos")).toBeInTheDocument();
    // The credentials form must no longer be visible during selection.
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cliente dos/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });
});
