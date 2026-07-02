/**
 * ReportesPage — T6.7 (admin-general PR6d, Grupo D)
 *
 * Pantalla read-only con las 4 agregaciones de reportes (tickets-por-usuario,
 * tickets-por-tipo, tickets-por-estado, tiempo-resolucion) filtradas por
 * tenant+ciclo (TenantContext.cicloId). Visible para ADMINISTRADOR y operador.
 *
 * Tests:
 * - Emite 4 fetches paralelos con cicloId de TenantContext.
 * - 4 secciones muestran skeleton durante la carga.
 * - Cambio de TenantContext.cicloId re-fetchea los 4 reportes (sin datos stale).
 * - Fallo de UN reporte (error genérico) → esa sección muestra error + Reintentar;
 *   las otras 3 renderizan sus datos con normalidad.
 * - HTTP 422 en los 4 reportes → mensaje amigable de "sin ciclo activo".
 * - Ciclo sin tickets → "Sin datos para este ciclo" por sección.
 * - Tarjetas de reporte llevan la clase `report-card` (borde reforzado en
 *   impresión — ver @media print en globals.css; jsdom no evalúa media queries,
 *   la clase es el proxy testeable de ese contrato, igual que el resto del proyecto).
 * - tickets-por-usuario: DOS vistas "Por solicitante" y "Por asignado", con
 *   nombres de usuario ya enriquecidos por el backend.
 *
 * Spec ref: admin-ui/Pantalla Reportes; reportes (todos los requirements)
 * Design ref: ADR-3, ADR-4
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { SessionProvider } from "@/shared/providers/session-provider";
import { TenantContext, type TenantContextValue } from "@/shared/providers/tenant-context";
import { ReportesPage } from "./ReportesPage";
import type { JwtPayload } from "@/shared/api/types";

const ADMIN_CLIENTE: JwtPayload = {
  sub: "a1",
  cliente_id: "cliente-1",
  cliente_nombre: "Acme",
  email: "admin@test.com",
  roles: ["ADMINISTRADOR"],
  permisos: [],
  is_global_admin: false,
};

function tenantValue(overrides: Partial<TenantContextValue> = {}): TenantContextValue {
  return {
    clienteId: "cliente-1",
    clienteNombre: "Acme",
    cicloId: "ciclo-1",
    cicloNombre: "Ciclo 1",
    setCliente: () => {},
    setCiclo: () => {},
    ...overrides,
  };
}

function renderPage(tenant: TenantContextValue, user: JwtPayload = ADMIN_CLIENTE) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider initialUser={user}>
        <TenantContext.Provider value={tenant}>
          <ReportesPage />
        </TenantContext.Provider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

const POR_USUARIO_DATA = {
  porSolicitante: [{ usuarioId: "u1", nombre: "Juan Pérez", totalTickets: 5 }],
  porAsignado: [{ usuarioId: null, nombre: "Sin asignar", totalTickets: 2 }],
};
const POR_TIPO_DATA = [
  { tipo: "SOPORTE", totalTickets: 4 },
  { tipo: "COMPRAS", totalTickets: 0 },
  { tipo: "EDILICIA", totalTickets: 1 },
];
const POR_ESTADO_DATA = [
  { estado: "PENDIENTE", totalTickets: 3 },
  { estado: "RESUELTO", totalTickets: 2 },
];
const TIEMPO_RESOLUCION_DATA = { promedioDias: 3.5, totalResueltos: 2 };

function mockAllSuccess(cicloId = "ciclo-1") {
  server.use(
    http.get("http://localhost/api/reportes/tickets-por-usuario", ({ request }) => {
      expect(new URL(request.url).searchParams.get("cicloId")).toBe(cicloId);
      return HttpResponse.json(POR_USUARIO_DATA);
    }),
    http.get("http://localhost/api/reportes/tickets-por-tipo", ({ request }) => {
      expect(new URL(request.url).searchParams.get("cicloId")).toBe(cicloId);
      return HttpResponse.json(POR_TIPO_DATA);
    }),
    http.get("http://localhost/api/reportes/tickets-por-estado", ({ request }) => {
      expect(new URL(request.url).searchParams.get("cicloId")).toBe(cicloId);
      return HttpResponse.json(POR_ESTADO_DATA);
    }),
    http.get("http://localhost/api/reportes/tiempo-resolucion", ({ request }) => {
      expect(new URL(request.url).searchParams.get("cicloId")).toBe(cicloId);
      return HttpResponse.json(TIEMPO_RESOLUCION_DATA);
    }),
  );
}

describe("ReportesPage", () => {
  it("emite los 4 fetches en paralelo con cicloId de TenantContext", async () => {
    mockAllSuccess("ciclo-1");
    renderPage(tenantValue());

    await waitFor(() => expect(screen.getByText("Juan Pérez")).toBeInTheDocument());
    expect(screen.getByText("SOPORTE")).toBeInTheDocument();
    expect(screen.getByText("PENDIENTE")).toBeInTheDocument();
    expect(screen.getByText(/3[.,]5/)).toBeInTheDocument();
  });

  it("muestra skeleton en las 4 secciones durante la carga", async () => {
    server.use(
      http.get("http://localhost/api/reportes/tickets-por-usuario", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(POR_USUARIO_DATA);
      }),
      http.get("http://localhost/api/reportes/tickets-por-tipo", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(POR_TIPO_DATA);
      }),
      http.get("http://localhost/api/reportes/tickets-por-estado", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(POR_ESTADO_DATA);
      }),
      http.get("http://localhost/api/reportes/tiempo-resolucion", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(TIEMPO_RESOLUCION_DATA);
      }),
    );

    renderPage(tenantValue());

    expect(within(screen.getByTestId("reporte-por-usuario")).getByTestId("skeleton")).toBeInTheDocument();
    expect(within(screen.getByTestId("reporte-por-tipo")).getByTestId("skeleton")).toBeInTheDocument();
    expect(within(screen.getByTestId("reporte-por-estado")).getByTestId("skeleton")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("reporte-tiempo-resolucion")).getByTestId("skeleton"),
    ).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Juan Pérez")).toBeInTheDocument());
  });

  it("cambio de ciclo re-fetchea los 4 reportes sin mostrar datos del ciclo anterior", async () => {
    mockAllSuccess("ciclo-1");
    const { rerender } = renderPage(tenantValue({ cicloId: "ciclo-1" }));

    await waitFor(() => expect(screen.getByText("Juan Pérez")).toBeInTheDocument());

    server.use(
      http.get("http://localhost/api/reportes/tickets-por-usuario", ({ request }) => {
        expect(new URL(request.url).searchParams.get("cicloId")).toBe("ciclo-2");
        return HttpResponse.json({
          porSolicitante: [{ usuarioId: "u2", nombre: "Ana López", totalTickets: 9 }],
          porAsignado: [],
        });
      }),
      http.get("http://localhost/api/reportes/tickets-por-tipo", () => HttpResponse.json(POR_TIPO_DATA)),
      http.get("http://localhost/api/reportes/tickets-por-estado", () => HttpResponse.json(POR_ESTADO_DATA)),
      http.get("http://localhost/api/reportes/tiempo-resolucion", () =>
        HttpResponse.json(TIEMPO_RESOLUCION_DATA),
      ),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={qc}>
        <SessionProvider initialUser={ADMIN_CLIENTE}>
          <TenantContext.Provider value={tenantValue({ cicloId: "ciclo-2" })}>
            <ReportesPage />
          </TenantContext.Provider>
        </SessionProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("Ana López")).toBeInTheDocument());
    expect(screen.queryByText("Juan Pérez")).not.toBeInTheDocument();
  });

  it("fallo de un reporte muestra error inline + Reintentar sin afectar a los otros 3", async () => {
    server.use(
      http.get("http://localhost/api/reportes/tickets-por-usuario", () =>
        HttpResponse.json({ statusCode: 500, message: "Internal Server Error" }, { status: 500 }),
      ),
      http.get("http://localhost/api/reportes/tickets-por-tipo", () => HttpResponse.json(POR_TIPO_DATA)),
      http.get("http://localhost/api/reportes/tickets-por-estado", () => HttpResponse.json(POR_ESTADO_DATA)),
      http.get("http://localhost/api/reportes/tiempo-resolucion", () =>
        HttpResponse.json(TIEMPO_RESOLUCION_DATA),
      ),
    );

    renderPage(tenantValue());

    const seccionUsuario = screen.getByTestId("reporte-por-usuario");
    await waitFor(() =>
      expect(within(seccionUsuario).getByText(/no se pudo cargar/i)).toBeInTheDocument(),
    );
    expect(within(seccionUsuario).getByRole("button", { name: /reintentar/i })).toBeInTheDocument();

    // Las otras 3 secciones renderizan con normalidad
    expect(screen.getByText("SOPORTE")).toBeInTheDocument();
    expect(screen.getByText("PENDIENTE")).toBeInTheDocument();
    expect(screen.getByText(/3[.,]5/)).toBeInTheDocument();
  });

  it("HTTP 422 en los 4 reportes muestra el mensaje de sin ciclo activo", async () => {
    const body = { statusCode: 422, message: "No hay ciclo activo" };
    server.use(
      http.get("http://localhost/api/reportes/tickets-por-usuario", () =>
        HttpResponse.json(body, { status: 422 }),
      ),
      http.get("http://localhost/api/reportes/tickets-por-tipo", () =>
        HttpResponse.json(body, { status: 422 }),
      ),
      http.get("http://localhost/api/reportes/tickets-por-estado", () =>
        HttpResponse.json(body, { status: 422 }),
      ),
      http.get("http://localhost/api/reportes/tiempo-resolucion", () =>
        HttpResponse.json(body, { status: 422 }),
      ),
    );

    renderPage(tenantValue({ cicloId: null }));

    await waitFor(() =>
      expect(screen.getByText(/no hay ciclo activo/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/seleccion.* un ciclo para ver los reportes/i)).toBeInTheDocument();
  });

  it("ciclo sin tickets muestra 'Sin datos para este ciclo' por sección", async () => {
    server.use(
      http.get("http://localhost/api/reportes/tickets-por-usuario", () =>
        HttpResponse.json({ porSolicitante: [], porAsignado: [] }),
      ),
      http.get("http://localhost/api/reportes/tickets-por-tipo", () =>
        HttpResponse.json([
          { tipo: "SOPORTE", totalTickets: 0 },
          { tipo: "COMPRAS", totalTickets: 0 },
        ]),
      ),
      http.get("http://localhost/api/reportes/tickets-por-estado", () =>
        HttpResponse.json([{ estado: "PENDIENTE", totalTickets: 0 }]),
      ),
      http.get("http://localhost/api/reportes/tiempo-resolucion", () =>
        HttpResponse.json({ promedioDias: null, totalResueltos: 0 }),
      ),
    );

    renderPage(tenantValue());

    await waitFor(() => {
      const mensajes = screen.getAllByText(/sin datos para este ciclo/i);
      expect(mensajes).toHaveLength(4);
    });
  });

  it("las 4 tarjetas de reporte llevan la clase report-card (borde reforzado en impresión)", async () => {
    mockAllSuccess("ciclo-1");
    renderPage(tenantValue());

    await waitFor(() => expect(screen.getByText("Juan Pérez")).toBeInTheDocument());

    expect(screen.getByTestId("reporte-por-usuario")).toHaveClass("report-card");
    expect(screen.getByTestId("reporte-por-tipo")).toHaveClass("report-card");
    expect(screen.getByTestId("reporte-por-estado")).toHaveClass("report-card");
    expect(screen.getByTestId("reporte-tiempo-resolucion")).toHaveClass("report-card");
  });

  it("tickets-por-usuario muestra DOS vistas: Por solicitante y Por asignado, con nombres", async () => {
    mockAllSuccess("ciclo-1");
    renderPage(tenantValue());

    const seccion = screen.getByTestId("reporte-por-usuario");
    await waitFor(() => expect(within(seccion).getByText("Juan Pérez")).toBeInTheDocument());

    expect(within(seccion).getByText(/por solicitante/i)).toBeInTheDocument();
    expect(within(seccion).getByText(/por asignado/i)).toBeInTheDocument();
    expect(within(seccion).getByText("Sin asignar")).toBeInTheDocument();
  });

  it("botón Reintentar dispara un nuevo fetch del reporte fallido", async () => {
    let attempts = 0;
    server.use(
      http.get("http://localhost/api/reportes/tickets-por-usuario", () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json({ statusCode: 500, message: "Internal Server Error" }, { status: 500 });
        }
        return HttpResponse.json(POR_USUARIO_DATA);
      }),
      http.get("http://localhost/api/reportes/tickets-por-tipo", () => HttpResponse.json(POR_TIPO_DATA)),
      http.get("http://localhost/api/reportes/tickets-por-estado", () => HttpResponse.json(POR_ESTADO_DATA)),
      http.get("http://localhost/api/reportes/tiempo-resolucion", () =>
        HttpResponse.json(TIEMPO_RESOLUCION_DATA),
      ),
    );

    const user = userEvent.setup();
    renderPage(tenantValue());

    const seccionUsuario = screen.getByTestId("reporte-por-usuario");
    const retryBtn = await within(seccionUsuario).findByRole("button", { name: /reintentar/i });

    await user.click(retryBtn);

    await waitFor(() => expect(within(seccionUsuario).getByText("Juan Pérez")).toBeInTheDocument());
    expect(attempts).toBe(2);
  });
});
