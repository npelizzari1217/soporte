import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { RegistrarCompraDialog, RegistrarEntregaDialog } from "./registrar-avance-dialog";
import type { ItemCompra } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "compra-1";

function buildItem(overrides: Partial<ItemCompra> = {}): ItemCompra {
  return {
    id: "item-1",
    compraId: COMPRA_ID,
    descripcion: "Insumo",
    cantidad: 10,
    proveedor: "ACME",
    monto: 100,
    moneda: "ARS",
    fechaCotizacion: "2026-01-01",
    observaciones: null,
    estadoAprobacion: "APROBADO",
    decididoPorId: "u1",
    decididoEn: "2026-01-02T00:00:00.000Z",
    cantidadComprada: 0,
    cantidadEntregada: 0,
    cerradoConFaltante: false,
    motivoCierreFaltante: null,
    comprado: false,
    entregado: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function abrirDialog(nombreBoton: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: nombreBoton }));
  return user;
}

describe("RegistrarCompraDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("con ítem APROBADO, el botón está habilitado y precarga cantidadComprada actual", async () => {
    renderWithProviders(
      <RegistrarCompraDialog compraId={COMPRA_ID} item={buildItem({ cantidadComprada: 4 })} />,
      { user: buildUser({ permisos: ["compra:gestionar"] }) },
    );

    expect(screen.getByRole("button", { name: /registrar compra/i })).not.toBeDisabled();
    await abrirDialog(/registrar compra/i);
    expect(await screen.findByLabelText(/cantidad comprada/i)).toHaveValue(4);
  });

  it("S16: con ítem PENDIENTE (no aprobado), el botón queda deshabilitado", async () => {
    renderWithProviders(
      <RegistrarCompraDialog compraId={COMPRA_ID} item={buildItem({ estadoAprobacion: "PENDIENTE" })} />,
      { user: buildUser({ permisos: ["compra:gestionar"] }) },
    );

    expect(screen.getByRole("button", { name: /registrar compra/i })).toBeDisabled();
  });

  it("envía el POST a registrar-compra con el acumulado (no delta)", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/registrar-compra`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ cantidadComprada: 6 }));
      }),
    );

    renderWithProviders(<RegistrarCompraDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["compra:gestionar"] }),
    });

    const user = await abrirDialog(/registrar compra/i);
    const input = screen.getByLabelText(/cantidad comprada/i);
    await user.clear(input);
    await user.type(input, "6");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturedBody.cantidadComprada).toBe(6));
  });

  it("muestra el error de dominio del backend (422, S17 exceso) al usuario", async () => {
    const MENSAJE_BACKEND = "La cantidad comprada excede la solicitada.";
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/registrar-compra`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<RegistrarCompraDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["compra:gestionar"] }),
    });

    const user = await abrirDialog(/registrar compra/i);
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });
});

describe("RegistrarEntregaDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("con cantidadComprada > 0, el botón está habilitado y precarga cantidadEntregada actual", async () => {
    renderWithProviders(
      <RegistrarEntregaDialog
        compraId={COMPRA_ID}
        item={buildItem({ cantidadComprada: 5, cantidadEntregada: 2 })}
      />,
      { user: buildUser({ permisos: ["compra:gestionar"] }) },
    );

    expect(screen.getByRole("button", { name: /registrar entrega/i })).not.toBeDisabled();
    await abrirDialog(/registrar entrega/i);
    expect(await screen.findByLabelText(/cantidad entregada/i)).toHaveValue(2);
  });

  it("sin nada comprado todavía (cantidadComprada=0), el botón queda deshabilitado", async () => {
    renderWithProviders(
      <RegistrarEntregaDialog compraId={COMPRA_ID} item={buildItem({ cantidadComprada: 0 })} />,
      { user: buildUser({ permisos: ["compra:gestionar"] }) },
    );

    expect(screen.getByRole("button", { name: /registrar entrega/i })).toBeDisabled();
  });

  it("envía el POST a registrar-entrega con el acumulado (no delta)", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/registrar-entrega`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ cantidadComprada: 5, cantidadEntregada: 5 }));
      }),
    );

    renderWithProviders(
      <RegistrarEntregaDialog compraId={COMPRA_ID} item={buildItem({ cantidadComprada: 5 })} />,
      { user: buildUser({ permisos: ["compra:gestionar"] }) },
    );

    const user = await abrirDialog(/registrar entrega/i);
    const input = screen.getByLabelText(/cantidad entregada/i);
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturedBody.cantidadEntregada).toBe(5));
  });
});
