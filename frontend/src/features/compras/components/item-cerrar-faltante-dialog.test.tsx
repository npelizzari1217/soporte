import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ItemCerrarFaltanteDialog } from "./item-cerrar-faltante-dialog";
import type { ItemCompra } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "compra-1";

function buildItem(overrides: Partial<ItemCompra> = {}): ItemCompra {
  return {
    id: "item-1",
    compraId: COMPRA_ID,
    descripcion: "Insumo",
    insumoId: null,
    insumoSeguimiento: null,
    cantidad: 10,
    proveedor: "ACME",
    monto: 100,
    moneda: "ARS",
    fechaCotizacion: "2026-01-01",
    observaciones: null,
    estadoAprobacion: "APROBADO",
    decididoPorId: "u1",
    decididoEn: "2026-01-02T00:00:00.000Z",
    cantidadOrdenada: 5,
    cantidadRecibida: 5,
    cantidadEntregada: 5,
    fechaOrden: null,
    fechaRecepcion: null,
    fechaEntrega: null,
    totalItem: 1000,
    cerradoConFaltante: false,
    motivoCierreFaltante: null,
    comprado: false,
    entregado: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ItemCerrarFaltanteDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("S24: exige motivo no vacío antes de pegarle a la API", async () => {
    renderWithProviders(<ItemCerrarFaltanteDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /cerrar con faltante/i }));
    await user.click(screen.getByRole("button", { name: /^confirmar$/i }));

    expect(await screen.findByText(/el motivo es requerido/i)).toBeInTheDocument();
  });

  it("S25: con el ítem ya cerrado con faltante, el botón queda deshabilitado (TERMINAL)", async () => {
    renderWithProviders(
      <ItemCerrarFaltanteDialog compraId={COMPRA_ID} item={buildItem({ cerradoConFaltante: true })} />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    expect(screen.getByRole("button", { name: /cerrar con faltante/i })).toBeDisabled();
  });

  it.each(["PENDIENTE", "RECHAZADO"] as const)(
    "C1: con el ítem %s (no aprobado) el botón queda deshabilitado — el dominio exige APROBADO desde el fix de C1",
    (estadoAprobacion) => {
      renderWithProviders(
        <ItemCerrarFaltanteDialog compraId={COMPRA_ID} item={buildItem({ estadoAprobacion })} />,
        { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
      );

      expect(screen.getByRole("button", { name: /cerrar con faltante/i })).toBeDisabled();
    },
  );

  it("S23: sin faltante real (recibida alcanza la pedida) el botón queda deshabilitado", () => {
    renderWithProviders(
      <ItemCerrarFaltanteDialog
        compraId={COMPRA_ID}
        item={buildItem({ cantidad: 10, cantidadRecibida: 10 })}
      />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    expect(screen.getByRole("button", { name: /cerrar con faltante/i })).toBeDisabled();
  });

  it("envía el POST a cerrar-con-faltante con el motivo", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/cerrar-con-faltante`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ cerradoConFaltante: true }));
      }),
    );

    renderWithProviders(<ItemCerrarFaltanteDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /cerrar con faltante/i }));
    await user.type(screen.getByLabelText(/motivo/i), "Proveedor no entregó el resto");
    await user.click(screen.getByRole("button", { name: /^confirmar$/i }));

    await waitFor(() => expect(capturedBody.motivo).toBe("Proveedor no entregó el resto"));
  });

  it("muestra el error de dominio del backend (422, S23 sin faltante real) al usuario", async () => {
    const MENSAJE_BACKEND = "El ítem no tiene faltante real.";
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/cerrar-con-faltante`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<ItemCerrarFaltanteDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /cerrar con faltante/i }));
    await user.type(screen.getByLabelText(/motivo/i), "Faltó una unidad");
    await user.click(screen.getByRole("button", { name: /^confirmar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });
});
