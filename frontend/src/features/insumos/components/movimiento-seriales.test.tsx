import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type PathParams } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { MovimientoEntradaDialog } from "./movimiento-entrada-dialog";
import { MovimientoAjusteDialog } from "./movimiento-ajuste-dialog";
import type { RegistrarAjusteInsumoDto } from "../hooks/use-insumo-mutations";
import type { SeguimientoInsumo, StockInsumo } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const INSUMO_ID = "11111111-1111-1111-1111-111111111111";

function stock(seguimiento: SeguimientoInsumo): StockInsumo {
  return {
    insumoId: INSUMO_ID,
    stock: 0,
    saldos: { NUEVO: 0, USADO: 0 },
    admiteUsado: false,
    stockMinimo: null,
    estadoReposicion: "SIN_PUNTO_DEFINIDO",
    seguimiento,
    pendientesDeSerie: 0,
  };
}

const MOVIMIENTO = {
  id: "mov-1",
  insumoId: INSUMO_ID,
  tipo: "ENTRADA",
  cantidad: 2,
  usuarioId: "u1",
  motivo: null,
  equipoId: null,
  sectorId: null,
  itemCompraId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Deja el insumo con el seguimiento dado y captura el POST a `segmento`; `respuesta` permite simular un rechazo. */
function preparar(seguimiento: SeguimientoInsumo, segmento: "entrada" | "ajuste", respuesta?: Response) {
  const capturado: { body: Partial<RegistrarAjusteInsumoDto> | null } = { body: null };
  server.use(
    http.get(`/api/insumos/${INSUMO_ID}/stock`, () => HttpResponse.json(stock(seguimiento))),
    http.get("/api/equipos", () => HttpResponse.json([])),
    http.get("/api/sectores", () => HttpResponse.json([])),
    http.post<PathParams, Partial<RegistrarAjusteInsumoDto>>(
      `/api/insumos/${INSUMO_ID}/movimientos/${segmento}`,
      async ({ request }) => {
        capturado.body = await request.json();
        return respuesta ?? HttpResponse.json({ ...MOVIMIENTO, movimientos: [MOVIMIENTO] }, { status: 201 });
      },
    ),
  );
  return capturado;
}

async function abrirEntrada() {
  renderWithProviders(<MovimientoEntradaDialog insumoId={INSUMO_ID} activo />, {
    user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
  });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /registrar entrada/i }));
  await screen.findByLabelText(/^cantidad$/i);
  return user;
}

async function abrirAjuste() {
  renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
    user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
  });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /registrar ajuste/i }));
  await screen.findByLabelText(/^cantidad$/i);
  return user;
}

describe("Entrada de un insumo SERIE", () => {
  it("pide una casilla por pieza y envía los seriales recortados", async () => {
    const capturado = preparar("SERIE", "entrada");
    const user = await abrirEntrada();

    await user.type(screen.getByLabelText(/^cantidad$/i), "2");
    await user.type(await screen.findByLabelText(/pieza 1/i), "  U1 ");
    await user.type(screen.getByLabelText(/pieza 2/i), "U2");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body?.cantidad).toBe(2));
    expect(capturado.body?.seriales).toEqual(["U1", "U2"]);
  });

  it("marca un serial repetido (normalizado) y no envía nada", async () => {
    const capturado = preparar("SERIE", "entrada");
    const user = await abrirEntrada();

    await user.type(screen.getByLabelText(/^cantidad$/i), "2");
    await user.type(await screen.findByLabelText(/pieza 1/i), "ab 1");
    await user.type(screen.getByLabelText(/pieza 2/i), "AB1");

    expect(await screen.findByText(/repetido: ya lo cargaste en la pieza 1/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));
    expect(capturado.body).toBeNull();
  });

  it("no envía con una casilla en blanco y la marca", async () => {
    const capturado = preparar("SERIE", "entrada");
    const user = await abrirEntrada();

    await user.type(screen.getByLabelText(/^cantidad$/i), "2");
    await user.type(await screen.findByLabelText(/pieza 1/i), "U1");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    expect(await screen.findByText(/el número de serie es requerido/i)).toBeInTheDocument();
    expect(capturado.body).toBeNull();
  });

  it("con una cantidad no entera no muestra casillas y avisa", async () => {
    const capturado = preparar("SERIE", "entrada");
    const user = await abrirEntrada();

    await user.type(screen.getByLabelText(/^cantidad$/i), "1.5");

    expect(await screen.findByText(/la cantidad tiene que ser un número entero/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));
    expect(capturado.body).toBeNull();
  });

  it("un 409 por serial ya existente se muestra y el diálogo sigue abierto", async () => {
    preparar(
      "SERIE",
      "entrada",
      HttpResponse.json({ statusCode: 409, message: "El serial U1 ya existe." }, { status: 409 }),
    );
    const user = await abrirEntrada();

    await user.type(screen.getByLabelText(/^cantidad$/i), "1");
    await user.type(await screen.findByLabelText(/pieza 1/i), "U1");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("El serial U1 ya existe."));
    expect(screen.getByLabelText(/^cantidad$/i)).toBeInTheDocument();
  });
});

describe("Ajuste positivo de un insumo SERIE", () => {
  it("envía los seriales junto con el motivo", async () => {
    const capturado = preparar("SERIE", "ajuste");
    const user = await abrirAjuste();

    await user.type(screen.getByLabelText(/^cantidad$/i), "1");
    await user.type(await screen.findByLabelText(/pieza 1/i), "P1");
    await user.type(screen.getByLabelText(/^motivo/i), "hallazgo en inventario");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body?.seriales).toEqual(["P1"]));
    expect(capturado.body?.tipo).toBe("AJUSTE_POSITIVO");
    expect(capturado.body?.motivo).toBe("hallazgo en inventario");
  });

  it("sin motivo no envía nada, aunque los seriales estén completos", async () => {
    const capturado = preparar("SERIE", "ajuste");
    const user = await abrirAjuste();

    await user.type(screen.getByLabelText(/^cantidad$/i), "1");
    await user.type(await screen.findByLabelText(/pieza 1/i), "P1");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    expect(await screen.findByText(/el motivo es requerido/i)).toBeInTheDocument();
    expect(capturado.body).toBeNull();
  });

  it("el ajuste negativo no pide seriales", async () => {
    preparar("SERIE", "ajuste");
    const user = await abrirAjuste();

    await screen.findByLabelText(/^cantidad$/i);
    await user.type(screen.getByLabelText(/^cantidad$/i), "1");
    expect(await screen.findByLabelText(/pieza 1/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/tipo de ajuste/i), "AJUSTE_NEGATIVO");

    expect(screen.queryByLabelText(/pieza 1/i)).not.toBeInTheDocument();
  });
});

describe("Insumo sin seguimiento por serie (NINGUNO)", () => {
  it("la entrada no tiene campo de seriales y no los envía", async () => {
    const capturado = preparar("NINGUNO", "entrada");
    const user = await abrirEntrada();

    await user.type(screen.getByLabelText(/^cantidad$/i), "2");
    expect(screen.queryByLabelText(/pieza 1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/números de serie/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body?.cantidad).toBe(2));
    expect(capturado.body).not.toHaveProperty("seriales");
  });

  it("el ajuste positivo tampoco", async () => {
    const capturado = preparar("NINGUNO", "ajuste");
    const user = await abrirAjuste();

    await user.type(screen.getByLabelText(/^cantidad$/i), "2");
    await user.type(screen.getByLabelText(/^motivo/i), "conteo");
    expect(screen.queryByLabelText(/pieza 1/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body?.cantidad).toBe(2));
    expect(capturado.body).not.toHaveProperty("seriales");
  });
});
