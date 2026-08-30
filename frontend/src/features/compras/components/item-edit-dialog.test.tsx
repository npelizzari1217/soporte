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
    // Formato REAL del backend (`compras.dto.ts` serializa con `.toISOString()`),
    // no la forma ya normalizada: un fixture cómodo esconde el bug de precarga
    // del `<input type="date">`.
    fechaCotizacion: "2026-01-01T00:00:00.000Z",
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

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /editar ítem/i }));
  return user;
}

describe("ItemEditDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("precarga los valores actuales del ítem", async () => {
    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/descripción/i)).toHaveValue("Insumo original");
    expect(screen.getByLabelText(/cantidad/i)).toHaveValue(2);
    expect(screen.getByLabelText(/proveedor/i)).toHaveValue("ACME");
    // El monto se precarga FORMATEADO (el campo arranca sin foco); vuelve a
    // crudo al enfocarlo, y lo que viaja en el PATCH sigue siendo el número.
    expect(screen.getByLabelText(/monto/i)).toHaveValue("100,00");
  });

  it("regresión: precarga la fecha de cotización aunque el backend la mande como datetime ISO — sin normalizar, el input queda VACÍO", async () => {
    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/fecha de cotización/i)).toHaveValue("2026-01-01");
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
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
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
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    const user = await abrirDialog();
    expect(await screen.findByLabelText(/cantidad/i)).toBeDisabled();
    // Congelado no se puede editar, así que se muestra siempre formateado.
    expect(screen.getByLabelText(/monto/i)).toBeDisabled();
    expect(screen.getByLabelText(/monto/i)).toHaveValue("100,00");
    expect(screen.getByLabelText(/moneda/i)).toBeDisabled();
    // S14: los campos libres siguen editables en APROBADO.
    expect(screen.getByLabelText(/proveedor/i)).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    // Regresión cero fantasma (R4): `monto` pasó a requerido en el schema,
    // pero el ítem DECIDIDO sigue guardando sin error — `disabled={decidido}`
    // es una prop JSX, no `register(...,{disabled:true})`, así que RHF
    // conserva el valor precargado y el resolver lo ve presente.
    await waitFor(() => expect(capturedBody.descripcion).toBe("Insumo original"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(capturedBody).not.toHaveProperty("cantidad");
    expect(capturedBody).not.toHaveProperty("monto");
    expect(capturedBody).not.toHaveProperty("moneda");
  });

  it("cero fantasma (R2/R3): limpiar monto de un ítem NO decidido y guardar NO pega a la API y muestra el error de requerido", async () => {
    let pegoALaApi = false;
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, () => {
        pegoALaApi = true;
        return HttpResponse.json(buildItem({ monto: 0 }));
      }),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const monto = await screen.findByLabelText(/monto/i);
    await user.clear(monto);
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/el monto es requerido/i)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(pegoALaApi).toBe(false);
  });

  it("hermano invertido: reemplazar el monto por 2000 en un ítem NO decidido sí envía el request con monto: 2000", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ monto: 2000 }));
      }),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const monto = await screen.findByLabelText(/monto/i);
    await user.clear(monto);
    await user.type(monto, "2000");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.monto).toBe(2000));
  });

  /**
   * `MontoInput` deja el texto crudo en el form hasta el blur, y `Enter`
   * dentro de un `<form>` dispara el submit sin pasar por ahí: el resolver
   * tiene que aceptar el formato es-AR (`"1.000,50"`) igual que tras el blur.
   * `toHaveFocus()` es la guarda: si algún día se introduce un blur antes del
   * submit, este test dejaría de probar lo que dice.
   *
   * El PATCH se difiere con una promesa manual: si se resolviera de entrada,
   * el cierre del diálogo en `onSuccess` movería el foco dentro del mismo
   * `await user.keyboard("{Enter}")`, antes de poder comprobarlo.
   */
  it("Enter sin blur con monto en formato es-AR envía el número correcto", async () => {
    let resolverRespuesta: () => void = () => {};
    const respuestaPendiente = new Promise<void>((resolve) => {
      resolverRespuesta = resolve;
    });
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        await respuestaPendiente;
        return HttpResponse.json(buildItem({ monto: 1234567.89 }));
      }),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const monto = await screen.findByLabelText(/monto/i);
    await user.click(monto);
    await user.clear(monto);
    await user.paste("1.234.567,89");
    await user.keyboard("{Enter}");

    expect(monto).toHaveFocus();
    resolverRespuesta();
    await waitFor(() => expect(capturedBody.monto).toBe(1234567.89));
  });

  /** Hermano invertido: un valor inválido sigue bloqueando el envío por Enter sin blur. */
  it("Enter sin blur con monto inválido sigue bloqueando el envío", async () => {
    let pegoALaApi = false;
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, () => {
        pegoALaApi = true;
        return HttpResponse.json(buildItem());
      }),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const monto = await screen.findByLabelText(/monto/i);
    await user.click(monto);
    await user.clear(monto);
    await user.paste("abc");
    await user.keyboard("{Enter}");

    expect(await screen.findByText(/ingresá un monto válido/i)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(pegoALaApi).toBe(false);
  });

  it("muestra el error de dominio del backend (422) al usuario", async () => {
    const MENSAJE_BACKEND = "El ítem está congelado.";
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });
});
