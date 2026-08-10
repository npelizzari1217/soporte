import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquipoComponentesSection } from "./equipo-componentes-section";

/**
 * EquipoComponentesSection — item 1 backend-gaps (PR6, sdd/tipos-componente-master):
 * el nombre/estado de cada componente ya asignado se resuelve del dato
 * EMBEBIDO (`tipoNombre`/`tipoActivo` de `GET /equipos/:id`), NUNCA del
 * catálogo de activos (que no incluye tipos dados de baja — bug que
 * mostraba el UUID/código crudo). El alta sigue usando solo tipos activos
 * del selector y envía `tipoComponenteCodigo`.
 */

const EQUIPO_ID = "55555555-5555-5555-5555-555555555555";

const TIPOS_ACTIVOS = [
  { codigo: "RAM", nombre: "Memoria RAM" },
  { codigo: "DISCO", nombre: "Disco rígido" },
];

function mockBackend() {
  server.use(http.get("/api/equipos/tipos-componente", () => HttpResponse.json(TIPOS_ACTIVOS)));
}

describe("EquipoComponentesSection", () => {
  beforeEach(() => mockBackend());

  it("resuelve el nombre del componente ya asignado desde el dato embebido y avisa 'Dado de baja' si el tipo ya no está activo", async () => {
    const componentes = [
      {
        id: "c1",
        equipoId: EQUIPO_ID,
        tipoComponenteCodigo: "TECLADO",
        tipoNombre: "Teclado mecánico",
        tipoActivo: false,
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={componentes} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    expect(await screen.findByText(/teclado mecánico/i)).toBeInTheDocument();
    expect(screen.getByText(/dado de baja/i)).toBeInTheDocument();
  });

  it("un componente con tipo activo NO muestra el aviso 'Dado de baja'", async () => {
    const componentes = [
      {
        id: "c2",
        equipoId: EQUIPO_ID,
        tipoComponenteCodigo: "RAM",
        tipoNombre: "Memoria RAM",
        tipoActivo: true,
        descripcion: null,
        numeroSerie: null,
        capacidad: "16GB",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={componentes} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    expect(await screen.findByText(/memoria ram — 16gb/i)).toBeInTheDocument();
    expect(screen.queryByText(/dado de baja/i)).not.toBeInTheDocument();
  });

  it("el selector de alta solo ofrece tipos activos del catálogo", async () => {
    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={[]} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await screen.findByRole("option", { name: /memoria ram/i });
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(expect.arrayContaining(["Memoria RAM", "Disco rígido"]));
    expect(options).not.toContain("Teclado mecánico");
  });

  it("al dar de alta un componente, envía tipoComponenteCodigo con el código elegido", async () => {
    const user = userEvent.setup();
    let bodyRecibido: Record<string, unknown> | null = null;
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes`, async ({ request }) => {
        bodyRecibido = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "c3",
          equipoId: EQUIPO_ID,
          tipoComponenteCodigo: "DISCO",
          descripcion: null,
          numeroSerie: null,
          capacidad: "1TB",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }),
    );

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={[]} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await screen.findByRole("option", { name: /disco rígido/i });
    await user.selectOptions(screen.getByLabelText(/tipo/i), "DISCO");
    await user.type(screen.getByLabelText(/capacidad/i), "1TB");
    await user.click(screen.getByRole("button", { name: /agregar componente/i }));

    await waitFor(() => expect(bodyRecibido).not.toBeNull());
    expect(bodyRecibido).toMatchObject({ tipoComponenteCodigo: "DISCO" });
  });
});
