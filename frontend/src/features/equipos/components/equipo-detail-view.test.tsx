import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquipoDetailView } from "./equipo-detail-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const EQUIPO_ID = "44444444-4444-4444-4444-444444444444";

const EQUIPO_DETALLE = {
  id: EQUIPO_ID,
  nombre: "Notebook Dell",
  numeroSerie: "SN-001",
  marca: "Dell",
  modelo: "Latitude",
  fechaAdquisicion: null,
  ubicacionId: null,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  componentes: [
    {
      id: "c1",
      equipoId: EQUIPO_ID,
      insumoId: "11111111-1111-4111-8111-111111111111",
      tipoNombre: "Memoria RAM",
      tipoActivo: true,
      descripcion: "RAM 16GB",
      numeroSerie: null,
      capacidad: "16GB",
      activo: true,
      deletedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const RESUMEN_VACIO = {
  equipoId: EQUIPO_ID,
  nombre: "Notebook Dell",
  ticketsAbiertos: 0,
  largoMaximoTexto: { VEJEZ: 450, DONACION: 450, ROTURA: 450, OTRA: 450 },
  piezas: [],
};

function mockBackend() {
  server.use(
    http.get(`/api/equipos/${EQUIPO_ID}`, () => HttpResponse.json(EQUIPO_DETALLE)),
    http.get("/api/usuarios", () => HttpResponse.json([])),
  );
}

describe("EquipoDetailView — consume componentes embebidos de GET /equipos/:id (item 1 backend-gaps)", () => {
  beforeEach(() => mockBackend());

  it("renderiza componentes ya existentes SIN necesidad de agregarlos vía mutación", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    expect(await screen.findByText("Memoria RAM")).toBeInTheDocument();
    expect(screen.getByText("16GB")).toBeInTheDocument();
  });

  it("muestra el botón «Agregar componente» del toolbar (único, WU3 retiró el form inline), con permiso equipo:gestionar", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    // Un solo botón "Agregar componente": el trigger del toolbar. El form
    // inline de `EquipoComponentesSection` fue retirado en WU3/PR-B.
    const botones = await screen.findAllByRole("button", { name: /agregar componente/i });
    expect(botones).toHaveLength(1);
  });

  it("oculta el botón «Agregar componente» del toolbar sin permiso equipo:gestionar", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: [] }),
    });

    await screen.findByText("Notebook Dell");
    expect(screen.queryByRole("button", { name: /agregar componente/i })).not.toBeInTheDocument();
  });

  /** WU-8: un solo flujo de alta; el botón «Instalar desde depósito» ya no existe. */
  it("no muestra «Instalar desde depósito»: hay un solo botón de alta", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    expect(await screen.findAllByRole("button", { name: /agregar componente/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /instalar desde depósito/i })).not.toBeInTheDocument();
  });
});

describe("EquipoDetailView — borrado de un equipo cargado por error (baja-equipo-completo, R13)", () => {
  beforeEach(() => {
    mockBackend();
    vi.mocked(toast.error).mockClear();
  });

  it("el botón del borrado dice «Eliminar equipo (cargado por error)» y «Dar de baja» es único", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:BORRADO"] }),
    });

    expect(await screen.findByRole("button", { name: "Eliminar equipo (cargado por error)" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^dar de baja$/i })).toHaveLength(1);
  });

  it("sin EQUIPOS:BORRADO no se ofrece «Dar de baja»", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    await screen.findByText("Notebook Dell");
    expect(screen.queryByRole("button", { name: /^dar de baja$/i })).not.toBeInTheDocument();
  });

  it("«Dar de baja» abre el diálogo de baja del equipo completo", async () => {
    server.use(http.get(`/api/equipos/${EQUIPO_ID}/baja/resumen`, () => HttpResponse.json(RESUMEN_VACIO)));
    const user = userEvent.setup();
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:BORRADO"] }),
    });

    await user.click(await screen.findByRole("button", { name: /^dar de baja$/i }));

    expect(await screen.findByText("Dar de baja el equipo")).toBeInTheDocument();
  });

  it("la confirmación aclara que es solo para equipos cargados por error y sugiere dar de baja", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:BORRADO"] }),
    });

    await user.click(await screen.findByRole("button", { name: "Eliminar equipo (cargado por error)" }));

    expect(
      await screen.findByText(/Solo para equipos cargados por error\. Si tiene piezas instaladas, dalo de baja\./),
    ).toBeInTheDocument();
  });

  it("el 422 del borrado con piezas activas muestra el mensaje del backend con la cantidad", async () => {
    server.use(
      http.delete(`/api/equipos/${EQUIPO_ID}`, () =>
        HttpResponse.json(
          { message: "El equipo tiene 2 piezas activas: dalo de baja en lugar de borrarlo." },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:BORRADO"] }),
    });

    await user.click(await screen.findByRole("button", { name: "Eliminar equipo (cargado por error)" }));
    await user.click(await screen.findByRole("button", { name: "Eliminar equipo" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("2 piezas activas")));
  });
});

describe("EquipoDetailView — ficha de solo lectura de un equipo dado de baja (baja-equipo-completo, R8)", () => {
  const PERMISOS = ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"];
  const COMPONENTE_RETIRADO = {
    ...EQUIPO_DETALLE.componentes[0],
    id: "c2",
    tipoNombre: "Disco rígido",
    capacidad: "1TB",
    activo: false,
    deletedAt: "2026-02-01T00:00:00.000Z",
    bajaDestino: "STOCK_USADO" as const,
  };
  const EQUIPO_DADO_DE_BAJA = {
    ...EQUIPO_DETALLE,
    activo: false,
    baja: {
      destino: "DESCARTE" as const,
      categoria: "ROTURA" as const,
      motivo: "Se quemó la fuente",
      fecha: "2026-03-01T15:30:00.000Z",
      usuarioId: null,
    },
    componentes: [
      {
        ...EQUIPO_DETALLE.componentes[0],
        activo: false,
        deletedAt: "2026-03-01T15:30:00.000Z",
        bajaDestino: "DESCARTE" as const,
      },
      COMPONENTE_RETIRADO,
    ],
  };

  beforeEach(() => {
    server.use(
      http.get(`/api/equipos/${EQUIPO_ID}`, () =>
        HttpResponse.json(EQUIPO_DADO_DE_BAJA),
      ),
      http.get("/api/usuarios", () => HttpResponse.json([])),
    );
  });

  it("muestra el banner con destino, categoría, motivo y fecha", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: PERMISOS }),
    });

    const banner = await screen.findByTestId("equipo-baja-banner");
    expect(banner).toHaveTextContent("Equipo dado de baja");
    expect(banner).toHaveTextContent("Categoría: Rotura");
    expect(banner).toHaveTextContent("Destino: Piezas descartadas");
    expect(banner).toHaveTextContent("Motivo: Se quemó la fuente");
    expect(banner).toHaveTextContent(/Fecha: .*2026/);
  });

  it("no ofrece agregar, editar, dar de baja, eliminar, retirar ni reactivar, aun con todos los permisos", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: PERMISOS }),
    });

    await screen.findByTestId("equipo-baja-banner");
    expect(
      screen.queryByRole("button", { name: /agregar componente/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /editar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dar de baja/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /eliminar equipo/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reactivar/i }),
    ).not.toBeInTheDocument();
  });

  it("los componentes retirados y su destino siguen visibles", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: PERMISOS }),
    });

    expect(await screen.findByText("Memoria RAM")).toBeInTheDocument();
    expect(screen.getByText("Disco rígido")).toBeInTheDocument();
    expect(screen.getByText(/devuelto al stock:/i)).toBeInTheDocument();
    expect(screen.getByText(/descartado:/i)).toBeInTheDocument();
  });

  it("un equipo vigente no muestra el banner y conserva todas las acciones", async () => {
    mockBackend();
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: PERMISOS }),
    });

    await screen.findByText("Memoria RAM");
    expect(screen.queryByTestId("equipo-baja-banner")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /agregar componente/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^dar de baja$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Eliminar equipo (cargado por error)",
      }),
    ).toBeInTheDocument();
  });
});
