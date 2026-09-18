import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquiposListView } from "./equipos-list-view";
import type { Equipo } from "../types";
import type { ModeloEquipo } from "@/features/modelos-equipo/types";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

/** El inventario se consulta siempre (sin gate de permiso backend). */
function mockEquipos() {
  server.use(http.get("/api/equipos", () => HttpResponse.json([])));
}

describe("EquiposListView — gate del botón «Nuevo ticket de soporte»", () => {
  const BOTON = /nuevo ticket de soporte/i;

  it("con TICKETS:ALTAS pero SIN módulo TICKETS → el botón NO se muestra", async () => {
    // El endpoint POST /soporte exige @RequiereAcciones('TICKETS:ALTAS') (WU-7.3);
    // sin el módulo, el botón daba 403 al enviar. Debe ocultarse (regresión del LEAK).
    mockEquipos();
    renderWithProviders(<EquiposListView />, {
      user: buildUser({ permisos: ["TICKETS:ALTAS"], modulos: ["EQUIPOS"] }),
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: BOTON })).not.toBeInTheDocument(),
    );
  });

  it("con TICKETS:ALTAS Y módulo TICKETS → el botón se muestra", async () => {
    mockEquipos();
    renderWithProviders(<EquiposListView />, {
      user: buildUser({ permisos: ["TICKETS:ALTAS"], modulos: ["EQUIPOS", "TICKETS"] }),
    });
    expect(await screen.findByRole("button", { name: BOTON })).toBeInTheDocument();
  });
});

// WU-7.6: el gate de ACCESO al inventario pasa a EQUIPOS:LECTURA (no
// EQUIPOS:ALTAS, deviación declarada vs. el mapeo mecánico del design) — un
// lector sin permiso de alta debe VER la tabla igual, solo sin el botón
// "Nuevo equipo".
describe("EquiposListView — gate del inventario (EQUIPOS:LECTURA/ALTAS)", () => {
  it("sin EQUIPOS:LECTURA → no ve el inventario", async () => {
    mockEquipos();
    renderWithProviders(<EquiposListView />, { user: buildUser({ permisos: [] }) });
    expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
  });

  it("con EQUIPOS:LECTURA pero SIN EQUIPOS:ALTAS → ve la tabla, NO ve «Nuevo equipo»", async () => {
    mockEquipos();
    renderWithProviders(<EquiposListView />, {
      user: buildUser({ permisos: ["EQUIPOS:LECTURA"] }),
    });
    await waitFor(() => expect(screen.queryByText(/no tenés permiso/i)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /nuevo equipo/i })).not.toBeInTheDocument();
  });

  it("con EQUIPOS:LECTURA Y EQUIPOS:ALTAS → ve «Nuevo equipo»", async () => {
    mockEquipos();
    renderWithProviders(<EquiposListView />, {
      user: buildUser({ permisos: ["EQUIPOS:LECTURA", "EQUIPOS:ALTAS"] }),
    });
    expect(await screen.findByRole("button", { name: /nuevo equipo/i })).toBeInTheDocument();
  });
});

const MODELO_HP: ModeloEquipo = {
  id: "88888888-8888-4888-8888-888888888888",
  marca: "HP",
  modelo: "LaserJet Pro M404",
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function buildEquipo(overrides: Partial<Equipo>): Equipo {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    nombre: "Notebook Dell",
    numeroSerie: null,
    marca: null,
    modelo: null,
    modeloEquipoId: null,
    fechaAdquisicion: null,
    ubicacion: null,
    importe: null,
    fechaValoracion: null,
    observaciones: null,
    valorResidual: null,
    fechaValorResidual: null,
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * ADR-2/ADR-3 (design de modelos-equipo-catalogo-y-compatibilidad): la
 * columna `Marca` resuelve `modeloEquipoId` contra el catálogo distinguiendo
 * los cuatro desenlaces posibles — colapsarlos es exactamente el defecto que
 * `resolverDeCatalogo` existe para prevenir.
 */
describe("EquiposListView — columna Marca resuelta contra el catálogo", () => {
  it("ENCONTRADA muestra «marca modelo» del catálogo", async () => {
    server.use(
      http.get("/api/equipos", () =>
        HttpResponse.json([buildEquipo({ modeloEquipoId: MODELO_HP.id })]),
      ),
      http.get("/api/modelos-equipo", () => HttpResponse.json([MODELO_HP])),
    );
    renderWithProviders(<EquiposListView />, { user: buildUser({ permisos: ["EQUIPOS:LECTURA"] }) });

    expect(await screen.findByText("HP LaserJet Pro M404")).toBeInTheDocument();
  });

  it("CARGANDO muestra la etiqueta de carga mientras el catálogo resuelve", async () => {
    let liberar: () => void = () => {};
    const enVuelo = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    server.use(
      http.get("/api/equipos", () =>
        HttpResponse.json([buildEquipo({ modeloEquipoId: MODELO_HP.id })]),
      ),
      http.get("/api/modelos-equipo", async () => {
        await enVuelo;
        return HttpResponse.json([MODELO_HP]);
      }),
    );
    renderWithProviders(<EquiposListView />, { user: buildUser({ permisos: ["EQUIPOS:LECTURA"] }) });

    expect(await screen.findByText("Cargando…")).toBeInTheDocument();
    liberar();
    expect(await screen.findByText("HP LaserJet Pro M404")).toBeInTheDocument();
  });

  it("NO_DISPONIBLE muestra que el catálogo no cargó, no que esté vacío", async () => {
    server.use(
      http.get("/api/equipos", () =>
        HttpResponse.json([buildEquipo({ modeloEquipoId: MODELO_HP.id })]),
      ),
      http.get("/api/modelos-equipo", () => new HttpResponse(null, { status: 500 })),
    );
    renderWithProviders(<EquiposListView />, { user: buildUser({ permisos: ["EQUIPOS:LECTURA"] }) });

    expect(await screen.findByText("Sin datos del catálogo")).toBeInTheDocument();
  });

  it("FUERA_DE_CATALOGO muestra que el modelo ya no está en el catálogo", async () => {
    server.use(
      http.get("/api/equipos", () =>
        HttpResponse.json([buildEquipo({ modeloEquipoId: MODELO_HP.id })]),
      ),
      http.get("/api/modelos-equipo", () => HttpResponse.json([])),
    );
    renderWithProviders(<EquiposListView />, { user: buildUser({ permisos: ["EQUIPOS:LECTURA"] }) });

    expect(await screen.findByText("Fuera del catálogo")).toBeInTheDocument();
  });

  it("sin modeloEquipoId sigue mostrando la marca de texto libre, sin depender del catálogo", async () => {
    server.use(
      http.get("/api/equipos", () =>
        HttpResponse.json([buildEquipo({ marca: "Compaq", modeloEquipoId: null })]),
      ),
      // Nunca resuelve: si la celda dependiera del catálogo para este caso,
      // el test se colgaría en el `findByText` de abajo.
      http.get("/api/modelos-equipo", () => new Promise(() => {})),
    );
    renderWithProviders(<EquiposListView />, { user: buildUser({ permisos: ["EQUIPOS:LECTURA"] }) });

    expect(await screen.findByText("Compaq")).toBeInTheDocument();
  });
});
