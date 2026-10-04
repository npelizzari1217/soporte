import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { ConfirmarPedidoView } from "./confirmar-pedido-view";

// Spec: sdd/formulario-publico-qr, pedido-publico (ADR-9): el token viaja en el fragmento, sale de la
// barra con replaceState y se consume SOLO en el POST (un escáner de links no lo quema).

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfirmarPedidoView slug="mi-colegio" />
    </QueryClientProvider>,
  );
}

function confirmarResponde(status: number, body: Record<string, string | number>) {
  const llamadas: unknown[] = [];
  server.use(
    http.post("/api/publico/c/mi-colegio/pedido/confirmar", async ({ request }) => {
      llamadas.push(await request.json());
      return HttpResponse.json(body, { status });
    }),
  );
  return llamadas;
}

describe("ConfirmarPedidoView", () => {
  beforeEach(() => {
    window.location.hash = "";
    vi.restoreAllMocks();
  });

  it("lee #token=, lo saca de la URL con replaceState y NO llama al backend al cargar", async () => {
    window.location.hash = "#token=abc123";
    const replaceState = vi.spyOn(window.history, "replaceState");
    const llamadas = confirmarResponde(200, { numero: "T-1" });

    renderView();

    expect(await screen.findByRole("button", { name: /confirmar pedido/i })).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalledWith(null, "", window.location.pathname + window.location.search);
    expect(window.location.hash).toBe("");
    expect(llamadas).toHaveLength(0);
  });

  it("el botón hace el POST con el token crudo y muestra el número", async () => {
    window.location.hash = "#token=abc%2B123";
    const llamadas = confirmarResponde(200, { numero: "T-2026-0007" });
    const user = userEvent.setup();

    renderView();
    await user.click(await screen.findByRole("button", { name: /confirmar pedido/i }));

    expect(await screen.findByText(/T-2026-0007/)).toBeInTheDocument();
    expect(llamadas).toEqual([{ token: "abc+123" }]);
  });

  it("404: mensaje uniforme sin botón para reintentar", async () => {
    window.location.hash = "#token=viejo";
    confirmarResponde(404, { statusCode: 404, message: "no" });
    const user = userEvent.setup();

    renderView();
    await user.click(await screen.findByRole("button", { name: /confirmar pedido/i }));

    expect(await screen.findByText(/no es válido o venció/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirmar pedido/i })).not.toBeInTheDocument();
  });

  it("409 sin ciclo activo: aviso transitorio y el botón sigue disponible", async () => {
    window.location.hash = "#token=abc";
    confirmarResponde(409, { statusCode: 409, message: "sin ciclo" });
    const user = userEvent.setup();

    renderView();
    await user.click(await screen.findByRole("button", { name: /confirmar pedido/i }));

    expect(await screen.findByText(/sigue siendo válido/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmar pedido/i })).toBeInTheDocument();
  });

  it("429: aviso y el botón sigue disponible", async () => {
    window.location.hash = "#token=abc";
    confirmarResponde(429, { statusCode: 429, message: "x" });
    const user = userEvent.setup();

    renderView();
    await user.click(await screen.findByRole("button", { name: /confirmar pedido/i }));

    expect(await screen.findByText(/demasiados intentos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmar pedido/i })).toBeInTheDocument();
  });

  it("sin token o mal codificado: mensaje de link inválido, sin botón y sin llamar al backend", async () => {
    const llamadas = confirmarResponde(200, { numero: "T-1" });
    const { unmount } = renderView();
    expect(await screen.findByText(/no es válido o venció/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirmar pedido/i })).not.toBeInTheDocument();
    unmount();

    window.location.hash = "#token=%E0";
    renderView();
    expect(await screen.findByText(/no es válido o venció/i)).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
  });
});
