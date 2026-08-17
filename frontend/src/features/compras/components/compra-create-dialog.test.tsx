import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CompraCreateDialog } from "./compra-create-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /nueva compra/i }));
  return user;
}

describe("CompraCreateDialog", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("envía el POST con el payload correcto — SIN numero/solicitanteId/cicloId — y navega a la compra creada", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/compras", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "compra-nueva" }, { status: 201 });
      }),
    );

    renderWithProviders(<CompraCreateDialog />, { user: buildUser({ permisos: ["COMPRAS:ALTAS"] }) });

    const user = await abrirDialog();
    await user.type(await screen.findByLabelText(/motivo/i), "Reposición de insumos");
    await user.type(screen.getByLabelText(/fecha de solicitud/i), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /crear$/i }));

    await waitFor(() => expect(capturedBody.motivo).toBe("Reposición de insumos"));
    expect(capturedBody.fechaSolicitud).toBe("2026-02-01");
    expect(capturedBody).not.toHaveProperty("numero");
    expect(capturedBody).not.toHaveProperty("solicitanteId");
    expect(capturedBody).not.toHaveProperty("cicloId");

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/compras/compra-nueva"));
    await waitFor(() => expect(screen.queryByLabelText(/motivo/i)).not.toBeInTheDocument());
  });

  it("muestra el error de dominio del backend (409, sin ciclo activo) al usuario, sin cerrar el dialog", async () => {
    const MENSAJE_BACKEND = "No hay un ciclo activo para crear la compra.";
    server.use(
      http.post("/api/compras", () =>
        HttpResponse.json({ statusCode: 409, message: MENSAJE_BACKEND }, { status: 409 }),
      ),
    );

    renderWithProviders(<CompraCreateDialog />, { user: buildUser({ permisos: ["COMPRAS:ALTAS"] }) });

    const user = await abrirDialog();
    await user.type(await screen.findByLabelText(/motivo/i), "Reposición de insumos");
    await user.type(screen.getByLabelText(/fecha de solicitud/i), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /crear$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
    expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
