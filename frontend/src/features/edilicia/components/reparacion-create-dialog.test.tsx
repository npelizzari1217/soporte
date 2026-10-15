import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ReparacionCreateDialog } from "./reparacion-create-dialog";

const PRIORIDAD_ID = "22222222-2222-2222-2222-222222222222";
const SECTOR_ID = "44444444-4444-4444-4444-444444444444";

/**
 * Alta de Edilicia con Sector (odd/ubicacion-sector-ticket, CA2): el sector es
 * opcional y la ubicación general del ticket NO se carga acá — la «Ubicación»
 * del formulario es la propia de Edilicia.
 */
describe("ReparacionCreateDialog — sector", () => {
  let bodies: Record<string, unknown>[];

  beforeEach(() => {
    bodies = [];
    server.use(
      http.get("/api/catalogos/prioridades", () =>
        HttpResponse.json([{ id: PRIORIDAD_ID, codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" }]),
      ),
      http.get("/api/sectores", () =>
        HttpResponse.json([{ id: SECTOR_ID, codigo: "PRI", nombre: "Primaria", activo: true, createdAt: "", updatedAt: "" }]),
      ),
      http.post("/api/reparaciones", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: "rep-nueva" }, { status: 201 });
      }),
    );
  });

  async function abrirYCompletar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /nueva reparación/i }));
    await user.type(await screen.findByLabelText("Título"), "Pérdida en el baño");
    await screen.findByRole("option", { name: "Alta" });
    await user.selectOptions(screen.getByLabelText("Prioridad"), PRIORIDAD_ID);
  }

  it("con un sector elegido, POST /reparaciones lo incluye junto a la ubicación propia", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReparacionCreateDialog />, { user: buildUser({ permisos: ["EDILICIA:ALTAS"] }) });

    await abrirYCompletar(user);
    await user.type(screen.getByLabelText("Ubicación"), "Baño planta baja");
    await screen.findByRole("option", { name: "Primaria" });
    await user.selectOptions(screen.getByLabelText("Sector"), SECTOR_ID);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ ubicacion: "Baño planta baja", sectorId: SECTOR_ID });
  });

  it("sin sector («Sin sector»), POST /reparaciones no lo manda", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReparacionCreateDialog />, { user: buildUser({ permisos: ["EDILICIA:ALTAS"] }) });

    await abrirYCompletar(user);
    expect(screen.getByLabelText("Sector")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty("sectorId");
  });

  it("tiene un solo campo de ubicación: la general del ticket no se carga en Edilicia", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReparacionCreateDialog />, { user: buildUser({ permisos: ["EDILICIA:ALTAS"] }) });

    await user.click(screen.getByRole("button", { name: /nueva reparación/i }));
    await screen.findByLabelText("Título");
    expect(screen.getAllByLabelText(/ubicación/i)).toHaveLength(1);
  });
});
