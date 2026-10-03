import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { ConfigurarLogoDialog } from "./configurar-logo-dialog";
import type { Cliente } from "../types";

/**
 * ConfigurarLogoDialog — sdd/logo-por-cliente WU4. La visibilidad del botón
 * "sin permiso no se ve" está cubierta a nivel de página en
 * `clientes-admin-view.test.tsx` (gate por `is_global_admin`), igual que
 * `ConfigurarCsatDialog`/`ConfigurarCorreoDialog`.
 */
const CLIENTE: Cliente = {
  id: "c1",
  nombre: "Cliente Uno",
  razonSocial: null,
  cuit: null,
  dbName: "cliente_uno",
  activo: true,
  csatHabilitado: false,
  slug: null,
  formularioPublicoHabilitado: false,
};

function buildFile({
  name = "logo.png",
  type = "image/png",
  size = 1024,
}: Partial<{ name: string; type: string; size: number }> = {}) {
  const file = new File(["contenido"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("ConfigurarLogoDialog", () => {
  it("un SVG se rechaza inline y deja 'Subir' deshabilitado, sin llamar al backend", async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post("/api/clientes/:id/logo", () => {
        called = true;
        return HttpResponse.json({ logoUpdatedAt: null });
      }),
    );

    renderWithProviders(<ConfigurarLogoDialog cliente={CLIENTE} />);
    await user.click(screen.getByRole("button", { name: /logo de cliente uno/i }));

    const input = screen.getByLabelText(/elegir archivo/i);
    await user.upload(input, buildFile({ name: "logo.svg", type: "image/svg+xml" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/no permitido/i);
    expect(screen.getByRole("button", { name: /^subir$/i })).toBeDisabled();
    expect(called).toBe(false);
  });

  it("un archivo de más de 512 KB se rechaza inline y deja 'Subir' deshabilitado", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigurarLogoDialog cliente={CLIENTE} />);
    await user.click(screen.getByRole("button", { name: /logo de cliente uno/i }));

    const input = screen.getByLabelText(/elegir archivo/i);
    await user.upload(input, buildFile({ size: 512 * 1024 + 1 }));

    expect(screen.getByRole("alert")).toHaveTextContent(/512 KB/i);
    expect(screen.getByRole("button", { name: /^subir$/i })).toBeDisabled();
  });

  it("un PNG válido previsualiza el archivo, habilita 'Subir' y hace POST — éxito cierra el diálogo", async () => {
    const user = userEvent.setup();
    let capturedUrl = "";
    server.use(
      http.post("/api/clientes/:id/logo", ({ params }) => {
        capturedUrl = String(params.id);
        return HttpResponse.json({ logoUpdatedAt: "2026-09-21T00:00:00.000Z" });
      }),
    );

    renderWithProviders(<ConfigurarLogoDialog cliente={CLIENTE} />);
    await user.click(screen.getByRole("button", { name: /logo de cliente uno/i }));

    const input = screen.getByLabelText(/elegir archivo/i);
    await user.upload(input, buildFile());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByAltText(/vista previa del logo/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^subir$/i }));

    await waitFor(() => expect(capturedUrl).toBe("c1"));
    // El diálogo se cierra tras el éxito: su contenido deja de estar montado.
    await waitFor(() => expect(screen.queryByRole("button", { name: /^subir$/i })).not.toBeInTheDocument());
  });

  it("un error del backend al subir deja el diálogo abierto (no se pierde la selección)", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/clientes/:id/logo", () =>
        HttpResponse.json({ statusCode: 404, message: "Cliente no encontrado" }, { status: 404 }),
      ),
    );

    renderWithProviders(<ConfigurarLogoDialog cliente={CLIENTE} />);
    await user.click(screen.getByRole("button", { name: /logo de cliente uno/i }));

    const input = screen.getByLabelText(/elegir archivo/i);
    await user.upload(input, buildFile());
    await user.click(screen.getByRole("button", { name: /^subir$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /^subir$/i })).not.toBeDisabled());
    expect(screen.getByRole("button", { name: /^subir$/i })).toBeInTheDocument();
  });

  it("'Quitar logo' pide confirmación y hace DELETE — éxito cierra el diálogo (spec, borrado idempotente)", async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.delete("/api/clientes/:id/logo", ({ params }) => {
        called = params.id === "c1";
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<ConfigurarLogoDialog cliente={CLIENTE} />);
    await user.click(screen.getByRole("button", { name: /logo de cliente uno/i }));
    await user.click(screen.getByRole("button", { name: /quitar logo/i }));

    const alertDialog = await screen.findByRole("alertdialog");
    await user.click(within(alertDialog).getByRole("button", { name: /^quitar$/i }));

    await waitFor(() => expect(called).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^subir$/i })).not.toBeInTheDocument());
  });
});
