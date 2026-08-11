import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CatalogosAdminView } from "./catalogos-admin-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TIPO_INCIDENTE = {
  id: "t1",
  codigo: "INCIDENTE",
  nombre: "Incidente",
  modulo: "SOPORTE",
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend() {
  server.use(
    http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json([TIPO_INCIDENTE])),
    http.get("/api/catalogos/prioridades", () => HttpResponse.json([])),
  );
}

describe("CatalogosAdminView", () => {
  beforeEach(() => {
    mockBackend();
    vi.mocked(toast.error).mockClear();
  });

  it.each([
    ["con catalogo:gestionar", ["catalogo:gestionar"], true],
    ["sin catalogo:gestionar", [], false],
  ])("gate de acceso a Admin > Catálogos — %s", async (_label, permisos, shouldShowContent) => {
    renderWithProviders(<CatalogosAdminView />, { user: buildUser({ permisos }) });

    if (shouldShowContent) {
      await screen.findByText("INCIDENTE");
    } else {
      expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
      expect(screen.queryByText("INCIDENTE")).not.toBeInTheDocument();
    }
  });

  it("colisión de prefijo al crear un tipo de ticket muestra el mensaje EXACTO del backend", async () => {
    const user = userEvent.setup();
    const MENSAJE_BACKEND =
      'El prefijo de numeración "INC" derivado del codigo "INCIDENCIA" ya está en uso por el tipo de ticket activo "INCIDENTE". Elegí un codigo que derive un prefijo distinto.';

    server.use(
      http.post("/api/catalogos/tipos-ticket", () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<CatalogosAdminView />, { user: buildUser({ permisos: ["catalogo:gestionar"] }) });
    await screen.findByText("INCIDENTE");

    await user.click(screen.getByRole("button", { name: /nuevo tipo/i }));
    await user.type(screen.getByLabelText(/código/i), "INCIDENCIA");
    await user.type(screen.getByLabelText(/nombre/i), "Incidencia");
    // B2: el módulo es requerido — sin elegirlo el form no dispara el POST.
    await user.selectOptions(screen.getByLabelText(/módulo/i), "SOPORTE");
    await user.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });
});
