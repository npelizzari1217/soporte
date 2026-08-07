import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { SlaAdminView } from "./sla-admin-view";

const PRIORIDAD_CRITICA = {
  id: "p1",
  codigo: "CRITICA",
  nombre: "Crítica",
  color: null,
  orden: 1,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const SLA_CRITICA = {
  id: "s1",
  prioridadId: "p1",
  horas: 4,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend() {
  server.use(
    http.get("/api/sla/config", () => HttpResponse.json([SLA_CRITICA])),
    http.get("/api/catalogos/prioridades", () => HttpResponse.json([PRIORIDAD_CRITICA])),
  );
}

describe("SlaAdminView", () => {
  beforeEach(() => mockBackend());

  it.each([
    ["con catalogo:gestionar", ["catalogo:gestionar"], true],
    ["sin catalogo:gestionar", [], false],
  ])("gate de acceso a Admin > SLA — %s", async (_label, permisos, shouldShowContent) => {
    renderWithProviders(<SlaAdminView />, { user: buildUser({ permisos }) });

    if (shouldShowContent) {
      await screen.findByText("Crítica");
    } else {
      expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
      expect(screen.queryByText("Crítica")).not.toBeInTheDocument();
    }
  });

  it("horas <= 0 muestra error de validación cliente-side y NO dispara el PATCH", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.fn();
    server.use(http.patch("/api/sla/config/:id", () => (patchSpy(), HttpResponse.json(SLA_CRITICA))));

    renderWithProviders(<SlaAdminView />, { user: buildUser({ permisos: ["catalogo:gestionar"] }) });
    await screen.findByText("Crítica");

    const input = screen.getByLabelText(/horas.*crítica/i);
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/mayor a 0/i)).toBeInTheDocument();
    await waitFor(() => expect(patchSpy).not.toHaveBeenCalled());
  });
});
