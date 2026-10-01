import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { UnidadHistorialDialog, ETIQUETA_EVENTO_UNIDAD } from "./unidad-historial-dialog";
import { UnidadesInsumoSection } from "./unidades-insumo-section";
import { TIPOS_EVENTO_UNIDAD } from "../types";
import type { EventoUnidad, UnidadInsumo } from "../types";

const LECTOR = buildUser({ permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] });
const INSUMO_ID = "ins-1";

const UNIDAD: UnidadInsumo = {
  id: "u-1",
  insumoId: INSUMO_ID,
  numeroSerie: "SN-001",
  condicion: "USADO",
  estado: "INSTALADA",
  equipoId: "eq-2",
  equipoNombre: "PC Contaduría",
};

let contador = 0;
function evento(overrides: Partial<EventoUnidad>): EventoUnidad {
  contador += 1;
  return {
    id: `ev-${contador}`,
    tipo: "INGRESO",
    createdAt: `2026-03-0${Math.min(contador, 9)}T13:30:00.000Z`,
    usuarioId: "usr-1",
    movimientoId: null,
    componenteId: null,
    serialAnterior: null,
    serialNuevo: null,
    motivo: null,
    equipoId: null,
    equipoNombre: null,
    sectorId: null,
    sectorNombre: null,
    ...overrides,
  };
}

function mockHistorial(eventos: EventoUnidad[]): void {
  server.use(
    http.get("/api/insumos/:insumoId/unidades/:unidadId/historial", () => HttpResponse.json(eventos)),
    http.get("/api/usuarios", () =>
      HttpResponse.json([{ id: "usr-1", nombre: "Ana", apellido: "Gómez", rol: "TECNICO" }]),
    ),
  );
}

function abrir(unidad: UnidadInsumo | null = UNIDAD) {
  return renderWithProviders(
    <UnidadHistorialDialog insumoId={INSUMO_ID} unidad={unidad} onClose={() => {}} />,
    { user: LECTOR },
  );
}

/** Los títulos de los eventos, en el orden en que aparecen en pantalla. */
function titulosEnPantalla(): string[] {
  return screen.getAllByRole("listitem").map((li) => li.firstElementChild?.textContent ?? "");
}

describe("UnidadHistorialDialog", () => {
  it("la vida completa se muestra en orden: ingreso, instalación en E1, retiro y instalación en E2", async () => {
    mockHistorial([
      evento({ tipo: "INGRESO" }),
      evento({ tipo: "INSTALACION", equipoId: "eq-1", equipoNombre: "PC Administración" }),
      evento({ tipo: "RETIRO_A_DEPOSITO", equipoId: "eq-1", equipoNombre: "PC Administración" }),
      evento({ tipo: "INSTALACION", equipoId: "eq-2", equipoNombre: "PC Contaduría" }),
    ]);
    abrir();

    await screen.findByText("Ingreso al depósito");
    expect(titulosEnPantalla()).toEqual([
      "Ingreso al depósito",
      "Instalación en un equipo",
      "Retiro al depósito",
      "Instalación en un equipo",
    ]);
    expect(screen.getAllByText("Equipo: PC Administración")).toHaveLength(2);
    expect(screen.getByText("Equipo: PC Contaduría")).toBeInTheDocument();
    expect(screen.getAllByText(/Ana Gómez/).length).toBeGreaterThan(0);
  });

  it("una unidad descartada muestra el descarte con su motivo", async () => {
    mockHistorial([
      evento({ tipo: "INGRESO" }),
      evento({ tipo: "INSTALACION", equipoId: "eq-1", equipoNombre: "PC Administración" }),
      evento({ tipo: "DESCARTE", motivo: "placa quemada" }),
    ]);
    abrir({ ...UNIDAD, estado: "DESCARTADA", equipoId: null, equipoNombre: null });

    expect(await screen.findByText("Descarte")).toBeInTheDocument();
    expect(screen.getByText("Motivo: placa quemada")).toBeInTheDocument();
  });

  it("una unidad entregada muestra la entrega con el sector leído del movimiento", async () => {
    mockHistorial([
      evento({ tipo: "INGRESO" }),
      evento({ tipo: "ENTREGA", movimientoId: "mov-9", sectorId: "sec-1", sectorNombre: "Administración" }),
    ]);
    abrir({ ...UNIDAD, estado: "ENTREGADA", equipoId: null, equipoNombre: null });

    expect(await screen.findByText("Entrega")).toBeInTheDocument();
    expect(screen.getByText("Sector: Administración")).toBeInTheDocument();
  });

  it("la corrección de serial muestra el serial anterior, el nuevo y el motivo", async () => {
    mockHistorial([
      evento({ tipo: "INGRESO" }),
      evento({
        tipo: "CORRECCION_SERIAL",
        serialAnterior: "SN-OLD",
        serialNuevo: "SN-001",
        motivo: "error de tipeo",
      }),
    ]);
    abrir();

    expect(await screen.findByText("Corrección de serial")).toBeInTheDocument();
    expect(screen.getByText("Serial anterior: SN-OLD")).toBeInTheDocument();
    expect(screen.getByText("Serial nuevo: SN-001")).toBeInTheDocument();
    expect(screen.getByText("Motivo: error de tipeo")).toBeInTheDocument();
  });

  it("una unidad recién creada muestra solo su ingreso, sin eventos anteriores", async () => {
    mockHistorial([evento({ tipo: "INGRESO" })]);
    abrir();

    await screen.findByText("Ingreso al depósito");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("cada tipo de evento que puede emitir el backend se lee con su propia etiqueta", async () => {
    mockHistorial(TIPOS_EVENTO_UNIDAD.map((tipo) => evento({ tipo })));
    abrir();

    await screen.findByText(ETIQUETA_EVENTO_UNIDAD.INGRESO);
    expect(titulosEnPantalla()).toEqual(TIPOS_EVENTO_UNIDAD.map((t) => ETIQUETA_EVENTO_UNIDAD[t]));
    expect(new Set(titulosEnPantalla()).size).toBe(TIPOS_EVENTO_UNIDAD.length);
  });

  it("una pieza devuelta de una entrega y una recuperada se distinguen por su etiqueta", async () => {
    mockHistorial([
      evento({ tipo: "DEVOLUCION_DE_ENTREGA", motivo: "volvió sin usar" }),
      evento({ tipo: "RECUPERACION", motivo: "estaba bien" }),
    ]);
    abrir();

    expect(await screen.findByText("Devolución de una entrega")).toBeInTheDocument();
    expect(screen.getByText("Recuperación de una pieza descartada")).toBeInTheDocument();
    expect(screen.getByText("Motivo: volvió sin usar")).toBeInTheDocument();
  });

  it("si la consulta falla muestra el error", async () => {
    server.use(
      http.get("/api/insumos/:insumoId/unidades/:unidadId/historial", () =>
        HttpResponse.json({ message: "x" }, { status: 500 }),
      ),
    );
    abrir();

    expect(await screen.findByText("No se pudo cargar el historial de la unidad.")).toBeInTheDocument();
  });

  it("sin unidad elegida no consulta ni muestra el diálogo", () => {
    let consultado = false;
    server.use(
      http.get("/api/insumos/:insumoId/unidades/:unidadId/historial", () => {
        consultado = true;
        return HttpResponse.json([]);
      }),
    );
    abrir(null);

    expect(screen.queryByText("Historial de la unidad")).not.toBeInTheDocument();
    expect(consultado).toBe(false);
  });
});

describe("UnidadesInsumoSection — historial", () => {
  it("el botón Historial de una fila abre el historial de ESA unidad", async () => {
    let pedida = "";
    server.use(
      http.get("/api/insumos/:insumoId/unidades", () =>
        HttpResponse.json([UNIDAD, { ...UNIDAD, id: "u-2", numeroSerie: "SN-002" }]),
      ),
      http.get("/api/insumos/:insumoId/unidades/:unidadId/historial", ({ params }) => {
        pedida = String(params.unidadId);
        return HttpResponse.json([evento({ tipo: "INGRESO" })]);
      }),
      http.get("/api/usuarios", () => HttpResponse.json([])),
    );
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: LECTOR });

    await userEvent.click(await screen.findByRole("button", { name: "Ver historial de SN-002" }));

    expect(await screen.findByText("Ingreso al depósito")).toBeInTheDocument();
    expect(screen.getByText("Serial SN-002")).toBeInTheDocument();
    expect(pedida).toBe("u-2");
  });
});
