import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { AsignarModulosControl } from "./asignar-modulos-control";
import type { UsuarioTenant } from "../types";

const USUARIO_TECNICO: UsuarioTenant = {
  id: "u1",
  nombre: "Ada",
  apellido: "Tec",
  rol: "TECNICO",
  email: "ada@tenant.com",
};

const USUARIO_ADMIN: UsuarioTenant = {
  id: "u2",
  nombre: "Bruno",
  apellido: "Admin",
  rol: "ADMINISTRADOR",
  email: "bruno@tenant.com",
};

describe("AsignarModulosControl (feature 5.2 CAPA 4)", () => {
  it("al abrir refleja los módulos actuales y Guardar envía el set editado", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.get("/api/usuarios/u1/modulos", () => HttpResponse.json({ modulos: ["TICKETS"] })),
      http.patch("/api/usuarios/u1/modulos", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ usuarioId: "u1", modulos: capturedBody.modulos });
      }),
    );

    renderWithProviders(<AsignarModulosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ permisos: ["usuario:gestionar", "rol:asignar"] }),
    });

    await user.click(screen.getByRole("button", { name: /módulos/i }));

    // Refleja el estado actual: TICKETS tildado (renombrado desde SOPORTE, WU-7.2), COMPRAS no.
    const tickets = await screen.findByRole("checkbox", { name: "TICKETS" });
    await waitFor(() => expect(tickets).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "COMPRAS" })).not.toBeChecked();

    // Edita el set: agrega COMPRAS y guarda.
    await user.click(screen.getByRole("checkbox", { name: "COMPRAS" }));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.modulos).toEqual(["TICKETS", "COMPRAS"]));
  });

  it("para un ADMINISTRADOR deshabilita la edición y muestra la nota", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AsignarModulosControl usuario={USUARIO_ADMIN} />, {
      user: buildUser({ permisos: ["usuario:gestionar", "rol:asignar"] }),
    });

    await user.click(screen.getByRole("button", { name: /módulos/i }));

    expect(await screen.findByText(/ven todos los módulos/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
  });
});
