/**
 * UsuariosPage — T6.5 (admin-general PR6c)
 *
 * Pantalla `/admin/usuarios`, accesible para ADMINISTRADOR y operador.
 * Lista usuarios del tenant resuelto (filas-tarjeta), permite crear un usuario
 * nuevo y dar de baja a un usuario existente (excepto al usuario autenticado).
 *
 * Tests:
 * - Filas-tarjeta: nombre+apellido, email, badge rol, badge activo/inactivo
 * - MUST NOT mostrar ningún campo relacionado con contraseña en la lista
 * - "Dar de baja" → ConfirmDialog; confirmar → PATCH /usuarios/:id/baja
 * - "Dar de baja" deshabilitado para el usuario autenticado (user.sub === userId)
 * - "Nuevo usuario" → formulario (nombre, apellido, email, rol, contraseña)
 * - Submit: loading state, éxito agrega usuario, email duplicado → mensaje específico
 *
 * Spec ref: admin-ui/Pantalla Usuarios
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../../test/msw/server";
import { SessionProvider } from "@/shared/providers/session-provider";
import { TenantContextProvider } from "@/shared/providers/tenant-context";
import type { JwtPayload } from "@/shared/api/types";
import { UsuariosPage } from "./UsuariosPage";
import * as notifyModule from "@/shared/lib/notify";

const ADMIN: JwtPayload = {
  sub: "admin-1",
  cliente_id: "cliente-1",
  email: "admin@test.com",
  roles: ["ADMINISTRADOR"],
  permisos: [],
  is_global_admin: false,
};

const ROOT: JwtPayload = {
  sub: "root-1",
  cliente_id: "cliente-home",
  email: "root@test.com",
  roles: [],
  permisos: [],
  is_global_admin: true,
};

const USUARIOS_FIXTURE = [
  {
    id: "admin-1",
    email: "admin@test.com",
    nombre: "Ana",
    apellido: "Admin",
    clienteId: "cliente-1",
    activo: true,
    isGlobalAdmin: false,
    roles: ["ADMINISTRADOR"],
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "user-2",
    email: "juan@test.com",
    nombre: "Juan",
    apellido: "Perez",
    clienteId: "cliente-1",
    activo: true,
    isGlobalAdmin: false,
    roles: ["USUARIO"],
    createdAt: "2026-01-02T00:00:00Z",
  },
];

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage(user: JwtPayload = ADMIN, qc: QueryClient = makeQC()) {
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider initialUser={user}>
        <TenantContextProvider>
          <UsuariosPage />
        </TenantContextProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("UsuariosPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Listado ──────────────────────────────────────────────────────────────

  it("renderiza usuarios como filas-tarjeta: nombre+apellido, email, badge rol y badge activo", async () => {
    server.use(
      http.get("http://localhost/api/usuarios", () => HttpResponse.json(USUARIOS_FIXTURE)),
    );

    renderPage();

    expect(await screen.findByText("Ana Admin")).toBeInTheDocument();
    expect(screen.getByText("admin@test.com")).toBeInTheDocument();
    expect(screen.getByText("ADMINISTRADOR")).toBeInTheDocument();
    expect(screen.getAllByText("Activo").length).toBeGreaterThan(0);

    expect(screen.getByText("Juan Perez")).toBeInTheDocument();
    expect(screen.getByText("juan@test.com")).toBeInTheDocument();
    expect(screen.getByText("USUARIO")).toBeInTheDocument();
  });

  it("NO muestra ningún campo relacionado con contraseña en la lista", async () => {
    server.use(
      http.get("http://localhost/api/usuarios", () => HttpResponse.json(USUARIOS_FIXTURE)),
    );

    renderPage();

    await screen.findByText("Ana Admin");
    expect(screen.queryByText(/contraseña/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
  });

  it("muestra skeleton mientras carga GET /usuarios", async () => {
    server.use(
      http.get("http://localhost/api/usuarios", async () => {
        await delay(50);
        return HttpResponse.json(USUARIOS_FIXTURE);
      }),
    );

    renderPage();
    expect(screen.getAllByTestId("usuarios-skeleton-row").length).toBeGreaterThan(0);
    await screen.findByText("Ana Admin");
  });

  it("empty state con acción 'Nuevo usuario' cuando no hay usuarios", async () => {
    server.use(http.get("http://localhost/api/usuarios", () => HttpResponse.json([])));

    renderPage();

    expect(await screen.findByText(/no hay usuarios/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nuevo usuario/i })).toBeInTheDocument();
  });

  // ─── Dar de baja ──────────────────────────────────────────────────────────

  it('"Dar de baja" abre un dialog de confirmación', async () => {
    server.use(
      http.get("http://localhost/api/usuarios", () => HttpResponse.json(USUARIOS_FIXTURE)),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Juan Perez");
    const bajaButtons = screen.getAllByRole("button", { name: /dar de baja/i });
    // El segundo usuario (Juan Perez, no autenticado) tiene el botón habilitado.
    await user.click(bajaButtons[1]);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it('"Dar de baja" está deshabilitado para el usuario autenticado', async () => {
    server.use(
      http.get("http://localhost/api/usuarios", () => HttpResponse.json(USUARIOS_FIXTURE)),
    );

    renderPage();

    await screen.findByText("Ana Admin");
    const bajaButtons = screen.getAllByRole("button", { name: /dar de baja/i });
    // El primer usuario (Ana Admin, id === ADMIN.sub) debe estar deshabilitado.
    expect(bajaButtons[0]).toBeDisabled();
  });

  it("confirmar la baja llama a PATCH /usuarios/:id/baja y actualiza el badge a inactivo", async () => {
    let usuarios = USUARIOS_FIXTURE.map((u) => ({ ...u }));
    server.use(
      http.get("http://localhost/api/usuarios", () => HttpResponse.json(usuarios)),
      http.patch("http://localhost/api/usuarios/:id/baja", ({ params }) => {
        usuarios = usuarios.map((u) =>
          u.id === params.id ? { ...u, activo: false } : u,
        );
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Juan Perez");
    const bajaButtons = screen.getAllByRole("button", { name: /dar de baja/i });
    await user.click(bajaButtons[1]);

    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /confirmar|dar de baja/i }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText("Inactivo").length).toBeGreaterThan(0));
  });

  it("cancelar el dialog de baja no ejecuta ninguna acción", async () => {
    let patchCalled = false;
    server.use(
      http.get("http://localhost/api/usuarios", () => HttpResponse.json(USUARIOS_FIXTURE)),
      http.patch("http://localhost/api/usuarios/:id/baja", () => {
        patchCalled = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Juan Perez");
    const bajaButtons = screen.getAllByRole("button", { name: /dar de baja/i });
    await user.click(bajaButtons[1]);

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(patchCalled).toBe(false);
  });

  // ─── Nuevo usuario ────────────────────────────────────────────────────────

  it('"Nuevo usuario" abre un formulario con nombre, apellido, email, rol (4 opciones) y contraseña', async () => {
    server.use(
      http.get("http://localhost/api/usuarios", () => HttpResponse.json(USUARIOS_FIXTURE)),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Ana Admin");
    await user.click(screen.getByRole("button", { name: /nuevo usuario/i }));

    expect(screen.getByLabelText(/^nombre$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apellido/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /rol/i }));
    const listbox = within(document.body);
    expect(listbox.getByRole("option", { name: "Usuario" })).toBeInTheDocument();
    expect(listbox.getByRole("option", { name: "Colaborador" })).toBeInTheDocument();
    expect(listbox.getByRole("option", { name: "Técnico" })).toBeInTheDocument();
    expect(listbox.getByRole("option", { name: "Administrador" })).toBeInTheDocument();
  });

  it("submit entra en loading state y on success agrega el usuario a la lista con badge activo", async () => {
    let usuarios = [...USUARIOS_FIXTURE];
    server.use(
      http.get("http://localhost/api/usuarios", () => HttpResponse.json(usuarios)),
      http.post("http://localhost/api/usuarios", async ({ request }) => {
        await delay(30);
        const body = (await request.json()) as Record<string, string>;
        const nuevo = {
          id: "user-3",
          email: body.email,
          nombre: body.nombre,
          apellido: body.apellido,
          clienteId: "cliente-1",
          activo: true,
          isGlobalAdmin: false,
          roles: [body.rol],
          createdAt: "2026-01-03T00:00:00Z",
        };
        usuarios = [...usuarios, nuevo];
        return HttpResponse.json(nuevo, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Ana Admin");
    await user.click(screen.getByRole("button", { name: /nuevo usuario/i }));

    await user.type(screen.getByLabelText(/^nombre$/i), "Nueva");
    await user.type(screen.getByLabelText(/apellido/i), "Persona");
    await user.type(screen.getByLabelText(/^email$/i), "nueva@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "Secreta123!");
    await user.click(screen.getByRole("combobox", { name: /rol/i }));
    await user.click(within(document.body).getByRole("option", { name: "Técnico" }));

    const submitButton = screen.getByRole("button", { name: /^crear$/i });
    const submitPromise = user.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
    await submitPromise;

    await waitFor(() => expect(screen.getByText("Nueva Persona")).toBeInTheDocument());
    const rows = screen.getAllByText("Activo");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("email duplicado muestra 'Este email ya está registrado'", async () => {
    server.use(
      http.get("http://localhost/api/usuarios", () => HttpResponse.json(USUARIOS_FIXTURE)),
      http.post("http://localhost/api/usuarios", () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Ya existe un usuario con email "admin@test.com".' },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Ana Admin");
    await user.click(screen.getByRole("button", { name: /nuevo usuario/i }));

    await user.type(screen.getByLabelText(/^nombre$/i), "Duplicado");
    await user.type(screen.getByLabelText(/apellido/i), "Usuario");
    await user.type(screen.getByLabelText(/^email$/i), "admin@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "Secreta123!");
    await user.click(screen.getByRole("combobox", { name: /rol/i }));
    await user.click(within(document.body).getByRole("option", { name: "Usuario" }));

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByText("Este email ya está registrado")).toBeInTheDocument();
  });

  it("propaga error genérico del servidor via notify.error", async () => {
    const notifyError = vi.spyOn(notifyModule.notify, "error");
    server.use(
      http.get("http://localhost/api/usuarios", () => HttpResponse.json(USUARIOS_FIXTURE)),
      http.patch("http://localhost/api/usuarios/:id/baja", () =>
        HttpResponse.json({ statusCode: 500, message: "Internal Server Error" }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Juan Perez");
    const bajaButtons = screen.getAllByRole("button", { name: /dar de baja/i });
    await user.click(bajaButtons[1]);
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /confirmar|dar de baja/i }));

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(expect.any(String)));
  });

  // ─── R6: Switch "Root" gateado por isGlobalAdmin (Dz2-UI) ───────────────────

  describe("Switch root en alta de usuarios (R6/Dz2-UI)", () => {
    it("R6-a: root ve el Switch 'Root'; activarlo y enviar llama a POST /usuarios/root", async () => {
      const rootCall: { body: Record<string, string> | null } = { body: null };
      let usuariosPostCalled = false;
      server.use(
        http.get("http://localhost/api/usuarios", () => HttpResponse.json([])),
        http.post("http://localhost/api/usuarios/root", async ({ request }) => {
          const body = (await request.json()) as Record<string, string>;
          rootCall.body = body;
          return HttpResponse.json(
            {
              id: "root-2",
              email: body.email,
              nombre: body.nombre,
              apellido: body.apellido,
              clienteId: "cliente-home",
              activo: true,
              isGlobalAdmin: true,
              roles: [],
              createdAt: "2026-01-01T00:00:00Z",
            },
            { status: 201 },
          );
        }),
        http.post("http://localhost/api/usuarios", () => {
          usuariosPostCalled = true;
          return HttpResponse.json({}, { status: 201 });
        }),
      );

      const user = userEvent.setup();
      renderPage(ROOT);

      await user.click(await screen.findByRole("button", { name: /nuevo usuario/i }));

      const rootSwitch = screen.getByRole("switch", { name: /root/i });
      expect(rootSwitch).toBeInTheDocument();
      expect(rootSwitch).toHaveAttribute("aria-checked", "false");
      // FIX 3 (a11y, Judgment Day R1): el accessible name debe venir del
      // <Label htmlFor> visible ("Root (acceso global)"), no de un
      // aria-label recortado ("Root") que lo pise.
      expect(rootSwitch).toHaveAccessibleName("Root (acceso global)");

      await user.click(rootSwitch);
      expect(rootSwitch).toHaveAttribute("aria-checked", "true");

      await user.type(screen.getByLabelText(/^nombre$/i), "Nuevo");
      await user.type(screen.getByLabelText(/apellido/i), "Root");
      await user.type(screen.getByLabelText(/^email$/i), "nuevoroot@test.com");
      await user.type(screen.getByLabelText(/contraseña/i), "Secreta123!");

      await user.click(screen.getByRole("button", { name: /^crear$/i }));

      await waitFor(() => expect(rootCall.body).not.toBeNull());
      expect(rootCall.body?.email).toBe("nuevoroot@test.com");
      expect(usuariosPostCalled).toBe(false);
    });

    it("FIX 4 (interactive-state): el Switch 'Root' se deshabilita mientras el form envía", async () => {
      server.use(
        http.get("http://localhost/api/usuarios", () => HttpResponse.json([])),
        http.post("http://localhost/api/usuarios/root", async () => {
          await delay(30);
          return HttpResponse.json(
            {
              id: "root-2",
              email: "nuevoroot@test.com",
              nombre: "Nuevo",
              apellido: "Root",
              clienteId: "cliente-home",
              activo: true,
              isGlobalAdmin: true,
              roles: [],
              createdAt: "2026-01-01T00:00:00Z",
            },
            { status: 201 },
          );
        }),
      );

      const user = userEvent.setup();
      renderPage(ROOT);

      await user.click(await screen.findByRole("button", { name: /nuevo usuario/i }));

      const rootSwitch = screen.getByRole("switch", { name: /root/i });
      await user.click(rootSwitch);

      await user.type(screen.getByLabelText(/^nombre$/i), "Nuevo");
      await user.type(screen.getByLabelText(/apellido/i), "Root");
      await user.type(screen.getByLabelText(/^email$/i), "nuevoroot@test.com");
      await user.type(screen.getByLabelText(/contraseña/i), "Secreta123!");

      const submitPromise = user.click(screen.getByRole("button", { name: /^crear$/i }));

      await waitFor(() => expect(rootSwitch).toBeDisabled());
      await submitPromise;
    });

    it("R6-b [CRITICAL]: ADMINISTRADOR no-root NO ve el Switch 'Root'", async () => {
      server.use(
        http.get("http://localhost/api/usuarios", () => HttpResponse.json(USUARIOS_FIXTURE)),
      );

      const user = userEvent.setup();
      renderPage(ADMIN);

      await screen.findByText("Ana Admin");
      await user.click(screen.getByRole("button", { name: /nuevo usuario/i }));

      expect(screen.queryByRole("switch", { name: /root/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/root \(acceso global\)/i)).not.toBeInTheDocument();
    });
  });
});
