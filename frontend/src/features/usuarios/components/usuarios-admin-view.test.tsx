import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { UsuariosAdminView } from "./usuarios-admin-view";

const USUARIO_JUANA = { id: "u1", nombre: "Juana", apellido: "Pérez", rol: "TECNICO", email: "juana@tenant.com" };
const USUARIO_TECNICO_SIN_EMAIL = { id: "u2", nombre: "Beto", apellido: "Gómez", rol: "TECNICO" };

const ROLES = [
  { id: "r1", codigo: "USUARIO", nombre: "Usuario", descripcion: null },
  { id: "r2", codigo: "COLABORADOR", nombre: "Colaborador", descripcion: null },
  { id: "r3", codigo: "TECNICO", nombre: "Técnico de soporte", descripcion: null },
  { id: "r4", codigo: "ADMINISTRADOR", nombre: "Administrador", descripcion: null },
];

function mockBackend(usuarios: unknown[] = [USUARIO_JUANA]) {
  server.use(
    http.get("/api/usuarios", () => HttpResponse.json(usuarios)),
    http.get("/api/roles", () => HttpResponse.json(ROLES)),
  );
}

// ADR-P5 (sdd/matriz-permisos-por-usuario): el ABM de usuarios es
// ADMINISTRADOR-o-ROOT exclusivo — un solo gate (`esAdminCliente`), sin el
// AND de dos permisos viejos (`usuario:gestionar`+`rol:asignar`).
describe("UsuariosAdminView", () => {
  beforeEach(() => mockBackend());

  it.each([
    ["ADMINISTRADOR", "ADMINISTRADOR", true],
    ["TECNICO (no admin, no root)", "TECNICO", false],
  ])("gate de acceso a Admin > Usuarios — %s", async (_label, rol, shouldShowContent) => {
    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ rol }) });

    if (shouldShowContent) {
      await screen.findByText("Juana Pérez");
    } else {
      expect(await screen.findByText(/no tiene permiso/i)).toBeInTheDocument();
      expect(screen.queryByText("Juana Pérez")).not.toBeInTheDocument();
    }
  });

  it("ADMINISTRADOR ve la lista Y las acciones de mutación (Nuevo usuario, cambiar rol, permisos)", async () => {
    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("Juana Pérez");
    expect(screen.getByRole("button", { name: /nuevo usuario/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /permisos/i })).toBeInTheDocument();
  });

  it("R10: un usuario SIN email en la respuesta (TECNICO viendo GET /usuarios) se muestra sin romper", async () => {
    mockBackend([USUARIO_TECNICO_SIN_EMAIL]);
    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("Beto Gómez");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("crear usuario NUNCA envía clienteId — aislamiento tenant estricto (spec §5)", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/usuarios", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { usuarioId: "u2", email: "nuevo@tenant.com", nombre: "Nuevo", apellido: "Usuario", rol: "TECNICO", membresiaId: "m1", activo: true },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("Juana Pérez");

    await user.click(screen.getByRole("button", { name: /nuevo usuario/i }));
    await user.type(screen.getByLabelText(/email/i), "nuevo@tenant.com");
    await user.type(screen.getByLabelText(/^nombre$/i), "Nuevo");
    await user.type(screen.getByLabelText(/^apellido$/i), "Usuario");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await screen.findByRole("option", { name: "Técnico de soporte" });
    await user.selectOptions(screen.getByLabelText("Rol"), "TECNICO");
    await user.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() =>
      expect(Object.keys(capturedBody).sort()).toEqual(["apellido", "email", "nombre", "password", "rolCodigo"].sort()),
    );
    expect(capturedBody.clienteId).toBeUndefined();
    expect(capturedBody.rolCodigo).toBe("TECNICO");
  });

  it("selector de rol se puebla desde GET /roles (nombre legible, no el código crudo hardcodeado)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("Juana Pérez");

    await user.click(screen.getByRole("button", { name: /nuevo usuario/i }));
    expect(await screen.findByRole("option", { name: "Técnico de soporte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Administrador" })).toBeInTheDocument();
  });
});

describe("UsuariosAdminView — botón Horarios (odd/tasks/pedidos-2026-10-26.md, S6)", () => {
  const COLABORADORA = { id: "u3", nombre: "Carla", apellido: "Ruiz", rol: "COLABORADOR", email: "carla@tenant.com" };
  const SOLICITANTE = { id: "u4", nombre: "Dora", apellido: "Pedido", rol: "USUARIO", email: "dora@tenant.com" };
  const ADMIN = { id: "u5", nombre: "Ema", apellido: "Admin", rol: "ADMINISTRADOR", email: "ema@tenant.com" };

  function semana(apertura: number | null, cierre: number | null) {
    return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) =>
      diaSemana >= 1 && diaSemana <= 5
        ? { diaSemana, aperturaMinuto: apertura, cierreMinuto: cierre }
        : { diaSemana, aperturaMinuto: null, cierreMinuto: null },
    );
  }

  it("aparece en técnicos y colaboradores, y no en el resto de los roles", async () => {
    mockBackend([USUARIO_JUANA, COLABORADORA, SOLICITANTE, ADMIN]);
    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    await screen.findByText("Juana Pérez");
    expect(screen.getByRole("button", { name: "Horarios de Juana Pérez" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Horarios de Carla Ruiz" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Horarios de Dora Pedido" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Horarios de Ema Admin" })).not.toBeInTheDocument();
  });

  it("abre el horario de ese usuario: si no tiene propio, avisa que usa el del cliente", async () => {
    mockBackend([USUARIO_JUANA]);
    const pedidos: string[] = [];
    server.use(
      http.get("/api/horario-laboral/usuarios/:usuarioId", ({ params }) => {
        pedidos.push(String(params.usuarioId));
        return HttpResponse.json({ usuarioId: "u1", origen: "CLIENTE", dias: semana(540, 1080) });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    await user.click(await screen.findByRole("button", { name: "Horarios de Juana Pérez" }));

    const dialogo = await screen.findByRole("dialog", { name: "Horario de Juana Pérez" });
    expect(await within(dialogo).findByText(/Juana Pérez usa el horario laboral del cliente\./)).toBeInTheDocument();
    expect(within(dialogo).getAllByLabelText("Apertura")[1]).toHaveValue("09:00");
    expect(within(dialogo).getByRole("button", { name: "Usar horario propio" })).toBeInTheDocument();
    expect(pedidos).toEqual(["u1"]);
  });

  it("cerrar y volver a abrir descarta la edición sin guardar", async () => {
    mockBackend([USUARIO_JUANA]);
    server.use(
      http.get("/api/horario-laboral/usuarios/:usuarioId", () =>
        HttpResponse.json({ usuarioId: "u1", origen: "USUARIO", dias: semana(480, 720) }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    await user.click(await screen.findByRole("button", { name: "Horarios de Juana Pérez" }));
    let dialogo = await screen.findByRole("dialog", { name: "Horario de Juana Pérez" });
    await within(dialogo).findByText("Juana Pérez tiene horario propio.");
    await user.click(within(dialogo).getByRole("checkbox", { name: "Lunes" }));
    expect(within(dialogo).getByRole("checkbox", { name: "Lunes" })).not.toBeChecked();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Horarios de Juana Pérez" }));

    dialogo = await screen.findByRole("dialog", { name: "Horario de Juana Pérez" });
    await within(dialogo).findByText("Juana Pérez tiene horario propio.");
    expect(within(dialogo).getByRole("checkbox", { name: "Lunes" })).toBeChecked();
  });
});

