import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CiclosAdminView } from "./ciclos-admin-view";

const CICLO_2026_1 = {
  id: "c1",
  nombre: "2026-S1",
  fechaInicio: "2026-01-01",
  fechaFin: "2026-06-30",
  activo: false,
  cicloVigenteId: "cv1",
};

const CICLO_VIGENTE_1_ID = "11111111-1111-1111-1111-111111111111";
const CICLO_VIGENTE_1 = {
  id: CICLO_VIGENTE_1_ID,
  nombre: "2026-S1 (master)",
  fechaInicio: "2026-01-01",
  fechaFin: "2026-06-30",
  activo: true,
};

function mockBackend(ciclos = [CICLO_2026_1], cicloActivoId: string | null = null) {
  server.use(
    http.get("/api/ciclos", () => HttpResponse.json({ ciclos, cicloActivoId })),
    http.get("/api/ciclos-vigentes", () => HttpResponse.json([CICLO_VIGENTE_1])),
  );
}

describe("CiclosAdminView", () => {
  beforeEach(() => mockBackend());

  it.each([
    ["con ciclo:gestionar", ["ciclo:gestionar"], true],
    ["sin ciclo:gestionar", [], false],
  ])("gate de acceso a Admin > Ciclos — %s", async (_label, permisos, shouldShowContent) => {
    renderWithProviders(<CiclosAdminView />, { user: buildUser({ permisos }) });

    if (shouldShowContent) {
      await screen.findByText("2026-S1");
    } else {
      expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
      expect(screen.queryByText("2026-S1")).not.toBeInTheDocument();
    }
  });

  it("activar un ciclo inactivo requiere confirmación antes del PATCH", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.fn();
    server.use(
      http.patch("/api/ciclos/:id/activar", ({ params }) => (
        patchSpy(params.id), HttpResponse.json({ ...CICLO_2026_1, activo: true })
      )),
    );

    renderWithProviders(<CiclosAdminView />, { user: buildUser({ permisos: ["ciclo:gestionar"] }) });
    await screen.findByText("2026-S1");

    await user.click(screen.getByRole("button", { name: /activar/i }));
    expect(patchSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith("c1"));
  });

  it("adoptar ciclo usa un selector poblado por GET /ciclos-vigentes (catálogo master), no un UUID de texto libre", async () => {
    const user = userEvent.setup();
    let postBody: unknown = null;
    server.use(
      http.post("/api/ciclos", async ({ request }) => {
        postBody = await request.json();
        return HttpResponse.json({ ...CICLO_2026_1, id: "c2" });
      }),
    );

    renderWithProviders(<CiclosAdminView />, { user: buildUser({ permisos: ["ciclo:gestionar"] }) });
    await screen.findByText("2026-S1");

    await user.selectOptions(screen.getByLabelText(/adoptar ciclo/i), CICLO_VIGENTE_1_ID);
    await user.click(screen.getByRole("button", { name: /^adoptar$/i }));

    await waitFor(() => expect(postBody).toEqual({ cicloVigenteId: CICLO_VIGENTE_1_ID }));
  });
});
