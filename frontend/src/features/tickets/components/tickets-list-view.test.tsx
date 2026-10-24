import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketsListView } from "./tickets-list-view";
import { permisosDeTest, renderConPermisos } from "@/shared/hooks/use-permisos-por-tipo.test-helpers";
import type { PermisosPorTipo } from "@/shared/auth/permisos-por-tipo";

/** Las celdas del JWT ya no deciden (odd/permisos-por-tipo-ticket, S6): el técnico las trae a propósito. */
const TECNICO = buildUser({ rol: "TECNICO", permisos: ["TICKETS:ALTAS", "TICKETS:VER_TODOS"], modulos: ["TICKETS"] });

const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/tickets",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const TICKET = {
  id: "t1",
  numero: "SOP-2026-0001",
  titulo: "Impresora rota",
  descripcion: null,
  tipoId: "ti1",
  estadoId: "e-nuevo",
  prioridadId: "p-alta",
  cicloId: null,
  ticketReferenciaId: null,
  solicitanteId: "u1",
  solicitanteExternoId: null,
  solicitanteEsExterno: false,
  asignadoId: null,
  fechaCierre: null,
  ubicacion: null,
  sectorId: null,
  sectorNombre: null,
  fechaObjetivo: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** Dos ciclos: uno activo (2026) y uno pasado (2024) — mismo shape que devuelve `GET /ciclos`. */
const CICLOS_CON_ACTIVO = {
  ciclos: [
    { id: "c-2024", nombre: "Ciclo 2024", fechaInicio: "2024-01-01", fechaFin: "2024-12-31", activo: false, cicloVigenteId: "c-2026" },
    { id: "c-2026", nombre: "Ciclo 2026", fechaInicio: "2026-01-01", fechaFin: "2026-12-31", activo: true, cicloVigenteId: "c-2026" },
  ],
  cicloActivoId: "c-2026",
};

/** Mismos ciclos, pero sin ninguno activo (R2: cae al más reciente por fechaInicio → c-2026). */
const CICLOS_SIN_ACTIVO = { ...CICLOS_CON_ACTIVO, cicloActivoId: null };

function mockBackend(overrides: { ciclos?: unknown } = {}) {
  server.use(
    http.get("/api/tickets", () =>
      HttpResponse.json({ items: [TICKET], total: 1, pagina: 1, porPagina: 10 }),
    ),
    http.get("/api/catalogos/tipos-ticket", () =>
      HttpResponse.json([{ id: "ti1", codigo: "SOPORTE", nombre: "Soporte", modulo: "SOPORTE", activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([
        { id: "p-alta", codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" },
      ]),
    ),
    http.get("/api/catalogos/estados", () =>
      HttpResponse.json([
        { id: "e-nuevo", codigo: "NUEVO", nombre: "Nuevo", color: null, orden: 1, activo: true },
      ]),
    ),
    http.get("/api/usuarios", () => HttpResponse.json([])),
    http.get("/api/ciclos", () => HttpResponse.json(overrides.ciclos ?? CICLOS_CON_ACTIVO)),
  );
}

describe("TicketsListView", () => {
  beforeEach(() => {
    pushMock.mockClear();
    replaceMock.mockClear();
    currentSearch = "";
    mockBackend();
  });

  it("resuelve estadoId/prioridadId a códigos vía catálogos y los renderiza como badges (G1)", async () => {
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });
    expect(await screen.findByText("Impresora rota")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge")).toHaveTextContent("✨ Nuevo!!");
    expect(screen.getByTestId("priority-badge")).toHaveTextContent("Alta");
    expect(await screen.findByRole("option", { name: "🔵 Nuevo" })).toBeInTheDocument();
    // Debajo del título van el número y la fecha de alta.
    expect(screen.getByText(/^SOP-2026-0001 · \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it("muestra el técnico asignado cuando el ticket lo tiene, y «Sin asignar» cuando no", async () => {
    server.use(
      http.get("/api/tickets", () =>
        HttpResponse.json({
          items: [
            { ...TICKET, id: "t1", titulo: "Con técnico", asignadoId: "u9", asignadoNombre: "Ana", asignadoApellido: "Pérez" },
            { ...TICKET, id: "t2", titulo: "Sin técnico", asignadoId: null },
            { ...TICKET, id: "t3", titulo: "Solo nombre", asignadoId: "u8", asignadoNombre: "beto", asignadoApellido: null },
          ],
          total: 3,
          pagina: 1,
          porPagina: 10,
        }),
      ),
    );
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });
    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("AP")).toBeInTheDocument();
    // Sin apellido, el avatar lleva solo la inicial del nombre.
    expect(screen.getByText("beto")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("Sin asignar")).toBeInTheDocument();
  });

  it("muestra las columnas Ubicación y Sector, con guion cuando no hay valor (odd/ubicacion-sector-ticket, CA4)", async () => {
    server.use(
      http.get("/api/tickets", () =>
        HttpResponse.json({
          items: [
            { ...TICKET, id: "t1", titulo: "Con datos", ubicacion: "Aula 12", sectorId: "s1", sectorNombre: "Primaria" },
            { ...TICKET, id: "t2", titulo: "Sin datos" },
          ],
          total: 2,
          pagina: 1,
          porPagina: 10,
        }),
      ),
    );
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });

    const conDatos = within((await screen.findByText("Con datos")).closest("tr") as HTMLElement);
    expect(screen.getByRole("columnheader", { name: "Ubicación" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sector" })).toBeInTheDocument();
    expect(conDatos.getByText("Aula 12")).toBeInTheDocument();
    expect(conDatos.getByText("Primaria")).toBeInTheDocument();

    const sinDatos = within(screen.getByText("Sin datos").closest("tr") as HTMLElement);
    // Ubicación, Sector y Fecha objetivo (odd/preventivo-anticipacion): las tres vacías.
    expect(sinDatos.getAllByText("—")).toHaveLength(3);
  });

  it("muestra la columna Fecha objetivo como día calendario, con guion en los tickets que no la tienen (odd/preventivo-anticipacion)", async () => {
    server.use(
      http.get("/api/tickets", () =>
        HttpResponse.json({
          items: [
            { ...TICKET, id: "t1", titulo: "Preventivo", fechaObjetivo: "2026-07-01T00:00:00.000Z" },
            { ...TICKET, id: "t2", titulo: "Común" },
          ],
          total: 2,
          pagina: 1,
          porPagina: 10,
        }),
      ),
    );
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });

    const preventivo = within((await screen.findByText("Preventivo")).closest("tr") as HTMLElement);
    expect(screen.getByRole("columnheader", { name: "Fecha objetivo" })).toBeInTheDocument();
    expect(preventivo.getByText("01/07/2026")).toBeInTheDocument();
    const comun = within(screen.getByText("Común").closest("tr") as HTMLElement);
    expect(comun.queryByText("01/07/2026")).not.toBeInTheDocument();
  });

  it("click en una fila navega al detalle del ticket", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });
    const row = await screen.findByText("Impresora rota");
    await user.click(row);
    expect(pushMock).toHaveBeenCalledWith("/tickets/t1");
  });

  it("elegir un filtro de estado actualiza la URL (searchParams) con el estado elegido y resetea a página 1", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });
    await screen.findByText("Impresora rota");

    await user.selectOptions(screen.getByLabelText(/estado/i), "e-nuevo");

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    const calledWith = replaceMock.mock.calls.at(-1)?.[0] as string;
    const params = new URLSearchParams(calledWith.split("?")[1]);
    expect(params.get("estado")).toBe("e-nuevo");
    expect(params.get("pagina")).toBe("1");
  });

  it.each<[string, PermisosPorTipo, boolean]>([
    ["con ALTAS en un tipo de TICKETS", permisosDeTest({ ti1: ["LECTURA", "ALTAS"] }, { ti1: "TICKETS" }), true],
    [
      "con ALTAS solo en un tipo de EDILICIA (tiene su alta propia)",
      permisosDeTest({ ti1: ["LECTURA"], ti2: ["LECTURA", "ALTAS"] }, { ti1: "TICKETS", ti2: "EDILICIA" }),
      false,
    ],
    ["con la celda TICKETS:ALTAS pero sin ALTAS en ningún tipo", permisosDeTest({ ti1: ["LECTURA"] }, { ti1: "TICKETS" }), false],
  ])("botón «Nuevo ticket» — %s", async (_label, permisos, shouldShow) => {
    renderConPermisos(<TicketsListView />, { user: TECNICO, permisos });
    await screen.findByText("Impresora rota");
    const button = screen.queryByRole("button", { name: /nuevo ticket/i });
    if (shouldShow) {
      expect(button).toBeInTheDocument();
    } else {
      expect(button).not.toBeInTheDocument();
    }
  });

  describe("filtro de ciclo", () => {
    it("con ciclo activo, el pedido a /tickets NO manda `ciclo` (comportamiento actual, sin cambios)", async () => {
      let urlPedida = "";
      server.use(
        http.get("/api/tickets", ({ request }) => {
          urlPedida = request.url;
          return HttpResponse.json({ items: [TICKET], total: 1, pagina: 1, porPagina: 10 });
        }),
      );

      renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });
      await screen.findByText("Impresora rota");

      expect(new URL(urlPedida).searchParams.get("ciclo")).toBeNull();
      const select = screen.getByLabelText(/ciclo/i) as HTMLSelectElement;
      expect(select.value).toBe("");
      expect(screen.getByText("Ciclo 2026 (activo)")).toBeInTheDocument();
    });

    it("elegir un ciclo pasado agrega `?ciclo=<id>` a la URL y resetea a página 1", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });
      await screen.findByText("Impresora rota");

      await user.selectOptions(screen.getByLabelText(/ciclo/i), "c-2024");

      await waitFor(() => expect(replaceMock).toHaveBeenCalled());
      const calledWith = replaceMock.mock.calls.at(-1)?.[0] as string;
      const params = new URLSearchParams(calledWith.split("?")[1]);
      expect(params.get("ciclo")).toBe("c-2024");
      expect(params.get("pagina")).toBe("1");
    });

    it("con `ciclo=<id>` en la URL, pide y muestra los tickets de ESE ciclo", async () => {
      server.use(
        http.get("/api/tickets", ({ request }) => {
          const ciclo = new URL(request.url).searchParams.get("ciclo");
          if (ciclo === "c-2024") {
            return HttpResponse.json({
              items: [{ ...TICKET, id: "t-2024", titulo: "Ticket del ciclo 2024" }],
              total: 1,
              pagina: 1,
              porPagina: 10,
            });
          }
          return HttpResponse.json({ items: [TICKET], total: 1, pagina: 1, porPagina: 10 });
        }),
      );
      currentSearch = "ciclo=c-2024";

      renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });

      expect(await screen.findByText("Ticket del ciclo 2024")).toBeInTheDocument();
      expect(screen.queryByText("Impresora rota")).not.toBeInTheDocument();
      const select = screen.getByLabelText(/ciclo/i) as HTMLSelectElement;
      expect(select.value).toBe("c-2024");
    });

    it("«Exportar → Excel» usa el ciclo elegido en el filtro y pide xlsx", async () => {
      URL.createObjectURL = vi.fn(() => "blob:mock");
      URL.revokeObjectURL = vi.fn();
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      let urlExportPedida = "";
      server.use(
        http.get("/api/tickets/export", ({ request }) => {
          urlExportPedida = request.url;
          return new HttpResponse("numero,titulo\n", { headers: { "content-type": "text/csv" } });
        }),
      );
      currentSearch = "ciclo=c-2024";

      const user = userEvent.setup();
      renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });
      await screen.findByText("Impresora rota");

      await user.click(screen.getByRole("button", { name: /^exportar$/i }));
      await user.click(await screen.findByRole("menuitem", { name: "Excel" }));

      await waitFor(() => expect(clickSpy).toHaveBeenCalled());
      expect(new URL(urlExportPedida).searchParams.get("ciclo")).toBe("c-2024");
      expect(new URL(urlExportPedida).searchParams.get("formato")).toBe("xlsx");
    });

    it("sin ciclo activo, precarga y pide el ciclo más reciente por fechaInicio", async () => {
      mockBackend({ ciclos: CICLOS_SIN_ACTIVO });
      let urlPedida = "";
      server.use(
        http.get("/api/tickets", ({ request }) => {
          urlPedida = request.url;
          return HttpResponse.json({ items: [TICKET], total: 1, pagina: 1, porPagina: 10 });
        }),
      );

      renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });
      await screen.findByText("Impresora rota");

      await waitFor(() => expect(new URL(urlPedida).searchParams.get("ciclo")).toBe("c-2026"));
      const select = screen.getByLabelText(/ciclo/i) as HTMLSelectElement;
      expect(select.value).toBe("c-2026");
    });
  });

  it("el filtro de asignado ofrece solo agentes (TECNICO/COLABORADOR), nunca usuarios finales", async () => {
    server.use(
      http.get("/api/usuarios", () =>
        HttpResponse.json([
          { id: "u1", nombre: "Ana", apellido: "Pérez", rol: "TECNICO" },
          { id: "u2", nombre: "Carla", apellido: "Gómez", rol: "COLABORADOR" },
          { id: "u3", nombre: "Juan", apellido: "Final", rol: "USUARIO" },
          { id: "u4", nombre: "Admin", apellido: "Jefe", rol: "ADMINISTRADOR" },
        ]),
      ),
    );
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });

    const select = await screen.findByLabelText("Asignado");
    expect(await within(select).findByRole("option", { name: "Ana Pérez" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Carla Gómez" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Juan Final" })).not.toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Admin Jefe" })).not.toBeInTheDocument();
  });

  describe("filtro «Asignado» con la regla de GET /usuarios (odd/permisos-por-tipo-ticket, T6, S7)", () => {
    it("con VER_TODOS en un tipo de TICKETS se muestra, sin la celda TICKETS:VER_TODOS", async () => {
      renderConPermisos(<TicketsListView />, {
        user: buildUser({ rol: "TECNICO", permisos: [] }),
        permisos: permisosDeTest(
          { ti1: ["LECTURA"], ti2: ["LECTURA", "VER_TODOS"] },
          { ti1: "TICKETS", ti2: "TICKETS" },
        ),
      });
      expect(await screen.findByLabelText("Asignado")).toBeInTheDocument();
    });

    // Regresión (S7): la plantilla USUARIO migrada tiene VER_TODOS en Edilicia (L11), y antes de la
    // etapa 1 no veía el filtro.
    it("con las acciones de la plantilla USUARIO migrada no se muestra: su VER_TODOS es de Edilicia", async () => {
      renderConPermisos(<TicketsListView />, {
        user: buildUser({ rol: "USUARIO", permisos: [] }),
        permisos: permisosDeTest(
          {
            ti1: ["LECTURA", "ALTAS", "COMENTAR", "IMPRESION"],
            ti2: ["LECTURA", "VER_TODOS", "ALTAS", "IMPRESION"],
          },
          { ti1: "TICKETS", ti2: "EDILICIA" },
        ),
      });
      await screen.findByText("Impresora rota");
      expect(screen.queryByLabelText("Asignado")).not.toBeInTheDocument();
    });

    it("con las acciones de la plantilla TECNICO migrada se muestra", async () => {
      renderConPermisos(<TicketsListView />, {
        user: buildUser({ rol: "TECNICO", permisos: [] }),
        permisos: permisosDeTest(
          {
            ti1: ["LECTURA", "VER_TODOS", "ALTAS", "MODIFICACION", "TRANSICIONAR", "ASIGNAR", "COMENTAR", "OBSERVAR", "IMPRESION"],
            ti2: ["LECTURA", "VER_TODOS", "ALTAS", "MODIFICACION", "TRANSICIONAR", "COMENTAR", "IMPRESION"],
          },
          { ti1: "TICKETS", ti2: "EDILICIA" },
        ),
      });
      expect(await screen.findByLabelText("Asignado")).toBeInTheDocument();
    });

    it("con ASIGNAR en un tipo de EDILICIA se muestra: ASIGNAR abre en cualquier módulo", async () => {
      renderConPermisos(<TicketsListView />, {
        user: buildUser({ rol: "TECNICO", permisos: [] }),
        permisos: permisosDeTest(
          { ti1: ["LECTURA"], ti2: ["LECTURA", "ASIGNAR"] },
          { ti1: "TICKETS", ti2: "EDILICIA" },
        ),
      });
      expect(await screen.findByLabelText("Asignado")).toBeInTheDocument();
    });

    it.each(["COMPRAS", "EQUIPOS"])(
      "con VER_TODOS en un tipo de %s se muestra: toma las celdas de TICKETS (L21)",
      async (modulo) => {
        renderConPermisos(<TicketsListView />, {
          user: buildUser({ rol: "TECNICO", permisos: [] }),
          permisos: permisosDeTest(
            { ti1: ["LECTURA"], ti2: ["LECTURA", "VER_TODOS"] },
            { ti1: "TICKETS", ti2: modulo },
          ),
        });
        expect(await screen.findByLabelText("Asignado")).toBeInTheDocument();
      },
    );

    it("sin VER_TODOS en ningún tipo no se muestra: el listado trae solo las filas propias", async () => {
      renderConPermisos(<TicketsListView />, {
        user: TECNICO,
        permisos: permisosDeTest({ ti1: ["LECTURA", "ALTAS"] }),
      });
      await screen.findByText("Impresora rota");
      expect(screen.queryByLabelText("Asignado")).not.toBeInTheDocument();
    });
  });

  describe("filtro de tipo acotado a los tipos con LECTURA (odd/permisos-por-tipo-ticket, D5 e)", () => {
    const TIPOS = [
      { id: "ti1", codigo: "SOPORTE", nombre: "Soporte", modulo: "TICKETS", activo: true, createdAt: "", updatedAt: "" },
      { id: "ti2", codigo: "EDILICIA", nombre: "Edilicia", modulo: "EDILICIA", activo: true, createdAt: "", updatedAt: "" },
      { id: "ti3", codigo: "MANTENIMIENTO", nombre: "Mantenimiento", modulo: "EDILICIA", activo: true, createdAt: "", updatedAt: "" },
    ];

    beforeEach(() => {
      server.use(http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json(TIPOS)));
    });

    it("un técnico ve únicamente los tipos con LECTURA, de cualquier módulo, y no el resto del módulo", async () => {
      renderConPermisos(<TicketsListView />, {
        user: TECNICO,
        // Lee Soporte y Mantenimiento; de Edilicia solo crea, sin ver.
        permisos: permisosDeTest({ ti1: ["LECTURA"], ti2: ["ALTAS"], ti3: ["LECTURA"] }),
      });
      const select = await screen.findByLabelText("Tipo");
      expect(await within(select).findByRole("option", { name: "Soporte" })).toBeInTheDocument();
      expect(within(select).getByRole("option", { name: "Mantenimiento" })).toBeInTheDocument();
      expect(within(select).queryByRole("option", { name: "Edilicia" })).not.toBeInTheDocument();
    });

    it("ROOT ve los tipos de todos los módulos", async () => {
      renderWithProviders(<TicketsListView />, { user: buildUser({ is_global_admin: true }) });
      const select = await screen.findByLabelText("Tipo");
      expect(await within(select).findByRole("option", { name: "Soporte" })).toBeInTheDocument();
      expect(within(select).getByRole("option", { name: "Edilicia" })).toBeInTheDocument();
      expect(within(select).getByRole("option", { name: "Mantenimiento" })).toBeInTheDocument();
    });
  });

  describe("filtros de la URL fuera del catálogo visible", () => {
    const TIPOS = [
      { id: "ti1", codigo: "SOPORTE", nombre: "Soporte", modulo: "TICKETS", activo: true, createdAt: "", updatedAt: "" },
      { id: "ti2", codigo: "EDILICIA", nombre: "Edilicia", modulo: "EDILICIA", activo: true, createdAt: "", updatedAt: "" },
    ];
    const USUARIOS = [
      { id: "u1", nombre: "Ana", apellido: "Pérez", rol: "TECNICO" },
      { id: "u3", nombre: "Juan", apellido: "Final", rol: "USUARIO" },
    ];

    beforeEach(() => {
      server.use(
        http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json(TIPOS)),
        http.get("/api/usuarios", () => HttpResponse.json(USUARIOS)),
      );
    });

    /** Último `router.replace` como searchParams, o `null` si no hubo ninguno. */
    function ultimaUrlReemplazada(): URLSearchParams | null {
      const llamada = replaceMock.mock.calls.at(-1)?.[0] as string | undefined;
      return llamada === undefined ? null : new URLSearchParams(llamada.split("?")[1] ?? "");
    }

    it("quita de la URL un `tipo` sin LECTURA para el usuario, y conserva el resto", async () => {
      currentSearch = "tipo=ti2&estado=e-nuevo";
      // Solo ve Soporte: Edilicia (ti2) no está entre los tipos con LECTURA.
      renderConPermisos(<TicketsListView />, {
        user: TECNICO,
        permisos: permisosDeTest({ ti1: ["LECTURA"] }),
      });
      await waitFor(() => expect(ultimaUrlReemplazada()).not.toBeNull());
      const params = ultimaUrlReemplazada();
      expect(params?.get("tipo")).toBeNull();
      expect(params?.get("estado")).toBe("e-nuevo");
    });

    it("quita de la URL un `asignado` que no es agente", async () => {
      currentSearch = "asignado=u3&estado=e-nuevo";
      renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });
      await waitFor(() => expect(ultimaUrlReemplazada()).not.toBeNull());
      expect(ultimaUrlReemplazada()?.get("asignado")).toBeNull();
      expect(ultimaUrlReemplazada()?.get("estado")).toBe("e-nuevo");
    });

    it("no toca la URL si el catálogo de usuarios falla, aunque el asignado sea válido", async () => {
      server.use(http.get("/api/usuarios", () => HttpResponse.json({}, { status: 500 })));
      currentSearch = "asignado=u1";
      renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["TICKETS:VER_TODOS"] }) });
      await screen.findByText("Impresora rota");
      await new Promise((resolver) => setTimeout(resolver, 50));
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it("no toca la URL cuando `tipo` y `asignado` están en el catálogo visible", async () => {
      currentSearch = "tipo=ti1&asignado=u1";
      renderWithProviders(<TicketsListView />, {
        user: buildUser({ modulos: ["TICKETS"], permisos: ["TICKETS:VER_TODOS"] }),
      });
      const select = await screen.findByLabelText("Asignado");
      await within(select).findByRole("option", { name: "Ana Pérez" });
      expect(screen.getByLabelText<HTMLSelectElement>("Tipo").value).toBe("ti1");
      expect(select).toHaveValue("u1");
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it("no toca la URL si el catálogo de tipos falla: la ausencia no prueba nada", async () => {
      server.use(http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json({}, { status: 500 })));
      currentSearch = "tipo=ti2";
      renderWithProviders(<TicketsListView />, { user: buildUser({ modulos: ["TICKETS"] }) });
      await screen.findByText("Impresora rota");
      await new Promise((resolver) => setTimeout(resolver, 50));
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  describe("filtro «Borrados» (odd/permisos-por-tipo-ticket, S8)", () => {
    const ADMIN = buildUser({ rol: "ADMINISTRADOR" });
    const BORRADO = { ...TICKET, id: "t-b", titulo: "Ticket borrado", borradoEn: "2026-10-20T13:00:00.000Z" };

    /** Registra la URL de cada `GET /tickets` y responde con `items`. */
    function registrarListado(items: unknown[]) {
      const urls: URL[] = [];
      server.use(
        http.get("/api/tickets", ({ request }) => {
          urls.push(new URL(request.url));
          return HttpResponse.json({ items, total: items.length, pagina: 1, porPagina: 10 });
        }),
      );
      return urls;
    }

    it("ADMINISTRADOR lo ve; elegirlo pone `borrados=true` en la URL y vuelve a la página 1", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TicketsListView />, { user: ADMIN });
      await screen.findByText("Impresora rota");

      await user.selectOptions(screen.getByLabelText("Borrados"), "true");

      await waitFor(() => expect(replaceMock).toHaveBeenCalled());
      const params = new URLSearchParams((replaceMock.mock.calls.at(-1)?.[0] as string).split("?")[1]);
      expect(params.get("borrados")).toBe("true");
      expect(params.get("pagina")).toBe("1");
    });

    it("con el filtro, pide solo borrados, marca cada fila, no navega al detalle ni exporta, y «Recuperar» la recupera", async () => {
      const user = userEvent.setup();
      currentSearch = "borrados=true";
      const urls = registrarListado([BORRADO]);
      const recuperados: string[] = [];
      server.use(
        http.post("/api/tickets/:id/recuperar", ({ params }) => {
          recuperados.push(String(params.id));
          return HttpResponse.json({ ...BORRADO, borradoEn: null });
        }),
      );
      renderWithProviders(<TicketsListView />, { user: ADMIN });

      const fila = (await screen.findByText("Ticket borrado")).closest("tr") as HTMLElement;
      expect(urls.at(-1)?.searchParams.get("borrados")).toBe("true");
      expect(within(fila).getByText("Borrado")).toBeInTheDocument();
      expect(screen.getByLabelText<HTMLSelectElement>("Borrados").value).toBe("true");
      expect(screen.queryByRole("button", { name: /^exportar$/i })).not.toBeInTheDocument();

      await user.click(fila);
      expect(pushMock).not.toHaveBeenCalled();

      await user.click(within(fila).getByRole("button", { name: "Recuperar SOP-2026-0001" }));
      await waitFor(() => expect(recuperados).toEqual(["t-b"]));
      expect(pushMock).not.toHaveBeenCalled();
    });

    it("sin el filtro no manda `borrados` y la fila de un ticket activo no se marca", async () => {
      const urls = registrarListado([TICKET]);
      renderWithProviders(<TicketsListView />, { user: ADMIN });

      const fila = (await screen.findByText("Impresora rota")).closest("tr") as HTMLElement;
      expect(urls.at(-1)?.searchParams.has("borrados")).toBe(false);
      expect(within(fila).queryByText("Borrado")).not.toBeInTheDocument();
      expect(within(fila).queryByRole("button", { name: /Recuperar/ })).not.toBeInTheDocument();
    });

    it("quien no es administrador no ve el filtro; un `borrados=true` en la URL no se manda y se quita", async () => {
      currentSearch = "borrados=true&estado=e-nuevo";
      const urls = registrarListado([TICKET]);
      renderConPermisos(<TicketsListView />, {
        user: TECNICO,
        permisos: permisosDeTest({ ti1: ["LECTURA", "VER_TODOS", "BORRADO"] }),
      });
      await screen.findByText("Impresora rota");

      expect(screen.queryByLabelText("Borrados")).not.toBeInTheDocument();
      expect(urls.every((url) => !url.searchParams.has("borrados"))).toBe(true);
      await waitFor(() => expect(replaceMock).toHaveBeenCalled());
      const params = new URLSearchParams((replaceMock.mock.calls.at(-1)?.[0] as string).split("?")[1]);
      expect(params.has("borrados")).toBe(false);
      expect(params.get("estado")).toBe("e-nuevo");
    });
  });
});
