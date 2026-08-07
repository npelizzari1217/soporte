import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { KbCreateView } from "./kb-create-view";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

describe("KbCreateView", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("sin kb:gestionar muestra ErrorState en vez del form (defensa en profundidad, ADR-4)", () => {
    renderWithProviders(<KbCreateView />, { user: buildUser({ permisos: [] }) });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByLabelText(/título/i)).not.toBeInTheDocument();
  });

  it("con kb:gestionar: crea el artículo y navega al detalle", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/kb", () => HttpResponse.json({ id: "nuevo-a1" }, { status: 201 })),
    );
    renderWithProviders(<KbCreateView />, { user: buildUser({ permisos: ["kb:gestionar"] }) });

    await user.type(screen.getByLabelText(/título/i), "Nuevo artículo");
    await user.type(screen.getByLabelText(/contenido/i), "Contenido del artículo");
    await user.click(screen.getByRole("button", { name: /guardar|crear/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/kb/nuevo-a1"));
  });
});
