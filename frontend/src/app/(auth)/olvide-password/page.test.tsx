import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { MENSAJE_SOLICITUD_RESET } from "@/features/auth/hooks/use-solicitar-reset";
import OlvidePasswordPage from "./page";

// Spec: sdd/reseteo-contrasena-olvidada — Requirement "El frontend ofrece el
// flujo completo de self-service", escenario "La solicitud muestra el mismo
// mensaje siempre". Anti-enumeración: el mismo mensaje exista o no el email,
// y el formulario desaparece tras enviarlo.

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OlvidePasswordPage />
    </QueryClientProvider>,
  );
}

async function enviar(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByLabelText(/email/i), email);
  await user.click(screen.getByRole("button", { name: /enviar link/i }));
}

describe("OlvidePasswordPage", () => {
  it("email existente → 204, muestra el mensaje genérico y oculta el formulario", async () => {
    server.use(http.post("/api/auth/forgot-password", () => new HttpResponse(null, { status: 204 })));

    const user = userEvent.setup();
    renderPage();
    await enviar(user, "existe@example.com");

    expect(await screen.findByText(MENSAJE_SOLICITUD_RESET)).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it("email inexistente → mismo 204, mismo mensaje genérico, mismo comportamiento", async () => {
    server.use(http.post("/api/auth/forgot-password", () => new HttpResponse(null, { status: 204 })));

    const user = userEvent.setup();
    renderPage();
    await enviar(user, "no-existe@example.com");

    expect(await screen.findByText(MENSAJE_SOLICITUD_RESET)).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it("muestra un link para volver a /login tras enviar", async () => {
    server.use(http.post("/api/auth/forgot-password", () => new HttpResponse(null, { status: 204 })));

    const user = userEvent.setup();
    renderPage();
    await enviar(user, "existe@example.com");

    await screen.findByText(MENSAJE_SOLICITUD_RESET);
    expect(screen.getByRole("link", { name: /volver a iniciar sesión/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
