import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketsListView } from "./tickets-list-view";

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
    expect(sinDatos.getAllByText("—")).toHaveLength(2);
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

  it.each([
    ["con TICKETS:ALTAS", ["TICKETS:ALTAS"], true],
    ["sin TICKETS:ALTAS", [], false],
  ])("botón «Nuevo ticket» — %s", async (_label, permisos, shouldShow) => {
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos }) });
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

  describe("filtro de tipo acotado a los módulos del usuario (S1)", () => {
    const TIPOS = [
      { id: "ti1", codigo: "SOPORTE", nombre: "Soporte", modulo: "TICKETS", activo: true, createdAt: "", updatedAt: "" },
      { id: "ti2", codigo: "EDILICIA", nombre: "Edilicia", modulo: "EDILICIA", activo: true, createdAt: "", updatedAt: "" },
      { id: "ti3", codigo: "MANTENIMIENTO", nombre: "Mantenimiento", modulo: "EDILICIA", activo: true, createdAt: "", updatedAt: "" },
    ];

    beforeEach(() => {
      server.use(http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json(TIPOS)));
    });

    it("un técnico con solo TICKETS ve únicamente los tipos de ese módulo", async () => {
      renderWithProviders(<TicketsListView />, { user: buildUser({ modulos: ["TICKETS"] }) });
      const select = await screen.findByLabelText("Tipo");
      expect(await within(select).findByRole("option", { name: "Soporte" })).toBeInTheDocument();
      expect(within(select).queryByRole("option", { name: "Edilicia" })).not.toBeInTheDocument();
      expect(within(select).queryByRole("option", { name: "Mantenimiento" })).not.toBeInTheDocument();
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

    it("quita de la URL un `tipo` de un módulo que el usuario no tiene, y conserva el resto", async () => {
      currentSearch = "tipo=ti2&estado=e-nuevo";
      renderWithProviders(<TicketsListView />, { user: buildUser({ modulos: ["TICKETS"] }) });
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
});
