/**
 * TicketsPage integration tests (RTL + MSW).
 *
 * Tests the connected page behavior: TicketsPage uses useTickets (useQuery) which
 * calls apiFetch('tickets'). MSW intercepts /api/tickets same-origin (jsdom http://localhost/).
 *
 * Covers:
 *   - loading → skeleton rows visible
 *   - success (2+ tickets) → numero, titulo and mapped catalog labels rendered
 *   - empty array → EmptyState visible
 *   - error (500) → error message + retry button
 *
 * Spec: [SPEC:frontend-tickets/lista-tickets]
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import TicketsPage from "@/app/(dashboard)/tickets/page";
import type { Ticket } from "../types";

// Session mock — grant all permissions so the gated Nuevo/Editar/Borrar controls render.
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

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const mockTickets: Ticket[] = [
  {
    id: "ticket-1",
    numero: "SOP-2026-00001",
    titulo: "Problema con impresora",
    descripcion: "La impresora no funciona",
    tipoId: "e0000000-0000-4000-e000-000000000001",     // Soporte
    estadoId: "c0000000-0000-4000-c000-000000000001",   // Abierto
    prioridadId: "d0000000-0000-4000-d000-000000000003", // Alta
    cicloId: null,
    solicitanteId: "user-1",
    asignadoId: null,
    fechaResolucion: null,
    createdAt: "2026-01-15T10:00:00Z",
    updatedAt: "2026-01-15T10:00:00Z",
  },
  {
    id: "ticket-2",
    numero: "SOP-2026-00002",
    titulo: "Solicitud de compra de materiales",
    descripcion: null,
    tipoId: "e0000000-0000-4000-e000-000000000002",     // Compras
    estadoId: "c0000000-0000-4000-c000-000000000005",   // En progreso
    prioridadId: "d0000000-0000-4000-d000-000000000002", // Media
    cicloId: null,
    solicitanteId: "user-2",
    asignadoId: "user-3",
    fechaResolucion: "2026-02-01T00:00:00Z",
    createdAt: "2026-01-14T09:00:00Z",
    updatedAt: "2026-01-14T09:00:00Z",
  },
];

// ─── Render helper ─────────────────────────────────────────────────────────────

/** Fresh QueryClient per test — no retry so errors surface immediately */
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

describe("TicketsPage", () => {
  beforeEach(() => {
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

    // Catalog labels resolved from UUIDs (deterministic seed maps)
    expect(screen.getByText("Soporte")).toBeInTheDocument();   // tipo ticket-1
    expect(screen.getByText("Compras")).toBeInTheDocument();   // tipo ticket-2
    expect(screen.getByText("Alta")).toBeInTheDocument();      // prioridad ticket-1
    expect(screen.getByText("Media")).toBeInTheDocument();     // prioridad ticket-2
    expect(screen.getByText("Abierto")).toBeInTheDocument();   // estado ticket-1
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
  // The page MUST wire onOpenCreate/onOpenEdit and render <TicketFormModal>. A prior
  // bug rendered <TicketsList> without those props, so the buttons opened nothing —
  // unit tests passed in isolation but the feature was dead in the running app.

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
