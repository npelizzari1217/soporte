import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { KbArticleCreateDialog } from "./kb-article-create-dialog";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

describe("KbArticleCreateDialog", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("abre el modal, crea el artículo, cierra el modal y navega al detalle", async () => {
    const user = userEvent.setup();
    server.use(http.post("/api/kb", () => HttpResponse.json({ id: "nuevo-a1" }, { status: 201 })));
    renderWithProviders(<KbArticleCreateDialog />, { user: buildUser({ is_global_admin: true }) });

    expect(screen.queryByLabelText(/título/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^nuevo artículo$/i }));

    await user.type(await screen.findByLabelText(/título/i), "Nuevo artículo");
    await user.type(screen.getByLabelText(/contenido/i), "Contenido del artículo");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/kb/nuevo-a1"));
    await waitFor(() => expect(screen.queryByLabelText(/título/i)).not.toBeInTheDocument());
  });
});
