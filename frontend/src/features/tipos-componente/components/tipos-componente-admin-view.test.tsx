import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TiposComponenteAdminView } from "./tipos-componente-admin-view";

const TIPO_ACTIVO = { id: "t1", codigo: "MONITOR", nombre: "Monitor", activo: true };
const TIPO_INACTIVO = { id: "t2", codigo: "TECLADO", nombre: "Teclado", activo: false };

function mockBackend(tipos: unknown[] = [TIPO_ACTIVO]) {
  server.use(http.get("/api/tipos-componente/admin", () => HttpResponse.json(tipos)));
}

describe("TiposComponenteAdminView (PR5, sdd/tipos-componente-master)", () => {
  beforeEach(() => mockBackend());

  it.each([
    ["ROOT (is_global_admin)", true, [], true],
    ["ADMINISTRADOR de tenant con catalogo:gestionar pero sin is_global_admin", false, ["catalogo:gestionar"], false],
  ])(
    "gate de acceso es por is_global_admin, NUNCA por permisos — %s",
    async (_label, isGlobalAdmin, permisos, shouldShowContent) => {
      renderWithProviders(<TiposComponenteAdminView />, { user: buildUser({ permisos, is_global_admin: isGlobalAdmin }) });

      if (shouldShowContent) {
        await screen.findByText("Monitor");
      } else {
        expect(await screen.findByText(/solo.*root/i)).toBeInTheDocument();
        expect(screen.queryByText("Monitor")).not.toBeInTheDocument();
      }
    },
  );

  it("lista un tipo inactivo con badge Inactivo", async () => {
    mockBackend([TIPO_ACTIVO, TIPO_INACTIVO]);
    renderWithProviders(<TiposComponenteAdminView />, { user: buildUser({ is_global_admin: true }) });

    await screen.findByText("Teclado");
    const filaTeclado = screen.getByText("Teclado").closest("div");
    expect(filaTeclado).not.toBeNull();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
  });

  it("crear tipo de componente envía POST /tipos-componente con {codigo, nombre}", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    server.use(
      http.post("/api/tipos-componente", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "t3", codigo: "MOUSE", nombre: "Mouse", activo: true }, { status: 201 });
      }),
    );

    renderWithProviders(<TiposComponenteAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Monitor");

    await user.type(screen.getByLabelText(/^código$/i), "MOUSE");
    await user.type(screen.getByLabelText(/^nombre$/i), "Mouse");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturedBody).toEqual({ codigo: "MOUSE", nombre: "Mouse" }));
  });

  it("desactivar un tipo activo hace POST /tipos-componente/:id/desactivar e invalida la lista", async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post("/api/tipos-componente/:id/desactivar", ({ params }) => {
        called = params.id === "t1";
        return HttpResponse.json({ ...TIPO_ACTIVO, activo: false });
      }),
    );

    renderWithProviders(<TiposComponenteAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Monitor");

    await user.click(screen.getByRole("button", { name: /desactivar/i }));

    await waitFor(() => expect(called).toBe(true));
  });

  it("activar un tipo inactivo hace POST /tipos-componente/:id/activar e invalida la lista", async () => {
    mockBackend([TIPO_INACTIVO]);
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post("/api/tipos-componente/:id/activar", ({ params }) => {
        called = params.id === "t2";
        return HttpResponse.json({ ...TIPO_INACTIVO, activo: true });
      }),
    );

    renderWithProviders(<TiposComponenteAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Teclado");

    await user.click(screen.getByRole("button", { name: /^activar$/i }));

    await waitFor(() => expect(called).toBe(true));
  });

  it("renombrar un tipo envía PATCH /tipos-componente/:id con solo {nombre} (código inmutable)", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    let capturedUrl = "";
    server.use(
      http.patch("/api/tipos-componente/:id", async ({ request, params }) => {
        capturedUrl = String(params.id);
        capturedBody = await request.json();
        return HttpResponse.json({ ...TIPO_ACTIVO, nombre: "Monitor LED" });
      }),
    );

    renderWithProviders(<TiposComponenteAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Monitor");

    await user.click(screen.getByRole("button", { name: /editar/i }));
    const nombreInput = await screen.findByLabelText(/nombre de monitor/i);
    await user.clear(nombreInput);
    await user.type(nombreInput, "Monitor LED");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedUrl).toBe("t1"));
    expect(capturedBody).toEqual({ nombre: "Monitor LED" });
  });
});
