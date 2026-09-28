import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import RestablecerPasswordPage from "./page";

// Spec: sdd/reseteo-contrasena-olvidada — Requirement "El frontend ofrece el
// flujo completo de self-service", escenario "La confirmación valida antes
// de enviar". Design ADR-7 (el token viaja en el fragmento, nunca en el
// query string) y ADR-8 (mensajes de `use-restablecer-password`).

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RestablecerPasswordPage />
    </QueryClientProvider>,
  );
}

async function completarForm(user: ReturnType<typeof userEvent.setup>, password = "nueva12345") {
  await user.type(await screen.findByLabelText(/^nueva contraseña$/i), password);
  await user.type(screen.getByLabelText(/repetir nueva contraseña/i), password);
  await user.click(screen.getByRole("button", { name: /restablecer contraseña/i }));
}

describe("RestablecerPasswordPage", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("sin token en el fragmento → mensaje de link inválido con link a /olvide-password, sin formulario", async () => {
    renderPage();

    expect(await screen.findByText(/no es válido o venció/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pedí un link nuevo/i })).toHaveAttribute(
      "href",
      "/olvide-password",
    );
    expect(screen.queryByLabelText(/^nueva contraseña$/i)).not.toBeInTheDocument();
  });

  it("lee el token del fragmento y lo saca de la barra de direcciones", async () => {
    window.location.hash = "#token=abc123";
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/^nueva contraseña$/i)).toBeInTheDocument());
    expect(window.location.hash).toBe("");
  });

  // La validación local (contraseñas que no coinciden, largo mínimo) se
  // prueba a nivel de componente en `RestablecerPasswordForm.test.tsx`; acá
  // solo el comportamiento propio de la página (token, éxito, 400).

  it("400 del backend → mensaje genérico con link a /olvide-password, el formulario desaparece", async () => {
    server.use(
      http.post("/api/auth/reset-password", () =>
        HttpResponse.json({ statusCode: 400, message: "El link no es válido o venció." }, { status: 400 }),
      ),
    );

    window.location.hash = "#token=abc123";
    const user = userEvent.setup();
    renderPage();
    await completarForm(user);

    expect(await screen.findByText(/no es válido o venció/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pedí un link nuevo/i })).toHaveAttribute(
      "href",
      "/olvide-password",
    );
    expect(screen.queryByLabelText(/^nueva contraseña$/i)).not.toBeInTheDocument();
  });

  it.each([429, 500])(
    "%i del backend → el formulario sigue visible con el mensaje, y reintentar vuelve a enviar",
    async (status) => {
      let intentos = 0;
      server.use(
        http.post("/api/auth/reset-password", () => {
          intentos += 1;
          return intentos === 1
            ? HttpResponse.json({ statusCode: status, message: "x" }, { status })
            : new HttpResponse(null, { status: 204 });
        }),
      );

      window.location.hash = "#token=abc123";
      const user = userEvent.setup();
      renderPage();
      await completarForm(user);

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByLabelText(/^nueva contraseña$/i)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /pedí un link nuevo/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /restablecer contraseña/i }));
      expect(await screen.findByText(/restableciste tu contraseña/i)).toBeInTheDocument();
      expect(intentos).toBe(2);
    },
  );

  it("204 del backend → estado de éxito con link a /login", async () => {
    server.use(http.post("/api/auth/reset-password", () => new HttpResponse(null, { status: 204 })));

    window.location.hash = "#token=abc123";
    const user = userEvent.setup();
    renderPage();
    await completarForm(user);

    expect(await screen.findByText(/restableciste tu contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ir a iniciar sesión/i })).toHaveAttribute("href", "/login");
  });
});
