import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { RegistrarOrdenDialog, RegistrarRecepcionDialog, RegistrarEntregaDialog } from "./registrar-avance-dialog";
import type { ItemCompra } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Fix post-verify W4/W5: `hoyISO()` real depende del reloj del sistema — un
// assert que importa `hoyISO` de la implementación y compara contra
// `hoyISO()` pasa por construcción, sin importar el comportamiento real
// (el patrón "el test consagra el síntoma"). Se mockea con un valor FIJO:
// el componente bajo test sigue llamando a `hoyISO()` (dependencia real
// ejercitada), pero el assert compara contra el literal `HOY_FIJO`, nunca
// contra la función.
const HOY_FIJO = "2026-02-10";
vi.mock("../lib/fecha", () => ({ hoyISO: () => HOY_FIJO }));

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
    cantidadOrdenada: 0,
    cantidadRecibida: 0,
    cantidadEntregada: 0,
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

async function abrirDialog(nombreBoton: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: nombreBoton }));
  return user;
}

describe("RegistrarOrdenDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("con ítem APROBADO, el botón está habilitado y precarga cantidad = techo (item.cantidad) cuando nada se ordenó todavía", async () => {
    renderWithProviders(<RegistrarOrdenDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    expect(screen.getByRole("button", { name: /registrar orden/i })).not.toBeDisabled();
    await abrirDialog(/registrar orden/i);
    expect(await screen.findByLabelText(/cantidad ordenada/i)).toHaveValue(10);
    expect(screen.getByLabelText(/^fecha$/i)).toHaveValue(HOY_FIJO);
  });

  it("S47: con ítem PENDIENTE (no aprobado), el botón queda deshabilitado", async () => {
    renderWithProviders(
      <RegistrarOrdenDialog compraId={COMPRA_ID} item={buildItem({ estadoAprobacion: "PENDIENTE" })} />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    expect(screen.getByRole("button", { name: /registrar orden/i })).toBeDisabled();
  });

  it("envía el POST a registrar-orden con el acumulado y la fecha (no delta)", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/registrar-orden`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ cantidadOrdenada: 6, fechaOrden: "2026-01-05T00:00:00.000Z" }));
      }),
    );

    renderWithProviders(<RegistrarOrdenDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog(/registrar orden/i);
    const input = screen.getByLabelText(/cantidad ordenada/i);
    await user.clear(input);
    await user.type(input, "6");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturedBody.cantidadOrdenada).toBe(6));
    expect(capturedBody.fecha).toBe(HOY_FIJO);
  });

  // Fix post-verify W12: el nombre decía "S45 exceso" pero el mock devolvía
  // un mensaje 422 ARBITRARIO — no ejercitaba la regla de dominio S45
  // (`CantidadOrdenadaExcedeSolicitadaError`), solo que "un 422 cualquiera
  // muestra un toast". Ese comportamiento genérico SIGUE siendo válido de
  // probar, pero el nombre ahora dice lo que hace de verdad.
  it("muestra en un toast CUALQUIER mensaje 422 devuelto por el backend (genérico, no específico de S45)", async () => {
    const MENSAJE_BACKEND = "Mensaje de error genérico del backend.";
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/registrar-orden`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<RegistrarOrdenDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog(/registrar orden/i);
    const campo = await screen.findByLabelText(/cantidad ordenada/i);
    await user.clear(campo);
    await user.type(campo, "1");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });

  // Fix post-verify W12: el test que SÍ cubre S45 — sin bound de `max` en el
  // schema de `cantidadOrdenada` (ver `schemas.ts`), el ÚNICO enforcement de
  // "no ordenar más de lo pedido" es el backend
  // (`CantidadOrdenadaExcedeSolicitadaError`). Mensaje REAL de esa clase
  // (`compras.errors.ts`), valor enviado (99) genuinamente en exceso sobre
  // `item.cantidad` (10, `buildItem()` default).
  it("S45: cantidadOrdenada > item.cantidad -> el 422 de CantidadOrdenadaExcedeSolicitadaError llega al usuario en un toast", async () => {
    const MENSAJE_S45 =
      'La cantidad ordenada registrada para el ítem "item-1" excede la cantidad solicitada.';
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/registrar-orden`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_S45 }, { status: 422 }),
      ),
    );

    renderWithProviders(<RegistrarOrdenDialog compraId={COMPRA_ID} item={buildItem({ cantidad: 10 })} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog(/registrar orden/i);
    const campo = await screen.findByLabelText(/cantidad ordenada/i);
    await user.clear(campo);
    await user.type(campo, "99");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_S45));
  });
});

describe("RegistrarRecepcionDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("W-D: abrir y guardar SIN cambiar el acumulado ni la fecha no pega a la API", async () => {
    let pegoALaApi = false;
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/registrar-recepcion`, () => {
        pegoALaApi = true;
        return HttpResponse.json(buildItem({ cantidadRecibida: 4 }));
      }),
    );

    renderWithProviders(
      <RegistrarRecepcionDialog
        compraId={COMPRA_ID}
        item={buildItem({ cantidadOrdenada: 4, cantidadRecibida: 4, fechaRecepcion: `${HOY_FIJO}T00:00:00.000Z` })}
      />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    const user = await abrirDialog(/registrar recepción/i);
    await user.click(await screen.findByRole("button", { name: /^guardar$/i }));

    await new Promise((r) => setTimeout(r, 50));
    expect(pegoALaApi).toBe(false);
  });

  it("con cantidadOrdenada > 0, el botón está habilitado y precarga cantidadRecibida actual", async () => {
    renderWithProviders(
      <RegistrarRecepcionDialog
        compraId={COMPRA_ID}
        item={buildItem({ cantidadOrdenada: 5, cantidadRecibida: 2 })}
      />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    expect(screen.getByRole("button", { name: /registrar recepción/i })).not.toBeDisabled();
    await abrirDialog(/registrar recepción/i);
    expect(await screen.findByLabelText(/cantidad recibida/i)).toHaveValue(2);
  });

  it("sin nada ordenado todavía (cantidadOrdenada=0), el botón queda deshabilitado", async () => {
    renderWithProviders(
      <RegistrarRecepcionDialog compraId={COMPRA_ID} item={buildItem({ cantidadOrdenada: 0 })} />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    expect(screen.getByRole("button", { name: /registrar recepción/i })).toBeDisabled();
  });

  it("envía el POST a registrar-recepcion con el acumulado (no delta)", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/registrar-recepcion`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ cantidadOrdenada: 5, cantidadRecibida: 5 }));
      }),
    );

    renderWithProviders(
      <RegistrarRecepcionDialog compraId={COMPRA_ID} item={buildItem({ cantidadOrdenada: 5 })} />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    const user = await abrirDialog(/registrar recepción/i);
    const input = screen.getByLabelText(/cantidad recibida/i);
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturedBody.cantidadRecibida).toBe(5));
  });
});

describe("RegistrarEntregaDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("con cantidadRecibida > 0, el botón está habilitado y precarga cantidadEntregada actual", async () => {
    renderWithProviders(
      <RegistrarEntregaDialog
        compraId={COMPRA_ID}
        item={buildItem({ cantidadOrdenada: 5, cantidadRecibida: 5, cantidadEntregada: 2 })}
      />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    expect(screen.getByRole("button", { name: /registrar entrega/i })).not.toBeDisabled();
    await abrirDialog(/registrar entrega/i);
    expect(await screen.findByLabelText(/cantidad entregada/i)).toHaveValue(2);
  });

  it("sin nada recibido todavía (cantidadRecibida=0), el botón queda deshabilitado", async () => {
    renderWithProviders(
      <RegistrarEntregaDialog compraId={COMPRA_ID} item={buildItem({ cantidadRecibida: 0 })} />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    expect(screen.getByRole("button", { name: /registrar entrega/i })).toBeDisabled();
  });

  it("envía el POST a registrar-entrega con el acumulado (no delta)", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/item-1/registrar-entrega`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ cantidadRecibida: 5, cantidadEntregada: 5 }));
      }),
    );

    renderWithProviders(
      <RegistrarEntregaDialog compraId={COMPRA_ID} item={buildItem({ cantidadOrdenada: 5, cantidadRecibida: 5 })} />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    const user = await abrirDialog(/registrar entrega/i);
    const input = screen.getByLabelText(/cantidad entregada/i);
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturedBody.cantidadEntregada).toBe(5));
  });
});
