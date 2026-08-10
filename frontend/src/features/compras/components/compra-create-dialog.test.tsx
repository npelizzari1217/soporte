import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CompraCreateDialog } from "./compra-create-dialog";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const TIPO_ID = "11111111-1111-4111-8111-111111111111";
const PRIORIDAD_ID = "22222222-2222-4222-8222-222222222222";

function mockBackend(onCreate: (body: Record<string, unknown>) => void) {
  server.use(
    http.get("/api/catalogos/tipos-ticket", () =>
      HttpResponse.json([
        { id: TIPO_ID, codigo: "COMPRAS_GENERALES", nombre: "Compras generales", activo: true, createdAt: "", updatedAt: "" },
      ]),
    ),
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([
        { id: PRIORIDAD_ID, codigo: "MEDIA", nombre: "Media", color: null, orden: 2, activo: true, createdAt: "", updatedAt: "" },
      ]),
    ),
    http.post("/api/compras", async ({ request }) => {
      onCreate((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ id: "tc1", ticketId: "t1", numero: "COM-0001" });
    }),
  );
}

describe("CompraCreateDialog", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("envía el tipoId de compra elegido (incluido un tipo custom del tenant)", async () => {
    const user = userEvent.setup();
    let sent: Record<string, unknown> | null = null;
    mockBackend((body) => {
      sent = body;
    });
    renderWithProviders(<CompraCreateDialog />, { user: buildUser({ permisos: ["ticket:crear"] }) });

    await user.click(screen.getByRole("button", { name: /nuevo ticket de compra/i }));
    await user.type(await screen.findByLabelText(/título/i), "Compra de sillas");
    await user.selectOptions(await screen.findByLabelText(/tipo de compra/i), TIPO_ID);
    await user.selectOptions(screen.getByLabelText(/prioridad/i), PRIORIDAD_ID);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.tipoId).toBe(TIPO_ID);
    expect(sent!.prioridadId).toBe(PRIORIDAD_ID);
  });
});
