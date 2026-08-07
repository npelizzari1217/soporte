import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { KbEditView } from "./kb-edit-view";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

const ARTICULO = {
  id: "a1",
  titulo: "Título original",
  contenido: "Contenido original",
  tipoTicketId: null,
  autorId: "u1",
  visibleParaSolicitante: false,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("KbEditView", () => {
  beforeEach(() => {
    pushMock.mockClear();
    server.use(http.get("/api/kb/a1", () => HttpResponse.json(ARTICULO)));
  });

  it("sin kb:gestionar muestra ErrorState en vez del form", async () => {
    renderWithProviders(<KbEditView articuloId="a1" />, { user: buildUser({ permisos: [] }) });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("con kb:gestionar: precarga los valores actuales y edita → navega al detalle", async () => {
    const user = userEvent.setup();
    server.use(http.patch("/api/kb/a1", () => HttpResponse.json({ ...ARTICULO, titulo: "Editado" })));
    renderWithProviders(<KbEditView articuloId="a1" />, { user: buildUser({ permisos: ["kb:gestionar"] }) });

    const tituloInput = await screen.findByLabelText(/título/i);
    expect(tituloInput).toHaveValue("Título original");

    await user.clear(tituloInput);
    await user.type(tituloInput, "Editado");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/kb/a1"));
  });
});
