import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { KbArticleEditDialog } from "./kb-article-edit-dialog";

const ARTICULO = {
  id: "a1",
  titulo: "Título original",
  contenido: "Contenido original",
  tipoTicketId: null,
  autorId: "u1",
  visibleParaSolicitante: false,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("KbArticleEditDialog", () => {
  it("abre el modal precargado con los valores actuales, edita y cierra el modal al guardar", async () => {
    const user = userEvent.setup();
    server.use(http.patch("/api/kb/a1", () => HttpResponse.json({ ...ARTICULO, titulo: "Editado" })));
    renderWithProviders(<KbArticleEditDialog articulo={ARTICULO} />, {
      user: buildUser({ permisos: ["KB:MODIFICACION"] }),
    });

    expect(screen.queryByLabelText(/título/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^editar$/i }));

    const tituloInput = await screen.findByLabelText(/título/i);
    expect(tituloInput).toHaveValue("Título original");

    await user.clear(tituloInput);
    await user.type(tituloInput, "Editado");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(screen.queryByLabelText(/título/i)).not.toBeInTheDocument());
  });
});
