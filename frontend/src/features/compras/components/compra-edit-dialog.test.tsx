import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CompraEditDialog } from "./compra-edit-dialog";
import type { CompraDetalle } from "../types";
import type { Sector } from "../../sectores/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "compra-1";

function buildCompra(overrides: Partial<CompraDetalle> = {}): CompraDetalle {
  return {
    id: COMPRA_ID,
    numero: "COM-2026-00001",
    // Formato REAL del backend: datetime ISO completo, no "YYYY-MM-DD". El
    // fixture anterior usaba la forma ya normalizada y por eso no atrapaba el
    // bug de precarga del `<input type="date">`.
    fechaSolicitud: "2026-01-10T00:00:00.000Z",
    motivo: "Motivo original",
    descripcion: null,
    solicitanteId: "usuario-1",
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
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
    ...overrides,
  };
}

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /editar cabecera/i }));
  return user;
}

function buildSector(overrides: Partial<Sector> = {}): Sector {
  return {
    id: "sector-ventas",
    codigo: "VENTAS",
    nombre: "Ventas",
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Catálogo ACTIVO real (2+), sin ninguna traza del sector de baja. */
const SECTORES_ACTIVOS: Sector[] = [
  buildSector({ id: "sector-ventas", codigo: "VENTAS", nombre: "Ventas" }),
  buildSector({ id: "sector-compras", codigo: "COMPRAS", nombre: "Compras" }),
];

function mockSectores(sectores: Sector[] = SECTORES_ACTIVOS) {
  server.use(http.get("/api/sectores", () => HttpResponse.json(sectores)));
}

describe("CompraEditDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("precarga los valores actuales de la cabecera", async () => {
    renderWithProviders(
      <CompraEditDialog compra={buildCompra({ descripcion: "Detalle previo" })} />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    await abrirDialog();

    expect(await screen.findByLabelText(/motivo/i)).toHaveValue("Motivo original");
    expect(screen.getByLabelText(/descripción/i)).toHaveValue("Detalle previo");
  });

  it("regresión: precarga la fecha aunque el backend la mande como datetime ISO — sin normalizar, el input queda VACÍO", async () => {
    renderWithProviders(<CompraEditDialog compra={buildCompra()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/fecha de solicitud/i)).toHaveValue("2026-01-10");
  });

  it("envía el PATCH con la cabecera editada", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildCompra({ motivo: "Motivo corregido" }));
      }),
    );

    renderWithProviders(<CompraEditDialog compra={buildCompra()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const motivoInput = await screen.findByLabelText(/motivo/i);
    await user.clear(motivoInput);
    await user.type(motivoInput, "Motivo corregido");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.motivo).toBe("Motivo corregido"));
    expect(capturedBody.fechaSolicitud).toBe("2026-01-10");
  });

  it("descripcion/sectorId vacíos viajan como null explícito (limpiar), no como cadena vacía", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildCompra());
      }),
    );

    renderWithProviders(
      <CompraEditDialog compra={buildCompra({ descripcion: "Se va a borrar" })} />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    const user = await abrirDialog();
    await user.clear(await screen.findByLabelText(/descripción/i));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.descripcion).toBeNull());
    expect(capturedBody.sectorId).toBeNull();
  });

  it("con la compra ya decidida (APROBADO) deshabilita el trigger y explica por qué", async () => {
    renderWithProviders(<CompraEditDialog compra={buildCompra({ estado: "APROBADO" })} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const trigger = screen.getByRole("button", { name: /editar cabecera/i });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("title", expect.stringMatching(/pendiente/i));
  });

  it("con la compra CANCELADA queda bloqueada por el mismo estado derivado, sin chequeo aparte", async () => {
    renderWithProviders(
      <CompraEditDialog
        compra={buildCompra({ estado: "CANCELADO", canceladaEn: "2026-01-15T00:00:00.000Z" })}
      />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    expect(screen.getByRole("button", { name: /editar cabecera/i })).toBeDisabled();
  });

  it("muestra el error de dominio del backend (422) al usuario", async () => {
    const MENSAJE_BACKEND = 'La compra "compra-1" ya no está PENDIENTE.';
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<CompraEditDialog compra={buildCompra()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    await user.click(await screen.findByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });

  it("el select muestra el sector de baja, no otro valor", async () => {
    mockSectores();

    renderWithProviders(<CompraEditDialog compra={buildCompra({ sectorId: "sector-baja" })} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/sector de destino/i)).toHaveValue("sector-baja");
  });

  it("mientras el catálogo de sectores está cargando, no etiqueta el valor vigente como dado de baja", async () => {
    // `delay("infinite")` deja la query en `isLoading` para siempre, sin
    // carrera contra el tiempo real: la prueba es determinística.
    server.use(
      http.get("/api/sectores", async () => {
        await delay("infinite");
        return HttpResponse.json(SECTORES_ACTIVOS);
      }),
    );

    renderWithProviders(<CompraEditDialog compra={buildCompra({ sectorId: "sector-baja" })} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();
    await screen.findByLabelText(/sector de destino/i);

    expect(screen.queryByRole("option", { name: /dado de baja/i })).not.toBeInTheDocument();
  });

  it("si el catálogo de sectores falla, nunca etiqueta el valor vigente como dado de baja (caso permanente: sin retry en tests, ver render-with-providers)", async () => {
    let solicitudesASectores = 0;
    server.use(
      http.get("/api/sectores", () => {
        solicitudesASectores += 1;
        return HttpResponse.json({ statusCode: 500, message: "Error" }, { status: 500 });
      }),
    );

    renderWithProviders(<CompraEditDialog compra={buildCompra({ sectorId: "sector-baja" })} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();
    await screen.findByLabelText(/sector de destino/i);

    // Confirma que la request realmente se disparó y la query tuvo tiempo de
    // resolver a error (`retry: false` en los tests) antes de aserter la
    // ausencia — si no, el test pasaría igual sin haber probado nada.
    await waitFor(() => expect(solicitudesASectores).toBeGreaterThan(0));
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /dado de baja/i })).not.toBeInTheDocument();
    });
  });

  it("un sector ACTIVO no agrega la opción sintética 'dado de baja'", async () => {
    mockSectores();

    renderWithProviders(<CompraEditDialog compra={buildCompra({ sectorId: "sector-ventas" })} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();
    await screen.findByLabelText(/sector de destino/i);

    expect(screen.queryByRole("option", { name: /dado de baja/i })).not.toBeInTheDocument();
    // Catálogo activo + "Sin sector".
    expect(screen.getAllByRole("option")).toHaveLength(SECTORES_ACTIVOS.length + 1);
  });

  it("guardar sin tocar el select conserva el sector de baja (post-fix: _formValues ya lo conservaba antes del fix, ver design §4)", async () => {
    mockSectores();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildCompra({ sectorId: "sector-baja" }));
      }),
    );

    renderWithProviders(<CompraEditDialog compra={buildCompra({ sectorId: "sector-baja" })} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    await screen.findByLabelText(/sector de destino/i);
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.sectorId).toBe("sector-baja"));
  });

  it("elegir 'Sin sector' sobre un sector de baja lo limpia de verdad (sectorId: null)", async () => {
    mockSectores();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildCompra({ sectorId: null }));
      }),
    );

    renderWithProviders(<CompraEditDialog compra={buildCompra({ sectorId: "sector-baja" })} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const sectorSelect = await screen.findByLabelText(/sector de destino/i);
    await user.selectOptions(sectorSelect, "Sin sector");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.sectorId).toBeNull());
  });
});
