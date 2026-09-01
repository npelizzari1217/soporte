import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CrearClienteDialog } from "./crear-cliente-dialog";

/**
 * CrearClienteDialog — zona horaria operativa obligatoria en el alta (C2a-front).
 *
 * El backend (`CreateClienteDto`, C2a-back) ya exige `zonaHoraria` y la valida
 * con `esZonaValida` (por construcción de `Intl.DateTimeFormat`, nunca contra
 * `Intl.supportedValuesOf('timeZone')` — ese catálogo ni siquiera incluye
 * `America/Argentina/Buenos_Aires`). Este archivo recorre el MISMO fixture
 * compartido (`shared-fixtures/formato-fecha-paridad.json`) para que el
 * veredicto del borde del frontend sea idéntico al del VO del backend.
 */
interface FixtureParidad {
  zonasValidas: string[];
  zonasInvalidas: string[];
}

const RUTA_FIXTURE = join(__dirname, "../../../../../shared-fixtures/formato-fecha-paridad.json");

function cargarFixture(): FixtureParidad {
  return JSON.parse(readFileSync(RUTA_FIXTURE, "utf-8")) as FixtureParidad;
}

const { zonasValidas, zonasInvalidas } = cargarFixture();

async function completarCamposBase(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: /nuevo cliente/i }));
  await user.type(screen.getByLabelText(/^nombre$/i), "Cliente Nuevo");
  await user.type(screen.getByLabelText(/email del admin/i), "admin@clientenuevo.com");
  await user.type(screen.getByLabelText(/nombre del admin/i), "Ana");
  await user.type(screen.getByLabelText(/apellido del admin/i), "Gómez");
  await user.type(screen.getByLabelText(/contraseña del admin/i), "password123");
}

describe("CrearClienteDialog — zona horaria operativa obligatoria (C2a-front)", () => {
  it("sin elegir zona, el submit NO dispara el POST /clientes", async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post("/api/clientes", () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    renderWithProviders(<CrearClienteDialog />, { user: buildUser({ is_global_admin: true }) });
    await completarCamposBase(user);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it.each(zonasValidas)("zona válida %s: el payload la incluye tal cual", async (zona) => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/clientes", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    renderWithProviders(<CrearClienteDialog />, { user: buildUser({ is_global_admin: true }) });
    await completarCamposBase(user);
    await user.type(screen.getByLabelText(/zona horaria/i), zona);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturedBody.zonaHoraria).toBe(zona));
  });

  it.each(zonasInvalidas)("zona inválida %s: el submit NO dispara el POST /clientes", async (zona) => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post("/api/clientes", () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    renderWithProviders(<CrearClienteDialog />, { user: buildUser({ is_global_admin: true }) });
    await completarCamposBase(user);
    if (zona) await user.type(screen.getByLabelText(/zona horaria/i), zona);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(called).toBe(false);
  });
});
