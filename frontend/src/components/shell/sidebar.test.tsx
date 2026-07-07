/**
 * T2.1 · TEST RED — Sidebar component
 *
 * Contract under test:
 * - 4 navigation links (Tickets, Compras, Reparaciones, Equipos) with correct hrefs
 * - Each link contains a Lucide icon with aria-hidden="true"
 * - Active state: aria-current="page" on the link whose href pathname starts with
 * - Accessible nav landmark: <nav aria-label="Navegación principal">
 * - List structure: <ul>/<li> inside the nav
 * - Tenant display (header — read-only):
 *     · No session user  → shows brand "Soporte"
 *     · Session user     → shows uppercase initial from email
 *     · No buttons/selects/comboboxes in the header
 * - UserMenu rendered in sidebar footer (needs a session user to render)
 *
 * Spec: [SPEC:frontend-shell/req 1 sidebar w-72], [SPEC:frontend-shell/req 3 nav 4 secciones],
 *       [SPEC:frontend-shell/req 4 tenant display], [SPEC:frontend-shell/req 7 accesibilidad]
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { JwtPayload } from "@/shared/api/types";
import { TenantContext } from "@/shared/providers/tenant-context";

// ── Mocks ───────────────────────────────────────────────────────────────────
// usePathname controls the active-link detection in Sidebar.
// useRouter is needed because UserMenu (rendered in the sidebar footer) calls useRouter.
const mockUsePathname = vi.fn<() => string>(() => "/tickets");
const mockPush = vi.fn();
const mockUseSession = vi.fn<
  () => { user: JwtPayload | null; isLoading: boolean; can: () => boolean; isGlobalAdmin?: boolean }
>(() => ({
  user: null,
  isLoading: false,
  can: () => false,
  isGlobalAdmin: false,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

// ClienteSelector/CicloSelector fetch data via TanStack Query (useClientes/useCiclos)
// and read TenantContext — irrelevant to Sidebar's own conditional-rendering logic,
// which is what this suite tests. Both components already have dedicated test suites
// (ClienteSelector.test.tsx, CicloSelector.test.tsx) covering their fetch/skeleton/cascade
// behavior. Stubbing them here keeps this suite atomic (no QueryClientProvider/MSW needed).
vi.mock("@/features/admin/components/ClienteSelector", () => ({
  ClienteSelector: () => <div data-testid="cliente-selector-stub" />,
}));
vi.mock("@/features/admin/components/CicloSelector", () => ({
  CicloSelector: () => <div data-testid="ciclo-selector-stub" />,
}));

// Import after mocks (vi.mock is hoisted, but imports below are resolved after hoisting)
import { Sidebar } from "./sidebar";

// ── Fixtures ─────────────────────────────────────────────────────────────────
const MOCK_USER: JwtPayload = {
  email: "john@test.com",
  sub: "user-1",
  cliente_id: "cliente-1",
  roles: [],
  permisos: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Sidebar", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/tickets");
    mockUseSession.mockReturnValue({ user: null, isLoading: false, can: () => false });
    mockPush.mockClear();
  });

  // ── Navigation links ───────────────────────────────────────────────────────

  it("renders exactly 4 links inside the nav landmark", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
  });

  it("links have the correct hrefs and labels", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(nav).getByRole("link", { name: /tickets/i })).toHaveAttribute("href", "/tickets");
    expect(within(nav).getByRole("link", { name: /compras/i })).toHaveAttribute("href", "/compras");
    expect(within(nav).getByRole("link", { name: /reparaciones/i })).toHaveAttribute("href", "/reparaciones");
    expect(within(nav).getByRole("link", { name: /equipos/i })).toHaveAttribute("href", "/equipos");
  });

  it("each link contains an aria-hidden SVG icon", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    within(nav)
      .getAllByRole("link")
      .forEach((link) => {
        // Lucide icons render as SVG with aria-hidden="true" by default
        const svg = link.querySelector("svg[aria-hidden='true']");
        expect(svg, `Link "${link.textContent?.trim()}" must contain an aria-hidden SVG`).not.toBeNull();
      });
  });

  it("active link (/tickets) gets aria-current='page', others do not", () => {
    mockUsePathname.mockReturnValue("/tickets");
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(nav).getByRole("link", { name: /tickets/i })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /compras/i })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: /reparaciones/i })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: /equipos/i })).not.toHaveAttribute("aria-current");
  });

  it("active link changes when pathname changes (/compras)", () => {
    mockUsePathname.mockReturnValue("/compras");
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(nav).getByRole("link", { name: /compras/i })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /tickets/i })).not.toHaveAttribute("aria-current");
  });

  it("nav landmark has aria-label='Navegación principal'", () => {
    render(<Sidebar />);
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
  });

  it("links are inside a <ul>/<li> structure", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    const list = within(nav).getByRole("list");
    expect(list.tagName.toLowerCase()).toBe("ul");
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });

  it("aside has glassmorphism backdrop-blur (premium §3)", () => {
    render(<Sidebar />);
    const aside = document.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside!.className).toContain("backdrop-blur-sm");
  });

  // ── Tenant display (header — read-only) ────────────────────────────────────

  it("shows brand 'Soporte' when no session user", () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false, can: () => false });
    render(<Sidebar />);
    expect(screen.getByText("Soporte")).toBeInTheDocument();
  });

  it("shows uppercase initial from email when session user is present", () => {
    mockUseSession.mockReturnValue({ user: MOCK_USER, isLoading: false, can: () => false });
    render(<Sidebar />);
    // john@test.com → initial "J"
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("header has no interactive elements (tenant display is read-only)", () => {
    render(<Sidebar />);
    // The <aside> root → <header> is the first child (tenant display section)
    const sidebarEl = document.querySelector("aside");
    expect(sidebarEl).not.toBeNull();
    const headerEl = sidebarEl!.querySelector("header");
    expect(headerEl).not.toBeNull();
    expect(headerEl!.querySelector("button")).toBeNull();
    expect(headerEl!.querySelector("select")).toBeNull();
    expect(headerEl!.querySelector('[role="combobox"]')).toBeNull();
  });

  // ── UserMenu in footer ────────────────────────────────────────────────────

  it("UserMenu is rendered in the sidebar footer (shows user email button)", () => {
    // UserMenu returns null when user is null — provide a real user to make it render
    mockUseSession.mockReturnValue({ user: MOCK_USER, isLoading: false, can: () => false });
    render(<Sidebar />);
    // UserMenu renders a button containing the user email. Scoped by name
    // because the footer now also contains the ThemeToggle icon button
    // (theme-toggle change).
    const btn = screen.getByRole("button", { name: /john@test\.com/i });
    expect(btn).toHaveTextContent("john@test.com");
  });

  it("renders ThemeToggle in the sidebar footer alongside UserMenu", () => {
    mockUseSession.mockReturnValue({ user: MOCK_USER, isLoading: false, can: () => false });
    render(<Sidebar />);
    // ThemeToggle falls back to the default (no ThemeProvider wrapping this
    // test) — theme: 'dark' — so it renders the Sun icon / "día" label.
    expect(screen.getByRole("button", { name: /cambiar a modo día/i })).toBeInTheDocument();
  });

  // ── Tenant display: cliente_nombre claim (auth-cliente-nombre) ────────────

  it("muestra cliente_nombre cuando está presente", () => {
    const BASE_USER = { sub: "u1", cliente_id: "c1", email: "juan@ejemplo.com", roles: [], permisos: [] };
    mockUseSession.mockReturnValue({
      user: { ...BASE_USER, cliente_nombre: "Acme Corp" },
      isLoading: false,
      can: () => false,
    });
    render(<Sidebar />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.queryByText("Soporte")).not.toBeInTheDocument();
  });

  it("muestra fallback 'Soporte' cuando cliente_nombre está ausente", () => {
    const BASE_USER = { sub: "u1", cliente_id: "c1", email: "juan@ejemplo.com", roles: [], permisos: [] };
    mockUseSession.mockReturnValue({ user: { ...BASE_USER }, isLoading: false, can: () => false });
    render(<Sidebar />);
    expect(screen.getByText("Soporte")).toBeInTheDocument();
  });

  it("muestra fallback 'Soporte' cuando cliente_nombre es string vacío", () => {
    const BASE_USER = { sub: "u1", cliente_id: "c1", email: "juan@ejemplo.com", roles: [], permisos: [] };
    mockUseSession.mockReturnValue({
      user: { ...BASE_USER, cliente_nombre: "" },
      isLoading: false,
      can: () => false,
    });
    render(<Sidebar />);
    expect(screen.getByText("Soporte")).toBeInTheDocument();
    // SVG icons match queryByText("") due to empty textContent — scope to <span> only
    expect(screen.queryByText("", { selector: "span" })).not.toBeInTheDocument();
  });

  it("el avatar con la inicial del email sigue presente cuando hay cliente_nombre", () => {
    const BASE_USER = { sub: "u1", cliente_id: "c1", email: "juan@ejemplo.com", roles: [], permisos: [] };
    mockUseSession.mockReturnValue({
      user: { ...BASE_USER, cliente_nombre: "Acme Corp" },
      isLoading: false,
      can: () => false,
    });
    render(<Sidebar />);
    expect(screen.getByText("J")).toBeInTheDocument(); // inicial de 'juan@ejemplo.com'
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("no renderiza el string 'undefined' en ningún caso", () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false, can: () => false });
    render(<Sidebar />);
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  // ── ADMINISTRACIÓN section (admin-general PR5b — T5.12) ─────────────────────
  //
  // Sidebar dinámico por rol, detrás del feature flag NEXT_PUBLIC_ADMIN_PANEL.
  // Spec: [SPEC:admin-ui/Sección ADMINISTRACIÓN en sidebar condicional por nivel]

  describe("sección ADMINISTRACIÓN (feature-flagged)", () => {
    const OPERADOR: JwtPayload = {
      sub: "op-1",
      cliente_id: "home",
      email: "operador@sesitec.com.ar",
      roles: [],
      permisos: [],
      is_global_admin: true,
    };

    const ADMIN_CLIENTE: JwtPayload = {
      sub: "admin-1",
      cliente_id: "cliente-1",
      email: "admin@cliente.com",
      roles: ["ADMINISTRADOR"],
      permisos: [],
      is_global_admin: false,
    };

    const USUARIO: JwtPayload = {
      sub: "user-1",
      cliente_id: "cliente-1",
      email: "user@cliente.com",
      roles: ["USUARIO"],
      permisos: [],
      is_global_admin: false,
    };

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("operador global ve Clientes, Ciclos, Usuarios, Reportes en orden, antes de la sección operativa", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, can: () => false, isGlobalAdmin: true });
      render(<Sidebar />);

      const nav = screen.getByRole("navigation", { name: "Navegación principal" });
      const linkTexts = within(nav).getAllByRole("link").map((l) => l.textContent?.trim());
      expect(linkTexts).toEqual([
        "Clientes", "Ciclos", "Usuarios", "Reportes",
        "Tickets", "Compras", "Reparaciones", "Equipos",
      ]);
    });

    it("ADMINISTRADOR (is_global_admin=false) ve Ciclos, Usuarios, Reportes sin Clientes", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUseSession.mockReturnValue({ user: ADMIN_CLIENTE, isLoading: false, can: () => false, isGlobalAdmin: false });
      render(<Sidebar />);

      const nav = screen.getByRole("navigation", { name: "Navegación principal" });
      const linkTexts = within(nav).getAllByRole("link").map((l) => l.textContent?.trim());
      expect(linkTexts).toEqual([
        "Ciclos", "Usuarios", "Reportes",
        "Tickets", "Compras", "Reparaciones", "Equipos",
      ]);
      expect(screen.queryByRole("link", { name: "Clientes" })).toBeNull();
    });

    it("USUARIO no ve sección ADMINISTRACIÓN ni divider; 4 ítems operativos intactos (no-regression)", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUseSession.mockReturnValue({ user: USUARIO, isLoading: false, can: () => false, isGlobalAdmin: false });
      render(<Sidebar />);

      expect(screen.queryByText("Administración")).toBeNull();
      expect(screen.queryByTestId("admin-divider")).toBeNull();
      const nav = screen.getByRole("navigation", { name: "Navegación principal" });
      expect(within(nav).getAllByRole("link")).toHaveLength(4);
    });

    it("ítem activo en ADMINISTRACIÓN recibe aria-current='page' y es el único", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUsePathname.mockReturnValue("/admin/ciclos");
      mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, can: () => false, isGlobalAdmin: true });
      render(<Sidebar />);

      const nav = screen.getByRole("navigation", { name: "Navegación principal" });
      const active = within(nav)
        .getAllByRole("link")
        .filter((l) => l.getAttribute("aria-current") === "page");
      expect(active).toHaveLength(1);
      expect(active[0]).toHaveTextContent("Ciclos");
    });

    it("label ADMINISTRACIÓN usa uppercase text-xs tracking-wider (design system)", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, can: () => false, isGlobalAdmin: true });
      render(<Sidebar />);

      const label = screen.getByText("Administración");
      expect(label.className).toContain("text-xs");
      expect(label.className).toContain("tracking-wider");
      expect(label.className).toContain("uppercase");
    });

    it("el divider entre ADMINISTRACIÓN y la sección operativa es ultra-fino", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, can: () => false, isGlobalAdmin: true });
      render(<Sidebar />);

      const divider = screen.getByTestId("admin-divider");
      expect(divider.className).toContain("border-t");
    });

    it("sin NEXT_PUBLIC_ADMIN_PANEL, el sidebar es igual al actual (no-regression), incluso para operador global", () => {
      // Env var deliberately NOT stubbed → falsy/undefined, gate closed.
      mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, can: () => false, isGlobalAdmin: true });
      render(<Sidebar />);

      expect(screen.queryByText("Administración")).toBeNull();
      expect(screen.queryByTestId("admin-divider")).toBeNull();
      expect(screen.queryByTestId("cliente-selector-stub")).toBeNull();
      expect(screen.queryByTestId("ciclo-selector-stub")).toBeNull();
      const nav = screen.getByRole("navigation", { name: "Navegación principal" });
      expect(within(nav).getAllByRole("link")).toHaveLength(4);
    });

    it("renderiza ClienteSelector y CicloSelector para el operador global cuando el flag está activo", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, can: () => false, isGlobalAdmin: true });
      render(<Sidebar />);

      expect(screen.getByTestId("cliente-selector-stub")).toBeInTheDocument();
      expect(screen.getByTestId("ciclo-selector-stub")).toBeInTheDocument();
    });

    it("no renderiza los selectores para un usuario operativo", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUseSession.mockReturnValue({ user: USUARIO, isLoading: false, can: () => false, isGlobalAdmin: false });
      render(<Sidebar />);

      expect(screen.queryByTestId("cliente-selector-stub")).toBeNull();
      expect(screen.queryByTestId("ciclo-selector-stub")).toBeNull();
    });

    // ── Nav operativa deshabilitada sin cliente seleccionado (T5.16-T5.17) ──
    //
    // Spec: [SPEC:admin-ui/Estado "Elegí un cliente" — nav operativa deshabilitada]
    // Sidebar reads TenantContext.clienteId (default context value if no Provider
    // wraps it, matching the operador's real initial state — see tenant-context.tsx).

    it("deshabilita visualmente la nav operativa cuando el operador no eligió cliente", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, can: () => false, isGlobalAdmin: true });
      // No TenantContext.Provider wrapping → default value clienteId: null.
      render(<Sidebar />);

      const nav = screen.getByRole("navigation", { name: "Navegación principal" });
      const ticketsLink = within(nav).getByText("Tickets").closest("a")!;
      expect(ticketsLink).toHaveAttribute("aria-disabled", "true");
      expect(ticketsLink).toHaveAttribute("tabindex", "-1");
    });

    it("habilita la nav operativa una vez que el operador eligió un cliente", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, can: () => false, isGlobalAdmin: true });
      render(
        <TenantContext.Provider
          value={{
            clienteId: "cliente-a",
            clienteNombre: "Acme Corp",
            cicloId: null,
            cicloNombre: null,
            setCliente: () => {},
            setCiclo: () => {},
          }}
        >
          <Sidebar />
        </TenantContext.Provider>,
      );

      const nav = screen.getByRole("navigation", { name: "Navegación principal" });
      const ticketsLink = within(nav).getByText("Tickets").closest("a")!;
      expect(ticketsLink).not.toHaveAttribute("aria-disabled");
    });

    it("no deshabilita la nav operativa para ADMINISTRADOR (siempre tiene tenant resuelto)", () => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_PANEL", "true");
      mockUseSession.mockReturnValue({ user: ADMIN_CLIENTE, isLoading: false, can: () => false, isGlobalAdmin: false });
      render(<Sidebar />);

      const nav = screen.getByRole("navigation", { name: "Navegación principal" });
      const ticketsLink = within(nav).getByText("Tickets").closest("a")!;
      expect(ticketsLink).not.toHaveAttribute("aria-disabled");
    });

    it("sin feature flag, la nav operativa nunca se deshabilita (no-regression)", () => {
      // Flag NOT stubbed → gate closed entirely, even for operador sin cliente.
      mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, can: () => false, isGlobalAdmin: true });
      render(<Sidebar />);

      const nav = screen.getByRole("navigation", { name: "Navegación principal" });
      const ticketsLink = within(nav).getByText("Tickets").closest("a")!;
      expect(ticketsLink).not.toHaveAttribute("aria-disabled");
    });
  });
});
