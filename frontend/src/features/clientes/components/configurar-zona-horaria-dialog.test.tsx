import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ConfigurarZonaHorariaDialog } from "./configurar-zona-horaria-dialog";
import type { Cliente } from "../types";

/**
 * ConfigurarZonaHorariaDialog — tarea 2.12 (RED,
 * `openspec/changes/zona-horaria-por-tenant/tasks.md`, D2).
 *
 * Dos conductas, las dos exigidas por el diseño para el diálogo de EDICIÓN
 * (a diferencia del de ALTA, que nunca prellena):
 *
 * 1. El select siempre incluye el valor vigente del tenant, aunque no esté
 *    en `Intl.supportedValuesOf('timeZone')` ni en
 *    `ZONAS_FALTANTES_EN_INTL` (`shared/lib/zonas-horarias.ts`). Se usa
 *    `+05:00`: es el ÚNICO candidato de `zonasValidas` del fixture
 *    compartido (`shared-fixtures/formato-fecha-paridad.json`) que queda
 *    fuera de `obtenerCatalogoZonasHorarias()` — ya fijado como centinela
 *    en `zonas-horarias.test.ts` y en `crear-cliente-dialog.test.tsx`, así
 *    que reusarlo acá no depende de adivinar qué zona falta hoy en `Intl`.
 * 2. Al reabrir, sincroniza con el valor VIGENTE de la prop, no con el
 *    snapshot de la primera apertura — mismo patrón "dialogos-reset-valores-vigentes"
 *    que `SectorFormDialog`/`CicloVigenteFormDialog` ya cubren para sus
 *    propios dominios.
 *
 * Props alineadas a `{ cliente: Cliente }` (cierre de la contradicción entre
 * 2.13 y 2.14, 2026-09-02, apply) — mismo criterio que
 * `ConfigurarCsatDialog`/`configurar-csat-dialog.test.tsx`.
 */
const ZONA_FUERA_DE_CATALOGO = "+05:00";

function buildCliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: "c1",
    nombre: "Cliente Uno",
    razonSocial: null,
    cuit: null,
    dbName: "cliente_uno",
    activo: true,
    csatHabilitado: false,
    zonaHoraria: "America/Argentina/Buenos_Aires",
    ...overrides,
  };
}

describe("ConfigurarZonaHorariaDialog", () => {
  it("el select incluye el valor vigente del tenant aunque no esté en el catálogo", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConfigurarZonaHorariaDialog cliente={buildCliente({ zonaHoraria: ZONA_FUERA_DE_CATALOGO })} />,
      { user: buildUser({ is_global_admin: true }) },
    );

    await user.click(screen.getByRole("button", { name: /configurar zona horaria de cliente uno/i }));
    await user.click(screen.getByLabelText(/^zona horaria$/i));

    expect(await screen.findByRole("option", { name: ZONA_FUERA_DE_CATALOGO })).toBeInTheDocument();
  });

  it("reabrir tras un cambio de la prop `cliente.zonaHoraria` muestra el valor vigente, no el del primer render", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <ConfigurarZonaHorariaDialog cliente={buildCliente({ zonaHoraria: "Europe/Madrid" })} />,
      { user: buildUser({ is_global_admin: true }) },
    );

    await user.click(screen.getByRole("button", { name: /configurar zona horaria de cliente uno/i }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    // El tenant cambió de zona por otra vía (otra pestaña, otro admin ROOT).
    rerender(<ConfigurarZonaHorariaDialog cliente={buildCliente({ zonaHoraria: "UTC" })} />);

    await user.click(screen.getByRole("button", { name: /configurar zona horaria de cliente uno/i }));

    expect(screen.getByLabelText(/^zona horaria$/i)).toHaveValue("UTC");
  });
});

/**
 * Tareas 2.13 (GREEN) — mutation hook y aviso de re-lectura histórica. Ninguna de las dos
 * está cubierta por los tests RED de 2.12 de arriba (que solo prueban `valorVigente` y el
 * `reset()` al reabrir), así que van con sus propios tests nuevos en vez de agregarse sin
 * ninguno — TDD estricto no negocia el orden ni en un GREEN de una tarea previa.
 */
describe("ConfigurarZonaHorariaDialog — guardar (tarea 2.13)", () => {
  it("muestra el aviso de que el cambio no reprocesa lo ya registrado", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConfigurarZonaHorariaDialog cliente={buildCliente({ zonaHoraria: "Europe/Madrid" })} />,
      { user: buildUser({ is_global_admin: true }) },
    );

    await user.click(screen.getByRole("button", { name: /configurar zona horaria de cliente uno/i }));

    expect(screen.getByText(/no reprocesa lo ya registrado/i)).toBeInTheDocument();
  });

  it("guardar sin cambiar la zona hace PATCH /clientes/:id/zona-horaria con el valor vigente", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    let capturedId = "";
    server.use(
      http.patch("/api/clientes/:id/zona-horaria", async ({ request, params }) => {
        capturedId = String(params.id);
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: capturedId, zonaHoraria: "Europe/Madrid" });
      }),
    );

    renderWithProviders(
      <ConfigurarZonaHorariaDialog cliente={buildCliente({ id: "c1", zonaHoraria: "Europe/Madrid" })} />,
      { user: buildUser({ is_global_admin: true }) },
    );

    await user.click(screen.getByRole("button", { name: /configurar zona horaria de cliente uno/i }));
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    // Esta espera SÍ sincroniza, aunque el trigger nunca se desmonte: con el
    // diálogo abierto Radix lo saca del árbol de accesibilidad (`body` queda
    // `data-scroll-locked` con `pointer-events: none`), y `findByRole` consulta
    // ese árbol, no el DOM. Resuelve recién cuando `onSuccess` corre el
    // `setOpen(false)`. Verificado con un mutante: reemplazar ese `setOpen`
    // por un no-op pone este test en rojo.
    await screen.findByRole("button", { name: /configurar zona horaria de cliente uno/i });
    expect(capturedId).toBe("c1");
    expect(capturedBody).toEqual({ zonaHoraria: "Europe/Madrid" });
  });
});
