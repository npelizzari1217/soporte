import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { UsuariosAdminView } from "./usuarios-admin-view";
import { PoliticaTfaCard } from "./politica-tfa-card";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("PoliticaTfaCard (C1, C2)", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("muestra el estado, pide confirmación y envía solo { requiere2fa }", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    server.use(
      http.get("/api/politica-2fa", () => HttpResponse.json({ requiere2fa: false })),
      http.put("/api/politica-2fa", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ requiere2fa: true });
      }),
    );
    renderWithProviders(<PoliticaTfaCard />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    expect(await screen.findByText(/no exigida/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /exigir a todos/i }));
    // La confirmación avisa que no corta las sesiones abiertas.
    expect(await screen.findByText(/no se cierran las sesiones abiertas/i)).toBeInTheDocument();
    expect(body).toEqual({});
    await user.click(screen.getByRole("button", { name: /^confirmar$/i }));

    await waitFor(() => expect(body).toEqual({ requiere2fa: true }));
    expect(await screen.findByText(/exigida a todos/i)).toBeInTheDocument();
  });

  it("si el PUT falla, el estado queda como lo tiene el servidor", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/politica-2fa", () => HttpResponse.json({ requiere2fa: true })),
      http.put("/api/politica-2fa", () =>
        HttpResponse.json({ message: "Sin permiso" }, { status: 403 }),
      ),
    );
    renderWithProviders(<PoliticaTfaCard />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    await user.click(await screen.findByRole("button", { name: /dejar de exigir/i }));
    await user.click(await screen.findByRole("button", { name: /^confirmar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByText(/exigida a todos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dejar de exigir/i })).toBeInTheDocument();
  });

  it("solo se ve para quien administra el cliente", async () => {
    server.use(
      http.get("/api/usuarios", () => HttpResponse.json([])),
      http.get("/api/roles", () => HttpResponse.json([])),
      http.get("/api/politica-2fa", () => HttpResponse.json({ requiere2fa: false })),
    );
    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ rol: "TECNICO" }) });
    expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
    expect(screen.queryByText(/verificación en dos pasos/i)).not.toBeInTheDocument();
  });
});
