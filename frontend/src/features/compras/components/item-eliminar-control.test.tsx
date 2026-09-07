import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ItemEliminarControl } from "./item-eliminar-control";
import type { ItemCompra } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "compra-1";

function buildItem(overrides: Partial<ItemCompra> = {}): ItemCompra {
  return {
    id: "item-1",
    compraId: COMPRA_ID,
    descripcion: "Insumo",
    insumoId: null,
    cantidad: 1,
    proveedor: "ACME",
    monto: 100,
    moneda: "ARS",
    fechaCotizacion: "2026-01-01",
    observaciones: null,
    estadoAprobacion: "PENDIENTE",
    decididoPorId: null,
    decididoEn: null,
    cantidadOrdenada: 0,
    cantidadRecibida: 0,
    cantidadEntregada: 0,
    fechaOrden: null,
    fechaRecepcion: null,
    fechaEntrega: null,
    totalItem: 0,
    cerradoConFaltante: false,
    motivoCierreFaltante: null,
    comprado: false,
    entregado: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ItemEliminarControl", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("con ítem PENDIENTE, confirmar dispara el DELETE", async () => {
    let called = false;
    server.use(
      http.delete(`/api/compras/${COMPRA_ID}/items/item-1`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<ItemEliminarControl compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:BORRADO"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(await screen.findByRole("button", { name: /confirmar eliminación/i }));

    await waitFor(() => expect(called).toBe(true));
  });

  it("S7: con ítem APROBADO, el botón queda deshabilitado (no eliminable)", async () => {
    renderWithProviders(
      <ItemEliminarControl compraId={COMPRA_ID} item={buildItem({ estadoAprobacion: "APROBADO" })} />,
      { user: buildUser({ permisos: ["COMPRAS:BORRADO"] }) },
    );

    expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();
  });

  it("muestra el error de dominio del backend (422) al usuario", async () => {
    const MENSAJE_BACKEND = "El ítem aprobado no se puede eliminar.";
    server.use(
      http.delete(`/api/compras/${COMPRA_ID}/items/item-1`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<ItemEliminarControl compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:BORRADO"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(await screen.findByRole("button", { name: /confirmar eliminación/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });
});
