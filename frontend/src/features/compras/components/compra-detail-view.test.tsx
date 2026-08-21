import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CompraDetailView } from "./compra-detail-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const COMPRA_DETALLE = {
  id: "c1",
  numero: "COM-2026-00001",
  fechaSolicitud: "2026-01-15",
  motivo: "Reposición de insumos",
  descripcion: "Compra trimestral de librería",
  solicitanteId: "u1",
  cicloId: "ciclo1",
  sectorId: null,
  estado: "APROBADO_PARCIALMENTE",
  comprado: false,
  cerrado: false,
  totalesPorMoneda: { ARS: 1500.5 },
  canceladaEn: null,
  canceladoPorId: null,
  motivoCancelacion: null,
  items: [
    {
      id: "i1",
      compraId: "c1",
      descripcion: "Resmas de papel A4",
      cantidad: 10,
      proveedor: "Papelera SA",
      monto: 1500.5,
      moneda: "ARS",
      fechaCotizacion: "2026-01-10",
      observaciones: null,
      estadoAprobacion: "APROBADO",
      decididoPorId: "u2",
      decididoEn: "2026-01-11T00:00:00.000Z",
      cantidadOrdenada: 5,
      cantidadRecibida: 5,
      cantidadEntregada: 0,
      fechaOrden: "2026-01-12T00:00:00.000Z",
      fechaRecepcion: "2026-01-13T00:00:00.000Z",
      fechaEntrega: null,
      totalItem: 7502.5,
      cerradoConFaltante: false,
      motivoCierreFaltante: null,
      comprado: false,
      entregado: false,
      createdAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-01-11T00:00:00.000Z",
    },
    {
      id: "i2",
      compraId: "c1",
      descripcion: "Tóner láser",
      cantidad: 2,
      proveedor: "Insumos SRL",
      monto: 300,
      moneda: "ARS",
      fechaCotizacion: "2026-01-10",
      observaciones: null,
      estadoAprobacion: "RECHAZADO",
      decididoPorId: "u2",
      decididoEn: "2026-01-11T00:00:00.000Z",
      cantidadOrdenada: 0,
      cantidadRecibida: 0,
      cantidadEntregada: 0,
      fechaOrden: null,
      fechaRecepcion: null,
      fechaEntrega: null,
      totalItem: 600,
      cerradoConFaltante: false,
      motivoCierreFaltante: null,
      comprado: false,
      entregado: false,
      createdAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-01-11T00:00:00.000Z",
    },
  ],
  createdAt: "2026-01-10T00:00:00.000Z",
  updatedAt: "2026-01-11T00:00:00.000Z",
};

const OPERACIONES = [
  {
    id: "op1",
    compraId: "c1",
    itemCompraId: null,
    tipo: "CREACION",
    usuarioId: "u1",
    detalle: "Compra creada",
    datos: null,
    createdAt: "2026-01-10T00:00:00.000Z",
  },
];

describe("CompraDetailView", () => {
  it("compra no encontrada (404) → ErrorState en vez de romper", async () => {
    server.use(
      http.get("/api/compras/inexistente", () =>
        HttpResponse.json({ message: "No encontrada" }, { status: 404 }),
      ),
    );
    renderWithProviders(<CompraDetailView compraId="inexistente" />, {
      user: buildUser({ modulos: ["COMPRAS"] }),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la compra.");
  });

  it("render de la tabla de ítems con el shape real del backend — sin re-derivar estado", async () => {
    server.use(
      http.get("/api/compras/c1", () => HttpResponse.json(COMPRA_DETALLE)),
      http.get("/api/compras/c1/operaciones", () => HttpResponse.json(OPERACIONES)),
    );
    renderWithProviders(<CompraDetailView compraId="c1" />, {
      user: buildUser({ modulos: ["COMPRAS"] }),
    });

    await screen.findByText("Resmas de papel A4");
    expect(screen.getByText("Tóner láser")).toBeInTheDocument();
    // El ítem aprobado muestra "Aprobado"; el rechazado "Rechazado" — sin
    // recalcular nada, son `estadoAprobacion` tal cual llega del DTO.
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
    expect(screen.getByText("Rechazado")).toBeInTheDocument();
  });

  // render-fechas-frontend: `Compra.fechaSolicitud` e
  // `ItemCompra.fechaOrden`/`fechaRecepcion`/`fechaEntrega` son @db.Date.
  // Cabecera e ítems usaban `aFechaInput` (normalizador de INPUT) y
  // mostraban el ISO crudo. Literales fijos, NO derivados de `Intl`.
  it("fecha de solicitud y fechas de ítems se muestran dd/mm/yyyy, con guion cuando la etapa no se registró", async () => {
    server.use(
      http.get("/api/compras/c1", () => HttpResponse.json(COMPRA_DETALLE)),
      http.get("/api/compras/c1/operaciones", () => HttpResponse.json(OPERACIONES)),
    );
    renderWithProviders(<CompraDetailView compraId="c1" />, {
      user: buildUser({ modulos: ["COMPRAS"] }),
    });

    await screen.findByText("Resmas de papel A4");

    // Cabecera: "2026-01-15" -> "15/01/2026", nunca el ISO crudo.
    expect(screen.getByText("15/01/2026")).toBeInTheDocument();
    expect(screen.queryByText(/2026-01-15/)).not.toBeInTheDocument();

    // Ítem i1: orden/recepción registradas, entrega todavía no (guion).
    expect(screen.getByText("Orden: 12/01/2026")).toBeInTheDocument();
    expect(screen.getByText("Recepción: 13/01/2026")).toBeInTheDocument();

    // Ítem i1 y i2 comparten "Entrega: —" (ninguno tiene la etapa registrada);
    // i2 además no tiene orden ni recepción registradas — se conserva el
    // comportamiento previo del helper local para `fecha === null`.
    expect(screen.getAllByText("Entrega: —").length).toBe(2);
    expect(screen.getAllByText("Orden: —").length).toBe(1);
    expect(screen.getAllByText("Recepción: —").length).toBe(1);
  });

  it("bitácora: arma la request a /compras/:id/operaciones y renderiza las operaciones reales", async () => {
    let bitacoraRequestUrl: string | undefined;
    server.use(
      http.get("/api/compras/c1", () => HttpResponse.json(COMPRA_DETALLE)),
      http.get("/api/compras/c1/operaciones", ({ request }) => {
        bitacoraRequestUrl = request.url;
        return HttpResponse.json(OPERACIONES);
      }),
    );
    renderWithProviders(<CompraDetailView compraId="c1" />, {
      user: buildUser({ modulos: ["COMPRAS"] }),
    });

    expect(await screen.findByText("Compra creada")).toBeInTheDocument();
    expect(bitacoraRequestUrl).toContain("/api/compras/c1/operaciones");
  });

  it("bitácora: si la API de operaciones falla, muestra su propio ErrorState sin romper el resto del detalle", async () => {
    server.use(
      http.get("/api/compras/c1", () => HttpResponse.json(COMPRA_DETALLE)),
      http.get("/api/compras/c1/operaciones", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<CompraDetailView compraId="c1" />, {
      user: buildUser({ modulos: ["COMPRAS"] }),
    });

    // La cabecera y los ítems se renderizan igual — el fallo de bitácora es aislado.
    await screen.findByText("Resmas de papel A4");
    expect(await screen.findByText("No se pudo cargar la bitácora.")).toBeInTheDocument();
  });

  describe("gate de permisos en las acciones", () => {
    it.each([
      { boton: /^agregar ítem$/i, permiso: "COMPRAS:ALTAS" as const },
      { boton: /^cancelar compra$/i, permiso: "COMPRAS:BORRADO" as const },
      { boton: /^editar ítem$/i, permiso: "COMPRAS:MODIFICACION" as const },
      { boton: /^eliminar$/i, permiso: "COMPRAS:BORRADO" as const },
      { boton: /registrar orden/i, permiso: "COMPRAS:MODIFICACION" as const },
      { boton: /registrar entrega/i, permiso: "COMPRAS:MODIFICACION" as const },
      { boton: /cerrar con faltante/i, permiso: "COMPRAS:MODIFICACION" as const },
      { boton: /^aprobar$/i, permiso: "COMPRAS:APROBACION" as const },
      { boton: /^rechazar$/i, permiso: "COMPRAS:APROBACION" as const },
    ])(
      "trigger $boton requiere $permiso: presente con el permiso, ausente sin él",
      async ({ boton, permiso }) => {
        server.use(
          http.get("/api/compras/c1", () => HttpResponse.json(COMPRA_DETALLE)),
          http.get("/api/compras/c1/operaciones", () => HttpResponse.json(OPERACIONES)),
        );

        const { unmount } = renderWithProviders(<CompraDetailView compraId="c1" />, {
          user: buildUser({ modulos: ["COMPRAS"], permisos: [permiso] }),
        });
        await screen.findByText("Resmas de papel A4");
        expect(screen.queryAllByRole("button", { name: boton }).length).toBeGreaterThan(0);
        unmount();

        renderWithProviders(<CompraDetailView compraId="c1" />, {
          user: buildUser({ modulos: ["COMPRAS"], permisos: [] }),
        });
        await screen.findByText("Resmas de papel A4");
        expect(screen.queryAllByRole("button", { name: boton }).length).toBe(0);
      },
    );
  });
});
