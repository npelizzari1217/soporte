import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ConfigurarFormularioPublicoDialog } from "./configurar-formulario-publico-dialog";
import type { Cliente } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * ConfigurarFormularioPublicoDialog — sdd/formulario-publico-qr, WU-3. La
 * visibilidad "sin permiso no se ve" vive a nivel de página
 * (`clientes-admin-view.test.tsx`, gate por `is_global_admin`).
 */
const CLIENTE_SIN_SLUG: Cliente = {
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

const CLIENTE_CON_SLUG: Cliente = { ...CLIENTE_SIN_SLUG, slug: "colegio-norte" };

const ABRIR = /formulario público de cliente uno/i;

function interceptarPatch(capturas: { body: Record<string, unknown> | null; id: string }) {
  server.use(
    http.patch("/api/clientes/:id/formulario-publico", async ({ request, params }) => {
      capturas.id = String(params.id);
      capturas.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...CLIENTE_SIN_SLUG, slug: "colegio-norte" });
    }),
  );
}

describe("ConfigurarFormularioPublicoDialog", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it("arranca prellenado con el slug y la habilitación reales del cliente", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConfigurarFormularioPublicoDialog cliente={{ ...CLIENTE_CON_SLUG, formularioPublicoHabilitado: true }} />,
      { user: buildUser({ is_global_admin: true }) },
    );

    await user.click(screen.getByRole("button", { name: ABRIR }));

    expect(screen.getByLabelText(/^slug$/i)).toHaveValue("colegio-norte");
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("cargar el slug y guardar hace PATCH con solo el slug", async () => {
    const user = userEvent.setup();
    const capturas = { body: null as Record<string, unknown> | null, id: "" };
    interceptarPatch(capturas);
    renderWithProviders(<ConfigurarFormularioPublicoDialog cliente={CLIENTE_SIN_SLUG} />, {
      user: buildUser({ is_global_admin: true }),
    });

    await user.click(screen.getByRole("button", { name: ABRIR }));
    await user.type(screen.getByLabelText(/^slug$/i), "colegio-norte");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await screen.findByRole("button", { name: ABRIR });
    expect(capturas.id).toBe("c1");
    expect(capturas.body).toEqual({ slug: "colegio-norte" });
  });

  it("habilitar con el slug ya cargado manda solo habilitado=true", async () => {
    const user = userEvent.setup();
    const capturas = { body: null as Record<string, unknown> | null, id: "" };
    interceptarPatch(capturas);
    renderWithProviders(<ConfigurarFormularioPublicoDialog cliente={CLIENTE_CON_SLUG} />, {
      user: buildUser({ is_global_admin: true }),
    });

    await user.click(screen.getByRole("button", { name: ABRIR }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await screen.findByRole("button", { name: ABRIR });
    expect(capturas.body).toEqual({ habilitado: true });
  });

  it("un slug con mayúsculas se rechaza en el front y no llama al backend", async () => {
    const user = userEvent.setup();
    const capturas = { body: null as Record<string, unknown> | null, id: "" };
    interceptarPatch(capturas);
    renderWithProviders(<ConfigurarFormularioPublicoDialog cliente={CLIENTE_SIN_SLUG} />, {
      user: buildUser({ is_global_admin: true }),
    });

    await user.click(screen.getByRole("button", { name: ABRIR }));
    await user.type(screen.getByLabelText(/^slug$/i), "Colegio Norte");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/minúsculas/i);
    expect(capturas.body).toBeNull();
  });

  it("habilitar sin slug se rechaza en el front y no llama al backend", async () => {
    const user = userEvent.setup();
    const capturas = { body: null as Record<string, unknown> | null, id: "" };
    interceptarPatch(capturas);
    renderWithProviders(<ConfigurarFormularioPublicoDialog cliente={CLIENTE_SIN_SLUG} />, {
      user: buildUser({ is_global_admin: true }),
    });

    await user.click(screen.getByRole("button", { name: ABRIR }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cargá un slug/i);
    expect(capturas.body).toBeNull();
  });

  it("sin cambios, guardar cierra el diálogo sin llamar al backend", async () => {
    const user = userEvent.setup();
    const capturas = { body: null as Record<string, unknown> | null, id: "" };
    interceptarPatch(capturas);
    renderWithProviders(<ConfigurarFormularioPublicoDialog cliente={CLIENTE_CON_SLUG} />, {
      user: buildUser({ is_global_admin: true }),
    });

    await user.click(screen.getByRole("button", { name: ABRIR }));
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await screen.findByRole("button", { name: ABRIR });
    expect(screen.queryByLabelText(/^slug$/i)).not.toBeInTheDocument();
    expect(capturas.body).toBeNull();
  });

  it("un 409 con código SLUG_CONGELADO deja el diálogo abierto y avisa por código", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch("/api/clientes/:id/formulario-publico", () =>
        HttpResponse.json(
          { statusCode: 409, message: "texto que no se usa", code: "SLUG_CONGELADO" },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<ConfigurarFormularioPublicoDialog cliente={CLIENTE_CON_SLUG} />, {
      user: buildUser({ is_global_admin: true }),
    });

    await user.click(screen.getByRole("button", { name: ABRIR }));
    await user.clear(screen.getByLabelText(/^slug$/i));
    await user.type(screen.getByLabelText(/^slug$/i), "otro-slug");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("El slug ya no se puede cambiar porque se emitió un QR con él."),
    );
    expect(screen.getByLabelText(/^slug$/i)).toHaveValue("otro-slug");
  });

  it("un error sin código cae al mensaje del backend", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch("/api/clientes/:id/formulario-publico", () =>
        HttpResponse.json({ statusCode: 409, message: "Ya existe otro cliente con ese slug." }, { status: 409 }),
      ),
    );
    renderWithProviders(<ConfigurarFormularioPublicoDialog cliente={CLIENTE_SIN_SLUG} />, {
      user: buildUser({ is_global_admin: true }),
    });

    await user.click(screen.getByRole("button", { name: ABRIR }));
    await user.type(screen.getByLabelText(/^slug$/i), "colegio-norte");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Ya existe otro cliente con ese slug."));
  });
});
