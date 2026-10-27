import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CompraEditDialog } from "./compra-edit-dialog";
import type { CompraDetalle } from "../types";
import type { Sector } from "../../sectores/types";
import type { TipoTicket } from "@/features/tickets/types";
import { permisosDeTest, renderConPermisos } from "@/shared/hooks/use-permisos-por-tipo.test-helpers";

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
    tipoTicket: null,
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
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    // El selector de tipo consulta el catálogo; vacío salvo en los tests que hablan del tipo.
    server.use(http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json([])));
  });

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
    const sectorSelect = await screen.findByLabelText(/sector de destino/i);

    expect(screen.queryByRole("option", { name: /dado de baja/i })).not.toBeInTheDocument();
    // Catálogo activo + "Sin sector", contados en el select de sector: el diálogo tiene otros.
    expect(within(sectorSelect).getAllByRole("option")).toHaveLength(SECTORES_ACTIVOS.length + 1);
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

  describe("tipo de ticket (odd/compras-por-tipo, S3, S4)", () => {
    const TIPO_SOPORTE_ID = "11111111-1111-4111-8111-111111111111";
    const TIPO_EDILICIA_ID = "22222222-2222-4222-8222-222222222222";
    const TIPO_MANTENIMIENTO_ID = "33333333-3333-4333-8333-333333333333";

    function tipo(id: string, codigo: string, nombre: string, modulo: TipoTicket["modulo"]): TipoTicket {
      return { id, codigo, nombre, modulo, activo: true, createdAt: "", updatedAt: "" };
    }

    const TIPOS: TipoTicket[] = [
      tipo(TIPO_SOPORTE_ID, "SOPORTE", "Soporte", "TICKETS"),
      tipo(TIPO_EDILICIA_ID, "EDILICIA", "Edilicia", "EDILICIA"),
      tipo(TIPO_MANTENIMIENTO_ID, "MANTENIMIENTO", "Mantenimiento", "EDILICIA"),
    ];

    /** ALTAS en Soporte y Mantenimiento; Edilicia solo se lee. */
    const PERMISOS = permisosDeTest({
      [TIPO_SOPORTE_ID]: ["LECTURA", "ALTAS"],
      [TIPO_EDILICIA_ID]: ["LECTURA"],
      [TIPO_MANTENIMIENTO_ID]: ["LECTURA", "ALTAS"],
    });

    const tecnico = buildUser({ rol: "TECNICO", permisos: ["COMPRAS:MODIFICACION"] });

    let bodies: Record<string, unknown>[];

    beforeEach(() => {
      bodies = [];
      server.use(
        http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json(TIPOS)),
        http.patch(`/api/compras/${COMPRA_ID}`, async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json(buildCompra());
        }),
      );
    });

    function renderEdit(compra: CompraDetalle) {
      renderConPermisos(<CompraEditDialog compra={compra} />, { user: tecnico, permisos: PERMISOS });
    }

    it("guardar sin tocar el tipo NO manda tipoTicketId", async () => {
      renderEdit(buildCompra({ tipoTicket: { id: TIPO_SOPORTE_ID, nombre: "Soporte" } }));

      const user = await abrirDialog();
      await screen.findByRole("option", { name: "Mantenimiento" });
      expect(screen.getByLabelText("Tipo")).toHaveValue(TIPO_SOPORTE_ID);
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).not.toHaveProperty("tipoTicketId");
    });

    it("cambiar a otro tipo con ALTAS lo manda; un tipo sin ALTAS no se ofrece", async () => {
      renderEdit(buildCompra({ tipoTicket: { id: TIPO_SOPORTE_ID, nombre: "Soporte" } }));

      const user = await abrirDialog();
      await screen.findByRole("option", { name: "Mantenimiento" });
      expect(screen.queryByRole("option", { name: /edilicia/i })).not.toBeInTheDocument();
      // Una compra con tipo no vuelve a quedar sin tipo: no hay opción vacía.
      expect(screen.queryByRole("option", { name: "Sin tipo" })).not.toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText("Tipo"), TIPO_MANTENIMIENTO_ID);
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0].tipoTicketId).toBe(TIPO_MANTENIMIENTO_ID);
    });

    it("compra sin tipo: muestra «Sin tipo» y guardar sin elegir no manda tipoTicketId (nunca null)", async () => {
      renderEdit(buildCompra({ tipoTicket: null }));

      const user = await abrirDialog();
      await screen.findByRole("option", { name: "Soporte" });
      expect(screen.getByLabelText("Tipo")).toHaveValue("");
      expect(screen.getByRole("option", { name: "Sin tipo" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /edilicia/i })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).not.toHaveProperty("tipoTicketId");
    });

    it("compra sin tipo: elegir uno con ALTAS lo asigna", async () => {
      renderEdit(buildCompra({ tipoTicket: null }));

      const user = await abrirDialog();
      await screen.findByRole("option", { name: "Soporte" });
      await user.selectOptions(screen.getByLabelText("Tipo"), TIPO_SOPORTE_ID);
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0].tipoTicketId).toBe(TIPO_SOPORTE_ID);
    });

    it("tipo actual sin ALTAS: se muestra como actual y guardar sin tocarlo no lo manda", async () => {
      renderEdit(buildCompra({ tipoTicket: { id: TIPO_EDILICIA_ID, nombre: "Edilicia" } }));

      const user = await abrirDialog();
      expect(await screen.findByRole("option", { name: "Edilicia (actual)" })).toBeInTheDocument();
      expect(screen.getByLabelText("Tipo")).toHaveValue(TIPO_EDILICIA_ID);
      expect(screen.getByRole("option", { name: "Soporte" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).not.toHaveProperty("tipoTicketId");
    });

    it("mientras el catálogo carga, muestra el tipo actual sin marcarlo como no elegible", async () => {
      server.use(
        http.get("/api/catalogos/tipos-ticket", async () => {
          await delay("infinite");
          return HttpResponse.json(TIPOS);
        }),
      );
      renderEdit(buildCompra({ tipoTicket: { id: TIPO_SOPORTE_ID, nombre: "Soporte" } }));

      await abrirDialog();
      await screen.findByLabelText("Tipo");

      expect(screen.getByLabelText("Tipo")).toHaveValue(TIPO_SOPORTE_ID);
      expect(screen.getByRole("option", { name: "Soporte" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /\(actual\)/ })).not.toBeInTheDocument();
    });

    it("un 403 del backend al cambiar el tipo muestra su mensaje", async () => {
      const MENSAJE_BACKEND = "No tiene permiso para crear compras del tipo Mantenimiento.";
      server.use(
        http.patch(`/api/compras/${COMPRA_ID}`, () =>
          HttpResponse.json({ statusCode: 403, message: MENSAJE_BACKEND }, { status: 403 }),
        ),
      );
      renderEdit(buildCompra({ tipoTicket: { id: TIPO_SOPORTE_ID, nombre: "Soporte" } }));

      const user = await abrirDialog();
      await screen.findByRole("option", { name: "Mantenimiento" });
      await user.selectOptions(screen.getByLabelText("Tipo"), TIPO_MANTENIMIENTO_ID);
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
    });
  });
});
