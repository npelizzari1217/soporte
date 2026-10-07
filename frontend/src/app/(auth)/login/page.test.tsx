import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import LoginPage from "./page";

// Spec: [R23] BFF login route — página completa: 1 vs varias membresías.

// El login navega con window.location.assign (recarga completa), no router.push.
const assignMock = vi.fn();
const originalLocation = window.location;

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

// AvisoMotivo (WU4) usa useSearchParams(); sin este mock, fuera de un router
// real de Next devuelve null y `.get()` explota.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    assignMock.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "http://localhost:3000/login",
        origin: "http://localhost:3000",
        pathname: "/login",
        assign: assignMock,
        replace: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("single membership → submitting valid credentials redirects to /", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ user: { sub: "1", cliente_id: "c1", rol: "USUARIO", permisos: [], is_global_admin: false, cliente_nombre: "Cliente Uno", membresias: [] } }),
      ),
    );

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
  });

  it("multiple memberships → shows the cliente selector, picking one redirects to /", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({
          needsClienteSelection: true,
          ticket: "tk-1",
          membresias: [
            { cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" },
            { cliente_id: "c2", nombre: "Cliente Dos", rol: "TECNICO" },
          ],
        }),
      ),
      http.post("/api/auth/login/seleccionar", () =>
        HttpResponse.json({ user: { sub: "1", cliente_id: "c2", rol: "TECNICO", permisos: [], is_global_admin: false, cliente_nombre: "Cliente Dos", membresias: [] } }),
      ),
    );

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "multi@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByText("Cliente Uno")).toBeInTheDocument();
    expect(screen.getByText("Cliente Dos")).toBeInTheDocument();
    // The credentials form must no longer be visible during selection.
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cliente dos/i }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
  });

  it("2FA activo → pide el código, lo verifica y entra", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ needs2fa: true, desafio: "ds-1", recordarDisponible: true }),
      ),
      http.post("/api/auth/2fa/verificar", () => HttpResponse.json({ ticket: "tk-9" })),
      http.post("/api/auth/login/continuar", () =>
        HttpResponse.json({ user: { sub: "1", cliente_id: "c1", rol: "USUARIO", permisos: [], is_global_admin: false, cliente_nombre: "Cliente Uno", membresias: [] } }),
      ),
    );

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    const codigo = await screen.findByLabelText(/código de verificación/i);
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
    await user.type(codigo, "123456");
    await user.click(screen.getByLabelText(/recordar este dispositivo/i));
    await user.click(screen.getByRole("button", { name: /verificar/i }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
  });

  it("2FA obligatorio → QR, confirma, muestra los códigos y recién al marcar 'Los guardé' continúa", async () => {
    let continuar: unknown = null;
    server.use(
      http.post("/api/auth/login", () => HttpResponse.json({ needsEnrolamiento2fa: true, desafio: "ds-2" })),
      http.post("/api/auth/2fa/enrolamiento/iniciar", () =>
        HttpResponse.json({ otpauthUri: "otpauth://totp/Soporte:u?secret=JBSWY3DPEHPK3PXP", claveManual: "JBSW Y3DP" }),
      ),
      http.post("/api/auth/2fa/enrolamiento/confirmar", () =>
        HttpResponse.json({ codigosRecuperacion: ["AAAA-BBBB-CCCC", "DDDD-EEEE-FFFF"], ticket: "tk-5" }),
      ),
      http.post("/api/auth/login/continuar", async ({ request }) => {
        continuar = await request.json();
        return HttpResponse.json({
          user: { sub: "1", cliente_id: "c1", rol: "USUARIO", permisos: [], is_global_admin: false, cliente_nombre: "C", membresias: [] },
        });
      }),
    );

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "root@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByRole("img", { name: /qr/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/cargá esta clave/i)).toHaveValue("JBSW Y3DP");
    await user.type(screen.getByLabelText(/código de verificación/i), "123456");
    await user.click(screen.getByRole("button", { name: /activar/i }));

    expect(await screen.findByText("AAAA-BBBB-CCCC")).toBeInTheDocument();
    const continuarBtn = screen.getByRole("button", { name: /continuar/i });
    expect(continuarBtn).toBeDisabled();
    expect(continuar).toBeNull();
    await user.click(screen.getByLabelText(/los guardé/i));
    await user.click(continuarBtn);

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(continuar).toEqual({ ticket: "tk-5" });
  });

  it("Volver en el paso del código regresa a las credenciales", async () => {
    server.use(
      http.post("/api/auth/login", () => HttpResponse.json({ needs2fa: true, desafio: "ds-1", recordarDisponible: true })),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "u@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));
    await user.click(await screen.findByRole("button", { name: /volver/i }));

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });
});
