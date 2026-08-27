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
  responsableId: "u1",
  intervaloValor: 1,
  intervaloUnidad: "MESES",
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
