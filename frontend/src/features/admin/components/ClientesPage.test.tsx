/**
 * ClientesPage — T6.1 (admin-general PR6a)
 *
 * Pantalla Clientes (solo operador global). Lista clientes vía useClientes,
 * permite provisionar un nuevo cliente, y suspender/reactivar clientes existentes.
 *
 * Tests:
 * - Skeleton durante GET /clientes.
 * - Filas-tarjeta: nombre, badge activo/suspendido, db_name, acciones.
 * - Empty state: ilustración + "No hay clientes registrados" + botón "Nuevo cliente".
 * - Error state: mensaje + reintentar (paridad con TicketsPage).
 * - "Nuevo cliente" → abre formulario con: nombre, db_name, email admin, nombre admin,
 *   apellido admin, contraseña admin.
 * - Submit → loading state en el botón.
 * - On success → toast éxito + refetch de la lista.
 * - db_name duplicado (409) → "Ese identificador de DB ya existe".
 * - Error genérico (500) → mensaje del servidor.
 * - Acciones Suspender/Reactivar según estado del cliente.
 *
 * Spec ref: admin-ui/Pantalla Clientes
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { SessionProvider } from "@/shared/providers/session-provider";
import { ClientesPage } from "./ClientesPage";
import type { JwtPayload } from "@/shared/api/types";

const OPERADOR: JwtPayload = {
  sub: "op1",
  cliente_id: "home",
  email: "op@test.com",
  roles: [],
  permisos: [],
  is_global_admin: true,
};

const CLIENTES = [
  { id: "cliente-a", nombre: "Acme Corp", activo: true, dbName: "db_acme", createdAt: "2026-01-01" },
  { id: "cliente-b", nombre: "Beta SA", activo: false, dbName: "db_beta", createdAt: "2026-01-02" },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider initialUser={OPERADOR}>
        <ClientesPage />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("ClientesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Loading ──────────────────────────────────────────────────────────────

  it("loading: muestra skeleton mientras carga GET /clientes", () => {
    server.use(
      http.get("http://localhost/api/clientes", () => new Promise(() => {})),
    );

    const { container } = renderPage();

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
  });

  // ─── Success ──────────────────────────────────────────────────────────────

  it("success: renderiza filas-tarjeta con nombre, badge de estado y db_name", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json(CLIENTES)),
    );

    renderPage();

    await screen.findByText("Acme Corp");
    expect(screen.getByText("Beta SA")).toBeInTheDocument();
    expect(screen.getByText("db_acme")).toBeInTheDocument();
    expect(screen.getByText("db_beta")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Suspendido")).toBeInTheDocument();
  });

  // ─── Empty ────────────────────────────────────────────────────────────────

  it("empty: muestra empty state cuando GET /clientes devuelve []", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json([])),
    );

    renderPage();

    await screen.findByText("No hay clientes registrados");
    expect(
      screen.getByRole("button", { name: /nuevo cliente/i }),
    ).toBeInTheDocument();
  });

  // ─── Error ────────────────────────────────────────────────────────────────

  it("error: muestra mensaje y botón reintentar cuando GET /clientes falla", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () =>
        HttpResponse.json({ statusCode: 500, message: "Internal Server Error" }, { status: 500 }),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole("button", { name: /reintentar/i }),
    ).toBeInTheDocument();
  });

  // ─── Abrir formulario ─────────────────────────────────────────────────────

  it("wiring: clic en 'Nuevo cliente' abre el formulario con los campos esperados", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json(CLIENTES)),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Acme Corp");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /nuevo cliente/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/^nombre$/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/db_name/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/email admin/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/nombre admin/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/apellido admin/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/contraseña admin/i)).toBeInTheDocument();
  });

  // ─── Submit loading state ─────────────────────────────────────────────────

  it("submit: el botón de crear entra en loading state durante el POST", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json(CLIENTES)),
      // Never-resolving handler: isolates the loading-state assertion from any
      // race with success/close side effects (this test only cares about the
      // button entering loading state on submit, not what happens after).
      http.post("http://localhost/api/clientes", () => new Promise(() => {})),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Acme Corp");

    await user.click(screen.getByRole("button", { name: /nuevo cliente/i }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/^nombre$/i), "Nuevo SA");
    await user.type(within(dialog).getByLabelText(/db_name/i), "db_nuevo");
    await user.type(within(dialog).getByLabelText(/email admin/i), "admin@nuevo.com");
    await user.type(within(dialog).getByLabelText(/nombre admin/i), "Juan");
    await user.type(within(dialog).getByLabelText(/apellido admin/i), "Perez");
    await user.type(within(dialog).getByLabelText(/contraseña admin/i), "secret123");

    const submitButton = within(dialog).getByRole("button", { name: /crear/i });
    await user.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
  });

  // ─── Success de creación ──────────────────────────────────────────────────

  it("on success: muestra toast de éxito, cierra el modal y refresca la lista", async () => {
    let getCalls = 0;
    server.use(
      http.get("http://localhost/api/clientes", () => {
        getCalls += 1;
        return HttpResponse.json(
          getCalls === 1 ? CLIENTES : [...CLIENTES, { id: "c-new", nombre: "Nuevo SA", activo: true, dbName: "db_nuevo", createdAt: "2026-02-01" }],
        );
      }),
      http.post("http://localhost/api/clientes", () =>
        HttpResponse.json(
          { id: "c-new", nombre: "Nuevo SA", activo: true, dbName: "db_nuevo", createdAt: "2026-02-01" },
          { status: 201 },
        ),
      ),
    );

    const successSpy = vi.spyOn(toast, "success");
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Acme Corp");

    await user.click(screen.getByRole("button", { name: /nuevo cliente/i }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/^nombre$/i), "Nuevo SA");
    await user.type(within(dialog).getByLabelText(/db_name/i), "db_nuevo");
    await user.type(within(dialog).getByLabelText(/email admin/i), "admin@nuevo.com");
    await user.type(within(dialog).getByLabelText(/nombre admin/i), "Juan");
    await user.type(within(dialog).getByLabelText(/apellido admin/i), "Perez");
    await user.type(within(dialog).getByLabelText(/contraseña admin/i), "secret123");

    await user.click(within(dialog).getByRole("button", { name: /crear/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(successSpy).toHaveBeenCalled();
    await screen.findByText("Nuevo SA");
  });

  // ─── Error db_name duplicado ──────────────────────────────────────────────

  it("error 409 db_name duplicado: muestra 'Ese identificador de DB ya existe'", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json(CLIENTES)),
      http.post("http://localhost/api/clientes", () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Ya existe un cliente con db_name "db_acme".' },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Acme Corp");

    await user.click(screen.getByRole("button", { name: /nuevo cliente/i }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/^nombre$/i), "Dup SA");
    await user.type(within(dialog).getByLabelText(/db_name/i), "db_acme");
    await user.type(within(dialog).getByLabelText(/email admin/i), "admin@dup.com");
    await user.type(within(dialog).getByLabelText(/nombre admin/i), "Juan");
    await user.type(within(dialog).getByLabelText(/apellido admin/i), "Perez");
    await user.type(within(dialog).getByLabelText(/contraseña admin/i), "secret123");

    await user.click(within(dialog).getByRole("button", { name: /crear/i }));

    expect(
      await within(dialog).findByText("Ese identificador de DB ya existe"),
    ).toBeInTheDocument();
    // El modal MUST NOT cerrarse en error
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // ─── Error genérico ───────────────────────────────────────────────────────

  it("error genérico (500): muestra el mensaje de error del servidor", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json(CLIENTES)),
      http.post("http://localhost/api/clientes", () =>
        HttpResponse.json(
          { statusCode: 500, message: "Error interno de provisioning: fallo en migraciones" },
          { status: 500 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Acme Corp");

    await user.click(screen.getByRole("button", { name: /nuevo cliente/i }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/^nombre$/i), "Otra SA");
    await user.type(within(dialog).getByLabelText(/db_name/i), "db_otra");
    await user.type(within(dialog).getByLabelText(/email admin/i), "admin@otra.com");
    await user.type(within(dialog).getByLabelText(/nombre admin/i), "Ana");
    await user.type(within(dialog).getByLabelText(/apellido admin/i), "Lopez");
    await user.type(within(dialog).getByLabelText(/contraseña admin/i), "secret123");

    await user.click(within(dialog).getByRole("button", { name: /crear/i }));

    expect(
      await within(dialog).findByText("Error interno de provisioning: fallo en migraciones"),
    ).toBeInTheDocument();
  });

  // ─── Acciones: Suspender / Reactivar ──────────────────────────────────────

  it("acciones: muestra 'Suspender' para clientes activos y 'Reactivar' para suspendidos", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json(CLIENTES)),
    );

    renderPage();
    await screen.findByText("Acme Corp");

    expect(screen.getByRole("button", { name: /suspender/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reactivar/i })).toBeInTheDocument();
  });

  it("suspender: pide confirmación y llama DELETE /clientes/:id al confirmar", async () => {
    let deleteCalled = false;
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json(CLIENTES)),
      http.delete("http://localhost/api/clientes/cliente-a", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Acme Corp");

    await user.click(screen.getByRole("button", { name: /suspender/i }));

    const confirmDialog = await screen.findByRole("alertdialog");
    await user.click(within(confirmDialog).getByRole("button", { name: /^suspender$/i }));

    await waitFor(() => expect(deleteCalled).toBe(true));
  });

  it("reactivar: llama PUT /clientes/:id/reactivar", async () => {
    let putCalled = false;
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json(CLIENTES)),
      http.put("http://localhost/api/clientes/cliente-b/reactivar", () => {
        putCalled = true;
        return HttpResponse.json({});
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Beta SA");

    await user.click(screen.getByRole("button", { name: /reactivar/i }));

    await waitFor(() => expect(putCalled).toBe(true));
  });
});
