import type { ReactNode } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionContext } from "@/shared/providers/session-provider";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquipoComponentesSection } from "./equipo-componentes-section";

/**
 * EquipoComponentesSection — item 1 backend-gaps (PR6, sdd/tipos-componente-master):
 * el nombre/estado de cada componente ya asignado se resuelve del dato
 * EMBEBIDO (`tipoNombre`/`tipoActivo` de `GET /equipos/:id`), NUNCA del
 * catálogo de activos (que no incluye tipos dados de baja — bug que
 * mostraba el UUID/código crudo). Sin nombre de tipo se muestra "—".
 */

const EQUIPO_ID = "55555555-5555-5555-5555-555555555555";

function mockBackend() {
  // Sin endpoints que mockear: el detalle llega por props.
}

describe("EquipoComponentesSection", () => {
  beforeEach(() => mockBackend());

  it("resuelve el nombre del componente ya asignado desde el dato embebido y avisa 'Dado de baja' si el tipo ya no está activo", async () => {
    const componentes = [
      {
        id: "c1",
        equipoId: EQUIPO_ID,
        insumoId: "11111111-1111-4111-8111-111111111111",
        tipoNombre: "Teclado mecánico",
        tipoActivo: false,
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
        activo: true,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={componentes} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    expect(await screen.findByText(/teclado mecánico/i)).toBeInTheDocument();
    expect(screen.getByText(/dado de baja/i)).toBeInTheDocument();
  });

  it("sin nombre de tipo muestra '—' y no avisa 'Dado de baja'", async () => {
    const componentes = [
      {
        id: "c-sin-tipo",
        equipoId: EQUIPO_ID,
        insumoId: "11111111-1111-4111-8111-111111111111",
        tipoNombre: null,
        tipoActivo: false,
        descripcion: "Slot 1",
        numeroSerie: null,
        capacidad: null,
        activo: true,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={componentes} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    const fila = await screen.findByTestId("componente-c-sin-tipo");
    expect(within(fila).getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText(/dado de baja/i)).not.toBeInTheDocument();
  });

  it("un componente con tipo activo NO muestra el aviso 'Dado de baja'", async () => {
    const componentes = [
      {
        id: "c2",
        equipoId: EQUIPO_ID,
        insumoId: "11111111-1111-4111-8111-111111111111",
        tipoNombre: "Memoria RAM",
        tipoActivo: true,
        descripcion: null,
        numeroSerie: null,
        capacidad: "16GB",
        activo: true,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={componentes} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    const fila = within(await screen.findByTestId("componente-c2"));
    const celdas = fila.getAllByRole("cell");
    expect(celdas[0]).toHaveTextContent("Memoria RAM");
    expect(celdas[3]).toHaveTextContent("16GB");
    expect(screen.queryByText(/dado de baja/i)).not.toBeInTheDocument();
  });

  it("regresión: si llega un `componentes` fresco con el tipo ya desactivado, muestra 'Dado de baja' SIN recarga (sincroniza el cache local)", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider
          value={{ user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }), isLoading: false, setUser: () => {} }}
        >
          {children}
        </SessionContext.Provider>
      </QueryClientProvider>
    );
    const base = {
      id: "c9",
      equipoId: EQUIPO_ID,
      insumoId: "11111111-1111-4111-8111-111111111111",
      tipoNombre: "Memoria RAM",
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
      activo: true,
      deletedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const { rerender } = render(
      <EquipoComponentesSection equipoId={EQUIPO_ID} componentes={[{ ...base, tipoActivo: true }]} />,
      { wrapper },
    );
    expect(await screen.findByText(/memoria ram/i)).toBeInTheDocument();
    expect(screen.queryByText(/dado de baja/i)).not.toBeInTheDocument();

    // Simula el detalle del equipo re-fetcheado tras desactivar el tipo desde el ABM.
    rerender(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={[{ ...base, tipoActivo: false }]} />);

    expect(await screen.findByText(/dado de baja/i)).toBeInTheDocument();
  });

  it("N3: ya no expone un form de alta inline (retirado, alta vive en el toolbar vía ComponenteCreateDialog)", async () => {
    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={[]} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    expect(screen.queryByRole("button", { name: /agregar componente/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^tipo$/i)).not.toBeInTheDocument();
  });

  it("N1: los encabezados de columna son Tipo / Descripción / Nro de serie / Capacidad / Acciones (sr-only), en ese orden", async () => {
    const componentes = [
      {
        id: "c1",
        equipoId: EQUIPO_ID,
        insumoId: "11111111-1111-4111-8111-111111111111",
        tipoNombre: "Memoria RAM",
        tipoActivo: true,
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
        activo: true,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={componentes} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    const headers = await screen.findAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Tipo", "Descripción", "Nro de serie", "Capacidad", "Acciones"]);
  });

  it("N2: descripción y número de serie ausentes renderizan '—' con aria-hidden", async () => {
    const componentes = [
      {
        id: "c-vacio",
        equipoId: EQUIPO_ID,
        insumoId: "11111111-1111-4111-8111-111111111111",
        tipoNombre: "Memoria RAM",
        tipoActivo: true,
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
        activo: true,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={componentes} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    const fila = within(await screen.findByTestId("componente-c-vacio"));
    const celdas = fila.getAllByRole("cell");
    // Descripción (1), Nro de serie (2), Capacidad (3): las tres vacías en este fixture.
    for (const indice of [1, 2, 3]) {
      expect(celdas[indice]).toHaveTextContent("—");
      const marcador = celdas[indice].querySelector('[aria-hidden="true"]');
      expect(marcador).not.toBeNull();
      expect(marcador).toHaveTextContent("—");
    }
  });

  it("N4: sin componentes no renderiza la tabla, muestra 'Sin componentes.'", async () => {
    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={[]} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Sin componentes.")).toBeVisible();
  });

  it("un componente dado de baja se muestra tachado/gris, SIN Editar/Dar de baja, CON 'Reactivar'; uno activo tiene Editar/Dar de baja", async () => {
    const componentes = [
      {
        id: "activo-1",
        equipoId: EQUIPO_ID,
        insumoId: "11111111-1111-4111-8111-111111111111",
        tipoNombre: "Memoria RAM",
        tipoActivo: true,
        descripcion: null,
        numeroSerie: null,
        capacidad: "8GB",
        activo: true,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "baja-1",
        equipoId: EQUIPO_ID,
        insumoId: "11111111-1111-4111-8111-111111111111",
        tipoNombre: "Disco rígido",
        tipoActivo: true,
        descripcion: null,
        numeroSerie: null,
        capacidad: "1TB",
        activo: false,
        deletedAt: "2026-02-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    ];

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={componentes} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    const filaActiva = within(await screen.findByTestId("componente-activo-1"));
    const celdasActiva = filaActiva.getAllByRole("cell");
    expect(celdasActiva[0]).toHaveTextContent("Memoria RAM");
    expect(celdasActiva[0].className).not.toContain("line-through");
    expect(filaActiva.getByLabelText(/editar componente/i)).toBeInTheDocument();
    expect(filaActiva.getByLabelText(/dar de baja componente/i)).toBeInTheDocument();
    expect(filaActiva.queryByRole("button", { name: /reactivar/i })).not.toBeInTheDocument();

    const filaBaja = within(screen.getByTestId("componente-baja-1"));
    const celdasBaja = filaBaja.getAllByRole("cell");
    expect(celdasBaja[0]).toHaveTextContent("Disco rígido");
    expect(celdasBaja[0].className).toContain("line-through");
    expect(filaBaja.queryByLabelText(/editar componente/i)).not.toBeInTheDocument();
    expect(filaBaja.queryByLabelText(/dar de baja componente/i)).not.toBeInTheDocument();
    expect(filaBaja.getByRole("button", { name: /reactivar/i })).toBeInTheDocument();
    expect(filaBaja.getByText(/dado de baja:/i)).toBeInTheDocument();
  });

  it("al reactivar, dispara PATCH /equipos/:id/componentes/:componenteId/reactivar", async () => {
    const user = userEvent.setup();
    let metodoRecibido: string | null = null;
    server.use(
      http.patch(`/api/equipos/${EQUIPO_ID}/componentes/baja-1/reactivar`, ({ request }) => {
        metodoRecibido = request.method;
        return HttpResponse.json({
          id: "baja-1",
          equipoId: EQUIPO_ID,
          descripcion: null,
          numeroSerie: null,
          capacidad: "1TB",
          activo: true,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-02T00:00:00.000Z",
        });
      }),
    );

    const componentes = [
      {
        id: "baja-1",
        equipoId: EQUIPO_ID,
        insumoId: "11111111-1111-4111-8111-111111111111",
        tipoNombre: "Disco rígido",
        tipoActivo: true,
        descripcion: null,
        numeroSerie: null,
        capacidad: "1TB",
        activo: false,
        deletedAt: "2026-02-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    ];

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={componentes} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    await user.click(await screen.findByRole("button", { name: /reactivar/i }));

    await waitFor(() => expect(metodoRecibido).toBe("PATCH"));
  });

  it("la papelera de un componente activo abre el diálogo de retiro en vez de dar de baja directo", async () => {
    const user = userEvent.setup();
    const componentes = [
      {
        id: "activo-1",
        equipoId: EQUIPO_ID,
        insumoId: "11111111-1111-4111-8111-111111111111",
        tipoNombre: "Memoria RAM",
        tipoActivo: true,
        descripcion: null,
        numeroSerie: null,
        capacidad: "8GB",
        activo: true,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    renderWithProviders(<EquipoComponentesSection equipoId={EQUIPO_ID} componentes={componentes} />, {
      user: buildUser({ permisos: ["EQUIPOS:BORRADO"] }),
    });

    await user.click(await screen.findByRole("button", { name: /dar de baja componente/i }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(/devolver al stock como usado/i);
  });

  describe("rótulos de baja y Reactivar según el destino", () => {
    const base = {
      equipoId: EQUIPO_ID,
      insumoId: "11111111-1111-4111-8111-111111111111",
      tipoNombre: "Disco rígido",
      tipoActivo: true,
      descripcion: null,
      numeroSerie: null,
      capacidad: "1TB",
      activo: false,
      deletedAt: "2026-02-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    };
    const componentes = [
      {
        ...base,
        id: "devuelto",
        bajaDestino: "STOCK_USADO" as const,
        bajaSinSalidaPrevia: false,
      },
      {
        ...base,
        id: "sin-salida",
        bajaDestino: "STOCK_USADO" as const,
        bajaSinSalidaPrevia: true,
      },
      { ...base, id: "descartado", bajaDestino: "DESCARTE" as const },
      { ...base, id: "legado", bajaDestino: null },
    ];

    function renderTodos() {
      renderWithProviders(
        <EquipoComponentesSection
          equipoId={EQUIPO_ID}
          componentes={componentes}
        />,
        {
          user: buildUser({
            permisos: ["EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"],
          }),
        },
      );
    }

    it("rotula cada baja con su destino y conserva 'Dado de baja' para el legado", async () => {
      renderTodos();

      const devuelto = within(await screen.findByTestId("componente-devuelto"));
      expect(devuelto.getByText(/devuelto al stock:/i)).toBeInTheDocument();
      expect(
        devuelto.queryByText(/sin salida registrada del depósito/i),
      ).not.toBeInTheDocument();
      expect(
        within(screen.getByTestId("componente-descartado")).getByText(
          /descartado:/i,
        ),
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId("componente-legado")).getByText(
          /dado de baja:/i,
        ),
      ).toBeInTheDocument();
    });

    it("marca 'sin salida registrada del depósito' solo cuando la devolución no tenía salida previa", async () => {
      renderTodos();

      const sinSalida = within(
        await screen.findByTestId("componente-sin-salida"),
      );
      expect(
        sinSalida.getByText(/sin salida registrada del depósito/i),
      ).toBeInTheDocument();
    });

    it("oculta Reactivar tras devolver al stock y lo conserva para descartado y legado", async () => {
      renderTodos();

      await screen.findByTestId("componente-devuelto");
      for (const id of ["devuelto", "sin-salida"]) {
        expect(
          within(screen.getByTestId(`componente-${id}`)).queryByRole("button", {
            name: /reactivar/i,
          }),
        ).toBeNull();
      }
      for (const id of ["descartado", "legado"]) {
        expect(
          within(screen.getByTestId(`componente-${id}`)).getByRole("button", {
            name: /reactivar/i,
          }),
        ).toBeInTheDocument();
      }
    });
  });
});
