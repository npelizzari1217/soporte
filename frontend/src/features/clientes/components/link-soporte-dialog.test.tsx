import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { buildUser, renderWithProviders } from "../../../../test/render-with-providers";
import { LinkSoporteDialog } from "./link-soporte-dialog";

const URL_SOPORTE = "https://soporte.example.com/c/acme/pedido";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

function responder(url: string | null) {
  server.use(http.get("/api/clientes/actual/link-soporte", () => HttpResponse.json({ url })));
}

describe("LinkSoporteDialog", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  /** `userEvent.setup()` instala su propio portapapeles: el mock se define DESPUÉS. */
  function setupUser() {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    return user;
  }

  it("no se muestra si el backend devuelve url null", async () => {
    let pidio = false;
    server.use(
      http.get("/api/clientes/actual/link-soporte", () => {
        pidio = true;
        return HttpResponse.json({ url: null });
      }),
    );
    renderWithProviders(<LinkSoporteDialog />, { user: buildUser({ cliente_id: "c1" }) });

    await waitFor(() => expect(pidio).toBe(true));
    expect(screen.queryByRole("button", { name: /link de soporte/i })).not.toBeInTheDocument();
  });

  it("no pide nada ni se muestra sin cliente en la sesión", async () => {
    let pidio = false;
    server.use(
      http.get("/api/clientes/actual/link-soporte", () => {
        pidio = true;
        return HttpResponse.json({ url: URL_SOPORTE });
      }),
    );
    renderWithProviders(<LinkSoporteDialog />, { user: buildUser({ cliente_id: null }) });

    await new Promise((r) => setTimeout(r, 50));
    expect(pidio).toBe(false);
    expect(screen.queryByRole("button", { name: /link de soporte/i })).not.toBeInTheDocument();
  });

  it("muestra el link de solo lectura con el texto de ayuda y lo copia", async () => {
    responder(URL_SOPORTE);
    const user = setupUser();
    renderWithProviders(<LinkSoporteDialog />, { user: buildUser({ cliente_id: "c1" }) });

    await user.click(await screen.findByRole("button", { name: /link de soporte/i }));

    const campo = await screen.findByRole("textbox", { name: /link de soporte/i });
    expect(campo).toHaveValue(URL_SOPORTE);
    expect(campo).toHaveAttribute("readonly");
    expect(screen.getByText(/cualquiera que lo tenga puede pedir soporte/i)).toBeInTheDocument();
    expect(screen.getByText(/sin un equipo preseleccionado/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^copiar$/i }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Link copiado."));
    expect(writeText).toHaveBeenCalledWith(URL_SOPORTE);
  });

  it("si el portapapeles falla, avisa y no confirma la copia", async () => {
    responder(URL_SOPORTE);
    writeText.mockRejectedValue(new Error("denegado"));
    const user = setupUser();
    renderWithProviders(<LinkSoporteDialog />, { user: buildUser({ cliente_id: "c1" }) });

    await user.click(await screen.findByRole("button", { name: /link de soporte/i }));
    await user.click(await screen.findByRole("button", { name: /^copiar$/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
