import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketCreateDialog } from "./ticket-create-dialog";
import { permisosDeTest, renderConPermisos } from "@/shared/hooks/use-permisos-por-tipo.test-helpers";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

function mockBackend() {
  server.use(
    http.get("/api/catalogos/tipos-ticket", () =>
      HttpResponse.json([{ id: "11111111-1111-1111-1111-111111111111", codigo: "SOPORTE", nombre: "Soporte", modulo: "SOPORTE", activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([{ id: "22222222-2222-2222-2222-222222222222", codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" }]),
    ),
  );
}

/**
 * Edge case no obvio: `ticketReferenciaId` es opcional en el form (campo sin
 * elegir → string vacío de RHF). Si ese `""` viajara tal cual al backend,
 * `@IsUUID()` (`CreateTicketDto`) lo rechazaría con 422 — el mapeo a
 * `undefined` es la parte de lógica real de este container.
 */
describe("TicketCreateDialog", () => {
  beforeEach(() => {
    pushMock.mockClear();
    mockBackend();
  });

  it("abre el modal, crea sin referencia → POST /tickets NO incluye ticketReferenciaId, cierra el modal y navega al ticket creado", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/tickets", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "nuevo-ticket-id" }, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketCreateDialog />, { user: buildUser({ permisos: ["TICKETS:ALTAS"] }) });

    expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^nuevo ticket$/i }));

    await user.type(await screen.findByLabelText("Título"), "Impresora rota");
    await user.selectOptions(screen.getByLabelText("Tipo"), "11111111-1111-1111-1111-111111111111");
    await user.selectOptions(screen.getByLabelText("Prioridad"), "22222222-2222-2222-2222-222222222222");
    await user.click(screen.getByRole("button", { name: /crear ticket/i }));

    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody).not.toHaveProperty("ticketReferenciaId");
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/tickets/nuevo-ticket-id"));
    await waitFor(() => expect(screen.queryByLabelText("Título")).not.toBeInTheDocument());
  });

  it("con ubicación y sector, POST /tickets los incluye; vacíos no viajan (odd/ubicacion-sector-ticket)", async () => {
    const SECTOR_ID = "44444444-4444-4444-4444-444444444444";
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.get("/api/sectores", () =>
        HttpResponse.json([{ id: SECTOR_ID, codigo: "PRI", nombre: "Primaria", activo: true, createdAt: "", updatedAt: "" }]),
      ),
      http.post("/api/tickets", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: `nuevo-${bodies.length}` }, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketCreateDialog />, { user: buildUser({ permisos: ["TICKETS:ALTAS"] }) });

    async function completarYCrear(extra: () => Promise<void>) {
      await user.click(screen.getByRole("button", { name: /^nuevo ticket$/i }));
      await user.type(await screen.findByLabelText("Título"), "Impresora rota");
      await user.selectOptions(screen.getByLabelText("Tipo"), "11111111-1111-1111-1111-111111111111");
      await user.selectOptions(screen.getByLabelText("Prioridad"), "22222222-2222-2222-2222-222222222222");
      await extra();
      await user.click(screen.getByRole("button", { name: /crear ticket/i }));
      await waitFor(() => expect(screen.queryByLabelText("Título")).not.toBeInTheDocument());
    }

    await completarYCrear(async () => {
      await user.type(screen.getByLabelText("Ubicación"), "Aula 12");
      await screen.findByRole("option", { name: "Primaria" });
      await user.selectOptions(screen.getByLabelText("Sector"), SECTOR_ID);
    });
    expect(bodies[0]).toMatchObject({ ubicacion: "Aula 12", sectorId: SECTOR_ID });

    await completarYCrear(async () => {
      expect(screen.getByLabelText("Sector")).toHaveValue("");
    });
    expect(bodies[1]).not.toHaveProperty("ubicacion");
    expect(bodies[1]).not.toHaveProperty("sectorId");
  });
});

describe("TicketCreateDialog — solo los tipos con Crear (odd/permisos-por-tipo-ticket, S6)", () => {
  const tipo = (id: string, codigo: string, nombre: string) => ({
    id,
    codigo,
    nombre,
    modulo: "TICKETS",
    activo: true,
    createdAt: "",
    updatedAt: "",
  });
  const SOPORTE = "11111111-1111-1111-1111-111111111111";
  const REDES = "33333333-3333-3333-3333-333333333333";
  // La celda TICKETS:ALTAS del JWT ya no decide qué tipos se ofrecen.
  const tecnico = buildUser({ rol: "TECNICO", permisos: ["TICKETS:ALTAS"] });

  beforeEach(() => {
    mockBackend();
    server.use(
      http.get("/api/catalogos/tipos-ticket", () =>
        HttpResponse.json([tipo(SOPORTE, "SOPORTE", "Soporte"), tipo(REDES, "REDES", "Redes")]),
      ),
    );
  });

  it("ofrece el tipo con ALTAS y no el que solo se lee", async () => {
    const user = userEvent.setup();
    renderConPermisos(<TicketCreateDialog />, {
      user: tecnico,
      permisos: permisosDeTest({ [SOPORTE]: ["LECTURA"], [REDES]: ["LECTURA", "ALTAS"] }),
    });

    await user.click(await screen.findByRole("button", { name: /^nuevo ticket$/i }));
    const select = await screen.findByLabelText("Tipo");
    expect(await within(select).findByRole("option", { name: "Redes" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Soporte" })).not.toBeInTheDocument();
  });

  it("con el catálogo cargado y ningún tipo con ALTAS, no muestra el botón", async () => {
    renderConPermisos(<TicketCreateDialog />, {
      user: tecnico,
      permisos: permisosDeTest({ [SOPORTE]: ["LECTURA"], [REDES]: ["LECTURA"] }),
    });

    await waitFor(() => expect(screen.queryByRole("button", { name: /^nuevo ticket$/i })).not.toBeInTheDocument());
  });
});
