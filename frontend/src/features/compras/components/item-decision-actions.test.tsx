import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ItemDecisionActions } from "./item-decision-actions";
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

describe("ItemDecisionActions", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("con ítem PENDIENTE, confirmar Aprobar dispara POST .../aprobar", async () => {
    let called = false;
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/aprobar`, () => {
        called = true;
        return HttpResponse.json(buildItem({ estadoAprobacion: "APROBADO" }));
      }),
    );

    renderWithProviders(<ItemDecisionActions compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:APROBACION"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    await user.click(await screen.findByRole("button", { name: /confirmar aprobación/i }));

    await waitFor(() => expect(called).toBe(true));
  });

  it("con ítem PENDIENTE, confirmar Rechazar dispara POST .../rechazar", async () => {
    let called = false;
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/rechazar`, () => {
        called = true;
        return HttpResponse.json(buildItem({ estadoAprobacion: "RECHAZADO" }));
      }),
    );

    renderWithProviders(<ItemDecisionActions compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:APROBACION"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rechazar" }));
    await user.click(await screen.findByRole("button", { name: /confirmar rechazo/i }));

    await waitFor(() => expect(called).toBe(true));
  });

  it("S10: con ítem YA DECIDIDO, ambos botones quedan deshabilitados", async () => {
    renderWithProviders(
      <ItemDecisionActions compraId={COMPRA_ID} item={buildItem({ estadoAprobacion: "APROBADO" })} />,
      { user: buildUser({ permisos: ["COMPRAS:APROBACION"] }) },
    );

    expect(screen.getByRole("button", { name: "Aprobar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeDisabled();
  });

  it("muestra el error de dominio del backend (422) al usuario", async () => {
    const MENSAJE_BACKEND = "El ítem ya fue decidido.";
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/aprobar`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<ItemDecisionActions compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:APROBACION"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    await user.click(await screen.findByRole("button", { name: /confirmar aprobación/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });
});
