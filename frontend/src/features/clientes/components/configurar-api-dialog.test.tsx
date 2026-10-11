import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ConfigurarApiDialog } from "./configurar-api-dialog";
import type { Cliente } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * ConfigurarApiDialog — api-publica, T8 (CA4). La visibilidad "sin permiso no
 * se ve" vive a nivel de página (`clientes-admin-view.test.tsx`, gate por
 * `is_global_admin`).
 */
const CLIENTE_SIN_API: Cliente = {
  id: "c1",
  nombre: "Cliente Uno",
  razonSocial: null,
  cuit: null,
  dbName: "cliente_uno",
  activo: true,
  csatHabilitado: false,
  slug: null,
  formularioPublicoHabilitado: false,
  apiHabilitada: false,
};

const CLIENTE_CON_API: Cliente = { ...CLIENTE_SIN_API, apiHabilitada: true };

const ABRIR = /api pública de cliente uno/i;

function interceptarPatch(capturas: { body: Record<string, unknown> | null; id: string }) {
  server.use(
    http.patch("/api/clientes/:id/api", async ({ request, params }) => {
      capturas.id = String(params.id);
      capturas.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ clienteId: capturas.id, apiHabilitada: capturas.body.habilitada });
    }),
  );
}

function renderDialog(cliente: Cliente) {
  return renderWithProviders(<ConfigurarApiDialog cliente={cliente} />, {
    user: buildUser({ is_global_admin: true }),
  });
}

describe("ConfigurarApiDialog", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("muestra el estado real del cliente", async () => {
    const user = userEvent.setup();
    renderDialog(CLIENTE_CON_API);

    await user.click(screen.getByRole("button", { name: ABRIR }));

    expect(screen.getByText("Habilitada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^deshabilitar api$/i })).toBeInTheDocument();
  });

  it("habilitar pide confirmación, avisa de Integraciones y hace PATCH con habilitada=true", async () => {
    const user = userEvent.setup();
    const capturas = { body: null as Record<string, unknown> | null, id: "" };
    interceptarPatch(capturas);
    renderDialog(CLIENTE_SIN_API);

    await user.click(screen.getByRole("button", { name: ABRIR }));
    expect(screen.getByText("Deshabilitada")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^habilitar api$/i }));

    expect(within(screen.getByRole("alertdialog")).getByText(/crea las claves desde la pantalla "integraciones"/i)).toBeInTheDocument();
    expect(capturas.body).toBeNull();
    await user.click(screen.getByRole("button", { name: /^habilitar$/i }));

    await waitFor(() => expect(capturas.body).toEqual({ habilitada: true }));
    expect(capturas.id).toBe("c1");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("API pública habilitada."));
  });

  it("deshabilitar advierte que las claves dejan de funcionar y se conservan, y hace PATCH con habilitada=false", async () => {
    const user = userEvent.setup();
    const capturas = { body: null as Record<string, unknown> | null, id: "" };
    interceptarPatch(capturas);
    renderDialog(CLIENTE_CON_API);

    await user.click(screen.getByRole("button", { name: ABRIR }));
    await user.click(screen.getByRole("button", { name: /^deshabilitar api$/i }));

    const confirmacion = screen.getByRole("alertdialog");
    expect(within(confirmacion).getByText(/todas las claves de este cliente dejan de funcionar en el acto/i)).toBeInTheDocument();
    expect(within(confirmacion).getByText(/las claves y el usuario de integración se conservan/i)).toBeInTheDocument();
    expect(capturas.body).toBeNull();
    await user.click(screen.getByRole("button", { name: /^deshabilitar$/i }));

    await waitFor(() => expect(capturas.body).toEqual({ habilitada: false }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("API pública deshabilitada."));
  });

  it("cancelar la confirmación no llama al backend", async () => {
    const user = userEvent.setup();
    const capturas = { body: null as Record<string, unknown> | null, id: "" };
    interceptarPatch(capturas);
    renderDialog(CLIENTE_CON_API);

    await user.click(screen.getByRole("button", { name: ABRIR }));
    await user.click(screen.getByRole("button", { name: /^deshabilitar api$/i }));
    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(screen.getByText("Habilitada")).toBeInTheDocument();
    expect(capturas.body).toBeNull();
  });

  it("un error del backend se muestra con su mensaje", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch("/api/clientes/:id/api", () =>
        HttpResponse.json({ statusCode: 404, message: "Cliente no encontrado." }, { status: 404 }),
      ),
    );
    renderDialog(CLIENTE_SIN_API);

    await user.click(screen.getByRole("button", { name: ABRIR }));
    await user.click(screen.getByRole("button", { name: /^habilitar api$/i }));
    await user.click(screen.getByRole("button", { name: /^habilitar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Cliente no encontrado."));
  });
});
