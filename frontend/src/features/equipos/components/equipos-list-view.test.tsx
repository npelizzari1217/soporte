import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionContext } from "@/shared/providers/session-provider";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquiposListView } from "./equipos-list-view";
import type { Equipo } from "../types";
import type { ModeloEquipo } from "@/features/modelos-equipo/types";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/equipos",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

beforeEach(() => {
  currentSearch = "";
  replaceMock.mockClear();
});

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

/**
 * R11 (sdd/baja-equipo-completo): filtro "Mostrar equipos dados de baja",
 * apagado por defecto y guiado por la URL; la exportación pide lo mismo que
 * la lista.
 */
describe("EquiposListView — filtro «Mostrar equipos dados de baja»", () => {
  const VIGENTE = buildEquipo({ id: "11111111-1111-4111-8111-111111111111", nombre: "PC-VIGENTE" });
  const DE_BAJA = buildEquipo({
    id: "22222222-2222-4222-8222-222222222222",
    nombre: "PC-DE-BAJA",
    activo: false,
    baja: {
      destino: "DESCARTE",
      categoria: "ROTURA",
      motivo: null,
      fecha: "2026-05-01T12:00:00.000Z",
      usuarioId: null,
    },
  });
  const user = () => buildUser({ permisos: ["EQUIPOS:LECTURA"] });

  /** Responde como el backend: sin `incluirBajas=true` solo los vigentes. */
  function mockListaConBajas(pedidas: string[]) {
    server.use(
      http.get("/api/equipos", ({ request }) => {
        const url = new URL(request.url);
        pedidas.push(url.search);
        return HttpResponse.json(
          url.searchParams.get("incluirBajas") === "true" ? [VIGENTE, DE_BAJA] : [VIGENTE],
        );
      }),
    );
  }

  it("por defecto muestra solo el vigente y la petición no manda incluirBajas", async () => {
    const pedidas: string[] = [];
    mockListaConBajas(pedidas);
    renderWithProviders(<EquiposListView />, { user: user() });

    expect(await screen.findByText("PC-VIGENTE")).toBeInTheDocument();
    expect(screen.queryByText("PC-DE-BAJA")).not.toBeInTheDocument();
    expect(pedidas).toEqual([""]);
    expect(screen.getByRole("checkbox", { name: /mostrar equipos dados de baja/i })).not.toBeChecked();
  });

  it("al tildar la casilla navega con ?incluirBajas=true", async () => {
    mockListaConBajas([]);
    renderWithProviders(<EquiposListView />, { user: user() });

    await userEvent.click(await screen.findByRole("checkbox", { name: /mostrar equipos dados de baja/i }));

    expect(replaceMock).toHaveBeenCalledWith("/equipos?incluirBajas=true");
  });

  it("con ?incluirBajas=true en la URL se piden ambos y el dado de baja lleva «Baja»", async () => {
    currentSearch = "incluirBajas=true";
    const pedidas: string[] = [];
    mockListaConBajas(pedidas);
    renderWithProviders(<EquiposListView />, { user: user() });

    const fila = (await screen.findByText("PC-DE-BAJA")).closest("tr");
    expect(fila).not.toBeNull();
    expect(within(fila as HTMLElement).getByText("Baja")).toBeInTheDocument();
    const filaVigente = screen.getByText("PC-VIGENTE").closest("tr") as HTMLElement;
    expect(within(filaVigente).getByText("Activo")).toBeInTheDocument();
    expect(pedidas).toEqual(["?incluirBajas=true"]);
    expect(screen.getByRole("checkbox", { name: /mostrar equipos dados de baja/i })).toBeChecked();
  });

  it("el botón de exportación pide el mismo parámetro que la lista", async () => {
    const exportaciones: string[] = [];
    server.use(
      http.get("/api/equipos/export", ({ request }) => {
        exportaciones.push(new URL(request.url).search);
        return new HttpResponse("Nombre\n", { headers: { "content-type": "text/csv" } });
      }),
    );
    mockListaConBajas([]);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));

    const { unmount } = renderWithProviders(<EquiposListView />, { user: user() });
    await userEvent.click(await screen.findByRole("button", { name: /exportar a excel/i }));
    await waitFor(() => expect(exportaciones).toEqual([""]));
    unmount();

    currentSearch = "incluirBajas=true";
    renderWithProviders(<EquiposListView />, { user: user() });
    await userEvent.click(await screen.findByRole("button", { name: /exportar a excel/i }));
    await waitFor(() => expect(exportaciones).toEqual(["", "?incluirBajas=true"]));
    vi.unstubAllGlobals();
  });

  it("invalidar [\"equipos\"] refresca la variante activa y marca la inactiva", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pedidas: string[] = [];
    mockListaConBajas(pedidas);
    queryClient.setQueryData(["equipos", { incluirBajas: true }], [VIGENTE, DE_BAJA]);
    render(
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={{ user: user(), isLoading: false, setUser: () => {} }}>
          <EquiposListView />
        </SessionContext.Provider>
      </QueryClientProvider>,
    );
    await screen.findByText("PC-VIGENTE");
    expect(pedidas).toEqual([""]);

    await queryClient.invalidateQueries({ queryKey: ["equipos"] });

    expect(pedidas).toEqual(["", ""]);
    expect(queryClient.getQueryState(["equipos", { incluirBajas: true }])?.isInvalidated).toBe(true);
  });
});
