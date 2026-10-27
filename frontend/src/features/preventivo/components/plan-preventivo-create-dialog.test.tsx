import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { permisosDeTest, renderConPermisos } from "@/shared/hooks/use-permisos-por-tipo.test-helpers";
import { PlanPreventivoCreateDialog } from "./plan-preventivo-create-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PRIORIDAD_ID = "11111111-1111-1111-1111-111111111111";
const EQUIPO_ID = "22222222-2222-2222-2222-222222222222";
const USUARIO_ID = "33333333-3333-3333-3333-333333333333";
const TIPO_PREVENTIVO_ID = "44444444-4444-4444-4444-444444444444";
const TIPO_SOPORTE_ID = "55555555-5555-5555-5555-555555555555";
const TIPO_EDILICIA_ID = "66666666-6666-6666-6666-666666666666";
/** Técnico de Soporte y no de Preventivo. */
const TECNICO_SOPORTE_ID = "77777777-7777-7777-7777-777777777777";

function tipo(id: string, codigo: string, nombre: string) {
  return { id, codigo, nombre, modulo: "TICKETS", activo: true, createdAt: "", updatedAt: "" };
}

/** Catálogo de tipos vigentes (odd/preventivo-por-tipo): Preventivo, Soporte y Edilicia. */
function handlerTipos() {
  return http.get("/api/catalogos/tipos-ticket", () =>
    HttpResponse.json([
      tipo(TIPO_EDILICIA_ID, "EDILICIA", "Edilicia"),
      tipo(TIPO_PREVENTIVO_ID, "PREVENTIVO", "Preventivo"),
      tipo(TIPO_SOPORTE_ID, "SOPORTE", "Soporte"),
    ]),
  );
}

/**
 * Responsables por tipo, como el backend (S5): Ana es técnica de Preventivo y de Soporte; Bruno,
 * solo de Soporte. Registra los `tipoId` pedidos.
 */
function handlerResponsablesPorTipo(pedidos: string[] = []) {
  return http.get("/api/preventivo/planes/responsables", ({ request }) => {
    const tipoId = new URL(request.url).searchParams.get("tipoId") ?? "";
    pedidos.push(tipoId);
    if (tipoId === TIPO_PREVENTIVO_ID) return HttpResponse.json([{ id: USUARIO_ID, nombre: "Ana", apellido: "Gómez" }]);
    if (tipoId === TIPO_SOPORTE_ID) {
      return HttpResponse.json([
        { id: USUARIO_ID, nombre: "Ana", apellido: "Gómez" },
        { id: TECNICO_SOPORTE_ID, nombre: "Bruno", apellido: "Díaz" },
      ]);
    }
    return HttpResponse.json([]);
  });
}

function mockBackend() {
  server.use(
    handlerTipos(),
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([
        { id: PRIORIDAD_ID, codigo: "MEDIA", nombre: "Media", color: null, orden: 1, activo: true, createdAt: "", updatedAt: "" },
      ]),
    ),
    http.get("/api/equipos", () =>
      HttpResponse.json([{ id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: "SN-001", activo: true }]),
    ),
    handlerResponsablesPorTipo(),
  );
}

async function abrirDialog(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /nuevo plan/i }));
  await screen.findByLabelText(/^título$/i);
  return user;
}

async function completarComunes(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^título$/i), "Revisión mensual");
  await user.selectOptions(await screen.findByRole("combobox", { name: /^prioridad$/i }), PRIORIDAD_ID);
  // La lista de responsables depende del tipo, que se preelige cuando el catálogo resuelve.
  const responsable = screen.getByRole("combobox", { name: /^responsable$/i });
  await within(responsable).findByRole("option", { name: "Ana Gómez" });
  await user.selectOptions(responsable, USUARIO_ID);
  await user.type(screen.getByLabelText(/^cadencia$/i), "1");
  await user.selectOptions(screen.getByRole("combobox", { name: /^unidad$/i }), "MESES");
  await user.type(screen.getByLabelText(/fecha de inicio/i), "2026-01-01");
}

describe("PlanPreventivoCreateDialog — objetivo excluyente (equipo XOR ubicación)", () => {
  beforeEach(() => {
    mockBackend();
    vi.mocked(toast.success).mockClear();
  });

  it("no envía el POST con equipo Y ubicación completados a la vez", async () => {
    let posteo = false;
    server.use(http.post("/api/preventivo/planes", () => {
      posteo = true;
      return HttpResponse.json({}, { status: 201 });
    }));

    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);
    await user.type(screen.getByRole("textbox", { name: /^ubicación$/i }), "DEPOSITO");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(posteo).toBe(false);
  });

  it("no envía el POST sin elegir ningún objetivo", async () => {
    let posteo = false;
    server.use(http.post("/api/preventivo/planes", () => {
      posteo = true;
      return HttpResponse.json({}, { status: 201 });
    }));

    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(posteo).toBe(false);
  });

  it("con solo equipo, crea el plan y envía el payload correcto", async () => {
    const capturado: { body: Record<string, unknown> } = { body: {} };
    server.use(
      http.post("/api/preventivo/planes", async ({ request }) => {
        capturado.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p1" }, { status: 201 });
      }),
    );

    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturado.body.equipoId).toBe(EQUIPO_ID));
    expect(capturado.body.tipoId).toBe(TIPO_PREVENTIVO_ID);
    expect(capturado.body.ubicacion).toBeFalsy();
    expect(capturado.body.intervaloValor).toBe(1);
    expect(capturado.body.intervaloUnidad).toBe("MESES");
    expect(toast.success).toHaveBeenCalled();
  });
});

describe("PlanPreventivoCreateDialog — anticipación (odd/preventivo-anticipacion)", () => {
  beforeEach(() => {
    mockBackend();
    vi.mocked(toast.success).mockClear();
  });

  function capturarPost() {
    const capturado: { body: Record<string, unknown> | null } = { body: null };
    server.use(
      http.post("/api/preventivo/planes", async ({ request }) => {
        capturado.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p1" }, { status: 201 });
      }),
    );
    return capturado;
  }

  it("arranca en 0 días y, sin tocarla, envía anticipación 0 DIAS", async () => {
    const capturado = capturarPost();
    renderWithProviders(<PlanPreventivoCreateDialog />, { user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }) });
    const user = await abrirDialog();

    expect(screen.getByLabelText(/^anticipación$/i)).toHaveValue(0);
    expect(screen.getByRole("combobox", { name: /^unidad de anticipación$/i })).toHaveValue("DIAS");

    await completarComunes(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturado.body).not.toBeNull());
    expect(capturado.body?.anticipacionValor).toBe(0);
    expect(capturado.body?.anticipacionUnidad).toBe("DIAS");
  });

  it("envía la anticipación tipeada con su unidad", async () => {
    const capturado = capturarPost();
    renderWithProviders(<PlanPreventivoCreateDialog />, { user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }) });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);
    await user.clear(screen.getByLabelText(/^anticipación$/i));
    await user.type(screen.getByLabelText(/^anticipación$/i), "10");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturado.body).not.toBeNull());
    expect(capturado.body?.anticipacionValor).toBe(10);
    expect(capturado.body?.anticipacionUnidad).toBe("DIAS");
  });

  it("vaciar la anticipación no la convierte en 0: avisa y no envía", async () => {
    const capturado = capturarPost();
    renderWithProviders(<PlanPreventivoCreateDialog />, { user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }) });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);
    await user.clear(screen.getByLabelText(/^anticipación$/i));
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByText("La anticipación es requerida")).toBeInTheDocument();
    expect(capturado.body).toBeNull();
  });

  it("una anticipación no menor que la cadencia avisa con la regla y no envía", async () => {
    const capturado = capturarPost();
    renderWithProviders(<PlanPreventivoCreateDialog />, { user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }) });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);
    await user.clear(screen.getByLabelText(/^anticipación$/i));
    await user.type(screen.getByLabelText(/^anticipación$/i), "1");
    await user.selectOptions(screen.getByRole("combobox", { name: /^unidad de anticipación$/i }), "MESES");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(
      await screen.findByText("La anticipación debe ser menor que la cadencia (un mes cuenta como 30 días)"),
    ).toBeInTheDocument();
    expect(capturado.body).toBeNull();
  });
});

describe("PlanPreventivoCreateDialog — el responsable sale de los técnicos del tipo elegido", () => {
  it("ofrece solo GET /preventivo/planes/responsables, no la lista de usuarios del tenant", async () => {
    mockBackend();
    server.use(
      http.get("/api/preventivo/planes/responsables", () =>
        HttpResponse.json([
          { id: USUARIO_ID, nombre: "Ana", apellido: "Gómez" },
          { id: "u-colab", nombre: "Carla", apellido: "Ruiz" },
        ]),
      ),
      http.get("/api/usuarios", () =>
        HttpResponse.json([
          { id: USUARIO_ID, nombre: "Ana", apellido: "Gómez", rol: "TECNICO" },
          { id: "u-final", nombre: "Juan", apellido: "Final", rol: "USUARIO" },
        ]),
      ),
    );
    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    await abrirDialog();

    const select = screen.getByRole("combobox", { name: /^responsable$/i });
    expect(await within(select).findByRole("option", { name: "Ana Gómez" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Carla Ruiz" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Juan Final" })).not.toBeInTheDocument();
    expect(screen.queryByText(/no hay técnicos habilitados/i)).not.toBeInTheDocument();
  });

  it("sin ningún técnico del tipo elegido, avisa qué permiso falta en vez de mostrar un select mudo", async () => {
    mockBackend();
    server.use(http.get("/api/preventivo/planes/responsables", () => HttpResponse.json([])));
    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    await abrirDialog();

    expect(
      await screen.findByText(/no hay técnicos habilitados para este tipo de ticket.*permiso ver sobre el tipo elegido/i),
    ).toBeInTheDocument();
  });
});

describe("PlanPreventivoCreateDialog — errores de catálogos no se tragan en silencio (hallazgo H3)", () => {
  it("si GET /preventivo/planes/responsables falla (p. ej. 403), avisa en el select de responsable", async () => {
    server.use(
      handlerTipos(),
      http.get("/api/catalogos/prioridades", () =>
        HttpResponse.json([
          { id: PRIORIDAD_ID, codigo: "MEDIA", nombre: "Media", color: null, orden: 1, activo: true, createdAt: "", updatedAt: "" },
        ]),
      ),
      http.get("/api/equipos", () =>
        HttpResponse.json([{ id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: "SN-001", activo: true }]),
      ),
      http.get("/api/preventivo/planes/responsables", () =>
        HttpResponse.json({ message: "Forbidden" }, { status: 403 }),
      ),
    );

    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    await abrirDialog();

    expect(
      await screen.findByText(/no se pudo cargar la lista de responsables/i),
    ).toBeInTheDocument();
  });

  it("si GET /equipos falla, avisa en el select de equipo", async () => {
    server.use(
      http.get("/api/catalogos/prioridades", () =>
        HttpResponse.json([
          { id: PRIORIDAD_ID, codigo: "MEDIA", nombre: "Media", color: null, orden: 1, activo: true, createdAt: "", updatedAt: "" },
        ]),
      ),
      http.get("/api/equipos", () => HttpResponse.json({ message: "Error interno" }, { status: 500 })),
      http.get("/api/preventivo/planes/responsables", () =>
        HttpResponse.json([{ id: USUARIO_ID, nombre: "Ana", apellido: "Gómez" }]),
      ),
    );

    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    await abrirDialog();

    expect(await screen.findByText(/no se pudieron cargar los equipos/i)).toBeInTheDocument();
  });
});

describe("PlanPreventivoCreateDialog — tipo de ticket del plan (odd/preventivo-por-tipo)", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
  });

  function capturarPost() {
    const capturado: { body: Record<string, unknown> | null } = { body: null };
    server.use(
      http.post("/api/preventivo/planes", async ({ request }) => {
        capturado.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p1" }, { status: 201 });
      }),
    );
    return capturado;
  }

  /** Técnico con LECTURA sobre Preventivo y Soporte, no sobre Edilicia (S4). */
  const TECNICO = buildUser({ rol: "TECNICO", permisos: ["PREVENTIVO:ALTAS"] });
  const PERMISOS = permisosDeTest({
    [TIPO_PREVENTIVO_ID]: ["LECTURA"],
    [TIPO_SOPORTE_ID]: ["LECTURA"],
    [TIPO_EDILICIA_ID]: ["ALTAS"],
  });

  it("S2: preelige Preventivo y ofrece solo los tipos que el usuario ve (LECTURA)", async () => {
    mockBackend();
    renderConPermisos(<PlanPreventivoCreateDialog />, { user: TECNICO, permisos: PERMISOS });
    await abrirDialog();

    const tipoSelect = screen.getByRole("combobox", { name: /^tipo de ticket$/i });
    await waitFor(() => expect(tipoSelect).toHaveValue(TIPO_PREVENTIVO_ID));
    const opciones = within(tipoSelect)
      .getAllByRole("option")
      .map((opcion) => opcion.textContent);
    // Edilicia tiene ALTAS pero no LECTURA: el backend rechazaría el alta.
    expect(opciones).toEqual(["Elija un tipo de ticket", "Preventivo", "Soporte"]);
  });

  it("S5: cambiar el tipo recarga los responsables del tipo nuevo y envía ese tipo", async () => {
    const pedidos: string[] = [];
    mockBackend();
    server.use(handlerResponsablesPorTipo(pedidos));
    const capturado = capturarPost();
    renderConPermisos(<PlanPreventivoCreateDialog />, { user: TECNICO, permisos: PERMISOS });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);

    await user.selectOptions(screen.getByRole("combobox", { name: /^tipo de ticket$/i }), TIPO_SOPORTE_ID);
    const responsable = screen.getByRole("combobox", { name: /^responsable$/i });
    await within(responsable).findByRole("option", { name: "Bruno Díaz" });
    // Ana también es técnica de Soporte: sigue elegida, sin aviso.
    expect(responsable).toHaveValue(USUARIO_ID);
    expect(screen.queryByText(/no está habilitado para el tipo de ticket/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturado.body).not.toBeNull());
    expect(capturado.body?.tipoId).toBe(TIPO_SOPORTE_ID);
    expect(capturado.body?.responsableId).toBe(USUARIO_ID);
    expect(pedidos).toEqual(expect.arrayContaining([TIPO_PREVENTIVO_ID, TIPO_SOPORTE_ID]));
  });

  it("S5: si el responsable elegido no es técnico del tipo nuevo, lo borra con un aviso y no envía", async () => {
    mockBackend();
    const capturado = capturarPost();
    renderConPermisos(<PlanPreventivoCreateDialog />, { user: TECNICO, permisos: PERMISOS });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);
    await user.selectOptions(screen.getByRole("combobox", { name: /^tipo de ticket$/i }), TIPO_SOPORTE_ID);
    const responsable = screen.getByRole("combobox", { name: /^responsable$/i });
    await within(responsable).findByRole("option", { name: "Bruno Díaz" });
    await user.selectOptions(responsable, TECNICO_SOPORTE_ID);

    // Bruno no es técnico de Preventivo.
    await user.selectOptions(screen.getByRole("combobox", { name: /^tipo de ticket$/i }), TIPO_PREVENTIVO_ID);

    expect(
      await screen.findByText(
        "El responsable elegido no está habilitado para el tipo de ticket seleccionado. Elija otro.",
      ),
    ).toBeInTheDocument();
    expect(responsable).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));
    expect(await screen.findByText("Elija un responsable", { selector: "p" })).toBeInTheDocument();
    expect(capturado.body).toBeNull();
  });

  it("sin LECTURA sobre Preventivo no preelige nada, y sin tipo no envía", async () => {
    mockBackend();
    const capturado = capturarPost();
    renderConPermisos(<PlanPreventivoCreateDialog />, {
      user: TECNICO,
      permisos: permisosDeTest({ [TIPO_SOPORTE_ID]: ["LECTURA"] }),
    });
    const user = await abrirDialog();
    const tipoSelect = screen.getByRole("combobox", { name: /^tipo de ticket$/i });
    await within(tipoSelect).findByRole("option", { name: "Soporte" });

    expect(tipoSelect).toHaveValue("");
    await user.type(screen.getByLabelText(/^título$/i), "Revisión mensual");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));
    expect(await screen.findByText("Elija un tipo de ticket", { selector: "p" })).toBeInTheDocument();
    expect(capturado.body).toBeNull();
  });

  it("sin ningún tipo visible no ofrece «Nuevo plan»", async () => {
    mockBackend();
    renderConPermisos(<PlanPreventivoCreateDialog />, {
      user: TECNICO,
      permisos: permisosDeTest({ [TIPO_EDILICIA_ID]: ["ALTAS"] }),
    });

    await waitFor(() => expect(screen.queryByRole("button", { name: /nuevo plan/i })).not.toBeInTheDocument());
  });
});
