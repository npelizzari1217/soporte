import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { PlanesPreventivoListView } from "./planes-preventivo-list-view";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PLAN_ID = "44444444-4444-4444-4444-444444444444";
const PLAN = {
  id: PLAN_ID,
  titulo: "Revisión mensual",
  instrucciones: null,
  equipoId: null,
  ubicacion: "DEPOSITO",
  prioridadId: "p1",
  tipoId: "tipo-mant",
  responsableId: "u1",
  intervaloValor: 1,
  intervaloUnidad: "MESES",
  anticipacionValor: 0,
  anticipacionUnidad: "DIAS",
  fechaInicio: "2026-01-01",
  proximaEjecucionEn: "2026-02-01",
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend(generaciones: unknown[] = []) {
  server.use(
    http.get("/api/preventivo/planes", () => HttpResponse.json([PLAN])),
    http.get("/api/equipos", () => HttpResponse.json([])),
    http.get(`/api/preventivo/planes/${PLAN_ID}/generaciones`, () => HttpResponse.json(generaciones)),
  );
}

describe("PlanesPreventivoListView — columna 'última generación'", () => {
  it("plan sin ninguna generación → muestra el hueco (huérfano) explícitamente", async () => {
    mockBackend([]);
    renderWithProviders(<PlanesPreventivoListView />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }),
    });

    await screen.findByText("Revisión mensual");
    expect(await screen.findByText(/nunca generó/i)).toBeInTheDocument();
  });

  // Caso hermano del anterior, con la condición invertida. Sin él, el assert de
  // "nunca generó" no prueba nada: un `GET .../generaciones` caído deja `data`
  // en `undefined` y produce EXACTAMENTE el mismo texto que un plan que de
  // verdad nunca generó. El usuario sale a investigar un plan que está bien.
  it("la query de generaciones falla → lo dice, en vez de reportarlo como 'nunca generó'", async () => {
    server.use(
      http.get("/api/preventivo/planes", () => HttpResponse.json([PLAN])),
      http.get("/api/equipos", () => HttpResponse.json([])),
      http.get(`/api/preventivo/planes/${PLAN_ID}/generaciones`, () => new HttpResponse(null, { status: 500 })),
    );
    renderWithProviders(<PlanesPreventivoListView />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }),
    });

    await screen.findByText("Revisión mensual");
    expect(await screen.findByText(/no se pudo cargar el historial/i)).toBeInTheDocument();
    expect(screen.queryByText(/nunca generó/i)).not.toBeInTheDocument();
  });

  it("plan con generaciones → muestra la fecha y el resultado de la más reciente", async () => {
    mockBackend([
      { id: "g1", planId: PLAN_ID, fechaProgramada: "2026-01-01", resultado: "SALTEADO_ATRASO", ticketId: null, createdAt: "" },
      { id: "g2", planId: PLAN_ID, fechaProgramada: "2026-02-01", resultado: "GENERADO", ticketId: "t1", createdAt: "" },
    ]);
    renderWithProviders(<PlanesPreventivoListView />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }),
    });

    await screen.findByText("Revisión mensual");
    await waitFor(() => expect(screen.queryByText(/nunca generó/i)).not.toBeInTheDocument());
    expect(screen.getByText(/generado/i)).toBeInTheDocument();
  });
});

describe("PlanesPreventivoListView — objetivo con catálogo de equipos caído (hallazgo H1)", () => {
  it("plan con equipoId: si GET /equipos falla, avisa en vez de mostrar 'Equipo' sin más (indistinguible de un equipo dado de baja)", async () => {
    const EQUIPO_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const PLAN_CON_EQUIPO = { ...PLAN, equipoId: EQUIPO_ID, ubicacion: null };
    server.use(
      http.get("/api/preventivo/planes", () => HttpResponse.json([PLAN_CON_EQUIPO])),
      http.get("/api/equipos", () => HttpResponse.json({ message: "Error interno" }, { status: 500 })),
      http.get(`/api/preventivo/planes/${PLAN_ID}/generaciones`, () => HttpResponse.json([])),
    );

    renderWithProviders(<PlanesPreventivoListView />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }),
    });

    await screen.findByText("Revisión mensual");
    expect(await screen.findByText(/no se pudo verificar el equipo/i)).toBeInTheDocument();
  });
});

describe("PlanesPreventivoListView — columna 'Anticipación' (odd/preventivo-anticipacion)", () => {
  it("muestra la anticipación del plan, y 'Sin anticipación' cuando es 0", async () => {
    server.use(
      http.get("/api/preventivo/planes", () =>
        HttpResponse.json([
          PLAN,
          { ...PLAN, id: "otro", titulo: "Revisión con aviso", anticipacionValor: 10, anticipacionUnidad: "DIAS" },
        ]),
      ),
      http.get("/api/equipos", () => HttpResponse.json([])),
      http.get("/api/preventivo/planes/:id/generaciones", () => HttpResponse.json([])),
    );
    renderWithProviders(<PlanesPreventivoListView />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }),
    });

    await screen.findByText("Revisión con aviso");
    expect(screen.getByRole("columnheader", { name: "Anticipación" })).toBeInTheDocument();
    expect(screen.getByText("Sin anticipación")).toBeInTheDocument();
    expect(screen.getByText("10 día(s) antes")).toBeInTheDocument();
  });
});

// odd/preventivo-por-tipo S2: el listado muestra el tipo de los tickets que genera cada plan.
describe("PlanesPreventivoListView — columna 'Tipo de ticket'", () => {
  function tipo(id: string, nombre: string) {
    return { id, codigo: id.toUpperCase(), nombre, modulo: "EDILICIA", activo: true, createdAt: "", updatedAt: "" };
  }

  it("muestra el nombre del tipo del plan", async () => {
    mockBackend([]);
    server.use(
      http.get("/api/catalogos/tipos-ticket", () =>
        HttpResponse.json([tipo("tipo-prev", "Preventivo"), tipo("tipo-mant", "Mantenimiento")]),
      ),
    );
    renderWithProviders(<PlanesPreventivoListView />, { user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }) });

    expect(await screen.findByText("Mantenimiento")).toBeInTheDocument();
    expect(screen.queryByText("Preventivo")).not.toBeInTheDocument();
  });

  it("con el catálogo resuelto y el tipo ausente, lo muestra como dado de baja", async () => {
    mockBackend([]);
    server.use(http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json([tipo("tipo-prev", "Preventivo")])));
    renderWithProviders(<PlanesPreventivoListView />, { user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }) });

    expect(await screen.findByText("Tipo de ticket dado de baja")).toBeInTheDocument();
  });

  it("hermano: con el catálogo caído no infiere una baja", async () => {
    mockBackend([]);
    server.use(http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json({ message: "falla" }, { status: 500 })));
    renderWithProviders(<PlanesPreventivoListView />, { user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }) });

    await screen.findByText("Revisión mensual");
    await waitFor(() => expect(screen.queryByText("Tipo de ticket dado de baja")).not.toBeInTheDocument());
  });
});
