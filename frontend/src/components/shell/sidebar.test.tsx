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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { JwtPayload } from "@/shared/api/types";

// ── Mocks ───────────────────────────────────────────────────────────────────
// usePathname controls the active-link detection in Sidebar.
// useRouter is needed because UserMenu (rendered in the sidebar footer) calls useRouter.
const mockUsePathname = vi.fn<[], string>(() => "/tickets");
const mockPush = vi.fn();
const mockUseSession = vi.fn<[], { user: JwtPayload | null; isLoading: boolean; can: () => boolean }>(() => ({
  user: null,
  isLoading: false,
  can: () => false,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => mockUseSession(),
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
    // UserMenu renders a button containing the user email
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("john@test.com");
  });
});
