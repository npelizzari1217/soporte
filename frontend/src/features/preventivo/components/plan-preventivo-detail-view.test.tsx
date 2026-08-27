import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { PlanPreventivoDetailView } from "./plan-preventivo-detail-view";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PLAN_ID = "55555555-5555-5555-5555-555555555555";
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
  proximaEjecucionEn: "2026-04-01",
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const GENERACIONES = [
  { id: "g1", planId: PLAN_ID, fechaProgramada: "2026-01-01", resultado: "GENERADO", ticketId: "t1", createdAt: "" },
  { id: "g2", planId: PLAN_ID, fechaProgramada: "2026-02-01", resultado: "SALTEADO_PENDIENTE", ticketId: null, createdAt: "" },
  { id: "g3", planId: PLAN_ID, fechaProgramada: "2026-03-01", resultado: "SALTEADO_ATRASO", ticketId: null, createdAt: "" },
];

function mockBackend() {
  server.use(
    http.get("/api/preventivo/planes", () => HttpResponse.json([PLAN])),
    http.get(`/api/preventivo/planes/${PLAN_ID}/generaciones`, () => HttpResponse.json(GENERACIONES)),
  );
}

describe("PlanPreventivoDetailView — vista de generaciones", () => {
  it("renderiza los tres resultados posibles (GENERADO, SALTEADO_PENDIENTE, SALTEADO_ATRASO)", async () => {
    mockBackend();
    renderWithProviders(<PlanPreventivoDetailView planId={PLAN_ID} />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }),
    });

    expect(await screen.findByText(/^generado$/i)).toBeInTheDocument();
    expect(screen.getByText(/salteado \(pendiente\)/i)).toBeInTheDocument();
    expect(screen.getByText(/salteado \(atraso\)/i)).toBeInTheDocument();
  });

  it("muestra el ticket generado cuando la generación tiene uno", async () => {
    mockBackend();
    renderWithProviders(<PlanPreventivoDetailView planId={PLAN_ID} />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }),
    });

    expect(await screen.findByText("t1")).toBeInTheDocument();
  });
});

describe("PlanPreventivoDetailView — gate por permiso (hallazgo B2, corregido en H2)", () => {
  it("sin PREVENTIVO:LECTURA el backend responde 403 (mismo gate real de PreventivoController.listar()) y se ve el mensaje de permiso, no el de carga fallida", async () => {
    // Escenario REAL: sin `PREVENTIVO:LECTURA` el backend rechaza `GET
    // /preventivo/planes` con 403 (el mismo permiso gatea la API y el `<Can>`
    // del frontend) — nunca hay un 200 exitoso con datos que un actor sin
    // permiso no debería ver. El test anterior (B2) montaba la query en
    // ÉXITO y solo variaba el permiso del `<Can>`, un escenario que no puede
    // ocurrir en producción porque el mismo permiso protege ambas capas.
    server.use(
      http.get("/api/preventivo/planes", () => HttpResponse.json({ message: "Forbidden" }, { status: 403 })),
    );
    renderWithProviders(<PlanPreventivoDetailView planId={PLAN_ID} />, {
      user: buildUser({ permisos: [] }),
    });

    expect(await screen.findByText(/no ten[ée]s permiso para ver este plan/i)).toBeInTheDocument();
    expect(screen.queryByText("Revisión mensual")).not.toBeInTheDocument();
    expect(screen.queryByText(/no se pudo cargar el plan/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });
});

describe("PlanPreventivoDetailView — objetivo con catálogo de equipos caído (hallazgo H1)", () => {
  it("con equipoId: si GET /equipos falla, avisa en vez de mostrar 'Equipo' sin más (indistinguible de un equipo dado de baja)", async () => {
    const EQUIPO_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const PLAN_CON_EQUIPO = { ...PLAN, equipoId: EQUIPO_ID, ubicacion: null };
    server.use(
      http.get("/api/preventivo/planes", () => HttpResponse.json([PLAN_CON_EQUIPO])),
      http.get("/api/equipos", () => HttpResponse.json({ message: "Error interno" }, { status: 500 })),
      http.get(`/api/preventivo/planes/${PLAN_ID}/generaciones`, () => HttpResponse.json(GENERACIONES)),
    );

    renderWithProviders(<PlanPreventivoDetailView planId={PLAN_ID} />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }),
    });

    expect(await screen.findByText(/no se pudo verificar el equipo/i)).toBeInTheDocument();
  });
});

describe("PlanPreventivoDetailView — plan no encontrado (hallazgo #8)", () => {
  it("distingue 'no existe' de 'falló la carga': sin retry y con mensaje propio", async () => {
    server.use(
      http.get("/api/preventivo/planes", () => HttpResponse.json([])),
    );
    renderWithProviders(<PlanPreventivoDetailView planId={PLAN_ID} />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }),
    });

    expect(await screen.findByText(/el plan no existe o fue dado de baja/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });
});

describe("PlanPreventivoDetailView — dar de baja (hallazgo H2)", () => {
  it("con PREVENTIVO:BORRADO el botón aparece y confirmar dispara la mutación y navega a /preventivo", async () => {
    let deleteLlamado = false;
    mockBackend();
    server.use(
      http.delete(`/api/preventivo/planes/${PLAN_ID}`, () => {
        deleteLlamado = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PlanPreventivoDetailView planId={PLAN_ID} />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA", "PREVENTIVO:BORRADO"] }),
    });

    await user.click(await screen.findByRole("button", { name: /^dar de baja$/i }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: /^dar de baja$/i }));

    await waitFor(() => expect(deleteLlamado).toBe(true));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/preventivo"));
    expect(toast.success).toHaveBeenCalled();
  });

  it("sin PREVENTIVO:BORRADO el botón NO aparece (el permiso gatea la única acción destructiva del módulo)", async () => {
    mockBackend();
    renderWithProviders(<PlanPreventivoDetailView planId={PLAN_ID} />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA"] }),
    });

    await screen.findByText("Revisión mensual");
    expect(screen.queryByRole("button", { name: /dar de baja/i })).not.toBeInTheDocument();
  });

  it("un plan con activo=false muestra el Badge 'Baja' y no ofrece dar de baja de nuevo", async () => {
    const PLAN_DE_BAJA = { ...PLAN, activo: false };
    server.use(
      http.get("/api/preventivo/planes", () => HttpResponse.json([PLAN_DE_BAJA])),
      http.get(`/api/preventivo/planes/${PLAN_ID}/generaciones`, () => HttpResponse.json(GENERACIONES)),
    );
    renderWithProviders(<PlanPreventivoDetailView planId={PLAN_ID} />, {
      user: buildUser({ permisos: ["PREVENTIVO:LECTURA", "PREVENTIVO:BORRADO"] }),
    });

    expect(await screen.findByText("Baja")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dar de baja/i })).not.toBeInTheDocument();
  });
});
