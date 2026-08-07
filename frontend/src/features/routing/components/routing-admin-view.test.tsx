import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { RoutingAdminView } from "./routing-admin-view";

const TECNICO = { id: "u1", nombre: "Ana", apellido: "Gómez", rol: "TECNICO" };
const TIPO = { id: "t1", codigo: "INCIDENTE", nombre: "Incidente", activo: true, createdAt: "", updatedAt: "" };

function mockBackend(routing: { usuarioId: string; tipoTicketId: string }[] = []) {
  server.use(
    http.get("/api/usuarios", () => HttpResponse.json([TECNICO])),
    http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json([TIPO])),
    http.get("/api/routing", () => HttpResponse.json(routing)),
  );
}

describe("RoutingAdminView", () => {
  beforeEach(() => mockBackend());

  it.each([
    ["con usuario:gestionar", ["usuario:gestionar"], true],
    ["sin usuario:gestionar", [], false],
  ])("gate de acceso a Admin > Routing — %s", async (_label, permisos, shouldShowContent) => {
    renderWithProviders(<RoutingAdminView />, { user: buildUser({ permisos }) });
    if (shouldShowContent) {
      await screen.findByText(/incidente/i);
    } else {
      expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
    }
  });

  it("asociar envía POST /routing/:usuarioId/:tipoTicketId con los ids seleccionados", async () => {
    const user = userEvent.setup();
    const postSpy = vi.fn();
    server.use(
      http.post("/api/routing/:usuarioId/:tipoTicketId", ({ params }) => (
        postSpy(params.usuarioId, params.tipoTicketId),
        HttpResponse.json({ usuarioId: params.usuarioId, tipoTicketId: params.tipoTicketId }, { status: 201 })
      )),
    );

    renderWithProviders(<RoutingAdminView />, { user: buildUser({ permisos: ["usuario:gestionar"] }) });
    await screen.findByText(/incidente/i);

    await user.selectOptions(screen.getByLabelText(/técnico/i), "u1");
    await user.selectOptions(screen.getByLabelText(/tipo de ticket/i), "t1");
    await user.click(screen.getByRole("button", { name: /^asociar$/i }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith("u1", "t1"));
  });

  it("lista las asociaciones existentes de GET /routing (nombres resueltos) y permite desasociar", async () => {
    const user = userEvent.setup();
    mockBackend([{ usuarioId: "u1", tipoTicketId: "t1" }]);
    const deleteSpy = vi.fn();
    server.use(
      http.delete("/api/routing/:usuarioId/:tipoTicketId", ({ params }) => (
        deleteSpy(params.usuarioId, params.tipoTicketId), new HttpResponse(null, { status: 204 })
      )),
    );

    renderWithProviders(<RoutingAdminView />, { user: buildUser({ permisos: ["usuario:gestionar"] }) });

    expect(await screen.findByText("Ana Gómez — Incidente")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /desasociar ana gómez de incidente/i }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("u1", "t1"));
  });

  it("sin asociaciones muestra estado vacío", async () => {
    mockBackend([]);
    renderWithProviders(<RoutingAdminView />, { user: buildUser({ permisos: ["usuario:gestionar"] }) });
    expect(await screen.findByText(/sin asociaciones/i)).toBeInTheDocument();
  });
});
