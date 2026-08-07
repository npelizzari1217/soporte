import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CompraDetailView } from "./compra-detail-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_PENDIENTE = {
  id: "tc1",
  ticketId: "t1",
  numero: "COM-0001",
  titulo: "Compra de notebooks",
  estadoId: "e1",
  aprobadoPorId: null,
  aprobadoEn: null,
  motivoRechazo: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend(detalle: Record<string, unknown> = {}) {
  server.use(
    http.get("/api/compras", () => HttpResponse.json([COMPRA_PENDIENTE])),
    http.get("/api/compras/t1", () =>
      HttpResponse.json({ ...COMPRA_PENDIENTE, items: [], presupuestos: [], ...detalle }),
    ),
  );
}

describe("CompraDetailView — decisión (aprobar/rechazar) y su gating (80/20)", () => {
  beforeEach(() => {
    mockBackend();
    vi.mocked(toast.success).mockClear();
  });

  it.each([
    ["con compra:aprobar", ["compra:gestionar", "compra:aprobar"], true],
    ["sin compra:aprobar", ["compra:gestionar"], false],
  ])("botón «Aprobar» — %s", async (_label, permisos, shouldShow) => {
    renderWithProviders(<CompraDetailView ticketId="t1" />, { user: buildUser({ permisos }) });
    await screen.findByText("COM-0001 — Compra de notebooks");

    if (shouldShow) {
      expect(screen.getByRole("button", { name: "Aprobar" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument();
    }
  });

  it.each([
    ["con ticket:rechazar", ["compra:gestionar", "ticket:rechazar"], true],
    ["sin ticket:rechazar", ["compra:gestionar"], false],
  ])("botón «Rechazar» — %s", async (_label, permisos, shouldShow) => {
    renderWithProviders(<CompraDetailView ticketId="t1" />, { user: buildUser({ permisos }) });
    await screen.findByText("COM-0001 — Compra de notebooks");

    if (shouldShow) {
      expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument();
    }
  });

  it("aprobar SOLO dispara POST /compras/:ticketId/aprobar tras confirmar — nunca transiciona el estado del ticket", async () => {
    const user = userEvent.setup();
    let aprobarLlamado = false;
    let estadoLlamado = false;
    server.use(
      http.post("/api/compras/t1/aprobar", () => {
        aprobarLlamado = true;
        return HttpResponse.json({ ...COMPRA_PENDIENTE, aprobadoPorId: "u1", aprobadoEn: "2026-01-02T00:00:00.000Z" });
      }),
      http.patch("/api/tickets/t1/estado", () => {
        estadoLlamado = true;
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<CompraDetailView ticketId="t1" />, {
      user: buildUser({ permisos: ["compra:gestionar", "compra:aprobar"] }),
    });
    await screen.findByText("COM-0001 — Compra de notebooks");

    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(aprobarLlamado).toBe(false); // el click en el trigger NO alcanza — falta confirmar

    const confirmButtons = await screen.findAllByRole("button", { name: "Aprobar" });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(aprobarLlamado).toBe(true));
    expect(estadoLlamado).toBe(false);
  });

  it("rechazar sin motivo NO dispara el POST — motivo requerido (espejo de MotivoRechazoRequeridoError)", async () => {
    const user = userEvent.setup();
    let rechazarLlamado = false;
    server.use(
      http.post("/api/compras/t1/rechazar", () => {
        rechazarLlamado = true;
        return HttpResponse.json({ ...COMPRA_PENDIENTE, motivoRechazo: "no aprobado" });
      }),
    );

    renderWithProviders(<CompraDetailView ticketId="t1" />, {
      user: buildUser({ permisos: ["compra:gestionar", "ticket:rechazar"] }),
    });
    await screen.findByText("COM-0001 — Compra de notebooks");

    await user.click(screen.getByRole("button", { name: "Rechazar" }));
    await user.click(screen.getByRole("button", { name: /confirmar rechazo/i }));

    expect(rechazarLlamado).toBe(false);
    expect(await screen.findByText(/motivo de rechazo es requerido/i)).toBeInTheDocument();
  });
});

describe("CompraDetailView — consume items/presupuestos embebidos de GET /compras/:id (item 1 backend-gaps)", () => {
  it("renderiza ítems y presupuestos ya existentes SIN necesidad de agregarlos vía mutación", async () => {
    mockBackend({
      items: [
        {
          id: "i1",
          ticketCompraId: "tc1",
          descripcion: "Notebook Dell",
          cantidad: 3,
          unidad: "u",
          precioUnitarioRef: null,
          observaciones: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      presupuestos: [
        {
          id: "p1",
          ticketCompraId: "tc1",
          proveedor: "Proveedor Existente",
          montoTotal: 500,
          moneda: "ARS",
          fechaCotizacion: "2026-01-01",
          seleccionado: true,
          observaciones: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    renderWithProviders(<CompraDetailView ticketId="t1" />, { user: buildUser({ permisos: ["compra:gestionar"] }) });

    expect(await screen.findByText(/notebook dell/i)).toBeInTheDocument();
    expect(await screen.findByText(/proveedor existente/i)).toBeInTheDocument();
    expect(screen.getByText(/^seleccionado$/i)).toBeInTheDocument();
  });
});

describe("CompraPresupuestosSection — invariante «un solo presupuesto seleccionado»", () => {
  beforeEach(() => {
    mockBackend();
  });

  it("seleccionar un nuevo presupuesto desmarca el anteriormente seleccionado (swap atómico, espejo ADR-7 backend)", async () => {
    const user = userEvent.setup();
    const build = (id: string, proveedor: string) => ({
      id,
      ticketCompraId: "tc1",
      proveedor,
      montoTotal: 100,
      moneda: "ARS",
      fechaCotizacion: "2026-01-01",
      seleccionado: false,
      observaciones: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const P1 = build("p1", "Proveedor A");
    const P2 = build("p2", "Proveedor B");

    server.use(
      http.post("/api/compras/tc1/presupuestos", () => HttpResponse.json(P1), { once: true }),
      http.post("/api/compras/tc1/presupuestos", () => HttpResponse.json(P2), { once: true }),
      http.post("/api/compras/tc1/presupuestos/p1/seleccionar", () =>
        HttpResponse.json({ ...P1, seleccionado: true }),
      ),
      http.post("/api/compras/tc1/presupuestos/p2/seleccionar", () =>
        HttpResponse.json({ ...P2, seleccionado: true }),
      ),
    );

    renderWithProviders(<CompraDetailView ticketId="t1" />, { user: buildUser({ permisos: ["compra:gestionar"] }) });
    await screen.findByText("COM-0001 — Compra de notebooks");

    async function agregarPresupuesto(proveedor: string, fecha: string) {
      await user.type(screen.getByLabelText(/proveedor/i), proveedor);
      await user.type(screen.getByLabelText(/monto/i), "100");
      await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
      fireEvent.change(screen.getByLabelText(/fecha cotización/i), { target: { value: fecha } });
      await user.click(screen.getByRole("button", { name: /agregar presupuesto/i }));
    }

    await agregarPresupuesto("Proveedor A", "2026-01-01");
    await screen.findByText(/proveedor a/i);
    await agregarPresupuesto("Proveedor B", "2026-01-02");
    await screen.findByText(/proveedor b/i);

    await user.click(screen.getAllByRole("button", { name: /^seleccionar$/i })[0]);
    await waitFor(() => expect(screen.getAllByText(/^seleccionado$/i)).toHaveLength(1));

    // Único botón "Seleccionar" restante es el de Proveedor B — seleccionarlo debe desmarcar A.
    await user.click(screen.getAllByRole("button", { name: /^seleccionar$/i })[0]);
    await waitFor(() => expect(screen.getAllByText(/^seleccionado$/i)).toHaveLength(1));
    expect(screen.getByText(/proveedor b —/i).closest("li")).toHaveTextContent(/seleccionado/i);
    expect(screen.getByText(/proveedor a —/i).closest("li")).not.toHaveTextContent(/seleccionado/i);
  });
});
