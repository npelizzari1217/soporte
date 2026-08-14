import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ItemCreateDialog } from "./item-create-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "compra-1";

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /agregar ítem/i }));
  return user;
}

const compraDetalleFixture = {
  id: COMPRA_ID,
  numero: "COM-2026-00001",
  fechaSolicitud: "2026-01-01",
  motivo: "Insumos",
  descripcion: null,
  solicitanteId: "u1",
  cicloId: "ciclo-1",
  estado: "PENDIENTE",
  comprado: false,
  cerrado: false,
  totalesPorMoneda: {},
  canceladaEn: null,
  canceladoPorId: null,
  motivoCancelacion: null,
  items: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ItemCreateDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("al abrir muestra los campos de alta de ítem", async () => {
    renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
      user: buildUser({ permisos: ["compra:gestionar"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/descripción/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cantidad/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/proveedor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/monto/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/moneda/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fecha de cotización/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/observaciones/i)).toBeInTheDocument();
  });

  it("valida cantidad > 0 y monto >= 0 antes de pegarle a la API (feedback inmediato)", async () => {
    renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
      user: buildUser({ permisos: ["compra:gestionar"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/descripción/i), "Insumo");
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "0");
    await user.type(screen.getByLabelText(/proveedor/i), "ACME");
    await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
    await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    expect(await screen.findByText(/la cantidad debe ser mayor a 0/i)).toBeInTheDocument();
  });

  it("envía el POST con el payload correcto y cierra al tener éxito", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(compraDetalleFixture, { status: 201 });
      }),
    );

    renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
      user: buildUser({ permisos: ["compra:gestionar"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/descripción/i), "Insumo");
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "3");
    await user.type(screen.getByLabelText(/proveedor/i), "ACME");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "150.5");
    await user.selectOptions(screen.getByLabelText(/moneda/i), "USD");
    await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(capturedBody.descripcion).toBe("Insumo"));
    expect(capturedBody.cantidad).toBe(3);
    expect(capturedBody.proveedor).toBe("ACME");
    expect(capturedBody.monto).toBe(150.5);
    expect(capturedBody.moneda).toBe("USD");
    expect(capturedBody.fechaCotizacion).toBe("2026-01-01");

    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());
  });

  it("muestra el error de dominio del backend (422) al usuario, sin cerrar el dialog", async () => {
    const MENSAJE_BACKEND = "La compra está cancelada.";
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
      user: buildUser({ permisos: ["compra:gestionar"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/descripción/i), "Insumo");
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "1");
    await user.type(screen.getByLabelText(/proveedor/i), "ACME");
    await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
    await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();
  });
});
