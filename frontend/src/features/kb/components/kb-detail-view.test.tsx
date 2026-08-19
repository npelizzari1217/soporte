import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { KbDetailView } from "./kb-detail-view";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

const ARTICULO = {
  id: "a1",
  titulo: "Cómo resetear tu contraseña",
  contenido: "Paso 1: ir a configuración.\nPaso 2: elegir «Restablecer».",
  tipoTicketId: null,
  autorId: "u1",
  visibleParaSolicitante: true,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("KbDetailView", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it.each([
    ["con KB:MODIFICACION+PUBLICAR+BORRADO", ["KB:MODIFICACION", "KB:PUBLICAR", "KB:BORRADO"], true],
    ["sin ninguna celda KB de gestión", [], false],
  ])("acciones de gestión (editar/publicar/eliminar) — %s", async (_label, permisos, shouldShow) => {
    server.use(http.get("/api/kb/a1", () => HttpResponse.json(ARTICULO)));
    renderWithProviders(<KbDetailView articuloId="a1" />, { user: buildUser({ permisos }) });
    await screen.findByText("Cómo resetear tu contraseña");

    const editButton = screen.queryByRole("link", { name: /editar/i }) ?? screen.queryByRole("button", { name: /editar/i });
    if (shouldShow) {
      expect(editButton).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /despublicar/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /eliminar/i })).toBeInTheDocument();
    } else {
      expect(editButton).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /despublicar|publicar/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
    }
  });

  it("renderiza el contenido como markdown y NO ejecuta el HTML crudo del autor", async () => {
    const articuloMalicioso = {
      ...ARTICULO,
      contenido: [
        "## Restablecer la contraseña",
        "",
        "- Entrar a configuración",
        "- Elegir «Restablecer»",
        "",
        "<script>alert(1)</script>",
        '<img src=x onerror="alert(1)">',
      ].join("\n"),
    };
    server.use(http.get("/api/kb/a1", () => HttpResponse.json(articuloMalicioso)));
    renderWithProviders(<KbDetailView articuloId="a1" />, { user: buildUser({ permisos: [] }) });

    const contenedor = await screen.findByRole("article", { name: /contenido del artículo/i });

    // El markdown se renderiza de verdad.
    expect(within(contenedor).getByRole("heading", { name: "Restablecer la contraseña" })).toBeInTheDocument();
    expect(contenedor.querySelectorAll("li")).toHaveLength(2);

    // El HTML crudo NO produce elementos dentro del contenedor del artículo.
    expect(contenedor.querySelector("script")).toBeNull();
    expect(contenedor.querySelector("img[onerror]")).toBeNull();
    expect(contenedor.querySelector("img")).toBeNull();
  });

  it("artículo no accesible (404 del backend, K3) muestra ErrorState en vez de romper", async () => {
    server.use(http.get("/api/kb/oculto", () => HttpResponse.json({ message: "No encontrado" }, { status: 404 })));
    renderWithProviders(<KbDetailView articuloId="oculto" />, { user: buildUser({ permisos: [] }) });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("publicar/despublicar (T3.5) SOLO dispara el PATCH tras confirmar en el diálogo", async () => {
    const user = userEvent.setup();
    let patchCalled = false;
    server.use(
      http.get("/api/kb/a1", () => HttpResponse.json(ARTICULO)),
      http.patch("/api/kb/a1/visibilidad", async ({ request }) => {
        patchCalled = true;
        const body = (await request.json()) as { visible: boolean };
        return HttpResponse.json({ ...ARTICULO, visibleParaSolicitante: body.visible });
      }),
    );
    renderWithProviders(<KbDetailView articuloId="a1" />, { user: buildUser({ permisos: ["KB:MODIFICACION", "KB:PUBLICAR", "KB:BORRADO"] }) });
    await screen.findByText("Cómo resetear tu contraseña");

    await user.click(screen.getByRole("button", { name: "Despublicar" }));
    expect(patchCalled).toBe(false); // el click en el trigger NO alcanza — falta confirmar

    const confirmButtons = await screen.findAllByRole("button", { name: "Despublicar" });
    await user.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(patchCalled).toBe(true));
  });

  it("eliminar (T3.6) confirma en el diálogo, dispara el DELETE y navega a /kb", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;
    server.use(
      http.get("/api/kb/a1", () => HttpResponse.json(ARTICULO)),
      http.delete("/api/kb/a1", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<KbDetailView articuloId="a1" />, { user: buildUser({ permisos: ["KB:MODIFICACION", "KB:PUBLICAR", "KB:BORRADO"] }) });
    await screen.findByText("Cómo resetear tu contraseña");

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    const confirmButtons = await screen.findAllByRole("button", { name: "Eliminar" });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/kb"));
  });
});
