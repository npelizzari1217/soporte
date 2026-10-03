import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type PathParams } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { MovimientoSalidaDialog } from "./movimiento-salida-dialog";
import { MovimientoAjusteDialog } from "./movimiento-ajuste-dialog";
import type { RegistrarAjusteInsumoDto } from "../hooks/use-insumo-mutations";
import type { SeguimientoInsumo, StockInsumo, UnidadInsumo } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const INSUMO_ID = "11111111-1111-1111-1111-111111111111";

function stock(seguimiento: SeguimientoInsumo): StockInsumo {
  return {
    insumoId: INSUMO_ID,
    stock: 5,
    saldos: { NUEVO: 5, USADO: 0 },
    admiteUsado: false,
    admiteUsadoEnReingreso: false,
    stockMinimo: null,
    estadoReposicion: "SIN_PUNTO_DEFINIDO",
    seguimiento,
    pendientesDeSerie: 1,
  };
}

function unidad(id: string, numeroSerie: string | null): UnidadInsumo {
  return { id, insumoId: INSUMO_ID, numeroSerie, condicion: "NUEVO", estado: "EN_DEPOSITO", equipoId: null, equipoNombre: null };
}

const CON_SERIAL = [unidad("u1", "SN-1"), unidad("u2", "SN-2")];
const PENDIENTE = unidad("u3", null);

const MOVIMIENTO = {
  id: "mov-1",
  insumoId: INSUMO_ID,
  tipo: "SALIDA",
  cantidad: 1,
  usuarioId: "u1",
  motivo: null,
  equipoId: null,
  sectorId: null,
  itemCompraId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Deja el insumo `SERIE`, atiende la lista de unidades según el filtro pedido y captura el POST. */
function preparar(segmento: "salida" | "ajuste", respuesta?: () => Response) {
  const capturado: { body: Partial<RegistrarAjusteInsumoDto> | null; filtros: string[] } = { body: null, filtros: [] };
  server.use(
    http.get(`/api/insumos/${INSUMO_ID}/stock`, () => HttpResponse.json(stock("SERIE"))),
    http.get("/api/equipos", () => HttpResponse.json([])),
    http.get("/api/sectores", () => HttpResponse.json([])),
    http.get(`/api/insumos/${INSUMO_ID}/unidades`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      capturado.filtros.push(query.toString());
      return HttpResponse.json(query.get("disponibles") === "true" ? CON_SERIAL : [...CON_SERIAL, PENDIENTE]);
    }),
    http.post<PathParams, Partial<RegistrarAjusteInsumoDto>>(
      `/api/insumos/${INSUMO_ID}/movimientos/${segmento}`,
      async ({ request }) => {
        capturado.body = await request.json();
        return respuesta ? respuesta() : HttpResponse.json(MOVIMIENTO, { status: 201 });
      },
    ),
  );
  return capturado;
}

async function abrirSalida() {
  renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={5} />, {
    user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
  });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /registrar salida/i }));
  await screen.findByLabelText(/pieza \(por número de serie\)/i);
  return user;
}

async function abrirAjusteNegativo() {
  renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={5} />, {
    user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
  });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /registrar ajuste/i }));
  await user.selectOptions(await screen.findByLabelText(/tipo de ajuste/i), "AJUSTE_NEGATIVO");
  await screen.findByLabelText(/pieza \(por número de serie\)/i);
  return user;
}

function opciones(): string[] {
  return screen.getAllByRole("option").map((opcion) => opcion.textContent ?? "");
}

describe("Salida de un insumo SERIE", () => {
  it("ofrece solo las piezas con serial, fija la cantidad en 1 y envía la unidad sin condicion", async () => {
    const capturado = preparar("salida");
    const user = await abrirSalida();

    await screen.findByRole("option", { name: /SN-1/ });
    expect(capturado.filtros[0]).toContain("disponibles=true");
    expect(opciones().some((texto) => /pendiente/i.test(texto))).toBe(false);
    expect(screen.getByLabelText(/^cantidad$/i)).toHaveValue("1");
    expect(screen.getByLabelText(/^cantidad$/i)).toBeDisabled();
    expect(screen.getByText(/deja la pieza como entregada/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/pieza \(por número de serie\)/i), "u2");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body).toEqual({ cantidad: 1, unidadId: "u2" }));
  });

  it("exige elegir la pieza antes de enviar", async () => {
    const capturado = preparar("salida");
    const user = await abrirSalida();
    await screen.findByRole("option", { name: /SN-1/ });

    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    expect(await screen.findByText(/elegí la pieza/i)).toBeInTheDocument();
    expect(capturado.body).toBeNull();
  });

  it("si otra operación tomó la pieza (422), muestra el motivo y vuelve a pedir la lista", async () => {
    const capturado = preparar("salida", () =>
      HttpResponse.json(
        { statusCode: 422, code: "UNIDAD_NO_DISPONIBLE", message: "La pieza ya no está disponible" },
        { status: 422 },
      ),
    );
    const user = await abrirSalida();
    await screen.findByRole("option", { name: /SN-1/ });
    await user.selectOptions(screen.getByLabelText(/pieza \(por número de serie\)/i), "u1");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() => expect(capturado.filtros.length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Ajuste negativo de un insumo SERIE", () => {
  it("ofrece también las piezas con serie pendiente, exige motivo y envía la unidad sin condicion", async () => {
    const capturado = preparar("ajuste");
    const user = await abrirAjusteNegativo();

    await screen.findByRole("option", { name: /Serie pendiente/ });
    expect(capturado.filtros[0]).toContain("estado=EN_DEPOSITO");
    expect(screen.getByLabelText(/^cantidad$/i)).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/pieza \(por número de serie\)/i), "u3");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));
    expect(await screen.findByText(/motivo/i, { selector: "p" })).toBeInTheDocument();
    expect(capturado.body).toBeNull();

    await user.type(screen.getByLabelText(/^motivo$/i), "Se rompió");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() =>
      expect(capturado.body).toEqual({ cantidad: 1, motivo: "Se rompió", tipo: "AJUSTE_NEGATIVO", unidadId: "u3" }),
    );
  });
});
