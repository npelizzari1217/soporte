import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CiclosVigentesAdminView } from "./ciclos-vigentes-admin-view";

const CICLO_VIGENTE = {
  id: "cv1",
  nombre: "Ciclo 2026",
  fechaInicio: "2026-01-01",
  fechaFin: "2026-12-31",
  activo: true,
  eliminado: false,
};

function mockBackend() {
  server.use(http.get("/api/ciclos-vigentes/admin", () => HttpResponse.json([CICLO_VIGENTE])));
}

describe("CiclosVigentesAdminView (sdd/ciclos-abm-root)", () => {
  beforeEach(() => mockBackend());

  it.each([
    ["ROOT (is_global_admin)", true, [], true],
    ["ADMINISTRADOR de tenant con ciclo:gestionar pero sin is_global_admin", false, ["ciclo:gestionar"], false],
  ])("gate de acceso a /ciclos es por is_global_admin, NUNCA por permisos — %s", async (_label, isGlobalAdmin, permisos, shouldShowContent) => {
    renderWithProviders(<CiclosVigentesAdminView />, { user: buildUser({ permisos, is_global_admin: isGlobalAdmin }) });

    if (shouldShowContent) {
      await screen.findByText("Ciclo 2026");
    } else {
      expect(await screen.findByText(/solo.*root/i)).toBeInTheDocument();
      expect(screen.queryByText("Ciclo 2026")).not.toBeInTheDocument();
    }
  });

  it("crear ciclo envía el DTO correcto a POST /ciclos-vigentes", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/ciclos-vigentes", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { id: "cv2", nombre: "Ciclo 2027", fechaInicio: "2027-01-01", fechaFin: "2027-12-31", activo: true },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<CiclosVigentesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Ciclo 2026");

    await user.click(screen.getByRole("button", { name: /nuevo ciclo/i }));
    await user.type(screen.getByLabelText(/^nombre$/i), "Ciclo 2027");
    await user.type(screen.getByLabelText(/fecha de inicio/i), "2027-01-01");
    await user.type(screen.getByLabelText(/fecha de fin/i), "2027-12-31");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({ nombre: "Ciclo 2027", fechaInicio: "2027-01-01", fechaFin: "2027-12-31" }),
    );
  });

  it("editar ciclo confirma con PATCH /ciclos-vigentes/:id", async () => {
    const user = userEvent.setup();
    let patchCalled = false;
    server.use(
      http.patch("/api/ciclos-vigentes/cv1", async ({ request }) => {
        patchCalled = true;
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...CICLO_VIGENTE, ...body });
      }),
    );

    renderWithProviders(<CiclosVigentesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Ciclo 2026");

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const nombreInput = await screen.findByLabelText(/^nombre$/i);
    await user.clear(nombreInput);
    await user.type(nombreInput, "Ciclo 2026 renombrado");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(patchCalled).toBe(true));
  });

  it("eliminar (sdd/ciclos-abm-root) confirma en el diálogo y dispara el DELETE", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;
    server.use(
      http.delete("/api/ciclos-vigentes/cv1", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<CiclosVigentesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Ciclo 2026");

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    const confirmButtons = await screen.findAllByRole("button", { name: "Eliminar" });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(deleteCalled).toBe(true));
  });

  it("muestra fechaInicio/fechaFin en formato dd/mm/yyyy, nunca el ISO crudo (regresión render-fechas-frontend)", async () => {
    renderWithProviders(<CiclosVigentesAdminView />, { user: buildUser({ is_global_admin: true }) });

    await screen.findByText("Ciclo 2026");
    expect(screen.getByText("01/01/2026")).toBeInTheDocument();
    expect(screen.getByText("31/12/2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-01-01")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-12-31")).not.toBeInTheDocument();
  });

  it("con fechaInicio en el primer día del año, el día no se corre a diciembre del año anterior", async () => {
    server.use(
      http.get("/api/ciclos-vigentes/admin", () =>
        HttpResponse.json([{ ...CICLO_VIGENTE, id: "cv-anio-nuevo", nombre: "Ciclo año nuevo", fechaInicio: "2026-01-01" }]),
      ),
    );

    renderWithProviders(<CiclosVigentesAdminView />, { user: buildUser({ is_global_admin: true }) });

    await screen.findByText("Ciclo año nuevo");
    expect(screen.getByText("01/01/2026")).toBeInTheDocument();
    expect(screen.queryByText("31/12/2025")).not.toBeInTheDocument();
  });

  /**
   * Test de CARACTERIZACIÓN, no de regresión (render-fechas-frontend, WORK
   * UNIT 5): el inventario original sospechaba que `CicloVigenteFormDialog`
   * precargaba el `<input type="date">` con un ISO datetime completo, que
   * HTML5 descarta en silencio dejando el campo vacío al editar. Se corrió
   * este test contra el código tal como estaba (sin tocar
   * `ciclo-vigente-form-dialog.tsx`) y dio VERDE: `CicloVigenteAdmin.fechaInicio`
   * y `fechaFin` ya llegan como `"YYYY-MM-DD"` porque los controllers backend
   * (`ciclos.controller.ts`, `ciclos-vigentes.controller.ts`) aplican
   * `toDateOnly` antes de responder — un formato que `<input type="date">`
   * acepta sin descartarlo. No hubo defecto que corregir; el diagnóstico
   * original asumía ISO datetime completo, y `toDateOnly` lo desmiente.
   */
  it("al editar, fechaInicio/fechaFin aparecen precargadas en el formulario (caracterización render-fechas-frontend)", async () => {
    const user = userEvent.setup();

    renderWithProviders(<CiclosVigentesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Ciclo 2026");

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(await screen.findByLabelText(/fecha de inicio/i)).toHaveValue("2026-01-01");
    expect(screen.getByLabelText(/fecha de fin/i)).toHaveValue("2026-12-31");
  });

  it("un ciclo ya eliminado deshabilita Editar y Eliminar", async () => {
    server.use(
      http.get("/api/ciclos-vigentes/admin", () =>
        HttpResponse.json([{ ...CICLO_VIGENTE, id: "cv-del", nombre: "Ciclo baja", eliminado: true }]),
      ),
    );

    renderWithProviders(<CiclosVigentesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Ciclo baja");

    expect(screen.getByRole("button", { name: "Editar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();
  });
});
