import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
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
        {
          id: PRIORIDAD_ID,
          codigo: "MEDIA",
          nombre: "Media",
          color: null,
          orden: 1,
          activo: true,
          createdAt: "",
          updatedAt: "",
        },
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
    server.use(
      http.get("/api/equipos", () =>
        HttpResponse.json([{ id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: "SN-1", activo: true }]),
      ),
    );
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
    // Se tipea CRUDO (minúscula y con espacios al borde) a propósito: con
    // "OFICINA 2" el assert pasaba por construcción, sin poder distinguir si
    // `zodResolver` le entrega a `handleSubmit` el valor ya transformado por el
    // schema o el crudo del campo. Esa juntura RHF/zod es justo donde este repo
    // se rompe, y desde 595eb96 el submit ya no normaliza por su cuenta.
    await user.type(screen.getByRole("textbox", { name: /^ubicación$/i }), "  oficina 2  ");
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
      http.get("/api/equipos", () =>
        HttpResponse.json([{ id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: "SN-1", activo: true }]),
      ),
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
      () =>
        HttpResponse.json(
          {
            id: EQUIPO_ID,
            nombre: "Notebook Dell",
            numeroSerie: "SN-1",
            marca: null,
            modelo: null,
            fechaAdquisicion: null,
            ubicacion: "DEPOSITO",
            importe: null,
            fechaValoracion: null,
            observaciones: null,
            valorResidual: null,
            fechaValorResidual: null,
            activo: false,
            createdAt: "",
            updatedAt: "",
            componentes: [],
          },
          { status: 200 },
        ),
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

// El plan apunta a PRIORIDAD_ID / USUARIO_ID. Estos son OTROS, activos: sirven
// para que el catálogo resuelva con éxito pero SIN el valor vigente del plan.
const OTRA_PRIORIDAD_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTRO_USUARIO_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const prioridad = (id: string, nombre: string) => ({
  id,
  codigo: nombre.toUpperCase(),
  nombre,
  color: null,
  orden: 1,
  activo: true,
  createdAt: "",
  updatedAt: "",
});
const usuario = (id: string, nombre: string) => ({ id, nombre, apellido: "Gómez", rol: "TECNICO" });

const PRIORIDAD_DEL_PLAN = prioridad(PRIORIDAD_ID, "Media");
const USUARIO_DEL_PLAN = usuario(USUARIO_ID, "Ana");

/** Handler pendiente para siempre: simula el catálogo TODAVÍA cargando. */
const pendiente = async () => await new Promise<never>(() => {});
const roto = () => HttpResponse.json({ message: "Error interno" }, { status: 500 });
/** El caso real del hallazgo 2: PREVENTIVO:MODIFICACION sin TICKETS:ASIGNAR. */
const prohibido = () => HttpResponse.json({ message: "Forbidden" }, { status: 403 });

function renderConCatalogos(prioridades: Parameters<typeof http.get>[1], usuarios: Parameters<typeof http.get>[1]) {
  server.use(http.get("/api/catalogos/prioridades", prioridades), http.get("/api/usuarios", usuarios));
  renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_UBICACION} />, {
    user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
  });
}

describe("PlanPreventivoEditDialog — prioridad y responsable fuera del catálogo activo", () => {
  beforeEach(() => {
    server.use(http.get("/api/equipos", () => HttpResponse.json([])));
  });

  it("la prioridad del plan no está en el catálogo activo: opción extra 'Prioridad dada de baja', preseleccionada", async () => {
    renderConCatalogos(
      () => HttpResponse.json([prioridad(OTRA_PRIORIDAD_ID, "Alta")]),
      () => HttpResponse.json([USUARIO_DEL_PLAN]),
    );
    await abrirDialog();

    expect(await screen.findByRole("option", { name: "Prioridad dada de baja" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^prioridad$/i })).toHaveValue(PRIORIDAD_ID));
  });

  // CASO (b), distinto del "dado de baja": la opción EXISTE, pero llega después
  // de que el `<select>` montó. Pasa si se abre el diálogo con los catálogos
  // todavía cargando. El `<select>` no controlado de RHF fija su valor una sola
  // vez, al montar: si en ese momento no hay ninguna `<option>`, el navegador se
  // queda con la primera que llegue después. La prioridad del plan va SEGUNDA a
  // propósito, para que la falla se note.
  it("(caso b) el catálogo resuelve DESPUÉS de que el select montó: igual queda preseleccionado el valor del plan", async () => {
    server.use(
      http.get("/api/catalogos/prioridades", async () => {
        await delay(300);
        return HttpResponse.json([prioridad(OTRA_PRIORIDAD_ID, "Alta"), PRIORIDAD_DEL_PLAN]);
      }),
      http.get("/api/usuarios", () => HttpResponse.json([USUARIO_DEL_PLAN])),
    );
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_UBICACION} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    await abrirDialog();

    expect(await screen.findByRole("option", { name: "Media" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^prioridad$/i })).toHaveValue(PRIORIDAD_ID));
  });

  it("(caso b, hermano) mismo escenario para el responsable", async () => {
    server.use(
      http.get("/api/catalogos/prioridades", () => HttpResponse.json([PRIORIDAD_DEL_PLAN])),
      http.get("/api/usuarios", async () => {
        await delay(300);
        return HttpResponse.json([usuario(OTRO_USUARIO_ID, "Bruno"), USUARIO_DEL_PLAN]);
      }),
    );
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_UBICACION} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    await abrirDialog();

    expect(await screen.findByRole("option", { name: "Ana Gómez" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^responsable$/i })).toHaveValue(USUARIO_ID));
  });

  it("hermano invertido: la prioridad SÍ está en el catálogo → sin opción extra", async () => {
    renderConCatalogos(
      () => HttpResponse.json([PRIORIDAD_DEL_PLAN]),
      () => HttpResponse.json([USUARIO_DEL_PLAN]),
    );
    await abrirDialog();

    expect(await screen.findByRole("option", { name: "Media" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Prioridad dada de baja" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^prioridad$/i })).toHaveValue(PRIORIDAD_ID));
  });

  it("el responsable del plan no está entre los asignables: opción extra 'Responsable dado de baja', preseleccionada", async () => {
    renderConCatalogos(
      () => HttpResponse.json([PRIORIDAD_DEL_PLAN]),
      () => HttpResponse.json([usuario(OTRO_USUARIO_ID, "Bruno")]),
    );
    await abrirDialog();

    expect(await screen.findByRole("option", { name: "Responsable dado de baja" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^responsable$/i })).toHaveValue(USUARIO_ID));
  });

  it("hermano invertido: el responsable SÍ está entre los asignables → sin opción extra", async () => {
    renderConCatalogos(
      () => HttpResponse.json([PRIORIDAD_DEL_PLAN]),
      () => HttpResponse.json([USUARIO_DEL_PLAN]),
    );
    await abrirDialog();

    expect(await screen.findByRole("option", { name: "Ana Gómez" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Responsable dado de baja" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^responsable$/i })).toHaveValue(USUARIO_ID));
  });

  // El corazón del hallazgo: la AUSENCIA solo prueba una baja cuando la lista ya
  // resolvió. Con el catálogo caído o cargando, `?? []` colapsaba
  // "cargando"/"error"/"vacío" en el mismo array vacío y habría etiquetado como
  // "dada de baja" un valor que en realidad sigue activo.
  it.each([
    ["prioridades caído", roto, "Prioridad dada de baja"],
    ["prioridades cargando", pendiente, "Prioridad dada de baja"],
  ] as const)("catálogo de %s: NUNCA se infiere una baja", async (_n, responder, etiqueta) => {
    renderConCatalogos(responder, () => HttpResponse.json([USUARIO_DEL_PLAN]));
    await abrirDialog();

    await screen.findByRole("option", { name: "Ana Gómez" });
    expect(screen.queryByRole("option", { name: etiqueta })).not.toBeInTheDocument();
  });

  it.each([
    ["usuarios caído", roto, "Responsable dado de baja"],
    ["usuarios cargando", pendiente, "Responsable dado de baja"],
  ] as const)("catálogo de %s: NUNCA se infiere una baja", async (_n, responder, etiqueta) => {
    renderConCatalogos(() => HttpResponse.json([PRIORIDAD_DEL_PLAN]), responder);
    await abrirDialog();

    await screen.findByRole("option", { name: "Media" });
    expect(screen.queryByRole("option", { name: etiqueta })).not.toBeInTheDocument();
  });
});

describe("PlanPreventivoEditDialog — reaplicar no puede pisar el objetivo elegido", () => {
  // El equipo es el ÚNICO de los tres selects con este riesgo, porque es el
  // único que participa del XOR del objetivo (ADR-5): si el catálogo resuelve
  // tarde y se reaplica `equipoId` cuando el usuario ya se pasó a "Ubicación",
  // el plan queda con los dos lados seteados y el submit muere en la validación.
  // Prioridad y responsable no tienen lado opuesto que pisar.
  it("cambiar a ubicación mientras el catálogo de equipos carga NO revive el equipoId", async () => {
    const capturado = capturarPatch();
    // Resolución DETERMINÍSTICA: el catálogo de equipos no responde hasta que
    // este test lo libera, así que la carrera no depende de que `userEvent` sea
    // más rápido que un `delay`.
    //
    // HONESTIDAD SOBRE QUÉ FIJA ESTE TEST: fija la CONDUCTA (cambiar de objetivo
    // con el catálogo en vuelo guarda la ubicación y manda `equipoId: null`), no
    // el gate `objetivo === "equipo"` del reaplicado. Se intentó reproducir por
    // mutación un revivido de `equipoId` sacando ese gate y el test siguió
    // pasando: el submit ya filtra por objetivo y RHF no revive el campo. El gate
    // queda igual porque reaplicar un campo que no pertenece al objetivo elegido
    // no tiene sentido, pero NO hay evidencia de que arregle un defecto real.
    let liberarEquipos!: () => void;
    const equiposEnVuelo = new Promise<void>((resolver) => {
      liberarEquipos = resolver;
    });
    server.use(
      http.get("/api/catalogos/prioridades", () => HttpResponse.json([PRIORIDAD_DEL_PLAN])),
      http.get("/api/usuarios", () => HttpResponse.json([USUARIO_DEL_PLAN])),
      http.get("/api/equipos", async () => {
        await equiposEnVuelo;
        return HttpResponse.json([{ id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: "SN-1", activo: true }]);
      }),
    );
    renderWithProviders(<PlanPreventivoEditDialog plan={PLAN_CON_EQUIPO} />, {
      user: buildUser({ permisos: ["PREVENTIVO:MODIFICACION"] }),
    });
    const user = await abrirDialog();

    // El usuario se pasa a ubicación con el catálogo de equipos TODAVÍA en vuelo.
    await user.click(screen.getByRole("radio", { name: /^ubicación$/i }));
    await user.type(screen.getByRole("textbox", { name: /^ubicación$/i }), "oficina 2");

    // Recién ahora llega el catálogo. Acá es donde un reaplicado sin gate revive
    // `equipoId` y deja el plan con los dos lados del objetivo seteados.
    await act(async () => {
      liberarEquipos();
      await new Promise((resolver) => setTimeout(resolver, 50));
    });

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body.ubicacion).toBe("OFICINA 2"));
    expect(capturado.body.equipoId).toBeNull();
  });
});

describe("PlanPreventivoEditDialog — aviso inline cuando un catálogo falla", () => {
  const AVISO_PRIORIDADES = /no se pudieron cargar las prioridades/i;
  const AVISO_RESPONSABLES = /no se pudo cargar la lista de responsables/i;

  beforeEach(() => {
    server.use(http.get("/api/equipos", () => HttpResponse.json([])));
  });

  it("el catálogo de prioridades falla: aviso inline, no un dropdown vacío y mudo", async () => {
    renderConCatalogos(roto, () => HttpResponse.json([USUARIO_DEL_PLAN]));
    await abrirDialog();

    expect(await screen.findByText(AVISO_PRIORIDADES)).toBeInTheDocument();
    expect(screen.queryByText(AVISO_RESPONSABLES)).not.toBeInTheDocument();
  });

  // El caso que motivó el hallazgo: un actor con PREVENTIVO:MODIFICACION puede
  // NO tener TICKETS:ASIGNAR y comerse un 403 en `GET /usuarios`. Sin aviso se
  // quedaba con el dropdown vacío y sin ninguna pista de por qué.
  it("GET /usuarios responde 403 por falta de TICKETS:ASIGNAR: aviso inline que nombra el permiso", async () => {
    renderConCatalogos(() => HttpResponse.json([PRIORIDAD_DEL_PLAN]), prohibido);
    await abrirDialog();

    const aviso = await screen.findByText(AVISO_RESPONSABLES);
    expect(aviso).toBeInTheDocument();
    expect(aviso).toHaveTextContent(/permiso para ver usuarios/i);
    expect(screen.queryByText(AVISO_PRIORIDADES)).not.toBeInTheDocument();
  });

  it("hermano invertido: los dos catálogos responden OK → ningún aviso", async () => {
    renderConCatalogos(
      () => HttpResponse.json([PRIORIDAD_DEL_PLAN]),
      () => HttpResponse.json([USUARIO_DEL_PLAN]),
    );
    await abrirDialog();

    await screen.findByRole("option", { name: "Media" });
    expect(screen.queryByText(AVISO_PRIORIDADES)).not.toBeInTheDocument();
    expect(screen.queryByText(AVISO_RESPONSABLES)).not.toBeInTheDocument();
  });

  // Un catálogo pendiente NO es un catálogo caído: avisar mientras carga sería
  // el mismo error de fondo que inferir una baja desde una lista sin resolver.
  it("catálogos TODAVÍA cargando: ningún aviso de error", async () => {
    renderConCatalogos(pendiente, pendiente);
    await abrirDialog();

    expect(screen.queryByText(AVISO_PRIORIDADES)).not.toBeInTheDocument();
    expect(screen.queryByText(AVISO_RESPONSABLES)).not.toBeInTheDocument();
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
