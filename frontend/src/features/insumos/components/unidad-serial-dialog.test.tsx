import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { UnidadesInsumoSection } from "./unidades-insumo-section";
import type { UnidadInsumo } from "../types";

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
    estado: "EN_DEPOSITO",
    equipoId: null,
    equipoNombre: null,
    ...overrides,
  };
}

const PENDIENTE = buildUnidad({ id: "u-2", numeroSerie: null });

function mockUnidades(unidades: UnidadInsumo[]): void {
  server.use(http.get("/api/insumos/:insumoId/unidades", () => HttpResponse.json(unidades)));
}

/** Registra el body del POST y responde con `respuesta`. */
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

describe("UnidadSerialDialog (desde la sección de unidades)", () => {
  it("completa el serial de una unidad pendiente sin pedir motivo", async () => {
    mockUnidades([PENDIENTE]);
    const llamadas = mockPost("serial", () => HttpResponse.json(buildUnidad({ id: "u-2", numeroSerie: "NUEVO-1" })));
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: ALTAS });

    await userEvent.click(await screen.findByRole("button", { name: "Cargar serial de serie pendiente" }));
    expect(screen.queryByLabelText("Motivo de la corrección")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Número de serie"), "  NUEVO-1 ");
    await userEvent.click(screen.getByRole("button", { name: "Cargar serial" }));

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0]).toEqual({
      url: "/api/insumos/ins-1/unidades/u-2/serial",
      body: { numeroSerie: "NUEVO-1" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("un serial repetido (409) se muestra en el campo y el diálogo sigue abierto", async () => {
    mockUnidades([PENDIENTE]);
    mockPost("serial", () =>
      HttpResponse.json({ message: "El número de serie SN-001 ya existe." }, { status: 409 }),
    );
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: ALTAS });

    await userEvent.click(await screen.findByRole("button", { name: "Cargar serial de serie pendiente" }));
    await userEvent.type(screen.getByLabelText("Número de serie"), "SN-001");
    await userEvent.click(screen.getByRole("button", { name: "Cargar serial" }));

    expect(await screen.findByText("El número de serie SN-001 ya existe.")).toBeInTheDocument();
    expect(screen.getByLabelText("Número de serie")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("corrige el serial con su motivo", async () => {
    mockUnidades([buildUnidad()]);
    const llamadas = mockPost("correccion-serial", () => HttpResponse.json(buildUnidad({ numeroSerie: "SN-002" })));
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: AJUSTAR });

    await userEvent.click(await screen.findByRole("button", { name: "Corregir serial de SN-001" }));
    await userEvent.type(screen.getByLabelText("Número de serie nuevo"), "SN-002");
    await userEvent.type(screen.getByLabelText("Motivo de la corrección"), "Error de tipeo");
    await userEvent.click(screen.getByRole("button", { name: "Corregir serial" }));

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0]).toEqual({
      url: "/api/insumos/ins-1/unidades/u-1/correccion-serial",
      body: { numeroSerie: "SN-002", motivo: "Error de tipeo" },
    });
  });

  it("la corrección sin motivo no se envía y lo pide en pantalla", async () => {
    mockUnidades([buildUnidad()]);
    const llamadas = mockPost("correccion-serial", () => HttpResponse.json(buildUnidad()));
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: AJUSTAR });

    await userEvent.click(await screen.findByRole("button", { name: "Corregir serial de SN-001" }));
    await userEvent.type(screen.getByLabelText("Número de serie nuevo"), "SN-002");
    await userEvent.type(screen.getByLabelText("Motivo de la corrección"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Corregir serial" }));

    expect(await screen.findByText("El motivo es requerido")).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
  });

  it("corregir a un serial existente muestra el 409 en el campo", async () => {
    mockUnidades([buildUnidad()]);
    mockPost("correccion-serial", () =>
      HttpResponse.json({ message: "El número de serie SN-009 ya existe." }, { status: 409 }),
    );
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: AJUSTAR });

    await userEvent.click(await screen.findByRole("button", { name: "Corregir serial de SN-001" }));
    await userEvent.type(screen.getByLabelText("Número de serie nuevo"), "SN-009");
    await userEvent.type(screen.getByLabelText("Motivo de la corrección"), "Error");
    await userEvent.click(screen.getByRole("button", { name: "Corregir serial" }));

    expect(await screen.findByText("El número de serie SN-009 ya existe.")).toBeInTheDocument();
  });

  it("sin permiso las acciones no aparecen", async () => {
    mockUnidades([PENDIENTE, buildUnidad()]);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: LECTOR });

    await screen.findByText("SN-001");
    expect(screen.queryByRole("button", { name: /Cargar serial/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Corregir serial/ })).not.toBeInTheDocument();
  });

  it("cada permiso habilita solo su acción", async () => {
    mockUnidades([PENDIENTE, buildUnidad()]);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: ALTAS });

    expect(await screen.findByRole("button", { name: /Cargar serial/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Corregir serial/ })).not.toBeInTheDocument();
  });
});
