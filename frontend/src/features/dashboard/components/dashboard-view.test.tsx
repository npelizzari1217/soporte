import { describe, it, expect, beforeEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { DashboardView } from "./dashboard-view";

const METRICAS = {
  abiertos: 5,
  cerrados: 3,
  tiempoPromedioResolucionHoras: 24,
  cargaPorAgente: [{ asignadoId: "u1", abiertos: 2 }],
  cumplimientoSla: { cerradosConSla: 3, cerradosATiempo: 2, porcentaje: 2 / 3 },
  distribucionPorTipo: [{ tipoId: "ti1", total: 5 }],
  distribucionPorPrioridad: [{ prioridadId: "p-alta", total: 3 }],
};

const METRICAS_VACIAS = {
  abiertos: 0,
  cerrados: 0,
  tiempoPromedioResolucionHoras: null,
  cargaPorAgente: [],
  cumplimientoSla: { cerradosConSla: 0, cerradosATiempo: 0, porcentaje: null },
  distribucionPorTipo: [],
  distribucionPorPrioridad: [],
};

function mockBackend(overrides: { metricas?: unknown } = {}) {
  server.use(
    http.get("/api/dashboard/metricas", () => HttpResponse.json(overrides.metricas ?? METRICAS)),
    http.get("/api/catalogos/tipos-ticket", () =>
      HttpResponse.json([{ id: "ti1", codigo: "SOPORTE", nombre: "Soporte", activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([
        { id: "p-alta", codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" },
      ]),
    ),
    http.get("/api/usuarios", () => HttpResponse.json([{ id: "u1", nombre: "Ana", apellido: "Gómez", rol: "TECNICO" }])),
    http.get("/api/ciclos", () =>
      HttpResponse.json({
        ciclos: [
          { id: "c1", nombre: "Ciclo 2026-1", fechaInicio: "2026-01-01", fechaFin: "2026-06-30", activo: true, cicloVigenteId: "cv1" },
        ],
        cicloActivoId: "c1",
      }),
    ),
  );
}

describe("DashboardView", () => {
  beforeEach(() => mockBackend());

  it("cada chart recibe los datos correctos del endpoint (verificado vía tabla accesible)", async () => {
    renderWithProviders(<DashboardView />, { user: buildUser({ permisos: ["ticket:ver_todos"] }) });

    const barFigure = await screen.findByRole("img", { name: "Tickets abiertos / cerrados" });
    expect(within(barFigure).getByText("Abiertos")).toBeInTheDocument();
    expect(within(barFigure).getByText("5")).toBeInTheDocument();
    expect(within(barFigure).getByText("Cerrados")).toBeInTheDocument();
    expect(within(barFigure).getByText("3")).toBeInTheDocument();

    const lineFigure = screen.getByRole("img", { name: "Tiempo promedio de resolución (h)" });
    expect(within(lineFigure).getByText("24")).toBeInTheDocument();

    const hbarFigure = screen.getByRole("img", { name: "Carga por agente" });
    const hbarTable = within(hbarFigure).getByRole("table", { hidden: true });
    expect(hbarTable).toHaveTextContent("Ana Gómez");
    expect(hbarTable).toHaveTextContent("2");

    const tipoFigure = screen.getByRole("img", { name: "Distribución por tipo" });
    expect(within(tipoFigure).getByText("Soporte")).toBeInTheDocument();

    const prioridadFigure = screen.getByRole("img", { name: "Distribución por prioridad" });
    expect(within(prioridadFigure).getByText("Alta")).toBeInTheDocument();

    const gaugeFigure = screen.getByRole("img", { name: "% Cumplimiento SLA: 67%" });
    expect(gaugeFigure).toBeInTheDocument();
  });

  it("elegir un ciclo en el filtro dispara un refetch con ese ciclo (?ciclo=<id>)", async () => {
    let capturedUrl: URL | null = null;
    server.use(
      http.get("/api/dashboard/metricas", ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json(METRICAS);
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<DashboardView />, { user: buildUser({ permisos: ["ticket:ver_todos"] }) });
    await screen.findByRole("img", { name: "Tickets abiertos / cerrados" });

    await user.selectOptions(screen.getByLabelText(/ciclo/i), "c1");

    await waitFor(() => expect(capturedUrl?.searchParams.get("ciclo")).toBe("c1"));
  });

  it("sin permiso ticket:ver_todos (403 del backend) → ErrorState, no charts", async () => {
    server.use(
      http.get("/api/dashboard/metricas", () =>
        HttpResponse.json({ statusCode: 403, message: "Forbidden" }, { status: 403 }),
      ),
    );

    renderWithProviders(<DashboardView />, { user: buildUser({ permisos: [] }) });

    expect(await screen.findByRole("alert")).toHaveTextContent(/no tenés permiso/i);
    expect(screen.queryByRole("img", { name: "Tickets abiertos / cerrados" })).not.toBeInTheDocument();
  });

  it("sin tickets en el ciclo → EmptyState, no charts", async () => {
    mockBackend({ metricas: METRICAS_VACIAS });
    renderWithProviders(<DashboardView />, { user: buildUser({ permisos: ["ticket:ver_todos"] }) });

    expect(await screen.findByText(/sin datos/i)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Tickets abiertos / cerrados" })).not.toBeInTheDocument();
  });
});
