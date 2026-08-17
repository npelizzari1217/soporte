import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CompraCancelarDialog } from "./compra-cancelar-dialog";
import type { CompraDetalle } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "compra-1";

function buildCompra(overrides: Partial<CompraDetalle> = {}): CompraDetalle {
  return {
    id: COMPRA_ID,
    numero: "COM-2026-00001",
    fechaSolicitud: "2026-01-01",
    motivo: "Insumos",
    descripcion: null,
    solicitanteId: "u1",
    cicloId: "ciclo-1",
    sectorId: null,
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
    ...overrides,
  };
}

describe("CompraCancelarDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("S24-símil: exige motivo no vacío antes de pegarle a la API", async () => {
    renderWithProviders(<CompraCancelarDialog compra={buildCompra()} />, {
      user: buildUser({ permisos: ["COMPRAS:BORRADO"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /cancelar compra/i }));
    await user.click(screen.getByRole("button", { name: /^confirmar cancelación$/i }));

    expect(await screen.findByText(/el motivo de cancelación es requerido/i)).toBeInTheDocument();
  });

  it("S30: con la compra YA CANCELADA, el botón queda deshabilitado", async () => {
    renderWithProviders(
      <CompraCancelarDialog compra={buildCompra({ canceladaEn: "2026-01-05T00:00:00.000Z" })} />,
      { user: buildUser({ permisos: ["COMPRAS:BORRADO"] }) },
    );

    expect(screen.getByRole("button", { name: /cancelar compra/i })).toBeDisabled();
  });

  it("S28: con la compra YA CERRADA, el botón queda deshabilitado", async () => {
    renderWithProviders(<CompraCancelarDialog compra={buildCompra({ cerrado: true })} />, {
      user: buildUser({ permisos: ["COMPRAS:BORRADO"] }),
    });

    expect(screen.getByRole("button", { name: /cancelar compra/i })).toBeDisabled();
  });

  it("envía el POST a cancelar con el motivo", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/cancelar`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildCompra({ canceladaEn: "2026-01-05T00:00:00.000Z" }));
      }),
    );

    renderWithProviders(<CompraCancelarDialog compra={buildCompra()} />, {
      user: buildUser({ permisos: ["COMPRAS:BORRADO"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /cancelar compra/i }));
    await user.type(screen.getByLabelText(/motivo/i), "Ya no se necesita");
    await user.click(screen.getByRole("button", { name: /^confirmar cancelación$/i }));

    await waitFor(() => expect(capturedBody.motivo).toBe("Ya no se necesita"));
  });

  it("muestra el error de dominio del backend (422, S29 con compras registradas) al usuario", async () => {
    const MENSAJE_BACKEND = "La compra tiene compras registradas — cerrala con faltante en vez de cancelarla.";
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/cancelar`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<CompraCancelarDialog compra={buildCompra()} />, {
      user: buildUser({ permisos: ["COMPRAS:BORRADO"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /cancelar compra/i }));
    await user.type(screen.getByLabelText(/motivo/i), "Ya no se necesita");
    await user.click(screen.getByRole("button", { name: /^confirmar cancelación$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });
});
