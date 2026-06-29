/**
 * TicketsPage integration tests (RTL + MSW + hook mocks).
 *
 * PR4 update: TicketsPage now calls useCicloActivo in addition to useTickets.
 * Strategy:
 *   - useCicloActivo: vi.mock — controlled per test via mockUseCicloActivo.mockReturnValue
 *   - useTickets: real hook backed by MSW for existing "data flow" tests;
 *     also vi.mock-able per describe block for the new PR4 ciclo-integration tests
 *
 * Existing tests (loading, success, empty, error, wiring) now require
 * useCicloActivo to return a valid ciclo — otherwise the page shows the
 * "no hay ciclo" alert instead of the tickets list.
 *
 * New PR4 tests (ciclo-integration describe) mock both hooks to test
 * the container logic in isolation from network calls.
 *
 * Spec: ADR-7, ADR-8 (tickets-list-filtros-resolucion)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import TicketsPage from "@/app/(dashboard)/tickets/page";
import type { Ticket, CicloActivo } from "../types";

// ─── Session mock ──────────────────────────────────────────────────────────────
vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => ({
    user: {
      sub: "user-1",
      email: "test@example.com",
      cliente_id: "c1",
      cliente_nombre: "E2E Org",
      roles: ["ADMIN"],
      permisos: [],
    },
    isLoading: false,
    can: () => true,
  }),
}));

// ─── useCicloActivo mock ──────────────────────────────────────────────────────
// Mocked globally so ALL tests can control whether ciclo is available.
// Default (set in beforeEach): returns valid ciclo so existing tests keep passing.
const mockUseCicloActivo = vi.fn();
vi.mock("@/features/tickets/hooks/use-ciclo-activo", () => ({
  useCicloActivo: () => mockUseCicloActivo(),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCiclo: CicloActivo = {
  id: "ciclo-uuid-001",
  nombre: "Ciclo 2026",
  fechaInicio: "2026-01-01",
  fechaFin: "2026-12-31",
  activo: true,
};

const mockTickets: Ticket[] = [
  {
    id: "ticket-1",
    numero: "SOP-2026-00001",
    titulo: "Problema con impresora",
    descripcion: "La impresora no funciona",
    tipoId: "e0000000-0000-4000-e000-000000000001", // Soporte
    estadoId: "c0000000-0000-4000-c000-000000000001", // Abierto
    prioridadId: "d0000000-0000-4000-d000-000000000003", // Alta
    cicloId: null,
    solicitanteId: "user-1",
    asignadoId: null,
    fechaCierre: null,
    createdAt: "2026-01-15T10:00:00Z",
    updatedAt: "2026-01-15T10:00:00Z",
  },
  {
    id: "ticket-2",
    numero: "SOP-2026-00002",
    titulo: "Solicitud de compra de materiales",
    descripcion: null,
    tipoId: "e0000000-0000-4000-e000-000000000002", // Compras
    estadoId: "c0000000-0000-4000-c000-000000000005", // En progreso
    prioridadId: "d0000000-0000-4000-d000-000000000002", // Media
    cicloId: null,
    solicitanteId: "user-2",
    asignadoId: "user-3",
    fechaCierre: "2026-02-01T00:00:00Z",
    createdAt: "2026-01-14T09:00:00Z",
    updatedAt: "2026-01-14T09:00:00Z",
  },
];

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderTicketsPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <TicketsPage />
    </QueryClientProvider>,
  );
  return { container, queryClient };
}

// ─── Existing tests (data-flow via real useTickets + MSW) ──────────────────────

describe("TicketsPage", () => {
  beforeEach(() => {
    // Default: ciclo activo válido — so existing tests see the tickets list.
    mockUseCicloActivo.mockReturnValue({
      data: mockCiclo,
      isLoading: false,
      isError: false,
      error: null,
    });
    // server.resetHandlers() is called by vitest.setup.ts afterEach
  });

  // ─── Loading ────────────────────────────────────────────────────────────────

  it("loading: renders skeleton rows while fetch is pending", () => {
    // Never-resolving handler keeps component in loading state
    server.use(
      http.get("http://localhost/api/tickets", () => new Promise(() => {})),
    );

    const { container } = renderTicketsPage();

    // Skeleton rows are present (animate-pulse is the Skeleton component signature)
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(5);

    // No ticket numbers visible while loading
    expect(screen.queryByText("SOP-2026-00001")).not.toBeInTheDocument();
  });

  // ─── Success ────────────────────────────────────────────────────────────────

  it("success: renders ticket rows with numero, titulo and mapped catalog labels", async () => {
    server.use(
      http.get("http://localhost/api/tickets", () =>
        HttpResponse.json(mockTickets),
      ),
    );

    renderTicketsPage();

    // Wait for data to arrive
    await screen.findByText("SOP-2026-00001");

    // Second ticket
    expect(screen.getByText("SOP-2026-00002")).toBeInTheDocument();

    // Titulos
    expect(screen.getByText("Problema con impresora")).toBeInTheDocument();
    expect(
      screen.getByText("Solicitud de compra de materiales"),
    ).toBeInTheDocument();

    // Catalog labels resolved from UUIDs (deterministic seed maps).
    // "Soporte", "Compras", "Edilicia" appear in both FiltrosBar checkboxes AND
    // TicketsList tipo badges — use getAllByText to allow multiple matches.
    expect(screen.getAllByText("Soporte").length).toBeGreaterThanOrEqual(1); // tipo ticket-1
    expect(screen.getAllByText("Compras").length).toBeGreaterThanOrEqual(1); // tipo ticket-2
    expect(screen.getByText("Alta")).toBeInTheDocument(); // prioridad ticket-1
    expect(screen.getByText("Media")).toBeInTheDocument(); // prioridad ticket-2
    expect(screen.getByText("Abierto")).toBeInTheDocument(); // estado ticket-1
    expect(screen.getByText("En progreso")).toBeInTheDocument(); // estado ticket-2
  });

  // ─── Empty ──────────────────────────────────────────────────────────────────

  it("empty: renders EmptyState when API returns empty array", async () => {
    server.use(
      http.get("http://localhost/api/tickets", () => HttpResponse.json([])),
    );

    renderTicketsPage();

    await screen.findByText("No hay tickets todavía");
    // No table/rows rendered
    expect(screen.queryByText("SOP-2026-00001")).not.toBeInTheDocument();
  });

  // ─── Error ──────────────────────────────────────────────────────────────────

  it("error: renders error message and retry button on 500", async () => {
    server.use(
      http.get("http://localhost/api/tickets", () =>
        HttpResponse.json(
          { statusCode: 500, message: "Internal Server Error" },
          { status: 500 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderTicketsPage();

    // Wait for error state
    const retryButton = await screen.findByRole("button", {
      name: /reintentar/i,
    });
    expect(retryButton).toBeInTheDocument();

    // Clicking retry triggers a new fetch (just assert it's clickable — no server change needed)
    await user.click(retryButton);
    // After retry click the component refetches — still error, but no crash
    expect(
      await screen.findByRole("button", { name: /reintentar/i }),
    ).toBeInTheDocument();
  });

  // ─── Create/Edit modal wiring (regression) ────────────────────────────────────

  it("wiring: clicking 'Nuevo ticket' opens the create modal", async () => {
    server.use(
      http.get("http://localhost/api/tickets", () =>
        HttpResponse.json(mockTickets),
      ),
    );

    const user = userEvent.setup();
    renderTicketsPage();
    await screen.findByText("SOP-2026-00001");

    // No dialog before clicking
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /nuevo ticket/i }));

    // Create modal opens with its form
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Nuevo ticket")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/título/i)).toBeInTheDocument();
  });

  it("wiring: clicking the edit button opens the edit modal", async () => {
    server.use(
      http.get("http://localhost/api/tickets", () =>
        HttpResponse.json(mockTickets),
      ),
    );

    const user = userEvent.setup();
    renderTicketsPage();
    await screen.findByText("Problema con impresora");

    await user.click(
      screen.getAllByRole("button", { name: /editar ticket/i })[0],
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Editar ticket")).toBeInTheDocument();
  });
});

// ─── PR4 ciclo-integration tests ──────────────────────────────────────────────

describe("TicketsPage — ciclo integration (PR4)", () => {
  beforeEach(() => {
    // Reset to loading state; each test sets its own ciclo mock
    mockUseCicloActivo.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
  });

  it("no-ciclo: shows role=alert banner and NO fetch for tickets when ciclo is null", async () => {
    mockUseCicloActivo.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    });

    // Handler that would fail if called — tickets should NOT be fetched
    const ticketsHandler = vi.fn(() => HttpResponse.json([]));
    server.use(http.get("http://localhost/api/tickets", ticketsHandler));

    renderTicketsPage();

    // Banner visible
    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/ciclo activo/i);

    // Tickets NOT fetched (useTickets is disabled when ciclo === null)
    // Give a tick for any possible async fetch to start
    await new Promise((r) => setTimeout(r, 30));
    expect(ticketsHandler).not.toHaveBeenCalled();
  });

  it("ciclo-loading: shows global skeleton and NO alert while ciclo is loading", async () => {
    mockUseCicloActivo.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    const { container } = renderTicketsPage();

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ciclo-present: renders FiltrosBar with ciclo dates and no alert when ciclo is available", async () => {
    mockUseCicloActivo.mockReturnValue({
      data: mockCiclo,
      isLoading: false,
      isError: false,
      error: null,
    });

    server.use(
      http.get("http://localhost/api/tickets", () => HttpResponse.json(mockTickets)),
    );

    renderTicketsPage();

    // Alert NOT present
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // FiltrosBar rendered — date inputs with ciclo dates appear after effect runs
    await act(async () => {
      // Allow useEffect to set filtros state
      await new Promise((r) => setTimeout(r, 10));
    });

    const desdeInput = screen.getByLabelText(/desde/i) as HTMLInputElement;
    const hastaInput = screen.getByLabelText(/hasta/i) as HTMLInputElement;
    expect(desdeInput.value).toBe(mockCiclo.fechaInicio);
    expect(hastaInput.value).toBe(mockCiclo.fechaFin);
  });

  it("filter-update: changing a tipo in FiltrosBar updates the filtros state", async () => {
    mockUseCicloActivo.mockReturnValue({
      data: mockCiclo,
      isLoading: false,
      isError: false,
      error: null,
    });

    // Track URLs called by useTickets
    const capturedUrls: string[] = [];
    server.use(
      http.get("http://localhost/api/tickets", ({ request }) => {
        capturedUrls.push(request.url);
        return HttpResponse.json([]);
      }),
    );

    renderTicketsPage();

    // Wait for initial render + effects
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const user = userEvent.setup();
    const soporteCheckbox = screen.getByRole("checkbox", { name: /Soporte/i });
    await user.click(soporteCheckbox);

    // Wait for refetch with updated filtros
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // At least one request should have included tiposIds for Soporte
    const hasFilteredRequest = capturedUrls.some((url) =>
      url.includes("tiposIds"),
    );
    expect(hasFilteredRequest).toBe(true);
  });
});
