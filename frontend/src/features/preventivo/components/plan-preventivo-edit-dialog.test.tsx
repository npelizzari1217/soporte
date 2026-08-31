import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { PlanPreventivoEditDialog } from "./plan-preventivo-edit-dialog";
import type { PlanPreventivo } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PLAN_ID = "88888888-8888-8888-8888-888888888888";
const PRIORIDAD_ID = "11111111-1111-1111-1111-111111111111";
const USUARIO_ID = "33333333-3333-3333-3333-333333333333";
const EQUIPO_ID = "22222222-2222-2222-2222-222222222222";

const PLAN_CON_UBICACION: PlanPreventivo = {
  id: PLAN_ID,
  titulo: "Revisión mensual",
  instrucciones: "Instrucciones originales",
  equipoId: null,
  ubicacion: "DEPOSITO",
  prioridadId: PRIORIDAD_ID,
  responsableId: USUARIO_ID,
  intervaloValor: 1,
  intervaloUnidad: "MESES",
  fechaInicio: "2026-01-01",
  proximaEjecucionEn: "2026-04-01",
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const PLAN_CON_EQUIPO: PlanPreventivo = { ...PLAN_CON_UBICACION, equipoId: EQUIPO_ID, ubicacion: null };

function mockCatalogos() {
  server.use(
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([
        { id: PRIORIDAD_ID, codigo: "MEDIA", nombre: "Media", color: null, orden: 1, activo: true, createdAt: "", updatedAt: "" },
      ]),
    ),
    http.get("/api/usuarios", () =>
      HttpResponse.json([{ id: USUARIO_ID, nombre: "Ana", apellido: "Gómez", rol: "TECNICO" }]),
    ),
  );
}

/** Registra el handler de edición y devuelve el body que efectivamente viajó. */
function capturarPatch(planId: string = PLAN_ID) {
  const capturado: { body: Record<string, unknown> } = { body: {} };
  server.use(
    http.patch(`/api/preventivo/planes/${planId}`, async ({ request }) => {
      capturado.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...PLAN_CON_UBICACION, id: planId });
    }),
  );
  return capturado;
}

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^editar$/i }));
  await screen.findByText("Editar plan de mantenimiento preventivo");
  return user;
}

describe("PlanPreventivoEditDialog — sincronización al abrir (ADR-4)", () => {
  beforeEach(() => {
    mockCatalogos();
    server.use(http.get("/api/equipos", () => HttpResponse.json([])));
  });

  it("abre, cierra, muta el prop plan y al reabrir el form muestra los valores VIGENTES, no el snapshot del primer render", async () => {
    const { rerender } = renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_UBICACION} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    expect(screen.getByLabelText(/^título$/i)).toHaveValue("Revisión mensual");

    // Cerrar sin guardar.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Editar plan de mantenimiento preventivo")).not.toBeInTheDocument());

    // El prop cambia (otro plan más nuevo, mismo componente montado — el diálogo NO se desmonta).
    const PLAN_ACTUALIZADO: PlanPreventivo = { ...PLAN_CON_UBICACION, titulo: "Revisión trimestral" };
    rerender(<PlanPreventivoEditDialog plan={PLAN_ACTUALIZADO} />);

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar plan de mantenimiento preventivo");

    expect(screen.getByLabelText(/^título$/i)).toHaveValue("Revisión trimestral");
  });
});

describe("PlanPreventivoEditDialog — objetivo excluyente en el PATCH (EP-R3, ADR-5)", () => {
  beforeEach(() => {
    mockCatalogos();
    server.use(http.get("/api/equipos", () => HttpResponse.json([{ id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: "SN-1", activo: true }])));
  });

  it("pasar de ubicación a equipo manda ubicacion: null en el cuerpo", async () => {
    const capturado = capturarPatch();
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_UBICACION} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    const user = await abrirDialog();

    await user.click(screen.getByRole("radio", { name: /^equipo$/i }));
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body.equipoId).toBe(EQUIPO_ID));
    expect(capturado.body.ubicacion).toBeNull();
  });

  it("hermano invertido: pasar de equipo a ubicación manda equipoId: null en el cuerpo", async () => {
    const capturado = capturarPatch();
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_EQUIPO} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    const user = await abrirDialog();

    await user.click(screen.getByRole("radio", { name: /^ubicación$/i }));
    await user.type(screen.getByRole("textbox", { name: /^ubicación$/i }), "OFICINA 2");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body.ubicacion).toBe("OFICINA 2"));
    expect(capturado.body.equipoId).toBeNull();
  });
});

describe("PlanPreventivoEditDialog — sin fechaInicio, con activo en el mismo envío (EP-R1)", () => {
  beforeEach(() => {
    mockCatalogos();
    server.use(http.get("/api/equipos", () => HttpResponse.json([])));
  });

  it("fechaInicio no aparece en el formulario (ni habilitado ni deshabilitado); hermano invertido: título sí aparece", async () => {
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_UBICACION} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    await abrirDialog();

    expect(screen.queryByLabelText(/fecha de inicio/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^título$/i)).toBeInTheDocument();
  });

  it("activo se cambia en el mismo envío, sin segunda llamada", async () => {
    let llamadas = 0;
    server.use(
      http.patch(`/api/preventivo/planes/${PLAN_ID}`, async ({ request }) => {
        llamadas += 1;
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.activo).toBe(false);
        return HttpResponse.json({ ...PLAN_CON_UBICACION, activo: false });
      }),
    );
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_UBICACION} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    const user = await abrirDialog();

    await user.click(screen.getByRole("checkbox", { name: /plan activo/i }));
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(llamadas).toBe(1);
  });
});

describe("PlanPreventivoEditDialog — equipo fuera del catálogo activo (ADR-6)", () => {
  beforeEach(() => mockCatalogos());

  it("(a) el id está en la lista activa: comportamiento normal, sin opción extra", async () => {
    server.use(
      http.get("/api/equipos", () => HttpResponse.json([{ id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: "SN-1", activo: true }])),
    );
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_EQUIPO} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    await abrirDialog();

    expect(await screen.findByRole("option", { name: "Notebook Dell" })).toBeInTheDocument();
    expect(screen.queryByText(/dado de baja/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^equipo$/i })).toHaveValue(EQUIPO_ID));
  });

  it.each([
    [
      "(b) ausente, GET /equipos/:id 200 → opción extra '(dado de baja)', preseleccionada",
      () => HttpResponse.json({ id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: "SN-1", marca: null, modelo: null, fechaAdquisicion: null, ubicacion: "DEPOSITO", importe: null, fechaValoracion: null, observaciones: null, valorResidual: null, fechaValorResidual: null, activo: false, createdAt: "", updatedAt: "", componentes: [] }, { status: 200 }),
      /notebook dell \(dado de baja\)/i,
      false,
    ],
    [
      "(c) ausente, GET /equipos/:id 404 → 'Equipo eliminado del inventario'",
      () => HttpResponse.json({ message: "Not Found" }, { status: 404 }),
      /equipo eliminado del inventario/i,
      false,
    ],
    [
      "(d) ausente, GET /equipos/:id con otro error → mensaje y select deshabilitado",
      () => HttpResponse.json({ message: "Error interno" }, { status: 500 }),
      /no se pudo verificar el equipo/i,
      true,
    ],
  ] as const)("%s", async (_nombre, responderConsulta, textoEsperado, deshabilitado) => {
    server.use(
      http.get("/api/equipos", () => HttpResponse.json([])),
      http.get(`/api/equipos/${EQUIPO_ID}`, () => responderConsulta()),
    );
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_EQUIPO} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    await abrirDialog();

    expect(await screen.findByText(textoEsperado)).toBeInTheDocument();
    if (deshabilitado) {
      expect(screen.getByRole("combobox", { name: /^equipo$/i })).toBeDisabled();
    }
  });

  it("(e) si GET /equipos falla, el select queda deshabilitado y NUNCA se infiere una baja", async () => {
    server.use(http.get("/api/equipos", () => HttpResponse.json({ message: "Error interno" }, { status: 500 })));
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_EQUIPO} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    await abrirDialog();

    expect(await screen.findByText(/no se pudieron cargar los equipos/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^equipo$/i })).toBeDisabled();
    expect(screen.queryByText(/dado de baja|eliminado del inventario/i)).not.toBeInTheDocument();
  });

  it("(e, mitad isLoading) mientras GET /equipos está pendiente, el select queda deshabilitado y NUNCA se infiere una baja", async () => {
    server.use(http.get("/api/equipos", async () => await new Promise<never>(() => {})));
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_EQUIPO} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    await abrirDialog();

    expect(screen.getByRole("combobox", { name: /^equipo$/i })).toBeDisabled();
    expect(screen.queryByText(/dado de baja|eliminado del inventario/i)).not.toBeInTheDocument();
  });
});

describe("PlanPreventivoEditDialog — aviso de cadencia (ADR-7, EP-R5)", () => {
  beforeEach(() => {
    mockCatalogos();
    server.use(http.get("/api/equipos", () => HttpResponse.json([])));
  });

  const AVISO = /la próxima ejecución se recalcula hacia adelante desde hoy/i;

  it("aparece al ensuciar intervaloValor", async () => {
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_UBICACION} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    const user = await abrirDialog();

    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    const cadencia = screen.getByLabelText(/^cadencia$/i);
    await user.clear(cadencia);
    await user.type(cadencia, "2");

    expect(await screen.findByText(AVISO)).toBeInTheDocument();
  });

  it("hermano invertido: NO aparece al tocar solo título", async () => {
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_UBICACION} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    const user = await abrirDialog();

    await user.type(screen.getByLabelText(/^título$/i), " editado");

    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });
});
