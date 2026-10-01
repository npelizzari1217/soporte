import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { UnidadesInsumoSection } from "./unidades-insumo-section";
import type { StockInsumo, UnidadInsumo } from "../types";

const INSUMO_ID = "ins-1";
const ALTAS = buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:ALTAS"], modulos: ["INSUMOS"] });
const AJUSTAR = buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:AJUSTAR"], modulos: ["INSUMOS"] });
const LECTOR = buildUser({ permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] });

function buildUnidad(overrides: Partial<UnidadInsumo> = {}): UnidadInsumo {
  return {
    id: "u-1",
    insumoId: INSUMO_ID,
    numeroSerie: "SN-001",
    condicion: "NUEVO",
    estado: "ENTREGADA",
    equipoId: null,
    equipoNombre: null,
    ...overrides,
  };
}

const ENTREGADA = buildUnidad();
const DESCARTADA = buildUnidad({ id: "u-2", numeroSerie: "SN-002", estado: "DESCARTADA" });
const DESCARTADA_PENDIENTE = buildUnidad({ id: "u-3", numeroSerie: null, estado: "DESCARTADA" });

function mockUnidades(unidades: UnidadInsumo[], admiteUsado = true): void {
  const stock: StockInsumo = {
    insumoId: INSUMO_ID,
    stock: 0,
    saldos: { NUEVO: 0, USADO: 0 },
    admiteUsado,
    stockMinimo: null,
    estadoReposicion: "SIN_PUNTO_DEFINIDO",
    seguimiento: "SERIE",
    pendientesDeSerie: 0,
  };
  server.use(
    http.get("/api/insumos/:insumoId/unidades", () => HttpResponse.json(unidades)),
    http.get("/api/insumos/:insumoId/stock", () => HttpResponse.json(stock)),
  );
}

function mockPost(segmento: string, respuesta: () => Response) {
  const llamadas: { url: string; body: unknown }[] = [];
  server.use(
    http.post(`/api/insumos/:insumoId/unidades/:unidadId/${segmento}`, async ({ request }) => {
      llamadas.push({ url: new URL(request.url).pathname, body: await request.json() });
      return respuesta();
    }),
  );
  return llamadas;
}

const MOVIMIENTO = () => HttpResponse.json({ id: "m-1", tipo: "ENTRADA" });

describe("UnidadReingresoDialog (desde la sección de unidades)", () => {
  it("devuelve una entregada como NUEVO sin motivo", async () => {
    mockUnidades([ENTREGADA]);
    const llamadas = mockPost("devolucion-entrega", MOVIMIENTO);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: ALTAS });

    await userEvent.click(await screen.findByRole("button", { name: "Devolver al depósito SN-001" }));
    await userEvent.click(await screen.findByRole("button", { name: "Devolver al depósito" }));

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0]).toEqual({
      url: "/api/insumos/ins-1/unidades/u-1/devolucion-entrega",
      body: { condicion: "NUEVO" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("devuelve una entregada como USADO con motivo", async () => {
    mockUnidades([ENTREGADA]);
    const llamadas = mockPost("devolucion-entrega", MOVIMIENTO);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: ALTAS });

    await userEvent.click(await screen.findByRole("button", { name: "Devolver al depósito SN-001" }));
    await userEvent.selectOptions(await screen.findByLabelText("Condición"), "USADO");
    await userEvent.type(screen.getByLabelText("Motivo (opcional)"), " Volvió del cliente ");
    await userEvent.click(screen.getByRole("button", { name: "Devolver al depósito" }));

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].body).toEqual({ condicion: "USADO", motivo: "Volvió del cliente" });
  });

  it("si la familia no admite usados no ofrece la condición y manda NUEVO", async () => {
    mockUnidades([ENTREGADA], false);
    const llamadas = mockPost("devolucion-entrega", MOVIMIENTO);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: ALTAS });

    await userEvent.click(await screen.findByRole("button", { name: "Devolver al depósito SN-001" }));
    expect(await screen.findByLabelText("Motivo (opcional)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Condición")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Devolver al depósito" }));

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].body).toEqual({ condicion: "NUEVO" });
  });

  it("recupera una descartada con su motivo, como usada", async () => {
    mockUnidades([DESCARTADA]);
    const llamadas = mockPost("recuperacion", MOVIMIENTO);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: AJUSTAR });

    await userEvent.click(await screen.findByRole("button", { name: "Recuperar SN-002" }));
    await userEvent.selectOptions(await screen.findByLabelText("Condición"), "USADO");
    await userEvent.type(screen.getByLabelText("Motivo de la recuperación"), "Se descartó por error");
    await userEvent.click(screen.getByRole("button", { name: "Recuperar pieza" }));

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0]).toEqual({
      url: "/api/insumos/ins-1/unidades/u-2/recuperacion",
      body: { condicion: "USADO", motivo: "Se descartó por error" },
    });
  });

  it("la recuperación sin motivo no se envía y lo pide en pantalla", async () => {
    mockUnidades([DESCARTADA]);
    const llamadas = mockPost("recuperacion", MOVIMIENTO);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: AJUSTAR });

    await userEvent.click(await screen.findByRole("button", { name: "Recuperar SN-002" }));
    await userEvent.type(await screen.findByLabelText("Motivo de la recuperación"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Recuperar pieza" }));

    expect(await screen.findByText("El motivo es requerido")).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
  });

  it("una pendiente descartada se recupera sin serial y el diálogo lo aclara", async () => {
    mockUnidades([DESCARTADA_PENDIENTE]);
    const llamadas = mockPost("recuperacion", MOVIMIENTO);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: AJUSTAR });

    await userEvent.click(await screen.findByRole("button", { name: "Recuperar serie pendiente" }));
    expect(
      await screen.findByText("Esta pieza no tiene serial: vuelve al depósito como serie pendiente."),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Motivo de la recuperación"), "Error de baja");
    await userEvent.click(screen.getByRole("button", { name: "Recuperar pieza" }));

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].url).toBe("/api/insumos/ins-1/unidades/u-3/recuperacion");
  });

  it("un insumo vuelto a NINGUNO muestra el mensaje del backend y el diálogo sigue abierto", async () => {
    mockUnidades([ENTREGADA]);
    mockPost("devolucion-entrega", () =>
      HttpResponse.json({ message: "El insumo ya no se lleva por serie." }, { status: 422 }),
    );
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: ALTAS });

    await userEvent.click(await screen.findByRole("button", { name: "Devolver al depósito SN-001" }));
    await userEvent.click(await screen.findByRole("button", { name: "Devolver al depósito" }));

    expect(await screen.findByText("El insumo ya no se lleva por serie.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sin permiso las acciones no aparecen y cada permiso habilita la suya", async () => {
    mockUnidades([ENTREGADA, DESCARTADA]);
    const { unmount } = renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: LECTOR });
    await screen.findByText("SN-001");
    expect(screen.queryByRole("button", { name: /Devolver al depósito/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Recuperar/ })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: ALTAS });
    expect(await screen.findByRole("button", { name: /Devolver al depósito/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Recuperar/ })).not.toBeInTheDocument();
  });
});
