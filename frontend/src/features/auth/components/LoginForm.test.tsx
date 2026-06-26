/**
 * LoginForm integration tests (RTL + MSW).
 *
 * Tests the connected login behavior: LoginPage wires use-login (useMutation) with LoginForm.
 * MSW intercepts /api/auth/login — apiFetch calls it same-origin (jsdom base http://localhost/).
 *
 * Note on 401 flow: apiFetch triggers a session refresh on any 401 from non-refresh paths.
 * For invalid creds, we also mock /api/auth/refresh → 401 so it short-circuits to a generic error.
 *
 * Spec: [SPEC:frontend-auth/login-exitoso], [SPEC:frontend-auth/creds-invalidas],
 *        [SPEC:frontend-auth/tenant-inactivo], [SPEC:frontend-ui-states/interactive-state LoginForm]
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import LoginPage from "@/app/(auth)/login/page";

// Mock next/navigation so useRouter works in jsdom
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const testUser = {
  sub: "1",
  email: "test@example.com",
  roles: ["USER"],
  permisos: [],
  cliente_id: "c1",
};

/** Fresh QueryClient per test — prevents state leaking between tests */
function renderLogin() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Renders ───────────────────────────────────────────────────────────────

  it('renders email field, password field, and submit button "Iniciar sesión"', () => {
    renderLogin();
    expect(
      screen.getByRole("textbox", { name: /email/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /iniciar sesión/i }),
    ).toBeInTheDocument();
  });

  // ─── Valid credentials: pending state + success ─────────────────────────────

  it("valid creds: button disabled + spinner during pending; fields disabled; no error on success", async () => {
    // Deferred promise to hold the request in-flight so we can observe pending state
    let resolveLogin!: () => void;
    const loginDeferred = new Promise<void>((r) => {
      resolveLogin = r;
    });

    server.use(
      http.post("http://localhost/api/auth/login", async () => {
        await loginDeferred;
        return HttpResponse.json({ user: testUser });
      }),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "test@example.com",
    );
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    // While request is in-flight: button is disabled and spinner (Loader2 SVG) is present
    const submitBtn = screen.getByRole("button", { name: /iniciar sesión/i });
    expect(submitBtn).toBeDisabled();
    expect(submitBtn.querySelector("svg[aria-hidden]")).not.toBeNull();

    // Input fields disabled during pending
    expect(screen.getByRole("textbox", { name: /email/i })).toBeDisabled();
    expect(screen.getByLabelText(/contraseña/i)).toBeDisabled();

    // Resolve the deferred request → mutation succeeds → router.push('/dashboard')
    resolveLogin();
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });

    // No error message visible on success
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // ─── Invalid credentials (401) ─────────────────────────────────────────────

  it("invalid creds (401): error shown, isPending back to false, form stays, no redirect", async () => {
    server.use(
      http.post("http://localhost/api/auth/login", () =>
        HttpResponse.json(
          { statusCode: 401, message: "Credenciales inválidas" },
          { status: 401 },
        ),
      ),
      // apiFetch retries refresh on 401 from non-refresh paths — make it fail cleanly
      http.post("http://localhost/api/auth/refresh", () =>
        new HttpResponse(null, { status: 401 }),
      ),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "wrong@example.com",
    );
    await user.type(screen.getByLabelText(/contraseña/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    // Wait for error to appear (mutation settles)
    const errorMsg = await screen.findByRole("alert");
    expect(errorMsg).toBeInTheDocument();

    // isPending back to false → button enabled
    expect(
      screen.getByRole("button", { name: /iniciar sesión/i }),
    ).not.toBeDisabled();

    // Error text is GENERIC — no "email" or "existe" (no user enumeration)
    expect(errorMsg.textContent).not.toMatch(/email/i);
    expect(errorMsg.textContent).not.toMatch(/existe/i);

    // Form stays rendered (no redirect)
    expect(mockPush).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: /email/i }),
    ).toBeInTheDocument();
  });

  // ─── Tenant suspended (403) ────────────────────────────────────────────────

  it("403: shows tenant-suspended message", async () => {
    server.use(
      http.post("http://localhost/api/auth/login", () =>
        HttpResponse.json(
          { statusCode: 403, message: "Tenant inactivo" },
          { status: 403 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "user@inactive.com",
    );
    await user.type(screen.getByLabelText(/contraseña/i), "password");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    const errorMsg = await screen.findByRole("alert");
    expect(errorMsg).toHaveTextContent(
      "El acceso de tu organización está suspendido",
    );
  });

  // ─── Double-submit prevention ──────────────────────────────────────────────

  it("double-submit prevention: second click while isPending does NOT fire second request", async () => {
    let requestCount = 0;
    let resolveLogin!: () => void;
    const loginDeferred = new Promise<void>((r) => {
      resolveLogin = r;
    });

    server.use(
      http.post("http://localhost/api/auth/login", async () => {
        requestCount++;
        await loginDeferred;
        return HttpResponse.json({ user: testUser });
      }),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "test@example.com",
    );
    await user.type(screen.getByLabelText(/contraseña/i), "password123");

    const submitBtn = screen.getByRole("button", { name: /iniciar sesión/i });
    await user.click(submitBtn); // first click — fires the request

    // Button is disabled while pending
    expect(submitBtn).toBeDisabled();

    // Second click on a disabled button must NOT dispatch a click event
    await user.click(submitBtn);

    // Resolve and confirm exactly 1 request was made
    resolveLogin();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    expect(requestCount).toBe(1);
  });
});
