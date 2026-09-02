import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ConfigurarCorreoDialog } from "./configurar-correo-dialog";
import type { Cliente, ClienteCorreo } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * ConfigurarCorreoDialog — regresión de render-fechas-frontend:
 * `ClienteCorreo.verificadoAt` (`@db.Timestamptz`, instante) ahora se
 * renderiza con `formatearInstante` en vez de una copia local de
 * `Intl.DateTimeFormat`. Literal fijo, NO derivado del mismo `Intl` que usa
 * el componente (esa forma de comparar queda ciega a una regresión de zona
 * horaria).
 */
const CLIENTE: Cliente = {
  id: "c1",
  nombre: "Cliente Uno",
  razonSocial: null,
  cuit: null,
  dbName: "cliente_uno",
  activo: true,
  csatHabilitado: false,
  zonaHoraria: "America/Argentina/Buenos_Aires",
};

function buildCorreo(overrides: Partial<ClienteCorreo> = {}): ClienteCorreo {
  return {
    configurado: true,
    host: "smtp.cliente-uno.com",
    port: 587,
    user: "notificaciones@cliente-uno.com",
    secure: true,
    from: "notificaciones@cliente-uno.com",
    verificadoAt: "2026-08-19T15:00:00.000Z",
    verificacionError: null,
    ...overrides,
  };
}

describe("ConfigurarCorreoDialog", () => {
  beforeEach(() => vi.mocked(toast.success).mockClear());

  it("con correo verificado, muestra la fecha y hora de verificación (instante, horario argentino)", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/clientes/c1/correo", () => HttpResponse.json(buildCorreo())));

    renderWithProviders(<ConfigurarCorreoDialog cliente={CLIENTE} />, { user: buildUser({ is_global_admin: true }) });

    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));

    // 2026-08-19T15:00:00.000Z = 12:00 en America/Argentina/Buenos_Aires (UTC-3).
    expect(await screen.findByText("Verificado el 19/08/2026 12:00")).toBeInTheDocument();
  });

  /**
   * dialogos-reset-valores-vigentes (Grupo B): el diálogo queda montado
   * permanentemente en `ClienteAcciones`, así que reabrirlo tras guardar sin
   * recargar la página tiene que mostrar el dato VIGENTE, nunca campos en
   * blanco.
   */
  it("reabrir tras guardar sin recargar muestra los datos vigentes, no en blanco", async () => {
    const user = userEvent.setup();
    // Handler CON ESTADO: un GET posterior al PATCH tiene que reflejar lo
    // guardado, igual que el backend real — un mock que siempre devuelve el
    // host original no probaría nada distinto de "no rompí el mount".
    let hostGuardado = "smtp.cliente-uno.com";
    server.use(
      http.get("/api/clientes/c1/correo", () => HttpResponse.json(buildCorreo({ host: hostGuardado }))),
      http.patch("/api/clientes/c1/correo", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        hostGuardado = body.host as string;
        return HttpResponse.json(buildCorreo({ host: hostGuardado }));
      }),
    );

    renderWithProviders(<ConfigurarCorreoDialog cliente={CLIENTE} />, { user: buildUser({ is_global_admin: true }) });

    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));
    const hostInput = await screen.findByLabelText(/^host$/i);
    expect(hostInput).toHaveValue("smtp.cliente-uno.com");

    await user.clear(hostInput);
    await user.type(hostInput, "smtp.nuevo.com");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /cerrar/i }));
    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));

    expect(await screen.findByLabelText(/^host$/i)).toHaveValue("smtp.nuevo.com");
  });

  /**
   * Disparador real y determinista del refetch en segundo plano: el botón
   * "Probar conexión" (`useProbarCorreoCliente`) hace `setQueryData` con un
   * `ClienteCorreo` cuyo `host`/`verificadoAt` difieren del `GET` inicial.
   * Ancla en el texto de verificación —que se renderiza directo desde
   * `correoQuery.data`— antes de asertar sobre los inputs: cero timers, cero
   * acceso al QueryClient.
   */
  function mockProbarConexionConDatosDistintos() {
    server.use(
      http.get("/api/clientes/c1/correo", () => HttpResponse.json(buildCorreo())),
      http.post("/api/clientes/c1/correo/probar", () =>
        HttpResponse.json(
          buildCorreo({ host: "smtp.actualizado-por-servidor.com", verificadoAt: "2026-08-19T16:30:00.000Z" }),
        ),
      ),
    );
  }

  it("un refetch en segundo plano no pisa lo que el usuario está editando (par sucio)", async () => {
    const user = userEvent.setup();
    mockProbarConexionConDatosDistintos();

    renderWithProviders(<ConfigurarCorreoDialog cliente={CLIENTE} />, { user: buildUser({ is_global_admin: true }) });

    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));
    const hostInput = await screen.findByLabelText(/^host$/i);
    await screen.findByText("Verificado el 19/08/2026 12:00");

    await user.clear(hostInput);
    await user.type(hostInput, "smtp.editando.com");
    await user.type(screen.getByLabelText(/^contraseña/i), "nueva-clave");

    await user.click(screen.getByRole("button", { name: /probar conexión/i }));
    await screen.findByText("Verificado el 19/08/2026 13:30");

    expect(screen.getByLabelText(/^host$/i)).toHaveValue("smtp.editando.com");
    expect(screen.getByLabelText(/^contraseña/i)).toHaveValue("nueva-clave");
  });

  it("un refetch en segundo plano SÍ sincroniza cuando el formulario está limpio (hermano invertido)", async () => {
    const user = userEvent.setup();
    mockProbarConexionConDatosDistintos();

    renderWithProviders(<ConfigurarCorreoDialog cliente={CLIENTE} />, { user: buildUser({ is_global_admin: true }) });

    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));
    await screen.findByLabelText(/^host$/i);
    await screen.findByText("Verificado el 19/08/2026 12:00");

    await user.click(screen.getByRole("button", { name: /probar conexión/i }));
    await screen.findByText("Verificado el 19/08/2026 13:30");

    expect(screen.getByLabelText(/^host$/i)).toHaveValue("smtp.actualizado-por-servidor.com");
  });

  /**
   * Regresión: el checkbox TLS/SSL NO va por `register` (Radix `Checkbox` no
   * es un `<input>` nativo) — va por `watch("secure")` +
   * `setValue("secure", ..., { shouldDirty: true })`. Sin ese
   * `shouldDirty`, tildar/destildar el checkbox no marca `isDirty`, el guard
   * `!isDirty` del efecto de sincronización lo deja pasar igual, y un
   * refetch en segundo plano le pisa la elección del usuario — el único
   * campo del formulario que no se edita tipeando, así que ningún otro test
   * de este archivo lo ejercita.
   */
  function mockProbarConexionConSecureDistinto(secureDelServidor: boolean) {
    server.use(
      http.get("/api/clientes/c1/correo", () => HttpResponse.json(buildCorreo({ secure: true }))),
      http.post("/api/clientes/c1/correo/probar", () =>
        HttpResponse.json(buildCorreo({ secure: secureDelServidor, verificadoAt: "2026-08-19T18:00:00.000Z" })),
      ),
    );
  }

  it("un refetch en segundo plano no pisa el checkbox TLS que el usuario destildó sin tocar otro campo (par sucio)", async () => {
    const user = userEvent.setup();
    // El servidor NO cambia `secure` (sigue en `true`): si el guard fallara,
    // el efecto lo reescribiría a `true` igual, delatando que no vio el
    // click del usuario como una edición.
    mockProbarConexionConSecureDistinto(true);

    renderWithProviders(<ConfigurarCorreoDialog cliente={CLIENTE} />, { user: buildUser({ is_global_admin: true }) });

    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));
    await screen.findByLabelText(/^host$/i);
    await screen.findByText("Verificado el 19/08/2026 12:00");

    const tlsCheckbox = screen.getByRole("checkbox", { name: /tls\/ssl/i });
    expect(tlsCheckbox).toBeChecked();
    await user.click(tlsCheckbox);

    await user.click(screen.getByRole("button", { name: /probar conexión/i }));
    await screen.findByText("Verificado el 19/08/2026 15:00");

    expect(screen.getByRole("checkbox", { name: /tls\/ssl/i })).not.toBeChecked();
  });

  it("un refetch en segundo plano SÍ sincroniza el checkbox TLS cuando el formulario está limpio (hermano invertido)", async () => {
    const user = userEvent.setup();
    mockProbarConexionConSecureDistinto(false);

    renderWithProviders(<ConfigurarCorreoDialog cliente={CLIENTE} />, { user: buildUser({ is_global_admin: true }) });

    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));
    await screen.findByLabelText(/^host$/i);
    await screen.findByText("Verificado el 19/08/2026 12:00");
    expect(screen.getByRole("checkbox", { name: /tls\/ssl/i })).toBeChecked();

    await user.click(screen.getByRole("button", { name: /probar conexión/i }));
    await screen.findByText("Verificado el 19/08/2026 15:00");

    expect(screen.getByRole("checkbox", { name: /tls\/ssl/i })).not.toBeChecked();
  });

  it("tras guardar, la contraseña queda vacía y una sincronización posterior vuelve a aplicarse", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/clientes/c1/correo", () => HttpResponse.json(buildCorreo())),
      http.patch("/api/clientes/c1/correo", () => HttpResponse.json(buildCorreo())),
      http.post("/api/clientes/c1/correo/probar", () =>
        HttpResponse.json(buildCorreo({ host: "smtp.tras-guardar.com", verificadoAt: "2026-08-19T17:00:00.000Z" })),
      ),
    );

    renderWithProviders(<ConfigurarCorreoDialog cliente={CLIENTE} />, { user: buildUser({ is_global_admin: true }) });

    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));
    await screen.findByLabelText(/^host$/i);
    await user.type(screen.getByLabelText(/^contraseña/i), "clave-temporal");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    expect(screen.getByLabelText(/^contraseña/i)).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /probar conexión/i }));
    await screen.findByText("Verificado el 19/08/2026 14:00");

    expect(screen.getByLabelText(/^host$/i)).toHaveValue("smtp.tras-guardar.com");
  });

  it("la contraseña arranca vacía en toda apertura, incluida la reapertura tras guardar (contrato D7)", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/clientes/c1/correo", () => HttpResponse.json(buildCorreo())),
      http.patch("/api/clientes/c1/correo", () => HttpResponse.json(buildCorreo())),
    );

    renderWithProviders(<ConfigurarCorreoDialog cliente={CLIENTE} />, { user: buildUser({ is_global_admin: true }) });

    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));
    await user.type(await screen.findByLabelText(/^contraseña/i), "otra-clave");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /cerrar/i }));
    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));

    expect(await screen.findByLabelText(/^contraseña/i)).toHaveValue("");
  });
});
