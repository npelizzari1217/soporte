import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ItemEditDialog } from "./item-edit-dialog";
import type { ItemCompra } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "compra-1";

function buildItem(overrides: Partial<ItemCompra> = {}): ItemCompra {
  return {
    id: "item-1",
    compraId: COMPRA_ID,
    descripcion: "Insumo original",
    cantidad: 2,
    proveedor: "ACME",
    monto: 100,
    moneda: "ARS",
    fechaCotizacion: "2026-01-01",
    observaciones: null,
    estadoAprobacion: "PENDIENTE",
    decididoPorId: null,
    decididoEn: null,
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

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /editar ítem/i }));
  return user;
}

describe("ItemEditDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("precarga los valores actuales del ítem", async () => {
    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["compra:gestionar"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/descripción/i)).toHaveValue("Insumo original");
    expect(screen.getByLabelText(/cantidad/i)).toHaveValue(2);
    expect(screen.getByLabelText(/proveedor/i)).toHaveValue("ACME");
    expect(screen.getByLabelText(/monto/i)).toHaveValue(100);
  });

  it("envía el PATCH con TODOS los campos cuando el ítem sigue PENDIENTE (sin congelamiento)", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ descripcion: "Insumo editado" }));
      }),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["compra:gestionar"] }),
    });

    const user = await abrirDialog();
    const descripcionInput = await screen.findByLabelText(/descripción/i);
    await user.clear(descripcionInput);
    await user.type(descripcionInput, "Insumo editado");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.descripcion).toBe("Insumo editado"));
    expect(capturedBody.cantidad).toBe(2);
    expect(capturedBody.monto).toBe(100);
    expect(capturedBody.moneda).toBe("ARS");
  });

  it("congelamiento (S13): con el ítem APROBADO, deshabilita cantidad/monto/moneda y NO los envía en el PATCH", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ estadoAprobacion: "APROBADO" }));
      }),
    );

    renderWithProviders(
      <ItemEditDialog compraId={COMPRA_ID} item={buildItem({ estadoAprobacion: "APROBADO" })} />,
      { user: buildUser({ permisos: ["compra:gestionar"] }) },
    );

    const user = await abrirDialog();
    expect(await screen.findByLabelText(/cantidad/i)).toBeDisabled();
    expect(screen.getByLabelText(/monto/i)).toBeDisabled();
    expect(screen.getByLabelText(/moneda/i)).toBeDisabled();
    // S14: los campos libres siguen editables en APROBADO.
    expect(screen.getByLabelText(/proveedor/i)).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.descripcion).toBe("Insumo original"));
    expect(capturedBody).not.toHaveProperty("cantidad");
    expect(capturedBody).not.toHaveProperty("monto");
    expect(capturedBody).not.toHaveProperty("moneda");
  });

  it("muestra el error de dominio del backend (422) al usuario", async () => {
    const MENSAJE_BACKEND = "El ítem está congelado.";
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["compra:gestionar"] }),
    });

    await abrirDialog();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });
});
