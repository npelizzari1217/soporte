import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { RegistrarRecepcionDialog } from "./registrar-avance-dialog";
import type { ItemCompra } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "compra-1";
const INSUMO_ID = "11111111-1111-1111-1111-111111111111";
const RUTA = `/api/compras/${COMPRA_ID}/items/item-1/registrar-recepcion`;

function buildItem(overrides: Partial<ItemCompra> = {}): ItemCompra {
  return {
    id: "item-1",
    compraId: COMPRA_ID,
    descripcion: "Disco",
    insumoId: INSUMO_ID,
    insumoSeguimiento: "NINGUNO",
    cantidad: 3,
    proveedor: "ACME",
    monto: 100,
    moneda: "ARS",
    fechaCotizacion: "2026-01-01",
    observaciones: null,
    estadoAprobacion: "APROBADO",
    decididoPorId: "u1",
    decididoEn: "2026-01-02T00:00:00.000Z",
    cantidadOrdenada: 3,
    cantidadRecibida: 0,
    cantidadEntregada: 0,
    fechaOrden: null,
    fechaRecepcion: null,
    fechaEntrega: null,
    totalItem: 300,
    cerradoConFaltante: false,
    motivoCierreFaltante: null,
    comprado: false,
    entregado: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function preparar(respuesta?: Response) {
  const capturado: { body: Record<string, unknown> | null } = { body: null };
  server.use(
    http.post(RUTA, async ({ request }) => {
      capturado.body = (await request.json()) as Record<string, unknown>;
      return respuesta ?? HttpResponse.json(buildItem({ cantidadRecibida: 3 }));
    }),
  );
  return capturado;
}

async function abrir(item: ItemCompra, esperarCasillas = true) {
  renderWithProviders(<RegistrarRecepcionDialog compraId={COMPRA_ID} item={item} />, {
    user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
  });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /registrar recepción/i }));
  if (esperarCasillas) await screen.findByLabelText(/número de serie de la pieza 1/i);
  return user;
}

describe("RegistrarRecepcionDialog sin INSUMOS:LECTURA", () => {
  it("pide los seriales con el seguimiento que trae el ítem aunque el stock del insumo responda 403", async () => {
    const capturado = preparar();
    server.use(
      http.get(`/api/insumos/${INSUMO_ID}/stock`, () =>
        HttpResponse.json({ message: "Forbidden" }, { status: 403 }),
      ),
    );
    const user = await abrir(buildItem({ insumoSeguimiento: "SERIE" }));

    await user.type(screen.getByLabelText(/pieza 1/i), "A1");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body?.seriales).toEqual(["A1"]));
  });
});

describe("RegistrarRecepcionDialog con un insumo SERIE", () => {
  it("recepción completa: manda los seriales de las piezas nuevas, recortados", async () => {
    const capturado = preparar();
    const user = await abrir(buildItem({ insumoSeguimiento: "SERIE" }));

    await user.type(screen.getByLabelText(/pieza 1/i), "  A1 ");
    await user.type(screen.getByLabelText(/pieza 2/i), "B2");
    await user.type(screen.getByLabelText(/pieza 3/i), "C3");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body?.seriales).toEqual(["A1", "B2", "C3"]));
    expect(capturado.body?.cantidadRecibida).toBe(3);
  });

  it("recepción parcial: las casillas son del delta y los blancos quedan pendientes, con aviso", async () => {
    const capturado = preparar();
    const user = await abrir(buildItem({ cantidadRecibida: 1, insumoSeguimiento: "SERIE" }), false);
    // El campo precarga el acumulado (1): sin piezas nuevas no hay casillas.
    expect(screen.queryByLabelText(/número de serie/i)).not.toBeInTheDocument();
    const cantidad = screen.getByLabelText(/cantidad recibida/i);
    await user.clear(cantidad);
    await user.type(cantidad, "3");

    // Acumulado 1 -> 3: delta 2.
    expect(screen.getAllByLabelText(/número de serie de la pieza/i)).toHaveLength(2);
    expect(screen.getByText(/2 pendientes/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/pieza 1/i), "A1");
    expect(screen.getByText(/1 pendiente\)/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body?.seriales).toEqual(["A1"]));
    expect(capturado.body?.cantidadRecibida).toBe(3);
  });

  it("sin ningún serial no manda `seriales` (todo queda pendiente)", async () => {
    const capturado = preparar();
    const user = await abrir(buildItem({ insumoSeguimiento: "SERIE" }));

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body).not.toBeNull());
    expect(capturado.body).not.toHaveProperty("seriales");
  });

  it("serial repetido entre las casillas: lo marca y no pega a la API", async () => {
    const capturado = preparar();
    const user = await abrir(buildItem({ insumoSeguimiento: "SERIE" }));

    await user.type(screen.getByLabelText(/pieza 1/i), "ab 1");
    await user.type(screen.getByLabelText(/pieza 2/i), "AB1");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    expect(await screen.findByText(/repetido: ya lo cargaste en la pieza 1/i)).toBeInTheDocument();
    expect(capturado.body).toBeNull();
  });

  it("serial repetido contra el depósito (409): avisa por toast y el diálogo sigue abierto", async () => {
    preparar(
      HttpResponse.json({ message: "El número de serie ya existe", statusCode: 409 }, { status: 409 }),
    );
    const user = await abrir(buildItem({ insumoSeguimiento: "SERIE" }));

    await user.type(screen.getByLabelText(/pieza 1/i), "A1");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByLabelText(/pieza 1/i)).toHaveValue("A1");
  });

  it("delta fraccional: lo rechaza en pantalla y no pega a la API", async () => {
    const capturado = preparar();
    const user = await abrir(buildItem({ insumoSeguimiento: "SERIE" }));

    const cantidad = screen.getByLabelText(/cantidad recibida/i);
    await user.clear(cantidad);
    await user.type(cantidad, "2.5");

    expect(await screen.findByText(/cantidad tiene que ser un número entero/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));
    await new Promise((r) => setTimeout(r, 50));
    expect(capturado.body).toBeNull();
  });
});

describe("RegistrarRecepcionDialog con un insumo sin serie", () => {
  it("NINGUNO: sin casillas y el body no lleva `seriales`", async () => {
    const capturado = preparar();
    const user = await abrir(buildItem(), false);
    await waitFor(() => expect(screen.getByLabelText(/cantidad recibida/i)).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByLabelText(/número de serie/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body).not.toBeNull());
    expect(capturado.body).not.toHaveProperty("seriales");
  });
});
