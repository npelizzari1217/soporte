import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { AsignarPermisosControl } from "./asignar-permisos-control";
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

describe("AsignarPermisosControl (ADR-P10, sdd/matriz-permisos-por-usuario)", () => {
  it("al abrir refleja las celdas actuales y Guardar envía el set editado (reemplazo total)", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.get("/api/usuarios/u1/permisos", () =>
        HttpResponse.json({ celdas: ["TICKETS:LECTURA"], esAdministrador: false }),
      ),
      http.patch("/api/usuarios/u1/permisos", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ usuarioId: "u1", celdas: capturedBody.celdas });
      }),
    );

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    await user.click(screen.getByRole("button", { name: /permisos/i }));

    const ticketsLectura = await screen.findByRole("checkbox", { name: "TICKETS:LECTURA" });
    await waitFor(() => expect(ticketsLectura).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "COMPRAS:LECTURA" })).not.toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "COMPRAS:LECTURA" }));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() =>
      expect(capturedBody.celdas).toEqual(
        expect.arrayContaining(["TICKETS:LECTURA", "COMPRAS:LECTURA"]),
      ),
    );
  });

  it("deshabilita las acciones que el módulo no soporta en su piso (IMPRESION en ninguno, APROBACION solo en COMPRAS)", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/usuarios/u1/permisos", () =>
        HttpResponse.json({ celdas: [], esAdministrador: false }),
      ),
    );

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });
    await user.click(screen.getByRole("button", { name: /permisos/i }));
    await screen.findByRole("checkbox", { name: "TICKETS:LECTURA" });

    expect(screen.getByRole("checkbox", { name: "TICKETS:IMPRESION" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "DASHBOARD:APROBACION" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "COMPRAS:APROBACION" })).not.toBeDisabled();
  });

  it("para un ADMINISTRADOR deshabilita la edición y muestra la nota (grilla tildada completa, R2)", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/usuarios/u2/permisos", () =>
        HttpResponse.json({ celdas: [], esAdministrador: true }),
      ),
    );

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_ADMIN} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    await user.click(screen.getByRole("button", { name: /permisos/i }));

    expect(await screen.findByText(/ve toda la matriz/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
  });
});
