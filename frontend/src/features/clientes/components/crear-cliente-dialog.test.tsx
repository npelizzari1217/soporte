import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { obtenerCatalogoZonasHorarias } from "@/shared/lib/zonas-horarias";
import { CrearClienteDialog } from "./crear-cliente-dialog";

/**
 * CrearClienteDialog — zona horaria operativa obligatoria en el alta (C2a-front),
 * ahora elegida por un COMBOBOX CON BÚSQUEDA (decisión del usuario, 2026-09-02,
 * C2c-0), nunca un `<Input>` de texto libre.
 *
 * El backend (`CreateClienteDto`, C2a-back) ya exige `zonaHoraria` y la valida
 * con `esZonaValida` (por construcción de `Intl.DateTimeFormat`, nunca contra
 * `Intl.supportedValuesOf('timeZone')`). Este archivo recorre el MISMO fixture
 * compartido (`shared-fixtures/formato-fecha-paridad.json`) para que el
 * veredicto del borde del frontend sea idéntico al del VO del backend, PERO
 * el combobox por diseño ("no deja elegir un valor fuera del catálogo",
 * `ZonaHorariaCombobox`) solo puede comitear zonas que efectivamente
 * aparecen en `obtenerCatalogoZonasHorarias()`. Un único candidato válido del
 * fixture, `+05:00` (offset ISO, no un nombre de zona IANA — ver
 * `zonas-horarias.ts`), queda deliberadamente fuera de ese catálogo; el test
 * "cubre exactamente el excluido esperado" de abajo lo fija con un centinela
 * independiente para que una futura regresión del catálogo (p.ej. que vuelva
 * a perder `Asia/Kolkata`) rompa acá en vez de reducir en silencio el conteo
 * del `it.each` de zonas válidas.
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
const CATALOGO = obtenerCatalogoZonasHorarias();
const zonasValidasEnCatalogo = zonasValidas.filter((zona) => CATALOGO.includes(zona));
/** Único candidato válido del fixture NO alcanzable por el combobox — ver el comentario del módulo. */
const EXCLUSION_ESPERADA = ["+05:00"];

async function completarCamposBase(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: /nuevo cliente/i }));
  await user.type(screen.getByLabelText(/^nombre$/i), "Cliente Nuevo");
  await user.type(screen.getByLabelText(/email del admin/i), "admin@clientenuevo.com");
  await user.type(screen.getByLabelText(/nombre del admin/i), "Ana");
  await user.type(screen.getByLabelText(/apellido del admin/i), "Gómez");
  await user.type(screen.getByLabelText(/contraseña del admin/i), "password123");
}

/** Filtra por el nombre completo de la zona (único match garantizado en el catálogo) y la elige de la lista. */
async function elegirZonaDelCombobox(user: ReturnType<typeof userEvent.setup>, zona: string): Promise<void> {
  const input = screen.getByLabelText(/zona horaria/i);
  await user.click(input);
  await user.type(input, zona);
  await user.click(await screen.findByRole("option", { name: zona }));
}

describe("CrearClienteDialog — zona horaria operativa obligatoria (C2a-front)", () => {
  it("el catálogo del combobox cubre las zonasValidas del fixture salvo el offset ISO declarado", () => {
    // Centinela independiente del propio filtro: si el catálogo regresa (p.ej.
    // vuelve a perder Asia/Kolkata), el conjunto excluido difiere del fijo de
    // arriba y este test falla ANTES de que el `it.each` de más abajo reduzca
    // su conteo en silencio.
    const zonasFueraDelCatalogo = zonasValidas.filter((zona) => !CATALOGO.includes(zona));
    expect(zonasFueraDelCatalogo).toEqual(EXCLUSION_ESPERADA);
  });

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

  it("editar el texto tras elegir una zona y presionar Enter no somete el form con el valor viejo", async () => {
    // Enter dentro del `<form>` no debe burbujear mientras la lista está
    // abierta: si lo hiciera, el submit dispararía con la última zona
    // COMITEADA aunque la pantalla muestre un texto sin confirmar distinto.
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
    await elegirZonaDelCombobox(user, "Europe/Madrid");

    const input = screen.getByLabelText(/zona horaria/i);
    await user.clear(input);
    await user.type(input, "Europe/Madriz");
    await user.keyboard("{Enter}");

    expect(called).toBe(false);
  });

  it.each(zonasValidasEnCatalogo)("zona válida %s: el payload la incluye tal cual", async (zona) => {
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
    await elegirZonaDelCombobox(user, zona);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturedBody.zonaHoraria).toBe(zona));
  });

  it.each(zonasInvalidas)(
    "zona inválida %s: el combobox no la ofrece como opción y el submit NO dispara el POST /clientes",
    async (zona) => {
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
      const input = screen.getByLabelText(/zona horaria/i);
      if (zona) {
        await user.click(input);
        await user.type(input, zona);
        // El combobox nunca comitea texto libre: ningún candidato inválido
        // puede aparecer como opción seleccionable de la lista filtrada.
        expect(screen.queryByRole("option", { name: zona })).not.toBeInTheDocument();
      }
      await user.click(screen.getByRole("button", { name: /^crear$/i }));

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(called).toBe(false);
    },
  );
});
